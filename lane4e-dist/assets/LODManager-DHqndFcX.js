import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';

function createError(message) {
    const err = new Error(message);
    err.source = "ulid";
    return err;
}
// These values should NEVER change. If
// they do, we're no longer making ulids!
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
const ENCODING_LEN = ENCODING.length;
const TIME_MAX = Math.pow(2, 48) - 1;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
function randomChar(prng) {
    let rand = Math.floor(prng() * ENCODING_LEN);
    if (rand === ENCODING_LEN) {
        rand = ENCODING_LEN - 1;
    }
    return ENCODING.charAt(rand);
}
function encodeTime(now, len) {
    if (isNaN(now)) {
        throw new Error(now + " must be a number");
    }
    if (now > TIME_MAX) {
        throw createError("cannot encode time greater than " + TIME_MAX);
    }
    if (now < 0) {
        throw createError("time must be positive");
    }
    if (Number.isInteger(Number(now)) === false) {
        throw createError("time must be an integer");
    }
    let mod;
    let str = "";
    for (; len > 0; len--) {
        mod = now % ENCODING_LEN;
        str = ENCODING.charAt(mod) + str;
        now = (now - mod) / ENCODING_LEN;
    }
    return str;
}
function encodeRandom(len, prng) {
    let str = "";
    for (; len > 0; len--) {
        str = randomChar(prng) + str;
    }
    return str;
}
function detectPrng(allowInsecure = false, root) {
    if (!root) {
        root = typeof window !== "undefined" ? window : null;
    }
    const browserCrypto = root && (root.crypto || root.msCrypto);
    if (browserCrypto) {
        return () => {
            const buffer = new Uint8Array(1);
            browserCrypto.getRandomValues(buffer);
            return buffer[0] / 0xff;
        };
    }
    else {
        try {
            const nodeCrypto = require("crypto");
            return () => nodeCrypto.randomBytes(1).readUInt8() / 0xff;
        }
        catch (e) { }
    }
    if (allowInsecure) {
        try {
            console.error("secure crypto unusable, falling back to insecure Math.random()!");
        }
        catch (e) { }
        return () => Math.random();
    }
    throw createError("secure crypto unusable, insecure Math.random not allowed");
}
function factory(currPrng) {
    if (!currPrng) {
        currPrng = detectPrng();
    }
    return function ulid(seedTime) {
        if (isNaN(seedTime)) {
            seedTime = Date.now();
        }
        return encodeTime(seedTime, TIME_LEN) + encodeRandom(RANDOM_LEN, currPrng);
    };
}
const ulid = factory();

const PRIORITIES = ["interaction", "idle", "background"];
new Set(PRIORITIES);
const TICK_PRIORITIES = ["pre-render", "render", "post-render", "overlay"];
new Set(TICK_PRIORITIES);

