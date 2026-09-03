import { b as bindStore, M as MaterialPool } from './dispatcher-wbP0dOm1.js';
export { C as CommitterHost, S as SceneRegistry, d as diffToDeltas } from './dispatcher-wbP0dOm1.js';
import { dz as AxesHelper, dA as GridHelper, dk as CameraHelper, dB as DirectionalLightHelper, dC as PointLightHelper, dD as SpotLightHelper, V as Vector3, b as Box3, M as Mesh, v as Line, s as Points, E as InstancedMesh, h as Matrix4 } from './three.core-Bv4ks8y-.js';
import { w as withSpanSync, a as withSpan, g as getFrameScheduler } from './LODManager-DHqndFcX.js';
export { L as LODManager } from './LODManager-DHqndFcX.js';
import './trace-api-BIfvUk_c.js';

const DIM_LINE_COLOUR = "#000000";
const DIM_TEXT_COLOUR = "#000000";
const FLAG_COLOUR = "#CC4400";
const DIM_TEXT_HEIGHT_MM = 2.5;
const TEXT_GAP_MM = 1.5;
const TICK_LEN_MM = 2;
const ARROW_LEN_MM = 3;
const ARROW_HALF_MM = 1;
const DOT_RADIUS_MM = 0.6;
const DEFAULT_DIM_WEIGHT_MM = 0.18;
const TICK_WEIGHT_MM = 0.25;
const FLAG_UNDERLINE_HALF_MM = 5;
function commitDimensions(ctx, evaluated, strings, scale, viewTransform) {
  ctx.save();
  ctx.setTransform(viewTransform);
  for (const dim of evaluated) {
    const str = strings.get(dim.id);
    if (!str) continue;
    drawWitnessLines(ctx, dim, str, scale);
    drawDimensionLine(ctx, dim, str, scale);
    drawArrowheads(ctx, dim, str, scale);
    drawDimensionText(ctx, dim, str, scale);
    if (dim.isFlagged) drawOverrideFlag(ctx, dim, scale);
  }
  ctx.restore();
}
function drawDimensionLine(ctx, dim, str, scale) {
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = DEFAULT_DIM_WEIGHT_MM * scale;
  ctx.setLineDash([]);
  if (str.orientation === "horizontal") {
    ctx.moveTo(dim.p1World[0], dim.lineY);
    ctx.lineTo(dim.p2World[0], dim.lineY);
  } else if (str.orientation === "vertical") {
    ctx.moveTo(dim.lineY, dim.p1World[1]);
    ctx.lineTo(dim.lineY, dim.p2World[1]);
  } else {
    ctx.moveTo(dim.p1World[0], dim.p1World[1]);
    ctx.lineTo(dim.p2World[0], dim.p2World[1]);
  }
  ctx.stroke();
}
function drawWitnessLines(ctx, dim, str, scale) {
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = (str.witnessLines?.weight ?? DEFAULT_DIM_WEIGHT_MM) * scale;
  ctx.setLineDash([]);
  ctx.moveTo(dim.p1World[0], dim.p1World[1]);
  ctx.lineTo(dim.witnessP1[0], dim.witnessP1[1]);
  ctx.moveTo(dim.p2World[0], dim.p2World[1]);
  ctx.lineTo(dim.witnessP2[0], dim.witnessP2[1]);
  ctx.stroke();
}
function drawArrowheads(ctx, dim, str, scale) {
  const style = str.arrowheads ?? "tick";
  if (style === "none") return;
  const [a, b, dirX, dirY] = computeDimLineEndpoints(dim, str);
  switch (style) {
    case "tick":
      drawTick(ctx, a[0], a[1], dirX, dirY, scale);
      drawTick(ctx, b[0], b[1], dirX, dirY, scale);
      break;
    case "open-arrow":
      drawOpenArrow(ctx, a[0], a[1], dirX, dirY, scale);
      drawOpenArrow(ctx, b[0], b[1], -dirX, -dirY, scale);
      break;
    case "filled-arrow":
      drawFilledArrow(ctx, a[0], a[1], dirX, dirY, scale);
      drawFilledArrow(ctx, b[0], b[1], -dirX, -dirY, scale);
      break;
    case "dot":
      drawDot(ctx, a[0], a[1], scale);
      drawDot(ctx, b[0], b[1], scale);
      break;
  }
}
function computeDimLineEndpoints(dim, str) {
  if (str.orientation === "horizontal") {
    const a = [dim.p1World[0], dim.lineY];
    const b = [dim.p2World[0], dim.lineY];
    return [a, b, 1, 0];
  }
  if (str.orientation === "vertical") {
    const a = [dim.lineY, dim.p1World[1]];
    const b = [dim.lineY, dim.p2World[1]];
    return [a, b, 0, 1];
  }
  const dx = dim.p2World[0] - dim.p1World[0];
  const dy = dim.p2World[1] - dim.p1World[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dim.p1World, dim.p2World, dx / len, dy / len];
}
function drawTick(ctx, x, y, _dirX, _dirY, scale) {
  const half = TICK_LEN_MM / 2 * scale;
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = TICK_WEIGHT_MM * scale;
  ctx.setLineDash([]);
  ctx.moveTo(x - half, y - half);
  ctx.lineTo(x + half, y + half);
  ctx.stroke();
}
function drawOpenArrow(ctx, x, y, dirX, dirY, scale) {
  const len = ARROW_LEN_MM * scale;
  const half = ARROW_HALF_MM * scale;
  const px = -dirY;
  const py = dirX;
  const tailX = x - dirX * len;
  const tailY = y - dirY * len;
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = TICK_WEIGHT_MM * scale;
  ctx.setLineDash([]);
  ctx.moveTo(tailX + px * half, tailY + py * half);
  ctx.lineTo(x, y);
  ctx.lineTo(tailX - px * half, tailY - py * half);
  ctx.stroke();
}
function drawFilledArrow(ctx, x, y, dirX, dirY, scale) {
  const len = ARROW_LEN_MM * scale;
  const half = ARROW_HALF_MM * scale;
  const px = -dirY;
  const py = dirX;
  const tailX = x - dirX * len;
  const tailY = y - dirY * len;
  ctx.beginPath();
  ctx.fillStyle = DIM_LINE_COLOUR;
  ctx.moveTo(x, y);
  ctx.lineTo(tailX + px * half, tailY + py * half);
  ctx.lineTo(tailX - px * half, tailY - py * half);
  ctx.closePath();
  ctx.fill();
}
function drawDot(ctx, x, y, scale) {
  const r = DOT_RADIUS_MM * scale;
  ctx.beginPath();
  ctx.fillStyle = DIM_LINE_COLOUR;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function drawDimensionText(ctx, dim, str, scale) {
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  const midY = (dim.p1World[1] + dim.p2World[1]) / 2;
  ctx.font = `${DIM_TEXT_HEIGHT_MM * scale}px Inter, Arial, sans-serif`;
  ctx.fillStyle = dim.isFlagged ? FLAG_COLOUR : DIM_TEXT_COLOUR;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  if (str.orientation === "horizontal") {
    ctx.fillText(dim.valueText, midX, dim.lineY - TEXT_GAP_MM * scale);
    return;
  }
  if (str.orientation === "vertical") {
    ctx.save();
    ctx.translate(dim.lineY - TEXT_GAP_MM * scale, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(dim.valueText, 0, 0);
    ctx.restore();
    return;
  }
  ctx.fillText(dim.valueText, midX, midY);
}
function drawOverrideFlag(ctx, dim, scale) {
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  const half = FLAG_UNDERLINE_HALF_MM * scale;
  ctx.beginPath();
  ctx.strokeStyle = FLAG_COLOUR;
  ctx.lineWidth = 0.5 * scale;
  ctx.setLineDash([]);
  ctx.moveTo(midX - half, dim.lineY - 0.5 * scale);
  ctx.lineTo(midX + half, dim.lineY - 0.5 * scale);
  ctx.stroke();
}

const BIM_LAYER = 0;
const EDITOR_LAYER = 1;
const ANNOTATION_LAYER = 2;
const PLAN_SYMBOL_LAYER = 3;
const DOCUMENTATION_LAYER = 5;

class SceneObjectClassifier {
  /**
   * Returns true if `obj` is part of the OBC SimpleGrid subtree.
   * Walks the parent chain from `obj` up to gridRoot.
   * O(depth) — typically 1-3 steps for grid children.
   */
  static isGridObject(obj, gridRoot) {
    if (!gridRoot) return false;
    let current = obj;
    while (current) {
      if (current === gridRoot) return true;
      current = current.parent;
    }
    return false;
  }
  /**
   * Object `type` strings for controls/helpers whose ENTIRE SUBTREE is non-model.
   *
   * Matched on `.type` rather than `instanceof` because three's controls live in
   * `examples/jsm` (not the core namespace this module imports) and because a
   * production bundle MINIFIES the constructor — the founder's probe reported
   * `ctor=ze`. `.type` is set explicitly by three and survives minification.
   */
  static HELPER_SUBTREE_TYPES = /* @__PURE__ */ new Set([
    "TransformControls",
    "TransformControlsGizmo",
    "TransformControlsPlane",
    "Box3Helper",
    "BoxHelper",
    "ArrowHelper",
    "PlaneHelper",
    "SkeletonHelper",
    "HemisphereLightHelper",
    "AxesHelper",
    "GridHelper",
    "CameraHelper",
    "DirectionalLightHelper",
    "PointLightHelper",
    "SpotLightHelper"
  ]);
  /**
   * Returns true if `obj` is — OR DESCENDS FROM — a Three.js helper, a transform
   * control, or anything explicitly tagged `userData.isHelper = true`.
   *
   * ── §FIX-GIZMO-IN-BOUNDS (L-749) — why the ancestry walk ────────────────────
   *
   * This test used to look ONLY at `obj` itself. `obj.type === 'TransformControlsGizmo'`
   * therefore excluded the gizmo NODE and none of its children — and the children are
   * where the geometry is. The founder's diagnostic probe caught it:
   *
   *   23 object(s) over 1 km. Top contributors:
   *     #1 extent=1575838m verts=19 box=[-1575838,-525279,-525279 → 0,525279,525279]
   *        ctor=ze type=Mesh name="X" elementType=∅ id=∅ userDataKeys=[∅]
   *        ancestry: Object3D ← TransformControlsGizmo ← Object3D ← Scene
   *
   * Those are the axis handles ("X", "Y", "Z") — three.js draws them as effectively
   * infinite picker/helper lines, ~1,575 km each. Their own `.type` is plain `'Mesh'`,
   * their `userData` is empty, and they carry no `elementType` and no `id`, so EVERY
   * filter keyed on element identity sails straight past them. They have been in the
   * scene on every project since transform controls were first constructed.
   *
   * This one defect produced a chain of symptoms that each looked independent: scene
   * bounds ~3,152 km across → default camera framing at 6,542 km → a 14 m near plane
   * that sliced walls the user walked up to (L-747) → and, on a project with no walls,
   * `zoomToAll`'s fallback pass flying the camera to megametres (the "white 3D screen").
   *
   * The lesson generalises past this one object, which is why the check is now a
   * SUBTREE test over a TYPE SET rather than another special case: **controls and
   * helpers are part of the bounds population, and nothing about element identity will
   * ever exclude them.** They are not elements; they must be excluded structurally.
   *
   * O(depth) — a handful of steps; the same shape as {@link isGridObject}.
   */
  static isHelperObject(obj) {
    let current = obj;
    for (let hops = 0; current && hops < 64; current = current.parent, hops++) {
      if (current.userData?.isHelper === true) return true;
      if (SceneObjectClassifier.HELPER_SUBTREE_TYPES.has(current.type)) return true;
      if (current instanceof AxesHelper || current instanceof GridHelper || current instanceof CameraHelper || current instanceof DirectionalLightHelper || current instanceof PointLightHelper || current instanceof SpotLightHelper) {
        return true;
      }
    }
    return false;
  }
  /**
   * `userData.role` values PRYZM sets on its OWN scene infrastructure — meshes that
   * exist to support rendering and are not, and can never become, part of the model.
   *
   * Kept as a role set rather than a name/type test because these are PRYZM's objects:
   * the producer declares what they are, positively, at construction. That is the
   * opposite of the L-749 situation, where the offenders (three.js control handles) had
   * EMPTY userData and could only be caught structurally by `.type` ancestry.
   */
  static INFRASTRUCTURE_ROLES = /* @__PURE__ */ new Set([
    "ground-shadow-catcher"
  ]);
  /**
   * Returns true if `obj` is — or descends from — PRYZM scene infrastructure: a mesh the
   * renderer needs but that is not model content.
   *
   * ── §CAM-CATCHER-NOT-MODEL (L-931) — why this exists ────────────────────────
   *
   * FOUNDER, 2026-08-16, production: *"select a parcel and the camera sits TOO FAR — I
   * must click to get a usable view."* Their trace:
   *
   *   _activate3DView          controls.setLookAt(target=0,0,0  dist=8000.0)
   *   §CAM-FRAME-INVARIANT     auto-framed and VERIFIED  dist=6505.4m
   *
   * Both numbers are closed-form consequences of ONE object. `GroundShadowCatcher` is a
   * 4000 x 4000 m invisible `ShadowMaterial` plane centred on the origin (the L0 contact-
   * shadow receiver, ADR-0106). It made the framing bounds exactly 4 000 m across, so:
   *
   *   `_computeCameraDistance()` = maxDim x 2       = 4000 x 2            = 8000.0
   *   `computeFitPose`  radius = |(4000,0,4000)|/2  = 2828.43
   *                     distance = (2828.43 / sin 30 deg) x 1.15          = 6505.4
   *
   * Nothing was racing and nothing overrode anything: all four framing actors agreed,
   * honestly framing a subject the user never selected. The camera was a correct fit of
   * the wrong thing — which is why `§CAM-FRAME-INVARIANT` re-ran its own predicate,
   * found the (4 km) bounds framed, and announced VERIFIED.
   *
   * The catcher's mesh is a plain `THREE.Mesh`; its `userData` carries `role`,
   * `pickable` and `isGroundShadowCatcher`, but no `elementType` and no `isHelper`. So
   * every existing arm of {@link shouldExcludeFromBounds} sailed past it — exactly the
   * L-749 lesson (*"nothing about element identity will ever exclude them"*) recurring on
   * PRYZM's own infrastructure instead of three.js's.
   *
   * ## Why the fix is here and not on the catcher's `userData.isHelper`
   *
   * Tagging the catcher `isHelper` would have been one line, and it would have moved
   * FIFTEEN other subsystems that read that flag — frustum culling, level-scoped
   * culling, view-range filtering, crop regions, panorama capture. `isHelper` means
   * "not real, hide/skip me" far beyond bounds, and the catcher must keep rendering and
   * keep receiving the sun shadow (L-112 / L-205). The defect is in the BOUNDS
   * population, so the fix belongs in the bounds classifier and nowhere else.
   *
   * Ancestry-walked, like {@link isHelperObject}: infrastructure may be grouped.
   * `userData.isSceneInfrastructure === true` is the open door for the next such mesh,
   * so its author does not have to edit this set.
   */
  static isSceneInfrastructure(obj) {
    let current = obj;
    for (let hops = 0; current && hops < 64; current = current.parent, hops++) {
      if (current.userData?.isSceneInfrastructure === true) return true;
      const role = current.userData?.role;
      if (typeof role === "string" && SceneObjectClassifier.INFRASTRUCTURE_ROLES.has(role)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Returns true if this object is a preview/cursor/ghost mesh that
   * tools place temporarily during interactive placement.
   */
  static isPreviewObject(obj) {
    return obj.userData?.isPreview === true;
  }
  /**
   * Returns true if this object represents a BimLevel (level plane).
   * Level planes should be excluded from camera framing bounds.
   */
  static isBimLevelObject(obj) {
    return obj.userData?.elementType === "BimLevel";
  }
  /**
   * Returns true if this object represents a BimGrid (structural grid line).
   * Grid elements should be excluded from camera framing bounds.
   */
  static isBimGridElement(obj) {
    return obj.userData?.elementType === "BimGrid";
  }
  /**
   * Returns true if this object should be excluded from scene bounds computation.
   * Consolidates all exclusion checks into one call.
   */
  static shouldExcludeFromBounds(obj, gridRoot) {
    return SceneObjectClassifier.isGridObject(obj, gridRoot) || SceneObjectClassifier.isHelperObject(obj) || SceneObjectClassifier.isSceneInfrastructure(obj) || // §CAM-CATCHER-NOT-MODEL (L-931)
    SceneObjectClassifier.isPreviewObject(obj) || SceneObjectClassifier.isBimLevelObject(obj) || SceneObjectClassifier.isBimGridElement(obj);
  }
}

const BIM_FIT_ELEMENT_TYPES = /* @__PURE__ */ new Set([
  "wall",
  "slab",
  "furniture",
  "column",
  "beam",
  "roof",
  "curtainwall",
  "curtain-wall",
  "door",
  "window",
  "stair",
  "stairs",
  "railing",
  "plumbing",
  "ceiling",
  "floor"
]);
function describeMeshAncestry(obj, root) {
  return withSpanSync("pryzm.scene.describe_mesh_ancestry", {}, () => {
    const parts = [];
    let cursor = obj;
    let depth = 0;
    while (cursor && cursor !== root && depth < 5) {
      parts.unshift(cursor.name || cursor.type || "(unnamed)");
      cursor = cursor.parent;
      depth++;
    }
    return parts.join(" › ") || "(unnamed)";
  });
}
function computeBimFitBounds(scene, gridRoot = null) {
  return withSpanSync("pryzm.scene.compute_bim_fit_bounds", {}, (span) => {
    const worldPos = new Vector3();
    const tmp = new Box3();
    const collect = (requireBimType) => {
      const box = new Box3();
      let farthest = null;
      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        if (!obj.visible) return;
        if (SceneObjectClassifier.shouldExcludeFromBounds(obj, gridRoot)) return;
        if (requireBimType) {
          const t = String(obj.userData?.elementType || obj.userData?.type || "").toLowerCase();
          if (!BIM_FIT_ELEMENT_TYPES.has(t)) return;
        }
        tmp.setFromObject(obj);
        if (tmp.isEmpty()) return;
        box.union(tmp);
        obj.getWorldPosition(worldPos);
        const d = Math.hypot(worldPos.x, worldPos.z);
        if (!farthest || d > farthest.distanceM) {
          farthest = { distanceM: d, ancestry: describeMeshAncestry(obj, scene) };
        }
      });
      return { box, farthest };
    };
    const bimPass = collect(true);
    const usedBimTypePass = !bimPass.box.isEmpty();
    const chosen = usedBimTypePass ? bimPass : collect(false);
    span.setAttribute("pryzm.scene.fit_bim_type_pass", usedBimTypePass);
    span.setAttribute("pryzm.scene.fit_bounds_empty", chosen.box.isEmpty());
    return {
      bounds: chosen.box,
      usedBimTypePass,
      farthestIncluded: chosen.farthest
    };
  });
}

class SceneBoundsCache {
  _cachedBounds = new Box3();
  _dirty = true;
  _scene = null;
  _gridRoot = null;
  /** Events that signal geometry has changed and the cache must be rebuilt. */
  static INVALIDATING_EVENTS = [
    "model-updated",
    "ai-model-update",
    "bim-project-cleared",
    "bim-level-added",
    "bim-level-removed",
    "clear-project",
    "project-loaded"
  ];
  constructor(scene, gridRoot = null) {
    this._scene = scene;
    this._gridRoot = gridRoot;
    const handler = () => {
      this._dirty = true;
    };
    for (const eventName of SceneBoundsCache.INVALIDATING_EVENTS) {
      window.addEventListener(eventName, handler);
    }
    window.__sceneBoundsCache = this;
  }
  /**
   * Update the scene reference (e.g., after a project reload).
   */
  setScene(scene) {
    this._scene = scene;
    this._dirty = true;
  }
  /**
   * Update the grid root reference so grid children are excluded from bounds.
   */
  setGridRoot(gridRoot) {
    this._gridRoot = gridRoot;
  }
  /**
   * Mark the cache as stale. The next call to getBounds() will recompute.
   * Call this whenever geometry-affecting operations complete.
   */
  invalidate() {
    this._dirty = true;
  }
  /**
   * Returns the cached bounding box, recomputing from a single scene traversal
   * only when the cache is dirty. Excludes helpers, previews, level planes,
   * BimGrid elements, and the OBC grid subtree.
   *
   * Always returns a valid THREE.Box3. When the scene is empty the box will
   * be empty (isEmpty() === true) — callers should check before using size/center.
   */
  getBounds() {
    if (!this._dirty) {
      return this._cachedBounds;
    }
    this._rebuild();
    return this._cachedBounds;
  }
  /**
   * Returns true if the scene contains BIM geometry (i.e., the bounds are
   * not empty). Convenience method used by PlanViewService.hasFragments().
   */
  hasGeometry() {
    return !this.getBounds().isEmpty();
  }
  /**
   * Rebuilds the cache from a single scene traversal.
   * This is the ONLY place in the codebase that should traverse the full scene
   * for bounds computation purposes.
   */
  _rebuild() {
    const box = new Box3();
    const scene = this._scene;
    if (!scene) {
      this._cachedBounds = box;
      this._dirty = false;
      return;
    }
    scene.traverse((obj) => {
      if (!obj.visible) return;
      if (SceneObjectClassifier.shouldExcludeFromBounds(obj, this._gridRoot)) return;
      if (obj instanceof Mesh && obj.geometry) {
        const objBox = new Box3().setFromObject(obj);
        if (!objBox.isEmpty()) {
          box.union(objBox);
        }
      }
    });
    this._cachedBounds = box;
    this._dirty = false;
  }
}

class PreviewRegistry {
  _previews = /* @__PURE__ */ new Set();
  /**
   * Register a preview object. Call immediately after adding to scene.
   * The object must have `userData.isPreview = true` set by the caller.
   */
  register(obj) {
    this._previews.add(obj);
  }
  /**
   * Unregister an object (e.g. if the preview was promoted to a real element).
   */
  unregister(obj) {
    this._previews.delete(obj);
  }
  /**
   * Remove and dispose all registered preview objects from the scene.
   * Called during view switch deactivation instead of scene.traverse().
   * O(k) where k = number of registered preview objects (typically 0–5).
   */
  disposeAll() {
    for (const obj of this._previews) {
      if (obj.parent) {
        obj.parent.remove(obj);
      }
      this._disposeObject(obj);
    }
    this._previews.clear();
  }
  /**
   * Return the count of currently tracked preview objects.
   * Useful for diagnostics.
   */
  get size() {
    return this._previews.size;
  }
  /**
   * Recursively dispose geometry and materials on a removed object.
   */
  _disposeObject(obj) {
    obj.traverse((child) => {
      if (child instanceof Mesh || child instanceof Line || child instanceof Points) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat) mat.dispose();
        }
      }
    });
  }
}
const previewRegistry = new PreviewRegistry();

