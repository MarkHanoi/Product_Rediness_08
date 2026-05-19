// rAF abstraction — production wraps `globalThis.requestAnimationFrame`; tests
// use `FakeRafAdapter` which exposes synchronous frame pumping.
//
// Per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S03-T1` (line 351) only
// `packages/frame-scheduler/src/**` may use the real `requestAnimationFrame`.
// This file is the single allowed call site (enforced by `pryzm/no-raf` lint
// + `tools/scripts/check-no-raf-in-pryzm2.mjs`).
//
// The interface intentionally mirrors the browser shape (handle is a
// `number`, `cancel(handle)` is best-effort) so a thin stub passes through
// to the platform without translation.

export type RafCallback = (now: number) => void;

export interface RafAdapter {
  request(cb: RafCallback): number;
  cancel(handle: number): void;
  /**
   * Current high-resolution timestamp in the same time-base the adapter
   * passes to its `RafCallback`.  Used by `FrameScheduler.start()` to
   * anchor `lastTickTime` so the first observed `deltaMs` is meaningful
   * (i.e. relative to start, not relative to the Unix epoch).
   */
  now(): number;
}

/**
 * Production adapter — delegates to `globalThis.requestAnimationFrame`.
 * Throws if the host has no rAF (e.g. headless Node without a polyfill);
 * the FrameScheduler's `start()` accepts an adapter override so non-DOM
 * environments inject their own.
 */
export class GlobalRafAdapter implements RafAdapter {
  request(cb: RafCallback): number {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      throw new Error(
        '[FrameScheduler] globalThis.requestAnimationFrame is not available — ' +
          'pass a RafAdapter to FrameScheduler.start() in headless environments.',
      );
    }
    return globalThis.requestAnimationFrame(cb);
  }

  cancel(handle: number): void {
    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(handle);
    }
  }

  now(): number {
    // `performance.now()` is the same time-base the browser passes to
    // rAF callbacks (DOMHighResTimeStamp), so anchoring `lastTickTime`
    // to it yields a small, meaningful first-frame delta.
    if (typeof globalThis.performance?.now === 'function') {
      return globalThis.performance.now();
    }
    return Date.now();
  }
}

/**
 * Test adapter — synchronous, deterministic.  Use `setNow` / `advanceTime` to
 * advance the simulated clock, then `pump()` to fire the queued callback(s).
 */
export class FakeRafAdapter implements RafAdapter {
  private nextHandle = 1;
  private clock = 0;
  private readonly pending = new Map<number, RafCallback>();

  setNow(n: number): void {
    this.clock = n;
  }

  advanceTime(deltaMs: number): void {
    this.clock += deltaMs;
  }

  currentTime(): number {
    return this.clock;
  }

  /** RafAdapter contract — same time-base callbacks receive. */
  now(): number {
    return this.clock;
  }

  request(cb: RafCallback): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, cb);
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  /** Synchronously fire all pending callbacks at the current `now`. */
  pump(): number {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    for (const cb of callbacks) cb(this.clock);
    return callbacks.length;
  }

  /** Pump N consecutive frames at `frameMs` intervals (default 60 Hz). */
  pumpFrames(count: number, frameMs = 1000 / 60): void {
    for (let i = 0; i < count; i++) {
      this.advanceTime(frameMs);
      this.pump();
    }
  }

  pendingCount(): number {
    return this.pending.size;
  }
}
