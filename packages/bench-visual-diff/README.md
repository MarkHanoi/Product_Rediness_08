# @pryzm/bench-visual-diff

Visual-diff gate for the PRYZM 2 bench. Z.7 of `PRYZM2-WIREUP-PLAN-S72/26-plan-self-corrections.md §26.1`.

This is a thin wrapper around the existing `apps/bench/scripts/visual-diff.mjs` script — it gives the verification harness a workspace handle so `pnpm ga-gate` (Z.6) can call it as `@pryzm/bench-visual-diff diff`.

## Subcommands

```bash
# Smoke check — verify the harness wiring is intact (no GPU required)
node src/index.mjs --no-fixtures

# Capture a fresh baseline (requires a renderer + GPU)
node src/index.mjs capture --out apps/editor/__tests__/visual-fixtures

# Diff two PNGs — exits non-zero if pixel delta > threshold
node src/index.mjs diff --webgpu PATH --webgl2 PATH [--threshold 2]
```

## Why a wrapper?

The legacy script lived under `apps/bench/scripts/` and was invoked by hand. Phase H.7 of S72 needs a stable workspace name to call from CI — wrapping makes the script discoverable via `pnpm --filter @pryzm/bench-visual-diff …` and keeps the implementation in one place.
