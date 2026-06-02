// G9 — `validateRoomHierarchy` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.9).
//
// The "hierarchy" rule pack catches layouts that PASS every per-room shape
// check (G1-G6) but violate architectural hierarchy invariants — the kind
// of mistake an inexperienced layout engine makes where every individual
// room is fine but the relative sizes don't make sense:
//
//   • a 14 m² "master bedroom" next to a 16 m² "bedroom"
//   • a 22 m² "kitchen" next to a 14 m² "living"
//   • a 5 m² "bathroom" next to a 7 m² "ensuite"
//   • a corridor wider than any bedroom in the apartment
//
// All findings are SOFT (penalty into shapeQuality / hierarchy axis) —
// these are not catastrophic, just architecturally wrong. The downstream
// Pareto rank deprioritises candidates that accumulate hierarchy debt.
//
// L2-pure: no THREE / DOM / RNG. Reads only the room rect + type. Pairs
// with validateRoomShape (per-room G1-G6) + validateFrontage (G8).

import type { RoomType } from '../types.js';
import type { RoomShape } from './validateRoomShape.js';
import type {
    DimensionalValidation,
    ValidationFinding,
} from './types.js';

function rectArea(r: RoomShape['rect']): number {
    return (r.x1 - r.x0) * (r.z1 - r.z0);
}

interface RoomWithArea {
    readonly room: RoomShape;
    readonly area: number;
}

function indexByType(rooms: readonly RoomShape[]): Map<RoomType, RoomWithArea[]> {
    const out = new Map<RoomType, RoomWithArea[]>();
    for (const room of rooms) {
        const arr = out.get(room.type) ?? [];
        arr.push({ room, area: rectArea(room.rect) });
        out.set(room.type, arr);
    }
    return out;
}

function labelOf(r: RoomShape): string {
    return r.name ?? r.id;
}

/**
 * Soft penalty in [0, 1] proportional to how much A is below B.
 * Returns 0 when A ≥ B, 1 when A == 0.
 */
function shortfallPenalty(a: number, b: number): number {
    if (a >= b) return 0;
    if (b <= 0) return 0;
    return Math.min(1, (b - a) / b);
}

/**
 * Validate a set of rooms against the G9 hierarchy invariants. The input
 * is the FULL apartment's rooms (typically post-subdivide, pre-doors), so
 * the validator can compare master ↔ bedroom counts + bath ↔ ensuite etc.
 *
 * Returns an aggregated DimensionalValidation:
 *   - hard findings: empty (hierarchy violations are never catastrophic)
 *   - soft findings: one entry per violation, scaled by shortfall
 *
 * The penalty is consumed by the Pareto step in `dimensions/validate.ts`
 * (aggregate axis `hierarchyQuality`).
 */
