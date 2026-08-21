/**
 * widgetRenderers — how each widget kind draws itself.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/widgetRenderers.ts
 * ADR:             ADR-0343 §D.5 (colour) · §D.6 (honesty rules H1-H8)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §2.1 (four states, four renderings) · §5
 * Issue log:       L-3009
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUR STATES, AND THE ONE FUNCTION THAT DECIDES BETWEEN THEM
 * ═════════════════════════════════════════════════════════════════════════════
 * SPEC §2.1 gives four states with four renderings, and `renderFigures()` below
 * is where they are told apart. They are NOT interchangeable:
 *
 *   MEASURED     → the figure, its unit, and a click-through to its elements
 *   EMPTY        → `0` WITH the axis named — "0 roofs on this level"
 *   NOT COMPUTED → the reason, never a number
 *   UNREACHABLE  → which source, and that the figure is therefore unknown
 *
 * ⛔ `NOT_MEASURED` is never drawn as a zero — the take-off engine's own type
 * comment binds this and it is adopted verbatim here.
 * ⛔ `complete: false` renders "≥ N", never "N" (§D.6 H5 / SPEC §4.1 W5).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ COLOUR IS NEVER THE ONLY CHANNEL
 * ═════════════════════════════════════════════════════════════════════════════
 * Every categorical fill drawn here carries a text label or a legend row beside
 * it, and every slice/segment carries a 1px `--app-panel-bg` separator. Four of
 * the eight series colours are under 3:1 against white — measured, in
 * `tokens.ts` — so hue alone is not readable and is never asked to be (SC 1.4.1).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * RENDERING IDIOM — ONE, PICKED, NOT A FIFTH
 * ═════════════════════════════════════════════════════════════════════════════
 * SPEC §5 records three idioms already in the tree (Chart.js canvas in exactly
 * one file; hand-built SVG in four panels; Canvas-2D overlays) and requires that
 * whichever is picked is picked ONCE. This surface uses **Chart.js**, loaded by
 * the same lazy `await import('chart.js')` `AnalyticsPanel.ts:77` uses — no new
 * `createElementNS`, no fifth approach. The treemap is DOM rectangles because
 * Chart.js core has no treemap type and adding a plugin dependency would desync
 * `pnpm-lock.yaml` for every other agent in this tree.
 *
 * ⛔ Model-derived strings reach the DOM via `textContent`, never `innerHTML`.
 * Element ids, material ids and finish names originate in imported IFC/glTF
 * files (§DW-MATERIAL-COLOR-XSS, L-407). The only `innerHTML` here takes
 * AUTHORED constants from `widgetCatalogue.ts`.
 *
 * L7 file. No THREE (P2), NO rAF — P3, the single owner is
 * `frame-scheduler/src/RafAdapter.ts`; Chart.js animation is DISABLED below so
 * this surface never schedules a frame. No `(window as any)` (P4), no store
 * writes (P6) — the only outbound call is a SELECTION dispatch, which is intent.
 */

import type { Chart, ChartConfiguration } from 'chart.js';

import { selectionBus, UNIT_LABEL, type CoverageState } from '@pryzm/core-app-model';

import {
  seriesColour,
  type AnalysisFigure,
  type AnalysisResult,
  type AnalysisWidgetDef,
  type NotBuiltReason,
} from './AnalysisTypes';
import { squarify } from './treemap';

type ChartJS = typeof import('chart.js');

// ── Small shared bits ─────────────────────────────────────────────────────────

const NUM0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(v: number, unit: string): string {
  return unit === 'ud' ? NUM0.format(v) : NUM2.format(v);
}

/**
 * Resolve a `var(--x)` token to its computed value. Chart.js paints into a
 * canvas, which cannot read custom properties — so the ONE place a token
 * becomes a literal is here, at paint time, from the live cascade. That is what
 * keeps `tokens.ts` the single source and stops a chart minting a rival palette.
 */
function resolveToken(varExpr: string): string {
  const name = /var\(\s*(--[a-z0-9-]+)\s*\)/i.exec(varExpr)?.[1];
  if (!name) return varExpr;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.length > 0 ? v : varExpr;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text; // ⛔ never innerHTML for model text
  return n;
}

