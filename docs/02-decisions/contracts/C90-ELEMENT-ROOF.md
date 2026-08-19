# C90 — ELEMENT: ROOF

- **Status**: CANONICAL — binding on every PR that touches the roof family
- **Date**: 2026-08-18
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md). The **twelve mandatory sections** below are
  C84 §6's, in C84 §6's order.
- **Constrained by** (these own the mechanisms; C90 only APPLIES them per family, per C84 EI-9):
  [C03 §4.4/§4.5/§4.6](C03-SCHEMAS-COMMANDS-AND-STATE.md) · [C11](C11-ELEMENT-CREATION-PIPELINE.md) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) ·
  [C79 §7.2](C79-REGION-SEMANTICS.md) (back-reference arrays — POPULATE, REMOVE or DECLARE) ·
  [ADR-0319 §2](../adrs/) (audit fields across undo — **NOT C75**) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the UI-control census)
- **Evidence**: measured in the MAIN worktree on 2026-08-18. Every claim carries `file:line`.
  Unverifiable cells read **NOT MEASURED**. **No cell is blank** (C84 §6).
- **Persistence pair measured**: `apps/editor/src/engine/persistence/` — the **LIVE** one.
  `packages/persistence-client/src/loader/` NOT measured; DEAD copy.
- **Reachability axes** (C84 §3.5.1): both were run. Axis (b) — the bus-verb dispatcher census — is
  where this family's sharpest findings are, and it is stated per claim.

> **THE ONE-LINE VERDICT — and it REFINES C84 rather than repeating it.**
> C84 §4 says *"roof.skylights and materialId are dropped at CEB:895-924 — the roof renders
> unperforated, the skylights are never cut."* The drop is **CONFIRMED**. *"The skylights are never
> cut"* is **too strong as a blanket claim and too weak as a finding.** There are **TWO DISJOINT
> SKYLIGHT REPRESENTATIONS**: `Roof.skylights[]` (L0 + plugin DTO) which **nothing reads, ever**, and
> `openingStore` records hosted on a roof face which **are** cut, are tested, and whose only writer
> `CreateRoofOpeningCommand` has **no production dispatcher**. Neither reachable, neither bridged to
> the other. **The user cannot make a hole in a roof by any measured route.**

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schema | `packages/schemas/src/elements/Roof.ts:31` — `defineElement('roof', {…})`; refinements `:118-120`, `:121-125` |
| Plugin DTO storeKey | `'roof'` — `plugins/roof/src/store.ts:13-15` (`super('roof')`) |
| Legacy record discriminator | `type: 'roof'` — `packages/geometry-roof/src/RoofTypes.ts:89` |
| Bus verb namespace | `roof.*` — 11 handler verbs (`plugins/roof/src/handlers/index.ts:23-33`) + `roof.update` (an L3 legacy bridge, `apps/editor/src/engine/initBusHandlers.ts:911-914`) |
| `createSnapshot` key | `'roof'` — `packages/command-registry/src/CommandManagerImpl.ts:612` |
| `buildUndoStoreMap` keys | `roof`, `roofs` — `apps/editor/src/engine/undo/performUndoRedo.ts:329`, both → `window.roofStore` (**legacy**) |
| `window.*` global | `apps/editor/src/engine/engineLauncher.ts:341` — `window.roofStore = roofStore` (the legacy singleton) |

**`userData.elementType` — TWO spellings on one object, 36 lines apart, plus a third the plan view
recognises and nothing produces:**

| Literal | Producer |
|---|---|
| `'roof'` | `RoofFragmentBuilder.ts:268` — `Object.defineProperty(root.userData, 'elementType', { value: 'roof', writable: false, … })` on the **pickable ROOT group** |
| `'roof'` (second key) | `RoofFragmentBuilder.ts:269` — `root.userData.type = 'roof';` |
| **`'RoofPart'`** | `RoofFragmentBuilder.ts:304` — `mesh.userData.elementType = 'RoofPart';` on the **CHILD mesh** |
| `'roof'` | `RoofStore.ts:90, :99, :127, :177, :195` — storeEventBus |
| `'Roof'`, `'RoofMesh'`, `'RoofPart'` | `apps/editor/src/engine/views/EdgeProjectorService.ts:156` — `Roof: 'A-ROOF', RoofMesh: 'A-ROOF', RoofPart: 'A-ROOF',`. ⚠ **`'RoofMesh'` has NO measured producer** — the plan-view layer table recognises a spelling nothing emits |
| `'roof'` | plan VG map `apps/editor/src/engine/views/plan-canvas/PlanViewVGApplicator.ts:15` — `'A-ROOF': 'roof',` |

C84 §4E's `'RoofPart'` is **CONFIRMED** and **narrowed**: it is the child mesh only; the pickable root
carries `'roof'`.

### TO-BE — normative

- **RF-ID-1.** The canonical `userData.elementType` is **`'roof'`**, frozen, compared
  case-insensitively per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md). `'RoofPart'` is a **sub-part**
  and MUST carry C15 §12's `userData.role = 'geometry'` + `parentId` rather than a rival tag
  (C84 §4E, as corrected against C15 §12).
- **RF-ID-2.** `'RoofMesh'` MUST be removed from `EdgeProjectorService.ts:156` or given a producer.
  A recognised spelling with no emitter is C84 EI-12's shape pointed the other way: a **consumer**
  with no dispatcher.
- **RF-ID-3.** `root.userData.type` and `root.userData.elementType` (`:268-269`) are two keys holding
  one answer. Declare which consumers read which, or collapse them — EI-9.

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. FOUR representations, and **two of them are structurally disjoint.**

| # | Representation | File:line | Fields |
|---|---|---|---|
| 1 | **L0 Zod schema** | `packages/schemas/src/elements/Roof.ts:31` | `provenance:47`, `confidence:63`, `levelId:64`, `boundary:65-70`, `shape:71`, `pitch:73`, `overhang:75`, `thickness:76`, `materialId:77`, `materialColor:78`, **`skylights:80`** (`Skylight:13-24` — `id:14`, `position:16`, `width:18`, `depth:20`, `frameWidth:22`, `materialId:23`), **`joinedToRoofIds:82`**, `boundingWallIds:117` + BaseNode |
| 2 | **Plugin DTO store** | `plugins/roof/src/store.ts:13-15`; `RoofData = RoofSchemaInfer` `:9`; `RoofsState` `:11` | identical to (1) |
| 3 | **Legacy geometry store** | `packages/geometry-roof/src/RoofStore.ts:9` (class); constructed `apps/editor/src/engine/initBuilders.ts:574`; record `RoofTypes.ts:88` | `type:89`, `levelId:90`, `parentId:91`, **`footprint:93`** (not `boundary`), **`roofType:95`** (not `shape`), **`slope:96`** (rise/run, not `pitch` in radians), `ridgeOffset:97`, `overhang:98`, `baseOffset:100`, `thickness:101`, `fascia:102`, `autoBaseOffset:105`, `materialId:107`, `materialColor:108`, `layers:110`, `slopeArrows:113`, `segments:116`, `boundingWallIds:160`, `properties:162`, `ifcData:163-167`, `metadata:169`, deprecated `polygon:172`, `width:174`, `depth:176` |
| 4 | **Kernel producer** | `packages/geometry-kernel/src/producers/roof.ts:67` (`produceRoof`), type `:54-56`; exported `geometry-kernel/src/index.ts:53` | reads the **L0** shape |
| 5 | **Scene `userData`** | `RoofFragmentBuilder.ts:268-269, :304` | §1 |
| 6 | **`openingStore`** — the roof's REAL hole record | `packages/core-app-model/src/stores/OpeningStore.ts`; global `initBuilders.ts:679`; injected into the roof builder `:702` | keyed by `hostId`; `getByHostId` |

> ⛔ **REPRESENTATIONS (1)/(2) AND (3) ARE STRUCTURALLY DISJOINT ON FIVE AXES.**
> `boundary` vs `footprint` · `shape` vs `roofType` · `pitch` (radians) vs `slope` (rise/run) ·
> **`skylights` has NO legacy counterpart** · **`joinedToRoofIds` has NO legacy counterpart.**
> Conversely the legacy record carries `layers`, `slopeArrows`, `segments`, `fascia`, `ridgeOffset`,
> `autoBaseOffset` and `baseOffset`, **none of which the L0 schema declares.**
> `RoofTypes.ts:148-158` states one half of the gap in-file: *"⚠ NOT YET POPULATED AT CREATION …
> This field makes a roof reference-CAPABLE; it does not yet make one FOLLOW."*

### THE AUTHORITY

> **`packages/geometry-roof`'s `roofStore` (representation 3) is the AUTHORITY, and `openingStore`
> (representation 6) is the authority for roof HOLES.**

Every consumer reads (3) — §3 — and every hole that is actually cut comes from (6)
(`RoofFragmentBuilder.ts:122-133, :296-297`). Representation 2 has **zero production readers**;
`SetRoofMaterial.ts:56-57` says so in its own refusal text.

