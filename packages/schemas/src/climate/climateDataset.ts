// A.10.a (Phase A · Sprint 2) — ClimateDataset root schema (C21 §2.1).
//
// The unified shape every workflow consumes — EPW or NOAA. Per
// [C21 §1.1] every dataset is anchored to a Site (lat/lon) and is
// READ-ONLY after ingestion (per [C21 §1.7]; the only legitimate
// mutations are full replacement via `climate.ingestEPW` /
// `climate.refreshNOAA` / `climate.invalidateCache`).

import { z } from 'zod';
import { SiteIdSchema } from '../site/types.js';
import {
    ClimateDatasetIdSchema,
    ClimateSourceSchema,
} from './types.js';
import { EPWRecordSchema } from './epwRecord.js';
import { NOAANormalSchema } from './noaaNormal.js';
import { WindRoseAggregateSchema } from './windRose.js';
import {
    DesignTemperaturesSchema,
    DegreeDayAggregatesSchema,
} from './designTemperatures.js';
import { ClimateProvenanceSchema } from './climateProvenance.js';

/**
 * Per [C21 §2.1] fields.
 *
 * Cross-schema invariants (enforced at higher layers — L3
 * ClimateStore / L2 ingestion adapter):
 *   - source: 'epw'                → hourly MUST be present (8760 records)
 *   - source: 'noaa-normals'       → hourly MUST be absent
 *   - source: 'fallback-defaults'  → hourly MUST be absent
 *   - monthlyNormals MUST have length === 12
 *   - timezone MUST be a valid IANA zone string (eg 'Europe/London')
 *   - elevationM SHOULD match the Site's elevation at ingestion
 *
 * These rules are NOT enforced by the L0 schema (refine blocks would
 * couple unrelated fields); the L3 store + ingestion code enforces
 * them on the write path.
 */
export const ClimateDatasetSchema = z.object({
    id: ClimateDatasetIdSchema,
    /** The Site this dataset belongs to (per §1.1). */
    siteRef: SiteIdSchema,
    /** Resolved coordinates at ingestion time (defensive copy from Site). */
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    elevationM: z.number().min(-500).max(9000),
    /** IANA timezone (eg 'Europe/London', 'America/New_York'). */
    timezone: z.string().min(1).max(80),
    /** Source tier per §1.2. */
    source: ClimateSourceSchema,
    /** Per-hour TMY records. Present only when source === 'epw'. */
    hourly: z.array(EPWRecordSchema).min(1).optional(),
    /** Per-month NOAA normals. Present for BOTH 'epw' AND 'noaa-normals'
     *  (computed from hourly when EPW). 12 entries, Jan..Dec. */
    monthlyNormals: z.array(NOAANormalSchema).length(12),
    /** 16-sector wind rose aggregate. */
    windRose: WindRoseAggregateSchema,
    /** ASHRAE design temperatures. */
    designTemps: DesignTemperaturesSchema,
    /** Heating + cooling degree-day aggregates at standard bases. */
    degreeDays: DegreeDayAggregatesSchema,
    /** Provenance block per §1.12. */
    provenance: ClimateProvenanceSchema,
    /** UTC timestamp when this dataset record was persisted. */
    ingestedAtUtcIso: z.string().datetime(),
});
export type ClimateDataset = z.infer<typeof ClimateDatasetSchema>;
