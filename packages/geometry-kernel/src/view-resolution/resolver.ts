// PRYZM 2 — ViewResolutionAlgorithm (S33 Track C / Phase 2B Supplement §B3).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §B3
//
// LAYER PURITY (CI Gate G11)
// ─────────────────────────────────────────────────────────────────────────────
// L4 — pure ViewTemplate × Element[] → ElementRenderInstruction[].  ZERO
// `three`, `@thatopen/*`, `web-ifc*`, DOM, or Node-specific imports.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • `resolveElementInstructions` is a pure function.  Same input → same output.
// • Priority chain (highest wins):
//     1. Per-element override         (`elementOverrides` map)
//     2. First matching `ViewFilter`  (in template.filters order)
//     3. Category-level VG override   (`template.categoryOverrides`)
//     4. Default appearance           (visible, black, 0.25 mm projection /
//                                      0.50 mm cut, solid)
// • `classifyElement` decides cut / beyond / hidden / outside-range based on
//   the element's vertical extent vs the view range cut/top/bottom planes.
// • `evaluateCondition` recursively evaluates all 9 `FilterCondition` kinds.
//
// EXIT CRITERIA (S33 supplement §B3)
// ─────────────────────────────────────────────────────────────────────────────
// • All 9 filter condition kinds tested.
// • All 5 classifications tested.
// • Priority chain order verified by snapshot test.
// • CI Gate G11: no THREE / DOM imports.

import type {
  CategoryVG,
  ElementCategory,
  FilterCondition,
  StrokeStyle,
  ViewTemplate,
} from '@pryzm/schemas/view/view-template';

// ── Public output shapes ───────────────────────────────────────────────────

export type ElementClassification =
  | 'cut'             // straddles the cut plane
  | 'beyond'          // entirely above the cut plane (within top clip)
  | 'hidden'          // entirely below the cut plane (within bottom clip)
  | 'symbolic'        // rendered as a symbol regardless of geometry
  | 'outside-range';  // entirely outside the view range — not drawn

export interface ElementRenderInstruction {
  readonly elementId: string;
  readonly category: ElementCategory;
  readonly classification: ElementClassification;
  readonly visible: boolean;
  readonly stroke: {
    readonly weight: number;
    readonly color: string;
    readonly dash: string;
  };
  readonly fill?: {
    readonly color: string;
    readonly hatch?: string | undefined;
    readonly opacity: number;
  } | undefined;
  readonly halftone: boolean;
  readonly transparency: number;
}

// ── Input shapes ───────────────────────────────────────────────────────────

export interface ElementForView {
  readonly id: string;
  readonly category: ElementCategory;
  readonly typeId?: string;
  readonly psets?: Record<string, unknown>;
  /** World-Z minimum extent of the element (metres). */
  readonly worldZMin: number;
  /** World-Z maximum extent of the element (metres). */
  readonly worldZMax: number;
}

export interface ResolvedViewRange {
  readonly cutPlaneZ: number;
  readonly topClipZ: number;
  readonly bottomClipZ: number;
  /** Z-coordinate of the level base; informational, not used for classification. */
  readonly levelZ: number;
}

// ── Defaults — used when no chain priority hits ────────────────────────────

const DEFAULT_PROJECTION_STROKE: StrokeStyle = {
  visible: true,
  weight: 0.25,
  color: '#000000',
  dash: 'solid',
};

const DEFAULT_CUT_STROKE: StrokeStyle = {
  visible: true,
  weight: 0.50,
  color: '#000000',
  dash: 'solid',
};

const DEFAULT_VG: Required<Pick<CategoryVG, 'visible' | 'projection' | 'cut' | 'halftone' | 'transparency'>> = {
  visible: true,
  projection: DEFAULT_PROJECTION_STROKE,
  cut: DEFAULT_CUT_STROKE,
  halftone: false,
  transparency: 0,
};

const HIDDEN_INSTRUCTION_STROKE = { weight: 0, color: 'transparent', dash: 'solid' } as const;

// ── Public entry point ─────────────────────────────────────────────────────

export function resolveElementInstructions(
  elements: readonly ElementForView[],
  template: ViewTemplate,
  viewRange: ResolvedViewRange,
  elementOverrides: ReadonlyMap<string, Partial<CategoryVG>>,
): ElementRenderInstruction[] {
  return elements.map((el) => resolveOne(el, template, viewRange, elementOverrides));
}