### TO-BE — normative

- **RF-S-1 (EI-1).** The authority is (3) + (6). No consumer may read (2).
- **RF-S-2 (EI-5a).** (2) is a **declared write-only shadow**. ⛔ No mirror, no purge, no
  reconciliation pass (C84 §8.c). `plugins/roof/src/store.ts` MUST carry the
  `plugins/rooms/src/store.ts:1-29` header form naming winner, reader count (**0**) and retirement.
- **RF-S-3 — THE DISJOINT-SHAPE PROBLEM IS THE FAMILY'S ROOT DEFECT.** Two records that share no
  field names cannot have a mechanical bridge; every hop must hand-translate, and §5 shows what that
  costs. One shape MUST be declared canonical and the other derived. ⛔ This is not a refactor a
  lane may pick — it is an [ADR](../adrs/) with a persistence migration.
- **RF-S-4.** `Roof.skylights[]` and the `openingStore` hole record are **two answers to one
  question** — *"where is the hole in this roof?"* — and violate **EI-9**. One MUST win; the loser's
  write MUST be retired (ADR-0331 §D2), not mirrored.

---

## 3. CONSUMERS

| Consumer | Reads | Evidence |
|---|---|---|
| **Renderer** | ✅ legacy (3) + `openingStore` (6) | `initBuilders.ts:594` `new RoofFragmentBuilder(scene, bimManager, undefined, _roofMaterialMap)`; registered `:1077`, handle `:1138`; event wiring `:602-617` (`bim-roof-added/updated/removed` → `roofStore.getById(id)` → `roofBuilder.updateRoof(data)`); **opening injection `:702` `roofBuilder.setDeps({ openingStore })`** |
| **Plan view** | ✅ legacy | `EdgeProjectorService.ts:156, :371, :389, :1918`; slope arrows `:1833`, `:1997-1998`, `:3507-3515` via `RoofSlopeSymbolBuilder` (constructor-DI `:1829-1833`) |
| **Persistence — save** | ✅ legacy | LIVE `ProjectSerializer.ts:42` (import), `:135` (`roofs: any[]`), `:663-691` (`serializeRoof`), `:780`, `:987`, `:1020` (`roofStore.getAll().map(serializeRoof)`), `:1094`, `:1104` |
| **Persistence — load** | ✅ legacy (via L2) | LIVE `ProjectLoader.ts:185-245` (`migrateRoofSnapshotToCommand`), `:228-242` (`new CreateRoofCommand(...)`), Step 8 `:1203-1204` |
| **IFC export** | ✅ legacy | `packages/file-format/src/export/ifc/readers/RoofReader.ts:1` (import), `:8` ctor takes `RoofStore`, `:12` `this.store.getAll()`; wired `packages/file-format/src/export/ifc/ExportIFC.ts:48` — `roofStore: window.roofStore ?? undefined` |
| **GLB export** | ✅ scene graph | `GLBExporter.ts:177` is the **only** `roof` occurrence and it is a **comment**. GLB walks the THREE scene |
| **Bake worker** | — **ABSENT** | `grep -rn -i "roof" apps/bake-worker/src` → **ZERO matches** |
| **Plugin DTO store (2)** | — | **zero production readers, both axes** |

**No two consumers read different stores. Roof is NOT a split-brain family.** C84 §4 records
`✅ legacy`; **CONFIRMED on all six EI-1b consumers and recorded `✅` explicitly**, so it is
distinguishable from *nobody looked*.

**Persistence field loss, measured.** `serializeRoof` (`ProjectSerializer.ts:670-690`) emits
`id, type, levelId, parentId, footprint{polygon,centroid}, roofType, slope, overhang, thickness,
baseOffset, fascia, materialColor, materialId, properties, ifcData, metadata, width, depth, mode,
polygon`. It does **NOT** emit `boundingWallIds`, `layers`, `slopeArrows`, `segments`, `ridgeOffset`,
`autoBaseOffset`. And because it serialises the **legacy** record, `skylights` and `joinedToRoofIds`
**have no source to come from at all** — `grep -ci skylight` over both LIVE persistence files
returns **0 / 0**.

### TO-BE — normative

- **RF-C-1.** The authority set is closed at (3) + (6).
- **RF-C-2 (EI-6).** `boundingWallIds` is authored (`RoofPlanToolHandler.ts:300`), carried through
  three hops with an explicit §ROOF-FOLLOWS-WALL comment at each — and **not serialised**. A roof
  that follows its walls forgets which walls on the first save. It MUST be serialised or the
  attribution affordance MUST be removed.
- **RF-C-3.** `layers`, `slopeArrows`, `segments`, `ridgeOffset`, `autoBaseOffset` are legacy-only
  **and unserialised**. Each MUST be serialised or declared transient.
- **RF-C-4.** The bake worker's total absence of roof handling MUST be declared (§12 R-6). A
  self-host bake silently omits every roof.

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — 12 bus handlers, all declaring the dead DTO key

`plugins/roof/src/handlers/index.ts:23-33` (`ROOF_HANDLER_TYPES`), `:63-64`
(`buildRoofHandlerSet`), `registerRoofHandlers`.

| Handler | Verb (line) | `affectedStores` (line) | Lineage | Refuses? |
|---|---|---|---|---|
| `CreateRoof.ts` | `roof.create` `:32` | `['roof']` `:33` | L1 | no (`:37, :40, :43, :47`) |
| `DeleteRoof.ts` | `roof.delete` `:21` | `['roof']` `:22` | L1 | no (`:26, :29`) |
| `SetRoofShape.ts` | `roof.setShape` `:31` | `['roof']` `:32` | L1 | no |
| `SetRoofPitch.ts` | `roof.setPitch` `:30` | `['roof']` `:31` | L1 | no |
| `SetRoofThickness.ts` | `roof.setThickness` `:24` | `['roof']` `:25` | L1 | no |
| `SetRoofOverhang.ts` | `roof.setOverhang` `:24` | `['roof']` `:25` | L1 | no |
| **`MoveRoof.ts`** | `roof.move` `:75` | `['roof']` `:76` | L1 | ⛔ **YES** `:108` |
| **`SetRoofMaterial.ts`** | `roof.setMaterial` `:62` | `['roof']` `:63` | L1 | ⛔ **YES** `:83` |
| `ChangeRoofLevel.ts` | `roof.changeLevel` `:25` | `['roof']` `:26` | L1 | no |
| **`AddSkylight.ts`** | `roof.addSkylight` `:32` | `['roof']` `:33` | L1 | no |
| **`RemoveSkylight.ts`** | `roof.removeSkylight` `:24` | `['roof']` `:25` | L1 | no |
| `JoinRoofs.ts` | `roof.joinRoofs` `:27` | `['roof']` `:28` | L1 | no |
| — (bridge, not a handler) | `roof.update` | n/a | **L3** — `initBusHandlers.ts:911-914`, `_cmExecOrRefuse('roof.update', new UpdateRoofCommand(cmd.id, cmd.updates))` | — |

> ⚠ **THE ASYMMETRY IS THE FINDING.** `roof.move` and `roof.setMaterial` refuse **because** they
> write the dead DTO store. `roof.addSkylight`, `roof.removeSkylight`, `roof.joinRoofs`,
> `roof.changeLevel`, `roof.setShape`, `roof.setPitch`, `roof.setThickness` and `roof.setOverhang`
> **write the same dead store and report success.** The diagnosis exists — verbatim at
> `SetRoofMaterial.ts:56-57` — and is applied to **two of twelve** verbs.

`SetRoofMaterial.ts:56-57` verbatim:
> *"It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by
> no renderer, no 2-D projector, no IFC exporter and no persistence path — only `<family>.created`
> is ever mirrored to the geometry store, never updates (§FIX-MATERIAL-DEAD-DISPATCH). Use
> `roof.update` instead — it reaches the geometry record the builders read."*

`MoveRoof.ts:71-72` verbatim names the live path, and the move table agrees:
`apps/editor/src/engine/transforms/elementMove.ts:112` — `roof: 'roof.update',`.

**Lineage is comment-only.** `grep lineage plugins/roof/src/` → **ZERO**. Tags found in headers:
`S11-T3` (all 12), `W-1C-5` (`AddSkylight:1`, `RemoveSkylight:1`, `JoinRoofs:3`, `index:3`),
`§FIX-DEAD-MOVE-VERB-REFUSE (W3-4)` (`MoveRoof:22, :93`), `§FIX-DEAD-VERB-REFUSE (W3-3)` /
`§FIX-MATERIAL-DEAD-DISPATCH` (`SetRoofMaterial:80, :57`).

### Five L2 legacy commands — `packages/command-registry/src/roofs/`

