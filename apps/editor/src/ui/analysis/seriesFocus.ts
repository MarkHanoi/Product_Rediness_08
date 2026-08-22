/**
 * seriesFocus — "highlight what I picked, dim the rest, keep it all on screen".
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/seriesFocus.ts
 * CSS prefix:      anl-  (shares the Analysis sheet)
 * ADR:             ADR-0343 §D.3 (click-through is the join) · §D.5 (colour) · §D.6
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §2.1, §4.1 W2
 * Issue log:       L-3610
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER'S SENTENCE, AND WHY EACH HALF OF IT IS LOAD-BEARING
 * ═════════════════════════════════════════════════════════════════════════════
 *   "when the user selects a part of the graph it should highlight this and the
 *    rest be a bit dormant"
 *
 * DORMANT, NOT GONE. That is the whole design constraint and it is an honesty
 * constraint, not a taste one. A chart that HIDES the unpicked series answers a
 * different question from the one on the card: the reader is now looking at a
 * filtered total with the card's denominator still printed above it. Dimming
 * keeps every figure, every legend row and every percentage on screen and true —
 * it changes emphasis, never the population. Nothing in this module removes a
 * mark, and nothing here recomputes a figure.
 *
 * ⛔ HUE IS NEVER CHANGED — ONLY ALPHA.
 * `dimFill()` below parses the resolved token and moves ONE channel. It cannot
 * turn one category's colour into another's, so a dimmed slice is still
 * identifiable as itself, and — the case that matters — the named neutral
 * `--app-cat-unassigned` stays the neutral. ADR-0343 §D.5 / SPEC §4.1 W2:
 * `unassigned` / `untyped` / `unmeasured` are real ANSWERS about the model and
 * must never read as a category. A dim pass that re-tinted would promote them
 * into the rotation by accident, dimmed or not.
 *
 * ⛔ NO RE-RENDER, AND NO FRAME.
 * Focus is applied by toggling classes on marks that are already in the DOM and,
 * for Chart.js, by re-tinting the dataset and calling `chart.update('none')` —
 * the mode that skips animation. P3: the single `requestAnimationFrame` owner is
 * `frame-scheduler/src/RafAdapter.ts`, and a dashboard must never be why a frame
 * is dropped. Focusing therefore costs one style recalculation, not a query.
 *
 * ⚠ FOCUS IS TRANSIENT BY DESIGN. It is not in `AnalysisLayout` and does not
 * persist: a `refresh()` rebuilds the grid and the focus is gone. That is the
 * honest default — a *saved* emphasis would reopen a dashboard that looks like
 * it is showing less than it is, which is the failure this file's first rule
 * exists to prevent.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — DOM classes and one Chart.js re-tint.
 */

import type { Chart } from 'chart.js';

/** Marks opt in by carrying this attribute; its value is the figure's `key`. */
export const SERIES_ATTR = 'data-series';

/** On the scope element while ANY series is focused. CSS dims the rest off this. */
const SCOPE_ON = 'anl-focus-on';
/** On the focused mark(s). */
const MARK_ON = 'anl-focused';

/**
 * The alpha a dormant fill drops to.
 *
 * ⚠ CHOSEN, NOT MEASURED — say so rather than imply a study. 0.22 was picked so
 * a dormant slice stays visible against `--app-panel-bg` (it must: the reader is
 * meant to still see the whole population) while the focused one clearly leads.
 * Nothing here has been contrast-tested, and it does not need to be: hue is
 * never the only channel on this surface — every mark carries a text label or a
 * legend row beside it (ADR-0343 §D.5), so a dimmed fill never becomes the sole
 * carrier of an identity.
 */
export const DORMANT_ALPHA = 0.22;

/**
 * Drop a resolved colour's alpha without touching its hue.
 *
 * Accepts what `resolveToken()` actually yields from `tokens.ts`: `#rgb`,
 * `#rrggbb`, `rgb(...)`, `rgba(...)`. Anything else is returned UNCHANGED —
 * a colour this function cannot parse is left alone rather than replaced with a
 * guess, because a guessed fill is a minted colour and §D.5 forbids minting.
 */
export function dimFill(css: string, alpha: number = DORMANT_ALPHA): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(css.trim());
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return css;
}

