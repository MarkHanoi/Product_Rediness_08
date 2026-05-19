/**
 * FurniturePlanToolHandler — Sprint 3 Section A (Contract 19)
 *
 * Single-click placement tool for furniture in plan view.
 *
 * Interaction model:
 *   • Moving the mouse shows a dashed 2D footprint rectangle (width × length)
 *     centred at the cursor, with a crosshair and a type label — matching the
 *     visual language used by ColumnPlanToolHandler.
 *   • One click commits the furniture at the cursor world position with 0 rotation.
 *   • Escape cancels (clears the overlay, returns to idle).
 *
 * Reads the active furniture type from:
 *   window._pryzmActiveFurnitureType   — set by ToolManager.activateFurniture()
 * Falls back to 'bed' if not set.
 *
 * Fires CreateFurnitureCommand with sensible defaults for all required fields.
 * Plan view does not support rotation at placement time — rotation defaults to 0.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import {
    isKitchenLayoutType,
    buildDefaultKitchenConfig,
    KITCHEN_DEFAULTS,
} from '@pryzm/geometry-furniture';
import {
    isWardrobeLayoutType,
    buildDefaultWardrobeCabinetConfig,
    WARDROBE_CABINET_DEFAULTS,
} from '@pryzm/geometry-furniture';
import { getDescriptorForType } from '@app/ui/furniture-carousel/FurnitureCategoryRegistry';

// ── Anchor model ──────────────────────────────────────────────────────────────
// Most furniture is built with geometry centred at the group origin, so a
// preview centred on the cursor matches the placed element exactly.
//
// CORNER SOFAS are the exception: `CornerSofaBuilder` builds the L-shape with
// its origin at the *inside-back corner* (where the two backs meet). When the
// CreateFurnitureCommand sets `position = cursor`, the sofa lands with that
// inside-back corner under the cursor — NOT centred. The preview therefore
// has to mirror two things at once: the actual L outline AND the corner anchor.
type AnchorMode = 'centre' | 'inside-back-corner';

// Inside-L corner anchor — used by corner_sofa / white_corner_sofa. Matches
// SofaPlanSymbolBuilder._buildCornerSofa() so the dashed preview outline is
// pixel-identical to the symbol that gets drawn after the click commits.
const CORNER_SOFA_DEPTH_M = 0.90; // seatDepthMain == seatDepthSide default

// ── Approximate plan-view footprint dimensions per furniture type (metres) ────
// width = X axis, length = Z axis
const FOOTPRINTS: Record<string, { w: number; l: number; h: number }> = {
    bed:                 { w: 1.60, l: 2.00, h: 0.60 },
    chair:               { w: 0.60, l: 0.60, h: 0.90 },
    table:               { w: 0.80, l: 0.80, h: 0.75 },
    sofa:                { w: 2.20, l: 0.90, h: 0.85 },
    bedside_table:       { w: 0.50, l: 0.40, h: 0.55 },
    dining_table:        { w: 0.90, l: 1.80, h: 0.75 },
    dining_chair:        { w: 0.45, l: 0.45, h: 0.90 },
    corner_sofa:         { w: 2.50, l: 2.50, h: 0.85 },
    white_corner_sofa:   { w: 2.50, l: 2.50, h: 0.85 },
    // Sofa seat variants — match WhiteSofaBuilder.DEFAULT_WIDTHS so plan-view
    // placement and 3D-panel placement produce visually identical instances.
    // Without these entries the handler falls back to DEFAULT_FOOTPRINT
    // (0.6 × 0.6) and the placed sofa appears as a tiny cube — see the
    // bug reported in attached_assets/image_1777012177573.png.
    sofa_1seat:          { w: 1.05, l: 0.95, h: 0.85 },
    sofa_2seat:          { w: 1.85, l: 0.95, h: 0.85 },
    sofa_3seat:          { w: 2.55, l: 0.95, h: 0.85 },
    white_sofa_1seat:    { w: 1.05, l: 0.95, h: 0.85 },
    white_sofa_2seat:    { w: 1.85, l: 0.95, h: 0.85 },
    white_sofa_3seat:    { w: 2.55, l: 0.95, h: 0.85 },
    // Barcelona-style — ChairBuilder.buildBarcelonaSofa reads data.width/length
    // directly with NO fallback, so a plan-tool placement that omits them
    // would build a NaN-sized mesh. Sensible defaults: low slung lounge.
    barcelona_sofa_1seat: { w: 0.95, l: 0.88, h: 0.75 },
    barcelona_sofa_2seat: { w: 1.70, l: 0.88, h: 0.75 },
    barcelona_sofa_3seat: { w: 2.40, l: 0.88, h: 0.75 },
    coffee_table:        { w: 1.20, l: 0.60, h: 0.45 },
    wardrobe:            { w: 1.20, l: 0.60, h: 2.00 },
    wardrobe_glass_door: { w: 1.20, l: 0.60, h: 2.00 },
    corner_wardrobe:     { w: 2.00, l: 2.00, h: 2.00 },
    shower_glass_panel:  { w: 0.90, l: 0.01, h: 2.00 },
    lamp:                { w: 0.30, l: 0.30, h: 1.50 },
    entrance_table:      { w: 1.00, l: 0.40, h: 0.80 },
    toilet_radiator:     { w: 0.60, l: 0.10, h: 1.50 },
    chimney:             { w: 1.00, l: 0.50, h: 2.00 },
    plant_01:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_02:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_03:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_04:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_05:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_06:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_07:            { w: 0.40, l: 0.40, h: 0.80 },
    plant_08:            { w: 0.40, l: 0.40, h: 0.80 },
    // Kitchen layouts — bounding-box footprint of the cabinet RUN built by
    // buildDefaultKitchenConfig(). Width = main run length, length = run depth.
    // L/U variants reflect the larger bounding box (main + left/right arms).
    kitchen_straight:        { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth,        h: KITCHEN_DEFAULTS.height },
    kitchen_l_shape:         { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth + 1.80, h: KITCHEN_DEFAULTS.height },
    kitchen_u_shape:         { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth + 3.60, h: KITCHEN_DEFAULTS.height },
    kitchen_island:          { w: KITCHEN_DEFAULTS.islandLength, l: KITCHEN_DEFAULTS.islandDepth * 2, h: KITCHEN_DEFAULTS.height },
    kitchen_straight_tall:   { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth,        h: KITCHEN_DEFAULTS.height },
    kitchen_l_shape_tall:    { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth + 1.80, h: KITCHEN_DEFAULTS.height },
    kitchen_u_shape_tall:    { w: KITCHEN_DEFAULTS.length, l: KITCHEN_DEFAULTS.depth + 3.60, h: KITCHEN_DEFAULTS.height },
    // Wardrobe layouts — same bounding-box logic.
    wardrobe_straight:       { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth,        h: WARDROBE_CABINET_DEFAULTS.height },
    wardrobe_l_shape:        { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth + 1.20, h: WARDROBE_CABINET_DEFAULTS.height },
    wardrobe_u_shape:        { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth + 2.40, h: WARDROBE_CABINET_DEFAULTS.height },
    wardrobe_straight_tall:  { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth,        h: WARDROBE_CABINET_DEFAULTS.height },
    wardrobe_l_shape_tall:   { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth + 1.20, h: WARDROBE_CABINET_DEFAULTS.height },
    wardrobe_u_shape_tall:   { w: WARDROBE_CABINET_DEFAULTS.length, l: WARDROBE_CABINET_DEFAULTS.depth + 2.40, h: WARDROBE_CABINET_DEFAULTS.height },
};
const DEFAULT_FOOTPRINT = { w: 0.60, l: 0.60, h: 0.90 };

const STROKE_COLOUR = '#7c3aed';   // violet-700 — distinct from column (#0891b2) and wall (#8B5CF6)
const FILL_COLOUR   = 'rgba(124,58,237,0.12)';
const DEFAULT_MATERIAL: FurnitureMaterial = 'wood';

function _getActiveType(): FurnitureType {
    return (window._pryzmActiveFurnitureType ?? 'bed') as FurnitureType;
}

/**
 * Resolve the plan-view footprint (width × length × height in metres) for a
 * furniture type. Resolution order, in priority:
 *
 *   1. **Hand-tuned overrides in FOOTPRINTS** — used for cases where the plan
 *      symbol must reflect a *group* bounding box rather than a single unit
 *      (kitchen / wardrobe RUNs, corner sofas / corner wardrobes).
 *   2. **FurnitureCategoryRegistry.defaultDimensions** — single source of
 *      truth shared with the drag-drop placement path
 *      (`FurnitureDragDropHandler` builds CreateFurnitureCommand from the same
 *      descriptor). Falling back to the registry guarantees that:
 *        • Every parametric carousel item gets a correctly sized ghost (no more
 *          0.6 × 0.6 mystery cube for trees, plumbing, carpets, kave parametrics).
 *        • The dashed preview rectangle is the same size as the geometry that
 *          will actually be built — `_commit()` sends `fp.w / fp.l / fp.h` as
 *          the command width/length/height, so preview ≡ placement by
 *          construction.
 *        • Plan-tool placement matches drag-drop placement — both read the
 *          registry, so the same item lands at the same size in either flow.
 *   3. **DEFAULT_FOOTPRINT** — last-resort fallback for an unknown type
 *      (should be unreachable for any item that appears in the carousel).
 */
