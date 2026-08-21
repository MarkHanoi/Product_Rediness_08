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
//   [FrameProfiler] fps=58 frame=17.2ms p95=21.0 worst=118.4 hitches=2/58 | render=11.1 wallFlush=0.0 shadow=0.3 drain=0.0 other=5.5
//
// ⭐ §NAV-SMOOTHNESS (L-1782) — WHY THE DISTRIBUTION, AND NOT JUST THE AVERAGE.
// -----------------------------------------------------------------------------
// This profiler shipped reporting `fps` and an AVERAGE frame time, and by
// construction those two numbers CANNOT SEE the thing the founder is reporting.
// His words are "I want to navigate flowing as you do in the reference editor" —
// that is a complaint about SMOOTHNESS, and smoothness is a property of the WORST
// frames, not the mean of all of them.
//
// A second holding 58 frames of 8 ms and 2 frames of 120 ms averages to 17.2 ms
// and prints `fps=58`, which reads as healthy. It is not: the user SAW two visible
// stalls. Meanwhile a rock-steady 40 fps averages 25 ms, prints WORSE on both
// shipped numbers, and FEELS better. So an instrument that reports only mean and
// fps will rank a hitchy session above a smooth one — it does not merely fail to
// inform, it actively points the next reader away from the defect.
//
// Hence three additions, all derived from the SAME per-frame samples already being
// summed, so the hot path gains one array push and nothing else:
//   • `worst`   — the single worst frame in the window. This is the hitch.
//   • `p95`     — the 95th percentile: what the BAD frames cost, not the mean.
//   • `hitches` — frames over HITCH_MS, counted, with their denominator. A count
//                 without its denominator is the kind of bare number this repo has
//                 been wrong about repeatedly, so it always prints `n/total`.
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
/**
 * §NAV-SMOOTHNESS — a frame costing more than this is a HITCH: something the user
 * perceives as a stutter rather than as a slower-but-steady scene.
 *
 * 32 ms is deliberately ~2 frames at 60 Hz, i.e. the first duration at which a
 * frame is definitely DROPPED rather than merely late. It is a legibility
 * threshold for a console line, NOT a budget, NOT a gate, and nothing fails
 * because of it — the raw `worst` and `p95` are printed beside it precisely so
 * the reader is never dependent on where this line is drawn.
 */
const HITCH_MS = 32;

/**
 * Cap on retained per-frame samples per 1 s window. A window is ~60 frames; 240
 * is four times that, so it never truncates in practice and cannot grow without
 * bound if a window runs long (a stalled tab, a debugger pause).
 */
const MAX_SAMPLES = 240;

export class FrameProfiler {
  private _frames = 0;
  private _frameMsSum = 0;
  private readonly _buckets = _ZERO_BUCKETS();
  private _windowStartMs = 0;
  /** §NAV-SMOOTHNESS — per-frame costs for this window, for p95 / worst. */
  private _samples: number[] = [];
  /** §NAV-SMOOTHNESS — worst single frame in this window, ms. */
  private _worstMs = 0;
  /** §NAV-SMOOTHNESS — frames over HITCH_MS in this window. */
  private _hitches = 0;
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
    // §NAV-SMOOTHNESS — one comparison, one increment and (bounded) one push.
    if (frameMs > this._worstMs) this._worstMs = frameMs;
    if (frameMs > HITCH_MS) this._hitches++;
    if (this._samples.length < MAX_SAMPLES) this._samples.push(frameMs);

    if (nowMs - this._windowStartMs < 1000) return;

    const f = this._frames || 1;
    const fps = Math.round((f * 1000) / Math.max(1, nowMs - this._windowStartMs));
    const avgFrame = this._frameMsSum / f;
    const b = this._buckets;
    const p = (n: number): string => (n / f).toFixed(1);
    const p95 = this._percentile(95);
    // ⭐ The SMOOTHNESS verdict leads, because it is the question being asked.
    // Sorted so the eye lands on the distribution before the bucket breakdown:
    // the buckets say WHERE a frame goes, `worst`/`hitches` say WHETHER the user
    // is feeling it at all.
    const verdict =
      this._hitches > 0 ? ` ⚠ ${this._hitches}/${f} frames over ${HITCH_MS}ms`
      : this._worstMs > HITCH_MS / 2 ? ' 🟡 no dropped frames, but headroom is thin'
      : ' ✅ smooth';
    // eslint-disable-next-line no-console
    console.log(
      `[FrameProfiler] fps=${fps} frame=${avgFrame.toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)} worst=${this._worstMs.toFixed(1)} ` +
        `hitches=${this._hitches}/${f} | ` +
        `render=${p(b.render)} wallFlush=${p(b.wallFlush)} shadow=${p(b.shadow)} ` +
        `drain=${p(b.drain)} other=${p(b.other)}` + verdict,
    );

    // Reset the window.
    this._frames = 0;
    this._frameMsSum = 0;
    this._windowStartMs = nowMs;
    this._samples.length = 0;
    this._worstMs = 0;
    this._hitches = 0;
    for (const k of Object.keys(b) as FrameBucketKey[]) b[k] = 0;
  }

  /**
   * §NAV-SMOOTHNESS — nearest-rank percentile over this window's samples.
   *
   * Sorting runs ONCE PER SECOND on at most MAX_SAMPLES numbers, in the same
   * branch that was already about to log — never in the per-frame path. An
   * instrument that costs a sort every frame would join the population it is
   * measuring, which is the one thing a frame profiler must not do.
   *
   * Returns 0 for an empty window, which is unambiguous here because the caller
   * only reaches this after at least one frame.
   */
  private _percentile(pct: number): number {
    const n = this._samples.length;
    if (n === 0) return 0;
    const sorted = this._samples.slice().sort((a, b) => a - b);
    const rank = Math.ceil((pct / 100) * n) - 1;
    return sorted[Math.min(Math.max(rank, 0), n - 1)] ?? 0;
  }
}
