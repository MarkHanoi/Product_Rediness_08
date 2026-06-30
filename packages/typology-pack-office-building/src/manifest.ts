// Office building — the C50-compliant TypologyManifest. The FOURTH generative
// typology, a PEER to casa-unifamiliar (house), apartment, and residential-building.
//
// An office TOWER: a tall stack of CIRCULAR floor plates around a CENTRED CORE
// (lifts + stairs + MEP + WCs), with concentric desk rings, perimeter offices /
// collaboration pods at the glass, and department/floor-type variety (café/amenity
// ground, sky-lobby, mechanical/refuge floors, executive top).
//
// Static + zod-validated at module load (canary): if the schema rejects it the
// process refuses to start, exactly as the other packs.
//
// The §brief input model maps onto the C50 briefSchema:
//   stories 1..40+            → one `stepper`
//   floorToFloorM             → one `range`
//   radiusM (circular plate)  → one `range`
//   deskDensity 4..8          → one `range`
//   deskMode bench/individual → one `select`
//   culture open/perimeter    → one `select`
//   plateShape (circular demo)→ one `select`

import { TypologyManifestSchema, type TypologyManifest } from '@pryzm/schemas';

/**
 * The canonical office-building manifest. Consumed by
 * `buildOfficeBuildingTypologyPack()` + the TypologyPicker UI for card metadata +
 * the RAC chatbot for typology recognition.
 *
 * GATING NOTE: registration (the pack appearing in the picker) is gated OFF by
 * default in composeRuntime until browser-validated — see the composeRuntime flag
 * `__PRYZM_OFFICE_BUILDING__`.
 */
export const OFFICE_BUILDING_MANIFEST: TypologyManifest = TypologyManifestSchema.parse({
    id: 'office-building',
    displayName: 'Office Building (Tower)',
    category: 'workplace',
    version: '0.1.0',
    description:
        'Office tower — a stack of circular floor plates around a centred core (lifts, stairs, ' +
        'MEP, WCs), with concentric open-plan desk rings, perimeter offices / collab pods at the ' +
        'glass, and floor-type variety (amenity, sky-lobby, mechanical, executive).',
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
    aiWorkflowEntry: 'workflow.js',
    deterministicEngineEntry: 'det/run-office-building.js',
    programRulesEntry: 'program-rules.json',
    // The office program: workstation zones + the building-scale circulation/core/amenity.
    roomTypes: [
        'workstation-zone',
        'meeting',
        'office',
        'collab-pod',
        'core',
        'cafe',
        'reception',
        'lift-lobby',
        'circulation',
        'mechanical',
        'executive',
        'amenity',
    ],
    defaultDrawingStandard: 'RIBA',
    briefSchema: {
        fields: [
            {
                kind: 'stepper',
                id: 'stories',
                label: 'Storeys',
                min: 1,
                max: 40,
                default: 40,
            },
            {
                kind: 'range',
                id: 'floorToFloorM',
                label: 'Floor-to-floor height',
                min: 3,
                max: 6,
                step: 0.1,
                default: 4,
                unit: 'm',
            },
            {
                kind: 'range',
                id: 'radiusM',
                label: 'Floor-plate radius',
                min: 10,
                max: 45,
                step: 1,
                default: 22,
                unit: 'm',
            },
            {
                kind: 'range',
                id: 'deskDensityPer1000Sqft',
                label: 'Desk density',
                min: 4,
                max: 8,
                step: 0.5,
                default: 6,
                unit: '/1000 sqft',
            },
            {
                kind: 'select',
                id: 'deskMode',
                label: 'Workstation type',
                options: [
                    { value: 'bench', label: 'Bench (dense)' },
                    { value: 'individual', label: 'Individual desks' },
                ],
                default: 'bench',
            },
            {
                kind: 'select',
                id: 'culture',
                label: 'Workplace culture',
                options: [
                    { value: 'open-plan-first', label: 'Open-plan first (desks at the glass)' },
                    { value: 'perimeter-offices-first', label: 'Perimeter offices first' },
                ],
                default: 'open-plan-first',
            },
            {
                kind: 'select',
                id: 'plateShape',
                label: 'Floor-plate shape',
                options: [
                    { value: 'circular', label: 'Circular' },
                ],
                default: 'circular',
            },
        ],
    },
    phaseGate: 'alpha',
});
