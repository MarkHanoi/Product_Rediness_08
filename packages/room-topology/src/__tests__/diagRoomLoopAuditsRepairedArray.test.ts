// @vitest-environment happy-dom
//
// §DIAG-AUDITS-THE-REPAIRED-ARRAY (L-1390) + §DIAG-RUNS-UP-TO / §REFUSE-SAME-PARENT-DIAG
// (L-1391) + §DIAG-RESCUE-SATISFIABILITY (L-1392).
//
// ⭐ THE DEFECT, IN ONE SENTENCE: `_diagRoomLoop` was handed `combinedInput` — the RAW
// segment list, captured BEFORE `_snapNearbyCorners` / `_reconnectDanglingEnds` /
// `_splitAtBodyCrossings` / `_splitAtTJunctions` run — so its "loop will NOT close
// (flood/merge risk)" warnings described geometry that the engine had ALREADY REPAIRED
// and that `buildWallGraph` never saw.
//
// The founder's 7-level model printed `detectedRooms=24 … unresolvedLoopBreaks=30` on
// every level. Both halves of that line came from the same call: 24 is the count of rooms
// the REPAIRED array produced, 30 is a count of complaints about the UNREPAIRED one. The
// line contradicted itself, and the contradiction sent an investigation at the generator.
//
// ⛔ THESE TESTS MUST NOT ASSERT ON THE PROSE. A test that pins the sentence
// "auditedArray=post-repair(...)" proves only that a string is present — the exact defect
// 5a4e3588 was reverted for. Each test below asserts a GEOMETRIC fact that is FALSE under
// the old wiring and TRUE under the new one.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { RoomDetectionEngine } from '../RoomDetectionEngine';
import type { WallData, WallStore } from '@pryzm/geometry-wall';

const LEVEL = 'L1';

let seq = 0;
function wall(id: string, s: [number, number], e: [number, number], thickness: number): WallData {
    return {
        id, type: 'wall',
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 2.7, thickness, baseOffset: 0, levelId: LEVEL,
        childrenIds: [], openings: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function engineFor(walls: WallData[]): RoomDetectionEngine {
    const stub = {
        getByLevel: (levelId: string) => (levelId === LEVEL ? walls : []),
    } as unknown as WallStore;
    return new RoomDetectionEngine(stub);
}

/**
 * A 10 x 6 THIN-shell rectangle (100 mm walls, so `hostSnap` is the 200 mm floor)
 * split by an interior partition at x = 5 whose two endpoints stop `inset` metres
 * SHORT of the shell centrelines.
 *
 * With `inset = 0.30` the raw geometry has two endpoints 300 mm off a host body —
 * above the 200 mm floor, so `_diagRoomLoop` reports them as unresolved loop breaks
 * WHEN IT READS THE RAW ARRAY. `_reconnectDanglingEnds` then moves both onto the host
 * (dangling, collinear, gap < REACH_MAX 1.25 m) and `_splitAtTJunctions` welds them,
 * so the REPAIRED array has no such endpoint at all — which is why the same run
 * detects the two rooms it is supposed to.
 */
function splitShell(inset: number): WallData[] {
    const t = 0.1;
    const w: WallData[] = [
        wall(`shell-bottom-${seq}`, [0, 0], [10, 0], t),
        wall(`shell-right-${seq}`, [10, 0], [10, 6], t),
        wall(`shell-top-${seq}`, [10, 6], [0, 6], t),
        wall(`shell-left-${seq}`, [0, 6], [0, 0], t),
        wall(`partition-${seq}`, [5, inset], [5, 6 - inset], t),
    ];
    seq++;
    return w;
}

function capture<T>(fn: () => T): { value: T; logs: string[]; warns: string[] } {
    const logs: string[] = [];
    const warns: string[] = [];
    const sl = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const sw = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });
    vi.spyOn(console, 'debug').mockImplementation(() => { /* quiet */ });
    try {
        return { value: fn(), logs, warns };
    } finally {
        sl.mockRestore(); sw.mockRestore(); vi.restoreAllMocks();
    }
}

function summaryOf(logs: string[]): string {
    const line = logs.find(l => l.includes('§DIAG-ROOM-LOOP') && l.includes('detectedRooms='));
    expect(line, 'the audit must still print exactly one summary line').toBeTruthy();
    return line!;
}

