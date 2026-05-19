/**
 * DxfGeometryBuilder.ts — Phase 1, §31
 *
 * Converts a DxfDocument into a THREE.Group containing one
 * THREE.LineSegments object per DXF layer.
 *
 * CONTRACT (§31 §7.1, §7.3, §7.4):
 *   - No store mutations.
 *   - All meshes have userData.selectable = false (§31 §7.3).
 *   - Group renderOrder = -1 so it renders behind BIM elements (§31 §7.4).
 *
 * Coordinate mapping (§31 §7.5):
 *   DXF x → THREE.x
 *   DXF y → THREE.z (negated: DXF +Y = north = Three.js -Z)
 *   All geometry placed at world Y = elevationY.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { DxfDocument, DxfPolyline } from './DxfParser';
import { DXF_UNITS_TO_METRES } from './DxfParser';

export interface DxfGroupMetadata {
    /** Metres-per-DXF-unit conversion applied */
    metersPerUnit: number;
    /** Bounding box in PRYZM world space (XZ plane) */
    worldBounds: { minX: number; minZ: number; maxX: number; maxZ: number };
    /** Map from layer name → THREE.LineSegments child */
    layerObjects: Map<string, THREE.LineSegments>;
}

/**
 * Build a THREE.Group from a parsed DxfDocument.
 *
 * @param doc     Parsed DXF document.
 * @param elevation  World Y position for the overlay (active level elevation + offset).
 * @param metersPerUnitOverride  Override for unit conversion (when $INSUNITS=0/unitless).
 */
export function buildDxfGeometry(
    doc: DxfDocument,
    elevation: number = 0,
    metersPerUnitOverride?: number,
): { group: THREE.Group; meta: DxfGroupMetadata } {
    const metersPerUnit = metersPerUnitOverride
        ?? (DXF_UNITS_TO_METRES[doc.insunits] ?? 0.001);

    const group = new THREE.Group();
    group.name = 'DxfOverlayGroup';
    group.renderOrder = -1;
    group.position.y = elevation;
    group.userData = {
        type: 'dxf_overlay',
        isDxfOverlay: true,
        selectable: false,
    };

    // Group polylines by layer
    const byLayer = new Map<string, DxfPolyline[]>();
    for (const poly of doc.polylines) {
        const arr = byLayer.get(poly.layer) ?? [];
        arr.push(poly);
        byLayer.set(poly.layer, arr);
    }

    const layerObjects = new Map<string, THREE.LineSegments>();
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;

    for (const [layerName, polylines] of byLayer) {
        // Determine colour from DXF layer (first polyline colour wins)
        const rgb = polylines[0]?.rgb ?? [255, 255, 255];
        const color = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

        // Build position array: each polyline segment becomes two points
        const positions: number[] = [];
        for (const poly of polylines) {
            const verts = poly.vertices;
            if (verts.length < 2) continue;
            for (let i = 0; i < verts.length - 1; i++) {
                const [x0, y0] = verts[i];
                const [x1, y1] = verts[i + 1];

                const wx0 = x0 * metersPerUnit;
                const wz0 = -y0 * metersPerUnit;  // DXF Y → -THREE.Z
                const wx1 = x1 * metersPerUnit;
                const wz1 = -y1 * metersPerUnit;

                positions.push(wx0, 0, wz0, wx1, 0, wz1);

                if (wx0 < minX) minX = wx0; if (wx0 > maxX) maxX = wx0;
                if (wz0 < minZ) minZ = wz0; if (wz0 > maxZ) maxZ = wz0;
                if (wx1 < minX) minX = wx1; if (wx1 > maxX) maxX = wx1;
                if (wz1 < minZ) minZ = wz1; if (wz1 > maxZ) maxZ = wz1;
            }
        }

        if (positions.length === 0) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });

        const lineSegments = new THREE.LineSegments(geometry, material);
        lineSegments.name = `dxf-layer-${layerName}`;
        lineSegments.renderOrder = -1;
        lineSegments.userData = {
            type: 'dxf_layer',
            layerName,
            selectable: false,
        };

        group.add(lineSegments);
        layerObjects.set(layerName, lineSegments);
    }

    if (!isFinite(minX)) { minX = 0; minZ = 0; maxX = 0; maxZ = 0; }

    return {
        group,
        meta: {
            metersPerUnit,
            worldBounds: { minX, minZ, maxX, maxZ },
            layerObjects,
        },
    };
}

/**
 * Update visibility of a single layer's LineSegments.
 * Called by DxfImportPanel when the user toggles a layer eye.
 */
export function setLayerVisible(
    group: THREE.Group,
    layerName: string,
    visible: boolean,
): void {
    group.traverse(obj => {
        if (obj.userData?.layerName === layerName) {
            obj.visible = visible;
        }
    });
}

/**
 * Update colour of a single layer's LineSegments.
 */
export function setLayerColor(
    group: THREE.Group,
    layerName: string,
    hexColor: string,
): void {
    group.traverse(obj => {
        if (obj.userData?.layerName === layerName) {
            const ls = obj as THREE.LineSegments;
            (ls.material as THREE.LineBasicMaterial).color.setStyle(hexColor);
        }
    });
}

/**
 * Dispose all geometry and materials in the group.
 * Must be called on remove (§31 §7.8).
 */
export function disposeDxfGroup(group: THREE.Group, scene: THREE.Scene): void {
    scene.remove(group);
    group.traverse(obj => {
        if ((obj as THREE.LineSegments).isLineSegments) {
            const ls = obj as THREE.LineSegments;
            ls.geometry.dispose();
            (ls.material as THREE.Material).dispose();
        }
    });
}