const TRACER$1 = trace.getTracer("@pryzm/frame-scheduler", "0.1.0");
function withSpan$1(name, attrs, fn) {
  const span = TRACER$1.startSpan(name, { attributes: attrs });
  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err)
    });
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}
function emitIdleContinuationEvent(phase, budgetRemaining) {
  const span = TRACER$1.startSpan("pryzm.frame.idle-continuation", {
    attributes: {
      "pryzm.frame.idle_phase": phase,
      "pryzm.frame.idle_budget_remaining": budgetRemaining
    }
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

class GlobalRafAdapter {
  request(cb) {
    if (typeof globalThis.requestAnimationFrame !== "function") {
      throw new Error(
        "[FrameScheduler] globalThis.requestAnimationFrame is not available — pass a RafAdapter to FrameScheduler.start() in headless environments."
      );
    }
    return globalThis.requestAnimationFrame(cb);
  }
  cancel(handle) {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(handle);
    }
  }
  now() {
    if (typeof globalThis.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }
}

const IDLE_CONTINUATION_FRAMES = 30;
class IdleContinuation {
  remaining = IDLE_CONTINUATION_FRAMES;
  /** Reset to the maximum (called whenever the scene becomes dirty again). */
  reset() {
    this.remaining = IDLE_CONTINUATION_FRAMES;
  }
  /**
   * Decrement the budget by one and return the remaining value.  A return of
   * `0` is the signal that the scheduler should stop the rAF loop.
   */
  consume() {
    if (this.remaining > 0) this.remaining--;
    return this.remaining;
  }
  /** Read-only view — useful for OTel attributes and tests. */
  get budget() {
    return this.remaining;
  }
  get exhausted() {
    return this.remaining === 0;
  }
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 16;
function defaultChannelFactory() {
  const ch = new MessageChannel();
  return { port1: ch.port1, port2: ch.port2 };
}
function defaultTimers() {
  return {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
    now: () => typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now()
  };
}
function resolveVisibilitySource(explicit) {
  if (explicit) return explicit;
  const doc = globalThis.document;
  return doc ?? null;
}
class BackgroundHeartbeat {
  intervalMs;
  timers;
  port;
  visibility;
  listeners = /* @__PURE__ */ new Set();
  running = false;
  armed = false;
  timerHandle = null;
  onVisibilityChange;
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.timers = opts.timers ?? defaultTimers();
    this.visibility = resolveVisibilitySource(opts.visibility);
    const channel = (opts.channelFactory ?? defaultChannelFactory)();
    this.port = channel.port1;
    channel.port2.onmessage = () => this._onPulse();
    this.onVisibilityChange = () => {
      if (this.running && this._isHidden()) this._arm();
    };
    if (this.visibility?.addEventListener) {
      this.visibility.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }
  /** True iff the document is currently hidden (background tab). */
  _isHidden() {
    return this.visibility?.hidden === true;
  }
  /** Public read — used by `FrameScheduler` to decide rAF vs heartbeat pump. */
  get isHidden() {
    return this._isHidden();
  }
  /** Number of live tick subscribers (test/diagnostic). */
  get listenerCount() {
    return this.listeners.size;
  }
  get isRunning() {
    return this.running;
  }
  /**
   * Subscribe a tick callback.  Returns a disposer.  Adding the first listener
   * starts the heartbeat; removing the last stops it.  The callback fires only
   * while the document is hidden.
   */
  subscribe(tick) {
    this.listeners.add(tick);
    this.start();
    return () => {
      this.listeners.delete(tick);
      if (this.listeners.size === 0) this.stop();
    };
  }
  /** Begin pumping (idempotent).  Inert until the document is hidden. */
  start() {
    if (this.running) return;
    this.running = true;
    this._arm();
  }
  /** Stop pumping (idempotent).  Cancels any armed timer. */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timerHandle !== null) {
      this.timers.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.armed = false;
  }
  /** Permanently tear down — remove the visibility listener + close the port. */
  dispose() {
    this.stop();
    this.listeners.clear();
    if (this.visibility?.removeEventListener) {
      this.visibility.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    try {
      this.port.close?.();
    } catch {
    }
  }
  /**
   * Arm the next pulse: start a short `setTimeout` whose callback posts on the
   * channel.  The `setTimeout` is clamped to ≥ 1000 ms when hidden on some
   * engines, but the `postMessage` it triggers is NOT clamped, so the *delivery*
   * of the tick (and any re-arm chained from it) runs promptly.  We deliberately
   * keep the timer short; the clamp is a floor, never a ceiling we add to.
   */
  _arm() {
    if (!this.running || this.armed) return;
    if (!this._isHidden()) {
      this.armed = false;
      return;
    }
    this.armed = true;
    this.timerHandle = this.timers.setTimeout(() => {
      this.timerHandle = null;
      this.port.postMessage(0);
    }, this.intervalMs);
  }
  /** MessageChannel delivered a pulse — run the work tick, then re-arm. */
  _onPulse() {
    this.armed = false;
    if (!this.running) return;
    if (!this._isHidden()) {
      return;
    }
    const now = this.timers.now();
    withSpan$1(
      "pryzm.frame.background-heartbeat",
      { "pryzm.frame.heartbeat.listener_count": this.listeners.size },
      () => {
        for (const tick of [...this.listeners]) {
          try {
            tick(now);
          } catch (err) {
            console.error("[BackgroundHeartbeat] tick listener error:", err);
          }
        }
      }
    );
    this._arm();
  }
}
let _instance$1 = null;
function getBackgroundHeartbeat() {
  if (_instance$1 === null) {
    _instance$1 = new BackgroundHeartbeat();
  }
  return _instance$1;
}

const _ZERO_BUCKETS = () => ({
  render: 0,
  overlay: 0,
  wallFlush: 0,
  shadow: 0,
  drain: 0,
  other: 0
});
const LISTENER_BUCKETS = {
  // ── The MAIN viewport draw ─────────────────────────────────────────────────
  // apps/editor: ONE listener holding OBC + PASCAL + every nested listener.
  // packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:285.
  "unified-frame-loop": "render",
  // packages/renderer/src/Renderer.ts:157 — `attachTo()` default id. ⚠ It is
  // registered INDIRECTLY (`renderer.attachTo(scheduler, 'renderer.draw')` at
  // apps/editor/src/bootstrap.render.ts:83 and .everything.ts:188), which is why the
  // census scan reported this row DEAD until the scan learned that shape. See the
  // §RENDERER-DRAW-IS-NOT-DEAD note in the test.
  "renderer.draw": "render",
  // apps/editor/src/engine/initScene.ts:3794 — legacy fallback, still a render.
  "init-scene-rpm-fallback": "render",
  // ── Post-FX / shadow convergence over the MAIN viewport ────────────────────
  "enhanced-bloom-service": "shadow",
  "ssgi-service": "shadow",
  "viewport-path-tracer": "shadow",
  // ── SECONDARY surfaces — each paints something that is not the viewport ────
  // plugins/annotations/src/AnnotationRenderLayer.ts:343 — own 2D canvas.
  "annotation-render-layer": "overlay",
  // apps/editor/src/engine/views/PlanViewManager.ts:764 — own canvas, 30 fps gate.
  // Registered at 'pre-render' priority; it is a PAINT, not a pre-pass.
  "plan-view-manager": "overlay",
  // apps/editor/src/engine/views/SplitViewManager.ts:321 — Canvas2D, 30 fps gate.
  "split-view-manager": "overlay",
  // ⚠ Own THREE.WebGLRenderer + own canvas — a SECOND GL context.
  "pip-renderer-loop": "overlay",
  // ⚠ Own THREE.WebGLRenderer + own canvas — a THIRD GL context.
  "floating-object-carousel-loop": "overlay",
  // ⚠ Own THREE.WebGLRenderer (PanoramaPanel.ts:438).
  "panorama-panel-render": "overlay",
  // DOM-transform inertia on the carousel cards; no GL.
  "furniture-carousel-inertia": "overlay",
  // apps/editor/src/ui/graph/BuildingGraphOverlay.ts:436 — subscribed through the
  // duck-typed `SchedulerLike`, so it is a real per-frame listener on the one rAF.
  "pryzm.graph-overlay": "overlay",
  // apps/editor/src/ui/living-graph/LivingGraphOverlay.ts:1113 — same shape.
  "pryzm.living-graph": "overlay",
  // apps/editor/src/ui/property-panel/PropertyPanel.ts:391 — per-frame DOM sync.
  // ⚠ Its disposer is DISCARDED at the call site (documented there: "PropertyPanel
  // has no destroy() path today"), so this one runs for the life of the session.
  "property-panel-sync-handles": "overlay",
  // apps/editor/src/ui/ViewCube.ts:306 — CSS-3D cube, no canvas.
  "view-cube-rotation": "overlay",
  // ── Neither a draw nor a paint ─────────────────────────────────────────────
  // Scene-GRAPH reconcile, NOT a draw (bootstrap.render.ts / .everything.ts).
  "renderer.scene-reconcile": "other",
  "first-person-controller": "other",
  "physics-engine-loop": "other",
  "selection-manager-gizmo-liveness-guard": "other",
  "stair-path-tool-loop": "other",
  // Material-opacity pulse over selected volumes; self-disposes when idle.
  "diagnostic-pulse": "other",
  // Registered at 'render' priority but lerps level Y — an animation, not a draw.
  "level-explode-tick": "other",
  // Preview-mesh opacity pulse; registered 'overlay' priority, mutates 3D materials.
  "preview-manager-pulse": "other",
  // BottomActionMenu level lerp; self-disposes on convergence.
  "bam-level-animation": "other"
};
function bucketForListenerId(id) {
  const exact = LISTENER_BUCKETS[id];
  if (exact !== void 0) return exact;
  if (id.includes("engine-bootstrap-wall")) return "wallFlush";
  if (id.includes("wall-flush") || id.includes("wall-bodies")) return "wallFlush";
  if (id.includes("shadow") || id.includes("post-fx") || id.includes("postfx")) return "shadow";
  if (id.includes("engine-loading-progress")) return "overlay";
  if (id.includes("overlay")) return "overlay";
  if (id.includes("render")) return "render";
  return "other";
}
const HITCH_MS = 32;
const MAX_SAMPLES = 240;
const VSYNC_MS = 16.7;
class FrameProfiler {
  _frames = 0;
  /** Sum of TICK CPU cost — time spent inside `FrameScheduler.tick()`. */
  _cpuMsSum = 0;
  /** §NAV-FRAME-IS-NOT-CPU — sum of rAF-to-rAF INTERVALS: what the user feels. */
  _intervalMsSum = 0;
  _buckets = _ZERO_BUCKETS();
  _windowStartMs = 0;
  /**
   * §NAV-SMOOTHNESS — per-frame samples for p95 / worst.
   *
   * ⚠ These are INTERVALS, not tick costs. See {@link endFrame}.
   */
  _samples = [];
  /** §NAV-SMOOTHNESS — worst single frame INTERVAL in this window, ms. */
  _worstMs = 0;
  /** §NAV-SMOOTHNESS — frame INTERVALS over HITCH_MS in this window. */
  _hitches = 0;
  /** Set at the top of each frame so per-listener attribution can sum deltas. */
  _on = false;
  /** One typed-global read — the only cost paid when profiling is OFF. */
  isOn() {
    this._on = globalThis.__pryzmFrameProfile === true;
    return this._on;
  }
  /** Call once at frame start (only when isOn()). `nowMs` = performance clock. */
  beginFrame(nowMs) {
    if (this._windowStartMs === 0) this._windowStartMs = nowMs;
  }
  /** Attribute `ms` to the bucket for `listenerId`. */
  recordListener(listenerId, ms) {
    this._buckets[bucketForListenerId(listenerId)] += ms;
  }
  /** Attribute `ms` to the priority-queue drain. */
  recordDrain(ms) {
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
  endFrame(cpuMs, nowMs, intervalMs = cpuMs) {
    this._frames++;
    this._cpuMsSum += cpuMs;
    this._intervalMsSum += intervalMs;
    if (intervalMs > this._worstMs) this._worstMs = intervalMs;
    if (intervalMs > HITCH_MS) this._hitches++;
    if (this._samples.length < MAX_SAMPLES) this._samples.push(intervalMs);
    if (nowMs - this._windowStartMs < 1e3) return;
    const f = this._frames || 1;
    const fps = Math.round(f * 1e3 / Math.max(1, nowMs - this._windowStartMs));
    const avgInterval = this._intervalMsSum / f;
    const avgCpu = this._cpuMsSum / f;
    const b = this._buckets;
    const p = (n) => (n / f).toFixed(1);
    const p95 = this._percentile(95);
    const backend = globalThis.pryzmRendererBackend ?? "unknown";
    const smoothness = this._hitches > 0 ? ` ⚠ ${this._hitches}/${f} frames over ${HITCH_MS}ms` : this._worstMs > HITCH_MS / 2 ? " 🟡 no dropped frames, but headroom is thin" : " ✅ smooth";
    const bound = avgInterval <= VSYNC_MS ? " · vsync-paced (nothing to attribute)" : avgCpu >= avgInterval * 0.7 ? " · MAIN-THREAD bound — read the buckets" : ` · NOT main-thread bound (cpu ${(avgCpu / avgInterval * 100).toFixed(0)}% of frame) — GPU, compositor or vsync; compare this line on the other backend`;
    console.log(
      `[FrameProfiler] backend=${backend} fps=${fps} frame=${avgInterval.toFixed(1)}ms cpu=${avgCpu.toFixed(1)}ms p95=${p95.toFixed(1)} worst=${this._worstMs.toFixed(1)} hitches=${this._hitches}/${f} | render=${p(b.render)} overlay=${p(b.overlay)} wallFlush=${p(b.wallFlush)} shadow=${p(b.shadow)} drain=${p(b.drain)} other=${p(b.other)}` + smoothness + bound
    );
    this._frames = 0;
    this._cpuMsSum = 0;
    this._windowStartMs = nowMs;
    this._samples.length = 0;
    this._worstMs = 0;
    this._hitches = 0;
    for (const k of Object.keys(b)) b[k] = 0;
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
  _percentile(pct) {
    const n = this._samples.length;
    if (n === 0) return 0;
    const sorted = this._samples.slice().sort((a, b) => a - b);
    const rank = Math.ceil(pct / 100 * n) - 1;
    return sorted[Math.min(Math.max(rank, 0), n - 1)] ?? 0;
  }
}

const _perfNow = () => {
  const p = globalThis.performance;
  return typeof p?.now === "function" ? p.now() : Date.now();
};
const PRIORITY_RANK = {
  interaction: 0,
  idle: 1,
  background: 2
};
class FrameScheduler {
  dirtyFlags = /* @__PURE__ */ new Set();
  pending = [];
  /** Monotonic counter — used as tie-break when two requests share a ULID-ms. */
  seq = 0;
  /** Allows tests to inject deterministic time without monkey-patching `Date`. */
  clock;
  // ── S03 rAF pump state ────────────────────────────────────────────────────
  adapter = null;
  rafHandle = null;
  running = false;
  lastTickTime = 0;
  // ── §BACKGROUND-TAB-KEEPALIVE — background work-pump state ────────────────
  // When `document.hidden`, browsers PAUSE rAF (the adapter never fires) so the
  // WORK drain would stall.  In that window we pump `tick()` off the
  // BackgroundHeartbeat (an unthrottled MessageChannel pulse) instead.  The
  // heartbeat NEVER drives a render — rendering stays paused in the background;
  // it only keeps the WORK queue (batch drain, deferred passes) advancing.
  // Foreground is byte-identical: when visible we always take the rAF path.
  //
  // Gate: default-ON; set `globalThis.__pryzmDisableBackgroundKeepalive = true`
  // to fall back to pure-rAF (reversible kill-switch, no behavioural change
  // when the tab is visible either way).
  heartbeat = null;
  /** Disposer for the active heartbeat subscription (null when not subscribed). */
  heartbeatUnsub = null;
  tickListeners = /* @__PURE__ */ new Map();
  idle = new IdleContinuation();
  /** True after we've fired the `pryzm.frame.idle-continuation` "enter" event
   *  for the current idle window; reset on motion or `start()`. */
  idleEntryEmitted = false;
  /** Cached count for OTel attribute `pryzm.frame.tick.tick_count`. */
  tickCount = 0;
  /**
   * §FRAME-PROFILER — per-subsystem frame-cost accumulator. Zero cost unless
   * `globalThis.__pryzmFrameProfile === true`. Console filter: `[FrameProfiler]`.
   */
  profiler = new FrameProfiler();
  /**
   * Monotonic counter used by `scheduleOnce()` to mint unique listener IDs
   * (`once:<reason>:<seq>`).  Distinct from `seq` (which numbers
   * `requestFrame()` records) so the two namespaces never collide.
   */
  onceSeq = 0;
  // ── S17 motion gate state (see beginMotion / endMotion below). ──
  motionActive = false;
  motionListeners = /* @__PURE__ */ new Map();
  // ── §F.3 — Shared per-rAF budget tokens for drain loops. ──────────────────
  _batchBudgets = /* @__PURE__ */ new Map();
  /**
   * Optional positional `clock` keeps the S02 test signature
   * (`new FrameScheduler(() => now)`) ergonomic.
   */
  constructor(clock = () => Date.now()) {
    this.clock = clock;
  }
  // ---------------------------------------------------------------- dirty set
  markDirty(flag) {
    this.dirtyFlags.add(flag);
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
  }
  clearDirty(flag) {
    this.dirtyFlags.delete(flag);
  }
  isDirty(flag) {
    return flag === void 0 ? this.dirtyFlags.size > 0 : this.dirtyFlags.has(flag);
  }
  /** Snapshot of the dirty set — sorted for stable test output. */
  dirtyFlagsSnapshot() {
    return [...this.dirtyFlags].sort();
  }
  // ---------------------------------------------------------------- requests
  requestFrame(reason, priority) {
    const req = {
      id: ulid() + ":" + (++this.seq).toString(36),
      reason,
      priority,
      enqueuedAt: this.clock()
    };
    const rank = PRIORITY_RANK[priority];
    let i = this.pending.length;
    while (i > 0 && PRIORITY_RANK[this.pending[i - 1].priority] > rank) {
      i--;
    }
    this.pending.splice(i, 0, req);
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
    return req.id;
  }
  /**
   * Cancel a pending frame request by token (returned from `requestFrame`).
   * Returns `true` if the request was found and removed, `false` otherwise.
   * Per spec §S03-T1 line 351 — the rAF-pump replacement for
   * `cancelAnimationFrame`.
   */
  cancelFrame(token) {
    const idx = this.pending.findIndex((r) => r.id === token);
    if (idx === -1) return false;
    this.pending.splice(idx, 1);
    return true;
  }
  /** Read-only snapshot — for the renderer / tests. */
  getPending() {
    return this.pending;
  }
  /** Counts per priority — handy for the idle-CPU bench. */
  pendingByPriority() {
    const counts = {
      interaction: 0,
      idle: 0,
      background: 0
    };
    for (const req of this.pending) counts[req.priority]++;
    return counts;
  }
  // ---------------------------------------------------------------- drain
  /**
   * Drain the queue synchronously.  At S02 this was the ONLY way frames
   * came out of the scheduler; at S03 the rAF pump (`_tick`) calls it once
   * per frame, but tests and benches still call it directly.
   *
   * Returns the drained requests and the remaining count (always 0
   * unless `maxLanes` excluded a lane).
   *
   * Wraps the work in a `pryzm.frame.tick` OTel span (R1A-04 mitigation
   * locked at S02 — see ADR-006).  Per ADR-006 the span carries the
   * `pryzm.frame.idle_budget_remaining` and `pryzm.frame.idle_throttled`
   * attributes added in S03.
   */
  drainSync(maxLanes = PRIORITIES) {
    const dirtyReasons = [...this.dirtyFlags].sort();
    return withSpan$1(
      "pryzm.frame.tick",
      {
        "pryzm.frame.queue_depth": this.pending.length,
        "pryzm.frame.dirty_reasons": dirtyReasons.join(","),
        "pryzm.frame.dirty_count": dirtyReasons.length,
        "pryzm.frame.idle_budget_remaining": this.idle.budget,
        "pryzm.frame.idle_throttled": this.idle.exhausted
      },
      () => {
        const allowed = new Set(maxLanes);
        const drained = [];
        const remaining = [];
        for (const req of this.pending) {
          if (allowed.has(req.priority)) drained.push(req);
          else remaining.push(req);
        }
        this.pending.length = 0;
        this.pending.push(...remaining);
        return { drained, remaining: this.pending.length };
      }
    );
  }
  /** Reset everything — used by `clear-on-load` semantics in S04. */
  reset() {
    this.dirtyFlags.clear();
    this.pending.length = 0;
    this.seq = 0;
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.tickListeners.clear();
    this.tickCount = 0;
    this.motionActive = false;
    this.motionListeners.clear();
    this._batchBudgets.clear();
    this._unsubscribeHeartbeat();
  }
  // ── §F.3 — Shared per-rAF budget tokens ───────────────────────────────────
  /**
   * §F.3 — Register (or update) a named shared budget token.
   *
   * `setBatchBudget('batch-drain', { budgetMs: 20 })` creates a token that
   * caps all geometry drain callbacks sharing the key `'batch-drain'` to a
   * combined 20 ms per rAF frame.  At the top of each `_tick()` every token's
   * `consumedMs` is reset to 0 so the budget renews each frame.
   *
   * Calling `setBatchBudget` with the same key replaces the existing token.
   *
   * @param key      Unique string key identifying this budget (e.g. `'batch-drain'`).
   * @param opts     `budgetMs` — frame budget in milliseconds.
   */
  setBatchBudget(key, opts) {
    this._batchBudgets.set(key, { budgetMs: opts.budgetMs, consumedMs: 0 });
  }
  /**
   * §F.3 — Retrieve the live `BudgetToken` for a named budget, or `null` if
   * none has been registered via `setBatchBudget`.  The returned token is a
   * view over the internal mutable `_BudgetEntry`; its `consume()` calls
   * accumulate into that entry for the current frame.
   *
   * @param key   The same key passed to `setBatchBudget`.
   * @returns     A `BudgetToken` if registered, otherwise `null`.
   */
  getBatchBudget(key) {
    const entry = this._batchBudgets.get(key);
    if (!entry) return null;
    return {
      get budgetMs() {
        return entry.budgetMs;
      },
      hasRemaining(startMs) {
        return performance.now() - startMs + entry.consumedMs < entry.budgetMs;
      },
      consume(elapsedMs) {
        entry.consumedMs += elapsedMs;
      }
    };
  }
  // ── S03-T1: rAF pump ──────────────────────────────────────────────────────
  /**
   * Begin pumping rAF.  Pass a `RafAdapter` to inject test/headless time
   * (the `FakeRafAdapter` in `RafAdapter.ts` is the standard test double);
   * production callers omit the argument and get the platform `globalThis`
   * pump via `GlobalRafAdapter`.
   *
   * Idempotent — calling `start()` while already running is a no-op (the
   * existing adapter is preserved).
   */
  start(adapter = new GlobalRafAdapter()) {
    if (this.running) return;
    this.adapter = adapter;
    this.running = true;
    this.idle.reset();
    this.idleEntryEmitted = false;
    this._installVisibilityBridge();
    this.lastTickTime = adapter.now();
    this.scheduleNext();
  }
  /**
   * Stop pumping rAF.  Cancels any in-flight handle.  Idempotent.
   * The adapter reference is retained so `markDirty()` / `requestFrame()`
   * can wake the loop again without the caller re-passing the adapter.
   */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.adapter !== null && this.rafHandle !== null) {
      this.adapter.cancel(this.rafHandle);
    }
    this.rafHandle = null;
    this._unsubscribeHeartbeat();
  }
  get isRunning() {
    return this.running;
  }
  /**
   * Register a per-tick listener.  Listeners run inside `_tick(now)` in
   * `TickPriority` order: pre-render → render → post-render → overlay.
   * Returns a disposer; call it to unregister.
   *
   * Mirrors PRYZM 1's `UnifiedFrameLoop.addTickListener` shape
   * (`src/core/rendering/UnifiedFrameLoop.ts:130-230`).  Registering a
   * listener wakes the loop if a previous idle window had stopped it.
   */
  addTickListener(id, callback, priority) {
    if (this.tickListeners.has(id)) {
      throw new Error(
        `[FrameScheduler] addTickListener: duplicate id "${id}" (each listener must register a unique id).`
      );
    }
    this.tickListeners.set(id, { id, callback, priority });
    this.wakeIfStopped();
    return () => {
      this.tickListeners.delete(id);
    };
  }
  /**
   * Schedule a callback to fire **exactly once** on the next scheduler tick
   * at the given priority, then auto-dispose.  This is the canonical
   * architectural replacement for the one-shot `rAF(cb)`
   * pattern (defer-to-next-frame batch-flush, render-after-layout, leak-
   * audit-after-mount, drag-coalesce, etc.) — the §8 row #3 boolean
   * (`raf_owners_outside_frame_scheduler == 0`) cannot close while
   * consumers are still calling `rAF()` directly, even
   * for one-shot deferrals.
   *
   * Allocates a unique internal id (`once:<reason>:<seq>`) so callers
   * don't collide with `addTickListener`'s id namespace nor with each
   * other when the same reason is scheduled multiple times in flight.
   *
   * Returns a `TickListenerDisposer` that can be called to cancel the
   * pending callback before it fires (no-op if already fired).  Mirrors
   * the `cancelAnimationFrame(handle)` cleanup that all PRYZM 1
   * one-shot-rAF call sites already do.
   *
   * Default priority is `'post-render'` because the most common
   * one-shot-rAF use case in PRYZM 1 is "flush a batch / render-once /
   * audit-after-frame" which all want to run AFTER the render pass for
   * the frame they were scheduled into.  Callers who need pre-render or
   * overlay timing should pass the priority explicitly.
   *
   * @example
   *   // BEFORE (PRYZM 1 — direct rAF):
   *   //   rAF(() => this._renderToCanvas(viewDef, canvas));
   *   //
   *   // AFTER (PRYZM 3 — single-scheduler architecture):
   *   //   getFrameScheduler().scheduleOnce(
   *   //     'viewport-preview-render',
   *   //     () => this._renderToCanvas(viewDef, canvas),
   *   //   );
   */
  scheduleOnce(reason, callback, priority = "post-render") {
    const id = `once:${reason}:${(++this.onceSeq).toString(36)}`;
    let fired = false;
    const dispose = this.addTickListener(
      id,
      (now, deltaMs) => {
        if (fired) return;
        fired = true;
        dispose();
        callback(now, deltaMs);
      },
      priority
    );
    return dispose;
  }
  /**
   * Schedule a callback to run **once** on the next scheduler tick at the
   * given render-phase priority.  This is the **canonical C11 §5.2 / §6.1
   * API** for geometry builders and other pre/post-render work:
   *
   *   ```ts
   *   // Sprint A32 — canonical path for geometry drain:
   *   const FrameScheduler = getFrameScheduler();
   *   this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drain());
   *   ```
   *
   * Thin wrapper around `scheduleOnce(phase, callback, phase)` — the reason
   * string is set equal to the phase name so OTel `once:<phase>:<seq>` trace
   * spans are self-descriptive.  Callers who need a custom reason string
   * should call `scheduleOnce()` directly.
   *
   * **Phase guidance** (per C11 §6.1):
   * - `'pre-render'`  — geometry build / scene-graph mutations (before render)
   * - `'render'`      — renderer pass itself
   * - `'post-render'` — shadow reactivation, post-effect work, audit
   * - `'overlay'`     — HUD, debug overlays, accessibility announcements
   */
  schedule(phase, callback) {
    return this.scheduleOnce(phase, callback, phase);
  }
  /** Read-only — used by tests + the bouncing-cube demo. */
  tickListenerCount() {
    return this.tickListeners.size;
  }
  /** Read-only — used by the idle-CPU bench. */
  totalTicks() {
    return this.tickCount;
  }
  /**
   * Force the idle-continuation budget to zero — the next tick will
   * see `remaining === 0` and stop the rAF loop.  Wired by
   * `IdleAccumulator` (renderer): once every registered post-FX pass
   * reports converged, there is no more idle work to do, so the
   * scheduler can sleep until the next motion event without waiting
   * out the remaining tail of the 30-frame ADR-0006 budget.
   *
   * Spec source: ADR-0014 §"Composition with FrameScheduler.IdleContinuation".
   */
  stopIdleContinuation() {
    while (this.idle.budget > 0) this.idle.consume();
    if (this.running) {
      emitIdleContinuationEvent("exhausted", 0);
      this.stop();
    }
  }
  idleBudgetRemaining() {
    return this.idle.budget;
  }
  // ── S17 motion gate (additive — does NOT alter S03 idle behaviour for
  //     callers that don't use it).  Used by `ViewController.switchTo()`
  //     to suppress idle-continuation accumulation while a camera
  //     animation is in flight.  See ADR-0016 §"Camera animation under
  //     the FrameScheduler motion gate".
  //
  //     Semantics:
  //       * `beginMotion()` flips an internal `motionActive` flag, calls
  //         every registered `onMotionStart` callback, AND seeds the
  //         dirty set with `'motion'` so the loop never enters the
  //         idle-consume branch while motion is active.
  //       * `endMotion()` clears the flag and `'motion'` dirty key.  The
  //         next idle frame consumes budget normally.
  //
  //     Callers in flight during a single tick are well-defined: the
  //     dirty-flag check happens at the TOP of each tick, so flipping
  //     the flag in a callback will be observed on the very next tick.
  //
  // -----------------------------------------------------------------------
  /** Mark the scheduler as in-motion.  Suppresses idle-continuation
   *  exhaustion until `endMotion()` is called.  Idempotent — repeated
   *  calls do NOT stack; the first `endMotion()` wins.
   * @param _tag Optional debug label identifying the motion source (ignored at runtime). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  beginMotion(_tag) {
    if (this.motionActive) {
      for (const cb of this.motionListeners.values()) {
        try {
          cb();
        } catch (err) {
          console.error("[FrameScheduler] onMotionStart listener error:", err);
        }
      }
      return;
    }
    this.motionActive = true;
    this.dirtyFlags.add("motion");
    this.idle.reset();
    this.idleEntryEmitted = false;
    this.wakeIfStopped();
    for (const cb of this.motionListeners.values()) {
      try {
        cb();
      } catch (err) {
        console.error("[FrameScheduler] onMotionStart listener error:", err);
      }
    }
  }
  /** Clear the in-motion flag.  After this call the scheduler resumes
   *  normal idle-continuation accounting on the next tick.  Idempotent.
   * @param _tag Optional debug label identifying the motion source (ignored at runtime). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  endMotion(_tag) {
    if (!this.motionActive) return;
    this.motionActive = false;
    this.dirtyFlags.delete("motion");
  }
  /** True iff the scheduler is currently inside a `beginMotion()` /
   *  `endMotion()` window. */
  isInMotion() {
    return this.motionActive;
  }
  /** Subscribe to motion-start events (every `beginMotion()` call,
   *  including re-entrant ones).  Used by `IdleAccumulator` to reset
   *  per-pass convergence so TRAA / SSGI restart their budgets when a
   *  view-switch begins.  Returns a disposer; idempotent. */
  onMotionStart(cb) {
    const id = ulid() + ":" + (++this.seq).toString(36);
    this.motionListeners.set(id, cb);
    return () => {
      this.motionListeners.delete(id);
    };
  }
  // ── S03-T2: idle continuation gate ────────────────────────────────────────
  /**
   * §BACKGROUND-TAB-KEEPALIVE — is the background keep-alive enabled and the
   * tab currently hidden?  When true, `scheduleNext()` pumps off the
   * BackgroundHeartbeat instead of rAF (which the browser has paused).
   *
   * Returns false whenever the tab is visible — guaranteeing the foreground
   * path is the exact rAF path it was before this feature (no behavioural
   * change when visible).  Also false if the kill-switch global is set, or if
   * the host has no document (headless / test adapters drive rAF directly).
   */
  _shouldUseBackgroundPump() {
    if (globalThis.__pryzmDisableBackgroundKeepalive === true) {
      return false;
    }
    const heartbeat = this._getHeartbeat();
    return heartbeat !== null && heartbeat.isHidden;
  }
  /** Lazily obtain the shared heartbeat; null if construction fails (no
   *  MessageChannel in this host) so we degrade to the rAF-only path. */
  _getHeartbeat() {
    if (this.heartbeat === null) {
      try {
        this.heartbeat = getBackgroundHeartbeat();
      } catch {
        this.heartbeat = null;
      }
    }
    return this.heartbeat;
  }
  scheduleNext() {
    if (!this.running || this.adapter === null) return;
    if (this._shouldUseBackgroundPump()) {
      const heartbeat = this._getHeartbeat();
      if (heartbeat !== null) {
        if (this.heartbeatUnsub === null) {
          this.heartbeatUnsub = heartbeat.subscribe((now) => {
            this.tick(now);
          });
        }
        return;
      }
    }
    this._unsubscribeHeartbeat();
    this.rafHandle = this.adapter.request((now) => this.tick(now));
  }
  /** Drop the background heartbeat subscription if one is active. */
  _unsubscribeHeartbeat() {
    if (this.heartbeatUnsub !== null) {
      const unsub = this.heartbeatUnsub;
      this.heartbeatUnsub = null;
      try {
        unsub();
      } catch {
      }
    }
  }
  /** True once `_installVisibilityBridge()` has wired the listener. */
  _visibilityBridgeInstalled = false;
  /**
   * §BACKGROUND-TAB-KEEPALIVE / §PROGRESS-SCHEDULER — install (once) a
   * `visibilitychange` listener that switches the pump between rAF and the
   * heartbeat **in both directions**.
   *
   * **VISIBLE → HIDDEN (the founder's stall, fixed here).** `scheduleNext()` is
   * the only place that consults `_shouldUseBackgroundPump()`, and it is only
   * reachable from `tick()`, which is driven by rAF.  When the tab hides, the
   * browser stops firing rAF — so the already-armed callback never runs, the
   * hand-off is never evaluated, and every non-visual subscriber on the frame
   * bus (chunked project load, room redetect, geometry drains, batch
   * coordination) parks at 0 Hz until the tab is looked at again.  Meanwhile
   * raw-`setTimeout` watchdogs (e.g. `BatchCoordinator`'s 8 s drain watchdog)
   * DO keep firing on approximately real time, so they force-complete work that
   * has merely been parked — that divergence is the corruption, not the stall.
   * The bridge therefore abandons the dead rAF handle and arms the heartbeat.
   *
   * **HIDDEN → VISIBLE.** Release the heartbeat and restore the exact rAF path,
   * so the foreground remains byte-identical to the pre-keepalive behaviour.
   *
   * No-op in headless/test hosts that have no `document` (those drive rAF via
   * an injected adapter and never enter the heartbeat path).
   */
  _installVisibilityBridge() {
    if (this._visibilityBridgeInstalled) return;
    const doc = globalThis.document;
    if (!doc?.addEventListener) return;
    this._visibilityBridgeInstalled = true;
    doc.addEventListener("visibilitychange", () => this._onVisibilityChange());
  }
  /**
   * Re-evaluate which pump should be driving, given the current visibility.
   * Extracted from the bridge listener so `_shouldUseBackgroundPump()` is
   * consulted on a visibility EDGE as well as from inside `tick()`.
   */
  _onVisibilityChange() {
    if (!this.running || this.adapter === null) return;
    if (this._shouldUseBackgroundPump()) {
      if (this.heartbeatUnsub === null) {
        if (this.rafHandle !== null) {
          this.adapter.cancel(this.rafHandle);
          this.rafHandle = null;
        }
        this.scheduleNext();
      }
      return;
    }
    if (this.heartbeatUnsub !== null) {
      this._unsubscribeHeartbeat();
      if (this.rafHandle === null) this.scheduleNext();
    }
  }
  tick(now) {
    if (!this.running) return;
    this.rafHandle = null;
    this.tickCount++;
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;
    const _prof = this.profiler.isOn();
    const _profStart = _prof ? _perfNow() : 0;
    if (_prof) this.profiler.beginFrame(_profStart);
    for (const entry of this._batchBudgets.values()) {
      entry.consumedMs = 0;
    }
    const hadWorkBeforeDrain = this.dirtyFlags.size > 0 || this.pending.length > 0;
    const _drainT0 = _prof ? _perfNow() : 0;
    this.drainSync();
    if (_prof) this.profiler.recordDrain(_perfNow() - _drainT0);
    if (this.tickListeners.size > 0) {
      const listenersThisTick = [...this.tickListeners.values()];
      for (const priority of TICK_PRIORITIES) {
        for (const listener of listenersThisTick) {
          if (listener.priority !== priority) continue;
          const _lT0 = _prof ? _perfNow() : 0;
          try {
            listener.callback(now, deltaMs);
          } catch (err) {
            console.error(
              `[FrameScheduler] tick listener "${listener.id}" error:`,
              err
            );
          }
          if (_prof) this.profiler.recordListener(listener.id, _perfNow() - _lT0);
        }
      }
    }
    if (_prof) {
      const _frameEnd = _perfNow();
      this.profiler.endFrame(_frameEnd - _profStart, _frameEnd, deltaMs);
    }
    const stillLive = hadWorkBeforeDrain || this.dirtyFlags.size > 0 || this.pending.length > 0;
    if (stillLive) {
      if (this.idle.budget < IDLE_CONTINUATION_FRAMES) {
        this.idle.reset();
      }
      this.idleEntryEmitted = false;
      this.scheduleNext();
      return;
    }
    if (!this.idleEntryEmitted) {
      emitIdleContinuationEvent("enter", this.idle.budget);
      this.idleEntryEmitted = true;
    }
    const remaining = this.idle.consume();
    if (remaining === 0) {
      emitIdleContinuationEvent("exhausted", 0);
      this.stop();
      return;
    }
    this.scheduleNext();
  }
  wakeIfStopped() {
    if (this.adapter !== null && !this.running) {
      this.start(this.adapter);
    }
  }
}

let _instance = null;
function getFrameScheduler() {
  if (_instance === null) {
    _instance = new FrameScheduler();
  }
  return _instance;
}

const TRACER = trace.getTracer("@pryzm/scene-committer", "0.1.0");
async function withSpan(name, attrs, fn) {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err)
    });
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}
function withSpanSync(name, attrs, fn) {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err)
    });
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

