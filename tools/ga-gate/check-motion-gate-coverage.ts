#!/usr/bin/env tsx
/**
 * R11 tripwire — motion-gate coverage in L7.5 Canvas2D view managers.
 *
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/13-RISK-REGISTER.md §1 R11
 * Anchor: docs/01-strategy/STR-03-engineering-vision.md (P3 — Single rAF);
 *         docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/02-WAVE-1-TRIPWIRES.md §1 task 3
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

/**
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * ⚠ THIS GATE WAS GREEN AND BLIND. It is the worst case in the L-811 family, and
 * unlike its siblings it did not crash — it CONFIDENTLY ASSERTED A FALSE
 * ARCHITECTURAL CONCLUSION and exited 0.
 *
 * `listViewFiles()` shelled out to `rg -l "" <candidate> --type ts` and read the
 * exit code as its only signal:
 *
 *     status 1 → "empty dir"            → return []
 *     status 2 → "path does not exist"  → try the next candidate
 *
 * Ripgrep is not a declared dependency and is absent from a stock Windows box. On
 * such a machine cmd.exe answers:
 *
 *     'rg' is not recognized as an internal or external command   → status 1
 *
 * — which the gate read as "the directory is empty". All four candidates fell
 * through, `files.length === 0`, and the gate printed:
 *
 *     [motion-gate-coverage] OK: R11 structurally retired — no Canvas2D view manager
 *     files found at any candidate path. Gate passes.                      exit 0
 *
 * Measured on the founder's machine the same day: `apps/editor/src/engine/views`
 * EXISTS and holds **83 TypeScript files**. The gate was not vacuously true; it was
 * false. "MISSING BINARY" and "R11 STRUCTURALLY RETIRED" had become the same
 * observable value — §CONTEXT-DATA-HONESTY applied to CI itself, and this gate then
 * went further and published a structural claim off the back of it.
 *
 * ─── The fix: ask the filesystem, and put a floor under the answer ───────────
 * Candidate existence is now decided by `existsSync`, which cannot be confused by a
 * subprocess exit code, and the chosen directory must yield at least MIN_VIEW_FILES
 * files or the gate exits 2 (MISCONFIGURED). "R11 is retired" remains a legitimate
 * exit-0 outcome, but it must now be a VERIFIED filesystem fact — no candidate path
 * exists at all — rather than an inference from a failed command.
 *
 * ─── Scope: RESTATED, NOT NARROWED — and an unscanned sibling ────────────────
 * The rg version took the FIRST candidate that existed and ignored the rest; that
 * is preserved exactly. Note the consequence, which is pre-existing and NOT changed
 * here: `apps/editor/src/ui/views` also exists (4 files) and is never scanned,
 * because `apps/editor/src/engine/views` wins first. Widening to both would change
 * what this gate measures, which is a founder decision rather than a silent edit
 * inside a port. The skipped sibling is reported on every run instead.
 *
 * Exit: 0 = every camera view has the motion gate (or no candidate path exists at
 *       all) · 1 = a camera view is missing beginMotion/endMotion · 2 = the chosen
 *       subject directory is implausibly small, i.e. the scan is misconfigured
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR, applied to the CHOSEN candidate directory.
 * `apps/editor/src/engine/views` holds 83 files today. 10 is low enough to survive
 * a genuine shrink of this subsystem, high enough to catch a half-moved directory
 * or a bad cwd. Below it the gate exits 2 — MISCONFIGURED, which is a different
 * fact from both "no violations" (0) and "violations found" (1).
 *
 * This floor deliberately does NOT apply when no candidate exists at all: that case
 * is R11's real, verified retirement, and is handled separately.
 */
const MIN_VIEW_FILES = 10;

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

/** The candidate that was chosen, and the ones skipped after it. For reporting. */
let CHOSEN: string | null = null;
const SKIPPED_SIBLINGS: string[] = [];

/**
 * Ask the FILESYSTEM which candidate path exists — never a subprocess exit code.
 * Returns repo-relative, forward-slashed paths, or [] when no candidate exists.
 */
