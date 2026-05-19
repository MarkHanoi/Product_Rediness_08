// Tool contract — the SketchCanvas dispatches events; the tool returns
// a preview overlay and may commit lines via injected dependencies (S52 D1).

import type { SnapHit } from '../snap.js';

export type ToolName =
  | 'select'
  | 'line'
  | 'rectangle'
  | 'arc'
  | 'circle'
  | 'fillet'
  | 'trim';

export interface ToolEvent {
  readonly kind: 'pointer-move' | 'pointer-down' | 'cancel';
  /** World X (mm) — already snapped. */
  readonly worldX: number;
  /** World Z (mm) — already snapped. */
  readonly worldZ: number;
  readonly snap: SnapHit;
}

export interface PreviewLine {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
}

export interface PreviewCircle {
  readonly cx: number;
  readonly cz: number;
  readonly radius: number;
}

export interface PreviewArc {
  readonly cx: number;
  readonly cz: number;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export interface ToolPreview {
  /** Transient lines to draw above committed entities. */
  readonly previewLines: readonly PreviewLine[];
  readonly previewCircles?: readonly PreviewCircle[];
  readonly previewArcs?: readonly PreviewArc[];
  /** Optional HUD hint, e.g. "Click second corner". */
  readonly hint?: string;
}

export const EMPTY_PREVIEW: ToolPreview = Object.freeze({
  previewLines: Object.freeze([]) as readonly PreviewLine[],
});

/** Identifier for a committed line — opaque string, supplied by the store. */
export type CommittedId = string;

/**
 * Dependencies handed to a tool at construction time.  Keeps tools
 * decoupled from the document store so they're trivially unit-testable.
 */
export interface ToolDeps {
  /** Commit a single line to the document; returns the new line id. */
  readonly commitLine: (line: PreviewLine) => CommittedId;
  /** Commit a circle (centre + radius). Returns the new circle id. */
  readonly commitCircle?: (circle: PreviewCircle) => CommittedId;
  /** Commit an arc (centre + radius + sweep). Returns the new arc id. */
  readonly commitArc?: (arc: PreviewArc) => CommittedId;
  /** Replace an existing line with a shorter version (Trim tool). */
  readonly trimLine?: (id: CommittedId, keep: 'start' | 'end', cutX: number, cutZ: number) => void;
  /** Remove an entity by id (Fillet may delete the original corner segment). */
  readonly removeEntity?: (id: CommittedId) => void;
}

export interface SketchTool {
  readonly name: ToolName;
  /** Handle a pointer event; returns the new preview overlay. */
  handle(event: ToolEvent): ToolPreview;
  /** Reset internal state and clear preview. */
  reset(): ToolPreview;
}