export function validateRoomHierarchy(
    rooms: readonly RoomShape[],
): DimensionalValidation {
    const soft: ValidationFinding[] = [];
    const byType = indexByType(rooms);

    const masters = byType.get('master') ?? [];
    const bedrooms = byType.get('bedroom') ?? [];
    const livings = byType.get('living') ?? [];
    const kitchens = byType.get('kitchen') ?? [];
    const dinings = byType.get('dining') ?? [];
    const bathrooms = byType.get('bathroom') ?? [];
    const ensuites = byType.get('ensuite') ?? [];
    const wcs = byType.get('wc') ?? [];
    const corridors = byType.get('corridor') ?? [];

    // ── H1 master > bedroom ──────────────────────────────────────────────
    // The master bedroom MUST be at least as large as every secondary
    // bedroom. A "master" smaller than any regular bedroom is a labelling
    // failure — penalise per pair.
    if (masters.length > 0 && bedrooms.length > 0) {
        const smallestMaster = masters.reduce(
            (m, r) => (r.area < m.area ? r : m),
            masters[0]!,
        );
        for (const bed of bedrooms) {
            if (smallestMaster.area < bed.area - 1e-6) {
                soft.push({
                    roomId: smallestMaster.room.id,
                    severity: 'soft',
                    metric: 'masterSmallerThanBedroom',
                    delta: shortfallPenalty(smallestMaster.area, bed.area),
                    reason: `master ${labelOf(smallestMaster.room)} (${smallestMaster.area.toFixed(1)} m²) is smaller than ${labelOf(bed.room)} (${bed.area.toFixed(1)} m²) — the master should be the largest sleeping room`,
                });
            }
        }
    }

    // ── H2 living ≥ kitchen ──────────────────────────────────────────────
    // Even in open-plan layouts the LIVING zone is the social hub; a
    // kitchen that's larger than the living room is a programme inversion.
    if (livings.length > 0 && kitchens.length > 0) {
        const largestLiving = livings.reduce(
            (m, r) => (r.area > m.area ? r : m),
            livings[0]!,
        );
        for (const kitchen of kitchens) {
            if (kitchen.area > largestLiving.area + 1e-6) {
                soft.push({
                    roomId: kitchen.room.id,
                    severity: 'soft',
                    metric: 'kitchenLargerThanLiving',
                    delta: shortfallPenalty(largestLiving.area, kitchen.area),
                    reason: `kitchen ${labelOf(kitchen.room)} (${kitchen.area.toFixed(1)} m²) is larger than living ${labelOf(largestLiving.room)} (${largestLiving.area.toFixed(1)} m²) — the living room should dominate the social wing`,
                });
            }
        }
    }

    // ── H3 ensuite < bathroom (when both exist) ──────────────────────────
    // An en-suite serves ONE bedroom; the main bathroom serves the rest of
    // the household. The en-suite SHOULD be smaller (or at least not larger)
    // than the main bath, else the labels are swapped.
    if (ensuites.length > 0 && bathrooms.length > 0) {
        const largestBathroom = bathrooms.reduce(
            (m, r) => (r.area > m.area ? r : m),
            bathrooms[0]!,
        );
        for (const ensuite of ensuites) {
            if (ensuite.area > largestBathroom.area + 1e-6) {
                soft.push({
                    roomId: ensuite.room.id,
                    severity: 'soft',
                    metric: 'ensuiteLargerThanBathroom',
                    delta: shortfallPenalty(largestBathroom.area, ensuite.area),
                    reason: `ensuite ${labelOf(ensuite.room)} (${ensuite.area.toFixed(1)} m²) is larger than main bathroom ${labelOf(largestBathroom.room)} (${largestBathroom.area.toFixed(1)} m²) — the household bathroom serves more people and should be at least as large`,
                });
            }
        }
    }

    // ── H4 living (or merged living+kitchen+dining) is the LARGEST room ──
    // The dominant volume should be the social hub. We sum living + dining +
    // kitchen (the open-plan zone, even if subdivided) and check it exceeds
    // every other single room.
    const socialZoneArea =
        livings.reduce((s, r) => s + r.area, 0) +
        dinings.reduce((s, r) => s + r.area, 0) +
        kitchens.reduce((s, r) => s + r.area, 0);
    if (livings.length > 0) {
        const largestLiving = livings.reduce(
            (m, r) => (r.area > m.area ? r : m),
            livings[0]!,
        );
        // Compare the social zone to every non-social room.
        for (const room of rooms) {
            if (
                room.type === 'living' ||
                room.type === 'dining' ||
                room.type === 'kitchen'
            ) {
                continue;
            }
            const area = rectArea(room.rect);
            if (area > socialZoneArea + 1e-6) {
                soft.push({
                    roomId: room.id,
                    severity: 'soft',
                    metric: 'nonSocialDominates',
                    delta: shortfallPenalty(socialZoneArea, area),
                    reason: `${labelOf(room)} (${room.type}, ${area.toFixed(1)} m²) is larger than the entire social zone (living+dining+kitchen ${socialZoneArea.toFixed(1)} m²) — the social hub should dominate the apartment`,
                });
            }
        }
        // Suppress unused-var warning when socialZoneArea drives the loop above.
        void largestLiving;
    }

    // ── H5 corridor width never dominates ────────────────────────────────
    // A corridor wider than the smallest bedroom signals wasted circulation
    // space. Penalty grows with the overshoot.
    if (corridors.length > 0 && bedrooms.length > 0) {
        const smallestBedroom = bedrooms.reduce(
            (m, r) => (r.area < m.area ? r : m),
            bedrooms[0]!,
        );
        for (const corridor of corridors) {
            if (corridor.area > smallestBedroom.area + 1e-6) {
                soft.push({
                    roomId: corridor.room.id,
                    severity: 'soft',
                    metric: 'corridorLargerThanBedroom',
                    delta: shortfallPenalty(smallestBedroom.area, corridor.area),
                    reason: `corridor ${labelOf(corridor.room)} (${corridor.area.toFixed(1)} m²) is larger than bedroom ${labelOf(smallestBedroom.room)} (${smallestBedroom.area.toFixed(1)} m²) — circulation should never dominate habitable space`,
                });
            }
        }
    }

    // ── H6 wc smaller than bathroom (when both exist) ────────────────────
    // A separate WC is a single fixture (toilet + small basin); it MUST be
    // smaller than a full bathroom. WCs sized for a full bathroom suggest a
    // misclassification.
    if (wcs.length > 0 && bathrooms.length > 0) {
        const smallestBathroom = bathrooms.reduce(
            (m, r) => (r.area < m.area ? r : m),
            bathrooms[0]!,
        );
        for (const wc of wcs) {
            if (wc.area > smallestBathroom.area + 1e-6) {
                soft.push({
                    roomId: wc.room.id,
                    severity: 'soft',
                    metric: 'wcLargerThanBathroom',
                    delta: shortfallPenalty(smallestBathroom.area, wc.area),
                    reason: `wc ${labelOf(wc.room)} (${wc.area.toFixed(1)} m²) is larger than bathroom ${labelOf(smallestBathroom.room)} (${smallestBathroom.area.toFixed(1)} m²) — a separate wc is a single-fixture room and should be smaller`,
                });
            }
        }
    }

    return {
        admissible: true, // hierarchy never HARD-rejects
        hardFindings: [],
        softFindings: soft,
    };
}
