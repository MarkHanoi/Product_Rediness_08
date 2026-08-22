/**
 * 5D regional ESTIMATES and the 4D derived SEQUENCE — the two founder reversals,
 * and the halves of each that were NOT reversed.
 *
 * §REGIONAL-COST-ESTIMATE (L-4830) · §CONSTRUCTABILITY-SEQUENCE (L-4840) ·
 * ADR-0353.
 *
 * ⭐ The most important assertions in this file are the NEGATIVE ones: that an
 * estimate never enters the priced total, that no shipped rate exists, and that
 * no activity ever carries a duration. A capability that looks right and quietly
 * merges an estimate into a quotation is the regression this whole lane exists
 * to avoid.
 */

import { describe, it, expect } from 'vitest';
import { applyRates } from './CostModel.js';
import {
  REGIONAL_RATE_BOOKS,
  SHIPPED_REGIONAL_RATE_COUNT,
  RATE_SOURCE_CANDIDATES,
  ratesShippedWithoutClearedLicence,
  resolveRegionalRates,
  regionalRateForLine,
  type RegionalRateBook,
  type RatePriceProvenance,
} from './RegionalRates.js';
import {
  BUILD_STAGES,
  NO_LEVEL,
  stageForLine,
  deriveConstructionSequence,
  activitiesWithAFabricatedDuration,
} from './ConstructionSequence.js';
import type { TakeoffLine, TakeoffResult } from './TakeoffTypes.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function contribution(elementId: string, quantity: number, levelId: string | null) {
  return { elementId, quantity, levelId, mark: null, label: null, note: null };
}

function line(over: Partial<TakeoffLine> & { code: string }): TakeoffLine {
  const contributions = over.contributions ?? [contribution('e1', 10, 'L0')];
  return {
    chapter: 'walls',
    description: over.code,
    unit: 'm2',
    quantity: contributions.reduce((a, c) => a + c.quantity, 0),
    elementIds: contributions.map((c) => c.elementId),
    basis: 'test',
    qualifiers: [],
    secondary: [],
    materialBreakdown: [],
    materialGap: 'test fixture',
    ...over,
    contributions,
  } as TakeoffLine;
}

function takeoff(lines: TakeoffLine[]): TakeoffResult {
  return {
    generatedAt: 0,
    lines,
    coverage: [],
    unreadableStores: [],
    measuredElementCount: new Set(lines.flatMap((l) => l.elementIds)).size,
  };
}

const PROV: RatePriceProvenance = {
  database: 'TEST BANK',
  publisher: 'nobody',
  edition: '2026',
  priceDate: '2026-01-01',
  itemCode: 'X-1',
  sourcePath: null,
  sourceToChase: 'this is a test fixture and must never ship',
  confidence: 'database-cited',
  licence: 'NOT_ESTABLISHED',
  licenceNote: null,
};

function fixtureBook(over: Partial<RegionalRateBook> = {}): RegionalRateBook {
  return {
    bookId: 'test-book',
    displayName: 'Test bank',
    countryCode: 'es',
    extent: 'municipal',
    jurisdictionKeys: ['es-08019-barcelona'],
    currency: 'EUR',
    rates: [
      { lineCodePrefix: 'WALL.', unit: 'm2', rate: 40, description: 'wall, any', provenance: PROV },
      { lineCodePrefix: 'WALL.special', unit: 'm2', rate: 90, description: 'wall, specific', provenance: PROV },
    ],
    notCovered: ['preliminaries', 'overheads', 'profit', 'VAT'],
    ...over,
  };
}

const AT_BARCELONA = {
  jurisdictionId: 'es-08019-barcelona',
  countryCode: 'es',
  regionKey: null,
  resolution: 'resolved' as const,
};

