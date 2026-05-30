// D2.3 — `validateKitchenTriangle` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.2).
//
// Checks the G10 kitchen "work triangle" — the canonical sink ↔ stove ↔
// fridge ergonomic rule from NKBA (National Kitchen & Bath Association):
//
//   • Each leg: 1.2 m ≤ d ≤ 2.7 m
//       Below 1.2 m the activities crowd each other (you trip on the
//       fridge door while at the sink). Above 2.7 m the workflow gets
//       wasteful (you walk too far between primary stations).
//   • Sum of legs: 3.6 m ≤ Σd ≤ 7.9 m (NKBA hard cap).
//       Below 3.6 m means the rule degenerates (everything is in the
//       same spot). Above 7.9 m means the kitchen is too spread out for
//       efficient work.
//   • No leg should be less than 1.2 m (HARD) or more than 2.7 m (SOFT).
//
// PURE function: takes three world-XZ positions, returns
// DimensionalValidation. The caller (D-FLE post-furnish or a
// kitchen-archetype validator) supplies the positions from the placed
// kitchen run / island.
//
// L2-pure: no THREE / DOM / RNG. Unit-tests in plain Node.

import type { DimensionalValidation, ValidationFinding } from './types.js';

export interface KitchenTriangleInput {
    readonly kitchenId: string;
    /** Sink position (world XZ, metres). */
    readonly sink: { readonly x: number; readonly z: number };
    /** Stove position. */
    readonly stove: { readonly x: number; readonly z: number };
    /** Fridge position. */
    readonly fridge: { readonly x: number; readonly z: number };
}

/** NKBA / HQI thresholds. Metres. */
export const KITCHEN_TRIANGLE = {
    LEG_MIN_HARD: 1.20,     // < this is unworkable (crowding)
    LEG_MIN_SOFT: 1.50,     // < this is tight
    LEG_MAX_SOFT: 2.40,     // > this is loose
    LEG_MAX_HARD: 2.70,     // > this is wasteful
    SUM_MIN_HARD: 3.60,
    SUM_MAX_SOFT: 6.60,     // recommended ceiling
    SUM_MAX_HARD: 7.90,     // NKBA absolute cap
} as const;

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
    Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Validate the kitchen work-triangle for a placed kitchen.
 *
 * HARD-REJECT on:
 *   • any leg below LEG_MIN_HARD (1.2 m) — crowding makes the kitchen
 *     unusable
 *   • any leg above LEG_MAX_HARD (2.7 m) — wasteful walks
 *   • sum below SUM_MIN_HARD (3.6 m) — degenerate
 *   • sum above SUM_MAX_HARD (7.9 m) — NKBA absolute cap
 *
 * SOFT penalties (gradient into `topologyQuality` axis):
 *   • any leg outside [LEG_MIN_SOFT, LEG_MAX_SOFT]
 *   • sum above SUM_MAX_SOFT
 */
export function validateKitchenTriangle(input: KitchenTriangleInput): DimensionalValidation {
    const { kitchenId, sink, stove, fridge } = input;
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];

    const legs = [
        { name: 'sink↔stove',  d: dist(sink, stove) },
        { name: 'stove↔fridge', d: dist(stove, fridge) },
        { name: 'fridge↔sink', d: dist(fridge, sink) },
    ];

    // Per-leg checks
    for (const leg of legs) {
        if (leg.d < KITCHEN_TRIANGLE.LEG_MIN_HARD - 1e-6) {
            hard.push({
                roomId: kitchenId, severity: 'hard', metric: `legMin:${leg.name}`, delta: 1.0,
                reason: `kitchen leg ${leg.name} is ${leg.d.toFixed(2)} m < hard min ${KITCHEN_TRIANGLE.LEG_MIN_HARD} m (workspace crowded — primary fixtures too close)`,
            });
        } else if (leg.d > KITCHEN_TRIANGLE.LEG_MAX_HARD + 1e-6) {
            hard.push({
                roomId: kitchenId, severity: 'hard', metric: `legMax:${leg.name}`, delta: 1.0,
                reason: `kitchen leg ${leg.name} is ${leg.d.toFixed(2)} m > hard max ${KITCHEN_TRIANGLE.LEG_MAX_HARD} m (workflow wastes time walking between primary fixtures)`,
            });
        }
    }

    if (hard.length === 0) {
        // Soft per-leg checks (only when no hard reject — otherwise the candidate is gone).
        for (const leg of legs) {
            if (leg.d < KITCHEN_TRIANGLE.LEG_MIN_SOFT) {
                const range = KITCHEN_TRIANGLE.LEG_MIN_SOFT - KITCHEN_TRIANGLE.LEG_MIN_HARD;
                const delta = Math.min(1, (KITCHEN_TRIANGLE.LEG_MIN_SOFT - leg.d) / range);
                soft.push({
                    roomId: kitchenId, severity: 'soft', metric: `legTight:${leg.name}`, delta,
                    reason: `kitchen leg ${leg.name} is tight (${leg.d.toFixed(2)} m, comfortable ≥ ${KITCHEN_TRIANGLE.LEG_MIN_SOFT} m)`,
                });
            } else if (leg.d > KITCHEN_TRIANGLE.LEG_MAX_SOFT) {
                const range = KITCHEN_TRIANGLE.LEG_MAX_HARD - KITCHEN_TRIANGLE.LEG_MAX_SOFT;
                const delta = Math.min(1, (leg.d - KITCHEN_TRIANGLE.LEG_MAX_SOFT) / range);
                soft.push({
                    roomId: kitchenId, severity: 'soft', metric: `legLoose:${leg.name}`, delta,
                    reason: `kitchen leg ${leg.name} is loose (${leg.d.toFixed(2)} m, comfortable ≤ ${KITCHEN_TRIANGLE.LEG_MAX_SOFT} m)`,
                });
            }
        }
    }

    // Sum-of-legs check
    const sum = legs.reduce((s, l) => s + l.d, 0);
    if (sum < KITCHEN_TRIANGLE.SUM_MIN_HARD - 1e-6) {
        hard.push({
            roomId: kitchenId, severity: 'hard', metric: 'sumMin', delta: 1.0,
            reason: `kitchen triangle sum is ${sum.toFixed(2)} m < hard min ${KITCHEN_TRIANGLE.SUM_MIN_HARD} m (degenerate triangle — fixtures collapsed onto one point)`,
        });
    } else if (sum > KITCHEN_TRIANGLE.SUM_MAX_HARD + 1e-6) {
        hard.push({
            roomId: kitchenId, severity: 'hard', metric: 'sumMax', delta: 1.0,
            reason: `kitchen triangle sum is ${sum.toFixed(2)} m > hard max ${KITCHEN_TRIANGLE.SUM_MAX_HARD} m (NKBA cap exceeded — kitchen too spread out)`,
        });
    } else if (sum > KITCHEN_TRIANGLE.SUM_MAX_SOFT) {
        const range = KITCHEN_TRIANGLE.SUM_MAX_HARD - KITCHEN_TRIANGLE.SUM_MAX_SOFT;
        const delta = Math.min(1, (sum - KITCHEN_TRIANGLE.SUM_MAX_SOFT) / range);
        soft.push({
            roomId: kitchenId, severity: 'soft', metric: 'sumLoose', delta,
            reason: `kitchen triangle sum is loose (${sum.toFixed(2)} m, comfortable ≤ ${KITCHEN_TRIANGLE.SUM_MAX_SOFT} m)`,
        });
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
