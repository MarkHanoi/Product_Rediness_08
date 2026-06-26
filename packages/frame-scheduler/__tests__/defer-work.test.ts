// §BACKGROUND-TAB-KEEPALIVE — deferWork() drop-in setTimeout replacement.
//
// Proves the executor finishing passes keep firing while the tab is hidden:
//   • Visible: deferWork honours the delay via setTimeout (foreground unchanged).
//   • Hidden: deferWork fires off the heartbeat pulse once the (heartbeat-clock)
//     due time passes — NOT waiting on the throttled setTimeout.
//   • The canceller prevents the callback from running.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackgroundHeartbeat,
  deferWork,
  _setBackgroundHeartbeatForTest,
  _resetBackgroundHeartbeatForTest,
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

function makeManualTimers(): HeartbeatTimers & { flush(): void; clock: number } {
  const queue: Array<() => void> = [];
  const t = {
    clock: 0,
    setTimeout(fn: () => void): unknown { queue.push(fn); return queue.length; },
    clearTimeout(): void {},
    now(): number { return t.clock; },
    flush(): void { const fns = queue.splice(0); for (const fn of fns) fn(); },
  };
  return t;
}

function makeVisibility(hidden: boolean): VisibilitySource & { setHidden(h: boolean): void } {
  let _hidden = hidden;
  const listeners = new Set<() => void>();
  return {
    get hidden() { return _hidden; },
    addEventListener(_t, l) { listeners.add(l); },
    removeEventListener(_t, l) { listeners.delete(l); },
    setHidden(h: boolean) { _hidden = h; for (const l of [...listeners]) l(); },
  };
}

afterEach(() => {
  _resetBackgroundHeartbeatForTest();
  vi.useRealTimers();
  delete (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean }).__pryzmDisableBackgroundKeepalive;
});

describe('deferWork (§BACKGROUND-TAB-KEEPALIVE)', () => {
  it('honours the delay via setTimeout while visible (foreground unchanged)', () => {
    vi.useFakeTimers();
    // Heartbeat singleton present but VISIBLE → it never pulses; setTimeout wins.
    const vis = makeVisibility(false);
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers: makeManualTimers(),
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);
    const fn = vi.fn();
    deferWork(fn, 150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires off the heartbeat pulse while hidden, once the due time passes', () => {
    vi.useFakeTimers();
    const vis = makeVisibility(true); // hidden
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);

    const fn = vi.fn();
    // deferWork uses performance.now()/Date.now() for its own clock; the
    // heartbeat uses `timers.now()` (our manual clock). Align them: advance the
    // manual clock so a pulse sees tickNow >= dueAt.
    deferWork(fn, 150);
    expect(fn).not.toHaveBeenCalled();

    // Pulse with not-yet-due clock → no fire.
    timers.clock = 0;
    timers.flush();
    expect(fn).not.toHaveBeenCalled();

    // Advance the heartbeat clock past the due time and pulse → fires.
    timers.clock = 1_000_000_000; // far past any dueAt
    timers.flush();
    expect(fn).toHaveBeenCalledTimes(1);

    // Idempotent: a further pulse does not re-fire.
    timers.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('canceller prevents the callback from running', () => {
    vi.useFakeTimers();
    const vis = makeVisibility(true);
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);

    const fn = vi.fn();
    const cancel = deferWork(fn, 150);
    cancel();
    timers.clock = 1_000_000_000;
    timers.flush();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    cancel(); // idempotent
  });

  it('kill-switch disables the heartbeat path — only setTimeout drives it', () => {
    vi.useFakeTimers();
    (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean }).__pryzmDisableBackgroundKeepalive = true;
    const vis = makeVisibility(true); // hidden
    const timers = makeManualTimers();
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers,
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);

    const fn = vi.fn();
    deferWork(fn, 50);
    // Heartbeat pulses must NOT fire it (disabled). No subscription was made.
    expect(hb.listenerCount).toBe(0);
    timers.clock = 1_000_000_000;
    timers.flush();
    expect(fn).not.toHaveBeenCalled();
    // setTimeout still fires it (throttled in real browsers, but here exact).
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('zero-delay default works (deferWork(fn))', () => {
    vi.useFakeTimers();
    const vis = makeVisibility(false); // visible
    const hb = new BackgroundHeartbeat({
      visibility: vis,
      timers: makeManualTimers(),
      channelFactory: makeSyncChannelFactory(),
    });
    _setBackgroundHeartbeatForTest(hb);
    const fn = vi.fn();
    deferWork(fn);
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
