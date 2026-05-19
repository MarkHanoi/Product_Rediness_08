/**
 * CurtainPanelFactory
 *
 * Single source of truth for the catalogue of curtain wall panel types.
 * Provides:
 *   - PANEL_DEFINITIONS: registry of all panel types (label, legend colour,
 *     batchability, build function) used by the Builder, InstanceManager, and UI.
 *   - buildPanelObject(): factory-style builder that produces the THREE.Object3D
 *     for any non-batchable panel type at LOD 400.
 *
 * ## Why a factory
 *
 * The original Phase 1 implementation hard-coded three panel types
 * (Glass / Opaque / Empty) inside CurtainPanelBuilder, CurtainWallInstanceManager
 * and the property-panel widgets. Adding a new panel type required edits in
 * five files and silent breakage if any was missed.
 *
 * The factory inverts the dependency: each panel type lives as one record in
 * PANEL_DEFINITIONS — the Builder, InstanceManager, and UI all read from this
 * registry. New types are added by appending one entry.
 *
 * ## Contract Compliance (§04)
 *
 *   - Pure projection: factory writes nothing to stores.
 *   - Cell-local coordinates: every Object3D returned is positioned in the
 *     curtain wall group's local space (X: -length/2..+length/2, Y: 0..height).
 *   - userData: every returned root Object3D carries the §Step 6 SelectionManager
 *     contract so panel sub-element selection still works.
 *   - canBatch=true types must remain dimensionally uniform (1×1×panelThickness
 *     base geometry) — they are rendered by CurtainWallInstanceManager.
 *   - canBatch=false types are rendered individually by CurtainPanelBuilder
 *     via this factory's build() function.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CurtainCell } from './CurtainCellComputer';
import {
    CurtainPanelData,
    CurtainPanelHostedDoor,
    DEFAULT_HOSTED_DOOR,
    PANEL_TYPE_DEFAULTS,
    PanelType,
} from './CurtainPanelTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelBuildContext {
    cell: CurtainCell;
    panelData: CurtainPanelData;
    /** Mullion thickness (used to inset panel edges or for alignment). */
    mullionSize: number;
    /** Z-depth of the flat panel geometry. */
    panelThickness: number;
    /** Propagated for ViewRangeFilterService — not used by geometry. */
    levelId?: string;
}

export interface PanelDefinition {
    /** Stable PanelType identifier. */
    id: PanelType;
    /** Short display label (UI legend / popover). */
    label: string;
    /** One-character glyph for compact cell badges. */
    initial: string;
    /** Legend swatch colour (CSS hex). */
    legendColor: string;
    /**
     * If true, this type can be rendered via CurtainWallInstanceManager
     * (1 InstancedMesh per type per wall). Reserved for dimensionally-uniform
     * flat panels (Glass / Opaque). All complex LOD-400 types set this to false.
     */
    canBatch: boolean;
    /**
     * Builds the panel Object3D in cell-local coordinates.
     * Returns null for types that render no geometry (Empty), or for batchable
     * types that defer to the InstanceManager.
     */
    build: (ctx: PanelBuildContext) => THREE.Object3D | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared materials (module-level cache to keep draw cost low)
// ─────────────────────────────────────────────────────────────────────────────

const _hingeMat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa, roughness: 0.2, metalness: 0.85,
});

// ── Wooden slat panel materials ──
// Two wood tones are used across the four panel types:
//   - "light" oak/teak frame  (frames + posts on Image 1, posts on Image 3)
//   - "dark"  walnut/wenge    (slats on all four panels, dense frame on Image 2,
//                              horizontal slats on Image 4)
const _woodLightMat = new THREE.MeshStandardMaterial({
    color: 0xb98a55, roughness: 0.72, metalness: 0.0,
});
const _woodDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3d2818, roughness: 0.68, metalness: 0.0,
});
const _woodMahoganyMat = new THREE.MeshStandardMaterial({
    color: 0x4a2418, roughness: 0.65, metalness: 0.0,
});
const _woodWengeRedMat = new THREE.MeshStandardMaterial({
    color: 0x5a2618, roughness: 0.65, metalness: 0.0,
});
// Brushed steel rod used for the horizontal-slat panel verticals.
const _steelRodMat = new THREE.MeshStandardMaterial({
    color: 0xcfd2d4, roughness: 0.32, metalness: 0.85,
});
// Polished steel cap used at top/bottom of the steel verticals.
const _steelCapMat = new THREE.MeshStandardMaterial({
    color: 0xe6e8ea, roughness: 0.18, metalness: 0.95,
});

