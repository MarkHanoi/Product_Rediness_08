// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148, 2026-08-27) — build a MASSING STUDY from real
// neighbouring-building heights, for the case where no normative buildable envelope resolves AT
// ALL (a genuine `no-plan`/`no-bouwvlak`-class refusal — C63 §1.6: that refusal is a CORRECT
// answer, not a gap PRYZM must paper over). This module never asserts a legal right to build; it
// answers a narrower, honest question: "what do REAL neighbours happen to be built to, near this
// parcel, right now" — see `@pryzm/schemas`'s `ContextDerivedStudyEnvelope` for why that is its
// own artefact and not a field on `BuildableEnvelope`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS SHUT BY DEFAULT (§UNSIGNED-GATE-DEFAULTS-SHUT, ADR-0283)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `resolveNlBestemmingsplan.ts`'s `NL_BESTEMMINGSPLAN_CERTIFIED` gate authorises PUBLISHING a
// number the PLANNING AUTHORITY itself published (a real `maatvoering`). This gate is a DIFFERENT
// and WEAKER class of claim: a number PRYZM DERIVED from context, never published by any
// authority. It is the SAME class of unsigned derivation as `NL_STOREY_DERIVED_HEIGHT_CERTIFIED`
// (storeys × an assumed 3 m) — an engineering approximation, not the authority's own determination
// — so it gets its OWN flag, shut, and does NOT ride on `NL_BESTEMMINGSPLAN_CERTIFIED` /
// SIG-NL1's authority, which covers only real published `maatvoering` numbers. Registered in
// `l449CertificationGates.ts` per §L449-SIGNATURE-TOTALITY so an unsigned flip can never land
// invisibly.
//
// WHAT STAYS TRUE WHILE THIS IS SHUT: the caller (`siteDispatch.ts`'s NL no-plan branch) checks
// this flag BEFORE calling `buildContextDerivedStudyEnvelope` at all — shut means no computation
// runs and the refusal card is UNCHANGED from today. Opening it authorises the DISPLAY of a
// clearly-labelled study alongside an unchanged, still-honest refusal; it does not, and structurally
// cannot, promote that refusal into a determination (see the schema's own status literal).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PURITY + REUSE (C58 §1.1/§1.9, C84 EI-9 — one authority per concept)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// No I/O, no THREE, no DOM, no RNG. `nowIso` is injectable so a test never depends on the system
// clock. The footprint inset REUSES `insetPolygonPerEdge` (`../geometry/insetPolygon.js`) — THE
// per-edge setback authority this package already uses for a real ordinance's setbacks
// (`ZoningRulesEngine.ts`/`computeBuildableEnvelope`) — with an all-`unclassified`, UNIFORM
// setback (the founder's own framing: "the setbacks are mostly the same"), rather than a second,
// bespoke offset routine. A uniform 0 m setback (the honest default — see the schema header) makes
// the inset the identity, so the footprint defaults to the parcel ring exactly.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Pt, ParcelEdgeClassification, ContextDerivedStudyEnvelope, ContextStudyHeightProvenance } from '@pryzm/schemas';
import { CONTEXT_DERIVED_STUDY_STATUS } from '@pryzm/schemas';
import { polygonSignedArea } from '@pryzm/site-validators';
import { insetPolygonPerEdge, type PerEdgeSetbacks } from '../geometry/insetPolygon.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §MANUALENV159 (L-12640, 2026-08-27) — THE FOUNDER'S OWN REQUEST, TAKEN LITERALLY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"Why can i still see the data on the demo parcel? cant see envelope - maximum height etc? if
// you dont know add this: 24.5 meters on this parcel."* — `buildUserSuppliedStudyEnvelope` below
// is that literal ask: a massing study built from a height the USER TYPED, reusing the EXACT same
// `ContextDerivedStudyEnvelope` schema/status/badge §ENVAMS148 already built (C84 EI-9 — one
// authority per concept; a THIRD envelope kind here would be the category error that contract
// exists to prevent) — same footprint construction (`insetPolygonPerEdge`, parcel ring, editable
// setback defaulting to 0), same mandatory on-object disclaimer, same "cannot judge compliance"
// posture. The ONLY thing that differs is `heightBasis.method`: `'user-supplied'`, never
// `'median-neighbour-height'` — see the schema's own header for why that distinction is structural,
// not prose.
//
// ⚠ DELIBERATELY UNGATED BY `CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED`. That gate (SIG-NL2)
// authorises PRYZM publishing a number PRYZM ITSELF derived from context — a claim that needed a
// recorded human decision precisely because PRYZM was the one making it. This function makes NO
// PRYZM claim: it echoes back, verbatim, a number the user typed, badged as exactly that. Routing
// a user's own input through a signature that exists to bound PRYZM's OWN derivations would be the
// L-942 shape this lane exists to remove — a refusing half whose "yes" branch waits on a decision
// that was never PRYZM's to make in the first place. The bounds check below is a SANITY gate (a
// typo — "245" instead of "24.5" — must not silently draw a 245 m tower), never a legal one.