`CreateRoofCommand.ts:73` `["roof","level"]` · `CreateRoofOpeningCommand.ts:174` `['roof']` ·
`DeleteRoofCommand.ts:9` `["roof"]` · `UpdateRoofBoundaryCommand.ts:95` `['roof']` ·
`UpdateRoofCommand.ts:9` `["roof"]`.

### ⛔ THE UNREACHABLE COMMAND — axis (b), and it is decisive

`CreateRoofOpeningCommand` is registered **exactly once**:
`apps/editor/src/engine/CommandRegistry.ts:394` —
`['CREATE_ROOF_OPENING', (s) => new CreateRoofOpeningCommand(s.payload as any)],`.
A repo-wide grep for `CREATE_ROOF_OPENING` returns **THREE sites total**: that registration, the
class's own `readonly type` (`CreateRoofOpeningCommand.ts:176`), and the enum
(`packages/command-registry/src/types.ts:132`). **No UI, tool, panel or gesture dispatches it.**
The file says so itself at `:291`: *"skylight TOOL (click a roof face, drag a rectangle) is a
separate piece."*

Likewise `roof.addSkylight` has **no production dispatcher**: every hit is
`plugins/roof/src/handlers/{AddSkylight.ts:32, index.ts:31}`,
`tools/ga-gate/check-verb-register.ts:503`, or
`packages/ai-host/src/capabilities/ChatCommandClassification.ts:68`.

### TO-BE — normative

- **RF-P-1.** The two refusals **SATISFY C16 CA-18 and MUST NOT be "fixed" into silent success.**
  The residual defect is the still-offered control — **NOT MEASURED**, owned by
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
- **RF-P-2 — THE EIGHT NON-REFUSING DTO WRITERS ARE THE LIVE DEFECT.** Each MUST either route to the
  authority (C16 **CA-17**) or refuse (**CA-18**). Reporting success into a store the codebase's own
  refusal text calls unread is the exact shape C16's `CA-DOCTRINE-A` forbids.
- **RF-P-3 (EI-12).** `CREATE_ROOF_OPENING` MUST either gain its dispatcher (the skylight tool) or be
  **declared dormant** with the condition that makes it live. *A trigger with no dispatcher and a
  dispatcher with no runner fail identically — silently.*
- **RF-P-4.** Lineage MUST become a machine-readable field, not a header tag, before
  `check-bridge-field-coverage` can consume §5.

---

## 5. THE BRIDGE FIELD MAP — **THE LOAD-BEARING SECTION**

**Hops:** `roof.create` payload → `packages/runtime-composer/src/CommandEventBridge.ts:892` (arm),
`p` cast `:895-906`, emit `:907-924` → `apps/editor/src/engine/initTools.ts:1591-1620` subscriber
→ `apps/editor/src/engine/roofCreatedMirror.ts:56` (`roofRecordFromCreatedEvent`), record `:70-105`
→ `roofStore.add` (`initTools.ts:1608`) → `ProjectSerializer.ts:670-690` →
`ProjectLoader.ts:228-242`.

**The bridge names its own mechanism.** `CommandEventBridge.ts:915-922` verbatim:
> *"§ROOF-FOLLOWS-WALL (L-924) — forwarded UNTOUCHED, absence included. **This emit is a NAMED SUBSET
> of `record.payload`, so a field missing from this list is dropped in flight however correctly the
> plan tool dispatched it** — which is exactly how the plan path came to store no attribution while
> the 3D path could. No `?? []`: `undefined` means 'not region-traced' and `[]` would mean 'traced,
> bounded nothing'."*

That is C84 **EI-2(a)** written by the code about itself.

| # | Field | CEB `p` (`:895-906`) | CEB emit (`:907-924`) | Mirror in (`:26-36`) | Legacy out (`:70-105`) | Serialised | **Disposition** |
|---|---|---|---|---|---|---|---|
| 1 | `id` | ✅ `:896` | ✅ `:911` | ✅ `:27` | `id` `:71` | ✅ `:671` | **CARRIED** |
| 2 | `type` | ⛔ | `commandType` `:909` | — | literal `'roof'` `:72` | ✅ `:672` | **TRANSFORMED** |
| 3 | `levelId` | ✅ `:897` | ✅ `:910` | ✅ `:28` | `levelId` `:73` | ✅ `:673` | **CARRIED** |
| 4 | **`boundary`** | ✅ `:898` | ✅ `:912` | ✅ `:29` | → **`footprint{polygon,centroid}`** `:63-74` | ✅ `:675` | **TRANSFORMED (SHAPE CHANGE)** — the disjoint-record seam (§2 RF-S-3) |
| 5 | **`shape`** | ✅ `:899` | ✅ `:913` | ✅ `:30` | → **`roofType`** `:80`, with `'mono' → 'shed'` | ✅ `:676` | **TRANSFORMED (VOCABULARY)** — see §9. `roofCreatedMirror.ts:75-79` records the incident: *"`mono` and `shed` are the SAME roof and were spelled differently in the two vocabularies, so `mono` fell through … to `default:` and silently rendered FLAT. One line, one whole roof form."* |
| 6 | **`pitch`** (radians) | ✅ `:903` | ✅ `:916` | ✅ `:31` | → **`slope = Math.tan(pitch)`** `:84` | ✅ `slope:677` | **TRANSFORMED (UNIT CHANGE)**. `:81-83`: *"Previously not forwarded AT ALL, so every plan-created roof was slope-less"* |
| 7 | `overhang` | ✅ `:900` | ✅ `:914` | ✅ `:32` | `?? 0.3` `:85` | ✅ `:678` | **CARRIED (DEFAULTED)** |
| 8 | `thickness` | ✅ `:901` | ✅ `:915` | ✅ `:33` | `?? 0.2` `:90` | ✅ `:679` | **CARRIED (DEFAULTED)** |
| 9 | `boundingWallIds` | ✅ `:905` | ✅ `:923` | ✅ `:35` | spread-conditional `:104` | ⛔ **NOT SERIALISED** | **CARRIED IN FLIGHT, LOST ON SAVE** — RF-C-2 |
| **10** | **`baseOffset`** | ⛔ **absent** | ⛔ **absent** | ✅ `:34` **declared** | **`?? 2.7`** `:89` | ✅ `:680` | ⛔ **THE INERT FIX.** `roofCreatedMirror.ts:86-88` verbatim: *"§FT6 / BUG-6 (TASK-06): use the caller-supplied baseOffset. The hardcoded 2.7 placeholder ignored the command's own value, putting every roof at the wrong elevation regardless of wall height."* **The consumer was fixed; the emitter never learned the field.** `ev.baseOffset` is ALWAYS `undefined`; `:89` ALWAYS resolves to `2.7`. C84 CONFIRMED |
| **11** | **`materialId`** `Roof.ts:77` | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:683` | ⛔ **DROPPED (SILENT)** — C84 CONFIRMED. `CreateRoof.ts:24` can dispatch it |
| **12** | **`materialColor`** `Roof.ts:78` | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:682` | ⛔ **DROPPED (SILENT)** — `CreateRoof.ts:25` can dispatch it |
| 13 | `systemTypeId` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ **DROPPED (SILENT)** — `CreateRoof.ts:26` can dispatch it |
| **14** | **`skylights`** `Roof.ts:80` | ⛔ | ⛔ | ⛔ | ⛔ **no legacy field exists** | ⛔ **0 hits in either LIVE persistence file** | ⛔ **STRUCTURALLY UNBRIDGEABLE** — and **not even dispatchable**: `CreateRoofPayload` (`CreateRoof.ts:16-27`) has no `skylights` member |
| **15** | **`joinedToRoofIds`** `Roof.ts:82` | ⛔ | ⛔ | ⛔ | ⛔ **no legacy field exists** | ⛔ | ⛔ **STRUCTURALLY UNBRIDGEABLE** — §8 |
| 16 | `provenance:47` / `confidence:63` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ **DROPPED (SILENT)** |
| 17 | `parentId`, `childrenIds`, `metadata`, `ifcData` | ⛔ | ⛔ | ⛔ | ⛔ | ✅ `:674, :685, :686` | **DROPPED (SILENT)** in flight |
| — | *(invented)* | — | — | — | **`autoBaseOffset: true`** hardcoded `:91` | ⛔ | **INVENTED AT THE MIRROR** — never read from the event |
| — | legacy-only: `layers`, `slopeArrows`, `segments`, `fascia`, `ridgeOffset` | — | — | — | — | `fascia` ✅ `:681`; **rest ⛔** | **UNREACHABLE FROM THE BUS + MOSTLY UNSERIALISED** |

**What the plan tool actually dispatches** (`RoofPlanToolHandler.ts:284-301`): `id, levelId,
boundary, shape, pitch, overhang: 0.3, thickness: 0.2, boundingWallIds`. **No `baseOffset`, no
material.** 3D dispatch: `plugins/roof/src/tool.ts:61`.

