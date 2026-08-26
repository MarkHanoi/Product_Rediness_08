// ⭐ §PERSIST103 (L-11520) · C13 · C47 · C67 rule 12 · C84 EI-6 —
//    FIVE ELEMENT FAMILIES MUST SURVIVE create -> serialize -> deserialize -> read-back.
// ═══════════════════════════════════════════════════════════════════════════════
//
// THE DEFECT, IN THE FOUNDER'S WORDS: *"11 elements did not survive project opening —
// the lift for example, I can see it is not there."*
//
// Measured 2026-08-26:
//     grep -c "liftStore\|liftCompound\|LiftCompound" ProjectSerializer.ts  ->  0
//
// `lift.create` validated, minted nineteen records across six stores, rendered, and
// reported `success: true` — and the compound died on save. Same zero for `pool`,
// `water` and `balcony`.
//
// ─── WHY THIS FILE EXECUTES THE SERIALIZER INSTEAD OF PINNING ITS SOURCE ───────
// `BeamMaterialSurvivesReload.test.ts` proves its WRITE half "BY SOURCE PARITY, NOT BY
// AN EXECUTED SAVE", on the stated grounds that *"executing `ProjectSerializer.serialize`
// needs a ~20-store bundle plus `window`"*. That was a fair call for one FIELD on one
// record. It is NOT enough for a whole FAMILY: a source check asserts that a line of
// code exists, and every one of the three families lost in this file had lines of code
// that existed and did nothing.
//
// C67 rule 12 wants the round trip, and `mt05StoreIdentityHeap.spec.ts` already shows
// the bundle is buildable — it drives the REAL `ProjectSerializer.serialize` under
// vitest with sentinel stores. So this file does the same, and then reads the records
// BACK OUT THROUGH THE REAL PLUGIN STORES (`LiftCompoundStore`, `LiftPartStore`,
// `PoolStore`, `WaterStore`, `BalconyStore`) via the REAL restore path.
// `success: true` is not evidence; a record you can read out of the store the user's
// result depends on is (C16 §5.1 CA-21).
//
// ─── THE LIFT'S MEMBERS LIVE IN TWO STORES, AND BOTH ARE ASSERTED ─────────────
// C104 §2.2: a lift compound's parts are three families in three stores. The parent
// lands in `LiftCompoundStore`; the five LOD-300 cabin parts land in `LiftPartStore`;
// the shaft walls / glass / landing doors live in the WALL, CURTAIN-WALL and DOOR
// families and are NOT copied into either. So proving the parent came back proves
// almost nothing about the cabin — ARM B asserts the parts independently, and ARM C
// asserts the parent↔part linkage (`parentId`) that makes them one element.
//
// ─── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — stated, not implied ────────
// PROVEN, EXECUTED: the SAVE half (the real serializer reads the real stores and emits
// the five keys), the C47 OMISSION rule (an unauthored family produces a snapshot with
// no such key), the JSON boundary (stringify -> parse, so nothing survives only as a
// live object reference), and the RESTORE half (the real `restoreCompoundFamilies`
// writes the real plugin stores through the real undo adapters).
//
// ⛔ NOT PROVEN HERE: that a mesh appears. The render half is a REGISTERED SINK
// (`registerLiftRenderSink`) filled by `initTools.ts`, which needs WebGL and a live
// canvas and cannot run headless. ARM F drives the sink with a RECORDING stand-in and
// asserts the payload the real `LiftCompoundMeshBuilder` would receive — that is the
// reachability half, and it is named as such rather than described as a pixel.
//     ⭐ The stand-in is legitimate ONLY because it is not built from the header:
//     `flushLiftRender` (the REAL function the adapter calls) computes the payload,
//     and the stand-in merely records what it was handed. [[fake-more-capable-than-real]]
//     — a fake that computed the payload itself could not falsify anything.
// ⛔ NOT PROVEN: that `ProjectLoader` calls this restore on the production path. That
//    is a source assertion, ARM G, and it is named as a source assertion — the loader's
//    `load()` needs a BimManager, a CommandManager and a scene.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ProjectSerializer } from '../persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../persistence/restoreCompoundFamilies';
import {
    registerLiftRenderSink,
    __resetLiftRenderSinkForTests,
    type LiftRenderInputLike,
} from '../undo/liftUndoAdapter';
import { LiftCompoundStore, LiftPartStore } from '@pryzm/plugin-lift';
import { PoolStore, WaterStore } from '@pryzm/plugin-pool';
import { BalconyStore } from '@pryzm/plugin-balcony';

const REPO = resolve(__dirname, '../../../../..');
const LEVEL_ID = 'L0';
const BUDGET = 300_000;

