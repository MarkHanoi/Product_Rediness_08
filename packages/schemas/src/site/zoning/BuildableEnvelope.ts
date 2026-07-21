// C58 §2.4 — `BuildableEnvelope` + `DerivationTrace` (the engine output).
//
// L0-pure: Zod only (P5). Transient — NOT persisted authored model data
// (C58 §1.7): the numeric results reach the C19 Parcel via `site.updateZoning`;
// this full object (with its confidence label + per-constraint derivation) is
// what the compliance report + the 3D Forma render read.
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
     * `no-rule-pack` is the only `false` today. The distinction is load-bearing: "the ordinance
     * grants no envelope here" and "we have not encoded this zone yet" are opposite claims and
     * must never share a rendering.
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

export const BuildableEnvelopeSchema = z.object({
    /** `parcel ⊖ setbacks` in scene-XZ metres (see DEVIATION note). Empty when
     *  `status !== 'ok'`. */
    insetPolygon: z.array(PtSchema).default([]),
    maxHeight_m: z.number().min(0).nullable().default(null),
    maxFloors: z.number().int().min(0).nullable().default(null),
    maxFAR: z.number().min(0).nullable().default(null),
    maxCoverage: z.number().min(0).max(1).nullable().default(null),
    /** `area(insetPolygon) × maxHeight_m` — the 3D study volume. */
    maxVolumeM3: z.number().min(0).nullable().default(null),
    /** `area(insetPolygon)` in m² — the buildable-footprint area. */
    insetAreaM2: z.number().min(0).default(0),
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
}).refine(
    (e) => (e.status === 'not-applicable') === (e.refusal !== null),
    {
        message:
            "`refusal` must be present exactly when status is 'not-applicable' — a refusal " +
            'without a reason renders as a blank card, and a reason on a solved envelope would ' +
            'let the UI deny an envelope it actually has (L-550).',
        path: ['refusal'],
    },
);
export type BuildableEnvelope = z.infer<typeof BuildableEnvelopeSchema>;
