// C58 §2.4 — `BuildableEnvelope` + `DerivationTrace` (the engine output).
//
// L0-pure: Zod only (P5). The numeric results reach the C19 Parcel via `site.updateZoning`;
// this full object (with its confidence label + per-constraint derivation) is
// what the compliance report + the 3D Forma render read.
//
// ⚠ This header used to say "Transient — NOT persisted authored model data (C58 §1.7)".
// **Superseded 2026-08-21 (§GIS-ENVELOPE-DETERMINATION-PERSIST, L-1654, founder-requested):**
// the WHOLE determination is now persisted onto the Parcel as a DATED ARTEFACT
// (`BuildableDeterminationRecordSchema` below → `Parcel.buildableDetermination`), because the
// L-445 "reduced card" proved that persisting only the ring loses exactly the provenance the
// user needs on every surface outside the solving session. Persisting the record does NOT
// change its epistemic status: it is what was determined WHEN the parcel was committed —
// consumers must show its date, and re-committing the parcel is the only refresh.
//
// ─────────────────────────────────────────────────────────────────────────────
// DEVIATION FROM C58 §2.4 (deliberate, documented):
//   The contract types `insetPolygon` as `LatLon[]` (WGS84). The ACTUAL C19
//   parcel spine stores `Parcel.boundary.polygon` as `Pt[]` — scene-XZ metres
//   (the LTP-ENU frame, C12/C19 §2.3). SPEC-BUILDABLE-ENVELOPE-UX §4 REQUIRES
//   the envelope to anchor in the SAME frame `renderFormaMassing` projects the
//   parcel with, WITHOUT re-deriving the projection. Emitting the inset in
//   scene-XZ `Pt[]` (the exact frame the parcel is already in) is what makes the
//   envelope sit coincident with the drawn parcel; emitting WGS84 would force a
//   re-projection the spec forbids. So `insetPolygon` is `Pt[]` here. When C57's
//   WGS84 parcel-fetch lands, a LatLon projection can be added alongside.
// ─────────────────────────────────────────────────────────────────────────────
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §2.4;
// docs/03-execution/specs/SPEC-BUILDABLE-ENVELOPE-UX.md §4.

import { z } from 'zod';
import { PtSchema } from '../types.js';
import { PermittedUseSchema } from './EnvelopeNumbers.js';
import {
    FieldProvenanceSchema,
    EnvelopeConfidenceSchema,
} from './ProvenanceFlags.js';

/**
 * The constraint an envelope derivation entry explains (C58 §2.4).
 */
export const DerivationConstraintSchema = z.enum([
    'setback.front',
    'setback.side',
    'setback.rear',
    'maxHeight',
    'maxFAR',
    'maxCoverage',
    'permittedUse',
    // ─── ADR-0270 P4 — alignment-governed zones (C58 §1.7a) ───────────────────────────────
    // An alignment rule SHAPED the envelope but had no way to SAY SO: the solver recorded it
    // only in free-text `caveats`, so "Why these numbers?" listed three setbacks and silently
    // omitted the constraint that actually did the work. A user reading the panel would have
    // concluded the setback triple governed the plot. These literals make the real rule a
    // first-class, citable row — the §1.3 explain-why obligation applied to the rule KIND, not
    // just its numbers.
    /** *Profundidad / profunditat edificable* — the depth band measured from the alignment. */
    'alignment.depth',
    /** Offset of the buildable line from the alignment itself (0 ⇒ façade ON the line). */
    'alignment.offset',
    /** How the lateral boundaries are treated: party wall (*mitgera*) vs a side setback. */
    'alignment.sideTreatment',
    // ─── ADR-0271 — block-derived depth (PGM Art. 242.2) ──────────────────────────────────
    /**
     * WHICH rule bound a CONSTRUCTED depth: `interior-ratio` (the ≥30% courtyard rule — the
     * true Art. 242 construction), `max-cap` (the block is shallow enough that the 30 m cap
     * governs) or `min-floor` (the ratio would force a depth below the 11 m floor).
     *
     * A first-class row rather than a diagnostic, because these are **different legal
     * statements about the same number** — "the courtyard rule set this" and "the cap set
     * this" are not interchangeable in an explain-why report (C58 §1.3). Present ONLY when
     * the depth was constructed; a stated scalar depth has no binding.
     */
    'alignment.depthBinding',
    // ─── §BCN-OV-CONFIDENCE (L-1660) — explicit-area footprint binding ────────────────────
    /**
     * The explicit-area clip succeeded against a footprint the CALLER declared to be the
     * ordinance's own PER-SITE ordering published as geometry (e.g. the AMB Refós `OV_Trames`
     * volumetric footprint, under the recorded L-449/SIG-3 vintage acceptance) — as opposed to
     * a zone extent (NL *bestemmingsvlak*, L-630) or a ring whose numeric semantics are
     * discretionary (Madrid NZ-1, deliberately `estimated-ruleset`). Value is
     * `'footprint-covers-parcel'` or `'clipped-to-published-footprint'`. Present ONLY when the
     * caller made that declaration (`explicitAreaAuthority: 'published-site-ordering'`); its
     * presence is what lets §L-572 stamp `block-constructed` on an explicit-area solve — the
     * same "constructed under an accepted rule from real published inputs" statement as
     * `alignment.depthBinding`, and like it a property of the DETERMINATION, not of one UI path.
     */
    'explicitArea.footprintBinding',
    // ─── §L-590b / ADR-0273 — tiered occupation (PGM Art. 350.2) ──────────────────────────
    /**
     * Art. 350.2.b — the band's area as a share of the BLOCK, **as an equality**. A first-class
     * row because it is the rule that DIVIDES the parcel into tiers; without it the panel would
     * show two heights and no reason for the line between them.
     */
    'tier.bandAreaRatio',
    /**
     * The depth CONSTRUCTED from that equality (metres from the block alignments). Distinct from
     * `alignment.depth`: that one is Art. 242's *profunditat edificable*, a limit on how deep a
     * building may go; this one is the boundary between two lawful heights, and citing either
     * under the other's name would be a category error on a compliance number (C58 §1.11).
     */
    'tier.bandDepth',
    /** Art. 350.2.e — the height permitted on the block-interior tier (22a ⇒ 5 m, one storey). */
    'tier.interiorHeight',
    // ─── ADR-0288 — occupation-capped alignment (Córdoba Art. 13.5.2.4, §COR-MC-FOOTPRINT) ──
    /**
     * The stated ocupación ratio (`ZoningRule.maxCoverage`, echoed here so the row that actually
     * SHAPED the footprint is self-contained) used to construct the footprint's depth. ⚠ This is
     * NOT a second home for the number — `maxCoverage`'s own derivation row (above) still carries
     * the field-level citation; this row exists only so "why this SHAPE" is answerable without
     * cross-referencing a different constraint.
     */
    'occupationCap.ratio',
    /** `maxCoverage × parcelArea` — the target footprint area PRYZM's construction solved for. */
    'occupationCap.targetAreaM2',
    /**
     * The DEPTH PRYZM's construction solved (metres from the alignment) to hit that target area.
     * ⚠⚠ UNLIKE `alignment.depth` AND `tier.bandDepth`, THIS IS NOT A CITABLE ORDINANCE FIGURE —
     * it is the output of a PRYZM ENGINEERING DECISION about which of many equally-legal footprint
     * shapes to draw (see `OccupationCappedAlignmentRuleSchema`'s header). Present only when the
     * cap actually bound (absent when `capInactive` — see the engine branch).
     */
    'occupationCap.depth_m',
]);
export type DerivationConstraint = z.infer<typeof DerivationConstraintSchema>;

