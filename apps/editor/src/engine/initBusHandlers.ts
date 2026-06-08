import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
  UpdateRoofCommand,
  UpdateColumnCommand,
  UpdateBeamCommand,
  UpdateFloorCommand,
  UpdateCeilingCommand,
  UpdateFurnitureParametersCommand,
  SetDoorOffsetCommand,
  SetWindowOffsetCommand,
  UpdateRoomBoundaryCommand,
  UpdateLevelCommand,
  AddLevelCommand,
  UpdateGridCommand,
  AddGridCommand,
  UpdateViewDefinitionCommand,
  SetViewCropCommand,
  HideElementInViewCommand,
  IsolateElementInViewCommand,
  SetGraphicOverrideCommand,
  ClearOverrideCommand,
  ClearAllOverridesCommand,
  // §P3.5-AN: CreateAnnotationCommand removed — annotation.create bridge retired;
  // registerAnnotationHandlers() in engineLauncher.ts registers the typed handler.
  // CreateFloorCommand removed — §P3.2-FL: floor.create now routes to CreateFloorHandler
  // via registerFloorHandlers() in engineLauncher.ts. initTools.ts §P3.2-FL bridge mirrors
  // to legacy FloorStore for FloorFragmentBuilder mesh rendering.
  // Phase 3 exit gate: grep 'CreateFloorCommand' initBusHandlers.ts → 0 matches.
  // CreateCurtainWallCommand removed — §P3.1-CW: curtainwall.create now routes to
  // CreateCurtainWallHandler via registerCurtainWallHandlers() in engineLauncher.ts.
  CreateOpeningCommand,
  // §P3.5-LT: CreateLightingCommand removed — lighting.create bridge retired;
  // registerLightingHandlers() in engineLauncher.ts registers the typed handler.
  // §P3.5-PL: CreatePlumbingFixtureCommand removed — plumbing.create bridge retired;
  // registerPlumbingHandlers() in engineLauncher.ts registers the typed handler instead.
  // CreateRoofCommand removed — §P3.2-RF: roof.create now routes to CreateRoofHandler
  // via registerRoofHandlers() in engineLauncher.ts. initTools.ts §P3.2-RF bridge mirrors
  // to legacy RoofStore for RoofFragmentBuilder. Phase 3 exit gate: grep 'CreateRoofCommand' initBusHandlers.ts → 0 matches.
  // CreateSectionMarkCommand removed — §P3.4-SE: section.create now routes to CreateSectionHandler
  // via registerSectionHandlers() in engineLauncher.ts. Phase 3 exit gate: grep 'section.create' bridges → 0 entries.
  CreateStairCommand,
  CreateElevationMarkCommand,
  AssignViewIntentCommand,
  CreateVisibilityIntentCommand,
  UpdateVisibilityIntentCommand,
  DeleteViewDefinitionCommand,
  CreateViewDefinitionCommand,
  AddViewportToSheetCommand,
  // §P2.3: CreateWallOpeningCommand removed — wall.opening.create is now handled
  //         by WallOpeningLegacyAdapterHandler registered via registerWallHandlers().
  SetDerivationCommand,
  UnassignTemplateCommand,
  AssignTemplateToNodeCommand,
  ClearPropertyDerivedCommand,
  MarkPropertyDerivedCommand,
  UpdateHierarchyNodeCommand,
  CreateSiteCommand,
  CreateBuildingCommand,
  CreateHierarchyLevelCommand,
  CreateUnitCommand,
  TakeLatestIntentVersionCommand,
  CreateViewTemplateCommand,
  UpdateViewTemplateCommand,
  DeleteViewTemplateCommand,
  MoveViewportCommand,
  GenerativeDesignApplyCommand,
  UpdateElementParameterCommand,
} from '@pryzm/command-registry';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

