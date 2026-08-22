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
//   • overlay     — SECONDARY surfaces: the plan/split canvases, PIP, panels
//   • wallFlush   — the WallRebuildCoordinator flush (id `once:engine-bootstrap-wall-flush:*`)
//   • shadow      — shadow / post-render reactivation listeners
//   • drain       — the priority-queue drain (batch geometry builds)
//   • other       — every remaining tick listener
// Once per second it logs ONE summary line:
//   [FrameProfiler] backend=webgl fps=58 frame=17.2ms cpu=11.4ms p95=21.0 worst=118.4 hitches=2/58 | render=11.1 overlay=0.4 wallFlush=0.0 shadow=0.3 drain=0.0 other=5.5
//
// ⭐ §NAV-BUCKET-THAT-NEVER-PRINTS (L-5903, lane NAV29, 2026-08-22) — WHY `overlay=`
// IS ON THAT LINE NOW.
// -----------------------------------------------------------------------------
// `overlay` has been a member of `FrameBucketKey` and of `_ZERO_BUCKETS()` since the
// profiler shipped, and `recordListener()` has always been willing to add time to it
// — but the `console.log` above did not print it. Nothing was mis-summed; the
// accumulator simply had no way out. It was HARMLESS ONLY BY ACCIDENT: no id in the
// table and no arm of the substring fallback ever returned `'overlay'`
// (`id.includes('overlay')` returns `'render'`), so the bucket was unreachable.
//
// ⛔ The moment L-5901's census work classified the eleven real secondary-surface
// listeners — `plan-view-manager`, `split-view-manager`, `annotation-render-layer`,
// `pip-renderer-loop`, and the rest — that latent hole would have SILENTLY EATEN
// their cost: they would have left `other=`, arrived nowhere, and the columns would
// have summed to less than the frame with no indication that anything was missing.
// A profiler whose columns do not add up is worse than one with a coarse bucket,
// because the reader subtracts and concludes the residual is off-thread.
// `frame-profiler-interval-and-buckets.test.ts` now pins CONSERVATION — every
// `FrameBucketKey` must appear in the emitted line — so a future bucket cannot be
// added and left unprinted the way this one was.
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
type FrameBucketKey = 'render' | 'overlay' | 'wallFlush' | 'shadow' | 'drain' | 'other';

const _ZERO_BUCKETS = (): Record<FrameBucketKey, number> => ({
  render: 0,
  overlay: 0,
  wallFlush: 0,
  shadow: 0,
  drain: 0,
  other: 0,
});

