# C91 — ELEMENT: COLUMN

- **Status**: CANONICAL — binding on every PR touching the column family
- **Date**: 2026-08-18
- **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — the twelve mandatory sections. **C84's
  EI-1…EI-13 are applied, not restated.**
- **Cites, does not restate**: [C03 §4.5/§4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (**CA-17**
  route the write / **CA-18** refuse and name the mechanism) ·
  [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) (tolerance) · [ADR-0319 §2](../adrs/) (audit
  fields across undo — **not C75**) · [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`elementType`
  casing) · [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the UI-control census).
- **Measured**: 2026-08-18, main worktree `Product_Rediness_08`, HEAD `18eab722`.
- **Which persistence half was checked**: the **LIVE**
  `apps/editor/src/engine/persistence/{ProjectSerializer,ProjectLoader}.ts` (live per
  `initPersistence.ts:41-43`). `packages/persistence-client/src/loader/` is the dead copy — the
  live files say so at `ProjectSerializer.ts:268-271` and `ProjectLoader.ts:328-331`.

> **Every cell is measured or reads `NOT MEASURED`. A blank reads as "fine"** (C84 EI-1b).

---

## 1. Identity

| Axis | AS-IS (measured) | TO-BE |
|---|---|---|
| Canonical `userData.elementType` | **`'Column'`** (PascalCase) — `packages/geometry-column/src/ColumnFragmentBuilder.ts:293,391` | freeze `'Column'`; every comparing consumer normalises via `.toLowerCase()` per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) |
| Other spellings | **`'column'`** (lowercase) at `packages/geometry-column/src/ColumnPlanSymbolBuilder.ts:158` and `ColumnStore.ts:134` (store-event bus); `DeleteElementCommand.ts:442` sets `this.elementType = 'column'` | ✅ **CONFORMANT.** These are *casings of one spelling*, which C15 §12 explicitly permits — **not** the slab-four / door-two defect C84 §4E names. Recorded as clean so it is not "fixed" into a regression |
| L0 Zod schema | `packages/schemas/src/elements/Column.ts`; `ColumnShape = z.enum(['rectangular','circular','i-section'])` at `:7`; `shape` defaults `'rectangular'` at `:50` | see §9 |
| Bus verb namespace | `column.*` — **seven** registered: `create`, `batch.create`, `delete`, `move`, `setType`, `setHeight`, `setMaterial` (`plugins/column/src/handlers/index.ts:13-19`). Plus `column.update` (`commands.ts:1218`, L2-bridged) | unchanged |
| Legacy geometry type | `ColumnData` — `packages/geometry-column/src/ColumnTypes.ts:4-30` | unchanged |

---

## 2. Stores — and which one is the AUTHORITY

