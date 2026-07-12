/**
 * WallPlanToolHandler — Sprint 2 Phase 5 (Contract 19)
 *
 * Wall creation tool for plan view. Supports four drawing modes, read live from
 * window.wallModePicker.getActiveMode() on every mouse move:
 *
 *   linear   — Free-angle straight polyline (original behaviour, unchanged)
 *   ortho    — Snaps end point to nearest 90° cardinal axis from start
 *   curved   — 3-click arc: start → arc midpoint → end; commits a WallCurve (quadratic Bézier)
 *   byslab   — Not applicable in plan view; falls back to linear
 *
 * Any-angle mode (configurable degree snap) is applied when mode === 'ortho' with
 * a step from wallModePicker.getAngleStep() (falls back to 90°). This matches the
 * contract spec which uses 'ortho' as the primary constrained mode.
 *
 * State machine:
 *   State 0: _wallFirstPoint === null — idle
 *   State 1: _wallFirstPoint set, _arcMidPt === null — awaiting next point
 *            • linear/ortho: click → commit + chain (remains in state 1)
 *            • curved: click → save _arcMidPt → state 2
 *   State 2: _arcMidPt set — awaiting end point (curved only)
 *            • click → commit arc + chain → back to state 1
 */


import { WallDimensionInput } from '@pryzm/geometry-wall';
import { createId } from '@pryzm/schemas';
// §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — pure alignment inference mirrored from
// the 3D tool's WallAlignmentGuide, consumed here for the plan-view wall tool.
import {
    computeWallAlignmentInference,
    type AlignReference,
    type AlignGuide,
} from '@pryzm/snapping';
import { isStrongSnap, type PlanToolHandler, type PlanToolDrawContext, type WorldPoint } from './PlanToolHandler';
import { computeSetOutDimensions, solveSetOutPoint, type SetOutSegment, type SetOutDimension } from './setOutDimensions';
// §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — surface-independent active wall system type, so a
// wall drawn in the SPLIT plan pane carries the same layered systemTypeId as the MAIN view.
import { resolveActiveWallSystemTypeId } from './activeWallSystemType';
// §P2.1 (IMPL-PLAN-2026-05-17): CreateWallCommand + window.commandManager bridge (P4.4).
// Wall creation is now bus-only; no @pryzm/command-registry import needed here.

const WALL_DEFAULT_HEIGHT    = 2.7;
const WALL_DEFAULT_THICKNESS = 0.2;
const ARC_SEGMENTS           = 16;
const DEG                    = Math.PI / 180;
// §WALL-SETOUT (founder 2026-06-21) — set-out dimension colour. Reuses the existing
// in-progress length-label blue (#1e40af). Per C18 §2.4 a set-out dimension is a
// functional MEASUREMENT, not a creation ghost, so it is OUT of the unified-purple
// preview rule (§41) — but we still source ONE colour rather than invent a new hex.
const SETOUT_BLUE = '#1e40af';
// §WALL-SETOUT-4SIDE (founder 2026-07-06) — the SECONDARY set-out pair (the farther
// wall on each axis, newly projected to the two other sides) renders in GREY so the
// user distinguishes it from the PRIMARY (blue) pair. Grey is a neutral non-brand
// tint (slate-500), consistent with C18 §2.4 "functional measurement" state colours.
const SETOUT_GREY = '#64748b';
// §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — alignment guide colours mirror the 3D
// WallAlignmentGuide (blue single-axis lock, cyan double-lock / intersection) so
// the two surfaces read identically. These are inference REFERENCES (a functional
// alignment aid, like the set-out dims), not the creation ghost — out of the
// unified-purple preview rule (§41), same as §WALL-SETOUT.
const ALIGN_GUIDE_BLUE = '#0088ff';
const ALIGN_GUIDE_CYAN = '#00ccff';
// Soft-snap tolerance for the alignment inference, in SCREEN pixels. Converted to
// world metres per-frame via planCanvas.getPixelsPerUnit() so the "tendency to
// stop" feels the same at every zoom level. ~10 px ≈ the 3D tool's 0.15 m feel.
const ALIGN_SNAP_PX = 10;

function _getMode(): string {
    return window.wallModePicker?.getActiveMode?.() ?? 'linear';
}

