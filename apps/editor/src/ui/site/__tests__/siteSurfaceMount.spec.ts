/**
 * §SITE-IS-A-MODE (L-13180 · C115 §0.3 · ADR-0343 §D.1) — the Parcel Law panel is now a
 * TOP-LEVEL WORKSPACE MODE, and this file is the proof that it is REACHABLE there.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, AND WHY MOST OF IT IS NOT NEW
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE ASSERTIONS BELOW WERE MOVED, NOT WRITTEN. Six of them lived in
 * `analysis/__tests__/analysisSurfaceMount.spec.ts` under *"§PARCEL-LAW-TAB — the fifth
 * tab hosts the producers"* and drove the panel through claim / repaint / teardown /
 * never-evict / hide-while-open. They are re-keyed from a TAB CLICK to a WORKSPACE-MODE
 * EMIT and are otherwise the same assertions about the same behaviour. Moving them
 * rather than deleting them is what makes the founder's *"0 functionality lost"*
 * checkable rather than merely claimed (C115 §13 AC-16).
 *
 * MEMORY §committed-is-not-reachable: four fixes in one session ran nowhere, every one
 * with green unit tests, because each was verified at the layer of a pure function's
 * return value rather than the layer the user experiences. So this file drives the REAL
 * `SiteSurface` singleton through the REAL `pryzm-workspace-mode` event on a REAL
 * (queued-then-flushed) runtime bus, and then reads the DOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT IT STILL CANNOT ESTABLISH — stated, not glossed
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing. Nothing here measures a pixel, a
 * colour, or whether the panel actually covers 50 % of the viewport; the ARM C arms are
 * SHIPPED-TEXT reads, and they say so. They cannot prove the shell behaves — they pin the
 * wiring whose silent loss would leave a fully-tested surface that never mounts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
// §VIEW-SWITCHER-ON-THE-VIEW (L-12985) — the ONE panel definition, READ rather than
// re-listed: this surface HOSTS that definition and must not become a second census of it.
import { VIEW_SEGMENTS } from '../viewSegmentSwitcher';
import { getWorkspaceMode } from '../../platform/workspaceModes';
// ⭐ STATIC import, and it is the point: this evaluates the module and CONSTRUCTS the
// singleton — which self-appends to document.body — exactly as the side-effect import in
// `engineLauncher.ts` does. Its `pryzm-workspace-mode` subscription is therefore QUEUED at
// construction (no runtime yet) and applied by `flushRuntimeEventListeners()` below. That
// is the real production path, deferred bridge and all, not a shortcut around it.
import { SITE_SURFACE_ID, SITE_SURFACE_LEDE } from '../SiteSurface';
import '../SiteSurface';

const REPO = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

/** A minimal runtime event bus, installed before the flush — the production shape. */
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
 * Wait for a CONDITION, or 4 s, whichever comes first.
 *
 * ⛔ NEVER a sleep, and it asserts NOTHING. It returns the moment the predicate holds and
 * returns QUIETLY when it never does — so the caller's own assertion is what fails, saying
 * exactly what it always said. A helper that threw here would replace a specific failure
 * ("the panel mounted no body") with a generic one ("timeout"), which is how a real defect
 * gets misfiled as flake.
 */
