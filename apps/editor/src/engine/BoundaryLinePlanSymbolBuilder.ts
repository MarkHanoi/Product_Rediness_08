/**
 * BoundaryLinePlanSymbolBuilder — the construction / setting-out BOUNDARY LINE, in PLAN.
 *
 * §FIX-BOUNDARY-LINE-INVISIBLE-IN-PLAN (L-10502) · C106 · C102 · C84 EI-4 · L-9948.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS: THE FOUNDER DREW IT IN PLAN AND COULD ONLY SEE IT IN 3-D.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Verbatim, 2026-08-24:
 *
 *     "I could see the boundary line in 3D view but NOT in plan view — which is
 *      where we define it and where I saw the preview."
 *
 * ─── TWO CANDIDATE MECHANISMS. ONE WAS REAL, ONE WAS A MISREAD. ───────────────
 * The lane brief carried a strong hypothesis: that plan was invisible because the
 * boundary line sat on `EDITOR_LAYER` (mask 2) while the plan camera never enables
 * it. A probe line was quoted as evidence:
 *
 *     parent : Scene › pryzm-parcel-boundary-outline
 *     Line | - | - | 6600ff | layer:EDITOR(mask 2) | VISIBLE
 *
 * ⛔ THAT PROBE IS ABOUT A DIFFERENT OBJECT. `grep -rn 'pryzm-parcel-boundary-outline'`
 * → ONE hit, `apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts:188`. That is the
 * SITE PARCEL outline — `Parcel.boundary`, C19 §1.4, the legal surveyed lot line — and
 * `plugins/boundary-line/src/index.ts` opens by stating in as many words that it is NOT
 * this element. The two share a word and nothing else. `BoundaryLineMeshBuilder` calls
 * `.layers` nowhere at all, so its groups sit on `BIM_LAYER` (the THREE default), which
 * is exactly where BIM geometry belongs. **The EDITOR-layer hypothesis is REFUTED.**
 *
 * ⭐ AND THE LAYER COULD NOT HAVE BEEN THE ANSWER ANYWAY, because the plan pane the
 * founder draws in is NOT a THREE camera. `PlanViewCanvas` is a **Canvas2D** renderer:
 * it fills white, draws the grid, then traverses `viewTechnicalDrawingCache.get(viewId)`
 * for `THREE.LineSegments` and strokes them with the Contract-23 pen table. Its own
 * `_renderSiteContext` header records the same lesson from L-431 — *"Enabling
 * EDITOR_LAYER fixed the three.js plan camera but could not affect this separate
 * Canvas2D renderer"*. No camera-layer change can put anything on that canvas.
 *
 * ⭐ SO THE REAL MECHANISM IS ABSENCE, NOT UNREACHABILITY (C01 §6 rule 6 — the two have
 * opposite fixes). Nothing produced a plan representation for this family. That was
 * already KNOWN and already written down: `BoundaryLineMeshBuilder`'s header names it
 * under *"WHAT THIS DOES NOT DO"* — *"there is no plan SYMBOL builder for this family. A
 * boundary line is 3-D-visible and plan-invisible until one exists. L-9948."* — and
 * `initTools.ts` repeats it at the registration call. This file is that builder.
 *
 * ─── WHAT WAS ALREADY BUILT, AND WHAT WAS MISSING ────────────────────────────
 * Most of the 2-D chain for this family SHIPPED with §FEAT-CONSTRUCTION-BOUNDARY-LINE
 * (L-7950) and was simply never reachable:
 *   · `PenWeightTable` has a `'boundary-line'` PROJECTION pen — dashed `[10, 4]`.   ✅
 *   · `DrawingZone.DATUM_CATEGORIES` already lists `boundary-line`.                 ✅
 *   · `VGSceneApplicator` already maps `BoundaryLine` → `'boundary-line'`.          ✅
 *   · `VisibilityIntentDefaults` already carries the family.                        ✅
 *   · ⛔ `penCategoryForLayerTag()` had NO arm for it — so even a correctly-tagged
 *        line resolved to the generic fallback and the authored pen was DEAD.
 *   · ⛔ `ISO_LAYER_TO_VG_CATEGORY` had no `A-CONS` row — so the linework was
 *        UNCLASSIFIED and the VG panel had no toggle for it.
 *   · ⛔ NOTHING EMITTED ANY LINEWORK AT ALL.
 * The first two are closed in `PenWeightTable.ts` / `DrawingLayerIdentity.ts`; the
 * third is closed here. A pen with no producer and a producer with no pen are the same
 * defect seen from two ends, and this family had both.
 *
 * ─── WHY IT LIVES IN apps/editor AND NOT IN @pryzm/geometry-boundary-line ─────
 * The SAME measured reason its 3-D sibling does, and that sibling states it in full:
 * `geometry-boundary-line` declares three dependencies and would need
 * `@pryzm/renderer-three`, `@pryzm/core-app-model` AND `@thatopen/components` added to
 * emit a single line. A `workspace:*` addition rewrites `pnpm-lock.yaml`, and this tree
 * is shared with nine live lanes — `[[agent-packagejson-breaks-frozen-lockfile]]` is the
 * standing receipt for what that costs. `apps/editor` already depends on all three.
 * Keeping the pair together also means the 2-D and 3-D producers for this family sit in
 * one directory and are read side by side.
 *
 * ─── P2 (single THREE owner) ─────────────────────────────────────────────────
 * THREE arrives via `@pryzm/renderer-three/three`, exactly as every other symbol
 * builder takes it. No raw `import * as THREE from 'three'`.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { registerSegmentUUID, type ViewDefinition } from '@pryzm/core-app-model';
import {
    boundaryLineSolid,
    resolveBoundaryLineDimensions,
    resolveBoundaryLineSolidity,
    type BoundaryLineData,
} from '@pryzm/geometry-boundary-line';
import type { BoundaryLineRenderInput } from './BoundaryLineMeshBuilder';

/**
 * ISO 13567 layer for construction / setting-out linework.
 *
 * ⭐ MINTED HERE, and `A-CONS` was genuinely free — `grep -rn 'A-CONS' packages apps`
 * → 0 hits before this change. It is registered in `ISO_LAYER_TO_VG_CATEGORY`
 * (→ `'boundary-line'`) and matched by `penCategoryForLayerTag`, so the ONE tag drives
 * the pen, the VG category and the DXF layer together. A layer name that only one of
 * the three knows about is how "drawn but ungovernable" is born.
 *
 * ⛔ NOT `A-GRID`. A column grid and a setting-out line are both datums, but they are
 * different datums with different names, different bubbles and different ownership —
 * sharing a layer would make the founder's "hide the boundary lines" also hide his
 * structural grid.
 */
