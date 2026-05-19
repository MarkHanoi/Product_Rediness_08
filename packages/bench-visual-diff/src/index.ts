// @pryzm/bench-visual-diff — TypeScript public API — Wave A18-T26
//
// CONTRACT (C10 §4): Visual regression MUST be part of CI.
// Any diff > threshold fails the PR.
//
// Usage:
//   import { compareScreenshots } from '@pryzm/bench-visual-diff';
//   const result = compareScreenshots(baseline, actual, diffOut);
//   if (!result.passed) process.exit(1);
//
// The CLI (.mjs) remains for shell-level invocation; this file exposes the
// typed Node.js API for programmatic use (Playwright, Vitest plugins, etc.).

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.bench-visual-diff');

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiffOptions {
  /**
   * Pixel-level colour tolerance passed to pixelmatch (0–1, default 0.1).
   * Lower = stricter per-pixel match.
   */
  pixelThreshold?: number;
  /**
   * Maximum allowed fraction of differing pixels before the comparison fails
   * (0–1, default 0.01 = 1 %).
   */
  diffThreshold?: number;
  /** Include anti-aliased pixels in the diff count (default false). */
  includeAA?: boolean;
}

export interface DiffResult {
  /** Number of pixels that differ between baseline and actual. */
  pixelsDifferent: number;
  /** Total pixel count (width × height). */
  totalPixels: number;
  /** Fraction of pixels that differ (0–1). */
  percentDifferent: number;
  /** True when `percentDifferent ≤ opts.diffThreshold`. */
  passed: boolean;
  /** Path where the diff PNG was written (if output requested). */
  diffPath?: string;
}

export interface CaptureResult {
  /** Absolute path of the PNG that was saved. */
  path: string;
  width: number;
  height: number;
}

// ── Core comparison ──────────────────────────────────────────────────────────

/**
 * compareScreenshots — pixel-level visual regression diff.
 *
 * On the first run (no baseline exists) the actual image is **promoted** to
 * baseline and the result is marked `passed: true`.  Subsequent runs diff
 * against the stored baseline.
 *
 * @param baselinePath   Path to the reference PNG (auto-created on first run).
 * @param actualPath     Path to the freshly-captured PNG.
 * @param diffOutputPath Path where the diff visualisation PNG is written.
 * @param opts           Tolerance options.
 */
export function compareScreenshots(
  baselinePath: string,
  actualPath: string,
  diffOutputPath: string,
  opts: DiffOptions = {},
): DiffResult {
  const span = tracer.startSpan('pryzm.bench-visual-diff.compare');
  try {
    const pixelThreshold = opts.pixelThreshold ?? 0.1;
    const diffThreshold = opts.diffThreshold ?? 0.01;
    const includeAA = opts.includeAA ?? false;

    if (!existsSync(baselinePath)) {
      writeFileSync(baselinePath, readFileSync(actualPath));
      return {
        pixelsDifferent: 0,
        totalPixels: 0,
        percentDifferent: 0,
        passed: true,
        diffPath: undefined,
      };
    }

    const baseline = PNG.sync.read(readFileSync(baselinePath));
    const actual = PNG.sync.read(readFileSync(actualPath));

    const { width, height } = baseline;
    const diff = new PNG({ width, height });

    const numDiff = pixelmatch(
      baseline.data,
      actual.data,
      diff.data,
      width,
      height,
      { threshold: pixelThreshold, includeAA },
    );

    writeFileSync(diffOutputPath, PNG.sync.write(diff));

    const total = width * height;
    const pct = total === 0 ? 0 : numDiff / total;

    return {
      pixelsDifferent: numDiff,
      totalPixels: total,
      percentDifferent: pct,
      passed: pct <= diffThreshold,
      diffPath: diffOutputPath,
    };
  } finally {
    span.end();
  }
}

/**
 * assertScreenshotMatch — throws if the comparison fails.
 * Convenient wrapper for use in test assertions.
 */
export function assertScreenshotMatch(
  baselinePath: string,
  actualPath: string,
  diffOutputPath: string,
  opts: DiffOptions = {},
): void {
  const result = compareScreenshots(baselinePath, actualPath, diffOutputPath, opts);
  if (!result.passed) {
    throw new Error(
      `[bench-visual-diff] Screenshot mismatch: ` +
      `${(result.percentDifferent * 100).toFixed(2)}% pixels differ ` +
      `(${result.pixelsDifferent}/${result.totalPixels}) — ` +
      `diff saved to ${result.diffPath}`,
    );
  }
}

/**
 * readPngDimensions — quick utility to inspect image dimensions without full diff.
 */
export function readPngDimensions(pngPath: string): { width: number; height: number } {
  const span = tracer.startSpan('pryzm.bench-visual-diff.read-dimensions');
  try {
    const img = PNG.sync.read(readFileSync(pngPath));
    return { width: img.width, height: img.height };
  } finally {
    span.end();
  }
}
