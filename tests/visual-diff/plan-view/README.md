# Visual-diff plan-view harness — command-stream fixtures

**Status:** S35-bis post-2B closeout (ADR-0030).
Playwright PNG promotion is opt-in via `PRYZM_VISUAL_DIFF_PLAYWRIGHT=1`,
scheduled to land at S37 D5.

## Why the harness uses a command-stream and not pixels

The Phase 2B audit (2026-04-27) found:
- The "<2 px diff" exit criterion claimed by S33 had never been measured.
- The bench file reserved at `apps/bench/src/benches/visual-diff-plan.bench.ts`
  was a skeleton that hard-throws when the gate runs.
- Adding Playwright would ship a heavy CI dependency for one gate.

The closeout instead lands a **lighter, deterministic harness**:
- `RecordingCanvasContext` is a structurally-equivalent shape of the
  `Canvas2DLike` contract from `@pryzm/drawing-primitives`.  Every method
  call and every property write is recorded into a JSON command stream.
- We render a known classifier output through `Canvas2DBackend` against
  the recorder.  The resulting stream is the fixture.
- A re-run produces the same stream (Canvas2D backend is deterministic);
  any drift surfaces as a structural diff.
- Once SVG / PDF backends land at S37, those backends will be fed through
  their own `to-canvas-stream` adapter and the *same* fixtures will gate
  cross-backend equivalence.

## Files

- `harness.ts` — the recorder, the diff utility, and the fixture loader.
- `fixtures/*.json` — 5 reference command streams covering the S31 reference
  cases listed in `apps/bench/src/benches/visual-diff-plan.bench.ts`
  (`small-residential-plan`, `open-office-plan`, `curved-wall-plan`,
  `multi-level-stack`, `wall-thickness-variety`).
- `harness.test.ts` — vitest suite that asserts every fixture re-renders
  byte-identically.
