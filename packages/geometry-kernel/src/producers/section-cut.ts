// section-cut — kernel-pure section cut producer (W-09 — moved from
// `plugins/section-view/src/section-cut-producer.ts`).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-09.
// Original sprint: §S37 (post-2B closeout / ADR-0030).
//
// W-09 RATIONALE
// ─────────────────────────────────────────────────────────────────────────────
// Section-cut is a pure DTO → 2D-edge producer.  It belongs in the geometry
// kernel alongside `produceWall`, `produceRoom`, and the edge-projection
// pipeline (`packages/geometry-kernel/src/edge-projection.ts`).  The
// previous home (`plugins/section-view/`) was a leftover from the S37
// skeleton — moving it here lets the bake worker call into it without a
// plugin import, and lets `plan-view`'s edge-projection pipeline reuse the
// classifier surface in a future sprint.
//
// The plugin file at `plugins/section-view/src/section-cut-producer.ts`
// becomes a re-export shim for in-tree callers; deletion is gated to S61
// alongside the rest of the legacy-shim removals.
//
// PURE: no DOM, no THREE, no Node-only globals.  Runs in Node tests + the
// bake worker.

export interface Vec2 { readonly x: number; readonly y: number }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

export interface AabbForSection {
  readonly id: string;
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface SectionLine {
  /** World-XY start of the section line. */
  readonly a: Vec2;
  /** World-XY end of the section line. */
  readonly b: Vec2;
  /** "Look depth" behind the section plane (m).  Elements whose AABB is
   *  further than this behind the plane are not drawn. */
  readonly lookDepth: number;
}

export interface SectionEdge2D {
  readonly elementId: string;
  /** Section-screen 2D start (X = signed distance along the line, Y = world Z). */
  readonly a: Vec2;
  readonly b: Vec2;
  readonly classification: 'cut' | 'beyond';
}

export interface SectionCutResult {
  readonly cutEdges: readonly SectionEdge2D[];
  readonly beyondEdges: readonly SectionEdge2D[];
}

/** Internal: project a world XY point onto a section line.  Returns the
 *  signed distance ALONG the line (positive in the a→b direction) and
 *  the perpendicular distance BEHIND the line (positive when on the
 *  "look" side; negative on the camera side). */
function projectOntoLine(p: Vec2, a: Vec2, b: Vec2): { along: number; behind: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { along: 0, behind: 0 };
  const ux = dx / len, uy = dy / len;
  const px = p.x - a.x, py = p.y - a.y;
  return {
    along: px * ux + py * uy,
    behind: -px * uy + py * ux,
  };
}

function aabbCorners(aabb: AabbForSection): readonly Vec2[] {
  return [
    { x: aabb.min.x, y: aabb.min.y },
    { x: aabb.max.x, y: aabb.min.y },
    { x: aabb.max.x, y: aabb.max.y },
    { x: aabb.min.x, y: aabb.max.y },
  ];
}

/**
 * Produce a section cut.  Pure: same input ⇒ identical output.
 *
 * Algorithm (skeleton; depth-pass at S37+ replaces with full classifier):
 *   1. For each AABB, compute the four corner projections onto the section
 *      line.
 *   2. If `min(behind) <= 0 <= max(behind)` ⇒ AABB straddles the plane ⇒
 *      emit a vertical "cut" segment from `(min(along), worldZmin)` to
 *      `(max(along), worldZmax)`.
 *   3. Else if all corners are behind (positive `behind`) AND
 *      `min(behind) <= lookDepth` ⇒ emit "beyond" silhouette: top & bottom
 *      horizontal edges between `min(along)` and `max(along)` at z=min and
 *      z=max.
 *   4. Else ⇒ skip (entirely on the camera side, or beyond look depth).
 */
export function produceSectionCut(
  line: SectionLine,
  elements: readonly AabbForSection[],
): SectionCutResult {
  const cutEdges: SectionEdge2D[] = [];
  const beyondEdges: SectionEdge2D[] = [];

  for (const aabb of elements) {
    const corners = aabbCorners(aabb);
    const projs = corners.map((c) => projectOntoLine(c, line.a, line.b));
    const along = projs.map((p) => p.along);
    const behind = projs.map((p) => p.behind);
    const minA = Math.min(...along), maxA = Math.max(...along);
    const minB = Math.min(...behind), maxB = Math.max(...behind);

    if (minB <= 0 && maxB >= 0) {
      cutEdges.push({
        elementId: aabb.id,
        a: { x: minA, y: aabb.min.z },
        b: { x: maxA, y: aabb.max.z },
        classification: 'cut',
      });
    } else if (minB > 0 && minB <= line.lookDepth) {
      beyondEdges.push({
        elementId: aabb.id,
        a: { x: minA, y: aabb.max.z },
        b: { x: maxA, y: aabb.max.z },
        classification: 'beyond',
      });
      beyondEdges.push({
        elementId: aabb.id,
        a: { x: minA, y: aabb.min.z },
        b: { x: maxA, y: aabb.min.z },
        classification: 'beyond',
      });
    }
  }
  return { cutEdges, beyondEdges };
}
