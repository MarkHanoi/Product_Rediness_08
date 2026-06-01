# PRYZM 2 — PDF-to-BIM Preview Gate Decision (S70 D8)

**Date**: 2026-04-28
**Sprint**: Phase 3D · S70 · Day 8
**Authority**: ADR-029 Part E (PDF-to-BIM accuracy bar) + ADR-0052 §B.5 (gating decision of record).

---

## 1. Decision

**The PDF-to-BIM feature ships under the `'preview'` label at S70 D8.**

The release label constant is in `apps/ai-worker/src/pdf-to-bim/preview-gate.ts`:

```ts
export const PDF_TO_BIM_RELEASE_LABEL: PdfToBimReleaseLabel = 'preview';
```

Marketing positioning, the editor "Import PDF" dialog, the docs site, and the public API responses all read this constant via `pdfToBimFeatureLabel()` so the wording — `"PDF-to-BIM (preview)"` — is consistent everywhere.

---

## 2. Why "preview" (not "full") at S70 D8

ADR-029 Part E §3 sets a five-threshold accuracy bar — page-classification ≥ 0.90, scale ≥ 0.95, wall-precision ≥ 0.85, wall-recall ≥ 0.75, opening-precision ≥ 0.80 — measured against the SPEC-45 fixture corpus (≥ 50 real PDF sets per ADR-029 Part E §2).

To flip the constant from `'preview'` to `'full'` we must:

1. Run the SPEC-45 fixture-corpus harness against the production PDF-to-BIM pipeline.
2. Feed the resulting numbers to `evaluatePreviewGate()` and observe `'full'`.
3. Record the measurement here.

**As of S70 D8, step 1 has not been performed in this development environment.** The Phase 3 audit (`docs/00_NEW_ARCHITECTURE/audits/PHASE-3-CODE-VS-SPEC-AUDIT-2026-04-28.md`) records the corpus collection as still in progress — the corpus needs ≥ 50 real-architectural PDF sets with hand-verified ground-truth wall + opening + scale annotations, which is a multi-week data-collection task.

Per ADR-0052 §B.5, the safe default behaviour of `evaluatePreviewGate` is to return `'preview'` on any missing-or-failing field. Combined with the absence of a measurement, the decision-of-record is `'preview'`.

---

## 3. What ships at S70 D8 (the gate mechanism)

Even though the corpus is unmeasured, the **gate mechanism** is now wired so the S72 D5 GA tag (or any later sprint) can promote without code changes:

| Artefact | Path | Purpose |
|---|---|---|
| Threshold constants | `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` `PDF_TO_BIM_ACCURACY_THRESHOLDS` | Five floor values per ADR-029 Part E §3, frozen object |
| Pure gating function | `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` `evaluatePreviewGate()` | Returns `'full'` iff all five thresholds met |
| Decision-of-record constant | `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` `PDF_TO_BIM_RELEASE_LABEL` | Currently `'preview'` |
| Centralised label helper | `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` `pdfToBimFeatureLabel()` | Single source of truth for the user-facing wording |
| Vitest suite | `apps/ai-worker/__tests__/pdf-to-bim/preview-gate.test.ts` | 12 cases lock per-threshold + safe-default behaviour |
| Re-export | `apps/ai-worker/src/pdf-to-bim/index.ts` | Public surface |

---

## 4. How to flip to `'full'` (operator runbook)

When the SPEC-45 fixture corpus is ready and the pipeline has been measured:

1. Capture the measurement output as `AccuracyMetrics`:
   ```ts
   const measured: AccuracyMetrics = {
     pageClassificationTop1: 0.93,
     scaleRecognitionWithin5Pct: 0.97,
     wallExtractionPrecision: 0.88,
     wallExtractionRecall: 0.79,
     openingPrecision: 0.84,
   };
   ```
2. Confirm `evaluatePreviewGate(measured) === 'full'`.
3. Edit `preview-gate.ts` and change the constant:
   ```diff
   - export const PDF_TO_BIM_RELEASE_LABEL: PdfToBimReleaseLabel = 'preview';
   + export const PDF_TO_BIM_RELEASE_LABEL: PdfToBimReleaseLabel = 'full';
   ```
4. Append a new section `## 5. <date> — Promoted to "full"` to this file recording the measurement + the sprint that performed it.
5. Update `docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md` row for the sprint.

If any single threshold misses, **do not flip**; instead append a `## 5. <date> — Re-measured, still preview` section and schedule remediations.

---

## 5. Re-evaluation cadence

- **Next mandatory re-evaluation**: S72 D5 (GA tag).
- **Quarterly thereafter**: per ADR-029 Part E §4 ("re-bench every quarter post-GA to catch regressions").
- **Triggered re-evaluation**: any sprint that lands a non-trivial change to `apps/ai-worker/src/pdf-to-bim/stage2-*.ts` or `apps/ai-worker/src/cv/*` must run the harness before merging.

---

## 6. K-gate touched

- **K3D-D**: "If at S70 PDF-to-BIM accuracy bar (per ADR-029 Part E) is not met, defer public preview to post-GA; ship under 'preview' or full label per ADR-029 Part E gate."
  - **Status**: ship under `'preview'` per the decision in §1. The defer-to-post-GA branch is **not** taken because the gate mechanism + the user-facing label are in place; preview ships.

---

## 7. Cross-references

- ADR-029 Part E (the accuracy-bar contract).
- ADR-0052 §B.5 (S70 D8 gating decision).
- `docs/00_NEW_ARCHITECTURE/audits/PHASE-3-CODE-VS-SPEC-AUDIT-2026-04-28.md` (records the corpus-collection status).
- `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` (the code).
- `apps/ai-worker/__tests__/pdf-to-bim/preview-gate.test.ts` (12-case test suite).