class StairPlanSymbolRegistry {
  _objects = /* @__PURE__ */ new Set();
  /**
   * Register a stair plan-representation object.
   * Call from the stair builder immediately after adding the object to the scene.
   * The object must have `userData.type` set to one of the tracked types.
   */
  register(obj) {
    this._objects.add(obj);
  }
  /**
   * Unregister an object when the stair is removed from the scene.
   */
  unregister(obj) {
    this._objects.delete(obj);
  }
  /**
   * Show all stair plan-representation objects (plan views).
   * Replaces the scene.traverse() call in the view-activated listener.
   */
  showPlanSymbols() {
    for (const obj of this._objects) {
      obj.visible = true;
    }
  }
  /**
   * Hide all stair plan-representation objects (3D/elevation views).
   * Replaces the scene.traverse() call in the view-activated listener.
   */
  hidePlanSymbols() {
    for (const obj of this._objects) {
      obj.visible = false;
    }
  }
  /**
   * Iterate all registered plan-representation objects.
   * Used by StairSymbolTechnicalDrawingBridge (DOC-2.5c) to inject stair
   * geometry into a TechnicalDrawing without scene.traverse().
   */
  forEach(callback) {
    this._objects.forEach(callback);
  }
  get size() {
    return this._objects.size;
  }
}
const stairPlanSymbolRegistry = new StairPlanSymbolRegistry();

