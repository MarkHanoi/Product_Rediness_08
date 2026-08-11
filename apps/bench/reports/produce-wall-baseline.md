# `produce-wall` bench baseline

_Captured 2026-08-11T10:13:01.214Z_

Per S08 spec (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 686-687):

- 100-iteration warm-up.
- 1000-iteration measured run.
- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.
- Hard budgets: simple < 50 ms p95; layered+openings < 80 ms p95.

| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `simple` | 3.267 | 0.081 | 0.028 | 0.099 | 0.547 | 50 |
| `layered-3layer` | 0.415 | 0.411 | 0.049 | 0.143 | 0.594 | 80 |
| `layered-openings` | 5.740 | 1.689 | 0.503 | 3.229 | 32.523 | 80 |

## Methodology

Bench source: `apps/bench/src/benches/produce-wall.bench.ts`.
Fixtures source: `packages/geometry-kernel/__tests__/__configs__/index.ts`.
Engine: `produceWall` (in-process, no worker round-trip).  The
Node-worker variant is gated by
`tests/parity/wall/wall-headless-node.test.ts` for byte equality;
we do not double-bench it here.
