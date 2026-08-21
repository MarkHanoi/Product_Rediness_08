/**
 * §ANALYSIS-TABS (L-3304) + §ANALYSIS-INCOMPLETE-REASON (L-3303).
 *
 * The founder's report was "the content of the analysis is too much for a tab".
 * These tests pin the two things that could go wrong while fixing that:
 *
 *  1. a v1 arrangement must SURVIVE the move to tabs — nothing dropped, ever;
 *  2. splitting the dashboard must not let a figure escape the card that
 *     qualifies it, and must not let the status strip claim a scope it did not
 *     compute.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ANALYSIS_TABS, type AnalysisTabId } from '../AnalysisTypes';
import { loadLayout, migrateV1, saveLayout, unknownWidgetIds } from '../analysisLayout';
import { DEFAULT_TAB_LAYOUT, WIDGET_CATALOGUE, widgetById } from '../widgetCatalogue';

describe('§ANALYSIS-TABS — every widget has a home, and none is lost', () => {
  it('every catalogue widget declares a tab this build knows', () => {
    for (const w of WIDGET_CATALOGUE) {
      expect(ANALYSIS_TABS.some((t) => t.id === w.tab), `${w.id} declares tab "${w.tab}"`).toBe(true);
    }
  });

  it('⛔ no widget is placed on two tabs at once', () => {
    const seen = new Map<string, AnalysisTabId>();
    for (const t of ANALYSIS_TABS) {
      for (const id of DEFAULT_TAB_LAYOUT[t.id]) {
        expect(seen.has(id), `${id} is on both ${seen.get(id)} and ${t.id}`).toBe(false);
        seen.set(id, t.id);
      }
    }
  });

  it('⭐ the coverage card ships on the SAME tab as the figures it bounds', () => {
    // Its own subtitle says every quantity figure is read against it. A coverage
    // card one click away from the numbers it qualifies has stopped working, and
    // that is the specific hazard tabbing introduces.
    expect(DEFAULT_TAB_LAYOUT.quantities).toContain('takeoff-coverage');
    for (const id of DEFAULT_TAB_LAYOUT.quantities) {
      const d = widgetById(id)!;
      if (d.query?.source === 'takeoff') {
        expect(DEFAULT_TAB_LAYOUT.quantities).toContain('takeoff-coverage');
      }
    }
    // Same rule for the relational pair.
    expect(DEFAULT_TAB_LAYOUT.relationships).toContain('relationship-coverage');
  });

  it('⛔ the Areas tab is entirely NOT BUILT — so the tab strip can say so', () => {
    const built = DEFAULT_TAB_LAYOUT.areas.filter((id) => widgetById(id)?.notBuilt == null);
    expect(built, 'a built widget on the all-refusals tab would make the NOT BUILT chip a lie').toEqual([]);
  });
});

describe('§ANALYSIS-TABS — the v1 → v2 migration drops nothing', () => {
  beforeEach(() => localStorage.clear());

  it('places each known widget on its catalogue tab', () => {
    const v2 = migrateV1({ version: 1, widgets: ['material-area', 'level-bar', 'relationship-graph'] });
    expect(v2.tabs.quantities).toEqual(['material-area']);
    expect(v2.tabs.overview).toEqual(['level-bar']);
    expect(v2.tabs.relationships).toEqual(['relationship-graph']);
  });

  it('⛔ keeps an id this build has NO widget for — a dropped widget is a lost decision', () => {
    const v2 = migrateV1({ version: 1, widgets: ['level-bar', 'some-widget-from-a-newer-build'] });
    const all = ANALYSIS_TABS.flatMap((t) => v2.tabs[t.id]);
    expect(all).toContain('some-widget-from-a-newer-build');
    expect(unknownWidgetIds(v2)).toEqual(['some-widget-from-a-newer-build']);
  });

  it('an EMPTY v1 arrangement stays empty — the user removed every widget', () => {
    const v2 = migrateV1({ version: 1, widgets: [] });
    expect(ANALYSIS_TABS.flatMap((t) => v2.tabs[t.id])).toEqual([]);
  });

  it('loadLayout migrates a v1 record found in storage', () => {
    localStorage.setItem('pryzm.analysis.layout.unscoped', JSON.stringify({ version: 1, widgets: ['level-bar'] }));
    const l = loadLayout(null);
    expect(l.version).toBe(2);
    expect(l.tabs.overview).toEqual(['level-bar']);
    expect(l.activeTab).toBe('overview');
  });
});

describe('§ANALYSIS-TABS — an emptied tab is an arrangement, not a fault', () => {
  beforeEach(() => localStorage.clear());

  it('⛔ a stored EMPTY tab does not silently refill with the default', () => {
    const l = loadLayout(null);
    saveLayout({ ...l, tabs: { ...l.tabs, quantities: [] } }, null);
    expect(loadLayout(null).tabs.quantities).toEqual([]);
  });

  it('a tab MISSING from storage takes the default — that is the different answer', () => {
    // This is what happens when a build adds a tab: absent means "never stored",
    // which is not the same fact as "emptied", and must not read the same.
    localStorage.setItem(
      'pryzm.analysis.layout.unscoped',
      JSON.stringify({ version: 2, tabs: { overview: ['level-bar'] }, activeTab: 'overview' }),
    );
    expect(loadLayout(null).tabs.quantities).toEqual([...DEFAULT_TAB_LAYOUT.quantities]);
  });

  it('an activeTab this build does not know falls back to overview', () => {
    localStorage.setItem(
      'pryzm.analysis.layout.unscoped',
      JSON.stringify({ version: 2, tabs: {}, activeTab: 'a-tab-from-the-future' }),
    );
    expect(loadLayout(null).activeTab).toBe('overview');
  });
});