/**
 * One "why" entry (C58 §1.3 / §2.4) — every numeric constraint in an envelope
 * MUST have one, naming the value, the zone it came from, the pack/provider
 * source, the per-field provenance flag, and an `ordinanceRef` where one exists.
 */
export const DerivationEntrySchema = z.object({
    constraint: DerivationConstraintSchema,
    value: z
        .union([z.number(), z.string(), z.array(z.string()), z.null()])
        .default(null),
    zoneCode: z.string().min(1),
    source: z.string().min(1),
    fieldProvenance: FieldProvenanceSchema,
    ordinanceRef: z.string().min(1).nullable().default(null),
});
export type DerivationEntry = z.infer<typeof DerivationEntrySchema>;

/** One entry per resolved constraint (C58 §1.3). */
export const DerivationTraceSchema = z.array(DerivationEntrySchema);
export type DerivationTrace = z.infer<typeof DerivationTraceSchema>;

/**
 * The solver result status. `ok` = a non-degenerate inset was produced.
 * `degenerate` = the setbacks consumed the whole parcel (≥ half-width) so no
 * buildable envelope exists — the UI shows the reason, never a fabricated volume
 * (mirrors §ENVELOPE-DIAGNOSTIC status:rejected). `none` = no zoning data at all
 * (C58 §1.2 fidelity 3 — the envelope is hidden).
 */
/**
 * `not-applicable` (L-550, Phase 0.3 of the Barcelona complete-coverage plan) — **the zone has
 * no private buildable envelope AT ALL, and saying so is a POSITIVE, cited answer.**
 *
 * ⚠ WHY THIS IS A FOURTH STATUS AND NOT A CAVEAT ON `none`. The three existing values all
 * describe a determination that was ATTEMPTED: `ok` succeeded, `degenerate` was consumed by its
 * own constraints, `none` found no data. A public park, a rail corridor, or a *volumetria
 * específica* parcel is none of those — the ordinance answers the question, and its answer is
 * "not by a zone envelope". Folding that into `none` makes it indistinguishable from "we could
 * not look it up", which is the exact §CONTEXT-DATA-HONESTY collapse this project has now paid
 * for three times (L-422 / L-467 / L-469): a REFUSAL and a FAILURE rendered as the same value.
 *
 * Before this existed, every such parcel fell through to the generic estimated pack and was
 * shown a fabricated front/side/rear triple over a motorway or a Collserola forest reserve.
 */
export const EnvelopeStatusSchema = z.enum(['ok', 'degenerate', 'none', 'not-applicable']);
export type EnvelopeStatus = z.infer<typeof EnvelopeStatusSchema>;

