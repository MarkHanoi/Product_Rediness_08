/**
 * ⭐⭐ §GRAPH43-EXTEND-THE-HOST (L-10803) — RUNG 1 OF THE C85 §10.7 REPAIR LADDER,
 *    REACHED AT LAST. THE FOUNDER'S HEADLINE COMPLAINT, CLOSED.
 *
 * > *"one interior partition adapted … but the other did not … we probably lost
 * > a room … **I was expecting the wall to extend** … we need a sound
 * > relationship graph and consciousness in all elements — and an architect
 * > human would have seen this — why not the algorithm?"*
 *
 * ── WHY IT NEVER EXTENDED, AND WHY THE FIX IS SMALL ─────────────────────────
 *
 * The EXTEND capability has existed and been correct for months
 * (`computeStemFollow`). It never ran for a **guest-side T** — the subject's own
 * endpoint on a partner's body — because the partner was **binned as
 * not-applicable before `classifyWeldAuthorship` was ever reached**
 * (L-10800 AS-IS #16). ⭐ **The missing capability was an ORDERING, not a
 * geometry primitive.**
 *
 * ── ⛔ THE ONE REPAIR THIS ENGINE MAY MAKE, AND THE ONE IT MAY NOT ───────────
 *
 * The host may **GROW ALONG ITS OWN LINE**. It may **NOT** be slid sideways to
 * chase the subject — that is a TRANSLATION of a wall the user did not touch,
 * it is C83 §10.2.2, and it is **L-922's exact signature**: an interior move
 * dragged a perimeter baseline 2.19 m and re-seated three hosted doors, one
 * clamped 0.541 → 0.000 m. §NO-SLIDE below is the control that keeps the two
 * apart, and it is the most important arm in this file.
 *
 * ── THE GUARDS, AND THE ONE THAT TURNED OUT TO BE UNNECESSARY ───────────────
 *
 * `DEGENERATE_STUB_LENGTH` and the far-endpoint-untouched invariant are
 * pre-existing and unchanged; §FAR-END-FIXED pins the second.
 *
 * ⭐ `MAX_FOLLOW_GAIN = 3` (§10.7 W-M-1) is carried here too — but writing a
 * fixture that TRIPS it revealed that **none exists**. `foot` is an orthogonal
 * projection, a projection is a contraction, and therefore **the grow can never
 * exceed the user's own drag**. §BOUNDED-BY-CONSTRUCTION proves that across a
 * 6-angle × 3-drag sweep and is a stronger property than the guard it replaces.
 * The guard is retained as a backstop and is **currently unreachable**.
 *
 * ⚠ **Authorised by founder ruling (2026-08-24): the declared relationship is
 * INTENT and is to be restored.** Made materially safer by L-10800, which
 * refuted the "the record might be stale" hazard this was gated on: a
 * `1002/500 mm` reading is fully compatible with a join closed to **0 mm**, so
 * this arm is not restoring a relationship that might be garbage — it is
 * repairing one that was **measurably intact until this gesture**.
 *
 * @file packages/geometry-wall/__tests__/GRAPH43HostExtension.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    computeMoveReweldCensus,
    type MoveReweldMovedWall,
    type MoveReweldPartner,
    type ReweldBaseline,
} from '../src/WallMoveReweld';

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

const T = 0.2;
const WELD_TOL = 0.5;

/**
 * THE FIXTURE — the founder's gesture, and it is an ordinary plan.
 *
 *   `spur` — an east–west wall (0,3)→(2,3). **THE MOVER.** Its EAST end sits
 *            exactly on `rail`'s body: a T in which the SUBJECT is the guest.
 *   `rail` — a north–south partition at x=2, running z=1→5. The T's HOST.
 *
 * Drag the spur **2.6 m north**. Its east end lands at (2, 5.6) — **600 mm past
 * `rail`'s north end (2,5)**, and still exactly on `rail`'s own LINE (x=2).
 * The join was real, was closed to 0 mm, and is now open by 600 mm.
 *
 * ⭐ The repair: grow `rail` from z=5 to z=5.6. **600 mm, along its own axis,
 * far end untouched.**
 */
