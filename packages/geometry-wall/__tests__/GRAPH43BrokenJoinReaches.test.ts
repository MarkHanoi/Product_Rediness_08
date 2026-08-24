/**
 * ⭐⭐ §GRAPH43-A-BROKEN-JOIN-IS-A-CONSEQUENCE (L-10801) — THE ONE
 *    NOT-APPLICABLE THAT IS A REAL LOSS MUST REACH THE SAME SINK A REFUSAL DOES.
 *
 * ── THE DEFECT, MEASURED IN THE FOUNDER'S 2026-08-24 SESSION ─────────────────
 *
 * Two sentences about ONE gesture, both true, published as though they were one
 * verdict:
 *
 *     §MOVE-REWELD-DISPATCH: … 0 junction(s) refused …
 *
 *     PRYZM AI: "that move creates 1 problem(s) in the model that were not there
 *     before"
 *
 * `refusals` and `topology findings` are **different sets**. No line carried
 * both, so a reader given only the first concludes the gesture was clean — and
 * that is the reading that stood while an 85.7 m² room was destroyed.
 *
 * ⭐ `5c3434dc` made the fact EXIST (`SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE` — a join
 * that was CLOSED before the move is OPEN after it). It did not make anyone SEE
 * it: `summariseNotApplicable` is console-only **and says so at its own
 * definition**, so a destroyed relationship was routed as a diagnostic. This file
 * pins the routing.
 *
 * ⚠ **IT IS STILL NOT A REFUSAL, AND THE §NOT-A-REFUSAL ARM BELOW IS A CONTROL,
 * NOT AN OVERSIGHT.** This engine has no arm that can act on a guest-side T
 * (C85 §10.7 W-M-13), so calling it a refusal would claim a decision that was
 * never taken. The disposition is gated on the founder ruling framed in
 * C85 §10.8.4; only the ROUTING is fixed here.
 *
 * ⛔ **AND ONLY THE BROKEN SET IS USER-FACING.** §QUIET below is the second
 * control: a gesture whose declared partners are all healthy must reach the sink
 * with NOTHING. Putting a routine non-event in front of the user buries the
 * refusals that matter — §L-921 inverted, which is exactly what
 * `L936ReweldEmitterHonesty` exists to prevent.
 *
 * Adopted from lane ROOM44 / C94's **P2.6**, which identified this emitter as
 * the reconciliation point between a `§OPENED-REGION` finding and a
 * `0 junction(s) refused` verdict, and correctly declined to edit a
 * `geometry-wall` file across the boundary.
 *
 * @file packages/geometry-wall/__tests__/GRAPH43BrokenJoinReaches.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

import { WallMoveReweldService } from '../src/WallMoveReweldService';
import type {
    ReweldWallStoreRef,
    ReweldJoinedWallsQuery,
    ReweldConsequenceReport,
} from '../src/WallMoveReweldService';
import type { WallData } from '../src/WallTypes';

const LEVEL = 'L0';
const THICK = 0.2;

type XZ = [number, number];

function wall(id: string, s: XZ, e: XZ): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: THICK, baseOffset: 0, openings: [],
    } as unknown as WallData;
}

class StoreDouble implements ReweldWallStoreRef {
    private readonly byId = new Map<string, WallData>();
    private readonly subs: Array<(e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void> = [];

    add(w: WallData): void { this.byId.set(w.id, w); }
    getById(id: string): WallData | undefined { return this.byId.get(id); }
    getByLevel(levelId: string): WallData[] {
        return [...this.byId.values()].filter(w => w.levelId === levelId);
    }
    subscribe(cb: (e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void): () => void {
        this.subs.push(cb);
        return () => { const i = this.subs.indexOf(cb); if (i >= 0) this.subs.splice(i, 1); };
    }
    /** Rigid translation, committed then announced — what `UpdateWallBaselineCommand` does. */
    translate(id: string, dx: number, dz: number): void {
        const prev = this.byId.get(id)!;
        const next = {
            ...prev,
            baseLine: prev.baseLine.map(p => ({ x: p.x + dx, y: p.y, z: p.z + dz })),
        } as unknown as WallData;
        this.byId.set(id, next);
        for (const cb of this.subs) cb('update', next, prev);
    }
}

/**
 * ── THE FIXTURE, and it is an ordinary plan ──────────────────────────────────
 *
 *   `spur`  — an east–west wall, (0,3)→(2,3). **THE MOVER.** Its EAST end sits
 *             exactly on `rail`'s body: a T in which the SUBJECT is the guest.
 *   `rail`  — a north–south partition at x=2, z=1→5. The T's HOST.
 *   `keep`  — a north–south partition at x=0, z=1→9. Hosts the spur's WEST end,
 *             and the northward drag keeps that T closed. **The control.**
 *
 * Drag the spur 2.6 m north. Its east end lands at (2,5.6) — **600 mm past
 * `rail`'s north end (2,5)**. The join to `rail` was real, was closed to 0 mm,
 * and is now open. The join to `keep` is untouched.
 */
