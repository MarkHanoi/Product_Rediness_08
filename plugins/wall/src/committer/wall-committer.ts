// WallCommitter — `PrimitiveCommitter<WallData, THREE.Group>` (S09-T2).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T2 (line 692):
//   "implements PrimitiveCommitter<WallStore>... For each `added` wall:
//    calls producer, builds THREE.BufferGeometry from descriptor,
//    builds THREE.Mesh, requests material from MaterialPool. For each
//    `updated` wall: re-runs producer, swaps geometry. For each
//    `removed`: disposes mesh, releases material ref. Mirrors the
//    wallRoots-Map pattern (`WallFragmentBuilder.ts:43`)."
//
// Per-element bookkeeping is kept on the WallSceneEntry struct held by
// the committer (one per wall id).  The entry tracks:
//
//   • `mesh`               — the visible THREE.Mesh (NOT the proxy).
//   • `proxyMesh`          — colorWrite=false depthWrite=false mesh,
//                            present iff the wall was last seen with
//                            `visible === false` (mirrors
//                            `WallFragmentBuilder.ts:586-598`).
//   • `materialHandles`    — one MaterialHandle per descriptor group;
//                            released on geometry rebuild and on remove.
//   • `descriptorHash`     — `composeWallGeometryHash(...)` output.
//                            Compared against the next descriptor's
//                            hash to skip rebuild when unchanged
//                            (S09 blocker analysis row 3).
//   • `prevDto`            — last DTO snapshot.  Used to compute the
//                            geometry-vs-material-vs-visibility split
//                            on update (the host hands us new+old
//                            full-DTO pairs, NOT immer patches —
//                            that's why we cache the prev).
//
// Geometry-affecting fields (rebuilds the descriptor + Mesh geometry):
//   `baseLine`, `curve`, `height`, `thickness`, `baseOffset`, `layers`,
//   `openings`, `systemTypeId`.
//
// Material-only fields (rebinds Material handles via MaterialPool, no
// geometry rebuild):
//   `materialColor`, `materialId`.
//
// Visibility (toggles the proxy mesh):
//   `visible: boolean` on the DTO (optional — schema doesn't currently
//   declare it; we treat absent as `true` so existing fixtures behave
//   unchanged).
//
// THREE-only file — lives under `plugins/wall/src/committer/` so the
// `pryzm/no-three-outside-committer` rule allowlists it.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceWall,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  PrimitiveCommitter,
  MaterialPool,
} from '@pryzm/plugin-sdk';
import type { WallData } from '../store.js';
import { buildBufferGeometry, disposeGeometry } from './geometry-bridge.js';
import { makeWallMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'baseLine',
  'curve',
  'height',
  'thickness',
  'baseOffset',
  'layers',
  'openings',
  'systemTypeId',
] as const;

const MATERIAL_FIELDS = ['materialColor', 'materialId'] as const;

interface WallSceneEntry {
  /** The visible (or invisible-but-present) THREE.Mesh. */
  mesh: THREE.Mesh;
  /** Present iff `visible === false`.  Same geometry, but
   *  `colorWrite=false depthWrite=false` so it stays pickable but does
   *  not paint pixels.  Mirrors WallFragmentBuilder.ts:586-598. */
  proxyMesh: THREE.Mesh | null;
  /** One MaterialHandle per descriptor group.  Index aligns with
   *  `descriptor.materialKeys[i]` (= `descriptor.groups[*].materialIndex`
   *  resolved through `materialKeys`).  Disposed on geometry rebuild
   *  and on `onRemove`. */
  materialHandles: MaterialHandle[];
  /** The wall's geometry hash from the producer.  Identical hash =
   *  identical geometry — we skip the rebuild AND the buffer upload
   *  in that case. */
  descriptorHash: string;
  /** Previous DTO — used for the geometry-vs-material-vs-visibility
   *  diff on `onUpdate` (the host gives us full-DTO snapshots, not
   *  patches, so we compare ourselves). */
  prevDto: WallData;
}

/** Optional shape some 1C UI tools will set on wall DTOs.  Today the
 *  Wall schema does NOT declare `visible`; treat absent as `true` so
 *  legacy fixtures + the S09 small-project fixture render normally. */
function dtoVisible(dto: WallData): boolean {
  return (dto as WallData & { visible?: boolean }).visible !== false;
}

/** Did any geometry-affecting field change between `prev` and `next`? */
function geometryDirty(prev: WallData, next: WallData): boolean {
  for (const k of GEOMETRY_FIELDS) {
    // Reference equality first (cheap when nothing changed); fall back
    // to JSON for deep arrays/objects.  Acceptable cost — this runs
    // once per wall update, not per frame.
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (a === b) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  }
  return false;
}

function materialDirty(prev: WallData, next: WallData): boolean {
  for (const k of MATERIAL_FIELDS) {
    if ((prev as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]) {
      return true;
    }
  }
  return false;
}

function visibilityDirty(prev: WallData, next: WallData): boolean {
  return dtoVisible(prev) !== dtoVisible(next);
}

