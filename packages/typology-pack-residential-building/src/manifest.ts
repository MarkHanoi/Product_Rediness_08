// Residential building (multi-family) — Slice 0 / Tracker P1.A.
//
// The C50-compliant `TypologyManifest` for the multi-family residential-building
// typology pack — a PEER to `casa-unifamiliar` (house) and `apartment`. It is the
// THIRD generative typology: a multi-storey stack of T1-T4 apartments laid around
// a central vertical-circulation core (stair + lift) with an optional commercial
// ground floor.
//
// Static + zod-validated at module load: if the schema rejects it the process
// refuses to start (canary), exactly as the house pack.
//
// The §5.1 input model (audit/plan) maps onto the C50 briefSchema:
//   minApartmentAreaM2 / maxApartmentAreaM2  → two `range` fields (the packing band)
//   typologies {T1,T2,T3,T4}                 → one `multiselect` (mix is allowed)
//   levels 1..20                             → one `stepper`
//   commercialGroundFloor                    → one `toggle` (default ON)
//
// Strategic context — see:
//   - docs/03-execution/plans/RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md §5, §6
//   - docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md P1.A
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md §1, §2.6

import { TypologyManifestSchema, type TypologyManifest } from '@pryzm/schemas';

/**
 * The canonical residential-building manifest. Consumed by
 * `buildResidentialBuildingTypologyPack()` + the TypologyPicker UI for card
 * metadata + the RAC chatbot for `parseTypologyIdFromText` recognition.
 *
 * GATING NOTE: registration (the pack appearing in the picker) is gated OFF by
 * default in composeRuntime until the orchestrator slices are browser-validated
 * — see `buildResidentialBuildingTypologyPack.ts` + the composeRuntime flag.
 */
export const RESIDENTIAL_BUILDING_MANIFEST: TypologyManifest = TypologyManifestSchema.parse({
    id: 'residential-building',
    displayName: 'Residential Building (Multi-Family)',
    category: 'residential',
    version: '0.1.0',
    description:
        'Multi-family residential building — a multi-storey stack of T1-T4 apartments around a ' +
        'central core (stair + lift), per-level public corridor, and an optional commercial ' +
        'ground floor. Mixes the multi-storey house orchestration with the single-plate apartment engine.',
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
    // Nominal entry paths (the building orchestrator lands in later slices; the
    // bridge stage stands in until then). Satisfies the manifest's "at least one
    // of {aiWorkflowEntry, deterministicEngineEntry}" requirement.
    aiWorkflowEntry: 'workflow.js',
    deterministicEngineEntry: 'det/run-residential-building.js',
    programRulesEntry: 'program-rules.json',
    // The room set is the apartment program (T1-T4 dwellings) PLUS the building-scale
    // shared-circulation + commercial room types. Free-string per the schema.
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
        'balcony',
        'stair',
        'landing',
        // Building-scale shared circulation + commercial.
        'lift-lobby',
        'public-corridor',
        'commercial',
        'lobby',
    ],
    defaultDrawingStandard: 'RIBA',
    // The §5.1 input model. The onboarding RAC + the "Choose a layout" picker render
    // these controls; captured values become the structured Brief keyed by field id.
    // The building orchestrator (later slices) consumes these keys — keep them stable.
    briefSchema: {
        fields: [
            {
                kind: 'range',
                id: 'minApartmentAreaM2',
                label: 'Min apartment area',
                min: 25,
                max: 200,
                step: 5,
                default: 45,
                unit: 'm²',
            },
            {
                kind: 'range',
                id: 'maxApartmentAreaM2',
                label: 'Max apartment area',
                min: 25,
                max: 250,
                step: 5,
                default: 120,
                unit: 'm²',
            },
            {
                kind: 'multiselect',
                id: 'typologies',
                label: 'Apartment typologies',
                options: [
                    { value: 'T1', label: 'T1 (1-bed)' },
                    { value: 'T2', label: 'T2 (2-bed)' },
                    { value: 'T3', label: 'T3 (3-bed)' },
                    { value: 'T4', label: 'T4 (4-bed)' },
                ],
                default: ['T2', 'T3'],
            },
            {
                kind: 'stepper',
                id: 'levels',
                label: 'Residential levels (above ground)',
                min: 1,
                max: 20,
                default: 4,
            },
            {
                kind: 'toggle',
                id: 'commercialGroundFloor',
                label: 'Commercial ground floor',
                default: true,
            },
        ],
    },
    phaseGate: 'alpha',
});
