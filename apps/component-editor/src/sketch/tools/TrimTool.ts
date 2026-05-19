// TrimTool — shorten a line segment at the click point (S53 D1).
//
// One-click flow: pick a line and a click point. The click point is
// projected onto the segment; the *farther* endpoint is the cut
// location, the *closer* endpoint is preserved (intuitive: "I'm
// removing the side I clicked on"). The line's preserved endpoint id
// is kept; the cut endpoint moves to the projection point via a
// `trimLine` call on `ToolDeps`.
//
// LIMITATIONS — works on straight line segments only. Trimming circles
// to arcs lands at S55. Cuts are not allowed if the click is outside
// the segment's projection range — the tool surfaces "Click on the
// part you want to remove" in that case.

import type { SketchEntity, SketchLine, SketchPoint } from '../entities.js';
import { hitTest, pointToSegmentDistance } from '../hitTest.js';
import {
  EMPTY_PREVIEW,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

export interface TrimDeps extends ToolDeps {
  readonly entitiesNow: () => readonly SketchEntity[];
  readonly defaultTolMm: () => number;
}

const HOVER_HINT = 'Click the part of a line to trim';

export function createTrimTool(deps: TrimDeps): SketchTool {
  function hint(text: string): ToolPreview {
    return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint: text });
  }

  return {
    name: 'trim',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') return hint(HOVER_HINT);
      if (event.kind === 'pointer-move') return hint(HOVER_HINT);
      const tol = Math.max(1e-3, deps.defaultTolMm());
      const entities = deps.entitiesNow();
      const h = hitTest({ x: event.worldX, z: event.worldZ, entities, tolMm: tol });
      if (h.kind !== 'line' || !h.id) return hint('Miss — click directly on a line.');
      const line = entities.find((e): e is SketchLine => e.kind === 'line' && e.id === h.id);
      if (!line) return hint('Selection vanished — try again.');
      const p1 = entities.find((e): e is SketchPoint => e.kind === 'point' && e.id === line.p1);
      const p2 = entities.find((e): e is SketchPoint => e.kind === 'point' && e.id === line.p2);
      if (!p1 || !p2) return hint('Line is missing endpoints — cannot trim.');

      const proj = projectOntoSegment(event.worldX, event.worldZ, p1, p2);
      if (!proj) {
        return hint('Click closer to the line — projection landed outside the segment.');
      }
      const dToP1 = Math.hypot(event.worldX - p1.x, event.worldZ - p1.z);
      const dToP2 = Math.hypot(event.worldX - p2.x, event.worldZ - p2.z);
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      // The endpoint we click closer to is the one being removed.
      const keep: 'start' | 'end' = dToP1 < dToP2 ? 'end' : 'start';
      const cutDistFromKeep = keep === 'start'
        ? Math.hypot(proj.x - p1.x, proj.z - p1.z)
        : Math.hypot(proj.x - p2.x, proj.z - p2.z);
      if (cutDistFromKeep < 1e-3 || cutDistFromKeep >= segLen) {
        return hint('Cut would degenerate the line — pick a midpoint area instead.');
      }
      if (!deps.trimLine) throw new Error('TrimTool: ToolDeps.trimLine is required.');
      deps.trimLine(line.id as string, keep, proj.x, proj.z);
      return hint(HOVER_HINT);
    },
    reset(): ToolPreview {
      return hint(HOVER_HINT);
    },
  };
}

function projectOntoSegment(
  px: number,
  pz: number,
  a: SketchPoint,
  b: SketchPoint,
): { x: number; z: number } | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return null;
  const t = ((px - a.x) * dx + (pz - a.z) * dz) / lenSq;
  if (t < 0 || t > 1) return null;
  // Sanity — project must be within tol of the segment.
  const cx = a.x + t * dx;
  const cz = a.z + t * dz;
  const off = pointToSegmentDistance(px, pz, a.x, a.z, b.x, b.z);
  if (off > Math.max(1, lenSq) ** 0.5) return null;
  return { x: cx, z: cz };
}
