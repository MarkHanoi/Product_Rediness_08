# C89 — ELEMENT: FLOOR (floor finish)

- **Status**: CANONICAL — binding on every PR touching the floor family
- **Date**: 2026-08-18
- **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — the twelve mandatory sections. **C84's
  EI-1…EI-13 are applied here, not restated.**
- **Cites, does not restate**: [C03 §4.5/§4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (**CA-18**:
  a refusal that names its reason is conformance) · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)
  (tolerance) · [ADR-0319 §2](../adrs/) (audit fields across undo — **not C75**) ·
  [C79 §7.1/§9.3/§10.3](C79-REGION-SEMANTICS.md) (region semantics, `boundingWallIds`) ·
  [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`elementType` casing) ·
  [C74](C74-CONSTRAINT-HONESTY.md) (an unresolved constraint may not be drawn as a value).
- **Measured**: 2026-08-18, main worktree `Product_Rediness_08`, HEAD `18eab722`.
- **Which persistence half was checked**: the **LIVE** pair
  `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts`, confirmed live by
  `apps/editor/src/engine/initPersistence.ts:41-43`. `packages/persistence-client/src/loader/` is
  the **dead** copy — the live files say so at `ProjectSerializer.ts:268-271` and
  `ProjectLoader.ts:328-331`.

> ⭐ **THE HEADLINE FINDING FOR THIS FAMILY IS A CLEAN NEGATIVE RESULT, AND IT IS RECORDED AS ONE
> (C84 EI-1b).** C84 §4 grades floor **`✅ most complete of the twelve`** on EI-2, and the
> measurement holds: `CommandEventBridge.ts:1007-1024` forwards **fourteen** payload fields
> including `layers`, `finishSpec`, `serviceHoles`, `systemTypeId`, `hostSlabId`, `hostRoomId`,
> `createdBy` and `ifcGuid` — the only bridge in the repo that carries an assembly, a finish spec
> and a stable IFC GUID. **Floor's defects are NOT in the field map.** They are: no delete verb,
> no IFC reader, forward references that are never written back, and an order-dependent label.

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE |
|---|---|---|
| Canonical `userData.elementType` | **`'floor'`** — `packages/geometry-slab/src/floor/FloorPanelBuilder.ts:148`. **One spelling; no rival.** | unchanged; frozen per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| Other spellings | **NONE FOUND.** `FloorStore` emits `elementType: 'floor'` at `packages/core-app-model/src/stores/FloorStore.ts:128,186,233`; `DeleteElementCommand.ts:560` sets `this.elementType = 'floor'` | — |
| ⚠ Name collision, **not** a spelling variant | `'floor'` the **finish** ≠ `'floor'` the **storey**. `DuplicateFloorPlanCommand` and `ProjectLoader`'s "floor plan" language mean the *level*. Measured distinct: `FloorStore` holds finishes; levels live in `bimManager` | this contract governs the **finish** only. A future rename is out of scope and must not be attempted piecemeal |
| L0 Zod schema | `packages/schemas/src/elements/Floor.ts` — `boundary: z.array(Vec3).min(3)` at `:84`. ⛔ **NOT ON THE CREATE PATH**: `CreateFloorHandler` never calls `Floor.parse`; its payload field is `polygon: FloorVertex[]` (`CreateFloor.ts:40`), a **different name and a different type** | the L0 schema is on the path, or it is declared unused |
| Bus verb namespace | `floor.*` — **three** registered verbs: `floor.create`, `floor.updateLayers`, `floor.setMaterial` (`plugins/floor/src/handlers/index.ts:13-15`). Plus `floor.update` (`commands.ts:1216`, L2-bridged) | see §12 R1 |
| Legacy geometry type | `FloorData` — `packages/core-app-model/src/stores/FloorTypes.ts`; `FloorVertex = {x, z}` at `:56` | unchanged |

