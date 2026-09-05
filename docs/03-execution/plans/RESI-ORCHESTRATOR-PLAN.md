# RESI-ORCHESTRATOR — capability inventory and staged build plan

> **Stamp**: 2026-09-03 · **Lane**: RESI-ORCHESTRATOR · **Status**: PLAN (no production behaviour
> is asserted by this document; the code changes this lane made are listed in §7)
> **Governs**: how [`STR-RESIDENTIAL-DESIGN-ORCHESTRATOR`](../../01-strategy/STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md)
> (the founder's 23-section product spec, captured the same day) gets built **out of machinery that
> already exists**.
>
> **The standing rules this lane was run under**, and why the inventory is the larger half of it:
> *grep for the existing solver first* · *authored-but-unwired is the bottleneck* ·
> *committed ≠ reachable*. PRYZM has a great deal of this spec already built. The dominant risk to
> the orchestrator is **rebuilding what is already there**, not failing to build it.
>
> **Every row in §1 was established by reading the code at HEAD `c75d2027` on 2026-09-03.** Statuses
> use four values and they are not synonyms:
>
> | Status | Means |
> |---|---|
> | **EXISTS-AND-WIRED** | a user can reach it today; the caller chain is named |
> | **EXISTS-BUT-UNWIRED** | the code is real and tested; **no production caller reaches it** |
> | **PARTIAL** | some arms exist, named ones do not |
> | **ABSENT** | nothing in the repo does this |
>
> ⛔ **These rot.** Where a row's verdict matters to a decision, re-run the citation before trusting
> it — that is the same instruction `CLAUDE.md` gives about its own counts, for the same reason.

---

## §0 — The headline

**Roughly two-thirds of the 23 sections are already built, and the unbuilt third is concentrated
in one place.**

| Verdict | Capabilities | Share |
|---|---|---|
| EXISTS-AND-WIRED | 38 | ~52 % |
| PARTIAL | 18 | ~25 % |
| EXISTS-BUT-UNWIRED | 6 | ~8 % |
| ABSENT | 11 | ~15 % |

**What is genuinely, entirely there** — §2 (the parcel/law/massing panel, with per-value citations
and a regulatory-vs-study discipline that is stronger than the spec asks for), §14 (the continuous
data panel), §18 (compliance always visible), §21 (the left-3D / right-panel workspace with a
view switcher), most of §17 (detailed RAC/AI design against an existing model), the whole
quantities spine, the room graph as a **read** surface, Edit Profile, and Move→Recompute for walls.

**What is genuinely absent, and it is one theme, not eleven** — *there is no spatial-envelope
layer between the zoning envelope and the walls.* Concretely:

1. **No massing OPTIONS.** There is exactly **one** `BuildableEnvelope` per parcel. The
   N-candidates-with-reasons pattern the spec wants at massing exists, fully built, **one level
   down** at the floor-plan layer (`generateHouseLayoutOptions` → `ScoredHouseLayoutOption[]`, with
   coded `LayoutLimitation` reasons and 17 score axes rendered as cards). It has never been lifted
   to the parcel.
2. **No room ENVELOPE.** `Room` is a real element with a polygon, an area, a volume and an
   `IfcSpace` identity — but it is **derived from walls** (`boundaryMode: 'wallBound'`) or hand
   sketched. There is no first-class, independently placeable, wall-free spatial volume, and
   `multiLevelSpan` is hard-pinned to `null`.
3. **No envelope → BIM conversion.** Nothing named `envelopeToBim` / `createHouse` exists. The
   envelope contributes exactly two things to generation: a 2-D footprint
   (`resolveBuildableFootprint`) and a storey cap (`capStoreysToEnvelope`). Its **3-D form** —
   setbacks, tiers, stepbacks — never reaches geometry.

Everything else in the "missing" column is either a **binding** (§3's click-a-number-highlight-it:
every part exists except the wire) or a **research problem with no data pipeline yet** (§4's
sea/open views).

---

## §1 — The capability matrix

### §Role / §1 — the stage ladder

| Capability | Status | Where | What's missing |
|---|---|---|---|
| A staged, reducer-driven "where am I" model | **EXISTS-AND-WIRED**, but it stops one stage too early | `apps/editor/src/engine/views/siteEntryModel.ts` — `SiteEntryStage = 'world'\|'country'\|'city'\|'parcel'`, `SITE_ENTRY_STAGES`, `reduceSiteEntry`, `describeSiteEntryPanel`, intents `site.entry.*`; panel `apps/editor/src/engine/views/SiteEntryPanel.ts`; store `siteEntryStore.ts` | The ladder ends at `parcel`. `site.entry.select-parcel` is *"THE hand-off"* — and the spec's ten levels all start on the far side of it. **There is no design-stage machine.** |
| Progressive disclosure / disable-or-explain | **EXISTS-AND-WIRED** | `SiteEntryPanel.ts` header: *"an unavailable action renders greyed WITH its reason printed"* | Nothing — this is the pattern to copy, not to invent |

### §2 — Start with the parcel

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Parcel card (ref/refcat, address, **two** areas kept distinct, source CRS, match tier, licence, retrieved-at) | **EXISTS-AND-WIRED** | `apps/editor/src/ui/site/parcel/parcelCard.ts` (`buildParcelCard`); mounted via `parcelPanelSection.ts` / `parcelRailPanel.ts`; hosts `Layout.ts:92 → mountGISArea` and `ViewBrowser/ProjectBrowserPanel.ts:790,985` | — |
| Area · perimeter · bounding box · boundary-edge count | **EXISTS-AND-WIRED** | `apps/editor/src/ui/layout/GISAreaLayout.ts` §ENVELOPE-SITE-DATA (`polyAreaM2`, `polyPerimeterM`, `polyBboxM`) — the "Parcel" group of the envelope card | Perimeter is **also** computed at `ui/site/parcel/ParcelProvider.ts:66` and never displayed on the parcel card — two surfaces, one fact |
| Street frontage | **PARTIAL** | Solver: `packages/site-parcel-data/src/geometry/blockRing.ts:765 classifyBlockFrontages`. Determination gate: `apps/editor/src/ui/site/parcelEdgeClassificationDetermination.ts` (distinguishes *"no edge is frontage"* from *"nobody classified the edges"*). Display: a clause on the envelope card + an edge count in `SiteInspectorPanel.ts:224` | No per-edge frontage display, and no way to see **which** edge |
| Cadastral boundary + cadastral info | **EXISTS-AND-WIRED** | `apps/editor/src/ui/site/parcel/{CatastroParcelProvider,WfsParcelProvider,DkMatrikelParcelProvider,FootprintParcelProvider}.ts` + `packages/site-parcel-data/src/countryAdapters/**` (~30 jurisdictions) | — |
| Max height · storeys · FAR · site coverage — **each with its source citation** | **EXISTS-AND-WIRED** | `GISAreaLayout.ts` ordinance block; values off `BuildableEnvelope`; citation off `DerivationEntry.ordinanceRef` (`packages/schemas/src/site/zoning/BuildableEnvelope.ts:133`) | — |
| Max implementation / footprint area | **EXISTS-AND-WIRED** | `env.insetPolygon` / `insetAreaM2` from `computeBuildableEnvelope` (`packages/site-parcel-data/src/ZoningRulesEngine.ts:198`) | — |
| Max gross buildable area (GFA) | **PARTIAL** | **Not a schema field.** Derived at render time: `GISAreaLayout.ts:2974` `footprint × maxFloors`, deliberately `null` when storeys were not derived | A permitted-GFA figure that survives outside the card |
| MASSING POTENTIAL block (footprint, footprint/parcel %, GFA, study volume, per-level area, height, level count) | **EXISTS-AND-WIRED** | `GISAreaLayout.ts` `massBlock` + `perLevel` groups | — |
| **REGULATORY vs PRYZM-STUDY, kept structurally apart** | **EXISTS-AND-WIRED — and stronger than the spec asks** | `packages/schemas/src/site/zoning/ProvenanceFlags.ts`: `FieldProvenance` (`published-structured\|ordinance-pdf\|pipeline-extracted\|estimated`) and `EnvelopeConfidence` (6 tiers) with `ENVELOPE_CONFIDENCE_ORDER` + `capEnvelopeConfidenceToPackDefault` (a *min*, so a pack can demote but never certify itself). A study is a **separate status**, not a weak tier: `ContextDerivedStudyEnvelope.ts` `CONTEXT_DERIVED_STUDY_STATUS`. Card copy: `NOT_DERIVED` sentinel, *"A STUDY, not a permit"* | Nothing. **This is §2's and §18's honesty requirement, already ratified and shipped. Do not re-invent it under a new name.** |
| Never present a study as a permit (refusal rather than a guess) | **EXISTS-AND-WIRED** | `EnvelopeRefusalSchema.legallyGrounded` — *is this refusal about the LAW or about PRYZM's coverage* — plus `buildRefusedEnvelope`, `siuLandClassificationGuard.ts`, and the pinned suites `neverOverstateMechanisms.test.ts` / `envelopeToMassingNeverOverstates.test.ts` | — |

### §3 — Connect the data to the 3D site

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Click a **number** → highlight the geometry it describes | **ABSENT** | — | The card rows are built by a local `row(label, value)` returning static HTML: no `data-*` id, no handler. `EnvelopeTier.id` exists in the schema and `envelopeToMassing` emits one solid per tier, but **nothing binds a row to a solid.** |
| Panel ⇄ 3D selection for **BIM elements** | **EXISTS-AND-WIRED** | typed bus `bim-selection-changed` (`packages/runtime-composer/src/types.ts`); producers `dataworkbench/RelationshipExplorerPanel.ts:354`, `engine/views/PlanViewInteraction.ts`; consumers `initScene.ts:3861`, `PlanViewManager.ts:193`, `engineLauncher.ts:488` | It carries element ids, not site geometry |
| Graph node → highlight in 3D | **EXISTS-AND-WIRED** | `analysis/widgetRenderers.ts:915` → `selectionBus` → `InspectModeCoordinator` → `DiagnosticMaterialManager.setAnalysisSelection` (`:1521`) | The **reverse** (3D → graph) is missing — `relationship-graph` is `refresh:'manual'` (`widgetCatalogue.ts:175`) |
| `pryzm-highlight-elements` (multi-element highlight) | **EXISTS-BUT-UNWIRED** | declared `runtime-composer/src/types.ts:2461`; emitted once at `RelationshipExplorerPanel.ts:342`; **zero subscribers repo-wide** | A listener. It is the natural carrier for §3. |
| Geometry-side highlight primitives | **PARTIAL** | `CesiumViewport.ts:2856 setContextQueryHighlight` (private), `SiteBoundaryMap2D.ts:998 refreshParcelHighlight` | Both run map→card, the opposite direction, and neither is a public verb |

### §4 — Contextual site intelligence

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Surrounding buildings, LOD100/200 context | **EXISTS-AND-WIRED** | `apps/editor/src/ui/geospatial/contextBuildings.ts`, `contextTiles.ts` (twin dedupe by footprint IoU, not proximity), pre-baked R2 tiles | — |
| Neighbour **heights with provenance and confidence** | **EXISTS-AND-WIRED** | `contextBuildings.ts` — `ResolvedContextHeight`, `ContextHeightProvenance` (`measured-lidar\|tagged\|derived-levels\|assumed`), `contextHeightConfidence`; corrections in `contextHeightAdoptions.ts` | — |
| Existing buildings on the parcel | **PARTIAL** | `ui/site/parcel/FootprintParcelProvider.ts`, `footprintPick.ts` | Not modelled as an on-parcel constraint |
| Proximity → privacy | **PARTIAL** | `ui/site/neighbourFootprintStore.ts` → `apartment-layout/resolveBlindFacades.ts:195` → `ApartmentLayoutExecutor.ts:149`, `HouseLayoutExecutor.ts:671` (SPEC-PARTY-WALL-AWARENESS). **The only proximity inference in the app** | Generalised privacy/visibility scoring |
| Orientation | **EXISTS-AND-WIRED** | `packages/spatial-index/src/FacadeOrientationService.ts` + `FacadeOrientationMath.ts` | — |
| Sun exposure + shadows | **EXISTS-AND-WIRED** | `@pryzm/solar-analysis` (`accumulateSunHours`, `buildOccluderIndex`, sun-path math) + `packages/renderer-three/src/solar/**`; reachable via DataWorkbench → `PhysicsPanel` → `openSolarSunHoursPanel` and via GIS → `FormaSiteAnalysisControls.ts` (sun scrubber, shadow study, façade sun-hours); worker `apps/editor/src/workers/solar.worker.ts` | — |
| Per-room solar heat gain | **EXISTS-BUT-UNWIRED** | `packages/solar-analysis/src` — `accumulateRoomHeatGain`, `RoomGlazing`, `RoomHeatGain`, `DEFAULT_SHGC` (C21 §10.10). **Zero consumers outside the package** | A caller |
| Street relationships | **PARTIAL** | `contextRoads.ts` fetches + renders geometry | No road classification → noise / access derivation |
| Views · sea views · open views | **ABSENT** | Nearest: `packages/ai-host/src/workflows/apartmentLayout/environment/facadeValueField.ts` (`computeFacadeValueField` → orientation + `sunlightScore` + `cornerExposureScore`) — itself **EXISTS-BUT-UNWIRED**, and its own header lists `viewQualityField` as queued. The **sea mask exists** (`contextWater.ts` `buildSeaMaskFromCoastline`) and nothing consumes it for view scoring | A viewshed/sightline metric. This is the one real research problem in the spec. |
| Parking + access | **ABSENT** | — | — |
| *Using* the intelligence to drive recommendations | **PARTIAL** | Only blind-façade → layout | Everything else is displayed, not consumed |

### §5 — Buildable envelope before architecture

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Max envelope solved and drawn in 3D + plan | **EXISTS-AND-WIRED** | `computeBuildableEnvelope` (~20 call sites in `ui/site/siteDispatch.ts`, on the `site.parcel-boundary-set` seam) → `envelopeToMassing` → `ui/site/ParcelBoundarySceneRenderer.ts` (THREE) and `ui/geospatial/CesiumViewport.ts` (globe); visibility authority `ui/site/envelopeVisibility.ts` + two-axis control `envelopeVisibilityControl.ts` | — |
| **User types a study parameter → a study volume is built and drawn** | **EXISTS-AND-WIRED** | §MANUALENV159 / §ENV3D164: `ui/site/envelopeCardSections.ts buildStudyHeightEntryHtml` → `GISAreaLayout.wireStudyHeightEntry` → `ui/site/siteDispatch.ts:3718 applyUserSuppliedStudyHeight` → `buildUserSuppliedStudyEnvelope` → session slot `contextDerivedStudyEnvelopeState.ts` + project-persisted `userSuppliedStudyHeightState.ts` | **This is the exact mechanism §5 needs, already proven end to end — for HEIGHT.** |
| *"I want ~120 m² on the ground floor"* → a proposed envelope | **ABSENT** | — | A target-**area** sibling of the height entry: solve the inset that yields the target, refuse with **both** numbers when it exceeds the permitted footprint |
| Remaining potential / effect on upper floors | **PARTIAL** | `buildCapacityComparison` compares an **authored** model to the envelope | Nothing compares a **proposed envelope** to the envelope |

### §6 — Natural intent

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Chat → intent → command bus | **EXISTS-AND-WIRED** | `ui/ai/AIPanel.ts:1863 tryHandleZeroToken` → `ui/ai/ZeroTokenChatBridge.ts:1948 resolveUtterance` (tier 0/1, zero tokens) → `applySemanticIntent` → `runtime.bus.executeCommand(..., AI_ACTOR_ENVELOPE)`; LLM rung `packages/ai-host/src/intents/LlmPlanner.ts`; registry `capabilities/ChatCapabilityRegistry.ts`; gate `tools/ga-gate/check-chat-capability-coverage.ts` | — |
| Structured attributes / brief | **EXISTS-AND-WIRED** | `ui/onboarding/BriefSchemaForm.ts`, `RACChatbotPanel.ts`, `typologyChoiceModel.ts`; SPEC-TYPOLOGY-BRIEF-SCHEMA | — |
| Direct manipulation | **EXISTS-AND-WIRED** | the editor's own tools | — |
| Parse to **objectives** (target area, preferred geometry, orientation, view priority) | **PARTIAL** | `ui/apartment-layout/briefToProgram.ts` carries `targetAreaM2` as an area **hint** | No objective vocabulary for geometry family, orientation preference or view priority |
| Output = **candidate envelopes** | **ABSENT** | — | see §7 |

### §7 — Multiple massing options

| Capability | Status | Where | What's missing |
|---|---|---|---|
| N candidate **massings** with reasons | **ABSENT** | — | There is no `MassingOption` type anywhere. "Massing" in this repo means *rendering a solid* (`engine/links/linkMassing.ts`, `ui/geospatial/formaMassingExtent.ts`, `ui/site/contextStudyMassingStyle.ts`) |
| N candidate **layouts** with reasons — the pattern to lift | **EXISTS-AND-WIRED** | `packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts:259 generateHouseLayoutOptions → ScoredHouseLayoutOption[]` (deterministic, deduped); apartment enumerator `workflows/apartmentLayout/tgl/enumerate.ts` (8 candidates, exact Pareto + weighted sum); reason payloads `LayoutLimitation` (`code`/`severity`/plain-language `text`) and `LayoutDeclineDiagnosis`; cards `ui/house-layout/houseCardModel.ts` + `HouseLayoutModal.ts`, `ui/apartment-layout/layoutCardModel.ts` (17 score axes + validation badge) | It runs **inside a shell**, on a floor plan. It has never been pointed at a parcel. |
| LLM 3-option fan-out | **EXISTS-BUT-UNWIRED** | `packages/ai-host/src/workflows/Generate3Options.ts` + `Generate3OptionsTypes.ts` (`OptionStyle = minimal\|efficient\|generous`, `GenerateOption.summary` = the reason). Its plugin shell `plugins/ai-generative/src/descriptor.ts` **says so itself at :17-19** — *"registers nothing"* | A registration |
| Geometry families I / L / U / irregular-L / non-90° | **ABSENT** | — | — |
| Per-option **explanation** | **PARTIAL** | The single envelope carries a rich `DerivationTrace` (per-constraint value · zone · source · `ordinanceRef`) — a *why* for one answer | No comparative *why this option rather than that one* |

### §8 — House requirements / the space library

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Room-type vocabulary | **EXISTS — three times over, unreconciled** | (a) generation: `packages/ai-host/src/workflows/apartmentLayout/types.ts:8 RoomType` (16 members; **no `office`, `laundry`, `garage`, `studio`**) + `rules/programRules.ts ROOM_RULES` (1112 lines: privacy class, acoustic role, frontage preference, door rules, furniture specs) + `dimensions/roomDimensions.ts ROOM_DIMENSIONS`. (b) BIM: `packages/room-topology/src/RoomTypes.ts RoomOccupancyType` (~55). (c) presets: `RoomSystemTypeStore.ts BUILT_IN_TYPES` — **30 presets with target area, min area, ceiling height, occupancy load, lux and a `spaceStandard` citation** | **A mapping layer between the three.** This is the reconciliation cost of §8. |
| Jurisdictional habitability minima | **EXISTS-AND-WIRED** | `workflows/apartmentLayout/rules/habitability/standards.ts` — `ES_MALAGA_PGOU_2018`, `ES_CATALUNYA_DECRET_141_2012`, `GB_ENG_NDSS_2015`, `PRYZM_BASELINE` | — |
| A brief/programme table with target areas + designed-vs-required deviation | **EXISTS-AND-WIRED — in the wrong place** | `apps/editor/src/ui/dataworkbench/ProgrammePanel.ts` (manual entry, CSV import/export, live comparison against `roomStore`, total GIA row) mounted at `DataWorkbench.ts:581` | It lives in the **Data Workbench**, i.e. *after* a BIM model exists. §8 wants it at the requirements stage, before anything is drawn. |
| A declared programme **template** type | **EXISTS-BUT-UNWIRED** | `packages/room-topology/src/RoomTypes.ts:431` — `ProgrammeRoomSpec { occupancyType, name, targetArea, minArea, quantity, adjacencies, mustBeOnLevel }` and `RoomProgrammeTemplate`. **Zero consumers repo-wide** (verified: the only two hits are the declaration itself) | Everything. This is an empty shell shaped exactly like §8. |
| Drag-and-drop spaces into the design environment | **ABSENT** | The working precedent to clone is `apps/editor/src/ui/furniture-carousel/FurnitureDragDropHandler.ts` — palette → `dataTransfer` → canvas raycast onto slab/floor plane → command dispatch, with a live drop indicator | A `SpaceDragDropHandler` and something for it to create |

### §9 — The relationship graph

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Graph model + projections | **EXISTS-AND-WIRED** | `packages/building-graph/` (`BuildingGraph`, `UBG_EDGE_TYPES` — a closed 10-member tuple, `projectHierarchy`, `focusNeighbourhood`, `roomRelationshipSentences`, `nodeRationale`, 5 adapters); `packages/spatial-index/src/RoomGraphService.ts` (`getConnectedRooms`, `getAdjacentRooms`, `findPath`); `packages/room-topology/src/RoomRelationshipService.ts` | — |
| Graph **rendered**, live-maintained | **EXISTS-AND-WIRED** | `ui/layout/AIAreaLayout.ts → installLiveGraphWiring.ts` → `engine/buildBuildingGraph.ts` + `engine/buildingGraphMaintainer.ts` (incremental, L-3251) + two overlays; Analysis F4 default dashboard widgets `relationship-graph` / `relationship-coverage` / `relationship-table` (`ui/analysis/widgetCatalogue.ts:156-219`), 3-D node-link viewport `ui/analysis/GraphViewport.ts`, read model `graphReadModel.ts` (`GRAPH_NODE_CAP = 320`, measured against a 100 ms budget) | — |
| Edit a node's **attributes** (area, occupancy) → regenerate | **EXISTS-AND-WIRED** | `ui/living-graph/LivingGraphOverlay.ts:1470-1740` → `ui/apartment-layout/activeRoomAreaOverrides.ts` / `activeRoomTypeOverrides.ts` → `gatherLayoutPayload.ts:137,150` → debounced `triggerApartmentLayout` (C52 E1/E2) | — |
| **Add** a relationship / move a room between storeys | **PARTIAL** | `ui/house-layout/HouseLayoutModal.ts:1058 addRoomAdjacency` (drag node onto node), `activeRoomFloorOverrides`, inline Area/Type/Floor/"Connect to" editor at `:1140-1260`, `_scheduleGraphEdit` → `HouseLayoutController._regenerateCurrent()` | Reachable **only inside the House Layout modal**, not in the main editor |
| **Remove** a room / remove a relationship / change priorities | **ABSENT** | — | C52 E3 (adjacency) and E4 are recorded as queued |
| Graph ⇄ plan ⇄ 3D synchronized | **PARTIAL** | graph → 3D works (see §3). Plan overlay: `ui/apartment-layout/layoutBubbleGraph.ts:347 buildPlanGraphOverlaySvg`, used by `ApartmentLayoutModal` + `HouseLayoutModal._storeyGraphs` | 3D → graph is missing; the plan overlay is **modal-preview only**, never on the live plan view |

### §10 — Generate spatial envelopes, not walls

| Capability | Status | Where | What's missing |
|---|---|---|---|
| A room object with polygon + area + volume + IFC identity | **EXISTS-AND-WIRED** | `packages/schemas/src/elements/Room.ts` (`boundary`, `area`, `volume`, `occupancy`, `boundingElementIds`, `levelId`); `room → IfcSpace` (`core-app-model/src/CoreElement.ts:96`); detection/derivation in `packages/room-topology/**`; commands in `plugins/rooms/src/**` | It is **wall-derived** (`boundaryMode: 'wallBound'`) or hand-sketched, and `multiLevelSpan` is pinned to `null` |
| A **level envelope** | **ABSENT** | — | — |
| A **room envelope** placed before walls exist | **ABSENT** | — | The central missing element family |
| Room volumes shown in 3D | **EXISTS-AND-WIRED — for a different purpose** | `ui/dataworkbench/DataVisualizerService.ts` — "Ghost Volumes": for every programme entry not yet met by model rooms, a semi-transparent purple LOD-100 box is drawn (`√targetArea` sided); plus 4 heatmap modes (sync-state, occupancy, compliance, **area-delta**) | The boxes are unplaced placeholders in the Data Workbench, not a spatial model |
| Boundaries in plan, names, areas, colour-coded categories | **EXISTS-AND-WIRED** | `packages/room-topology/src/{RoomColourSystem,RoomLabelRenderer}.ts`; `engine/views/plan-canvas/PlanViewFillRenderer.ts` | — |

### §11 — Fully editable layout, neighbours adapt

| Capability | Status | Where | What's missing |
|---|---|---|---|
| **Move → Replace → Recompute** (the behaviour §11 names) | **EXISTS-AND-WIRED — for walls** | Pure engine `packages/geometry-wall/src/WallMoveReweld.ts` (`computeMoveReweld`, `computeMoveReweldPlan`, `computeMoveReweldCensus`, `moveRefusalGround: IMPOSSIBLE\|INCUMBENT`); dispatcher `WallMoveReweldService.ts` (one `CascadeWallBaselineCommand`, cause `'move-reweld'`); wired `engine/engineLauncher.ts:992` + a curtain-wall sibling at `:1036`; neighbours adapted by `JunctionResolverV2`, `WallJoinResolver`, `SlabWallCoupling`, `OpeningCleanupHandler` | It re-welds **walls**. There is no room-envelope subject for it to act on. |
| Resize a room → neighbours adapt | **PARTIAL** | area override → whole-layout regenerate (§9) | Not a local, incremental adaptation |

### §12 — Direct 3D profile editing

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Edit Profile (move / create / delete vertices) | **EXISTS-AND-WIRED, and already generic by port** | Meaning: `packages/geometry-wall/src/WallProfile.ts`. **Port**: `packages/geometry-wall/src/WallProfileEditor.ts` — `WallProfileEditorPort`, `WallProfileEditorSubject`, `wallProfileEditorSnap`. UI: `apps/editor/src/ui/WallProfileEditor.ts`. **Shared drawing surface, deliberately extracted so it is not wall-bound**: `apps/editor/src/ui/ElevationOutlineSurface.ts` (modes `select\|polyline\|arc`), also reused by `ui/component/ComponentProfilePanel.ts`. Invocation: `ui/ContextualEditBar.ts:1496-1533 _profileEditToolFor(type)` — the one resolver — over `{slab, floor, ceiling, wall}` gated on `enterProfileEditMode`; `P` shortcut excludes wall; double-click is **slab only** (`engine/initUI.ts:2863`) | **Windows have no Edit Profile** (openings are shaped non-interactively via `OpeningProfile.ts`), and there is no envelope subject |
| Editing a LEVEL envelope → rooms inside adapt / a ROOM stays inside its level | **ABSENT** | — | Requires the element family from §10 plus a containment constraint |

### §13 — One living design system

| Capability | Status | Where | What's missing |
|---|---|---|---|
| planning ↔ 3D ↔ plan | **EXISTS-AND-WIRED** | `siteDispatch` on `site.parcel-boundary-set`; C59 multi-pane | — |
| quantities recompute | **EXISTS-AND-WIRED** | `packages/core-app-model/src/quantities/QuantityTakeoff.ts computeTakeoff` (memoised at `ui/analysis/analysisReadModel.ts:78`); GFA authority `ui/site/designMeasurement.ts measureAuthoredDesign` — per-level plate sums, and it **refuses** (`overlapping-floor-plates`, `unattributed-floor-plate`, `no-floor-plates`) rather than guessing | Per-level GFA is computed but only the **total** crosses into the model that reaches the panel |
| compliance recompute | **EXISTS-AND-WIRED** | `packages/site-parcel-data/src/capacityComparison.ts:174 buildCapacityComparison` → `ui/site/capacityPanelSection.ts` → `ui/site/envelopeCardSections.ts:97 buildDesignedVsPermittedFold` → `GISAreaLayout.ts:3150-3178` | — |
| cost recompute | **PARTIAL** | see §15 | Cost is only reachable after a take-off exists |
| "room 18 → 25 m²" full cascade | **PARTIAL** | works through the apartment/house regenerate path | Not a general edit on a general spatial model |

### §14 — Show data continuously

| Capability | Status | Where | What's missing |
|---|---|---|---|
| The evolving panel | **EXISTS-AND-WIRED** | `ui/site/envelopeCardSections.ts` — four first-class, default-collapsed folds: *Designed vs permitted* · *How these were measured* · *Full site & massing data* · *Why these numbers?* — each with distinct `data-state` arms so a **failed** measurement never renders as an **empty** one | Per-level GFA · room areas · cost · net vs gross — and the panel does not yet change with a **stage** |
| "What am I allowed / what am I proposing / what remains / what am I approaching" | **PARTIAL** | three of the four are answered for an authored model | *What am I proposing* has no pre-BIM subject |

### §15 — Cost at the envelope stage

| Capability | Status | Where | What's missing |
|---|---|---|---|
| A cited, regional €/m² building-cost module | **EXISTS-AND-WIRED — but only after a BIM model exists** | `packages/core-app-model/src/quantities/RegionalBuildingCost.ts` — `RegionalBuildingCostModel`, `ES_BARCELONA_ICIO_2026` (10 groups, basic module 866.04 €/m², corrections, `notCovered`, full `provenance`), `resolveBuildingCostModels` (jurisdiction→region→country ladder, **no interpolation**, refusal arms `not-asked` / `ambiguous` / no-cover), `estimateBuildingCost` (returns `null` — never a zero — without a typology or an area, and generates its own `statement`). Jurisdiction binding: `ui/dataworkbench/buckets/resolveCostJurisdiction.ts currentCostJurisdiction()` (reads `getCurrentSiteOrigin()`). Only caller: `ui/dataworkbench/buckets/MedicionesBucket.ts:727`, fed by `measuredBuiltArea(takeoff)` | **This is the reachability gap.** The area it multiplies is a take-off proxy, so the figure only appears once slabs are modelled — i.e. exactly when an *indicative* number is no longer needed. §15 wants it at the envelope stage. **Closed by this lane — see §7.** |
| Per-line rate books | **PARTIAL** | `RegionalRates.ts:341` — `REGIONAL_RATE_BOOKS = Object.freeze([])`. PRYZM ships **no** per-line rate book for anywhere; user books are `localStorage`-only (`MedicionesBucket.ts:69-118`) and snapshot-synced (`engine/persistence/rateBookSnapshotSync.ts`) | Data, not code |

### §16 — Envelope → BIM

| Capability | Status | Where | What's missing |
|---|---|---|---|
| A "Create house" conversion from validated envelopes | **ABSENT** | Nothing named `envelopeToBim` / `generateFromMassing` / `createHouse` exists | — |
| **Footprint** → BIM (the closest shipped thing) | **EXISTS-AND-WIRED** | `ui/house-layout/houseFromBoundary.ts:85 generateHouseFromBoundary` (one `wall.create` per footprint edge → `waitForShell` → `HouseLayoutController` → `HouseLayoutExecutor.ts:1358`, one batch = one undo); siblings `residential-building/residentialFromBoundary.ts`, `apartment-layout/apartmentFromBoundary.ts`, `office-building/OfficeBuildingExecutor.ts`; dispatcher `ui/generation/generationRequest.ts` | — |
| The envelope's contribution to generation | **PARTIAL** | exactly two things: `ui/site/siteDispatch.ts:1044 resolveBuildableFootprint` (envelope-first, parcel fallback, "compliant by construction") and `packages/site-parcel-data/src/storeyCap.ts capStoreysToEnvelope` (`OnboardingStepController.ts:3841`) | The envelope's **3-D form** — setbacks, tiers, `GeometricRule` — never reaches geometry |
| One generation = one undo | **EXISTS-AND-WIRED, with a trap** | Bought only by dispatching **one `*.batch.create`** (C16 §8.6 B-6). ⚠ `batchCoordinator.runBatch` is the event/render bracket and is **undo-NEUTRAL** — N commands inside it are N undo entries (`ZeroTokenChatBridge.ts:22-25`) | — |

### §17 — Detailed AI/RAC design after creation

| Capability | Status | Where | What's missing |
|---|---|---|---|
| NL → element creation against the existing model | **EXISTS-AND-WIRED** | the §6 chain; opening families `packages/ai-host/src/intents/{OpeningShapeFamilies,DimensionFamilies,CatalogueFamilies}.ts` | — |
| Scope by **room** and by **compass direction** ("the south-facing living-room wall") | **EXISTS-AND-WIRED** | `packages/ai-host/src/intents/FilterScope.ts` (composition with level/room/orientation) and `HostedOpeningScope.ts` — built from the founder's own *"make all windows in the south facade 0.1 m sill"*; compass math delegated to `FacadeOrientationMath.orientationFromNormal`, and an opening whose host wall is gone is **UNKNOWN, not "not south"** | — |
| Furniture / kitchen / bedroom layouts | **EXISTS-AND-WIRED** | `workflows/furnishLayout/`, SPEC-KITCHEN-WARDROBE-WALL-DRIVEN, SPEC-FURNITURE-LAYOUT-ENGINE, `ui/furniture-carousel/**` | — |
| "Doors connecting rooms per the relationship graph" | **PARTIAL** | `workflows/apartmentLayout/tgl/wallsAndDoors.ts` does exactly this **inside a generation** | Not a standalone verb over an existing model |

### §18 — Compliance always visible

| Capability | Status | Where | What's missing |
|---|---|---|---|
| Design vs law, per metric, with status | **EXISTS-AND-WIRED** | `buildCapacityComparison` → rows for footprint / GFA / net area / height / floors, each `within` \| `at-limit` \| `over` \| `unknown` \| `no-limit`; verdict headline lifted into the collapsed `<summary>` so a user who never unfolds cannot mistake *"not enough to judge"* for a pass | — |
| Uncertain / unavailable regulatory information stated | **EXISTS-AND-WIRED** | `NOT_DERIVED`, `UNMEASURED_REASON_TEXT`, `EnvelopeRefusal.legallyGrounded`, `HEIGHT_DATUM_CAVEAT` (*the ordinance measures from the rasant at the façade; we measure from the project datum*) | — |
| Explain-why report | **EXISTS-AND-WIRED** | `packages/site-parcel-data/src/complianceReport.ts buildComplianceReport` → the "Why these numbers?" fold, `GISAreaLayout.ts:3400`; headline can never read stronger than its weakest row (`resolveHeadlineProvenance`) | **No exporter** — nothing in `packages/pdf-export` consumes it. Screen-only. |
| An empty project never reads as compliant | **EXISTS-AND-WIRED** | `designMeasurement.ts:50` — an empty model measures `null`, **not `0`**, because *"0 m² against a 500 m² ceiling would render as a PASS on a project with no building in it"* | — |

### §19–§23 — UX, restraint, structure, agent behaviour

| Capability | Status | Where | What's missing |
|---|---|---|---|
| §19 "Where am I / what can I do" | **PARTIAL** | the SiteEntry stage machine + panel, for world→parcel only | A design-stage machine (see §1) |
| §20 Generate → Explain → Compare → Edit → Recompute → Confirm | **PARTIAL** | The House and Apartment modals are exactly this shape (variant cards, score bars, inline edit, regenerate, then commit) | The onboarding path is Generate → Done |
| §21 LEFT 3D / RIGHT panel, switchable views | **EXISTS-AND-WIRED** | C59 multi-pane (`SPEC-MULTI-PANE-VIEW-SYSTEM`); the 3-segment switcher `'2D' 3D+plan · '3D' globe · 'forma' 3D Site`; right rail with a parcel slot and an envelope slot (`PARCEL_RAIL_ENVELOPE_SLOT_TESTID`), plus a rehost rule so the GIS panel wins when it is on screen | The right panel does not yet change with a stage |
| §22 Refuse rather than guess; one gesture = one undo; capability control plane | **EXISTS-AND-WIRED** | C67 RAC capability control plane, `chatUnavailableReason` / `CHAT_UNAVAILABLE`, `ConsequencePlan` / `capabilityRefused` / `undeterminedOutcome` in `packages/command-bus/src/consequence.ts` | "Smallest useful change" and "ask for the next meaningful decision" are not encoded anywhere |

---

## §2 — Governance map (read these before building a stage)

| Spec § | Binding contract / spec | Note |
|---|---|---|
| §2, §18 | **C57** parcel data · **C58** zoning & buildable envelope (§1.3 explain-why, §1.4 credibility) · **C62** data confidence & provenance · **C63** city completion · **C74** constraint honesty · **C75** provenance | The regulatory-vs-study discipline is **already ratified**. Extend it; never mint a rival vocabulary. |
| §3, §21 | **C59** multi-pane · **C06** §13.3 (one producer per card) | |
| §4 | **C21** climate ingestion · ADR-0074 (still `Proposed` while the feature ships — a governance gap worth closing) · **C55** geodata analytical layers | |
| §5, §7 | **C58** · **C64** envelope compiler · `SPEC-BUILDABLE-ENVELOPE-UX` · `SPEC-COMPLIANCE-REPORT` | |
| §6, §17, §22 | **C16** command authoring (§8.6 B-6 one-undo) · **C67** RAC capability control plane · **C68** element chat onboarding · **C69** verb register | Any new verb joins C69 the day it exists |
| §8, §9 | **C52** editable building graph (E3/E4 queued) · **C71** graph & topology · **C78** universal relationship · `SPEC-LIVING-BUILDING-GRAPH` · `SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR` · `SPEC-DYNAMIC-PROGRAM-CANVAS` + ADR-0069 | ADR-0069 already decides that a program canvas is the authoring surface |
| §10, §11, §12 | **C84** element integrity + **C94** element: room/space — **mandatory** for a new spatial element family · **C11** creation pipeline · **C65** element type system · **C83** spatial validity | A room-envelope family is a C84 §6 twelve-section obligation, not a feature |
| §13 | **C72** propagation & prevState · **C78** consequence lifecycle | |
| §15 | **C38** cost/5D | |
| §16 | **C80** generation authority (*a generator may not destroy what it cannot account for*) · **C81** edit & intent preservation · **C53** generative layout architecture · **C50** typology pipeline | |

---

## §3 — The §13 synchronization contract (what recomputes when what changes)

This is the dependency graph the "one living design system" claim rests on. **Solid arrows are
wired today; dashed arrows are the ones this plan has to build.** Naming it explicitly is the
point: an unnamed recompute edge is how a panel ends up showing a number from two edits ago.

```
                                     ┌──────────────────────────────┐
    site.parcel-boundary-set ───────►│ computeBuildableEnvelope      │  (C58)
    (C19, one-shot immutable)        │  → BuildableEnvelope          │
                                     └───────────┬──────────────────┘
                                                 │
             ┌───────────────────────────────────┼─────────────────────────────┐
             ▼                                   ▼                             ▼
   ┌───────────────────┐            ┌──────────────────────┐        ┌────────────────────┐
   │ envelopeToMassing │            │ buildComplianceReport│        │ envelope card rows │
   │  → 3D solids      │            │  → "why these numbers"│       │  (§2 / §14)        │
   │ THREE + Cesium    │            └──────────────────────┘        └────────────────────┘
   └───────────────────┘

   USER STUDY INPUT (typed height, §MANUALENV159) ──► buildUserSuppliedStudyEnvelope
        └─► contextDerivedStudyEnvelopeState (session)  +  userSuppliedStudyHeightState (project)
             └─► card re-render + study massing re-draw          [WIRED]

   ┄┄ TARGET GROUND-FLOOR AREA (§5) ┄┄► solve inset → proposed envelope ┄┄► same two sinks   [TO BUILD]

   ┄┄ MASSING OPTIONS (§6/§7) ┄┄► MassingOption[] + reasons ┄┄► option cards ┄┄► pick one    [TO BUILD]
                                        ▲
                                        │ inputs, ALL of which already exist:
                                        │  FacadeOrientationService (orientation)
                                        │  contextBuildings ResolvedContextHeight (neighbours)
                                        │  neighbourFootprintStore → resolveBlindFacades (privacy)
                                        │  parcelEdgeClassification (frontage/access)
                                        │  solar-analysis accumulateSunHours (sun)
                                        │  BuildableEnvelope (the hard constraint)

   ┄┄ LEVEL + ROOM ENVELOPES (§10) ┄┄┐
                                     ├┄► plan boundaries ┄┄► 3D volumes ┄┄► relationship graph
   ┄┄ RELATIONSHIP GRAPH (§9) ┄┄┄┄┄┄┘                                          [PARTIAL/TO BUILD]

   AUTHORED MODEL (walls/slabs/rooms)
        │
        ├─► collectAuthoredModelSnapshot ─► measureAuthoredDesign ─► DesignMeasurement   [WIRED]
        │        (per-level plate sums; REFUSES on overlap/unattributed/none)
        │
        ├─► buildCapacityComparison(envelope, design) ─► Designed vs permitted fold      [WIRED]
        │
        └─► computeTakeoff ─► measuredBuiltArea ─► estimateBuildingCost ─► 5D panel      [WIRED]
                                     ▲
   ┄┄ ENVELOPE-STAGE GFA ┄┄┄┄┄┄┄┄┄┄┄┘  the same estimator, one stage earlier        [BUILT — §7]
```

**The five recompute rules the orchestrator must honour, stated so they can be tested:**

| # | When this changes | These must recompute, in this order | Enforced today by |
|---|---|---|---|
| R1 | the committed parcel boundary | envelope → massing solids → every card fold → any study envelope is **invalidated, not carried** | `siteDispatch` on `site.parcel-boundary-set` |
| R2 | a user study parameter (height, and later target area) | study envelope → session slot → card + 3D | `applyUserSuppliedStudyHeight` |
| R3 | any authored element | `DesignMeasurement` → `CapacityComparison` → the Designed-vs-permitted fold → (new) the cost fold | `GISAreaLayout.refreshEnvelopePanel` |
| R4 | a room's area or type in the graph | override store → layout regenerate → plan + 3D + graph | `activeRoomAreaOverrides` → `triggerApartmentLayout` |
| R5 | a chosen massing option | proposed envelope → GFA → compliance → cost → (later) level envelopes | **nothing — this edge does not exist yet** |

⚠ **The rule that must not be broken while building R5**: a *failure* to recompute and an
*emptiness* must never render as the same value. That is `§CONTEXT-DATA-HONESTY`, it is why
`designMeasurement.ts` has an `UnmeasuredReason` union rather than nullable numbers, and it is the
single most-repeated defect in this repo's history.

---

## §4 — The staged plan, ordered by (value × cheapness)

Each stage names **what it wires** (existing) versus **what it needs** (new).

### Stage A — The design-stage machine · *cheap · unlocks §1 §14 §19 §21*
- **Wires**: `siteEntryModel.ts`'s reducer + `describeSiteEntryPanel` + `SiteEntryPanel`'s
  disable-or-explain pattern; the existing right-rail slots.
- **Needs**: a `DesignStage` union (`parcel → law → potential → massing → requirements → layout →
  bim → detail`) with a pure reducer, a `describeDesignStagePanel()` that returns which controls
  are live and **why each dead one is dead**, and a stage breadcrumb. No geometry, no new store
  beyond a session slot.
- **Why first**: every later stage needs somewhere to put its controls, and §19's four questions
  are answered by this artefact alone.

### Stage B — Indicative cost at the envelope stage · *cheap · closes §15* — **DONE, see §7**

### Stage C — Number → geometry highlight · *cheap-medium · closes §3*
- **Wires**: `EnvelopeTier.id` (already in the schema), `envelopeToMassing`'s per-tier solids,
  the dead `pryzm-highlight-elements` event, `ParcelBoundarySceneRenderer`, `CesiumViewport`.
- **Needs**: `data-constraint` / `data-tier-id` attributes emitted by the card's `row()` builder; a
  `site.highlight` intent; one subscriber per renderer that raises emphasis on the named solid and
  clears on blur. **A row with no geometry to point at must render as un-clickable, not as a click
  that does nothing.**

### Stage D — Proposed ground-floor envelope from a target area · *cheap-medium · closes §5*
- **Wires**: `buildUserSuppliedStudyEnvelope`, `insetPolygonPerEdge`, the study session slot, the
  project-persisted decision, the existing study massing render, `buildStudyHeightEntryHtml`'s
  form pattern.
- **Needs**: a bisection over uniform setback to hit a target inset area (pure, ~60 lines); a
  target-area entry beside the height entry; and a **refusal that prints both numbers** when the
  target exceeds the permitted footprint (the founder's hard-stopper doctrine).

### Stage E — Massing options with reasons · *medium-large · closes §6 §7, and it is the first real engine*
- **Wires**: `FacadeOrientationService`, `ResolvedContextHeight` + `contextHeightConfidence`,
  `neighbourFootprintStore` → `resolveBlindFacades`, `parcelEdgeClassificationDetermination`,
  `accumulateSunHours`, the `BuildableEnvelope` as the hard constraint, and — critically — the
  **presentation pattern** already proven at the floor-plan layer: `ScoredHouseLayoutOption`,
  `LayoutLimitation` (coded reason + severity + plain-language text), `LayoutDeclineDiagnosis`,
  and the score-bar cards in `houseCardModel.ts` / `layoutCardModel.ts`.
- **Needs**: a `MassingOption` model (footprint family I/L/U/irregular, per-option objective
  vector, per-option **reasons**), a deterministic enumerator over the inset polygon, and an option
  card rail. Deterministic and Pareto-ranked like `tgl/enumerate.ts` — **not** an LLM fan-out.
- **Risk**: this is where a plausible-looking wrong answer is cheapest to produce. Every option
  must carry the constraint it was solved against, and an option that violates the envelope must
  be **refused with its number**, never clamped silently.

### Stage F — Requirements at the requirements stage · *medium · closes §8*
- **Wires**: `RoomSystemTypeStore.BUILT_IN_TYPES` (30 presets with target areas and standards
  citations), `ProgrammePanel`'s brief-vs-model table, `DataVisualizerService`'s ghost volumes,
  `FurnitureDragDropHandler` as the DnD precedent, and the dead `RoomProgrammeTemplate` /
  `ProgrammeRoomSpec` types — which are shaped exactly right.
- **Needs**: **a mapping module between the three room vocabularies** (`RoomType` 16 ·
  `RoomOccupancyType` ~55 · `RoomSystemType` 30) — this is the real cost, and it must be a
  *declared, tested table with an explicit "no mapping" arm*, never a name-similarity heuristic;
  a space palette; and hosting the programme at the requirements stage rather than in the Data
  Workbench. `RoomType` is also missing `office`, `laundry`, `garage`, `studio`.

### Stage G — Level + room envelopes as a first-class family · *large · closes §10 §11 §12*
- **Wires**: `ElevationOutlineSurface` + `WallProfileEditorPort` (§12's editor is already generic
  by construction), `WallMoveReweld`'s cascade shape, `RoomColourSystem` / `RoomLabelRenderer` /
  `PlanViewFillRenderer`, the UBG and its adapters, `roomFromGraphSpec.ts` (engine spec → RoomData,
  the graph-authoritative construction that already exists).
- **Needs**: a new element family. **C84 §6's twelve mandatory sections apply, plus a C94 sibling.**
  A containment constraint (room ⊂ level ⊂ envelope). A profile-edit subject. A local adaptation
  rule for neighbours.
- **Risk**: this is the largest item in the plan and the one most likely to be under-estimated. It
  is not "add a box"; it is an element family with lifecycle, persistence, undo, IFC identity,
  selection, and propagation obligations.

### Stage H — Envelope → BIM ("Create house") · *medium, but only after G* · closes §16
- **Wires**: `generateHouseFromBoundary`, `HouseLayoutExecutor`'s single-batch one-undo,
  `resolveBuildableFootprint`, `capStoreysToEnvelope`, `roomFromGraphSpec`.
- **Needs**: the room envelopes as the program input, and C80's authority question answered per
  element (*may this pass replace this?* — and "we do not know" is not permission).

### Stage I — View quality · *research · closes the §4/§7 view axis*
- **Wires**: `contextWater.ts buildSeaMaskFromCoastline` (the datum exists and nothing uses it),
  `facadeValueField.ts` (which already declares `viewQualityField` as its queued sibling),
  the solar occluder BVH (`buildOccluderIndex`) — a viewshed is the same ray problem as shadowing.
- **Needs**: a sightline/viewshed metric and a defensible definition of "open view".
- **Risk**: this is the only genuine research problem in the spec. Everything else is engineering.

---

## §5 — The smallest vertical slice

**The goal**: the founder opens a real Barcelona parcel and feels the whole idea, end to end, with
**no BIM generation and no new element family**.

```
  Parcel  →  Law (cited)  →  Potential  →  a PROPOSED envelope you typed  →  cost + compliance
     ▲            ▲              ▲                      ▲                          ▲
   WIRED        WIRED          WIRED               Stage D (new)              Stage B (done)
                  └───── Stage C: click a number, the geometry lights up ─────┘
                                    all held together by Stage A's breadcrumb
```

**Slice-1 = Stages A + B + C + D.** Every one of them is cheap, none needs a new element family,
none touches the renderer's internals, and together they demonstrate: *understandable · visual ·
data-driven · explainable · editable · compliant · human-controlled* — seven of §23's eight words.

**What slice-1 deliberately omits, and why**: massing **options** (Stage E) is the eighth word
("explore meaningful alternatives") and it is the first item that needs a new engine rather than a
new wire. It should be slice-2, on its own, with its own acceptance run — because an options
generator that produces plausible-but-wrong alternatives is worse than no options generator, and
that risk deserves an undivided lane.

**Acceptance for slice-1** (the shape `SPEC-BUILDABLE-ENVELOPE-UX` §5 already uses): on a live
Barcelona parcel — the breadcrumb says which stage you are in and why the next one is not
available yet; clicking *Max height* lights the vertical limit and clicking *Max footprint* lights
the inset ring; typing "120 m²" produces a proposed ground-floor envelope drawn inside the
permitted one, or a refusal naming **both** numbers; and the panel shows an indicative cost that
says, in its own words, that it is an estimate and what it excludes.

---

## §6 — Honest risk register

| # | Risk | Kind | Mitigation |
|---|---|---|---|
| 1 | **Stage G (room envelopes) is the whole plan's centre of mass** and is easy to under-scope. It is a C84 element family, not a box. | Engineering, large | Do not start it inside another lane. Write the C84 §6 twelve sections and a C94 sibling first. |
| 2 | **Stage E can produce confident wrong answers.** An option that looks reasoned but was clamped to fit is the exact defect `confident-register-rows-are-the-wrong-ones` records. | Engineering + judgement | Every option carries the constraint it was solved against; violations are refused with numbers, never clamped. Deterministic, not LLM. |
| 3 | **Three room vocabularies** with no mapping. Any heuristic mapping is a defect factory. | Engineering, medium | An explicit table with a "no mapping" arm, unit-pinned. |
| 4 | **View analysis has no data pipeline.** | Research | Ship the sea-mask-derived metric only, badged as what it is; do not claim "open view" until a viewshed exists. |
| 5 | **Cost data, not cost code.** `REGIONAL_RATE_BOOKS = []` and exactly one building-cost module (Barcelona) ships. Outside Barcelona the honest answer is a refusal. | Data sourcing | The refusal is already written and cited. Widening coverage is a sourcing lane. |
| 6 | **The TypologyPipeline is bypassed.** `router.dispatch` has zero production callers and all four pack generative stages are bridge stubs; real generation runs through `ai-host` workflows. Building the orchestrator "on the pipeline" would build on something nothing uses. | Architecture | Build against the `ai-host` workflows that actually run, and treat C50 reconciliation as its own decision. |
| 7 | **`runBatch` is undo-NEUTRAL.** Any new multi-element pass that assumes it buys one undo will ship N undo entries. | Trap | One gesture = one `*.batch.create` (C16 §8.6 B-6). |
| 8 | **Two surfaces already compute overlapping facts** (parcel perimeter in two places; GFA as a render-time derivation). Adding a third producer per fact is how a card and a panel disagree. | Discipline | C06 §13.3 — one producer, many renderers. |
| 9 | **ADR-0074 is still `Proposed`** while the solar feature ships. | Governance | Close it or record why not. |
| 10 | Compliance is **screen-only** — no exporter. §18's audience will ask for a PDF. | Gap | `buildComplianceReport` is pure and already returns rows; an exporter is small, and it is not on the critical path for slice-1. |

---

## §7 — What this lane actually changed

Lane RESI-ORCHESTRATOR, 2026-09-03. **No commit was made** (the working tree is shared with other
lanes). Files written:

1. `docs/01-strategy/STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md` — the founder's spec, captured.
2. `docs/03-execution/plans/RESI-ORCHESTRATOR-PLAN.md` — this document.
3. **Stage B implemented** — §15's indicative cost, moved from "after a BIM model exists" to the
   envelope stage:
   - `packages/core-app-model/src/quantities/RegionalBuildingCost.ts` — `MeasuredBuiltArea.proxy`
     gains `'envelope-study-gfa'`. The proxy field's whole purpose is that *the area used is named,
     not hidden*; an envelope-derived GFA is a fourth named proxy, carrying its own `basis` and
     `caveat`, so the estimator's own statement tells the reader what was multiplied.
   - `apps/editor/src/ui/dataworkbench/buckets/buildingTypologyChoice.ts` — the per-project
     building-typology choice, **extracted** from `MedicionesBucket` so the envelope card and the
     5D panel read one store rather than two.
   - `apps/editor/src/ui/site/envelopeCostSection.ts` — a pure renderer for the envelope-stage
     cost fold, with an arm per refusal state.
   - `apps/editor/src/ui/site/__tests__/envelopeCostSection.spec.ts` — the arms, pinned.
   - `apps/editor/src/ui/layout/GISAreaLayout.ts` — the fold mounted and its typology select wired.

---

## §8 — Re-measure 2026-09-05 (after the founder's second transmission, STR §24)

**Read this before §0 — §0 is the 2026-09-03 reading and is now stale in the direction of
under-reporting.** Measured against `git log` and the deployed build `832dc937` (built
2026-09-05T07:31Z, the build the founder's screenshots came from).

### §8.1 — Shipped between the two transmissions

| Stage (§4) | What landed | Commit | Reachable in the card host? |
|---|---|---|---|
| A — design-stage machine | `designStageModel.ts` reducer, `designStagePanel.ts`, the strip (`designStageStripControl.ts`), every unavailable arm carries its reason | `28df89be` | yes — `GISAreaLayout.ts` imports `wireDesignStageStrip` |
| B — cost at the envelope stage | (already in §7) | `2ddfb560` | yes |
| C — number → geometry highlight | `siteHighlightRowControl.ts` (rows carry the constraint id; the control lifts emphasis on the named solid) | `28df89be` | yes — `wireSiteHighlightRows` |
| D — target ground-floor area → proposed plate | `targetFootprintAreaSolver.ts` (bisection over uniform setback, refuses with both numbers), `targetFootprintAreaState.ts`, per-level channel | `2197a2de` | yes — the "Fit this on the ground floor" control is on the founder's screenshot |
| G (first third) — the envelope as an element | **C114 minted**; `@pryzm/plugin-space-envelope` (create / mutate / batch, undo through the generic adapter), L0 record, `intendedAreaChannel.ts` (INTENDED beside BUILT, never summed), `adoptProposalAsEnvelope.ts` (Stage D's plate becomes a `level` envelope) | `56647dcf` · `28df89be` | plugin registered (`PluginRegistry.ts`), store keyed `spaceEnvelope` in `composeRuntime` — **but see L-12916** |
| G (render) — the prism drawn, faces draggable | `SpaceEnvelopeMeshBuilder.ts` (n+2 pickable faces), `spaceEnvelopeFaceDragController.ts` (each face along its own perpendicular), `attachSpaceEnvelopeRender.ts` off `Store.subscribeDirty` so execute/undo/redo share one channel | `678e744f` | wired in `initTools.ts` behind a LOUD reachability guard; **no plan symbol yet** (the file says so) |
| E — massing options | `massingOptionModel.ts` — **deliberately narrowed**: four coverage fractions of the permitted plate, each with storeys / GFA / limitations. The I / L / U / non-90° families are **NOT solved** and `MASSING_FAMILIES_NOT_YET_SOLVED` says so in product words | `28df89be` | yes — "Massing options" fold |

So of §0's "one theme, not eleven": item 2 (no room ENVELOPE) is **half closed** — the level
envelope exists as an element with a render and a face gizmo; the room envelope, the containment
constraint (room ⊂ level ⊂ permitted) and the profile-edit subject are still owed. Items 1
(massing families) and 3 (envelope → BIM) are unchanged.

### §8.2 — The two defects the founder's screenshots expose

- **L-12915 — the Parcel Law tab does not exist.** `ANALYSIS_TABS` (`ui/analysis/AnalysisTypes.ts`)
  has four tabs — overview · quantities · relationships · areas — and **no widget in
  `widgetCatalogue.ts` reads the site, the parcel or the envelope**. The whole §2/§5/§14 panel is
  reachable only from the left rail and the GIS layout. §21's "LEFT 3D / RIGHT panel" was read as
  EXISTS-AND-WIRED in §1 because the GIS layout has that shape; the founder has now said WHICH
  surface he means, and it is the Analysis surface. Its left pane is the BIM 3D view only; the
  plan · 3D · 3D Site · 3D Globe switcher (`activeSegment`, `GISAreaLayout.ts`) is not available
  there.
- **L-12916 — the envelope does not render (two causes, both measured in source, neither yet
  in a browser).** (a) The card's INTENDED-area fold reads
  `runtime?.stores?.spaceEnvelope` from the `runtime` prop, which is **null by design on the live
  boot path** (`createMainLayout(props, null)`, recorded at `GISAreaLayout.ts:697`); the commit
  path three screens up resolves `runtime ?? window.runtime` and this read did not — so the fold
  prints its `unreadable` arm, "Intended area — unavailable", on every live session, which is
  exactly the founder's screenshot. (b) The permitted envelope in Dubai is ESTIMATED with an
  upper-bound footprint, and `envelopeToMassing` draws upper-bound / open-top solids at
  `UPPER_BOUND_FILL_ALPHA = 0.06` against `SOLID_FILL_ALPHA = 0.34` — the near-wireframe prism in
  the screenshot IS the envelope. Honest, and illegible.

### §8.3 — The stage this adds

**Stage J — the PARCEL LAW tab · closes STR §24.1 items 1–3 · medium.**
- **Wires** (nothing re-derived — C19 §5.6 clause 1 is binding): `mountParcelSection` (the
  cadastral half, a mount-per-host builder), `window.pryzmMountEnvelopeCard(host)` (the envelope
  half — a **re-homed singleton**, so the tab claims it only while it is the active tab and
  never releases it on dispose, C19 §5.7), `wireDesignStageStrip`, and the four-view switcher
  lifted out of `GISAreaLayout` into a shared control the Analysis surface can host.
- **Needs**: a fifth `AnalysisTabId` (`'parcel-law'`) with its lede; a widget-less tab body
  that hosts the three producers; the left-pane view switcher; and the legibility rule for
  provisional / upper-bound envelopes (a fill the eye can see, the badge and hue unchanged).
- **Order**: after L-12916 (a) — a tab that hosts a fold reading `null` would ship the same
  "unavailable" one surface to the right.

### §8.4 — Not measured here

Whether `attachSpaceEnvelopeRender` actually mounts on the deployed build (its guard logs
`runtime.stores.spaceEnvelope is not reachable` when it does not) — a browser console reading is
owed; and whether the tab reads well at 6 s while the envelope is RESOLVING (C19 §5.8).
