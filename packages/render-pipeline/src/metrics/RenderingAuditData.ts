// @pryzm/render-pipeline — RenderingAuditData (Wave A16 S122, A16-T2).
//
// CONTRACT (C10 §2): The rendering subsystem MUST expose per-frame performance
// metrics as a first-class observable so the bench suite can assert:
//   • NFT-16: P95 frame time < 16.6 ms for scenes with < 10,000 elements.
//   • NFT-15: Bundle size < 4 MB gzipped (measured separately by verify-bundle-size.mjs).
//
// Layer: L4 (Rendering) — pure data types; no THREE dependency, no DOM.

// ── Per-frame snapshot ────────────────────────────────────────────────────────

/**
 * Metrics captured at the end of one rendered frame.
 *
 * All values are optional or may be undefined where the underlying GPU API
 * does not provide the data (e.g. `gpuTimeMs` requires WebGPU timestamp queries
 * or the `EXT_disjoint_timer_query` extension, which may not be available on
 * all platforms).
 */
export interface RenderFrameMetrics {
  /**
   * Wall-clock elapsed time for the full frame (CPU + GPU submit).
   * Measured as `performance.now()` delta from rAF callback start to
   * renderer.render() return. Aligns with NFT-16 (< 16.6 ms P95).
   */
  readonly frameTimeMs: number;

  /**
   * GPU-side render time in milliseconds.
   * Available only when the browser exposes `EXT_disjoint_timer_query` (WebGL2)
   * or the WebGPU timestamp query feature. `undefined` when unavailable.
   */
  readonly gpuTimeMs?: number;

  /**
   * Number of WebGL/WebGPU draw calls issued this frame.
   * Read from `renderer.info.render.calls` (THREE.WebGLRenderer) or equivalent.
   */
  readonly drawCalls: number;

  /**
   * Triangle count rendered this frame.
   * Read from `renderer.info.render.triangles`.
   */
  readonly triangles: number;

  /**
   * Total number of Object3D nodes in the scene at render time.
   * Includes lights, helpers, and invisible objects.
   */
  readonly sceneObjectCount: number;

  /**
   * `performance.now()` timestamp at the start of the frame.
   * Used for correlating metrics with OTel span timestamps.
   */
  readonly timestamp: number;
}

// ── Aggregated window snapshot ────────────────────────────────────────────────

/**
 * Rolling-window statistical summary of recent frame metrics.
 * Returned by `RenderPerformanceService.snapshot()`.
 */
export interface RenderPerformanceSnapshot {
  /** Most recently recorded frame metrics, or `null` before the first frame. */
  readonly latest: RenderFrameMetrics | null;

  /** Median frame time over the sample window (P50). */
  readonly p50FrameTimeMs: number;

  /** 95th-percentile frame time over the sample window. */
  readonly p95FrameTimeMs: number;

  /** Arithmetic mean frame time over the sample window. */
  readonly averageFrameTimeMs: number;

  /** Number of frames in the current rolling window. */
  readonly sampleCount: number;

  /**
   * `true` when P95 frame time is within the NFT-16 budget (< 16.6 ms).
   * Exposed as a boolean so bench assertions can be a single equality check.
   */
  readonly nft16Passing: boolean;
}

// ── Audit warnings ────────────────────────────────────────────────────────────

/** Warning code emitted when a per-frame threshold is exceeded. */
export type RenderAuditWarningCode =
  | 'NFT16_BUDGET_EXCEEDED'   // frameTimeMs ≥ 16.6ms
  | 'DRAW_CALL_SPIKE'         // drawCalls exceeded configurable threshold
  | 'TRIANGLE_SPIKE';         // triangles exceeded configurable threshold

/**
 * A single audit warning recorded when a frame exceeds a performance threshold.
 * Subscribers can consume these to drive in-editor warnings or telemetry.
 */
export interface RenderAuditWarning {
  readonly code: RenderAuditWarningCode;
  readonly frameTimeMs: number;
  readonly threshold: number;
  readonly timestamp: number;
}

// ── Service configuration ─────────────────────────────────────────────────────

/**
 * Options for `RenderPerformanceService`.
 */
export interface RenderPerformanceServiceOptions {
  /**
   * Number of frames retained in the rolling window.
   * Default: 120 (≈ 2 seconds at 60 fps).
   */
  windowSize?: number;

  /**
   * NFT-16 frame time budget in milliseconds.
   * Default: 16.6 ms (60 fps).
   */
  frameTimeBudgetMs?: number;

  /**
   * Draw-call threshold above which a DRAW_CALL_SPIKE warning is emitted.
   * Default: 1500.
   */
  drawCallThreshold?: number;

  /**
   * Triangle count threshold above which a TRIANGLE_SPIKE warning is emitted.
   * Default: 2_000_000.
   */
  triangleThreshold?: number;
}
