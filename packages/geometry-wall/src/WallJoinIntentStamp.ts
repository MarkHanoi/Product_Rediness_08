/**
 * §WALL-JOIN-INTENT — the ONE place the creation gesture is read (L-251 → L-923 → L-927).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS ANSWERS, AND WHY NOTHING ELSE CAN.
 *
 * A MITRED CORNER AND A T-JUNCTION ARE THE SAME GEOMETRY. Two collinear walls meeting a
 * third at a node reads either as
 *
 *   (1) a THROUGH-WALL plus a STEM — one straight wall drawn in two segments, a third
 *       teeing into it. The collinear pair takes SQUARE CAPS (§PASS-THROUGH-FLUSH); or
 *   (2) a MITRED CORNER plus a BUTTING NEWCOMER — two walls already meet in a committed
 *       mitred L and a third arrives later, collinear with one arm. The corner is FROZEN
 *       and the newcomer adapts (ADR-0055 baseline immutability; the founder's invariant).
 *
 * L-923 proved these are not separable after the fact. They are the same three segments,
 * identical topology, identical types, differing ONLY in draw order — so no predicate over
 * geometry, `systemTypeId`, thickness or `createdAt` can tell them apart. (L-122 tried
 * `systemTypeId` and it collapses the moment the user draws everything with the DEFAULT
 * wall type, which is exactly what the founder does, and exactly why his mitre kept dying:
 * the corner's mitre normals went `0.707107,0.707107` → `null` the instant a same-type wall
 * joined it, producing the square-capped prism he keeps reporting.)
 *
 * The disambiguating fact is HISTORICAL: **at the moment this wall was created, did a
 * committed junction already exist at that endpoint?** That is knowable exactly once — at
 * creation — and never again. So it is captured here and thereafter CARRIED on the record,
 * never re-inferred. Re-inference is what made every previous attempt a heuristic.
 *
 * WHY THE RULE IS "≥ 2 EXISTING ENDPOINTS".
 * Two or more existing wall endpoints already meeting at a node IS a committed corner; a
 * wall arriving onto it is a newcomer and must adapt. EXACTLY ONE existing endpoint is
 * genuinely ambiguous — the author may be forming a corner OR continuing a run — so that
 * case is deliberately left `undefined`, and `undefined` means behaviour is EXACTLY as it
 * was before this field existed. That is what keeps every legacy wall and every
 * pre-existing test unaffected.
 */

import type { Point3D } from '@pryzm/core-app-model';
import type { WallJoinIntent } from './WallTypes';

/** The endpoint-coincidence radius: 20 mm. */
export const JOIN_INTENT_EPS_M = 0.02;

/** The minimum this function needs from a wall — deliberately narrow so it is trivially testable. */
export interface JoinIntentCandidate {
    id: string;
    levelId: string;
    baseLine: readonly [Point3D, Point3D] | Point3D[];
}

/**
 * Derive the join intent for `wall` against the walls that ALREADY EXIST on its level.
 *
 * @param existing  Walls already committed on this level. MUST NOT include `wall` itself;
 *                  the function also filters by id defensively.
 * @param wall      The wall being created, at its as-drawn baseline.
 * @returns         The intent, or `undefined` when neither endpoint lands on a committed
 *                  junction — meaning "unknown / legacy", i.e. pre-existing behaviour.
 */
export function deriveJoinIntent(
    existing: readonly JoinIntentCandidate[],
    wall: JoinIntentCandidate,
): WallJoinIntent | undefined {
    const levelWalls = existing.filter(w => w.levelId === wall.levelId && w.id !== wall.id);
    if (levelWalls.length === 0) return undefined;

    /** How many EXISTING wall endpoints already meet at this point. */
    const committedEndpointsAt = (p: Point3D): number => {
        let n = 0;
        for (const w of levelWalls) {
            for (const e of [w.baseLine[0], w.baseLine[1]]) {
                if (!e) continue;
                if (Math.hypot(e.x - p.x, e.z - p.z) <= JOIN_INTENT_EPS_M) n++;
            }
        }
        return n;
    };

    // ≥2 existing endpoints at the node ⇒ a corner was already committed there.
    const startIsOntoCommitted = committedEndpointsAt(wall.baseLine[0]) >= 2;
    const endIsOntoCommitted   = committedEndpointsAt(wall.baseLine[1]) >= 2;

    if (!startIsOntoCommitted && !endIsOntoCommitted) return undefined;

    return {
        ...(startIsOntoCommitted ? { start: 'butt' as const } : {}),
        ...(endIsOntoCommitted   ? { end:   'butt' as const } : {}),
    };
}
