/**
 * FloorPlanToolHandler — Phase 11 (Contract 19) · Sprint §49 (Drawing-mode parity)
 *
 * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — THE PLAN PATH NOW COMMITS THE SAME RECORD.
 * ─────────────────────────────────────────────────────────────────────────────────────
 * The founder: *"Floor finish creation in PLAN VIEW (auto) doesn't bring the UI modal that
 * is required and IS WORKING on 3D VIEW — which provides the ELEVATION LEVEL of the floor
 * finish."*
 *
 * He was right, and the defect ran deeper than the missing dialogue. This handler used to
 * dispatch `floor.create` with `{ floorId, ifcGuid, polygon, levelId, hostRoomId? }` and
 * NOTHING ELSE — no finish TYPE, no LAYERS, no THICKNESS, no BASE OFFSET (the FFL elevation).
 * The three missing dimensions were then re-invented by THREE different downstream defaults
 * (plugin `resolveFinishSeating` → 15 mm @ 15 mm; the initTools bus→legacy mirror that feeds
 * the MESH builder → 75 mm @ 0; the 3D tool → 15 mm @ 75 mm), so a plan-drawn finish and a
 * 3D-drawn finish of the "same" floor were not the same object — and the plan one was meshed
 * from the WRONG one of the three. The finish TYPE the plan user had already chosen in the
 * FloorModePicker dropdown was dropped too: that dropdown writes `floorTool.setSystemTypeId()`,
 * a 3D-tool instance field this handler had no way to read.
 *
 * THE CURE (C11 §3 — parity BY CONSTRUCTION, not by convention): this handler does not
 * imitate the 3D tool. Both tools now WRITE the architect's choice to, and RESOLVE the
 * concrete record from, the ONE chokepoint below them — `FloorToolConfigStore` +
 * `resolveFloorFinish()` in `@pryzm/core-app-model/stores` — and both show the ONE shared
 * `getFloorFinishCreationModal()`. The modal is merely a UI that FEEDS the resolution; the
 * RECORD is what is guaranteed identical (see `apps/editor/__tests__/floorCreationParity.test.ts`).
 *
 * NO DIMENSION LITERAL MAY APPEAR IN THIS FILE. A number typed into a tool handler is, by
 * definition, a number the other creation path cannot see — that IS the disease.
 *
 * Polygon tool for placing floors (floor finishes) in plan view, with the
 * same drawing-mode UX as the wall plan tool:
 *   • LINEAR    — freeform polygon, click to add vertex
 *   • ORTHO     — 90°-constrained polygon (axis-only segments)
 *   • CURVED    — arc segments (currently routes to LINEAR)
 *   • RECTANGLE — 2-click axis-aligned rectangle, commits immediately
 *   • AUTO      — single click inside a room → uses room boundary
 *
 * Mode is read on every interaction from `window.floorModePicker.getActiveMode()`
 * so the user can switch via the FloorDrawingHUD mid-session.
 *
 * Continuous creation: after each commit the polygon resets but the handler
 * stays active.  Only ESC / explicit deactivate tears down.
 */