// ── Architectural fabric / shading materials (Phase 4) ──
// Double-sided, slightly translucent, matte: when light hits one face the back
// face transmits a bit of colour through, giving the soft "fabric glow" the
// curtain panels need. Colours are warm off-white / linen.
function makeFabricMaterial(color: number, opacity: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        // emissive nudge approximates back-face translucency without a custom shader
        emissive: new THREE.Color(color).multiplyScalar(0.18),
        emissiveIntensity: 1.0,
    });
}
const _curtainCornerFoldMat   = makeFabricMaterial(0xefe9d8, 0.92);
const _curtainFlatMat         = makeFabricMaterial(0xf2ece0, 0.88);
const _curtainOrganicMat      = makeFabricMaterial(0xeae3d0, 0.86);
const _curtainSideMat         = makeFabricMaterial(0xece5d2, 0.9);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface CellRect {
    xLeft: number;  xRight: number;
    yBottom: number; yTop: number;
    cx: number;     cyMid: number;
    cellW: number;  cellH: number;
}

function cellRect(cell: CurtainCell): CellRect {
    const bl = cell.corners[0];
    const tr = cell.corners[2];
    return {
        xLeft: bl.x, xRight: tr.x,
        yBottom: bl.y, yTop: tr.y,
        cx: (bl.x + tr.x) / 2,
        cyMid: (bl.y + tr.y) / 2,
        cellW: cell.width,
        cellH: cell.height,
    };
}

function stampUserData(
    obj: THREE.Object3D,
    panelData: CurtainPanelData,
    levelId: string | undefined,
    extra: Record<string, any> = {},
): void {
    obj.userData = {
        elementId:    panelData.id,
        elementType:  'CurtainPanel',
        modelId:      'model-default',
        panelType:    panelData.panelType,
        curtainWallId: panelData.curtainWallId,
        cellIndex:    panelData.cellIndex,
        isSubElement: true,
        parentId:     panelData.curtainWallId,
        selectable:   true,
        ...(levelId !== undefined ? { levelId } : {}),
        ...extra,
    };
}

function addBox(
    group: THREE.Group,
    w: number, h: number, d: number,
    px: number, py: number, pz: number,
    mat: THREE.Material,
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

/** Glass / Opaque — flat inset panel with optional materialOverride. */
function buildFlatPanel(ctx: PanelBuildContext): THREE.Mesh {
    const { cell, panelData, mullionSize, panelThickness } = ctx;
    const defaults = PANEL_TYPE_DEFAULTS[panelData.panelType];

    const panelWidth  = Math.max(0.01, cell.width  - mullionSize);
    const panelHeight = Math.max(0.01, cell.height - mullionSize);

    let color = defaults.color;
    if (panelData.materialOverride) {
        try { color = new THREE.Color(panelData.materialOverride).getHex(); }
        catch { /* ignore — fall back to type default */ }
    }

    const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: defaults.transparent,
        opacity:     defaults.opacity,
        metalness:   defaults.metalness,
        roughness:   defaults.roughness,
        side:        defaults.transparent ? THREE.DoubleSide : THREE.FrontSide,
    });

    const geo = new THREE.BoxGeometry(panelWidth, panelHeight, panelThickness);
    const mesh = new THREE.Mesh(geo, mat);

    const r = cellRect(cell);
    mesh.position.set(r.cx, r.cyMid, 0);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    stampUserData(mesh, panelData, ctx.levelId);
    return mesh;
}

/**
 * Hosted curtain panel door (Revit-style: door inside a curtain cell).
 * Components: top rail, left/right stiles, optional sill rail, leaf, hinge pips.
 */
