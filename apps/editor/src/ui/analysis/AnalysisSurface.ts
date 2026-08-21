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

import type { AnalysisResult, AnalysisWidgetDef } from './AnalysisTypes';
import { invalidateAnalysisReadModel, runQuery, censusSourceTable } from './analysisReadModel';
import { loadLayout, saveLayout, type AnalysisLayout } from './analysisLayout';
import { DEFAULT_LAYOUT, WIDGET_CATALOGUE, widgetById } from './widgetCatalogue';
import {
  completenessStrip,
  renderChart,
  renderCoverage,
  renderKpi,
  renderNotBuilt,
  renderTable,
  renderTreemap,
  renderUnknownWidget,
} from './widgetRenderers';

type ChartJS = typeof import('chart.js');

const REFRESH_DEBOUNCE_MS = 350;

export class AnalysisSurface {
  private _el!: HTMLElement;
  private _grid!: HTMLElement;
  private _status!: HTMLElement;
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
      this._layout = { version: 1, widgets: [...DEFAULT_LAYOUT] };
      saveLayout(this._layout);
      void this.refresh();
    });
    provBtn.addEventListener('click', () => this._toggleProvenance());
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

    // Selection widgets are `refresh: 'on-selection'` — they alone re-render
    // here, because a selection change does not change any other figure.
    selectionBus.subscribe(() => {
      if (!this._visible) return;
      void this._renderSelectionWidgets();
    });
  }

  // ── Show / hide ─────────────────────────────────────────────────────────────

  private _show(): void {
    this._visible = true;
    this._el.classList.add('anl-surface--visible');
    this._layout = loadLayout(); // a project switch may have changed it
    void this.refresh();
  }

  private _hide(): void {
    this._visible = false;
    this._el.classList.remove('anl-surface--visible');
    if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
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

    const t0 = Date.now();
    let unreachableAcross = 0;
    let anyIncomplete = false;

    // P8 — one span per dashboard mount. The attribute set is bounded by the
    // closed widget-kind union and the layout length, never by a model value.
    withHandlerSpan(
      'pryzm.analysis.surface.render',
      { 'pryzm.surface': 'analysis', 'pryzm.analysis.widgets': this._layout.widgets.length },
      () => {
        for (const id of this._layout.widgets) {
          const def = widgetById(id);
          if (!def) { this._grid.appendChild(this._card(null, id, (host) => renderUnknownWidget(host, id))); continue; }
          const { card, incomplete, unreachable } = this._renderWidget(def);
          this._grid.appendChild(card);
          anyIncomplete = anyIncomplete || incomplete;
          unreachableAcross = Math.max(unreachableAcross, unreachable);
        }
      },
    );

    if (this._layout.widgets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'anl-empty anl-empty--page';
      empty.textContent =
        'This dashboard has no widgets. That is your arrangement, not a failure — press “Add widget” to compose one.';
      this._grid.appendChild(empty);
    }

    this._setStatus(Date.now() - t0, anyIncomplete, unreachableAcross);
  }

  private async _renderSelectionWidgets(): Promise<void> {
    // Only the selection-scoped cards redraw. Everything else is unchanged by a
    // selection, and redrawing it would be work with no output difference.
    for (const id of this._layout.widgets) {
      const def = widgetById(id);
      if (!def || def.refresh !== 'on-selection') continue;
      const old = this._grid.querySelector(`[data-widget="${CSS.escape(id)}"]`);
      if (!old) continue;
      const { card } = this._renderWidget(def);
      old.replaceWith(card);
    }
  }

  private _renderWidget(def: AnalysisWidgetDef): { card: HTMLElement; incomplete: boolean; unreachable: number } {
    if (def.notBuilt) {
      return { card: this._card(def, def.id, (host) => renderNotBuilt(host, def.notBuilt!)), incomplete: false, unreachable: 0 };
    }
    if (!def.query) {
      return { card: this._card(def, def.id, (host) => renderUnknownWidget(host, def.id)), incomplete: false, unreachable: 0 };
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
      };
    }

    const card = this._card(def, def.id, (host) => {
      const strip = completenessStrip(result);
      if (strip) host.appendChild(strip);
      switch (def.kind) {
        case 'kpi':      renderKpi(host, result); break;
        case 'coverage': renderCoverage(host, result); break;
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

    return { card, incomplete: !result.complete, unreachable: result.unreachable.length };
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

  private _removeWidget(id: string): void {
    this._layout = { version: 1, widgets: this._layout.widgets.filter((w) => w !== id) };
    saveLayout(this._layout);
    void this.refresh();
  }

  private _addWidget(id: string): void {
    if (this._layout.widgets.includes(id)) return;
    this._layout = { version: 1, widgets: [...this._layout.widgets, id] };
    saveLayout(this._layout);
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
      'Widgets marked NOT BUILT are in this list on purpose: they name the model PRYZM does not have yet, ' +
      'so the gap is visible here rather than only in a document.';
    picker.appendChild(note);

    for (const w of WIDGET_CATALOGUE) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'anl-picker-row';
      row.disabled = this._layout.widgets.includes(w.id);

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

  // ── Status ──────────────────────────────────────────────────────────────────

  private _setStatus(ms: number, incomplete: boolean, unreachable: number): void {
    this._status.replaceChildren();
    this._status.className = `anl-status${incomplete ? ' anl-status--warn' : ''}`;
    const text = document.createElement('span');
    text.textContent = incomplete
      ? `Rendered in ${ms} ms — ⚠ ${unreachable} declared source(s) unreadable, so totals on this dashboard are LOWER BOUNDS.`
      : `Rendered in ${ms} ms — every declared source read.`;
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
