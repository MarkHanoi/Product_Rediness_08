# Bench — ai-cost (S49 baseline)

_Generated: 2026-05-09T23:09:12.690Z_

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| preCheckBudget | 0.111 | 0.003 | 0.001 | 0.001 | 0.003 | 0.50 |
| recordCall | 0.320 | 0.012 | 0.002 | 0.005 | 0.027 | 0.50 |
| preCheck+recordCall | 0.139 | 0.012 | 0.003 | 0.009 | 0.081 | 1.00 |

Source: `apps/bench/src/benches/ai-cost.bench.ts` per PHASE-3A §S49 D8.