function buildDoorObject(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData, panelThickness } = ctx;
    const door: CurtainPanelHostedDoor = {
        ...DEFAULT_HOSTED_DOOR,
        ...(panelData.hostedDoor ?? {}),
    };
    const r = cellRect(cell);
    const ft    = Math.max(0.03, door.frameThickness);
    const depth = panelThickness;

    const group = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(door.frameColor), roughness: 0.5, metalness: 0.1,
    });
    const leafMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(door.leafColor), roughness: 0.6, metalness: 0.05,
    });

    // Top rail
    addBox(group, r.cellW, ft, depth, r.cx, r.yTop - ft / 2, 0, frameMat);
    // Left + right stiles
    addBox(group, ft, r.cellH, depth, r.xLeft + ft / 2,  r.cyMid, 0, frameMat);
    addBox(group, ft, r.cellH, depth, r.xRight - ft / 2, r.cyMid, 0, frameMat);
    // Sill rail (only if sillHeight > 0)
    if (door.sillHeight > 0.005) {
        addBox(group,
            r.cellW - ft * 2, door.sillHeight, depth,
            r.cx, r.yBottom + door.sillHeight / 2, 0, frameMat);
    }
    // Door leaf
    const openingW = r.cellW - ft * 2;
    const openingH = r.cellH - ft - door.sillHeight;
    const leafW    = Math.max(0.01, openingW - 0.008);
    const leafH    = Math.max(0.01, openingH - 0.008);
    const leafCY   = r.yBottom + door.sillHeight + leafH / 2;
    addBox(group, leafW, leafH, depth * 0.7, r.cx, leafCY, 0, leafMat);

    // Hinge pips
    const hingeX = door.hingesSide === 'left' ? r.xLeft + ft / 2 : r.xRight - ft / 2;
    const hingeR = Math.min(0.018, ft * 0.35);
    const hingeGeo = new THREE.CylinderGeometry(hingeR, hingeR, ft * 0.6, 8);
    for (const frac of [0.25, 0.75]) {
        const hinge = new THREE.Mesh(hingeGeo, _hingeMat);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(hingeX, r.yBottom + openingH * frac, depth / 2 + 0.002);
        group.add(hinge);
    }

    stampUserData(group, panelData, ctx.levelId, { isDoorPanel: true });
    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wooden slat panel builders (LOD 400)
// ─────────────────────────────────────────────────────────────────────────────
//
// These four builders share a common visual language:
//   • Slats are modelled as box volumes (rectangular cross-section), not
//     half-cylinders, because all four reference images show flat-faced
//     timber slats with a clear depth.
//   • Slat pitch and count adapt to the cell size so the panel reads as the
//     same "system" regardless of grid spacing.
//   • Frame elements (where present) are inset by mullion size so the panel
//     fits inside the curtain wall mullion grid without z-fighting.
//
// Layout convention for vertical-slat panels:
//   z = 0           → centreline of the cell / curtain wall plane
//   z = +panelThickness/2  → outward (street) face
// Slats sit at z = +panelThickness*0.15 so they sit slightly proud of the
// frame back, matching the relief seen in the reference renders.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SystemPanel_SlatsVerticalFramed (Reference Image 1).
 *
 * Light-wood (oak/teak) rectangular frame around the cell with a row of
 * darker vertical slats spanning the full inner height. The frame sits
 * slightly proud of the slats and has a thin top/bottom rail and slim
 * side stiles. Slat count adapts to cell width so spacing stays uniform.
 */
function buildSlatsVerticalFramed(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData, mullionSize, panelThickness } = ctx;
    const r = cellRect(cell);
    const group = new THREE.Group();

    const ft       = Math.max(0.04,  mullionSize * 0.9);   // frame thickness
    const fd       = panelThickness;                        // frame depth (full)
    const innerW   = Math.max(0.01, r.cellW - ft * 2);
    const innerH   = Math.max(0.01, r.cellH - ft * 2);
    const innerCy  = r.cyMid;

    // ── Light-wood outer frame (top, bottom, left stile, right stile) ──
    addBox(group, r.cellW, ft, fd, r.cx,            r.yTop    - ft / 2, 0, _woodLightMat);
    addBox(group, r.cellW, ft, fd, r.cx,            r.yBottom + ft / 2, 0, _woodLightMat);
    addBox(group, ft, innerH, fd, r.xLeft  + ft / 2, innerCy,            0, _woodLightMat);
    addBox(group, ft, innerH, fd, r.xRight - ft / 2, innerCy,            0, _woodLightMat);

    // ── Dark vertical slats inside the frame ──
    // Target slat width ≈ 50 mm, gap ≈ 30 mm. Pitch ≈ 80 mm.
    const targetPitch = 0.08;
    const slatCount   = Math.max(3, Math.round(innerW / targetPitch));
    const pitch       = innerW / slatCount;
    const slatW       = pitch * 0.55;                        // ~55% solid, ~45% gap
    const slatD       = panelThickness * 0.55;
    const slatZ       = panelThickness * 0.10;               // sit forward of frame back

    const xLeftInside = r.xLeft + ft;
    for (let s = 0; s < slatCount; s++) {
        const sx = xLeftInside + pitch * (s + 0.5);
        addBox(group, slatW, innerH, slatD, sx, innerCy, slatZ, _woodDarkMat);
    }

    stampUserData(group, panelData, ctx.levelId);
    return group;
}

/**
 * SystemPanel_SlatsVerticalDense (Reference Image 2).
 *
 * Dark-mahogany frame on all four sides + a dense field of vertical slats
 * (≈ same tone as the frame). Higher slat count and slimmer gaps than the
 * "Framed" variant. Frame is slightly thicker than the slats so it reads
 * as a continuous rectangular border.
 */
