# RAC Capability-Parity Inventory — UI ⇄ Commands ⇄ Chat

**Status: living audit.** First compiled 2026-08-10 (RAC master follow-up session).
Decisions arising from this audit are recorded in **ADR-0314** (successor to ADR-0313);
this file is the evidence base: what the editor's UI actually lets a user do, what the
command surface actually executes, and where chat parity stands. Every row cites the
handler code that was read — nothing here is inferred from filenames.

Companion docs: `docs/02-decisions/adrs/ADR-0313-zero-token-chat-command-resolver.md`
(the resolver architecture this audits against), `packages/ai-host/src/capabilities/`
(registry + classification), `tools/ga-gate/check-chat-capability-coverage.ts` (gate 31).

---

## 0. Headline findings

1. **Two competing property surfaces.** The schema-driven PropertyPanel
   (`apps/editor/src/ui/property-panel/`) commits via ONE generic
   `element.updateParameters`; the legacy PropertyInspector
   (`apps/editor/src/ui/property-inspector/`) commits via per-kind commands
   (`wall.updateDimensions`, `window.setSize`, …). **The same user intent dispatches
   different commands depending on which panel is open.** Chat capabilities must pick
   the per-route proven path (they do — `commandProof` per route).
2. **`batchCoordinator.runBatch` is NOT one undo unit.** It is an event/geometry-storm
   gate only (`BatchCoordinator.ts:231-236`, "Undo/Redo Impact: No"; measured by
   `apps/editor/__tests__/batchNestingUndo.test.ts`). The chat bridge's header claimed
   otherwise — corrected this session. One-undo composition exists as (a) one batch
   command with one Immer produce, or (b) `CompositeCommand` +
   `beginGenerationBatch`/`endGenerationBatch` — which live on the **legacy
   CommandManager**, not the bus. **There is no bus-side composite/one-undo primitive**
   (GAP D, see §6).
3. **Wall colour was a GAP C, not a GAP A.** `wall.bulkSetVisuals` has the perfect
   batch shape but `produceCommand`s the plugin's DETACHED DTO store
   (§FIX-MATERIAL-DEAD-DISPATCH, `MaterialDispatch.ts:76-108`) — nothing that renders,
   exports or persists reads it, and it has **zero call sites**. The live route is
   single-wall `wall.updateColor` → geometry `wallStore` → fragment rebuild. The missing
   primitive `wall.updateColorBatch` (`UpdateWallsColorBatchCommand`) was added this
   session on the `UpdateWallsSystemTypeBatchCommand` pattern.
4. **Chat saw at most ONE selected element.** `ZeroTokenChatBridge.currentSelection()`
   read `selectionManager.selectedObject` (singular) while `selectionBus` /
   `SelectionStore` hold the full multi-selection set. Fixed this session — the bridge
   now injects the full set.
5. **Multi-selection is nearly absent editor-wide.** True batches reachable from UI:
   `wall.updateSystemTypeBatch` (AI pills) and `visibility.hide {elementIds}` only.
   Property panels, delete, and every transform tool are single-element-per-gesture.
   Chat must not invent more permissive semantics than the editor has (§27 of the
   session brief) — batch scope comes from `'all'`-shaped and `ids[]`-shaped commands.
6. **The filter IR already exists.** `SemanticQueryExpression`
   (`packages/core-app-model/src/SemanticIndex.ts:29-37`: eq/neq/gt/lt/hasTag/and/or/not,
   dotted field paths, IFC Pset augmentation) + `VisibilityRule` + CRUD commands. What is
   missing is a **scope→element-id resolver** and a canonical element-props projection
   (§5 below).

---

## 1. INVENTORY A — user-facing UI capabilities (evidence-backed)

### 1.1 PropertyPanel (schema-driven) editable fields

Source of truth: `apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts:43-348`.

