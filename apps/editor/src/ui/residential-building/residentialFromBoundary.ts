// §RESI-MULTIFAMILY — Residential building (multi-family) from the Site parcel
// boundary (the site → design seam). The SIBLING of
// `apartment-layout/apartmentFromBoundary.ts` + the house branch in
// `OnboardingStepController.generateHouse`, for the multi-FAMILY building.
//
// WHY THIS EXISTS
// ---------------
// The guided onboarding flow (location → draw-or-skip → confirm) lands a drawn
// parcel boundary in the C19 `runtime.siteModelStore`. `apartmentFromBoundary`
// reads that boundary and runs the apartment generator; this module does the
// SAME for the multi-family residential building: it reads the authored parcel
// polygon, maps it to a footprint, derives the residential PROGRAM (floors +
// per-apartment min/max m² + T1–T4 mix) from the captured RAC brief metadata
// (sensible defaults so the flow proceeds even if the user just clicked through),
// and hands BOTH to `ResidentialBuildingController.request(...)` — which runs the
// orchestrator on that footprint and opens the residential PREVIEW MODAL → Build.
//
// TYPOLOGY-AGNOSTIC AT THE SITE READ
// ----------------------------------
// The Site read (`getParcelBoundary()`) + the polygon → footprint mapping are
// the SAME typology-neutral seam every typology consumes. ONLY the final
// controller call is residential-specific.
//
// NO CONSOLE FLAG ON THIS PATH
// ----------------------------
// The console trigger (`residentialBuildingTrigger.ts`) is gated behind
// `globalThis.__PRYZM_RESIDENTIAL_BUILDING__` so it cannot affect existing users.
// Here the BUILDING-TYPE SELECTION in the New-Project modal IS the opt-in: the
// user explicitly chose "Residential building — multi-family", so we call the
// `ResidentialBuildingController` DIRECTLY (the controller itself carries no
// gate — the gate lives only in the console trigger). P6/P8 unchanged: the
// controller does no mutation; the executor (on Build) owns it through the bus.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    ResidentialBuildingController,
    type ResidentialBuildingRequest,
} from './ResidentialBuildingController.js';
import { resolveBuildableFootprint } from '../site/siteDispatch.js';

/** Footprint point (metres, plan XZ). */
interface FootprintPoint { readonly x: number; readonly z: number }

/** Defaults so the flow proceeds even if the user just clicked through the
 *  wizard (founder requirement: 5 floors, 60–100 m², T2 + T3). */
const DEFAULT_FLOORS = 5;
const DEFAULT_MIN_APT_M2 = 60;
const DEFAULT_MAX_APT_M2 = 100;

/** One shared controller singleton (owns the preview modal + executor). */
const _controller = new ResidentialBuildingController();

/** Read a finite positive number from the loosely-typed brief metadata. */
function readNumber(md: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const k of keys) {
        const raw = md[k];
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
}

/** Read a `#rrggbb` hex colour string from the brief metadata. Accepts a 3- or 6-digit hex
 *  (expanding the short form). Absent / malformed ⇒ undefined. */
function readHexColor(md: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const k of keys) {
        const raw = md[k];
        if (typeof raw !== 'string') continue;
        const v = raw.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
        if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase();
    }
    return undefined;
}

/** Read a boolean-ish from the brief metadata. Absent ⇒ undefined. */
function readBool(md: Record<string, unknown>, ...keys: string[]): boolean | undefined {
    for (const k of keys) {
        const raw = md[k];
        if (typeof raw === 'boolean') return raw;
        if (typeof raw === 'string') {
            const v = raw.trim().toLowerCase();
            if (v === 'true' || v === 'yes' || v === '1') return true;
            if (v === 'false' || v === 'no' || v === '0') return false;
        }
    }
    return undefined;
}

/**
 * Map the captured RAC brief metadata (field-id keyed, typology-neutral here) to
 * a typed `ResidentialBuildingRequest`. Pure + defensive: any missing field falls
 * back to a sensible default so the controller always has a runnable program.
 * The `footprint` is threaded in by the caller (read from the parcel store).
 */