> ⚠ **This row CLOSES a C84 §4E `NOT MEASURED`** (*"ceiling, floor and curtain-wall: NOT
> MEASURED"*). Floor's tag is single and lowercase: `FloorPanelBuilder.ts:148`.

---

## 2. Stores — and which one is the AUTHORITY

| # | Representation | Where | Written by | Read by |
|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Floor.ts` | — | **NOBODY on the create path** (§1) |
| 2 | **Plugin DTO store** | `plugins/floor/src/store.ts` | the three `floor.*` verbs | **measured: nobody.** `SetFloorMaterial.ts:57` says so in its own refusal text |
| 3 | **LEGACY geometry store — ⭐ THE AUTHORITY** | `packages/core-app-model/src/stores/FloorStore.ts`; instantiated `initBuilders.ts:418`, published `window.floorStore` `:419` | the `floor.created` bridge (`initTools.ts:1823-1905`) + legacy `CreateFloorCommand` | `FloorPanelBuilder` (`initBuilders.ts:422` + DOM listeners `:428-443`), plan projector, `ProjectSerializer.ts:1048`, `DeleteElementCommand.ts:556-574` |
| 4 | THREE scene `userData` | `FloorPanelBuilder.ts:148` | the fragment builder | GLB export, picking, delete routing |
| 5 | Kernel producer record | `packages/geometry-kernel/src/producers/` (floor geometry is produced through the slab/finish family) | committer | **bake worker does NOT read it** — `HeadlessBakeSession.ts:31,43,53,124-131` is `WallStore` + `produceWall` only |

**EI-1 verdict: ✅ SINGLE AUTHORITY — `FloorStore` (#3).** No split-brain. Recorded as clean.

**EI-1a — `'floor'` names two different objects across one command's lifecycle:**

| Moment | Resolves to | Site |
|---|---|---|
| WRITE | plugin DTO snapshot view | `apps/editor/src/bootstrap.ts:94,148-159` |
| UNDO | `window.floorStore` (legacy) | `performUndoRedo.ts` `buildUndoStoreMap()` — `floor: w.floorStore, floors: w.floorStore` |

All three `floor.*` verbs declare `['floor']` and take **neither** C03 U-2b exit. Delta §11.4.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3-D) | LEGACY | `initBuilders.ts:422` `new FloorPanelBuilder(scene, bimManager)`; the three `bim-floor-*` DOM listeners resolve the record from `floorStore` | ✅ |
| Plan view | LEGACY, via registration at the bridge | `initTools.ts:1896-1897` — `viewDependencyTracker.registerElement` + `bimManager.registerElement`, with `§FIX-PLAN-VDT-BIMMANAGER` / `§FIX-P4-FLOOR-BIMMANAGER` naming the prior defect at `:1890-1895` | ✅. Deeper plan-view store authority is `NOT MEASURED` (C84 §9 records the gap repo-wide) |
| Persistence (save) | LEGACY | `ProjectSerializer.ts:1048` `floorStore ? floorStore.getAll().map(f => deepStrip(f)) : []`; system types `:1049-1051` (non-built-in only) | ⚠ silent-empty hazard — below |
| Persistence (load) | LEGACY **via the legacy command** | `ProjectLoader.ts:1029` `new CreateFloorCommand({…})` — **no bus event.** So after any load the plugin DTO floor store is **EMPTY while `FloorStore` holds N** (C84 EI-5a, confirmed here for floor specifically) | ⚠ |
| IFC export | **NOTHING** | no `FloorReader.ts` in `packages/file-format/src/export/ifc/readers/`. Floor survives export only as the room property string `FloorCovering` (`readers/RoomReader.ts:145`) | ⛔ **EI-6 VIOLATION** |
| GLB export | scene `userData` | `FloorPanelBuilder.ts:148` | ✅ |
| Bake worker | **ABSENT** | `HeadlessBakeSession.ts:31,43,53` | ✅ no split |
| Sync | `floor.create` synced — `{kind:'element-property', subject:'floorId', conflict:'disclose'}` | `packages/sync-client/src/syncDisposition.ts:822` | ✅ **declared, and the only one of this contract's five families with a named `subject`** |

> ⚠ **SILENT-EMPTY HAZARD.** `floorStore` is **optional** on `ProjectStores`
> (`ProjectSerializer.ts:802`) and `:1048` resolves absence to `[]`. A save from a caller that did
> not pass the store writes zero floors and reports success. **Latent** — the one production site
> (`initPersistence.ts:41-43`) passes it — but it is `failure and empty are the same value`, and
> [C74](C74-CONSTRAINT-HONESTY.md) forbids exactly that shape. Make it required, or refuse.

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

| Handler | Verb | Registered? | UI-reachable? | State |
|---|---|---|---|---|
| `CreateFloorHandler` | `floor.create` | ✅ `handlers/index.ts:13` | ✅ `FloorPlanToolHandler.ts:480` dispatches it | **LIVE** |
| `UpdateFloorLayersHandler` | `floor.updateLayers` | ✅ `:14` | ✅ `PropertyPanelTypeSelector.ts:161` | LIVE |
| `SetFloorMaterialHandler` | `floor.setMaterial` | ✅ `:15` | ⚠ **REFUSES** — `SetFloorMaterial.ts:85` | see §6 |
| **`floor.delete`** | — | ⛔ **DOES NOT EXIST** | — | ⛔ **THE FAMILY'S DEFINING ASYMMETRY** |
| `floor.update` | L2 bridge | `commands.ts:1216` | property panel | L2 |
| Legacy `CreateFloorCommand` | — | `packages/command-registry/src/floors/CreateFloorCommand.ts` | load path + `CreateFloorsByRoomTypeCommand` | **L2, LIVE** |
| Legacy `RemoveFloorCommand` | — | `packages/command-registry/src/floors/RemoveFloorCommand.ts` | — | L2 |
| Legacy `UpdateFloorBoundaryCommand` | — | `.../UpdateFloorBoundaryCommand.ts` | — | L2 |

> ⛔ **`plugins/floor` DECLARES NO `floor.delete` VERB AT ALL — the only family of the fifteen that
> does not.** C84 §4B and EI-5 both record it; measured here at `plugins/floor/src/handlers/index.ts:13-15`
> (three verbs, none of them a delete) and by the absence of any `DeleteFloor.ts` in
> `plugins/floor/src/handlers/`.
>
> **This is NOT the same finding as the other fourteen families' dormant `*.delete`.** Theirs are
> **DORMANT** (C84 §3.5.3: registered, undispatched, and *"the PRYZM 3 target vocabulary — do not
> delete them"*). Floor's is **ABSENT**. The consequence is identical today — the plugin DTO record
> is orphaned by every user delete, because the delete that runs is
> `DeleteElementCommand.ts:556-574`, which touches only the legacy store — but the **repair is
> different**: the other fourteen need routing; floor needs the verb to be **written**, to the
> shape `DeleteCeilingHandler` already has.

**Reachability measured on BOTH axes** (C84 §3.5.1): (a) import — `buildFloorHandlerSet`;
(b) bus — `grep "floor.create'"` over `apps/ plugins/ packages/` less `__tests__` returns exactly
one production dispatcher, `FloorPlanToolHandler.ts:480`.

---

## 5. THE BRIDGE FIELD MAP — every field, no omission

**The bridge**: `floor.create` payload → `CommandEventBridge.ts:988-1026` → `initTools.ts:1823-1905`
→ `FloorStore.add()`. **This is the gate's input.**

| Payload field | CEB | initTools | Destination in `FloorData` | Disposition |
|---|---|---|---|---|
| `floorId` | `:1011` | `:1841` | `id` | **CARRIED** |
| `ifcGuid` | `:1012` | `:1879` `ev.ifcGuid ?? crypto.randomUUID()` | `ifcData.guid` | ✅ **CARRIED — and floor is the ONLY family in this cohort that carries a caller-minted GUID.** `FloorPlanToolHandler.ts:478` mints it before dispatch. Compare C88 ceiling, whose bridge mints a fresh one every replay |
| `polygon` | `:1013` — cast as `Array<{x,y,z}>` at `:994` | `:1848` `polygon: ev.polygon` — **no conversion** | `boundary.polygon: FloorVertex[]` = `{x,z}` | ✅ **CARRIED. NO AXIS SWAP — see the resolution below** |
| `baseOffset` | `:1014` | `:1861` `?? DEFAULT_FLOOR_FINISH_BASE_OFFSET_M` | `boundary.baseOffset` | **CARRIED**; the default is a **named constant, not a literal** — `initTools.ts:1849-1860` records why (L-255) |
| `thickness` | `:1015` | `:1862` `?? DEFAULT_FLOOR_FINISH_THICKNESS_M` | `boundary.thickness` | **CARRIED**, named default |
| `label` | `:1016` | `:1834` `ev.label ?? \`Floor-NN\`` | `label` | **CARRIED**, with an order-dependent fallback — see §7 |
| `systemTypeId` | `:1017` | `:1865` | `systemTypeId` | **CARRIED** |
| `layers` | `:1018` | `:1866` | `layers` | ✅ **CARRIED — the full assembly.** No other bridge in this cohort carries one |
| `finishSpec` | `:1019` | `:1835-1839` + `:1867` | `finishSpec` | **CARRIED**, with a three-field default object |
| `serviceHoles` | `:1020` | `:1869` `?? []` | `serviceHoles` | ✅ **CARRIED.** Compare slab, whose holes are **dropped** at `CEB:342-368` (C84 EI-2a) — floor is the counter-example |
| `hostSlabId` | `:1021` | `:1872` | `hostSlabId` | **CARRIED** — see the forward-ref caveat, §8 |
| `hostRoomId` | `:1022` | `:1870` (→ `coveredRoomIds`) + `:1873` | `coveredRoomIds`, `hostRoomId` | **CARRIED**, duplicated into two fields |
| `createdBy` | `:1023` | `:1886` `?? 'user'` | `metadata.createdBy` | ✅ **CARRIED — provenance survives.** Compare ceiling, which hard-codes `'user'` |
| `levelId` | `:1010` | `:1843`, `:1844` | `levelId`, `parentId` | **CARRIED** |
| `finishThicknessM` | ⛔ **not in the CEB cast** (`:991-1006`) | — | consumed **before** the bridge, by `resolveFinishSeating` in `CreateFloor.ts:99-105` | **DELIBERATELY NOT BRIDGED** — it is an *input to a resolution*, not a stored field. Declared |
| `slabTopOffsetM` | ⛔ same | — | same | **DELIBERATELY NOT BRIDGED** |
| — | — | `:1846` `floorNumber: \`F.NN\`` | `floorNumber` | **MINTED, order-dependent** (§7) |
| — | — | `:1863` `detectionMethod: 'manual-polygon'` | `boundary.detectionMethod` | ⛔ **HARD-CODED.** An AI- or generator-authored floor is recorded as hand-drawn. `DetectionMethodOrigin.ts:342` classifies this value as *"user drew the finish outline (FloorTool / CeilingTool)"*. The payload has no provenance field to carry, so this is a **schema gap**, not a bridge omission |
| — | — | `:1868` `slope: undefined` | `slope` | ⛔ **UNREACHABLE.** `FloorData` holds a slope; no payload field can set one. **EI-3 inverse** |
| — | — | `:1871` `boundingWallIds: []` | `boundingWallIds` | ⛔ **SEEDED EMPTY BY THE BUS PATH — and the LEGACY path POPULATES it.** `CreateFloorCommand.ts:350` writes `boundingWallIds: sketch.boundingWallIds`, which is [C79 §9.3](C79-REGION-SEMANTICS.md)'s **POPULATE** fix, closed 2026-08-13. **Two creation paths, one honours C79 and one does not.** EI-9. `CreateFloorCommand.ts:129-135` even warns that this field is *"the §7.2(a) claim a reader and a grep-auditor see"* |
| — | — | `:1874` `colour: undefined`, `:1875` `opacity: 1`, `:1876` `visible: true`, `:1877` `properties: {}` | ditto | **HARD-CODED** — no payload field exists |
| — | — | `:1880-1881` `ifcClass:'IfcCovering'`, `predefinedType:'FLOORING'` | `ifcData` | **HARD-CODED** — correct and intended |
| — | — | `:1883-1888` `createdAt/modifiedAt: Date.now()`, `version: 1` | `metadata` | **MINTED** — §7 |

### ⭐ THE POLYGON AXIS QUESTION — RESOLVED. There is NO axis swap.

C84's brief for this lane flagged it `NOT MEASURED`. Measured:

| Hop | Declared type | Runtime behaviour | Site |
|---|---|---|---|
| Production dispatcher | `polygon: Array<{x: number; z: number}>` | dispatched verbatim | `FloorPlanToolHandler.ts:449` (signature), `:483` (dispatch) |
| Plugin payload | `polygon?: FloorVertex[]` = `{x,z}` | assigned verbatim to `boundary.polygon` | `CreateFloor.ts:40`, `:106`, `:126` |
| CEB | **`polygon?: Array<{x,y,z}>`** at `:994` | **re-emits `p.polygon` verbatim at `:1013` — zero conversion** | `CommandEventBridge.ts:994,1013` |
| initTools | untyped `ev.polygon` | assigned verbatim | `initTools.ts:1848` |
| Destination | `FloorVertex = {x, z}` | — | `FloorTypes.ts:56`; Zod `FloorVertexSchema` `{x,z}` at `FloorDataSchema.ts:11-14` |

**Verdict: `{x,z}` in, `{x,z}` out. The CEB `{x,y,z}` annotation at `:994` is a FALSE TYPE
DECLARATION that is INERT** — it never converts, so it cannot swap. The canonical statement that
these are all `{x,z}` is already in the tree: `packages/command-registry/src/rooms/perRoomBoundary.ts:14`
(*"RoomVertex / FloorVertex / CeilingVertex are ALL `{x,z}` — no conversion"*) and
`CreateFloorsByRoomTypeCommand.ts:16`.

⚠ **The RESIDUAL risk is real and narrower.** Because the CEB annotation says `Vec3` and nothing
converts, **a caller that believes the annotation and sends `{x,y,z}` lands `{x,y,z}` objects in a
`FloorVertex[]`.** The stray `y` is not a swap — `x` and `z` still read correctly — but the record
then fails `FloorVertexSchema.parse` on any path that validates (`FloorDataSchema.ts:110,131`),
and `deepStrip` at `ProjectSerializer.ts:1048` will persist it. **`NOT MEASURED`: whether any
non-plan caller (AI, generator, importer) sends a `Vec3` polygon.** TO-BE: correct `:994` to
`{x,z}` — it is a one-line annotation fix that removes the trap.

**TO-BE for the map as a whole.** Floor is the reference implementation; the remaining rows to
close are `slope` (unreachable), `detectionMethod` (hard-coded provenance) and `boundingWallIds`
(C79). **Do not regress this bridge; the other eleven must converge UP to it.**

---

## 6. Verbs

| Verb | Lineage (C84 §4A) | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `floor.create` | **L1** | plugin DTO `floor` (`CreateFloor.ts:157-162`) **+** legacy `FloorStore` + `bimManager` + `viewDependencyTracker` via the bridge (`initTools.ts:1896-1897`) | legacy `FloorStore` only (`buildUndoStoreMap`: `floor → w.floorStore`) | ⛔ **NO — WRITES ⊋ RESTORES** (C84 EI-7a) |
| **DELETE** | — | ⛔ **NO VERB EXISTS** | — | ⛔ see §4 |
| **`element.delete`** (the real delete) | **L2** | `FloorStore.remove` `:573`, `bimManager.unregisterElement` `:564`, `semanticGraphManager.removeAllRelationshipsForElement` `:570`, `elementRegistry.unregister` `:571` | `createSnapshot` **covers `'floor'`** (`CommandManagerImpl.ts:618`); graph edges captured at `:569` | ⚠ plugin DTO not restored (never written by this path) |
| `floor.updateLayers` | L1 | plugin DTO only | legacy store (**wrong object** — EI-1a) | ⛔ NO |
| **`floor.setMaterial`** | — | **NONE — REFUSES** `SetFloorMaterial.ts:85` | — | ✅ **C16 CA-18 CONFORMANT.** Reason at `:57`: the DTO store *"is read by no renderer, no 2-D projector, no IFC exporter and no persistence path… Use `floor.update` instead"* |
| `floor.update` | **L2** | legacy `FloorStore` | legacy | `commands.ts:1216` |
| **BATCH CREATE** | — | **CAPABILITY ABSENT** — no `floor.batch.create`. The bulk path is the legacy `CreateFloorsByRoomTypeCommand` (L2) | — | ⛔ **UNDECLARED before this contract** — §12 R3 |
| **MOVE** | — | **CAPABILITY ABSENT** — a floor is a *region*; "move" is a boundary transform | — | §12 R4 |
| **ROTATE** | — | **CAPABILITY ABSENT** — same reason | — | §12 R5 |
| **BOUNDARY CHANGE** | **L2** | `UpdateFloorBoundaryCommand` — legacy only | legacy | ✅ symmetric within L2 |
| **PARAMETER / DIMENSION** via `element.updateParameters` | — | **REFUSES** — no `floor` entry in `ELEMENT_STORE_ROUTES` (`UpdateElementParameterCommand.ts:112-148`); an unrouted type *"refuses immediately… without writing anything"* (`:159-161`) | — | ✅ conformant, **undeclared until now** |
| **LEVEL CHANGE** | — | `NOT MEASURED` — no `floor.changeLevel` verb surfaced | — | `NOT MEASURED` |

**⚠ The EI-3 residual**: whether a UI control still offers "set floor material" while
`floor.setMaterial` refuses is **`NOT MEASURED`**; the control census is
[C82](C82-RIBBON-CAPABILITY-SURFACE.md)'s.

---

## 7. Undo / redo

| Verb | `affectedStores` declared | Measured write set | Equal? |
|---|---|---|---|
| `floor.create` | `['floor']` (`CreateFloor.ts:69`) | plugin DTO + legacy `FloorStore` + `bimManager` + `viewDependencyTracker` | ⛔ **NO** |
| `floor.updateLayers` | `['floor']` (`UpdateFloorLayers.ts:31`) | plugin DTO only | ✅ as a **set**, ⛔ as an **object** (EI-1a) |
| `floor.setMaterial` | `['floor']` (`SetFloorMaterial.ts:62`) | **none — refuses** | ✅ |
| `element.delete` (L2) | 15 keys incl. `'floor'` — `DeleteElementCommand.ts:55` | `FloorStore` | ✅ for floor |

**EI-7d — `createSnapshot` coverage: ✅ COVERED, with the same unrecorded caveat as ceiling.**

- `CommandManagerImpl.createSnapshot()` `:578-638` recognises `'floor'` at `:618`
  (`['floor','floorStore',(ctx.stores as any).floorStore]`). A declared `['floor']` rolls back.
- ⭐ **`'floor'` is NOT a member of the `StoreKey` union** (`packages/command-registry/src/types.ts:557-584`).
  **L-953 measures `union ∖ recognised` = 12 and does not measure the reverse.** `recognised ∖ union`
  = **2 — `ceiling` and `floor`.** `DeleteElementCommand.ts:55` compiles only because
  `Command.affectedStores` is `ReadonlyArray<string>` (`types.ts:605`). **L-953's own fix (retype to
  `ReadonlyArray<StoreKey>`) would break it** unless `'ceiling'` and `'floor'` are added to the
  union in the same commit. *Reported to the C84 lane; C84 §5's `check-affected-stores.ts` needs a
  second arm for this direction.*

