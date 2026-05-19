/**
 * IFC-export intent — command ID constants (Wave 11 recipe completion).
 *
 * Spec: PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §S56 (IFC Tier 1 Export).
 * Recipe status: [S H . . .] — handlers + intent now present.
 */

import type { ProjectMeta, ProjectSnapshot } from './types.js';

export const IFC_EXPORT_COMMANDS = {
  /** Export the full project snapshot to IFC4 bytes. */
  EXPORT: 'ifc.export',
  /** Export a single element family to IFC4 (for incremental workflows). */
  EXPORT_FAMILY: 'ifc.export.family',
  /** Store IFC metadata (Psets, GlobalIds) against a PRYZM element id. */
  META_STORE_UPSERT: 'ifc.meta.upsert',
  /** Clear stored IFC metadata for an element. */
  META_STORE_CLEAR: 'ifc.meta.clear',
} as const;

export type IFCExportCommandId = typeof IFC_EXPORT_COMMANDS[keyof typeof IFC_EXPORT_COMMANDS];

export interface IFCExportPayload {
  /** Snapshot of the scene graph to export. */
  snapshot: ProjectSnapshot;
  /** Project metadata (name, address, etc.). */
  projectMeta: ProjectMeta;
  /** Optional filename hint (without extension). */
  filename?: string;
}

export interface IFCMetaUpsertPayload {
  elementId: string;
  ifcGuid: string;
  psets?: Record<string, Record<string, string | number | boolean>>;
}
