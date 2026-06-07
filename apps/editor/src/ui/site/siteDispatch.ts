// A.8.a / A.8.c — shared L5 site-dispatch helpers.
//
// WHY THIS EXISTS
// ---------------
// `createSiteFromRect.ts` (A.7.c.x) is the stub-GIS console path: it inlines
// site.create + site.updateLocation + site.setParcelBoundary against
// `runtime.siteModelStore`. The REAL GIS authoring surfaces (the geocode search
// box A.8.a + the polygon-draw tool A.8.c) need the SAME pure-handler dispatch
// path but from interactive UI, and they author location + boundary
// INDEPENDENTLY (geocode sets location; draw sets boundary) rather than in one
// shot. This module factors the dispatch glue so both surfaces share it without
// duplicating the create/emit/toast boilerplate.
//
// Same contract as createSiteFromRect's header: the `site.*` handlers are pure
// `(payload, store) → result`; this is the L5 adapter that runs them against
// `runtime.siteModelStore`, emits the domain event on `runtime.events`, and
// surfaces a toast. When the full bus-registered site command surface lands,
// these switch to `runtime.bus.executeCommand`.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    siteCreate,
    siteUpdateLocation,
    siteSetParcelBoundary,
    type SiteModelStore,
} from '@pryzm/stores';
import type { ParcelEdgeClassification } from '@pryzm/schemas';
import { GeospatialAdapter } from '@pryzm/geospatial';

// ── FORMA.4 / C19 §1.3 — LTP-ENU origin rebase at the draw surface ───────────
//
// C19 §1.3 requires `site.updateLocation` to set the LTP-ENU frame origin to the
// real site lat/lon (this is what makes 3D real-world placement accurate). The
// editor runtime's `geospatial` slot is a stub (throws), and `LTPENURebase` was
// never instantiated at this surface — the documented follow-up that this wires.
//
// We keep ONE process-wide `GeospatialAdapter` (it bundles proj4 + LTPENURebase
// and exposes `setOrigin`). The UTM CRS is derived from the site longitude the
// FIRST time an origin is set; thereafter `setOrigin` just moves the origin.
//
// BOUNDARY-SHIFT HAZARD (task #3) — analysis:
//   The draw surface projects the boundary via `boundaryProjection.latLonToSceneXZ`
//   which takes the origin as an EXPLICIT ARGUMENT at commit time and bakes XZ
//   relative to it (see boundaryProjection.ts + SiteBoundaryDrawTool.commit()).
//   It does NOT read this shared adapter. So `setOrigin` here CANNOT retroactively
//   move an already-drawn boundary's XZ — the two are decoupled by construction.
//   The real (pre-existing, orthogonal) risk is SEMANTIC: if a boundary was
//   already projected about origin A and we now rebase the ENU frame to a
//   DIFFERENT origin B, the committed XZ no longer shares the frame's origin.
//   To stay safe + deterministic we therefore set the origin ONLY WHEN NO PARCEL
//   BOUNDARY EXISTS YET. Once a boundary is committed the origin is frozen to the
//   frame that boundary was projected in (the boundary-draw tool always records
//   its projection origin as the Site location first, so they already agree).
//   When a boundary already exists we skip the rebase and log the choice.
let _ltpAdapter: GeospatialAdapter | null = null;
/** §CESIUM-SITE-ORIGIN — the lat/lon of the current LTP-ENU origin, recorded
 *  whenever it is set. CesiumViewport reads this as a RELIABLE fallback when
 *  `runtime.siteModelStore.getLocation()` is null at mount: the origin is set
 *  during onboarding BEFORE Cesium mounts in the GIS handoff, so Cesium's own
 *  store-read AND its late `site.location-changed` subscription both miss it —
 *  which is why the Forma view framed the Sydney default instead of the plot. */
let _lastSiteOrigin: { lat: number; lon: number } | null = null;

/** §CESIUM-SITE-ORIGIN — the current site origin lat/lon, or null if none set. */
export function getCurrentSiteOrigin(): { lat: number; lon: number } | null {
    return _lastSiteOrigin ? { ..._lastSiteOrigin } : null;
}

