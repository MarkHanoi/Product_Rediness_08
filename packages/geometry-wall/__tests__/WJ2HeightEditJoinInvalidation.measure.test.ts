// §WJ2-HEIGHT-IS-NOT-PLAN-GEOMETRY (founder 2026-08-19, production build e17d9c2e)
//
// THE REPORT: "I updated THE HEIGHT OF ALL WALLS in a large multi-level project.
// Many issues, it stalled." Chrome's captured stack for the accompanying
// §FIX-T-JOIN-PENETRATION warning:
//
//     _applyT ← _handleMultiWallClusters ← resolveLevel ← WallRebuildCoordinator._flush
//     ← tick ← scheduleNext ← requestAnimationFrame   (chained 200+ frames deep)
//
// THE HYPOTHESIS UNDER TEST: **height is not plan geometry**. T-joins, mitres,
// clusters and the self-cluster guard are computed from CENTRELINES, THICKNESS and
// ANGLES. A height-only edit changes none of them, so it must not re-resolve joins.
//
// This file MEASURES that claim rather than asserting it from a reading, and then
// measures what the classifier actually does with a height edit — because the
// classifier is the invalidation key, and the founder's stack says the key let a
// height edit through to the whole-level solve.
//
// ⭐ INSTRUMENT CHECK (memory: "probe can be wrong three ways"). The obvious probe —
// "does resolveLevel LOOK like it reads height?" — is a reading, not a measurement,
// and a reading cannot see an indirect read. So M2 below does not inspect the source:
// it RUNS the real `WallJoinResolver.resolveLevel` twice over the same plate at two
// different heights and compares the FULL serialised JoinData of every wall. If any
// height-dependent path existed anywhere under resolveLevel — direct, indirect, or
// through a helper — that comparison would diverge. It is falsifiable in the right
// direction: it can only PASS by the output genuinely being invariant.
//
// @file packages/geometry-wall/__tests__/WJ2HeightEditJoinInvalidation.measure.test.ts

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { classifyWallDelta, joinGeometryChangedExcludingBaseline } from '../src/WallDeltaClassifier';
import { wallJoinMemoStats, wallJoinMemoReset, wallJoinResolveKey } from '../src/WallJoinResolveMemo';
import type { WallData } from '../src/WallTypes';
import type { JoinData } from '../src/WallJoinResolver';

// ── the plate builder ────────────────────────────────────────────────────────
// A realistic floor plate: an outer shell ring plus interior partitions that meet
// it at T-junctions — i.e. exactly the topology `_handleMultiWallClusters` /
// `_applyT` (the two frames above `resolveLevel` in the founder's stack) exist for.

let _seq = 0;
function mk(
    s: [number, number],
    e: [number, number],
    height: number,
    levelId = 'L0',
    thickness = 0.2,
): WallData {
    return {
        id: `wj2-${levelId}-${_seq++}`,
        type: 'wall',
        levelId,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height,
        thickness,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'wj2', version: 1 },
    } as unknown as WallData;
}

/**
 * A realistic plate, NOT a uniform grid: a THICK shell ring (0.4 m) enclosing THIN
 * interior partitions (0.1 m) that T into it, plus skew partitions that meet the
 * shell off-axis.
 *
 * ⭐ WHY NOT A UNIFORM ORTHOGONAL GRID. My first plate was one, and its THICKNESS
 * control did not diverge — correctly. On an orthogonal plate of uniform thickness
 * the trimmed baseline at a corner is the CENTRELINE intersection and the miter
 * normal is the 45° bisector; both are thickness-independent, so `JoinData` really
 * is invariant under thickness there. That made the control unable to fail, which
 * would have made the height result meaningless. This plate fixes it at the source:
 * §PARTITION-SHELL-INNER-FACE clamps a partition end to `hostHalfT` of its HOST, so
 * a differing shell thickness moves the answer — and the same topology is what
 * `_applyT` / `_handleMultiWallClusters` (the two frames above `resolveLevel` in the
 * founder's stack) actually run on.
 */
