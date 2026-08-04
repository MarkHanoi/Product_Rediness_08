// §ZGZ-STREET-WIDTH — measuring the *ancho de calle* A1/3.1 / A1/3.2 key their height table on.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE REFUSES EVERY UNSEEDED CALL, TODAY, ON PURPOSE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Murcia's `resolveMurciaStreetWidth.ts` measures a live width because SIG-MU2 (founder,
// 2026-08-02) authorised constructing it from `Murcia:pgou_alineaciones` — a municipal layer that
// publishes the BLOCK-level alignment polygons directly, so no dissolve is needed.
//
// ⛔ ZARAGOZA HAS NO EQUIVALENT SOURCE, AND THIS IS MEASURED, NOT ASSUMED. `esAragon.ts`'s
// `§ZGZ-ALIGNMENT-CANDIDATE` already ran exactly this search: `urbanismo:Linea_Normativa` sits
// 367× closer to the block/street interface than a paired street-axis control, so its geometry is
// plausibly an alignment — but GeoServer's own SLD keys its rules on a bare code (`302101`) with
// NO human-readable title, so the layer's SEMANTICS are unpublished. `ZARAGOZA_ALIGNMENT_CANDIDATE
// .adopted === false`, and the reason recorded there is the same reason this file does not fetch
// it: asserting a meaning nobody has established is the L-616 mechanism, applied to a GEOMETRY
// SOURCE instead of a parameter.
//
// So this module is PURE and INJECTION-ONLY: it takes a block ring + opposing parcel rings the
// CALLER already holds (exactly `measureStreetWidths`'s own contract in `geometry/streetWidth.ts`)
// and refuses `'not-wired'` when neither is supplied — which is every production call today, since
// nothing in this package fetches Zaragoza block/parcel neighbourhood geometry yet. The function
// exists so `applyZaragozaZoningThenFallback` (L5) has ONE seam to call, and so wiring a future
// source (Catastro INSPIRE block dissolve, on the Córdoba/Barcelona precedent — `streetWidth.ts`'s
// own "(a) a parcel/block source" gap) is a change to WHERE the rings come from, never to how the
// width is measured or how the L5 dispatcher reads the answer.
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O, no fetch, no clock. OTel span (P8).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import {
    measureStreetWidths,
    blockEdgesFacingParcel,
    governingStreetWidth,
} from '../geometry/streetWidth.js';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * The authority string every success carries — SIG-MU2's condition 2 pattern, restated for
 * Zaragoza: the source must be NAMED, and named as what it is, never as an official measurement.
 */
export const ZARAGOZA_STREET_WIDTH_AUTHORITY =
    'CONSTRUCTED by PRYZM from caller-supplied block/opposing-parcel geometry (measured with the ' +
    'region-agnostic `measureStreetWidths`, ADR-0275). ⚠ NOT an official municipal ancho-de-calle ' +
    'measurement, and — as of this writing — no live Zaragoza block/parcel neighbourhood source ' +
    'feeds this function in production; see `not-wired` below.';

export type ZaragozaStreetWidthRefusal =
    /**
     * No block ring / opposing-parcel geometry was supplied. THIS IS THE PRODUCTION DEFAULT: no
     * live Zaragoza neighbourhood-parcel source is wired yet (see the file header). Never a guess.
     */
    | 'not-wired'
    /** Supplied geometry was too degenerate to measure (fewer than 3 ring vertices). */
    | 'bad-input'
    /**
     * Rays found no opposing frontage on any governing edge, or the samples disagreed by more than
     * the tolerance. Condition-4-equivalent (§MURCIA-ANCHO-DE-CALLE) — refusing here is the
     * measurement working, not a defect.
     */
    | 'no-opposing-frontage';

export type ZaragozaStreetWidthResolution =
    | {
          readonly ok: true;
          /** Median frontage-to-frontage distance, metres. CONSTRUCTED — see `provenance`. */
          readonly width_m: number;
          /** The measurement's own error bar (max − min across rays). Feeds the band-edge guard. */
          readonly spread_m: number;
          readonly sampleCount: number;
          readonly edgeIndex: number;
          readonly provenance: 'measured-geometry';
          readonly authority: string;
      }
    | { readonly ok: false; readonly reason: ZaragozaStreetWidthRefusal };

export interface ZaragozaStreetWidthDeps {
    /** OUR block's dissolved outline, in a metric XZ frame. Omitted ⇒ `not-wired`. */
    readonly blockRing?: ReadonlyArray<Pt>;
    /** Parcel rings NOT belonging to this block, same frame. Omitted ⇒ `not-wired`. */
    readonly opposingRings?: ReadonlyArray<ReadonlyArray<Pt>>;
    /**
     * The committed parcel ring, same frame, used only to narrow which block edges govern
     * (`blockEdgesFacingParcel`). Omitted ⇒ the narrowest frontage of the whole block governs —
     * the same conservative fallback `governingStreetWidth` documents.
     */
    readonly parcelRing?: ReadonlyArray<Pt>;
}

/**
 * Resolve the ancho-de-calle governing a Zaragoza A1/3.1 / A1/3.2 parcel, from CALLER-SUPPLIED
 * block/opposing-parcel geometry.
 *
 * NEVER THROWS — every miss is a typed refusal. `'not-wired'` is the honest answer for every
 * production call today (no Zaragoza neighbourhood-parcel source is wired) — this function exists
 * so wiring one later is a one-file change, not a rewrite of the L5 dispatch branch that calls it.
 *
 * P8 — emits `pryzm.zoning.resolveZaragozaStreetWidth`.
 */
export function resolveZaragozaStreetWidth(
    deps: ZaragozaStreetWidthDeps = {},
): ZaragozaStreetWidthResolution {
    const span = tracer.startSpan('pryzm.zoning.resolveZaragozaStreetWidth');
    span.setAttribute('provider', 'zaragoza-street-width');
    try {
        if (!deps.blockRing || !deps.opposingRings) {
            span.setAttribute('resultFields', 'not-wired');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'not-wired' };
        }
        if (deps.blockRing.length < 3) {
            span.setAttribute('resultFields', 'bad-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'bad-input' };
        }

        const result = measureStreetWidths(deps.blockRing, deps.opposingRings);
        const edges =
            deps.parcelRing && deps.parcelRing.length >= 3
                ? blockEdgesFacingParcel(deps.blockRing, deps.parcelRing)
                : undefined;
        const governing = governingStreetWidth(result, edges);
        if (!governing) {
            span.setAttribute('resultFields', 'no-opposing-frontage');
            span.setAttribute('rejectedEdges', result.rejected.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-opposing-frontage' };
        }

        span.setAttribute('resultFields', 'width');
        span.setAttribute('width_m', governing.width_m);
        span.setAttribute('spread_m', governing.spread_m);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            width_m: governing.width_m,
            spread_m: governing.spread_m,
            sampleCount: governing.sampleCount,
            edgeIndex: governing.edgeIndex,
            provenance: 'measured-geometry',
            authority: ZARAGOZA_STREET_WIDTH_AUTHORITY,
        };
    } finally {
        span.end();
    }
}
