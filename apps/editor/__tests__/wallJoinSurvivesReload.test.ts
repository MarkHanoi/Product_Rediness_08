// @vitest-environment happy-dom
//
// §WALL-JOIN-LOAD-SKIP — L-1490: "once the project closes and reopens, ALL mitred
// joints are gone. Then if I create an element on this level all joins come back."
//
// ────────────────────────────────────────────────────────────────────────────────
// WHAT THIS SUITE PROVES, AT THE LAYER THE USER SEES
// ────────────────────────────────────────────────────────────────────────────────
// The user does not see "a scheduler was invoked". The user sees the MITRE — which
// is `JoinData.startMN` / `JoinData.endMN` plus the trimmed `JoinData.baseLine`,
// the values `WallFragmentBuilder.buildWall(wall, joinData, …)` consumes to cut the
// end faces. So every assertion here is on the JOIN GEOMETRY THE BUILDER WAS HANDED,
// captured pre-save and compared post-reload. A test that asserted `resolveLevel`
// was called would pass on a build that renders squares.
//
// THE MECHANISM (measured — see wallJoinLoadDeferredResolve.measure.test.ts):
//
//  1. §FIX-WALL-JOIN-BASELINE-IMMUTABLE (L-44/46/47, founder 2026-07-02) makes a
//     wall's STORED baseline immutable under a join re-resolve, and ProjectSerializer
//     §WALL-JOIN-SAVE-FIX deliberately saves `_sourceBaseLine` — "the user-drawn,
//     PRE-join-resolution baseline". The mitre is therefore persisted NOWHERE: it
//     lives only in the ephemeral JoinData. §WALL-JOIN-LOAD-SKIP (2026-06-24) was
//     authored eight days EARLIER on the opposite premise ("the persisted baseLine IS
//     the trimmed/welded line the last resolve produced") and builds every restored
//     wall with `joinData = null`. Restore does not DEFER the join — it ships
//     UNJOINED geometry.
//
//  2. The deferred whole-level resolve that was supposed to repair it lands in
//     `_flush`, whose §FIX-WALLFLUSH-NOPROGRESS-GUARD returns early when the level's
//     STORE-geometry signature is unchanged since the last completed flush. A join
//     changes no store geometry (see 1), and `_resetState()` does NOT clear
//     `_lastFlushLevelSig` on project switch — so on close-and-reopen the signature is
//     byte-identical to the one recorded before the close and the entire deferred
//     flush is skipped. The join is never recomputed.
//
//     This is the SAME gate, with the SAME symptom, that WallRebuildCoordinator's own
//     §WALL-RAKE-INVALIDATION note already records: "the wall only gets angled after
//     another element is created or modified".
//
//  3. Creating an element on the level moves that signature, the gate releases, the
//     whole-level resolve runs — and every join snaps correct. That is the founder's
//     "WHY?": creating an element does not repair the joins, it UNBLOCKS a repair that
//     was already queued and being refused.
//
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
const LEVEL_ID = 'L0';

/** The values the user actually sees: the trimmed baseline + both miter normals. */
function printJoin(j: unknown): string {
    if (!j) return 'SQUARE-CUT(no joinData)';
    const d = j as {
        baseLine: [{ x: number; z: number }, { x: number; z: number }];
        startMN?: { nx: number; nz: number } | null;
        endMN?: { nx: number; nz: number } | null;
    };
    const p = (v: { x: number; z: number }): string => `${v.x.toFixed(4)},${v.z.toFixed(4)}`;
    const n = (v: { nx: number; nz: number } | null | undefined): string => (v ? `${v.nx.toFixed(4)},${v.nz.toFixed(4)}` : 'sq');
    return `bl[${p(d.baseLine[0])}->${p(d.baseLine[1])}] s(${n(d.startMN)}) e(${n(d.endMN)})`;
}

function makeLevelProvider(): unknown {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

/** Records the LAST join geometry each wall was actually built with. */
function makeBuilderStub() {
    const lastJoin = new Map<string, string>();
    const roots = new Set<string>();
    return {
        lastJoin,
        removeWall(id: string): void { roots.delete(id); lastJoin.delete(id); },
        buildWall(w: WallData, join: unknown): void { roots.add(w.id); lastJoin.set(w.id, printJoin(join)); },
        updateWall(w: WallData, join: unknown): void { roots.add(w.id); lastJoin.set(w.id, printJoin(join)); },
        recordBuiltVersion(): void { /* render seam */ },
        getWallRoot(id: string): unknown { return roots.has(id) ? {} : undefined; },
    };
}

const fakeScene = { add(): void { /* noop */ }, remove(): void { /* noop */ } };

function mkWall(id: string, a: Pt, b: Pt): WallData {
    return {
        id,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: id },
        childrenIds: [],
        baseLine: [{ ...a }, { ...b }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** A closed 5 x 4 m room — four walls, four real mitred corners. */
function roomWalls(): WallData[] {
    const p = (x: number, z: number): Pt => ({ x, y: 0, z });
    return [
        mkWall('w_N', p(0, 0), p(5, 0)),
        mkWall('w_E', p(5, 0), p(5, 4)),
        mkWall('w_S', p(5, 4), p(0, 4)),
        mkWall('w_W', p(0, 4), p(0, 0)),
    ];
}

const setRestore = (v: boolean): void => {
    (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = v;
};

interface Harness {
    store: WallStore;
    builder: ReturnType<typeof makeBuilderStub>;
}

function makeHarness(): Harness {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as ConstructorParameters<typeof WallStore>[1]);
    const coord = new WallRebuildCoordinator();
    const builder = makeBuilderStub();
    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: (id: string) => ({ id, elevation: 0 }) },
        doorBuilder: { rebuildForWall: () => { /* noop */ } },
        windowBuilder: { rebuildForWall: () => { /* noop */ } },
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
    } as never);
    return { store, builder };
}

