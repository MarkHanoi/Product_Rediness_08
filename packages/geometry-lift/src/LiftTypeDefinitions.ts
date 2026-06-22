// @pryzm/geometry-lift — built-in lift system types (mirror of StairTypeDefinitions).
//
// Residential-building (multi-family) — Slice A / P2. Default lift system types,
// one per LiftKind. Sizes follow common EN 81-70 / domestic-lift practice:
//   - passenger 8-person:  ~1.1 m × 1.4 m car  → ~1.8 m × 1.8 m shaft
//   - accessible (EN 81-70 type 2): ~1.1 m × 1.4 m clear → ~1.8 m × 2.0 m shaft
//   - goods/service:       larger car → ~2.0 m × 2.4 m shaft
// Sizes are nominal defaults the create command can resolve; the architect can
// override per-instance (shaftWidth/shaftDepth on the command input).

import type { LiftKind } from './LiftTypes';

export interface LiftTypeDefinition {
    id: string;
    name: string;
    kind: LiftKind;
    defaults: {
        shaftWidth: number;
        shaftDepth: number;
        carCapacityPersons: number;
        doorWidth: number;
        material: string;
    };
    rules: {
        /** Minimum landing-door clear width (m) this type permits. */
        minDoorWidth: number;
        /** Minimum shaft inner dimension (m). */
        minShaftDim: number;
    };
}

export const BUILT_IN_LIFT_TYPES: LiftTypeDefinition[] = [
    {
        id: 'passenger-8',
        name: 'Passenger Lift (8-person)',
        kind: 'passenger',
        defaults: {
            shaftWidth: 1.8,
            shaftDepth: 1.8,
            carCapacityPersons: 8,
            doorWidth: 0.9,
            material: 'steel',
        },
        rules: { minDoorWidth: 0.8, minShaftDim: 1.4 },
    },
    {
        id: 'accessible',
        name: 'Accessible Lift (EN 81-70)',
        kind: 'accessible',
        defaults: {
            shaftWidth: 1.8,
            shaftDepth: 2.0,
            carCapacityPersons: 8,
            doorWidth: 1.0,
            material: 'steel',
        },
        rules: { minDoorWidth: 0.9, minShaftDim: 1.6 },
    },
    {
        id: 'goods',
        name: 'Goods / Service Lift',
        kind: 'goods',
        defaults: {
            shaftWidth: 2.0,
            shaftDepth: 2.4,
            carCapacityPersons: 13,
            doorWidth: 1.2,
            material: 'steel',
        },
        rules: { minDoorWidth: 1.1, minShaftDim: 1.8 },
    },
];
