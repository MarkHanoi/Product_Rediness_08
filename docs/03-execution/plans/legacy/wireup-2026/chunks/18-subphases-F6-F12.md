# §16.6.6–§16.6.12  Sub-phase plan — Phase F6 (left-rail content) · F7 (AI) · F8 (Visibility-Intent) · F9 (Data Workbench) · F10 (rendering) · F11 (modals) · F12 (plugins/IFC/Rhino/BCF/DXF/CompEd)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 2030–2190.

---

#### §16.6.6 Group F.6 — Left rail panel content (per spine icon)

Each spine icon's content panel migrates as one sub-phase.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.6.01** | MODEL spine icon: spatial tree paint with elements | reads 12 stores via `(window as any)` | reads `runtime.stores.<family>` for each family | S81 |
| **F.6.02** | MODEL: click element in tree → select in viewport | legacy selection | `runtime.selection.select([{element, id}])` + camera focus | S81 |
| **F.6.03** | MODEL: expand/collapse level node | local UI state | local UI state (no engine touch) | S81 |
| **F.6.04** | MODEL: drag element in tree → reparent | legacy command | `runtime.bus.executeCommand('hierarchy.reparent', ...)` | S81 |
| **F.6.05** | MODEL: right-click in tree → element context menu (already in F.4.02) | done | done | — |
| **F.6.06** | DATA spine icon: hierarchy paint | legacy | `runtime.dataWorkbench.hierarchy.list()` | S82 |
| **F.6.07** | DATA: filter/search | local | local on store snapshot | S82 |
| **F.6.08** | DATA: click row → select element | legacy | `runtime.selection.select(...)` | S82 |
| **F.6.09** | DATA: bucket panels (each bucket file) | legacy | reads `runtime.dataWorkbench.bucket(...)` | S82 |
| **F.6.10** | VIEWS spine icon: list views | legacy `viewDefinitionStore` | `runtime.viewRegistry.list()` | S81 |
| **F.6.11** | VIEWS: click view → activate (already in D.11) | done | done | — |
| **F.6.12** | VIEWS: "+ New view" button | legacy | `runtime.bus.executeCommand('view.create', {kind, settings})` | S81 |
| **F.6.13** | VIEWS: right-click view → duplicate / delete / rename | legacy | dispatches `view.duplicate / view.delete / view.rename` | S81 |
| **F.6.14** | VIEWS: drag view to reorder | legacy | `runtime.bus.executeCommand('view.reorder', ...)` | S81 |
| **F.6.15** | VIEWS: View Templates section (`ViewTemplateManagerPanel`) — apply / create / delete template | legacy | dispatches `viewTemplate.*` | S81 |
| **F.6.16** | SCHEDULES spine icon: list schedules | legacy | `runtime.stores.schedule.list()` | S82 |
| **F.6.17** | SCHEDULES: "+ New schedule" wizard | legacy | dispatches `schedule.create` | S82 |
| **F.6.18** | SCHEDULES: right-click → delete / rename / duplicate | legacy | dispatches | S82 |
| **F.6.19** | AI spine icon: open panel (already in B.31 for mount) | done for mount | F.7.* for actual gestures | — |
| **F.6.20** | HISTORY spine icon: AI approval queue paint | reads `commandProposalStore` | `runtime.ai.approvalQueue.list()` | S83 |
| **F.6.21** | HISTORY: click proposal → preview | legacy preview | `runtime.ai.approvalQueue.preview(id)` | S83 |
| **F.6.22** | HISTORY: Accept button → commit batch | legacy | `runtime.ai.approvalQueue.commit(batchId)` | S83 |
| **F.6.23** | HISTORY: Reject button → drop | legacy | `runtime.ai.approvalQueue.reject(batchId)` | S83 |
| **F.6.24** | HISTORY: edit-before-commit (open inspector on proposed element) | legacy | special inspector mode reading from proposal | S83 |
| **F.6.25** | SETTINGS spine icon: open settings (already in C.9) | done | done | — |
| **F.6.26** | LeftNavRail: drag spine width handle → resize content area | legacy | local state + `runtime.userPreferences.set('lnr.width', n)` | S81 |
| **F.6.27** | LeftNavRail: collapse-all hotkey (Cmd+\\) | legacy | local + pref | S81 |