**EI-7e — restore or recompute? And the ORDER-DEPENDENT LABEL.**

⭐ **Floor labels are order-dependent under undo/redo, and it is a live defect.**

- `CreateFloor.ts:108` — `const floorCount = Object.keys(ctx.stores.floor).length + 1;` reads the
  **live store** and `:109` / `:124` derive `label` and `floorNumber` from it.
- `initTools.ts:1833-1834,1846` does the same against the **legacy** store.
- So create A, create B, undo A, create C → **C is labelled `Floor-02`, colliding with B**. The
  label is not a function of the element; it is a function of *when* it was created and *what has
  been undone*. **The two counters are also independent** (plugin store vs legacy store), so the
  DTO record and the geometry record can carry **different labels for the same floor**.
- ⚠ **`NOT MEASURED`: whether a collision is user-visible** (whether any panel or schedule keys on
  `label`). The counter behaviour itself is measured and is the defect.
- **Governed by [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)** — *"a pure function of
  authoritative model state"*. A label derived from history is not.

**L-952 does NOT apply to floor, and the negative is the finding.** L-952's eight audit-ratcheting
families are exactly those `ELEMENT_STORE_ROUTES` routes (`UpdateElementParameterCommand.ts:113-148`:
wall, slab, column, beam, stair, curtainwall, roof, furniture, handrail, window, door). **Floor has
no route**, so it cannot ratchet through that command. Its audit defect is different and is
`metadata` **minted** by the bridge at `initTools.ts:1883-1888` on every replay — **ADR-0319 §2**
class 2 (DERIVED-BUT-CAUSAL: *may* differ across a restore, may **not** differ across an undo).

