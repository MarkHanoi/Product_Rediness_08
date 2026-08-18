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

| Literal | Producer |
|---|---|
| `'window'` (lowercase) | `packages/geometry-window/src/WindowBuilder.ts:308`; `WindowPlanSymbolBuilder.ts:145` |
| `'Window'` (PascalCase — **the canonical one**) | `WindowBuilder.ts:578`, `:631`; `WindowPlanSymbolBuilder.ts:158`, `:171` |
| `'window'` (store event) | `WindowStore.ts:50, :75, :106, :115, :179` |
| `'door'` (store event) | `DoorStore.ts` — emit sites recorded in `tools/ga-gate/deterministic-regeneration-baseline.json:66-70` |
| `'door'` / `'window'` (registry) | `ElementTypeRegistry.ts:95, :110`; `SystemIntents.ts:162, :167, :235, :240` |
| `'door'` / `'window'` (command self-tag) | `DeleteElementCommand.ts:337` / `:293` |
| `'WallPart'` | `WallFragmentBuilder.ts:2332` — the solid **around** the void |

[C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (`:71` heading, `:78`): the canonical tag is **PascalCase**
(`'Door'`, `'Window'`); consumers MUST normalise via `.toLowerCase()`; **⛔ *"Do NOT change the
stored casing — it is frozen."*** `DeleteElement.ts:51`'s lowercase is that mechanism working as
specified — **not** the accident C84 §4E first read it as.

> ⚠ **MEASURED VIOLATION OF C15 §12: `WindowBuilder` ships BOTH spellings.** `:308` emits lowercase
> `'window'`; `:578` and `:631` emit `'Window'`. C15 froze **one**. Every comparing consumer
> lowercases, so nothing is broken today — but the freeze is already broken, from one file.
> **`DoorBuilder.ts`'s `userData.elementType` assignment sites are NOT MEASURED.**

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
- **WO-S-3.** The plan-view plugin's stores (6) are a **fifth** view. Whether they are fed from the
  authority is **NOT MEASURED**, and `windowStore` being optional at `:156` means a plan view can run
  with no window source at all. MUST be measured and declared.
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
| **GLB export** | **NOT MEASURED** | no door/window store read located in `packages/file-format/src` |
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

✅ **RE-MEASURED 2026-08-18 and the row is exact, line for line** —
`grep -n 'updateDoor\|updateWindow' PlanElementDragController.ts` → **`:570`, `:571`, `:713`, `:715`,
and nothing else**; `grep -c 'doorStore\|windowStore\|geometry-door\|geometry-window'` → **0**.
Recorded because a citation that survives re-measurement unchanged is worth as much as one that does
not: this census is the sharpest measurement in this contract and it is still true.

**Thirteen more commands mutate the record on one side only** (non-`offset`, so outside C15 §8.1's
literal words, but they desync the same pair):
`UpdateWindowWidthCommand:29,:39` · `UpdateWindowSillHeightCommand:34,:44` ·
`UpdateWindowHeightCommand:34,:44` · `UpdateWindowFrameColorCommand:28,:38` ·
`UpdateWindowFireRatingCommand:27,:36` · `UpdateDoorWidthCommand:33,:44` ·
`UpdateDoorSillHeightCommand:36,:46` · `UpdateDoorHeightCommand:36,:46` ·
`UpdateDoorLeafColorCommand:32,:42` · `UpdateDoorFrameColorCommand:32,:42` ·
`UpdateDoorFireRatingCommand:27,:36` · `UpdateDoorAccessibilityTypeCommand:27,:36` ·
`UpdateElementMarkCommand:56,:57`. **A grep of each for `doorStore`/`windowStore` produced no hits.**
They desync **width, height, sill, colour, fire rating and mark** between the two records.

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

### ⛔ EI-3 VIOLATION #2 — the AI writes `doorType` values the union cannot hold

`packages/ai-host/src/QueryEngine.ts:320` writes `doorType: 'double-hinged'`; `:575` writes
`'hinged-left'`. **Neither is in `'single' | 'double'`**, so neither the schema enum, the `Opening`
interface, nor `DoorDimensions.resolve` can accept them. **The UI does not offer them; AI query
synthesis produces them.** Whether they reach a store write is **NOT MEASURED**.

> ⚠ **NAME COLLISION, deliberately NOT counted as a violation.** `'double-hinged'` also appears in
> `WardrobeCabinetTypes.ts:174, :242` (both `core-app-model` and `geometry-furniture`),
> `WardrobeEngine.ts:40, :273, :304`, `WardrobeCabinetEngine.ts:276`, `FurnitureTool.ts:620-621` —
> that is `WardrobeSectionDoorType`, a **furniture** vocabulary sharing the field name `doorType`.
> **Recorded so a future census does not inflate it into a rivalry** (C84 §8.g).

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

### ⛔ THE FRAME AND THE VOID USE DIFFERENT Y DATUMS

| Site | Formula |
|---|---|
| `packages/geometry-door/src/DoorBuilder.ts:503` | `const y = elevation + door.sillHeight + door.height / 2;` |
| `packages/geometry-window/src/WindowBuilder.ts:833` | `const y = elevation + win.sillHeight + win.height / 2;` |
| `DoorBuilder.ts:525` / `WindowBuilder.ts:859` | `const baseY = elevation + ((wallData as {baseOffset?: number}).baseOffset ?? 0);` |
| The VOID | `LayeredWallOpeningBuilder.ts:206` `positions.push(horizontal.x, wallBaseOffset + y, horizontal.z);`; `WallFragmentBuilder.ts:2339` `positionLocal(headerMesh, headerCenterX, currentY + finalHeaderHeight/2 + wallBaseOffset);` |

> **The frame datum at `:503`/`:833` uses `elevation` ONLY — it does NOT add `wall.baseOffset`, while
> the same files' `baseY` at `:525`/`:859` does, and the void does.** On any wall with a non-zero
> `baseOffset`, frame and void are at different heights.
> **`grep -rn slabBaseOffset packages/geometry-door/src` → 0; `packages/geometry-window/src` → 0.**
> C84 §9's measured half is CONFIRMED: leaf-vs-hole delta = `slabBaseOffset + 2 × wall.baseOffset`.
> **LATENT** — nothing authors either offset non-zero today — and it is the recorded reason the CSG
> arm is switched off ([C85 §12 R-8](C85-ELEMENT-WALL.md)).

⚠ **C84 cites `DoorBuilder.ts:498` and `WindowBuilder.ts:818` as the Y-datum sites. They are not —
they are the SPATIAL-AUTHORITY GUARDS**, and they are exemplary:
`DoorBuilder.ts:496-501` throws `SpatialAuthorityError` — *"level … has no elevation — refusing to
place at Y=0"*; `WindowBuilder.ts:817-825` (§WINDOW-AUDIT-2026 C2, WIN-SPATIAL-FALLBACK) —
*"never silently default to Y=0 … misconfigured levelId must produce a loud error, not a ghost window
at floor level."* **The datum lines are `:503` and `:833`.** Recorded per C84 §6.

### Stack B — exists, and is deliberately unwired

`packages/geometry-kernel/src/producers/door.ts:1` (*"pure-TS Door geometry producer (S11-T1)"*),
`:25` imports the **L0** `Door`, `:27` `DoorWorldPlacement`; `:15-18` — *"positioned in WORLD
coordinates relative to the host wall's baseline + sill height… so this producer has no store
dependency."* `producers/window.ts` exists; **contents NOT MEASURED.**

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

### TO-BE — normative

- **WO-G-1.** ONE Y datum for the opening. **The authority is the host wall's**
  ([C85 §10 W-G-4](C85-ELEMENT-WALL.md)) and the frame MUST consume it, not recompute it.
- **WO-G-2 (EI-11).** Door and window parity harnesses are **OWED** (C84 §5). Each MUST consume
  C73's declared tolerance module (`packages/geometry-kernel/src/tolerance.ts`, shipped per
  **L-954**) and MUST NOT ship a bare call-site literal.
