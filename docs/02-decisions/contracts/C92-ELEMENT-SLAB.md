# C92 — ELEMENT: SLAB

- **Status**: CANONICAL — binding on every PR that touches the slab family
- **Date**: 2026-08-18
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md). The **twelve mandatory sections** below are
  C84 §6's, in C84 §6's order.
- **Constrained by** (these own the mechanisms; C92 only APPLIES them per family, per C84 EI-9):
  [C03 §4.4/§4.5/§4.6](C03-SCHEMAS-COMMANDS-AND-STATE.md) · [C11](C11-ELEMENT-CREATION-PIPELINE.md) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) · [C72 §4](C72-PROPAGATION-AND-PREVSTATE.md) (the
  `isReverting` suppression protocol) · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) ·
  [ADR-0319 §2](../adrs/) (audit fields across undo — **NOT C75**) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the UI-control census)
- **Evidence**: measured in the MAIN worktree on 2026-08-18. Every claim carries `file:line`.
  Unverifiable cells read **NOT MEASURED**. **No cell is blank** (C84 §6).
- **Persistence pair measured**: `apps/editor/src/engine/persistence/` — the **LIVE** one.
  `packages/persistence-client/src/loader/` NOT measured; DEAD copy.
- **Reachability axes** (C84 §3.5.1): both were run, and both are cited per claim.

> **THE ONE-LINE VERDICT.** `holes` is declared by the L0 schema (`Slab.ts:55`), by the legacy record
> (`SlabTypes.ts:53`), by every plugin handler, by the committer, by the builder
> (`SlabFragmentBuilder.ts:920, :1118`), by the serializer (`:591`) and by the loader (`:966`) —
> **and `grep -c holes packages/runtime-composer/src/CommandEventBridge.ts` is `0`.** Every layer
> implements the feature; the single junction between them does not. **No bus path cuts a slab
> hole.** A hole authored on `slab.create` renders as a solid slab, and the command reports success.

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schema | `packages/schemas/src/elements/Slab.ts:13` — `defineElement('slab', {…})`; refine `:63-70` (boundary must be OPEN — no duplicated closing vertex), message `:69`; type export `:72` |
| Plugin DTO storeKey | `'slab'` — `plugins/slab/src/store.ts:24` (`super('slab')`) |
| Legacy record discriminator | `type: 'slab'` — `packages/geometry-slab/src/SlabTypes.ts:40` |
| Bus verb namespace | `slab.*` — 15 registered handler verbs (`plugins/slab/src/handlers/index.ts:20-38`, `SLAB_HANDLER_TYPES`) + legacy-command verbs `slab.movePolygon`, `slab.updateDimensions`, `slab.outline`, `slab.placement` |
| `createSnapshot` key | `'slab'` — `packages/command-registry/src/CommandManagerImpl.ts:594-595` (a **core** store, not optional) |
| `buildUndoStoreMap` keys | `slab`, `slabs` — `apps/editor/src/engine/undo/performUndoRedo.ts:313`, both → `window.slabStore` (**legacy**) |
| `window.*` globals | `apps/editor/src/engine/initBuilders.ts:342-343` (`slabStoreSingleton.attachEngine(projectContext)`, then `window.slabStore = slabStore`) **and a second assignment** `initTools.ts:994` |

### **FOUR `elementType` spellings — and all four are produced by ONE file**

| Spelling | Producer |
|---|---|
| `'Slab'` | `packages/geometry-slab/src/SlabFragmentBuilder.ts:411` — and **FROZEN** at `:419` `Object.defineProperty(root.userData, 'elementType', { writable: false })`; rationale `:405-406` (*"preserved for backward compat with inspector/selection code that reads elementType === 'Slab'"*) |
| `'slab'` | `SlabFragmentBuilder.ts:592` |
| `'SlabPart'` | `SlabFragmentBuilder.ts:1261` |
| `'SlabEdges'` | `SlabFragmentBuilder.ts:1305`; consumed `:99` (`obj.userData?.elementType !== 'SlabEdges'`) |
| `'slab'` (store event) | `SlabStore.ts:181` — storeEventBus, not `userData` |
| `'slabSystemType'` | `SlabSystemTypeStore.ts:154, :175, :184, :197` — a **type-library** tag, not an instance tag |

**C84 §4E CONFIRMED, and localised: the four-way split is not a distributed drift across the repo —
it is four literals in one 1300-line builder.** Shape documented at
`packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:247`.

> ⚠ **`.toLowerCase()` does not collapse this.** [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md)'s
> DECLARE + NORMALISE mechanism handles `'Slab'` vs `'slab'` — but `'slabpart'` ≠ `'slab'`. C84 §4E,
> as corrected: *"Multiple **spellings** of one family (slab's four) are the violation; multiple
> **casings** of one spelling are not."*

### TO-BE — normative

- **SL-ID-1.** The canonical `userData.elementType` is **`'Slab'`** — the frozen one
  (`SlabFragmentBuilder.ts:419`) — compared case-insensitively per C15 §12. `'SlabPart'` and
  `'SlabEdges'` are **sub-parts** and MUST carry C15 §12's `userData.role = 'geometry'` + `parentId`
  rather than rival element-type tags.
- **SL-ID-2.** Because all four literals live in one file, the fix is one file. **There is no excuse
  of distributed ownership here.**
- **SL-ID-3.** `window.slabStore` MUST have ONE assignment site. Two (`initBuilders.ts:343`,
  `initTools.ts:994`) is EI-9 with no declared ordering — the same defect
  [C85 §2 W-S-5](C85-ELEMENT-WALL.md) records for wall.

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. FOUR representations; the two record shapes are **disjoint at seven fields.**

| # | Representation | File:line | Fields |
|---|---|---|---|
| 1 | **L0 Zod schema** | `packages/schemas/src/elements/Slab.ts:13` | `provenance:29`, `confidence:45`, `levelId:46`, **`boundary:48`** (`SlabLoop = z.array(Vec3).min(3)` `:11`; default unit square `:48-53`), **`holes:55`** (`z.array(SlabLoop).default([])`), `thickness:57`, `baseOffset:59`, `materialId:60`, `materialColor:61`, `systemTypeId:62` + BaseNode |
| 2 | **Plugin DTO store** | `plugins/slab/src/store.ts:24`; `SlabData = SlabSchemaInfer` `:14`; `SlabsState` `:20`; API `ids():28`, `byLevel():33`, `get():42`; header `:1-8` self-describes as *"pure DTO store … THREE-free"* | identical to (1) |
| 3 | **Legacy geometry store** | `packages/geometry-slab/src/SlabStore.ts:111` (class), **singleton `:318`**; record `SlabTypes.ts:39-91` | `type:40`, **`width:41`**, **`depth:42`**, `thickness:43`, **`position:51`**, **`polygon:52`** (not `boundary`), **`holes:53`** ✅, `materialColor:54`, `materialId:55`, `phase:56`, **`sketch:64`**, **`topReference:70`**, `baseOffset:75`, `systemTypeId:83`, **`layers:90`** (`SlabLayer:32-37` — `name`, `thickness`, `function`, `materialColor`) |
| 4 | **Type library** | `packages/geometry-slab/src/SlabSystemTypeStore.ts` | separate lifecycle |
| 5 | **Kernel producer** | `packages/geometry-kernel/src/producers/slab.ts:86` (`produceSlab`); exported `geometry-kernel/src/index.ts:158`, re-exported `plugin-sdk/src/index.ts:273` | reads the **L0** shape (`slab.boundary`, `slab.holes`, `slab.baseOffset`) |
| 6 | **`openingStore`** | `packages/core-app-model/src/stores/OpeningStore.ts`; global `initBuilders.ts:679`; injected into the slab builder `:694` | the **second** hole record — keyed by `hostId` |

> **The two record shapes are disjoint at SEVEN fields.** The L0 schema has no `width`, `depth`,
> `position`, `polygon`, `sketch`, `topReference` or `layers`. The legacy record has all seven — and
> has `polygon` where L0 has `boundary`.

**`holes` is declared in BOTH — C84's claim that `SlabData` has the field is CONFIRMED at
`SlabTypes.ts:53`.**

### THE AUTHORITY

> **`packages/geometry-slab`'s `slabStore` singleton (representation 3) is the AUTHORITY.**
> `openingStore` (6) is the **second** hole record.

Every consumer reads (3) — §3. Representation 2 has **zero production readers**; the codebase says so
in its own refusal text (§4).

### TO-BE — normative