const tracer = trace.getTracer("pryzm.scene-committer.lod");
const DEFAULT_THRESHOLDS = {
  tier0MaxDistance: 100,
  tier1MaxDistance: 500
};
class LODManager {
  thresholds;
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }
  /**
   * computeLOD — maps camera-to-element distance to a LOD tier.
   *
   * @param distance  Camera-to-element centroid distance in metres (≥ 0).
   * @returns         0 = full detail · 1 = simplified · 2 = bounding-box / culled
   */
  computeLOD(distance) {
    const span = tracer.startSpan("pryzm.scene-committer.lod.compute");
    try {
      if (distance < this.thresholds.tier0MaxDistance) return 0;
      if (distance < this.thresholds.tier1MaxDistance) return 1;
      return 2;
    } finally {
      span.end();
    }
  }
  /**
   * shouldSkip — convenience predicate: true when the element is beyond the
   * tier-2 threshold and MUST be culled from the render call entirely.
   *
   * Wave A18: tier-2 objects are still submitted to the committer as a bounding
   * box; the committer decides whether to render them at all.  This helper lets
   * callers opt into hard-cull for very large scenes (> 500 k elements) where
   * bounding-box rendering still exceeds the 60 FPS budget.
   */
  shouldSkip(distance, hardCullDistance = 1e3) {
    return distance >= hardCullDistance;
  }
  get tierThresholds() {
    return this.thresholds;
  }
}

export { FrameScheduler as F, LODManager as L, withSpan as a, getFrameScheduler as g, ulid as u, withSpanSync as w };
