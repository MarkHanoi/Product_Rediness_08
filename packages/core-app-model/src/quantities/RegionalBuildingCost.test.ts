/**
 * §REGIONAL-BUILDING-COST (L-9100..L-9107, lane RATE53) — the suite that stands
 * between a SOURCED number and a plausible one.
 *
 * ⭐ WHAT MAKES THESE DIFFERENTIATING. This repo's failure mode with cost data is
 * not "the code is broken", it is "the number looks right and nobody sourced
 * it". So the assertions below are, deliberately, mostly NOT about arithmetic:
 *
 *   • the transcription check compares the published €/m² against the
 *     ordinance's OWN basic-module × coefficient — a mistyped digit is invisible
 *     alone and obvious against its own source;
 *   • the licence check fails on any shipped model whose licence was not READ;
 *   • the isolation checks fail if a building-level figure ever reaches
 *     `CostSummary`, which is the one way this feature could become a lie;
 *   • the ladder checks fail if Barcelona's module is ever served to anywhere
 *     that is not Barcelona.
 *
 * An implementation that returned a nicely-formatted number for every project on
 * Earth would pass a naive "is there an estimate?" test and fail six of these.
 */
import { describe, it, expect } from 'vitest';

import {
  ES_BARCELONA_ICIO_2026,
  REGIONAL_BUILDING_COST_MODELS,
  SHIPPED_BUILDING_COST_MODEL_COUNT,
  buildingCostModelsShippedWithoutClearedLicence,
  buildingCostRowsThatDisagreeWithTheirModule,
  buildingCostModelsThatDoNotStateTheirExclusions,
  resolveBuildingCostModels,
  measuredBuiltArea,
  estimateBuildingCost,
} from './RegionalBuildingCost.js';
import {
  RATE_SOURCE_CANDIDATES,
  SHIPPED_REGIONAL_RATE_COUNT,
  candidatesWithAVerdictButNoLicenceSentence,
  resolveRegionalRates,
  type CostJurisdictionBinding,
} from './RegionalRates.js';
import { applyRates } from './CostModel.js';
import type { TakeoffLine, TakeoffResult } from './TakeoffTypes.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BCN: CostJurisdictionBinding = {
  jurisdictionId: 'es-08019-barcelona',
  countryCode: 'es',
  regionKey: null,
  resolution: 'resolved',
};

const line = (over: Partial<TakeoffLine>): TakeoffLine => ({
  code: 'X.y',
  chapter: 'structure',
  description: 'a line',
  unit: 'm2',
  quantity: 1,
  elementIds: ['e1'],
  contributions: [{ elementId: 'e1', quantity: 1, levelId: null, mark: null, label: null, note: null }],
  basis: 'test',
  qualifiers: [],
  secondary: [],
  materialBreakdown: [],
  materialGap: 'test fixture',
  ...over,
});