| Kind | Editable fields (units / bounds) | Notes |
|---|---|---|
| wall | mark; height m [0.1,20]; materialColor; baseOffset; rakeAngleDeg [RAKE_MIN,MAX]; loadBearing; fireRating | thickness READ-ONLY (derived from layer stack); rake refusal logic `:422-453` |
| slab | mark; thickness m [0.01,2]; materialColor; baseOffset | |
| window | mark only here — width/height/sillHeight/frameColor/fireRating via WindowSection | |
| door | mark; accessibilityType `Standard\|Accessible\|MotorizedSlide` | |
| column | mark; width/depth m [0.05,5]; height m [0.1,20]; materialColor; baseOffset | |
| beam | mark; width/height m [0.05,2]; materialColor; baseOffset | |
| stairs | width; riserHeight; treadDepth; fireRating `none\|FR30..FR120`; accessibilityType; material; stringerType; nosingType; riserVisible; nosingDepth; stringerThickness; handrailHeight; railingType | typeId READ-ONLY on purpose |
| curtainwall | height [0.5,50]; mullionSize; panelThickness; baseOffset | |
| roof | thickness; slope **%** [0,100]; materialColor; baseOffset | inspector path converts slopePercent÷100→slope (`PropertyInspectorApply.ts:229-232`) |
| furniture | width/length [0.1,20]; height [0.1,10]; baseOffset; color; material enum | |
| handrail | height [0.5,2]; thickness [0.01,0.2]; baseOffset; materialColor | |
| lighting | nothing editable (no store route) | |
| stair-railing | topRailHeight/handrailHeight [0.3,2.5]; balusterShape/Width/Spacing; material | |
| curtain-panel | panelType enum; materialOverride | |

Commit: whole draft → ONE `element.updateParameters` (`PropertyPanel.ts:909-952`);
mark → `element.updateMark` (`:954-963`, 8 kinds); delete → `element.delete` behind
`confirm()` (`:965-970`). **Single element only.** UI validation is thin (HTML min/max).

### 1.2 Type change and type authoring

- `element.changeType {elementId, elementType, newTypeId, layers?, thickness?}` —
  **14 dispatch sites, uniform payload**, one per family
  (`PropertyPanelTypeSelector.ts:84…383`, `PropertyPanelBodyRenderer.ts:241,272`).
- Type authoring (`elementType.create/duplicate/update/delete`,
  `initBusHandlers.ts:829-847`) allowed for exactly wall/door/window
  (`ElementTypeAuthoringRegistry.ts:130-187`, blocked list with reasons `:196-218`).
  `instanceLinkage: 'instance-owned'` — type edits do not restyle placed elements.
- Single-wall system type / layer stack: `wall.updateSystemType`
  (`WallLayerSection.ts:121,304`).

### 1.3 Wall colour / material — the full trace (§45 case study)

Control (inspector Visuals section) → live THREE repaint + staging
(`PropertyInspectorApply.ts:76-79,287-296`) → `dispatchSetMaterial` (`:313`) →
route table `MaterialDispatch.ts:109-154` → for wall: **`wall.updateColor`
{wallId, materialId?, materialColor?}** (`:136`, dispatched `:309`) → legacy bridge
(`initBusHandlers.ts:732`) → `UpdateWallColorCommand` → `wallStore.updateWall()` →
`WallFragmentBuilder` resolves materialId against the material library AND honours
materialColor. Multi-selection: `dispatchSetMaterialMany` exists (`:330-340`,
loop-per-element) but is **not called** — wall colour was single-selection only.

Honesty metadata worth reusing: `MATERIAL_UNSUPPORTED_REASON` (`:162-179` — beam,
stair, plumbing, lighting, structural, door, window say WHY the control cannot
commit), `MATERIAL_ID_UNSUPPORTED_REASON` (`:191-193` — handrail: colour yes,
catalogue id no).

Dead paths (do NOT wire chat to these): `wall.setColor` (plugin DTO store, wrong id
field, tombstone at `PropertyInspectorApply.ts:543-550`); `wall.bulkSetVisuals`
(plugin DTO store, zero call sites); all plugin `<family>.setMaterial` except
`room.setMaterial` (the one that bridges to commandManager).

