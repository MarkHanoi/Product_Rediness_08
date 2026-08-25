/**
 * §LIFT94 (L-11340) — UNDO / REDO FOR THE C104 LIFT COMPOUND, MEASURED THROUGH THE
 * REAL COMPOSITION ROOT.
 *
 * THE FOUNDER: *"lift — check undo - redo - delete - nothing works reliably"*.
 *
 * THE DEFECT THIS PINS. `lift.create` declares six affected stores and mints ONE real
 * PatchPair over all six. `buildUndoStoreMap()` covered four of them and had NO entry
 * for the two the lift itself lives in (`lift`, `liftPart` — L-7311 / L-7312).
 * `_covered()` in performUndoRedo.ts is ALL-OR-NOTHING, so the whole entry was declined
 * and Ctrl+Z did nothing at all: the lift stayed, and so did the void punched through
 * every slab it passed. Not a failed undo — silent data retention reported as success.
 *
 * ⚠ WHY THIS TEST DRIVES THE REAL BUS AND READS THE REAL STORES (C67 rule 12).
 * A test that called `liftCompoundUndoAdapter().applyPatch(handMadePatches)` would be a
 * fake built from the header: it could not falsify the claim that the patches the BUS
 * actually mints are the shape the adapter expects. So the PatchPair here is the one
 * `produceMultiStoreCommand` produced inside `CreateLiftHandler`, taken off the ring
 * buffer, and every assertion reads back through `rt.stores.*` — the same objects the
 * application reads. The fixture is deliberately the same one
 * `liftReachableThroughComposedRuntime.test.ts` established, so the two files disagree
 * about nothing.
 *
 * ⚠ WHY IT ROUTES `applyRingBufferSide` DIRECTLY RATHER THAN CALLING `performUndo()`.
 * `performUndo()` reaches for `window.commandManager`, the selection manager, the
 * observer-pause globals and a HUD. Standing all of that up would test the bootstrap,
 * not the adapter, and the parts that could not be stood up would have to be faked —
 * which is the trap above again. `applyRingBufferSide` is the exact function
 * `performUndo()` calls with the exact map `buildUndoStoreMap()` returns, so the seam
 * under test is real even though the keypress is not. The map-shape test below pins the
 * other half: that `buildUndoStoreMap()` really does hand `applyRingBufferSide` a
 * working adapter for both keys.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { applyRingBufferSide, RingBufferUndoStack } from '@pryzm/command-bus';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo.js';
import {
    liftCompoundUndoAdapter,
    liftPartUndoAdapter,
    registerLiftRenderSink,
    __resetLiftRenderSinkForTests,
    flushLiftRender,
    type LiftUndoStores,
    type LiftRenderInputLike,
} from '../src/engine/undo/liftUndoAdapter.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H00';
const SLAB_L0 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const SLAB_L1 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H02';
const SLAB_L2 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H03';
const LIFT_ID = 'lift_01ARZ3NDEKTSV4RRFFQ69G5H04';

const ENCLOSURE_IDS = [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H10',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H11',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H12',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H13',
];
const LANDING_DOOR_IDS = [
    'door_01ARZ3NDEKTSV4RRFFQ69G5H20',
    'door_01ARZ3NDEKTSV4RRFFQ69G5H21',
    'door_01ARZ3NDEKTSV4RRFFQ69G5H22',
];
const CABIN_PART_IDS = [
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H30',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H31',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H32',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H33',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H34',
];

const PLATE = [
    { x: 0, y: 0, z: 0 },
    { x: 12, y: 0, z: 0 },
    { x: 12, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
];

const SLAB_IDS = [SLAB_L0, SLAB_L1, SLAB_L2] as const;

const SERVED_LEVELS = [
    { levelId: 'level-1', elevation: 0, slabId: SLAB_L0 },
    { levelId: 'level-2', elevation: 3, slabId: SLAB_L1 },
    { levelId: 'level-3', elevation: 6, slabId: SLAB_L2 },
];

const LIFT_PAYLOAD = {
    liftId: LIFT_ID,
    levelId: 'level-1',
    enclosureType: 'wall-hosted' as const,
    hostWallId: HOST_WALL,
    origin: { x: 6, y: 0, z: 5 },
    rotation: 0,
    servedLevels: SERVED_LEVELS,
    enclosureIds: ENCLOSURE_IDS,
    landingDoorIds: LANDING_DOOR_IDS,
    cabinPartIds: CABIN_PART_IDS,
};

async function bootWithLift() {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    await rt.bus.executeCommand('wall.create', {
        id: HOST_WALL,
        levelId: 'level-1',
        baseLine: [
            { x: 0, y: 0, z: 5 },
            { x: 12, y: 0, z: 5 },
        ],
        height: 3,
        thickness: 0.2,
    });
    for (const [id, lvl] of [
        [SLAB_L0, 'level-1'],
        [SLAB_L1, 'level-2'],
        [SLAB_L2, 'level-3'],
    ] as const) {
        await rt.bus.executeCommand('slab.create', { id, levelId: lvl, boundary: PLATE });
    }
    return rt;
}

/**
 * Attach a ring buffer to the harness bus.
 *
 * ⚠ `bootstrapWithEverything` builds the plugin/store/handler half of the composition
 * root but attaches no undo stack — in production `composeRuntime` does that. Without
 * one, `CommandBus` skips the `_ringBuffer.push()` at CommandBus.ts:589 entirely and
 * NO PatchPair is ever recorded, so this must run BEFORE the `lift.create` under test.
 * This is the same `RingBufferUndoStack` class `composeRuntime` installs.
 */
