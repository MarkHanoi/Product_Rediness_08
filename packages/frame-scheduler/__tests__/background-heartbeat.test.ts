// §BACKGROUND-TAB-KEEPALIVE — verifies the background-resilient work pump.
//
// Three guarantees under test:
//   1. While `document.hidden`, the WORK tick advances off the heartbeat
//      (MessageChannel pulse) even though rAF is paused (the FakeRafAdapter
//      never fires).
//   2. While VISIBLE, the scheduler uses rAF exactly as before (foreground
//      byte-identical — the heartbeat never pulses).
//   3. A queued FrameScheduler `scheduleOnce` callback (the shape the
//      BatchCoordinator drain uses) fully drains while "hidden".

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackgroundHeartbeat,
  FakeRafAdapter,
  FrameScheduler,
  _resetBackgroundHeartbeatForTest,
  _setBackgroundHeartbeatForTest,
  type ChannelFactory,
  type HeartbeatPort,
  type HeartbeatTimers,
  type VisibilitySource,
} from '../src/index.js';

// ── Test doubles ────────────────────────────────────────────────────────────

/** A synchronous in-memory MessageChannel: a post on the returned port1 invokes
 *  port2.onmessage immediately (deterministic, no real macrotask). */
function makeSyncChannelFactory(): ChannelFactory {
  return () => {
    const port2: HeartbeatPort = { postMessage: () => {}, onmessage: null };
    const port1: HeartbeatPort = {
      postMessage: () => {
        // Synchronous delivery to the opposite port.
        port2.onmessage?.({ data: 0 });
      },
      onmessage: null,
    };
    return { port1, port2 };
  };
}

/** Controllable timers — `setTimeout` callbacks are queued, fired by `flush()`. */
function makeManualTimers(): HeartbeatTimers & { flush(): void; pending(): number; clock: number } {
  const queue: Array<() => void> = [];
  return {
    clock: 0,
    setTimeout(fn: () => void): unknown {
      queue.push(fn);
      return queue.length;
    },
    clearTimeout(): void {
      // We don't model handle-specific cancel for these tests; flush only runs
      // callbacks still in the queue, and `stop()` empties via running=false guards.
    },
    now(): number {
      return this.clock;
    },
    flush(): void {
      const fns = queue.splice(0);
      for (const fn of fns) fn();
    },
    pending(): number {
      return queue.length;
    },
  };
}

/** A mutable visibility source with a manual `visibilitychange` dispatcher. */
function makeVisibility(initialHidden: boolean): VisibilitySource & {
  setHidden(h: boolean): void;
} {
  let hidden = initialHidden;
  const listeners = new Set<() => void>();
  return {
    get hidden() { return hidden; },
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    setHidden(h: boolean) {
      hidden = h;
      for (const l of [...listeners]) l();
    },
  };
}

afterEach(() => {
  _resetBackgroundHeartbeatForTest();
  delete (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean }).__pryzmDisableBackgroundKeepalive;
});

// ── BackgroundHeartbeat unit behaviour ──────────────────────────────────────

describe('BackgroundHeartbeat (§BACKGROUND-TAB-KEEPALIVE)', () => {
  it('does NOT pulse while the document is visible', () => {
    const vis = makeVisibility(false); // visible
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const tick = vi.fn();
    hb.subscribe(tick);
    // Nothing was armed (visible) → flushing the (empty) timer queue is a no-op.
    timers.flush();
    expect(tick).not.toHaveBeenCalled();
    hb.dispose();
  });

  it('pulses the work tick while the document is hidden (rAF-independent)', () => {
    const vis = makeVisibility(true); // hidden
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const ticks: number[] = [];
    hb.subscribe((now) => ticks.push(now));
    // One arm pending; flushing it posts on the channel → sync delivery → tick.
    expect(timers.pending()).toBe(1);
    timers.flush(); // fires the timer → postMessage → _onPulse → tick → re-arm
    expect(ticks.length).toBe(1);
    // It re-armed itself for the next pulse.
    expect(timers.pending()).toBe(1);
    timers.flush();
    expect(ticks.length).toBe(2);
    hb.dispose();
  });

  it('stops pulsing once the tab becomes visible mid-run', () => {
    const vis = makeVisibility(true);
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const tick = vi.fn();
    hb.subscribe(tick);
    timers.flush();
    expect(tick).toHaveBeenCalledTimes(1);
    // Become visible: the in-flight re-arm should not pulse anymore.
    vis.setHidden(false);
    timers.flush();
    expect(tick).toHaveBeenCalledTimes(1); // no further pulses while visible
    hb.dispose();
  });

  it('isolates a throwing listener and keeps pulsing', () => {
    const vis = makeVisibility(true);
    const timers = makeManualTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    let good = 0;
    hb.subscribe(() => { throw new Error('boom'); });
    hb.subscribe(() => { good++; });
    timers.flush();
    expect(errSpy).toHaveBeenCalled();
    expect(good).toBe(1);
    errSpy.mockRestore();
    hb.dispose();
  });

  it('start() is idempotent and stop()/dispose() are safe to repeat', () => {
    const vis = makeVisibility(true);
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    expect(hb.isRunning).toBe(false);
    hb.start();
    expect(hb.isRunning).toBe(true);
    hb.start(); // idempotent — no second arm
    hb.stop();
    expect(hb.isRunning).toBe(false);
    hb.stop(); // idempotent
    hb.dispose();
    hb.dispose(); // idempotent
  });

  it('subscribe disposer stops the heartbeat when the last listener leaves', () => {
    const vis = makeVisibility(true);
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const unsubA = hb.subscribe(() => {});
    const unsubB = hb.subscribe(() => {});
    expect(hb.listenerCount).toBe(2);
    expect(hb.isRunning).toBe(true);
    unsubA();
    expect(hb.isRunning).toBe(true); // B still subscribed
    unsubB();
    expect(hb.listenerCount).toBe(0);
    expect(hb.isRunning).toBe(false); // auto-stopped
    hb.dispose();
  });

  it('a visibilitychange to hidden re-arms the pump immediately', () => {
    const vis = makeVisibility(false); // start visible
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const tick = vi.fn();
    hb.subscribe(tick);
    // Visible — nothing armed.
    expect(timers.pending()).toBe(0);
    // Go hidden: the visibilitychange handler arms the pump.
    vis.setHidden(true);
    expect(timers.pending()).toBe(1);
    timers.flush();
    expect(tick).toHaveBeenCalledTimes(1);
    hb.dispose();
  });

  it('default construction (real MessageChannel + no document) is inert and safe', async () => {
    // Exercises defaultChannelFactory / defaultTimers / resolveVisibilitySource
    // with NO injected options. In the Node test env there is no `document`, so
    // the heartbeat resolves a null visibility source and never pulses — proving
    // the foreground/headless path imposes zero work.
    const hb = new BackgroundHeartbeat({ intervalMs: 1 });
    expect(hb.isHidden).toBe(false); // no document → treated as visible
    const tick = vi.fn();
    hb.subscribe(tick);
    expect(hb.isRunning).toBe(true);
    // Give any (non-existent) pulse a real macrotask to (not) fire.
    await new Promise((r) => setTimeout(r, 5));
    expect(tick).not.toHaveBeenCalled();
    hb.dispose();
  });

  it('survives a host without document/MessageChannel addEventListener (no-op visibility)', () => {
    // visibility source without addEventListener — constructor must not throw.
    const bareVis = { hidden: true } as unknown as VisibilitySource;
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: bareVis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    const tick = vi.fn();
    hb.subscribe(tick);
    timers.flush();
    expect(tick).toHaveBeenCalledTimes(1);
    hb.dispose();
  });
});

