// A.21.a — Casa Unifamiliar (single-family house) typology manifest.
//
// The C50-compliant `TypologyManifest` for the house typology pack — the SECOND
// typology and the first MULTI-STOREY one. Static + zod-validated at module load:
// if the schema rejects it the process refuses to start (canary).
//
// Strategic context — see:
//   - docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md (requirements + architecture)
//   - docs/03-execution/plans/master-execution-tracker.md A.21 (A.21.a–A.21.x)
//   - docs/03-execution/plans/typology-expansion-roadmap.md §5 (T2 house)
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md §6

import { TypologyManifestSchema, type TypologyManifest } from '@pryzm/schemas';

/**
 * The canonical Casa Unifamiliar manifest. Consumed by
 * `buildCasaUnifamiliarTypologyPack()` + the `TypologyPicker` UI for card
 * metadata + the RAC chatbot for `parseTypologyIdFromText` recognition.
 */
export const CASA_UNIFAMILIAR_MANIFEST: TypologyManifest = TypologyManifestSchema.parse({
    id: 'casa-unifamiliar',
    // Surfaces the Spanish-market framing; the card also reads as "House / Villa".
    displayName: 'Casa Unifamiliar (House)',
    category: 'residential',
    version: '0.1.0',
    description:
        'Single-family house / villa — 1–3 storeys with a staircase connecting floors. ' +
        'Living/kitchen/dining + garage on the entrance level; bedrooms upstairs. ' +
        'First multi-storey typology on the agnostic spine (multi-storey generator A.21.c+).',
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
    // Nominal entry paths (the multi-storey generator lands in A.21.c; the bridge
    // stage stands in until then). They satisfy the manifest's "at least one of
    // {aiWorkflowEntry, deterministicEngineEntry}" requirement.
    aiWorkflowEntry: 'workflow.js',
    deterministicEngineEntry: 'det/run-house-layout.js',
    programRulesEntry: 'program-rules.json',
    // House room types — the apartment set PLUS the multi-storey/house additions
    // (stair, landing, garage, porch, terrace). Free-string per the schema.
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
        'stair',
        'landing',
        'garage',
        'porch',
        'terrace',
    ],
    defaultDrawingStandard: 'RIBA',
    // A.21.a — the typology-declared project brief (ADR-0056). The onboarding RAC
    // renders these as compact controls; captured values become the structured
    // `Brief` keyed by field id. NOTE: the multi-storey generator (A.21.c) consumes
    // these keys — keep them stable when wiring generation.
    briefSchema: {
        fields: [
            {
                kind: 'stepper',
                id: 'floors',
                label: 'Floors / storeys',
                min: 1,
                max: 3,
                default: 2,
            },
            {
                kind: 'range',
                id: 'bedrooms',
                label: 'Bedrooms',
                min: 1,
                max: 6,
                step: 1,
                default: 3,
            },
            {
                kind: 'range',
                id: 'bathrooms',
                label: 'Bathrooms',
                min: 1,
                max: 4,
                step: 1,
                default: 2,
            },
            {
                kind: 'select',
                id: 'garage',
                label: 'Garage',
                options: [
                    { value: 'none', label: 'None' },
                    { value: '1-car', label: '1-car' },
                    { value: '2-car', label: '2-car' },
                ],
                default: '1-car',
            },
            {
                kind: 'toggle',
                id: 'garden',
                label: 'Garden / terrace',
                default: true,
            },
            {
                kind: 'toggle',
                id: 'openPlanKitchenDining',
                label: 'Open-plan kitchen + dining',
                default: true,
            },
            {
                kind: 'select',
                id: 'masterLocation',
                label: 'Master bedroom',
                options: [
                    { value: 'upper', label: 'Upstairs' },
                    { value: 'ground', label: 'Ground floor (accessible)' },
                ],
                default: 'upper',
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
                kind: 'range',
                id: 'targetAreaM2',
                label: 'Target area (total)',
                min: 70,
                max: 400,
                step: 10,
                default: 140,
                unit: 'm²',
            },
            {
                kind: 'text',
                id: 'notes',
                label: 'Anything else',
                placeholder: 'e.g. home office, double-height entrance, ground-floor guest room…',
            },
        ],
    },
    phaseGate: 'alpha',
});
