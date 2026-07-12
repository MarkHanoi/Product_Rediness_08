/**
 * StairPathPlanToolHandler — Plan-tool wrapper for the polyline stair path tool.
 *
 * Bridges the PlanToolHandler contract with StairPathToolController.
 * All pointer events arrive here via the coordinator (no separate DOM listeners
 * on the controller overlay). The overlay canvas is render-only (pointer-events: none).
 *
 * UX flow:
 *   Straight (I): click start → move (live preview) → click end → stair placed.
 *   L-shape:      3 clicks → landing auto-placed between runs → stair placed.
 *   U-shape:      4 clicks → two landings → stair placed.
 *
 * ── §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) ──────────────────────────────────
 *
 * THIS is the handler the ribbon actually reaches in plan view (tool key
 * `stair-path`, via `BimService.activateStairPathTool` → `ToolManager.activateStairPath`).
 * It is where the founder's "stair in plan view can not yet be created" died — NOT in
 * `StairPlanToolHandler` (tool key `stair`, reachable only via the RadialMenu →
 * `BimService.createStair` → `StairSetupPanel` route).
 *
 * The old `_resolveAdjacentLevel()` LIED when it could not find a level above:
 *   • base level is topmost → it returned `top = base`  → a ZERO vertical span
 *     → StairSolver2D got totalHeight 0 → riserHeight 0 → `isValid = false`
 *     → StairPathToolController._finish() bailed after a bare `console.warn`.
 *     No stair, no toast, no error — the tool just silently did nothing.
 *   • base level not found  → it fabricated `${baseLevelId}:top`, an id present in
 *     no store, which CreateStairCommand.canExecute would then reject.
 *
 * Both are gone. Level resolution is now delegated to the ONE chokepoint,
 * `resolveStairVerticalSpan()` (@pryzm/geometry-stair), which never fabricates and
 * never returns a zero span. When no level exists above, the stair IMPLIES one
 * (ADR-0098) and we create it with a COMMAND (`AddLevelCommand`, P6) instead of
 * dead-ending the user with a toast. And an invalid solve now SURFACES to the user
 * rather than dying in the console.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import { StairPathToolController } from '@pryzm/geometry-stair';
import type { StairLevelOption, StairToolConfig, StairLevelInput } from '@pryzm/geometry-stair';
import {
    resolveStairVerticalSpan,
    getStairToolConfig,
    DEFAULT_STOREY_HEIGHT,
} from '@pryzm/geometry-stair';
import { AddLevelCommand } from '@pryzm/command-registry';
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('@pryzm/editor.stair-path-plan-tool', '0.1.0');

interface ResolvedSpan {
    topLevelId: string;
    baseLevelElevation: number;
    topLevelElevation: number;
    levels: StairLevelOption[];
}

export class StairPathPlanToolHandler implements PlanToolHandler {
    private _ctrl: StairPathToolController | null = null;
    private _pendingShapeHint: 'I' | 'L' | 'U' | null = null;

    constructor() {
        // Shape hints dispatched by ToolManager.activateStairPath(). The hint is a
        // TRANSPORT, not a source of truth — it is folded into the StairToolConfig
        // chokepoint below so plan / 3D / batch all agree on the shape (L-243 P2).
        window.addEventListener('stair-path:shape-hint', (e) => {
            const detail = (e as CustomEvent).detail;
            if (detail === 'I' || detail === 'L' || detail === 'U') {
                this._pendingShapeHint = detail;
            }
        });
    }

    activate(ctx: PlanToolDrawContext): void {
        _tracer.startActiveSpan('pryzm.stair.plan_path_tool.activate', (span) => {
            try {
                this._activate(ctx);
            } catch (err) {
                span.recordException(err as Error);
                throw err;
            } finally {
                span.end();
            }
        });
    }

    private _activate(ctx: PlanToolDrawContext): void {
        // Guard: destroy any pre-existing controller before creating a new one.
        // Without this, rapid mouseenter/leave cycles (e.g. param panel overlap)
        // would accumulate orphaned controllers, canvases, and HUD elements.
        if (this._ctrl) {
            this._ctrl.deactivate();
            this._ctrl.destroy();
            this._ctrl = null;
        }

        const shapeHint = this._pendingShapeHint;
        this._pendingShapeHint = null;

        const viewDef = ctx.viewDef;
        const baseLevelId: string = (viewDef.spatial as { levelId?: string } | undefined)?.levelId ?? '';
        if (!baseLevelId) {
            this._fail('This view is not bound to a level, so a stair cannot be placed here.');
            return;
        }

        // §FIX-STAIR-PLAN-CREATION-BLOCKED P2 — the architect's shape / width / type
        // arrives by DI (ctx.stairConfig) from the single StairToolConfigStore, never
        // from `window.activeStairConfig`. The ribbon's I/L/U hint is folded in as an
        // override for this activation.
        const config: StairToolConfig = {
            ...(ctx.stairConfig ?? getStairToolConfig()),
            ...(shapeHint ? { shape: shapeHint } : {}),
        };

        const cm = ctx.commandManager ?? window.commandManager;
        const levels = this._getLevels(cm);

        // ── The chokepoint: what vertical span does this stair climb? ───────────
        const span = resolveStairVerticalSpan(levels, baseLevelId, DEFAULT_STOREY_HEIGHT);

        if (span.status === 'unresolvable') {
            this._fail(`Stair cannot be placed: ${span.reason}`);
            return;
        }

        let resolved: ResolvedSpan | null;
        if (span.status === 'needs-level-above') {
            // ADR-0098 — the stair IMPLIES the level above. Realise the implication
            // with a COMMAND (P6), not an error toast. The user draws; the storey
            // appears; the stair spans it. This is what makes the upper level
            // OPTIONAL from the architect's point of view.
            resolved = this._createImpliedLevelAbove(span.suggestedName, span.suggestedElevation, span.height, cm, baseLevelId);
            if (!resolved) {
                this._fail('Stair needs a level above, and it could not be created automatically.');
                return;
            }
            this._toast(
                `"${span.suggestedName}" created above to host the stair (${span.height.toFixed(2)} m).`,
                'info',
            );
        } else {
            resolved = {
                topLevelId:         span.topLevelId,
                baseLevelElevation: span.baseElevation,
                topLevelElevation:  span.topElevation,
                levels:             this._toLevelOptions(this._getLevels(cm)),
            };
        }

        this._ctrl = new StairPathToolController({
            container:        document.body,
            coordinateCanvas: ctx.baseCanvas,
            planViewCanvas:   ctx.planCanvas,
            commandManager:   cm,
            baseLevelId,
            topLevelId:          resolved.topLevelId,
            baseLevelElevation:  resolved.baseLevelElevation,
            topLevelElevation:   resolved.topLevelElevation,
            levelOptions:        resolved.levels,
            width:               config.width ?? 1.2,
            typeId:              config.typeId,
            riserHeight:         undefined,
            treadDepth:          undefined,
            risersBeforeLanding: 0,
            risersInRun2:        0,
            turnDirection:       'left',
            secondRunSide:       'left',
            initialShape:        config.shape,
            // §FIX-STAIR-PLAN-CREATION-BLOCKED — an invalid solve used to die in the
            // console. It now reaches the user. A stair that cannot be committed must
            // SAY SO; silence is the bug the founder reported.
            onInvalid: (message: string) => this._toast(`Stair not placed — ${message}`, 'warning'),
            onCancel: () => { /* controller cancelled itself (ESC) */ },
        });

        this._ctrl.activate();

        window.stairPathTool = this._getPublicApi();
        window.runtime?.events?.emit('stair-path-tool:activated', {}); // F.events.10
    }

    deactivate(): void {
        this._ctrl?.deactivate();
        this._ctrl?.destroy();
        this._ctrl = null;

        if (window.stairPathTool) {
            window.stairPathTool = undefined;
        }

        window.runtime?.events?.emit('stair-path-tool:deactivated', {}); // F.events.10
    }

    // ── PlanToolHandler event routing ─────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        this._ctrl?.feedMove(pt.worldX, pt.worldZ);
    }

    onClick(pt: WorldPoint): void {
        this._ctrl?.feedClick(pt.worldX, pt.worldZ);
    }

    onDoubleClick(pt: WorldPoint): void {
        this._ctrl?.feedDoubleClick(pt.worldX, pt.worldZ);
    }

    onKeyDown(e: KeyboardEvent): boolean {
        // Keyboard is handled directly in the controller (document listeners).
        // Return false so the coordinator doesn't suppress other shortcuts.
        if (e.key === 'Escape') return false;
        return false;
    }

    cancel(): void {
        this._ctrl?.feedRightClick();
    }

    redraw(): void {
        // Controller's rAF loop redraws automatically when dirty.
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _getPublicApi() {
        const ctrl = this._ctrl;
        return {
            get state() { return ctrl?.state ?? 'idle'; },
            activate:     () => ctrl?.activate?.(),
            deactivate:   () => ctrl?.deactivate?.(),
            updateParams: (p: Parameters<StairPathToolController['updateParams']>[0]) =>
                ctrl?.updateParams(p),
        };
    }

    /** Every level in the project. TODO(TASK-08): DI a level store into PlanToolDrawContext. */
    private _getLevels(cm: unknown): StairLevelInput[] {
        try {
            const ctxStores = (cm as { context?: { stores?: { wallStore?: { getLevels?: () => StairLevelInput[] } } } })
                ?.context?.stores?.wallStore?.getLevels?.();
            return ctxStores ?? window.levelStore?.getAll?.() ?? [];
        } catch (e) {
            console.warn('[StairPathPlanToolHandler] level lookup failed', e);
            return [];
        }
    }

    private _toLevelOptions(levels: StairLevelInput[]): StairLevelOption[] {
        return [...levels]
            .sort((a, b) => Number(a.elevation ?? a.height ?? 0) - Number(b.elevation ?? b.height ?? 0))
            .map((level, index) => ({
                id:        String(level.id),
                name:      String(level.name ?? `Level ${index + 1}`),
                elevation: Number(level.elevation ?? level.height ?? 0),
            }));
    }

    /**
     * ADR-0098 — create the level the stair implies, through AddLevelCommand (P6:
     * commands are the only mutation path). AddLevelCommand.execute() is synchronous,
     * so re-resolving immediately afterwards observes the new level.
     */
    private _createImpliedLevelAbove(
        name: string,
        elevation: number,
        height: number,
        cm: unknown,
        baseLevelId: string,
    ): ResolvedSpan | null {
        const manager = cm as { execute?: (cmd: unknown) => void } | undefined;
        if (!manager?.execute) {
            console.error('[StairPathPlanToolHandler] no CommandManager — cannot create the implied level');
            return null;
        }

        const levelId = `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            manager.execute(new AddLevelCommand({ levelId, name, elevation, height }));
        } catch (err) {
            console.error('[StairPathPlanToolHandler] AddLevelCommand failed:', err);
            return null;
        }

        // Re-resolve against the mutated store — never trust the payload we just sent.
        const span = resolveStairVerticalSpan(this._getLevels(cm), baseLevelId, DEFAULT_STOREY_HEIGHT);
        if (span.status !== 'ok') {
            console.error('[StairPathPlanToolHandler] implied level did not resolve:', span);
            return null;
        }
        return {
            topLevelId:         span.topLevelId,
            baseLevelElevation: span.baseElevation,
            topLevelElevation:  span.topElevation,
            levels:             this._toLevelOptions(this._getLevels(cm)),
        };
    }

    private _fail(message: string): void {
        console.error('[StairPathPlanToolHandler]', message);
        this._toast(message, 'error');
    }

    private _toast(message: string, severity: 'info' | 'warning' | 'error'): void {
        window.runtime?.events?.emit('pryzm:toast', { message, severity }); // F.events.15
    }
}
