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
    // ═══════════════════════════════════════════════════════════════════════════
    // §FEAT-LIFT-COMPOUND-SYSTEM (L-5701) — THE 6-PERSON DEFAULT, AND WHY IT IS AN
    // ADDITION RATHER THAN AN EDIT.
    // ═══════════════════════════════════════════════════════════════════════════
    // The founder asked for a "default of standard lift for 6 people". The type
    // that existed was `passenger-8`, at 8 persons. Both are real standard cars, so
    // this is a genuine conflict of two correct facts, not a bug — and it was
    // resolved by ADDING, deliberately, for three measured reasons:
    //
    //  1. ⛔ `passenger-8` AND `accessible` CARRY A STANDARDS CITATION. The header
    //     of this file cites EN 81-70 for the accessible car's 1.1 x 1.4 m clear
    //     dimensions, and those are REGULATORY: an accessible lift that is not
    //     1.1 x 1.4 m is not an accessible lift. Silently rewriting a
    //     standards-cited definition to satisfy a default preference would be the
    //     worst possible way to honour the request.
    //  2. `passenger-8` IS LOAD-BEARING ELSEWHERE. `LiftToolPlacement.ts` pins
    //     `DEFAULT_TYPE_ID = 'passenger-8'` and the residential-building generator
    //     drives that same path. Changing the value under it would silently resize
    //     every lift in every generated multi-family building.
    //  3. A 6-PERSON CAR IS ITSELF STANDARD — 450 kg / 6 persons, ~1.0 x 1.25 m
    //     car, the common European residential size (EN 81-20/-50 duty range). It
    //     earns a row; it does not need to displace one.
    //
    // So: `passenger-6` is NEW, it is the default of the NEW LOD-300 compound
    // (`plugins/lift`), and the legacy massing path keeps `passenger-8` untouched.
    // Recorded in C104 §6.
    {
        id: 'passenger-6',
        name: 'Passenger Lift (6-person)',
        kind: 'passenger',
        defaults: {
            // Car ~1.0 x 1.25 m; +0.2 m shaft wall and 0.15 m clearance per side
            // gives the 1.5 x 1.6 m shaft `LIFT_DIMENSION_DEFAULTS` documents.
            shaftWidth: 1.5,
            shaftDepth: 1.6,
            carCapacityPersons: 6,
            doorWidth: 0.8,
            material: 'steel',
        },
        rules: { minDoorWidth: 0.7, minShaftDim: 1.3 },
    },
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