/** Derive a Proj4 UTM string for the given longitude (zones are 6° wide). */
function utmProj4StringForLon(lat: number, lon: number): string {
    const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
    const south = lat < 0 ? ' +south' : '';
    return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

/**
 * C19 §1.3 — set the LTP-ENU frame origin to the real site lat/lon, but ONLY when
 * no parcel boundary has been committed yet (see the boundary-shift hazard note
 * above). Idempotent + fully guarded — never throws into the dispatch path.
 */
function setLtpOriginIfSafe(ctx: SiteContext, lat: number, lon: number): void {
    try {
        // A 0/0 location is the `ensureSite` placeholder — not a real origin.
        if (lat === 0 && lon === 0) return;

        const boundary = ctx.store.getParcelBoundary?.();
        if (boundary && Array.isArray(boundary.polygon) && boundary.polygon.length >= 3) {
            console.log(
                '[gis] LTPENURebase.setOrigin SKIPPED — a parcel boundary is already committed; ' +
                'keeping the origin the boundary was projected in (C19 §1.3 boundary-shift guard).',
            );
            return;
        }

        if (!_ltpAdapter) {
            _ltpAdapter = new GeospatialAdapter({
                proj4String: utmProj4StringForLon(lat, lon),
                origin: { lat, lon, elev: 0 },
            });
            console.log(`[gis] LTPENURebase origin set (first) → LAT ${lat} LON ${lon} (C19 §1.3).`);
        } else {
            _ltpAdapter.setOrigin(lat, lon, 0);
            console.log(`[gis] LTPENURebase.setOrigin → LAT ${lat} LON ${lon} (C19 §1.3).`);
        }
        _lastSiteOrigin = { lat, lon }; // §CESIUM-SITE-ORIGIN — for the Cesium fallback read.
    } catch (e) {
        // Origin-rebase is best-effort site intelligence; never block the location
        // dispatch (the lat/lon is still recorded on the Site for IFC export).
        console.warn('[gis] LTPENURebase.setOrigin failed (non-fatal):', e);
    }
}

/** A point on the (x,z) ground plane in scene metres. */
export interface XZPoint {
    readonly x: number;
    readonly z: number;
}

export type ToastFn = (message: string, severity: 'info' | 'success' | 'error') => void;

export interface SiteContext {
    readonly rt: PryzmRuntime;
    readonly store: SiteModelStore;
    readonly projectId: string;
    readonly toast: ToastFn;
}

/**
 * Resolve the runtime + site store + active project, returning a `SiteContext`
 * or null (with a toast/log) if any precondition is unmet. Shared by every GIS
 * authoring surface so the "no runtime / no store / no project" diagnostics are
 * identical everywhere.
 */
export function resolveSiteContext(
    runtimeArg?: PryzmRuntime | null,
): SiteContext | null {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast: ToastFn = (message, severity) => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };

    if (!rt) {
        console.warn('[gis] no runtime — open a project first (or pass runtime explicitly).');
        return null;
    }
    const store = rt.siteModelStore as SiteModelStore | undefined;
    if (!store) {
        console.warn('[gis] runtime.siteModelStore is undefined — restart the dev server (npm run dev).');
        toast('Site store unavailable — restart the dev server (npm run dev).', 'error');
        return null;
    }
    // §A.21.D39(#7) — resolve the active project id from MULTIPLE sources, not just
    // `runtime.audit.projectId`. The Site aggregate's deterministic id is
    // `site_<projectId>`, so an empty projectId here means the climate-keying
    // auto-create in `ensureSiteClimate` silently bails → the wind rose + 3D
    // wind/heat overlays sit on "No wind data" forever on the generate-house →
    // Forma flow (the house demo path doesn't always populate `audit.projectId`,
    // but `runtime.projectContext` / `window.projectContext` always carry it).
    const projectId = resolveActiveProjectId(rt);
    if (!projectId) {
        console.warn('[gis] no active project (no projectId on audit / projectContext) — open/create a project first.');
        toast('No active project — open or create a project first.', 'error');
        return null;
    }
    return { rt, store, projectId, toast };
}

/**
 * Resolve the active project id from the most-reliable source available.
 * Order: `runtime.audit.projectId` → `runtime.projectContext.projectId` →
 * `window.projectContext.projectId`. The Site id is deterministic
 * (`site_<projectId>`), so this MUST be consistent everywhere a Site is created
 * or read — using a different source per call site produces two Sites and the
 * climate dataset keys to the wrong one (§A.21.D39(#7)).
 */
