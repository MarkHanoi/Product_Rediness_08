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
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import { StairPathToolController } from '@pryzm/geometry-stair';
import type { StairLevelOption } from '@pryzm/geometry-stair';

export class StairPathPlanToolHandler implements PlanToolHandler {
    private _ctrl: StairPathToolController | null = null;
    private _pendingShapeHint: 'I' | 'L' | 'U' | null = null;

    constructor() {
        // Listen for shape hints dispatched by ToolManager.activateStairPath()
        window.addEventListener('stair-path:shape-hint', (e) => {
            const detail = (e as CustomEvent).detail;
            if (detail === 'I' || detail === 'L' || detail === 'U') {
                this._pendingShapeHint = detail;
            }
        });
    }

    activate(ctx: PlanToolDrawContext): void {
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

        const viewDef      = ctx.viewDef;
        const baseLevelId: string = (viewDef.spatial as any)?.levelId ?? '';
        if (!baseLevelId) {
            console.error('[StairPathPlanToolHandler] viewDef.spatial.levelId missing');
            return;
        }

        const cm = window.commandManager; // TODO(TASK-05): no bus handler yet
        const levelContext = this._resolveAdjacentLevel(baseLevelId, cm);

        this._ctrl = new StairPathToolController({
            container:        document.body,
            coordinateCanvas: ctx.baseCanvas,
            planViewCanvas:   ctx.planCanvas,
            commandManager:   cm,
            baseLevelId,
            topLevelId:          levelContext.topLevelId,
            baseLevelElevation:  levelContext.baseLevelElevation,
            topLevelElevation:   levelContext.topLevelElevation,
            levelOptions:        levelContext.levels,
            width:               1.2,
            riserHeight:         undefined,
            treadDepth:          undefined,
            risersBeforeLanding: 0,
            risersInRun2:        0,
            turnDirection:       'left',
            secondRunSide:       'left',
            initialShape:        shapeHint ?? undefined,
            onCancel: () => {
                // Controller cancelled itself (ESC) — nothing extra needed
            },
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

    /** Resolve the adjacent level above `baseLevelId` and both elevations. */
    private _resolveAdjacentLevel(baseLevelId: string, cm: any): {
        topLevelId: string;
        baseLevelElevation: number;
        topLevelElevation: number;
        levels: StairLevelOption[];
    } {
        const fallback = {
            topLevelId:         baseLevelId,
            baseLevelElevation: 0,
            topLevelElevation:  3.0,
            levels: [
                { id: baseLevelId, name: 'Current Level', elevation: 0 },
                { id: `${baseLevelId}:top`, name: 'Level Above', elevation: 3.0 },
            ],
        };

        try {
            const levels: any[] =
                cm?.context?.stores?.wallStore?.getLevels?.() ??
                window.levelStore?.getAll?.() ?? // TODO(TASK-08)
                [];

            if (!levels.length) return fallback;

            const sorted = [...levels].sort(
                (a, b) => (a.elevation ?? a.height ?? 0) - (b.elevation ?? b.height ?? 0),
            );

            const baseIdx = sorted.findIndex(l => l.id === baseLevelId);
            if (baseIdx < 0) return fallback;

            const base = sorted[baseIdx];
            const top  = baseIdx < sorted.length - 1
                ? sorted[baseIdx + 1]
                : sorted[sorted.length - 1];

            const levelOptions = sorted.map((level, index) => ({
                id:        String(level.id),
                name:      String(level.name ?? level.label ?? `Level ${index + 1}`),
                elevation: Number(level.elevation ?? level.height ?? 0),
            }));

            return {
                topLevelId:         top.id,
                baseLevelElevation: base.elevation ?? base.height ?? 0,
                topLevelElevation:  top.elevation  ?? top.height  ?? fallback.topLevelElevation,
                levels:             levelOptions,
            };
        } catch (e) {
            console.warn('[StairPathPlanToolHandler] _resolveAdjacentLevel error', e);
            return fallback;
        }
    }
}
