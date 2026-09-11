/**
 * SpaceEnvelopePlanSymbolBuilder — the space envelope, IN PLAN.
 *
 * §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §10 ·
 * RESI-ORCHESTRATOR-PLAN §4 Stage G · C114 §3 / §10 / §14 · C102 · C84 EI-4.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS: THE FAMILY WAS 3-D-VISIBLE AND PLAN-INVISIBLE, AND SAID SO.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `attachSpaceEnvelopeRender`'s header carried the admission verbatim — *"WHAT THIS FILE
 * DOES NOT ESTABLISH. That the prism appears in PLAN or in SECTION. There is no
 * plan-symbol producer for this family"* — and C114 §3 recorded **zero consumers**. The
 * founder's standing complaint about the boundary line (*"I could see it in 3D view but
 * NOT in plan view — which is where we define it"*, 2026-08-24) is the same defect one
 * family over, and it was already logged as L-9948/L-10502 before this family existed.
 *
 * ⭐ SO THIS IS `BoundaryLinePlanSymbolBuilder` APPLIED TO A PRISM, DELIBERATELY. Same
 * constructor, same injected reader, same `inject(drawing, viewDef)` shape, same
 * plan-family gate, same `registerSegmentUUID` ending. C114 §10c's rule — *"what this
 * forbids is a THIRD shape"* — is about the face-move engine, and the same discipline is
 * worth more here: the next family to need a plan symbol should find two matching
 * precedents, not two dialects.
 *
 * ─── WHAT "FILLS" MEANS IN A TECHNICAL DRAWING, AND WHY IT IS A HATCH ─────────
 * The lane brief asks for *"outlines + fills"*. The plan pane is **Canvas2D**
 * (`PlanViewCanvas`), and it draws by traversing `viewTechnicalDrawingCache` for
 * `THREE.LineSegments` and stroking them with the Contract-23 pen table. There are
 * exactly two ways to put a filled shape on it:
 *
 *   1. paint a polygon straight onto the canvas — SHORTER, and the route
 *      `LightingPlanSymbolRenderer` took. §FIX-LIGHT-PLAN-UNSELECTABLE (L-10081)
 *      measured what it costs: the symbol was *"drawn and hit-testable by nothing"*, it
 *      contributes no `LineSegments`, and it therefore reaches no DXF/SVG export either.
 *   2. emit a HATCH — parallel lines clipped to the ring, which is what a fill IS in a
 *      GA drawing. It strokes with the same pen, hit-tests, exports, and prints.
 *
 * ⛔ THIS FILE TAKES ROUTE 2, AND THE CHOICE IS THE POINT. A room envelope reads as a
 * filled area, and it does so through linework that PRYZM can select, govern and export.
 * ⚠ It is therefore NOT a solid colour wash: the per-room COLOUR of the 3-D view does not
 * cross into plan, because the pen table is the one style authority for a drawing
 * (Contract 23 §7.1) and a builder that set its own stroke colour would be the second
 * one. Recorded in C114 §14 as a real limitation rather than described as a fill.
 *
 * ─── WHICH ROLE GETS WHAT ────────────────────────────────────────────────────
 * LEVEL  — outline only. It is the storey's declared extent; hatching it would black out
 *          the drawing and hide every room inside it.
 * ROOM   — outline + hatch, so the rooms read as areas within the level's outline.
 *
 * ─── LAYER ───────────────────────────────────────────────────────────────────
 * `A-AREA` (ISO 13567 — area/space linework), minted by this lane and registered in
 * `ISO_LAYER_TO_VG_CATEGORY` → `'spaceEnvelope'` in the same commit, so the VG governance
 * panel can toggle it. ⚠ `penCategoryForLayerTag` has NO arm for it yet, so the linework
 * takes the generic fallback pen — stated here, and in C114 §14, rather than discovered
 * from a drawing.
 *
 * ─── P2 (single THREE owner) ─────────────────────────────────────────────────
 * THREE arrives via `@pryzm/renderer-three/three`, as every symbol builder takes it.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { registerSegmentUUID, type ViewDefinition } from '@pryzm/core-app-model';
// ⭐ THE GEOMETRY IS A SEPARATE, THREE-FREE MODULE so the ring-closing and the hatch
// clipping can be tested without a WebGL context or `@thatopen/components` — the same
// split every geometry-* package makes, applied inside apps/editor because this producer
// may not add a workspace dependency in a shared tree
// ([[agent-packagejson-breaks-frozen-lockfile]]).
import { hatchSegments, ringSegments } from './spaceEnvelopePlanGeometry';

export { hatchSegments, ringSegments } from './spaceEnvelopePlanGeometry';

/** ISO 13567 layer for authored area / space linework. See the header. */
export const SPACE_ENVELOPE_LAYER = 'A-AREA';