#### §16.6.7 Group F.7 — AI gestures (`runtime.ai.*`)

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.7.01** | AI: type prompt + Enter → streamed reply | `(window as any).aiClient.streamCompletion(...)` | `for await (chunk of runtime.ai.streamCompletion({prompt, ctx}))` | S83 |
| **F.7.02** | AI: stop button mid-stream | `aiClient.cancel(streamId)` | `runtime.ai.cancel(streamId)` | S83 |
| **F.7.03** | AI: cost pill click → cost breakdown | `(window as any).aiClient.cost.snapshot()` | `runtime.ai.cost.snapshot()` | S83 |
| **F.7.04** | AI: model selector dropdown | `aiClient.setModel(modelId)` | `runtime.ai.setModel(modelId)` | S83 |
| **F.7.05** | AI: history panel (past conversations) | local | `runtime.ai.history.list(projectId)` | S83 |
| **F.7.06** | AI: open conversation → load | local | `runtime.ai.history.load(convId)` | S83 |
| **F.7.07** | AI: AICreatePanel "Generate" submit | legacy generative | `runtime.ai.generative.create({prompt, ctx})` → returns `CommandBatch` → enters approval queue | S83 |
| **F.7.08** | AI: ValidatePanel "Run" button | legacy rule engine | `runtime.ai.rules.validate(projectId)` | S83 |
| **F.7.09** | AI: ValidatePanel click rule violation → focus element | legacy | `runtime.selection.select(...)` + camera focus | S83 |
| **F.7.10** | AI: FloorPlanImportPanel upload PDF → submit | legacy `(window as any).pdfToBim.start(file)` | `runtime.ai.floorPlan.import({file})` → returns `jobId` | S83 |
| **F.7.11** | AI: FloorPlanImportPanel progress poll | legacy | `runtime.ai.floorPlan.subscribe(jobId, p => ...)` | S83 |
| **F.7.12** | AI: FloorPlanFullPlanViewer paint | legacy | `runtime.ai.floorPlan.getResult(jobId)` | S83 |
| **F.7.13** | AI: FloorPlanFullPlanViewer "Accept all" → batch into approval queue | legacy | `runtime.ai.floorPlan.toBatch(jobId)` → `runtime.ai.approvalQueue.enqueue(batch)` | S83 |
| **F.7.14** | AI: FloorPlanDebugOverlay show/hide | legacy debug | `runtime.ai.floorPlan.debugOverlay(jobId)` | S83 |
| **F.7.15** | AI: voice spatial input button (mic) | legacy `voiceSpatialInterface` | `runtime.ai.voice.startSession()` | S84 |
| **F.7.16** | AI: voice utterance → transcribed → command | legacy | `runtime.ai.voice.subscribe(utterance => runtime.ai.executeIntent(utterance))` | S84 |

#### §16.6.8 Group F.8 — Visibility-Intent / Intent UI (preserved 11-wave verbatim)

The 11-wave VI logic is preserved (per Vision §3 row "Visibility-Intent UI"). Only the wireup changes.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.8.01** | VI panel: open (Visual rail → VG button — already in F.1.59) | done for activate | this PR adds the panel itself | S81 |
| **F.8.02** | VI panel: model categories list | legacy `(window as any).visibilityIntentService.listCategories(viewId)` | `runtime.visibilityIntent.list(viewId)` | S81 |
| **F.8.03** | VI panel: toggle category visibility | legacy | dispatches `runtime.bus.executeCommand('vi.setCategoryVisibility', {viewId, category, visible})` | S81 |
| **F.8.04** | VI panel: edit graphics override (color, lineweight, pattern) | legacy | dispatches `vi.setOverride` | S81 |
| **F.8.05** | OverridePanel (per-element override): open | legacy | `runtime.visibilityIntent.elementOverride(viewId, elementId)` | S81 |
| **F.8.06** | OverridePanel: edit override values | legacy | dispatches `vi.setElementOverride` | S81 |
| **F.8.07** | OverridePanel: "Reset to category" | legacy | `vi.resetElementOverride` | S81 |
| **F.8.08** | DivergedBanner: shown when current view diverges from intent | reads `intentSourceStore` | `runtime.intent.divergence(viewId)` | S81 |
| **F.8.09** | ResetToIntentButton click → revert | legacy | `runtime.intent.resetToIntent(viewId)` | S81 |
| **F.8.10** | HeaderIntentPicker dropdown change | legacy | dispatches `intent.setSource` | S81 |
| **F.8.11** | IntentSourcePill click → tooltip | legacy | reads `runtime.intent.currentSource(viewId)` | S81 |
| **F.8.12** | SourceChainTooltip hover → show chain | legacy | reads `runtime.intent.chain(viewId)` | S81 |
| **F.8.13** | SpineOverrideList: edit | legacy | `runtime.intent.spineOverrides(viewId)` | S81 |

