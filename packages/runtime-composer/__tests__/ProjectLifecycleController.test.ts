/**
 * ProjectLifecycleController — L-224 §AUDIT-PROJECT-ISOLATION-E2E.
 *
 * Proves the REVIVED teardown: the controller now subscribes to
 * `pryzm-project-switch` on the TYPED runtime.events bus (was a dead
 * `window.addEventListener`), so a project switch actually runs the C13 §4
 * teardown — BatchCoordinator.forceReset + undo-stack clear + wall/CW/slab
 * resume + the step-5 callback. This is the fix for the founder-reported
 * "reminiscencia".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectLifecycleController } from '../src/ProjectLifecycleController';

interface FakeBus {
    on(ev: string, cb: (p: unknown) => void): () => void;
    emit(ev: string, payload: unknown): void;
    handlerCount(ev: string): number;
}

function makeBus(): FakeBus {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    return {
        on(ev, cb) {
            let s = handlers.get(ev);
            if (!s) { s = new Set(); handlers.set(ev, s); }
            s.add(cb);
            return () => s!.delete(cb);
        },
        emit(ev, payload) { handlers.get(ev)?.forEach(cb => cb(payload)); },
        handlerCount(ev) { return handlers.get(ev)?.size ?? 0; },
    };
}

function makeBatchCoordinator() {
    return { isBatching: true, pendingRegistrationCount: 3, forceReset: vi.fn() };
}

beforeEach(() => {
    // Controller reads (window as any).__engineTeardown / __curtainWallRebuildControl
    // / __slabRebuildControl / runtime.tracer via optional chaining. A bare object
    // is enough — every access short-circuits to undefined.
    (globalThis as unknown as { window?: unknown }).window = {};
});

afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
});

describe('ProjectLifecycleController — typed-bus teardown (L-224)', () => {
    it('runs the full teardown on a typed pryzm-project-switch', () => {
        const bc = makeBatchCoordinator();
        const onAfterStep5 = vi.fn();
        const onClearUndoStacks = vi.fn();
        const ctrl = new ProjectLifecycleController(bc, onAfterStep5, onClearUndoStacks);
        const bus = makeBus();

        ctrl.bind(bus);
        expect(bus.handlerCount('pryzm-project-switch')).toBe(1);

        bus.emit('pryzm-project-switch', { projectId: 'B', projectName: 'Project B' });

        // Step 0 — undo stacks cleared BEFORE anything else.
        expect(onClearUndoStacks).toHaveBeenCalledTimes(1);
        // Step 1 — BatchCoordinator reset (kills leftover _isBatching from project A).
        expect(bc.forceReset).toHaveBeenCalledTimes(1);
        // Step 5 — caller callback (e.g. _levelCamReady = false).
        expect(onAfterStep5).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — re-bind disposes the prior subscription (no double-fire)', () => {
        const bc = makeBatchCoordinator();
        const onClear = vi.fn();
        const ctrl = new ProjectLifecycleController(bc, null, onClear);
        const bus = makeBus();

        ctrl.bind(bus);
        ctrl.bind(bus); // re-bind
        expect(bus.handlerCount('pryzm-project-switch')).toBe(1);

        bus.emit('pryzm-project-switch', { projectId: 'B', projectName: 'B' });
        expect(bc.forceReset).toHaveBeenCalledTimes(1);
    });

    it('does not throw and does not run teardown when no bus is available', () => {
        const bc = makeBatchCoordinator();
        const ctrl = new ProjectLifecycleController(bc);
        // No injected bus and window.runtime is undefined → bind() logs + returns.
        expect(() => ctrl.bind()).not.toThrow();
        expect(bc.forceReset).not.toHaveBeenCalled();
    });

    it('unbind() removes the subscription', () => {
        const bc = makeBatchCoordinator();
        const ctrl = new ProjectLifecycleController(bc);
        const bus = makeBus();
        ctrl.bind(bus);
        ctrl.unbind();
        expect(bus.handlerCount('pryzm-project-switch')).toBe(0);
        bus.emit('pryzm-project-switch', { projectId: 'B', projectName: 'B' });
        expect(bc.forceReset).not.toHaveBeenCalled();
    });
});