function _footprint(type: string): { w: number; l: number; h: number } {
    const override = FOOTPRINTS[type];
    if (override) return override;

    const desc = getDescriptorForType(type);
    if (desc) {
        const d = desc.defaultDimensions;
        return { w: d.width, l: d.length, h: d.height };
    }

    console.warn(
        `[FurniturePlanToolHandler] No footprint or registry descriptor for type "${type}" — `
        + `using DEFAULT_FOOTPRINT 0.6×0.6×0.9. Add an entry to FurnitureCategoryRegistry.`,
    );
    return DEFAULT_FOOTPRINT;
}

function _label(type: string): string {
    return type.replace(/_/g, ' ');
}

function _anchor(type: string): AnchorMode {
    return (type === 'corner_sofa' || type === 'white_corner_sofa')
        ? 'inside-back-corner'
        : 'centre';
}

/**
 * Build the L-polygon outline (and the inside-corner notch) for a corner sofa
 * preview, in **local metres** with the inside-back corner at (0, 0). Mirrors
 * SofaPlanSymbolBuilder._buildCornerSofa() so the preview matches the symbol
 * that will be drawn after commit.
 *
 * Returns an array of polyline rings: each ring is a list of {x, z} points.
 * Outline ring is closed by the caller (no need to repeat the first point).
 */
