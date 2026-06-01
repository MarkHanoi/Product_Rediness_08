# §16.6.2–§16.6.5  Sub-phase plan — Phase F2 (inspector) · F3 (creation modals) · F4 (context+radial menus) · F5 (bottom strip)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1943–2029.

---

#### §16.6.2 Group F.2 — `inspector.element` contributions (per-family inspector forms)

Each family's PropertyPanel widget becomes a contribution.

| Sub-phase | Family | Today (file) | After (contribution location) | Sprint | Bench |
|---|---|---|---|---|---|
| **F.2.01** | Wall (`WallTypeSelectorWidget` + `WallLayersEditor`) | `src/ui/property-panel/Wall*.ts` | `plugins/wall/inspector/Panel.ts` (form descriptor + edit handlers) | S81 | `bench/ui/inspector-mount.bench.ts` |
| **F.2.02** | Slab (`SlabTypeSelectorWidget` + `SlabDimensionsEditor` + `SlabLayersEditor`) | `src/ui/property-panel/Slab*.ts` | `plugins/slab/inspector/Panel.ts` | S81 | included |
| **F.2.03** | Door | `src/ui/property-panel/DoorTypeSelectorWidget.ts` | `plugins/door/inspector/Panel.ts` | S82 | included |
| **F.2.04** | Window | `src/ui/property-panel/WindowTypeSelectorWidget.ts` | `plugins/window/inspector/Panel.ts` | S82 | included |
| **F.2.05** | Curtain Wall (`CurtainGridEditor` + `CurtainPanelEditor` + `CurtainSubElementPanel`) | `src/ui/property-panel/Curtain*.ts` | `plugins/curtain-wall/inspector/Panel.ts` | S82 | included |
| **F.2.06** | Floor | `src/ui/property-panel/FloorTypeSelectorWidget.ts` | `plugins/floor/inspector/Panel.ts` | S82 | included |
| **F.2.07** | Ceiling | `CeilingTypeSelectorWidget` | `plugins/ceiling/inspector/Panel.ts` | S82 | included |
| **F.2.08** | Roof (`RoofPropertySheet`) | `src/ui/property-panel/RoofPropertySheet.ts` | `plugins/roof/inspector/Panel.ts` | S82 | included |
| **F.2.09** | Stair (`StairTypeSelectorWidget`) | `src/ui/property-panel/StairTypeSelectorWidget.ts` | `plugins/stair/inspector/Panel.ts` | S82 | included |
| **F.2.10** | Column (`ColumnTypeSelectorWidget`) | | `plugins/column/inspector/Panel.ts` | S82 | included |
| **F.2.11** | Beam (`BeamTypeSelectorWidget`) | | `plugins/beam/inspector/Panel.ts` | S82 | included |
| **F.2.12** | Plumbing (`PlumbingTypeSelectorWidget`) | | `plugins/plumbing/inspector/Panel.ts` | S82 | included |
| **F.2.13** | Annotation | (mixed in PropertyPanel) | `plugins/annotations/inspector/Panel.ts` | S82 | included |
| **F.2.14** | Dimension | (mixed) | `plugins/dimensions/inspector/Panel.ts` | S82 | included |
| **F.2.15** | Room | (mixed) | `plugins/rooms/inspector/Panel.ts` | S82 | included |
| **F.2.16** | Furniture | | `plugins/furniture/inspector/Panel.ts` | S83 | included |
| **F.2.17** | Generic / View / Sheet (catch-all) | (`ViewPropertiesSection`) | `plugins/views/inspector/Panel.ts` + `plugins/sheets/inspector/Panel.ts` | S83 | included |
| **F.2.18** | PropertyInspector orchestrator rewrite to enumerate contributions | direct table lookup of widget classes | `runtime.plugins.contributions('inspector.element').filter(c => c.appliesTo(selection.element))` | S83 | `bench/ui/inspector-mount.bench.ts` |
| **F.2.19** | Multi-select common-fields panel | hard-coded intersection of widgets | `inspector.multiselect` contribution kind that takes `selection[]` and computes common fields | S83 | `bench/ui/inspector-multi-select.bench.ts` |

#### §16.6.3 Group F.3 — `modal.creation` contributions (ElementCreationModal)

Each "Create <X>" modal becomes a contribution.

| Sub-phase | Modal | After | Sprint |
|---|---|---|---|
| **F.3.01** | Create Wall modal | `plugins/wall/modal/Create.ts` | S82 |
| **F.3.02** | Create Slab modal | `plugins/slab/modal/Create.ts` | S82 |
| **F.3.03** | Create Door modal | `plugins/door/modal/Create.ts` | S82 |
| **F.3.04–F.3.13** | Window / Curtain Wall / Floor / Ceiling / Roof / Stair / Handrail / Column / Beam / Grid (10 modals) | `plugins/<family>/modal/Create.ts` | S82–S83 |
| **F.3.14** | OpeningModePicker (host-pick → place) | `plugins/wall/modal/Opening.ts` (cross-family) | S83 |
| **F.3.15** | ElementCreationModal orchestrator rewrite | hard-coded switch | reads `runtime.plugins.contributions('modal.creation').filter(c => c.element === requested)` | S83 |