function makeHarness(opts?: { healthyOnly?: boolean }) {
    const store = new StoreDouble();
    store.add(wall('spur', [0, 3], [2, 3]));
    store.add(wall('rail', [2, 1], [2, 5]));
    store.add(wall('keep', [-2, 3], [9, 3]));

    const edges: Record<string, string[]> = opts?.healthyOnly === true
        ? { spur: ['keep'] }
        : { spur: ['rail', 'keep'] };
    const getJoinedWalls = (wallId: string): ReweldJoinedWallsQuery =>
        edges[wallId]
            ? { ok: true, wallId, joinedWallIds: edges[wallId]! }
            : { ok: false, wallId, reason: 'wall-unknown-to-joinedTo-writer' };

    const logs: string[] = [];
    const warns: string[] = [];
    const reports: ReweldConsequenceReport[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });

    const service = new WallMoveReweldService(store, {
        commandManagerRef: {
            current: { getContext: () => ({}), execute: () => undefined },
        },
        makeCascadeCommand: () => ({ execute: () => undefined }) as never,
        getJoinedWalls,
        onConsequence: (r: ReweldConsequenceReport) => { reports.push(r); },
    } as never);

    return {
        store, service, logs, warns, reports,
        /**
         * The per-gesture VERDICT line, whichever of the two branches emitted it.
         * ⭐ An empty plan is the NORMAL outcome when every declared partner is
         * guest-side, so the founder's room-destroying gesture ends on
         * `§MOVE-REWELD-EMPTY-PLAN`, not on `§MOVE-REWELD-DISPATCH`. **Both must
         * carry the count** — patching only the dispatch line would have left the
         * one branch that matters exactly as silent as it was.
         */
        verdictLine: () => [...logs, ...warns].find(
            l => l.includes('§MOVE-REWELD-DISPATCH') || l.includes('§MOVE-REWELD-EMPTY-PLAN')) ?? '',
        restore() { service.dispose(); logSpy.mockRestore(); warnSpy.mockRestore(); },
    };
}

