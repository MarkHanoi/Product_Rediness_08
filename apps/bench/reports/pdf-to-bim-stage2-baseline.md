# Bench baseline — `pdf-to-bim-stage2` (S51 D8)

Captured 2026-08-11T10:14:08.945Z on a synthetic 50-line page (10 horizontal + 10 vertical wall pairs + 5 columns).

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| extractLines(50-line page) | 0.060 | 0.011 | 0.007 | 0.028 | 0.099 | 1.00 |
| detectWallPairs(40 wall lines) | 0.894 | 0.026 | 0.017 | 0.046 | 0.338 | 3.00 |
| detectColumns(5 rect candidates) | 0.667 | 0.014 | 0.009 | 0.025 | 0.110 | 1.00 |
| classifyPageStage2(end-to-end) | 0.787 | 0.047 | 0.027 | 0.085 | 0.806 | 5.00 |

Real PDF pages run 200–400 vector primitives. The end-to-end p95 budget of 5 ms gives ~10× headroom for the production handler at S52 to fit inside SPEC-45 §3's 30 ms per-page CV window.
