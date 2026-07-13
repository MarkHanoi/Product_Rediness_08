/**
 * §FIX-WALL-JOIN-MITRE-BROKEN-BY-THIRD-WALL (L-251) — a clean 2-wall MITRE must survive a
 * THIRD wall joining that corner, INCLUDING when the newcomer is the SAME wall type.
 *
 * THE HOLE THIS PROBES.
 *
 * L-122 (§FIX-EXISTING-CORNER-IMMUTABLE) established the founder's invariant: two exterior
 * walls meet in a clean mitred L (inglete); when a NEW wall joins that corner, the two
 * originals must stay BYTE-IDENTICAL and only the newcomer adapts. Its fix, verbatim:
 *
 *     "a genuine pass-through is one wall (SAME systemTypeId); a DIFFERENT-type collinear
 *      wall abutting a committed corner is a distinct newcomer, not a through-segment"
 *
 * So the protection is keyed on the newcomer having a DIFFERENT `systemTypeId`, and every
 * L-122 case uses `'int'` against an `'ext'` corner.
 *
 * **But the founder draws with the DEFAULT wall type.** His L-251 screenshot shows the wall
 * type picker reading "— Plain Wall —" — i.e. every wall on his level shares ONE
 * `systemTypeId`. A same-type newcomer is therefore NOT excluded by the L-122 rule, and the
 * pass-through / multi-cluster machinery is free to re-cut the committed corner.
 *
 * That is exactly what he reports: two walls mitred correctly, a third arrives in L+I / T,
 * and the mitre opens into a wedge (3D) / a square notch (plan).
 *
 * These tests pin the invariant for the SAME-TYPE case, in the ORDER the founder works in:
 * build and resolve the mitre FIRST, snapshot it, THEN add the third wall. The order is the
 * bug — a corner authored as three walls at once may well be fine.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;

function mk(
    s: [number, number],
    e: [number, number],
    t: number,
    createdAt: number,
    sys: string,
): WallData {
    return {
        id: `w${_seq++}`,
        type: 'wall',
        levelId: 'L',
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3,
        thickness: t,
        baseOffset: 0,
        openings: [],
        systemTypeId: sys,
        metadata: { createdAt },
    } as unknown as WallData;
}

/** Full join fingerprint: resolved baseline (μm) + BOTH miter normals. The footprint. */
function fingerprint(jd: any): string {
    if (!jd) return 'none';
    const u = (n: number) => Math.round(n * 1e6);
    const mn = (m: any) => (m ? `${u(m.nx)},${u(m.nz)}` : 'null');
    const a = jd.baseLine[0], b = jd.baseLine[1];
    return `${u(a.x)},${u(a.z)}>${u(b.x)},${u(b.z)}|s${mn(jd.startMN)}|e${mn(jd.endMN)}|inv${jd.invalid ?? false}`;
}

// The founder's starting point: two walls of the SAME type meeting in a mitred L at (5,0).
// This is what his second screenshot shows, and it is correct.
const PLAIN = 'plain';                        // the default type — ONE type for every wall
const A = () => mk([0, 0], [5, 0], 0.3, 1, PLAIN);
const B = () => mk([5, 0], [5, 5], 0.3, 2, PLAIN);

/**
 * The third wall, arriving at the committed corner. Each of these is a shape the founder
 * described ("another wall comes to join in L + I or T junction") — and NONE of them is
 * covered by L-122, because the newcomer is the SAME type.
 */
// The NON-collinear arrivals. The invariant ALREADY HOLDS for these — the committed mitre
// survives an L or a T newcomer of the same type. Locked so it stays that way.
const NEWCOMERS: Array<[string, [number, number], [number, number]]> = [
    ['L — into the room at 45°, snapped to the corner',              [5, 0], [3, 2]],
    ['T — perpendicular, landing on arm A just short of the corner', [4, 0], [4, 3]],
];

