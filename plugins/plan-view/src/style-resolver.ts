// style-resolver — per-view style + visibility overrides for the plan view.
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 lines 635–676 (G4, G6, G7).
// Subordinate ADR: `docs/02-decisions/adrs/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// The resolver answers two questions for the plan-view renderer:
//
//   1. `resolve(elementId, defaultStyle)`     → effective style for this view.
//   2. `resolveVisibility(elementId)`         → effective visibility for this view.
//
// Precedence (most-specific wins, identical for both queries):
//   • per-view + per-element override          (highest)
//   • per-view + all-elements override         (mid)
//   • supplied default                         (lowest)
//
// Overrides for OTHER views are silently ignored — the resolver is
// constructed per-view-render with the active `viewId`.
//
// PURE: no DOM, no THREE, no `window` — runs unchanged in Node tests.
// Cross-package coupling is zero: the resolver depends only on its own types.

/** Effective visual style for a single plan-view element. */
export interface ElementStyle {
  /** Stroke colour (CSS string).  Walls / edges. */
  readonly strokeColor?: string;
  /** Pen weight in CSS pixels. */
  readonly lineWeight?: number;
  /** Fill colour (CSS string).  Poche / regions / room fills. */
  readonly fillColor?: string;
  /** Material id reference — drives downstream hatch / catalogue lookups. */
  readonly materialId?: string;
}

/**
 * A single override row.  Stored flat so the table is trivially serialisable
 * (JSON / wire-format) and identity-comparable.
 *
 *   • `elementId === undefined` → applies to ALL elements in the view.
 *   • `elementId === '<id>'`    → applies to exactly that element in the view.
 *
 * Per-view, per-element rows beat per-view, all-elements rows.  The table
 * order is irrelevant — `find` walks by precedence, not by index.
 */
export interface ViewStyleOverride {
  readonly viewId: string;
  readonly elementId?: string;
  readonly materialId?: string;
  readonly lineWeightOverride?: number;
  readonly fillColorOverride?: string;
  readonly strokeColorOverride?: string;
  readonly visible?: boolean;
}

/**
 * Apply a single override row on top of a default style.  Only keys that
 * are explicitly set on the override mutate the result — `undefined` keys
 * preserve the default.
 */
function applyOverride(
  defaultStyle: ElementStyle,
  override: ViewStyleOverride,
): ElementStyle {
  const out: {
    strokeColor?: string;
    lineWeight?: number;
    fillColor?: string;
    materialId?: string;
  } = {};
  if (defaultStyle.strokeColor !== undefined) out.strokeColor = defaultStyle.strokeColor;
  if (defaultStyle.lineWeight !== undefined) out.lineWeight = defaultStyle.lineWeight;
  if (defaultStyle.fillColor !== undefined) out.fillColor = defaultStyle.fillColor;
  if (defaultStyle.materialId !== undefined) out.materialId = defaultStyle.materialId;

  if (override.strokeColorOverride !== undefined) out.strokeColor = override.strokeColorOverride;
  if (override.lineWeightOverride !== undefined) out.lineWeight = override.lineWeightOverride;
  if (override.fillColorOverride !== undefined) out.fillColor = override.fillColorOverride;
  if (override.materialId !== undefined) out.materialId = override.materialId;
  return out;
}

/**
 * Per-view style override resolver.  One instance per view-render —
 * cheap to construct (no internal indexing; the table is small in practice
 * and a linear scan beats hash-table overhead for < ~50 overrides).
 *
 * Construct in the host:
 *   ```ts
 *   const resolver = new StyleResolver(overrides, activeViewId);
 *   const fill = resolver.resolve(wall.id, defaults).fillColor;
 *   ```
 */
export class StyleResolver {
  private readonly overrides: readonly ViewStyleOverride[];
  private readonly viewId: string;

  constructor(overrides: readonly ViewStyleOverride[], viewId: string) {
    this.overrides = overrides;
    this.viewId = viewId;
  }

  /**
   * Compute the effective style for one element under the active view.
   * Returns the supplied `defaultStyle` unchanged when no row matches.
   */
  resolve(elementId: string, defaultStyle: ElementStyle): ElementStyle {
    // Per-view, per-element override (most specific).
    const perElement = this.findPerElement(elementId);
    if (perElement) return applyOverride(defaultStyle, perElement);

    // Per-view, all-elements override.
    const perView = this.findPerView();
    if (perView) return applyOverride(defaultStyle, perView);

    return defaultStyle;
  }

  /**
   * Resolve effective visibility under per-view precedence.
   * Default (no matching override) is `true`.
   *
   * A per-element row that lacks `visible` does NOT shadow a per-view row's
   * `visible` — we walk precedence and return the first row that has
   * an explicit `visible` set.
   */
  resolveVisibility(elementId: string): boolean {
    const perElement = this.findPerElement(elementId);
    if (perElement && perElement.visible !== undefined) return perElement.visible;

    const perView = this.findPerView();
    if (perView && perView.visible !== undefined) return perView.visible;

    return true;
  }

  /** Has the resolver got at least one row for the active view? */
  hasOverrides(): boolean {
    for (const o of this.overrides) {
      if (o.viewId === this.viewId) return true;
    }
    return false;
  }

  private findPerElement(elementId: string): ViewStyleOverride | undefined {
    for (const o of this.overrides) {
      if (o.viewId === this.viewId && o.elementId === elementId) return o;
    }
    return undefined;
  }

  private findPerView(): ViewStyleOverride | undefined {
    for (const o of this.overrides) {
      if (o.viewId === this.viewId && o.elementId === undefined) return o;
    }
    return undefined;
  }
}