> ⚠ **THREE DIFFERENT `baseOffset` DEFAULTS IN ONE PRODUCT.** `roofCreatedMirror.ts:89` → **2.7** ·
> `ProjectLoader.ts:234` → **3.0** · `roof-committer.ts:80` `worldY ?? (() => 0)` → **0**. A roof
> created, saved and reloaded therefore **moves by 0.3 m** with nothing having edited it. That is
> C73 §1.1's *"given the same model, a regeneration produces the same geometry"* failing on the
> persistence axis, and it is **not in C84**.

### TO-BE — normative

- **RF-B-1 (EI-2).** Every **DROPPED (SILENT)** row MUST become CARRIED or **DROPPED (DECLARED)**.
  Row 9's comment is the compliant form — copy it, don't admire it.
- **RF-B-2.** Row **10** is the priority: `baseOffset` MUST be added to `p` and the emit, so that the
  fix already written at `roofCreatedMirror.ts:86-89` becomes real. **A fix whose input never
  arrives is a comment.**
- **RF-B-3.** The three `baseOffset` defaults MUST collapse to **one** declared datum authority
  (EI-9). ⛔ Do not pick silently — [C73 §3.7](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md): *"a silent
  pick is a behaviour change shipped as a refactor."*
- **RF-B-4.** Rows **14** and **15** cannot be fixed at the bridge: no destination field exists.
  They are RF-S-3's consequence and are blocked on that ADR.
- **RF-B-5.** `autoBaseOffset: true` MUST come from the payload or be declared invented.

---

## 6. VERBS

`W` = written · `R` = restored · **`=`** = equal.

| Verb | Lineage | W | R | `=`? | Note |
|---|---|---|---|---|---|
| `roof.create` | L1 | DTO + legacy (CEB→mirror) | legacy only | ⛔ | EI-7a |
| `roof.delete` | L1 | DTO — `delete draft[cmd.roofId]` `:36-39` | legacy | ⛔ | ⛔ **no back-ref sweep** — §8 |
| `roof.setShape` / `setPitch` / `setThickness` / `setOverhang` | L1 | **DTO only** | legacy | ⛔ | **write a store nothing reads and report success** |
| `roof.changeLevel` | L1 | **DTO only** — `ChangeRoofLevel.ts:44-48` | legacy via `changeLevel()` `elementUndoStoreAdapter.ts:321-332` (§L-946) | ⚠ | **Neither side writes a LevelStore** — C84 CONFIRMED |
| **`roof.addSkylight`** | L1 | DTO `skylights` `AddSkylight.ts:61` | legacy — **no field to restore into** | ⛔ | **no production dispatcher**; sync-unsynced `syncDisposition.ts:612` |
| **`roof.removeSkylight`** | L1 | DTO `RemoveSkylight.ts:50` | same | ⛔ | same; `syncDisposition.ts:613` |
| **`roof.joinRoofs`** | L1 | DTO `joinedToRoofIds` `JoinRoofs.ts:60-64` | same | ⛔ | symmetric write, **never read, never cleaned** — §8 |
| **`roof.move`** | L1 | — refuses `:108` | n/a | ✅ vacuously | C16 CA-18 conformant |
| **`roof.setMaterial`** | L1 | — refuses `:83` | n/a | ✅ vacuously | C16 CA-18 conformant |
| **`roof.update`** | **L3** bridge `initBusHandlers.ts:911-914` | legacy `roofStore` | L2 stack | ✅ | **THE ONLY WRITE THAT REACHES THE AUTHORITY.** Also the move path (`elementMove.ts:112`) |
| `CREATE_ROOF_OPENING` (L2, not a bus verb) | L2 | `openingStore` | ✅ `_captureRelationships` | ✅ | ⛔ **no dispatcher** — §4 |
| **BATCH CREATE** | — | — | — | — | ⛔ **NO `roof.batch.create` EXISTS.** Declared, not omitted |
| **ROTATE** | — | — | — | — | ⛔ **NO ROTATE VERB.** Expressed as a boundary edit |
| **COLOUR** | — | — | — | — | ⛔ **NONE** distinct from `setMaterial`, which refuses. `materialColor` is settable only via `roof.update` |
| **UN-JOIN** | — | — | — | — | ⛔ **NO `roof.unjoinRoofs`.** §8 |

### TO-BE — normative

- **RF-V-1.** Every row must reach `=` ✅. The eight non-refusing DTO writers are the work (RF-P-2).
- **RF-V-2.** The four undeclared absences (batch create, rotate, colour, un-join) are now
  **DECLARED** here. Minting any of them requires a §5 row and a §6 row in the same PR.

---

## 7. UNDO / REDO

### RF-U-1 — the repo-wide inequality (EI-7a)

Every `['roof']` bus verb writes the plugin DTO snapshot; `performUndoRedo.ts:329` routes the inverse
to `window.roofStore` — the **legacy** singleton set at `engineLauncher.ts:341`.
`WRITES ⊋ RESTORES` on every one. For `roof.addSkylight` it is worse than unequal: **the legacy
record has no `skylights` field**, so the inverse patch has no destination at all.

### RF-U-2 — `createSnapshot` covers `'roof'`

`CommandManagerImpl.ts:612` — `['roof', 'roofStore', (ctx.stores as any).roofStore]`. `wants()`
`:586` is exact-match; `'roof'` matches. Fallback-to-ALL when `affectedStores` is absent **or empty**
`:582-584`.

### RF-U-3 — audit envelope: roof RATCHETS (ADR-0319 §2 · L-952)

Roof **is** routed — `UpdateElementParameterCommand.ts:126`
`roof: route(['roof'], c => (c.stores as any).roofStore),` inside `ELEMENT_STORE_ROUTES:112`; scope
derived `:234`. Undo replays a **forward** command (`:379-389`) and audit-neutrality comes only from
`restoreWallAudit`, gated at `:410-413` on `t === 'wall' | 'door' | 'window'`. For `'roof'`, `wallId`
stays `undefined` → `:414 return null` → `restoreWallAudit` early-returns (`:429-430`). **The forward
replay's version bump stands.**

The file names roof explicitly, `:213-218` verbatim:
> *"Scope, stated rather than implied: only `WallStore` carries the `preserveMetadata` contract
> today … Element types whose stores stamp their own audit fields (slab, stair, **roof**, furniture,
> …) are NOT covered here and are not claimed to be."*

⚠ **C84 §4B cites `:214-219`; the measured span is `:213-218`** — one line earlier. Recorded per
C84 §6 (*record retractions*), not silently amended.

### RF-U-4 — the level-change route writes no LevelStore

`ChangeRoofLevel.ts:44-48` writes only `draft[cmd.roofId].levelId` in the DTO store.
`elementUndoStoreAdapter.ts:321-332` routes the revert to `store.changeLevel(id, target)` plus
`bimManager.registerElement` and `vdt.registerElement`. **Neither side writes a LevelStore** — C84
CONFIRMED verbatim. The empty-target guard at `:326-328` is correct and named (§DIAG-WALL-LEVEL).

### TO-BE — normative

- **RF-U-1n.** ADR-0331 §D3 is the named exit; C84 §9 records it as **never executed**.
- **RF-U-2n.** Roof MUST gain audit-neutral undo. **The mechanism already exists on `WallStore`**
  ([C85 §7 W-U-3](C85-ELEMENT-WALL.md)); L-952's fix is to generalise `preserveMetadata` off it.
  ⛔ **Control first, watched RED:** undo a roof parameter change and assert `metadata.version` is
  **byte-equal** to its pre-edit value. An assertion that passes before the fix tests nothing.
- **RF-U-3n.** `roof.addSkylight`'s inverse has no destination. Until RF-S-4 is decided, the verb
  MUST refuse under CA-18 rather than accept an unrestorable write.

---

## 8. CASCADES

