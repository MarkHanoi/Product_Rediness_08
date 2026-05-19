# @pryzm/release

GA-gate orchestrator. Z.6 of `PRYZM2-WIREUP-PLAN-S72/26-plan-self-corrections.md §26.1`.

Runs the §23 verification checks in order and exits non-zero on the first failure. The H.10 GA-launch gate calls this script directly.

## Usage

```bash
pnpm ga-gate              # human-readable scoreboard
pnpm ga-gate -- --json    # machine output
pnpm --filter @pryzm/release ga-gate
```

## Checks (in order)

1. **wireup-floor** — `scripts/wireup-baseline.sh` runs cleanly and floor numbers do not regress (≤ for shrinkers, ≥ for growers).
2. **lint** — `pnpm lint` warnings only (Z.* rules in warn mode); errors fail the gate.
3. **gesture-coverage** — `node apps/bench/scripts/check-gesture-coverage.mjs` exits zero.
4. **visual-diff smoke** — `node packages/bench-visual-diff/src/index.mjs --no-fixtures` exits zero.
5. **typecheck** — `tsc --noEmit` over the workspace passes.

The gate is monotonic: every PR may only reduce shrinkers (cast count, rAF outside scheduler, canvas outside renderer) and grow growers (packages, ADRs).

## Exit codes

| code | meaning |
|-----:|---|
| 0    | every check passed |
| 1    | at least one check failed |
| 2    | gate misconfigured (e.g. floor file missing) |
