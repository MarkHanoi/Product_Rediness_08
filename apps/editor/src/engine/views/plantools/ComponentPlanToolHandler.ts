/**
 * ComponentPlanToolHandler — Lane U1 (§COMPONENT-PLACE-TOOL) · UIUX-PLAN §U1 ·
 * ADR-0376 D5/D9/D10 · C16 CA-18/CA-21 · C111 §1.1-a · spec §63.
 *
 * Single-click placement tool for COMPONENT occurrences in plan view — the tool
 * that finally arms `component.place` (LIVE since Phase 4C, armed by nothing
 * until this file; UIUX-PLAN §2-A row 4).
 *
 * Interaction model (mirrors `FurniturePlanToolHandler`, the §1.2.4 proven flow):
 *   • Moving the mouse shows a crosshair + orientation tick + a label naming the
 *     chosen definition · type. ⛔ NO FOOTPRINT RECTANGLE IS DRAWN, deliberately:
 *     this layer does not know the definition's geometry (the bake is lane 4E's,
 *     descoped under D10), and a plausible-looking box would claim a size nobody
 *     computed — the `ComponentCommitter` refusal rule (UIUX-PLAN §4 R-p) applied
 *     to the ghost. The crosshair claims exactly what is true: the insertion
 *     point and the yaw.
 *   • SPACEBAR rotates +90° CW before committing (§FEAT-PLACEMENT-SPACEBAR-ROTATE,
 *     ADR-0105 — same `PrePlacementRotation`, same overlay-routed onKeyDown).
 *   • One click commits at the cursor world position; the tool STAYS armed for
 *     multi-placement. Escape cancels.
 *
 * Reads the active `(definitionId, typeId)` pair from `activeComponentPlacement`
 * — set by the Component browser's "Place" (both create surfaces, L-1380).
 * ⛔ NO FALLBACK PAIR. Furniture falls back to `'bed'`; a component placed
 * against a guessed definition would be a fabricated reference, so a missing
 * pair REFUSES BY NAME instead ([[fake-more-capable-than-real]]).
 *
 * ─── REFUSALS REACH THE SCREEN (C16 CA-18 · UIUX-PLAN §U1 brief item 4) ───────
 * A rejected dispatch (definition not loaded / type not of the definition — the
 * lane-U0 catalogue refusals) surfaces the BUS'S OWN SENTENCE, verbatim, on the
 * live toast channel (`runtime.toasts` — the L-7005 finding: `pryzm:toast`
 * events have NO subscriber; emitting only there is a refusal nobody can read)
 * AND as red text on the overlay (the `LiftPlanToolHandler._refuse` idiom).
 * Never a silent no-op click.
 */

import { createId } from '@pryzm/schemas';
import { PrePlacementRotation } from '@pryzm/core-app-model';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import {
    getActiveComponentPlacement,
    type ActiveComponentPlacement,
} from './activeComponentPlacement';

const STROKE_COLOUR = '#6600ff';               // PRYZM preview purple (PreviewStyle rule)
const REFUSAL_COLOUR = '#b91c1c';

/** The slice of the live toast channel this handler needs (L-7005: the ONE
 *  subscriber-backed channel; `pryzm:toast` events reach nobody). */
interface ToastsLike {
    show?: (message: string, kind?: string, durationMs?: number) => unknown;
}
interface RuntimeLike {
    bus?: { executeCommand?: (type: string, payload: Record<string, unknown>) => Promise<unknown> };
    toasts?: ToastsLike;
}