- **WO-G-3.** `wallVoids.ts` MUST keep its PARKED declaration until phase 3. ⛔ Its existence is not
  licence to delete `LayeredWallOpeningBuilder`, nor to enable the boolean without the flag and the
  fallback it names.

---

## 11. THE DELTA

| # | Defect | User loses | Invariant | Proof required |
|---|---|---|---|---|
| **1** | **`PlanElementDragController.ts:570-571, :713, :715` writes `wallStore.updateDoor/updateWindow` and NEVER the standalone store** — zero occurrences of `doorStore`/`windowStore` in the file. **The live 2-D plan drag violates [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md)** | **the frame and the void diverge** — the leaf stays where it was, the hole moves | [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) · C84 **EI-1** | ⛔ **control first, watched RED**: drag a door in plan, rebuild the wall, assert frame and void share one offset |
| **2** | C15 §8.1's enforcement is *"a code-review checklist item"* and **no gate** | every future command repeats #1 | C84 **§8.d** — *a comment as the synchronisation mechanism* | build `check-hosted-dual-write.ts` (WO-B-3) |
| **3** | **Thirteen** one-sided update commands desync `width`, `height`, `sillHeight`, `frameColor`, `leafColor`, `fireRating`, `mark` between the two records | any of those fields, on whichever consumer reads the stale side | C84 **EI-1**, **EI-2** | C15 §8.1's scope MUST widen past `offset`, or WO-C-2's migration MUST land |
| **4** | Persistence writes **both** records (`ProjectSerializer.ts:552` and `:1013-1014`) and reconciles neither; IFC reads only the embedded one (`WindowDoorReader.ts:12, :56`) | nothing while the pair agrees — **everything the moment it does not**, and #1/#3 guarantee it does not | C84 **EI-1** | the persistence migration — **owned by [C05](C05-PERSISTENCE-AND-FILE-FORMAT.md)** (C84 §9, as retracted) |
| **5** | `wall.delete` (L1) has **no** hosted cascade; the L2 path does (`DeleteElementCommand.ts:265-266`) | orphaned door/window records **and their 3-D meshes** | C84 **EI-4a**, **EI-5** | delegate, do not copy |
| **6** | `frameThickness`, `frameWidth`, `fireRating`, `accessibilityType` are schema fields the create path **silently discards** (§5 rows 10, 11, 14, 15) | four authored door properties, at creation | C84 **EI-2(a)** | round-trip each through `wall.createOpening` |
| **7** | `swing` has 5 members; the legacy record has a 2×2. **`'sliding'` is unrepresentable** | **a sliding door becomes a hinged door**, silently | C84 **EI-3** | enumerate both vocabularies in one test |
| **8** | Frame Y (`DoorBuilder.ts:503`, `WindowBuilder.ts:833`) omits `wall.baseOffset`; the void adds it; the same files' `baseY` (`:525`/`:859`) adds it | latent — leaf and hole at different heights on any offset wall | C84 **§4D** | one datum authority ([C85 §10](C85-ELEMENT-WALL.md)) |
| **9** | Default divergence: `width` 0.9 (schema) vs 1.0 (command); window `sillHeight` 0.9 vs 1.0 | a created opening differs from `parse({})` in a field neither reports | C84 **EI-9** | one default per field |
| **10** | `WindowBuilder` ships both `'window'` (`:308`) and `'Window'` (`:578, :631`) against a C15 §12 **freeze of one** | nothing today (consumers lowercase) — the freeze is already broken | [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) | one spelling from the producer |
| **11** | `QueryEngine.ts:320, :575` synthesise `doorType` values outside `'single'\|'double'` | an AI-authored door fails to parse | C84 **EI-3** | correct the values or widen the union |
| **12** | `'opening'` names two unrelated concepts; `DeleteElement.ts:52-53` routes the ambiguous literal to the **slab** opening command | a mis-route waiting for a producer | C84 **EI-9** | disambiguate the word, or gate on the host family |
| **13** | Door and window parity harnesses **OWED** (C84 §5) | nothing today; every future kernel divergence ships unseen | C84 **EI-11** | build them on C73's tolerance |
| **14** | The bake worker handles no openings — three comments describing future work | in self-host bake: **walls with no voids and no leaves** | C84 **EI-6**-adjacent | declare or implement |
| **15** | `door.move`/`window.move` declare `['door']`/`['window']`, omitting `wall` | nothing while they refuse; a live C15 §8.1 violation the moment they do not | C84 **EI-7**, C15 §8.1 | correct the declaration before re-enabling |
| **16** | The batch-create verbs do **not** refuse while their single twins do | a caller routes around the refusal | C84 **EI-4a**, [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) | make them consistent |
| **17** | **`CreateWallOpeningCommand.ts:12` declares `affectedStores = ["wall"]` while adding to `doorStore` (`:155`) and `windowStore` (`:204`)** — and `CreateWindowsParametricBatchCommand.ts:89` inherits it as `['wall']`. This is the command §12 R-1 names as *"the one atomic command"*, so every refusing create verb points at it | nothing yet that we have measured — its own `undo()` clears both stores at `:288-289`. **What it loses is the guarantee**: any reverser that trusts the declaration instead of the command reverses half the write | C84 **EI-7c** — the declared set MUST be the written set | measure whether ANY path reverses this command through the snapshot rather than its own `undo()`, then correct the declaration regardless [L-1031](../../04-reference/ISSUE-LOG.md) |

