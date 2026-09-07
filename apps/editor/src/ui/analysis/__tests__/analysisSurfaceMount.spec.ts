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
// §SITE-IS-A-MODE (L-13180 · C115 §0.3 / §2.5) — the relocation stamp this surface must
// carry now that the Parcel Law tab has moved out of it, plus the retired-id record.
// Read from the module, never spelled out here: a stamp a spec re-types is a stamp that
// can drift from the thing it stamps.
import {
  ANALYSIS_RELOCATED_ATTR,
  ANALYSIS_RELOCATED_TO_SITE_MODE,
  ANALYSIS_RETIRED_TAB_HOMES,
  ANALYSIS_RETIRED_TAB_IDS,
  ANALYSIS_TABS,
} from '../AnalysisTypes';
// ⭐ THE ATTRIBUTE NAME IS HELD TO ITS ORIGINAL. C115 §2.5 `C115-17` requires the
// relocation stamp to REUSE `PARCEL_LAW_MERGED_ATTR`, never to mint a rival attribute.
// `AnalysisTypes` spells the string rather than importing it (an import would drag the
// whole parcel producer tree back into the Analysis bundle — the coupling this move
// removed), so THIS is the one place the two are held equal.
import { PARCEL_LAW_MERGED_ATTR } from '../parcelLawFacts';
import { loadLayout } from '../analysisLayout';
import { DEFAULT_TAB_LAYOUT, WIDGET_CATALOGUE } from '../widgetCatalogue';
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

/**
 * §PARCEL-LAW-TAB (2026-09-05) — wait for a CONDITION, or 4 s, whichever comes first.
 *
 * ⛔ NEVER a sleep, and it asserts NOTHING. It returns the moment the predicate holds,
 * and it returns quietly when it never does — so the caller's own assertion is what
 * fails, saying exactly what it always said. A helper that threw here would replace a
 * specific failure ("the surface built no cards") with a generic one ("timeout"), which
 * is how a real defect gets misfiled as flake.
 *
 * The race it removes: `AnalysisSurface.refresh()` awaits `_ensureChartjs()`, whose
 * `await import('chart.js')` is a COLD dynamic import under vitest — Vite transforms the
 * module before that promise resolves, which on a loaded machine is seconds. Every wait
 * in this file was `await tick(); await tick();`, two macrotasks, which loses that race
 * and reads an empty grid.
 */
