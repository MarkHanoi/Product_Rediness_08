/**
 * `@pryzm/ui` — UI host primitives for the Phase 3-B Sprint S60
 * PropertyPanel decomposition. Per
 * `docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §6.1.
 */
export {
  PanelHost,
  PRYZM_PANEL_HOST_TRACER,
  type PanelContribution,
  type PanelContext,
  type PanelCategory,
} from './PanelHost.js';
export {
  InspectorHost,
  PRYZM_INSPECTOR_HOST_TRACER,
  type InspectorTabContribution,
} from './InspectorHost.js';

// S70 D7 — Accessibility tokens per ADR-0052 §B.2.
export {
  A11Y_STYLESHEET,
  EDITOR_BG_DARK_RGB,
  EDITOR_BG_LIGHT_RGB,
  FOCUS_RING_COLOR,
  FOCUS_RING_OFFSET_PX,
  FOCUS_RING_RGB,
  FOCUS_RING_WIDTH_PX,
  SKIP_LINK_TARGET_ID,
  contrastRatio,
  injectA11yStylesheet,
  relativeLuminance,
} from './a11y/index.js';