| Cascade | Trigger | Reversed? | Evidence |
|---|---|---|---|
| **`joinedToRoofIds` back-refs on roof delete** | `roof.delete` | ⛔ **DANGLING — C84 §4C CONFIRMED** | Write: `JoinRoofs.ts:60-61` (`src.joinedToRoofIds = [...src.joinedToRoofIds, cmd.targetId]`), `:63-64` (symmetric). Delete: `DeleteRoof.ts:36-39` is the **entire** mutation — `delete draft[cmd.roofId]`, no peer iteration, no sweep. **Every peer roof retains the deleted id forever, and there is NO un-join verb.** Owner: [C79 §7.2](C79-REGION-SEMANTICS.md) — POPULATE, REMOVE or DECLARE |
| **`joinedToRoofIds` consumption** | — | — | ⛔ **NOTHING READS IT.** `produceRoof` takes `_joinData` and `producers/roof.ts:58-59` says *"Roofs do not currently use joinData — placeholder for future cross-element joins (e.g. roof-to-wall flashing)."* **Written symmetrically, never read, never cleaned.** C84 **EI-13** shape applied to a field |
| **Semantic graph edges on roof delete (L2)** | `DeleteRoofCommand` | ✅ | `_captureRelationships` `:47-56`, called `:96` (**single id, endpoint-wide**), contract `:45-46` (*"MUST run before removal"*). Sequence `:96-108`; restore `:63-81` (`_restoreRelationships`, idempotent on `(source,target,type)` `:59-61`), tag §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES `:59`. ⚠ **Cleans the SEMANTIC GRAPH only — it never touches `joinedToRoofIds`, which lives in a store this command cannot see** |
| **Two delete paths that clean different things** | — | ⛔ | `roof.delete` (L1) → DTO store, cleans nothing. `DeleteRoofCommand` (L2) → legacy store + graph, cannot see `joinedToRoofIds`. **Neither cleans the other's back-refs.** C84 **EI-4a** — one route per intent |
| **Roof → wall (`boundingWallIds`)** | region-traced roof | ⚠ one-way, unserialised | `RoofTypes.ts:148-158` — *"⚠ NOT YET POPULATED AT CREATION"*, naming both un-wired sites (`RoofTool._handleRegionClick`, `RoofPlanToolHandler`) and the missing consumer (*"a roof dependency tracker modelled on `SlabDependencyTracker`"*). `RoofDependencyTracker.ts` and `roofFollowsMovedWall.test.ts` **do** exist; the plan tool **does** dispatch (`RoofPlanToolHandler.ts:300`); **the save does not keep it** (RF-C-2) |
| **Level cleanup** | level delete | ⛔ **VOIDED** | `RoofLevelCleanupHandler.ts` constructed `initBuilders.ts:575` and **immediately discarded at `:578` `void roofLevelCleanupHandler;`**, retention comment `:571-572` (§ROOF-SYSTEM-AUDIT-2026 §10.2 — *reference only*). **A constructed-then-voided handler is a PARKED cascade and must be declared as one** |
| **`plugins/cross` roof rules** | synthesise `roof.move` | ⛔ **DECLARED INERT** | `MoveRoof.ts:36-38` — *"`CascadeRunner` is registered nowhere in production (only in packages/command-bus/__tests__/cascade.test.ts and commented-out examples)"*; disposition ADR-0323 / BIM30 R0 recorded `:39-45`. ✅ **This is the compliant EI-12 form** |
| **Skylight → geometry rebuild** | skylight edit | ⛔ **CANNOT FIRE** | `producers/roof.ts:292` names `RoofCommitter.onUpdate`'s `desc.hash === entry.descriptorHash` skip. `composeRoofGeometryHash.ts:23-37` folds boundary, thickness, overhang, pitch, shape, levelId, materialId, materialColor, worldY — **`skylights` and `joinedToRoofIds` are NOT folded**, so a skylight edit leaves the hash byte-identical and the rebuild is skipped. Latent only because neither verb has a dispatcher |

### TO-BE — normative

- **RF-X-1 (C79 §7.2).** `joinedToRoofIds` MUST be POPULATED-and-consumed, REMOVED, or DECLARED
  dormant with its condition. **It is currently the third: written, unread, uncleaned — the worst of
  the three states**, because it reads as wired.
- **RF-X-2 (EI-4a).** The two delete paths MUST become one route. ⛔ Do **not** copy the back-ref
  sweep into both — that mints the second answer EI-9 forbids (the exact shape of C84 EI-4a's
  §FIX-ONE-DELETE-PATH resolution).
- **RF-X-3.** `RoofLevelCleanupHandler` MUST be deleted or wired. `void x;` with a comment is C84
  §8.d — a comment as the mechanism.
- **RF-X-4.** If RF-S-4 makes `Roof.skylights` authoritative, `ROOF_HASH_SCHEMA_VERSION`
  (`composeRoofGeometryHash.ts:16`) MUST be bumped and `skylights` folded — its own `:11-12` already
  requires it: *"Any roof-DTO schema change that affects geometry output MUST bump
  `ROOF_HASH_SCHEMA_VERSION`."*

---

## 9. VOCABULARIES

### Roof form — FOUR vocabularies, THREE cardinalities

| Vocabulary | Members | Site |
|---|---|---|
| L0 `RoofShape` | **5** — `flat, gable, hip, mono, mansard` | `packages/schemas/src/elements/Roof.ts:7` |
| Legacy `RoofType` | **8** — `flat, shed, gable, hip, dutch, gambrel, mansard, barrel` | `packages/geometry-roof/src/RoofTypes.ts:3-11` |
| **UI offers** | **8** — same as legacy | `apps/editor/src/ui/property-panel/RoofPropertySheet.ts:18-25` |
| IFC | 8 — `FLAT_ROOF … BARREL_ROOF` | `RoofTypes.ts:20-28` |

Translation seam: `roofCreatedMirror.ts:80` — `roofType: ev.shape === 'mono' ? 'shed' : (ev.shape ?? 'flat')`.

> ⛔ **EI-3 VIOLATION, MEASURED: `dutch`, `gambrel` and `barrel` are offered by the UI
> (`RoofPropertySheet.ts:22, :23, :25`) and CANNOT be carried by the L0 pipeline.** `RoofShape` has no
> such members, so a `roof.create` carrying them fails Zod, and `roofCreatedMirror.ts:80` has no
> translation. They survive **only** on the legacy `roof.update` → `UpdateRoofCommand` path
> (`initBusHandlers.ts:911-914`), which never round-trips through L0.
> **Conversely `mono` is offered by no UI.** Overlap: 4 exact (`flat, gable, hip, mansard`) + 1
> aliased (`mono`↔`shed`). **Independently corroborated** by
> `tests/parity/roof/roof-snapshot.test.ts:10-13` — *"PRYZM 1 had 9 shapes vs PRYZM 2's 5, so
> reference diff requires a schema-mapping table."*

### Material — TWO INDEPENDENT SYSTEMS THAT NEVER MEET

**System A (live).** `RoofFragmentBuilder._createMaterials` (`:135-202`) builds four slots as
`[trimMat, deckMat, interiorMat, shingleMat]` (`:201`) from `STANDARD_MATERIAL_LIBRARY`
(`initBuilders.ts:590`).

**System B (unreachable).** `plugins/roof/src/committer/material-bridge.ts` — **note the path: under
`committer/`, not directly under `src/`.** Slots `:25`
`export type RoofMaterialSlot = 'shingle' | 'deck' | 'trim' | 'interior';`; key format `:28`
`roof|<slot>|<materialId>|<color>`; parse `:27-40`; factory `:42-55`; upstream composer named `:5`
(`producers/_internal/roof/composeRoofMaterialKey.ts`); re-exported `plugins/roof/src/index.ts:54-56`.
**It is reachable only through `RoofCommitter`, which has no editor importer** (§10).

> ⚠ Roof's key is **4-segment** (`roof|<slot>|<materialId>|<color>`) while wall's and curtain-wall's
> are **5-segment** (`<family>|<systemTypeId>|<materialId>|<color>|<slot>`). Three families, three
> parsers, one question. **EI-9.** Recorded here rather than resolved: the composer
> (`_internal/composeMaterialKey.ts` vs `_internal/roof/composeRoofMaterialKey.ts`) is also forked.

### TO-BE — normative

- **RF-Voc-1 (EI-3).** Either `RoofShape` gains `dutch`/`gambrel`/`barrel`, or the UI stops offering
  them. **An enum member the UI can select and the pipeline cannot carry is an affordance without an
  implementation.** ⚠ Removing them from the UI **withdraws three shipped roof forms** — prefer
  widening the schema.
- **RF-Voc-2.** `mono` MUST gain a UI member or be declared an alias of `shed` at the schema, not at
  a mirror function. The one-line `? :` at `roofCreatedMirror.ts:80` is the whole reconciliation
  between a 5-member and an 8-member vocabulary, and its own comment records what happened last time
  it was absent: **one whole roof form rendered flat.**
- **RF-Voc-3 (EI-8/EI-9).** The three material-key grammars MUST converge, or each MUST earn an
  EI-10 licence with an **executed** equivalence proof.

---

## 10. GEOMETRY

### Stack A — `packages/geometry-roof` (the viewport)

`RoofGeometryBuilder.ts:112` — `static generate(data: Readonly<RoofData>, holes?: …): THREE.BufferGeometry`.
Per-form generators: `generateFlat:659`, `generateShed:671`, `generateGable:703`, `generateHip:746`,
`generateDutchHip:810`, `generateGambrel:850`, `generateMansard:902`, `generateBarrel:954`,
`generateByRegion:1058`. **Input is the LEGACY record** (`roofType`, `slope`, `footprint`).
Hole punching `:264`, soffit holes `:259`, void reveals `:323`, soffit datum `:259`.
Face-hosting math: `packages/geometry-roof/src/pure/roofFaces.ts` — authored rectangle `:540`,
straddle refusal `:650-695` with its message `:691-695`.

### Stack B — `packages/geometry-kernel/src/producers/roof.ts:67` (`produceRoof`)

