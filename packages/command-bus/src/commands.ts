/**
 * @pryzm/command-bus — CommandRegistry
 *
 * The typed contract for every command dispatched through `runtime.bus.executeCommand`.
 * This registry grows one wave-6-c-dN batch at a time.  Phase F plugin developers
 * will eventually consume `@pryzm/sdk` which re-exports a curated subset of this
 * registry (L6 facade per `02-ARCHITECTURE.md §7`).
 *
 * Naming convention: `<verb>-<noun>` in kebab-case (per `01-VISION.md §8`).
 *
 * Payload typing strategy (Wave 6):
 *   • Commands that currently dispatch `{}` are typed `EmptyPayload` — a clean
 *     empty record.  Wave 7 handlers will narrow these as the implementations land.
 *   • Commands that carry real data are typed with their real shape.
 *
 * Wave progress:
 *   wave-6-c-d1 : MainToolbar (12) + DrawingToolbar (18) = 30 entries   ✅
 *   wave-6-c-d2 : EditToolbar (14) + ViewToolbar (9) + LayerToolbar (7) = 30 entries  ✅
 *   wave-6-c-d3 : DimensionToolbar (11) + TextToolbar (8) + AnnotationToolbar (10) = 29 entries  ✅
 *   wave-6-c-d4..d10 : pending (Room, Area, Color, Schedule, Sheet, Section, Plan,
 *                       Elevation, Family, Component, IFC, Sheets, Print, Plugin,
 *                       Settings toolbars — ~191 entries to land across d4–d10)
 *
 * Anchor: `docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3`
 */

/** Convenience alias — a command that takes no meaningful payload. */
export type EmptyPayload = Record<string, never>;

// ---------------------------------------------------------------------------
// wave-6-c-d1: MainToolbar (12 buttons)
// ---------------------------------------------------------------------------

