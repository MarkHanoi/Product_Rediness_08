/**
 * @file tools/ga-gate/lib/rafOwners.ts
 *
 * §RAF-ONE-COUNT (2026-08-10) — THE single definition of "who owns
 * requestAnimationFrame", shared by BOTH consumers:
 *
 *   • tools/ga-gate/check-raf-count.ts      (the P3 enforcement gate)
 *   • scripts/check/check-pryzm3-exists.ts  (convergence boolean #3)
 *
 * Why a shared module and not two counts: boolean #3 used to spawn a script at
 * a path that DOES NOT EXIST (`tools/check-raf-count/index.ts`) and treated the
 * spawn failure as ✅ — so the status page said "0 rAF owners" while the real
 * gate measured 4. Two hand-rolled counts WILL drift again; one function cannot
 * disagree with itself (§CONTEXT-DATA-HONESTY).
 *
 * §RAF-GATE-COMMENT-BLIND (2026-08-10) — comments are not owners.
 * The 4 "non-owner rAF sites" the gate reported after the L-811 rewrite were,
 * on inspection, ALL comment-only matches — and three of the four were comments
 * ASSERTING P3 compliance ("no requestAnimationFrame — P3-safe"). The pattern
 * matched prose, not code:
 *
 *     apps/editor/src/ui/living-graph/livingGraphSelection.ts:165   (doc comment)
 *     apps/editor/src/ui/overlays/RendererSwapOverlay.ts:17         (doc comment)
 *     packages/core-app-model/src/BimWorld.ts:226                   (// comment)
 *     packages/core-app-model/src/rendering/RenderingPipelineCoordinator.ts:599
 *                                                                   (doc comment)
 *
 * The fix is the same cheap, stated line-prefix filter the P6 gate
 * (check-no-direct-store-writes.ts) already uses. A trailing comment on a CODE
 * line is still counted — fail-closed in the direction that matters.
 *
 * ─── Stated limitation: alias references ─────────────────────────────────────
 * The pattern is the literal call token, so it cannot see a bare identifier
 * reference (`const raf = requestAnimationFrame; … raf(cb)`). Exactly ONE such
 * site exists today: packages/core-app-model/src/BimWorld.ts
 * (§WEBGL2-VIEW-UNSTICK) captures rAF to RE-ARM OBC's own third-party frame
 * loop after a throwing component update. That is deliberately NOT migrated to
 * the frame scheduler: PRYZM's scheduler is WOKEN by camera events that OBC's
 * loop produces, so routing the loop's repair through the scheduler could park
 * both forever (the §unsatisfiable-gate lesson — ask "can this ever be true?").
 * It is a repair of an upstream loop, not an animation loop of its own. If a
 * second alias site ever appears, extend this scan to bare references with an
 * explicit allowlist for BimWorld — do not widen silently.
 */

import { scanFiles, tallyBy, type Match } from './sourceScan.js';

export const RAF_SCAN_DIRS = ['src', 'apps', 'packages', 'plugins', 'server', 'tools'] as const;

/** ~6k TS files across those trees. A lower count means the scan is broken. */
export const RAF_MIN_FILES = 3000;

/** The one file allowed to own the literal (P3 — Single rAF). */
export const RAF_CANONICAL_OWNER = 'packages/frame-scheduler/src/RafAdapter.ts';

/**
 * Exclusion list — the canonical definition of the PRYZM 3 build-artifact scope
 * for convergence boolean #3 (see check-raf-count.ts D.7.8 narrative). Editing
 * it is a contract change on that boolean.
 */
export function rafExcluded(rel: string): boolean {
  if (rel.endsWith('.d.ts')) return true;
  if (/(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)) return true;
  if (/\.(bad|good)\.tsx?$/.test(rel)) return true;
  // §RAF-GATE-SPEC-BLIND (2026-09-03): spec/test FILES outside __tests__/ dirs.
  // tools/perf/outer/outer-baseline.spec.ts (7fa60a2b) tripped the gate with
  // three rAF calls that all live INSIDE page.evaluate() — Playwright
  // browser-context strings measuring paint settledness from OUTSIDE the app.
  // A spec file is not a build artifact and cannot start a production
  // animation loop; counting it repeats the comment-counting defect
  // (§RAF-GATE-COMMENT-BLIND) one level up. Production modules never carry
  // .spec/.test suffixes, so this cannot hide a real owner.
  if (/\.(spec|test)\.tsx?$/.test(rel)) return true;
  // Scaffolding that MUST contain the literal: the gate, this shared scan
  // (the pattern + doc examples live here), and the eslint rule that bans it.
  if (rel === 'tools/ga-gate/check-raf-count.ts') return true;
  if (rel === 'tools/ga-gate/lib/rafOwners.ts') return true;
  if (/^packages\/eslint-plugin-pryzm\//.test(rel)) return true;
  return false;
}

export interface RafOwnersResult {
  /** Files with ≥1 CODE-line match (repo-relative, forward-slashed). */
  readonly ownerFiles: readonly string[];
  /** The code-line matches themselves. */
  readonly matches: readonly Match[];
  /** Files whose ONLY matches were comment lines — reported, never hidden. */
  readonly commentOnlyFiles: readonly string[];
  readonly filesScanned: number;
  readonly filesExcluded: number;
}

/** A line that IS a comment (line-prefix test on the trimmed text — the same
 *  stated idiom as check-no-direct-store-writes.ts). */
function isCommentLine(text: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(text);
}

/**
 * Count the files that OWN a `requestAnimationFrame(` call in CODE.
 * Exits 2 via scanFiles if the walk reaches fewer than RAF_MIN_FILES files —
 * a scan that looked nowhere must never report a pass.
 */
export function countRafOwners(repoRoot: string, label = 'raf-owners'): RafOwnersResult {
  const res = scanFiles({
    root: repoRoot,
    dirs: RAF_SCAN_DIRS,
    pattern: /requestAnimationFrame\s*\(/,
    minFiles: RAF_MIN_FILES,
    exclude: rafExcluded,
    label,
  });

  const codeMatches = res.matches.filter((m) => !isCommentLine(m.text));
  const ownerFiles = tallyBy(codeMatches, (m) => m.file).map(([f]) => f);
  const ownerSet = new Set(ownerFiles);
  const commentOnlyFiles = [
    ...new Set(res.matches.filter((m) => !ownerSet.has(m.file)).map((m) => m.file)),
  ].sort();

  return {
    ownerFiles,
    matches: codeMatches,
    commentOnlyFiles,
    filesScanned: res.filesScanned,
    filesExcluded: res.filesExcluded,
  };
}