function plate(bays: number, height: number, levelId = 'L0', shellT = 0.4): WallData[] {
    const SPAN = 4;
    const W = bays * SPAN;
    const walls: WallData[] = [];
    // Shell ring — thick, SEGMENTED per bay (what a generated plate actually stores).
    for (let c = 0; c < bays; c++) {
        walls.push(mk([c * SPAN, 0], [(c + 1) * SPAN, 0], height, levelId, shellT));
        walls.push(mk([c * SPAN, W], [(c + 1) * SPAN, W], height, levelId, shellT));
        walls.push(mk([0, c * SPAN], [0, (c + 1) * SPAN], height, levelId, shellT));
        walls.push(mk([W, c * SPAN], [W, (c + 1) * SPAN], height, levelId, shellT));
    }
    // Interior partitions — thin, segmented, T-ing into the shell and into each other.
    for (let r = 1; r < bays; r++) {
        for (let c = 0; c < bays; c++) {
            walls.push(mk([c * SPAN, r * SPAN], [(c + 1) * SPAN, r * SPAN], height, levelId, 0.1));
        }
    }
    for (let c = 1; c < bays; c++) {
        for (let r = 0; r < bays; r++) {
            walls.push(mk([c * SPAN, r * SPAN], [c * SPAN, (r + 1) * SPAN], height, levelId, 0.1));
        }
    }
    // Skew partitions — off-axis meets, so the T/grazing classifier is exercised.
    for (let c = 1; c < bays; c++) {
        walls.push(mk([c * SPAN, 0], [c * SPAN + SPAN * 0.6, SPAN * 0.8], height, levelId, 0.1));
    }
    return walls;
}

/** Full, order-stable serialisation of one wall's JoinData — every field the
 *  resolver can write, at full float precision. Nothing is rounded: a rounding
 *  step here would be the instrument hiding the very divergence it must detect. */
function serialiseJoin(m: Map<string, JoinData>): string {
    const ids = [...m.keys()].sort();
    return JSON.stringify(ids.map((id) => [id, m.get(id)]));
}

const ms = (f: () => void): number => {
    const t0 = performance.now();
    f();
    return performance.now() - t0;
};

