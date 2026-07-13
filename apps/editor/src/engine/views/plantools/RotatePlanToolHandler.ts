/**
 * RotatePlanToolHandler — §FIX-PLAN-ROTATE-PARITY (L-267, Gate G7)
 *
 * Revit-style two-click ROTATE for the 2D plan / elevation / section views —
 * the POST-placement rotation that the plan view has never had, for ANY element
 * type. It is the exact sibling of `MovePlanToolHandler` (Contract 34) and is
 * deliberately built to the same shape:
 *
 *   1. Tool activates (Rotate button or `R`, routed by ContextualEditBar through
 *      `_activateRotateToolForContext()` — the same view-context router that
 *      Move/Align/Copy use).
 *   2. Pivot = the selected element's own anchor (its stored `position`).
 *   3. State AWAITING_REFERENCE — the user clicks a reference point, defining the
 *      "from" ray out of the pivot.
 *   4. State AWAITING_TARGET — the live angle from the reference ray to the cursor
 *      ray is previewed (arc + degrees + rotated ghost footprint).
 *   5. The second click commits that angle. The tool resets to AWAITING_REFERENCE
 *      so the user can rotate again immediately, or press Escape to exit (matching
 *      §T-H7 — Revit keeps the tool live until Esc).
 *
 * ## What this handler does NOT do
 *
 * It does not know what "rotating a wardrobe" means. It computes ONE number — a
 * yaw delta in radians — and hands it to `buildYawRotateCommand()` in
 * `@app/engine/transforms/elementYawRotate`, which is the single source of truth
 * shared with the 3-D gizmo path. That module emits the SAME command with the SAME
 * payload the 3-D drag-end already dispatches, so a plan rotate and a 3-D rotate of
 * the same element by the same angle produce an identical record mutation.
 *
 * This is the whole point. A furniture-specific plan rotate would have been the
 * EIGHTH instance of the project's signature defect (L-239/240/243/246/251/255/260A
 * — "one element, two paths, and the plan path silently drops what the 3-D path
 * resolves"). There is one rotate implementation and two gestures for it.
 *
 * ## Angle snapping
 *   • Default: 15° increments (Revit's default rotate snap).
 *   • Hold Shift: 1° fine increments.
 * The snapped angle is what is PREVIEWED and what is COMMITTED — preview ≡ commit.
 *
 * ## Undo
 * One gesture → one `buildYawRotateCommand()` → one command → ONE undo entry (C16).
 *
 * Architecture rules (Contract 21 §4):
 *   - All mutation via the command bus (P6). No direct store writes.
 *   - No direct DOM event listeners — every event is routed by the overlay.
 *   - No imports from PlanViewToolOverlay.
 */

import { dispatchTyped } from '@pryzm/command-bus';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
    buildYawRotateCommand,
    canYawRotate,
    orbitPointAboutPivot,
    type PlanPivot,
} from '@app/engine/transforms/elementYawRotate';

/** Revit's default rotate snap. Shift drops to a 1° fine snap. */
const COARSE_SNAP_DEG = 15;
const FINE_SNAP_DEG   = 1;

const ACCENT      = '#6600FF'; // PRYZM violet — the unified transform-preview ink
const ACCENT_DARK = '#4B00B8';

type RotatePhase = 'awaiting-reference' | 'awaiting-target';

/**
 * The minimal shape `_readSelection` needs from a selected scene node: enough to walk
 * `parent` up to the BIM-element root and read its `userData`. Structural, not a THREE
 * import — P2 keeps `import * as THREE` inside `packages/renderer-three` only.
 */
interface SceneNodeLike {
    readonly userData?: Record<string, unknown>;
    readonly parent?: SceneNodeLike | null;
}

function snapAngleRad(rad: number, stepDeg: number): number {
    const stepRad = (stepDeg * Math.PI) / 180;
    return Math.round(rad / stepRad) * stepRad;
}

/** Normalise to (−π, π] so a rotation always takes the short way round. */
function normaliseAngle(rad: number): number {
    let a = rad % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
}

function formatDeg(rad: number): string {
    const deg = (rad * 180) / Math.PI;
    return `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`;
}

