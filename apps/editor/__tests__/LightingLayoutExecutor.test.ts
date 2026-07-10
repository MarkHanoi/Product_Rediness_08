// §FIX-RUNBATCH-NESTING-DROPS-GUARDS (L-209) — LightingLayoutExecutor commit guard.
//
// The lighting executor dispatches N `lighting.create` commands and MUST fold them
// into ONE `runBatch` = one undo unit (C17 DI-6 / PS-3). But `runBatch` refuses to
// nest, so when lighting runs as the terminus of the multi-storey HOUSE post-gen
// chain — where the house's structural `runBatch` is still draining (`isBatching`
// true) — a nested `runBatch` would run UNGUARDED: the N fixtures fragment into N
// undo transactions and `skipRedetectRooms` is discarded (the founder saw 59
// fixtures = 59 undo steps).
//
// Fix (caller-side): when `isBatching` is true, DEFER the whole commit via
// `onNextSettle` so it opens a CLEAN, non-nested batch after the ambient batch
// settles. When false (apartment single-level path), commit immediately — unchanged.
//
// These are pure ordering/behaviour checks: we mock the stores, the pure engine,
// the runtime bus and `batchCoordinator` so no DOM / real batch machinery is needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared, hoist-safe mock state (vi.mock factories are hoisted above imports).
const h = vi.hoisted(() => {
    const state = {
        isBatching: false,
        throwOnRunBatch: false,
        settleCbs: [] as Array<() => void>,
        runBatchOpts: [] as unknown[],
        /** One ordered log across runBatch + command dispatch + event emits, so a
         *  test can assert "runBatch before lighting.layout-executed" etc. */
        log: [] as string[],
    };
    return { state };
});

vi.mock('@pryzm/core-app-model', () => ({
    batchCoordinator: {
        get isBatching() { return h.state.isBatching; },
        runBatch: (fn: () => unknown, opts: unknown) => {
            h.state.log.push('runBatch');
            h.state.runBatchOpts.push(opts);
            if (h.state.throwOnRunBatch) throw new Error('boom');
            return fn();
        },
        onNextSettle: (cb: () => void) => {
            h.state.log.push('onNextSettle');
            h.state.settleCbs.push(cb);
        },
    },
    storeRegistry: {
        getStoreForType: (_t: string) => ({
            getAll: () => [
                { id: 'R1', levelId: 'L1', occupancyType: 'living-room', boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] } },
                { id: 'R2', levelId: 'L1', occupancyType: 'bedroom', boundary: { polygon: [{ x: 5, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 3 }, { x: 5, z: 3 }] } },
            ],
        }),
    },
}));

vi.mock('@pryzm/schemas', () => ({
    createId: (prefix: string) => `${prefix}-id`,
}));

// Pure engine: `lightRoom` places ≥1 fixture per room; `buildLightingCommands`
// returns 3 flat `lighting.create` commands (the N-command shape that fragments
// undo when unguarded).
vi.mock('@pryzm/ai-host', () => ({
    lightRoom: () => [{ kind: 'downlight', origin: { x: 0, y: 2.4, z: 0 } }],
    buildLightingCommands: (placed: unknown[], levelId: string) => ({
        levelId,
        commands: [0, 1, 2].map(i => ({ command: 'lighting.create', payload: { id: `lighting-${i}` } })),
        ids: ['lighting-0', 'lighting-1', 'lighting-2'],
        totalElementCount: 3,
        warnings: [] as string[],
    }),
}));

vi.mock('../src/ui/apartment-layout/activeLevel.js', () => ({
    resolveActiveLevel: () => ({ id: 'L1', elevation: 0, height: 2.7 }),
}));

import { LightingLayoutExecutor } from '../src/ui/lighting-layout/LightingLayoutExecutor.js';

/** Minimal runtime: synchronous event bus + a bus that records executeCommand,
 *  both writing into the shared ordered log. */
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
            if (k === 'lighting.layout-executed') h.state.log.push('lighting.layout-executed');
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
    const commands: string[] = [];
    const bus = {
        executeCommand(command: string, _payload: unknown): unknown {
            commands.push(command);
            h.state.log.push(`cmd:${command}`);
            return undefined;
        },
    };
    const runtime = { events, bus } as unknown as Parameters<LightingLayoutExecutor['attach']>[0];
    return { runtime, events, emitted, commands };
}