Signature `:54-56` `(roof, joinData, worldY)`. **Input is the L0 shape.** Eave offset `:87-102`;
`const slope = Math.tan(roof.pitch);` `:106`; form-honesty resolution `:110`.
Callers: `plugins/roof/src/committer/roof-committer.ts:84, :111, :129` — all
`produceRoof(dto, NO_JOINS, this.worldY())`.

**Stack B is import-unreachable from the editor.** `grep -rn "RoofCommitter\|roof-committer"`
(non-test) returns only its own package (`plugins/roof/src/committer/{index.ts:4-7,
roof-committer.ts:1, :35, :48, :65, :71, :77, :78}`, `plugins/roof/src/index.ts:51, :57, :58`) plus
two kernel comments (`producers/roof.ts:292`, `_internal/roof/roofFormResolution.ts:24, :34`).
⛔ **That is NOT licence to delete it** — C84 §3.5.2 and ADR-0331 §D5.

### Proven to agree? — **NO. What exists is a Stack-B regression snapshot.**

`tests/parity/roof/roof-snapshot.test.ts` (102 lines) + `configs/` + **23 committed
`snapshots/*.snap.json`**, CI-gated non-empty by `tests/ci/parity-non-empty.test.ts:16, :29-33, :37`
(total ≥ 163 across 12 families).

- `:19` imports `produceRoof` **only**. **`RoofGeometryBuilder` is never imported.**
- `:77` `const desc = produceRoof(f.roof, NO_JOIN, f.worldY);` — one stack, one call.
- `:91-99` compares against Stack B's **own past self**.
- `:82-88` — on a missing snapshot it **WRITES** the file and asserts only
  `expect(snap.position.length).toBeGreaterThan(0)` (`:86`), with the in-file admission `:84-85`:
  *"First-write path still asserts something so the test is a green checkmark."*
- `:10-13` — cross-engine parity is explicitly out of scope; **no `*.ref.json` exists** in
  `tests/parity/roof/`.
- `:61` `describe('roof snapshot parity (20 fixtures)')` — **stale by 3**; 23 snapshots are
  committed (`__configs__/roof-index.ts:307` — *"W-1C-5 top-up: 3 new fixtures"*).

> ⛔ **This is C84 §8.e verbatim — *"a parity test that compares a stack to itself"* — and its
> directory name is what has kept the debt looking paid.** ⚠ **A lane must not read
> `tests/parity/roof/` as EI-11 satisfied.** *(Recorded because this lane's own first census missed
> the directory and then mis-read its scope; both errors are kept per C84 §6.)*

### ⛔ THE DECISIVE PROOF THAT STACK B CANNOT CUT A SKYLIGHT

The three W-1C-5 fixtures (`packages/geometry-kernel/__tests__/__configs__/roof-index.ts:308-345`)
author real skylights — `flat-with-skylight:309-322` (one), `hip-with-multi-skylight:334-346` (two),
`gable-joined-pair:324-333` (`joinedToRoofIds: ['roof:gable-adj']`). Their committed hashes:

```
flat-with-skylight:      v1|0,0,0;6,0,0;6,0,4;0,0,4|0.2000|0.0000|0.0000|flat |level:0|_|_|3.0000
hip-with-multi-skylight: v1|0,0,0;6,0,0;6,0,6;0,0,6|0.2000|0.0000|0.4363|hip  |level:0|_|_|0.0000
gable-joined-pair:       v1|0,0,0;6,0,0;6,0,4;0,0,4|0.2000|0.0000|0.4363|gable|level:0|_|_|0.0000
```