function breakCount(summary: string): number {
    const m = /unresolvedLoopBreaks=(\d+)/.exec(summary);
    expect(m, 'the summary must still carry a break COUNT — silence is not the fix').toBeTruthy();
    return Number(m![1]);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('§DIAG-AUDITS-THE-REPAIRED-ARRAY (L-1390)', () => {
    it('⭐ a partition the repair passes DO reconnect reports ZERO unresolved loop breaks', () => {
        // 300 mm short of both hosts: above the 200 mm snap floor in the RAW array
        // (→ 2 BREAK measurements under the old wiring), fully repaired before
        // buildWallGraph (→ 0 under the new one).
        const { value: rooms, logs } = capture(() =>
            engineFor(splitShell(0.30)).detectRoomsForLevel(LEVEL),
        );

        // (a) The repair genuinely worked. Without this assertion "0 breaks" could
        //     just as well mean the audit went quiet, which is the failure mode this
        //     whole family exists to prevent.
        expect(rooms.length, 'the partition must actually split the shell into two rooms').toBe(2);

        // (b) …and BECAUSE it worked, the audit must report nothing to fix.
        //     Under the old wiring this is 2 — it read endpoints that no longer exist.
        expect(breakCount(summaryOf(logs))).toBe(0);
    });

    it('⭐ the audit still SEES a break the repair passes DECLINE (it did not just go quiet)', () => {
        // ⛔ THIS IS THE ASSERTION THAT STOPS THE FIX ABOVE BECOMING SILENCE. If
        // auditing the repaired array simply made every level report zero, the change
        // would be strictly worse than the noise it replaced.
        //
        // The declining gate here is `_reconnectDanglingEnds`' DANGLING test
        // (`connectedToWall`, :756): an endpoint within CORNER_CONNECTED_TOL_M (300 mm)
        // of ANY other wall's endpoint is "connected" and the repair skips it — even
        // when the whole cluster sits 500 mm off the host it was meant to meet. The
        // stub below makes the partition's lower end non-dangling in exactly that way,
        // so the 500 mm gap survives into `buildWallGraph` and IS a real loop break.
        const t = 0.1;
        const walls: WallData[] = [
            wall('shell-bottom-D', [0, 0], [10, 0], t),
            wall('shell-right-D', [10, 0], [10, 6], t),
            wall('shell-top-D', [10, 6], [0, 6], t),
            wall('shell-left-D', [0, 6], [0, 0], t),
            wall('partition-D', [5, 0.5], [5, 5.5], t),
            // Ends ON the partition's lower endpoint ⇒ that endpoint is "connected"
            // ⇒ the reach repair declines it.
            wall('stub-D', [5, 0.5], [6.5, 0.5], t),
        ];
        const { logs, warns } = capture(() => engineFor(walls).detectRoomsForLevel(LEVEL));
        expect(breakCount(summaryOf(logs))).toBeGreaterThan(0);
        expect(warns.some(w => w.includes('§DIAG-ROOM-LOOP BREAK'))).toBe(true);
    });

    it('an endpoint further than the 1000 mm BREAK band is COUNTED, not silently dropped', () => {
        // §DIAG-1M-BLIND-SPOT (L-1392). The BREAK clause is gated `dist < 1.0`, so a
        // 1.4 m stand-off was counted nowhere and logged nowhere — which is why the
        // largest value the founder ever saw was 917 mm. That was the CAP, not the
        // model. It now has a named bucket.
        const { logs } = capture(() => engineFor(splitShell(1.4)).detectRoomsForLevel(LEVEL));
        const m = /farEndpointsOver1m=(\d+)/.exec(summaryOf(logs));
        expect(m, 'the >1 m band must be named on the summary line').toBeTruthy();
        expect(Number(m![1])).toBeGreaterThan(0);
    });
});

// ── The audit's own gates, exercised directly off the prototype ──────────────
// `_diagRoomLoop` reads only its arguments, so it runs without an engine — the
// same seam `diagRoomLoopCost.test.ts` uses.

type Seg = { wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 };
function runDiag(segs: Seg[], thickness = 0.1): { logs: string[]; warns: string[] } {
    const th = new Map<string, number>(segs.map(s => [s.wallUUID.replace(/(_[cs]\d+)+$/, ''), thickness]));
    const { logs, warns } = capture(() => {
        (RoomDetectionEngine.prototype as unknown as {
            _diagRoomLoop: (s: unknown, t: unknown, l: string, c: number) => void;
        })._diagRoomLoop.call({}, segs, th, LEVEL, 1);
    });
    return { logs, warns };
}
const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);