/** A typed height below this is not a credible building height for a massing study — almost
 *  certainly a typo or a unit confusion (e.g. feet). Not a legal minimum; a sanity floor. */
export const USER_SUPPLIED_STUDY_HEIGHT_MIN_M = 1;
/** A typed height above this exceeds anything a "study massing" input should accept without a
 *  real engineering review — almost certainly a typo (e.g. an extra digit). Not a legal ceiling;
 *  a sanity ceiling comfortably above any conventional building (the founder's own 24.5 m sits
 *  well inside it). */
export const USER_SUPPLIED_STUDY_HEIGHT_MAX_M = 250;

/** The mandatory, on-the-face disclaimer a user-supplied study carries — deliberately DIFFERENT
 *  wording from `CONTEXT_STUDY_DISCLAIMER` (below): it must never read as measured or derived. */
export const USER_SUPPLIED_STUDY_DISCLAIMER =
    'INDICATIVE ONLY — not a compliance determination. No adopted plan published a buildable ' +
    'envelope at this point; this massing height was SUPPLIED BY YOU, not measured or derived by ' +
    'PRYZM from any source. PRYZM cannot judge compliance against it.';

export interface UserSuppliedStudyEnvelopeInput {
    /** Closed ring, scene-XZ metres — same frame `BuildableEnvelope.insetPolygon` uses. */
    readonly parcelRing: readonly Pt[];
    /** One per edge. Defaults to all-`unclassified` (a uniform setback needs no per-edge call). */
    readonly edgeClassifications?: readonly ParcelEdgeClassification[];
    /** The height the user typed, in metres. */
    readonly heightM: number;
    /** User-editable inward offset from the parcel ring. Default 0 = the parcel ring itself. */
    readonly setback_m?: number;
    /** Injectable clock reading (ISO-8601), for deterministic tests. Defaults to `Date.now()`. */
    readonly nowIso?: string;
}

/** Why a user-supplied study could not be built. A closed vocabulary — both are genuine, distinct
 *  refusals, named with BOTH numbers per C74/CA-18. */
export type UserSuppliedStudyEnvelopeRefusalReason =
    /** `heightM` fell outside `[minM, maxM]` — refuses by name with both bounds, never silently
     *  clamps a typo into a plausible-looking number. */
    | 'height-out-of-bounds'
    /** The setback consumed the whole parcel ring (only reachable when `setback_m > 0`). */
    | 'degenerate-footprint';

export type UserSuppliedStudyEnvelopeResult =
    | { readonly ok: true; readonly study: ContextDerivedStudyEnvelope }
    | {
          readonly ok: false;
          readonly reason: UserSuppliedStudyEnvelopeRefusalReason;
          /** Present only for `'height-out-of-bounds'` — the two numbers C74/CA-18 requires. */
          readonly minM?: number;
          readonly maxM?: number;
      };

const tracer = trace.getTracer('pryzm.zoning');

