# Bench baseline — `pdf-to-bim-stage2` (S51 D8)

Captured 2026-05-09T23:09:00.230Z on a synthetic 50-line page (10 horizontal + 10 vertical wall pairs + 5 columns).

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| extractLines(50-line page) | 0.077 | 0.087 | 0.026 | 0.045 | 5.998 | 1.00 |
| detectWallPairs(40 wall lines) | 0.707 | 0.071 | 0.014 | 0.045 | 3.100 | 3.00 |
| detectColumns(5 rect candidates) | 2.345 | 0.071 | 0.013 | 0.019 | 3.055 | 1.00 |
| classifyPageStage2(end-to-end) | 0.239 | 0.054 | 0.015 | 0.048 | 2.088 | 5.00 |

Real PDF pages run 200–400 vector primitives. The end-to-end p95 budget of 5 ms gives ~10× headroom for the production handler at S52 to fit inside SPEC-45 §3's 30 ms per-page CV window.