Per-family live material routes (all single-element): column/ceiling/floor/roof/
curtainwall → `<family>.update` (updates shape); room → `room.setMaterial`;
furniture → `furniture.updateParameters` (colour field `color`); wall →
`wall.updateColor`; slab → `slab.updateDimensions`; handrail →
`handrail.updateColor` (no materialId); door/window frame → `door/window.setFrameColor`.

### 1.4 Per-field dispatch map (inspector path)

wall h/t → `wall.updateDimensions` (`PropertyInspectorApply.ts:551`); window
w/h → `window.setSize` (`:562,563`), sill → `window.setSillHeight`, fireRating
(`:168`), frameColor (`:565`); door width/height/sill/fireRating/accessibility/
swing/frameColor → `door.set*` (`:567-573,186,191`); slab → `slab.updateDimensions`
(`:536`); column → `column.update` (deg→rad `:355`); stairs →
`stair.updateParameters` (`:222`); curtainwall → `wall.updateCurtainWall` (`:575`);
roof → `roof.update` (`:233`); furniture → `furniture.updateParameters` (`:416`);
handrail → legacy `UpdateHandrailCommand` (NOT a bus verb, `:446-453`); mark →
`element.updateMark` (`:139`).

Room panel (`RoomPropertySection.ts`): `room.setName` (`:66`), `room.setNumber`
(`:91`), `room.setOccupancy` (`:130,182`), fill colour `room.setMaterial` (`:459`),
clear colour / opacity / comments `room.update` (`:469,503,937`).
`RoomAutoOrganiser.ts:180,185` is the only room bulk flow — loop-per-room.

### 1.5 Pills (AI panel)

- **"All walls → type…"** / **"Selected walls → type…"** → `wall.updateSystemTypeBatch`
  `{wallIds:'all'|ids, systemType}` (`AIPanel.ts:1324-1336`, dispatch `:1280`) — the
  ONE true UI-reachable batch mutation; report via `pryzm-wall-type-batch-report`.
- Selected-walls path is the only UI read of `selectionBus.currentIds` (`:1260`).
- "Batch ⚡" catalogue tree (`:1206-1239`, `ui/create/batchCatalogue.ts`) routes
  through commandManager/stores per entry.

### 1.6 Contextual edit bar + shortcuts

Undo Ctrl+Z / Redo Ctrl+Y → `performUndoRedo`; Move `MV` / Rotate `R` / Copy Ctrl+C /
Paste Ctrl+V / Delete Del / Join `J` / Cut `X` / Mirror `F` / Scale `S` / Align `L`
(2-D only, declines in 3-D with reason) / Offset `O` / Reference Edit `E` / Edit
Profile `P` (slab wired; floor/ceiling stubbed) — all **single-element**, all via
tools that dispatch bus commands per gesture (`ContextualEditBar.ts:188-401,527-690`).
Refusals are visible (`_declineOperation:713`). 41 Alt-prefixed creation shortcuts
(`creationToolShortcuts.ts:38-92`, collision-checked).

Transform command maps (all bus-dispatched, single element per gesture):
- Move (`engine/transforms/elementMove.ts`): column.update `:228`,
  furniture.updateParameters `:242`, plumbing.moveFixture `:261`, stair.move `:272`,
  beam.update `:283`, wall.updateCurtainWall `:303`, handrail.moveBaseLine `:326`,
  floor.update `:352`, ceiling.update `:362`, slab.movePolygon `:397`, roof.update
  `:412`, room.updateBoundary `:421`; wall → `wall.updateBaseline` +
  `wall.cascadeBaseline`; door/window → `door/window.setOffset`
  (`MovePlanToolHandler.ts:424-480`). `MOVE_UNSUPPORTED_REASON` → toast.