function resolveActiveProjectId(rt: PryzmRuntime): string | null {
    const auditPid = rt.audit?.projectId;
    if (typeof auditPid === 'string' && auditPid.length > 0) return auditPid;
    const ctxPid = rt.projectContext?.projectId;
    if (typeof ctxPid === 'string' && ctxPid.length > 0) return ctxPid;
    try {
        const winPid = (window as unknown as { projectContext?: { projectId?: string | null } })
            .projectContext?.projectId;
        if (typeof winPid === 'string' && winPid.length > 0) return winPid;
    } catch { /* no window / no projectContext */ }
    return null;
}

/**
 * Ensure a Site exists for the active project, returning its id. Idempotent —
 * `site.create` uses a deterministic `site_<projectId>` id, so re-issuing is
 * safe. If a Site already exists, returns its id without re-creating.
 *
 * @param location  optional initial location to seed on first create.
 */
export function ensureSite(
    ctx: SiteContext,
    location?: { latitude: number; longitude: number; siteAddress?: string | null },
): string | null {
    const existing = ctx.store.getSite();
    if (existing) return existing.id;

    // `location` is a required key on SiteCreatePayloadSchema (its inner fields
    // default, but the object itself is not optional) — supply a 0/0 location
    // when the caller has none yet (e.g. boundary-draw before a geocode search).
    const seedLocation = location ?? { latitude: 0, longitude: 0, siteAddress: null };
    const createRes = siteCreate(
        {
            projectId: ctx.projectId,
            location: seedLocation,
        },
        ctx.store,
    );
    if (!createRes.ok) {
        console.error('[gis] site.create rejected:', createRes.reason, createRes.message);
        ctx.toast(`Site create failed: ${createRes.message}`, 'error');
        return null;
    }
    console.log('[gis] site.created', createRes.event);
    ctx.rt.events?.emit('site.created', createRes.event);
    return createRes.event.siteId;
}

/**
 * Set the Site location (lat/lon + optional address) via the pure
 * `site.updateLocation` handler, emitting `site.location-changed`. Creates the
 * Site first if it does not exist yet. Returns true on success.
 *
 * C19 §1.3 (FORMA.4 precondition): the LTP-ENU frame origin is now rebased to the
 * real site lat/lon SYNCHRONOUSLY before `site.location-changed` emits, via
 * `setLtpOriginIfSafe` — this is what makes the Cesium 3D placement real-world
 * accurate. The rebase is guarded to run only when no parcel boundary exists yet
 * (boundary-shift hazard — see the note on `setLtpOriginIfSafe`).
 */
export function dispatchSiteLocation(
    ctx: SiteContext,
    location: { latitude: number; longitude: number; siteAddress?: string | null },
): boolean {
    const siteId = ensureSite(ctx, location);
    if (!siteId) return false;

    const locRes = siteUpdateLocation({ siteId, location }, ctx.store);
    if (!locRes.ok) {
        console.warn('[gis] site.updateLocation soft-reject:', locRes.reason, locRes.message);
        // Non-fatal if the create already set it; surface only if it's a hard problem.
        if (locRes.reason !== 'no-site') return true;
        ctx.toast(`Set location failed: ${locRes.message}`, 'error');
        return false;
    }
    // C19 §1.3 — rebase the LTP-ENU origin BEFORE emitting the event (guarded).
    setLtpOriginIfSafe(ctx, location.latitude, location.longitude);
    console.log('[gis] site.location-changed', locRes.event);
    ctx.rt.events?.emit('site.location-changed', locRes.event);
    return true;
}

/**
 * Author the parcel boundary via the pure `site.setParcelBoundary` handler,
 * emitting `site.parcel-boundary-set`. Creates the Site first if needed. The
 * polygon is one-shot immutable per C19 §1.4 — a second call rejects with
 * `parcel-already-set`. Returns true on success.
 */
export function dispatchParcelBoundary(
    ctx: SiteContext,
    boundary: {
        polygon: XZPoint[];
        edgeClassifications: ParcelEdgeClassification[];
    },
): boolean {
    const siteId = ensureSite(ctx);
    if (!siteId) return false;

    const boundaryRes = siteSetParcelBoundary({ siteId, boundary }, ctx.store);
    if (!boundaryRes.ok) {
        console.error('[gis] site.setParcelBoundary rejected:', boundaryRes.reason, boundaryRes.message);
        ctx.toast(`Set parcel boundary failed: ${boundaryRes.message}`, 'error');
        return false;
    }
    console.log('[gis] site.parcel-boundary-set', boundaryRes.event, 'area(m²)=', boundaryRes.event.area);
    ctx.rt.events?.emit('site.parcel-boundary-set', boundaryRes.event);
    return true;
}
