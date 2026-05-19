import { WallStore } from '@pryzm/geometry-wall';
import { ExportElement, ElementColor, PropertySet, TriangulatedGeometry } from '../IntermediateModel';
import { ReaderContext, buildPropertySet, collectIfcPsets } from './ReaderContext';
import { debug } from '@pryzm/core-app-model';

export class WallReader {
    constructor(private store: WallStore, private ctx: ReaderContext) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];
        const walls = this.store.getAll();
        debug(`WallReader: ${walls.length} walls`);

        for (const wall of walls) {
            let geometry: TriangulatedGeometry | null = null;
            let position = { x: 0, y: 0, z: 0 };
            let color: ElementColor | null = null;

            const mesh = this.ctx.findMesh(wall.id);
            if (mesh) {
                geometry = this.ctx.extractGeometry(mesh);
                color    = this.ctx.extractColor(mesh);
                position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
                if (!geometry) {
                    debug(`WallReader: scene mesh found but no geometry for wall ${wall.id} — falling back to parametric`);
                }
            } else {
                debug(`WallReader: no scene mesh for wall ${wall.id} — using parametric geometry`);
            }

            // Parametric fallback: build box geometry from baseLine/height/thickness
            if (!geometry) {
                geometry = this._buildParametricGeometry(wall);
                if (!geometry) {
                    debug(`WallReader: parametric fallback also failed for wall ${wall.id} — skipping`);
                    continue;
                }
                const p0 = wall.baseLine[0];
                position = { x: p0.x, y: p0.y, z: p0.z };
            }

            const propertySets: PropertySet[] = [];
            const ifcDataAny = wall.ifcData as any;
            if (ifcDataAny?.psetCommon) {
                const ps = buildPropertySet('Pset_WallCommon', ifcDataAny.psetCommon);
                if (ps) propertySets.push(ps);
            }
            if (wall.properties && Object.keys(wall.properties).length > 0) {
                const ps = buildPropertySet('Pset_ElementParameters', wall.properties as Record<string, any>);
                if (ps) propertySets.push(ps);
            }
            const extra = collectIfcPsets(wall.ifcData, new Set(propertySets.map(p => p.name)));
            propertySets.push(...extra);

            elements.push({
                id: wall.id,
                guid: wall.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass: wall.ifcData?.ifcClass ?? 'IfcWall',
                name: `wall-${wall.id}`,
                predefinedType: ifcDataAny?.predefinedType,
                geometry,
                position,
                rotation: { x: 0, y: 0, z: 0 },
                propertySets,
                levelId: wall.levelId,
                parentId: wall.parentId,
                ...(color ? { color } : {}),
            });
        }

        return elements;
    }

    /**
     * Builds a triangulated box geometry from the wall's parametric data.
     * Used when the scene mesh cannot be found by ID traversal.
     * Coordinate system: Three.js Y-up (x/z horizontal plane, y vertical).
     */
    private _buildParametricGeometry(wall: any): TriangulatedGeometry | null {
        try {
            const p0 = wall.baseLine[0] as { x: number; y: number; z: number };
            const p1 = wall.baseLine[1] as { x: number; y: number; z: number };
            const dx = p1.x - p0.x;
            const dz = p1.z - p0.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length < 0.001) return null;

            const dirX = dx / length;
            const dirZ = dz / length;
            // Horizontal normal (perpendicular to wall direction)
            const normX = -dirZ;
            const normZ = dirX;

            const t = (wall.thickness as number) / 2;
            const h = wall.height as number;
            const y0 = p0.y;

            // 8 corner vertices of the wall box
            // Front face (offset +t along normal), back face (offset -t)
            const verts = new Float32Array([
                // v0 front-start-bottom
                p0.x + normX * t, y0,     p0.z + normZ * t,
                // v1 front-end-bottom
                p1.x + normX * t, y0,     p1.z + normZ * t,
                // v2 front-end-top
                p1.x + normX * t, y0 + h, p1.z + normZ * t,
                // v3 front-start-top
                p0.x + normX * t, y0 + h, p0.z + normZ * t,
                // v4 back-start-bottom
                p0.x - normX * t, y0,     p0.z - normZ * t,
                // v5 back-end-bottom
                p1.x - normX * t, y0,     p1.z - normZ * t,
                // v6 back-end-top
                p1.x - normX * t, y0 + h, p1.z - normZ * t,
                // v7 back-start-top
                p0.x - normX * t, y0 + h, p0.z - normZ * t,
            ]);

            const indices = new Uint32Array([
                // Front face
                0, 1, 2,  0, 2, 3,
                // Back face (reverse winding for outward normals)
                5, 4, 7,  5, 7, 6,
                // Start cap
                4, 0, 3,  4, 3, 7,
                // End cap
                1, 5, 6,  1, 6, 2,
                // Top
                3, 2, 6,  3, 6, 7,
                // Bottom
                4, 5, 1,  4, 1, 0,
            ]);

            return { vertices: verts, indices };
        } catch (err) {
            debug(`WallReader._buildParametricGeometry error: ${err}`);
            return null;
        }
    }
}
