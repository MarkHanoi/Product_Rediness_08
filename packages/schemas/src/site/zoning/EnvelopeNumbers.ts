// C58 §2.3 — `EnvelopeNumbers` (the shared numeric core of a zoning rule).
//
// L0-pure: Zod only. No I/O, no THREE, no DOM (P5).
//
// The numeric building rules shared by `ZoningRecord.structuredFields`
// (the fields a provider published directly) and each `JurisdictionZoningContract`
// zone (the curated rule-pack numbers). Every numeric field is nullable — a
// source or a pack may know only a subset (C58 §1.2 / §1.6), and a `null` is
// an honest "unknown", never an invented `0`.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §2.3.

import { z } from 'zod';

/**
 * Permitted land-use classes (C58 §2.2 `permittedUse`). Jurisdiction use-codes
 * (ES `clau` / DK `anvendelse`) map onto this closed vocabulary so the
 * downstream typology-brief hand-off (C58 §1.8 / §10.2) is jurisdiction-agnostic.
 */
export const PermittedUseSchema = z.enum([
    'residential',
    'commercial',
    'industrial',
    'mixed',
    'civic',
    'green',
    'other',
]);
export type PermittedUse = z.infer<typeof PermittedUseSchema>;

/**
 * Per-edge setback distances in metres. `null` = the axis is unknown for this
 * rule (distinct from `0` = an explicit "no setback"). Front / side / rear map
 * onto the C19 `ParcelEdgeClassification` values.
 */
export const EnvelopeSetbacksSchema = z.object({
    front_m: z.number().min(0).nullable().default(null),
    side_m: z.number().min(0).nullable().default(null),
    rear_m: z.number().min(0).nullable().default(null),
});
export type EnvelopeSetbacks = z.infer<typeof EnvelopeSetbacksSchema>;

/**
 * The shared numeric shape (C58 §2.3). Partial by construction — a DK structured
 * record may carry `maxHeight_m` + `plotRatioFAR` but no coverage; a curated
 * estimate may carry only setbacks + height. Missing = `null`.
 */
export const EnvelopeNumbersSchema = z.object({
    maxHeight_m: z.number().min(0).nullable().default(null),
    maxFloors: z.number().int().min(0).nullable().default(null),
    /** edificabilitat / Ausnützungsziffer / bebyggelsesprocent→ratio. */
    plotRatioFAR: z.number().min(0).nullable().default(null),
    /** Ground coverage 0..1. */
    maxCoverage: z.number().min(0).max(1).nullable().default(null),
    setbacks: EnvelopeSetbacksSchema.default({
        front_m: null,
        side_m: null,
        rear_m: null,
    }),
    permittedUse: z.array(PermittedUseSchema).default([]),
});
export type EnvelopeNumbers = z.infer<typeof EnvelopeNumbersSchema>;