function buildSlatsVerticalDense(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData, mullionSize, panelThickness } = ctx;
    const r = cellRect(cell);
    const group = new THREE.Group();

    const ft     = Math.max(0.045, mullionSize * 1.0);
    const fd     = panelThickness;
    const innerW = Math.max(0.01, r.cellW - ft * 2);
    const innerH = Math.max(0.01, r.cellH - ft * 2);

    // ── Mahogany outer frame ──
    addBox(group, r.cellW, ft, fd, r.cx,           r.yTop    - ft / 2, 0, _woodMahoganyMat);
    addBox(group, r.cellW, ft, fd, r.cx,           r.yBottom + ft / 2, 0, _woodMahoganyMat);
    addBox(group, ft, innerH, fd, r.xLeft  + ft/2, r.cyMid,            0, _woodMahoganyMat);
    addBox(group, ft, innerH, fd, r.xRight - ft/2, r.cyMid,            0, _woodMahoganyMat);

    // ── Dense vertical slats ──
    // Target slat width ≈ 35 mm, gap ≈ 25 mm. Pitch ≈ 60 mm.
    const targetPitch = 0.06;
    const slatCount   = Math.max(5, Math.round(innerW / targetPitch));
    const pitch       = innerW / slatCount;
    const slatW       = pitch * 0.58;
    const slatD       = panelThickness * 0.5;
    const slatZ       = panelThickness * 0.10;

    const xLeftInside = r.xLeft + ft;
    for (let s = 0; s < slatCount; s++) {
        const sx = xLeftInside + pitch * (s + 0.5);
        addBox(group, slatW, innerH, slatD, sx, r.cyMid, slatZ, _woodMahoganyMat);
    }

    stampUserData(group, panelData, ctx.levelId);
    return group;
}

/**
 * SystemPanel_SlatsVerticalOpen (Reference Image 3).
 *
 * Open vertical posts (no continuous frame) joined by small triangular
 * "shelf" brackets at three discrete heights. Posts are light wood; the
 * triangular brackets are also light wood and project outward from the
 * front face of the post grid. The top of every post is capped with a
 * lighter end-grain block (visible in the reference image).
 *
 * No back plate — the reference panel is intentionally see-through.
 */
function buildSlatsVerticalOpen(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData, mullionSize, panelThickness } = ctx;
    const r = cellRect(cell);
    const group = new THREE.Group();

    // Posts span the full cell height. Use a slightly inset margin so the
    // posts don't collide with adjacent mullions.
    const margin   = mullionSize * 0.5;
    const fieldW   = Math.max(0.01, r.cellW - margin * 2);
    const xLeftIn  = r.xLeft  + margin;

    // Slimmer profile than the other slat panels — posts read as elegant
    // sticks in the reference (≈ 40×40 mm, 50 mm pitch gap).
    const postW    = 0.045;
    const postD    = panelThickness * 0.85;
    const targetPitch = 0.10;
    const postCount   = Math.max(4, Math.round(fieldW / targetPitch));
    const pitch       = fieldW / postCount;

    // ── Vertical posts ──
    const postZ = 0;
    const postCenters: number[] = [];
    for (let s = 0; s < postCount; s++) {
        const sx = xLeftIn + pitch * (s + 0.5);
        postCenters.push(sx);
        addBox(group, postW, r.cellH, postD, sx, r.cyMid, postZ, _woodDarkMat);
        // Light end-grain cap at the very top of each post (visible in the ref).
        addBox(group, postW * 1.05, postW * 0.6, postD * 1.05,
            sx, r.yTop - postW * 0.3, postZ, _woodLightMat);
    }

    // ── Triangular cross-blocks between adjacent posts ──
    // The reference shows three rows of small triangular wedges that sit
    // between every pair of posts, alternating row by row to form a subtle
    // trellis. We model them as slim right-angle prisms (rendered as boxes
    // with a tapered profile via Shape extrusion).
    const rowFractions = [0.25, 0.50, 0.75];
    const blockH       = postW * 1.6;
    const blockD       = postD * 0.9;
    for (let row = 0; row < rowFractions.length; row++) {
        const yBlock = r.yBottom + r.cellH * rowFractions[row];
        for (let s = 0; s < postCenters.length - 1; s++) {
            // Alternate which side of the gap the wedge attaches to.
            const onLeft = (row + s) % 2 === 0;
            const xA = postCenters[s];
            const xB = postCenters[s + 1];
            const gap = xB - xA - postW;
            if (gap <= 0) continue;
            const wedgeW = gap * 0.9;
            const wedgeCx = onLeft
                ? xA + postW / 2 + wedgeW / 2
                : xB - postW / 2 - wedgeW / 2;

            // Build a simple right-triangle profile in the X/Y plane and
            // extrude through the post depth — gives the wedge silhouette
            // visible in the reference image.
            const shape = new THREE.Shape();
            if (onLeft) {
                shape.moveTo(-wedgeW / 2, -blockH / 2);
                shape.lineTo( wedgeW / 2, -blockH / 2);
                shape.lineTo(-wedgeW / 2,  blockH / 2);
            } else {
                shape.moveTo(-wedgeW / 2, -blockH / 2);
                shape.lineTo( wedgeW / 2, -blockH / 2);
                shape.lineTo( wedgeW / 2,  blockH / 2);
            }
            shape.closePath();
            const wedgeGeo = new THREE.ExtrudeGeometry(shape, {
                depth: blockD, bevelEnabled: false,
            });
            const wedge = new THREE.Mesh(wedgeGeo, _woodLightMat);
            wedge.position.set(wedgeCx, yBlock, -blockD / 2);
            wedge.castShadow = true;
            wedge.receiveShadow = true;
            group.add(wedge);
        }
    }

    stampUserData(group, panelData, ctx.levelId);
    return group;
}