- Rotate: ONLY furniture + column (`elementYawRotate.ts:236,253`).
- Align: per-kind at `AlignPlanToolHandler.ts:342-407`.
- Copy: creates new element per kind (`CopyPlanToolHandler.ts:268-477`).

### 1.7 Creation tools (all pointer-driven, single element per gesture)

`wall.create`, `curtain-wall.create`, `wall.opening.create` (door/window),
`opening.create`, `slab.create`, `floor.create`, `ceiling.create`, `roof.create`,
`stair.create`, `column.create`, `beam.create`, `handrail.create`,
`furniture.create`, `plumbing.createFixture`, `lighting.create`, `room.create`,
`grid.add`, `section.mark.create`, `elevation.create`
(`engine/views/plantools/*PlanToolHandler.ts`, cited per tool in session audit).

### 1.8 Levels — two parallel paths

Level Manager panel uses direct command objects (`AddLevelCommand` /
`UpdateLevelCommand` / `DeleteLevelCommand`, `LevelManagerPanel.ts:137-214`);
the rails/plan overlay use bus `level.add` / `level.update`
(`GridsLevelsRailPanel.ts:252`, `PlanViewInteraction.ts:775,1164,1227`).
Level switching has deliberately NO bus verb (projectContext assignment).

### 1.9 View / visibility

`zoom-fit` (engineLauncher `:598-625`, refuses with reason when empty);
`view.setProjection`, `view.switch`, `view.hideElement`, `view.isolateElement`,
`view.setGraphicOverride` (ghost), `view.clearOverride`, `view.clearAllOverrides`,
`view.updateDefinition`, `view.setCrop` (`PlanViewInteraction.ts:1302-1625`);
**`visibility.hide {elementIds}` — array payload, a real batch**
(`VisibilityIntentPanel.ts:43`); `vg.assignIntent` / `vg.create/updateVisibilityIntent`
(`OverridePanel.ts`). Walk mode, level explode, day/night are events only — no
commands, not undoable.

### 1.10 Multi-selection semantics summary

| Surface | Semantics |
|---|---|
| Wall type pills | batch command, one undo, per-element refusal report |
| visibility.hide / intent panel edits | batch (`elementIds`), one command |
| Material/colour | single (Many-variant exists, uncalled) |
| Room auto-organiser | loop-per-room, 2 commands each |
| Property panels, delete, all transforms | single element only |

---

## 2. INVENTORY B — command surface (303 registered)

Gate mechanism: source-text regex over `plugins/*/src/handlers/*.ts`,
`initBusHandlers.ts`, `engineLauncher.ts` (`check-chat-capability-coverage.ts:125-171`;
matches object-literal AND class-based `type` declarations). Caveat: dynamically
registered verbs and `CommandHandler.aliases` are invisible; `CommandBus.registry`
is the runtime superset.

Ledger: **303 = 18 capability-covered (16 capabilities) + 51 CHAT_UNAVAILABLE +
234 classified** (`ChatCommandClassification.ts`): B needs-design 134 (B_CREATION 24,
B_CATALOGUE 18, B_GEOMETRY_EDIT 21, B_LAYERS 4, B_DOCS 39, B_VIEWS 16, B_MISC 12) ·
C internal 50 (C_BATCH 14, C_PLUMBING 36) · D duplicate 38 (D_DELETE 17, D_LEGACY 21) ·
E unsafe 3 (`*-on-all-*` generators, blocked on preview-before-execute) ·
F deferred-ready 9. UNDECLARED baseline **0**, shrink-only.

Gate checks: 1 coverage ratchet · 1b disjoint/stale/reason-length · 2 no phantom
capabilities · 3a executable probe over `PROBE_ELEMENT_KINDS` (declared ⟺ accepted,
both directions) · 3b source-anchored commandProof (file must contain `mustMention`) ·
3c normalized targets · 4 acceptance-test coverage · 5 parameter value-source
resolvability.

