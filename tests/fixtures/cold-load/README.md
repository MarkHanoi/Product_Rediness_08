# Cold-load fixtures

These three `.pryzm-stub.json` files are the canonical inputs for the
`cold-load-real.bench.ts` bench (W-04 in
`PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`).

| File          | Walls | Levels | Realistic of                                    |
|---------------|-------|--------|--------------------------------------------------|
| `small.pryzm` | 50    | 2      | a single small house — Hello-Wall demo upper bound |
| `medium.pryzm`| 2,500 | 5      | a typical residential project                     |
| `large.pryzm` | 5,000 | 20     | a stress-test of the cold-load pipeline           |

The shape is identical to the existing
`tests/fixtures/{small,medium,large}-project.pryzm-stub.json`; these
files are sized snapshots saved with the **`.pryzm`** extension so the
bench harness can call `loader.load(filePath)` directly without a file
extension override.

## Regenerating

The medium + large fixtures derive from the deterministic generator:

```bash
node tools/generate-large-fixture.mjs
cp tests/fixtures/large-project.pryzm-stub.json tests/fixtures/cold-load/large.pryzm
```

The small fixture is hand-curated and lives only here.

## Budgets

The bench enforces:

* `small.pryzm`  — cold-load p50 ≤ 80 ms
* `medium.pryzm` — cold-load p50 ≤ 800 ms
* `large.pryzm`  — cold-load p50 ≤ 1500 ms

These match the K1B-3 kill-switch decision-point thresholds.