import { createId } from '@pryzm/schemas';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
// §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) — the SAME canonical inner-face
// derivation the batch generators use, so an AUTO-from-room finish sits inside the
// walls (not on their centreline) regardless of entry point (C11: one pipeline).
import { resolveRoomFinishBoundary, type RoomFinishWall } from '@pryzm/room-topology';
// §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4 · C79 §5.2.0).
import { boundingWallIdsOrUnknown } from '@pryzm/core-app-model';
// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the ONE floor-finish chokepoint (store +
// resolver), and the ONE catalogue the modal's finish dropdown is built from. Pure imports:
// no THREE, no DOM — the resolver is the same one `FloorTool` (3D) calls.
import {
    getFloorToolConfig, setFloorToolConfig, resolveFloorFinish,
    floorSystemTypeStore, computeFloorArea,
    type FloorToolConfig, type ResolvedFloorFinish,
} from '@pryzm/core-app-model/stores';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import type { FloorPickerMode } from '@app/ui/FloorModePicker';
// §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06) — the ONE arc model for curved boundary
// segments: the wall tool's midpoint-Bézier semantics + tessellation density, shared
// with the 3D FloorTool/CeilingTool (no second arc representation).
// §FEAT-SLAB-DRAW-MODES (2026-08-06) — `orthoConstrain` is the WALL tool's
// `_snapOrtho`, lifted into geometry-slab so slab / floor / ceiling share it.
// This handler used to carry a PRIVATE `_orthoSnap` that projected onto the
// dominant axis instead of snapping the direction and preserving the radial
// distance — visually orthogonal, numerically NOT what the wall tool commits.
import { arcSegmentThroughMidpoint, orthoConstrain } from '@pryzm/geometry-slab';
// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the SAME modal instance the 3D FloorTool is
// given in initTools. Precedent for a plan handler using a UI service singleton:
// AnnotationPlanToolHandlers → `pryzmAnnotationInput`. (Contract 21 §2 forbids a handler
// attaching DOM listeners to the CANVAS; it does not forbid using a UI service.)
import { getFloorFinishCreationModal } from '@app/ui/ElementCreationModal';
// §REGION-HOST-ATTRIBUTION (C79 §6.3 ROW 10) — this handler was CAPABILITY ABSENT: zero
// occurrences of `region`, so per C79 §0.1(4) it could not INHERIT the fix `9fd9c5b6`
// applied to `CreateFloorCommand`. The AUTO-from-room gesture below is now that region
// mode, and per the §10.3 decision it DERIVES FROM THE ROOM through the ONE shared
// attributor rather than growing a tracer of its own (§6.5). §6.6 forbids the cheap
// version — a region path that emits coordinates would create the §0 defect NEW.
import {
    attributeFinishRegion,
    formatFinishRegionReport,
    formatFinishRegionRefusal,
    type FinishRegionAttribution,
} from './finishRegionAttribution';
// The sketch is attached through the COMMAND LAYER (C03/P6 — commands are the only
// mutation path) via the ONE authorised typed→legacy bridge file, exactly as the
// slab plan tool does. See that function's header for why a second command.
import { attachFloorSketchViaLegacyBridge } from '../../initBusHandlers';

const STROKE = '#10b981';
const FILL_A = 'rgba(16,185,129,0.10)';

export class FloorPlanToolHandler implements PlanToolHandler {
    private _ctx:         PlanToolDrawContext | null = null;
    private _points:      WorldPoint[] = [];
    private _cursorPoint: WorldPoint | null = null;
    private _rectAnchor:  WorldPoint | null = null;
    // §FEAT-BOUNDARY-CURVE-DRAW — CURVED mode pending arc midpoint (wall 3-click pattern).
    private _arcMidPt:    WorldPoint | null = null;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per the
    // PlanToolHandler.hasActiveStroke?() contract. Returns true while a
    // polygon/rectangle is being built so the overlay suspends focus (instead
    // of deactivating + wiping state) when the user briefly leaves the canvas.
    hasActiveStroke(): boolean { return this._points.length > 0 || this._rectAnchor !== null || this._arcMidPt !== null; }

    activate(ctx: PlanToolDrawContext): void {
        this._ctx         = ctx;
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._arcMidPt    = null;
    }

    deactivate(): void {
        // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the finish modal is shown from THIS
        // handler, so it must not outlive it: a tool switch mid-dialogue would otherwise leave
        // an orphaned dialogue whose Confirm commits into a torn-down context. The 3D FloorTool
        // discharges the same obligation via `deps.dismissCreationModal()`.
        getFloorFinishCreationModal().dismiss();
        this._clearOverlay();
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._arcMidPt    = null;
        this._ctx         = null;
    }

