# C86 — ELEMENT: WALL.OPENING (door · window)

- **Status**: CANONICAL — binding on every PR that touches a hosted wall opening
- **Date**: 2026-08-18
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md). The **twelve mandatory sections** below are
  C84 §6's, in C84 §6's order.
- **Constrained by** — and **[C15](C15-HOSTED-ELEMENT-CONTRACT.md) OUTRANKS C86 ON EVERY QUESTION IT
  ANSWERS.** C15 §1/§2 decide the authority, C15 §8.1 mandates the dual write, C15 §12 freezes the
  casing. C86 does not re-decide any of them; it **measures compliance** and states what C15 does not
  reach. Also: [C03 §4.4/§4.5/§4.6](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C11](C11-ELEMENT-CREATION-PIPELINE.md) · [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) ·
  [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) · [ADR-0319 §2](../adrs/) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) · host wall owned by [C85](C85-ELEMENT-WALL.md)
- **Evidence**: measured in the MAIN worktree on 2026-08-18. Every claim carries `file:line`.
  Unverifiable cells read **NOT MEASURED**. **No cell is blank** (C84 §6).
- **Persistence pair measured**: `apps/editor/src/engine/persistence/` — the **LIVE** one.
  `packages/persistence-client/src/loader/` NOT measured; DEAD (its `doorStore.add`/`windowStore.add`
  at `:472`/`:479` are not built by the app).
- **Reachability axes** (C84 §3.5.1): both were run and are cited per claim.

> **THE ONE-LINE VERDICT — and it NARROWS C84's brief rather than repeating it.**
> The brief this contract was written from said *"nothing measured reconciles them."* **That is
> false, and C84 §4 already carries the correction:** [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md)
> **mandates** the reconciliation in words. What is measured is narrower and worse:
> **the pairing is enforced by a code-review checklist and by no gate; EIGHT command families honour
> it; THIRTEEN more mutate one record and not the other; and ONE live production surface — the 2-D
> plan-view drag — violates it outright.** The split-brain is not *unreconciled*; it is
> **reconciled by review only, on the write path, and not at all on the read path.**

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schemas | `packages/schemas/src/elements/Door.ts:14` — `defineElement('door', {…})`; `packages/schemas/src/elements/Window.ts:14` — `defineElement('window', {…})` |
| Plugin DTO storeKeys | `'door'` — `plugins/door/src/store.ts:25-28`; `'window'` — `plugins/window/src/store.ts:13-16`. Both declared **DETACHED in production** by their own handler barrels: `plugins/door/src/handlers/index.ts:24`, `plugins/window/src/handlers/index.ts:22` (*"silent no-op in production"*) |
| Legacy singletons | `packages/geometry-door/src/DoorStore.ts:224` — `export const doorStore = new DoorStore();`; `packages/geometry-window/src/WindowStore.ts:199` — `export const windowStore = new WindowStore();` |
| **The host record** | `wall.openings[]` — `packages/geometry-wall/src/WallTypes.ts:321`; `Opening` interface `:33-43`; Zod mirror `WallDataSchema.ts:79-85`. Legacy `WindowData` `:45-64`, `DoorData` `:66-73+` also live in `WallTypes.ts` |
| Bus verb namespaces | `door.*` (9 handlers), `window.*` (8 handlers), plus the host verbs `wall.createOpening` and `wall.opening.create` ([C85 §4](C85-ELEMENT-WALL.md)) |
| `createSnapshot` keys | `'door'`, `'window'` — `packages/command-registry/src/CommandManagerImpl.ts:619-620`, rationale `:605-608` |
| `buildUndoStoreMap` | **DELIBERATELY ABSENT** — `apps/editor/src/engine/undo/performUndoRedo.ts:345-351` |

### `userData.elementType` — the casing is FROZEN by C15 §12, and one builder ships both spellings

> ⚠ **RE-MEASURED 2026-08-19 — EVERY WINDOW LINE NUMBER IN THIS TABLE HAD ROTTED, AND THE DOOR
> HALF IS NOW COMPLETE.** C86 recorded `WindowBuilder.ts:308 / :578 / :631`; the file is 1347 lines
> and the sites are **`:376` / `:646` / `:730`**. Register item 1 is CLOSED and the answer is that
> **door does exactly what window does, plus a third tag nobody had recorded.**

| Literal | Producer |
|---|---|
| `'window'` (lowercase) | `packages/geometry-window/src/WindowBuilder.ts:376` |
| `'Window'` (PascalCase — **the canonical one**) | `WindowBuilder.ts:646`, `:730` |
| **`'door'` (lowercase)** | **`packages/geometry-door/src/DoorBuilder.ts:271`; `DoorPlanSymbolBuilder.ts:289`** |
| **`'Door'` (PascalCase — canonical)** | **`DoorBuilder.ts:476`, `:526`; `DoorPlanSymbolBuilder.ts:302`, `:315`, `:330`** |
| **`'DoorLeaf'`** | **`DoorBuilder.ts:526` — `elementType: isLeaf ? 'DoorLeaf' : 'Door'`. A THIRD tag, on a child mesh, recorded nowhere until now. It is the door's analogue of `'WallPart'` (WO-ID-2) and is a legitimate SUB-PART tag, not a rival spelling — but it was undeclared, and a consumer keying on `elementType` sees a value C15 §12 never enumerated** |
| `'window'` (store event) | `WindowStore.ts:50, :75, :106, :115, :179` |
| `'door'` (store event) | `DoorStore.ts` — emit sites recorded in `tools/ga-gate/deterministic-regeneration-baseline.json:66-70` |
| `'door'` / `'window'` (registry) | `ElementTypeRegistry.ts:95, :110`; `SystemIntents.ts:162, :167, :235, :240` |
| `'door'` / `'window'` (command self-tag) | `DeleteElementCommand.ts:337` / `:293` |
| `'WallPart'` | `WallFragmentBuilder.ts:2332` — the solid **around** the void |

[C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`:71` heading, `:78`): the canonical tag is **PascalCase**
(`'Door'`, `'Window'`); consumers MUST normalise via `.toLowerCase()`; **⛔ *"Do NOT change the
stored casing — it is frozen."*** `DeleteElement.ts:51`'s lowercase is that mechanism working as
specified — **not** the accident C84 §4E first read it as.

> ⚠ **MEASURED VIOLATION OF C15 §12: BOTH BUILDERS SHIP BOTH SPELLINGS — not just window.**
> `WindowBuilder.ts:376` emits lowercase `'window'` while `:646`/`:730` emit `'Window'`; **and
> `DoorBuilder.ts:271` emits lowercase `'door'` while `:476`/`:526` emit `'Door'`.** The plan-symbol
> builders repeat the split in both families (`DoorPlanSymbolBuilder.ts:289` lowercase vs `:302`,
> `:315`, `:330` PascalCase). C15 froze **one** spelling. **Four files, two families, one freeze,
> broken identically in all four** — which is the argument that this is a missing gate rather than
> four slips.
>
> ⭐ **AND THE LOWERCASE EMIT IS NOT THE SAME KIND OF SITE IN EITHER FILE.** `DoorBuilder.ts:271`
> and `WindowBuilder.ts:376` are inside the **visibility/view-definition subscription** (guarded at
> `DoorBuilder.ts:252` / `WindowBuilder.ts:357` by `e.elementType !== 'view-definition'`), not the
> mesh-stamping path — `DoorBuilder.ts:473` names `:476` *"canonical 'Door' elementType case for both
> root group and child meshes"* and `WindowBuilder.ts:643` says the same. So the mesh `userData` a
> consumer picks or exports is **already the canonical PascalCase**; the lowercase pair is an
> internal event tag. **That downgrades the severity and does NOT clear it** — one spelling was
> frozen, and a reader cannot tell the two site classes apart without opening both files, which is
> exactly what a frozen vocabulary exists to prevent. Nothing is broken today because every comparing
> consumer lowercases (measured again at `GLBExporter.ts:217`, `DeleteElement.ts:51`).

### ⛔ `'opening'` HAS NO MESH PRODUCER — CONFIRMED, and the finding is sharper than C84 §4E states

A repo-wide grep for `elementType: 'opening'` / `elementType = 'opening'` returns **exactly three
hits, all in one file, all storeEventBus — none is mesh `userData`**:
`packages/core-app-model/src/stores/OpeningStore.ts:29` (create), `:37` (delete), `:48` (update).
`WallFragmentBuilder.ts` stamps `'WallPart'` (`:2332`); its only `opening` tokens are
`wallGroup.userData.openings = wall.openings ?? []` (`:966`) and a lookup `:835`.

> ⭐ **AND THE CONSUMER OF THAT LITERAL BELONGS TO A DIFFERENT FAMILY ENTIRELY.**
> `plugins/view/src/handlers/DeleteElement.ts:51-53`:
> ```
> 51:  const elementType = (cmd.elementType ?? '').toLowerCase();
> 52:  if (elementType === 'opening') {
> 53:    cm.execute(new DeleteOpeningCommand(cmd.elementId));
> ```
> `DeleteOpeningCommand` is the **SLAB** opening command
> (`packages/command-registry/src/slabs/DeleteOpeningCommand.ts:45, :51, :63, :80` — all
> `openingStore.*`). **`OpeningStore` is the SLAB and ROOF hole store** (`getByHostId` `:59-61`;
> `slabs/CreateOpeningCommand.ts:42`, `roofs/CreateRoofOpeningCommand.ts:8`), owned by
> [C92](C92-ELEMENT-SLAB.md) and [C90](C90-ELEMENT-ROOF.md). **Zero door/window code reads it**
> (both axes measured). **The word "opening" names two unrelated things in this repo, and the delete
> router picks the other one.**

### TO-BE — normative

- **WO-ID-1.** The canonical tags are **`'Door'`** and **`'Window'`**, PascalCase, frozen by C15 §12,
  compared case-insensitively. `WindowBuilder.ts:308`'s lowercase emit MUST be corrected to
  `'Window'` — **the freeze is C15's, and C86 enforces it, it does not re-decide it.**
- **WO-ID-2.** `'WallPart'` is a host **sub-part**, not an opening tag ([C85 §1](C85-ELEMENT-WALL.md)).
- **WO-ID-3 (EI-9).** The word **`opening`** MUST be disambiguated. `wall.openings[]` (hosted
  door/window) and `OpeningStore` (slab/roof holes) are different concepts sharing one word, and
  `DeleteElement.ts:52` routes on the ambiguous literal. **Rename one, or gate the router on the
  host's family.** This is the same class as [C92 §9 SL-Voc-3](C92-ELEMENT-SLAB.md) — *two orthogonal
  concepts sharing one word* — and it has already produced a mis-route.

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. **FOUR records for one door.**

| # | Representation | File:line | Fields |
|---|---|---|---|
| 1 | **L0 `Door`** | `packages/schemas/src/elements/Door.ts:14` | `provenance:30`, `confidence:46`, `wallId:48`, `openingId:50`, `doorType:51`, `width:52`, `height:53`, `sillHeight:54`, `offset:56`, `frameThickness:57`, `frameWidth:58`, `frameColor:59`, `leafColor:60`, `fireRating:61`, `accessibilityType:62`, `swing:67-69`; refine `:70-73` (`frameWidth*2 <= width`) + BaseNode |
| 1b | **L0 `Window`** | `packages/schemas/src/elements/Window.ts:14` | `provenance:30`, `confidence:46`, `wallId:48`, `openingId:49`, `windowType:50`, `width:51`, `height:52`, `sillHeight:53`, `offset:54`, `frameThickness:55`, `frameWidth:56`, `frameColor:57`, `fireRating:58`; refine `:59-62`. **No `swing`, no `leafColor`, no `accessibilityType`** |
| 2 | **Plugin DTO stores** | `plugins/door/src/store.ts:25-28`, `plugins/window/src/store.ts:13-16` | as (1); **DETACHED in production** by their own declaration |
| 3 | **Legacy standalone stores** | `doorStore` `geometry-door/src/DoorStore.ts:224`; `windowStore` `geometry-window/src/WindowStore.ts:199`; records `WallTypes.ts:45-64` / `:66-73+` | superset of (1) — adds `systemTypeId`, `mark`, `frameFinish`, `leafFinish`, `sillFinish`, `finishMaterial`, `glassOpacity`, `columnRatios`, `rowRatios`, `hingesSide`, `swingDirection` |
| **4** | **THE HOST RECORD — `wall.openings[]`** | `WallTypes.ts:321`; `Opening` `:33-43` | `id:34`, `type:35` (`'window'\|'door'`), `doorType:36`, `windowType:37`, `offset:38`, `width:39`, `height:40`, **`sillHeight:41`** (*"REQUIRED - geometry generation depends on it"*), **`elementId:42`** (*"REQUIRED — spatial registration depends on this being present"*) |
| 5 | **Kernel producers** | `producers/door.ts:1`, `producers/window.ts`, `producers/wallVoids.ts:1` | `door.ts:25` reads the **L0** shape; `:15-18` — *"positioned in WORLD coordinates relative to the host wall's baseline + sill height… so this producer has no store dependency"* |
| 6 | **Plan-view plugin store** | `plugins/plan-view/src/PlanViewCanvasHost.ts:154, :156` — its own injected `PlanViewSourceStore<Door>` / `<Window>` (⚠ `windowStore` is **optional** at `:156`), read `:237-238, :270-271, :293, :295, :419, :420-421` | a **fifth** view of the same door |

### THE AUTHORITY — **DECIDED BY C15, NOT BY C86**

> **[C15 §1](C15-HOSTED-ELEMENT-CONTRACT.md)`:15`** defines the host wall as *"the `Wall` entity (in
> `WallStore`) that contains the hosted element in its `openings[]` array"*; `:16` defines the
> Opening as *"the entry in `wall.openings[]` describing a void cut"*; **C15 §2** (`:24`) states a
> hosted element *"has no independent world-space coordinate in the store"* and gives the derivation
> (`:29-31`):
> ```
> worldCentre = baseLine[0] + offset × wallDir + (width/2) × wallDir
> voidStart   = baseLine[0] + offset × wallDir
> voidEnd     = baseLine[0] + (offset + width) × wallDir
> ```
> `:17` records that `offset` is the **LEFT EDGE** (§OPENING-OFFSET-LEFTEDGE-UNIFY 2026-06-24,
> *"corrected from 'centre'"*); `:38` the corollary that moving the host without a rebuild leaves the
> void at the old world position.
>
> **`wall.openings[]` (representation 4) IS THE AUTHORITY.** `doorStore` / `windowStore` are the
> **derived** side that C15 §8.1 keeps in sync for `DoorBuilder` / `WindowBuilder` only.
> ⛔ **C84 §9 RETRACTED its own escalation of this to the founder** — it was *"a question C15 has
> already answered"*. **C86 may not re-open it.**

### TO-BE — normative

- **WO-S-1.** The authority is `wall.openings[]`. `doorStore`/`windowStore` are DERIVED. Every new
  consumer MUST read the authority, or state why it reads the derived side.
- **WO-S-2 (EI-5a).** The plugin DTO stores (2) are **declared write-only shadows** — their own
  handler barrels already say so. ⛔ No mirror, no purge (C84 §8.c). Each `store.ts` MUST carry the
  `plugins/rooms/src/store.ts:1-29` header form.

  > ✅ **REGISTER ITEM 5 CLOSED 2026-08-19 — and the word "DETACHED" was carrying more weight than
  > the measurement supports.** C86 recorded only the barrels' self-assertions, and C84 §3.5 is
  > explicit that *a barrel asserting it is detached is not a measurement*. Run on all four axes:
  >
  > | Axis (C84 §3.5.1) | Measured |
  > |---|---|
  > | **(a) import / construction** | `apps/editor/src/PluginRegistry.ts:50-51` imports both; `:256` `buildStore: () => new DoorStore() as unknown as Store<object>`, `:264` the same for `WindowStore` |
  > | **(d) call** | `apps/editor/src/bootstrap.everything.ts:142` `const store = plugin.buildStore();` inside the `ALL_PLUGINS` loop (`:139`) — invoked for **every** plugin, door and window included |
  > | **(b) bus** | reached from the production entry: `src/main.ts:397` imports `bootstrapWithEverything` from `@pryzm/editor/bootstrap.everything` and passes it to `composeRuntime` as `bootstrapFn` (`:412`). The eight non-refusing door/window verbs (§4) write these instances |
  > | **(c) build-graph** | `apps/editor/package.json` declares `@pryzm/plugin-door` and `@pryzm/plugin-window` as `workspace:*` |
  >
  > **So the classes ARE constructed, ARE bound under storeKeys `'door'`/`'window'`, and ARE
  > written.** They are detached from **READERS**, not from the runtime. The distinction matters
  > because EI-5a's disposition — *declare, do not reconcile* — is explicitly *"sound ONLY while the
  > reader count is zero"*, and the thing that must stay zero is the reader count, which is what a
  > future census must re-run. **A store that is live, written and unread is a different object from
  > a store that is never built, and "DETACHED" reads as the second.**
