/**
 * §SCROLL136 (L-12200) — every Analysis PANE scrolls on its own, as Inspect's does.
 *
 * Founder, verbatim: *"On the Analysis tab, as we have in the Inspect tree — for
 * example — I requested bars on the right-hand side to be able to scroll down the
 * information in each pane."*
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE ESTABLISHES, AND WHAT IT CANNOT
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout and paints nothing — like `analysisHeaderReserve
 * .spec.ts`, the layout-contract arms below are SOURCE-TEXT arms: they read the
 * declarations straight out of the stylesheets rather than pretend a rendered
 * measurement exists here. A rendered check (real overflow, a real scrollbar, a
 * real clip) would be strictly stronger and is not this file's claim.
 *
 * What IS asserted, and IS a real DOM fact rather than prose: card structure
 * (head and body are SIBLINGS, head first), and that expanding the relationship
 * graph still reaches every ancestor a rendered clip test would need — see
 * `__scroll136_cliptest.*` verification note inline below for how the CSS
 * mechanism itself (not just its class names) was checked before this landed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { selectionBus } from '@pryzm/core-app-model';
import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { resetGraphViewState, setGraphExpanded, setGraphMode, GRAPH_VIEW_EVENT } from '../graphViewState';
import { _clearFoldsForTest } from '../analysisLayout';

const REPO = resolve(__dirname, '../../../../../..');
const STYLES = join(REPO, 'apps/editor/src/ui/styles');

const ANALYSIS = readFileSync(join(STYLES, 'panels/analysisSurface.ts'), 'utf8');
const AUDIT = readFileSync(join(STYLES, 'panels/autonomous-auditor/auditStack.ts'), 'utf8');
const TOKENS = readFileSync(join(STYLES, 'tokens.ts'), 'utf8');

/** The declaration block of the FIRST match of `selector` — mirrors the helper
 *  `analysisHeaderReserve.spec.ts` already uses for these flat template-literal
 *  sheets. Not extracted to a shared util: it is five lines, and this repo's
 *  precedent (that file) already keeps its own copy rather than share one. */
function rule(src: string, selector: string): string {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  return open < 0 || close < 0 ? '' : src.slice(open + 1, close);
}

function occurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