function _cornerSofaPreviewRings(
    widthMain:  number,
    lengthSide: number,
    seatDepth:  number,
): {
    outline:        Array<{ x: number; z: number }>;
    notch:          Array<{ x: number; z: number }>;
    cornerCushion:  Array<Array<{ x: number; z: number }>>;
} {
    // Walk the L outline anti-clockwise starting at the inside-back corner (0,0).
    const outline = [
        { x: 0,             z: 0             }, // back of side ↘ inside-back corner
        { x: widthMain,     z: 0             }, // back of main ↗ right end
        { x: widthMain,     z: seatDepth     }, // right arm front
        { x: seatDepth,     z: seatDepth     }, // front of main → inside-L kink
        { x: seatDepth,     z: lengthSide    }, // front of side ↘ far arm
        { x: 0,             z: lengthSide    }, // far end of side
    ];
    // Diagonal cushion-corner notch at the inside L corner — same proportion
    // (22 %) used by SofaPlanSymbolBuilder so the two reads are identical.
    const notchM = Math.min(seatDepth, seatDepth) * 0.22;
    const notch = [
        { x: seatDepth,         z: seatDepth - notchM },
        { x: seatDepth + notchM, z: seatDepth         },
    ];
    // Corner-unit cushion outline — three additional segments closing the
    // inside-L corner zone into a complete cushion silhouette + a diagonal
    // cushion-fold seam. Mirrors SofaPlanSymbolBuilder._buildCornerSofa
    // (the "Corner unit cushion outline" block) exactly.
    const cornerCushion: Array<Array<{ x: number; z: number }>> = [
        [{ x: 0,         z: seatDepth }, { x: seatDepth, z: seatDepth }],  // (1) front edge — side-run side
        [{ x: seatDepth, z: 0         }, { x: seatDepth, z: seatDepth }],  // (2) front edge — main-run side
        [{ x: 0,         z: 0         }, { x: seatDepth, z: seatDepth }],  // (3) diagonal cushion-fold seam
    ];
    return { outline, notch, cornerCushion };
}

