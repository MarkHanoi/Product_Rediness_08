import { aiService } from '@pryzm/ai-host';
import { DeleteElementCommand, AddLevelCommand, CreateWallsOnAllSlabsCommand } from '@pryzm/command-registry';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import { StairSetupPanel } from '@app/ui/StairSetupPanel';
import { StairLevelRequiredPanel } from '@app/ui/StairLevelRequiredPanel';
import { deleteIfcImportedElement, isIfcImportedElement } from '@pryzm/file-format';

import { BimManager } from '@pryzm/core-app-model';
import type { ViewMode } from '@pryzm/core-app-model';
import { setStairToolConfig, type StairShapeChoice } from '@pryzm/geometry-stair';
import type { IBimService } from '@pryzm/engine';
import { activateStairSketchSurfaces } from './stairSketchRouting';
import { setActiveRoofDrawMode } from './views/plantools/activeRoofDrawMode';
// §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — the slab's GESTURE axis, the
// one `activeSlabDrawMode` (the CONSTRAINT axis) never covered. Same cure as roof.
import { setActiveSlabFamilyMode } from './views/plantools/activeSlabFamilyMode';

export class BimService implements IBimService {
    private bimManager: BimManager;
    private wallTool: any;
    private slabTool: any;
    private selectionManager: any;

