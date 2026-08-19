/**
 * §L-1087 — every lighting mutation must reach the SEMANTIC bus, not only the
 * legacy DOM bus.
 *
 * THE DEFECT THIS PINS, MEASURED. `LightingStore.add` / `update` / `remove`
 * emitted ONLY `_bus` (`bim-lighting-added` / `-updated` / `-removed`). Every
 * other geometry store in the repo dual-emits — compare `FurnitureStore.ts:23-24`,
 * `PlumbingStore.ts:11-12`, `RoofStore.ts:87-88`. `storeEventBus` is what the
 * DERIVED consumers subscribe to: `ViewDependencyTracker._onStoreEvent`
 * (`ViewDependencyTracker.ts:325, 674`), `DependencyResolver._onStoreChange`
 * (`DependencyResolver.ts:261`), `ElementSpatialIndex` (`:57`), `SemanticIndex`
 * (`:57`), `ViewVisibilityMap` (`:83`), `ViewTechnicalDrawingCache` (`:900`),
 * `SyncStateEngine` (`:138`), `TemporalGraph` (`:94`), `ComparisonEngine` (`:69`)
 * and `IFCPsetAdapter` (`:76`). A store that never emits there is invisible to
 * all ten — a mutation that happened and that nothing downstream can know about.
 *
 * ⚠ SECOND BLOCKER, DECLARED NOT FIXED — this emit is necessary but not
 * sufficient for the plan-view leg. `ViewDependencyTracker._onStoreEvent` drops
 * every event whose type is not in `GEOMETRY_ELEMENT_TYPES`
 * (`packages/core-app-model/src/views/ViewDependencyTracker.ts:675`), and that
 * set (`:41-48`) lists wall, slab, column, beam, curtainwall, curtain-panel,
 * window, door, roof, stair, stair-landing, stair-railing, verticalCirculation,
 * opening, ceiling, floor, handrail, FURNITURE and PLUMBING — and **not
 * `lighting`**. So a lighting event reaches the bus and is then filtered out
 * one line into the tracker. The set is module-private and the file is outside
 * this lane's edit scope, so it is NAMED here rather than half-fixed: adding
 * `'lighting'` to that set is the follow-up, and it changes plan re-projection
 * behaviour for every lighting mutation, which is a measurement (and a perf
 * argument) of its own. This suite therefore asserts what this store OWNS — the
 * emit — and does not claim the plan view is dirtied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeEventBus } from '@pryzm/core-app-model';
import type { StoreChangeEvent } from '@pryzm/core-app-model';
import { LightingStore } from '../src/LightingStore';
import type { LightingData } from '../src/LightingTypes';

const seed = (over: Partial<LightingData> = {}): LightingData => ({
    id: 'lt-e1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight',
    position: { x: 0, y: 2.6, z: 0 },
    ...over,
});

/** Collect every lighting event emitted while `fn` runs. */
function capture(fn: () => void): StoreChangeEvent[] {
    const seen: StoreChangeEvent[] = [];
    const unsubscribe = storeEventBus.subscribe(e => {
        if (e.elementType === 'lighting') seen.push(e);
    });
    try { fn(); } finally { unsubscribe(); }
    return seen;
}

describe('§L-1087 LightingStore — mutations reach the semantic bus', () => {
    let store: LightingStore;

    beforeEach(() => { store = new LightingStore(); });

    it('update() emits a semantic `update` event', () => {
        store.add(seed());

        const seen = capture(() => store.update('lt-e1', { roomId: 'room-1' }));

        expect(seen).toHaveLength(1);
        expect(seen[0].elementId).toBe('lt-e1');
        expect(seen[0].operation).toBe('update');
    });

    it('add() emits a semantic `create` event', () => {
        const seen = capture(() => store.add(seed({ id: 'lt-e2' })));

        expect(seen).toHaveLength(1);
        expect(seen[0].elementId).toBe('lt-e2');
        expect(seen[0].operation).toBe('create');
    });

    it('remove() emits a semantic `delete` event', () => {
        store.add(seed({ id: 'lt-e3' }));

        const seen = capture(() => store.remove('lt-e3'));

        expect(seen).toHaveLength(1);
        expect(seen[0].elementId).toBe('lt-e3');
        expect(seen[0].operation).toBe('delete');
    });

    it('a no-op remove of an absent id emits NOTHING — absence is not a mutation', () => {
        const seen = capture(() => store.remove('lt-nope'));
        expect(seen).toHaveLength(0);
    });

    it('a no-op update of an absent id emits NOTHING', () => {
        const seen = capture(() => store.update('lt-nope', { roomId: 'room-1' }));
        expect(seen).toHaveLength(0);
    });

    it('update() carries the PRE-mutation record as prevState, so the vacated storey is diffable', () => {
        store.add(seed({ id: 'lt-e4', levelId: 'L0' }));

        const seen = capture(() => store.update('lt-e4', { roomId: 'room-9' }));

        expect(seen).toHaveLength(1);
        const prev = seen[0].prevState as LightingData | undefined;
        expect(prev).toBeDefined();
        // Reconstructing this by re-reading the store would diff the new value
        // against itself (C72 §3.2/§3.5).
        expect(prev!.roomId).toBeUndefined();
        expect(prev!.levelId).toBe('L0');
    });
});
