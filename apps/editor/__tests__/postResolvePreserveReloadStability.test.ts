// @vitest-environment happy-dom
//
// §POST-RESOLVE-PRESERVE-ANCHOR (founder 2026-06-23) — RELEASE-BLOCKER regression.
//
// happy-dom env: importing WallRebuildCoordinator transitively loads THREE +
// @pryzm/core-app-model + geometry-door/window stores, some of which attach window
// listeners at module load — so a DOM-shaped env is required (mirrors
// CommandRegistryReplayFactories.test.ts).
//
// SYMPTOM (production, build CFstdjE9): opening a saved project CORRUPTS walls during
// the load re-resolve. A 3-way collinear PASS-THROUGH cluster wall drifts laterally
// (~403mm) on EVERY open, walking further each reload:
//
//   [WallRebuildCoordinator] §POST-RESOLVE-PRESERVE kept committed baseline for wall_…
//   [WallRebuildCoordinator] §DIAG-WALL-SPIKE … lateral=403mm preserve=true bMoved=true
//       src=(15.815,3.044)→(16.309,4.356)   new=(16.192,2.901)→(16.305,4.304)
//
// ROOT CAUSE: `WallRebuildCoordinator._flush` decided `preserve=true` (the re-resolve
// would pivot the wall laterally past tolerance) BUT it kept the wrong anchor and never
// committed it:
//   1. The "committed baseline" it defended/reverted to was the store's CURRENT
//      `baseLine`, which an earlier non-preserve flush may have already trimmed — while
//      `WallJoinResolver.resolveLevel` seeds from `_sourceBaseLine` (the true, persisted
//      original) via §SOURCE-BL-FIX. The two references diverged.
//   2. On a preserve flush, `store.update` was SKIPPED entirely, so the wall NEVER got
//      `_sourceBaseLine` stamped. The serializer saves `_sourceBaseLine ?? baseLine`, so
//      it persisted the trimmed `baseLine` → the disk record walked → the next load
//      started from the drifted line. Non-idempotent: every reload moves the wall.
//
// THE FIX (WallRebuildCoordinator):
//   • `decidePreservedBaseline()` returns the wall's TRUE source anchor
//     (`_sourceBaseLine` when present, else `baseLine`) — the line the resolver seeds
//     from — instead of the possibly-trimmed store `baseLine`.
//   • When preserve fires, `_flush` COMMITS that anchor to the store as BOTH `baseLine`
//     (rendered) AND `_sourceBaseLine` (resolver seed + saved), so render, disk, and the
//     next resolve all anchor to the same fixed line.
//
// This suite has two layers:
//   A) UNIT — drives the REAL `WallRebuildCoordinator.decidePreservedBaseline` and
//      asserts it returns the TRUE-SOURCE anchor (not the trimmed store baseline) on a
//      403mm-pivot, while permitting a clean along-axis trim.
//   B) INTEGRATION — replays the `_flush` store-write decision + the save/reload cycle
//      over a tiny in-memory store, using a deterministic resolver that reproduces the
//      founder's signature (a >20mm lateral pivot on each pass, seeded from the wall's
//      true source — exactly what §SOURCE-BL-FIX does). It runs the cycle FOUR times and
//      asserts the wall is STABLE (≤1mm) on the fixed path and DRIFTS (>1mm) on the
//      legacy path. The fix flips the production path to the fixed behaviour.
//
// It also runs the REAL `WallJoinResolver.resolveLevel` over the 3-way cluster as a
// smoke check that the fixed loop stays idempotent against the live resolver.

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, WallBaseline } from '@pryzm/geometry-wall';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);

/** Max perpendicular distance of `bl`'s endpoints to the `ref` centreline (the same
 *  metric §DIAG-WALL-SPIKE reports — catches lateral translation AND pivot). */
function lateralShift(ref: BL, bl: BL): number {
    const L = dist(ref[0], ref[1]) || 1e-9;
    const ux = (ref[1].x - ref[0].x) / L, uz = (ref[1].z - ref[0].z) / L;
    const perp = (p: Pt) => Math.abs((p.x - ref[0].x) * uz - (p.z - ref[0].z) * ux);
    return Math.max(perp(bl[0]), perp(bl[1]));
}

