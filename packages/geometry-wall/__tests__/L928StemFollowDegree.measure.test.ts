/**
 * §MEASURED-STEM-DEGREE (L-928 mechanism 2) — how far must a stem-follow PROPAGATE?
 *
 * L-928 opened with a candidate mechanism, explicitly flagged "MEASURE do not assume":
 *
 *   "If L-926's restored stem-follow only re-seats partners returned by the moved wall's OWN
 *    `joinedTo` set, a partition chained through ANOTHER partition is not in that set and never
 *    follows — the follow would need to be transitive across the interior chain."
 *
 * The partner set IS strictly first-degree. `WallMoveReweldService.onWallUpdated` makes exactly
 * one `getJoinedWalls(wall.id)` call, with no queue and no visited-set, and the service is
 * non-reentrant by construction (`propagating` / `isCascadeApplying`), so a stem re-seated by the
 * plan cannot pull its own dependents. Second-degree follow is structurally impossible today.
 *
 * ─── SO IS THAT THE FOUNDER'S DEFECT? MEASURED: NO — AND THE REASON IS A GEOMETRIC INVARIANT ──
 *
 * `computeStemFollow` step 3 intersects the stem's OWN line with the host's re-offset seat line,
 * and its own comment states the consequence precisely:
 *
 *     "`welded`/`far` span exactly the stem's stored line, so the direction is preserved by
 *      construction — this is an extend/shrink, never a rotation and never a lateral slide"
 *
 * A dependent stem therefore SLIDES ALONG ITS OWN SUPPORTING LINE. That line is INVARIANT under
 * the follow — only the stem's extent changes. Anything seated on that stem's BODY is seated on
 * the line, so it is still seated afterwards. **Transitive propagation is not required, and a
 * transitive closure would drag walls that provably did not need to move.** Case 1 measures this.
 *
 * ─── THE ONE REAL SECOND-DEGREE DISTURBANCE, AND WHY IT IS NOT A "FOLLOW" ────────────────────
 *
 * The invariant bounds the exception exactly: a third wall is disturbed only if the follow
 * SHRINKS the dependent PAST that wall's seat, so the seat is no longer over any body. Case 2
 * constructs it. That is not a case for propagating the follow — the third wall's own line is
 * unchanged and re-seating it would be a lateral slide (§CLAMP-COSHARE-WELD: sliding a shared
 * baseline doubled walls), while extending the dependent back out to reach it would move a wall
 * the user did not touch, which is exactly what C83 §10.2 forbids. The contract-correct outcome
 * is a DECLARED REFUSAL (C83 §10.3), not a silent drag. Case 2 pins today's behaviour so the
 * choice is on the record rather than rediscovered.
 *
 * NOTHING IS FIXED IN THIS FILE. It is the measurement L-928 task 1 asks for, and its verdict is
 * that mechanism 2 is NOT the founder's defect — mechanism 1 (the equality refusal, measured in
 * `WallTJoinEqualityBoundary.measure.test.ts`) is.
 *
 * @file packages/geometry-wall/__tests__/L928StemFollowDegree.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { computeMoveReweldPlan, type ReweldBaseline } from '../src/WallMoveReweld';

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

const T_WALL = 0.2;

type Pt = { x: number; z: number };

/**
 * A seat measured as the TWO INDEPENDENT questions it actually is:
 *   • `perpM`     — distance from `p` to the wall's INFINITE supporting line. This is the one
 *                   the line-invariance argument is about: it stays 0 iff the line did not move.
 *   • `overhangM` — how far the foot falls OFF either END of the span (0 when strictly on it).
 * Collapsing them into one point-to-SEGMENT distance would hide exactly the distinction under
 * test: case 2's wall is still perfectly on the line and is orphaned purely by the span shrinking.
 */
function seatOf(p: Pt, a: Pt, b: Pt): { perpM: number; overhangM: number } {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1e-12;
    const L = Math.sqrt(l2);
    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
    return {
        perpM: Math.abs((p.x - a.x) * (-dz / L) + (p.z - a.z) * (dx / L)),
        overhangM: Math.max(0, -t, t - 1) * L,
    };
}

const mm = (m: number) => Math.round(m * 1000);

