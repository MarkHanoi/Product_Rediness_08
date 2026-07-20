// C58 §2.2 — `JurisdictionZoningContract` (the curated rule pack).
//
// L0-pure: Zod only (P5). The per-jurisdiction pack that fills PDF-trapped
// numbers (C58 §1.6): a zone code → numeric envelope, with PER-FIELD provenance
// so a published height and a PDF-transcribed setback are never conflated.
//
// > No jurisdiction rule VALUES are asserted in the schema. The schema defines
// > the slots; the numeric packs (`es-barcelona`, `dk`, …) are curated data
// > artefacts authored + versioned separately (C58 §2.2 note / L-399).
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §2.2/§1.6.

import { z } from 'zod';
import { PermittedUseSchema } from './EnvelopeNumbers.js';
import { GeometricRuleCompatSchema } from '../GeometricRule.js';
import {
    FieldProvenanceSchema,
    RulePackDefaultConfidenceSchema,
} from './ProvenanceFlags.js';

/**
 * The source system a pack's numbers were curated from (C58 §2.2 `source`).
 */
export const ZoningPackSourceSchema = z.enum([
    'catastro-muc',
    'madrid-pgou',
    'oereb',
    'plandata-dk',
    'terrara',
    'manual',
]);
export type ZoningPackSource = z.infer<typeof ZoningPackSourceSchema>;

/**
 * A single zone entry in a rule pack (C58 §2.2 `zones[]`). Numeric fields are
 * nullable — an unknown value is a `null` plus an `estimated`/`ordinance-pdf`
 * provenance flag, NEVER an invented number.
 */
export const ZoningRuleSchema = z.object({
    /** Matches `ZoningRecord.zoneCode`. */
    code: z.string().min(1),
    label: z.string().min(1),
    permittedUse: z.array(PermittedUseSchema).default([]),
    maxHeight_m: z.number().min(0).nullable().default(null),
    maxFloors: z.number().int().min(0).nullable().default(null),
    plotRatioFAR: z.number().min(0).nullable().default(null),
    maxCoverage: z.number().min(0).max(1).nullable().default(null),
    setbacks: z
        .object({
            front_m: z.number().min(0).nullable().default(null),
            side_m: z.number().min(0).nullable().default(null),
            rear_m: z.number().min(0).nullable().default(null),
        })
        .default({ front_m: null, side_m: null, rear_m: null }),
    /**
     * Per-field provenance (C58 §1.6). Keyed by the constraint name
     * (`maxHeight` / `setback.front` / `plotRatioFAR` / …). A field without an
     * entry is treated as `estimated` by the engine (the safe default).
     */
    fieldProvenance: z.record(z.string(), FieldProvenanceSchema).default({}),
    /** Citation of the governing legal document (C58 §1.3), or null. */
    ordinanceRef: z.string().min(1).nullable().default(null),
    /**
     * ADR-0270 P5 / C58 §2.2 — the GEOMETRIC RULE that shapes the buildable area for this zone.
     *
     * WITHOUT THIS FIELD A PACK COULD NOT DECLARE AN ALIGNMENT ZONE AT ALL. The `alignment`
     * variant shipped in A1a and the solver branch shipped in A1b, but `computeBuildableEnvelope`
     * only ever accepted a `geometricRule` as a SIBLING INPUT — which nothing in production
     * populated, so the whole alignment path was reachable only from tests. This is the slot that
     * makes a curated *ensanche* pack expressible.
     *
     * OMITTED / `null` ⇒ the legacy per-edge inset from `setbacks` above, which is the implicit
     * `kind: 'setback'` behaviour every existing pack relies on. Purely additive: no shipped pack
     * changes meaning, and `GeometricRuleCompatSchema` stamps `kind:'setback'` on a legacy triple.
     *
     * ⚠ `setbacks` ABOVE REMAINS THE INSET INPUT even for an alignment zone — the alignment rule
     * adds the depth band; it does not replace the per-edge inset. Keep the two consistent when
     * authoring a pack (see C58 §1.7a and the note in `ZoningRulesEngine`).
     */
    geometricRule: GeometricRuleCompatSchema.nullable().default(null),
});
export type ZoningRule = z.infer<typeof ZoningRuleSchema>;

/**
 * The per-jurisdiction curated, versioned, provenance-tagged rule pack
 * (C58 §2.2 / §1.6). `lastReviewed` makes curation freshness auditable.
 */
export const JurisdictionZoningContractSchema = z.object({
    jurisdictionId: z.string().min(1),
    displayName: z.string().min(1),
    source: ZoningPackSourceSchema,
    /** EPSG of the source geometry (informational; the engine works scene-XZ). */
    crs: z.string().min(1),
    /** Curation freshness — ISO date (C58 §1.6). */
    lastReviewed: z.string().min(4),
    defaultConfidence: RulePackDefaultConfidenceSchema,
    zones: z.array(ZoningRuleSchema).default([]),
});
export type JurisdictionZoningContract = z.infer<
    typeof JurisdictionZoningContractSchema
>;
