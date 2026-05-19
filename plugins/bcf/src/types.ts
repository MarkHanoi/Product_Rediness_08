/**
 * Public types for `@pryzm/plugin-bcf` (BCF 3.0 — buildingSMART).
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * and PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S59 BCF round-trip).
 *
 * BCF 3.0 spec: a topic is a folder named after its UUID containing:
 *   - `markup.bcf`              (XML)  — required
 *   - `<vp-guid>.bcfv`          (XML) — one per `Viewpoints/Viewpoint`
 *   - `<vp-guid>.png` (snapshot) — optional, paired with .bcfv
 * Plus a single root `project.bcfp` and `bcf.version` file.
 *
 * Sprint S57 shipped the low-fidelity subset (single viewpoint per topic).
 * Sprint S59 lifts the surface to Solibri / BIM Track parity:
 *   - Multiple viewpoints per topic.
 *   - Components: selection, visibility-overrides, per-element colouring
 *     (IFC GlobalId keyed — PRYZM ↔ Revit round-trip lives here).
 *   - Related topics (cross-references).
 *   - AssignedTo, DueDate, Stage on the Topic.
 *
 * Backward-compat note: `viewpoint` (singular) is removed. Topics with a
 * single viewpoint use a one-element `viewpoints` array. Reader accepts the
 * legacy `snapshot.png` / `viewpoint.bcfv` filenames for archives written
 * by S57-era exporters or by the buildingSMART reference samples.
 */

export interface BCFAuthor {
  email: string;
}

export interface BCFComment {
  guid: string;
  date: string;
  author: string;
  comment: string;
  /** Optional GUID of the viewpoint this comment references. */
  viewpoint?: string | undefined;
  /** Optional GUID of a parent comment (BCF 3.0 reply chain). */
  parent?: string | undefined;
}

export interface BCFViewpointPosition {
  cameraViewPoint: { x: number; y: number; z: number };
  cameraDirection: { x: number; y: number; z: number };
  cameraUpVector: { x: number; y: number; z: number };
  /** Perspective `fieldOfView` (degrees) OR orthographic `viewToWorldScale`. */
  fieldOfView?: number;
  viewToWorldScale?: number;
  cameraType: 'perspective' | 'orthogonal';
}

/**
 * A BCF "Component" reference. The `ifcGuid` is the 22-character compressed
 * IFC GlobalId; PRYZM resolves this back to its native element via the
 * `IFCMetaStore.byGuid` lookup populated during `@pryzm/plugin-ifc-import`.
 *
 * `originatingSystem` and `authoringToolId` are optional BCF 3.0 fields
 * preserved on round-trip for consumer attribution (Solibri, Revit, etc.).
 */
export interface BCFComponent {
  ifcGuid: string;
  originatingSystem?: string | undefined;
  authoringToolId?: string | undefined;
}

/**
 * A coloured component group. `color` is an 8-character ARGB hex (BCF 3.0
 * convention — alpha first, no `#` prefix).
 */
export interface BCFColoringGroup {
  /** ARGB hex without `#` (e.g. `ff00ff00` for opaque green). */
  color: string;
  components: BCFComponent[];
}

/**
 * BCF 3.0 `Components` block on a viewpoint. All sub-fields are optional —
 * a viewpoint may carry only camera data, only components, or both.
 *
 * `defaultVisibility` follows the BCF 3.0 semantic: when `true`, listed
 * components are *hidden* (exceptions to the default-visible state); when
 * `false`, listed components are the *only* visible ones.
 */
export interface BCFComponents {
  selection?: BCFComponent[];
  visibility?: {
    defaultVisibility: boolean;
    exceptions: BCFComponent[];
  };
  coloring?: BCFColoringGroup[];
  viewSetupHints?: {
    spacesVisible?: boolean;
    spaceBoundariesVisible?: boolean;
    openingsVisible?: boolean;
  };
}

export interface BCFViewpoint {
  guid: string;
  /** Camera position — null for component-only viewpoints. */
  position: BCFViewpointPosition | null;
  /** Optional snapshot bytes (PNG) if present. */
  snapshotPng?: Uint8Array;
  /** S59: per-viewpoint component selection / visibility / coloring. */
  components?: BCFComponents;
}

export interface BCFTopic {
  guid: string;
  topicType: string;
  topicStatus: string;
  title: string;
  priority?: string | undefined;
  index?: number | undefined;
  labels?: string[] | undefined;
  creationDate: string;
  creationAuthor: string;
  modifiedDate?: string | undefined;
  modifiedAuthor?: string | undefined;
  /** S59: BCF 3.0 AssignedTo (email or user identifier). */
  assignedTo?: string | undefined;
  /** S59: BCF 3.0 DueDate (ISO 8601). */
  dueDate?: string | undefined;
  /** S59: BCF 3.0 Stage (free-text milestone, e.g. "DD", "CD"). */
  stage?: string | undefined;
  description?: string | undefined;
  comments: BCFComment[];
  /**
   * S59: zero or more viewpoints. Topics without a viewpoint hold an empty
   * array (S57 used `viewpoint: null` — that field is removed).
   */
  viewpoints: BCFViewpoint[];
  /** S59: GUIDs of related topics (cross-references). */
  relatedTopics?: string[] | undefined;
}

export interface BCFProject {
  projectId: string;
  name: string;
  /** BCF schema version — `3.0` for this plugin. */
  version: string;
  extensionSchema?: string | undefined;
}

export interface BCFArchive {
  project: BCFProject;
  topics: BCFTopic[];
}