| # | Representation | Where | Written by | Read by |
|---|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Column.ts` | the bus payload | `parse()` in `CreateColumnHandler` |
| 2 | **Plugin DTO store** | `plugins/column/src/store.ts` | all seven `column.*` verbs | **measured: nobody.** `SetColumnMaterial.ts:57` names it verbatim: *"a FRESH instance built by PluginRegistry… read by no renderer, no 2-D projector, no IFC exporter and no persistence path"* |
| 3 | **LEGACY geometry store — ⭐ THE AUTHORITY** | `packages/geometry-column/src/ColumnStore.ts` | the `column.created` bridge (`initTools.ts:1635-1688`), legacy `CreateColumnCommand`, `UpdateColumnCommand` | `ColumnFragmentBuilder` (`initBuilders.ts:298`), `ColumnPlanSymbolBuilder` (`initBuilders.ts:46`), `ProjectSerializer.ts:1016`, `readers/ColumnReader.ts:6-12`, `DeleteElementCommand.ts:439-446` |
| 4 | THREE scene `userData` | `ColumnFragmentBuilder.ts:293,391` | fragment builder | GLB export, picking, delete routing |
| 5 | Kernel producer record | `packages/geometry-kernel/src/producers/column.ts` + `plugins/column/src/committer/column-committer.ts` | committer | **bake worker does NOT read it** — `HeadlessBakeSession.ts:23,31,43,53,124-131` is `WallStore` + `produceWall` only |

**EI-1 verdict: ✅ SINGLE AUTHORITY — `ColumnStore` (#3).** No split-brain. **Column is the most
completely-consumed family in this contract's cohort: it is the only one with BOTH an IFC reader
and a dedicated plan-symbol builder.** Recorded as clean (EI-1b).

**EI-1a — `'column'` names two objects across one command's lifecycle, and it has ALREADY BEEN
REPRODUCED AND PINNED:**

| Moment | Resolves to | Site |
|---|---|---|
| WRITE | plugin DTO snapshot view | `apps/editor/src/bootstrap.ts:94,148-159` |
| UNDO | `window.columnStore` (legacy geometry) | `performUndoRedo.ts` `buildUndoStoreMap()` — `column: w.columnStore, columns: w.columnStore` |

`MoveColumn.ts:50-56` states the consequence in its own header: *"a ring-first Ctrl+Z handed the
geometry store an INVERSE carrying the plugin store's stale prior value, for a forward write
geometry never saw. Reproduced and pinned in
`apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts`."* **That test EXISTS on `main`** —
verified by direct stat, not by reading a claim. It is the only executed pin of EI-1a in this
cohort.

---

## 3. Consumers

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3-D) | LEGACY | `initBuilders.ts:298` `new ColumnFragmentBuilder(scene, bimManager, null)`; `:351` late-binds `slabStore` (`§COLUMN-AUDIT-2026 §W9`) | ✅ |
| Plan view | LEGACY, **and column has a DEDICATED plan symbol builder** | `initBuilders.ts:46` `installColumnPlanSymbolBuilder`; `ColumnPlanSymbolBuilder.ts:158`. The bridge also registers `viewDependencyTracker` + `bimManager` at `initTools.ts:1677-1678` | ✅ **the strongest plan-view answer of the five families** |
| Persistence (save) | LEGACY | `ProjectSerializer.ts:1016` `columnStore.getAll().map(serializeColumn)` — **`columnStore` is a REQUIRED field** (`:775`), not optional. Contrast ceiling/floor | ✅ **no silent-empty hazard** |
| Persistence (load) | LEGACY, **via the legacy command** | `ProjectLoader.ts:804` `new CreateColumnCommand({…})` — **no bus event.** So after any project load the plugin DTO column store is **EMPTY while `ColumnStore` holds N** (C84 EI-5a) | ⚠ |
| IFC export | LEGACY | `packages/file-format/src/export/ifc/readers/ColumnReader.ts:6-12` — `new ColumnReader(this.stores.columnStore, this)`; `ifcClass: 'IfcColumn'` set by the bridge at `initTools.ts:1672` | ✅ **columns DO export.** Contrast ceiling and floor, which have no reader |
| GLB export | scene `userData` | `ColumnFragmentBuilder.ts:293,391` | ✅ |
| Bake worker | **ABSENT** | `HeadlessBakeSession.ts:31,43,53` — wall-only | ✅ no split |
| Sync | `column.batch.create` **NOT SYNCED** — declared | `packages/sync-client/src/syncDisposition.ts:916` *"MULTI-SUBJECT §NEEDS-MULTI-SUBJECT-KIND"* | ✅ declared, not silent |

⚠ **`ColumnReader.ts:16-19` skips a column with no mesh** (`if (!mesh) continue; … if (!geometry)
continue;`). So IFC export is **scene-dependent**, not store-dependent: a column that exists in the
store but has not been meshed (level hidden, view not built) is **silently omitted from the export**.
`NOT MEASURED`: whether any production export path can run with an unbuilt scene. **Flagged because
"the geometry the system EXPORTS must come from the same code the user SEES" (EI-11) is *satisfied*
here in the strongest possible way — by the export literally reading the scene — and the cost is
that anything unrendered is unexported, with no warning.**

---

## 4. Plugin ↔ DTO ↔ command ↔ builder

| Handler | Verb | Registered? | UI-reachable? | State |
|---|---|---|---|---|
| `CreateColumnHandler` | `column.create` | ✅ `handlers/index.ts:13` | ✅ column plan tool | **LIVE** |
| `CreateColumnBatchHandler` | `column.batch.create` | ✅ `:14` | generators / AI (`CreateColumnsOnAllSlabsCommand`, AI structural placement — named at `initTools.ts:1640-1642`) | LIVE (non-UI) |
| `DeleteColumnHandler` | `column.delete` | ✅ `:15` | ⛔ **NO production dispatcher** | **DORMANT** (C84 §3.5.3) — ⛔ do not delete; it is the PRYZM 3 target vocabulary |
| **`MoveColumnHandler`** | `column.move` | ✅ `:16` | ⛔ **NO** — and it **REFUSES** | see §6 |
| `SetColumnTypeHandler` | `column.setType` | ✅ `:17` | `PropertyPanelTypeSelector.ts:216` | LIVE |
| `SetColumnHeightHandler` | `column.setHeight` | ✅ `:18` | `NOT MEASURED` | — |
| `SetColumnMaterialHandler` | `column.setMaterial` | ✅ `:19` | ⚠ **REFUSES** — `SetColumnMaterial.ts:83` | see §6 |
| Legacy `CreateColumnCommand` / `UpdateColumnCommand` / `DeleteColumnCommand` | — | `packages/command-registry/src/columns/` | ✅ the load path, the 3-D gizmo, `MOVE_COMMAND_BY_TYPE` | **L2, LIVE — these are the real mutation path** |

**⭐ `MoveColumn.ts:28-70` is the model file for this whole contract suite, and is quoted rather
than paraphrased.** It records, with citations, all four things C84 asks a per-element contract to
state: (a) the DTO store is detached — *"Only `<family>.created` is mirrored across; there is no
update bridge in either direction"*; (b) the **dispatcher census** — *"The ONE table that decides
what a move dispatches is `MOVE_COMMAND_BY_TYPE` (`apps/editor/src/engine/transforms/elementMove.ts:102-127`),
and the 3-D gizmo's own list is the 13 `dragDispatch(...)` sites in `registerTransformDragHandler.ts`.
Neither names `column.move`"*; (c) the **EI-12 trigger-without-dispatcher** disposition — the
`plugins/cross` cascade rules that synthesise `column.move` are inert because `CascadeRunner` is
registered nowhere in production, *"unreachable TODAY by recorded decision, not neglect"*
(ADR-0323 / BIM30 R0); (d) why **retiring** the verb is forbidden —
`tools/ga-gate/check-chat-capability-coverage.ts` requires every name in `CapabilityRefusal` /
`CHAT_UNAVAILABLE` / `ChatCommandClassification` to be a **registered** bus command, so retiring
would make chat's own refusal cite a verb that does not exist.

**Reachability measured on BOTH axes** (C84 §3.5.1): (a) import — `buildColumnHandlerSet`;
(b) bus — `MOVE_COMMAND_BY_TYPE` and the 13 `dragDispatch` sites, neither naming `column.move`.

---

## 5. THE BRIDGE FIELD MAP — every field, no omission

**The bridge**: `column.create` / `column.batch.create` → `CommandEventBridge.ts:483-555` →
`initTools.ts:1635-1688` → `ColumnStore.add()`.

| Payload field | CEB | initTools | Destination in `ColumnData` | Disposition |
|---|---|---|---|---|
| `id` | `:503` / `:543` | `:1657` | `id` | **CARRIED** |
| `levelId` | `:501` / `:541` | `:1659`, `:1660` (`parentId`) | `levelId`, `parentId` | **CARRIED**, duplicated |
| `origin` | `:504` / `:544` | `:1661` `{x: ev.origin.x, y: ev.origin.y, z: ev.origin.z}` | **`position`** (`ColumnTypes.ts:12`) | ✅ **CARRIED, all three axes, RENAMED.** `origin → position` is a **transform**, and it is why `column.move`'s refusal matters: any future move verb writing `origin` writes a field the store does not have |
| **`shape`** | `:505` / `:545` | `:1664` **`profile: (ev.shape ?? 'rectangular') as any`** | `profile: 'rectangular' \| 'circular' \| 'UC' \| 'UB'` (`ColumnTypes.ts:19`) | ⛔ **UNCHECKED CAST — EI-2(c).** `ColumnShape` is `'rectangular' \| 'circular' \| 'i-section'` (`Column.ts:7`). **`'i-section'` is OUTSIDE the destination union** and lands in the store as an unmodelled string. `as any` is what blinds `tsc` |
| **…and the batch registry drops it a second way** | — | — | — | ⛔ `packages/command-bus/src/commands.ts:1045` declares `column.batch.create`'s `shape?: 'rectangular' \| 'circular'` — **`'i-section'` is not even expressible on the batch verb.** The single-create verb offers a member the batch verb cannot carry. **EI-3, inside one family's own vocabulary** |
| **…and the reverse gap** | — | — | `'UC'` and `'UB'` (steel Universal Column / Universal Beam, `ColumnTypes.ts:17`) | ⛔ **UNREACHABLE from the bus.** `ColumnShape` cannot produce them, so the entire parametric steel path (`steelProfileName`, `ColumnTypes.ts:26-29`) is reachable only through L2. **EI-3 inverse** |
| `width` | `:506` / `:546` | `:1665` `?? 0.3` | `width` | **CARRIED** |
| `depth` | `:507` / `:547` | `:1666` `?? 0.3` | `depth` | **CARRIED** |
| `height` | `:508` / `:548` | `:1662` `?? 3.0` | `height` | **CARRIED** |
| `baseOffset` | `:509` / `:549` | `:1667` `?? 0` | `baseOffset` | **CARRIED** |
| `rotation` | `:510` / `:550` | `:1663` `?? 0` | `rotation` | ✅ **CARRIED.** Contrast beam ([C93](C93-ELEMENT-BEAM.md) §5), where the identical payload field has **no destination field at all** |
| `materialId` | `:511`; batch `:551` `c.materialId ?? c.systemTypeId` | `:1669` conditional spread `...(ev.materialId ? {materialId: ev.materialId} : {})` | `materialId?` (`ColumnTypes.ts:23`) | ✅ **CARRIED.** Contrast ceiling ([C88](C88-ELEMENT-CEILING.md) §5), where the same field is dropped |
| `systemTypeId` | **batch only** — `:531`, folded into `materialId` at `:551` | reaches `materialId` | `materialId` | ⚠ **CONFLATED.** A system type and a material are two concepts collapsed into one field on the batch path and **absent entirely from the single-create cast** (`:486-497` has no `systemTypeId`). **EI-8 — one vocabulary per concept, violated by merging two** |
| `topLevelId` | ⛔ **declared on the batch registry (`commands.ts:1043`) and ABSENT from BOTH CEB casts** | never seen | `ColumnData` has **no** top-level field | ⛔ **DROPPED BY OMISSION at the registry↔CEB seam — EI-2(a).** A column spanning to a named upper level cannot be expressed |
| `materialColor` | ⛔ not on the column registry entry | — | `materialColor?` exists (`ColumnTypes.ts:24`) | ⛔ **DESTINATION FIELD WITH NO SOURCE** — EI-3 inverse |
| — | — | `:1658` `type: 'column'` | `type` | **HARD-CODED**, correct |
| — | — | `:1668` `properties: {}` | `properties` | **HARD-CODED EMPTY** |
| — | — | `:1670-1673` fresh `crypto.randomUUID()`, `ifcClass:'IfcColumn'` | `ifcData` | ⚠ **GUID MINTED AT THE BRIDGE.** The payload carries none, so a create/undo/redo cycle yields a **different IFC GUID** for the same column. Floor carries `ifcGuid`; column does not. **ADR-0319 §2** |
| — | — | ⛔ **NO `metadata` BLOCK AT ALL** (contrast ceiling `:1553-1558`, floor `:1883-1888`) | `CoreElement` metadata | ⚠ **`NOT MEASURED`: whether `ColumnStore.add()` supplies a default `metadata`.** If it does not, a bus-created column has no audit envelope while a load-created one (via `CreateColumnCommand`) does |

**Dedup guard, recorded because it was measured wrong once.** `initTools.ts:1648-1653` states:
*"ColumnStore exposes `get(id)`, NOT `getById(id)`. Using `getById()` with optional chaining
returned undefined unconditionally, so the guard never fired — `CreateColumnCommand` already adds
the column to the legacy store directly, causing the bridge to double-add."* **A guard written
against the wrong method name is indistinguishable from no guard.** That is EI-2(b)'s shape
(a comparison the source cannot satisfy) applied to a store API; it is **closed**, and it is the
reason the equivalent guards on beam (`:1780`) and ceiling (`:1518`) must be spot-checked against
their stores' real APIs rather than trusted.

---

## 6. Verbs

| Verb | Lineage (C84 §4A) | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|---|
| `column.create` | **L1** | plugin DTO `column` + legacy `ColumnStore` + `bimManager` + `viewDependencyTracker` (bridge `:1677-1678`) | legacy `ColumnStore` only | ⛔ **NO — WRITES ⊋ RESTORES** (C84 EI-7a) |
| `column.batch.create` | **L1** | as above ×N; **one** patch pair for N columns — correct | as above | ⛔ NO |
| `column.delete` | L1 | plugin DTO only | — | **DORMANT** |
| **`element.delete`** (the real delete) | **L2** | delegates to `DeleteColumnCommand` — `DeleteElementCommand.ts:443-445`. The header `:436-438` states the reason: *"all four side effects (store, bimManager, elementRegistry, SemanticGraph) are performed together AND restored together by undo()"* | `createSnapshot` covers `'column'` (`CommandManagerImpl.ts:610`) **and** the delegate restores its own four effects | ✅ **the best-formed delete of the five families** |
| **`column.move`** | — | **NONE — REFUSES** at `MoveColumn.ts:110` | — | ✅ **C16 CA-18 CONFORMANT.** Reason (`:71-72`): *"writes the detached plugin column store that nothing renders, exports or persists, and no production surface dispatches it… Moving a column commits through `column.update` → `UpdateColumnCommand` → the geometry `columnStore`"* |
| …and it would ALSO hit a depth collapse if it did not refuse | — | `MoveColumn.ts` produces patches at `origin.x/y/z` depth; `elementUndoStoreAdapter.ts:289,337-338` takes `field = p.path[1]` and writes `store.update(id,{[field]: p.value})` **for a patch of ANY depth** (C84 **EI-7b**, cited) | — | ⛔ **the refusal is load-bearing.** Restoring silent success would arm a depth-collapse, not merely a wrong store |
| `column.setType` | L1 | plugin DTO only | legacy store (**wrong object** — EI-1a) | ⛔ NO |
| `column.setHeight` | L1 | plugin DTO only | legacy (wrong object) | ⛔ NO |
| **`column.setMaterial`** | — | **NONE — REFUSES** `SetColumnMaterial.ts:83` | — | ✅ **CA-18 CONFORMANT** — one of C84 §4B's six refusing `*.setMaterial` verbs |
| `column.update` | **L2** | legacy `ColumnStore`, via `UpdateColumnCommand` | legacy | `commands.ts:1218` — *"Move/rotate a column. Bridged to legacy `UpdateColumnCommand`"*. **This is the live move AND rotate path** |
| **ROTATE** | **L2**, via `column.update` | legacy | legacy | ✅ column's rotation survives the whole pipeline — §5 |
| **PARAMETER / DIMENSION** via `element.updateParameters` | **L2** | `ELEMENT_STORE_ROUTES` routes `column → ['column'], c.stores.columnStore` (`UpdateElementParameterCommand.ts:115`) | `createSnapshot` covers `'column'` | ✅ store-correct, ⛔ **NOT audit-neutral** — see §7 |
| **LEVEL CHANGE** | — | `NOT MEASURED` — no `column.changeLevel`; whether the generic path covers column is unmeasured | — | `NOT MEASURED` |

**⚠ EI-3 residual.** Two column verbs refuse (`move`, `setMaterial`). **Whether a ribbon, gizmo or
panel control still OFFERS those gestures is `NOT MEASURED`** and is owned by
[C82](C82-RIBBON-CAPABILITY-SURFACE.md). Per the C84 EI-7a correction, the refusals themselves are
**required interim conformance** and MUST NOT be "fixed" by restoring silent success.

---

## 7. Undo / redo

| Verb | `affectedStores` declared | Measured write set | Equal? |
|---|---|---|---|
| `column.create` | `['column']` (`CreateColumn.ts:37`) | DTO + legacy + `bimManager` + `viewDependencyTracker` | ⛔ **NO** |
| `column.batch.create` | `['column']` (`:52`) | as above | ⛔ NO |
| `column.delete` | `['column']` (`DeleteColumn.ts:24`) | DTO only | ✅ (dormant) |
| `column.move` | `['column']` (`MoveColumn.ts:78`) | **none — refuses** | ✅ |
| `column.setType` / `setHeight` | `['column']` | DTO only | ✅ as a **set**, ⛔ as an **object** (EI-1a) |
| `column.setMaterial` | `['column']` (`:63`) | none — refuses | ✅ |
| `element.updateParameters` | `snapshotScopeForElementType('column')` → `['column']` (`UpdateElementParameterCommand.ts:115,167`) | `columnStore` | ✅ — **L-947 closed for column** |
| `element.delete` (L2) | 15 keys incl. `'column'` (`DeleteElementCommand.ts:55`) | via `DeleteColumnCommand` | ✅ |

**EI-7d — `createSnapshot` coverage: ✅ FULLY CLEAN. Column is the reference case.**
`'column'` is **both** a `StoreKey` union member (`packages/command-registry/src/types.ts:561`)
**and** recognised by `createSnapshot`'s `optionalStores` (`CommandManagerImpl.ts:610`). It is in
neither of L-953's two holes — not in the twelve `union ∖ recognised`, and not in the two
`recognised ∖ union` (`ceiling`, `floor`, newly measured; see [C88 §7](C88-ELEMENT-CEILING.md)).
**Recorded explicitly because a clean result that is not written down is indistinguishable from an
unchecked one.**

**⭐ EI-7e / L-952 — COLUMN IS ONE OF THE EIGHT AUDIT-RATCHETING FAMILIES.**

`UpdateElementParameterCommand.undo()` (`:379-385`) does not restore a snapshot — it **constructs a
fresh forward command and executes it**. Audit-neutrality is delivered solely by `restoreWallAudit`,
hard-gated at `:410-414` on `t === 'wall' | 'door' | 'window'`. `captureWallAudit` (`:400-420`)
returns `null` for every other type, and the file concedes the scope at `:205-218`: *"only
`WallStore` carries the `preserveMetadata` contract today… Element types whose stores stamp their
own audit fields (slab, stair, roof, furniture, …) are NOT covered here and are not claimed to be."*

**So a column parameter change ratchets `metadata.version` forward on undo.** L-952 names the eight:
`slab, stair, roof, furniture, **column**, **beam**, curtainwall, handrail`. *(C84 §4B recorded four;
the measured figure is eight — L-952 is the corrected count.)*

Governed by **[ADR-0319 §2](../adrs/) DERIVED-BUT-CAUSAL** — *"may differ across a restore; may NOT
differ across an undo… a counter that ratchets through an undo/redo cycle means the model is not
the same model."* ⚠ **NOT C75** — C75's scope line disclaims ADR-0319's field classification and
§2.9 forbids restating it.

**Fix (L-952's):** extend `preserveMetadata` to the routed stores — for column, to `ColumnStore` —
and consume it in the undo replay. ⛔ **Control first, watched RED:** undo a column parameter change
and assert `metadata.version` is byte-equal to its pre-edit value. **An assertion that passes before
the fix is testing nothing.**

**And a second, distinct audit defect on the CREATE path:** the bridge mints a fresh
`ifcData.guid` (`initTools.ts:1671`) and writes **no `metadata` block at all** (§5). These are not
L-952 and must not be merged with it.

**EI-7e — restore or recompute?** Only three services consult `isReverting()` (C84 §4C, cited).
**None is a column service.** `NOT MEASURED`: whether any observer recomputes column supports or
grid intersections after an undo.

---

## 8. Cascades

| Trigger | Reversed by undo? | Evidence |
|---|---|---|
| column delete → store + `bimManager` + `elementRegistry` + semantic graph | ✅ **all four together** | `DeleteElementCommand.ts:443-445` delegates to `DeleteColumnCommand`; the header `:436-438` states the four-effect atomicity as the *reason* for delegating. `§COLUMN-AUDIT-2026 §C2` |
| …the semantic-graph **UNDO** half | **`NOT MEASURED`** | [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) requires *"executed read-back rather than the presence of a restore call"*. C84 §4C records itself being wrong for awarding this by read. **C91 does not repeat that.** |
| **column delete → HOSTED BEAMS** | ⛔ **NOT TOUCHED** | `BeamData` carries `startSupportId` / `endSupportId` with `startSupportType: 'column' \| 'wall' \| 'beam'` (`packages/core-app-model/src/stores/BeamTypes.ts:12-15`). **No column delete path reads or clears them.** Deleting a column leaves every beam it supported pointing at a dead id — a dangling back-ref of exactly the class [C79 §7.2](C79-REGION-SEMANTICS.md) governs (*POPULATE, REMOVE or DECLARE*), and the same class as `joinedToRoofIds` in C84 §4C |
| **column delete → GRID INTERSECTIONS** | ⛔ **NOT TOUCHED, and not even modelled** | `NOT MEASURED` whether any grid record references a column id. `ColumnData` (`ColumnTypes.ts:4-30`) has **no grid field**, and the delete path has no grid branch. **Stated as a finding, not assumed clean** |
| column create → beam support back-refs | ⛔ **no writer** | `BeamStore.ts:193` emits `elementType: 'column'` on some path — `NOT MEASURED` what writes `startSupportId` in production |
| `column.created` event → consumers | ✅ **HAS a subscriber** — the initTools bridge `:1636` | column is **not** one of C84 EI-13's nine unconsumed emitters. Recorded as clean |
| slab → column late-binding | ⚠ wired, one-way | `initBuilders.ts:351` late-binds `slabStore` into `ColumnFragmentBuilder` (`§COLUMN-AUDIT-2026 §W9`). `NOT MEASURED` whether a slab change re-seats existing columns |

**TO-BE.** (1) Column delete captures and clears `startSupportId`/`endSupportId` on every beam it
supports, and restores them on undo — the `DeleteElementCommand.ts:243,250-267` `_restoreRelationships`
shape the wall-opening cascade already uses. (2) The grid relationship is **modelled or declared
absent**; today it is neither.

---

## 9. Vocabularies

| Concept | Vocabulary | Members the pipeline cannot carry (EI-3) |
|---|---|---|
| **Shape / profile** | ⛔ **THREE, for one family.** (V-a) L0 `ColumnShape = 'rectangular' \| 'circular' \| 'i-section'` (`Column.ts:7`). (V-b) bus batch registry `'rectangular' \| 'circular'` (`commands.ts:1045`). (V-c) destination `ColumnData.profile = 'rectangular' \| 'circular' \| 'UC' \| 'UB'` (`ColumnTypes.ts:19`) | **`'i-section'`** — offered by the single-create verb, **not expressible on the batch verb**, and **outside the destination union**. **`'UC'` / `'UB'`** — expressible in the store, **unreachable from any bus verb**. Only `'rectangular'` and `'circular'` traverse all three |
| **Material / colour** | ⛔ **TWO.** (V-a) `materialId` / `materialColor` on `ColumnData` (`ColumnTypes.ts:23-24`) — `materialId` is carried by the bridge, **`materialColor` has no source**. (V-b) the committer palette `plugins/column/src/committer/material-bridge.ts` | `materialColor`; and everything `column.setMaterial` offers, since it refuses |
| ⭐ **the shared fallback hex** | **`'#9b9b9b'` — `plugins/column/src/committer/material-bridge.ts:12` AND `plugins/beam/src/committer/material-bridge.ts:7`. Same value, two files, no shared constant and no pin** | **EI-8a**: a licensed copy is pinned by an executed **test**, never by a comment — the comment mechanism is measured to have failed twice (C84 EI-8a) |
| **System type** | `systemTypeId` — reaches the pipeline **only on the batch verb**, and is then **collapsed into `materialId`** (`CommandEventBridge.ts:551`) | the whole concept, on the single-create path. **EI-8: one vocabulary per concept — this MERGES two** |
| **Steel profile** | `steelProfileName` (`ColumnTypes.ts:26-29`), keyed to `SteelProfileLibrary` | **the entire vocabulary** — no bus verb can set it (it is gated behind `profile ∈ {UC, UB}`, themselves unreachable) |

⚠ **The committer palette is Stack-B-only** — reachable only via `bootstrapRenderEverything`, and
production boot passes `canvas: null` (C84 §4D, cited). It is an **unwired second answer**, not a
live rival — but ⛔ **nothing in `plugins/*/src/committer/` may be deleted**: ADR-0331 §D5
(*"what is Stack B for?"*) is an escalated founder question.

**TO-BE.** ONE shape vocabulary spanning payload, batch registry and store. Either `'i-section'`
maps to `'UC'`/`'UB'` at a named, tested translation point, or `canExecute` **refuses**
`'i-section'` and says why. **A cast is not a translation.**

---

## 10. Geometry

| Axis | AS-IS | TO-BE |
|---|---|---|
| **Stack A** | `packages/geometry-column/src/ColumnFragmentBuilder.ts`, live `initBuilders.ts:298`; plus `ColumnPlanSymbolBuilder.ts` for 2-D. C84 §3.5.3's `StairPreviewRenderer`/`CurvedStairRenderer` reasoning applies: a 2-D symbol builder is **CO-LIVING**, not a duplicate — different question, different output | unchanged |
| **Stack B** | `packages/geometry-kernel/src/producers/column.ts` + `plugins/column/src/committer/column-committer.ts` | ⛔ not deletable — ADR-0331 §D5 |
| **Proven to agree?** | ⛔ **NO HARNESS.** The only A/B parity harness in the repo is wall's, and C84 §5 records it as **not on `main`** (lane worktree only) | build `tests/parity/column/`; it MUST consume `packages/geometry-kernel/src/tolerance.ts` — **shipped 2026-08-13**, barrel-exported `index.ts:22-34` (**L-954**: C73 §5.1's "NOT BUILT" was five days stale). ⛔ **MUST NOT ship a bare `const TOL`** ([C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)) |
| **Datum convention** | column base world Y = `level.elevation + baseOffset`, with `position.y` **also** carried from `origin.y` (`initTools.ts:1661`). ⛔ **TWO independent vertical inputs — `position.y` and `baseOffset` — and `NOT MEASURED` whether `ColumnFragmentBuilder` adds both.** This is precisely the wall-Y double-add shape (C84 §4D: *"`WallFragmentBuilder.ts:728` folds `baseOffset` into `worldY`, `:1097` puts that on the group, and every geometry site adds it again"*) | **ONE column-Y authority, named here.** Measuring this is Delta 6 |
| **Rotation** | carried end-to-end (`ColumnData.rotation`, `ColumnTypes.ts:14`) | ✅ unchanged |

---

## 11. THE DELTA

| # | Item | Invariant | Proof (⛔ watched RED first) |
|---|---|---|---|
| **1** | **`'i-section'` written through an unchecked cast** into a union that lacks it — `initTools.ts:1664`, `ColumnTypes.ts:19` vs `Column.ts:7` | **EI-2(c)** | Dispatch `column.create` with `shape:'i-section'`; assert the stored `profile` is a union member **or** that `canExecute` refused naming the reason. Today it stores an unmodelled string |
| **2** | The batch verb **cannot express `'i-section'`** while the single verb offers it — `commands.ts:1045` | **EI-3** | one shape vocabulary across both verbs |
| **3** | **Column delete strands `startSupportId`/`endSupportId` on every beam it supported** — `BeamTypes.ts:12-15`; no delete path touches them | EI-5 + [C79 §7.2](C79-REGION-SEMANTICS.md) | delete a supporting column; assert the beam's support refs are cleared; undo; assert restored |
| **4** | **COLUMN IS ONE OF L-952's EIGHT** — `metadata.version` ratchets forward on undo of a parameter change (`UpdateElementParameterCommand.ts:379-385,410-414`) | **L-952 / ADR-0319 §2** | undo a column parameter change; assert `metadata.version` is **byte-equal** to pre-edit |
| **5** | Six verbs write the DTO while `'column'` restores the legacy store | EI-1a / **C03 §4.6 U-2b** | already pinned for the move case — `apps/editor/__tests__/deadMoveVerbAuthoritativeState.test.ts` (**on `main`**). Extend to `create` / `setType` / `setHeight` |
| **6** | **`position.y` AND `baseOffset` are two independent vertical inputs; whether the builder adds both is `NOT MEASURED`** | EI-9 / C84 §4D | measure it; then name ONE column-Y authority in §10 |
| **7** | `'#9b9b9b'` duplicated across `column/committer/material-bridge.ts:12` and `beam/…:7` | **EI-8a** | pin by an executed test comparing every value, or import one from the other |
| **8** | `systemTypeId` **collapsed into `materialId`** on the batch path (`CommandEventBridge.ts:551`) and **absent** from the single-create cast | **EI-8** | two fields, two concepts, both carried |
| **9** | `topLevelId` declared on the batch registry (`commands.ts:1043`) and **dropped by omission** at both CEB casts | **EI-2(a)** | carry it, or delete the registry field |
| **10** | The bridge mints `ifcData.guid` (`initTools.ts:1671`) and writes **no `metadata`** | **ADR-0319 §2** | create → undo → redo; assert the GUID is byte-equal. Add `ifcGuid` to the payload, as floor already has |
| **11** | `'UC'`/`'UB'`/`steelProfileName` — a whole steel path **unreachable from the bus** | **EI-3 inverse** | extend `ColumnShape`, or declare the steel path L2-only |
| **12** | No Stack A/B parity harness | **EI-11** | `tests/parity/column/`, consuming C73's tolerance module |
| **13** | `ColumnReader.ts:16-19` **silently omits an unmeshed column** from IFC export | [C74](C74-CONSTRAINT-HONESTY.md) | export with a hidden level; assert either the column exports or the export names what it omitted |

---

## 12. REFUSALS

| # | Not supported | Status | Instead |
|---|---|---|---|
| **R1** | **`column.move` does not reach authoritative state** | ✅ **DECLARED, C16 CA-18 conformant** — `MoveColumn.ts:110`, reason `:71-72`, full mechanism `:28-70` | `column.update` (`commands.ts:1218`) → `UpdateColumnCommand` → the geometry `columnStore` — which is what `MOVE_COMMAND_BY_TYPE` (`elementMove.ts:102-127`) and the 3-D gizmo already dispatch. **Put the translated origin in `updates`** |
| **R2** | **`column.setMaterial` does not reach authoritative state** | ✅ **DECLARED, CA-18 conformant** — `SetColumnMaterial.ts:83`, reason `:57` | `column.update` |
| **R3** | ⛔ **`column.move` and `column.delete` MUST NOT BE RETIRED**, despite having no dispatcher | ✅ **DECLARED** — `MoveColumn.ts:60-64`: `tools/ga-gate/check-chat-capability-coverage.ts` requires every name in `CapabilityRefusal` / `CHAT_UNAVAILABLE` / `ChatCommandClassification` to be a **registered** bus command. Retiring would make chat's own refusal cite a verb that does not exist. C84 §3.5.3 independently grades the ten `<kind>.delete` verbs **DORMANT — do not delete** | leave registered; refuse in `canExecute` |
| **R4** | The `plugins/cross` cascade rules that synthesise `column.move` **do not run** | ✅ **DECLARED** — `MoveColumn.ts:37-46`: `CascadeRunner` is registered nowhere in production; **PROMOTED** by ADR-0323 / BIM30 R0 and *"unreachable TODAY by recorded decision, not neglect"*. This is C84 **EI-12** satisfied by declaration | R2 of the BIM30 reasoning-loop plan wires it |
| **R5** | `column.batch.create` is **NOT SYNCED** to collaborators | ✅ **DECLARED** — `syncDisposition.ts:916` | single `column.create` is synced |
| **R6** | Column is **absent from the bake worker** | ✅ **DECLARED HERE** — `HeadlessBakeSession.ts:31,43,53` is wall-only by construction | not a defect; scope is ADR-0331 §D5 |
| **R7** | **Steel columns (`'UC'`/`'UB'` + `steelProfileName`) cannot be created through any bus verb** | ⛔ **NOT A REFUSAL — SILENCE.** `ColumnShape` cannot produce the members; nothing says so | declare the steel path L2-only, or extend the vocabulary (Delta 11) |
| **R8** | **`'i-section'` cannot be stored** | ⛔ **NOT A REFUSAL — A CAST.** `initTools.ts:1664` accepts it and stores an unmodelled string | refuse at `canExecute`, or translate at a named, tested point (Delta 1) |
| **R9** | **Column has no modelled relationship to a structural grid** | ⛔ **UNDECLARED before this contract — now DECLARED AS ABSENT.** `ColumnData` (`ColumnTypes.ts:4-30`) has no grid field | if grid-hosting is intended, it is a schema change, not a delete-path fix |

> *"No affordance without an implementation… A refusal is a correct answer; a silently-wrong wall
> is not."* — `packages/geometry-wall/src/WallRake.ts:50-62`. **R7 and R8 are column's two
> remaining silences; everything else this family refuses, it refuses out loud.**


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

### THE VERB — `column.changeLevel` ✅ LIVE

| | |
|---|---|
| **Payload** | `{ columnId, levelId }` — declared at `packages/command-bus/src/levelChangeVerbs.ts` |
| **Handler** | `plugins/column/src/handlers/ChangeColumnLevel.ts` |
| **Registered** | `plugins/column/src/handlers/index.ts:27` |
| **Legacy move** | `packages/geometry-column/src/ColumnStore.ts` — `changeLevel(id, newLevelId)` |
| **Mirror row** | `apps/editor/src/engine/elementLevelChangedMirror.ts` — `LEGACY_LEVEL_MOVERS.column` |
| **Undo** | `elementUndoStoreAdapter.ts` §L-946 arm: a depth-2 `[id,'levelId']` inverse patch routes to `store.changeLevel()`, and re-registers bimManager + the view-dependency tracker with it |

### WHY THE STORE NEEDED ITS OWN `changeLevel`, FOR THIS FAMILY SPECIFICALLY

`ColumnStore.update()` is a **WHOLE-RECORD REPLACE** (`ColumnStore.ts:215`) and throws
*"cannot clear column.levelId"* (`:226-228`). Handed the one-key `{levelId}` partial that
`elementUndoStoreAdapter`'s **generic** field arm would otherwise write, it either annihilates the
column or throws into a `try/catch` that becomes a single `console.error` — the L-977 shape, which
destroyed a founder's slab on Ctrl+Z two days before this was written.

**This is why a register row may never precede its store method**, and why
`SlabLevelChangeReachesLegacyStore.test.ts` ARM 4 asserts `typeof store.changeLevel === 'function'`
for **every** row in `LEVEL_CHANGE_VERBS` rather than for the one family a test happened to cover.

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
