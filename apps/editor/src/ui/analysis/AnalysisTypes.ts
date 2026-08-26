/**
 * AnalysisTypes — the vocabulary of the Analysis surface.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/AnalysisTypes.ts
 * ADR:             ADR-0343 §D.3 (the widget contract) · §D.6 (honesty rules)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §2 (the result envelope)
 * Contracts:       C27 §6 · C66 §1.1 · C10 §1
 * Issue log:       L-3002
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE COVERAGE VOCABULARY IS ADOPTED, NOT INVENTED
 * ─────────────────────────────────────────────────────────────────────────────
 * `CoverageState` / `CoverageRow` are RE-EXPORTED from
 * `@pryzm/core-app-model` — `quantities/TakeoffTypes.ts`, whose own section
 * heading reads "Coverage (the honest half)". ADR-0343 §D.6: *"Adopt CoverageState
 * verbatim … Do not invent a second vocabulary."* A second three-state enum with
 * slightly different names would be the exact defect this surface exists to not
 * commit — two honesty vocabularies is zero honesty vocabularies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ A WIDGET RECEIVES A RESULT. IT NEVER RECEIVES A STORE.
 * ─────────────────────────────────────────────────────────────────────────────
 * `AnalysisQuery` is a DESCRIPTOR — data, not a closure. ADR-0343 §D.3 gives the
 * three consequences, and they are the whole reason for the indirection:
 *   1. the cost of a widget is inspectable BEFORE it runs (`query.cost`);
 *   2. identical queries across widgets are computed ONCE (`query.id` is the
 *      cache key);
 *   3. a widget CANNOT reach past the read model into a store and silently
 *      undercount — it has no handle to reach with.
 *
 * (3) is the one that matters. ADR-0343 §C.3.2 measured the live example:
 * `ElementStore.getState()` returns only the LRU-resident subset and its own
 * doc comment says so, while its return type says `ReadonlyMap`. An aggregate
 * over it is an undercount that reads as a count. No widget in this directory
 * can make that mistake, because none of them can call it.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6) — types and two frozen tables.
 */

import type { CoverageRow, CoverageState, QuantityUnit } from '@pryzm/core-app-model';
// §QTYHL132 (L-12120) — the ONE authority for the categorical scale. Value
// imports of pure constants; this module reads no DOM at load.
import {
  CATEGORICAL_SERIES,
  CAT_UNASSIGNED_TOKEN_NAME,
  catSeriesTokenName,
} from '../styles/categoricalPalette';

export type { CoverageRow, CoverageState, QuantityUnit };

// ── The query descriptor ──────────────────────────────────────────────────────

/**
 * The axes the read model can group by. ⛔ ADR-0343 §D.6 H3: *"A widget may
 * aggregate only over an axis the read model indexes."* Adding a member here
 * without teaching `analysisReadModel.ts` to project it is how an invented
 * aggregate gets shipped — the executor throws rather than returning empty, so
 * the mistake is loud.
 */
export type AnalysisAxis =
  /** Element family — wall, room, door, … The census's primary axis. */
  | 'category'
  /** Storey. Elements with no `levelId` land in a NAMED `unassigned` group. */
  | 'level'
  /** Resolved system/family type. Elements with none land in a NAMED `untyped`. */
  | 'type'
  /** Take-off chapter (capítulo). Quantity queries only. */
  | 'chapter'
  /** Take-off unit (m / m² / m³ / ud / kg). Quantity queries only. */
  | 'unit'
  /**
   * Typed relation family in the Unified Building Graph (`bounds`, `connectsTo`,
   * `violates`, …). ⛔ Graph queries ONLY — the element census has no relational
   * axis and never will; relationships live in the UBG, which is a different
   * substrate with a different authority (ADR-0343 §D.4).
   */
  | 'relationship';

/**
 * Where a figure's numbers come from. Each value names ONE authority; a query
 * may not straddle two, because a figure that mixes sources cannot state a
 * single basis (H1).
 */