function attachRingBuffer(rt: { bus: { setRingBuffer(rb: RingBufferUndoStack): void } }): RingBufferUndoStack {
    const rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
    return rb;
}

/** Hole count per slab, read back through the store the application reads. */
function holeCounts(rt: { stores: Record<string, { getState(): Map<string, unknown> }> }): number[] {
    return SLAB_IDS.map((id) => {
        const s = rt.stores['slab']!.getState().get(id) as { holes?: unknown[] } | undefined;
        return s?.holes?.length ?? 0;
    });
}

/**
 * The store map handed to `applyRingBufferSide`, restricted to the two keys this lane
 * owns. The other four (`wall`/`door`/`curtainwall`/`slab`) are adapted here by the
 * SAME `Store.applyPatch` the bus itself calls on execute — they are plugin-SDK stores
 * on the composed runtime, not the legacy `window.*Store` globals `adaptElementStoreMap`
 * exists for, so no adapter is needed to reach them in this harness.
 */
function undoMapFor(rt: { stores: Record<string, unknown> }) {
    const resolve = (): LiftUndoStores => ({
        lift: rt.stores['lift'] as LiftUndoStores['lift'],
        liftPart: rt.stores['liftPart'] as LiftUndoStores['liftPart'],
    });
    return {
        lift: liftCompoundUndoAdapter(resolve),
        liftPart: liftPartUndoAdapter(resolve),
        wall: rt.stores['wall'] as { applyPatch(p: never): unknown },
        door: rt.stores['door'] as { applyPatch(p: never): unknown },
        curtainwall: rt.stores['curtainwall'] as { applyPatch(p: never): unknown },
        slab: rt.stores['slab'] as { applyPatch(p: never): unknown },
    } as never;
}

beforeEach(() => __resetLiftRenderSinkForTests());
afterEach(() => __resetLiftRenderSinkForTests());

/**
 * `buildUndoStoreMap()` reads the legacy `window.*Store` globals at line 1 of its body,
 * and this suite runs in the Node environment. An EMPTY window is exactly the right
 * stand-in: it makes every LEGACY adapter resolve to nothing, so if the two lift keys
 * below are present it is because THIS lane's adapters put them there — not because a
 * global happened to be lying around. It is also the honest reading of the lazy
 * contract: the map is built with no stores in sight and must still report `lift` and
 * `liftPart` as covered.
 */
function withEmptyWindow<T>(fn: () => T): T {
    const g = globalThis as unknown as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    g.window = {};
    try { return fn(); }
    finally { if (had) g.window = prev; else delete g.window; }
}