/** Select the elements behind a figure. H4 — a number you cannot open is a number you cannot check. */
function selectFigure(f: AnalysisFigure): void {
  if (f.elementIds.length === 0) return;
  selectionBus.dispatch({
    type: 'select',
    source: 'analytics',
    elementIds: [...f.elementIds],
  });
}

// ── The completeness / coverage strips ────────────────────────────────────────

/**
 * The strip that makes `complete: false` visible ON THE CARD'S FACE. SPEC §2:
 * a widget with `complete:false` MUST say so; it may not round, extrapolate, or
 * omit. This is that requirement, rendered.
 */
export function completenessStrip(result: AnalysisResult): HTMLElement | null {
  if (result.complete) return null;
  const strip = el('div', 'anl-strip anl-strip--warn');
  strip.appendChild(
    el(
      'span',
      'anl-strip-text',
      `Incomplete — ${result.unreachable.length} source(s) could not be read, so every total here is a LOWER BOUND: ` +
        result.unreachable.join(', '),
    ),
  );
  return strip;
}

const COVERAGE_ORDER: Record<CoverageState, number> = { NOT_MEASURED: 0, COUNTED_ONLY: 1, MEASURED: 2 };
const COVERAGE_CLASS: Record<CoverageState, string> = {
  NOT_MEASURED: 'anl-badge--err',
  COUNTED_ONLY: 'anl-badge--warn',
  MEASURED: 'anl-badge--ok',
};

/** The take-off coverage ledger — ⭐ this widget's entire job is H2. */
export function renderCoverage(host: HTMLElement, result: AnalysisResult): void {
  const rows = [...result.coverage].sort((a, b) => COVERAGE_ORDER[a.state] - COVERAGE_ORDER[b.state]);
  if (rows.length === 0) {
    host.appendChild(el('p', 'anl-empty', 'The source published no coverage ledger. That is itself unknown, not clean.'));
    return;
  }

  const notMeasured = rows.filter((r) => r.state === 'NOT_MEASURED').length;
  const counted = rows.filter((r) => r.state === 'COUNTED_ONLY').length;
  const lede = el(
    'p',
    'anl-lede',
    `${rows.length} families known to the take-off engine · ${notMeasured} NOT MEASURED · ${counted} counted only. ` +
      'A family that is not measured produces no line and is NEVER rendered as a zero — that is the difference between ' +
      '"you have no roofs" and "roofs are not measured".',
  );
  host.appendChild(lede);

  if (result.unreachable.length > 0) {
    const s = el('div', 'anl-strip anl-strip--err');
    s.appendChild(
      el('span', 'anl-strip-text', `Unreachable stores (distinct from empty): ${result.unreachable.join(', ')}`),
    );
    host.appendChild(s);
  }

  const table = el('table', 'anl-table');
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    const tdF = el('td', 'anl-td-key', r.family);
    const tdS = el('td');
    const badge = el('span', `anl-badge ${COVERAGE_CLASS[r.state]}`, r.state.replace('_', ' '));
    tdS.appendChild(badge);
    const tdN = el('td', 'anl-td-note', r.note);
    tr.append(tdF, tdS, tdN);
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  host.appendChild(table);
}

// ── Figure-bearing renderers ──────────────────────────────────────────────────

/**
 * The empty state. ⛔ NOT a zeroed chart. SPEC §2.1: "empty" is a real answer
 * and it names its axis; it never renders as a chart with no bars, which reads
 * as a broken widget rather than an answer.
 */
function emptyState(host: HTMLElement, def: AnalysisWidgetDef, result: AnalysisResult): void {
  const box = el('div', 'anl-empty');
  const line = result.computedOverCount === 0
    ? `Nothing to group. The census read ${result.unreachable.length > 0 ? 'what it could and ' : ''}found 0 elements — that is an answer about this project, not a failure of this widget.`
    : `${NUM0.format(result.computedOverCount)} element(s) were read, but none carries a value on the “${def.query?.groupBy ?? '—'}” axis, so there is nothing to group by.`;
  box.appendChild(el('p', undefined, line));
  host.appendChild(box);
}

