/**
 * BimGridRenderer — rendering authority for BIM structural grids.
 *
 * §02 §8.1  Grid lines live in `bimGridsGroup` added to the scene,
 *            NOT on the scene root.
 *
 * Key improvement over the old BimManager.drawGrid():
 *   Grid lines are rendered at `currentElevation` (active level elevation),
 *   not hardcoded at Y = 0. When the active level changes, call
 *   setElevation(y) to reposition all lines without a full rebuild.
 *
 * BimManager is the DATA authority (grids Map, subscribers).
 * BimGridRenderer is the GEOMETRY authority (Three.js lines, label sprites).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { Grid } from './BimKernel';
import { getElementTypeRules } from './presentation/ElementTypeRegistry';
import type { LineAppearance } from './presentation/VisibilityIntentTypes';

// ── Visual constants ────────────────────────────────────────────────────────

/** Fallback when the Visibility Intent registry returns no usable colour. */
const FALLBACK_LINE_COLOR = 0x888888;
const FALLBACK_LINE_OPACITY = 0.65;
/** Extra distance beyond extentMax where the name label is placed. */
const LABEL_END_OFFSET = 0;
const BUBBLE_CANVAS_SIZE = 128;

/**
 * §25 §4 — Map a LineAppearance.style to dashed-material dash/gap sizes.
 * 'solid' returns nulls so callers can switch to LineBasicMaterial if desired,
 * but for simplicity we always use LineDashedMaterial with very large dashSize
 * for solid lines.
 */
function _dashFromStyle(style: LineAppearance['style']): { dashSize: number; gapSize: number } {
    switch (style) {
        case 'solid':  return { dashSize: 1e6, gapSize: 0 };
        case 'dashed': return { dashSize: 0.6, gapSize: 0.3 };
        case 'dotted': return { dashSize: 0.05, gapSize: 0.2 };
        case 'chain':  return { dashSize: 0.8, gapSize: 0.35 };
        default:       return { dashSize: 0.8, gapSize: 0.35 };
    }
}

// ── BimGridRenderer ─────────────────────────────────────────────────────────

export class BimGridRenderer {
    /** All grid lines and labels grouped together — §02 §8.1. */
    readonly bimGridsGroup: THREE.Group;

    private readonly lines  = new Map<string, THREE.Line>();
    private readonly labels = new Map<string, THREE.Sprite>();

    /** Y-position of all grid lines (= active level elevation). */
    private currentElevation: number = 0;

    constructor(scene: THREE.Scene) {
        this.bimGridsGroup = new THREE.Group();
        this.bimGridsGroup.name = 'bimGridsGroup';
        scene.add(this.bimGridsGroup);
    }

    // ── Public API ────────────────────────────────────────────────────────

    /**
     * Repositions all existing grid lines to the new elevation.
     * Call this whenever the active level changes.
     */
    setElevation(y: number): void {
        this.currentElevation = y;
        this.lines.forEach(line => { line.position.y = y; });
        this.labels.forEach(sprite => { sprite.position.y = y + 0.5; });
    }

    /** Creates and registers a new grid line + label at current elevation. */
    buildGrid(grid: Grid): void {
        this._disposeGrid(grid.id);
        this._createLine(grid);
        this._createLabel(grid);
    }

    /** Rebuilds only the changed grid's geometry (full dispose + create). */
    updateGrid(grid: Grid): void {
        this._disposeGrid(grid.id);
        this.buildGrid(grid);
    }

    /** Disposes geometry/material/sprite for one grid. */
    removeGrid(id: string): void {
        this._disposeGrid(id);
    }

    /**
     * Returns the THREE.Line for a given grid id, if one exists.
     * Used by ElementRegistry registration (§02 §2) and the selection
     * highlight strategy (§16 §3).
     */
    getLine(id: string): THREE.Line | undefined {
        return this.lines.get(id);
    }

    /** Returns the bubble/label sprite for a given grid id, if one exists. */
    getLabel(id: string): THREE.Sprite | undefined {
        return this.labels.get(id);
    }

    /** Shows/hides the entire group. */
    toggleVisibility(visible: boolean): void {
        this.bimGridsGroup.visible = visible;
    }

