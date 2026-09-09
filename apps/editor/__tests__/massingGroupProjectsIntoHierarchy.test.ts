/**
 * @vitest-environment happy-dom
 */
// ADR-0385 §2 point 1 — THE FOUNDER'S GESTURE, MEASURED FROM THE REAL CREATE PATH.
//
// ADR-0385 · ADR-0383 D1 / D3 · ADR-0328 · C114 §6a · C16 CA-21 · C84 EI-9 ·
// [[committed-is-not-reachable]].
//
// ══════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE ESTABLISHES THAT THE UNIT SUITES CANNOT
// ══════════════════════════════════════════════════════════════════════════════════
// `packages/core-app-model/src/hierarchy/MassingGroupProjection.test.ts` proves what
// the projection DOES, against hand-built envelope records. That is the right way to
// prove a rule and it proves nothing about whether the rule ever runs.
//
// [[committed-is-not-reachable]] is the memory: four fixes in one session ran nowhere.
// So this file:
//
//   1. obtains a runtime the ONE way production does — `composeRuntime()` (P1);
//   2. authors THREE blocks through the REAL create verb,
//      `spaceEnvelope.batch.create`, on that runtime's real bus with its real ring
//      buffer — the same verb the site panel dispatches;
//   3. lets the REAL subscription (`attachMassingGroupHierarchy`, installed exactly as
//      `initTools.ts` installs it) do the projection — nothing in the measured path is
//      called by hand;
//   4. reads the answer back through `buildProjectTreeModel`, which is the function
//      the INSPECT TREE renders from and the same `buildBuildingRoster` the IFC
//      exporter calls (C84 EI-9);
//   5. counts the ring buffer, which is the number of Ctrl+Z presses the gesture cost.
//
// ⚠ STUB LEDGER. The runtime is a real `composeRuntime`; the bus is its real bus; the
// store is the instance `PluginRegistry` built and the bus writes through; the ring is
// the `RingBufferUndoStack` production installs; the undo is
// `applyRingBufferSide` + the production `buildUndoStoreMap()`. TWO substitutions,
// both declared:
//   1. the hierarchy store is a FRESH `HierarchyStore`, injected — never the
//      `@pryzm/core-app-model` singleton. Not a weakening: it is the same class the
//      singleton is an instance of, and injecting it stops this file leaking projected
//      rows into every other suite in the worker.
//   2. `window.runtime = rt` — the REAL composed handle, assigned the one way
//      production assigns it.
//
// ⚠ WHAT IS NOT PROVEN HERE: that the emitted IFC FILE contains three `IfcBuilding`
// entities. That needs `web-ifc`, which is a dependency of `packages/file-format` and
// not of this app, so it is measured in
// `packages/file-format/__tests__/massing-group-emits-n-buildings.test.ts` — on the
// STEP text, through the real writers. The two files MEET on
// `readMassingGroupSubstrate` + `applyMassingGroupProjection`, so there is no
// unmeasured seam between "the founder's gesture" and "the exported file".

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { applyRingBufferSide, RingBufferUndoStack } from '@pryzm/command-bus';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import {
    HierarchyStore,
    readBuildingSubstrate,
    DEFAULT_BUILDING_ID,
    DEFAULT_BUILDING_NAME,
} from '@pryzm/core-app-model';
import {
    attachMassingGroupHierarchy,
    type DirtyEnvelopeStore,
} from '../src/engine/attachMassingGroupHierarchy';
import { buildProjectTreeModel } from '../src/ui/inspect/audit/projectTreeModel';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIT = { actorId: 'mp-projection', projectId: 'mp-projection', clientId: 'node' } as const;
const BUDGET = 600_000;
const LEVELS = ['L1', 'L2'] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let rb: RingBufferUndoStack;
let hs: HierarchyStore;
let detach: (() => void) | null = null;
let priorRuntime: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { runtime: unknown }).runtime = rt;
    rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
}, BUDGET);