export interface WallCommitterStats {
  readonly walls: number;
  readonly meshesCreated: number;
  readonly meshesDisposed: number;
  readonly geometryRebuilds: number;
  readonly geometrySkippedByHash: number;
  readonly materialRebinds: number;
  readonly visibilityToggles: number;
}

export class WallCommitter implements PrimitiveCommitter<WallData, THREE.Group> {
  readonly primitiveType = 'wall';
  private readonly entries = new Map<ElementId, WallSceneEntry>();

  // Telemetry counters — read by tests + the OTel `pryzm.committer.commit`
  // span emission helper.  Reset by the host on dispose.
  private meshesCreated = 0;
  private meshesDisposed = 0;
  private geometryRebuilds = 0;
  private geometrySkippedByHash = 0;
  private materialRebinds = 0;
  private visibilityToggles = 0;

  constructor(private readonly pool: MaterialPool) {}

  // ── PrimitiveCommitter impl ────────────────────────────────────────

  onAdd(id: ElementId, dto: WallData): THREE.Group {
    const root = new THREE.Group();
    root.name = `wall:${id}`;

    const descriptor = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
    const geometry = buildBufferGeometry(descriptor);
    const handles = this.acquireHandles(descriptor);
    const materials = handles.map((h) => h.material);

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.name = `wall:${id}:mesh`;
    root.add(mesh);
    // Stamp the descriptor hash on the Group so the reload-persistence
    // suite can fingerprint a session's scene state without poking
    // committer internals.  See `__tests__/reload-persistence.test.ts`.
    root.userData.descriptorHash = descriptor.hash;
    this.meshesCreated += 1;

    let proxyMesh: THREE.Mesh | null = null;
    if (!dtoVisible(dto)) {
      proxyMesh = makeProxyMesh(geometry);
      mesh.visible = false;
      root.add(proxyMesh);
      this.visibilityToggles += 1;
    }

    this.entries.set(id, {
      mesh,
      proxyMesh,
      materialHandles: handles,
      descriptorHash: descriptor.hash,
      prevDto: dto,
    });
    return root;
  }

  onUpdate(id: ElementId, dto: WallData, root: THREE.Group): void {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      // Defensive: shouldn't happen — host only calls onUpdate for
      // elements present in the registry.  We emit no error so a stale
      // diff doesn't crash the frame.
      return;
    }
    const prev = entry.prevDto;
    const geomChanged = geometryDirty(prev, dto);
    const matChanged = materialDirty(prev, dto);
    const visChanged = visibilityDirty(prev, dto);

    if (geomChanged) {
      const next = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
      if (next.hash === entry.descriptorHash) {
        // Same hash → identical geometry & materials.  No-op (the
        // producer is pure; this is the cache-hit path that turns
        // pure-rename / no-op patches into zero GPU work).
        this.geometrySkippedByHash += 1;
      } else {
        this.replaceGeometry(root, entry, next);
        this.geometryRebuilds += 1;
      }
    } else {
      // Geometry-affecting fields are byte-identical → we skip the
      // producer call entirely.  This is the cheapest skip path: no
      // hash compute, no rebuild, no GPU work.  Counted alongside
      // `geometrySkippedByHash` so the bench harness sees one combined
      // "rebuilds avoided" number per frame.
      this.geometrySkippedByHash += 1;
    }
    if (!geomChanged && matChanged) {
      // Material-only: re-acquire handles for the SAME descriptor; the
      // pool dedupes if the colour resolves to the same key.
      this.rebindMaterials(entry, dto);
      this.materialRebinds += 1;
    }

