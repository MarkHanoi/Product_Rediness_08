/**
 * `@pryzm/plugin-ifc-export` — public surface.
 *
 * Phase 3-B Sprint S56 (IFC Tier 1 Export + Pset Round-Trip).
 *
 * Usage:
 *
 * ```ts
 * import { exportProjectToIFC, InMemoryIFCMetaStore } from '@pryzm/plugin-ifc-export';
 *
 * const store = new InMemoryIFCMetaStore();
 * const { bytes } = await exportProjectToIFC(snapshot, store, { name: 'My Project' });
 * fs.writeFileSync('out.ifc', bytes);
 * ```
 */

export { exportProjectToIFC, type ExportResult } from './orchestrator.js';
export { exportProjectToIFC4X3 } from './exporters/IFC4X3Exporter.js';
export { InMemoryIFCMetaStore } from './meta-store.js';
export type {
  ExportOptions,
  IFCElementMeta,
  IFCMetaStoreLike,
  LevelInfo,
  ProjectMeta,
  ProjectSnapshot,
  Pset,
  PsetValue,
  Qset,
} from './types.js';
export { globalIdFromUuid, deterministicUuid } from './guid.js';
export { PRYZM_IFC_TRACER } from './otel.js';

// Wave 11 recipe completion — handlers + intent.
export { IFC_EXPORT_COMMANDS, registerIFCExportHandlers } from './handlers/index.js';
export type {
  IFCExportCommandId,
  IFCExportHandlerDeps,
  IFCExportHandlerType,
} from './handlers/index.js';
export type { IFCExportPayload, IFCMetaUpsertPayload } from './intent.js';
