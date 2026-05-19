/**
 * FragmentReader.ts
 *
 * Read-only adapter that extracts data from BIM element stores.
 * This module does NOT mutate any data — it only reads and transforms.
 *
 * Responsibilities:
 * - Delegate to per-element-type readers
 * - Extract levels from the wall store (authoritative fallback)
 * - Provide mesh-finding and geometry-extraction utilities to readers
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    IntermediateModel,
    ExportElement,
    ExportLevel,
    ElementColor,
    PropertySet,
    TriangulatedGeometry,
    createDefaultIntermediateModel
} from './IntermediateModel';
import { WallStore } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { ColumnStore } from '@pryzm/geometry-column';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { StairStore } from '@pryzm/geometry-stair';
import { RoofStore } from '@pryzm/geometry-roof';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { RoomStore } from '@pryzm/room-topology';
import { ReaderContext } from './readers/ReaderContext';
import { WallReader } from './readers/WallReader';
import { WindowDoorReader } from './readers/WindowDoorReader';
import { SlabReader } from './readers/SlabReader';
import { ColumnReader } from './readers/ColumnReader';
import { BeamReader } from './readers/BeamReader';
import { StairReader } from './readers/StairReader';
import { RoofReader } from './readers/RoofReader';
import { FurnitureReader } from './readers/FurnitureReader';
import { HandrailReader } from './readers/HandrailReader';
import { PlumbingReader } from './readers/PlumbingReader';
import { CurtainWallReader } from './readers/CurtainWallReader';
import { RoomReader } from './readers/RoomReader';
import { debug } from '@pryzm/core-app-model';

export interface StoreRegistry {
    wallStore?: WallStore;
    slabStore?: SlabStore;
    columnStore?: ColumnStore;
    curtainWallStore?: CurtainWallStore;
    beamStore?: BeamStore;
    stairStore?: StairStore;
    roofStore?: RoofStore;
    furnitureStore?: FurnitureStore;
    handrailStore?: HandrailStore;
    plumbingStore?: PlumbingStore;
    roomStore?: RoomStore;
}

export interface SceneRegistry {
    scene: THREE.Scene;
}

export class FragmentReader implements ReaderContext {
    private stores: StoreRegistry;
    private sceneRegistry: SceneRegistry;

    constructor(stores: StoreRegistry, sceneRegistry: SceneRegistry) {
        this.stores = stores;
        this.sceneRegistry = sceneRegistry;
    }

    read(): IntermediateModel {
        debug("Extracting scene data...");
        const model = createDefaultIntermediateModel();

        model.levels = this.extractLevels();
        debug(`Levels extracted: ${model.levels.length}`);

        const elements: ExportElement[] = [];

        if (this.stores.wallStore) {
            debug("Reading walls...");
            elements.push(...new WallReader(this.stores.wallStore, this).read());
            debug("Reading windows and doors...");
            elements.push(...new WindowDoorReader(this.stores.wallStore, this).read());
        }
        if (this.stores.slabStore) {
            debug("Reading slabs...");
            elements.push(...new SlabReader(this.stores.slabStore, this).read());
        }
        if (this.stores.columnStore) {
            debug("Reading columns...");
            elements.push(...new ColumnReader(this.stores.columnStore, this).read());
        }
        if (this.stores.beamStore) {
            debug("Reading beams...");
            elements.push(...new BeamReader(this.stores.beamStore, this).read());
        }
        if (this.stores.stairStore) {
            debug("Reading stairs...");
            elements.push(...new StairReader(this.stores.stairStore, this).read());
        }
        if (this.stores.roofStore) {
            debug("Reading roofs...");
            elements.push(...new RoofReader(this.stores.roofStore, this).read());
        }
        if (this.stores.furnitureStore) {
            debug("Reading furniture...");
            elements.push(...new FurnitureReader(this.stores.furnitureStore, this).read());
        }
        if (this.stores.handrailStore) {
            debug("Reading handrails...");
            elements.push(...new HandrailReader(this.stores.handrailStore, this).read());
        }
        if (this.stores.plumbingStore) {
            debug("Reading plumbing...");
            elements.push(...new PlumbingReader(this.stores.plumbingStore, this).read());
        }
        if (this.stores.curtainWallStore) {
            debug("Reading curtain walls...");
            elements.push(...new CurtainWallReader(this.stores.curtainWallStore, this).read());
        }
        if (this.stores.roomStore) {
            debug("Reading rooms (IfcSpace)...");
            elements.push(...new RoomReader(this.stores.roomStore).read());
        }

        model.elements = elements;
        debug(`Total elements gathered: ${elements.length}`);
        return model;
    }

    readImportedIfcElements(): { elements: ExportElement[]; levels: ExportLevel[] } {
        const grouped = new Map<string, {
            id: string;
            expressID: number;
            name: string;
            ifcClass: string;
            levelId: string;
            storeyName: string;
            psets: Record<string, Record<string, string | number | boolean>>;
            geometries: TriangulatedGeometry[];
            color: ElementColor | null;
        }>();
        const levelsById = new Map<string, ExportLevel>();
        const store: any = window.ifcModelStore; // TODO(TASK-08)

        this.sceneRegistry.scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            const ud = obj.userData ?? {};
            if (ud.source !== 'ifc-import' || ud.expressID == null) return;

            const id = String(ud.id ?? `ifc-${ud.expressID}`);
            const storeRecord = store?.getElementById?.(id);
            const rawIfcType = String(storeRecord?.rawIfcType ?? ud.rawIfcType ?? ud.ifcType ?? '');
            const ifcClass = this.mapImportedIfcClass(rawIfcType, String(storeRecord?.ifcTypeName ?? ud.ifcTypeName ?? ud.type ?? ''));
            const storeyName = String(storeRecord?.storeyName ?? ud.storeyName ?? 'Unassigned');
            const levelId = this.importedStoreyLevelId(storeyName);
            const geometry = this.extractGeometry(obj);
            if (!geometry) return;

            if (!levelsById.has(levelId)) {
                levelsById.set(levelId, {
                    id: levelId,
                    guid: crypto.randomUUID(),
                    name: storeyName,
                    elevation: levelsById.size * 3,
                    height: 3,
                });
            }

            const existing = grouped.get(id);
            if (existing) {
                existing.geometries.push(geometry);
                return;
            }

            grouped.set(id, {
                id,
                expressID: Number(ud.expressID),
                name: String(storeRecord?.name ?? ud.name ?? `Imported IFC ${ud.expressID}`),
                ifcClass,
                levelId,
                storeyName,
                psets: storeRecord?.psets ?? ud.psets ?? {},
                geometries: [geometry],
                color: this.extractColor(obj),
            });
        });

        const elements: ExportElement[] = [];
        for (const item of grouped.values()) {
            const geometry = this.mergeGeometries(item.geometries);
            if (!geometry) continue;
            elements.push({
                id: item.id,
                guid: crypto.randomUUID(),
                ifcClass: item.ifcClass,
                name: item.name,
                geometry,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                propertySets: this.importedPsetsToExport(item.psets, item),
                levelId: item.levelId,
                source: 'ifc-import',
                ...(item.color ? { color: item.color } : {}),
            });
        }

        return { elements, levels: [...levelsById.values()] };
    }

    private extractLevels(): ExportLevel[] {
        const levels: ExportLevel[] = [];

        if (this.stores.wallStore) {
            const storeLevels = (this.stores.wallStore as any).getLevels?.() || [];
            for (const level of storeLevels) {
                levels.push({
                    id: level.id,
                    guid: crypto.randomUUID(),
                    name: level.name || `Level ${level.id}`,
                    elevation: level.elevation || 0,
                    height: level.height || 3.0
                });
            }
        }

        if (levels.length === 0) {
            levels.push({
                id: 'L0',
                guid: crypto.randomUUID(),
                name: 'Ground Floor',
                elevation: 0,
                height: 3.0
            });
        }

        return levels;
    }

    private importedStoreyLevelId(storeyName: string): string {
        return `ifc-storey-${storeyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unassigned'}`;
    }

    private mapImportedIfcClass(rawIfcType: string, typeName: string): string {
        const key = rawIfcType.toUpperCase();
        const map: Record<string, string> = {
            IFCWALL: 'IfcWall',
            IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
            IFCSLAB: 'IfcSlab',
            IFCDOOR: 'IfcDoor',
            IFCWINDOW: 'IfcWindow',
            IFCCOLUMN: 'IfcColumn',
            IFCBEAM: 'IfcBeam',
            IFCSTAIR: 'IfcStair',
            IFCSTAIRFLIGHT: 'IfcStairFlight',
            IFCROOF: 'IfcRoof',
            IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
            IFCMEMBER: 'IfcMember',
            IFCPLATE: 'IfcPlate',
            IFCRAILING: 'IfcRailing',
            IFCCOVERING: 'IfcCovering',
            IFCSPACE: 'IfcSpace',
        };
        if (map[key]) return map[key];
        const normalized = typeName.toLowerCase();
        if (normalized.includes('wall')) return 'IfcWall';
        if (normalized.includes('slab')) return 'IfcSlab';
        if (normalized.includes('door')) return 'IfcDoor';
        if (normalized.includes('window')) return 'IfcWindow';
        if (normalized.includes('column')) return 'IfcColumn';
        if (normalized.includes('beam')) return 'IfcBeam';
        if (normalized.includes('stair')) return 'IfcStair';
        if (normalized.includes('roof')) return 'IfcRoof';
        if (normalized.includes('furniture')) return 'IfcFurnishingElement';
        if (normalized.includes('covering')) return 'IfcCovering';
        return 'IfcBuildingElementProxy';
    }

    private mergeGeometries(geometries: TriangulatedGeometry[]): TriangulatedGeometry | null {
        if (geometries.length === 0) return null;
        if (geometries.length === 1) return geometries[0];

        let vertexLength = 0;
        let indexLength = 0;
        let normalLength = 0;
        for (const geometry of geometries) {
            vertexLength += geometry.vertices.length;
            indexLength += geometry.indices.length;
            normalLength += geometry.normals?.length ?? 0;
        }

        const vertices = new Float32Array(vertexLength);
        const indices = new Uint32Array(indexLength);
        const normals = normalLength > 0 ? new Float32Array(normalLength) : undefined;
        let vertexOffset = 0;
        let indexOffset = 0;
        let normalOffset = 0;
        let baseVertex = 0;

        for (const geometry of geometries) {
            vertices.set(geometry.vertices, vertexOffset);
            for (let i = 0; i < geometry.indices.length; i++) {
                indices[indexOffset + i] = geometry.indices[i] + baseVertex;
            }
            if (normals && geometry.normals) {
                normals.set(geometry.normals, normalOffset);
                normalOffset += geometry.normals.length;
            }
            vertexOffset += geometry.vertices.length;
            indexOffset += geometry.indices.length;
            baseVertex += geometry.vertices.length / 3;
        }

        return { vertices, indices, normals };
    }

    private importedPsetsToExport(
        psets: Record<string, Record<string, string | number | boolean>>,
        item: { id: string; expressID: number; storeyName: string },
    ): PropertySet[] {
        const result: PropertySet[] = [];
        for (const [name, props] of Object.entries(psets ?? {})) {
            const properties = Object.entries(props ?? {}).map(([propName, value]) => ({
                name: propName,
                value,
                type: typeof value === 'boolean'
                    ? 'boolean' as const
                    : typeof value === 'number'
                        ? (Number.isInteger(value) ? 'integer' as const : 'real' as const)
                        : 'string' as const,
            }));
            if (properties.length > 0) result.push({ name, properties });
        }
        result.push({
            name: 'Pset_PRYZM_ImportedIFC',
            properties: [
                { name: 'PryzmId', value: item.id, type: 'string' },
                { name: 'Source', value: 'ifc-import', type: 'string' },
                { name: 'ExpressID', value: String(item.expressID), type: 'string' },
                { name: 'StoreyName', value: item.storeyName, type: 'string' },
            ],
        });
        return result;
    }

    findMesh(id: string): THREE.Object3D | null {
        let found: THREE.Object3D | null = null;
        this.sceneRegistry.scene.traverse((obj) => {
            if (obj.userData?.id === id && !found) {
                found = obj;
            }
        });
        return found;
    }

    /**
     * Extract the dominant RGB colour from the first Three.js material found on the
     * object (or its children).  Returns null when no material with a colour is found.
     */
    extractColor(obj: THREE.Object3D): ElementColor | null {
        let color: ElementColor | null = null;
        obj.traverse((child) => {
            if (color) return;
            if (!(child instanceof THREE.Mesh) || !child.material) return;
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (!mat || !('color' in mat)) return;
            const c = (mat as THREE.MeshStandardMaterial).color;
            const opacity = (mat as any).opacity ?? 1.0;
            color = {
                r: Math.max(0, Math.min(1, c.r)),
                g: Math.max(0, Math.min(1, c.g)),
                b: Math.max(0, Math.min(1, c.b)),
                ...(opacity < 0.999 ? { a: opacity } : {}),
            };
        });
        return color;
    }

    extractGeometry(obj: THREE.Object3D): TriangulatedGeometry | null {
        const allVertices: number[] = [];
        const allIndices: number[] = [];
        const allNormals: number[] = [];
        let indexOffset = 0;

        obj.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
                const geom = child.geometry as THREE.BufferGeometry;
                const posAttr = geom.getAttribute('position');
                const normalAttr = geom.getAttribute('normal');
                const indexAttr = geom.getIndex();

                if (!posAttr) return;

                child.updateMatrixWorld(true);
                const matrix = child.matrixWorld;
                const positions = posAttr.array;
                const vertexCount = posAttr.count;

                for (let i = 0; i < vertexCount; i++) {
                    const vertex = new THREE.Vector3(
                        positions[i * 3],
                        positions[i * 3 + 1],
                        positions[i * 3 + 2]
                    );
                    vertex.applyMatrix4(matrix);
                    allVertices.push(vertex.x, vertex.y, vertex.z);
                }

                if (normalAttr) {
                    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
                    for (let i = 0; i < normalAttr.count; i++) {
                        const normal = new THREE.Vector3(
                            normalAttr.array[i * 3],
                            normalAttr.array[i * 3 + 1],
                            normalAttr.array[i * 3 + 2]
                        );
                        normal.applyMatrix3(normalMatrix).normalize();
                        allNormals.push(normal.x, normal.y, normal.z);
                    }
                }

                if (indexAttr) {
                    const indices = indexAttr.array;
                    for (let i = 0; i < indices.length; i++) {
                        allIndices.push(indices[i] + indexOffset);
                    }
                } else {
                    for (let i = 0; i < vertexCount; i++) {
                        allIndices.push(i + indexOffset);
                    }
                }

                indexOffset += vertexCount;
            }
        });

        if (allVertices.length === 0) return null;

        return {
            vertices: new Float32Array(allVertices),
            indices: new Uint32Array(allIndices),
            normals: allNormals.length > 0 ? new Float32Array(allNormals) : undefined
        };
    }
}
