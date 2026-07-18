// C58 §1.6 / §2.2 — the honest `estimated` default rule pack.
//
// The FIRST slice ships exactly ONE pack: a generic, jurisdiction-agnostic
// estimate. Its numbers are CURATED PLACEHOLDERS — every field is flagged
// `estimated` and carries `ordinanceRef: null`, so the engine stamps the
// resulting envelope `confidence: 'estimated-ruleset'` and the UI shows the
// mandatory "Estimated" badge (C58 §1.4). We NEVER present these as authoritative.
//
// Real DK Plandata / ES Catastro packs (with `published-structured` /
// `ordinance-pdf` provenance + real `ordinanceRef`s) are the L-399 parallel
// track — a new pack + adapter, never an engine edit (C58 §1.5).
//
// L2 data artefact (pure). Validated against the L0 schema at module load so a
// malformed pack fails loudly, not silently.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';

/**
 * The generic estimated pack. One zone (`generic-urban`) with conservative,
 * plausible mid-density-residential numbers. These are ESTIMATES for a study
 * volume, not a compliance determination.
 */
export const ESTIMATED_DEFAULT_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'estimated-default',
        displayName: 'Estimated (default rule pack)',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-18',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: 'generic-urban',
                label: 'Generic urban (estimated)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 12,
                maxFloors: 4,
                plotRatioFAR: 2,
                maxCoverage: 0.5,
                setbacks: { front_m: 5, side_m: 3, rear_m: 6 },
                // Every field is an estimate — no field is published-structured.
                fieldProvenance: {
                    maxHeight: 'estimated',
                    maxFloors: 'estimated',
                    maxFAR: 'estimated',
                    maxCoverage: 'estimated',
                    'setback.front': 'estimated',
                    'setback.side': 'estimated',
                    'setback.rear': 'estimated',
                    permittedUse: 'estimated',
                },
                ordinanceRef: null,
            },
        ],
    });

/** The zone code the estimated default resolves everything to. */
export const ESTIMATED_DEFAULT_ZONE_CODE = 'generic-urban';

/**
 * Build the `ZoningRecord` for the estimated-default path when no real provider
 * has been consulted. A `zoneCode`-only record → the engine falls to the pack
 * (C58 §1.2 fidelity 2 → `estimated-ruleset`).
 */
export function estimatedDefaultZoningRecord() {
    return {
        zoneCode: ESTIMATED_DEFAULT_ZONE_CODE,
        zoneLabel: 'Generic urban (estimated)',
        jurisdictionId: 'estimated-default',
        structuredFields: {},
        overlays: [] as string[],
        provenance: {
            source: 'estimated-default',
            label: 'PRYZM estimated default rule pack',
            version: '2026-07-18',
            license: null,
            crs: 'EPSG:4326',
        },
    };
}