    constructor(private props: any) {
        this.bimManager = props.bimManager;
        this.wallTool = props.wallTool;
        this.slabTool = props.slabTool;
        // §OI-054 — undoManager field removed: undo()/redo() now delegate to the
        // single unified path (performUndoRedo.ts); the legacy UndoManager is no
        // longer referenced here.
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

    /**
     * §FEAT-SLAB-DRAW-MODES (founder 2026-08-06) — the slab tool now accepts the
     * WALL tool's drawing modes.
     *
     * `linear` / `ortho` / `curved` are POLYLINE SUB-MODES, exactly as they are
     * for walls: all three enter POLYLINE_SLAB and differ only in how each click
     * is constrained. The constraint itself is read from `slabModePicker` by the
     * tool handlers (the `WallModePicker.getActiveMode()` contract), so switching
     * mode mid-draw needs no re-activation.
     *
     * `polyline` is retained as an alias of `linear` so any caller that still
     * asks for the old mode name keeps working unchanged.
     */
    activateSlabTool(
        mode: 'linear' | 'ortho' | 'curved' | 'polyline' | '2point' | 'region' | 'hollow' | 'pickWalls',
    ) {
        // §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — record the GESTURE in
        // the surface-independent store BEFORE activating either surface, exactly as
        // `activateRoofTool` records the roof mode (L-699). This method is the ONE
        // editor-side chokepoint every slab entry point passes through — Create panel,
        // Create rail, the persistent slab mode bar, the bottom action menu — and
        // `ToolsAreaLayout`'s wrapper calls the bound original, so both halves of that
        // wrapper land here too.
        //
        // Before this, `SlabPlanToolHandler` read the gesture off `window.slabTool
        // .toolMode` and mapped 'NONE' onto 'polyline', so a By Region click laid a
        // polyline vertex and created nothing. Constraint values are ignored by the
        // store, so passing 'linear' can never erase a gesture the user chose.
        setActiveSlabFamilyMode(mode);
        const toolManager = this.props.toolManager as any;
        if (toolManager?.activateSlab) {
            toolManager.activateSlab(mode);
            return;
        }

        if (mode === '2point') this.slabTool.enterSketchMode();
        else if (mode === 'hollow') this.slabTool.enterHollowMode();
        else if (mode === 'region') this.slabTool.enterRegionMode();
        else if (mode === 'pickWalls') this.slabTool.enterPickWallsMode();
        // linear / ortho / curved / polyline all draw a POLYLINE slab.
        else this.slabTool.enterPolylineMode();
    }

    activateRoofTool(mode: '2point' | 'polyline' | 'region' | 'single_slope' | 'hip_roof' = '2point') {
        // §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699) — record the mode in the
        // surface-independent store BEFORE activating either surface. This is the
        // single chokepoint every roof entry point passes through (Create panel,
        // Create rail, tools rail, `R` shortcut), so the plan overlay and the 3D
        // RoofTool are configured from ONE activation argument instead of the plan
        // handler reaching into `window.roofTool.activeTool` — which narrowed
        // REGION / single_slope / hip_roof to RECTANGLE and made region roofs
        // impossible in plan view. Exactly the cure L-693 built for floor/ceiling.
        setActiveRoofDrawMode(mode);
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

    /**
     * §DELETE-MUST-ANSWER (L-1403) — the shared sink for THREE of the user's delete
     * routes: the ContextualEditBar Delete button, that bar's own `Del` key, and the
     * SelectionOverlay Delete item.
     *
     * FOUNDER, live 2026-08-24: *"Also the slab can not be deleted? why?"* — while
     * his snapshot climbed to `25 elements, 1 levels, 16 walls, 8 slabs`.
     *
     * ⭐ HIS LOG NAMES THIS METHOD. It carries
     * `[§SELECT-CLEARED] reason=unspecified id=4fd18c72-… type=Slab`, and
     * `reason=unspecified` is `SelectionManager.unselectAll`'s DEFAULT parameter —
     * this was the one delete route calling it with no argument. That line IS the
     * delete attempt, and it fired **unconditionally, after a result nobody read**:
     *
     *     manager.execute(command);            // ← result DISCARDED
     *     this.selectionManager.unselectAll(); // ← ran either way
     *
     * `DeleteElementCommand` refuses by RETURNING (`{ success: false, error }`), and
     * its terminal refusal is `Element ${id} not found in any store`. So a refused
     * delete looked, from the user's chair, exactly like a successful one: the
     * highlight vanished and the element stayed. **That is the whole complaint.**
     *
     * This is the shape §CENSUS-DELETESELECTED (L-1109) closed for the KEYBOARD
     * route in `initUI` — *"the BIM `Object3D` arm reported SUCCESS
     * unconditionally"* — and left open here, on the route with the visible button.
     *
     * FOUR SILENT EXITS ARE NOW FOUR NAMED ANSWERS. Every one of them previously
     * produced no console line, no toast and no change: nothing selected; a
     * selection carrying no element id; no command manager; and the refusal above.
     *
     * ⛔ ON A REFUSAL THE SELECTION SURVIVES. It is the user's only handle on the
     * thing that would not delete — clearing it takes the handle away and makes the
     * refusal indistinguishable from a success. On a real delete it clears as before,
     * now NAMING ITSELF so `reason=deleted` is legible in exactly the log that could
     * not answer this question.
     *
     * ⚠ THE `no manager` BRANCH USED TO CALL `selectionManager.deleteSelected()`.
     * **`SelectionManager` has no such method anywhere in the repo** — that branch
     * was a guaranteed `TypeError`, never a delete under any circumstance. Nothing
     * that worked has been removed; an always-throwing call is replaced by an answer.
     *
     * ⚠ NOT ESTABLISHED, and stated so nobody reads more into this than it proves:
     * whether the founder's delete REFUSED or succeeded-without-removing. Only his
     * `[CommandManager] EXECUTE: DELETE_ELEMENT` / `REFUSED DELETE_ELEMENT` line
     * settles that, and it was not in the excerpt. What IS established is that a
     * refusal here was invisible — which is why the question could not be answered
     * from his console at all.
     */
    deleteSelected() {
        // A refusal is an ANSWER, and it goes to both channels: the console (for the
        // founder's log) and the shared toast bus (for his eyes, mid-gesture). The
        // toast is best-effort — a refusal must never depend on the UI channel being
        // up, or the silent case comes straight back (§CONTEXT-DATA-HONESTY).
        const refuse = (reason: string): void => {
            console.warn(`[BimService] §DELETE-MUST-ANSWER delete not performed — ${reason}`);
            try {
                window.runtime?.events?.emit('pryzm:toast', { message: reason, severity: 'warning' });
            } catch { /* the answer must survive a missing toast channel */ }
        };

        const selected = this.selectionManager.selectedObject;
        if (!selected) {
            refuse('Nothing is selected, so there is nothing to delete.');
            return;
        }

        if (isIfcImportedElement(selected)) {
            void deleteIfcImportedElement(selected, { selectionManager: this.selectionManager });
            return;
        }

        // The KIND is only ever used to word the answer. It is deliberately NOT
        // lower-cased or matched against anything: `SlabFragmentBuilder` mints
        // `elementType: 'Slab'` while walls mint `'wall'`, and `DeleteElementCommand`
        // reads no type string at all — it self-discovers by store probe. Branching
        // on this string is what a reader would be tempted to add here; do not.
        const kind = String(selected.userData?.elementType ?? selected.userData?.type ?? 'element');
        const id = selected.userData?.id;
        if (!id) {
            refuse(
                `The selected ${kind} carries no element id, so it cannot be deleted. `
                + 'Select the element itself rather than one of its parts.',
            );
            return;
        }

        const manager = this.commandManager;
        if (!manager) {
            refuse(
                `The ${kind} was not deleted — the command manager is not available in `
                + 'this session, so no delete could be dispatched.',
            );
            return;
        }

        const result = manager.execute(new DeleteElementCommand(id));
        if (result && result.success === false) {
            const why = result.error
                ?? (Array.isArray(result.info) ? result.info[0] : undefined)
                ?? 'the command refused and gave no reason';
            refuse(`The ${kind} ${String(id).slice(0, 8)} was NOT deleted: ${why}`);
            return; // ⛔ keep the selection — see the header.
        }

        this.selectionManager.unselectAll('deleted');
    }

    undo() {
        // §OI-054 (2026-05-24) — delegate to THE single unified undo path
        // (C03 §4.6 U-5). The ring-buffer-first + shadow-drop + commandManager
        // fallback logic (formerly duplicated here and in initUI) now lives in one
        // module so every trigger behaves identically.
        void import('./undo/performUndoRedo.js').then(m => m.performUndo());
    }

    redo() {
        void import('./undo/performUndoRedo.js').then(m => m.performRedo());
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

    /**
     * §FIX-FINISH-MODE-PLAN-UNREACHABLE (founder 2026-08-06) — `mode` is the
     * DRAWING mode (linear / ortho / curved / rectangle / auto).
     *
     * It exists because "Auto Ceiling" used to be expressed ONLY as
     * `window.ceilingTool.setMode('AUTO_FROM_ROOM')` — a field on the 3D tool
     * INSTANCE. `CeilingPlanToolHandler` reads the mode from `ceilingModePicker`
     * instead, so the 3D tool's AUTO was invisible to the plan surface and the
     * plan tool silently stayed in polygon mode: AUTO was unreachable in plan
     * view. The ToolsAreaLayout wrapper applies this argument to BOTH the 3D tool
     * and the picker, so one activation puts every surface in the same mode.
     */
    activateCeilingTool(typeId?: string, _mode?: string) {
        // §C19-P14: Route through ToolManager so PlanViewToolOverlay receives 'ceiling'
        const tool = window.ceilingTool;
        if (tool && typeof tool.setSystemTypeId === 'function') tool.setSystemTypeId(typeId);
        if (this.props.toolManager?.activateCeiling) {
            this.props.toolManager.activateCeiling();
        } else if (tool) {
            tool.activate();
        }
    }

    /**
     * §FIX-FINISH-MODE-PLAN-UNREACHABLE (founder 2026-08-06) — see
     * `activateCeilingTool`. The founder's named case: "FLOOR FINISH is NOT
     * capable of being created in PLAN VIEW". The plan HANDLER was in fact
     * registered all along (`planToolHandlerRegistry` → 'floor'); what was
     * unreachable was its AUTO **mode**, because "Auto Floor" only ever wrote
     * `window.floorTool.setMode('AUTO_FROM_ROOM')` — a 3D-tool instance field the
     * plan handler cannot see (the same class of defect as L-255, which fixed the
     * finish PARAMETERS by the same argument but left the MODE behind).
     */
    activateFloorTool(typeId?: string, _mode?: string) {
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

    activateStairPathTool(shape?: StairShapeChoice) {
        // §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) — publish the ribbon's shape choice
        // to the single StairToolConfigStore chokepoint, so the plan tool, the 3D sketch
        // tool and any batch/AI path all author from the SAME resolved config (P2).
        if (shape) setStairToolConfig({ shape });

        // §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) — the "≥ 2 levels" pre-tool gate is
        // GONE from this path, and its removal is the fix, not a regression.
        //
        // It asked the WRONG QUESTION. A stair does not need "two levels to exist" —
        // it needs "a level ABOVE THE ONE IT IS DRAWN ON". The old gate was both:
        //   • too strict — a fresh project boots with a single Ground level, so the
        //     stair tool refused to activate at all and the architect could never draw
        //     one without first hand-creating a storey (the founder's report); and
        //   • too weak  — a 2-level project whose TOP level's plan view is open sailed
        //     through the gate and then died SILENTLY inside the tool (zero span →
        //     riserHeight 0 → solver invalid → bare console.warn).
        //
        // ADR-0098: the stair is authored by HEIGHT and IMPLIES the level above when
        // none exists. The plan handlers now resolve the span at the ONE chokepoint
        // (`resolveStairVerticalSpan`) and create the implied storey with AddLevelCommand
        // (P6) — a command, not a dead-end toast. The invariant the old gate was
        // imagined to protect (riserHeight × riserCount === height) is NOT protected by
        // counting levels; it is protected by `deriveRisers()` and enforced by
        // `CreateStairCommand.canExecute`'s HEIGHT_TOLERANCE check. Both still hold.
        //
        // `createStair()` (the 3D StairSetupPanel route) KEEPS the panel, because that
        // panel makes the user PICK a base and a top level from a dropdown and so
        // genuinely needs two levels to populate.

        // §FIX-STAIR-PLAN-ROUTING-VIEWSTATE (L-217) — route on the AUTHORITATIVE
        // view mode, never on snap availability. The prior guard asked
        // planView2DCreationMode.isInPlanView(camera), which answers "is a 2D snap
        // drawing mounted?" (orthographic camera AND a TechnicalDrawing) — NOT "is
        // the active view a plan view?". Whenever the drawing was absent (e.g. right
        // after a split-view / plan teardown nulls activePlanDrawingRef) that guard
        // mis-concluded "3D" over an orthographic plan camera and bound the 3D
        // sketch handler, so nothing was created. ViewController is the single
        // source of truth for view state; window.viewController is the documented
        // seam other UI guards already read (ViewsRailPanel / GridsLevelsRailPanel /
        // BottomActionMenu — pending Phase D.4). Only the perspective '3D' view
        // hosts the 3D sketch handler (SPEC-STAIR-3D-CREATION #101); every plan-like
        // mode ('Top' and the ceiling-plan family) authors the footprint via the
        // plan tool handlers below. See stairSketchRouting.ts for the full mode map.
        //
        // §FIX-STAIR-DUAL-VIEW-ACTIVATION — the routing above used to be EXCLUSIVE:
        // when `shouldSketchStairIn3D` said "3D" this method returned WITHOUT ever
        // arming the plan-tool path. In the founder's default layout (split view: 3D
        // main viewport + plan pane) `ViewController.currentMode` is '3D', so the plan
        // pane could NEVER author a stair — `StairPathPlanToolHandler` was authored,
        // registered in `planToolHandlerRegistry`, and simply never dispatched.
        //
        // Both surfaces are now armed in parallel, exactly as every healthy element
        // tool already does (PlanViewToolOverlay.attach() documents "the 3D placement
        // tools that are armed in parallel"; `activateWallTool` above just calls
        // `toolManager.activateWall()` while WallTool binds the 3D canvas). The canvas
        // the pointer is over decides which handler receives the interaction. Both
        // handlers commit through the SAME `CreateStairCommand` (C03 — one
        // serialisable/undoable creation path with a stable element id).
        const viewMode = (window.viewController as { currentMode?: ViewMode } | undefined)?.currentMode;
        const cameraIsPerspective = window.world?.camera?.three?.isPerspectiveCamera === true;
        const toolManager = this.props.toolManager as any;

        activateStairSketchSurfaces(viewMode, cameraIsPerspective, {
            arm3D: (s) => {
                const tool = window.stairPath3DTool;
                if (!tool) return false;
                const ok = tool.activate(s) === true;
                if (!ok) console.warn('[BimService] 3D stair activation declined — plan path still armed');
                return ok;
            },
            armPlan: (s) => {
                if (!toolManager?.activateStairPath) return false;
                void toolManager.activateStairPath(s ? { initialShape: s } : undefined);
                return true;
            },
            // §FIX-STAIR-SHAPE-DESYNC — the legacy 3D setup-panel fallback has no
            // curved authoring; route 'C' to the straight panel rather than widening a
            // path that cannot honour it. The stair-PATH tool (armPlan/arm3D above) is
            // the authoritative curved route and is tried first.
            fallback: (s) => this.createStair(s === 'C' ? 'I' : s),
        }, shape);
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

                // §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) P2 — publish the user's
                // setup-panel selection to the SINGLE StairToolConfigStore chokepoint.
                // This used to stamp `window.activeStairConfig`, a transitional global
                // that ONLY this (3D) path ever wrote, so a stair drawn in PLAN silently
                // lost the chosen shape / width / type unless the architect had first
                // been through the 3D flow — the same C11 defect as L-239 / L-213 / L-240,
                // and a live P4 violation. Every creation path now reads the same
                // resolved config (plan handlers receive it by DI via
                // PlanToolDrawContext.stairConfig). The global is gone.
                setStairToolConfig({ shape, width, typeId, mode });

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
