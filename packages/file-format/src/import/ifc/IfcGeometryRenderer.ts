import * as THREE from '@pryzm/renderer-three/three';
import * as WEBIFC from 'web-ifc';
import type { IfcElementRecord } from './IfcModelStore';

export interface IfcRenderedModel {
    modelId: string;
    name: string;
    group: THREE.Group;
    meshCount: number;
    triangleCount: number;
    elementCount: number;
}

export class IfcGeometryRenderer {
    private readonly api: WEBIFC.IfcAPI;
    private initialized = false;
    private readonly ownsApi: boolean;

    /**
     * @param externalApi - Optional shared IfcAPI instance (e.g. from IfcImporter).
     *   When provided the renderer will NOT initialise or dispose it — the caller owns the lifecycle.
     *   When omitted a new IfcAPI is created and managed internally.
     */
    constructor(externalApi?: WEBIFC.IfcAPI) {
        if (externalApi) {
            this.api = externalApi;
            this.initialized = true;
            this.ownsApi = false;
        } else {
            this.api = new WEBIFC.IfcAPI();
            this.ownsApi = true;
        }
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        this.api.SetWasmPath('/wasm/', true);
        await this.api.Init(undefined, true);
        this.initialized = true;
    }

    dispose(): void {
        if (this.ownsApi) {
            this.initialized = false;
        }
    }

    /**
     * Render geometry from an already-open model (modelID was opened by the caller).
     * Does NOT open or close the model — the caller is responsible for the model lifecycle.
     *
     * @param elementIndex - Optional map from expressID → IfcElementRecord.
     *   When provided (§28 contract), each mesh receives enriched userData including
     *   type, ifcTypeName, rawIfcType, storeyName, and psets.
     *   Build this from IfcImporter.extractElements() BEFORE calling this method.
     */
    renderFromOpenModel(
        modelID: number,
        scene: THREE.Scene,
        modelId: string,
        name: string,
        elementIndex?: Map<number, IfcElementRecord>,
    ): IfcRenderedModel {
        const group = new THREE.Group();
        group.name = `Imported IFC: ${name}`;
        group.userData = { modelId, name, source: 'ifc-import' };

        let meshCount = 0;
        let triangleCount = 0;
        let elementCount = 0;
        const materialCache = new Map<string, THREE.MeshStandardMaterial>();

        try {
            this.api.StreamAllMeshes(modelID, (flatMesh) => {
                elementCount++;
                try {
                    this._processFlatMesh(flatMesh, modelID, modelId, name, group, materialCache, elementIndex, (mc, tc) => {
                        meshCount += mc;
                        triangleCount += tc;
                    });
                } catch (_) {
                    // skip this element but continue streaming
                }
            });
        } catch (error) {
            this.disposeGroup(group);
            throw error;
        }

        scene.add(group);
        return { modelId, name, group, meshCount, triangleCount, elementCount };
    }

    async renderFromBytes(bytes: Uint8Array, scene: THREE.Scene, modelId: string, name: string): Promise<IfcRenderedModel> {
        if (!this.initialized) await this.init();

        const modelID = this.api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });

        try {
            return this.renderFromOpenModel(modelID, scene, modelId, name);
        } finally {
            if (this.ownsApi) {
                this.api.CloseModel(modelID);
            }
        }
    }

    private _processFlatMesh(
        flatMesh: WEBIFC.FlatMesh,
        modelID: number,
        modelId: string,
        name: string,
        group: THREE.Group,
        materialCache: Map<string, THREE.MeshStandardMaterial>,
        elementIndex: Map<number, IfcElementRecord> | undefined,
        onGeometry: (meshCount: number, triangleCount: number) => void,
    ): void {
        // §28: Look up element record for enriched userData
        const record = elementIndex?.get(flatMesh.expressID);
        const elementType     = record?.ifcTypeName ?? 'Element';
        const rawIfcType      = record?.rawIfcType  ?? '';
        const elementName     = record?.name        ?? name;
        const elementStorey   = record?.storeyName  ?? '';
        const elementPsets    = record?.psets       ?? {};

        for (let i = 0; i < flatMesh.geometries.size(); i++) {
            const placedGeometry = flatMesh.geometries.get(i);
            const ifcGeometry = this.api.GetGeometry(modelID, placedGeometry.geometryExpressID);

            const vertexData = this.api.GetVertexArray(
                ifcGeometry.GetVertexData(),
                ifcGeometry.GetVertexDataSize(),
            );
            const indexData = this.api.GetIndexArray(
                ifcGeometry.GetIndexData(),
                ifcGeometry.GetIndexDataSize(),
            );

            const vertexCount = Math.floor(vertexData.length / 6);
            if (vertexCount === 0 || indexData.length === 0) continue;

            const positions = new Float32Array(vertexCount * 3);
            const normals   = new Float32Array(vertexCount * 3);

            for (let v = 0; v < vertexCount; v++) {
                positions[v * 3]     = vertexData[v * 6];
                positions[v * 3 + 1] = vertexData[v * 6 + 1];
                positions[v * 3 + 2] = vertexData[v * 6 + 2];
                normals[v * 3]       = vertexData[v * 6 + 3];
                normals[v * 3 + 1]   = vertexData[v * 6 + 4];
                normals[v * 3 + 2]   = vertexData[v * 6 + 5];
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexData), 1));
            geometry.computeBoundingSphere();

            const color = placedGeometry.color;
            const key = `${color.x.toFixed(3)}:${color.y.toFixed(3)}:${color.z.toFixed(3)}:${color.w.toFixed(3)}`;
            let material = materialCache.get(key);
            if (!material) {
                material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color.x, color.y, color.z),
                    opacity: Math.max(0.18, Math.min(1, color.w || 1)),
                    transparent: color.w < 0.99,
                    roughness: 0.62,
                    metalness: 0.04,
                    side: THREE.DoubleSide,
                });
                materialCache.set(key, material);
            }

            const mesh = new THREE.Mesh(geometry, material);
            // web-ifc flatTransformation is column-major — identical to what
            // THREE.Matrix4.fromArray() expects.  Do NOT transpose: transposing
            // converts column-major → row-major, scrambling all placements.
            const matrix = new THREE.Matrix4().fromArray(placedGeometry.flatTransformation);
            mesh.applyMatrix4(matrix);
            mesh.castShadow    = true;
            mesh.receiveShadow = true;

            // §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT §3.1 — enriched userData
            mesh.userData = {
                id:          `ifc-${flatMesh.expressID}`,
                expressID:   flatMesh.expressID,
                modelId,
                name:        elementName,
                type:        elementType,
                ifcTypeName: elementType,
                rawIfcType,
                storeyName:  elementStorey,
                psets:       elementPsets,
                source:      'ifc-import',
                selectable:  true,
            };

            group.add(mesh);
            onGeometry(1, Math.floor(indexData.length / 3));
        }
    }

    disposeGroup(group: THREE.Group): void {
        group.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
        });
        const seen = new Set<THREE.Material>();
        group.traverse((object) => {
            const mesh = object as THREE.Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
            for (const material of materials) {
                if (!seen.has(material)) {
                    material.dispose();
                    seen.add(material);
                }
            }
        });
        group.removeFromParent();
    }
}
