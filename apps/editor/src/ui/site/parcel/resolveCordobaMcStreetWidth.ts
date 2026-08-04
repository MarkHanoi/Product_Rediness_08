// §COR-MC-STREET-WIDTH (2026-08-04) — measuring the street width the Córdoba MC (Manzana Cerrada)
// per-street-width height table (Art. 13.5.3.1) is keyed on.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT IS NOT A SECOND SOLVER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `@pryzm/site-parcel-data`'s `geometry/streetWidth.ts` (L-537 / ADR-0275) is region-agnostic: it
// "takes rings and returns metres". This module supplies Córdoba's missing piece (a), named in
// that file's own header — "its own parcel/block source that can produce a block ring" — by
// reusing the EXACT construction `applyBcnZoningThenFallback` already runs in production
// (§BCN-ALCADA-WIDTH): `fetchBlockForParcel` → `dissolveParcelsToBlockRing` → `measureStreetWidths`
// / `blockEdgesFacingParcel` / `governingStreetWidth`. No new geometry, no second measurement path.
//
// `esCordobaPGOU2001.ts`'s own §COR-ALIGNMENT header (see `applyCordobaZoningThenFallback`) rejects
// deriving MC's width from Córdoba's *published alignment* layers — none exist, and the axis layer
// (`idecordoba:ejes_red_viaria`) measured only 16.7 % coincident with a real frontage. That finding
// is untouched by this module: this is NOT an alignment-layer read. It is the SAME cadastral
// block-dissolve construction ADR-0271 already sanctions for Barcelona's *profunditat edificable*,
// applied to Córdoba's own INSPIRE Catastro parcels — measured to dissolve for 20/26 = 76.9 % of
// real Córdoba manzanas (`streetWidth.ts` header; `resolveMurciaStreetWidth.ts` §CORRECTED note).
//
// WHY THIS LIVES IN apps/editor AND NOT packages/site-parcel-data
// ------------------------------------------------------------------------------------------------
// `fetchBlockForParcel` talks to the same-origin `/api/catastro/block` proxy via `fetch` +
// `import.meta.env`, and it is an apps/editor-local module (`./CatastroBlockProvider.js`) — the
// SAME placement `CatastroParcelProvider.ts` already documents as "liftable to an L2
// `@pryzm/site-parcel-data` package verbatim once a second adapter lands ... kept in the editor
// app for now to avoid net-new package plumbing". Per the P1 layer model packages may not import
// from apps, so this resolver sits beside `CatastroBlockProvider` and calls straight into
// `@pryzm/site-parcel-data`'s pure geometry primitives — the same shape Barcelona's inline
// §BCN-ALCADA-WIDTH block already has, only extracted into an injectable, testable function so a
// unit test can stub the block fetch without touching the network.
//
// NEVER THROWS — every miss is a typed refusal reusing `measureStreetWidths` /
// `dissolveParcelsToBlockRing`'s OWN failure vocabulary (no new reason strings for the same
// underlying causes). OTel span (P8 / C58 §1.10).

import { trace } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import {
    dissolveParcelsToBlockRing,
    measureStreetWidths,
    blockEdgesFacingParcel,
    governingStreetWidth,
} from '@pryzm/site-parcel-data';
import type { LatLon } from '../boundaryProjection.js';
import { fetchBlockForParcel, type BlockFeature } from './CatastroBlockProvider.js';

const tracer = trace.getTracer('pryzm.parcel');

/** The authority string every success carries (ADR-0271: constructed, never an *ample oficial*). */
export const CORDOBA_MC_STREET_WIDTH_AUTHORITY =
    'CONSTRUCTED by PRYZM from Catastro (Dirección General del Catastro, INSPIRE WFS) cadastral ' +
    'block geometry — the manzana ring dissolved from its constituent parcels, measured ' +
    'frontage-to-frontage against the parcels across the street (same construction as Barcelona\'s ' +
    'ADR-0271 *profunditat edificable* / §BCN-ALCADA-WIDTH). ⚠ NOT an official Córdoba street-width ' +
    'measurement: no *alineación* layer exists to read one from (see §COR-ALIGNMENT).';

/**
 * Why no width could be measured. Reuses `dissolveParcelsToBlockRing` / `measureStreetWidths`'s
 * OWN vocabulary via these buckets rather than inventing new reason strings for the same causes.
 */
export type CordobaMcStreetWidthRefusal =
    /** No Catastro refcat for this parcel — nothing to fetch a block for. */
    | 'no-refcat'
    /** `fetchBlockForParcel` returned `null`, or fewer than 3 non-free-standing parcels. */
    | 'block-unavailable'
    /** `dissolveParcelsToBlockRing` refused a non-conforming tiling (`degenerate`). */
    | 'block-dissolve-refused'
    /** The block bbox returned no neighbouring parcels — nothing to measure a width against. */
    | 'no-neighbours'
    /** Rays found no usable opposing frontage on any governing edge (or the parcel fronts none). */
    | 'no-opposing-frontage';

export type CordobaMcStreetWidthResolution =
    | {
          readonly ok: true;
          /** Median (governing) frontage-to-frontage distance, metres. CONSTRUCTED. */
          readonly width_m: number;
          /** THE ERROR BAR (max − min across rays) — feeds the ADR-0287 band-edge guard. */
          readonly spread_m: number;
          readonly sampleCount: number;
          readonly edgeIndex: number;
          readonly provenance: 'measured-geometry';
          readonly authority: string;
          readonly manzana: string;
          readonly neighbourCount: number;
      }
    | { readonly ok: false; readonly reason: CordobaMcStreetWidthRefusal };

