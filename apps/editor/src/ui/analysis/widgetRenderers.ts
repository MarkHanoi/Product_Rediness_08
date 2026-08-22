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
 * ⚠ AMENDED 2026-08-21 (lane UBG1, L-3256) — there is now ONE exception, and it
 * is declared rather than quietly taken. `renderGraph()` below draws a NODE-LINK
 * diagram, which Chart.js cannot express at all: there is no chart type whose
 * marks are "arbitrary points joined by typed segments at force-solved
 * positions". So it is SVG.
 *
 * ⛔ It is NOT a fifth hand-roll. It delegates to `nodeLinkSvg.ts`, a SHARED
 * module whose force layout is lifted from `ui/rooms/RoomGraphPanel.ts`
 * (`_forceLayout`, :122-205) — read first, exactly as SPEC §5's "pick one" rule
 * requires. That file plus `BuildingGraphOverlay`, `LivingGraphOverlay` and the
 * plan graph overlay are the four existing hand-rolls; L-3257 tracks collapsing
 * them into the shared one. This lane published the target and did not migrate
 * three live overlays blind.
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

import { toggleFacet } from './selectionFacets';

import {
  projectGraph,
  livenessSentence,
  nodeDegrees,
  scopeSentence,
  graphLevelFilter,
  setGraphLevelFilter,
} from './graphReadModel';
import { censusPlacement, censusLevels } from './analysisReadModel';
import { AREA_STANDARDS, areaStandard, setAreaStandard } from './areaStandards';
import { renderNodeLink, renderEdgeLegend } from './nodeLinkSvg';
import { SeriesFocus, markSeries } from './seriesFocus';

