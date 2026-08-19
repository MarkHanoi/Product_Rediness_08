/**
 * RailingPlanToolHandler — the PLAN surface of handrail authoring.
 *
 * §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18) · L-1106 (2026-08-19).
 *
 * THE FOUNDER, in substance:
 *   "I would like PARITY WITH THE WALL ELEMENT. The railing is conceptually really
 *    similar to the wall … I want it created in the same way: once the user clicks
 *    it should have the same UI/UX as the wall's authoring panel. The user could
 *    select from a number of railings and decide whether they want to create
 *    railing BY LINE, ORTHO, CURVED, BY SLAB and add SQUARE, CIRCULAR, ELLIPSE."
 *
 * ═══ WHAT THIS FILE IS NOW — A SURFACE ADAPTER, AND NOTHING ELSE ════════════
 *
 * The seven-mode gesture used to live HERE, in full, and the 3-D `HandrailTool`
 * had none of it (L-1106: the bar offered Square / Circular / Ellipse in 3-D and
 * two clicks drew a straight line — C84 EI-3, live, for 3 of 7 modes). C95 §15.13
 * forbids the obvious cure by name — *"the fix is NOT 'add modes to
 * `HandrailTool`'"*, because that mints a second gesture implementation and this
 * family's whole cost centre is having two of things.
 *
 * So the state machine MOVED, whole, to `HandrailSketchController` in
 * `@pryzm/geometry-handrail`, and both surfaces now drive the same instance-shape.
 * That is `stair-path`'s arrangement, which `elementCreationMatrix` already names
 * as the dual-view reference: ONE controller over ONE config store, with thin
 * per-surface handlers.
 *
 * What is left here is the only genuinely PLAN-shaped part:
 *   1. the `PlanToolHandler` lifecycle, and
 *   2. painting the ghost on the Canvas2D overlay.
 *
 * ═══ WHAT IT DISPATCHES, AND WHY NOT THE BUS ═══════════════════════════════
 * It executes `CreateHandrailCommand` / `CreateHandrailRunCommand` through
 * `ctx.commandManager` — the DI slot the overlay already populates and the same
 * L2 path the 3-D tool, the IFC importer and the project loader use (C95 §4.2 —
 * *"the live path is legacy"*). The dispatch itself is `dispatchHandrailRun`,
 * shared with 3-D so the two surfaces cannot mint different records.
 *
 * ⚠ THIS IS A DELIBERATE CHOICE OF PATH AND IT IS THE ONLY ONE THAT CARRIES THE
 * TYPE. `runtime.bus.executeCommand('handrail.create')`'s payload is
 * `{id, levelId, hostId, path, shape, height, diameter, materialId}` — no slot for
 * `fillType`, `railProfile`, `postSpacing`, `baseOffset`, `materialColor` or any
 * baluster field, and the `.created` bridge hard-codes `fillType: 'baluster'` and
 * `baseOffset: 0` (C95 §5, D4/D6). Routing a catalogue type through it would
 * SILENTLY drop most of it. `check:commandmanager` scans `packages/` and
 * `plugins/` only — `apps/` is outside that gate's scope — so this adds nothing
 * to its count.
 *
 * CONTRACTS: C11 · C16 §8.6 + CA-18 · C84 EI-2/EI-3/EI-9 · C95 §15.13 · C82.
 */

import {
    HandrailSketchController,
    type HandrailSketchPreviewState,
} from '@pryzm/geometry-handrail';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE = '#f59e0b';
const FILL_A = 'rgba(245,158,11,0.10)';

export class RailingPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;

    /**
     * ⭐ THE ONE GESTURE, SHARED WITH 3-D. Constructed once and re-pointed at each
     * activation's context through the two live accessors below — a plan handler is
     * re-activated on every `mouseenter` of the split-view pane, so capturing the
     * context in the closure at CONSTRUCTION time would pin the first one forever.
     */
    private readonly _sketch = new HandrailSketchController({
        surface: 'plan',
        dispatcher: () => this._ctx?.commandManager ?? null,
        levelId: () => this._ctx?.viewDef.spatial?.levelId ?? null,
        preview: {
            render: (state) => this._drawPreview(state),
            clear: () => this._clearOverlay(),
        },
    });

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._sketch.reset();
    }

    deactivate(): void {
        this._sketch.cancel();
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._sketch.onMouseMove({ x: pt.worldX, z: pt.worldZ });
    }

    onClick(pt: WorldPoint): void {
        this._sketch.onClick({ x: pt.worldX, z: pt.worldZ });
    }

    onDoubleClick(_pt: WorldPoint): void {
        this._sketch.onDoubleClick();
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._sketch.cancel();
    }

    redraw(): void {
        this._sketch.redraw();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Preview — the ONLY plan-specific drawing code left in this file
    // ─────────────────────────────────────────────────────────────────────────

    private _drawPreview(state: HandrailSketchPreviewState): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;
        const { pts, closed, spec, readout } = state;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);
        if (pts.length < 2) return;

        ctx.save();

        const screen = pts.map((p) => planCanvas.worldToScreen(p.x, p.z));
        const ppu = planCanvas.getPixelsPerUnit();
        const thickPx = Math.max(2, spec.thickness * ppu);

        // Body band — the armed type's actual thickness, so the ghost describes the
        // rail the command will build rather than a fixed 50 mm stand-in.
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = FILL_A;
        ctx.lineWidth = thickPx;
        ctx.strokeStyle = FILL_A;
        ctx.beginPath();
        ctx.moveTo(screen[0]!.sx, screen[0]!.sy);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i]!.sx, screen[i]!.sy);
        if (closed) ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen[0]!.sx, screen[0]!.sy);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i]!.sx, screen[i]!.sy);
        if (closed) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Post markers — the preview shows WHERE THE POSTS WILL BE, which is the
        // only way the closure-join behaviour is visible before committing.
        ctx.fillStyle = STROKE;
        for (const s of screen) {
            ctx.beginPath();
            ctx.arc(s.sx, s.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = 'rgba(245,158,11,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(readout, 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}

/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — `readSelectedSlabOutline()` USED TO LIVE HERE
 * AND IS DELETED, NOT DEPRECATED. It read `window.selectionManager.selectedObject`
 * to find the slab — the exact read the tool's own activation had already
 * invalidated (`ToolManager.activateTool` → `selectionManager.setEnabled(false)`),
 * so it returned `null` on every By-Slab attempt.
 *
 * ⚠ `executeHandrailBySlab` AND `resolveArmedHandrailSpec` ALSO USED TO BE
 * EXPORTED FROM HERE, AND ARE NOW IN `@pryzm/geometry-handrail`. They are NOT
 * re-exported from this module: a second address for the same function is how a
 * family acquires a second answer (C84 §3.5 / EI-9), which is the defect this whole
 * lane exists to remove. Importers were repointed at the real home.
 */
