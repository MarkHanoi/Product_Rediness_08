// commands/ — barrel re-export for all command infrastructure
//
// Uses `export *` per-file so type names are always correct regardless of what
// each command file chooses to export. Barrel re-export files (GenericCommands,
// stair/index, vg/index, etc.) are skipped to avoid duplicate-export errors.

// ─── Root-level types & infrastructure ────────────────────────────────────
export * from './types';
export * from './CommandManagerImpl';
export { CommandProposalFactory } from './CommandProposalFactory';
export * from './CommandProposalStore';
export * from './PatchSnapshot';
export * from './TagElementCommand';
export * from './UpdateElementMarkCommand';

// ─── Annotations ──────────────────────────────────────────────────────────
export * from './annotations/AnnotateViewCommand';
export * from './annotations/CreateAnnotationCommand';
export * from './annotations/CreateCalloutDetailCommand';
export * from './annotations/CreateElevationMarkCommand';
export * from './annotations/CreateSectionMarkCommand';
export * from './annotations/DeleteAnnotationCommand';
export * from './annotations/LockAnnotationCommand';
export * from './annotations/UpdateAnnotationCommand';
export * from './annotations/UpdateConstraintCommand';

// ─── Beam ─────────────────────────────────────────────────────────────────
export * from './beam/CreateBeamCommand';
export * from './beam/UpdateBeamCommand';
export * from './beam/AssignBeamSupportsCommand';

// ─── Catalog ──────────────────────────────────────────────────────────────
export * from './catalog/AddAssetCatalogEntryCommand';
export * from './catalog/DeleteAssetCatalogEntryCommand';
export * from './catalog/UpdateAssetCatalogEntryCommand';

// ─── Ceilings ─────────────────────────────────────────────────────────────
export * from './ceilings/CreateCeilingCommand';
export * from './ceilings/CreateCeilingsByRoomCommand';
export * from './ceilings/RemoveCeilingCommand';
export * from './ceilings/UpdateCeilingCommand';
export * from './ceilings/UpdateCeilingLayersCommand';

// ─── Columns ──────────────────────────────────────────────────────────────
export * from './columns/CreateColumnCommand';
export * from './columns/DeleteColumnCommand';
export * from './columns/RemoveColumnsOnLevelCommand';
export * from './columns/UpdateColumnCommand';
export * from './columns/UpdateColumnLevelCommand';

// ─── Curtain walls ────────────────────────────────────────────────────────
export * from './curtainwall/AddCurtainGridLineCommand';
export * from './curtainwall/CreateCurtainWallCommand';
export * from './curtainwall/CreateCurtainWallsFromSlabCommand';
export * from './curtainwall/CreateCurtainWallsOnAllSlabsCommand';
export * from './curtainwall/RemoveCurtainGridLineCommand';
export * from './curtainwall/ReplacePanelTypeCommand';
export * from './curtainwall/ReplacePanelWithDoorCommand';
export * from './curtainwall/UpdateAllCurtainWallsCommand';
export * from './curtainwall/UpdateCurtainWallCommand';

// ─── Doors ────────────────────────────────────────────────────────────────
export * from './doors/MoveDoorCommand';
export * from './doors/SetDoorOffsetCommand';
export * from './doors/UpdateDoorAccessibilityTypeCommand';
export * from './doors/UpdateDoorFireRatingCommand';
export * from './doors/UpdateDoorFrameColorCommand';
export * from './doors/UpdateDoorHeightCommand';
export * from './doors/UpdateDoorLeafColorCommand';
export * from './doors/UpdateDoorParameterCommand';
export * from './doors/UpdateDoorSillHeightCommand';
export * from './doors/UpdateDoorWidthCommand';

// ─── Floors ───────────────────────────────────────────────────────────────
export * from './floors/CreateFloorCommand';
export * from './floors/CreateFloorsByRoomTypeCommand';
export * from './floors/RemoveFloorCommand';
export * from './floors/UpdateFloorCommand';
export * from './floors/UpdateFloorLayersCommand';

// ─── Furniture ────────────────────────────────────────────────────────────
export * from './furniture/CreateAIElementCommand';
export * from './furniture/CreateAIWardrobeCommand';
export * from './furniture/CreateFurnitureCommand';
export * from './furniture/UpdateAIElementParametersCommand';
export * from './furniture/UpdateFurnitureParametersCommand';