- **WO-S-3.** The plan-view plugin's stores (6) are a **fifth** view.

  > ✅ **REGISTER ITEM 8 CLOSED 2026-08-19 — and the answer dissolves the question.** *"Are they fed
  > from the authority?"* presumes they are fed at all. **They are not: `PlanViewCanvasHost` has ZERO
  > production construction sites.** `grep -rn 'new PlanViewCanvasHost'` → **2 hits, both tests**
  > (`plugins/plan-view/__tests__/plan-view-canvas-host.test.ts:125`,
  > `plan-view-auto-dim.test.ts:147`). Nothing in `apps/editor`, `src/`, or any other host constructs
  > it. The "fifth view of the same door" is a **test-only** view.
  >
  > What the shape would be if it were wired, recorded so the answer survives the wiring: its stores
  > are typed `PlanViewSourceStore<Door>` / `<Window>` over `Door`/`Window` from **`@pryzm/plugin-sdk`**
  > (`:43`) — i.e. the L0/DTO shape, which is the **empty** side after any project load (C84 EI-5a,
  > `ProjectLoader.ts:743`). So the natural wiring feeds it the store with no records in it.
  >
  > ⚠ **The optional `windowStore` (`:156`) degrades SILENTLY.** `:420-422` —
  > `const windows = this.windowStore ? [...this.windowStore.getState().values()] : []` — and that
  > `[]` flows into `projectWallEdges` (`:427`) and `computePocheFills` (`:431`). **A plan view with
  > no window source and a plan view of a building with no windows are the same value**, with no
  > declaration at either site. That is the §CONTEXT-DATA-HONESTY shape and it is why this row stays
  > open even though the host is unwired: whoever wires it inherits the ambiguity.
  >
  > **Verdict: PARKED under C84 §3.5** — but it does **not** carry the compliant PARKED declaration
  > (`producers/wallVoids.ts:10-15` is the form). It MUST gain one, or be wired.
- **WO-S-4.** ⛔ **`doorStore`/`windowStore` MUST NOT be retired.** C84 §8.c, as scoped: **both**
  sides have live readers (`WallFragmentBuilder` reads `wall.openings` for the void;
  `DoorBuilder`/`WindowBuilder` read the standalone store for the frame). This is a **declared
  co-living pair** under C84 §3.5, and **its obligation is a GATE, not a retirement.**

---

## 3. CONSUMERS — **THE SPLIT-BRAIN, AND IT IS ON THE READ PATH**

| Consumer | Reads | Evidence |
|---|---|---|
| **The VOID (host geometry)** | **(4) `wall.openings[]`** | `WallFragmentBuilder.ts:966` — `wallGroup.userData.openings = wall.openings ?? []` |
| **The FRAME (3-D leaf)** | **(3) `doorStore` / `windowStore`** | `initBuilders.ts:92` (import), `:708` `new DoorBuilder(scene, wallStore)`, `:709` `doorBuilder.activate()`; `:95`, `:711` `new WindowBuilder(scene, wallStore)`, `:720`, `:724`. `:706` — *"Both builders self-subscribe to their respective stores via activate()"* |
| **Plan symbols** | **(3)** | `initTools.ts:1285` — *"DoorPlanSymbolBuilder.inject() reads exclusively from doorStore.getAll()"*; `:1339-1340` for windows |
| **Plan view (plugin)** | **(6)** its own injected stores | `PlanViewCanvasHost.ts:154, :156, :419, :420-421` |
| **Persistence — save** | **BOTH (3) AND (4), UNRECONCILED** | LIVE `ProjectSerializer.ts:47` (`import { doorStore, doorSystemTypeStore }`), `:48` (`windowStore`), **`:1013` `const windows = windowStore.getAll().map(w => ({...w}));`**, **`:1014` `const doors = doorStore.getAll().map(d => ({...d}));`**, emitted `:1103`; **and separately `:552` `openings: Array.isArray(wall.openings) ? wall.openings.map(o => ({...o})) : []`**. Type decls `:128`, `:129`, `:139` |
| **IFC export** | **(4) — the EMBEDDED record ONLY** | `packages/file-format/src/export/ifc/readers/WindowDoorReader.ts:1` `import { WallStore } from '@pryzm/geometry-wall'`, `:7` `constructor(private store: WallStore, …)`, **`:12` `this.store.getAllWindows()`**, **`:56` `this.store.getAllDoors()`**; wired `packages/file-format/src/export/ifc/FragmentReader.ts:89` (import `:36`). A grep of `packages/file-format/src` for `doorStore\|windowStore\|getAllDoors\|getAllWindows` returns **only `:12` and `:56`, both `this.store.*` (the WallStore)** |
| **GLB export** | **NEITHER RECORD — it reads the THREE SCENE** | `packages/file-format/src/export/glb/GLBExporter.ts:144` `if (!(object.userData && object.userData.elementType)) return;`, root-only filter `:157`, resolver `:125`/`:302-305`, export walk `:598`. ✅ **REGISTER ITEM 2 CLOSED** — the blank was the wrong shape of question |
| **Bake worker** | **NONE — capability absent** | `HeadlessBakeSession.ts:13`, `:58`, `:92` are three comments describing FUTURE work (*"door, window, stair plug in once their handlers + producers"*; *"the long-tail handlers (joins, openings, level"*). **Zero door/window/opening code in the file** |
| **Undo (ring buffer)** | **NONE — deliberate** | `performUndoRedo.ts:345-351` |
| **Rollback (`createSnapshot`)** | **(3)** | `CommandManagerImpl.ts:619-620` |

### THE SPLIT, stated precisely

> **Persistence reads BOTH records and reconciles NEITHER** (`ProjectSerializer.ts:552` and
> `:1013-1014`). **IFC export reads ONLY the embedded record** (`WindowDoorReader.ts:12, :56`).
> **The 3-D frame reads ONLY the standalone stores** (`initBuilders.ts:708-724`). **The void reads
> ONLY the embedded record** (`WallFragmentBuilder.ts:966`).
>
> **Four consumers, two records, no read-path reconciliation anywhere.** C15 §8.1 keeps them in sync
> **on the write path** — and only for `offset`, and only by review (§4).

> ⚠ **C84's citation `ProjectSerializer.ts:704-705` for the doorStore/windowStore read is WRONG for
> the LIVE file. The measured sites are `:1013-1014`; `:47-48` are the imports.** Recorded per C84 §6
> (*record retractions*) rather than silently corrected — see the Appendix.

### TO-BE — normative

- **WO-C-1 (EI-1).** Every consumer MUST read `wall.openings[]`, **or** declare in its own header why
  it reads the derived store and what field set that choice costs it. `WindowDoorReader` and
  `WallFragmentBuilder` already comply by construction; `DoorBuilder`/`WindowBuilder` and
  `ProjectSerializer` do not.
- **WO-C-2 (C05).** The **persistence migration to serialise `wall.openings[]` as the authority** is
  **OWED** and is **owned by [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md), not by C86** (C84 §9, as
  retracted-and-narrowed). Today the round-trip is *authoritative-by-accident*, via C15 §8.1's
  mandated paired write.
- **WO-C-3.** The bake worker's total absence of opening handling MUST be declared (§12 R-7). A
  self-host bake produces walls with **no voids and no leaves**.

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — the bus handlers, and **the CREATE verbs REFUSE**

| Handler | Verb (line) | `affectedStores` (line) | Refuses? |
|---|---|---|---|
| **`plugins/door/src/handlers/CreateDoor.ts`** | `door.create` `:112` | `['door']` `:113` | ⛔ **YES, unconditional** `:154` |
| `CreateDoorBatch.ts` | `door.batch.create` `:53` | `['door']` `:54` | no (validation `:61-86`) |
| `DeleteDoor.ts` | `door.delete` `:23` | `['door']` `:24` | no `:28, :31` |
| **`MoveDoor.ts`** | `door.move` `:76` | **`['door']` `:77`** | ⛔ **YES** `:109` |
| `SetDoorAccessibility.ts` | `door.setAccessibility` `:28` | `['door']` `:29` | no |
| `SetDoorFireRating.ts` | `door.setFireRating` `:28` | `['door']` `:29` | no |
| `SetDoorSwing.ts` | `door.setSwing` `:43` | `['door']` `:44` | no |
| `SetDoorType.ts` | `door.setType` `:33` | `['door']` `:34` | no |
| `UpdateDoorsSystemTypeBatch.ts` | `door.updateSystemTypeBatch` `:72` | **`[]`** `:73` | no |
| **`plugins/window/src/handlers/CreateWindow.ts`** | `window.create` `:68` | `['window']` `:69` | ⛔ **YES** `:98` |
| `CreateWindowBatch.ts` | `window.batch.create` `:51` | `['window']` `:52` | no |
| `CreateWindowsParametricBatch.ts` | `window.parametricCreate` `:63` | **`[]`** `:64` | no |
| `DeleteWindow.ts` | `window.delete` `:23` | `['window']` `:24` | no |
| **`MoveWindow.ts`** | `window.move` `:75` | **`['window']` `:76`** | ⛔ **YES** `:108` |
| `SetWindowFireRating.ts` | `window.setFireRating` `:28` | `['window']` `:29` | no |
| `SetWindowType.ts` | `window.setType` `:27` | `['window']` `:28` | no |
| `UpdateWindowsSystemTypeBatch.ts` | `window.updateSystemTypeBatch` `:72` | **`[]`** `:73` | no |

`CreateDoor.ts:107` verbatim — the refusal is the family's own architecture statement:
> *"door.create writes the detached plugin door store: the CA-21 executed read-back saw the dispatch
> report success while the authoritative doorStore (the one ProjectSerializer reads) did not change…
> **A door is a hosted opening, so it is created by ONE atomic command — `wall.createOpening`**
> (payload: `{ wallId, opening: { id, type: 'door', offset, width, height, sillHeight, elementId } }`)
> → `CreateWallOpeningCommand`…"*
`CreateWindow.ts:63` is its mirror.

> ⭐ **THAT IS THE C84 EI-4a SHAPE, ARRIVED AT CORRECTLY: ONE ROUTE PER USER INTENT.** The family's
> create verbs were not "fixed" to write two stores — they were made to refuse and to **name the one
> atomic command**. This is the pattern the other families' create verbs should copy.

**⚠ `door.move` declares `['door']` and `window.move` declares `['window']` — omitting `wall`,
which the L2 twins declare (`MoveDoorCommand.ts:26` `["door","wall"]`).** Both refuse, so no harm is
done today; **the declaration is nonetheless wrong** and would be a live C15 §8.1 violation the
moment either is re-enabled. `MoveDoor.ts:51-52` and `MoveWindow.ts:50-51` name the undo hazard the
refusal closes.

### The L2 door/window commands — **25**, in TWO directories

⚠ **This heading said "The 13 L2 door/window command families" and then enumerated TWELVE, all of
them doors — the entire `windows/` directory was missing from a section whose title promises both.**
Corrected 2026-08-18. `ls packages/command-registry/src/doors/*.ts | wc -l` → **12**;
`ls packages/command-registry/src/windows/*.ts | wc -l` → **13**; total **25**.

`doors/` (12): `MoveDoorCommand:26`, `SetDoorOffsetCommand:24`, `UpdateDoorAccessibilityTypeCommand:5`,
`UpdateDoorFireRatingCommand:5`, `UpdateDoorFrameColorCommand:5`, `UpdateDoorHeightCommand:5`,
`UpdateDoorLeafColorCommand:5`, `UpdateDoorParameterCommand:48`, `UpdateDoorSillHeightCommand:5`,
`UpdateDoorsSystemTypeBatchCommand:96`, `UpdateDoorSystemTypeCommand:67`, `UpdateDoorWidthCommand:5`
— **all 12 declare `["door","wall"]`.** ✅ Correct across the board.

`windows/` (13): `CenterWindowInWallCommand`, `CreateWindowInAllWindowsCommand`,
`CreateWindowsParametricBatchCommand`, `MoveWindowCommand`, `SetWindowOffsetCommand`,
`UpdateWindowFireRatingCommand`, `UpdateWindowFrameColorCommand`, `UpdateWindowHeightCommand`,
`UpdateWindowParameterCommand`, `UpdateWindowSillHeightCommand`, `UpdateWindowSystemTypeCommand`,
`UpdateWindowWidthCommand`, `UpdateWindowsSystemTypeBatchCommand` — **12 of 13 declare
`["window","wall"]`. ONE does not**, and it was on no register until now.

#### ⛔ NEW 2026-08-18 — the canonical CREATE path under-declares its own write set

`grep -rhoE 'affectedStores[^;]*' packages/command-registry/src/{doors,windows}/*.ts | sort | uniq -c`
→ doors **12/12** `["door","wall"]`; windows **12/13** `["window","wall"]` plus **one
`['wall']`**: `CreateWindowsParametricBatchCommand.ts:89`. Following it down finds the real subject:

| Command | Declares | Actually writes | |
|---|---|---|---|
| `walls/CreateWallOpeningCommand.ts:12` | **`["wall"]`** | `doorStore.add()` `:155`, `windowStore.add()` `:204`; removes **both** on undo `:288-289` | ⛔ **under-declared** |
| `windows/CreateWindowsParametricBatchCommand.ts:89` | **`['wall']`** | delegates to N `CreateWallOpeningCommand` children (`:199`, `:301`), replaying their undo in reverse (`:347-348`) | ⛔ inherits the same gap |

**Why this matters, and exactly how far the measurement goes.** `CreateWallOpeningCommand` is the
command every refusing verb in §12 R-1 is told to route to — *"the one atomic command"* for creating
a hosted opening. It adds a record to `doorStore` / `windowStore` while declaring only `wall`, so the
snapshot scope that `affectedStores` drives **excludes a store it writes**. Its own `undo()` removes
from both stores explicitly (`:288-289`), which is why this has not surfaced as a lost door: the
command does not rely on the snapshot to reverse itself.