import {
  seriesColour,
  type AnalysisAxis,
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

/**
 * Select the elements behind a figure. H4 — a number you cannot open is a number
 * you cannot check.
 *
 * §FEAT-ANALYSIS-FACET-CROSS-FILTER (L-6602). ⭐ THIS USED TO DISPATCH A FLAT ID
 * SET AND THAT IS THE WHOLE OF THE BUG THE FOUNDER REPORTED. Clicking "Walls"
 * pushed 312 opaque strings at the bus; clicking "Level 1" next pushed 208 more
 * and REPLACED them, because a set of ids has forgotten which question produced
 * it. His sentence — *"if walls for example and level 1 are selected - then wall
 * in level 1 should be highlighted"* — is an INTERSECTION ACROSS TWO WIDGETS,
 * and it is not answerable from the ids alone.
 *
 * So a click now records the QUESTION — `(axis, key)` — and `selectionFacets`
 * intersects the active questions and dispatches the result. The dispatch itself
 * is unchanged and still goes through `selectionBus` (C27 §4).
 *
 * ⛔ `axis` comes from the WIDGET'S OWN `query.groupBy`, never from a guess about
 * the key. Two widgets can emit the same key string on different axes, and a
 * facet filed under the wrong axis would silently replace an unrelated filter.
 */
function selectFigure(axis: AnalysisAxis, f: AnalysisFigure): void {
  // ⚠ A figure with no ids is still a legitimate facet pick — it just resolves to
  // nothing, and the facet bar says so. Returning early here (as this function
  // used to) would make a zero-population slice UNCLICKABLE, which reads as a
  // broken control rather than as an empty answer.
  toggleFacet(axis, f);
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
      // §ANALYSIS-INCOMPLETE-REASON (L-3303) — the producer's own words. This
      // string used to be built from `unreachable.length` alone, so a truncated
      // or stale GRAPH card announced "0 source(s) could not be read", which is
      // both false and self-refuting.
      result.incompleteReason.length > 0
        ? `Incomplete — every total here is a LOWER BOUND: ${result.incompleteReason.join(' · ')}`
        : 'Incomplete — every total here is a LOWER BOUND, and the source named no cause.',
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

/**
 * The event the area-standard picker fires. `AnalysisSurface` listens.
 * Same shape as `GRAPH_SCOPE_EVENT`, for the same reason: a renderer must not
 * hold the surface.
 */
export const AREA_STANDARD_EVENT = 'anl-area-standard-changed';

/**
 * The measured-area standard picker. §ANALYSIS-AREA-STANDARDS (L-3640).
 *
 * ⭐ THE STANDARD IS ON THE CARD'S FACE, WHICH WAS THE POINT OF THE REQUEST. The
 * same building has several different, all-correct areas; a surface that picked
 * one and did not say so would be publishing an unattributed number, which is
 * the whole class of defect this panel exists to refuse.
 *
 * ⚠ Switching does NOT change any figure below — the figures are centreline
 * sums and are what they are. It changes the LEDGER: which classes the selected
 * standard asks for, and which of them this build can produce. That is stated
 * on the control itself, because a picker that looks like it recomputes and does
 * not is worse than no picker.
 */
function areaStandardPicker(): HTMLElement {
  const bar = el('div', 'anl-scope-bar');
  bar.appendChild(el('span', 'anl-scope-label', 'Standard'));
  const active = areaStandard();

  for (const std of AREA_STANDARDS) {
    const b = el('button', `anl-scope-chip${std.id === active.id ? ' anl-scope-chip--on' : ''}`, std.label);
    b.type = 'button';
    b.title = std.jurisdiction;
    b.setAttribute('aria-pressed', String(std.id === active.id));
    b.addEventListener('click', () => {
      setAreaStandard(std.id);
      window.dispatchEvent(new CustomEvent(AREA_STANDARD_EVENT));
    });
    bar.appendChild(b);
  }

  const note = el('p', 'anl-note');
  note.textContent =
    `${active.label} — ${active.jurisdiction} ${active.verdict} ` +
    'Switching standard changes WHICH CLASSES are asked for, not the figures: the areas this build holds are ' +
    'centreline sums and do not become a different measurement because a different rulebook is selected.';
  const wrap = el('div', 'anl-std-picker');
  wrap.append(bar, note);
  return wrap;
}

/** The coverage ledger — ⭐ this widget's entire job is H2. */
export function renderCoverage(host: HTMLElement, result: AnalysisResult): void {
  // The area ledger names a standard, so it gets the control that names it.
  // ⛔ Conditioned on the SOURCE, not on a widget id: a widget id is a label and
  // labels get copied; the source is what actually decides whether these rows
  // are an area standard's classes or a take-off engine's families.
  if (result.query.source === 'area') host.appendChild(areaStandardPicker());

  const rows = [...result.coverage].sort((a, b) => COVERAGE_ORDER[a.state] - COVERAGE_ORDER[b.state]);
  if (rows.length === 0) {
    host.appendChild(el('p', 'anl-empty', 'The source published no coverage ledger. That is itself unknown, not clean.'));
    return;
  }

  const notMeasured = rows.filter((r) => r.state === 'NOT_MEASURED').length;
  const counted = rows.filter((r) => r.state === 'COUNTED_ONLY').length;
  // ⚠ The noun changes with the source. It used to say "families known to the
  // take-off engine" unconditionally, which would describe SIA 416's classes as
  // take-off families — a caption that misnames what it is counting.
  const noun = result.query.source === 'area'
    ? `classes declared by ${areaStandard().label}`
    : result.query.source === 'graph'
      ? 'declared UBG edge families'
      : 'families known to the take-off engine';
  const lede = el(
    'p',
    'anl-lede',
    `${rows.length} ${noun} · ${notMeasured} NOT MEASURED · ${counted} counted only. ` +
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
        'The headline reads “≥” because this figure is a floor, not a total: ' +
          (result.incompleteReason.join(' · ') || 'the source did not say why') +
          '. Printing a partial scan as a total is the single most likely silent undercount on this surface.',
      ),
    );
  }
}

/**
 * Legend rows. This is what makes hue not the only channel.
 *
 * §ANALYSIS-SERIES-FOCUS (L-3610) — each row is a `data-series` mark, so picking
 * one lights it and dims its siblings WITHOUT removing them. The value and the
 * percentage stay on screen for every row, focused or not: the card's
 * denominator does not change because the reader emphasised part of it.
 */