describe('§GRAPH43 §REACHES — a destroyed join reaches the user sink', () => {
    /**
     * ⭐⭐ FAILS ON `bd45650d`: the broken join existed as a reason code and went
     * nowhere. `reports` was empty, and the only trace was a console token inside
     * the not-applicable census.
     */
    it('§REACHES: the broken join is reported, by name, with its partner', () => {
        const h = makeHarness();
        try {
            h.store.translate('spur', 3.2, 0);

            const broken = h.reports.filter(r => r.reason === 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
            expect(broken).toHaveLength(1);
            expect(broken[0]!.movedWallId).toBe('spur');
            expect(broken[0]!.partnerIds).toEqual(['rail']);
            // The sentence must carry the measured gap, not merely the code.
            expect(broken[0]!.detail.join(' ')).toContain('1200');
        } finally { h.restore(); }
    });

    /**
     * §L-936-EMITTER-HONESTY — audible EVEN WITH NO SINK, because
     * `engineLauncher.ts` composes this service without `onConsequence`. A
     * finding computed with both its numbers and then reaching nobody is §L-921
     * verbatim, one stage earlier.
     */
    it('§AUDIBLE: it warns to the console too, naming the wall and the gap', () => {
        const h = makeHarness();
        try {
            h.store.translate('spur', 3.2, 0);
            const w = h.warns.find(x => x.includes('§MOVE-REWELD-JOIN-BROKEN')) ?? '';
            expect(w).toContain('spur');
            expect(w).toContain('rail');
            expect(w).toContain('1200');
        } finally { h.restore(); }
    });

    /**
     * ⭐ THE RECONCILIATION LINE — ROOM44's P2.6. `refusals` and broken joins are
     * different sets and the verdict line must carry BOTH, so a reader cannot
     * take `0 junction(s) refused` as "the gesture was clean".
     *
     * FAILS ON `bd45650d`: the line carried only the refusal count.
     */
    it('§BOTH-COUNTS: the verdict line says a join was BROKEN, and stops claiming otherwise', () => {
        const h = makeHarness();
        try {
            h.store.translate('spur', 3.2, 0);
            const line = h.verdictLine();
            expect(line).toContain('§MOVE-REWELD-EMPTY-PLAN');
            // ⭐ FAILS ON `bd45650d`, and this is the sharpest arm in the file:
            //   that line ended `"Every junction this move touched was left
            //   exactly as it was."` — TRUE of the partners' geometry, FALSE of
            //   the relationships, and printed as reassurance on the one branch
            //   where a join had just been destroyed.
            expect(line).not.toContain('Every junction this move touched was left exactly as it was');
            expect(line).toContain('NOT every junction was left as it was');
            expect(line).toContain('rail');
            expect(line).toContain('1200');
        } finally { h.restore(); }
    });

    /**
     * ⛔ THE CONTROL THAT KEEPS THIS HONEST. A gesture whose declared partners are
     * all healthy must reach the user sink with NOTHING. Reporting the whole
     * not-applicable census would bury the refusals that matter — §L-921
     * inverted, the failure `L936ReweldEmitterHonesty` pins.
     */
    it('§QUIET: a gesture that breaks nothing reports nothing to the user', () => {
        const h = makeHarness({ healthyOnly: true });
        try {
            h.store.translate('spur', 3.2, 0);
            expect(h.reports.filter(r => r.reason === 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE'))
                .toHaveLength(0);
            // The reassuring sentence is KEPT verbatim where it is TRUE.
            expect(h.verdictLine())
                .toContain('Every junction this move touched was left exactly as it was');
        } finally { h.restore(); }
    });

    /**
     * ⛔⛔ §GRAPH43-THE-WALL-SIDE-DOES-NOT-DESCRIBE-ROOMS (L-10802) — THE WALL
     *    LAYER MUST NOT PREDICT A ROOM CONSEQUENCE IT NEVER MEASURED.
     *
     * FAILS ON `1bf3a790` — a commit from THIS LANE, one hour old. Two of its
     * sentences ended *"Expect a room to open downstream."* **That is a
     * prediction stated in the voice of a measurement**, and it can simply be
     * wrong: a broken junction whose region was already open, or whose partition
     * bounded no loop, opens no room at all. §CONTEXT-DATA-HONESTY verbatim.
     *
     * ⭐ The room vocabulary exists and belongs to lane ROOM44 / C94 §TOBE.5 —
     * `§ROOM-LOSS-CENSUS`, which fires where rooms actually die and reports the
     * **authored-vs-auto split alongside every count**, because *"deleted 3
     * rooms"* and *"deleted 3 auto-numbered, never-touched rooms"* argue for
     * opposite answers.
     *
     * ⚠ ROOM44 measured why a SECOND implementation is worse than none: its own
     * first attempt read authorship off `Object.keys(room.finishes).length > 0`
     * and **every untouched room came back AUTHORED**, because `RoomStore` writes
     * all three finish surfaces explicitly. All 23 of its unit arms passed —
     * the fixtures shared the wrong assumption.
     *
     * ⛔ And the LAYER is not what forbids it: `@pryzm/command-registry` is
     * already a declared dependency of this package with live imports. **One
     * fact, one authority** is the reason.
     */
    it('§NO-ROOM-VOCABULARY: the wall lines report the WALL fact and cite the room census', () => {
        const h = makeHarness();
        try {
            h.store.translate('spur', 3.2, 0);
            const said = [h.verdictLine(), ...h.warns, ...h.reports.flatMap(r => r.detail)].join(' | ');

            // ⛔ No prediction, in any of the three surfaces.
            expect(said).not.toContain('Expect a room');
            expect(said).not.toMatch(/room .{0,20}(will|would|is likely|expect)/i);
            // ⛔ And no room MEASUREMENT either — no count, no area, no name.
            expect(said).not.toMatch(/\d+\s*m²/);
            expect(said).not.toMatch(/Room\s+\d/);

            // ✅ The WALL fact is present, with its millimetres.
            expect(said).toContain('rail');
            expect(said).toContain('1200');
            // ✅ And the room question is handed to its owner by name.
            expect(said).toContain('ROOM-LOSS-CENSUS');
        } finally { h.restore(); }
    });

    /**
     * ⚠ THE DISPOSITION IS UNCHANGED, AND THIS ARM IS THE PROOF. A broken join is
     * NOT promoted to a refusal: the engine has no arm that can act on a
     * guest-side T, so a refusal would claim a decision nobody took. Acting on it
     * is C85 §10.7 W-M-13, gated on the founder ruling in §10.8.4.
     */
    it('§NOT-A-REFUSAL: the count of refusals is still zero, and nothing moved', () => {
        const h = makeHarness();
        try {
            h.store.translate('spur', 3.2, 0);
            expect(h.verdictLine()).toContain('0 re-weld entries and 0 refusals');
            expect(h.reports.filter(r => r.reason.startsWith('INCUMBENT')))
                .toHaveLength(0);
            // `rail` is where it always was — no repair was attempted.
            expect(h.store.getById('rail')!.baseLine[1]!.z).toBe(5);
        } finally { h.restore(); }
    });
});