// ── The stores under test — the REAL plugin classes, not stand-ins ────────────
interface Live {
    lift: LiftCompoundStore;
    liftPart: LiftPartStore;
    pool: PoolStore;
    water: WaterStore;
    balcony: BalconyStore;
}

function freshStores(): Live {
    return {
        lift:     new LiftCompoundStore(),
        liftPart: new LiftPartStore(),
        pool:     new PoolStore(),
        water:    new WaterStore(),
        balcony:  new BalconyStore(),
    };
}

/**
 * A sentinel for the ~20 LEGACY stores the serializer also reads. Same device
 * `mt05StoreIdentityHeap.spec.ts` uses, and for the same reason: those families are
 * not under test here, and hand-building twenty real geometry stores would be a much
 * larger fake than the one it replaces.
 */
function sentinel(): any {
    const s: any = {
        getAll: () => [],
        getLevels: () => [],
        isBuiltIn: () => true,
        getCustom: () => [],
        size: () => 0,
        serialize: () => ({}),
        getState: () => new Map(),
        activeLevelId: LEVEL_ID,
    };
    return s;
}

function serializerBundle(): any {
    const keys = [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ];
    const b: any = {};
    for (const k of keys) b[k] = sentinel();
    return b;
}

/**
 * Publish the five plugin stores exactly where PRODUCTION publishes them —
 * `window.runtime.stores[storeKey]` — because that is the ONLY channel both the
 * serializer's `readPluginStore()` and the undo adapters' `resolve*FromWindow()` read.
 * Anything else would test a path production does not have.
 */
function publish(live: Live): void {
    const w = globalThis as any;
    w.window ??= w;
    w.window.runtime = {
        stores: {
            lift: live.lift, liftPart: live.liftPart,
            pool: live.pool, water: live.water,
            balcony: live.balcony,
        },
    };
}

/** `Store.applyPatch` is the very method the bus calls on execute — the same road a real create takes. */
function seed(store: any, records: readonly Record<string, unknown>[]): void {
    store.applyPatch(records.map((r) => ({ op: 'add', path: [r.id as string], value: r })));
}

// ── Fixtures: one lift (1 compound + 5 cabin parts), one pool, one balcony ────
const LIFT_ID = 'lift-A';
const LIFT = {
    id: LIFT_ID, levelId: LEVEL_ID, type: 'lift',
    origin: { x: 2, y: 0, z: 3 }, rotation: 0,
    enclosureType: 'wall-hosted', carParkOffsetY: 0.4, mark: 'LFT-01',
    servedLevelIds: [LEVEL_ID, 'L1'],
    hostWallId: 'w-host', penetratedSlabIds: ['s-1'],
    childrenIds: ['w-1', 'cw-1', 'd-1'],
};
// C104: LIFT_PART_CYCLE_ORDER — five, exactly.
const LIFT_PARTS = [
    'cabin-structure', 'cabin-wall-finish', 'cabin-floor', 'cabin-ceiling', 'cabin-door',
].map((kind, i) => ({
    id: `lp-${i}`, parentId: LIFT_ID, liftId: LIFT_ID, kind, levelId: LEVEL_ID,
    size: { x: 1.1, y: 2.2, z: 1.4 }, offset: { x: 0, y: 0, z: 0 },
    materialId: 'steel-brushed',
}));
const POOL = {
    id: 'pool-A', levelId: LEVEL_ID, type: 'pool',
    hostSlabId: 's-1', childrenIds: ['w-p1', 's-p1'],
    depth: 1.6, waterId: 'water-A',
};
const WATER = {
    id: 'water-A', levelId: LEVEL_ID, poolId: 'pool-A', type: 'water',
    surfaceY: -0.2, outline: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 8 }, { x: 0, z: 8 }],
    materialId: 'water-pool',
};
const BALCONY = {
    id: 'balc-A', levelId: LEVEL_ID, type: 'balcony',
    hostWallId: 'w-host', childrenIds: ['s-b1', 'f-b1', 'h-b1'],
    profile: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 1.5 }, { x: 0, z: 1.5 }],
    depth: 1.5, thickness: 0.22,
};

function saveWith(live: Live): any {
    publish(live);
    return ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'persist103' });
}

let saved: any;

beforeEach(() => {
    __resetLiftRenderSinkForTests();
    const authored = freshStores();
    seed(authored.lift, [LIFT]);
    seed(authored.liftPart, LIFT_PARTS);
    seed(authored.pool, [POOL]);
    seed(authored.water, [WATER]);
    seed(authored.balcony, [BALCONY]);
    // THE JSON BOUNDARY. A record that survives only as a live object reference has
    // not been persisted — it has been remembered. Everything below is read out of
    // text that went to disk and came back.
    saved = JSON.parse(ProjectSerializer.stringify(saveWith(authored)));
});

afterEach(() => { __resetLiftRenderSinkForTests(); });

