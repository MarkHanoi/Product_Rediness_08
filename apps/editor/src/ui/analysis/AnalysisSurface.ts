/**
 * AnalysisSurface — the F4 workspace mode's right-hand half.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/AnalysisSurface.ts
 * CSS prefix:      anl-   (claimed here; sheet at styles/panels/analysisSurface.ts)
 * ADR:             ADR-0343 — §D.1 (a MODE, not a bucket) · §D.3 (widget contract)
 *                  §D.5 (colour) · §D.6 (honesty)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS
 * Contracts:       C27 §6 (this is its delivery vehicle) · C06 · C10 §1 · C66 §1.1
 * Issue log:       L-3010
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A FIXED RIGHT-50% PANEL AND NOT A DATA-WORKBENCH BUCKET
 * ═════════════════════════════════════════════════════════════════════════════
 * ADR-0343 §D.1, reason 2 — and it is structural, not aesthetic:
 *
 *   Every widget in the founder's reference screenshots is a SELECTOR. Click a
 *   donut segment, see those elements. In `data` mode the 3-D canvas is
 *   `display:none`. A dashboard inside the DataWorkbench is therefore a
 *   dashboard that cannot highlight what it is describing.
 *
 * So the Analysis surface mounts exactly the way `inspect` mounts `AuditStack`:
 * `position: fixed; right: 0; width: 50%`, shown on `pryzm-workspace-mode` when
 * the mode is `analysis`, with the canvas held at 50% on the left by
 * `WorkspaceController` reading the mode registry.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE — WHAT IS ACTUALLY GUARANTEED, WHICH IS LESS THAN "AMAZING"
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ C66 §1.1 by analogy: nothing here is BENCHED, so every cost label the cards
 * render says CLAIMED. What IS structurally true and can be read off the code:
 *   • nothing recomputes while the surface is hidden — every listener returns
 *     early on `!_visible`;
 *   • the census runs ONCE per invalidation and is shared by every widget on
 *     screen (the query cache is keyed on the descriptor, not the widget);
 *   • take-off widgets are `refresh: 'manual'` — an O(n·m) scan never runs
 *     because a wall moved;
 *   • ⛔ nothing here calls `requestAnimationFrame` and Chart.js animation is
 *     disabled, so a dashboard can never be the reason a frame is dropped (P3).
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — the only outbound model call is a selection dispatch, which is
 * intent, not mutation. One OTel span per exported function (P8).
 */

import type { Chart } from 'chart.js';

import { selectionBus } from '@pryzm/core-app-model';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

import { onRuntimeEvent } from '../../engine/runtimeEventBridge';

import { ANALYSIS_TABS, type AnalysisResult, type AnalysisTabId, type AnalysisWidgetDef } from './AnalysisTypes';
import { invalidateAnalysisReadModel, runQuery, censusSourceTable } from './analysisReadModel';
import {
  adoptCatalogueAsKnown,
  defaultLayout,
  loadLayout,
  reconcileLayout,
  saveLayout,
  type AnalysisLayout,
} from './analysisLayout';
import { WIDGET_CATALOGUE, widgetById } from './widgetCatalogue';
import {
  FACETS_EVENT,
  activeFacets,
  applyFacets,
  clearFacets,
  describeResolution,
  removeFacet,
  resolveFacets,
} from './selectionFacets';
import {
  AREA_STANDARD_EVENT,
  GRAPH_SCOPE_EVENT,
  disposeGraphViewport,
  completenessStrip,
  renderChart,
  renderGraph,
  renderCoverage,
  renderKpi,
  renderNotBuilt,
  renderTable,
  renderTreemap,
  renderUnknownWidget,
} from './widgetRenderers';
import { GRAPH_VIEW_EVENT } from './graphViewState';

type ChartJS = typeof import('chart.js');

const REFRESH_DEBOUNCE_MS = 350;

/**
 * How each facet axis reads on a chip. §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6603).
 *
 * ⛔ These are the READER'S words for the axis, not the query vocabulary's.
 * `category` is what the read model calls it; "Family" is what an architect
 * calls it, and the chip is read by the architect. The `AnalysisAxis` union
 * stays the authority — this table only renames it at the glass.
 */
const FACET_AXIS_LABEL: Readonly<Record<string, string>> = Object.freeze({
  category:     'Family',
  level:        'Storey',
  type:         'Type',
  chapter:      'Chapter',
  unit:         'Take-off line',
  relationship: 'Relation',
});

export class AnalysisSurface {
  private _el!: HTMLElement;
  private _grid!: HTMLElement;
  private _status!: HTMLElement;
  private _tabBar!: HTMLElement;
  /** §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6603) — the chip bar. An invisible
   *  filter is a bug generator, so the active facets are always ON SCREEN. */
  private _facetBar!: HTMLElement;
  /** The active tab's one-line lede. §C06 §6.1 — it is part of the status
   *  line now, not a fourth stacked band. Held as a string, not an element. */
  private _tabLedeText = '';
  private _visible = false;
  private _chartjs: ChartJS | null = null;
  private _chartLoadFailed = false;
  private _charts: Chart[] = [];
  private _layout: AnalysisLayout;
  private _debounce: ReturnType<typeof setTimeout> | null = null;
  private _pickerOpen = false;

