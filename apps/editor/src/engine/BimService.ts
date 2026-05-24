import { aiService } from '@pryzm/ai-host';
import { DeleteElementCommand, AddLevelCommand, CreateWallsOnAllSlabsCommand } from '@pryzm/command-registry';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { StairSetupPanel } from '@app/ui/StairSetupPanel';
import { StairLevelRequiredPanel } from '@app/ui/StairLevelRequiredPanel';
import { deleteIfcImportedElement, isIfcImportedElement } from '@pryzm/file-format';

import { BimManager, planView2DCreationMode } from '@pryzm/core-app-model';
import type { IBimService } from '@pryzm/engine';
import { adaptElementStoreMap } from './undo/elementUndoStoreAdapter.js'; // §ADR-051 undo rollout (OI-054)

export class BimService implements IBimService {
    private bimManager: BimManager;
    private wallTool: any;
    private slabTool: any;
    private undoManager: any;
    private selectionManager: any;

    constructor(private props: any) {
        this.bimManager = props.bimManager;
        this.wallTool = props.wallTool;
        this.slabTool = props.slabTool;
        this.undoManager = props.undoManager;
        this.selectionManager = props.selectionManager;

        // Initialize AI Service on window for QueryEngine manual overrides
        window.aiService = aiService;
    }

    // FIX 1: Consolidated CommandManager accessor eliminates repetition and
    // ensures callers never silently fall back to a null manager.
    private get commandManager(): any {
        const mgr = this.props.toolManager?.commandManager || window.commandManager; // TODO(TASK-06)
        if (!mgr) console.error('[BimService] CommandManager not found');
        return mgr;
    }

    async addLevel() {
        const elev = prompt("Level Elevation (m):", "3.0");
        if (elev !== null) {
            const elevation = parseFloat(elev);

            // FIX 2: Validate parsed float before using it
            if (isNaN(elevation)) {
                console.warn('[BimService] Invalid elevation input, aborting addLevel');
                return;
            }

            const count = this.bimManager.getLevels().length;
            const command = new AddLevelCommand({
                levelId: crypto.randomUUID(),
                name: `Level ${count}`,
                elevation,
                height: 3.0
            });

            const manager = this.commandManager;
            if (manager) manager.execute(command);
        }
    }

    async addGrid(axis: 'X' | 'Y') {
        const pos = prompt(`Grid Position (${axis}):`, "5.0");
        if (pos !== null) {
            const position = parseFloat(pos);

            // FIX 2: Validate parsed float
            if (isNaN(position)) {
                console.warn('[BimService] Invalid grid position input, aborting addGrid');
                return;
            }

            const count = this.bimManager.getGrids().filter((g: any) => g.axis === axis).length;
            this.bimManager.addGrid({
                id: crypto.randomUUID(),
                name: axis === 'X' ? String.fromCharCode(65 + count) : (count + 1).toString(),
                axis,
                position
            });
        }
    }

    activateWallTool(mode: WallDrawingMode) {
        const toolManager = this.props.toolManager;
        if (toolManager) {
            toolManager.activateWall(mode);
        } else {
            this.wallTool.activate(mode);
        }
    }

    /**
     * Switch drawing mode mid-polyline, preserving the last segment end-point
     * as the start of the next segment (polyline continuity).
     * Use this instead of activateWallTool() when the wall tool is already active.
     */
    switchWallDrawingMode(mode: WallDrawingMode) {
        this.wallTool.switchDrawingMode(mode);
    }

    activateSlabTool(mode: '2point' | 'polyline' | 'region' | 'hollow' | 'pickWalls') {
        const toolManager = this.props.toolManager as any;
        if (toolManager?.activateSlab) {
            toolManager.activateSlab(mode);
            return;
        }

        if (mode === '2point') this.slabTool.enterSketchMode();
        else if (mode === 'hollow') this.slabTool.enterHollowMode();
        else if (mode === 'polyline') this.slabTool.enterPolylineMode();
        else if (mode === 'region') this.slabTool.enterRegionMode();
        else if (mode === 'pickWalls') this.slabTool.enterPickWallsMode();
    }

