/**
 * §PERF-TICK-ORDER-IS-CACHED — the guard for the tick-listener order cache.
 *
 * `_tick()` used to rebuild `[...tickListeners.values()]` every frame and scan it
 * once per priority (P=4), i.e. one allocation and 4N iterations per frame to make
 * N calls. It now iterates a cached, already-priority-ordered list, rebuilt only
 * when the listener set changes.
 *
 * ⭐ THE RISK THE OPTIMISATION CREATES is not slowness, it is STALENESS and
 * ALIASING — a cache that misses an invalidation runs the wrong listeners, and a
 * cache mutated in place changes a tick that is already in flight. Speed is not
 * tested here (a timing assertion in CI is a flake); EQUIVALENCE is.
 *
 * Measured before/after, for the record — 20,000 dirty frames, best of 5,
 * "before" being the real pre-change class extracted via `git show`:
 *   N=10:  15.7 ms → 11.5 ms  (−26.7%)
 *   N=27:  24.1 ms → 13.3 ms  (−44.9%, 0.54 us/frame)
 * ⛔ That is 0.54 us out of a 16,700 us frame budget. It is a real cut to the
 * scheduler's OWN dispatch overhead and 60 fewer array allocations/second, and it
 * is NOT a user-visible speedup on its own. Do not cite it as one.
 */

import { describe, it, expect } from 'vitest';
import { FrameScheduler } from '../src/FrameScheduler.js';
import { FakeRafAdapter } from '../src/RafAdapter.js';

/**
 * Drive one frame that the idle gate will actually run.
 *
 * ⛔ `markDirty` is REQUIRED: the idle-continuation budget (ADR-006) stops the
 * scheduler after 30 workless frames, and a test that pumps without it silently
 * stops exercising its own subject. That defect was live in this change's first
 * benchmark (`frames=100` ran `810` listener calls = exactly 30 frames).
 */
function frame(s: FrameScheduler, a: FakeRafAdapter): void {
    s.markDirty('test');
    a.advanceTime(1000 / 60);
    a.pump();
}

function setup(): { s: FrameScheduler; a: FakeRafAdapter; log: string[] } {
    const s = new FrameScheduler();
    const a = new FakeRafAdapter();
    const log: string[] = [];
    s.start(a);
    return { s, a, log };
}

describe('§PERF-TICK-ORDER-IS-CACHED — order cache equivalence', () => {
    it('runs listeners in TICK_PRIORITIES order, insertion order within a priority', () => {
        const { s, a, log } = setup();
        // Registered deliberately OUT of priority order.
        s.addTickListener('o1', () => log.push('o1'), 'overlay');
        s.addTickListener('r1', () => log.push('r1'), 'render');
        s.addTickListener('pre1', () => log.push('pre1'), 'pre-render');
        s.addTickListener('post1', () => log.push('post1'), 'post-render');
        s.addTickListener('r2', () => log.push('r2'), 'render');
        s.addTickListener('pre2', () => log.push('pre2'), 'pre-render');

        frame(s, a);
        expect(log).toEqual(['pre1', 'pre2', 'r1', 'r2', 'post1', 'o1']);
    });

    it('the cached order is stable across many frames', () => {
        const { s, a, log } = setup();
        s.addTickListener('a', () => log.push('a'), 'pre-render');
        s.addTickListener('b', () => log.push('b'), 'render');

        for (let i = 0; i < 5; i++) frame(s, a);
        expect(log).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
    });

    it('⭐ a listener ADDED between frames is picked up (cache invalidates)', () => {
        const { s, a, log } = setup();
        s.addTickListener('a', () => log.push('a'), 'render');
        frame(s, a);
        expect(log).toEqual(['a']);

        s.addTickListener('b', () => log.push('b'), 'render');
        frame(s, a);
        expect(log).toEqual(['a', 'a', 'b']);
    });

    it('⭐ a listener REMOVED between frames stops running (cache invalidates)', () => {
        const { s, a, log } = setup();
        s.addTickListener('a', () => log.push('a'), 'render');
        const disposeB = s.addTickListener('b', () => log.push('b'), 'render');
        frame(s, a);
        expect(log).toEqual(['a', 'b']);

        disposeB();
        frame(s, a);
        expect(log).toEqual(['a', 'b', 'a']);
    });

    it('a re-added listener lands in its priority position, not at the old index', () => {
        const { s, a, log } = setup();
        const disposeA = s.addTickListener('a', () => log.push('a'), 'overlay');
        s.addTickListener('b', () => log.push('b'), 'render');
        frame(s, a);
        expect(log).toEqual(['b', 'a']);

        disposeA();
        s.addTickListener('a', () => log.push('a'), 'pre-render'); // now FIRST
        log.length = 0;
        frame(s, a);
        expect(log).toEqual(['a', 'b']);
    });

    it('⛔ SNAPSHOT: a listener added DURING a tick does not run until next frame', () => {
        const { s, a, log } = setup();
        let added = false;
        s.addTickListener('adder', () => {
            log.push('adder');
            if (!added) {
                added = true;
                // Registered at an EARLIER priority — under a non-snapshotting
                // implementation this could run within this same tick.
                s.addTickListener('late', () => log.push('late'), 'pre-render');
            }
        }, 'render');

        frame(s, a);
        expect(log).toEqual(['adder']);          // 'late' must NOT have run

        frame(s, a);
        expect(log).toEqual(['adder', 'late', 'adder']);
    });

    it('⛔ SNAPSHOT: a listener removed DURING a tick still runs on that frame', () => {
        const { s, a, log } = setup();
        let disposeVictim = (): void => {};
        s.addTickListener('killer', () => { log.push('killer'); disposeVictim(); }, 'pre-render');
        disposeVictim = s.addTickListener('victim', () => log.push('victim'), 'render');

        frame(s, a);
        // The victim was removed before its turn, but the tick iterates the list
        // it started with — preserving the pre-change contract exactly.
        expect(log).toEqual(['killer', 'victim']);

        frame(s, a);
        expect(log).toEqual(['killer', 'victim', 'killer']);
    });

    it('reset() clears listeners and the cache with them', () => {
        const { s, a, log } = setup();
        s.addTickListener('a', () => log.push('a'), 'render');
        frame(s, a);
        expect(log).toEqual(['a']);

        s.reset();
        s.start(a);
        frame(s, a);
        expect(log).toEqual(['a']);              // nothing new ran

        s.addTickListener('c', () => log.push('c'), 'render');
        frame(s, a);
        expect(log).toEqual(['a', 'c']);
    });

    it('a throwing listener does not stop the ones after it', () => {
        const { s, a, log } = setup();
        s.addTickListener('boom', () => { throw new Error('expected'); }, 'pre-render');
        s.addTickListener('after', () => log.push('after'), 'render');
        frame(s, a);
        expect(log).toEqual(['after']);
    });

    it('a disposer called twice is safe and does not resurrect the listener', () => {
        const { s, a, log } = setup();
        const dispose = s.addTickListener('a', () => log.push('a'), 'render');
        s.addTickListener('b', () => log.push('b'), 'render');
        dispose();
        dispose();                                // idempotent
        frame(s, a);
        expect(log).toEqual(['b']);
    });
});