#### §16.6.9 Group F.9 — Data Workbench (15 panels)

Each panel = one sub-phase. Most reduce to "swap legacy global for `runtime.dataWorkbench.<X>`".

| Sub-phase | Panel | After | Sprint |
|---|---|---|---|
| **F.9.01** | DataWorkbench orchestrator (panel switch) | `runtime.dataWorkbench.activePanel.set(id)` | S82 |
| **F.9.02** | HierarchyTreePanel: paint + click row + filter | `runtime.dataWorkbench.hierarchy` | S82 |
| **F.9.03** | NLQueryPanel: type query → run → results | `runtime.dataWorkbench.nl.query(text, ctx)` | S82 |
| **F.9.04** | NLQueryPanel: click result row → focus element | `runtime.selection.select(...)` | S82 |
| **F.9.05** | SpatialQueryPanel: build query → run | `runtime.dataWorkbench.spatial.query(predicate)` | S82 |
| **F.9.06** | RelationshipExplorerPanel: explore | `runtime.dataWorkbench.relationships(elementId)` | S82 |
| **F.9.07** | AnalyticsPanel: chart type / metric / dimension change | `runtime.dataWorkbench.analytics(query)` | S82 |
| **F.9.08** | DataSheetPanel: cell edit | `runtime.bus.executeCommand('dataSheet.setCell', ...)` | S82 |
| **F.9.09** | DesignHistoryPanel: scrub timeline | `runtime.persistence.eventLog.replayUntil(eventId)` (preview mode) | S82 |
| **F.9.10** | DesignHistoryPanel: click event → focus elements changed | `runtime.selection.select(eventTouched(eventId))` | S82 |
| **F.9.11** | ProgrammePanel: phase row edit | dispatches `programme.setPhase` | S82 |
| **F.9.12** | PhysicsPanel: param change | dispatches `physics.setParam` | S82 |
| **F.9.13** | CompliancePanel: rule toggle / run check | `runtime.compliance.runChecks(scope)` | S82 |
| **F.9.14** | PortfolioQueryPanel: cross-project query | `runtime.dataWorkbench.portfolio.query(...)` | S82 |
| **F.9.15** | TemplateEditorPanel: edit template | dispatches `template.set` | S82 |
| **F.9.16** | SyncStateDetailDrawer: open / inspect | `runtime.sync.client.diagnostics()` | S82 |

#### §16.6.10 Group F.10 — Rendering controls (10 panels)

Each panel = one sub-phase wired to `runtime.scene.renderer.*`.

| Sub-phase | Panel | After | Sprint |
|---|---|---|---|
| **F.10.01** | RenderPanel: quality preset (low/medium/high) | `runtime.scene.renderer.setQuality(preset)` | S81 |
| **F.10.02** | RenderPanel: post-fx toggles (TRAA, SSGI, Bloom) | `runtime.scene.renderer.setPostFx(name, enabled)` | S81 |
| **F.10.03** | PerformanceModePanel: live perf monitor | reads `runtime.scene.renderer.metrics()` | S81 |
| **F.10.04** | RealSunControl: drag sun angle | `runtime.scene.renderer.setSunAngle(deg)` | S81 |
| **F.10.05** | RenderGallery: list snapshots | `runtime.persistence.client.renders.list(projectId)` | S81 |
| **F.10.06** | RenderGallery: click snapshot → enlarge | local UI | S81 |
| **F.10.07** | RenderQueuePanel: list active jobs | `runtime.scene.renderer.queue.list()` | S81 |
| **F.10.08** | RenderQueuePanel: cancel job | `runtime.scene.renderer.queue.cancel(jobId)` | S81 |
| **F.10.09** | PanoramaPanel: capture pano | `runtime.scene.renderer.capturePanorama({preset})` | S81 |
| **F.10.10** | WalkthroughPanel: define path → record | dispatches `walkthrough.recordPath` | S81 |
| **F.10.11** | WalkthroughPanel: play | `runtime.scene.renderer.playWalkthrough(id)` | S81 |
| **F.10.12** | VideoExportPanel: export settings → render | `runtime.scene.renderer.exportVideo({...})` | S81 |
| **F.10.13** | ExportStudioPanel: composite export | `runtime.scene.renderer.exportStudio({...})` | S81 |
| **F.10.14** | VisualizationEnginePanel: switch engine (real-time / pathtrace) | `runtime.scene.renderer.setEngine(engine)` | S81 |

