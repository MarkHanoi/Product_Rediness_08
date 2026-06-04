// A.5.g.3 — Apartment from the Site parcel boundary (the site → design seam).
//
// WHY THIS EXISTS
// ---------------
// A.5.g.2 (`generateApartmentFromScratch({ footprint })`) already accepts a
// footprint polygon and draws a shell + runs the generator. A.5.g.3 closes the
// LAST gap of the founder's RAC → site → design journey: instead of the caller
// passing a footprint, this reads the authored Site parcel boundary from the
// C19 `runtime.siteModelStore` and feeds it straight into the generator. The
// boundary is authored by A.7.c.x `createSiteFromRect` (the stub-GIS console
// helper) today, and by the real GIS polygon-draw tool (A.8.c) later — both land
// the same `ParcelBoundary` in the same store, so this seam is UI-agnostic.
//
// TYPOLOGY-AGNOSTIC AT THE SITE READ
// ----------------------------------
// The Site read (`getParcelBoundary()`) + the polygon → footprint mapping are
// fully typology-neutral — any typology consumes the same parcel boundary. ONLY
// the final `generateApartmentFromScratch` call is apartment-specific. A future
// house / school / office Pack swaps THAT call (its own generator) and reuses the
// identical site-read above (see the §FUTURE-TYPOLOGY note at the call site).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { generateApartmentFromScratch, type FootprintPoint } from './apartmentFromScratch.js';
import { resolveApartmentBrief } from './briefToProgram.js';
import { getActiveBriefMetadata } from './activeBrief.js';

/**
 * Read the active Site's parcel boundary polygon from `runtime.siteModelStore`
 * and generate an apartment layout from it. Resolves the runtime from the
 * argument or `window.runtime`. If no boundary is authored yet, toasts a hint to
 * run `pryzmCreateSiteFromRect()` first.
 *
 * O.12.c — `briefMetadata` is the STRUCTURED RAC brief (`PipelineBrief.metadata`,
 * field-id-keyed). It's mapped to a program override (no NLP parse) and threaded
 * into the generator. When omitted, the active-brief stash is consulted, then
 * DEFAULT_PROGRAM (graceful fallback) — so the GIS-rail / console entry points
 * still honour a captured brief.
 */
export async function generateApartmentFromBoundary(
    runtimeArg?: PryzmRuntime | null,
    briefMetadata?: Record<string, unknown> | null,
): Promise<void> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };

    try {
        console.log('[apartment-from-boundary] invoked');

        if (!rt) {
            console.warn('[apartment-from-boundary] no runtime — open a project first.');
            return;
        }

        const store = rt.siteModelStore;
        if (!store) {
            console.warn('[apartment-from-boundary] runtime.siteModelStore is undefined — restart the dev server (npm run dev).');
            toast('Site store unavailable — restart the dev server (npm run dev).', 'error');
            return;
        }

        // ── Typology-agnostic site read ──────────────────────────────────────
        const boundary = store.getParcelBoundary();
        const polygon = boundary?.polygon ?? [];
        console.log('[apartment-from-boundary] parcel boundary polygon', polygon);

        if (polygon.length < 3) {
            console.warn(`[apartment-from-boundary] no usable parcel boundary (${polygon.length} pts).`);
            toast('No site boundary — run pryzmCreateSiteFromRect() first.', 'error');
            return;
        }

        // Map the parcel polygon ({x,z} points) → a footprint. Drop a duplicate
        // closing point if the author included one (ParcelBoundary is normally
        // open, but be defensive — a closed ring would otherwise emit a
        // zero-length wall edge).
        const footprint = polygonToFootprint(polygon);
        console.log(`[apartment-from-boundary] footprint (${footprint.length} pts)`, footprint);

        if (footprint.length < 3) {
            console.warn('[apartment-from-boundary] footprint collapsed below 3 distinct points after de-duplication.');
            toast('Site boundary is degenerate — needs ≥3 distinct corners.', 'error');
            return;
        }

        toast('Generating apartment from site boundary…', 'info');

        // O.12.c — resolve the STRUCTURED brief → program override (no NLP parse).
        // Prefer the explicitly-passed metadata (the onboarding chain forwards the
        // RAC brief here); fall back to the active-brief stash so GIS-rail/console
        // callers still honour a captured brief. An absent brief ⇒ empty override
        // ⇒ DEFAULT_PROGRAM downstream.
        const md = briefMetadata ?? getActiveBriefMetadata('apartment');
        const { programOverride } = resolveApartmentBrief(md);
        console.log('[apartment-from-boundary] resolved program override', programOverride);

        // §FUTURE-TYPOLOGY: this is the ONLY apartment-specific line. A house /
        // school / office Pack swaps this for its own generator, reusing the
        // identical typology-neutral site read above.
        await generateApartmentFromScratch(rt, { footprint, programOverride });
    } catch (err) {
        console.error('[apartment-from-boundary] threw:', err);
        toast(`Apartment-from-boundary failed: ${String(err)}`, 'error');
    }
}

/**
 * Convert a parcel-boundary polygon (XZ points) into a footprint for the
 * generator. Drops a trailing point that duplicates the first (a closed ring) so
 * the shell builder does not emit a zero-length edge.
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
