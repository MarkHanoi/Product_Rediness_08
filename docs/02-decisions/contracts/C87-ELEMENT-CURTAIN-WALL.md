# C87 — ELEMENT: CURTAIN-WALL

- **Status**: CANONICAL — binding on every PR that touches the curtain-wall family
- **Date**: 2026-08-18 · **re-measured and corrected 2026-08-19 (lane CW1)** — see **Appendix A**, which records the SIX claims below that this contract stated with confidence and that turned out to be wrong. Read it before trusting §11.
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md) — the per-element contract for `curtainwall`.
  The **twelve mandatory sections** below are C84 §6's, in C84 §6's order.
- **Constrained by** (these own the mechanisms; C87 only APPLIES them per family, per C84 EI-9 —
  *one answer per question*):
  [C03 §4.4/§4.5/§4.6](C03-SCHEMAS-COMMANDS-AND-STATE.md) (store layers · `ctx.stores` is a snapshot ·
  U-2/U-2b `affectedStores`) · [C11](C11-ELEMENT-CREATION-PIPELINE.md) (creation pipeline) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (CA-17/CA-18/CA-19/CA-21) ·
  [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) (determinism + tolerance) ·
  [ADR-0319 §2](../adrs/) (audit-field behaviour across undo — **NOT C75**, whose scope line
  disclaims it) · [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the UI-control census)
- **Evidence**: measured in the MAIN worktree on 2026-08-18 by `grep -n` / line-numbered `Read`.
  Every claim carries `file:line`. An unverifiable cell reads the literal string **NOT MEASURED** —
  a finding, not a gap. **No cell is blank**: C84 §6 — *a blank reads as "fine", and that is how every
  defect in C84 §4 survived.*
- **Persistence pair measured**: `apps/editor/src/engine/persistence/` — the **LIVE** one.
  `packages/persistence-client/src/loader/` was **not** measured; it is the DEAD copy the app never
  builds (its own source says so at `ProjectSerializer.ts:271`, `ProjectLoader.ts:331`).
- **Reachability axes**: both of C84 §3.5.1 were run — **(a)** importer/constructor census and
  **(b)** the bus-verb census. Each claim below states which axis it rests on.