/**
 * §PLAN-SYMBOL-ONLY-STOREY (L-13310) — the view types this family draws on: the plan-family
 * triple `EdgeProjectorService` gates the injector with. ONE set, read by `inject()`, by the
 * drivers' project-or-blank decision (`views/planProjectionDecision.ts`) and by the re-projection
 * request (`attachSpaceEnvelopeRender`), so "which views show an envelope" has one answer.
 */
export const SPACE_ENVELOPE_PLAN_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'detail', 'structural-plan']);

/** One envelope, resolved: the record plus the storey datum it stands on. */
export interface SpaceEnvelopePlanEntry {
    readonly id: string;
    readonly role: string;
    /** OPEN ring on the level's XZ plane, metres (the closing vertex is implied). */
    readonly footprint: readonly { readonly x: number; readonly z: number }[];
    readonly baseOffset: number;
    /**
     * The storey's world elevation when the caller can resolve one, else `null`.
     *
     * ⚠ `null` IS NOT ZERO AND IS NOT DEFAULTED HERE. A plan projection is top-down, so
     * the Y of this linework does not move a single stroke on the page; it is carried
     * (and its absence reported) so that a future SECTION producer cannot inherit a
     * silent `?? 0` — the §DIAG-WALL-LEVEL defect that files every element on the ground
     * floor. When it is null the builder uses `baseOffset` and says so ONCE.
     */
    readonly baseElevation: number | null;
}

/** Reads every space envelope on a given storey. Injected, never reached for. */
export type SpaceEnvelopePlanReader = (levelId: string) => readonly SpaceEnvelopePlanEntry[];