export type AnalysisSource =
  /** The element census — per-store `getAll()`. Counts only, never quantities. */
  | 'census'
  /** `computeTakeoff()` in `@pryzm/core-app-model`. The ONE measurement authority. */
  | 'takeoff'
  /** The current selection, resolved through the census. */
  | 'selection'
  /**
   * The Unified Building Graph. ADR-0343 §D.4 ruled the UBG OUT as the aggregate
   * substrate (it is a projection, and it was stale by construction) and IN for
   * the RELATIONAL widgets — *"but only once it is maintained"*. It is maintained
   * as of L-3251, which is the precondition this source depends on.
   *
   * ⛔ A `graph` query may never answer a question the census owns. Counting
   * walls off the UBG would count the walls that happen to participate in a
   * projected relationship — a silent undercount that reads as a count, the
   * exact defect ADR-0343 §C.3.2 exists to name.
   */
  | 'graph'
  /**
   * §ANALYSIS-AREA-STANDARDS (L-3640). Room polygon areas, read from the SAME
   * `roomStore` the census reads, summed per storey.
   *
   * ⛔ IT IS A SEPARATE SOURCE FROM `census` DELIBERATELY. The census answers
   * "how many", in `ud`; this answers "how much floor", in `m²`, and it carries
   * a MEASUREMENT PLANE that the census has no concept of. Folding an area sum
   * into the census would produce a figure whose basis nobody could state —
   * which is H1, failed, at the source layer.
   *
   * ⛔ It is ALSO not `takeoff`. `computeTakeoff()` is the measurement authority
   * for BOQ quantities and produces no room-area line; a room area is not a
   * *medición* row, it is a planning figure. Two authorities, two sources,
   * neither pretending to be the other.
   */
  | 'area';

/**
 * The declared cost class. ⚠ SPEC §3: every figure here is ESTIMATED FROM THE
 * CODE PATH, NOT BENCHED. Per C66 §1.1 nothing may be described as supported at
 * a document size it has not been benched at — so a widget renders this label
 * and the word CLAIMED, never a performance promise.
 */
export type AnalysisCost = 'O(1)' | 'O(k)' | 'O(n)' | 'O(n·m)';

export interface AnalysisQuery {
  /**
   * The cache key. Two widgets that declare the same `id` get the SAME computed
   * result object — that is ADR-0343 §D.3's "identical queries are computed
   * once", and it is why the id must be derived from the query's content rather
   * than from the widget that asked.
   */
  readonly id: string;
  readonly source: AnalysisSource;
  readonly groupBy: AnalysisAxis;
  /** `count` is a tally of elements; `quantity` is a measured take-off sum. */
  readonly measure: 'count' | 'quantity';
  /** Required when `measure: 'quantity'` — a treemap may not mix m² with m³. */
  readonly unit?: QuantityUnit;
  readonly cost: AnalysisCost;
}

// ── The result envelope (SPEC §2, verbatim shape) ─────────────────────────────

export interface AnalysisFigure {
  /** Stable group key — the axis value. Used for click-through and colour index. */
  readonly key: string;
  /** Human label. For `unassigned` / `untyped` this SAYS SO; it is never blank. */
  readonly label: string;
  readonly value: number;
  /** `ud` for counts. The unit is rendered; a bare number is not a figure. */
  readonly unit: QuantityUnit;
  /**
   * ⭐ H1 — the figure's provenance, in words. A widget renders this or renders
   * nothing. "Σ (length × height) − Σ opening voids" is a basis; "walls" is not.
   */
  readonly basis: string;
  /**
   * ⭐ H4 — the elements this figure measured. A number you cannot open is a
   * number you cannot check, and this surface exists to be checked. Click-through
   * dispatches these ids on the selection bus.
   */
  readonly elementIds: readonly string[];
  /**
   * Non-empty ⇒ some contributor was measured APPROXIMATELY, and each string
   * says which and why. Carried through from `TakeoffLine.qualifiers`.
   */
  readonly qualifiers: readonly string[];
}

