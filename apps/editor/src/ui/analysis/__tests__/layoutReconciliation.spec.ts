/**
 * §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9000 … L-9004)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S EXACT SITUATION, AS A TEST
 * ═════════════════════════════════════════════════════════════════════════════
 * He opened Analysis → Relationships on the live deploy and could not find the
 * graph. His tab header read "Relationships 1" and rendered only
 * `relationship-coverage`. Nothing was broken: he had ARRANGED that tab before
 * the graph shipped, so his stored list was
 * `relationships: ['relationship-coverage']`, and a stored array won outright.
 *
 * The first arm below reproduces that stored value LITERALLY. If the fix ever
 * regresses, that arm goes red — not a proxy for it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ THE RULE THAT IS NOT UP FOR NEGOTIATION
 * ═════════════════════════════════════════════════════════════════════════════
 * A widget the user DELIBERATELY REMOVED must stay removed. Several arms exist
 * only to pin that, because the tempting fix — "union the defaults back in" —
 * would delete real user intent to solve a staleness problem, and it would pass
 * any test that only checked the founder's symptom.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  adoptCatalogueAsKnown,
  loadLayout,
  reconcileLayout,
  saveLayout,
  type AnalysisLayout,
} from '../analysisLayout';
import { DEFAULT_TAB_LAYOUT, WIDGET_CATALOGUE } from '../widgetCatalogue';
import { ANALYSIS_TABS } from '../AnalysisTypes';

const PROJ = 'test-project';
const KEY = `pryzm.analysis.layout.${PROJ}`;

const CATALOGUE = WIDGET_CATALOGUE.map((w) => w.id);

/** A layout with only the named tabs overridden; the rest take their defaults. */
function layoutOf(
  partial: Partial<Record<string, readonly string[]>>,
  known?: readonly string[],
): AnalysisLayout {
  // §PARCEL-LAW-TAB (L-12915) — DERIVED from ANALYSIS_TABS. This used to hand-list
  // the four tabs behind an `as` cast, so the first added tab left every layout
  // built here missing a key that the type said was present — the census-that-rots
  // shape, inside the spec that guards arrangement survival.
  const tabs = {
    ...Object.fromEntries(ANALYSIS_TABS.map((t) => [t.id, [...DEFAULT_TAB_LAYOUT[t.id]]])),
    ...partial,
  } as AnalysisLayout['tabs'];
  return known === undefined
    ? { version: 2, tabs, activeTab: 'relationships' }
    : { version: 2, tabs, activeTab: 'relationships', knownWidgets: known };
}

/** The literal value that was in the founder's browser. */
const FOUNDERS_STORED = JSON.stringify({
  version: 2,
  tabs: { relationships: ['relationship-coverage'] },
  activeTab: 'relationships',
});

beforeEach(() => {
  localStorage.clear();
});

describe('L-9000 — the founder’s stored arrangement, reproduced literally', () => {
  it('⭐ his tab held ONLY relationship-coverage, and the graph is now OFFERED', () => {
    localStorage.setItem(KEY, FOUNDERS_STORED);
    const loaded = loadLayout(PROJ);
    const r = reconcileLayout(loaded);

    expect(r.legacy, 'an arrangement with no knownWidgets is LEGACY').toBe(true);
    expect(r.unreconciled).toContain('relationship-graph');
    // ⛔ …and it is NOT silently placed: in the legacy case "removed" and "did
    // not exist" are indistinguishable, so the surface asks rather than guesses.
    expect(loaded.tabs.relationships).toEqual(['relationship-coverage']);
  });

  it('⛔ one click adds it, and it STAYS across a reload', () => {
    localStorage.setItem(KEY, FOUNDERS_STORED);
    const loaded = loadLayout(PROJ);
    saveLayout(
      { ...loaded, tabs: { ...loaded.tabs, relationships: [...loaded.tabs.relationships, 'relationship-graph'] } },
      PROJ,
    );
    expect(loadLayout(PROJ).tabs.relationships).toContain('relationship-graph');
  });
});

describe('L-9001 — RULE B: a deliberately removed widget stays removed', () => {
  it('⛔ a widget in knownWidgets but absent from tabs is NEVER put back', () => {
    // The user HAD the graph (it is in knownWidgets) and removed it.
    const stored = layoutOf({ relationships: ['relationship-coverage'] }, CATALOGUE);
    const r = reconcileLayout(stored);
    expect(r.legacy).toBe(false);
    expect(r.autoPlaced).toEqual([]);
    expect(r.unreconciled).toEqual([]);
    expect(r.layout.tabs.relationships).toEqual(['relationship-coverage']);
  });

  it('⛔ a tab the user EMPTIED stays empty', () => {
    const stored = layoutOf({ relationships: [] }, CATALOGUE);
    expect(reconcileLayout(stored).layout.tabs.relationships).toEqual([]);
  });

  it('⛔ the removal survives a round trip through storage', () => {
    saveLayout(layoutOf({ relationships: ['relationship-coverage'] }, CATALOGUE), PROJ);
    expect(loadLayout(PROJ).tabs.relationships).toEqual(['relationship-coverage']);
  });
});

