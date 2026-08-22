/**
 * analysisFacets — the cross-filter selection model.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * ADR:             ADR-0358 §2 (the three rules) · §3 (facets narrow emphasis,
 *                  never a denominator)
 * Contracts:       C27 §4
 * Issue log:       L-6602 · L-6603 · L-6604
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THESE PIN, AND WHY EACH ONE IS A DEFECT WAITING TO HAPPEN
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder's sentence is *"if walls for example and level 1 are selected -
 * then wall in level 1 should be highlighted"*. Every test below is one way that
 * sentence can quietly stop being true:
 *
 *   • the second click REPLACES instead of narrowing (the flat-set failure);
 *   • two clicks on the SAME axis intersect and yield nothing every second time;
 *   • there is no way back to the whole population;
 *   • a facet pins ids and decays as the model moves;
 *   • an unresolvable axis renders as "matches nothing" instead of "snapshot";
 *   • an empty intersection reads as a broken dashboard instead of an answer.
 *
 * ⚠ ONE module graph for the whole file, and `vi.resetModules()` is deliberately
 * NOT used. `@pryzm/core-app-model` pulls in THREE; re-importing it per test blew
 * the 10 s hook budget and the suite failed on timeouts rather than on
 * assertions. Isolation comes from `clearFacets()` plus re-stubbing the stores
 * and invalidating the census — which is all the state these modules hold.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisFigure } from '../AnalysisTypes';

// ── The one seam: `selectionBus`, so a dispatch is observable ─────────────────
//
// ⛔ MOCKED AT THE BUS, NOT AT `idsForFacet`. Mocking the resolver would test the
// facet arithmetic against a fake that cannot disagree with the real read model
// — [[fake-more-capable-than-real]]. Driving the REAL `getCensus()` means these
// tests also pin that the census's `unassigned` and `family:type` key
// derivations stay in step with the facet resolver's, which is exactly the pair
// most likely to drift apart.
const stub = vi.hoisted(() => ({
  bus: { dispatch: vi.fn(), currentIds: [] as string[] },
}));

vi.mock('@pryzm/core-app-model', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  selectionBus: stub.bus,
}));

import { invalidateAnalysisReadModel } from '../analysisReadModel';
import {
  activeFacets,
  clearFacets,
  describeResolution,
  isFacetActive,
  removeFacet,
  resolveFacets,
  toggleFacet,
} from '../selectionFacets';

interface Rec { id: string; levelId?: string | null; systemTypeId?: string }

/**
 * Publish (or, with `null`, UNPUBLISH) a store on the window the census reads.
 *
 * ⭐ `null` is not "an empty store". `readStore` returns `null` for a store that
 * is not on `window` and `[]` for one that is there and empty, and the census
 * keeps that difference all the way to the coverage table. The facet resolver
 * inherits it: an unreachable family is UNRESOLVABLE, an empty one resolves to
 * the empty set. Two tests below turn on precisely that distinction.
 */
function stubStores(walls: Rec[] | null, doors: Rec[] | null): void {
  const w = globalThis as unknown as Record<string, unknown>;
  if (walls === null) delete w.wallStore;
  else w.wallStore = { getAll: () => walls };
  if (doors === null) delete w.doorStore;
  else w.doorStore = { getAll: () => doors };
  invalidateAnalysisReadModel();
}

const fig = (key: string, label: string, ids: string[] = []): AnalysisFigure => ({
  key, label, value: ids.length, unit: 'ud',
  basis: 'test', elementIds: ids, qualifiers: [],
});

const WALLS: Rec[] = [
  { id: 'w1', levelId: 'L1', systemTypeId: 'ext' },
  { id: 'w2', levelId: 'L1', systemTypeId: 'int' },
  { id: 'w3', levelId: 'L2', systemTypeId: 'ext' },
  { id: 'w4', levelId: null, systemTypeId: 'ext' },
];
const DOORS: Rec[] = [{ id: 'd1', levelId: 'L1' }, { id: 'd2', levelId: 'L2' }];

beforeEach(() => {
  clearFacets();
  stubStores(WALLS, DOORS);
  stub.bus.dispatch.mockClear();
});