export class ComponentPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null       = null;
    private _refusal: string | null          = null;

    // §FEAT-PLACEMENT-SPACEBAR-ROTATE — cumulative +90°/press pre-placement yaw,
    // shared machinery with the furniture/plumbing tools so plan placement rotates
    // the way every other placement tool does.
    private readonly _rotation = new PrePlacementRotation();

    activate(ctx: PlanToolDrawContext): void {
        this._ctx     = ctx;
        this._cursor  = null;
        this._refusal = null;
        this._rotation.reset();
    }

    deactivate(): void {
        this._clearOverlay();
        this._cursor  = null;
        this._refusal = null;
        this._rotation.reset();
        this._ctx     = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._draw();
    }

    onClick(pt: WorldPoint): void {
        this._commit(pt);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
            this._rotation.advance();
            this._draw();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._cursor  = null;
        this._refusal = null;
        this._rotation.reset();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._cursor) this._draw();
    }

    // ── Commit ────────────────────────────────────────────────────────────────

    private _commit(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            this._refuse('This view has no level, so there is no storey to place a Component on.');
            return;
        }

        const sel = getActiveComponentPlacement();
        if (!sel) {
            // ⛔ Never a guessed definition — see the header. CA-18: the reason AND
            // the route back to success.
            this._refuse(
                'No Component is selected to place. Open the Components browser ' +
                '(Create → Interior → Components) and choose a type first.',
            );
            return;
        }

        // ⭐ CA-2 — the id is minted ONCE, here, and passed in; `execute()` runs
        // again on REDO, and a handler-minted id would produce a different
        // occurrence the second time.
        const payload: Record<string, unknown> = {
            componentId: createId('component'),
            levelId,
            definitionId: sel.definitionId,
            typeId: sel.typeId,
            ...(sel.definitionVersion !== undefined
                ? { definitionVersion: sel.definitionVersion }
                : {}),
            // World metres (ADR-0376 D3); y = 0 — the storey rides `levelId`,
            // exactly as `furniture.create` commits it from this surface.
            origin: { x: pt.worldX, y: 0, z: pt.worldZ },
            rotation: this._rotation.rotationY(),
        };

        const rt = (c.runtime ?? (window as { runtime?: unknown }).runtime) as RuntimeLike | undefined;
        const dispatch = rt?.bus?.executeCommand?.('component.place', payload);
        if (!dispatch) {
            this._refuse('The command bus is not available, so no Component was placed.');
            return;
        }

        this._refusal = null;
        void Promise.resolve(dispatch)
            .then(() => {
                // Multi-placement: stay armed, clear the ghost for the next click.
                this._clearOverlay();
            })
            .catch((e: unknown) => {
                // ⭐ SURFACE THE BUS'S OWN REASON, VERBATIM — the lane-U0 catalogue
                // refusals name the definitionId, the type list and the live
                // alternative ("load the definition, then…"). Swallowing that
                // sentence is the "reported activation, activated nothing" defect.
                const why = e instanceof Error ? e.message : String(e);
                console.error('[ComponentPlanToolHandler] component.place failed:', why);
                this._refuse(why);
            });
    }

    /** CA-18 — put the sentence on BOTH surfaces the user can see. */
    private _refuse(message: string): void {
        this._refusal = message;
        this._draw();
        const rt = (this._ctx?.runtime ?? (window as { runtime?: unknown }).runtime) as
            | RuntimeLike
            | undefined;
        rt?.toasts?.show?.(message, 'error');
    }

    // ── Preview ───────────────────────────────────────────────────────────────

    private _draw(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.save();

        if (this._cursor) {
            const { sx, sy } = c.planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);
            const R = 14;

            // Crosshair — the insertion point, the one thing this layer knows.
            ctx.strokeStyle = STROKE_COLOUR;
            ctx.lineWidth   = 1.25;
            ctx.beginPath();
            ctx.moveTo(sx - R, sy); ctx.lineTo(sx + R, sy);
            ctx.moveTo(sx, sy - R); ctx.lineTo(sx, sy + R);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx, sy, 4, 0, Math.PI * 2);
            ctx.stroke();

            // Orientation tick — the SPACE-chosen yaw, drawn with the same
            // preview-vs-placed sign rule §FIX-PLAN-PREVIEW-YAW-SIGN derived
            // (screen rotation = −rotationY on the y-down canvas).
            const rot = this._rotation.rotationY();
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(-rot);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(R + 8, 0);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // Label — definition · type, upright, white pill (furniture idiom).
            const sel = getActiveComponentPlacement();
            const labelText = sel
                ? `${sel.definitionName ?? sel.definitionId} · ${sel.typeName ?? sel.typeId}`
                : 'No Component selected';
            ctx.font = 'bold 10px sans-serif';
            // Defensive read: overlay test harnesses stub the 2-D context with a
            // proxy whose methods return undefined (the bathroomPod-spec idiom).
            const tw = ctx.measureText?.(labelText)?.width ?? labelText.length * 6;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(sx - tw / 2 - 4, sy + R + 6, tw + 8, 15);
            ctx.fillStyle    = STROKE_COLOUR;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, sx, sy + R + 13);

            // Hint — bottom-left, mirrors the furniture hint verbatim.
            ctx.font         = '11px sans-serif';
            ctx.fillStyle    = 'rgba(30,58,138,0.85)';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'bottom';
            const deg = ((this._rotation.degrees() % 360) + 360) % 360;
            ctx.fillText(`Click to place · Space to rotate (${deg}°) · Esc to cancel`, 12, cssH - 12);
        }

        // Refusal — red, bottom-left above the hint (the lift idiom): the bus's
        // own sentence, on the surface the click happened on.
        if (this._refusal) {
            ctx.font         = 'bold 11px sans-serif';
            ctx.fillStyle    = REFUSAL_COLOUR;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this._refusal, 12, cssH - 28);
        }

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}

// Re-exported so the browser panel and BimService share ONE selection type.
export type { ActiveComponentPlacement };
