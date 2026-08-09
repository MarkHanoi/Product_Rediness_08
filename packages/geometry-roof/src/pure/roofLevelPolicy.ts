/**
 * @file packages/geometry-roof/src/pure/roofLevelPolicy.ts
 *
 * §ROOF-UPPER-LEVEL (founder ruling, 2026-08-09) — "when creating a roof it will
 * always belong to the upper level", where *upper level* means **the level
 * immediately above the one the roof was drawn on**, NOT the topmost level in
 * the project. Drawn while standing on L0 of a 6-storey project ⇒ the roof
 * belongs to L1.
 *
 * WHY A ROOF DECLARES ITS OWN POLICY (C11 §element creation):
 *   Every other element type is stamped with the level it was drawn on, and that
 *   is correct for them — a wall drawn on L0 IS an L0 wall. A roof is different:
 *   it is drawn on the storey below but geometrically occupies the plane that is
 *   the NEXT level's datum (RoofTool draws its footprint at
 *   `activeLevel.elevation + 3.0`, i.e. the top of the storey). The roof is
 *   therefore the only element whose *drawn-on* level and *belongs-to* level
 *   differ. This module is the roof's OWN declaration of that difference; it is
 *   deliberately NOT a fork of a shared level-resolution helper (there is none —
 *   every other site inlines `sort by elevation`).
 *
 * PURE — no I/O, no THREE, no DOM, no store access. Levels come in as data.
 *
 * ORDERING IS BY ELEVATION, NEVER BY ID OR ARRAY INDEX. Level ids in production
 * are not ordinal (`L0` and `L-05-1786262347381-5` both occur), so any id-derived
 * ordering is wrong by construction. Ties (two levels at the same elevation) are
 * broken by id so the result is deterministic for replay.
 */

/** The minimum a level must expose for this policy to order it. */
export interface RoofLevelRef {
    readonly id: string;
    readonly elevation: number;
}

/** Why the resolver returned the level it did — carried into command telemetry. */
export type RoofLevelResolutionReason =
    /** A level exists immediately above the drawn-on level; the roof was re-homed to it. */
    | 'upper-level'
    /** The drawn-on level is the topmost (includes the single-level project). Roof stays put. */
    | 'no-level-above'
    /** The drawn-on level is not in the level set at all — cannot order. Roof stays put. */
    | 'origin-unknown';

export interface RoofLevelResolution {
    /** The level the roof must be stamped with. */
    readonly levelId: string;
    /**
     * `targetLevel.elevation - originLevel.elevation` (0 when the roof stays put).
     *
     * The caller MUST subtract this from the roof's `baseOffset`, because roof
     * world-Y is `level.elevation + baseOffset` (RoofFragmentBuilder). Re-homing
     * the roof one level up without the compensation would raise the geometry by
     * the storey height — the roof would no longer be where the user drew it.
     * The ruling is about OWNERSHIP, not about moving the roof.
     */
    readonly elevationDelta: number;
    /** True only when the roof actually moved to a different level. */
    readonly reHomed: boolean;
    readonly reason: RoofLevelResolutionReason;
}

/**
 * Resolve the level a roof drawn on `originLevelId` belongs to.
 *
 * @param originLevelId The level that was active (3D) or being viewed (plan) when
 *                      the roof footprint was drawn.
 * @param levels        Every level in the project, in any order.
 */
export function resolveRoofLevel(
    originLevelId: string,
    levels: readonly RoofLevelRef[],
): RoofLevelResolution {
    const origin = levels.find(l => l.id === originLevelId);
    if (!origin || !Number.isFinite(origin.elevation)) {
        // Honest refusal to guess: without the origin's elevation there is no
        // "above" to compute. Keep the roof where it was drawn rather than
        // silently picking an arbitrary level.
        return {
            levelId: originLevelId,
            elevationDelta: 0,
            reHomed: false,
            reason: 'origin-unknown',
        };
    }

    // Strictly ABOVE: a level sharing the origin's elevation is not above it.
    const above = levels
        .filter(l => Number.isFinite(l.elevation) && l.elevation > origin.elevation)
        .sort((a, b) => (a.elevation - b.elevation) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const target = above[0];
    if (!target) {
        // Topmost level — includes the single-level project, where "the level
        // above" does not exist. The roof is created on the level it was drawn
        // on (unchanged, pre-ruling behaviour). Creating a level the user did
        // not ask for would be an invisible side effect; refusing would lose the
        // roof. Neither is acceptable, so: keep it, and say so (see `reason`).
        return {
            levelId: origin.id,
            elevationDelta: 0,
            reHomed: false,
            reason: 'no-level-above',
        };
    }

    return {
        levelId: target.id,
        elevationDelta: target.elevation - origin.elevation,
        reHomed: true,
        reason: 'upper-level',
    };
}
