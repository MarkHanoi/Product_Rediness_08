/**
 * §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9002 · L-9006) — proof at
 * the layer the founder experiences.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE IS NOT `layoutReconciliation.spec.ts`
 * ═════════════════════════════════════════════════════════════════════════════
 * That suite proves `reconcileLayout` is correct. MEMORY §committed-is-not-reachable:
 * that is a pure function's return value, and this session has already produced
 * twelve built-but-unreachable surfaces — one of which is the very defect being
 * fixed here. So this file does the only thing that settles it:
 *
 *   it seeds `localStorage` with the LITERAL value from the founder's browser,
 *   boots the REAL `AnalysisSurface`, clicks the REAL Relationships tab, and
 *   asks whether a person standing there can reach the graph.
 *
 * ⛔ ORDER MATTERS AND IS LOAD-BEARING. `localStorage` and `window.projectContext`
 * are seeded BEFORE the workspace-mode event, because `_show()` calls
 * `loadLayout()` and `loadLayout` keys off the project id. Seeding afterwards
 * would test a default arrangement wearing the founder's name — which is the
 * shape of test that would have passed while he was still stuck.
 *
 * ⚠ STATED LIMIT: happy-dom paints nothing. These arms establish that the
 * controls EXIST, are enabled, and that acting on them changes the DOM. They do
 * not establish that anything is legible on screen.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';

const PROJ = 'founder-project';

/** The literal value that was in the founder's browser on deploy 2f8d9470. */
const FOUNDERS_STORED = JSON.stringify({
  version: 2,
  tabs: { relationships: ['relationship-coverage'] },
  activeTab: 'relationships',
});

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

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const surface = (): HTMLElement => document.getElementById('anl-surface')!;

async function openRelationships(): Promise<void> {
  const tab = surface().querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
  expect(tab, 'the Relationships tab is missing').not.toBeNull();
  tab!.click();
  await settle();
}

let bus: { emit: (e: string, p: unknown) => void };

beforeAll(async () => {
  bus = installRuntimeBus();
  // ⛔ BOTH of these must precede the mode event — see the header.
  window.projectContext = { projectId: PROJ } as never;
  localStorage.setItem(`pryzm.analysis.layout.${PROJ}`, FOUNDERS_STORED);

  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  window.wallStore = { getAll: () => [{ id: 'wall_a', levelId: 'L0' }] } as never;

  flushRuntimeEventListeners();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

afterAll(() => {
  document.getElementById('anl-surface')?.remove();
  localStorage.clear();
});

describe('L-9006 — the founder opens Relationships with his real stored arrangement', () => {
  it('⛔ REPRODUCES THE SYMPTOM: without acting, the graph card is not rendered', async () => {
    await openRelationships();
    // This is what he saw. It is still true before he answers the question —
    // because the honest answer to "did you remove this?" is to ask, not to guess.
    expect(surface().querySelector('[data-widget="relationship-graph"]')).toBeNull();
    expect(surface().querySelector('[data-widget="relationship-coverage"]')).not.toBeNull();
  });

  it('⭐ but the tab now TELLS him, instead of silently rendering one card', async () => {
    await openRelationships();
    const notice = surface().querySelector('.anl-reconcile');
    expect(notice, 'no reconciliation notice — the widget is silently invisible').not.toBeNull();
    const text = notice!.textContent ?? '';
    expect(text).toMatch(/not in your saved arrangement/);
    expect(text).toMatch(/Relationship graph/);
    // ⛔ It explains WHY it cannot decide, rather than asserting either answer.
    expect(text).toMatch(/cannot tell whether you removed them or never had them/);
    expect(text).toMatch(/will not guess/);
  });

  it('⭐⭐ ONE CLICK on the notice renders the graph card', async () => {
    await openRelationships();
    const row = surface().querySelector<HTMLButtonElement>('.anl-reconcile-row');
    expect(row, 'the notice offers no way to add the widget').not.toBeNull();
    row!.click();
    await settle();

    await openRelationships();
    expect(
      surface().querySelector('[data-widget="relationship-graph"]'),
      'clicking Add did not render the graph',
    ).not.toBeNull();
    // ⚠ CORRECTED — THE FIRST DRAFT OF THIS ASSERTION WAS WRONG AND THE PRODUCT
    // WAS RIGHT. It read `expect(...'.anl-reconcile')).toBeNull()`, i.e. "one
    // answer clears the whole notice". It does not, and it must not: his stored
    // arrangement omits TWO widgets (the default Relationships tab holds three
    // and his list held one), so answering about the graph says nothing about
    // `relationship-table`. Collapsing them would be the same one-value-two-facts
    // defect this whole section exists to remove, one level up.
    const still = surface().querySelector('.anl-reconcile');
    expect(still?.textContent ?? '', 'the graph is placed but still being asked about')
      .not.toMatch(/Relationship graph/);
    expect(still?.textContent ?? '', 'the OTHER unplaced widget stopped being offered')
      .toMatch(/Relations by family/);
  });
});

describe('L-9007 — deliverable C: the escape hatches work, verified not assumed', () => {
  it('⭐ "+ Add widget" LISTS relationship-graph and it is not disabled', async () => {
    // Re-seed the founder's state so the picker is asked the real question.
    localStorage.setItem(`pryzm.analysis.layout.${PROJ}`, FOUNDERS_STORED);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();
    await openRelationships();

    surface().querySelector<HTMLButtonElement>('#anl-add')!.click();
    await settle();

    const rows = [...surface().querySelectorAll<HTMLButtonElement>('.anl-picker-row')];
    expect(rows.length, 'the picker rendered no rows').toBeGreaterThan(0);
    const graphRow = rows.find((r) => r.textContent?.includes('Relationship graph'));
    expect(graphRow, 'the picker does not list the Relationship graph').toBeDefined();
    expect(graphRow!.disabled, 'the picker lists the graph but will not let him add it').toBe(false);

    graphRow!.click();
    await settle();
    await openRelationships();
    expect(surface().querySelector('[data-widget="relationship-graph"]')).not.toBeNull();
  });

  it('⭐ the reset control restores the default arrangement, graph included', async () => {
    localStorage.setItem(`pryzm.analysis.layout.${PROJ}`, FOUNDERS_STORED);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();

    surface().querySelector<HTMLButtonElement>('#anl-reset')!.click();
    await settle();
    await openRelationships();
    expect(surface().querySelector('[data-widget="relationship-graph"]')).not.toBeNull();
  });
});

describe('L-9008 — RULE B at the DOM layer: "stop asking" keeps the removal', () => {
  it('⛔ answering "I removed these on purpose" hides the notice and adds NOTHING', async () => {
    localStorage.setItem(`pryzm.analysis.layout.${PROJ}`, FOUNDERS_STORED);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();
    await openRelationships();

    const keep = surface().querySelector<HTMLButtonElement>('.anl-reconcile-keep');
    expect(keep, 'the notice offers no way to say the removal was deliberate').not.toBeNull();
    keep!.click();
    await settle();
    await openRelationships();

    expect(surface().querySelector('.anl-reconcile'), 'the notice kept asking').toBeNull();
    // ⛔ THE DECISION IS HONOURED: the widget is still not there.
    expect(surface().querySelector('[data-widget="relationship-graph"]')).toBeNull();
    expect(surface().querySelector('[data-widget="relationship-coverage"]')).not.toBeNull();
  });

  it('⛔ and it STAYS answered across a reopen — the question is asked once', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settle();
    await openRelationships();
    expect(surface().querySelector('.anl-reconcile')).toBeNull();
    expect(surface().querySelector('[data-widget="relationship-graph"]')).toBeNull();
  });
});