    onMouseMove(pt: WorldPoint): void {
        const mode = this._currentMode();
        // RECTANGLE preview kicks in once an anchor is set
        if (mode === 'rectangle' && this._rectAnchor) {
            this._cursorPoint = pt;
            this._drawPreview();
            return;
        }
        // ORTHO snap relative to last vertex
        if (mode === 'ortho' && this._points.length > 0) {
            this._cursorPoint = this._orthoSnap(this._points[this._points.length - 1], pt);
            this._drawPreview();
            return;
        }
        if (this._points.length > 0) {
            this._cursorPoint = pt;
            this._drawPreview();
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = this._currentMode();

        // ── AUTO_FROM_ROOM — single click commits using room boundary ────────
        if (mode === 'auto') {
            this._commitFromRoomAt(pt);
            return;
        }

        // ── RECTANGLE — 2-point axis-aligned commit ──────────────────────────
        if (mode === 'rectangle') {
            if (!this._rectAnchor) {
                this._rectAnchor = pt;
                this._points     = [pt];
                this._cursorPoint = pt;
                this._drawPreview();
                console.log('[FloorPlanToolHandler] Rectangle anchor set', pt);
                return;
            }
            const a = this._rectAnchor;
            const b = pt;
            const minX = Math.min(a.worldX, b.worldX);
            const maxX = Math.max(a.worldX, b.worldX);
            const minZ = Math.min(a.worldZ, b.worldZ);
            const maxZ = Math.max(a.worldZ, b.worldZ);
            if (maxX - minX < 0.01 || maxZ - minZ < 0.01) {
                console.warn('[FloorPlanToolHandler] Rectangle too small — ignoring');
                return;
            }
            const mk = (x: number, z: number): WorldPoint =>
                ({ worldX: x, worldZ: z } as WorldPoint);
            this._points = [
                mk(minX, minZ),
                mk(maxX, minZ),
                mk(maxX, maxZ),
                mk(minX, maxZ),
            ];
            this._commit();
            return;
        }

        // ── CURVED — §FEAT-BOUNDARY-CURVE-DRAW: vertex → arc MIDPOINT → arc END
        // (the wall tool's 3-click pattern); the Bézier segment is tessellated into
        // the polygon so every downstream consumer works unchanged. ──────────────
        if (mode === 'curved' && this._points.length > 0) {
            if (!this._arcMidPt) {
                this._arcMidPt = pt;
                this._cursorPoint = pt;
                this._drawPreview();
                console.log('[FloorPlanToolHandler] Arc midpoint set', pt);
                return;
            }
            const last = this._points[this._points.length - 1];
            const run = arcSegmentThroughMidpoint(
                { x: last.worldX, z: last.worldZ },
                { x: this._arcMidPt.worldX, z: this._arcMidPt.worldZ },
                { x: pt.worldX, z: pt.worldZ },
            );
            for (const v of run) this._points.push({ worldX: v.x, worldZ: v.z } as WorldPoint);
            this._arcMidPt = null;
            this._drawPreview();
            console.log(`[FloorPlanToolHandler] Arc segment committed (${run.length} tessellated verts). total: ${this._points.length}`);
            return;
        }

        // ── LINEAR / ORTHO — polygon vertex add ──────────────────────────────
        const vertex = (mode === 'ortho' && this._points.length > 0)
            ? this._orthoSnap(this._points[this._points.length - 1], pt)
            : pt;
        this._points.push(vertex);
        this._drawPreview();
        console.log('[FloorPlanToolHandler] Point added', vertex, `total: ${this._points.length} mode: ${mode}`);
    }

    onDoubleClick(_pt: WorldPoint): void {
        const mode = this._currentMode();
        if (mode === 'rectangle' || mode === 'auto') return;
        if (this._arcMidPt) return; // arc midpoint pending — dbl-click must not eat the end click
        if (this._points.length >= 3) this._commit();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Enter' && this._points.length >= 3 && this._currentMode() !== 'rectangle' && !this._arcMidPt) {
            e.preventDefault();
            this._commit();
            return true;
        }
        if (e.key === 'Backspace' && this._arcMidPt) {
            // §FEAT-BOUNDARY-CURVE-DRAW — re-pick the pending arc midpoint first.
            this._arcMidPt = null;
            this._drawPreview();
            return true;
        }
        if (e.key === 'Backspace' && this._points.length > 0) {
            this._points.pop();
            if (this._points.length === 0) this._rectAnchor = null;
            this._drawPreview();
            return true;
        }
        return false;
    }

