import * as THREE from '@pryzm/renderer-three/three';
import { GLTFExporter } from '@pryzm/renderer-three';

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
 * §FORMA-WHITE-MATERIAL — remap EVERY mesh under `clone` to a Forma-white material:
 * a clean near-white for opaque elements, a translucent glass for windows/glazing.
 *
 * IMPORTANT (§I3 safety): the export clones SHARE their materials BY REFERENCE with
 * the live BIM scene. We therefore NEVER mutate the existing material — we ASSIGN a
 * fresh export-only material to `mesh.material`. The fresh materials are collected
 * into `owned` so `disposeExportRoot` can free ONLY these (they are export-owned, not
 * shared with the live scene). Returns nothing; mutates `mesh.material` references
 * on the clone subtree only.
 */
function applyFormaWhiteOverride(
  clone: THREE.Object3D,
  palette: FormaWhitePalette,
  owned: THREE.Material[],
): void {
  const opaqueHex = palette.opaqueHex ?? FORMA_WHITE_DEFAULT_OPAQUE;
  const glassHex = palette.glassHex ?? FORMA_WHITE_DEFAULT_GLASS;
  const glassOpacity = palette.glassOpacity ?? FORMA_WHITE_DEFAULT_GLASS_OPACITY;

  // ONE shared white + ONE shared glass material per export tree (cheap; Cesium
  // de-dups identical materials anyway). Created lazily so a glass-free model never
  // allocates the glass material.
  let whiteMat: THREE.MeshStandardMaterial | null = null;
  let glassMat: THREE.MeshPhysicalMaterial | null = null;
  const getWhite = (): THREE.MeshStandardMaterial => {
    if (!whiteMat) {
      whiteMat = new THREE.MeshStandardMaterial({ color: opaqueHex, roughness: 0.82, metalness: 0.0 });
      owned.push(whiteMat);
    }
    return whiteMat;
  };
  const getGlass = (): THREE.MeshPhysicalMaterial => {
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
      owned.push(glassMat);
    }
    return glassMat;
  };

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
    mesh.material = role === 'glass' ? getGlass() : getWhite();
  });
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
  options?: { formaWhite?: boolean | FormaWhitePalette },
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
    if (formaWhitePalette) {
      applyFormaWhiteOverride(clone, formaWhitePalette, ownedOverrideMaterials);
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