---

## 12. REFUSALS

| # | Refusal | Where | Status |
|---|---|---|---|
| **R-1** | `door.create` / `window.create` refuse **unconditionally**, and each **names the one atomic command** with its exact payload shape | `CreateDoor.ts:107` (reason), `:154`; `CreateWindow.ts:63`, `:98` | ✅ **EXEMPLARY.** It cites its own **CA-21 executed read-back** as the evidence — *"saw the dispatch report success while the authoritative doorStore … did not change"* — which is exactly what [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) and C84 EI-10(b) require. **This is the C84 EI-4a shape reached correctly: one route per intent, and the refusal points at it** |
| **R-2** | `door.move` / `window.move` refuse | `MoveDoor.ts:109`, `MoveWindow.ts:108`; hazard `:51-52` / `:50-51` | ✅ **CORRECT AND REQUIRED** under C16 CA-18, and the **only** correct response to WO-U-1's deliberate ring-buffer absence. ⛔ MUST NOT be "fixed" into silent success |
| **R-3** | `DoorBuilder` throws `SpatialAuthorityError` rather than place at Y=0 | `DoorBuilder.ts:496-501` | ✅ **EXEMPLARY** — *"refusing to place at Y=0"* |
| **R-4** | `WindowBuilder` throws rather than place a ghost window at floor level | `WindowBuilder.ts:817-825` (§WINDOW-AUDIT-2026 C2) | ✅ exemplary — *"misconfigured levelId must produce a loud error, not a ghost window at floor level"* |
| **R-5** | The window write is guarded against duplication | `CreateWallOpeningCommand.ts:187` (`!windowStore.has(this.openingElementId)`) | ✅ correct |
| **R-6** | `producers/wallVoids.ts` is **deliberately not wired** — phase 3, behind a flag, segmented mesh as fallback | `wallVoids.ts:10-15` | ✅ **THE COMPLIANT PARKED FORM** (C84 §3.5). Copy this shape |
| **R-7** | The bake worker builds no openings | `HeadlessBakeSession.ts:13, :58, :92` — three future-tense comments | ⚠ **UNDECLARED ABSENCE, DECLARED HERE.** A self-host bake produces walls with no voids and no leaves. It MUST refuse or declare |
| **R-8** | No rotate verb, no level-change verb | §6 | ✅ **CORRECT BY C15 §2** — a hosted element has no independent world-space coordinate and no independent level. **Now declared, so nobody mints them** |
| **R-9** | No `setMaterial` verb; colour is per-part | §9 | ⚠ **DECLARED HERE.** Previously an undeclared absence |
| **R-10** | The ten `<kind>.delete` bus verbs are **DORMANT, not broken** | C84 §3.5.3 | ✅ ⛔ do not delete — PRYZM 3 target vocabulary |