const BOUNDARY_LINE_LAYER = 'A-CONS';

/** One line, resolved: the record plus the storey datum it stands on, in world metres. */
export interface BoundaryLinePlanEntry {
    readonly record: BoundaryLineRenderInput;
    /**
     * ⛔ RESOLVED BY THE CALLER AND HANDED DOWN AS A NUMBER. A builder that can reach
     * for an elevation can reach for the WRONG one, and a silent `?? 0` files every line
     * on the ground floor (§DIAG-WALL-LEVEL). Its 3-D sibling takes the same parameter
     * for the same reason, and `initTools.ts` already owns the one resolver both use.
     */
    readonly baseElevation: number;
}

/**
 * Reads every boundary line on a given level. Injected rather than reached for, so this
 * module holds no store reference, no `window` global and no cache — the C106 §1 "one
 * authority" property is preserved by not acquiring a second route to it.
 */
export type BoundaryLinePlanReader = (levelId: string) => readonly BoundaryLinePlanEntry[];

/** What one `inject()` did, so a caller (or a test) can assert on it rather than on a log. */
export interface BoundaryLinePlanInjectionOutcome {
    /** Lines that emitted at least one segment. */
    readonly injected: number;
    /** Lines the reader returned that emitted nothing, and why — never silently dropped. */
    readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export class BoundaryLinePlanSymbolBuilder {
    private readonly _read: BoundaryLinePlanReader | null;

    constructor(read: BoundaryLinePlanReader | null) {
        this._read = read;
    }

    /**
     * Inject this view's boundary-line linework into the technical drawing.
     *
     * Plan-family views only. An elevation or section would show a ground-plane
     * setting-out line edge-on as a single meaningless stroke, which is the same reason
     * `PlanViewCanvas._renderSiteContext` refuses non-plan views for the parcel ring.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): BoundaryLinePlanInjectionOutcome {
        const none: BoundaryLinePlanInjectionOutcome = { injected: 0, skipped: [] };
        if (
            viewDef.viewType !== 'plan' &&
            viewDef.viewType !== 'detail' &&
            viewDef.viewType !== 'structural-plan'
        ) return none;

        if (!this._read) {
            // ⚠ NAMED, not silent. An uninstalled builder and a project with no boundary
            // lines produce the same picture, and they are different facts
            // (§context-data-honesty — failure and emptiness are the same VALUE and must
            // not be the same MESSAGE).
            console.warn(
                '[BoundaryLinePlanSymbolBuilder] no reader installed — boundary lines will be ' +
                'ABSENT from plan. `installBoundaryLinePlanSymbolBuilder()` was not called.',
            );
            return none;
        }

        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return none;

        const entries = this._read(levelId);
        if (entries.length === 0) return none;

        if (!drawing.layers.has(BOUNDARY_LINE_LAYER)) {
            drawing.layers.create(BOUNDARY_LINE_LAYER);
        }

        let injected = 0;
        const skipped: { id: string; reason: string }[] = [];

        for (const entry of entries) {
            const positions = this._linework(entry);
            if (positions.length < 6) {
                skipped.push({
                    id: entry.record.id,
                    reason: `resolved to ${positions.length / 6} segment(s) — a line needs at least one`,
                });
                continue;
            }
            this._emit(drawing, positions, entry.record.id);
            injected++;
        }

        if (injected > 0 || skipped.length > 0) {
            console.log(
                `[BoundaryLinePlanSymbolBuilder] Injected ${injected} boundary line(s) ` +
                `into view ${viewDef.id} (level ${levelId})` +
                (skipped.length > 0 ? ` — ${skipped.length} skipped: ` +
                    skipped.map(s => `${s.id} (${s.reason})`).join('; ') : ''),
            );
        }
        return { injected, skipped };
    }

    /**
     * The world-space segment pairs for one line.
     *
     * ⭐ THE REPRESENTATION IS DECIDED BY THE SAME RESOLVERS THE 3-D BUILDER ASKS —
     * `resolveBoundaryLineSolidity` and `resolveBoundaryLineDimensions`, not by a branch
     * of this file's own. That is the whole point: plan and 3-D cannot disagree about
     * whether a given record is a solid or a linework, because neither of them decides.
     * (§FIX-STAIR-SHAPE-DESYNC is what happens when two surfaces each answer that
     * question for themselves.)
     *
     *   SOLID     — the extrusion's FOOTPRINT, one closed ring per segment. This is what
     *               a plan is: a cut through the thing, not its centreline.
     *   LINEWORK  — the centreline polyline, closed when the record is closed.
     *
     * ⚠ `closed` RE-CLOSES HERE, and must. The schema's third refine forbids repeating
     * the first vertex in the record (*"a closed boundary line must be an OPEN loop"*),
     * so the closing segment exists nowhere in the data and every consumer draws it
     * itself — its 3-D sibling does exactly the same thing. A builder that forgot would
     * render every closed ring as an open path, which is the founder's ENTER complaint
     * reappearing one layer down.
     */
    private _linework(entry: BoundaryLinePlanEntry): number[] {
        const line = entry.record;
        const verts = line.vertices ?? [];
        if (verts.length < 2) return [];

        const dims = resolveBoundaryLineDimensions(line);
        const solidity = resolveBoundaryLineSolidity(line);
        const positions: number[] = [];

        if (solidity.solid) {
            const slices = boundaryLineSolid(line as BoundaryLineData, dims, entry.baseElevation);
            for (const slice of slices) {
                const ring = slice.footprint;
                if (ring.length < 3) continue;
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[i]!;
                    const b = ring[(i + 1) % ring.length]!;
                    positions.push(a.x, slice.baseY, a.z, b.x, slice.baseY, b.z);
                }
            }
            // Every segment degenerate — fall through to the centreline rather than
            // emitting nothing. A record that commits and cannot be seen is the exact
            // defect this file closes; drawing SOMETHING true beats drawing nothing.
            if (positions.length >= 6) return positions;
        }

        const baseY = entry.baseElevation + dims.baseOffset;
        const last = line.closed && verts.length > 2 ? verts.length : verts.length - 1;
        for (let i = 0; i < last; i++) {
            const a = verts[i]!;
            const b = verts[(i + 1) % verts.length]!;
            positions.push(a.x, baseY, a.z, b.x, baseY, b.z);
        }
        return positions;
    }

