// @pryzm/render-pipeline — RenderPerformanceService (Wave A16 S122, A16-T2).
//
// CONTRACT (C10 §2): The rendering subsystem MUST expose per-frame performance
// metrics. This service maintains a ring buffer of recent RenderFrameMetrics and
// exposes rolling-window statistics (P50, P95, mean) and the NFT-16 gate flag.
//
// Layer: L4 (Rendering) — no DOM, no React, no stores.
// Thread model: single-threaded rAF loop; all methods must be allocation-free
// on the hot path (record() must not allocate on each frame).

import type {
  RenderFrameMetrics,
  RenderPerformanceSnapshot,
  RenderAuditWarning,
  RenderAuditWarningCode,
  RenderPerformanceServiceOptions,
} from './RenderingAuditData.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_SIZE = 120;        // ~2 s at 60 fps
const DEFAULT_FRAME_BUDGET_MS = 16.6;   // NFT-16
const DEFAULT_DRAW_CALL_THRESHOLD = 1500;
const DEFAULT_TRIANGLE_THRESHOLD = 2_000_000;

// ── RenderPerformanceService ──────────────────────────────────────────────────

/**
 * Collects per-frame render metrics and exposes rolling-window statistics.
 *
 * **Usage**:
 * ```ts
 * import { RenderPerformanceService } from '@pryzm/render-pipeline/metrics';
 *
 * const perf = new RenderPerformanceService();
 *
 * // In the rAF / render loop:
 * const t0 = performance.now();
 * renderer.render(scene, camera);
 * perf.record({
 *   frameTimeMs:    performance.now() - t0,
 *   drawCalls:      renderer.info.render.calls,
 *   triangles:      renderer.info.render.triangles,
 *   sceneObjectCount: scene.children.length,
 *   timestamp:      t0,
 * });
 *
 * // In bench / inspector:
 * const snap = perf.snapshot();
 * console.log(snap.p95FrameTimeMs, snap.nft16Passing);
 * ```
 *
 * **Allocation policy**:
 * - `record()` writes into a pre-allocated ring buffer — zero heap allocations
 *   on the hot path after the constructor runs.
 * - `snapshot()` allocates a lightweight plain object; intended for occasional
 *   calls (inspector UI, bench assertions) — not per-frame.
 */
export class RenderPerformanceService {
  // ── Ring buffer ─────────────────────────────────────────────────────────────
  // Pre-allocated arrays avoid per-frame allocations.

  private readonly _windowSize: number;
  private readonly _frameTimes: Float64Array;
  private readonly _drawCalls: Float64Array;
  private readonly _triangles: Float64Array;
  private _head = 0;         // Next write index (mod _windowSize)
  private _count = 0;        // Frames recorded so far (saturates at _windowSize)

  // ── Thresholds ───────────────────────────────────────────────────────────────
  private readonly _frameBudgetMs: number;
  private readonly _drawCallThreshold: number;
  private readonly _triangleThreshold: number;

  // ── Latest frame ─────────────────────────────────────────────────────────────
  private _latest: RenderFrameMetrics | null = null;

  // ── Warning subscribers ──────────────────────────────────────────────────────
  private readonly _warningListeners: Array<(w: RenderAuditWarning) => void> = [];

  // ── Scratch sort buffer (reused across snapshot() calls) ─────────────────────
  private readonly _sortScratch: Float64Array;

  constructor(options: RenderPerformanceServiceOptions = {}) {
    this._windowSize       = Math.max(10, options.windowSize           ?? DEFAULT_WINDOW_SIZE);
    this._frameBudgetMs    = options.frameTimeBudgetMs                 ?? DEFAULT_FRAME_BUDGET_MS;
    this._drawCallThreshold = options.drawCallThreshold                ?? DEFAULT_DRAW_CALL_THRESHOLD;
    this._triangleThreshold = options.triangleThreshold                ?? DEFAULT_TRIANGLE_THRESHOLD;

    this._frameTimes   = new Float64Array(this._windowSize);
    this._drawCalls    = new Float64Array(this._windowSize);
    this._triangles    = new Float64Array(this._windowSize);
    this._sortScratch  = new Float64Array(this._windowSize);
  }

  // ── Hot path ──────────────────────────────────────────────────────────────────

