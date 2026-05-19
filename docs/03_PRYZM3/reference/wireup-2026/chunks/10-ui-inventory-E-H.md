# §12.5–§12.8  UI inventory — Categories E (Inspector) · F (Bottom strip) · G (Canvas overlays) · H (Drawing HUDs / pickers)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1261–1319.

---

### §12.5 Category E — Right property inspector (30 files; Phase B + F)

`src/ui/PropertyInspector.ts` (orchestrator, the right-rail host), `src/ui/property-inspector/*` (4 files), `src/ui/property-panel/*` (26 files: `PropertyPanel.ts`, `PropertyRenderer.ts`, `PropertyPanelAdapter.ts`, `PropertyPanelTheme.ts`, `PropertyDescriptorGenerator.ts`, `RelationshipViewer.ts`, `PlacementEditor.ts`, `ViewPropertiesSection.ts`, `types.ts`, plus per-family widgets: `WallTypeSelectorWidget`, `WallLayersEditor`, `SlabTypeSelectorWidget`, `SlabDimensionsEditor`, `SlabLayersEditor`, `DoorTypeSelectorWidget`, `WindowTypeSelectorWidget`, `RoofPropertySheet`, `CeilingTypeSelectorWidget`, `FloorTypeSelectorWidget`, `ColumnTypeSelectorWidget`, `BeamTypeSelectorWidget`, `StairTypeSelectorWidget`, `PlumbingTypeSelectorWidget`, `CurtainGridEditor`, `CurtainPanelEditor`, `CurtainSubElementPanel`).

| Element | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| PropertyInspector orchestrator | mounted on app start; subscribes to selection; chooses which form to render | `(window as any).propertyPanelInspector.update(selectionId)`; reads stores via `(window as any).<family>Store.getById(id)` | constructor takes `runtime`; subscribes to `runtime.selection`; reads `runtime.stores.<family>.get(id)`; mounts the per-family contribution from `runtime.plugins.contributions('inspector.element').filter(c => c.appliesTo === selection.element)` | B + F | `bench/ui/inspector-mount.bench.ts` (selection → form rendered < 50 ms p95) |
| PropertyPanel + PropertyRenderer + PropertyDescriptorGenerator | renders the form descriptor | reads legacy schemas | reads `@pryzm/schemas` Zod schema for the selected DTO; auto-generates form from `Wall.shape` / `Slab.shape` etc. (descriptor generator stays — works on Zod) | B + F | `bench/ui/inspector-render-large.bench.ts` (50-field form < 100 ms) |
| 12 per-family TypeSelectorWidget | dropdown to swap system type | reads `(window as any).<family>SystemTypeStore.list()`; dispatches `commandManager.execute(new SetXSystemTypeCommand(...))` | reads `runtime.systemTypes.<family>.list()`; dispatches `runtime.bus.executeCommand('<family>.setSystemType', ...)` | B + F | `bench/ui/system-type-swap.bench.ts` (dropdown change → store updated → bake queued < 50 ms) |
| WallLayersEditor + SlabLayersEditor | edit composite layer stack | reads system type's `layers[]`; mutates via legacy commands | dispatches `runtime.bus.executeCommand('wall.setLayers', ...)`; reflects via `runtime.stores.wall.get(id).layers` | F | `bench/ui/layers-editor-edit.bench.ts` |
| SlabDimensionsEditor + RoofPropertySheet | numeric edits with live preview | mutates store, fires events | optimistic local update + `runtime.bus.executeCommand` debounced 100 ms; preview committer paints next frame | F | `bench/ui/dimension-edit-live.bench.ts` |
| RelationshipViewer | shows host/hosted relationships | reads `(window as any).<family>Store.getRelations(id)` | reads `runtime.stores.<family>.relations(id)` | F | `bench/ui/relationship-paint.bench.ts` |
| PlacementEditor + ViewPropertiesSection | pose / level / view-specific overrides | mixed legacy reads | `runtime.stores.placement` + `runtime.viewRegistry.overrides(viewId, elementId)` | F | `bench/ui/placement-edit.bench.ts` |

Per-inspector perf gate: selection-changed event → form repainted **< 50 ms p95**, **< 100 ms p99**. Field-change → command dispatched + store updated + committer dirty **< 16 ms** (one frame).

### §12.6 Category F — Bottom strip (18 files; Phase B + E + F)