Class-F (chat-ready, cheapest tranche): `roof.setOverhang`, `stair.setRiserHeight`,
`stair.setTreadCount`, `slab.setBaseOffset`, `room.setHeightOffset`,
`lighting.setIntensity`, `sheet.rename`, `view.rename`, `structural.setDimensions`.

### Undo model (what makes N dispatches one unit)

- `performUndoRedo.ts` is the single entry (ring buffer first, shadow-drop of
  dual-dispatch twins, CommandManager fallback, 250 ms same-gesture window).
- ONE batch command with one Immer produce = one ring-buffer PatchPair
  (`CreateWallBatch.ts:168` et al) — the canonical answer (C16 §8.6).
- `CompositeCommand` (`command-registry/src/composite/CompositeCommand.ts:49`) +
  `beginGenerationBatch`/`endGenerationBatch` (`CommandManagerImpl.ts:655,674`) —
  N executed children accumulated into ONE history entry; only caller
  `buildingGenerationLifecycle.ts:107,230`; label hardcoded 'Generate building';
  captures legacy-Command dispatches only, NOT bus ring-buffer entries.
- `batchCoordinator.runBatch` — undo-NEUTRAL storm gate (see §0.2).
- ~70 initBusHandlers bridges declare `stores: []` → no PatchPair → CommandManager
  stack only (`performUndoRedo.ts:179`); the dual-stack reconciliation is inherently
  fragile — any new bridged command inherits this.

### Plan abstractions (for GAP D)

`CommandPlan` (`plans/CommandPlan.ts:10` — design-intent type with impactSummary,
status draft→approved→executed; explicitly not an execution unit),
`PlanValidator.validate(plan, ctx)` (`plans/PlanValidator.ts:9` — dry-run over
`canExecute`), `PlanOrdering` (dependency ordering). All legacy-Command-typed.
`FloorPlanBatchExecutor` (ai-host) has reusable dependency-ordering +
partial-failure-report shapes but goes through `window.commandManager` and is N undo
entries. `WorkflowRegistry` is the LLM-workflow axis, not deterministic composition.

### Validation ladder

`canExecute` (pure pre-flight, `{valid:false}` → CommandBusError, nothing on undo
stacks; `CommandBus.ts:343-348`) → Zod domain-schema `parse` inside `execute`
(typed throw, e.g. `CreateWallBatch.ts:130`) → invariant checks.
`UpdateElementParameterCommand.resolveStore()` switch (`:126-152`) covers wall, slab,
column, beam, stair(s), curtain-wall, roof, furniture family, handrail, window, door
(both → wallStore); everything else `null` → soft no-op — the honest ceiling on every
generic-parameter capability. Slab/furniture stores full-replace → merge-first
(§FIX-SLAB-PARAM-WIPE).

---

## 3. INVENTORY C — scope / filter / reference infrastructure

### Reusable directly

| Need | Reuse |
|---|---|
| Filter IR (field/op/value + and/or/not) | `SemanticQueryExpression` — `core-app-model/src/SemanticIndex.ts:29-37` |
| Filter evaluation (per element) | `semanticIndex.evaluateQuery` `:154-179` (dotted paths + IFC Psets) |
| Tag scope O(1) | `semanticIndex.getElementsByTag` `:117` |
| Persisted scoped filters + CRUD | `VisibilityRule` + `VisibilityRuleEngine` + `command-registry/src/vg/*VisibilityRule*Command.ts` |
| Scope = all of type | `storeRegistry.getStoreForType(t).getAll()` (pattern `SemanticQueryEngine.ts:457-464`); 25 registered keys `initStores.ts:99-134` |
| Scope = level | `wallStore.getByLevel` (Map-indexed, `WallStore.ts:92-97,786-796`) + 8 other `getByLevel`s (feature-detect; not on the BimStore interface) |
| Scope = room | `roomQueryService.getElementsInRoom/getBoundaryElements/getAdjacentRooms` (`spatial-index/src/RoomQueryService.ts:260,319,132`; covers doors/furniture/plumbing — NOT walls/windows/columns) |
| Scope = spatial | `ISpatialIndex` (`spatial-index/src/types.ts:12-24`, Box3-keyed) |
| Scope = facade orientation | `classifyFacades` / `facadeOrientationService` |
| Relationships | `semanticGraphManager.getTargets(id, 'hosts'\|'boundedBy'\|'adjacentTo'\|'connectedTo')` |
| Catalogue ref resolution | `resolveWallSystemTypeRef` ladder (id → name → ci-name → unambiguous word-subset; ambiguity → null) — generalized this session into `resolveCatalogueRef` |
| Kind guard + refusals | `normalizeElementKind` / `capabilityAppliesTo` / `describeCapabilitiesFor` + gate 31 |