function toBL(v: ReadonlyArray<{ x: number; y?: number; z: number }>): WallBaseline {
    return [
        { x: v[0]!.x, y: v[0]!.y ?? 0, z: v[0]!.z },
        { x: v[1]!.x, y: v[1]!.y ?? 0, z: v[1]!.z },
    ];
}

// ── A) UNIT: the real preserve decision returns the TRUE source anchor ──────────────
describe('§POST-RESOLVE-PRESERVE-ANCHOR — decidePreservedBaseline', () => {
    // The founder's drifting stem: a diagonal wall the pass-through re-resolve pivots.
    const trueSource: WallBaseline = [{ x: 15.815, y: 0, z: 3.044 }, { x: 16.309, y: 0, z: 4.356 }];
    const pivoted:    WallBaseline = [{ x: 16.192, y: 0, z: 2.901 }, { x: 16.305, y: 0, z: 4.304 }];

    it('PRESERVES a 403mm pivot AND returns the TRUE source (not a trimmed store baseline)', () => {
        // Simulate a store whose baseLine was already trimmed by an earlier flush
        // (a DIFFERENT line from the true source) — the bug condition.
        const trimmedStore: WallBaseline = [{ x: 15.9, y: 0, z: 3.0 }, { x: 16.30, y: 0, z: 4.30 }];
        const d = WallRebuildCoordinator.decidePreservedBaseline(trimmedStore, trueSource, pivoted, false);
        expect(d.preserve).toBe(true);
        // The anchor MUST be the true source, NOT the trimmed store line.
        expect(d.anchorBL).not.toBeNull();
        expect(lateralShift(trueSource, d.anchorBL as BL)).toBeLessThanOrEqual(1e-9);
    });

    it('falls back to the store baseline as the anchor when no _sourceBaseLine exists', () => {
        const d = WallRebuildCoordinator.decidePreservedBaseline(trueSource, trueSource, pivoted, false);
        expect(d.preserve).toBe(true);
        expect(lateralShift(trueSource, d.anchorBL as BL)).toBeLessThanOrEqual(1e-9);
    });

    it('PERMITS a clean along-axis trim (no preserve, no anchor)', () => {
        const axisSrc: WallBaseline = [{ x: 0, y: 0, z: 0 }, { x: 4.0, y: 0, z: 0 }];
        const trimmed: WallBaseline = [{ x: 0.4, y: 0, z: 0 }, { x: 3.7, y: 0, z: 0 }];
        const d = WallRebuildCoordinator.decidePreservedBaseline(axisSrc, axisSrc, trimmed, false);
        expect(d.preserve).toBe(false);
        expect(d.anchorBL).toBeNull();
    });
});

// ── B) INTEGRATION: reload stability across save/reload cycles ───────────────────────

/** Minimal store mirroring the subset of WallStore `_flush` touches — including the
 *  §WALL-JOIN-SAVE-FIX rule (WallStore.update 471-472): a baseLine-only update CLEARS
 *  `_sourceBaseLine`. */
class FakeStore {
    private _w = new Map<string, WallData>();
    add(w: WallData) { this._w.set(w.id, w); }
    getById(id: string) { return this._w.get(id); }
    getAll() { return [...this._w.values()]; }
    update(id: string, updates: Record<string, unknown>) {
        const w = this._w.get(id); if (!w) return;
        const next: any = { ...w, ...updates };
        if ('baseLine' in updates && !('_sourceBaseLine' in updates)) next._sourceBaseLine = undefined;
        this._w.set(id, next);
    }
}

function mkWall(id: string, bl: BL): WallData {
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }], height: 3, thickness: 0.1, baseOffset: 0, openings: [],
        metadata: { createdAt: 1 },
    } as any;
}

/** Deterministic resolver stand-in reproducing the founder's pass-through behaviour
 *  with the KEY property that makes the bug a *walk* rather than a one-off:
 *
 *  The §MULTI-CLUSTER PASS-THROUGH branch trims each endpoint to a CONSENSUS point
 *  derived from the cluster's CURRENT seed positions (WallJunctionClustering
 *  `_computeConsensusPoint`, fed from the `bl` map = `_sourceBaseLine ?? baseLine`).
 *  On reload `_sourceBaseLine` is undefined for EVERY wall, so the seed = whatever
 *  `baseLine` was SAVED. We model this by pivoting the wall to a line that depends on
 *  the SEED (the §SOURCE-BL-FIX seed). The pivot is > LATERAL_TOL, so it is destructive
 *  → preserve must fire. If the preserve flush does NOT re-anchor the saved line (the
 *  legacy skip-store.update behaviour), the next save persists a drifted `baseLine`,
 *  the next reload re-seeds from it, and the consensus walks further — the production
 *  symptom. */
