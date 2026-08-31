/**
 * §UNDO-C-FIX-2 (L-11520) — THE 47 STRANDED UNDO UNITS: 23 CLOSED, 7 REFUTED, 17
 * REFUSED BY NAME. MEASURED THROUGH THE REAL COMPOSITION ROOT, THE REAL BUS AND THE
 * REAL `buildUndoStoreMap()`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE MEASUREMENT THIS FILE ANSWERS
 * ═══════════════════════════════════════════════════════════════════════════════
 * `audit/full-stack/2026-08-31/commands/_ROLLUPS.json` → `UNDO_BACKENDS_over_all_361`:
 *
 *     A_ring_buffer_patch_pair_fully_covered: 157
 *     B_legacy_commandManager:                123
 *     STRANDED:                                47   ← this file
 *     NONE_or_UNKNOWN:                         34
 *
 * and its own definition of STRANDED: *"performUndo declines the ring entry, does
 * NOT step the cursor, and falls through to commandManager — which for these keys
 * owns nothing. Ctrl+Z is a no-op."*
 *
 * The 47 fall on TEN store keys, and they are NOT one population:
 *
 *   CLOSED — 23 verbs on FOUR keys: `balcony` (3), `structural` (7), `dimension` (7),
 *   `section` (6). Each has a live, writeable store on the composed runtime, so the
 *   gap was pure WIRING. S-3..S-5 and S-7 below dispatch each family through the real
 *   bus, apply the inverse the bus really minted through the real map, and read the
 *   record back out of the store the application reads.
 *
 *   ⭐ REFUTED — 7 verbs on `view`. The lane WIRED this key, and the executed run
 *   disproved the premise: all seven `view.*` handlers read
 *   `ctx.stores.view.getState()` while `bootstrap.ts:94` supplies
 *   `storesAsRecordView(stores)`, so `view.create` throws at `canExecute` and NO ring
 *   entry is ever minted. These verbs are not stranded-on-undo, they are
 *   UNDISPATCHABLE — a defect `PluginRegistry.ts:779-789` has recorded since W-1C-1
 *   and assigned to W-2A. The adapter was removed again. S-6 pins the TypeError.
 *
 *   REFUSED BY NAME — 17 verbs on five keys. `sheet` (10) and `schedule` (4) are
 *   plugin handler sets with ZERO production registration; `active-view` (1) is a
 *   pointer with no record; `cube` (1) is a dev demo; `projectOrigin` (1) returns
 *   `patches: []` so no ring entry is minted. All keep their
 *   `UNMAPPED_BUS_STORE_KEYS` row, each now carrying its measurement — a declared
 *   absence the user is TOLD about beats a unit that silently does nothing (C74 /
 *   CA-18, C03 §4.6 U-4). `undoStoreCoverageAndStrandedVisibility.test.ts` pins that
 *   set and the toast that names it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE USES THE **REAL** `buildUndoStoreMap()` AND NOT A HAND-BUILT ONE
 * ═══════════════════════════════════════════════════════════════════════════════
 * `liftUndoRoundTrip.test.ts` — the closest precedent — assembles its own store map
 * because two of the lift's six keys are legacy `window.*Store` globals it cannot
 * stand up headlessly. Three of the four families here declare EXACTLY ONE store, and
 * that store is on the composed runtime, so the production resolver
 * (`resolveComposedStoreFromWindow`, which reads `window.runtime.stores[key]`) can be
 * exercised for real by pointing `window.runtime` at the runtime this test booted.
 *
 * That closes the gap `fake-more-capable-than-real` warns about: a map built from the
 * adapter's declared needs cannot falsify the claim that `buildUndoStoreMap()` hands
 * `applyRingBufferSide` a working adapter. Here it IS `buildUndoStoreMap()`, and the
 * PatchPair IS the one the bus minted. `balcony` is the one family that additionally
 * needs its three MEMBER keys, which are legacy-global adapters — those are merged in
 * explicitly and the merge is named where it happens.
 *
 * ⚠ WHAT THIS FILE DOES NOT PROVE, STATED SO IT IS NOT MISTAKEN FOR PROOF. That a
 * mesh disappears. `CommandEventBridge.ts:1632` records `structural.created` and
 * `dimension.created` as DEAD CHANNELS (one emitter, zero subscribers) and there is no
 * `section.created` channel at all, so there is no event road for an undo to
 * re-drive; the families' readers hold the store and are woken by
 * `Store.applyPatch`'s own `subscribeDirty` notification, on execute, undo and redo
 * alike. Whether those readers are wired to a renderer is an AXIS-B question this lane
 * did not measure. The store reverting is the half that decides what persists, what
 * schedules, what exports and what comes back on reload — and it was measured broken.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { applyRingBufferSide, RingBufferUndoStack } from '@pryzm/command-bus';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// Branded ULIDs — Crockford base32, I/L/O/U excluded. `defineElement()` enforces the
// pattern, so a readable slug would be rejected before any store was touched.
const STRUCTURAL_ID = 'structural_01ARZ3NDEKTSV4RRFFQ69G5AA0';
const DIMENSION_ID = 'dimension_01ARZ3NDEKTSV4RRFFQ69G5AA1';
const BALCONY_ID = 'balcony_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SLAB_ID = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR_ID = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const RAIL_IDS = [
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB2',
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB3',
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB4',
];
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5FB6';

/** The §FEAT-BALCONY-COMPOUND fixture, kept identical to
 *  `balconyReachableThroughComposedRuntime.test.ts` so the two files disagree about
 *  nothing. 1.00 m along a 6 m façade × 0.50 m projection, placed 2 m along. */