/** KPI tile. ⛔ Renders "≥ N" when the scan was incomplete. */
export function renderKpi(host: HTMLElement, result: AnalysisResult): void {
  const wrap = el('div', 'anl-kpi-row');

  const total = result.figures.reduce((s, f) => s + f.value, 0);
  const main = el('div', 'anl-kpi');
  main.appendChild(el('div', 'anl-kpi-value', `${result.complete ? '' : '≥ '}${NUM0.format(total)}`));
  main.appendChild(el('div', 'anl-kpi-label', 'elements counted'));
  wrap.appendChild(main);

  const fams = el('div', 'anl-kpi');
  fams.appendChild(el('div', 'anl-kpi-value', NUM0.format(result.figures.length)));
  fams.appendChild(el('div', 'anl-kpi-label', 'families present'));
  wrap.appendChild(fams);

  const un = el('div', 'anl-kpi');
  un.appendChild(el('div', `anl-kpi-value${result.unreachable.length > 0 ? ' anl-kpi-value--warn' : ''}`,
    NUM0.format(result.unreachable.length)));
  un.appendChild(el('div', 'anl-kpi-label', 'stores unreachable'));
  wrap.appendChild(un);

  host.appendChild(wrap);
  if (!result.complete) {
    host.appendChild(
      el(
        'p',
        'anl-note',
        'The headline reads “≥” because at least one declared store could not be read. A count over a partial ' +
          'scan is a floor, and printing it as a total is the single most likely silent undercount on this surface.',
      ),
    );
  }
}

/** Legend rows. This is what makes hue not the only channel. */
function legend(host: HTMLElement, figures: readonly AnalysisFigure[], total: number): void {
  const list = el('ul', 'anl-legend');
  figures.forEach((f, i) => {
    const li = el('li', 'anl-legend-item');
    li.tabIndex = 0;
    const sw = el('span', 'anl-swatch');
    sw.style.background = seriesColour(i, f.key);
    const label = el('span', 'anl-legend-label', f.label);
    const val = el('span', 'anl-legend-value', `${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}`);
    const pct = total > 0 ? ` · ${((f.value / total) * 100).toFixed(1)}%` : '';
    const pctEl = el('span', 'anl-legend-pct', pct);
    li.append(sw, label, val, pctEl);
    li.title = `${f.label} — ${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}. Basis: ${f.basis}`;
    const go = (): void => selectFigure(f);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    list.appendChild(li);
  });
  host.appendChild(list);
}

/**
 * Donut and bar, via Chart.js. Animation is OFF — P3: this surface must never
 * schedule a frame, and an animating chart is a rAF loop by another name.
 */
