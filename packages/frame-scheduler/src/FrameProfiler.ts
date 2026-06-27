// FrameProfiler — a zero-cost-when-off, console-readable per-subsystem frame
// cost accumulator (founder request, 2026-06-27 perf pass).
//
// PURPOSE
// -------
// The founder reports orbit/render lag on a ~800-element, 7-level residential
// building and asked to SEE where the per-frame time goes rather than guess.
// This profiler hooks the single FrameScheduler.tick() (P3 — there is only one
// rAF) and buckets each frame's wall-clock cost by subsystem:
//   • render      — the tick-listener(s) whose id maps to the render pass
//   • wallFlush   — the WallRebuildCoordinator flush (id `once:engine-bootstrap-wall-flush:*`)
//   • shadow      — shadow / post-render reactivation listeners
//   • drain       — the priority-queue drain (batch geometry builds)
//   • other       — every remaining tick listener
// Once per second it logs ONE summary line:
//   [FrameProfiler] fps=58 frame=17.2ms | render=11.1 wallFlush=0.0 shadow=0.3 drain=0.0 other=5.5 (avg over 58 frames)
//
// FLAG (typed global, P4 — no `(window as any)`):
//   globalThis.__pryzmFrameProfile = true   // turn ON
//   delete globalThis.__pryzmFrameProfile    // turn OFF
// Console filter string for the founder:  [FrameProfiler]
//
// COST WHEN OFF
// -------------
// `isOn()` reads one typed global and returns; tick() short-circuits the whole
// profiler before taking any timestamp. Steady-state production frames pay a
// single boolean read per frame and nothing else.

/** Subsystem buckets the per-frame cost is attributed to. */
type FrameBucketKey = 'render' | 'wallFlush' | 'shadow' | 'drain' | 'other';

const _ZERO_BUCKETS = (): Record<FrameBucketKey, number> => ({
  render: 0,
  wallFlush: 0,
  shadow: 0,
  drain: 0,
  other: 0,
});

/**
 * Map a tick-listener id (e.g. `once:engine-bootstrap-wall-flush:4f`,
 * `render-pass`, `shadow-reactivate`) to a coarse subsystem bucket so the
 * one-line summary stays human-readable. Pure string-prefix match — cheap.
 */
function _bucketForListenerId(id: string): FrameBucketKey {
  // Wall rebuild flush (the founder's prime suspect — confirm it is NOT
  // per-frame: this bucket should read ~0.0 during a pure orbit).
  if (id.includes('engine-bootstrap-wall')) return 'wallFlush';
  if (id.includes('wall-flush') || id.includes('wall-bodies')) return 'wallFlush';
  // Render pass + the render-phase listeners.
  if (id.includes('render') || id.includes('overlay')) return 'render';
  // Shadow reactivation / post-fx convergence.
  if (id.includes('shadow') || id.includes('post-fx') || id.includes('postfx')) return 'shadow';
  return 'other';
}

/**
 * Per-frame cost accumulator. A single shared instance lives in
 * FrameScheduler. All methods are no-ops in the hot path unless `isOn()`.
 */
export class FrameProfiler {
  private _frames = 0;
  private _frameMsSum = 0;
  private readonly _buckets = _ZERO_BUCKETS();
  private _windowStartMs = 0;
  /** Set at the top of each frame so per-listener attribution can sum deltas. */
  private _on = false;

  /** One typed-global read — the only cost paid when profiling is OFF. */
  isOn(): boolean {
    this._on =
      (globalThis as unknown as { __pryzmFrameProfile?: boolean })
        .__pryzmFrameProfile === true;
    return this._on;
  }

  /** Call once at frame start (only when isOn()). `nowMs` = performance clock. */
  beginFrame(nowMs: number): void {
    if (this._windowStartMs === 0) this._windowStartMs = nowMs;
  }

  /** Attribute `ms` to the bucket for `listenerId`. */
  recordListener(listenerId: string, ms: number): void {
    this._buckets[_bucketForListenerId(listenerId)] += ms;
  }

  /** Attribute `ms` to the priority-queue drain. */
  recordDrain(ms: number): void {
    this._buckets.drain += ms;
  }

  /**
   * Call once at frame end with the total frame wall-time. Emits the
   * one-per-second summary line and resets the accumulators when the 1 s
   * window elapses. Returns nothing; logging is the side effect.
   */
  endFrame(frameMs: number, nowMs: number): void {
    this._frames++;
    this._frameMsSum += frameMs;

    if (nowMs - this._windowStartMs < 1000) return;

    const f = this._frames || 1;
    const fps = Math.round((f * 1000) / Math.max(1, nowMs - this._windowStartMs));
    const avgFrame = this._frameMsSum / f;
    const b = this._buckets;
    const p = (n: number): string => (n / f).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(
      `[FrameProfiler] fps=${fps} frame=${avgFrame.toFixed(1)}ms | ` +
        `render=${p(b.render)} wallFlush=${p(b.wallFlush)} shadow=${p(b.shadow)} ` +
        `drain=${p(b.drain)} other=${p(b.other)} (avg over ${f} frames)`,
    );

    // Reset the window.
    this._frames = 0;
    this._frameMsSum = 0;
    this._windowStartMs = nowMs;
    for (const k of Object.keys(b) as FrameBucketKey[]) b[k] = 0;
  }
}
