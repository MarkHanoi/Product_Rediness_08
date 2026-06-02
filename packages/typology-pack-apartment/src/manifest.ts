// A.4.a (Phase A · Sprint 2) — Apartment typology manifest.
//
// The C50-compliant `TypologyManifest` for the apartment typology pack.
// Static + zod-validated at module load — if the schema rejects it, the
// process refuses to start (canary).
//
// Strategic context — see:
//   - docs/03-execution/plans/typology-expansion-roadmap.md §5.1 (T1 apartment)
//   - docs/03-execution/plans/master-execution-tracker.md A.4
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md §6 (migration)

import { TypologyManifestSchema, type TypologyManifest } from '@pryzm/schemas';

/**
 * The canonical apartment typology manifest. Used by the
 * `buildApartmentTypologyPack()` factory + by `TypologyPicker` UI for
 * card metadata.
 */
export const APARTMENT_MANIFEST: TypologyManifest = TypologyManifestSchema.parse({
    id: 'apartment',
    displayName: 'Apartment',
    category: 'residential',
    version: '1.0.0',
    description:
        'Residential apartment unit. 12 room types · adjacency + privacy gradient · ' +
        'D-TGL deterministic layout + AI workflow.',
    thumbnail: 'thumb.webp',
    author: 'PRYZM',
    requiredPlanTier: 'solo',
    cognitionLayers: [
        'L1-environmental',
        'L2-spatial-hierarchy',
        'L3-semantic-topology',
        'L4-compositional-geometry',
        'L7-typology-priors',
    ],
    // Entry paths are nominal (the bridge does not load them yet — full
    // pack-loader adapter lands in A.4.b). They satisfy the manifest's
    // requirement that AT LEAST ONE of {aiWorkflowEntry, deterministicEngineEntry}
    // is set.
    aiWorkflowEntry: 'workflow.js',
    deterministicEngineEntry: 'det/run-deterministic-layout.js',
    programRulesEntry: 'program-rules.json',
    roomTypes: [
        'living',
        'kitchen',
        'dining',
        'master',
        'bedroom',
        'bathroom',
        'ensuite',
        'wc',
        'corridor',
        'hall',
        'study',
        'utility',
    ],
    defaultDrawingStandard: 'RIBA',
    phaseGate: 'alpha',
});
