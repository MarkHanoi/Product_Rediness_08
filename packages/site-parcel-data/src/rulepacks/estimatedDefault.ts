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
                // §ESTIMATED-SETBACK-MODEST (L-402d) — MODEST placeholder setbacks so a
                // typical small/normal urban plot (e.g. ~12×8 m) still yields a VISIBLE
                // buildable envelope instead of degenerating to nothing. The prior
                // 5/3/6 m eroded an 8 m-wide plot to a negative inset (side 3 m ×2 = 6 m,
                // leaving 2 m — and with the uniform-mean fallback ~4.67 m ×2 = 9.3 m > 8 m
                // → degenerate). 3 m front / 1.5 m side / 3 m rear (uniform mean 2.5 m)
                // leaves a plausible inset on normal plots while staying conservative.
                // These remain ESTIMATES (every field flagged `estimated`, ordinanceRef
                // null → `estimated-ruleset` confidence + mandatory "Estimated" badge);
                // real DK/ES zoning is the L-399 pack track, never an engine edit.
                setbacks: { front_m: 3, side_m: 1.5, rear_m: 3 },
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
