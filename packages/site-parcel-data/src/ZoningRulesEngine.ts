// C58 §3.2 — `ZoningRulesEngine`: the PURE, deterministic buildable-envelope
// solver. `(parcel + edge classifications + zoning record + rule pack)` →
// `BuildableEnvelope`.
//
// L2-pure (C58 §1.9): no THREE / DOM / I-O / RNG / clock. Same inputs →
// byte-identical output (C58 §1.1). The ONLY runtime surface is the OTel span
// (C58 §1.10 / P8) — the default no-op tracer performs no I/O.
//
// Jurisdiction-agnostic (C58 §1.5): zero jurisdiction-specific logic. All
// jurisdiction knowledge lives in the `ZoningRecord` (from a provider) + the
// `JurisdictionZoningContract` (a data pack). Adding DK/ES is a new pack, never
// an engine edit.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §3.2.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type {
    Pt,
    ParcelEdgeClassification,
    ZoningRecord,
    JurisdictionZoningContract,
    ZoningRule,
    BuildableEnvelope,
    DerivationEntry,
    EnvelopeConfidence,
    EnvelopeTier,
    FieldProvenance,
    PermittedUse,
} from '@pryzm/schemas';
import { principalTier } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import type { GeometricRule } from '@pryzm/schemas';
import { clipToDepthBand, clipBeyondDepthBand } from './geometry/depthBandClip';
import { insetPolygonPerEdge, type PerEdgeSetbacks } from './geometry/insetPolygon.js';
import { solveBlockDerivedDepth, type BlockDepthBinding } from './geometry/blockDerivedDepth.js';
import { solveBlockConcentricBandDepth } from './geometry/blockConcentricBand.js';
import { solveExplicitArea } from './geometry/explicitArea.js';

const tracer = trace.getTracer('pryzm.zoning');

export interface ComputeBuildableEnvelopeInput {
    /** Closed parcel ring in scene-XZ metres (C19 `Parcel.boundary.polygon`). */
    readonly parcelRing: ReadonlyArray<Pt>;
    /** One classification per edge (C19 §2.3); may be all `unclassified`. */
    readonly edgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** The raw zoning at the parcel (from a provider, or the estimated default). */
    readonly zoning: ZoningRecord;
    /** The curated rule pack for the jurisdiction, or null (structured-only). */
    readonly rulePack: JurisdictionZoningContract | null;
    /**
     * ADR-0270 / §L-451 — the zone's GEOMETRIC RULE, when the pack declares one.
     *
     * OPTIONAL AND ADDITIVE: omitted (or `kind: 'setback'`) reproduces today's behaviour
     * byte-for-byte — the front/side/rear inset. Only `kind: 'alignment'` takes the new path.
     * Every pack shipped before ADR-0270 is implicitly a setback rule, so absence is not a
     * missing input, it IS the legacy semantic (see `GeometricRuleCompatSchema`).
     */
    readonly geometricRule?: GeometricRule | null;
    /**
     * ADR-0271 — the BLOCK (*manzana*) ring, in the same scene-XZ frame as `parcelRing`.
     *
     * OPTIONAL, and required ONLY by `kind: 'block-derived-alignment'`. PGM Art. 242.2 derives
     * the *profunditat edificable* from the block, so for that rule kind the engine genuinely
     * cannot answer without it — and it does NOT fall back to the ordinance floor, because that
     * would publish a depth the ordinance does not sanction for this block.
     *
     * ⚠ INJECTED, NEVER FETCHED (C58 §1.9 purity, C01 layering): the caller resolves this from
     * Catastro or the OSM roads layer at L5 and hands it in already projected. The engine stays
     * pure and has no idea where it came from.
     */
    readonly blockRing?: ReadonlyArray<Pt> | null;
    /**
     * Per-edge classification of `blockRing`. Edges classified `front` are the street frontages
     * the depth is measured from. Length MUST equal `blockRing.length`.
     */
    readonly blockEdgeClassifications?: ReadonlyArray<ParcelEdgeClassification> | null;
}

/** A single numeric field resolution (C58 §1.2 priority order). */
interface Resolved<T> {
    readonly value: T | null;
    readonly provenance: FieldProvenance;
    readonly from: 'structured' | 'pack' | 'none';
}

function findZone(
    pack: JurisdictionZoningContract | null,
    zoneCode: string,
): ZoningRule | null {
    if (!pack) return null;
    return pack.zones.find((z) => z.code === zoneCode) ?? null;
}

/**
 * Resolve one numeric field in C58 §1.2 priority order:
 *   1. structured (provider published it directly) → `published-structured`.
 *   2. rule-pack zone value → the pack's per-field provenance (default estimated).
 *   3. none → null.
 */
function resolveNumber(
    structured: number | null | undefined,
    packValue: number | null | undefined,
    packProvenance: FieldProvenance | undefined,
): Resolved<number> {
    if (structured !== null && structured !== undefined) {
        return { value: structured, provenance: 'published-structured', from: 'structured' };
    }
    if (packValue !== null && packValue !== undefined) {
        return { value: packValue, provenance: packProvenance ?? 'estimated', from: 'pack' };
    }
    return { value: null, provenance: 'estimated', from: 'none' };
}

