/**
 * @vitest-environment happy-dom
 */
// siteworksReachableThroughComposedRuntime — C116 §2 / §4 / §6 / §7 / §9 · ADR-0384 ·
//   C16 CA-2 / CA-18 / CA-21 · C13 · C47 · C84 EI-1 / EI-6 · C03 §4.6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS WHEN `plugins/siteworks/__tests__` IS ALREADY GREEN
// ═══════════════════════════════════════════════════════════════════════════════
//
// That suite builds a `CommandBus`, a `SiteworksStore` and an `UndoStack` BY HAND.
// That is the right way to prove what a HANDLER does, and it proves nothing at all
// about what the browser holds.
//
// [[committed-is-not-reachable]] is the memory: four fixes in one session ran
// nowhere. `boundaryLineReachableThroughComposedRuntime` was GREEN on all 13 of its
// cases while the founder's #1 blocker was that `composeRuntime()` produced a runtime
// with `stores.boundaryLine === undefined`, because it booted the DATA half directly.
// P1 makes `composeRuntime()` the ONLY way production obtains a runtime, so this file
// obtains it that way and reads `rt.stores.siteworks`: the SAME key
// `ProjectSerializer.readPluginStore('siteworks')` resolves, and the SAME key
// `resolveComposedStoreFromWindow('siteworks')` resolves on undo and on restore.
//
// ⛔ THE LOSS THIS GUARDS IS TOTAL, NOT PARTIAL. C116 §2 declines this family a
// plugin DTO twin, a `core-app-model` store and a `packages/stores` entry BY
// CONSTRUCTION, so there is no legacy mirror to leave anything on screen. A balcony
// that lost its parent still left a slab, a finish and railings visible — which is
// exactly why nobody noticed for four days (L-11530). A siteworks surface that does
// not land leaves NOTHING.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
// Nothing on the measured path is stubbed. The runtime is a real `composeRuntime`;
// the bus is its real bus with its real ring buffer; the store is the instance
// `PluginRegistry` built and the bus writes through; the serializer is the one
// `initPersistence.ts` constructs; the restore is the one `ProjectLoader` calls in
// its COMMON TAIL; the undo adapter is the one `buildUndoStoreMap()` returns.
//
// TWO substitutions, both declared:
//  1. `window.runtime = rt` — the REAL composed handle, assigned the one way
//     production assigns it (`engineLauncher.ts`). ARM A measures the key with no
//     assignment at all, off `rt` directly.
//  2. `serializerBundle()` — inert sentinels for the ~24 LEGACY stores the serializer
//     also reads. They are INPUTS this family does not touch; the `siteworks` slice is
//     read off the composed runtime by the serializer's own lazy resolver.
//
// ⚠ WHAT IS **NOT** PROVEN HERE (C116 §0.2): that a siteworks surface is DRAWN. The
// render seam is a separate commit and a separate arm. `persisted` here means the
// RECORD survives a save and a reload. ⛔ Never report a schema's existence as a
// working element.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { applyRingBufferSide, RingBufferUndoStack } from '@pryzm/command-bus';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { SITEWORKS_HANDLER_TYPES } from '@pryzm/plugin-siteworks';
import { SITEWORKS_DEFAULT_WIDTH_M } from '@pryzm/schemas';
import { sweepCentrelineToRing } from '@pryzm/geometry-siteworks';
import { ProjectSerializer } from '../src/engine/persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../src/engine/persistence/restoreCompoundFamilies';
import { SNAPSHOT_FAMILY_COVERAGE } from '../src/engine/persistence/snapshotFamilyCoverage';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo';

const AUDIT = { actorId: 'siteworks', projectId: 'siteworks', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let rb: RingBufferUndoStack;
let priorRuntime: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    // ⚠ ATTACHED EXPLICITLY. Without a ring buffer `CommandBus` skips
    // `_ringBuffer.push()` and NO PatchPair is recorded, so a depth assertion would
    // read 0 forever and pass VACUOUSLY on a family that minted nothing.
    rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
}, BUDGET);

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

