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
export function cloneWithBakedWorldTransform(element: THREE.Object3D): THREE.Object3D {
  const clone = element.clone(true);

  // Refresh the ancestor chain on the SOURCE, then bake its composed world
  // matrix onto the clone's local transform.
  element.updateWorldMatrix(true, false);
  clone.matrix.copy(element.matrixWorld);
  clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
  clone.matrixAutoUpdate = true;

  return clone;
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
    mesh.material = role === 'glass' ? materials.getGlass() : materials.getWhite();
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
  options?: { formaWhite?: boolean | FormaWhitePalette; triangleBudget?: number },
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
  const formaWhiteMaterials = formaWhitePalette
    ? createFormaWhiteMaterials(formaWhitePalette, ownedOverrideMaterials)
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
  for (const element of elementsToExport) {
    // deep clone can fail if userData has circular refs (common in BIM)
    // We sanitize userData before cloning to avoid "Converting circular structure to JSON"

    // Simple sanitization: only keep primitive-like data for export
    // or just temporarily remove it if it's too complex
    const clone = cloneWithBakedWorldTransform(element);

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
      applyFormaWhiteOverride(clone, formaWhiteMaterials);
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
  const boundingBox = new THREE.Box3().setFromObject(exportRoot);

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