    cancel(): void {
        // ESC cancels the FLOOR, dialogue included (L-255).
        getFloorFinishCreationModal().dismiss();
        this._resetForNext();
    }

    redraw(): void {
        if (this._points.length > 0) this._drawPreview();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _currentMode(): FloorPickerMode {
        const picker = window.floorModePicker;
        return (picker?.getActiveMode?.() as FloorPickerMode) ?? 'linear';
    }

    /**
     * §FEAT-SLAB-DRAW-MODES — delegates to the ONE ortho constraint (the wall
     * tool's, verbatim). Kept as a private adapter purely to translate between
     * `WorldPoint` and the pure `{x,z}` the shared model speaks.
     */
    private _orthoSnap(from: WorldPoint, to: WorldPoint): WorldPoint {
        const v = orthoConstrain(
            { x: from.worldX, z: from.worldZ },
            { x: to.worldX,   z: to.worldZ   },
        );
        return { worldX: v.x, worldZ: v.z } as WorldPoint;
    }

    private _commitFromRoomAt(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[FloorPlanToolHandler] AUTO: ViewDefinition.spatial.levelId is missing');
            return;
        }

        const roomStore = window.roomStore; // TODO(TASK-08)
        if (!roomStore) {
            console.warn('[FloorPlanToolHandler] AUTO: roomStore not available on window');
            return;
        }

        const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
        const room = rooms.find(r => {
            const poly = r.boundary?.polygon;
            return poly && this._pointInPolygon({ x: pt.worldX, z: pt.worldZ }, poly);
        });
        if (!room) {
            console.warn('[FloorPlanToolHandler] AUTO: no room found at clicked point');
            return;
        }

        // §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) — the room boundary polygon runs
        // along the wall CENTRELINES; a finish built on it overshoots into every wall by
        // half its thickness. Derive the INNER-FACE polygon with the SAME canonical helper
        // the batch generators use so UI-created and batch-created finishes for the same
        // room are identical. Fail-safe inside the helper falls back to the centreline.
        const centreline = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
        const polygon = this._innerFacePolygon(room, levelId, centreline);

        // §REGION-HOST-ATTRIBUTION (C79 §6.3 row 10) — attribute the FINAL STORED ring to
        // the walls of the clicked room, or REFUSE. Computed here, on the stored ring, so
        // the emitted edges are index-aligned with the polygon that is actually committed.
        const attribution = attributeFinishRegion(polygon, room, this._wallLookup());

        // §2.3 / §5.2.0 — THE HONEST REFUSAL. The room's OWN boundary relationship is
        // undetermined (`boundingWallIds` absent — a field naming a dependency that no
        // producer wrote), so there is nothing to bound this finish BY. C79 §9.7 warns the
        // transitive design is `undetermined` whenever the room's detection is; §10.3
        // reason 3 answers that this is the honest answer, not a cost to engineer around.
        // Refusing is not a degraded create — NOTHING is created, because a floor invented
        // over an undetermined room is exactly the wrong-host state §2.3 forbids.
        if (attribution.kind === 'refused') {
            console.warn(formatFinishRegionRefusal('FloorPlanToolHandler', 'floor', attribution.determination));
            this._resetForNext();
            return;
        }

        // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — AUTO used to commit RIGHT HERE, with no
        // modal and no finish parameters at all. It now goes through the SAME
        // resolve-then-commit chokepoint as every other mode, so the founder's "auto" click
        // asks for the elevation exactly as the 3D tool does — and, more importantly, commits
        // the same RECORD whether he answers the dialogue or accepts its defaults.
        this._resolveThenCommit(polygon, levelId, room.id, attribution);
    }

