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

// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921/L-9922) — the plugin's OWN runtime
// registration + the store it contributes. Both existed on disk and neither was
// exported from this barrel, which is why `section.*` was registered by
// engineLauncher and undispatchable for want of a `section` store key. A
// barrel that omits a real export is indistinguishable from a package that
// lacks it — see [[grep-silence-has-three-causes]].
export { sectionViewPluginRegistration } from './registration.js';
export {
  SectionStore,
  type SectionId,
  type SectionsState,
} from './store.js';

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
