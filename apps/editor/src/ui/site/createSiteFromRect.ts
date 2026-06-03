// A.7.c.x — Site console / L5 dispatch helper (the typology-agnostic site slice).
//
// WHY THIS EXISTS
// ---------------
// The C19 Site substrate is production-real: schemas (`@pryzm/schemas/site`), the
// reactive `SiteModelStore` (wired into composeRuntime as `runtime.siteModelStore`),
// and the PURE `site.*` command handlers (`@pryzm/stores` — `siteCreate`,
// `siteSetParcelBoundary`, `siteUpdateLocation`). What is MISSING (per the
// RAC→SITE→DESIGN plan §2.1 / §4 P0) is the **L5 dispatch adapter**: the editor-side
// glue that runs those pure handlers against `runtime.siteModelStore`, emits the
// resulting domain events on the runtime event bus, and surfaces a toast.
//
// DISPATCH MECHANISM (audited 2026-06-03)
// ---------------------------------------
// The `site.*` handlers are NOT registered on the command bus anywhere in the repo
// (`site.create` / `site.setParcelBoundary` appear only in the pure handler tests,
// never in `runtime.bus.executeCommand(...)`). The handlers' own barrel header
// (`packages/stores/src/site-commands/index.ts`) states the intended contract:
//   "Pure functions: (payload, store) → SiteCommandResult<Event>. The L5 adapter
//    (command-bus wiring + OTel span + LTP-ENU rebase + domain event emit) lives
//    elsewhere (apps/editor or runtime-composer) and composes against these."
// So this helper IS that L5 adapter for the create+location+boundary path: it calls
// the pure handlers directly with `runtime.siteModelStore`, then emits each
// returned domain event on `runtime.events`. (When the full bus-registered site
// command surface lands, this helper should switch to `runtime.bus.executeCommand`.)
//
// TYPOLOGY-AGNOSTIC
// -----------------
// Everything here is site-layer only — Site + Location + ParcelBoundary. No
// apartment/house/office knowledge. Any typology Pack consumes the same Site.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    siteCreate,
    siteUpdateLocation,
    siteSetParcelBoundary,
    type SiteModelStore,
} from '@pryzm/stores';

/** A point on the (x,z) ground plane in scene metres. */
interface XZPoint {
    readonly x: number;
    readonly z: number;
}

export interface CreateSiteFromRectOptions {
    /** Free-form postal address (PII per C22) — stored on the Site location. */
    readonly address?: string;
    /** Rectangle width in metres (X axis). Default 20 m. */
    readonly width?: number;
    /** Rectangle depth in metres (Z axis). Default 16 m. */
    readonly depth?: number;
    /** WGS84 latitude (decimal degrees). Default 0. */
    readonly lat?: number;
    /** WGS84 longitude (decimal degrees). Default 0. */
    readonly lon?: number;
}

const DEFAULT_WIDTH_M = 20;
const DEFAULT_DEPTH_M = 16;

/**
 * Build a centred axis-aligned rectangle parcel boundary on the (x,z) ground
 * plane, wound clockwise from the front-left corner. The four edges are
 * classified front / side / rear / side so the C19 §2.7 invariant-3 check
 * (`edgeClassifications.length === polygon.length`) passes and the per-edge
 * setback compliance check has data.
 *
 *   front  = the −Z edge (point 0 → point 1)
 *   side   = the +X edge (point 1 → point 2)
 *   rear   = the +Z edge (point 2 → point 3)
 *   side   = the −X edge (point 3 → point 0)
 *
 * No duplicate closing point — the polygon is implicitly closed (last → first),
 * matching `ParcelBoundarySchema` (a polygon of distinct vertices).
 */
function rectangleBoundary(width: number, depth: number): {
    polygon: XZPoint[];
    edgeClassifications: ('front' | 'side' | 'rear')[];
} {
    const hw = width / 2;
    const hd = depth / 2;
    return {
        polygon: [
            { x: -hw, z: -hd }, // front-left
            { x: hw, z: -hd },  // front-right
            { x: hw, z: hd },   // rear-right
            { x: -hw, z: hd },  // rear-left
        ],
        edgeClassifications: ['front', 'side', 'rear', 'side'],
    };
}

/**
 * Create a Site for the active project, set its location (address/lat/lon), and
 * author a rectangular parcel boundary — all via the pure `site.*` handlers,
 * emitting each domain event on the runtime bus. Resolves the runtime from the
 * argument or `window.runtime`.
 *
 * This is the minimal vertical slice's "stub GIS" entry point: it lets the
 * RAC→site→apartment journey run end-to-end from the console before any real
 * geocode/draw UI exists (the rectangle stands in for a drawn boundary).
 */