/** ProjectSerializer §WALL-JOIN-SAVE-FIX: prefer `_sourceBaseLine` (pre-join). */
function serialize(store: WallStore): WallData[] {
    return store.getAll().map((w: WallData) => {
        const src = (w as unknown as { _sourceBaseLine?: [Pt, Pt] })._sourceBaseLine ?? w.baseLine;
        return mkWall(w.id, { ...src[0] }, { ...src[1] });
    });
}

describe('§WALL-JOIN-LOAD-SKIP (L-1490) — mitred joins must survive close-and-reopen', () => {
    let fake: FakeRafAdapter;

    beforeEach(() => {
        _resetFrameSchedulerForTest();
        fake = new FakeRafAdapter();
        getFrameScheduler().start(fake);
    });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        setRestore(false);
    });

    it('the join geometry the builder is handed after a reload is IDENTICAL to pre-save', () => {
        const { store, builder } = makeHarness();

        // ── SESSION 1: draw the room, let the LIVE-EDIT path resolve the joins ──
        for (const w of roomWalls()) store.add(w);
        window.__wallRebuildControl!.resumeAndFlush();
        fake.pumpFrames(10);

        const beforeSave = new Map(builder.lastJoin);
        // Sanity: the live path really did hand the builder real join data for all four
        // walls. If this fails the harness is wrong, not the subject.
        expect(beforeSave.size).toBe(4);
        expect([...beforeSave.values()].every(v => !v.startsWith('SQUARE-CUT'))).toBe(true);

        const saved = serialize(store);

        // ── CLOSE the project (C13 project-switch teardown) ────────────────────
        window.__engineTeardown!.resetWallRebuildState();
        for (const w of store.getAll()) store.remove(w.id);
        builder.lastJoin.clear();

        // ── REOPEN: ProjectLoader pauses, hydrates, then flushes in RESTORE mode ─
        window.__wallRebuildControl!.pause();
        for (const rec of saved) store.add(rec);
        setRestore(true);
        window.__wallRebuildControl!.resumeAndFlush();
        setRestore(false);

        // The restore flush promises "one whole-level resolve per level, deferred off
        // the critical path" — "joints settle a frame or two later". Give it 60.
        fake.pumpFrames(60);

        const diffs: string[] = [];
        for (const [id, before] of beforeSave) {
            const after = builder.lastJoin.get(id) ?? '(never built)';
            if (after !== before) diffs.push(`  ${id}\n    pre-save : ${before}\n    reloaded : ${after}`);
        }
        if (diffs.length > 0) {
            // eslint-disable-next-line no-console
            console.log(`§WALL-JOIN-LOAD-SKIP — ${diffs.length}/${beforeSave.size} wall(s) reloaded with DIFFERENT join geometry:\n${diffs.join('\n')}`);
        }
        expect(diffs).toEqual([]);
    });

    it("CONTROL — creating an element on the level repairs every join (the founder's WHY)", () => {
        const { store, builder } = makeHarness();

        for (const w of roomWalls()) store.add(w);
        window.__wallRebuildControl!.resumeAndFlush();
        fake.pumpFrames(10);
        const beforeSave = new Map(builder.lastJoin);
        const saved = serialize(store);

        window.__engineTeardown!.resetWallRebuildState();
        for (const w of store.getAll()) store.remove(w.id);
        builder.lastJoin.clear();

        window.__wallRebuildControl!.pause();
        for (const rec of saved) store.add(rec);
        setRestore(true);
        window.__wallRebuildControl!.resumeAndFlush();
        setRestore(false);
        fake.pumpFrames(60);

        // …now the founder creates ONE element on this level.
        store.add(mkWall('w_NEW', { x: 1, y: 0, z: 1 }, { x: 3, y: 0, z: 1 }));
        fake.pumpFrames(20);

        for (const [id, before] of beforeSave) {
            expect(builder.lastJoin.get(id), `wall ${id} after "create an element"`).toBe(before);
        }
    });
});