#### §16.6.4 Group F.4 — `menu.context` + `menu.radial` contributions (right-click + RadialMenu)

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.4.01** | Right-click in viewport (no selection) → context menu shows | `runtime.plugins.contributions('menu.context.viewport')` | S83 |
| **F.4.02** | Right-click on selected element → element context menu | `runtime.plugins.contributions('menu.context.element').filter(c => c.appliesTo(sel.element))` | S83 |
| **F.4.03** | Each element family registers `Move / Rotate / Mirror / Copy / Array / Group / Properties / Delete / Hide / Isolate / Override` (~11 items × 12 families) → contribution per item | `plugins/<family>/menu/context-element.ts` | S83 |
| **F.4.04** | Right-click on view tab → tab context menu | `runtime.plugins.contributions('menu.context.viewtab')` | S83 |
| **F.4.05** | Right-click on project card (hub) | already done in C.4.01 | done |
| **F.4.06** | RadialMenu open (Q hotkey) → tools shown | `runtime.plugins.contributions('menu.radial')` | S83 |
| **F.4.07** | Radial menu rotate-and-release → tool activated | dispatched via `runtime.tools.activate(toolId)` | S83 |
| **F.4.08** | Radial menu customise (settings) → which tools appear | `runtime.userPreferences.radialTools[]` | S83 |

#### §16.6.5 Group F.5 — Bottom strip gestures (BottomActionMenu + carousels + sheet editor)

`BottomActionMenu.ts` has 7 structure-tool buttons, 4 view buttons, level switcher, coordinate readout, selection count, plus section box, ortho toggle, and snap settings.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.5.01** | Bottom: click Wall quick button | `(window as any).wallTool.activate(...)` | `runtime.tools.activate('wall')` | S83 |
| **F.5.02** | Bottom: click Curtain Wall quick button | `(window as any).curtainWallTool.activate(...)` | `runtime.tools.activate('curtain-wall')` | S83 |
| **F.5.03–F.5.07** | Bottom: Door / Window / Slab / Floor / Ceiling quick buttons | each `(window as any).<family>Tool.*` | `runtime.tools.activate('<family>')` | S83 |
| **F.5.08** | Bottom: shortcut hotkeys (WA, CW, DR, WI, SL, FL, CE) | hotkey listener calls legacy tool | `runtime.tools.activate(...)` from hotkey handler | S83 |
| **F.5.09** | Bottom: level switcher dropdown | reads/writes `(window as any).activeLevelStore` | reads `runtime.stores.level`; sets via `runtime.bus.executeCommand('view.setActiveLevel', ...)` | S83 |
| **F.5.10** | Bottom: section box toggle | `(window as any).sectionBoxTool.enable/disable` | `runtime.tools.sectionBox.enable/disable` | S83 |
| **F.5.11** | Bottom: ortho/perspective toggle | `(window as any).cameraController.setProjection` | `runtime.cameraController.setProjection(mode)` | S83 |
| **F.5.12** | Bottom: snap settings dropdown | local prefs | `runtime.userPreferences.snap` (broadcasts to picking) | S83 |
| **F.5.13** | Bottom: reset view button | `(window as any).cameraController.resetView()` | `runtime.cameraController.resetView()` | S83 |
| **F.5.14** | Bottom: cursor coordinates readout | reads `(window as any).hoverService.lastWorldPos` | reads `runtime.hover.lastWorldPos()` | S83 |
| **F.5.15** | Bottom: selection count readout | reads legacy `selectionService.size()` | reads `runtime.selection.size()` | S83 |
| **F.5.16** | FurnitureCarousel: scroll | reads `(window as any).furnitureStore.list()` | reads `runtime.plugins.get('furniture').catalog` | S83 |
| **F.5.17** | FurnitureCarousel: click thumbnail | sets active item legacy | dispatches `runtime.tools.activate('furniture-place', {itemId})` | S83 |
| **F.5.18** | FurnitureCarousel: drag thumbnail into scene → drop | legacy drag handler | drag-end → `runtime.bus.executeCommand('furniture.place', {dto, point})` | S83 |
| **F.5.19** | FloatingObjectCarousel: same gestures | same wire as F.5.16–18 | | S83 |
| **F.5.20** | FurnitureCarousel: filter / search | local filter | local filter on plugin catalog | S83 |
| **F.5.21** | Wardrobe panel: configure assembly | `(window as any).wardrobeRunInspector` | `runtime.plugins.get('wardrobe').configure(...)` | S83 |
| **F.5.22** | Kitchen panel: configure | `(window as any).kitchenRunInspector` | `runtime.plugins.get('kitchen').configure(...)` | S83 |
| **F.5.23** | Rooms panel (bottom) | room store reads | `runtime.stores.room` reads | S83 |
| **F.5.24** | SchedulePanel: open schedule (click row in left rail) | reads `scheduleStore.get(id)` | reads `runtime.stores.schedule.get(id)` | S83 |
| **F.5.25** | SchedulePanel: cell edit | dispatches legacy command | `runtime.bus.executeCommand('schedule.setCell', {scheduleId, row, col, value})` | S83 |
| **F.5.26** | SchedulePanel: column header click → sort | local sort | local sort on store snapshot | S83 |
| **F.5.27** | SchedulePanel: filter row | local filter | local filter | S83 |
| **F.5.28** | SchedulePanel: export CSV button | legacy export | dispatches via `plugins/schedules` export contribution (already in F.1.28) | S83 |
| **F.5.29** | SheetEditor: click viewport in sheet → place | legacy `SheetEditorPanel.placeViewport` | `plugins/sheets/SheetEditorHost.placeViewport()` (this is the major decomposition of #2 worst file) | S83 |
| **F.5.30** | SheetEditor: drag viewport corner → resize | legacy | `runtime.bus.executeCommand('sheet.resizeViewport', ...)` | S83 |
| **F.5.31** | SheetEditor: drag titleblock → reposition | legacy | `runtime.bus.executeCommand('sheet.placeTitleBlock', ...)` | S83 |
| **F.5.32** | SheetEditor: select revision row → edit | legacy | `runtime.bus.executeCommand('sheet.setRevision', ...)` | S83 |

