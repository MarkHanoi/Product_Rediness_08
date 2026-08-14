// vitest.suites.config.ts — §L-850 / C70 §4.2 — THE RUNNER THAT DID NOT EXIST.
//
// ─── Why this file exists ────────────────────────────────────────────────────
// `tests/parity`, `tests/contract-44`, `tests/ci` and `tests/visual-diff` are not
// pnpm workspaces, carry no package.json, and are named by no root script. Every
// test file under them was therefore DARK in the strongest sense the dark-file
// gate distinguishes: not "an include missed them" (the L-849/L-851 shape, fixable
// by widening a pattern) but NO RUNNER COULD SELECT THEM UNDER ANY INVOCATION.
// L-DARK measured 57 such files and correctly refused to invent a runner on its
// own authority; the founder approved creating one. This is it.
//
// (`tests/visual-diff/3d/vitest.config.ts` exists in-tree and looks like a runner.
// It is not one: nothing can launch it — the directory is not a workspace, and no
// script passes it to `--config`. It stays as a local convenience for
// `npx vitest run --config tests/visual-diff/3d/vitest.config.ts`; the authority
// for CI is this file.)
//
// ─── MEASURED IN ISOLATION BEFORE ANYTHING WAS ENABLED (the L-849 protocol) ──
// All 56 vitest-family files ran under a throwaway config held OUTSIDE the repo,
// so this gate's own runner census could not see it and no lane's tree was
// touched. Reading, 2026-08-14, `vitest run` on a clean checkout:
//
//     56 files · 398 tests · 374 passed · 24 failed · 4 files RED
//
//   • 52 files GREEN and claimed here.
//   • 4 files RED and QUARANTINED below, each beside its actual failure.
//   • 24 of the 52 (`tests/visual-diff/3d/*.spec.ts`) WROTE A SNAPSHOT ON FIRST
//     RUN. A snapshot written on first run is NOT a pass — it is an unreviewed
//     baseline, and enabling one is how a suite starts asserting whatever it
//     happened to produce that day. Each of the 24 was REVIEWED before being
//     claimed: the payload was recomputed independently from the DEFAULT_DIMENSIONS
//     / RENDER_ORDER tables in `tests/visual-diff/3d/harness.ts` — transcribed by
//     hand rather than imported, because importing the harness would make the
//     check circular and prove nothing — and byte-compared. 24/24 matched. The
//     reviewed baselines are committed alongside this config; without them CI's
//     first run would write them itself, which is the same defect one commit later.
//
// ─── SCOPE ───────────────────────────────────────────────────────────────────
// Glob reachability is one axis; CI INVOCATION is another, and this file only
// moves the first. The second is owned by `scripts/check/check-test-ci-coverage.mjs`
// (workspace `test:ci` scripts) and by ci.yml — a `test-suites` job invokes
// `pnpm run test:suites`, so this runner is reached rather than merely reachable.
//
// Environment is `node`, not the root config's happy-dom: every file here is
// pure kernel/geometry/fs work, none touches the DOM, and running 52 files under
// happy-dom would pay for a document none of them reads.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      // Cross-engine + self-snapshot parity corpora (S08-T7 / W-1C).
      'tests/parity/**/*.test.ts',
      // Contract 44 — plan-view / SVP parity gates G1..G10 (ADR-0025).
      'tests/contract-44/**/*.test.ts',
      // The cross-cutting CI guard that fails a VACUOUS parity pass
      // (PHASE-1-COMPLETION-PLAN §5.1 #1) — a parity family with zero fixtures.
      'tests/ci/**/*.test.ts',
      // Deterministic scene-stream visual diff: 12 families x 2 cameras (W-10),
      // plus the 2D plan-view backend-equivalence harness (ADR-0030).
      'tests/visual-diff/**/*.spec.ts',
      'tests/visual-diff/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',

      // ─────────────────────────────────────────────────────────────────────
      // QUARANTINE — MEASURED RED 2026-08-14, NOT ENABLED, AND STILL ON
      // tools/ga-gate/dark-test-files-ledger.json. These rows do not leave the
      // ledger just because a runner now exists: a quarantine that vanishes from
      // the count is a deletion with extra steps (C70 §5.3). Each entry names the
      // ACTUAL failure, not "flaky".
      //
      // All four are the SAME class of finding: a committed parity baseline that
      // the current producer no longer reproduces. Which side is wrong — the
      // baseline or the producer — is a PRODUCT question for the geometry owners,
      // and is deliberately NOT decided here. Refreshing the snapshots to go green
      // would delete the evidence of a real behavioural change.
      // ─────────────────────────────────────────────────────────────────────

      // 10 of 30 fixtures fail, and every one of the 10 has an OPENING
      // (open-1door, open-1window, open-2doors, open-door-window, open-edge-start,
      // open-edge-end, open-2windows-door, layered-open-door,
      // layered-open-window-door, diagonal-with-door). The 20 opening-free
      // fixtures all pass. The wall producer's opening path has moved away from
      // the committed baseline; the 20 passing fixtures prove the drift is scoped
      // to openings and not a wholesale re-authoring.
      'tests/parity/wall/wall-snapshot.test.ts',

      // 12 of 23 fixtures fail — every overhang case plus all hip and mansard
      // cases (flat/mono/gable-with-overhang, hip-{square,rect,pentagon}-mid-pitch,
      // hip-square-with-overhang, mansard x4, hip-with-multi-skylight). The
      // failures include a BOUNDS-SHAPE mismatch (`expected { …(2) } to deeply
      // equal { min: {…}, max: {…} }`), i.e. the descriptor's bounds field no
      // longer has the shape the baseline recorded — a schema-level drift, not a
      // float delta.
      'tests/parity/roof/roof-snapshot.test.ts',

      // 1 of 16 fixtures fails: F08.rotated-axis-z, on SIGNED ZERO alone —
      // `expected [ -0, +0, -1, … ] to deeply equal [ +0, +0, -1, … ]`. The
      // normals are numerically identical; -0 !== +0 under toEqual. This is the
      // cheapest of the four to close and the one most likely to be a TEST defect
      // rather than a producer defect, but "likely" is not measured, so it is
      // quarantined with the others rather than waved through.
      'tests/parity/door/cw-snapshot.test.ts',

      // 1 of 12 fixtures fails: F08.rotated-axis-z, the identical signed-zero
      // shape as the door corpus above. Same root, same decision.
      'tests/parity/window/cw-snapshot.test.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
