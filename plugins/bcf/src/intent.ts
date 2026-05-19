/**
 * BCF intent — command ID constants for the BCF plugin (Wave 11 recipe).
 *
 * Spec: PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5 (S57-S60).
 * Recipe status: [S H . . .] — handlers + intent now present.
 */

export const BCF_COMMANDS = {
  /** Import a BCF 2.x/3.0 archive from a Uint8Array. */
  IMPORT: 'bcf.import',
  /** Export the current BCF archive to bytes. */
  EXPORT: 'bcf.export',
  /** Navigate the camera to a BCF viewpoint. */
  VIEWPOINT_NAVIGATE: 'bcf.viewpoint.navigate',
  /** Open a BCF topic for editing. */
  TOPIC_OPEN: 'bcf.topic.open',
  /** Create a new BCF topic. */
  TOPIC_CREATE: 'bcf.topic.create',
  /** Update an existing BCF topic field. */
  TOPIC_UPDATE: 'bcf.topic.update',
} as const;

export type BCFCommandId = typeof BCF_COMMANDS[keyof typeof BCF_COMMANDS];

export interface BCFImportPayload {
  /** Raw BCF zip bytes. */
  bytes: Uint8Array;
  /** Project identifier for GlobalId → PRYZM element id resolution. */
  projectId?: string;
}

export interface BCFExportPayload {
  /** Target filename hint (without extension). */
  filename?: string;
}

export interface BCFViewpointNavigatePayload {
  topicGuid: string;
  viewpointGuid: string;
}