/**
 * WHY the ordinance yields no private buildable envelope (L-550). A closed vocabulary, because
 * these are legally DIFFERENT statements and a free-text string would let them blur:
 *
 *  - `public-system`        — the parcel is public domain (*sistema*): roads, rail, port,
 *                             technical services, hydrographic. No private zone rule exists.
 *  - `public-open-space`    — parks/gardens (*parcs i jardins*). Buildability is nil-to-
 *                             incidental and set by a *Pla Especial*, never by a zone parameter.
 *  - `facility-plan`        — *equipaments / dotacions*. Buildability is fixed PER FACILITY by a
 *                             *Pla Especial d'Equipaments*; there is no per-parcel rule to encode.
 *  - `protected-soil`       — *sòl no urbanitzable* / protective easements (Collserola, general-
 *                             system protection strips). No urban envelope exists.
 *  - `protected-private-green` — PRIVATE land whose whole purpose is that it is NOT built on
 *                             (Barcelona clau `8a`, *verd privat protegit*). Distinct from
 *                             `public-open-space`: the owner is private, the answer is still no.
 *  - `derived-plan`         — the general plan POINTS AT ANOTHER DOCUMENT (a *Pla Parcial*,
 *                             *ordenació de volums*, PERI, or MPGM) that fixes buildability
 *                             per site. The rule is not absent — it is elsewhere, and PRYZM does
 *                             not hold it. **This is the honest label for Barcelona clau 18, the
 *                             second-largest family in the city (22.5 % of buildable land).**
 *  - `overlay-uncertain`    — a heritage catalogue / protection special plan MAY bind and our
 *                             data path cannot see it, so any computed figure would silently
 *                             over-state buildability. Refusing under uncertainty (Ciutat Vella).
 *  - `no-rule-pack`         — the zone IS privately buildable and PRYZM simply has not authored
 *                             its pack yet. ⚠ The ONE code here that is a gap rather than a legal
 *                             fact; it must never be presented as though the ordinance refused.
 *  - `source-data-unavailable` — **L-574, founder-decided 2026-07-21.** The zone is buildable,
 *                             PRYZM HAS authored its pack, and the determination still could not
 *                             be completed because an INPUT was unavailable for this parcel — the
 *                             Catastro block outline could not be assembled, the dissolve was
 *                             refused, or the construction had no solution on this block.
 *                             ⚠ **A THIRD CATEGORY, and the distinction is the whole point.**
 *                             It is NOT a legal refusal: telling an Eixample owner "no envelope
 *                             applies" would be a false negative about their land — worse than
 *                             the fabrication it replaces. It is NOT `no-rule-pack`: we have the
 *                             pack, so "not encoded yet" would be false too. It is the only code
 *                             that is TRANSIENT and therefore the only one a RETRY can fix.
 *                             Before L-574 these parcels fell through to the generic estimated
 *                             pack — and for a *segons alineacions de vial* clau like `13a` a
 *                             front/side/rear triple is the WRONG SHAPE, not an imprecise number
 *                             (C58 §1.11), spanning the full plot depth on the most valuable land
 *                             in the city. `legallyGrounded: false` — this is a statement about
 *                             PRYZM's data path, never about the ordinance.
 *  - `regime-undetermined`  — **§L-590c, ADR-0274, founder-ruled 2026-07-22.** The zone is
 *                             buildable, PRYZM HAS authored and solved its pack, every input we
 *                             need is available — and the ordinance itself states **two different
 *                             regimes for the same clau**, keyed on a legal fact about the parcel
 *                             that no public source records. PGM Art. 350 is the shipped case:
 *                             Art. 350.2.a–f govern clau `22a` land *mancada de Pla Parcial*;
 *                             Art. 350.1 governs land WITH a definitively-approved *Pla Parcial*,
 *                             where the height and the concentric band come from that plan
 *                             instead. Neither Catastro nor the MUC says which.
 *                             ⚠ **A FOURTH CATEGORY, and each of the other three would be a
 *                             different false statement.** `no-rule-pack` would say we have not
 *                             encoded the zone — we have, and authoring more would not help.
 *                             `source-data-unavailable` is defined as TRANSIENT and is the only
 *                             code that earns a RETRY affordance — this never clears on a retry,
 *                             so it would send the user round a loop for ever. `derived-plan`
 *                             asserts that the general plan DELEGATES for this parcel — which is
 *                             true only in one of the two regimes, i.e. it would assert the very
 *                             fact we cannot establish (the L-526 error). §CONTEXT-DATA-HONESTY
 *                             again: a coverage gap, a fetch failure and *"we cannot make this
 *                             legal determination"* are three different answers.
 *                             `legallyGrounded: false` — the LAW is fully known here; what is
 *                             missing is which half of it applies, which is a statement about
 *                             PRYZM's inputs, not about the ordinance.
 *                             ⚠ Unlike every other refusal, this one MAY state, in prose and under
 *                             its own citation, the limits that hold in **both** regimes — see
 *                             C58 §1.13.7. Its numeric fields stay null exactly like the others.
 */
export const EnvelopeRefusalCodeSchema = z.enum([
    'public-system',
    'public-open-space',
    'facility-plan',
    'protected-soil',
    'protected-private-green',
    'derived-plan',
    'overlay-uncertain',
    'no-rule-pack',
    'source-data-unavailable',
    'regime-undetermined',
    // STRUCTURAL-SEAM-4 (C58 §1.13.8, L-422/457/467/469) — GENUINE data-absence, distinct from the
    // transient `source-data-unavailable`. The source ANSWERED and there is no adopted plan /
    // bouwvlak / published footprint at this point. A DURABLE fact about coverage, not a fetch that
    // failed: it earns "no plan published here", NEVER the "usually clears on a second attempt"
    // retry card (which is honest ONLY for `source-data-unavailable`). Before this code existed, an
    // empty had nowhere to go but the transient code, so every permanent absence wore a fictional
    // retry affordance — the exact failure≠empty conflation §CONTEXT-DATA-HONESTY forbids.
    // `legallyGrounded: false` (a statement about our DATA coverage at this point, not the law).
    'no-plan-at-point',
]);
export type EnvelopeRefusalCode = z.infer<typeof EnvelopeRefusalCodeSchema>;

/**
 * A structured, CITED refusal (C58 §1.3 applied to the absence of a number). Every field is
 * required except the citation, and the citation being nullable is itself meaningful: a refusal
 * with no `ordinanceRef` is an unsourced claim about the law and the UI must say so, exactly as
 * it does for an uncited number.
 */
export const EnvelopeRefusalSchema = z.object({
    code: EnvelopeRefusalCodeSchema,
    /** One line the user reads first — e.g. "Public system — no private buildable envelope." */
    headline: z.string().min(1),
    /** The reasoning, naming the governing article where one exists. */
    detail: z.string().min(1),
    /** The governing citation, or null when the classification is not article-sourced. */
    ordinanceRef: z.string().min(1).nullable().default(null),
    /**
     * L-553 — SHORT "label: value" facts PRYZM *does* hold about this parcel, shown on the
     * refusal card so the screen is never blank.
     *
     * ⚠ THIS IS NOT DECORATION, IT IS THE DIFFERENCE BETWEEN "MISSING DATA" AND "BROKEN". An
     * empty panel is read as a crash; a panel that names the user's parcel, its address, its
     * area and its exact zone proves we identified their land correctly and are declining a
     * specific, known thing. Precedent, paid for the same day: fabricated context-building
     * heights were made translucent so a guess could not look surveyed, and the founder asked
     * *"why are some buildings wireframe?"* — the signal was honest and still failed, because
     * it read as a render artifact rather than as missing data. An honest signal that is not
     * LEGIBLE is not honest in effect.
     *
     * Facts only — never a constraint, never a number the user could mistake for an allowance.
     */
    knownFacts: z.array(z.string().min(1)).default([]),
    /**
     * Is this refusal a statement about the LAW (true) or about PRYZM's coverage (false)?
     *
     * `no-rule-pack`, `source-data-unavailable`, `regime-undetermined` and `no-plan-at-point` are
     * the `false` codes. The distinction is load-bearing: "the ordinance grants no envelope here",
     * "we have not encoded this zone yet", "we hold the rule but could not fetch what it needs for
     * your parcel", "the ordinance states two regimes and no source says which one your parcel is
     * in", and "the source answered and there is genuinely no plan published at this point" are
     * FIVE different claims and must never share a rendering. Only `source-data-unavailable` is
     * transient, and it is the only one for which a RETRY affordance makes sense (L-574) — offering
     * one on `regime-undetermined` would loop for ever, because no number of retries produces a
     * legal fact nobody publishes (§L-590c / ADR-0274); offering one on `no-plan-at-point`
     * (STRUCTURAL-SEAM-4) would loop for ever because the source already answered "nothing here".
     */
    legallyGrounded: z.boolean(),
});
export type EnvelopeRefusal = z.infer<typeof EnvelopeRefusalSchema>;

