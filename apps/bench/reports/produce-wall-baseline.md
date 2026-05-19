# `produce-wall` bench baseline

_Captured 2026-05-09T23:09:22.488Z_

Per S08 spec (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` line 686-687):

- 100-iteration warm-up.
- 1000-iteration measured run.
- Reported: cold (first sample) / warm-avg / p50 / p95 / p99 in ms.
- Hard budgets: simple < 50 ms p95; layered+openings < 80 ms p95.

| scenario | cold ms | warm-avg ms | p50 ms | p95 ms | p99 ms | budget ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `simple` | 1.268 | 0.128 | 0.013 | 0.053 | 0.563 | 50 |
| `layered-3layer` | 0.173 | 0.065 | 0.025 | 0.056 | 1.671 | 80 |
| `layered-openings` | 1.437 | 0.951 | 0.220 | 0.830 | 2.375 | 80 |

## Methodology

Bench source: `apps/bench/src/benches/produce-wall.bench.ts`.
Fixtures source: `packages/geometry-kernel/__tests__/__configs__/index.ts`.
Engine: `produceWall` (in-process, no worker round-trip).  The
Node-worker variant is gated by
`tests/parity/wall/wall-headless-node.test.ts` for byte equality;
we do not double-bench it here.
