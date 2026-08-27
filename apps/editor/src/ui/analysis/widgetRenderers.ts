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

import {
  selectionBus,
  UNIT_LABEL,
  projectScopeRegistry,
  registerProjectScopeProbe,
  type CoverageState,
} from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

import { resolveActiveProjectId } from '../../engine/project/activeProjectId';

import { toggleFacet } from './selectionFacets';

import {
  projectGraph,
  livenessSentence,
  nodeDegrees,
  scopeSentence,
  graphLevelFilter,
  setGraphLevelFilter,
  GRAPH_NODE_CAP,
  type GraphProjection,
} from './graphReadModel';
import { censusPlacement, censusLevels, getCensus } from './analysisReadModel';
import { AREA_STANDARDS, areaStandard, setAreaStandard } from './areaStandards';
import { renderNodeLink, renderEdgeLegend, renderNodeLegend } from './nodeLinkSvg';
import { foldOpen, setFoldOpen, presentationMode } from './analysisLayout';
import {
  HIERARCHY_VIEWS,
  DISCIPLINE_ORDER,
  describeFocus,
  familyOfNode,
  focusNeighbourhood,
  projectHierarchy,
  type ElementFamilyResolver,
  type HierarchyProjection,
} from '@pryzm/building-graph';
import {
  GRAPH_VIEW_EVENT,
  buildGraphSubject,
  dataUrlToBlob,
  downloadFile,
  graphExpanded,
  graphFocusDepth,
  graphLabels,
  graphMode,
  graphNodeScale,
  graphOrbit,
  graphView,
  resetGraphViewState,
  serialiseNetwork,
  setGraphExpanded,
  setGraphFocusDepth,
  setGraphLabels,
  setGraphMode,
  setGraphNodeScale,
  setGraphView,
} from './graphViewState';
import { mountGraphViewport, type GraphViewportHandle } from './GraphViewport';
import { SeriesFocus, markSeries } from './seriesFocus';