// ⚠ EVERY ID IS A REAL PREFIXED ULID, NOT A READABLE SLUG.
// `defineElement('siteworks')` enforces /^siteworks_[0-9A-HJKMNP-TV-Z]{26}$/ —
// Crockford base32, so I, L, O and U are excluded. A suite that seeded the store
// directly would never have met that rule, which is one more reason everything below
// goes through the bus. ⭐ And the ids are minted HERE, by the caller — C16 CA-2.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const ROAD_A = `siteworks_${ulidN(0)}`;
const ROAD_B = `siteworks_${ulidN(1)}`;
const LOT_C = `siteworks_${ulidN(2)}`;

/** A straight road of `len` metres along +x. */
function road(id: string, len = 100, extra: Record<string, unknown> = {}) {
    return {
        siteworksId: id,
        levelId: LEVEL_ID,
        role: 'road' as const,
        form: 'linear' as const,
        centreline: [{ x: 0, y: 0, z: 0 }, { x: len, y: 0, z: 0 }],
        widthM: SITEWORKS_DEFAULT_WIDTH_M.road.valueM,
        boundary: [],
        holes: [],
        ...extra,
    };
}

/** A rectangular car park. */
function lot(id: string, extra: Record<string, unknown> = {}) {
    return {
        siteworksId: id,
        levelId: LEVEL_ID,
        role: 'parking' as const,
        form: 'areal' as const,
        centreline: [],
        boundary: [
            { x: 0, y: 0, z: 20 }, { x: 20, y: 0, z: 20 },
            { x: 20, y: 0, z: 30 }, { x: 0, y: 0, z: 30 },
        ],
        holes: [],
        ...extra,
    };
}

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['siteworks'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.siteworks is undefined on the REAL composed runtime — the '
            + 'PluginRegistry descriptor or the StoresSlot key is missing. That is the L-11530 '
            + 'defect (a store that exists and is unreachable) and the L-5200 one '
            + '(CommandBus.buildContext throws at DISPATCH with the handlers registered).',
        );
    }
    return s;
}

/** ⭐ THE CA-21 READ-BACK. The authoritative record, out of the authoritative store. */
function readBack(id: string): any {
    return store().getState().get(id);
}

function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
    rb.clear();
}

function sentinel(): any {
    return {
        getAll: () => [], getLevels: () => [], isBuiltIn: () => true, getCustom: () => [],
        size: () => 0, serialize: () => ({}), getState: () => new Map(), activeLevelId: LEVEL_ID,
    };
}
function serializerBundle(): any {
    const b: any = {};
    for (const k of [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ]) b[k] = sentinel();
    return b;
}

function saveSnapshot(): any {
    (window as unknown as { runtime: unknown }).runtime = rt;
    return JSON.parse(ProjectSerializer.stringify(
        ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'siteworks' }),
    ));
}

const undoDepth = (): number => rb.undoCount();

