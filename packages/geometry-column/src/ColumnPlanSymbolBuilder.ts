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
 * legacy `window.columnStore` global read was eliminated. The module
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
import type { ViewDefinition } from '@pryzm/core-app-model';
// §FEAT-COLUMN-PLAN-LOD (L-286) — the column row of ADR-121's LOD matrix. ONE shared
// resolver (ADR-121 §4.3), the same one the door, window and wall rows call. No private
// `detailed` flag, no `resolveColumnDetailLevel`.
import { resolveEffectiveDetailLevel, projectToDrawingSpace, type DetailLevel, type DrawingSurface } from '@pryzm/core-app-model';
import type { ColumnData } from './ColumnTypes';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';
import {
    computeColumnSectionPolygon, computeSectionHatch, polygonEdges,
    type Pt, type Seg,
} from './ColumnSectionGeometry';

/** ISO 13567 DXF layer for structural column symbols. */
const COLUMN_LAYER = 'S-COLS';

/** Extension of crosshair arm beyond the column face (metres). */
const EXTENSION = 0.15;

/**
 * §FEAT-COLUMN-PLAN-LOD (L-286) — WHAT EACH TIER EMITS.
 *
 *   'coarse' LOD 100 — the column's TRUE cut SECTION OUTLINE, and nothing else. ADR-121
 *                      §4.2, plan-100: "the element's footprint/extent … NO INTERNAL
 *                      ARTICULATION." The crosshair is a dimensioning aid, not the column.
 *   'medium' LOD 200 — + the CROSSHAIR centrelines. This is EXACTLY what shipped before
 *                      this change, so LOD 200 is PINNED: no view setting can regress
 *                      today's drawing.
 *   'fine'   LOD 300 — + the MATERIAL HATCH filling the cut section (ADR-121 §4.2 names
 *                      the material hatch; C09 §4.6.2 makes a CUT solid a FILLED REGION,
 *                      not an outline). Clipped to the REAL section, so a UC's web notches
 *                      stay empty — there is no steel there.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * AN ARCHITECTURAL CHOICE I REFUSED TO MAKE SILENTLY — READ THIS BEFORE "FIXING" COARSE.
 *
 * The ticket that commissioned this row said: *"COLUMN: coarse = a single rectangle; fine
 * = the real section profile from its type."* For a rectangular concrete column those two
 * are THE SAME POLYGON and there is no tension. **For a STEEL UC/UB there is, and it is
 * not resolvable inside this builder:**
 *
 *   ADR-121 §4.2 invariant — "LOD 300 emits a strict superset of LOD 200's geometry, and
 *   LOD 200 of LOD 100's. **A tier may never REMOVE a line another tier draws.**"
 *
 * A bounding RECTANGLE at LOD 100 draws two full-depth side lines at x = ±B/2. The
 * I-section at LOD 200 does NOT contain them — it returns into the web. So "coarse = a
 * rectangle" would make LOD 200 DELETE two lines LOD 100 drew, which is precisely the
 * invariant the founder asked to be guarded. The two instructions cannot both hold.
 *
 * This builder therefore draws the TRUE section at every tier (for the common rectangular
 * column that IS "a single rectangle", which is what the ticket was after), and the
 * genuine question — *should LOD 100 be allowed to SUBSTITUTE a massing envelope for the
 * true section, rather than merely subtract detail from it?* — is escalated, not decided
 * here. It is a change to the MEANING OF LOD 100 across every element family (a coarse
 * stair would become its bounding box too), so it belongs in ADR-121 §4.2, not in a column.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 */
type ColumnPlanLod = DetailLevel;

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
    inject(drawing: DrawingSurface, viewDef: ViewDefinition): void {
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
            // §FEAT-COLUMN-PLAN-LOD (L-286) — ask the SHARED resolver, per column, which
            // tier this view wants. The precedence (C09 element → element-type → category
            // override → the view's own `output.detailLevel` → the L0 default) lives in
            // `resolveEffectiveDetailLevel`; the column owns none of it.
            const lod: ColumnPlanLod = resolveEffectiveDetailLevel(col.id, viewDef.id, {
                elementType: 'column',
                category:    'column',
            });
            this._injectColumnSymbol(drawing, col, lod);
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
     * ONE symbol path for EVERY column — steel, rectangular or circular — because the
     * SHAPE is a question for the RECORD, not for a branch in a builder. (The two paths
     * this replaces had drifted: the concrete one drew `width × depth` corners for a
     * 'circular' profile too, so a Ø300 column printed as a 300 mm SQUARE.)
     *
     * The tier decides HOW MUCH of the section is draughted — never WHERE it is (L-127):
     * the outline is byte-identical at coarse, medium and fine.
     */
    private _injectColumnSymbol(
        drawing: DrawingSurface,
        col: ColumnData,
        lod: ColumnPlanLod,
    ): void {
        const steel = this._steelSectionOf(col);
        const poly: Pt[] = computeColumnSectionPolygon(col, steel);
        if (poly.length < 3) return;

        const worldY = col.position.y + col.height * 0.5;
        const emit = (segs: readonly Seg[]): void => {
            const positions: number[] = [];
            for (const s of segs) positions.push(s.ax, worldY, s.az, s.bx, worldY, s.bz);
            this._injectLineSegments(drawing, positions, worldY);
        };

        // ── LOD 100+ — the true cut section outline. ──────────────────────────────
        emit(polygonEdges(poly));
        if (lod === 'coarse') return;

        // ── LOD 200+ — the crosshair centrelines (the drawing that ships today). ──
        // Arms reach EXTENSION beyond the section's own half-extents, so the aid scales
        // with the column instead of with a magic length.
        let hx = 0, hz = 0;
        for (const p of poly) {
            hx = Math.max(hx, Math.abs(p.x - col.position.x));
            hz = Math.max(hz, Math.abs(p.z - col.position.z));
        }
        this._injectCrosshair(drawing, col.position.x, col.position.z, worldY,
                              hx + EXTENSION, hz + EXTENSION);
        if (lod !== 'fine') return;

        // ── LOD 300 — the material hatch, clipped to the REAL section. ────────────
        // The pitch is a RATIO OF THE COLUMN'S OWN MINOR DIMENSION (ADR-121 §4.4: no
        // literal dimension in a symbol), so a 200 mm column and a 900 mm column both
        // read as hatched rather than as "four strokes" and "a solid black blob".
        const minor = Math.max(1e-4, steel ? Math.min(steel.B, steel.D)
                                           : Math.min(2 * hx, 2 * hz));
        emit(computeSectionHatch(poly, minor / 4));
    }

    /** The steel section, in metres — or null when the record does not describe one. */
    private _steelSectionOf(col: ColumnData): { D: number; B: number; t: number; T: number } | null {
        if (col.profile !== 'UC' && col.profile !== 'UB') return null;
        if (!col.steelProfileName) return null;
        const profile = SteelProfileLibrary.get(col.steelProfileName);
        if (!profile) return null;      // unknown name → the record's rectangular fallback
        const { D, B, t, T } = SteelProfileLibrary.toMetres(profile);
        return { D, B, t, T };
    }

    private _injectCrosshair(
        drawing: DrawingSurface,
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
        drawing: DrawingSurface,
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

        const projected = projectToDrawingSpace(lineSegs, drawing);
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
