/**
 * RoomReader.ts
 *
 * Extracts RoomData from the RoomStore and converts each room into an
 * ExportElement with ifcClass 'IfcSpace'.
 *
 * Geometry strategy:
 *   Rather than reading the scene mesh (which is a flat overlay polygon
 *   used for visualisation only), we build the 3D volume directly from
 *   the room's boundary polygon data.  This is more reliable and produces
 *   a correct closed solid for IFC viewers:
 *     - Bottom cap  : triangulated floor polygon (reversed winding → normals face down)
 *     - Top cap     : same polygon at +height  (normal winding → normals face up)
 *     - Side walls  : quad strips around each boundary edge
 *
 * Property sets produced:
 *   Pset_SpaceCommon — Reference, IsExternal, GrossPlannedArea, NetPlannedArea,
 *                      OccupancyType, FloorCovering, WallCovering, CeilingCovering
 *
 * Contract: docs/01_ELEMENTS/09_Rooms_Contract/06-ROOM-INTEGRATION-CONTRACT.md §6
 *           docs/01_ELEMENTS/09_Rooms_Contract/17-ROOM-GRAPH-QUERY-ENGINE-CONTRACT.md
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ExportElement, PropertySet, TriangulatedGeometry } from '../IntermediateModel';
import { RoomData, RoomVertex } from '@pryzm/room-topology';
import { debug } from '@pryzm/core-app-model';

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Build a closed extruded triangulated mesh from an XZ polygon.
 *
 * @param polygon  CCW polygon vertices in world XZ space (RoomVertex[])
 * @param floorY   World Y value of the room floor (level elevation + baseOffset)
 * @param height   Room clear height in metres
 */
function buildExtrudedGeometry(
    polygon: RoomVertex[],
    floorY: number,
    height: number,
): TriangulatedGeometry {
    const n = polygon.length;
    if (n < 3) {
        return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
    }

    const ceilY = floorY + height;

    // ── 1. Triangulate the 2D footprint using THREE.ShapeGeometry ─────────────
    // THREE.Shape works in XY space. We map polygon.x → shape.x, polygon.z → shape.y
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].z);
    for (let i = 1; i < n; i++) {
        shape.lineTo(polygon[i].x, polygon[i].z);
    }
    shape.closePath();

    const shapeGeom = new THREE.ShapeGeometry(shape);
    const posAttr  = shapeGeom.getAttribute('position') as THREE.BufferAttribute;
    const idxAttr  = shapeGeom.getIndex();
    const capCount = posAttr.count;

    const verts:   number[] = [];
    const indices: number[] = [];

    // ── 2. Bottom cap vertices (floor level) ──────────────────────────────────
    // ShapeGeometry XY maps back to world XZ
    for (let i = 0; i < capCount; i++) {
        verts.push(posAttr.getX(i), floorY, posAttr.getY(i));
    }

    // ── 3. Top cap vertices (ceiling level) ──────────────────────────────────
    for (let i = 0; i < capCount; i++) {
        verts.push(posAttr.getX(i), ceilY, posAttr.getY(i));
    }

    // ── 4. Bottom cap triangles (reversed winding → normals face down) ────────
    if (idxAttr) {
        for (let i = 0; i < idxAttr.count; i += 3) {
            const a = idxAttr.getX(i);
            const b = idxAttr.getX(i + 1);
            const c = idxAttr.getX(i + 2);
            indices.push(a, c, b);
        }
        // Top cap triangles (normal CCW winding → normals face up)
        for (let i = 0; i < idxAttr.count; i += 3) {
            const a = idxAttr.getX(i)     + capCount;
            const b = idxAttr.getX(i + 1) + capCount;
            const c = idxAttr.getX(i + 2) + capCount;
            indices.push(a, b, c);
        }
    }

    shapeGeom.dispose();

    // ── 5. Side wall quads ────────────────────────────────────────────────────
    // Each boundary edge (polygon[i] → polygon[i+1]) produces a quad:
    //   v0 (bottom i)  →  v1 (bottom j)
    //   v2 (top   j)   →  v3 (top   i)
    const sideBase = 2 * capCount;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const pi = polygon[i];
        const pj = polygon[j];
        const base = sideBase + i * 4;

        verts.push(
            pi.x, floorY, pi.z,  // base + 0  bottom i
            pj.x, floorY, pj.z,  // base + 1  bottom j
            pj.x, ceilY,  pj.z,  // base + 2  top    j
            pi.x, ceilY,  pi.z,  // base + 3  top    i
        );

        // Two CCW triangles (outward-facing when polygon is CCW)
        indices.push(base, base + 1, base + 2);
        indices.push(base, base + 2, base + 3);
    }

    return {
        vertices: new Float32Array(verts),
        indices:  new Uint32Array(indices),
    };
}