describe('L-6602 — facets compose; flat id sets do not', () => {
  // ── RULE 1: across axes, INTERSECTION ───────────────────────────────────────

  it('THE FOUNDER SENTENCE: walls ∩ level 1 yields only the walls on level 1', () => {
    toggleFacet('category', fig('walls', 'Walls', ['w1', 'w2', 'w3', 'w4']));
    expect([...resolveFacets().ids].sort()).toEqual(['w1', 'w2', 'w3', 'w4']);

    toggleFacet('level', fig('L1', 'Level 1', ['w1', 'w2', 'd1']));
    // ⭐ The second click NARROWS. w3 is a wall but on L2; d1 is on L1 but is a
    // door. Neither survives, and neither operand alone could have said so.
    expect([...resolveFacets().ids].sort()).toEqual(['w1', 'w2']);
  });

  it('the order of the two clicks does not change the answer', () => {
    toggleFacet('level', fig('L1', 'Level 1'));
    toggleFacet('category', fig('walls', 'Walls'));
    expect([...resolveFacets().ids].sort()).toEqual(['w1', 'w2']);
  });

  it('three axes compose too — family ∩ storey ∩ type', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('level', fig('L1', 'Level 1'));
    toggleFacet('type', fig('walls:ext', 'Walls · ext'));
    expect([...resolveFacets().ids]).toEqual(['w1']); // the only exterior wall on L1
  });

  // ── RULE 2: within one axis, REPLACEMENT ────────────────────────────────────

  it('a second key on the SAME axis REPLACES — it does not intersect to nothing', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('category', fig('doors', 'Doors'));
    // ⛔ Intersecting within an axis gives nothing on every second click, which
    // is why it was never a candidate. Replacement is the rule.
    expect([...resolveFacets().ids].sort()).toEqual(['d1', 'd2']);
    expect(activeFacets()).toHaveLength(1);
  });

  it('replacing one axis leaves every OTHER axis untouched', () => {
    toggleFacet('level', fig('L1', 'Level 1'));
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('category', fig('doors', 'Doors'));
    expect([...resolveFacets().ids]).toEqual(['d1']); // doors ∩ L1
  });

  // ── RULE 3: there is always a way back ──────────────────────────────────────

  it('clicking the same key again clears that axis — the way back is the same gesture', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('level', fig('L1', 'Level 1'));
    toggleFacet('level', fig('L1', 'Level 1'));
    expect(activeFacets().map((f) => f.axis)).toEqual(['category']);
    expect([...resolveFacets().ids].sort()).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('removeFacet drops one axis; clearFacets drops all and dispatches a clear', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('level', fig('L1', 'Level 1'));
    removeFacet('category');
    expect(activeFacets().map((f) => f.axis)).toEqual(['level']);

    stub.bus.dispatch.mockClear();
    clearFacets();
    expect(activeFacets()).toHaveLength(0);
    expect(stub.bus.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'clear', source: 'analytics' }),
    );
  });

  it('clearFacets dispatches a clear EVEN WITH NO FACETS — the purple may be from a 3-D click', () => {
    stub.bus.dispatch.mockClear();
    clearFacets();
    expect(stub.bus.dispatch).toHaveBeenCalledTimes(1);
  });

  // ── The dispatch reaches the bus, which is what paints ──────────────────────

  it('the INTERSECTION is what reaches selectionBus — not either operand', () => {
    toggleFacet('category', fig('walls', 'Walls', ['w1', 'w2', 'w3', 'w4']));
    stub.bus.dispatch.mockClear();
    toggleFacet('level', fig('L1', 'Level 1', ['w1', 'w2', 'd1']));

    expect(stub.bus.dispatch).toHaveBeenCalledTimes(1);
    const ev = stub.bus.dispatch.mock.calls[0]![0] as { type: string; elementIds: string[] };
    expect(ev.type).toBe('select');
    expect([...ev.elementIds].sort()).toEqual(['w1', 'w2']);
  });

  it('an EMPTY intersection dispatches a clear, not a select of nothing', () => {
    toggleFacet('category', fig('doors', 'Doors'));
    stub.bus.dispatch.mockClear();
    toggleFacet('type', fig('walls:ext', 'Walls · ext'));
    expect((stub.bus.dispatch.mock.calls[0]![0] as { type: string }).type).toBe('clear');
  });
});

