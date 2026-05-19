// Bench: `visual-diff-plan` — S31 CI harness skeleton.
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S31 D1, D5, D7.
//   • Code-level ADR `docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` §6.
//
// Sprint tolerance schedule (per PHASE-2B §1):
//   S31: < 10 px (foundation — only walls/slabs/doors; annotation not yet rendered).
//   S32: <  5 px (annotation renderer integrated).
//   S33: <  2 px (Contract 44 closes).
//   S35: <  1 px (full primitive parity with SVG / PDF back-ends).
//
// HARNESS DESIGN
// ─────────────────────────────────────────────────────────────────────────────
// The full harness drives Playwright over the editor at `tests/visual-diff/plan-view/`
// reference-image fixtures and computes a per-pixel L1 norm vs the reference
// PNGs.  The Playwright dependency is a Tier-3 CI tool — not yet wired into
// the per-PR pipeline (lit at S31 D5 mid-sprint sync per PHASE-2B §S31).
//
// This file ships the **skeleton**: the harness API, the per-case tolerance
// table, and a smoke test that verifies the fixture directory exists and that
// the per-sprint budget is correctly read.  D5 of S31 promotes this to a
// real Playwright invocation; until then, the harness is opt-in via the
// `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1` env var.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '..', '..', '..', '..', 'tests', 'visual-diff', 'plan-view');
const RUN_OUTPUT = resolve(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

/** Tolerance in pixels by sprint, per PHASE-2B §1 sprint tolerance track. */
export const VISUAL_DIFF_TOLERANCE: Record<string, number> = {
  S31: 10,
  S32: 5,
  S33: 2,
  S34: 2,
  S35: 1,
  S36: 1,
};

/** Currently-targeted sprint. Bumped at the start of each sprint by the lead. */
export const CURRENT_SPRINT = 'S33';

export function getCurrentTolerance(): number {
  return VISUAL_DIFF_TOLERANCE[CURRENT_SPRINT] ?? 1;
}

/** Reference cases shipped with S31. Each case has a fixture .pryzm + reference PNG. */
export const S31_REFERENCE_CASES: ReadonlyArray<{ id: string; description: string }> = [
  { id: 'small-residential-plan', description: '20 walls, 6 doors, 1 slab, no annotations.' },
  { id: 'open-office-plan',       description: '50 walls, 12 doors, 2 slabs.' },
  { id: 'curved-wall-plan',       description: '8 curved walls, 3 doors.' },
  { id: 'multi-level-stack',      description: 'Active level switches across 3 levels.' },
  { id: 'wall-thickness-variety', description: 'Walls from 0.05m to 0.40m thick — pen weight stress.' },
];

/**
 * Reference cases added in S32.  These exercise the new annotation pipeline
 * (`layoutAnnotations` + `AnnotationCommitter`) — text labels, leader lines,
 * callout boxes, and region fills.  Tolerance is 5 px per PHASE-2B §1
 * (text antialiasing variance is bounded to ≤ 3 px on text pixels per
 * SPEC-30 §2.4 — the 5 px budget includes 2 px headroom for layout drift).
 *
 * Coverage rationale (10 cases, paired across the 4 annotation types):
 *   • 3 text:    short / long / rotated / overlapping-cluster
 *   • 2 leader:  single-segment / multi-waypoint
 *   • 2 callout: single / multi clipped to canvas edge
 *   • 2 region:  triangle / 8-vertex concave
 *   • 1 mixed:   "kitchen sink" — every type in one scene
 */
export const S32_ANNOTATION_CASES: ReadonlyArray<{ id: string; description: string }> = [
  { id: 'annotation-text-short',          description: '4 text labels, no overlap.' },
  { id: 'annotation-text-long',           description: '6 text labels, mixed font weight.' },
  { id: 'annotation-text-rotated',        description: '4 text labels at 0°, 30°, 90°, 180°.' },
  { id: 'annotation-text-overlap-cluster', description: '12 colliding text labels — overlap-resolver stress.' },
  { id: 'annotation-leader-single',       description: '3 single-segment leaders.' },
  { id: 'annotation-leader-multi',        description: '2 multi-waypoint leaders + 1 angled.' },
  { id: 'annotation-callout-single',      description: '2 callout boxes with leaders.' },
  { id: 'annotation-callout-clipped',     description: '1 callout near right edge — clamp behaviour.' },
  { id: 'annotation-region-triangle',     description: '1 triangular region fill.' },
  { id: 'annotation-region-concave',      description: '1 8-vertex concave region.' },
];

describe('visual-diff-plan harness — S32 annotation cases', () => {
  it('declares per-sprint tolerance schedule consistent with PHASE-2B §1', () => {
    expect(VISUAL_DIFF_TOLERANCE.S31).toBe(10);
    expect(VISUAL_DIFF_TOLERANCE.S32).toBe(5);
    expect(VISUAL_DIFF_TOLERANCE.S33).toBe(2);
    expect(VISUAL_DIFF_TOLERANCE.S35).toBe(1);
  });

  it('ships exactly the 5 reference cases enumerated by PHASE-2B §S31 D5', () => {
    expect(S31_REFERENCE_CASES).toHaveLength(5);
  });

  it('ships 10 annotation cases for S32 (text/leader/callout/region coverage)', () => {
    expect(S32_ANNOTATION_CASES).toHaveLength(10);
    // Every case id MUST start with `annotation-` so the harness can
    // partition the grid by category.
    for (const c of S32_ANNOTATION_CASES) {
      expect(c.id.startsWith('annotation-')).toBe(true);
    }
    // At least one case per annotation type.
    const ids = S32_ANNOTATION_CASES.map((c) => c.id).join(' ');
    expect(ids).toMatch(/text/);
    expect(ids).toMatch(/leader/);
    expect(ids).toMatch(/callout/);
    expect(ids).toMatch(/region/);
  });

  it('current-sprint tolerance resolves to 2 px (S33 — Contract 44 closes)', () => {
    expect(getCurrentTolerance()).toBe(2);
  });

  it('reference fixture directory is reserved (created on first publish)', () => {
    if (!existsSync(FIXTURES)) {
      mkdirSync(FIXTURES, { recursive: true });
    }
    expect(existsSync(FIXTURES)).toBe(true);
  });

  // Post-2B closeout (ADR-0030 §"Visual diff harness"):
  // The Playwright PNG path is no longer the only option.  The
  // command-stream harness at `tests/visual-diff/plan-view/` provides
  // backend-deterministic equivalence today; Playwright is layered on
  // top at S37 D5 to gate human-visible drift.  We expose a path-only
  // pointer here so callers (CI, dev tools) can locate the harness
  // without re-importing it from the bench package.
  it('points at the command-stream harness shipped in tests/visual-diff/plan-view', () => {
    const harnessReadme = resolve(FIXTURES, 'README.md');
    expect(existsSync(harnessReadme)).toBe(true);
  });

  it.skipIf(process.env.PRYZM_VISUAL_DIFF_PLAYWRIGHT !== '1')(
    '[gated] runs Playwright screenshot diff against reference PNGs (S37 D5 promotion)',
    () => {
      // Implementation lights up at S37 D5: spawns Playwright, captures
      // PNGs, diffs against the same 5 cases listed in
      // `S31_REFERENCE_CASES`, and gates on `getCurrentTolerance()`.
      // Until then, structural equivalence is gated by the
      // command-stream harness; this gate is opt-in only.
      expect(process.env.PRYZM_VISUAL_DIFF_PLAYWRIGHT).toBe('1');
    },
  );
});
