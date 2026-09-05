// ComponentCommitter — `PrimitiveCommitter<ComponentData, THREE.Group>`.
// §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10 · C84 §6 · spec §66 / §75.
//
// ─── §L7-COMMITTER-HOME (2026-09-05) — WHY THIS LIVES IN apps/editor, NOT THE PLUGIN ─
// This file, its two bridges and its ports were authored at
// `plugins/component/src/committer/` and moved here unchanged in behaviour.
// A plugin (L6) may not import `@pryzm/renderer-three`: that is the l7-boundary
// rule, and `tools/ga-gate/check-l7-boundary.ts` ratchets it per plugin against
// `.ga-gate/baselines/l7-boundary-violations.json`. `component` is a NEW plugin, so
// its baseline is 0, and three `import * as THREE` lines read as a +3 regression —
// exit 3, which §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836) forbids absorbing by
// raising the ceiling. The nineteen older plugins that keep a THREE-bearing
// `committer/` do so on a BASELINED count that only shrinks; a new family does not
// get to join them. L7 may import anything below it, and the house pattern for
// new store→scene code is exactly this directory (`WaterMeshBuilder.ts`,
// `BoundaryLineMeshBuilder.ts`, `SpaceEnvelopeMeshBuilder.ts`), so the render
// seam of the component family sits beside them. `@pryzm/plugin-component` is now
// THREE-free end to end; the record/verbs stay there (ADR-0376 D9), the pixels
// are wired here (D10).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FIRST COMMITTER WRITTEN FOR A FAMILY WHOSE GEOMETRY IS *REGENERATED*
//    RATHER THAN STORED.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every other committer in this repository receives a DTO that already contains
// the numbers its geometry needs — a wall's start/end/height, a slab's loop, a
// piece of furniture's catalogId and scale — and calls a synchronous producer on
// them. A placed component's record deliberately contains NONE of that: lane 4C's
// store header is explicit that *"no resolved parameter values, no geometry, no
// mesh, no baked profile"* live in a record, because a resolved value stored is a
// derived value stored (C84 §8.i).
//
// The whole of spec §66's F-2 falsifier rests on that absence — place twenty,
// override one, change the TYPE, and nineteen follow because they hold no copy to
// go stale. This committer is the seam where that absence has to be PAID FOR: it
// must reach the definition, resolve the ladder and rebuild the mesh on every
// change that can move a number.
//
// ─── §COMPONENT-RENDER-ASYNC-SEAM ─────────────────────────────────────────────
// ⚠ `PrimitiveCommitter` is SYNCHRONOUS at all four methods — `onAdd` must RETURN
//   the `Object3D` the host registers. The family bake is a `Promise`. So `onAdd`
//   returns an EMPTY `THREE.Group` and the solids arrive as children when the bake
//   resolves.
//
//   That is a real property of this path and it is stated, not smoothed over:
//   between `onAdd` and the bake landing, a placed component exists in the scene
//   graph with zero triangles. Anything that measures "did it render" by counting
//   children immediately after dispatch will read 0 and be RIGHT. The wiring is
//   told when geometry lands, through `onGeometryReady`, and that callback is the
//   only honest way to know.
//
// ─── §COMPONENT-RENDER-GENERATION-GUARD ───────────────────────────────────────
// ⭐ Because the rebuild is async, two rebuilds for one element can be in flight
//   at once, and the SECOND is not guaranteed to resolve last. Spec §66's exit
//   criterion ends with the words *"and no stale derived geometry overwrites
//   newer state"* — so each element carries a monotonic generation, every bake
//   captures the generation it was issued under, and a bake that resolves under a
//   superseded generation DISCARDS its own result. Without this, a rapid
//   type-swap sequence lands whichever bake happens to finish last.
//
// ─── ⛔ WHAT IT REFUSES TO DRAW ───────────────────────────────────────────────
// A component whose `definitionId` names nothing this wiring can resolve, and a
// component whose every solid the bake REFUSED, both render as an EMPTY marked
// group with a counted, logged reason. ⛔ Never a substitute box, never a
// placeholder cube: spec §75 forbids demo-only geometry, and a believable stand-in
// is worse than an absence because nothing ever prompts anybody to look
// ([[context-data-honesty-family]] — C100 §5's reasoning, one family over).

import * as THREE from '@pryzm/renderer-three/three';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/scene-committer';
import type { ComponentData } from '@pryzm/plugin-component';

import { buildComponentBufferGeometry, disposeComponentGeometry } from './geometry-bridge';
import { makeComponentMaterialFactory } from './material-bridge';
import type { BakeComponentInstance, ComponentDefinitionSource } from './ports';

export interface ComponentCommitterDeps {
  readonly materialPool: MaterialPool;
  /** ⛔ REQUIRED — see `ports.ts`; there is deliberately no default. */
  readonly bake: BakeComponentInstance;
  /** ⛔ REQUIRED — see `ports.ts`; there is deliberately no default. */
  readonly definitions: ComponentDefinitionSource;
  /**
   * Fired AFTER an async rebuild has attached (or cleared) an element's solids.
   * The wiring uses it to mark the frame dirty; a test uses it to know when the
   * scene graph has settled without polling.
   */
  readonly onGeometryReady?: (id: ElementId, solidCount: number) => void;
}

