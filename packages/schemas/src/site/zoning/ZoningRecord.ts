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
import { EnvelopeGranularitySchema } from './BuildableEnvelope.js';

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
    /**
     * Citation of the governing legal document for this record (C58 §1.3), when
     * the source publishes one — e.g. the DK Plandata plan-document link
     * (`doklink`). The engine threads this into every `DerivationEntry.ordinanceRef`
     * for a structured record with no curated pack (where `zone.ordinanceRef` is
     * absent). `null` = the source published no citation (never fabricated).
     */
    ordinanceRef: z.string().min(1).nullable().default(null),
    /**
     * C58 §1.11 — the GRANULARITY the source answers at, when a provider knows it is coarser than
     * the parcel. OPTIONAL and additive: a provider that returns a genuinely parcel-level record
     * (every one shipped today — Barcelona MUC, DK Plandata) omits it, and `computeBuildableEnvelope`
     * then stamps the envelope `'parcel'` (`zoning.granularity ?? 'parcel'`), so nothing changes.
     *
     * ⚠ It exists for the coarse sources §1.11 was written for — Madrid VEDA at *ámbito* level,
     * Valencia `InventarioSuSuz` at *sector* level: real, published, authoritative NUMBERS that are
     * nonetheless NOT about this plot. Such a provider stamps the true granularity here (`'ambito'`,
     * `'sector'`, …) and it flows to `BuildableEnvelope.granularity`, where §1.11.3 forbids it being
     * shown as this parcel's envelope. Granularity describes what the number is ABOUT, not what was
     * used to compute it — so a parcel-level rule that merely READS block geometry (Art. 242.2) is
     * still `'parcel'` and must NOT stamp a coarser value here.
     */
    granularity: EnvelopeGranularitySchema.optional(),
    provenance: ZoningProvenanceSchema,
});
export type ZoningRecord = z.infer<typeof ZoningRecordSchema>;
