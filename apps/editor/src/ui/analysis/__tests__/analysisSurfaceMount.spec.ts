/**
 * §ANALYSIS-MOUNT (L-3011 · ADR-0343 §D.1) — does the panel actually appear?
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS SEPARATELY FROM THE HONESTY GUARD
 * ═════════════════════════════════════════════════════════════════════════════
 * MEMORY §committed-is-not-reachable: four fixes in one session ran nowhere,
 * every one of them with green unit tests, because each was verified at the
 * layer of a pure function's return value rather than at the layer the user
 * experiences. `analysisHonesty.spec.ts` proves the read model is correct. It
 * proves nothing about whether a panel ever mounts.
 *
 * This file drives the REAL `AnalysisSurface` through the REAL workspace-mode
 * event with a REAL (queued-then-flushed) runtime event bus, and then reads the
 * DOM: is `#anl-surface` in the document, is it marked visible, how many cards
 * did it build, does the headline say "≥" when a store is missing, and does the
 * refusal card actually carry the words NOT BUILT.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT IT STILL CANNOT ESTABLISH — stated, not glossed
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing. Nothing here measures a
 * pixel, a colour, a chart, or whether 50% of the viewport is actually covered.
 * `new Chart()` cannot construct without a 2-D context, so the chart widgets
 * take their documented table fallback in this environment — which means the
 * CHART path itself is exercised only as far as the fallback. That is a real
 * limit of this arm and is why it is written down rather than implied.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ⭐ STATIC import, and it is the point: this evaluates the module and CONSTRUCTS
// the singleton — which self-appends to document.body — exactly as the
// side-effect import in engineLauncher.ts does. Its `pryzm-workspace-mode`
// subscription is therefore QUEUED at construction (no runtime yet), and is
// applied by flushRuntimeEventListeners() below. That is the real production
// path, deferred bridge and all, not a shortcut around it.
import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';

interface Rec { id: string; levelId?: string; systemTypeId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * A minimal runtime event bus, installed BEFORE the module is imported so
 * `onRuntimeEvent` registers immediately instead of queueing. This mirrors the
 * post-`flushRuntimeEventListeners()` state, which is the state the surface
 * actually runs in (engineLauncher flushes at :1053, restores at :1056).
 */
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

