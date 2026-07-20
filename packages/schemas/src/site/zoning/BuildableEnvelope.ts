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
export const EnvelopeStatusSchema = z.enum(['ok', 'degenerate', 'none']);
export type EnvelopeStatus = z.infer<typeof EnvelopeStatusSchema>;

/**
 * The engine output (C58 §2.4). See the DEVIATION note above re `insetPolygon`.
 */
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
    status: EnvelopeStatusSchema.default('none'),
    /** The zone code the numbers resolved from (echoed for the report/UI). */
    zoneCode: z.string().min(1).nullable().default(null),
    /** Per-constraint "why" (C58 §1.3). */
    derivation: DerivationTraceSchema.default([]),
    /** Caveats — e.g. "uniform setback until edge classification (C58 §10.3)". */
    caveats: z.array(z.string().min(1)).default([]),
});
export type BuildableEnvelope = z.infer<typeof BuildableEnvelopeSchema>;