    if (visChanged) {
      this.toggleProxy(root, entry, dto);
      this.visibilityToggles += 1;
    }
    entry.prevDto = dto;
  }

  onRemove(id: ElementId, root: THREE.Group): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.disposeEntry(root, entry);
    this.entries.delete(id);
    this.meshesDisposed += 1;
  }

  onDispose(): void {
    for (const [, entry] of this.entries) {
      disposeGeometry(entry.mesh.geometry);
      if (entry.proxyMesh) disposeGeometry(entry.proxyMesh.geometry);
      for (const h of entry.materialHandles) h.release();
    }
    this.entries.clear();
  }

  // ── Test + telemetry hooks ─────────────────────────────────────────

  /** Number of walls currently committed.  Test hook. */
  walls(): number {
    return this.entries.size;
  }

  /** Snapshot of internal counters.  Used by `pryzm.committer.commit`
   *  span emission and by tests that assert geometry-vs-material-vs-
   *  visibility branching. */
  stats(): WallCommitterStats {
    return {
      walls: this.entries.size,
      meshesCreated: this.meshesCreated,
      meshesDisposed: this.meshesDisposed,
      geometryRebuilds: this.geometryRebuilds,
      geometrySkippedByHash: this.geometrySkippedByHash,
      materialRebinds: this.materialRebinds,
      visibilityToggles: this.visibilityToggles,
    };
  }

  /** @internal — selection-highlight committer reads the current entry
   *  to source its outline geometry.  Exposed via the barrel only. */
  getEntry(id: ElementId): Readonly<WallSceneEntry> | undefined {
    return this.entries.get(id);
  }

  // ── Internals ──────────────────────────────────────────────────────

  private acquireHandles(descriptor: BufferGeometryDescriptor): MaterialHandle[] {
    return descriptor.materialKeys.map((key) =>
      this.pool.acquire(key, makeWallMaterialFactory(key)),
    );
  }

  private replaceGeometry(
    root: THREE.Group,
    entry: WallSceneEntry,
    next: BufferGeometryDescriptor,
  ): void {
    // 1) Build the new geometry + materials BEFORE releasing the old
    //    so the pool keeps the shared materials alive when the new key
    //    set overlaps the old (typical case: same systemType, only
    //    baseLine moved → same colour → same hash → ref count goes
    //    +1 then -1 net 0 with no factory call).
    const newGeometry = buildBufferGeometry(next);
    const newHandles = this.acquireHandles(next);
    const newMaterials = newHandles.map((h) => h.material);

    // 2) Swap geometry on the existing mesh — Object3D identity is
    //    preserved (host-side registry binding stays valid; selection
    //    state survives).
    const oldGeometry = entry.mesh.geometry;
    entry.mesh.geometry = newGeometry;
    entry.mesh.material = newMaterials;
    if (entry.proxyMesh) {
      const oldProxyGeo = entry.proxyMesh.geometry;
      entry.proxyMesh.geometry = newGeometry;
      // Proxy uses the same geometry as the visible mesh.  The OLD
      // proxy geometry was a clone-or-share of the OLD geometry — if
      // it's the same object as oldGeometry, dispose() is idempotent.
      if (oldProxyGeo !== oldGeometry) disposeGeometry(oldProxyGeo);
    }
    disposeGeometry(oldGeometry);

    // 3) Release the OLD material handles last — so any shared
    //    Material that's still live in `newHandles` survives the swap.
    for (const h of entry.materialHandles) h.release();

    entry.materialHandles = newHandles;
    entry.descriptorHash = next.hash;
    root.userData.descriptorHash = next.hash;
  }

  private rebindMaterials(entry: WallSceneEntry, dto: WallData): void {
    // Material-only path: re-run the producer at low cost JUST to get
    // the fresh `materialKeys` array (the geometry buffers don't
    // change so we DON'T reupload them).  This keeps the dispatcher
    // hot path off the GPU bus on a SetWallColor.
    const next = produceWall(dto, NO_JOINS, dto.baseLine[0]?.y ?? 0);
    const newHandles = this.acquireHandles(next);
    const newMaterials = newHandles.map((h) => h.material);

    entry.mesh.material = newMaterials;
    if (entry.proxyMesh) {
      // Proxy mesh keeps its colorWrite/depthWrite=false material —
      // not the new visible material.  No-op here.
    }
    for (const h of entry.materialHandles) h.release();
    entry.materialHandles = newHandles;
    // descriptorHash is unchanged by definition (geometryDirty was
    // false to land here); we DO NOT update it.
  }

  private toggleProxy(root: THREE.Group, entry: WallSceneEntry, dto: WallData): void {
    const visible = dtoVisible(dto);
    if (visible) {
      // Removing the proxy: detach + dispose its proxy material; the
      // visible mesh becomes visible again.
      if (entry.proxyMesh) {
        const proxyMat = entry.proxyMesh.material;
        if (proxyMat instanceof THREE.Material) proxyMat.dispose();
        else if (Array.isArray(proxyMat)) for (const m of proxyMat) m.dispose();
        // Geometry is shared with the visible mesh — DO NOT dispose.
        root.remove(entry.proxyMesh);
        entry.proxyMesh = null;
      }
      entry.mesh.visible = true;
    } else {
      // Adding the proxy: visible mesh hides; proxy uses same geometry
      // with colorWrite=false depthWrite=false.  Picking traverses the
      // proxy because it's still present in the scene graph + has
      // bounding info.
      if (!entry.proxyMesh) {
        entry.proxyMesh = makeProxyMesh(entry.mesh.geometry);
        root.add(entry.proxyMesh);
      }
      entry.mesh.visible = false;
    }
  }

  private disposeEntry(root: THREE.Group, entry: WallSceneEntry): void {
    root.remove(entry.mesh);
    if (entry.proxyMesh) {
      root.remove(entry.proxyMesh);
      // Proxy material is owned by the proxy mesh — dispose it.
      const proxyMat = entry.proxyMesh.material;
      if (proxyMat instanceof THREE.Material) proxyMat.dispose();
      else if (Array.isArray(proxyMat)) for (const m of proxyMat) m.dispose();
    }
    disposeGeometry(entry.mesh.geometry);
    for (const h of entry.materialHandles) h.release();
    entry.materialHandles = [];
  }
}

/** Build the proxy mesh per WallFragmentBuilder.ts:586-598 — invisible
 *  to the camera but pickable.  Geometry is REUSED from the visible
 *  mesh (sharing is safe because the proxy never disposes geometry —
 *  the WallCommitter owns that lifecycle). */
function makeProxyMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    transparent: false,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = mesh.name || 'wall:proxy';
  return mesh;
}