`src/ui/bottom-menu/BottomActionMenu.ts` (705 LOC; the bottom action bar with quick-tool buttons), `src/ui/furniture-carousel/*` (7), `src/ui/SchedulePanel/*` (1), `src/ui/wardrobe/*` (4), `src/ui/kitchen/*` (4), `src/ui/rooms/*` (2 — bottom rooms panel when in rooms mode), `src/ui/SheetEditor/*` (2 — bottom sheet editor when in sheet mode).

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| BottomActionMenu | hotkey shortcut buttons (WA → wall, DR → door, …); quick mode toggles; level switcher; coordinate readout; selection count | reads `(window as any).{wallTool, curtainWallTool, doorTool, ...}`; calls `service.activateXTool(...)` | reads `runtime.tools` registry; dispatches `runtime.tools.activate(...)` | B + E | `bench/ui/bottom-shortcut.bench.ts` (key-press → tool active < 16 ms) |
| FurnitureCarousel + FloatingObjectCarousel | scroll catalog, drag-and-drop into scene | reads `(window as any).furnitureStore`; uses legacy drag handler | reads `runtime.plugins.get('furniture').catalog`; drag fires `runtime.bus.executeCommand('furniture.place', {dto, point})` | F | `bench/ui/carousel-scroll.bench.ts` (60 fps scroll), `bench/ui/carousel-drag.bench.ts` (drop → first paint < 100 ms) |
| SchedulePanel | view schedule rows; cell edit | reads `scheduleStore` (legacy core); cell edit dispatches legacy commands | reads `runtime.stores.schedule.get(scheduleId)`; cell edit dispatches `runtime.bus.executeCommand('schedule.setCell', ...)` | F | `bench/ui/schedule-mount.bench.ts` (5K-row schedule < 1 s); `bench/ui/schedule-edit.bench.ts` (cell change → store update < 16 ms); `bench/ui/schedule-scroll.bench.ts` (60 fps virtual scroll) |
| Wardrobe + Kitchen panels | configure prefab assemblies | calls `(window as any).kitchenRunInspector.update()` etc. | reads `runtime.plugins.get('kitchen')` / `.get('wardrobe')` (each is its own plugin) | F | `bench/ui/wardrobe-edit.bench.ts`, `bench/ui/kitchen-edit.bench.ts` |
| Rooms panel | rooms mode bottom panel | reads room store | reads `runtime.stores.room` (or `runtime.plugins.get('rooms')`) | F | `bench/ui/rooms-paint.bench.ts` |
| SheetEditor | bottom sheet editor (when sheet view active) | legacy `SheetEditorPanel` (2,919 LOC; flagged as #2 worst file in 09-AS-IS-VS-TO-BE §3) | mounts `plugins/sheets/SheetEditorHost` (already in vision §3 row 2 — a Phase F deliverable) | F | `bench/ui/sheet-editor-mount.bench.ts`, `bench/ui/sheet-edit.bench.ts` |

### §12.7 Category G — Canvas overlays (8 files; Phase B + D)

`src/ui/SelectionOverlay.ts`, `src/ui/ViewCube.ts` (already in B), `src/ui/canvas/*` (4), `src/ui/overlays/*` (2). These render directly on the viewport.

| Overlay | Today | After | Phase | Bench |
|---|---|---|---|---|
| SelectionOverlay | bbox computed from `(window as any).bimManager`; redrawn on `bim-selection-changed` | reads `runtime.selection` + `runtime.stores.<family>.bbox(id)`; redrawn on `runtime.events.on('selection.changed')` | B | `bench/ui/selection-overlay.bench.ts` (1K-element multi-select < 100 ms) |
| Snap indicator overlay (canvas/) | reads tool-state from `(window as any).wallTool.snap` | reads `runtime.tools.activeSnapState()` | B + E | `bench/ui/snap-indicator.bench.ts` (mousemove → indicator paint < 16 ms) |
| Hover highlight overlay | reads `(window as any).hoverService` | reads `runtime.hover` | B | covered by snap-indicator bench |
| Presence cursors (overlays/) | not implemented today | renders `runtime.sync.presence.peers()`; peer pose updates broadcast at 30 Hz | C | `bench/ui/presence-cursor.bench.ts` (5 peers, 30 Hz update, < 1 ms per frame overhead) |
| Dimension preview overlay | per-tool overlay during drawing | wired via `runtime.tools.activeOverlay()` | E + F | `bench/ui/dimension-preview.bench.ts` |
| AI suggestion overlay | reads `(window as any).aiClient.activeSuggestion` | reads `runtime.ai.activeSuggestion()` | F | `bench/ui/ai-overlay.bench.ts` |

### §12.8 Category H — Drawing HUDs + mode pickers (24 files; Phase B + E + F)

12 mode pickers (per family): `WallModePicker.ts`, `CurtainWallModePicker.ts`, `DoorModePicker.ts`, `WindowModePicker.ts`, `SlabModePicker.ts`, `FloorModePicker.ts`, `CeilingModePicker.ts`, `BeamModePicker.ts`, `ColumnModePicker.ts`, `GridModePicker.ts`, `HandrailModePicker.ts`, `OpeningModePicker.ts`.

12 drawing HUDs (some families share): `WallDrawingHUD.ts`, `CurtainWallDrawingHUD.ts`, `CeilingDrawingHUD.ts`, `FloorDrawingHUD.ts`, `GridDrawingHUD.ts`, plus stair-specific (`StairLevelRequiredPanel.ts`, `StairSetupPanel.ts`), plus `UnderlayScaleHUD.ts`, `AnnotationInputPanel.ts` (annotation drawing input), `OverridePanel.ts`, `VisibilityIntentPanel.ts`, `ColourPalette.ts`, `ContextualEditBar.ts` (already in B).

**All HUDs/pickers get the same treatment in Phase B + E + F**: constructor widened to accept `runtime`; legacy `service.activateXTool()` calls become `runtime.tools.activate(family, mode)`; reads of `(window as any).<family>Store` become `runtime.stores.<family>` reads.

| Family | HUD perf gate (per-family bench) |
|---|---|
| Wall | `bench/ui/wall-mode-switch.bench.ts` (mode change L↔O↔C↔S < 16 ms); `bench/ui/wall-draw-frame.bench.ts` (mousemove during draw < 16 ms incl snap + preview) |
| Curtain Wall | `bench/ui/cw-draw.bench.ts` |
| Door / Window / Slab / Floor / Ceiling / Beam / Column / Grid / Handrail / Opening / Stair | one bench each (`bench/ui/<family>-draw.bench.ts`) — same 16 ms p95 budget |
| UnderlayScaleHUD | `bench/ui/underlay-scale.bench.ts` (drag scale → preview update < 16 ms) |
| AnnotationInputPanel | `bench/ui/annotation-input.bench.ts` (text-input → preview < 16 ms) |
| OverridePanel + VisibilityIntentPanel | `bench/ui/vi-toggle.bench.ts` (toggle → store update + repaint < 50 ms) |

