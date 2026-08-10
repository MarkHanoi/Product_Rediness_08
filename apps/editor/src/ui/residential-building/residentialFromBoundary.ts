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
import { ResidentialBuildingController } from './ResidentialBuildingController.js';
import { residentialRequestFromBrief } from './residentialBriefMapper.js';
import { resolveBuildableFootprint } from '../site/siteDispatch.js';

/** Footprint point (metres, plan XZ). */
interface FootprintPoint { readonly x: number; readonly z: number }

/** One shared controller singleton (owns the preview modal + executor). */
const _controller = new ResidentialBuildingController();

// §GEN-REQUEST-UNION (RAC U5b.1) — the PURE brief mapper moved to
// `residentialBriefMapper.ts` (one implementation, importable without this
// module's window/store-touching value imports). Re-exported so every existing
// import path keeps working unchanged.
export { residentialRequestFromBrief } from './residentialBriefMapper.js';

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
