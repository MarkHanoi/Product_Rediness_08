// View-renderer barrel (S40 / Phase 2C).
export {
  type ViewKind,
  VIEW_KINDS,
  type EditCamera,
  IDENTITY_EDIT_CAMERA,
  type ViewSource,
  type ViewSourceRequest,
  applyEditCamera,
} from './view-source.js';
export {
  type ViewRegistry,
  type ViewRegistryEntry,
  MapViewRegistry,
} from './view-registry.js';
export {
  ViewportEditController,
  type ViewportEditControllerOptions,
} from './viewport-edit-controller.js';
export {
  CompositeViewRenderer,
  type CompositeViewRendererOptions,
} from './composite.js';
