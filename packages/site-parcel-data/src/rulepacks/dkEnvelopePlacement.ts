// §L-619 / DK gap G6 — the DENMARK FOOTPRINT-PLACEMENT RESOLVER (`dkEnvelopeGeometryProvider`).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// DK Plandata publishes an envelope's NUMBERS (bebyggelsesprocent, bygningshøjde, etager) as
// structured WFS attributes — `dkPlandataEnvelope.ts` maps those under the signed L-449 mapping.
// It publishes NOTHING about WHERE on the parcel the building may stand. So the engine's per-edge
// inset saw `setbacks = null`, treated it as 0, and filled the whole parcel — and a Copenhagen
// karré, which really leaves a central courtyard, was drawn as a solid block (the founder's L-619
// defect).
//
// This module is the missing decision: GIVEN whatever placement evidence exists for this parcel,
// which source places the footprint, and what does the resulting void mean? It is the
// `dkEnvelopeGeometryProvider` of DENMARK-GAP-ROADMAP.md G6, and it implements that gap's stated
// source hierarchy in order:
//
//   TIER 1  byggefelt      — a PUBLISHED buildable-field polygon (G3). Strongest: the plan drew
//                            the footprint. ⚠ GATED ON PROVEN BINDINGNESS — see below.
//   TIER 2  byggelinjer    — building-line GEOMETRY (G2), edge-matched and MEASURED into a band.
//   TIER 3  lokalplan depth— a CITED §X depth from the plan text (G5).
//   TIER 4  block-derived  — the conservative Barcelona block-depth STUDY
//           study            (`DK_PERIMETER_BLOCK_COURTYARD_RULE`, ADR-0271 machinery reused).
//   else    REFUSE         — loudly. See §NO-SILENT-FALLBACK.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR HONESTY RULES THIS MODULE EXISTS TO ENFORCE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// 1. §UNKNOWN-IS-NOT-ZERO (L-616). A missing placement source is never a permissive default. The
//    resolver never invents a setback, a depth, or a courtyard dimension; where a tier cannot
//    speak it FALLS THROUGH with a recorded diagnostic, and where no tier can speak it REFUSES.
//
// 2. §FAILURE-IS-NOT-EMPTY (L-422/457/467/469). Every source arrives as a `FetchOutcome`, not a
//    nullable value, so "Plandata says there is no byggefelt here" (`absent` — durable, cacheable)
//    and "the byggefelt request failed" (`transient` — retryable) can never collapse to the same
//    input. When a HIGHER-authority tier was `transient`, the resolution still falls through to a
//    weaker tier (a study is better than nothing) but sets `higherAuthorityUnresolved` — the
//    caller MUST NOT cache that answer, because a retry could replace a study with plan geometry.
//
// 3. §NO-SILENT-FALLBACK (the strip-slicer lesson). A refusal is a VALUE with a typed reason, not
//    an empty result. `placed: false` + `refusalReason` is the whole answer; the caller is
//    expected to fall back to the structured full-parcel envelope, which the engine already marks
//    `footprintIsUpperBound` so the renderer hatches it. What must never happen is a quiet
//    degradation that still looks like a solved footprint.
//
// 4. §BYGGEFELT-BINDING-GATE (G3). `vedtaget` = ADOPTED ≠ BINDING; Danish plans mix binding
//    provisions with explanatory graphics. Using an advisory or unproven-bindingness byggefelt as
//    the footprint would overstate exactly as the DK audit caught. So tier 1 fires ONLY on
//    `binding: 'binding'`, and `'unknown'` (today's honest default until the `bygvejledende` /
//    `iomfangreg` flag is DescribeFeatureType-probed and planner-signed) falls through.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NOT a solver. It contains no geometry of its own beyond MEASURING published lines: it decides
// which existing `GeometricRule` the jurisdiction-agnostic engine should be handed, and stamps the
// resulting envelope's `placement` / `openSpace` provenance. The engine never learns it is serving
// Denmark (ADR-0279 §2) — this is the DK slot that keeps it that way.
//
// PURE (C58 §1.9) — no THREE, no DOM, no I/O, no RNG, no clock. Deterministic (C58 §1.1).
//
// Strategic context — docs/04-reference/jurisdictions/dk/DENMARK-GAP-ROADMAP.md (G2/G3/G5/G6/G7),
// ADR-0270 (the `GeometricRule` union), ADR-0271 (block-derived depth — the reused engine),
// ADR-0279 (five-slot onboarding), C58 §1.2/§1.4/§1.6/§1.11, C57 §1.5 (FetchOutcome), L-449, L-619.