afterAll(() => {
    try { detach?.(); } catch { /* non-fatal */ }
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

// ⚠ Real prefixed ULIDs — `defineElement('spaceEnvelope')` enforces
// /^spaceEnvelope_[0-9A-HJKMNP-TV-Z]{26}$/ (Crockford base32: no I, L, O, U). A suite
// that seeded the store directly would never have met that rule, which is one more
// reason everything below goes through the bus.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return `spaceEnvelope_${ULID_STEM}${A[Math.floor(n / 32) % 32]}${A[n % 32]}`;
}

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function envelopeStore(): DirtyEnvelopeStore {
    const s = (rt.stores as Record<string, unknown>)['spaceEnvelope'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.spaceEnvelope is undefined on the REAL composed runtime — ' +
            'the massing-group projection has nothing to subscribe and every block will export ' +
            'as the single default building (the L-11530 shape: a store that exists and is ' +
            'unreachable).',
        );
    }
    return s as DirtyEnvelopeStore;
}

/** A 6 × 6 m square at (x0, 0), OPEN (the closing vertex is implied). */
function square(x0: number) {
    return [
        { x: x0, y: 0, z: 0 },
        { x: x0 + 6, y: 0, z: 0 },
        { x: x0 + 6, y: 0, z: 6 },
        { x: x0, y: 0, z: 6 },
    ];
}

/**
 * ⭐ THE FOUNDER'S GESTURE: three profiles, two storeys each, ONE dispatch.
 *
 * *"define multiple profiles first — i need to decide how many — then define the
 * levels and create bulk all the envelopes for all the profiles."* — 2026-09-09.
 *
 * ⛔ All three blocks sit on the SAME project storeys (L1, L2), because that is what
 * `masterPlanAuthoringPlan` produces: every profile is handed the same
 * `levels: AdoptLevelCandidate[]`. It is the shape that used to collapse to one
 * building, so it is the shape this file measures.
 */
const BLOCKS = [
    { gid: 'mg-a', label: 'Block A', x: 0 },
    { gid: 'mg-b', label: 'Block B', x: 20 },
    { gid: 'mg-c', label: 'Block C', x: 40 },
] as const;

function threeBlockBatch() {
    const envelopes: Record<string, unknown>[] = [];
    let n = 0;
    for (const b of BLOCKS) {
        for (const [i, levelId] of LEVELS.entries()) {
            envelopes.push({
                spaceEnvelopeId: ulidN(n++),
                levelId,
                footprint: square(b.x),
                baseOffset: i * 3,
                height: 3,
                role: 'level',
                group: { id: b.gid, label: b.label },
            });
        }
    }
    return { envelopes };
}

function wipe(): void {
    const store = envelopeStore() as unknown as {
        getState(): ReadonlyMap<string, unknown>;
        applyPatch(p: unknown[]): unknown;
    };
    const ids = [...store.getState().keys()];
    if (ids.length > 0) store.applyPatch(ids.map((id) => ({ op: 'remove', path: [id] })));
    rb.clear();
}

/** Undo ONE ring entry the way `performUndo` does. ⛔ Never a hand-rolled inverse. */
function undoOne(): void {
    const pair = rb.current();
    expect(pair, 'no PatchPair was minted — the gesture cost NO Ctrl+Z at all').toBeTruthy();
    const side = rb.undoPatch();
    const outcome = applyRingBufferSide(side!, pair!.affectedStores!, buildUndoStoreMap() as never);
    expect(outcome.failed, 'the inverse failed to apply').toEqual([]);
}

/** The building rows the INSPECT TREE would render, off the projected hierarchy. */
function treeBuildings() {
    return buildProjectTreeModel([...LEVELS], '', readBuildingSubstrate(hs)).buildings;
}