describe('§LIFT94 — buildUndoStoreMap covers the lift compound (closes L-7311, L-7312)', () => {
    it('R-1: BOTH `lift` and `liftPart` have a working applyPatch adapter', () => {
        // ⭐ THIS IS THE ASSERTION THAT FAILED BEFORE THE FIX. `_covered()` is literally
        // `typeof map[s]?.applyPatch === 'function'` for every affected store, so these
        // two lines are the gate that declined the entire six-store entry.
        const map = withEmptyWindow(() => buildUndoStoreMap());
        expect(typeof map['lift']?.applyPatch, '`lift` has no undo adapter (L-7311)').toBe('function');
        expect(typeof map['liftPart']?.applyPatch, '`liftPart` has no undo adapter (L-7312)').toBe('function');
    });

    it('R-2: ⛔ THE ENTRY IS STILL ONE KEY SHORT — `door` — and this pins WHICH key', () => {
        // ⭐ MEASURED 2026-08-25, AND IT IS THE HALF THIS LANE COULD NOT CLOSE.
        //
        // `_covered()` is all-or-nothing over `lift.create`'s SIX affected stores.
        // Closing `lift` and `liftPart` removes two of the three gaps. The third is
        // `door`, and it is ABSENT ON PURPOSE (performUndoRedo.ts:447, :529): a HOSTED
        // door's undo must also close the host wall's opening, and that two-part
        // inverse lives in the legacy `CreateWallOpeningCommand`, not in a patch.
        //
        // ⚠ BUT THE LIFT'S LANDING DOORS ARE NOT HOSTED-SHAPED. `CreateLift.ts:390-394`
        // writes WHOLE door records into the door store and punches no wall opening at
        // all, so their inverse is a plain whole-record delete — exactly what
        // `adaptElementStoreMap` produces. The generic `door` row is therefore safe for
        // the lift and unsafe for `door.create`, which is a decision about GENERIC undo
        // machinery: it belongs to the lane that owns `buildUndoStoreMap`'s structure,
        // not to this one. Reported as a coordination item, not edited here.
        //
        // ⛔ THIS TEST IS A CANARY, NOT A CELEBRATION. It asserts the gap still EXISTS.
        // When `door` is adapted, this test FAILS — and that failure is the signal to
        // delete it and assert full six-store coverage instead. A gap that closes
        // silently is how a stale "REACHABLE AND STRANDED" row survives for two months.
        const map = withEmptyWindow(() => buildUndoStoreMap());

        expect(typeof map['lift']?.applyPatch, 'lift — closed by §LIFT94').toBe('function');
        expect(typeof map['liftPart']?.applyPatch, 'liftPart — closed by §LIFT94').toBe('function');
        expect(
            map['door']?.applyPatch,
            'if `door` now HAS an adapter, the lift undo entry is fully covered — ' +
            'delete this canary and assert all six keys instead (L-11341)',
        ).toBeUndefined();
    });
});

describe('§LIFT94 — undo/redo round-trip through the real bus and the real stores', () => {
    it('R-3: Ctrl+Z removes the compound, its cabin parts AND heals every slab void', async () => {
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        expect(holeCounts(rt as never), 'plates start whole').toEqual([0, 0, 0]);

        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        expect(rt.stores.lift.getState().get(LIFT_ID), 'the compound was created').toBeDefined();
        for (const id of CABIN_PART_IDS) {
            expect(rt.stores.liftPart.getState().get(id), `cabin part ${id}`).toBeDefined();
        }
        // Item 8's model half: the shaft pierced EVERY plate in its span, not just one.
        expect(holeCounts(rt as never), 'one void per penetrated plate').toEqual([1, 1, 1]);

        // `current()` names the pending entry (and its affectedStores); `undoPatch()`
        // then hands back its INVERSE side and steps the cursor — the exact two-call
        // idiom `performUndo()` uses at performUndoRedo.ts:779-784.
        const pair = rb.current()!;
        expect(pair, 'lift.create minted a real PatchPair').toBeTruthy();
        expect(pair.affectedStores).toEqual(
            expect.arrayContaining(['lift', 'liftPart', 'wall', 'curtainwall', 'door', 'slab']),
        );
        const side = rb.undoPatch()!;
        const outcome = applyRingBufferSide(side, pair.affectedStores!, undoMapFor(rt as never));

        expect(outcome.failed, 'no store failed to apply the inverse').toEqual([]);
        expect(outcome.applied).toEqual(expect.arrayContaining(['lift', 'liftPart']));

        // ⭐ THE FOUNDER'S ASSERTION, not a function's return value.
        expect(rt.stores.lift.getState().get(LIFT_ID), 'the lift is GONE after undo').toBeUndefined();
        for (const id of CABIN_PART_IDS) {
            expect(rt.stores.liftPart.getState().get(id), `cabin part ${id} is gone`).toBeUndefined();
        }
        // ⭐ AND NO PLATE IS LEFT WITH A FULL-HEIGHT HOLE IN IT. An un-healed lift void
        // is strictly worse than an un-deleted lift: the shaft is invisible and the
        // floor still has three holes through it.
        expect(holeCounts(rt as never), 'every plate is whole again').toEqual([0, 0, 0]);
    });

    it('R-4: redo restores the compound, the parts and all three voids', async () => {
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);
        const map = undoMapFor(rt as never);
        const stores = rb.current()!.affectedStores!;

        applyRingBufferSide(rb.undoPatch()!, stores, map);
        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();

        const outcome = applyRingBufferSide(rb.redoPatch()!, stores, map);

        expect(outcome.failed).toEqual([]);
        expect(rt.stores.lift.getState().get(LIFT_ID), 'the lift is BACK after redo').toBeDefined();
        for (const id of CABIN_PART_IDS) {
            expect(rt.stores.liftPart.getState().get(id), `cabin part ${id} is back`).toBeDefined();
        }
        expect(holeCounts(rt as never), 'the three voids are re-punched').toEqual([1, 1, 1]);
    });

    it('R-5: undo→redo→undo is STABLE — the second undo is not a half-revert', async () => {
        // §L-4101's amplifier in miniature: a revert that mints a forward cascade leaves
        // the second pass reverting the wrong "before". The lift's stores are pure DTO
        // stores with no cascade services attached, and this pins that it stays so.
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);
        const map = undoMapFor(rt as never);
        const stores = rb.current()!.affectedStores!;

        applyRingBufferSide(rb.undoPatch()!, stores, map);
        applyRingBufferSide(rb.redoPatch()!, stores, map);
        applyRingBufferSide(rb.undoPatch()!, stores, map);

        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();
        expect(rt.stores.liftPart.getState().size, 'no orphan cabin parts survive').toBe(0);
        expect(holeCounts(rt as never), 'plates whole after the second undo too').toEqual([0, 0, 0]);
    });
});