/**
 * ⭐ §NAV-PROFILER-BUCKETS-THE-WRONG-LISTENER (L-5901, lane NAV24, 2026-08-22) —
 * THE EXPLICIT TABLE, BECAUSE SUBSTRING-GUESSING GOT THE EDITOR EXACTLY BACKWARDS.
 *
 * This map used to be four `id.includes(...)` guesses and nothing else. MEASURED
 * against the real production listener ids (the repo census in
 * `packages/frame-scheduler/__tests__/frame-profiler-interval-and-buckets.test.ts`;
 * re-take it with `npx vitest run --root packages/frame-scheduler`), it was wrong in BOTH
 * directions on `apps/editor` — the app the founder actually runs:
 *
 *   · `unified-frame-loop` → **other**. That single listener
 *     (`UnifiedFrameLoop.ts:284`) is the editor's ENTIRE render: the PASCAL
 *     callback → `RenderPipelineManager.render()` → the WebGPU TSL pipeline or the
 *     lightweight WebGL2 `renderer.render()`, PLUS every nested tick listener
 *     `UnifiedFrameLoop` runs inside itself. It contains no substring this function
 *     looked for, so the `render=` column read **0.0 by construction** on every
 *     session, while `other=` carried the whole frame.
 *   · `renderer.scene-reconcile` → **render**. It reconciles the scene GRAPH
 *     (`bootstrap.render.ts:121` adds/removes Object3Ds); it draws nothing. It was
 *     the one editor-adjacent id that DID match, so the only thing the `render=`
 *     column could ever have shown was the one listener that is not a render.
 *   · `enhanced-bloom-service` / `ssgi-service` → **other**, though both call
 *     `composer.render()` and the header above already declares a post-FX bucket.
 *
 * An instrument that names the wrong subsystem does not merely fail to inform — it
 * spends someone's afternoon. That verdict is written in
 * `UnifiedFrameLoop.ts` about a hardcoded "WebGPU" string; this is the same defect
 * in the same frame, one file over.
 *
 * ⛔ SO THE TABLE IS EXPLICIT AND PINNED BY A CENSUS TEST. This repo has recorded
 * repeatedly that a classifier keyed on NAMES can be satisfied by RENAMING (CLAUDE.md,
 * P4 `commandManager`). The mitigation is not to go back to guessing: it is that
 * `frame-profiler-interval-and-buckets.test.ts` SCANS THE REPO for every id passed
 * to `addTickListener(` and fails when one is not classified here. Adding a per-frame
 * listener is therefore a decision that must be made twice — once at the call site and
 * once in this table — exactly the discipline §FEAT-LIFT-COMPOUND-SYSTEM's census guard
 * applies to lift types.
 *
 * `_bucketForListenerId` keeps the substring fallback for the `once:<reason>:<seq>`
 * ids minted by `scheduleOnce()`, which are generated and cannot be enumerated.
 *
 * ⭐ THE CLASSIFICATION RULE, WRITTEN DOWN (lane NAV29, 2026-08-22) — because the
 * predecessor left the table half-filled and a half-filled table with no stated rule
 * is finished by taste, which is how a classifier drifts.
 *
 * ⛔ THE BUCKET ANSWERS *"WHAT WORK IS THIS?"*, NEVER *"WHEN DOES IT RUN?"* The
 * temptation is to copy the listener's registered `TickPriority` (`'pre-render'`,
 * `'render'`, `'post-render'`, `'overlay'`) into the bucket, since both vocabularies
 * use the word "render". That would be wrong in both directions and MEASURABLY so:
 * `plan-view-manager` registers at `'pre-render'` and paints an entire second
 * viewport; `level-explode-tick` registers at `'render'` and draws nothing at all,
 * it lerps object positions. Priority orders execution. The bucket names cost.
 *
 *   · `render`    — issues the MAIN viewport's draw, or wraps the pass that does.
 *   · `overlay`   — paints a SECONDARY surface: its own canvas, its own WebGL
 *                   context, a PIP, or a floating DOM panel synced per frame.
 *                   ⚠ Three of these own a SEPARATE `THREE.WebGLRenderer`
 *                   (`pip-renderer-loop`, `floating-object-carousel-loop`,
 *                   `panorama-panel-render`) — a second and third GL context on the
 *                   same GPU as the viewport. On the WebGL-only session the founder
 *                   runs, that is not a rounding error, and it is invisible while
 *                   their cost is filed under `other`.
 *   · `shadow`    — post-FX / shadow convergence over the MAIN viewport.
 *   · `wallFlush` — the WallRebuildCoordinator flush.
 *   · `drain`     — the priority-queue drain (recorded by the scheduler, not a listener).
 *   · `other`     — neither a draw nor a paint: animation ticks, controllers, guards.
 */
