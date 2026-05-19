import { describe, it, expect } from 'vitest';
import {
  aggregateConfidence,
  makeConfidenced,
  shouldReview,
  partitionByConfidence,
  summariseConfidence,
  CONFIDENCE_WEIGHTS,
  REVIEW_THRESHOLD,
  type ConfidencedElement,
} from '../src/confidence.js';

describe('CONFIDENCE_WEIGHTS', () => {
  it('weights sum to 1.0 — invariant required by the geometric-mean formula', () => {
    const sum = CONFIDENCE_WEIGHTS.geometricFit
      + CONFIDENCE_WEIGHTS.symbolClarity
      + CONFIDENCE_WEIGHTS.contextualPlausibility;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('weights match the spec table (0.5 / 0.3 / 0.2)', () => {
    expect(CONFIDENCE_WEIGHTS.geometricFit).toBe(0.5);
    expect(CONFIDENCE_WEIGHTS.symbolClarity).toBe(0.3);
    expect(CONFIDENCE_WEIGHTS.contextualPlausibility).toBe(0.2);
  });

  it('REVIEW_THRESHOLD is 0.85 per ADR-029 Part A', () => {
    expect(REVIEW_THRESHOLD).toBe(0.85);
  });
});

describe('aggregateConfidence', () => {
  it('all-1 inputs produce 1.0', () => {
    expect(aggregateConfidence({
      geometricFit: 1, symbolClarity: 1, contextualPlausibility: 1,
    })).toBeCloseTo(1.0, 6);
  });

  it('all-0 inputs produce 0', () => {
    expect(aggregateConfidence({
      geometricFit: 0, symbolClarity: 0, contextualPlausibility: 0,
    })).toBeCloseTo(0, 6);
  });

  it('a single zero factor drops the aggregate to zero (geometric mean)', () => {
    expect(aggregateConfidence({
      geometricFit: 0, symbolClarity: 1, contextualPlausibility: 1,
    })).toBe(0);
  });

  it('matches the closed-form weighted geometric mean for a non-trivial input', () => {
    const f = { geometricFit: 0.9, symbolClarity: 0.7, contextualPlausibility: 0.5 };
    const expected = Math.pow(0.9, 0.5) * Math.pow(0.7, 0.3) * Math.pow(0.5, 0.2);
    expect(aggregateConfidence(f)).toBeCloseTo(expected, 6);
  });

  it('clamps factors above 1.0 down to 1.0 before aggregating', () => {
    expect(aggregateConfidence({
      geometricFit: 1.5, symbolClarity: 1, contextualPlausibility: 1,
    })).toBeCloseTo(1.0, 6);
  });

  it('clamps negative factors up to 0 (which then drives the product to 0)', () => {
    expect(aggregateConfidence({
      geometricFit: -0.5, symbolClarity: 1, contextualPlausibility: 1,
    })).toBe(0);
  });

  it('non-finite factor short-circuits to 0 (fail-closed)', () => {
    expect(aggregateConfidence({
      geometricFit: NaN, symbolClarity: 1, contextualPlausibility: 1,
    })).toBe(0);
    expect(aggregateConfidence({
      geometricFit: 1, symbolClarity: Infinity, contextualPlausibility: 1,
    })).toBe(0);
  });

  it('high geometric, low symbol, low context — stays under review threshold', () => {
    const c = aggregateConfidence({
      geometricFit: 0.95, symbolClarity: 0.5, contextualPlausibility: 0.4,
    });
    expect(c).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('all factors at 0.9 — clears the auto-accept threshold', () => {
    const c = aggregateConfidence({
      geometricFit: 0.9, symbolClarity: 0.9, contextualPlausibility: 0.9,
    });
    expect(c).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
  });
});

describe('shouldReview', () => {
  it('confidence at threshold is auto-accepted (strictly less than)', () => {
    expect(shouldReview(REVIEW_THRESHOLD)).toBe(false);
    expect(shouldReview(REVIEW_THRESHOLD - 0.01)).toBe(true);
    expect(shouldReview(REVIEW_THRESHOLD + 0.01)).toBe(false);
  });
});

describe('makeConfidenced', () => {
  it('builds a typed envelope around a proposal', () => {
    type WallProposal = { startMm: [number, number]; endMm: [number, number]; thicknessMm: number };
    const proposal: WallProposal = { startMm: [0, 0], endMm: [3000, 0], thicknessMm: 200 };
    const el = makeConfidenced('wall', proposal, {
      geometricFit: 0.9, symbolClarity: 0.85, contextualPlausibility: 0.8,
    });
    expect(el.kind).toBe('wall');
    expect(el.proposal).toBe(proposal);
    expect(el.confidence).toBeCloseTo(
      Math.pow(0.9, 0.5) * Math.pow(0.85, 0.3) * Math.pow(0.8, 0.2), 6,
    );
  });
});

describe('partitionByConfidence + summariseConfidence', () => {
  const els: ConfidencedElement[] = [
    makeConfidenced('wall',   { id: 'w-1' }, { geometricFit: 0.95, symbolClarity: 0.9, contextualPlausibility: 0.9 }), // ~0.93
    makeConfidenced('wall',   { id: 'w-2' }, { geometricFit: 0.6,  symbolClarity: 0.6, contextualPlausibility: 0.6 }), // 0.6
    makeConfidenced('door',   { id: 'd-1' }, { geometricFit: 0.9,  symbolClarity: 0.9, contextualPlausibility: 0.9 }), // 0.9
    makeConfidenced('door',   { id: 'd-2' }, { geometricFit: 0.5,  symbolClarity: 0.4, contextualPlausibility: 0.3 }), // ~0.43
    makeConfidenced('window', { id: 'wn-1' }, { geometricFit: 0.92, symbolClarity: 0.88, contextualPlausibility: 0.85 }),
    makeConfidenced('column', { id: 'c-1' }, { geometricFit: 0.7,  symbolClarity: 0.6, contextualPlausibility: 0.7 }), // <0.85
  ];

  it('partitionByConfidence splits by REVIEW_THRESHOLD', () => {
    const { autoAccept, review } = partitionByConfidence(els);
    const accepts = autoAccept.map(e => (e.proposal as { id: string }).id).sort();
    const reviews = review.map(e => (e.proposal as { id: string }).id).sort();
    expect(accepts).toEqual(['d-1', 'w-1', 'wn-1']);
    expect(reviews).toEqual(['c-1', 'd-2', 'w-2']);
  });

  it('summariseConfidence reports per-kind histogram + review rate', () => {
    const stats = summariseConfidence(els);
    expect(stats.count).toBe(6);
    expect(stats.autoAcceptCount).toBe(3);
    expect(stats.reviewCount).toBe(3);
    expect(stats.reviewRate).toBeCloseTo(0.5, 6);
    expect(stats.meanConfidence).toBeGreaterThan(0);
    expect(stats.meanConfidence).toBeLessThan(1);
    expect(stats.perKind.wall).toEqual({ count: 2, reviewCount: 1 });
    expect(stats.perKind.door).toEqual({ count: 2, reviewCount: 1 });
    expect(stats.perKind.window).toEqual({ count: 1, reviewCount: 0 });
    expect(stats.perKind.column).toEqual({ count: 1, reviewCount: 1 });
  });

  it('summariseConfidence handles empty input without dividing by zero', () => {
    const stats = summariseConfidence([]);
    expect(stats.count).toBe(0);
    expect(stats.reviewRate).toBe(0);
    expect(stats.meanConfidence).toBe(0);
  });
});