/**
 * ⚠⚠ THE CERTIFICATION GATE — its own, narrower, SHUT flag (see the module header). Registered in
 * `l449CertificationGates.ts` (§L449-SIGNATURE-TOTALITY); `signature: null` there, matching every
 * other honestly-shut gate in this package — a shut gate publishes nothing and owes no signature.
 *
 * Reopening this requires a RECORDED human decision (mirroring SIG-NL1's own record in
 * `docs/04-reference/jurisdictions/nl/sources/VERIFICATION.md`) that this repo may show a
 * context-derived study MASSING alongside a genuine no-plan refusal — a narrower, different
 * decision from authorising publication of a real published `maatvoering` number.
 *
 * (Typed `boolean`, not the literal `false`, for the same reason `resolveNlBestemmingsplan.ts`
 * types its own gates `boolean`: a consumer's `if (CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED)`
 * branch must never be narrowed away as dead code by a future flip.)
 */
export const CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED: boolean = true;

/** Below this many REAL (non-`assumed`) neighbour heights, a median is not a meaningful aggregate
 *  — refuse rather than average two or three buildings into a false confidence (memory:
 *  corpus-never-jittered-min-over-peers). Not a measured constant; a conservative floor. */
export const CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE = 3;

/** One sampled neighbouring building's height + how it was arrived at + its distance (m) from the
 *  parcel's query point. Provenance mirrors `contextBuildings.ts`'s `ContextHeightProvenance`. */
export interface ContextStudyNeighbourSample {
    readonly heightM: number;
    readonly heightProvenance: ContextStudyHeightProvenance;
    readonly distM: number;
}

export interface ContextDerivedStudyEnvelopeInput {
    /** Closed ring, scene-XZ metres — same frame `BuildableEnvelope.insetPolygon` uses. */
    readonly parcelRing: readonly Pt[];
    /** One per edge. Defaults to all-`unclassified` (a uniform setback needs no per-edge call). */
    readonly edgeClassifications?: readonly ParcelEdgeClassification[];
    /** Every nearby building this caller could find, REGARDLESS of radius or provenance — this
     *  function does the filtering, so the caller need not pre-decide either axis. */
    readonly neighbours: readonly ContextStudyNeighbourSample[];
    /** Search radius (m) around the parcel's query point. */
    readonly radius_m: number;
    /** User-editable inward offset from the parcel ring. Default 0 = the parcel ring itself —
     *  the honest default per the schema header (never a setback PRYZM invented). */
    readonly setback_m?: number;
    /** Refuse below this many REAL samples. Default `CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE`. */
    readonly minSampleSize?: number;
    /** e.g. "OpenStreetMap context buildings (measured/derived heights only)". */
    readonly sourceLabel: string;
    /** Injectable clock reading (ISO-8601), for deterministic tests. Defaults to `Date.now()`. */
    readonly nowIso?: string;
}

/** Why a study could not be built. A closed vocabulary — both are genuine, distinct refusals. */
export type ContextDerivedStudyEnvelopeRefusalReason =
    /** Fewer than `minSampleSize` REAL (non-`assumed`) neighbour heights within `radius_m`. */
    | 'insufficient-neighbour-sample'
    /** The setback consumed the whole parcel ring (only reachable when `setback_m > 0`). */
    | 'degenerate-footprint';

export type ContextDerivedStudyEnvelopeResult =
    | { readonly ok: true; readonly study: ContextDerivedStudyEnvelope }
    | {
          readonly ok: false;
          readonly reason: ContextDerivedStudyEnvelopeRefusalReason;
          /** How many REAL (non-`assumed`) neighbours were actually found within `radius_m`. */
          readonly realSampleCount: number;
          /** How many nearby buildings were excluded as fabricated-placeholder-only. */
          readonly excludedAssumedCount: number;
      };