### Explicitly NOT REFUSED, and that is the finding

`PlanElementDragController` drags a door, writes the host record, reports success, and leaves the
standalone record stale — with **no refusal, no warning, and no gate**. Under C84's governing
sentence (`WallRake.ts:50-62`) that is the worst of the three states.

---

## NOT MEASURED — the honest register for this family

⛔ Gaps, not clearances (C84 EI-1b).

1. **`DoorBuilder.ts`'s `userData.elementType` assignment sites** — the casing census is complete for
   window, incomplete for door.
2. **GLB export's door/window read path** — no candidate located in `packages/file-format/src`.
3. **`packages/geometry-kernel/src/producers/window.ts` contents** — file exists, not read.
4. **`DOOR_MOVE_UNREACHABLE` / `WINDOW_MOVE_UNREACHABLE` constant bodies** — the refusal sites are
   measured (`:109`/`:108`); the reason strings were not resolved to their definitions.
5. **Whether the plugin `DoorStore`/`WindowStore` classes are ever instantiated and bound at
   runtime** — only their barrels' assertions that they are detached were measured.
6. **Whether `QueryEngine.ts:320, :575`'s out-of-union `doorType` values reach a store write.**
7. **`DoorSystemTypeStore`'s built-in type ids.**
8. **Whether `plugins/plan-view`'s injected door/window source stores are fed from the authority**,
   and what a plan view does when the **optional** `windowStore` (`PlanViewCanvasHost.ts:156`) is
   absent.
