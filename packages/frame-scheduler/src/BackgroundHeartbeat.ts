// BackgroundHeartbeat — §BACKGROUND-TAB-KEEPALIVE.
//
// PROBLEM
// -------
// Browsers throttle background tabs aggressively:
//   • `requestAnimationFrame` is PAUSED entirely while `document.hidden` is
//     true (the rAF pump in `RafAdapter` never fires).
//   • `setTimeout` / `setInterval` are CLAMPED to ≥ 1000 ms.
// PRYZM's generation / AI-batch / file-open pipelines advance their work
// across scheduler frames (the rAF-driven `FrameScheduler` tick + the
// `BatchCoordinator` drain) and across raw `setTimeout(..., 150)` deferred
// passes in the residential/apartment executors.  When the user switches to
// another tab mid-generation, the rAF pump stops and the setTimeouts crawl,
// so the build STALLS ("Building 160 elements…" never finishes).
//
// SOLUTION
// --------
// A `MessageChannel`-based heartbeat.  `MessageChannel.port.postMessage()`
// is NOT subject to the background `setTimeout` ≥ 1000 ms clamp — a
// `port.onmessage → port.postMessage` ping-pong runs at near-full speed even
// when the tab is hidden.  We pair it with a short `setTimeout` so the
// cadence is time-paced (≈ every `intervalMs`) rather than a busy spin: the
// timer arms the next post, the message delivers the tick on the macrotask
// queue.  Even clamped to 1000 ms, that is FAR better than rAF (which is 0 Hz
// when hidden) and keeps the work queue draining steadily to completion.
//
// This is the SINGLE additional work-pump owned by the frame-scheduler module
// (P3: the single rAF still lives in `RafAdapter`; this heartbeat is the
// background-only fallback, also owned here — not scattered across consumers).
// It NEVER drives rendering: rendering stays paused in the background (no point
// drawing an invisible canvas).  Only WORK callbacks ride the heartbeat.
//
// The heartbeat is inert unless something subscribes to it AND the document is
// hidden, so it imposes zero cost on a normal foreground session.

import { withSpan } from './otel.js';

export type HeartbeatTick = (now: number) => void;

