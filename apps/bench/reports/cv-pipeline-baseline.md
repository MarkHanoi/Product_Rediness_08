# Bench baseline — `cv-pipeline` (S50 D8)

Captured 2026-05-09T23:09:14.404Z on the mock CV runtime (cpu, mock-0.1.0).

Page fixture: 600 × 800 (480000 bytes / mask).

| Scenario | cold (ms) | warm avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | budget (ms) |
|---|---:|---:|---:|---:|---:|---:|
| classifyPage(mock) | 0.240 | 0.002 | 0.001 | 0.003 | 0.040 | 1.00 |
| runSegmentationModel(mock, 600×800) | 14.596 | 2.948 | 2.399 | 4.202 | 16.906 | 50.00 |

Real ONNX adapter lands at S52 per SPEC-45 §4; this baseline measures the mock runtime so regressions in the handler / storage / cost-meter glue surface immediately.