function legend(
  host: HTMLElement,
  axis: AnalysisAxis,
  figures: readonly AnalysisFigure[],
  total: number,
  focus?: SeriesFocus,
): void {
  const list = el('ul', 'anl-legend');
  figures.forEach((f, i) => {
    const li = markSeries(el('li', 'anl-legend-item'), f.key);
    li.tabIndex = 0;
    const sw = el('span', 'anl-swatch');
    sw.style.background = seriesColour(i, f.key);
    const label = el('span', 'anl-legend-label', f.label);
    const val = el('span', 'anl-legend-value', `${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}`);
    const pct = total > 0 ? ` · ${((f.value / total) * 100).toFixed(1)}%` : '';
    const pctEl = el('span', 'anl-legend-pct', pct);
    li.append(sw, label, val, pctEl);
    li.title = `${f.label} — ${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}. Basis: ${f.basis}`;
    const go = (): void => { focus?.toggle(f.key); selectFigure(axis, f); };
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

  const focus = new SeriesFocus(host);
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
      if (typeof idx !== 'number') return;
      const f = result.figures[idx]!;
      // §ANALYSIS-SERIES-FOCUS (L-3610) — the founder's sentence, both halves:
      // the model selection (what the figure IS) and the chart emphasis (what
      // the reader is looking at). They are separate answers and both happen.
      focus.toggle(f.key);
      selectFigure(result.query.groupBy, f);
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
    const chart = new chartjs.Chart(canvas, cfg);
    charts.push(chart);
    // The canvas cannot be reached by CSS, so the focus mechanism needs the
    // dataset itself. Registered with the FULL-strength colours and the figure
    // keys, so a dim pass never compounds and never keys on a display label.
    focus.registerChart(chart, colours, result.figures.map((f) => f.key));
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
    renderTable(host, def, result, focus);
    return;
  }
  legend(host, result.query.groupBy, result.figures, total, focus);
}

/**
 * How many contributing elements a drill-down lists before it stops.
 *
 * ⛔ The list is CAPPED and SAYS SO, and it never truncates in silence — a
 * take-off row can hold thousands of wall ids and rendering all of them would
 * make the card unreadable for exactly the reader who opened it. The count in
 * the header is always the TRUE one; only the list is capped.
 */
const DRILL_CAP = 40;

/**
 * §ANALYSIS-ROW-DRILLDOWN (L-3630) — the elements behind one figure, named.
 *
 * ⭐ WHY A DRILL-DOWN IS NOT A NICETY HERE. ADR-0343 §D.6 H4 is *"a number you
 * cannot open is a number you cannot check"*, and until now "open" meant one
 * thing: dispatch the whole row to the selection bus. That answers "show me
 * these" and cannot answer "which ONE of these is the 70° raked wall". A
 * quantity surveyor checking a *medición* needs the second question, and it is
 * the question a qualifier provokes.
 */
function drillDown(f: AnalysisFigure): HTMLElement {
  const box = el('div', 'anl-drill');

  const head = el(
    'div',
    'anl-drill-head',
    `${NUM0.format(f.elementIds.length)} contributing element(s)` +
      (f.elementIds.length > DRILL_CAP ? ` — listing the first ${DRILL_CAP}` : ''),
  );
  box.appendChild(head);

  const list = el('div', 'anl-drill-ids');
  for (const id of f.elementIds.slice(0, DRILL_CAP)) {
    // ⛔ textContent, never innerHTML — element ids originate in imported
    // IFC/glTF files (§DW-MATERIAL-COLOR-XSS, L-407).
    const chip = el('button', 'anl-drill-id', id);
    chip.type = 'button';
    chip.title = `Select ${id} on its own`;
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // the row's own handler would re-select the whole group
      selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: [id] });
    });
    list.appendChild(chip);
  }
  box.appendChild(list);

  if (f.elementIds.length > DRILL_CAP) {
    box.appendChild(
      el(
        'p',
        'anl-drill-foot',
        `${NUM0.format(f.elementIds.length - DRILL_CAP)} more are in this figure and are NOT listed here. ` +
          'The quantity above counts all of them — this list is capped, the measurement is not.',
      ),
    );
  }
  return box;
}

/**
 * The qualifier block. §ANALYSIS-QUALIFIER-LEGIBLE (L-3631).
 *
 * ⚠ THE FOUNDER'S REPORT, and it is a legibility defect rather than a truth
 * one: *"3 of 41: raked wall (70.0°) measured in its authored, un-sheared
 * elevation plane"* was rendered as 9 px grey text under a basis string, i.e. as
 * a footnote. It is not a footnote — it is the statement that N of the elements
 * in that row were measured APPROXIMATELY, which is the single fact a surveyor
 * must not miss.
 *
 * ⛔ NOT A TOOLTIP AND NOT COLLAPSED. Every word survives; only the typography
 * and the plate change. Making the panel tidier may not cost a syllable of this.
 */
