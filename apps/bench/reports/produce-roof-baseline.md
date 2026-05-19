# `produce-roof` bench baseline

_Captured 2026-05-09T23:09:26.139Z_

Per S10-T7 (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10 Track B):

- 100-iteration warm-up.
- 1000-iteration measured run.
- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.
- Sanity budgets (not contractual SLOs at S10 "begin" stage):
  flat < 50 ms, gable < 80 ms, mansard < 120 ms.

| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `flat` | 1.602 | 0.255 | 0.020 | 0.081 | 1.075 | 50 |
| `gable` | 0.862 | 0.067 | 0.023 | 0.125 | 2.442 | 80 |
| `mansard` | 1.188 | 0.120 | 0.034 | 0.090 | 2.196 | 120 |

## Methodology

Bench source: `apps/bench/src/benches/produce-roof.bench.ts`.
Fixtures source: `packages/geometry-kernel/__tests__/__configs__/roof-index.ts`.
Engine: `produceRoof` (in-process, no worker round-trip).