export const LISTENER_BUCKETS: Readonly<Record<string, FrameBucketKey>> = {
  // ── The MAIN viewport draw ─────────────────────────────────────────────────
  // apps/editor: ONE listener holding OBC + PASCAL + every nested listener.
  // packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:285.
  'unified-frame-loop': 'render',
  // packages/renderer/src/Renderer.ts:157 — `attachTo()` default id. ⚠ It is
  // registered INDIRECTLY (`renderer.attachTo(scheduler, 'renderer.draw')` at
  // apps/editor/src/bootstrap.render.ts:83 and .everything.ts:188), which is why the
  // census scan reported this row DEAD until the scan learned that shape. See the
  // §RENDERER-DRAW-IS-NOT-DEAD note in the test.
  'renderer.draw': 'render',
  // apps/editor/src/engine/initScene.ts:3794 — legacy fallback, still a render.
  'init-scene-rpm-fallback': 'render',

  // ── Post-FX / shadow convergence over the MAIN viewport ────────────────────
  'enhanced-bloom-service': 'shadow',
  'ssgi-service': 'shadow',
  'viewport-path-tracer': 'shadow',

  // ── SECONDARY surfaces — each paints something that is not the viewport ────
  // plugins/annotations/src/AnnotationRenderLayer.ts:343 — own 2D canvas.
  'annotation-render-layer': 'overlay',
  // apps/editor/src/engine/views/PlanViewManager.ts:764 — own canvas, 30 fps gate.
  // Registered at 'pre-render' priority; it is a PAINT, not a pre-pass.
  'plan-view-manager': 'overlay',
  // apps/editor/src/engine/views/SplitViewManager.ts:321 — Canvas2D, 30 fps gate.
  'split-view-manager': 'overlay',
  // ⚠ Own THREE.WebGLRenderer + own canvas — a SECOND GL context.
  'pip-renderer-loop': 'overlay',
  // ⚠ Own THREE.WebGLRenderer + own canvas — a THIRD GL context.
  'floating-object-carousel-loop': 'overlay',
  // ⚠ Own THREE.WebGLRenderer (PanoramaPanel.ts:438).
  'panorama-panel-render': 'overlay',
  // DOM-transform inertia on the carousel cards; no GL.
  'furniture-carousel-inertia': 'overlay',
  // apps/editor/src/ui/graph/BuildingGraphOverlay.ts:436 — subscribed through the
  // duck-typed `SchedulerLike`, so it is a real per-frame listener on the one rAF.
  'pryzm.graph-overlay': 'overlay',
  // apps/editor/src/ui/living-graph/LivingGraphOverlay.ts:1113 — same shape.
  'pryzm.living-graph': 'overlay',
  // apps/editor/src/ui/property-panel/PropertyPanel.ts:391 — per-frame DOM sync.
  // ⚠ Its disposer is DISCARDED at the call site (documented there: "PropertyPanel
  // has no destroy() path today"), so this one runs for the life of the session.
  'property-panel-sync-handles': 'overlay',
  // apps/editor/src/ui/ViewCube.ts:306 — CSS-3D cube, no canvas.
  'view-cube-rotation': 'overlay',

  // ── Neither a draw nor a paint ─────────────────────────────────────────────
  // Scene-GRAPH reconcile, NOT a draw (bootstrap.render.ts / .everything.ts).
  'renderer.scene-reconcile': 'other',
  'first-person-controller': 'other',
  'physics-engine-loop': 'other',
  'selection-manager-gizmo-liveness-guard': 'other',
  'stair-path-tool-loop': 'other',
  // Material-opacity pulse over selected volumes; self-disposes when idle.
  'diagnostic-pulse': 'other',
  // Registered at 'render' priority but lerps level Y — an animation, not a draw.
  'level-explode-tick': 'other',
  // Preview-mesh opacity pulse; registered 'overlay' priority, mutates 3D materials.
  'preview-manager-pulse': 'other',
  // BottomActionMenu level lerp; self-disposes on convergence.
  'bam-level-animation': 'other',
};

/**
 * Map a tick-listener id to a coarse subsystem bucket so the one-line summary
 * stays human-readable.
 *
 * Exact table first (see {@link LISTENER_BUCKETS}), then the substring fallback
 * for generated `once:<reason>:<seq>` ids. Both arms are pure string work — cheap.
 */
