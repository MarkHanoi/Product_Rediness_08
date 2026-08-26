/**
 * §DEMO141 (L-12301) — the founder's pitch-demo ask, verbatim: *"Exclude those
 * yellow labels — I am doing a pitch demo, I don't want this info."* Two green
 * arrows pointed at the SAME "34 node(s) carry no level…" clause printed twice
 * (the tab status line, and the relationship graph's own honesty pin).
 *
 * This file proves THREE separable claims:
 *
 *  1. DE-DUPLICATION (applies in every mode — a straight improvement, not a
 *     presentation-mode feature). The clause now appears exactly ONCE.
 *  2. PRESENTATION MODE OFF (default) is byte-identical to today: every
 *     existing caveat/provenance element survives, pinned.
 *  3. PRESENTATION MODE ON hides the diagnostic/provenance chrome, keeps the
 *     DATA (counts, legends, the graph, the functional storey/relationship
 *     controls, the cross-filter facet bar), and — the arm that stops this
 *     from becoming a lie — a lower-bound figure still carries a compact "≥"
 *     marker rather than disappearing along with its explanation.
 *
 * ⚠ Mirrors the harness `analysisScrollPane.spec.ts` / `relationshipGraphLegibility
 * .spec.ts` already use: a real `AnalysisSurface`, a queued-then-flushed runtime
 * event bus, a UBG stub in the shape `graphReadModel.projectGraph()` reads.
 * happy-dom performs no layout and paints nothing — the arms below are DOM-
 * structure and DOM-text arms, not pixel arms.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { GRAPH_VIEW_EVENT, setGraphExpanded, resetGraphViewState } from '../graphViewState';
import { setGraphLevelFilter } from '../graphReadModel';
import { _clearFoldsForTest, presentationMode, setPresentationMode } from '../analysisLayout';
import { toggleFacet } from '../selectionFacets';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * A UBG stub carrying ONE unplaceable node — `orphan_1` is in the graph but in
 * NONE of the declared stores, so `censusPlacement().levelOf('orphan_1')` is
 * `undefined` (§ANALYSIS-GRAPH-LEVEL-FILTER — "the census does not claim this
 * id", never "on another storey"). Filtered to a single named level, that is
 * exactly what makes `scope.excludedUnplaceable` non-zero and produces the
 * founder's literal clause: "N node(s) carry no level the element census can
 * resolve, so the level filter had to drop them — some may belong to this
 * storey." `freshness: 'maintained'` and a node count far under the 320 cap
 * keep the OTHER two `!complete` causes (staleness, truncation) switched off,
 * so this fixture is incomplete for exactly one, named reason.
 */
function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'wall' },
    { id: 'room_1', kind: 'room' },
    { id: 'door_1', kind: 'door' },
    { id: 'orphan_1', kind: 'wall' },
  ];
  const edges = [
    { from: 'wall_a', to: 'room_1', type: 'bounds' },
    { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
  ];
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'maintained',
    deltasApplied: 0,
    eventsObserved: 0,
    lastDelta: null,
  };
}

