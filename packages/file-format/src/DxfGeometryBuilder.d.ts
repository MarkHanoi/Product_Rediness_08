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
import type { DxfDocument } from './DxfParser.js';
export interface DxfGroupMetadata {
    /** Metres-per-DXF-unit conversion applied */
    metersPerUnit: number;
    /** Bounding box in PRYZM world space (XZ plane) */
    worldBounds: {
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    };
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
export declare function buildDxfGeometry(doc: DxfDocument, elevation?: number, metersPerUnitOverride?: number): {
    group: THREE.Group;
    meta: DxfGroupMetadata;
};
/**
 * Update visibility of a single layer's LineSegments.
 * Called by DxfImportPanel when the user toggles a layer eye.
 */
export declare function setLayerVisible(group: THREE.Group, layerName: string, visible: boolean): void;
/**
 * Update colour of a single layer's LineSegments.
 */
export declare function setLayerColor(group: THREE.Group, layerName: string, hexColor: string): void;
/**
 * Dispose all geometry and materials in the group.
 * Must be called on remove (§31 §7.8).
 */
export declare function disposeDxfGroup(group: THREE.Group, scene: THREE.Scene): void;
