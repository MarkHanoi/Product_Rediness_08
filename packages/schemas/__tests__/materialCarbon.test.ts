/**
 * §MATERIAL-CARBON-FACTS (L-3100/L-3101) — the factor table's OWN integrity.
 *
 * ⭐ WHAT THIS SUITE IS FOR. `CarbonModel.test.ts` (L2) proves the arithmetic.
 * This one proves the thing the arithmetic cannot see: that every shipped number
 * is attached to a real material, carries a real citation, and does not claim to
 * have been checked when it has not.
 *
 * The specific failures it is built to catch:
 *   • a factor keyed to a material id that DOES NOT EXIST — it would apply to
 *     nothing, forever, and nothing on the 6D surface would ever look wrong;
 *   • a factor with an empty or token `source` — the exact defect the founder
 *     named: "a carbon number with no cited source is worse than no number";
 *   • a row that has quietly acquired `VERIFIED_AGAINST_SOURCE` without anybody
 *     opening the source document;
 *   • the seeding pressure — an assertion that most of the catalogue reads NOT
 *     MEASURED, so "fill in the blanks with plausible values" fails a test rather
 *     than passing review.
 */

import { describe, it, expect } from 'vitest';
import {
  MATERIAL_CATALOG,
  findMaterialRecord,
  CARBON_FACTOR_TABLE,
  SHIPPED_CARBON_FACTOR_COUNT,
  carbonFactorOrphans,
  carbonPerCubicMetre,
  findCarbonFacts,
  isCarbonGap,
  isCarbonMeasured,
} from '../src/materials/index.js';

describe('every shipped factor is attached to a REAL material', () => {
  it('has no orphans — a factor keyed to a non-existent id applies to nothing, forever', () => {
    expect(carbonFactorOrphans(MATERIAL_CATALOG.map((m) => m.id))).toEqual([]);
  });

  it('the facts reach the record itself, not a parallel table beside it', () => {
    // C100 §1.1: one record shape. A consumer reads `record.carbon`; it never
    // has to know `CARBON_FACTOR_TABLE` exists.
    const concrete = findMaterialRecord('concrete-smooth');
    expect(concrete?.carbon?.carbonA1A3?.value).toBe(0.113);
    expect(concrete?.carbon?.density?.kgPerM3).toBe(2400);
  });

  it('a material with no factor carries `carbon: undefined` — never a zero row', () => {
    const white = findMaterialRecord('concrete-white');
    expect(white).toBeDefined();
    expect(white?.carbon).toBeUndefined();
  });
});

describe('no number ships without its provenance', () => {
  const rows = Object.entries(CARBON_FACTOR_TABLE);

  it('ships a small, named set rather than a filled-in catalogue', () => {
    expect(SHIPPED_CARBON_FACTOR_COUNT).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(0);
    // ⭐ THE SEEDING TRIPWIRE. Ten cited factors and three hundred honest blanks
    // is correct; three hundred plausible ones is the failure. If someone tries
    // to "complete" the table, this fails before review does.
    expect(rows.length).toBeLessThan(MATERIAL_CATALOG.length / 4);
  });

  it('the great majority of the catalogue reads NOT MEASURED, and that is the intended state', () => {
    const withFactor = MATERIAL_CATALOG.filter((m) => m.carbon?.carbonA1A3).length;
    expect(withFactor).toBe(rows.length);
    expect(MATERIAL_CATALOG.length - withFactor).toBeGreaterThan(200);
  });

  it.each(rows)('%s carries a citation, a dataset, a year and a geography', (_id, facts) => {
    for (const fact of [facts.carbonA1A3, facts.density]) {
      if (!fact) continue;
      expect(fact.source.length).toBeGreaterThan(30);
      expect(fact.dataset.trim().length).toBeGreaterThan(0);
      expect(fact.year).toBeGreaterThan(1990);
      expect(fact.geography.trim().length).toBeGreaterThan(0);
      expect(fact.provenance).toBe('BUILTIN_REFERENCE');
    }
  });

  it.each(rows)('%s is UNVERIFIED — cited is not checked', (_id, facts) => {
    // ⛔ Flipping a row to VERIFIED_AGAINST_SOURCE requires opening the source
    // document and recording who did it and when, in the row's own `source`.
    // Until that happens for a row, this assertion is what stops the claim.
    expect(facts.carbonA1A3?.verification ?? 'UNVERIFIED_TRANSCRIPTION').toBe('UNVERIFIED_TRANSCRIPTION');
    expect(facts.density?.verification ?? 'UNVERIFIED_TRANSCRIPTION').toBe('UNVERIFIED_TRANSCRIPTION');
  });

  it.each(rows)('%s declares the A1-A3 product stage, never a bare number', (_id, facts) => {
    if (facts.carbonA1A3) expect(facts.carbonA1A3.scope).toBe('A1-A3');
  });
});

describe('carbonPerCubicMetre refuses rather than assumes', () => {
  it('a per-kg factor with a density resolves', () => {
    const p = carbonPerCubicMetre(findCarbonFacts('concrete-smooth'));
    expect(isCarbonMeasured(p)).toBe(true);
    // 2400 × 0.113 = 271.2 kgCO2e per m3, to floating-point tolerance.
    if (isCarbonMeasured(p)) expect(p.kgCO2ePerM3).toBeCloseTo(271.2, 6);
  });

  it('a per-kg factor with NO density is NO_DENSITY, not a guessed 2400', () => {
    const p = carbonPerCubicMetre(findCarbonFacts('insulation-mineral-wool'));
    expect(isCarbonGap(p)).toBe(true);
    if (isCarbonGap(p)) {
      expect(p.reason).toBe('NO_DENSITY');
      expect(p.note).toMatch(/invent/i);
    }
  });

  it('no facts at all is NO_FACTOR — and the note says NOT MEASURED, not zero', () => {
    const p = carbonPerCubicMetre(undefined);
    expect(isCarbonGap(p)).toBe(true);
    if (isCarbonGap(p)) {
      expect(p.reason).toBe('NO_FACTOR');
      expect(p.note).toMatch(/NOT MEASURED/);
      expect(p.note).toMatch(/not zero/);
    }
  });

  it('a miss on the table is `undefined`, never a nearest-material substitute', () => {
    expect(findCarbonFacts('stone-marble-white')).toBeUndefined();
    expect(findCarbonFacts('not-a-material')).toBeUndefined();
  });
});

describe('the qualifiers say what a published row does NOT cover', () => {
  it('concrete states that reinforcement is excluded', () => {
    expect(findCarbonFacts('concrete-smooth')!.carbonA1A3!.qualifier).toMatch(/REINFORCEMENT IS NOT INCLUDED/);
  });

  it('brick states that mortar is excluded, and roughly how much that matters', () => {
    const q = findCarbonFacts('brick-red')!.carbonA1A3!.qualifier!;
    expect(q).toMatch(/MORTAR IS NOT INCLUDED/);
    expect(q).toMatch(/15-20%/);
  });

  it('every timber row states that biogenic sequestration is excluded', () => {
    for (const id of ['timber-glulam', 'timber-clt', 'timber-plywood', 'wood-pine']) {
      expect(findCarbonFacts(id)!.carbonA1A3!.qualifier).toMatch(/sequestration/i);
    }
  });
});