/**
 * The engine output (C58 §2.4). See the DEVIATION note above re `insetPolygon`.
 */
/**
 * C58 §1.11 — what the envelope's numbers are ABOUT. Ordered coarse-ward from `parcel`.
 *
 * `'unknown'` is deliberately NOT a synonym for "probably fine": §1.11.4 requires it to be
 * treated as coarser-than-parcel, because an unlabelled source is exactly the one you cannot
 * vouch for. Defaulting optimistically here would reintroduce the category error the whole
 * discriminator exists to prevent.
 */
export const EnvelopeGranularitySchema = z.enum([
    'parcel',
    'block',
    'sector',
    'ambito',
    'municipality',
    'unknown',
]);
export type EnvelopeGranularity = z.infer<typeof EnvelopeGranularitySchema>;

/**
 * Is this granularity usable as a PARCEL-level answer (C58 §1.11.2/§1.11.3)?
 *
 * The single place that decides. Anything but `'parcel'` may be shown as CONTEXT — and must say
 * so in the same sentence as the number — but MUST NOT be presented as this plot's envelope, and
 * MUST NOT reach the generator as a hard constraint.
 */
export function isParcelGranular(g: EnvelopeGranularity): boolean {
    return g === 'parcel';
}

/**
 * §L-590b / ADR-0273 — ONE TIER of a multi-tier envelope: a footprint with its OWN height cap.
 *
 * ⚠ **WHY THE ENVELOPE COULD NOT STAY A SINGLE PRISM.** A large class of European ordinance grants
 * different heights over different parts of the SAME parcel, and the dividing line is not a design
 * choice — it is drawn by the ordinance. PGM Art. 350.2 (Barcelona clau `22a`, 17.5 % of the
 * city's private buildable land) is the shipped case: the part of the parcel inside a band
 * concentric with the BLOCK rises to the Art. 350.2.c street-width height (9 / 13 / 17 m), and the
 * part in the block interior is capped at one indivisible 5 m storey (Art. 350.2.e).
 *
 * `insetPolygon` + `maxHeight_m` can express exactly one of those two facts. Expressing the taller
 * one over the whole parcel OVER-STATES buildable volume — the one direction C58 §1.4 forbids and
 * the defect L-586 spent a whole session removing. Expressing the shorter one silently deletes the
 * building. Neither is a "close enough" summary of a solid the ordinance describes exactly.
 *
 * ⚠ **TIERS ARE DISJOINT REGIONS, NOT STACKED SLABS.** In Art. 350.2 they TILE the buildable
 * footprint side by side; each rises from its own `baseHeight_m` (0 for both here — both are
 * measured from the *rasant*). A podium/tower reading, where an upper tier sits ON a lower one,
 * is expressible by setting the upper tier's `baseHeight_m` to the lower one's `maxHeight_m`, but
 * nothing in this schema assumes it. Consumers must not assume containment or nesting in either
 * direction: the only guaranteed relation is that every tier polygon lies inside the parcel.
 *
 * ⚠ **`tiers` NEVER CONTRADICTS THE LEGACY SCALARS — the refinement below enforces it.** When
 * tiers are present, `insetPolygon` / `insetAreaM2` / `maxHeight_m` carry the **PRINCIPAL TIER**:
 * the tallest, ties broken by area. That choice is the conservative one *by construction* — the
 * legacy prism is then a real tier of the real solid, so a consumer that has never heard of tiers
 * renders something that genuinely fits inside the envelope, and it UNDER-states (it omits the
 * other tiers) rather than over-stating. A caveat says so in words, because an under-statement is
 * not free either (ADR-0272 §4: under-building is not a "safe" error in a feasibility tool).
 */
export const EnvelopeTierSchema = z.object({
    /**
     * Stable machine id for this tier within the envelope (`'block-band'`, `'block-interior'`).
     * A closed vocabulary is deliberately NOT imposed here: the tier ids a zone produces are a
     * property of its ordinance, and enumerating them in L0 would make every new jurisdiction a
     * schema change (C58 §1.5, the argument that put the pack registry below the editor).
     */
    id: z.string().min(1),
    /** What the user reads — e.g. "Inside the 70 % block band (Art. 350.2.b)". */
    label: z.string().min(1),
    /** This tier's footprint, scene-XZ metres (same frame as `insetPolygon`; see DEVIATION note). */
    polygon: z.array(PtSchema).min(3),
    /** `area(polygon)` in m². Carried rather than recomputed so every consumer agrees. */
    areaM2: z.number().min(0),
    /** Height of this tier's UNDERSIDE above the datum. 0 = it rises from the ground. */
    baseHeight_m: z.number().min(0).default(0),
    /**
     * This tier's height cap. **Nullable, and the null is a finding**: Art. 350.2.c keys on the
     * *amplada de vial* and is gated on the Pla-Parcial regime, so a tier can be geometrically
     * determined while its height honestly refuses. A tier with a null height is a real permitted
     * REGION with no published vertical limit — never a licence to extrude a default.
     */
    maxHeight_m: z.number().min(0).nullable().default(null),
    /** Storey cap for this tier, where the ordinance states one (Art. 350.2.e ⇒ 1). */
    maxFloors: z.number().int().min(0).nullable().default(null),
    /** The paragraph that grants THIS tier — tiers of one envelope cite different articles. */
    ordinanceRef: z.string().min(1).nullable().default(null),
});
export type EnvelopeTier = z.infer<typeof EnvelopeTierSchema>;

/**
 * The PRINCIPAL tier — the one the legacy single-prism fields mirror. Tallest wins; ties break on
 * area; a null height sorts BELOW any stated height, because "no published limit" must never
 * outrank a real one when choosing what to publish as `maxHeight_m`.
 *
 * Exported so the engine, the panel and any future consumer make the same choice. A second
 * implementation of "which tier is the headline one" would be free to disagree with the schema
 * refinement that enforces it.
 */
