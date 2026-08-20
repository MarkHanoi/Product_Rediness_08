# C88 — ELEMENT: CEILING

- **Status**: CANONICAL — binding on every PR touching the ceiling family
- **Date**: 2026-08-18
- **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — this contract implements the twelve mandatory
  sections C84 §6 defines. **C84's invariants EI-1…EI-13 are NOT restated here; they are applied.**
- **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
  `affectedStores` identity · [C11](C11-ELEMENT-CREATION-PIPELINE.md) owns the creation pipeline ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) owns command authoring and **CA-18** (refusal is
  conformance) · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) owns tolerance ·
  [ADR-0319 §2](../adrs/) owns audit-field classification across undo (**not C75** — C75's scope
  line disclaims it) · [C79](C79-REGION-SEMANTICS.md) owns `boundingWallIds` / region semantics ·
  [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) owns `elementType` casing.
- **Measured**: 2026-08-18, main worktree `Product_Rediness_08`, at HEAD `18eab722`.
- **Which persistence half was checked**: the **LIVE** pair
  `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts`. The
  `packages/persistence-client/src/loader/` pair was checked **only** to confirm it is the dead
  copy — the live serializer says so itself at `ProjectSerializer.ts:268-271`
  (*"The persistence-client copy is not on the save path"*) and the live loader at
  `ProjectLoader.ts:328-331` (*"the persistence-client copy, which the app never builds"*).

> **Every cell below is measured or reads the literal `NOT MEASURED`. A blank reads as "fine",
> and that is how every defect in C84 §4 survived** (C84 EI-1b).

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE (normative) |
|---|---|---|
| Canonical `userData.elementType` | **`'ceiling'`** — `packages/geometry-slab/src/ceiling/CeilingPanelBuilder.ts:241`. **One spelling; no rival.** | Unchanged. Frozen per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md); consumers compare via `.toLowerCase()` |
| Other spellings in use | **NONE FOUND.** `CeilingStore` emits `elementType: 'ceiling'` on its store-event bus at `packages/core-app-model/src/stores/CeilingStore.ts:161,228,253,293,311`; `DeleteElementCommand.ts:582` sets `this.elementType = 'ceiling'` | — |
| L0 Zod schema | `packages/schemas/src/elements/Ceiling.ts` — **NOT ON THE CREATE PATH.** `plugins/ceiling/src/handlers/CreateCeiling.ts` parses via the plugin-SDK `Ceiling` re-export; the bus **payload** type is `CreateCeilingPayload`, not the Zod record | The payload type and the parsed record MUST be the same shape or the divergence MUST be declared (§5) |
| Bus verb namespace | `ceiling.*` — **nine** registered verbs, `plugins/ceiling/src/handlers/index.ts:16-39` | Unchanged |
| Legacy geometry type | `CeilingData` — `packages/core-app-model/src/stores/CeilingTypes.ts` | Unchanged |

> ⚠ **This row CLOSES a C84 §4E `NOT MEASURED`.** C84 §4E records *"ceiling, floor and
> curtain-wall: NOT MEASURED — no `elementType` assignment surfaced."* For ceiling the assignment
> exists and is single: `CeilingPanelBuilder.ts:241`. Ceiling is **conformant** on C15 §12 — the
> only family in this contract's cohort that is (compare C99 plumbing, which has two
> non-case-variant spellings).

---

## 2. Stores — and which one is the AUTHORITY