// ── FrameScheduler integration: rAF when visible, heartbeat when hidden ──────

describe('FrameScheduler background pump (§BACKGROUND-TAB-KEEPALIVE)', () => {
  /** Install a fake hidden/visible document + a fake-timer heartbeat as the
   *  process singleton so the scheduler resolves OUR deterministic heartbeat. */
  function installHeartbeat(initialHidden: boolean) {
    const vis = makeVisibility(initialHidden);
    const timers = makeManualTimers();
    const realDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = vis;
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);
    const restore = () => {
      if (realDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = realDoc;
    };
    return { vis, timers, hb, restore };
  }

  it('uses rAF (NOT the heartbeat) while VISIBLE — foreground byte-identical', () => {
    const { timers, restore } = installHeartbeat(false); // visible
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('work');
      s.start(adapter);
      // rAF callback is queued on the adapter (foreground path, unchanged).
      expect(adapter.pendingCount()).toBe(1);
      // The heartbeat never armed a timer while visible.
      expect(timers.pending()).toBe(0);
      adapter.advanceTime(16);
      adapter.pump();
      expect(adapter.pendingCount()).toBe(1); // still pumping via rAF
      s.stop();
    } finally {
      restore();
    }
  });

  it('drains a queued scheduleOnce callback while HIDDEN, driven by the heartbeat (rAF never fires)', () => {
    const { timers, restore } = installHeartbeat(true); // hidden
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      // Emulate the BatchCoordinator registration drain: a self-re-arming
      // 'pre-render' chain that needs several scheduler ticks to finish.
      let remaining = 3;
      const drained: number[] = [];
      const drainStep = (): void => {
        drained.push(remaining);
        remaining--;
        if (remaining > 0) {
          s.scheduleOnce('batch-coordinator-drain', drainStep, 'pre-render');
        }
      };
      s.markDirty('batch-coordinator-in-progress'); // keeps the loop "running"
      s.scheduleOnce('batch-coordinator-drain', drainStep, 'pre-render');
      s.start(adapter);

      // The scheduler diverted to the heartbeat: NO rAF callback is pending.
      expect(adapter.pendingCount()).toBe(0);
      // Each heartbeat pulse advances the scheduler's tick → one drain step.
      timers.flush(); // tick 1 → step (remaining 3 → 2), re-arms
      timers.flush(); // tick 2 → step (2 → 1)
      timers.flush(); // tick 3 → step (1 → 0)
      expect(remaining).toBe(0);
      expect(drained).toEqual([3, 2, 1]);
      // rAF was NEVER used to drive this drain.
      expect(adapter.pendingCount()).toBe(0);
      s.stop();
    } finally {
      restore();
    }
  });

  it('returns to the rAF path the instant the tab becomes VISIBLE again', () => {
    const { vis, timers, restore } = installHeartbeat(true); // hidden
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('work');
      s.start(adapter);
      // Hidden → heartbeat path, no rAF queued.
      expect(adapter.pendingCount()).toBe(0);
      expect(timers.pending()).toBe(1);
      // Flip to visible — the scheduler's visibility bridge re-arms rAF.
      vis.setHidden(false);
      expect(adapter.pendingCount()).toBe(1); // back on rAF
      s.stop();
    } finally {
      restore();
    }
  });

  it('kill-switch (__pryzmDisableBackgroundKeepalive) forces the rAF path even when hidden', () => {
    const { timers, restore } = installHeartbeat(true); // hidden
    (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean }).__pryzmDisableBackgroundKeepalive = true;
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('work');
      s.start(adapter);
      // Keep-alive disabled → rAF path regardless of hidden state.
      expect(adapter.pendingCount()).toBe(1);
      expect(timers.pending()).toBe(0);
      s.stop();
    } finally {
      restore();
    }
  });
});
