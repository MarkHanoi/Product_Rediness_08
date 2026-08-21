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
  | 'unit';

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
  | 'selection';

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
  | 'not-built';

/**
 * When a widget recomputes. ⛔ There is deliberately NO `on-frame`. P3 — the
 * single `requestAnimationFrame` owner is
 * `packages/frame-scheduler/src/RafAdapter.ts`; nothing in this directory calls
 * rAF, and a dashboard must never be the reason a frame is dropped.
 */
export type AnalysisRefresh = 'manual' | 'on-commit' | 'on-selection';

export interface AnalysisWidgetDef {
  readonly id: string;
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

/** The categorical series tokens, in rotation order. §CHART-CATEGORICAL-SCALE. */
export const CAT_TOKENS: readonly string[] = Object.freeze([
  'var(--app-cat-1)', 'var(--app-cat-2)', 'var(--app-cat-3)', 'var(--app-cat-4)',
  'var(--app-cat-5)', 'var(--app-cat-6)', 'var(--app-cat-7)', 'var(--app-cat-8)',
]);

/**
 * The named neutral. ⛔ NOT part of the rotation: `unassigned` and `untyped` are
 * real answers about the model and must never be mistaken for a category.
 */
export const CAT_UNASSIGNED = 'var(--app-cat-unassigned)';

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