    /**
     * §REGION-HOST-ATTRIBUTION — the wall lookup the shared attributor needs. Kept as a
     * one-line adapter (rather than reaching into `window` inside the pure module) so the
     * attributor stays store-free and unit-testable.
     */
    private _wallLookup(): { getById?: (id: string) => any } | undefined {
        return window.wallStore as { getById?: (id: string) => any } | undefined; // TODO(TASK-08)
    }

    /**
     * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — THE ONE COMMIT PATH for every plan drawing
     * mode (LINEAR / ORTHO / CURVED / RECTANGLE / AUTO).
     *
     * Step 1 — SHOW the shared floor-finish modal (the same instance the 3D FloorTool shows),
     *          seeded from the shared config store through the shared resolver.
     * Step 2 — WRITE the architect's answer back to the shared store (so the choice persists
     *          across the next gesture, and across a switch to the 3D tool — one truth).
     * Step 3 — RE-RESOLVE from the store and dispatch ONE `floor.create` (C16: one gesture =
     *          one undo entry).
     *
     * Cancelling the modal cancels the FLOOR, not just the dialogue — nothing is committed.
     */
    private _resolveThenCommit(
        polygon: Array<{ x: number; z: number }>,
        levelId: string,
        hostRoomId?: string,
        /**
         * §REGION-HOST-ATTRIBUTION — present ONLY for the region (AUTO-from-room) gesture.
         * Absent for the hand-drawn modes, and that absence is meaningful: a polygon the
         * user drew freehand expresses "this quadrilateral", not "the floor of this room"
         * (C79 §0), so it correctly carries no host references. §1.5 requires the two to
         * remain distinguishable in the record, and they are — one has a sketch, one does
         * not. This is NOT a silently-dropped relationship; there was never one to keep.
         */
        attribution?: Extract<FinishRegionAttribution, { kind: 'attributed' }>,
    ): void {
        const seeded = resolveFloorFinish(this._floorConfig(), floorSystemTypeStore);

        getFloorFinishCreationModal().show({
            params: {
                kind:         'floor',
                thickness:    seeded.thicknessM,
                baseOffset:   seeded.baseOffsetM,   // ← the ELEVATION the founder asked for
                systemTypeId: seeded.systemTypeId,
            },
            polygonArea: computeFloorArea(polygon),
            systemTypes: this._floorTypeOptions(),
            onConfirm: (params) => {
                if (params.kind !== 'floor') return;
                // The modal FEEDS the store; it is not itself the source of truth.
                setFloorToolConfig({
                    thicknessM:   params.thickness,
                    baseOffsetM:  params.baseOffset,
                    systemTypeId: params.systemTypeId ?? '',
                });
                this._dispatchCreate(polygon, levelId, hostRoomId, attribution);
                this._resetForNext();
            },
            onCancel: () => {
                this._resetForNext();
            },
        });
    }

