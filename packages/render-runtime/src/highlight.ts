// Shared edge-outline builder + utilities (S16 D3).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S16 D3 (line 731):
//   "extract `attachHighlight(committer, opts)` from
//    WallSelectionHighlightCommitter (S09-T6) and use it across all 12
//    committers."
//
// `buildEdgeOutline(geometry, opts)` is the canonical "selected edges"
// builder — produces a `THREE.LineSegments` of the geometry's
// EdgesGeometry, ready to attach to any parent group so it tracks
// move/dispose automatically.  The wall plugin's existing
// `WallSelectionHighlightCommitter` will be retargeted to call this in
// a follow-up PR (S16 carry-forward) so the wall, slab, and 10 other
// element committers all draw the same outline.
//
// All allocations happen here so callers don't have to import THREE
// just to set up an outline.

import * as THREE from '@pryzm/renderer-three/three';

export interface HighlightOptions {
  /** Outline colour.  Default = #ffd166 (PRYZM amber, matches the wall
   *  plugin's `S09-T6` highlight). */
  readonly color?: number;
  /** EdgesGeometry threshold angle in degrees.  Edges whose adjacent
   *  faces meet at < `thresholdAngle` are coalesced.  Default = 30°. */
  readonly thresholdAngle?: number;
  /** Render order — kept high so highlights draw over normal geometry
   *  even with depth-test enabled.  Default = 999. */
  readonly renderOrder?: number;
  /** Whether the outline tests against depth.  Default `true` —
   *  occluded edges are hidden, matching the wall plugin's behaviour. */
  readonly depthTest?: boolean;
}

const DEFAULT_HIGHLIGHT_COLOR = 0xffd166;

/** Produce a `THREE.LineSegments` outlining the geometry's salient
 *  edges.  Caller owns lifecycle — dispose `lineSegs.geometry` and
 *  `lineSegs.material` when removing.
 *
 *  This is the same builder referenced by ADR-0015 §"BVH"; the
 *  edge-extraction step lives on the CPU and is cheap (~ 0.3 ms for a
 *  10k-tri wall geometry). */
export function buildEdgeOutline(
  source: THREE.BufferGeometry,
  opts: HighlightOptions = {},
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(source, opts.thresholdAngle ?? 30);
  const material = new THREE.LineBasicMaterial({
    color: opts.color ?? DEFAULT_HIGHLIGHT_COLOR,
    depthTest: opts.depthTest ?? true,
    transparent: false,
  });
  const lines = new THREE.LineSegments(edges, material);
  lines.renderOrder = opts.renderOrder ?? 999;
  lines.matrixAutoUpdate = false;
  return lines;
}

/** Dispose an outline produced by `buildEdgeOutline`.  Safe to call
 *  repeatedly.  Removes from parent if still attached. */
export function disposeEdgeOutline(lines: THREE.LineSegments): void {
  const parent = lines.parent;
  if (parent) parent.remove(lines);
  lines.geometry.dispose();
  const mat = lines.material;
  if (mat instanceof THREE.Material) mat.dispose();
  else if (Array.isArray(mat)) for (const m of mat) m.dispose();
}
