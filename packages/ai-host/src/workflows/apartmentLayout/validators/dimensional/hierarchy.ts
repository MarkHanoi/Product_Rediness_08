// G-8 — Spatial hierarchy validator.
//
// Apartment-LEVEL relational rule
// (`docs/archive/pryzm3-internal/APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29.md`
// §G-8). Encodes the residential hierarchy: public > private, cooking-space
// ≥ smallest sleeping space.
//
//   1. The apartment's LARGEST social room (living_room / dining_room /
//      family_room) MUST be LARGER than its LARGEST private room
//      (bedroom / master_bedroom). The day-occupied "gathering" space
//      anchors the plan; if the master suite is bigger than the living
//      room the hierarchy is inverted and the plan reads as a hotel
//      rather than a home.
//
//   2. The kitchen MUST be at least as large as the SMALLEST private
//      room. A kitchen smaller than the smallest bedroom is a galley
//      that cannot support the cooking-as-social activity the floor
//      programme presumes.
//
// Up to TWO violations per apartment. SKIPPED when no social OR no
// private room exists (single-room studio / pure-circulation envelope /
// degenerate input).
//
// G-8 does NOT live in `limits.ts` — it's a relational rule across
// rooms, not a per-type threshold.
//
// PURE: no I/O, no closures over mutable state, no DOM, no THREE.

import type { DimensionalViolation } from './types.js';

/** One room as the validator sees it. POJO on purpose — no Zod, no class. */
export interface HierarchyRoom {
    readonly id: string;
    readonly type: string;
    readonly areaM2: number;
}

/** Type-families used by G-8. Strings match `limits.ts` + apartment-layout vocabulary. */
const SOCIAL_TYPES: ReadonlySet<string> = new Set([
    'living_room',
    'living',
    'dining_room',
    'dining',
    'family_room',
]);

const PRIVATE_TYPES: ReadonlySet<string> = new Set([
    'bedroom',
    'master_bedroom',
    'master',
]);

const KITCHEN_TYPES: ReadonlySet<string> = new Set([
    'kitchen',
]);

/**
 * Validate spatial hierarchy across the apartment as a whole.
 *
 * Up to TWO violations per apartment:
 *   (a) social-too-small: the largest social room is smaller than the
 *       largest private room. Attributed to the offending social room
 *       (so the modal can surface "make the living room bigger").
 *   (b) kitchen-too-small: the kitchen is smaller than the smallest
 *       private room. Attributed to the kitchen.
 *
 * Returns `[]` when the apartment has no social room OR no private room
 * (cannot judge hierarchy). When multiple kitchens exist (unusual but
 * possible) the LARGEST kitchen is used for rule (b).
 *
 * Ordering: rule (a) comes before rule (b) for stable output.
 */
export function validateHierarchy(
    rooms: ReadonlyArray<HierarchyRoom>,
): DimensionalViolation[] {
    const social  = rooms.filter((r) => SOCIAL_TYPES.has(r.type));
    const priv    = rooms.filter((r) => PRIVATE_TYPES.has(r.type));
    const kitchens = rooms.filter((r) => KITCHEN_TYPES.has(r.type));

    if (social.length === 0 || priv.length === 0) return [];   // cannot judge hierarchy

    const out: DimensionalViolation[] = [];

    // (a) largest social MUST exceed largest private (strict).
    const largestSocial  = social.reduce((a, b) => (a.areaM2 >= b.areaM2 ? a : b));
    const largestPrivate = priv.reduce((a, b) => (a.areaM2 >= b.areaM2 ? a : b));
    if (!(largestSocial.areaM2 > largestPrivate.areaM2)) {
        out.push({
            classId: 'G-8',
            roomId: largestSocial.id,
            roomType: largestSocial.type,
            severity: 'error',
            observed: largestSocial.areaM2,
            maximum: largestPrivate.areaM2,
            message:
                `G-8 hierarchy: largest social room ${largestSocial.type} '${largestSocial.id}' ` +
                `is ${largestSocial.areaM2.toFixed(2)} m², ` +
                `not larger than largest private room ${largestPrivate.type} '${largestPrivate.id}' ` +
                `at ${largestPrivate.areaM2.toFixed(2)} m² ` +
                `(public > private hierarchy inverted).`,
        });
    }

    // (b) kitchen MUST be at least as large as smallest private room (inclusive).
    if (kitchens.length > 0) {
        const largestKitchen  = kitchens.reduce((a, b) => (a.areaM2 >= b.areaM2 ? a : b));
        const smallestPrivate = priv.reduce((a, b) => (a.areaM2 <= b.areaM2 ? a : b));
        if (largestKitchen.areaM2 < smallestPrivate.areaM2) {
            out.push({
                classId: 'G-8',
                roomId: largestKitchen.id,
                roomType: largestKitchen.type,
                severity: 'error',
                observed: largestKitchen.areaM2,
                maximum: smallestPrivate.areaM2,
                message:
                    `G-8 hierarchy: kitchen '${largestKitchen.id}' ` +
                    `is ${largestKitchen.areaM2.toFixed(2)} m², ` +
                    `smaller than smallest private room ${smallestPrivate.type} '${smallestPrivate.id}' ` +
                    `at ${smallestPrivate.areaM2.toFixed(2)} m² ` +
                    `(kitchen ≥ smallest sleeping space rule).`,
            });
        }
    }

    return out;
}
