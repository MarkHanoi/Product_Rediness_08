// A.10.a (Phase A · Sprint 2) — ClimateProvenance schema (C21 §1.12 + §2.8).
//
// Every ClimateDataset carries a provenance block — this is the C21
// contribution to the future C23 Provenance contract: every site-
// derived datum traces back to its source. Mandatory fields per §1.12.

import { z } from 'zod';
import { ClimateSourceSchema } from './types.js';

/**
 * Per [C21 §1.12] / §2.8 fields:
 *   - source            mirrors ClimateDataset.source
 *   - vendor            free-form ('EnergyPlus.net' · 'NOAA NCEI' · 'PRYZM-builtin')
 *   - datasetVersion    SemVer or vintage string ('epw-tmy3-2024.1' · 'noaa-normals-1991-2020')
 *   - filename          if EPW upload
 *   - fileSha256        if EPW upload — for reproducibility
 *   - fetchedAtUtcIso   when WE pulled the data
 *   - license           SPDX identifier preferred
 *   - notes             free-form annotation
 */
export const ClimateProvenanceSchema = z.object({
    source: ClimateSourceSchema,
    vendor: z.string().min(1).max(200),
    datasetVersion: z.string().min(1).max(120),
    filename: z.string().min(1).max(500).optional(),
    fileSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/i, 'fileSha256 must be a 64-char hex sha256')
        .optional(),
    fetchedAtUtcIso: z.string().datetime(),
    license: z.string().min(1).max(200),
    notes: z.string().max(5000).optional(),
});
export type ClimateProvenance = z.infer<typeof ClimateProvenanceSchema>;