import { trace } from '@opentelemetry/api';
import {
    BuildableEnvelopeSchema,
    type BuildableEnvelope,
    type EnvelopeOpenSpace,
    type EnvelopePlacement,
    type FetchOutcome,
    type GeometricRule,
    type ParcelEdgeClassification,
    type Pt,
} from '@pryzm/schemas';
import {
    firstFrontEdgeIndex,
    inwardEdgeNormal,
    lineParallelToEdge,
    signedDepthAlongNormal,
    type BuildingLineConstraint,
} from '../geometry/buildingLineOffset.js';
import { DK_PERIMETER_BLOCK_COURTYARD_RULE, DK_PERIMETER_BLOCK_STUDY_CAVEAT } from './dkPerimeterBlock.js';
import type { ExplicitAreaSource } from '../geometry/explicitArea.js';

const tracer = trace.getTracer('pryzm.zoning.dk');

/** Two lines closer than this are the same line for band purposes (mm-scale coordinate noise). */
const SAME_LINE_EPS_M = 0.05;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// INPUTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * G3 — a `byggefelt` (buildable-field polygon), with its BINDINGNESS as a first-class, closed
 * label rather than an assumption.
 *
 * ⚠ `'unknown'` is the honest default TODAY and is NOT a synonym for `'binding'`. Plandata's
 * `theme_pdk_byggefelt_vedtaget` publishes `vedtaget` (adopted) — which does not by itself make a
 * provision binding — and the candidate binding flags (`bygvejledende` / `iomfangreg` /
 * `bygkunifelt`) are not yet DescribeFeatureType-probed or planner-signed. Until they are, a
 * byggefelt is evidence of intent, not a footprint we may draw.
 */
export type DkByggefeltBinding = 'binding' | 'advisory' | 'unknown';

/** G3 — one published byggefelt polygon for this parcel, already projected to scene-XZ metres. */
export interface DkByggefelt {
    /** The published buildable-field ring (scene-XZ metres). */
    readonly ring: readonly Pt[];
    /** PROVEN bindingness only. `'unknown'` blocks tier 1 by design (§BYGGEFELT-BINDING-GATE). */
    readonly binding: DkByggefeltBinding;
    /** Plandata feature id, carried for the G11 evidence chain. */
    readonly featureId?: string | null;
}

/** G5 — a buildable depth READ FROM the lokalplan text, with its clause citation. */
export interface DkLokalplanDepth {
    /** The stated depth in metres (e.g. *"i en dybde af 12 meter"* → 12). Must be > 0. */
    readonly depthM: number;
    /** The clause that states it, e.g. `'Lokalplan 123 §7.2'`. NEVER fabricated (G11). */
    readonly citation: string;
}

/**
 * Every placement source, as a `FetchOutcome` so a failure and an absence stay distinguishable
 * (§FAILURE-IS-NOT-EMPTY). `null` means the source was NOT CONSULTED at all — a third state again
 * distinct from both, so a caller that has not wired byggelinjer yet is never mistaken for one
 * that asked and found none.
 */