export function createSiteFromRect(
    runtimeArg: PryzmRuntime | null | undefined,
    opts: CreateSiteFromRectOptions = {},
): boolean {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };

    console.log('[site] createSiteFromRect invoked', opts);

    if (!rt) {
        console.warn('[site] no runtime — open a project first (or pass runtime explicitly).');
        return false;
    }

    const store = rt.siteModelStore as SiteModelStore | undefined;
    if (!store) {
        console.warn('[site] runtime.siteModelStore is undefined — the running composeRuntime predates the C19 site substrate. Restart the dev server (npm run dev).');
        toast('Site store unavailable — restart the dev server (npm run dev).', 'error');
        return false;
    }

    const projectId = rt.audit?.projectId;
    if (!projectId) {
        console.warn('[site] no active project (runtime.audit.projectId empty) — open/create a project first.');
        toast('No active project — open or create a project first.', 'error');
        return false;
    }

    const width = opts.width ?? DEFAULT_WIDTH_M;
    const depth = opts.depth ?? DEFAULT_DEPTH_M;
    const lat = opts.lat ?? 0;
    const lon = opts.lon ?? 0;
    const address = opts.address ?? null;

    console.log(`[site] projectId=${projectId} rect=${width}×${depth}m lat=${lat} lon=${lon} address=${address ?? '(none)'}`);

    // 1) site.create — idempotent (deterministic site_<projectId> id). We create
    //    with an EMPTY parcel + the location, then author the boundary in step 3
    //    via the one-shot site.setParcelBoundary (mirrors the GIS draw flow:
    //    create-then-draw). The location carries the address/lat/lon up front.
    const createRes = siteCreate(
        {
            projectId,
            location: {
                latitude: lat,
                longitude: lon,
                siteAddress: address,
            },
        },
        store,
    );
    if (!createRes.ok) {
        console.error('[site] site.create rejected:', createRes.reason, createRes.message);
        toast(`Site create failed: ${createRes.message}`, 'error');
        return false;
    }
    console.log('[site] site.created', createRes.event);
    rt.events?.emit('site.created', createRes.event);
    const siteId = createRes.event.siteId;

    // 2) site.updateLocation — idempotent re-affirmation of address/lat/lon.
    //    site.create already set the location, but we route it through the
    //    dedicated location command so the location-change event fires (the
    //    seam a future LTPENURebase.setOrigin hooks per C12/C19 §1.3).
    //    NOTE (simplification): this slice does NOT yet call
    //    LTPENURebase.setOrigin — that is the A.8.a geocode-wiring follow-up.
    const locRes = siteUpdateLocation(
        {
            siteId,
            location: {
                latitude: lat,
                longitude: lon,
                siteAddress: address,
            },
        },
        store,
    );
    if (locRes.ok) {
        console.log('[site] site.location-changed', locRes.event);
        rt.events?.emit('site.location-changed', locRes.event);
    } else {
        // Non-fatal — location was already set on create.
        console.warn('[site] site.updateLocation soft-reject:', locRes.reason, locRes.message);
    }

    // 3) site.setParcelBoundary — one-shot rectangular polygon (§1.4 immutable
    //    post-set). This is exactly the command the GIS polygon-draw tool (A.8.c)
    //    will dispatch; here the rectangle stands in for a drawn boundary.
    const rect = rectangleBoundary(width, depth);
    const boundaryRes = siteSetParcelBoundary(
        { siteId, boundary: rect },
        store,
    );
    if (!boundaryRes.ok) {
        console.error('[site] site.setParcelBoundary rejected:', boundaryRes.reason, boundaryRes.message);
        toast(`Set parcel boundary failed: ${boundaryRes.message}`, 'error');
        return false;
    }
    console.log('[site] site.parcel-boundary-set', boundaryRes.event, 'area(m²)=', boundaryRes.event.area);
    rt.events?.emit('site.parcel-boundary-set', boundaryRes.event);

    toast(
        `Site ready — ${width}×${depth} m parcel (${boundaryRes.event.area.toFixed(0)} m²). ` +
        `Run pryzmGenerateApartmentFromBoundary() to generate.`,
        'success',
    );
    console.log('[site] createSiteFromRect complete — siteId=', siteId);
    return true;
}