export function principalTier(tiers: ReadonlyArray<EnvelopeTier>): EnvelopeTier | null {
    let best: EnvelopeTier | null = null;
    for (const t of tiers) {
        if (best === null) { best = t; continue; }
        const th = t.maxHeight_m ?? -1;
        const bh = best.maxHeight_m ?? -1;
        if (th > bh || (th === bh && t.areaM2 > best.areaM2)) best = t;
    }
    return best;
}

/**
 * §L-619 / DK-ENVELOPE-REALISM — HOW the buildable footprint was PLACED (its geometric provenance),
 * for the perimeter-block (karré) family the DK resolver serves.
 *
 * A THIRD provenance axis, orthogonal to `confidence` (fidelity) and `granularity` (about-what): two
 * envelopes may both be `structured` and both be `parcel`-granular while one was shaped by a published
 * building-field polygon and the other constructed from a conservative block-depth STUDY. That
 * difference is legally load-bearing on a courtyard block, so it is a first-class label, not a caveat.
 *
 *  - `byggefelt`    — the footprint is a PUBLISHED building-field polygon (byggefelt), clipped against
 *                     the parcel. The strongest DK placement — the plan drew the footprint.
 *  - `buildingLine` — the footprint was derived by offsetting the parcel to byggelinjer (building-line)
 *                     GEOMETRY, edge-matched to the parcel. Official plan geometry, measured.
 *  - `derived`      — the footprint was CONSTRUCTED (a depth band from a cited lokalplan depth, or the
 *                     conservative Barcelona block-depth study) rather than read from an explicit
 *                     building-line/field geometry. ⚠ `derived` alone says nothing about legal status —
 *                     read `confidence` + `openSpace.source`: a cited-lokalplan band is official, a
 *                     block-depth band is a STUDY. The honesty lives in those two fields, not here.
 *
 * Nullable + default null: every zone shipped before this (all setback/alignment/tiered/explicit-area
 * envelopes) leaves it null and is unchanged — the field annotates only envelopes a placement resolver
 * built.
 */
export const EnvelopePlacementSourceSchema = z.enum(['byggefelt', 'buildingLine', 'derived']);
export type EnvelopePlacementSource = z.infer<typeof EnvelopePlacementSourceSchema>;

export const EnvelopePlacementSchema = z.object({
    source: EnvelopePlacementSourceSchema,
});
export type EnvelopePlacement = z.infer<typeof EnvelopePlacementSchema>;

/**
 * §L-619 / DK-ENVELOPE-REALISM — WHERE the open-space (courtyard) determination came from. A closed
 * vocabulary, because "the plan left this hole", "the byggelinje geometry left this depth", "a cited
 * lokalplan depth left it" and "a conservative study left it" are DIFFERENT legal statements about the
 * same void and a free-text string would let them blur (§CONTEXT-DATA-HONESTY).
 *
 *  - `byggefelt-hole`      — the void is the part of the parcel a published byggefelt polygon does NOT cover.
 *  - `building-line-band`  — the void lies beyond a depth band MEASURED from byggelinjer geometry.
 *  - `lokalplan-depth`     — the void lies beyond a depth band from a CITED lokalplan §X depth (official).
 *  - `block-derived-study` — the void is the interior left by the conservative Barcelona block-depth
 *                            STUDY (DK_PERIMETER_BLOCK_COURTYARD_RULE). ⚠ A study, not a surveyed courtyard.
 */
export const EnvelopeOpenSpaceSourceSchema = z.enum([
    'byggefelt-hole',
    'building-line-band',
    'lokalplan-depth',
    'block-derived-study',
]);
export type EnvelopeOpenSpaceSource = z.infer<typeof EnvelopeOpenSpaceSourceSchema>;

export const EnvelopeOpenSpaceSchema = z.object({
    /** TRUE when the envelope leaves a genuine interior open space (the karré courtyard). */
    courtyard: z.boolean(),
    /** Where that determination came from — see `EnvelopeOpenSpaceSourceSchema`. */
    source: EnvelopeOpenSpaceSourceSchema,
});
export type EnvelopeOpenSpace = z.infer<typeof EnvelopeOpenSpaceSchema>;

/**
 * §OPEN-TOP-INDICATIVE (ADR-0293 / L-677) — WHAT PRYZM MAY CLAIM about this envelope. The THIRD
 * publication state, promoted from a rendering convention to a value the type system carries.
 *
 *  - `determination`         — publishable AS A DETERMINATION (the L-449 human-signed gate said yes).
 *  - `open-top-indicative`   — DRAWS, but claims NO buildable right: unmodelled constraint families
 *                              can only ever REDUCE the solid, so its TOP is not a limit PRYZM asserts.
 *  - `uncertified-preview`   — §STAGING-UNCERTIFIED-PREVIEW (L-449). DRAWS from the SAME transcribed
 *                              rule pack a signed determination would use, but the L-449 gate is still
 *                              SHUT — no human has certified the reading. Exists ONLY so a non-
 *                              production environment can visually verify a compute path renders
 *                              correctly before anyone signs off on it; the module that may set it
 *                              (`apps/editor` → `ui/site/testMode/uncertifiedPreviewMode.ts`) is
 *                              triple-gated to refuse outside a non-production Vite build,
 *                              explicitly-marked staging environment, and it never reads, writes or
 *                              otherwise touches any `*_ENVELOPE_VERIFIED` / `*_CERTIFIED` constant —
 *                              those stay exactly what L-449 requires: a human signature, or `false`.
 *  - `refused`               — draws nothing.
 *
 * ⛔ THIS IS THE VOCABULARY, IN L0, SO THERE IS EXACTLY ONE. The L2 authorisation module
 * (`@pryzm/site-parcel-data` → `openTopIndicative.ts`) is the only thing that may DECIDE
 * `determination` / `open-top-indicative` / `refused`; `testMode/uncertifiedPreviewMode.ts` is the
 * only thing that may decide `uncertified-preview`, and only in siteDispatch's Telde branch today,
 * only as a narrowing of an ALREADY-refused gate. Each re-exports this type rather than restating the
 * union, because a second hand-copy of a four-member union is how a posture quietly acquires a fifth
 * spelling one layer honours and another does not.
 *
 * ⚠ L0 PURITY (P5) HOLDS: this is a string enum. It encodes no policy, reads no table and decides
 * nothing — the DECISION lives in L2, where the gate tables and the registry are.
 */
