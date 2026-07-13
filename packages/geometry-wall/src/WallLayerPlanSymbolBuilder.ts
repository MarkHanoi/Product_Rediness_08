// WallLayerPlanSymbolBuilder — §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62).
//
// Injects the INTERNAL layer-boundary lines of every LAYERED wall on the active plan level
// into a TechnicalDrawing, so PLAN view shows the layered composition (core + finishes) — not
// the plain single-volume outline. Mirrors the established `*PlanSymbolBuilder` family
// (Column/Window/Door/…): a pure read service, result lives in the TechnicalDrawing, wired via
// a mutable singleton + `installWallLayerPlanSymbolBuilder(store)` factory and called from
// `EdgeProjectorService.project()` alongside the other symbol builders.
//
// The wall's OUTER footprint is already drawn by the wall's own mesh projection; this adds only
// the N−1 lines between adjacent layers (computed by the pure `computeWallLayerLines`, matching
// the 3D `WallFragmentBuilder` layer offsets exactly), clipped at openings that cross the cut
// plane. Plain (single-volume) walls emit nothing — byte-identical plan for non-layered walls.
//
// Contract compliance:
//   §01 §5   — pure read; no store mutation; output lives in the TechnicalDrawing.
//   C15      — hosted openings break the layer lines at the void (same rule as the wall faces).
//   ADR-0055 — plan projection consumes the SAME layered footprint the 3D grid path renders.

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { computeWallLayerLines, type LayerLineWall } from './WallLayerPlanLines.js';

/** ISO 13567 DXF layer for wall symbols — same layer the wall faces project onto. */
const WALL_LAYER = 'A-WALL';
/** Default AEC plan cut height above the floor (m) — matches EdgeProjectorService. */
const DEFAULT_CUT_ABOVE_FLOOR_M = 1.2;

interface PlanWall extends LayerLineWall {
    readonly id: string;
    readonly levelId: string;
    readonly baseOffset?: number;
}

interface MinWallStore {
    getByLevel?(levelId: string): PlanWall[];
    getAll?(): PlanWall[];
}

export class WallLayerPlanSymbolBuilder {
    private readonly _wallStore: MinWallStore | null;

    constructor(wallStore: MinWallStore | null) {
        this._wallStore = wallStore;
    }

    /** Inject internal layer-boundary lines for all layered walls on the active plan level. */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): void {
        if (viewDef.viewType !== 'plan' && viewDef.viewType !== 'detail' && viewDef.viewType !== 'structural-plan') return;
        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return;

        let store: MinWallStore | null = this._wallStore;
        if (!store) {
            const fallback = (window as unknown as { wallStore?: MinWallStore }).wallStore;
            if (fallback) store = fallback;
        }
        if (!store) return;

        const walls: PlanWall[] = typeof store.getByLevel === 'function'
            ? store.getByLevel(levelId)
            : (store.getAll?.() ?? []).filter(w => w.levelId === levelId);
        if (!walls || walls.length === 0) return;

        let injected = 0;
        for (const wall of walls) {
            if (!wall.layers || wall.layers.length < 2 || wall.curve) continue;   // plain / curved → skip
            // Cut plane relative to the wall base = default cut-above-floor minus the wall's
            // base offset (matches EdgeProjectorService's cutPlaneY − wallBaseY).
            const cutRelToBase = DEFAULT_CUT_ABOVE_FLOOR_M - (Number(wall.baseOffset) || 0);
            const segs = computeWallLayerLines(wall, cutRelToBase);
            if (segs.length === 0) continue;

            const worldY = (Number(wall.baseLine?.[0]?.y) || 0) + (Number(wall.baseOffset) || 0) + DEFAULT_CUT_ABOVE_FLOOR_M;
            const positions: number[] = [];
            for (const s of segs) positions.push(s.ax, worldY, s.az, s.bx, worldY, s.bz);
            this._injectLineSegments(drawing, positions);
            injected++;
        }

        if (injected > 0) {
            console.log(`[WallLayerPlanSymbolBuilder] injected layer lines for ${injected} layered wall(s) in plan view "${viewDef.id}"`);
        }
    }

    private _injectLineSegments(drawing: OBC.TechnicalDrawing, positions: number[]): void {
        if (positions.length === 0) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lineSegs = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        lineSegs.updateWorldMatrix(true, false);
        const projected = OBC.TechnicalDrawing.toDrawingSpace(lineSegs, drawing);

        // §FIX-PLAN-AWALL-LAYER-FALLBACK (L-241/L-252 lineage) — CREATE THE LAYER BEFORE
        // DRAWING INTO IT. The founder's console repeats, on every re-projection:
        //
        //     [TechnicalDrawing] Layer "A-WALL" does not exist. Falling back to "0".
        //
        // We were adding layered-wall lines to a layer we never created. OBC then silently
        // dumps them on layer "0" — and layer "0" carries NO pen weight, NO colour and NO
        // visibility-graphics override. So every layered wall's plan linework was drawn
        // OUTSIDE the ISO-13567 layer system: no cut/projection lineweight hierarchy, no VG
        // styling, no poché association. That is a silent, drawing-wide correctness bug, and
        // it is exactly the kind of thing that makes a plan "read flat" no matter how good the
        // symbols are — the pen table (Contract-23) never gets a chance to apply.
        //
        // The projector creates the SUB-layers (`A-WALL:cut`, `A-WALL:proj`) for its own
        // linework, but nothing creates the BASE `A-WALL` layer that this builder targets.
        // `layers.create()` is idempotent, so ensuring it here is safe on every path and
        // cannot double-create. The VG applicator's "applied=12/14 layers" (vs 14/14) in the
        // founder's log is the same fact seen from the other end: two layers it expected to
        // style did not exist.
        drawing.layers.create(WALL_LAYER);

        drawing.addProjectionLines(projected, WALL_LAYER);
    }
}

/**
 * §L-62 — mutable singleton. `EngineBootstrap` calls
 * `installWallLayerPlanSymbolBuilder(wallStore)` after the store is built; until then a
 * defensive stub (no store, falls back to `window.wallStore`) keeps `inject()` a safe no-op /
 * best-effort rather than throwing. Never stored in any PRYZM ElementStore (§01 §5).
 */
export let wallLayerPlanSymbolBuilder: WallLayerPlanSymbolBuilder = new WallLayerPlanSymbolBuilder(null);

export function installWallLayerPlanSymbolBuilder(wallStore: MinWallStore): WallLayerPlanSymbolBuilder {
    wallLayerPlanSymbolBuilder = new WallLayerPlanSymbolBuilder(wallStore);
    return wallLayerPlanSymbolBuilder;
}