9. **Whether the UI still offers the four refusing verbs** — owned by
   [C82](C82-RIBBON-CAPABILITY-SURFACE.md). ⚠ A verb-only control census would miss this family's
   live mutation path, which is off-bus.
10. **`packages/persistence-client/src/loader/`** — deliberately not measured; DEAD.
11. **Whether any path reverses `CreateWallOpeningCommand` through `createSnapshot` rather than
    through the command's own `undo()`** (§4, §11 #17). This is the only question that separates a
    LATENT declaration defect from a live one, and it is deliberately left blank rather than
    reasoned about — see [L-1031](../../04-reference/ISSUE-LOG.md).

---

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
| `DoorBuilder.ts:498` / `WindowBuilder.ts:818` are the Y-datum sites (§4D, §9) | ⛔ **REFUTED — they are the SPATIAL-AUTHORITY GUARDS** (`:496-501`, `:817-825`), and they are exemplary refusals. **The datum lines are `:503` and `:833`** |
| `slabBaseOffset` occurrences in `geometry-door/src` + `geometry-window/src` = **0** | **CONFIRMED** |
| door/window/slab parity harnesses OWED (§5) | **CONFIRMED for door and window** — no file imports both a Stack-A builder and a Stack-B producer |
| — (not in C84) | **NEW:** `door.create`/`window.create` **REFUSE**, naming `wall.createOpening` — the correct EI-4a shape; `PlanElementDragController` violates C15 §8.1; 13 commands desync outside §8.1's scope; `'sliding'` is unrepresentable; two default divergences; `WindowBuilder` breaks C15 §12's freeze from one file |