**TO-BE.** (1) Labels are minted once, by the caller, and carried — never derived from a live count.
(2) All three verbs take a C03 U-2b exit. (3) `'floor'` joins `StoreKey`.

---

## 8. Cascades

| Trigger | Reversed by undo? | Evidence |
|---|---|---|
| floor delete → semantic graph edges | ✅ **captured then purged** | `DeleteElementCommand.ts:569` `_captureRelationships([id])`, `:570` purge. The header `:565-568` names the prior defect: *"this branch already purged, but undo restored NOTHING, which C71 §5.6 rates worse than no purge because it looks correct"* |
| …the **UNDO half** of that | **`NOT MEASURED`** | [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) requires *"executed read-back rather than the presence of a restore call"*. C84 §4C records itself being wrong for awarding this pass by read. **C89 does not repeat that error.** |
| floor delete → `viewDependencyTracker` | ⛔ **never unregistered** | the bridge registers at `initTools.ts:1896`; no delete path unregisters. `NOT MEASURED` whether this strands a dirty-marking entry |
| **floor create → `coveredRoomIds` / `hostSlabId` / `boundingWallIds`** | ⛔ **FORWARD REFERENCES ONLY, NO WRITE-BACK** | `CreateFloor.ts:136-138` seeds `coveredRoomIds: cmd.hostRoomId ? [cmd.hostRoomId] : []`, `boundingWallIds: []`, `hostSlabId: cmd.hostSlabId`. **Nothing writes the reciprocal edge**: the room does not learn it has a floor, the slab does not learn it carries one. Same shape at `initTools.ts:1870-1873` |
| …and the **BUS path never populates `boundingWallIds`** while the **LEGACY path does** | ⛔ **EI-9** | `initTools.ts:1871` `[]` vs `CreateFloorCommand.ts:350` `sketch.boundingWallIds`. [C79 §9.3](C79-REGION-SEMANTICS.md) records the floor half **CLOSED via POPULATE** — for the legacy command **only**. **C79's closure does not cover the bus path, and C84 §4C's `✅ CLOSED` row must be read with that scope.** |
| …and where it IS populated, it is a **`Set`** | ⛔ **EI-2(d) collapse, live** | C79 §10.3, cited not re-derived: `PlanarTopologyEngine:174` does `[...new Set(face.wallIds.filter(Boolean))]`, collapsing the ordered, index-aligned per-half-edge record into unordered membership |
| floor `layer-updated` event | ⛔ **zero subscribers** | C84 **EI-13**: `CommandEventBridge.ts:977` `floor.layer-updated`, one of the nine unconsumed emitters. Wire a consumer or delete the emitter (`CommandEventBridge.ts:627-631` is the in-file precedent for deletion) |
| **`floor.update`/`RegionSketch` — the finish FOLLOWS its bounding walls** | ⚠ **wired, one-way** | `FloorPlanToolHandler.ts:492-501` attaches the reference-carrying sketch **after** the create resolves, because *"the bus `floor.create` payload has no sketch field and its plugin handler is not the authoritative writer"* (`:496-498`). **A two-step create is not atomic**: `NOT MEASURED` whether an undo between the two steps leaves a floor with no sketch |
| wall move → floor finish re-fit | `NOT MEASURED` | `FinishHostDependencyTracker.ts:297` is one of only three services consulting `isReverting()` (C84 §4C) and it is finish-related, but **whether it covers floor specifically is unmeasured** |