const BALCONY_PAYLOAD = {
    balconyId: BALCONY_ID,
    levelId: 'level-1',
    boundary: [
        { x: 2, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 3, y: 0, z: 0.5 },
        { x: 2, y: 0, z: 0.5 },
    ],
    hostWallId: HOST_WALL,
    hostOffset: 2,
    hostSegment: { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } },
    slabId: SLAB_ID,
    floorId: FLOOR_ID,
    railingIds: RAIL_IDS,
};

const SECTION_PAYLOAD = {
    id: 'section-a',
    mark: 'A',
    line: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 },
};

const VIEW_ID = 'view-stranded-undo-probe';
const VIEW_PAYLOAD = {
    definition: {
        id: VIEW_ID,
        name: 'Stranded Undo Probe',
        kind: '3d-perspective',
        camera: {
            position: { x: 12, y: 12, z: 12 },
            target: { x: 0, y: 0, z: 0 },
            up: { x: 0, y: 1, z: 0 },
            fovDeg: 50,
        },
        renderMode: 'shaded-with-edges',
        levelFilter: null,
        elementKindFilter: null,
    },
};

type AnyRt = {
    stores: Record<string, { getState(): Map<string, unknown>; applyPatch(p: never): unknown }>;
    bus: {
        executeCommand(type: string, payload: unknown): Promise<unknown>;
        setRingBuffer(rb: RingBufferUndoStack): void;
    };
    tearDown?: () => void;
};

/**
 * ⚠ `bootstrapWithEverything` builds the plugin/store/handler half of the composition
 * root but attaches NO undo stack — in production `composeRuntime` does that. Without
 * one, `CommandBus` skips its `_ringBuffer.push()` entirely and no PatchPair is ever
 * recorded, so this must run BEFORE the command under test. Same class
 * `composeRuntime` installs. (Copied deliberately from `liftUndoRoundTrip.test.ts`;
 * a second spelling of this would be a second thing to get wrong.)
 */
function attachRingBuffer(rt: AnyRt): RingBufferUndoStack {
    const rb = new RingBufferUndoStack();
    rt.bus.setRingBuffer(rb);
    return rb;
}

/**
 * Point the PRODUCTION resolver at the runtime this test booted.
 *
 * ⭐ THIS IS THE POINT OF THE FILE. `resolveComposedStoreFromWindow` reads
 * `window.runtime.stores[key]` — the exact read the browser makes. Installing the real
 * runtime there means `buildUndoStoreMap()` below is the production map resolving
 * production stores, not a stand-in shaped like one.
 */
function installRuntimeOnWindow(rt: AnyRt): void {
    (globalThis as unknown as { window?: unknown }).window = { runtime: rt };
}

afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
});

async function boot(): Promise<AnyRt> {
    const rt = (await bootstrapWithEverything({ audit: AUDIT })) as unknown as AnyRt;
    installRuntimeOnWindow(rt);
    return rt;
}

/**
 * Run one family end to end: dispatch, read back, undo through the REAL map, read back
 * again. Returns nothing — every assertion is inside, so a family that silently stops
 * minting a PatchPair fails here rather than passing vacuously.
 */