async function until(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (pred()) return;
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const el = (): HTMLElement => document.getElementById(SITE_SURFACE_ID)!;
const body = (): HTMLElement | null => el().querySelector('[data-testid="analysis-parcel-law"]');

const CARD_TESTID = 'buildable-envelope-card';
const card = document.createElement('div');
const viewport = document.createElement('div');
const seamCalls: Array<HTMLElement | null> = [];
const viewCalls: string[] = [];

beforeAll(() => {
  bus = installRuntimeBus();

  // The fakes are of the SEAM, installed on `window` — the production capability host.
  // `pryzmMountEnvelopeCard` MOVES one card element between hosts, which is the real
  // seam's shape and the reason the singleton discipline matters at all.
  card.setAttribute('data-testid', CARD_TESTID);
  card.textContent = 'ENVELOPE CARD (singleton)';
  viewport.id = 'fake-viewport';
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

  // The production hand-off, in the production order: runtime first, THEN the flush that
  // applies the queued subscription. ARM C below pins that same ordering in the launcher.
  flushRuntimeEventListeners();
});

afterAll(() => {
  viewport.remove();
  el()?.remove();
  delete window.pryzmMountEnvelopeCard;
  delete window.pryzmGetSiteViewState;
  delete window.pryzmEnterSiteView;
  delete window.pryzmShowSiteResultView;
});

// ── ARM A — the surface is in the document and the mode drives it ────────────────────

describe('§SITE-IS-A-MODE ARM A — the panel is in the document', () => {
  it('the singleton self-appended #ste-surface to document.body', () => {
    const e = document.getElementById(SITE_SURFACE_ID);
    expect(e, 'the Site surface never mounted').not.toBeNull();
    expect(e!.parentElement).toBe(document.body);
    // Hidden until the mode says otherwise — the surface does not squat.
    expect(e!.classList.contains('ste-surface--visible')).toBe(false);
  });

  it('the registry row that reaches it declares a HALF canvas and no shortcut', () => {
    // ⛔ The premise. If the row were `hidden`, every highlight control on this panel
    // would be a dead click (C115 §3.G `C115-27`) and each arm below would still pass —
    // so the premise is asserted rather than assumed.
    expect(getWorkspaceMode('site')?.canvas).toBe('half');
    expect(getWorkspaceMode('site')?.shortcut).toBeNull();
  });
});

describe('§SITE-IS-A-MODE ARM B — the workspace-mode event drives it', () => {
  it('⭐ emitting mode=site makes it visible, mounts the body, hosts the real cadastral card, and CLAIMS the envelope card', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'site' });
    await until(() => body() !== null);
    expect(el().classList.contains('ste-surface--visible')).toBe(true);
    expect(body(), 'the Parcel Law body did not mount').not.toBeNull();
    // The cadastral half — the ONE producer's output, with the two trust facts.
    expect(body()!.textContent).toContain('Catastro (Spain)');
    expect(body()!.textContent).toContain('2026-08-21T09:14:00Z');
    // The singleton was CLAIMED into this body.
    expect(seamCalls.length).toBeGreaterThanOrEqual(1);
    expect(body()!.contains(card)).toBe(true);
  });

  it('⭐ §VIEW-SWITCHER-ON-THE-VIEW survives the host change — off the panel, on the view', () => {
    // Founder 2026-09-06: *"we DON'T need the plan view / 3D view etc. on the panel — that
    // … SHOULD BE CENTRED ON THE VIEW"*. BOTH halves of that move are asserted, because
    // asserting only the first would pass with the control deleted.
    expect(body()!.querySelector('[data-testid="view-segment-switcher"]')).toBeNull();
    const bar = document.querySelector<HTMLElement>('[data-testid="view-switcher-on-view"]');
    expect(bar, 'the on-view bar did not mount').not.toBeNull();
    expect(bar!.parentElement).toBe(document.body); // not a descendant of the panel
    const segs = bar!.querySelectorAll('[data-testid="view-segment-switcher"] button[data-view-segment]');
    // Counted from the ONE panel definition, never hard-coded here.
    expect(segs).toHaveLength(VIEW_SEGMENTS.length);
    // ⛔ NO DEAD CLICKS (L-1187) — and the honest invariant is "live OR refused with a
    // reason", not "all live". Rows whose entry point this fake host does not register are
    // correctly DISABLED and must SAY so.
    for (const s of segs) {
      const b = s as HTMLButtonElement;
      if (b.disabled) {
        expect(b.getAttribute('data-view-segment-unavailable')).toBe('true');
        expect(b.title.length, `${b.getAttribute('data-view-segment')} refused without a reason`)
          .toBeGreaterThan(0);
      }
    }
    // …and the SPLIT choice, which is a layout and not a seventh view.
    expect(bar!.querySelector('[data-testid="view-switcher-split"]')).not.toBeNull();
  });

  it('a segment click reaches the SAME registered entry point the GIS bar drives', () => {
    // ⛔ The segment IDS are not hard-coded: they belong to `viewPanelOptions()`, and this
    // surface only HOSTS them. The two ACTIONS are what this test is about.
    const bar = document.querySelector<HTMLElement>('[data-testid="view-switcher-on-view"]')!;
    const seg = (actionId: string): HTMLButtonElement => {
      const def = VIEW_SEGMENTS.find((sd) => sd.actionId === actionId);
      expect(def, `no segment dispatches ${actionId}`).toBeDefined();
      return bar.querySelector<HTMLButtonElement>(`button[data-view-segment="${def!.id}"]`)!;
    };
    seg('site.globe').click();
    seg('site.earth').click();
    expect(viewCalls).toEqual(['pryzmShowSiteResultView(3D)', 'pryzmEnterSiteView(3d)']);
  });

  it('⭐ the status line says HOSTED, and carries the lede the retired tab owned', () => {
    const status = el().querySelector('.anl-status')!.textContent ?? '';
    // C19 §5.6 clause 1 at the status line: this surface computes NOTHING.
    expect(status).toContain('nothing on this panel is computed here');
    expect(status).toContain('read those, not this line');
    // ⛔ It must NOT borrow Analysis's census sentence, which would be a claim about a
    // census this surface never ran.
    expect(status).not.toContain('every declared source read');
    // ⭐ C115 `C115-01` — the retired tab's `lede` moved with the panel, verbatim.
    expect(status).toContain(SITE_SURFACE_LEDE);
  });

  it('⭐ a model commit REPAINTS the body — it never remounts it and never bounces the card', async () => {
    const before = body()!;
    const callsBefore = seamCalls.length;
    // The production trigger: a DOM event the surface debounces (350 ms) into refresh().
    window.dispatchEvent(new Event('level-changed'));
    await new Promise((r) => setTimeout(r, 450));
    expect(body(), 'the body was remounted (a different node) instead of repainted').toBe(before);
    // No hand-back, no re-claim: the seam was not touched by the refresh.
    expect(seamCalls.length, 'the refresh bounced the singleton through the seam').toBe(callsBefore);
    expect(before.contains(card)).toBe(true);
    const status = el().querySelector('.anl-status')!.textContent ?? '';
    expect(status).toContain('Repainted in');
    expect(status).toContain('nothing on this panel is computed here');
  });

  it('⭐ leaving the mode tears the body down and hands the card back ONLY because it still held it', async () => {
    const before = seamCalls.length;
    bus.emit('pryzm-workspace-mode', { mode: 'author' });
    await tick();
    expect(el().classList.contains('ste-surface--visible')).toBe(false);
    expect(body()).toBeNull();
    // Exactly one hand-back — the null call — and the card is back in the viewport rather
    // than stranded inside a hidden-but-attached surface.
    expect(seamCalls.slice(before)).toEqual([null]);
    expect(card.parentElement).toBe(viewport);
    expect(el().contains(card)).toBe(false);
  });

  it('⛔ NEVER evicts another host that claimed the card since — no null call on leaving then', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'site' });
    await until(() => body()?.contains(card) === true);
    expect(body()!.contains(card)).toBe(true);
    // The GIS rail PARCEL panel (say) claims it while the Site mode is open.
    const other = document.createElement('div');
    document.body.appendChild(other);
    window.pryzmMountEnvelopeCard!(other);
    const before = seamCalls.length;
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    await tick();
    expect(seamCalls.length, "the panel reached into another host's claim").toBe(before);
    expect(card.parentElement).toBe(other);
    other.remove();
    viewport.appendChild(card);
  });

  it('any other mode hides it again, and a hidden surface holds no card', async () => {
    bus.emit('pryzm-workspace-mode', { mode: 'site' });
    await until(() => el().contains(card));
    expect(el().contains(card)).toBe(true);
    bus.emit('pryzm-workspace-mode', { mode: 'data' });
    await tick();
    expect(el().classList.contains('ste-surface--visible')).toBe(false);
    expect(body()).toBeNull();
    expect(card.parentElement).toBe(viewport);
  });
});

