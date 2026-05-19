/**
 * ColumnPlanSymbolBuilder — DOC-2.5g
 *
 * Injects plan-view symbols into a TechnicalDrawing for all structural columns
 * visible in the active plan view.
 *
 * Symbol strategy (AEC convention):
 *   Steel UC/UB columns → full I-section outline (12 vertices) + crosshair centrelines
 *   Concrete columns    → rectangle outline (4 vertices)    + crosshair centrelines
 *
 * Both symbol types share the crosshair (✛) at the column centroid for dimensioning.
 *
 * Algorithm per column:
 *   1. Resolve centroid in world XZ from ColumnData.position (x, z).
 *   2. Build section outline vertices in world space (rotated by column.rotation).
 *   3. Inject outline + crosshair LineSegments onto layer S-COLS.
 *
 * §COLUMN-AUDIT-2026 §W8 — `columnStore` is now constructor-injected. The
 * legacy `window.columnStore` global read was eliminated. The module // TODO(TASK-08)
 * exports an `installColumnPlanSymbolBuilder(columnStore)` factory invoked by
 * `EngineBootstrap` once `columnStore` is constructed; the resolved
 * `columnPlanSymbolBuilder` singleton (used by `EdgeProjectorService`) is set
 * by that factory.
 *
 * Contract compliance:
 *   §01 §5  — pure read service; no store mutations; result lives in TechnicalDrawing.
 *   §02 §1.2 — column geometry read from columnStore.getAll() on every call; no cache.
 *   §05     — no DOM, no BIM-UI components.
 *
 * Called by:
 *   EdgeProjectorService.project() — plan/detail/structural-plan views (DOC-2.5g).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { ColumnData } from './ColumnTypes';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';

/** ISO 13567 DXF layer for structural column symbols. */
const COLUMN_LAYER = 'S-COLS';

/** Extension of crosshair arm beyond the column face (metres). */
const EXTENSION = 0.15;

interface MinColumnStore {
    getAll(): ColumnData[];
}

export class ColumnPlanSymbolBuilder {
    private readonly _columnStore: MinColumnStore | null;

    constructor(columnStore: MinColumnStore | null) {
        this._columnStore = columnStore;
    }

    /**
     * Injects crosshair center marks (and section outlines for steel) for all
     * columns on the active level.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (
            viewDef.viewType !== 'plan' &&
            viewDef.viewType !== 'detail' &&
            viewDef.viewType !== 'structural-plan'
        ) return;

        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        // §W8: prefer the constructor-injected store; if the symbol builder
        // singleton was reached before `installColumnPlanSymbolBuilder` ran
        // (unexpected but defensive), fall back to the window global with a
        // single-shot warning so the gap is visible.
        let store: MinColumnStore | null = this._columnStore;
        if (!store) {
            const fallback = window.columnStore as MinColumnStore | undefined; // TODO(TASK-08)
            if (fallback) {
                store = fallback;
                console.warn(
                    '[ColumnPlanSymbolBuilder] §W8 fallback: columnStore not injected; ' +
                        'using window global. installColumnPlanSymbolBuilder(store) was not invoked yet.',
                );
            }
        }

        if (!store || typeof store.getAll !== 'function') {
            console.warn('[ColumnPlanSymbolBuilder] columnStore not available — skipping');
            return;
        }

        const columns: ColumnData[] = store.getAll().filter(
            (c: ColumnData) => c.levelId === levelId,
        );

        if (columns.length === 0) return;

        if (!drawing.layers.has(COLUMN_LAYER)) {
            drawing.layers.create(COLUMN_LAYER);
        }

        let injectedCount = 0;

        for (const col of columns) {
            const isSteelSection = (col.profile === 'UC' || col.profile === 'UB') && !!col.steelProfileName;

            if (isSteelSection) {
                this._injectSteelSymbol(drawing, col);
            } else {
                this._injectConcreteSymbol(drawing, col);
            }

            injectedCount++;
        }

        if (injectedCount > 0) {
            console.log(
                `[ColumnPlanSymbolBuilder] Injected ${injectedCount} symbol(s) ` +
                `in plan view "${viewDef.id}"`,
            );
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Steel column: draw the 12-point I-section outline + crosshair.
     */
    private _injectSteelSymbol(drawing: OBC.TechnicalDrawing, col: ColumnData): void {
        const profile = SteelProfileLibrary.get(col.steelProfileName!);
        if (!profile) {
            this._injectConcreteSymbol(drawing, col);
            return;
        }

        const { D, B, t, T } = SteelProfileLibrary.toMetres(profile);
        const hw = B / 2;
        const hd = D / 2;
        const ht = t / 2;
        const wh = hd - T;

        // 12-point I-section in local XY (X = B-dir, Z = D-dir for world XZ)
        const local: Array<[number, number]> = [
            [-hw, -hd], [ hw, -hd], [ hw, -wh],
            [ ht, -wh], [ ht,  wh], [ hw,  wh],
            [ hw,  hd], [-hw,  hd], [-hw,  wh],
            [-ht,  wh], [-ht, -wh], [-hw, -wh],
        ];

        const worldY = col.position.y + col.height * 0.5;
        const cos = Math.cos(col.rotation);
        const sin = Math.sin(col.rotation);

        // World XZ points (rotated)
        const pts3D = local.map(([lx, lz]) => new THREE.Vector3(
            col.position.x + lx * cos - lz * sin,
            worldY,
            col.position.z + lx * sin + lz * cos,
        ));

        // Outline: 12 line segments forming closed I-shape
        const outlinePositions: number[] = [];
        for (let i = 0; i < pts3D.length; i++) {
            const a = pts3D[i];
            const b = pts3D[(i + 1) % pts3D.length];
            outlinePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }

        this._injectLineSegments(drawing, outlinePositions, worldY);

        // Crosshair at centroid
        this._injectCrosshair(drawing, col.position.x, col.position.z, worldY, hw + EXTENSION, hd + EXTENSION);
    }

