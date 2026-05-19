# @pryzm/bench

Micro-bench harness for PRYZM 2.  Each bench is a Vitest test that records
timing percentiles into `baseline.json`.  CI compares the latest run against
the recorded baseline and warns / fails per the regression budget per bench.

## Layout

```
apps/bench/
  src/
    timing.ts                 — measure(name, fn, opts) → BenchSample
    save-baseline.ts          — reduce samples to baseline JSON
    benches/
      schemas-roundtrip.bench.ts   (S01)
      cmd-execute-latency.bench.ts (S02)  — added by Track A
      idle-cpu.bench.ts            (S03)  — added by Track B
      save-edit.bench.ts           (S04)  — added by Track A
      orbit-fps.bench.ts           (S06)  — added by Track B
      ...
  scripts/
    run-baseline.mjs          — re-records baseline.json
    check-regression.mjs      — diffs current run vs baseline
  baseline.json               — committed; the contract numbers
```

## Conventions

1. Every bench file ends in `.bench.ts` and lives under `src/benches/`.
2. Each bench measures one thing and writes one entry into the run output
   (`apps/bench/.run-output/<bench-name>.json`).
3. The schema of a baseline entry is:

   ```jsonc
   {
     "name":      "schemas.roundtrip.wall",
     "p50":       0.31,
     "p95":       0.45,
     "p99":       0.62,
     "samples":   1000,
     "budgetMs":  2.0,        // hard-fail threshold
     "warnMs":    1.0         // warn threshold
   }
   ```

4. CI calls `npm run bench:check --workspace=@pryzm/bench`; it loads
   `baseline.json` + the `.run-output/*.json` files and emits a pass / warn /
   fail per bench.  In S01 every gate is **warn-only**; per-sprint exit
   criteria flip individual gates to hard-fail (idle-CPU at S03, save-edit at
   S04, orbit-fps + bundle-size at S06, etc.).

See `docs/architecture/bench-harness.md` for the full design + per-sprint
gate-activation schedule.
