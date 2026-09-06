// §PL-INDICATIVE-RATE — the arms, pinned.
//
// The tests that matter here are the REFUSALS, not the multiplication. A cost estimator that
// multiplies correctly and refuses badly is the shape this repo pays for most: a €0 figure
// produced from a store PRYZM failed to read looks exactly like a free building.

import { describe, it, expect } from 'vitest';
import {
  estimateAtIndicativeRate,
  compareIndicativeToPublishedRate,
  INDICATIVE_COST_REFUSAL_TEXT,
  type IndicativeArea,
  type IndicativeRate,
} from './IndicativeRateEstimate.js';

const RATE: IndicativeRate = {
  amountPerM2: 1800,
  currency: 'EUR',
  source: 'user-supplied',
  setAtIso: '2026-09-06T10:00:00Z',
};

const AREA: IndicativeArea = {
  areaM2: 320,
  basis: 'Σ of 2 declared level envelopes',
  caveat: 'it is a study, not a measured gross floor area',
};

describe('estimateAtIndicativeRate — the answer', () => {
  it('multiplies the rate by the area and rounds to the cent', () => {
    const out = estimateAtIndicativeRate(RATE, AREA);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.estimate.amount).toBe(576000);
    expect(out.estimate.currency).toBe('EUR');
  });

  it('is deterministic — the same inputs give a byte-identical statement', () => {
    const a = estimateAtIndicativeRate(RATE, AREA);
    const b = estimateAtIndicativeRate(RATE, AREA);
    expect(a.ok && b.ok && a.estimate.statement).toBe(b.ok ? b.estimate.statement : '');
  });

  it('⭐ the statement NAMES the rate as the user\'s own and says it is not a quotation', () => {
    const out = estimateAtIndicativeRate(RATE, AREA);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const s = out.estimate.statement;
    expect(s).toContain('YOUR OWN ASSUMPTION');
    expect(s).toContain('not a published rate');
    expect(s).toContain('NOT A QUOTATION');
    expect(s).toContain('NOT IN ANY TOTAL');
    // The area's own caveat travels with the figure — the producer states what it multiplied.
    expect(s).toContain(AREA.caveat);
    expect(s).toContain(AREA.basis);
    // And the rate's vintage, so a stale assumption never reads as fresh.
    expect(s).toContain('2026-09-06T10:00:00Z');
  });
});

describe('estimateAtIndicativeRate — the refusals, each with its OWN sentence', () => {
  it('no rate set ⇒ no-rate, and it is an INSTRUCTION, not an emptiness', () => {
    const out = estimateAtIndicativeRate(null, AREA);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('no-rate');
    expect(out.text).toBe(INDICATIVE_COST_REFUSAL_TEXT['no-rate']);
    expect(out.text).toContain('Type a cost per m²');
  });

  it('⛔ a zero rate is a REFUSAL, never a €0 estimate', () => {
    const out = estimateAtIndicativeRate({ ...RATE, amountPerM2: 0 }, AREA);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('rate-not-positive');
    expect(out.text).toContain('not a free building');
  });

  it('a blank currency refuses rather than defaulting (C38 §1.2 — never inferred from locale)', () => {
    const out = estimateAtIndicativeRate({ ...RATE, currency: '   ' }, AREA);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('currency-missing');
  });

  it('⭐ no area and a ZERO area are DIFFERENT refusals with different sentences', () => {
    const none = estimateAtIndicativeRate(RATE, null);
    const zero = estimateAtIndicativeRate(RATE, { ...AREA, areaM2: 0 });
    expect(none.ok).toBe(false);
    expect(zero.ok).toBe(false);
    if (none.ok || zero.ok) return;
    expect(none.reason).toBe('no-area');
    expect(zero.reason).toBe('area-not-positive');
    expect(none.text).not.toBe(zero.text);
    // The no-area sentence is a finding about the PROJECT and says so.
    expect(none.text).toContain('NOT a failure to read it');
  });

  it('⛔ an area with no stated basis is NOT multiplied', () => {
    const out = estimateAtIndicativeRate(RATE, { ...AREA, basis: '' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('area-basis-missing');
  });

  it('a NaN rate is treated as unset, not as zero', () => {
    const out = estimateAtIndicativeRate({ ...RATE, amountPerM2: Number.NaN }, AREA);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('no-rate');
  });
});

describe('compareIndicativeToPublishedRate — both numbers, or nothing', () => {
  it('names BOTH rates and the ratio', () => {
    const s = compareIndicativeToPublishedRate(RATE, 866.04, 'Barcelona ICIO 2026 · dwelling');
    expect(s).not.toBeNull();
    expect(s).toContain('1800 EUR/m²');
    expect(s).toContain('866.04');
    expect(s).toContain('Barcelona ICIO 2026 · dwelling');
    // ⛔ PRYZM does not adjudicate between them.
    expect(s).toContain('does not say which is right');
  });

  it('⛔ returns null when there is nothing to compare — never "they agree"', () => {
    expect(compareIndicativeToPublishedRate(RATE, null, 'x')).toBeNull();
    expect(compareIndicativeToPublishedRate(null, 866.04, 'x')).toBeNull();
    expect(compareIndicativeToPublishedRate(RATE, 0, 'x')).toBeNull();
  });
});