    /** Full GPU cleanup — call on project clear or HMR. */
    dispose(): void {
        [...this.lines.keys()].forEach(id => this._disposeGrid(id));
        this.lines.clear();
        this.labels.clear();
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private _createLine(grid: Grid): void {
        // §25 §4 — Pull projection-state appearance from the Visibility Intent
        // registry. Per-grid `color` (user override) wins; otherwise we use
        // the registry's projection-state colour.
        const rules     = getElementTypeRules('grid');
        const projLine  = rules.projection.line;
        const styleHex  = grid.color ?? projLine.colour ?? FALLBACK_LINE_COLOR;
        const opacity   = projLine.opacity > 0 ? projLine.opacity : FALLBACK_LINE_OPACITY;
        const { dashSize, gapSize } = _dashFromStyle(projLine.style);

        const material = new THREE.LineDashedMaterial({
            color: new THREE.Color(styleHex as THREE.ColorRepresentation),
            transparent: true,
            opacity,
            dashSize,
            gapSize,
            depthWrite: false
        });

        // §40 §2.2 — Linear-mode grids draw between explicit XZ endpoints.
        // Orthogonal-mode grids keep the legacy axis+position+extent build.
        const min = grid.extentMin;
        const max = grid.extentMax;
        const isLinear = grid.mode === 'linear'
            && typeof grid.startX === 'number' && typeof grid.startZ === 'number'
            && typeof grid.endX   === 'number' && typeof grid.endZ   === 'number';

        const pts: THREE.Vector3[] = isLinear
            ? [
                new THREE.Vector3(grid.startX!, 0, grid.startZ!),
                new THREE.Vector3(grid.endX!,   0, grid.endZ!),
              ]
            : grid.axis === 'X'
                ? [new THREE.Vector3(grid.position, 0, min), new THREE.Vector3(grid.position, 0, max)]
                : [new THREE.Vector3(min, 0, grid.position), new THREE.Vector3(max, 0, grid.position)];

        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();

        // Lines sit at the active level's elevation, not at Y=0.
        line.position.y = this.currentElevation;
        line.visible = grid.isVisible;

        // §01 §3.4: Secure immutable identity.
        line.userData = { elementType: 'BimGrid', id: grid.id };
        Object.defineProperty(line.userData, 'id', { writable: false });
        Object.defineProperty(line.userData, 'elementType', { writable: false });

        this.bimGridsGroup.add(line);
        this.lines.set(grid.id, line);
    }

    private _createLabel(grid: Grid): void {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = BUBBLE_CANVAS_SIZE;
        canvas.height = BUBBLE_CANVAS_SIZE;

        // §40 §3.3 — Pinned grids draw with an amber border so the lock state
        // is visible at a glance. Per-grid `color` still wins for the label
        // text so user themes are preserved.
        const isPinned = grid.isPinned === true;
        const fg     = grid.color ?? '#4b5563';
        const border = isPinned ? '#d97706' /* amber-600 */ : fg;
        ctx.clearRect(0, 0, BUBBLE_CANVAS_SIZE, BUBBLE_CANVAS_SIZE);
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.strokeStyle = border;
        ctx.lineWidth = isPinned ? 7 : 5;
        ctx.beginPath();
        ctx.arc(64, 64, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = fg;
        ctx.font = '700 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(grid.name, 64, 66);

        // Tiny pin glyph in the corner when pinned.
        if (isPinned) {
            ctx.fillStyle = '#d97706';
            ctx.font = '700 28px Arial';
            ctx.fillText('📌', 102, 30);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(mat);

        // §40 §2.2 — Linear-mode grids place the label at the line's end point.
        // Orthogonal-mode keeps the legacy "far end of extent" placement.
        const isLinear = grid.mode === 'linear'
            && typeof grid.endX === 'number' && typeof grid.endZ === 'number';

        if (isLinear) {
            sprite.position.set(grid.endX!, this.currentElevation + 0.5, grid.endZ!);
        } else {
            const far = grid.extentMax + LABEL_END_OFFSET;
            if (grid.axis === 'X') {
                sprite.position.set(grid.position, this.currentElevation + 0.5, far);
            } else {
                sprite.position.set(far, this.currentElevation + 0.5, grid.position);
            }
        }
        sprite.scale.set(2.5, 2.5, 1);
        sprite.visible = grid.isVisible;
        // Tag the label sprite so VG applicator toggles its visibility alongside the line.
        sprite.userData = { elementType: 'BimGrid', id: grid.id };

        this.bimGridsGroup.add(sprite);
        this.labels.set(grid.id, sprite);
    }

    private _disposeGrid(id: string): void {
        const line = this.lines.get(id);
        if (line) {
            line.geometry.dispose();
            (line.material as THREE.Material).dispose();
            this.bimGridsGroup.remove(line);
            this.lines.delete(id);
        }

        const sprite = this.labels.get(id);
        if (sprite) {
            (sprite.material as THREE.SpriteMaterial).map?.dispose();
            (sprite.material as THREE.SpriteMaterial).dispose();
            this.bimGridsGroup.remove(sprite);
            this.labels.delete(id);
        }
    }
}