/**
 * SystemPanel_SlatsHorizontal (Reference Image 4).
 *
 * Horizontal wooden slats (deep wenge-red) stacked between three (or more)
 * thin vertical brushed-steel rods. Each steel rod is capped at the top
 * and bottom with a polished steel button. The slats are densely packed
 * with a small gap (≈ 8 mm) between them, exactly as in the reference.
 */
function buildSlatsHorizontal(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData, mullionSize, panelThickness } = ctx;
    const r = cellRect(cell);
    const group = new THREE.Group();

    const margin = mullionSize * 0.5;
    const fieldW = Math.max(0.01, r.cellW - margin * 2);
    const fieldH = Math.max(0.01, r.cellH - margin * 2);

    // ── Vertical steel rods (3 by default; scale with width) ──
    const rodCount = Math.max(2, Math.round(fieldW / 0.45) + 1); // ≈ 1 rod per 45 cm
    const rodR     = 0.012;
    const rodGeo   = new THREE.CylinderGeometry(rodR, rodR, r.cellH * 1.02, 12);
    const rodPositions: number[] = [];
    for (let i = 0; i < rodCount; i++) {
        // Inset the outer rods so they don't touch the mullions.
        const t = rodCount === 1 ? 0.5 : i / (rodCount - 1);
        const inset = 0.06;
        const sx = r.xLeft + margin + inset + (fieldW - inset * 2) * t;
        rodPositions.push(sx);
        const rod = new THREE.Mesh(rodGeo, _steelRodMat);
        rod.position.set(sx, r.cyMid, panelThickness * 0.05);
        rod.castShadow = true; rod.receiveShadow = true;
        group.add(rod);

        // Polished steel caps top + bottom (visible buttons in the reference).
        const capR = rodR * 2.2;
        const capGeo = new THREE.CylinderGeometry(capR, capR, rodR * 1.6, 16);
        const capTop = new THREE.Mesh(capGeo, _steelCapMat);
        capTop.position.set(sx, r.yTop    + capR * 0.3, panelThickness * 0.05);
        const capBot = new THREE.Mesh(capGeo, _steelCapMat);
        capBot.position.set(sx, r.yBottom - capR * 0.3, panelThickness * 0.05);
        group.add(capTop, capBot);
    }

    // ── Horizontal wenge-red slats stacked top-to-bottom ──
    // Slats span the rod field horizontally with a small overhang past the
    // outer rods so the rods read as sandwiched between front/back faces of
    // each slat (matches the reference detail).
    const slatThicknessY = 0.025;          // ≈ 25 mm tall slats
    const slatGapY       = 0.008;          // ≈ 8 mm gap between slats
    const slatPitch      = slatThicknessY + slatGapY;
    const slatCount      = Math.max(8, Math.floor(fieldH / slatPitch));
    const slatStackH     = slatCount * slatPitch - slatGapY;
    const slatStartY     = r.cyMid - slatStackH / 2 + slatThicknessY / 2;

    // Slat width: from leftmost rod − overhang to rightmost rod + overhang.
    const overhang = 0.04;
    const xMin = (rodPositions[0] ?? r.xLeft + margin) - overhang;
    const xMax = (rodPositions[rodPositions.length - 1] ?? r.xRight - margin) + overhang;
    const slatW = Math.max(0.01, xMax - xMin);
    const slatCx = (xMin + xMax) / 2;
    const slatD  = panelThickness * 0.65;

    for (let i = 0; i < slatCount; i++) {
        const sy = slatStartY + i * slatPitch;
        addBox(group, slatW, slatThicknessY, slatD, slatCx, sy, 0, _woodWengeRedMat);
    }

    stampUserData(group, panelData, ctx.levelId);
    return group;
}