export const EnvelopePublicationPostureSchema = z.enum([
    'determination',
    'open-top-indicative',
    'uncertified-preview',
    'refused',
]);
export type EnvelopePublicationPosture = z.infer<typeof EnvelopePublicationPostureSchema>;

/**
 * §L-619 / DK-ENVELOPE-REALISM — WHICH open-space sources each placement source may legally claim.
 *
 * ⚠ THIS TABLE IS THE POINT, not a convenience. `placement.source` states how strong the footprint
 * evidence is; `openSpace.source` states how strong the VOID evidence is. Letting them disagree —
 * a footprint the resolver CONSTRUCTED (`derived`) while its courtyard claims to be the hole in a
 * published `byggefelt` polygon — would launder a study into official plan geometry, which is the
 * over-statement direction C58 §1.4 forbids. The refinement below pins the pairing so a producer
 * physically cannot emit the mismatched combination.
 *
 * `derived` maps to TWO voids because a constructed band has two legally distinct origins: a CITED
 * lokalplan depth (official text) and the conservative block-depth STUDY. Both are constructions,
 * so both sit under `derived`; `confidence` is what separates them (see `EnvelopeOpenSpaceSource`).
 */
export const OPEN_SPACE_SOURCES_BY_PLACEMENT: Readonly<
    Record<EnvelopePlacementSource, readonly EnvelopeOpenSpaceSource[]>
> = Object.freeze({
    byggefelt: ['byggefelt-hole'],
    buildingLine: ['building-line-band'],
    derived: ['lokalplan-depth', 'block-derived-study'],
} as const);