`composeRoofGeometryHash.ts:23-37` folds **boundary, thickness, overhang, pitch, shape, levelId,
materialId, materialColor, worldY** — and nothing else. `ROOF_HASH_SCHEMA_VERSION = 1` at `:16`,
against its own contract `:11-12` (*"Any roof-DTO schema change that affects geometry output MUST
bump"*). **W-1C-5 added `skylights` and `joinedToRoofIds` and the version correctly stayed at 1 —
because those fields change no vertex.** Corroborating: `grep -ri skylight packages/geometry-kernel/src/`
→ **ZERO** (every hit is in `__tests__/__configs__/`).

### THE TWO SKYLIGHT REPRESENTATIONS — the family's headline

| | **Representation 1 — `Roof.skylights[]`** | **Representation 2 — `openingStore`** |
|---|---|---|
| Declared | `packages/schemas/src/elements/Roof.ts:80`, sub-schema `:13-24` | `packages/core-app-model/src/stores/OpeningStore.ts` |
| Written by | `roof.addSkylight` → `AddSkylight.ts:61`; removed `RemoveSkylight.ts:50` | `CreateRoofOpeningCommand.ts:173` (L2) |
| Store written | plugin **DTO** (`affectedStores:['roof']`) | `openingStore` |
| Read by | ⛔ **NOTHING.** Not `produceRoof`, not the legacy record, not the serializer | ✅ `RoofFragmentBuilder.ts:122-133` `_openingHoles(roofId)` → `store.getByHostId(roofId)` |
| Cut into geometry | ⛔ **never** — proven by the hash above | ✅ `RoofFragmentBuilder.ts:296-297` → `RoofGeometryBuilder.generate(data, holes)` `:112`, punch `:264` |
| Wired | — | ✅ `initBuilders.ts:702` `roofBuilder.setDeps({ openingStore })`, with the warning `:695-701` that without it *"the roof renders SOLID while the command reports success"* |
| Tested | ⛔ | ✅ `roofOpeningCutsHole.test.ts:93` (flat), `:158` (gable); `roofOpeningEndToEnd.test.ts:105, :146, :215` |
| **Dispatcher** | ⛔ **NONE** | ⛔ **NONE** (`CREATE_ROOF_OPENING` — §4) |
| Persisted | ⛔ 0 hits both files | ✅ `ProjectSerializer.ts:1024` (`openingStore.getAll()`) |
| Rollback-able | `createSnapshot` `'roof'` ✅ | ⛔ **`'opening'` has NO `createSnapshot` branch and NO `buildUndoStoreMap` entry** |

**Nothing bridges them.** Nothing reads `Roof.skylights` and writes `openingStore`.

### Datum — `worldY`, and three defaults

1. `RoofFragmentBuilder.ts:290-291` — `const level = this._bimManager.getLevelById(data.levelId); const worldY = level ? (level.elevation + data.baseOffset) : data.baseOffset;`, applied `:311`.
2. `packages/file-format/src/export/ifc/readers/RoofReader.ts:23-26` — **the SAME formula,
   independently re-implemented.** EI-9: one question, two implementations, no licence.
3. Stack B: `worldY` is caller-supplied (`producers/roof.ts:55`, used `:117, :144, :171, :209, :252,
   :277`, hashed `:296`); the only production-shaped caller defaults it to **zero**
   (`roof-committer.ts:80`, header `:5` — *"we pass NO_JOINS as the placeholder and worldY=0"*).
4. The three `baseOffset` defaults — 2.7 / 3.0 / 0 — §5.

### TO-BE — normative

- **RF-G-1 (EI-11).** A Stack A ↔ Stack B parity harness is **OWED**. It MUST consume C73's declared
  tolerance module (`packages/geometry-kernel/src/tolerance.ts`, shipped 2026-08-13 per **L-954**)
  and MUST NOT ship a bare call-site literal.
- **RF-G-2.** `roof-snapshot.test.ts:82-88`'s first-write path MUST **fail**, not write-and-pass. A
  control that cannot fail is not a control (C84 §5). And `:61`'s fixture count MUST be derived, not
  transcribed.
- **RF-G-3 (EI-9).** The `worldY` formula MUST have ONE implementation.
  `RoofReader.ts:23-26` MUST call it.
- **RF-G-4.** `'opening'` MUST gain a `createSnapshot` branch and a `buildUndoStoreMap` entry. Today
  the store that holds every roof and slab hole is **un-rollback-able and un-undoable through both
  mechanisms** — and `CreateSlabCommand.ts:43` already **declares** `"opening"`
  ([C92 §7](C92-ELEMENT-SLAB.md)).

---

## 11. THE DELTA

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** | **A user cannot make a hole in a roof by any measured route.** `Roof.skylights[]` is read by nothing; `openingStore` holes are cut and tested but `CREATE_ROOF_OPENING` has no dispatcher; nothing bridges the two | **the skylight**, entirely | C84 **EI-9**, **EI-12**, **EI-3** | dispatch each route end-to-end at the layer that COMMITS, not at a pure-function return ([[committed-is-not-reachable]]) |
| **2** | L0 and legacy roof records are **disjoint on five axes** (`boundary`/`footprint`, `shape`/`roofType`, `pitch`/`slope`, and two fields with no counterpart) | nothing directly — it is the **root cause** of #1, #3 and #5 | C84 **EI-1**, **EI-2** | an ADR + persistence migration. ⛔ not a lane refactor |
| **3** | `baseOffset` never reaches the mirror (`CEB:895-924` omits it), so `roofCreatedMirror.ts:89`'s `?? 2.7` **always** fires — the fix at `:86-88` is **inert** | **the roof's elevation**, on every bus-created roof | C84 **EI-2(a)** | add the field to `p` and the emit; assert a non-default arrives |
| **4** | **THREE `baseOffset` defaults**: 2.7 (`roofCreatedMirror.ts:89`) / 3.0 (`ProjectLoader.ts:234`) / 0 (`roof-committer.ts:80`) | **0.3 m of elevation on save+reload**, with nothing having edited the roof | [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) | create → save → reload → assert byte-equal |
| **5** | `materialId`, `materialColor`, `systemTypeId` dropped at `CEB:895-924` | **the specified roof material** | C84 **EI-2(a)** | round-trip through `roof.create` |
| **6** | **EIGHT verbs write the dead DTO store and report success**, while two refuse for exactly that reason | every skylight, join, pitch, shape, thickness and overhang edit made through the bus | C84 **EI-2**, [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) | route (CA-17) or refuse (CA-18) |
| **7** | `joinedToRoofIds` — written symmetrically, **never read, never cleaned, no un-join verb** | nothing visible; the model accumulates dangling ids forever | C84 **§4C**, [C79 §7.2](C79-REGION-SEMANTICS.md) | POPULATE-and-consume, REMOVE, or DECLARE dormant |
| **8** | Roof ratchets `metadata.version` on every undo (`UpdateElementParameterCommand.ts:410-413` excludes it) | audit comparability — **the model is not the same model** | [ADR-0319 §2](../adrs/) · **L-952** | ⛔ control first, watched RED: assert byte-equal |
| **9** | UI offers `dutch`/`gambrel`/`barrel`; L0 `RoofShape` has 5 members | **three roof forms** unusable through any L0 path | C84 **EI-3** | enumerate both unions in one test |
| **10** | `boundingWallIds` carried through three hops with a comment at each — **and not serialised** | **which walls the roof follows**, on the first save | C84 **EI-6** | save/load a region-traced roof |
| **11** | `tests/parity/roof/` is a Stack-B **self**-snapshot (`:19` imports `produceRoof` only); its first-write path writes-and-passes (`:82-88`) | nothing today; every future kernel divergence ships unseen | C84 **EI-11**, **§8.e** | build RF-G-1; make first-write fail |
| **12** | `'opening'` has no `createSnapshot` branch and no `buildUndoStoreMap` entry, while `CreateSlabCommand.ts:43` declares it | **the rollback that was promised** for every roof and slab hole | C84 **EI-7c/EI-7d** · L-953 | `check-affected-stores.ts` + `check-undo-store-coverage.ts` |
| **13** | Two delete paths clean different things and neither cleans the other's back-refs | orphaned graph edges or orphaned back-refs, depending on route | C84 **EI-4a** | one route per intent |
| **14** | `RoofLevelCleanupHandler` constructed then `void`-ed (`initBuilders.ts:575, :578`) | level-delete cleanup that reads as wired | C84 **EI-12**, **§8.d** | delete or wire |
| **15** | `worldY` formula implemented twice (`RoofFragmentBuilder.ts:290-291`, `RoofReader.ts:23-26`) | IFC and viewport can drift | C84 **EI-9** | one implementation |
| **16** | `'RoofMesh'` recognised at `EdgeProjectorService.ts:156` with no producer; `root.userData.type` and `.elementType` both hold `'roof'` | nothing | C84 **§4E**, **EI-9** | remove or produce |
| **17** | `composeRoofGeometryHash` does not fold `skylights`; `producers/roof.ts:292`'s hash-equality skip would suppress every skylight rebuild | latent — blocked behind #1 | [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) | bump `ROOF_HASH_SCHEMA_VERSION` when #1 lands |

---

## 12. REFUSALS

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `roof.move` refuses, naming `roof.update` and its payload keys | `MoveRoof.ts:71-72`, `:108` | ✅ **CORRECT AND REQUIRED** under [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md). ⛔ MUST NOT be "fixed" into silent success. `execute()` deliberately left intact (`:87+`) — *"`canExecute` is the gate the bus actually honours"* |
| **R-2** | `roof.setMaterial` refuses, naming `roof.update` | `SetRoofMaterial.ts:56-57`, `:83` | ✅ correct |
| **R-3** | A skylight that **straddles two roof faces** is refused, and the refusal **names both slopes** | `pure/roofFaces.ts:650-695`, message `:691-695` — *"the skylight does not fit inside face #N — … A skylight is a … Move it clear of the edge, make it smaller, or author two skylights."* | ✅ **EXEMPLARY.** This is the C84 governing-sentence form: a refusal that names its reason and its three exits |
| **R-4** | Hosting a skylight on the nearest face when the point is not on it is refused | `roofFaces.ts:631` — *"Hosting it on the nearest face would cut a skylight through a slope the point is not on"* | ✅ correct |
| **R-5** | A horizontal face gets a DETERMINED (not guessed) result | `roofFaces.ts:213` | ✅ correct |
| **R-6** | The bake worker does **not** build roofs | zero `roof` matches in `apps/bake-worker/src` | ⚠ **UNDECLARED ABSENCE, DECLARED HERE.** A self-host bake silently omits every roof. It MUST refuse or declare |
| **R-7** | GLB export has no roof reader | `GLBExporter.ts:177` is a comment | ✅ by design — GLB walks the scene |
| **R-8** | No `roof.batch.create`, no rotate verb, no colour verb, no `roof.unjoinRoofs` | §6 | ⚠ **FOUR UNDECLARED ABSENCES, DECLARED HERE** |
| **R-9** | `plugins/cross` roof cascade rules are **inert by recorded decision** | `MoveRoof.ts:36-45` | ✅ **THE COMPLIANT EI-12 FORM** — names the missing runner, the disposition (ADR-0323 / BIM30 R0) and the condition. Copy this shape |
| **R-10** | Stack B (`geometry-kernel/src/producers/`) has no editor render path | C84 §4D; `main.ts:407` passes `canvas: null` | ✅ declared. ⛔ Nothing there may be deleted as dead — **ADR-0331 §D5 is an open FOUNDER question** (C84 §9) |

### Explicitly NOT REFUSED, and that is the finding

`roof.addSkylight` accepts a well-formed skylight, validates it against `Skylight` (`:41-48`),
guards duplicate ids (`:47`), writes it (`:61`) — **into a store nothing reads, with an inverse patch
that has no destination field.** It reports success. Under C84's governing sentence
(`WallRake.ts:50-62`) it ought to refuse today, and it does not.

---

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances (C84 EI-1b).

1. **Whether the UI still offers `roof.move` / `roof.setMaterial`** — the EI-3 control census, owned
   by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
2. **`openingStore.getByHostId` behaviour for a roof never region-traced** — store behaviour, not
   measured.
3. **Runtime bus-verb registration order** — whether `CreateRoofHandler` actually wins `roof.create`.
   `initBusHandlers.ts:2249-2253` claims *"Phase 3 exit gate: grep 'roof.create' initBusHandlers.ts
   → 0 bridge entries"* and the grep confirms 0, but `PluginRegistry` registration order was not read.
4. **`RoofMetadata` field list** — referenced `RoofTypes.ts:169`, definition not read.
5. **Whether `RoofDependencyTracker` has a production constructor** — the file and its test exist;
   the wiring was not measured.
6. **Plan-view store authority** — C84 §9 records this unmeasured for every family; roof included.
7. **Whether `initBuilders.ts:578`'s `void roofLevelCleanupHandler;` leaves any live subscription**
   (the constructor may self-register).
8. **`packages/persistence-client/src/loader/`** — deliberately not measured; DEAD.

---

## Appendix — C84 claims this contract CONFIRMED, REFINED or REFUTED

| C84 claim | Verdict |
|---|---|
| `roof.skylights` and `materialId` dropped at `CEB:895-924` | **CONFIRMED** — arm `:892-926`, `p` `:895-906`, emit `:907-924`. `materialColor` and `systemTypeId` also dropped |
| *"the roof renders unperforated, the skylights are never cut"* | **REFINED — TRUE OF `Roof.skylights[]`, FALSE AS A BLANKET CLAIM.** `openingStore` holes ARE cut (`RoofFragmentBuilder.ts:296-297`), are wired (`initBuilders.ts:702`) and are tested (`roofOpeningCutsHole.test.ts:93, :158`). The sharper finding: **two disjoint representations, neither reachable, nothing bridging them** |
| `roof.baseOffset` is inert — `roofCreatedMirror.ts:89-91` always takes `?? 2.7` because CEB never emits it | **CONFIRMED** verbatim, and **extended**: there are THREE different defaults (2.7 / 3.0 / 0) |
| roof EI-1 authority `✅ legacy` (§4) | **CONFIRMED** on all six EI-1b consumers, recorded `✅` |
| `roof.move` refuses in `canExecute` | **CONFIRMED** `:108`. `roof.setMaterial` also `:83` |
| `ChangeRoofLevel` writes the DTO view; undo routes via `changeLevel()`; **neither writes a LevelStore** | **CONFIRMED** — `ChangeRoofLevel.ts:44-48`, `elementUndoStoreAdapter.ts:321-332` |
| `joinedToRoofIds` back-refs on roof delete are DANGLING (§4C) | **CONFIRMED** — `DeleteRoof.ts:36-39` is the entire mutation. **Extended**: nothing READS the field either, and there is no un-join verb |
| `UpdateElementParameterCommand.ts:214-219` concedes roof is not audit-neutral | **CONFIRMED, line span corrected to `:213-218`** |
| `'RoofPart'` is roof's `elementType` (§4E) | **REFINED** — the child mesh only (`:304`); the pickable root carries `'roof'` (`:268`). Plus `'RoofMesh'`, recognised at `EdgeProjectorService.ts:156` with **no producer** |
| slab/door/window parity harnesses OWED (§5) | **EXTENDED** — roof's parity directory **exists** and is a Stack-B **self**-snapshot. C84 §8.e. ⚠ A lane must not read its existence as EI-11 satisfied |


---

## §L-1032 — THE STOREY AXIS: change level, and duplicate to level

> **Added 2026-08-19 by lane EL1**, from the founder's request logged as
> [L-1032](../../04-reference/ISSUE-LOG.md): *"Every element needs to be possible to be changed the
> level via properties panel … and via chat."* The honest end state that request asks for is **not**
> *"every family has a dropdown"* — it is **every family either offers the control or declares, in
> its contract, why it must not**. This section is that declaration for this family.
>
> **THE REGISTER IS THE AUTHORITY, NOT THIS SECTION.**
> `packages/command-bus/src/levelChangeVerbs.ts` holds `LEVEL_CHANGE_VERBS` and
> `LEVEL_CHANGE_REFUSALS`, and the L3 event bridge, the L7 property panel and the chat registration
> all read those rows. Re-deriving the answer here would be the fourth copy and the thing C84 EI-9
> forbids. If this section and the register disagree, **the register wins and this section is
> stale** — which is a defect, not a discrepancy to live with.

### THE VERB — `roof.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ roofId, levelId }` — declared at `packages/command-bus/src/levelChangeVerbs.ts` |
| **Handler** | `plugins/roof/src/handlers/ChangeRoofLevel.ts:25` |
| **Registered** | `plugins/roof/src/handlers/index.ts:30` |
| **Legacy move** | `packages/geometry-roof/src/RoofStore.ts:153` — `changeLevel(id, newLevelId)` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.roof` |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm: a depth-2 `[id,'levelId']` inverse patch routes to `store.changeLevel()`, and re-registers bimManager + the view-dependency tracker with it |

### WHY THE STORE NEEDED ITS OWN `changeLevel`, FOR THIS FAMILY SPECIFICALLY

`RoofStore.update()` **THROWS** `levelId is immutable after creation` (`RoofStore.ts:109`). A
mirror written as a plain `update({levelId})` therefore fails loudly at runtime and silently in any
suite that never runs it — the throw lands in `elementUndoStoreAdapter`'s per-patch `try/catch` as
one `console.error` while the keypress reports success. `changeLevel` (`:153`) is the only route,
and it emits **one `'update'`** (`:175`) rather than `remove`+`add`, because
`RoofFragmentBuilder._updateRoofSync` re-derives `worldY = getLevelById(levelId).elevation +
baseOffset` and repositions the root on every update.

> ⚠ **THE FINDING WORTH RECORDING HERE IS NOT THE VERB — IT IS THAT NOTHING DISPATCHED IT.**
> `roof.changeLevel` has been live, undoable and correctly cascading **since S11**. Until
> 2026-08-19 the property panel's eligibility test was the literal `elType === 'wall'`
> (`PropertyPanelSections.ts`), so **no control anywhere in the product dispatched this verb.** A
> complete, contract-conformant, tested capability was unreachable for months because one `if`
> compared against a string instead of consulting a table. §committed-is-not-reachable, in the
> property panel. That is why the eligibility answer now lives in a register and not in an `if`.

### THE FOUR-PART CHAIN, AND WHY ALL FOUR ARE THIS CONTRACT'S BUSINESS

A level change is not one write. Omit any part and the command reports success over a void:

1. **the bus verb** — rewrites `levelId` in the plugin DTO store and produces the patch pair;
2. **the legacy mirror** — moves the record the renderer, plan view, persistence and IFC export
   actually read (§2 THE AUTHORITY). Skip this and you have L-946: *"the command succeeded, the
   plugin store was right, and the layer the user experiences kept its own unchanged copy"*;
3. **spatial re-registration** — `bimManager.registerElement` (exclusive-containment, so
   re-registering IS the move) and the view-dependency element→level map;
4. **both storeys re-project** — the one being LEFT as well as the one being joined. Dirty only the
   destination and the source storey's plan view keeps drawing an element that has gone.

### ⚠ THE CAP ON THIS FEATURE — L-1085, OPEN

`canExecute` validates the element's existence against the **plugin DTO store**, and
[C84 EI-5a](C84-ELEMENT-INTEGRITY.md) records that *"after any project load, every plugin DTO store
is EMPTY."* So the control works on elements authored **in the current session** and **refuses, by
name, on anything restored from a saved project**. The refusal is C16 CA-18 conformant and is
strictly better than the alternative — relaxing the check would make the forward move work while
producing an empty inverse patch, i.e. an authoritative mutation with no Ctrl+Z (C84 EI-7). **The
real fix is ADR-0331 §D2/§D3 and is not per-family.** Do not work around it here.

### DUPLICATE-TO-LEVEL

A **separate verb**, never a flag on the level change: it mints new ids and must not collide with
the source. Its per-family disposition is declared alongside the copy-payload mapping in
`apps/editor/src/engine/views/plantools/`, which is the one place a legacy record is translated into
a create payload — L-978 is what a second copy of that mapping costs (four field names the receiver
did not accept, so every copied curtain wall was minted at the schema's default origin, silently).

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **⛔ DARK for type · PUBLISHED for dimensions**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `roof` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1979 |
| **Type catalogue** | ⚠ **MIXED, and `CatalogueFamilies.ts` got this wrong.** `roofType` is a closed enum (`RoofTypes.ts:3`) — but an **8-entry `{id, name}` list ships at `ElementTypeCatalogRegistry.ts:112-126`**, so a refusal CAN list the real options. The old claim *"roof, column, beam — no named type CATALOGUE exists at all"* covered three families with different truth values; corrected 2026-08-19. |
| **Type field on the record** | ✅ `roofType` on `RoofData` (`RoofTypes.ts:88`) |
| **Executor the chat must use** | ✅ `element.changeType` `:1979` → `UpdateRoofCommand(id, { roofType })`, ring-parity via `_swapWithRingParity('roofStore', 'roof', …)` |
| **Chat capabilities published TODAY** | `set-roof-pitch` · `set-overhang` · `set-thickness` · `set-base-offset` — **but NO type change** |
| **Retiring condition** | Inject the 8-entry list as `ctx.catalogues.roof`. **Nothing else.** |

### Scoping — what a published capability for this family MUST accept

The founder's ask is *"BY LEVEL, BY ROOM, ETC"*. The shared grammar
(`makeHostedTypeParser`, `ZeroTokenResolver.ts:3340`) **already** captures `on level N` and
`in the <room>`, and `FilterScope.ts` lifts property/type predicates out before it runs — so
`all` · `selection` · `level` · `room` (· `orientation` where the family has a façade) are the
target, and **the work is the DECLARATION, not the reach** (L-1142).

| Scope | Target | AS-IS for this family |
|---|---|---|
| `all` | ✅ required | ⛔ no type capability; the dimension capabilities are `scope:'selection'` only |
| `selection` | ✅ required | ✅ for `set-roof-pitch` / `set-overhang` / `set-thickness` / `set-base-offset` · ⛔ for type |
| `level` | ✅ required | ⛔ neither type nor dimensions accept it |
| `room` | ✅ required | ⛔ neither type nor dimensions accept it |
| **selection as a GEOMETRY SOURCE** | family-dependent | see C84 §4F.5 — selection **is** available to the RAC (`ResolverContext.selection`, non-optional, id **and** kind, rebuilt every message); `create-wall` is the one capability that declares no subject axis |

### Findings

- ⭐ **Roof is the clearest single instance of the C84 §4F.1 pattern**: it was excluded by a sentence that grouped it with column and beam under *"no named catalogue exists at all"*, and unlike those two **it has one**. A shared reason is how a false one survives.
- ⚠ The value is an **enum member**, not a project-scoped catalogue entry — so the refusal lists 8 fixed options and the same 8 in every project. That is a *simpler* case than wall/window, not a harder one.
- **NOT MEASURED**: V3/V4/V5 under a chat driver.

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.