function installRuntimeBus(): { emit: (e: string, p: unknown) => void } {
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const events = {
    on(event: string, handler: (p: unknown) => void): () => void {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => { /* not exercised here */ };
    },
    emit(event: string, payload: unknown): void {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
  };
  window.runtime = { events } as never;
  return { emit: (e, p) => events.emit(e, p) };
}

let bus: { emit: (e: string, p: unknown) => void };

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

/** The Relationships tab, clicked through the real tab strip. */
async function openRelationships(): Promise<void> {
  const el = document.getElementById('anl-surface')!;
  const tab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
  expect(tab, 'the Relationships tab is missing from the tab strip').not.toBeNull();
  tab!.click();
  await settle();
}

function surface(): HTMLElement {
  return document.getElementById('anl-surface')!;
}

function graphCard(): HTMLElement {
  const c = surface().querySelector<HTMLElement>('[data-widget="relationship-graph"]');
  expect(c, 'the relationship-graph card is not on the Relationships tab').not.toBeNull();
  return c!;
}

function presentButton(): HTMLButtonElement {
  const b = surface().querySelector<HTMLButtonElement>('#anl-present');
  expect(b, 'the presentation-mode toggle is missing from the header').not.toBeNull();
  return b!;
}

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  setGraphLevelFilter('L0'); // the founder's screenshot: a NAMED storey, not "All storeys"
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

beforeEach(async () => {
  _clearFoldsForTest();
  setPresentationMode(false);
  setGraphExpanded(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await openRelationships();
});

afterAll(() => {
  setGraphLevelFilter(null);
  setPresentationMode(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§DEMO141 (1) — the duplicated clause is now printed ONCE', () => {
  const CLAUSE = 'carry no level the element census can resolve';

  it('⛔ the clause appears EXACTLY ONCE in the rendered surface', () => {
    const text = surface().textContent ?? '';
    const count = text.split(CLAUSE).length - 1;
    expect(count, `expected the clause once; found ${count} — a future edit reintroduced the duplicate`).toBe(1);
  });

  it('the survivor is the CARD — the honesty pin — not the tab status line', () => {
    const pin = graphCard().querySelector('.anl-honesty-pin');
    expect(pin, 'the honesty pin is missing').not.toBeNull();
    expect(pin!.textContent ?? '').toContain(CLAUSE);

    const status = surface().querySelector('.anl-status');
    expect(status, '.anl-status is missing').not.toBeNull();
    expect(status!.textContent ?? '').not.toContain(CLAUSE);
    // The tab line still says something — it points at the card rather than
    // silently going blank.
    expect(status!.textContent ?? '').toMatch(/LOWER BOUNDS/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§DEMO141 (2) — presentation mode OFF (default) is byte-identical to today', () => {
  it('the toggle ships OFF and says so', () => {
    expect(presentationMode()).toBe(false);
    expect(presentButton().getAttribute('aria-pressed')).toBe('false');
    expect(presentButton().classList.contains('anl-header-btn--on')).toBe(false);
  });

  it('every existing caveat/provenance element is still present, pinned', () => {
    const card = graphCard();
    // The card-head INCOMPLETE badge — the warn plate, not the quiet marker.
    const badge = card.querySelector('.anl-card-head .anl-badge--warn');
    expect(badge, 'the INCOMPLETE badge is missing').not.toBeNull();
    expect(badge!.textContent).toBe('INCOMPLETE');
    // The always-visible honesty pin.
    expect(card.querySelector('.anl-honesty-pin'), 'the honesty pin is missing').not.toBeNull();
    // The completeness fold (collapsed label, still on screen).
    expect(card.querySelector('[data-fold="w.completeness"]'), 'the completeness fold is missing').not.toBeNull();
    // The graph's own note-block fold row.
    expect(card.querySelector('[data-fold="graph.liveness"]'), 'the liveness fold is missing').not.toBeNull();
    // The generic provenance foot ("source: … cost … CLAIMED").
    const feet = [...card.querySelectorAll('.anl-card-foot')].map((n) => n.textContent ?? '');
    expect(feet.some((f) => f.includes('CLAIMED, not benched'))).toBe(true);
    // The tab status line's diagnostic sentence and its L-3007 note.
    expect(surface().querySelector('.anl-status')!.textContent ?? '').toMatch(/Rendered in \d+ ms/);
    const note = surface().querySelector('.anl-status-note');
    expect(note, 'the "Arrangement saved" note is missing').not.toBeNull();
    expect(note!.textContent).toContain('Arrangement saved in this browser (L-3007)');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//
// ⚠ EACH TEST BELOW IS SELF-CONTAINED. The file-level `beforeEach` resets
// presentation mode to OFF before every `it` (the same reset discipline
// `relationshipGraphLegibility.spec.ts` applies to folds) — so a test that
// needs it ON turns it on itself via the real button, rather than depending on
// a previous test's click surviving into this one.
describe('§DEMO141 (3) — presentation mode ON hides chrome, keeps data, keeps the marker', () => {
  it('clicking the toggle turns it on, repaints the button, and re-renders', async () => {
    presentButton().click();
    await settle();
    expect(presentationMode()).toBe(true);
    expect(presentButton().getAttribute('aria-pressed')).toBe('true');
    expect(presentButton().classList.contains('anl-header-btn--on')).toBe(true);
  });

  it('the diagnostic / provenance chrome is GONE', async () => {
    presentButton().click();
    await settle();
    const card = graphCard();
    expect(card.querySelector('.anl-honesty-pin'), 'the honesty pin survived presentation mode').toBeNull();
    expect(card.querySelector('[data-fold="w.completeness"]'), 'the completeness fold survived').toBeNull();
    expect(card.querySelector('[data-fold="graph.liveness"]'), 'the liveness fold survived').toBeNull();
    expect(card.querySelector('[data-fold="graph.scope"]'), 'the scope fold survived').toBeNull();

    const feet = [...card.querySelectorAll('.anl-card-foot')].map((n) => n.textContent ?? '');
    expect(feet.some((f) => f.includes('CLAIMED, not benched')), 'the provenance foot survived').toBe(false);

    const status = surface().querySelector('.anl-status')!;
    expect(status.textContent ?? '').not.toMatch(/Rendered in \d+ ms/);
    expect(surface().querySelector('.anl-status-note'), 'the "Arrangement saved" note survived').toBeNull();

    const badge = card.querySelector('.anl-card-head .anl-badge--warn');
    expect(badge, 'the yellow INCOMPLETE badge survived presentation mode').toBeNull();
  });

  it('⭐ the lower-bound marker SURVIVES — the arm that stops this becoming a lie', async () => {
    presentButton().click();
    await settle();
    const card = graphCard();
    // The compact, quiet card-head marker replaces the yellow text badge.
    const marker = card.querySelector('.anl-card-head .anl-badge--muted');
    expect(marker, 'no compact lower-bound marker on the card head').not.toBeNull();
    expect(marker!.textContent).toBe('≥');
    expect(marker!.className).not.toContain('anl-badge--warn');
    // The graph's own bottom footer still carries the qualified count —
    // §DEMO141's `!g.complete` fix is what makes this reliable rather than
    // accidental (it used to key off `g.truncated` alone).
    const feet = [...card.querySelectorAll('.anl-card-foot')].map((n) => n.textContent ?? '');
    expect(feet.some((f) => /≥\s*\d+\s*drawn relationship\(s\) of \d+ projected/.test(f)),
      'no foot carries a "≥ N drawn … of M projected" marker').toBe(true);
  });

  it('the DATA stays: counts, legends, category tree, and the FUNCTIONAL controls', async () => {
    presentButton().click();
    await settle();
    const card = graphCard();
    expect(card.querySelectorAll('.anl-nodelink-legend').length, 'the legends disappeared').toBeGreaterThan(0);
    expect(card.querySelector('.anl-cat-tree'), 'the category tree disappeared').not.toBeNull();
    // The storey scope + relationship-view selector are CONTROLS, not chrome —
    // the founder was explicit that these must never be swept away with the
    // caveats. Both render as `.anl-scope-bar` (so does the toolbar — three
    // total is the expected shape here).
    const scopeBars = card.querySelectorAll('.anl-scope-bar');
    expect(scopeBars.length, 'the storey / view / draw control bars disappeared').toBeGreaterThanOrEqual(3);
    expect(card.textContent ?? '').toContain('Storey');
    expect(card.textContent ?? '').toContain('Relationships');
  });

  it('turns back off and every hidden element returns', async () => {
    presentButton().click(); // OFF -> ON (the file-level beforeEach ships it OFF)
    await settle();
    expect(presentationMode()).toBe(true);
    presentButton().click(); // ON -> OFF
    await settle();
    expect(presentationMode()).toBe(false);
    const card = graphCard();
    expect(card.querySelector('.anl-honesty-pin')).not.toBeNull();
    expect(card.querySelector('.anl-card-head .anl-badge--warn')).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§DEMO141 — the toggle PERSISTS across a remount (reuses the L-3007 record)', () => {
  it('surviving a full hide/show cycle — the same mechanism a project switch uses', async () => {
    setPresentationMode(true);
    presentButton(); // sanity: still mounted
    // A hide/show cycle is this codebase's stand-in for "reopen the dashboard":
    // `_show()` reloads `this._layout` from storage exactly as a project switch
    // would, and (per this lane) repaints the presentation toggle the same way.
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await settle();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();
    await openRelationships();

    expect(presentationMode(), 'presentation mode reset on remount — it is not persisted').toBe(true);
    expect(presentButton().getAttribute('aria-pressed')).toBe('true');
    expect(graphCard().querySelector('.anl-honesty-pin'), 'chrome came back after a remount that should have kept it hidden').toBeNull();

    setPresentationMode(false);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await settle();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();
    await openRelationships();
    expect(presentButton().getAttribute('aria-pressed')).toBe('false');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§DEMO141 / §GRAPH-EXPAND-CONTROLS-SURVIVE — controls that must NEVER be swept up', () => {
  it('expanding the graph does NOT black out the storey / relationship-view controls', async () => {
    graphCard().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
    await settle();
    const stage = graphCard().querySelector('.anl-graph-stage--expanded');
    expect(stage, 'the stage did not expand').not.toBeNull();
    // §GRAPH-EXPAND-CONTROLS-SURVIVE (L-12301) — these two used to be siblings
    // of the stage and were covered by its opaque, absolutely-positioned box
    // the moment it expanded. They are now the stage's OWN children.
    const scopeBarsInStage = stage!.querySelectorAll('.anl-scope-bar');
    expect(scopeBarsInStage.length, 'no scope bars inside the expanded stage').toBeGreaterThanOrEqual(3);
    expect(stage!.textContent ?? '').toContain('Storey');
    expect(stage!.textContent ?? '').toContain('Relationships');
    setGraphExpanded(false);
    await settle();
  });

  it('the FACET cross-filter bar (.anl-facets) is untouched by expand — it was never under the covered area', async () => {
    toggleFacet('category', {
      key: 'wall', label: 'Wall', value: 1, unit: 'ud', basis: 'test fixture',
      elementIds: ['wall_a'], qualifiers: [],
    });
    await settle();
    const facets = surface().querySelector<HTMLElement>('.anl-facets');
    expect(facets, '.anl-facets is missing').not.toBeNull();
    expect(facets!.hidden, 'the facet bar is hidden with an active facet').toBe(false);

    graphCard().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
    await settle();
    // ⛔ `.anl-facets` is a sibling of `.anl-grid-viewport`, one level above the
    // grid the expanded stage covers — it was never inside the covered region,
    // and this proves it structurally rather than by argument.
    expect(surface().querySelector('.anl-grid-viewport')!.contains(facets!), '.anl-facets moved inside the covered wrapper').toBe(false);
    expect(facets!.hidden, 'expanding the graph hid the facet bar').toBe(false);

    setGraphExpanded(false);
    toggleFacet('category', {
      key: 'wall', label: 'Wall', value: 1, unit: 'ud', basis: 'test fixture',
      elementIds: ['wall_a'], qualifiers: [],
    }); // toggling the same key again clears it
    await settle();
  });

  it('the facet bar ALSO survives in presentation mode — he is demoing WITH the filters', async () => {
    toggleFacet('category', {
      key: 'wall', label: 'Wall', value: 1, unit: 'ud', basis: 'test fixture',
      elementIds: ['wall_a'], qualifiers: [],
    });
    setPresentationMode(true);
    // Force the CARD to actually re-render under presentation-mode-ON, rather
    // than asserting on a picture taken before the flag could affect anything.
    window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
    await settle();

    const badge = graphCard().querySelector('.anl-card-head .anl-badge--warn');
    expect(badge, 'the card did not actually re-render under presentation mode').toBeNull();

    const facets = surface().querySelector<HTMLElement>('.anl-facets');
    expect(facets, '.anl-facets is missing in presentation mode').not.toBeNull();
    expect(facets!.hidden, 'presentation mode hid the functional facet bar').toBe(false);
    // The storey / view controls also survive presentation mode — they are
    // instruments, not caveats.
    const scopeBars = graphCard().querySelectorAll('.anl-scope-bar');
    expect(scopeBars.length).toBeGreaterThanOrEqual(3);

    setPresentationMode(false);
    toggleFacet('category', {
      key: 'wall', label: 'Wall', value: 1, unit: 'ud', basis: 'test fixture',
      elementIds: ['wall_a'], qualifiers: [],
    });
    await settle();
  });
});