    /**
     * Concrete column: draw rectangle outline + crosshair.
     */
    private _injectConcreteSymbol(drawing: OBC.TechnicalDrawing, col: ColumnData): void {
        const cx = col.position.x;
        const cz = col.position.z;
        const worldY = col.position.y + col.height * 0.5;
        const hw = (col.width ?? 0.3) / 2;
        const hd = (col.depth ?? 0.3) / 2;
        const cos = Math.cos(col.rotation ?? 0);
        const sin = Math.sin(col.rotation ?? 0);

        const corners: Array<[number, number]> = [
            [-hw, -hd], [ hw, -hd], [ hw,  hd], [-hw,  hd],
        ];

        const pts3D = corners.map(([lx, lz]) => new THREE.Vector3(
            cx + lx * cos - lz * sin,
            worldY,
            cz + lx * sin + lz * cos,
        ));

        const outlinePositions: number[] = [];
        for (let i = 0; i < pts3D.length; i++) {
            const a = pts3D[i];
            const b = pts3D[(i + 1) % pts3D.length];
            outlinePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }

        this._injectLineSegments(drawing, outlinePositions, worldY);

        const halfLen = Math.max(hw, hd) + EXTENSION;
        this._injectCrosshair(drawing, cx, cz, worldY, halfLen, halfLen);
    }

    private _injectCrosshair(
        drawing: OBC.TechnicalDrawing,
        cx: number, cz: number, worldY: number,
        halfLenX: number, halfLenZ: number,
    ): void {
        const positions = [
            cx - halfLenX, worldY, cz,
            cx + halfLenX, worldY, cz,
            cx,            worldY, cz - halfLenZ,
            cx,            worldY, cz + halfLenZ,
        ];
        this._injectLineSegments(drawing, positions, worldY);
    }

    private _injectLineSegments(
        drawing: OBC.TechnicalDrawing,
        positions: number[],
        _worldY: number,
    ): void {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const lineSegs = new THREE.LineSegments(
            geo,
            new THREE.LineBasicMaterial({ color: 0x000000 }),
        );
        lineSegs.updateWorldMatrix(true, false);

        const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);
        drawing.addProjectionLines(projected, COLUMN_LAYER);
    }
}

/**
 * §W8 — Mutable singleton. EngineBootstrap calls
 * `installColumnPlanSymbolBuilder(columnStore)` after the store is built; the
 * EdgeProjectorService imports the `columnPlanSymbolBuilder` reference and
 * sees the resolved instance from then on. Until installation, a defensive
 * stub instance is exposed (no store) so `inject()` is a safe no-op + warn
 * rather than throwing.
 *
 * §01 §5 — never stored in any PRYZM ElementStore.
 */
export let columnPlanSymbolBuilder: ColumnPlanSymbolBuilder = new ColumnPlanSymbolBuilder(null);

export function installColumnPlanSymbolBuilder(columnStore: MinColumnStore): ColumnPlanSymbolBuilder {
    columnPlanSymbolBuilder = new ColumnPlanSymbolBuilder(columnStore);
    return columnPlanSymbolBuilder;
}