**TO-BE.** (1) `boundingWallIds` comes from **one** determination module called by **both** creation
paths. (2) `hostRoomId`/`hostSlabId` write the reciprocal edge or the field is renamed to declare
itself one-way. (3) The sketch attach is part of the create, not a follow-up.

---

## 9. Vocabularies

| Concept | Vocabulary | Members the pipeline cannot carry (EI-3) |
|---|---|---|
| **Material / colour** | ⚠ **TWO.** (V-a) `finishSpec.finishColor` — a hex; default `'#D4C4A8'` stated **twice**, `CreateFloor.ts:112` and `initTools.ts:1836`. (V-b) `materialId` / `materialColor` on `floor.setMaterial`, which **reaches nothing** (refuses) | `floor.setMaterial`'s entire vocabulary. **EI-3 / EI-8** |
| ⭐ the duplicated default | `'#D4C4A8'` appears at `CreateFloor.ts:112` **and** `initTools.ts:1836` — the same constant, two files, no pin | **EI-8a**: a licensed copy is pinned by a **test**, never by a comment. Measured to have failed twice repo-wide |
| **Boundary vertex** | `FloorVertex = {x,z}` (`FloorTypes.ts:56`, `FloorDataSchema.ts:11-14`) vs the CEB's false `Vec3` annotation (`:994`) | none lost today (§5) |
| **Layer function** | `'finish' \| 'adhesive' \| 'screed' \| 'underfloor-heating' \| 'insulation' \| 'tanking' \| 'substrate' \| …` — `FloorDataSchema.ts:18-25` | **none — this vocabulary is carried whole.** ✅ the counter-example the other families need |
| **Detection method** | `'manual-polygon' \| 'from-room' \| 'from-slab' \| 'ai-generated' \| 'ifc-import'` — `FloorTypes.ts:57-63` | **four of five.** The bridge hard-codes `'manual-polygon'` (`initTools.ts:1863`) |
| **Zone type** | `'dry' \| 'wet' \| 'raised' \| 'external' \| 'cleanroom' \| 'food-safe'` — `FloorTypes.ts:45-51` | **ALL SIX.** No payload field, no bridge row, no default written. `NOT MEASURED` whether any consumer reads `zoneType` |
| **Finish pattern** | `'none' \| …` — defaulted `'none'` at `CreateFloor.ts:113` / `initTools.ts:1837` | **all non-`'none'` members**, on the bus path |
| **System type** | `FloorSystemTypeStore`, persisted `ProjectSerializer.ts:1049-1051` | none measured |

**TO-BE.** ONE floor colour vocabulary; the `'#D4C4A8'` copy earns an **EI-10** licence and an
**EI-8a** test, or one of the two sites imports the other.

---

## 10. Geometry

| Axis | AS-IS | TO-BE |
|---|---|---|
| **Stack A** | `packages/geometry-slab/src/floor/FloorPanelBuilder.ts`, live at `initBuilders.ts:422`. C84 §3.5.3 grades `SlabFragmentBuilder` / `FloorPanelBuilder` / `CeilingPanelBuilder` **CO-LIVING** — structural slab vs floor finish vs ceiling finish, three questions, not one | unchanged; the verdict is recorded, not re-litigated |
| **Stack B** | `packages/geometry-kernel/src/producers/` | ⛔ **nothing here may be deleted** — ADR-0331 §D5 (*"what is Stack B for?"*) is an escalated **founder** question |
| **Proven to agree?** | ⛔ **NO HARNESS.** The only A/B harness is wall's, and C84 §5 records it as **not on `main`** | build `tests/parity/floor/`; it MUST consume `packages/geometry-kernel/src/tolerance.ts` (shipped 2026-08-13, barrel-exported `index.ts:22-34` — **L-954**), **never** a call-site `const TOL` ([C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)) |
| **Datum convention** | ⭐ **STATED IN CODE AND LOAD-BEARING.** `FloorPanelBuilder` meshes `worldY_top = levelElevation + boundary.baseOffset` — quoted verbatim at `initTools.ts:1852-1853`. `FloorTypes.ts:66-70`: *"FFL world Y = level.elevation + baseOffset; Y range [FFL − thickness, FFL]"* | this is the ONE floor-Y authority. **Any second site computing floor Y is an EI-9 violation.** `NOT MEASURED`: whether one exists |
| **L-255, the seating defect that this datum closed** | `initTools.ts:1849-1860` records it in full: two `??` arms were bare literals (`?? 0`, `?? 0.075`), so a plan-drawn finish rendered 75 mm thick on the level datum while the plugin store's `resolveFinishSeating` had seated the same floor at 15/75 mm — *"Three layers, three different defaults, one element"* | ✅ **CLOSED.** Both creation paths now send a complete record; the arms resolve from **one documented constant**. **Do not re-introduce a literal here** |

---

## 11. THE DELTA