    /**
     * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the dispatch. Every dimension in the payload
     * is RESOLVED, never typed: `resolveFloorFinish()` is the same call `FloorTool._createFloor()`
     * makes, so the two paths' records are identical BY CONSTRUCTION.
     *
     * THE GUARD (not a hope — an assertion): the plan path CANNOT commit unless the elevation
     * (baseOffset) and the thickness resolved to real numbers. An unresolved finish is exactly
     * the state that produced the founder's bug, and it must be un-committable, not merely
     * unlikely.
     *
     * [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary.
     *
     * §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — the BUS `floor.create` handler
     * (`CreateFloorHandler`, L7) exposes ONLY the `floor` store, so it cannot derive the
     * inner-face boundary (rooms/walls live in other stores and `pryzm/store-single-channel`
     * forbids a second store). This tool therefore sends the FINISHED boundary. `hostRoomId`
     * is sent so plan AUTO floors are linked to their room (`coveredRoomIds`, schedules).
     */
    private _dispatchCreate(
        polygon: Array<{ x: number; z: number }>,
        levelId: string,
        hostRoomId?: string,
        attribution?: Extract<FinishRegionAttribution, { kind: 'attributed' }>,
    ): void {
        const finish: ResolvedFloorFinish = resolveFloorFinish(
            this._floorConfig(),
            floorSystemTypeStore,
        );

        if (!Number.isFinite(finish.baseOffsetM) || finish.baseOffsetM < 0) {
            console.error(
                '[FloorPlanToolHandler] REFUSING to commit: the floor finish ELEVATION ' +
                '(baseOffset) did not resolve. This is L-255 — a floor finish with no ' +
                'resolved elevation must never reach the record.',
                finish,
            );
            return;
        }
        if (!Number.isFinite(finish.thicknessM) || finish.thicknessM <= 0) {
            console.error(
                '[FloorPlanToolHandler] REFUSING to commit: the floor finish THICKNESS did ' +
                'not resolve (L-255).',
                finish,
            );
            return;
        }

        const floorId = createId('floor');
        const ifcGuid = crypto.randomUUID();

        window.runtime?.bus?.executeCommand('floor.create', {
            floorId,
            ifcGuid,
            polygon,
            levelId,
            hostRoomId,
            // The four fields the plan path used to DROP. Resolved, never invented.
            baseOffset:   finish.baseOffsetM,
            thickness:    finish.thicknessM,
            systemTypeId: finish.systemTypeId,
            layers:       finish.layers,
            createdBy:    'user',
        })?.then(() => {
            // §REGION-HOST-ATTRIBUTION (C79 §6.3 row 10) — attach the reference-carrying
            // sketch so the finish FOLLOWS the walls that bound its room, closing the last
            // CAPABILITY-ABSENT row. Attached AFTER the create resolves because the record
            // must exist before it can be updated; the bus `floor.create` payload has no
            // sketch field and its plugin handler is not the authoritative writer (see the
            // bridge's own header).
            if (!attribution) return;
            this._attachRegionSketch(floorId, attribution);
        })?.catch((e: Error) => console.error('[FloorPlanToolHandler] floor.create failed:', e));

        console.log('[FloorPlanToolHandler] Floor created', {
            floorId, hostRoomId, ...finish, layers: finish.layers?.length ?? 0,
        });
    }

    /**
     * §REGION-HOST-ATTRIBUTION — surface the §2.5 counts and attach the sketch.
     *
     * §2.6 — the counts are REPORTED, never absorbed: a region floor with zero host
     * references and one with all four MUST NOT be the same value at the caller, and here
     * they are not — the report names the split and every fallback's reason.
     */
    private _attachRegionSketch(
        floorId: string,
        attribution: Extract<FinishRegionAttribution, { kind: 'attributed' }>,
    ): void {
        const { sketch } = attribution;
        console.log(formatFinishRegionReport('FloorPlanToolHandler', 'floor', sketch));

        const res = attachFloorSketchViaLegacyBridge({
            floorId,
            sketch: { outerLoop: sketch.outerLoop },
            boundingWallIds: sketch.boundingWallIds,
        });
        if (res.success) {
            console.log(
                `[FloorPlanToolHandler] §REGION-HOST-ATTRIBUTION sketch attached to ${floorId} — `
                + `${sketch.attribution.hostEdges} edge(s) now follow their host wall.`,
            );
            return;
        }
        // Loud, not silent: without this the finish is a coincidental polygon again,
        // which is exactly the §0 defect this row exists to close.
        console.warn(
            `[FloorPlanToolHandler] §REGION-HOST-ATTRIBUTION could not attach the sketch to `
            + `${floorId}: ${res.error ?? 'unknown'} — this floor will NOT follow its walls.`,
        );
    }

    /**
     * The architect's floor-finish choice. Prefers the DI'd `ctx.floorConfig` (injected by the
     * plan overlays, mirroring the L-243 stair / L-260 A door DI); falls back to the store
     * directly so a handler built without a context still reads the SAME truth the 3D tool
     * reads. Never a `window.*` read (P4).
     */
    private _floorConfig(): FloorToolConfig {
        return this._ctx?.floorConfig ?? getFloorToolConfig();
    }