    activateRoofTool(mode: '2point' | 'polyline' | 'region' | 'single_slope' | 'hip_roof' = '2point') {
        const tm = this.props.toolManager as any;
        if (tm?.activateRoof) {
            void tm.activateRoof(mode);
            return;
        }
        const roofTool = this.props.roofTool;
        if (!roofTool) return;
        if (mode === '2point') roofTool.enterRectangleMode();
        else if (mode === 'polyline') roofTool.enterPolylineMode();
        else if (mode === 'region') roofTool.enterRegionMode();
        else if (mode === 'single_slope') roofTool.enterSingleSlopeMode();
        else if (mode === 'hip_roof') roofTool.enterHipRoofMode();
    }

    deleteSelected() {
        if (this.selectionManager.selectedObject) {
            if (isIfcImportedElement(this.selectionManager.selectedObject)) {
                void deleteIfcImportedElement(this.selectionManager.selectedObject, {
                    selectionManager: this.selectionManager,
                });
                return;
            }
            const id = this.selectionManager.selectedObject.userData.id;
            if (id) {
                const command = new DeleteElementCommand(id);
                const manager = this.commandManager;
                if (manager) {
                    manager.execute(command);
                    this.selectionManager.unselectAll();
                } else {
                    this.selectionManager.deleteSelected();
                }
            }
        }
    }

