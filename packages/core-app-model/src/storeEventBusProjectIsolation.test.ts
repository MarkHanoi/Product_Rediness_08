// §C13-CLEAR-EVENTS-DO-NOT-CROSS / §C13-STALE-AFTER-CLEAR (L-713).
//
// THE FOUNDER'S REPRODUCTION. Create a NEW project; see the previous project's work.
// The new project loaded ZERO elements, and the bus then logged
// `endBatch() — flushed 74 buffered event(s)` naming windows of the PREVIOUS project.
// Both isolation audits reported clean immediately afterwards.
//
// ⚠ The fourth variant of one family, and the first where the leak is not a VALUE:
//
//   L-676  no owner at all                → PRESENCE gap
//   L-694  the probe modelled the wrong field → COMPLETENESS gap
//   L-711  the expected id-set omitted one     → COMPLETENESS gap
//   L-713  nothing modelled the CHANNEL        → the queue itself
//
// The stores really were clean when the probes were asked. The poison arrived
// afterwards, as events. A probe that inspects state cannot see that, which is why
// these tests assert on the BUS, not on any store.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StoreEventBus, type StoreChangeEvent } from './StoreEventBus';
import { elementRegistry } from './ElementRegistry';

const evt = (id: string, type = 'window', op: StoreChangeEvent['operation'] = 'delete'): StoreChangeEvent =>
    ({ elementId: id, elementType: type, operation: op, timestamp: Date.now() });

// The two real window ids from the founder's 2026-08-07 log.
const PROJ_A_WINDOWS = ['964e8621-98a6-45eb-ae5d-f649a0b95701', '5ea772b6-07c7-4aee-8a5f-870d4ec6f63a'];