// ─── Generic ──────────────────────────────────────────────────────────────
export * from './generic/UpdateElementParameterCommand';

// ─── Geospatial ───────────────────────────────────────────────────────────
export * from './geospatial/SetGeoreferenceCommand';

// ─── Grids ────────────────────────────────────────────────────────────────
export * from './grids/AddGridCommand';
export * from './grids/CreateGridSystemCommand';
export * from './grids/RemoveGridCommand';
export * from './grids/TogglePinGridCommand';
export * from './grids/UpdateGridCommand';

// ─── Handrails ────────────────────────────────────────────────────────────
export * from './handrails/CreateHandrailCommand';
export * from './handrails/DeleteHandrailCommand';
export * from './handrails/UpdateHandrailCommand';

// ─── Hierarchy ────────────────────────────────────────────────────────────
export * from './hierarchy/AssignRoomToUnitCommand';
export * from './hierarchy/CreateBuildingCommand';
export * from './hierarchy/CreateHierarchyLevelCommand';
export * from './hierarchy/CreateSiteCommand';
export * from './hierarchy/CreateUnitCommand';
export * from './hierarchy/DeleteHierarchyNodeCommand';
export * from './hierarchy/UpdateHierarchyNodeCommand';

// ─── Levels ───────────────────────────────────────────────────────────────
export * from './levels/AddLevelCommand';
export * from './levels/CreateMultipleLevelsCommand';
export * from './levels/CreatePlanViewCommand';
export * from './levels/DeleteLevelCommand';
export * from './levels/DuplicateFloorPlanCommand';
export * from './levels/UpdateLevelCommand';

// ─── Lighting ─────────────────────────────────────────────────────────────
export * from './lighting/CreateLightingCommand';
export * from './lighting/CreateLightingByRoomCommand';
export * from './lighting/DeleteLightingCommand';
export * from './lighting/MoveLightingCommand';
export * from './lighting/UpdateLightingParametersCommand';

// ─── Operations ───────────────────────────────────────────────────────────
export * from './operations/CopyElementCommand';
export * from './operations/CutWallCommand';
export * from './operations/JoinWallsCommand';
export * from './operations/MirrorElementCommand';
export * from './operations/OffsetElementCommand';
export * from './operations/ScaleElementCommand';
export * from './operations/UnderlayCommands';

// ─── Plans ────────────────────────────────────────────────────────────────
export * from './plans/BeamCommandPlan';
export * from './plans/CommandPlan';
export * from './plans/PlanOrdering';
export * from './plans/PlanValidator';
export * from './plans/StairCommandPlan';
export * from './plans/StairShapeAdvisor';

// ─── Plumbing ─────────────────────────────────────────────────────────────
export * from './plumbing/CreatePlumbingFixtureCommand';
export * from './plumbing/UpdatePlumbingParametersCommand';

// ─── Project ──────────────────────────────────────────────────────────────
export * from './project/ClearProjectCommand';
export * from './project/ImportProjectCommand';

// ─── Requirements ─────────────────────────────────────────────────────────
export * from './requirements/DeleteRequirementCommand';
export * from './requirements/SetRoomRequirementCommand';
export * from './requirements/UpdateRequirementCommand';

// ─── Room bounding lines ───────────────────────────────────────────────────
export * from './roomBoundingLines/CreateRoomBoundingLineCommand';
export * from './roomBoundingLines/DeleteRoomBoundingLineCommand';
export * from './roomBoundingLines/UpdateRoomBoundingLineCommand';

// ─── Rooms ────────────────────────────────────────────────────────────────
export * from './rooms/BatchCreateRoomsCommand';
export * from './rooms/CreateRoomCommand';
export * from './rooms/DeleteRoomCommand';
export * from './rooms/DetectAllRoomsCommand';
export * from './rooms/DetectRoomFromWallsCommand';
export * from './rooms/GenerativeDesignApplyCommand';
export * from './rooms/ReDetectRoomsCommand';
export * from './rooms/RenameRoomCommand';
export * from './rooms/RoomNumbering';
export * from './rooms/SetRoomOccupancyCommand';
export * from './rooms/UpdateRoomBoundaryCommand';
export * from './rooms/UpdateRoomCommand';
export * from './rooms/UpdateRoomFinishesCommand';

