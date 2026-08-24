import * as THREE from '@pryzm/renderer-three/three';
import { GLTFExporter } from '@pryzm/renderer-three';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * §FIX-IFC-IN-CESIUM (L-696) — triangle budget for the "REAL" full-fidelity GLB
 * placed on the Cesium 3D-Site / 3D-Globe views.
 *
 * Rationale for the number: a native PRYZM building exports ~50–150 k triangles
 * (the founder's 31-wall house was 56 roots / 1.19 MB). A mid-size imported IFC
 * is 300–400 k. Cesium loads the GLB as a single non-tiled `Model` primitive on
 * the SAME page as the WebGPU BIM canvas, so the whole payload is resident GPU
 * memory in a second context — measured practical ceiling before frame-time and
 * upload stalls become user-visible is ~1.5 M triangles / roughly 40–60 MB.
 *
 * ⚠ This is a BUDGET, not a decimator. PRYZM has no mesh-simplification stage
 * today, so the honest degradation for an over-budget model is to decline the
 * REAL representation and keep the MASSING one — the split that already exists
 * (ADR-0093 / SPEC-FORMA-SITE-VIEW). Inventing a third, silently-degraded
 * "REAL but wrong" mode would misrepresent the model on a legal/feasibility
 * surface. A future real LOD stage is tracked as the follow-up in the L-696 ADR.
 */
export const REAL_GLB_TRIANGLE_BUDGET = 1_500_000;

/**
 * Count the triangles that a set of export roots would contribute to the GLB.
 *
 * Indexed geometry counts `index.count / 3`; non-indexed counts
 * `position.count / 3`. Exported as a pure helper so the budget is assertable
 * in unit tests without the DOM-bound GLTFExporter.
 */
export function countExportTriangles(roots: readonly THREE.Object3D[]): number {
  return tracer.startActiveSpan('pryzm.glb.countExportTriangles', (span): number => {
    try {
      let triangles = 0;
      for (const root of roots) {
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const geo = mesh.geometry as THREE.BufferGeometry;
          const index = geo.getIndex?.();
          if (index) {
            triangles += Math.floor(index.count / 3);
            return;
          }
          const pos = geo.getAttribute?.('position');
          if (pos) triangles += Math.floor(pos.count / 3);
        });
      }
      span.setAttribute('pryzm.glb.export_roots', roots.length);
      span.setAttribute('pryzm.glb.triangles', triangles);
      return triangles;
    } finally {
      span.end();
    }
  });
}

/**
 * §A.21.D56 — Clone a source element and BAKE its full scene-world transform.
 *
 * `Object3D.clone(true)` copies only the element's LOCAL transform
 * (position/quaternion/scale relative to its parent) — it does NOT carry the
 * composed ancestor chain. So an element that lived under a translated/rotated
 * parent group used to lose that ancestor X/Z (and rotation) once re-parented
 * under the fresh `exportRoot`, laterally shifting the GLB from the true site
 * origin when Cesium seats it at the ENU frame (scene-world origin === site
 * origin; see CesiumViewport.renderRealModelOnGlobe).
 *
 * This bakes the source's `matrixWorld` (composed ancestor chain) onto the
 * clone's LOCAL transform, so once added straight under an IDENTITY parent the
 * clone's world transform equals the source's original scene-world transform.
 * Exported element positions then match the editor scene EXACTLY, and a
 * downloaded/round-tripped GLB is world-correct too.
 *
 * Exported (rather than inlined) so it is unit-testable without the DOM-bound
 * `GLTFExporter`.
 */
export function cloneWithBakedWorldTransform(
  element: THREE.Object3D,
  frame?: THREE.Object3D | null,
): THREE.Object3D {
  const clone = element.clone(true);

  // Refresh the ancestor chain on the SOURCE, then bake its composed world
  // matrix onto the clone's local transform.
  element.updateWorldMatrix(true, false);

  if (frame) {
    // §GLB-EXPORT-AUTHORING-FRAME (L-1420) — express the element in the AUTHORING
    // frame by dividing out the georeferencing ancestor's world matrix, instead of
    // baking the absolute scene-world matrix. See `resolveExportFrame`.
    frame.updateWorldMatrix(true, false);
    const inverseFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert();
    clone.matrix.multiplyMatrices(inverseFrame, element.matrixWorld);
  } else {
    clone.matrix.copy(element.matrixWorld);
  }

  // ── §GLB-SHEAR-SURVIVES-THE-EXPORT (L-10142) ──────────────────────────────
  //
  // ⭐ **THE ONE LINE THIS FIX IS**, and it is the same one ELEV14 (`4c1af611`) wrote into
  // `NativeElementMeshExporter._seatProxy` for the 2-D feed. `matrixAutoUpdate = false` is
  // what makes the assignment STICK: with it on, the very next `updateMatrixWorld` — and,
  // decisively, `GLTFWriter.processNodeAsync` itself (`GLTFExporter.js:2392`,
  // `if (object.matrixAutoUpdate) object.updateMatrix()`) — recomposes `matrix` from the
  // clone's position/quaternion/scale and silently discards the world matrix baked above.
  //
  // ⛔ **DO NOT "TIDY" THIS BACK INTO A `decompose`.** `Matrix4.decompose` takes scale from
  // column LENGTHS and a quaternion from a basis that a SHEAR has made non-orthogonal, so the
  // recomposed T·R·S is A DIFFERENT SOLID. A rake IS a shear, and hosted leaves carry it on
  // the very node this function seats: `WindowBuilder.ts:1244-1251` and `DoorBuilder.ts:790-797`
  // write `z ↦ z + k·y` straight onto the leaf GROUP's `matrix` — and that group is an export
  // ROOT (`WindowBuilder.ts:979` adds it to the scene; `:806` stamps `elementType: 'Window'`).
  // MEASURED cost of the old form, on the emitted BYTES, in
  // `glb-export-raked-shear.probe.test.ts`:
  //
  //     plain wall (CONTROL)                        0        m
  //     profile-edited wall (CONTROL)               0        m
  //     raked wall BODY (shear on a CHILD)          0        m
  //     WINDOW on a raked, profiled wall            0.172    m   ← the founder's floating pane
  //     DOOR on the same wall                       0.300    m
  //     the same, georeferenced (the 3D-Site path)  0.172    m
  //
  // ⭐ THE CONTROLS ARE THE FINDING. A profile lives in the GEOMETRY and `clone(true)` copies
  // geometry BY REFERENCE, so it was never at risk. A rake on the wall BODY lives on the wall
  // group's CHILDREN — `Object3D.copy` carries `matrix`/`matrixAutoUpdate` whole
  // (`Object3D.js:1601-1607`) — so it was not at risk either. ONLY a shear seated on an export
  // ROOT broke. "Raked walls export wrong" would have been the wrong conclusion and would have
  // fixed the wall half for nothing.
  //
  // glTF is NOT the constraint: `GLTFWriter` defaults `trs: false` (`GLTFExporter.js:649`) and
  // emits `nodeDef.matrix = object.matrix.elements` — a full 16-float affine, shear included.
  // The format could always carry this; only the seating threw it away.
  //
  // `position` / `quaternion` / `scale` are reset to identity and are MEANINGLESS on an export
  // clone — every downstream reader goes through `matrixWorld` (`Box3.setFromObject`,
  // `getWorldPosition`) or through `matrix` (`GLTFWriter`). Leaving the SOURCE's stale LOCAL
  // T·R·S on them would make the object quietly self-contradictory; identity says "not used".
  clone.position.set(0, 0, 0);
  clone.quaternion.identity();
  clone.scale.set(1, 1, 1);
  clone.matrixAutoUpdate = false;
  clone.matrixWorldNeedsUpdate = true;

  return clone;
}

