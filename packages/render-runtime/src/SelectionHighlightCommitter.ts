// SelectionHighlightCommitter — generic selection→outline committer
// (S16 D3, M9 baseline).
//
// One committer instance handles ALL 12 element kinds via a per-kind
// `HighlightProvider` registry.  Element plugins register their own
// provider during bootstrap (the wall plugin keeps its existing
// behaviour — it can keep using `WallSelectionHighlightCommitter`
// until a follow-up PR migrates it; new element committers in S11+
// register their provider here and get the outline for free).
//
// A `HighlightProvider` answers two questions:
//   1. Where does the outline attach?  → `parentFor(id)` returns the
//      Group/Object3D that the outline becomes a child of (so the
//      outline tracks move + dispose).
//   2. What geometry should the outline trace?  → `geometryFor(id)`
//      returns the `BufferGeometry` to extract edges from.
//
// Providers can return `null` for either (e.g. an element that has
// not yet committed); the highlight is then deferred until the next
// selection event.

import * as THREE from '@pryzm/renderer-three/three';
import type {
  ElementId,
  PrimitiveCommitter,
} from '@pryzm/scene-committer';
import type { SelectionDto, SelectionKind } from '@pryzm/stores';
import { buildEdgeOutline, disposeEdgeOutline, type HighlightOptions } from './highlight.js';

export interface HighlightProvider {
  /** The Object3D the outline becomes a child of — typically the
   *  element's owning Group so the outline tracks move/dispose. */
  parentFor(id: ElementId): THREE.Object3D | null;
  /** The geometry to extract edges from. */
  geometryFor(id: ElementId): THREE.BufferGeometry | null;
}

export type HighlightProviderRegistry = ReadonlyMap<SelectionKind, HighlightProvider>;

export interface SelectionHighlightCommitterOptions {
  readonly highlight?: HighlightOptions;
}

export class SelectionHighlightCommitter
  implements PrimitiveCommitter<SelectionDto, THREE.Object3D>
{
  readonly primitiveType = 'selection';

  private readonly outlines = new Map<ElementId, THREE.LineSegments>();
  private readonly placeholders = new Map<ElementId, THREE.Object3D>();

  constructor(
    private readonly providers: HighlightProviderRegistry,
    private readonly opts: SelectionHighlightCommitterOptions = {},
  ) {}

  onAdd(id: ElementId, dto: SelectionDto): THREE.Object3D {
    const placeholder = new THREE.Object3D();
    placeholder.name = `selection:${id}`;
    this.placeholders.set(id, placeholder);

    const provider = this.providers.get(dto.kind);
    if (provider === undefined) return placeholder;
    const parent = provider.parentFor(dto.id);
    const geometry = provider.geometryFor(dto.id);
    if (parent === null || geometry === null) return placeholder;

    const outline = buildEdgeOutline(geometry, this.opts.highlight ?? {});
    outline.name = `${dto.kind}:${dto.id}:outline`;
    parent.add(outline);
    this.outlines.set(id, outline);
    return placeholder;
  }

  onUpdate(_id: ElementId, _dto: SelectionDto, _obj: THREE.Object3D): void {
    // Sub-id updates don't rebuild the outline.  Geometry updates flow
    // through the OWNING element committer (which mutates the geometry
    // referenced by `EdgesGeometry`); the outline is then re-extracted
    // on the next selection toggle.  A future enhancement could
    // subscribe to the geometry's `version` to live-rebuild.
  }

  onRemove(id: ElementId, _obj: THREE.Object3D): void {
    const outline = this.outlines.get(id);
    if (outline) {
      disposeEdgeOutline(outline);
      this.outlines.delete(id);
    }
    this.placeholders.delete(id);
  }

  onDispose(): void {
    for (const [, outline] of this.outlines) disposeEdgeOutline(outline);
    this.outlines.clear();
    this.placeholders.clear();
  }
}
