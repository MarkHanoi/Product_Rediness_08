// progressScheduler — §PROGRESS-SCHEDULER.
//
// THE RULE
// --------
// **The frame bus is for work whose output is a frame.**  Work that must
// complete regardless of whether anyone is watching — project load, hydration,
// persistence, sync, solving — belongs here instead.
//
// P3 is untouched: there is still exactly ONE `requestAnimationFrame` call
// site (`RafAdapter.ts`).  This module is NOT a second rAF and never draws.
//
// WHY THE FRAME BUS IS THE WRONG HOME FOR THAT WORK
// -------------------------------------------------
// A hidden tab stops firing rAF entirely — not slowly, at zero.  Anything that
// advances one step per frame therefore advances zero steps per second while
// the user is in another window.  The `BackgroundHeartbeat` keeps such work
// alive, but its cadence is floored by a `setTimeout` that the browser clamps
// to >= 1 s when hidden (and to ~1/min under Chromium's intensive throttling).
// One step per second is fine for a background drain; it is NOT fine for a
// chunked project load with hundreds of chunks, and it is actively DANGEROUS
// because the raw-`setTimeout` watchdogs that guard those pipelines keep firing
// on approximately real time.  A watchdog that force-completes a pipeline which
// has merely been parked is how a hidden tab produces a half-hydrated project.
//
// THE DRIVER CHOICE
// -----------------
// When hidden we yield through a `MessageChannel` macrotask:
//
//   * NOT rAF          — 0 Hz when hidden; that is the bug.
//   * NOT setTimeout   — clamped to >= 1 s (and ~1/min after ~5 min hidden).
//   * NOT a microtask  — unclamped, but a microtask chain never returns to the
//                        macrotask queue, so socket frames, `postMessage` from
//                        workers and abort signals are starved for the whole
//                        run.  Correctness of the load at the cost of the
//                        network is not a trade we want.
//   * NOT a Web Worker — immune to throttling, but the work touches stores,
//                        THREE and the DOM, so it cannot be moved off-thread
//                        without rewriting the pipelines it is meant to rescue.
//   * MessageChannel   — a `port.postMessage` is delivered on the macrotask
//                        queue and is NOT subject to the timer clamp.  It is
//                        demand-driven (exactly one post per requested yield),
//                        so unlike a self-perpetuating ping-pong it never spins
//                        the CPU, and because it IS a macrotask, I/O and timers
//                        still interleave between chunks.
//
// The chunking exists to keep the UI responsive.  When the tab is hidden there
// is no UI to keep responsive, so the yield collapses to the cheapest hop that
// still lets the event loop breathe — and the pipeline runs to completion at
// full speed instead of at 1 Hz.
//
// When VISIBLE the behaviour is unchanged: we yield on the frame bus exactly as
// before, so the user still sees a progressive build.

import { getFrameScheduler } from './singleton.js';
import type { TickPriority } from './types.js';
import { withSpan } from './otel.js';

/** Cancel a pending `scheduleProgress` callback.  Idempotent. */
export type ProgressCanceller = () => void;

/**
 * Minimal structural port shape — mirrors `HeartbeatPort` so tests can inject a
 * synchronous fake channel without a real `MessageChannel`.
 */
export interface ProgressPort {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close?(): void;
}

export type ProgressChannelFactory = () => { port1: ProgressPort; port2: ProgressPort };

// ── Shared one-shot macrotask pump ──────────────────────────────────────────
// One channel per tab, one queued callback per post.  Lazily constructed so the
// module stays side-effect-free at import time.

let _channelFactory: ProgressChannelFactory | null = null;
let _port: ProgressPort | null = null;
const _queue: Array<() => void> = [];

function defaultChannelFactory(): { port1: ProgressPort; port2: ProgressPort } {
  const ch = new MessageChannel();
  return {
    port1: ch.port1 as unknown as ProgressPort,
    port2: ch.port2 as unknown as ProgressPort,
  };
}

