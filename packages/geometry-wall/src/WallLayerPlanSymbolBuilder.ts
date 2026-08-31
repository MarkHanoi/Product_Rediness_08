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
import type { ViewDefinition } from '@pryzm/core-app-model';
// §FEAT-WALL-PLAN-LOD (L-286) — the wall row of ADR-121's LOD matrix. The wall is a
// consumer of the ONE shared resolver (ADR-121 §4.3: "One resolver, three consumers —
// NOT a second symbol engine per view type"), exactly as the door and the window are.
// There is deliberately no private `detailed` flag and no `resolveWallDetailLevel`.
import { resolveEffectiveDetailLevel, projectToDrawingSpace, type DetailLevel, type DrawingSurface } from '@pryzm/core-app-model';
import {
    computeWallLayerLines,
    computeWallLayerInsulationHatch,
    type LayerLineWall,
    type LayerLineSeg,
} from './WallLayerPlanLines.js';

/** ISO 13567 DXF layer for wall symbols — same layer the wall faces project onto. */
const WALL_LAYER = 'A-WALL';
/** Default AEC plan cut height above the floor (m) — matches EdgeProjectorService. */
const DEFAULT_CUT_ABOVE_FLOOR_M = 1.2;

/**
 * §FEAT-WALL-PLAN-LOD (L-286) — WHAT EACH TIER EMITS, AND WHY IT IS THIS AND NOT
 * SOMETHING ELSE. (ADR-121 §3.2 wall row: "✗ layer lines always drawn" — i.e. the wall
 * ignored the dial entirely. This closes that cell.)
 *
 *   'coarse' LOD 100 — NOTHING from this builder. The wall reads as ONE region: its
 *                      outer footprint (drawn by the wall's own mesh projection) and,
 *                      since L-261, one poché fill. ADR-121 §4.2, plan-100, verbatim:
 *                      *"Layered elements read as ONE poché region."*
 *   'medium' LOD 200 — the N−1 internal LAYER BOUNDARY lines. ADR-121 §4.2, plan-200:
 *                      *"layer build-up shown where stored."* This is EXACTLY what
 *                      shipped before this change, so it is PINNED: no view setting can
 *                      regress today's drawing.
 *   'fine'   LOD 300 — + the INSULATION HATCH on every stored layer whose `function`
 *                      is 'insulation' (`computeWallLayerInsulationHatch`). ADR-121
 *                      §4.2 names the insulation hatch as an LOD-300 addition; the wall
 *                      record already knows which bands are insulation, so nothing is
 *                      invented.
 *
 * A REFUTATION OF THE BRIEF THAT COMMISSIONED THIS, RECORDED WHERE IT WILL BE READ:
 * the ticket said *"WALL: Coarse = single line. Medium = the two faces. Fine = the layer
 * boundaries from wall.layers."* Two of those three cannot both be honoured:
 *
 *   (1) Layer boundaries at FINE would REMOVE them at MEDIUM — but they are drawn today
 *       unconditionally, and ADR-121 §4.2 places "layer build-up shown where stored" at
 *       plan-**200**. A tier may never remove a line another tier draws (§4.2 invariant),
 *       and "medium = today's element, pinned" is the rule the door and window rows were
 *       built on. So the boundaries stay at 200 and FINE adds the hatch instead.
 *   (2) "Coarse = single line" (a wall drawn as its CENTRELINE) is NOT implementable in a
 *       plan-symbol builder AT ALL, and this is a real architectural boundary, not a
 *       shortcut: the wall's two face lines are not authored by any symbol builder — they
 *       are the projection of the WALL MESH, and the mesh is shared with the 3D view. The
 *       door escapes this with `skipInPlan` because it HAS a symbol to put in the mesh's
 *       place; a wall's plan symbol IS its mesh section. Collapsing a wall to a centreline
 *       at LOD 100 therefore requires a per-view suppression in `EdgeProjectorService`
 *       (a plan-100 single-line wall representation), which is out of this package's
 *       ownership and is recorded as an OPEN CELL in ADR-121 §5.2 rather than faked here.
 */
type WallPlanLod = DetailLevel;

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
    inject(drawing: DrawingSurface, viewDef: ViewDefinition): void {
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

            // §FEAT-WALL-PLAN-LOD (L-286) — ask the SHARED resolver, per wall, which tier
            // this view wants. The precedence (C09 element → element-type → category
            // override → the view's own `output.detailLevel` → the L0 default) lives in
            // `resolveEffectiveDetailLevel`; the wall owns none of it.
            const lod: WallPlanLod = resolveEffectiveDetailLevel(wall.id, viewDef.id, {
                elementType: 'wall',
                category:    'wall',
            });
            // LOD 100 — one region. The outer footprint + its poché already say
            // "wall"; the build-up is internal articulation and 100 has none.
            if (lod === 'coarse') continue;

            // Cut plane relative to the wall base = default cut-above-floor minus the wall's
            // base offset (matches EdgeProjectorService's cutPlaneY − wallBaseY).
            const cutRelToBase = DEFAULT_CUT_ABOVE_FLOOR_M - (Number(wall.baseOffset) || 0);

            // LOD 200 — the layer boundaries (today's drawing, pinned).
            const segs: LayerLineSeg[] = computeWallLayerLines(wall, cutRelToBase);
            // LOD 300 — STRICTLY ADDITIVE: the same boundaries, plus the insulation hatch
            // inside the bands they already bound (ADR-121 §4.2 superset invariant).
            if (lod === 'fine') segs.push(...computeWallLayerInsulationHatch(wall, cutRelToBase));
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

    private _injectLineSegments(drawing: DrawingSurface, positions: number[]): void {
        if (positions.length === 0) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lineSegs = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        lineSegs.updateWorldMatrix(true, false);
        const projected = projectToDrawingSpace(lineSegs, drawing);

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
