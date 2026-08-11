# Bench — ai-cost (S49 baseline)

_Generated: 2026-08-11T10:13:46.984Z_

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| preCheckBudget | 0.155 | 0.003 | 0.001 | 0.002 | 0.010 | 0.50 |
| recordCall | 1.854 | 0.008 | 0.004 | 0.013 | 0.043 | 0.50 |
| preCheck+recordCall | 0.283 | 0.006 | 0.004 | 0.010 | 0.046 | 1.00 |

Source: `apps/bench/src/benches/ai-cost.bench.ts` per PHASE-3A §S49 D8.