    /**
     * The finish catalogue for the modal's dropdown — the SAME `floorSystemTypeStore` the 3D
     * tool's `_resolveFloorTypeOptions()` and the post-creation property panel read.
     */
    private _floorTypeOptions(): Array<{ id: string; name: string; totalThickness: number }> {
        try {
            return floorSystemTypeStore.getAll().map(t => ({
                id: t.id, name: t.name, totalThickness: t.totalThickness,
            }));
        } catch {
            return [];
        }
    }

    /** Continuous-creation: clear the stroke, stay active. */
    private _resetForNext(): void {
        this._points      = [];
        this._cursorPoint = null;
        this._rectAnchor  = null;
        this._arcMidPt    = null;
        this._clearOverlay();
    }

    /**
     * §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH (L-213) · §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS
     * (L-240) — the clicked room's INNER-FACE floor boundary.
     *
     * The store-walking this used to do by hand (boundingWallIds → level walls → derive →
     * centreline fail-safe) was a verbatim copy of `CreateFloorsByRoomTypeCommand`'s. Both now
     * delegate to the ONE canonical, store-injected `resolveRoomFinishBoundary`, so there is a
     * single definition of "which walls bound this room's finish" in the codebase.
     */
    private _innerFacePolygon(
        room: any,
        levelId: string,
        centreline: Array<{ x: number; z: number }>,
    ): Array<{ x: number; z: number }> {
        const wallStore = window.wallStore as {
            getById?: (id: string) => RoomFinishWall | undefined;
            getByLevel?: (levelId: string) => RoomFinishWall[];
        } | undefined; // TODO(TASK-08)
        if (!wallStore) return centreline;
        return resolveRoomFinishBoundary(centreline, {
            roomId: room.id,
            levelId,
            lookup: {
                // The plan tool already holds the full room record from the pick.
                // §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4) — this
                // read `room.boundingWallIds ?? []`, which forged a DETERMINED
                // "this room bounds zero walls" out of a field that was simply
                // absent. `RoomFinishStoreLookup.getRoomById` types
                // `boundingWallIds` as OPTIONAL precisely so a caller CAN say
                // "I do not know", so the honest value is passed through
                // instead of being flattened here.
                //
                // ⚠ HONESTY NOTE — this changes what the CALLER says, not yet
                // what the CALLEE does. `resolveRoomFinishBoundary`
                // (`packages/room-topology/src/RoomPolygonUtils.ts:1373`) does
                // `…?.boundingWallIds ?? []` and then falls back to every wall
                // on the level in BOTH cases, so determined-empty and
                // undetermined still take the same branch downstream. Fixing
                // that is a room-topology change, out of this commit's lane and
                // recorded here as the remaining half of this site rather than
                // claimed as done. The ledger row is therefore NOT struck.
                getRoomById:     () => ({ boundingWallIds: boundingWallIdsOrUnknown(room) as string[] | undefined }),
                getWallById:     (id) => wallStore.getById?.(id),
                getWallsByLevel: (lid) => wallStore.getByLevel?.(lid) ?? [],
            },
        });
    }

    // §C73-PIP-CANONICAL — delegates to THE kernel ray cast.
    private _pointInPolygon(pt: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): boolean {
        return pointInPolygonXZ(pt.x, pt.z, polygon);
    }

    private _commit(): void {
        const c = this._ctx;
        if (!c || this._points.length < 3) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[FloorPlanToolHandler] ViewDefinition.spatial.levelId is missing', c.viewDef.id);
            return;
        }

        // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — DRAW modes go through the SAME
        // resolve-then-commit chokepoint as AUTO. The hand-drawn polygon is the user's stated
        // geometry and is stored VERBATIM (L-240 P3); only the FINISH is resolved.
        this._resolveThenCommit(
            this._points.map(p => ({ x: p.worldX, z: p.worldZ })),
            levelId,
        );
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || this._points.length === 0) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const mode = this._currentMode();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        // ── RECTANGLE preview ────────────────────────────────────────────────
        if (mode === 'rectangle' && this._rectAnchor && this._cursorPoint) {
            const a = this._rectAnchor;
            const b = this._cursorPoint;
            const minX = Math.min(a.worldX, b.worldX);
            const maxX = Math.max(a.worldX, b.worldX);
            const minZ = Math.min(a.worldZ, b.worldZ);
            const maxZ = Math.max(a.worldZ, b.worldZ);
            const corners = [
                planCanvas.worldToScreen(minX, minZ),
                planCanvas.worldToScreen(maxX, minZ),
                planCanvas.worldToScreen(maxX, maxZ),
                planCanvas.worldToScreen(minX, maxZ),
            ];
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(corners[0].sx, corners[0].sy);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;

            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = STROKE;
            ctx.beginPath();
            ctx.moveTo(corners[0].sx, corners[0].sy);
            for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
            ctx.closePath(); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = STROKE;
            for (const p of corners) { ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill(); }
            this._drawHint(ctx, cssH, 'Click to set opposite corner · Esc to finish');
            ctx.restore();
            return;
        }

        // ── POLYGON preview (LINEAR / ORTHO / CURVED) ────────────────────────
        const screenPts = this._points.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));

        // §FEAT-BOUNDARY-CURVE-DRAW — the trailing cursor segment: a straight line,
        // or (curved mode with a pending midpoint) the tessellated Bézier through it.
        const trailingPts: Array<{ sx: number; sy: number }> = [];
        if (this._cursorPoint) {
            if (mode === 'curved' && this._arcMidPt && this._points.length > 0) {
                const last = this._points[this._points.length - 1];
                for (const v of arcSegmentThroughMidpoint(
                    { x: last.worldX, z: last.worldZ },
                    { x: this._arcMidPt.worldX, z: this._arcMidPt.worldZ },
                    { x: this._cursorPoint.worldX, z: this._cursorPoint.worldZ },
                )) {
                    trailingPts.push(planCanvas.worldToScreen(v.x, v.z));
                }
            } else {
                trailingPts.push(planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ));
            }
        }

        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = FILL_A;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            for (const p of trailingPts) ctx.lineTo(p.sx, p.sy);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.setLineDash([6, 3]);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = STROKE;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
        for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
        for (const p of trailingPts) ctx.lineTo(p.sx, p.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arc midpoint indicator (mirrors WallPlanToolHandler's curved-mode marker).
        if (mode === 'curved' && this._arcMidPt) {
            const m = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            ctx.fillStyle = STROKE;
            ctx.beginPath(); ctx.arc(m.sx, m.sy, 5, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = STROKE;
        for (const p of screenPts) {
            ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill();
        }

        if (screenPts.length >= 3 && this._cursorPoint) {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(16,185,129,0.4)';
            ctx.lineWidth   = 1;
            const cur = planCanvas.worldToScreen(this._cursorPoint.worldX, this._cursorPoint.worldZ);
            ctx.beginPath();
            ctx.moveTo(cur.sx, cur.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const modeLabel = mode === 'ortho' ? 'Orthogonal' : (mode === 'curved' ? 'Curved' : 'Linear');
        const hint = (mode === 'curved' && this._points.length > 0)
            ? (this._arcMidPt
                ? 'Curved · Click the arc END point · Backspace to re-pick midpoint'
                : `Curved · Click the arc MIDPOINT${this._points.length >= 3 ? ' · Enter to close floor' : ''}`)
            : this._points.length >= 3
                ? `${modeLabel} · Dbl-click or Enter to close floor`
                : `${modeLabel} · ${3 - this._points.length} more point${3 - this._points.length !== 1 ? 's' : ''} needed`;
        this._drawHint(ctx, cssH, hint);
        ctx.restore();
    }

    private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(16,185,129,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, 12, cssH - 12);
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