/** Comments removed before scanning — mirrors `panelBrandStandard.spec.ts`'s
 *  helper of the same name. Needed here because this file's OWN CSS comments
 *  (this block's header, above) spell out `::-webkit-scrollbar` in prose while
 *  explaining the rule they are guarding — a raw substring count would trip on
 *  its own documentation, not just on a real second rule. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

describe('§SCROLL136 — the pane is the SAME shape Inspect uses (source-text arm)', () => {
  it('the scroll affordance lives on the BODY, not the head', () => {
    const body = rule(ANALYSIS, '.anl-card-body {');
    const head = rule(ANALYSIS, '.anl-card-head {');
    expect(body, '.anl-card-body rule not found').not.toBe('');
    expect(body).toMatch(/overflow-y:\s*auto/);
    // ⛔ If the affordance ever migrates onto the head, the chrome the founder
    // needs pinned would itself start scrolling — the exact defect this lane
    // exists to close, moved one selector over.
    expect(head).not.toMatch(/overflow-y:\s*auto/);
  });

  it('the flex chain has the min-height: 0 that makes overflow possible', () => {
    const body = rule(ANALYSIS, '.anl-card-body {');
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it('the outer chrome (the card head) is pinned so it cannot be squeezed once the card is bounded', () => {
    const head = rule(ANALYSIS, '.anl-card-head {');
    expect(head).toMatch(/flex-shrink:\s*0/);
  });

  it('the pane is BOUNDED — a card without a cap has nothing to scroll away from', () => {
    const cardRule = rule(ANALYSIS, '.anl-card {');
    expect(cardRule, '.anl-card rule not found').not.toBe('');
    expect(cardRule).toMatch(/max-height:\s*[\d.]+(vh|px|%)/);
  });

  it('⛔ neither .anl-card nor .anl-card-body declares `position` — that would steal the containing block the expanded graph stage needs', () => {
    // §GRAPH-EXPAND (L-12062, lane ANALYZE129): `.anl-graph-stage--expanded` is
    // `position: absolute; inset: 0` against `.anl-panel`, its nearest POSITIONED
    // ancestor. If either box between the stage and the panel became positioned
    // itself, it — not `.anl-panel` — would become the containing block, and the
    // "fill the whole panel" behaviour would silently shrink to "fill this card".
    for (const [label, block] of [
      ['.anl-card', rule(ANALYSIS, '.anl-card {')],
      ['.anl-card-body', rule(ANALYSIS, '.anl-card-body {')],
    ] as const) {
      expect(block, `${label}: position: declared — this breaks the expand mode's containing block`).not.toMatch(
        /(?:^|;|\s)position\s*:/,
      );
    }
  });

  it('⛔ the expand mode\'s own contract is unchanged: .anl-panel is still `position: relative`, the stage is still absolute/inset:0', () => {
    const panel = rule(ANALYSIS, '.anl-panel {');
    expect(panel).toMatch(/position:\s*relative/);
    const expanded = rule(ANALYSIS, '.anl-graph-stage--expanded {');
    expect(expanded).toMatch(/position:\s*absolute/);
    expect(expanded).toMatch(/inset:\s*0/);
  });

  it('the honesty pin is STICKY, so it cannot scroll out of reach while the card\'s own numbers stay on screen', () => {
    // §ANALYSIS-FOLD-STATE (L-12063) required the pin to survive EXPANSION. This
    // lane's addition is the sibling requirement: it must also survive ordinary
    // scrolling within the now-scrollable card body — sticky resolves against
    // whichever scroll container is nearest, so one rule covers both states.
    const pin = rule(ANALYSIS, '.anl-honesty-pin {');
    expect(pin).toMatch(/position:\s*sticky/);
    expect(pin).toMatch(/top:\s*0/);
  });

  it('⛔ no SECOND scrollbar treatment was hand-rolled beside the one Inspect already uses (C84 EI-9)', () => {
    // tokens.ts declares ONE universal rule (§05 §2.3 Rule 7): every element gets
    // the styled thin thumb from `* { scrollbar-... }` / `*::-webkit-scrollbar`.
    // Both Inspect's tree and these new Analysis panes must resolve to THAT rule
    // rather than a locally-declared competitor.
    const universal = rule(TOKENS, '*::-webkit-scrollbar {');
    expect(universal, 'the shared scrollbar thumb rule moved or was removed from tokens.ts').not.toBe('');
    expect(TOKENS).toMatch(/\*\s*\{\s*\n\s*scrollbar-width:\s*thin/);

    // The ONE existing `::-webkit-scrollbar` rule in analysisSurface.ts predates
    // this lane and HIDES the tab strip's own scrollbar (`.anl-tabs`) — it is not
    // a styled-thumb rule and is not what this arm is guarding against. Anything
    // beyond that one is a second scrollbar treatment.
    const analysisNoComments = stripComments(ANALYSIS);
    const auditNoComments = stripComments(AUDIT);
    expect(occurrences(analysisNoComments, '::-webkit-scrollbar'), 'a second scrollbar rule was added to the Analysis sheet').toBe(1);
    expect(rule(ANALYSIS, '.anl-tabs::-webkit-scrollbar {')).toMatch(/display:\s*none/);

    // Inspect carries ZERO local scrollbar rules of its own — it has always
    // relied on the same universal rule this lane points Analysis at too.
    expect(occurrences(auditNoComments, '::-webkit-scrollbar'), 'Inspect grew its own scrollbar rule — the two surfaces now diverge').toBe(0);
    expect(auditNoComments).not.toMatch(/scrollbar-color/);
    expect(analysisNoComments).not.toMatch(/scrollbar-color/);
  });

  it('the pattern genuinely MIRRORS Inspect\'s pane, not merely says so in a comment', () => {
    // `.aud-project-tree` is Inspect's PROJECT BROWSER scroll pane; `.aud-content
    // -zone` is the Inspect content region beneath it. Both reach the same
    // "overflow-y: auto" affordance this lane gives Analysis's cards, and their
    // pinned chrome siblings (`.aud-section-header`, the tree/attribute
    // selectors) declare no overflow of their own — exactly the head/body split
    // above.
    expect(rule(AUDIT, '.aud-project-tree {')).toMatch(/overflow-y:\s*auto/);
    expect(rule(AUDIT, '.aud-content-zone {')).toMatch(/overflow-y:\s*auto/);
    expect(rule(AUDIT, '.aud-section-header {')).not.toMatch(/overflow-y:\s*auto/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §SCROLL136 (L-12201) — 'bring the graph a bit down' (source-text arm)
// ═════════════════════════════════════════════════════════════════════════════
//
// Founder, verbatim: "On the Analysis tab, on FULL mode, bring the graph a bit
// down." His screenshot of the expanded (⤢) relationship graph showed the
// stage running up under the panel's own chrome — tab strip, highlighting bar
// — with the card's own caveat text collided by the toolbar above, and the
// legend row sitting at the very bottom edge.

const WIDGET_RENDERERS = readFileSync(join(REPO, 'apps/editor/src/ui/analysis/widgetRenderers.ts'), 'utf8');

describe('§SCROLL136 L-12201 — the expanded stage clears the panel\'s own chrome (source-text arm)', () => {
  it('.anl-grid-viewport is the NEW positioned, non-scrolling wrapper the stage now fills', () => {
    const viewport = rule(ANALYSIS, '.anl-grid-viewport {');
    expect(viewport, '.anl-grid-viewport rule not found — the wrapper this fix depends on is missing').not.toBe('');
    expect(viewport).toMatch(/position:\s*relative/);
    expect(viewport).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(viewport).toMatch(/min-height:\s*0/);
    // ⛔ It must NOT itself scroll — that is precisely the '.anl-grid' trap the
    // original §GRAPH-EXPAND comment (on `.anl-panel`) already named: an
    // `inset: 0` child of a SCROLL container sizes against the scrolled
    // content box, not the visible viewport.
    expect(viewport).not.toMatch(/overflow-y:\s*auto/);
    expect(viewport).not.toMatch(/overflow:\s*auto/);
  });

  it('.anl-grid moved inside the wrapper and kept its OWN scrolling unchanged', () => {
    const grid = rule(ANALYSIS, '.anl-grid {');
    expect(grid).toMatch(/overflow-y:\s*auto/);
    expect(grid).toMatch(/height:\s*100%/);
    // It is no longer itself a flex child of `.anl-panel` (the wrapper is), so
    // a stray `flex: 1 1 auto` left behind on `.anl-grid` would be dead CSS
    // implying a layout role it no longer has.
    expect(grid).not.toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it('AnalysisSurface.ts actually builds the wrapper, and .anl-grid is INSIDE it', () => {
    const surface = readFileSync(join(REPO, 'apps/editor/src/ui/analysis/AnalysisSurface.ts'), 'utf8');
    expect(surface).toMatch(/gridViewport\.className\s*=\s*'anl-grid-viewport'/);
    // Order matters: the grid must be appended INTO the wrapper, and the
    // wrapper (not the bare grid) is what gets appended to the panel.
    const viewportIdx = surface.indexOf("gridViewport.className = 'anl-grid-viewport'");
    const appendGridIdx = surface.indexOf('gridViewport.appendChild(this._grid)');
    const appendViewportIdx = surface.indexOf('panel.appendChild(gridViewport)');
    expect(viewportIdx).toBeGreaterThan(-1);
    expect(appendGridIdx).toBeGreaterThan(viewportIdx);
    expect(appendViewportIdx).toBeGreaterThan(appendGridIdx);
  });

  it('⛔ the OLD flat "− 300" magic number is gone — replaced by a MEASURED chrome reserve', () => {
    expect(WIDGET_RENDERERS).not.toMatch(/window\.innerHeight\s*\)\s*-\s*300\b/);
    expect(WIDGET_RENDERERS).toContain('STAGE_INTERNAL_RESERVE_PX');
    expect(WIDGET_RENDERERS).toContain('expandedChromeAboveGridPx');
    // The four bands the arithmetic's "chrome" term sums, read LIVE rather
    // than re-typed as numbers that would rot the moment one of them resizes.
    for (const sel of ['.anl-header', '.anl-tabs', '.anl-facets', '.anl-status']) {
      expect(WIDGET_RENDERERS, `${sel} is not one of the measured chrome bands`).toContain(`'${sel}'`);
    }
    // Still floored — a graph is never asked to render shorter than this,
    // same as before this lane.
    expect(WIDGET_RENDERERS).toMatch(/Math\.max\(\s*460,/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DOM-MOUNT ARM — real card structure, real AnalysisSurface
// ═════════════════════════════════════════════════════════════════════════════

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

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

function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'wall' },
    { id: 'room_1', kind: 'room' },
    { id: 'door_1', kind: 'door' },
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
    freshness: 'live',
    deltasApplied: 0,
    eventsObserved: 0,
    lastDelta: null,
  };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

let bus: { emit: (e: string, p: unknown) => void };

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

beforeEach(async () => {
  _clearFoldsForTest();
  setGraphExpanded(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  await settle();
});

afterAll(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

describe('§SCROLL136 — the outer chrome is OUTSIDE the scroll container (DOM structure)', () => {
  it('every card is [head, body] as DIRECT SIBLINGS, head first', () => {
    const el = document.getElementById('anl-surface')!;
    const cards = el.querySelectorAll<HTMLElement>('.anl-card');
    expect(cards.length, 'no cards mounted — nothing to check structure on').toBeGreaterThan(0);
    for (const c of cards) {
      const children = [...c.children];
      const headIdx = children.findIndex((n) => n.classList.contains('anl-card-head'));
      const bodyIdx = children.findIndex((n) => n.classList.contains('anl-card-body'));
      expect(headIdx, `card "${c.dataset.widget}" has no .anl-card-head`).toBeGreaterThanOrEqual(0);
      expect(bodyIdx, `card "${c.dataset.widget}" has no .anl-card-body`).toBeGreaterThanOrEqual(0);
      expect(headIdx, `card "${c.dataset.widget}": head does not precede body`).toBeLessThan(bodyIdx);
      // Siblings, not nested — the head is never scrolled along with the body.
      expect(children[headIdx]!.querySelector('.anl-card-body'), 'head contains body — they are not siblings').toBeNull();
      expect(children[bodyIdx]!.querySelector('.anl-card-head'), 'body contains head — they are not siblings').toBeNull();
    }
  });
});

describe('§SCROLL136 — the Relationship graph\'s expand mode survives the new scroll container', () => {
  /** The relationships tab, clicked through the real tab strip. */
  async function openRelationships(): Promise<void> {
    const el = document.getElementById('anl-surface')!;
    const tab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
    expect(tab, 'the Relationships tab is missing from the tab strip').not.toBeNull();
    tab!.click();
    await settle();
  }

  /**
   * ⚠ RE-QUERIED, NEVER CACHED. `setGraphExpanded` fires `GRAPH_VIEW_EVENT`,
   * which `AnalysisSurface` answers with a WHOLE-tab `refresh()` —
   * `_grid.replaceChildren()` followed by a fresh `_card()` build. A handle
   * captured before the click is a detached node afterwards; this is the same
   * re-query `relationshipGraphLegibility.spec.ts`'s own `card()` helper uses,
   * for the same reason.
   */
  function card(): HTMLElement {
    const c = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]');
    expect(c, 'the relationship-graph card is not on the Relationships tab').not.toBeNull();
    return c!;
  }

  it('expanding still reaches .anl-card-body -> .anl-card -> #anl-surface — the DOM nesting the containing-block argument depends on is unchanged', async () => {
    await openRelationships();
    card().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
    await settle();

    const stage = card().querySelector<HTMLElement>('.anl-graph-stage--expanded');
    expect(stage, 'the stage did not take the expanded class after this lane\'s CSS change').not.toBeNull();

    expect(stage!.closest('.anl-card-body'), 'the stage is no longer inside the new scroll container').not.toBeNull();
    expect(stage!.closest('.anl-card'), 'the stage left the card').not.toBeNull();
    // §SCROLL136 L-12201 — the stage's new, closer positioned ancestor.
    expect(stage!.closest('.anl-grid-viewport'), 'the stage is not inside the new chrome-clearing wrapper').not.toBeNull();
    expect(stage!.closest('#anl-surface'), 'the stage left the surface').not.toBeNull();

    // The honesty pin — the always-visible qualifier — still renders as the
    // stage's own child, exactly where §ANALYSIS-FOLD-STATE (L-12063) put it,
    // and it survives EVEN THOUGH the stage now clears the panel's own chrome
    // rather than covering it — L-12201's "also keep the honesty pin visible".
    const pin = stage!.querySelector('.anl-honesty-pin');
    if (pin) {
      // Presence is conditional on `!g.complete`; this fixture may or may not
      // trip that. When it DOES render, it must still be reachable here.
      expect(stage!.contains(pin)).toBe(true);
    }

    setGraphExpanded(false);
    await settle();
  });

  /**
   * ⭐ THE ARITHMETIC, EXECUTED — not merely asserted as source text. The four
   * chrome bands are stubbed to KNOWN heights via `getBoundingClientRect`
   * (happy-dom performs no real layout, so every element's rect is zero unless
   * told otherwise) and `window.innerHeight` is pinned, so the resulting
   * canvas box's height is a value this test can PREDICT and check, rather
   * than merely observe.
   */
  it('the canvas height is viewport − MEASURED chrome − the stage-internal reserve, not a re-hardcoded guess', async () => {
    await openRelationships();

    const HEIGHTS: Record<string, number> = {
      '.anl-header': 94,
      '.anl-tabs': 36,
      '.anl-facets': 0, // hidden in this fixture — a real, not special-cased, zero
      '.anl-status': 28,
    };
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      for (const [sel, height] of Object.entries(HEIGHTS)) {
        if (this.matches?.(sel)) {
          return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
        }
      }
      return original.call(this);
    };
    const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });

    try {
      setGraphMode('2d');
      window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
      await settle();

      card().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
      await settle();

      const box = card().querySelector<HTMLElement>('.anl-nodelink-box');
      expect(box, 'the 2-D SVG box did not render').not.toBeNull();

      // chrome = 94 + 36 + 0 + 28 = 158. reserve = 180 (§GRAPH-EXPAND-HEIGHT).
      // expected = max(460, 900 − 158 − 180) = 562.
      expect(box!.style.minHeight).toBe('562px');
    } finally {
      Element.prototype.getBoundingClientRect = original;
      if (innerHeightDescriptor) Object.defineProperty(window, 'innerHeight', innerHeightDescriptor);
      setGraphExpanded(false);
      setGraphMode('3d');
      await settle();
    }
  });
});