import {
  seriesColour,
  CAT_UNASSIGNED,
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

// ═════════════════════════════════════════════════════════════════════════════
// §ANALYSIS-FOLD-STATE (L-12063) — the note blocks fold; the QUALIFIER does not
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE FOUNDER'S REQUEST, VERBATIM: *"Can you make all those sections foldable
// or unfoldable? They are taking too much space and they are just notes — that I
// mostly don't care about."* He is right about the space and he is right that the
// prose is not what he is reading the card for.
//
// ⛔⛔ AND THIS IS THE ONE PLACE THE OBVIOUS IMPLEMENTATION IS A DEFECT. Those
// blocks are §CONTEXT-DATA-HONESTY artefacts: they exist so a LOWER-BOUND number
// is never read as a complete one. A fold that hid the whole block would turn a
// QUALIFIED number into an apparently-unqualified one — the reader would see
// "302 relationships" with nothing beside it, which is a different and false
// claim. That is the same family as "I hold nothing" and "I hold something I
// cannot attribute" collapsing to one value, and this repository has paid for it
// four times.
//
// ⭐ SO THE SPLIT IS: THE QUALIFIER LIVES ON THE HEADER, THE EXPLANATION FOLDS.
// A collapsed fold still shows its label and its state CHIPS — "⚠ LOWER BOUND",
// "⚠ STALE", "Showing 320 of 488 elements". What goes away is the paragraph
// explaining WHY, which is exactly the part he does not want and the part whose
// absence changes no number's meaning.
//
// ⚠ CHIPS ARE STATE WORDS AND SHORT AUTHORED COUNTS, NEVER PARAPHRASES. A
// paraphrase of a governed sentence is a second, quietly-divergent copy of it,
// and the first qualifier dropped in the shortening is the one that mattered.

/** The plate a fold paints on. Same four tones the strips already use. */
type FoldTone = 'warn' | 'err' | 'ok' | 'scope';

/** A chip that stays on the header in BOTH states. */
interface FoldChip {
  readonly text: string;
  readonly tone: 'warn' | 'err' | 'ok' | 'neutral';
}

interface FoldSpec {
  /** Stable storage id. Persisted per project through `analysisLayout`. */
  readonly id: string;
  /** Always visible. Carries any number the reader must not lose. */
  readonly label: string;
  readonly chips?: readonly FoldChip[];
  /** Open when this reader has never touched this fold. */
  readonly defaultOpen: boolean;
  readonly tone: FoldTone;
  /** Fills the body. Called only while OPEN — see the note below. */
  readonly fill: (body: HTMLElement) => void;
}

/**
 * One collapsible note block.
 *
 * ⛔ A COLLAPSED BODY IS NOT IN THE DOCUMENT, it is not merely `hidden`. Two
 * reasons, and the second is the one that matters:
 *   1. a `hidden` subtree still contributes to `textContent`, so "the prose is
 *      folded away" would be a claim no test could distinguish from a lie;
 *   2. the surface's whole argument is that what is on screen is what is true.
 *      Keeping the paragraph in the tree and merely invisible leaves a second,
 *      unreachable copy of a governed sentence for the next reader to find.
 *
 * ⛔ TOGGLING REBUILDS THIS FOLD ONLY — it does NOT fire `GRAPH_VIEW_EVENT`. A
 * surface-wide refresh here would dispose and re-mount the shared WebGL viewport
 * every time the reader opened a paragraph, which is a GPU context churn paid for
 * a disclosure triangle.
 */
function foldable(host: HTMLElement, spec: FoldSpec): HTMLElement {
  const wrap = el('div', `anl-fold anl-fold--${spec.tone}`);
  wrap.dataset.fold = spec.id;

  const head = el('button', 'anl-fold-head');
  head.type = 'button';
  const caret = el('span', 'anl-fold-caret');
  const label = el('span', 'anl-fold-label', spec.label);
  head.append(caret, label);
  for (const c of spec.chips ?? []) {
    head.appendChild(el('span', `anl-fold-chip anl-fold-chip--${c.tone}`, c.text));
  }

  const body = el('div', 'anl-fold-body');
  wrap.append(head, body);

  const paint = (open: boolean): void => {
    head.setAttribute('aria-expanded', String(open));
    head.title = open ? 'Hide this note' : 'Show the full note';
    caret.textContent = open ? '▾' : '▸';
    body.replaceChildren();
    body.hidden = !open;
    if (open) spec.fill(body);
  };

  paint(foldOpen(spec.id, spec.defaultOpen));

  head.addEventListener('click', () => {
    const next = head.getAttribute('aria-expanded') !== 'true';
    setFoldOpen(spec.id, next);
    paint(next);
  });

  host.appendChild(wrap);
  return wrap;
}

// ── The completeness / coverage strips ────────────────────────────────────────

/**
 * The strip that makes `complete: false` visible ON THE CARD'S FACE. SPEC §2:
 * a widget with `complete:false` MUST say so; it may not round, extrapolate, or
 * omit. This is that requirement, rendered.
 *
 * ⚠ AMENDED 2026-08-26 (§ANALYSIS-FOLD-STATE, L-12063). It is now a FOLD, and
 * what folds is the reason list, never the claim. The header reads *"Incomplete —
 * every total here is a LOWER BOUND"* in both states; only the producers' cited
 * causes go away. SPEC §2's requirement is *"a widget with `complete:false` MUST
 * say so"*, and it still says so, on one line instead of four.
 */
export function completenessStrip(result: AnalysisResult): HTMLElement | null {
  if (result.complete) return null;
  // ⚠ AMENDED 2026-08-26 (§DEMO141, L-12301) — also null in presentation mode.
  // This fold is exactly the class of chrome the founder asked hidden for a
  // pitch: "Incomplete — every total here is a LOWER BOUND" plus a matching
  // chip is a yellow banner whether or not the paragraph under it is open. The
  // claim survives elsewhere — `AnalysisSurface._card` still marks the card
  // with a compact marker, and every headline that already prints "≥ N" keeps
  // doing so — this fold was never the ONLY carrier of the qualifier.
  if (presentationMode()) return null;
  const host = el('div', 'anl-fold-host');
  foldable(host, {
    id: 'w.completeness',
    // ⛔ THE CLAIM IS THE LABEL. Shortening this to "Incomplete" would leave the
    // reader with a word that could mean a slow load; "LOWER BOUND" is what tells
    // them the numbers below are floors.
    label: 'Incomplete — every total here is a LOWER BOUND',
    chips: [{ text: '⚠ LOWER BOUND', tone: 'warn' }],
    defaultOpen: false,
    tone: 'warn',
    fill: (b) => {
      b.appendChild(
        el(
          'span',
          'anl-strip-text',
          // §ANALYSIS-INCOMPLETE-REASON (L-3303) — the producer's own words. This
          // string used to be built from `unreachable.length` alone, so a truncated
          // or stale GRAPH card announced "0 source(s) could not be read", which is
          // both false and self-refuting.
          result.incompleteReason.length > 0
            ? `Why: ${result.incompleteReason.join(' · ')}`
            : 'The source named no cause. Treat every figure here as a floor.',
        ),
      );
    },
  });
  return host;
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
      : 'categories known to the take-off engine';
  const lede = el(
    'p',
    'anl-lede',
    `${rows.length} ${noun} · ${notMeasured} NOT MEASURED · ${counted} counted only. ` +
      'A category that is not measured produces no line and is NEVER rendered as a zero — that is the difference between ' +
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
  fams.appendChild(el('div', 'anl-kpi-label', 'categories present'));
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
 * The relationship graph — §GRAPH-3D-VIEWPORT + §GRAPH-HIERARCHY-VIEWS (L-8440…).
 *
 * ⭐ WHAT SHIPS ON THIS CARD, AND WHY NONE OF IT IS GARNISH:
 *   1. the SCOPE control (storey) — every figure below is a figure ABOUT the
 *      universe it names, so it sits above everything it governs;
 *   2. the LIVENESS strip — until L-3251 the only honest label for this graph was
 *      "stale by construction" and there was no code path that could say it;
 *   3. the VIEW selector — six projections of ONE graph (ADR-0364). Each carries
 *      its own basis line and, when empty, its own NAMED cause;
 *   4. the 2D / 3D toggle — the same graph, the same layout algorithm, the same
 *      counts, drawn two ways;
 *   5. the CATEGORY tree — discipline → family → count, with the IFC class where
 *      the authority is wired and a named non-answer where it is not;
 *   6. the FOCUS readout — what the current model selection reaches, stated with
 *      every operand so the reader can check it;
 *   7. the TRUNCATION notice — a reader counts what they can see, and a silently
 *      clipped graph understates the building's connectivity.
 *
 * ⛔ Renders ONCE per change. No animation, no rAF (P3) — the 3-D viewport draws
 * on demand through the frame scheduler and costs zero frames while idle.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ AMENDED 2026-08-26 (§ANALYZE129 — the founder read the shipped card)
 * ═════════════════════════════════════════════════════════════════════════════
 * *"The relationship graph is absolutely amazing; however it is difficult to
 * read."* Four of items 1-7 above were correct and unreadable, and the changes are
 * all about the READING, never about what is counted:
 *
 *   · items 2, 6, 7 and the basis line are now FOLDS (§ANALYSIS-FOLD-STATE). The
 *     qualifier stays on the header; the paragraph folds. Default shut.
 *   · the graph has its own STAGE with a corner expand control (§GRAPH-EXPAND)
 *     and real height. Nothing it shows changes when it grows.
 *   · nodes are separated by a measured repulsion multiplier (§GRAPH-SEPARATION).
 *   · ⭐ AND THE NODES ARE COLOURED, WHICH THEY WERE SUPPOSED TO BE ALREADY — see
 *     `graphNodeColour` below for the one-line bug that made the founder's 3-D
 *     graph a grey cloud while the card's own footer claimed "colour = element
 *     family".
 */
export function renderGraph(host: HTMLElement, _def: AnalysisWidgetDef, _result: AnalysisResult): void {
  const g = projectGraph(censusPlacement());
  bindExpandEscape();

  // ── Scope, above everything it governs ─────────────────────────────────────
  //
  // ⚠ AMENDED 2026-08-26 (§GRAPH-EXPAND-CONTROLS-SURVIVE, L-12301) — CAPTURED,
  // not appended immediately. The founder: *"on the top, on the graph extended
  // mode, we want to still see this to filter"* — the storey scope and the
  // relationship-view selector are the ONLY way to change what the graph shows,
  // and his screenshot showed them gone the moment he expanded it.
  //
  // ⛔ THE CAUSE: `.anl-graph-stage--expanded` is `position: absolute; inset: 0`
  // against `.anl-grid-viewport` (§SCROLL136) — the wrapper that holds the WHOLE
  // grid, not just this card. These two bars used to be siblings of the stage,
  // appended to `host` BEFORE it; an absolutely-positioned, opaque, z-index:60
  // box painted after them in the same stacking context covers earlier siblings
  // regardless of which card they belong to. The `.anl-facets` cross-filter bar
  // is NOT this bug — it is a sibling of `.anl-grid-viewport` itself, one level
  // higher, and was never inside the area the stage covers.
  //
  // ⭐ THE FIX IS TO PLACE THESE, NOT CLONE THEM. Two live instances of one
  // control is its own defect — a click on one would leave the other showing a
  // stale state. They become the stage's own first children, below, so they
  // travel with it through expand/collapse exactly as the toolbar already does.
  const storeyBar = levelScopePicker();

  if (g.unreachable.length > 0) {
    host.appendChild(storeyBar);
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

  // ── The view selector, and the projection it produces ──────────────────────
  const viewBar = viewSelector();

  const families = censusFamilies();
  const projection = projectHierarchy(g.nodes, g.edges, graphView(), {
    families,
    // ⛔ NO IFC RESOLVER YET, AND THAT IS DELIBERATE. Lane IFCTREE47 owns the
    // single PRYZM-type → IFC-class authority and its files were untracked when
    // this shipped, so `null` makes every IFC cell say "not resolved yet" rather
    // than guess. Wiring it is ONE argument; re-deriving the map here would be a
    // fifth rival table (there are already four).
    ifc: null,
  });

  if (projection.empty !== null) {
    // ⛔ THE NAMED CAUSE, NEVER A BLANK CANVAS. The System view reaches this on
    // every model and it must read as a fact about the product, not a broken
    // feature. The toolbar still ships, so the reader can leave the empty view.
    // No `stage` exists on this branch (there is no graph to draw), so the two
    // scope bars land on `host` directly — the expand-cover bug this lane fixes
    // cannot occur here.
    host.appendChild(storeyBar);
    host.appendChild(viewBar);
    graphNotes(host, g, projection, null);
    host.appendChild(graphToolbar(host, projection, g));
    host.appendChild(el('p', 'anl-empty', projection.empty));
    host.appendChild(categoryTree(projection));
    return;
  }

  // ── The focus: what the model selection reaches ────────────────────────────
  //
  // ⭐ §GRAPH-FOCUS-FROM-MODEL (L-8420) — THE FOUNDER'S SECOND SENTENCE. Selecting
  // a wall in the PRYZM viewport dispatches on `selectionBus`; this card reads the
  // CURRENT selection and lights that element's typed neighbourhood. The rest is
  // dimmed, never removed, so every count above stays true.
  const selected = selectionBus.currentIds ?? [];
  const focus = selected.length > 0
    ? focusNeighbourhood(projection, [...selected], graphFocusDepth())
    : null;

  // ── Stable colour indices, shared by BOTH modes and BOTH legends ───────────
  //
  // ⚠ AMENDED §CLEAN150 (L-12481) — THE LABEL USED TO ASK A DIFFERENT, WORSE
  // AUTHORITY THAN THE COLOUR DID. `familyOfNode(n, families)` — THE census-
  // then-kind LADDER `hierarchy.ts` itself documents as authoritative — was
  // already being computed here and fed to `familyOf` (colour/legend/grouping)
  // as `fam`, but `readableLabel(n)` below read `n.kind` directly and never saw
  // it. Three of the five UBG adapters (`semanticAdapter.ts:46-47`,
  // `dependencyAdapter.ts:36-37`, `constraintAdapter.ts:50`) stamp `kind:
  // 'element'` UNCONDITIONALLY on every endpoint they materialise, regardless of
  // what the element actually is — so a wall reached only through `hostedIn` /
  // `dependsOn` carried `kind: 'element'` even though the census (the SAME
  // resolver the colour already trusted) knew it was a wall. The founder's
  // report — "there nodes called elements - but we know for sure what element is
  // - provide the category please" — is that gap: the SAME node could be
  // coloured correctly (via `familyOf`) while its printed label still read
  // "element 4afc", a within-card contradiction that is exactly the rival-
  // authority shape C84 EI-9 names. Resolving ONCE and handing the SAME answer
  // to both consumers is the fix; a second ladder inside `readableLabel` would
  // have been the mistake repeated, not corrected.
  const edgeTypeIndex = new Map<string, number>();
  for (const t of projection.edgeCounts.keys()) if (!edgeTypeIndex.has(t)) edgeTypeIndex.set(t, edgeTypeIndex.size);
  const groupIndex = new Map<string, number>();
  const familyOf = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const familyCounts = new Map<string, number>();
  for (const n of projection.nodes) {
    const resolvedFamily = familyOfNode(n, families);
    const fam = resolvedFamily ?? n.kind;
    familyOf.set(n.id, fam);
    labelOf.set(n.id, readableLabel(n, resolvedFamily));
    if (!groupIndex.has(fam)) groupIndex.set(fam, groupIndex.size);
    familyCounts.set(fam, (familyCounts.get(fam) ?? 0) + 1);
  }

  const degrees = nodeDegrees(projection.edges);

  // ── The note blocks, folded (§ANALYSIS-FOLD-STATE, L-12063) ────────────────
  graphNotes(host, g, projection, focus);

  // ═══ THE STAGE (§GRAPH-EXPAND, L-12062) ═══════════════════════════════════
  //
  // ⭐ THE STAGE IS ONE ELEMENT AND THE EXPANDED VIEW IS THE SAME ELEMENT WITH A
  // CLASS ON IT. Not a modal, not a second render, not a cloned subtree. That is
  // what makes "preserve the selection and the layout across expand and collapse"
  // true by construction: there is nothing to preserve THROUGH, because nothing is
  // rebuilt from different inputs. The orbit and the solved layout are module
  // state in `graphViewState`, the selection is `selectionBus`, and neither is
  // keyed on size.
  //
  // ⛔ IT EXPANDS TO FILL THE ANALYSIS PANEL, NOT THE VIEWPORT, and that is an
  // architectural choice rather than a CSS convenience. ADR-0343 §D.1 reason 2:
  // every widget on this surface is a SELECTOR, and clicking a node here paints
  // the element in the 3-D model on the LEFT HALF of the screen. A graph that
  // covered the model would sever the one join that makes the card worth reading.
  const stage = el('div', `anl-graph-stage${graphExpanded() ? ' anl-graph-stage--expanded' : ''}`);

  // §GRAPH-EXPAND-CONTROLS-SURVIVE (L-12301) — the storey and relationship-view
  // controls are now the stage's OWN first children, not the card's, precisely
  // so expanding the graph does not black them out. See the comment where
  // `storeyBar` / `viewBar` were captured, above.
  //
  // ⚠ THE HONESTY PIN IS THEREFORE NO LONGER THE STAGE'S FIRST CHILD. Its
  // `position: sticky; top: 0` still works — sticky resolves against the
  // nearest SCROLLING ancestor at whatever point its own normal-flow position
  // reaches that offset, it does not require being the first element — but a
  // reader scrolling from the very top now sees these two bars scroll past
  // before the pin locks, rather than the pin locking immediately. That is a
  // disclosed trade, not an oversight: the alternative was two sticky bands
  // stacked at competing `top` offsets, which is real complexity for a
  // scrolling nicety nobody asked for, and it stays open as a fast-follow if
  // the founder wants the controls pinned too.
  stage.appendChild(storeyBar);
  stage.appendChild(viewBar);

  // ⭐⭐ THE HONESTY PIN — NEVER FOLDABLE, NEVER OUTSIDE THE STAGE.
  //
  // Two independent reasons, and the second is why it lives HERE rather than
  // beside the folds:
  //   1. every note block on this card can be shut. The claim "these totals are
  //      floors" must survive that, or folding would have turned a qualified
  //      number into an apparently-unqualified one — the defect §ANALYSIS-FOLD-STATE
  //      is written against.
  //   2. the EXPANDED stage covers the card's own header, and the `INCOMPLETE`
  //      badge lives in that header. Without this line, maximising the graph would
  //      silently drop the surface's loudest qualifier at exactly the moment the
  //      reader is looking hardest at the picture.
  //
  // ⚠ AMENDED 2026-08-26 (§DEMO141, L-12301) — also gated on presentation mode.
  // This IS the second of the founder's two duplicate yellow banners (the tab
  // status line was the first — see `AnalysisSurface._setStatus`), and it is
  // exactly the paragraph a pitch demo should not show. Reason 2 above still
  // holds even with this paragraph gone: `AnalysisSurface._card` gives the card
  // head a compact, non-warning "≥" marker in presentation mode instead of the
  // `INCOMPLETE` text badge — see that function — so the claim does not
  // disappear, it shrinks to the size the founder asked for.
  //
  // ⚠ AMENDED §CLEAN150 (L-12480) — A THIRD BRANCH, FOR THE EXPANDED CASE, AND
  // IT IS NOT THE SAME AS PRESENTATION MODE. Founder, verbatim: *"exclude the
  // yellow tabs completely when the graph is big (extended) - leave all white
  // ... that's all for the analysis side."* Unlike presentation mode (a
  // separate, persisted, manual toggle the reader must ALSO press), this is
  // the direct behaviour of the expand (⤢) control itself — expanding the
  // graph is, on its own, "make this a clean canvas", with no second click.
  //
  // ⛔ BUT REASON 2 ABOVE IS *WORSE* HERE THAN IN PRESENTATION MODE, NOT
  // ABSENT. Presentation mode leaves the card head on screen (only the STAGE'S
  // prose goes quiet), so its "≥" marker is reachable — that is reason 2's
  // whole answer. Expanding COVERS the card head (the very fact reason 2 is
  // making the case for). So going straight to "print nothing" here would be
  // the ONE combination — expanded AND incomplete — where the surface's
  // loudest qualifier is unreachable by ANY path. `expandedBoundNotice` below
  // is the stage's own quiet carrier: `foldable()` (the SAME persisted-fold
  // primitive `graphNotes` already uses — C84 EI-9, reuse, not a second
  // mechanism), `tone: 'scope'` rather than `'warn'` (the accent-violet
  // treatment already used for this card's OWN storey/basis/focus folds, never
  // the yellow the founder is asking to be rid of), collapsed by default, one
  // click or one Enter key from the full sentence. The bound is DEMOTED, never
  // deleted.
  if (!g.complete) {
    if (graphExpanded()) {
      stage.appendChild(expandedBoundNotice(g, projection));
    } else if (!presentationMode()) {
      stage.appendChild(
        el(
          'p',
          'anl-honesty-pin',
          `⚠ INCOMPLETE — every total on this card is a LOWER BOUND  ·  ` +
            `${projection.nodes.length} of ${g.totalNodes} elements and ` +
            `${projection.edges.length} of ${g.totalEdges} relationships drawn` +
            (g.incompleteReason.length > 0 ? `  ·  ${g.incompleteReason[0]!}` : ''),
        ),
      );
    }
    // else: presentation mode, NOT expanded — the card head is on screen and
    // its quiet "≥" marker (`AnalysisSurface._card`) is the sole carrier,
    // exactly as §DEMO141 shipped. Nothing to add here in that case.
  }

  stage.appendChild(graphToolbar(host, projection, g));

  const focusCtl = new SeriesFocus(host);
  const frame = el('div', 'anl-graph-frame');
  const box = el('div', 'anl-nodelink-box');
  frame.append(box, expandButton());
  stage.appendChild(frame);

  // ── The two legends (§GRAPH-EXPAND-HEIGHT, L-12301) ────────────────────────
  //
  // ⚠ MOVED HERE, BEFORE THE HEIGHT IS COMPUTED AND BEFORE THE GRAPH IS MOUNTED.
  // They used to be appended after the mount, which was fine for their OWN
  // rendering — nothing here reads anything the mount produces — but it meant
  // the reserve arithmetic below could not measure them: they simply did not
  // exist yet. Building them first costs nothing (`groupIndex`, `familyCounts`,
  // `edgeTypeIndex` and `projection.edgeCounts` are all already known) and turns
  // "the legends take about this much room" back into a measurement.
  //
  // ⭐ THE NODE LEGEND CLOSES A CLAIM THE CARD HAS ALWAYS MADE. The footer says
  // "colour = element category"; until now there was no table saying WHICH family
  // each colour was, so the sentence was unreadable and the picture was eight
  // anonymous hues.
  renderNodeLegend(stage, groupIndex, familyCounts, focusCtl);

  // The legend is also a QUERY surface: a row lights its whole relation family.
  // ⚠ Built from `projection.edgeCounts`, which includes families that produced
  // NOTHING — a legend listing only what fired cannot tell the reader what did not.
  const edgeLegendCounts = new Map<string, number>();
  for (const [t, n] of projection.edgeCounts) edgeLegendCounts.set(t, n);
  renderEdgeLegend(stage, edgeTypeIndex, edgeLegendCounts, focusCtl);

  // ⚠ HEIGHT IS PASSED, NOT LEFT TO CSS, because the 3-D viewport sizes a canvas
  // BACKING STORE from `frame.clientHeight` and happy-dom/first paint would hand
  // it a zero. The two numbers below are the founder's other request — item (a) of
  // ASK 3: the canvas was 380 px under a stack of note blocks taller than itself.
  //
  // ═════════════════════════════════════════════════════════════════════════
  // §GRAPH-EXPAND-HEIGHT (L-12201, amended L-12301) — 'the graph should be bigger'
  // ═════════════════════════════════════════════════════════════════════════
  // The founder's screenshot of the expanded (⤢) view showed the stage running
  // up under the panel's own chrome, AND the legend row sitting right at the
  // bottom edge. Both are the SAME bug: `− 300` was tuned against the OLD,
  // wrong assumption that the expanded stage fills the whole 'window.innerHeight'
  // — it never cleared '.anl-header' / '.anl-tabs' / '.anl-facets' / '.anl-status'
  // at the top (fixed in `analysisSurface.ts` via the new '.anl-grid-viewport'
  // wrapper — see §SCROLL136 there) and left an under-measured guess for the
  // pin/toolbar/legends below the canvas.
  //
  // ⚠ AMENDED 2026-08-26 (§DEMO141) — the "legend" term below used to be a
  // CONSTANT, `STAGE_INTERNAL_RESERVE_PX = 180`, calibrated against ONE real
  // Chromium render. It could only ever be as right as that screenshot: the
  // same afternoon, presentation mode learned to remove the honesty pin and
  // the whole notes row above, and the tab-level status line lost a duplicated
  // sentence — every one of those SHRINKS the true reserve, and a constant does
  // not know that. The founder's literal ask, "the graph should be bigger", is
  // exactly what a fixed reserve cannot deliver once there is less chrome to
  // reserve room for.
  //
  // ⭐ THE ARITHMETIC, MEASURED NOT GUESSED: available height = viewport −
  // chrome − stage-internal reserve.
  //   viewport = `window.innerHeight`.
  //   chrome   = the LIVE rendered height of the four bands the graph's own
  //              stage must clear, read straight off the DOM rather than
  //              hand-typed — a facet bar that is `hidden` contributes a real
  //              zero automatically, it does not need its own branch.
  //   reserve  = `stageInternalReservePx()` below: every DIRECT CHILD of the
  //              stage OTHER THAN THE FRAME — the storey bar, the view bar, the
  //              honesty pin (if rendered), the toolbar, both legends — summed
  //              from ITS OWN live `getBoundingClientRect().height`, plus one
  //              flex gap per visible sibling and the stage's own top+bottom
  //              padding. A hidden pin (presentation mode, or a complete graph
  //              with nothing to disclose) measures 0 and needs no branch here
  //              to say so — that is the whole point of measuring instead of
  //              declaring a constant.
  // The 2-D SVG path sets this as a `min-height`, so if the reserve is over-
  // generous the canvas simply grows to fill the slack. The 3-D path sets an
  // EXACT `height` (§GraphViewport.ts:132) with no such slack, which is why
  // this must be a real subtraction rather than a floor.

  /** The four bands the expanded stage must clear, summed from their LIVE
   *  rendered heights — not re-typed constants that rot the moment a header
   *  or the tab strip resizes. Returns 0 outside a browser (SSR/tests), which
   *  correctly falls back to the `Math.max(460, …)` floor below rather than a
   *  bogus subtraction. */
  function expandedChromeAboveGridPx(): number {
    if (typeof document === 'undefined') return 0;
    let total = 0;
    for (const sel of ['.anl-header', '.anl-tabs', '.anl-facets', '.anl-status']) {
      const bandEl = document.querySelector<HTMLElement>(sel);
      if (bandEl) total += bandEl.getBoundingClientRect().height;
    }
    return total;
  }

  /**
   * Everything inside the stage that is NOT the graph frame, measured live —
   * the same technique `expandedChromeAboveGridPx()` uses one level up.
   *
   * ⛔ `frame` is excluded on purpose: it is the `flex: 1 1 auto` child this
   * reserve is being computed FOR (when expanded), so measuring it would be
   * circular — it has no fixed height of its own yet.
   *
   * `GAP_PX` and `STAGE_PADDING_PX` mirror `.anl-graph-stage { gap: 8px }` and
   * `.anl-graph-stage--expanded { padding: 12px 14px }` in `analysisSurface.ts`
   * (the styles module) — read the rule, not this number, if either ever moves.
   */
  function stageInternalReservePx(stageEl: HTMLElement, exclude: HTMLElement): number {
    if (typeof document === 'undefined') return 0;
    const GAP_PX = 8;
    const STAGE_PADDING_PX = 24; // 12px top + 12px bottom
    let content = 0;
    let visible = 0;
    for (const child of Array.from(stageEl.children)) {
      if (child === exclude) continue;
      const h = (child as HTMLElement).getBoundingClientRect().height;
      if (h > 0) { content += h; visible += 1; }
    }
    // One gap per boundary between visible boxes, INCLUDING the boundary above
    // the (always-present) frame: `visible` siblings plus the frame is
    // `visible + 1` boxes in the flex column, i.e. `visible` gaps between them.
    return content + visible * GAP_PX + STAGE_PADDING_PX;
  }

  const heightPx = graphExpanded()
    ? Math.max(
        460,
        (typeof window === 'undefined' ? 900 : window.innerHeight) -
          expandedChromeAboveGridPx() -
          stageInternalReservePx(stage, frame),
      )
    : 430;

  if (graphMode() === '3d') {
    const handle = mountGraphViewport(box, {
      subject: buildGraphSubject({
        projection,
        degrees,
        // ⛔ HANDED OVER AS A TOKEN, DELIBERATELY — see §GRAPH-NODE-COLOUR below.
        // Token → literal is OWNED by `styles/categoricalPalette.resolveCssColour`
        // (lane QTYHL132, L-12120) and is applied downstream, at the consumer that
        // actually needs a literal. ⚠ DO NOT WRITE DOWN WHICH FILE THAT IS: it
        // moved twice while this lane was open. The durable statement is the arm —
        // `graph3dColourReachesThree.spec.ts` fails if a `var()` ever reaches
        // THREE — and the rule, which is that there is exactly ONE resolver.
        // This lane had added a second call here and removed it: two resolvers for
        // one value is the rival-mapping defect C84 EI-9 names, and the copy is
        // always the one that rots.
        nodeColour: (id) => seriesColour(groupIndex.get(familyOf.get(id) ?? '') ?? 0, familyOf.get(id)),
        edgeColour: (t) => seriesColour(edgeTypeIndex.get(t) ?? 0, t),
        focus,
        scale: graphNodeScale(),
        caption: `${projection.def.label} — ${projection.nodes.length} elements, ${projection.edges.length} relations`,
      }),
      heightPx,
      labels: graphLabels(),
      labelOf: (id) => labelOf.get(id) ?? id,
      // The orbit is owned OUTSIDE the widget so a re-render (which every
      // selection causes) does not snap the camera back to the default.
      orbit: graphOrbit(),
      // ⛔ The SAME dispatch the 2-D card and every other surface uses (C27 §4).
      // A private event here would be a second idea of what "selected" means.
      onPick: (id) => selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: [id] }),
    });
    // ⚠ MOUNT, SWAP, THEN DISPOSE — in that order. Disposing first would drop the
    // shared WebGL mount count to zero between the two, forcing a context loss and
    // an immediate re-creation on a surface whose whole design is one context.
    const previous = _liveViewport;
    _liveViewport = handle;
    // §C13-ANALYSIS-VIEWPORT-OWNER — stamp the owner in the same statement group
    // that takes the handle, so the two can never drift apart.
    _liveViewportProjectId = viewportActiveProjectId();
    previous?.dispose();
  } else {
    if (_liveViewport) {
      _liveViewport.dispose();
      _liveViewport = null;
      _liveViewportProjectId = null;
    }
    const nodes = projection.nodes.map((n) => ({
      id: n.id,
      label: labelOf.get(n.id) ?? n.id,
      group: familyOf.get(n.id) ?? n.kind,
      weight: degrees.get(n.id) ?? 1,
    }));
    box.style.minHeight = `${heightPx}px`;
    renderNodeLink(box, nodes, projection.edges, {
      // §GRAPH-SEPARATION (L-12060). ⛔ THE 2-D LEVER IS THE EXTENT, NOT THE
      // REPULSION MULTIPLIER, and that is measured rather than assumed — see
      // `forceLayoutND.SEPARATION_DEFAULT`. At 620×380 with 320 nodes the pass is
      // saturated against the padding clamp: mean nearest-neighbour distance is
      // 18.29 and the MINIMUM is 0.00, i.e. exactly-coincident bodies were
      // reachable on the shipped card. At 900×560 they are 28.87 and 14.42.
      width: GRAPH_2D_EXTENT[0],
      height: GRAPH_2D_EXTENT[1],
      // ⭐ The marks are scaled BACK UP by the same factor the viewBox grew, so
      // the extra room lands in the GAPS rather than being cancelled by the
      // uniform rescale an SVG viewBox performs. `graphNodeScale()` rides along —
      // in 2-D the "Node size" slider reached nothing at all before this lane.
      markScale: graphNodeScale() * (GRAPH_2D_EXTENT[0] / 620),
      edgeTypeIndex,
      groupIndex,
      onPick: (id) => selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: [id] }),
      focus: focusCtl,
    });
  }

  // The two legends were built and appended to `stage` earlier, BEFORE the
  // height reserve was measured — see §GRAPH-EXPAND-HEIGHT above for why.

  host.appendChild(stage);

  if (projection.undirected.size > 0) {
    host.appendChild(
      el(
        'p',
        'anl-card-foot',
        `⚠ ${[...projection.undirected].join(' and ')} are drawn UNDIRECTED. The topology test behind them is a ` +
          'SYMMETRIC overlap, so an edge means "these two touch", never "this one contains that one".',
      ),
    );
  }

  host.appendChild(categoryTree(projection));

  // ⚠ FIXED 2026-08-26 (§DEMO141, L-12301) — the "≥" prefix was keyed on
  // `g.truncated` alone, which is ONE of `!g.complete`'s three causes (the
  // others are stale freshness and `scope.excludedUnplaceable`). A graph that
  // was incomplete for either of the OTHER two reasons printed this exact line
  // with no marker at all — a bare "348 drawn relationship(s) of 484 projected"
  // where the honest reading is "≥ 348". That was always a latent gap; it
  // stayed harmless while the honesty pin above always also rendered, but this
  // footer is precisely the line presentation mode and a fully-collapsed card
  // both fall back to as the compact marker (SPEC's "a lower-bound figure must
  // still look like one"), so it must carry the qualifier ON ITS OWN.
  host.appendChild(
    el(
      'p',
      'anl-card-foot',
      `${!g.complete ? '≥ ' : ''}${projection.edges.length} drawn relationship(s) of ${g.totalEdges} projected  ·  ` +
        `${projection.nodes.length} of ${g.totalNodes} elements  ·  node size = √degree  ·  colour = element category` +
        (projection.unresolvedFamilyCount > 0
          ? `  ·  ⚠ ${projection.unresolvedFamilyCount} node(s) have no category the census can resolve, so every ` +
            'category count is a floor'
          : ''),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// §GRAPH-NODE-COLOUR (L-12064) — the axis, the legend, and who owns the fix
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE FOUNDER ASKED FOR COLOURED NODES. THE CARD ALREADY HAD THEM, ON PAPER.
// `renderGraph` has always filled nodes from `seriesColour(groupIndex…)` and its
// footer has always printed *"colour = element category"* — and in 2-D that is
// exactly what happens. In 3-D, the DEFAULT mode and the one in his screenshot,
// every node was the same pale grey.
//
// ⛔ THE CAUSE WAS ONE UNRESOLVED CSS VARIABLE. `seriesColour()` returns the TOKEN
// `var(--app-cat-1)`, which is right for SVG and for CSS and is meaningless to
// `THREE.Color.set()`; an unparseable string leaves the instance at its default
// (WHITE) and prints a warning nobody was reading, so every node drew white under
// a MeshStandardMaterial over a near-white ground. `GraphNodeMark.colour`'s own
// type had already declared the contract — *"already resolved by the caller"* —
// and the caller was not resolving.
//
// ⭐⭐ THAT HALF IS **NOT THIS LANE'S FIX, AND SAYING SO IS THE POINT.** Lane
// QTYHL132 (L-12120…L-12123) found the same defect concurrently and closed it at a
// strictly better seam: `styles/categoricalPalette.ts` makes TypeScript the
// AUTHORITY for the nine values, generates the `--app-cat-*` CSS from it, and
// resolves through `resolveCssColour` — a table lookup needing no live document,
// which refuses in the designated magenta rather than in a plausible colour. This
// lane had written a second resolution at the call site above and **DELETED IT**
// on finding theirs: two resolvers for one value is the rival-mapping defect
// C84 EI-9 names, and it does not stop being one because both copies happen to be
// correct today.
//
// ⚠ WHERE that resolver is CALLED moved twice inside one afternoon (subject
// builder → THREE consumer), which is exactly why neither this block nor the call
// site names a file for it. The invariant is "exactly one resolver, and no `var()`
// reaches THREE"; the artefact that holds it is `graph3dColourReachesThree.spec.ts`.
// Read the arm, not this paragraph.
//
// ⚠ WHAT THIS LANE OWNS IS THE AXIS AND THE KEY. A categorical encoding with no
// legend is decoration, and the card had none for nodes — eight anonymous hues
// under a footer claiming they meant something. `renderNodeLegend` is that key.
//
// ⭐ WHY THE AXIS IS ELEMENT FAMILY AND NOT RELATION FAMILY. The founder pasted
// the six-view RELATIONSHIPS row beside his request, so the reading matters and it
// is deliberately the conservative one:
//   · a VIEW is a GLOBAL MODE, not a per-node property. Colouring by it would give
//     every node on screen the same colour — the grey cloud again, with an extra
//     step and a legend of one row;
//   · the relation family ALREADY OWNS A CHANNEL. It is the EDGE colour and it has
//     had a legend since the card shipped. Spending the same eight-value rotation
//     on both would put two meanings on one scale and make the edge legend a lie;
//   · "what IS this thing" — wall, door, room, slab — is the question a reader has
//     while looking at a node, and it is the axis the card's own footer claims.
// So: NODES = element family, EDGES = relation family, two legends, two SWATCH
// SHAPES (disc vs bar) so the two keys cannot be confused. No "colour by" switch
// is offered, because the alternative axis is already on screen.
//
// ⚠ THE BRAND ACCENT STAYS THE ACCENT. `--app-cat-1` IS #6600FF, so the rotation
// leads with the brand rather than beside it; the focused/hovered node keeps its
// purple ring (`GraphViewport.PURPLE`, `.anl-focused` → `--app-accent`) and the
// dormant treatment stays LIGHTENING, never removal. Nothing here mints a colour.

/**
 * §GRAPH-SEPARATION (L-12060) — the 2-D layout box.
 *
 * ⛔ NOT A CANVAS SIZE. It is the viewBox the force layout solves inside; the SVG
 * is `width:100%` and scales to whatever the card gives it. Enlarging it buys
 * ROOM BETWEEN NODES, and `markScale` puts the mark sizes back so that room is not
 * immediately cancelled by the rescale. Measured at n=320: 620×380 → mean
 * nearest-neighbour 18.29 / minimum 0.00; 900×560 → 28.87 / 14.42.
 */
const GRAPH_2D_EXTENT: readonly [number, number] = [900, 560];

// ═════════════════════════════════════════════════════════════════════════════
// §GRAPH-EXPAND (L-12062) — the corner control, and the way back out
// ═════════════════════════════════════════════════════════════════════════════

/** The conventional maximise/restore control, in the graph's own top-right corner. */
function expandButton(): HTMLElement {
  const on = graphExpanded();
  const b = el('button', 'anl-graph-expand', on ? '⤡' : '⤢');
  b.type = 'button';
  b.title = on
    ? 'Put the graph back into the card (Esc)'
    : 'Open the graph on its own, filling this panel. Every control comes with it, and nothing it counts changes.';
  b.setAttribute('aria-label', on ? 'Restore the graph to its card' : 'Expand the graph');
  b.setAttribute('aria-pressed', String(on));
  b.addEventListener('click', () => setGraphExpanded(!on));
  return b;
}

/**
 * Escape closes the expanded graph.
 *
 * ⛔ ONE LISTENER FOR THE LIFE OF THE TAB, INSTALLED LAZILY AND NEVER REMOVED, and
 * that is the correct shape here rather than laziness. The relationship card is
 * rebuilt WHOLE on every selection change, so a listener registered per render
 * would accumulate one handler per click and every one of them would fire. The
 * handler reads the LIVE state through `graphExpanded()` and returns immediately
 * when nothing is expanded, so an idle listener costs one comparison per keystroke
 * and can never act on a stale flag.
 *
 * ⚠ It does not `stopPropagation`. Escape is a shared gesture on this app and a
 * widget that swallowed it would break whatever else is listening; it only
 * `preventDefault`s the case it actually handled.
 */
let _escapeBound = false;
function bindExpandEscape(): void {
  if (_escapeBound || typeof window === 'undefined') return;
  _escapeBound = true;
  window.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !graphExpanded()) return;
    ev.preventDefault();
    // Announces `GRAPH_VIEW_EVENT`, so the surface re-renders through the ONE
    // path the expand button also takes. Two ways to leave a mode is how the two
    // come to disagree.
    setGraphExpanded(false);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// §CLEAN150 (L-12480) — the expanded stage's own quiet carrier for `!g.complete`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The bound, demoted rather than deleted, for when the graph is expanded.
 *
 * ⭐ WHY THIS EXISTS AND IS NOT JUST "SKIP THE PIN". The card-head "≥" marker
 * (`AnalysisSurface._card`) is what presentation mode alone relies on to keep a
 * lower-bound figure looking like one once the verbose paragraph is gone — but
 * that marker lives in the CARD HEAD, and the expanded stage covers the card
 * head along with everything else on the surface (`position: absolute; inset:
 * 0` over the whole grid). Without a carrier INSIDE the stage, "the graph is
 * expanded and incomplete" would be the one state on this entire surface where
 * a lower-bound total is on screen with NOTHING beside it saying so — the exact
 * overstatement this surface exists to refuse (§CONTEXT-DATA-HONESTY, C78 §8.1).
 *
 * ⛔ `tone: 'scope'`, NEVER `'warn'`. `'warn'` paints `--app-status-warning-bg`
 * — the founder's own words were "exclude the yellow tabs completely … leave
 * all white", and repainting the SAME yellow one level down would not be that.
 * `'scope'` already carries a "this is a fact, not a warning" meaning on this
 * exact card (the storey/basis/focus folds below use it) and paints
 * `--app-violet-soft` — the ONE accent colour the founder asked to keep beside
 * white, never a third hue.
 *
 * ⛔ `foldable()`, THE SAME PRIMITIVE `graphNotes` USES — not a bespoke tooltip
 * or a hover-only affordance. Reusing it means this gets, for free, exactly
 * what the brief asks for: discoverable while collapsed (the label states the
 * claim in plain words, not just a glyph), reachable by mouse click OR by
 * keyboard (`<button>` + Enter/Space, `aria-expanded`), and persisted through
 * the SAME project-scoped fold record (`analysisLayout.ts`) every other fold on
 * this card already uses — one authority, not a second one minted for this case
 * (C84 EI-9).
 */
function expandedBoundNotice(g: GraphProjection, projection: HierarchyProjection): HTMLElement {
  const host = el('div', 'anl-fold-host');
  foldable(host, {
    id: 'graph.bound',
    // ⛔ THE CLAIM IS ON THE LABEL, COLLAPSED, so a reader never has to open
    // this to learn the totals are floors — only to learn WHY.
    label: '≥ Totals on this card are a LOWER BOUND',
    defaultOpen: false,
    tone: 'scope',
    fill: (b) => {
      b.appendChild(
        el(
          'span',
          'anl-strip-text',
          `${projection.nodes.length} of ${g.totalNodes} elements and ${projection.edges.length} of ` +
            `${g.totalEdges} relationships drawn` +
            (g.incompleteReason.length > 0 ? `  ·  ${g.incompleteReason[0]!}` : ''),
        ),
      );
    },
  });
  return host;
}

// ═════════════════════════════════════════════════════════════════════════════
// §ANALYSIS-FOLD-STATE (L-12063) — the graph card's note blocks, folded
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Every prose block on the relationship card, as folds, in one compact row.
 *
 * ⛔ WHAT SURVIVES A FULLY-COLLAPSED CARD, enumerated because the founder's brief
 * asks for exactly this and because a later reader must be able to check it:
 *   · the card header's `INCOMPLETE` badge (owned by `AnalysisSurface._card`);
 *   · the always-visible honesty pin INSIDE the graph stage — see `renderGraph`;
 *   · this row's fold LABELS, which carry the numbers: "Showing 320 of 488
 *     elements", "1 element selected";
 *   · this row's CHIPS: "⚠ LOWER BOUND", "LIVE" / "⚠ STALE", the storey scope;
 *   · the card's own footer line, which is not a fold and still prints the "≥".
 * What goes away is the PARAGRAPH under each of those, and no paragraph is the
 * sole carrier of a qualifier.
 *
 * ⚠ `projection` may be the empty-view one and `focus` may be null; both cases
 * simply contribute no fold, never an empty one. A fold with nothing in it is
 * chrome that teaches the reader to stop looking at this row.
 */
function graphNotes(
  host: HTMLElement,
  g: GraphProjection,
  projection: HierarchyProjection | null,
  focus: ReturnType<typeof focusNeighbourhood> | null,
): HTMLElement {
  const row = el('div', 'anl-notes');
  // §DEMO141 (L-12301) — presentation mode. NOT appended to `host` at all: every
  // fold this row can hold (liveness, scope, basis, focus, truncation) is the
  // same class of explanatory prose the founder asked excluded from a pitch, and
  // none of them is the sole carrier of a number — the honesty pin and the
  // card-head marker carry the LOWER BOUND claim; this row only ever carried WHY.
  //
  // ⚠ AMENDED §CLEAN150 (L-12480) — an EXPANDED graph goes quiet here too, and
  // not only because the row would be a paragraph on an otherwise-clean canvas.
  // `.anl-graph-stage--expanded` is `position: absolute; inset: 0` over the
  // WHOLE grid viewport (§SCROLL136) with a higher stacking order, so this row
  // — a sibling of `stage`, not a child of it — is already visually COVERED the
  // moment the graph expands, whether or not it renders. Rendering it anyway
  // would leave its fold-toggle buttons in the tab order, focusable and
  // clickable, behind an opaque overlay a keyboard user cannot see past — a
  // worse defect than the paragraph this suite is otherwise about. Not
  // rendering it costs nothing a reader could see: `expandedBoundNotice` below
  // is the stage's OWN carrier for the one qualifier this row is not the sole
  // holder of.
  if (presentationMode() || graphExpanded()) return row;
  const stale = g.liveness?.freshness === 'stale';

  foldable(row, {
    id: 'graph.liveness',
    label: 'Graph liveness',
    // ⛔ A STATE WORD, NOT A SUMMARY OF THE SENTENCE. `livenessSentence()` is a
    // governed string; paraphrasing it onto a chip would be a second copy, and the
    // qualifier dropped in the shortening is always the one that mattered.
    chips: [stale ? { text: '⚠ STALE', tone: 'err' } : { text: 'LIVE', tone: 'ok' }],
    defaultOpen: false,
    tone: stale ? 'err' : 'ok',
    fill: (b) => { b.appendChild(el('span', 'anl-strip-text', livenessSentence(g.liveness))); },
  });

  foldable(row, {
    id: 'graph.scope',
    label: 'Scope',
    // ⛔ 'anl-fold--scope', never the warn tone. A filter and a truncation must
    // never render identically (L-3620): this says what universe you are looking
    // at and every figure in it is exact; the truncation fold below says what the
    // tool could not deliver inside that universe.
    chips: [{ text: g.scope.levelId === null ? 'every storey' : 'one storey', tone: 'neutral' }],
    defaultOpen: false,
    tone: 'scope',
    fill: (b) => { b.appendChild(el('span', 'anl-scope-text', scopeSentence(g.scope))); },
  });

  if (projection) {
    foldable(row, {
      id: 'graph.basis',
      label: `What “${projection.def.label}” means`,
      defaultOpen: false,
      tone: 'scope',
      fill: (b) => { b.appendChild(el('span', 'anl-scope-text', projection.def.basis)); },
    });
  }

  if (projection && focus) {
    foldable(row, {
      id: 'graph.focus',
      // The COUNTS are on the label, because they are the half of this block the
      // reader is actually tracking. BOTH of them: "1 selected · 302 related".
      label: `${focus.seeds.length} selected · ${focus.nodeIds.size} related within ${focus.depth} hop(s)`,
      // ⛔ A SEED THAT IS NOT IN THIS VIEW GETS ITS OWN CHIP, and it survives the
      // fold. `NeighbourhoodFocus.seedsNotInView` exists precisely because "the
      // graph found nothing near this wall" and "this wall is not in the graph at
      // all" are different facts; folding the paragraph away while leaving only a
      // count would silently merge them back into one.
      chips:
        focus.seedsNotInView.length > 0
          ? [{ text: `⚠ ${focus.seedsNotInView.length} not in this view`, tone: 'warn' as const }]
          : undefined,
      defaultOpen: false,
      tone: focus.seedsNotInView.length > 0 ? 'warn' : 'scope',
      fill: (b) => {
        b.appendChild(el('span', 'anl-scope-text', describeFocus(focus, projection.def.label)));
      },
    });
  }

  if (g.truncated) {
    foldable(row, {
      id: 'graph.truncation',
      // ⛔ BOTH NUMBERS ON THE LABEL. "Showing 320" alone would read as a fact
      // about the model; it is a fact about the tool, and only the pair says so.
      label: `⚠ Showing the ${g.nodes.length} most-connected of ${g.totalNodes} elements`,
      chips: [{ text: '⚠ LOWER BOUND', tone: 'warn' }],
      defaultOpen: false,
      tone: 'warn',
      fill: (b) => {
        b.appendChild(
          el(
            'span',
            'anl-strip-text',
            `The layout is Barnes-Hut O(n log n) and ${GRAPH_NODE_CAP} is the largest size measured inside a ` +
              '100 ms one-shot budget. Every count on this card is therefore a lower bound.',
          ),
        );
      },
    });
  }

  host.appendChild(row);
  return row;
}

/**
 * The live 3-D viewport, if one is mounted.
 *
 * ⛔ MODULE-SCOPED AND DISPOSED ON EVERY RE-RENDER. The card is rebuilt whole on
 * each refresh, and a viewport left behind would keep a mount registered against
 * the shared WebGL context forever — the refcount would never reach zero and the
 * context would never be released, which is exactly the leak
 * `releasePreviewMount()` exists to prevent.
 */
let _liveViewport: GraphViewportHandle | null = null;

/**
 * §C13-ANALYSIS-VIEWPORT-OWNER (L-10480) — which project the live mount belongs to.
 *
 * Stamped on the resource at mount time, for the L-694b reason: a probe that infers
 * ownership cannot answer for a resource that carries no project field, and
 * `GraphViewportHandle` carries none.
 */
let _liveViewportProjectId: string | null = null;

/** Never throws — a stamp failure must not break a mount. See `graphViewState`. */
function viewportActiveProjectId(): string | null {
  try {
    const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
      PryzmRuntime | undefined;
    return rt ? resolveActiveProjectId(rt) : null;
  } catch {
    return null;
  }
}

/**
 * Called by the surface when the Analysis workspace closes, AND by the C13
 * project-switch teardown registered at the foot of this file.
 *
 * ⚠ THOSE ARE NOT THE SAME TRIGGER, and assuming they were is the defect L-10480
 * found. `_hide()` fires when the reader LEAVES the workspace. Switching project
 * with the workspace still open never hides it — so before the registration below,
 * a project switch disposed nothing and Project A's viewport kept its mount on the
 * shared WebGL refcount, with Project A's geometry still in it.
 */
export function disposeGraphViewport(): void {
  _liveViewport?.dispose();
  _liveViewport = null;
  _liveViewportProjectId = null;
}

/**
 * The element census, as a family resolver.
 *
 * ⭐ THE CENSUS — NOT THE UBG `kind` — IS THE AUTHORITY on what an element is:
 * three of the five UBG adapters stamp the generic `'element'` on every endpoint
 * they materialise. `familyOfNode` applies that precedence; this supplies the
 * census side of it, built from the SAME memoised snapshot every other figure on
 * this surface is computed over.
 *
 * ⛔ `undefined` means THE CENSUS DOES NOT CLAIM THIS ID — a synthetic `rule:*` or
 * `circulation:*` node, or an element in a store outside the declared table. It is
 * not "an element of unknown discipline", and `disciplineOfFamily` keeps it in its
 * own named row rather than inside a count.
 */
function censusFamilies(): ElementFamilyResolver {
  const snap = getCensus();
  const map = new Map<string, string>();
  for (const group of snap.groups) {
    for (const rec of group.records) map.set(rec.id, group.key);
  }
  return { familyOf: (id) => map.get(id) };
}

/** The six-view selector. §GRAPH-HIERARCHY-VIEWS. */
function viewSelector(): HTMLElement {
  const bar = el('div', 'anl-scope-bar');
  bar.appendChild(el('span', 'anl-scope-label', 'Relationships'));
  const active = graphView();
  for (const v of HIERARCHY_VIEWS) {
    const b = el('button', `anl-scope-chip${v.id === active ? ' anl-scope-chip--on' : ''}`, v.label);
    b.type = 'button';
    b.title = v.basis;
    b.setAttribute('aria-pressed', String(v.id === active));
    b.addEventListener('click', () => setGraphView(v.id));
    bar.appendChild(b);
  }
  return bar;
}

/**
 * 2D/3D, labels, node size, focus depth, reset, and the two exports.
 *
 * ⛔ EVERY CONTROL HERE CHANGES HOW THE GRAPH IS DRAWN, NEVER WHAT IT COUNTS.
 * ADR-0358 §3: a control that silently narrowed a denominator while the card's own
 * basis line still described the whole model would be H1 failed at the source
 * layer. Nothing on this bar re-runs a query.
 */
function graphToolbar(
  host: HTMLElement,
  projection: HierarchyProjection,
  g: GraphProjection,
): HTMLElement {
  const bar = el('div', 'anl-scope-bar');

  const chip = (label: string, on: boolean, title: string, go: () => void): HTMLElement => {
    const b = el('button', `anl-scope-chip${on ? ' anl-scope-chip--on' : ''}`, label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', go);
    return b;
  };

  bar.appendChild(el('span', 'anl-scope-label', 'Draw'));
  bar.appendChild(
    chip('3D', graphMode() === '3d', 'Navigable 3-D graph — drag to orbit, click a node to select it in the model', () =>
      setGraphMode('3d'),
    ),
  );
  bar.appendChild(
    chip('2D', graphMode() === '2d', 'The same graph, the same layout algorithm and the same counts, drawn as SVG', () =>
      setGraphMode('2d'),
    ),
  );
  bar.appendChild(
    chip('Labels', graphLabels(), 'Show a name beside each node', () => setGraphLabels(!graphLabels())),
  );

  // Node size. ⚠ A slider, not a free number: the clamp lives in
  // `setGraphNodeScale` and the control must not be able to ask for a value the
  // state refuses — two rival ideas of the same limit is how they drift apart.
  const sizeWrap = el('label', 'anl-scope-label', 'Node size');
  const size = document.createElement('input');
  size.type = 'range';
  size.min = '0.4';
  size.max = '2.5';
  size.step = '0.1';
  size.value = String(graphNodeScale());
  size.title = 'Node radius multiplier. Radius tracks the SQUARE ROOT of degree, so AREA carries the quantity.';
  size.addEventListener('change', () => setGraphNodeScale(Number(size.value)));
  sizeWrap.appendChild(size);
  bar.appendChild(sizeWrap);

  const depthWrap = el('label', 'anl-scope-label', 'Focus hops');
  const depth = document.createElement('input');
  depth.type = 'range';
  depth.min = '1';
  depth.max = '4';
  depth.step = '1';
  depth.value = String(graphFocusDepth());
  depth.title =
    'How far from the selected element the highlighted neighbourhood reaches. It is stated on the card, because ' +
    '"its relations" and "its relations, and theirs" are different claims.';
  depth.addEventListener('change', () => setGraphFocusDepth(Number(depth.value)));
  depthWrap.appendChild(depth);
  bar.appendChild(depthWrap);

  bar.appendChild(
    chip('Reset view', false, 'Restore the default orientation, zoom, view, labels and node size', () => {
      resetGraphViewState();
      const o = graphOrbit();
      o.yaw = -0.62;
      o.pitch = 0.22;
      o.zoom = 1;
      window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
    }),
  );

  bar.appendChild(
    chip(
      'Export network data',
      false,
      'Download this view as JSON — WITH its storey scope, its liveness and its truncation state',
      () => {
        downloadFile(
          `pryzm-network-${projection.view}.json`,
          'application/json',
          serialiseNetwork(projection, {
            scope: scopeSentence(g.scope),
            liveness: livenessSentence(g.liveness),
            truncated: g.truncated,
            totalNodes: g.totalNodes,
            totalEdges: g.totalEdges,
          }),
        );
      },
    ),
  );

  bar.appendChild(
    chip('Export PNG', false, 'Download the picture exactly as drawn, labels included', () => {
      // ⛔ 3-D ONLY, AND IT SAYS SO rather than exporting a blank file. The 2-D card
      // is SVG; a PNG of it needs a rasteriser this lane did not build, and a button
      // that hands the reader an empty image is worse than one that explains itself.
      const url = _liveViewport?.toPngDataUrl() ?? null;
      if (!url) {
        host.appendChild(
          el(
            'p',
            'anl-strip anl-strip--warn',
            'PNG export is available in 3D. The 2D card is SVG and this lane did not build a rasteriser for it — ' +
              'rather than hand you an empty image, the button says so. Switch to 3D and press it again.',
          ),
        );
        return;
      }
      const blob = dataUrlToBlob(url);
      if (blob) downloadFile(`pryzm-network-${projection.view}.png`, 'image/png', blob);
    }),
  );

  return bar;
}

/**
 * Root → Discipline → Family, with counts and the IFC class.
 *
 * ⭐ CLICKING A FAMILY IS A FACET, NOT A SET OF IDS. It goes through `toggleFacet`
 * on the `category` axis, so "walls" composes with "level 1" picked on another
 * card (ADR-0358). Dispatching the family's ids directly would forget which
 * question produced them, and the next pick would REPLACE rather than narrow —
 * which is the exact bug L-6602 fixed.
 *
 * ⛔ The two absence rows render in the NAMED NEUTRAL, never in the categorical
 * rotation: `unclassified` and `unresolved` are answers ABOUT the model, not
 * categories OF it, and a colour from the rotation would promote them into one.
 */
function categoryTree(projection: HierarchyProjection): HTMLElement {
  const wrap = el('div', 'anl-cat-tree');
  wrap.appendChild(
    el(
      'p',
      'anl-card-foot',
      'Element categories in this view. ⚠ Discipline is assigned per FAMILY, not per element — PRYZM authors no ' +
        'per-wall load-bearing flag, so this is a category tally and never a structural analysis.',
    ),
  );

  if (projection.buckets.length === 0) {
    wrap.appendChild(el('p', 'anl-empty', 'No elements participate in this view, so there is nothing to categorise.'));
    return wrap;
  }

  for (const b of projection.buckets) {
    const head = el('div', 'anl-cat-head');
    const swatch = el('span', 'anl-nodelink-swatch');
    swatch.style.background =
      b.discipline === 'unresolved' || b.discipline === 'unclassified'
        ? CAT_UNASSIGNED
        : seriesColour(DISCIPLINE_ORDER.indexOf(b.discipline), b.discipline);
    head.appendChild(swatch);
    head.appendChild(el('span', 'anl-cat-label', `${b.label} (${b.count})`));
    head.title = b.basis;
    wrap.appendChild(head);

    for (const f of b.families) {
      const row = el('button', 'anl-cat-row');
      row.type = 'button';
      row.title = `${f.ifcClass}. Click to filter every card on this surface to ${f.family}.`;
      row.appendChild(el('span', 'anl-cat-row-name', `${f.family} (${f.count})`));
      row.appendChild(el('span', 'anl-cat-row-ifc', f.ifcClass));
      row.addEventListener('click', () =>
        toggleFacet('category', {
          key: f.family,
          label: f.family,
          value: f.count,
          unit: 'ud',
          basis: `Elements of category ${f.family} participating in the ${projection.def.label} view.`,
          elementIds: [...f.ids],
          qualifiers: [],
        }),
      );
      wrap.appendChild(row);
    }
  }
  return wrap;
}

/**
 * A human label for a UBG node. Enrichment stamps `name`/`occupancy` on rooms;
 * everything else falls back to the RESOLVED FAMILY plus a short suffix.
 *
 * ⛔ Never blank, and never the bare ULID — a diagram of twenty identical grey
 * hex strings is a diagram of nothing.
 *
 * ⚠ AMENDED §CLEAN150 (L-12481) — `resolvedFamily` REPLACES `node.kind` as the
 * fallback authority, and it is NOT a second resolver: it is
 * `familyOfNode(node, families)`'s own answer, computed once at the call site
 * and threaded in here so the label and the colour/legend can never disagree
 * (C84 EI-9 — one ladder, not two). `null` is that ladder's explicit, honest
 * "genuinely unresolved" answer — not a family named "element" — so it is
 * rendered as a NAMED, visibly-different non-answer rather than silently
 * reusing the generic UBG `kind`. §CONTEXT-DATA-HONESTY: "unknown" and "wall"
 * must never be the same value, including at the level of a node's label.
 */
function readableLabel(
  node: { id: string; kind: string; props?: Record<string, unknown> },
  resolvedFamily: string | null,
): string {
  const p = node.props ?? {};
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null;
  const occ = typeof p.occupancy === 'string' && p.occupancy.trim() ? p.occupancy.trim() : null;
  if (name) return name;
  if (occ) return occ;
  const under = node.id.indexOf('_');
  const suffix = under > 0 ? node.id.slice(under + 1, under + 5) : node.id.slice(0, 4);
  return resolvedFamily ? `${resolvedFamily} ${suffix}` : `unresolved element ${suffix}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// §C13-ANALYSIS-VIEWPORT-OWNER (L-10480) — the declared C13 owner for the mount
// ═════════════════════════════════════════════════════════════════════════════
//
// Contract: C13 §3.10 · ADR-0298 §1/§2. Sibling owner: `analysis.graphView` in
// `graphViewState.ts`, which owns the layout cache and the orbit.
//
// ⭐ TWO SCOPES, NOT ONE, AND THE SPLIT IS DELIBERATE. A cache and a GPU mount have
// different disposal semantics: dropping a Map is free and always safe, while
// disposing a viewport releases a refcount on the ONE shared offscreen WebGL context
// and must happen exactly once. Folding them into a single scope would have made the
// probe answer for two resources it could only describe as one, which is the
// COMPLETENESS half of the L-694b defect.
//
// ⛔ MODULE-SCOPE registration, as an import side effect (ADR-0298 D6).

/**
 * ADR-0298 probe — which project the live 3-D viewport belongs to.
 *
 * `null` means nothing is mounted, which is always clean. A mount whose owner could
 * not be resolved answers `'<graph-viewport-project-unresolved>'`, never `null`:
 * §CONTEXT-DATA-HONESTY — an unattributable holding is not an empty one.
 */
export function getGraphViewportOwningProjectId(): string | null {
  if (_liveViewport === null) return null;
  return _liveViewportProjectId ?? '<graph-viewport-project-unresolved>';
}

/** What is being held, for the leak report. Never throws. */
export function describeGraphViewport(): Record<string, unknown> {
  return {
    mounted: _liveViewport !== null,
    stampedProjectId: _liveViewportProjectId,
  };
}

projectScopeRegistry.register({
  scopeName: 'analysis.graphViewport',
  clear: () => { disposeGraphViewport(); },
});

registerProjectScopeProbe({
  scope: 'analysis.graphViewport',
  owningProjectId: () => getGraphViewportOwningProjectId(),
  describe: () => describeGraphViewport(),
});
