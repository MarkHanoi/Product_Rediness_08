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
    // O.12.a — the typology-declared project brief. The onboarding RAC renders
    // these fields as compact controls (sliders / toggles / select / text) and
    // captures a structured `Brief` keyed by field id.
    //
    // CRITICAL: each field `id` MUST match the live generator/picker keys in
    // apps/editor/src/ui/apartment-layout/layoutRequestPayload.ts DEFAULT_PROGRAM
    // — these values feed `buildLayoutCommands` directly. In particular the
    // master-en-suite key is `masterEnSuite` (capital S), which is the live
    // ApartmentProgram key; this deviates from SPEC §3's `masterEnsuite` (see
    // ADR-0056). The live key wins.
    briefSchema: {
        fields: [
            {
                kind: 'range',
                id: 'bedrooms',
                label: 'Bedrooms',
                min: 1,
                max: 5,
                step: 1,
                default: 2,
            },
            {
                kind: 'range',
                id: 'bathrooms',
                label: 'Bathrooms',
                min: 1,
                max: 3,
                step: 1,
                default: 1,
            },
            {
                kind: 'select',
                id: 'style',
                label: 'Style',
                // A.21.D19 — four architecturally-grounded styles, each driving a
                // distinct material + colour palette across furniture, floors + walls.
                options: [
                    { value: 'nordic', label: 'Nordic' },
                    { value: 'mediterranean', label: 'Mediterranean' },
                    { value: 'minimalist', label: 'Minimalist' },
                    { value: 'classic', label: 'Classic' },
                ],
                default: 'nordic',
            },
            {
                kind: 'toggle',
                id: 'openPlanKitchenDining',
                label: 'Open-plan kitchen + dining',
                default: true,
            },
            {
                kind: 'toggle',
                id: 'masterEnSuite',
                label: 'Master en-suite',
                default: false,
            },
            {
                kind: 'range',
                id: 'targetAreaM2',
                label: 'Target area',
                min: 40,
                max: 200,
                step: 5,
                default: 75,
                unit: 'm²',
            },
            {
                kind: 'text',
                id: 'notes',
                label: 'Anything else',
                placeholder: 'e.g. home office, accessible bathroom…',
            },
        ],
    },
    phaseGate: 'alpha',
});
