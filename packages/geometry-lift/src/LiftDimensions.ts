// LiftDimensions — the ONE dimension-resolution chain for a lift compound system.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) · C104 §3.
//
// L-127 / the pool's `resolvePoolDimensions()` rule, applied to the lift: every
// dimensional field on the lift record is OPTIONAL, "unset" is a first-class state
// meaning *resolve me*, and the chain `record -> systemType -> documented default`
// lives in EXACTLY ONE place — this file. No builder, no symbol, no command and no
// mesh may read a lift dimension any other way, and none may carry a dimensional
// constant of its own.
//
// PURITY: no THREE, no DOM, no store, no I/O. Arithmetic and constants.

import { trace } from '@opentelemetry/api';
import type { LiftTypeDefinition } from './LiftTypeDefinitions.js';

const _tracer = trace.getTracer('@pryzm/geometry-lift', '0.1.0');

/**
 * The DOCUMENTED DEFAULTS — tier 3 of the chain, and the only dimensional literals
 * in the lift subsystem outside `BUILT_IN_LIFT_TYPES`.
 *
 * Each carries its source. These are not invented numbers: they are the standard
 * residential-lift proportions the built-in types already encode, expressed as the
 * fallbacks that apply when neither the record nor a system type supplies a value.
 */
export const LIFT_DIMENSION_DEFAULTS = Object.freeze({
    /** Shaft outer width (m). Matches the `passenger-6` built-in type. */
    shaftWidth: 1.5,
    /** Shaft outer depth (m). Matches the `passenger-6` built-in type. */
    shaftDepth: 1.6,
    /**
     * Shaft enclosure wall thickness (m). 0.2 m is the common cast/blockwork
     * residential shaft wall; it is also thick enough to host a landing door leaf
     * without the frame protruding, which is why the landing doors can be C15
     * openings on it.
     */
    shaftWallThickness: 0.2,
    /** Landing-door clear width (m). */
    doorWidth: 0.9,
    /** Landing-door clear height (m) — matches the `Door` schema's own default. */
    doorHeight: 2.1,
    /**
     * Car internal height (m). EN 81-20 requires >= 2.0 m clear inside the car;
     * 2.2 m is the common residential car and leaves room for the ceiling raft.
     */
    carHeight: 2.2,
    /**
     * Structural clearance between the car and the shaft's inner face, per side (m).
     * This is what makes the car SMALLER than the shaft, and it is why `carWidth` is
     * derived rather than stored — see `resolveLiftDimensions` below.
     */
    carClearance: 0.15,
    /** Car sling / structure member depth (m). */
    structureThickness: 0.08,
    /** Car wall lining panel thickness (m). */
    wallFinishThickness: 0.02,
    /** Car floor build-up thickness (m). */
    floorThickness: 0.05,
    /** Car ceiling raft thickness (m). */
    ceilingThickness: 0.08,
    /** Car door leaf thickness (m). */
    carDoorThickness: 0.04,
    /** Rated capacity (persons) when nothing else says. */
    carCapacityPersons: 6,
    /**
     * PIT depth (m) below the lowest served level — the space under the car for the
     * buffers. EN 81-20 requires one; a shaft modelled without it stops at the
     * lowest floor and the pit is silently missing from the excavation take-off.
     */
    pitDepth: 1.1,
    /**
     * OVERRUN / headroom (m) above the highest served level — the space above the
     * car at the top landing. Same argument as the pit: without it the shaft is
     * short by a storey-and-a-bit's worth of enclosure that must really be built.
     */
    overrunHeight: 3.4,
} as const);

/** Everything downstream needs, all resolved, no optionals left. */
export interface ResolvedLiftDimensions {
    readonly shaftWidth: number;
    readonly shaftDepth: number;
    readonly shaftWallThickness: number;
    readonly doorWidth: number;
    readonly doorHeight: number;
    readonly carWidth: number;
    readonly carDepth: number;
    readonly carHeight: number;
    readonly structureThickness: number;
    readonly wallFinishThickness: number;
    readonly floorThickness: number;
    readonly ceilingThickness: number;
    readonly carDoorThickness: number;
    readonly carCapacityPersons: number;
    readonly pitDepth: number;
    readonly overrunHeight: number;
}

/** The subset of a lift record this resolver reads. Tier 1 of the chain. */
export interface LiftDimensionInput {
    readonly shaftWidth?: number;
    readonly shaftDepth?: number;
    readonly doorWidth?: number;
    readonly doorHeight?: number;
    readonly carCapacityPersons?: number;
    readonly shaftWallThickness?: number;
    readonly pitDepth?: number;
    readonly overrunHeight?: number;
}

/**
 * Resolve every lift dimension: `record -> systemType -> documented default`.
 *
 * ⭐ `carWidth` / `carDepth` are DERIVED, never stored, and that is a deliberate
 * C103 §4 "derived-vs-stored" call recorded in C104 §4:
 *
 *     carWidth = shaftWidth - 2*(wallThickness + clearance)
 *
 * Storing the car size alongside the shaft size would let the two disagree — an
 * architect widens the shaft, the car stays small, and nothing complains because
 * both values are "valid". The single most common defect shape in this repo is two
 * numbers that must agree being stored twice. One is stored (the shaft, which is
 * what gets drawn and built), the other is computed, so they cannot drift.
 */
export function resolveLiftDimensions(
    record: LiftDimensionInput,
    systemType?: Pick<LiftTypeDefinition, 'defaults'>,
): ResolvedLiftDimensions {
    return _tracer.startActiveSpan('pryzm.lift.resolveDimensions', (span) => {
        try {
            const d = LIFT_DIMENSION_DEFAULTS;
            const t = systemType?.defaults;

            const shaftWidth = record.shaftWidth ?? t?.shaftWidth ?? d.shaftWidth;
            const shaftDepth = record.shaftDepth ?? t?.shaftDepth ?? d.shaftDepth;
            const shaftWallThickness = record.shaftWallThickness ?? d.shaftWallThickness;
            const doorWidth = record.doorWidth ?? t?.doorWidth ?? d.doorWidth;

            // Derived — see the docstring. Floored at a small positive so a
            // deliberately tiny shaft yields a degenerate-but-valid car rather than
            // a negative extent that would throw inside a Zod `.positive()`.
            const inset = 2 * (shaftWallThickness + d.carClearance);
            const carWidth = Math.max(0.1, shaftWidth - inset);
            const carDepth = Math.max(0.1, shaftDepth - inset);

            const out: ResolvedLiftDimensions = {
                shaftWidth,
                shaftDepth,
                shaftWallThickness,
                doorWidth,
                doorHeight: record.doorHeight ?? d.doorHeight,
                carWidth,
                carDepth,
                carHeight: d.carHeight,
                structureThickness: d.structureThickness,
                wallFinishThickness: d.wallFinishThickness,
                floorThickness: d.floorThickness,
                ceilingThickness: d.ceilingThickness,
                carDoorThickness: d.carDoorThickness,
                carCapacityPersons:
                    record.carCapacityPersons ?? t?.carCapacityPersons ?? d.carCapacityPersons,
                pitDepth: record.pitDepth ?? d.pitDepth,
                overrunHeight: record.overrunHeight ?? d.overrunHeight,
            };

            span.setAttribute('pryzm.lift.shaftWidth', out.shaftWidth);
            span.setAttribute('pryzm.lift.carWidth', out.carWidth);
            return out;
        } finally {
            span.end();
        }
    });
}
