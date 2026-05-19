// WallSelectionHighlightCommitter — outline overlay for selected walls
// (S09-T6).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T6 (line 696):
//   "committer extension for outline rendering on selection diff.
//    Subscribes to `selectionStore.subscribeDirty(diff => ...)`.
//    Mirrors `WallEdgeOverlayBuilder.ts:154` outline-extrusion pattern.
//    ~80 LOC."
//
// We register this as ANOTHER `PrimitiveCommitter`, keyed on the
// `'selection'` primitive type — i.e. the SelectionStore is bound to
// this committer via `bindStore(selectionStore, 'selection', host)` in
// `bootstrap.render.data.ts`.
//
// On every selection add for `kind === 'wall'`, we look up the wall's
// THREE.Group from the WallCommitter's per-element entry, build a
// `THREE.LineSegments` from the wall's BufferGeometry edges, and add
// it to the same group so the outline tracks the wall on
// move/dispose.  Removal is symmetric.
//
// Non-wall selection kinds are no-ops (the door/window/slab plugins
// will register their own selection committers in 1C).
//
// THREE-only file — lives under `plugins/wall/src/committer/`.

import * as THREE from '@pryzm/renderer-three/three';
import type {
  ElementId,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { SelectionDto } from '@pryzm/plugin-sdk';
import type { WallCommitter } from './wall-committer.js';

const HIGHLIGHT_COLOR = 0xffd166;

/** Public — registered on the host via `bindStore(selectionStore,
 *  'selection', host)`.  Constructor takes the wall committer so we can
 *  reach into its per-id THREE.Group and attach the outline as a
 *  child (auto-tracking move + dispose). */
export class WallSelectionHighlightCommitter
  implements PrimitiveCommitter<SelectionDto, THREE.Object3D>
{
  readonly primitiveType = 'selection';
  // We attach the outline to the wall's Group so dispose tracks
  // automatically; bookkeeping here only stores the LineSegments
  // back-reference for symmetric removal.
  private readonly outlines = new Map<ElementId, THREE.LineSegments>();
  // Holder Object3D handed back to the host.  The host requires SOMETHING
  // to track in its registry; we use an empty Object3D since the actual
  // outline lives inside the wall's group, not at the scene root.
  private readonly placeholders = new Map<ElementId, THREE.Object3D>();

  constructor(private readonly walls: WallCommitter) {}

  onAdd(id: ElementId, dto: SelectionDto): THREE.Object3D {
    const placeholder = new THREE.Object3D();
    placeholder.name = `selection:${id}`;
    this.placeholders.set(id, placeholder);
    if (dto.kind !== 'wall') return placeholder;

    const entry = this.walls.getEntry(dto.id);
    if (entry === undefined) return placeholder;

    const outline = buildEdgeOutline(entry.mesh.geometry);
    outline.name = `wall:${dto.id}:outline`;
    // Add to the wall's Group so move/dispose are automatic.
    const wallGroup = entry.mesh.parent;
    if (wallGroup) wallGroup.add(outline);
    this.outlines.set(id, outline);
    return placeholder;
  }

  onUpdate(_id: ElementId, _dto: SelectionDto, _obj: THREE.Object3D): void {
    // Selection updates (e.g. subId change) don't re-build the outline
    // — the outline tracks the wall geometry, not the selection sub-id.
  }

  onRemove(id: ElementId, _obj: THREE.Object3D): void {
    const outline = this.outlines.get(id);
    if (outline) {
      const parent = outline.parent;
      if (parent) parent.remove(outline);
      outline.geometry.dispose();
      const mat = outline.material;
      if (mat instanceof THREE.Material) mat.dispose();
      else if (Array.isArray(mat)) for (const m of mat) m.dispose();
      this.outlines.delete(id);
    }
    this.placeholders.delete(id);
  }

  onDispose(): void {
    for (const [, outline] of this.outlines) {
      const parent = outline.parent;
      if (parent) parent.remove(outline);
      outline.geometry.dispose();
      const mat = outline.material;
      if (mat instanceof THREE.Material) mat.dispose();
      else if (Array.isArray(mat)) for (const m of mat) m.dispose();
    }
    this.outlines.clear();
    this.placeholders.clear();
  }

  /** Test hook — number of live outlines. */
  outlineCount(): number {
    return this.outlines.size;
  }
}

/** Cheap edges-of-geometry outline.  Mirrors WallEdgeOverlayBuilder.ts
 *  in spirit — the offset-extruded path lands as a follow-up; for S09
 *  the EdgesGeometry pass is sufficient to make selection visually
 *  obvious in the demo. */
function buildEdgeOutline(geometry: THREE.BufferGeometry): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geometry, 30);
  const mat = new THREE.LineBasicMaterial({
    color: HIGHLIGHT_COLOR,
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const lines = new THREE.LineSegments(edges, mat);
  lines.renderOrder = 999;
  return lines;
}
