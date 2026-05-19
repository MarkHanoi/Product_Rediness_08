// S70 D8 — PDF-to-BIM preview-gate tests per ADR-029 Part E + ADR-0052 §B.5.
// 12 cases lock the gating semantics:
//   - default constant is 'preview' (decision of record at S70 D8)
//   - empty / null / undefined → 'preview' (safe default)
//   - all-pass → 'full'
//   - each of the 5 thresholds: at-boundary pass + just-below fail
//   - feature label flips correctly

import { describe, it, expect } from 'vitest';
import {
  PDF_TO_BIM_ACCURACY_THRESHOLDS as T,
  PDF_TO_BIM_RELEASE_LABEL,
  evaluatePreviewGate,
  pdfToBimFeatureLabel,
} from '../../src/pdf-to-bim/preview-gate.js';

const ALL_PASS = {
  pageClassificationTop1: T.pageClassificationTop1,
  scaleRecognitionWithin5Pct: T.scaleRecognitionWithin5Pct,
  wallExtractionPrecision: T.wallExtractionPrecision,
  wallExtractionRecall: T.wallExtractionRecall,
  openingPrecision: T.openingPrecision,
} as const;

describe('PDF-to-BIM preview gate (ADR-029 Part E)', () => {
  it('decision-of-record constant is "preview" at S70 D8', () => {
    expect(PDF_TO_BIM_RELEASE_LABEL).toBe('preview');
  });

  it('null / undefined / empty metrics → "preview" (safe default)', () => {
    expect(evaluatePreviewGate(null)).toBe('preview');
    expect(evaluatePreviewGate(undefined)).toBe('preview');
    expect(evaluatePreviewGate({})).toBe('preview');
  });

  it('all-pass → "full"', () => {
    expect(evaluatePreviewGate(ALL_PASS)).toBe('full');
  });

  it('exceeding every threshold also → "full"', () => {
    expect(evaluatePreviewGate({
      pageClassificationTop1: 0.99,
      scaleRecognitionWithin5Pct: 0.99,
      wallExtractionPrecision: 0.99,
      wallExtractionRecall: 0.99,
      openingPrecision: 0.99,
    })).toBe('full');
  });

  it('page-classification at boundary passes; below fails', () => {
    expect(evaluatePreviewGate({ ...ALL_PASS, pageClassificationTop1: T.pageClassificationTop1 })).toBe('full');
    expect(evaluatePreviewGate({ ...ALL_PASS, pageClassificationTop1: T.pageClassificationTop1 - 0.01 })).toBe('preview');
  });

  it('scale-recognition at boundary passes; below fails', () => {
    expect(evaluatePreviewGate({ ...ALL_PASS, scaleRecognitionWithin5Pct: T.scaleRecognitionWithin5Pct })).toBe('full');
    expect(evaluatePreviewGate({ ...ALL_PASS, scaleRecognitionWithin5Pct: T.scaleRecognitionWithin5Pct - 0.01 })).toBe('preview');
  });

  it('wall-precision at boundary passes; below fails', () => {
    expect(evaluatePreviewGate({ ...ALL_PASS, wallExtractionPrecision: T.wallExtractionPrecision })).toBe('full');
    expect(evaluatePreviewGate({ ...ALL_PASS, wallExtractionPrecision: T.wallExtractionPrecision - 0.01 })).toBe('preview');
  });

  it('wall-recall at boundary passes; below fails', () => {
    expect(evaluatePreviewGate({ ...ALL_PASS, wallExtractionRecall: T.wallExtractionRecall })).toBe('full');
    expect(evaluatePreviewGate({ ...ALL_PASS, wallExtractionRecall: T.wallExtractionRecall - 0.01 })).toBe('preview');
  });

  it('opening-precision at boundary passes; below fails', () => {
    expect(evaluatePreviewGate({ ...ALL_PASS, openingPrecision: T.openingPrecision })).toBe('full');
    expect(evaluatePreviewGate({ ...ALL_PASS, openingPrecision: T.openingPrecision - 0.01 })).toBe('preview');
  });

  it('any single field missing → "preview" (no partial credit)', () => {
    const { pageClassificationTop1: _drop, ...minus1 } = ALL_PASS;
    expect(evaluatePreviewGate(minus1)).toBe('preview');
    const { openingPrecision: _drop2, ...minus2 } = ALL_PASS;
    expect(evaluatePreviewGate(minus2)).toBe('preview');
  });

  it('feature label reflects the gate', () => {
    expect(pdfToBimFeatureLabel('preview')).toBe('PDF-to-BIM (preview)');
    expect(pdfToBimFeatureLabel('full')).toBe('PDF-to-BIM');
    // Default arg uses the decision-of-record constant.
    expect(pdfToBimFeatureLabel()).toBe('PDF-to-BIM (preview)');
  });

  it('thresholds frozen — module-of-record is read-only', () => {
    expect(Object.isFrozen(T)).toBe(true);
    expect(() => {
      // @ts-expect-error — runtime guard for mutation attempts.
      T.pageClassificationTop1 = 0;
    }).toThrow();
  });
});