function qualifierBlock(qualifiers: readonly string[]): HTMLElement {
  const box = el('div', 'anl-qual');
  const head = el('span', 'anl-qual-badge', qualifiers.length === 1 ? 'APPROXIMATED' : `APPROXIMATED ×${qualifiers.length}`);
  box.appendChild(head);
  const ul = el('ul', 'anl-qual-list');
  for (const q of qualifiers) ul.appendChild(el('li', undefined, q));
  box.appendChild(ul);
  return box;
}

/** A click-through table. The most honest renderer of a long tail. */
export function renderTable(
  host: HTMLElement,
  def: AnalysisWidgetDef,
  result: AnalysisResult,
  focus?: SeriesFocus,
): void {
  if (result.figures.length === 0) { emptyState(host, def, result); return; }

  const f0 = focus ?? new SeriesFocus(host);

  const table = el('table', 'anl-table anl-table--figures');
  const thead = el('thead');
  const htr = el('tr');
  for (const h of ['', 'Item', 'Quantity', 'Basis', '']) htr.appendChild(el('th', undefined, h));
  thead.appendChild(htr);
  table.appendChild(thead);

  const tb = el('tbody');
  result.figures.forEach((fig, i) => {
    const f = fig;
    const tr = markSeries(el('tr', 'anl-row-clickable'), f.key);
    tr.tabIndex = 0;
    const tdC = el('td', 'anl-td-swatch');
    const sw = el('span', 'anl-swatch');
    sw.style.background = seriesColour(i, f.key);
    tdC.appendChild(sw);
    const tdL = el('td', 'anl-td-key', f.label);
    const tdV = el('td', 'anl-td-num', `${fmt(f.value, f.unit)} ${UNIT_LABEL[f.unit]}`);
    const tdB = el('td', 'anl-td-note', f.basis);
    if (f.qualifiers.length > 0) tdB.appendChild(qualifierBlock(f.qualifiers));

    // ── The drill-down toggle, in its own column so the row click is unchanged ─
    const tdD = el('td', 'anl-td-drill');
    const toggle = el('button', 'anl-drill-toggle', '▸');
    toggle.type = 'button';
    toggle.title = `Show the ${f.elementIds.length} element(s) behind this figure`;
    toggle.setAttribute('aria-expanded', 'false');
    tdD.appendChild(toggle);

    tr.append(tdC, tdL, tdV, tdB, tdD);
    tr.title = `${f.elementIds.length} element(s) — click to select them and light this series`;
    const go = (): void => { f0.toggle(f.key); selectFigure(result.query.groupBy, f); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    tb.appendChild(tr);

    // The expansion is a SIBLING row, so it inherits the table's column widths
    // instead of a second layout that drifts away from the one above it.
    const drillRow = markSeries(el('tr', 'anl-drill-row'), f.key);
    const drillCell = el('td');
    drillCell.setAttribute('colspan', '5');
    drillCell.appendChild(drillDown(f));
    drillRow.appendChild(drillCell);
    drillRow.hidden = true;
    tb.appendChild(drillRow);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation(); // opening the list is not the same act as selecting the group
      const open = drillRow.hidden;
      drillRow.hidden = !open;
      toggle.textContent = open ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(open));
    });
  });
  table.appendChild(tb);
  host.appendChild(table);
}