// ── ARM C — reachability: the wiring whose silent loss leaves a tested-but-dead panel ──

describe('§SITE-IS-A-MODE ARM C — committed is not the same as reachable', () => {
  it('engineLauncher side-effect imports the surface, or nothing ever constructs it', () => {
    expect(read('apps/editor/src/engine/engineLauncher.ts')).toContain("import '../ui/site/SiteSurface'");
  });

  it('⭐ the runtime-event flush runs BEFORE restoreFromStorage', () => {
    // `SiteSurface` is a module-load singleton, so its subscription is QUEUED by
    // `onRuntimeEvent()` and only applies at `flushRuntimeEventListeners()`.
    // `restoreFromStorage()` is what emits `pryzm-workspace-mode` at boot for a user whose
    // saved mode is `site`. If restore ever moved AHEAD of the flush, that user would land
    // in Site mode with a 50 % canvas and NO panel beside it — the whole feature, silently
    // absent, with every unit test still green.
    const src = read('apps/editor/src/engine/engineLauncher.ts');
    const flushAt = src.indexOf('flushRuntimeEventListeners()');
    const restoreAt = src.indexOf('workspaceController.restoreFromStorage()');
    expect(flushAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeGreaterThan(-1);
    expect(flushAt, 'restoreFromStorage now runs BEFORE the flush — the Site panel will not appear at boot')
      .toBeLessThan(restoreAt);
  });

  it('⛔ WorkspaceController lays the site mode out EXPLICITLY (the switch has no default)', () => {
    // The canvas half is registry-driven; the WORKBENCH half is a per-mode branch with no
    // `default` arm, so a mode missing from it keeps the DataWorkbench in whatever state the
    // previous mode left it — Data → Site would render a full-width workbench over this panel.
    expect(read('apps/editor/src/ui/WorkspaceController.ts')).toContain("case 'site':");
  });

  it("⛔ InspectModeCoordinator's ENUMERATED mode list includes site, or Inspect's ghost survives it", () => {
    // That file's own comment: *"This is an ENUMERATED mode list. Adding a … workspace mode
    // without adding it here reproduces the bug silently — the `else` does nothing."*
    // Entering Site FROM Inspect would otherwise leave the cyan ghost painted over the model
    // with the level explode still active.
    const src = read('apps/editor/src/engine/inspect/InspectModeCoordinator.ts');
    expect(src).toMatch(/mode === 'author' \|\| mode === 'data' \|\| mode === 'site'/);
  });

  it('the ste- stylesheet is concatenated into the injected theme', () => {
    const theme = read('apps/editor/src/ui/styles/AppTheme.ts');
    expect(theme).toContain("from './panels/siteSurface'");
    expect(theme).toContain('+ SITE_SURFACE_STYLES');
  });

  it('⛔ there is exactly ONE live mountParcelLawTab host in the shell', () => {
    // Two live parcel panels would be precisely the duplication C115 was opened to remove,
    // and the envelope card is a SINGLETON two hosts would bounce between (C19 §5.7).
    // Comment lines are stripped so a comment that merely NAMES the function cannot satisfy
    // — or violate — this arm.
    const strip = (src: string): string => src
      .split('\n')
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
      })
      .join('\n');
    expect(strip(read('apps/editor/src/ui/site/SiteSurface.ts'))).toContain('mountParcelLawTab(');
    expect(
      strip(read('apps/editor/src/ui/analysis/AnalysisSurface.ts')),
      'AnalysisSurface still mounts the parcel body — the panel was COPIED, not moved',
    ).not.toContain('mountParcelLawTab');
  });
});