export interface DkPlacementInputs {
    /** The parcel ring, scene-XZ metres. */
    readonly parcelRing: readonly Pt[];
    /** Per-edge classification, parallel to `parcelRing`. A frontage is required by tiers 2–4. */
    readonly parcelEdgeClassifications: readonly ParcelEdgeClassification[];
    /** TIER 1 — G3 byggefelt. */
    readonly byggefelt?: FetchOutcome<DkByggefelt> | null;
    /** TIER 2 — G2 byggelinjer. */
    readonly byggelinjer?: FetchOutcome<readonly BuildingLineConstraint[]> | null;
    /** TIER 3 — G5 lokalplan-text depth. */
    readonly lokalplanDepth?: FetchOutcome<DkLokalplanDepth> | null;
    /**
     * TIER 4 — is a resolvable BLOCK RING available for the conservative study?
     *
     * A boolean, not the ring: the engine takes `blockRing` directly and solving it here would
     * duplicate `solveBlockDerivedDepth`. This resolver only decides that the study tier MAY fire;
     * the engine still hard-refuses if the ring it is handed turns out degenerate (which is the
     * behaviour `dkCourtyardUpperBound.test.ts` pins).
     */
    readonly blockRingAvailable?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// OUTPUTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Which tier of the G6 hierarchy actually placed the footprint. */
export type DkPlacementTier = 'byggefelt' | 'byggelinjer' | 'lokalplan-depth' | 'block-derived-study';

/** Why a tier did not fire. A CLOSED vocabulary — these are legally different states, and a
 *  free-text string would let "nothing published here" blur into "the request failed". */
export type DkTierOutcome =
    /** This tier placed the footprint. */
    | 'used'
    /** The caller did not consult this source at all (not wired / not applicable). */
    | 'not-consulted'
    /** The source answered: there is genuinely nothing of this kind here. DURABLE. */
    | 'absent'
    /** The source did not answer (network / upstream). RETRYABLE — never cached as absence. */
    | 'transient'
    /** Superseded by a newer request. */
    | 'aborted'
    /** G3: a byggefelt exists but its BINDINGNESS is not proven — may not be drawn as a footprint. */
    | 'binding-unproven'
    /** Tiers 2–4 measure from a frontage and no parcel edge is classified `front`. */
    | 'no-front-edge'
    /** Byggelinjer exist but fewer than TWO are parallel to the frontage — a band needs two lines,
     *  and inventing the missing one is exactly the setback-unknown-drawn-as-zero failure. */
    | 'insufficient-lines-for-band'
    /** The source's geometry/value is degenerate (empty ring, non-positive depth, …). */
    | 'degenerate';

/** One line of the "why this tier did or did not place the footprint" record. */
export interface DkPlacementDiagnostic {
    readonly tier: DkPlacementTier;
    readonly outcome: DkTierOutcome;
    /** Human detail; for `absent`/`transient` this carries the source's own reason string. */
    readonly detail: string;
}

/** Why NO tier placed the footprint. */
export type DkPlacementRefusalReason =
    /** The parcel itself cannot support a placement (< 3 vertices). */
    | 'degenerate-parcel'
    /** Every consulted source was genuinely absent / unusable, and no study was available. */
    | 'no-usable-source'
    /**
     * At least one source DID NOT ANSWER and nothing weaker could stand in. Distinct from
     * `no-usable-source` because it is RETRYABLE and must not be cached as a coverage fact.
     */
    | 'sources-unresolved';

/**
 * The resolver's answer. A REFUSAL IS A VALUE (§NO-SILENT-FALLBACK): `placed: false` carries a
 * typed `refusalReason` and the full per-tier diagnostic trail, so a caller can neither mistake it
 * for a solved footprint nor lose the reason on the way to the UI.
 */
export interface DkPlacementResolution {
    /** TRUE iff a tier placed the footprint. */
    readonly placed: boolean;
    /** Which tier did, or null. */
    readonly tier: DkPlacementTier | null;
    /** The `BuildableEnvelope.placement` stamp for this determination, or null. */
    readonly placement: EnvelopePlacement | null;
    /** The `BuildableEnvelope.openSpace` stamp, or null when no void statement is warranted. */
    readonly openSpace: EnvelopeOpenSpace | null;
    /**
     * The rule to hand `computeBuildableEnvelope`. Null when refused. For tier 1 this is an
     * `explicit-area` rule and `explicitAreaSource` MUST be passed alongside it.
     */
    readonly geometricRule: GeometricRule | null;
    /** TIER 1 ONLY — the published footprint, in the engine's injected-source shape. */
    readonly explicitAreaSource: ExplicitAreaSource | null;
    /**
     * TIER 2 ONLY — the MEASURED distance from the frontage to the façade byggelinje. The caller
     * should feed this as the zone's `setbacks.front_m` so the band starts at the façade line
     * rather than at the parcel boundary.
     *
     * ⚠ A MEASUREMENT, NOT A LEGAL SETBACK. Plandata states no binding for a byggelinje; this is
     * the perpendicular distance between two published geometries, which is a fact. What it MEANS
     * legally is not asserted here (G2).
     */
    readonly facadeOffsetM: number | null;
    /** TIERS 2–3 — the buildable depth (m) the rule carries. Null for tiers 1 and 4 (tier 4's
     *  depth is solved from the block by the engine). */
    readonly buildableDepthM: number | null;
    /** Null iff `placed`. */
    readonly refusalReason: DkPlacementRefusalReason | null;
    /**
     * TRUE when a tier ABOVE the one that fired (or above the refusal) was `transient`. The answer
     * is provisional: DO NOT CACHE — a retry could replace a study band with published plan
     * geometry (§FAILURE-IS-NOT-EMPTY).
     */
    readonly higherAuthorityUnresolved: boolean;
    /** Per-tier record, ALWAYS complete: one entry per tier, in hierarchy order. */
    readonly diagnostics: readonly DkPlacementDiagnostic[];
    /** Caveats a consumer MUST surface with the result. */
    readonly caveats: readonly string[];
}

/** The `ringRef` handle the DK byggefelt tier uses on the generic `explicit-area` primitive. */
export const DK_BYGGEFELT_RING_REF = 'dk-plandata-byggefelt';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE RESOLVER
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Classify a source's outcome into a tier outcome, keeping transient ≠ absent. */
function outcomeOf<T>(o: FetchOutcome<T> | null | undefined): {
    readonly kind: DkTierOutcome;
    readonly detail: string;
    readonly value: T | null;
} {
    if (o === null || o === undefined) {
        return { kind: 'not-consulted', detail: 'source not consulted', value: null };
    }
    switch (o.status) {
        case 'found':
            return { kind: 'used', detail: 'source answered with a value', value: o.value };
        case 'absent':
            return { kind: 'absent', detail: o.reason, value: null };
        case 'transient':
            return { kind: 'transient', detail: o.reason, value: null };
        case 'aborted':
            return { kind: 'aborted', detail: o.reason ?? 'superseded', value: null };
    }
}

function refused(
    reason: DkPlacementRefusalReason,
    diagnostics: DkPlacementDiagnostic[],
    caveats: string[],
    higherAuthorityUnresolved: boolean,
): DkPlacementResolution {
    return {
        placed: false,
        tier: null,
        placement: null,
        openSpace: null,
        geometricRule: null,
        explicitAreaSource: null,
        facadeOffsetM: null,
        buildableDepthM: null,
        refusalReason: reason,
        higherAuthorityUnresolved,
        diagnostics,
        caveats,
    };
}

/**
 * Resolve WHERE the building may stand on a Danish parcel, under the G6 source hierarchy.
 *
 * PURE, deterministic, NEVER throws — every failure is a typed value. See the module header for
 * the four honesty rules this enforces.
 *
 * P8 — emits `pryzm.zoning.dk.resolveDkEnvelopePlacement` (the default no-op tracer does no I/O).
 */
export function resolveDkEnvelopePlacement(inputs: DkPlacementInputs): DkPlacementResolution {
    const span = tracer.startSpan('pryzm.zoning.dk.resolveDkEnvelopePlacement');
    try {
        const diagnostics: DkPlacementDiagnostic[] = [];
        const caveats: string[] = [];
        let higherAuthorityUnresolved = false;

        const { parcelRing, parcelEdgeClassifications } = inputs;
        if (parcelRing.length < 3) {
            diagnostics.push(
                { tier: 'byggefelt', outcome: 'degenerate', detail: 'parcel ring has < 3 vertices' },
                { tier: 'byggelinjer', outcome: 'degenerate', detail: 'parcel ring has < 3 vertices' },
                { tier: 'lokalplan-depth', outcome: 'degenerate', detail: 'parcel ring has < 3 vertices' },
                { tier: 'block-derived-study', outcome: 'degenerate', detail: 'parcel ring has < 3 vertices' },
            );
            span.setAttribute('placed', false);
            return refused('degenerate-parcel', diagnostics, caveats, false);
        }

        const frontIdx = firstFrontEdgeIndex(parcelEdgeClassifications);

        // ── TIER 1 — byggefelt (G3). Gated on PROVEN bindingness. ───────────────────────────
        const bf = outcomeOf(inputs.byggefelt);
        if (bf.value !== null) {
            const felt = bf.value;
            if (felt.ring.length < 3) {
                diagnostics.push({
                    tier: 'byggefelt',
                    outcome: 'degenerate',
                    detail: `byggefelt ring has ${felt.ring.length} vertices (< 3) — unusable as a footprint`,
                });
            } else if (felt.binding !== 'binding') {
                // §BYGGEFELT-BINDING-GATE. `vedtaget` (adopted) ≠ binding. Drawing an advisory or
                // unproven field as THE footprint is the over-statement the DK audit caught.
                diagnostics.push({
                    tier: 'byggefelt',
                    outcome: 'binding-unproven',
                    detail:
                        `byggefelt present but binding='${felt.binding}' — not PROVEN binding, so it ` +
                        'may not be drawn as the footprint (G3; vedtaget = adopted ≠ binding). ' +
                        'Resolve by DescribeFeatureType-probing bygvejledende / iomfangreg and ' +
                        'landing the Danish-planner sign-off.',
                });
            } else {
                diagnostics.push({
                    tier: 'byggefelt',
                    outcome: 'used',
                    detail: `binding byggefelt${felt.featureId ? ` (${felt.featureId})` : ''} used as the footprint`,
                });
                pushSkipped(diagnostics, ['byggelinjer', 'lokalplan-depth', 'block-derived-study'],
                    'a higher-authority source (binding byggefelt) placed the footprint');
                span.setAttribute('placed', true);
                span.setAttribute('tier', 'byggefelt');
                return {
                    placed: true,
                    tier: 'byggefelt',
                    placement: { source: 'byggefelt' },
                    // The void is whatever the parcel has that the published field does NOT cover.
                    // The engine computes `parcel ∩ byggefelt`, so a courtyard exists iff the field
                    // does not blanket the parcel — decided by the CLIP, not asserted here. What is
                    // asserted is only that this determination comes from the published hole.
                    openSpace: { courtyard: true, source: 'byggefelt-hole' },
                    geometricRule: { kind: 'explicit-area', ringRef: DK_BYGGEFELT_RING_REF },
                    explicitAreaSource: {
                        ringRef: DK_BYGGEFELT_RING_REF,
                        footprintRing: felt.ring,
                        edificabilidad: null,
                    },
                    facadeOffsetM: null,
                    buildableDepthM: null,
                    refusalReason: null,
                    higherAuthorityUnresolved,
                    diagnostics,
                    caveats,
                };
            }
        } else {
            diagnostics.push({ tier: 'byggefelt', outcome: bf.kind, detail: bf.detail });
            if (bf.kind === 'transient') higherAuthorityUnresolved = true;
        }

        // ── TIER 2 — byggelinjer (G2): MEASURE a band between two frontage-parallel lines. ───
        const bl = outcomeOf(inputs.byggelinjer);
        if (bl.value !== null) {
            const band = measureBuildingLineBand(parcelRing, frontIdx, bl.value);
            if (band.outcome === 'used') {
                diagnostics.push({
                    tier: 'byggelinjer',
                    outcome: 'used',
                    detail:
                        `${band.parallelLineCount} frontage-parallel byggelinjer → façade at ` +
                        `${band.facadeOffsetM.toFixed(2)} m, rear at ${band.rearOffsetM.toFixed(2)} m ` +
                        `(measured band depth ${band.depthM.toFixed(2)} m)`,
                });
                pushSkipped(diagnostics, ['lokalplan-depth', 'block-derived-study'],
                    'a higher-authority source (byggelinjer geometry) placed the footprint');
                caveats.push(
                    'Footprint placed from byggelinjer GEOMETRY: the façade offset and band depth ' +
                        'are MEASURED between published lines, not legal front/rear setbacks — ' +
                        'Plandata states no binding for a byggelinje (DK gap G2).',
                );
                span.setAttribute('placed', true);
                span.setAttribute('tier', 'byggelinjer');
                return {
                    placed: true,
                    tier: 'byggelinjer',
                    placement: { source: 'buildingLine' },
                    openSpace: { courtyard: true, source: 'building-line-band' },
                    geometricRule: {
                        kind: 'alignment',
                        alignTo: 'street',
                        alignmentOffset_m: band.facadeOffsetM,
                        // Perimeter-block (karré) fabric shares side walls along the frontage.
                        sideTreatment: 'party-wall',
                        // Measured from the PARCEL frontage, which is where `clipToDepthBand` cuts.
                        buildableDepth_m: band.rearOffsetM,
                    },
                    explicitAreaSource: null,
                    facadeOffsetM: band.facadeOffsetM,
                    buildableDepthM: band.rearOffsetM,
                    refusalReason: null,
                    higherAuthorityUnresolved,
                    diagnostics,
                    caveats,
                };
            }
            diagnostics.push({ tier: 'byggelinjer', outcome: band.outcome, detail: band.detail });
        } else {
            diagnostics.push({ tier: 'byggelinjer', outcome: bl.kind, detail: bl.detail });
            if (bl.kind === 'transient') higherAuthorityUnresolved = true;
        }

        // ── TIER 3 — a CITED lokalplan depth (G5). ───────────────────────────────────────────
        const lp = outcomeOf(inputs.lokalplanDepth);
        if (lp.value !== null) {
            const depth = lp.value;
            if (!Number.isFinite(depth.depthM) || depth.depthM <= 0) {
                diagnostics.push({
                    tier: 'lokalplan-depth',
                    outcome: 'degenerate',
                    detail: `cited depth ${String(depth.depthM)} is not a positive number`,
                });
            } else if (frontIdx === null) {
                diagnostics.push({
                    tier: 'lokalplan-depth',
                    outcome: 'no-front-edge',
                    detail:
                        'a stated buildable depth is measured from the frontage, and no parcel edge ' +
                        'is classified `front` — the depth cannot be located',
                });
            } else {
                diagnostics.push({
                    tier: 'lokalplan-depth',
                    outcome: 'used',
                    detail: `cited buildable depth ${depth.depthM} m (${depth.citation})`,
                });
                pushSkipped(diagnostics, ['block-derived-study'],
                    'a higher-authority source (cited lokalplan depth) placed the footprint');
                caveats.push(
                    `Buildable depth ${depth.depthM} m is stated by ${depth.citation} — official ` +
                        'plan text, not a study.',
                );
                span.setAttribute('placed', true);
                span.setAttribute('tier', 'lokalplan-depth');
                return {
                    placed: true,
                    tier: 'lokalplan-depth',
                    // `derived`: the footprint was CONSTRUCTED from a depth, not read off a published
                    // building-field or building-line geometry. Its OFFICIAL status lives in
                    // `openSpace.source: 'lokalplan-depth'` + the confidence label, per the schema.
                    placement: { source: 'derived' },
                    openSpace: { courtyard: true, source: 'lokalplan-depth' },
                    geometricRule: {
                        kind: 'alignment',
                        alignTo: 'street',
                        alignmentOffset_m: 0,
                        sideTreatment: 'party-wall',
                        buildableDepth_m: depth.depthM,
                    },
                    explicitAreaSource: null,
                    facadeOffsetM: null,
                    buildableDepthM: depth.depthM,
                    refusalReason: null,
                    higherAuthorityUnresolved,
                    diagnostics,
                    caveats,
                };
            }
        } else {
            diagnostics.push({ tier: 'lokalplan-depth', outcome: lp.kind, detail: lp.detail });
            if (lp.kind === 'transient') higherAuthorityUnresolved = true;
        }

        // ── TIER 4 — the conservative block-derived STUDY (ADR-0271 machinery, DK parameters). ─
        if (inputs.blockRingAvailable !== true) {
            diagnostics.push({
                tier: 'block-derived-study',
                outcome: 'not-consulted',
                detail: 'no block ring available — the study band is a function of the block',
            });
        } else if (frontIdx === null) {
            diagnostics.push({
                tier: 'block-derived-study',
                outcome: 'no-front-edge',
                detail:
                    'the study band is measured from the frontage, and no parcel edge is classified ' +
                    '`front` — the engine refuses block-derived alignment without one (by design)',
            });
        } else {
            diagnostics.push({
                tier: 'block-derived-study',
                outcome: 'used',
                detail:
                    'conservative perimeter-block (karré) study band, reusing the ADR-0271 ' +
                    'block-derived construction with DK study parameters',
            });
            caveats.push(DK_PERIMETER_BLOCK_STUDY_CAVEAT);
            if (higherAuthorityUnresolved) {
                caveats.push(
                    'PROVISIONAL — a higher-authority placement source did not answer (transient). ' +
                        'This study band may be replaced by published plan geometry on retry; do NOT ' +
                        'cache it as this parcel’s placement (§CONTEXT-DATA-HONESTY).',
                );
            }
            span.setAttribute('placed', true);
            span.setAttribute('tier', 'block-derived-study');
            return {
                placed: true,
                tier: 'block-derived-study',
                placement: { source: 'derived' },
                // The Art.-242.2-shaped construction keeps ≥ interiorFreeRatio of the BLOCK free —
                // that is a block-level statement, which is exactly what `block-derived-study` names.
                openSpace: { courtyard: true, source: 'block-derived-study' },
                geometricRule: DK_PERIMETER_BLOCK_COURTYARD_RULE,
                explicitAreaSource: null,
                facadeOffsetM: null,
                buildableDepthM: null,
                refusalReason: null,
                higherAuthorityUnresolved,
                diagnostics,
                caveats,
            };
        }

        // ── NO TIER FIRED — refuse LOUDLY (§NO-SILENT-FALLBACK). ─────────────────────────────
        caveats.push(
            'No placement source could locate the building on this parcel. The structured DK ' +
                'envelope still applies, but its footprint is the WHOLE PARCEL as an UPPER BOUND ' +
                '(the engine flags `footprintIsUpperBound`) — it must be rendered as a study, never ' +
                'as a solved buildable area (§L-619).',
        );
        if (higherAuthorityUnresolved) {
            caveats.push(
                'At least one placement source DID NOT ANSWER (transient) — this refusal is ' +
                    'RETRYABLE and must NOT be cached as "no placement data published here".',
            );
        }
        span.setAttribute('placed', false);
        return refused(
            higherAuthorityUnresolved ? 'sources-unresolved' : 'no-usable-source',
            diagnostics,
            caveats,
            higherAuthorityUnresolved,
        );
    } finally {
        span.end();
    }
}

/** Record the tiers that were never reached because a stronger one won — so the diagnostic trail
 *  is ALWAYS complete and "not reached" never reads as "found nothing". */
function pushSkipped(
    into: DkPlacementDiagnostic[],
    tiers: readonly DkPlacementTier[],
    detail: string,
): void {
    for (const tier of tiers) into.push({ tier, outcome: 'not-consulted', detail });
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// TIER 2 — the byggelinjer band measurement
// ──────────────────────────────────────────────────────────────────────────────────────────────

type BandMeasurement =
    | {
          readonly outcome: 'used';
          readonly facadeOffsetM: number;
          readonly rearOffsetM: number;
          readonly depthM: number;
          readonly parallelLineCount: number;
      }
    | { readonly outcome: Exclude<DkTierOutcome, 'used'>; readonly detail: string };

/**
 * Turn published byggelinjer into a MEASURED building band on the frontage.
 *
 * ⚠ THE LOAD-BEARING REFUSAL: a band needs TWO lines (a façade line and a rear line). With ONE
 * frontage-parallel byggelinje we know where the façade sits and NOTHING about how deep the
 * building may go — and filling the parcel to its rear boundary would be the "setback unknown,
 * drawn as zero" over-statement of L-616 in a new costume. So one line REFUSES this tier and falls
 * through to a source that can state a depth. We never synthesise the second line.
 *
 * PURE.
 */
function measureBuildingLineBand(
    parcelRing: readonly Pt[],
    frontIdx: number | null,
    lines: readonly BuildingLineConstraint[],
): BandMeasurement {
    if (lines.length === 0) {
        return { outcome: 'absent', detail: 'the byggelinje dataset returned no lines for this parcel' };
    }
    if (frontIdx === null) {
        return {
            outcome: 'no-front-edge',
            detail:
                'byggelinjer are present but no parcel edge is classified `front` — a building line ' +
                'is only a depth once you know which frontage it runs along (never assume north)',
        };
    }
    const normal = inwardEdgeNormal(parcelRing, frontIdx);
    if (!normal) {
        return { outcome: 'degenerate', detail: 'the front parcel edge is degenerate (zero length)' };
    }
    const edgeA = parcelRing[frontIdx % parcelRing.length]!;

    // Keep only the lines that RUN ALONG the frontage: a line crossing it is not a façade/rear line.
    const depths: number[] = [];
    for (const line of lines) {
        if (line.geometry.length < 2) continue;
        if (!lineParallelToEdge(parcelRing, frontIdx, line.geometry)) continue;
        // Measure the line's representative point as a depth into the parcel from the frontage.
        let sum = 0;
        for (const p of line.geometry) sum += signedDepthAlongNormal(p, edgeA, normal);
        depths.push(sum / line.geometry.length);
    }
    if (depths.length === 0) {
        return {
            outcome: 'insufficient-lines-for-band',
            detail: `${lines.length} byggelinje(s) present, none parallel to the frontage`,
        };
    }
    depths.sort((a, b) => a - b);
    const facadeOffsetM = depths[0]!;
    const rearOffsetM = depths[depths.length - 1]!;
    if (rearOffsetM - facadeOffsetM <= SAME_LINE_EPS_M) {
        return {
            outcome: 'insufficient-lines-for-band',
            detail:
                `${depths.length} frontage-parallel byggelinje(s) resolve to a single depth ` +
                `(${facadeOffsetM.toFixed(2)} m) — a band needs a façade line AND a rear line. The ` +
                'depth is NOT synthesised; a weaker source must state it (DK gap G2/G5).',
        };
    }
    if (rearOffsetM <= 0) {
        return {
            outcome: 'degenerate',
            detail:
                'every frontage-parallel byggelinje lies OUTSIDE the parcel (non-positive depth) — ' +
                'these lines do not constrain this parcel',
        };
    }
    return {
        outcome: 'used',
        facadeOffsetM: Math.max(0, facadeOffsetM),
        rearOffsetM,
        depthM: rearOffsetM - Math.max(0, facadeOffsetM),
        parallelLineCount: depths.length,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// STAMPING — the only way placement/openSpace reach a BuildableEnvelope
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Stamp a placement resolution onto a solved envelope.
 *
 * This is the seam ADR-0279 §2 requires: `computeBuildableEnvelope` stays jurisdiction-agnostic and
 * returns `placement: null` / `openSpace: null`, and Denmark's own resolver applies its vocabulary
 * here. Any future jurisdiction that grows a placement resolver gets its own stamper, not a branch
 * in the engine.
 *
 * ⚠ VALIDATES rather than trusts. The result is re-parsed through `BuildableEnvelopeSchema`, so the
 * L0 refinements (open-space needs a placement; the void's evidence class must match the
 * footprint's; a courtyard and a full-parcel upper bound are mutually exclusive) fire HERE, loudly,
 * instead of a mislabelled envelope reaching a renderer. A refused resolution stamps nothing.
 *
 * THROWS on an incoherent pairing — deliberately. An envelope that claims a published byggefelt
 * hole around a constructed study band is a data-integrity failure, and the one behaviour C58 §1.4
 * forbids is letting it through quietly.
 */
export function applyDkPlacement(
    envelope: BuildableEnvelope,
    resolution: DkPlacementResolution,
): BuildableEnvelope {
    if (!resolution.placed) return envelope;
    // A refused/degenerate envelope has no footprint to attribute — stamping a courtyard onto it
    // would describe a void inside a solid that does not exist.
    if (envelope.status !== 'ok') return envelope;
    return BuildableEnvelopeSchema.parse({
        ...envelope,
        placement: resolution.placement,
        openSpace: resolution.openSpace,
        caveats: [...envelope.caveats, ...resolution.caveats],
    });
}