### Does not exist (build order in ADR-0314)

1. A scope descriptor type (three incompatible encodings today: regex literals in
   QueryEngine, `'all'|'selection'` on one intent, CustomEvent target field).
2. A scope→element-id resolver ("all doors on level 2" → ids). Only
   `_resolveWallIds` exists, walls-only, `'all'|ids`.
3. Generic catalogue resolvers for doors/windows/floors/ceilings/stairs/handrails/
   materials/views (stores exist with getById/getAll — `DoorSystemTypeStore:250`,
   `WindowSystemTypeStore:208`, `FloorSystemTypeStore:367`, `CeilingSystemTypeStore:161`,
   `StairTypeStore:14`, `HandrailTypeStore:107`, `userMaterialStore:91`; resolvers do not).
4. A material/colour name resolver (two disagreeing hex maps in QueryEngine
   `:619` vs `:1031`; language-side canonical map added this session in ai-host).
5. ~~Multi-selection in chat context~~ — fixed this session.
6. A query engine over the filter IR (evaluateQuery is per-element; no
   getAll→props→evaluate→ids pipeline) + a canonical element-props projection.
7. Element-kind index across stores (`getStoreForElement` O(stores);
   `AIReadModel.getElementById` is a full 11-store transform per call).
8. Query result caching (every query re-runs `getAll()` with per-element cloning).

### Duplications to collapse (do not extend)

`SemanticQueryExpression` vs `QueryExpression` (identical, cast between);
category-name map ×2 and level lookup ×3 in `QueryEngine.ts` (+2 more elsewhere);
colour maps ×2 disagreeing; three spatial indexes; `resolveWallSystemTypeRef`
(name lookup) vs `plugins/wall/src/resolveWallSystemType.ts` (creation precedence —
different job, confusing name). `QueryEngine.ts` itself: linear regex list,
monkey-patches `aiService.getIntentSuggestions` — extend nothing here.

### Chat resolution ladder today (full path)

ZeroToken tier 0/1 → NL layer → capability-gap refusal → `aiService.query()`
(QueryEngine regexes) → LLM. (`AIPanel.ts:1528,1547`, `AIService.ts:424`.)

---

## 4. Chat parity matrix (top gaps, classified)

Gap classes: **A** chat wiring only · **B** semantic adapter missing · **C** batch
primitive missing · **D** composite missing · **E** authoritative validation missing ·
**F** editor capability missing.