export interface CordobaMcStreetWidthDeps {
    /** Injectable for testing — defaults to the real `fetchBlockForParcel`. */
    readonly fetchBlock?: (
        refcat: string,
        signal: AbortSignal | undefined,
        centroid: { lat: number; lon: number } | undefined,
    ) => Promise<BlockFeature | null>;
}

/**
 * Measure the street width governing a Córdoba MC parcel, from Catastro block geometry.
 *
 * NEVER THROWS. OTel span `pryzm.parcel.resolveCordobaMcStreetWidth` (P8 / C58 §1.10).
 *
 * ⚠ THE RESULT IS AN INPUT, NOT AN ANSWER. Feed `width_m` + `spread_m` to
 * `resolveCordobaMcHeightForWidth`; that function owns the band decision and the ADR-0287
 * band-edge refusal. Reading `width_m` and picking a band by hand would bypass the guard.
 *
 * @param refcat        the parcel's Catastro referencia catastral, or null/undefined (⇒ `no-refcat`).
 * @param centroid       the parcel's own centroid, WGS84 — reused to skip `fetchBlockForParcel`'s
 *   own `GetParcel` round-trip (§BLOCK-CENTROID-REUSE, mirrors Barcelona).
 * @param parcelRingXZ   the committed parcel boundary, already in the SAME authoring frame as
 *   `toAuthoringFrame` below (scene-XZ, TRUE-north). Used only to narrow which block edges govern.
 * @param toAuthoringFrame  projects a WGS84 point into that SAME scene-XZ frame — must be the
 *   caller's own `toAuthoringFrame` (site origin + θ de-rotation), or the measurement is garbage.
 */
export async function resolveCordobaMcStreetWidth(
    refcat: string | null | undefined,
    centroid: { lat: number; lon: number } | undefined,
    parcelRingXZ: ReadonlyArray<Pt>,
    toAuthoringFrame: (p: LatLon) => Pt,
    deps: CordobaMcStreetWidthDeps = {},
): Promise<CordobaMcStreetWidthResolution> {
    const span = tracer.startSpan('pryzm.parcel.resolveCordobaMcStreetWidth');
    span.setAttribute('provider', 'cordoba-mc-catastro-block-dissolve');
    try {
        if (typeof refcat !== 'string' || refcat.trim() === '') {
            span.setAttribute('resultFields', 'no-refcat');
            return { ok: false, reason: 'no-refcat' };
        }

        const fetchBlock = deps.fetchBlock ?? fetchBlockForParcel;
        // The real `fetchBlockForParcel` never throws (it swallows every network failure and
        // resolves `null`); an INJECTED dep is not guaranteed the same discipline, and this
        // resolver's own contract is "never throws" — so the boundary is guarded here too.
        let block: BlockFeature | null;
        try {
            block = await fetchBlock(refcat, undefined, centroid);
        } catch {
            span.setAttribute('resultFields', 'block-unavailable');
            return { ok: false, reason: 'block-unavailable' };
        }
        if (!block || block.parcels.length < 3) {
            span.setAttribute('resultFields', 'block-unavailable');
            return { ok: false, reason: 'block-unavailable' };
        }
        span.setAttribute('manzana', block.manzana);

        const parcelRingsXZ = block.parcels.map((bp) => bp.ring.map(toAuthoringFrame));
        const dissolved = dissolveParcelsToBlockRing(parcelRingsXZ);
        if (dissolved.degenerate || dissolved.ring.length < 3) {
            span.setAttribute('resultFields', 'block-dissolve-refused');
            return { ok: false, reason: 'block-dissolve-refused' };
        }
        const blockRing = dissolved.ring;

        const neighbourRingsXZ = (block.neighbours ?? []).map((n) => n.ring.map(toAuthoringFrame));
        if (neighbourRingsXZ.length === 0) {
            span.setAttribute('resultFields', 'no-neighbours');
            return { ok: false, reason: 'no-neighbours' };
        }

        const widths = measureStreetWidths(blockRing, neighbourRingsXZ);
        // Restrict to the block edges THIS parcel fronts, exactly as Barcelona does — the
        // narrowest street around the WHOLE block would under-build a parcel fronting only the
        // wide artery. An empty result means we could not tell which edges are ours, and then the
        // whole block is the honest fallback (`governingStreetWidth`'s own documented behaviour).
        const facing = blockEdgesFacingParcel(blockRing, parcelRingXZ);
        const governing = governingStreetWidth(widths, facing.length > 0 ? facing : undefined);
        if (!governing) {
            span.setAttribute('resultFields', 'no-opposing-frontage');
            span.setAttribute('rejectedEdges', widths.rejected.length);
            return { ok: false, reason: 'no-opposing-frontage' };
        }

        span.setAttribute('resultFields', 'width');
        span.setAttribute('width_m', governing.width_m);
        span.setAttribute('spread_m', governing.spread_m);
        return {
            ok: true,
            width_m: governing.width_m,
            spread_m: governing.spread_m,
            sampleCount: governing.sampleCount,
            edgeIndex: governing.edgeIndex,
            provenance: 'measured-geometry',
            authority: CORDOBA_MC_STREET_WIDTH_AUTHORITY,
            manzana: block.manzana,
            neighbourCount: neighbourRingsXZ.length,
        };
    } finally {
        span.end();
    }
}