/**
 * Registers structural command-bus stubs (§A40-W04 — column/beam/door/window/ceiling/stair).
 *
 * All authoritative element handlers (wall, slab, room, curtain-wall, level) are now
 * registered via registerXHandlers() calls in engineLauncher.ts (F-1.3).
 *
 * The five legacy commandManager bridge registrations that previously lived here
 * (rooms.redetect §P0-A39, curtain-wall.create-on-all-slabs §P2-A39,
 * wall.create-on-all-slabs §A40-W03, slab.create-on-all-floors §A40-W03,
 * level.duplicate-floor-plan) have been migrated to plugin-level bridge handlers:
 *   • rooms.redetect          → plugins/rooms/src/handlers/RedetectRooms.ts (CustomEvent bridge)
 *   • wall.create-on-all-slabs     → plugins/wall/src/handlers/CreateWallsOnAllSlabs.ts
 *   • slab.create-on-all-floors    → plugins/slab/src/handlers/CreateSlabsOnAllFloors.ts
 *   • curtain-wall.create-on-all-slabs → plugins/curtain-wall/src/handlers/CreateCurtainWallsOnAllSlabs.ts
 *   • level.duplicate-floor-plan   → plugins/levels/src/handlers/DuplicateFloorPlan.ts
 *
 * Anchor: docs/archive/pryzm3-internal/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3
 */
