// Office furnish — OCCUPANCY-DRIVEN module mix (SPEC-OFFICE-GENERATION-ENGINE §8).
//
// SPEC §8: occupancy (estimated from usable floor area) drives EVERYTHING — desks · meeting rooms ·
// phone booths · kitchen size · collaboration/breakout areas · lockers. Nothing is a fixed layout.
// This module turns an occupancy count into a target MIX of §5 modules (counts), which the planner
// (furnishPlanner.ts) then PLACES respecting circulation clearances (§7). PURE + DETERMINISTIC.

import { estimateOccupancy } from './officeModuleLibrary.js';

/** The target module counts for one floor, scaled from occupancy (SPEC §8). */
export interface ModuleMix {
    /** Estimated occupants for the usable area (SPEC §8). */
    readonly occupancy: number;
    /** Target workstation desk count (open-plan bench/linear rows fill to this). */
    readonly desks: number;
    /** Enclosed meeting rooms. */
    readonly meetingRooms: number;
    /** Acoustic phone booths. */
    readonly phoneBooths: number;
    /** Executive (glazed) offices. */
    readonly executiveOffices: number;
    /** Collaborative corners (open-plan). */
    readonly collaborationBlocks: number;
    /** Informal, un-enclosed meeting nooks in the open plan (SPEC §5 informal meeting). */
    readonly meetingNooks: number;
    /** Breakout / lounge zones. */
    readonly breakoutBlocks: number;
    /** Kitchen blocks (a floor gets a kitchenette; ground gets a larger one). */
    readonly kitchenBlocks: number;
    /** Reception blocks — ground floor only (1 at the entrance), else 0. */
    readonly receptionBlocks: number;
    /** Biophilic + accessory decor clusters marking open-plan zone edges (SPEC §11). */
    readonly decorClusters: number;
}

/**
 * SPEC §8 — plan the module MIX for one floor from its usable area. Ratios follow workplace-planning
 * benchmarks (Gensler/BCO/Leesman): ~1 meeting room per ~15–20 desks, ~1 phone booth per ~12–15
 * people, ~1 collaboration setting per ~20, a breakout per ~40, an executive office per ~25. All
 * counts scale with occupancy — never fixed. `desksTargetOverride` lets the caller cap desks to the
 * plate's engine-computed desk budget (perf cap) while the amenity ratios still scale to occupancy.
 * PURE + deterministic.
 */
export function planModuleMix(
    usableAreaM2: number,
    opts?: { areaPerPersonM2?: number; desksTargetOverride?: number; isGroundFloor?: boolean },
): ModuleMix {
    const occupancy = estimateOccupancy(usableAreaM2, opts?.areaPerPersonM2 ?? 10);
    const desks = Math.max(
        0,
        opts?.desksTargetOverride != null ? Math.floor(opts.desksTargetOverride) : occupancy,
    );
    // Amenity provision scales to the number of PEOPLE the floor serves (not the capped desk count),
    // so a perf-capped desk grid still gets a realistic amenity count.
    const meetingRooms = occupancy > 0 ? Math.max(1, Math.round(occupancy / 18)) : 0;
    const phoneBooths = occupancy > 0 ? Math.max(1, Math.round(occupancy / 14)) : 0;
    const executiveOffices = occupancy >= 20 ? Math.max(1, Math.round(occupancy / 25)) : 0;
    const collaborationBlocks = occupancy > 0 ? Math.max(1, Math.round(occupancy / 20)) : 0;
    // Informal huddle nooks are lighter-touch than a full collaborative block — ~1 per 25 people.
    const meetingNooks = occupancy > 0 ? Math.max(1, Math.round(occupancy / 25)) : 0;
    const breakoutBlocks = occupancy >= 20 ? Math.max(1, Math.round(occupancy / 40)) : 0;
    // Every furnished floor gets one kitchenette; the ground gets the same (plus reception).
    const kitchenBlocks = occupancy > 0 ? 1 : 0;
    // Reception is a ground-floor-only arrival experience (one at the entrance).
    const receptionBlocks = opts?.isGroundFloor && occupancy > 0 ? 1 : 0;
    // Decor clusters mark open-plan zone boundaries; scale gently with the plate (~1 per 30 people).
    const decorClusters = occupancy > 0 ? Math.max(2, Math.round(occupancy / 30)) : 0;
    return {
        occupancy, desks, meetingRooms, phoneBooths, executiveOffices,
        collaborationBlocks, meetingNooks, breakoutBlocks, kitchenBlocks,
        receptionBlocks, decorClusters,
    };
}