describe('§REFUSE-SAME-PARENT-DIAG (L-1391) — one curved wall cannot accuse itself', () => {
    it('two CHORDS of the same curved wall never report a loop break against each other', () => {
        // `tessellateCurvedWallForTopology` mints `<wallId>_c<i>` per chord. The old
        // skip compared FULL UUIDs, so `w_c0` and `w_c1` were "different walls".
        // Chord 1's endpoint sits 400 mm off chord 0's body, aimed straight at it.
        const segs: Seg[] = [
            { wallUUID: 'curvy_c0', start: v(0, 0), end: v(10, 0) },
            { wallUUID: 'curvy_c1', start: v(5, 0.4), end: v(5, 4) },
        ];
        expect(breakCount(summaryOf(runDiag(segs).logs))).toBe(0);

        // CONTROL — identical geometry on two DIFFERENT walls still reports.
        const other: Seg[] = [
            { wallUUID: 'hostwall_c0', start: v(0, 0), end: v(10, 0) },
            { wallUUID: 'guestwall_c1', start: v(5, 0.4), end: v(5, 4) },
        ];
        expect(breakCount(summaryOf(runDiag(other).logs))).toBeGreaterThan(0);
    });
});

describe('§DIAG-RUNS-UP-TO (L-1391) — a wall passing NEAR is not a wall failing to MEET', () => {
    it('a PARALLEL neighbour inside the distance band is counted as a near-miss, not a break', () => {
        // Two parallel walls 400 mm apart, overlapping — a party-wall pair / riser
        // shaft / 900 mm corridor is exactly this shape. BOTH endpoints of the guest
        // project into the host's body, so the old audit printed TWO break lines for
        // a pair of walls that were never meant to touch.
        const segs: Seg[] = [
            { wallUUID: 'party_a', start: v(0, 0), end: v(10, 0) },
            { wallUUID: 'party_b', start: v(2, 0.4), end: v(8, 0.4) },
        ];
        const { logs } = runDiag(segs);
        const summary = summaryOf(logs);
        expect(breakCount(summary)).toBe(0);
        // ⭐ NOT SILENCE — the measurement survives under its own honest name.
        expect(/parallelNearMisses=([1-9]\d*)/.test(summary)).toBe(true);
    });

    it('a wall that RUNS INTO the host at the same distance is still a break', () => {
        // Same 400 mm gap, but the guest's axis points AT the host. This is the
        // signature the audit exists for, and it must survive the new gate.
        const segs: Seg[] = [
            { wallUUID: 'host_x', start: v(0, 0), end: v(10, 0) },
            { wallUUID: 'guest_y', start: v(5, 0.4), end: v(5, 4) },
        ];
        expect(breakCount(summaryOf(runDiag(segs).logs))).toBeGreaterThan(0);
    });
});

describe('§DIAG-AGGREGATE-ON-THE-JUNCTION (L-1391)', () => {
    it('one junction reported from both sides counts ONCE and prints ONE warn block', () => {
        // A crossed corner: each arm's endpoint lands in the other's mid-span, aimed
        // at it. Two measurements, ONE physical location.
        const segs: Seg[] = [
            { wallUUID: 'arm_a', start: v(0, 0.4), end: v(5, 0.4) },
            { wallUUID: 'arm_b', start: v(0.4, 0), end: v(0.4, 5) },
        ];
        const { logs, warns } = runDiag(segs);
        expect(breakCount(summaryOf(logs))).toBe(1);
        expect(warns.filter(w => w.includes('§DIAG-ROOM-LOOP BREAK')).length).toBe(1);
    });
});

describe('§DIAG-RESCUE-SATISFIABILITY (L-1392)', () => {
    it('at generated thicknesses the summary states the rescue window is EMPTY, not "0 rescued"', () => {
        // Every wall this product generates is 100-300 mm, so `hostSnap` never leaves
        // the 200 mm floor and `thickShellTJunctionsRescued` CANNOT be non-zero. A bare
        // `=0` beside `unresolvedLoopBreaks=N` reads as a rescue that failed.
        const segs: Seg[] = [{ wallUUID: 'w1', start: v(0, 0), end: v(4, 0) }];
        const thin = summaryOf(runDiag(segs, 0.1).logs);
        expect(thin).toContain('thickShellTJunctionsRescued=0');
        expect(thin).toContain('EMPTY-BY-CONSTRUCTION');

        // …and above 360 mm the window really does open, so the clause must disappear
        // rather than being printed unconditionally.
        const thick = summaryOf(runDiag(segs, 1.0).logs);
        expect(thick).not.toContain('EMPTY-BY-CONSTRUCTION');
    });
});
