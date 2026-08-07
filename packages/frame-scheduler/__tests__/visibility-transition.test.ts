// §PROGRESS-SCHEDULER — the VISIBLE→HIDDEN transition.
//
// The pre-existing `background-heartbeat.test.ts` suite only ever constructs a
// scheduler that is ALREADY hidden when `start()` runs.  That is not the
// founder's scenario.  The founder's scenario is:
//
//   1. open a project in a VISIBLE tab (the scheduler arms rAF),
//   2. switch to Visual Studio mid-load (the tab becomes hidden),
//   3. the browser stops firing rAF — the armed callback NEVER runs.
//
// `scheduleNext()` is the ONLY place that consults `_shouldUseBackgroundPump()`,
// and `scheduleNext()` is only reachable from `tick()`, which is driven by the
// rAF that just stopped.  So the hand-off to the heartbeat can never happen and
// every non-visual subscriber on the frame bus (project load chunking, room
// redetect, geometry drains, batch coordination) parks at 0 Hz.
//
// These tests pin the transition in BOTH directions.

import { afterEach, describe, expect, it } from 'vitest';
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

function makeSyncChannelFactory(): ChannelFactory {
  return () => {
    const port2: HeartbeatPort = { postMessage: () => {}, onmessage: null };
    const port1: HeartbeatPort = {
      postMessage: () => { port2.onmessage?.({ data: 0 }); },
      onmessage: null,
    };
    return { port1, port2 };
  };
}

function makeManualTimers(): HeartbeatTimers & { flush(): void; pending(): number; clock: number } {
  const queue: Array<() => void> = [];
  return {
    clock: 0,
    setTimeout(fn: () => void): unknown { queue.push(fn); return queue.length; },
    clearTimeout(): void { /* handle-specific cancel not modelled */ },
    now(): number { return this.clock; },
    flush(): void { for (const fn of queue.splice(0)) fn(); },
    pending(): number { return queue.length; },
  };
}

/** A visibility source whose listeners fire in registration order — the same
 *  order a real `document` dispatches `visibilitychange` to its listeners. */
function makeVisibility(initialHidden: boolean): VisibilitySource & { setHidden(h: boolean): void } {
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

afterEach(() => {
  _resetBackgroundHeartbeatForTest();
  delete (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
    .__pryzmDisableBackgroundKeepalive;
});

describe('FrameScheduler VISIBLE→HIDDEN hand-off (§PROGRESS-SCHEDULER)', () => {
  it('hands the pump to the heartbeat when the tab hides mid-flight', () => {
    const { vis, timers, restore } = installHeartbeat(false); // start VISIBLE
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('project-load-in-progress');
      s.start(adapter);

      // Foreground: armed on rAF, heartbeat idle.
      expect(adapter.pendingCount()).toBe(1);
      expect(timers.pending()).toBe(0);

      // The founder switches to Visual Studio.  A real browser now STOPS
      // firing rAF — so we deliberately never pump the adapter again.
      vis.setHidden(true);

      // The scheduler must have abandoned the (dead) rAF handle and armed the
      // heartbeat instead.  Before the fix this asserted 0 and the pump was
      // stranded forever.
      expect(timers.pending()).toBe(1);

      // And the work must actually advance off the heartbeat.
      let ticks = 0;
      s.addTickListener('work', () => { ticks++; }, 'post-render');
      timers.flush();
      expect(ticks).toBe(1);
      timers.flush();
      expect(ticks).toBe(2);

      s.stop();
    } finally {
      restore();
    }
  });

  it('drains a chunked non-visual queue across a hide that happens mid-drain', () => {
    const { vis, timers, restore } = installHeartbeat(false); // start VISIBLE
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();

      // The shape ProjectLoader's §LOAD-REDETECT-CHUNKED drain uses: a
      // self-re-arming post-render chain, one level per frame.
      const drained: number[] = [];
      let remaining = 4;
      const drainNext = (): void => {
        drained.push(remaining);
        remaining--;
        if (remaining > 0) s.scheduleOnce('project-load-redetect', drainNext, 'post-render');
      };
      s.markDirty('project-load-in-progress');
      s.scheduleOnce('project-load-redetect', drainNext, 'post-render');
      s.start(adapter);

      // Two levels drain in the foreground on rAF.
      adapter.advanceTime(16); adapter.pump();
      adapter.advanceTime(16); adapter.pump();
      expect(drained).toEqual([4, 3]);

      // Tab hides.  rAF is dead from here on — never pump the adapter again.
      vis.setHidden(true);

      // The remaining levels MUST still drain, off the heartbeat.
      timers.flush();
      timers.flush();
      expect(remaining).toBe(0);
      expect(drained).toEqual([4, 3, 2, 1]);

      s.stop();
    } finally {
      restore();
    }
  });

  it('returns to the rAF path when the tab becomes visible again', () => {
    const { vis, timers, restore } = installHeartbeat(false);
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('work');
      s.start(adapter);
      vis.setHidden(true);
      expect(timers.pending()).toBe(1);

      vis.setHidden(false);
      // Back on rAF, and the heartbeat has been released.
      expect(adapter.pendingCount()).toBe(1);
      s.stop();
    } finally {
      restore();
    }
  });

  it('kill-switch keeps the pure-rAF behaviour across a hide', () => {
    const { vis, timers, restore } = installHeartbeat(false);
    (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
      .__pryzmDisableBackgroundKeepalive = true;
    try {
      const s = new FrameScheduler();
      const adapter = new FakeRafAdapter();
      s.markDirty('work');
      s.start(adapter);
      vis.setHidden(true);
      // Keep-alive disabled → no heartbeat, the rAF handle is left in place.
      expect(timers.pending()).toBe(0);
      expect(adapter.pendingCount()).toBe(1);
      s.stop();
    } finally {
      restore();
    }
  });
});
