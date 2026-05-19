import * as THREE from '@pryzm/renderer-three/three';
import { GLTFExporter } from '@pryzm/renderer-three';

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
  // ✅ Clone elements WITHOUT baking transforms
  // ------------------------------------------------------------
  for (const element of elementsToExport) {
    // deep clone can fail if userData has circular refs (common in BIM)
    // We sanitize userData before cloning to avoid "Converting circular structure to JSON"
    
    // Simple sanitization: only keep primitive-like data for export
    // or just temporarily remove it if it's too complex
    const clone = element.clone(true);
    
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
  // ✅ Anchor model base to Y = 0 (safe transform)
  // ------------------------------------------------------------
  const boundingBox = new THREE.Box3().setFromObject(exportRoot);

  if (!boundingBox.isEmpty()) {
    const minY = boundingBox.min.y;

    console.log("📦 Bounding box minY:", minY);

    exportRoot.position.y -= minY;
    exportRoot.updateMatrixWorld(true);

    console.log("🏗 Model anchored to BASE (Y = 0).");
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