// ═════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT
// ═════════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — three massing groups authored through the REAL create path become three buildings', () => {
    it('⭐⭐ ONE dispatch of `spaceEnvelope.batch.create` -> THREE buildings in the inspect tree, and ONE Ctrl+Z', async () => {
        hs = new HierarchyStore();

        // ── BEFORE. The state the founder was in, and the control that makes every
        // assertion below impossible to satisfy by accident: the fallback produces a
        // DIFFERENT CARDINALITY (1) and DIFFERENT NAMES ("Default Building").
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();
        expect(hs.getAll(), 'the projection must own nothing before anything is authored').toEqual([]);
        const before = treeBuildings();
        expect(before).toHaveLength(1);
        expect(before[0]!.buildingId).toBe(DEFAULT_BUILDING_ID);
        expect(before[0]!.name).toBe(DEFAULT_BUILDING_NAME);
        expect(before[0]!.kind).toBe('derived');

        // ── THE GESTURE. Six envelopes, three blocks, ONE dispatch.
        await rt.bus.executeCommand('spaceEnvelope.batch.create', threeBlockBatch());
        expect(envelopeStore().getState().size, 'six envelopes were authored').toBe(6);

        // ── ⭐ THE UNDO ARITHMETIC. C114 §6a: one gesture, one `produceCommand`, one
        // ring entry. The projection rides no command and mints no patch pair, so a
        // THREE-BLOCK GESTURE STILL COSTS EXACTLY ONE Ctrl+Z.
        expect(rb.undoCount(), '⭐ a three-block master plan costs ONE Ctrl+Z, not four').toBe(1);

        // ── ⭐ THE ANSWER, read at the layer the founder experiences. Nothing called
        // the projection here: the store's dirty channel did.
        const after = treeBuildings();
        expect(after).toHaveLength(3);
        expect(after.map((b) => b.name)).toEqual(['Block A', 'Block B', 'Block C']);
        for (const b of after) {
            expect(b.kind, 'a projected building is CARRIED, never the derived fallback').toBe('carried');
            expect(b.levels.map((l) => l.levelId)).toEqual([...LEVELS]);
        }

        // …and the containment AUTHORITY says so, not some second record.
        expect(hs.getBuildings().map((b) => b.name)).toEqual(['Block A', 'Block B', 'Block C']);
        expect(hs.getLevels()).toHaveLength(6);   // 3 blocks × 2 storeys
        expect(hs.getSites()).toHaveLength(1);
    }, BUDGET);

    it('⭐ ONE Ctrl+Z takes the buildings away with the envelopes — the projection follows undo', async () => {
        // ⛔ THE ARM THAT WOULD CATCH A BUS-EVENT SUBSCRIBER. `performUndoRedo` emits
        // NO bus events; it applies inverse patches straight to the stores. A
        // projection driven off events would leave three orphan `BuildingData` rows
        // here — a second source of truth, created by accident, that ADR-0328 forbids.
        hs = new HierarchyStore();
        detach?.();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();

        await rt.bus.executeCommand('spaceEnvelope.batch.create', threeBlockBatch());
        expect(hs.getBuildings()).toHaveLength(3);
        expect(rb.undoCount()).toBe(1);

        undoOne();

        expect(envelopeStore().getState().size, 'the envelopes are gone').toBe(0);
        expect(hs.getAll(), 'and so is every row the projection owned').toEqual([]);
        const back = treeBuildings();
        expect(back).toHaveLength(1);
        expect(back[0]!.buildingId).toBe(DEFAULT_BUILDING_ID);
    }, BUDGET);

    it('⛔ an UNGROUPED batch through the same path leaves the hierarchy empty (ADR-0383 D3)', async () => {
        hs = new HierarchyStore();
        detach?.();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();

        // No `group` key at all — the schema's own `.default(null)`, which is what
        // every project authored before ADR-0383 carries.
        await rt.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: LEVELS.map((levelId, i) => ({
                spaceEnvelopeId: ulidN(50 + i),
                levelId,
                footprint: square(0),
                baseOffset: i * 3,
                height: 3,
                role: 'level',
            })),
        });
        expect(envelopeStore().getState().size).toBe(2);
        expect(hs.getAll(), 'the projection must not touch an ungrouped project').toEqual([]);
        expect(treeBuildings()).toHaveLength(1);
    }, BUDGET);

    it('⛔ RENAMING a group through the real verb renames the building — it does not add a fourth', async () => {
        hs = new HierarchyStore();
        detach?.();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();

        await rt.bus.executeCommand('spaceEnvelope.batch.create', threeBlockBatch());
        expect(hs.getBuildings()).toHaveLength(3);

        await rt.bus.executeCommand('spaceEnvelope.group.rename', { groupId: 'mg-a', label: 'Podium' });

        expect(hs.getBuildings(), 'a rename is an UPDATE, never a second building').toHaveLength(3);
        expect(hs.getBuildings().map((b) => b.name).sort()).toEqual(['Block B', 'Block C', 'Podium']);
        expect(treeBuildings().map((b) => b.name).sort()).toEqual(['Block B', 'Block C', 'Podium']);
    }, BUDGET);

    it('⛔ DISSOLVING a group through the real verb reaps its building and keeps the others', async () => {
        hs = new HierarchyStore();
        detach?.();
        detach = attachMassingGroupHierarchy(envelopeStore(), { store: hs });
        wipe();

        await rt.bus.executeCommand('spaceEnvelope.batch.create', threeBlockBatch());
        await rt.bus.executeCommand('spaceEnvelope.group.dissolve', { groupId: 'mg-c' });

        // ⛔ `dissolve` DELETES NOTHING — the envelopes return to the ungrouped bucket.
        expect(envelopeStore().getState().size, 'no envelope was destroyed').toBe(6);
        expect(hs.getBuildings().map((b) => b.name)).toEqual(['Block A', 'Block B']);
    }, BUDGET);
});