const takeoff = (lines: TakeoffLine[]): TakeoffResult => ({
  generatedAt: 0,
  lines,
  coverage: [],
  unreadableStores: [],
  measuredElementCount: lines.length,
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DATA — sourced, or it does not ship
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-BUILDING-COST › the shipped table is sourced', () => {
  it('ships exactly one model, and it is Barcelona’s', () => {
    expect(SHIPPED_BUILDING_COST_MODEL_COUNT).toBe(1);
    expect(REGIONAL_BUILDING_COST_MODELS[0]).toBe(ES_BARCELONA_ICIO_2026);
  });

  it('⛔ no model ships without a READ AND CLEARED licence', () => {
    expect(buildingCostModelsShippedWithoutClearedLicence()).toEqual([]);
  });

  it('every model names its instrument, edition, price date and item code', () => {
    for (const m of REGIONAL_BUILDING_COST_MODELS) {
      const p = m.provenance;
      expect(p.database.length).toBeGreaterThan(0);
      expect(p.publisher.length).toBeGreaterThan(0);
      expect(p.edition.length).toBeGreaterThan(0);
      // A construction rate with no date cannot be indexed to today.
      expect(p.priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.itemCode).toBeTruthy();
      expect(p.sourceToChase.length).toBeGreaterThan(0);
      // ⭐ The verdict must carry the sentence that produced it.
      expect(p.licenceNote?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('⭐ THE TRANSCRIPTION CHECK — every published €/m² agrees with the ordinance’s own basic module × coefficient', () => {
    // DIFFERENTIATING: this is the assertion a mistyped digit fails. A table
    // hand-copied from a PDF has exactly one realistic defect and this is it.
    expect(buildingCostRowsThatDisagreeWithTheirModule()).toEqual([]);
  });

  it('carries the ordinance’s own basic module, 866,04 €/m², and ten typology groups', () => {
    expect(ES_BARCELONA_ICIO_2026.basicModuleRatePerM2).toBe(866.04);
    expect(ES_BARCELONA_ICIO_2026.groups).toHaveLength(10);
    expect(ES_BARCELONA_ICIO_2026.groups.map((g) => g.groupId))
      .toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
  });

  it('group VII is the base case — coefficient 1,00 and the module itself', () => {
    const vii = ES_BARCELONA_ICIO_2026.groups.find((g) => g.groupId === 'VII')!;
    expect(vii.coefficient).toBe(1);
    expect(vii.ratePerAreaM2).toBe(866.04);
  });

  it('⚠ group VI carries the ORDINANCE’S rounding, not ours', () => {
    // 866.04 x 1.30 = 1125.852, and the ordinance prints 1.125,86. The published
    // number is the one with legal force and the one a reader checks us against.
    // DIFFERENTIATING: an implementation that "corrected" this to 1125.85 would
    // be quietly disagreeing with its own cited source.
    const vi = ES_BARCELONA_ICIO_2026.groups.find((g) => g.groupId === 'VI')!;
    expect(vi.ratePerAreaM2).toBe(1125.86);
    expect(vi.ratePerAreaM2).not.toBe(Math.round(866.04 * 1.3 * 100) / 100);
  });

  it('⛔ states what the €/m² IS and what it EXCLUDES — or it is read as a project cost', () => {
    expect(buildingCostModelsThatDoNotStateTheirExclusions()).toEqual([]);
    const nc = ES_BARCELONA_ICIO_2026.notCovered.join(' ');
    // The four exclusions a quantity surveyor would ask about first, all of them
    // named by the ordinance's own Art. 8.
    expect(nc).toMatch(/VAT/i);
    expect(nc).toMatch(/honoraris|Professional fees/i);
    expect(nc).toMatch(/benefici empresarial|contractor/i);
    expect(nc).toMatch(/administrative fiscal reference/i);
  });

  it('carries each group’s label in the SOURCE’s own words, not a translation only', () => {
    for (const g of ES_BARCELONA_ICIO_2026.groups) {
      expect(g.labelInSource.length).toBeGreaterThan(0);
      expect(g.labelInSource).not.toBe(g.label);
    }
  });
});

describe('§REGIONAL-BUILDING-COST › the licence ledger states what it read', () => {
  it('⛔ a READ verdict without the sentence behind it is not a verdict', () => {
    expect(candidatesWithAVerdictButNoLicenceSentence()).toEqual([]);
  });

  it('BEDEC is REFUSED, and the refusal quotes ITeC’s own subscription wording', () => {
    const bedec = RATE_SOURCE_CANDIDATES.find((c) => c.database === 'BEDEC')!;
    expect(bedec.licence).toBe('LICENSED_NOT_REDISTRIBUTABLE');
    expect(bedec.licenceNote).toMatch(/períodes de subscripció/);
  });

  it('⭐ the ledger now contains the OFFICIAL-BULLETIN class that was missing, and it is CLEARED', () => {
    // DIFFERENTIATING: before this lane, every row was a unit-price BOOK and
    // every row was NOT_ESTABLISHED. The old list was refusing the wrong product.
    const cleared = RATE_SOURCE_CANDIDATES.filter((c) => c.licence === 'CLEARED_FOR_REDISTRIBUTION');
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.granularity).toBe('building-level-rate');
    expect(cleared[0]!.licenceNote).toMatch(/No son objeto de propiedad intelectual/);
  });

  it('⛔ the cleared source does NOT populate the per-line rate table', () => {
    // The whole point: a building-level €/m² is not a per-trade unit rate, and
    // shipping it as one would fabricate 42 numbers.
    expect(SHIPPED_REGIONAL_RATE_COUNT).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE LADDER — Barcelona's module is Barcelona's
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-BUILDING-COST › resolution refuses rather than substitutes', () => {
  it('resolves at the jurisdiction rung for Barcelona and names the tier', () => {
    const r = resolveBuildingCostModels(BCN);
    expect(r.tier).toBe('jurisdiction');
    expect(r.models).toHaveLength(1);
    expect(r.statement).toMatch(/es-08019-barcelona/);
  });

  it('⛔ gives Madrid NOTHING — a €/m² from the wrong municipality is a wrong number', () => {
    const r = resolveBuildingCostModels({
      jurisdictionId: 'es-28079-madrid', countryCode: 'es', regionKey: null, resolution: 'resolved',
    });
    expect(r.tier).toBe('none');
    expect(r.models).toEqual([]);
    expect(r.statement).toMatch(/does NOT substitute/);
  });

  it('⛔ does NOT fall through to the country rung — the book is municipal', () => {
    // DIFFERENTIATING: a `country: 'es'` fallthrough would silently price every
    // Spanish project at Barcelona rates and would look like coverage.
    const r = resolveBuildingCostModels({
      jurisdictionId: null, countryCode: 'es', regionKey: null, resolution: 'resolved',
    });
    expect(r.tier).toBe('none');
  });

  it('an unpinned site is a DIFFERENT refusal from an uncovered one', () => {
    const a = resolveBuildingCostModels({ jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'not-asked' });
    const b = resolveBuildingCostModels({ jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'ambiguous' });
    expect(a.statement).toMatch(/No parcel location/);
    expect(b.statement).toMatch(/Two jurisdiction registrations/);
    expect(a.statement).not.toBe(b.statement);
  });

  it('walks the SAME ladder the per-line resolver walks', () => {
    // Both refuse Barcelona today for their own reasons — the per-line table is
    // empty — but neither may ever invent a rung.
    expect(resolveRegionalRates(BCN).tier).toBe('none');
    expect(resolveBuildingCostModels(BCN).tier).toBe('jurisdiction');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE AREA — measured, named as a proxy, or refused
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-BUILDING-COST › the area is measured or the estimate refuses', () => {
  it('prefers slab plan area, and names it as a proxy', () => {
    const t = takeoff([line({
      code: 'SLAB.concrete.200', unit: 'm3', quantity: 24,
      secondary: [{ label: 'Plan area', value: 120, unit: 'm2' }],
    })]);
    const a = measuredBuiltArea(t)!;
    expect(a.areaM2).toBe(120);
    expect(a.proxy).toBe('slab-plan-area');
    expect(a.caveat).toMatch(/PROXY/);
    expect(a.lineCodes).toEqual(['SLAB.concrete.200']);
  });

  it('falls back to floor plan area when there is no slab, and SAYS it did', () => {
    const t = takeoff([line({ code: 'FLOOR.timber', unit: 'm2', quantity: 80 })]);
    const a = measuredBuiltArea(t)!;
    expect(a.proxy).toBe('floor-plan-area');
    expect(a.basis).toMatch(/no slab was measured/);
  });

  it('falls back to room finish area LAST, and says the estimate is therefore LOW', () => {
    const t = takeoff([line({ code: 'FIN.FLOOR.tile', unit: 'm2', quantity: 60 })]);
    const a = measuredBuiltArea(t)!;
    expect(a.proxy).toBe('room-finish-area');
    expect(a.caveat).toMatch(/SUPERFÍCIE ÚTIL/);
    expect(a.caveat).toMatch(/LOW/);
  });

  it('⛔ walls alone measure NO built area — null, never a number derived from the footprint', () => {
    // DIFFERENTIATING: inventing an area from the wall baseline would be a second
    // measurement engine disagreeing with the first.
    const t = takeoff([line({ code: 'WALL.generic.200', unit: 'm2', quantity: 13.11 })]);
    expect(measuredBuiltArea(t)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE ESTIMATE — one figure, never a price, never split across lines
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-BUILDING-COST › the estimate', () => {
  const area = measuredBuiltArea(takeoff([line({
    code: 'SLAB.concrete.200', unit: 'm3', quantity: 24,
    secondary: [{ label: 'Plan area', value: 120, unit: 'm2' }],
  })]))!;

  it('computes rate × area for the chosen typology, by hand: 1.428,96 × 120 = 171.475,20', () => {
    const e = estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', area)!;
    expect(e.effectiveRatePerAreaM2).toBe(1428.96);
    expect(e.amount).toBe(171475.20);
  });

  it('applies a published correction factor when asked: 1.428,96 × 0,4 = 571,58', () => {
    const e = estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', area, 'interior-reform')!;
    expect(e.correction!.factor).toBe(0.4);
    expect(e.effectiveRatePerAreaM2).toBe(571.58);
    expect(e.amount).toBe(Math.round(571.58 * 120 * 100) / 100);
  });

  it('⛔ REFUSES without a typology — there is no default, and the table spans a factor of nine', () => {
    // DIFFERENTIATING: defaulting to "dwelling" would be a guess with a legal
    // citation attached. Group X is 259,81 and group I is 2.381,61.
    expect(estimateBuildingCost(ES_BARCELONA_ICIO_2026, null, area)).toBeNull();
    expect(estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'NOT-A-GROUP', area)).toBeNull();
  });

  it('⛔ REFUSES without an area — never a zero, never a partial figure', () => {
    expect(estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', null)).toBeNull();
  });

  it('the statement carries the rate, the area, the price date and the NOT-IN-THE-TOTAL warning', () => {
    const e = estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', area)!;
    expect(e.statement).toMatch(/1428\.96 EUR\/m²/);
    expect(e.statement).toMatch(/120 m²/);
    expect(e.statement).toMatch(/2026-02-02/);
    expect(e.statement).toMatch(/NOT IN THE PRICED TOTAL/);
    expect(e.statement).toMatch(/MATERIAL EXECUTION/);
    // The area proxy travels with the number, always.
    expect(e.statement).toMatch(/proxy/i);
  });

  it('⭐⭐ THE ISOLATION RULE — the building estimate never enters any cost total', () => {
    // This is the assertion that keeps the feature from becoming a lie. The
    // building figure is computed on a DIFFERENT call and CostSummary cannot
    // see it: `applyRates` does not take a building model and has no field for
    // one.
    const t = takeoff([line({
      code: 'SLAB.concrete.200', unit: 'm3', quantity: 24,
      secondary: [{ label: 'Plan area', value: 120, unit: 'm2' }],
    })]);
    const costed = applyRates(t, null, resolveRegionalRates(BCN));
    const e = estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', measuredBuiltArea(t)!)!;

    expect(e.amount).toBeGreaterThan(0);
    expect(costed.summary.pricedTotal).toBe(0);
    expect(costed.summary.estimatedTotal).toBe(0);
    expect(costed.summary.pricedLineCount).toBe(0);
    // ⛔ No key on the summary holds the building figure, under any name.
    expect(Object.values(costed.summary)).not.toContain(e.amount);
    expect(JSON.stringify(costed.summary)).not.toContain(String(e.amount));
  });

  it('⛔ produces ONE figure for the whole building — it is never divided across lines', () => {
    // DIFFERENTIATING: the fabrication this module exists to refuse is splitting
    // a building €/m² into 42 per-trade rates by assumed percentages. There is
    // no such function, and the estimate carries no per-line shape at all.
    const e = estimateBuildingCost(ES_BARCELONA_ICIO_2026, 'V', area)!;
    expect(typeof e.amount).toBe('number');
    expect(e).not.toHaveProperty('lines');
    expect(e).not.toHaveProperty('perLine');
    expect(e).not.toHaveProperty('breakdown');
  });
});
