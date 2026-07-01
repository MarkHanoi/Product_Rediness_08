// BvhPickStrategy — CPU raycast through `three-mesh-bvh` (S16-T2, ADR-0015 §"Strategy B").
//
// Per-element BVH cached by `descriptor.hash` — a geometry change
// invalidates the cache entry and emits a `pryzm.picking.bvh.cache.invalidated`
// event.  Build cost is captured in an ambient `pryzm.picking.bvh.build`
// span (1/100 prod sampling, always-on dev — sampling is the consumer's
// concern; we just emit).
//
// Why three-mesh-bvh:
//   * MIT-licensed; vendored copy already in PRYZM 1
//     (`vendor/three-mesh-bvh@0.7`) so the dependency surface is vetted.
//   * Native `THREE.Raycaster` integration via `acceleratedRaycast` —
//     the strategy can use the standard Three.js raycast pipeline once
//     `Mesh.prototype.raycast` is patched (one-time install).
//
// Headless-friendly: no GL context required, no canvas — runs identically
// in Node and the browser.  This is the strategy `@pryzm/headless` (S18)
// will use for selection-driven AI agents.

import * as THREE from '@pryzm/renderer-three/three';
import {
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  type MeshBVHOptions,
} from 'three-mesh-bvh';
import { startSpan, withSpanSync } from './otel.js';
import {
  type ElementId,
  type ElementKind,
  type ElementRegistry,
  type PickContext,
  type PickOptions,
  type PickProbeResult,
  type PickResult,
  type PickStrategy,
  type Point2D,
  type Rect2D,
} from './types.js';

// One-time install of three-mesh-bvh's accelerated raycast onto Three's
// prototype.  Idempotent — re-installation is a no-op.  Done at import
// time so any module that imports BvhPickStrategy gets the speedup.
type AccelMesh = typeof THREE.Mesh & {
  prototype: { raycast: typeof acceleratedRaycast };
};
((THREE.Mesh as unknown) as AccelMesh).prototype.raycast = acceleratedRaycast;

// Same for BufferGeometry.computeBoundsTree / disposeBoundsTree —
// optional but lets call sites do `geo.computeBoundsTree()` if desired.
type AccelGeo = typeof THREE.BufferGeometry & {
  prototype: {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
    boundsTree?: MeshBVH;
  };
};
((THREE.BufferGeometry as unknown) as AccelGeo).prototype.computeBoundsTree = computeBoundsTree;
((THREE.BufferGeometry as unknown) as AccelGeo).prototype.disposeBoundsTree = disposeBoundsTree;

export interface BvhPickOptions {
  /** Override BVH build options (passed straight to MeshBVH). */
  readonly bvhOptions?: MeshBVHOptions;
}

interface CacheEntry {
  readonly bvh: MeshBVH;
  readonly hash: string | null;
  readonly geometry: THREE.BufferGeometry;
}

export class BvhPickStrategy implements PickStrategy {
  readonly id = 'bvh-pick' as const;
  /** BVH-pick is the always-available fallback. */
  available = true;

  private readonly bvhOptions: MeshBVHOptions;
  private readonly cache = new Map<ElementId, CacheEntry>();
  private readonly raycaster = new THREE.Raycaster();

  constructor(opts: BvhPickOptions = {}) {
    this.bvhOptions = opts.bvhOptions ?? {};
    // BUG-08: Set raycaster thresholds for Lines and Points so that grid lines,
    // dimension strings, and point-cloud elements are pickable.  THREE.js defaults
    // (1 scene-unit each) are far too large at BIM scale (1 unit = 1 metre) and
    // cause false positives from objects many metres away from the cursor.
    // 0.1 matches SelectionManager's raycaster thresholds (PERF-FIX-#5) so both
    // the primary BVH path and this fallback strategy behave identically for
    // line/point geometry — critical for grid, dimension, and point-cloud picking.
    this.raycaster.params.Line = { threshold: 0.1 };
    this.raycaster.params.Points = { threshold: 0.1 };
  }

  probeAvailability(_ctx: PickContext): PickProbeResult {
    return { ok: true };
  }

  // §SELECT-PERF — `opts` accepted for PickStrategy parity; the BVH raycast already
  // yields the hit point for free, so skipDepth is a no-op here.
  pick(screenPoint: Point2D, ctx: PickContext, _opts?: PickOptions): PickResult | null {
    return withSpanSync(
      'pryzm.picking.pick',
      {
        strategy: this.id,
        'screen.x': screenPoint.x,
        'screen.y': screenPoint.y,
      },
      (span) => {
        const t0 = performance.now();
        const result = this.pickInternal(screenPoint, ctx);
        const dur = performance.now() - t0;
        span.setAttribute('result.found', result !== null);
        if (result !== null) span.setAttribute('result.elementKind', result.elementKind);
        span.setAttribute('duration_ms', Number(dur.toFixed(3)));
        return result;
      },
    );
  }

