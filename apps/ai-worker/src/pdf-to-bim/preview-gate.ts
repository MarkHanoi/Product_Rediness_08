// @pryzm/ai-worker — PDF-to-BIM preview gate (S70 D8).
//
// Spec authority:
//   • ADR-029 Part E — PDF-to-BIM Accuracy Bar (§3 thresholds).
//   • PHASE-3D §S70 D8 + ADR-0052 §B.5 — preview-vs-full gating
//     decision lives here so callers (the editor's PDF import dialog,
//     the marketing site's "Powered by AI" badge, the ai-worker's job
//     summary) can read ONE constant + ONE function instead of
//     duplicating the threshold checks.
//
// PURE — no I/O, no transport.  The accuracy metrics are produced
// upstream by the SPEC-45 fixture-corpus harness (deferred — see
// `docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S70-PDF-PREVIEW-GATE-DECISION-2026-04-28.md`).

/** ADR-029 Part E §3 — Five accuracy thresholds.  Floor values; meeting
 *  ALL five is the only way to flip the release label to `'full'`. */
export const PDF_TO_BIM_ACCURACY_THRESHOLDS = Object.freeze({
  /** Page classification top-1 accuracy. */
  pageClassificationTop1: 0.9,
  /** Scale-recognition: fraction of pages within ±5% of true scale. */
  scaleRecognitionWithin5Pct: 0.95,
  /** Wall-extraction precision (correct walls / extracted walls). */
  wallExtractionPrecision: 0.85,
  /** Wall-extraction recall (correct walls / true walls). */
  wallExtractionRecall: 0.75,
  /** Door / window / opening precision. */
  openingPrecision: 0.8,
} as const);

/** Accuracy metrics shape — matches the SPEC-45 fixture-corpus
 *  reporter.  Each field is a 0-to-1 ratio over the corpus
 *  (≥ 50 real PDF sets per ADR-029 Part E §2). */
export interface AccuracyMetrics {
  readonly pageClassificationTop1?: number;
  readonly scaleRecognitionWithin5Pct?: number;
  readonly wallExtractionPrecision?: number;
  readonly wallExtractionRecall?: number;
  readonly openingPrecision?: number;
}

/** Release label per ADR-029 Part E.  `'preview'` requires the
 *  marketing positioning + the editor surface to render the
 *  "PDF-to-BIM (preview)" label per ADR-029 Part E §3 last bullet. */
export type PdfToBimReleaseLabel = 'preview' | 'full';

/** Pure gating function.  Returns `'full'` iff EVERY threshold in
 *  `PDF_TO_BIM_ACCURACY_THRESHOLDS` is met or exceeded.  Any miss,
 *  any missing field, or empty input → `'preview'` (safe default —
 *  per ADR-0052 §B.5 we never auto-promote on incomplete data). */
export function evaluatePreviewGate(metrics: AccuracyMetrics | null | undefined): PdfToBimReleaseLabel {
  if (!metrics) return 'preview';
  const t = PDF_TO_BIM_ACCURACY_THRESHOLDS;
  const passes =
    typeof metrics.pageClassificationTop1 === 'number' &&
    metrics.pageClassificationTop1 >= t.pageClassificationTop1 &&
    typeof metrics.scaleRecognitionWithin5Pct === 'number' &&
    metrics.scaleRecognitionWithin5Pct >= t.scaleRecognitionWithin5Pct &&
    typeof metrics.wallExtractionPrecision === 'number' &&
    metrics.wallExtractionPrecision >= t.wallExtractionPrecision &&
    typeof metrics.wallExtractionRecall === 'number' &&
    metrics.wallExtractionRecall >= t.wallExtractionRecall &&
    typeof metrics.openingPrecision === 'number' &&
    metrics.openingPrecision >= t.openingPrecision;
  return passes ? 'full' : 'preview';
}

/** S70 D8 release label decision of record.  Set to `'preview'`
 *  because the SPEC-45 fixture corpus has not yet been measured in
 *  this environment per the Phase 3 audit.  Re-evaluated at S72 D5
 *  GA tag (the next sprint that buys time to measure the corpus).
 *
 *  IMPORTANT: this constant is the SOURCE OF TRUTH for the marketing
 *  badge + the editor "Import PDF" dialog label.  Do NOT flip it
 *  without (a) running the fixture corpus, (b) calling
 *  `evaluatePreviewGate(measured)` and confirming the result is
 *  `'full'`, and (c) recording the measurement in
 *  `docs/00_NEW_ARCHITECTURE/audits/PHASE-3D-S70-PDF-PREVIEW-GATE-DECISION-2026-04-28.md`. */
export const PDF_TO_BIM_RELEASE_LABEL: PdfToBimReleaseLabel = 'preview';

/** Human-readable feature label callers should render alongside any
 *  PDF-to-BIM CTA.  Centralised so the marketing site, the editor
 *  import dialog, and the docs site all use the same wording. */
export function pdfToBimFeatureLabel(label: PdfToBimReleaseLabel = PDF_TO_BIM_RELEASE_LABEL): string {
  return label === 'preview' ? 'PDF-to-BIM (preview)' : 'PDF-to-BIM';
}
