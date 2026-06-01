# Bench harness — design + per-sprint gate schedule

> S01 Track B deliverable, owner Agent B. Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §2.S01 D6.

`apps/bench/` is the home of every micro-bench. One Vitest test = one bench;
each emits a JSON sample under `.run-output/`; CI diffs them against
`baseline.json` and exits warn / fail per the per-bench `warnMs` / `budgetMs`.

## Why a custom harness, not Vitest's built-in `bench`?

Vitest's `bench` API is great for local timing but does not produce a stable
percentile output suitable for CI regression checks. The PRYZM contract
numbers are p95 / p99 — we need shape that survives jitter, not a "this run
was 5% slower than last week" output.

The harness is < 100 LOC: `measure()` runs N samples (default 1000) with W
warm-up iterations (default 50), sorts, and returns p50 / p95 / p99 in
milliseconds. No external deps beyond Vitest itself.

## File layout

```
apps/bench/
  package.json
  baseline.json                — committed; the contract numbers
  baseline.schema.json
  src/
    timing.ts                  — measure() core
    save-baseline.ts           — writes BenchSample → .run-output/<name>.json
    benches/
      schemas-roundtrip.bench.ts   ← S01 reference bench
      cmd-execute-latency.bench.ts ← S02 (Track A)
      idle-cpu.bench.ts            ← S03 (Track B)
      save-edit.bench.ts           ← S04 (Track A)
      orbit-fps.bench.ts           ← S06 (Track B)
      ...                          ← per Phase 1B–1D additions
  scripts/
    run-baseline.mjs           — promote .run-output/* → baseline.json
    check-regression.mjs       — CI: diff current vs baseline
    check-bundle-size.mjs      — CI: per-package gzipped size gate
```

## Per-sprint gate-activation schedule

The contract numbers (`08-VISION.md §6`) are introduced **one bench per
sprint**. Each sprint's exit criterion is what flips the gate from
warn-only to hard-fail.

| Bench | Owner | Sprint | Warn / fail (p95) | Hard-fail at |
|---|---|---|---|---|
| `schemas.roundtrip.wall` | A | S01 | 2.0 / 5.0 ms | (reference only) |
| `command-bus.execute.move-cube` | A | S02 | 0.8 / 1.0 ms | S02 |
| `frame-scheduler.idle-cpu` | B | S03 | — / 2.0 % | S03 |
| `frame-scheduler.orbit-fps` | B | S03 | 55 fps p95 floor | S06 |
| `persistence.save-edit` | A | S04 | 8 / 10 ms p95 | S04 |
| `scene-committer.commit-100-cubes` | B | S05 | 5 / 8 ms | S05 |
| `bundle.size.protocol` | B | S01 | 12 / 15 KB gzip | S01 (warn) → S06 (fail) |
| `bundle.size.initial-app` | B | S06 | — / 1.8 MB gzip | S06 |
| `geometry.wall.produce` | A | S08 | — / 30 ms p95 | S08 |
| `load.small-fixture-cold` | A | S09 | — / 800 ms wall | S12 |
| `load.medium-fixture-cold` | A | S15 | — / 1500 ms wall | S19 |
| `load.large-fixture-cold` | B | S23 | — / 3000 ms wall | S24 |
| `pack.medium` / `unpack.medium` | A | S20 | — / 5000 / 3000 ms | S20 |

(Numbers above are the canonical contract from `08-VISION.md §6`. The
`baseline.json` file is the operational record — it is updated whenever a
sprint accepts a new perf number.)

## Adding a bench

1. Create `apps/bench/src/benches/<name>.bench.ts`.
2. In the test, call `measure(name, fn, { warnMs, budgetMs, samples? })`.
3. Pass the returned sample to `writeBenchSample(sample)`.
4. After the first run, `npm run bench:baseline --workspace=@pryzm/bench`
   promotes the sample into `baseline.json`. Commit that file.
5. Sprint exit criterion: set `hardFail: true` on the entry in
   `baseline.json` to flip the gate from warn to fail.

## Running locally

```bash
# Run every bench, write samples under .run-output/
npm run bench --workspace=@pryzm/bench

# Compare current run against baseline.json
npm run bench:check --workspace=@pryzm/bench

# Promote current samples into baseline.json (after intentional change)
npm run bench:baseline --workspace=@pryzm/bench
```

## What the harness intentionally does NOT do

- **Cross-runner numbers.** Bench numbers from a 4-core CI runner are not
  comparable to a 16-core dev laptop. The contract is "GitHub-Actions
  ubuntu-latest, default sizing". Local runs are advisory.
- **Memory budgets.** The `MaterialPool` GPU-memory leak assertion in S05
  uses Vitest's standard `expect()` directly, not this harness — memory is
  not a percentile.
- **End-to-end timings.** Cold-load benches (`load-small`, `load-medium`,
  `load-large`) are wall-clock measurements, not micro-bench percentiles —
  they live in this harness but record `p50 = p95 = p99 = wall_time` so the
  same gate format works.

## S06 additions

### Cross-layer trace test (`apps/bench/__tests__/cross-layer-trace.test.ts`)

S06-T6 — verifies a single user action emits all five gate spans, in
trace order:

1. `pryzm.command.execute`
2. `pryzm.persistence.append`
3. `pryzm.scene.commit`
4. `pryzm.frame.tick`
5. `pryzm.frame.render`

The test registers a minimal in-memory `TracerProvider` (no
`@opentelemetry/sdk-trace-base` dep — keeps the harness lean) and
asserts both ordering and the renderer-mode attribute carried on
`pryzm.renderer.init`.

### Save-reload bench (`apps/bench/src/benches/save-reload.bench.ts`)

S06-T4 — full reload round-trip (events replay → store rebuilt →
committer fires → scene rendered).  100-event project budget:
**< 500 ms p95**.  Uses `IndexedDbBackend` with `fake-indexeddb`.

### Persistence-stress bench (`apps/bench/src/benches/persistence-stress.bench.ts`)

S06-T5 — 10K events replay budget: **< 2 s p95**.  Uses
`InMemoryBackend` because `fake-indexeddb` is too slow at that volume;
the IndexedDB code path is covered by `save-reload.bench.ts` at the
100-event scale.  Patches are batched per `applyPatch` call to avoid
the `Store.applyPatch` O(n) `Object.fromEntries` rebuild from
dominating the bench.

### Visual-diff harness (`apps/bench/scripts/visual-diff.mjs`)

S06-T8 / S06-T9 — `pixelmatch` + `pngjs` based.  Two modes:

* `--no-fixtures` — shape-only check (verifies the harness is wired
  and the fixtures dir is reachable).  Used in CI when no GPU is
  available.
* `--webgpu PATH --webgl2 PATH` — runs the real diff between the two
  reference PNGs.  **Hard-fails > 2 px diff.**

### Bundle-size entry-chunk gate

S06-T10 — `apps/bench/scripts/check-bundle-size.mjs` now bundles
`apps/editor/src/index.ts` with esbuild + tree-shake and asserts
`< 1.8 MB gzip` for the entry chunk.  Hard-fails above the budget.
Skip with `--no-entry`; run only the gate with `--entry-only`.