export const BuildableEnvelopeSchema = z.object({
    /** `parcel ⊖ setbacks` in scene-XZ metres (see DEVIATION note). Empty when
     *  `status !== 'ok'`. */
    insetPolygon: z.array(PtSchema).default([]),
    maxHeight_m: z.number().min(0).nullable().default(null),
    /**
     * §L-616 — the FAR-realistic massing height (m): the height a solid that respects FAR reaches
     * INSIDE the `maxHeight_m` legal shell. **Null when FAR does not bind** (`maxFAR` null — every
     * Barcelona 13a/13b alignment zone), and then the drawn solid == the height shell (unchanged
     * behaviour). When non-null and below `maxHeight_m`, the renderer draws a translucent shell at
     * `maxHeight_m` plus an opaque massing at this height, so a FAR that caps floorspace below the
     * height cap can no longer overstate buildable volume (the Copenhagen ~5× defect). Nullable +
     * default so existing constructors and persisted envelopes remain valid.
     */
    farLimitedHeight_m: z.number().min(0).nullable().default(null),
    maxFloors: z.number().int().min(0).nullable().default(null),
    maxFAR: z.number().min(0).nullable().default(null),
    maxCoverage: z.number().min(0).max(1).nullable().default(null),
    /** `area(insetPolygon) × maxHeight_m` — the 3D study volume. */
    maxVolumeM3: z.number().min(0).nullable().default(null),
    /** `area(insetPolygon)` in m² — the buildable-footprint area. */
    insetAreaM2: z.number().min(0).default(0),
    /**
     * §L-619 / §CONTEXT-DATA-HONESTY — TRUE when `insetPolygon` is the WHOLE parcel ONLY because the
     * setbacks (byggelinjer / retiros / separacions) are UNKNOWN (published as null), NOT because the
     * ordinance grants full-parcel coverage. The footprint is then an UPPER BOUND, not a solved
     * buildable area, and a consumer MUST render it as such — hatched/flagged — never as a confident
     * solid.
     *
     * This is the founder's Copenhagen karré defect (L-619): every perimeter block leaves a central
     * courtyard, but DK Plandata publishes no structured setbacks, so the engine's `?? 0` inset drew
     * the full 1,116 m² parcel. `unknown ≠ zero` — a null setback is not a licence to build to the
     * boundary. The honest footprint is a perimeter depth-band around the frontage (the DK
     * `block-derived-alignment` path); absent a resolvable block ring, this flag marks the full-parcel
     * ring as the study upper bound instead.
     *
     * ⚠ Default FALSE, and false is the norm: every zone with RESOLVED setbacks (even a real 0), a
     * footprint-shaping geometric rule (`alignment` / `block-derived-alignment` / `tiered-occupation`
     * / `explicit-area`) or a genuine full-coverage grant is a real footprint and is unchanged.
     * Additive with a default, so persisted envelopes remain valid.
     */
    footprintIsUpperBound: z.boolean().default(false),
    /**
     * §L-619 / DK-ENVELOPE-REALISM — HOW the footprint was placed (its geometric provenance). Null
     * for every zone whose footprint came from the setback/alignment/tiered/explicit-area paths;
     * populated only by a placement resolver (the DK perimeter-block resolver). Additive, default null.
     */
    /**
     * §OPEN-TOP-INDICATIVE (ADR-0293 / L-677) — WHAT PRYZM MAY CLAIM about this envelope, carried on
     * the envelope itself so the §1.14 massing seam is the ONE route every honesty field takes to the
     * picture. `'open-top-indicative'` makes `classifyEnvelopeCompleteness` return `complete: false`
     * and `openTop: true`, which forces the provisional grey + a literally UNCAPPED solid — an
     * indicative envelope therefore CANNOT render in the determination style, by construction rather
     * than by a renderer remembering to check.
     *
     * ⚠ NULL IS THE NORM AND MEANS "NOT STATED", NOT "REFUSED". Every envelope shipped before this —
     * and every persisted one — leaves it null and classifies EXACTLY as it did. Only a caller that
     * has consulted `envelopePublicationPosture()` (the single L2 authorisation decision point) may
     * stamp it. Additive with a default, so persisted envelopes remain valid.
     *
     * ⛔ IT CANNOT WIDEN ANYTHING. `'determination'` here is a RECORD of what the owned L-449 gate
     * already said; writing it does not consult, bypass or grant that gate, and the classifier treats
     * it identically to null. The only value that CHANGES behaviour is `'open-top-indicative'`, and it
     * only ever narrows: it can turn a confident violet grey, never the reverse.
     */
    publicationPosture: EnvelopePublicationPostureSchema.nullable().default(null),
    placement: EnvelopePlacementSchema.nullable().default(null),
    /**
     * §L-619 / DK-ENVELOPE-REALISM — the interior open space (karré courtyard) the footprint leaves,
     * and where that determination came from. Null when the envelope makes no open-space statement
     * (the norm — a filled setback/alignment footprint leaves no courtyard). Additive, default null.
     */
    openSpace: EnvelopeOpenSpaceSchema.nullable().default(null),
    permittedUse: z.array(PermittedUseSchema).default([]),
    /** MANDATORY confidence label (C58 §1.2) — there is no unlabelled envelope. */
    confidence: EnvelopeConfidenceSchema,
    /**
     * MANDATORY granularity discriminator (C58 §1.11, gap KG-2 — normative since 2026-07-20 and
     * unimplemented until now).
     *
     * A THIRD axis, independent of `confidence`. §1.2 models fidelity and §1.4 credibility;
     * neither catches the failure the live Spain pass exposed — **a source can be numeric,
     * published and authoritative and still be unusable, because it answers at the wrong
     * granularity.** Madrid VEDA publishes real buildable-m² at *ámbito* level; Valencia
     * `InventarioSuSuz` a real FAR at *sector* level. Both would earn a high confidence chip,
     * and neither answers "what may I build on THIS parcel". The number is not uncertain — it
     * is **about something else**, which is why no confidence label corrects it.
     *
     * ⚠ THE DISTINCTION THAT IS EASY TO GET BACKWARDS, and I did once: granularity describes
     * what the number is ABOUT, **not what was used to compute it**. A block-derived
     * *profunditat edificable* (ADR-0271) reads block geometry as an INPUT, but PGM Art. 242.2
     * is a parcel-level rule and the depth it yields is the correct legal answer for THIS plot.
     * Two parcels on one manzana share it because the ordinance makes it so, not because a
     * coarser figure was borrowed. It is therefore `'parcel'`. Stamping it `'block'` would trip
     * §1.11.3 and make the generator refuse a perfectly valid parcel constraint.
     *
     * `'unknown'` counts as coarser-than-parcel (§1.11.4) — never as parcel.
     */
    granularity: EnvelopeGranularitySchema.default('unknown'),
    status: EnvelopeStatusSchema.default('none'),
    /**
     * L-550 — present IFF `status === 'not-applicable'`; null otherwise. Refined below so the
     * two can never disagree: a refusal status with no reason would render as a blank card, and
     * a reason attached to an `ok` envelope would let a UI show "no envelope applies" beside a
     * perfectly good one.
     */
    refusal: EnvelopeRefusalSchema.nullable().default(null),
    /** The zone code the numbers resolved from (echoed for the report/UI). */
    zoneCode: z.string().min(1).nullable().default(null),
    /** Per-constraint "why" (C58 §1.3). */
    derivation: DerivationTraceSchema.default([]),
    /** Caveats — e.g. "uniform setback until edge classification (C58 §10.3)". */
    caveats: z.array(z.string().min(1)).default([]),
    /**
     * §L-590b / ADR-0273 — the tiers of a multi-tier envelope. See `EnvelopeTierSchema`.
     *
     * **EMPTY is the norm and means "a single prism", not "not filled in".** Every zone shipped
     * before ADR-0273 — every `setback`, `alignment` and `block-derived-alignment` zone — produces
     * one prism, and for those the legacy fields are the whole truth. Defaulting to `[]` is
     * therefore the identity, exactly as `GeometricRuleCompatSchema`'s `kind: 'setback'` stamp is.
     */
    tiers: z.array(EnvelopeTierSchema).default([]),
}).refine(
    // §L-550 (original intent) + §L-574 (the widening this refinement never caught up with),
    // corrected 2026-08-21 under §GIS-ENVELOPE-REFUSAL-PERSIST (L-1655).
    //
    // ⚠ THIS USED TO READ `(e.status === 'not-applicable') === (e.refusal !== null)`, i.e. a
    // refusal was legal ONLY on `'not-applicable'`. **That has been false in the code since
    // L-574**: `buildRefusedEnvelope(zoneCode, refusal, status)` types its status parameter
    // `'not-applicable' | 'none'` and the construction-incomplete refusal (attempted, no data)
    // is emitted as `'none'` WITH a refusal object; the envelope card branches on exactly
    // `(status === 'not-applicable' || status === 'none') && refusal`. Three places in the
    // code agreed; the schema disagreed alone — and it was never caught because nothing
    // PARSED a constructed envelope until L-1654 began persisting one. The moment it did,
    // every `'none'` refusal failed validation and took its whole `site.updateZoning` payload
    // down with it, dropping the zoning write on the refusal path (§L-663 guard, L-1655).
    //
    // THE L-550 INTENT IS UNCHANGED AND IS STILL ENFORCED, in both directions:
    //   · a refusal may appear ONLY on a refusing status — never on `'ok'`/`'degenerate'`, so
    //     a UI can still never deny an envelope it actually has;
    //   · `'not-applicable'` MUST carry its reason — a refusal without one renders as a blank
    //     card, which reads as a crash (L-553).
    // `'none'` is the one status that is legal BOTH ways: with a refusal it is "we attempted
    // and here is why we could not"; without one it is "no zoning data at all". Those are
    // genuinely different facts and the schema must admit both (C84 EI-1b).
    (e) => {
        if (e.refusal !== null) return e.status === 'not-applicable' || e.status === 'none';
        return e.status !== 'not-applicable';
    },
    {
        message:
            "`refusal` may be present ONLY on a refusing status ('not-applicable' or 'none'), " +
            "and 'not-applicable' MUST carry one — a refusal without a reason renders as a " +
            'blank card, and a reason on a solved envelope would let the UI deny an envelope ' +
            "it actually has (L-550; 'none'-with-refusal per L-574).",
        path: ['refusal'],
    },
).refine(
    // §L-590b — TIERS MAY NOT CONTRADICT THE LEGACY SCALARS.
    //
    // ⚠ THIS IS THE REFINEMENT THAT MAKES THE SCHEMA CHANGE SAFE FOR EVERY CONSUMER THAT HAS NEVER
    // HEARD OF TIERS. The whole migration risk of adding `tiers` is that a producer fills them and
    // leaves `insetPolygon` / `maxHeight_m` describing something else — and then the panel, the
    // Cesium massing and the generator bounds each read a prism that is not part of the solid. By
    // pinning the legacy fields to the PRINCIPAL tier the old readers are guaranteed to be reading
    // a REAL tier of the REAL envelope: under-stated (the other tiers are invisible to them) but
    // never over-stated, which is the one direction C58 §1.4 forbids.
    //
    // Compared on `insetAreaM2` + `maxHeight_m` rather than on polygon identity: the ring is the
    // same object by construction in the engine, and a vertex-by-vertex equality check in a Zod
    // refinement would be an O(n) hot path on every parse for a weaker guarantee than the area.
    (e) => {
        if (e.tiers.length === 0) return true;
        const p = principalTier(e.tiers);
        if (!p) return false;
        return (
            Math.abs(p.areaM2 - e.insetAreaM2) <= 1e-6 * Math.max(1, p.areaM2) &&
            p.maxHeight_m === e.maxHeight_m
        );
    },
    {
        message:
            'When `tiers` is non-empty the legacy single-prism fields MUST mirror the PRINCIPAL ' +
            'tier (tallest, ties on area): `insetAreaM2` must equal its area and `maxHeight_m` ' +
            'its height. Otherwise every tier-unaware consumer — the facts panel, the Cesium ' +
            'massing, the C58 §1.8 generator bounds — renders a prism that is not part of the ' +
            'solid (ADR-0273; C58 §1.4).',
        path: ['tiers'],
    },
).refine(
    // §L-619 — AN OPEN-SPACE STATEMENT REQUIRES A PLACEMENT.
    //
    // "This footprint leaves a courtyard" is only meaningful once you can say WHERE the footprint
    // came from. An `openSpace` with a null `placement` would be a void attributed to nothing — a
    // courtyard claim no reader could audit, which is precisely the un-sourced number C58 §1.6
    // exists to prevent. (The converse IS allowed: a placement resolver may place a footprint and
    // make no open-space statement at all.)
    (e) => e.openSpace === null || e.placement !== null,
    {
        message:
            '`openSpace` requires a non-null `placement` — a courtyard determination is only ' +
            'auditable alongside the footprint placement it came from (§L-619; C58 §1.6).',
        path: ['openSpace'],
    },
).refine(
    // §L-619 — THE PLACEMENT AND THE VOID MUST CITE THE SAME EVIDENCE CLASS.
    // See `OPEN_SPACE_SOURCES_BY_PLACEMENT` for why this pairing is load-bearing.
    (e) =>
        e.openSpace === null ||
        e.placement === null ||
        OPEN_SPACE_SOURCES_BY_PLACEMENT[e.placement.source].includes(e.openSpace.source),
    {
        message:
            '`openSpace.source` must belong to `placement.source` (see ' +
            'OPEN_SPACE_SOURCES_BY_PLACEMENT). A constructed footprint may not claim a published ' +
            'byggefelt hole as its courtyard — that launders a study into plan geometry (C58 §1.4).',
        path: ['openSpace', 'source'],
    },
).refine(
    // §L-619 — A REAL COURTYARD AND A FULL-PARCEL UPPER BOUND ARE MUTUALLY EXCLUSIVE.
    //
    // `footprintIsUpperBound` means "the ring is the WHOLE parcel only because the setbacks are
    // unknown". A footprint that genuinely leaves a courtyard is, by definition, not the whole
    // parcel — so asserting both would let a UI hatch a ring as unknown while simultaneously
    // reporting a solved void inside it. Exactly the Copenhagen karré defect read both ways at once.
    (e) => !(e.openSpace?.courtyard === true && e.footprintIsUpperBound),
    {
        message:
            '`openSpace.courtyard` and `footprintIsUpperBound` cannot both be true — a footprint ' +
            'that leaves a courtyard is not the whole parcel drawn as an upper bound (§L-619).',
        path: ['openSpace', 'courtyard'],
    },
);
export type BuildableEnvelope = z.infer<typeof BuildableEnvelopeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// §GIS-ENVELOPE-DETERMINATION-PERSIST (L-1654) — the determination as a DATED,
// PERSISTED ARTEFACT.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The full buildable determination, persisted onto the C19 Parcel at parcel-commit time and
 * hydrated on project load — so every surface (site view AND the main scene) can render the
 * complete card (values, confidence, per-field provenance, citations, refusals) without
 * re-deriving anything.
 *
 * Founder 2026-08-21: «once we have already selected the parcel — and working on this parcel
 * as our project — the parcel data should be there — present». Before this record existed,
 * only `Parcel.buildableRing` survived a reload, and the card fell to the L-445 "reduced" arm
 * (badge SAVED, max height only) everywhere outside the solving session.
 *
 * THE HONESTY RULES THIS RECORD CARRIES:
 *  · It is a SNAPSHOT, dated by `determinedAtIso`. A consumer MUST surface that date; a stored
 *    determination presented as freshly derived would be a provenance fabrication (C58 §1.4).
 *  · It is NEVER silently re-derived on load — the answer could change under the user, and
 *    re-derivation needs network. Re-committing the parcel is the ONE refresh action.
 *  · It records whatever the envelope said, refusals included: a cited refusal is a
 *    determination too, and it must survive a reload exactly like a solved envelope.
 *  · `null` on the Parcel means NOT RECORDED (a project saved before this record existed, or
 *    no determination ever ran) — a reader must say so, never render a blank (C84 EI-1b).
 */
export const BuildableDeterminationRecordSchema = z.object({
    /** The determination exactly as the engine emitted it, refusal branches included. */
    envelope: BuildableEnvelopeSchema,
    /** When the determination was made (parcel-commit time), ISO-8601. */
    determinedAtIso: z.string().datetime(),
    /** Bumped on breaking change to this record's own shape (C47). */
    schemaVersion: z.number().int().positive().default(1),
});
export type BuildableDeterminationRecord = z.infer<typeof BuildableDeterminationRecordSchema>;