  constructor() {
    this._layout = loadLayout();
    this._buildDOM();
    this._bindEvents();
    console.log('[AnalysisSurface] mounted — F4, ADR-0343');
  }

  get element(): HTMLElement {
    return this._el;
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────

  private _buildDOM(): void {
    this._el = document.createElement('div');
    this._el.id = 'anl-surface';
    this._el.setAttribute('role', 'region');
    this._el.setAttribute('aria-label', 'Analysis');

    const panel = document.createElement('div');
    panel.className = 'anl-panel';

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'anl-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'anl-title-wrap';
    const title = document.createElement('span');
    title.className = 'anl-title';
    title.textContent = 'ANALYSIS';
    const sub = document.createElement('span');
    sub.className = 'anl-title-sub';
    sub.textContent = 'Every figure traceable to elements — click any of them';
    titleWrap.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'anl-header-actions';

    const addBtn = this._headerButton('anl-add', '＋  Add widget', 'Add a widget to this dashboard');
    const refreshBtn = this._headerButton('anl-refresh', '↺', 'Recompute every widget, including the manual take-off ones');
    const resetBtn = this._headerButton('anl-reset', '⟲', 'Reset this dashboard to the default arrangement');
    const provBtn = this._headerButton('anl-prov', 'ⓘ', 'Show which stores this surface counts');
    actions.append(addBtn, refreshBtn, resetBtn, provBtn);

    header.append(titleWrap, actions);
    panel.appendChild(header);

    // ── Tab strip ───────────────────────────────────────────────────────────
    // §ANALYSIS-TABS (L-3304). Sits ABOVE the status strip deliberately: the
    // strip reports the tab beneath it, so it must read as belonging to the
    // selected tab rather than to the surface as a whole.
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'anl-tabs';
    this._tabBar.setAttribute('role', 'tablist');
    this._tabBar.setAttribute('aria-label', 'Analysis sections');
    panel.appendChild(this._tabBar);


    // ── Facet bar (§FEAT-ANALYSIS-FACET-CROSS-FILTER, L-6603) ───────────────
    //
    // ⭐ THIS BAR IS NOT DECORATION — IT IS THE OTHER HALF OF THE FEATURE.
    //
    // A cross-filter the reader cannot see is worse than no cross-filter: every
    // card on the surface still prints the WHOLE model's figures (the filter
    // narrows the 3-D emphasis, not the denominators — see ADR-0358 §3), so a
    // forgotten facet means a reader looking at "312 walls" while 47 are purple
    // and nothing explains the difference. The bar states every active facet,
    // each facet's own count, and the intersection.
    //
    // Placed BETWEEN the tabs and the status strip on purpose: the facets apply
    // across every tab (they are module state in `selectionFacets`), so the bar
    // must not read as belonging to the tab beneath it — but it MUST sit above
    // the status line, which reports the tab it captions.
    //
    // ⚠ `hidden` when empty rather than rendered as an empty row: a permanently
    // visible "no filters" strip is chrome that teaches the reader to stop
    // looking at that band, which is precisely the habit this bar needs to break.
    this._facetBar = document.createElement('div');
    this._facetBar.className = 'anl-facets';
    this._facetBar.setAttribute('role', 'status');
    this._facetBar.setAttribute('aria-live', 'polite');
    this._facetBar.setAttribute('aria-label', 'Active element filters');
    this._facetBar.hidden = true;
    panel.appendChild(this._facetBar);

    // ── Status strip ────────────────────────────────────────────────────────
    this._status = document.createElement('div');
    this._status.className = 'anl-status';
    panel.appendChild(this._status);

    // ── Widget grid ─────────────────────────────────────────────────────────
    this._grid = document.createElement('div');
    this._grid.className = 'anl-grid';
    panel.appendChild(this._grid);

    this._el.appendChild(panel);
    document.body.appendChild(this._el);

    addBtn.addEventListener('click', () => this._togglePicker());
    refreshBtn.addEventListener('click', () => { invalidateAnalysisReadModel(); void this.refresh(); });
    resetBtn.addEventListener('click', () => {
      // Resets EVERY tab, and lands on Overview. A reset that silently spared
      // the tabs the user could not see would leave the dashboard in a state no
      // single action produced.
      this._layout = defaultLayout();
      saveLayout(this._layout);
      this._buildTabs();
      void this.refresh();
    });
    provBtn.addEventListener('click', () => this._toggleProvenance());

    this._buildTabs();
  }

  /**
   * Draw the active-facet chips. One chip per AXIS — the data structure in
   * `selectionFacets` cannot hold two on one axis, so this cannot render two.
   *
   * ⛔ `textContent`, never `innerHTML`: a facet label is model-derived and
   * element ids/type names originate in imported IFC/glTF files
   * (§DW-MATERIAL-COLOR-XSS, L-407).
   */
  private _renderFacetBar(): void {
    const facets = activeFacets();
    this._facetBar.replaceChildren();
    this._facetBar.hidden = facets.length === 0;
    if (facets.length === 0) return;

    const lead = document.createElement('span');
    lead.className = 'anl-facets-lead';
    lead.textContent = facets.length === 1 ? 'Highlighting' : 'Highlighting the intersection of';
    this._facetBar.appendChild(lead);

    for (const f of facets) {
      const chip = document.createElement('span');
      chip.className = 'anl-facet-chip';

      // ⭐ THE AXIS IS ON THE CHIP. "Wall" and "Level 1" are both just words; a
      // reader debugging an empty intersection needs to see that one is a FAMILY
      // and the other a STOREY, because that is what tells them the two facets
      // are composable rather than contradictory.
      const axis = document.createElement('span');
      axis.className = 'anl-facet-axis';
      axis.textContent = FACET_AXIS_LABEL[f.axis] ?? f.axis;
      const label = document.createElement('span');
      label.className = 'anl-facet-label';
      label.textContent = f.label;

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'anl-facet-x';
      x.textContent = '✕';
      x.title = `Stop filtering by ${f.label}`;
      x.setAttribute('aria-label', `Remove the ${f.label} filter`);
      x.addEventListener('click', () => removeFacet(f.axis));

      chip.append(axis, label, x);
      this._facetBar.appendChild(chip);
    }

    // ⭐ THE SENTENCE, WITH EVERY OPERAND. `describeResolution` prints each
    // facet's own count beside the intersection, so "Wall (312) ∩ Level 1 (208)
    // -> nothing satisfies all of these" reads as a fact about the building
    // rather than as a broken query. A bare "0 selected" could not.
    const sentence = document.createElement('span');
    sentence.className = 'anl-facets-sentence';
    sentence.textContent = describeResolution(resolveFacets());
    this._facetBar.appendChild(sentence);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'anl-facets-clear';
    clear.textContent = 'Clear all';
    clear.title = 'Remove every filter and return the scene to its unemphasised state';
    clear.addEventListener('click', () => clearFacets());
    this._facetBar.appendChild(clear);
  }

  private _headerButton(id: string, label: string, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'anl-header-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  private _bindEvents(): void {
    // This class is a module-load singleton constructed BEFORE composeRuntime()
    // runs, so a raw window.runtime?.events?.on() here silently no-ops — the
    // §INSPECT-DATA-TAB-WIRE finding AuditStack records. Route through the
    // deferred bridge so the subscription queues and applies at flush.
    onRuntimeEvent('pryzm-workspace-mode', (payload: unknown) => {
      const mode = (payload as { mode?: string })?.mode;
      if (mode === 'analysis') this._show();
      else this._hide();
    });

    // Model mutations invalidate the projection. ⛔ Debounced AND gated on
    // visibility: an invisible dashboard that recomputes on every wall move is
    // a background O(n) scan nobody asked for.
    const invalidate = (): void => {
      invalidateAnalysisReadModel();
      if (!this._visible) return;
      if (this._debounce) clearTimeout(this._debounce);
      this._debounce = setTimeout(() => { void this.refresh(); }, REFRESH_DEBOUNCE_MS);
    };
    onRuntimeEvent('model-updated', invalidate);
    onRuntimeEvent('pryzm-delta-updated', invalidate);
    window.addEventListener('wall:walls-changed', invalidate);
    window.addEventListener('bim-room-added', invalidate);
    window.addEventListener('bim-room-updated', invalidate);
    window.addEventListener('bim-room-removed', invalidate);
    window.addEventListener('level-changed', invalidate);

    // §ANALYSIS-GRAPH-LEVEL-FILTER (L-3620). The storey scope lives in
    // `graphReadModel`, is shared by all three relationship widgets, and is
    // changed by a control inside a card. A renderer must not hold the surface
    // (ADR-0343 §D.3 — a renderer that can reach its host can reach anything the
    // host can), so the control fires an event and the surface owns the redraw.
    //
    // ⛔ NOT routed through `invalidateAnalysisReadModel()`. A scope change makes
    // no census or take-off figure wrong: the graph is not memoised here (the UBG
    // maintains itself on its own cadence) so re-rendering re-projects it, and
    // dropping the census cache would make choosing a storey pay for a full
    // 18-store rescan that changes nothing.
    window.addEventListener(GRAPH_SCOPE_EVENT, () => {
      if (!this._visible) return;
      void this.refresh();
    });

    // §ANALYSIS-AREA-STANDARDS (L-3640) — same shape, same reason. ⛔ Also NOT an
    // invalidation: switching standard changes which CLASSES are asked for, not
    // a single measured figure, so paying for a full rescan would be work with
    // no output difference.
    window.addEventListener(AREA_STANDARD_EVENT, () => {
      if (!this._visible) return;
      void this.refresh();
    });

    // §GRAPH-HIERARCHY-VIEWS / §GRAPH-3D-VIEWPORT (L-8450). ⛔ ALSO NOT an
    // invalidation, and for the same reason as the two above: switching view,
    // switching 2D/3D, moving the node-size slider or changing the focus depth
    // changes HOW the graph is DRAWN, never what any figure on this surface
    // COUNTS. Dropping the census cache here would make choosing a view pay for a
    // full 18-store rescan that changes nothing on screen.
    window.addEventListener(GRAPH_VIEW_EVENT, () => {
      if (!this._visible) return;
      void this.refresh();
    });

    // Selection widgets are `refresh: 'on-selection'` — they alone re-render
    // here, because a selection change does not change any other figure.
    selectionBus.subscribe(() => {
      if (!this._visible) return;
      void this._renderSelectionWidgets();
    });

    // §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6603). ⛔ The chip bar redraws; the
    // WIDGETS DO NOT. A facet narrows the 3-D emphasis, never a card's
    // denominator (ADR-0358 §3) — re-running the queries here would silently
    // turn every total on the surface into a filtered total while the card's own
    // basis line still described the whole model, which is H1 failed at the
    // source layer. The bar is the only thing that changes.
    window.addEventListener(FACETS_EVENT, () => {
      if (!this._visible) return;
      this._renderFacetBar();
    });
  }

  // ── Show / hide ─────────────────────────────────────────────────────────────

  private _show(): void {
    this._visible = true;
    this._el.classList.add('anl-surface--visible');
    this._layout = loadLayout(); // a project switch may have changed it
    this._buildTabs();
    this._renderFacetBar();
    void this.refresh();
  }

  private _hide(): void {
    this._visible = false;
    this._el.classList.remove('anl-surface--visible');
    if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
    // §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6603). ⛔ LEAVING THE WORKSPACE CLEARS
    // THE FACETS, and that is not tidiness. The Analysis lens is the only thing
    // that renders this emphasis; in Author or Inspect the purple is not painted
    // (`setAnalysisSelection` re-applies only under the analysis lens). A filter
    // that is still active but has no visible effect ANYWHERE is the
    // invisible-filter defect in its worst form — the reader returns to the tab
    // later and finds a subset highlighted by a click they made in another
    // session of attention.
    clearFacets();

    // §GRAPH-3D-VIEWPORT (L-8443). ⛔ RELEASE THE SHARED WebGL MOUNT. The 3-D graph
    // registers against the SAME refcount every element showroom uses, and that
    // refcount is what decides when the one offscreen context is released. A
    // viewport left mounted after the workspace closes would pin the context for
    // the life of the tab — and a pinned context still counts against the browser's
    // cap, whose eviction victim is the main viewport.
    disposeGraphViewport();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private async _ensureChartjs(): Promise<void> {
    if (this._chartjs || this._chartLoadFailed) return;
    try {
      // Same lazy import AnalyticsPanel.ts:77 uses — SPEC §5 requires one idiom,
      // picked once. Chart.js is declared at the ROOT package.json (L-2134) and
      // resolves here by hoisting, exactly as it does for that file.
      this._chartjs = await import('chart.js');
      this._chartjs.Chart.register(...this._chartjs.registerables);
    } catch (e) {
      this._chartLoadFailed = true;
      console.warn('[AnalysisSurface] Chart.js failed to load; charts degrade to tables.', e);
    }
  }

  /** Recompute and redraw every widget in the layout. */
  async refresh(): Promise<void> {
    if (!this._visible) return;
    await this._ensureChartjs();
    this._destroyCharts();
    this._grid.replaceChildren();

    // §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9002) — FIRST in the
    // grid, above the cards, because it is about what is MISSING from them.
    const notice = this._reconcileNotice();
    if (notice) this._grid.appendChild(notice);

    const t0 = Date.now();
    let unreachableAcross = 0;
    let anyIncomplete = false;
    const reasonsAcross: string[] = [];

    // P8 — one span per dashboard mount. The attribute set is bounded by the
    // closed widget-kind union and the layout length, never by a model value.
    withHandlerSpan(
      'pryzm.analysis.surface.render',
      {
        'pryzm.surface': 'analysis',
        'pryzm.analysis.widgets': this._activeWidgetIds().length,
        'pryzm.analysis.active_tab': this._layout.activeTab,
      },
      () => {
        // ⭐ ONLY THE ACTIVE TAB COMPUTES. This is the half of §ANALYSIS-TABS
        // that is not cosmetic: `material-*` and `chapter-volume` declare
        // `O(n·m)` and every one of them used to run on every refresh, whether
        // or not the reader had asked a quantity question. A tab the user is not
        // looking at is now not a scan.
        for (const id of this._activeWidgetIds()) {
          const def = widgetById(id);
          if (!def) { this._grid.appendChild(this._card(null, id, (host) => renderUnknownWidget(host, id))); continue; }
          const { card, incomplete, unreachable, reasons } = this._renderWidget(def);
          this._grid.appendChild(card);
          anyIncomplete = anyIncomplete || incomplete;
          unreachableAcross = Math.max(unreachableAcross, unreachable);
          for (const r of reasons) if (!reasonsAcross.includes(r)) reasonsAcross.push(r);
        }
      },
    );

    if (this._activeWidgetIds().length === 0) {
      const empty = document.createElement('div');
      empty.className = 'anl-empty anl-empty--page';
      empty.textContent =
        'This tab has no widgets. That is your arrangement, not a failure — press “Add widget” to compose one.';
      this._grid.appendChild(empty);
    }

    this._setStatus(Date.now() - t0, anyIncomplete, unreachableAcross, reasonsAcross);

    // §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6602). ⭐ RE-RESOLVE, DO NOT RE-READ.
    // A refresh means the model moved (a wall was drawn, a storey added, the
    // project re-opened). The facets hold QUESTIONS, so asking them again yields
    // the answer for the model as it is NOW — which is the whole reason the
    // selection is facets and not a set of ids. A pinned id set would silently
    // shrink here, and the reader would see fewer purple elements with nothing
    // on screen saying why.
    //
    // ⚠ No-op when no facet is active: `applyFacets` dispatches a `clear`, and a
    // clear on an already-empty selection costs one bus fan-out and paints
    // nothing.
    if (activeFacets().length > 0) applyFacets();
    this._renderFacetBar();
  }

  private async _renderSelectionWidgets(): Promise<void> {
    // Only the selection-scoped cards redraw. Everything else is unchanged by a
    // selection, and redrawing it would be work with no output difference.
    for (const id of this._activeWidgetIds()) {
      const def = widgetById(id);
      if (!def || def.refresh !== 'on-selection') continue;
      const old = this._grid.querySelector(`[data-widget="${CSS.escape(id)}"]`);
      if (!old) continue;
      const { card } = this._renderWidget(def);
      old.replaceWith(card);
    }
  }

  private _renderWidget(def: AnalysisWidgetDef): { card: HTMLElement; incomplete: boolean; unreachable: number; reasons: readonly string[] } {
    if (def.notBuilt) {
      return { card: this._card(def, def.id, (host) => renderNotBuilt(host, def.notBuilt!)), incomplete: false, unreachable: 0, reasons: [] };
    }
    if (!def.query) {
      return { card: this._card(def, def.id, (host) => renderUnknownWidget(host, def.id)), incomplete: false, unreachable: 0, reasons: [] };
    }

    let result: AnalysisResult;
    try {
      result = runQuery(def.query, selectionBus.currentIds);
    } catch (e) {
      // ⛔ A refused query renders the REFUSAL, never an empty chart. An empty
      // chart says "no data"; this says which axis could not be projected.
      const message = e instanceof Error ? e.message : String(e);
      return {
        card: this._card(def, def.id, (host) => {
          const strip = document.createElement('div');
          strip.className = 'anl-strip anl-strip--err';
          const span = document.createElement('span');
          span.className = 'anl-strip-text';
          span.textContent = `This widget could not be computed, and is showing you why rather than a zero: ${message}`;
          strip.appendChild(span);
          host.appendChild(strip);
        }),
        incomplete: true,
        unreachable: 0,
        reasons: [],
      };
    }

    const card = this._card(def, def.id, (host) => {
      const strip = completenessStrip(result);
      if (strip) host.appendChild(strip);
      switch (def.kind) {
        case 'kpi':      renderKpi(host, result); break;
        case 'coverage': renderCoverage(host, result); break;
        // ADR-0343 §D.7 — the relational view, on the Analysis surface at last.
        // Its precondition (a StoreEventBus-maintained UBG) is met by L-3251;
        // before that this case could only have drawn a stale picture on a
        // surface the founder reads as live.
        case 'graph':    renderGraph(host, def, result); break;
        case 'table':    renderTable(host, def, result); break;
        case 'treemap':  renderTreemap(host, def, result); break;
        case 'donut':
        case 'bar':
          if (this._chartjs) renderChart(host, this._chartjs, def, result, this._charts);
          // Chart.js absent ⇒ the same figures as a table. A degraded rendering
          // of a real number beats a blank rectangle and a console warning.
          else renderTable(host, def, result);
          break;
        default:
          renderUnknownWidget(host, def.id);
      }
      host.appendChild(this._provenanceFoot(def, result));
    }, result);

    return { card, incomplete: !result.complete, unreachable: result.unreachable.length, reasons: result.incompleteReason };
  }

  /**
   * The per-card footer. ⭐ H1 — every figure names its basis, and the card
   * names its source, its declared cost, what it was computed over, and when.
   * A dashboard whose numbers have no provenance is a screenshot.
   */
  private _provenanceFoot(def: AnalysisWidgetDef, result: AnalysisResult): HTMLElement {
    const foot = document.createElement('div');
    foot.className = 'anl-card-foot';
    const q = def.query!;
    const bits = [
      `source: ${q.source}`,
      `grouped by: ${q.groupBy}`,
      `computed over ${result.complete ? '' : '≥ '}${result.computedOverCount} element(s)`,
      `${result.elapsedMs} ms`,
      `cost ${q.cost} — CLAIMED, not benched (C66 §1.1)`,
    ];
    foot.textContent = bits.join('  ·  ');
    return foot;
  }

  private _card(
    def: AnalysisWidgetDef | null,
    id: string,
    fill: (host: HTMLElement) => void,
    result?: AnalysisResult,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = `anl-card${def?.span === 2 ? ' anl-card--wide' : ''}`;
    card.dataset.widget = id;

    const head = document.createElement('div');
    head.className = 'anl-card-head';
    const hl = document.createElement('div');
    hl.className = 'anl-card-headline';
    const t = document.createElement('h3');
    t.className = 'anl-card-title';
    t.textContent = def?.title ?? id;
    const s = document.createElement('p');
    s.className = 'anl-card-sub';
    s.textContent = def?.subtitle ?? 'Unknown widget kept in this arrangement.';
    hl.append(t, s);

    const tools = document.createElement('div');
    tools.className = 'anl-card-tools';
    if (def?.notBuilt) {
      const badge = document.createElement('span');
      badge.className = 'anl-badge anl-badge--err';
      badge.textContent = 'NOT BUILT';
      tools.appendChild(badge);
    } else if (result && !result.complete) {
      const badge = document.createElement('span');
      badge.className = 'anl-badge anl-badge--warn';
      badge.textContent = 'INCOMPLETE';
      tools.appendChild(badge);
    }
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'anl-icon-btn';
    rm.textContent = '✕';
    rm.title = 'Remove this widget from the dashboard';
    rm.setAttribute('aria-label', `Remove ${def?.title ?? id}`);
    rm.addEventListener('click', () => this._removeWidget(id));
    tools.appendChild(rm);

    head.append(hl, tools);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'anl-card-body';
    fill(body);
    card.appendChild(body);
    return card;
  }

  // ── Composition ─────────────────────────────────────────────────────────────

  /** Every widget id placed anywhere, across all tabs. */
  private _allPlacedIds(): readonly string[] {
    return ANALYSIS_TABS.flatMap((t) => this._layout.tabs[t.id] ?? []);
  }

  /**
   * Remove from EVERY tab, not just the active one.
   *
   * The `×` the user clicked is on a card they can see, so removing it from the
   * active tab alone would be enough for that click — but a v1 arrangement could
   * have placed the same id twice, and leaving the duplicate would make the
   * button look broken the next time that tab was opened.
   */
  private _removeWidget(id: string): void {
    const tabs = {} as Record<AnalysisTabId, readonly string[]>;
    for (const t of ANALYSIS_TABS) tabs[t.id] = (this._layout.tabs[t.id] ?? []).filter((w) => w !== id);
    this._layout = { ...this._layout, tabs };
    saveLayout(this._layout);
    this._buildTabs();
    void this.refresh();
  }

  /**
   * Add to the tab the user is looking at — NOT to the widget's catalogue tab.
   *
   * ⭐ The catalogue tab is the DEFAULT placement, not a constraint. A reader who
   * opens Quantities, presses "Add widget" and picks the level bar wants it on
   * Quantities; silently filing it under Overview would make the button appear
   * to do nothing. The catalogue's `tab` still decides where a widget starts and
   * where a migrated v1 id lands.
   */

  /**
   * §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9002) — the one-time
   * question a LEGACY arrangement cannot answer for itself.
   *
   * ⭐ WHY THIS IS A QUESTION AND NOT A SILENT FIX. `reconcileLayout` can tell a
   * removed widget from a new one ONLY when the arrangement recorded which
   * widgets existed at the time. Arrangements written before that field cannot
   * be classified, and both guesses are wrong for somebody: auto-placing
   * resurrects widgets the user deleted; hiding keeps every widget shipped since
   * invisible, forever, with nothing on screen to say so. So it ASKS — once —
   * and both answers are one click.
   *
   * ⛔ It renders ONLY for the widgets whose catalogue tab is the tab being
   * looked at. A notice on Overview about a widget that lives on Relationships
   * is a notice the reader cannot act on where they are standing.
   *
   * ⛔ AND IT IS NOT DISMISSIBLE-WITHOUT-ANSWERING. A plain ✕ would put the
   * arrangement back into the state where the widget is invisible and nothing
   * says so, which is the defect. The two controls ARE the two answers.
   */
  private _reconcileNotice(): HTMLElement | null {
    const r = reconcileLayout(this._layout);
    if (!r.legacy || r.unreconciled.length === 0) return null;

    const mine = r.unreconciled.filter((id) => (widgetById(id)?.tab ?? 'overview') === this._layout.activeTab);
    if (mine.length === 0) return null;

    const box = document.createElement('div');
    box.className = 'anl-reconcile';

    const head = document.createElement('div');
    head.className = 'anl-reconcile-head';
    head.textContent =
      mine.length === 1
        ? 'One widget on this tab is not in your saved arrangement'
        : `${mine.length} widgets on this tab are not in your saved arrangement`;
    box.appendChild(head);

    const why = document.createElement('p');
    why.className = 'anl-reconcile-why';
    why.textContent =
      'You arranged this dashboard before these shipped, so PRYZM cannot tell whether you removed them or ' +
      'never had them. It will not guess: guessing one way would bring back widgets you deleted, and guessing ' +
      'the other would keep new ones hidden with nothing on screen to say so. Choose once — from now on, ' +
      'anything new appears here on its own.';
    box.appendChild(why);

    for (const id of mine) {
      const def = widgetById(id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'anl-reconcile-row';
      row.title = def?.subtitle ?? '';
      const label = document.createElement('span');
      label.className = 'anl-reconcile-label';
      label.textContent = def?.title ?? id;
      const add = document.createElement('span');
      add.className = 'anl-reconcile-add';
      add.textContent = '＋ Add to this tab';
      row.append(label, add);
      row.addEventListener('click', () => this._addWidget(id));
      box.appendChild(row);
    }

    const foot = document.createElement('div');
    foot.className = 'anl-reconcile-foot';
    const keep = document.createElement('button');
    keep.type = 'button';
    keep.className = 'anl-reconcile-keep';
    keep.textContent = 'I removed these on purpose — stop asking';
    keep.title =
      'Records that you have seen this catalogue. Your arrangement is not changed in any way; only the ' +
      'question goes away, and future widgets will appear without asking.';
    keep.addEventListener('click', () => {
      // ⛔ Changes `knownWidgets` and NOTHING else — every tab list survives
      // verbatim. This is the "MUST stay removed" rule being honoured explicitly
      // rather than inferred.
      this._layout = adoptCatalogueAsKnown(this._layout);
      saveLayout(this._layout);
      void this.refresh();
    });
    foot.appendChild(keep);
    box.appendChild(foot);

    return box;
  }

  private _addWidget(id: string): void {
    if (this._allPlacedIds().includes(id)) return;
    const active = this._layout.activeTab;
    const tabs = { ...this._layout.tabs, [active]: [...(this._layout.tabs[active] ?? []), id] };
    this._layout = { ...this._layout, tabs };
    saveLayout(this._layout);
    this._buildTabs();
    this._pickerOpen = false;
    this._el.querySelector('.anl-picker')?.remove();
    void this.refresh();
  }

  private _togglePicker(): void {
    const existing = this._el.querySelector('.anl-picker');
    if (existing) { existing.remove(); this._pickerOpen = false; return; }
    this._pickerOpen = true;

    const picker = document.createElement('div');
    picker.className = 'anl-picker';
    const h = document.createElement('div');
    h.className = 'anl-picker-head';
    h.textContent = 'Add a widget';
    picker.appendChild(h);

    const note = document.createElement('p');
    note.className = 'anl-picker-note';
    note.textContent =
      `Adds to the “${ANALYSIS_TABS.find((t) => t.id === this._layout.activeTab)?.label ?? ''}” tab. ` +
      'Widgets marked NOT BUILT are in this list on purpose: they name the model PRYZM does not have yet, ' +
      'so the gap is visible here rather than only in a document.';
    picker.appendChild(note);

    for (const w of WIDGET_CATALOGUE) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'anl-picker-row';
      row.disabled = this._allPlacedIds().includes(w.id);

      const label = document.createElement('span');
      label.className = 'anl-picker-label';
      label.textContent = w.title;
      const sub = document.createElement('span');
      sub.className = 'anl-picker-sub';
      sub.textContent = w.subtitle;
      const badge = document.createElement('span');
      badge.className = `anl-badge ${w.notBuilt ? 'anl-badge--err' : 'anl-badge--ok'}`;
      badge.textContent = w.notBuilt ? 'NOT BUILT' : (w.query?.cost ?? '');

      const left = document.createElement('span');
      left.className = 'anl-picker-left';
      left.append(label, sub);
      row.append(left, badge);
      row.addEventListener('click', () => this._addWidget(w.id));
      picker.appendChild(row);
    }

    this._el.appendChild(picker);
  }

  /** The declared census table, shown rather than asserted. */
  private _toggleProvenance(): void {
    const existing = this._el.querySelector('.anl-picker');
    if (existing) { existing.remove(); return; }
    const box = document.createElement('div');
    box.className = 'anl-picker';
    const h = document.createElement('div');
    h.className = 'anl-picker-head';
    h.textContent = 'What this surface counts';
    box.appendChild(h);
    const note = document.createElement('p');
    note.className = 'anl-picker-note';
    note.textContent =
      'The census reads exactly these stores and no others. The list is DECLARED rather than discovered, because a ' +
      'census that finds its own sources cannot tell you which one it failed to find. A store missing from this ' +
      'table is a gap in the table; a store in it that will not read is reported as unreachable, never as zero.';
    box.appendChild(note);
    for (const row of censusSourceTable()) {
      const r = document.createElement('div');
      r.className = 'anl-picker-row anl-picker-row--static';
      const left = document.createElement('span');
      left.className = 'anl-picker-left';
      const l = document.createElement('span');
      l.className = 'anl-picker-label';
      l.textContent = row.family;
      const s = document.createElement('span');
      s.className = 'anl-picker-sub';
      s.textContent = `window.${row.store}  ·  type field: ${row.typeField ?? 'none — this family carries no type'}`;
      left.append(l, s);
      r.appendChild(left);
      box.appendChild(r);
    }
    const foot = document.createElement('p');
    foot.className = 'anl-picker-note';
    foot.textContent =
      'Dashboard arrangements are saved in THIS BROWSER, keyed by project id. They are not yet part of the .pryzm ' +
      'file and do not travel with it or sync between collaborators (L-3007).';
    box.appendChild(foot);
    this._el.appendChild(box);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────

  /** Widget ids on the tab currently being read. */
  private _activeWidgetIds(): readonly string[] {
    return this._layout.tabs[this._layout.activeTab] ?? [];
  }

  private _buildTabs(): void {
    this._tabBar.replaceChildren();
    for (const t of ANALYSIS_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'anl-tab' + (t.id === this._layout.activeTab ? ' anl-tab--active' : '');
      b.dataset.tab = t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t.id === this._layout.activeTab));
      b.append(document.createTextNode(t.label));

      // The count is the ARRANGEMENT's, not the catalogue's — it must track what
      // the user actually put on the tab, including zero.
      const n = this._layout.tabs[t.id]?.length ?? 0;
      const chip = document.createElement('span');
      chip.className = 'anl-tab-count';
      chip.textContent = String(n);
      b.appendChild(chip);

      // ⛔ A tab whose every widget is a refusal card is labelled as such HERE,
      // on the tab, not only inside it. Otherwise the reader pays a click to
      // discover there is nothing to read, and reads the tab as broken rather
      // than as a declared boundary.
      const ids = this._layout.tabs[t.id] ?? [];
      const built = ids.filter((id) => { const d = widgetById(id); return d != null && d.notBuilt == null; });
      if (n > 0 && built.length === 0) {
        const nb = document.createElement('span');
        nb.className = 'anl-tab-nb';
        nb.textContent = 'NOT BUILT';
        b.appendChild(nb);
      }

      b.addEventListener('click', () => this._setActiveTab(t.id));
      this._tabBar.appendChild(b);
    }
    const lede = ANALYSIS_TABS.find((t) => t.id === this._layout.activeTab);
    this._tabLedeText = lede?.lede ?? '';
  }

  private _setActiveTab(id: AnalysisTabId): void {
    if (id === this._layout.activeTab) return;
    this._layout = { ...this._layout, activeTab: id };
    saveLayout(this._layout);
    this._buildTabs();
    void this.refresh();
  }

  /** The tab currently being read. Read by the spec, not by the UI. */
  get activeTab(): AnalysisTabId {
    return this._layout.activeTab;
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  /**
   * §ANALYSIS-INCOMPLETE-REASON (L-3303) + §ANALYSIS-TABS (L-3304).
   *
   * Two defects are fixed here and they are independent:
   *
   *  1. The strip used to derive its REASON from `unreachable`, which is only
   *     one of three causes of `complete:false`. With a truncated graph it read
   *     *"⚠ 0 declared source(s) unreadable, so totals … are LOWER BOUNDS"* —
   *     a warning that refutes itself in its own first clause and teaches the
   *     reader to discount the one strip that must never be discounted. It now
   *     prints the reasons the PRODUCERS gave, verbatim.
   *  2. It used to say "on this dashboard". Only the active tab is computed, so
   *     it cannot speak for tabs it did not read — and silently narrowing the
   *     scope of a trust claim while keeping its wording is exactly the
   *     overstatement this surface exists to refuse. It says "on this tab".
   */
  private _setStatus(ms: number, incomplete: boolean, unreachable: number, reasons: readonly string[]): void {
    this._status.replaceChildren();
    this._status.className = `anl-status${incomplete ? ' anl-status--warn' : ''}`;
    const tab = ANALYSIS_TABS.find((t) => t.id === this._layout.activeTab)?.label ?? 'this tab';

    // C06 §6.1 (L-3642) — "ONE chrome band plus, at most, one navigation row".
    // The tab lede used to be a band of its own between the tab strip and this
    // one. Both are per-tab statements about the same tab, so they are one line.
    // ⛔ The lede was folded INTO the trust statement, not the other way round:
    // nothing below was shortened to make room for it (ADR-0343 §D.6).
    if (this._tabLedeText) {
      const lede = document.createElement('span');
      lede.className = 'anl-status-lede';
      lede.textContent = `${this._tabLedeText}  ·  `;
      this._status.appendChild(lede);
    }

    const text = document.createElement('span');
    if (!incomplete) {
      text.textContent = `Rendered in ${ms} ms — every declared source read on ${tab}.`;
    } else if (reasons.length > 0) {
      text.textContent = `Rendered in ${ms} ms — ⚠ totals on ${tab} are LOWER BOUNDS: ${reasons.join(' · ')}`;
    } else {
      // A producer flipped `complete:false` and gave no reason. Say THAT, rather
      // than inventing the unreadable-source sentence that was wrong before.
      text.textContent =
        `Rendered in ${ms} ms — ⚠ totals on ${tab} are LOWER BOUNDS` +
        (unreachable > 0 ? `: ${unreachable} declared source(s) unreadable.` : ', and no widget said why. Treat every figure here as a floor.');
    }
    this._status.appendChild(text);
    const layoutNote = document.createElement('span');
    layoutNote.className = 'anl-status-note';
    layoutNote.textContent = 'Arrangement saved in this browser (L-3007)';
    this._status.appendChild(layoutNote);
  }

  private _destroyCharts(): void {
    for (const c of this._charts) {
      try { c.destroy(); } catch { /* §SWALLOW-TEARDOWN — the object is being discarded; a dispose() that throws cannot make it any less discarded */ }
    }
    this._charts = [];
  }

  /** Whether the picker is currently open. Read by the spec, not by the UI. */
  get pickerOpen(): boolean {
    return this._pickerOpen;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
//
// Constructed at module evaluation, like AuditStack, and self-appended to
// document.body. Side-effect imported from engineLauncher.ts.

export const analysisSurface = new AnalysisSurface();
