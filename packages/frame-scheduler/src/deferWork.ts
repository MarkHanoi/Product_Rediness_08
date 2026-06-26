// deferWork — §BACKGROUND-TAB-KEEPALIVE.
//
// Drop-in replacement for `setTimeout(fn, delayMs)` in WORK-pipeline code
// (generation executors, AI-batch finishing passes, poll loops).  The problem:
// raw `setTimeout` is CLAMPED to ≥ 1000 ms in a background tab, so the
// residential/apartment executors' deferred passes (`_buildEntranceDoor`,
// `_finishCoreDoors`, `_finishGroundCommercialWindows`, `_finishPublicFloors`,
// the apartment-finish poll loop, …) crawl to a near-stop when the user
// switches tabs mid-generation.
//
// `deferWork(fn, delayMs)` honours the delay with a normal `setTimeout` while
// the tab is VISIBLE (foreground behaviour byte-identical — same timer), but
// when the tab is HIDDEN it rides the unthrottled `BackgroundHeartbeat`
// (MessageChannel pulse, not clamped to 1 s) so the deferred pass fires on
// schedule and the generation chain keeps progressing to completion.
//
// USAGE (one-line adoption in an executor):
//   // BEFORE:  setTimeout(() => this._finishCoreDoors(), 150);
//   // AFTER:   import { deferWork } from '@pryzm/frame-scheduler';
//   //          deferWork(() => this._finishCoreDoors(), 150);
//
// Returns a canceller; call it to cancel the pending work (mirrors
// clearTimeout(handle)).  The work runs on the MAIN THREAD in both paths — the
// heartbeat only supplies the unthrottled pulse, it does not move work to a
// worker (the passes touch THREE / stores / DOM).

import { getBackgroundHeartbeat } from './BackgroundHeartbeat.js';
import { withSpan } from './otel.js';

/** Cancel a pending `deferWork` call.  Idempotent. */
export type DeferWorkCanceller = () => void;

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function keepaliveDisabled(): boolean {
  return (globalThis as { __pryzmDisableBackgroundKeepalive?: boolean })
    .__pryzmDisableBackgroundKeepalive === true;
}

/**
 * Schedule `fn` to run after `delayMs`, resilient to background-tab throttling.
 *
 * - Foreground (visible) or keep-alive disabled: a plain `setTimeout(fn, delayMs)`
 *   (identical to the code it replaces).
 * - Background (hidden): the delay is honoured against the heartbeat clock and
 *   `fn` fires off the unthrottled MessageChannel pulse — NOT clamped to 1 s.
 *
 * If the tab flips visibility mid-delay, the still-pending path adapts on the
 * next tick (a hidden→visible flip lets the original `setTimeout` fire; a
 * visible→hidden flip is picked up by the heartbeat poll).  Either way `fn`
 * runs exactly once.
 *
 * @returns a canceller (`() => void`) that prevents `fn` from running if called
 *          before it fires.
 */
export function deferWork(fn: () => void, delayMs = 0): DeferWorkCanceller {
  return withSpan(
    'pryzm.frame.defer-work',
    { 'pryzm.frame.defer_work.delay_ms': delayMs },
    () => {
      let done = false;
      const dueAt = nowMs() + Math.max(0, delayMs);

      let timer: ReturnType<typeof setTimeout> | null = null;
      let heartbeatUnsub: (() => void) | null = null;

      const run = (): void => {
        if (done) return;
        done = true;
        cleanup();
        try {
          fn();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[deferWork] callback error:', err);
        }
      };

      const cleanup = (): void => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (heartbeatUnsub !== null) { try { heartbeatUnsub(); } catch { /* noop */ } heartbeatUnsub = null; }
      };

      // The foreground timer always runs (cheap) so a hidden→visible flip still
      // fires `fn` promptly.  It is clamped in the background — that's fine; the
      // heartbeat subscription below covers the background case on time.
      timer = setTimeout(run, Math.max(0, delayMs));

      // Background path: subscribe to the heartbeat.  It pulses only while the
      // tab is hidden; each pulse checks whether the (heartbeat-clock) due time
      // has passed and fires `fn` if so.  Subscribing is a no-op cost while
      // visible (the heartbeat self-suspends), so this is safe to always wire
      // when keep-alive is enabled.
      if (!keepaliveDisabled()) {
        try {
          const heartbeat = getBackgroundHeartbeat();
          heartbeatUnsub = heartbeat.subscribe((tickNow) => {
            if (done) return;
            if (tickNow >= dueAt) run();
          });
        } catch {
          // No MessageChannel in this host — the plain setTimeout above remains
          // the (throttled, best-effort) fallback.
        }
      }

      return (): void => {
        if (done) return;
        done = true;
        cleanup();
      };
    },
  );
}
