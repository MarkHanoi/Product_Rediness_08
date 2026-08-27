/**
 * §CLEAN150 (L-12480) — the founder's follow-up to §DEMO141, verbatim: *"I want
 * the panels as minimalist tech as possible - means the Analysis tab should
 * have mainly two colours - white should be predominant - exclude the yellow
 * tabs completely when the graph is big (extended) - leave all white - like a
 * white canvas with the graph and only the boolean buttons that need to be
 * clicked - level - focus hop - relationships - draw... etc.. i want it
 * clean."*
 *
 * ⚠ THIS IS NOT §DEMO141 AGAIN. Presentation mode (§DEMO141) is a separate,
 * persisted, manual toggle the reader must press deliberately. This suite
 * proves the DIFFERENT claim: expanding the relationship graph (⤢) — on its
 * own, with no second click — ALSO quiets the same three yellow artefacts
 * (the tab status line's diagnostic sentence, the graph's own honesty pin, and
 * the generic `w.completeness` fold), while NEVER deleting the lower-bound
 * claim: a quiet, collapsed, keyboard-reachable fold (`graph.bound`) survives
 * INSIDE the stage, because the stage covers the card head that presentation
 * mode alone relies on for its own "≥" marker.
 *
 * DECISION RECORDED HERE (the brief asked for one): expanding implies chrome
 * suppression ALWAYS, not only when presentation mode is ALSO on. The
 * founder's sentence names the trigger as "when the graph is big (extended)",
 * with no mention of Present — and architecturally there is no honest
 * alternative: the expanded stage covers the card head regardless of
 * `presentationMode()`, so if suppression waited for Present, an incomplete
 * graph expanded WITHOUT Present would show a stray "≥" marker on a hidden
 * card head — i.e. a claim with no visible carrier at all. Tying suppression
 * to `graphExpanded()` directly is what keeps the claim reachable in every
 * combination of the two flags.
 *
 * ⚠ Mirrors the harness `analysisPresentationMode.spec.ts` /
 * `relationshipGraphLegibility.spec.ts` already use. happy-dom performs no
 * layout and paints nothing — every arm below is a DOM-structure / DOM-text
 * arm, never a pixel arm. Whether `stageInternalReservePx()` actually recovers
 * PIXELS when this chrome goes quiet is a real-browser claim this suite
 * cannot measure; it is established here only by construction (the emitted
 * DOM shrinks — an `<p>` wrapping a multi-clause sentence replaced by one
 * collapsed fold-header row) and reported as such, not benched.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { GRAPH_VIEW_EVENT, setGraphExpanded, resetGraphViewState } from '../graphViewState';
import { setGraphLevelFilter } from '../graphReadModel';
import { _clearFoldsForTest, presentationMode, setPresentationMode } from '../analysisLayout';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * ONE unplaceable node (`orphan_1`), scoped to a named level — the same shape
 * `analysisPresentationMode.spec.ts` uses, so `!g.complete` for exactly one
 * NAMED reason (`scope.excludedUnplaceable`), never staleness or truncation.
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

function surface(): HTMLElement {
  return document.getElementById('anl-surface')!;
}

async function openTab(id: string): Promise<void> {
  const tab = surface().querySelector<HTMLButtonElement>(`.anl-tab[data-tab="${id}"]`);
  expect(tab, `the ${id} tab is missing from the tab strip`).not.toBeNull();
  tab!.click();
  await settle();
}

function graphCard(): HTMLElement {
  const c = surface().querySelector<HTMLElement>('[data-widget="relationship-graph"]');
  expect(c, 'the relationship-graph card is not on the Relationships tab').not.toBeNull();
  return c!;
}

async function expandGraph(): Promise<HTMLElement> {
  graphCard().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
  await settle();
  const stage = graphCard().querySelector<HTMLElement>('.anl-graph-stage--expanded');
  expect(stage, 'the stage did not take the expanded class').not.toBeNull();
  return stage!;
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
  setGraphLevelFilter('L0'); // one storey named ⇒ orphan_1 is excluded ⇒ !g.complete
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

beforeEach(async () => {
  _clearFoldsForTest();
  setPresentationMode(false);
  setGraphExpanded(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await openTab('relationships');
});

afterAll(() => {
  setGraphLevelFilter(null);
  setPresentationMode(false);
  setGraphExpanded(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (1) — expanding, alone, quiets the same chrome §DEMO141 hides', () => {
  it('BEFORE expanding: the yellow chrome is exactly where §DEMO141 left it', () => {
    const card = graphCard();
    expect(card.querySelector('.anl-honesty-pin'), 'the pin should be visible before expanding').not.toBeNull();
    expect(card.querySelector('[data-fold="w.completeness"]'), 'w.completeness should be visible before expanding').not.toBeNull();
    expect(card.querySelector('[data-fold="graph.liveness"]'), 'graph.liveness should be visible before expanding').not.toBeNull();
    expect(surface().querySelector('.anl-status')!.textContent ?? '').toMatch(/Rendered in \d+ ms/);
  });

  it('⭐ expanding ALONE (presentation mode stays OFF) hides the pin, the notes row, and w.completeness', async () => {
    expect(presentationMode(), 'this arm is precisely about NOT needing Present').toBe(false);
    const stage = await expandGraph();

    expect(stage.querySelector('.anl-honesty-pin'), 'the verbose pin survived expansion').toBeNull();
    expect(graphCard().querySelector('[data-fold="w.completeness"]'), 'w.completeness survived expansion').toBeNull();
    expect(graphCard().querySelector('[data-fold="graph.liveness"]'), 'the notes row survived expansion').toBeNull();
    expect(graphCard().querySelector('[data-fold="graph.scope"]'), 'the notes row survived expansion').toBeNull();
  });

  it('⭐ expanding ALONE also quiets the tab status line — banner (a) from the founder\'s screenshot', async () => {
    expect(presentationMode()).toBe(false);
    await expandGraph();
    const status = surface().querySelector('.anl-status')!;
    expect(status.textContent ?? '', 'the diagnostic sentence survived expansion').not.toMatch(/Rendered in \d+ ms/);
    expect(surface().querySelector('.anl-status-note'), 'the "Arrangement saved" note survived expansion').toBeNull();
    expect(status.classList.contains('anl-status--warn'), 'the tab strip kept its yellow class while expanded').toBe(false);
  });

  it('⛔ the LEDE (navigation, not a caveat) still reads — only the diagnostic clause goes', async () => {
    await expandGraph();
    const status = surface().querySelector('.anl-status')!;
    expect(status.textContent ?? '').toMatch(/How it is connected|connected/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (2) — the claim is DEMOTED, never deleted: `graph.bound`', () => {
  it('⭐⭐ a quiet, collapsed, non-yellow fold survives INSIDE the stage', async () => {
    const stage = await expandGraph();
    const notice = stage.querySelector<HTMLElement>('[data-fold="graph.bound"]');
    expect(notice, 'no quiet bound carrier inside the expanded stage').not.toBeNull();

    // ⛔ NEVER `tone: 'warn'` — that repaints the exact yellow the founder asked
    // excluded. `'scope'` is the accent-violet treatment already used on this
    // card for facts (storey/basis/focus), never a warning.
    expect(notice!.className).not.toContain('anl-fold--warn');

    const head = notice!.querySelector<HTMLButtonElement>('.anl-fold-head')!;
    expect(head.getAttribute('aria-expanded'), 'the bound notice shipped open').toBe('false');
    // Discoverable WHILE COLLAPSED — the claim is on the label, not hidden
    // behind the disclosure.
    expect(head.textContent ?? '').toMatch(/LOWER BOUND/);
  });

  it('⭐ keyboard/click-reachable: clicking (== Enter on a real button) reveals the operands', async () => {
    const stage = await expandGraph();
    const notice = stage.querySelector<HTMLElement>('[data-fold="graph.bound"]')!;
    const head = notice.querySelector<HTMLButtonElement>('.anl-fold-head')!;
    expect(notice.textContent ?? '').not.toMatch(/\d+ of \d+ elements/);
    head.click();
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(notice.textContent ?? '').toMatch(/\d+ of \d+ elements/);
    // Collapses back the same way.
    head.click();
    expect(head.getAttribute('aria-expanded')).toBe('false');
  });

  it('the substitute is PERSISTED through the same fold record every other fold on this card uses', async () => {
    const stage = await expandGraph();
    stage.querySelector<HTMLButtonElement>('[data-fold="graph.bound"] .anl-fold-head')!.click();
    await settle();
    // A full card rebuild (a selection) must not reset it — same guarantee
    // `relationshipGraphLegibility.spec.ts` already proves for the other folds.
    selectionBus.dispatch({ type: 'select', source: '3d-canvas', elementIds: ['wall_a'] });
    await settle();
    const headAfter = graphCard().querySelector<HTMLButtonElement>('[data-fold="graph.bound"] .anl-fold-head')!;
    expect(headAfter.getAttribute('aria-expanded'), 'the fold reset on re-render').toBe('true');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (3) — the functional controls are UNCHANGED by any of this', () => {
  it('storey / relationships / draw / node size / focus hops / reset / export all still reach the reader', async () => {
    const stage = await expandGraph();
    const labels = [...stage.querySelectorAll('.anl-scope-chip')].map((b) => b.textContent);
    for (const wanted of ['3D', '2D', 'Labels', 'Reset view', 'Export network data', 'Export PNG']) {
      expect(labels, `${wanted} is not reachable inside the expanded, quiet stage`).toContain(wanted);
    }
    expect(stage.textContent ?? '').toContain('Storey');
    expect(stage.textContent ?? '').toContain('Relationships');
    expect(stage.querySelectorAll('input[type="range"]').length, 'Node size / Focus hops sliders vanished').toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (4) — the scoping guard: an unrelated tab is never silently quieted', () => {
  it('⛔ a stale graphExpanded() flag does not quiet a DIFFERENT tab\'s honest status line', async () => {
    await expandGraph();
    // Leave Relationships WITHOUT collapsing the graph first — `graphExpanded()`
    // is module state (see `graphViewState.ts`) and is not reset by a tab
    // switch, only by a project switch. If the tab status line keyed on the
    // flag alone (rather than on the active tab actually holding the widget),
    // this would wrongly borrow the graph's quiet treatment.
    await openTab('overview');
    const status = surface().querySelector('.anl-status')!;
    // Overview's own cards are complete in this fixture (only the graph is
    // incomplete), so the meaningful, non-borrowed check is that the line
    // still renders its OWN diagnostic sentence rather than going silently
    // quiet because of a flag that belongs to a different tab and widget.
    expect(status.textContent ?? '').toMatch(/Rendered in \d+ ms/);
    setGraphExpanded(false);
    await settle();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (5) — composes with §DEMO141, does not fight it', () => {
  it('Present ON + expanded: still exactly one bound carrier, no duplicate, no crash', async () => {
    setPresentationMode(true);
    const stage = await expandGraph();
    expect(graphCard().querySelector('.anl-honesty-pin')).toBeNull();
    expect(graphCard().querySelectorAll('[data-fold="graph.bound"]').length).toBe(1);
    expect(stage.querySelector('[data-fold="graph.bound"]')).not.toBeNull();
    setPresentationMode(false);
  });

  it('Present ON, NOT expanded: unaffected by this lane — behaviour is byte-identical to §DEMO141', async () => {
    setPresentationMode(true);
    window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
    await settle();
    const card = graphCard();
    expect(card.querySelector('.anl-honesty-pin')).toBeNull();
    expect(card.querySelector('[data-fold="graph.bound"]'), 'graph.bound should only exist while EXPANDED').toBeNull();
    const marker = card.querySelector('.anl-card-head .anl-badge--muted');
    expect(marker, 'the card-head "≥" marker is presentation mode\'s own carrier and must be untouched').not.toBeNull();
    setPresentationMode(false);
  });
});