export function residentialRequestFromBrief(
    md: Record<string, unknown>,
    footprint: ReadonlyArray<FootprintPoint>,
): ResidentialBuildingRequest {
    const floorsRaw = readNumber(md, 'floors', 'levels', 'upperLevels') ?? DEFAULT_FLOORS;
    const upperLevels = Math.max(1, Math.min(20, Math.round(floorsRaw)));

    const minApartmentAreaM2 = readNumber(md, 'minApartmentAreaM2', 'minAreaM2', 'apartmentMinM2') ?? DEFAULT_MIN_APT_M2;
    const maxRaw = readNumber(md, 'maxApartmentAreaM2', 'maxAreaM2', 'apartmentMaxM2') ?? DEFAULT_MAX_APT_M2;
    const maxApartmentAreaM2 = Math.max(maxRaw, minApartmentAreaM2);

    // Typologies: read explicit T1..T4 flags when present; else default to the
    // T2 + T3 mix (the typology pack's default residential mix). If NONE resolve
    // true we still fall back to T2 + T3 so the request is always feasible.
    const t1 = readBool(md, 'T1', 't1');
    const t2 = readBool(md, 'T2', 't2');
    const t3 = readBool(md, 'T3', 't3');
    const t4 = readBool(md, 'T4', 't4');
    const anyExplicit = [t1, t2, t3, t4].some((v) => typeof v === 'boolean');
    const typologies = anyExplicit && [t1, t2, t3, t4].some((v) => v === true)
        ? { T1: t1 === true, T2: t2 === true, T3: t3 === true, T4: t4 === true }
        : { T1: false, T2: true, T3: true, T4: false };

    const siteLatitudeDeg = readNumber(md, 'siteLatitudeDeg', 'latDeg', 'lat');
    // §RESI-PREVIEW-OPTIONS — the modal's four build options. roof-garden (default OFF),
    // balconies (default ON), façade colour (hex), ground commercial-curtain (default OFF).
    const roofGarden = readBool(md, 'roofGarden') === true;
    // §RESI-BALCONIES — default ON: only `false`/`no`/`0` turns it off; absent stays ON.
    const balconies = readBool(md, 'balconies') !== false;
    // §RESI-GROUND-COMMERCIAL-CURTAIN — default OFF (solid shell + big commercial windows).
    const groundCommercialCurtain = readBool(md, 'groundCommercialCurtain', 'groundCurtain') === true;
    // §RESI-FACADE-COLOUR — a #rrggbb hex finish colour from the modal colour picker (else default).
    const facadeColor = readHexColor(md, 'facadeColor', 'finishColor', 'facadeColour');

    return {
        upperLevels,
        minApartmentAreaM2,
        maxApartmentAreaM2,
        typologies,
        ...(typeof siteLatitudeDeg === 'number' ? { siteLatitudeDeg } : {}),
        ...(roofGarden ? { roofGarden: true } : {}),
        // Balconies are ON by default; only thread the flag when the modal turned it OFF.
        ...(balconies ? {} : { balconies: false }),
        ...(groundCommercialCurtain ? { groundCommercialCurtain: true } : {}),
        ...(facadeColor ? { facadeColor } : {}),
        footprint,
    };
}

/**
 * Convert a parcel-boundary polygon (XZ points) into a footprint. Drops a
 * trailing point that duplicates the first (a closed ring) so a degenerate
 * zero-length edge never reaches the orchestrator. Mirrors
 * `apartmentFromBoundary.polygonToFootprint`.
 */
function polygonToFootprint(polygon: ReadonlyArray<{ x: number; z: number }>): FootprintPoint[] {
    const pts = polygon.map((p) => ({ x: p.x, z: p.z }));
    if (pts.length >= 2) {
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        const EPS = 1e-6;
        if (Math.abs(first.x - last.x) < EPS && Math.abs(first.z - last.z) < EPS) {
            pts.pop();
        }
    }
    return pts;
}

/**
 * Read the active Site's parcel boundary from `runtime.siteModelStore` and run
 * the multi-family residential generator from it: maps the polygon → footprint,
 * derives the residential program from `briefMetadata` (sensible defaults), and
 * opens the residential PREVIEW MODAL via `ResidentialBuildingController.request`.
 *
 * Resolves the runtime from the argument or `window.runtime`. NEVER throws —
 * toasts a hint on any miss (mirrors `generateApartmentFromBoundary`).
 */
export async function generateResidentialFromBoundary(
    runtimeArg?: PryzmRuntime | null,
    briefMetadata?: Record<string, unknown> | null,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };

    try {
        console.log('[resi-from-boundary] invoked');

        if (!rt) {
            console.warn('[resi-from-boundary] no runtime — open a project first.');
            return;
        }

        const store = rt.siteModelStore;
        if (!store) {
            console.warn('[resi-from-boundary] runtime.siteModelStore is undefined — restart the dev server (npm run dev).');
            toast('Site store unavailable — restart the dev server (npm run dev).', 'error');
            return;
        }

        // ── Typology-agnostic site read ──────────────────────────────────────
        // L-401 — build INSIDE the C58 buildable envelope (setbacks applied) when cached:
        // COMPLIANT-BY-CONSTRUCTION; else the raw parcel (unchanged).
        const boundary = store.getParcelBoundary();
        const rawPolygon = boundary?.polygon ?? [];
        const { polygon, source } = resolveBuildableFootprint(rawPolygon);
        console.log(
            `[resi-from-boundary] footprint source=${source} (${polygon.length} pts) — ` +
                `${source === 'envelope' ? 'COMPLIANT: inside the buildable envelope' : 'raw parcel (no envelope cached)'}.`,
        );

        if (polygon.length < 3) {
            console.warn(`[resi-from-boundary] no usable parcel boundary (${polygon.length} pts).`);
            toast('No site boundary — draw a plot first.', 'error');
            return;
        }

        const footprint = polygonToFootprint(polygon);
        console.log(`[resi-from-boundary] footprint (${footprint.length} pts)`, footprint);

        if (footprint.length < 3) {
            console.warn('[resi-from-boundary] footprint collapsed below 3 distinct points after de-duplication.');
            toast('Site boundary is degenerate — needs ≥3 distinct corners.', 'error');
            return;
        }

        const md = briefMetadata ?? {};
        const request = residentialRequestFromBrief(md, footprint);
        console.log('[resi-from-boundary] residential request', {
            upperLevels: request.upperLevels,
            minApartmentAreaM2: request.minApartmentAreaM2,
            maxApartmentAreaM2: request.maxApartmentAreaM2,
            typologies: request.typologies,
        });

        toast('Generating residential building from site boundary…', 'info');

        // §RESI-MULTIFAMILY: the ONLY residential-specific line. The controller
        // runs the orchestrator on the footprint + opens the preview modal → Build.
        await _controller.request(rt, request);
    } catch (err) {
        console.error('[resi-from-boundary] threw:', err);
        toast(`Residential-from-boundary failed: ${String(err)}`, 'error');
    }
}