// ─── Roofs ────────────────────────────────────────────────────────────────
export * from './roofs/CreateRoofCommand';
export * from './roofs/DeleteRoofCommand';
export * from './roofs/UpdateRoofCommand';

// ─── Slabs ────────────────────────────────────────────────────────────────
export * from './slabs/CreateAllSlabsFromLevelToAllFloorsCommand';
export * from './slabs/CreateAllSlabsFromLevelToTopLevelCommand';
export * from './slabs/CreateOpeningCommand';
export * from './slabs/CreateSlabCommand';
export * from './slabs/CreateSlabOnLevelSimilarToSelectedCommand';
export * from './slabs/CreateSlabsOnAllFloorsCommand';
export * from './slabs/DegradeSlabSketchCommand';
export * from './slabs/DeleteOpeningCommand';
export * from './slabs/DeleteSlabCommand';
export * from './slabs/RemoveSlabsOnLevelCommand';
export * from './slabs/UpdateAllSlabsCommand';
export * from './slabs/UpdateOpeningCommand';
export * from './slabs/UpdateSlabCommand';
export * from './slabs/UpdateSlabDimensionsCommand';
export * from './slabs/UpdateSlabLayersCommand';
export * from './slabs/UpdateSlabLevelCommand';
export * from './slabs/UpdateSlabPolygonCommand';
export * from './slabs/UpdateSlabSketchCommand';

// ─── Stairs ───────────────────────────────────────────────────────────────
export * from './stair/ChangeStairShapeCommand';
export * from './stair/CreateStairCommand';
export * from './stair/CreateStairRailingCommand';
export * from './stair/DeleteStairCommand';
export * from './stair/GenerateStairGeometryCommand';
export * from './stair/UpdateStairFlightsCommand';
export * from './stair/UpdateStairParametersCommand';
export * from './stair/ValidateStairCommand';

// ─── Templates ────────────────────────────────────────────────────────────
export * from './templates/AssignTemplateToNodeCommand';
export * from './templates/ClearPropertyDerivedCommand';
export * from './templates/CreateTemplateCommand';
export * from './templates/DeleteTemplateCommand';
export * from './templates/DuplicateTemplateCommand';
export * from './templates/MarkPropertyDerivedCommand';
export * from './templates/SetDerivationCommand';
export * from './templates/UnassignTemplateCommand';
export * from './templates/UpdateTemplateCommand';

// ─── VG (Visibility / Graphics) ───────────────────────────────────────────
export * from './vg/ApplyVGTemplateToModelCommand';
export * from './vg/ApplyVGTemplateToViewCommand';
export * from './vg/AssignViewIntentCommand';
export * from './vg/BulkApplyAppearanceCommand';
export * from './vg/CaptureViewVGAsTemplateCommand';
export * from './vg/ClearAllOverridesCommand';
export * from './vg/ClearOverrideCommand';
export * from './vg/CreateIntentFromViewCommand';
export * from './vg/CreateVGTemplateCommand';
export * from './vg/CreateVisibilityIntentCommand';
export * from './vg/CreateVisibilityRuleCommand';
export * from './vg/DeleteVisibilityIntentCommand';
export * from './vg/DeleteVisibilityRuleCommand';
export * from './vg/GhostElementInViewCommand';
export * from './vg/HideElementInViewCommand';
export * from './vg/IsolateElementInViewCommand';
export * from './vg/OverrideCommandUtils';
export * from './vg/PinViewIntentVersionCommand';
export * from './vg/SetGraphicOverrideCommand';
export * from './vg/SetInstanceVGOverrideCommand';
export * from './vg/SetVGCategoryStyleCommand';
export * from './vg/SetVGViewCategoryStyleCommand';
export * from './vg/TakeLatestIntentVersionCommand';
export * from './vg/ToggleVisibilityRuleCommand';
export * from './vg/types';
export * from './vg/UnbindViewIntentCommand';
export * from './vg/UpdateVGTemplateCategoryStyleCommand';
export * from './vg/UpdateVisibilityIntentCommand';
export * from './vg/UpdateVisibilityRuleCommand';