- **SL-S-1 (EI-1).** (3) is the declared authority. A consumer reading (2) is a merge blocker.
- **SL-S-2 (EI-5a).** (2) is a **declared write-only shadow**. ⛔ No mirror, no purge (C84 §8.c).
  `plugins/slab/src/store.ts` MUST carry the `plugins/rooms/src/store.ts:1-29` header form naming the
  winner, the reader count (**0**) and the retirement path.
- **SL-S-3 (EI-9).** `Slab.holes[]` / `SlabData.holes` and the `openingStore` record are **two
  answers to one question** — *"where is the hole in this slab?"* — and the builder reads them in a
  declared precedence (`SlabFragmentBuilder.ts:1078-1120`). That precedence MUST be stated here as
  the canonical answer, or one record MUST be retired. ⚠ **This is the SAME defect
  [C90 §2 RF-S-4](C90-ELEMENT-ROOF.md) records for roof, on the SAME store.** Fix it once.
- **SL-S-4.** The seven-field disjunction (SL-S-3's neighbour) is why §5 must hand-translate. One
  shape MUST be declared canonical and the other derived — an ADR with a persistence migration, not
  a lane refactor.

---

## 3. CONSUMERS

| Consumer | Reads | Evidence |
|---|---|---|
| **Renderer** | ✅ legacy (3) + `openingStore` (6) | `initBuilders.ts:348` `new SlabFragmentBuilder(scene, bimManager)`; store constructed `:342`; **opening injection `:694` `slabBuilder.setDeps({ openingStore })`**, with the rationale `:682-693` naming the failure mode without it |
| **Plan view** | ⚠ schema `Slab[]` | `plugins/plan-view/src/projection.ts:43` (`readonly slabs: readonly Slab[]`), `:75-81` (`slabOutlines`), `:31` (`kind:'slab'`); also `hit-test.ts`, `level-scoped-renderers.ts`, `PlanViewRenderer.ts`, `PlanViewCanvasHost.ts`. **Fed by the host, not by a store it owns** — which store the host passes is **NOT MEASURED** |
| **Persistence — save** | ✅ legacy | LIVE `ProjectSerializer.ts:36` (import), `:59` (`SlabSystemTypeStore`), `:130` (`slabs: any[]`), `:583-601` (`serializeSlab`), `:1015`, `:1057-1059` (custom system types), `:1103`, `:1112` |
| **Persistence — load** | ✅ legacy (via L2) | LIVE `ProjectLoader.ts:100` (import `CreateSlabCommand`), Step 5 `:949-971`, `:952`, `:959` (ifcGuid), `:960-967`; system types `:1464-1498` |
| **IFC export** | ✅ legacy | `packages/file-format/src/export/ifc/readers/SlabReader.ts:6` class, `:36` `ifcClass: slab.ifcData?.ifcClass ?? 'IfcSlab'` (`ifcData` is a `SlabData`-only field) |
| **GLB export** | ✅ scene graph | `GLBExporter.ts:177`, `:436` — **comments only; no slab-specific branch measured.** GLB walks the scene by `elementType` |
| **Bake worker** | — **NOT MEASURED** | no slab handling located in `apps/bake-worker/src` |
| **Plugin DTO store (2)** | — | **zero production readers, both axes** |

**No two consumers read different stores. Slab is NOT a split-brain family.** C84 §4 records
`✅ legacy`; **CONFIRMED and recorded `✅` explicitly** per EI-1b, so it is distinguishable from
*nobody looked*. ⚠ With one caveat: the plan-view plugin's source store is NOT MEASURED.

> ⭐ **`holes` round-trips through persistence, end to end.** `ProjectSerializer.ts:591`
> (`holes: Array.isArray(s.holes) ? s.holes.map(…) : undefined`) and `ProjectLoader.ts:966`
> (`holes: slab.holes`). **Persistence is the ONLY slab path that carries holes.** That is what makes
> §5's bridge drop so sharp: the feature works everywhere except at creation.

`serializeSlab` (`:585-599`) emits: `id, type, levelId, parentId, width, depth, thickness, position,
polygon, holes, baseOffset, materialId, materialColor, layers, systemTypeId, sketch, properties,
ifcData`.

### TO-BE — normative

- **SL-C-1.** The authority set is closed at (3) + (6).
- **SL-C-2.** The plan-view plugin's slab source store MUST be measured and declared. C84 §9 records
  plan-view authority as unmeasured **for every family**; slab is no exception, and it is the one
  family whose plan tool is a live founder-reported surface ([L-956](../../04-reference/ISSUE-LOG.md)).
- **SL-C-3.** `SlabFragmentBuilder.setDeps` is the pattern the roof builder copied
  (`RoofFragmentBuilder.ts:54-58` — *"deliberately the SAME shape as `SlabFragmentBuilder.setDeps`"*).
  **Any change to it is a two-family change.**

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — 15 bus handlers, TWO authoring lineages

`plugins/slab/src/handlers/index.ts:20-38` (verb list), `:43-59` (construction). **Eleven are
`new XHandler()`; four are bare object literals** passed through
`as unknown as CommandHandler<unknown>` — `UpdateSlabHandler:53`, `UpdateSlabPolygonHandler:54`,
`UpdateSlabLayersHandler:55`, `UpdateSlabsSystemTypeBatchHandler:58`.

| Handler | Verb (line) | `affectedStores` (line) | Form | Refuses? |
|---|---|---|---|---|
| `CreateSlab.ts` | `slab.create` `:123` | `['slab']` `:124` | class | ⚠ **CONDITIONAL** — three-valued (§12 R-1). `:46`: *"Refusing outright would delete slab creation."* Also `:133, :136, :139, :144, :151` |
| `CreateSlabBatch.ts` | `slab.batch.create` `:57` | `['slab']` `:58` | class | conditional `:65, :70, :73, :76, :80, :86` |
| `CreateSlabsOnAllFloors.ts` | `slab.create-on-all-floors` `:57` | **`[]`** `:58` | class | conditional `:65` |
| `DeleteSlab.ts` | `slab.delete` `:21` | `['slab']` `:22` | class | conditional `:26, :29` |
| **`MoveSlab.ts`** | `slab.move` `:80` | `['slab']` `:81` | class | ⛔ **YES, unconditional** `:113` |
| **`SetSlabMaterial.ts`** | `slab.setMaterial` `:62` | `['slab']` `:63` | class | ⛔ **YES** `:83` |
| `AddSlabHole.ts` | `slab.addHole` `:30` | `['slab']` `:31` | class | conditional `:35, :38, :41` |
| `RemoveSlabHole.ts` | `slab.removeHole` `:26` | `['slab']` `:27` | class | conditional `:31, :34, :37, :40` |
| `SetSlabBaseOffset.ts` | `slab.setBaseOffset` `:31` | `['slab']` `:32` | class | conditional `:39, :42, :45` |
| `SetSlabThickness.ts` | `slab.setThickness` `:24` | `['slab']` `:25` | class | conditional `:32, :35, :38` |
| `SetSlabType.ts` | `slab.setType` `:32` | `['slab']` `:33` | class | conditional `:37, :40, :43` |
| `UpdateSlab.ts` | — | `['slab']` `:31` | **object literal** | conditional `:37, :38` |
| `UpdateSlabLayers.ts` | — | `['slab']` `:31` | **object literal** | conditional `:37, :38` |
| `UpdateSlabPolygon.ts` | — | `['slab']` `:34` | **object literal** | conditional `:40, :41, :43` |
| `UpdateSlabsSystemTypeBatch.ts` | — | **`[]`** `:115` | **object literal** | conditional `:122, :125, :171-178, :218` (header `:33`) |

> ⭐ **THE CODEBASE DIAGNOSES ITSELF IN A REFUSAL STRING, AND APPLIES THE DIAGNOSIS TO 13% OF THE
> SURFACE.** `SetSlabMaterial.ts:56-57` verbatim:
> *"It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by
> no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created` is
> ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use
> `slab.updateDimensions` instead — it reaches the geometry record the builders read.
> (UpdateSlabCommand deliberately THROWS on material fields; UpdateSlabDimensionsCommand owns them.)"*
> **Two of fifteen refuse on that basis. Eleven others write the same store and report success.**

`MoveSlab.ts:76-77` verbatim names the live path:
> *"slab.move writes the detached plugin slab store that nothing renders, exports or persists, and no
> production surface dispatches it. Moving a slab commits through slab.movePolygon (payload keys:
> slabId, polygon) → UpdateSlabPolygonCommand → the geometry slabStore — the DISTINCT verb minted by
> §FIX-MOVE-SLAB-AND-HANDRAIL (G7) precisely because slab.move and slab.update were claimed by this
> detached store."*

### Reachability — BOTH AXES

- **Axis (a):** all 15 imported `index.ts:4-17`, instantiated `:43-59`.
- **Axis (b) — `slab.move` has ZERO production dispatchers.** Every hit is a test
  (`deadMoveVerbAuthoritativeState.test.ts:223`, `transformDragUndoCapture.matrix.test.ts:163`,
  `packages/command-bus/__tests__/cascade.test.ts:194, :200`,
  `plugins/cross/__tests__/slab-wall.test.ts:32, :41`), a metadata table
  (`syncDisposition.ts:594`), an AI refusal string (`ChatCapabilityRegistry.ts:2445`), or a
  commented-out line (`plugins/cross/src/slab-wall.ts:15, :55`). **C84 CONFIRMED.**
- **Axis (b) — dispatchers that DO exist:** `slab.create` — `PreviewManager.ts:330`
  (`window.runtime?.bus?.executeCommand('slab.create', {…})`); `slab.movePolygon` —
  `registerTransformDragHandler.ts:638`, `initBusHandlers.ts:1102`, mapped at
  `transforms/elementMove.ts:123` (`slab: 'slab.movePolygon',`).

### 16 L2 legacy commands — `packages/command-registry/src/slabs/`

`CreateAllSlabsFromLevelToAllFloorsCommand:13` `["slab","level"]` ·
`CreateAllSlabsFromLevelToTopLevelCommand:12` `["slab","level"]` ·
**`CreateSlabCommand:43` `["slab","level","opening"]`** ·
`CreateSlabOnLevelSimilarToSelectedCommand:16` · `CreateSlabsOnAllFloorsCommand:13` ·
`CreateOpeningCommand:45` `["slab"]` · `DeleteOpeningCommand:31` `["slab"]` ·
`UpdateOpeningCommand:23` `["slab"]` · `DegradeSlabSketchCommand:46` · `DeleteSlabCommand:53` ·
`RemoveSlabsOnLevelCommand:45` · `UpdateAllSlabsCommand:18` · `UpdateSlabCommand:42` ·
`UpdateSlabDimensionsCommand:37` · `UpdateSlabLayersCommand:25` · `UpdateSlabPolygonCommand` ·
`UpdateSlabLevelCommand` · `UpdateSlabSketchCommand` · `UpdateSlabsSystemTypeBatchCommand`.

### TO-BE — normative

- **SL-P-1.** The two refusals **SATISFY [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) and MUST NOT
  be "fixed" into silent success.** The residual defect is the still-offered control — **NOT
  MEASURED**, owned by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
- **SL-P-2 — THE ELEVEN NON-REFUSING DTO WRITERS ARE THE LIVE DEFECT.** Each MUST route to the
  authority (**CA-17**) or refuse (**CA-18**). `slab.addHole` and `slab.removeHole` are the most
  severe: they accept, validate and store a hole into a store nothing renders.
- **SL-P-3.** Two handler forms (class vs object literal, the latter behind
  `as unknown as CommandHandler<unknown>`) is EI-9 at the authoring layer and it defeats `tsc`
  exactly as C84 EI-2(c) describes. One form.

---

## 5. THE BRIDGE FIELD MAP — **THE LOAD-BEARING SECTION**

**Hops:** payload → `packages/runtime-composer/src/CommandEventBridge.ts:336` (single arm; `p` cast
`:342-353`, emit `:354-368`) / `:372` (batch arm; cast `:377-390`, emit `:395-407`) →
`apps/editor/src/engine/initTools.ts` subscriber (guard `:1714`, record `:1721-1745`) → legacy
`slabStore` → `ProjectSerializer.ts:585-599` → `ProjectLoader.ts:952-967`.

| # | Field | Single arm reads | Single emits | Batch arm reads | Batch emits | initTools → legacy | Serialised | **Disposition** |
|---|---|---|---|---|---|---|---|---|
| 1 | `id` | ✅ `:343` | ✅ `:359` | ✅ `:379` | ✅ `:400` | ✅ | ✅ `:587` | **CARRIED** |
| 2 | `type` | ⛔ | `commandType` `:356` | ⛔ | `commandType` `:397` | literal | ✅ `:587` | **TRANSFORMED** |
| 3 | `levelId` | ✅ `:344` | ✅ `:357` | ✅ `:380`/envelope `:389` | ✅ `:398` | ✅ | ✅ `:587` | **CARRIED** |
| 4 | `boundary` / `polygon` | ✅ `polygon` `:346` | ✅ `:361` | ✅ **both** `:381-382`, resolved `_slabPolygon = s.polygon ?? s.boundary` `:393` | ✅ `:401` | ✅ | ✅ `polygon:590` | **TRANSFORMED (RENAMED)** — L0 `boundary` → legacy `polygon` |
| 5 | `position` | ✅ `:347` | ✅ `:362` | ⛔ **absent from the cast** | **FORCED `{x:0,y:0,z:0}`** `:403` | `?? {0,0,0}` `:1727` | ✅ `:589` | ⛔ **BATCH: INVENTED.** C84 CONFIRMED |
| **6** | **`width`** | ✅ `:348` | ✅ `:363` | ⛔ **absent** | ⛔ | **`?? 1`** `:1728` | ✅ `:588` | ⛔ **BATCH: DROPPED → 1 m.** C84 CONFIRMED |
| **7** | **`depth`** | ✅ `:349` | ✅ `:364` | ⛔ **absent** | ⛔ | **`?? 1`** `:1729` | ✅ `:588` | ⛔ **BATCH: DROPPED → 1 m.** C84 CONFIRMED |
| 8 | `thickness` | ✅ `:350` | ✅ `:365` | ✅ `:383` | ✅ `:404` | `?? 0.25` `:1730` | ✅ `:588` | **CARRIED (DEFAULTED)** |
| 9 | `baseOffset` | ✅ `:351` | ✅ `:366` | ✅ `:384` | ✅ `:405` | ✅ | ✅ `:592` | **CARRIED** |
| 10 | `materialId` | ✅ `:352` | ✅ `:367` | ✅ `:385` | ⚠ `s.materialId ?? s.systemTypeId` `:406` | ✅ | ✅ `:593` | **CARRIED (single) / CONFLATED (batch)** — see below |
| **11** | **`systemTypeId`** | ⛔ **absent** | ⛔ | ✅ `:386` | ⚠ **smuggled inside `materialId`** `:406` | → `materialId` `:1735` | ✅ `:594` | ⛔ **VOCABULARY COLLAPSE** — two distinct vocabularies folded into one field by `??`. A batch slab's system type arrives **masquerading as a material id** |
| **12** | **`holes`** `Slab.ts:55` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:591` | ⛔ **DROPPED (SILENT) BY BOTH ARMS.** `grep -c holes CommandEventBridge.ts` → **0**. C84 CONFIRMED |
| **13** | **`materialColor`** `:61` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:593` | ⛔ **DROPPED (SILENT)** |
| **14** | **`layers`** (legacy-only `SlabTypes.ts:90`) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:594` | ⛔ **UNREACHABLE FROM THE BUS.** Consumed by the builder for thickness (`:86-89` doc). **A layered slab created over the bus arrives unlayered** |
| **15** | **`sketch`** (legacy-only `:64`) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:596` | ⛔ **REQUIRES A SECOND COMMAND** — attached post-hoc by `SlabPlanToolHandler.attachSlabSketchViaLegacyBridge` `:314`, which **can fail**: `:324-331` logs *"commandManager unavailable — region slab created WITHOUT host references."* |
| 16 | `ifcGuid` | ✅ `:345` | ✅ `:360` | ✅ `:387` | ✅ `:399` | ✅ | ✅ `ifcData:597` | **CARRIED** |
| 17 | `provenance:29` / `confidence:45` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ **DROPPED (SILENT)** |
| 18 | `parentId`, `childrenIds`, `metadata` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | `parentId` ✅ `:587` | **DROPPED (SILENT)** in flight |
| 19 | `topReference` (legacy-only `:70`) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | **UNREACHABLE + UNSERIALISED** — the semantic datum anchor (§10) |
| — | `commandId`, `elementCount` | — | ✅ `:355, :358` | — | ✅ `:396, :399` | ⛔ never read | — | **EMITTED, UNCONSUMED** — EI-13 shape |

### Two structural findings at this hop

**(a) The batch guard is DEAD CODE, twice over.** `CommandEventBridge.ts:397` rewrites
`commandType` to `'slab.create'` for every batch element. So `initTools.ts:1714`'s second clause —
`(ev.commandType !== 'slab.create' && ev.commandType !== 'slab.batch.create')` — is unconditionally
`true` on its second half and the `&&` short-circuits on the first alone. The comment above it
(`:1710-1713`) claims the clause was added because *"Previously batch-created slabs never reached the
legacy SlabStore"*; **the fix that actually landed was `:397`**, and this clause is a second,
redundant, unreachable copy of it. Worse, `packages/runtime-composer/src/types.ts:420` declares
`commandType: 'slab.create' | 'slab.batch.create'` — **a union whose second member cannot occur.**

**(b) A batch slab with no pre-minted id is silently skipped.** `:394` —
`if (!s.id || !_slabPolygon || _slabPolygon.length < 3) continue;`.

### `holes` — the layer-by-layer proof

| Layer | Site | Carries holes? |
|---|---|---|
| L0 schema | `Slab.ts:55` | ✅ |
| Legacy record | `SlabTypes.ts:53` | ✅ |
| Plugin create | `CreateSlab.ts:112` (payload), `:141-144` (validate), **`:176` `holes: cmd.holes ?? []`** | ✅ → DTO |
| Plugin batch | `CreateSlabBatch.ts:82-86, :114-116` | ✅ → DTO |
| Add/remove | `AddSlabHole.ts:54` (`s.holes.push(...)`), `RemoveSlabHole.ts` | ✅ → DTO |
| Committer | `plugins/slab/src/committer/slab-committer.ts:26, :56` | ✅ |
| **CommandEventBridge** | **`grep -n holes` → ZERO HITS** | ⛔ |
| initTools bridge | `:1721-1745` — no `holes` key | ⛔ |
| Builder (consumer) | `SlabFragmentBuilder.ts:920` (`buildSlabGeometry(…, holes = [])`), `:927-929` (CW normalisation), `:1078-1099` (precedence doc), `:1118` (`resolvedInnerLoops.length > 0 ? resolvedInnerLoops : (data.holes ?? [])`), `:1208` (BoxGeometry fallback — *"holes not supported without a polygon outline"*) | ✅ **reads them — from the LEGACY store** |
| Persistence | `ProjectSerializer.ts:591` / `ProjectLoader.ts:966` | ✅ |

> **The builder is fully capable of punching a hole and only ever receives one from (a) a project
> LOAD or (b) `openingStore` (`SlabFragmentBuilder.ts:1120`, "Source 2"). The bus cannot deliver
> one.**

### TO-BE — normative

- **SL-B-1 (EI-2).** Every **DROPPED (SILENT)** row MUST become CARRIED or **DROPPED (DECLARED)**.
- **SL-B-2.** Row **12** (`holes`) is the priority, and it is one field in two arms.
- **SL-B-3.** Rows **6/7** (batch `width`/`depth`) are not a default-in-absence-of-data — **the cast
  has no field to read**, so `?? 1` fires on every element, always. Add the fields, or compute the
  extents from the polygon at `:1728-1729` rather than inventing 1 m.
- **SL-B-4 (EI-8).** Row **11**'s `s.materialId ?? s.systemTypeId` MUST be split. A system type is
  not a material; `SetSlabMaterial.ts:56-57` says so in its own last sentence.
- **SL-B-5.** The dead guard at `initTools.ts:1714` and the impossible union member at
  `types.ts:420` MUST be removed. **A branch that cannot be taken is C84 EI-2(b)'s
  constant-comparison mechanism**, and it is invisible to both `tsc` and review.

---

## 6. VERBS

| Verb | Lineage | W | R | `=`? | Note |
|---|---|---|---|---|---|
| `slab.create` | L1 | DTO + legacy (via CEB→initTools) | legacy only | ⛔ | conditional refusal (§12 R-1) |
| `slab.batch.create` | L1 | same | same | ⛔ | **loses `width`/`depth`; forces `position:{0,0,0}`** |
| `slab.create-on-all-floors` | L1, `[]` | delegates | delegates | ? NOT MEASURED | — |
| `slab.delete` | L1 | DTO | legacy | ⛔ | the DORMANT class (C84 §3.5.3) |
| **`slab.move`** | L1 | — refuses `:113` | n/a | ✅ vacuously | **zero production dispatchers**, both axes measured |
| **`slab.movePolygon`** | **L3** bridge | legacy via `UpdateSlabPolygonCommand` | L2 stack | ✅ | **THE LIVE MOVE PATH** — `elementMove.ts:123`, dispatched `registerTransformDragHandler.ts:638`, `initBusHandlers.ts:1102` |
| **`slab.setMaterial`** | L1 | — refuses `:83` | n/a | ✅ vacuously | C16 CA-18 conformant |
| **`slab.updateDimensions`** | **L3** | legacy | L2 stack | ⚠ | `performUndoRedo.ts:197` lists it among verbs with `stores: []` → **no PatchPair** |
| **`slab.addHole` / `slab.removeHole`** | L1 | **DTO only** | legacy — **the field exists but nothing renders the DTO** | ⛔ | **accept, validate, store, report success — into a store nothing reads** |
| `slab.setThickness` / `setBaseOffset` / `setType` | L1 | **DTO only** | legacy | ⛔ | same |
| `slab.update` / `slab.updatePolygon` / `slab.updateLayers` | L1 (object-literal form) | DTO | legacy | ⛔ | — |
| `slab.updateSystemTypeBatch` | L1, `[]` | — | — | ⚠ | — |
| **ROTATE** | — | — | — | — | ⛔ **NO ROTATE VERB.** Expressed as a polygon edit. Declared, not omitted |
| **COLOUR** | — | — | — | — | ⛔ **NONE** distinct from `setMaterial`, which refuses |
| **LEVEL CHANGE** — `slab.changeLevel` | L1 | DTO + legacy (via CEB → `elementLevelChangedMirror`) | legacy | ✅ | **BUILT 2026-08-19 (L-1032).** Payload `{slabId, levelId}`, declared in `packages/command-bus/src/levelChangeVerbs.ts`. Handler `plugins/slab/src/handlers/ChangeSlabLevel.ts`. Legacy move `SlabStore.changeLevel`. Undo routes through `elementUndoStoreAdapter`'s §L-946 `levelId` arm. Proven end-to-end by `apps/editor/__tests__/SlabLevelChangeReachesLegacyStore.test.ts` (6/6) |

### TO-BE — normative

- **SL-V-1.** Every row must reach `=` ✅. The eleven non-refusing DTO writers are the work (SL-P-2).
- **SL-V-2.** The three undeclared absences (rotate, colour, bus-level-change) are now **DECLARED**.
- **SL-V-3 (L-1032, 2026-08-19).** The bus-level-change absence is **CLOSED**, and the row above was
  corrected: it read *"whether any surface dispatches `UpdateSlabLevelCommand` is NOT MEASURED"*.
  **It is now measured — NOTHING dispatches it** (L-1086). Its only references are the
  DESERIALISER table row `apps/editor/src/engine/CommandRegistry.ts:328`, the barrel export
  `packages/command-registry/src/index.ts:266`, and `PlanOrdering.ts:80`. A deserialiser row proves a
  command can be RECONSTRUCTED from a serialised event; it never proves a surface CONSTRUCTS one.
  The live route is the L1 bus verb, and `UpdateSlabLevelCommand` is the decided loser (ADR-0331 §D1)
  — recorded, not deleted, because two of its behaviours are better than the winner's and must not
  be lost by silence: it validates the destination against `bimManager`
  (`UpdateSlabLevelCommand.ts:43-44`) and takes a full `structuredClone` undo snapshot (`:60`).

---

## 7. UNDO / REDO

### SL-U-1 — the repo-wide inequality (EI-7a)

Every `['slab']` bus verb writes the plugin DTO snapshot; `performUndoRedo.ts:313` routes the inverse
to `window.slabStore` — the **legacy** singleton. `WRITES ⊋ RESTORES` on every one.

### SL-U-2 — `createSnapshot` covers `'slab'`, and **`'opening'` is a HOLE**

`CommandManagerImpl.ts:594-595` — `if (wants('slab')) { snap.slabStore = structuredClone(ctx.stores.slabStore.getAll()); }`.
Cost note `:148-149`: *"structuredClone tail the stair scope `["stair","opening","slab"]` paid as the
slab store grew."*

> ⛔ **`CreateSlabCommand.ts:43` declares `["slab", "level", "opening"]`. `createSnapshot`'s
> recognised set is `wall`/`slab`/`level` (`:590-600`) plus the 13 `optionalStores` (`:609-625`).
> `'opening'` is in NEITHER.** `wants('opening')` returns `true` (the scope contains it) and **no
> branch acts on it**, so nothing is captured. `restoreSnapshot` restores nothing, **with no
> warning** — C84 **EI-7d**, and L-953's exact shape.
>
> **`'opening'` also has NO `buildUndoStoreMap` entry** (`performUndoRedo.ts:311-343`: the keys are
> wall/walls, slab/slabs, room/rooms, the four curtain spellings, curtainPanel, furniture,
> column/columns, beam/beams, stair/stairs, stairRailing, stairLanding, handrail/handrails,
> roof/roofs, floor/floors, ceiling/ceilings, plumbing, lighting, grid/grids, annotation/annotations,
> pool/pools, water/waters — **`opening` is absent**), and the deliberate-omission note at `:345-351`
> covers only door/window/level. **So the store that holds every slab AND roof hole is
> un-rollback-able through `createSnapshot` and un-undoable through the ring buffer.**
> ⚠ **This is the same finding as [C90 §10 RF-G-4](C90-ELEMENT-ROOF.md), on the same store. One fix.**

### SL-U-3 — L-947's route table is fixed; the audit envelope is not

`UpdateElementParameterCommand.ts:112` `ELEMENT_STORE_ROUTES`, slab route **`:113`**
`slab: route(['slab'], c => c.stores.slabStore),`; table `:112-149` (20 keys); normaliser `:151-153`.
The hard-coded `["wall"]` L-947 describes is **GONE** — the scope is now per-route. The file's own
account `:221-224`: *"a SECOND one of exactly that shape sat one layer down, undocumented, for
months: `affectedStores` was hard-coded `["wall"]` while `resolveStore()`…"*.

**But `undo()` (`:374`) replays a fresh FORWARD command (`:379-389`)**, and audit-neutrality comes
only from `restoreWallAudit`, gated `:410-414` on `t === 'wall' | 'door' | 'window'`. For `'slab'`,
`wallId` stays `undefined` → `:414 return null` → nothing captured at `:343` → nothing restored.
**The forward replay's version bump stands.**

> ⭐ **Slab is named FIRST in the list of families the code admits it does not cover.**
> `:213-218` verbatim: *"only `WallStore` carries the `preserveMetadata` contract today … Element
> types whose stores stamp their own audit fields (**slab**, stair, roof, furniture, …) are NOT
> covered here and are not claimed to be; giving them the same treatment means giving their stores
> the same contract first."* **L-952 CONFIRMED for slab.**

### TO-BE — normative

- **SL-U-1n.** ADR-0331 §D3 is the named exit; C84 §9 records it as **never executed**.
- **SL-U-2n.** `'opening'` MUST gain a `createSnapshot` branch and a `buildUndoStoreMap` entry, or
  `CreateSlabCommand.ts:43` MUST stop declaring it. Gated by `check-affected-stores.ts` and
  `check-undo-store-coverage.ts` (C84 §5). **Fix once, for slab and roof.**
- **SL-U-3n.** Slab MUST gain audit-neutral undo. The mechanism exists on `WallStore`
  ([C85 §7](C85-ELEMENT-WALL.md)); L-952's fix is to generalise `preserveMetadata` off it and
  consume it in `mergeWithExisting`. ⛔ **Control first, watched RED:** undo a slab parameter change
  and assert `metadata.version` is **byte-equal**. *An assertion that passes before the fix is
  testing nothing.*

---

## 8. CASCADES

| Cascade | Trigger | Reversed? | Evidence |
|---|---|---|---|
| **Slab openings on slab delete (L2)** | `DeleteSlabCommand` | ✅ | Capture+remove `:85-94` (`openingStore.getByHostId(this.slabId)`, `structuredClone`, `bimManager?.unregisterElement`, `elementRegistry.unregister` (W3), `openingStore.remove`); slab snapshot `:83`; restore `:143-160` (re-register, `elementRegistry.registerSemantic(op.id,'opening')`, `openingStore?.add?.(op)`, then **`slabStore.triggerRebuild(this.slabId)` when any opening was restored**). ✅ **C84's `:85-92` / `:145-157` CONFIRMED at `:85-94` / `:143-160`** |
| **Slab openings on `slab.delete` (L1 bus verb)** | `slab.delete` | ⛔ **no cascade** | `DeleteSlab.ts:21-29` — DTO delete only. Same shape as `wall.delete` ([C85 §8](C85-ELEMENT-WALL.md)) |
| **Slab ↔ wall connectivity** | wall baseline change | ⚠ guarded, suppressed on revert | `SlabWallConnectivityService.ts:1047` — one of only **THREE** `isReverting()` consumers repo-wide (with `WallMoveReweldService.ts:298` and `FinishHostDependencyTracker.ts:297`; definition `CommandManagerImpl.ts:741`; interface decls `finish-host-tracker:115`, `geometry-slab:130`, `geometry-wall:141`). Preceding guard `:1041` `isCascadeWallBaselineApplying()`. Propagation `:1049-1057` — `graph.get(wallId)` → `dependentSlabIds` → `propagating = true` → **ONE batched command** per §WALL-AUDIT-2026-W1. Rationale `:1043-1046` verbatim: *"§L-874 — undo/redo replays are not user moves. Reacting to a restore dispatched a fresh FORWARD cascade that compensated the very undo the user just performed (and cleared the redo stack)."* ✅ **The compliant [C72 §4](C72-PROPAGATION-AND-PREVSTATE.md) form** |
| **Stair → slab opening** | stair create/move | ⚠ | `packages/command-registry/src/stair/StairSlabOpeningReconciler.ts`; pinned `stairOpeningHostSlabContainment.test.ts`, `stairSlabOpeningSymmetry.test.ts` |
| **Slab → column** | — | ⚠ | **`SlabColumnCoupling.ts` exists in TWO packages at the SAME line number** — `packages/geometry-column/src/SlabColumnCoupling.ts:57` and `packages/geometry-slab/src/SlabColumnCoupling.ts:57`, byte-identical `worldY` comment. **A literal fork — C84 EI-9 with no EI-10 licence** |
| **Slab → curtain-wall / floor / level** | various | ⚠ | `CreateCurtainWallsFromSlabCommand`, `CreateCurtainWallsOnAllSlabsCommand`; `packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts`, `ProjectLoader.ts:1041` (`hostSlabId`); `SlabLevelCleanupHandler.ts`; graph `SlabDependencyTracker.ts` |
| **`plugins/cross` slab→wall rule** | `slab.move` | ⛔ **DORMANT — and the trigger is COMMENTED OUT** | `plugins/cross/src/slab-wall.ts:55` (`SLAB_MOVE = 'slab.move'`), **`:15` commented out**: `// if (cmd.kind === 'slab.move' \|\| cmd.kind === 'slab.setBaseOffset') {`. C84 **EI-12**: a trigger keyed on a verb nothing dispatches, inside a runner registered nowhere |
| **`slab.layer-updated`** | `slab.updateLayers` | ⛔ **FALLS ON THE FLOOR** | Repo-wide grep returns **exactly three hits, all on the producing side**: `CommandEventBridge.ts:929` (comment), `:937` (`events.emit`), `packages/runtime-composer/src/types.ts:443` (payload type). **No `events.on`, no subscriber, anywhere.** ⭐ `:929` names the intended subscriber — *"so FragmentBuilder subscribers know … and can trigger a mesh rebuild"* — **and that subscriber was never written.** Changing a slab's system type or layer stack emits a well-formed event into a void. **C84 EI-13 CONFIRMED independently.** The sibling `ceiling.layer-updated` (`:957`, type `:575`) is the same shape |
| **Slab → room** | — | **NOT MEASURED** | no direct cascade found; nearest is `apps/editor/src/ui/dataworkbench/roomContentsFacets.ts:277` (`elementType: 'slab' as const`), read-only |

### TO-BE — normative

- **SL-X-1 (EI-4a).** `slab.delete` (L1) and `DeleteSlabCommand` (L2) MUST become one route. ⛔ Do
  **not** copy the opening cascade into the L1 handler.
- **SL-X-2 (EI-13).** `slab.layer-updated` MUST gain its subscriber or the emit MUST be deleted.
  The precedent for deletion is in the same file: `CommandEventBridge.ts:627-631` records
  `door.created` / `window.created` / `stair.created` being removed for exactly this reason.
- **SL-X-3 (EI-9 / EI-10).** The two `SlabColumnCoupling.ts` copies MUST converge, or each MUST earn
  an EI-10 licence with an **executed** equivalence proof.
- **SL-X-4 (EI-12).** `plugins/cross/src/slab-wall.ts` MUST declare itself **dormant** with the
  condition that makes it live, rather than carrying a commented-out trigger that reads as
  temporarily disabled.

---

## 9. VOCABULARIES

### THREE "mode" vocabularies, and the L-956 confusion is structural

| Vocabulary | Members | Site |
|---|---|---|
| `SlabPlanMode` — *which tool* | **5** — `'2point' \| 'polyline' \| 'region' \| 'hollow' \| 'pickWalls'` | `apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:42` |
| `BoundaryDrawMode` — *which constraint* | **3** — `'linear' \| 'ortho' \| 'curved'` | `packages/geometry-slab/src/boundaryPath.ts:46`; imported `SlabPlanToolHandler.ts:26`, `SlabTool.ts:23` |
| `SlabToolMode` — the 3-D tool's own | **5** — `'NONE' \| 'FLOOR_SKETCH' \| 'REGION_SLAB' \| 'POLYLINE_SLAB' \| 'HOLLOW_SLAB'` | `packages/geometry-slab/src/SlabTypes.ts:14`, **re-declared INLINE at `SlabTool.ts:142` and `:304` — three copies of one union** |

> ⛔ **EI-3 VIOLATION: `'pickWalls'` is UNREACHABLE.** `SlabPlanMode` declares it (`:42`);
> `_getMode()` (`:660-667`) has no arm producing it; `SlabToolMode` has no `PICK_WALLS` member.
> `grep pickWalls SlabPlanToolHandler.ts` returns **only `:42`**. A declared mode nothing can select.
> (`SlabPickWallsController.ts` exists and is not wired to this enum.)

### Other vocabularies

- `SlabLayerFunction` — `SlabTypes.ts:20-23+` (`'finish-surface' | 'screed' | 'insulation' | …`);
  record `SlabLayer:32-37`. **Unreachable from the bus** (§5 row 14).
- Material key composition (Stack B): `composeSlabMaterialKey(systemTypeId, materialId, color,
  'top'|'bottom'|'side')` — `producers/slab.ts:107-109`, with `TOP_FALLBACK_COLOR` `:106`,
  `BOTTOM_FALLBACK_COLOR` `:108`, `SIDE_FALLBACK_COLOR` `:109`. **Three material slots per slab.**
- **`plugins/slab/src/material-bridge.ts` DOES NOT EXIST.** `ls plugins/slab/src/` →
  `committer/`, `errors.ts`, `handlers/`, `index.ts`, `intent.ts`, `store.ts`, `tool.ts`.
  `grep -rn "_key" plugins/slab/src/` → **ZERO hits.** ⭐ **C84 EI-8's `_key`-discard question is
  MOOT for slab: there is no slab material bridge at all.** The family's material path terminates at
  `SetSlabMaterialHandler`, which refuses (`:83`).

### TO-BE — normative

- **SL-Voc-1 (EI-3).** `'pickWalls'` MUST be removed from `SlabPlanMode` or given a producer.
- **SL-Voc-2 (EI-9).** `SlabToolMode` MUST have ONE declaration. Three copies
  (`SlabTypes.ts:14`, `SlabTool.ts:142`, `:304`) is a transcribed table with no EI-10 licence and no
  pinning test (**EI-8a**: a comment is not a synchronisation mechanism).
- **SL-Voc-3 — TWO ORTHOGONAL CONCEPTS MUST NOT SHARE ONE WORD.** `_getMode()` and `_drawMode()`
  both read as "mode". Any diagnostic MUST print **both**, or the next reader repeats L-956
  (§11 #2).

---

## 10. GEOMETRY

### Stack A — `packages/geometry-slab/src/SlabFragmentBuilder.ts:132`

Sibling exports: `SlabEdgeRenderMode:65`, `SLAB_EDGE_MODE_SETTINGS:67`,
`applySlabEdgeRenderMode():94`, `SlabBuilderDeps:126`. Core:
`buildSlabGeometry(…, holes: {x,y}[][] = [])` `:920`, doc `:903-915`, CW normalisation `:927-929`,
hole-source precedence `:1078-1120`, BoxGeometry fallback `:1208`.

**CO-LIVING — C84 §3.5.3 CONFIRMED EXACTLY.** `SlabFragmentBuilder` `initBuilders.ts:348`,
`CeilingPanelBuilder` `:391`, `FloorPanelBuilder` `:422` — all imported from the **same package**
`@pryzm/geometry-slab` (`:42, :55, :60`), typed together `:239-241`, and stamping **three different
element identities**: slab (§1), `CeilingPanelBuilder.ts:241` `'ceiling'`,
`FloorPanelBuilder.ts:148` `'floor'`. Corroborating comment `:176-178`. ✅ **Different questions,
different outputs — no EI-10 licence required.**

### Stack B — `packages/geometry-kernel/src/producers/slab.ts:86` (`produceSlab`)

Exported `geometry-kernel/src/index.ts:158`, `plugin-sdk/src/index.ts:273`. Triangulator lineage
`packages/geometry-kernel/src/pure/triangulatePolygon.ts:7, :24, :37`.

### Proven to agree? — **NO. `tests/parity/slab/` is a Stack-B SELF-snapshot.**

`tests/parity/slab/` → `configs`, `cw-snapshot.test.ts`, **`slab-snapshot.test.ts`**, `snapshots`,
`vitest.config.ts`.
- `slab-snapshot.test.ts:13-21` imports `vitest`, `produceSlab` / `composeSlabGeometryHash` /
  `assertValidDescriptor` from `geometry-kernel`, `Slab` / `createId` from `@pryzm/schemas`,
  `JoinData`. **`SlabFragmentBuilder` appears ZERO times in the file.**
- Sole call site `:169` `const desc = produceSlab(slab, NO_JOIN, 0);`
- Header `:3-4`: *"18 fixtures × `produceSlab` → snapshot the descriptor's shape (vertex / index
  counts, group / material count, bounds extents, hash)."*
- `grep -rn "produceSlab"` returns **no file that also references `SlabFragmentBuilder`**.
  `apps/bench/src/benches/produce-slab.bench.ts:15` likewise exercises Stack B alone.

> ⛔ **C84 §5 lists the slab harness as OWED. CONFIRMED — the debt is unpaid, and the existence of a
> directory named `tests/parity/slab/` is what has kept it looking paid.** This is C84 **§8.e**
> verbatim, and it is the **same finding as [C90 §10](C90-ELEMENT-ROOF.md)** for roof.

### Datum — TOP-referenced, and the two stacks agree in intent

`packages/geometry-kernel/src/producers/slab.ts:102-103`:
```ts
const yTop = worldY + slab.baseOffset;
const yBot = yTop - slab.thickness;
```
Legacy declaration `SlabTypes.ts:65-70`: *"§03 Semantic anchor: the slab is positioned so its TOP
face aligns with the level datum (Finished Floor Level). Default: `'LEVEL'`."* `baseOffset` `:71-75`:
*"Vertical offset (metres) applied to the top face above the level elevation."*
`SlabData.position.y` is *"always 0 (world Y is resolved at projection time from BimManager)"*
(`:49-50`).

> ⭐ **`slabBaseOffset` never appears in `SlabFragmentBuilder.ts` or in `producers/slab.ts`.** It is a
> **wall-side and column-side** concept exclusively: everything that sits ON the slab reads it.
> `WallRebuildCoordinator.ts:274, :295` · `CreateColumnCommand.ts:129` ·
> `geometry-column/SlabColumnCoupling.ts:57` · `geometry-slab/SlabColumnCoupling.ts:57` ·
> `composeWallGeometryHash.ts:23, :99, :107, :147` · `geometry-wall/SlabWallCoupling.ts:61` ·
> `WallFragmentBuilder.ts:128, :163, :184, :187, :583, :599, :603, :605` ·
> `FloorFinishSeating.test.ts:28-29`.
> **And the formula `worldY = level.elevation + slabBaseOffset + (x.baseOffset ?? 0)` is restated
> VERBATIM in three separate comment blocks with no shared implementation** —
> `geometry-column/SlabColumnCoupling.ts:57`, `geometry-slab/SlabColumnCoupling.ts:57`,
> `geometry-wall/SlabWallCoupling.ts:61`. **EI-9: one question, three prose copies, zero shared
> code.**

### TO-BE — normative

- **SL-G-1 (EI-11).** A Stack A ↔ Stack B parity harness is **OWED** (C84 §5). It MUST consume C73's
  declared tolerance module (`packages/geometry-kernel/src/tolerance.ts`, shipped 2026-08-13 per
  **L-954**) and MUST NOT ship a bare call-site literal.
- **SL-G-2 (EI-9).** The `worldY = level.elevation + slabBaseOffset + baseOffset` formula MUST have
  ONE implementation that all three couplings call.
- **SL-G-3.** The hole-source precedence at `SlabFragmentBuilder.ts:1078-1120` MUST be restated as a
  normative rule here once SL-S-3 is decided — it is currently the only place the two hole records
  are reconciled, and it is reconciled *in a renderer*.

---

## 11. THE DELTA

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** | **`holes` dropped by BOTH `CommandEventBridge` arms** (`grep -c holes` → 0), though every other layer carries it | **the hole the user drew** — the slab renders solid and the command reports success | C84 **EI-2(a)** | dispatch `slab.create` with `holes`, assert the mesh is perforated **at the layer that renders** ([[committed-is-not-reachable]]) |
| **2** | **[L-956](../../04-reference/ISSUE-LOG.md) — "By Region" slab.** ⚠ **HALF-CLOSED, AND THE ISSUE LOG IS STALE.** Defect (2) — *"no region arm in the click handler"* — **NO LONGER HOLDS**: `SlabPlanToolHandler.onClick:115` has a region arm at `:117-130` that commits (`this._commitSlab()` `:125`) and returns `:129`. Defect (1) — mode propagation — **SURVIVES** via `_getMode()`'s fall-through `return 'polyline'` at `:666`: any unrecognised or `undefined` `window.slabTool?.toolMode` silently becomes POLYLINE. And **the misleading diagnostic is untouched**: `:78-81` still prints only `_drawMode()` | the region gesture, when the mode is lost | C84 **EI-3**, **§4B** | log **both** axes; pin the mode round-trip. ⛔ Non-regression: polyline, 2-point and hollow all work today and the founder uses them — pin them first, watched RED |
| **2a** | ⭐ **AND THE FIX CREATED THE HAZARD L-956 WARNED ABOUT.** There are now **TWO independent region committers**: plan `SlabPlanToolHandler.ts:125`, and 3D `SlabTool.ts:570` **and** `:762` (two arms in the 3D tool alone). `:844-855` is preview-only (`:847` — *"Previously REGION_SLAB had NO onPointerMove branch here, so in 3D the…"*) | divergence between the two paths, silently | C84 **EI-9** | one committer, or an EI-10 licence with an **executed** equivalence proof |
| **3** | **Batch slabs are 1 m × 1 m by construction** — the batch cast (`:377-390`) has no `width`/`depth` field to read, so `initTools.ts:1728-1729`'s `?? 1` fires on **every** element, always; `position` is forced to `{0,0,0}` at `:403` | **every batch-created slab's real extents** | C84 **EI-2(a)** | dispatch a batch, assert extents match the polygon |
| **4** | `'opening'` is declared by `CreateSlabCommand.ts:43` and has **no `createSnapshot` branch and no `buildUndoStoreMap` entry** | **the rollback that was promised** for every slab and roof hole | C84 **EI-7c/EI-7d** · L-953 | `check-affected-stores.ts` + `check-undo-store-coverage.ts`. **One fix, two families** |
| **5** | **Eleven of fifteen verbs write the dead DTO store and report success**, while two refuse for exactly that reason. `slab.addHole`/`slab.removeHole` are the worst | every hole, thickness, offset and type edit made through the bus | C84 **EI-2**, [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) | route (CA-17) or refuse (CA-18) |
| **6** | Slab ratchets `metadata.version` on every undo — `UpdateElementParameterCommand.ts:410-414` excludes it, and `:213-218` **names slab first** among the uncovered | audit comparability — **the model is not the same model** | [ADR-0319 §2](../adrs/) · **L-952** | ⛔ control first, watched RED: assert byte-equal |
| **7** | `slab.layer-updated` emitted at `CEB:937` with **zero subscribers repo-wide**; `:929` names the subscriber that was never written | **the mesh rebuild after a layer/system-type change** | C84 **EI-13** | wire the subscriber or delete the emit — the precedent is `CEB:627-631` |
| **8** | `materialColor`, `layers`, `sketch`, `topReference` unreachable from the bus; `sketch` requires a second command that **can fail** (`SlabPlanToolHandler.ts:324-331`) | a layered slab arrives unlayered; a region slab may lose its host references | C84 **EI-2** | round-trip each |
| **9** | Batch arm folds `systemTypeId` into `materialId` (`:406`) | the slab's system type, **masquerading as a material** | C84 **EI-8** | split the fields |
| **10** | Four `elementType` spellings — **all four from `SlabFragmentBuilder.ts` (`:411, :592, :1261, :1305`)**; `.toLowerCase()` cannot collapse `'slabpart'` → `'slab'` | delete/selection routing correctness | C84 **§4E** + [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) | one frozen tag + `role`/`parentId` sub-parts |
| **11** | `tests/parity/slab/slab-snapshot.test.ts` never imports `SlabFragmentBuilder` — Stack B against itself | nothing today; every future kernel divergence ships unseen | C84 **EI-11**, **§8.e** | build SL-G-1 |
| **12** | `SlabColumnCoupling.ts` **byte-forked across two packages at the same line number** (`:57` in both) | maintenance divergence, silently | C84 **EI-9** | converge, or EI-10 licence |
| **13** | `initTools.ts:1714`'s second clause is dead code; `types.ts:420` declares a union member that cannot occur | nothing — but it is EI-2(b)'s constant-comparison mechanism, invisible to `tsc` and review | C84 **EI-2(b)** | delete both |
| **14** | `'pickWalls'` declared in `SlabPlanMode:42`, producible by nothing; `SlabToolMode` declared **three** times | a dead mode; three tables to drift | C84 **EI-3**, **EI-9**, **EI-8a** | remove / one declaration + pinning test |
| **15** | `plugins/cross/src/slab-wall.ts:15` — the trigger is **commented out**, inside a runner registered nowhere | nothing; it reads as temporarily disabled | C84 **EI-12** | declare dormant with its condition |
| **16** | `window.slabStore` assigned twice (`initBuilders.ts:343`, `initTools.ts:994`) | non-determinism nobody can see | C84 **EI-9** | one assignment |

> **Lane note (C84 §6 discipline):** lane S1 is fixing **#2** as this contract is written. The DELTA
> states C92's **normative requirement**, not a work order. When S1 lands, #2's row moves to a
> `✅ CLOSED` with the pin named — it is not deleted (C84 §6 — *record retractions*).
>
> ⚠ **AND THE STALENESS IS ITSELF A FINDING.** L-956 was written against the deployed build
> `d5b8d82f`; `git log -- SlabPlanToolHandler.ts` shows `006fbbd4 fix(slab): §SLAB-REGION-CURVED +
> §SLAB-REGION-3D`, `e6c8cb58 feat(slab): a slab drawn BY REGION now follows its walls`,
> `625a9926 refactor(roof): … roof-by-region ported to shared slab region tracer` already on `main`.
> **A defect measured against a deploy is not a defect measured against HEAD**, and a lane sent to
> "fix" #2 without re-measuring would have rebuilt a branch that exists — the L-954 failure mode
> (*"check the module or run the gate; never cite a contract for whether code exists"*) applied to an
> issue log.

---

## 12. REFUSALS

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `slab.create` refuses **conditionally**, on a three-valued predicate: no authoritative store in this process → proceed; registered **and** engine-attached → proceed (the browser, unchanged); registered **and NOT attached** → refuse and name why | `CreateSlab.ts:68-76` (reason), `:80-89` (`authoritativeSlabStoreRefusal()`) | ✅ **CORRECT.** The §CONTEXT-DATA-HONESTY shape — *"unjudgeable ≠ failure"* (`:85`). And `:46` states the discipline: *"Refusing outright would delete slab creation."* Twin of [C85 §12 R-1](C85-ELEMENT-WALL.md) |
| **R-2** | `slab.move` refuses unconditionally, naming `slab.movePolygon` and its exact payload keys | `MoveSlab.ts:76-77`, `:113` | ✅ **CORRECT AND REQUIRED** under [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md). ⛔ MUST NOT be "fixed" into silent success |
| **R-3** | `slab.setMaterial` refuses, naming `slab.updateDimensions` and recording that `UpdateSlabCommand` **deliberately THROWS** on material fields | `SetSlabMaterial.ts:56-57`, `:83` | ✅ correct — and the throw is itself a declared refusal |
| **R-4** | `CreateSlabsOnAllFloors` refuses a missing reference slab, naming it | `CreateSlabsOnAllFloors.ts:23` (`{ok:false, reason:'Reference slab <id> not found.'}`), `:65` | ✅ correct |
| **R-5** | The L0 schema refuses a CLOSED boundary (duplicated closing vertex) | `Slab.ts:63-70`, message `:69` | ✅ correct — a representation invariant enforced at parse |
| **R-6** | `SlabFragmentBuilder` refuses holes without a polygon outline, falling back to `BoxGeometry` | `:1208` — *"holes not supported without a polygon outline"* | ⚠ **A SILENT FALLBACK, NOT A REFUSAL.** It renders a box and says nothing. It MUST warn or refuse |
| **R-7** | **`canExecute` MUST be the LAST method before `execute`** | `MoveSlab.ts:98-107` | ⚠ **A GATE'S PARSER SHAPING THE SOURCE** — a census tool slices from `canExecute` to the next `execute(`. C84 §7B.5's shape. Declared, not hidden. Same note as [C85 §12 R-5](C85-ELEMENT-WALL.md) |
| **R-8** | No rotate verb, no colour verb | §6 | ⚠ **TWO UNDECLARED ABSENCES, DECLARED HERE.** ⚠ **CORRECTED 2026-08-19 (L-1032)** — this row read *"no bus level-change verb"* as a third absence. `slab.changeLevel` now exists and is reachable from the property panel. The absence is CLOSED, not re-declared |
| **R-9** | The ten `<kind>.delete` bus verbs are **DORMANT, not broken** | C84 §3.5.3 | ✅ ⛔ do not delete — PRYZM 3 target vocabulary |
| **R-10** | Stack B has no editor render path | C84 §4D; `main.ts:407` passes `canvas: null` | ✅ declared. ⛔ Nothing in `geometry-kernel/src/producers/` may be deleted as dead — **ADR-0331 §D5 is an open FOUNDER question** (C84 §9) |

### Explicitly NOT REFUSED, and that is the finding

`slab.addHole` accepts a hole, validates it (`:41`), writes it to `s.holes` — **into a store no
renderer, projector, exporter or persistence path reads**, per the codebase's own words at
`SetSlabMaterial.ts:57`. It reports success. Under C84's governing sentence
(`WallRake.ts:50-62` — *"A refusal is a correct answer; a silently-wrong wall is not"*) it ought to
refuse today, and it does not.

---

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances (C84 EI-1b).

1. **Which store `plugins/plan-view` is handed for slabs** — `projection.ts:43` takes
   `readonly slabs: readonly Slab[]` from its host. C84 §9 records plan-view authority as unmeasured
   for every family; here it matters more, because the plan tool is a live founder surface.
2. **Whether the UI still offers `slab.move` / `slab.setMaterial`** — the EI-3 control census, owned
   by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
3. **Bake-worker slab handling** — no slab code located in `apps/bake-worker/src`; whether that is an
   absence or a miss was not resolved.
4. **`slab.create-on-all-floors`** (`affectedStores: [] :58`) — its delegate's write and restore sets.
5. ~~**Whether any surface dispatches `UpdateSlabLevelCommand`** — the level-change axis.~~
   **MEASURED 2026-08-19 (L-1086): nothing does.** See §6 SL-V-3. Struck rather than deleted so the
   register records that the question was answered, not that it was dropped.
6. **Whether `SlabLayerFunction` members all survive to the builder** (EI-3 sweep).
7. **Whether the 3-D region committer (`SlabTool.ts:570`, `:762`) and the plan committer
   (`SlabPlanToolHandler.ts:125`) produce identical geometry** — the #2a equivalence proof.
8. **Slab → room cascade** — none found; absence not proven.
9. **`packages/persistence-client/src/loader/`** — deliberately not measured; DEAD.

---

## Appendix — C84 claims this contract CONFIRMED, REFINED or REFUTED

| C84 claim | Verdict |
|---|---|
| `slab.holes` dropped by BOTH CEB arms (`:342-368`, `:392-407`) though `SlabData` has the field | **CONFIRMED** — arms measured `:336-370` and `:372-410`; `SlabData.holes` at `SlabTypes.ts:53`; `grep -c holes CommandEventBridge.ts` → **0** |
| batch slabs lose `width`/`depth` and are defaulted to 1 m extents (`initTools.ts:1728-1729`) | **CONFIRMED** verbatim, and **sharpened**: it is not a default-in-absence-of-data — the batch cast has no field to read, so `?? 1` fires **always** |
| CEB rewrites batch `commandType` to the single spelling, making the `!== '*.batch.create'` guards dead code (§4B) | **CONFIRMED** — `:397`; the dead clause is `initTools.ts:1714`, and `types.ts:420` declares an impossible union member |
| `slab.move` refuses in `canExecute` | **CONFIRMED** `:113`, with **zero production dispatchers on both axes**. `slab.setMaterial` also refuses `:83` |
| `DeleteSlabCommand` captures slab openings and restores them | **CONFIRMED** — `:85-94` / `:143-160` (C84 cited `:85-92` / `:145-157`) |
| `SlabWallConnectivityService.ts:1047` is one of only three `isReverting()` consumers | **CONFIRMED** — with `WallMoveReweldService.ts:298`, `FinishHostDependencyTracker.ts:297`; definition `CommandManagerImpl.ts:741` |
| `slab.layer-updated` (`CEB:937`) has ZERO subscribers (EI-13) | **CONFIRMED** independently — three hits repo-wide, all producer-side |
| `SlabFragmentBuilder` / `FloorPanelBuilder` / `CeilingPanelBuilder` → CO-LIVING at `initBuilders.ts:348, 422, 391` (§3.5.3) | **CONFIRMED EXACTLY**, and extended: all three come from **one package** and stamp three element identities |
| slab appears as `'slab'`/`'Slab'`/`'SlabPart'`/`'SlabEdges'` (§4E) | **CONFIRMED, and LOCALISED** — all four literals are in `SlabFragmentBuilder.ts` (`:411, :592, :1261, :1305`), and `'Slab'` is **frozen** at `:419` |
| slab / door / window parity harnesses OWED (§5) | **CONFIRMED for slab** — `tests/parity/slab/slab-snapshot.test.ts` never imports `SlabFragmentBuilder`. ⚠ The directory's existence is what has kept the debt looking paid |
| three `material-bridge.ts` files take `_key` and discard it (EI-8) | **MOOT FOR SLAB** — `plugins/slab/src/material-bridge.ts` does not exist; `grep _key plugins/slab/src/` → 0 |
| **L-956** *"the plan handler has no region branch"* | ⚠ **NO LONGER HOLDS AT HEAD** — `SlabPlanToolHandler.ts:117-130` commits. The mode-propagation half and the misleading diagnostic survive; and the fix realised the EI-9 hazard L-956 itself warned about (§11 #2a) |

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **PUBLISHED, running its FALLBACK path**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `slab` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1652 (approx — the `elType === 'slab'` arm) |
| **Type catalogue** | ✅ `slabSystemTypeStore` — **but NOT injected**: `lookup: generic('slab')` reads `ctx.catalogues.slab`, which has no production writer (**L-1146**) |
| **Type field on the record** | ✅ `systemTypeId` + `layers`, serialised at `ProjectSerializer.ts:649` |
| **Executor the chat must use** | `slab.updateSystemTypeBatch` → `UpdateSlabsSystemTypeBatchCommand` → `UpdateSlabLayersCommand` → geometry `slabStore` (`:66`) |
| **Chat capabilities published TODAY** | `set-slab-type` · `set-thickness` · `set-base-offset` |
| **Retiring condition** | Inject `ctx.catalogues.slab` — L-1146. |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ✅ works |
| `selection` | ✅ required | ✅ works |
| `level` | ✅ required | ⚠ **works, UNDECLARED** (L-1142) |
| `room` | ✅ required | ⚠ **works, UNDECLARED** (L-1142) |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⭐ **SLAB IS THE ONE HANDLER THAT IS HONEST AT THE BUS BOUNDARY, AND ITS HEADER IS THE SPEC FOR FIXING THE OTHER FOUR.** `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts:27-40` quotes C16 §5.1 **CA-18** — *"`{forward:[], inverse:[]}` returned as the outcome of a mutation the user asked for"* — reads `report.success`, keeps `report.info[0]` as `refusal`, and **throws** (`:192-194, 204-209`). `wall`, `window`, `door` and `ceiling` all still return unconditionally. **L-1141.**
- ⚠ **L-1146 — resolves command-side, not chat-side**, for the same reason as ceiling; refuses honestly, but the family's own refusal copy is dead code at runtime.
- ⛔ **L-1143 — a slab is the SUBJECT of the founder's broken case.** *"CREATE WALLS BY SLAB"* with a slab selected is refused, and the tool mode that ought to do it walls **every** slab in the project. There are **FOUR** rival slab→walls implementations (C84 §4F.6); the RAC must route to `wall.createFromSlab` and mint no fifth (P6, EI-4a).
- ⚠ **L-1142 — declared `['all','selection']`, honours `level`, `room`, `orientation`.**

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.