export function renderChart(
  host: HTMLElement,
  chartjs: ChartJS,
  def: AnalysisWidgetDef,
  result: AnalysisResult,
  charts: Chart[],
): void {
  if (result.figures.length === 0) { emptyState(host, def, result); return; }

  const total = result.figures.reduce((s, f) => s + f.value, 0);
  const canvasWrap = el('div', 'anl-canvas-wrap');
  const canvas = el('canvas');
  canvasWrap.appendChild(canvas);
  host.appendChild(canvasWrap);

  const colours = result.figures.map((f, i) => resolveToken(seriesColour(i, f.key)));
  const separator = resolveToken('var(--app-panel-bg)');
  const tick = resolveToken('var(--app-text-2)');
  const grid = 'rgba(30,50,120,0.07)';

  const common = {
    responsive: true,
    maintainAspectRatio: false,
    // ⛔ P3 — no animation, therefore no animation frame requested by a widget.
    animation: false as const,
    plugins: {
      legend: { display: false }, // the DOM legend below carries labels + values
      tooltip: {
        backgroundColor: resolveToken('var(--app-panel-bg)'),
        titleColor: resolveToken('var(--app-text)'),
        bodyColor: resolveToken('var(--app-text-2)'),
        borderColor: resolveToken('var(--app-border)'),
        borderWidth: 1,
        callbacks: {
          label: (ctx: { dataIndex: number }): string => {
            const f = result.figures[ctx.dataIndex]!;
            return `${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]} — ${f.basis}`;
          },
        },
      },
    },
    onClick: (_e: unknown, active: Array<{ index: number }>): void => {
      const idx = active?.[0]?.index;
      if (typeof idx === 'number') selectFigure(result.figures[idx]!);
    },
  };

  const labels = result.figures.map((f) => f.label);
  const data = result.figures.map((f) => f.value);

  // ⚠ The two configs are built SEPARATELY with explicit type parameters rather
  // than as one `ChartConfiguration` union. Chart.js types `options` per chart
  // type, and the un-parameterised alias widens to `keyof ChartTypeRegistry` —
  // under which `cutout` (doughnut-only) is an excess property and the whole
  // object is rejected. Two typed consts is the honest shape, not a cast.
  const cfg: ChartConfiguration<'doughnut', number[], string> | ChartConfiguration<'bar', number[], string> =
    def.kind === 'donut'
      ? {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data,
              backgroundColor: colours,
              borderColor: separator,
              borderWidth: 1.5, // the separator that stops two low-contrast fills touching
            }],
          },
          options: { ...common, cutout: '58%' },
        }
      : {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              data,
              backgroundColor: colours,
              borderColor: separator,
              borderWidth: 1,
              borderRadius: 3,
            }],
          },
          options: {
            ...common,
            scales: {
              x: { ticks: { color: tick, font: { size: 10 } }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { color: tick, font: { size: 10 } }, grid: { color: grid } },
            },
          },
        };

  try {
    charts.push(new chartjs.Chart(canvas, cfg));
  } catch (e) {
    // ⛔ A CHART THAT CANNOT BE CONSTRUCTED MUST NOT TAKE THE DASHBOARD DOWN.
    // `new Chart()` needs a live 2-D context; a browser that refuses one (GPU
    // fallback exhausted, a hardened context policy, an offscreen host) throws
    // HERE, synchronously, in the middle of building the card — and without this
    // guard that exception escapes `refresh()` and every widget AFTER this one
    // in the layout silently never mounts. The figures are already computed and
    // already true, so the honest degradation is to render them as a table.
    console.warn('[analysis] chart could not be constructed; rendering the same figures as a table.', e);
    canvasWrap.remove();
    renderTable(host, def, result);
    return;
  }
  legend(host, result.figures, total);
}

