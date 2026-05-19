/**
 * PreviewStyle.ts — Single source of truth for tool preview ("ghost") visuals.
 *
 * Every architecture / MEP creation tool (Wall, CurtainWall, Handrail, Slab,
 * Floor, Ceiling, Door, Window, Column, etc.) draws a live preview of the
 * element being placed. Until 2026-04-23 each tool defined its own materials
 * inline, with inconsistent colours, opacities and (worst) some tools omitting
 * the 3D body entirely so the user only saw a thin line.
 *
 * This module standardises:
 *
 *   1. Ghost body material — translucent shaded box used for any extruded /
 *      3D element body (wall, curtain wall, handrail, column, door, window,
 *      slab thickness preview, …). Opacity 0.4, depthWrite off, double-sided.
 *      ⚠ Pure-white background contract: opacity values < 1 only render
 *      correctly because RenderPipelineManager outputs a "presence" alpha
 *      (1 wherever any geometry is drawn, 0 elsewhere). Do NOT set opacity
 *      to a vanishingly small value here — translucent ghosts must still
 *      light up `scenePassColor.a` above the 0.0001 step threshold.
 *      See Contract §41 (`docs/00_Contracts/41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md`).
 *
 *   2. Footprint line material — bright line drawn on the floor (or storey
 *      elevation) so the user sees the path even when the body is occluded.
 *
 *   3. Marker material — solid sphere/cube placed at clicked points.
 *
 *   4. Disposal helper — every preview Object3D should be passed through
 *      `disposePreviewObject()` to release geometry + material GPU memory.
 *
 *   5. Tagging — every preview mesh / line / group MUST set
 *      `userData.isPreview = true` (read by selection, plan-view extractor,
 *      thumbnail capture, etc.). Use `tagPreview()`.
 *
 * Standard colour palette — keep in sync with `docs/element-preview.md`:
 *   - PRIMARY  0x2196f3  (blue)        — geometric building elements: wall,
 *                                         curtain wall, handrail, slab, floor,
 *                                         ceiling, opening
 *   - HOSTED   0x4CAF50  (green)       — wall-hosted: door, window
 *   - VOLUME   0x6600ff  (deep purple) — point-placed volumes: column
 *   - MEP      0xA855F7  (violet)      — AI ghost layer
 *   - OBJECT   0x8B5CF6  (PRYZM purple) — every object placed via the
 *                                          Furniture carousel and its sister
 *                                          tools (Furniture, Plumbing,
 *                                          Lighting, Kitchen, Decor, Outdoor,
 *                                          Bathroom, Soft Furnishings).
 *                                          See Contract §41 §3.1 — Object
 *                                          Placement Preview Standard.
 *
 * Standard preview opacity:
 *   - 0.40 default body opacity (PRIMARY/HOSTED/VOLUME/MEP).
 *   - 0.55 OBJECT placement opacity — matches PlumbingTool / FurnitureDragDrop
 *     and is the value Contract §41 §3.1 mandates for every carousel-placed
 *     element so all "ghost-before-create" feedback reads identically.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Colour palette ──────────────────────────────────────────────────────────

export const PREVIEW_COLOR = {
    PRIMARY: 0x2196f3,
    HOSTED:  0x4CAF50,
    VOLUME:  0x6600ff,
    MEP:     0xA855F7,
    /**
     * PRYZM brand purple — used for every "object placement" ghost (carousel
     * drops, click-to-place flows). See Contract §41 §3.1.
     */
    OBJECT:  0x8B5CF6,
} as const;

/**
 * Standard opacity for OBJECT-placement previews — see Contract §41 §3.1.
 */
export const OBJECT_PREVIEW_OPACITY = 0.55;

export type PreviewColor = number;

// ── Material factories ──────────────────────────────────────────────────────

export interface GhostBodyOptions {
    color?: PreviewColor;
    opacity?: number;
}

/**
 * Standard translucent ghost body material — use for any 3D extruded preview
 * (wall body, curtain-wall body, handrail body, column, door, window, slab,
 * floor thickness, …).
 *
 * Default opacity 0.4 matches the Wall reference implementation.
 * Caller owns the returned material and must `dispose()` it via
 * `disposePreviewObject()` (or directly).
 */
export function createGhostBodyMaterial(opts: GhostBodyOptions = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color:       opts.color   ?? PREVIEW_COLOR.PRIMARY,
        transparent: true,
        opacity:     opts.opacity ?? 0.4,
        depthWrite:  false,
        side:        THREE.DoubleSide,
    });
}

