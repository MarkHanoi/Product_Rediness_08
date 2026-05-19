# S65 api-gateway baseline (in-process baseline)

Generated: 2026-04-28T13:33:07.279Z
Node: v20.20.0
Targets: read p95 < 200 ms, write p95 < 500 ms

| endpoint | samples | p50 ms | p95 ms | p99 ms | max ms | mean ms |
|---|---|---|---|---|---|---|
| GET /v1/health | 200 | 2.441 | 7.116 | 10.682 | 29.807 | 3.087 |
| GET /v1/ai/workflows | 200 | 2.018 | 6.641 | 13.433 | 24.167 | 2.908 |
| GET /v1/formulas | 200 | 2.249 | 5.859 | 8.757 | 8.806 | 2.668 |
| GET /v1/admin/ai-spend | 200 | 1.7 | 4.716 | 14.97 | 24.9 | 2.305 |

> In-process baseline. Production p95 verification (network + concurrency) at S65 D8 staging deploy.