describe('L-9002 — a widget that POST-DATES the arrangement is placed, safely', () => {
  /** knownWidgets deliberately omits the graph: written by a build without it. */
  const knownWithoutGraph = (): string[] => CATALOGUE.filter((id) => id !== 'relationship-graph');

  it('⭐ absent from knownWidgets AND from tabs ⇒ auto-placed on its OWN tab', () => {
    const r = reconcileLayout(layoutOf({ relationships: ['relationship-coverage'] }, knownWithoutGraph()));

    expect(r.legacy).toBe(false);
    expect(r.autoPlaced).toEqual(['relationship-graph']);
    expect(r.layout.tabs.relationships).toContain('relationship-graph');
    // Appended, so nothing the user ordered moved.
    expect(r.layout.tabs.relationships[0]).toBe('relationship-coverage');
    // …and it lands on ITS catalogue tab, never on whichever tab is active.
    expect(r.layout.tabs.overview).not.toContain('relationship-graph');
  });

  it('⛔ the placement is the ONLY difference — no other tab is touched', () => {
    const r = reconcileLayout(layoutOf({ overview: ['element-count'], relationships: [] }, knownWithoutGraph()));
    expect(r.layout.tabs.overview).toEqual(['element-count']);
    expect(r.layout.tabs.relationships).toEqual(['relationship-graph']);
  });

  it('is IDEMPOTENT — running it on its own output places nothing further', () => {
    const once = reconcileLayout(layoutOf({ relationships: ['relationship-coverage'] }, knownWithoutGraph()));
    const twice = reconcileLayout(once.layout);
    expect(twice.autoPlaced).toEqual([]);
    expect(twice.layout.tabs.relationships).toEqual(once.layout.tabs.relationships);
  });
});

describe('L-9003 — `undefined` is a THIRD answer, never the empty set', () => {
  it('⛔ `knownWidgets: []` means "the catalogue held nothing", NOT "legacy"', () => {
    // Differentiating: a reader that collapsed [] and undefined would report
    // legacy here and ASK about every widget instead of placing them.
    const r = reconcileLayout(layoutOf({ relationships: ['relationship-coverage'] }, []));
    expect(r.legacy).toBe(false);
    expect(r.autoPlaced).toContain('relationship-graph');
  });

  it('⛔ a non-array `knownWidgets` in storage reads as LEGACY, not as empty', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 2,
        tabs: { relationships: ['relationship-coverage'] },
        activeTab: 'relationships',
        knownWidgets: 'nonsense',
      }),
    );
    expect(reconcileLayout(loadLayout(PROJ)).legacy).toBe(true);
  });
});

describe('L-9004 — legacy is adopted ONLY by an explicit answer', () => {
  it('⛔ an unrelated save does NOT silently adopt the catalogue', () => {
    // ⚠ The first draft of `saveLayout` stamped unconditionally, so reordering a
    // card on another tab would have swallowed the outstanding question without
    // the user ever seeing it. This is the arm that catches that.
    localStorage.setItem(KEY, FOUNDERS_STORED);
    const loaded = loadLayout(PROJ);
    saveLayout({ ...loaded, activeTab: 'overview' }, PROJ);
    expect(
      reconcileLayout(loadLayout(PROJ)).legacy,
      'legacy was silently adopted by an unrelated save',
    ).toBe(true);
  });

  it('⭐ "I removed these on purpose" records the answer and changes NOTHING else', () => {
    const loaded = layoutOf({ relationships: ['relationship-coverage'] });
    const adopted = adoptCatalogueAsKnown(loaded);
    expect(adopted.tabs).toEqual(loaded.tabs);
    expect(adopted.activeTab).toBe(loaded.activeTab);

    saveLayout(adopted, PROJ);
    const back = reconcileLayout(loadLayout(PROJ));
    expect(back.legacy).toBe(false);
    expect(back.unreconciled).toEqual([]);
    // …and the removal it recorded is now permanent.
    expect(back.layout.tabs.relationships).toEqual(['relationship-coverage']);
  });

  it('⭐ after adopting, a FUTURE widget places itself with no prompt at all', () => {
    // The prompt is a ONE-TIME migration artefact. That is the whole design.
    const adopted = adoptCatalogueAsKnown(layoutOf({ relationships: ['relationship-coverage'] }));
    const r = reconcileLayout({
      ...adopted,
      knownWidgets: (adopted.knownWidgets ?? []).filter((id) => id !== 'relationship-table'),
    });
    expect(r.legacy).toBe(false);
    expect(r.autoPlaced).toEqual(['relationship-table']);
  });

  it('a brand-new user is never asked anything', () => {
    const r = reconcileLayout(loadLayout('a-project-never-arranged'));
    expect(r.legacy).toBe(false);
    expect(r.unreconciled).toEqual([]);
    expect(r.layout.tabs.relationships).toContain('relationship-graph');
  });
});

describe('L-9005 — the SYSTEMIC guarantee, stated as a test over the whole catalogue', () => {
  it('⭐ EVERY built widget in the catalogue reaches a user who arranged before it', () => {
    // ⛔ This is the arm that makes the fix systemic rather than a special case
    // for `relationship-graph`. It asserts the property for every widget the
    // catalogue holds, including ones no lane has written yet: if a future lane
    // adds a widget and this rule breaks, this goes red without anybody
    // remembering to extend it.
    for (const w of WIDGET_CATALOGUE) {
      const known = CATALOGUE.filter((id) => id !== w.id);
      const stored = layoutOf({}, known);
      // Remove it from its own default tab too, so "already placed" cannot mask
      // the result.
      const tabs = { ...stored.tabs, [w.tab]: stored.tabs[w.tab].filter((id) => id !== w.id) };
      const r = reconcileLayout({ ...stored, tabs });
      expect(r.autoPlaced, `${w.id} is invisible to an existing user`).toContain(w.id);
      expect(r.layout.tabs[w.tab], `${w.id} landed on the wrong tab`).toContain(w.id);
    }
  });
});