/**
 * §GLB-EXPORT-AUTHORING-FRAME (L-1420) — the `userData` key by which an object
 * DECLARES which coordinate frame its subtree is expressed in.
 *
 * `'authoring'` (or absent) means the site-local metric BIM frame C12 §1.1 mandates.
 * Any other value means the subtree has been re-expressed in a georeferenced frame
 * (today: `'geo-ecef'`, stamped by `CesiumThreeBridge.setAnchor()` on `GIS_BIM_ROOT`).
 */
export const SCENE_FRAME_USERDATA_KEY = 'pryzmSceneFrame';

/**
 * §GLB-EXPORT-AUTHORING-FRAME (L-1420) — the largest translation a legitimate
 * AUTHORING-frame ancestor may carry, in metres.
 *
 * C12 §1.1 mandates the THREE scene frame is LTP-ENU and recentred within **1 km** of
 * the camera, so 100 km is two orders of magnitude of headroom above anything the
 * authoring frame can legitimately produce — and it sits far BELOW the ~6.37e6 m floor
 * of any Earth-centred (ECEF) position. Nothing real lands in the gap, which is what
 * makes the measured arm below a classification rather than a guess.
 */
export const AUTHORING_FRAME_MAX_TRANSLATION_M = 100_000;

/**
 * §GLB-EXPORT-AUTHORING-FRAME (L-1420) — true when `object` is a GEOREFERENCING FRAME
 * boundary: a node whose transform re-expresses its subtree out of the site-local
 * authoring frame and into an Earth-referenced one.
 *
 * ⭐ DERIVED FROM WHAT THE OBJECT IS — never from a list of names. Two arms:
 *
 *  • **ARM A — DECLARED.** The object carries `userData[SCENE_FRAME_USERDATA_KEY]` with
 *    a value other than `'authoring'`. This is the architectural arm: a frame boundary
 *    SAYS it is one, the same way a BIM element says it is one via `userData.elementType`.
 *  • **ARM B — MEASURED.** The object's world translation is at or beyond
 *    `AUTHORING_FRAME_MAX_TRANSLATION_M`. A node megametres from the origin IS a
 *    georeferencing frame by construction, whatever it is called and whether or not
 *    anybody remembered to declare it.
 *
 * Arm B exists because arm A requires every current AND FUTURE producer to cooperate,
 * and this repository's most-repeated defect is exactly the invariant that must be
 * REMEMBERED rather than DERIVED. Arm B needs no cooperation at all.
 */
export function isGeoreferencedFrame(object: THREE.Object3D): boolean {
  const declared = (object.userData as Record<string, unknown> | undefined)?.[
    SCENE_FRAME_USERDATA_KEY
  ];
  if (typeof declared === 'string' && declared !== 'authoring') return true;

  const e = object.matrixWorld.elements;
  const translation = Math.hypot(e[12] ?? 0, e[13] ?? 0, e[14] ?? 0);
  return Number.isFinite(translation) && translation >= AUTHORING_FRAME_MAX_TRANSLATION_M;
}

/**
 * §GLB-EXPORT-AUTHORING-FRAME (L-1420) — resolve the frame an element must be exported
 * RELATIVE TO, or `null` when the element already sits in the authoring frame.
 *
 * ⚠ Returns the SHALLOWEST georeferenced ancestor (the one nearest the scene root), not
 * the nearest one. That is the frame BOUNDARY. Georeference is inherited downward through
 * `matrixWorld`, so under `GIS_BIM_ROOT` every intermediate group ALSO satisfies arm B;
 * dividing out the nearest such ancestor would additionally strip the element's own
 * offset inside the building. The shallowest one is the only node whose parent is still
 * in the authoring frame, so dividing IT out restores exactly the authoring coordinates
 * and nothing more.
 */
export function resolveExportFrame(element: THREE.Object3D): THREE.Object3D | null {
  const ancestors: THREE.Object3D[] = [];
  let parent: THREE.Object3D | null = element.parent;
  while (parent) {
    ancestors.push(parent);
    parent = parent.parent;
  }
  // Walk root-ward → the first (shallowest) hit is the boundary.
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (isGeoreferencedFrame(a)) return a;
  }
  return null;
}

/** §GLB-EXPORT-AUTHORING-FRAME (L-1420) — one root's contribution to the export bbox. */
export interface ExportRootBounds {
  /** `userData.id`/`elementId` of the root, or `'(unknown)'`. */
  readonly elementId: string;
  /** `userData.elementType` of the root, or `'(none)'`. */
  readonly elementType: string;
  /** `name` → parent `name` → … → scene, so a PARENT-borne transform is visible. */
  readonly ancestry: string;
  /** World-space bbox min (metres), or null for an empty root. */
  readonly min: { x: number; y: number; z: number } | null;
  /** World-space bbox max (metres), or null for an empty root. */
  readonly max: { x: number; y: number; z: number } | null;
}

/**
 * §GLB-EXPORT-AUTHORING-FRAME (L-1420) — dump the bbox of EACH root, not the aggregate.
 *
 * ⭐ WHY PER-ROOT. The founder's log carried ONE aggregate number —
 * `📦 Bounding box minY: 2553068.999066395`. An aggregate cannot distinguish "one stray
 * object is 2 553 km away" from "every object is", and those have different fixes. It
 * also cannot say WHICH ancestor carries the offset: L-604 already recorded a probe that
 * read `obj.position` (LOCAL) and therefore "passed while measuring nothing" against a
 * transform living on a parent. This reads WORLD space and prints the ANCESTRY, because
 * by construction the offending transform is on an ancestor.
 */