async function roundTrip(
    rt: AnyRt,
    rb: RingBufferUndoStack,
    storeKey: string,
    verb: string,
    payload: unknown,
    id: string,
    extraMap: Record<string, unknown> = {},
): Promise<void> {
    await rt.bus.executeCommand(verb, payload);

    // [[committed-is-not-reachable]] — read the store the application reads, never the
    // handler's return value.
    expect(rt.stores[storeKey]!.getState().get(id), `${verb} did not reach rt.stores.${storeKey}`)
        .toBeDefined();

    const pair = rb.current()!;
    expect(pair, `${verb} minted no PatchPair — nothing to strand and nothing to fix`).toBeTruthy();
    expect(pair.affectedStores, `${verb} affectedStores`).toEqual(
        expect.arrayContaining([storeKey]),
    );

    const map = { ...buildUndoStoreMap(), ...extraMap } as never;

    // ⭐ THE ASSERTION THAT WAS FALSE BEFORE THIS LANE. `_covered()` in performUndoRedo
    // is literally `typeof map[s]?.applyPatch === 'function'` for EVERY affected store,
    // all-or-nothing. This line is that gate.
    for (const s of pair.affectedStores!) {
        expect(
            typeof (map as Record<string, { applyPatch?: unknown } | undefined>)[s]?.applyPatch,
            `store "${s}" has no undo adapter — the whole ${verb} entry is DECLINED and Ctrl+Z is a no-op`,
        ).toBe('function');
    }

    const side = rb.undoPatch()!;
    const outcome = applyRingBufferSide(side, pair.affectedStores!, map);

    expect(outcome.failed, `${verb} inverse failed to apply`).toEqual([]);
    expect(outcome.applied).toEqual(expect.arrayContaining([storeKey]));

    // ⭐ THE FOUNDER'S ASSERTION: after Ctrl+Z the thing is GONE from the authoritative
    // store — not "the function returned OK".
    expect(
        rt.stores[storeKey]!.getState().get(id),
        `${verb}: undo applied but the record is STILL in rt.stores.${storeKey}`,
    ).toBeUndefined();
}

describe('§UNDO-C-FIX-2 — buildUndoStoreMap covers the five reachable stranded families', () => {
    it('S-1: all four keys have a working applyPatch adapter in the REAL production map', async () => {
        const rt = await boot();
        const map = buildUndoStoreMap();
        for (const key of ['balcony', 'structural', 'dimension', 'section'] as const) {
            expect(
                typeof map[key]?.applyPatch,
                `${key} has no undo adapter — every verb declaring it is STRANDED`,
            ).toBe('function');
        }
        rt.tearDown?.();
    }, 120000);

    it('S-2: NEGATIVE CONTROL — the six REFUSED keys are still absent, by name', async () => {
        // ⛔ If any of these ever gains an adapter, that is a decision with a
        // measurement behind it, not a tidy-up. The refusal rows in
        // UNMAPPED_BUS_STORE_KEYS say why each is absent; this arm makes the absence a
        // pinned fact so nobody "completes the set" by symmetry. Without this control,
        // S-1 could be passed by a map that returns an adapter for every string.
        const rt = await boot();
        const map = buildUndoStoreMap();
        for (const key of ['sheet', 'schedule', 'view', 'active-view', 'cube', 'projectOrigin'] as const) {
            expect(
                map[key],
                `${key} gained an adapter — read its UNMAPPED_BUS_STORE_KEYS row first`,
            ).toBeUndefined();
        }
        rt.tearDown?.();
    }, 120000);
});

