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

  pick(screenPoint: Point2D, ctx: PickContext): PickResult | null {
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

    for (const id of ctx.elementRegistry.ids()) {
      const obj = ctx.elementRegistry.objectFor(id);
      const mesh = firstMesh(obj);
      if (mesh === null || obj === null) continue;

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

    for (const id of ctx.elementRegistry.ids()) {
      const obj = ctx.elementRegistry.objectFor(id);
      const mesh = firstMesh(obj);
      if (mesh === null) continue;
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