/**
 * Solve the buildable envelope (C58 §3.2). Deterministic + pure. Emits the
 * `pryzm.zoning.computeBuildableEnvelope` span (C58 §1.10 / P8).
 */
export function computeBuildableEnvelope(
    input: ComputeBuildableEnvelopeInput,
): BuildableEnvelope {
    const span = tracer.startSpan('pryzm.zoning.computeBuildableEnvelope');
    try {
        const { parcelRing, edgeClassifications, zoning, rulePack } = input;
        const blockRing = input.blockRing ?? null;
        const blockEdgeClassifications = input.blockEdgeClassifications ?? null;
        const zone = findZone(rulePack, zoning.zoneCode);
        // ADR-0270 P5 — the rule may now come FROM THE PACK ZONE, which is how a curated
        // *ensanche* pack declares itself. The explicit `input.geometricRule` still wins so a
        // caller (and the A1b tests) can override, but before this line the pack had no voice at
        // all: `geometricRule` was a sibling input nothing in production ever populated, so the
        // whole alignment branch below was reachable only from tests. `??` not `||` — a pack that
        // deliberately declares `null` (legacy setback behaviour) must not be overridden.
        const geometricRule = input.geometricRule ?? zone?.geometricRule ?? null;
        const structured = zoning.structuredFields ?? {};
        const packProv = zone?.fieldProvenance ?? {};
        const source = zone
            ? rulePack!.jurisdictionId
            : zoning.provenance.source;
        // C58 §1.3 — cite the governing document. A curated pack zone's ordinanceRef
        // wins; else a structured provider's record-level citation (DK Plandata
        // `doklink`); else null (never fabricated).
        const ordinanceRef = zone?.ordinanceRef ?? zoning.ordinanceRef ?? null;

        // ── Resolve each constraint (C58 §1.2). ──────────────────────────────
        const front = resolveNumber(
            structured.setbacks?.front_m,
            zone?.setbacks.front_m,
            packProv['setback.front'],
        );
        const side = resolveNumber(
            structured.setbacks?.side_m,
            zone?.setbacks.side_m,
            packProv['setback.side'],
        );
        const rear = resolveNumber(
            structured.setbacks?.rear_m,
            zone?.setbacks.rear_m,
            packProv['setback.rear'],
        );
        const maxHeight = resolveNumber(
            structured.maxHeight_m,
            zone?.maxHeight_m,
            packProv['maxHeight'],
        );
        const maxFloors = resolveNumber(
            structured.maxFloors,
            zone?.maxFloors,
            packProv['maxFloors'],
        );
        const maxFAR = resolveNumber(
            structured.plotRatioFAR,
            zone?.plotRatioFAR,
            packProv['maxFAR'],
        );
        const maxCoverage = resolveNumber(
            structured.maxCoverage,
            zone?.maxCoverage,
            packProv['maxCoverage'],
        );
        const permittedUse: PermittedUse[] =
            structured.permittedUse && structured.permittedUse.length > 0
                ? structured.permittedUse
                : zone?.permittedUse ?? [];
        const permittedUseProv: FieldProvenance =
            structured.permittedUse && structured.permittedUse.length > 0
                ? 'published-structured'
                : packProv['permittedUse'] ?? 'estimated';

        const resolutions = [front, side, rear, maxHeight, maxFloors, maxFAR, maxCoverage];
        const anyResolved = resolutions.some((r) => r.from !== 'none') || permittedUse.length > 0;

        // ── Confidence (C58 §1.2). ───────────────────────────────────────────
        // Structured only iff EVERY resolved number came from the provider; else
        // estimated-ruleset (any pack-derived number taints it — the honest label).
        const anyFromPack = resolutions.some((r) => r.from === 'pack') || permittedUseProv === 'estimated';
        const anyFromStructured = resolutions.some((r) => r.from === 'structured');
        let confidence: EnvelopeConfidence = 'estimated-ruleset';
        if (anyResolved && !anyFromPack && anyFromStructured) confidence = 'structured';

        // ── Build the derivation trace (C58 §1.3). ───────────────────────────
        const derivation: DerivationEntry[] = [];
        const addEntry = (
            constraint: DerivationEntry['constraint'],
            r: Resolved<number>,
        ): void => {
            if (r.value === null) return;
            derivation.push({
                constraint,
                value: r.value,
                zoneCode: zoning.zoneCode,
                source,
                fieldProvenance: r.provenance,
                ordinanceRef,
            });
        };
        addEntry('setback.front', front);
        addEntry('setback.side', side);
        addEntry('setback.rear', rear);
        addEntry('maxHeight', maxHeight);
        addEntry('maxFAR', maxFAR);
        addEntry('maxCoverage', maxCoverage);
        if (permittedUse.length > 0) {
            derivation.push({
                constraint: 'permittedUse',
                value: permittedUse,
                zoneCode: zoning.zoneCode,
                source,
                fieldProvenance: permittedUseProv,
                ordinanceRef,
            });
        }

        const caveats: string[] = [];

        // ── Compute the setback inset (C58 §3.2). ────────────────────────────
        // C58 §10.3: until per-edge front/side/rear classification exists, a
        // uniform setback is the sanctioned fallback (flagged in caveats).
        const allUnclassified =
            edgeClassifications.length === 0 ||
            edgeClassifications.every((c) => c === 'unclassified');
        const frontV = front.value ?? 0;
        const sideV = side.value ?? 0;
        const rearV = rear.value ?? 0;
        const present = [frontV, sideV, rearV].filter((v) => v > 0);
        const uniform = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
        if (allUnclassified && (frontV || sideV || rearV)) {
            caveats.push(
                `Uniform setback ${uniform.toFixed(2)} m applied (parcel edges are unclassified — ` +
                    `per-edge front/side/rear pending C19 edge classification, C58 §10.3).`,
            );
        }
        const setbacks: PerEdgeSetbacks = {
            front: frontV,
            side: sideV,
            rear: rearV,
            unclassified: uniform,
        };

        let status: BuildableEnvelope['status'] = 'none';
        let insetPolygon: Pt[] = [];
        let insetAreaM2 = 0;
        let maxVolumeM3: number | null = null;
        // §L-590b / ADR-0273 — the tiers of a multi-tier envelope. EMPTY for every rule kind that
        // yields a single prism, which is all of them except `tiered-occupation`.
        let tiers: EnvelopeTier[] = [];
        // §L-590b — set ONLY by the tiered branch, where the headline height is the PRINCIPAL
        // TIER's rather than the zone-level resolution. `undefined` (not `null`) means "the tiered
        // branch did not run", which is the state every other zone is in — `null` is a real value
        // there (a tier whose height honestly refuses).
        let tieredMaxHeight: number | null | undefined;
        let tieredMaxFloors: number | null | undefined;

        if (!anyResolved) {
            caveats.push('No zoning data resolved for this parcel — no envelope (C58 §1.2 fidelity “none”).');
        } else if (parcelRing.length < 3) {
            status = 'degenerate';
            caveats.push('Parcel polygon is degenerate (< 3 vertices) — no envelope.');
        } else {
            const inset = insetPolygonPerEdge(parcelRing, edgeClassifications, setbacks);
            if (inset.degenerate || inset.polygon.length < 3) {
                status = 'degenerate';
                caveats.push(
                    'Setbacks consume the whole parcel (≥ half its width) — no buildable envelope remains.',
                );
            } else {
                status = 'ok';
                insetPolygon = inset.polygon;

                // ── ADR-0270 P2 — ALIGNMENT ZONES: apply *profundidad edificable* ──────────
                //
                // The inset above has already handled the alignment offset (front), the party
                // wall or side setback, and any rear patio — it is a per-edge operation and
                // that is exactly what those are. What it CANNOT express is the depth cap,
                // because that measures from ONE edge and says nothing about the others.
                //
                // So the alignment envelope is a COMPOSITION of two existing, separately
                // tested operations rather than a second solver:
                //     insetPolygonPerEdge(...)  THEN  clipToDepthBand(...)
                // No parallel path, no fork of C58 §2.4.
                // ADR-0271 — `block-derived-alignment` is the SAME geometric operation as
                // `alignment`; only the DEPTH's origin differs (solved from the block per PGM
                // Art. 242.2, rather than stated as a scalar). So both kinds resolve a depth and
                // then share ONE clip path below — no second solver, no duplicated frontage
                // logic that could drift apart on a compliance number.
                if (
                    geometricRule?.kind === 'alignment' ||
                    geometricRule?.kind === 'block-derived-alignment'
                ) {
                    // ── ADR-0270 P4 — the rule must EXPLAIN ITSELF (C58 §1.3). ──────────
                    // Previously the alignment rule shaped the envelope but was recorded only
                    // in free-text `caveats`, which the compliance report does not read — so
                    // "Why these numbers?" showed three setbacks and silently omitted the
                    // constraint that actually did the work. A user would reasonably conclude
                    // the triple governed the plot. These rows make the real rule citable.
                    // Emitted BEFORE the geometry runs so the trace explains the rule that was
                    // APPLIED even when the result turns out degenerate.
                    const alignProv = zone?.fieldProvenance['alignment.depth']
                        ?? zone?.fieldProvenance['geometricRule']
                        ?? 'estimated';
                    const addAlign = (
                        constraint: DerivationEntry['constraint'],
                        value: number | string,
                    ): void => {
                        derivation.push({
                            constraint, value, zoneCode: zoning.zoneCode, source,
                            fieldProvenance: alignProv, ordinanceRef,
                        });
                    };
                    // ── ADR-0271 — resolve the depth. Stated, or CONSTRUCTED from the block. ──
                    let buildableDepth_m: number | null = null;
                    let depthBinding: BlockDepthBinding | null = null;

                    if (geometricRule.kind === 'alignment') {
                        buildableDepth_m = geometricRule.buildableDepth_m;
                    } else if (!blockRing || !blockEdgeClassifications) {
                        // HARD FAIL, and deliberately NOT a fall back to `minDepth_m`. The floor
                        // is an ordinance BOUND on the construction, not a default answer — using
                        // it here would publish a depth Art. 242 does not sanction for THIS block
                        // while looking like a computed result. C58 §1.2 tier 3: no data → no
                        // envelope, never a fabricated one.
                        status = 'degenerate';
                        caveats.push(
                            'Block-derived zone (PGM Art. 242.2), but no block ring was supplied ' +
                            '— the profunditat edificable is a function of the block and cannot ' +
                            'be constructed from the parcel alone. No envelope (C58 §1.2, §1.4).',
                        );
                    } else if (blockEdgeClassifications.length !== blockRing.length) {
                        // A misaligned classification array would silently mis-identify which
                        // edges are street frontages, producing a plausible depth measured from
                        // the wrong sides. Refuse rather than compute from a mismatched pair.
                        status = 'degenerate';
                        caveats.push(
                            'Block-derived zone: blockEdgeClassifications length does not match ' +
                            'blockRing — frontages cannot be identified. No envelope.',
                        );
                    } else {
                        const solved = solveBlockDerivedDepth({
                            blockRing,
                            blockEdgeClassifications,
                            interiorFreeRatio: geometricRule.interiorFreeRatio,
                            minDepth_m: geometricRule.minDepth_m,
                            maxDepth_m: geometricRule.maxDepth_m,
                        });
                        if (!solved) {
                            status = 'degenerate';
                            caveats.push(
                                'Block-derived zone: the Art. 242.2 construction has no solution ' +
                                'on this block (degenerate or frontage-less ring). No envelope.',
                            );
                        } else {
                            buildableDepth_m = solved.depth_m;
                            depthBinding = solved.binding;
                        }
                    }

                    if (buildableDepth_m === null) {
                        // Every path above that leaves the depth unresolved has already set
                        // `status` and pushed a caveat. Clear the ring so no partial inset —
                        // which would read as a real envelope — escapes (cf. L-445).
                        insetPolygon = [];
                    } else {
                        addAlign('alignment.depth', buildableDepth_m);
                        addAlign('alignment.offset', geometricRule.alignmentOffset_m);
                        addAlign('alignment.sideTreatment', geometricRule.sideTreatment);
                        if (depthBinding !== null) {
                            // C58 §1.3 — WHICH rule bound the depth is a different legal
                            // statement from the depth itself: "the 30% courtyard rule set this"
                            // vs "the 30 m cap set this". The explain-why report needs the
                            // distinction, so it is a derivation row, not a log line.
                            addAlign('alignment.depthBinding', depthBinding);
                        }

                        const frontIdx = edgeClassifications.findIndex((c) => c === 'front');
                        if (frontIdx < 0) {
                            // HARD FAIL, not a silent fallback. Without a front edge there is no
                            // alineación to measure from, and skipping the clip would return the
                            // FULL-DEPTH ring — a confidently wrong buildable area, which is the
                            // precise defect ADR-0270 exists to prevent. Refuse the envelope
                            // instead (C58 §1.4: never present a guess as a fact).
                            status = 'degenerate';
                            insetPolygon = [];
                            caveats.push(
                                'Alignment zone, but no parcel edge is classified `front` — the ' +
                                'alineación cannot be located, so profundidad edificable cannot ' +
                                'be applied. No envelope (ADR-0270; C58 §1.4).',
                            );
                        } else {
                            // Fixed 2 dp for PROSE only — the derivation row above carries the
                            // full value. Deterministic, and it keeps a CONSTRUCTED depth from
                            // reading as false precision (20.35 m, not 20.34718...).
                            const depthTxt = buildableDepth_m.toFixed(2);
                            // A constructed depth must never be cited as if the ordinance had
                            // stated it — that is the whole distinction ADR-0271 exists to keep.
                            const depthOrigin = depthBinding === null
                                ? '(ADR-0270)'
                                : `(constructed per PGM Art. 242.2 — ADR-0271)`;
                            const a = parcelRing[frontIdx]!;
                            const b = parcelRing[(frontIdx + 1) % parcelRing.length]!;
                            const clipped = clipToDepthBand(
                                insetPolygon, a, b, buildableDepth_m,
                            );
                            if (clipped.degenerate || clipped.polygon.length < 3) {
                                status = 'degenerate';
                                insetPolygon = [];
                                caveats.push(
                                    `Profundidad edificable ${depthTxt} m ` +
                                    'leaves no buildable area after setbacks — no envelope.',
                                );
                            } else {
                                insetPolygon = clipped.polygon;
                                caveats.push(
                                    clipped.bandInactive
                                        // Stated explicitly: citing a depth limit that never
                                        // bound anything would misrepresent what constrained
                                        // the envelope (C58 §1.3 explain-why).
                                        ? `Profundidad edificable ${depthTxt} m ` +
                                          'is NOT binding here — the parcel is shallower than ' +
                                          'the ordinance permits; setbacks alone govern.'
                                        : `Profundidad edificable ${depthTxt} m ` +
                                          `applied from the alineación ${depthOrigin}.`,
                                );
                            }
                        }
                    }
                }

                // ── §L-590b / ADR-0273 — TIERED OCCUPATION (PGM Art. 350.2). ─────────────────
                //
                // The ordinance grants two DIFFERENT HEIGHTS over two DIFFERENT PARTS of the same
                // parcel, and the line between them is drawn on the BLOCK:
                //   • inside the band concentric with the block alignments whose area equals 70 %
                //     of the block (Art. 350.2.b) — the Art. 350.2.c street-width height;
                //   • in the block interior beyond it (Art. 350.2.e) — 5 m, one indivisible storey.
                //
                // ⚠ NOT A SECOND SOLVER. Like the alignment branch above, this is a COMPOSITION of
                // pieces that already exist and are separately tested: the per-edge inset has
                // already run; `solveBlockConcentricBandDepth` turns Art. 350.2.b's area equality
                // into a depth using the SAME erosion `solveBlockDerivedDepth` uses; and the two
                // tiers are cut from the inset by `clipToDepthBand` / `clipBeyondDepthBand`, which
                // share one inward normal and one Sutherland–Hodgman pass so the tiers tile the
                // footprint exactly. No new geometry primitive is introduced by this branch.
                else if (geometricRule?.kind === 'tiered-occupation') {
                    const tierProv = zone?.fieldProvenance['geometricRule'] ?? 'estimated';
                    const addTierRow = (
                        constraint: DerivationEntry['constraint'],
                        value: number | string,
                    ): void => {
                        derivation.push({
                            constraint, value, zoneCode: zoning.zoneCode, source,
                            fieldProvenance: tierProv, ordinanceRef,
                        });
                    };
                    // Emitted BEFORE the geometry, exactly as the alignment branch does: the trace
                    // must explain the rule that was APPLIED even when the result is degenerate,
                    // or "why no envelope?" reads as a crash rather than as a determination.
                    addTierRow('tier.bandAreaRatio', geometricRule.bandAreaRatioOfBlock);
                    addTierRow('tier.interiorHeight', geometricRule.interiorTierHeight_m);

                    const frontIdx = edgeClassifications.findIndex((c) => c === 'front');
                    if (!blockRing || !blockEdgeClassifications) {
                        // HARD FAIL. Art. 350.2.b's band is CONCENTRIC WITH THE BLOCK; without a
                        // block there is nothing to be concentric with, and falling through to the
                        // un-tiered inset would publish the WHOLE parcel at the tall tier's height
                        // — a 100 % envelope beside this zone's own 90 % occupation cap, which is
                        // the exact over-statement §BCN_22A_ENVELOPE_BLOCKER refused to ship.
                        status = 'degenerate';
                        insetPolygon = [];
                        caveats.push(
                            'Tiered zone (PGM Art. 350.2.b), but no block ring was supplied — the ' +
                            'franja concèntrica is a function of the block and cannot be ' +
                            'constructed from the parcel alone. No envelope (C58 §1.2, §1.4).',
                        );
                    } else if (blockEdgeClassifications.length !== blockRing.length) {
                        status = 'degenerate';
                        insetPolygon = [];
                        caveats.push(
                            'Tiered zone: blockEdgeClassifications length does not match ' +
                            'blockRing — the alineacions de l’illa cannot be identified. No envelope.',
                        );
                    } else if (frontIdx < 0) {
                        // Same asymmetry as the alignment branch: with no parcel edge on the
                        // street there is no line to measure the tier boundary from, and skipping
                        // the split would silently merge two tiers into the taller one.
                        status = 'degenerate';
                        insetPolygon = [];
                        caveats.push(
                            'Tiered zone, but no parcel edge is classified `front` — the tier ' +
                            'boundary cannot be located on this plot. No envelope (C58 §1.4).',
                        );
                    } else {
                        const solvedBand = solveBlockConcentricBandDepth({
                            blockRing,
                            blockEdgeClassifications,
                            bandAreaRatio: geometricRule.bandAreaRatioOfBlock,
                        });
                        if (!solvedBand) {
                            status = 'degenerate';
                            insetPolygon = [];
                            caveats.push(
                                'Tiered zone: the Art. 350.2.b band cannot be constructed on this ' +
                                'block (degenerate ring, or no edge identified as a street ' +
                                'alignment). No envelope.',
                            );
                        } else if (solvedBand.degenerate) {
                            // ⚠ CITE OUR GEOMETRY, NEVER THE ARTICLE. Art. 350.2.b's equality
                            // always has a solution on a well-formed block; missing it means our
                            // erosion is discontinuous here (the L-581 pathology), and saying "the
                            // ordinance cannot be satisfied" would be a claim about Catalan
                            // planning law resting on our own failure (C58 §1.11).
                            status = 'degenerate';
                            insetPolygon = [];
                            caveats.push(
                                `Tiered zone: the Art. 350.2.b band solve did not reach its own ` +
                                `target (achieved ${(solvedBand.achievedBandRatio * 100).toFixed(1)} % ` +
                                `of the block against ${(geometricRule.bandAreaRatioOfBlock * 100).toFixed(0)} % ` +
                                `required)` +
                                (solvedBand.insetDegenerate ? ' — the block offset collapsed' : '') +
                                '. This is a limitation of PRYZM’s geometry on this block, NOT a ' +
                                'statement that the ordinance cannot be satisfied. No envelope.',
                            );
                        } else {
                            addTierRow('tier.bandDepth', solvedBand.depth_m);
                            const a = parcelRing[frontIdx]!;
                            const b = parcelRing[(frontIdx + 1) % parcelRing.length]!;
                            const bandClip = clipToDepthBand(insetPolygon, a, b, solvedBand.depth_m);
                            const interiorClip = clipBeyondDepthBand(
                                insetPolygon, a, b, solvedBand.depth_m,
                            );
                            if (bandClip.degenerate || bandClip.polygon.length < 3) {
                                // The parcel lies wholly in the block interior. Legally that is a
                                // real answer — a single 5 m tier — but it is NOT what this branch
                                // is built to assert, and inventing the one-tier case here would
                                // duplicate the interior tier's construction. Refuse rather than
                                // guess which of the two shapes the plot has.
                                status = 'degenerate';
                                insetPolygon = [];
                                caveats.push(
                                    `Tiered zone: the Art. 350.2.b band (${solvedBand.depth_m.toFixed(2)} m ` +
                                    'from the block alignments) leaves no street-facing tier on this ' +
                                    'parcel. No envelope.',
                                );
                            } else {
                                const bandArea = polygonArea(bandClip.polygon);
                                tiers.push({
                                    id: 'block-band',
                                    label:
                                        `Inside the ${(geometricRule.bandAreaRatioOfBlock * 100).toFixed(0)} % ` +
                                        `block band — ${solvedBand.depth_m.toFixed(2)} m from the ` +
                                        'street alignments (Art. 350.2.b)',
                                    polygon: bandClip.polygon,
                                    areaM2: bandArea,
                                    baseHeight_m: 0,
                                    // ⚠ MAY BE NULL, and that null is a finding rather than a gap:
                                    // Art. 350.2.c keys on the *amplada de vial* AND is gated on
                                    // the Pla-Parcial regime, so this tier's REGION can be
                                    // determined while its HEIGHT honestly refuses. A default here
                                    // would be a fabricated height on the tallest part of the
                                    // building (C58 §1.4).
                                    maxHeight_m: maxHeight.value,
                                    maxFloors: maxFloors.value,
                                    ordinanceRef,
                                });
                                if (!interiorClip.degenerate && interiorClip.polygon.length >= 3) {
                                    tiers.push({
                                        id: 'block-interior',
                                        label:
                                            'Block interior — ' +
                                            `${geometricRule.interiorTierHeight_m} m, ` +
                                            `${geometricRule.interiorTierFloors} indivisible ` +
                                            'storey (Art. 350.2.e)',
                                        polygon: interiorClip.polygon,
                                        areaM2: polygonArea(interiorClip.polygon),
                                        baseHeight_m: 0,
                                        maxHeight_m: geometricRule.interiorTierHeight_m,
                                        maxFloors: geometricRule.interiorTierFloors,
                                        ordinanceRef,
                                    });
                                } else {
                                    caveats.push(
                                        'This parcel lies wholly inside the block band, so the ' +
                                        `${geometricRule.interiorTierHeight_m} m block-interior ` +
                                        'tier (Art. 350.2.e) does not arise here.',
                                    );
                                }

                                // ── The PRINCIPAL tier drives the legacy single-prism fields. ──
                                // Pinned by the `BuildableEnvelopeSchema` refinement, so a
                                // tier-unaware consumer (the facts panel, the Cesium massing, the
                                // C58 §1.8 generator bounds) always reads a REAL tier of the REAL
                                // solid: under-stated, never over-stated.
                                const principal = principalTier(tiers)!;
                                insetPolygon = principal.polygon;
                                tieredMaxHeight = principal.maxHeight_m;
                                tieredMaxFloors = principal.maxFloors;
                                caveats.push(
                                    `Two-tier envelope (PGM Art. 350.2): ` +
                                    tiers.map((t) => `${t.label} → ` +
                                        (t.maxHeight_m === null
                                            ? 'height not established'
                                            : `${t.maxHeight_m} m`)).join(' · ') +
                                    `. The single-volume figures below describe the PRINCIPAL tier ` +
                                    `only ("${principal.label}") and therefore UNDER-state the ` +
                                    'whole permitted solid — read `tiers` for the full envelope ' +
                                    '(ADR-0273).',
                                );
                            }
                        }
                    }
                }

                // ── C58 §2.2 (KG-4) / ADR-0270 — EXPLICIT-AREA ZONES: clip to the published footprint ──
                //
                // The kind for a plan that PUBLISHES the buildable footprint as geometry rather than
                // stating parameters (Madrid `Fondo de la Edificación`; and the reusable primitive
                // for any such jurisdiction). Like the alignment branch this is a COMPOSITION of the
                // per-edge inset (already run — for an explicit-area zone the pack states no
                // setbacks, so the inset is the parcel itself) THEN a single geometric operation:
                // `parcel ∩ published-footprint`, delegated to `solveExplicitArea`. No parallel
                // solver, no fork of C58 §2.4.
                //
                // ⚠ Placed as a discriminated `else if` on the exhaustive `GeometricRule` union: a
                // `setback` rule has no branch (it IS the plain inset above), and `alignment` /
                // `block-derived-alignment` are handled above, so this closes the last kind. Before
                // it existed, an `explicit-area` pack fell through to the plain inset and published
                // the WHOLE parcel as buildable — the ADR-0270 defect. Now it is solved or refused.
                else if (geometricRule?.kind === 'explicit-area') {
                    // Explain-why (C58 §1.3): name the rule that shaped the envelope. The edificabilidad
                    // rides the maxFAR row already emitted above; the footprint is recorded as a
                    // caveat here (a dedicated `explicitArea.*` derivation constraint is the P4-parity
                    // follow-up — WIRING TODO diff-sketch at the foot of this file).
                    const footprint = input.explicitAreaFootprint ?? null;
                    if (!footprint || footprint.length < 3) {
                        // HARD FAIL, not a fall-through to the parcel inset. `explicit-area` means the
                        // footprint IS the rule; without it there is nothing to clip to, and returning
                        // the whole-parcel inset would publish a confidently-wrong buildable area on
                        // exactly the historic-core parcels this kind governs (C58 §1.2, §1.4).
                        status = 'degenerate';
                        insetPolygon = [];
                        caveats.push(
                            'Explicit-area zone (ADR-0270), but no published buildable footprint was ' +
                            'supplied — the ordinance publishes the footprint as geometry and the ' +
                            'engine cannot construct it from the parcel alone. No envelope ' +
                            '(C58 §1.2, §1.4).',
                        );
                    } else {
                        const solved = solveExplicitArea({ parcelRing: insetPolygon, footprintRing: footprint });
                        if (!solved.ok) {
                            status = 'degenerate';
                            insetPolygon = [];
                            caveats.push(
                                solved.reason === 'no-overlap'
                                    ? 'Explicit-area zone: the published buildable footprint does not ' +
                                      'overlap this parcel — no buildable area here. No envelope.'
                                    : solved.reason === 'non-convex-both'
                                    ? 'Explicit-area zone: neither the parcel nor the published footprint ' +
                                      'is convex, so their intersection cannot be computed exactly on this ' +
                                      'plot. Refusing rather than publish an approximate buildable area ' +
                                      '(C58 §1.4). A general concave clipper is the follow-up.'
                                    : 'Explicit-area zone: degenerate parcel or footprint geometry — no envelope.',
                            );
                        } else {
                            insetPolygon = solved.ring;
                            caveats.push(
                                solved.footprintCoversParcel
                                    // Cite that the footprint did NOT bite, rather than imply it
                                    // constrained the plot (C58 §1.3 explain-why).
                                    ? 'Published buildable footprint COVERS this parcel — the whole plot ' +
                                      'is buildable under the explicit-area rule (ADR-0270).'
                                    : 'Buildable envelope clipped to the published footprint ' +
                                      '(explicit-area, ADR-0270).',
                            );
                        }
                    }
                }


                if (status === 'ok') {
                    insetAreaM2 = polygonArea(insetPolygon);
                    const headlineHeight =
                        tieredMaxHeight !== undefined ? tieredMaxHeight : maxHeight.value;
                    if (headlineHeight !== null) {
                        // ── §L-590b — THE OCCUPATION CAP BINDS THE VOLUME, NOT THE RING. ───────
                        //
                        // ADR-0272 §3.2: a coverage limit constrains HOW MUCH ground is occupied,
                        // never WHERE, so it must not reshape a polygon — the ring stays the
                        // permitted REGION. But ADR-0272 §4 also flagged, as a migration
                        // obligation, that `insetAreaM2 × maxHeight` then OVER-STATES the study
                        // volume for a coverage-governed zone. On Art. 350.2 that is not
                        // hypothetical: a parcel shallower than the band depth has a band tier
                        // covering 100 % of the plot beside a published 90 % cap — the precise
                        // over-statement `BCN_22A_ENVELOPE_BLOCKER` refused to ship, and C58 §1.4
                        // forbids it in this direction specifically.
                        //
                        // ⚠ APPLIED ONLY WHERE THE ZONE IS TIERED, and deliberately not
                        // retro-fitted to every coverage-carrying zone in this pass: doing so
                        // silently changes the published volume of every shipped envelope, which
                        // is a product decision with its own before/after measurement, not a
                        // side-effect of adding a rule kind. Recorded in C58 KG-3.
                        const cap =
                            tiers.length > 0 && maxCoverage.value !== null
                                ? maxCoverage.value * polygonArea(parcelRing)
                                : Infinity;
                        const effectiveArea = Math.min(insetAreaM2, cap);
                        maxVolumeM3 = effectiveArea * headlineHeight;
                        if (effectiveArea < insetAreaM2 - 1e-9) {
                            caveats.push(
                                `Ocupació màxima ${(maxCoverage.value! * 100).toFixed(0)} % of the ` +
                                'parcel binds the study volume: the tier ring is the region ' +
                                'building is PERMITTED in, not the area that may be covered ' +
                                '(ADR-0272 §3.2).',
                            );
                        }
                    }
                }
            }
        }

        // ── §L-572 — the `block-constructed` tier is stamped HERE, by the engine. ──
        //
        // C58 §1.2. A depth SOLVED from a real block ring under an accepted ordinance rule is a
        // different fidelity from a number read out of a curated pack, and the fact that
        // distinguishes them is `alignment.depthBinding` — a derivation row this engine emits
        // (~L377) if and only if `solveBlockDerivedDepth` actually returned a binding. Every
        // failure path above clears the depth and marks `status`, so the row cannot appear on a
        // fallback.
        //
        // ⚠ THIS MOVED FROM L5 (`siteDispatch.ts`), and the move is the point. The tier was
        // derived in the editor by re-scanning `derivation` for that same row — so the label was a
        // property of ONE UI path rather than of the determination itself, and any second consumer
        // (the per-parcel report, an API, an export) would have received `estimated-ruleset` on
        // genuinely constructed, citable data. An honesty label that only one caller knows how to
        // compute is not a property of the answer (C58 §1.2/§1.6).
        //
        // It also fixes a latent contradiction: the caveat below is keyed on the tier, and while
        // the upgrade happened downstream, a constructed Barcelona envelope carried the literal
        // text "Estimated envelope — verify against the governing ordinance" in `caveats` while
        // its badge read "Real · constructed". That never reached a user only because `caveats` is
        // currently consumed by nothing but a `console.log` — i.e. it was invisible, not absent.
        // Ordering the upgrade BEFORE the caveat makes the two agree by construction.
        //
        // ⚠ HONEST LIMIT — this labels the RULE, not the INPUT. The engine is pure and cannot
        // verify that `blockRing` is real cadastral geometry; it certifies "constructed from the
        // block ring supplied under an accepted rule". Per C58 §1.6 the ring's own provenance
        // rides with the caller (in production, `CatastroBlockProvider` — real Catastro). A caller
        // that synthesises a ring and reads this tier as proof of real data would be over-claiming,
        // which is why the badge wording is "Real · constructed", never "verified"/"certificate"
        // (RISK-REGISTER R1).
        if (
            status === 'ok' &&
            confidence === 'estimated-ruleset' &&
            derivation.some((d) => d.constraint === 'alignment.depthBinding')
        ) {
            confidence = 'block-constructed';
        }

        if (confidence === 'estimated-ruleset' && status === 'ok') {
            caveats.push('Estimated envelope — verify against the governing ordinance before relying on it (C58 §1.4).');
        }

        span.setAttribute('jurisdictionId', zoning.jurisdictionId);
        span.setAttribute('zoneCode', zoning.zoneCode);
        span.setAttribute('confidence', confidence);
        span.setAttribute('provider', zoning.provenance.source);
        span.setAttribute('status', status);
        span.setAttribute('insetAreaM2', insetAreaM2);
        if (maxHeight.value !== null) span.setAttribute('maxHeight', maxHeight.value);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            // C58 §1.11 (gap KG-2, closed here) — what these numbers are ABOUT.
            //
            // `'parcel'`: every rule kind the engine solves — setback, alignment, and
            // block-derived — yields the answer FOR THIS PLOT. ⚠ Note the block-derived case
            // specifically: it reads block geometry as an INPUT, but PGM Art. 242.2 is a
            // parcel-level rule, so the depth it produces is this parcel's legal depth. Two
            // parcels on one manzana share it because the ordinance makes it so, not because a
            // coarser figure was borrowed. Granularity describes what a number is ABOUT, not
            // what was used to compute it — and stamping `'block'` here would trip §1.11.3 and
            // make the generator refuse a valid parcel constraint.
            //
            // The genuinely coarse sources (Madrid VEDA *ámbito*, Valencia sector) enter through
            // a PROVIDER, not this solver; when one lands it must stamp its own granularity on
            // the `ZoningRecord` and this line becomes a read of that, not a constant.
            granularity: 'parcel',
            insetPolygon,
            // §L-590b — a TIERED envelope's headline height is the PRINCIPAL TIER's, not the
            // zone-level resolution, and the two genuinely differ: on Art. 350.2 the tall tier's
            // height can refuse (no *amplada de vial*, or the Pla-Parcial regime unknown) while
            // the 5 m block-interior tier is stated outright. Publishing the zone-level `null`
            // there would hide a height the ordinance DOES give, and publishing the tall tier's
            // height beside the interior tier's ring would over-state. `undefined` means the
            // tiered branch never ran, which is every other zone.
            //
            // ⚠ The `BuildableEnvelopeSchema` refinement enforces this agreement, so the two can
            // never drift: a producer that fills `tiers` and leaves these fields describing
            // something else fails to parse.
            maxHeight_m: tieredMaxHeight !== undefined ? tieredMaxHeight : maxHeight.value,
            maxFloors: tieredMaxFloors !== undefined ? tieredMaxFloors : maxFloors.value,
            maxFAR: maxFAR.value,
            maxCoverage: maxCoverage.value,
            maxVolumeM3,
            insetAreaM2,
            permittedUse,
            confidence,
            status,
            zoneCode: anyResolved ? zoning.zoneCode : null,
            derivation,
            caveats,
            // §L-590b / ADR-0273 — empty for every single-prism zone (all of them but
            // `tiered-occupation`), which is the identity and not a gap.
            tiers,
            // L-550 — the SOLVER never refuses on legal grounds: by the time a parcel reaches
            // here a rule pack has already been selected for it, so its zone IS buildable. A
            // "no envelope applies" answer is a CLASSIFICATION decision taken upstream (the
            // rule-pack registry) and dispatched via `buildRefusedEnvelope`, never produced by
            // the geometry. Keeping this constant `null` is what preserves that separation:
            // `degenerate` (the constraints consumed the parcel) and `not-applicable` (the
            // ordinance grants no envelope) are different legal statements, and the engine is
            // only ever entitled to make the first.
            refusal: null,
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