function _attributionFor(sources) {
  const levelId = sources[0].levelId;
  const types = new Set(sources.map((s) => s.elementType));
  const only = types.size === 1 ? sources[0].elementType : void 0;
  return { levelId, elementType: only };
}
function _stampAttribution(mesh, sources) {
  const { levelId, elementType } = _attributionFor(sources);
  mesh.userData.levelId = levelId;
  if (elementType !== void 0) mesh.userData.elementType = elementType;
}
class InstancedMeshCoalescer {
  constructor(_getScene) {
    this._getScene = _getScene;
  }
  _getScene;
  /** Snapshot of InstancedMesh UUIDs present in the scene at batch-start. */
  _preBatchUUIDs = /* @__PURE__ */ new Set();
  /** Active coalesced groups keyed by "${levelId}:${geoUUID}:${matUUID}". */
  _groups = /* @__PURE__ */ new Map();
  /** Disposer for any in-flight 'post-render' scheduleOnce. */
  _coalescePending = null;
  // ── Batch lifecycle hooks ────────────────────────────────────────────────
  /**
   * Must be called from the `onStart` leg of
   * `batchCoordinator.setBatchLifecycleCallbacks()`.
   *
   * Snapshots UUIDs of all InstancedMesh objects currently in the scene so
   * `onBatchEnd`'s coalesce pass can identify which IMs are newly built.
   *
   * P8: `pryzm.scene.coalesce.start` OTel span.
   */
  onBatchStart() {
    withSpanSync(
      "pryzm.scene.coalesce.start",
      {},
      () => {
        const scene = this._getScene();
        this._preBatchUUIDs = /* @__PURE__ */ new Set();
        if (scene === null) return;
        scene.traverse((obj) => {
          if (obj instanceof InstancedMesh && !obj.userData.isCoalesced) {
            this._preBatchUUIDs.add(obj.uuid);
          }
        });
      }
    );
  }
  /**
   * Must be called from the `onEnd` leg of
   * `batchCoordinator.setBatchLifecycleCallbacks()`.
   *
   * Schedules `_coalesce()` at `'post-render'` priority (C04 §2.3) so the
   * work runs AFTER geometry has been committed to the scene graph and the
   * render pass has completed — matrices are stable before the next frame.
   *
   * P8: `pryzm.scene.coalesce.schedule` OTel span.
   */
  onBatchEnd() {
    withSpanSync(
      "pryzm.scene.coalesce.schedule",
      { "pryzm.scene.pre_batch_uuid_count": this._preBatchUUIDs.size },
      () => {
        if (this._coalescePending !== null) {
          this._coalescePending();
          this._coalescePending = null;
        }
        this._coalescePending = getFrameScheduler().scheduleOnce(
          "instanced-mesh-coalesce",
          () => {
            this._coalescePending = null;
            void this._coalesce();
          },
          "post-render"
        );
      }
    );
  }
  // ── Pick resolution ──────────────────────────────────────────────────────
  /**
   * Given a merged InstancedMesh managed by this coalescer and an instance
   * index, returns the ElementId of the wall that owns that instance.
   *
   * Called by `GpuPickStrategy` raycaster integration when a pick ray hits a
   * coalesced IM directly (THREE.Raycaster.intersectObjects path).
   *
   * Returns `undefined` when `mesh` is not managed by this coalescer.
   *
   * P8: `pryzm.scene.coalesce.resolve_instance` OTel span.
   */
  resolveInstanceToElementId(mesh, instanceIndex) {
    return withSpanSync(
      "pryzm.scene.coalesce.resolve_instance",
      {
        "pryzm.scene.instance_index": instanceIndex,
        "pryzm.scene.mesh_uuid": mesh.uuid
      },
      () => {
        for (const group of this._groups.values()) {
          if (group.instancedMesh === mesh) {
            return group.instanceIndexToElementId.get(instanceIndex);
          }
        }
        return void 0;
      }
    );
  }
  /**
   * Returns `true` if `obj` is a merged InstancedMesh owned by this
   * coalescer.  Used as a guard in pick/highlight code to skip re-processing
   * merged IMs that are not individually registered elements.
   */
  isMergedMesh(obj) {
    for (const group of this._groups.values()) {
      if (group.instancedMesh === obj) return true;
    }
    return false;
  }
  // ── Undo support ─────────────────────────────────────────────────────────
  /**
   * Remove an element from its coalesced group.  Called by the command
   * layer when an element is deleted or undone.
   *
   * Behaviour:
   *   • Restores the element's source InstancedMeshes to visible.
   *   • If the group still has ≥2 remaining elements: rebuilds the merged
   *     InstancedMesh without the removed element's instances.
   *   • If < 2 elements remain: restores all source visibility and removes
   *     the merged InstancedMesh from the scene.
   *
   * P8: `pryzm.scene.coalesce.decoalesce` OTel span.
   */
  decoalesce(elementId) {
    withSpanSync(
      "pryzm.scene.coalesce.decoalesce",
      { "pryzm.scene.element_id": elementId },
      () => this._decoalesceInternal(elementId)
    );
  }
  // ── Disposal ─────────────────────────────────────────────────────────────
  /**
   * Tear down all coalesced groups, restore source visibility, and remove
   * merged InstancedMeshes from the scene.  Idempotent.
   *
   * P8: `pryzm.scene.coalesce.dispose` OTel span.
   */
  dispose() {
    withSpanSync(
      "pryzm.scene.coalesce.dispose",
      { "pryzm.scene.group_count": this._groups.size },
      () => {
        if (this._coalescePending !== null) {
          this._coalescePending();
          this._coalescePending = null;
        }
        for (const group of this._groups.values()) {
          this._destroyGroup(
            group,
            /* restoreSources */
            true
          );
        }
        this._groups.clear();
        this._preBatchUUIDs.clear();
      }
    );
  }
  // ── Private ──────────────────────────────────────────────────────────────
  async _coalesce() {
    return withSpan(
      "pryzm.scene.coalesce",
      { "pryzm.scene.pre_batch_uuid_count": this._preBatchUUIDs.size },
      () => this._coalesceInternal()
    );
  }
  _coalesceInternal() {
    const scene = this._getScene();
    if (scene === null) return;
    const newIMs = [];
    scene.traverse((obj) => {
      if (!(obj instanceof InstancedMesh)) return;
      const ud = obj.userData;
      if (ud.isCoalesced) return;
      if (ud.__coalescedInto) return;
      if (this._preBatchUUIDs.has(obj.uuid)) return;
      newIMs.push(obj);
    });
    if (newIMs.length === 0) {
      this._preBatchUUIDs.clear();
      return;
    }
    const pending = /* @__PURE__ */ new Map();
    for (const im of newIMs) {
      const parentUD = im.parent?.userData ?? {};
      const levelId = parentUD.levelId;
      const elementId = parentUD.id ?? parentUD.elementId;
      if (!levelId || !elementId) continue;
      const geoUUID = im.geometry.uuid;
      const mat = Array.isArray(im.material) ? im.material[0] : im.material;
      if (!mat) continue;
      const matUUID = mat.uuid;
      const key = `${levelId}:${geoUUID}:${matUUID}`;
      if (!pending.has(key)) pending.set(key, []);
      pending.get(key).push({
        elementId,
        obj: im,
        count: im.count,
        // §UNDO93-COALESCED-IM-KEEPS-ITS-LEVEL (L-11320) — carried, not re-derived.
        levelId,
        elementType: parentUD.elementType
      });
    }
    let coalescedGroups = 0;
    let totalInstances = 0;
    for (const [key, sources] of pending) {
      if (sources.length < 2) continue;
      const first = sources[0];
      const geo = first.obj.geometry;
      const mat = Array.isArray(first.obj.material) ? first.obj.material[0] : first.obj.material;
      if (!mat) continue;
      const totalCount = sources.reduce((sum, s) => sum + s.count, 0);
      if (totalCount === 0) continue;
      const merged = new InstancedMesh(geo, mat, totalCount);
      merged.userData.isCoalesced = true;
      merged.userData.coalescedKey = key;
      _stampAttribution(merged, sources);
      merged.castShadow = first.obj.castShadow;
      merged.receiveShadow = first.obj.receiveShadow;
      const instanceIndexToElementId = /* @__PURE__ */ new Map();
      const tempMatrix = new Matrix4();
      let offset = 0;
      for (const src of sources) {
        src.obj.updateWorldMatrix(true, false);
        for (let i = 0; i < src.count; i++) {
          src.obj.getMatrixAt(i, tempMatrix);
          tempMatrix.premultiply(src.obj.matrixWorld);
          merged.setMatrixAt(offset, tempMatrix);
          instanceIndexToElementId.set(offset, src.elementId);
          offset++;
        }
        src.obj.visible = false;
        src.obj.userData.__coalescedInto = merged;
      }
      merged.instanceMatrix.needsUpdate = true;
      scene.add(merged);
      this._groups.set(key, {
        instancedMesh: merged,
        instanceIndexToElementId,
        sources: [...sources]
      });
      coalescedGroups++;
      totalInstances += totalCount;
    }
    console.log(
      `[InstancedMeshCoalescer] §ADR-046 post-batch coalesce: newIMs=${newIMs.length} mergedGroups=${coalescedGroups} totalInstances=${totalInstances}`
    );
    this._preBatchUUIDs.clear();
  }
  _decoalesceInternal(elementId) {
    for (const [key, group] of this._groups) {
      const memberSources = group.sources.filter((s) => s.elementId === elementId);
      if (memberSources.length === 0) continue;
      for (const src of memberSources) {
        src.obj.visible = true;
        delete src.obj.userData.__coalescedInto;
      }
      const remaining = group.sources.filter((s) => s.elementId !== elementId);
      if (remaining.length < 2) {
        this._destroyGroup(
          group,
          /* restoreSources */
          false
        );
        this._groups.delete(key);
        for (const src of remaining) {
          src.obj.visible = true;
          delete src.obj.userData.__coalescedInto;
        }
        return;
      }
      const scene = this._getScene();
      this._destroyGroup(
        group,
        /* restoreSources */
        false
      );
      if (scene === null) {
        this._groups.delete(key);
        return;
      }
      const first = remaining[0];
      const geo = first.obj.geometry;
      const mat = Array.isArray(first.obj.material) ? first.obj.material[0] : first.obj.material;
      if (!mat) {
        this._groups.delete(key);
        return;
      }
      const totalCount = remaining.reduce((s, r) => s + r.count, 0);
      const rebuilt = new InstancedMesh(geo, mat, totalCount);
      rebuilt.userData.isCoalesced = true;
      rebuilt.userData.coalescedKey = key;
      _stampAttribution(rebuilt, remaining);
      const instanceIndexToElementId = /* @__PURE__ */ new Map();
      const tempMatrix = new Matrix4();
      let offset = 0;
      for (const src of remaining) {
        src.obj.updateWorldMatrix(true, false);
        for (let i = 0; i < src.count; i++) {
          src.obj.getMatrixAt(i, tempMatrix);
          tempMatrix.premultiply(src.obj.matrixWorld);
          rebuilt.setMatrixAt(offset, tempMatrix);
          instanceIndexToElementId.set(offset, src.elementId);
          offset++;
        }
        src.obj.visible = false;
        src.obj.userData.__coalescedInto = rebuilt;
      }
      rebuilt.instanceMatrix.needsUpdate = true;
      scene.add(rebuilt);
      group.instancedMesh = rebuilt;
      group.instanceIndexToElementId = instanceIndexToElementId;
      group.sources = remaining;
      return;
    }
  }
  /**
   * Remove the merged IM from the scene (and optionally restore source
   * InstancedMesh visibility).  Does NOT dispose geometry — it's shared.
   */
  _destroyGroup(group, restoreSources) {
    group.instancedMesh.removeFromParent();
    if (restoreSources) {
      for (const src of group.sources) {
        src.obj.visible = true;
        delete src.obj.userData.__coalescedInto;
      }
    }
  }
}

export { ANNOTATION_LAYER, BIM_FIT_ELEMENT_TYPES, BIM_LAYER, DOCUMENTATION_LAYER, EDITOR_LAYER, InstancedMeshCoalescer, MaterialPool, PLAN_SYMBOL_LAYER, PreviewRegistry, SceneBoundsCache, SceneObjectClassifier, StairPlanSymbolRegistry, bindStore, commitDimensions, computeBimFitBounds, describeMeshAncestry, previewRegistry, stairPlanSymbolRegistry };
