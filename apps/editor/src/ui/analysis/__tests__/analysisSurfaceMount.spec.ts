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
 * §PARCEL-LAW-TAB (L-12915 · STR §21 / §24.1 · C19 §5.6 / §5.7) — the fifth tab is a HOST.
 *
 * Driven through the REAL surface, the REAL tab strip and the REAL rail-panel builder. The
 * fakes are installed on `window` — the production capability host — and are fakes of the
 * SEAM: a `pryzmMountEnvelopeCard` that MOVES one card element between hosts (the real seam's
 * shape), a site store on `window.runtime`, and the two view entry points recording calls.
 */
describe('§PARCEL-LAW-TAB — the fifth tab hosts the producers', () => {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const CARD_TESTID = 'buildable-envelope-card';
  const card = document.createElement('div');
  card.setAttribute('data-testid', CARD_TESTID);
  card.textContent = 'ENVELOPE CARD (singleton)';
  const viewport = document.createElement('div');
  viewport.id = 'fake-viewport';
  const seamCalls: Array<HTMLElement | null> = [];
  const viewCalls: string[] = [];

  beforeAll(() => {
    document.body.appendChild(viewport);
    viewport.appendChild(card);
    window.pryzmMountEnvelopeCard = (host: HTMLElement | null): boolean => {
      seamCalls.push(host);
      (host ?? viewport).appendChild(card);
      return true;
    };
    window.pryzmGetSiteViewState = () => ({ segment: '2D', formaMode: 'plan', buildingFidelity: 'real' });
    window.pryzmEnterSiteView = (initial) => { viewCalls.push(`pryzmEnterSiteView(${initial ?? ''})`); };
    window.pryzmShowSiteResultView = (initial) => { viewCalls.push(`pryzmShowSiteResultView(${initial ?? ''})`); };
    (window.runtime as unknown as { siteModelStore?: unknown }).siteModelStore = {
      getSite: () => ({
        parcel: {
          boundary: { polygon: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 21 }, { x: 0, z: 21 }] },
          area: 424,
          provenance: {
            kind: 'cadastral', source: 'catastro', label: 'Catastro (Spain)', refcat: '3634515DF3833D',
            address: 'CALLE EJEMPLO 1, CORDOBA', jurisdictionId: 'es-cordoba', sourceCrs: 'EPSG:25830',
            license: 'CC BY 4.0 · Dirección General del Catastro', ingestTimestamp: '2026-08-21T09:14:00Z',
            confidence: { areaOfficialM2: 423, areaSigM2: 424, areaSource: 'registry-declared', match: 'high', geometryComplete: true },
          },
        },
      }),
      subscribe: (_l: () => void) => () => { /* noop */ },
    };
  });

  afterAll(() => {
    viewport.remove();
    delete window.pryzmMountEnvelopeCard;
    delete window.pryzmGetSiteViewState;
    delete window.pryzmEnterSiteView;
    delete window.pryzmShowSiteResultView;
  });

  const el = (): HTMLElement => document.getElementById('anl-surface')!;
  const tab = (id: string): HTMLButtonElement => el().querySelector<HTMLButtonElement>(`.anl-tab[data-tab="${id}"]`)!;

  it('the tab strip has FIVE tabs and the fifth carries no count chip', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await tick(); await tick();
    const tabs = [...el().querySelectorAll('.anl-tab')].map((b) => (b as HTMLElement).dataset.tab);
    expect(tabs).toEqual(['overview', 'quantities', 'relationships', 'areas', 'parcel-law']);
    expect(tab('parcel-law').querySelector('.anl-tab-count'), 'a host tab must not advertise "0 widgets"').toBeNull();
    expect(tab('parcel-law').querySelector('.anl-tab-nb')).toBeNull();
    expect(tab('overview').querySelector('.anl-tab-count')).not.toBeNull();
  });

  it('⭐ opening it mounts the body IN PLACE OF cards, hosts the real cadastral card, and CLAIMS the envelope card', async () => {
    tab('parcel-law').click();
    await tick(); await tick();
    const body = el().querySelector('[data-testid="analysis-parcel-law"]');
    expect(body, 'the Parcel Law body did not mount').not.toBeNull();
    expect(el().querySelectorAll('.anl-card')).toHaveLength(0);
    expect(el().textContent).not.toContain('This tab has no widgets');
    // The cadastral half — the ONE producer's output, with the two trust facts.
    expect(body!.textContent).toContain('Catastro (Spain)');
    expect(body!.textContent).toContain('2026-08-21T09:14:00Z');
    // The switcher — four segments, live, none of them a dead click.
    const segs = body!.querySelectorAll('[data-testid="view-segment-switcher"] button[data-view-segment]');
    expect(segs).toHaveLength(4);
    for (const s of segs) expect((s as HTMLButtonElement).disabled).toBe(false);
    // The singleton was CLAIMED into this body.
    expect(seamCalls.length).toBeGreaterThanOrEqual(1);
    expect(body!.contains(card)).toBe(true);
    // The status line says HOSTED, and does not borrow the census sentence.
    const status = el().querySelector('.anl-status')!.textContent ?? '';
    expect(status).toContain('nothing on this tab is computed here');
    expect(status).not.toContain('every declared source read');
  });

  it('a segment click reaches the SAME registered entry point the GIS bar drives', () => {
    const body = el().querySelector('[data-testid="analysis-parcel-law"]')!;
    body.querySelector<HTMLButtonElement>('button[data-view-segment="globe"]')!.click();
    body.querySelector<HTMLButtonElement>('button[data-view-segment="plan"]')!.click();
    expect(viewCalls).toEqual(['pryzmShowSiteResultView(3D)', 'pryzmEnterSiteView(plan)']);
  });

  it('the picker refuses to add a widget here, and says why', () => {
    el().querySelector<HTMLButtonElement>('#anl-add')!.click();
    const picker = el().querySelector('.anl-picker')!;
    expect(picker.textContent).toContain('takes no widgets');
    const rows = picker.querySelectorAll<HTMLButtonElement>('.anl-picker-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.disabled).toBe(true);
    el().querySelector<HTMLButtonElement>('#anl-add')!.click(); // close
    expect(el().querySelector('.anl-picker')).toBeNull();
  });

  it('⭐ a model commit while the tab is open REPAINTS the body — it never remounts it and never bounces the card', async () => {
    const bodyBefore = el().querySelector('[data-testid="analysis-parcel-law"]')!;
    const callsBefore = seamCalls.length;
    // The production trigger: a DOM event the surface debounces (350 ms) into refresh().
    window.dispatchEvent(new Event('level-changed'));
    await new Promise((r) => setTimeout(r, 450));
    const bodyAfter = el().querySelector('[data-testid="analysis-parcel-law"]');
    expect(bodyAfter, 'the body was remounted (a different node) instead of repainted').toBe(bodyBefore);
    // No hand-back, no re-claim: the seam was not touched by the refresh.
    expect(seamCalls.length, 'the refresh bounced the singleton through the seam').toBe(callsBefore);
    expect(bodyBefore.contains(card)).toBe(true);
    const status = el().querySelector('.anl-status')!.textContent ?? '';
    expect(status).toContain('Repainted in');
    expect(status).toContain('nothing on this tab is computed here');
  });

  it('⭐ leaving the tab tears the body down and hands the card back ONLY because it still held it', async () => {
    const before = seamCalls.length;
    tab('overview').click();
    await tick(); await tick();
    expect(el().querySelector('[data-testid="analysis-parcel-law"]')).toBeNull();
    // Exactly one hand-back — the null call — and the card is back in the viewport, not
    // stranded inside the hidden surface.
    expect(seamCalls.slice(before)).toEqual([null]);
    expect(card.parentElement).toBe(viewport);
    expect(el().contains(card)).toBe(false);
    // Overview is a grid again.
    expect(el().querySelectorAll('.anl-card').length).toBeGreaterThanOrEqual(5);
  });

  it('⛔ NEVER evicts another host that claimed the card since — no null call on tab change then', async () => {
    tab('parcel-law').click();
    await tick(); await tick();
    expect(el().querySelector('[data-testid="analysis-parcel-law"]')!.contains(card)).toBe(true);
    // The rail PARCEL panel (say) claims it while the tab is open.
    const other = document.createElement('div');
    document.body.appendChild(other);
    window.pryzmMountEnvelopeCard!(other);
    const before = seamCalls.length;
    tab('overview').click();
    await tick(); await tick();
    expect(seamCalls.length, 'the tab reached into another host\'s claim').toBe(before);
    expect(card.parentElement).toBe(other);
    other.remove();
    viewport.appendChild(card);
  });

  it('hiding the surface while the tab is open tears the body down too (no claim by an invisible host)', async () => {
    tab('parcel-law').click();
    await tick(); await tick();
    expect(el().contains(card)).toBe(true);
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await tick();
    expect(el().classList.contains('anl-surface--visible')).toBe(false);
    expect(el().querySelector('[data-testid="analysis-parcel-law"]')).toBeNull();
    expect(card.parentElement).toBe(viewport);
    // ⚠ RESTORE — the active tab is persisted; leave the file where it found it.
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await tick(); await tick();
    tab('overview').click();
    await tick();
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await tick();
  });
});