/** Every number this committer will answer "did it work?" with. Counters, not
 *  booleans: a family that rebuilt 20 times and refused 20 times is a different
 *  state from one that rebuilt 20 times and refused none, and `ok` cannot say so. */
export interface ComponentCommitterStats {
  /** Bakes ISSUED (one per geometry-relevant add/update). */
  rebuilds: number;
  /** Bakes that resolved under a superseded generation and were discarded. */
  staleBakesDiscarded: number;
  /** Updates that moved only `origin` / `rotation` — transform written, NO bake. */
  transformOnlyUpdates: number;
  /** Adds/updates whose `definitionId` the definition source could not resolve. */
  unresolvedDefinitions: number;
  /** Bakes that returned zero solids (every solid refused, or the bake threw). */
  refusedBakes: number;
  /** Solid meshes currently attached across all elements. */
  attachedSolids: number;
}

interface Entry {
  readonly group: THREE.Group;
  handles: MaterialHandle[];
  /** Identity of the last state a bake was ISSUED for — see `geometryKeyOf`. */
  geometryKey: string;
  /** Monotonic per-element; see §COMPONENT-RENDER-GENERATION-GUARD. */
  generation: number;
}

/**
 * The identity of everything that can change the GEOMETRY of an occurrence.
 *
 * ⛔ `origin` and `rotation` are deliberately NOT in it. They are a transform, and
 *    a transform change must not re-bake — that is the difference between moving
 *    twenty placed components and re-resolving twenty parameter ladders.
 *
 * ⚠ `instanceParameters` keys are SORTED before serialising. Object key order is
 *   insertion order in JS, so `{w:1,h:2}` and `{h:2,w:1}` are the same override
 *   set and must produce the same key — otherwise a no-op patch re-bakes.
 */
function geometryKeyOf(dto: ComponentData): string {
  const params = (dto.instanceParameters ?? {}) as Record<string, unknown>;
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join(',');
  return `${dto.definitionId}|${dto.typeId}|${sorted}`;
}

function applyTransform(obj: THREE.Object3D, dto: ComponentData): void {
  const o = dto.origin;
  obj.position.set(o.x, o.y, o.z);
  obj.rotation.set(0, dto.rotation, 0);
}

export class ComponentCommitter implements PrimitiveCommitter<ComponentData, THREE.Group> {
  /** ⚠ SINGULAR, and it must equal the store key `bindStore` is called with and
   *  the key `affectedStores` names. `plugins/dimensions` binding `dimension`
   *  against a `dimensions` store is the standing example of the one-character
   *  drift that makes a live channel read as an empty one. */
  readonly primitiveType = 'component';

  readonly stats: ComponentCommitterStats = {
    rebuilds: 0,
    staleBakesDiscarded: 0,
    transformOnlyUpdates: 0,
    unresolvedDefinitions: 0,
    refusedBakes: 0,
    attachedSolids: 0,
  };

  private readonly entries = new Map<ElementId, Entry>();
  private readonly materialPool: MaterialPool;
  private readonly bake: BakeComponentInstance;
  private readonly definitions: ComponentDefinitionSource;
  private readonly onGeometryReady?: (id: ElementId, solidCount: number) => void;
  private disposed = false;

  constructor(deps: ComponentCommitterDeps) {
    if (!deps.materialPool) throw new Error('[ComponentCommitter] materialPool is required');
    if (!deps.bake) throw new Error('[ComponentCommitter] bake port is required');
    if (!deps.definitions) throw new Error('[ComponentCommitter] definitions port is required');
    this.materialPool = deps.materialPool;
    this.bake = deps.bake;
    this.definitions = deps.definitions;
    this.onGeometryReady = deps.onGeometryReady;
  }

  onAdd(id: ElementId, dto: ComponentData): THREE.Group {
    const group = new THREE.Group();
    group.name = `component:${id}`;
    group.userData['elementId'] = id;
    group.userData['primitiveType'] = 'component';
    group.userData['definitionId'] = dto.definitionId;
    group.userData['typeId'] = dto.typeId;
    applyTransform(group, dto);

    const entry: Entry = { group, handles: [], geometryKey: geometryKeyOf(dto), generation: 0 };
    this.entries.set(id, entry);
    void this.rebuild(id, dto, entry);
    return group;
  }

  onUpdate(id: ElementId, dto: ComponentData, obj: THREE.Group): void {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      // The host guarantees `onAdd` precedes `onUpdate` for an id it holds in the
      // registry; reaching here means the registry and this map disagree. Adopt
      // the object rather than throw — killing the commit batch would take the
      // whole scene's tick down for one element's bookkeeping.
      const adopted: Entry = { group: obj, handles: [], geometryKey: geometryKeyOf(dto), generation: 0 };
      this.entries.set(id, adopted);
      applyTransform(obj, dto);
      void this.rebuild(id, dto, adopted);
      return;
    }

