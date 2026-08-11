# `produce-roof` bench baseline

_Captured 2026-08-11T10:13:32.068Z_

Per S10-T7 (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10 Track B):

- 100-iteration warm-up.
- 1000-iteration measured run.
- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.
- Sanity budgets (not contractual SLOs at S10 "begin" stage):
  flat < 50 ms, gable < 80 ms, mansard < 120 ms.

| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `flat` | 2.484 | 0.112 | 0.031 | 0.103 | 0.424 | 50 |
| `gable` | 1.283 | 0.068 | 0.039 | 0.133 | 0.717 | 80 |
| `mansard` | 269.349 | 2.608 | 0.071 | 0.536 | 28.097 | 120 |

## Methodology

Bench source: `apps/bench/src/benches/produce-roof.bench.ts`.
Fixtures source: `packages/geometry-kernel/__tests__/__configs__/roof-index.ts`.
Engine: `produceRoof` (in-process, no worker round-trip).
