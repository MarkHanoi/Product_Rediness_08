# Bench baseline — `cv-pipeline` (S50 D8)

Captured 2026-08-11T10:13:18.350Z on the mock CV runtime (cpu, mock-0.1.0).

Page fixture: 600 × 800 (480000 bytes / mask).

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| classifyPage(mock) | 0.458 | 0.010 | 0.002 | 0.009 | 0.195 | 1.00 |
| runSegmentationModel(mock, 600×800) | 37.149 | 8.078 | 3.476 | 9.830 | 101.489 | 50.00 |

Real ONNX adapter lands at S52 per SPEC-45 §4; this baseline measures the mock runtime so regressions in the handler / storage / cost-meter glue surface immediately.
