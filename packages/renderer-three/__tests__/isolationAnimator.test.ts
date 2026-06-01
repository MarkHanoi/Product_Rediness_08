// C27 INS-α-7 — IsolationAnimator unit tests.
//
// Validates the 200 ms fade animator with fake collaborators: a fake
// FrameScheduler with manual tick(), a fake state provider that mirrors
// `IsolationStateStore.get()` / `subscribe()`, and a fake mesh registry
// that returns plain `{ material, visible }` shapes (no real THREE).
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §1.3, §1.4, §5.4
//   - C04-RENDERING-AND-SCHEDULING.md §2 (FrameScheduler)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsolationOverride } from '@pryzm/schemas';
import {
    IsolationAnimator,
    type ElementMeshRegistry,
    type FrameSchedulerLike,
    type IsolationStateProvider,
    type MeshLike,
} from '../src/IsolationAnimator.js';

// ── Fakes ────────────────────────────────────────────────────────────────────

interface FakeScheduler extends FrameSchedulerLike {
    tick(dt?: number): void;
    listeners: Array<(dt: number) => void>;
}

function makeFakeScheduler(): FakeScheduler {
    const listeners: Array<(dt: number) => void> = [];
    return {
        listeners,
        onFrame(priority, cb) {
            expect(priority).toBe('render');
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        tick(dt = 16) {
            // Copy so a listener unsubscribing mid-tick doesn't skip its peers.
            for (const l of listeners.slice()) l(dt);
        },
    };
}

interface FakeState extends IsolationStateProvider {
    set(state: {
        overrides: ReadonlyMap<string, IsolationOverride>;
        isActive: boolean;
    }): void;
    notifyNoChange(): void;
    listeners: Array<() => void>;
}

function makeFakeState(initialIsActive = false): FakeState {
    let current = {
        overrides: new Map<string, IsolationOverride>() as ReadonlyMap<string, IsolationOverride>,
        isActive: initialIsActive,
    };
    const listeners: Array<() => void> = [];
    return {
        listeners,
        get() { return current; },
        subscribe(cb) {
            listeners.push(cb);
            return () => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        set(state) {
            current = state;
            for (const l of listeners.slice()) l();
        },
        notifyNoChange() {
            for (const l of listeners.slice()) l();
        },
    };
}

interface FakeRegistry extends ElementMeshRegistry {
    register(id: string, count?: number): MeshLike[];
    meshes: Map<string, MeshLike[]>;
    callCount: Map<string, number>;
}

function makeFakeRegistry(): FakeRegistry {
    const meshes = new Map<string, MeshLike[]>();
    const callCount = new Map<string, number>();
    return {
        meshes,
        callCount,
        register(id, count = 1) {
            const ms: MeshLike[] = [];
            for (let i = 0; i < count; i++) {
                ms.push({
                    material: { opacity: 1, transparent: false },
                    visible: true,
                });
            }
            meshes.set(id, ms);
            return ms;
        },
        getMeshesForElement(id) {
            callCount.set(id, (callCount.get(id) ?? 0) + 1);
            return meshes.get(id) ?? [];
        },
        listElementIds() {
            return Array.from(meshes.keys());
        },
    };
}

// ── Manual clock (controls fade progress) ────────────────────────────────────

let nowMs = 1_000_000;
const now = () => nowMs;
function advance(ms: number): void { nowMs += ms; }

// ── Shared setup ─────────────────────────────────────────────────────────────

let rafSpy: ReturnType<typeof vi.spyOn> | null = null;
let rafCalls = 0;

beforeEach(() => {
    nowMs = 1_000_000;
    rafCalls = 0;
    // Spy on rAF so we can prove the animator never reaches for it (P3).
    if (typeof globalThis.requestAnimationFrame !== 'function') {
        (globalThis as any).requestAnimationFrame = () => { rafCalls++; return 0; };
    }
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((() => {
        rafCalls++;
        return 0 as any;
    }) as any);
});

afterEach(() => {
    rafSpy?.mockRestore();
    rafSpy = null;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('IsolationAnimator', () => {
    it('start() subscribes to state + scheduler', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });
        expect(state.listeners.length).toBe(0);
        expect(sched.listeners.length).toBe(0);
        a.start();
        expect(state.listeners.length).toBe(1);
        expect(sched.listeners.length).toBe(1);
        a.stop();
    });

    it('stop() unsubscribes both + restores defaults on every listed element', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });

        const m1 = reg.register('e1')[0];
        const m2 = reg.register('e2')[0];
        // Tamper to non-default state, then verify stop restores.
        m1.material.opacity = 0.3; m1.material.transparent = true; m1.visible = false;
        m2.material.opacity = 0.5; m2.material.transparent = true; m2.visible = false;

        a.start();
        a.stop();

        expect(state.listeners.length).toBe(0);
        expect(sched.listeners.length).toBe(0);
        expect(m1.material.opacity).toBe(1);
        expect(m1.material.transparent).toBe(false);
        expect(m1.visible).toBe(true);
        expect(m2.material.opacity).toBe(1);
        expect(m2.material.transparent).toBe(false);
        expect(m2.visible).toBe(true);
    });

    it('isActive=true with one FULL override → mesh.opacity becomes 1 after the fade', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];
        mesh.material.opacity = 0.3;
        mesh.material.transparent = true;

        a.start();
        state.set({
            overrides: new Map<string, IsolationOverride>([['e1', { elementId: 'e1', tier: 'FULL' }]]),
            isActive: true,
        });

        // Fade in over 200 ms.
        sched.tick(16);                   // progress 0 → first write at start opacity
        advance(200);
        sched.tick(16);                   // progress 1 → finalised
        expect(mesh.material.opacity).toBe(1);
        expect(mesh.material.transparent).toBe(false);
        expect(mesh.visible).toBe(true);

        a.stop();
    });

    it('isActive=true with one DIMMED override transitions opacity 1 → 0.3 over fadeDurationMs', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.3 } as IsolationOverride]]),
            isActive: true,
        });

        // 0 ms — should be writing close to start (1.0)
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(1, 3);

        // 100 ms (mid-fade — 50 % progress) → ~0.65
        advance(100);
        sched.tick();
        expect(mesh.material.opacity).toBeGreaterThan(0.5);
        expect(mesh.material.opacity).toBeLessThan(0.9);
        expect(mesh.material.transparent).toBe(true);

        // 200 ms total — finalize at 0.3.
        advance(100);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.3, 3);
        expect(mesh.material.transparent).toBe(true);
        expect(mesh.visible).toBe(true);

        a.stop();
    });

    it('HIDDEN tier → mesh.visible becomes false AFTER fade completes (not at fade start)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'HIDDEN' } as IsolationOverride]]),
            isActive: true,
        });

        // Mid-fade — must still be visible.
        sched.tick();
        expect(mesh.visible).toBe(true);
        advance(100);
        sched.tick();
        expect(mesh.visible).toBe(true);

        // End of fade — now hidden.
        advance(100);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0, 3);
        expect(mesh.visible).toBe(false);

        a.stop();
    });

    it('isActive=false (clearIsolation) → all elements restored to opacity 1 + visible true', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        // Step 1 — dim it.
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.2 } as IsolationOverride]]),
            isActive: true,
        });
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.2, 3);

        // Step 2 — clear.
        state.set({
            overrides: new Map<string, IsolationOverride>(),
            isActive: false,
        });
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBe(1);
        expect(mesh.material.transparent).toBe(false);
        expect(mesh.visible).toBe(true);

        a.stop();
    });

    it('mid-fade interruption restarts from the current mid-value (no jump)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();

        // First fade towards 0.2 — mid-way through.
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.2 } as IsolationOverride]]),
            isActive: true,
        });
        advance(100);
        sched.tick();
        const midOpacity = mesh.material.opacity;
        // We should be somewhere between 1 and 0.2.
        expect(midOpacity).toBeLessThan(1);
        expect(midOpacity).toBeGreaterThan(0.2);

        // Interrupt with a new target towards 0.5.
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.5 } as IsolationOverride]]),
            isActive: true,
        });
        // Immediately after restart — the next tick should write a value
        // near `midOpacity` (the new start), not a sudden jump to 0.5.
        sched.tick();
        expect(mesh.material.opacity).toBeGreaterThan(midOpacity - 0.05);
        expect(mesh.material.opacity).toBeLessThan(midOpacity + 0.05);

        // Finish the new fade — settles at 0.5.
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.5, 3);

        a.stop();
    });

    it('uses the injected `now` clock for progress (not Date.now)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 100 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0 } as IsolationOverride]]),
            isActive: true,
        });
        // No real wall-clock advance — only our manual clock.  If the
        // animator leaned on Date.now() this would race against test wall
        // clock and pass for the wrong reason.
        advance(100);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0, 3);
        a.stop();
    });

    it('stagger threshold: with 1500 elements, only `staggerChunkSize` are inited per scheduler tick', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, {
            now,
            fadeDurationMs: 200,
            staggerThreshold: 1000,
            staggerChunkSize: 200,
        });
        const overrides = new Map<string, IsolationOverride>();
        for (let i = 0; i < 1500; i++) {
            reg.register(`e${i}`);
            overrides.set(`e${i}`, { elementId: `e${i}`, tier: 'DIMMED', opacity: 0.2 });
        }
        a.start();

        state.set({ overrides, isActive: true });
        // The state-change callback DEFERS — no per-element writes yet.
        // (The state-change path doesn't reach into the registry at all
        // when staggered; only `_tick` does.)
        const before = countTouched(reg);

        sched.tick();                           // tick 1: 200 elements inited + drawn
        const afterTick1 = countTouched(reg);
        expect(afterTick1 - before).toBeGreaterThanOrEqual(200);
        expect(afterTick1 - before).toBeLessThanOrEqual(400);

        sched.tick();                           // tick 2: 200 more
        const afterTick2 = countTouched(reg);
        expect(afterTick2 - afterTick1).toBeGreaterThanOrEqual(200);

        a.stop();
    });

    it('multiple meshes per element: all meshes receive the same opacity update', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const meshes = reg.register('e1', 4);

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.4 } as IsolationOverride]]),
            isActive: true,
        });
        advance(200);
        sched.tick();
        for (const m of meshes) {
            expect(m.material.opacity).toBeCloseTo(0.4, 3);
            expect(m.material.transparent).toBe(true);
        }

        a.stop();
    });

    it('empty registry entry (no meshes) does not throw', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });

        a.start();
        // 'ghost' is in overrides but has no meshes registered.
        state.set({
            overrides: new Map([['ghost', { elementId: 'ghost', tier: 'HIDDEN' } as IsolationOverride]]),
            isActive: true,
        });
        expect(() => { advance(200); sched.tick(); }).not.toThrow();

        a.stop();
    });

    it('restoring on stop() only touches elements listed by registry.listElementIds()', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });
        const m1 = reg.register('e1')[0];
        // Orphan mesh — never registered; the animator must not see it.
        const orphan: MeshLike = { material: { opacity: 0.1, transparent: true }, visible: false };

        m1.material.opacity = 0.3;
        m1.material.transparent = true;

        a.start();
        a.stop();

        expect(m1.material.opacity).toBe(1);
        // Orphan is untouched.
        expect(orphan.material.opacity).toBe(0.1);
        expect(orphan.visible).toBe(false);
    });

    it('opacity is always in [0, 1] (clamp invariant)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0 } as IsolationOverride]]),
            isActive: true,
        });
        // Walk the fade in 10 ms steps — at every sampled point opacity is
        // bounded.
        for (let t = 0; t < 250; t += 25) {
            advance(25);
            sched.tick();
            expect(mesh.material.opacity).toBeGreaterThanOrEqual(0);
            expect(mesh.material.opacity).toBeLessThanOrEqual(1);
        }

        a.stop();
    });

    it('transparent=true when opacity < 1, transparent=false when opacity == 1', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        // Start: dim to 0.3 → transparent
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.3 } as IsolationOverride]]),
            isActive: true,
        });
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.3, 3);
        expect(mesh.material.transparent).toBe(true);

        // Restore: opacity → 1, transparent false.
        state.set({ overrides: new Map<string, IsolationOverride>(), isActive: false });
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBe(1);
        expect(mesh.material.transparent).toBe(false);

        a.stop();
    });

    it('does not call requestAnimationFrame at any point', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        reg.register('e1');

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.2 } as IsolationOverride]]),
            isActive: true,
        });
        advance(50); sched.tick();
        advance(50); sched.tick();
        advance(100); sched.tick();
        a.stop();

        expect(rafSpy!).not.toHaveBeenCalled();
        expect(rafCalls).toBe(0);
    });

    it('state notify with no real change does not start a redundant transition', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.4 } as IsolationOverride]]),
            isActive: true,
        });
        advance(200); sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.4, 3);

        // A no-change notify — same snapshot.  The animator may re-plan,
        // but the resulting opacity must remain at the target (not jump).
        state.notifyNoChange();
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.4, 3);

        a.stop();
    });

    it('calling start() twice is safe (no double-subscription)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });

        a.start();
        a.start();
        expect(state.listeners.length).toBe(1);
        expect(sched.listeners.length).toBe(1);

        a.stop();
    });

    it('calling stop() without start() is safe (idempotent)', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now });

        expect(() => a.stop()).not.toThrow();
        expect(state.listeners.length).toBe(0);
        expect(sched.listeners.length).toBe(0);
        // Stop again — still safe.
        expect(() => a.stop()).not.toThrow();
    });

    it('after stop(), subsequent state changes are ignored', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        a.stop();
        // Subscribers are gone — even if a stale listener somehow fires,
        // mesh state should remain at the post-stop default.
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'HIDDEN' } as IsolationOverride]]),
            isActive: true,
        });
        sched.tick();
        expect(mesh.material.opacity).toBe(1);
        expect(mesh.visible).toBe(true);
    });

    it('initial active state at start() begins the fade immediately', () => {
        const state = makeFakeState();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'DIMMED', opacity: 0.5 } as IsolationOverride]]),
            isActive: true,
        });
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const mesh = reg.register('e1')[0];

        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        a.start();
        // Without any state-change notification, the initial-active path
        // should already have queued a fade — verify by advancing.
        advance(200);
        sched.tick();
        expect(mesh.material.opacity).toBeCloseTo(0.5, 3);

        a.stop();
    });

    it('HIDDEN restore: previously-hidden element becomes visible again on clear', () => {
        const state = makeFakeState();
        const sched = makeFakeScheduler();
        const reg = makeFakeRegistry();
        const a = new IsolationAnimator(state, sched, reg, { now, fadeDurationMs: 200 });
        const mesh = reg.register('e1')[0];

        a.start();
        state.set({
            overrides: new Map([['e1', { elementId: 'e1', tier: 'HIDDEN' } as IsolationOverride]]),
            isActive: true,
        });
        advance(200); sched.tick();
        expect(mesh.visible).toBe(false);
        expect(mesh.material.opacity).toBeCloseTo(0, 3);

        state.set({ overrides: new Map<string, IsolationOverride>(), isActive: false });
        advance(200); sched.tick();
        expect(mesh.visible).toBe(true);
        expect(mesh.material.opacity).toBe(1);

        a.stop();
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function countTouched(reg: FakeRegistry): number {
    let n = 0;
    for (const v of reg.callCount.values()) n += v;
    return n;
}