    undo() {
        // F-1.4: prefer ring-buffer path (O(1), no LONGTASK) — mirrors initUI.ts Ctrl-Z handler.
        const rb = window.runtime?.bus?.ringBuffer;
        // §UNDO-DIAG (2026-05-24) — conclusive ring-buffer state when this path fires.
        console.log('[Undo-DIAG/BimService] rb=', !!rb, 'canUndo=', rb?.canUndo?.(),
            'size=', (rb as any)?.size, 'current.affectedStores=', (rb?.current?.() as any)?.affectedStores);
        if (rb?.canUndo()) {
            const currentPair = rb.current();
            const inverseSide = rb.undoPatch();
            if (inverseSide && currentPair) {
                import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
                    const outcome = applyRingBufferSide(
                        inverseSide,
                        currentPair.affectedStores ?? [],
                        BimService._buildStoreMap(),
                    );
                    // §B3 (C03 §4.7) — on total failure (legacy store without applyPatch)
                    // fall back to the legacy UndoManager instead of a silent no-op.
                    if (outcome.applied.length === 0 && outcome.failed.length > 0) {
                        console.warn('[BimService.undo] ring-buffer apply INCOMPLETE — store(s) without applyPatch:', outcome.failed, '(C03 §4.7 B1) — falling back to legacy undo.');
                        this.undoManager.undo();
                    }
                }).catch((err: unknown) => {
                    console.error('[BimService.undo] ring-buffer apply failed:', err);
                    this.undoManager.undo();
                });
                return;
            }
        }
        this.undoManager.undo();
    }

    redo() {
        // F-1.4: prefer ring-buffer path (O(1), no LONGTASK) — mirrors initUI.ts Ctrl-Y handler.
        const rb = window.runtime?.bus?.ringBuffer;
        if (rb?.canRedo()) {
            const forwardSide = rb.redoPatch();
            const currentPair = rb.current();
            if (forwardSide && currentPair) {
                import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
                    applyRingBufferSide(
                        forwardSide,
                        currentPair.affectedStores ?? [],
                        BimService._buildStoreMap(),
                    );
                }).catch((err: unknown) => {
                    console.error('[BimService.redo] ring-buffer apply failed:', err);
                    this.undoManager.redo();
                });
                return;
            }
        }
        this.undoManager.redo();
    }

    private static _buildStoreMap(): Record<string, { applyPatch: (p: unknown[]) => void } | undefined> {
        // §ADR-051 per-type undo rollout (OI-054 B1+B2) — adapt every live legacy
        // element store to applyPatch (via add/remove/update → drives mesh) so
        // undo+redo revert data + geometry for all element types.
        const w = window as any;
        return {
            ...adaptElementStoreMap({
                wall:           w.wallStore,        walls:        w.wallStore,
                slab:           w.slabStore,        slabs:        w.slabStore,
                room:           w.roomStore,        rooms:        w.roomStore,
                'curtain-wall': w.curtainWallStore, curtainWalls: w.curtainWallStore,
                furniture:      w.furnitureStore,
                column:         w.columnStore,      columns:      w.columnStore,
                beam:           w.beamStore,        beams:        w.beamStore,
                stair:          w.stairStore,       stairs:       w.stairStore,
                handrail:       w.handrailStore,    handrails:    w.handrailStore,
                roof:           w.roofStore,        roofs:        w.roofStore,
                floor:          w.floorStore,       floors:       w.floorStore,
                ceiling:        w.ceilingStore,     ceilings:     w.ceilingStore,
                plumbing:       w.plumbingStore,
            }),
            // RAW → B3 fallback to commandManager.undo(): door/window (hosted,
            // two-part opening undo — ADR-051 follow-up) + level (Path-A).
            door:   w.doorStore,   doors:   w.doorStore,
            window: w.windowStore, windows: w.windowStore,
            level:  w.levelStore,  levels:  w.levelStore,
        };
    }

    exportIfc(options: { exportScope?: 'native-only' | 'native-and-imported' } = {}) {
        window.runtime?.events?.emit('export-ifc', { exportScope: (options as any)?.exportScope }); // F.events.15
    }

    importIfc() {
        window.runtime?.events?.emit('import-ifc', {});
    }

    reconcileSpatial() {
        this.bimManager.reconcileSpatialContainment();
    }

    activateFurnitureTool(type: string) {
        // Sprint 3 §A: Store active type so FurniturePlanToolHandler can read it.
        window._pryzmActiveFurnitureType = type;

        // Route through ToolManager so PlanViewToolOverlay receives 'furniture'
        // and activates FurniturePlanToolHandler when in plan view.
        const tm = this.props.toolManager as any;
        if (tm?.activateFurniture) {
            tm.activateFurniture(type);
        } else {
            // Fallback: direct 3D activation when ToolManager is unavailable
            const tool = window.furnitureTool;
            if (tool) {
                tool.setFurnitureType(type);
                tool.activate();
            }
        }
    }

    activateHandrailTool(typeId?: string) {
        // §C19-P14: Route through ToolManager so PlanViewToolOverlay receives 'railing'
        const tool = window.handrailTool;
        if (tool && typeof tool.setTypeId === 'function') tool.setTypeId(typeId);
        if (this.props.toolManager?.activateRailing) {
            this.props.toolManager.activateRailing();
        } else if (tool) {
            tool.activate();
        }
    }

    activatePlumbingTool(type: string, variant?: string) {
        // Sprint 3 §B: Route through ToolManager so PlanViewToolOverlay receives 'plumbing'
        // and activates PlumbingPlanToolHandler when in plan view.
        //
        // `variant` selects a LOD400 sub-family (Contract 39 §2):
        //   • type === 'toilet' → ToiletVariant   (ToiletGeometry.ts)
        //   • type === 'shower' → ShowerVariant   (ShowerGeometry.ts)
        const tm = this.props.toolManager as any;
        if (tm?.activatePlumbing) {
            tm.activatePlumbing(type, variant);
        } else {
            // Fallback: direct 3D activation when ToolManager is unavailable
            const tool = window.plumbingTool;
            if (tool) {
                if (typeof tool.setFixtureType === 'function') tool.setFixtureType(type);
                if (type === 'toilet' && variant && typeof tool.setToiletVariant === 'function') {
                    tool.setToiletVariant(variant);
                }
                if (type === 'shower' && variant && typeof tool.setShowerVariant === 'function') {
                    tool.setShowerVariant(variant);
                }
                tool.activate();
            }
        }
    }

    activateCeilingTool(typeId?: string) {
        // §C19-P14: Route through ToolManager so PlanViewToolOverlay receives 'ceiling'
        const tool = window.ceilingTool;
        if (tool && typeof tool.setSystemTypeId === 'function') tool.setSystemTypeId(typeId);
        if (this.props.toolManager?.activateCeiling) {
            this.props.toolManager.activateCeiling();
        } else if (tool) {
            tool.activate();
        }
    }

    activateFloorTool(typeId?: string) {
        // §C19-P14: Route through ToolManager so PlanViewToolOverlay receives 'floor'
        const tool = window.floorTool;
        if (tool && typeof tool.setSystemTypeId === 'function') tool.setSystemTypeId(typeId);
        if (this.props.toolManager?.activateFloor) {
            this.props.toolManager.activateFloor();
        } else if (tool) {
            tool.activate();
        }
    }

    async createWallsOnAllSlabs() {
        const wallHeightStr = prompt('Wall height (m):', '3.0');
        if (wallHeightStr === null) return;
        const wallHeight = parseFloat(wallHeightStr);

        // FIX 2: Validate parsed floats
        if (isNaN(wallHeight)) {
            console.warn('[BimService] Invalid wall height input');
            return;
        }

        const wallThicknessStr = prompt('Wall thickness (m):', '0.2');
        if (wallThicknessStr === null) return;
        const wallThickness = parseFloat(wallThicknessStr);

        if (isNaN(wallThickness)) {
            console.warn('[BimService] Invalid wall thickness input');
            return;
        }

        const command = new CreateWallsOnAllSlabsCommand({ wallHeight, wallThickness });
        const manager = this.commandManager;
        if (manager) manager.execute(command);
    }

    activateStairPathTool(shape?: 'I' | 'L' | 'U') {
        // §42-ELEMENT-CREATION-HUD — pre-tool prerequisite check.
        // A stair connects two levels, so block tool activation when the
        // project only has one level and surface the StairLevelRequiredPanel.
        if (!this._ensureTwoLevelsForStair(() => this.activateStairPathTool(shape))) {
            return;
        }

        // #101 / SPEC-STAIR-3D-CREATION — when the active view is the 3D view
        // (camera is NOT an orthographic plan camera with a mounted drawing),
        // sketch the stair directly in 3D via StairPath3DToolHandler. The plan
        // and split-plan-pane paths below are unchanged. `world.camera.three`
        // reflects the active view's camera (same accessor SlabTool relies on).
        const cam = window.world?.camera?.three;
        const inPlanView = cam ? planView2DCreationMode.isInPlanView(cam) : false;
        if (!inPlanView && window.stairPath3DTool) {
            if (window.stairPath3DTool.activate(shape)) return;
            console.warn('[BimService] 3D stair activation declined — falling back to plan/legacy path');
        }

        const toolManager = this.props.toolManager as any;
        if (toolManager?.activateStairPath) {
            toolManager.activateStairPath(shape ? { initialShape: shape } : undefined);
            return;
        }

        this.createStair(shape ?? 'I');
    }

    /**
     * Returns true when the project has ≥ 2 levels (stair tool can proceed).
     * Returns false and shows the StairLevelRequiredPanel when only one
     * level exists. The panel calls `onRetry` after the user adds a level,
     * which re-invokes the original activation path.
     *
     * §STAIR-LEVEL-ACTIVE-RESTORE (DAILY-USE 2026-05-21) — the architect
     * activated the stair tool from a specific level (typically L0, the
     * ground floor). The prerequisite gate adds a new level to satisfy the
     * "≥ 2 levels" requirement; `AddLevelCommand.execute()` then sets the
     * NEWLY-CREATED level as active (AddLevelCommand.ts:65) — correct
     * default behaviour for users who explicitly add a level via the
     * Levels panel because they want to start working on it, but WRONG
     * for the stair-prerequisite path: the architect intends to draw a
     * stair FROM their original level UP to the new level. Leaving the
     * new level active forces them to manually switch back and risks
     * `_resolveTopLevel(activeLevel)` returning null (active is already
     * topmost) → "Add a second level before placing a stair" toast even
     * though one was just added.
     *
     * Architecturally clean fix:
     *   - Capture `projectContext.activeLevelId` BEFORE showing the panel.
     *   - Wrap the caller's `onRetry` so that after AddLevelCommand runs,
     *     we restore the original active level THEN invoke the original
     *     onRetry. Single responsibility — the AddLevelCommand contract
     *     is unchanged for every other caller; only this gate adjusts.
     *
     * Contract citation: C11 §6 (element-creation pipeline pre-conditions),
     * §05-BIM-UI-ARCHITECTURE §7 (UI orchestration owns the user-flow
     * context that individual commands cannot see).
     */
    private _ensureTwoLevelsForStair(onRetry: () => void): boolean {
        const levels = this.bimManager.getLevels();
        if (levels.length >= 2) return true;

        const manager = this.commandManager;
        if (!manager) {
            console.warn('[BimService] Stair tool: no command manager available, cannot guard levels');
            return true;   // Fail open — let the legacy createStair path handle it.
        }

        const sorted     = [...levels].sort((a: any, b: any) => a.elevation - b.elevation);
        const top        = sorted[sorted.length - 1];
        const topElev    = top ? Number(top.elevation ?? 0) : 0;
        const nextNumber = levels.length;   // 1 level → next is "Level 1"

        // §STAIR-LEVEL-ACTIVE-RESTORE — capture the level the architect was
        // working on BEFORE the panel dispatches AddLevelCommand. The capture
        // path matches how every command resolves the active level
        // (CreateWallCommand, CreateSlabCommand, CreateStairCommand all read
        // ctx.projectContext.activeLevelId), so the captured id is exactly the
        // semantics the user expects to return to.
        const originalActiveLevelId: string | undefined =
            manager.context?.projectContext?.activeLevelId
            ?? (typeof window !== 'undefined'
                ? (window as { commandContext?: { projectContext?: { activeLevelId?: string } } }).commandContext?.projectContext?.activeLevelId
                : undefined);

        // §STAIR-LEVEL-ACTIVE-RESTORE — wrap the caller-supplied onRetry so
        // we restore the architect's original active level AFTER AddLevelCommand
        // promotes the new level. The restore is best-effort (try/catch) so a
        // missing projectContext slot never blocks the retry — the worst case
        // degrades to current behaviour (new level remains active).
        const wrappedOnRetry = (): void => {
            try {
                const pc = manager.context?.projectContext
                    ?? (typeof window !== 'undefined'
                        ? (window as { commandContext?: { projectContext?: { activeLevelId?: string } } }).commandContext?.projectContext
                        : undefined);
                if (pc && originalActiveLevelId && pc.activeLevelId !== originalActiveLevelId) {
                    pc.activeLevelId = originalActiveLevelId;
                    console.log(
                        `[BimService] §STAIR-LEVEL-ACTIVE-RESTORE active level restored to ` +
                        `"${originalActiveLevelId}" after AddLevel (was "${pc.activeLevelId}")`,
                    );
                }
            } catch (err) {
                console.warn('[BimService] §STAIR-LEVEL-ACTIVE-RESTORE skipped:', err);
            }
            onRetry();
        };

        const panel = new StairLevelRequiredPanel();
        panel.show({
            currentLevelCount: levels.length,
            topElevation:      topElev,
            suggestedName:     `Level ${nextNumber}`,
            commandManager:    manager,
            onRetry:           wrappedOnRetry,
            onCancel: () => console.log('[BimService] Stair tool cancelled — fewer than 2 levels'),
        });

        return false;
    }

    createStair(shape: 'I' | 'L' | 'U' = 'I') {
        const levels = this.bimManager.getLevels();

        if (levels.length < 2) {
            console.warn('[BimService] createStair: need at least 2 levels');
            // §42-ELEMENT-CREATION-HUD — surface the prerequisite panel so the
            // user has a one-click path to add a level instead of a dead-end notice.
            this._ensureTwoLevelsForStair(() => this.createStair(shape));
            return;
        }

        const sortedLevels = [...levels].sort((a: any, b: any) => a.elevation - b.elevation);

        const panel = new StairSetupPanel();
        panel.show({
            shape,
            levels: sortedLevels.map((l: any) => ({
                id:        l.id,
                name:      l.name,
                elevation: l.elevation,
            })),
            onConfirm: ({ baseLevelId, topLevelId, width, typeId, mode }) => {
                const baseLevel = sortedLevels.find((l: any) => l.id === baseLevelId);
                const topLevel  = sortedLevels.find((l: any) => l.id === topLevelId);
                if (!baseLevel || !topLevel) return;

                const input = {
                    baseLevelId:        baseLevel.id,
                    topLevelId:         topLevel.id,
                    baseLevelElevation: baseLevel.elevation,
                    topLevelElevation:  topLevel.elevation,
                    shape,
                    width,
                    typeId,
                    mode,
                };

                // §STAIR-L-U-PLAN (DAILY-USE 2026-05-20) — Make the user's
                // setup-panel selection (shape, width, typeId, mode, levels)
                // visible to the plan-view StairPlanToolHandler.  The plan
                // handler previously hard-coded `shape: 'I'` because it had
                // no read path to this config.  Mirrors the existing
                // `window.stairTool` / `window.activeLevelElevation` pattern
                // (transitional global, flagged for later DI plumbing through
                // PlanToolDrawContext per P4 — see TODO in StairPlanToolHandler).
                window.activeStairConfig = {
                    shape,
                    width,
                    typeId,
                    mode,
                    baseLevelId: baseLevel.id,
                    topLevelId:  topLevel.id,
                };

                const stairTool = this.props.stairTool || window.stairTool;
                if (stairTool) {
                    stairTool.activate(input);
                } else if (this.props.toolManager) {
                    this.props.toolManager.activateStair(input);
                }
            },
        });
    }
}