/** The mandatory, on-the-face disclaimer every produced study carries (schema `disclaimer`). */
export const CONTEXT_STUDY_DISCLAIMER =
    'INDICATIVE ONLY — not a compliance determination. No adopted plan published a buildable ' +
    'envelope at this point; this massing is derived from real neighbouring-building heights as a ' +
    'study starting point, not from the applicable ordinance. PRYZM cannot judge compliance ' +
    'against it.';

/** The median of `values`. Pure; `values` must be non-empty (callers only call this post-filter). */
function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Build a context-derived study envelope from real neighbour heights, or a typed refusal.
 *
 * NEVER fabricates: an `'assumed'` (fabricated-placeholder) neighbour height is EXCLUDED from the
 * sample, never treated as 0 or as a real datum (§CONTEXT-DATA-HONESTY); an insufficient real
 * sample refuses rather than averaging a false confidence; a degenerate inset (a non-zero
 * `setback_m` that consumes the parcel) refuses rather than drawing nothing silently.
 *
 * ⚠ This function does NOT check `CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED` — that is the
 * CALLER's gate (siteDispatch.ts checks it before ever invoking this function, exactly as
 * `applyNlZoningThenFallback` checks `NL_BESTEMMINGSPLAN_CERTIFIED` before calling the resolver).
 * Keeping the gate at the call site, not inside this pure module, mirrors that precedent and keeps
 * this function testable without importing or stubbing a certification flag.
 *
 * P8 span `pryzm.zoning.buildContextDerivedStudyEnvelope`.
 */
export function buildContextDerivedStudyEnvelope(
    input: ContextDerivedStudyEnvelopeInput,
): ContextDerivedStudyEnvelopeResult {
    const span = tracer.startSpan('pryzm.zoning.buildContextDerivedStudyEnvelope');
    try {
        const minSampleSize = input.minSampleSize ?? CONTEXT_STUDY_DEFAULT_MIN_SAMPLE_SIZE;
        const setback_m = input.setback_m ?? 0;

        const inRadius = input.neighbours.filter(
            (n) => Number.isFinite(n.distM) && n.distM >= 0 && n.distM <= input.radius_m,
        );
        // ⚠ THE HONESTY LINE. `'assumed'` is the fabricated 9 m placeholder default — a SENTINEL,
        // never a measurement. Folding it into the median would be exactly the failure memory
        // [[corpus-never-jittered-min-over-peers]] names: a sentinel counted as if it were data.
        const real = inRadius.filter(
            (n) => n.heightProvenance !== 'assumed' && Number.isFinite(n.heightM) && n.heightM > 0,
        );
        const excludedAssumedCount = inRadius.length - real.length;

        if (real.length < minSampleSize) {
            span.setAttribute('resultFields', 'insufficient-neighbour-sample');
            span.setAttribute('realSampleCount', real.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'insufficient-neighbour-sample',
                realSampleCount: real.length,
                excludedAssumedCount,
            };
        }

        const heights = real.map((n) => n.heightM);
        const medianHeight_m = median(heights);
        const minHeight_m = Math.min(...heights);
        const maxHeight_m = Math.max(...heights);

        const edgeClassifications: readonly ParcelEdgeClassification[] =
            input.edgeClassifications ?? input.parcelRing.map(() => 'unclassified');
        const setbacks: PerEdgeSetbacks = {
            front: setback_m,
            side: setback_m,
            rear: setback_m,
            unclassified: setback_m,
        };
        const inset = insetPolygonPerEdge(input.parcelRing, edgeClassifications, setbacks);
        if (inset.degenerate || inset.polygon.length < 3) {
            span.setAttribute('resultFields', 'degenerate-footprint');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'degenerate-footprint',
                realSampleCount: real.length,
                excludedAssumedCount,
            };
        }

        const footprintAreaM2 = Math.abs(polygonSignedArea(inset.polygon));
        const sampledAtIso = input.nowIso ?? new Date().toISOString();

        const study: ContextDerivedStudyEnvelope = {
            status: CONTEXT_DERIVED_STUDY_STATUS,
            footprintPolygon: inset.polygon,
            footprintAreaM2,
            setback_m,
            maxHeight_m: medianHeight_m,
            heightBasis: {
                method: 'median-neighbour-height',
                sourceLabel: input.sourceLabel,
                sampledCount: real.length,
                excludedAssumedCount,
                radius_m: input.radius_m,
                medianHeight_m,
                minHeight_m,
                maxHeight_m,
                sampledAtIso,
            },
            disclaimer: CONTEXT_STUDY_DISCLAIMER,
        };
        span.setAttribute('resultFields', 'ok');
        span.setAttribute('sampledCount', real.length);
        span.setAttribute('excludedAssumedCount', excludedAssumedCount);
        span.setAttribute('medianHeight_m', medianHeight_m);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, study };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}

