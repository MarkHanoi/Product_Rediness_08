// §A.21.D25 — multi-storey HOUSE post-gen fan-out.
//
// Guards the fix for "furniture appears ONLY on the TOP floor": the post-gen
// finish chain must run floor + ceiling + furnish + lighting on EVERY storey
// (ground included), and — critically — each storey's rooms must be NAMED
// (occupancy-tagged) and that naming AWAITED before that storey is furnished.
// The earlier bug named all storeys up-front with a flat wait, letting the
// ground storey's furnish race ahead of its (async) naming → bare ground floor.
//
// We mock the heavy trigger module (it pulls in @pryzm/command-registry) and
// drive a fake runtime event bus so the test stays a pure ordering check.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the floor trigger so we don't import the command registry; record calls.
const floorCalls: string[] = [];
vi.mock('../src/ui/floor-layout/floorLayoutTrigger.js', () => ({
    triggerFloorLayout: () => { floorCalls.push('floor'); },
}));

import { runHousePostGenChain } from '../src/ui/house-layout/runHousePostGenChain.js';

/** A minimal synchronous event bus matching the EventsLike shape the
 *  orchestrator uses (`on(k, fn) => off`, `emit(k, payload)`). */
function makeEvents() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const log: string[] = [];
    return {
        log,
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            log.push(k);
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
}

/** Build a fake runtime whose event bus, when it sees a stage's `*.layout-execute`,
 *  synchronously echoes the matching `*.layout-executed` so the chain advances. */
function makeRuntime(opts?: { skipFurnishExecuted?: Set<string> }) {
    const events = makeEvents();
    const activeLevels: string[] = [];
    // Track which level is active when each furnish fires (proves per-storey targeting).
    const furnishOrder: string[] = [];
    const win = globalThis as unknown as { window?: unknown; projectContext?: { activeLevelId?: string | null } };
    win.window = win; // node env has no window; the orchestrator reads window.projectContext
    win.projectContext = { activeLevelId: null };

    events.on('ceiling.layout-execute', () => events.emit('ceiling.layout-executed', { levelId: win.projectContext!.activeLevelId }));
    events.on('furnish.layout-execute', () => {
        const lvl = win.projectContext!.activeLevelId as string;
        furnishOrder.push(lvl);
        if (!opts?.skipFurnishExecuted?.has(lvl)) events.emit('furnish.layout-executed', { levelId: lvl });
    });
    events.on('lighting.layout-execute', () => events.emit('lighting.layout-executed', { levelId: win.projectContext!.activeLevelId }));

    const runtime = { events } as unknown as Parameters<typeof runHousePostGenChain>[0];
    return { runtime, events, activeLevels, furnishOrder, win };
}

describe('runHousePostGenChain — §A.21.D25 every-storey fan-out', () => {
    beforeEach(() => { floorCalls.length = 0; });
    afterEach(() => {
        const win = globalThis as unknown as { window?: unknown; projectContext?: unknown };
        delete win.window; delete win.projectContext;
    });

    it('furnishes EVERY storey (ground + uppers), ground-first', async () => {
        const { runtime, furnishOrder } = makeRuntime();
        await runHousePostGenChain(runtime, ['L-ground', 'L-upper']);
        expect(furnishOrder).toEqual(['L-ground', 'L-upper']);
        // Floor trigger fired once per storey too.
        expect(floorCalls.length).toBe(2);
    });

    it('NAMES each storey before furnishing it, awaiting room-name-completed', async () => {
        const { runtime, events, furnishOrder } = makeRuntime();
        const order: string[] = [];
        // nameStorey echoes the per-level room-name-completed the orchestrator awaits.
        const nameStorey = (levelId: string): void => {
            order.push(`name:${levelId}`);
            events.emit('apartment.room-name-completed', { levelId });
        };
        // Record furnish relative to naming by tapping the execute event.
        events.on('furnish.layout-execute', () => order.push(`furnish:${(globalThis as unknown as { projectContext: { activeLevelId: string } }).projectContext.activeLevelId}`));

        await runHousePostGenChain(runtime, ['L-ground', 'L-upper'], nameStorey);

        // Ground must be named before ground furnish; same for the upper storey.
        expect(order).toEqual([
            'name:L-ground', 'furnish:L-ground',
            'name:L-upper', 'furnish:L-upper',
        ]);
        expect(furnishOrder).toEqual(['L-ground', 'L-upper']);
    });

    it('still advances a storey if its naming never completes (timeout-bounded)', async () => {
        vi.useFakeTimers();
        try {
            const { runtime, furnishOrder } = makeRuntime();
            // nameStorey does NOT emit room-name-completed → orchestrator must fall
            // back to the ROOM_NAME_TIMEOUT_MS budget and still furnish the storey.
            const nameStorey = (): void => { /* never signals completion */ };
            const p = runHousePostGenChain(runtime, ['L-ground'], nameStorey);
            await vi.runAllTimersAsync();
            await p;
            expect(furnishOrder).toEqual(['L-ground']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('processes a 3-storey house in ground-up order', async () => {
        const { runtime, furnishOrder } = makeRuntime();
        const events = (runtime as unknown as { events: ReturnType<typeof makeEvents> }).events;
        const nameStorey = (levelId: string): void => { events.emit('apartment.room-name-completed', { levelId }); };
        await runHousePostGenChain(runtime, ['L0', 'L1', 'L2'], nameStorey);
        expect(furnishOrder).toEqual(['L0', 'L1', 'L2']);
    });
});