describe('L-6602 — a facet holds the QUESTION, so it cannot decay', () => {
  it('⭐ a wall drawn AFTER the facet was picked is included — a pinned id set would miss it', () => {
    stubStores([{ id: 'w1', levelId: 'L1' }], []);
    toggleFacet('category', fig('walls', 'Walls', ['w1']));
    expect([...resolveFacets().ids]).toEqual(['w1']);

    // The reader draws two more walls; the surface refreshes.
    stubStores(
      [{ id: 'w1', levelId: 'L1' }, { id: 'w2', levelId: 'L1' }, { id: 'w3', levelId: 'L2' }],
      [],
    );

    // ⭐ THE POINT OF THE WHOLE DESIGN. The facet re-asks the question, so the
    // answer is the model as it is NOW. A stored id set would still say ['w1']
    // and the reader would see one purple wall out of three with nothing on
    // screen saying why.
    expect([...resolveFacets().ids].sort()).toEqual(['w1', 'w2', 'w3']);
  });

  it('an EMPTIED but readable store resolves LIVE-EMPTY — that is a real answer', () => {
    toggleFacet('category', fig('walls', 'Walls', ['w1']));
    stubStores([], DOORS); // every wall deleted; the store is still published

    const r = resolveFacets();
    // ⛔ NOT a snapshot. "The store was read and there are no walls" is a live,
    // true answer, and rendering it as a stale snapshot would understate what
    // the model knows.
    expect(r.resolved[0]!.fresh).toBe(true);
    expect(r.ids).toHaveLength(0);
  });

  it('an UNREACHABLE store falls back to the snapshot and is flagged NOT fresh', () => {
    toggleFacet('category', fig('walls', 'Walls', ['w1', 'w2']));
    stubStores(null, DOORS); // the store is not on window at all

    const r = resolveFacets();
    // ⛔ `idsForFacet` returns null (unresolvable), NOT an empty set — so this
    // falls back to the captured ids AND SAYS SO. Collapsing the two would make
    // "the wall store was not published" read as "there are no walls", which is
    // the [[context-data-honesty-family]] defect at its smallest scale.
    expect(r.resolved[0]!.fresh).toBe(false);
    expect(describeResolution(r)).toContain('snapshot');
  });

  it('the relationship axis is REFUSED by the read model and rendered as a snapshot', () => {
    toggleFacet('relationship', fig('bounds', 'bounds', ['n1', 'n2']));
    const r = resolveFacets();
    // A relationship figure counts EDGES, and its ids include synthetic nodes
    // that name no element in any store — so it is honestly a snapshot.
    expect(r.resolved[0]!.fresh).toBe(false);
    expect([...r.resolved[0]!.ids].sort()).toEqual(['n1', 'n2']);
  });
});

describe('L-6603 — the filter is legible, or it is a bug generator', () => {
  it('the sentence names EVERY OPERAND with its own count, not just the result', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    toggleFacet('level', fig('L1', 'Level 1'));
    const text = describeResolution(resolveFacets());
    // ⭐ "Walls (4) ∩ Level 1 (3) -> 2 element(s)…" — an intersection the reader
    // cannot decompose is one they cannot check.
    expect(text).toContain('Walls (4)');
    expect(text).toContain('Level 1 (3)');
    expect(text).toContain('∩');
    expect(text).toContain('2 element(s)');
  });

  it('an empty intersection reads as an ANSWER about the model, never as a failure', () => {
    toggleFacet('category', fig('doors', 'Doors'));
    toggleFacet('type', fig('walls:ext', 'Walls · ext'));
    const text = describeResolution(resolveFacets());
    expect(text).toContain('nothing satisfies all of these');
    expect(text).toContain('not a failed query');
    // Both operands still stated, so the reader can see WHY it is empty.
    expect(text).toContain('Doors (2)');
    expect(text).toContain('Walls · ext (3)');
  });

  it('no facets means an empty sentence, so the bar hides rather than render a null state', () => {
    expect(describeResolution(resolveFacets())).toBe('');
    expect(activeFacets()).toHaveLength(0);
  });

  it('isFacetActive answers per-axis, so chart emphasis and the model cannot disagree', () => {
    toggleFacet('category', fig('walls', 'Walls'));
    expect(isFacetActive('category', 'walls')).toBe(true);
    expect(isFacetActive('category', 'doors')).toBe(false);
    expect(isFacetActive('level', 'walls')).toBe(false);
  });
});

describe('L-6604 — `unassigned` is a real, filterable group, not a dropped one', () => {
  it('filtering to "No level assigned" selects the elements with no storey', () => {
    // SPEC §4.1 W3 makes `unassigned` a NAMED bar rather than a dropped one; a
    // reader can click that bar, so the resolver must answer it.
    toggleFacet('level', fig('unassigned', 'No level assigned'));
    expect([...resolveFacets().ids]).toEqual(['w4']);
  });

  it('a storey the level authority does not know is UNRESOLVABLE, not empty', () => {
    toggleFacet('level', fig('L-ghost', 'A deleted storey', ['w9']));
    expect(resolveFacets().resolved[0]!.fresh).toBe(false);
  });

  it('`untyped` is filterable, and it never merges two families that share a type id', () => {
    // Doors in the fixture carry no `doorType`, so they are untyped BY FACT.
    toggleFacet('type', fig('untyped', 'Untyped'));
    expect([...resolveFacets().ids].sort()).toEqual(['d1', 'd2']);
  });
});