async function until(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (pred()) return;
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The common condition: the grid has rendered at least one card. */
const settleCards = (timeoutMs = 4000): Promise<void> =>
  until(() => (document.getElementById('anl-surface')?.querySelectorAll('.anl-card').length ?? 0) > 0, timeoutMs);

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
    // ⚠ AMENDED 2026-09-05 (lane PARCEL-LAW-TAB). This waited TWO macrotasks and
    // called that "let it settle". `refresh()` awaits `_ensureChartjs()`, whose
    // `await import('chart.js')` is a COLD dynamic import here — Vite has to
    // transform the module before the promise resolves, which on a loaded machine
    // is seconds, not two ticks. So the wait raced the import and lost: the assert
    // read an empty grid and reported "the surface is visible but built no cards",
    // i.e. it printed the §committed-is-not-reachable failure it exists to catch
    // while the surface was merely still working. MEASURED: the next test in this
    // block passed at 2008 ms on the same run — the cards DO arrive.
    // The fix is a bounded POLL on the condition, not a longer sleep: the
    // assertion below is unchanged, so a surface that genuinely renders nothing
    // still fails — it just fails after 4 s instead of after 2 ticks.
    await settleCards();

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
    //
    // ⚠ AMENDED 2026-08-26 (§ANALYSIS-FOLD-STATE, L-12063). This used to select
    // `.anl-strip--warn`, which is the PLATE the reason list used to sit on. The
    // block is now a FOLD and ships COLLAPSED, so that plate is gone — but the
    // requirement never was "there is an amber rectangle", it was SPEC §2's *"a
    // widget with `complete:false` MUST say so"*. The assertion is therefore
    // repointed at the CLAIM rather than at its old container, which is a
    // strictly stronger test: it fails if the fold header is ever shortened to a
    // bare "Incomplete", and it fails if the fold ever ships open-by-default and
    // then gets closed by a reader.
    const card = el.querySelector('[data-widget="element-count"]')!;
    const fold = card.querySelector('[data-fold="w.completeness"]');
    expect(fold, 'the completeness fold did not render').not.toBeNull();
    expect(
      fold!.querySelector('.anl-fold-head')!.getAttribute('aria-expanded'),
      'the completeness note must ship COLLAPSED — the founder asked for it',
    ).toBe('false');
    // ⭐ THE HONESTY PIN: collapsed, the header still carries the whole claim.
    expect(fold!.querySelector('.anl-fold-label')!.textContent).toContain('LOWER BOUND');
    expect(fold!.querySelector('.anl-fold-chip--warn')!.textContent).toContain('LOWER BOUND');
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

/**
 * §SITE-IS-A-MODE (L-13180 · C115 §0.3 · §2.5 `C115-17`) — THE PARCEL LAW TAB LEFT, AND
 * THE PROOF THAT IT LEFT *TO SOMEWHERE* RATHER THAN LEFT *ENTIRELY*.
 *
 * ⛔ THE ≈135 LINES THAT WERE HERE WERE NOT DELETED. Six `it`s drove the fifth tab
 * through claim / repaint / teardown / never-evict / hide-while-open. Every one of them
 * lives in `apps/editor/src/ui/site/__tests__/siteSurfaceMount.spec.ts`, re-keyed from a
 * tab click to `bus.emit('pryzm-workspace-mode', { mode: 'site' })`. Moving the
 * assertions rather than dropping them is the only thing that makes the founder's
 * *"0 functionality lost"* checkable rather than merely claimed (C115 §13 AC-16 — probes
 * and testids move WITH their renderings).
 *
 * What remains HERE is the other half of the move, and it is the half a spec looking only
 * at the new home would pass with the OLD home still live: this surface must no longer
 * host the body, and it must SAY where the body went.
 */
describe('§SITE-IS-A-MODE — Analysis gave the tab up, and stamped where it went', () => {
  const el = (): HTMLElement => document.getElementById('anl-surface')!;
  const tabEl = (id: string): HTMLButtonElement =>
    el().querySelector<HTMLButtonElement>(`.anl-tab[data-tab="${id}"]`)!;

  it('the tab strip has FOUR tabs and none of them is `parcel-law`', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await until(() => el().classList.contains('anl-surface--visible'));
    const tabs = [...el().querySelectorAll('.anl-tab')].map((b) => (b as HTMLElement).dataset.tab);
    expect(tabs).toEqual(['overview', 'quantities', 'relationships', 'areas']);
    // Derived, not merely re-listed: the strip renders whatever `ANALYSIS_TABS` holds,
    // so asserting the two agree is what makes the literal above mean something.
    expect(tabs).toEqual(ANALYSIS_TABS.map((t) => t.id));
    for (const retired of ANALYSIS_RETIRED_TAB_IDS) {
      expect(tabs, `${retired} is still on the Analysis strip`).not.toContain(retired);
    }
  });

  it('⭐ the surface carries the C115 §2.5 RELOCATION STAMP naming the Site mode', () => {
    // ⛔ THE CLAUSE THIS ENFORCES, in its own words: *"a reader (and a spec) can tell
    // 'the block moved to its owner' from 'the block is gone'"*. Without the stamp the
    // arm above is indistinguishable from a deletion.
    expect(el().getAttribute(ANALYSIS_RELOCATED_ATTR)).toBe(ANALYSIS_RELOCATED_TO_SITE_MODE);
    // …the stamp REUSES the existing attribute rather than inventing a rival one…
    expect(ANALYSIS_RELOCATED_ATTR).toBe(PARCEL_LAW_MERGED_ATTR);
    // …and the retired id records its new home in exactly the words the stamp uses.
    expect(ANALYSIS_RETIRED_TAB_HOMES['parcel-law']).toBe(ANALYSIS_RELOCATED_TO_SITE_MODE);
  });

  it('⛔ this surface mounts no parcel-law body on ANY tab it still owns', async () => {
    // The pill is gone from the strip, but a stale persisted `activeTab` or a leftover
    // branch could still mount the body. This asserts the BODY, not the pill.
    for (const t of ANALYSIS_TABS) {
      tabEl(t.id).click();
      await new Promise((r) => setTimeout(r, 0));
      expect(
        el().querySelector('[data-testid="analysis-parcel-law"]'),
        `the parcel body mounted on the ${t.id} tab`,
      ).toBeNull();
    }
    // ⚠ RESTORE — the active tab is PERSISTED, so a test that walks away has mutated
    // shared state for every test after it in this file.
    tabEl('overview').click();
    await settleCards();
  });

  it('the picker no longer refuses — a row is disabled ONLY because it is already placed', async () => {
    // ⛔ THE FIRST VERSION OF THIS ARM WAS WRONG AND THE SUITE CAUGHT IT, which is worth
    // recording rather than quietly rewriting. It asserted *"at least one row is enabled"*
    // as its control — and that FAILED, correctly: **every catalogue widget is in
    // `DEFAULT_TAB_LAYOUT`**, so on a default dashboard every row IS disabled, for the
    // honest reason ("already on this dashboard") and not for the retired host-tab reason.
    // A control that cannot distinguish the two reasons is not a control.
    //
    // ⭐ SO THE PRECONDITION IS MADE FIRST: one tab is EMPTIED, which is a supported state
    // this surface already promises to respect (`analysisTabs.spec.ts` — *"a stored EMPTY
    // tab does not silently refill with the default"*). Its five widgets then become
    // unplaced and their rows MUST come back enabled, while every other row stays disabled.
    // That is bidirectional, so it fails if the picker disables everything AND if it
    // disables nothing.
    const KEY = 'pryzm.analysis.layout.unscoped'; // mirrors analysisLayout `LS_PREFIX` + no projectId
    const before = loadLayout();
    const emptied = [...DEFAULT_TAB_LAYOUT.overview];
    expect(emptied.length, 'the overview default is empty — this arm would be vacuous').toBeGreaterThan(0);
    localStorage.setItem(KEY, JSON.stringify({ ...before, tabs: { ...before.tabs, overview: [] }, activeTab: 'overview' }));

    // `_show()` re-reads `loadLayout()`, so a mode round-trip is the production path.
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await new Promise((r) => setTimeout(r, 0));
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await until(() => el().querySelector('#anl-add') !== null && el().classList.contains('anl-surface--visible'));

    el().querySelector<HTMLButtonElement>('#anl-add')!.click();
    const picker = el().querySelector('.anl-picker')!;
    // The host-tab refusal went with the host tab. Asserted so a stray "takes no widgets"
    // note left behind fails loudly rather than merely confusing a reader.
    expect(picker.textContent).not.toContain('takes no widgets');
    const rows = [...picker.querySelectorAll<HTMLButtonElement>('.anl-picker-row')];
    expect(rows.length).toBeGreaterThan(0);
    // Rows carry the widget TITLE, so the id is resolved through the catalogue rather than
    // spelled out here — this file must not become a second census of the widget list.
    const idOf = (row: HTMLElement): string | undefined =>
      WIDGET_CATALOGUE.find((w) => w.title === row.querySelector('.anl-picker-label')?.textContent)?.id;
    const enabled = rows.filter((r) => !r.disabled).map(idOf).filter((x): x is string => x != null);
    expect([...enabled].sort(), 'the emptied tab\'s widgets did not come back as addable')
      .toEqual([...emptied].sort());
    // ⭐ AND THE OTHER DIRECTION: a still-placed widget is still refused.
    expect(rows.filter((r) => r.disabled).length).toBeGreaterThan(0);

    el().querySelector<HTMLButtonElement>('#anl-add')!.click(); // close
    expect(el().querySelector('.anl-picker')).toBeNull();

    // ⚠ RESTORE — the arrangement is PERSISTED, so an arm that walks away has emptied a
    // tab for every test after it in this file.
    localStorage.removeItem(KEY);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await new Promise((r) => setTimeout(r, 0));
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await settleCards();
  });

  it('⚠ a persisted `activeTab: "parcel-law"` lands on Overview, not on nothing', async () => {
    // ⛔ THE MIGRATION IS BEHAVIOUR `loadLayout()` ALREADY HAD — it validates the stored
    // value against `ANALYSIS_TABS` and falls back to `'overview'`. It is pinned here
    // rather than left to inference, because a returning user whose last-read tab was
    // the relocated one must land somewhere valid instead of on a grid with a selected
    // tab that no longer exists.
    //
    // ⭐ THE CONTROL COMES FIRST, and it is what stops this arm passing vacuously: the
    // DEFAULT activeTab is also `'overview'`, so if this key were wrong the fallback
    // assertion below would pass on a layout that was never read at all. Writing a
    // DIFFERENT valid tab and seeing it come back proves the key and the read path.
    const KEY = 'pryzm.analysis.layout.unscoped'; // mirrors analysisLayout `LS_PREFIX` + no projectId
    const record = { version: 2, tabs: { overview: [], quantities: [], relationships: [], areas: [] } };
    localStorage.setItem(KEY, JSON.stringify({ ...record, activeTab: 'areas' }));
    expect(loadLayout().activeTab, 'the storage key this arm writes is not the one read').toBe('areas');

    localStorage.setItem(KEY, JSON.stringify({ ...record, activeTab: 'parcel-law' }));
    expect(loadLayout().activeTab).toBe('overview');

    // …and it reaches the DOM: `_show()` re-reads `loadLayout()`, so a mode round-trip
    // is the production path a returning user actually takes.
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await new Promise((r) => setTimeout(r, 0));
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await until(() => el().querySelector('.anl-tab--active') !== null);
    expect((el().querySelector('.anl-tab--active') as HTMLElement).dataset.tab).toBe('overview');

    localStorage.removeItem(KEY);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await new Promise((r) => setTimeout(r, 0));
  });
});