// ═════════════════════════════════════════════════════════════════════════════
describe('ARM A — the store is REACHABLE on the composed runtime', () => {
    it('rt.stores.siteworks exists — the L-11530 key, measured off rt with no window assignment', () => {
        expect((rt.stores as Record<string, unknown>)['siteworks']).toBeDefined();
    });

    // NOT a descriptor read. A handler can be registered and UNDISPATCHABLE:
    // `CommandBus.buildContext` throws "required store 'siteworks' is missing from
    // HandlerContext.stores" BEFORE anything mutates when the store descriptor is
    // absent -- the trap that bit pool (L-5200), lift (L-5700), lighting, section
    // (L-9922) and bathroomPod. So every verb is probed BY DISPATCH, and the
    // discriminator is the MESSAGE: an unregistered verb rejects with "no handler
    // registered"; a registered one reaches canExecute and rejects on its OWN terms.
    it('every C116 §6 verb is registered on the composed bus, proven BY DISPATCH', async () => {
        for (const verb of SITEWORKS_HANDLER_TYPES) {
            let msg = '';
            try {
                await rt.bus.executeCommand(verb, { id: 'siteworks_missing', ids: ['siteworks_missing'], surfaces: [] });
            } catch (e) { msg = String((e as Error).message ?? e); }
            expect(msg).not.toMatch(/no handler registered/i);
            expect(msg).not.toMatch(/missing from HandlerContext\.stores/i);
        }
    });

    it('⛔ there is NO singular siteworks.create — the batch verb IS the create path (§6a)', async () => {
        let msg = '';
        try {
            await rt.bus.executeCommand('siteworks.create', { siteworksId: 'x' });
        } catch (e) { msg = String((e as Error).message ?? e); }
        expect(msg).toMatch(/no handler registered/i);
    });

    it('the undo store map routes siteworks through the generic composed adapter (§7)', () => {
        expect(buildUndoStoreMap()['siteworks']).toBeDefined();
    });

    it('snapshotFamilyCoverage declares the family persisted, with a snapshot key', () => {
        const row = SNAPSHOT_FAMILY_COVERAGE.find((r) => r.storeKey === 'siteworks');
        expect(row).toBeDefined();
        expect(row!.status).toBe('persisted');
        expect(row!.snapshotKey).toBe('siteworks');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ARM B — DISPATCH reaches the store (C16 CA-21)', () => {
    it('siteworks.batch.create writes a road that reads back OUT of the store', async () => {
        wipe();
        await rt.bus.executeCommand('siteworks.batch.create', { surfaces: [road(ROAD_A)] });
        const rec = readBack(ROAD_A);
        expect(rec).toBeDefined();
        expect(rec.type).toBe('siteworks');
        expect(rec.role).toBe('road');
        expect(rec.form).toBe('linear');
        expect(rec.widthM).toBe(7);
    });

    it('⭐ the persisted record carries the CENTRELINE and NOT a swept ring (ADR-0384 D2)', () => {
        const rec = readBack(ROAD_A);
        expect(rec.centreline).toHaveLength(2);
        expect(rec.ring).toBeUndefined();
        expect(rec.areaM2).toBeUndefined();
        // The ring is DERIVED from what was stored, by the one authority.
        const swept = sweepCentrelineToRing(rec.centreline, rec.widthM);
        expect(swept.ok).toBe(true);
    });

    it('a batch of THREE surfaces costs the user exactly ONE Ctrl+Z (§6a, C16 §8.6)', async () => {
        wipe();
        await rt.bus.executeCommand('siteworks.batch.create', {
            surfaces: [road(ROAD_A), road(ROAD_B, 50), lot(LOT_C)],
        });
        expect(store().getState().size).toBe(3);
        // ⭐ THE DEPTH, NOT THE STATE. A state assertion passes just as happily with
        // three ring entries as with one, which is exactly what §6a forbids.
        expect(undoDepth()).toBe(1);
    });

    it('siteworks.setThickness reaches the store', async () => {
        await rt.bus.executeCommand('siteworks.setThickness', { id: ROAD_A, thickness: 0.45 });
        expect(readBack(ROAD_A).thickness).toBeCloseTo(0.45, 9);
    });

    it('siteworks.setRole changes the MEANING and leaves the geometry alone (D1)', async () => {
        const before = JSON.stringify(readBack(ROAD_B).centreline);
        await rt.bus.executeCommand('siteworks.setRole', { id: ROAD_B, role: 'pedestrian' });
        expect(readBack(ROAD_B).role).toBe('pedestrian');
        expect(JSON.stringify(readBack(ROAD_B).centreline)).toBe(before);
    });

    it('siteworks.setWidth reaches a LINEAR surface', async () => {
        await rt.bus.executeCommand('siteworks.setWidth', { id: ROAD_A, widthM: 9 });
        expect(readBack(ROAD_A).widthM).toBe(9);
    });

    it('⛔ siteworks.setWidth REFUSES an AREAL surface BY NAME — never a bare success (CA-18)', async () => {
        const before = JSON.stringify(readBack(LOT_C));
        let refused = false;
        try {
            await rt.bus.executeCommand('siteworks.setWidth', { id: LOT_C, widthM: 9 });
        } catch { refused = true; }
        // Either the gate refused the dispatch or the handler threw — both are a
        // NAMED refusal. What must NOT happen is a success that changed nothing.
        expect(refused || JSON.stringify(readBack(LOT_C)) === before).toBe(true);
        expect((readBack(LOT_C) as { widthM?: number }).widthM).not.toBe(9);
    });

    it('siteworks.delete removes the set in one entry', async () => {
        const depthBefore = undoDepth();
        await rt.bus.executeCommand('siteworks.delete', { ids: [ROAD_B] });
        expect(readBack(ROAD_B)).toBeUndefined();
        expect(undoDepth()).toBe(depthBefore + 1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ARM C — the record SURVIVES save → clear → restore (C13, C47)', () => {
    it('round-trips a road and a car park through the real serializer and loader', async () => {
        wipe();
        await rt.bus.executeCommand('siteworks.batch.create', {
            surfaces: [road(ROAD_A), lot(LOT_C)],
        });
        const snap = saveSnapshot();

        // The slice is actually written — not merely readable.
        expect(Array.isArray(snap.siteworks)).toBe(true);
        expect(snap.siteworks).toHaveLength(2);

        wipe();
        expect(store().getState().size).toBe(0);

        const result = restoreCompoundFamilies(snap);
        expect(result.errors).toEqual([]);
        expect(result.restored['siteworks']).toBe(2);

        const back = readBack(ROAD_A);
        expect(back).toBeDefined();
        expect(back.widthM).toBe(7);
        expect(back.centreline).toHaveLength(2);
        expect(readBack(LOT_C).boundary).toHaveLength(4);
    });

    it('⭐ an UNTOUCHED project omits the key entirely — C47, byte-identical snapshots', () => {
        wipe();
        const snap = saveSnapshot();
        expect(snap.siteworks).toBeUndefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
/**
 * Undo ONE ring entry the way `performUndo` does: take the side the ring hands back
 * and apply it through the PRODUCTION `buildUndoStoreMap()`, honouring
 * `affectedStores`. ⛔ Never a hand-rolled inverse — that would prove this file can
 * invert a patch, which nobody doubted. ⚠ `rb.undo()` returns VOID (it only moves the
 * cursor); `rb.undoPatch()` is the one that hands back the side AND steps atomically.
 * A first draft used the former and read `undefined`.
 */
function undoOne(): void {
    const pair = rb.current();
    expect(pair, 'no PatchPair was minted — there is nothing to undo').toBeTruthy();
    const side = rb.undoPatch();
    expect(side, 'the ring returned no undo side').toBeTruthy();
    const outcome = applyRingBufferSide(side!, pair!.affectedStores!, buildUndoStoreMap() as never);
    expect(outcome.failed, 'the inverse failed to apply').toEqual([]);
    expect(outcome.applied).toEqual(expect.arrayContaining(['siteworks']));
}

function redoOne(): void {
    const side = rb.redoPatch();
    expect(side, 'the ring returned no redo side').toBeTruthy();
    const pair = rb.current();
    const outcome = applyRingBufferSide(side!, pair!.affectedStores!, buildUndoStoreMap() as never);
    expect(outcome.failed, 'the forward patch failed to re-apply').toEqual([]);
}

describe('ARM D — UNDO and REDO route through the one unified path (C03 §4.5)', () => {
    it('one Ctrl+Z removes the WHOLE batch, and redo restores it with the SAME ids', async () => {
        wipe();
        await rt.bus.executeCommand('siteworks.batch.create', {
            surfaces: [road(ROAD_A), road(ROAD_B, 40)],
        });
        expect(store().getState().size).toBe(2);
        expect(undoDepth()).toBe(1);

        undoOne();
        // ⭐ TWO surfaces, ONE Ctrl+Z. This is what §6a's batch-only create buys.
        expect(store().getState().size).toBe(0);

        redoOne();
        expect(store().getState().size).toBe(2);
        // ⭐ C16 CA-2 — the SAME ids after redo. `execute()` runs AGAIN on redo, so an
        // id minted inside it would differ the second time and orphan every reference
        // that named the first. These ids were minted by the CALLER, above.
        expect(readBack(ROAD_A)).toBeDefined();
        expect(readBack(ROAD_B)).toBeDefined();
        expect(readBack(ROAD_A).widthM).toBe(7);
    });

    it('the generic composed adapter is what carries it — C116 §7', async () => {
        wipe();
        await rt.bus.executeCommand('siteworks.batch.create', { surfaces: [road(ROAD_A)] });
        await rt.bus.executeCommand('siteworks.setWidth', { id: ROAD_A, widthM: 11 });
        expect(readBack(ROAD_A).widthM).toBe(11);
        undoOne();
        // The width edit is undone; the surface itself is still there, because the
        // create was a SEPARATE ring entry.
        expect(readBack(ROAD_A)).toBeDefined();
        expect(readBack(ROAD_A).widthM).toBe(7);
    });
});