    /**
     * One `LineSegments` → drawing space → the `A-CONS` layer → the selection index.
     *
     * ⭐ `registerSegmentUUID` IS WHAT MAKES IT SELECTABLE, and it is not optional here.
     * `PlanViewCanvas.hitTest()` walks `drawing.three` for `LineSegments` carrying an
     * element UUID and NOTHING else. `LightingPlanSymbolRenderer`'s header is the
     * cautionary tale, measured and written down under §FIX-LIGHT-PLAN-UNSELECTABLE
     * (L-10081): lighting paints its plan symbol straight onto the 2-D canvas from the
     * store, contributes zero `LineSegments`, and *"the symbol was drawn and
     * hit-testable by nothing"*. That canvas-paint route is shorter and it is exactly
     * the route NOT taken here — the founder asked for the boundary line to be
     * SELECTABLE, and painting it directly would have satisfied "visible in plan" while
     * silently guaranteeing the other half could never work.
     *
     * The material colour is a placeholder the canvas never reads: the pen comes from
     * `PenWeightTable`'s `boundary-line` row via the layer tag (Contract 23 §7.1 — the
     * pen table is the ONE style authority, and `material.linewidth` being mistaken for
     * an authored weight is a bug this repo has already paid for once, at L-241 P5).
     */
    private _emit(drawing: OBC.TechnicalDrawing, positions: number[], elementId: string): void {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const segs = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        segs.updateWorldMatrix(true, false);

        const projected = OBC.TechnicalDrawing.toDrawingSpace(segs, drawing);
        // Stamped BEFORE `addProjectionLines` so `composeLayerTag` can read it off
        // `userData.layerName` even where the drawing's own layer bookkeeping does not
        // reach the child — the belt-and-braces the opening builders use.
        projected.userData['layerName'] = BOUNDARY_LINE_LAYER;
        projected.userData['elementType'] = 'boundaryLine';
        projected.userData['elementUUID'] = elementId;
        drawing.addProjectionLines(projected, BOUNDARY_LINE_LAYER);
        registerSegmentUUID(drawing, projected, elementId);
    }
}

/**
 * Mutable singleton, the `columnPlanSymbolBuilder` idiom (§COLUMN-AUDIT-2026 §W8).
 *
 * `EdgeProjectorService` imports the reference at module load, long before any runtime
 * exists; `initTools` calls `installBoundaryLinePlanSymbolBuilder(reader)` once the
 * composed runtime has produced `runtime.stores.boundaryLine`. Until then the stub is a
 * safe no-op that WARNS rather than throwing — and warns rather than staying quiet,
 * because a silent stub and an empty project draw the identical (blank) plan.
 */
export let boundaryLinePlanSymbolBuilder = new BoundaryLinePlanSymbolBuilder(null);

export function installBoundaryLinePlanSymbolBuilder(
    read: BoundaryLinePlanReader,
): BoundaryLinePlanSymbolBuilder {
    boundaryLinePlanSymbolBuilder = new BoundaryLinePlanSymbolBuilder(read);
    return boundaryLinePlanSymbolBuilder;
}