| # | Item | Invariant | Proof (⛔ watched RED first) |
|---|---|---|---|
| **1** | **`plugins/floor` has NO `floor.delete` verb** — the only family of fifteen | **EI-5** | Write `DeleteFloorHandler` to `DeleteCeilingHandler`'s shape; assert the verb is registered and that a delete removes the DTO record |
| **2** | Floor **vanishes from IFC export** — no `FloorReader.ts` | **EI-6** | Export N floors; assert N `IfcCovering`/`FLOORING` entities, **or** an explicit user-visible refusal. Today: 0 and silence |
| **3** | **Labels are order-dependent under undo/redo** — `CreateFloor.ts:108`, `initTools.ts:1833`, and the two counters are independent | [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) | create A, create B, undo A, create C; assert no label collision and that DTO and legacy labels are byte-equal |
| **4** | Three verbs write the DTO while `'floor'` restores the legacy store | EI-1a / **C03 §4.6 U-2b** | dispatch `floor.create`, `performUndo()`, assert `runtime.stores.floor` no longer holds the id. **It will today** |
| **5** | `boundingWallIds` **populated by the legacy path, `[]` by the bus path** | EI-9 + [C79 §9.3](C79-REGION-SEMANTICS.md) | one determination module, two callers; assert byte-equal arrays for one input |
| **6** | `'floor'` is snapshot-recognised but **absent from `StoreKey`** | **L-953**, reverse arm (unrecorded) | add `'floor'` + `'ceiling'` to `types.ts:557-584` in the same commit that retypes `affectedStores` |
| **7** | `hostSlabId` / `hostRoomId` / `coveredRoomIds` are **forward refs with no write-back** | [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) | write the reciprocal edge, or rename to declare one-way |
| **8** | CEB `:994` types `polygon` as `Vec3[]` when every producer and consumer is `{x,z}` | EI-2 | correct the annotation; assert `FloorVertexSchema.parse` succeeds on a round-trip from every dispatcher |
| **9** | `floor.layer-updated` (`CommandEventBridge.ts:977`) — **zero subscribers** | **EI-13** | wire or delete |
| **10** | `'#D4C4A8'` duplicated, `CreateFloor.ts:112` / `initTools.ts:1836` | **EI-8a** | pin by an executed test, or import |
| **11** | `detectionMethod` hard-coded `'manual-polygon'`; `zoneType` and `slope` unreachable | EI-3 / [C75](C75-PROVENANCE.md) | carry the caller's provenance; add payload fields or declare the fields dead |
| **12** | `ProjectSerializer.ts:802,1048` resolves an absent `floorStore` to `[]` | [C74](C74-CONSTRAINT-HONESTY.md) | make required, or refuse |
| **13** | The region sketch is attached **after** the create resolves (`FloorPlanToolHandler.ts:492-501`) — a non-atomic two-step | [C11](C11-ELEMENT-CREATION-PIPELINE.md) | make the sketch a `floor.create` payload field |
| **14** | No Stack A/B parity harness | **EI-11** | `tests/parity/floor/`, consuming C73's tolerance module |

---

## 12. REFUSALS

| # | Not supported | Status | Instead |
|---|---|---|---|
| **R1** | **There is no `floor.delete` bus verb** | ⛔ **THIS IS NOT A REFUSAL — IT IS AN ABSENCE**, and C84 EI-5 names it. **Not declarable away; Delta 1 is the fix** | today: `element.delete` → `DeleteElementCommand.ts:556-574` |
| **R2** | `floor.setMaterial` **does not reach authoritative state** | ✅ **DECLARED, C16 CA-18 conformant** — `SetFloorMaterial.ts:85`, reason `:57` | `floor.update` (`commands.ts:1216`) |
| **R3** | **There is no `floor.batch.create`** | ⛔ **UNDECLARED before this contract — now DECLARED** | the legacy `CreateFloorsByRoomTypeCommand` (L2). A bus batch verb would need the `subject`-key work `syncDisposition.ts:914-924` describes |
| **R4** | **There is no `floor.move`.** A floor finish is a **region**, not a placed object: it is defined by its boundary polygon and its host room. "Move" is a boundary transform | ⛔ **UNDECLARED before this contract — now DECLARED** | `UpdateFloorBoundaryCommand` on a translated polygon |
| **R5** | **There is no `floor.rotate`**, for the same reason | ⛔ **UNDECLARED — now DECLARED** | rotate the boundary |
| **R6** | `element.updateParameters` **refuses for floor** — no `ELEMENT_STORE_ROUTES` entry (`UpdateElementParameterCommand.ts:112-148`, refusal documented `:159-161`) | ✅ conformant, **undeclared until now** | `floor.updateLayers` / `floor.update` / `UpdateFloorBoundaryCommand` |
| **R7** | Floor is **absent from the bake worker** | ✅ **DECLARED HERE** — `HeadlessBakeSession.ts:31,43,53` is wall-only by construction | not a defect; scope is ADR-0331 §D5, a founder question |
| **R8** | **`zoneType` and `slope` cannot be set through any bus verb** | ⛔ **NOT A REFUSAL — SILENCE.** The fields exist on `FloorData` and no vocabulary reaches them | declare them dead, or give them payload fields |
| **R9** | Floor has **no IFC representation** | ⛔ **NOT A REFUSAL — SILENCE** (Delta 2) | until a reader exists, IFC export MUST warn that N floors were omitted |
| **R-10** | **Circular / elliptical boundaries are SUPPORTED as of 2026-08-19** — this row exists so the ABSENCE of a refusal is explicit | §FEAT-PLATE-SHAPE-MODES | ✅ **NOT A REFUSAL — A CAPABILITY.** ⚠ The real limit is L-1323: the ring does not remember it is a circle. See PS-3 |

> *"No affordance without an implementation… A refusal is a correct answer; a silently-wrong wall
> is not."* — `packages/geometry-wall/src/WallRake.ts:50-62`. **R1, R8 and R9 are floor's three
> remaining silences.**


---

## §L-1032 — THE STOREY AXIS: change level, and duplicate to level

> **Added 2026-08-19 by lane EL1**, from [L-1032](../../04-reference/ISSUE-LOG.md). The end state
> the founder asked for is **not** *"every family has a dropdown"* — it is **every family either
> offers the control or declares, in its contract, why it must not**.
>
> **THE REGISTER IS THE AUTHORITY, NOT THIS SECTION.**
> `packages/command-bus/src/levelChangeVerbs.ts` holds `LEVEL_CHANGE_VERBS` and
> `LEVEL_CHANGE_REFUSALS`; the L3 event bridge, the L7 property panel and the chat registration all
> read those rows. If this section and the register disagree, **the register wins and this section
> is stale** — a defect, not a discrepancy to live with.