    applyTransform(obj, dto);
    obj.userData['definitionId'] = dto.definitionId;
    obj.userData['typeId'] = dto.typeId;

    const nextKey = geometryKeyOf(dto);
    if (nextKey === entry.geometryKey) {
      this.stats.transformOnlyUpdates += 1;
      return;
    }
    entry.geometryKey = nextKey;
    void this.rebuild(id, dto, entry);
  }

  onRemove(id: ElementId, obj: THREE.Group): void {
    const entry =
      this.entries.get(id) ?? { group: obj, handles: [], geometryKey: '', generation: 0 };
    // Bump the generation so any bake still in flight for this element discards
    // itself instead of attaching children to a removed group.
    entry.generation += 1;
    this.clearSolids(entry);
    obj.removeFromParent();
    this.entries.delete(id);
  }

  onDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.generation += 1;
      this.clearSolids(entry);
    }
    this.entries.clear();
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async rebuild(id: ElementId, dto: ComponentData, entry: Entry): Promise<void> {
    const generation = ++entry.generation;
    this.stats.rebuilds += 1;

    if (dto.definitionId === '' || !this.definitions.has(dto.definitionId)) {
      this.stats.unresolvedDefinitions += 1;
      this.clearSolids(entry);
      entry.group.userData['pryzmUnresolvedDefinition'] = dto.definitionId;
      console.warn(
        `[ComponentCommitter] ${id} names definitionId "${dto.definitionId}" which this wiring ` +
          `cannot resolve — rendering NOTHING for it. A placeholder here would be ` +
          `spec §75's demo-only geometry.`,
      );
      this.onGeometryReady?.(id, 0);
      return;
    }
    delete entry.group.userData['pryzmUnresolvedDefinition'];

    let result;
    try {
      result = await this.bake({
        definitionId: dto.definitionId,
        typeId: dto.typeId,
        instanceOverrides: dto.instanceParameters ?? {},
      });
    } catch (err) {
      if (generation !== entry.generation || this.disposed) {
        this.stats.staleBakesDiscarded += 1;
        return;
      }
      this.stats.refusedBakes += 1;
      this.clearSolids(entry);
      entry.group.userData['pryzmBakeError'] = err instanceof Error ? err.message : String(err);
      console.warn(`[ComponentCommitter] bake threw for ${id}:`, err);
      this.onGeometryReady?.(id, 0);
      return;
    }

    // §COMPONENT-RENDER-GENERATION-GUARD — a bake issued under an older state
    // must never overwrite a newer one (spec §66's closing clause).
    if (generation !== entry.generation || this.disposed) {
      this.stats.staleBakesDiscarded += 1;
      return;
    }

    this.clearSolids(entry);

    if (result.baked.length === 0) {
      this.stats.refusedBakes += 1;
      const first = result.unsupported[0];
      entry.group.userData['pryzmBakeRefusal'] = first
        ? `${first.reason}: ${first.message}`
        : 'bake produced no solids and named no refusal';
      console.warn(
        `[ComponentCommitter] ${id} baked ZERO solids ` +
          `(${result.unsupported.length} refused). First: ${first?.message ?? '(none named)'}`,
      );
      this.onGeometryReady?.(id, 0);
      return;
    }
    delete entry.group.userData['pryzmBakeRefusal'];
    delete entry.group.userData['pryzmBakeError'];

    for (const solid of result.baked) {
      const geometry = buildComponentBufferGeometry(solid.descriptor);
      const handles = solid.descriptor.materialKeys.map((key) =>
        this.materialPool.acquire(String(key), makeComponentMaterialFactory(String(key))),
      );
      const materials = handles.map((h) => h.material);
      const mesh = new THREE.Mesh(
        geometry,
        materials.length === 1 ? materials[0] : materials,
      );
      mesh.name = `component:${id}:${solid.solidId}`;
      mesh.userData['elementId'] = id;
      mesh.userData['primitiveType'] = 'component';
      mesh.userData['solidId'] = solid.solidId;
      mesh.userData['descriptorHash'] = solid.descriptor.hash;
      entry.group.add(mesh);
      entry.handles.push(...handles);
      this.stats.attachedSolids += 1;
    }

    this.onGeometryReady?.(id, result.baked.length);
  }

  /** Detach + dispose every solid mesh of one element and release its material
   *  refs. Idempotent; leaves the group itself in the scene graph. */
  private clearSolids(entry: Entry): void {
    for (const child of [...entry.group.children]) {
      entry.group.remove(child);
      const mesh = child as THREE.Mesh;
      disposeComponentGeometry(mesh.geometry as THREE.BufferGeometry | undefined);
      this.stats.attachedSolids -= 1;
    }
    for (const h of entry.handles) {
      try {
        h.release();
      } catch {
        /* a pool disposed under us is not this element's problem */
      }
    }
    entry.handles = [];
  }
}