// ─── Views ────────────────────────────────────────────────────────────────
export * from './views/AddDataPanelToSheetCommand';
export * from './views/AddRevisionToSheetCommand';
export * from './views/AddViewportToSheetCommand';
export * from './views/ApplySheetLayoutPresetCommand';
export * from './views/AssignViewTemplateToViewCommand';
export * from './views/CreateDetailViewCommand';
export * from './views/CreatePhaseFilterCommand';
export * from './views/CreateScheduleCommand';
export * from './views/CreateSheetCommand';
export * from './views/CreateViewDefinitionCommand';
export * from './views/CreateViewTemplateCommand';
export * from './views/DeleteScheduleCommand';
export * from './views/DeleteSheetCommand';
export * from './views/DeleteViewDefinitionCommand';
export * from './views/DeleteViewTemplateCommand';
export * from './views/ExportSheetCommand';
export * from './views/MoveViewportCommand';
export * from './views/OverrideViewTemplatePropertyCommand';
export * from './views/RemoveDataPanelFromSheetCommand';
export * from './views/RemoveViewportFromSheetCommand';
export * from './views/ResetViewTemplatePropertyCommand';
export * from './views/SetSheetCompositionIntentCommand';
export * from './views/SetSheetLayoutRuleCommand';
export * from './views/SetViewCropCommand';
export * from './views/SetViewDesignOptionCommand';
export * from './views/SetViewLightingCommand';
export * from './views/SetViewOutputCommand';
export * from './views/SetViewProjectionCommand';
export * from './views/SetViewRangeCommand';
export * from './views/SetViewSemanticsCommand';
export * from './views/SetViewTemplateCommand';
export * from './views/SetViewTemplateLockCommand';
export * from './views/SetViewUnderlayCommand';
export * from './views/UpdateDataPanelCommand';
export * from './views/UpdateScheduleCommand';
export * from './views/UpdateSheetCommand';
export * from './views/UpdateViewDefinitionCommand';
export * from './views/UpdateViewportScaleCommand';
export * from './views/UpdateViewTemplateCommand';

// ─── Walls ────────────────────────────────────────────────────────────────
// Note: walls/GenericCommands.ts is a barrel re-exporting from individual files;
// skip it here and export directly from the source files to avoid duplicates.
export * from './walls/CascadeWallBaselineCommand';
export * from './walls/ChangeWallLevelCommand';
export * from './walls/CreateWallBetweenMarksCommand';
export * from './walls/CreateWallCommand';
export * from './walls/CreateWallOpeningCommand';
export * from './walls/CreateWindowsOnWallsCommand';
export * from './walls/CreateWallsFromSlabCommand';
export * from './walls/CreateWallsOnAllSlabsCommand';
export * from './walls/DeleteElementCommand';
export * from './walls/SetAllWallsVisualPropertiesCommand';
export * from './walls/SetAllWallsWidthCommand';
export * from './walls/SetWallWidthCommand';
export * from './walls/UpdateWallBaselineCommand';
export * from './walls/UpdateWallColorCommand';
export * from './walls/UpdateWallDimensionsCommand';
export * from './walls/UpdateWallHeightCommand';
export * from './walls/UpdateWallLayersCommand';
export * from './walls/UpdateWallSystemTypeCommand';
export * from './walls/wallSnapshotUtils';

// ─── Windows ──────────────────────────────────────────────────────────────
export * from './windows/CenterWindowInWallCommand';
export * from './windows/CreateWindowInAllWindowsCommand';
export * from './windows/MoveWindowCommand';
export * from './windows/SetWindowOffsetCommand';
export * from './windows/UpdateWindowFireRatingCommand';
export * from './windows/UpdateWindowFrameColorCommand';
export * from './windows/UpdateWindowHeightCommand';
export * from './windows/UpdateWindowParameterCommand';
export * from './windows/UpdateWindowSillHeightCommand';
export * from './windows/UpdateWindowWidthCommand';

// ── Sprint AP (2026-05-13) — UndoManager extracted from src/engine/ ──────────
export { UndoManager, AddObjectCommand, undoManager } from './UndoManager.js';