describe('§UNDO-C-FIX-2 — undo round-trips through the real bus, the real map and the real stores', () => {
    it('S-3: structural.create — Ctrl+Z removes the element from StructuralStore', async () => {
        const rt = await boot();
        const rb = attachRingBuffer(rt);
        await roundTrip(rt, rb, 'structural', 'structural.create', {
            id: STRUCTURAL_ID,
            levelId: 'level-1',
            kind: 'brace',
            origin: { x: 0, y: 0, z: 0 },
            endOffset: { x: 2, y: 0, z: 0 },
        }, STRUCTURAL_ID);
        rt.tearDown?.();
    }, 120000);

    it('S-4: dimension.create — Ctrl+Z removes the dimension from DimensionStore', async () => {
        const rt = await boot();
        const rb = attachRingBuffer(rt);
        await roundTrip(rt, rb, 'dimension', 'dimension.create', {
            id: DIMENSION_ID,
            levelId: 'level-1',
            kind: 'linear',
            points: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        }, DIMENSION_ID);
        rt.tearDown?.();
    }, 120000);

    it('S-5: section.create — Ctrl+Z removes the section from SectionStore', async () => {
        const rt = await boot();
        const rb = attachRingBuffer(rt);
        await roundTrip(rt, rb, 'section', 'section.create', SECTION_PAYLOAD, SECTION_PAYLOAD.id);
        rt.tearDown?.();
    }, 120000);

    // ⭐⭐ S-6 IS THE LANE'S REFUTATION, AND IT IS A SUCCESS MODE, NOT A SHORTFALL.
    //
    // This arm STARTED LIFE as `view.create — Ctrl+Z removes the definition from the
    // ViewRegistry`, and the adapter was written and wired. Every static signal said GO:
    // `runtime.stores.view` is a live `ViewRegistry`, it extends `Store<ViewDefinition>`,
    // it has a working `applyPatch`, and the audit listed 7 `view.*` verbs as STRANDED.
    // The executed run then failed BEFORE the undo, at DISPATCH, with the TypeError
    // asserted below.
    //
    // The 7 verbs are not stranded-on-undo; they are UNDISPATCHABLE, and
    // `PluginRegistry.ts:779-789` has said so in writing since W-1C-1. Wiring the undo
    // adapter would have moved 7 rows out of the audit's STRANDED column while Ctrl+Z
    // stayed exactly as dead — a reported fix with no consequence.
    //
    // ⛔ THIS ARM ASSERTS THE DEFECT, SO IT IS A CANARY. When W-2A gives the bus a
    // storesProvider that passes store INSTANCES, this test goes RED — and that failure
    // is the signal to wire `composedStoreUndoAdapter('view', ...)` in
    // `buildUndoStoreMap()`, delete the `view` row from `UNMAPPED_BUS_STORE_KEYS`, add
    // `view` to S-1, remove it from S-2, and replace this arm with the round trip it
    // was born as. All five moves belong in ONE commit.
    it('S-6: REFUTED — view.create cannot mint a ring entry at all (it throws at canExecute)', async () => {
        const rt = await boot();
        const rb = attachRingBuffer(rt);

        await expect(rt.bus.executeCommand('view.create', VIEW_PAYLOAD)).rejects.toThrow(
            /getState is not a function/,
        );

        // ⭐ AND NOTHING WAS RECORDED — which is precisely why an undo adapter would have
        // been decoration. No PatchPair, no ring entry, nothing for `_covered()` to
        // decline or accept.
        expect(rb.current(), 'view.create minted a ring entry after throwing').toBeNull();
        expect(rt.stores['view']!.getState().get(VIEW_ID), 'nothing was written').toBeUndefined();
        rt.tearDown?.();
    }, 120000);

    it('S-7: balcony.create — Ctrl+Z removes the compound AND its slab, finish and rails', async () => {
        const rt = await boot();
        const rb = attachRingBuffer(rt);

        // ⚠ THE ONE MERGE IN THIS FILE, AND WHY. `balcony.create` declares four stores;
        // `slab` / `floor` / `handrail` are adapted in `buildUndoStoreMap()` off the
        // LEGACY `window.slabStore` / `window.floorStore` / `window.handrailStore`
        // globals, which `initBuilders.ts` assigns in the browser and which do not
        // exist in a headless boot. They are supplied here from the composed runtime —
        // the same stores the handler wrote — so the multi-store router can reach them.
        // The `balcony` key itself is NOT merged: it comes from the production map, and
        // it is the key this lane added and the only one that was missing.
        const members = {
            slab: rt.stores['slab'],
            floor: rt.stores['floor'],
            handrail: rt.stores['handrail'],
        };
        expect(
            typeof buildUndoStoreMap()['balcony']?.applyPatch,
            'balcony comes from the PRODUCTION map, not from the merge',
        ).toBe('function');

        await roundTrip(rt, rb, 'balcony', 'balcony.create', BALCONY_PAYLOAD, BALCONY_ID, members);

        // ⭐ AND THE MEMBERS GO WITH IT. A balcony parent record removed while its plate,
        // finish and three rails stay behind is a WORSE state than the no-op this lane
        // closed: the user sees a balcony that no longer knows it is one.
        expect(rt.stores['slab']!.getState().get(SLAB_ID), 'the plate is gone').toBeUndefined();
        expect(rt.stores['floor']!.getState().get(FLOOR_ID), 'the finish is gone').toBeUndefined();
        for (const id of RAIL_IDS) {
            expect(rt.stores['handrail']!.getState().get(id), `rail ${id} is gone`).toBeUndefined();
        }
        rt.tearDown?.();
    }, 120000);

    it('S-8: redo puts it back — the entry is a round trip, not a one-way delete', async () => {
        // A cursor that steps on undo but cannot replay is a different failure wearing
        // the same colour as a fix. Structural stands for the four single-store
        // families; they route through one code path.
        const rt = await boot();
        const rb = attachRingBuffer(rt);
        await rt.bus.executeCommand('structural.create', {
            id: STRUCTURAL_ID,
            levelId: 'level-1',
            kind: 'brace',
            origin: { x: 0, y: 0, z: 0 },
            endOffset: { x: 2, y: 0, z: 0 },
        });
        const stores = rb.current()!.affectedStores!;
        const map = buildUndoStoreMap() as never;

        applyRingBufferSide(rb.undoPatch()!, stores, map);
        expect(rt.stores['structural']!.getState().get(STRUCTURAL_ID)).toBeUndefined();

        const outcome = applyRingBufferSide(rb.redoPatch()!, stores, map);
        expect(outcome.failed).toEqual([]);
        expect(
            rt.stores['structural']!.getState().get(STRUCTURAL_ID),
            'the brace is BACK after redo',
        ).toBeDefined();
        rt.tearDown?.();
    }, 120000);
});