// ── Case 1 — a lateral move: the second-degree wall does NOT need to follow ──────────────────
//
//   P  (0,4)→(12,4)   the SUBJECT, moved 0.773 m south (the founder's number and direction)
//   T  (6,4)→(6,8)    FIRST-degree: terminates on P's body
//   U  (6,6)→(10,6)   SECOND-degree: terminates on T's body, 2 m up T from T's own foot
describe('§MEASURED-STEM-DEGREE — case 1: lateral move, second-degree wall stays seated', () => {
    const P = { id: 'P', prevBaseLine: bl([0, 4], [12, 4]), newBaseLine: bl([0, 3.227], [12, 3.227]), thickness: T_WALL };
    const T = { id: 'T', baseLine: bl([6, 4], [6, 8]) };
    const U = { id: 'U', baseLine: bl([6, 6], [10, 6]) };

    it('re-seats the first-degree stem, ignores the second-degree wall, and that is CORRECT', () => {
        const plan = computeMoveReweldPlan(P, [T, U]);

        const tEntry = plan.entries.find(e => e.wallId === 'T');
        const uEntry = plan.entries.find(e => e.wallId === 'U');

        // FIRST-degree T follows, stamped as a dependent (C83 §10 authorship).
        expect(tEntry).toBeDefined();
        expect(tEntry!.role).toBe('dependent-stem');
        expect(mm(tEntry!.newBaseLine[0].z)).toBe(3227);   // foot followed P: 4000 → 3227 mm
        expect(mm(tEntry!.newBaseLine[1].z)).toBe(8000);   // far end UNTOUCHED

        // SECOND-degree U is not a partner and gets no entry — it is not in P's joinedTo set.
        expect(uEntry).toBeUndefined();

        // …and it did not need one. T's supporting LINE is invariant (x = 6 before and after),
        // so U's seat on T's body is still a seat: zero perpendicular error, zero overhang.
        const tNewA = { x: tEntry!.newBaseLine[0].x, z: tEntry!.newBaseLine[0].z };
        const tNewB = { x: tEntry!.newBaseLine[1].x, z: tEntry!.newBaseLine[1].z };
        const seat = seatOf({ x: 6, z: 6 }, tNewA, tNewB);

        expect(mm(seat.perpM)).toBe(0);
        expect(mm(seat.overhangM)).toBe(0);
    });
});

// ── Case 2 — the ONE second-degree disturbance the invariant permits ─────────────────────────
//
// Same chain, but U is seated LOW on T (z = 3.5, only 0.5 m above T's foot) and P moves NORTH,
// so T's foot RETREATS past U's seat and U is left over open air.
describe('§MEASURED-STEM-DEGREE — case 2: the follow SHRINKS the dependent past a third seat', () => {
    const P = { id: 'P', prevBaseLine: bl([0, 4], [12, 4]), newBaseLine: bl([0, 4.773], [12, 4.773]), thickness: T_WALL };
    const T = { id: 'T', baseLine: bl([6, 4], [6, 8]) };
    const U = { id: 'U', baseLine: bl([6, 3.5], [10, 3.5]) };

    it('pins that the third wall is orphaned, and that no entry and no refusal names it', () => {
        const plan = computeMoveReweldPlan(P, [T, U]);

        const tEntry = plan.entries.find(e => e.wallId === 'T');
        expect(tEntry).toBeDefined();
        expect(mm(tEntry!.newBaseLine[0].z)).toBe(4773);   // T's foot retreated NORTH, past U

        const tNewA = { x: tEntry!.newBaseLine[0].x, z: tEntry!.newBaseLine[0].z };
        const tNewB = { x: tEntry!.newBaseLine[1].x, z: tEntry!.newBaseLine[1].z };
        const seat = seatOf({ x: 6, z: 3.5 }, tNewA, tNewB);

        // U's seat is now 1273 mm off the end of T's span — a REAL orphan, second-degree.
        expect(mm(seat.perpM)).toBe(0);
        expect(mm(seat.overhangM)).toBe(1273);

        // TODAY: U gets neither an entry nor a named refusal. Recorded as the open residue —
        // the contract-correct answer is a declared refusal (C83 §10.3), NOT a transitive drag,
        // because U's own line is unchanged and re-seating it would be a lateral slide.
        expect(plan.entries.find(e => e.wallId === 'U')).toBeUndefined();
        expect(plan.refusals.find(r => r.partnerId === 'U')).toBeUndefined();
    });
});
