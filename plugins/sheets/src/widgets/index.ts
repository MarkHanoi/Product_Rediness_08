// @pryzm/plugin-sheets/widgets — barrel (S39 / Phase 2C).

export {
  Widget,
  drawUprightText,
  withUprightText,
  wrapText,
  type WidgetCtx2D,
  type WidgetRenderEnv,
  type WidgetBounds,
} from './base.js';

export { TextWidget } from './text.js';
export { ImageWidget } from './image.js';
export { NorthArrowWidget } from './north-arrow.js';
export { ScaleBarWidget } from './scale-bar.js';
export { LegendWidget } from './legend.js';
export { RevisionsTableWidget } from './revisions-table.js';
export { ScheduleSnapshotWidget } from './schedule-snapshot.js';
export { BimTagWidget } from './bim-tag.js';
export { LineWidget } from './line.js';
export { RegionWidget } from './region.js';

export {
  buildBuiltinWidgetRegistry,
  BUILTIN_WIDGET_REGISTRY,
  BUILTIN_WIDGET_KINDS,
  renderWidget,
  widgetBounds,
  type WidgetRegistry,
} from './registry.js';