export function describeExportRootBounds(roots: readonly THREE.Object3D[]): ExportRootBounds[] {
  const ancestryOf = (obj: THREE.Object3D): string => {
    const parts: string[] = [];
    let p: THREE.Object3D | null = obj;
    while (p) {
      parts.push(p.name || p.type || '(unnamed)');
      p = p.parent;
    }
    return parts.join(' <- ');
  };

  return roots.map((root) => {
    const ud = root.userData as Record<string, unknown> | undefined;
    const rawId = ud?.id ?? ud?.elementId;
    const box = new THREE.Box3().setFromObject(root);
    const empty = box.isEmpty();
    return {
      elementId: rawId === undefined || rawId === null ? '(unknown)' : String(rawId),
      elementType: ud?.elementType ? String(ud.elementType) : '(none)',
      ancestry: ancestryOf(root),
      min: empty ? null : { x: box.min.x, y: box.min.y, z: box.min.z },
      max: empty ? null : { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  });
}

/**
 * §GLOBE-REAL-GRID-SUPPRESS (founder 2026-06-24) — element types that are
 * non-building ANNOTATION / DATUM / GRID overlays, NOT real geometry. They live
 * in the BIM THREE scene (LevelVisualizer's per-floor coloured datum lines + the
 * X/Z axis lines that cross at the scene origin == the building corner; structural
 * grid lines), and every one carries a `userData.elementType`, so the BIM→GLB
 * bridge below used to BAKE them into the "Real" model that Cesium places on the
 * 3D globe / 3D Site view — they streaked across the terrain. The MASSING study
 * never serialises the scene, so it was correctly clean; matching that, we now
 * strip these overlays from the exported GLB so REAL mode is clean too. (lowercased
 * for a case-insensitive match against the various casings used across stores.)
 */
export const NON_BUILDING_EXPORT_ELEMENT_TYPES = new Set<string>([
  'levelline',   // LevelVisualizer datum lines + level-head bubbles (the coloured per-floor lines + corner axes)
  'grid',        // structural grid lines / grid bubbles
  'gridline',
  'axis',        // any origin/axis helper line
  'datum',
  // §FIX-IFC-IN-CESIUM (L-696) — IfcSpace is a volumetric ROOM SOLID, not a
  // building element: baking it produces opaque blocks that swallow the walls
  // it bounds. IFC meshes now carry `elementType`, so this entry is what keeps
  // the imported model's spaces out of the REAL GLB. No native PRYZM scene mesh
  // uses 'space' as its elementType, so this is IFC-only in practice.
  'space',
]);

/**
 * §GLOBE-REAL-GRID-SUPPRESS — true when an object is a non-building datum/grid/
 * axis overlay that must NOT be baked into the exported (Real) GLB.
 */
export function isNonBuildingExportOverlay(object: THREE.Object3D): boolean {
  const et = object.userData?.elementType;
  if (!et) return false;
  return NON_BUILDING_EXPORT_ELEMENT_TYPES.has(String(et).toLowerCase());
}

/**
 * §GLOBE-REAL-GRID-SUPPRESS — select the ROOT BIM elements to bake into the GLB.
 *
 * An object is exported when it carries a `userData.elementType`, has no
 * elementType-bearing ancestor (root-only, avoids duplication), AND is not a
 * datum/grid/axis overlay. Extracted as a pure helper so the selection rules
 * (including the overlay-suppression filter) are unit-testable WITHOUT the
 * DOM-bound GLTFExporter/Blob.
 */
export function selectElementsForExport(scene: THREE.Object3D): THREE.Object3D[] {
  const elementsToExport: THREE.Object3D[] = [];
  let skippedOverlays = 0;

  scene.traverse((object) => {
    if (!(object.userData && object.userData.elementType)) return;

    // Never bake datum/grid/axis overlay lines into the Real GLB. Each overlay
    // line/sprite carries the elementType itself, so per-object filtering catches
    // the whole set (the LevelVisualizer datum-group parent has no elementType).
    if (isNonBuildingExportOverlay(object)) {
      skippedOverlays++;
      return;
    }

    let hasElementAncestor = false;
    let parent = object.parent;
    while (parent) {
      if (parent.userData && parent.userData.elementType) {
        hasElementAncestor = true;
        break;
      }
      parent = parent.parent;
    }

    if (!hasElementAncestor) elementsToExport.push(object);
  });

  if (skippedOverlays > 0) {
    console.log(`🧹 §GLOBE-REAL-GRID-SUPPRESS — skipped ${skippedOverlays} datum/grid/axis overlay object(s) (not baked into the Real GLB).`);
  }
  return elementsToExport;
}

/**
 * §FORMA-WHITE-MATERIAL (ADR-0093, 2026-06-30) — the role a mesh plays when the
 * Forma-white override remaps materials. `'glass'` keeps a translucent glazing
 * material so windows read as glass; `'opaque'` becomes the clean near-white
 * architectural massing material (everything else: walls, slabs, roofs, doors…).
 */
export type FormaWhiteRole = 'glass' | 'opaque';

/**
 * §FORMA-WHITE-MATERIAL — element types whose material role is GLASS regardless of
 * the underlying material (a window/curtain-wall pane). Lowercased for a case-
 * insensitive match against the various casings stores stamp.
 */
const GLASS_ELEMENT_TYPES = new Set<string>([
  'window',
  'curtainwall',
  'curtain-wall',
  'curtainpanel',
  'glazing',
  'skylight',
]);

/**
 * §FORMA-WHITE-MATERIAL — classify a mesh's Forma-white role from its element type
 * + its material, WITHOUT mutating anything (pure, unit-testable).
 *
 * A mesh reads as GLASS when EITHER:
 *   • its (own or ancestor) element type is a window/curtain-wall/glazing type, OR
 *   • its material is physically glass — `transmission > 0`, or the BIM glazing
 *     convention of `transparent === true` with `depthWrite === false` (see
 *     `makeGlassMat` in @pryzm/geometry-window: glass must not occlude what's
 *     behind it). A merely `transparent` material with depthWrite ON is NOT
 *     treated as glass (e.g. faded preview overlays) — only the glazing pattern is.
 *
 * Everything else is OPAQUE (→ the white massing material).
 *
 * @param elementType  the resolved element type hint (own or nearest ancestor's
 *                     `userData.elementType`), or undefined.
 * @param material     the mesh's material (or the first of a material array).
 */
export function classifyFormaWhiteRole(
  elementType: string | undefined,
  material: THREE.Material | THREE.Material[] | null | undefined,
): FormaWhiteRole {
  if (elementType && GLASS_ELEMENT_TYPES.has(elementType.toLowerCase())) return 'glass';
  const mat = Array.isArray(material) ? material[0] : material;
  if (mat) {
    const m = mat as THREE.Material & {
      transmission?: number;
      transparent?: boolean;
      depthWrite?: boolean;
    };
    if (typeof m.transmission === 'number' && m.transmission > 0) return 'glass';
    if (m.transparent === true && m.depthWrite === false) return 'glass';
  }
  return 'opaque';
}

/**
 * §FORMA-WHITE-MATERIAL — the Forma-white palette the override paints with. Mirrors
 * the massing's `FORMA_PALETTE` near-white (so the real model reads as the SAME
 * clean architectural white the abstract massing already uses) + a translucent
 * blue-grey glass. Brand-safe (white + cool glass; never black). Hex (0xRRGGBB).
 */
export interface FormaWhitePalette {
  /** Near-white massing fill for every opaque element (default `0xF4F4F2`). */
  readonly opaqueHex?: number;
  /** Translucent glazing tint for window/glass meshes (default `0xBFD3E6`). */
  readonly glassHex?: number;
  /** Glass opacity 0..1 (default `0.34`). */
  readonly glassOpacity?: number;
}

const FORMA_WHITE_DEFAULT_OPAQUE = 0xf4f4f2; // = FORMA_PALETTE.proposedFill
const FORMA_WHITE_DEFAULT_GLASS = 0xbfd3e6;  // soft cool glass blue
const FORMA_WHITE_DEFAULT_GLASS_OPACITY = 0.34;

/**
 * §FORMA-WHITE-MATERIAL — the pair of export-owned override materials shared across
 * the WHOLE export tree.
 *
 * ⚠ §FIX-FORMA-WHITE-MATERIAL-PER-ELEMENT (L-1207) — this type exists because the
 * override used to allocate its white + glass materials INSIDE the per-element
 * helper, which `exportFragmentsToGLB` calls once per root element. The doc comment
 * claimed "ONE shared white + ONE shared glass material per export tree"; the code
 * delivered one pair per ELEMENT. On the founder's 313-root building that is up to
 * 626 byte-identical glTF materials instead of 2 — every one a separate `materials[]`
 * entry (and a separate Cesium draw-call bucket, since Cesium batches by material).
 * Hoisting the factory to the call site restores the documented behaviour.
 */
interface FormaWhiteMaterials {
  readonly getWhite: () => THREE.MeshStandardMaterial;
  readonly getGlass: () => THREE.MeshPhysicalMaterial;
}

/**
 * §FORMA-WHITE-MATERIAL — build the ONE shared white + ONE shared glass material for
 * an export tree. Lazy, so a glass-free model never allocates the glass material and
 * an all-glass one never allocates the white. Fresh materials are pushed into `owned`
 * so `disposeExportRoot` frees exactly these (they are export-owned; the cloned real
 * materials are shared with the live scene and must NEVER be disposed — see §I3).
 */
function createFormaWhiteMaterials(
  palette: FormaWhitePalette,
  owned: THREE.Material[],
): FormaWhiteMaterials {
  const opaqueHex = palette.opaqueHex ?? FORMA_WHITE_DEFAULT_OPAQUE;
  const glassHex = palette.glassHex ?? FORMA_WHITE_DEFAULT_GLASS;
  const glassOpacity = palette.glassOpacity ?? FORMA_WHITE_DEFAULT_GLASS_OPACITY;

  let whiteMat: THREE.MeshStandardMaterial | null = null;
  let glassMat: THREE.MeshPhysicalMaterial | null = null;
  return {
    getWhite: (): THREE.MeshStandardMaterial => {
      if (!whiteMat) {
        whiteMat = new THREE.MeshStandardMaterial({ color: opaqueHex, roughness: 0.82, metalness: 0.0 });
        whiteMat.name = 'pryzm-forma-white-opaque';
        owned.push(whiteMat);
      }
      return whiteMat;
    },
    getGlass: (): THREE.MeshPhysicalMaterial => {
      if (!glassMat) {
        glassMat = new THREE.MeshPhysicalMaterial({
          color: glassHex,
          roughness: 0.08,
          metalness: 0.0,
          transmission: 0.85,
          ior: 1.5,
          thickness: 0.006,
          transparent: true,
          opacity: glassOpacity,
          depthWrite: false,
        });
        glassMat.name = 'pryzm-forma-white-glass';
        owned.push(glassMat);
      }
      return glassMat;
    },
  };
}

/**
 * §FORMA-WHITE-MATERIAL — remap EVERY mesh under `clone` to a Forma-white material:
 * a clean near-white for opaque elements, a translucent glass for windows/glazing.
 *
 * IMPORTANT (§I3 safety): the export clones SHARE their materials BY REFERENCE with
 * the live BIM scene. We therefore NEVER mutate the existing material — we ASSIGN a
 * fresh export-only material to `mesh.material`. Returns nothing; mutates
 * `mesh.material` references on the clone subtree only.
 *
 * ⚠ SCOPE — `isMesh` only. `Line`/`LineSegments`/`Points`/`Sprite` objects under a BIM
 * element (edge outlines, leaders, annotation strokes) keep their REAL materials and are
 * therefore the objects that reach `GLTFExporter` as `LineBasicMaterial`/`PointsMaterial`/
 * `SpriteMaterial` — the classes that trip its "Use MeshStandardMaterial or
 * MeshBasicMaterial" warning. See `collectUnsupportedGltfMaterials`, which NAMES them.
 */
function applyFormaWhiteOverride(
  clone: THREE.Object3D,
  materials: FormaWhiteMaterials,
  mode: 'all' | 'glass-only' = 'all',
): void {
  // Resolve the nearest element-type hint walking up from a mesh (the glass element
  // types live on the window GROUP, not always the leaf pane mesh).
  const elementTypeOf = (obj: THREE.Object3D): string | undefined => {
    let p: THREE.Object3D | null = obj;
    while (p) {
      const et = p.userData?.elementType;
      if (et) return String(et);
      p = p.parent;
    }
    return undefined;
  };

  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const role = classifyFormaWhiteRole(elementTypeOf(child), mesh.material);
    if (role === 'glass') {
      mesh.material = materials.getGlass();
      return;
    }
    // §FIX-GLOBE-REAL-GLAZING (L-1422) — in `'glass-only'` mode the OPAQUE elements keep
    // their REAL BIM materials. That is the whole point on the photoreal globe: the
    // founder asked for MORE realism, and repainting every wall near-white would deliver
    // the Forma STUDY look — strictly less realistic, the opposite of the request.
    if (mode === 'glass-only') return;
    mesh.material = materials.getWhite();
  });
}

