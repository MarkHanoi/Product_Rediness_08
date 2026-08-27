/**
 * ScheduleCostBridge.test.ts — §LIVESCHED151 (E).
 *
 * §CONTEXT-DATA-HONESTY / C78 §8.1 is the thing under test: a missing rate and
 * a genuinely zero cost must never render (or sum) the same, and an element
 * with no take-off line at all is a THIRD, distinct state from either.
 */
import { describe, it, expect } from 'vitest';
import { buildElementCostIndex, summariseElementCost } from './ScheduleCostBridge.js';
import type { CostedLine, CostedTakeoff } from '../quantities/CostModel.js';
import type { TakeoffContribution } from '../quantities/TakeoffTypes.js';

/** Build a minimal, valid-enough CostedLine for this module's own reads
 *  (`line.code`, `line.contributions[].elementId/.quantity`, `rate`, `amount`).
 *  Every OTHER TakeoffLine field is present but inert — this test does not
 *  exercise them, and a real `computeTakeoff()`/`applyRates()` pass is
 *  QuantityTakeoff.test.ts / the medición honesty suite's job, not this one's. */
function line(opts: {
  code: string;
  contributions: ReadonlyArray<{ elementId: string; quantity: number }>;
  rate: number | null;
  amount: number | null;
}): CostedLine {
  return {
    rate: opts.rate,
    amount: opts.amount,
    source: opts.rate !== null ? 'test-source' : null,
    unpricedReason: opts.rate === null ? ('NO_RATE' as const) : null,
    estimate: null,
    line: {
      code: opts.code,
      chapter: 'finishes' as const,
      description: opts.code,
      unit: 'm2' as const,
      quantity: opts.contributions.reduce((s, c) => s + c.quantity, 0),
      elementIds: opts.contributions.map((c) => c.elementId),
      contributions: opts.contributions.map((c): TakeoffContribution => ({
        elementId: c.elementId,
        quantity: c.quantity,
        levelId: null,
        mark: null,
        label: null,
        note: null,
      })),
      basis: 'test basis',
      qualifiers: [],
      secondary: [],
      materialBreakdown: [],
      materialGap: 'test — no material attribution needed for this suite',
    },
  };
}

describe('ScheduleCostBridge — buildElementCostIndex + summariseElementCost', () => {
  it('an element with NO take-off line at all is "not measured", never amount:0', () => {
    const costed = { lines: [], summary: {} as any } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    const summary = summariseElementCost(index.get('room-never-measured'));
    expect(summary.measured).toBe(false);
    expect(summary.amount).toBeNull();
    expect(summary.complete).toBe(false);
    expect(summary.reason).toBe('not measured by the take-off');
  });

  it('measured but UNPRICED reads amount:null, never 0 — a different state from "not measured"', () => {
    const costed = {
      lines: [line({ code: 'FIN.FLOOR.oak', contributions: [{ elementId: 'room-1', quantity: 12 }], rate: null, amount: null })],
      summary: {} as any,
    } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    const summary = summariseElementCost(index.get('room-1'));
    expect(summary.measured).toBe(true);
    expect(summary.amount).toBeNull();
    expect(summary.complete).toBe(false);
    expect(summary.reason).toBe('no rate for any contributing line');
  });

  it('a PRICED single-contribution line: amount = quantity × rate, exactly, complete=true', () => {
    const costed = {
      lines: [line({ code: 'DOOR.single.rectangular.900x2100', contributions: [{ elementId: 'door-1', quantity: 1 }], rate: 250, amount: 250 })],
      summary: {} as any,
    } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    const summary = summariseElementCost(index.get('door-1'));
    expect(summary.measured).toBe(true);
    expect(summary.amount).toBe(250);
    expect(summary.complete).toBe(true);
    expect(summary.reason).toBeNull();
  });

  it('two elements SHARING one priced line each get THEIR OWN amount (contribution.quantity × rate), not the line total', () => {
    // §TAKEOFF-DESGLOSE's own point: the line prices a GROUP, but each element's
    // amount must be re-attributed by its OWN quantity share, not the group's.
    const costed = {
      lines: [line({
        code: 'FIN.FLOOR.oak',
        contributions: [
          { elementId: 'room-a', quantity: 10 },
          { elementId: 'room-b', quantity: 30 },
        ],
        rate: 40, // €/m²
        amount: 1600, // (10+30) * 40
      })],
      summary: {} as any,
    } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    const a = summariseElementCost(index.get('room-a'));
    const b = summariseElementCost(index.get('room-b'));
    expect(a.amount).toBe(400);  // 10 * 40 — NOT 1600
    expect(b.amount).toBe(1200); // 30 * 40 — NOT 1600
    expect(a.amount! + b.amount!).toBe(1600); // still sums to the line total
  });

  it('a room contributing to THREE lines (floor/ceiling/wall finish) — one priced, one unpriced, one absent — sums only the priced one and reports incomplete', () => {
    const costed = {
      lines: [
        line({ code: 'FIN.FLOOR.oak', contributions: [{ elementId: 'room-1', quantity: 12 }], rate: 40, amount: 480 }),
        line({ code: 'FIN.WALL.paint', contributions: [{ elementId: 'room-1', quantity: 30 }], rate: null, amount: null }),
        // no FIN.CEIL line for room-1 at all (e.g. zero height) — contributes nothing.
      ],
      summary: {} as any,
    } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    const summary = summariseElementCost(index.get('room-1'));
    expect(summary.measured).toBe(true);
    expect(summary.amount).toBe(480); // ONLY the priced floor line
    expect(summary.complete).toBe(false); // the wall line is unpriced — LOWER BOUND
    expect(summary.reason).toContain('LOWER BOUND');
  });

  it('an element absent from a line it never contributed to is unaffected by that line', () => {
    const costed = {
      lines: [line({ code: 'DOOR.single.rectangular.900x2100', contributions: [{ elementId: 'door-1', quantity: 1 }], rate: 250, amount: 250 })],
      summary: {} as any,
    } as unknown as CostedTakeoff;
    const index = buildElementCostIndex(costed);
    expect(index.get('door-2')).toBeUndefined();
    expect(summariseElementCost(index.get('door-2')).measured).toBe(false);
  });
});