⚠ **NOT MEASURED: whether any path reverses this command through the SNAPSHOT rather than through its
own `undo()`.** That is the question that decides whether this is a live defect or a latent one, and
this contract does not answer it. **Do not record a verdict here without running it** — a confident
sentence in place of a measurement is the failure C84 EI-1b exists to prevent, and it has already
cost this suite twice (the wall Y-datum "LATENT"; ADR-0331 §D3's "inferred from the header"). The
DECLARATION is wrong either way: EI-7c requires the declared set to be the written set.

### UI-control reachability

**NOT MEASURED** — owned by [C82](C82-RIBBON-CAPABILITY-SURFACE.md). The 2-D plan drag (§5) bypasses
the bus entirely, so a control census over verbs alone would miss the family's live mutation path.

### TO-BE — normative

- **WO-P-1.** The four refusals (`door.create`, `window.create`, `door.move`, `window.move`)
  **SATISFY [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) and MUST NOT be "fixed" into silent
  success.** The residual defect is any still-offered control.
- **WO-P-2.** `door.move` / `window.move` MUST declare `['door','wall']` / `['window','wall']` before
  either is re-enabled — C15 §8.1 makes `wall` part of their write set.
- **WO-P-3.** The eleven non-refusing DTO writers (`setSwing`, `setType`, `setFireRating`,
  `setAccessibility`, the batch creates, the deletes) write a store their own barrel calls a
  *"silent no-op in production"*. Each MUST route (**CA-17**) or refuse (**CA-18**).

---

## 5. THE BRIDGE FIELD MAP — **THE LOAD-BEARING SECTION**

### There is NO `.created` bridge. It was deliberately deleted.

`packages/runtime-composer/src/CommandEventBridge.ts:626-631` verbatim:
```
626: // TASK-13 (…RISK-3): door/window/stair CEB
627: // cases removed — no initTools.ts subscribers exist for 'door.created',
628: // 'window.created', or 'stair.created' (confirmed grep returned 0 hits).
629: // • door / window: use the Committer architecture (Path A) — no CEB bridge needed.
630: // • stair: uses Path C (legacy commandManager bridge) — no CEB bridge needed.
631: // Pre-removal grep: grep -rn "door\.created\|window\.created\|stair\.created" … → 0 matches outside CEB.
```
The bridge **does** still carry the host verb: `case 'wall.opening.create':` `:310` (`commandType`
`:314`), `case 'wall.createOpening':` `:320` (`:324`); event union `types.ts:408`.
✅ **C84's `:627-631` CONFIRMED verbatim.**

### The FIVE paths a door reaches the legacy store — every hop measured

- **PATH A — 3-D door tool / AI / apartment layout.** Dispatch `wall.createOpening` (e.g.
  `packages/ai-host/src/workflows/apartmentLayout/executePlan.ts:603, :654, :729`) →
  `packages/command-registry/src/walls/CreateWallOpeningCommand.ts` reserves the `wall.openings[]`
  entry → **the same command** writes `doorStore.add({…})` `:155` / `windowStore.add({…})` `:204`
  (guarded `:187` `!windowStore.has(this.openingElementId)`) → `doorStore.add` emits storeEventBus →
  `DoorBuilder` (subscribed `initBuilders.ts:709`). Semantic graph write `:233-235`.
- **PATH B — 2-D plan door tool (bus path).** Bus event → `initTools.ts:1296`
  (`if (type === 'door' && !doorStore.has(elementId))`) → `:1321-1329`
  `doorStore.add(buildDoorStoreRecord({…}))`. **Failure is swallowed** — `:1334-1336`
  `console.error('[initTools] §P2.3-DOOR: doorStore.add failed (non-fatal) — swing arc symbol will be absent:', err)`.
  Windows: `:1339-1340` (comment), `:1365-1373`.
  **Root cause stated in-file, `:1284-1290`:** *"When a door is placed from the plan-view tool, the
  bus path only writes to the wall's openings array (via addOpening above). No DoorStore entry is
  ever created → the symbol builder finds nothing → no swing arc in plan."* Drift history `:1298-1318`
  — `mark`, `finishMaterial`, `systemTypeId`, `frameThickness`, `frameDepth`, `leafThickness` were
  **all previously lost on this path**; both paths now claim to funnel through
  `buildDoorStoreRecord()` (`:1317-1318`).
- **PATH C — project load.** LIVE `apps/editor/src/engine/persistence/ProjectLoader.ts`.
- **PATH D — import.** `ImportProjectCommand.ts:526, :533`.
- **PATH E — undo of a wall delete.** `DeleteElementCommand.ts:699, :717, :792, :812, :824, :838`.

**The plugin `CreateDoorHandler` is NOT a hop — it refuses (`:154`).**

### Field map — L0 `Door` → the legacy `doorStore` record

Write site: `CreateWallOpeningCommand.ts:155-183`.

| # | `Door.ts` field | Legacy key | Line | **Disposition** |
|---|---|---|---|---|
| 1 | `id` | `id` | `:156` | **CARRIED** (← `this.openingElementId`) |
| 2 | `openingId` `:50` | `openingId` | `:157` | **CARRIED** |
| 3 | `wallId` `:48` | `wallId` | `:158` | **CARRIED** |
| 4 | `offset` `:56` | `offset` | `:159` | **CARRIED (`?? 0`)** |
| 5 | `width` `:52` | `width` | `:160` | **CARRIED (`?? 1.0`)** ⚠ **schema default is 0.9** — two defaults for one field |
| 6 | `height` `:53` | `height` | `:161` | **CARRIED (`?? 2.1`)** |
| 7 | `sillHeight` `:54` | `sillHeight` | `:162` | **CARRIED (`?? 0`)** |
| 8 | `doorType` `:51` | `doorType` | `:163` | **CARRIED (`?? 'single'`)** |
| **9** | **`swing`** `:67-69` (5 values) | **`hingesSide` + `swingDirection`** | `:167-170` | ⛔ **TRANSFORMED — VOCABULARY BREAK.** One 5-member enum written as TWO legacy fields (`'left'\|'right'` × `'inward'\|'outward'`), conditionally spread. **`'sliding'` has no representation in that 2×2** — see §9 |
| **10** | **`frameThickness`** `:57` | — | — | ⛔ **DROPPED (SILENT)** — never written by this path |
| **11** | **`frameWidth`** `:58` | — | — | ⛔ **DROPPED (SILENT)** |
| 12 | `frameColor` `:59` | `frameColor` | `:178` | ⚠ **CONDITIONAL** — written **only when `doorSysType` resolves**, and derived from `doorSysType.frameFinish.materialColor`, **not from the payload** |
| 13 | `leafColor` `:60` | `leafColor` | `:179` | ⚠ same |
| **14** | **`fireRating`** `:61` | — | — | ⛔ **DROPPED (SILENT) AT CREATION.** Settable only by a later `UpdateDoorFireRatingCommand` |
| **15** | **`accessibilityType`** `:62` | — | — | ⛔ **DROPPED (SILENT) AT CREATION** |
| 16 | `provenance:30` / `confidence:46` | — | — | ⛔ **DROPPED (SILENT)** |
| — | *(no schema field)* | `systemTypeId` | `:171` | **LEGACY-ONLY** |
| — | *(no schema field)* | `mark` | `:172` (computed `:148-153`) | **LEGACY-ONLY** |
| — | *(no schema field)* | `frameFinish` / `leafFinish` | `:175-176` | **LEGACY-ONLY** structured layers |
| — | *(no schema field)* | `finishMaterial` | `:181` | **LEGACY-ONLY** |

**Window equivalent — `CreateWallOpeningCommand.ts:204-227`.** Same shape, plus legacy-only
`sillFinish:218`, `glassOpacity:221`, `columnRatios:224`, `rowRatios:225`; schema `frameThickness`,
`frameWidth`, `fireRating` **all DROPPED**; `width ?? 1.2` `:209`, `height ?? 1.2` `:210`,
**`sillHeight ?? 1.0` `:211` against a schema default of `0.9` (`Window.ts:53`)** — a second
default divergence.

### ⛔ THE C15 §8.1 DUAL-WRITE COMPLIANCE CENSUS — the sharpest measurement in this contract

[C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) (heading `:154`, mandate `:156-163`):
> *"Every command that mutates a hosted element's `offset` MUST write to **both**: (1)
> `wallStore.updateDoor()` / `wallStore.updateWindow()` — keeps `wall.openings[i].offset`
> authoritative for void geometry (consumed by `WallFragmentBuilder`). (2) `doorStore.update()` /
> `windowStore.update()` — keeps the standalone geometry store in sync so that
> `DoorBuilder.rebuildForWall()` / `WindowBuilder.rebuildForWall()` call `positionGroup()` with the
> **current** offset, not a stale value."*
>
> Enforcement clause (≈`:163`): *"Any new command or handler that calls
> `wallStore.updateWindow(id, { offset })` MUST also call `windowStore.update(id, { offset })`
> (guarded by `windowStore.has(id)`). Likewise for doors. **A code-review checklist item must verify
> this pairing.**"*

| Site | `wallStore.updateDoor/updateWindow` | `doorStore/windowStore.update` | Verdict |
|---|---|---|---|
| `doors/SetDoorOffsetCommand.ts` | `:68` exec, `:77` undo | `:69`, `:79` (both `has()`-guarded) | ✅ **HONOURS** |
| `windows/SetWindowOffsetCommand.ts` | `:63`, `:77` | `:67-68`, `:80-81` (C15 cited `:5-8`) | ✅ HONOURS |
| `doors/MoveDoorCommand.ts` | `:92`, `:106` | `:94-95`, `:108-109` | ✅ HONOURS |
| `windows/MoveWindowCommand.ts` | `:71`, `:86` | `:74-75`, `:89-90` | ✅ HONOURS |
| `windows/CenterWindowInWallCommand.ts` | `:81`, `:95` | `:84-85`, `:98-99` | ✅ HONOURS |
| `generic/UpdateElementParameterCommand.ts` | `:482` (window), `:488` (door) | `:484-485`, `:490-491` | ✅ HONOURS |
| `windows/UpdateWindowParameterCommand.ts` | `:160` | `:93`, `:102` | ✅ HONOURS |
| `doors/UpdateDoorParameterCommand.ts` | `:124` | `:96`, `:105` | ✅ HONOURS |
| **`packages/core-app-model/src/views/PlanElementDragController.ts`** | **`:570` `ws.updateDoor(state.elementId, { offset: slide.offset })`, `:571` `ws.updateWindow(…)`, `:713`, `:715` (revert)** | ⛔ **NONE — the file contains ZERO occurrences of `doorStore`, `windowStore`, `@pryzm/geometry-door` or `@pryzm/geometry-window`** | ⛔ **VIOLATES C15 §8.1 — AND IT IS THE LIVE 2-D PLAN-VIEW DRAG PATH** |
| **`apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts`** — ⛔ **NEW 2026-08-19, [L-1042](../../04-reference/ISSUE-LOG.md); this census did not contain it** | **NINE sites, re-measured by the gate after this lane's own import shifted them by +4: `:159` `updateWindow(width)`, `:164` `(height)`, `:169` `(sillHeight)`, `:174` `(fireRating)`, `:182` `updateDoor(width)`, `:187` `(height)`, `:192` `(fireRating)`, `:197` `(accessibilityType)`, `:238` `updateDoor(mapped.legacy)`** | ⛔ **NONE — `grep -c 'doorStore\|windowStore\|geometry-door\|geometry-window'` over the file was **0** before this lane's `mapSwingToLegacy` import** | ⛔ **VIOLATES the pairing on EIGHT fields. It is the PROPERTY PANEL — the second most-used mutation surface in the family** |

> ⛔ **THE CENSUS WAS INCOMPLETE, AND THE OMISSION IS INSTRUCTIVE (added 2026-08-19).** C86 built
> this table by sweeping **COMMANDS** (`packages/command-registry/src/{doors,windows}/*.ts`) and
> then adding the one non-command surface it happened to know about. `PropertyInspectorApply.ts`
> is a **UI apply path** — it calls `ctx.wallStore.updateDoor/updateWindow` directly, exactly as
> `PlanElementDragController` does, and it was invisible to a command sweep. **Two of the family's
> three most-used mutation surfaces are off-bus and off-command, and a command-shaped census finds
> neither.** This is precisely why WO-B-3's gate must key on **call sites of
> `wallStore.updateDoor/updateWindow`**, repo-wide, and not on command declarations.

✅ **RE-MEASURED 2026-08-18 and the `PlanElementDragController` row is exact, line for line** —
`grep -n 'updateDoor\|updateWindow' PlanElementDragController.ts` → **`:570`, `:571`, `:713`, `:715`,
and nothing else**; `grep -c 'doorStore\|windowStore\|geometry-door\|geometry-window'` → **0**.
Recorded because a citation that survives re-measurement unchanged is worth as much as one that does
not: this census is the sharpest measurement in this contract and it is still true.

### ⛔ ~~Thirteen more commands mutate the record on one side only~~ — **REFUTED. TWELVE OF THE THIRTEEN PAIR CORRECTLY.**

> ⛔ **RETRACTED 2026-08-19 (C84 §6), and this is the most consequential correction in this pass.**
> This paragraph read: *"**Thirteen more commands mutate the record on one side only** … **A grep of
> each for `doorStore`/`windowStore` produced no hits.** They desync width, height, sill, colour,
> fire rating and mark between the two records."*
>
> **The grep result is not reproducible. Run it:**
> ```
> grep -c "doorStore\.update(\|windowStore\.update(" <each of the thirteen>
> → 2 2 2 2 2 2 2 2 2 2 2 2 0
> ```
> **Twelve of the thirteen call the paired write on BOTH legs**, each in exactly the C15 §8.1 form,
> guard included — e.g. `UpdateDoorWidthCommand.ts:34-35` / `:45-46`:
> ```
> if (doorStore.has(this.doorId)) {
>     doorStore.update(this.doorId, { width: this.newValue });
> ```
> and the import is at `:2`. Same shape in `UpdateDoorFireRatingCommand:28-29,:37-38`,
> `UpdateWindowHeightCommand:35-36,:45-46`, and the other nine.
>
> ⭐ **AND IT IS NOT DRIFT SINCE C86 WAS WRITTEN.**
> `git log -S "windowStore.update" -- packages/command-registry/src/windows/UpdateWindowHeightCommand.ts`
> → **`8613866a Initial commit`**. The pairing has been there from the beginning, so this is not a
> stale measurement that decayed — **the claimed grep cannot have been run.**
>
> ⛔ **THE LESSON, AND IT IS THIS CONTRACT'S OWN STATED ONE, TURNED ON ITSELF.** C86 warns that *"a
> confident sentence in place of a measurement is the failure C84 EI-1b exists to prevent"* — and
> then carries a thirteen-item list whose justification is a grep that returns the opposite. It was
> wrong by a factor of four, **in the direction that makes the repo look worse than it is**, which is
> the direction that gets believed. It took an executed instrument
> (`tools/ga-gate/check-hosted-dual-write.ts`) to find out.

**ONE command is genuinely one-sided**, and it is the one that was buried at the end of the list:

| Site | Writes | Pairs? |
|---|---|---|
| `packages/command-registry/src/UpdateElementMarkCommand.ts:56` (`window`), `:57` (`door`) | `wallStore.updateWindow/updateDoor(elementId, { properties: updatedProperties })` | ⛔ **NO** — the file contains zero `doorStore`/`windowStore` references. `mark` is a legacy-store field (§5 field map, written at `CreateWallOpeningCommand.ts:172`), so **`mark` desyncs between the two records** |

✅ **So the measured C15 §8.1 compliance for COMMANDS is 20 of 21.** The family's command layer is
in far better shape than this contract claimed; **the violations are on the two UI surfaces**
(§11 #1, §11 #18), which is exactly where a command-shaped census cannot look.

### TO-BE — normative

- **WO-B-1 (EI-2).** Every **DROPPED (SILENT)** row MUST become CARRIED or **DROPPED (DECLARED)**.
  Rows **10, 11, 14, 15** are the priority: `frameThickness`, `frameWidth`, `fireRating` and
  `accessibilityType` are all schema fields the create path silently discards.
- **WO-B-2.** The **default divergences** (`width` 0.9/1.0; window `sillHeight` 0.9/1.0) MUST
  collapse. Two defaults for one field is EI-9, and it means `Door.parse({})` and a created door
  differ in a field neither reports.
- **WO-B-3 — THE C15 §8.1 GATE IS OWED, AND `PlanElementDragController` IS THE PROOF.** C15 §8.1's
  own enforcement is *"a code-review checklist item"* — C84 **§8.d**, *a comment as the
  synchronisation mechanism*, and it has now measurably failed on the family's most-used gesture.
  A `check-hosted-dual-write.ts` gate MUST assert: **every call site of
  `wallStore.updateDoor/updateWindow` is accompanied by the paired standalone write, or declares an
  exemption.** ⛔ **Control first, watched RED**: drag a door in plan, then rebuild the wall, and
  assert the frame and the void are at the same offset. It will fail today.
- **WO-B-4.** The thirteen one-sided updaters MUST either be brought under the pairing or the two
  records MUST be collapsed by WO-C-2's migration. **C15 §8.1's scope (`offset` only) is narrower
  than the desync.**

---

## 6. VERBS

| Verb | Lineage | W | R | `=`? | Note |
|---|---|---|---|---|---|
| **`wall.createOpening` / `wall.opening.create`** | L1 → L2 | `wall.openings[]` **+** `doorStore`/`windowStore` **+** semantic graph | legacy | ⚠ | **THE ONE ATOMIC CREATE.** Owned by [C85 §4](C85-ELEMENT-WALL.md); its field map is §5 |
| **`door.create` / `window.create`** | L1 | — refuse `:154` / `:98` | n/a | ✅ vacuously | ✅ **exemplary EI-4a** — the refusal names the one route |
| `door.batch.create` / `window.batch.create` | L1 | DTO | — | ⛔ | ⚠ **they do NOT refuse**, while their single-create twins do. An inconsistency, measured |
| `window.parametricCreate` | L1, `[]` | DTO | — | ⛔ | — |
| `door.delete` / `window.delete` | L1 | DTO | — | ⛔ | the DORMANT class (C84 §3.5.3) |
| **`door.move` / `window.move`** | L1 | — refuse `:109` / `:108` | n/a | ✅ vacuously | declare `['door']`/`['window']`, **omitting `wall`** — WO-P-2 |
| **THE LIVE MOVE PATH** | **legacy, off-bus** | `PlanElementDragController.ts:570-571` (**wall only**) + L2 `MoveDoorCommand`/`SetDoorOffsetCommand` (**both**) | L2 stack | ⛔ for the drag | **the C15 §8.1 violation** — §5 |
| `door.setSwing` / `setType` / `setFireRating` / `setAccessibility` | L1 | **DTO only** | — | ⛔ | write a store their own barrel calls a *"silent no-op in production"* |
| `window.setType` / `setFireRating` | L1 | **DTO only** | — | ⛔ | same |
| `door.updateSystemTypeBatch` / `window.updateSystemTypeBatch` | L1, `[]` | — | — | ⚠ | — |
| **ROTATE** | — | — | — | — | ⛔ **NONE, and correctly so** — a hosted opening has no independent orientation ([C15 §2](C15-HOSTED-ELEMENT-CONTRACT.md)). **Declared** |
| **LEVEL CHANGE** | — | — | — | — | ⛔ **NONE, and correctly so** — the opening's level is its host's. **Declared** |
| **MATERIAL** | — | — | — | — | ⛔ **No `setMaterial` verb.** Colour is per-part (`frameColor`, `leafColor`) via L2 commands |

### TO-BE — normative

- **WO-V-1.** The batch-create verbs MUST refuse for the same reason their single twins do, or the
  single twins' refusal is inconsistent and a caller will simply use the batch.
- **WO-V-2.** The two correct absences (rotate, level change) are now **DECLARED** with their C15
  reason, so a future lane does not mint them.

---

## 7. UNDO / REDO

### WO-U-1 — the ring-buffer absence is DELIBERATE and DOCUMENTED

`performUndoRedo.ts:345-351` verbatim:
```
345: // NOTE: door / window / level are intentionally ABSENT. With the `_covered`
346: // pre-check, a store key missing from this map is "not covered" → performUndo
347: // does NOT step the ring-buffer cursor and falls straight through to
348: // commandManager.undo(). That is exactly the desired routing:
349: //   • door/window are HOSTED (the opening must also be removed from the host
350: //     wall) — the two-part undo lives in the legacy command (ADR-051 follow-up);
351: //   • level is spatial authority (Path-A AddLevelCommand / commandManager).
```
✅ **C84 CONFIRMED.** The gate is `_covered()` `:358-364`; note `:362` — **an EMPTY
`affectedStores` is ALSO "not covered"**, which is where the four `[]` batch handlers (§4) land.

### WO-U-2 — the asymmetry that makes the refusals correct

**`'door'` / `'window'` ARE `createSnapshot` keys** (`CommandManagerImpl.ts:619-620`; rationale
`:605-608` — *"§DOOR-AUDIT-2026 P0/§WINDOW-AUDIT-2026 W1: door & window stores are first-class
snapshot scopes so dual-store commands (wallStore + doorStore/windowStore) roll back atomically on
execute failure"*) **and are NOT ring-buffer undo-map keys** (`performUndoRedo.ts:345`). The plugin
handlers declare exactly the key the ring buffer cannot resolve — which is the hazard
`MoveDoor.ts:51-52` and `MoveWindow.ts:50-51` cite as their reason to refuse. **The refusals are
therefore not merely C16-conformant; they are the only correct response to WO-U-1.**

### WO-U-3 — the host's `openings` patch has a trapdoor

`elementUndoStoreAdapter.ts:295-297` routes a field-level `openings` patch to
`_reconcileWallOpenings(store, id, Array.isArray(p.value) ? … : [])`. When the value is a **single**
opening object — exactly what a `[wallId,'openings',N]` index patch carries — the ternary falls to
`[]` and **every opening is stripped from the wall** (C84 EI-7b). `:301` skips `childrenIds`
because `removeOpening`/`addOpening` manage it. **This is the opening family's exposure to
[C85 §7 W-U-4](C85-ELEMENT-WALL.md), and the fix belongs there.**

### WO-U-4 — audit envelope: door and window ARE covered

`UpdateElementParameterCommand.ts:410-413` gates on `t === 'wall' | 'door' | 'window'`, resolving
`wallId = element?.wallId` for the hosted kinds. **Door and window are two of the three families
L-952 does NOT indict.** ✅ Recorded `✅` explicitly per EI-1b.

### TO-BE — normative

- **WO-U-1n.** The deliberate absence MUST stay, and MUST stay **documented at the map** — it is the
  compliant form of C84 EI-7c (*"the door/window/level absences are deliberate and documented; these
  seven are not"*).
- **WO-U-2n.** Any future attempt to add `'door'`/`'window'` to `buildUndoStoreMap` MUST first
  deliver the two-part undo (opening removed from the host **and** the standalone record), or it
  re-opens the exact bug the note prevents.

---

## 8. CASCADES

| Cascade | Trigger | Reversed? | Evidence |
|---|---|---|---|
| **Hosted openings on wall delete (L2)** | `DeleteElementCommand` | ✅ | `:243` `childrenIds`; loop `:250-267` — `elementRegistry.unregister:251`, `bimMgr.unregisterElement:253`, `semanticGraphManager.removeAllRelationshipsForElement:258`, **`doorStore.remove(childId):265`, `windowStore.remove(childId):266`**; graph capture `:248`; store removal `:269`; restore `:792, :812, :824, :838`. Rationale `:259-264` verbatim: *"§CASCADE-DELETE: Mirror CreateWallOpeningCommand's dual-store write. `WallStore.remove()` only cleans the internal maps (wallStore.doors / wallStore.windows). The external DoorStore / WindowStore singletons are not reached by that path — their builders … never receive a 'remove' event, so hosted 3D meshes survive wall deletion. Both remove() methods are idempotent — safe to call for every child id."* |
| ⭐ **…and it reconciles the split-brain BY BRUTE FORCE** | — | — | `:264` — *"idempotent — safe to call for every child id"*. The command calls **both** removes for **every** child **without knowing which child is a door**. It works, and it is a measured admission that the caller cannot tell the two records apart |
| **Hosted openings on `wall.delete` (L1)** | `wall.delete` | ⛔ **NO CASCADE AT ALL** | `plugins/wall/src/handlers/DeleteWall.ts:14-17` verbatim: *"does NOT cascade to door/window/opening stores (those land when the door + window plugins arrive in S11…)"*, and `:5-8` names the generic L4 handler as the longer-term home. **The door and window plugins EXIST** (`plugins/door`, `plugins/window`) — **the promised S11 cascade was never added.** Execute is a bare `delete draft[cmd.id]` `:61` |
| **Hosted frame sync** | offset/parameter edits | ⚠ review-only | `packages/command-registry/src/walls/hostedOpeningFrameSync.ts`; the pairing is C15 §8.1 and its enforcement is a checklist (§5) |
| **Rebuild on host wall change** | wall move / rebuild | ⚠ | [C15 §2](C15-HOSTED-ELEMENT-CONTRACT.md)`:38` — moving the host without a rebuild leaves the void at the old world position. `DoorBuilder.rebuildForWall()` / `WindowBuilder.rebuildForWall()` (named in C15 §8.1) |

> **Measured divergence, stated plainly:** deleting a wall through the **L2** path removes the hosted
> door and window records and their meshes. Deleting the same wall through the **L1 bus verb
> `wall.delete`** leaves **orphaned `doorStore`/`windowStore` records and orphaned 3-D meshes**.

### TO-BE — normative

- **WO-X-1 (EI-4a — ONE ROUTE PER USER INTENT).** `wall.delete` MUST delegate to the one delete
  route. ⛔ **Do NOT copy the cascade into it** — that mints the second answer EI-9 forbids, and is
  precisely the shape C84 EI-4a's §FIX-ONE-DELETE-PATH resolution rejected for the delete **button**.
- **WO-X-2.** `DeleteElementCommand.ts:265-266`'s blind double-remove is **acceptable while both
  records exist** and MUST be revisited by WO-C-2's migration — it is a symptom, correctly handled.

---

## 9. VOCABULARIES

### Type — `'single' | 'double'`, consistent across seven declarations

`Door.ts:51` · `Window.ts:50` · `WallTypes.ts:36` (`Opening.doorType`), `:37`
(`Opening.windowType`), `:47` (`WindowData`), `:68` (`DoorData`) · `DoorDimensions.ts:72` ·
`executePlan.ts:110`. Tool defaults `DoorToolConfigStore.ts:65`, `WindowToolConfigStore.ts:69`.

**UI offers exactly the two carriable values** — `ToolsAreaLayout.ts:542, :552, :553` (door),
`:573, :583` (window); `DoorModePicker.ts:6`. ✅ **No EI-3 violation on the type axis. Recorded `✅`
explicitly** per EI-1b — a clean axis, measured, not assumed.

### ⛔ EI-3 VIOLATION #1 — `swing` is 5 values written into a 2×2

`Door.ts:67-69` — `z.enum(['left-in','left-out','right-in','right-out','sliding'])`.
`CreateWallOpeningCommand.ts:167-170` writes it as `hingesSide` (`'left'|'right'`) ×
`swingDirection` (`'inward'|'outward'`). **Four of five map. `'sliding'` is unrepresentable in the
legacy record.** A user who picks a sliding door gets a hinged one, silently.
**`Window` has no `swing` field at all.**

### ⛔ ~~EI-3 VIOLATION #2 — the AI writes `doorType` values the union cannot hold~~ — **RETRACTED**

> ⛔ **RETRACTED IN FULL 2026-08-19 (C84 §6). REGISTER ITEM 6 CLOSED, AND IT CLOSED AGAINST THIS
> SECTION.** C86 flagged `QueryEngine.ts:320` / `:575` as a wall-opening EI-3 violation **and then,
> three paragraphs later, warned a future census not to inflate those exact literals into a
> rivalry.** Both readings were in the same section. **The second one was right.**
>
> Measured — the *enclosing function*, which is what nobody had opened:
>
> | Site | Enclosing scope | Verdict |
> |---|---|---|
> | `QueryEngine.ts:320` | `createDefaultSections()` `:313`, building **wardrobe sections**; the answer string at `:310` is *"I've prepared a proposal to modify your wardrobe…"*; the result lands in `commandProposalStore` (`:300`) | `'double-hinged'` **IS a member of `WardrobeSectionDoorType`** (`packages/core-app-model/src/stores/WardrobeCabinetTypes.ts:35-40` — `'double-hinged' \| 'sliding' \| 'glass' \| 'mirror' \| 'none'`). **NO DEFECT AT ALL** |
> | `QueryEngine.ts:575` | a wardrobe config builder `:567-571` (`width`/`height`/`depth`/`sections`), same proposal path | `'hinged-left'` is **NOT** in `WardrobeSectionDoorType` either. **A real out-of-union write — on the WARDROBE axis, not the wall-opening axis.** Reported to the furniture family, [L-1041](../../04-reference/ISSUE-LOG.md) |
>
> **Neither site reaches `Door.parse`, `Opening.doorType`, `DoorDimensions.resolve`, or any
> `wall.openings[]` write.** `section.doorType` is `WardrobeSectionConfig.doorType`
> (`WardrobeCabinetTypes.ts:59`) — a furniture vocabulary that happens to share a field name.
> Both sites are typed `any` (`const section: any`, pushed into an `any[]`), which is why `tsc`
> never saw `:575`.
>
> ⭐ **THE LESSON IS THE REASON THIS RETRACTION IS LONG.** The C86 row read confidently — *"Neither
> is in `'single' \| 'double'`"* — and it was true and irrelevant: the values were never measured
> against the union they actually belong to. **A row that names the wrong denominator is worse than
> a blank**, because it looks measured. The collision note that would have caught it was already in
> this section, written by the same pass, and lost the argument to the more confident paragraph
> above it.

### The name collision itself — RECORDED, still not a violation

`'double-hinged'` appears in `WardrobeCabinetTypes.ts:174, :242` (both `core-app-model` and
`geometry-furniture`), `WardrobeEngine.ts:40, :273, :304`, `WardrobeCabinetEngine.ts:276`,
`FurnitureTool.ts:620-621`. That is `WardrobeSectionDoorType`, a **furniture** vocabulary sharing the
field name `doorType` with the wall-opening one. **Recorded so a future census does not inflate it
into a rivalry** (C84 §8.g) — and, now, so a future census does not repeat C86's own mistake of
grading a furniture value against a door union.

### Material / finish

Legacy-only, and structured: `frameFinish`, `leafFinish`, `sillFinish`, `finishMaterial`,
`glassOpacity`, `columnRatios`, `rowRatios` (§5). Colour arrives from
`doorSysType.frameFinish.materialColor` (`:178`), **not from the payload's `frameColor`**.
**There is no `plugins/door/src/material-bridge.ts` or `plugins/window/src` equivalent measured** —
so C84 EI-8's `_key`-discard question is **moot for this family**.

### TO-BE — normative

- **WO-Voc-1 (EI-3).** `'sliding'` MUST gain a legacy representation, or MUST be removed from
  `Door.swing`. **An enum member the UI can select and the pipeline cannot carry is an affordance
  without an implementation.**
- **WO-Voc-2 (EI-3).** `QueryEngine.ts:320, :575` MUST be corrected to the union, or the union MUST
  widen. An AI path that synthesises unparseable values will fail `Door.parse` loudly — which is
  better than silence, and is still a violation.
- **WO-Voc-3.** `frameColor`/`leafColor` arriving from the system type rather than the payload MUST
  be declared at the write site (`:178-179`), or the payload fields removed.
- **WO-Voc-4 (§10.1 PR-7, EI-8/EI-9) — THE PROFILE AXIS IS ORTHOGONAL TO THE LEAF-COUNT AXIS, AND
  MUST NOT BE FLATTENED INTO IT.** `single | double` is a LEAF COUNT; `rectangular | round-arch |
  segmental-arch | circular` is a VOID SHAPE. ⛔ A UI that offers them as one enumerated list makes
  **`double × round-arch` — an ordinary door — unexpressible**, and would require writing a shape
  value into `Opening.doorType` **and** `Opening.windowType`, two fields that already duplicate one
  axis. The profile is **ONE field on the host record** (`openingProfile`), shared by door and
  window. ⭐ Stated here in the contract so it cannot be re-flattened by the next reader who takes
  *"single / double / circular"* literally.
- **WO-Voc-5.** `Opening.doorType` and `Opening.windowType` are **two fields for one axis** — a
  standing EI-9 smell that §10.1 PR-7 deliberately does not repeat. ⛔ Do not mint
  `doorProfile` + `windowProfile`.

---

## 10. GEOMETRY

### The two halves of one opening

**The VOID** — cut by the host: `LayeredWallOpeningBuilder.ts:141-150` collect X/Y break lines at
every rect edge; `:154-167` mark each cell solid
(`solid[i][j] = !rects.some(rect => cx > rect.left+1e-4 && …)`). ⚠ **This is a
grid-subdivision / solid-cell rasteriser, not a boolean** — exactly the *"abutting box volumes"*
model that `producers/wallVoids.ts:5-7` names as the defect it exists to replace. Header/lintel
mesh: `WallFragmentBuilder.ts:2326-2333`.

**The FRAME** — built by `DoorBuilder` / `WindowBuilder` from the standalone stores.

### ✅ THE FRAME AND THE VOID SHARE ONE Y DATUM — **CLOSED, and this section was WRONG**

> ⛔ **RETRACTED IN FULL (C84 §6). This heading read “⛔ THE FRAME AND THE VOID USE DIFFERENT Y
> DATUMS” and graded the divergence **LATENT**. Both halves were false on the day C86 was written.**
> The defect was fixed by **`8f63fb6f`** (*“fix(L-968/§WALL-Y-DATUM): a base offset moved the hole and
> left every door and window behind”*) — a commit **already on `main`**, already cited by
> [C85 §10](C85-ELEMENT-WALL.md), which records the datum **RESOLVED**: eleven datums agree,
> leaf-vs-hole delta **0**. C86 carried the open row anyway.
>
> ⭐ **Two registers carried one row; one was updated and the other was not.** C85 §10 further
> records that the ground C86 used to justify **LATENT** — *“nothing authors either offset non-zero
> today”* — *“was never tested and it was FALSE”*: both `wall.baseOffset` and `slab.baseOffset` are
> property-panel editable. **C86 re-derived a justification C85 had already retracted.** A confident
> row backed by prose is worse than a blank: the blank invites the measurement, the prose forecloses
> it.

**Re-measured 2026-08-19 in the MAIN worktree.** Every line number in the old table had also rotted
(`WindowBuilder.ts` is 1347 lines today; `DoorBuilder.ts` 1158):

| Site | Measured today |
|---|---|
| `packages/geometry-door/src/DoorBuilder.ts:620-625` | `const wallBaseY = resolveWallBaseYOrLevel(wallData.id, elevation, (wallData as { baseOffset?: number }).baseOffset);` then `const y = hostedLeafCentreY(wallBaseY, door.sillHeight, door.height);` |
| `packages/geometry-window/src/WindowBuilder.ts:947-952` | byte-parallel — `resolveWallBaseYOrLevel(…)` then `hostedLeafCentreY(wallBaseY, win.sillHeight, win.height)` |
| **THE AUTHORITY** | `packages/geometry-wall/src/WallVerticalDatum.ts` — `wallBaseY():103`, `hostedLeafCentreY():119`, `resolveWallBaseYOrLevel():174` |

Both builders carry the same `§WALL-Y-DATUM (L-968)` header (`DoorBuilder.ts:605-619`,
`WindowBuilder.ts:932-946`) naming the old formula as the defect — *“This was `elevation + sillHeight
+ height / 2`: it read neither `slabBaseOffset` … nor `wall.baseOffset`”* — and stating the
consequence in the founder's own terms: *“one ‘set the base offset to 150 mm’ displaced every door on
that wall by `slabBaseOffset + 2 × baseOffset`”*. ✅ **WO-G-1 IS SATISFIED**: there is one datum, it
is the host wall's, and the frame consumes it rather than recomputing it.

⚠ **The `slabBaseOffset` residue is DECLARED, not hidden** — `DoorBuilder.ts:616-619`:
*“`resolveWallBaseYOrLevel` returns the plane the wall builder PUBLISHED. Its fallback (host never
built) omits only the slab term, which this package has no lawful way to read — it is not silently
equal to the published value and is not pretended to be.”* That is the compliant C84 EI-2 form: the
one term that cannot be carried is named at the site instead of dropped by omission.

⚠ **CONSEQUENTIAL FOR [C85 §12 R-8](C85-ELEMENT-WALL.md), WHICH ALREADY SAYS SO.** The CSG
single-volume arm's switched-off comment cites two blockers; the second — *“DoorBuilder/WindowBuilder
place the leaf at `level.elevation + sillHeight` without slab/baseOffset”* — no longer exists.
⛔ **The arm still stays OFF.** The first blocker (whether the `geometry-kernel` producer honours
`baseOffset` the way `WallHoleBodyBuilder` does) is NOT MEASURED, and re-enabling on the strength of
the closed half is precisely the inference C84 exists to prevent.

⚠ **C84 cites `DoorBuilder.ts:498` / `WindowBuilder.ts:818` as the Y-datum sites. They are not —
they are the SPATIAL-AUTHORITY GUARDS**, and they are exemplary refusals. Their numbers have moved
too: measured 2026-08-19, `DoorBuilder.ts:594-602` throws `SpatialAuthorityError` (*“level … has no
elevation — refusing to place at Y=0”*) and `WindowBuilder.ts:921-931` is its §WINDOW-AUDIT-2026 C2
twin. **C86's own replacement citations `:503`/`:833` are equally stale** — it corrected C84's numbers
and then rotted the same way, which is the argument for citing the `§`-tag (`§WALL-Y-DATUM`) rather
than the line.

### Stack B — exists, and is deliberately unwired

`packages/geometry-kernel/src/producers/door.ts:1` (*"pure-TS Door geometry producer (S11-T1)"*),
`:25` imports the **L0** `Door`, `:27` `DoorWorldPlacement`; `:15-18` — *"positioned in WORLD
coordinates relative to the host wall's baseline + sill height… so this producer has no store
dependency."* **`producers/window.ts` — READ 2026-08-19; REGISTER ITEM 3 CLOSED.** 240 lines.
`:1` *"produceWindow — pure-TS Window geometry producer (S11-T2)"*, spec cited `:3`
(`phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11). Its design block `:5-13` states the model —
*"Window geometry = outer frame (4 boxes: 2 vertical mullions forming jambs + head + sill) + inner
mullions (per WindowGridSpec columns/rows from the type catalogue) + glass panes"*, *"For
schema-only windows (no system type known), we emit a single 1×1 grid"*, *"THREE-FREE — same
conventions as `produceDoor`"*, *"Output materials: 2 slots (frame + glass)"*. `:17` imports the
**L0** `Window` from `@pryzm/schemas`; `:19-29` `WindowWorldPlacement` — `axis`, `normal`, and an
`origin` documented `:22-23` as *"World origin = bottom-centre of the window opening at the wall
surface, **WITH `sillHeight` and `offset` already applied**"*, plus an optional `grid` override
`:26-28`. Fallback constants `:38-39` (`FRAME_FALLBACK_COLOR = '#3a3a3a'`, `GLASS_COLOR = '#a4c8e1'`).

✅ **It is the exact twin of `producers/door.ts`: store-free, THREE-free, L0-fed.** ⛔ **Nothing
under `producers/` may be deleted** — ADR-0331 §D5 is an escalated founder question (C84 §3.5.2), and
the self-host bake is the measured counter-example to an editor-only census.

⚠ **The placement contract is where a future parity harness will bite.** `WindowWorldPlacement.origin`
requires `sillHeight` and `offset` to be **pre-applied by the caller**, whereas Stack A's
`WindowBuilder` derives its own Y from `WallVerticalDatum` (§10 above). **The two stacks therefore
divide the same computation differently**, and that boundary — not the geometry — is what WO-G-2's
harness must pin. Recorded now so it is not re-discovered as a divergence.

`producers/wallVoids.ts:1` (`produceWallWithVoids`), `:10-15` verbatim:
> *"It is intentionally NOT wired into `WallFragmentBuilder` / `LayeredWallOpeningBuilder` — that is
> phase 3, which routes the booled descriptor on the async path behind a feature flag with the
> segmented mesh as a fallback (SPEC §3.3 / §4). Shipping the helper + its tests first lets the
> boolean be validated in isolation without touching the working render path."*
✅ **The compliant C84 §3.5 PARKED form** — phase, flag and fallback all named.

### Proven to agree? — **NO.**

C84 §5 lists the **door and window** parity harnesses as **OWED**. Confirmed: no file was found that
imports both a Stack-A builder (`DoorBuilder`/`WindowBuilder`/`LayeredWallOpeningBuilder`) and a
Stack-B producer (`produceDoor`/`produceWindow`/`produceWallWithVoids`).

### §10.1 — THE OPENING **PROFILE** AXIS (added 2026-08-19, lane ROUND1, **L-1200**) — PHASE-0 RULING

> **The founder asked for round windows *"with the capability to fix everywhere"* and, in the same
> ask, for **doors with a curved top**, chosen *"from the same place"*. Those are ONE problem:
> **a non-rectangular void in a wall.** This subsection is the ruling on whether this repo's wall
> bodies can carry one, measured before any geometry was written, per the §L955 precedent in
> `WallFragmentBuilder.ts`.**

#### The question was framed as "CSG vs the layered grid". **BOTH halves of that framing are wrong.**

There is no CSG arm in production (it is PARKED — R-6, [C85 §12 R-8](C85-ELEMENT-WALL.md)), and the
arm that draws most plain walls with openings is **not** the `Shape`-with-holes extrude either. There
are **five live body arms**, in **four different representations**, and only one of them can express
a curve today:

| Arm | Code | Representation | Non-rectangular void? |
|---|---|---|---|
| **A** — plain straight, **no mitre join AND no rake cap-drift** | `WallHoleBodyBuilder.buildWallHoleBodyGeometry` | `THREE.Shape` outer profile + `THREE.Path` holes → `ExtrudeGeometry` | ✅ **EXACT, TODAY, AT ZERO COST.** `Path.absarc` is admissible at every point the four `lineTo` calls sit (`:151-158` holes, `:139-144` the door notch walk). No CSG, no WASM, no new dependency, no new module |
| **B** — plain straight, **mitred or lofted end** | `WallFragmentBuilder.ts:2684, :2729` | abutting `BoxGeometry` gap / header / before / after | ❌ axis-aligned boxes only |
| **C** — layered straight | `LayeredWallOpeningBuilder.buildContinuousLayerGeometry` | x/y break grid + boolean `solid[i][j]` + greedy quad merge (§10 already names it *"a grid-subdivision / solid-cell rasteriser, not a boolean"*) | ❌ rectangles only — **the grid's alphabet has no curve in it** |
| **D** — curved wall (plain **and** layered) | `WallFragmentBuilder._buildCurvedWallWithOpenings` | radial bands: arc-station span × `[yLo,yHi]` | ❌ — and see D's **permanent** refusal below |
| **E** — instanced | `WallInstanceBridge` unit `BoxGeometry` × one T·R·S `Matrix4` | — | ❌ — **already excluded**: `_hasOpenings` (`WallFragmentBuilder.ts:1177, :1254`) drops *every* host of *any* opening |
| **F** — single-volume boolean | `producers/wallVoids.ts`, injected kernel producer | true CSG (manifold-3d) | ⚠ **PARKED, default OFF** (`window.__wallSingleVolume`), R-6; one of its two named blockers is **NOT MEASURED** (C85 §12 R-8) |

#### ⛔ Consequence 1 — **option (c) "route round openings to CSG unconditionally" IS NOT AVAILABLE.**

The CSG arm is deliberately parked behind a flag with an unmeasured datum blocker that C85 §12 R-8
explicitly forbids inferring past: *"Inferring 'safe to re-enable' from ONE closed blocker of two is
the inference C84 exists to prevent."* Turning it on to serve a new feature would be that exact
inference, with a new feature as the justification. **Recorded as unavailable, not as unconsidered.**

#### ⛔ Consequence 2 — arm **A**, the only capable arm, is the arm that runs on the FEWEST walls.

`WallFragmentBuilder.ts:2848` gates it on `!_hasMiterEnd`, where
`_hasMiterEnd = !!(openingStartMN || openingEndMN || _capDrift)`. `WallJoinResolver` sets a mitre
normal at every genuinely mitred corner (`:840`, `:1978`) — i.e. at **both ends of every wall in an
ordinary closed room**. So *"a circular hole is already expressible"* is true and would have been a
**wrong answer to the founder's question**: shipping only arm A gives a window that works on
free-standing and butt-joined walls and silently falls back on the mitred façade walls that motivated
the ask. ⭐ **This is why the ruling is not simply "(a), it already works".**

#### THE RULING — **(a), by ONE shared mechanism, for arms A · B · C; (b) PERMANENT REFUSAL for arm D.**

**PR-1 — the profile is an OUTLINE, and there is exactly one producer of it.** An opening's profile
is a 2-D outline in wall-local `(x, y)` derived from `{ profile, offset, width, height, sillHeight }`
by **one** module. Every arm consumes the SAME outline. ⛔ No arm may re-derive an arc. This is the
C84 **EI-9** rule applied before the second derivation exists, not after — the mistake C86 §9 records
itself making.

**PR-2 — `rectangular` MUST stay byte-identical on every arm.** For `profile: 'rectangular'` the
outline **is** the bounding box, the gasket of PR-4 is empty and **MUST NOT be emitted at all**.
Pinned as a non-regression baseline, in the shape of `WallProfileNonRegressionBaseline.test.ts` §(A2a).

**PR-3 — arm A consumes the outline directly.** The hole path and the door notch walk take the
outline's segments and arcs. A `round-arch` door head is the same notch walk with the flat
`lineTo` across the head replaced by an arc; a `circular` window is one `absarc` hole. **Door and
window reach this through the SAME function** — which is the structural reason the founder's *"same
place"* is honest rather than cosmetic.

**PR-4 — arms B and C consume it as BOUNDING BOX + GASKET.** Both already cut the profile's bounding
box (that is what they do for a rectangle). A profiled opening keeps that cut and adds **one gasket**
child: the plate `bbox − outline`, triangulated once, extruded through the wall (B) or the layer (C)
thickness, with reveal faces swept along the outline. It composes safely because it is **strictly
interior**:

- the mitre projection is gated on `x < 1e-5` / `|x − wallLength| < 1e-5`
  (`LayeredWallOpeningBuilder.ts:236-239`) and an opening may not touch either end
  (`WallHoleBodyBuilder.normaliseWallHoles` `:94`), so the gasket **can never meet it**;
- the §L955-ONE-CORNER-RULE top-cap drift is gated on the same two tests
  (`LayeredWallOpeningBuilder.ts:262-264`), so the gasket **can never meet it either**;
- the rake is applied AFTERWARDS as one group matrix (`_applyRakeShearToChildren`), so the gasket
  inherits the shear **by construction** — a circle in a raked wall's face becomes an ellipse in
  plan, which is the correct drawing of a circle set out on a leaning face, not an error.

> ⭐ **PR-4 is NOT "drawing a rectangle and calling it round", and the distinction is the whole
> ruling.** The forbidden thing is a **rendered silhouette** that lies about the model. The bbox cut
> is an internal decomposition that no user can see — the same status as the greedy quad merge at
> `LayeredWallOpeningBuilder.ts:300-320`, which also decomposes into rectangles and is not a defect.
> **The test that separates the two is stated here so it cannot be argued later: every reveal
> (jamb / soffit) face MUST lie on the outline, and NO face may lie on the bbox boundary inside the
> opening.** A gasket that fails that test is the defect `WallRake.ts:102` forbids.

**PR-5 — arm D (curved walls) REFUSES, PERMANENTLY, BY NAME.** Its bands are sliced in **arc-length**
space. A circle in arc-length space is not a circle in world space, and no choice of stations makes
it one — this is the same *kind* of statement as §L955-INSTANCED-ARM-DROPS-RAKE's *"a T·R·S matrix
cannot express what its property needs"*, and it is settled the same way: **exclude, do not teach the
builder to fake it.** The refusal MUST name the host (*curved wall*), the reason (*the void is set out
along the arc, not in a flat face*) and the live alternative (*a rectangular opening, or a straight
host*) — [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md). ⛔ A silent fall-back to `rectangular` is the
single worst available outcome and is forbidden by name.

**PR-6 — arm E needs no new clause, and MUST be pinned BOTH WAYS anyway.** `!_hasOpenings` already
excludes every opening-bearing wall, so a profiled opening cannot reach the box-drawing arm today.
**That is a consequence, not a guarantee.** Per the §L955 both-ways rule, a spec MUST assert *both*
that a profiled host does not instance *and* that an ordinary wall still does, so a later
"optimisation" that admits opening-bearing walls cannot quietly re-admit profiled ones.

#### THE VOCABULARY — **TWO ORTHOGONAL AXES IN ONE PLACE. ⛔ NOT three sibling pills.**

The founder's words were *"single / double / circular"*. **Shipping that literally would be a C84
EI-8/EI-9 one-vocabulary failure**, and the measurement says so rather than the preference:

- **`single | double` is a LEAF COUNT.** It is carried by `Opening.doorType` **and**
  `Opening.windowType` (`WallTypes.ts:37, :38`) — already two fields for one axis.
- **A profile is a VOID SHAPE.** It belongs to the **host's half** of the opening (§10, *"the two
  halves"*: the void is cut by the wall, the frame by the builder).
- Collapsing them makes **`double × round-arch` — an ordinary, common door — unexpressible**, and
  would require adding a shape value to **two** leaf-count fields.
- ⛔ **And it would land in neither guard**: `OpeningSchema` (`WallDataSchema.ts:79-86`) carries
  `id · type · offset · width · height · sillHeight · elementId` and **carries neither `doorType`
  nor `windowType`**, while its own header at `:77` claims *"Matches interface Opening in
  WallTypes.ts exactly."* **It does not, and has not.** (Recorded as a finding in its own right —
  §11 #21.)

**PR-7 — ONE field, on the host record.** `Opening.openingProfile`,
`z.enum(['rectangular','round-arch','segmental-arch','circular']).default('rectangular')`, declared
on the `Opening` interface **and** on `OpeningSchema`, shared by door and window. Leaf count stays
where it is. **Two axes, one place** — which is what the founder's *"from the same place"* actually
requires.

**PR-8 — NO `radius` FIELD. The bounding box stays `width × height` for every profile.** A
`circular` opening is `width === height`, `width` **is** the diameter, enforced by a `superRefine`
rather than by a second dimension vocabulary. **Reason, and it is a measurement:** every downstream
consumer already asks *"how wide is this hole?"* through `width`/`height` — `WallOccupancyStore`'s
span, the §WINDOW-CORNER-OVERFLOW cap, the plan-symbol extent, the property panel, the `WxH`
parametric size grammar, IFC. A `radius?` field alongside `width`/`height` would mint **three states,
one of which is nonsense** (both set) and would make every one of those consumers learn a second way
to ask one question — EI-9, again. ⭐ It also means the parametric and chat size grammars need **no
change at all**: `1x1m circular` already parses.

#### The refusal surface this axis creates — **enumerated, because an unenumerated refusal is a silent narrowing**

| Host / condition | Verdict | Reason that MUST be named to the user |
|---|---|---|
| plain straight wall (mitred or not) | ✅ serve | — |
| layered straight wall | ✅ serve (PR-4) | — |
| **curved wall** | ⛔ **REFUSE** | the void is set out along the arc, not in a flat face (PR-5) |
| raked straight host | ✅ serve | the circle shears with the face; that is correct set-out (PR-4) |
| `circular` with `width ≠ height` | ⛔ **REFUSE at the schema** | a circular opening's bounding box is square (PR-8) |
| profile taller/wider than the host's remaining span | ⛔ **REFUSE** | inherits the existing §WINDOW-CORNER-OVERFLOW and `WallOccupancyStore.canPlace` gates — ⚠ **both reason in `width`, and PR-8 is what keeps that true for a circle** |

⛔ **Every one of these MUST name the reason AND the live alternative (C16 CA-18), and MUST NOT fall
through to `rectangular`.** There is live precedent for the failure: an envelope hard-reject once fell
through to `[]` silently.

#### STATUS — **RULING ONLY. NOTHING IS BUILT.**

⛔ This subsection is a Phase-0 decision record, not a description of shipped code. As of
2026-08-19 there is **no `openingProfile` field, no outline module, no gasket and no refusal** in the
repo — `packages/geometry-window/src/` contains no `shape`, `circular`, `round`, `radius` or
`diameter` concept in any of its 17 files, and neither does `Opening`. **Read the code, not this
section, for what exists.** The implementation slices and their honest per-surface coverage are
[L-1200](../../04-reference/ISSUE-LOG.md).

### §10.2 — **AN OPENING'S HEAD AND SILL ARE HORIZONTAL IN EVERY TRUE ELEVATION** (added 2026-08-19, lane ELEV1, **L-1240**)

> **Founder, with a screenshot of Level 4 at +12.210 m:** *"Please review the ELEVATION SYMBOL for
> windows and doors — it is NOT CORRECT. It MALFORMS the window in elevation. **Where the bottom
> and top are TRUE HORIZONTAL, we ANGLED them.**"* The openings drew as leaning, skewed wireframe
> boxes — some tilting left, some right — while the balustrade balusters above and below drew
> correctly.

#### The invariant, and why it is geometry rather than taste

**WO-G-7 — normative.** A window's or door's **head and sill are HORIZONTAL LINES IN SPACE**. An
elevation projects orthographically onto a **vertical** picture plane, and a horizontal line
projects to a horizontal line under such a projection — always, for every view direction, every
host bearing and every rake. ⇒ **An angled head or sill in an elevation is not a stylistic choice.
It is evidence that the drawing is not a projection.** ⛔ It MUST NOT be "corrected" by clamping the
drawn line to horizontal; that hides a wrong projection behind a straight line. The fix is to fix
what the drawing IS.

#### ⚠ THE FOUNDER'S PREMISE IS CORRECT. THE LANE BRIEF'S PHYSICS WAS NOT — recorded so it is not re-minted

The brief that opened this work asserted *"a rake FORESHORTENS the opening vertically; it can never
skew its head and sill"*. **The first half is FALSE FOR THIS REPO** and would have been written into
this contract as an invariant. `WallRake.ts` displaces a wall **horizontally** about its base line
(`topOffset = height · cot θ · leftPerp(direction)`) and keeps the **height PLUMB**; a plumb rise
projects onto a vertical picture plane **unforeshortened**. Measured, not reasoned:
`OpeningElevationSymbol.probe.test.ts` case B — *a raked host viewed square-on is **byte-identical**
to an unraked one*, same 1.2000 m head, same 1.4000 m rise.

**WO-G-8 — normative.** ⛔ No contract, comment or test may state that a rake foreshortens an
opening vertically under this repo's `rakeAngleDeg` convention. It does not. A statement of that
form describes a rake about the wall's *long horizontal axis*, which is a different convention from
the one `WallRake.ts` defines.

#### THE MEASUREMENT — three defects had been read as one

Real segments, dumped through the real `OBC.TechnicalDrawing.toDrawingSpace` and the real
`orientTo`, on a 1.2 × 1.4 m opening at world Y 12.41–13.81, with the group transform copied
line-for-line from `WindowBuilder._seatHostedLeaf`. Angles are in the sheet's `(h, v)` frame:

| case | host | view | head / sill | jambs |
|---|---|---|---|---|
| A | vertical, parallel to sheet | CARDINAL | 0° | ±90° |
| B | **RAKED 75°**, parallel to sheet | CARDINAL | 0° | ±90° |
| C | vertical, bearing 30° | **NON-CARDINAL** | **30° ⛔** | **−60° ⛔** |
| D | RAKED 75°, bearing 30° | **NON-CARDINAL** | **30° ⛔** | unequal sides ⛔ |
| E / F | vertical, bearing ±20° | CARDINAL | 0° | ±90° |
| G | **RAKED 75°, bearing +20°** | CARDINAL | 0° | **84.76° ⛔** |

- **D1 — THE SKEW (C, D).** `TechnicalDrawing.orientTo()` handles **six** directions and its final
  branch **warns and leaves the quaternion untouched** — the identity on a fresh drawing.
  `toDrawingSpace` then keeps `(x, z)` and discards `y`: **a PLAN**. Every horizontal line returns
  tilted by its host's plan BEARING — *"some tilting left, some right"*, verbatim. ⚠ Reachable
  today: `SectionPlanToolHandler._commit` writes `projectionDirection` from the tail the **user
  drew**, at any angle, and `getDirectionForView` honours an explicit direction for `'elevation'`
  as well as `'section'`. The stock four elevations survived only because every generator emits
  N/S/E/W.
- **D2 — THE LEAN (G).** A raked host at a bearing to a CARDINAL sheet. The rake displacement is
  perpendicular to the wall and grows with height, so `sin(bearing)` of it lands in `h`: the jamb
  tilts by `atan(cot(rake)·sin(bearing))`. **This is a CORRECT projection of the solid** — not a
  maths bug, a bug in the decision to project a solid at all.
- **D3 — THE WIREFRAME.** There was **no elevation symbol for an opening at all**.
  `symbolicRuleForLayer()` opened `if (viewType !== 'plan') return null;` and its table held two
  plan keys; `SymbolicRuleRenderer`'s own line 241 said *"BEYOND door/window linework is projected
  silhouette, not an authored symbol."* So an opening was `EdgesGeometry(mesh.geometry)` — both
  faces plus the depth edges, and `HiddenLineRemoval` cannot drop the back one because occluders
  are grouped by `elementUUID` so *"an element never hides its own linework"*. ⭐ The identical
  founder complaint is already in the tree for another family:
  `PlumbingElevationSymbolBuilder`'s header quotes *"the existing toilets, showers etc. elevations
  AND plan view are true projections — too many lines"*. Plumbing got an elevation symbol in
  L-221 P3. Openings did not.

#### TO-BE — normative

- **WO-G-9.** An elevation view's picture-plane basis MUST be **total over every horizontal
  direction**, and MUST **refuse by name** for a direction with no horizontal component rather than
  fall back to any orientation. The authority is
  `packages/core-app-model/src/drawing/ElevationViewBasis.ts`; its vertical axis is **always world
  +Y**, which is what makes WO-G-7 hold at every angle. ⛔ A six-case table that no-ops on the
  seventh input is forbidden — that is the D1 defect.
- **WO-G-10.** An opening's elevation linework MUST be an **authored symbol set out from the
  record** (`offset · width · height · sillHeight · openingProfile`), not the projected silhouette
  of its solid. The producer is `packages/core-app-model/src/drawing/OpeningElevationSymbol.ts`.
- **WO-G-11 (§10.1 PR-1).** The elevation symbol MUST obtain its outline from the **same**
  `openingOutline()` every wall-body arm consumes. ⛔ It may not re-derive an arc — a `circular`
  window must be the curve the wall was cut with, sampled to the same tolerance, or the frame will
  not fit the hole. **The symbol is profile-driven from the day the profile exists, deliberately
  ahead of its UI**, because a rectangle hard-coded here re-opens this defect the week round
  windows ship.
- **WO-G-12 ([C09 §4.6.1 / §4.6.4b](C09-AI-AND-VISIBILITY-INTENT.md)).** Every emitted polyline MUST
  carry a `DrawingZone` and **no pen**, and MUST be injected onto **zone-suffixed** layers so the
  ladder and per-element overrides reach it. ⛔ A flat, zone-less symbol layer is forbidden — it is
  the L-280 flattening, and the prior elevation-symbol builder (`A-PLMB`) is already in breach.
- **WO-G-13 ([C65 §3.4](C65-ELEMENT-TYPE-SYSTEM.md)).** A door's swing indicator MUST be drawn
  **only when the model knows the hand**. ⛔ It may not default to `'left'` because the door schema
  does: a defaulted hinge side on a construction drawing is a construction error, not a cosmetic
  one.
- **WO-G-14 — THE AUTHORED SYMBOL REPLACES THE SOLID'S LINEWORK, AND THE RULE MUST BE *DERIVED*.**
  Where an elevation symbol is emitted for an element, that element's raw projected linework MUST
  be removed, so the drawing shows the symbol INSTEAD OF the wireframe rather than on top of it.
  ⛔ **The suppression MUST be keyed on the set of elements whose symbol was ACTUALLY EMITTED — never
  on a list of element types assumed to have symbols.** A type list fails in both directions: it
  **silently deletes** the linework of every opening the builder skipped or refused (WO-G-5's curved
  host, a missing store, a degenerate base line), leaving nothing where there was something wrong;
  and it does not cover a family that gains a symbol later until somebody edits it. ⭐ A stale
  hand-written enumeration is this repo's most-repeated defect shape; deriving the set removes the
  enumeration rather than maintaining it. **Both directions MUST be pinned** — *symbol emitted ⇒
  raw linework gone*, **and** *symbol absent ⇒ raw linework present* — the §L955 both-ways rule.
- **WO-G-15 — AN ELEVATION MUST BE ABLE TO SAY WHICH DEFECT IT IS EXHIBITING.** D1, D2 and D3 all
  malform an opening and are indistinguishable in a screenshot, and D2 is *a correct drawing*. A
  view MUST therefore report its own diagnosis — whether its direction is cardinal, how many of its
  hosts are both raked and oblique and by what angle, and how many symbols it injected and raw
  layers it suppressed. ⭐ An instrument beats another round of guessing; that is what the probe
  established and it applies to the next report as much as to this one.

#### NOT MEASURED — the honest register for this subsection

1. **Which of D1 / D2 / D3 the founder's screenshot actually is — STILL UNRESOLVED, but now
   INSTRUMENTED.** All three malform an opening and all three were live; without his project this
   lane cannot say which he photographed. D1 is the only one that makes a *horizontal* line
   non-horizontal, so it is the best match for his sentence — but a stock N/S/E/W elevation cannot
   reach D1, and "Level 4" reads like a building elevation. ⭐ **The `[ELEV-DIAG]` console line
   (WO-G-15) answers it from the next screenshot** rather than by argument. ⚠ **And the answer may
   be that the drawing was RIGHT**: if what he saw was D2, a raked wall genuinely leaning on a
   cardinal sheet, then the projection was correct and the expectation is the thing to reconcile.
   That possibility is named here rather than buried.
2. ~~**The raw mesh dump is NOT yet suppressed.**~~ **CLOSED 2026-08-19 — see WO-G-14.**
   `suppressSymbolisedElementLinework()` removes the raw projected linework of exactly those
   elements whose symbol was emitted, keyed on the emitted set rather than on an element-type list,
   pinned in both directions. ⚠ **What is NOT measured is the occlusion consequence**: a symbolised
   opening's solid no longer contributes a projection occluder, and the injected symbol carries no
   `viewDepth` stamp so it cannot become one either. The host wall's occluder is untouched and a
   window is mostly glazing, so the practical change is small — but it is a change, and it is
   recorded rather than assumed away.
3. **The frame inset is a drawing convention, not the model's frame width.** `WindowData.frameWidth`
   and the door's equivalent are not passed to the producer; 60 mm is declared, not read.
4. **`segmental-arch`'s inner frame line is a SIMILAR arch, not a true parallel offset** — its rise
   is a ratio of its width, so an inset width shrinks the rise. Round-arch and circular ARE exactly
   concentric, and that is pinned.
5. **Nobody has been asked** whether an architect wants swing chevrons on a *window* sash; the
   window record carries no operation field, so none is drawn.


### §10.3 — **THE WALL'S HALF OF THE ELEVATION SYMBOL, AND THE TESSELLATION-SEAM RULE** (added 2026-08-20, lane ELEV1, **L-1242**)

> **Founder, West elevation:** *"The RAKED WALLS on elevation are not rendering correctly — I
> believe the WINDOWS they do, but the WALL not. Also CURVED WALL renders in elevation with MANY
> VERTICAL LINES — they should render CONTINUOUSLY."*

⭐ He is describing §10.2 landing on one family and not the other, and the instrument §10.2 WO-G-15
required agrees with him: his own `[ELEV-DIAG]` line read `cardinal=yes · rakedObliqueHosts=10
maxJambTilt=17.85° · symbols=83 rawLayersSuppressed=50` — **83 openings drawn as drawings, sitting
inside walls still drawn as photographs of solids.**

#### ⛔ THE PROPOSED ROOT WAS "ON A RAKED WALL THE FACES SEPARATE AND CROSS". THE CONTROL KILLED THE CAUSAL HALF

Measured (`WallElevationSymbol.probe.test.ts`, real body builders, real shear matrix, real
projection, West elevation):

| case | wall | HORIZ | PLUMB (distinct h) | DIAGONAL |
|---|---|---|---|---|
| A | straight, square-on | 8 | 8 (5) | 0 |
| B | **RAKED 75°, square-on** | 8 | 8 (5) | 0 |
| C0 | **straight, bearing 20°, NO RAKE** | **16** | **8 (8)** | 0 |
| C | RAKED 75°, bearing 20° | **16** | 0 | **8 @ 95.24°** |

**Case C0 has no rake at all and already doubles**, its face pairs separated by
`thickness · sin(bearing)` = `0.3 · sin 20°` = **0.1026 m**, matching the measurement to four
decimals. ⇒ **The doubling is caused by OBLIQUITY ALONE; rake is neither necessary nor sufficient.**
Rake adds only the *lean* (case C), which is D2 — a correct projection of a leaning solid. Square-on
(A/B) the two faces project exactly on top of one another and the depth edges collapse to points,
which is why this survived: **the stock N/S/E/W elevations of an axis-aligned building show no
doubling at all.**

**WO-G-16 — normative.** A wall's elevation linework MUST be an **authored symbol** — the near face
once: base, top and the two ends — not the projected wireframe of its solid. ⛔ Drawing both faces
and the depth edges between them is the §10.2 D3 defect, and it is not confined to openings.

#### ⭐ AND THE CURVED WALL IS A **SECOND, INDEPENDENT** ROOT — TWO REPORTS, TWO ROOTS

| curved wall | `edgeAngleDeg` | HORIZ | PLUMB (distinct h) |
|---|---|---|---|
| 16 segments | 1 | 68 | **34** |
| 32 segments | 1 | 132 | **66** |
| 16 / 32 segments | 30 | 68 / 132 | 4 |

⭐ **`PLUMB = 2 × (segments + 1)`, EXACTLY.** The number of vertical lines in the drawing is a
function of the **tessellation segment count** — a number no architect authored and not a property
of the building. A curved wall is built as radial bands; every band boundary is a real facet; and
`THREE.EdgesGeometry`'s ~1° default dihedral threshold sits far below a curved wall's per-facet
angle, so **every tessellation seam is promoted to a drawn edge**. It appears on a square-on curved
wall too, so it is **not** the obliquity root.

**WO-G-17 — normative. A TESSELLATION SEAM IS NOT AN EDGE.** A curved element in elevation shows its
**silhouette and its real features** — base, top, ends, openings — and nothing else. ⛔ This MUST NOT
be addressed by raising a global dihedral threshold: that buys a clean curved wall by dropping
genuine edges everywhere else. The seam must be **never created** (draw the arc as a continuous
polyline traced from the body's own sampler) rather than filtered out afterwards.

**WO-G-18 (§10.1 PR-1, applied to the ARC).** A wall symbol MUST trace the arc using the **same
sampler the wall BODY is built from** (`computeStations`). ⛔ It may not re-derive the curve. Two
answers to *"where along the wall is this?"* is the shape of every join defect this subsystem has
had — `CurvedWallLayerBuilder`'s own header says so.

**WO-G-19 (C16 CA-18).** A wall the symbol **cannot express** MUST refuse and **keep its projected
linework**. Named cases: an authored elevation **profile** (the symbol draws a flat top and would
otherwise draw a top the wall does not have), and a curved wall whose stations cannot be resolved
(⛔ **never** fall back to the chord — a straight line where the building has an arc is the failure
hardest to notice). The refusal composes with §10.2 WO-G-14 automatically, because the suppression
is keyed on what was **emitted**.

#### NOT MEASURED — the honest register for this subsection

1. **`wallNearFaceSign` takes its sign from the CHORD.** An arc sweeping past ~90° presents its
   other face at one end and this picks one face for the whole run. Every arc wall this repo builds
   is well under that; recorded rather than assumed.
2. **A LAYERED wall draws ONE outline, not one per construction layer.** In elevation the visible
   face is the outer layer's, so this is right for the face — but a layered wall's END shows its
   stack, and the symbol draws a single end line. Not measured against a drawn example.
3. **The wall symbol carries no `viewDepth` stamp**, so like the opening symbol it cannot act as a
   depth-ordered occluder. Inherited from §10.2, not introduced here, and still unmeasured.
4. **Openings are not subtracted from the wall's face outline.** They do not need to be — the
   outline is the wall's boundary and the opening symbol draws the hole — but no test asserts the
   two read correctly together at a drawn scale.

### TO-BE — normative

- **WO-G-1.** ONE Y datum for the opening. **The authority is the host wall's**
  ([C85 §10 W-G-4](C85-ELEMENT-WALL.md)) and the frame MUST consume it, not recompute it.
- **WO-G-2 (EI-11).** Door and window parity harnesses are **OWED** (C84 §5). Each MUST consume
  C73's declared tolerance module (`packages/geometry-kernel/src/tolerance.ts`, shipped per
  **L-954**) and MUST NOT ship a bare call-site literal.
- **WO-G-3.** `wallVoids.ts` MUST keep its PARKED declaration until phase 3. ⛔ Its existence is not
  licence to delete `LayeredWallOpeningBuilder`, nor to enable the boolean without the flag and the
  fallback it names.
- **WO-G-4 (§10.1 PR-1/PR-2).** An opening profile MUST be produced by **one** outline module and
  consumed by every body arm. `rectangular` MUST remain byte-identical on every arm, pinned by a
  non-regression baseline. ⛔ No arm may re-derive an arc.
- **WO-G-5 (§10.1 PR-5, [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md)).** A host that cannot carry
  the requested profile MUST **refuse, naming the host, the reason and the live alternative**. ⛔ It
  MUST NOT silently fall back to `rectangular`. **The curved-wall arm refuses permanently.**
- **WO-G-6 (§10.1 PR-8, EI-9).** The opening's bounding box is `width × height` for **every**
  profile. ⛔ No `radius` / `diameter` field may be added alongside them.

---

## 11. THE DELTA

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** | **`PlanElementDragController.ts:570-571, :713, :715` writes `wallStore.updateDoor/updateWindow` and NEVER the standalone store** — zero occurrences of `doorStore`/`windowStore` in the file. **The live 2-D plan drag violates [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md)** | **the frame and the void diverge** — the leaf stays where it was, the hole moves | [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) · C84 **EI-1** | ⛔ **control first, watched RED**: drag a door in plan, rebuild the wall, assert frame and void share one offset |
| ~~**2**~~ | ✅ **CLOSED 2026-08-19 (`cdc32c9e`) — the gate exists.** `tools/ga-gate/check-hosted-dual-write.ts`, registered in `run-all.ts`, shrink-only at **3**, `MIN_FILES` honesty floor, one EXEMPT entry with its reason. Measured: **4657 files, 55 write sites in 23 files, 20 PAIRED, 3 UNPAIRED.** It keys on **call sites of `wallStore.updateDoor/updateWindow`**, not on command declarations — because two of the three live surfaces are neither commands nor bus verbs, and a declaration-shaped census passed this repo while both violated. ⚠ Its `?.()` blind spot is pinned by `__tests__/hostedDualWriteGate.spec.ts` (4/4) with the naive pattern kept as a live negative control: the first draft missed all nine property-panel sites | — | C84 **§8.d** — satisfied | ⛔ **Exit condition: baseline 0**, then flip to hard-0. ⚠ Declared unsoundness (C84 EI-10(c)): pairing is judged at FILE granularity, so a **partially**-paired file reads as PAIRED |
| ~~**3**~~ | ⛔ **REFUTED 2026-08-19 — TWELVE OF THE THIRTEEN PAIR CORRECTLY.** The row's justification was *"A grep of each for `doorStore`/`windowStore` produced no hits"*; `grep -c "doorStore\.update(\|windowStore\.update("` over the thirteen returns `2` for twelve of them and `0` for one, each in the C15 §8.1 `if (store.has(id)) store.update(id, …)` form on **both** legs. `git log -S` dates the pairing to the **Initial commit**, so this is not drift — the claimed grep cannot have been run. **Wrong by a factor of four, in the direction that makes the repo look worse.** Found by building `check-hosted-dual-write.ts`, not by re-reading | **only `mark`**, via the one true violator `UpdateElementMarkCommand.ts:56-57` | C84 **EI-1** | ✅ the gate now measures this continuously; the residual single command is inside its baseline of 3 |
| **4** | Persistence writes **both** records (`ProjectSerializer.ts:552` and `:1013-1014`) and reconciles neither; IFC reads only the embedded one (`WindowDoorReader.ts:12, :56`) | nothing while the pair agrees — **everything the moment it does not**, and #1/#3 guarantee it does not | C84 **EI-1** | the persistence migration — **owned by [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)** (C84 §9, as retracted) |
| **5** | `wall.delete` (L1) has **no** hosted cascade; the L2 path does (`DeleteElementCommand.ts:265-266`) | orphaned door/window records **and their 3-D meshes** | C84 **EI-4a**, **EI-5** | delegate, do not copy |
| **6** | `frameThickness`, `frameWidth`, `fireRating`, `accessibilityType` are schema fields the create path **silently discards** (§5 rows 10, 11, 14, 15) | four authored door properties, at creation | C84 **EI-2(a)** | round-trip each through `wall.createOpening` |
| **7** | ⚠ **RE-STATED 2026-08-19 — the row named the wrong site and understated the loss.** It read *"`swing` has 5 members; the legacy record has a 2×2. `'sliding'` is unrepresentable"* and cited `CreateWallOpeningCommand.ts:167-170`. **That command never reads `swing`** — it reads `opening.hingesSide`/`opening.swingDirection` directly, already split by `DoorPlacementFlip.ts:50-53`. The real transform was in the UI: `PropertyInspectorApply.ts` assigned `updates.swing` into a `swingDirection` key, matching the FIELD NAME and not the VOCABULARY. `Door.swing` (`Door.ts:67`) vs `swingDirection` (`DoorTypes.ts:64`, `z.enum(['inward','outward'])`) — **the intersection is EMPTY**. Not four of five carrying; **none of five** | **every swing the user set wrote an out-of-union value into the legacy record, silently** — not only sliding. **Partly CLOSED** by `mapSwingToLegacy` ([L-1040](../../04-reference/ISSUE-LOG.md)); the residual loss is that `'sliding'` still has no representation and is now REFUSED rather than silently mangled | C84 **EI-3**, **EI-8**, **EI-9** | ✅ **DONE** — `packages/geometry-door/__tests__/SwingVocabularyCensus.test.ts` (7/7) enumerates all three vocabularies, guard C **watched RED**, test D a negative control against the pre-fix source. **WO-Voc-1 remains OWED** |
| ~~**8**~~ | ✅ **CLOSED — STRUCK 2026-08-19; the row was stale AND its justification was one C85 had already retracted.** Frame Y is now `hostedLeafCentreY(resolveWallBaseYOrLevel(…), sill, height)` at `DoorBuilder.ts:620-625` / `WindowBuilder.ts:947-952`, both consuming `WallVerticalDatum.ts` (`:103`, `:119`, `:174`). Fixed by **`8f63fb6f`**, already on `main` and already recorded RESOLVED by [C85 §10](C85-ELEMENT-WALL.md) (eleven datums agree, leaf-vs-hole delta **0**). C86's cited lines had all rotted, and its **LATENT** grading rested on *"nothing authors either offset non-zero today"*, which C85 §10 records as *"never tested and … FALSE"* | nothing — closed | C84 **§4D** — satisfied | — (see §10) |
| **9** | Default divergence: `width` 0.9 (schema) vs 1.0 (command); window `sillHeight` 0.9 vs 1.0 | a created opening differs from `parse({})` in a field neither reports | C84 **EI-9** | one default per field |
| **10** | `WindowBuilder` ships both `'window'` (`:308`) and `'Window'` (`:578, :631`) against a C15 §12 **freeze of one** | nothing today (consumers lowercase) — the freeze is already broken | [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) | one spelling from the producer |
| ~~**11**~~ | ⛔ **RETRACTED 2026-08-19 — WRONG DENOMINATOR.** Both sites are **wardrobe** code, not door code: `:320` is inside `createDefaultSections()` (`:313`, answer text `:310` *"modify your wardrobe"*), `:575` inside a wardrobe config builder (`:567-571`); both write `WardrobeSectionConfig.doorType` (`WardrobeCabinetTypes.ts:59`), whose union is `'double-hinged'\|'sliding'\|'glass'\|'mirror'\|'none'` (`:35-40`). `'double-hinged'` **is a member** — no defect. `'hinged-left'` is not, but that is a **furniture** out-of-union write, [L-1041](../../04-reference/ISSUE-LOG.md), not a wall-opening one. Neither reaches `Door.parse` or `wall.openings[]`. **§9's own collision note had already said this and lost to the more confident paragraph above it** | nothing on this family | — | — (see §9) |
| **12** | `'opening'` names two unrelated concepts; `DeleteElement.ts:52-53` routes the ambiguous literal to the **slab** opening command | a mis-route waiting for a producer | C84 **EI-9** | disambiguate the word, or gate on the host family |
| **13** | Door and window parity harnesses **OWED** (C84 §5) | nothing today; every future kernel divergence ships unseen | C84 **EI-11** | build them on C73's tolerance |
| **14** | The bake worker handles no openings — three comments describing future work | in self-host bake: **walls with no voids and no leaves** | C84 **EI-6**-adjacent | declare or implement |
| **15** | `door.move`/`window.move` declare `['door']`/`['window']`, omitting `wall` | nothing while they refuse; a live C15 §8.1 violation the moment they do not | C84 **EI-7**, C15 §8.1 | correct the declaration before re-enabling |
| **16** | The batch-create verbs do **not** refuse while their single twins do | a caller routes around the refusal | C84 **EI-4a**, [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) | make them consistent |
| **18** | ⛔ **NEW — `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` writes `wallStore.updateDoor/updateWindow` at NINE sites (`:159, :164, :169, :174, :182, :187, :192, :197, :238` — re-measured by the gate) and the standalone store at NONE.** The file had zero `doorStore`/`windowStore` occurrences. **This census did not contain it**, because C86 built the table by sweeping COMMANDS and this is a UI apply path | `width`, `height`, `sillHeight`, `fireRating`, `accessibilityType` edited from the property panel leave the 3-D leaf stale — the same divergence as #1, from the second most-used surface in the family | [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) · C84 **EI-1** | ✅ **the gate is BUILT** (`check-hosted-dual-write.ts`, `cdc32c9e`) and keys on call sites repo-wide, **not** on command declarations — a command-shaped census misses BOTH live surfaces. This file is 1 of its 3 baseline entries; **the pairing itself is still OWED** — eight more paired writes is a property-panel behaviour change and belongs with the gate that keeps it paired, not ahead of it. [L-1042](../../04-reference/ISSUE-LOG.md) |
| **19** | ⛔ **NEW — `DoorCommitter` is never constructed in production, so the whole plugin-committer arm of `door.setSwing` reaches nothing.** It is `new`-ed only at `bootstrap.render.everything.ts:140`, reached only via `SceneBootstrap.bootstrapScene`, which **requires** a canvas (`SceneBootstrap.ts:61`); `src/main.ts:402` boots `canvas: null` → the idle path (`SceneBootstrap.ts:226`). `PropertyInspectorApply`'s comment asserted the opposite chain (*"→ DoorCommitter.onUpdate() → produceDoor() rebuild → updated mesh"*) | nothing beyond what #3/#18 already cost — but it means a reader auditing `door.setSwing` finds a comment describing a live pipeline that does not run | C84 **§3.5.1(d)** — the CALL axis | the comment is corrected at the site ([L-1040](../../04-reference/ISSUE-LOG.md)). Whether the committer arm should be wired or declared dormant is **C84 §3.5 PARKED work, not C86's** |
| **20** | ⚠ **NEW — `DoorBuilder.ts:526` stamps a THIRD tag, `'DoorLeaf'`, that C15 §12 never enumerated**, and both builders ship both casings (`DoorBuilder.ts:271` `'door'` vs `:476`/`:526` `'Door'`; `WindowBuilder.ts:376` vs `:646`/`:730`), in four files across two families | nothing today — every comparing consumer lowercases (`GLBExporter.ts:217`, `DeleteElement.ts:51`) | [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) | ⚠ **severity DOWNGRADED from #10**: the lowercase emits are inside the view-definition subscription (`DoorBuilder.ts:252`, `WindowBuilder.ts:357`), not the mesh stamp. The freeze is still broken from four files, and `'DoorLeaf'` must be DECLARED as a sub-part tag (WO-ID-2's shape) |
| **17** | **`CreateWallOpeningCommand.ts:12` declares `affectedStores = ["wall"]` while adding to `doorStore` (`:155`) and `windowStore` (`:204`)** — and `CreateWindowsParametricBatchCommand.ts:89` inherits it as `['wall']`. This is the command §12 R-1 names as *"the one atomic command"*, so every refusing create verb points at it | ✅ **ANSWERED AND FIXED 2026-08-19 (`37c416ff`).** `restoreSnapshot` has exactly TWO call sites, **both inside `execute()`** — `CommandManagerImpl.ts:325` (`success:false`) and `:428` (threw); its own header `:641` says *"rollback on failed execute only"*. `undo()` (`:743`) and `redo()` (`:794`) call the command's own methods directly and never build or apply a snapshot; `performUndoRedo.ts` has **zero** `napshot` occurrences. **So NO UNDO PATH WAS EVER AT RISK — the exposure is the execute-failure ROLLBACK.** For `CreateWallOpeningCommand` that is **LATENT** (its only `success:false` returns are `:91`, `:96`, `:114`, all BEFORE the write, and both store writes plus the graph write sit in swallowing try/catch at `:184`, `:228`, `:248`). For **`CreateWindowsParametricBatchCommand` it is REACHABLE**: `:299` `child.execute(ctx)` writes N windowStore records, then `:337` `throw err` re-raises from the post-loop summary/span block → `CommandManagerImpl:428` → a `['wall']`-scoped restore returns the walls without their openings while windowStore keeps N records and WindowBuilder keeps N meshes | C84 **EI-7c** — the declared set MUST be the written set | ✅ **DONE.** Declarations corrected to `["wall","door","window"]` and `['wall','window']`. Widening cannot perturb undo routing: `performUndoRedo.ts:553` reads `pair?.affectedStores` from the BUS PatchPair, and `:555-559` names this command commandManager-only by design, so `_covered()` (`:479`) never sees it [L-1031](../../04-reference/ISSUE-LOG.md) |
| **21** | ⛔ **NEW 2026-08-19 (lane ROUND1, [L-1200](../../04-reference/ISSUE-LOG.md)) — `OpeningSchema` does NOT match the `Opening` interface, and its own header says it does.** `WallDataSchema.ts:77` declares *"Matches interface Opening in WallTypes.ts exactly"*; `:79-86` carries `id · type · offset · width · height · sillHeight · elementId` and carries **neither `doorType` nor `windowType`** (`WallTypes.ts:37, :38`). The leaf-count axis — the one the mode bar authors — is **unvalidated at the store's only Zod door**. ⭐ Found while measuring where an `openingProfile` field would have to land: **a new field added to the interface alone would be invisible to the guard, exactly as these two already are** | nothing *today* — `WallStore.addOpening` (`:1165`) uses `safeParse` as a **guard** and pushes the ORIGINAL object, so unknown keys are not stripped. ⚠ That is a property of ONE call site, not of the schema: any consumer that used `parseResult.data` would silently drop both fields | C84 **EI-2(a)**, **EI-9** | add both fields to `OpeningSchema`, or correct the header's claim. ⛔ **The header is the defect either way** — a comment asserting a correspondence that does not hold is the L-809/L-812 shape |
| **22** | ⚠ **NEW — `elementCreationMatrix.ts:285-292` declares door mode `{ id: 'single', key: 'D' }` and window `{ id: 'single', key: 'W' }`. Neither matches the shipped bar**, which is `S`=Single / `D`=Double from `DoorModePicker.ts:54, :61` and `WindowModePicker.ts:55, :62`. Door and window do not consume `DrawingModeBar`, so the row is **unenforced drift** | nothing today; the declaration is the thing a future consolidation would trust | [C82](C82-RIBBON-CAPABILITY-SURFACE.md) · C84 **EI-3** | either route door/window through `DrawingModeBar` or delete the rows. ⚠ **Relevant to §10.1**: the profile axis must not be declared in a matrix nothing reads |

---

## 12. REFUSALS

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `door.create` / `window.create` refuse **unconditionally**, and each **names the one atomic command** with its exact payload shape | `CreateDoor.ts:107` (reason), `:154`; `CreateWindow.ts:63`, `:98` | ✅ **EXEMPLARY.** It cites its own **CA-21 executed read-back** as the evidence — *"saw the dispatch report success while the authoritative doorStore … did not change"* — which is exactly what [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) and C84 EI-10(b) require. **This is the C84 EI-4a shape reached correctly: one route per intent, and the refusal points at it** |
| **R-2** | `door.move` / `window.move` refuse | `MoveDoor.ts:109` (reason `:72-73`), `MoveWindow.ts:108` (reason `:71-72`); hazard `:51-52` / `:50-51` | ✅ **CORRECT AND REQUIRED** under C16 CA-18, and the **only** correct response to WO-U-1's deliberate ring-buffer absence. ⛔ MUST NOT be "fixed" into silent success. ✅ **REGISTER ITEM 4 CLOSED — the constant bodies are READ, and they are exemplary.** `DOOR_MOVE_UNREACHABLE` (`MoveDoor.ts:72`) verbatim: *"door.move writes the detached plugin door store that nothing renders, exports or persists, and no production surface dispatches it. Moving a door along its host wall commits through **door.setOffset (payload keys: doorId, newOffset, prevOffset) → SetDoorOffsetCommand → the geometry wallStore opening**, which is what MOVE_COMMAND_BY_TYPE and the 3-D gizmo already dispatch."* `WINDOW_MOVE_UNREACHABLE` (`MoveWindow.ts:71`) is its exact mirror. **Each names the mechanism, the live replacement verb, AND that verb's payload keys** — the C16 CA-18 bar and then some. A refusal nobody had read is now a refusal that has been verified |
| **R-3** | `DoorBuilder` throws `SpatialAuthorityError` rather than place at Y=0 | `DoorBuilder.ts:496-501` | ✅ **EXEMPLARY** — *"refusing to place at Y=0"* |
| **R-4** | `WindowBuilder` throws rather than place a ghost window at floor level | `WindowBuilder.ts:817-825` (§WINDOW-AUDIT-2026 C2) | ✅ exemplary — *"misconfigured levelId must produce a loud error, not a ghost window at floor level"* |
| **R-5** | The window write is guarded against duplication | `CreateWallOpeningCommand.ts:187` (`!windowStore.has(this.openingElementId)`) | ✅ correct |
| **R-6** | `producers/wallVoids.ts` is **deliberately not wired** — phase 3, behind a flag, segmented mesh as fallback | `wallVoids.ts:10-15` | ✅ **THE COMPLIANT PARKED FORM** (C84 §3.5). Copy this shape |
| **R-7** | The bake worker builds no openings | `HeadlessBakeSession.ts:13, :58, :92` — three future-tense comments | ⚠ **UNDECLARED ABSENCE, DECLARED HERE.** A self-host bake produces walls with no voids and no leaves. It MUST refuse or declare |
| **R-8** | No rotate verb, no level-change verb | §6 | ✅ **CORRECT BY C15 §2** — a hosted element has no independent world-space coordinate and no independent level. **Now declared, so nobody mints them** |
| **R-9** | No `setMaterial` verb; colour is per-part | §9 | ⚠ **DECLARED HERE.** Previously an undeclared absence |
| **R-10** | The ten `<kind>.delete` bus verbs are **DORMANT, not broken** | C84 §3.5.3 | ✅ ⛔ do not delete — PRYZM 3 target vocabulary |
| **R-11** | A **curved** wall REFUSES any non-rectangular opening profile, permanently | §10.1 PR-5 | ⛔ **OWED — the profile axis is a RULING, not code.** When built it MUST name host + reason + alternative. The reason is structural and will not change: the bands are sliced in ARC-LENGTH space |
| **R-12** | A `circular` profile whose `width ≠ height` REFUSES at the schema | §10.1 PR-8 | ⛔ **OWED.** This is what makes "no `radius` field" safe rather than lossy — without it, `width`/`height`/`profile` mint a nonsense state nothing refuses |
| **R-13** | The **single-volume CSG** arm is **not** available to serve a new profile | §10.1 Consequence 1, R-6, [C85 §12 R-8](C85-ELEMENT-WALL.md) | ✅ **DECLARED HERE.** Recorded so the next reader knows option (c) was measured and rejected, not overlooked |

### Explicitly NOT REFUSED, and that is the finding

`PlanElementDragController` drags a door, writes the host record, reports success, and leaves the
standalone record stale — with **no refusal, no warning, and no gate**. Under C84's governing
sentence (`WallRake.ts:50-62`) that is the worst of the three states.

---

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances (C84 EI-1b).

> ✅ **WORKED 2026-08-19. TEN of the eleven are CLOSED; ONE remains (item 9, which is C82's), plus
> item 10's deliberate DEAD exclusion.** Three closures **changed the finding rather than confirming it** — items 2, 5
> and 6 — which is the argument for running a blank instead of reasoning about it. Item 6 closed by
> **retracting a violation C86 had asserted**; item 2's blank was the wrong *shape* of question, not
> a missing answer; item 5's premise ("detached") was measured to be about readers, not existence.

| # | Question | Status |
|---|---|---|
| 1 | `DoorBuilder.ts`'s `userData.elementType` assignment sites | ✅ **CLOSED — §1.** Door does what window does: `:271` `'door'` lowercase vs `:476`/`:526` `'Door'`, plus `DoorPlanSymbolBuilder.ts:289` vs `:302`/`:315`/`:330`. **And a THIRD tag nobody had recorded: `'DoorLeaf'` (`:526`).** Every window citation in the old table had rotted (`:308/:578/:631` → `:376/:646/:730`). Severity DOWNGRADED — the lowercase emits are view-definition subscription tags, not the mesh stamp (§11 #20) |
| 2 | GLB export's door/window read path | ✅ **CLOSED — §3, and the blank was the wrong QUESTION.** There is no store read to find: `GLBExporter.ts:144` filters on `object.userData.elementType` and walks the **THREE scene** — C84's representation #4. So GLB exports whatever the builders drew, inheriting the split-brain wholesale: a stale `doorStore` offset (§11 #1/#18) exports a leaf in the wrong place. **"No candidate located" invited the reader to conclude "absent"; it was "present, in a representation this contract's table did not range over."** |
| 3 | `packages/geometry-kernel/src/producers/window.ts` contents | ✅ **CLOSED — §10.** 240 lines, exact twin of `producers/door.ts`: store-free, THREE-free, L0-fed. Its `WindowWorldPlacement.origin` requires `sillHeight`/`offset` **pre-applied by the caller**, while Stack A derives Y itself — that boundary, not the geometry, is what WO-G-2's harness must pin |
| 4 | `DOOR_MOVE_UNREACHABLE` / `WINDOW_MOVE_UNREACHABLE` constant bodies | ✅ **CLOSED — §12 R-2.** Both read verbatim at `MoveDoor.ts:72` / `MoveWindow.ts:71`. Each names the mechanism, the live replacement verb **and that verb's payload keys**. Exemplary, and now verified rather than assumed |
| 5 | Whether the plugin `DoorStore`/`WindowStore` are instantiated and bound at runtime | ✅ **CLOSED — §2 WO-S-2, on all four C84 §3.5.1 axes.** They **are** constructed (`PluginRegistry.ts:256`/`:264`), **are** called (`bootstrap.everything.ts:142`), **are** reached from the production entry (`src/main.ts:397`) and **are** in the build graph. **Detached from READERS, not from the runtime** — a live, written, unread store, which is a different object from one that is never built |
| 6 | Whether `QueryEngine.ts:320, :575`'s `doorType` values reach a store write | ✅ **CLOSED BY RETRACTION — §9, §11 #11.** They are **wardrobe** sites writing `WardrobeSectionConfig.doorType`. `'double-hinged'` is a valid member of that union; `'hinged-left'` is not, but that is a furniture defect ([L-1041](../../04-reference/ISSUE-LOG.md)). Neither reaches `Door.parse` or `wall.openings[]`. **C86 graded a furniture value against a door union** |
| 7 | `DoorSystemTypeStore`'s built-in type ids | ✅ **CLOSED — NINE, and the first grep for them was WRONG.** `BUILT_IN_TYPES` (`DoorSystemTypeStore.ts:139`, seeded `:308`) builds each entry through `makeBuiltIn(id, name, category, …)` (`:108`), so the ids are **bare positional string literals**, not `id:` properties — `grep -n '^\s*id:'` returns only the interface field `:40` and that parameter `:109`, and reads as *"there are none"*. The correct probe is `grep -n "^\s*'dt-"` → **9**: `dt-solid-timber:141`, `dt-white-primed:159`, `dt-glazed-timber:176`, `dt-glazed-aluminium:194`, `dt-modern-entrance-glazed:211`, `dt-fire-rated-60:233`, `dt-fire-rated-30:250`, `dt-steel-industrial:267`, `dt-aluminium-commercial:284`. **Window has EIGHT** (`WindowSystemTypeStore.ts`): `wt-single-pane:184`, `wt-timber-casement:197`, `wt-timber-double-hung:210`, `wt-aluminium-commercial:223`, `wt-upvc-casement:236`, `wt-upvc-tilt-turn:249`, `wt-steel-crittal:262`, `wt-aluminium-triple-glazed:275`. ⭐ **Recorded because the failure mode is the family's own:** a grep shaped for the wrong syntax returns empty, and **empty is indistinguishable from absent**. `CreateWallOpeningCommand.ts:143` already warns that an unresolved `systemTypeId` ships a door with no finish and a blank schedule — these nine ids are the set that must resolve |
| 8 | Whether `plugins/plan-view`'s injected stores are fed from the authority; behaviour when the optional `windowStore` is absent | ✅ **CLOSED — §2 WO-S-3, and the answer dissolves the question.** `new PlanViewCanvasHost(` has **ZERO production call sites** — 2 hits, both tests. The fifth view is test-only. Absent `windowStore` degrades **silently** to `[]` (`:420-422`) into `projectWallEdges`/`computePocheFills`: *a plan view with no window source and a building with no windows are the same value*. PARKED without the compliant PARKED declaration |
| 9 | Whether the UI still offers the four refusing verbs | ⛔ **STILL OPEN — owned by [C82](C82-RIBBON-CAPABILITY-SURFACE.md).** ⚠ A verb-only control census would miss this family's live mutation paths, which are off-bus **and now measured to be two, not one** (§11 #1 and #18) |
| 10 | `packages/persistence-client/src/loader/` | ⛔ deliberately not measured; DEAD |
| 11 | Whether any path reverses `CreateWallOpeningCommand` through `createSnapshot` rather than its own `undo()` | ✅ **CLOSED — §4, §11 #17, `37c416ff`.** `restoreSnapshot` is called at `CommandManagerImpl.ts:325` and `:428` **only**, both inside `execute()`. No undo path was ever at risk; the exposure is the execute-failure rollback — **LATENT** for the single command, **REACHABLE** for `CreateWindowsParametricBatchCommand` via `:337`. Declarations corrected regardless (EI-7c) |

### What this pass ADDED to the register

⛔ Closing nine questions produced three new ones. Recorded here so the ledger does not read as
shrinking when it is not.

| # | Question | Why it matters |
|---|---|---|
| 12 | **Whether the eight non-swing `PropertyInspectorApply` sites (§11 #18) are user-reachable for each field**, or whether some are dead panel rows | Decides whether #18 is eight live desyncs or fewer. The sites are measured; their UI reachability is not, and it is the same C82 question as item 9 |
| 13 | **Whether `DoorCommitter` / `WindowCommitter` should be wired or declared dormant** (§11 #19) | `bootstrap.render.everything.ts:140` constructs it on a path production never takes. C84 §3.5 requires PARKED to name its flag, phase and fallback; this names none. **Not C86's to decide** — it is the committer architecture's |
| 14 | **Whether `'DoorLeaf'` (`DoorBuilder.ts:526`) has any consumer**, and whether `'WindowPane'` or an analogue exists | A sub-part tag outside C15 §12's enumeration. If nothing reads it, it is an EI-13 emitter with no consumer; if something does, C15 §12's list is incomplete |

## Appendix — C84 claims this contract CONFIRMED, REFINED or REFUTED

| C84 claim | Verdict |
|---|---|
| `wall.opening` has **two rival records**; persistence reads `doorStore`/`windowStore`; IFC reads openings embedded on the wall | **CONFIRMED** — `ProjectSerializer.ts:47-48` (imports) and IFC `WindowDoorReader.ts:1, :7, :12, :56` wired at `FragmentReader.ts:89` |
| …at `ProjectSerializer.ts:704-705` | ⛔ **CITATION WRONG for the LIVE file.** The reads are at **`:1013-1014`**. And the serializer **also** writes the embedded record at **`:552`** — so it persists **both**, unreconciled. C84 recorded one half |
| *"nothing measured reconciles them"* | ⛔ **ALREADY RETRACTED BY C84 ITSELF**, correctly. C15 §8.1 mandates the reconciliation. **C86's contribution is the compliance census**: 8 honour it, 13 desync outside its scope, **1 live surface violates it** |
| The authority question is DECIDED by C15 §1 + §2 — `wall.openings[]` wins | **CONFIRMED** — C15 `:15, :16, :17, :24, :29-31, :38` |
| `CommandEventBridge.ts:627-631` deliberately removed the door/window/stair `.created` cases | **CONFIRMED** verbatim at `:626-631` |
| `performUndoRedo.ts:345-352` — the door/window/level absences are deliberate and documented | **CONFIRMED** verbatim at `:345-351` |
| `DeleteElementCommand.ts:243, :250-267` reverses the hosted cascade; `DeleteWall.ts:14-17` has none | **CONFIRMED** both, and **sharpened**: `DeleteWall.ts` blames an S11 that has arrived, and `DeleteElementCommand.ts:264` admits the cascade is **blind** |
| `'opening'` has NO producer (§4E) | **CONFIRMED**, and **sharpened**: the three hits are `OpeningStore.ts:29, :37, :48`, all storeEventBus — and `OpeningStore` is the **SLAB/ROOF** hole store, so `DeleteElement.ts:52-53` routes the literal to a different family's command |
| `DoorBuilder.ts:498` / `WindowBuilder.ts:818` are the Y-datum sites (§4D, §9) | ⛔ **REFUTED — they are the SPATIAL-AUTHORITY GUARDS**, and they are exemplary refusals. ⚠ **C86's own replacement citations (`:503`/`:833`) have since rotted too** — measured 2026-08-19 the guards are `DoorBuilder.ts:594-602` / `WindowBuilder.ts:921-931` and the datum is `DoorBuilder.ts:620-625` / `WindowBuilder.ts:947-952`. Cite the `§WALL-Y-DATUM` tag, not the line |
| The frame/void Y-datum divergence is **LATENT** (§10, §11 #8) | ⛔ **RETRACTED — the row was CLOSED before C86 was written.** `8f63fb6f` fixed it and [C85 §10](C85-ELEMENT-WALL.md) recorded it RESOLVED. The **LATENT** grading also rested on a ground C85 §10 had already measured FALSE. Struck in §10 and §11 |
| `slabBaseOffset` occurrences in `geometry-door/src` + `geometry-window/src` = **0** | **CONFIRMED** |
| door/window/slab parity harnesses OWED (§5) | **CONFIRMED for door and window** — no file imports both a Stack-A builder and a Stack-B producer |
| — (not in C84) | **NEW:** `door.create`/`window.create` **REFUSE**, naming `wall.createOpening` — the correct EI-4a shape; `PlanElementDragController` violates C15 §8.1; 13 commands desync outside §8.1's scope; `'sliding'` is unrepresentable; two default divergences; `WindowBuilder` breaks C15 §12's freeze from one file |

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **PUBLISHED — and the founder's working example (*"change all windows type to …"*)**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `door` · `window` |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`:1708 (shared arm) |
| **Type catalogue** | ✅ both injected today via NAMED legacy fields (`resolveDoorSystemType` / `resolveWindowSystemType`, `ZeroTokenChatBridge.ts:866-891, 931-936`) |
| **Type field on the record** | ✅ `systemTypeId` on `WindowOpening` (`geometry-window/src/WindowTypes.ts:87`) and its door twin |
| **Executor the chat must use** | `window.updateSystemTypeBatch` → `UpdateWindowSystemTypeCommand` → geometry `windowStore`; `door.updateSystemTypeBatch` → `UpdateDoorSystemTypeCommand` → geometry `doorStore`. Both preserve `id` / `openingId` / host void (C15) via `planWindowTypeChange` / `planDoorTypeChange` |
| **Chat capabilities published TODAY** | `set-window-type` · `set-door-type` · `set-window-dimensions` · `set-door-dimensions` · `set-width` · `set-sill-height` · `delete-windows-scoped` · `delete-doors-scoped` |
| **Retiring condition** | n/a — published. Open: L-1141, L-1142. |

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

- ⛔ **L-1141 — BOTH verbs report success when they changed nothing.** `UpdateWindowsSystemTypeBatch.ts:161` and `UpdateDoorsSystemTypeBatch.ts:161` return an unconditional `{forward: [], inverse: []}`. ⭐ **This is the family the founder calls working**, which is exactly why the row matters: the *transcript* is honest only because `BATCH_REPORT_EVENTS` (`ZeroTokenChatBridge.ts:1238, 1240`) subscribes to the CustomEvent and turns `success:false` into *"Nothing was changed"*. Remove that subscription and the founder's working case becomes L-995 again.
- ⚠ **L-1142 — declared `['all','selection']`, honours `level`, `room` and `orientation`.** *"Change all windows on level 2 to timber casement"* **works today and is undeclared.**
- ✅ `door.setSwing` correctly owns *"change all doors to left swing"* — `CatalogueFamilies.ts` `rejectRef: /\bswings?\b/`. A worked example of two capabilities sharing an opener without colliding (C67 §4 rule 7).

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.