/**
 * §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — one unsupported-material finding.
 */
export interface UnsupportedGltfMaterial {
  /** The owning BIM element id (`userData.id`/`elementId`), or `'(unknown)'`. */
  readonly elementId: string;
  /** The owning BIM element type (`userData.elementType`), or `'(none)'`. */
  readonly elementType: string;
  /** The offending object's `name`, or its constructor name if unnamed. */
  readonly objectName: string;
  /** The object's THREE class (`Mesh` / `LineSegments` / `Points` / `Sprite` …). */
  readonly objectClass: string;
  /** The material's THREE class (`MeshPhongMaterial`, `LineBasicMaterial`, …). */
  readonly materialClass: string;
  /** The material's `name`, or `'(unnamed)'`. */
  readonly materialName: string;
}

/**
 * §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — enumerate every material in an export
 * tree that `GLTFExporter` will warn about, and say WHICH ELEMENT owns it.
 *
 * ⚠ WHY THIS EXISTS. The founder's 3D-Site export logged, verbatim and five times:
 *
 *     GLTFExporter: Use MeshStandardMaterial or MeshBasicMaterial for best results.
 *
 * — and nothing else. Five anonymous warnings on a 313-element building are not a
 * finding, they are a rumour: the standing hypothesis was that they were the GLAZING
 * (a `MeshPhysicalMaterial` glTF supposedly cannot represent), which would have
 * explained opaque window panes. **That hypothesis is false and this helper is what
 * falsifies it.** The predicate below is copied EXACTLY from three's
 * `GLTFWriter.processMaterialAsync` (three 0.183, GLTFExporter.js ~L1583):
 *
 *     if ( material.isMeshStandardMaterial !== true && material.isMeshBasicMaterial !== true )
 *
 * and `MeshPhysicalMaterial extends MeshStandardMaterial`, whose constructor sets
 * `isMeshStandardMaterial = true` (three/src/materials/MeshStandardMaterial.js L63).
 * So the glass NEVER trips it. The warning can only come from a material class that is
 * neither — in practice the `Line`/`Points`/`Sprite` materials that
 * `applyFormaWhiteOverride` deliberately does not touch, or a legacy
 * `MeshPhongMaterial`/`MeshLambertMaterial` on an imported mesh.
 *
 * Pure + exported so the census is assertable without the DOM-bound exporter, and so a
 * future reader can re-measure instead of re-guessing.
 */
