// @pryzm/plugin-section-view — public surface (W-09).

export {
  produceSectionCut,
  type AabbForSection,
  type SectionCutResult,
  type SectionEdge2D,
  type SectionLine,
  type Vec2,
  type Vec3,
} from './section-cut-producer.js';

export {
  SectionViewCanvasHost,
  type SectionViewHostOptions,
} from './SectionViewCanvasHost.js';

export {
  SectionViewRenderer,
  type CanvasLike,
  type SectionRenderViewport,
  type RenderStats,
} from './SectionViewRenderer.js';

export {
  SECTION_HANDLER_TYPES,
  buildSectionHandlerSet,
  registerSectionHandlers,
  CreateSectionHandler,
  DeleteSectionHandler,
  MoveSectionLineHandler,
  SetSectionDepthHandler,
  SetSectionMarkHandler,
  SetSectionScaleHandler,
  type SectionHandlerType,
  type CreateSectionPayload,
  type DeleteSectionPayload,
  type MoveSectionLinePayload,
  type SetSectionDepthPayload,
  type SetSectionMarkPayload,
  type SetSectionScalePayload,
} from './handlers/index.js';
