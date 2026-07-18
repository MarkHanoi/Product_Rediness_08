// C58 §2.1 — `ZoningRecord` (what a `ZoningProvider` returns).
//
// L0-pure: Zod only (P5). The raw zoning at a parcel, BEFORE the engine
// resolves an envelope. `structuredFields` carries any numeric fields the
// source published directly (the DK Plandata case, C58 §1.2 fidelity 1);
// when only a `zoneCode` is present the engine falls to the curated rule
// pack (fidelity 2 — `estimated-ruleset`).
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §2.1.

import { z } from 'zod';
import { EnvelopeNumbersSchema } from './EnvelopeNumbers.js';

/**
 * A minimal provenance stamp for a zoning record. C58 §2.1 references the
 * richer `ParcelProvenance` (C57 §2.2); until C57 lands its schema, we carry
 * the same shape locally so the record is self-describing and auditable.
 */
export const ZoningProvenanceSchema = z.object({
    /** Provider / source id (e.g. `'plandata-dk'`, `'estimated-default'`). */
    source: z.string().min(1),
    /** Human attribution line (C57 §1.9). */
    label: z.string().min(1).nullable().default(null),
    /** Source version / dataset stamp, when known. */
    version: z.string().min(1).nullable().default(null),
    /** License string, when known. */
    license: z.string().min(1).nullable().default(null),
    /** EPSG of the source geometry, when known. */
    crs: z.string().min(1).nullable().default(null),
});
export type ZoningProvenance = z.infer<typeof ZoningProvenanceSchema>;

export const ZoningRecordSchema = z.object({
    /** Jurisdiction zone code (ES `clau` / Madrid norma zonal / DK anvendelse). */
    zoneCode: z.string().min(1),
    zoneLabel: z.string().min(1).nullable().default(null),
    /** Resolves the rule pack (`'es-barcelona'`, `'dk'`, …). */
    jurisdictionId: z.string().min(1),
    /** Any numeric fields the source published directly (DK structured case). */
    structuredFields: EnvelopeNumbersSchema.partial().default({}),
    /** Conservation / flood / heritage overlay codes. */
    overlays: z.array(z.string().min(1)).default([]),
    provenance: ZoningProvenanceSchema,
});
export type ZoningRecord = z.infer<typeof ZoningRecordSchema>;