  /**
   * Record one frame's metrics.
   *
   * Called from the render loop immediately after `renderer.render()`.
   * **Zero heap allocations** on the hot path.
   */
  record(metrics: RenderFrameMetrics): void {
    const idx = this._head;
    this._frameTimes[idx]  = metrics.frameTimeMs;
    this._drawCalls[idx]   = metrics.drawCalls;
    this._triangles[idx]   = metrics.triangles;

    this._head = (this._head + 1) % this._windowSize;
    if (this._count < this._windowSize) this._count++;

    this._latest = metrics;

    // Emit warnings (inlined to avoid closure allocation on happy path).
    if (metrics.frameTimeMs >= this._frameBudgetMs) {
      this._emitWarning('NFT16_BUDGET_EXCEEDED', metrics.frameTimeMs, this._frameBudgetMs, metrics.timestamp);
    }
    if (metrics.drawCalls > this._drawCallThreshold) {
      this._emitWarning('DRAW_CALL_SPIKE', metrics.drawCalls, this._drawCallThreshold, metrics.timestamp);
    }
    if (metrics.triangles > this._triangleThreshold) {
      this._emitWarning('TRIANGLE_SPIKE', metrics.triangles, this._triangleThreshold, metrics.timestamp);
    }
  }

  // ── Cold path ─────────────────────────────────────────────────────────────────

  /**
   * Return a rolling-window statistical snapshot.
   *
   * Allocates a plain object — call from inspector UI or bench assertions,
   * not from the per-frame render loop.
   */
  snapshot(): RenderPerformanceSnapshot {
    const n = this._count;

    if (n === 0) {
      return {
        latest: null,
        p50FrameTimeMs: 0,
        p95FrameTimeMs: 0,
        averageFrameTimeMs: 0,
        sampleCount: 0,
        nft16Passing: true,
      };
    }

    // Copy the live window into the scratch buffer, then sort in-place.
    // Using a sub-view avoids a separate slice allocation.
    const scratch = this._sortScratch.subarray(0, n);
    for (let i = 0; i < n; i++) {
      scratch[i] = this._frameTimes[i];
    }
    scratch.sort();

    const p50 = this._percentile(scratch, 0.50);
    const p95 = this._percentile(scratch, 0.95);

    let sum = 0;
    for (let i = 0; i < n; i++) sum += scratch[i];
    const avg = sum / n;

    return {
      latest:             this._latest,
      p50FrameTimeMs:     p50,
      p95FrameTimeMs:     p95,
      averageFrameTimeMs: avg,
      sampleCount:        n,
      nft16Passing:       p95 < this._frameBudgetMs,
    };
  }

  /**
   * Reset the ring buffer and discard all recorded frames.
   * Does not affect warning listeners or configuration.
   */
  reset(): void {
    this._head  = 0;
    this._count = 0;
    this._latest = null;
  }

  /**
   * Subscribe to audit warnings (NFT budget exceeded, draw-call spike, etc.).
   * Returns an unsubscribe function — call it to cancel.
   */
  onWarning(listener: (w: RenderAuditWarning) => void): () => void {
    this._warningListeners.push(listener);
    return () => {
      const idx = this._warningListeners.indexOf(listener);
      if (idx !== -1) this._warningListeners.splice(idx, 1);
    };
  }

  /** Number of frames currently in the rolling window. */
  get sampleCount(): number { return this._count; }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /** Percentile of a pre-sorted TypedArray (linear interpolation). */
  private _percentile(sorted: Float64Array, q: number): number {
    const n = sorted.length;
    if (n === 1) return sorted[0];
    const rank  = q * (n - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    const frac  = rank - lower;
    return sorted[lower] + frac * (sorted[upper] - sorted[lower]);
  }

  private _emitWarning(
    code: RenderAuditWarningCode,
    measured: number,
    threshold: number,
    timestamp: number,
  ): void {
    if (this._warningListeners.length === 0) return;
    const w: RenderAuditWarning = {
      code,
      frameTimeMs: code === 'NFT16_BUDGET_EXCEEDED' ? measured : this._latest?.frameTimeMs ?? 0,
      threshold,
      timestamp,
    };
    for (const l of this._warningListeners) l(w);
  }
}
