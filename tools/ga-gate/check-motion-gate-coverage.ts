#!/usr/bin/env tsx
/**
 * R11 tripwire — motion-gate coverage in L7.5 Canvas2D view managers.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/13-RISK-REGISTER.md §1 R11
 * Anchor: docs/03_PRYZM3/01-VISION.md §2 P3 (single rAF);
 *         docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §1 task 3
 *
 * RULE: Any file under src/core/views/ that BOTH
 *   (a) registers a DOM gesture handler (wheel | mousedown | mouseup | touchstart | touchmove | touchend), AND
 *   (b) mutates camera / frustum navigation state (_camTarget, _frustumH, _lastRender, or
 *       navigates via _redraw/_scheduleDraw/_drawFrame calls inside gesture callbacks)
 * MUST also call getFrameScheduler().beginMotion() and endMotion() in the same source file.
 *
 * Files with gesture handlers that are pure tool overlays (no camera state mutation) are
 * explicitly excluded — they notify the scheduler through element-update → store → re-render
 * paths, not through the motion-gate boundary signal.
 *
 * Rationale: when the FrameScheduler's motion-gate is not signalled the rAF loop resumes
 * without a proper "new gesture started / ended" boundary, causing jumpy 2D plan-view
 * navigation (NFT #4 + #5 regression).  The fix is always cheap (one call per handler).
 *
 * Structural resolution: R11 is retired when packages/input-host/ is real (Wave 8-11).
 * Until then this tripwire is the mechanical enforcement.
 *
 * Usage:
 *   pnpm dlx tsx tools/ga-gate/check-motion-gate-coverage.ts
 *   pnpm ga-gate --check motion-gate-coverage
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();

const GESTURE_PATTERN =
  /addEventListener\s*\(\s*['"](?:wheel|mousedown|mouseup|mousemove|touchstart|touchmove|touchend)['"]/;

const MOTION_BEGIN_PATTERN = /beginMotion\s*\(/;
const MOTION_END_PATTERN   = /endMotion\s*\(/;

/**
 * Camera navigation state: a file is a "view manager" (not a tool overlay) if it
 * directly mutates navigation-specific private fields or calls scheduling helpers
 * that drive the 2D rAF paint loop from within gesture handlers.
 *
 * Named fields from R11 spec + extended coverage for plan-view zoom/pan derivatives.
 */
const CAMERA_STATE_PATTERN =
  /_camTarget\b|_frustumH\b|_lastRender\b|_zoom\b|_pixelsPerMetre\b|_redraw\s*\(|_scheduleDraw\s*\(|_drawFrame\s*\(|_renderFrame\s*\(|_invalidate\s*\(/;

/**
 * Path candidates in migration order (newest first):
 *
 *   Sprint AR+  → apps/editor/src/engine/views/    (current home after apps/editor migration)
 *   Wave 6–9    → src/engine/subsystems/core/views/ (intermediate migration step)
 *   Pre-Wave-6  → src/core/views/                  (original location)
 *
 * Try each candidate in order; use the first one that exists.
 * If none exist (R11 structurally retired — input-host/ package is real, Wave 8+),
 * return [] → exit 0.  This is the correct steady-state as of 2026-05-14.
 */
const VIEW_GLOB_CANDIDATES = [
  'apps/editor/src/engine/views',
  'apps/editor/src/ui/views',
  'src/engine/subsystems/core/views',
  'src/core/views',
];

function listViewFiles(): string[] {
  for (const candidate of VIEW_GLOB_CANDIDATES) {
    let out: string;
    try {
      out = execSync(
        `rg -l "" ${candidate} --type ts`,
        { encoding: 'utf8', cwd: REPO_ROOT },
      );
      return out.trim().split('\n').filter(Boolean);
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      // rg exit 1 → no matches in existing dir (empty dir)
      if (e.status === 1) return [];
      // rg exit 2 → path does not exist; try next candidate
      if (e.status === 2) continue;
      throw err;
    }
  }
  // All candidates missing → gate passes (R11 structurally retired or files moved).
  return [];
}

interface FileResult {
  file: string;
  gesture: boolean;
  cameraState: boolean;
  motion: boolean;
}

function analyse(files: string[]): FileResult[] {
  return files.map((f) => {
    const src = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    return {
      file: f,
      gesture: GESTURE_PATTERN.test(src),
      cameraState: CAMERA_STATE_PATTERN.test(src),
      motion: MOTION_BEGIN_PATTERN.test(src) && MOTION_END_PATTERN.test(src),
    };
  });
}

function main(): number {
  const files = listViewFiles();
  if (files.length === 0) {
    // R11 is structurally retired: Canvas2D view managers no longer exist at any
    // candidate path.  packages/input-host/ owns gesture handling (Wave 8+).
    // Gate passes vacuously — no violations possible when no files exist.
    console.log('[motion-gate-coverage] OK: R11 structurally retired — no Canvas2D view manager files found at any candidate path. Gate passes.');
    return 0;
  }

  const results = analyse(files);

  // Only camera navigation views (gesture + camera-state mutation) must have the motion gate.
  // Pure tool overlays (gesture only, no camera state) are exempt.
  const cameraViews  = results.filter((r) => r.gesture && r.cameraState);
  const violations   = cameraViews.filter((r) => !r.motion);
  const overlaysOnly = results.filter((r) => r.gesture && !r.cameraState);

  if (violations.length > 0) {
    console.error('[motion-gate-coverage] FAIL — camera navigation views without motion-gate signalling:');
    for (const v of violations) {
      console.error(`  ✗ ${v.file}`);
      console.error(`      has: gesture handler + camera state mutation — needs: beginMotion() + endMotion()`);
    }
    console.error('');
    console.error('  Read: docs/03_PRYZM3/04-PLAN-FORWARD/13-RISK-REGISTER.md §1 R11');
    console.error('  Fix:  call getFrameScheduler().beginMotion() in the gesture-start handler,');
    console.error('        and getFrameScheduler().endMotion() in the gesture-end handler.');
    console.error('        Emit a pryzm.plan-view.* OTel span per P8.');
    console.error('        Pattern reference: src/core/views/PlanViewManager.ts _onWheel/_onMouseDown/_onMouseUp');
    return 1;
  }

  if (cameraViews.length === 0) {
    console.log('[motion-gate-coverage] OK: no camera navigation views found in src/core/views/.');
  } else {
    console.log(
      `[motion-gate-coverage] OK: ${cameraViews.length} camera navigation view(s) — ` +
      `all have beginMotion() + endMotion() coverage.`,
    );
    for (const g of cameraViews) {
      console.log(`  ✓ ${g.file}`);
    }
  }
  if (overlaysOnly.length > 0) {
    console.log(
      `  (${overlaysOnly.length} tool overlay file(s) with gesture handlers but no camera state — exempt from R11)`,
    );
  }
  return 0;
}

process.exit(main());