// ⭐ INSTRUMENT CORRECTION (WJ2, caught by re-reading my own output). M3 below is
// supposed to measure THE SOLVE. Once §WJ2-JOIN-MEMO landed, M3's warm-up call
// populated the memo and the timed calls were served from it — so M3 reported
// 0.1 ms for a 323-wall plate and called it "resolveLevel cost". That is the fix
// measuring itself and reporting the answer as the problem's size. Anything that
// must observe the real solve now runs inside `memoOff`.
type MemoG = { __pryzmWallJoinMemo?: boolean };
const memoOff = <T>(f: () => T): T => {
    (globalThis as MemoG).__pryzmWallJoinMemo = false;
    try { return f(); } finally { delete (globalThis as MemoG).__pryzmWallJoinMemo; }
};

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ SECOND INSTRUMENT CORRECTION, and this one was nearly fatal to the argument.
//
// M2 is the load-bearing proof that the plan solve does not read height. Once
// §WJ2-JOIN-MEMO landed, the `h=5.0` call in the first test was SERVED BY THE
// MEMO ENTRY THE `h=3.0` CALL HAD JUST STORED — because height is (correctly) not
// in the memo key. The test still went green, and it now proved nothing but
// "the memo returns what it stored": perfectly circular, and it would have gone on
// passing if the resolver had grown a height dependency the very next day.
//
// A fix that makes its own justifying measurement unfalsifiable is worse than no
// measurement. So every call in M2 runs with the memo OFF — M2 interrogates the
// SOLVE. The memo's own behaviour is measured separately, in §WJ2-JOIN-MEMO below,
// against a memo-off baseline.
// ─────────────────────────────────────────────────────────────────────────────
describe('§WJ2-HEIGHT-IS-NOT-PLAN-GEOMETRY — M2: is resolveLevel invariant under height?', () => {
    it('resolveLevel output is BYTE-IDENTICAL at h=3.0 and h=5.0 on the same plate', () => {
        _seq = 0;
        const at3 = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0)));
        _seq = 0;
        const at5 = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 5.0)));

        expect(at5.size).toBe(at3.size);
        expect(at3.size).toBeGreaterThan(0);          // the probe must have DONE something
        expect(serialiseJoin(at5)).toBe(serialiseJoin(at3));
    });

    it('and at a degenerate height (0.05 m) — nothing about the plan solve moves', () => {
        _seq = 0;
        const at3 = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0)));
        _seq = 0;
        const tiny = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 0.05)));
        expect(serialiseJoin(tiny)).toBe(serialiseJoin(at3));
    });

    it('CONTROL A — the comparison DIVERGES for a HOST-THICKNESS change', () => {
        // Without a control that CAN fail, the two tests above would also pass on an
        // instrument that compared nothing. §PARTITION-SHELL-INNER-FACE clamps each
        // partition end to the HOST's half-thickness, so thickening the shell must move
        // the answer.
        _seq = 0;
        const shell40 = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0, 'L0', 0.4)));
        _seq = 0;
        const shell60 = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0, 'L0', 0.6)));
        expect(serialiseJoin(shell60)).not.toBe(serialiseJoin(shell40));
    });

    it('⭐ and BYTE-IDENTICAL when every wall gains a WINDOW (the third gesture)', () => {
        // Founder, same day: bulk-creating a window every 1.5 m in ALL walls produced
        // the SAME `_applyT ← _handleMultiWallClusters ← resolveLevel` stack. A hosted
        // opening cannot move a centreline, change a thickness, or alter an angle — so
        // the plan solve must be invariant under it. Measured, not argued.
        _seq = 0;
        const bare = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0)));
        _seq = 0;
        const glazed = plate(4, 3.0).map((w) => ({
            ...w,
            openings: [
                { id: `${w.id}-win`, elementId: `${w.id}-el`, type: 'window',
                  offset: 1.5, width: 1.2, height: 1.4, sillHeight: 0.9 },
            ],
        })) as WallData[];
        expect(serialiseJoin(memoOff(() => WallJoinResolver.resolveLevel(glazed)))).toBe(serialiseJoin(bare));
    });

    it('CONTROL B — the comparison DIVERGES for a BASELINE move of one endpoint', () => {
        _seq = 0;
        const base = memoOff(() => WallJoinResolver.resolveLevel(plate(4, 3.0)));
        _seq = 0;
        const moved = plate(4, 3.0);
        moved[6]!.baseLine[1] = { x: moved[6]!.baseLine[1].x + 0.5, y: 0, z: moved[6]!.baseLine[1].z + 0.5 } as never;
        expect(serialiseJoin(memoOff(() => WallJoinResolver.resolveLevel(moved)))).not.toBe(serialiseJoin(base));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§WJ2-HEIGHT-IS-NOT-PLAN-GEOMETRY — M1: what does the invalidation key DO with a height edit?', () => {
    const one = (h: number, levelId = 'L0'): WallData =>
        ({ ...mk([0, 0], [4, 0], h, levelId), id: `w-${levelId}` }) as WallData;

    it('the join-geometry key EXCLUDES height (3 → 5 is not a join change)', () => {
        expect(joinGeometryChangedExcludingBaseline(one(3), one(5))).toBe(false);
    });

    it('SINGLE-LEVEL height edit ⇒ fast path (no resolveLevel)', () => {
        const r = classifyWallDelta([{ event: 'update', wall: one(5), prevState: one(3) }]);
        expect(r.kind).toBe('openings-only');
    });

    it('⭐ MULTI-LEVEL height edit ⇒ whole-level — the founder\'s case', () => {
        const r = classifyWallDelta([
            { event: 'update', wall: one(5, 'L0'), prevState: one(3, 'L0') },
            { event: 'update', wall: one(5, 'L1'), prevState: one(3, 'L1') },
        ]);
        expect(r.kind).toBe('whole-level');
        expect(r.kind === 'whole-level' && r.reason).toBe('multi-level-batch');
    });

    it('⭐ and ONE level with no prevState poisons the WHOLE batch', () => {
        const r = classifyWallDelta([
            { event: 'update', wall: one(5, 'L0'), prevState: one(3, 'L0') },
            { event: 'update', wall: one(5, 'L0') },                        // no prevState
        ]);
        expect(r.kind).toBe('whole-level');
        expect(r.kind === 'whole-level' && r.reason).toBe('no-prevState');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§WJ2-HEIGHT-IS-NOT-PLAN-GEOMETRY — M3: the cost the founder paid', () => {
    it('MEASURE — resolveLevel wall-clock vs plate size, and the multi-level total', () => {
        const rows: string[] = [];
        let perLevelMs = 0;
        let perLevelWalls = 0;
        for (const bays of [4, 6, 8, 10, 12]) {
            _seq = 0;
            const walls = plate(bays, 3.0);
            // memoOff: M3 measures THE SOLVE. See the instrument correction above.
            const t = memoOff(() => {
                WallJoinResolver.resolveLevel(walls);             // warm
                return Math.min(ms(() => { WallJoinResolver.resolveLevel(walls); }),
                                ms(() => { WallJoinResolver.resolveLevel(walls); }));
            });
            rows.push(`  walls=${String(walls.length).padStart(4)}  resolveLevel=${t.toFixed(1).padStart(8)} ms`);
            if (bays === 12) { perLevelMs = t; perLevelWalls = walls.length; }
        }
        // eslint-disable-next-line no-console
        console.log(
            '\n§WJ2-HEIGHT-IS-NOT-PLAN-GEOMETRY — resolveLevel cost (ONE level, ONE pass)\n' +
            rows.join('\n') +
            `\n  ⇒ ${perLevelWalls} walls/level × 6 levels, resolved ONCE per level per flush: ` +
            `${(perLevelMs * 6).toFixed(0)} ms of join solving for a HEIGHT edit that ` +
            `provably cannot change its answer.\n` +
            `  ⇒ and the founder's stack shows the flush RE-ARMING across 200+ frames, so ` +
            `multiply by the number of flushes, not by one.\n`,
        );
        expect(perLevelMs).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §WJ2-JOIN-MEMO (L-1156) — the fix, and the before/after it is claimed on.
//
// ⭐ INSTRUMENT CHECK. A memo test that only ever measures HITS proves nothing —
// a memo that returned a hit for every input would pass it. So every claim below
// is paired with a control that must MISS, and the byte-identity check compares
// the memoised answer against the answer produced with the memo switched OFF,
// not against itself.
// ─────────────────────────────────────────────────────────────────────────────

describe('§WJ2-JOIN-MEMO — the answer is unchanged', () => {
    it('a memo HIT is byte-identical to the answer computed with the memo OFF', () => {
        wallJoinMemoReset();
        _seq = 0;
        const walls = plate(6, 3.0);
        const uncached = memoOff(() => WallJoinResolver.resolveLevel(walls));
        WallJoinResolver.resolveLevel(walls);                    // populate
        const before = wallJoinMemoStats().hits;
        const hit = WallJoinResolver.resolveLevel(walls);        // serve
        expect(wallJoinMemoStats().hits).toBe(before + 1);       // it really was a hit
        expect(serialiseJoin(hit)).toBe(serialiseJoin(uncached));
    });

    it('the hit is a COPY — mutating it cannot poison the cache', () => {
        wallJoinMemoReset();
        _seq = 0;
        const walls = plate(4, 3.0);
        const first = WallJoinResolver.resolveLevel(walls);
        const firstSig = serialiseJoin(first);
        // A consumer mutates what it was handed (the coordinator does exactly this).
        for (const j of first.values()) { j.baseLine[0].x += 999; j.invalid = true; }
        expect(serialiseJoin(WallJoinResolver.resolveLevel(walls))).toBe(firstSig);
    });

    it('CONTROL — the memo MISSES on a real join edit (baseline move AND thickness)', () => {
        wallJoinMemoReset();
        _seq = 0;
        const walls = plate(4, 3.0);
        WallJoinResolver.resolveLevel(walls);
        const moved = walls.map((w, i) => (i === 6
            ? { ...w, baseLine: [w.baseLine[0], { x: w.baseLine[1].x + 0.5, y: 0, z: w.baseLine[1].z }] }
            : w)) as WallData[];
        const m0 = wallJoinMemoStats().misses;
        WallJoinResolver.resolveLevel(moved);
        expect(wallJoinMemoStats().misses).toBe(m0 + 1);          // moved ⇒ MISS
        const m1 = wallJoinMemoStats().misses;
        WallJoinResolver.resolveLevel(walls.map((w) => ({ ...w, thickness: 0.33 })) as WallData[]);
        expect(wallJoinMemoStats().misses).toBe(m1 + 1);          // thickness ⇒ MISS
    });

    it('CONTROL — flipping a behaviour flag MISSES (a cached answer is never served under different rules)', () => {
        wallJoinMemoReset();
        _seq = 0;
        const walls = plate(4, 3.0);
        WallJoinResolver.resolveLevel(walls);
        const m0 = wallJoinMemoStats().misses;
        (globalThis as Record<string, unknown>).__pryzmMultiClusterPartitionTrim = false;
        try { WallJoinResolver.resolveLevel(walls); }
        finally { delete (globalThis as Record<string, unknown>).__pryzmMultiClusterPartitionTrim; }
        expect(wallJoinMemoStats().misses).toBe(m0 + 1);
    });
});

describe('§WJ2-JOIN-MEMO — BEFORE / AFTER on the founder\'s three gestures', () => {
    it('MEASURE — bulk HEIGHT change and bulk WINDOW create both become cache HITS', () => {
        wallJoinMemoReset();
        _seq = 0;
        const walls = plate(12, 3.0);                            // 323 walls, one level
        const LEVELS = 6;

        // BEFORE — what the deployed build does: a full solve per level per flush.
        const beforeMs = memoOff(() => ms(() => {
            for (let l = 0; l < LEVELS; l++) WallJoinResolver.resolveLevel(walls);
        }));

        // AFTER — gesture 2: every wall's height changes. Nothing the solve reads moves.
        WallJoinResolver.resolveLevel(walls);                     // one real solve, level 1
        const tall = walls.map((w) => ({ ...w, height: 5.0 })) as WallData[];
        const h0 = wallJoinMemoStats().hits;
        const afterHeightMs = ms(() => {
            for (let l = 0; l < LEVELS; l++) WallJoinResolver.resolveLevel(tall);
        });
        const heightHits = wallJoinMemoStats().hits - h0;

        // AFTER — gesture 3: every wall gains a window. Also nothing the solve reads.
        const glazed = walls.map((w) => ({
            ...w,
            openings: [{ id: `${w.id}-w`, elementId: `${w.id}-e`, type: 'window',
                         offset: 1.5, width: 1.2, height: 1.4, sillHeight: 0.9 }],
        })) as WallData[];
        const w0 = wallJoinMemoStats().hits;
        const afterWindowMs = ms(() => {
            for (let l = 0; l < LEVELS; l++) WallJoinResolver.resolveLevel(glazed);
        });
        const windowHits = wallJoinMemoStats().hits - w0;

        // eslint-disable-next-line no-console
        console.log(
            `\n§WJ2-JOIN-MEMO — BEFORE / AFTER (${walls.length} walls/level × ${LEVELS} levels)\n` +
            `  BEFORE  memo OFF, ${LEVELS} whole-level solves       ${beforeMs.toFixed(1).padStart(8)} ms\n` +
            `  AFTER   bulk HEIGHT change  (${heightHits}/${LEVELS} hits) ${afterHeightMs.toFixed(1).padStart(8)} ms   ` +
            `${(beforeMs / Math.max(afterHeightMs, 0.001)).toFixed(0)}× faster\n` +
            `  AFTER   bulk WINDOW create  (${windowHits}/${LEVELS} hits) ${afterWindowMs.toFixed(1).padStart(8)} ms   ` +
            `${(beforeMs / Math.max(afterWindowMs, 0.001)).toFixed(0)}× faster\n` +
            `  (the AFTER figures INCLUDE the key build, which is the only work a hit does)\n`,
        );

        // The claims, as assertions — a printed number nobody checks is not evidence.
        expect(heightHits).toBe(LEVELS);        // every pass hit
        expect(windowHits).toBe(LEVELS);
        expect(afterHeightMs).toBeLessThan(beforeMs / 5);
        expect(afterWindowMs).toBeLessThan(beforeMs / 5);
    });

    it('MEASURE — key-build cost, the tax a MISS pays', () => {
        _seq = 0;
        const walls = plate(12, 3.0);
        const th = { snapRadius: 0.1, maxCornerOffset: 0.1, minWallLength: 0.05 };
        wallJoinResolveKey(walls, th);
        const keyMs = Math.min(
            ms(() => { for (let i = 0; i < 10; i++) wallJoinResolveKey(walls, th); }),
            ms(() => { for (let i = 0; i < 10; i++) wallJoinResolveKey(walls, th); }),
        ) / 10;
        const solveMs = memoOff(() => ms(() => { WallJoinResolver.resolveLevel(walls); }));
        // eslint-disable-next-line no-console
        console.log(
            `\n§WJ2-JOIN-MEMO — key build ${keyMs.toFixed(2)} ms vs solve ${solveMs.toFixed(1)} ms ` +
            `(${(keyMs / solveMs * 100).toFixed(1)}% overhead on a MISS, ${walls.length} walls)\n`,
        );
        expect(keyMs).toBeLessThan(solveMs / 10);   // the tax must be an order of magnitude below the saving
    });
});