/** Default background heartbeat cadence (ms).  Kept small so background work
 *  drains quickly; the actual floor when hidden is the browser clamp, but on
 *  many engines MessageChannel pacing beats the 1000 ms setTimeout clamp. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 16;

/**
 * Minimal subset of `Document` this module touches.  Kept structural so the
 * heartbeat unit-tests can inject a fake `{ hidden }` without a full DOM and so
 * the module imports nothing DOM-typed (it runs in Node test envs too).
 */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener?(type: 'visibilitychange', listener: () => void): void;
  removeEventListener?(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Structural shape of one end of a `MessageChannel` — `postMessage` + the
 * `onmessage` slot.  Lets tests inject a synchronous fake port without a real
 * `MessageChannel` (which happy-dom / Node provide, but which would make the
 * heartbeat fire on a real macrotask and complicate deterministic assertions).
 */
export interface HeartbeatPort {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close?(): void;
}

/** Factory that yields the two linked ports of a channel. */
export type ChannelFactory = () => { port1: HeartbeatPort; port2: HeartbeatPort };

/** Timer primitives — injectable so tests drive the cadence deterministically. */
export interface HeartbeatTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

function defaultChannelFactory(): { port1: HeartbeatPort; port2: HeartbeatPort } {
  // `MessageChannel` is available in browsers and in Node ≥ 15 / happy-dom.
  const ch = new MessageChannel();
  return { port1: ch.port1 as unknown as HeartbeatPort, port2: ch.port2 as unknown as HeartbeatPort };
}

function defaultTimers(): HeartbeatTimers {
  return {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () =>
      typeof globalThis.performance?.now === 'function'
        ? globalThis.performance.now()
        : Date.now(),
  };
}

function resolveVisibilitySource(explicit?: VisibilitySource): VisibilitySource | null {
  if (explicit) return explicit;
  const doc = (globalThis as { document?: VisibilitySource }).document;
  return doc ?? null;
}

export interface BackgroundHeartbeatOptions {
  intervalMs?: number;
  channelFactory?: ChannelFactory;
  timers?: HeartbeatTimers;
  /** Override the visibility source (defaults to `globalThis.document`). */
  visibility?: VisibilitySource;
}

/**
 * An unthrottled background tick source.  Subscribe a `HeartbeatTick`; while
 * the heartbeat is `running` AND the document is hidden it pumps the tick on a
 * `MessageChannel` ping-pong paced by a short `setTimeout`.  When the document
 * is visible the heartbeat idles (rAF drives work foreground — see
 * `FrameScheduler`).
 *
 * The heartbeat does NOT decide WHAT work runs — it just supplies the unthrottled
 * pulse.  `FrameScheduler` subscribes one tick that runs its WORK drain
 * (`_tick`) when hidden; `getBackgroundHeartbeat()` is also exposed so
 * `deferWork()` can schedule one-shot deferred passes off the same pulse.
 */
export class BackgroundHeartbeat {
  private readonly intervalMs: number;
  private readonly timers: HeartbeatTimers;
  private readonly port: HeartbeatPort;
  private readonly visibility: VisibilitySource | null;

  private readonly listeners = new Set<HeartbeatTick>();
  private running = false;
  private armed = false;
  private timerHandle: unknown = null;
  private readonly onVisibilityChange: () => void;

  constructor(opts: BackgroundHeartbeatOptions = {}) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.timers = opts.timers ?? defaultTimers();
    this.visibility = resolveVisibilitySource(opts.visibility);

    const channel = (opts.channelFactory ?? defaultChannelFactory)();
    this.port = channel.port1;
    // port1.postMessage delivers to port2.onmessage on a real MessageChannel,
    // so we post on port1 and listen on port2 — keeping a single pump object.
    channel.port2.onmessage = () => this._onPulse();

    this.onVisibilityChange = () => {
      // When the tab becomes hidden mid-work, kick the pump immediately so the
      // first background tick does not wait a full rAF that will never come.
      if (this.running && this._isHidden()) this._arm();
    };
    if (this.visibility?.addEventListener) {
      this.visibility.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** True iff the document is currently hidden (background tab). */
  private _isHidden(): boolean {
    return this.visibility?.hidden === true;
  }

  /** Public read — used by `FrameScheduler` to decide rAF vs heartbeat pump. */
  get isHidden(): boolean {
    return this._isHidden();
  }

  /** Number of live tick subscribers (test/diagnostic). */
  get listenerCount(): number {
    return this.listeners.size;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Subscribe a tick callback.  Returns a disposer.  Adding the first listener
   * starts the heartbeat; removing the last stops it.  The callback fires only
   * while the document is hidden.
   */
  subscribe(tick: HeartbeatTick): () => void {
    this.listeners.add(tick);
    this.start();
    return () => {
      this.listeners.delete(tick);
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Begin pumping (idempotent).  Inert until the document is hidden. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this._arm();
  }

  /** Stop pumping (idempotent).  Cancels any armed timer. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timerHandle !== null) {
      this.timers.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.armed = false;
  }

  /** Permanently tear down — remove the visibility listener + close the port. */
  dispose(): void {
    this.stop();
    this.listeners.clear();
    if (this.visibility?.removeEventListener) {
      this.visibility.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    try { this.port.close?.(); } catch { /* non-fatal */ }
  }

  /**
   * Arm the next pulse: start a short `setTimeout` whose callback posts on the
   * channel.  The `setTimeout` is clamped to ≥ 1000 ms when hidden on some
   * engines, but the `postMessage` it triggers is NOT clamped, so the *delivery*
   * of the tick (and any re-arm chained from it) runs promptly.  We deliberately
   * keep the timer short; the clamp is a floor, never a ceiling we add to.
   */
  private _arm(): void {
    if (!this.running || this.armed) return;
    // Only pump in the background — foreground work rides rAF (see FrameScheduler).
    if (!this._isHidden()) {
      this.armed = false;
      return;
    }
    this.armed = true;
    this.timerHandle = this.timers.setTimeout(() => {
      this.timerHandle = null;
      // Hand off to the MessageChannel: its delivery is not subject to the
      // background setTimeout clamp, so the tick (and the re-arm chained from
      // it) lands on the next macrotask regardless of tab visibility.
      this.port.postMessage(0);
    }, this.intervalMs);
  }

  /** MessageChannel delivered a pulse — run the work tick, then re-arm. */
  private _onPulse(): void {
    this.armed = false;
    if (!this.running) return;
    if (!this._isHidden()) {
      // Tab became visible between arm and delivery — yield to rAF.
      return;
    }
    const now = this.timers.now();
    withSpan(
      'pryzm.frame.background-heartbeat',
      { 'pryzm.frame.heartbeat.listener_count': this.listeners.size },
      () => {
        // Snapshot so a listener that subscribes/unsubscribes during the tick
        // does not perturb this pulse's iteration.
        for (const tick of [...this.listeners]) {
          try {
            tick(now);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[BackgroundHeartbeat] tick listener error:', err);
          }
        }
      },
    );
    // Re-arm for the next pulse (still hidden → keeps draining).
    this._arm();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process-singleton accessor — mirrors getFrameScheduler() so consumers
// (FrameScheduler, deferWork) share ONE heartbeat per tab.
let _instance: BackgroundHeartbeat | null = null;

/** Returns the process-wide shared `BackgroundHeartbeat`.  Lazy-constructed. */
export function getBackgroundHeartbeat(): BackgroundHeartbeat {
  if (_instance === null) {
    _instance = new BackgroundHeartbeat();
  }
  return _instance;
}

/** Test-only — drop the cached singleton (and dispose it) between vitest runs. */
export function _resetBackgroundHeartbeatForTest(): void {
  if (_instance !== null) {
    _instance.dispose();
    _instance = null;
  }
}

/** Test-only — install a pre-wired heartbeat as the process singleton so a
 *  scheduler-integration test can drive it with injected fake timers/channel.
 *  Production code never calls this. */
export function _setBackgroundHeartbeatForTest(hb: BackgroundHeartbeat | null): void {
  if (_instance !== null && _instance !== hb) {
    _instance.dispose();
  }
  _instance = hb;
}