// ── Property set helpers ──────────────────────────────────────────────────────

function buildSpaceCommonPset(room: RoomData): PropertySet {
    const grossArea = room.computed.grossArea ?? room.computed.area ?? 0;
    const netArea   = room.computed.area ?? 0;

    const floorCovering   = room.finishes?.floor?.materialName   ?? '';
    const wallCovering    = room.finishes?.walls?.materialName   ?? '';
    const ceilingCovering = room.finishes?.ceiling?.materialName ?? '';

    const props = [
        { name: 'Reference',      value: room.roomNumber || '',  type: 'label'   as const },
        { name: 'IsExternal',     value: false,                  type: 'boolean' as const },
        { name: 'GrossPlannedArea', value: grossArea,            type: 'real'    as const },
        { name: 'NetPlannedArea',   value: netArea,              type: 'real'    as const },
        { name: 'OccupancyType',  value: room.occupancyType || 'Custom', type: 'label' as const },
        ...(floorCovering   ? [{ name: 'FloorCovering',   value: floorCovering,   type: 'label' as const }] : []),
        ...(wallCovering    ? [{ name: 'WallCovering',    value: wallCovering,    type: 'label' as const }] : []),
        ...(ceilingCovering ? [{ name: 'CeilingCovering', value: ceilingCovering, type: 'label' as const }] : []),
    ];

    return { name: 'Pset_SpaceCommon', properties: props };
}

// ── RoomReader ────────────────────────────────────────────────────────────────

export class RoomReader {
    constructor(private roomStore: any) {}

    read(): ExportElement[] {
        const elements: ExportElement[] = [];

        const rooms: RoomData[] = this.roomStore.getAll?.() ?? [];
        debug(`RoomReader: ${rooms.length} rooms`);

        const wallStore = window.wallStore; // TODO(TASK-08)

        for (const room of rooms) {
            const polygon = room.boundary?.polygon;
            if (!polygon || polygon.length < 3) {
                debug(`RoomReader: room '${room.id}' has no valid polygon — skipping`);
                continue;
            }

            // Resolve floor elevation: prefer wallStore level data, fall back to 0
            let levelElevation = 0;
            if (wallStore?.getLevelById) {
                const lvl = wallStore.getLevelById(room.levelId);
                if (lvl) levelElevation = lvl.elevation ?? 0;
            }

            const baseOffset = room.boundary.baseOffset ?? 0;
            const height     = room.boundary.height     ?? 3.0;
            const floorY     = levelElevation + baseOffset;

            const geometry = buildExtrudedGeometry(polygon, floorY, height);
            if (geometry.vertices.length === 0) {
                debug(`RoomReader: room '${room.id}' produced empty geometry — skipping`);
                continue;
            }

            const propertySets: PropertySet[] = [ buildSpaceCommonPset(room) ];

            // Optional: custom user-defined properties
            if (room.properties && Object.keys(room.properties).length > 0) {
                const customProps = Object.entries(room.properties)
                    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
                    .map(([k, v]) => ({
                        name:  k,
                        value: v as string | number | boolean,
                        type:  (typeof v === 'number'
                            ? (Number.isInteger(v) ? 'integer' : 'real')
                            : typeof v === 'boolean'
                                ? 'boolean'
                                : 'label') as 'integer' | 'real' | 'boolean' | 'label',
                    }));

                if (customProps.length > 0) {
                    propertySets.push({ name: 'Pset_ElementParameters', properties: customProps });
                }
            }

            const displayName = room.name?.trim()
                ? room.name
                : `Room ${room.roomNumber || room.id.slice(0, 8)}`;

            elements.push({
                id:             room.id,
                guid:           room.ifcData?.guid ?? crypto.randomUUID(),
                ifcClass:       'IfcSpace',
                name:           displayName,
                predefinedType: 'INTERNAL',
                geometry,
                position:       { x: 0, y: 0, z: 0 },
                rotation:       { x: 0, y: 0, z: 0 },
                propertySets,
                levelId:        room.levelId,
            });

            debug(`RoomReader: added IfcSpace '${displayName}' (level=${room.levelId}, area=${(room.computed.grossArea ?? room.computed.area ?? 0).toFixed(1)}m²)`);
        }

        debug(`RoomReader: exported ${elements.length} IfcSpace element(s)`);
        return elements;
    }
}