// ─────────────────────────────────────────────────────────────────────────────
// Architectural fabric / shading panel builders (Phase 4 — LOD 400)
// ─────────────────────────────────────────────────────────────────────────────
//
// Design rules (per spec):
//   • Procedural vertex deformation, no cloth simulation.
//   • Low-poly meshes — silhouette + shader carry the look.
//   • All curtain meshes use a translucent double-sided material so light hits
//     both faces (the "fabric glow" trick).
//   • Geometry is built in cell-local coordinates with z=0 on the wall plane.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SystemPanel_CurtainCornerFold — two quads meeting at a vertical centre hinge,
 * each folded forward (+Z) by `foldDepth`. Produces an inverted-V profile when
 * viewed from above. Hard edges across the hinge (no normal smoothing).
 *
 * Vertex layout:
 *     v0 ─────── v1 (= v4) ─────── v5
 *     |          |                  |
 *     |   left   |     right        |
 *     |   quad   |     quad         |
 *     v2 ─────── v3 (= v6) ─────── v7
 * Where v1/v4 and v3/v6 sit at z = +foldDepth (the hinge ridge).
 */
function buildCurtainCornerFold(ctx: PanelBuildContext): THREE.Mesh {
    const { cell, panelData, panelThickness } = ctx;
    const r = cellRect(cell);
    const halfW = r.cellW / 2;
    const foldDepth = Math.max(panelThickness, Math.min(r.cellW, r.cellH) * 0.10);

    const geo = new THREE.BufferGeometry();
    // 8 vertices, 4 per quad, hinge vertices duplicated → flat shading at the hinge
    const positions = new Float32Array([
        // left quad: top-left → top-hinge → bottom-left → bottom-hinge
        -halfW, r.yTop,    0,
         0,    r.yTop,    foldDepth,
        -halfW, r.yBottom, 0,
         0,    r.yBottom, foldDepth,
        // right quad: top-hinge → top-right → bottom-hinge → bottom-right
         0,    r.yTop,    foldDepth,
         halfW, r.yTop,    0,
         0,    r.yBottom, foldDepth,
         halfW, r.yBottom, 0,
    ]);
    // Translate the X coordinates to cell space
    for (let i = 0; i < positions.length; i += 3) positions[i] += r.cx;

    const indices = new Uint16Array([
        0, 2, 3,  0, 3, 1,         // left quad
        4, 6, 7,  4, 7, 5,         // right quad
    ]);
    const uvs = new Float32Array([
        0, 1,  0.5, 1,  0, 0,  0.5, 0,
        0.5, 1,  1, 1,  0.5, 0,  1, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, _curtainCornerFoldMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stampUserData(mesh, panelData, ctx.levelId);
    return mesh;
}

/**
 * SystemPanel_CurtainFlat — single planar fabric quad covering the cell.
 * Edge fade is approximated by injecting a CSS-style smoothstep into the
 * material's fragment shader via onBeforeCompile (darker corners / sides).
 */
function buildCurtainFlat(ctx: PanelBuildContext): THREE.Mesh {
    const { cell, panelData, panelThickness } = ctx;
    const r = cellRect(cell);
    const geo = new THREE.PlaneGeometry(r.cellW, r.cellH, 1, 1);

    // Per-instance material so onBeforeCompile customisation doesn't leak.
    const mat = _curtainFlatMat.clone();
    mat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <output_fragment>',
            // Soft vertical + horizontal edge fade (the "shader gradient")
            `
            float edgeX = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float edgeY = smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
            gl_FragColor.rgb *= mix(0.78, 1.0, edgeX * edgeY);
            #include <output_fragment>
            `,
        );
        // Vite/HMR safety: clear cached program id
        (mat as any).needsUpdate = true;
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(r.cx, r.cyMid, panelThickness * 0.05);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stampUserData(mesh, panelData, ctx.levelId);
    return mesh;
}

/**
 * SystemPanel_CurtainOrganic — vertex-deformed plane producing an asymmetric
 * S-curve drape. Anchored at the top, drifts sideways toward the bottom.
 *
 *   xOffset(uv) = sin(uv.y · π · 1.2) · A + sin(uv.y · 3) · B + uv.y · C
 *
 * with A = curveIntensity × 0.05 (≈ 5 cm),
 *      B = curveIntensity × 0.02,
 *      C = curveIntensity × 0.03  (asymmetric drift toward the bottom).
 */
function buildCurtainOrganic(ctx: PanelBuildContext): THREE.Mesh {
    const { cell, panelData, panelThickness } = ctx;
    const r = cellRect(cell);

    // Need enough vertical segments to read the wave smoothly; a few horizontal
    // segments so the deformation can curve in X without distorting the silhouette.
    const segX = 4;
    const segY = 32;
    const geo = new THREE.PlaneGeometry(r.cellW, r.cellH, segX, segY);

    const curveIntensity = Math.min(1.0, r.cellW * 0.6);
    const A = curveIntensity * 0.05;
    const B = curveIntensity * 0.02;
    const C = curveIntensity * 0.03;

    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        // PlaneGeometry y goes -h/2 → +h/2 (top). Convert to uv.y in [0,1] where
        // uv.y = 0 is the bottom of the curtain (free hanging end).
        const localY = pos.getY(i);
        const uvY = (localY + r.cellH / 2) / r.cellH;        // 0..1 (0 = bottom)
        // The drape is anchored at the top → fade-out the deformation as we
        // approach uv.y = 1.
        const anchor = 1.0 - Math.pow(uvY, 2.4);
        const xOffset =
            Math.sin((1.0 - uvY) * Math.PI * 1.2) * A +
            Math.sin((1.0 - uvY) * 3.0)           * B +
            (1.0 - uvY) * C;
        pos.setX(i, pos.getX(i) + xOffset * anchor);
        // Subtle z-bow forward at mid-height for a touch of volume
        const zBow = Math.sin((1.0 - uvY) * Math.PI) * panelThickness * 1.6 * anchor;
        pos.setZ(i, pos.getZ(i) + zBow);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, _curtainOrganicMat);
    mesh.position.set(r.cx, r.cyMid, panelThickness * 0.05);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stampUserData(mesh, panelData, ctx.levelId);
    return mesh;
}