/** What one `inject()` did — assertable, so a test does not have to read a log. */
export interface SpaceEnvelopePlanInjectionOutcome {
    readonly injected: number;
    readonly hatchedRooms: number;
    readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

/**
 * §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — the linework ONE envelope contributes to a plan,
 * as world-space segment pairs `[ax, ay, az, bx, by, bz, …]`, before drawing-space projection.
 */
export interface SpaceEnvelopePlanLinework {
    readonly id: string;
    readonly role: string;
    /** The CLOSED outline. */
    readonly outline: readonly number[];
    /** The 45° hatch of a ROOM; empty for a level (see the header). */
    readonly hatch: readonly number[];
}

/** What one storey's envelopes resolve to in plan — exactly what `inject()` then emits. */
export interface SpaceEnvelopePlanLineworkResult {
    /** `false` ⇒ no reader installed, which is NOT the same fact as a storey with no envelopes. */
    readonly readerInstalled: boolean;
    /** Records the reader returned for the storey, drawable or not. */
    readonly entries: number;
    readonly linework: readonly SpaceEnvelopePlanLinework[];
    readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export class SpaceEnvelopePlanSymbolBuilder {
    private readonly _read: SpaceEnvelopePlanReader | null;
    private _warnedNoElevation = false;

    constructor(read: SpaceEnvelopePlanReader | null) {
        this._read = read;
    }

    /**
     * Inject this view's space-envelope linework into the technical drawing.
     * Plan-family views only — a prism seen edge-on in elevation is a rectangle that
     * says nothing, and the elevation producer for this family does not exist.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ViewDefinition): SpaceEnvelopePlanInjectionOutcome {
        const none: SpaceEnvelopePlanInjectionOutcome = { injected: 0, hatchedRooms: 0, skipped: [] };
        if (!SPACE_ENVELOPE_PLAN_VIEW_TYPES.has(viewDef.viewType)) return none;

        if (!this._read) {
            // ⚠ NAMED, NOT SILENT. An uninstalled builder and a project with no envelopes
            // draw the identical blank plan and are different facts.
            console.warn(
                '[SpaceEnvelopePlanSymbolBuilder] no reader installed — space envelopes will be '
                + 'ABSENT from plan. `installSpaceEnvelopePlanSymbolBuilder()` was not called.',
            );
            return none;
        }

        const levelId = viewDef.spatial?.levelId;
        if (!levelId) return none;

        // ⭐ §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — ONE producer of the linework
        // (`planLinework`), so what a spec asserts about a storey is exactly what is emitted here.
        const resolved = this.planLinework(levelId);
        if (resolved.entries === 0) return none;

        if (!drawing.layers.has(SPACE_ENVELOPE_LAYER)) drawing.layers.create(SPACE_ENVELOPE_LAYER);

        let injected = 0;
        let hatchedRooms = 0;
        const skipped = resolved.skipped;

        for (const lw of resolved.linework) {
            this._emit(drawing, [...lw.outline], lw.id);
            injected += 1;
            // ⭐ THE ROOM READS AS AN AREA. The level does not get one — see the header.
            if (lw.hatch.length >= 6) {
                this._emit(drawing, [...lw.hatch], lw.id);
                hatchedRooms += 1;
            }
        }

        if (injected > 0 || skipped.length > 0) {
            console.log(
                `[SpaceEnvelopePlanSymbolBuilder] Injected ${injected} space envelope(s) `
                + `(${hatchedRooms} hatched) into view ${viewDef.id} (level ${levelId})`
                + (skipped.length > 0
                    ? ` — ${skipped.length} skipped: ${skipped.map((s) => `${s.id} (${s.reason})`).join('; ')}`
                    : ''),
            );
        }
        return { injected, hatchedRooms, skipped };
    }

    /**
     * ⭐ §COMMITTED-ENVELOPE-ON-EVERY-VIEW (L-13310) — the plan linework of every envelope on
     * `levelId`, read LIVE through the installed reader. No drawing and no THREE, so a spec can
     * assert what the plan WILL draw after a real create dispatch — the reader is never cached,
     * so this is always the store's answer at the moment of asking.
     */
    planLinework(levelId: string): SpaceEnvelopePlanLineworkResult {
        if (!this._read) return { readerInstalled: false, entries: 0, linework: [], skipped: [] };
        const entries = this._read(levelId);
        const linework: SpaceEnvelopePlanLinework[] = [];
        const skipped: { id: string; reason: string }[] = [];
        for (const entry of entries) {
            const ring = entry.footprint ?? [];
            if (ring.length < 3) {
                skipped.push({
                    id: entry.id,
                    reason: `ring has ${ring.length} vertex/vertices — an area needs at least 3`,
                });
                continue;
            }
            if (entry.baseElevation === null && !this._warnedNoElevation) {
                this._warnedNoElevation = true;
                console.warn(
                    '[SpaceEnvelopePlanSymbolBuilder] the reader resolved NO storey elevation; using each '
                    + "envelope's own baseOffset. Harmless for a top-down plan (the Y moves no stroke), "
                    + 'and NOT safe for any future section producer — see this file\'s header.',
                );
            }
            const y = entry.baseElevation ?? entry.baseOffset;
            const outline = ringSegments(ring, y);
            if (outline.length < 6) {
                skipped.push({ id: entry.id, reason: 'ring bounds no area — every edge is degenerate' });
                continue;
            }
            linework.push({
                id: entry.id,
                role: entry.role,
                outline,
                hatch: entry.role === 'room' ? hatchSegments(ring, y) : [],
            });
        }
        return { readerInstalled: true, entries: entries.length, linework, skipped };
    }

    /**
     * One `LineSegments` → drawing space → the `A-AREA` layer → the selection index.
     *
     * ⭐ `registerSegmentUUID` IS WHAT MAKES IT SELECTABLE. `PlanViewCanvas.hitTest()`
     * walks the drawing for `LineSegments` carrying an element UUID and nothing else, so
     * an envelope drawn without this would be visible and un-clickable — half of "plan
     * view and 3D talk to each other", which is the half that is easy to miss.
     */
    private _emit(drawing: OBC.TechnicalDrawing, positions: number[], elementId: string): void {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const segs = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        segs.updateWorldMatrix(true, false);

        const projected = OBC.TechnicalDrawing.toDrawingSpace(segs, drawing);
        projected.userData['layerName'] = SPACE_ENVELOPE_LAYER;
        projected.userData['elementType'] = 'spaceEnvelope';
        projected.userData['elementUUID'] = elementId;
        drawing.addProjectionLines(projected, SPACE_ENVELOPE_LAYER);
        registerSegmentUUID(drawing, projected, elementId);
    }
}

/**
 * Mutable singleton, the `boundaryLinePlanSymbolBuilder` idiom.
 *
 * `EdgeProjectorService` imports the reference at module load, long before a runtime
 * exists; `attachSpaceEnvelopeRender` installs the real reader once the composed runtime
 * has produced the store. Until then the stub is a no-op that WARNS rather than staying
 * quiet, because a silent stub and an empty project draw the identical blank plan.
 */
export let spaceEnvelopePlanSymbolBuilder = new SpaceEnvelopePlanSymbolBuilder(null);

export function installSpaceEnvelopePlanSymbolBuilder(
    read: SpaceEnvelopePlanReader,
): SpaceEnvelopePlanSymbolBuilder {
    spaceEnvelopePlanSymbolBuilder = new SpaceEnvelopePlanSymbolBuilder(read);
    return spaceEnvelopePlanSymbolBuilder;
}

/** Uninstall — used on runtime teardown so the next project does not inherit a dead reader. */
export function uninstallSpaceEnvelopePlanSymbolBuilder(): void {
    spaceEnvelopePlanSymbolBuilder = new SpaceEnvelopePlanSymbolBuilder(null);
}