| # | Representation | Where | Written by | Read by |
|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Ceiling.ts` | the bus payload | `parse()` inside `CreateCeilingHandler` |
| 2 | **Plugin DTO store** | `plugins/ceiling/src/store.ts`, registered `apps/editor/src/PluginRegistry.ts` | **all nine** `ceiling.*` verbs | **measured: no renderer, no plan projector, no serializer, no IFC reader.** The `ceiling.setMaterial` refusal text says so verbatim (`SetCeilingMaterial.ts:57`) |
| 3 | **LEGACY geometry store — ⭐ THE AUTHORITY** | `packages/core-app-model/src/stores/CeilingStore.ts`; instantiated `apps/editor/src/engine/initBuilders.ts:387`, published as `window.ceilingStore` at `:388` | the `ceiling.created` bridge (`initTools.ts:1510-1577`) + the legacy `CreateCeilingCommand` | `CeilingPanelBuilder` (via the three DOM listeners `initBuilders.ts:398-414`), the plan projector, `ProjectSerializer.ts:1040`, `DeleteElementCommand.ts:578-603` |
| 4 | THREE scene `userData` | `CeilingPanelBuilder.ts:241` | the fragment builder | GLB export, picking, delete routing |
| 5 | Kernel producer record | `packages/geometry-kernel/src/producers/ceiling.ts` | `plugins/ceiling/src/committer/ceiling-committer.ts` | **the bake worker does NOT read it** — `HeadlessBakeSession.ts:23,31,43,53,124-131` wires `WallStore` + `produceWall` **only**. Ceiling is absent from the bake worker entirely |

**EI-1 verdict: ✅ SINGLE AUTHORITY, and it is `CeilingStore` (#3).** No split-brain: every measured
consumer reads #3. This is a **clean negative result and it is recorded as such** (EI-1b).

**EI-1a — the store key `'ceiling'` resolves to TWO DIFFERENT OBJECTS across one command's
lifecycle, and this family is affected:**

| Moment | Key `'ceiling'` resolves to | Site |
|---|---|---|
| WRITE (forward patch) | the **plugin DTO** snapshot view | `apps/editor/src/bootstrap.ts:94,148-159` (`storesAsRecordView`) |
| UNDO (inverse patch) | `window.ceilingStore` — the **legacy geometry** store | `apps/editor/src/engine/undo/performUndoRedo.ts` `buildUndoStoreMap()`, entry `ceiling: w.ceilingStore, ceilings: w.ceilingStore` |

**DECLARED DIVERGENCE (C03 §4.6 U-2b requires it be declared or fixed).** The two permitted exits
are C16 **CA-17** (route the write) or `affectedStores: [] as const`. Eight of nine ceiling verbs
take neither. **This is the family's #1 delta (§11.1).**

> ⚠ `ctx.stores.ceiling` **is not a store.** The mechanism is [C03 §4.5](C03-SCHEMAS-COMMANDS-AND-STATE.md)'s
> and is cited, not re-derived here.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3-D) | LEGACY `CeilingStore` | `initBuilders.ts:391` `new CeilingPanelBuilder(scene, bimManager)`; listeners `:398-414` look the record up by id from `ceilingStore` | ✅ authority |
| Plan view | LEGACY — via `bimManager.registerElement` + `viewDependencyTracker.registerElement`, both called by the bridge at `initTools.ts:1566-1567` with the comment *"without these two calls, ceiling elements created via the bus path are invisible in plan view"* | `initTools.ts:1566-1567` | ✅ authority. **Per-family plan-view STORE authority beyond this registration is `NOT MEASURED`** (C84 §9 records this gap repo-wide) |
| Persistence (save) | LEGACY | `ProjectSerializer.ts:1040` — `ceilingStore ? ceilingStore.getAll().map(c => deepStrip(c)) : []` | ⚠ see below |
| Persistence (load) | LEGACY, via the **legacy command** | `ProjectLoader.ts:995` `new CreateCeilingCommand({…})` — **no bus verb is dispatched** | ⚠ see §7 |
| IFC export | **NOTHING** | `packages/file-format/src/export/ifc/readers/` contains Beam, Column, CurtainWall, Furniture, Handrail, Plumbing, Roof, Room, Slab, Stair, Wall, WindowDoor — **no `CeilingReader.ts`**. Ceiling survives IFC export only as a room *property string*, `readers/RoomReader.ts:135,145` `CeilingCovering` | ⛔ **EI-6 VIOLATION** |
| GLB export | scene `userData` | `CeilingPanelBuilder.ts:241` | ✅ |
| Bake worker | **ABSENT** | `HeadlessBakeSession.ts:31,43,53` — `WallStore` only | ✅ no split (nothing to diverge) |
| Sync / collaboration | `ceiling.create` is synced; **`ceiling.batch.create` is NOT** | `packages/sync-client/src/syncDisposition.ts:915` — *"MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND"* | ⚠ declared, not silent — acceptable under C16 CA-DOCTRINE-A |

> ⚠ **A SILENT-EMPTY HAZARD IN THE SAVE PATH, newly measured.** `ceilingStore` is declared
> **OPTIONAL** on `ProjectStores` (`ProjectSerializer.ts:798`) and `:1040` resolves an absent store
> to `[]`. **A project saved by a caller that did not pass `ceilingStore` writes zero ceilings and
> reports success.** That is the `[[context-data-honesty-family]]` shape — *failure and empty are
> the same value*. It is **latent** (the one production construction site,
> `initPersistence.ts:41-43`, passes it) and it is not a defect today; it is an
> **unguarded affordance**. TO-BE: make the field required, or refuse when it is absent.

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

| Handler | Verb | Registered in production? | Reachable from a UI control? | State |
|---|---|---|---|---|
| `CreateCeilingHandler` | `ceiling.create` | ✅ `handlers/index.ts:16` | ✅ ceiling plan tool | **LIVE** |
| `CreateCeilingBatchHandler` | `ceiling.batch.create` | ✅ `:17` | ⚠ generators / AI only — **no ribbon control measured** | LIVE (non-UI) |
| `DeleteCeilingHandler` | `ceiling.delete` | ✅ `:18` | ⛔ **NO** | **DORMANT** — see below |
| `SetCeilingBoundaryHandler` | `ceiling.setBoundary` | ✅ `:19` | `NOT MEASURED` | — |
| `SetCeilingHeightHandler` | `ceiling.setHeight` | ✅ `:20` | `NOT MEASURED` | — |
| `UpdateCeilingLayersHandler` | `ceiling.updateLayers` | ✅ `:35` | ✅ property panel type selector (`PropertyPanelTypeSelector.ts:137`) | LIVE |
| `SetCeilingMaterialHandler` | `ceiling.setMaterial` | ✅ `:36` | ⚠ **REFUSES** — `SetCeilingMaterial.ts:83` | see §6 |
| `UpdateCeilingsSystemTypeBatchHandler` | `ceiling.updateSystemTypeBatch` | ✅ `:39` | RAC/chat | **`affectedStores: [] as const`** (`:71`) — lineage L3 |
| ~~`UpdateCeilingHandler`~~ | `ceiling.update` | ⛔ **DELIBERATELY UNREGISTERED** — `handlers/index.ts:23` records the removal and the reason | — | declared |

**`ceiling.delete` is DORMANT, not a latent bug** (C84 §3.5.3's verdict for the ten `<kind>.delete`
verbs). Every real ceiling delete reaches `DeleteElementCommand.ts:578-603`. ⛔ **Do not delete
the verb** — it is the PRYZM 3 target vocabulary. **Consequence (EI-5): the plugin DTO ceiling
record is ORPHANED by every user delete**, because the delete that runs never touches store #2.

**Reachability was measured on BOTH axes** (C84 §3.5.1): (a) import/construction — the handler set
is constructed by `buildCeilingHandlerSet`; (b) bus — `grep "ceiling.delete"` over `apps/`,
`plugins/`, `packages/` excluding `__tests__` returns the registration and nothing that dispatches.

---

## 5. THE BRIDGE FIELD MAP — every field, no omission

**The bridge**: `ceiling.create` payload → `CommandEventBridge.ts:633-654` (`ceiling.created`) →
`initTools.ts:1510-1577` → `CeilingStore.add()`.
**This table is what the future `check-bridge-field-coverage` gate consumes.**

| Payload field | CEB (`:636-652`) | initTools (`:1519-1560`) | Destination in `CeilingData` | Disposition |
|---|---|---|---|---|
| `id` | carried `:648` | `:1525` | `id` | **CARRIED** |
| `levelId` | carried `:646` | `:1527` (and `parentId` `:1528`) | `levelId`, `parentId` | **CARRIED**, duplicated into two fields |
| `boundary` (`Vec3[]`) | carried `:649` | `:1521-1523` `ev.boundary.map(v => ({x: v.x, z: v.z}))` | `boundary.polygon: CeilingVertex[]` | ⛔ **TRANSFORMED — LOSSY. Per-vertex `y` is DISCARDED.** Every vertex elevation collapses to the single scalar `ceilingHeight`. A sloped or stepped ceiling drawn by the user becomes flat, silently. **EI-2(d) collapse.** |
| `ceilingHeight` | carried `:650` | `:1533` `?? 2.7` | `boundary.height` | **CARRIED** (with a documented default) |
| `thickness` | carried `:651` | `:1534` `?? 0.025` | `boundary.thickness` | **CARRIED** |
| `materialId` | ⛔ **NOT IN THE SINGLE-CREATE CAST AT ALL** (`:636-642`). Present in the **batch** cast at `:666` and **DROPPED** at the emit `:673-682` | never seen | `CeilingData` **CAN hold it** — `CeilingStore` carries material fields (`initTools.ts:1538-1542` writes a *literal* into the same object) | ⛔ **DROPPED BY OMISSION — EI-2(a).** The bus registry declares it: `packages/command-bus/src/commands.ts:1122` |
| `materialColor` | ⛔ same — declared at `commands.ts:1123`, absent from both CEB casts | never seen | ditto | ⛔ **DROPPED BY OMISSION** |
| — | — | `:1538-1542` writes `finishSpec: { exposedStructure: false, soffitColor: '#F5F5F0', soffitPattern: 'none' }` | `finishSpec` | ⛔ **HARD-CODED LITERAL.** Every bus-created ceiling is the same off-white. **The destination can hold the colour; the committer's own `material-bridge.ts:18-23` can compute one from the material key. This is omission, not a representational limit.** |
| — | — | `:1543` `holeElements: []` | `holeElements` | **SEEDED EMPTY** — see §8 |
| — | — | `:1544` `coveredRoomIds: []` | `coveredRoomIds` | **SEEDED EMPTY, never written back** |
| — | — | `:1545` `boundingWallIds: []` | `boundingWallIds` | ⛔ **SEEDED EMPTY — and the LEGACY path populates it.** `CreateCeilingCommand.ts:220` writes `boundingWallIds: sketch.boundingWallIds`, the [C79 §9.3](C79-REGION-SEMANTICS.md) **POPULATE** fix. **Two creation paths for one family: one honours C79, one does not.** EI-9. |
| — | — | `:1529` `label: 'Ceiling'` | `label` | **HARD-CODED** — every bus-created ceiling has the identical label. The legacy path numbers them |
| — | — | `:1530` `ceilingNumber: ''` | `ceilingNumber` | **HARD-CODED EMPTY** |
| — | — | `:1535` `baseOffset: 0` | `boundary.baseOffset` | **HARD-CODED** — the payload has no such field to carry |
| — | — | `:1536` `detectionMethod: 'manual-polygon'` | `boundary.detectionMethod` | **HARD-CODED** — provenance is asserted, not measured. Compare `DetectionMethodOrigin.ts:342`, which classifies this value as *"user drew the finish outline"* — **true for the plan tool, false for an AI or generator dispatch** |
| — | — | `:1549` fresh `crypto.randomUUID()` | `ifcData.guid` | ⚠ **MINTED AT THE BRIDGE, not carried.** A create/undo/redo cycle therefore produces a **different IFC GUID**. Compare floor, whose payload carries `ifcGuid` (C89 §5). **ADR-0319 §2** class question: an identity that changes across redo is not the same element to any external consumer |
| — | — | `:1553-1558` `createdAt/modifiedAt: Date.now()`, `version: 1` | `metadata` | **MINTED** — see §7 (L-952) |

**Fields the destination holds that NO payload can reach**: `finishSpec.exposedStructure`,
`finishSpec.soffitPattern`, `slope`, `systemTypeId` (reachable only via the separate
`ceiling.updateLayers` verb), `holeElements`. **EI-3 inverse**: the record is richer than the
vocabulary that creates it.

**TO-BE.** Every row above reads **CARRIED** or **DECLARED DROPPED with a named reason**. Nothing
reads *absent*. In particular: (a) `boundary` carries `y` per vertex or the payload's own schema
refuses non-planar boundaries loudly; (b) `materialId`/`materialColor` are carried into
`finishSpec.soffitColor` through the **one** material vocabulary (§9); (c) `ifcGuid` is a payload
field, minted by the caller, stable across undo/redo.

---

## 6. Verbs

Lineages are C84 §4A's L1–L6. **"Stores written" is the measured write set; "stores restored" is
what `buildUndoStoreMap()` / `createSnapshot` actually put back.**

| Verb | Lineage | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `ceiling.create` | **L1** | plugin DTO `ceiling` (via `produceCommand`, `CreateCeiling.ts`) **+**, through the bridge, legacy `CeilingStore` + `bimManager` + `viewDependencyTracker` (`initTools.ts:1566-1567`) | legacy `CeilingStore` only (`buildUndoStoreMap` maps `ceiling → w.ceilingStore`) | ⛔ **NO — WRITES ⊋ RESTORES.** The DTO record survives the undo forever. C84 **EI-7a** |
| `ceiling.batch.create` | **L1** | as above, ×N; **one** patch pair for N ceilings | as above | ⛔ NO |
| `ceiling.delete` | L1 | plugin DTO only | — | **DORMANT** — no production dispatcher |
| **`element.delete`** (the real delete) | **L2** | legacy `CeilingStore.remove` `:601`, `bimManager.unregisterElement` `:592`, `semanticGraphManager.removeAllRelationshipsForElement` `:598`, `elementRegistry.unregister` `:599` | `createSnapshot` **DOES** cover `'ceiling'` — `CommandManagerImpl.ts:617` `['ceiling','ceilingStore',(ctx.stores as any).ceilingStore]`; plus `_captureRelationships([id])` at `:597` for the graph half | ⚠ **plugin DTO NOT restored** (it was never written by this path either — so this verb is *internally* symmetric; the asymmetry is with `ceiling.create`) |
| `ceiling.setBoundary` | L1 | plugin DTO only | legacy store (wrong object — EI-1a) | ⛔ NO |
| `ceiling.setHeight` | L1 | plugin DTO only | legacy store (wrong object) | ⛔ NO |
| `ceiling.updateLayers` | L1 | plugin DTO only | legacy store (wrong object) | ⛔ NO |
| **`ceiling.setMaterial`** | — | **NONE — REFUSES** at `SetCeilingMaterial.ts:83` | — | ✅ **C16 CA-18 CONFORMANT.** The refusal names the mechanism verbatim (`:57`): *"It writes the plugin DTO store, which is a FRESH instance built by PluginRegistry and is read by no renderer, no 2-D projector, no IFC exporter and no persistence path… Use `ceiling.update` instead"* |
| `ceiling.updateSystemTypeBatch` | **L3** | legacy, via `_cmExec` | L2's stack only | declares `affectedStores: [] as const` (`:71`) — **the C03 U-2b exit (b), correctly taken** |
| `ceiling.update` | **L2** | legacy `CeilingStore` | legacy | registered in `commands.ts:1222`; the plugin handler for it is **deliberately unregistered** (`handlers/index.ts:23`) |
| **MOVE** | — | **CAPABILITY ABSENT.** No `ceiling.move` verb exists | — | ⛔ **UNDECLARED.** §12 declares it |
| **ROTATE** | — | **CAPABILITY ABSENT.** No `ceiling.rotate` | — | ⛔ **UNDECLARED.** §12 declares it |
| **PARAMETER / DIMENSION** via `element.updateParameters` | — | **REFUSES.** `ELEMENT_STORE_ROUTES` (`UpdateElementParameterCommand.ts:112-148`) has **no `ceiling` route**; `:159-161` records that an unrouted type *"refuses immediately… without writing anything"* | — | ✅ conformant refusal, **undocumented until now** |
| **LEVEL CHANGE** | — | `NOT MEASURED` — no `ceiling.changeLevel` verb surfaced; whether the generic level-change path covers ceiling is unmeasured | — | `NOT MEASURED` |

**⚠ THE EI-3 RESIDUAL, stated precisely per the C84 EI-7a correction.** The sixteen refusing
move-class verbs are **C16-conformant handlers**, not violations. The violation is a **UI control
still offering the gesture**. For ceiling: **whether a ribbon/panel control offers "set ceiling
material" while `ceiling.setMaterial` refuses is `NOT MEASURED`**, and the control census is owned
by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).

---

## 7. Undo / redo

**Declared vs measured write set.**

| Verb | `affectedStores` declared | Measured write set | Equal? |
|---|---|---|---|
| `ceiling.create` | `['ceiling']` (`CreateCeiling.ts:33`) | plugin DTO `ceiling` + legacy `CeilingStore` + `bimManager` + `viewDependencyTracker` | ⛔ **NO** — three unnamed side stores |
| `ceiling.batch.create` | `['ceiling']` (`:55`) | as above | ⛔ NO |
| `ceiling.delete` | `['ceiling']` (`DeleteCeiling.ts:20`) | plugin DTO only | ✅ (dormant) |
| `ceiling.setBoundary` / `setHeight` / `updateLayers` | `['ceiling']` | plugin DTO only | ✅ **as a set**, ⛔ **as an OBJECT** — EI-1a: `'ceiling'` names the DTO on write and the legacy store on undo |
| `ceiling.updateSystemTypeBatch` | `[]` (`:71`) | legacy, via L3 | ✅ correct exit |
| `element.delete` (L2) | `["wall","slab","column","curtainWall","furniture","handrail","roof","floor","ceiling","beam","plumbing","stair","level","window","door"]` — `DeleteElementCommand.ts:55` | ceiling branch writes `CeilingStore` | ✅ for ceiling |

**EI-7d — does `createSnapshot` cover every declared key? For ceiling: ✅ YES, with a caveat.**

- `CommandManagerImpl.createSnapshot()` (`:578-638`) recognises **16** keys. `'ceiling'` is one of
  them (`:617`, in the `optionalStores` table `:609-625`). A declared `['ceiling']` **does** roll back.
- ⭐ **NEWLY MEASURED, AND L-953 DOES NOT RECORD IT.** `'ceiling'` is **NOT a member of the
  `StoreKey` union** (`packages/command-registry/src/types.ts:557-584`, 26 members: wall, slab,
  level, column, beam, roof, curtainWall, furniture, lighting, handrail, stair, door, window + 13
  view keys). L-953 measures `union ∖ recognised` = **12**. The **reverse** set,
  `recognised ∖ union`, is **2 — `ceiling` and `floor`** — and it is unrecorded anywhere.
  `DeleteElementCommand.ts:55` declares `'ceiling'` and type-checks **only** because
  `Command.affectedStores` is typed `ReadonlyArray<string>` (`types.ts:605`), not
  `ReadonlyArray<StoreKey>`. **Retyping that field — L-953's own proposed fix — would break this
  declaration.** The fix must add `'ceiling'` and `'floor'` to the union in the same commit.
  *(Reported to the C84 lane; C84 §5's `check-affected-stores.ts` row must gain this second arm.)*

**EI-7e — does undo restore, or recompute?**

- Only three services consult `isReverting()` (C84 §4C, cited not re-derived). **None of them is a
  ceiling service.** `NOT MEASURED`: whether any reactive observer recomputes ceiling boundaries
  after a wall undo. The analogous room case is C84's highest-value open question.
- **L-952 applies to ceiling only in the NEGATIVE, and that is a real finding.** L-952's eight
  audit-ratcheting families are `slab, stair, roof, furniture, column, beam, curtainwall, handrail`
  — the families `ELEMENT_STORE_ROUTES` **routes**. Ceiling is **not routed at all**
  (`UpdateElementParameterCommand.ts:112-148`), so it cannot ratchet through that command. It has a
  *different* audit defect instead: the bridge **mints** `metadata.version: 1` and a **fresh**
  `ifcData.guid` on every replay (`initTools.ts:1549,1553-1558`), so a redo produces a record with a new
  identity. **ADR-0319 §2** governs; the two defects are not the same and must not be merged.

**TO-BE.** (1) Take a C03 U-2b exit on all eight DTO-writing verbs. (2) `'ceiling'` joins the
`StoreKey` union. (3) `ifcData.guid` and `metadata` are payload-carried, not bridge-minted.

---

## 8. Cascades

| Trigger | What it should touch | Reversed by undo? | Evidence |
|---|---|---|---|
| ceiling delete → **ceiling HOLE records** | `holeElements[]` — unregister each hole's element **and remove the record** | ⛔ **NEITHER** | `DeleteElementCommand.ts:586-591` unregisters from `elementRegistry` and `bimManager` and performs **no store removal**. C84 §4C rates this `⚠ partial` |
| ⭐ **…and it is WORSE than partial — NEWLY MEASURED** | — | — | `:586` reads **`(ceiling as any).holes`**. `CeilingData` declares the field as **`holeElements`** (`CeilingTypes.ts:191`) and **there is no `holes` field on the type** (`grep holes CeilingTypes.ts` → one hit, `holeElements:191`). So the array is `undefined`, `?? []` fires, and **the `forEach` at `:587-591` NEVER EXECUTES.** The `as any` is what blinds `tsc`. **This is EI-2(b) — a branch keyed on a value the source cannot produce — sitting inside a delete path.** The measured state is not *"holes partially cleaned"*; it is *"holes not cleaned at all, by a loop that reads correct."* |
| ceiling delete → semantic graph edges | capture, purge, restore on undo | ✅ **captured** | `:597` `this._captureRelationships([id])`, `:598` purge. The header at `:593-596` names the prior defect (`§FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES`). ⚠ **The UNDO half is `UNPROVEN`** — [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) requires *"executed read-back rather than the presence of a restore call"*, and C84 §4C records itself being wrong for awarding this pass by read. **C88 does not repeat that error: `NOT MEASURED`.** |
| ceiling delete → `bimManager` / `viewDependencyTracker` | unregister | ⚠ `bimManager` yes (`:592`); **`viewDependencyTracker` — NOT unregistered.** The bridge registers it (`initTools.ts:1566`) and no delete path un-registers it | `NOT MEASURED` whether that strands a dirty-marking entry |
| ceiling create → `boundingWallIds` back-refs | populate from the bounding walls | ⛔ **the bus path never populates** (`initTools.ts:1545` `[]`); the legacy path does (`CreateCeilingCommand.ts:220`) | [C79 §9.3](C79-REGION-SEMANTICS.md) records the ceiling half **CLOSED via POPULATE** — **for the legacy command only.** The bus path is the uncovered half |
| ceiling `layer-updated` event | a consumer | ⛔ **NONE** | C84 **EI-13**: `CommandEventBridge.ts:957` `ceiling.layer-updated` has **zero** `events.on` subscribers repo-wide. One of the nine. Either wire the consumer or delete the emitter |
| wall move/delete → ceiling boundary | re-fit? | **`NOT MEASURED`** | no ceiling-side subscriber to wall topology surfaced |

**TO-BE.** (1) `:586` reads `holeElements` and the loop **removes the hole records**, capturing them
first for undo — the `DeleteSlabCommand.ts:85-92 / :145-157` shape. (2) The bus create path calls the
same `boundingWallIds` determination the legacy command calls (**one implementation**, EI-9).
(3) `ceiling.layer-updated` gains a consumer or is deleted, per `CommandEventBridge.ts:627-631`'s
own precedent.

---

## 9. Vocabularies

| Concept | Vocabulary in use | Members the pipeline cannot carry (EI-3) |
|---|---|---|
| **Material / colour** | ⛔ **THREE, for one family.** (V-a) `finishSpec.soffitColor` — a bare hex, hard-coded `'#F5F5F0'` at `initTools.ts:1538-1542`. (V-b) the committer's slot palette — `plugins/ceiling/src/committer/material-bridge.ts:3-7` `{top:'#f5f5f5', bottom:'#eaeaea', edge:'#cfcfcf'}`, one of C84 EI-8's 18 per-plugin palettes. (V-c) `materialId`/`materialColor` on the bus registry (`commands.ts:1122-1123`), which **reach nothing** | **BOTH declared material fields.** The bus offers them, the bridge drops them. **EI-3.** |
| **Boundary vertex** | `CeilingVertex = {x, z}` — stated canonically at `packages/command-registry/src/rooms/perRoomBoundary.ts:14` (*"RoomVertex / FloorVertex / CeilingVertex are ALL `{x,z}`"*) vs `Vec3` on the payload | **the `y` component** — §5 row 3 |
| **Detection method** | `'manual-polygon' \| 'from-room' \| 'from-slab' \| 'ai-generated' \| 'ifc-import'` (mirrors `FloorDetectionMethod`) | **four of five.** The bridge hard-codes `'manual-polygon'` (`initTools.ts:1534`), so an AI-authored ceiling is recorded as hand-drawn. `DetectionMethodOrigin.ts:342` treats the value as authored provenance |
| **Soffit pattern** | `'none' \| …` — hard-coded `'none'` at `:1541` | **all non-`'none'` members** |
| **System type** | `CeilingSystemTypeStore`, persisted at `ProjectSerializer.ts:1041-1043` (non-built-in only) | none measured |

⚠ **The committer palette (V-b) is Stack-B-only** — the committers are reachable only through
`bootstrapRenderEverything`, and production boot passes `canvas: null` (C84 §4D, cited). It is not a
live rival; it is an **unwired second answer** that will become one the day Stack B is answered
(ADR-0331 §D5 — a founder question; **nothing in `plugins/*/src/committer/` may be deleted**).

**TO-BE.** ONE ceiling colour vocabulary. If the committer palette must stay, it earns an
**EI-10 licence** — named reason, executed equivalence proof, declared divergence list, retirement
condition — and is **pinned by a test**, never by a comment (EI-8a; the comment mechanism is
measured to have failed twice).

---

## 10. Geometry

| Axis | AS-IS | TO-BE |
|---|---|---|
| **Stack A** (viewport) | `packages/geometry-slab/src/ceiling/CeilingPanelBuilder.ts` — live at `initBuilders.ts:391`. C84 §3.5.3 grades `SlabFragmentBuilder` / `FloorPanelBuilder` / `CeilingPanelBuilder` **CO-LIVING** (structural slab vs floor finish vs ceiling finish), not duplicates | unchanged — the verdict is recorded, not re-litigated |
| **Stack B** (bake/export) | `packages/geometry-kernel/src/producers/ceiling.ts` + `plugins/ceiling/src/committer/ceiling-committer.ts` | — |
| **Proven to agree?** | ⛔ **NO HARNESS EXISTS.** The only A/B parity harness in the repo is wall's, and C84 §5 records that it is **not on `main`** (lane worktree only). **A ceiling harness is OWED** | build one; it MUST consume [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s declared, unit-qualified tolerance — the module **exists**, `packages/geometry-kernel/src/tolerance.ts`, barrel-exported at `index.ts:22-34` (**L-954**; C73 §5.1's "NOT BUILT" was stale). ⛔ **MUST NOT ship a bare `const TOL`** |
| **Datum convention** | ceiling world Y = `level.elevation + boundary.height`, with `boundary.baseOffset` hard-coded `0` at `initTools.ts:1535`. **`NOT MEASURED`: whether `CeilingPanelBuilder` adds `baseOffset` a second time** — this is the wall-Y double-add shape (C84 §4D) and it is unchecked for ceiling | ONE ceiling-Y authority, named in this contract |
| **Planarity** | enforced by construction — the bridge flattens (§5) | either carry `y` or **refuse** a non-planar boundary at `canExecute`. `CreateCeiling.ts:38` already validates the boundary; the planarity test belongs there, where the user sees it |

---

## 11. THE DELTA — ordered by what the user loses

| # | Item | Invariant | Proof required (⛔ watched RED first) |
|---|---|---|---|
| **1** | **Ceiling holes are never removed on delete, by a loop that cannot run.** `DeleteElementCommand.ts:586` reads `(ceiling as any).holes`; the field is `holeElements` (`CeilingTypes.ts:191`) | EI-2(b) + EI-5 | Delete a ceiling with ≥1 hole; assert the hole records are gone from the store; undo; assert they are back. **Must fail against HEAD.** |
| **2** | Ceiling **vanishes from IFC export** with no refusal — no `CeilingReader.ts` | **EI-6** | Export a project with N ceilings; assert N `IfcCovering`/`CEILING` entities, **or** assert an explicit user-visible refusal. Today: 0 and silence |
| **3** | **`ceiling.materialId` / `materialColor` dropped by omission**; `soffitColor` hard-coded `'#F5F5F0'` | EI-2(a) + EI-3 | Dispatch `ceiling.create` with a `materialId`; assert the legacy record's `finishSpec.soffitColor` reflects it |
| **4** | **Per-vertex `y` flattened** — a stepped ceiling silently becomes flat | EI-2(d) | Dispatch a boundary with two distinct `y` values; assert either both survive **or** `canExecute` refuses naming the reason |
| **5** | Eight verbs write the DTO while `'ceiling'` restores the legacy store | EI-1a / C03 §4.6 **U-2b** | `busCreateUndoLeavesPluginStore`-shaped: dispatch `ceiling.create`, `performUndo()`, assert `runtime.stores.ceiling` no longer holds the id. **It will hold it today.** |
| **6** | `'ceiling'` is snapshot-recognised but **absent from the `StoreKey` union** | **L-953** (reverse arm, unrecorded) | Add `'ceiling'` to `types.ts:557-584` **in the same commit** that retypes `affectedStores` to `ReadonlyArray<StoreKey>`; assert `DeleteElementCommand.ts:55` still compiles |
| **7** | `boundingWallIds` populated by the legacy path, `[]` by the bus path | EI-9 + [C79 §9.3](C79-REGION-SEMANTICS.md) | One determination module, two callers; assert both paths produce byte-equal arrays for one input |
| **8** | `ifcData.guid` and `metadata.version` **minted at the bridge** — a redo changes the element's external identity | **ADR-0319 §2** | Create → undo → redo; assert `ifcData.guid` is byte-equal |
| **9** | `ceiling.layer-updated` (`CommandEventBridge.ts:957`) has zero subscribers | **EI-13** | wire a consumer or delete the emitter |
| **10** | No Stack A/B parity harness | **EI-11** | build `tests/parity/ceiling/`; consume `geometry-kernel/src/tolerance.ts`, never a call-site literal |
| **11** | `ProjectSerializer.ts:798,1040` resolves an absent `ceilingStore` to `[]` — silent-empty | [C74](C74-CONSTRAINT-HONESTY.md) | make the field required, or refuse |
| **12** | `detectionMethod` hard-coded `'manual-polygon'` — an AI ceiling is recorded as hand-drawn | [C75](C75-PROVENANCE.md) / PV-04 | carry the caller's provenance |

---

## 12. REFUSALS — what ceiling deliberately does NOT support

**A refusal is a correct answer. An UNDOCUMENTED refusal is not.**

| # | Not supported | Status | Why / what to do instead |
|---|---|---|---|
| **R1** | `ceiling.setMaterial` **does not reach authoritative state** | ✅ **DECLARED, C16 CA-18 conformant** — `SetCeilingMaterial.ts:83`, reason at `:57` | Use `ceiling.update` (`commands.ts:1222`), which reaches the geometry record the builders read |
| **R2** | **There is no `ceiling.move`.** A ceiling is a *region*, not a placed object: it is defined by its boundary polygon, so "move" is `ceiling.setBoundary` on a translated polygon | ⛔ **UNDECLARED before this contract — now DECLARED** | Use `ceiling.setBoundary`. Any future move verb MUST be a boundary transform, not an origin write |
| **R3** | **There is no `ceiling.rotate`**, for the same reason as R2 | ⛔ **UNDECLARED before this contract — now DECLARED** | rotate the boundary |
| **R4** | `element.updateParameters` **refuses for ceiling** — no `ELEMENT_STORE_ROUTES` entry (`UpdateElementParameterCommand.ts:112-148`; the refusal is documented at `:159-161`) | ✅ conformant, ⛔ **UNDECLARED before this contract** | Use `ceiling.setHeight` / `ceiling.setBoundary` / `ceiling.updateLayers` |
| **R5** | `ceiling.update` has **no registered plugin handler** — deliberately | ✅ **DECLARED IN CODE** — `plugins/ceiling/src/handlers/index.ts:23` states the reason | the L2 legacy command owns it |
| **R6** | `ceiling.batch.create` is **NOT SYNCED** to collaborators | ✅ **DECLARED** — `syncDisposition.ts:915`, *"MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND"* | single `ceiling.create` is synced |
| **R7** | Ceiling is **absent from the bake worker** | ✅ **DECLARED HERE** — `HeadlessBakeSession.ts:31,43,53` is wall-only, by construction | not a defect; the bake worker's scope is the open founder question ADR-0331 §D5 |
| **R8** | **Non-planar / stepped ceilings are NOT REPRESENTABLE** — `boundary.polygon` is `{x,z}` plus one scalar height | ⛔ **NOT A REFUSAL TODAY — IT IS SILENCE.** The pipeline accepts the geometry and flattens it (§5, Delta 4) | Until `y` is carried, `canExecute` MUST refuse a non-planar boundary and name the limit |
| **R9** | Ceiling has **no IFC representation** | ⛔ **NOT A REFUSAL — IT IS SILENCE** (Delta 2) | Until a reader exists, IFC export MUST warn that N ceilings were omitted |
| **R-10** | **Circular / elliptical boundaries are SUPPORTED as of 2026-08-19** — this row exists so the ABSENCE of a refusal is explicit | §FEAT-PLATE-SHAPE-MODES | ✅ **NOT A REFUSAL — A CAPABILITY, recorded here because §12 is where a reader looks for what this family cannot do.** ⚠ The real limit is L-1323: the ring does not remember it is a circle. See PS-3 |

> **The governing sentence, from `packages/geometry-wall/src/WallRake.ts:50-62`:** *"no affordance
> without an implementation… A refusal is a correct answer; a silently-wrong wall is not."*
> R8 and R9 are the two places ceiling is still silent instead of refusing.


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

### THE VERB — `ceiling.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ ceilingId, levelId }` |
| **Handler** | `plugins/ceiling/src/handlers/ChangeCeilingLevel.ts` |
| **Legacy move** | `packages/core-app-model/src/stores/CeilingStore.ts` — `changeLevel(id, newLevelId)` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.ceiling` |
| **Chat** | `move-to-level` (`packages/ai-host/src/intents/LevelChangeIntents.ts`) — *"move the ceiling to level 2"* |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm routes the depth-2 `[id,'levelId']` inverse patch to `store.changeLevel()` |

### WHY THE STORE NEEDED ITS OWN `changeLevel`

`CeilingStore.update()` **warns and DELETES a `levelId` key** (`CeilingStore.ts:181-183`). So
`update(id, {levelId})` is not merely wrong for a ceiling — it is a **silent no-op**: the call
returns, the warning scrolls past, and the ceiling stays where it was. That guard is CORRECT and was
deliberately left in place; the storey move needed its own name to get past it, which is exactly the
shape `RoofStore.changeLevel` already had.

The 3-D height follows for free: `CeilingPanelBuilder.ts:192` re-derives from
`bimManager.getLevelById(ceiling.levelId)`, so the storey change IS the height change
(`heightFollowsLevel: true` in the register).

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

`CeilingPanelBuilder.ts:274` (`THREE.Shape` + `ExtrudeGeometry`) already triangulates an **arbitrary** ring. A circle was expressible the whole time and
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

A circular ceiling is stored as a **polygon ring**, not as a centre and a radius. That is the
established plate-family pattern — `boundaryArc.ts`: *"boundaries remain POLYGONS by schema and an
arc enters by TESSELLATION"* — and it is what buys the zero-change list in PS-1.

**What it costs, stated here rather than discovered later: the ring does not REMEMBER that it is a
circle.** Re-editing gives N vertices, not a radius handle, and *"make this 0.5 m bigger"* is not
expressible. Density is governed by **chord deviation (20 mm)**, not a fixed segment count, so a
large boundary is not faceted and a small one is not needlessly heavy.

⭐ **Parametric, shape-preserving boundaries are a SEPARATE and larger decision** — a C81
design-intent question touching the schema, persistence and every consumer. **L-1323, deliberately
NOT decided by this lane.**

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
Historic ids are **MAPPED, not renamed**, and the reconciliation is **L-1322**. C84 EI-8 names
*shape* explicitly, so this is a real finding, declared rather than perpetuated.

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **PUBLISHED, running its FALLBACK path**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `ceiling` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1757 (approx — the `elType === 'ceiling'` arm) |
| **Type catalogue** | ✅ `CeilingSystemTypeStore` — **but NOT injected**: `lookup: generic('ceiling')` reads `ctx.catalogues.ceiling`, which has no production writer (**L-1146**) |
| **Type field on the record** | ✅ `systemTypeId` in `CeilingDataSchema.ts:155` |
| **Executor the chat must use** | `ceiling.updateSystemTypeBatch` → `UpdateCeilingsSystemTypeBatchCommand` → `UpdateCeilingLayersCommand` → geometry `ceilingStore` (`:61`) |
| **Chat capabilities published TODAY** | `set-ceiling-type` · `set-height` |
| **Retiring condition** | Inject `ctx.catalogues.ceiling` in `ZeroTokenChatBridge.buildContext()` — L-1146. |

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

- ⚠ **L-1146 — this family resolves its type COMMAND-SIDE, not chat-side.** Because `ctx.catalogues` has no writer, `catalogueFamilySpec` takes the null branch (`CatalogueFamilies.ts:209-214`) and forwards **the raw user string**. ⭐ **It does NOT silently no-op** — `UpdateCeilingsSystemTypeBatchCommand` re-resolves and refuses by listing real names, which is the design holding. But the family's own `mismatchPrefix` / `suggestions` copy is **dead code at runtime**, the chat cannot list names *before* dispatch, and a near-miss ref that `resolveCatalogueRef` fuzzy-matches **retypes ceilings to a name the user never said, with no chat-side confirmation**. **NOT MEASURED against a real project.**
- ⛔ **L-1141 — `UpdateCeilingsSystemTypeBatch.ts:145` returns an unconditional `{forward: [], inverse: []}`.** Same class as wall/window/door; `slab` is the fixed sibling.
- ⚠ **L-1142 — declared `['all','selection']`, honours `level`, `room`, `orientation`.**

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.