export interface AnalysisResult {
  readonly query: AnalysisQuery;
  readonly figures: readonly AnalysisFigure[];
  /** Every family the source KNOWS ABOUT, with its state and a reason. */
  readonly coverage: readonly CoverageRow[];
  /**
   * Sources that could not be read AT ALL. ⛔ DISTINCT from empty. "The wall
   * store was not published" and "there are no walls" are different answers and
   * must read differently (SPEC §2).
   */
  readonly unreachable: readonly string[];
  readonly computedAt: number;
  /** What the figures were actually computed over. */
  readonly computedOverCount: number;
  /**
   * ⛔ `false` ⇒ `computedOverCount` is a LOWER BOUND and every total on the card
   * must render as "≥ N", never "N" (SPEC §4.1 W5, ADR-0343 §D.6 H5). A widget
   * that ignores this flag is the single most likely silent-undercount path on
   * this surface.
   */
  readonly complete: boolean;
  /**
   * ⭐ WHY `complete` is false — one sentence per cause, EMPTY when complete.
   *
   * §ANALYSIS-INCOMPLETE-REASON (L-3303). This field exists because the surface
   * used to derive the reason from `unreachable.length` and print it regardless:
   * with a truncated graph the status strip read *"⚠ 0 declared source(s)
   * unreadable, so totals on this dashboard are LOWER BOUNDS"* — a warning that
   * refutes itself in its own first clause. `complete:false` has THREE distinct
   * causes here and only one of them is an unreadable source; the other two are
   * a graph draw capped at `GRAPH_NODE_CAP` and a graph whose freshness cannot be
   * vouched for. A reader who checks the named source, finds it readable, and
   * concludes the warning is noise has been taught to ignore the one strip on
   * this surface that must never be ignored.
   *
   * ⛔ Non-empty ⇔ `complete === false`. A producer that flips the flag without
   * saying why has reintroduced the defect.
   */
  readonly incompleteReason: readonly string[];
  /** Milliseconds the executor spent. Reported, never used to decide anything. */
  readonly elapsedMs: number;
}

// ── The widget contract (ADR-0343 §D.3) ───────────────────────────────────────

/**
 * The closed set of widget kinds. ADR-0343 §D.3: the OTel span attribute set is
 * bounded by this union — the same cardinality reasoning ADR-0058 §6 applied to
 * edge types. An open string here would put unbounded cardinality on a metric.
 */
export type AnalysisWidgetKind =
  | 'kpi'
  | 'donut'
  | 'bar'
  | 'treemap'
  | 'table'
  | 'coverage'
  /**
   * A node-link relationship diagram over the UBG. Rendered by
   * `nodeLinkSvg.ts` — the ONE shared node-link renderer (L-3256), not a fifth
   * private hand-roll.
   */
  | 'graph'
  | 'not-built';

/**
 * When a widget recomputes. ⛔ There is deliberately NO `on-frame`. P3 — the
 * single `requestAnimationFrame` owner is
 * `packages/frame-scheduler/src/RafAdapter.ts`; nothing in this directory calls
 * rAF, and a dashboard must never be the reason a frame is dropped.
 */
export type AnalysisRefresh = 'manual' | 'on-commit' | 'on-selection';

/**
 * The dashboard's top-level sections. §ANALYSIS-TABS (L-3304).
 *
 * ⭐ The founder's report was *"the content of the analysis is too much for a
 * tab"* — sixteen widgets on one scroll, five of them refusal cards. Tabs are
 * the fix, but they carry a hazard worth naming ON THE TYPE: splitting a
 * dashboard SEPARATES EVERY FIGURE FROM THE CARD THAT QUALIFIES IT. The
 * `takeoff-coverage` widget's own subtitle reads *"Not optional chrome. Every
 * quantity figure on this surface is read against this card."* Put it behind a
 * tab nobody opens and every remaining number becomes an unqualified total —
 * which is the overstatement the whole surface was built to refuse.
 *
 * So the grouping is BY THE QUESTION ASKED, and each tab keeps the coverage
 * evidence for its OWN figures inside it. The pinned status strip carries the
 * trust state of the tab being read and says "on this tab" in words, because it
 * cannot speak for tabs it did not compute.
 *
 * ⛔ Not an open string: the OTel attribute set is bounded by this union, the
 * same cardinality argument the widget-kind union carries above.
 */
export type AnalysisTabId = 'overview' | 'quantities' | 'relationships' | 'areas';

export interface AnalysisTabDef {
  readonly id: AnalysisTabId;
  readonly label: string;
  /** One line: the question this tab answers. Rendered under the tab strip. */
  readonly lede: string;
}