| # | Capability | UI | Command | Chat | Gap | Route |
|---|---|---|---|---|---|---|
| 1 | Set wall colour/material (all/selected) | ✓ single | was single-only | **✓ this session** | was C | NEW `wall.updateColorBatch` → per-wall `UpdateWallColorCommand` |
| 2 | Change element type (14 families) | ✓ | ✓ `element.changeType` | ✗ | B | per-family catalogue value source via `resolveCatalogueRef` |
| 3 | Generic parameter set (~60 fields) | ✓ | ✓ `element.updateParameters` | partial | B | property-name vocabulary + units per field |
| 4 | Set/clear mark | ✓ | ✓ `element.updateMark` | ✗ | A | 8-kind gate mirrors command |
| 5 | Move element to level | ✓ wall only | ✓ `wall.changeLevel` | ✗ | B | level value source exists; re-host semantics per family |
| 6 | Hide/isolate/ghost/clear in view | ✓ | ✓ `view.*` | ✗ | B | needs view-context injection |
| 7 | Hide element set | ✓ | ✓ `visibility.hide {elementIds}` | ✗ | A (once scope resolver lands) | array payload ready |
| 8 | Door swing / accessibility / fire ratings | ✓ | ✓ enums | ✗ | A/B | closed value sets |
| 9 | Frame colours (door/window) | ✓ | ✓ `*.setFrameColor` | ✗ | A | colour value source now exists |
| 10 | Stair parameters (~12 fields) | ✓ | ✓ `stair.updateParameters` | ✗ | B | bounds published in STAIR_CONSTRAINTS |
| 11 | Room occupancy / fill colour / opacity | ✓ | ✓ | ✗ | A/B | |
| 12 | Level rename / re-elevate / delete | ✓ | ✓ (dual path!) | ✗ | B (+confirm for delete) | pick bus `level.update` route |
| 13 | Slab/floor/ceiling/roof dim+material | ✓ | ✓ per-family | partial | B | generalizes set-thickness |
| 14 | Type authoring (duplicate type as…) | ✓ 3 families | ✓ `elementType.*` | ✗ | B | authoring registry has refusal copy |
| 15 | Composite asks ("3m AND type X AND white") | — | pieces exist | ✗ | **D** | needs bus-side one-undo composite (spec in ADR-0314) |
| 16 | Filter scopes ("all exterior walls…") | ✗ (no UI either) | IR exists | ✗ | B+C | scope resolver over SemanticQueryExpression |
| 17 | Move/rotate/align/duplicate | ✓ | ✓ pointer-bound | refuse | honest refusal (CHAT_UNAVAILABLE) | needs reference resolution, not parsing |
| 18 | Create hosted door/window by sentence | ✓ pointer | ✓ | refuse | B (placement grammar) | |

## 5. Batch matrix (real semantics, not aspiration)

| Capability | Single | Selection | All | Filter | Level | Spatial | One-undo |
|---|---|---|---|---|---|---|---|
| Wall type | ✓ | ✓ | ✓ | ✗ | via ids | ✗ | ✓ (batch cmd) |
| Wall colour | ✓ | ✓ NEW | ✓ NEW | ✗ | via ids | ✗ | ✓ (batch cmd NEW) |
| Dimensions (h/w/t/sill) | ✓ | N×cmd NEW (N undo) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Delete | ✓ | N×cmd (N undo) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Visibility hide | ✓ | ✓ ids | ✗ | ✗ | ✗ | ✗ | ✓ |
| Create | ✓ per gesture | — | E-class generators exist, unsafe | — | — | — | per batch cmd |

## 6. Missing primitives (genuine, specified in ADR-0314)

1. **Bus-side composite command** — one dispatch carrying an ordered step list,
   one ring-buffer entry (or one CommandManager entry via parameterised
   `beginGenerationBatch` label). Prerequisite for GAP D asks.
2. **Scope→id resolver service** — `{kind:'selection'|'all'|'type'|'level'|'room'|'filter'}`
   → element ids, backed by storeRegistry + getByLevel indexes + roomQueryService +
   semanticIndex. Prerequisite for filter scopes (§4 row 16) and `visibility.hide` wiring.
3. **Per-family batch commands** where sentences will demand them (dimensions batch,
   `element.changeType` batch) — follow `UpdateWallsColorBatchCommand` precedent.
4. **Element-props projection** for the filter IR field vocabulary.

## 7. Performance notes (measured this session — see ADR-0314 for numbers)

Local resolution is regex/token work with bounded vocabularies; the risks are all in
scope resolution: `getAll()` deep-clones (WallStore), `AIReadModel` full-model
transforms per call, no query cache. Rule: scope resolution must go through indexed
paths (`getByLevel`, tag index) where they exist and must never run inside the
per-token loop.
