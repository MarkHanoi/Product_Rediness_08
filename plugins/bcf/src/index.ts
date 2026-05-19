/**
 * `@pryzm/plugin-bcf` — public surface
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * BCF 3.0 export with viewpoints + snapshots round-trip with Solibri).
 *
 * Sprint history:
 *   - S57 — initial BCF 3.0 read + write, low-fidelity subset
 *           (single viewpoint per topic, no components / colouring).
 *   - S59 — Solibri-parity surface: multiple viewpoints per topic,
 *           components selection / visibility / colouring, related
 *           topics, AssignedTo / DueDate / Stage; IFC GlobalId bridge
 *           for PRYZM ↔ BCF component resolution.
 */

export type {
  BCFArchive,
  BCFAuthor,
  BCFColoringGroup,
  BCFComment,
  BCFComponent,
  BCFComponents,
  BCFProject,
  BCFTopic,
  BCFViewpoint,
  BCFViewpointPosition,
} from './types.js';

export { readBCF } from './reader.js';
export { writeBCF } from './writer.js';
export { PRYZM_BCF_TRACER } from './otel.js';

export type {
  PryzmElementResolver,
  PryzmGlobalIdResolver,
  ResolvedBCFComponent,
  ResolvedBCFViewpoint,
  ResolveSummary,
} from './ifc-bridge.js';
export {
  buildResolversFromMap,
  collectReferencedGlobalIds,
  resolveViewpoint,
  selectionToBCFComponents,
  summariseResolution,
  topicsWithComponentRefs,
} from './ifc-bridge.js';

export type {
  CameraTarget,
  PerspectiveCameraTarget,
  OrthogonalCameraTarget,
  Vec3Tuple,
  NavigatorOptions,
} from './viewpoint-navigator.js';
export {
  viewpointToCameraTarget,
  positionToCameraTarget,
  selectViewpointByGuid,
  focusPointAtDistance,
} from './viewpoint-navigator.js';

export type { BcfPanelDeps } from './panel-contribution.js';
export { createBcfPanelContribution } from './panel-contribution.js';

// Wave 11 recipe completion — handlers + intent.
export { BCF_COMMANDS, registerBCFHandlers } from './handlers/index.js';
export type {
  BCFCommandId,
  BCFHandlerDeps,
  BCFHandlerType,
} from './handlers/index.js';
export type {
  BCFImportPayload,
  BCFExportPayload,
  BCFViewpointNavigatePayload,
} from './intent.js';