  pickRect(screenRect: Rect2D, ctx: PickContext): readonly PickResult[] {
    return withSpanSync(
      'pryzm.picking.pickRect',
      {
        strategy: this.id,
        'rect.x': screenRect.x,
        'rect.y': screenRect.y,
        'rect.w': screenRect.w,
        'rect.h': screenRect.h,
      },
      (span) => {
        const t0 = performance.now();
        const results = this.pickRectInternal(screenRect, ctx);
        const dur = performance.now() - t0;
        span.setAttribute('result.count', results.length);
        span.setAttribute('duration_ms', Number(dur.toFixed(3)));
        return results;
      },
    );
  }

  dispose(): void {
    for (const [, entry] of this.cache) {
      entry.geometry.userData.boundsTree = undefined;
    }
    this.cache.clear();
  }

  /** Public test hook — number of cached BVHs. */
  cacheSize(): number {
    return this.cache.size;
  }

  // ---- private --------------------------------------------------------

  private pickInternal(point: Point2D, ctx: PickContext): PickResult | null {
    const ndc = screenToNdc(point, ctx);
    this.raycaster.setFromCamera(ndc, ctx.camera);

    let bestHit: THREE.Intersection | null = null;
    let bestId: ElementId | null = null;
    let bestKind: ElementKind | null = null;
    let bestFaceIndex: number | undefined;

    // §SELECT-INSTANCED-PICK (FIX #6) — the ElementRegistry maps BOTH an instanced
    // group's synthetic id AND every one of its per-instance member ids to the SAME
    // InstancedMesh object (SelectionManager._buildElementRegistry). Raycasting that
    // one mesh once PER id both wastes work and — worse — returns whichever registry
    // id happened to win instead of the instance actually under the cursor. Track the
    // instanced groups already raycast (by Object3D identity) so each is processed
    // exactly once; the real per-instance element id comes from hit.instanceId below.
    const seenInstancedGroups = new Set<THREE.Object3D>();

    for (const id of ctx.elementRegistry.ids()) {
      const obj = ctx.elementRegistry.objectFor(id);
      const mesh = firstMesh(obj);
      if (mesh === null || obj === null) continue;
      // #113 — never pick a hidden element. THREE's raycast ignores `.visible`,
      // so an isolate/hide-d element (root `.visible = false`) would otherwise
      // stay selectable via this path. (GpuPickStrategy already excludes it.)
      if (!isEffectivelyVisible(obj)) continue;

      // §SELECT-INSTANCED-PICK (FIX #6) — instanced-group path. The registered
      // object is an InstancedElementRenderer group (userData.isInstancedGroup)
      // hosting MANY BIM elements, one per occupied instance slot. THREE's
      // InstancedMesh raycast populates `hit.instanceId`; the real element id is
      // `getInstanceElementId(instanceId)`. The OLD code ignored instanceId and
      // returned `id` (often the synthetic group id, or an arbitrary member id) — so
      // on the WebGL/headless FALLBACK every instanced wall/column/beam picked to the
      // wrong element, or to a non-existent synthetic id → no selection at all. This
      // is the CPU-path mirror of the GPU path's per-instance colour resolution.
      const instancedGroup = asInstancedGroup(obj);
      if (instancedGroup !== null) {
        if (seenInstancedGroups.has(obj)) continue;
        seenInstancedGroups.add(obj);
        const hit = this.raycaster.intersectObject(obj, false)[0];
        if (hit === undefined || hit.instanceId === undefined) continue;
        const memberId = instancedGroup.getInstanceElementId(hit.instanceId);
        if (memberId === undefined) continue;
        if (bestHit === null || hit.distance < bestHit.distance) {
          bestHit = hit;
          bestId = memberId;
          bestKind = ctx.elementRegistry.kindOf(memberId)
            ?? (instancedGroup.elementType as ElementKind | null)
            ?? ctx.elementRegistry.kindOf(id);
          bestFaceIndex = hit.faceIndex ?? undefined;
        }
        continue;
      }

      this.ensureBvh(id, mesh.geometry as THREE.BufferGeometry, ctx.elementRegistry);

      // BUG-09: recursive=true covers compound elements — wall Groups with
      // multiple fragment children, IFC entities with sub-meshes, slabs with
      // openings.  The primary mesh (firstMesh) has BVH acceleration;
      // secondary child meshes fall back to THREE.js default raycast —
      // correct (hits all geometry) though not BVH-accelerated for extras.
      const hits = this.raycaster.intersectObject(obj, true);
      if (hits.length === 0) continue;
      const nearest = hits[0]!;
      if (bestHit === null || nearest.distance < bestHit.distance) {
        bestHit = nearest;
        bestId = id;
        bestKind = ctx.elementRegistry.kindOf(id);
        bestFaceIndex = nearest.faceIndex ?? undefined;
      }
    }

    if (bestHit === null || bestId === null || bestKind === null) return null;
    const result: PickResult = {
      elementId: bestId,
      elementKind: bestKind,
      hitPoint: { x: bestHit.point.x, y: bestHit.point.y, z: bestHit.point.z },
      distance: bestHit.distance,
      ...(bestFaceIndex !== undefined ? { faceIndex: bestFaceIndex } : {}),
    };
    return result;
  }

