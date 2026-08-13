// §FURNISH-DROP-SURFACING (editor half) — every FurnishLayoutExecutor return
// path EMITS `furnish.layout-executed`.
//
// Production observed (founder, 2026-08-12): the §CHAIN-TIMEOUT fallback fired
// lighting because furnish never emitted its completion event. Three return
// paths in FurnishLayoutExecutor NEVER emit (L-716 class — the waiter can never
// be satisfied):
//   (1) `!level?.id` early return
//   (2) the `runBatch` catch → return   (also places ZERO furniture — the
//       founder's exact observation)
//   (3) the outer catch (toast only)
// The L-101 no-rooms fix already emits on ITS path; these tests demand the
// same for the remaining three — AND that the payload distinguishes
// "completed, zero items" from "failed/dropped" via an explicit `outcome`
// field (C75 §1.2: two facts never print one value; C75 §1.4: a drop carries
// a REASON).
//
// Written RED-FIRST (C70 §5.6): the `outcome` field and the three emits do not
// exist in shipped code; every test drives the executor into the path and
// asserts the event.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-safe shared mock state (vi.mock factories are hoisted above imports).
const h = vi.hoisted(() => {
    const state = {
        /** Active level returned by the (mocked) resolver; null = path (1). */
        level: { id: 'L1', elevation: 0, height: 2.7 } as
            { id: string; elevation?: number; height?: number } | null,
        /** Rooms served by the mocked room store. */
        rooms: [] as unknown[],
        /** Walls served by the mocked wall store. */
        walls: [] as unknown[],
        /** Path (3): make storeRegistry.getStoreForType throw. */
        throwOnGetStore: false,
        /** Path (2): make batchCoordinator.runBatch throw. */
        throwOnRunBatch: false,
        /** What the mocked pure engine places per furnishable room. */
        placePerRoom: 1,
        runBatchCalls: 0,
    };
    return { state };
});

vi.mock('@pryzm/core-app-model', () => ({
    batchCoordinator: {
        isBatching: false,
        runBatch: (fn: () => unknown) => {
            h.state.runBatchCalls++;
            if (h.state.throwOnRunBatch) throw new Error('batch exploded');
            return fn();
        },
        onNextSettle: (_cb: () => void) => { /* unused here */ },
    },
    storeRegistry: {
        getStoreForType: (t: string) => {
            if (h.state.throwOnGetStore) throw new Error('store registry unavailable');
            if (t === 'room') return { getAll: () => h.state.rooms };
            if (t === 'wall') return { getAll: () => h.state.walls };
            return undefined;
        },
    },
}));

vi.mock('@pryzm/schemas', () => ({
    createId: (prefix: string) => `${prefix}-id`,
}));

vi.mock('@pryzm/geometry-kernel', () => ({
    pointInPolygonXZ: () => false,
}));

vi.mock('@pryzm/ai-host', () => ({
    furnishRoom: () =>
        Array.from({ length: h.state.placePerRoom }, (_, i) => ({
            kind: 'sofa', origin: { x: i, y: 0, z: 0 },
        })),
    furnishRoomCompound: () => [],
    buildFurnishCommands: (placed: unknown[]) => ({
        commands: (placed as unknown[]).map((_p, i) => ({
            command: 'furniture.create', payload: { id: `furniture-${i}` },
        })),
        warnings: [] as string[],
    }),
    validateFurnishedRoom: () => ({ ok: true, warnings: [] as string[] }),
}));

vi.mock('../apartment-layout/activeLevel.js', () => ({
    resolveActiveLevel: () => h.state.level,
    resolveLevelById: (_id: string) => h.state.level,
}));

vi.mock('../apartment-layout/activeBrief.js', () => ({
    getActiveDesignMetadata: () => null,
}));

import { FurnishLayoutExecutor } from './FurnishLayoutExecutor.js';

interface RunOutcome {
    state?: 'completed' | 'dropped';
    reason?: string;
    placedCount?: number;
    roomCount?: number;
}
interface ExecutedPayload {
    placedCount?: number;
    roomCount?: number;
    outcome?: RunOutcome;
}

function makeRuntime() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const emitted: Array<{ key: string; payload: unknown }> = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            emitted.push({ key: k, payload });
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
    const bus = { executeCommand: (_c: string, _p: unknown): unknown => undefined };
    const runtime = { events, bus } as unknown as Parameters<FurnishLayoutExecutor['attach']>[0];
    const executedEvents = (): ExecutedPayload[] =>
        emitted.filter(e => e.key === 'furnish.layout-executed').map(e => e.payload as ExecutedPayload);
    return { runtime, emitted, executedEvents };
}

const LIVING_ROOM = {
    id: 'R1', levelId: 'L1', name: 'Living Room', occupancyType: 'living-room',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] },
};

function resetState(): void {
    h.state.level = { id: 'L1', elevation: 0, height: 2.7 };
    h.state.rooms = [];
    h.state.walls = [];
    h.state.throwOnGetStore = false;
    h.state.throwOnRunBatch = false;
    h.state.placePerRoom = 1;
    h.state.runBatchCalls = 0;
}

describe('FurnishLayoutExecutor — the three non-emitting return paths EMIT (§CHAIN-TIMEOUT / L-716 class)', () => {
    beforeEach(() => { resetState(); vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ }); });

    it('path (1): !level?.id → emits furnish.layout-executed with a DROPPED outcome naming the missing level', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.level = null;
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('dropped');
        expect(evts[0]!.outcome?.reason).toMatch(/level/i);
        exec.detach();
    });

    it('path (2): runBatch throws → emits DROPPED with the throw reason and placedCount 0 (the founder\'s zero-furniture case)', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.rooms = [LIVING_ROOM];
        h.state.throwOnRunBatch = true;
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        expect(h.state.runBatchCalls).toBe(1); // the path WAS reached
        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('dropped');
        expect(evts[0]!.outcome?.reason).toMatch(/runBatch|batch exploded/);
        expect(evts[0]!.placedCount).toBe(0); // nothing actually landed
        exec.detach();
    });

    it('path (3): the outer catch → emits DROPPED with the failure reason (toast alone is not surfacing)', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.throwOnGetStore = true;
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('dropped');
        expect(evts[0]!.outcome?.reason).toMatch(/store registry unavailable|failed/i);
        exec.detach();
    });

    it('"completed, zero items" carries outcome state completed — NEVER the dropped shape (C75 §1.2)', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.rooms = [LIVING_ROOM];
        h.state.placePerRoom = 0; // engine legitimately places nothing
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('completed');
        expect(evts[0]!.outcome?.placedCount).toBe(0);
        expect(evts[0]!.outcome?.roomCount).toBe(1);
        exec.detach();
    });

    it('the success path stamps outcome completed with the real counts', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.rooms = [LIVING_ROOM];
        h.state.placePerRoom = 3;
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('completed');
        expect(evts[0]!.outcome?.placedCount).toBe(3);
        expect(evts[0]!.outcome?.roomCount).toBe(1);
        expect(evts[0]!.placedCount).toBe(3);
        exec.detach();
    });

    it('the L-101 no-rooms path keeps emitting AND now carries outcome completed (zero rooms is an answer)', () => {
        const { runtime, executedEvents } = makeRuntime();
        h.state.rooms = [];
        const exec = new FurnishLayoutExecutor();
        exec.attach(runtime);
        runtime.events.emit('furnish.layout-execute', {});

        const evts = executedEvents();
        expect(evts.length).toBe(1);
        expect(evts[0]!.outcome?.state).toBe('completed');
        expect(evts[0]!.roomCount).toBe(0);
        exec.detach();
    });
});
