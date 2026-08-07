// §PROGRESS-SCHEDULER — the visibility-independent work driver.
//
// The rule under test: work whose output is a FRAME may stop when the tab is
// hidden; work that must COMPLETE regardless of whether anyone is watching must
// not.  These tests pin both halves — the frame-bus path when visible, and the
// unclamped macrotask path when hidden — and prove that a chunked pipeline runs
// to completion while hidden with rAF permanently stopped.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeRafAdapter,
  _resetFrameSchedulerForTest,
  _setProgressChannelFactoryForTest,
  getFrameScheduler,
  isHiddenForProgress,
  postProgressMacrotask,
  scheduleProgress,
  yieldForProgress,
  type ProgressChannelFactory,
  type ProgressPort,
} from '../src/index.js';

/** A synchronous in-memory MessageChannel — a post on port1 delivers to port2
 *  immediately, so macrotask ordering is deterministic in the assertions. */
function makeSyncChannelFactory(): ProgressChannelFactory {
  return () => {
    const port2: ProgressPort = { postMessage: () => {}, onmessage: null };
    const port1: ProgressPort = {
      postMessage: () => { port2.onmessage?.({ data: 0 }); },
      onmessage: null,
    };
    return { port1, port2 };
  };
}

function setHidden(hidden: boolean): () => void {
  const real = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { hidden };
  return () => {
    if (real === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = real;
  };
}

afterEach(() => {
  _setProgressChannelFactoryForTest(null);
  _resetFrameSchedulerForTest();
  delete (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
    .__pryzmDisableBackgroundKeepalive;
});

describe('isHiddenForProgress', () => {
  it('reports false when there is no document (headless / SSR)', () => {
    const real = (globalThis as { document?: unknown }).document;
    delete (globalThis as { document?: unknown }).document;
    try {
      expect(isHiddenForProgress()).toBe(false);
    } finally {
      if (real !== undefined) (globalThis as { document?: unknown }).document = real;
    }
  });

  it('reports the document hidden flag', () => {
    let restore = setHidden(true);
    try { expect(isHiddenForProgress()).toBe(true); } finally { restore(); }
    restore = setHidden(false);
    try { expect(isHiddenForProgress()).toBe(false); } finally { restore(); }
  });

  it('honours the keep-alive kill-switch (forces the frame-bus path)', () => {
    const restore = setHidden(true);
    (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
      .__pryzmDisableBackgroundKeepalive = true;
    try {
      expect(isHiddenForProgress()).toBe(false);
    } finally { restore(); }
  });
});

describe('postProgressMacrotask', () => {
  it('runs the callback off the channel', () => {
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    const fn = vi.fn();
    postProgressMacrotask(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending callback', () => {
    // A queue-only factory: posts are recorded, delivery is manual.
    const posted: Array<() => void> = [];
    _setProgressChannelFactoryForTest(() => {
      const port2: ProgressPort = { postMessage: () => {}, onmessage: null };
      const port1: ProgressPort = {
        postMessage: () => { posted.push(() => port2.onmessage?.({ data: 0 })); },
        onmessage: null,
      };
      return { port1, port2 };
    });
    const fn = vi.fn();
    const cancel = postProgressMacrotask(fn);
    cancel();
    cancel(); // idempotent
    for (const deliver of posted) deliver();
    expect(fn).not.toHaveBeenCalled();
  });

  it('isolates a throwing callback', () => {
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => postProgressMacrotask(() => { throw new Error('boom'); })).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('falls back to a microtask when the host has no MessageChannel', async () => {
    _setProgressChannelFactoryForTest(() => { throw new Error('no MessageChannel'); });
    const fn = vi.fn();
    postProgressMacrotask(fn);
    expect(fn).not.toHaveBeenCalled(); // microtask, not synchronous
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('works with the real default MessageChannel (no injected factory)', async () => {
    // Exercises `defaultChannelFactory` — Node >= 15 provides MessageChannel,
    // so this proves the production path, not just the test double.
    _setProgressChannelFactoryForTest(null);
    const seen: number[] = [];
    postProgressMacrotask(() => seen.push(1));
    postProgressMacrotask(() => seen.push(2));
    expect(seen).toEqual([]); // real macrotask — not synchronous
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([1, 2]);
  });

  it('ignores a delivered message with an empty queue', () => {
    // A cancelled entry removes itself from the queue but its post is already
    // in flight, so the port must tolerate an empty drain.
    const posted: Array<() => void> = [];
    _setProgressChannelFactoryForTest(() => {
      const port2: ProgressPort = { postMessage: () => {}, onmessage: null };
      const port1: ProgressPort = {
        postMessage: () => { posted.push(() => port2.onmessage?.({ data: 0 })); },
        onmessage: null,
      };
      return { port1, port2 };
    });
    const fn = vi.fn();
    postProgressMacrotask(fn)(); // schedule then immediately cancel
    expect(() => { for (const deliver of posted) deliver(); }).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it('drains posts in FIFO order', () => {
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    const seen: number[] = [];
    postProgressMacrotask(() => seen.push(1));
    postProgressMacrotask(() => seen.push(2));
    postProgressMacrotask(() => seen.push(3));
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('yieldForProgress', () => {
  it('resolves on the FRAME BUS when visible (progressive build preserved)', async () => {
    const restore = setHidden(false);
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);

      let resolved = false;
      const p = yieldForProgress('project-load-chunk').then(() => { resolved = true; });

      // Not resolved until a frame actually fires.
      await Promise.resolve();
      expect(resolved).toBe(false);

      adapter.advanceTime(16);
      adapter.pump();
      await p;
      expect(resolved).toBe(true);
      s.stop();
    } finally { restore(); }
  });

  it('resolves WITHOUT a frame when hidden (rAF never fires)', async () => {
    const restore = setHidden(true);
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);

      // Deliberately never pump the adapter — this models a hidden tab, where
      // the browser stops firing rAF altogether.
      await yieldForProgress('project-load-chunk');
      // Reaching here at all is the assertion: before §PROGRESS-SCHEDULER this
      // promise never settled.
      expect(true).toBe(true);
      s.stop();
    } finally { restore(); }
  });

  it('runs a chunked pipeline to completion while hidden, with rAF stopped', async () => {
    const restore = setHidden(true);
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);

      // The shape ProjectLoader's §LOAD-CHUNKED dispatch uses: N chunks, each
      // separated by an awaited yield.
      const CHUNKS = 200;
      const built: number[] = [];
      for (let i = 0; i < CHUNKS; i++) {
        built.push(i);
        await yieldForProgress('project-load-chunk');
      }

      expect(built).toHaveLength(CHUNKS);
      // No yield was ever parked on the frame bus — the whole pipeline
      // completed without a single frame being drawn.
      expect(s.tickListenerCount()).toBe(0);
      expect(adapter.pumpCount).toBe(0);
      s.stop();
    } finally { restore(); }
  });
});

describe('scheduleProgress', () => {
  it('routes to the frame bus when visible', () => {
    const restore = setHidden(false);
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);
      const fn = vi.fn();
      scheduleProgress('project-load-redetect', fn);
      expect(fn).not.toHaveBeenCalled();
      adapter.advanceTime(16);
      adapter.pump();
      expect(fn).toHaveBeenCalledTimes(1);
      s.stop();
    } finally { restore(); }
  });

  it('drains a self-re-arming chain while hidden', () => {
    const restore = setHidden(true);
    _setProgressChannelFactoryForTest(makeSyncChannelFactory());
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);

      // ProjectLoader's §LOAD-REDETECT-CHUNKED drain shape.
      const drained: number[] = [];
      let remaining = 5;
      const drainNext = (): void => {
        drained.push(remaining);
        remaining--;
        if (remaining > 0) scheduleProgress('project-load-redetect', drainNext);
      };
      scheduleProgress('project-load-redetect', drainNext);

      expect(remaining).toBe(0);
      expect(drained).toEqual([5, 4, 3, 2, 1]);
      // The chain never parked a listener on the frame bus, and no frame ran.
      expect(s.tickListenerCount()).toBe(0);
      expect(adapter.pumpCount).toBe(0);
      s.stop();
    } finally { restore(); }
  });

  it('returns a working canceller on the frame-bus path', () => {
    const restore = setHidden(false);
    try {
      const s = getFrameScheduler();
      const adapter = new FakeRafAdapter();
      s.start(adapter);
      const fn = vi.fn();
      const cancel = scheduleProgress('cancel-me', fn);
      cancel();
      adapter.advanceTime(16);
      adapter.pump();
      expect(fn).not.toHaveBeenCalled();
      s.stop();
    } finally { restore(); }
  });
});