function _snapOrtho(start: WorldPoint, raw: WorldPoint): WorldPoint {
    const dx    = raw.worldX - start.worldX;
    const dz    = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const step    = Math.PI / 2;
    const snapped = Math.round(angle / step) * step;
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

function _snapAngle(start: WorldPoint, raw: WorldPoint, stepDeg: number): WorldPoint {
    const dx    = raw.worldX - start.worldX;
    const dz    = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const step    = stepDeg * DEG;
    const snapped = Math.round(angle / step) * step;
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

/**
 * Compute a Canvas2D quadratic Bézier control point from three world points.
 * The control point ensures the Bézier curve passes through `midThrough` at t=0.5.
 *   P(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midThrough
 *   ⟹ P1 = 2·midThrough − 0.5·(P0 + P2)
 */
function _bezierControl(
    start: WorldPoint,
    midThrough: WorldPoint,
    end: WorldPoint,
): { x: number; z: number } {
    return {
        x: 2 * midThrough.worldX - 0.5 * (start.worldX + end.worldX),
        z: 2 * midThrough.worldZ - 0.5 * (start.worldZ + end.worldZ),
    };
}

export class WallPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;

    private _wallFirstPoint: WorldPoint | null     = null;
    private _polylineFirstPoint: WorldPoint | null = null;
    private _arcMidPt: WorldPoint | null           = null;   // Phase 5: curved mode mid-click
    private _wallSegmentCount = 0;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per
    // PlanToolHandler.hasActiveStroke?(). The wall tool's chained-polyline mode
    // accumulates segments via _wallFirstPoint + _polylineFirstPoint + arc-mode
    // _arcMidPt. While ANY of these is non-null the user has uncommitted state
    // and a temporary cursor excursion to the toolbar (e.g. picking a system
    // type) must NOT wipe the stroke.
    hasActiveStroke(): boolean {
        return this._wallFirstPoint !== null
            || this._polylineFirstPoint !== null
            || this._arcMidPt !== null;
    }
    private _wallCursorPoint: WorldPoint | null    = null;
    private _wallStatusOverlay: HTMLElement | null = null;
    private _dimInput: WallDimensionInput | null   = null;   // §04-12: typed dimension input

    // §WALL-SETOUT-TAB-INPUT (L-126) — TAB-to-edit numeric entry for set-out dims.
    // When active the user is typing an exact set-out distance (mm) into ONE of the
    // dim fields; the live vertex is back-solved (solveSetOutPoint) so that set-out
    // equals the typed value. Continued TAB cycles the focused field (primary → …
    // → secondary); ENTER commits through the normal wall-creation command (P6).
    private _setOutEditActive = false;
    private _setOutDims: SetOutDimension[] = [];   // snapshot captured on TAB entry
    private _setOutEditIndex = 0;                  // which dim currently has focus
    private _setOutBuffer = '';                    // typed digits (mm) for the focused field
    private _setOutEditPoint: WorldPoint | null = null; // accumulating back-solved vertex

    // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — the dashed inference guides + label
    // for the CURRENT cursor position, recomputed each mouse-move. Empty ⇒ no
    // inference this frame (flag OFF, no start point, or no candidate in tolerance).
    private _alignGuides: AlignGuide[] = [];
    private _alignLabel: string | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._dimInput           = new WallDimensionInput(ctx.overlayCanvas);
        this._syncCreationHud();
    }

    deactivate(): void {
        this._removeWallStatusOverlay();
        this._clearOverlay();
        this._dimInput?.dispose();
        this._dimInput           = null;
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._ctx = null;
    }

    /** §WALL-SETOUT-TAB-INPUT — leave set-out numeric-edit mode (keep the wall stroke). */
    private _resetSetOutEdit(): void {
        this._setOutEditActive = false;
        this._setOutDims       = [];
        this._setOutEditIndex  = 0;
        this._setOutBuffer     = '';
        this._setOutEditPoint  = null;
    }

    onMouseMove(pt: WorldPoint): void {
        // §WALL-SETOUT-TAB-INPUT — while typing an exact set-out distance the vertex
        // is locked to the back-solved point; ignore raw cursor motion so the typed
        // value is not overwritten (Escape / a fresh TAB returns to cursor control).
        if (this._setOutEditActive) return;
        const mode = _getMode();
        let resolved = pt;
        // §STRICT-ORTHO (Apr 2026):
        //   Ortho mode is now an unconditional constraint — when active, every
        //   point is projected onto the nearest 90° axis from the start point,
        //   even if the raw cursor landed on an explicit object snap (endpoint,
        //   midpoint, intersection, etc.).  Object snaps still contribute their
        //   precision (the snapped point is what gets projected), but the wall
        //   direction is GUARANTEED orthogonal.
        //
        //   The previous behaviour followed Revit/AutoCAD convention where
        //   object snaps override ortho.  Users found this confusing — clicking
        //   "Perpendicular" mode and ending up with a diagonal wall (because the
        //   cursor happened to be on a snap point) is unacceptable.
        //
        //   Angle-step mode (any non-linear/curved/byslab) keeps the original
        //   "snap wins" behaviour because it is a soft hint, not a strict lock.
        if (this._wallFirstPoint) {
            if (mode === 'ortho') {
                resolved = _snapOrtho(this._wallFirstPoint, pt);
            } else if (mode !== 'linear' && mode !== 'curved' && mode !== 'byslab' && !isStrongSnap(pt)) {
                const step = window.wallModePicker?.getAngleStep?.() ?? 15;
                resolved = _snapAngle(this._wallFirstPoint, pt, step);
            }
            // For curved in state 2 (arc mid set), snap to end from arc mid is not constrained
        }
        // §04-12: if the user has typed a length, lock the cursor to that distance
        // Typed dimension overrides geometric snap because it is even more explicit.
        if (this._dimInput?.isActive && this._wallFirstPoint && mode !== 'curved') {
            const locked = this._computeLockedEndPoint(this._wallFirstPoint, resolved);
            if (locked) resolved = locked;
        }
        // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — soft-snap the placed 2nd point to
        // alignment references (perpendicular / collinear-extension / endpoint) and
        // capture the dashed guides for the preview. Reset first so flag-OFF or a
        // no-candidate frame clears any prior guide (exact prior drawing restored).
        this._alignGuides = [];
        this._alignLabel  = null;
        if (this._alignInferenceActive(mode) && !isStrongSnap(pt)) {
            const inf = this._computeAlignInference(resolved);
            if (inf) {
                resolved = { worldX: inf.snapped.x, worldZ: inf.snapped.z };
                this._alignGuides = inf.guides.slice();
                this._alignLabel  = inf.label;
            }
        }
        this._wallCursorPoint = resolved;
        if (this._wallFirstPoint) {
            this._drawWallPreview();
        } else {
            // §WALL-SETOUT — BEFORE the first click, show the set-out distances from the
            // hovered start point to the surrounding walls (the founder's core ask: an
            // internal partition's start has no reference to existing walls). Mirrors the
            // during-drawing overlay ownership (clears + redraws, snap markers coexist).
            this._drawSetOutPreviewOnly(resolved);
        }
    }

    onClick(pt: WorldPoint): void {
        const mode = _getMode();
        let resolved = pt;
        // §STRICT-ORTHO (Apr 2026): mirrors the onMouseMove rule — ortho is an
        // unconditional 90° lock, even when the cursor lands on a strong snap.
        // Without this, the preview would look orthogonal but the committed
        // wall could end at a snap point that broke the ortho axis.
        if (this._wallFirstPoint) {
            if (mode === 'ortho') {
                resolved = _snapOrtho(this._wallFirstPoint, pt);
            } else if (mode !== 'linear' && mode !== 'curved' && mode !== 'byslab' && !isStrongSnap(pt)) {
                const step = window.wallModePicker?.getAngleStep?.() ?? 15;
                resolved = _snapAngle(this._wallFirstPoint, pt, step);
            }
            // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — commit the SAME inferred point
            // the preview showed (P6: only the placed point changes, not the pipeline).
            if (this._alignInferenceActive(mode) && !isStrongSnap(pt)) {
                const inf = this._computeAlignInference(resolved);
                if (inf) resolved = { worldX: inf.snapped.x, worldZ: inf.snapped.z };
            }
        }

        if (!this._wallFirstPoint) {
            this._wallFirstPoint     = resolved;
            this._polylineFirstPoint = resolved;
            this._arcMidPt           = null;
            this._wallSegmentCount   = 0;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Polyline start point set', resolved, 'mode:', mode);
            return;
        }

        if (mode === 'curved' && !this._arcMidPt) {
            // State 1 → State 2: store arc midpoint
            this._arcMidPt = pt; // no snap for midpoint — free placement
            this._wallCursorPoint = null;
            this._syncCreationHud();
            console.log('[WallPlanToolHandler] Arc midpoint set', pt);
            return;
        }

        this._commitWall(resolved);
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._wallFirstPoint) this._closePolyline();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        const mode = _getMode();

        // §WALL-SETOUT-TAB-INPUT — TAB enters set-out numeric-edit mode (or cycles the
        // focused dim once in it). Only while a start point exists and not in curved mode.
        if (e.key === 'Tab' && this._wallFirstPoint && mode !== 'curved') {
            e.preventDefault();
            this._handleSetOutTab();
            return true;
        }

        // §WALL-SETOUT-TAB-INPUT — while editing a set-out distance, keystrokes drive the
        // focused field (digits / backspace → live back-solve; Enter → commit; Esc → exit).
        // This takes precedence over the §04-12 length input so the two never collide.
        if (this._setOutEditActive) {
            return this._handleSetOutEditKey(e);
        }

        // §04-12: typed dimension input — capture digits/period/backspace/Escape
        // Only active in drawing state (first point set) and not in curved mode
        if (this._wallFirstPoint && this._dimInput && mode !== 'curved') {
            const consumed = this._dimInput.handleKey(e.key);
            if (consumed) {
                e.preventDefault();
                // Update preview with the locked end point
                if (this._wallCursorPoint) {
                    const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                    if (locked) {
                        this._wallCursorPoint = locked;
                        this._drawWallPreview();
                    }
                }
                return true;
            }
        }

        if (e.key === 'Enter') {
            // §04-12: if a length is typed, commit at the locked end point
            if (this._dimInput?.isActive && this._wallFirstPoint && this._wallCursorPoint) {
                const locked = this._computeLockedEndPoint(this._wallFirstPoint, this._wallCursorPoint);
                if (locked) {
                    e.preventDefault();
                    this._dimInput.reset();
                    this._commitWall(locked);
                    return true;
                }
            }

            const canClose = this._wallSegmentCount >= 2
                && !!this._polylineFirstPoint
                && !!this._wallFirstPoint;
            if (canClose) {
                e.preventDefault();
                this._closePolyline();
                return true;
            } else if (this._wallFirstPoint && this._wallCursorPoint) {
                this._commitWall(this._wallCursorPoint);
                return true;
            }
        }
        if (e.key === 'Escape') {
            if (this._arcMidPt) {
                // Back from state 2 to state 1
                this._arcMidPt = null;
                this._clearOverlay();
                return true;
            }
        }
        return false;
    }

    cancel(): void {
        this._dimInput?.reset();
        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._wallFirstPoint && this._wallCursorPoint) this._drawWallPreview();
    }

    private _commitWall(endPt: WorldPoint): void {
        const startPt = this._wallFirstPoint;
        if (!startPt || !this._ctx) return;

        const dx = endPt.worldX - startPt.worldX;
        const dz = endPt.worldZ - startPt.worldZ;
        if (Math.hypot(dx, dz) < 0.01) {
            console.warn('[WallPlanToolHandler] Wall too short — skipped');
            this._arcMidPt = null;
            return;
        }

        const levelId = this._ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[WallPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        // §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — resolve from the stable surface-independent
        // store (falling back to window.wallTool), so the SPLIT plan pane threads the same
        // selected layered type as the MAIN plan view instead of dispatching systemTypeId=none.
        const systemTypeId = resolveActiveWallSystemTypeId();
        // §FIX-PLAN-WALL-TYPE-IGNORED (L-41) — HISTORICAL NOTE, CORRECTED 2026-07-11.
        //
        // The original comment here blamed a "first-registration-wins" facade (composeRuntime
        // seeding a *separate* plugin-side WallSystemTypeStore, making engineLauncher's
        // §WALL-TYPE-WIRE adapter dead) AND asserted that "the 3D builder re-resolves
        // layers/thickness from systemTypeId at render". BOTH are now false:
        //
        //   • The catalogue split was fixed at the composition root by ADR-0116
        //     (§FIX-WALL-TYPE-UNIFY-CATALOGUE): PluginRegistry's wall descriptor now seeds
        //     `buildSharedWallCatalogue()` — the ONE geometry-wall singleton the picker reads —
        //     into the authoritative handler, and the dead §WALL-TYPE-WIRE adapter was removed.
        //     Type resolution no longer depends on registration order.
        //   • The 3D builder does NOT re-derive anything. WallFragmentBuilder (§03-1.3) reads
        //     `wall.layers` straight off the INSTANCE, exactly as WallLayerPlanSymbolBuilder
        //     does for plan. 3D-created walls only *looked* right because WallTool ALSO
        //     dual-writes through the legacy CreateWallCommand, which stamps `layers` — the
        //     bus-only plan path had no such stamp, so a plan-created layered wall was stored
        //     WITHOUT layers and drew plain in BOTH views (L-239 / L-211).
        //
        // §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION (L-239) moves BOTH derivations
        // (systemTypeId → thickness AND → layers[]) into the `wall.create` COMMAND handler —
        // the chokepoint every creation path dispatches through — and persists them on the
        // instance. This tool therefore no longer needs to resolve anything.
        //
        // The `thickness` below is retained ONLY as a defensive fallback for a catalogue miss
        // (the chokepoint overrides it with the type's totalThickness whenever the type
        // resolves — idempotent, identical value). It is deliberately NOT deleted yet: the
        // legacy `CreateWallCommand` path (WallTool's dual-write, CreateWallsFromSlab, the
        // project loader) still writes the legacy WallStore WITHOUT passing through
        // `wall.create`, so the bus chokepoint is not yet the sole writer. See the L-239
        // report — collapsing that legacy path is the follow-up that makes this line removable.
        const thickness    = this._getSelectedWallThickness();
        const mode         = _getMode();

        let isCurved = false;
        let curvePayload: { control: { x: number; y: number; z: number }; segments: number } | undefined;
        if (mode === 'curved' && this._arcMidPt) {
            const ctrl = _bezierControl(startPt, this._arcMidPt, endPt);
            curvePayload = { control: { x: ctrl.x, y: 0, z: ctrl.z }, segments: ARC_SEGMENTS };
            isCurved = true;
        }

        // §P2.1 / C11 §2 — bus-only single-pipeline dispatch.
        //
        // CONTRACT (C11 §3.2 + C11 §7.0 FIX-WALL-ID):
        //   • `id` MUST be pre-generated here using createId('wall') from @pryzm/schemas.
        //     The CEB extracts id from record.payload → emits wallId on 'wall.created'.
        //     The initTools §P2.1 bridge guards on !ev.wallId — if id is omitted from
        //     the payload, wallId is undefined, the guard silently drops every event,
        //     the legacy WallStore is never updated → no 3D mesh, no plan view projection.
        //   • createId('wall') generates `wall_<ulid>` format which passes the
        //     CreateWallHandler.WALL_ID_RE regex.  crypto.randomUUID() must NOT be used.
        //   • baseLine points MUST be full Vec3 `{ x, y, z }`.  The `y` component
        //     carries the level elevation (0 in plan view = ground level).
        //
        // The handler (plugins/wall/src/handlers/CreateWall.ts) writes to the PRYZM3
        // Immer store; CommandEventBridge emits `wall.created`; the bridge in
        // initTools.ts §P2.1 mirrors into the legacy WallStore → WallRebuildCoordinator
        // → 3D mesh.  Plan view: WallStore.add() emits storeEventBus →
        // ViewTechnicalDrawingCache._onStoreChange → vd:projection-stale → Canvas2D.
        const wallId = createId('wall');
        window.runtime?.bus?.executeCommand('wall.create', {
            id:       wallId,
            baseLine:  [
                { x: startPt.worldX, y: 0, z: startPt.worldZ },
                { x: endPt.worldX,   y: 0, z: endPt.worldZ   },
            ],
            height:    WALL_DEFAULT_HEIGHT,
            thickness,
            levelId,
            ...(systemTypeId  ? { systemTypeId }  : {}),
            ...(curvePayload  ? { curve: curvePayload } : {}),
        })?.catch((e: unknown) => console.error('[WallPlanToolHandler] wall.create bus failed:', e));
        console.log('[WallPlanToolHandler] Wall dispatched — mode:', mode, isCurved ? '(curved)' : '(straight)');
        this._wallSegmentCount++;

        // Chain: endpoint becomes new start; clear arc state and dim input
        this._dimInput?.reset();
        this._resetSetOutEdit();   // §WALL-SETOUT-TAB-INPUT — leave edit mode on commit
        this._resetAlignGuides();  // §FEAT-PLAN-WALL-ALIGN-INFERENCE — clear stale guides
        this._wallFirstPoint  = endPt;
        this._arcMidPt        = null;
        this._wallCursorPoint = null;
        this._syncCreationHud();
        this._clearOverlay();
    }

    /**
     * §04-12: Returns a WorldPoint at the typed distance from start in the
     * direction of cursor, or null if dim input has no valid length or the
     * cursor is coincident with start.
     */
    private _computeLockedEndPoint(start: WorldPoint, cursor: WorldPoint): WorldPoint | null {
        const length = this._dimInput?.getLengthMeters();
        if (!length || length <= 0) return null;
        const dx   = cursor.worldX - start.worldX;
        const dz   = cursor.worldZ - start.worldZ;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return null;
        return {
            worldX: start.worldX + (dx / dist) * length,
            worldZ: start.worldZ + (dz / dist) * length,
        };
    }

    // ── §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — alignment inference snap ──────────

    /**
     * Whether alignment inference should run this frame. Gated so it never fights
     * the existing constraints: flag ON (default), a start point exists, FREE
     * (linear) mode only — ortho / angle already lock direction — and neither the
     * typed-length input nor the set-out numeric editor is active (both are more
     * explicit than a soft inference). The caller additionally skips inference when
     * the raw point already landed on a strong object snap (endpoint/etc. wins).
     */
    private _alignInferenceActive(mode: string): boolean {
        return this._alignInferenceEnabled()
            && !!this._wallFirstPoint
            && mode === 'linear'
            && !this._dimInput?.isActive
            && !this._setOutEditActive;
    }

    /** Feature gate — DEFAULT ON; only an explicit `false` disables (P4: typed flag). */
    private _alignInferenceEnabled(): boolean {
        return window.__pryzmPlanWallAlignInference !== false;
    }

    /**
     * Run the pure alignment inference for `cursor` against the active level's
     * walls. Tolerance is a fixed screen-pixel budget converted to world metres
     * via the live pixels-per-unit, so the snap "feel" is zoom-invariant. Returns
     * null when there is no start point or no candidate within tolerance.
     */
    private _computeAlignInference(cursor: WorldPoint): ReturnType<typeof computeWallAlignmentInference> {
        const start = this._wallFirstPoint;
        if (!start || !this._ctx) return null;
        const segs = this._collectLevelWallSegments();
        if (segs.length === 0) return null;
        const ppu = this._ctx.planCanvas.getPixelsPerUnit?.() ?? 0;
        const axisThresholdM = ppu > 0 ? ALIGN_SNAP_PX / ppu : 0.15;
        return computeWallAlignmentInference(
            { x: start.worldX,  z: start.worldZ },
            { x: cursor.worldX, z: cursor.worldZ },
            this._collectAlignReferences(segs),
            segs,
            { axisThresholdM },
        );
    }

    /** Endpoint + midpoint reference points from the active level's wall segments. */
    private _collectAlignReferences(segs: readonly SetOutSegment[]): AlignReference[] {
        const refs: AlignReference[] = [];
        for (const s of segs) {
            refs.push({ x: s.a.x, z: s.a.z, kind: 'endpoint' });
            refs.push({ x: s.b.x, z: s.b.z, kind: 'endpoint' });
            refs.push({ x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2, kind: 'midpoint' });
        }
        return refs;
    }

    /** Clear the captured alignment guides (called when a stroke commits/resets). */
    private _resetAlignGuides(): void {
        this._alignGuides = [];
        this._alignLabel  = null;
    }

    /**
     * Draw the dashed alignment inference guides + a snap-label chip. Assumes the
     * overlay transform is already the dpr transform (called from _drawWallPreview
     * after the wall band's save/restore). Does its own save/restore; never clears.
     */
    private _drawAlignmentGuides(): void {
        const c = this._ctx;
        if (!c || (this._alignGuides.length === 0 && !this._alignLabel)) return;
        const { ctx, planCanvas } = c;

        ctx.save();
        for (const g of this._alignGuides) {
            const colour = g.isIntersection ? ALIGN_GUIDE_CYAN : ALIGN_GUIDE_BLUE;
            const from = planCanvas.worldToScreen(g.from.x, g.from.z);
            const to   = planCanvas.worldToScreen(g.to.x,   g.to.z);
            ctx.strokeStyle = colour;
            ctx.lineWidth   = 1.25;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(from.sx, from.sy);
            ctx.lineTo(to.sx, to.sy);
            ctx.stroke();
            ctx.setLineDash([]);
            // Small tick at the reference (existing wall feature) end.
            ctx.beginPath();
            ctx.arc(from.sx, from.sy, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = colour;
            ctx.fill();
        }

        // Snap-label chip near the snapped cursor (like the existing snap chips).
        if (this._alignLabel && this._wallCursorPoint) {
            const p = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);
            const label = this._alignLabel;
            ctx.font = 'bold 10px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(0,136,255,0.92)';
            ctx.fillRect(p.sx + 10, p.sy - 22, tw + 8, 15);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, p.sx + 14, p.sy - 14);
        }
        ctx.restore();
    }

    // ── §WALL-SETOUT-TAB-INPUT (L-126) — TAB-to-edit set-out numeric entry ──────────

    /**
     * TAB pressed: enter set-out edit mode (capturing the current set-out dims), or —
     * if already editing — commit the focused field and cycle focus to the NEXT dim
     * (primary → … → secondary, wrapping). No-op if there are no set-out references.
     */
    private _handleSetOutTab(): void {
        if (!this._setOutEditActive) {
            const anchor = this._wallCursorPoint ?? this._wallFirstPoint;
            if (!anchor) return;
            const dims = computeSetOutDimensions(
                { x: anchor.worldX, z: anchor.worldZ },
                this._collectLevelWallSegments(),
            );
            if (dims.length === 0) return;   // nothing to set out against
            this._setOutEditActive = true;
            this._setOutDims       = dims;
            this._setOutEditIndex  = 0;
            this._setOutBuffer     = '';
            this._setOutEditPoint  = { worldX: anchor.worldX, worldZ: anchor.worldZ };
        } else {
            // Apply whatever is typed for the current field, then advance focus.
            this._applySetOutBuffer();
            this._setOutEditIndex = (this._setOutEditIndex + 1) % this._setOutDims.length;
            this._setOutBuffer    = '';
        }
        this._syncCreationHud();
        this._redrawSetOutEdit();
    }

    /** Keystrokes while in set-out edit mode. Returns true when consumed. */
    private _handleSetOutEditKey(e: KeyboardEvent): boolean {
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            this._setOutBuffer += e.key;
            this._applySetOutBuffer();
            this._redrawSetOutEdit();
            return true;
        }
        if (e.key === 'Backspace') {
            e.preventDefault();
            this._setOutBuffer = this._setOutBuffer.slice(0, -1);
            this._applySetOutBuffer();
            this._redrawSetOutEdit();
            return true;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            this._applySetOutBuffer();
            const pt = this._setOutEditPoint;
            this._resetSetOutEdit();
            if (pt) this._commitWall(pt);   // P6 — commit through the wall.create command
            return true;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this._resetSetOutEdit();
            this._syncCreationHud();
            if (this._wallFirstPoint && this._wallCursorPoint) this._drawWallPreview();
            else this._clearOverlay();
            return true;
        }
        // Swallow other printable keys so they don't leak into other handlers while editing.
        return true;
    }

    /**
     * Re-derive the live vertex from the typed buffer for the focused dim. The
     * off-axis coordinate is preserved by solveSetOutPoint, so editing the X dim then
     * the Z dim composes into one point across TAB cycles. Empty buffer ⇒ no change.
     */
    private _applySetOutBuffer(): void {
        const dim = this._setOutDims[this._setOutEditIndex];
        const base = this._setOutEditPoint;
        if (!dim || !base || this._setOutBuffer === '') return;
        const mm = parseInt(this._setOutBuffer, 10);
        if (!Number.isFinite(mm)) return;
        const np = solveSetOutPoint({ x: base.worldX, z: base.worldZ }, dim, mm);
        this._setOutEditPoint = { worldX: np.x, worldZ: np.z };
        // Mirror onto the cursor point so _commitWall + the wall band use the edited vertex.
        this._wallCursorPoint = this._setOutEditPoint;
    }

    /** Redraw the wall band + set-out edit overlay for the current edited vertex. */
    private _redrawSetOutEdit(): void {
        if (this._setOutEditPoint) this._wallCursorPoint = this._setOutEditPoint;
        this._drawWallPreview();
    }

    private _closePolyline(): void {
        const start = this._wallFirstPoint;
        const end   = this._polylineFirstPoint;
        if (!start || !end) return;

        if (Math.hypot(end.worldX - start.worldX, end.worldZ - start.worldZ) >= 0.1) {
            this._arcMidPt = null; // force straight closing segment
            this._commitWall(end);
        }

        this._resetSetOutEdit();
        this._resetAlignGuides();
        this._wallFirstPoint     = null;
        this._polylineFirstPoint = null;
        this._arcMidPt           = null;
        this._wallSegmentCount   = 0;
        this._wallCursorPoint    = null;
        this._syncCreationHud();
        this._clearOverlay();
        console.log('[WallPlanToolHandler] Polyline closed');
    }

    private _drawWallPreview(): void {
        const c = this._ctx;
        if (!c || !this._wallFirstPoint || !this._wallCursorPoint) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const s = planCanvas.worldToScreen(this._wallFirstPoint.worldX,  this._wallFirstPoint.worldZ);
        const e = planCanvas.worldToScreen(this._wallCursorPoint.worldX, this._wallCursorPoint.worldZ);

        ctx.save();

        const mode = _getMode();

        if (mode === 'curved' && this._arcMidPt) {
            // ── Curved mode state 2: draw arc from start through arcMidPt to cursor ──
            const sm = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            const ctrl = _bezierControl(this._wallFirstPoint, this._arcMidPt, this._wallCursorPoint);
            const sc   = planCanvas.worldToScreen(ctrl.x, ctrl.z);

            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.quadraticCurveTo(sc.sx, sc.sy, e.sx, e.sy);
            ctx.stroke();

            // Arc midpoint indicator
            ctx.fillStyle = '#6600ff';
            ctx.beginPath(); ctx.arc(sm.sx, sm.sy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.stroke();

            // Length hint — approximate chord
            const distM = Math.hypot(
                this._wallCursorPoint.worldX - this._wallFirstPoint.worldX,
                this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ,
            );
            const midX = (s.sx + e.sx) / 2, midY = (s.sy + e.sy) / 2;
            const label = `~${Math.round(distM * 1000)} mm (arc)`;
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#6600ff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);

        } else if (mode === 'curved' && !this._arcMidPt) {
            // ── Curved mode state 1: awaiting arc midpoint — draw dashed preview line ──
            ctx.strokeStyle = '#6600ff';
            ctx.lineWidth   = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(s.sx, s.sy);
            ctx.lineTo(e.sx, e.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = '11px sans-serif';
            ctx.fillStyle = 'rgba(30,58,138,0.85)';
            ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
            ctx.fillText('Click to set arc midpoint', 12, cssH - 12);

        } else {
            // ── Linear / Ortho / Any-angle: solid thickness band (unchanged) ──────────
            const segDx = e.sx - s.sx;
            const segDy = e.sy - s.sy;
            const screenLen = Math.hypot(segDx, segDy);
            if (screenLen >= 0.5) {
                const thicknessPx = Math.max(2, planCanvas.getPixelsPerUnit() * this._getSelectedWallThickness());
                const halfWidth = thicknessPx / 2;
                const perpX = -segDy / screenLen;
                const perpY =  segDx / screenLen;
                const corners = [
                    { x: s.sx + perpX * halfWidth, y: s.sy + perpY * halfWidth },
                    { x: s.sx - perpX * halfWidth, y: s.sy - perpY * halfWidth },
                    { x: e.sx - perpX * halfWidth, y: e.sy - perpY * halfWidth },
                    { x: e.sx + perpX * halfWidth, y: e.sy + perpY * halfWidth },
                ];
                ctx.fillStyle = 'rgba(102,0,255,0.35)';
                ctx.strokeStyle = '#6600ff';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.lineTo(corners[1].x, corners[1].y);
                ctx.lineTo(corners[2].x, corners[2].y);
                ctx.lineTo(corners[3].x, corners[3].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            const dx    = this._wallCursorPoint.worldX - this._wallFirstPoint.worldX;
            const dz    = this._wallCursorPoint.worldZ - this._wallFirstPoint.worldZ;
            const lenMm = Math.round(Math.hypot(dx, dz) * 1000);
            const label = `${lenMm} mm`;
            const midX  = (s.sx + e.sx) / 2;
            const midY  = (s.sy + e.sy) / 2;

            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.90)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle = '#1e40af';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        }

        const canClose = this._wallSegmentCount >= 2 && this._polylineFirstPoint;
        if (canClose && mode !== 'curved') {
            const origin = planCanvas.worldToScreen(
                this._polylineFirstPoint!.worldX, this._polylineFirstPoint!.worldZ
            );
            ctx.setLineDash([4, 5]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = 'rgba(22,163,74,0.55)';
            ctx.beginPath();
            ctx.moveTo(e.sx, e.sy);
            ctx.lineTo(origin.sx, origin.sy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#16a34a';
            ctx.beginPath();
            ctx.arc(origin.sx, origin.sy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(22,163,74,0.95)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText('↵ Enter or click button to close polyline', 12, cssH - 12);
        }

        ctx.restore();

        // §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — dashed inference guides + snap
        // chip for the current cursor. Drawn after the wall band's restore; does its
        // own save/restore and does NOT clear (this method owns the clear at the top).
        // Not shown while the set-out numeric editor owns the overlay.
        if (!this._setOutEditActive) this._drawAlignmentGuides();

        // §WALL-SETOUT — set-out dims from the MOVING end to the surrounding walls,
        // alongside the wall's own length label. Drawn after the wall band restore;
        // these do their own save/restore and do NOT clear.
        // §WALL-SETOUT-TAB-INPUT — while editing, render the CAPTURED dims (against the
        // back-solved vertex) with the focused field highlighted, instead of recomputing
        // (which could reselect walls and make the focused field jump under the caret).
        if (this._setOutEditActive) {
            this._drawSetOutEditOverlay();
        } else if (this._wallCursorPoint) {
            this._drawSetOutDimensions(this._wallCursorPoint);
        }
    }

    /**
     * §WALL-SETOUT-TAB-INPUT — render the captured set-out dims against the current
     * back-solved vertex (`_setOutEditPoint`). Each dim's distance is re-derived from
     * the edited point and its FIXED wall foot (axis-locked), so lines stay anchored;
     * the focused field shows the typed buffer + caret in a highlighted box.
     */
    private _drawSetOutEditOverlay(): void {
        const c = this._ctx;
        const e = this._setOutEditPoint;
        if (!c || !e) return;
        const { ctx } = c;
        ctx.save();
        this._setOutDims.forEach((d, i) => {
            const focused = i === this._setOutEditIndex;
            // Re-anchor the dim to the edited vertex along its own axis (wall foot is fixed).
            const live: SetOutDimension = d.axis === 'x'
                ? {
                    ...d,
                    from: { x: e.worldX, z: e.worldZ },
                    to:   { x: d.to.x,   z: e.worldZ },
                    distanceMm: focused && this._setOutBuffer !== ''
                        ? parseInt(this._setOutBuffer, 10) || 0
                        : Math.round(Math.abs(e.worldX - d.to.x) * 1000),
                }
                : {
                    ...d,
                    from: { x: e.worldX, z: e.worldZ },
                    to:   { x: e.worldX, z: d.to.z },
                    distanceMm: focused && this._setOutBuffer !== ''
                        ? parseInt(this._setOutBuffer, 10) || 0
                        : Math.round(Math.abs(e.worldZ - d.to.z) * 1000),
                };
            const colour = d.role === 'secondary' ? SETOUT_GREY : SETOUT_BLUE;
            this._drawOneSetOutDim(live, colour, focused);
        });
        ctx.restore();
    }

    /** §WALL-SETOUT — the active level's existing wall baselines as 2D segments
     *  (plan XZ, metres) for the pure set-out computation. Same access pattern as
     *  SlabPlanToolHandler (`window.wallStore.getAll()` + `baseLine`). */
    private _collectLevelWallSegments(): SetOutSegment[] {
        const levelId = this._ctx?.viewDef.spatial?.levelId;
        const walls: Array<{ levelId?: string; baseLine?: Array<{ x: number; z: number }> }> =
            (window.wallStore as { getAll?: () => unknown[] } | undefined)?.getAll?.() as never ?? [];
        const segs: SetOutSegment[] = [];
        for (const w of walls) {
            if (levelId && w.levelId && w.levelId !== levelId) continue;   // this level only
            const bl = w.baseLine;
            if (!bl || bl.length < 2) continue;
            segs.push({ a: { x: bl[0].x, z: bl[0].z }, b: { x: bl[1].x, z: bl[1].z } });
        }
        return segs;
    }

    /** §WALL-SETOUT — draw blue set-out dimension(s) from `point` to the nearest
     *  surrounding walls. Assumes the overlay transform is already the dpr transform;
     *  does its OWN save/restore and does NOT clear (callers own the clear). */
    private _drawSetOutDimensions(point: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx } = c;
        const dims = computeSetOutDimensions(
            { x: point.worldX, z: point.worldZ },
            this._collectLevelWallSegments(),
        );
        if (dims.length === 0) return;

        ctx.save();
        // §WALL-SETOUT-4SIDE — PRIMARY pair (nearer wall per axis) draws blue, SECONDARY
        // pair (the farther/newly-projected sides) draws grey, so the user distinguishes them.
        for (const d of dims) this._drawOneSetOutDim(d, d.role === 'secondary' ? SETOUT_GREY : SETOUT_BLUE);
        ctx.restore();
    }

    /** §WALL-SETOUT — render a single set-out dimension line + label in `colour`. */
    private _drawOneSetOutDim(d: SetOutDimension, colour: string, focused = false): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, planCanvas } = c;
        const from = planCanvas.worldToScreen(d.from.x, d.from.z);
        const to   = planCanvas.worldToScreen(d.to.x,   d.to.z);

        ctx.strokeStyle = colour;
        ctx.lineWidth   = focused ? 2 : 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.stroke();
        ctx.setLineDash([]);

        // small end tick at the wall foot
        ctx.beginPath();
        ctx.arc(to.sx, to.sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();

        const mx = (from.sx + to.sx) / 2;
        const my = (from.sy + to.sy) / 2;
        // Focused (TAB-edited) field appends a static caret to read as an active text field
        // (a blinking caret would need its own rAF — forbidden by P3 outside the scheduler).
        const label = focused ? `${d.distanceMm} mm |` : `${d.distanceMm} mm`;
        ctx.font = focused ? 'bold 11px sans-serif' : '10px sans-serif';
        const tw = ctx.measureText(label).width;
        // Focused (TAB-edited) field gets a solid highlight box so it reads as a text field.
        ctx.fillStyle = focused ? colour : 'rgba(255,255,255,0.92)';
        ctx.fillRect(mx - tw / 2 - 4, my - 9, tw + 8, 16);
        if (focused) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(mx - tw / 2 - 4, my - 9, tw + 8, 16);
        }
        ctx.fillStyle = focused ? '#ffffff' : colour;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
    }

    /** §WALL-SETOUT — before the first click: clear the overlay + draw only the
     *  set-out dims for the hovered start point. */
    private _drawSetOutPreviewOnly(point: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
        this._drawSetOutDimensions(point);
    }

    private _getSelectedWallThickness(): number {
        // §FIX-SPLIT-WALL-SYSTEMTYPE (L-98) — same surface-independent source as the commit
        // so the plan preview thickness matches the dispatched (layered) type on both surfaces.
        const systemTypeId = resolveActiveWallSystemTypeId();
        if (!systemTypeId) return WALL_DEFAULT_THICKNESS;
        const total = window.wallSystemTypeStore?.getTotalThickness?.(systemTypeId); // TODO(TASK-08)
        return typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : WALL_DEFAULT_THICKNESS;
    }

    private _ensureWallStatusOverlay(): HTMLElement {
        if (!this._wallStatusOverlay) {
            const overlay = document.createElement('div');
            overlay.className = 'th-overlay';

            const text = document.createElement('span');
            text.id = 'pvt-wall-tool-status-text';
            text.className = 'th-text';
            overlay.appendChild(text);

            const sep = document.createElement('span');
            sep.id = 'pvt-wall-tool-sep';
            sep.className = 'th-sep';
            sep.style.display = 'none';
            overlay.appendChild(sep);

            const closeBtn = document.createElement('button');
            closeBtn.id = 'pvt-close-polyline-btn';
            closeBtn.className = 'th-close-btn';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `<span class="th-key">↵</span><span>Close Polyline</span>`;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closePolyline();
            });
            overlay.appendChild(closeBtn);

            document.body.appendChild(overlay);
            this._wallStatusOverlay = overlay;
        }
        return this._wallStatusOverlay;
    }

    private _removeWallStatusOverlay(): void {
        this._wallStatusOverlay?.remove();
        this._wallStatusOverlay = null;
    }

    private _syncCreationHud(): void {
        if (!this._ctx) {
            this._removeWallStatusOverlay();
            return;
        }
        const mode    = _getMode();
        const overlay = this._ensureWallStatusOverlay();
        const textEl  = overlay.querySelector('#pvt-wall-tool-status-text');
        const closeBtn = overlay.querySelector('#pvt-close-polyline-btn') as HTMLButtonElement | null;
        const sep = overlay.querySelector('#pvt-wall-tool-sep') as HTMLElement | null;
        const canClose = this._wallSegmentCount >= 2 && !!this._polylineFirstPoint && !!this._wallFirstPoint;

        if (textEl) {
            if (this._setOutEditActive) {
                // §WALL-SETOUT-TAB-INPUT — editing a set-out distance numerically.
                textEl.textContent = 'Type set-out mm · TAB next dim · ↵ commit · Esc cancel';
            } else if (!this._wallFirstPoint) {
                textEl.textContent = 'Click to set start point';
            } else if (mode === 'curved' && !this._arcMidPt) {
                textEl.textContent = 'Click arc midpoint · Esc to cancel arc';
            } else if (mode === 'curved' && this._arcMidPt) {
                textEl.textContent = 'Click end point to commit arc wall';
            } else {
                textEl.textContent = 'Click to set next point · or type length + ↵';
            }
        }
        if (closeBtn) closeBtn.style.display = canClose ? '' : 'none';
        if (sep) sep.style.display = canClose ? '' : 'none';
        overlay.style.display = 'flex';
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