const movedPast: MoveReweldMovedWall = {
    id: 'spur',
    prevBaseLine: bl([0, 3], [2, 3]),
    newBaseLine: bl([0, 5.6], [2, 5.6]),
    thickness: T,
};
const rail: MoveReweldPartner = { id: 'rail', baseLine: bl([2, 1], [2, 5]), declared: true };

const entryFor = (c: ReturnType<typeof computeMoveReweldCensus>, id: string) =>
    c.entries.find(e => e.wallId === id);

describe('§GRAPH43 §EXTEND — the host grows to keep the T', () => {
    /**
     * ⭐⭐ FAILS ON `8e3699ff`: the partner was binned
     * `SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE` and NO entry existed. The founder's
     * *"I was expecting the wall to extend"*, measured in millimetres.
     */
    it('§EXTEND: rail grows exactly 600 mm and the join closes to 0 mm', () => {
        const census = computeMoveReweldCensus(movedPast, [rail], { weldTol: WELD_TOL });

        const e = entryFor(census, 'rail');
        expect(e).toBeDefined();
        expect(e!.role).toBe('host-extension');

        // The moved end: rail's north end z=5 → z=5.6. EXACTLY the gap, in mm.
        const grownZ = e!.newBaseLine[1]!.z;
        expect(Math.round((grownZ - 5) * 1000)).toBe(600);
        expect(Math.round(grownZ * 1000)).toBe(5600);
        // …and it is on the subject's new endpoint, so the T is CLOSED to 0 mm.
        expect(Math.round(Math.hypot(e!.newBaseLine[1]!.x - 2, grownZ - 5.6) * 1000)).toBe(0);

        // The partner is no longer reported as an unrepaired loss.
        expect(census.notApplicable.map(n => n.reason))
            .not.toContain('SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        expect(census.refusals).toHaveLength(0);
    });

    /**
     * ⭐⭐ §SAME-ROOT — THE FOUNDER'S **SECOND** SYMPTOM IS THIS SAME DEFECT SEEN
     *    FROM THE SUBJECT'S SIDE, AND THIS ARM IS THE MEASUREMENT THAT PROVES IT.
     *
     * > *"a wall moved along - but **one adjacent wall did not follow correctly**
     * > and **the wall that moved did not adapt to the new shape driven by the
     * > angle**"* (2026-08-24, on `0589a36c`, i.e. before any of this landed)
     *
     * Those read as two defects. **They are one.** `JunctionResolverV2`'s
     * endpoint-cluster and T-projection band is `JUNCTION_BAND_FLOOR_M = 0.20 m`,
     * and its own header states the consequence of falling outside it verbatim:
     *
     * > *"those drifted corner endpoints fell into SEPARATE single-endpoint
     * > clusters → **no junction → BOTH walls got a square cap** → the corner
     * > opened."*
     *
     * So a guest-side T that this engine leaves open by 600 mm is **3× outside
     * the band**. The junction ceases to exist for the resolver, and therefore:
     *   • the PARTNER never follows  ← symptom 1
     *   • the SUBJECT gets a square cap instead of an end condition cut for the
     *     new angle  ← symptom 2, *"did not adapt to the new shape driven by the
     *     angle"*
     *
     * ⭐ `§GRAPH43-EXTEND-THE-HOST` closes the gap to **0 mm**, which is back
     * inside the band — so the resolver sees the junction again and BOTH end
     * conditions recompute. **One root, one fix.**
     *
     * ⚠ SCOPE, STATED HONESTLY: this asserts the gap either side of the repair
     * against the resolver's published band. It does **not** execute
     * `resolveJunctions`, so *"the mitre is now cut at the new angle"* is
     * INFERRED FROM THE BAND, not measured end-to-end here. That end-to-end
     * proof belongs in the junction-resolver suite and is NOT MEASURED.
     */
    it('§SAME-ROOT: the break is 3× outside the 0.20 m junction band; the repair is inside it', () => {
        /** `JunctionResolverV2.JUNCTION_BAND_FLOOR_M`, in mm. Not imported — it is
         *  not exported — so it is restated with its source, per C73 §2.2. */
        const JUNCTION_BAND_MM = 200;

        // BEFORE the repair: the subject's endpoint (2, 5.6) against rail's body,
        // which ends at (2, 5).
        const gapBeforeMm = Math.round(Math.hypot(2 - 2, 5.6 - 5) * 1000);
        expect(gapBeforeMm).toBe(600);
        expect(gapBeforeMm).toBeGreaterThan(JUNCTION_BAND_MM);   // ⛔ no junction ⇒ square cap

        // AFTER: the host grew to the foot, so the endpoint is ON its body.
        const e = entryFor(computeMoveReweldCensus(movedPast, [rail], { weldTol: WELD_TOL }), 'rail')!;
        const gapAfterMm = Math.round(
            Math.hypot(e.newBaseLine[1]!.x - 2, e.newBaseLine[1]!.z - 5.6) * 1000);
        expect(gapAfterMm).toBe(0);
        expect(gapAfterMm).toBeLessThan(JUNCTION_BAND_MM);       // ✅ junction exists again
    });

    /**
     * ⛔⛔ §NO-SLIDE — THE MOST IMPORTANT ARM IN THIS FILE, AND THE ONE THAT KEEPS
     *    THIS FIX FROM BECOMING L-922.
     *
     * Same T, same break, but the subject moves **PERPENDICULAR to the host's
     * line** instead of along it. `rail`'s own line no longer passes under the
     * subject's endpoint, so **no amount of growing can restore this join** —
     * and the only thing that could is sliding `rail` sideways, i.e. translating
     * a wall the user did not touch.
     *
     * ⭐ **The engine must REPORT the loss and MOVE NOTHING.** A repair that
     * "succeeds" here is the 2.19 m perimeter drag that re-seated three doors.
     */
    it('§NO-SLIDE: a break the host cannot GROW into is reported, and nothing moves', () => {
        // Spur drags EAST — off the end of its own axis, away from rail's line.
        const sideways: MoveReweldMovedWall = {
            id: 'spur',
            prevBaseLine: bl([0, 3], [2, 3]),
            newBaseLine: bl([3.2, 3], [5.2, 3]),
            thickness: T,
        };
        const census = computeMoveReweldCensus(sideways, [rail], { weldTol: WELD_TOL });

        // ⛔ NOTHING MOVED.
        expect(entryFor(census, 'rail')).toBeUndefined();
        // …and the loss is NAMED, with the gap it opened.
        const na = census.notApplicable.find(n => n.partnerId === 'rail');
        expect(na!.reason).toBe('SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        expect(na!.measuredMm).toBe(1200);   // 3.2 m − 2.0 m, in mm
        expect(na!.limitMm).toBe(500);
    });

    /**
     * ⭐⭐ §BOUNDED-BY-CONSTRUCTION — THE SAFETY PROPERTY THE FOUNDER'S RULING WAS
     *    GATED ON, AND IT IS STRONGER THAN THE GUARD THAT WAS ASKED FOR.
     *
     * The brief required `MAX_FOLLOW_GAIN` (3×) on this arm, and the first
     * version of this file tried to write a fixture that TRIPS it. **No such
     * fixture exists**, and finding that out is the point of this test.
     *
     * `foot` is the ORTHOGONAL PROJECTION of the subject's endpoint onto the
     * partner's line, and **a projection is a contraction**: the foot travels
     * `|v|·cosθ ≤ |v|`, where `v` is that endpoint's own displacement, itself
     * ≤ `movedDisplacement` by definition. The old foot lay ON the body, so the
     * grow is `newFootAxial − partnerLen ≤ the foot's travel`. Therefore
     * **extension ≤ the user's own drag — a gain of ≤1×, never 3×.**
     *
     * ⭐ That matters far more than the guard: the corner arm needed a 3× cap
     * because `1/sinθ` let a 2 m drag move an untouched wall **14.14 m**
     * (§10.7 AS-IS #1). **This arm cannot over-extend at all.**
     *
     * ⚠ The `HOST_EXTENSION_GAIN_EXCEEDED` guard is retained as a backstop
     * against a future change to how `foot` is derived, and is **currently
     * unreachable**. No test here claims to exercise it — one that appeared to
     * would be measuring something else.
     */
    it('§BOUNDED-BY-CONSTRUCTION: the grow never exceeds the drag, at any angle', () => {
        const rows: Array<{ angleDeg: number; dragMm: number; extMm: number }> = [];

        for (const angleDeg of [0, 10, 30, 45, 60, 80]) {
            for (const dragM of [0.6, 1.5, 3.0]) {
                const th = (angleDeg * Math.PI) / 180;
                // A partner running at `angleDeg` off the z-axis, ending at the origin.
                const railStart: [number, number] = [-4 * Math.sin(th), -4 * Math.cos(th)];
                const railEnd: [number, number] = [0, 0];
                // The subject terminates on its BODY, 1 m in from that end…
                const foot: [number, number] = [-Math.sin(th), -Math.cos(th)];
                // …and is dragged ALONG the partner's own direction by `dragM`.
                const prev = bl([foot[0] - 2, foot[1]], [foot[0], foot[1]]);
                const next = bl(
                    [foot[0] - 2 + dragM * Math.sin(th), foot[1] + dragM * Math.cos(th)],
                    [foot[0] + dragM * Math.sin(th), foot[1] + dragM * Math.cos(th)],
                );

                const census = computeMoveReweldCensus(
                    { id: 'spur', prevBaseLine: prev, newBaseLine: next, thickness: T },
                    [{ id: 'R', baseLine: bl(railStart, railEnd), declared: true }],
                    { weldTol: WELD_TOL },
                );
                const e = entryFor(census, 'R');
                if (!e) continue;   // welded, intact, or already-followed — not this arm

                const extM = Math.max(
                    Math.hypot(e.newBaseLine[0]!.x - e.prevBaseLine[0]!.x,
                               e.newBaseLine[0]!.z - e.prevBaseLine[0]!.z),
                    Math.hypot(e.newBaseLine[1]!.x - e.prevBaseLine[1]!.x,
                               e.newBaseLine[1]!.z - e.prevBaseLine[1]!.z),
                );
                rows.push({ angleDeg, dragMm: Math.round(dragM * 1000), extMm: Math.round(extM * 1000) });
            }
        }

        // The sweep must actually reach this arm, or it proves nothing.
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) {
            // ⭐ THE INVARIANT, in millimetres: the grow never exceeds the drag.
            expect(r.extMm).toBeLessThanOrEqual(r.dragMm);
            // …and it is comfortably inside the 3× cap it is nominally bounded by.
            expect(r.extMm).toBeLessThanOrEqual(3 * r.dragMm + 500);
        }
        // Measured: every reaching row grows exactly 2000 mm off a 3000 mm drag.
        expect(rows.every(r => r.extMm === 2000 && r.dragMm === 3000)).toBe(true);
    });

    /**
     * §FAR-END-FIXED — the invariant that makes this a GROW and not a drag, and
     * the one C83 §10.6.2 condition 4 requires. The untouched endpoint must be
     * **byte-identical**, `y` included: this engine has no opinion about
     * elevation.
     */
    it('§FAR-END-FIXED: the far endpoint is untouched and the wall only lengthens', () => {
        const census = computeMoveReweldCensus(movedPast, [rail], { weldTol: WELD_TOL });
        const e = entryFor(census, 'rail')!;

        expect(e.newBaseLine[0]).toEqual(e.prevBaseLine[0]);   // (2,1) verbatim
        const before = Math.hypot(
            e.prevBaseLine[1]!.x - e.prevBaseLine[0]!.x, e.prevBaseLine[1]!.z - e.prevBaseLine[0]!.z);
        const after = Math.hypot(
            e.newBaseLine[1]!.x - e.newBaseLine[0]!.x, e.newBaseLine[1]!.z - e.newBaseLine[0]!.z);
        expect(Math.round(before * 1000)).toBe(4000);
        expect(Math.round(after * 1000)).toBe(4600);
        expect(after).toBeGreaterThan(before);   // a GROW, never a shrink
    });

    /**
     * ⚠ THE START-END TWIN. The arm picks which end grows from the sign of
     * `axial`, and a fix that only ever grows `baseLine[1]` would silently do
     * nothing — or worse, the wrong thing — for half of all real geometry.
     */
    it('§EITHER-END: the START endpoint grows when the foot falls before it', () => {
        // rail runs NORTH→SOUTH this time, so its baseLine[0] is the north end.
        const flipped: MoveReweldPartner =
            { id: 'rail', baseLine: bl([2, 5], [2, 1]), declared: true };
        const census = computeMoveReweldCensus(movedPast, [flipped], { weldTol: WELD_TOL });
        const e = entryFor(census, 'rail')!;

        expect(e.role).toBe('host-extension');
        expect(Math.round(e.newBaseLine[0]!.z * 1000)).toBe(5600);   // start grew
        expect(e.newBaseLine[1]).toEqual(e.prevBaseLine[1]);         // far end fixed
    });

    /**
     * ⛔ THE GATE IS THE DECLARED GRAPH, and the level-scan arm is untouched. A
     * proximity-offered wall must never be grown on the strength of a scan.
     */
    it('§DECLARED-ONLY: an UNDECLARED partner is never extended', () => {
        const undeclared: MoveReweldPartner = { id: 'rail', baseLine: bl([2, 1], [2, 5]) };
        const census = computeMoveReweldCensus(movedPast, [undeclared], { weldTol: WELD_TOL });
        expect(entryFor(census, 'rail')).toBeUndefined();
        expect(census.notApplicable.find(n => n.partnerId === 'rail')!.reason)
            .toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
    });

    /**
     * ⛔ AND A GHOST IS STILL A GHOST. A declared edge with no join in either
     * direction at either pose is the one reading that may honestly mean *stale
     * record* — it must not acquire an extend arm.
     */
    it('§NO-GHOST-EXTEND: an unsupported declared edge is never extended', () => {
        const ghost: MoveReweldPartner =
            { id: 'GHOST', baseLine: bl([20, 6], [20, 12]), declared: true };
        const census = computeMoveReweldCensus(movedPast, [ghost], { weldTol: WELD_TOL });
        expect(entryFor(census, 'GHOST')).toBeUndefined();
        expect(census.notApplicable.find(n => n.partnerId === 'GHOST')!.reason)
            .toBe('DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE');
    });

    /**
     * §PARTITION — the §L-945 control. A new entry path must not let a partner
     * escape the census or land in two buckets.
     */
    it('§PARTITION holds with the new arm in play', () => {
        const ghost: MoveReweldPartner =
            { id: 'GHOST', baseLine: bl([20, 6], [20, 12]), declared: true };
        const keep: MoveReweldPartner =
            { id: 'keep', baseLine: bl([0, 1], [0, 9]), declared: true };
        const census = computeMoveReweldCensus(movedPast, [rail, keep, ghost], { weldTol: WELD_TOL });
        const all = [
            ...census.entries.map(e => e.wallId).filter(id => id !== 'spur'),
            ...census.refusals.map(r => r.partnerId),
            ...census.notApplicable.map(n => n.partnerId),
        ];
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort()).toEqual(['GHOST', 'keep', 'rail']);
    });
});