/** A sortable, click-through table. The most honest renderer of a long tail. */
export function renderTable(host: HTMLElement, def: AnalysisWidgetDef, result: AnalysisResult): void {
  if (result.figures.length === 0) { emptyState(host, def, result); return; }

  const table = el('table', 'anl-table anl-table--figures');
  const thead = el('thead');
  const htr = el('tr');
  for (const h of ['', 'Item', 'Quantity', 'Basis']) htr.appendChild(el('th', undefined, h));
  thead.appendChild(htr);
  table.appendChild(thead);

  const tb = el('tbody');
  result.figures.forEach((f, i) => {
    const tr = el('tr', 'anl-row-clickable');
    tr.tabIndex = 0;
    const tdC = el('td', 'anl-td-swatch');
    const sw = el('span', 'anl-swatch');
    sw.style.background = seriesColour(i, f.key);
    tdC.appendChild(sw);
    const tdL = el('td', 'anl-td-key', f.label);
    const tdV = el('td', 'anl-td-num', `${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}`);
    const tdB = el('td', 'anl-td-note', f.basis);
    if (f.qualifiers.length > 0) {
      // ⚠ A qualifier means some contributor was measured APPROXIMATELY. It is
      // shown, not hidden behind a tooltip: an approximated quantity that reads
      // as exact is the defect the take-off's own qualifiers exist to prevent.
      const q = el('div', 'anl-qualifier', `⚠ ${f.qualifiers.join(' · ')}`);
      tdB.appendChild(q);
    }
    tr.append(tdC, tdL, tdV, tdB);
    tr.title = `${f.elementIds.length} element(s) — click to select them`;
    const go = (): void => selectFigure(f);
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  host.appendChild(table);
}

/** Treemap. Area encodes quantity in ONE unit — the unit is in the widget title. */
export function renderTreemap(host: HTMLElement, def: AnalysisWidgetDef, result: AnalysisResult): void {
  if (result.figures.length === 0) { emptyState(host, def, result); return; }

  const layout = squarify(result.figures.map((f) => ({ key: f.key, label: f.label, value: f.value })));
  const box = el('div', 'anl-treemap');
  const indexOf = new Map(result.figures.map((f, i) => [f.key, i]));

  for (const t of layout.tiles) {
    const i = indexOf.get(t.key) ?? 0;
    const f = result.figures[i]!;
    const tile = el('div', 'anl-tile');
    tile.style.left = `${(t.x * 100).toFixed(4)}%`;
    tile.style.top = `${(t.y * 100).toFixed(4)}%`;
    tile.style.width = `${(t.w * 100).toFixed(4)}%`;
    tile.style.height = `${(t.h * 100).toFixed(4)}%`;
    tile.style.background = seriesColour(i, t.key);
    tile.tabIndex = 0;
    tile.title = `${t.label} — ${fmt(t.value, f.unit)} ${UNIT_LABEL[f.unit]}. Basis: ${f.basis}`;
    // The label is inside the tile, so the rectangle is never identified by hue
    // alone. Small tiles hide it via CSS overflow and keep the tooltip.
    const cap = el('div', 'anl-tile-cap');
    cap.appendChild(el('span', 'anl-tile-label', t.label));
    cap.appendChild(el('span', 'anl-tile-value', `${fmt(t.value, f.unit)} ${UNIT_LABEL[f.unit]}`));
    tile.appendChild(cap);
    const go = (): void => selectFigure(f);
    tile.addEventListener('click', go);
    tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    box.appendChild(tile);
  }
  host.appendChild(box);

  // ⛔ Items with no area are REPORTED, not dropped — otherwise the rectangles
  // sum to less than the stated total with nothing on screen saying why.
  if (layout.omitted.length > 0) {
    host.appendChild(
      el(
        'p',
        'anl-note',
        `${layout.omitted.length} line(s) have no positive quantity and therefore no area, so they are not tiles here: ` +
          layout.omitted.map((o) => o.label).join(', ') +
          '. They are not zero — see the coverage card.',
      ),
    );
  }
}

/** The refusal card. ⛔ Names WHICH data is missing and WHY (H7). */
export function renderNotBuilt(host: HTMLElement, reason: NotBuiltReason): void {
  // The strings here are AUTHORED CONSTANTS from widgetCatalogue.ts, never model
  // data — which is why innerHTML is used and is safe. It carries <strong>/<code>.
  const list = (items: readonly string[], cls: string): string =>
    `<ul class="anl-nb-list ${cls}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

  const body = el('div', 'anl-nb');
  body.innerHTML = `
    <p class="anl-nb-lede">${reason.lede}</p>
    <h4 class="anl-nb-h">What already exists and can be built on</h4>
    ${list(reason.have, 'anl-nb-list--have')}
    <h4 class="anl-nb-h">What is missing, named</h4>
    ${list(reason.need, 'anl-nb-list--need')}
    <p class="anl-nb-close">${reason.close}</p>
    <p class="anl-nb-foot">Nothing on this card is broken — the capability has not shipped. It is here so the gap is
      visible where the decision gets made, rather than only in a document (ADR-0343 §D.6 H7, SPEC §4.4–§4.5).</p>`;
  host.appendChild(body);
}

/** A layout entry naming a widget this build does not have. Never dropped. */
export function renderUnknownWidget(host: HTMLElement, id: string): void {
  const box = el('div', 'anl-nb');
  box.appendChild(el('p', 'anl-nb-lede', `This layout references a widget called “${id}”, which this build does not have.`));
  box.appendChild(
    el(
      'p',
      'anl-nb-foot',
      'It is kept in the arrangement rather than removed: a dropped widget is a lost decision, and if this project ' +
        'is opened in a build that has it, it comes back (SPEC §7).',
    ),
  );
  host.appendChild(box);
}
