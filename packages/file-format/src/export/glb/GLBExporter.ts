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
 * Exports fragments from a Three.js scene to a GLB binary format
 * Preserves hierarchy and lets Cesium handle world placement.
 * Model base is anchored to Y = 0.
 */
export async function exportFragmentsToGLB(scene: THREE.Scene): Promise<string> {
  console.log("🚀 Starting GLB Export (Hierarchy preserved)...");

  const exportRoot = new THREE.Group();
  exportRoot.name = "exportRoot";

  // Ensure matrices are current
  scene.updateMatrixWorld(true);

  const elementsToExport: THREE.Object3D[] = [];

  // ------------------------------------------------------------
  // ✅ Only export ROOT BIM elements (avoid duplication)
  // ------------------------------------------------------------
  scene.traverse((object) => {
    if (object.userData && object.userData.elementType) {

      let hasElementAncestor = false;
      let parent = object.parent;

      while (parent) {
        if (parent.userData && parent.userData.elementType) {
          hasElementAncestor = true;
          break;
        }
        parent = parent.parent;
      }

      if (!hasElementAncestor) {
        elementsToExport.push(object);
      }
    }
  });

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

          disposeExportRoot(exportRoot);

          console.log("✅ GLB Export complete.");
          console.log("📦 Blob size:", blob.size, "bytes");

          resolve(url);
        } else {
          reject(new Error("Exporter did not return ArrayBuffer."));
        }
      },
      (error) => {
        disposeExportRoot(exportRoot);
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
 * Dispose geometries and materials
 */
function disposeExportRoot(root: THREE.Group) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  });
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