export function collectUnsupportedGltfMaterials(
  root: THREE.Object3D,
): UnsupportedGltfMaterial[] {
  const found: UnsupportedGltfMaterial[] = [];
  const seen = new Set<THREE.Material>();

  const ownerOf = (obj: THREE.Object3D): { id: string; type: string } => {
    let p: THREE.Object3D | null = obj;
    let id: string | undefined;
    let type: string | undefined;
    while (p) {
      const ud = p.userData as Record<string, unknown> | undefined;
      if (!id && ud) {
        const raw = ud.id ?? ud.elementId;
        if (raw !== undefined && raw !== null) id = String(raw);
      }
      if (!type && ud?.elementType) type = String(ud.elementType);
      if (id && type) break;
      p = p.parent;
    }
    return { id: id ?? '(unknown)', type: type ?? '(none)' };
  };

  root.traverse((child) => {
    const withMat = child as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
    if (!withMat.material) return;
    const mats = Array.isArray(withMat.material) ? withMat.material : [withMat.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      const m = mat as THREE.Material & {
        isMeshStandardMaterial?: boolean;
        isMeshBasicMaterial?: boolean;
      };
      // EXACT mirror of three's GLTFWriter.processMaterialAsync predicate.
      if (m.isMeshStandardMaterial === true || m.isMeshBasicMaterial === true) continue;
      seen.add(mat);
      const owner = ownerOf(child);
      found.push({
        elementId: owner.id,
        elementType: owner.type,
        objectName: child.name || child.constructor?.name || '(unnamed)',
        objectClass: child.constructor?.name ?? 'Object3D',
        materialClass: mat.constructor?.name ?? 'Material',
        materialName: mat.name || '(unnamed)',
      });
    }
  });

  return found;
}

/**
 * §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — print the census above as ONE console
 * group so the founder's next log NAMES the offenders instead of repeating an anonymous
 * warning N times. No-op when the tree is clean (the common, healthy case).
 */
function logUnsupportedGltfMaterials(root: THREE.Object3D): void {
  const found = collectUnsupportedGltfMaterials(root);
  if (found.length === 0) return;
  console.warn(
    `⚠ §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — ${found.length} material(s) are neither ` +
      `MeshStandardMaterial nor MeshBasicMaterial; GLTFExporter will warn once for each and ` +
      `fall back to a plain PBR approximation. NOT glazing — MeshPhysicalMaterial extends ` +
      `MeshStandardMaterial and never trips this. Offenders:`,
  );
  for (const f of found) {
    console.warn(
      `   • ${f.materialClass} "${f.materialName}" on ${f.objectClass} "${f.objectName}" ` +
        `— element ${f.elementType} id=${f.elementId}`,
    );
  }
}

/**
 * §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — true when `object` is a NON-SURFACE
 * renderable: a line, a line-segment set, a point cloud or a sprite.
 *
 * ⭐ DERIVED, NOT ENUMERATED. `NON_BUILDING_EXPORT_ELEMENT_TYPES` above is a hand-kept
 * list of element-type STRINGS, and it only ever sees ROOT elements — so the edge/outline
 * overlays that live INSIDE an element subtree (`SlabEdges`, `WallEdges`,
 * `floor-edge-overlay`) were structurally out of its reach no matter how many names were
 * added to it. This predicate keys on what THREE says the object IS (`isLine` /
 * `isLineSegments` / `isPoints` / `isSprite`), so a new overlay kind is caught the day it
 * is authored and nobody has to remember to update anything.
 *
 * These are exactly the objects `applyFormaWhiteOverride` deliberately does not touch, and
 * therefore exactly the `LineBasicMaterial`/`PointsMaterial`/`SpriteMaterial` offenders
 * that `collectUnsupportedGltfMaterials` names (L-1206). A wireframe drawn over a photoreal
 * globe is a drafting annotation, not architecture.
 */
export function isAnnotationOverlayObject(object: THREE.Object3D): boolean {
  const o = object as unknown as {
    isLine?: boolean;
    isLineSegments?: boolean;
    isPoints?: boolean;
    isSprite?: boolean;
  };
  return o.isLine === true || o.isLineSegments === true || o.isPoints === true || o.isSprite === true;
}

/**
 * Exports fragments from a Three.js scene to a GLB binary format
 * Preserves hierarchy and lets Cesium handle world placement.
 * Model base is anchored to Y = 0.
 *
 * §FORMA-WHITE-MATERIAL (ADR-0093) — pass `options.formaWhite` to remap every
 * exported element to a clean white architectural material (windows → translucent
 * glass). This is the FORMA-VIEW-ONLY look (Spacio/Forma white massing); the default
 * export (no option) keeps the real BIM materials unchanged, so the editor's WebGPU
 * BIM view and the normal download path are NOT affected.
 */