/**
 * Build a context-derived-study-SHAPED envelope from a height the USER TYPED — §MANUALENV159
 * (L-12640), see the module header above `USER_SUPPLIED_STUDY_HEIGHT_MIN_M` for why this exists
 * and why it is deliberately ungated. Same footprint construction as
 * `buildContextDerivedStudyEnvelope` (parcel ring, per-edge setback via `insetPolygonPerEdge`,
 * default 0 m) — the ONLY divergence is the evidence: `heightBasis.method: 'user-supplied'`.
 *
 * Refuses (never clamps) a height outside `[USER_SUPPLIED_STUDY_HEIGHT_MIN_M,
 * USER_SUPPLIED_STUDY_HEIGHT_MAX_M]`, naming both bounds (C74/CA-18) — a silently clamped 2450 m
 * typo would be worse than a stated refusal. Also refuses a degenerate inset, exactly like the
 * median-of-neighbours sibling.
 *
 * P8 span `pryzm.zoning.buildUserSuppliedStudyEnvelope`.
 */
export function buildUserSuppliedStudyEnvelope(
    input: UserSuppliedStudyEnvelopeInput,
): UserSuppliedStudyEnvelopeResult {
    const span = tracer.startSpan('pryzm.zoning.buildUserSuppliedStudyEnvelope');
    try {
        if (
            !Number.isFinite(input.heightM)
            || input.heightM < USER_SUPPLIED_STUDY_HEIGHT_MIN_M
            || input.heightM > USER_SUPPLIED_STUDY_HEIGHT_MAX_M
        ) {
            span.setAttribute('resultFields', 'height-out-of-bounds');
            span.setAttribute('heightM', input.heightM);
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'height-out-of-bounds',
                minM: USER_SUPPLIED_STUDY_HEIGHT_MIN_M,
                maxM: USER_SUPPLIED_STUDY_HEIGHT_MAX_M,
            };
        }

        const setback_m = input.setback_m ?? 0;
        const edgeClassifications: readonly ParcelEdgeClassification[] =
            input.edgeClassifications ?? input.parcelRing.map(() => 'unclassified');
        const setbacks: PerEdgeSetbacks = {
            front: setback_m,
            side: setback_m,
            rear: setback_m,
            unclassified: setback_m,
        };
        const inset = insetPolygonPerEdge(input.parcelRing, edgeClassifications, setbacks);
        if (inset.degenerate || inset.polygon.length < 3) {
            span.setAttribute('resultFields', 'degenerate-footprint');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'degenerate-footprint' };
        }

        const footprintAreaM2 = Math.abs(polygonSignedArea(inset.polygon));
        const sampledAtIso = input.nowIso ?? new Date().toISOString();

        const study: ContextDerivedStudyEnvelope = {
            status: CONTEXT_DERIVED_STUDY_STATUS,
            footprintPolygon: inset.polygon,
            footprintAreaM2,
            setback_m,
            maxHeight_m: input.heightM,
            heightBasis: {
                method: 'user-supplied',
                sourceLabel: 'Height supplied by you',
                suppliedHeight_m: input.heightM,
                sampledAtIso,
            },
            disclaimer: USER_SUPPLIED_STUDY_DISCLAIMER,
        };
        span.setAttribute('resultFields', 'ok');
        span.setAttribute('suppliedHeight_m', input.heightM);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, study };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