export class FurniturePlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null       = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx    = ctx;
        this._cursor = null;
        console.log('[FurniturePlanToolHandler] Activated, type:', _getActiveType());
    }

    deactivate(): void {
        this._clearOverlay();
        this._cursor = null;
        this._ctx    = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        this._commit(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._cursor) this._drawPreview();
    }

    private _commit(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[FurniturePlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const type = _getActiveType();
        const id   = crypto.randomUUID();

        // ── Kitchen layout types — must commit a full cabinet RUN (group of
        // units), not a single cabinet. The 3D KitchenCabinetTool builds a
        // KitchenCabinetConfig with all the arms / units populated; the plan
        // handler now uses the same shared builder so plan-view placement is
        // identical to 3D-view placement.
        if (isKitchenLayoutType(type)) {
            const cfg = buildDefaultKitchenConfig(type, 'door');
            window.runtime?.bus?.executeCommand('furniture.create', {
                id,
                furnitureType: type as FurnitureType,
                position:      { x: pt.worldX, y: 0, z: pt.worldZ },
                rotation:      { x: 0, y: 0, z: 0 },
                levelId,
                baseOffset:    0,
                width:         cfg.length,
                length:        cfg.depth,
                height:        cfg.height,
                material:      DEFAULT_MATERIAL,
                furnitureCategory: 'kitchen',
                kitchenConfig: cfg,
            })?.catch((e: unknown) => console.error('[FurniturePlanToolHandler] furniture.create (kitchen) failed:', e));
            console.log('[FurniturePlanToolHandler] Kitchen run created', id, type, 'at', pt);
            this._clearOverlay();
            return;
        }

        // ── Wardrobe layout types — same story as kitchen: must commit a
        // wardrobe RUN with sections / arms populated, not a single panel.
        if (isWardrobeLayoutType(type)) {
            const cfg = buildDefaultWardrobeCabinetConfig(type);
            window.runtime?.bus?.executeCommand('furniture.create', {
                id,
                furnitureType: type as FurnitureType,
                position:      { x: pt.worldX, y: 0, z: pt.worldZ },
                rotation:      { x: 0, y: 0, z: 0 },
                levelId,
                baseOffset:    0,
                width:         cfg.length,
                length:        cfg.depth,
                height:        cfg.height,
                material:      DEFAULT_MATERIAL,
                furnitureCategory: 'bedroom',
                wardrobeCabinetConfig: cfg,
            })?.catch((e: unknown) => console.error('[FurniturePlanToolHandler] furniture.create (wardrobe) failed:', e));
            console.log('[FurniturePlanToolHandler] Wardrobe run created', id, type, 'at', pt);
            this._clearOverlay();
            return;
        }

        // ── Plain furniture types — single primitive placement.
        const fp = _footprint(type);
        window.runtime?.bus?.executeCommand('furniture.create', {
            id,
            furnitureType: type,
            position:  { x: pt.worldX, y: 0, z: pt.worldZ },
            rotation:  { x: 0, y: 0, z: 0 },
            levelId,
            baseOffset: 0,
            width:    fp.w,
            length:   fp.l,
            height:   fp.h,
            material: DEFAULT_MATERIAL,
        })?.catch((e: unknown) => console.error('[FurniturePlanToolHandler] furniture.create failed:', e));
        console.log('[FurniturePlanToolHandler] Furniture created', id, type, 'at', pt);

        // Stay active for multi-placement — clear overlay for next click
        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || !this._cursor) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const type = _getActiveType();
        const ppu  = planCanvas.getPixelsPerUnit();
        const { sx, sy } = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);

        // Branch on anchor mode: corner sofas need an L-shape preview anchored
        // at the inside-back corner, everything else uses the centred rectangle.
        if (_anchor(type) === 'inside-back-corner') {
            this._drawCornerSofaPreview(ctx, type, sx, sy, ppu, cssH);
        } else {
            this._drawRectPreview(ctx, type, sx, sy, ppu, cssH);
        }

        ctx.restore();
    }

    /** Centred rectangle preview — used by every furniture type with a centred origin. */
    private _drawRectPreview(
        ctx:  CanvasRenderingContext2D,
        type: string,
        sx:   number,
        sy:   number,
        ppu:  number,
        cssH: number,
    ): void {
        const fp = _footprint(type);
        const hw = (fp.w / 2) * ppu;
        const hl = (fp.l / 2) * ppu;

        // Dashed footprint rectangle
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 1.5;
        ctx.fillStyle   = FILL_COLOUR;
        ctx.beginPath();
        ctx.rect(sx - hw, sy - hl, hw * 2, hl * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Corner marks (tiny filled squares at each corner — professional plan symbol)
        ctx.fillStyle = STROKE_COLOUR;
        const CORNER = 3;
        for (const [cx, cy] of [
            [sx - hw, sy - hl], [sx + hw, sy - hl],
            [sx + hw, sy + hl], [sx - hw, sy + hl],
        ] as [number, number][]) {
            ctx.fillRect(cx - CORNER / 2, cy - CORNER / 2, CORNER, CORNER);
        }

        // Centre crosshair (matches ColumnPlanToolHandler)
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.moveTo(sx - hw - 4, sy); ctx.lineTo(sx + hw + 4, sy);
        ctx.moveTo(sx, sy - hl - 4); ctx.lineTo(sx, sy + hl + 4);
        ctx.stroke();

        this._drawLabelAndHint(ctx, type, sx, sy + hl + 14, cssH);
    }

    /**
     * L-shape preview for corner_sofa / white_corner_sofa. Anchored at the
     * inside-back corner (cursor) so the dashed outline lines up exactly with
     * the actual sofa that will be drawn after the click commits.
     */
    private _drawCornerSofaPreview(
        ctx:  CanvasRenderingContext2D,
        type: string,
        sx:   number,
        sy:   number,
        ppu:  number,
        cssH: number,
    ): void {
        const fp = _footprint(type);
        // CornerSofaBuilder defaults: widthMain=data.width, lengthSide=data.length,
        // seatDepth*=0.90 m. Mirror those exactly so preview == placed symbol.
        const widthMain  = fp.w;
        const lengthSide = fp.l;
        const seatDepth  = CORNER_SOFA_DEPTH_M;

        const { outline, notch, cornerCushion } = _cornerSofaPreviewRings(widthMain, lengthSide, seatDepth);

        // Local-metres → screen-pixels. Local (0,0) is at the cursor (inside-L).
        // Plan view: +X local → +screenX, +Z local → +screenY (top-down).
        const toScreen = (p: { x: number; z: number }) => ({
            x: sx + p.x * ppu,
            y: sy + p.z * ppu,
        });

        // Dashed L footprint, filled with the same translucent fill as the rect preview
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 1.5;
        ctx.fillStyle   = FILL_COLOUR;
        ctx.lineJoin    = 'miter';
        ctx.beginPath();
        const p0 = toScreen(outline[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < outline.length; i++) {
            const p = toScreen(outline[i]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        // Diagonal cushion-corner notch (matches the symbol's seam line)
        ctx.beginPath();
        const n0 = toScreen(notch[0]);
        const n1 = toScreen(notch[1]);
        ctx.moveTo(n0.x, n0.y);
        ctx.lineTo(n1.x, n1.y);
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 0.75;
        ctx.stroke();

        // Corner-unit cushion outline — three closing edges + diagonal fold
        // seam at the inside-L corner. Mirrors SofaPlanSymbolBuilder so the
        // dashed preview reads identically to the placed symbol.
        ctx.beginPath();
        for (const segment of cornerCushion) {
            const a = toScreen(segment[0]);
            const b = toScreen(segment[1]);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 0.85;
        ctx.stroke();

        // Corner marks at every L vertex — same visual language as rect preview
        ctx.fillStyle = STROKE_COLOUR;
        const CORNER = 3;
        for (const v of outline) {
            const p = toScreen(v);
            ctx.fillRect(p.x - CORNER / 2, p.y - CORNER / 2, CORNER, CORNER);
        }

        // Anchor crosshair at the inside-back corner (the cursor / placement origin)
        ctx.strokeStyle = STROKE_COLOUR;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.moveTo(sx - 8, sy); ctx.lineTo(sx + 8, sy);
        ctx.moveTo(sx, sy - 8); ctx.lineTo(sx, sy + 8);
        ctx.stroke();

        // Label under the geometric centre of the L bounding box, not under the
        // anchor — keeps the text readable when the cursor is at a wall.
        const labelCx = sx + (widthMain  / 2) * ppu;
        const labelLy = sy + lengthSide  * ppu + 14;
        this._drawLabelAndHint(ctx, type, labelCx, labelLy, cssH);
    }

    /** Shared label + bottom-left hint rendering. */
    private _drawLabelAndHint(
        ctx:     CanvasRenderingContext2D,
        type:    string,
        labelCx: number,
        labelLy: number,
        cssH:    number,
    ): void {
        // Furniture type label with white pill background
        const labelText = _label(type);
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(labelCx - tw / 2 - 4, labelLy - 8, tw + 8, 15);
        ctx.fillStyle    = '#4c1d95';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelCx, labelLy);

        // Hint at bottom-left
        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(30,58,138,0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Click to place · Esc to cancel', 12, cssH - 12);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