> ⛔ **THE ONE-LINE VERDICT WAS RETRACTED AND REPLACED 2026-08-19 (lane CW1).** It read:
> *"Curtain-wall is the only family in the repo whose **undo actively corrupts the model rather than
> failing to restore it** … `elementUndoStoreAdapter.ts:289` then discards the array index."* **That
> is no longer true, and it had already stopped being true when this contract was written.**
> `3689915d` (*"undo wrote a NUMBER into the panels array — a depth-3 patch was flattened to a
> top-level write"*) replaced `p.path[1]` with `_resolveFieldValue` + `_applyAtPath` + an explicit
> §EI-7b refusal; `81e1e9c0` (L-977) then chose the write shape from a measured per-store
> declaration. Measured against HEAD by `apps/editor/__tests__/curtainWallPanelUndoDepth.test.ts`
> (5/5, REAL adapter + REAL `CurtainWallStore`): the `panels` patch is REFUSED with the record
> untouched, and the 4-segment `curtain-wall.move` patch lands on the point rather than on
> `baseLine`. **The contract cited a defect that HEAD did not have** — the mirror image of citing an
> enforcement that does not exist, and it is why §11 row 1 is now marked CLOSED.
>
> **THE VERDICT THAT REPLACES IT, measured 2026-08-19.** *Curtain-wall's defining failure is not
> corruption but **REACHABILITY THEATRE**: its three most user-visible verbs execute, report
> `success`, and change nothing a user can see — each for a different reason.*
> `curtain-wall.replacePanel` cannot resolve its store and refuses on **every** dispatch while two
> property panels still offer it (§11 #17, L-1054); `curtain-wall.addGridLine` /
> `curtain-wall.removeGridLine` read spacing fields the record does not carry and wrote an **empty
> grid** (§11 #16, L-1052); and every mullion, transom and non-glazed panel on the Stack B path was
> built as **translucent glass** because the material bridge parsed a key layout nothing mints
> (§11 #9, L-1053). **Three of the four rows this contract ranked highest were justified by a source
> comment rather than by a measurement, and all three were wrong** — see the Appendix.

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schema | `packages/schemas/src/elements/CurtainWall.ts:25` — `defineElement('curtainwall', {…})` |
| Discriminator | `'curtainwall'` (one word, lowercase) — `CurtainWall.ts:25` |
| Plugin DTO storeKey | `'curtainwall'` — `plugins/curtain-wall/src/store.ts:11` (`super('curtainwall')`) |
| Legacy record `type` | `'curtain-wall'` (**hyphenated**) — `packages/geometry-curtain-wall/src/CurtainWallTypes.ts:19`; written at `apps/editor/src/engine/initTools.ts:1453` |
| Bus verb namespace | `curtain-wall.*` (**hyphenated**), 21 verbs — `plugins/curtain-wall/src/handlers/index.ts:34-79`. Every verb also carries a deprecated `curtainwall.*` alias (§FIX-COMMAND-NAMESPACE L-796), e.g. `ReplacePanel.ts:60`, `MoveCurtainWall.ts:26` |
| `affectedStores` key declared by handlers | `'curtainwall'` — every handler, e.g. `AddPanel.ts:55` |
| `createSnapshot` key | `'curtainWall'` (**camelCase**) — `packages/command-registry/src/CommandManagerImpl.ts:613` |
| L2 legacy command key | `"curtainWall"` / `"curtainPanel"` — `CreateCurtainWallCommand.ts:102`, `AddCurtainGridLineCommand.ts:69` |
| Panel store registry key | `'curtain-panel'` — `apps/editor/src/engine/initStores.ts:119` |

**`userData.elementType` spellings — TEN, across four casings.** C84 §4E recorded curtain-wall as
`NOT MEASURED`; it is measurable, and this contract supplies the measurement:

| Literal | Producer site |
|---|---|
| `'CurtainWall'` | `CurtainWallBuilder.ts:1321`, `:1848` — the root group |
| `'CurtainWallPart'` | `CurtainWallBuilder.ts:1215, :1253, :1284, :2020, :2042, :2073` — panels **and** mullions |
| `'CurtainPanel'` | `CurtainPanelFactory.ts:195` (inside `stampUserData`, opened `:193`) |
| `'CurtainPanelInstanced'` | `CurtainWallInstanceManager.ts:317` |
| `'curtainwall'` | `CurtainWallStore.ts:237, :279, :300, :407`; `initTools.ts:1478` — storeEventBus |
| `'curtain-panel'` | `CurtainPanelStore.ts:294` — storeEventBus; `CurtainPanelTypes.ts:129` — record `type` |
| `'curtain-wall'` | `CurtainWallTypes.ts:19`; `initTools.ts:1453` — record `type` |
| `'curtainpanel'` | `PropertyDescriptorGenerator.ts:404` (accepted alias); `GLBExporter.ts:190` |
| `'curtain-mullion'` | `PropertyPanel.ts:753` — **selection-layer only; no builder stamps it** |
| *(no mullion tag)* | mullion InstancedMeshes are stamped `'CurtainWallPart'` — `CurtainWallBuilder.ts:1252, :1283` |

Consumer that must survive this: `EdgeProjectorService.ts:2389-2394` gates the plan projector on
`(g.userData?.elementType)?.toLowerCase() === 'curtainwall'` — so `'CurtainWallPart'`,
`'CurtainPanel'` and `'CurtainPanelInstanced'` **do not match it**. Whether that exclusion is
intentional is **NOT MEASURED**.

### TO-BE — normative

- **CW-ID-1.** The canonical `userData.elementType` for this family is **`'CurtainWall'`**, frozen,
  compared case-insensitively per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md). It is the ONLY family
  tag. `'CurtainWallPart'`, `'CurtainPanel'`, `'CurtainPanelInstanced'` and `'curtain-mullion'` are
  **sub-parts**, and MUST be declared as sub-parts using C15 §12's existing mechanism —
  `userData.role = 'geometry'` + `parentId` — **not as new element-type tags** (C84 §4E, as
  corrected against C15 §12). Ten spellings is the violation; two casings of one spelling is not.
- **CW-ID-2.** The four **key spellings** — `'curtainwall'` (schema, DTO, bus `affectedStores`),
  `'curtain-wall'` (legacy `type`, verb namespace), `'curtainWall'` (`createSnapshot`),
  `'curtain-panel'` (registry) — MUST be reduced to ONE per role and each role's spelling MUST be
  declared here. Until then, **every new store-key comparison MUST be exact-match-audited against
  this table** (see §7 CW-U-2: one of these spellings is already silently voiding a rollback).

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. There are **FOUR** representations, and they disagree on field names.

| # | Representation | File:line | Fields |
|---|---|---|---|
| 1 | **L0 Zod schema** | `packages/schemas/src/elements/CurtainWall.ts:25` | `id`, `type`, `parentId`, `childrenIds`, `metadata`, `ifcData` (BaseNode, `base/BaseNode.ts:11-20,45-48`) + `provenance:41`, `confidence:57`, `levelId:58`, `baseLine:59`, `height:63`, `mullionThickness:65`, `bayWidth:67`, `bayHeight:69`, `panels:70`, `materialId:71`; refine `:72-75` (panel-id uniqueness) |
| 2 | **Plugin DTO store** | `plugins/curtain-wall/src/store.ts:11` — `super('curtainwall')`; state `Record<string, CurtainWallData>` `:8`, `CurtainWallData = CurtainWallSchemaInfer` `:6` | identical to (1) |
| 3 | **Legacy geometry store** | `packages/geometry-curtain-wall/src/CurtainWallStore.ts`; singleton `apps/editor/src/engine/initBuilders.ts:328`; interface `CurtainWallTypes.ts:18-64` | `type:19`, `levelId:20`, `baseLine:26`, `height:27`, `baseOffset:28`, `gridXSpacing:30`, `gridYSpacing:32`, `mullionSize:33`, `panelThickness:34`, `mullionColor?:35`, `glazingColor?:43`, `mullionMaterialId?:54`, `glazingMaterialId?:55`, `gridSystem?:63` + `CoreElement` base. **NO `panels` field.** |
| 4 | **Panel store** | `packages/geometry-curtain-wall/src/CurtainPanelStore.ts:75`; singleton `initBuilders.ts:331`; interface `CurtainPanelTypes.ts:128-` | `type:129`, `curtainWallId:131`, `cellIndex:137`, `panelType:139`, `materialOverride?:141`, `hostedDoor:143+` |
| 5 | **Kernel producer record** | `packages/geometry-kernel/src/producers/curtainwall.ts:30-34` | reads the L0 shape via `@pryzm/protocol` (`:17`) — including `panels` |
| 6 | **Scene `userData`** | `CurtainPanelFactory.ts:187-206` (`stampUserData`); `CurtainWallBuilder.ts:1321` | see §1 |

**Three field names are RENAMED between (1)/(2) and (3), at exactly one site
(`initTools.ts:1461, :1462, :1468`):** `bayWidth`→`gridXSpacing`, `bayHeight`→`gridYSpacing`,
`mullionThickness`→`mullionSize`. That rename is *load-bearing for redo* and is documented as such
at `elementUndoStoreAdapter.ts:231-238`.

**A FIFTH field escapes the schema entirely.** `gridSystem` is written by
`AddCurtainGridLine.ts:90` and `RemoveCurtainGridLine.ts:98` as **`(cw as any).gridSystem = …`** — an
`as any` cast onto a field the L0 schema (`CurtainWall.ts:25-75`) does not declare. It exists only in
`CurtainGridSystem.ts:70-73` and `CurtainWallTypes.ts:63`. Grid lines are therefore **not
schema-representable**, are invisible to `CurtainWall.parse()`, and are a live instance of C84
EI-2(c) — `as any` at the write site is what blinds `tsc`.

### THE AUTHORITY

> **`CurtainWallStore` (representation 3) is the AUTHORITY for the wall; `CurtainPanelStore`
> (representation 4) is the AUTHORITY for the panels.**

Measured basis: renderer, plan view, persistence, IFC export, GLB export and the geometry worker all
read (3)/(4) — §3. **The plugin DTO store (2) has ZERO production readers** on either axis; its own
handler says so at `SetCurtainWallMaterial.ts:32-35` — *"the bus's storesProvider hands it a snapshot
of the FRESH plugin DTO store built by PluginRegistry — not the legacy geometry singleton that the
fragment builders, the 2-D plan projector, the IFC exporter and persistence all read. Only
`*.created` is mirrored across (initTools.ts); there is no update bridge in either direction."*

### TO-BE — normative

- **CW-S-1 (EI-1).** `CurtainWallStore` + `CurtainPanelStore` are the declared authority. Every
  consumer MUST read them. A consumer reading the plugin DTO store is a merge blocker.
- **CW-S-2 (EI-5a).** The plugin DTO store is a **declared write-only shadow**, not a rival.
  ⛔ Do NOT add a mirror, purge or reconciliation pass — C84 §8.c. `plugins/curtain-wall/src/store.ts`
  MUST carry the `plugins/rooms/src/store.ts:1-29` header form naming the winner, the reader count
  (**0**) and the retirement path. This disposition **inverts the moment any reader is found**.
- **CW-S-3 (EI-1a / C03 §4.6 U-2b).** The key `'curtainwall'` resolves at WRITE time to the plugin
  DTO snapshot (`bootstrap.ts` `storesAsRecordView`) and at UNDO time to `window.curtainWallStore`
  (`performUndoRedo.ts:319`). **They are not the same object.** That divergence is hereby DECLARED,
  and it is the mechanism §7 CW-U-1 exploits. It MUST NOT be resolved by making the undo map point
  at the DTO store; the permitted exits are C16 CA-17 (route the write) or `affectedStores: []`.
- **CW-S-4.** `gridSystem` MUST be declared in the L0 schema, and the two `(cw as any)` casts
  (`AddCurtainGridLine.ts:90`, `RemoveCurtainGridLine.ts:98`) removed. A field that only exists
  behind `as any` cannot be validated, bridged, or gated.

---

## 3. CONSUMERS — the split-brain check

`✅` reads the authority · `⚠️` reads something else · `?` NOT MEASURED

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| **Renderer (3-D)** | (3) + (4) via `CurtainWallBuilder` | `initBuilders.ts:328` constructs `CurtainWallStore`, `:331` `CurtainPanelStore`; `:22, :325` record that `CurtainWallBuilder` is *owned by its tool*, not registered in `initBuilders`. `CurtainPanelBuilder` is invoked from `CurtainWallBuilder.build()` — pipeline at `CurtainPanelBuilder.ts:9-14` | ✅ |
| **Plan view** | mesh `userData` stamped by (3)'s builder | `EdgeProjectorService.ts:2389-2394`, cache key `:2441`; `views/plantools/CurtainWallPlanToolHandler.ts`. Liveness depends on `initTools.ts:1477-1482` firing storeEventBus **manually**, because `CurtainWallStore.add()` does not (`:1471-1474`) | ✅ (fragile — see CW-C-2) |
| **Persistence — save** | (3) ONLY | LIVE `ProjectSerializer.ts:41` (import), `:643-659` `serializeCurtainWall()`, `:1019` `curtainWallStore.getAll().map(serializeCurtainWall)`, `:1104` | ⛔ **STORE (4) IS NEVER READ — see L-1057 below** |
| **Persistence — load** | writes (3) via L2 commands | LIVE `ProjectLoader.ts:103` imports `CreateCurtainWallCommand`; Step 11 loop `:1310-1354`, command construction `:1324-1348` — **17 fields, no `panels`** | ⛔ **STORE (4) IS NEVER WRITTEN — see L-1057** |
| **IFC export** | (3) ONLY | `packages/file-format/src/export/ifc/readers/CurtainWallReader.ts:1` imports `CurtainWallStore`, `:7` ctor, `:11` `this.store.getAll()`, `:36` `ifcClass:'IfcCurtainWall'`. Geometry via `ctx.findMesh(item.id)` `:15`, `continue` if absent `:17` | ✅ |
| **GLB export** | scene meshes | `GLBExporter.ts:188-190` name set `'curtainwall'`/`'curtain-wall'`/`'curtainpanel'`, ancestor check `:200` | ✅ |
| **Bake worker** | **NOTHING** | `apps/bake-worker/src/session/HeadlessBakeSession.ts` handles `wall` only (C84 EI-1). No curtain-wall producer call site measured | — capability absent |
| **Geometry worker** | (3) | `apps/editor/src/workers/geometry.worker.ts:3, :20, :265` — curtain-wall fallback-glass; on error `CurtainWallBuilder` falls back to sync `build()` | ✅ |
| **AI read model** | (3) | `packages/ai-host/src/AIReadModel.ts:21, :334, :402` | ✅ |
| **Solar** | meshes | `packages/renderer-three/src/solar/solarSurfaceFilter.ts:59-60` excludes `'curtainwallglass'`, `'curtainglass'` | ✅ |
| **Plugin DTO store (2)** | — | **zero production readers, both axes** | n/a |

> ⛔ **§L-1057 (2026-08-19) — THE PANEL AUTHORITY IS NEVER PERSISTED AND NEVER LOADED, AND THIS IS
> CW-B-2's ACTUAL ROOT.** These two rows read *"⚠️ panels lost"*, which is true and understates it by
> attributing the loss to the create bridge. **Measured:**
> `grep -in "curtainpanel\|curtainPanelStore" apps/editor/src/engine/persistence/ProjectSerializer.ts
> apps/editor/src/engine/persistence/ProjectLoader.ts` → **ZERO matches in BOTH.** Not a spelling
> artefact: the `ProjectStores` interface the serializer destructures (`:804`, consumed `:1017-1024`)
> **has no curtain-panel member at all**, so there is no store for a branch to read even if one
> existed.
>
> **`CurtainPanelStore` is the declared AUTHORITY for panels (§2), and it does not round-trip.**
> Every per-panel authoring — `panelType` (all thirteen, door included), `materialOverride`, and
> `hostedDoor`'s six fields — is destroyed on save with no error. That is C84 **EI-6** verbatim —
> *"silent non-persistence is the most severe defect this contract governs: the user's work is
> destroyed with no error"* — the **identical shape as `lighting`** (C84 §1 defect #2), for a
> **second family**. ⚠ **C84 §4's curtain-wall EI-6 cell reads a flat `✅`.** The WALL persists; an
> entire authority store beneath it does not, and a per-family `✅` cannot express that.
>
> ⭐ **WHY NOBODY NOTICED, and it is the same shape as L-1053 in a different subsystem: the panels
> are silently REGENERATED.** `ProjectLoader` re-adds each wall; `CurtainWallStore.add()`
> synchronously drives `CurtainPanelSyncHandler`; it finds no panel for any cell and mints every one
> as `panelType: 'SystemPanel_Glass'` (`CurtainPanelSyncHandler.ts:129`). The reload produces a full,
> plausible, uniformly-glazed façade with the correct cell count. **A wall that came back EMPTY would
> have been reported years ago.** The regeneration is indistinguishable from correct output at every
> level except the one the user authored.
>
> Pinned by `packages/geometry-curtain-wall/__tests__/CurtainPanelAuthoringIsNotPersisted.test.ts`
> (3/3, REAL stores + REAL sync handler). ⛔ **NOT FIXED — it is a FILE-FORMAT change**
> (a `curtainPanels` array in the snapshot, a load step that seeds the panel store **before** the sync
> handler regenerates, and a [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) `SNAPSHOT_SCHEMA_VERSION`
> decision — currently 5), touching two files every family shares, and it cannot be proven by a unit
> test. **Escalated rather than half-landed.**

**No two consumers read different stores. Curtain-wall is NOT a split-brain family** — C84 §4 records
it `✅ legacy` and this contract confirms it on all six C84 EI-1b consumers. **Recorded `✅`
explicitly, per EI-1b**, so it is distinguishable from *nobody looked*.

### TO-BE — normative

- **CW-C-1.** The authority set is closed at (3) + (4). Any new consumer MUST read them.
- **CW-C-2.** `CurtainWallStore.add()` MUST emit its own storeEventBus event. A store whose event is
  fired by its *caller* (`initTools.ts:1477-1482`) is one caller away from a silently invisible
  curtain wall, and there is now more than one caller (load, import, undo-redo re-add).

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — the registered bus handlers (**22** as of 2026-08-19, was 21 — see §6)

`plugins/curtain-wall/src/handlers/index.ts:34-79` (verb list) · `:84-112`
(`buildCurtainWallHandlerSet`) · `:115-118` (`registerCurtainWallHandlers`) · registered in
production at `apps/editor/src/engine/engineLauncher.ts:552`.

| Handler | Verb | `affectedStores` | Lineage (C84 §4A) | Refuses? |
|---|---|---|---|---|
| `CreateCurtainWall.ts` | `curtain-wall.create` | `['curtainwall']` `:37` | L1 | no |
| `CreateCurtainWallBatch.ts` | `curtain-wall.batch.create` | `['curtainwall']` `:56` | L1 | no |
| `DeleteCurtainWall.ts` | `curtain-wall.delete` | `['curtainwall']` `:24` | L1 | no |
| `DeleteCurtainWallBatch.ts` | `curtain-wall.batch.delete` | `['curtainwall']` `:48` | L1 | no |
| `UpdateCurtainWallBatch.ts` | `curtain-wall.batch.update` | `['curtainwall']` `:53` | L1 | no |
| `MoveCurtainWall.ts` | `curtain-wall.move` | `['curtainwall']` `:27` | L1, mutates `baseLine` points in place `:48-50` | no |
| `ResizeCurtainWall.ts` | `curtain-wall.resize` | `['curtainwall']` `:32` | L1 | no |
| `SetCurtainWallGrid.ts` | `curtain-wall.setGrid` | `['curtainwall']` `:29` | L1 | no |
| `SetCurtainWallOutline.ts` | `curtain-wall.setOutline` | `['curtainwall']` `:33` | L1 | no |
| `SetCurtainWallMullionType.ts` | `curtain-wall.setMullionType` | `['curtainwall']` `:35` | L1 | no |
| `SetCurtainWallTransomType.ts` | `curtain-wall.setTransomType` | `['curtainwall']` `:36` | L1 | no |
| `SetCurtainWallPanelType.ts` | `curtain-wall.setPanelType` | `['curtainwall']` `:37` | L1, push `:73` / field mutate `:82-84` | no |
| `SetCurtainWallMaterial.ts` | `curtain-wall.setMaterial` | `['curtainwall']` `:65` | L1 (`execute` unreachable) | ⛔ **YES — unconditional**, `:85` |
| `AddPanel.ts` | `curtain-wall.addPanel` | `['curtainwall']` `:55` | L1, array push `:97` | no |
| `RemovePanel.ts` | `curtain-wall.removePanel` | `['curtainwall']` `:27` | L1, splice `:57` | no |
| `SwapPanel.ts` | `curtain-wall.swapPanel` | `['curtainwall']` `:35` | L1, find+mutate `:67` | no |
| `RotatePanel.ts` | `curtain-wall.rotatePanel` | `['curtainwall']` `:48` | L1, find+mutate `:90` | no |
| `ReplacePanel.ts` | `curtain-wall.replacePanel` | **`[] as const` `:66`** | **L6 — direct store write `:137`** | no |
| `AddCurtainGridLine.ts` | `curtain-wall.addGridLine` | `['curtainwall']` `:46` | L1, `(cw as any).gridSystem =` `:90` | no |
| `RemoveCurtainGridLine.ts` | `curtain-wall.removeGridLine` | `['curtainwall']` `:46` | L1, same cast `:98` | no |
| `CreateCurtainWallsOnAllSlabs.ts` | `curtain-wall.create-on-all-slabs` | **`[] as const` `:35`** | fan-out bridge | no |

**RETIRED verb, recorded so nobody re-mints it:** `wall.updateCurtainWall` — `handlers/index.ts:54-69`
documents that `UpdateCurtainWallHandler` was **deleted** and the verb re-owned by the
`initBusHandlers.ts` bridge → `UpdateCurtainWallCommand` → the geometry store
(`engineLauncher.ts:305, :774, :824` per that comment). **This is the only curtain-wall verb whose
write reaches the authority directly, and it is the L3 lineage.**

### The nine L2 legacy commands — `packages/command-registry/src/curtainwall/`

`CreateCurtainWallCommand.ts:102` `["curtainWall"]` · `CreateCurtainWallsFromSlabCommand.ts:54`
`["curtainWall"]` · `CreateCurtainWallsOnAllSlabsCommand.ts:72` `["curtainWall"]` ·
`UpdateCurtainWallCommand.ts:47` `["curtainWall"]` · `UpdateAllCurtainWallsCommand.ts:30`
`["curtainWall"]` · `AddCurtainGridLineCommand.ts:69` `["curtainWall","curtainPanel"]` ·
`RemoveCurtainGridLineCommand.ts:53` `["curtainWall","curtainPanel"]` ·
`ReplacePanelTypeCommand.ts:56` `["curtainPanel"]` · `ReplacePanelWithDoorCommand.ts:62`
`["curtainPanel"]`.

### UI-control reachability — the EI-3 half

**NOT MEASURED**, and it is the half C16 CA-18 does not reach (C84 EI-7a, as corrected).
`curtain-wall.setMaterial` refuses unconditionally at `SetCurtainWallMaterial.ts:85`; whether the
ribbon/property-panel control that dispatches it is still **offered** was not measured here and is
owned by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).

### TO-BE — normative

- **CW-P-1.** The refusal at `SetCurtainWallMaterial.ts:85` **SATISFIES C16 CA-18 and MUST NOT be
  "fixed" by restoring silent success.** The residual defect is the still-offered control. Two exits:
  route the write (C16 CA-17) and re-enable it, or disable the control while the verb refuses.
- **CW-P-2.** `ReplacePanel.ts:66`'s `affectedStores: []` is **honest** about lineage L6 and
  **dishonest** about outcome: the verb reports `success` for an irreversible write. Until the
  `CurtainPanelStore → Store<CurtainPanelData>` migration its own `:62-65` names, it MUST either
  route through the panel store's patch pair or **refuse under CA-18** naming irreversibility.
- **CW-P-3.** No new curtain-wall verb may declare `affectedStores: []` without a CA-18 refusal or a
  named, dated retirement condition (EI-10(d)).

---

## 5. THE BRIDGE FIELD MAP — **THE LOAD-BEARING SECTION**

One row per payload field. Every field has a declared destination: **CARRIED**, **TRANSFORMED**, or
**DROPPED (DELIBERATE)**. Omission is forbidden (C84 EI-2). This is the table the future
`check-bridge-field-coverage.ts` gate consumes.

> ⚠ **RE-MEASURED 2026-08-18 — EVERY HOP CITATION IN THIS SECTION HAD MOVED, AND TWO OF ITS
> VERDICTS ARE NO LONGER TRUE.** The table below described a bridge that no longer exists in that
> shape: `bd182447` (L-972) added the missing fields to the CEB cast and **EXTRACTED the legacy
> field mapping out of the `initTools` closure into its own module**, and `9f14b795` moved
> `initTools` again. The rows are corrected in place and the two changed verdicts are marked; the
> retracted text is kept per C84 §6.

**Hops measured (2026-08-18):** `curtain-wall.create` payload →
`CommandEventBridge.ts:503-553` (`p` cast **`:519-532`**, emit **`:533-551`**) and the batch arm
`:555-600` (cast `:560-577`, emit `:582-597`) → `initTools.ts:1451` subscriber (dedup guard
`:1472`, `add()` `:1491`) → **`apps/editor/src/engine/curtainWallCreatedMirror.ts:147-168`**, which
is where the legacy record is now built → `CurtainWallStore` → `ProjectSerializer.ts:643-659`.

**The extraction is the point, not an incidental refactor.** As a closure inside `initTools`, this
mapping was unreachable from any suite — which is precisely how six constant-false reads survived in
it (L-972). It is now a module a test can execute, exactly as `roofCreatedMirror` /
`beamCreatedMirror` were extracted for the same reason. **Cite the mirror, not `initTools`, for any
field's destination.**

| # | L0 field (`CurtainWall.ts`) | CEB reads? | CEB emits | initTools → legacy field | Serialised? | **Disposition** |
|---|---|---|---|---|---|---|
| 1 | `id` `:—` (BaseNode `:45`) | ✅ `:422` | `id` `:435` | `id` `:1452` | ✅ `:645` | **CARRIED** |
| 2 | `type` (BaseNode `:48`) | ⛔ | — | literal `'curtain-wall'` `:1453` | ✅ `:645` | **TRANSFORMED** — discriminator rewritten `'curtainwall'`→`'curtain-wall'` |
| 3 | `parentId` (BaseNode `:12`) | ⛔ | — | — | ✅ `:645` (from legacy `CoreElement`) | **DROPPED (SILENT)** — never bridged; the serialised value comes from the legacy default, not the payload |
| 4 | `childrenIds` (BaseNode `:13`) | ⛔ | — | — | ⛔ | **DROPPED (SILENT)** |
| 5 | `metadata` (BaseNode `:18`) | ⛔ | — | — | ⛔ | **DROPPED (SILENT)** — see ADR-0319 §2 |
| 6 | `ifcData` (BaseNode `:19`) | ⛔ | — | — | ✅ `:657` (legacy value) | **DROPPED (SILENT)** in flight |
| 7 | `provenance` `:41` | ⛔ | — | — | ⛔ | **DROPPED (SILENT)** — C75 §2.4 field never reaches the record persistence writes |
| 8 | `confidence` `:57` | ⛔ | — | — | ⛔ | **DROPPED (SILENT)** |
| 9 | `levelId` `:58` | ✅ `:423` | `levelId ?? ''` `:433` | `levelId` `:1454` | ✅ `:645` | **CARRIED** |
| 10 | `baseLine` `:59` | ✅ `:424` | `baseLine` `:436` | `baseLine` (y defaulted 0) `:1455-1458` | ✅ `:646` | **TRANSFORMED** — the `y` ordinate is defaulted to `0` at `:1455-1458` |
| 11 | `height` `:63` | ✅ `:425` | `height` `:437` | `height` (default 3) `:1459` | ✅ `:647` | **CARRIED** |
| 12 | `mullionThickness` `:65` | ✅ `:428` | `?? 0.05` `:440` | **`mullionSize`** `:1468` | ✅ `:649` | **TRANSFORMED (RENAMED)** — rationale `:1463-1467`; the pre-fix bug was `cw.mullionSize.toFixed(4)` throwing on `undefined` |
| 13 | `bayWidth` `:67` | ✅ `:426` | `?? 1.2` `:438` | **`gridXSpacing`** `:1461` | ✅ `:648` | **TRANSFORMED (RENAMED)** |
| 14 | `bayHeight` `:69` | ✅ `:427` | `?? 1.5` `:439` | **`gridYSpacing`** `:1462` | ✅ `:648` | **TRANSFORMED (RENAMED)** |
| 15 | **`panels` `:70`** | ✅ **`:531`** *(was: "not in the `:421-429` cast" — **RETRACTED**, `bd182447` added it)* | `panels` `:550` (batch `:596`) | ⛔ **not mapped** — `curtainWallCreatedMirror.ts:147-168` returns no `panels` key | ⛔ no `panels` key in `:644-658` | ⚠ **DROPPED (DECLARED) AT ONE HOP** — no longer "silent at every hop". The CEB carries it; the mirror drops it and **says so at the drop site** (`curtainWallCreatedMirror.ts:138-144`: *"carries N authored panel(s). The legacy `CurtainWallData` derives panels from `gridSystem` via `CurtainPanelSyncHandler` and cannot accept a list, so the wall is mirrored with its GRID only and those panel overrides are not reflected in 3-D."*). **CW-B-1 is SATISFIED for this row; CW-B-2 is NOT** — the user's door panel still does not render |
| 15a | ↳ `panels[].id` `:15` | ⛔ | — | — | ⛔ | **DROPPED** |
| 15b | ↳ `panels[].row` `:16` | ⛔ | — | — | ⛔ | **DROPPED** |
| 15c | ↳ `panels[].col` `:17` | ⛔ | — | — | ⛔ | **DROPPED** |
| 15d | ↳ `panels[].kind` `:18` | ⛔ | — | — | ⛔ | **DROPPED** — spandrel band, door panel, opaque infill all become default glazing |
| 15e | ↳ `panels[].materialId` `:19` | ⛔ | — | — | ⛔ | **DROPPED** |
| 15f | ↳ `panels[].rotation` `:22` | ⛔ | — | — | ⛔ | **DROPPED** |
| 16 | `materialId` `:95` *(was cited `:71`)* | ✅ **`:529`** *(**RETRACTED** — it is read now)* | `p.materialId ?? p.systemTypeId` `:549` (batch `:595`) | ⛔ **not mapped** by the mirror | ⛔ (legacy has `mullionMaterialId`/`glazingMaterialId` instead, `:653-654`) | ⚠ **DROPPED (DECLARED)** — `curtainWallCreatedMirror.ts:129-133` warns, and `:118-122` gives the reason that makes this a DESIGN question rather than an oversight: *"`materialId` is a SINGLE generic id. The legacy model has THREE … so the id's intent is not recoverable here."* **One id cannot be split into three slots without a rule, and no rule exists. That rule is the deliverable, not a patch** |
| 17 | **`baseOffset` `CurtainWall.ts:76`** | ✅ `:524` | `baseOffset` `:541` | `baseOffset` `curtainWallCreatedMirror.ts:157` | ✅ `:647` | ✅ **CARRIED** — ⛔ **this row said "INVENTED AT THE BRIDGE — no schema source". That is REFUTED: `baseOffset` IS an L0 field (`CurtainWall.ts:76`) and a legacy field (`CurtainWallTypes.ts:28`), and it is now carried end to end** |
| 18 | **`panelThickness` `CurtainWall.ts:89`** | ✅ `:528` | `panelThickness` `:545` | `panelThickness` `curtainWallCreatedMirror.ts:167` | ✅ `:649` | ✅ **CARRIED** — same retraction: L0 `:89`, legacy `CurtainWallTypes.ts:34`. **CW-B-4's demand that these two "MUST gain L0 schema fields" was already satisfied when it was written** |
| — | *(no L0 field)* | — | — | — | ✅ `mullionColor:650`, `glazingColor:652`, `mullionMaterialId:653`, `glazingMaterialId:654` | **LEGACY-ONLY** — unreachable from the bus |
| — | *(no L0 field — `as any`)* | — | — | — | ✅ `gridSystem:655` | **LEGACY-ONLY**, written only by `AddCurtainGridLine.ts:90` / `RemoveCurtainGridLine.ts:98` |
| — | `CurtainPanelData.hostedDoor` `CurtainPanelTypes.ts:143-145` (6 sub-fields `:89-105`) | ⛔ | — | — | ⛔ | ⛔ **DROPPED (SILENT)** — a configured curtain-wall door loses `frameColor`, `leafColor`, `hingesSide`, `swingDirection`, `sillHeight`, `frameThickness` on save |

**The batch arm (`CommandEventBridge.ts:445-473`) is identical in loss**: the per-element cast at
`:451-456` also lacks `panels` and `materialId`.

**Why `panels` is not merely "collapsed".** C84 §4 records *"per-panel kind/material/rotation
collapsed"*. Measured, it is worse: `panels` is **never read at all** — the cast at `:421-429`
declares seven fields and structurally erases the eighth before `emit`. `CreateCurtainWall.ts:79`
(`panels: cmd.panels ?? []`) and `CreateCurtainWallBatch.ts:119` write a full array into the DTO
store; the legacy `CurtainWallData` (`CurtainWallTypes.ts:18-64`) has **no `panels` field to receive
it**; and `migrateToGridSystem` (below) regenerates a uniform grid instead. The contrast is on the
same page: the wall arm carries `materialId: s.materialId ?? s.systemTypeId` at `:406`. Walls carry
material through this bridge. Curtain walls carry none.

**`migrateToGridSystem` — `packages/geometry-curtain-wall/src/CurtainGridSystem.ts`.** Called from
**ELEVEN** sites as a `??` fallback, not the nine recorded here on 2026-08-18: `AddCurtainGridLine.ts`,
`RemoveCurtainGridLine.ts`, `CurtainWallBuilder.ts` ×2, `CurtainPanelSyncHandler.ts`,
`AIReadModel.ts` ×2, `AddCurtainGridLineCommand.ts`, `RemoveCurtainGridLineCommand.ts`, **and the two
that were missed and that matter most — `CurtainGridEditor.ts:52` and `CurtainPanelEditor.ts:54`, the
UI's own side of the same question.** *(Re-derive, do not re-transcribe:*
`grep -rn "migrateToGridSystem(" --include=*.ts packages plugins apps | grep -v __tests__`*.)* It
takes **two scalars** and returns `{uLines, vLines}` only — pure topology, **no per-cell kind or
material**. So a non-uniform grid cannot be reconstructed, and a spandrel band cannot exist in its
output. That half stands unchanged.

> ✅ **THE ID HALF IS CLOSED (`ab8b4248`, L-1051) — and the missed call sites were the whole
> user-visible defect.** It read: *"AND IT MINTS FRESH IDS EVERY TIME … `crypto.randomUUID()` inside
> the generation loops … any payload holding a `gridLineId` is orphaned."* Correct, and a
> [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) violation verbatim. **What it did not say is
> what that cost the user, and the two uncounted call sites are exactly where the cost landed:**
> `CurtainGridEditor.resolveGrid()` migrated to obtain the ids it drew on its `×` buttons;
> `RemoveCurtainGridLine` migrated **again** to obtain the ids it searched; the two sets were
> disjoint; `removeGridLine()` matched nothing; the verb returned `success`. **On any wall with no
> stored `gridSystem` — the default for every wall the user has never added a line to — the
> grid-line delete button did nothing, forever, silently.** Ids are now derived from `ownerId` +
> axis + index (`derivedGridLineId`, exported so no caller transcribes the format — C84 EI-9).
> Persisted ids are untouched: this path runs only when there is no stored grid to read.
>
> ⛔ **AND UNDERNEATH IT, A SECOND DEFECT THIS SECTION DID NOT SEE — see §11 #16 (L-1052).** The two
> bus grid-line verbs passed `(cw as any).gridXSpacing` / `.gridYSpacing` — **legacy names, read off
> the L0-parsed DTO record, whose spacing fields are `bayWidth` / `bayHeight`.** Both reads were
> `undefined` on every execution, `Math.max(1, NaN)` is `NaN`, the generation loops never ran, and
> the migration returned `{uLines: [], vLines: []}` — **below this module's own stated ≥2-lines
> invariant**. The non-determinism was the visible symptom of a grid that was not merely
> re-identified but **empty**.

### TO-BE — normative

- **CW-B-1 (EI-2).** Every row above marked **DROPPED (SILENT)** MUST become either CARRIED or
  **DROPPED (DECLARED)** — named in the bridge source at the drop site, with the reason. Silence is
  the defect.
  > ✅ **PARTIALLY DISCHARGED 2026-08-18 (`bd182447`, L-972).** Rows **15** (`panels`) and **16**
  > (`materialId`) are now DECLARED at the drop site with their reasons
  > (`curtainWallCreatedMirror.ts:129-133`, `:138-144`), and rows **17**/**18**
  > (`baseOffset`, `panelThickness`) turned out to be **CARRIED**, not invented. **Rows 3–8 remain
  > SILENT** (`parentId`, `childrenIds`, `metadata`, `ifcData`, `provenance`, `confidence`) and are
  > what is left of this bullet. Do not read the partial discharge as closure.
- **CW-B-2.** `panels` and `materialId` MUST reach the authority. Rows 15/15a-f and 16 are the
  minimum bar: a curtain wall the user authored with a door panel MUST render, export and reload
  with a door panel.
  > ⚠ **RE-AIMED 2026-08-19 (L-1057) — THIS BULLET WAS POINTED AT THE WRONG HOP, AND CLOSING IT AS
  > WRITTEN WOULD NOT HAVE DELIVERED WHAT IT PROMISES.** Fixing rows 15/16 makes the CREATE payload's
  > `panels[]` reach the legacy record. **A user does not author a door panel through a create
  > payload.** They author it through `ReplacePanelTypeCommand` / `ReplacePanelWithDoorCommand`, into
  > `CurtainPanelStore` — which §2 names as the authority for panels and which **§3's L-1057 block
  > proves is never persisted and never loaded.** So:
  > - the **RENDER** half already works *within a session* (arm 1 of the pinning test);
  > - the **RELOAD** half fails because the panel store does not round-trip — **a persistence gap,
  >   not a bridge gap**;
  > - the **EXPORT** half is unmeasured: `CurtainWallReader.ts` reads store (3) only, so an IFC
  >   export carries no per-panel kind either, for the same reason.
  >
  > **CW-B-2 is therefore satisfied by persisting `CurtainPanelStore`, and NOT by the bridge work
  > rows 15/16 describe.** Both are owed; only one is on the path to the founder's sentence. This is
  > why a defect must be measured at the layer the user experiences: the bridge diagnosis was correct
  > about a real loss and wrong about *which* loss the user sees.
- **CW-B-3.** `migrateToGridSystem` MUST NOT mint ids. Grid-line ids MUST be derived
  deterministically from the wall id and the line index, or the function MUST refuse when
  `gridSystem` is absent. Consuming C73's tolerance/determinism contract is mandatory; a
  `crypto.randomUUID()` in a regeneration path cannot satisfy C73 §1.1.
- ~~**CW-B-4.** The two **INVENTED AT THE BRIDGE** rows (`baseOffset`, `panelThickness`) MUST gain L0
  schema fields, or the bridge MUST stop inventing them.~~
  ⛔ **RETRACTED 2026-08-18 — THE PREMISE WAS FALSE WHEN WRITTEN.** Both fields were already on the
  L0 schema (`CurtainWall.ts:76`, `:89`) and on the legacy record (`CurtainWallTypes.ts:28`, `:34`).
  They are now read by the CEB (`:524`, `:528`), emitted (`:541`, `:545`) and mapped
  (`curtainWallCreatedMirror.ts:157`, `:167`) — **CARRIED end to end**. The requirement it was
  derived from stands and is restated so it is not lost: *a default minted at a bridge is a value the
  model never authored* (C84 §1 — *"every `??` default fires and `parse()` succeeds"*), and the
  mirror's `CURTAIN_WALL_MIRROR_DEFAULTS` (`:89-97`) still fires when the event omits a field.
  **What is NOT MEASURED is whether any producer omits them in practice** — that is the question this
  bullet should have asked.

---

## 6. VERBS

`W` = stores WRITTEN · `R` = stores RESTORED on undo · **`=`** = the two sets are equal.

| Verb | Lineage | W | R | `=`? | Note |
|---|---|---|---|---|---|
| `curtain-wall.create` | L1 | DTO `curtainwall` (+ legacy via CEB→initTools bridge) | legacy `curtainWallStore` only | ⛔ | EI-7a: the DTO record survives undo forever |
| `curtain-wall.batch.create` | L1 | same | same | ⛔ | CEB rewrites `commandType` to the single spelling `:432`, `:459` — the `!== '*.batch.create'` guards downstream are dead code (C84 §4B) |
| `curtain-wall.delete` | L1 | DTO | legacy | ⛔ | 21-of-22 orphaned-DTO class (C84 EI-5). ⚠ **DORMANT** — C84 §3.5.3: no UI path dispatches it; real deletes reach `DeleteElementCommand` |
| `curtain-wall.batch.delete` | L1 | DTO | legacy | ⛔ | dormant |
| `curtain-wall.batch.update` | L1 | DTO | legacy | ⛔ | — |
| **`curtain-wall.move`** | L1 | DTO `baseLine[i].x` `:48-50` | legacy — **CORRUPTS**, see §7 | ⛔ | patch path is 4 segments `[cwId,'baseLine',0,'x']` |
| `curtain-wall.resize` | L1 | DTO | legacy | ⛔ | — |
| `curtain-wall.setGrid` | L1 | DTO | legacy | ⛔ | — |
| `curtain-wall.setOutline` | L1 | DTO | legacy | ⛔ | — |
| `curtain-wall.setMullionType` | L1 | DTO | legacy | ⛔ | — |
| `curtain-wall.setTransomType` | L1 | DTO | legacy | ⛔ | — |
| **`curtain-wall.setPanelType`** | L1 | DTO `panels[i].kind` `:82-84` | legacy — **CORRUPTS** | ⛔ | — |
| **`curtain-wall.setMaterial`** | L1 | **nothing — refuses** `:85` | n/a | ✅ vacuously | C16 CA-18 conformant. `:97` also notes `materialColor` is *"accepted for uniform shape but not applied"* |
| **`curtain-wall.addPanel`** | L1 | DTO `panels` push `:97` | legacy — **CORRUPTS** | ⛔ | the headline |
| **`curtain-wall.removePanel`** | L1 | DTO `panels` splice `:57` | legacy — **CORRUPTS** | ⛔ | — |
| **`curtain-wall.swapPanel`** | L1 | DTO `panels[i]` `:67` | legacy — **CORRUPTS** | ⛔ | — |
| **`curtain-wall.rotatePanel`** | L1 | DTO `panels[i].rotation` `:90` | legacy — **CORRUPTS** | ⛔ | — |
| `curtain-wall.addGridLine` | L1 | DTO `gridSystem` (whole object) `:90` | legacy `gridSystem` | ⚠ partial | **2-segment path — survives the flatten.** `store.update(id,{gridSystem:{…}})` lands on the real legacy field `CurtainWallTypes.ts:63` |
| `curtain-wall.removeGridLine` | L1 | same | same | ⚠ partial | as above |
| **`curtain-wall.replacePanel`** | **L6** | `CurtainPanelStore` direct `:137` | **NEITHER STACK** | ⛔ | `affectedStores: []` `:66`; patches produced against a throwaway literal `:113-118` |
| `curtain-wall.create-on-all-slabs` | fan-out | delegates | delegates | ? NOT MEASURED | `affectedStores: [] :35` |
| **`wall.updateCurtainWall`** (retired verb, L3 bridge) | L3 | legacy via `UpdateCurtainWallCommand` | L2 `commandManager` stack | ✅ | `handlers/index.ts:54-69`. **The only curtain-wall write that reaches the authority.** |

**No `rotate` (whole-wall) verb exists.** `curtain-wall.rotatePanel` rotates a panel within its cell,
not the wall. **NOT MEASURED**: whether any UI offers whole-curtain-wall rotation.
**No `colour` verb exists** distinct from `setMaterial`.

> ⛔ **~~No level-change verb exists~~ — FALSE AS OF `5420ee55` (L-1032, same day), CORRECTED
> 2026-08-19.** `ChangeCurtainWallLevelHandler`
> (`plugins/curtain-wall/src/handlers/ChangeCurtainWallLevel.ts:76`) registers
> **`curtainWall.changeLevel`** with `affectedStores: ['curtainwall']` (`:96`) and **deliberately no
> hyphenated alias** (`:80`). The handler count in §4 is therefore **22, not 21**, and
> `CURTAIN_WALL_HANDLER_TYPES` lists **22** verbs.
>
> ⚠ **NOTE THE SPELLING, AND NOTE THAT IT IS A THIRD ONE.** Every other verb in this family is
> `curtain-wall.*` (hyphenated); this one is `curtainWall.*` (camelCase), matching the L2 command
> key rather than the bus namespace. §1 CW-ID-2's requirement — *"every new store-key comparison MUST
> be exact-match-audited against this table"* — now has a **verb**-namespace twin that CW-ID-2 does
> not cover. **A fourth spelling entered the family the same day this contract enumerated three.**
> Whether that is right (it aligns the verb with `wall.changeLevel`, the reference implementation the
> handler cites at `:11`) or wrong (it splits this family's own namespace) is a **decision C87 owes**,
> not a defect to be filed against the lane that landed it.
>
> ⭐ **AND THE ROT ITSELF IS THE FINDING.** This section was measured on 2026-08-18 and was false
> within a day, because a verb was added to `plugins/curtain-wall/` by a lane that did not own C87
> and had no reason to know §6 asserted its absence. **A contract that enumerates a verb set by hand
> is stale the moment anyone registers a verb.** The durable fix is a gate equating
> `CURTAIN_WALL_HANDLER_TYPES` to §4's table in both directions; it does not exist.
> **Re-derive, do not re-transcribe:**
> `grep -c "^  'curtain" plugins/curtain-wall/src/handlers/index.ts`.

**NOT MEASURED** whether any legacy path can also move a curtain wall between storeys.

### TO-BE — normative

- **CW-V-1.** Every verb row must reach `=` ✅. The interim disposition for the eight **CORRUPTS**
  rows is §7 CW-U-1: **fix the adapter, not the verbs.**
- **CW-V-2.** `curtain-wall.replacePanel` (L6) and any future L6 verb are **unconditional C84 EI-7
  violations**. L6 is not an available lineage for new work.

---

## 7. UNDO / REDO

### CW-U-1 — ✅ **CLOSED.** The corruption was real; it was fixed before this contract described it.

> ✅ **CLOSED 2026-08-19 — `3689915d` + `81e1e9c0`, pinned by `curtainWallPanelUndoDepth.test.ts` (5/5).**
> The six-link chain below is preserved verbatim per C84 §6, because it is the correct account of a
> defect that shipped — but **link 5 no longer exists**. `elementUndoStoreAdapter.ts` no longer reads
> `const field = p.path[1]` at any depth: `_resolveFieldValue` applies the sub-path *inside the
> field's current value read from the legacy record*, and **REFUSES — record untouched — when the
> record cannot carry the anchor**, which is the C84 EI-7b answer this section demanded.
>
> **A `panels` patch gets the refusal, not a repair, and the reason matters:** the legacy
> `CurtainWallData` has no `panels` field at all (§2 representation 3), so there is nothing to apply
> a sub-path *inside*. CW-U-5n's wording — *"assert `panels` is still an array"* — assumed a repair;
> the measured outcome is a logged refusal with `panels` still **absent**. Recorded, not glossed.
>
> **The 4-segment `curtain-wall.move` row is genuinely repaired, not merely refused:**
> `[cwId,'baseLine',0,'x']` lands on the point, both endpoints intact (ARM 3).
>
> **The write shape was re-derived from the real store rather than read off the table** (ARM 5):
> `CurtainWallStore.update` (`CurtainWallStore.ts:365-370`) is `{...existing, ...updates}` — a
> **MERGE** — so `legacyStoreUpdateSemantics.ts:176-180`'s `curtainwall: 'merge'` declaration is
> **CORRECT**, and the one-key partial the adapter writes is the right shape for it. It is **not**
> `SlabStore`'s replace shape (L-977); conflating the two is what L-977 exists to prevent.

The chain as it was, every link measured — **link 5 is now historical**:

1. `AddPanel.ts:92-106` — `produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => { … c.panels.push({…}) })`. State is `Record<string, CurtainWallData>`, so Immer's forward patch path is **`[cwId,'panels',N]`** and its **inverse for an append is `{op:'replace', path:[cwId,'panels','length'], value:oldLen}`**.
2. `AddPanel.ts:55` — `affectedStores = ['curtainwall']`.
3. `performUndoRedo.ts:319` — `curtainwall: w.curtainWallStore`. `_covered()` (`:358-364`) passes. **The ring-buffer cursor steps.**
4. `elementUndoStoreAdapter.ts:287` — the else-branch, commented *"Field-level op: path = [id, field, …]"*.
5. `elementUndoStoreAdapter.ts:289` — **`const field = p.path[1];`** — takes segment 1 **at any depth** and discards everything after it.
6. `elementUndoStoreAdapter.ts:337-338` — `store.update(id, { [String(field)]: p.value });`

**Both directions are destructive, and they are destructive differently:**

| Direction | Patch | `p.path[1]` | Executed | Result |
|---|---|---|---|---|
| **UNDO** | `{op:'replace', path:[cwId,'panels','length'], value:3}` | `'panels'` | `update(cwId, {panels: 3})` | **the array becomes the NUMBER 3** |
| **REDO** | `{op:'add', path:[cwId,'panels',3], value:{id,row,col,kind,…}}` | `'panels'` | `update(cwId, {panels: {…}})` | **the array becomes a single OBJECT** |

*(C84 EI-7b records the undo half. The redo half is recorded here for the first time; both flow from
the same `p.path[1]`.)*

**The identical hazard was recognised ONE LINE AWAY and guarded — for a different family.**
`elementUndoStoreAdapter.ts:295-297`:

```ts
if (String(field) === 'openings' && _isWallOpeningStore(store)) {
  _reconcileWallOpenings(store, id, Array.isArray(p.value) ? (p.value as OpeningLike[]) : []);
  continue;
}
```

`childrenIds` gets an explicit skip at `:301`; `levelId` gets a fully routed path at `:321-332`
(§L-946). **`panels` gets nothing** — no array check, no reconciler, no `continue`. And `:295-297`'s
own ternary is itself a trapdoor: when the patch value is a *single* opening object (exactly what a
`[id,'openings',N]` index patch carries) it falls to `[]` and **strips every opening from the wall**.

**Eight verbs feed index-bearing patches into this path:** `addPanel` (`:97`), `removePanel` (`:57`),
`swapPanel` (`:67`), `rotatePanel` (`:90`), `setPanelType` (`:73`, `:82-84`), `move`
(`:48-50` — 4-segment `[cwId,'baseLine',0,'x']`, so **a move undo writes a scalar into `baseLine`**),
plus the two batch verbs that fan out to them. Two verbs (`addGridLine`, `removeGridLine`) emit
2-segment paths and survive.

**Compounding, measured:** the legacy `CurtainWallData` interface (`CurtainWallTypes.ts:18-64`) has
**no `panels` field at all**, so `store.update(cwId, {panels: …})` writes a foreign key onto the
authoritative record in every case above.

### CW-U-2 — `createSnapshot` cannot roll back this family. **TWO independent holes.**

`CommandManagerImpl.createSnapshot()` (`:578-638`); `wants()` (`:587`) is `scope.has(key)` — **exact,
case-sensitive string match**.

- **(a) ✅ CLOSED (`3229704a`, L-1050) — `'curtainPanel'` was ABSENT from `optionalStores`.** Four L2
  commands declare it: `AddCurtainGridLineCommand.ts:69`, `RemoveCurtainGridLineCommand.ts:53`,
  `ReplacePanelTypeCommand.ts:56`, `ReplacePanelWithDoorCommand.ts:62`. The last two declare **only**
  `["curtainPanel"]`, so `scope` was non-null, matched no row, and their entire snapshot was `{}`;
  `restoreSnapshot` restored nothing, with **no warning** (C84 EI-7d · L-953). A `curtainPanel` scope
  now exists in **both** `createSnapshot` and `restoreSnapshot`. `ctx.stores.curtainPanelStore` was
  already on the context (`command-registry/src/types.ts:467`) and exposes `getAll`/`add`/`remove`,
  which the generic restore loop (`:727-735`) handles unchanged. It is restored **after** the wall so
  `CurtainPanelStore.set()`'s `byWallId` re-index (`:107-119`) has a wall to key against.
- ~~**(b) The recognised key is `'curtainWall'` (camelCase, `:613`) while every bus handler declares
  `['curtainwall']` (lowercase)** … *one key, two resolutions.*~~
  ⛔ **RETRACTED 2026-08-19 — TRUE AS A STRING COMPARISON, VACUOUS AS A DEFECT.** `createSnapshot`
  has exactly **one** call site — `CommandManagerImpl.ts:286` — and it takes an **L2 `Command`**.
  Every curtain-wall L2 command spells the key camelCase
  (`grep -rn affectedStores packages/command-registry/src | grep -i curtain` → **9 of 9**, plus
  `ClearProjectCommand.ts:44` and `DeleteElementCommand.ts:55`). The lowercase `['curtainwall']`
  belongs to the **bus** handlers, which reach the ring buffer and **never** `createSnapshot`. No
  rollback is voided by it. **The divergence stays on the register as a real EI-1a/EI-8 hazard, in
  §1 CW-ID-2** — it is one rename away from becoming the defect this bullet described — but claiming
  it costs a rollback today was an inference from a string match in place of a call-site census.

### CW-U-3 — redo restores; the fix is partial and does not reach the corruption

`elementUndoStoreAdapter.ts:231-241` (§OI-054 REDO-SHAPE-FIX) stashes the removed **legacy** object
so redo re-adds it rather than the L1-shaped forward value — the fix exists *because* of the
`bayWidth→gridXSpacing` rename (§5 rows 12-14): re-adding the L1 value skipped the rename,
`migrateToGridSystem` read `undefined`, and *"redo did nothing"* (`:236-238` verbatim). The stash is
`:241`, consumed `:277`, deleted `:280`. **It runs only on the whole-element create/delete branch
(`:278-281`) — never on the field-level branch `:287-339` where CW-U-1 lives.**

### CW-U-4 — audit envelope (ADR-0319 §2)

`UpdateElementParameterCommand.undo()` (`:379-385`) constructs and executes a fresh **forward**
command; audit-neutrality is delivered only by `restoreWallAudit`, hard-gated at `:410-414` on
`t === 'wall' | 'door' | 'window'`. `curtainwall` is one of the **eight** routed families outside
that gate (L-952), so **`metadata.version` ratchets forward on every curtain-wall undo**. Per
ADR-0319 §2 DERIVED-BUT-CAUSAL, *"a counter that ratchets through an undo/redo cycle means the model
is not the same model … a real defect, not a tolerance candidate."*

### TO-BE — normative

- **CW-U-1n.** ✅ **SATISFIED** (`3689915d`). `elementUndoStoreAdapter` MUST NOT apply a patch whose
  path is deeper than `[id, field]` through the generic `store.update`. A deep patch MUST be either
  (i) applied structurally against the record, or (ii) **refused loudly**. Both branches now exist:
  `_applyAtPath` for (i), the `§EI-7b REFUSED` `console.error` for (ii). **The requirement stands as
  the standing invariant** — it is what any future edit to that arm must keep true, and §11's
  non-regression note governs such an edit.
- **CW-U-2n.** ✅ **first half SATISFIED** (`3229704a`) — `'curtainPanel'` has its `createSnapshot`
  entry. ⚠ **second half STANDS, at lower severity:** the `'curtainWall'` / `'curtainwall'`
  divergence MUST still be closed at the **key registry**, not by adding a second alias (C84 EI-9 —
  one answer per question), because a spelling that is harmless only because the two resolutions
  never meet is a defect waiting on a refactor. Gated by `check-affected-stores.ts` (C84 §5), which
  does not exist yet.
- **CW-U-3n.** The §OI-054 redo stash MUST cover the field-level branch, or the field-level branch
  MUST refuse for renamed-field families.
- **CW-U-4n.** Curtain-wall MUST be added to `restoreWallAudit`'s gate, or the gate MUST be replaced
  by a store-agnostic `preserveMetadata` (L-952's stated fix).
- **CW-U-5n — ✅ BUILT (`3229704a`), and its own instruction could NOT be obeyed.**
  `apps/editor/__tests__/curtainWallPanelUndoDepth.test.ts` exists, 5/5, driving the REAL adapter
  against the REAL `CurtainWallStore` (§FAKE-CANNOT-FALSIFY-THE-HEADER — a hand-written Map that
  merges and validates nothing cannot falsify a claim about a store that does neither).
  ⚠ **"WATCHED RED AGAINST HEAD" WAS IMPOSSIBLE: the fix landed before the control.** HEAD was
  already green, and the file says so rather than implying a red it never saw. **Two lessons, both
  worth more than the row:** *(a)* a control written after its fix cannot discharge the
  watched-red rule, so the rule's real force is on ORDERING, not on the file existing; *(b)* the
  assertion the row specified — *"`panels` is still an array"* — was **wrong about the correct
  outcome**, because the legacy record has no `panels` at all. A control specified from a contract
  rather than from the store can pin the wrong behaviour. The five arms are: the undo direction,
  the redo twin, the 4-segment `move` repair, the L-955 non-regression pin on the working 2-segment
  `gridSystem` path, and a re-derivation of the merge-vs-replace declaration from the real store.

---

## 8. CASCADES

| Cascade | Trigger | Reversed by undo? | Evidence |
|---|---|---|---|
| **Panel rebuild on `replacePanel`** | `panelStore.update()` `ReplacePanel.ts:137` → `CurtainPanelStore.emit('update')` | ⛔ **NO** — `affectedStores: []` `:66` | ✅ **DISPATCHER LOCATED 2026-08-19 (L-1055) — the "NOT LOCATED" verdict is REFUTED.** It is `apps/editor/src/engine/initUI.ts:2263-2287` (§MI-02 FIX, *"CurtainPanelStore → CurtainWallBuilder rebuild subscriber"*): on `'update'` it resolves the parent via `cwStore.getReadOnly(panel.curtainWallId)` and calls `cwBuilder.updateCurtainWall(cw)`, exactly as `ReplacePanel.ts:131-132` promised. **The grep missed it because the comment named the wrong MECHANISM and the wrong FILE:** the subscriber attaches to `CurtainPanelStore.subscribe()` — the store's own listener list (`:284-291`, driven from `emit()` `:295-299`) — **not** to `storeEventBus`, so the string `'curtain-panel'` never appears at the subscription site; and it lives in `initUI.ts`, not `EngineBootstrap`. ⚠ **The cascade is nonetheless UNREACHABLE from this verb**, for the unrelated reason in §11 #17 (L-1054): `ReplacePanel.execute` never runs. The L2 `ReplacePanelTypeCommand` reaches the SAME subscriber and does run — which is what §MI-02 was written for. |
| **Panel storm on wall add** | `curtainWallStore.add()` synchronously drives `CurtainPanelSyncHandler`, one storeEventBus event per panel (`<cwId>::row:col`) | n/a (creation) | `initTools.ts:1440-1445`. Mitigated by hoisting VDT+bimManager registration to `:1446-1449`; batch suppression `CurtainPanelStore.ts:279-290` (§P1-A39); adapter-side mitigation `elementUndoStoreAdapter.ts:65`, `:279` |
| **Redo-shape rename** | ring-buffer redo of a create | ✅ for whole-element ops only | `elementUndoStoreAdapter.ts:231-241, :277, :280` — see CW-U-3 |
| **Shadow re-activation** | mesh build | n/a | `RenderPipelineManager.ts:1466, :1548`; flags `CurtainWallBuilder.ts:1424, :1537, :2091` |
| **Worker fallback** | geometry worker error | n/a | `apps/editor/src/workers/geometry.worker.ts:20, :265`; async path `CurtainWallBuilder.ts:1767-2091`, early userData stamp `:1844-1845` |
| **Grid-line regeneration** | any `??` fallback to `migrateToGridSystem` | ⛔ **NOT REVERSIBLE — it is not even DETERMINISTIC** | `CurtainGridSystem.ts:94, :99` — see §5 CW-B-3 |
| Curtain-wall → wall / slab / room | — | — | **NOT MEASURED** — no cross-family cascade rule for curtain-wall was located |

### TO-BE — normative

- **CW-X-1 (EI-12).** ✅ **DISCHARGED 2026-08-19 (`648b443d`, L-1055).** `ReplacePanel.ts:131-132`
  now names the proven production dispatcher with its call site (`initUI.ts:2263-2287`) **and**
  declares the cascade unreachable-from-this-verb with the reason. *A trigger with no dispatcher and
  a dispatcher with no runner fail identically — silently — and read the same to a reviewer.*
  > ⭐ **THE LESSON THIS ROW ACTUALLY TAUGHT, which generalises past EI-12: a search for a NAMED
  > mechanism cannot find the REAL one.** The dispatcher existed the whole time; the census looked
  > for `storeEventBus` + `'curtain-panel'` because the comment said so, and the subscriber used the
  > store's own `subscribe()` list. **An EI-12 census MUST enumerate the store's emission surfaces
  > from the STORE, not from the comment that cites one of them.** `CurtainPanelStore` has two —
  > `this.listeners` and `storeEventBus` — and only the second carries the searched string.
- **CW-X-2.** Every event-driven cascade above that mutates state MUST be inside patch capture or
  declared outside it in the handler header.

---

## 9. VOCABULARIES

### THREE incompatible panel vocabularies — measured

| # | Vocabulary | Site | Members |
|---|---|---|---|
| V-A | L0 `PanelKind` | `packages/schemas/src/elements/CurtainWall.ts:7` | **4** — `'glazed'`, `'spandrel'`, `'door'`, `'opaque'`. Default `'glazed'` `:18`. Written by `AddPanel.ts:101`, `SetCurtainWallPanelType.ts:77` |
| V-B | Geometry `PanelType` | `packages/geometry-curtain-wall/src/CurtainPanelTypes.ts:61-74` | **13** — `SystemPanel_Glass:62`, `_Opaque:63`, `_Empty:64`, `_Door:65`, `_SlatsVerticalFramed:66`, `_SlatsVerticalDense:67`, `_SlatsVerticalOpen:68`, `_SlatsHorizontal:69`, `_CurtainCornerFold:70`, `_CurtainFlat:71`, `_CurtainOrganic:72`, `_CurtainSide:73`, `_CurtainDoubleMixed:74` |
| V-C | Material-bridge slots | `plugins/curtain-wall/src/committer/material-bridge.ts:11-18, :20` | **6** — `mullion`, `transom`, `glazed`, `spandrel`, `door`, `opaque` |

**EI-3 violation, measured: NINE of thirteen `PanelType` members have no L0 representation.**
The Phase-3 slat family (`:66-69`, 4 members), the Phase-4 fabric family (`:70-74`, 5 members) and
`SystemPanel_Empty` (`:64`) cannot be expressed as a `PanelKind`. Going the other way, `'spandrel'`
has no `PanelType` counterpart. **Four of thirteen survive the round trip.** The nine are therefore
unrepresentable in L0 (§2), unbridgeable (§5) and unpersistable (§3) — they exist only as long as the
session does.

**And the refusal message is stale.** `ReplacePanel.ts:74-80` validates against all 13 via
`isValidPanelType`, but its refusal at `:77-79` names only three:
*"Valid values: SystemPanel_Glass, SystemPanel_Opaque, SystemPanel_Empty"*. A user given that message
cannot discover the ten that would have worked.

**`hostedDoor` (`CurtainPanelTypes.ts:143-145`, shape `:89-105`, defaults `:107-114`)** — required
when `panelType === 'SystemPanel_Door'`, carrying `frameColor`, `leafColor`, `hingesSide`,
`swingDirection`, `sillHeight`, `frameThickness`. It appears in **no** L0 field, **no** serialiser
field (`ProjectSerializer.ts:644-658`) and **no** bridge payload (`CommandEventBridge.ts:421-429`).

### Material vocabulary (C84 EI-8)

`plugins/curtain-wall/src/committer/material-bridge.ts` — **note the path: it is under
`committer/`, not directly under `src/`.** Re-exported `plugins/curtain-wall/src/index.ts:63-65`.
Key format `:3-5`: `curtainwall|<systemTypeId>|<materialId>|<color>|<slot>`.
`FALLBACK_COLOURS` `:11-18`; `CurtainWallSlot` `:20`.

> ⚠ **PARTIAL REFUTATION of C84 EI-8's `_key`-discard claim, for this file.** C84 EI-8 reports
> *"18 independent per-plugin `material-bridge.ts` palettes (three of which take `_key` and **discard
> it**)"*. **Curtain-wall's is NOT one of the three.** `grep _key plugins/curtain-wall/src/` →
> **zero hits**; all three exports take a live `key: string` and read it —
> `slotOfCurtainWallMaterialKey:22-27` reads `parts[4]`, `colorOfCurtainWallMaterialKey:29-35` reads
> `parts[3]`, `makeCurtainWallMaterialFactory:37-39` calls both. C84's count is not challenged; only
> the membership of this file in it.

**The real loss here is narrower and was not previously recorded: `parts[2]` — the `<materialId>`
segment — is never read.** `:24` reads `parts[4]`, `:30-33` reads `parts[3]`. So
`mullionMaterialId` / `glazingMaterialId` (`CurtainWallTypes.ts:54-55`, described `:44-53` as
resolving to *"a real PBR material (e.g. anodised-aluminium mullions, tempered-glass glazing)"*)
**cannot reach this factory** — only the raw hex survives. And an unrecognised slot silently renders
as glass: `:26` `return 'glazed';`, with no warning; likewise `:31` (`parts.length < 5`) and `:34`
(empty colour).

> ⛔ **RE-MEASURED 2026-08-19 (`c229d392`, L-1053) — THE PARAGRAPH ABOVE IS TRUE AND IS THE SMALL
> HALF. THE KEY FORMAT IT QUOTES IS NOT MINTED BY ANYTHING.** The header this contract transcribed
> (`curtainwall|<systemTypeId>|<materialId>|<color>|<slot>`) was itself an unverified claim. There
> are **three** composers, all exported, all in
> `packages/geometry-kernel/src/producers/_internal/curtain-wall/`, and they mint **two** layouts,
> neither being that one:
>
> | Composer | Layout minted |
> |---|---|
> | `composeMullionMaterialKey` `buildMullions.ts:13` | `curtainwall｜mullion｜<materialId>｜#7a7a7e｜body` |
> | `composeTransomMaterialKey` `buildTransoms.ts:12` | `curtainwall｜transom｜<materialId>｜#7a7a7e｜body` |
> | `composeCurtainPanelMaterialKey` `buildPanels.ts:47` | `curtainwall｜panel｜<kind>｜<materialId>｜<colourOfKind>` |
>
> **The SLOT is at index 1.** The bridge read index 4 — the literal `'body'` on a mullion/transom key,
> the panel's COLOUR on a panel key — so `slotOfCurtainWallMaterialKey` hit its
> `return 'glazed'` fallthrough for **every key of every kind**. Three silent consequences:
>
> - **every MULLION and TRANSOM was built on the glass branch** — `transparent`, `opacity 0.45`,
>   `roughness 0.1`, `metalness 0` — never reaching the anodised-metal branch ten lines below it in
>   the same function;
> - **every SPANDREL, DOOR and OPAQUE panel rendered as glazing.** That is CW-B-2's user-facing
>   symptom arriving by a **second, independent route** — the mirror's drop is not the only way a
>   door panel becomes glass;
> - colour was read at index 3, which on a panel key is `materialId`, so
>   `new THREE.Color('<some-material-id>')`. Only an ABSENT id let index 3 fall to `''` and engage
>   the fallback — which then answered `#9bc8e4` where the producer had chosen `#a4cdd9`. **Two
>   palettes, one question** (C84 EI-8).
>
> **So "never reads `parts[2]`" understated it: `parts[2]` is the panel's KIND**, i.e. the discarded
> segment was the very thing the slot vocabulary exists to express. Fixed by parsing on the
> discriminator the producers actually write; an unrecognised key now **REFUSES**
> (`parseCurtainWallMaterialKey` → `null`) and the callers report it once per key naming the three
> real layouts. Pinned by `plugins/curtain-wall/__tests__/committer/MaterialKeyRoundTrip.test.ts`
> (11/11), which imports the three REAL composers and feeds their real output into the real parser —
> an **executed** equivalence proof (C84 EI-10(b)) with no key literal transcribed; one case asserts
> the formerly-documented layout parses to `null`.
>
> ⭐ **WHY IT SURVIVED, and it is the transferable part: a total fallback makes a total mismatch
> indistinguishable from a working default.** Both ends compiled, every key parsed "successfully",
> and the scene rendered. **A parser whose failure branch returns a plausible value cannot report
> that it never succeeded.** ⚠ **The structural defect is NOT closed** — the format is still minted
> in one package and parsed in another with nothing but that test binding them (C84 EI-9). One
> shared module is owed.
>
> ⚠ **THIS DOES NOT FIX WALLS AND CANNOT.** [C85 §11 #12](C85-ELEMENT-WALL.md) records the same
> narrow `parts[2]` defect for the wall family and asks for one fix for both families. **The file is
> NOT shared:** `plugins/wall/src/committer/material-bridge.ts` is a separate file with a separate
> format (`wall|<systemTypeId>|<materialId>|<color>|<layerName>`, minted by
> `producers/_internal/composeMaterialKey.ts`). There are **eighteen** such files, one per plugin —
> exactly as C84 EI-8 counts them (`ls plugins/*/src/committer/material-bridge.ts | wc -l` → 18).
> The wall bridge's colour index **does** agree with its own composer, so it carries the narrow
> defect and **not** this layout mismatch.

### TO-BE — normative

- **CW-Voc-1 (EI-3).** Either V-A gains the nine missing members, or the nine MUST be removed from
  the UI and from `isValidPanelType`. **An enum member the UI can select and the pipeline cannot
  carry is an affordance without an implementation.**
- **CW-Voc-2 (EI-9).** V-A and V-B answer one question — *"what kind of panel is this?"* — twice.
  One MUST become the master and the other a **pinned, tested** projection (EI-8a: a comment is not
  a synchronisation mechanism; that mechanism has already failed twice, measured).
- **CW-Voc-3.** ✅ **CLOSED (`648b443d`).** `ReplacePanel.ts`'s refusal now enumerates
  `VALID_PANEL_TYPES.join(', ')` — generated from the union, not transcribed. It named **three** of
  the **thirteen** members `isValidPanelType` accepts, so a user told *"valid values: Glass, Opaque,
  Empty"* could not discover the ten that would have worked. (C84 EI-8a: a hand-written copy of a
  union is the failure mode, not the fix.)
- **CW-Voc-4.** ⚠ **HALF DISCHARGED (`c229d392`).** `material-bridge.ts` now **reads** the
  `materialId` segment on both real layouts, and **declares at the point of loss** that it cannot
  resolve it (a one-time `DROPPED (DECLARED)` warning naming the id and the slot) — which converts a
  silent EI-2(a) into a declared drop. **It still does not RESOLVE it**, and it cannot from where it
  sits: it is an L6 plugin committer and `STANDARD_MATERIAL_LIBRARY` is injected into the Stack-A
  builder (`initUI.ts:2236-2241`), not here. **The remaining requirement is a routing decision** —
  inject the library into the committer, or move the resolution up — and until then a curtain wall's
  specified anodised aluminium is still rendered as a hex. This bullet stays OPEN.

---

## 10. GEOMETRY

### Stack A — the viewport (`packages/geometry-curtain-wall`)

`CurtainWallBuilder.ts` (root, ~2280 lines) → `computeCurtainCells()` (`CurtainCellComputer`) →
`CurtainWallInstanceManager` (batches uniform flat panels) → `CurtainPanelBuilder.buildPanelMesh()`
— pipeline documented `CurtainPanelBuilder.ts:9-14`.

`CurtainPanelBuilder.ts:4-5` self-describes: *"Thin façade over
`CurtainPanelFactory.buildPanelObject()` — kept for backward compatibility"*, importing it at `:30`.
Under C84 §3.5 this is verdict **STAGE** (one calls the other) and needs **no EI-10 licence** — C84
§3.5.3 and EI-10a already rule it so; recorded here to close the question, not to re-open it.
`:16-17`: all LOD-400 systems (spider glass, wood louvres, rattan arch, arched glass) live in
`CurtainPanelFactory`.

### Stack B — the kernel (`packages/geometry-kernel/src/producers/curtainwall.ts`)

`:30-34` `CurtainWallProducer = (cw, joinData, worldY) => BufferGeometryDescriptor`; reads the L0
shape via `@pryzm/protocol` `:17` — **including `panels`, which Stack A never receives (§5 row 15).**
Delegates to `_internal/curtain-wall/`: `buildPanels:24`, `buildMullions:27`, `buildTransoms:28`.
Hash: `composeCurtainWallGeometryHash.ts`. ADR: `ADR-0011-curtain-wall-triage-and-producer-split.md`
(`:13-15`).

### Datum convention — **the two stacks do not share one**

| | Stack A | Stack B |
|---|---|---|
| Wall origin | **NOT MEASURED** as a single site; panel-local geometry is **CENTRE**-datumed — `CurtainPanelFactory.cellRect():174-184`, midpoints `:180-181` | **START endpoint** — `curtainWallBasis():57` `origin: {x: s.x, y: s.y + worldY, z: s.z}` |
| Length | **NOT MEASURED** | XZ-plane only — `:53` `Math.hypot(dx, dz) \|\| 1`; `y` ignored |
| Axis / normal | **NOT MEASURED** | `y` forced to `0` — `:55`, `:56` |
| Vertical datum field | `baseOffset` (`CurtainWallTypes.ts:28`), folded into `worldY` at `CurtainWallBuilder.ts:1092` / `:1799` as `level.elevation + cw.baseOffset` | `worldY` parameter (`:33`) **only** — `baseOffset` occurs **ZERO** times in the whole Stack B curtain-wall set (`producers/curtainwall.ts` + all four `_internal/curtain-wall/*.ts`) |
| Cell indexing | `(0,0)` = bottom-left; `[i]`=U col, `[j]`=V row — `CurtainPanelTypes.ts:137`. Boundary lines at `t=0`/`t=1` always present — `CurtainGridSystem.ts:63-65` | same grid model, `_internal/curtain-wall/` |

> ✅ **MEASURED 2026-08-19 — THEY DO NOT AGREE, AND THE ANSWER IS SHARPER THAN "unreconciled".**
> This read *"Whether `worldY` and `baseOffset` agree: NOT MEASURED. No line reconciling them was
> found."* There is no reconciling line because **Stack B never reads `baseOffset` at all**:
> `grep -c baseOffset` over `producers/curtainwall.ts` and each of
> `_internal/curtain-wall/build{Mullions,Panels,Transoms}.ts` +
> `composeCurtainWallGeometryHash.ts` → **0, 0, 0, 0, 0**. Its **five sibling producers all do** —
> `slab.ts:101`, `column.ts:51`, `structural.ts:46`, `plumbing.ts:70`, `wall.ts:145,:224`, every one
> of them `worldY + <x>.baseOffset`. **Curtain-wall is the only family in `producers/` whose Stack B
> ignores its own vertical datum field**, which is on the L0 schema (`CurtainWall.ts:76`) and on the
> legacy record (`CurtainWallTypes.ts:28`) and is CARRIED end to end everywhere else (§5 row 17).
>
> **The two stacks therefore disagree on BOTH axes, definitely, not merely unmeasured:**
>
> | Axis | Stack A | Stack B | Divergence |
> |---|---|---|---|
> | Horizontal origin | baseline **CENTRE** — `group.position.set(center.x, worldY, center.z)` `CurtainWallBuilder.ts:1326`, `:1856` | **START** endpoint — `curtainWallBasis:57` | half the wall length |
> | Vertical | `level.elevation + cw.baseOffset` | `baseLine[0].y + worldY`, caller-supplied | `baseOffset`, plus a `baseLine.y` Stack A's mirror defaults to `0` (§5 row 10) |
>
> **A spandrel-hung or recessed curtain wall is at the wrong height in Stack B by exactly its
> `baseOffset`.** ⛔ **This is NOT fixed here, deliberately.** `produceCurtainWall` has **zero
> production callers** (only `tests/parity/curtain-wall/cw-snapshot.test.ts:74`,
> `tests/integration/headless-vs-browser-parity.test.ts:154`, `tests/integration/all-12-elements.test.ts:94`),
> so nothing user-visible is served by changing it — while changing it **invalidates all 23
> byte-equality snapshot fixtures**, and CW-G-2 forbids reaching for
> `CURTAIN_WALL_SNAPSHOT_REFRESH=1`. Refreshing to bless a FIX is a different act from refreshing to
> bless a DRIFT, but it is not one to perform in passing on a gate this contract has just declared
> untrustworthy. **The fix and its snapshot consequence are OWED and named in CW-G-3.**

### Are the stacks proven to agree? **NO.**

A parity directory exists — `tests/parity/curtain-wall/` (`cw-snapshot.test.ts`, 23+ fixtures
`cw-01`…`cw-23`, `snapshots/`, `vitest.config.ts`) — and **it is Stack-B-against-itself**, which C84
§8.e names as an anti-pattern:

- `cw-snapshot.test.ts:19` imports **only** `produceCurtainWall` from the kernel.
- `:1-6`: *"Curtain-wall self-snapshot — S13-T7 … first run captures … subsequent runs gate
  byte-equality on every typed array."*
- `:11-13` verbatim: *"This is the kernel-side parity gate; cross-engine PRYZM 1 reference captures
  land in S14 once the PRYZM 1 façade harness is online (see
  `scripts/capture-pryzm1-curtain-wall-references.ts`, **not yet written**)."*
- `:9`/`:27` — `CURTAIN_WALL_SNAPSHOT_REFRESH=1` blesses any drift away with an env var.

**Census of every curtain-wall test in the repo:**
`packages/geometry-curtain-wall/__tests__/CurtainWallBuilderGpuLifetime.test.ts`,
`CurtainWallInstanceManager.matshare.test.ts`,
`packages/geometry-kernel/__tests__/curtain-wall.robustness.test.ts`,
`tests/curtainPanelStoreIndexInvariants.spec.test.ts`, `tests/curtainPanelTypeDrift.spec.test.ts`,
`tests/curtainWallBuilderFastPath.spec.test.ts`, `tests/curtainWallToolStaticImport.spec.test.ts`,
`apps/editor/__tests__/CurtainWallUpdateReachesGeometryStore.test.ts`,
`plugins/curtain-wall/__tests__/*`, `packages/ai-host/__tests__/f111Curtains.test.ts`.
**No file imports both a Stack-A builder and `produceCurtainWall`.**

### TO-BE — normative

- **CW-G-1 (EI-11).** A Stack A ↔ Stack B parity harness is **OWED** — C84 §5 lists the slab, door
  and window harnesses as owed and does not name curtain-wall; this contract adds it. It MUST
  consume [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s declared, unit-qualified tolerance
  (`packages/geometry-kernel/src/tolerance.ts`, shipped 2026-08-13 per L-954) and MUST NOT ship a
  bare call-site `TOL` literal — the mistake the wall harness made (C84 §5).
- **CW-G-2 (C73 §2.5).** `CURTAIN_WALL_SNAPSHOT_REFRESH=1` is a tolerance-widening escape hatch by
  another name. It MUST NOT be used to bless a divergence; a divergence is pinned `it.fails` with a
  §-tag, per C84 §8.f — *"9.774 m is not a tolerance."*
- **CW-G-3.** ✅ **MEASURED AND DECLARED 2026-08-19** (table above). The datum question is answered:
  **START vs CENTRE horizontally, and Stack B ignores `baseOffset` entirely.** ⚠ **CW-G-1 remains
  BLOCKED, and now for a stated reason rather than an unknown one** — *a parity harness built on an
  unreconciled datum measures the datum, not the geometry*, and we now know exactly what it would
  measure: half a wall length plus one `baseOffset`. **The owed work, in order:** (i) make Stack B
  consume `baseOffset` the way its five siblings do; (ii) declare ONE origin convention for the
  family and make both stacks state it; (iii) regenerate the 23 fixtures **as a declared
  behaviour change with its own commit and §-tag**, never via `CURTAIN_WALL_SNAPSHOT_REFRESH=1` on
  an unrelated change (CW-G-2); (iv) only then build CW-G-1.

---

## 11. THE DELTA

Ordered by what the user loses, not by site count.

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** ✅ **CLOSED** | ~~`elementUndoStoreAdapter.ts:289/337-338` flattens index patches; undo writes a **number** into `panels`~~ — **the defect was real and was already fixed when this row was written.** `3689915d` replaced `p.path[1]` with `_resolveFieldValue`/`_applyAtPath` + an explicit §EI-7b refusal; `81e1e9c0` (L-977) added the measured per-store write shape. `CurtainWallStore.update` is a **MERGE** (`:365-370`), so `legacyStoreUpdateSemantics.ts:176-180` is correct | nothing today | C84 **EI-7b** | ✅ **`apps/editor/__tests__/curtainWallPanelUndoDepth.test.ts` (5/5), REAL adapter + REAL store.** ⚠ Could NOT be watched RED — the fix preceded the control. And the assertion this row specified (*"`panels` is still an array"*) was **the wrong expectation**: the legacy record has no `panels`, so the correct outcome is a logged refusal with the field still absent. See §7 CW-U-5n |
| **2** ⛔ **REFUTED — SEE #17** | ~~`curtain-wall.replacePanel` is lineage **L6** … sole authoritative write `:137`~~. Every source observation is correct; **the write never runs.** `ctx.stores['curtainPanelStore']` cannot exist on the bus context, so `canExecute` refuses on **every** dispatch (L-1054) | ~~every panel-type change, unrecoverably~~ — **the user loses the CAPABILITY, not the history**: the panel-type control does nothing at all | C84 **EI-3** / **EI-7a** (offered control, refusing verb) — *not* EI-7 | ✅ `apps/editor/__tests__/CurtainReplacePanelIsDead.test.ts` (3/3) |
| **3** ⚠ **HALF CLOSED** | ~~`panels[]` never crosses the bridge (`CEB:421-429`)~~ — **RETRACTED 2026-08-18: it crosses now** (`CEB:531` reads, `:550` emits, `bd182447`/L-972). It is dropped ONE hop later, at `curtainWallCreatedMirror.ts:147-168`, **and the drop now announces itself** (`:138-144`). It is still never serialised (`ProjectSerializer.ts:644-658`). **The user still loses the same thing; what changed is that the loss is now visible in the console instead of nowhere** | **the façade the user composed** — spandrel bands and door panels reload as uniform glazing | C84 **EI-2(a)**, **EI-6** | round-trip a wall with a `'door'` panel through save/load |
| **4** ✅ **CLOSED (half), ⛔ RETRACTED (half)** | `'curtainPanel'` absent from `optionalStores` — **REAL, and fixed** (`3229704a`, L-1050): four L2 commands declared it, two of them *only* it, so their whole snapshot was `{}`. ~~`'curtainWall'` ≠ `'curtainwall'`~~ — **RETRACTED as a live defect**: `createSnapshot` has one call site (`CommandManagerImpl.ts:286`), it takes an L2 `Command`, and all 9 curtain-wall L2 commands spell it camelCase. The lowercase spelling is the **bus**'s and never reaches it | **the rollback that was promised**, for the `curtainPanel` half only | C84 **EI-7d** · L-953. The spelling stays an **EI-1a/EI-8 hazard** in §1 CW-ID-2, not a rollback defect | `check-affected-stores.ts` (C84 §5) — still owed |
| **5** ✅ **CLOSED** | `migrateToGridSystem` minted `crypto.randomUUID()` on **ELEVEN** `??` call sites, not nine — and the two uncounted ones (`CurtainGridEditor.ts:52`, `CurtainPanelEditor.ts:54`) were the UI's own side, i.e. exactly where the cost landed. Ids are now derived from wall id + axis + index (`derivedGridLineId`), and an unusable spacing falls back to ONE bay instead of to an invalid empty grid | **the grid-line delete button** — on any wall with no stored `gridSystem` the `×` matched nothing, removed nothing, and reported success | [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) | ✅ `plugins/curtain-wall/__tests__/handlers/GridLineIdentity.test.ts` (5/5) — REAL bus, REAL handlers, REAL DTO store (`ab8b4248`, L-1051) |
| **6** | Nine of thirteen `PanelType` members have no `PanelKind`; `ReplacePanel.ts:77-79` names three | **ten panel systems** the tool builds and nothing can save | C84 **EI-3**, **EI-9** | enumerate both unions in one test |
| **7** ⚠ **SAME DEFECT AS #19, NOT A SEPARATE ONE** | `hostedDoor`'s six fields (`CurtainPanelTypes.ts:89-105`) reach no schema, no bridge, no serialiser — **because they live ONLY on `CurtainPanelData`, in the store that is never written** (L-1057). Fixing panel persistence fixes this row; nothing else needs to | **hinge side, swing, sill, both colours** of a curtain-wall door | C84 **EI-2**, **EI-6** | ✅ measured — arm 3 of `CurtainPanelAuthoringIsNotPersisted.test.ts` |
| **8** | `curtainwall` is outside `restoreWallAudit`'s `wall\|door\|window` gate (`UpdateElementParameterCommand.ts:410-414`) | audit comparability — the model is not the same model across an undo | [ADR-0319 §2](../adrs/) · **L-952** | undo a parameter change, assert `metadata.version` byte-equal |
| **9** ✅ **CLOSED, AND IT WAS FAR LARGER THAN THIS ROW** | `material-bridge.ts` parsed a key layout **NOTHING MINTS**. The slot is at index **1** (the producers write `curtainwall｜mullion｜…`, `curtainwall｜panel｜<kind>｜…`); the bridge read index 4, so the `'glazed'` fallthrough fired for **every key of every kind** — **every mullion and transom was built as translucent glass**, and every spandrel/door/opaque panel as glazing. `parts[2]` is the panel's **KIND**, so the unread segment was the whole point of the vocabulary | **the entire material read of the Stack B path** — and CW-B-2's symptom by a second route | C84 **EI-2(a)**, **EI-8**, **EI-9** | ✅ `plugins/curtain-wall/__tests__/committer/MaterialKeyRoundTrip.test.ts` (11/11) — imports the three REAL composers, an EXECUTED equivalence proof (`c229d392`, L-1053). ⚠ Does **not** fix walls: 18 separate files, separate formats |
| **10** | No Stack A ↔ Stack B parity; `tests/parity/curtain-wall/cw-snapshot.test.ts:19` compares Stack B to itself | nothing today — but every future kernel divergence ships unseen | C84 **EI-11**, **§8.e** | build CW-G-1 |
| **11** ⛔ **REFUTED** | ~~`ReplacePanel.ts:131-132` names a cascade subscriber that **was not located**~~ — **it exists**, at `apps/editor/src/engine/initUI.ts:2263-2287` (§MI-02). The census missed it because the comment named the wrong **mechanism** (`CurtainPanelStore.subscribe()`, not `storeEventBus`) and the wrong **file** (`initUI.ts`, not `EngineBootstrap`), so the searched string `'curtain-panel'` never appears at the subscription site | nothing — the cascade is real. (It is unreachable *from this verb* for the separate reason in #17) | C84 **EI-12**, discharged | ✅ dispatcher named with its call site (`648b443d`, L-1055). ⭐ **An EI-12 census must enumerate a store's emission surfaces FROM THE STORE, not from a comment citing one of them** |
| **12** | Ten `elementType` spellings (§1); `EdgeProjectorService.ts:2389-2394` matches one | plan-view fidelity for sub-parts | C84 **§4E** + [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) | declare one tag + `role`/`parentId` sub-parts |
| **13** | `gridSystem` written through `(cw as any)` (`AddCurtainGridLine.ts:90`, `RemoveCurtainGridLine.ts:98`) | type safety on the one field that survives undo correctly | C84 **EI-2(c)** | declare it in the L0 schema; remove both casts |
| **14** ⛔ **REFUTED** | ~~`CurtainWallStore.add()` does not emit~~ — **it does.** `add()` (`CurtainWallStore.ts:322-350`) ends in `this.emit(...)`, and `emit()` (`:399-411`) calls `storeEventBus.emit({elementType:'curtainwall', operation:'create'})`. The `initTools` comment asserting otherwise was the source of this row, and it is now corrected in place | nothing — CW-C-2's invariant was **already held**, so a second caller was already safe. The residue is a **DUPLICATE** event: every mirrored wall fires two plan invalidations | — (CW-C-2, satisfied) | Left in place and DECLARED, not quietly removed: deleting it reorders subscribers relative to the panel-storm events fired synchronously inside `add()`, and this bridge is reachable from no suite. **A behaviour change that cannot be watched is not one to make in passing.** L-1056 |
| **15** ✅ **CLOSED** | ~~**A COPIED curtain wall was minted at the origin with default bays, silently.**~~ `CopyPlanToolHandler._copyCurtainWall` dispatched `curtain-wall.create` with `start`, `end`, `gridXSpacing`, `gridYSpacing` — **`CreateCurtainWallPayload` accepts NONE of the four**, so every copy landed at the L0 default baseLine `(0,0,0)→(4,0,0)` with default spacings, wherever the original stood, **with no error at all**. [L-978](../../04-reference/ISSUE-LOG.md) | **the copy** — position, extent and grid, all four | C84 **EI-2(a)**, **EI-3** | ✅ **CLOSED `9f14b795`.** The mapping moved to `apps/editor/src/engine/views/plantools/copyPayloads.ts` as a value a test can execute, and is pinned by `apps/editor/__tests__/CopiedElementKeepsPlaceAndProperties.test.ts`. **The lesson generalises past this family: a payload built behind a two-click canvas gesture is a payload no suite can reach** — the same reachability gap that hid L-972 in this very bridge |

| **16** ✅ **CLOSED — NEW, and it sat underneath #5** | `AddCurtainGridLine.ts` / `RemoveCurtainGridLine.ts` read `(cw as any).gridXSpacing` / `.gridYSpacing` off `ctx.stores.curtainwall[id]` — the **L0-parsed** DTO record, whose spacing fields are `bayWidth` / `bayHeight` (`CurtainWall.ts:91,93`). Both reads were `undefined` on **every** execution; `Math.max(1, NaN)` is `NaN`; the loops never ran; the migration returned `{uLines: [], vLines: []}` — **below the module's own ≥2-lines invariant**. The `as any` at both sites is what blinded `tsc`. **The SEVENTH constant-undefined read of this class in this one family** (L-972 found six in the create bridge) | **the grid** — and via the 2-segment undo path, that empty grid reaches the AUTHORITATIVE legacy record, which `CurtainWallBuilder` reads as truthy and turns into **zero cells** | C84 **EI-2(b)**, **EI-2(c)** | ✅ `GridLineIdentity.test.ts` asserts `rec.gridXSpacing` is `undefined` on the record the handler is handed — an in-file negative control (`ab8b4248`, L-1052). ⚠ **C87 §6 listed these two verbs as "works today". That was measured on the PATH, not on the VALUE.** |
| **17** ⚠ **OPEN — NEW, and it replaces #2** | `curtain-wall.replacePanel` resolves `ctx.stores['curtainPanelStore']`, a key that **cannot exist**: `ctx.stores` is `storesAsRecordView(stores)` (`bootstrap.ts:94,148-159`), `stores` is filled only by `stores[plugin.storeKey]` over `ALL_PLUGINS` (`bootstrap.everything.ts:145`), no descriptor declares it, `composeRuntime.ts:889` passes no override, and `CommandBus.buildContext:285-293` never falls back to a global (ADR-002 §3). **And two production panels still offer it** — `CurtainPanelEditor.ts:250`, `CurtainSubElementPanel.ts:319` — plus chat (`ChatCommandClassification.ts:109`) | **changing a curtain-wall panel's type**, entirely. The reason surfaces only as a `console.warn` naming an internal variable | C84 **EI-3** / **EI-7a** — the offered control, which is the half C16 CA-18 does not reach | ✅ pinned (3/3). ⛔ **THE FIX IS A ROUTING DECISION AND IS OWED.** CW-P-2's exits: (a) route the write per C16 **CA-17** — the L2 `ReplacePanelTypeCommand` **does** receive a real `context.stores.curtainPanelStore` (`types.ts:467`) and now snapshots correctly (#4), so repointing the two panels at it is the short path — or (b) disable the controls while the verb refuses |
| **18** ⚠ **OPEN — NEW** | Stack B ignores `baseOffset` entirely: **0** occurrences across `producers/curtainwall.ts` and all four `_internal/curtain-wall/*.ts`, while its five sibling producers (`slab`, `column`, `structural`, `plumbing`, `wall`) all compute `worldY + <x>.baseOffset`. Stack A folds it in at `CurtainWallBuilder.ts:1092`. The stacks also disagree on horizontal origin (CENTRE vs START) | a spandrel-hung or recessed curtain wall is at the **wrong height** in any Stack B consumer, by exactly its `baseOffset` | [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md), C84 **EI-11** | ⛔ **deliberately NOT fixed here.** `produceCurtainWall` has **zero production callers**, and changing it invalidates all 23 byte-equality fixtures — which CW-G-2 forbids blessing casually. Fix + fixture regeneration owed as its own commit; **it blocks CW-G-1 (#10)** |

| **19** ⛔ **OPEN — NEW, AND IT IS CW-B-2's ACTUAL ROOT** | `CurtainPanelStore`, the declared AUTHORITY for panels (§2), is **never persisted and never loaded**: zero matches for `curtainpanel`/`curtainPanelStore` in **both** LIVE persistence files, and `ProjectStores` (`ProjectSerializer.ts:804`) has no member for it. On reload `CurtainPanelSyncHandler` regenerates every cell as `SystemPanel_Glass`, producing a **plausible uniformly-glazed façade with the right cell count** — which is why it was never reported | **every per-panel decision the user made**: panel type (all 13 kinds), `materialOverride`, and all six `hostedDoor` fields. Destroyed on save, with no error | C84 **EI-6** — *"the most severe defect this contract governs"* — the same shape as `lighting`, second family. ⚠ **C84 §4 grades curtain-wall EI-6 `✅`** | ✅ `packages/geometry-curtain-wall/__tests__/CurtainPanelAuthoringIsNotPersisted.test.ts` (3/3). ⛔ **NOT FIXED — file-format change**: a `curtainPanels` snapshot array, a load step seeding the store BEFORE the sync handler regenerates, and a C05 `SNAPSHOT_SCHEMA_VERSION` decision. Touches two files every family shares |

⚠ **Non-regression note on #1.** The 2-segment `gridSystem` path (`addGridLine`/`removeGridLine`)
**works today**. Any change to `elementUndoStoreAdapter.ts:287-339` MUST be proven not to move it —
pin the working case first, watched RED against a deliberately broken adapter, before touching the
eight failing ones. This is the [L-955](../../04-reference/ISSUE-LOG.md) discipline applied here.

---

## 12. REFUSALS — what this family deliberately does NOT support

A refusal is a correct answer. An undocumented one is not.

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `curtain-wall.setMaterial` refuses **unconditionally** after payload validation | `SetCurtainWallMaterial.ts:85`; reason `:56-57`; rationale `:28-54` | ✅ **CORRECT AND REQUIRED** under [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) / `CA-DOCTRINE-A`. ⛔ MUST NOT be "fixed" by restoring silent success. The residual defect is the still-offered control (C82) |
| **R-2** | `materialColor` is *"accepted for uniform shape but not applied"* | `SetCurtainWallMaterial.ts:97` | ⚠ **A DECLARED NO-OP, NOT A REFUSAL.** Accepting a field and discarding it is EI-2(a). Either apply it or reject the payload |
| **R-3** | `RemoveCurtainGridLine` refuses to remove a boundary line or the last interior line | `RemoveCurtainGridLine.ts:65, :68, :71` | ✅ correct — the grid invariant `CurtainGridSystem.ts:63-65` (≥2 uLines, ≥2 vLines) |
| **R-4** | `ReplacePanel` refuses an invalid `PanelType` | `ReplacePanel.ts:74-80` | ✅ **CORRECT AND NOW COMPLETE** (`648b443d`) — the message is generated from `VALID_PANEL_TYPES`, so all thirteen members are named. It previously listed three (CW-Voc-3). ⚠ **But the verb refuses for an entirely different reason FIRST** — see §11 #17: `curtainPanelStore` is not on the context, so no dispatch ever reaches this check |
| **R-5** | `AddPanel` throws typed errors rather than returning `success` | `AddPanel.ts:81, :86, :88` | ✅ correct |
| **R-6** | The bake worker does **not** build curtain walls | `HeadlessBakeSession` handles `wall` only | ⚠ **UNDECLARED.** Not a refusal — an absence. It MUST be declared: a self-host bake of a glazed façade silently omits the façade |
| **R-7** | No whole-curtain-wall **rotate** verb; no **colour** verb distinct from `setMaterial` | §6 | ⚠ **UNDECLARED ABSENCES.** Each MUST be declared here as deliberate, or minted. ⛔ **The third item, "no level-change verb", was REMOVED 2026-08-19: `curtainWall.changeLevel` exists** (`5420ee55`). It is now a spelling question, not an absence — see §6 |
| **R-8** | The ten `<kind>.delete` bus verbs are **DORMANT, not broken** | C84 §3.5.3 | ✅ ⛔ **Do not delete them** — they are the PRYZM 3 target vocabulary |
| **R-9** | Curtain-wall has no Stack B **editor** render path | C84 §4D — `bootstrapRenderEverything` unreachable, `main.ts:407` passes `canvas: null` | ✅ declared. ⛔ Nothing in `geometry-kernel/src/producers/` may be deleted as dead — ADR-0331 §D5 is an **open founder question** (C84 §9) |

### Explicitly NOT REFUSED, and that is the finding

> ⛔ **REWRITTEN 2026-08-19 — the paragraph below said *"each of the eight corrupting verbs ought to
> refuse today, and none does"*. The adapter now refuses (§7 CW-U-1), so the sentence describes a
> state that no longer exists.** Kept, because the replacement is not milder — it is worse in a way
> the original could not see.

**The finding is now the inverse, and it is sharper.** Three of this family's most user-visible
verbs *do* execute and report `success: true` while changing **nothing the user can see**, and no
two of them for the same reason: `curtain-wall.replacePanel` refuses before touching anything
because its store key does not exist (§11 #17); `curtain-wall.addGridLine` / `removeGridLine` wrote
a grid computed from fields the record does not carry (§11 #16); and the Stack B material read
answered `'glazed'` for every key ever minted (§11 #9). Under C84's governing sentence —
`WallRake.ts:50-62`, *"no affordance without an implementation… A refusal is a correct answer; a
silently-wrong wall is not"* — **a verb that refuses in a log while its control stays lit is a
refusal the user never receives, and that is not the correct answer C84 has in mind.** That, and not
the missing gate, is why C87 is CANONICAL rather than aspirational.

---

---

## 13. THE FOUNDER'S SPECIFICATION — NORMATIVE TO-BE (2026-08-19)

- **Status**: NORMATIVE. Written **before** implementation, so each piece is measured against
  something rather than described after the fact.
- **Source**: founder request, 2026-08-19, relayed verbatim in substance. Nothing below is inferred
  from it silently — where the request is under-specified this section says **DECISION OWED** and
  names who owes it.
- **Constrained by**: [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md) (persistence) ·
  [C15](C15-HOSTED-ELEMENT-CONTRACT.md) (hosting) · [C16](C16-COMMAND-AUTHORING-PROTOCOL.md)
  (CA-17/CA-18/CA-21) · [C67](C67-RAC-CAPABILITY-CONTROL-PLANE.md) (RAC) ·
  [C69](C69-WIRE-PROTOCOL.md) §1.1 (verb names are wire identifiers) ·
  [C83](C83-CROSS-ELEMENT-CASCADES.md) §5.5 (the wall move cascade) · C84 EI-2/EI-3/EI-6/EI-8/EI-9.

> ### 13.0 — THE ORDERING CONSTRAINT, AND WHY IT IS NOT NEGOTIABLE
>
> **Every headline item in this specification is a PER-PANEL AUTHORED ATTRIBUTE**: panel type per
> cell, material per cell, finish per cell, offset-from-centreline per cell, a door in a *specific*
> cell. **[§11 #19 / L-1057](#) establishes that the store those attributes live in is never
> persisted and never loaded**, and that the loss hides because panels are regenerated as
> `SystemPanel_Glass`, returning a plausible façade with the correct cell count.
>
> **Building any of CW-1…CW-5 before L-1057 is closed ships the false-success family deliberately:**
> the user authors a façade, saves, reloads, and gets uniform glass with no error. **Persistence is
> therefore step one, and it is a precondition, not a parallel workstream.**
>
> The second precondition is **the vocabulary** (§13.2). CW-2 asks for *"a dropdown of all possible
> panels"*. §9 measures **three incompatible panel vocabularies** and **nine of thirteen `PanelType`
> members with no `PanelKind`**. A dropdown built on that offers the user values the pipeline cannot
> carry — **C84 EI-3, an affordance without an implementation**, minted knowingly. **Unify first,
> surface second.**

### 13.1 — CW-P (PREREQUISITE): panel authoring MUST round-trip, as SPARSE OVERRIDES

> **DECIDED — [L-1035](../../04-reference/ISSUE-LOG.md) (`e2fe2b8d`). Persist only the panels that
> DIVERGE from what the grid would generate.** A panel with no authored attribute is not written at
> all; it is regenerated from its type's defaults on load. The tables are in L-1035 and are not
> restated here. The founder's constraint was explicit — *"it needs to be well performanced"* — and
> the decision is recorded with its argument because a decision without one gets re-litigated.

**The argument that carries it, and it is the one worth remembering:** *this design turns today's
failure mechanism into the load path.* L-1057 hides **because** panels are already silently
regenerated on load — that is exactly why a reload returns the right cell count and a plausible
façade. **Regeneration is not the bug; the absence of anything to re-apply on top of it is.** So the
mechanism that already works is kept and the missing layer added, rather than a working mechanism
being replaced by a heavier one.

It is also what the model already commits to. The grid is a **pure function** of
`(baseLine, height, bayWidth, bayHeight, gridSystem)`. Persisting every derived cell stores a
function's *output* beside its *inputs*, so a save can contradict its own model — the same disease as
the denormalised `levelName` / `levelElevation` copies that go stale on a level move.

- **CW-P-A.** The authored **delta** of `CurtainPanelStore` MUST survive save/load. A panel is
  *authored* iff any of: `panelType !== 'SystemPanel_Glass'`, `materialOverride !== undefined`,
  `hostedDoor !== undefined`, or (once CW-2 lands) a non-default `offsetFromCentreline`. Everything
  else is derived and MUST NOT be written.
- **CW-P-B — KEY ON THE BOUNDING GRID-LINE PAIR (`uLineId`, `vLineId`), NEVER ON `(row, col)`.**
  Row/column indices shift the moment an unrelated grid line is inserted, which would silently
  re-target every override downstream of the insertion. **A door quietly moving to the wrong cell is
  worse than losing it.** `gridSystem` is already serialised (`ProjectSerializer.ts:655`), so line
  identity already has a home in the file.
- **CW-P-C — RE-APPLY AFTER REGENERATION, BY CELL RESOLUTION.** The loader MUST NOT insert panel
  records directly. `CurtainWallStore.add()` synchronously drives `CurtainPanelSyncHandler`, which
  mints a panel per cell with a deterministic id (`${cwId}::${i}:${j}`) and **skips cells that
  already have one**. The restore therefore runs **after** the wall exists, resolves each override's
  `(uLineId, vLineId)` back to a cell, and **updates** the regenerated panel there.
- **CW-P-D — THE ONE REFUSAL THIS DESIGN OWES.** On load, an override whose bounding lines no longer
  exist — because the grid was edited between save and load — **MUST be reported by name, never
  silently dropped** (C84 EI-6: absence must be loud). The acceptance criterion is a report naming
  the wall and the lost override; **a silent `catch` is not acceptable and is the single place this
  design can lose data.**
- **CW-P-E — NO SCHEMA BUMP, AND THE REASON IS MEASURED, NOT ASSUMED.**
  > ⚠ **The instruction that spawned this work named `packages/file-format/src/migrations/index.ts`
  > and a `toVersion === fromVersion + 1` step. That is the WRONG framework for this change, and
  > following it would have produced a migration nothing runs.** There are **two** version axes:
  > - `PRYZM_FORMAT_SCHEMA_VERSION = 1` (`packages/file-format/src/types.ts:28`) — the `.pryzm`
  >   **ZIP** format, migrated by `file-format/src/migrations/index.ts`, whose only registered step
  >   is the v0→v1 `MigrationStubError`;
  > - `SNAPSHOT_SCHEMA_VERSION = 5` (`ProjectSerializer.ts:103`) — the **ProjectSnapshot JSON** the
  >   live serializer/loader pair actually reads and writes, migrated by a **different** engine,
  >   `apps/editor/src/engine/persistence/MigrationEngine.ts`, with steps 1…5.
  >
  > L-1057 lives entirely in the **second**, and within it the governing precedent is already in the
  > file: **`§PERSIST-LIGHTING` added `snapshot.lighting` as an ADDITIVE OPTIONAL ARRAY with no bump
  > and no migration step** (`MIGRATIONS[5]` is about `lifecycle`, unrelated), and `integrity?`
  > states the rule outright — *"an additive optional field — old builds ignore it, so no
  > file-format bump."*
  >
  > **So `curtainPanels?: CurtainPanelOverride[]` is additive and optional, and a bump would be
  > wrong:** an old snapshot simply lacks the key and falls back to regenerate-from-grid, which IS
  > the current behaviour and is therefore a correct migration by construction. **A version bump
  > with an empty migration step is a lie about compatibility.** A bump becomes REQUIRED the moment
  > the field stops being optional or a reader must reject a file lacking it — neither is true here,
  > and both must be re-checked before CW-2 changes the shape.
- **CW-P-F — WHAT IS EXPLICITLY NOT DECIDED.** **Runtime materialisation is unchanged**: every cell
  still exists in memory for rendering and picking. This is a **storage and load** decision only.
  Whether the *runtime* store should also become sparse is **NOT MEASURED** and MUST NOT be answered
  until panel-store memory has been measured on a real project — the same discipline
  [C66](C66-CONCURRENCY-AND-SCALE.md) applies to capacity claims.

> ### CW-P-G — WHY CW-B-3 IS A PRECONDITION, AND WHY IT IS ALREADY MET
>
> **An override is only sparse if the thing it keys to is STABLE.** With `crypto.randomUUID()` grid
> lines, every override would be orphaned by the next rebuild and this design degrades into exactly
> the data loss it exists to prevent. **CW-B-3 was therefore promoted to step 0 — and it is
> ✅ CLOSED (`ab8b4248`, L-1051):** ids are derived as `derivedGridLineId(ownerId, axis, index)`.
>
> ⚠ **BUT THE STABILITY GUARANTEE IS NARROWER THAN "ids are deterministic", AND THE DIFFERENCE IS
> LOAD-BEARING FOR THIS DESIGN. State it, do not assume it:**
> - Derived ids are **stable under regeneration with the same inputs** — which is C73 §1.1 and is
>   exactly what CW-P-B needs.
> - They are **index-derived, so they are NOT stable under a change of bay spacing.** Re-spacing a
>   wall with no stored `gridSystem` from `bayWidth 1.5` to `0.75` produces a different line count
>   and the derived ids shift.
> - **That is CORRECT, not a hole.** A re-spaced grid has genuinely different cells; an override
>   pinned to a cell that no longer exists must not be silently re-targeted onto a different one.
>   **CW-P-D's refusal is the right answer there, and this is the case it exists for.**
> - The window is also narrow in practice: the moment any grid line is inserted, `gridSystem` becomes
>   PRESENT and is persisted, `migrateToGridSystem` never runs for that wall again, and
>   `insertGridLine` mints a fresh id **only for the new line** while preserving every existing one.
>   **Stored ids win over derived ones for the whole remaining life of the wall.**

### 13.2 — CW-2a (PREREQUISITE): ONE panel vocabulary (C84 EI-8/EI-9)

§9 measures three: L0 `PanelKind` (**4**), geometry `PanelType` (**13**), material-bridge slots
(**6**, now parsed correctly per L-1053). **Four of thirteen survive a round trip.**

- **CW-Voc-5 (NORMATIVE).** `PanelType` (`CurtainPanelTypes.ts:61-74`) is **THE MASTER** — it is what
  the builder, the panel store, the property panel and the refusal message already speak, it is the
  widest, and it is the only one that can express the Phase-3 slat and Phase-4 fabric families.
  `PanelKind` becomes a **pinned projection** of it, generated and tested against the master
  (C84 EI-8a — a comment is not a synchronisation mechanism), **never a hand-written second list.**
- **CW-Voc-6.** The CW-2 dropdown MUST be generated from the master. **It MUST NOT offer a member
  that cannot round-trip**; until a member persists, exports and reloads, it is either absent from
  the dropdown or present-and-disabled with the reason shown. *An enum member the UI can select and
  the pipeline cannot carry is EI-3, and minting one knowingly is worse than inheriting one.*
- **DECISION OWED — the nine.** Either L0 gains the nine missing members (a schema change), or the
  nine are declared session-only and removed from the dropdown. **This is a product decision, not an
  engineering one:** it asks whether spider-glass, louvre and fabric systems are shippable or
  demo-only. C87 states the choice and does not make it.

### 13.3 — CW-1: SUB-ELEMENT SELECTION VIA TAB (Revit behaviour)

> ⚠ **MEASURED FIRST — MOST OF THIS ALREADY EXISTS, AND THE MISSING PART IS SMALLER AND SHARPER
> THAN "build a sub-element selection model".** A census before design (C84 §3.5.1 axis (a)):
> - `PropertyPanel.showElement()` (`:742-775`) already has a **sub-element branch**: it consumes
>   `window.__curtainSubElement`, retargets `state.selectedElementType` to `'curtain-panel'` /
>   `'curtain-mullion'`, and renders `CurtainSubElementPanel` with a "show parent" escape.
> - `CurtainSubElementPanel.ts` already exists and already renders a type picker and a colour
>   override for a panel.
> - `SelectionManager` already writes `window.__curtainSubElement` **on a direct mesh click**.
>
> **So the property panel retargeting the founder asks for is BUILT. What is missing is (a) TAB as
> the cycling gesture, (b) mullions being editable rather than read-only, and (c) the mutation path
> actually reaching a store — see §13.4.**

- **CW-Sel-1.** With a curtain wall selected, **TAB** cycles the *sub-element focus*:
  `wall → panel → mullion → wall`, in a **stable, declared order** (panel order = cell index
  row-major; mullion order = u-lines then v-lines by `t`). The order MUST be derived from the grid,
  never from scene-graph child order, which is build-order-dependent and therefore not stable across
  a rebuild (C73 §1.1 applies to *identity*, not only to vertices).
- **CW-Sel-2.** TAB changes **focus, not the transform target.** The parent wall remains
  `SelectionManager`'s selected object so the gizmo keeps operating on the wall —
  `CurtainSubElementPanel.ts:13-15` already states this invariant and it is retained deliberately.
  **A sub-element is a property-editing focus, not a transformable element**, until CW-8 says
  otherwise.
- **CW-Sel-3 — `window.__curtainSubElement` IS THE WRONG CARRIER AND MUST BE RETIRED.** It is a
  `(window as any)` slot (P4), it is **consumed-and-cleared on read** (`PropertyPanel.ts:754-755`),
  so it is a one-shot message and not state — which means nothing else can ask *"what is focused?"*,
  and TAB needs exactly that. The focus MUST become **addressable state** with an explicit
  `{ hostId, kind: 'panel'|'mullion', ref }` shape. ⛔ This is the real architectural work in CW-1,
  and it is **not** "SelectionManager cannot hold a sub-element identity" — it is that the identity
  it holds is a self-erasing global.
- **CW-Sel-4 (BINDING, from L-1002).** `SelectionManager` freed GPU resources inside the click
  handler (L-1002, fixed by GL1). **No work may be added inside the click handler by this lane.**
  TAB handling and focus resolution belong outside it; the grid-derived order is computed from the
  store, not by traversing the scene.

### 13.4 — CW-2: PANEL INSTANCE ATTRIBUTES

Type · material · finish · **offset from centreline**.

- **CW-Attr-1.** `offsetFromCentreline` is a **new authored field on `CurtainPanelData`**, signed,
  metres, default `0`, measured along the panel's own outward normal. It MUST be: on the panel
  record; in the CW-P-B authored-delta test; consumed by `CurtainPanelFactory` when it places the
  panel rect; and carried by the RAC capability. **A field that renders but does not persist is
  L-1057 repeated with a new name.**
- **CW-Attr-2 — "material" and "finish" are TWO axes and MUST NOT be collapsed.** C84 EI-8's warning
  is explicit: `materialName` *"carries roughness / metalness / transparency"* and collapsing it to a
  hex **loses information**. `materialOverride` (existing) is the render tint; a *finish* is the PBR
  material. The panel needs both, named differently, or one of them declared absent.
- **CW-Attr-3.** Every attribute added here MUST have a declared destination at every hop
  (C84 EI-2) — record, serialiser, loader restore, builder read, RAC capability — **stated in §5's
  table before the field is added**, not after.

### 13.5 — CW-3: CURTAIN-WALL DOORS

The six `hostedDoor` fields exist (`CurtainPanelTypes.ts:89-105`) and reach **no schema, no bridge,
no serialiser** (§11 #7 — which L-1057 shows is the *same* defect, not a second one).

- ⛔ **CW-Door-1 — THE HOSTING QUESTION MUST BE ANSWERED BEFORE ANY CODE, AND C87 MAY NOT ANSWER IT
  ALONE.** [C15 §1](C15-HOSTED-ELEMENT-CONTRACT.md) defines the host as *"the `Wall` entity (in
  `WallStore`) that contains the hosted element in its `openings[]` array"*, and **C15 §2** states a
  hosted element *"has no independent world-space coordinate in the store"*. **A curtain-wall door is
  hosted by a PANEL, not by a wall.** A panel is not a `Wall`, has no `openings[]`, and its own
  position is derived from its cell. So one of exactly two things is true, and **C87 must not pick
  silently** (C84 EI-9 — one answer per question):
  - **(a) C15's host semantics generalise**, and C15 is amended so a host is *"the entity whose
    record contains the hosted element"* — `wall.openings[]` and `panel.hostedDoor` being two
    instances of one rule; **or**
  - **(b) this is a genuinely different relationship** — a panel is *replaced by* a door rather than
    *perforated by* one — and it needs its own contract clause, because `SystemPanel_Door` is a panel
    **type**, not an opening cut into a panel.
  > **The measured evidence favours (b):** there is no opening, no cut, and no second element — the
  > cell's panel simply *is* a door. **But (b) means a curtain-wall door is not a `door` for C86's
  > purposes**, and every consumer that enumerates doors (schedules, IFC, the door property panel)
  > must be told which answer holds. **DECISION OWED — founder/orchestrator, and it blocks CW-3.**
- **CW-Door-2.** Whichever answer holds, the six fields MUST round-trip (CW-P) and the door MUST be
  visible to **IFC export** or its absence declared. Today `CurtainWallReader.ts` reads store (3)
  only, so a curtain-wall door is invisible to IFC — **unmeasured until now, and stated here so it is
  not discovered after shipping.**

### 13.6 — CW-4: MULLIONS AS FIRST-CLASS SUB-ELEMENTS

- **CW-Mul-1.** Mullions become selectable (CW-Sel-1) and editable — material, finish, profile size.
  `CurtainSubElementPanel.ts:21` currently declares mullion editing *"Phase 2 (read-only in Phase 1)"*;
  this section is Phase 2 and that line must go.
- **CW-Mul-2 — A MULLION HAS NO RECORD, AND THAT IS THE REAL WORK.** Panels have
  `CurtainPanelStore`; mullions have **nothing** — they are drawn from the grid by
  `CurtainWallBuilder` and stamped `'CurtainWallPart'` (§1). **Per-mullion authored attributes
  therefore have nowhere to live.** Either a mullion store is minted (matching the panel store's
  deterministic-id discipline, keyed by `${cwId}::u:${i}`), or per-mullion authoring is **refused**
  and only per-wall mullion attributes are offered. ⛔ **Do not invent per-mullion state on the scene
  object** — `userData` is not a store, and C84 §4E is the record of what that costs.
- **CW-Mul-3 (BINDING, from L-1053).** Mullion material MUST be proven **end to end** — authored →
  stored → built → rendered — by an executed test. Every mullion was built as translucent glass for
  the life of `material-bridge.ts` because both ends compiled and the fallback was plausible.
  **An assumption about mullion material is exactly the assumption that already failed here.**

### 13.7 — CW-5: RAC FOR ALL OF IT ("always RAC enabled")

- **CW-RAC-1 (C16 CA-21 / C67).** Every capability added MUST prove **V3** — the write reaching the
  **authoritative** store — by **executed read-back**, not by a successful dispatch. RC1's
  measurement stands as the warning: the chat ladder proves V1 RESOLVE and V2 DISPATCH, and V3 is
  gated for **18 verbs of 325**. A curtain-wall capability that proves V2 only is a capability that
  reports success and changes nothing — **the exact family this contract's own verdict names.**
- ⛔ **CW-RAC-2 — THE NAMING PROBLEM IS REAL AND MAY NOT BE PAPERED OVER.** A sub-element capability
  must let a user *name a panel in language*: *"the third panel from the left"*, *"the panel with the
  door"*, *"the top row"*. Cell indices are `[i, j]` from the wall's **start** endpoint, so
  *"from the left"* depends on which way the wall was drawn — **a curtain wall drawn right-to-left
  inverts every ordinal**, and the user has no way to know which way they drew it.
  **NORMATIVE:** a resolver that cannot establish the viewer-relative frame MUST **refuse and say
  so**, naming both readings — never pick one. *A verb that resolves to the wrong cell and reports
  success is strictly worse than a refusal, and this family has already shipped three of those.*
  Ordinal resolution is therefore **gated behind an explicit frame** (a selected wall + a camera
  direction, or an explicit "as seen from outside"), and until that exists the capability accepts
  **cell coordinates and selection references only**.

### 13.8 — CW-6: POLYLINE + ENTER CLOSES THE LOOP

- **CW-Poly-1.** Curtain-wall polyline drawing MUST close on **ENTER** the way wall does.
  ⛔ **Reuse wall's closure rule; do not write a second one** (C84 EI-9). `CurtainWallDrawingMode`
  already declares `POLYLINE` and `ORTHO` (`CurtainWallTypes.ts:16`), so the mode vocabulary exists —
  **what must be measured before implementing is whether wall's closure lives in a reusable function
  or inside its tool handler's closure**, because the second case is the `initTools` lesson (L-972)
  and the answer is to extract it, not to copy it.
- **CW-Poly-2.** A closed loop MUST produce walls that **join**, not merely walls that touch —
  otherwise CW-7 has no watertight region to trace.

### 13.9 — CW-7: SLAB-BY-REGION INSIDE A CURTAIN WALL

- **CW-Region-1.** `SlabPlanToolHandler`'s `§REGION-HOST-ATTRIBUTION` edge set MUST include curtain
  walls, so a click inside a curtain-wall enclosure produces a region slab exactly as it does for
  walls.
- ⚠ **CW-Region-2 (BINDING).** **L-1030 is open: the region slab works in plan and silently does
  nothing in 3-D.** Adding curtain walls to the edge set while that holds **multiplies a silent
  failure across a second family.** CW-7 MUST NOT be marked done until the 3-D half is proven for
  the curtain-wall case, and **a region trace that cannot attribute a host MUST refuse rather than
  claim one** (C84 EI-2).

### 13.10 — CW-8: MOVE → PROPAGATE → RECOMPUTE

- **CW-Move-1.** ⛔ **FOLLOW THE WALL PATH; DO NOT FORK A SECOND CASCADE.** WM1's finished work —
  `§L-921-ATOMIC-GESTURE`, `CascadeWallBaselineCommand`, [C83 §5.5](C83-CROSS-ELEMENT-CASCADES.md) —
  is the shape. A second cascade engine for curtain walls is C84 EI-9 at its most expensive.
- **CW-Move-2.** `curtain-wall.move` today mutates `baseLine` points in place (`MoveCurtainWall.ts:48-50`)
  and propagates nothing. Under MOVE → PROPAGATE → RECOMPUTE it must: move the baseline, propagate to
  dependents (panels re-cell, hosted doors follow, any region slab bounded by it re-traces), and
  recompute geometry — **as one atomic gesture with one undo entry.**
- ⚠ **SCOPE.** Curtain wall is this lane's. **Floors, roofs and ceilings are NOT** — findings there
  are reported for routing, not implemented here.

### 13.11 — TWO DECISIONS THIS SECTION MAKES, AS INSTRUCTED

- **CW-Dec-1 — `curtain-wall.replacePanel` (L6) is declared DEAD, and the UI is repointed.** §11 #17
  measures it refusing on every dispatch. **The two property-panel surfaces MUST dispatch a verb that
  reaches a real store** (C16 **CA-17**, route the write), and the controls stay **enabled** — the
  founder uses them.
  > ⚠ **MEASURED, AND IT CONTRADICTS THE PREMISE OF THE INSTRUCTION — STATED PLAINLY RATHER THAN
  > QUIETLY WORKED AROUND.** The routing instruction assumed the L2 `ReplacePanelTypeCommand` is what
  > the properties panel uses today (*"they say they can swap panels"*). It is not used by anything:
  > `grep -rn "ReplacePanelTypeCommand\|ReplacePanelWithDoorCommand" apps/editor/src packages/ai-host/src`
  > → **three hits, all COMMENTS** (`initUI.ts:2264`, `CurtainSubElementPanel.ts:19`, `:20`), **zero
  > constructions.** `CurtainSubElementPanel.ts:319` and `CurtainPanelEditor.ts:250` both dispatch the
  > **dead bus verb**, and `CommandBus` **throws** on a `canExecute` refusal (`CommandBus.ts:428-431`),
  > so the promise rejects and the button renders **"✗ Failed — check console"**.
  > **Panel swapping does not work today from any surface.** `CurtainSubElementPanel`'s own header
  > (`:19-20`) says it routes through `ReplacePanelTypeCommand`; the code eight lines of scrolling
  > away does not — **the same comment-versus-code divergence that produced L-1054, L-1055 and
  > L-1056, in a fourth place.**
- **CW-Dec-2 — ONE VERB SPELLING: `curtain-wall.*`.** `curtainWall.changeLevel` (camelCase,
  `5420ee55`) is the minority arrival against a registered majority of 21.
  [C69 §1.1](C69-WIRE-PROTOCOL.md) makes a verb name a **wire identifier**, so the correction is an
  **alias**, not a rename: register `curtain-wall.changeLevel` as the canonical type and keep
  `curtainWall.changeLevel` as a **deprecated alias** — the vehicle §FIX-COMMAND-NAMESPACE (L-796)
  already uses for the other 21. ⚠ Coordinate with the lane that landed it; the handler's own
  `:41` comment argues *for* camelCase on the grounds that it matches `wall.changeLevel`, and that
  argument is not silly — **but it makes the FAMILY inconsistent to make the AXIS consistent, and
  C84 EI-8 is a per-concept rule, so the family wins.**

### 13.12 — DELIVERY ORDER (binding)

**(0)** ✅ **CW-B-3 deterministic grid-line ids — CLOSED `ab8b4248` (L-1051)**, promoted to step 0
because a sparse override keyed on an unstable id is the data loss it exists to prevent (CW-P-G) ·
**(1)** CW-P persistence as sparse overrides · **(2)** CW-2a vocabulary · **(3)** CW-Dec-1 routing ·
**(4)** CW-1 selection/TAB · **(5)** CW-2 attributes · **(6)** CW-4 mullions · **(7)** CW-3 doors ·
**(8)** CW-6 polyline close · **(9)** CW-7 region slab · **(10)** CW-8 move/propagate/recompute ·
**(11)** CW-5 RAC across all of it.

Each step is **RED-first** and each carries an executed proof at the layer the user reaches
(§committed-is-not-reachable). **A step is not done because it compiles.**

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances. None may be recorded `✅` until measured (C84 EI-1b).

1. ✅ **CLOSED 2026-08-19 (L-1055).** ~~The `ReplacePanel.ts:131-132` cascade subscriber — searched
   `apps/editor/src` and `engineLauncher.ts`; not found.~~ It is
   `apps/editor/src/engine/initUI.ts:2263-2287`. **It was not found because the search used the
   mechanism the comment named** (`storeEventBus` + `'curtain-panel'`) **and the real subscriber uses
   the store's own `subscribe()` list**, where that string never appears. *"Either it does not exist
   or it lives somewhere not searched"* was the right disjunction; the missing third arm is **or the
   thing you searched for is not the thing that does the work.**
2. ✅ **CLOSED 2026-08-19 — they do NOT agree.** ~~Whether `worldY` and `baseOffset` agree — no
   reconciling line found.~~ There is none because **Stack B never reads `baseOffset`**: 0
   occurrences across `producers/curtainwall.ts` + all four `_internal/curtain-wall/*.ts`, against
   five sibling producers that all consume it. See §10 and §11 #18.
3. ✅ **CLOSED 2026-08-19.** ~~Stack A's wall-origin datum as a single site.~~ It is
   `CurtainWallBuilder.ts:1326` (sync) and `:1856` (async worker path), both
   `group.position.set(center.x, worldY, center.z)` — the baseline **CENTRE** in XZ, with
   `worldY = level.elevation + cw.baseOffset` (`:1092`, `:1799`). Stack B's is the **START**
   endpoint. Two sites, one convention, and it is not Stack B's.
4. **Whether the UI still offers `curtain-wall.setMaterial`** — the EI-3 control census. Owned by
   [C82](C82-RIBBON-CAPABILITY-SURFACE.md).
5. **Whether whole-curtain-wall rotation or level change is offered anywhere** — no verb exists;
   whether a legacy path does was not measured.
6. **`curtain-wall.create-on-all-slabs`** (`affectedStores: [] :35`) — its delegate's write and
   restore sets.
7. **Whether `EdgeProjectorService.ts:2389-2394`'s exclusion of `'CurtainWallPart'` /
   `'CurtainPanel'` is intentional.**
8. **Plan-view store authority** — C84 §9 records this as unmeasured for *every* family; curtain-wall
   is no exception. `plugins/plan-view` injects its own source stores, which may be a third read
   path.
9. **Whether any curtain-wall cross-family cascade exists** (to wall, slab or room).
10. **The `packages/persistence-client/src/loader/` pair** — deliberately not measured; declared DEAD
    (C84 authoring rules).

---

## Appendix A — C87's OWN claims, re-measured 2026-08-19 (lane CW1)

⛔ **Read this table before trusting any row in §11.** Every entry below was a claim C87 stated with
confidence on 2026-08-18, and every one of them was checked by executing something rather than by
reading further. **Six were wrong.** The pattern is not random: *the rows justified by a source
comment were the wrong ones, and the honest blanks in the NOT-MEASURED register were safe.*

| C87's own claim | Basis it rested on | Verdict 2026-08-19 |
|---|---|---|
| THE ONE-LINE VERDICT: *"the only family whose undo actively corrupts the model"* | `elementUndoStoreAdapter.ts:289` read at a point in time | ⛔ **RETRACTED** — fixed by `3689915d`/`81e1e9c0` **before** this contract described it. Cited a defect HEAD did not have |
| §11 #2: `replacePanel`'s L6 write costs *"every panel-type change, unrecoverably"* | the source of `ReplacePanel.ts:137`, plus its header comment *"injected by EngineBootstrap"* | ⛔ **REFUTED** — the header was false, the store key cannot exist, the write never runs. The verb is DEAD and still offered (#17). **Worse, by a different mechanism** |
| §11 #4(b): `'curtainWall'` ≠ `'curtainwall'` voids a rollback | an exact-match string comparison | ⛔ **RETRACTED** — true as a comparison, vacuous as a defect: the one `createSnapshot` call site takes L2 commands, all of which spell it camelCase. **A string match is not a call-site census** |
| §11 #5: nine `??` call sites | a `grep` that missed two | ⚠ **CORRECTED to ELEVEN** — and the two missed (`CurtainGridEditor`, `CurtainPanelEditor`) were the UI's own side, i.e. the entire user-visible cost |
| §11 #9: *"never reads `parts[2]`"* | reading the bridge and believing its header | ⚠ **CONFIRMED AND MASSIVELY UNDERSTATED** — the header's key format is minted by nothing; the slot is at index 1; **every mullion was built as glass** |
| §11 #11: the cascade subscriber *"was NOT LOCATED"* | a grep for the mechanism the comment named | ⛔ **REFUTED** — it is `initUI.ts:2263-2287`. **A search for a NAMED mechanism cannot find the REAL one** |
| §11 #14 / CW-C-2: *"`CurtainWallStore.add()` does not emit"* | a comment in `initTools.ts` asserting it | ⛔ **REFUTED** — `add()` → `this.emit()` → `storeEventBus.emit()`. The invariant CW-C-2 demanded was already held; the real residue is a duplicate event |
| §6: `addGridLine`/`removeGridLine` *"survive the flatten … works today"* | tracing the PATH depth | ⚠ **REFUTED ON THE VALUE** — the path survives and carries an **empty grid** built from `undefined` spacings (#16). *Measuring the path is not measuring the value* |
| §5 rows 15/16 (`panels`, `materialId` DROPPED) | measured | ✅ **CONFIRMED as a loss, ⚠ RE-AIMED as a cause** — the drop is real, and it is **not** why a door panel reloads as glass. See the next row |
| **CW-B-2**: the door panel is lost **at the bridge** | §5's hop-by-hop trace of the CREATE payload | ⚠ **RE-AIMED (L-1057)** — a user authors a door into `CurtainPanelStore`, not into a create payload, and **that store is never persisted or loaded** (0 matches in both LIVE persistence files; `ProjectStores` has no member for it). **Closing rows 15/16 as written would not have delivered the founder's sentence.** C84 EI-6, and C84 §4 grades this family `✅ persists` |
| NOT-MEASURED rows 1, 2, 3 | honestly blank | ✅ **ALL THREE CLOSED**, none of them by discovering the blank was wrong. **The blanks were safe; the confident rows were not** |

> ⭐ **THE TRANSFERABLE LESSON, and it is the reason this appendix exists rather than a silent
> rewrite (C84 §6): every defect above hid behind a TOTAL FALLBACK or a NAMED MECHANISM.**
> A parser whose failure branch returns a plausible value cannot report that it never succeeded
> (#9). A migration whose bad-input branch returns an empty array cannot report that its inputs were
> `undefined` (#16). A census that greps for the mechanism a comment names cannot find the one doing
> the work (#11, NOT-MEASURED #1). **When auditing this family — or any other — measure the VALUE at
> the layer the user reaches, not the PATH, and enumerate a store's surfaces from the STORE.**

---

## Appendix B — C84 claims this contract CONFIRMED, REFINED or REFUTED

| C84 claim | Verdict |
|---|---|
| `curtain-wall` EI-1 authority `✅ legacy` (§4) | **CONFIRMED**, on all six EI-1b consumers |
| per-panel kind/material/rotation "collapsed" at `CEB:421-441` | **CONFIRMED AND SHARPENED** — arm is `:412-443`; `panels` is not collapsed, it is **never read**; `materialId` is dropped too |
| `AddPanel.ts:97` pushes to `c.panels` | **CONFIRMED** verbatim |
| `elementUndoStoreAdapter.ts:289, :337-338` take `field = path[1]` at any depth | **CONFIRMED AS HISTORY, FALSE AS OF HEAD** — re-measured 2026-08-19: `3689915d` replaced both lines. **C84 EI-7b's worked example is now a description of a fixed defect and MUST be re-read as such** — see §7 CW-U-1. The redo direction recorded here was correct and is closed with it |
| same shape in `SetCurtainWallPanelType`, `AddCurtainGridLine`, `RemoveCurtainGridLine` | **REFINED** — `SetCurtainWallPanelType` yes; the two gridline verbs emit **2-segment** paths and **survive**. The real additional victims are `removePanel`, `swapPanel`, `rotatePanel` and `move` |
| `ReplacePanel.ts` is L6, fake literal at `:114-127`, `affectedStores: []` | **CONFIRMED AS SOURCE, REFUTED AS BEHAVIOUR** — every cited line is where C84 says it is, and none of them executes: `ctx.stores['curtainPanelStore']` cannot exist, so `canExecute` refuses first (§11 #17, L-1054). **A lineage audit that reads the write site without resolving the store it writes to grades an unreachable path** |
| `migrateToGridSystem` regenerates a uniform grid | **CONFIRMED AND EXTENDED TWICE** — it also minted fresh UUIDs (C73 §1.1, closed `ab8b4248`), **and** its two bus callers fed it `undefined` spacings so it returned an EMPTY grid (§11 #16, closed). The uniform-grid half stands: it still cannot express a spandrel band |
| `curtainPanel` is a `createSnapshot` hole (EI-7d) | **CONFIRMED** — plus a **new** finding: `'curtainWall'` ≠ `'curtainwall'` |
| `curtain-wall` elementType `NOT MEASURED` (§4E) | **MEASURED HERE** — ten spellings, §1 |
| three `material-bridge.ts` files take `_key` and discard it (EI-8) | **NOT THIS ONE** — `grep _key plugins/curtain-wall/src/` → 0 hits. C84's count is not challenged, only this file's membership |
| `CurtainPanelBuilder` → **STAGE**, no licence needed (§3.5.3, EI-10a) | **CONFIRMED** — `:4-5` façade, `:30` import |
