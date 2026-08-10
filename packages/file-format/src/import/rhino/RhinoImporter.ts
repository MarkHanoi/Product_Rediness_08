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

/**
 * One entry of the .3dm layer table, as materialised in the scene.
 * `index` is the Rhino layer-table index — the loader stamps it on every
 * object as `userData.attributes.layerIndex`, so it is the join key for
 * per-layer visibility control (C33 §1.2 / P7: layer visibility is intent).
 */
export interface RhinoImportLayerInfo {
    index:       number;
    name:        string;
    /** Rhino nested-layer path, `Parent::Child::Leaf` (C33 §1.2). */
    fullPath:    string;
    /** Visibility flag as authored in the .3dm file. */
    visible:     boolean;
    /** Number of scene objects the importer materialised on this layer. */
    objectCount: number;
}

export interface RhinoImportResult {
    group:    THREE.Group;
    fileName: string;
    stats:    RhinoImportStats;
    layers:   RhinoImportLayerInfo[];
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

    const { Rhino3dmLoader } = await import('@pryzm/renderer-three');

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

    const layers = extractRhinoLayers(group);
    const stats  = collectStats(group, issues, layers);

    const warnings = (group.userData as Record<string, unknown>).warnings;
    if (Array.isArray(warnings) && warnings.length > 0) {
        issues.push(
            `${warnings.length} object(s) could not be fully converted ` +
            '(unsupported geometry types or missing render meshes). See the group\'s userData.warnings for the full list.',
        );
    }

    onProgress('Applying Rhino settings', 95, 'Setting up materials and display options…');

    applyRhinoGroupSettings(group, fileName);
    applyRhinoUpAxisConversion(group);

    const elapsed = Math.round(performance.now() - t0);
    onProgress('Done', 100, `Imported ${stats.objectCount} objects in ${(elapsed / 1000).toFixed(1)}s`);

    return { group, fileName, stats, layers, issues, elapsed };
}

/**
 * §RHINO-ZUP-YUP (L-816) — Rhino authors geometry Z-up; PRYZM's world (like
 * three.js) is Y-up. three's Rhino3dmLoader performs NO axis conversion — it
 * hands back raw Rhino coordinates — so without this rotation every import
 * arrives lying on its side (90° off in plan).
 *
 * The mapping mirrors the DXF importer's per-vertex convention
 * (DxfGeometryBuilder: `DXF Y → -THREE.Z`, DXF Z → THREE.Y): a −90° rotation
 * about X maps (x, y, z)_rhino → (x, z, −y)_three, i.e. Rhino's Z (up) becomes
 * THREE's Y (up) and Rhino's plan-north (+Y) becomes THREE's −Z. Upright, and
 * plan orientation matches the DXF/plan convention.
 *
 * Applied ONCE at the import boundary, on the root group only — child objects
 * keep their raw Rhino transforms, so a future .3dm re-export can strip the
 * root rotation and recover the original coordinates.
 */
export function applyRhinoUpAxisConversion(group: THREE.Object3D): void {
    group.rotation.x = -Math.PI / 2;
    group.userData.upAxisConverted = 'rhino-z-up-to-three-y-up';
    group.updateMatrixWorld(true);
}

/**
 * Read the .3dm layer table off the loader's root userData (three's
 * Rhino3dmLoader stores the raw table at `group.userData.layers`) and count
 * the objects materialised per layer via each object's
 * `userData.attributes.layerIndex`.
 */
export function extractRhinoLayers(group: THREE.Object3D): RhinoImportLayerInfo[] {
    const raw = (group.userData as Record<string, unknown>).layers;
    if (!Array.isArray(raw)) return [];

    const counts = new Map<number, number>();
    group.traverse((obj) => {
        if (obj === group) return;
        const idx = (obj.userData as Record<string, any>)?.attributes?.layerIndex;
        if (typeof idx === 'number') counts.set(idx, (counts.get(idx) ?? 0) + 1);
    });

    return raw.map((layer: Record<string, unknown>, index: number): RhinoImportLayerInfo => {
        const fullPath = typeof layer?.fullPath === 'string' ? layer.fullPath : '';
        const name     = typeof layer?.name === 'string' && layer.name.length > 0
            ? layer.name
            : (fullPath.split('::').pop() || `Layer ${index}`);
        return {
            index,
            name,
            fullPath: fullPath || name,
            visible:  layer?.visible !== false,
            objectCount: counts.get(index) ?? 0,
        };
    });
}

function collectStats(group: THREE.Group, issues: string[], layers: RhinoImportLayerInfo[]): RhinoImportStats {
    let meshCount   = 0;
    let curveCount  = 0;
    let brepCount   = 0;
    let objectCount = 0;
    let hasMaterials = false;
    const layerNames = new Set<string>(layers.map(l => l.name));

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