describe('§PERSIST103 — the five compound families round-trip', () => {
    it('ARM A — the SAVE half: all five slices reach the snapshot text', () => {
        expect(saved.lifts, 'the founder\'s lift must be IN THE FILE').toHaveLength(1);
        expect(saved.liftParts, 'C104 §2.2 — five LOD-300 cabin parts').toHaveLength(5);
        expect(saved.pools).toHaveLength(1);
        expect(saved.waters, 'ADR-0124 §4 — water has no other family to fall back on').toHaveLength(1);
        expect(saved.balconies).toHaveLength(1);
        // …and the count the save log prints must have MOVED. `elementCount` omitting
        // these is why the log agreed with the corrupted file instead of contradicting it.
        expect(saved.elementCount, 'elementCount must include the compounds').toBeGreaterThanOrEqual(9);
    }, BUDGET);

    it('ARM B — the RESTORE half, EXECUTED: every record is read back out of the REAL store', () => {
        const live = freshStores();
        publish(live);
        // Sanity: the stores are genuinely empty first, or every assertion below could
        // pass against records that were never removed ([] must mean "zero", not "I did not look").
        expect(live.lift.ids(), 'the target store must start EMPTY').toEqual([]);
        expect(live.liftPart.ids()).toEqual([]);

        const r = restoreCompoundFamilies(saved);
        expect(r.errors, 'restore must not report a loss').toEqual([]);
        expect(r.total).toBe(9); // 1 lift + 5 parts + 1 pool + 1 water + 1 balcony

        // ⭐ THE LIFT'S TWO STORES, ASSERTED SEPARATELY (C104 §2.2). The parent coming
        // back proves nothing about the cabin: they are different families in different
        // stores, and only `liftPart` had no legacy twin to survive in.
        const lift = live.lift.get(LIFT_ID);
        expect(lift, 'the lift compound must be in LiftCompoundStore').toBeTruthy();
        expect(lift!.mark, 'its authored mark must survive').toBe('LFT-01');
        expect((lift as any).origin).toEqual({ x: 2, y: 0, z: 3 });
        expect((lift as any).servedLevelIds, 'a lift that served two storeys must still serve two')
            .toEqual([LEVEL_ID, 'L1']);
        expect((lift as any).childrenIds, 'ownership-by-childrenIds is what makes it a compound')
            .toEqual(['w-1', 'cw-1', 'd-1']);

        expect([...live.liftPart.ids()].sort(), 'all FIVE cabin parts, not just the parent')
            .toEqual(['lp-0', 'lp-1', 'lp-2', 'lp-3', 'lp-4']);
        const floor = live.liftPart.partOfKind(LIFT_ID, 'cabin-floor' as any);
        expect(floor, 'the store\'s own query must resolve the part').toBeTruthy();
        expect((floor as any).materialId, 'an authored material must not revert to a default')
            .toBe('steel-brushed');

        // POOL + WATER
        expect(live.pool.get('pool-A')).toBeTruthy();
        expect((live.pool.get('pool-A') as any).hostSlabId).toBe('s-1');
        const water = live.water.getState().get('water-A') as any;
        expect(water, 'a reloaded pool must not be a DRY HOLE').toBeTruthy();
        expect(water.surfaceY).toBe(-0.2);
        expect(water.outline, 'the water body\'s outline must survive').toHaveLength(4);

        // BALCONY
        const balc = live.balcony.get('balc-A') as any;
        expect(balc).toBeTruthy();
        expect(balc.profile, 'the authored profile is the whole point of C103').toHaveLength(4);
        expect(balc.childrenIds).toEqual(['s-b1', 'f-b1', 'h-b1']);
    }, BUDGET);

    it('ARM C — parent↔part linkage survives, so the cabin belongs to THIS lift', () => {
        const live = freshStores();
        publish(live);
        restoreCompoundFamilies(saved);
        // `byLift` is the query the Tab drill-in and the inspector both read. If
        // `parentId`/`liftId` did not survive, the parts would be in the store and
        // orphaned — present, and belonging to nothing.
        expect(live.liftPart.byLift(LIFT_ID), 'five parts must resolve back to their lift')
            .toHaveLength(5);
        expect(live.lift.servingLevel('L1'), 'the served-level index must still answer')
            .toHaveLength(1);
    }, BUDGET);

    it('ARM D — C47: an UNAUTHORED family omits its key entirely (byte-identical to a pre-fix snapshot)', () => {
        const empty = freshStores();
        const snap: any = saveWith(empty);
        // ⛔ NOT `[]`. A written empty array is the positive claim "the user deleted
        // them all"; an ABSENT key is "this file records no lifts". Collapsing the two
        // is the §CONTEXT-DATA-HONESTY defect, and keeping them apart is what makes an
        // untouched project's snapshot byte-identical to one saved before this fix.
        for (const k of ['lifts', 'liftParts', 'pools', 'waters', 'balconies']) {
            expect(snap[k], `'${k}' must be ABSENT, not empty`).toBeUndefined();
            expect(Object.prototype.hasOwnProperty.call(JSON.parse(ProjectSerializer.stringify(snap)), k))
                .toBe(false);
        }
        // …and no schema bump was needed, because the change is additive-optional.
        expect(snap.schemaVersion, 'additive-optional keys need no SNAPSHOT_SCHEMA_VERSION bump').toBe(5);
    }, BUDGET);

    it('ARM E — C47: a LEGACY snapshot with none of these keys loads without error', () => {
        // Exactly what every project saved before 2026-08-26 looks like. A missing key
        // means "none authored" and must never be an error (C13: an old project must
        // still open).
        const live = freshStores();
        publish(live);
        const r = restoreCompoundFamilies({ schemaVersion: 5, walls: [], slabs: [] });
        expect(r.errors).toEqual([]);
        expect(r.total).toBe(0);
        expect(live.lift.ids()).toEqual([]);
    }, BUDGET);

    it('ARM F — the RENDER seam is reached with the real payload (reachability, NOT a pixel)', () => {
        const live = freshStores();
        publish(live);
        // A RECORDER, not a re-implementation: `flushLiftRender` — the real function the
        // real adapter calls — computes this payload; the sink only writes down what it
        // was handed. A stand-in that computed the payload itself could not falsify
        // anything ([[fake-more-capable-than-real]]).
        const drawn: LiftRenderInputLike[] = [];
        registerLiftRenderSink({ update: (i) => { drawn.push(i); }, remove: () => {} });

        restoreCompoundFamilies(saved);

        expect(drawn.length, 'the lift builder must be reached at least once').toBeGreaterThanOrEqual(1);
        const last = drawn[drawn.length - 1]!;
        expect(last.id).toBe(LIFT_ID);
        // ⭐ THE ASSERTION THAT MATTERS: the builder is handed the CABIN, not an empty
        // shaft. `flushLiftRender` refuses to draw a compound with zero parts, so a
        // restore that brought the parent back without its parts would reach the sink
        // never — which is a silent half-restore, the exact shape of the original bug.
        expect(last.parts, 'the builder must receive all five cabin parts').toHaveLength(5);
        expect(last.mark).toBe('LFT-01');
    }, BUDGET);

    it('ARM G — SOURCE: ProjectLoader calls the restore in the COMMON TAIL, so BOTH load paths get it', () => {
        // Named as a source assertion. `ProjectLoader.load()` needs a BimManager, a
        // CommandManager and a scene, so the call cannot be executed headless — but WHERE
        // it sits is the load-bearing fact, and it is checkable.
        const src = readFileSync(
            resolve(REPO, 'apps/editor/src/engine/persistence/ProjectLoader.ts'), 'utf8');
        expect(src).toContain('restoreCompoundFamilies(snapshot)');
        const callAt = src.indexOf('restoreCompoundFamilies(snapshot)');
        const joinAt = src.indexOf('} // end legacy per-command path');
        expect(joinAt, 'the legacy/import join marker must exist').toBeGreaterThan(0);
        // ⛔ AFTER the join, never inside a branch. Every other restore in that file
        // exists twice — once per path — and that duplication has already stranded one:
        // `grep -c boundaryLine ImportProjectCommand.ts` -> 0 while the import path is
        // the DEFAULT, so L-9948's boundary-line restore does not run in production
        // (L-11528). One call past the join is what makes that impossible here.
        expect(callAt, 'the compound restore must sit AFTER the two load paths rejoin')
            .toBeGreaterThan(joinAt);
    }, BUDGET);

    it('ARM H — NEGATIVE CONTROL: an arm that can fail. Drop the parts and the cabin is NOT drawn', () => {
        // An arm never observed failing is unproven. This is what a HALF-restored lift
        // looks like — precisely the state the original defect left behind, since
        // `liftPart` had no legacy twin.
        const live = freshStores();
        publish(live);
        const drawn: LiftRenderInputLike[] = [];
        registerLiftRenderSink({ update: (i) => { drawn.push(i); }, remove: () => {} });

        const mutilated = { ...saved, liftParts: undefined };
        const r = restoreCompoundFamilies(mutilated);

        expect(live.lift.get(LIFT_ID), 'the parent still lands').toBeTruthy();
        expect(live.liftPart.ids(), 'but the cabin is gone').toEqual([]);
        expect(drawn, 'and flushLiftRender REFUSES to draw an empty shaft (C104 §2)').toEqual([]);
        expect(r.total).toBe(4); // lift + pool + water + balcony; the five parts are absent
    }, BUDGET);
});