/**
 * SystemPanel_CurtainSide — narrow flat fabric panel attached to one side
 * of the cell. Acts as a frame / blackout panel. Occupies ~30% of the cell
 * width and is anchored to the left edge by default. Materials override on
 * the panel data can be used to tint it dark for true blackout.
 */
function buildCurtainSide(ctx: PanelBuildContext): THREE.Mesh {
    const { cell, panelData, panelThickness } = ctx;
    const r = cellRect(cell);
    const sideWidth = r.cellW * 0.30;
    const geo = new THREE.PlaneGeometry(sideWidth, r.cellH, 1, 1);
    const mesh = new THREE.Mesh(geo, _curtainSideMat);
    // Anchor to the left — alignment is a future parameter on the panel data.
    mesh.position.set(r.xLeft + sideWidth / 2, r.cyMid, panelThickness * 0.05);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stampUserData(mesh, panelData, ctx.levelId, { sideAlign: 'left' });
    return mesh;
}

/**
 * SystemPanel_CurtainDoubleMixed — composite panel: a CornerFold occupies the
 * left half of the cell and an Organic drape occupies the right half. The two
 * sub-builders are reused with synthetic half-cell rects so their geometry
 * sits in the correct half. The composite is wrapped in a single Group whose
 * userData carries the parent panel id (the half-meshes are not selectable
 * individually — sub-element picking selects the whole composite).
 */
