// @pryzm/schemas/view — view-layer schemas (S31 / Phase 2B Supplement §B).
//
// Re-exports every public symbol from the view tree.  Sibling of
// `annotation/` — both are the new "S31 Track C" parallel surfaces
// introduced by `PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md`.

export {
  CategoryVGSchema,
  ElementCategorySchema,
  FilterConditionSchema,
  StrokeStyleSchema,
  ViewFilterSchema,
  ViewRangeSchema,
  ViewTemplateSchema,
  type CategoryVG,
  type ElementCategory,
  type FilterCondition,
  type StrokeStyle,
  type ViewFilter,
  type ViewRange,
  type ViewTemplate,
} from './view-template.js';

// §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P1 — single source of type truth
// for the Coarse/Medium/Fine enum consumed by core-app-model, command-registry,
// the properties panel and every plan-symbol builder.
export {
  DETAIL_LEVELS,
  DEFAULT_DETAIL_LEVEL,
  DetailLevelSchema,
  normalizeDetailLevel,
  type DetailLevel,
} from './detail-level.js';

export {
  SYSTEM_VIEW_TEMPLATES,
  getSystemViewTemplate,
  listSystemViewTemplateIds,
} from './system-templates.js';