describe('§LIFT94 — the render half reaches the SAME builder the bus bridge drives', () => {
    it('R-6: an undo that removes the compound calls removeLift, not updateLift', async () => {
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        const removed: string[] = [];
        const updated: LiftRenderInputLike[] = [];
        registerLiftRenderSink({
            update: (i) => { updated.push(i); },
            remove: (id) => { removed.push(id); },
        });

        const stores = rb.current()!.affectedStores!;
        applyRingBufferSide(rb.undoPatch()!, stores, undoMapFor(rt as never));
        // Drive the SAME function the microtask queue calls — no re-implementation.
        flushLiftRender([LIFT_ID], () => ({
            lift: rt.stores.lift as never,
            liftPart: rt.stores.liftPart as never,
        }));

        expect(removed, 'the group is torn down on undo').toEqual([LIFT_ID]);
        expect(updated, 'nothing is redrawn for a record that no longer exists').toEqual([]);
    });

    it('R-7: a redo redraws the compound with ALL its parts, not an empty shaft', async () => {
        // ⭐ THE ORDERING BUG THE DEFERRED FLUSH EXISTS FOR. `applyRingBufferSide` walks
        // affectedStores in declaration order — `lift` BEFORE `liftPart` — so a render
        // fired inside the `lift` adapter would see zero parts and draw a bare shaft.
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);
        const map = undoMapFor(rt as never);
        const stores = rb.current()!.affectedStores!;
        applyRingBufferSide(rb.undoPatch()!, stores, map);

        const updated: LiftRenderInputLike[] = [];
        registerLiftRenderSink({ update: (i) => { updated.push(i); }, remove: () => {} });

        applyRingBufferSide(rb.redoPatch()!, stores, map);
        flushLiftRender([LIFT_ID], () => ({
            lift: rt.stores.lift as never,
            liftPart: rt.stores.liftPart as never,
        }));

        expect(updated.length, 'the compound is redrawn exactly ONCE for one gesture').toBe(1);
        expect(updated[0]!.id).toBe(LIFT_ID);
        expect(updated[0]!.parts.length, 'redrawn with its parts, not empty').toBeGreaterThanOrEqual(
            CABIN_PART_IDS.length,
        );
    });

    it('R-8: an absent render sink does NOT fail the undo — the model still reverts', async () => {
        // The honest split: a missing RENDERER must not fail an undo (headless, tests,
        // server bundle); a missing STORE must, and does, via a named throw.
        const rt = await bootWithLift();
        const rb = attachRingBuffer(rt as never);
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);
        const stores = rb.current()!.affectedStores!;
        const outcome = applyRingBufferSide(rb.undoPatch()!, stores, undoMapFor(rt as never));
        expect(outcome.failed).toEqual([]);
        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();
    });

    it('R-9: an unreachable store FAILS LOUDLY — it is never a silent no-op (L-980)', () => {
        const adapter = liftCompoundUndoAdapter(() => null);
        expect(() => adapter.applyPatch([])).toThrow(/runtime\.stores\.lift is not reachable/);
    });
});