describe('L-713 — the teardown\'s own events must not cross into the incoming project', () => {
    let bus: StoreEventBus;
    let delivered: StoreChangeEvent[];

    beforeEach(() => {
        bus = new StoreEventBus();
        delivered = [];
        bus.subscribe(e => delivered.push(e));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('RED (the defect): clear-events emitted inside the incoming load bracket ARE delivered', () => {
        // Exactly the production shape: ProjectLoader opens the bracket for project B,
        // ClearProjectCommand runs INSIDE it and empties project A's stores.
        bus.beginBatch();                                   // ProjectLoader.ts:590 (project B)
        for (const id of PROJ_A_WINDOWS) bus.emit(evt(id)); // WindowStore.clear() — project A
        bus.endBatch();                                     // ProjectLoader.ts:2012

        expect(delivered.map(e => e.elementId)).toEqual(PROJ_A_WINDOWS);
    });

    it('GREEN: the same teardown inside suppressDuring() delivers nothing', () => {
        bus.beginBatch();
        bus.suppressDuring('C13 ClearProjectCommand teardown', () => {
            for (const id of PROJ_A_WINDOWS) bus.emit(evt(id));
        });
        bus.endBatch();

        expect(delivered).toEqual([]);
    });

    it('the incoming project\'s OWN events, emitted in the same bracket, still arrive', () => {
        // The fix must not turn the load into a silent one — this is the assertion that
        // stops "suppress everything" being an acceptable implementation.
        bus.beginBatch();
        bus.suppressDuring('C13 ClearProjectCommand teardown', () => {
            for (const id of PROJ_A_WINDOWS) bus.emit(evt(id));
        });
        bus.emit(evt('projB-wall-1', 'wall', 'create'));
        bus.endBatch();

        expect(delivered.map(e => e.elementId)).toEqual(['projB-wall-1']);
    });

    it('the drop is COUNTED and attributed, never silent', () => {
        bus.suppressDuring('C13 ClearProjectCommand teardown', () => {
            for (const id of PROJ_A_WINDOWS) bus.emit(evt(id));
            bus.emit(evt('door-1', 'door'));
        });
        // A drop you cannot count is indistinguishable from a bus that stopped working.
        expect(bus.lastSuppression).toEqual({
            reason: 'C13 ClearProjectCommand teardown',
            count: 3,
            byType: { window: 2, door: 1 },
        });
        expect(console.warn).toHaveBeenCalled();
    });

    it('suppression works in IMMEDIATE mode too (no open batch)', () => {
        // The clear can also run outside a bracket (direct ClearProjectCommand dispatch).
        // A region that only stopped BUFFERING would dispatch synchronously here.
        bus.suppressDuring('C13 ClearProjectCommand teardown', () => {
            for (const id of PROJ_A_WINDOWS) bus.emit(evt(id));
        });
        expect(delivered).toEqual([]);
    });

    it('is nesting-safe and restores delivery exactly once', () => {
        bus.suppressDuring('outer', () => {
            bus.suppressDuring('inner', () => bus.emit(evt('a')));
            bus.emit(evt('b'));           // still inside the OUTER region
        });
        bus.emit(evt('c'));               // outside — must be delivered
        expect(delivered.map(e => e.elementId)).toEqual(['c']);
    });

    it('a throw inside the region does not leave the bus permanently deaf', () => {
        expect(() => bus.suppressDuring('boom', () => { throw new Error('boom'); })).toThrow('boom');
        bus.emit(evt('after-throw'));
        expect(delivered.map(e => e.elementId)).toEqual(['after-throw']);
        expect(bus.isSuppressing).toBe(false);
    });
});

describe('L-713 — §C13-BUS-QUEUE-OWNER: a queue is pending even at depth 0', () => {
    it('discardBatch() drops a stray buffer left at depth 0 by endBatchYielded()', () => {
        const bus = new StoreEventBus();
        const seen: string[] = [];
        bus.subscribe(e => seen.push(e.elementId));
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        bus.beginBatch();
        bus.emit(evt('a'));
        bus.emit(evt('b'));
        // endBatchYielded takes the buffer at depth 0 and drains it across frames; a
        // switch arriving mid-drain must still be able to discard. Simulate by never
        // running the scheduler.
        bus.endBatchYielded(() => { /* scheduler never fires */ }, () => { /* onComplete */ });
        expect(bus.batchDepth).toBe(0);

        bus.discardBatch();
        expect(seen).toEqual([]);
        vi.restoreAllMocks();
    });
});

describe('L-713 — the bus is a DECLARED isolation surface the audit can see', () => {
    it('the probe answers null when the bus is idle', async () => {
        const { readProjectScopeProbes } = await import('./persistence/ProjectIsolationAudit');
        const reading = readProjectScopeProbes().find(r => r.scope === 'events.storeBus');
        expect(reading).toBeDefined();
        expect(reading!.owningProjectId).toBeNull();
    });

    it('the probe REFUSES to certify a bus that is still holding events', async () => {
        const { readProjectScopeProbes } = await import('./persistence/ProjectIsolationAudit');
        const { storeEventBus } = await import('./StoreEventBus');
        vi.spyOn(console, 'log').mockImplementation(() => {});

        storeEventBus.beginBatch();
        storeEventBus.emit(evt('in-flight'));
        try {
            const reading = readProjectScopeProbes().find(r => r.scope === 'events.storeBus')!;
            // It cannot attribute the event to a project — StoreChangeEvent has no
            // projectId — so it must not answer with the project that just loaded.
            // An unknown is never filed as a clean.
            expect(reading.owningProjectId).toBe('<in-flight-events-unattributed>');
            expect((reading.detail as { bufferedCount: number }).bufferedCount).toBe(1);
        } finally {
            storeEventBus.discardBatch();
            vi.restoreAllMocks();
        }
    });
});

describe('L-713 — §C13-STALE-AFTER-CLEAR: the registry can distinguish undo from cross-project', () => {
    it('clearedSince() is false for an event emitted after the last clear (undo/redo race)', () => {
        elementRegistry.clear();
        const later = Date.now() + 1000;
        expect(elementRegistry.clearedSince(later)).toBe(false);
    });

    it('clearedSince() is TRUE for an event emitted at or before the clear (cross-project)', () => {
        const emittedAt = Date.now();
        elementRegistry.clear();          // ClearProjectCommand step 0, same millisecond
        expect(elementRegistry.clearedSince(emittedAt)).toBe(true);
    });

    it('a registry that was never cleared never reports a cross-project event', () => {
        // Guards the `_lastClearedAt > 0` half: a fresh session must not classify every
        // stale undo id as a project leak.
        const fresh = new (elementRegistry.constructor as new () => typeof elementRegistry)();
        expect(fresh.clearedSince(Date.now())).toBe(false);
    });
});