// ═════════════════════════════════════════════════════════════════════════════════
// THE WIRING — [[committed-is-not-reachable]]
// ═════════════════════════════════════════════════════════════════════════════════

describe('ADR-0385 — the projection is actually INSTALLED, not merely installable', () => {
    const initTools = () =>
        readFileSync(join(__dirname, '..', 'src', 'engine', 'initTools.ts'), 'utf8');

    it('⛔ `initTools` calls `attachMassingGroupHierarchy` — the arm the whole feature hangs on', () => {
        // Every arm above injects its own store and installs the subscription itself,
        // so all of them would stay green with the production wiring deleted. That is
        // exactly the shape [[committed-is-not-reachable]] names, and this is the one
        // assertion that closes it.
        const src = initTools();
        expect(src).toContain('attachMassingGroupHierarchy(');
        expect(src).toContain("from './attachMassingGroupHierarchy.js'");
    });

    it('it is wired to the COMPOSED `spaceEnvelope` store, and says so loudly when it is absent', () => {
        // ⚠ THE ANCHOR IS THE CALL, NOT A COMMENT. The first draft of this arm sliced
        // from a doc-comment phrase, `indexOf` returned -1, `slice(-1)` handed back the
        // file's last newline, and the assertion failed against '\n'. It failed LOUDLY,
        // which is the only reason it is worth writing at all — but a sibling arm
        // anchored the same way could just as easily have matched something and passed
        // vacuously. Anchor on the thing whose absence is the defect.
        const src = initTools();
        const callIdx = src.lastIndexOf('attachMassingGroupHierarchy(');
        expect(callIdx, 'the CALL is absent — only the import survived').toBeGreaterThan(0);
        const block = src.slice(Math.max(0, callIdx - 1200), callIdx + 1600);

        expect(block, 'it must read the COMPOSED store, not a store of its own').toContain('stores?.spaceEnvelope');
        expect(block, 'it must subscribe the dirty channel, which covers undo/redo').toContain('subscribeDirty');
        // ⛔ NAMED, NEVER SILENT (C84 EI-6). Without this branch a boot that failed to
        // compose the store would export every block as one building with nothing
        // anywhere saying why.
        expect(block).toContain('UNREADABLE');
    });
});