function ensurePort(): ProgressPort | null {
  if (_port !== null) return _port;
  try {
    const ch = (_channelFactory ?? defaultChannelFactory)();
    ch.port2.onmessage = () => {
      // Drain exactly one entry per delivered message so the queue stays in
      // lock-step with the posts that scheduled it.
      const fn = _queue.shift();
      if (fn === undefined) return;
      try {
        fn();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[progressScheduler] macrotask callback error:', err);
      }
    };
    _port = ch.port1;
    return _port;
  } catch {
    // No MessageChannel in this host (bare Node without globals) — callers fall
    // back to the frame bus.
    return null;
  }
}

/**
 * True when the document is hidden, i.e. when frame-bus work is not being
 * driven by rAF and there is no visible UI to keep responsive.
 *
 * Treats "no document" (headless / SSR / unit tests) as visible so those hosts
 * keep the deterministic frame-bus path.
 */
export function isHiddenForProgress(): boolean {
  return withSpan('pryzm.frame.progress.is-hidden', {}, () => {
    if ((globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
          .__pryzmDisableBackgroundKeepalive === true) {
      return false;
    }
    const doc = (globalThis as { document?: { hidden?: boolean } }).document;
    return doc?.hidden === true;
  });
}

/**
 * Schedule `fn` on the next **unclamped macrotask** via the shared
 * `MessageChannel`.  Returns a canceller.  Falls back to `queueMicrotask` if the
 * host has no `MessageChannel`.
 *
 * This is the visibility-independent primitive; it is NOT throttled by the tab
 * being hidden and it is NOT a second rAF.
 */
export function postProgressMacrotask(fn: () => void): ProgressCanceller {
  return withSpan('pryzm.frame.progress.post-macrotask', {}, () => {
    let cancelled = false;
    const entry = (): void => { if (!cancelled) fn(); };

    const port = ensurePort();
    if (port === null) {
      queueMicrotask(entry);
    } else {
      _queue.push(entry);
      port.postMessage(0);
    }

    return (): void => {
      if (cancelled) return;
      cancelled = true;
      const idx = _queue.indexOf(entry);
      if (idx !== -1) _queue.splice(idx, 1);
    };
  });
}

/**
 * Yield control so a long pipeline can be chunked, WITHOUT making progress
 * depend on the tab being visible.
 *
 * - **Visible**: resolves on the next frame-bus tick — the browser paints
 *   between chunks, so the user still sees a progressive build (unchanged
 *   behaviour).
 * - **Hidden**: resolves on the next unclamped macrotask — no paint is possible
 *   and none is waited for, so the pipeline runs to completion at full speed
 *   instead of at the background timer clamp.
 *
 * @param reason  Short label used for the frame-bus listener id and the span.
 * @param phase   Frame-bus phase used when visible (default `'post-render'`).
 */
export function yieldForProgress(
  reason: string,
  phase: TickPriority = 'post-render',
): Promise<void> {
  return withSpan(
    'pryzm.frame.progress.yield',
    { 'pryzm.frame.progress.reason': reason },
    () => new Promise<void>((resolve) => {
      if (isHiddenForProgress()) {
        postProgressMacrotask(resolve);
        return;
      }
      getFrameScheduler().scheduleOnce(reason, () => resolve(), phase);
    }),
  );
}

/**
 * Callback form of `yieldForProgress` — the shape a self-re-arming drain uses
 * (`scheduleProgress(reason, drainNext)` in place of
 * `scheduler.scheduleOnce(reason, drainNext, 'post-render')`).
 *
 * Returns a canceller.
 *
 * @param reason  Short label used for the frame-bus listener id and the span.
 * @param fn      The work to run.
 * @param phase   Frame-bus phase used when visible (default `'post-render'`).
 */
export function scheduleProgress(
  reason: string,
  fn: () => void,
  phase: TickPriority = 'post-render',
): ProgressCanceller {
  return withSpan(
    'pryzm.frame.progress.schedule',
    { 'pryzm.frame.progress.reason': reason },
    () => {
      if (isHiddenForProgress()) return postProgressMacrotask(fn);
      return getFrameScheduler().scheduleOnce(reason, () => fn(), phase);
    },
  );
}

/** Test-only — inject a deterministic channel factory and reset the pump. */
export function _setProgressChannelFactoryForTest(
  factory: ProgressChannelFactory | null,
): void {
  _channelFactory = factory;
  try { _port?.close?.(); } catch { /* non-fatal */ }
  _port = null;
  _queue.length = 0;
}