function resolveOne(
  element: ElementForView,
  template: ViewTemplate,
  viewRange: ResolvedViewRange,
  elementOverrides: ReadonlyMap<string, Partial<CategoryVG>>,
): ElementRenderInstruction {
  const classification = classifyElement(element, viewRange);
  const vg = resolveVG(element, template, elementOverrides);

  if (!vg.visible) {
    return {
      elementId: element.id,
      category: element.category,
      classification,
      visible: false,
      stroke: { ...HIDDEN_INSTRUCTION_STROKE },
      halftone: false,
      transparency: 0,
    };
  }

  // Cut elements use cut stroke; everything else uses projection.
  const strokeSrc: Partial<StrokeStyle> | undefined =
    classification === 'cut' ? vg.cut : vg.projection;

  const fill: ElementRenderInstruction['fill'] = vg.fillColor
    ? {
        color: vg.fillColor,
        hatch: vg.hatchName,
        opacity: 1 - (vg.transparency ?? 0) / 100,
      }
    : undefined;

  return {
    elementId: element.id,
    category: element.category,
    classification,
    visible: true,
    stroke: {
      weight: strokeSrc?.weight ?? DEFAULT_PROJECTION_STROKE.weight,
      color: strokeSrc?.color ?? DEFAULT_PROJECTION_STROKE.color,
      dash: strokeSrc?.dash ?? DEFAULT_PROJECTION_STROKE.dash,
    },
    fill,
    halftone: vg.halftone ?? false,
    transparency: vg.transparency ?? 0,
  };
}

// ── Classification ─────────────────────────────────────────────────────────

export function classifyElement(
  element: { readonly worldZMin: number; readonly worldZMax: number },
  viewRange: { readonly cutPlaneZ: number; readonly topClipZ: number; readonly bottomClipZ: number },
): ElementClassification {
  // Entirely above the top clip → out.
  if (element.worldZMin > viewRange.topClipZ) return 'outside-range';
  // Entirely below the bottom clip → out.
  if (element.worldZMax < viewRange.bottomClipZ) return 'outside-range';
  // Straddles the cut plane → cut.
  if (element.worldZMin <= viewRange.cutPlaneZ && element.worldZMax >= viewRange.cutPlaneZ) {
    return 'cut';
  }
  // Entirely above the cut plane (but within top clip) → beyond.
  if (element.worldZMin > viewRange.cutPlaneZ) return 'beyond';
  // Otherwise: entirely below cut plane (but within bottom clip) → hidden.
  return 'hidden';
}

// ── Priority chain — VG resolution ─────────────────────────────────────────

function resolveVG(
  element: ElementForView,
  template: ViewTemplate,
  elementOverrides: ReadonlyMap<string, Partial<CategoryVG>>,
): Partial<CategoryVG> & { visible: boolean } {
  // Priority 1 — per-element override.
  const elemOverride = elementOverrides.get(element.id);
  if (elemOverride) {
    return { ...elemOverride, visible: elemOverride.visible ?? true };
  }

  // Priority 2 — first matching enabled filter.
  for (const filter of template.filters) {
    if (!filter.enabled) continue;
    if (filter.categories.length > 0 && !filter.categories.includes(element.category)) continue;
    if (evaluateCondition(filter.condition, element.psets ?? {}, element.typeId ?? '')) {
      const o = filter.overrides ?? {};
      // Cast: see the matching note on the categoryOverrides branch below.
      return { ...o, visible: o.visible ?? true } as Partial<CategoryVG> & { visible: boolean };
    }
  }

  // Priority 3 — category override on the template.
  const catVG = template.categoryOverrides[element.category];
  if (catVG) {
    // Cast required: spreading a CategoryVG with `exactOptionalPropertyTypes`
    // produces explicit-undefined fields; the Partial<…> target shape disallows
    // them.  Semantics are preserved (consumers read the same `T | undefined`).
    return { ...catVG, visible: catVG.visible ?? true } as Partial<CategoryVG> & { visible: boolean };
  }

  // Priority 4 — package default.
  return { ...DEFAULT_VG };
}

// ── Recursive filter condition evaluator ───────────────────────────────────

export function evaluateCondition(
  condition: FilterCondition,
  psets: Record<string, unknown>,
  typeName: string,
): boolean {
  switch (condition.kind) {
    case 'pset-equals': {
      const v = getPsetValue(psets, condition.pset, condition.property);
      return v === condition.value;
    }
    case 'pset-contains': {
      const v = getPsetValue(psets, condition.pset, condition.property);
      return typeof v === 'string' && v.includes(condition.value);
    }
    case 'pset-greater': {
      const v = getPsetValue(psets, condition.pset, condition.property);
      return typeof v === 'number' && v > condition.value;
    }
    case 'pset-less': {
      const v = getPsetValue(psets, condition.pset, condition.property);
      return typeof v === 'number' && v < condition.value;
    }
    case 'pset-exists':
      return getPsetValue(psets, condition.pset, condition.property) !== undefined;
    case 'type-name-is':
      return typeName === condition.typeName;
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, psets, typeName));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, psets, typeName));
    case 'not':
      return !evaluateCondition(condition.condition, psets, typeName);
  }
}

function getPsetValue(
  psets: Record<string, unknown>,
  pset: string,
  property: string,
): unknown {
  const psetData = psets[pset] as Record<string, unknown> | undefined;
  return psetData?.[property];
}