  private pickRectInternal(rect: Rect2D, ctx: PickContext): readonly PickResult[] {
    if (rect.w <= 0 || rect.h <= 0) return [];
    // Project each element's world AABB into screen space; keep the
    // ones whose screen-space rect intersects `rect`.  Simpler and more
    // robust than building a frustum from rect corners (the latter
    // breaks for thin or off-axis rects on a perspective camera).
    const results: PickResult[] = [];
    const tmpBox = new THREE.Box3();

    // §SELECT-INSTANCED-PICK (FIX #6) — one InstancedMesh hosts MANY members, all
    // mapped to the same object in the registry. Enumerate its OCCUPIED instances so
    // a marquee returns each member element whose per-instance box intersects the
    // rect — not one arbitrary member for the whole group (or nothing). Process each
    // group object once (identity-deduped) even though it appears under many ids.
    const seenInstancedGroups = new Set<THREE.Object3D>();
    const instMatrix = new THREE.Matrix4();

    for (const id of ctx.elementRegistry.ids()) {
      const obj = ctx.elementRegistry.objectFor(id);
      const mesh = firstMesh(obj);
      if (mesh === null) continue;
      // #113 — exclude hidden elements from marquee/rect selection too.
      if (obj === null || !isEffectivelyVisible(obj)) continue;

      // §SELECT-INSTANCED-PICK (FIX #6) — instanced-group marquee path.
      const instancedGroup = asInstancedGroup(obj);
      if (instancedGroup !== null) {
        if (seenInstancedGroups.has(obj)) continue;
        seenInstancedGroups.add(obj);
        const im = obj as THREE.InstancedMesh;
        const localBox = im.geometry.boundingBox
          ?? (im.geometry.computeBoundingBox(), im.geometry.boundingBox);
        if (!localBox) continue;
        im.updateWorldMatrix(true, false);
        for (const slot of instancedGroup.getOccupiedInstanceSlots()) {
          const memberId = instancedGroup.getInstanceElementId(slot);
          if (memberId === undefined) continue;
          im.getMatrixAt(slot, instMatrix);
          instMatrix.premultiply(im.matrixWorld);
          tmpBox.copy(localBox).applyMatrix4(instMatrix);
          if (tmpBox.isEmpty()) continue;
          const screenBox = projectBoxToScreen(tmpBox, ctx);
          if (screenBox === null) continue;
          if (!rectsOverlap(rect, screenBox)) continue;
          const kind = ctx.elementRegistry.kindOf(memberId)
            ?? (instancedGroup.elementType as ElementKind | null);
          if (kind === null) continue;
          const center = tmpBox.getCenter(new THREE.Vector3());
          results.push({
            elementId: memberId,
            elementKind: kind,
            hitPoint: { x: center.x, y: center.y, z: center.z },
            distance: ctx.camera.position.distanceTo(center),
          });
        }
        continue;
      }

      this.ensureBvh(id, mesh.geometry as THREE.BufferGeometry, ctx.elementRegistry);
      tmpBox.setFromObject(mesh);
      if (tmpBox.isEmpty()) continue;
      const screenBox = projectBoxToScreen(tmpBox, ctx);
      if (screenBox === null) continue;
      if (!rectsOverlap(rect, screenBox)) continue;
      const kind = ctx.elementRegistry.kindOf(id);
      if (kind === null) continue;
      const center = tmpBox.getCenter(new THREE.Vector3());
      results.push({
        elementId: id,
        elementKind: kind,
        hitPoint: { x: center.x, y: center.y, z: center.z },
        distance: ctx.camera.position.distanceTo(center),
      });
    }
    return results;
  }