/**
 * Standard "object placement" ghost material — use for every element placed
 * via the Furniture carousel and its sister tools (Furniture, Plumbing,
 * Lighting, Kitchen, Decor, Outdoor, Bathroom, Soft Furnishings).
 *
 * Color: PREVIEW_COLOR.OBJECT (PRYZM purple 0x8B5CF6).
 * Opacity: OBJECT_PREVIEW_OPACITY (0.55) — matches PlumbingTool and
 * FurnitureDragDropHandler so every ghost-before-create feedback reads
 * identically across the application.
 *
 * See Contract §41 §3.1 — Object Placement Preview Standard.
 */
export function createObjectPreviewMaterial(opts: GhostBodyOptions = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color:       opts.color   ?? PREVIEW_COLOR.OBJECT,
        transparent: true,
        opacity:     opts.opacity ?? OBJECT_PREVIEW_OPACITY,
        depthWrite:  false,
        side:        THREE.DoubleSide,
    });
}

/**
 * Footprint line material — bright unshaded line for path / outline
 * previews drawn on (or just above) the active storey floor.
 */
export function createFootprintLineMaterial(color: PreviewColor = PREVIEW_COLOR.PRIMARY): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
        color,
        // linewidth is honoured only in WebGPU line rasterisation; harmless on WebGL.
        linewidth: 2,
    });
}

/**
 * Marker material — solid unshaded sphere at clicked snap points.
 */
export function createMarkerMaterial(color: PreviewColor = PREVIEW_COLOR.PRIMARY): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color });
}

// ── Tagging ─────────────────────────────────────────────────────────────────

/**
 * Tag an object as a preview. Sets `userData.isPreview = true` on the object
 * and every descendant. Required by selection, plan-view extractor and
 * thumbnail capture so they can skip preview geometry.
 */
export function tagPreview<T extends THREE.Object3D>(obj: T): T {
    obj.traverse(o => {
        o.userData.isPreview = true;
    });
    obj.userData.isPreview = true;
    return obj;
}

// ── Disposal ────────────────────────────────────────────────────────────────

/**
 * Recursively dispose a preview Object3D's geometries and materials and
 * remove it from its parent. Safe to call with `null`.
 */
export function disposePreviewObject(obj: THREE.Object3D | null): void {
    if (!obj) return;
    obj.traverse(o => {
        const m = o as THREE.Mesh & THREE.Line;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as any).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else if (mat) mat.dispose();
    });
    if (obj.parent) obj.parent.remove(obj);
}

// ── Ghost body builder ──────────────────────────────────────────────────────

export interface GhostBoxOptions extends GhostBodyOptions {
    /** Length along the start→end axis. */
    length: number;
    /** Vertical extrusion height. */
    height: number;
    /** Thickness perpendicular to the start→end axis. */
    thickness: number;
}

/**
 * Build a standard extruded ghost box positioned and oriented along a
 * start→end segment at the given floor elevation. Used by Wall, CurtainWall,
 * Handrail and any other "extrude a box between two points" tool.
 *
 * The mesh is tagged as a preview and ready to add to the scene.
 * Caller is responsible for disposal (use `disposePreviewObject`).
 */
export function createGhostBoxBetween(
    start: THREE.Vector3,
    end: THREE.Vector3,
    elevation: number,
    opts: GhostBoxOptions,
): THREE.Mesh {
    const geo = new THREE.BoxGeometry(opts.length, opts.height, opts.thickness);
    const mat = createGhostBodyMaterial({ color: opts.color, opacity: opts.opacity });
    const mesh = new THREE.Mesh(geo, mat);

    const cx = (start.x + end.x) * 0.5;
    const cz = (start.z + end.z) * 0.5;
    mesh.position.set(cx, elevation + opts.height * 0.5, cz);

    const angle = Math.atan2(end.x - start.x, end.z - start.z);
    mesh.rotation.y = angle + Math.PI / 2;

    return tagPreview(mesh);
}

/**
 * Build a footprint line just above the floor between two points.
 * Y is bumped by 5 mm to avoid z-fighting with the floor / grid.
 */
export function createFootprintLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    elevation: number,
    color: PreviewColor = PREVIEW_COLOR.PRIMARY,
): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(start.x, elevation + 0.005, start.z),
        new THREE.Vector3(end.x,   elevation + 0.005, end.z),
    ]);
    const line = new THREE.Line(geo, createFootprintLineMaterial(color));
    return tagPreview(line);
}
