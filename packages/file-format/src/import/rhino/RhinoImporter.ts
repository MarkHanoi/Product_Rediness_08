/**
 * RhinoImporter.ts — Phase 1 (Revit & Rhino Interoperability)
 *
 * Imports Rhino .3DM files into the PRYZM scene using Three.js's built-in
 * Rhino3dmLoader (three/examples/jsm/loaders/3DMLoader.js).
 *
 * The rhino3dm WASM (~7 MB) is lazy-loaded from /libs/rhino3dm/ and is only
 * fetched when a user actually selects a .3dm file — not on app startup.
 *
 * Architecture:
 *   1. Receive ArrayBuffer of the .3dm file
 *   2. Wrap in a Blob URL so Rhino3dmLoader can fetch it
 *   3. Rhino3dmLoader internally:
 *      - Loads rhino3dm.js + rhino3dm.wasm from /libs/rhino3dm/
 *      - Parses all geometry (NURBS → tessellated mesh, meshes, curves, SubDs)
 *      - Maps Rhino layers to THREE.Group children
 *      - Maps Rhino materials to THREE.Material
 *   4. Returns the root THREE.Group + statistics for the fidelity report
 */

import * as THREE from '@pryzm/renderer-three/three';

export interface RhinoImportStats {
    layerCount:   number;
    objectCount:  number;
    meshCount:    number;
    curveCount:   number;
    brepCount:    number;
    layerNames:   string[];
    hasMaterials: boolean;
}

export interface RhinoImportResult {
    group:    THREE.Group;
    fileName: string;
    stats:    RhinoImportStats;
    issues:   string[];
    elapsed:  number;
}

export async function importRhino3DM(
    bytes:      ArrayBuffer,
    fileName:   string,
    onProgress: (stage: string, pct: number, detail?: string) => void,
): Promise<RhinoImportResult> {
    const t0 = performance.now();
    const issues: string[] = [];

    onProgress('Loading Rhino geometry engine', 10, 'Initialising the rhino3dm WebAssembly module…');

    const { Rhino3dmLoader } = await import('three/examples/jsm/loaders/3DMLoader.js');

    const loader = new Rhino3dmLoader();
    loader.setLibraryPath('/libs/rhino3dm/');

    onProgress('Parsing .3DM file', 30, `Reading ${fileName}…`);

    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));

    const rootObject = await new Promise<THREE.Object3D>((resolve, reject) => {
        loader.load(
            blobUrl,
            (obj) => resolve(obj),
            (xhr) => {
                if (xhr.lengthComputable) {
                    const pct = 30 + Math.round((xhr.loaded / xhr.total) * 40);
                    onProgress('Parsing .3DM file', pct, `Loading geometry… ${Math.round(xhr.loaded / 1024)} KB`);
                }
            },
            (err) => reject(new Error(`Rhino3dmLoader error: ${err}`)),
        );
    });

    URL.revokeObjectURL(blobUrl);

    onProgress('Analysing scene', 80, 'Collecting layer and object statistics…');

    const group = rootObject as THREE.Group;

    const stats = collectStats(group, issues);

    onProgress('Applying Rhino settings', 95, 'Setting up materials and display options…');

    applyRhinoGroupSettings(group, fileName);

    const elapsed = Math.round(performance.now() - t0);
    onProgress('Done', 100, `Imported ${stats.objectCount} objects in ${(elapsed / 1000).toFixed(1)}s`);

    return { group, fileName, stats, issues, elapsed };
}

function collectStats(group: THREE.Group, issues: string[]): RhinoImportStats {
    let meshCount   = 0;
    let curveCount  = 0;
    let brepCount   = 0;
    let objectCount = 0;
    let hasMaterials = false;
    const layerNames = new Set<string>();

    group.traverse((obj) => {
        if (obj === group) return;
        objectCount++;

        const ud = obj.userData as Record<string, any>;

        if (ud?.objectType === 'Curve' || ud?.objectType === 'LineCurve' || ud?.objectType === 'PolylineCurve') {
            curveCount++;
        } else if (ud?.objectType === 'Brep' || ud?.objectType === 'Surface' || ud?.objectType === 'Extrusion') {
            brepCount++;
        } else if (obj instanceof THREE.Mesh) {
            meshCount++;
        }

        const layerName = ud?.layerName ?? (obj.parent?.name) ?? '';
        if (layerName) layerNames.add(layerName);

        if ((obj as any).material && (obj as any).material.name) {
            hasMaterials = true;
        }
    });

    if (objectCount === 0) {
        issues.push('No renderable geometry was found in this .3DM file. The file may be empty or use unsupported geometry types.');
    }

    return {
        layerCount:  layerNames.size,
        objectCount,
        meshCount,
        curveCount,
        brepCount,
        layerNames:  [...layerNames],
        hasMaterials,
    };
}

function applyRhinoGroupSettings(group: THREE.Group, fileName: string): void {
    group.name = `rhino__${fileName.replace(/\.3dm$/i, '')}`;
    group.userData.isRhinoImport  = true;
    group.userData.fileName       = fileName;
    group.userData.importedAt     = Date.now();
    group.userData.modelId        = `rhino-${crypto.randomUUID()}`;

    group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
            obj.userData.selectable    = false;
            obj.userData.isRhinoProxy  = true;
            obj.userData.modelId       = group.userData.modelId;

            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => { m.side = THREE.DoubleSide; });
            } else if (obj.material) {
                (obj.material as THREE.Material).side = THREE.DoubleSide;
            }
        }
    });
}