function listViewFiles(): string[] {
  const existing = VIEW_GLOB_CANDIDATES.filter((c) => existsSync(join(REPO_ROOT, c)));
  if (existing.length === 0) return [];

  CHOSEN = existing[0]!;
  SKIPPED_SIBLINGS.push(...existing.slice(1));

  const files = walk(join(REPO_ROOT, CHOSEN), { exts: EXTS })
    .map((abs) => relPath(REPO_ROOT, abs));

  if (files.length < MIN_VIEW_FILES) {
    console.error(
      `\n[motion-gate-coverage] MISCONFIGURED (exit 2) — candidate '${CHOSEN}' exists but the ` +
      `walk found only ${files.length} file(s); floor is ${MIN_VIEW_FILES}.\n` +
      `  Root: ${REPO_ROOT}\n` +
      `  This is NOT a pass, and it is NOT "R11 retired". A directory that exists but\n` +
      `  is nearly empty means the subject moved or the root is wrong — exactly the\n` +
      `  confusion that let this gate report "R11 structurally retired" for months\n` +
      `  while 83 view files sat unread. Fix the path, do not lower this floor.`,
    );
    process.exit(2);
  }
  return files;
}

interface FileResult {
  file: string;
  gesture: boolean;
  cameraState: boolean;
  motion: boolean;
}

/**
 * ⚠ COMMENTS ARE STRIPPED BEFORE ANY OF THE THREE TESTS — and the `motion` test is
 * why this is not optional.
 *
 * `motion` is a COVERAGE test: matching `beginMotion(` marks a file COMPLIANT. Every
 * other pattern in this wave marks a file GUILTY, where a prose false-positive only
 * over-reports. Here a prose match EXONERATES. Caught by this gate's own negative
 * test on 2026-08-11: a synthetic view manager with a wheel handler, `_camTarget`
 * mutation and NO motion gate was reported as
 *
 *     ✓ …/probe.ts   — all have beginMotion() + endMotion() coverage
 *
 * purely because its header comment read "this file should call beginMotion() and
 * endMotion()". A `// TODO: add beginMotion()` in real source would have granted the
 * same false all-clear. Any file documenting the fix it has not applied yet was
 * counted as having applied it.
 *
 * `stripCommentsToLines` is the repo's single comment lexer (see lib/sourceScan.ts);
 * the lines are rejoined because these three patterns are whole-file existence
 * tests, not per-line matches.
 */
function analyse(files: string[]): FileResult[] {
  return files.map((f) => {
    const raw = readFileSync(resolve(REPO_ROOT, f), 'utf8');
    const src = stripCommentsToLines(raw).join('\n');
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
    // R11 structurally retired — and this is now a VERIFIED filesystem fact
    // (existsSync over every candidate), not an inference from a failed subprocess.
    console.log(
      '[motion-gate-coverage] OK: R11 structurally retired — verified via existsSync that ' +
      `none of the ${VIEW_GLOB_CANDIDATES.length} candidate paths exist:\n  ` +
      VIEW_GLOB_CANDIDATES.join('\n  '),
    );
    return 0;
  }

  // State the subject size, not just the verdict — a gate that reports only its
  // verdict cannot be distinguished from a gate that walked nothing.
  console.log(
    `[motion-gate-coverage] subject: ${CHOSEN} · ${files.length} file(s) (floor ${MIN_VIEW_FILES})`,
  );
  if (SKIPPED_SIBLINGS.length > 0) {
    console.log(
      `[motion-gate-coverage] NOT scanned (first-candidate-wins, pre-existing): ` +
      SKIPPED_SIBLINGS.join(', '),
    );
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
    console.error('  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/13-RISK-REGISTER.md §1 R11');
    console.error('  Fix:  call getFrameScheduler().beginMotion() in the gesture-start handler,');
    console.error('        and getFrameScheduler().endMotion() in the gesture-end handler.');
    console.error('        Emit a pryzm.plan-view.* OTel span per P8.');
    console.error('        Pattern reference: src/core/views/PlanViewManager.ts _onWheel/_onMouseDown/_onMouseUp');
    return 1;
  }

  if (cameraViews.length === 0) {
    console.log(`[motion-gate-coverage] OK: ${files.length} file(s) in ${CHOSEN} scanned; none is a camera navigation view (gesture + camera-state mutation).`);
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