export async function exportFragmentsToGLB(
  scene: THREE.Scene,
  options?: {
    formaWhite?: boolean | FormaWhitePalette;
    triangleBudget?: number;
    /**
     * §FIX-GLOBE-REAL-GLAZING (L-1422) — remap ONLY window/curtain-wall/glazing meshes to
     * the shared translucent glass material, leaving every opaque element on its REAL BIM
     * material. This is the photoreal-globe half of `formaWhite`: C12 §11.4 recorded the
     * globe/site asymmetry (site = full white study, globe = raw BIM materials) as an open
     * founder decision; the decision is that glazing must read as GLASS on the globe too,
     * WITHOUT whitening the building. Ignored when `formaWhite` is set (that already
     * remaps glass).
     */
    glazingOverride?: boolean | FormaWhitePalette;
    /**
     * §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — drop line/point/sprite overlays
     * (edge outlines, leaders, annotation strokes) from the exported tree. On for the
     * Cesium REAL views, off for the plain GLB download so an interchange export is not
     * silently reduced.
     */
    stripAnnotationOverlays?: boolean;
  },
): Promise<string> {
  console.log("🚀 Starting GLB Export (Hierarchy preserved)...");

  // §FORMA-WHITE-MATERIAL — resolve the white-override request (off by default).
  const formaWhite = options?.formaWhite;
  const formaWhitePalette: FormaWhitePalette | null = formaWhite
    ? (formaWhite === true ? {} : formaWhite)
    : null;
  // Export-owned override materials (disposed in disposeExportRoot — they are NOT
  // shared with the live scene, unlike the cloned real materials).
  const ownedOverrideMaterials: THREE.Material[] = [];
  // §FIX-FORMA-WHITE-MATERIAL-PER-ELEMENT (L-1207) — build the shared white/glass pair
  // ONCE for the whole export tree, not once per root element (see the type doc).
  // §FIX-GLOBE-REAL-GLAZING (L-1422) — the glass-only request, when the full white
  // override is NOT active. Same one-pair-per-TREE rule (C12 §11.4 / L-1207).
  const glazingOnly = options?.glazingOverride;
  const glazingPalette: FormaWhitePalette | null =
    !formaWhitePalette && glazingOnly ? (glazingOnly === true ? {} : glazingOnly) : null;
  const overridePalette = formaWhitePalette ?? glazingPalette;
  const overrideMode: 'all' | 'glass-only' = formaWhitePalette ? 'all' : 'glass-only';
  const formaWhiteMaterials = overridePalette
    ? createFormaWhiteMaterials(overridePalette, ownedOverrideMaterials)
    : null;

  const exportRoot = new THREE.Group();
  exportRoot.name = "exportRoot";

  // Ensure matrices are current
  scene.updateMatrixWorld(true);

  // ------------------------------------------------------------
  // ✅ Only export ROOT BIM elements (avoid duplication) — and §GLOBE-REAL-GRID-
  //    SUPPRESS: never bake datum/grid/axis overlay lines into the Real GLB.
  // ------------------------------------------------------------
  const elementsToExport = selectElementsForExport(scene);

  console.log(`📊 Found ${elementsToExport.length} root elements to export.`);

  // §GLB-EXPORT-AUTHORING-FRAME (L-1420) — the georeferencing frame the roots were found
  // under, if any. Recorded for the log line, and non-null means the export DID have to
  // divide one out (which is itself the C12 §1.5 violation still being live).
  let exportFrame: THREE.Object3D | null = null;

  // §FIX-IFC-IN-CESIUM (L-696) — enforce the REAL-GLB triangle budget BEFORE the
  // expensive clone+serialise pass. Returning '' makes the caller keep the
  // MASSING representation (every call site already branches on a falsy url),
  // which is the documented REAL-vs-MASSING split rather than a new third mode.
  const triangleBudget = options?.triangleBudget ?? REAL_GLB_TRIANGLE_BUDGET;
  const triangleCount = countExportTriangles(elementsToExport);
  if (triangleCount > triangleBudget) {
    console.warn(
      `⚠ §FIX-IFC-IN-CESIUM — REAL GLB declined: ${triangleCount.toLocaleString()} triangles ` +
        `exceeds the ${triangleBudget.toLocaleString()} budget. Keeping the massing study. ` +
        `(No mesh-decimation/LOD stage exists yet — see the L-696 ADR follow-up.)`,
    );
    return '';
  }
  console.log(`📐 Export payload: ${triangleCount.toLocaleString()} triangles (budget ${triangleBudget.toLocaleString()}).`);

  // ------------------------------------------------------------
  // ✅ Clone elements AND BAKE THEIR FULL WORLD TRANSFORM (§A.21.D56)
  // ------------------------------------------------------------
  // `exportRoot` stays at identity below, so a clone carrying its source's baked
  // scene-world transform lands at exactly the editor scene-world position. This
  // restores the ancestor X/Z (and rotation) that the bare `clone(true)` dropped,
  // so the GLB is no longer laterally shifted from the site origin on the globe.
  let strippedOverlayObjects = 0;
  for (const element of elementsToExport) {
    // deep clone can fail if userData has circular refs (common in BIM)
    // We sanitize userData before cloning to avoid "Converting circular structure to JSON"

    // Simple sanitization: only keep primitive-like data for export
    // or just temporarily remove it if it's too complex
    // §GLB-EXPORT-AUTHORING-FRAME (L-1420) — bake the element RELATIVE to its
    // georeferencing frame, not in absolute scene-world space. See the root-cause note
    // on the bounding-box guard below.
    const frame = resolveExportFrame(element);
    if (frame && !exportFrame) exportFrame = frame;
    const clone = cloneWithBakedWorldTransform(element, frame);

    // §GLB-STRIP-LIGHTS (founder 2026-06-19, Cesium crash) — remove any THREE
    // lights (e.g. emissive furniture lamps' PointLights) before export. They
    // serialise as KHR_lights_punctual nodes; a sceneful of them crashed the
    // Cesium "Real" globe on open. Cesium lights the model with its own sun/IBL,
    // so the THREE lights are dead weight in the GLB — drop them defensively.
    const _lights: THREE.Object3D[] = [];
    clone.traverse((child) => {
      if ((child as unknown as { isLight?: boolean }).isLight) _lights.push(child);
    });
    for (const l of _lights) l.parent?.remove(l);

    // §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — same shape as the light strip above,
    // and derived from what the object IS rather than from a name list. See
    // `isAnnotationOverlayObject`.
    if (options?.stripAnnotationOverlays) {
      const _overlays: THREE.Object3D[] = [];
      clone.traverse((child) => {
        if (isAnnotationOverlayObject(child)) _overlays.push(child);
      });
      for (const o of _overlays) o.parent?.remove(o);
      strippedOverlayObjects += _overlays.length;
    }

    // Ensure the clone doesn't carry over circular references in userData
    clone.traverse((child) => {
      if (child.userData) {
        const cleanUserData: any = {};
        for (const key in child.userData) {
          const val = child.userData[key];
          // Only keep simple properties to avoid circularity during GLB export
          if (typeof val !== 'object' || val === null || Array.isArray(val)) {
            cleanUserData[key] = val;
          }
        }
        child.userData = cleanUserData;
      }
    });

    // §FORMA-WHITE-MATERIAL — when requested, remap this clone's meshes to the clean
    // white massing material (glass for windows). Assigns FRESH export-only materials
    // to the clone references (never mutates the live/shared materials).
    if (formaWhiteMaterials) {
      applyFormaWhiteOverride(clone, formaWhiteMaterials, overrideMode);
    }

    exportRoot.add(clone);
  }

  exportRoot.updateMatrixWorld(true);

  // ------------------------------------------------------------
  // ✅ Anchor the GROUND-FLOOR PLANE (scene Y = 0) to GLB-local Y = 0
  // ------------------------------------------------------------
  // §GLOBE-GROUND-FLOAT (founder, 2026-06-17) — the building sat "slightly too
  // high" on the photoreal globe. ROOT CAUSE: this used to anchor the LOWEST
  // exported vertex (`boundingBox.min.y`, e.g. -1.75 m) to Y = 0 by doing
  // `position.y -= minY`. When ANY element dips below the ground-floor plane
  // (slab/floor thickness below z = 0, a footing, a below-grade stair landing),
  // `minY` is NEGATIVE, so subtracting it LIFTS the whole model by |minY| — the
  // ground floor ends up |minY| ABOVE the sampled tile surface (the "slight
  // float"). CesiumViewport.renderRealModelOnGlobe seats the GLB origin exactly on
  // the clamped tile height (`formaTerrainBaseHeight`), so whatever maps to
  // GLB-local Y = 0 lands ON the ground.
  //
  // The BIM scene is authored with the GROUND FLOOR at scene Y = 0 (wall baseLine
  // y = level elevation, ground = 0). So the correct anchor is the FLOOR PLANE
  // (Y = 0), NOT the lowest vertex — below-floor geometry should stay below the
  // surface, not push the floor up. We therefore only DROP a model that floats
  // entirely above Y = 0 (minY > 0 → lower it onto the ground) and NEVER lift a
  // model whose geometry extends below the floor plane (minY <= 0 → leave Y = 0 at
  // the floor, below-grade parts go below the tile surface as they should).
  if (strippedOverlayObjects > 0) {
    console.log(
      `🧹 §GLB-EXPORT-STRIP-ANNOTATION-OVERLAYS (L-1421) — stripped ${strippedOverlayObjects} ` +
        'line/point/sprite annotation object(s) from the exported tree (derived from the ' +
        'object class, not from a name list).',
    );
  }
  if (exportFrame) {
    console.log(
      `🧭 §GLB-EXPORT-AUTHORING-FRAME (L-1420) — exported RELATIVE to georeferencing frame ` +
        `"${exportFrame.name || exportFrame.type}" (its world translation was divided out; ` +
        'the GLB is in site-local authoring metres, as C12 §1.1 requires).',
    );
  }

  const boundingBox = new THREE.Box3().setFromObject(exportRoot);

  // ------------------------------------------------------------
  // §GLB-EXPORT-AUTHORING-FRAME (L-1420) — REFUSE a globe-scale export tree.
  // ------------------------------------------------------------
  // ⭐ THE DEFECT THIS CLOSES (founder, production, 2026-08-19). The 3D-Globe REAL export
  // logged `📦 Bounding box minY: 2553068.999066395` — 2 553 km — and the building rendered
  // as a continent-sized white slab hanging in the sky above the Earth.
  //
  // ROOT CAUSE, established by ARITHMETIC and not by magnitude (C12 §1.5 explicitly forbids
  // concluding this from magnitude alone, and it is right to):
  //   • `GISAreaLayout` calls `CesiumThreeBridge.setAnchor()` UNCONDITIONALLY at GIS init
  //     with a hard-coded default anchor — the Sydney Opera House, lon 151.2153 / lat
  //     -33.8568. (C12 §1.5 recorded "NOT verified that setAnchor() actually ran … it is
  //     called from the separate cesium-model-transformed event"; there is a SECOND,
  //     init-time call site it did not know about, and that one always runs.)
  //   • `setAnchor()` re-parents every BIM root into `GIS_BIM_ROOT` and gives that group the
  //     full ECEF `eastNorthUpToFixedFrame` matrix.
  //   • WGS-84 ECEF **Y** for that anchor is **2 553 076.920 m**. The observed `minY` is
  //     **2 553 068.999 m** — a residual of **-7.921 m**, which is exactly
  //     `east_y x_local` for `east_y = -0.876435` and a **9.04 m** east extent: a house
  //     footprint. The offset is the anchor translation; the remainder is the building.
  //   • `cloneWithBakedWorldTransform` baked `matrixWorld`, so the export inherited that
  //     frame. Anchoring then subtracted `minY` — removing the **Y** component only and
  //     leaving X ≈ -4.65e6 and Z ≈ -3.53e6 — so Cesium seated a model that is ~5.8 Mm from
  //     its own GLB origin. That is the slab in the sky.
  //
  // The frame-relative bake above is the fix. This guard is what makes a REGRESSION
  // impossible to ship silently: if a tree still measures globe-scale after frame
  // resolution, the GLB is unusable, so we DUMP PER ROOT (never one aggregate number —
  // an aggregate cannot say whether all roots or one root carry the offset) and DECLINE.
  // Declining keeps the massing study, the documented degradation the triangle budget
  // already uses, rather than placing a 2 553 km building on the founder's globe again.
  const worstExtent = boundingBox.isEmpty()
    ? 0
    : Math.max(
        Math.abs(boundingBox.min.x), Math.abs(boundingBox.min.y), Math.abs(boundingBox.min.z),
        Math.abs(boundingBox.max.x), Math.abs(boundingBox.max.y), Math.abs(boundingBox.max.z),
      );
  if (worstExtent >= AUTHORING_FRAME_MAX_TRANSLATION_M) {
    console.error(
      `⛔ §GLB-EXPORT-AUTHORING-FRAME (L-1420) — REFUSED: the export tree reaches ` +
        `${Math.round(worstExtent).toLocaleString()} m from its own origin, beyond the ` +
        `${AUTHORING_FRAME_MAX_TRANSLATION_M.toLocaleString()} m authoring bound (C12 §1.1). ` +
        'These magnitudes are GLOBE/ECEF scale, not site-local — a georeferencing frame ' +
        'leaked into the export and was NOT divided out. Per-root dump follows; THE ANCESTRY ' +
        'IS THE ANSWER, the offending transform lives on a PARENT, not on the leaf.',
    );
    for (const b of describeExportRootBounds(elementsToExport)) {
      console.error(
        `   • ${b.elementType} id=${b.elementId} — min=${b.min ? `(${b.min.x.toFixed(1)}, ${b.min.y.toFixed(1)}, ${b.min.z.toFixed(1)})` : '(empty)'} ` +
          `max=${b.max ? `(${b.max.x.toFixed(1)}, ${b.max.y.toFixed(1)}, ${b.max.z.toFixed(1)})` : '(empty)'} — ${b.ancestry}`,
      );
    }
    disposeExportRoot(exportRoot, ownedOverrideMaterials);
    return '';
  }

  if (!boundingBox.isEmpty()) {
    const minY = boundingBox.min.y;

    console.log("📦 Bounding box minY:", minY);

    // Only lower a fully-above-ground model onto the floor plane; never lift one
    // that has below-floor geometry (that lift is exactly the "slight float").
    const anchorDrop = Math.max(0, minY);
    exportRoot.position.y -= anchorDrop;
    exportRoot.updateMatrixWorld(true);

    console.log(
      `🏗 Model anchored to ground-floor plane (Y = 0); applied drop ${anchorDrop.toFixed(3)} m ` +
        `(below-floor geometry kept below ground).`,
    );
  } else {
    console.warn("⚠ Bounding box is empty. Skipping base anchoring.");
  }

  // ------------------------------------------------------------
  // ✅ Export GLB
  // ------------------------------------------------------------
  // §FIX-GLB-NAME-UNSUPPORTED-MATERIALS (L-1206) — NAME anything GLTFExporter is about
  // to warn about, BEFORE it emits its N anonymous warnings. Runs on the final tree so
  // the census reflects the Forma-white override when it is active.
  logUnsupportedGltfMaterials(exportRoot);

  const exporter = new GLTFExporter();

  const blobUrl = await new Promise<string>((resolve, reject) => {
    exporter.parse(
      exportRoot,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: "model/gltf-binary" });
          const url = URL.createObjectURL(blob);

          disposeExportRoot(exportRoot, ownedOverrideMaterials);

          console.log("✅ GLB Export complete.");
          console.log("📦 Blob size:", blob.size, "bytes");

          resolve(url);
        } else {
          reject(new Error("Exporter did not return ArrayBuffer."));
        }
      },
      (error) => {
        disposeExportRoot(exportRoot, ownedOverrideMaterials);
        reject(error);
      },
      {
        binary: true,
        embedImages: true,
        includeCustomExtensions: true
      }
    );
  });

  return blobUrl;
}