// ═════════════════════════════════════════════════════════════════════════════
// 5D · WHAT SHIPS: NOTHING
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-COST-ESTIMATE — PRYZM ships ZERO rates, and that is the finding', () => {
  it('⛔ no rate book ships', () => {
    expect(REGIONAL_RATE_BOOKS).toHaveLength(0);
    expect(SHIPPED_REGIONAL_RATE_COUNT).toBe(0);
  });

  it('⛔ THE GATE: nothing may ship under an unread licence', () => {
    // Asserts the RULE. If a future lane adds a book, this goes red unless that
    // book's licence was actually read and marked CLEARED_FOR_REDISTRIBUTION.
    expect(ratesShippedWithoutClearedLicence()).toEqual([]);
    // …and the fixture proves the gate can FAIL, so a green result means something.
    expect(ratesShippedWithoutClearedLicence([fixtureBook()])).toEqual([
      'test-book/WALL.', 'test-book/WALL.special',
    ]);
  });

  it('every candidate source names WHO must establish its licence, and none says "TBD"', () => {
    expect(RATE_SOURCE_CANDIDATES.length).toBeGreaterThan(0);
    for (const c of RATE_SOURCE_CANDIDATES) {
      expect(c.licence).not.toBe('CLEARED_FOR_REDISTRIBUTION');
      expect(c.whatMustBeEstablished.trim().length).toBeGreaterThan(20);
      expect(c.whatMustBeEstablished).not.toMatch(/\bTBD\b/i);
    }
  });

  it('with nothing shipped, the resolver REFUSES and says why — it does not return an empty success', () => {
    const r = resolveRegionalRates(AT_BARCELONA);
    expect(r.tier).toBe('none');
    expect(r.books).toEqual([]);
    expect(r.statement).toContain('licensed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5D · THE LADDER AND THE REFUSALS
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-COST-ESTIMATE — the ladder, and the three ways it refuses', () => {
  it('matches at the finest tier the books cover', () => {
    const r = resolveRegionalRates(AT_BARCELONA, [fixtureBook()]);
    expect(r.tier).toBe('jurisdiction');
    expect(r.books).toHaveLength(1);
  });

  it('falls back to the COUNTRY tier when nothing covers the municipality', () => {
    const national = fixtureBook({ bookId: 'es-national', extent: 'national', jurisdictionKeys: ['es'] });
    const r = resolveRegionalRates(AT_BARCELONA, [national]);
    expect(r.tier).toBe('country');
  });

  it('⛔ REFUSES on AMBIGUOUS rather than picking a jurisdiction', () => {
    const r = resolveRegionalRates(
      { jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'ambiguous' },
      [fixtureBook()],
    );
    expect(r.tier).toBe('none');
    expect(r.statement).toContain('will not pick');
  });

  it('⛔ does NOT substitute a neighbouring region when nothing covers the point', () => {
    const r = resolveRegionalRates(
      { jurisdictionId: 'es-28079-madrid', countryCode: 'pt', regionKey: null, resolution: 'resolved' },
      [fixtureBook()],
    );
    expect(r.tier).toBe('none');
    expect(r.statement).toContain('wrong market');
  });

  it('LONGEST matching prefix wins, so a specific row beats a family row', () => {
    const r = resolveRegionalRates(AT_BARCELONA, [fixtureBook()]);
    expect(regionalRateForLine(line({ code: 'WALL.plain.200' }), r)!.rate.rate).toBe(40);
    expect(regionalRateForLine(line({ code: 'WALL.special.200' }), r)!.rate.rate).toBe(90);
  });

  it('⛔ a unit mismatch is a REFUSAL, not a conversion', () => {
    const r = resolveRegionalRates(AT_BARCELONA, [fixtureBook()]);
    expect(regionalRateForLine(line({ code: 'WALL.plain.200', unit: 'ud' }), r)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5D · THE ESTIMATE IS NEVER THE PRICE
// ═════════════════════════════════════════════════════════════════════════════

describe('§REGIONAL-COST-ESTIMATE — an estimate can never be mistaken for a price', () => {
  const t = () => takeoff([line({ code: 'WALL.plain.200' })]);      // 10 m²
  const resolved = () => resolveRegionalRates(AT_BARCELONA, [fixtureBook()]);

  it('⭐ THE RULE: the estimated money is NOT in the priced total', () => {
    const costed = applyRates(t(), { currency: 'EUR', entries: [] }, resolved());
    // 10 m² × 40 = 400.00 estimated. The priced total sums TYPED rates only.
    expect(costed.summary.estimatedTotal).toBeCloseTo(400, 2);
    expect(costed.summary.pricedTotal).toBe(0);
    expect(costed.summary.pricedLineCount).toBe(0);
    expect(costed.summary.estimatedLineCount).toBe(1);
  });

  it('the estimate lives in its OWN field, never in `amount`', () => {
    const costed = applyRates(t(), null, resolved());
    expect(costed.lines[0].amount).toBeNull();
    expect(costed.lines[0].rate).toBeNull();
    expect(costed.lines[0].estimate!.amount).toBeCloseTo(400, 2);
  });

  it('⛔ THE USER ALWAYS WINS — a line the user priced gets NO estimate at all', () => {
    const costed = applyRates(
      t(),
      { currency: 'EUR', entries: [{ lineCode: 'WALL.plain.200', rate: 55, unit: 'm2', source: 'my quote' }] },
      resolved(),
    );
    expect(costed.lines[0].amount).toBeCloseTo(550, 2);
    expect(costed.lines[0].estimate).toBeNull();
    expect(costed.summary.estimatedTotal).toBe(0);
  });

  it('the coverage statement SAYS the estimate is excluded — it does not rely on the layout to imply it', () => {
    const costed = applyRates(t(), null, resolved());
    expect(costed.summary.coverageStatement).toContain('NOT IN THE TOTAL ABOVE');
  });

  it('every estimate carries its database, edition and PRICE DATE', () => {
    const costed = applyRates(t(), null, resolved());
    const p = costed.lines[0].estimate!.provenance;
    expect(p.database).toBeTruthy();
    expect(p.edition).toBeTruthy();
    expect(p.priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('omitting the regional argument reproduces the pre-amendment behaviour exactly', () => {
    const costed = applyRates(t(), null);
    expect(costed.lines[0].estimate).toBeNull();
    expect(costed.summary.estimatedTotal).toBe(0);
    expect(costed.summary.estimatedLineCount).toBe(0);
    expect(costed.summary.neitherPricedNorEstimatedCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4D · THE DERIVED SEQUENCE
// ═════════════════════════════════════════════════════════════════════════════

const LEVELS = [
  { levelId: 'L0', name: 'Ground', elevation: 0 },
  { levelId: 'L1', name: 'First', elevation: 3 },
  { levelId: 'L2', name: 'Second', elevation: 6 },
];

function building(): TakeoffResult {
  return takeoff([
    line({ code: 'SLAB.concrete.200', chapter: 'structure', unit: 'm3',
      contributions: [contribution('s0', 20, 'L0'), contribution('s1', 20, 'L1'), contribution('s2', 20, 'L2')] }),
    line({ code: 'WALL.blockwork.200', chapter: 'walls',
      contributions: [contribution('w0', 30, 'L0'), contribution('w1', 30, 'L1')] }),
    line({ code: 'DOOR.single.rectangular.900x2100', chapter: 'openings', unit: 'ud',
      contributions: [contribution('d0', 1, 'L0')] }),
    line({ code: 'FIN.FLOOR.tile', chapter: 'finishes',
      contributions: [contribution('r0', 45, 'L0')] }),
    line({ code: 'STAIR.l.concrete', chapter: 'circulation', unit: 'ud',
      contributions: [contribution('st0', 1, 'L0')] }),
    line({ code: 'RAIL.glass', chapter: 'circulation', unit: 'm',
      contributions: [contribution('rl0', 4, 'L0')] }),
    line({ code: 'FURN.desk', chapter: 'furnishings', unit: 'ud',
      contributions: [contribution('f0', 1, null)] }),
  ]);
}

describe('§CONSTRUCTABILITY-SEQUENCE — the order is derived; the duration is still refused', () => {
  it('⛔ THE RULE THAT WAS NOT REVERSED: no activity ever carries a duration', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    expect(activitiesWithAFabricatedDuration(seq)).toEqual([]);
    expect(seq.activities.every((a) => a.durationDays === null)).toBe(true);
    expect(seq.activities[0].durationNote).toContain('output rate');
  });

  it('splits ONE take-off line across LEVELS — the thing the desglose made possible', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const structures = seq.activities.filter((a) => a.stage === 'STRUCTURE');
    // One SLAB line, three storeys, three activities.
    expect(structures.map((a) => a.levelId)).toEqual(['L0', 'L1', 'L2']);
    expect(structures.every((a) => a.lineCodes.includes('SLAB.concrete.200'))).toBe(true);
  });

  it('⭐ a level\'s STRUCTURE depends on the STRUCTURE of the level below, with the reason stated', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const l1 = seq.activities.find((a) => a.id === 'STRUCTURE@L1')!;
    expect(l1.dependsOn).toContain('STRUCTURE@L0');
    expect(l1.dependencyReasons.join(' ')).toContain('cannot stand on a slab that has not been poured');
  });

  it('⛔ WITHOUT a level order that dependency is ABSENT, not satisfied — a name is not an elevation', () => {
    const seq = deriveConstructionSequence(building(), []);
    expect(seq.levelOrderKnown).toBe(false);
    const l1 = seq.activities.find((a) => a.id === 'STRUCTURE@L1')!;
    expect(l1.dependsOn).not.toContain('STRUCTURE@L0');
    expect(seq.coverageStatement).toContain('NO LEVEL ORDER WAS SUPPLIED');
  });

  it('openings follow their host walls, on the same level', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const openings = seq.activities.find((a) => a.id === 'OPENINGS@L0')!;
    expect(openings.dependsOn).toContain('WALLS@L0');
    expect(openings.dependencyReasons.join(' ')).toContain('hosted IN a wall');
  });

  it('a STAIR is structure and a BALUSTRADE is fit-out — one chapter, two stages', () => {
    expect(stageForLine({ chapter: 'circulation', code: 'STAIR.l.concrete' })).toBe('CIRCULATION');
    expect(stageForLine({ chapter: 'circulation', code: 'RAIL.glass' })).toBe('BALUSTRADES');
    const seq = deriveConstructionSequence(building(), LEVELS);
    const rail = seq.activities.find((a) => a.id === 'BALUSTRADES@L0')!;
    expect(rail.dependsOn).toContain('FINISHES@L0');
    expect(rail.rank).toBeGreaterThan(seq.activities.find((a) => a.id === 'CIRCULATION@L0')!.rank);
  });

  it('⭐ SUBSTRUCTURE is listed even though PRYZM measures none of it', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const sub = seq.activities[0];
    expect(sub.stage).toBe('SUBSTRUCTURE');
    expect(sub.measuredNothing).toBe(true);
    expect(sub.elementIds).toEqual([]);
    expect(sub.note).toContain('MEASURES NOTHING');
    // …and everything else follows it.
    expect(seq.activities.slice(1).every((a) => a.dependsOn.includes(sub.id))).toBe(true);
  });

  it('elements that state NO LEVEL are kept in their own bucket and never assumed onto a storey', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const fit = seq.activities.find((a) => a.stage === 'FIT_OUT')!;
    expect(fit.levelId).toBe(NO_LEVEL);
    expect(fit.note).toContain('NO LEVEL');
    expect(seq.coverageStatement).toContain('no level');
  });

  it('the build order is storey by storey, not trade by trade through the whole block', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    const rankOf = (id: string) => seq.activities.find((a) => a.id === id)!.rank;
    // L0's walls precede L1's structure? NO — a storey is completed structurally
    // before the next, but L0's WALLS come after L0's STRUCTURE and before L1's.
    expect(rankOf('STRUCTURE@L0')).toBeLessThan(rankOf('WALLS@L0'));
    expect(rankOf('WALLS@L0')).toBeLessThan(rankOf('STRUCTURE@L1'));
  });

  it('every stage carries a stated RATIONALE — the order can be argued with, not just obeyed', () => {
    for (const s of BUILD_STAGES) {
      expect(s.rationale.trim().length).toBeGreaterThan(30);
    }
  });

  it('the coverage statement states, in words, that there is no forward pass and no critical path', () => {
    const seq = deriveConstructionSequence(building(), LEVELS);
    expect(seq.coverageStatement).toContain('critical path');
    expect(seq.coverageStatement).toContain('NO ACTIVITY HAS A DURATION');
  });

  it('covers every measured element, and reports any it does not', () => {
    const t = building();
    const seq = deriveConstructionSequence(t, LEVELS);
    expect(seq.unsequencedElementIds).toEqual([]);
    // ⭐ ASSERT THE RULE, NOT THE VALUE. This was first written `toBe(9)` — a
    // hand-count of the fixture — and went red at 10 because the hand-count was
    // wrong, not the engine. The rule is "the sequence covers every element the
    // take-off measured", and that survives the fixture growing a row.
    expect(seq.sequencedElementCount).toBe(t.measuredElementCount);
  });
});