export function bucketForListenerId(id: string): FrameBucketKey {
  const exact = LISTENER_BUCKETS[id];
  if (exact !== undefined) return exact;
  // ── Fallback: generated ids from `scheduleOnce(reason, …)`. ───────────────
  // Wall rebuild flush (the founder's prime suspect — confirm it is NOT
  // per-frame: this bucket should read ~0.0 during a pure orbit).
  if (id.includes('engine-bootstrap-wall')) return 'wallFlush';
  if (id.includes('wall-flush') || id.includes('wall-bodies')) return 'wallFlush';
  // Shadow reactivation / post-fx convergence. Checked BEFORE `render` because
  // `once:shadow-…-render` would otherwise be filed as a draw.
  if (id.includes('shadow') || id.includes('post-fx') || id.includes('postfx')) return 'shadow';
  // ⭐ §NAV-BUCKET-THAT-NEVER-PRINTS (L-5903) — `engine-loading-progress-<n>` is minted
  // PER INSTANCE (`EngineLoadingOverlay.ts:71`, a template literal) after
  // §FIX-OVERLAY-DUP-ID made two simultaneous overlays collide on a constant id. It
  // therefore CANNOT be enumerated in the table, which is exactly what this fallback
  // is for. It paints the boot/project-open progress chrome: a secondary surface.
  if (id.includes('engine-loading-progress')) return 'overlay';
  // ⛔ `overlay` BEFORE `render`, and it now returns its OWN bucket. This arm used to
  // read `id.includes('render') || id.includes('overlay')` → `'render'`, folding every
  // secondary surface into the main viewport's column — the single reason the
  // `overlay` bucket was unreachable and its silence went unnoticed for so long.
  if (id.includes('overlay')) return 'overlay';
  // Render pass + the render-phase listeners.
  if (id.includes('render')) return 'render';
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

/**
 * ⭐ §NAV-FRAME-IS-NOT-CPU (L-5900, lane NAV24, 2026-08-22) — the display's refresh
 * period. A frame INTERVAL at or under this is vsync-paced, i.e. the loop is waiting
 * for the display and not for anything this app does.
 *
 * It is a READING AID for the CPU-bound / not-CPU-bound verdict below, never a budget
 * and never a gate. 16.7 assumes a 60 Hz panel; on a 120 Hz panel a vsync-paced
 * interval is 8.3 and this constant will call it "waiting", which is still true —
 * it just understates the headroom. The raw `frame` and `cpu` numbers are printed
 * beside the verdict precisely so the reader is never dependent on this line.
 */
const VSYNC_MS = 16.7;

export class FrameProfiler {
  private _frames = 0;
  /** Sum of TICK CPU cost — time spent inside `FrameScheduler.tick()`. */
  private _cpuMsSum = 0;
  /** §NAV-FRAME-IS-NOT-CPU — sum of rAF-to-rAF INTERVALS: what the user feels. */
  private _intervalMsSum = 0;
  private readonly _buckets = _ZERO_BUCKETS();
  private _windowStartMs = 0;
  /**
   * §NAV-SMOOTHNESS — per-frame samples for p95 / worst.
   *
   * ⚠ These are INTERVALS, not tick costs. See {@link endFrame}.
   */
  private _samples: number[] = [];
  /** §NAV-SMOOTHNESS — worst single frame INTERVAL in this window, ms. */
  private _worstMs = 0;
  /** §NAV-SMOOTHNESS — frame INTERVALS over HITCH_MS in this window. */
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
    this._buckets[bucketForListenerId(listenerId)] += ms;
  }

  /** Attribute `ms` to the priority-queue drain. */
  recordDrain(ms: number): void {
    this._buckets.drain += ms;
  }

  /**
   * Call once at frame end. Emits the one-per-second summary line and resets the
   * accumulators when the 1 s window elapses. Logging is the only side effect.
   *
   * @param cpuMs      Wall-clock time spent INSIDE `FrameScheduler.tick()` — drain
   *                   plus every tick listener. Main-thread work, and only that.
   * @param nowMs      Performance clock, for the 1 s window boundary.
   * @param intervalMs rAF-to-rAF interval (`now - lastTickTime`). Defaults to
   *                   `cpuMs` for headless callers that inject costs directly and
   *                   have no separate interval — in that case the cost IS the
   *                   interval, which is the honest reading, not a fudge.
   *
   * ⭐ §NAV-FRAME-IS-NOT-CPU (L-5900) — WHY TWO NUMBERS AND NOT ONE, AND WHY THE
   * DISTRIBUTION MOVED ONTO THE INTERVAL.
   * -------------------------------------------------------------------------
   * This method used to take ONE duration — the tick-CPU cost — call it `frame`,
   * and compute `worst`, `p95` and `hitches` from it. `FrameScheduler.tick()`
   * already had the real interval in hand (`deltaMs = now - lastTickTime`, line
   * ~727) and threw it away.
   *
   * ⚠ THAT MADE THE INSTRUMENT STRUCTURALLY BLIND TO THE BACKEND THE FOUNDER IS
   * ASKING ABOUT. On the WebGPU path the per-frame submit is
   * `RenderPipelineManager.render()` → `rp.render()`, which ENCODES and SUBMITS and
   * returns; the GPU then takes as long as it takes. On the WebGL2 path it is
   * `renderer.render(scene, camera)`, whose driver-side cost is likewise mostly not
   * on this thread. In both cases a scene that is too heavy for the GPU produces
   * short ticks and long frames — so `worst`/`hitches` read ✅ smooth while the user
   * watches it stutter. The profiler's own header argues that an instrument
   * reporting the wrong statistic "actively points the next reader away from the
   * defect"; measuring the wrong QUANTITY is the same failure one level down.
   *
   * ⭐ AND THE PAIR IS WHAT MAKES A TWO-BACKEND COMPARISON POSSIBLE AT ALL. Run the
   * same gesture on WebGL and on WebGPU:
   *   · `cpu` similar, `frame` much worse on one → the difference is GPU-side
   *     (draw calls, post-FX passes, shadow submits). The buckets cannot help.
   *   · `cpu` worse on one → the difference is main-thread. Read the buckets.
   * Neither question is answerable from a single number, which is why the single
   * number was the defect and not merely an omission.
   *
   * ⛔ WHAT `frame - cpu` IS NOT. It is NOT "GPU time". At a healthy 60 fps with a
   * 6 ms tick the residual is ~10 ms of IDLE WAIT FOR VSYNC — the loop doing
   * nothing because there is nothing to do. JS cannot distinguish vsync wait from
   * GPU wait from compositor wait. So the verdict below only calls the main thread
   * "not the limiter" when the interval is ALREADY over the vsync period; below
   * that it says the frame is vsync-paced and stops. An instrument that named GPU
   * time it cannot measure would be the L-809 class of defect: a confident claim
   * with nothing behind it.
   */
  endFrame(cpuMs: number, nowMs: number, intervalMs: number = cpuMs): void {
    this._frames++;
    this._cpuMsSum += cpuMs;
    this._intervalMsSum += intervalMs;
    // §NAV-SMOOTHNESS — one comparison, one increment and (bounded) one push.
    if (intervalMs > this._worstMs) this._worstMs = intervalMs;
    if (intervalMs > HITCH_MS) this._hitches++;
    if (this._samples.length < MAX_SAMPLES) this._samples.push(intervalMs);

    if (nowMs - this._windowStartMs < 1000) return;

    const f = this._frames || 1;
    const fps = Math.round((f * 1000) / Math.max(1, nowMs - this._windowStartMs));
    const avgInterval = this._intervalMsSum / f;
    const avgCpu = this._cpuMsSum / f;
    const b = this._buckets;
    const p = (n: number): string => (n / f).toFixed(1);
    const p95 = this._percentile(95);
    // ⭐ §NAV-BACKEND-ON-EVERY-PERF-LINE (L-5902) — the founder is asked to compare
    // WebGPU against WebGL, and he compares by PASTING these lines back. A line
    // that does not say which backend produced it cannot be compared to another
    // one, and `UnifiedFrameLoop`'s hardcoded "WebGPU" (corrected 2026-08-19,
    // INSTR1) is the standing proof that guessing the label costs an afternoon.
    // `pryzmRendererBackend` is written by `createRenderer` at the moment the
    // backend is resolved; when it is absent we print `unknown`, never a guess.
    const backend =
      (globalThis as { pryzmRendererBackend?: string }).pryzmRendererBackend ?? 'unknown';
    // ⭐ The SMOOTHNESS verdict leads, because it is the question being asked.
    // Sorted so the eye lands on the distribution before the bucket breakdown:
    // the buckets say WHERE a frame goes, `worst`/`hitches` say WHETHER the user
    // is feeling it at all.
    const smoothness =
      this._hitches > 0 ? ` ⚠ ${this._hitches}/${f} frames over ${HITCH_MS}ms`
      : this._worstMs > HITCH_MS / 2 ? ' 🟡 no dropped frames, but headroom is thin'
      : ' ✅ smooth';
    // §NAV-FRAME-IS-NOT-CPU — the bound verdict. Only stated once the interval is
    // already over the vsync period; under that the loop is simply waiting for the
    // display and no attribution is warranted or possible.
    const bound =
      avgInterval <= VSYNC_MS ? ' · vsync-paced (nothing to attribute)'
      : avgCpu >= avgInterval * 0.7 ? ' · MAIN-THREAD bound — read the buckets'
      : ` · NOT main-thread bound (cpu ${((avgCpu / avgInterval) * 100).toFixed(0)}% of frame)` +
        ' — GPU, compositor or vsync; compare this line on the other backend';
    // eslint-disable-next-line no-console
    console.log(
      `[FrameProfiler] backend=${backend} fps=${fps} frame=${avgInterval.toFixed(1)}ms ` +
        `cpu=${avgCpu.toFixed(1)}ms ` +
        `p95=${p95.toFixed(1)} worst=${this._worstMs.toFixed(1)} ` +
        `hitches=${this._hitches}/${f} | ` +
        `render=${p(b.render)} overlay=${p(b.overlay)} wallFlush=${p(b.wallFlush)} ` +
        `shadow=${p(b.shadow)} drain=${p(b.drain)} other=${p(b.other)}` + smoothness + bound,
    );

    // Reset the window.
    this._frames = 0;
    // §PROFILER-RESETS-THE-SUM-IT-DIVIDES (L-6400). This read `this._frameMsSum = 0`
    // — a field that DOES NOT EXIST (declared nowhere; this was its only mention).
    // Meanwhile `_cpuMsSum` (:187) is accumulated every frame (:278) and read as
    // `avgCpu = this._cpuMsSum / f` (:290) — and was NEVER reset. So the window
    // divided a CUMULATIVE sum by a PER-WINDOW frame count, and the reported
    // `cpu=…ms` grew without bound after the first window.
    //
    // ⛔ This is a PROFILER, i.e. the instrument a perf lane measures with. A
    // wrong number here does not just misreport — it misdirects every measurement
    // taken after it, and it reads MORE main-thread-bound over time, which is
    // exactly the conclusion someone hunting a stall is primed to accept.
    this._cpuMsSum = 0;
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