export type MainToolbarCommands = {
    'open-project':          EmptyPayload;
    'save-project':          EmptyPayload;
    'undo':                  EmptyPayload;
    'redo':                  EmptyPayload;
    'cut-selection':         EmptyPayload;
    'copy-selection':        EmptyPayload;
    'paste-clipboard':       EmptyPayload;
    'delete-selection':      EmptyPayload;
    'toggle-layer-panel':    EmptyPayload;
    'toggle-property-panel': EmptyPayload;
    'zoom-fit':              EmptyPayload;
    'zoom-selected':         EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d1: DrawingToolbar (18 buttons)
// ---------------------------------------------------------------------------

export type DrawingToolbarCommands = {
    'draw-wall':          { levelId?: string };
    'draw-slab':          { levelId?: string };
    'draw-roof':          { levelId?: string };
    'draw-door':          { hostWallId?: string };
    'draw-window':        { hostWallId?: string };
    'draw-curtain-wall':  { levelId?: string };
    'draw-stair':         { levelId?: string };
    'draw-ramp':          { levelId?: string };
    'place-furniture':    { familyId?: string };
    'add-annotation':     EmptyPayload;
    'draw-room':          { levelId?: string };
    'draw-area':          { areaSchemeId?: string };
    'add-column':         { levelId?: string };
    'add-beam':           { levelId?: string };
    'place-grid':         EmptyPayload;
    'place-level':        { elevation?: number };
    'place-camera':       EmptyPayload;
    'add-elevation-mark': EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d2: EditToolbar (14 buttons)
// ---------------------------------------------------------------------------

export type EditToolbarCommands = {
    'move-selection':   { deltaX?: number; deltaY?: number; deltaZ?: number };
    'rotate-selection': { angleDegrees?: number; pivot?: { x: number; y: number; z: number } };
    'mirror-selection': { axisPlane?: 'XY' | 'XZ' | 'YZ' };
    'scale-selection':  { factor?: number };
    'align-left':       EmptyPayload;
    'align-right':      EmptyPayload;
    'align-top':        EmptyPayload;
    'align-bottom':     EmptyPayload;
    'pin-element':      { elementId?: string };
    'unpin-element':    { elementId?: string };
    'group-elements':   { groupName?: string };
    'ungroup-elements': EmptyPayload;
    'lock-element':     { elementId?: string };
    'unlock-element':   { elementId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d2: ViewToolbar (9 buttons)
// ---------------------------------------------------------------------------

export type ViewToolbarCommands = {
    'view-3d':                 EmptyPayload;
    'view-plan':               { levelId?: string };
    'view-elevation':          EmptyPayload;
    'view-section':            EmptyPayload;
    'view-walkthrough':        EmptyPayload;
    'toggle-shadows':          { enabled?: boolean };
    'toggle-ambient-occlusion': { enabled?: boolean };
    'screenshot-view':         { filename?: string };
    'print-view':              EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d2: LayerToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type LayerToolbarCommands = {
    'new-layer':     { name?: string };
    'delete-layer':  { layerId?: string };
    'rename-layer':  { layerId?: string; newName?: string };
    'move-to-layer': { layerId?: string };
    'lock-layer':    { layerId?: string };
    'unlock-layer':  { layerId?: string };
    'isolate-layer': { layerId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d3: DimensionToolbar (11 buttons)
// ---------------------------------------------------------------------------

export type DimensionToolbarCommands = {
    'dimension-aligned':      EmptyPayload;
    'dimension-linear':       EmptyPayload;
    'dimension-angular':      EmptyPayload;
    'dimension-radial':       { elementId?: string };
    'dimension-diameter':     { elementId?: string };
    'dimension-arc-length':   { elementId?: string };
    'dimension-lock':         { dimensionId?: string };
    'dimension-override':     { dimensionId?: string; overrideValue?: string };
    'dimension-reset':        { dimensionId?: string };
    'dimension-witness-show': { dimensionId?: string };
    'dimension-witness-gap':  { dimensionId?: string; gap?: number };
};

// ---------------------------------------------------------------------------
// wave-6-c-d3: TextToolbar (8 buttons)
// ---------------------------------------------------------------------------

export type TextToolbarCommands = {
    'text-place':         { levelId?: string };
    'text-place-model':   { levelId?: string };
    'text-bold':          { textId?: string };
    'text-italic':        { textId?: string };
    'text-underline':     { textId?: string };
    'text-style':         { styleId?: string };
    'text-find-replace':  { findStr?: string; replaceStr?: string };
    'text-spellcheck':    EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d3: AnnotationToolbar (10 buttons)
// ---------------------------------------------------------------------------

export type AnnotationToolbarCommands = {
    'tag-all-elements':     { viewId?: string };
    'tag-by-category':      { categoryId?: string };
    'tag-keynote':          { elementId?: string };
    'tag-leader':           { elementId?: string };
    'tag-multi-leader':     { elementIds?: string[] };
    'spot-elevation':       { levelId?: string };
    'spot-coordinate':      EmptyPayload;
    'filled-region-place':  { regionTypeId?: string };
    'revision-cloud-place': { revisionId?: string };
    'annotation-symbol':    { familyId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d4: RoomToolbar (6 buttons)
// ---------------------------------------------------------------------------

export type RoomToolbarCommands = {
    'room-place':              { levelId?: string };
    'room-tag':                { roomId?: string };
    'room-from-enclosed-area': EmptyPayload;
    'room-separator':          EmptyPayload;
    'room-area-boundary':      { levelId?: string };
    'room-properties':         { roomId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d4: AreaToolbar (5 buttons)
// ---------------------------------------------------------------------------

export type AreaToolbarCommands = {
    'area-place':      { areaSchemeId?: string };
    'area-tag':        { areaId?: string };
    'area-boundary':   EmptyPayload;
    'area-scheme':     { schemeId?: string };
    'area-color-fill': { schemeId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d4: ColorToolbar (6 buttons)
// ---------------------------------------------------------------------------

export type ColorToolbarCommands = {
    'color-fill-by-category':  EmptyPayload;
    'color-fill-by-parameter': { parameterId?: string };
    'color-fill-scheme':       { schemeId?: string };
    'color-override-element':  { elementId?: string; color?: string };
    'color-reset-element':     { elementId?: string };
    'color-fill-legend':       EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d5: ScheduleToolbar (8 buttons)
// ---------------------------------------------------------------------------

export type ScheduleToolbarCommands = {
    'schedule-new':           EmptyPayload;
    'schedule-from-template': { templateId?: string };
    'schedule-field-add':     { fieldName?: string };
    'schedule-filter-add':    { filterField?: string; operator?: string; filterValue?: string };
    'schedule-sort-add':      { sortField?: string; sortOrder?: 'ascending' | 'descending' };
    'schedule-export-csv':    { filename?: string };
    'schedule-export-ifc':    { filename?: string };
    'schedule-edit-cells':    { scheduleId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d5: SheetToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type SheetToolbarCommands = {
    'sheet-new':           { title?: string };
    'sheet-from-template': { templateId?: string };
    'sheet-view-add':      { viewId?: string };
    'sheet-title-block':   { familyId?: string };
    'sheet-revision-add':  { description?: string; date?: string };
    'sheet-print':         { sheetId?: string; copies?: number };
    'sheet-export-pdf':    { filename?: string; quality?: 'draft' | 'standard' | 'high' };
};

// ---------------------------------------------------------------------------
// wave-6-c-d6: SectionToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type SectionToolbarCommands = {
    'section-new':        EmptyPayload;
    'section-callout':    { parentViewId?: string };
    'section-flip':       { sectionId?: string };
    'section-crop':       { sectionId?: string; enabled?: boolean };
    'section-reference':  { sectionId?: string; referenceViewId?: string };
    'section-open-view':  { sectionId?: string };
    'section-properties': { sectionId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d6: PlanToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type PlanToolbarCommands = {
    'plan-floor':      { levelId?: string };
    'plan-structural': { levelId?: string };
    'plan-area':       { areaSchemeId?: string; levelId?: string };
    'plan-callout':    { parentViewId?: string };
    'plan-crop':       { viewId?: string; enabled?: boolean };
    'plan-underlay':   { viewId?: string; underlayViewId?: string };
    'plan-scope-box':  { viewId?: string; scopeBoxId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d6: ElevationToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type ElevationToolbarCommands = {
    'elevation-interior':   { wallId?: string };
    'elevation-exterior':   EmptyPayload;
    'elevation-framing':    { levelId?: string };
    'elevation-callout':    { parentViewId?: string };
    'elevation-flip':       { elevationId?: string };
    'elevation-open-view':  { elevationId?: string };
    'elevation-properties': { elevationId?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d7: FamilyToolbar (8 buttons)
// ---------------------------------------------------------------------------

export type FamilyToolbarCommands = {
    'browse-family-types':    EmptyPayload;
    'load-family':            { filePath?: string };
    'edit-family':            { familyId?: string };
    'create-family':          { categoryId?: string };
    'reload-family':          { familyId?: string };
    'place-family-instance':  { familyId?: string; levelId?: string };
    'edit-family-type':       { familyId?: string; typeId?: string };
    'export-family':          { familyId?: string; format?: 'pryzm-family' | 'ifc' };
};

// ---------------------------------------------------------------------------
// wave-6-c-d8: IfcInspectorToolbar (8 buttons) + IfcFilterToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type IfcInspectorToolbarCommands = {
    'ifc-open-file':           { filePath?: string };
    'ifc-inspect-element':     { elementId?: string };
    'ifc-export-subset':       { format?: 'ifc' | 'json' };
    'ifc-validate':            EmptyPayload;
    'ifc-show-properties':     { elementId?: string };
    'ifc-toggle-spatial-tree': EmptyPayload;
    'ifc-copy-guid':           { guid?: string };
    'ifc-filter-by-category':  { category?: string };
};

export type IfcFilterToolbarCommands = {
    'ifc-filter-clear':       EmptyPayload;
    'ifc-filter-by-storey':   { storey?: string };
    'ifc-filter-by-type':     { ifcType?: string };
    'ifc-filter-by-property': { propName?: string; propValue?: string };
    'ifc-filter-spatial':     EmptyPayload;
    'ifc-filter-save':        { filterName?: string };
    'ifc-filter-load':        { filterName?: string };
};

// ---------------------------------------------------------------------------
// wave-6-c-d9: SheetSetsToolbar (7 buttons) + PrintSetupToolbar (7 buttons)
// ---------------------------------------------------------------------------

export type SheetSetsToolbarCommands = {
    'sheet-set-new':           { setName?: string };
    'sheet-set-open':          { setId?: string };
    'sheet-set-close':         EmptyPayload;
    'sheet-set-add-sheet':     { sheetId?: string };
    'sheet-set-remove-sheet':  { sheetId?: string };
    'sheet-set-reorder':       { orderedIds?: string[] };
    'sheet-set-export':        { format?: 'pdf' | 'dwf' | 'dwg' };
};

export type PrintSetupToolbarCommands = {
    'print-setup-paper-size':   { paperSize?: string };
    'print-setup-orientation':  { orientation?: 'portrait' | 'landscape' };
    'print-setup-scale':        { scale?: string };
    'print-setup-margin':       { preset?: 'none' | 'normal' | 'narrow' | 'wide' };
    'print-plot-preview':       EmptyPayload;
    'print-plot-execute':       { copies?: number; printer?: string };
    'print-setup-save-preset':  { presetName?: string };
};

// ---------------------------------------------------------------------------
// CommandRegistry — the full union through wave-6-c-d9 (179 entries)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// wave-6-c-d10: CoordinationToolbarCommands (12 entries)
// ---------------------------------------------------------------------------

/** Commands from CoordinationToolbar — 12 entries.  wave-6-c-d10. */
export type CoordinationToolbarCommands = {
    'coordination-review-new':      EmptyPayload;
    'coordination-review-open':     EmptyPayload;
    'coordination-issue-assign':    EmptyPayload;
    'coordination-issue-resolve':   EmptyPayload;
    'coordination-issue-comment':   EmptyPayload;
    'coordination-clash-detect':    EmptyPayload;
    'coordination-clash-group':     EmptyPayload;
    'coordination-viewpoint-create':EmptyPayload;
    'coordination-viewpoint-share': EmptyPayload;
    'coordination-report-export':   EmptyPayload;
    'coordination-filter-active':   EmptyPayload;
    'coordination-sync-cde':        EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: CDEToolbarCommands (11 entries)
// ---------------------------------------------------------------------------

/** Commands from CDEToolbar — 11 entries.  wave-6-c-d10. */
export type CDEToolbarCommands = {
    'cde-upload-doc':       EmptyPayload;
    'cde-download-doc':     EmptyPayload;
    'cde-doc-revision-new': EmptyPayload;
    'cde-doc-approve':      EmptyPayload;
    'cde-doc-reject':       EmptyPayload;
    'cde-transmittal-create': EmptyPayload;
    'cde-transmittal-send': EmptyPayload;
    'cde-rfi-new':          EmptyPayload;
    'cde-rfi-respond':      EmptyPayload;
    'cde-connect':          EmptyPayload;
    'cde-sync-now':         EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: ClashDetectionToolbarCommands (12 entries)
// ---------------------------------------------------------------------------

/** Commands from ClashDetectionToolbar — 12 entries.  wave-6-c-d10. */
export type ClashDetectionToolbarCommands = {
    'clash-run':              EmptyPayload;
    'clash-run-all':          EmptyPayload;
    'clash-select':           EmptyPayload;
    'clash-resolve':          EmptyPayload;
    'clash-group':            EmptyPayload;
    'clash-assign':           EmptyPayload;
    'clash-filter-new':       EmptyPayload;
    'clash-filter-hard':      EmptyPayload;
    'clash-filter-soft':      EmptyPayload;
    'clash-filter-clearance': EmptyPayload;
    'clash-report-export':    EmptyPayload;
    'clash-settings':         EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: BCFToolbarCommands (11 entries)
// ---------------------------------------------------------------------------

/** Commands from BCFToolbar — 11 entries.  wave-6-c-d10. */
export type BCFToolbarCommands = {
    'bcf-issue-new':      EmptyPayload;
    'bcf-issue-open':     EmptyPayload;
    'bcf-issue-assign':   EmptyPayload;
    'bcf-issue-resolve':  EmptyPayload;
    'bcf-issue-close':    EmptyPayload;
    'bcf-viewpoint-add':  EmptyPayload;
    'bcf-comment-add':    EmptyPayload;
    'bcf-export':         EmptyPayload;
    'bcf-import':         EmptyPayload;
    'bcf-filter':         EmptyPayload;
    'bcf-server-connect': EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: AnalysisToolbarCommands (11 entries)
// ---------------------------------------------------------------------------

/** Commands from AnalysisToolbar — 11 entries.  wave-6-c-d10. */
export type AnalysisToolbarCommands = {
    'analysis-energy-run':      EmptyPayload;
    'analysis-solar-run':       EmptyPayload;
    'analysis-daylighting-run': EmptyPayload;
    'analysis-structural-run':  EmptyPayload;
    'analysis-cfd-run':         EmptyPayload;
    'analysis-gbxml-export':    EmptyPayload;
    'analysis-ifc4-export':     EmptyPayload;
    'analysis-results-view':    EmptyPayload;
    'analysis-results-compare': EmptyPayload;
    'analysis-report-export':   EmptyPayload;
    'analysis-settings':        EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: QuantityToolbarCommands (10 entries)
// ---------------------------------------------------------------------------

/** Commands from QuantityToolbar — 10 entries.  wave-6-c-d10. */
export type QuantityToolbarCommands = {
    'quantity-material-takeoff':  EmptyPayload;
    'quantity-room-takeoff':      EmptyPayload;
    'quantity-schedule-create':   EmptyPayload;
    'quantity-filter':            EmptyPayload;
    'quantity-group':             EmptyPayload;
    'quantity-export-csv':        EmptyPayload;
    'quantity-export-xlsx':       EmptyPayload;
    'quantity-nrm-map':           EmptyPayload;
    'quantity-rics-map':          EmptyPayload;
    'quantity-settings':          EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: ModelManagementToolbarCommands (10 entries)
// ---------------------------------------------------------------------------

/** Commands from ModelManagementToolbar — 10 entries.  wave-6-c-d10. */
export type ModelManagementToolbarCommands = {
    'model-link-add':       EmptyPayload;
    'model-link-manage':    EmptyPayload;
    'model-link-reload':    EmptyPayload;
    'model-workset-new':    EmptyPayload;
    'model-workset-edit':   EmptyPayload;
    'model-workset-open':   EmptyPayload;
    'model-sync-central':   EmptyPayload;
    'model-detach-central': EmptyPayload;
    'model-audit':          EmptyPayload;
    'model-upgrade':        EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: PluginManagerToolbarCommands (12 entries)
// ---------------------------------------------------------------------------

/** Commands from PluginManagerToolbar — 12 entries.  wave-6-c-d10. */
export type PluginManagerToolbarCommands = {
    'plugin-install':           EmptyPayload;
    'plugin-uninstall':         EmptyPayload;
    'plugin-enable':            EmptyPayload;
    'plugin-disable':           EmptyPayload;
    'plugin-update':            EmptyPayload;
    'plugin-reload':            EmptyPayload;
    'plugin-browse-marketplace':EmptyPayload;
    'plugin-settings-open':     EmptyPayload;
    'plugin-devtools-open':     EmptyPayload;
    'plugin-api-explorer':      EmptyPayload;
    'plugin-sandbox-start':     EmptyPayload;
    'plugin-logs-show':         EmptyPayload;
};

// ---------------------------------------------------------------------------
// wave-6-c-d10: SettingsToolbarCommands (12 entries)
// ---------------------------------------------------------------------------

/** Commands from SettingsToolbar — 12 entries.  wave-6-c-d10. */
export type SettingsToolbarCommands = {
    'settings-open':               EmptyPayload;
    'settings-units':              EmptyPayload;
    'settings-snapping':           EmptyPayload;
    'settings-display':            EmptyPayload;
    'settings-shortcuts':          EmptyPayload;
    'settings-project-info':       EmptyPayload;
    'settings-shared-params':      EmptyPayload;
    'settings-transfer-standards': EmptyPayload;
    'settings-purge-unused':       EmptyPayload;
    'settings-warnings':           EmptyPayload;
    'settings-about':              EmptyPayload;
    'settings-license':            EmptyPayload;
};

// ---------------------------------------------------------------------------
// Phase E.5.x — Element command-bus entries (command-bus migration)
// ---------------------------------------------------------------------------
//
// These types extend the CommandRegistry with the runtime.bus.executeCommand
// paths being migrated from the legacy commandManager.execute() API.
//
// Anchor: docs/archive/pryzm3-internal/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5

/** Wall baseline — plan-space centre-line point pair. */
export type WallBaseLine = {
    readonly start: { readonly x: number; readonly z: number };
    readonly end:   { readonly x: number; readonly z: number };
};

/** Curved-wall arc descriptor — quadratic Bézier control point. */
export type WallCurveDescriptor = {
    readonly control: { readonly x: number; readonly y: number; readonly z: number };
    readonly segments?: number;
};

/**
 * Payload for `wall.create` — mirrors `CreateWallPayload` in `@pryzm/plugin-wall`.
 * All fields are optional; omitted values use the schema defaults in CreateWallHandler.
 */
export type WallCreatePayload = {
    readonly id?: string;
    readonly levelId?: string;
    readonly start?: { readonly x: number; readonly z: number };
    readonly end?: { readonly x: number; readonly z: number };
    readonly baseLine?: WallBaseLine;
    readonly height?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly materialColor?: string;
    readonly materialId?: string;
    readonly systemTypeId?: string;
    readonly curve?: WallCurveDescriptor;
};

/**
 * Phase E.5.x element command-bus entries.
 *
 * Extends CommandRegistry with the `runtime.bus.executeCommand` paths that are
 * migrated from the legacy `commandManager.execute()` mutation API.
 *
 * Priority order per migration plan §E.5:
 *   P0  — wall.create, wall.createFromSlab, wall.batch.create,
 *          curtain-wall.batch.create, rooms.redetect  (this file)
 *   P1  — BatchCoordinator._executeFinalSweep() uses rooms.redetect
 *   P2  — WallTool uses wall.create + wall.createFromSlab
 */
// ---------------------------------------------------------------------------
// Phase E.5.x — Mutation command types (P3–P11 sprint migration)
// ---------------------------------------------------------------------------

/** View mutation payloads — P3 */
export type ViewMutationCommands = {
    'view.setOutput':          { viewId: string; output: Record<string, unknown> | null };
    'view.setRange':           { viewId: string; viewRange: Record<string, unknown> | null };
    'view.setCrop':            { viewId: string; crop: Record<string, unknown> | null };
    'view.setUnderlay':        { viewId: string; underlay: Record<string, unknown> | null };
    'view.updateDefinition':   { viewId: string; patch: Record<string, unknown> };
    'view.setDesignOption':    { viewId: string; designOptionId: string | null };
    'view.setLighting':        { viewId: string; lighting: Record<string, unknown> };
    'view.setSemantics':       { viewId: string; semantics: Record<string, unknown> };
    'view.setProjection':      { viewDefinitionId: string; projection: { type: string; camera: { position: [number,number,number]; target: [number,number,number]; up: [number,number,number]; fov?: number; zoom?: number } } };
};

/** Element property mutation payloads — P4/P7 */
export type ElementMutationCommands = {
    'element.updateMark':        { elementId: string; elementType?: string; newMark: string };
    'element.delete':            { elementId: string; elementType?: string };
    'element.hideInView':        { viewId: string; elementId: string };
    'element.isolateInView':     { viewId: string; elementId: string };
    'element.setGraphicOverride':{ viewId: string; scope: string; elementId: string; category: string; overrides: Record<string, unknown> };
    'element.setDoorOffset':     { elementId: string; offset: number; prevOffset?: number };
    'element.setWindowOffset':   { elementId: string; offset: number; prevOffset?: number };
    'element.update':            { elementId: string; elementType?: string; updates: Record<string, unknown> };
    /**
     * §R4-FIX — Generic parametric update fired by PropertyPanel.onApply().
     * Fans out to UpdateElementParameterCommand which routes per-elementType.
     * Payload mirrors UpdateElementParameterInput exactly.
     */
    'element.updateParameters':  { elementId: string; elementType: string; parameters: Record<string, unknown> };
};

/** Window/door update payloads — P4 (F-1.1: migrated to handler-aligned types) */
export type OpeningMutationCommands = {
    /** @deprecated P4 legacy telemetry type — use window.setSize instead */
    'window.updateWidth':         { elementId: string; width: number };
    /** @deprecated P4 legacy telemetry type — use window.setSize instead */
    'window.updateHeight':        { elementId: string; height: number };
    /** @deprecated P4 legacy telemetry type — use window.setSillHeight instead */
    'window.updateSillHeight':    { elementId: string; sillHeight: number };
    /** @deprecated P4 legacy telemetry type — use window.setFireRating instead */
    'window.updateFireRating':    { elementId: string; fireRating: string };
    /** @deprecated P4 legacy telemetry type — use door.setWidth instead */
    'door.updateWidth':           { elementId: string; width: number };
    /** @deprecated P4 legacy telemetry type — use door.setHeight instead */
    'door.updateHeight':          { elementId: string; height: number };
    /** @deprecated P4 legacy telemetry type — use door.setFireRating instead */
    'door.updateFireRating':      { elementId: string; fireRating: string };
    /** @deprecated P4 legacy telemetry type — use door.setAccessibility instead */
    'door.updateAccessibilityType': { elementId: string; accessibilityType: string };
    /** F-1.1: handler-aligned type — SetWindowSizeHandler */
    'window.setSize':             { windowId: string; width?: number; height?: number };
    /** F-1.1: handler-aligned type — SetWindowSillHeightHandler */
    'window.setSillHeight':       { windowId: string; sillHeight: number };
    /** F-1.1: handler-aligned type — SetWindowFireRatingHandler */
    'window.setFireRating':       { windowId: string; fireRating: string };
    /** F-1.1: handler-aligned type — SetDoorWidthHandler */
    'door.setWidth':              { doorId: string; width: number };
    /** F-1.1: handler-aligned type — SetDoorHeightHandler */
    'door.setHeight':             { doorId: string; height: number };
    /** F-1.1: handler-aligned type — SetDoorFireRatingHandler */
    'door.setFireRating':         { doorId: string; fireRating: string };
    /** F-1.1: handler-aligned type — SetDoorAccessibilityHandler */
    'door.setAccessibility':      { doorId: string; accessibilityType: string };
    /** TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): SetDoorSwingHandler.
     *  Inline literal union mirrors DoorSwing from plugin-sdk — no cross-package
     *  import needed here; the handler validates the value at runtime. */
    'door.setSwing':              { doorId: string; swing: 'left-in' | 'left-out' | 'right-in' | 'right-out' | 'sliding' };
};

/** Slab mutation payloads — P6 */
export type SlabMutationCommands = {
    'slab.update':        { id: string; [k: string]: unknown };
    'slab.updatePolygon': { slabId: string; polygon: Array<{ x: number; y: number }>; clearSketch?: boolean };
    'slab.updateLayers':  { slabId: string; systemTypeId?: string; layers?: unknown[]; thickness?: number };
};

/** Ceiling mutation payloads — TASK-12 */
export type CeilingMutationCommands = {
    'ceiling.updateLayers': { ceilingId: string; systemTypeId?: string; layers?: unknown[]; thickness?: number };
};

/** Floor mutation payloads — TASK-12 */
export type FloorMutationCommands = {
    'floor.updateLayers': { floorId: string; systemTypeId?: string; layers?: unknown[]; thickness?: number };
};

/** Furniture/plumbing creation payloads — P7 */
export type FurnitureMutationCommands = {
    'furniture.create':           { furnitureType: string; position: { x: number; y: number; z: number }; levelId?: string; [k: string]: unknown };
    'furniture.updateParameters': { id: string; [k: string]: unknown };
    'plumbing.create':            { fixtureType: string; position: { x: number; y: number; z: number }; levelId?: string; [k: string]: unknown };
    'plumbing.createFixture':     { fixtureType: string; position: { x: number; y: number; z: number }; levelId?: string; toiletVariant?: string; showerVariant?: string; accessoryVariant?: string; baseOffset?: number; width?: number; length?: number; height?: number; rotation?: { x: number; y: number; z: number } };
};

/** Room mutation payloads — P4/P8/P12 */
export type RoomMutationCommands = {
    'room.create':          { levelId?: string; [k: string]: unknown };
    'room.rename':          { roomId: string; name?: string; roomNumber?: string };
    'room.update':          { roomId: string; updates: Record<string, unknown> };
    'room.setName':         { roomId: string; name: string };
    'room.setNumber':       { roomId: string; number?: string };
    'room.setOccupancy':    { roomId: string; occupancy?: string };
    'room.setMaterial':     { roomId: string; materialId?: string; materialColor?: string };
    'room.setHeightOffset': { roomId: string; heightOffset: number };
    'room.updateFinishes':  { roomId: string; finishes: Record<string, unknown> };
};

/** D-α-2 (BIM 2/3 §6 Workstream D) — apartment-parameter mutation payloads.
 *
 * The L0 substrate edit verbs. Each carries a `patch` of the fields to
 * change; absent fields keep their current values. The handler:
 *   1. Reads the current record from the apartment / room parameter store
 *   2. Merges patch ↔ current
 *   3. Re-validates via the schema (envelope bounds, foreign-key shape)
 *   4. Persists the new record + emits a store change notification
 *
 * Per BIM 2/3 §4: every parameter edit MUST go through the bus. The
 * Data Management Panel dispatches these, never mutates the store
 * directly. The propagation engine (D-α-3) subscribes to the store
 * notification and re-derives the local region of geometry.
 */
export type ApartmentParameterMutationCommands = {
    /** Patch any subset of an apartment's editable parameters. The patch
     *  must NOT include `id` (that's the lookup key); patches that would
     *  violate the schema (envelope bounds, room count limits) are
     *  rejected with no mutation. */
    'apartment.updateParameter': {
        readonly apartmentId: string;
        readonly patch: Record<string, unknown>;
    };
    /** Patch any subset of a room's editable parameters. Same shape as
     *  apartment.updateParameter — patch fields override; absent fields
     *  keep current. Type renames + retypes ARE allowed at this layer
     *  (the propagation engine handles the cascade). */
    'room.updateParameter': {
        readonly roomId: string;
        readonly patch: Record<string, unknown>;
    };
};

/** Wall mutation payloads — P4 */
export type WallMutationCommands = {
    'wall.updateSystemType':  { wallId: string; systemTypeId?: string; layers?: unknown[]; thickness?: number };
    'wall.updateDimensions':  { wallId: string; height?: number; thickness?: number };
    'wall.updateLayers':      { wallId: string; layers: unknown[] };
    'wall.updateCurtainWall': { id: string; updates: Record<string, unknown> };
};

/** Stair/beam plan execution payloads — P10 */
export type PlanMutationCommands = {
    'stair.executeApprovedPlan': { planId: string; proposalId?: string };
    'beam.executeApprovedPlan':  { planId: string; proposalId?: string };
    'stair.create':              { [k: string]: unknown };
    /**
     * Batch-create multiple stairs atomically.
     * §A40-W05: Promoted from unknown[] stub to typed payload.
     * Handler registered in engineLauncher.ts (§A40-W04 block).
     */
    'stair.batch.create': {
        readonly stairs: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly topLevelId?: string;
            readonly startX?: number;
            readonly startZ?: number;
            readonly endX?: number;
            readonly endZ?: number;
            readonly width?: number;
            readonly riserHeight?: number;
            readonly treadDepth?: number;
            readonly rotation?: number;
            readonly materialId?: string;
            readonly systemTypeId?: string;
        }>;
    };
    'stair.createRailing':       { stairId?: string; [k: string]: unknown };
    'stair.updateParameters':    { stairId: string; updates: Record<string, unknown> };
    /**
     * §STAIR-3D-MOVE (2026-06-11) — translate a stair by a world-space delta.
     * Bridged to MoveStairCommand in initBusHandlers.ts. Dispatched by the 3D
     * transform-gizmo drag-end handler (registerTransformDragHandler.ts).
     */
    'stair.move':                { stairId: string; delta: { x: number; y?: number; z: number } };
    'roof.update':               { id: string; updates: Record<string, unknown> };
    'beam.create':               { [k: string]: unknown };
    'handrail.create':           { [k: string]: unknown };
    'detail-view.create':        { [k: string]: unknown };
};

/** Annotation creation payloads — P9 (maps to annotation plugin) */
export type AnnotationMutationCommands = {
    'annotation.createElevationMark':  { viewId?: string; hostElementId?: string; [k: string]: unknown };
    'annotation.createCalloutDetail':  { viewId?: string; [k: string]: unknown };
    'annotation.createSectionMark':    { viewId?: string; [k: string]: unknown };
};

/** Level/sheet/import misc payloads — P5/P11 */
export type MiscMutationCommands = {
    /**
     * §R7-FIX: Added `levelId`, `height`, and `_skipBridge` fields.
     *
     * `levelId` (required by AddLevelCommand) and `height` were previously absent
     * from the type registry, causing the `initBusHandlers.ts` validator to type
     * `cmd.levelId` as `never` (TypeScript) and the stair-plugin AddLevelHandler to
     * receive `levelId: undefined` — producing a broken level with `id: undefined`.
     *
     * `_skipBridge`: when set by a caller that has already invoked
     * `commandManager.execute(AddLevelCommand)` directly (the §3.4 dual-write
     * pattern), the bus handler must skip its own `commandManager.execute()` call
     * to prevent a duplicate command on the undo stack and a `canExecute` rejection
     * for the same `levelId`.
     *
     * §R7-CONTRACT: see C02 §3.4 and C03 §6 for the level.add dual-write invariant.
     */
    'level.add':                { levelId: string; name?: string; elevation?: number; height?: number; _skipBridge?: boolean };
    'template.create':          { id: string; name: string; scope: string; [k: string]: unknown };
    'template.assignToNode':    { nodeId: string; nodeType: string; templateId: string; assignedBy?: string };
    'level.createMultiple':     { count?: number; spacing?: number; startElevation?: number };
    'sheet.executeCommand':     { commandType: string; sheetId?: string; [k: string]: unknown };
    'import.executeCommand':    { commandType: string; [k: string]: unknown };
    'element.legacyBridge':     { commandType: string; source?: string };
};

export type ElementCommandBusCommands = {
    /** Create a single wall. Handled by CreateWallHandler in @pryzm/plugin-wall. */
    'wall.create': WallCreatePayload;
    /**
     * Create perimeter walls from a resolved slab polygon.
     *
     * P2d (E.5.x): payload now carries the pre-resolved `levelId` + `perimeter`
     * so `CreateWallsFromSlabHandler` can validate and mutate the wall store
     * without touching the PRYZM-1 slabStore.  Callers (WallTool) resolve
     * the polygon from `window.slabStore` before dispatch. // TODO(TASK-08)
     *
     * Mirrors `CreateWallsFromSlabPayload` in `plugins/wall/src/handlers/CreateWallsFromSlab.ts`.
     */
    'wall.createFromSlab': {
        /** Level the walls belong to — REQUIRED; handler rejects unknown IDs. */
        readonly levelId: string;
        /**
         * Closed 3-D perimeter polygon.  Each vertex is `{ x, y, z }` where
         * `y` is the level elevation and `x`/`z` are plan-view coordinates.
         * Last vertex auto-closed back to first by the handler.
         * Must have ≥ 3 vertices; edges < 0.05 m are silently skipped.
         */
        readonly perimeter: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
        readonly height?: number;
        readonly thickness?: number;
        readonly baseOffset?: number;
        readonly materialColor?: string;
        readonly materialId?: string;
        readonly systemTypeId?: string;
    };
    /** Batch-create multiple walls (e.g. all walls in a curtain-wall layout). */
    'wall.batch.create': {
        readonly walls: ReadonlyArray<WallCreatePayload>;
        readonly levelId?: string;
    };
    /**
     * Batch-delete curtain-wall entries from the plugin store.
     * Dispatched fire-and-forget from CreateCurtainWallsOnAllSlabsCommand.undo()
     * and CreateCurtainWallsFromSlabCommand.undo() to keep the plugin
     * CurtainWallsState in sync with the legacy curtainWallStore removal.
     * IDs not present in the store are silently skipped (idempotent).
     * Handler: DeleteCurtainWallBatchHandler (`curtain-wall.batch.delete`).
     */
    'curtain-wall.batch.delete': {
        readonly ids: readonly string[];
    };
    /** Batch-create curtain-wall panels from a slab footprint. */
    'curtain-wall.batch.create': {
        /**
         * Pre-resolved curtain wall specs — one entry per wall to create atomically.
         * Populated by callers that resolve slab geometry before dispatch (P2e).
         * Optional: an absent or empty array is a valid no-op dispatch.
         */
        readonly curtainWalls?: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly baseLine?: readonly [
                { readonly x: number; readonly y: number; readonly z: number },
                { readonly x: number; readonly y: number; readonly z: number },
            ];
            readonly height?: number;
            readonly mullionThickness?: number;
            readonly bayWidth?: number;
            readonly bayHeight?: number;
            readonly materialId?: string;
            readonly systemTypeId?: string;
        }>;
        readonly slabId?: string;
        readonly levelId?: string;
        readonly height?: number;
        readonly thickness?: number;
    };
    /**
     * Batch-update multiple curtain walls atomically (one undo-stack entry).
     * FT7 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): replaces N sequential
     * `wall.updateCurtainWall` dispatches with a single Immer produceCommand
     * call — single rebuild, single undo-stack entry.
     *
     * Handler: UpdateCurtainWallBatchHandler (`curtainwall.batch.update`).
     * Performance target: ≤ 1 second for updating all curtain wall panels'
     * material/colour, matching `curtain-wall.create-on-all-slabs` throughput.
     *
     * Entries whose `id` is not present in the plugin store are silently
     * skipped (idempotent — safe to dispatch from AI and from undo/redo replay).
     */
    'curtainwall.batch.update': {
        readonly updates: ReadonlyArray<{
            readonly id: string;
            readonly updates: Record<string, unknown>;
        }>;
    };
    /** Batch-create multiple slabs atomically (one undo-stack entry). Sprint A27. */
    'slab.batch.create': {
        readonly slabs: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly thickness?: number;
            readonly baseOffset?: number;
            readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
            readonly holes?: ReadonlyArray<ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>>;
            readonly materialId?: string;
            readonly materialColor?: string;
            readonly systemTypeId?: string;
        }>;
        readonly levelId?: string;
    };
    /** Batch-create multiple columns atomically (one undo-stack entry). Sprint A28. */
    'column.batch.create': {
        readonly columns: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly topLevelId?: string;
            readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
            readonly shape?: 'rectangular' | 'circular';
            readonly width?: number;
            readonly depth?: number;
            readonly height?: number;
            readonly baseOffset?: number;
            readonly rotation?: number;
            readonly materialId?: string;
            readonly systemTypeId?: string;
        }>;
        readonly levelId?: string;
    };
    /** Batch-create multiple beams atomically (one undo-stack entry). Sprint A28. */
    'beam.batch.create': {
        readonly beams: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly baseLine?: readonly [
                { readonly x: number; readonly y: number; readonly z: number },
                { readonly x: number; readonly y: number; readonly z: number },
            ];
            readonly shape?: 'rectangular' | 'I' | 'T' | 'L';
            readonly width?: number;
            readonly depth?: number;
            readonly rotation?: number;
            readonly materialId?: string;
            readonly systemTypeId?: string;
        }>;
        readonly levelId?: string;
    };
    /** Batch-create multiple doors atomically (one undo-stack entry). Sprint A28.
     *  Each entry MUST supply its own wallId + openingId (pre-reserved via wall.createOpening). */
    'door.batch.create': {
        readonly doors: ReadonlyArray<{
            readonly wallId: string;
            readonly openingId: string;
            readonly id?: string;
            readonly offset?: number;
            readonly width?: number;
            readonly height?: number;
            readonly sillHeight?: number;
            readonly doorType?: string;
            readonly systemTypeId?: string;
            readonly frameThickness?: number;
            readonly frameWidth?: number;
            readonly frameColor?: string;
            readonly leafColor?: string;
            readonly fireRating?: string;
            readonly accessibilityType?: string;
        }>;
    };
    /** Batch-create multiple windows atomically (one undo-stack entry). Sprint A28.
     *  Each entry MUST supply its own wallId + openingId (pre-reserved via wall.createOpening). */
    'window.batch.create': {
        readonly windows: ReadonlyArray<{
            readonly wallId: string;
            readonly openingId: string;
            readonly id?: string;
            readonly offset?: number;
            readonly width?: number;
            readonly height?: number;
            readonly sillHeight?: number;
            readonly windowType?: string;
            readonly systemTypeId?: string;
            readonly frameThickness?: number;
            readonly frameWidth?: number;
            readonly frameColor?: string;
            readonly fireRating?: string;
        }>;
    };
    /** Batch-create multiple ceilings atomically (one undo-stack entry). Sprint A28. */
    'ceiling.batch.create': {
        readonly ceilings: ReadonlyArray<{
            readonly id?: string;
            readonly levelId?: string;
            readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
            readonly ceilingHeight?: number;
            readonly thickness?: number;
            readonly materialId?: string;
            readonly materialColor?: string;
        }>;
        readonly levelId?: string;
    };
    /**
     * Create walls on all slab footprints in the project.
     * §A40-W03: Structural registration — enables runtime.bus.executeCommand() routing.
     * Handler registered in engineLauncher.ts (§A40-W03 block).
     * Existing call site still uses commandManager.execute() (dual-write pattern, E.5.x P2).
     * Required precondition for Immer produceWithPatches + MessagePack ULID wire encoding.
     */
    'wall.create-on-all-slabs': {
        readonly wallHeight?: number;
        readonly wallThickness?: number;
    };
    /**
     * Create slabs on all floor levels based on a reference slab footprint.
     * §A40-W03: Structural registration — enables runtime.bus.executeCommand() routing.
     * Handler registered in engineLauncher.ts (§A40-W03 block).
     * Existing call site still uses commandManager.execute() (dual-write pattern, E.5.x P2).
     * Required precondition for Immer produceWithPatches + MessagePack ULID wire encoding.
     */
    'slab.create-on-all-floors': {
        readonly referenceSlabId?: string;
        readonly thickness?: number;
        readonly baseOffset?: number;
        readonly materialId?: string;
        readonly materialColor?: string;
        readonly systemTypeId?: string;
    };
    /**
     * Create curtain walls on all slab footprints in the project.
     * §P2-A39: Structural registration — enables runtime.bus.executeCommand() routing.
     * Handler registered in engineLauncher.ts (§P2-A39 block).
     * Existing call site still uses commandManager.execute() (dual-write pattern, E.5.x P2).
     * Required precondition for Immer produceWithPatches + MessagePack ULID wire encoding.
     * Tracked: 34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §C11-4.
     */
    'curtain-wall.create-on-all-slabs': {
        readonly height?: number;
        readonly gridXSpacing?: number;
        readonly gridYSpacing?: number;
    };
    /**
     * Re-detect rooms for a given building level after wall geometry changes.
     * Handled by RedetectRoomsHandler in @pryzm/plugin-rooms.
     * Replaces the legacy ReDetectRoomsCommand fired by BatchCoordinator._executeFinalSweep().
     */
    'rooms.redetect': {
        readonly levelId: string;
        /** Floor elevation above project zero, in metres.
         *  Optional — defaults to 0 when omitted (C11 §6.3 event-driven path).
         *  Explicit callers (BatchCoordinator) SHOULD still pass it for accuracy. */
        readonly elevation?: number;
        /** Level height in metres.
         *  Optional — defaults to 3 when omitted (C11 §6.3 event-driven path).
         *  Explicit callers (BatchCoordinator) SHOULD still pass it for accuracy. */
        readonly height?: number;
    };
};

/**
 * The authoritative typed registry of every PRYZM command through wave-6-c-d10.
 * Consumers (handlers, plugin SDK) key into this map:
 *
 *   type Payload = CommandRegistry['undo'];  // → EmptyPayload
 *
 * The Phase F `@pryzm/sdk` re-exports a curated subset of this type.
 * Full registry: ≥ 280 entries (179 d1–d9 + 101 d10 = 280).
 *
 * Wave progress:
 *   wave-6-c-d1 : MainToolbar (12) + DrawingToolbar (18) = 30 entries   ✅
 *   wave-6-c-d2 : EditToolbar (14) + ViewToolbar (9) + LayerToolbar (7) = 30 entries  ✅
 *   wave-6-c-d3 : DimensionToolbar (11) + TextToolbar (8) + AnnotationToolbar (10) = 29 entries  ✅
 *   wave-6-c-d4 : RoomToolbar (6) + AreaToolbar (5) + ColorToolbar (6) = 17 entries  ✅
 *   wave-6-c-d5 : ScheduleToolbar (8) + SheetToolbar (7) = 15 entries  ✅
 *   wave-6-c-d6 : SectionToolbar (7) + PlanToolbar (7) + ElevationToolbar (7) = 21 entries  ✅
 *   wave-6-c-d7 : FamilyToolbar (8) = 8 entries  ✅
 *   wave-6-c-d8 : IfcInspectorToolbar (8) + IfcFilterToolbar (7) = 15 entries  ✅
 *   wave-6-c-d9 : SheetSetsToolbar (7) + PrintSetupToolbar (7) = 14 entries  ✅
 *   wave-6-c-d10: Coordination (12) + CDE (11) + ClashDetection (12) + BCF (11)
 *               + Analysis (11) + Quantity (10) + ModelManagement (10)
 *               + PluginManager (12) + Settings (12) = 101 entries  ✅
 */
export type CommandRegistry =
    MainToolbarCommands
    & DrawingToolbarCommands
    & EditToolbarCommands
    & ViewToolbarCommands
    & LayerToolbarCommands
    & DimensionToolbarCommands
    & TextToolbarCommands
    & AnnotationToolbarCommands
    & RoomToolbarCommands
    & AreaToolbarCommands
    & ColorToolbarCommands
    & ScheduleToolbarCommands
    & SheetToolbarCommands
    & SectionToolbarCommands
    & PlanToolbarCommands
    & ElevationToolbarCommands
    & FamilyToolbarCommands
    & IfcInspectorToolbarCommands
    & IfcFilterToolbarCommands
    & SheetSetsToolbarCommands
    & PrintSetupToolbarCommands
    & CoordinationToolbarCommands
    & CDEToolbarCommands
    & ClashDetectionToolbarCommands
    & BCFToolbarCommands
    & AnalysisToolbarCommands
    & QuantityToolbarCommands
    & ModelManagementToolbarCommands
    & PluginManagerToolbarCommands
    & SettingsToolbarCommands
    & ElementCommandBusCommands
    // Phase E.5.x mutation families (P3–P11)
    & ViewMutationCommands
    & ElementMutationCommands
    & OpeningMutationCommands
    & SlabMutationCommands
    & CeilingMutationCommands
    & FloorMutationCommands
    & FurnitureMutationCommands
    & RoomMutationCommands
    & WallMutationCommands
    // D-α-2 (BIM 2/3) — L0 parameter mutation verbs.
    & ApartmentParameterMutationCommands
    & PlanMutationCommands
    & AnnotationMutationCommands
    & MiscMutationCommands;

/** Narrowed payload accessor — derives the payload type for a given command id. */
export type PayloadOf<T extends keyof CommandRegistry> = CommandRegistry[T];