function buildCurtainDoubleMixed(ctx: PanelBuildContext): THREE.Group {
    const { cell, panelData } = ctx;
    const r = cellRect(cell);
    const group = new THREE.Group();

    function makeHalfCell(xLeft: number, xRight: number): CurtainCell {
        return {
            ...cell,
            corners: [
                new THREE.Vector3(xLeft,  r.yBottom, 0),
                new THREE.Vector3(xRight, r.yBottom, 0),
                new THREE.Vector3(xRight, r.yTop,    0),
                new THREE.Vector3(xLeft,  r.yTop,    0),
            ],
            width:  xRight - xLeft,
            height: r.cellH,
        };
    }

    // Left half → CornerFold
    const leftCtx: PanelBuildContext = {
        ...ctx,
        cell: makeHalfCell(r.xLeft, r.cx),
    };
    const leftMesh = buildCurtainCornerFold(leftCtx);
    leftMesh.userData = {};   // strip child userData — composite owns selection
    group.add(leftMesh);

    // Right half → Organic drape
    const rightCtx: PanelBuildContext = {
        ...ctx,
        cell: makeHalfCell(r.cx, r.xRight),
    };
    const rightMesh = buildCurtainOrganic(rightCtx);
    rightMesh.userData = {};
    group.add(rightMesh);

    stampUserData(group, panelData, ctx.levelId);
    return group;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const PANEL_DEFINITIONS: Record<PanelType, PanelDefinition> = {
    SystemPanel_Glass: {
        id: 'SystemPanel_Glass',
        label: 'Glass',
        initial: 'G',
        legendColor: '#c8e6fa',
        canBatch: true,
        build: buildFlatPanel,
    },
    SystemPanel_Opaque: {
        id: 'SystemPanel_Opaque',
        label: 'Opaque',
        initial: 'O',
        legendColor: '#7a90a0',
        canBatch: true,
        build: buildFlatPanel,
    },
    SystemPanel_Empty: {
        id: 'SystemPanel_Empty',
        label: 'Empty',
        initial: '—',
        legendColor: '#ebebeb',
        canBatch: false,
        build: () => null,
    },
    SystemPanel_Door: {
        id: 'SystemPanel_Door',
        label: 'Door',
        initial: 'D',
        legendColor: '#d4b896',
        canBatch: false,
        build: buildDoorObject,
    },
    SystemPanel_SlatsVerticalFramed: {
        id: 'SystemPanel_SlatsVerticalFramed',
        label: 'Slats Vertical (Framed)',
        initial: 'V',
        legendColor: '#b98a55',
        canBatch: false,
        build: buildSlatsVerticalFramed,
    },
    SystemPanel_SlatsVerticalDense: {
        id: 'SystemPanel_SlatsVerticalDense',
        label: 'Slats Vertical (Dense)',
        initial: 'F',
        legendColor: '#4a2418',
        canBatch: false,
        build: buildSlatsVerticalDense,
    },
    SystemPanel_SlatsVerticalOpen: {
        id: 'SystemPanel_SlatsVerticalOpen',
        label: 'Slats Vertical (Open)',
        initial: 'I',
        legendColor: '#8a6a4a',
        canBatch: false,
        build: buildSlatsVerticalOpen,
    },
    SystemPanel_SlatsHorizontal: {
        id: 'SystemPanel_SlatsHorizontal',
        label: 'Slats Horizontal',
        initial: 'H',
        legendColor: '#5a2618',
        canBatch: false,
        build: buildSlatsHorizontal,
    },
    SystemPanel_CurtainCornerFold: {
        id: 'SystemPanel_CurtainCornerFold',
        label: 'Curtain — Corner Fold',
        initial: 'C',
        legendColor: '#efe9d8',
        canBatch: false,
        build: buildCurtainCornerFold,
    },
    SystemPanel_CurtainFlat: {
        id: 'SystemPanel_CurtainFlat',
        label: 'Curtain — Flat',
        initial: 'T',
        legendColor: '#f2ece0',
        canBatch: false,
        build: buildCurtainFlat,
    },
    SystemPanel_CurtainOrganic: {
        id: 'SystemPanel_CurtainOrganic',
        label: 'Curtain — Organic Drape',
        initial: 'U',
        legendColor: '#eae3d0',
        canBatch: false,
        build: buildCurtainOrganic,
    },
    SystemPanel_CurtainSide: {
        id: 'SystemPanel_CurtainSide',
        label: 'Curtain — Side',
        initial: 'P',
        legendColor: '#ece5d2',
        canBatch: false,
        build: buildCurtainSide,
    },
    SystemPanel_CurtainDoubleMixed: {
        id: 'SystemPanel_CurtainDoubleMixed',
        label: 'Curtain — Double (Fold + Drape)',
        initial: 'M',
        legendColor: '#dcd2bd',
        canBatch: false,
        build: buildCurtainDoubleMixed,
    },
};

export function getPanelDefinition(type: PanelType): PanelDefinition {
    return PANEL_DEFINITIONS[type] ?? PANEL_DEFINITIONS.SystemPanel_Glass;
}

export function listPanelDefinitions(): PanelDefinition[] {
    return Object.values(PANEL_DEFINITIONS);
}

export function isBatchable(type: PanelType): boolean {
    return PANEL_DEFINITIONS[type]?.canBatch ?? false;
}

/**
 * Single dispatch entry-point used by CurtainPanelBuilder for non-batchable
 * panels. Returns null for SystemPanel_Empty.
 */
export function buildPanelObject(ctx: PanelBuildContext): THREE.Object3D | null {
    const def = getPanelDefinition(ctx.panelData.panelType);
    return def.build(ctx);
}