/**
 * One card's focus. Created per rendered widget; discarded with the card.
 *
 * `scope` is the card body. Every mark inside it that carries `data-series` is
 * governed — legend rows, table rows, treemap tiles, graph nodes and edges — so
 * a renderer joins the mechanism by stamping one attribute, not by importing
 * behaviour. That is deliberate: the alternative (each renderer wiring its own
 * dim pass) is how four rival dimming rules get written.
 */
export class SeriesFocus {
  private _key: string | null = null;
  private readonly _charts: Array<{ chart: Chart; base: string[]; keys: string[] }> = [];

  constructor(private readonly _scope: HTMLElement) {}

  /** The focused series key, or `null` when the whole population leads. */
  get key(): string | null {
    return this._key;
  }

  /**
   * Register a Chart.js instance so its dataset can be re-tinted.
   *
   * `base` is the FULL-strength colour per index, captured BEFORE any dimming —
   * re-deriving it from the live dataset after a dim would compound the alpha
   * every time the reader clicked. `keys` is the figure key per index, passed
   * explicitly rather than read off `chart.data.labels`: labels are
   * model-derived display strings and are not unique, keys are.
   */
  registerChart(chart: Chart, base: readonly string[], keys: readonly string[]): void {
    this._charts.push({ chart, base: [...base], keys: [...keys] });
  }

  /**
   * Click behaviour: picking the focused series again clears the focus.
   *
   * ⭐ There must always be a way BACK to the whole population, reachable by the
   * same gesture that left it. Without it a reader who clicks a slice is stuck
   * looking at an emphasised subset of a card whose denominator says otherwise,
   * and the only escape is a refresh that also throws away everything else.
   */
  toggle(key: string): void {
    this.set(this._key === key ? null : key);
  }

  /**
   * Set the focus outright. `null` restores every mark to full strength.
   *
   * ⭐ MEMBERSHIP, NOT EQUALITY. `data-series` is a SPACE-SEPARATED TOKEN LIST
   * and a mark lights when the focused key is one of its tokens. For a donut
   * slice or a table row the list is one token and membership IS equality, so
   * nothing changes there. It exists for the relationship graph, where "the part
   * the user selected" is genuinely more than one mark: picking a node must
   * light the node, its incident edges AND its neighbours, or the highlight
   * answers a question nobody asked ("this dot") instead of the one the picture
   * is for ("what does this connect to").
   *
   * ⛔ ONE mechanism, deliberately. The alternative — a second, graph-private dim
   * pass — is how two rival definitions of "dormant" get written and then drift.
   */
  set(key: string | null): void {
    this._key = key;
    this._scope.classList.toggle(SCOPE_ON, key !== null);
    for (const mark of this._scope.querySelectorAll<Element>(`[${SERIES_ATTR}]`)) {
      const tokens = (mark.getAttribute(SERIES_ATTR) ?? '').split(/\s+/);
      mark.classList.toggle(MARK_ON, key !== null && tokens.includes(key));
    }
    this._retintCharts();
  }

  /**
   * Re-tint every registered chart. Chart.js paints into a canvas, so CSS cannot
   * reach it — this is the one place the class-based mechanism above needs a
   * data-side equivalent, and it is kept in ONE method so the two halves cannot
   * disagree about which series is lit.
   */
  private _retintCharts(): void {
    for (const { chart, base, keys } of this._charts) {
      const ds = chart.data.datasets[0];
      if (!ds) continue;
      ds.backgroundColor = base.map((c, i) =>
        this._key === null || keys[i] === this._key ? c : dimFill(c),
      );
      // 'none' — no animation, therefore no frame requested by a widget (P3).
      chart.update('none');
    }
  }
}

/**
 * Stamp a mark so `SeriesFocus` governs it. Returns the element for chaining.
 *
 * ⛔ The keys are FIGURE keys, never labels. Labels are model-derived and two
 * families can legitimately share one ("Untyped" appears under every family);
 * keys are namespaced by the read model precisely so a focus cannot light up two
 * unrelated groups that happen to read the same.
 *
 * More than one key means "this mark belongs to all of these" — see
 * {@link SeriesFocus.set}. A key may not contain whitespace, because the
 * attribute is a token list; the read model's keys never do.
 */
export function markSeries<T extends Element>(node: T, ...keys: readonly string[]): T {
  node.setAttribute(SERIES_ATTR, keys.join(' '));
  return node;
}