/**
 * Download for debugging
 */
export function downloadBlobUrl(blobUrl: string, filename: string = 'bim_snapshot.glb'): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Cleanup Blob URL
 */
export function revokeBlobUrl(blobUrl: string): void {
  URL.revokeObjectURL(blobUrl);
}

/**
 * Tear down the temporary export root.
 *
 * §I3 / §GLOBE-REAL-EXPORT-NODISPOSE (founder 2026-06-29) — the Real-GLB export
 * for the Cesium photoreal globe used to crash and never reach the globe:
 *
 *   [ViewportCrashGuard] §I3 suppressed non-fatal GPU internal:
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'usedTimes')
 *
 * ROOT CAUSE: `exportFragmentsToGLB` clones the LIVE BIM elements with
 * `clone(true)`. THREE's `Mesh.copy()` copies `geometry` and `material` BY
 * REFERENCE (three 0.183 Mesh.js L126 `this.material = source.material`; geometry
 * likewise) — the clones do NOT own their own GPU resources, they SHARE the live
 * scene's. So `geometry.dispose()` / `material.dispose()` here did not free
 * export-only buffers — it freed the LIVE viewport's still-bound GPU resources.
 * On the WebGPU backend a material dispose fires the renderer's resource teardown
 * → `NodeManager.delete(renderObject)` (three webgpu NodeManager.js L271) reads
 * `this.get(object).nodeBuilderState.usedTimes` on a render object whose node
 * state is gone → `undefined.usedTimes` TypeError — the SAME `usedTimes`
 * device-loss family already guarded by RenderPipelineManager §I2
 * (`_safeDisposeRenderPipeline`). ViewportCrashGuard §I3 then swallowed the throw,
 * aborting the export so the building never landed on the globe. (On WebGL it
 * would silently corrupt the live render instead of throwing.)
 *
 * FIX: never dispose resources the clones SHARE with the live scene. The export
 * root holds only references — GLTFExporter reads CPU-side attributes/material
 * props and allocates no new GPU resources — so there is nothing export-owned to
 * free. We simply DETACH the clones (clear the group) and let the live scene keep
 * ownership of their geometry/material lifecycle. A defensive `usedTimes`
 * normalization mirrors §I2 in case a future code path makes the clones own their
 * resources and disposal is reintroduced.
 */
