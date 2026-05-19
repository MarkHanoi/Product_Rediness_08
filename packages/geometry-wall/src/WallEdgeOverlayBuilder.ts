import * as THREE from '@pryzm/renderer-three/three';

/**
 * WallEdgeOverlayBuilder
 *
 * Produces a THREE.LineSegments edge overlay for any wall geometry.
 *
 * ── Migration note (Doc 20 — Edge Line Flicker Fix) ────────────────────────
 * Previously used LineSegments2 + LineMaterial (three/examples/jsm/lines/).
 * LineMaterial is a GLSL ShaderMaterial incompatible with the WebGPU TSL
 * renderer; the renderer failed to compile its shader on every frame, producing
 * the "LineMaterial is not compatible" error and continuous flicker.
 *
 * Replacement: THREE.LineSegments + THREE.LineBasicMaterial.
 * THREE.LineBasicMaterial has a built-in TSL fallback in the WebGPU renderer —
 * no GLSL is involved, no per-frame compilation attempt, no flicker.
 *
 * Accepted tradeoff: LineBasicMaterial does not support variable line width
 * (hardware caps linewidth at 1px on most WebGL/WebGPU drivers). Edge lines
 * render at 1px in the 3D viewport. Documentation view line weights are handled
 * by the sheet/view rendering subsystem, not by this builder.
 *
 * Design principles (per Contract §01 / §05 / §09):
 *  - Pure projection function: no store access, no side-effects.
 *  - Returns THREE.Object3D so callers (WallFragmentBuilder) do not need to
 *    know the concrete line object type.
 *  - userData.role = 'edges', userData.elementType = 'WallEdges' preserved
 *    exactly — consumed by WallEdgeVisibilityService and VGSceneApplicator.
 *  - renderOrder = 1 + depthWrite = false prevent Z-fighting against the wall face (Doc 22).
 *  - Threshold angle of 15° means only true face-transition edges are drawn.
 *
 * ── B2: renderMode parameter ────────────────────────────────────────────────
 * renderMode controls the visual treatment of the edge overlay:
 *  - '3d'  (default): subtle dark-grey lines for 3D perspective views.
 *            depthTest=true, depthWrite=false, renderOrder=1.
 *            Edges are hidden by default in 3D view (WallEdgeVisibilityService).
 *  - 'plan': crisp black lines for plan-view white-background legibility.
 *            depthTest=false, depthWrite=false, renderOrder=999.
 *            The white B1 background (#ffffff) requires maximum contrast (0x000000).
 *
 * To switch an existing edge overlay between modes at runtime, use
 * applyWallEdgeRenderMode(). WallEdgeVisibilityService.applyRenderMode() calls
 * this on the full scene when the view-activated event fires.
 */

/**
 * Render-mode descriptor for wall edge overlays.
 * '3d'  — default, subtle grey, depth-tested, renderOrder=1.
 * 'plan' — sharp black, no depth-test, renderOrder=999 (always on top in plan view).
 */
export type WallEdgeRenderMode = 'plan' | '3d';

/**
 * Material settings per render mode.
 * Centralised here so WallEdgeVisibilityService.applyRenderMode()
 * and the builder itself always use the same values.
 */
export const WALL_EDGE_MODE_SETTINGS: Record<WallEdgeRenderMode, {
    color:      number;
    depthTest:  boolean;
    depthWrite: boolean;
    renderOrder: number;
}> = {
    '3d': {
        color:       0x333333,
        depthTest:   true,
        depthWrite:  false,
        renderOrder: 1,
    },
    'plan': {
        color:       0x000000,
        depthTest:   false,
        depthWrite:  false,
        renderOrder: 999,
    },
};

/**
 * Apply a render mode to a single existing wall-edge LineSegments object.
 * Only operates on objects tagged with userData.elementType === 'WallEdges'.
 * Safe to call on any arbitrary Object3D — no-ops if the tag is missing.
 *
 * Called by WallEdgeVisibilityService.applyRenderMode() during view switches.
 */
export function applyWallEdgeRenderMode(
    obj: THREE.Object3D,
    mode: WallEdgeRenderMode
): void {
    if (
        obj.userData?.elementType !== 'WallEdges' ||
        obj.userData?.role !== 'edges'
    ) return;

    const settings = WALL_EDGE_MODE_SETTINGS[mode];
    const line = obj as THREE.LineSegments;
    const mat = line.material as THREE.LineBasicMaterial;
    if (!mat || !mat.isLineBasicMaterial) return;

    mat.color.setHex(settings.color);
    mat.depthTest  = settings.depthTest;
    mat.depthWrite = settings.depthWrite;
    mat.needsUpdate = true;
    line.renderOrder = settings.renderOrder;
}

export function buildWallEdgeOverlay(
    geometry: THREE.BufferGeometry,
    wallId: string,
    options: {
        thresholdAngle?: number;
        color?: number;
        renderMode?: WallEdgeRenderMode;
    } = {}
): THREE.Object3D {
    const thresholdAngle = options.thresholdAngle ?? 15;
    const mode           = options.renderMode ?? '3d';
    const settings       = WALL_EDGE_MODE_SETTINGS[mode];
    const colorHex       = options.color ?? settings.color;

    const edgesGeo = new THREE.EdgesGeometry(geometry, thresholdAngle);

    // Doc 22 fix: polygonOffset on LineBasicMaterial sets depthBias in the WebGPU
    // pipeline descriptor. The WebGPU spec forbids non-zero depthBias for
    // PrimitiveTopology::LineList — device.createRenderPipeline() rejects it on
    // every frame that a wall edge overlay is present, causing continuous flicker.
    // Solution: depthWrite:false is WebGPU-safe and prevents Z-fighting by
    // ensuring edge lines never compete with face geometry in the depth buffer.
    // renderOrder=1 (below) provides additional draw-order protection.
    //
    // B2: In 'plan' mode, depthTest is set to false and renderOrder=999 so that
    // edge lines always draw on top of slab and wall face geometry in the
    // top-down orthographic projection (no depth ambiguity in plan view).
    const lineMat = new THREE.LineBasicMaterial({
        color:      colorHex,
        depthTest:  settings.depthTest,
        depthWrite: settings.depthWrite,
    });

    const edgesLine = new THREE.LineSegments(edgesGeo, lineMat);
    edgesLine.renderOrder = settings.renderOrder;
    // Edges are hidden by default in 3D view.
    // WallEdgeVisibilityService (via view-activated) enables them for plan views.
    edgesLine.visible = false;

    edgesLine.userData = {
        id: wallId,
        parentId: wallId,
        elementType: 'WallEdges',
        role: 'edges',
        selectable: false,
    };

    return edgesLine;
}
