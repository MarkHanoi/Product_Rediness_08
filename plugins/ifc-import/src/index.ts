/**
 * `@pryzm/plugin-ifc-import` — public surface
 *
 * Phase 3-B Sprint S57 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.1).
 * Tier 2 transform-only proxy import + meta-store population +
 * `MoveIFCProxyCommand` reducer.
 *
 * The import side closes the round-trip opened by `@pryzm/plugin-ifc-export`
 * at S56: re-importing an exported file re-binds the original GlobalIds and
 * Pset state through the side-car meta-store.
 */

export { ifcImportDescriptor, PLUGIN_ID, PLUGIN_VERSION } from './descriptor.js';
export { buildIfcImportPluginHandlerSet } from './handlers/pluginHandlers.js';
export type { IfcImportPluginHandler } from './handlers/pluginHandlers.js';

export type {
  IFCProxyDTO,
  IFCElementMeta,
  IFCElementTier,
  Pset,
  PsetValue,
  ImportResult,
  MoveIFCProxyCommand,
  MoveResult,
} from './types.js';

export { TIER_2_IFC_TYPES } from './types.js';

export {
  convertTier2Element,
  resolveLocalPlacementMatrix,
  resolveIfcTypeName,
  computeGeometryHash,
  extractAllPsets,
  IDENTITY_PLACEMENT,
  type IfcApiLike,
  type PsetSource,
} from './converters/tier2-proxy.js';

export {
  applyMoveProxy,
  applyMoveProxyTraced,
} from './commands/index.js';

export {
  metaFromProxy,
  metaFromTier1,
  populateSink,
  type IFCMetaStoreSink,
} from './meta-store-population.js';

export { PRYZM_IFC_IMPORT_TRACER } from './otel.js';

export {
  readIfcProjectedCRS,
} from './IfcProjectedCRSReader.js';

export {
  IFCImportHandler,
  type IFCParseResult,
} from './IFCImportHandler.js';

export type { IFCParseRequest, IFCParseResponse } from './workers/IFCParseWorker.js';