function resetState(): void {
    h.state.isBatching = false;
    h.state.throwOnRunBatch = false;
    h.state.settleCbs = [];
    h.state.runBatchOpts = [];
    h.state.log = [];
}

describe('LightingLayoutExecutor — §FIX-RUNBATCH-NESTING-DROPS-GUARDS (L-209)', () => {
    beforeEach(() => { resetState(); });
    afterEach(() => { vi.useRealTimers(); });

    it('isBatching=false → commits immediately in exactly ONE runBatch (unchanged)', () => {
        const { runtime, emitted } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);

        h.state.isBatching = false;
        runtime.events.emit('lighting.layout-execute', {});

        // Exactly one runBatch, no deferral.
        expect(h.state.runBatchOpts.length).toBe(1);
        expect(h.state.settleCbs.length).toBe(0);
        // 3 `lighting.create` commands folded into that one batch.
        expect(h.state.log.filter(l => l === 'cmd:lighting.create').length).toBe(3);
        // The batch carried the guard opts.
        expect(h.state.runBatchOpts[0]).toMatchObject({ skipRedetectRooms: true, skipPbrUpgrade: true });
        // The executed event fired.
        expect(emitted.some(e => e.key === 'lighting.layout-executed')).toBe(true);
        exec.detach();
    });

    it('isBatching=false → lighting.layout-executed fires AFTER the commit', () => {
        const { runtime } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);

        runtime.events.emit('lighting.layout-execute', {});

        const iRunBatch = h.state.log.indexOf('runBatch');
        const iExecuted = h.state.log.indexOf('lighting.layout-executed');
        expect(iRunBatch).toBeGreaterThanOrEqual(0);
        expect(iExecuted).toBeGreaterThan(iRunBatch);
        exec.detach();
    });

    it('isBatching=true → ZERO immediate runBatch; deferred via onNextSettle; one clean batch after settle', () => {
        vi.useFakeTimers();
        const { runtime, emitted } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);

        h.state.isBatching = true;
        runtime.events.emit('lighting.layout-execute', {});

        // Nothing committed yet: no runBatch, no executed event — deferred.
        expect(h.state.runBatchOpts.length).toBe(0);
        expect(h.state.settleCbs.length).toBe(1);
        expect(emitted.some(e => e.key === 'lighting.layout-executed')).toBe(false);

        // Ambient batch settles → executor's settle callback schedules the commit on
        // a macrotask (never re-enters runBatch inside the settling onComplete tail).
        h.state.isBatching = false; // batch has settled by the time the callback runs
        h.state.settleCbs.forEach(cb => cb());
        // Commit hasn't run until the macrotask fires.
        expect(h.state.runBatchOpts.length).toBe(0);
        vi.runOnlyPendingTimers();

        // Exactly ONE clean batch, guard opts intact, 3 commands, executed emitted.
        expect(h.state.runBatchOpts.length).toBe(1);
        expect(h.state.runBatchOpts[0]).toMatchObject({ skipRedetectRooms: true, skipPbrUpgrade: true });
        expect(h.state.log.filter(l => l === 'cmd:lighting.create').length).toBe(3);
        expect(emitted.some(e => e.key === 'lighting.layout-executed')).toBe(true);
        // Ordering preserved even on the deferred path: batch before the executed event.
        expect(h.state.log.indexOf('runBatch')).toBeLessThan(h.state.log.indexOf('lighting.layout-executed'));
        exec.detach();
    });

    it('throwing commit logs "runBatch threw", toasts error, and does NOT emit executed (chain relies on its 12s timeout)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
        const { runtime, emitted } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);

        h.state.throwOnRunBatch = true;
        // Must not throw out of _execute (would reject the fire-and-forget promise
        // but never wedge the chain; here we assert it is swallowed synchronously).
        expect(() => runtime.events.emit('lighting.layout-execute', {})).not.toThrow();

        expect(warn.mock.calls.some(c => String(c[0]).includes('[lighting-layout] runBatch threw:'))).toBe(true);
        // Behaviour-as-before: no layout-executed on the throw path; an error toast fired.
        expect(emitted.some(e => e.key === 'lighting.layout-executed')).toBe(false);
        expect(emitted.some(e => e.key === 'pryzm:toast' && (e.payload as { severity?: string }).severity === 'error')).toBe(true);
        warn.mockRestore();
        exec.detach();
    });
});