#### §16.6.11 Group F.11 — Modals + utilities

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.11.01** | WelcomeModal "Take tour" button | local UI; emits `runtime.events.emit('tour.start')` | S82 |
| **F.11.02** | UpgradeModal "Upgrade now" button | navigates to PricingPage | S82 |
| **F.11.03** | ContactSalesModal submit | POST via `runtime.persistence.client.sales.submit({...})` | S82 |
| **F.11.04** | ShortcutCheatSheet open (?) | reads `runtime.hotkeys.list()` | S82 |
| **F.11.05** | UiPreferences open / change (already in C.9) | done | — |
| **F.11.06** | ConfirmDialog: confirm/cancel | static (no engine touch) | S82 |
| **F.11.07** | ColourPalette open / pick (used inside override panels) | local + emits via runtime | S82 |
| **F.11.08** | UnderlayScaleHUD: drag scale handle | dispatches `runtime.bus.executeCommand('underlay.setScale', ...)` | S83 |
| **F.11.09** | AnnotationInputPanel (text input during annotation drawing) | `runtime.tools.activeOverlay()` for annotation tool | S83 |
| **F.11.10** | StairLevelRequiredPanel: pick level | `runtime.stores.level.list()` + sets pending stair config | S83 |
| **F.11.11** | StairSetupPanel: configure run + tread + riser | dispatches `stair.create` with config | S83 |
| **F.11.12** | OwnerFeatureFlags: toggle (already in C.9) | done | — |

#### §16.6.12 Group F.12 — Plugin / Marketplace + IFC + Rhino + Component Editor

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.12.01** | Marketplace icon click → marketplace panel mounts | `runtime.plugins.marketplace.list()` | S84 |
| **F.12.02** | Marketplace: filter / search | local on catalog | S84 |
| **F.12.03** | Marketplace: click "Install" on plugin card → confirm permissions | `runtime.plugins.installFromUrl(manifestUrl)` after permission grant | S84 |
| **F.12.04** | Marketplace: click "Uninstall" on installed plugin | `runtime.plugins.uninstall(pluginId)` | S84 |
| **F.12.05** | Marketplace: plugin settings panel for installed plugin | per-plugin contributions | S84 |
| **F.12.06** | IFC Import panel: drag-and-drop .ifc file | `runtime.ifc.import.start(file)` | S84 |
| **F.12.07** | IFC Import panel: progress + preview | `runtime.ifc.import.subscribe(jobId, ...)` | S84 |
| **F.12.08** | IFC Import: "Open" → mount imported elements | dispatches batch into `runtime.bus` | S84 |
| **F.12.09** | IFC Inspector panel (PSet editor): browse PSets | `runtime.ifc.inspector.psets(elementId)` | S84 |
| **F.12.10** | IFC Inspector: edit PSet value | dispatches `ifc.setPsetValue` | S84 |
| **F.12.11** | IFC Export: Export menu → options → run | `runtime.ifc.export.run({scope, schema})` | S84 |
| **F.12.12** | BCF panel: list issues | `runtime.bcf.list(projectId)` | S84 |
| **F.12.13** | BCF panel: create issue at viewpoint | `runtime.bcf.create({viewpoint, title, body})` | S84 |
| **F.12.14** | BCF panel: click issue → restore viewpoint | `runtime.bcf.restoreViewpoint(issueId)` | S84 |
| **F.12.15** | BCF panel: comment / status change | dispatches `bcf.comment / bcf.setStatus` | S84 |
| **F.12.16** | DXF Import: drag-and-drop .dxf | `runtime.dxf.import.start(file)` | S84 |
| **F.12.17** | DXF Export: Export menu | `runtime.dxf.export.run(...)` | S84 |
| **F.12.18** | Rhino Import: drag-and-drop .3dm | `runtime.rhino.import.start(file)` | S84 |
| **F.12.19** | PDF underlay: drag-and-drop .pdf | dispatches `underlay.import` | S84 |
| **F.12.20** | Component Editor: open as separate pane | `runtime.componentEditor.open(componentId)` | S84 |