### THE VERB — `floor.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ floorId, levelId }` |
| **Handler** | `plugins/floor/src/handlers/ChangeFloorLevel.ts` |
| **Legacy move** | `packages/core-app-model/src/stores/FloorStore.ts` — `changeLevel(id, newLevelId)` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.floor` |
| **Chat** | `move-to-level` (`packages/ai-host/src/intents/LevelChangeIntents.ts`) — *"move the floor to level 2"* |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm routes the depth-2 `[id,'levelId']` inverse patch to `store.changeLevel()` |

### WHY THE STORE NEEDED ITS OWN `changeLevel`

`FloorStore.update()` **warns and DELETES a `levelId` key** (`FloorStore.ts:141-144`) — the same
silent no-op as ceiling. The guard is correct and stays; the move needed its own name.

The 3-D height follows for free: `FloorPanelBuilder.ts:93,126` seats the top face at
`FFL = level.elevation + boundary.baseOffset` (`heightFollowsLevel: true`).

### ⚠ `hostSlabId` — REPORTED, NOT SILENTLY DROPPED

A floor finish carries `hostSlabId`, a binding to a slab on the storey it is LEAVING. Carrying that
id across storeys would leave the record pointing at a host it no longer sits on — a stale
cross-storey reference, which is the dangling half of the cascade this issue exists to prevent. The
duplicate-to-level route **reports** the binding rather than dropping it silently (C84 EI-2: a
dropped field must be dropped DELIBERATELY and named). Re-seating is
`packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts`'s job, not the mover's.

### ⚠ THE CAP — [L-1085](../../04-reference/ISSUE-LOG.md), OPEN

`canExecute` validates existence against the **plugin DTO store**, and C84 EI-5a records that
*"after any project load, every plugin DTO store is EMPTY."* The control therefore works on elements
authored **in the current session** and **refuses, by name, on anything restored from a saved
project**. The refusal is C16 CA-18 conformant and is better than the alternative: relaxing the check
would make the forward move work while producing an empty inverse patch — an authoritative mutation
with no Ctrl+Z (C84 EI-7). **The fix is ADR-0331 §D2/§D3 and is not per-family.**

### DUPLICATE-TO-LEVEL

A **separate verb**, never a flag on the level change — it mints new ids. Declared per family in
`apps/editor/src/engine/views/plantools/duplicateToLevel.ts`, which reuses the ONE legacy→bus payload
mapping in `copyPayloads.ts` (L-978 is what a second copy of that mapping costs). Unlike the level
change, this route reads the LEGACY store, so it is **not** subject to the L-1085 cap above.

---

## §FEAT-PLATE-SHAPE-MODES — CIRCULAR AND ELLIPTICAL BOUNDARIES (founder, 2026-08-19, lane SHAPE1)

> **The founder:** *"Can you add mode 'eclipse', 'circular' and 'rectangular' mode options in WALL,
> CURTAIN WALLS, SLABS, CEILINGS and FLOORS?"*
>
> ⭐ **"eclipse" is read as ELLIPSE, and the reading is made VISIBLE rather than silently corrected.**
> Every user-facing label reads `Elliptical`; a test asserts the string "eclipse" never reached the
> vocabulary. If the reading is wrong, one word fixes it — a silent guess would have shipped five
> families wrong.

### PS-1 — THE CAPABILITY, AND WHY IT WAS REACH RATHER THAN GEOMETRY

`FloorPanelBuilder.ts:228` (`THREE.Shape` + `ExtrudeGeometry`) already triangulates an **arbitrary** ring. A circle was expressible the whole time and
nothing in the product could ASK for one — the *authored-but-unwired* pattern. What shipped is a
GESTURE and its reach, not new geometry: **zero schema change, zero command change, zero builder
change, zero persistence change.**

The generators live in ONE pure module, `packages/geometry-slab/src/boundaryLoops.ts`, shared by
slab, ceiling and floor, so *"the same options in all three"* is true by construction rather than by
three implementations that happen to agree today. It sits beside `boundaryPath` (linear/ortho/curved)
and `boundaryArc` as the third member of the shared plate-boundary authoring layer.

### PS-2 — IT IS A **GESTURE** AXIS, NOT A CONSTRAINT AXIS (binding)

⛔ `circular` / `elliptical` MUST NOT be added to `BoundaryDrawMode`. That union answers *"how does a
click land?"*; these answer *"which whole boundary does one gesture produce?"* Merging them would
make `curved × circular` unexpressible — the error [C86 §945](C86-ELEMENT-WALL-OPENING.md) records
for *"single / double / circular"*, and the error [C92 SL-Voc-3](C92-ELEMENT-SLAB.md) states as a
rule. **L-956 is the measured cost of conflating these two axes once already.**

### PS-3 — ⚠ TESSELLATION IS THE REPRESENTATION, AND THE LIMIT IS DECLARED (L-1323)

A circular floor finish is stored as a **polygon ring**, not as a centre and a radius. That is the
established plate-family pattern — `boundaryArc.ts`: *"boundaries remain POLYGONS by schema and an
arc enters by TESSELLATION"* — and it is what buys the zero-change list in PS-1.

**What it costs, stated here rather than discovered later: the ring does not REMEMBER that it is a
circle.** Re-editing gives N vertices, not a radius handle, and *"make this 0.5 m bigger"* is not
expressible. Density is governed by **chord deviation (20 mm)**, not a fixed segment count, so a
large boundary is not faceted and a small one is not needlessly heavy.

⭐ ✅ **RESOLVED 2026-08-20 (L-1323) — AND THE RESOLUTION IS *ALONGSIDE*, NOT *INSTEAD*.**
The founder ruled that the intent should be recorded, so `boundaryShape`
(`{ kind, centre, rx, rz }`) now sits beside the ring. ⛔ **The polygon REMAINS the geometry and
the single source of truth** — every builder, exporter and take-off reads it and NONE of them reads
the descriptor, which is what keeps this from becoming either a sixth save/load hole or a second
producer of one value. **Absent ⇒ a free polygon**, so nothing migrates.

⭐ **The INVALIDATION is the feature, not the field.** A descriptor that survived a vertex drag
would claim a circle the element no longer is. `UpdateSlabPolygonCommand` — the sole writer of
`polygon` during profile editing — re-asks the question on every write, and any drag, insertion or
deletion drops it. ⚠ **Checking "every vertex lies on the circle" is NOT sufficient**: delete one
vertex from a 48-gon and every survivor is still exactly on the curve while the ring is no longer
that circle. The vertex COUNT is checked too, and the test asserts that trap explicitly.

### PS-4 — REFUSALS (C16 CA-18)

A degenerate gesture yields an **EMPTY ring** plus a sentence naming the limit and the next action.
⛔ **Never a silent fall-back to a rectangle** — that is the §L955 / [C86 PR-9](C86-ELEMENT-WALL-OPENING.md)
failure, and there is live precedent for it in this repo.

### PS-5 — THE SEPARATING TEST

`packages/geometry-slab/__tests__/boundaryLoops.test.ts` (21 assertions) states what makes a circle
A CIRCLE, then feeds the same assertions two deliberately-wrong builds and proves both rejected:
**RECTANGLE_CALLED_ROUND** (the silent-fallback failure) and **EIGHT_FACET_STAIRCASE** (right
parameterisation, wrong density). ⭐ The AREA assertion separates by construction and no tolerance
can reconcile it — ellipse `π·rx·rz`, rectangle `4·rx·rz` (+27%), octagon `2√2·rx·rz` (−10%). The
octagon case exists to show the vertex-on-outline test ALONE cannot catch it: every one of its
vertices IS on the outline. **Falsifiability was PROVEN, not assumed** — sabotaging the circle
generator to return a rectangle turns 5 assertions red.

### PS-6 — VOCABULARY (L-1322)

The module adopts **C86's ratified adjective set** — `rectangular` / `circular` / `elliptical`. ⚠ The
repo holds **five** spellings of these three shapes (`square|circular|ellipse` in handrail;
`rectangle` in floor/ceiling; `2point` in slab; `rect|round` in column; `rectangular|circular` in
C86) **plus a `BoundaryDrawMode` NAME COLLISION** — `SiteBoundaryMap2D.ts:584` declares a local type
of that name whose members disagree with `@pryzm/geometry-slab`'s export (`orthogonal` vs `ortho`).
Historic ids are **MAPPED, not renamed** — `canonicalBoundaryShape()` is the ONE place the spellings meet, and an unknown id resolves to **null, never to a default** (a defaulting resolver would silently turn a typo — or the founder's *"eclipse"* — into a rectangle). ✅ **L-1322 CLOSED 2026-08-20**: the NAME COLLISION is gone (`SiteBoundaryMap2D`'s rival `BoundaryDrawMode` is now `SiteBoundaryGesture`), and per **EI-8a** the table is pinned by a TEST that DERIVES its population from production — handrail's own source and the `elementCreationMatrix` rows — so a sixth spelling fails the suite rather than being noticed later. C84 EI-8 names
*shape* explicitly, so this is a real finding, declared rather than perpetuated.

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **⛔ DARK — and it is the family with the LEAST excuse**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `floor` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1600 |
| **Type catalogue** | ✅ `FloorSystemTypeStore` — **22** built-ins with `{id, name}`, `getById():478` / `getAll():482`. ⚠ `CatalogueFamilies.ts` said **14**; corrected 2026-08-19. |
| **Type field on the record** | ✅ `systemTypeId` — `FloorTypes.ts:289`, `FloorDataSchema.ts:196` |
| **Executor the chat must use** | ✅ `element.changeType` `:1600` → `UpdateFloorLayersCommand` (ring-parity undo). ⛔ **There is no `floor.updateSystemTypeBatch` verb** — floor never got the batch twin slab and ceiling got. |
| **Chat capabilities published TODAY** | ⛔ **NOTHING.** Floor appears in no `targets:` array beyond the probe set. |
| **Retiring condition** | Decide the **floor-vs-slab noun disambiguation**, then inject `ctx.catalogues.floor`. ⚠ The catalogue, the `systemTypeId` field and the live command have ALL existed since before `set-slab-type` shipped. |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ⛔ no capability |
| `selection` | ✅ required | ⛔ no capability |
| `level` | ✅ required | ⛔ no capability |
| `room` | ✅ required | ⛔ no capability |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⭐ **The stated reason for floor's absence was never a blocker, and it is worth reading carefully.** `CatalogueFamilies.ts:47` says floor *"is the next entry to add; it is left out of THIS tranche only because `floor` and `slab` are two different element kinds that users call by the same word, and the disambiguation deserves its own decision rather than a coin-flip."* ✅ **That reasoning is CORRECT and should not be overridden by this rollout** — a user saying *"change all floors to …"* on a project of slabs must not silently retype slabs. **But a decision deferred is not a decision made**, and floor has been dark for the whole interval. **The disambiguation IS the work item** (ADR-0334 D3: a deferral carries its retiring condition).
- ⛔ **MUST NOT resolve the ambiguity by narrowing the vocabulary** — e.g. by requiring the user to say *"floor slab"*. Founder doctrine is free-form language + hard stoppers. The correct shape is a **refusal that names both candidates and their counts** (*"12 slabs and 3 floors match 'floor' here — which did you mean?"*), which is C67 §4 rule 6's ambiguity rule already.
- **NOT MEASURED**: whether the floor branch's V3/V4/V5 hold under a chat driver. The panel's passing is not transferable evidence (ADR-0334).

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.

---

## §L-1431 — `serviceHoles` HAD **ZERO WRITERS**. THE STAIR IS NOW ITS FIRST ONE (added 2026-08-20, lane STAIR1)

**Founder, production:** *"the stair creates an opening on the SLAB — but NOT on the FLOOR FINISH."*

### The measurement

`FloorData.serviceHoles[]` is a fully built void mechanism: declared
(`FloorTypes.ts:126-143`), schema'd (`FloorDataSchema.ts:200`), indexed
(`FloorStore._serviceHoleIndex`), written (`FloorStore.addServiceHole` / `removeServiceHole`) and
**rendered** — `FloorPanelBuilder._buildShapeWithHoles:303-322` pushes each hole onto
`THREE.Shape.holes`, and `_buildEdgeOverlay` draws their outlines.

⭐ **`grep -rn "addServiceHole" packages plugins apps src` returned ONE hit — its own definition.**
**Zero callers, ever.** Every rendering-side capability was present and nothing in the repo had ever
produced a hole to render. This is C84 EI-9 in its purest form: not a missing mechanism, an
**unreached** one. *(It joins §4's `floor.delete` — this family's defects are absences of
REACHABILITY, never of the field map.)*

### NORMATIVE — `'floor'` is a HORIZONTAL HOST, and it is pierced like one

> **F-H1 — A floor finish is a first-class piercing HOST, not a passenger on its slab.**
> `FloorData.hostSlabId` is an *optional* binding; §2 names `FloorStore` the single authority for the
> finish. ⛔ **A void cut in the slab does NOT cut the finish**, and any fix premised on the finish
> being a "layer of the slab" is aimed at the wrong family. Measured 2026-08-20 and recorded because
> the framing is the natural wrong guess.

> **F-H2 — The stair's void in a finish is DERIVED and OWNED elsewhere.** The rule, the level span
> and the containment test live in
> [C98 §L-1431](C98-ELEMENT-STAIR.md) / `StairHorizontalHostPiercing.ts`. This contract records only
> what the finish must PROVIDE: `serviceHoles[]` entries with `shape: 'polygon'` in **world XZ**
> (the same frame as `boundary.polygon` — `FloorPanelBuilder` feeds both into one `THREE.Shape` with
> no transform between them), a stable `id === elementId` from `stairHostPierceId`, and
> `subType: 'floor-hatch'` — **not `'generic'`**: a void with a known cause names its cause.

> **F-H3 — The void is DERIVED, so it is never snapshotted.** A delete removes it by id and an undo
> **re-derives** it from the restored stair. ⚠ **Consequence, stated:** a hand-edited stair void
> would not survive delete/undo. Stair voids are not hand-editable today; **if they ever become so,
> this decision must be revisited, not silently inherited.**

**First writer, live:** `CreateStairCommand` (via `pierceStairHorizontalHosts`), with
`DeleteStairCommand` as the healing counterpart. Both now declare `'floor'` in `affectedStores`
(C03 §4.6 U-2).

### ⛔ NOT MEASURED by this lane

- **Whether `serviceHoles` survive save/load.** `ProjectSerializer.ts:1048` `deepStrip`s the whole
  floor record, so they plausibly do — **plausibly is not measured**. If they do not, a project with
  a stair reopens with its finish solid. Filed as C98 §13 DELTA #22.
- **Whether the plan projector draws the hole.** Only the 3-D `FloorPanelBuilder` path was measured.