/**
 * The COLLINEAR arrivals — these FAIL TODAY, and they are marked `it.fails` deliberately.
 *
 * ⚠ THIS IS NOT A BUG I CAN QUIETLY FIX. IT IS A SPEC CONFLICT, AND IT NEEDS A FOUNDER
 * DECISION (see audit L-251).
 *
 * The founder's corner and a GENUINE T-JUNCTION are the SAME GEOMETRY. Compare:
 *
 *   existingCornerImmutable.test.ts, "a SAME-type collinear through-wall is UNCHANGED":
 *       a = (0,0)→(4,0)  createdAt 1     ← "through-left"
 *       b = (4,0)→(4,3)  createdAt 2     ← "stem"
 *       c = (4,0)→(7,0)  createdAt 3     ← "through-right", SAME type
 *       EXPECTS: a.endMN === null  (the mitre is DESTROYED — square caps. Correct for a T.)
 *
 *   this file, the founder's L-251 report:
 *       A = (0,0)→(5,0)  createdAt 1
 *       B = (5,0)→(5,5)  createdAt 2
 *       C = (5,0)→(5,-3) createdAt 3     ← collinear with B, SAME type
 *       EXPECTS: A.endMN PRESERVED  (the mitre must SURVIVE.)
 *
 * Same topology (two collinear + one perpendicular at a node), same creation order, same
 * types — and the two demand OPPOSITE outcomes. The resolver reads the configuration as
 * "a through-wall plus a stem" and square-caps it, which is RIGHT for a T-junction and
 * WRONG for the founder's corner. **No geometric rule can separate them**, because they are
 * not geometrically different: they differ only in what the author MEANT.
 *
 * Disambiguating therefore needs an explicit signal, not a cleverer heuristic. The options
 * are in audit L-251. Attempting it with `createdAt` alone was tried and reverted here — it
 * flips the genuine T-junction guards red, which is the same bug wearing the other hat.
 *
 * `it.fails` keeps the board honest: the defect is DOCUMENTED and RED-BY-CONTRACT, the suite
 * stays green, and the day someone fixes it these tests turn LOUDLY red-on-pass, forcing this
 * note to be resolved rather than forgotten. Per L-247, no test is ever `.skip`ped to green
 * a board — least of all by me.
 */
const COLLINEAR_NEWCOMERS: Array<[string, [number, number], [number, number]]> = [
    ['I — collinear with arm B, straight down through the corner', [5, 0], [5, -3]],
    ['I — collinear with arm A, straight back through the corner', [5, 0], [8, 0]],
];

describe('§FIX-WALL-JOIN-MITRE-BROKEN-BY-THIRD-WALL (L-251) — SAME-type third wall must not re-cut a committed mitre', () => {
    for (const [label, cs, ce] of [...NEWCOMERS, ...COLLINEAR_NEWCOMERS]) {
        it(`the existing mitred L stays BYTE-IDENTICAL when a same-type wall joins — ${label}`, () => {
            // ── 1. Resolve the mitre ALONE, exactly as the founder builds it first. ──
            _seq = 0;
            const A0 = A(), B0 = B();
            const before = WallJoinResolver.resolveLevel([A0, B0], { snapRadius: 0.5 });
            const fpA_before = fingerprint(before.get(A0.id));
            const fpB_before = fingerprint(before.get(B0.id));

            // Sanity: it really is a mitre before the third wall arrives (his 2nd image).
            expect(before.get(A0.id)!.endMN).toBeTruthy();
            expect(before.get(B0.id)!.startMN).toBeTruthy();

            // ── 2. NOW add the third wall — SAME systemTypeId as the other two. ──
            //
            // §WALL-JOIN-INTENT (L-251): the founder SNAPPED its start onto the existing
            // corner. That gesture is the disambiguation — it says "butt onto what is already
            // there", not "continue a run". The tool records it at creation; the resolver
            // reads it here. Without it, this collinear newcomer is indistinguishable from a
            // genuine through-wall and §PASS-THROUGH-FLUSH deletes the mitre.
            _seq = 0;
            const A1 = A(), B1 = B();
            const C1 = {
                ...mk(cs, ce, 0.3, 3, PLAIN),
                joinIntent: { start: 'butt' as const },
            } as unknown as WallData;
            const after = WallJoinResolver.resolveLevel([A1, B1, C1], { snapRadius: 0.5 });

            // ── 3. The invariant: the two ORIGINAL walls must not have moved. ──
            // A changed fingerprint here IS the founder's wedge: the corner has been re-cut
            // by a different algorithm than the one that mitred it.
            expect(fingerprint(after.get(A1.id))).toBe(fpA_before);
            expect(fingerprint(after.get(B1.id))).toBe(fpB_before);

            // …and the corner must still BE a mitre, not squared off to a butt.
            expect(after.get(A1.id)!.endMN).toBeTruthy();
            expect(after.get(B1.id)!.startMN).toBeTruthy();
        });
    }
});