/** Treemap. Area encodes quantity in ONE unit — the unit is in the widget title. */
export function renderTreemap(host: HTMLElement, def: AnalysisWidgetDef, result: AnalysisResult): void {
  if (result.figures.length === 0) { emptyState(host, def, result); return; }

  const focus = new SeriesFocus(host);
  const layout = squarify(result.figures.map((f) => ({ key: f.key, label: f.label, value: f.value })));
  const box = el('div', 'anl-treemap');
  const indexOf = new Map(result.figures.map((f, i) => [f.key, i]));

  for (const t of layout.tiles) {
    const i = indexOf.get(t.key) ?? 0;
    const f = result.figures[i]!;
    const tile = markSeries(el('div', 'anl-tile'), t.key);
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
    // §ANALYSIS-SERIES-FOCUS (L-3610). The cell stays in the map when it is not
    // the focused one -- area encodes quantity, and removing a rectangle would
    // silently change what the remaining rectangles are a share OF.
    const go = (): void => { focus.toggle(t.key); selectFigure(result.query.groupBy, f); };
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

// ── The relational widget (ADR-0343 §D.7, STR-14 §4) ──────────────────────────

/**
 * The event the scope control fires. `AnalysisSurface` listens and re-renders.
 *
 * ⛔ A DOM event rather than a direct call: a renderer must not hold the surface.
 * That is the same rule that keeps a widget from holding a store (ADR-0343 §D.3)
 * — a renderer that can reach its host can reach anything the host can.
 */
export const GRAPH_SCOPE_EVENT = 'anl-graph-scope-changed';

/**
 * The storey picker for every relationship widget. §ANALYSIS-GRAPH-LEVEL-FILTER.
 *
 * ⭐ ITS FIRST OPTION IS THE WHOLE MODEL AND IS THE DEFAULT. A relationship view
 * that opened pre-filtered would show a reader less than the building holds
 * without their having asked, which is the same overstatement-by-omission the
 * node cap commits when it stays silent.
 *
 * ⚠ THE LEVELS OFFERED ARE THE ONES THE CENSUS RESOLVED, not a list of storeys
 * the app believes in — `censusLevels()` reads the same snapshot the figures are
 * computed over. A picker that could offer a level the figures were not computed
 * against is a picker that can produce an empty card and blame the model.
 */
function levelScopePicker(): HTMLElement {
  const bar = el('div', 'anl-scope-bar');
  bar.appendChild(el('span', 'anl-scope-label', 'Storey'));

  const levels = censusLevels();
  const active = graphLevelFilter();

  const chip = (id: string | null, label: string, title: string): HTMLElement => {
    const b = el('button', `anl-scope-chip${id === active ? ' anl-scope-chip--on' : ''}`, label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-pressed', String(id === active));
    b.addEventListener('click', () => {
      setGraphLevelFilter(id);
      window.dispatchEvent(new CustomEvent(GRAPH_SCOPE_EVENT));
    });
    return b;
  };

  bar.appendChild(
    chip(null, 'All storeys', 'Every relationship in the model — the unfiltered universe'),
  );
  for (const l of levels) {
    bar.appendChild(
      chip(l.id, l.name, `Only relationships whose BOTH endpoints the census places on ${l.name}`),
    );
  }

  if (levels.length === 0) {
    // ⛔ An empty picker is a real answer about the level authority, not a
    // missing control. Rendering nothing would read as "this feature is absent".
    bar.appendChild(
      el(
        'span',
        'anl-scope-note',
        'The level authority returned no storeys, so there is nothing to scope to. That is a fact about ' +
          'bimManager.getLevels(), not about this graph.',
      ),
    );
  }
  return bar;
}

/**
 * The node-link relationship diagram — the picture the founder asked for.
 *
 * ⭐ THREE THINGS SHIP TOGETHER ON THIS CARD, AND THE OTHER TWO ARE NOT GARNISH:
 *   1. the diagram;
 *   2. a LIVENESS sentence, because until L-3251 the only honest label for this
 *      graph was "stale by construction" and there was no code path that could
 *      say it. A relational view on a surface the reader takes for live must
 *      state which it is;
 *   3. a TRUNCATION notice when the model exceeds the node cap, because a
 *      reader counts what they can see and a silently-clipped graph understates
 *      the building's connectivity.
 *
 * ⛔ Renders ONCE. No animation, no rAF (P3). STR-14 §4.1's "living blob" is a
 * real deliverable and it is not a dashboard card's to schedule.
 */
export function renderGraph(host: HTMLElement, _def: AnalysisWidgetDef, _result: AnalysisResult): void {
  const g = projectGraph(censusPlacement());

  // ── The scope control, ABOVE everything it governs ─────────────────────────
  // §ANALYSIS-GRAPH-LEVEL-FILTER (L-3620). It sits first because every figure
  // under it is a figure ABOUT the universe it names; a scope control below the
  // picture would let a reader read the picture before learning what it is of.
  host.appendChild(levelScopePicker());

  // ── The liveness strip: it qualifies everything below it ───────────────────
  const live = el('div', `anl-strip ${g.liveness?.freshness === 'stale' ? 'anl-strip--err' : 'anl-strip--ok'}`);
  live.appendChild(el('span', 'anl-strip-text', livenessSentence(g.liveness)));
  host.appendChild(live);

  // ── The scope statement, on its OWN plate ──────────────────────────────────
  // ⛔ 'anl-scope', never 'anl-strip--warn'. The founder's rule: a filter and a
  // truncation must never render identically. This says what universe you are
  // looking at; the amber strip below says what the tool could not deliver
  // inside it. Same card, two different kinds of fact, two different plates.
  const scope = el('div', 'anl-scope');
  scope.appendChild(el('span', 'anl-scope-text', scopeSentence(g.scope)));
  host.appendChild(scope);

  if (g.unreachable.length > 0) {
    host.appendChild(
      el(
        'p',
        'anl-empty',
        'The Building Graph was not reachable. That is NOT "this building has no relationships" — it is that the ' +
          'projection has not run yet. Open the editor on a project and press refresh.',
      ),
    );
    return;
  }

  if (g.nodes.length === 0) {
    host.appendChild(
      el(
        'p',
        'anl-empty',
        'The graph projected successfully and contains no nodes. See the relationship-coverage card for which ' +
          'edge families are wired — four of the ten cannot be populated in this build at all, so an empty ' +
          'diagram may be a gap in the projection rather than a building with no relationships.',
      ),
    );
    return;
  }

  // Stable colour index per edge type and per node kind, so the legend, the
  // lines and the nodes agree and do not renumber between renders.
  const edgeTypeIndex = new Map<string, number>();
  for (const e of g.edges) if (!edgeTypeIndex.has(e.type)) edgeTypeIndex.set(e.type, edgeTypeIndex.size);
  const groupIndex = new Map<string, number>();
  for (const n of g.nodes) if (!groupIndex.has(n.kind)) groupIndex.set(n.kind, groupIndex.size);

  const degrees = nodeDegrees(g.edges);
  const nodes = g.nodes.map((n) => ({
    id: n.id,
    label: readableLabel(n),
    group: n.kind,
    weight: degrees.get(n.id) ?? 1,
  }));

  if (g.truncated) {
    host.appendChild(
      el(
        'p',
        'anl-strip anl-strip--warn',
        `Showing the ${g.nodes.length} most-connected of ${g.totalNodes} elements — a force layout is O(n²) and ` +
          'above this a node-link diagram is a hairball. Every count on this card is therefore a lower bound.',
      ),
    );
  }

  const focus = new SeriesFocus(host);
  const box = el('div', 'anl-nodelink-box');
  host.appendChild(box);
  renderNodeLink(box, nodes, g.edges, {
    width: 620,
    height: 380,
    edgeTypeIndex,
    groupIndex,
    // H4 — click-through to selection, the join between the chart and the model.
    // Same dispatch shape `selectFigure()` uses, so a graph node and a donut
    // slice select identically. P6-safe: selection is intent, not mutation.
    onPick: (id) => selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: [id] }),
    // §ANALYSIS-SERIES-FOCUS (L-3610) — the founder's sentence applied to the
    // picture he described it about: the picked node, its relations and its
    // neighbours lead; everything else goes dormant and STAYS ON SCREEN.
    focus,
  });

  const counts = new Map<string, number>();
  for (const e of g.edges) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  // The legend is also a QUERY surface: a row lights its whole relation family.
  renderEdgeLegend(host, edgeTypeIndex, counts, focus);

  host.appendChild(
    el(
      'p',
      'anl-card-foot',
      `${g.truncated ? '≥ ' : ''}${g.edges.length} drawn relationship(s) of ${g.totalEdges} projected  ·  ` +
        `${nodes.length} of ${g.totalNodes} elements  ·  node size = degree  ·  colour = element kind`,
    ),
  );
}

/**
 * A human label for a UBG node. Enrichment stamps `name`/`occupancy` on rooms;
 * everything else falls back to the id's type prefix plus a short suffix.
 *
 * ⛔ Never blank, and never the bare ULID — a diagram of twenty identical grey
 * hex strings is a diagram of nothing.
 */
function readableLabel(node: { id: string; kind: string; props?: Record<string, unknown> }): string {
  const p = node.props ?? {};
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null;
  const occ = typeof p.occupancy === 'string' && p.occupancy.trim() ? p.occupancy.trim() : null;
  if (name) return name;
  if (occ) return occ;
  const under = node.id.indexOf('_');
  const suffix = under > 0 ? node.id.slice(under + 1, under + 5) : node.id.slice(0, 4);
  return `${node.kind} ${suffix}`;
}