  private ensureBvh(
    id: ElementId,
    geometry: THREE.BufferGeometry,
    registry: ElementRegistry,
  ): void {
    const hash = registry.descriptorHashOf?.(id) ?? null;
    const existing = this.cache.get(id);
    if (existing !== undefined && existing.geometry === geometry && existing.hash === hash) {
      return;
    }
    if (existing !== undefined) {
      // Cache invalidation event.
      const span = startSpan('pryzm.picking.pick');
      span.addEvent('pryzm.picking.bvh.cache.invalidated', {
        'element.id': id,
        prev_hash: existing.hash ?? '',
        next_hash: hash ?? '',
      });
      span.end();
    }
    const bvh = withSpanSync(
      'pryzm.picking.bvh.build',
      {
        'element.id': id,
        vertices: geometry.attributes.position?.count ?? 0,
      },
      (span) => {
        const t0 = performance.now();
        const tree = new MeshBVH(geometry, this.bvhOptions);
        const dur = performance.now() - t0;
        span.setAttribute('build.duration_ms', Number(dur.toFixed(3)));
        return tree;
      },
    );
    (geometry as { boundsTree?: MeshBVH }).boundsTree = bvh;
    this.cache.set(id, { bvh, hash, geometry });
  }
}

/**
 * Effective scene visibility — an object is pickable only when it AND every
 * ancestor is `.visible`. THREE's Raycaster checks layers, NOT `.visible`, and
 * recurses into children of invisible parents, so without this guard a hidden
 * element (root `.visible = false`, set by the isolate/hide path, or a hidden
 * level root) would still be raycast and become selectable
 * (#113 — hidden elements must not be selectable). Walking ancestors mirrors
 * THREE's render behaviour (a subtree is skipped if any ancestor is invisible).
 */
function isEffectivelyVisible(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur !== null) {
    if (cur.visible === false) return false;
    cur = cur.parent;
  }
  return true;
}

function firstMesh(obj: THREE.Object3D | null): THREE.Mesh | null {
  if (obj === null) return null;
  if (obj instanceof THREE.Mesh) return obj;
  let found: THREE.Mesh | null = null;
  obj.traverse((child) => {
    if (found !== null) return;
    if (child instanceof THREE.Mesh) found = child;
  });
  return found;
}

/**
 * §SELECT-INSTANCED-PICK (FIX #6) — the userData surface an InstancedElementRenderer
 * group exposes so picking can resolve a hit instance to its real BIM element id.
 * Mirrors the exact contract `InstancedElementRenderer.register()` stamps and that
 * `GpuPickStrategy` / `SelectionManager` already read.
 */
interface InstancedGroupUserData {
  getInstanceElementId: (slot: number) => string | undefined;
  getOccupiedInstanceSlots: () => readonly number[];
  elementType?: string;
}

/**
 * §SELECT-INSTANCED-PICK (FIX #6) — return the instanced-group accessor surface iff
 * `obj` is an InstancedElementRenderer group (an InstancedMesh flagged
 * `userData.isInstancedGroup` that carries the per-instance id accessors); otherwise
 * null. A plain coalesced-curtain-wall InstancedMesh (one element per whole mesh)
 * does NOT carry these accessors and correctly returns null, so it stays on the
 * standard per-element path.
 */
function asInstancedGroup(obj: THREE.Object3D): InstancedGroupUserData | null {
  const ud = obj.userData as Record<string, unknown> | undefined;
  if (!ud || ud.isInstancedGroup !== true) return null;
  if (!(obj as THREE.InstancedMesh).isInstancedMesh) return null;
  if (
    typeof ud.getInstanceElementId !== 'function' ||
    typeof ud.getOccupiedInstanceSlots !== 'function'
  ) {
    return null;
  }
  return ud as unknown as InstancedGroupUserData;
}

function screenToNdc(point: Point2D, ctx: PickContext): THREE.Vector2 {
  const ndcX = (point.x / ctx.viewportWidth) * 2 - 1;
  const ndcY = -((point.y / ctx.viewportHeight) * 2 - 1);
  return new THREE.Vector2(ndcX, ndcY);
}

/** Project a world-space AABB into screen space.  Returns the
 *  axis-aligned screen rect that bounds the 8 projected corners.
 *  Returns `null` if every corner falls behind the camera. */
function projectBoxToScreen(box: THREE.Box3, ctx: PickContext): Rect2D | null {
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const c of corners) {
    c.project(ctx.camera);
    // Clip behind camera (z > 1 in NDC means behind near plane post-projection).
    // We accept the clamp — projecting points behind the camera is well-defined
    // for the AABB→rect overestimate this routine produces.
    const sx = ((c.x + 1) / 2) * ctx.viewportWidth;
    const sy = ((1 - c.y) / 2) * ctx.viewportHeight;
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
      any = true;
    }
  }
  if (!any) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function rectsOverlap(a: Rect2D, b: Rect2D): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