function disposeExportRoot(root: THREE.Group, ownedMaterials: THREE.Material[] = []) {
  // §I3 — DO NOT dispose geometry/material: they are shared by reference with the
  // live scene (clone(true) reference-copies both). Disposing them frees the live
  // viewport's GPU buffers → WebGPU NodeManager `usedTimes` crash / WebGL render
  // corruption. Just detach so the temporary group is GC'd; the live scene owns
  // the underlying resources.
  //
  // §FORMA-WHITE-MATERIAL — the override materials are the ONE exception: they were
  // freshly allocated here (NOT shared with the live scene), so disposing them frees
  // export-only GPU resources without touching the live viewport. Safe to dispose.
  for (const m of ownedMaterials) { try { m.dispose(); } catch { /* already gone */ } }
  root.clear();
}

/**
 * Optional debug button
 */
export function addDebugButton(scene: THREE.Scene): void {
  const debugButton = document.createElement("button");
  debugButton.innerText = "Download GLB Debug";
  debugButton.style.position = "absolute";
  debugButton.style.top = "20px";
  debugButton.style.right = "20px";
  debugButton.style.zIndex = "9999";
  debugButton.style.padding = "10px 20px";
  debugButton.style.backgroundColor = "#ff4444";
  debugButton.style.color = "white";
  debugButton.style.border = "none";
  debugButton.style.borderRadius = "5px";
  debugButton.style.cursor = "pointer";
  debugButton.style.fontWeight = "bold";
  document.body.appendChild(debugButton);

  debugButton.onclick = async () => {
    console.log("🔎 DEBUG EXPORT START");

    let elementCount = 0;
    scene.traverse((object) => {
      if (object.userData && object.userData.elementType) {
        elementCount++;
      }
    });

    console.log("Export element count:", elementCount);

    const blobUrl = await exportFragmentsToGLB(scene);

    downloadBlobUrl(blobUrl, "debug.glb");

    console.log("🔎 DEBUG EXPORT DONE");
  };
}