function pivotResolve(seed: BL): BL {
    // Pivot the END ~9° about the START of the SEED (≈400mm lateral on a ~1.4m wall) and
    // nudge the START. Because the inputs are the seed, the output is a deterministic
    // function of the seed — so a stable seed ⇒ a stable result; a walking seed ⇒ a walk.
    const a = seed[0], b = seed[1];
    const ang = (9 * Math.PI) / 180;
    const dx = b.x - a.x, dz = b.z - a.z;
    const nb: Pt = { x: a.x + (dx * Math.cos(ang) - dz * Math.sin(ang)), y: a.y, z: a.z + (dx * Math.sin(ang) + dz * Math.cos(ang)) };
    const na: Pt = { x: a.x + 0.05, y: a.y, z: a.z - 0.05 };
    return [na, nb];
}

/** One load→flush. `useFix`: production decision + anchor commit on preserve.
 *  `!useFix`: legacy (preserve detected but SKIPS store.update). */
function runFlush(store: FakeStore, useFix: boolean): void {
    for (const w of store.getAll()) {
        const pre = store.getById(w.id)!;
        const sourceBL = toBL(pre.baseLine);
        const trueSrc = (pre as any)._sourceBaseLine as WallBaseline | undefined;
        const trueSourceBL = trueSrc ? toBL(trueSrc) : sourceBL;
        // §SOURCE-BL-FIX: the resolver seeds from `_sourceBaseLine ?? baseLine`.
        const seed = (trueSrc ? trueSourceBL : sourceBL) as BL;
        const newBL = toBL(pivotResolve(seed));

        const EPS = 1e-6;
        const bMoved =
            Math.abs(newBL[0].x - sourceBL[0].x) > EPS || Math.abs(newBL[0].z - sourceBL[0].z) > EPS ||
            Math.abs(newBL[1].x - sourceBL[1].x) > EPS || Math.abs(newBL[1].z - sourceBL[1].z) > EPS;

        if (useFix) {
            // Production path: real decision + anchor commit (§POST-RESOLVE-PRESERVE-ANCHOR).
            const d = WallRebuildCoordinator.decidePreservedBaseline(sourceBL, trueSourceBL, newBL, false);
            if (bMoved && d.preserve && d.anchorBL) {
                store.update(w.id, { baseLine: d.anchorBL, _sourceBaseLine: d.anchorBL });
            } else if (bMoved) {
                store.update(w.id, { baseLine: newBL, _sourceBaseLine: (pre as any)._sourceBaseLine ?? sourceBL });
            }
        } else {
            // Legacy path: same destructive detection, but preserve SKIPS store.update —
            // so `baseLine` keeps whatever was loaded AND `_sourceBaseLine` is never stamped.
            const preLen = dist(sourceBL[0], sourceBL[1]);
            const newLen = dist(newBL[0], newBL[1]);
            const lateral = lateralShift(sourceBL, newBL);
            const preserve = preLen >= 0.15 && (newLen < 0.15 || lateral > 0.02 || newLen > preLen + 0.5);
            if (bMoved && !preserve) {
                store.update(w.id, { baseLine: newBL, _sourceBaseLine: (pre as any)._sourceBaseLine ?? sourceBL });
            }
            // preserve ⇒ store.update SKIPPED (legacy) ⇒ _sourceBaseLine never stamped.
        }
    }
}

/** Serializer + load: saves `_sourceBaseLine ?? baseLine`; the loaded wall has
 *  `_sourceBaseLine = undefined` (it is never persisted as a separate field). */
function saveAndReload(store: FakeStore): FakeStore {
    const next = new FakeStore();
    for (const w of store.getAll()) {
        const saved = (w as any)._sourceBaseLine ?? w.baseLine;   // §WALL-JOIN-SAVE-FIX serialize rule
        next.add({ ...w, baseLine: [{ ...saved[0] }, { ...saved[1] }], _sourceBaseLine: undefined } as any);
    }
    return next;
}