export class RotatePlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _phase: RotatePhase = 'awaiting-reference';

    private _referencePt: WorldPoint | null = null;
    private _cursorPt: WorldPoint | null    = null;
    private _shift = false;

    /** ID + type of the element being rotated. Re-read from selectionManager on activate. */
    private _targetId: string | null   = null;
    private _targetType: string | null = null;

    // ──────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx         = ctx;
        this._phase       = 'awaiting-reference';
        this._referencePt = null;
        this._cursorPt    = null;
        this._shift       = false;
        this._readSelection();
        this.redraw();

        if (this._targetType && !canYawRotate(this._targetType)) {
            // Be loud rather than inert. The founder's L-267 report was ultimately
            // caused by a control that looked enabled and did nothing.
            console.warn(
                `[RotateTool] "${this._targetType}" does not support rotation yet — ` +
                `rotating it would rewrite a baseline/polygon and cascade into wall joins, ` +
                `hosted openings and room detection (tracked under Gate G7).`,
            );
            window.runtime?.events?.emit('pryzm:toast', {
                message: `Rotate is not available for ${this._targetType} yet.`,
                severity: 'info',
            });
        }
        console.log('[RotateTool] Activated — target:', this._targetId, this._targetType);
    }

    deactivate(): void {
        this._clearOverlay();
        this._ctx         = null;
        this._phase       = 'awaiting-reference';
        this._referencePt = null;
        this._cursorPt    = null;
        this._targetId    = null;
        this._targetType  = null;
        this._shift       = false;
    }

    cancel(): void {
        this._phase       = 'awaiting-reference';
        this._referencePt = null;
        this.redraw();
        console.log('[RotateTool] Cancelled — reset to awaiting reference point');
    }

    /** Mid-gesture (reference ray picked) counts as an active stroke — §T-B1. */
    hasActiveStroke(): boolean {
        return this._phase === 'awaiting-target' && this._referencePt !== null;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        this.redraw();
    }

    onClick(pt: WorldPoint): void {
        if (!this._targetId) this._readSelection();
        if (!this._targetId) {
            console.warn('[RotateTool] onClick: no element selected');
            return;
        }
        if (!canYawRotate(this._targetType)) return;

        const pivot = this._pivot();
        if (!pivot) {
            console.warn('[RotateTool] Cannot resolve pivot for', this._targetType, this._targetId);
            return;
        }

        if (this._phase === 'awaiting-reference') {
            // Degenerate reference (clicked the pivot itself) gives no ray — ignore.
            if (Math.hypot(pt.worldX - pivot.x, pt.worldZ - pivot.z) < 1e-3) {
                console.warn('[RotateTool] Reference point coincides with the pivot — pick a point away from the element centre');
                return;
            }
            this._referencePt = pt;
            this._phase       = 'awaiting-target';
            this.redraw();
            console.log('[RotateTool] Reference ray set');
        } else if (this._phase === 'awaiting-target' && this._referencePt) {
            const yaw = this._yawFor(pt, pivot);
            this._commitRotate(yaw, pivot);
            this._phase       = 'awaiting-reference';
            this._referencePt = null;
            this.redraw();
        }
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        if (e.key === 'Shift') {
            this._shift = true;
            this.redraw();
            return false; // do not consume — Shift is a modifier, not a command
        }
        return false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Angle
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * The yaw (radians) that carries the reference ray onto the cursor ray.
     *
     * Plan maps +worldX → +screenX and +worldZ → +screenY (DOWN), so the screen
     * bearing of a point about the pivot is `φ = atan2(dz, dx)` and φ grows
     * CLOCKWISE. A THREE Y-Euler of +θ carries a point from screen-RIGHT to
     * screen-UP — i.e. it DECREASES φ (`φ' = φ − θ`; see `orbitPointAboutPivot`).
     * So the yaw that maps the reference bearing onto the target bearing is
     * `θ = φ(reference) − φ(target)`, NOT the other way round. Getting this sign
     * backwards would rotate the element opposite to the cursor — which is exactly
     * the defect this handler's sibling preview had (see §FIX-PLAN-PREVIEW-YAW-SIGN
     * in FurniturePlanToolHandler).
     */
    private _yawFor(cursor: WorldPoint, pivot: PlanPivot): number {
        const ref = this._referencePt!;
        const phiRef    = Math.atan2(ref.worldZ    - pivot.z, ref.worldX    - pivot.x);
        const phiCursor = Math.atan2(cursor.worldZ - pivot.z, cursor.worldX - pivot.x);
        const raw = normaliseAngle(phiRef - phiCursor);
        return snapAngleRad(raw, this._shift ? FINE_SNAP_DEG : COARSE_SNAP_DEG);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Commit — the ONE shared rotate definition, identical to the 3-D gizmo's
    // ──────────────────────────────────────────────────────────────────────────

    private _commitRotate(yaw: number, pivot: PlanPivot): void {
        const id   = this._targetId;
        const type = this._targetType;
        if (!id || !type) return;

        const record = this._record();
        if (!record) {
            console.warn('[RotateTool] Record not found for', type, id);
            return;
        }

        // buildYawRotateCommand is the SINGLE definition of "rotate element X" and is
        // shared with registerTransformDragHandler (the 3-D gizmo). No bespoke mutation
        // is authored here — that is what keeps plan ≡ 3D.
        const cmd = buildYawRotateCommand(type, record, pivot, yaw);
        if (!cmd) {
            console.log('[RotateTool] No-op rotate (zero angle or unsupported type):', type);
            return;
        }

        const bus = this._ctx?.runtime?.bus ?? window.runtime?.bus;
        if (!bus) {
            console.warn('[RotateTool] No command bus — rotate dropped');
            return;
        }

        // Narrow the discriminated union so each dispatch is compile-time checked
        // against CommandRegistry (the L-214/218/220 "wrong payload" class becomes a
        // build error, not a swallowed console.error).
        const dispatch =
            cmd.type === 'furniture.updateParameters'
                ? dispatchTyped(bus, 'furniture.updateParameters', cmd.payload)
                : dispatchTyped(bus, 'column.update', cmd.payload);

        dispatch.catch((e: unknown) => {
            console.error(`[RotateTool] ${cmd.type} failed:`, e);
            window.runtime?.events?.emit('pryzm:toast', {
                message: `Couldn't rotate the ${type} — ${e instanceof Error ? e.message : String(e)}`,
                severity: 'error',
            });
        });

        console.log('[RotateTool]', type, 'rotated by', formatDeg(yaw), 'about', pivot);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overlay rendering
    // ──────────────────────────────────────────────────────────────────────────

    redraw(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        const cursor = this._cursorPt;
        if (!cursor) return;

        const pivot = this._pivot();
        if (!pivot || !canYawRotate(this._targetType)) {
            // No rotatable selection — just show the crosshair so the tool is not silent.
            const cur = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);
            this._drawCrosshair(ctx, cur.sx, cur.sy, ACCENT);
            this._drawHUDLabel(ctx, cur.sx + 16, cur.sy - 10, 'Select a rotatable element', ACCENT);
            return;
        }

        const pv  = planCanvas.worldToScreen(pivot.x, pivot.z);
        const cur = planCanvas.worldToScreen(cursor.worldX, cursor.worldZ);

        // Pivot marker — filled violet dot with a white ring.
        ctx.beginPath();
        ctx.arc(pv.sx, pv.sy, 6, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pv.sx, pv.sy, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (this._phase === 'awaiting-reference') {
            this._drawCrosshair(ctx, cur.sx, cur.sy, ACCENT);
            this._drawHUDLabel(ctx, cur.sx + 16, cur.sy - 10, 'Pick reference point', ACCENT);
            this._drawElementLabel(ctx, cur.sx, cur.sy);
            return;
        }

        const ref = this._referencePt;
        if (!ref) return;
        const rf  = planCanvas.worldToScreen(ref.worldX, ref.worldZ);
        const yaw = this._yawFor(cursor, pivot);

        // Reference ray (solid) and cursor ray (dashed).
        ctx.save();
        ctx.strokeStyle = 'rgba(102, 0, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pv.sx, pv.sy);
        ctx.lineTo(rf.sx, rf.sy);
        ctx.stroke();

        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(pv.sx, pv.sy);
        ctx.lineTo(cur.sx, cur.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Sweep arc between the two rays, at a readable radius.
        const rRef = Math.hypot(rf.sx - pv.sx, rf.sy - pv.sy);
        const rCur = Math.hypot(cur.sx - pv.sx, cur.sy - pv.sy);
        const rArc = Math.max(24, Math.min(rRef, rCur) * 0.55);
        // Screen bearings grow clockwise; a +yaw is counter-clockwise, so the swept
        // arc runs from the reference bearing by (−yaw).
        const aRef = Math.atan2(rf.sy - pv.sy, rf.sx - pv.sx);
        ctx.save();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pv.sx, pv.sy, rArc, aRef, aRef - yaw, yaw > 0);
        ctx.stroke();
        ctx.restore();

        // Rotated ghost footprint at the destination pose.
        this._drawGhost(ctx, planCanvas, pivot, yaw);

        // Angle read-out + instruction.
        const midA = aRef - yaw / 2;
        this._drawBubbleLabel(
            ctx,
            pv.sx + Math.cos(midA) * (rArc + 18),
            pv.sy + Math.sin(midA) * (rArc + 18),
            formatDeg(yaw),
            ACCENT,
        );
        this._drawCrosshair(ctx, cur.sx, cur.sy, ACCENT);
        this._drawHUDLabel(
            ctx,
            cur.sx + 16,
            cur.sy - 10,
            `Pick target point · ${this._shift ? '1°' : '15°'} snap`,
            ACCENT,
        );

        const { overlayCanvas: oc, dpr: d } = c;
        ctx.save();
        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(75, 0, 184, 0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Click to rotate · Shift for 1° snap · Esc to cancel', 12, oc.height / d - 12);
        ctx.restore();
    }

    /**
     * Ghost outline of the element at its post-rotation pose. Drawn from the
     * record's own width/length footprint, orbited + spun by the SAME maths the
     * commit uses (`orbitPointAboutPivot`), so the ghost cannot disagree with the
     * committed result.
     */
    private _drawGhost(
        ctx:        CanvasRenderingContext2D,
        planCanvas: PlanToolDrawContext['planCanvas'],
        pivot:      PlanPivot,
        yaw:        number,
    ): void {
        const rec = this._record() as
            | { position?: { x: number; z: number }; rotation?: unknown; width?: number; length?: number }
            | null;
        if (!rec?.position) return;

        const w = typeof rec.width  === 'number' && rec.width  > 0 ? rec.width  : 0.6;
        const l = typeof rec.length === 'number' && rec.length > 0 ? rec.length : 0.6;

        const prevYaw =
            typeof rec.rotation === 'number'
                ? rec.rotation
                : ((rec.rotation as { y?: number; _y?: number } | undefined)?.y
                    ?? (rec.rotation as { _y?: number } | undefined)?._y
                    ?? 0);
        const totalYaw = prevYaw + yaw;

        // New centre after orbiting about the pivot.
        const c = orbitPointAboutPivot(rec.position, pivot, yaw);

        // Footprint corners in element-local XZ, then spun by the TOTAL yaw using the
        // same THREE-Y handedness (x' = x·cos + z·sin, z' = −x·sin + z·cos).
        const cs = Math.cos(totalYaw);
        const sn = Math.sin(totalYaw);
        const corners: Array<[number, number]> = [
            [-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2],
        ];

        ctx.save();
        ctx.strokeStyle = 'rgba(102, 0, 255, 0.6)';
        ctx.lineWidth   = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        corners.forEach(([lx, lz], i) => {
            const wx = c.x + lx * cs + lz * sn;
            const wz = c.z - lx * sn + lz * cs;
            const s  = planCanvas.worldToScreen(wx, wz);
            if (i === 0) ctx.moveTo(s.sx, s.sy);
            else ctx.lineTo(s.sx, s.sy);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Overlay drawing primitives (mirrors MovePlanToolHandler)
    // ──────────────────────────────────────────────────────────────────────────

    private _drawCrosshair(ctx: CanvasRenderingContext2D, sx: number, sy: number, color: string, size = 10): void {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        const h = size + 4;
        ctx.beginPath();
        ctx.moveTo(sx - h, sy); ctx.lineTo(sx + h, sy);
        ctx.moveTo(sx, sy - h); ctx.lineTo(sx, sy + h);
        ctx.stroke();
        ctx.restore();
    }

    private _drawHUDLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
        ctx.save();
        ctx.font      = '600 12px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(10, 15, 25, 0.82)';
        const w = ctx.measureText(text).width + 14;
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy - 14, w, 20, 4);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(text, sx + 5, sy);
        ctx.restore();
    }

    private _drawBubbleLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string, color: string): void {
        ctx.save();
        ctx.font      = '600 11px system-ui, sans-serif';
        const w       = ctx.measureText(text).width + 12;
        const h       = 18;
        ctx.fillStyle = 'rgba(10, 15, 25, 0.78)';
        ctx.beginPath();
        ctx.roundRect?.(sx - w / 2, sy - h / 2, w, h, 4);
        ctx.fill();
        ctx.fillStyle    = color;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy);
        ctx.restore();
    }

    private _drawElementLabel(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
        if (!this._targetType) return;
        const type = this._targetType.charAt(0).toUpperCase() + this._targetType.slice(1);
        ctx.save();
        ctx.font         = '500 11px system-ui, sans-serif';
        const text       = `Rotating: ${type}`;
        const w          = ctx.measureText(text).width + 12;
        ctx.fillStyle    = 'rgba(10, 15, 25, 0.65)';
        ctx.beginPath();
        ctx.roundRect?.(sx - 2, sy + 14, w, 18, 4);
        ctx.fill();
        ctx.fillStyle    = ACCENT_DARK;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sx + 4, sy + 23);
        ctx.restore();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private _clearOverlay(): void {
        if (!this._ctx) return;
        const { ctx, overlayCanvas, dpr } = this._ctx;
        ctx.clearRect(0, 0, overlayCanvas.width / dpr, overlayCanvas.height / dpr);
    }

    /** The live store record for the selected element, or null. */
    private _record(): unknown | null {
        const id = this._targetId;
        if (!id || !this._targetType) return null;
        const store =
            this._targetType === 'furniture'
                ? window.furnitureStore // TODO(TASK-08)
                : this._targetType === 'column'
                    ? window.columnStore // TODO(TASK-08)
                    : null;
        if (!store) return null;
        const s = store as { get?: (id: string) => unknown; getById?: (id: string) => unknown };
        return s.get?.(id) ?? s.getById?.(id) ?? null;
    }

    /** Rotation pivot = the element's own anchor (its stored position). */
    private _pivot(): PlanPivot | null {
        const rec = this._record() as { position?: { x?: number; z?: number } } | null;
        const p = rec?.position;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
        return { x: p.x as number, z: p.z as number };
    }

    /**
     * Identical ancestor-walk to MovePlanToolHandler._readSelection: selection often
     * lands on a child mesh (a cabinet door, a sofa cushion) rather than the BIM-element
     * root that carries `userData.elementType` + `userData.id`.
     */
    private _readSelection(): void {
        const sm  = window.selectionManager;
        const obj = sm?.selectedObject ?? null;
        if (!obj) {
            this._targetId   = null;
            this._targetType = null;
            return;
        }

        let node: SceneNodeLike | null = obj as unknown as SceneNodeLike;
        while (node && !(node.userData?.id && (node.userData?.elementType || node.userData?.type))) {
            node = node.parent ?? null;
        }

        if (node?.userData?.id) {
            this._targetId   = node.userData.id as string;
            this._targetType = ((node.userData.elementType ?? node.userData.type ?? '') as string).toLowerCase();
        } else {
            const ud = (obj as { userData?: Record<string, unknown> }).userData;
            this._targetId   = (ud?.id as string) ?? null;
            this._targetType = ((ud?.elementType ?? ud?.type ?? '') as string).toLowerCase() || null;
        }
    }
}