export function initBusHandlers(
    runtime: PryzmRuntime | null,
): void {
    if (!runtime) return;

    // ── §A40-W04: column/beam/door/window/ceiling/stair structural batch handlers
    // These are structural stubs — they acknowledge the command type without
    // modifying any store.  Full Immer handlers land when the respective
    // plugin packages complete their store implementations (Wave 5+).
    // §P3.3-CO (IMPL-PLAN-2026-05-17): column.batch.create structural stub removed.
    // registerColumnHandlers() in engineLauncher.ts now registers the real CreateColumnBatchHandler.
    // The structural stub would conflict with the typed handler registration (silent catch at line 110).
    // Phase 3 exit gate: grep 'column.batch.create' __batchTypes initBusHandlers.ts → 0 entries.
    const __batchTypes: Array<{ type: string; stores: readonly string[] }> = [
        // §P3.3-BM (IMPL-PLAN-2026-05-17): beam.batch.create structural stub removed.
        // registerBeamHandlers() in engineLauncher.ts now registers the real CreateBeamBatchHandler.
        // Phase 3 exit gate: grep 'beam.batch.create' __batchTypes initBusHandlers.ts → 0 entries.
        // §P3.1-DO (IMPL-PLAN-2026-05-17): door.batch.create structural stub removed.
        // registerDoorHandlers() registers the real CreateDoorBatchHandler.
        // §P3.1-WI (IMPL-PLAN-2026-05-17): window.batch.create structural stub removed.
        // registerWindowHandlers() registers the real CreateWindowBatchHandler.
        // §P3.2-CL ceiling.batch.create structural stub removed (registerCeilingHandlers already registered CreateCeilingBatchHandler).
        { type: 'stair.batch.create',   stores: ['stair']   },  // DEFERRED: stairs migration pending
    ];
    for (const { type, stores } of __batchTypes) {
        // §OI-053 (PERF 2026-05-24) — skip if composeRuntime()/a plugin already
        // registered this type; CommandBus.register() throws on duplicate, which
        // was caught + logged as a red console.error per boot (noise + stack cost).
        if (runtime.bus.registry?.has?.(type as any)) continue;
        try {
            runtime.bus.register({
                type: type as any,
                affectedStores: stores as any,
                canExecute: () => ({ valid: true }),
                execute: async () => ({ patches: [], affectedStores: stores }),
            } as any);
            console.log(`[initBusHandlers] §A40-W04: ${type} registered (structural).`);
        } catch (_bte: any) {
            console.error(`[initBusHandlers] §A40-W04: ${type} failed (non-fatal):`, _bte?.message ?? _bte);
        }
    }

    // ── §E.5.x: element update bridge handlers ─────────────────────────────
    // These bridge handlers route bus commands to the legacy commandManager path.
    // Each follows the UpdateSlabPolygonHandler pattern in plugins/slab/src/handlers/.
    // TODO(F-1.4): replace with authoritative Immer store updates when plugin
    //              stores for these element types are fully implemented.

    type BridgeSpec = { type: string; stores: readonly string[]; fn: (cmd: any) => void; validate?: (cmd: any) => string | null };

    // ── §P1.4 (IMPL-PLAN-2026-05-17): _cmExec helper ───────────────────────
    // Replaces the bare `if (cm) cm.execute(...)` pattern that silently dropped
    // commands when commandManager was not yet initialised.  Every bridge fn:
    // body MUST use this helper instead of the bare pattern.
    //
    // §P1.2 BRIDGE METADATA RULE:
    // Bridge handlers that carry no special source context MUST call `_cmExec(cmd)`
    // without a second argument — the legacy commandManager default applies.
    // Handlers that need explicit source tagging for audit trails (viewTemplate.*
    // and sheet.moveViewport) MUST pass `{ source: 'HUMAN_DIRECT' }` (or a
    // cmd-derived source) explicitly as the second arg.  Do not mix the two
    // forms arbitrarily — if you are uncertain, omit the second arg.
    function _cmExec(cmd: unknown, meta?: unknown): void {
        const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
        if (cm) {
            cm.execute(cmd, meta);
            return;
        }
        console.error(
            '[initBusHandlers] §P1.4: commandManager not ready — command dropped:',
            (cmd as any)?.constructor?.name ?? 'unknown',
        );
    }

    const __bridges: BridgeSpec[] = [
        // ── existing element update bridges (E.5.1–E.5.3) ──────────────────
        {
            type: 'roof.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateRoofCommand(cmd.id, cmd.updates)); },
        },
        {
            type: 'column.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateColumnCommand({ id: cmd.id, updates: cmd.updates })); },
        },
        {
            type: 'beam.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.beamId ? 'beamId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateBeamCommand({ beamId: cmd.beamId, updates: cmd.updates })); },
        },
        {
            type: 'floor.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.floorId ? 'floorId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateFloorCommand({ floorId: cmd.floorId, updates: cmd.updates })); },
        },
        {
            type: 'ceiling.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.ceilingId ? 'ceilingId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateCeilingCommand({ ceilingId: cmd.ceilingId, updates: cmd.updates })); },
        },
        {
            type: 'furniture.updateParameters',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => {
                const { id, ...rest } = cmd;
                _cmExec(new UpdateFurnitureParametersCommand({ id, ...rest }));
            },
        },

        // ── §R4-FIX: element.updateParameters — PropertyPanel.onApply() bridge ──
        // PropertyPanel fires this command via window.runtime.bus.executeCommand()
        // for ALL element types when the user clicks "Apply Changes".
        // Previously unregistered → the call silently no-oped (optional-chain on
        // unregistered type returned undefined) so no store or scene update occurred.
        // UpdateElementParameterCommand routes per-elementType to the correct store
        // and triggers the geometry rebuild for each type.
        {
            type: 'element.updateParameters',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.elementId   ? 'elementId is required'   :
                !cmd.elementType ? 'elementType is required' :
                (!cmd.parameters || Object.keys(cmd.parameters).length === 0) ? 'parameters must not be empty' :
                null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId:   cmd.elementId,
                    elementType: cmd.elementType,
                    parameters:  cmd.parameters as Record<string, any>,
                }));
            },
        },

        {
            type: 'door.setOffset',
            stores: [] as const,
            validate: (cmd) => (!cmd.doorId ? 'doorId is required' : null),
            fn: (cmd) => { _cmExec(new SetDoorOffsetCommand(cmd.doorId, cmd.newOffset, cmd.prevOffset)); },
        },
        {
            type: 'window.setOffset',
            stores: [] as const,
            validate: (cmd) => (!cmd.windowId ? 'windowId is required' : null),
            fn: (cmd) => { _cmExec(new SetWindowOffsetCommand(cmd.windowId, cmd.newOffset, cmd.prevOffset)); },
        },
        {
            type: 'room.updateBoundary',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateRoomBoundaryCommand(cmd.id, cmd.boundary, cmd.boundingWallIds ?? [])); },
        },

        // ── E.5.4: level bridges ────────────────────────────────────────────
        {
            type: 'level.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.levelId ? 'levelId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateLevelCommand({ levelId: cmd.levelId, updates: cmd.updates })); },
        },
        {
            type: 'level.add',
            stores: [] as const,
            validate: (cmd) => (!cmd.levelId ? 'levelId is required' : null),
            fn: (cmd) => {
                // §R7-FIX: _skipBridge guard — skip when the caller has already
                // dispatched AddLevelCommand directly via commandManager (dual-write,
                // C02 §3.4).  Prevents a duplicate undo-stack entry and the
                // "Level ID already exists" canExecute rejection that would otherwise
                // fire for the same levelId dispatched from StairLevelRequiredPanel.
                if ((cmd as any)._skipBridge) return;
                _cmExec(new AddLevelCommand({ levelId: cmd.levelId, name: cmd.name, elevation: cmd.elevation, height: cmd.height }));
            },
        },

        // ── E.5.4: grid bridges ─────────────────────────────────────────────
        {
            type: 'grid.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.gridId ? 'gridId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateGridCommand({ gridId: cmd.gridId, updates: cmd.updates })); },
        },
        {
            type: 'grid.add',
            stores: [] as const,
            validate: (cmd) => (!cmd.orientation ? 'orientation is required' : null),
            fn: (cmd) => { _cmExec(new AddGridCommand(cmd)); },
        },

        // ── E.5.4: view-definition bridges ─────────────────────────────────
        {
            type: 'view.updateDefinition',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateViewDefinitionCommand(cmd.viewId, cmd.updates)); },
        },
        {
            type: 'view.setCrop',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd) => { _cmExec(new SetViewCropCommand({ viewId: cmd.viewId, crop: cmd.crop })); },
        },

        // ── E.5.4: view-graph override bridges ─────────────────────────────
        {
            type: 'view.hideElement',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.elementId ? 'viewId and elementId are required' : null),
            fn: (cmd) => { _cmExec(new HideElementInViewCommand(cmd.viewId, cmd.elementId)); },
        },
        {
            type: 'view.isolateElement',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.elementId ? 'viewId and elementId are required' : null),
            fn: (cmd) => { _cmExec(new IsolateElementInViewCommand(cmd.viewId, cmd.elementId)); },
        },
        {
            type: 'view.setGraphicOverride',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.targetId ? 'viewId and targetId are required' : null),
            fn: (cmd) => { _cmExec(new SetGraphicOverrideCommand(cmd.viewId, cmd.targetKind, cmd.targetId, cmd.state, cmd.patch)); },
        },
        {
            type: 'view.clearOverride',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.targetId ? 'viewId and targetId are required' : null),
            fn: (cmd) => { _cmExec(new ClearOverrideCommand(cmd.viewId, cmd.targetKind, cmd.targetId, cmd.state)); },
        },
        {
            type: 'view.clearAllOverrides',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd) => { _cmExec(new ClearAllOverridesCommand(cmd.viewId)); },
        },

        // ── E.5.4: annotation bridge ────────────────────────────────────────
        // §P3.5-AN (IMPL-PLAN-2026-05-17): annotation.create bridge removed.
        // registerAnnotationHandlers() in engineLauncher.ts registers the typed handler.
        // Phase 3 exit gate: grep 'annotation.create' fn: initBusHandlers.ts → 0 entries.
        //
        // BUG-ANNO-DRAG (2026-06-08): PlanViewInteraction._onMouseUp dispatches the
        // LEGACY UpdateAnnotationCommand on runtime.bus (type 'UPDATE_ANNOTATION') to
        // move a room-tag in window.annotationStore — but no handler existed, so the
        // drag threw CommandBusError and the move was lost. The payload IS an already-
        // constructed UpdateAnnotationCommand, so forward it through the legacy
        // commandManager (its canExecute/execute/undo own the store mutation + undo
        // snapshot) — mirrors RoomTagAutoPopulator's create/delete path. (No typed
        // handler exists for the legacy room-tag store; the new annotation.* handlers
        // write a different anchor-keyed store, so we cannot repoint to them.)
        {
            type: 'UPDATE_ANNOTATION',
            stores: [] as const,
            validate: (cmd) => (cmd && typeof (cmd as { execute?: unknown }).execute === 'function'
                ? null
                : 'UPDATE_ANNOTATION payload must be an UpdateAnnotationCommand'),
            fn: (cmd) => { _cmExec(cmd); },
        },

        // ── E.5.4: create element bridges ───────────────────────────────────
        // §P3.2-FL (IMPL-PLAN-2026-05-17): floor.create bridge removed.
        // FloorPlanToolHandler now dispatches 'floor.create' directly to CreateFloorHandler
        // registered via registerFloorHandlers() in engineLauncher.ts.
        // The initTools.ts §P3.2-FL bridge mirrors the floor into the legacy FloorStore
        // for FloorFragmentBuilder mesh rendering.
        // Phase 3 exit gate: grep 'floor.create' initBusHandlers.ts → 0 bridge entries.
        // §P3.1-CW (IMPL-PLAN-2026-05-17): curtain-wall.create bridge removed.
        // CurtainWallPlanToolHandler now dispatches 'curtainwall.create' (no hyphen)
        // directly to CreateCurtainWallHandler registered via registerCurtainWallHandlers()
        // in engineLauncher.ts. The initTools.ts §P3.1-CW bridge mirrors the curtain wall
        // into the legacy CurtainWallStore for mesh rebuild.
        // Phase 3 exit gate: grep 'curtain-wall.create' initBusHandlers.ts → 0 matches.
        {
            type: 'opening.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new CreateOpeningCommand(cmd)); },
        },
        // §P3.5-LT (IMPL-PLAN-2026-05-17): lighting.create bridge removed.
        // registerLightingHandlers() in engineLauncher.ts registers the typed handler.
        // Phase 3 exit gate: grep 'lighting.create' fn: initBusHandlers.ts → 0 entries.
        // §P3.5-PL (IMPL-PLAN-2026-05-17): plumbing.create bridge removed.
        // registerPlumbingHandlers() in engineLauncher.ts now registers the real CreatePlumbing/
        // CreatePlumbingFixture typed handlers.  Duplicate registration would conflict.
        // Phase 3 exit gate: grep 'plumbing.create' bridges initBusHandlers.ts → 0 entries.
        // §P3.2-RF (IMPL-PLAN-2026-05-17): roof.create bridge removed.
        // RoofPlanToolHandler now dispatches 'roof.create' directly to CreateRoofHandler
        // registered via registerRoofHandlers() in engineLauncher.ts.
        // The initTools.ts §P3.2-RF bridge mirrors the roof into the legacy RoofStore
        // for RoofFragmentBuilder mesh rendering.
        // Phase 3 exit gate: grep 'roof.create' initBusHandlers.ts → 0 bridge entries.
        // §P3.4-SE (IMPL-PLAN-2026-05-17): section.create bridge removed.
        // registerSectionHandlers() in engineLauncher.ts now registers the real typed handlers
        // (CreateSectionHandler, DeleteSectionHandler, MoveSectionLineHandler, SetSectionDepth/Mark/Scale).
        // SectionData type gap resolved: SectionData / SectionLine / SectionId added to @pryzm/schemas.
        // Phase 3 exit gate: grep 'section.create' bridges initBusHandlers.ts → 0 entries.
        {
            type: 'stair.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.baseLevelId ? 'baseLevelId is required' : null),
            fn: (cmd) => { _cmExec(new CreateStairCommand(cmd)); },
        },
        {
            type: 'elevation.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.elevationViewId ? 'elevationViewId is required' : null),
            fn: (cmd) => { _cmExec(new CreateElevationMarkCommand(cmd)); },
        },

        // ── E.5.5: view governance & intent bridges ──────────────────────
        {
            type: 'vg.assignIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId || !cmd.intentId ? 'viewId and intentId are required' : null),
            fn: (cmd: any) => { _cmExec(new AssignViewIntentCommand({ viewId: cmd.viewId, intentId: cmd.intentId, keepOverrides: cmd.keepOverrides })); },
        },
        {
            type: 'vg.createVisibilityIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'VisibilityIntent id is required' : null),
            fn: (cmd: any) => { _cmExec(new CreateVisibilityIntentCommand(cmd)); },
        },
        {
            type: 'vg.updateVisibilityIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.intentId ? 'intentId is required' : null),
            fn: (cmd: any) => { _cmExec(new UpdateVisibilityIntentCommand(cmd.intentId, cmd.patch)); },
        },
        {
            type: 'view.deleteDefinition',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd: any) => { _cmExec(new DeleteViewDefinitionCommand(cmd.viewId)); },
        },
        {
            type: 'view.createDefinition',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'ViewDefinition id is required' : null),
            fn: (cmd: any) => { _cmExec(new CreateViewDefinitionCommand(cmd)); },
        },
        {
            type: 'sheet.addViewport',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.sheetId || !cmd.viewId ? 'sheetId and viewId are required' : null),
            fn: (cmd: any) => { _cmExec(new AddViewportToSheetCommand(cmd)); },
        },

        // ── E.5.6: wall openings ──────────────────────────────────────────────
        // §P2.3 (IMPL-PLAN-2026-05-17): wall.opening.create is now handled by
        // WallOpeningLegacyAdapterHandler (plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts)
        // registered via registerWallHandlers().  The legacy _cmExec(new CreateWallOpeningCommand(...))
        // bridge has been removed — C11 §3 single pipeline compliance.
        // ── E.5.6b: data derivation (unchanged) ──────────────────────────────
        {
            type: 'data.setDerivation',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId   ? 'nodeId is required'  :
                !cmd.keys?.length ? 'keys must be a non-empty array' :
                !cmd.reason   ? 'reason is required'  :
                null
            ),
            fn: (cmd: any) => { _cmExec(new SetDerivationCommand({ nodeId: cmd.nodeId, keys: cmd.keys, reason: cmd.reason })); },
        },

        // ── E.5.7: DataSheetPanel — template + property derivation ──────────
        {
            type: 'template.unassign',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.nodeId ? 'nodeId is required' : null),
            fn: (cmd: any) => { _cmExec(new UnassignTemplateCommand({ nodeId: cmd.nodeId })); },
        },
        {
            type: 'template.assignToNode',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId     ? 'nodeId is required'     :
                !cmd.templateId ? 'templateId is required' :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new AssignTemplateToNodeCommand({
                    nodeId: cmd.nodeId,
                    nodeType: cmd.nodeType,
                    templateId: cmd.templateId,
                    assignedBy: cmd.assignedBy ?? 'user',
                }));
            },
        },
        {
            type: 'data.clearPropertyDerived',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId ? 'nodeId is required' :
                !cmd.key    ? 'key is required'    :
                null
            ),
            fn: (cmd: any) => { _cmExec(new ClearPropertyDerivedCommand({ nodeId: cmd.nodeId, key: cmd.key })); },
        },
        {
            type: 'data.markPropertyDerived',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId ? 'nodeId is required' :
                !cmd.key    ? 'key is required'    :
                !cmd.reason ? 'reason is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new MarkPropertyDerivedCommand({ nodeId: cmd.nodeId, key: cmd.key, reason: cmd.reason })); },
        },
        {
            type: 'hierarchy.updateNode',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'id is required' : null),
            fn: (cmd: any) => { _cmExec(new UpdateHierarchyNodeCommand({ id: cmd.id, updates: cmd.updates })); },
        },

        // ── E.5.7: HierarchyTree — site/building/level/unit creation ────────
        {
            type: 'hierarchy.createSite',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id   ? 'id is required'   :
                !cmd.name ? 'name is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new CreateSiteCommand({ id: cmd.id, name: cmd.name, code: cmd.code, address: cmd.address })); },
        },
        {
            type: 'hierarchy.createBuilding',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id     ? 'id is required'     :
                !cmd.siteId ? 'siteId is required' :
                !cmd.name   ? 'name is required'   :
                null
            ),
            fn: (cmd: any) => { _cmExec(new CreateBuildingCommand({ id: cmd.id, siteId: cmd.siteId, name: cmd.name, code: cmd.code })); },
        },
        {
            type: 'hierarchy.createLevel',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id         ? 'id is required'         :
                !cmd.buildingId ? 'buildingId is required' :
                !cmd.bimLevelId ? 'bimLevelId is required' :
                !cmd.name       ? 'name is required'       :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateHierarchyLevelCommand({
                    id: cmd.id,
                    buildingId: cmd.buildingId,
                    bimLevelId: cmd.bimLevelId,
                    name: cmd.name,
                    levelNumber: cmd.levelNumber,
                }));
            },
        },
        {
            type: 'hierarchy.createUnit',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id      ? 'id is required'      :
                !cmd.levelId ? 'levelId is required' :
                !cmd.name    ? 'name is required'    :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateUnitCommand({
                    id: cmd.id,
                    levelId: cmd.levelId,
                    name: cmd.name,
                    unitNumber: cmd.unitNumber,
                    unitType: cmd.unitType,
                }));
            },
        },

        // ── E.5.7b: ViewPropertiesPanel / ViewTemplateManager / SheetEditor / VariantBrowser ──
        // §P1.2 NOTE: the three viewTemplate bridges and sheet.moveViewport pass
        // explicit { source: 'HUMAN_DIRECT' } (or cmd-derived source) as the second
        // argument because these operations feed audit trails and OTel source tags.
        // This is intentional and correct — do not remove the metadata arg.
        {
            type: 'vg.takeLatestIntentVersion',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd: any) => { _cmExec(new TakeLatestIntentVersionCommand({ viewId: cmd.viewId })); },
        },
        {
            type: 'viewTemplate.create',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id   ? 'id is required'   :
                !cmd.name ? 'name is required' :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateViewTemplateCommand({
                    id:           cmd.id,
                    name:         cmd.name,
                    discipline:   cmd.discipline,
                    description:  cmd.description,
                    lockedFields: cmd.lockedFields,
                }), { source: cmd.source ?? 'HUMAN_DIRECT' });
            },
        },
        {
            type: 'viewTemplate.update',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.templateId ? 'templateId is required' :
                !cmd.patch      ? 'patch is required'      :
                null
            ),
            fn: (cmd: any) => { _cmExec(new UpdateViewTemplateCommand(cmd.templateId, cmd.patch), { source: 'HUMAN_DIRECT' }); },
        },
        {
            type: 'viewTemplate.delete',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.templateId ? 'templateId is required' : null),
            fn: (cmd: any) => {
                // §P1.4: viewTemplate.delete reads the return value, so it cannot
                // use the fire-and-forget _cmExec helper.  The explicit error branch
                // is required here (C11 §5 — no silent failures).
                const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
                if (!cm) {
                    console.error('[initBusHandlers] §P1.4: commandManager not ready — viewTemplate.delete dropped:', cmd.templateId);
                    return;
                }
                const result: any = cm.execute(new DeleteViewTemplateCommand(cmd.templateId), { source: 'HUMAN_DIRECT' });
                if (!result?.success) {
                    throw new Error(result?.error ?? 'Cannot delete template — check that no views use it.');
                }
            },
        },
        {
            type: 'sheet.moveViewport',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.sheetId    ? 'sheetId is required'    :
                !cmd.viewportId ? 'viewportId is required' :
                !cmd.newPosition ? 'newPosition is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new MoveViewportCommand(cmd.sheetId, cmd.viewportId, cmd.newPosition), { source: 'HUMAN_DIRECT' }); },
        },
        {
            type: 'generative.applyLayout',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.layout   ? 'layout is required'   :
                !cmd.levelId  ? 'levelId is required'  :
                null
            ),
            fn: (cmd: any) => { _cmExec(new GenerativeDesignApplyCommand(cmd.layout, cmd.levelId, cmd.levelHeight ?? 3.0)); },
        },
    ];

    for (const spec of __bridges) {
        // §OI-053 (PERF 2026-05-24) — skip if already registered (composeRuntime /
        // a plugin / engineLauncher F-1.3). Avoids the duplicate-register throw that
        // was caught + logged as a red console.error per boot.
        if (runtime.bus.registry?.has?.(spec.type as any)) continue;
        try {
            runtime.bus.register({
                type: spec.type as any,
                affectedStores: spec.stores as any,
                canExecute: (_ctx: any, cmd: any) => {
                    const reason = spec.validate?.(cmd);
                    return reason ? { valid: false, reason } : { valid: true };
                },
                execute: (_ctx: any, cmd: any): any => {
                    return withHandlerSpan(`${spec.type}.handler`, { 'pryzm.command.type': spec.type }, () => {
                        try {
                            spec.fn(cmd);
                        } catch (e) {
                            console.error(`[initBusHandlers] ${spec.type} bridge failed:`, e);
                        }
                        return { forward: [], inverse: [] };
                    });
                },
            } as any);
            console.log(`[initBusHandlers] §E.5.x: ${spec.type} registered (bridge).`);
        } catch (_be: any) {
            console.error(`[initBusHandlers] §E.5.x: ${spec.type} failed (non-fatal):`, _be?.message ?? _be);
        }
    }
}