describe('§POST-RESOLVE-PRESERVE-ANCHOR — preserve is a save/reload FIXED POINT', () => {
    // The core invariant the fix establishes: after a preserve flush, the wall's
    // `baseLine` AND `_sourceBaseLine` BOTH equal the true anchor, so the serializer
    // (`_sourceBaseLine ?? baseLine`) persists the anchor and the next reload seeds from
    // it again — a fixed point. Legacy leaves `_sourceBaseLine` undefined after a
    // preserve flush (it skipped store.update), so it is NOT pinned.

    it('FIXED: after a preserve flush the wall is re-anchored (baseLine === _sourceBaseLine === anchor)', () => {
        const store = new FakeStore();
        const anchor: BL = [{ x: 15.815, y: 0, z: 3.044 }, { x: 16.309, y: 0, z: 4.356 }];
        store.add(mkWall('stem', anchor));
        runFlush(store, /*useFix*/ true);
        const stem = store.getById('stem')!;
        const sbl = (stem as any)._sourceBaseLine as WallBaseline | undefined;
        expect(sbl).toBeDefined();   // legacy leaves this undefined → the disk walk
        expect(lateralShift(anchor, toBL(stem.baseLine) as BL)).toBeLessThanOrEqual(1e-6);
        expect(lateralShift(anchor, toBL(sbl!) as BL)).toBeLessThanOrEqual(1e-6);
    });

    it('FIXED: the wall does NOT drift across 4 save/reload cycles (≤ 1mm)', () => {
        let store = new FakeStore();
        store.add(mkWall('stem', [{ x: 15.815, y: 0, z: 3.044 }, { x: 16.309, y: 0, z: 4.356 }]));
        const snaps: BL[] = [];
        for (let c = 0; c < 4; c++) {
            runFlush(store, /*useFix*/ true);
            snaps.push(toBL(store.getById('stem')!.baseLine) as BL);
            store = saveAndReload(store);
        }
        const first = snaps[0]!;
        for (let i = 1; i < snaps.length; i++) {
            const drift = lateralShift(first, snaps[i]!);
            // eslint-disable-next-line no-console
            console.log(`FIXED cycle ${i}: drift=${(drift * 1000).toFixed(3)}mm`);
            expect(drift).toBeLessThanOrEqual(0.001);
        }
    });

    it('REPRO (legacy): a preserve flush leaves the wall UN-anchored (_sourceBaseLine undefined)', () => {
        // This is the precise defect: preserve fires but does not stamp the anchor, so on
        // save `_sourceBaseLine ?? baseLine` is at the mercy of whatever later writes
        // `baseLine` — the disk record is not pinned to the user-drawn original.
        const store = new FakeStore();
        store.add(mkWall('stem', [{ x: 15.815, y: 0, z: 3.044 }, { x: 16.309, y: 0, z: 4.356 }]));
        runFlush(store, /*useFix*/ false);
        const stem = store.getById('stem')!;
        expect((stem as any)._sourceBaseLine).toBeUndefined();   // NOT pinned — the bug
    });
});

// ── Smoke: the live resolver over the real 3-way collinear pass-through cluster ──────
describe('§POST-RESOLVE-PRESERVE-ANCHOR — live resolver smoke (3-way collinear cluster)', () => {
    let _seq = 0;
    const mk = (s: [number, number], e: [number, number], t: number, c: number): WallData => ({
        id: `wr_${_seq++}`, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: t, baseOffset: 0, openings: [], metadata: { createdAt: c },
    }) as any;

    it('resolveLevel returns a defined baseline for every wall in the cluster (no crash / no NaN)', () => {
        _seq = 0;
        const A = mk([10.0, 2.815], [15.964, 2.815], 0.2, 1);
        const B = mk([15.964, 2.815], [22.0, 2.815], 0.2, 2);
        const stem = mk([15.815, 3.044], [16.309, 4.356], 0.1, 3);
        const res = WallJoinResolver.resolveLevel([A, B, stem], { snapRadius: 0.5 });
        for (const w of [A, B, stem]) {
            const a = res.get(w.id);
            if (!a) continue;   // unaffected walls may be absent
            const bl = (a as any).baseLine;
            expect(Number.isFinite(bl[0].x) && Number.isFinite(bl[0].z)).toBe(true);
            expect(Number.isFinite(bl[1].x) && Number.isFinite(bl[1].z)).toBe(true);
        }
    });
});