beforeAll(() => {
  bus = installRuntimeBus();
  // Two stores populated, sixteen absent — so the surface must report an
  // INCOMPLETE census, which is the state most likely to be rendered wrongly.
  window.wallStore = listStore([
    { id: 'w1', levelId: 'L0', systemTypeId: 'basic-200' },
    { id: 'w2', levelId: 'L0', systemTypeId: 'basic-200' },
    { id: 'w3' },
  ]);
  window.roomStore = listStore([{ id: 'r1', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };

  // The production hand-off, in the production order: runtime first, THEN the
  // flush that applies the queued subscription. If this ever stops working the
  // surface is unreachable at boot, which is precisely what the ordering arm in
  // analysisHonesty.spec.ts pins in engineLauncher.
  flushRuntimeEventListeners();
});

afterAll(() => {
  document.getElementById('anl-surface')?.remove();
});

describe('§ANALYSIS-MOUNT — the panel is in the document', () => {
  it('the singleton self-appended #anl-surface to document.body', () => {
    const el = document.getElementById('anl-surface');
    expect(el, 'the Analysis surface never mounted').not.toBeNull();
    expect(el!.parentElement).toBe(document.body);
    // Hidden until the mode says otherwise — the surface does not squat.
    expect(el!.classList.contains('anl-surface--visible')).toBe(false);
  });

  it('it exposes the header controls the founder actually clicks', () => {
    const el = document.getElementById('anl-surface')!;
    for (const id of ['anl-add', 'anl-refresh', 'anl-reset', 'anl-prov']) {
      expect(el.querySelector(`#${id}`), `header control ${id} is missing`).not.toBeNull();
    }
  });
});

describe('§ANALYSIS-MOUNT — the workspace-mode event drives it', () => {
  it('⭐ emitting mode=analysis makes it visible and BUILDS CARDS', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    // refresh() is async (it awaits the lazy chart import). Let it settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const el = document.getElementById('anl-surface')!;
    expect(el.classList.contains('anl-surface--visible')).toBe(true);

    const cards = el.querySelectorAll('.anl-card');
    // The default layout is nine widgets. A surface that mounts and renders
    // ZERO cards is the "committed but not reachable" failure wearing a panel.
    expect(cards.length, 'the surface is visible but built no cards').toBeGreaterThanOrEqual(5);
  });

  it('⛔ the headline reads "≥" because the census was INCOMPLETE', async () => {
    const el = document.getElementById('anl-surface')!;
    const kpi = el.querySelector('[data-widget="element-count"] .anl-kpi-value');
    expect(kpi, 'the element-count KPI did not render').not.toBeNull();
    // Sixteen declared stores were unreadable, so 4 is a FLOOR, not a total.
    expect(kpi!.textContent).toContain('≥');
    expect(kpi!.textContent).toContain('4');
    // …and the card says so on its face rather than only in the number.
    expect(el.querySelector('[data-widget="element-count"] .anl-strip--warn')).not.toBeNull();
    expect(el.textContent).toContain('LOWER BOUND');
  });

  it('⛔ the refusal card renders NOT BUILT and names its missing model', async () => {
    const el = document.getElementById('anl-surface')!;
    // §ANALYSIS-TABS (L-3304) — `change-table` moved to the "Areas & change"
    // tab, and only the ACTIVE tab computes, so it is deliberately NOT on screen
    // at mount. The tab must be selected first. This assertion was kept and
    // re-aimed rather than deleted: what it checks (a refusal card renders its
    // named missing model and NO figure) is unchanged by the tabbing.
    const areasTab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="areas"]');
    expect(areasTab, 'the Areas tab is missing from the tab strip').not.toBeNull();
    areasTab!.click();
    await new Promise((r) => setTimeout(r, 0));

    const card = el.querySelector('[data-widget="change-table"]');
    expect(card, 'the NOT BUILT change table is not on the Areas tab').not.toBeNull();
    expect(card!.querySelector('.anl-badge--err')?.textContent).toBe('NOT BUILT');
    expect(card!.textContent).toContain('Stable element ids across saved versions');
    // ⛔ It must render no figure at all — not a zero, not a dash.
    expect(card!.querySelector('.anl-kpi-value')).toBeNull();
    expect(card!.querySelector('canvas')).toBeNull();

    // ⚠ RESTORE. The active tab is PERSISTED (that is the feature — reopen the
    // surface and you are where you left it), so a test that switches tabs and
    // walks away has mutated shared state for every test after it in this file.
    // Leaving it un-restored is how the two sibling assertions below started
    // failing on a change that did not touch them.
    const overviewTab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="overview"]');
    overviewTab!.click();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('a level bar carries the resolved level NAME, not a raw id', () => {
    const el = document.getElementById('anl-surface')!;
    const card = el.querySelector('[data-widget="level-bar"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Ground floor');
    // …and the elements with no level are a NAMED row, never dropped.
    expect(card!.textContent).toContain('No level assigned');
  });

  it('every card states its provenance — source, axis, denominator, cost', () => {
    const el = document.getElementById('anl-surface')!;
    const foots = el.querySelectorAll('.anl-card-foot');
    expect(foots.length).toBeGreaterThan(0);
    for (const f of foots) {
      // C66 §1.1: a cost that has not been benched may not be described as
      // supported. Every card says CLAIMED, on its own face.
      expect(f.textContent).toContain('CLAIMED');
      expect(f.textContent).toContain('computed over');
    }
  });

  it('emitting any other mode hides it again', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('anl-surface')!.classList.contains('anl-surface--visible')).toBe(false);
  });
});