export const ANALYSIS_TABS: readonly AnalysisTabDef[] = Object.freeze([
  { id: 'overview',      label: 'Overview',      lede: 'What is in this model — counts, by family, by storey, by type.' },
  { id: 'quantities',    label: 'Quantities',    lede: 'How much of it — measured take-off, and what the take-off does not measure.' },
  { id: 'relationships', label: 'Relationships', lede: 'How it is connected — the Unified Building Graph and which edge families are real.' },
  // ⚠ THE LEDE CHANGED 2026-08-22 (§ANALYSIS-AREA-STANDARDS, L-3640). It read
  // "Every widget here is NOT BUILT and says why." That was true and is now
  // false: the two area widgets MEASURE. Leaving the old sentence would be a
  // caption that refutes the card beneath it — the same self-refuting shape
  // L-3303 fixed on the status strip.
  { id: 'areas',         label: 'Areas & change', lede: 'How much floor, under a NAMED standard — plus the unit mix and version diff that are still NOT BUILT, each saying why.' },
]);

export function analysisTabById(id: string): AnalysisTabDef | undefined {
  return ANALYSIS_TABS.find((t) => t.id === id);
}

export interface AnalysisWidgetDef {
  readonly id: string;
  /** Which tab this widget belongs to. Every widget declares one — see AnalysisTabId. */
  readonly tab: AnalysisTabId;
  readonly kind: AnalysisWidgetKind;
  readonly title: string;
  /** One line under the title. Says what the widget measures, not what it is. */
  readonly subtitle: string;
  readonly query: AnalysisQuery | null;
  readonly refresh: AnalysisRefresh;
  /** Grid span, 1 = half width, 2 = full width. */
  readonly span: 1 | 2;
  /**
   * ⛔ NON-NULL ⇒ THIS WIDGET IS NOT BUILT and renders a refusal card naming the
   * missing model. ADR-0343 §D.6 H7: not *"no data"* but *"a version diff needs
   * two saved versions and stable ids across them."* An unactionable honest card
   * is still a defect.
   */
  readonly notBuilt: NotBuiltReason | null;
}

export interface NotBuiltReason {
  /** What the widget would show if it could. */
  readonly lede: string;
  /** What already exists and can be built on. */
  readonly have: readonly string[];
  /** What is missing, named — each entry is a specific absent model. */
  readonly need: readonly string[];
  /** The closing sentence: why a plausible version would be worse than none. */
  readonly close: string;
}

// ── Constants shared by the renderers ─────────────────────────────────────────

/**
 * The categorical series tokens, in rotation order. §CHART-CATEGORICAL-SCALE.
 *
 * ⭐ §QTYHL132 (L-12120) — DERIVED, not restated. The count and the names come
 * from `styles/categoricalPalette.ts`, which is the ONE authority for the scale
 * (C84 EI-9); this array used to be a hand-written list of eight, so adding or
 * reordering a series meant editing two places that nothing compared.
 *
 * ⛔ THESE ARE REFERENCES, NOT COLOURS, AND THAT DISTINCTION IS LOAD-BEARING.
 * `var(--app-cat-1)` is resolvable by the CSS cascade and by nothing else. A
 * consumer that paints outside the DOM — `THREE.Color`, a 2-D canvas
 * `fillStyle`, a GPU uniform — MUST put the value through
 * `resolveCssColour()` first. THREE does not throw on a `var()`: it warns and
 * silently keeps its default WHITE, which is how "this category is white" and
 * "this category's colour was lost" became the same pixels on the founder's
 * screen (L-12120).
 */
export const CAT_TOKENS: readonly string[] = Object.freeze(
  CATEGORICAL_SERIES.map((_, i) => `var(${catSeriesTokenName(i)})`),
);

/**
 * The named neutral. ⛔ NOT part of the rotation: `unassigned` and `untyped` are
 * real answers about the model and must never be mistaken for a category.
 */
export const CAT_UNASSIGNED = `var(${CAT_UNASSIGNED_TOKEN_NAME})`;

/** Group keys that are ABSENCE, not a category. Rendered in the neutral. */
export const ABSENCE_KEYS: ReadonlySet<string> = new Set(['unassigned', 'untyped', 'unmeasured']);

/**
 * Colour for series index `i`. Absence keys always get the neutral, whatever
 * their position — so "no level" cannot borrow a category's identity.
 */
export function seriesColour(index: number, key?: string): string {
  if (key && ABSENCE_KEYS.has(key)) return CAT_UNASSIGNED;
  return CAT_TOKENS[index % CAT_TOKENS.length]!;
}
