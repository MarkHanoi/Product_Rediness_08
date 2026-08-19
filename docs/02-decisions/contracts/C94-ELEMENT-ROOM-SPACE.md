# C94 — ELEMENT: ROOM / SPACE

> **Stamp**: 2026-08-18 · **Status**: CANONICAL — binding on every PR touching the room family
> **Parent**: [C84 §6](C84-ELEMENT-INTEGRITY.md). C84 owns `EI-1…EI-13`; C94 owns their application to
> room. **Structure**: C84 §6's twelve mandatory sections, **AS-IS** (measured, `file:line`, HEAD
> `3384f076`) beside **TO-BE** (normative).
> **Cites, does not restate**: [C03 §4.6 U-2/U-2b](C03-SCHEMAS-COMMANDS-AND-STATE.md) owns
> `affectedStores` · [ADR-0319 §2/§3](../adrs/ADR-0319-audit-fields-are-derived-not-authored.md) owns
> audit fields across undo (**NOT C75**) · [C71](C71-GRAPH-AND-TOPOLOGY.md) owns the graph ·
> [C72 §4](C72-PROPAGATION-AND-PREVSTATE.md) owns the observer-suppression protocol ·
> [C79](C79-REGION-SEMANTICS.md) owns region semantics and `boundingWallIds`.
>
> ## ⭐ ROOM IS THE SHAPE THE OTHER FOURTEEN MUST REACH
>
> **[C84 §4](C84-ELEMENT-INTEGRITY.md): *"The only family whose write and restore sets match is
> room/space."* MEASURED AND CONFIRMED — and the reason is not the one C84 gives.**
> It is not that the verbs "delegate to a legacy command". It is that **every legacy room mutator
> snapshots the FULL pre-edit `RoomData` and restores it through one primitive that honours a declared
> `preserveMetadata` contract.** *Twelve of thirteen room verbs have write-set ≡ restore-set.* §1 states
> it precisely, because a correct result recorded for the wrong reason cannot be copied.

---

## 0. THREE CORRECTIONS — recorded, per [C84 §0](C84-ELEMENT-INTEGRITY.md)

### 0.1 ⛔ "All NINE room verbs delegate to `UpdateRoomCommand`" — FALSE on both numbers

There are **thirteen `room.*` verbs** (+ `template.create` = **14 handlers**) —
`plugins/rooms/src/handlers/index.ts:19-45` (`ROOM_HANDLER_TYPES`) and `:49-66` (`buildRoomHandlerSet`).
**Only THREE delegate to `UpdateRoomCommand`** (`setMaterial`, `setFinish`, `setHeightOffset`); the rest
delegate to five other legacy commands or to nothing.
⚠ **The plugin's own store header says "twelve"** (`plugins/rooms/src/store.ts:11`) — also stale. **Three
independent counts of one family's verbs, all different.** That is EI-9 applied to prose, and it is why
§1.1 enumerates rather than counts.

### 0.2 ⛔ "`room.boundingWallIds` HAS NO WRITER ANYWHERE" — FALSE. C84 §4C(b)'s retraction was RIGHT.

`packages/core-app-model/src/boundingWallDetermination.ts:5-10` names **`CreateFloorCommand` /
`CreateCeilingCommand`**, *not room*. Measured at HEAD, **room's array has three writers** (§8.2) — and
**the floor/ceiling half C84 originally cited is itself already fixed**
(`CreateFloorCommand.ts:324` reads *"`boundingWallIds` was `[]` UNCONDITIONALLY here"* — **past tense** —
and `:350` now writes `sketch.boundingWallIds`).
**A file named for a FIELD was read as a census of a FAMILY.** [C84 §8.a](C84-ELEMENT-INTEGRITY.md).

### 0.3 ⛔ [C84 EI-4a](C84-ELEMENT-INTEGRITY.md)'s "CLOSED 2026-08-18" is FALSE at HEAD

C84 `:249` states *"`BimService.deleteSelected()` now dispatches the same `element.delete` verb the
keyboard dispatches."* **Measured: `apps/editor/src/engine/BimService.ts:169` still reads
`const command = new DeleteElementCommand(id);`** and `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts`
**is not on `main`** (`git ls-files` → no match).

⭐ **C84 §5 already caught this class for itself** — *"a gate that exists in a worktree gates nothing at
HEAD"* — but applied the correction only to its **gate table**, not to **EI-4a's prose**. The fix and its
test live in the lane worktree `z8-dupaudit`. **The delete defect described in §6 is LIVE.**
Proposed banner text for C84 is in the lane report; C94 does not edit C84.

---

## 1. THE GOOD RESULT, stated precisely

### 1.1 All 14 handlers are lineage **L3**; the undo soundness comes from the LEGACY layer

Every handler declares `affectedStores: []` and bridges through `window.commandManager`. The seam is a
single file — `plugins/rooms/src/handlers/legacyCommands.ts:39-48`, an 8-symbol re-export marked
`@command-gate: not-a-command-bus-handler` at `:4`. ⭐ **One declared seam, not thirty scattered
`_cmExec` calls — this is why the family is auditable at all.**

| # | Verb | Handler:line | `affectedStores` | Delegates to |
|---|---|---|---|---|
| 1 | `room.create` | `CreateRoom.ts:134` | `:141` | `CreateRoomCommand` `:189` |
| 2 | `room.delete` | `DeleteRoom.ts:31` | `:34` | `DeleteRoomCommand` `:70` |
| 3 | `room.move` | `MoveRoom.ts:50` | `:52` | `UpdateRoomBoundaryCommand` `:114` |
| 4 | `room.setName` | `SetRoomName.ts:47` | `:50` | `RenameRoomCommand` `:103` |
| 5 | `room.setNumber` | `SetRoomNumber.ts:43` | `:45` | `RenameRoomCommand` `:90` |
| 6 | `room.setOccupancy` | `SetRoomOccupancy.ts:39` | `:41` | `SetRoomOccupancyCommand` `:84` |
| 7 | `room.setMaterial` | `SetRoomMaterial.ts:66` | `:68` | **`UpdateRoomCommand`** `:124` |
| 8 | `room.setFinish` | `SetRoomFinish.ts:152` | `:154` | **`UpdateRoomCommand`** `:272` |
| 9 | `room.setHeightOffset` | `SetRoomHeightOffset.ts:46` | `:48` | **`UpdateRoomCommand`** `:107` |
| 10 | `room.recomputeBoundary` | `RecomputeRoomBoundary.ts:246` | `:251` | **NONE — determines, refuses to write `:276-295`** |
| 11 | `room.redetect` | `RedetectRooms.ts:47` (alias `rooms.redetect` `:49`) | `:50` | **L5 CustomEvent `:82-90`** |
| 12 | `room.regenerate` | `RegenerateRooms.ts:220` | `:227` | **NONE — typed refusal** |
| 13 | `room.rename` | `RenameRoom.ts:27` | `:28` | `RenameRoomCommand` `:73` |
| 14 | `template.create` | `CreateTemplate.ts:59` | `:59` | `CreateTemplateCommand` `:95` |

### 1.2 ⭐ THE ACTUAL MECHANISM — full-record snapshot + one restore primitive

`packages/command-registry/src/rooms/UpdateRoomCommand.ts`:

```
:24   readonly affectedStores = ["room"] as const;
:30   private snapshot: RoomData | undefined;
:53   this.snapshot = roomStore.getById(this.roomId);   ← WHOLE RECORD, before update() at :57
:70   roomStore.restoreSnapshot(this.snapshot);
```

**All six mutators do the same:**

| Command | `affectedStores` | Snapshot | Restore |
|---|---|---|---|
| `UpdateRoomCommand` | `:24` | `:53` | `:70` |
| `RenameRoomCommand` | `:19` | `:57` (header `:25-26`: *"full pre-update snapshot so undo restores every derived field"*) | `:82` |
| `SetRoomOccupancyCommand` | `:20` | `:53` | `:69` |
| `UpdateRoomBoundaryCommand` | `:20` | `:49` | `:77` |
| `DeleteRoomCommand` | `:27` | `:53` | `:79-96` — **and it restores MORE than it removed**: store + `bimManager.registerElement` + `elementRegistry.registerSemantic` + `roomSpatialIndex.insert` |
| `CreateRoomCommand` | `:29` | (create) | `:83-85` — `remove` + `unregisterElement` + `elementRegistry.unregister` |

**The primitive — `packages/room-topology/src/RoomStore.ts:374-385`:**

```ts
/**
 * Undo-safe snapshot restore.
 * Preserves original metadata (createdAt, version, modifiedAt) without advancing audit trail.
 * R-6: Always use this in command.undo() implementations.
 */
restoreSnapshot(snapshot: RoomData): void { … this.update(snapshot.id, snapshot, true); }
```

`preserveMetadata = true` is honoured at `:332-339`. ⭐ **This is the only store in the repo measured to
carry a declared audit-preservation contract**, and `UpdateElementParameterCommand.ts:213-218` says so
itself: *"only `WallStore` carries the `preserveMetadata` contract today"* — **which is wrong; `RoomStore`
carries it too, at `:281-291`, and carries it better.**

> **TO-BE, the transferable pattern — this is what the other fourteen families must copy:**
> **(1)** the mutator captures the **whole** pre-edit record, never a field subset;
> **(2)** restore goes through **one** store primitive, not per-command field writes;
> **(3)** that primitive takes an explicit `preserveMetadata` flag and honours it;
> **(4)** delete restores **every** side-registration it removed (graph, spatial index, element registry).

### 1.3 ⚠ ONE LEAK in an otherwise clean restore — `computed` is RECOMPUTED, not restored

`restoreSnapshot` routes through `update()`, and `RoomStore.ts:326-329` re-derives
`merged.computed = computeRoomMetrics(merged.boundary)` whenever `boundary` is in the patch — **which a
full-record restore always is.** The function is deterministic (`RoomPolygonUtils.ts:873`), so the values
are equal in practice. **But it is a derivation, not a restore**, and it is recorded here rather than
waved through: it is the seam through which a future non-deterministic metric would silently break undo.

---

## 2. Identity

| Axis | AS-IS | TO-BE |
|---|---|---|
| Canonical tag | **`'room'`** — one spelling, **no `'space'` variant anywhere**. `RoomStore.ts:275,366,404`; `RoomTool.ts:229,376`; `PropertyPanel.ts:787`; `initDataPlatform.ts:337`; `ConstraintEngine.ts` (13 sites `:285`…`:821`) | ✅ **CONFORMANT** — the cleanest identity of the five families in this lane |
| ⚠ Scene-graph marks | ⛔ **THREE disjunctive marks, not one** — `ud.isRoomOverlay \|\| ud.isRoomVolume \|\| ud.elementType === 'room'` (`BottomActionMenu.ts:1365,1389`; `LevelExplodeController.ts:409`) | ⛔ **EI-9 violation.** Declare the two booleans as sub-part roles per [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md), or fold them into one tag |
| L0 Zod schema | `packages/schemas/src/elements/Room.ts:41` `defineElement('room', …)`; header `:31-34` calls `boundary`, `area`, `volume`, `boundingWallIds` **legacy back-compat fields** | unchanged |
| **Runtime schema (the gating one)** | `packages/room-topology/src/RoomDataSchema.ts` — `RoomDataAddSchema` `:166-193`, **`:177 boundingWallIds: z.array(z.string())` REQUIRED**, no default; update gate `:209` makes it optional | ⚠ **two schemas, one family** — declare which gates what |
| Bus verb namespace | `room.*`, 13 verbs + one deprecated alias `rooms.redetect` (`RedetectRooms.ts:49`, §FIX-COMMAND-NAMESPACE L-796) | ✅ |

---

## 3. Stores

| # | Representation | Path | Status |
|---|---|---|---|
| 1 | L0 Zod schema | `packages/schemas/src/elements/Room.ts:41` | schema only |
| 2 | **Plugin DTO store** | `plugins/rooms/src/store.ts` | ⭐ **DECLARED DEAD SHIM — the exemplar (§3.1)** |
| 3 | **Legacy `RoomStore`** | `packages/room-topology/src/RoomStore.ts` | 🟢 **THE AUTHORITY** |
| 3′ | duplicate class | `packages/stores/src/RoomStore.ts` | ⚠ second class of the same name (aggregate-command world, `aggregate-commands/roomCreate.ts:111`) — **NOT MEASURED for editor reachability** |
| 4 | Scene `userData` | `isRoomOverlay` / `isRoomVolume` / `elementType:'room'` | render mirror |
| 5 | Kernel producer | `packages/geometry-kernel/src/producers/room.ts:355` `produceRoom` | ⛔ **DEAD** — `grep "new RoomCommitter"` → **ZERO**; reached only from the never-instantiated committer and its tests |

Authority adoption is explicit: `apps/editor/src/engine/initBuilders.ts:66-67` —
`// §ADR-0318-ELEMENTS-SLOT — the ONE authoritative room store.` → `:451-455` `window.roomStore`.

### 3.1 ⭐ The DTO store header — the EI-5a exemplar, quoted so it can be copied

[C84 EI-5a](C84-ELEMENT-INTEGRITY.md) calls `plugins/rooms/src/store.ts:1-29` *"already exemplary"*.
Measured, and it is:

```
// ⚠ DEPRECATED SHIM (GE-04, measured 2026-08-14) — do not add readers/writers.
//
// The WINNER — the one RoomStore shipping paths execute — is
// `packages/room-topology/src/RoomStore.ts` (module singleton `roomStore`,
// registered under storeRegistry key 'room', exposed as `window.roomStore`, …)
//
// THIS store is a bus-contribution placeholder, nothing more. … Nothing reads
// this store's state; nothing writes it. Writing an Immer patch into it would be
// the "store nothing reads" defect those handlers' headers name explicitly.
//
// Retirement path (scoped, for the follow-up lane):
//   1. Drop the `storeKey: 'rooms'` / `buildStore` contribution …
//   2. Remove the export from plugins/rooms/src/index.ts.
//   3. Delete this file + the store-double usages in plugins/rooms/__tests__.
```

**It names the winner, the reader count, the writer count, the reason not to "fix" it, and a numbered
retirement path.** ⛔ **This is the template every other `plugins/*/src/store.ts` header must adopt.**
⚠ Its one flaw: `:11` says *"all twelve room.\* handlers"* where there are fourteen (§0.1). **A stale
count inside the exemplar** — the maintenance-by-comment failure mode (C84 §8.d) reaching even here.

---

## 4. Consumers — one authority, one absence

| Consumer | Reads | Evidence | Verdict |
|---|---|---|---|
| Renderer (3D) | legacy | `RoomBoundaryBuilder.ts` (fill + volume), wired `initBuilders.ts:457,468-469`; labels `RoomLabelRenderer` `:477-480`; gate `initScene.ts:842-867` | ✅ |
| Plan view | legacy | `RoomPlanToolHandler.ts:134`; **the same mesh as 3D** — `initScene.ts:859` (*"does NOT remove room colour from the plan"*) | ✅ |
| **Persistence — SAVE** | legacy | **LIVE pair** `apps/editor/src/engine/persistence/ProjectSerializer.ts:786,988,1034` | ✅ |
| **Persistence — LOAD** | legacy | **LIVE pair** `ProjectLoader.ts:1390,1399,2258-2318` (§LOAD-REDETECT-FREEZE), `:2330` dispatches `room.redetect` | ✅ |
| IFC export | legacy | `packages/file-format/src/export/ifc/readers/RoomReader.ts:154,159`, `:216` `ifcClass:'IfcSpace'`, pset `:129`; second exporter `plugins/ifc-export/src/exporters/space.ts:282` | ⚠ **two exporters — EI-9** |
| GLB export | — | `GLBExporter.ts:112` is a **comment only**; no `roomStore` read | ⛔ **ABSENT** |
| Bake worker | — | no room-reading bake path located | **NOT MEASURED** |
| Schedules | legacy | `ScheduleExtractor.ts:176-177,195,534,560,602,629,704` | ✅ |

**EI-1 verdict: ✅ CLEAN.** Recorded per **EI-1b**.
⚠ **The DEAD pair is genuinely unreachable from the editor here**: no `@pryzm/persistence-client` import
exists in `apps/editor` (only `apps/cli`, `apps/bench`, tests), and
`tools/ga-gate/check-layer-boundaries.ts:298` records the editor's import as **commented out**. **Room is
the one family in this lane where the dead-pair question is settled.**

---

## 5. THE BRIDGE FIELD MAP — there is no bridge, and the emitter falls on the floor

### 5.1 `room.created` carries ONE field and has ZERO subscribers (EI-13)

`packages/runtime-composer/src/CommandEventBridge.ts:687-695`, verbatim:

```ts
case 'room.create': {
  const p = record.payload as { levelId?: string };
  events.emit('room.created', {
    commandId:   record.id,
    commandType: 'room.create',
    levelId:     p.levelId ?? '',
  });
  break;
}
```

Type at `runtime-composer/src/types.ts:584-589`. **No `id`. No `boundary`. No geometry.**
Compare the sibling immediately above — `ceiling.created` `:673-682` carries `id`, `boundary`,
`ceilingHeight`, `thickness`.

**Subscriber census — measured on both axes:**
- `grep "events.on('room."` repo-wide → **ZERO matches.**
- `grep "'room.created'"` → 9 hits, **none a subscriber**: the emit `:689`; the type `:585`; a
  `VALID_EVENTS` string list in the webhook modal (`PlatformProjectBrowser.ts:906`, list at `:905`);
  the server webhook allow-list (`server/webhookService.js:26`); a **different** aggregate-command event
  (`packages/stores/src/aggregate-commands/types.ts:347`, `roomCreate.ts:111`); 2 docs; 1 test.
- `initTools.ts` carries **ten** `.created` bridges — `:1059 wall`, `:1511 ceiling`, `:1591 roof`,
  `:1636 column`, `:1708 slab`, `:1773 beam`, `:1824 floor`, `:1919 handrail`, `:1967 lighting`,
  `:2031 furniture`. **`room` is absent.**

> ⛔ **`room.created` is emitted into the void.** [C84 EI-13](C84-ELEMENT-INTEGRITY.md) — *an emitter with
> no consumer is a declared gap; either wire the consumer or delete the emitter.* **The precedent for the
> fix is in the same file**: `CommandEventBridge.ts:626-631` records `door.created`/`window.created`/
> `stair.created` being **deleted** for exactly this reason.
> ⛔ **TO-BE: DELETE the emitter.** ⚠ **Not silently** — the webhook allow-list
> (`server/webhookService.js:26`) and the modal's `VALID_EVENTS` (`PlatformProjectBrowser.ts:905-906`)
> both advertise `room.created` to **external subscribers**, so a customer webhook may be registered
> against an event that fires with no id. **That is a published API surface, and removing it is a
> [C47](C47-FILE-FORMAT-VERSIONING.md)-class change, not a refactor.** Measure the webhook registrations
> before deleting.

⭐ **Room therefore has NO named-subset re-emit to audit** — no EI-2(a) bridge defect is *possible*,
because no bridge carries data. Recorded per **EI-1b** as a clean negative: the absence of a bridge is
why room's create path cannot lose a field the way furniture's does.

---

## 6. Delete — ⛔ BOTH UI PATHS FAIL, AND BOTH SWALLOW THE FAILURE

### 6.1 `DeleteElementCommand` has no room branch

`packages/command-registry/src/walls/DeleteElementCommand.ts` — **`grep -c roomStore` → `0`**
(independently re-measured for this contract). Only three `room` substrings, all comments (`:4`, `:110`,
`:278`). The fallthrough is **`:650`**:

```ts
return { success: false, affectedElementIds: [], info: ['Element not found in any store'] };
```

⚠ **Line number settled: `:650`.** C84 §0 recorded a Z8-vs-sweep dispute (`:651` vs `:650`) resolved for
`:650`; a fourth reading of `:652` arose during this lane's measurement and is **REFUTED** —
`grep -n` returns `650`. **The same off-by-one has now been made three times on one line**, which is
itself the argument for citing a grep rather than a memory.

### 6.2 Both paths reach it, and neither tells the user

- **Keyboard** — `initUI.ts:2440` walks to the BIM root; `:2444-2450` dispatches `element.delete` →
  `plugins/view/src/handlers/DeleteElement.ts:51` `(cmd.elementType ?? '').toLowerCase()` → `:52`
  `opening`, `:54` `lighting`, **`:57` else → `DeleteElementCommand`**. `'room'` hits the else.
  ⛔ **`DeleteElement.ts:63` returns `{forward:[],inverse:[]}` UNCONDITIONALLY** — the `success:false` is
  discarded; `:59-61` only `console.error`s a *thrown* exception. **A returned failure is invisible.**
- **Button / context bar** — `BimService.ts:159-179`: `:169` constructs `DeleteElementCommand(id)`
  directly, `:172` executes, **`:173` `unselectAll()` regardless**, return value discarded. Callers:
  `SelectionOverlay.ts:281`, `ContextualEditBar.ts:264,604`, `DockingLayout.ts:196`.

**⇒ Pressing Delete on a room does nothing, from either surface, with no message, and the selection
clears so it looks like it worked.** [C84 EI-4](C84-ELEMENT-INTEGRITY.md), and §0.3 records that C84
believes this closed.

### 6.3 `room.delete` works — and only generators call it

**Exactly two production callers, both AI/generator sweeps:**
`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:1791` and
`apps/editor/src/ui/apartment-layout/nameDetectedRooms.ts:233`. **No Delete-key caller, no button
caller.** Non-callers: `ChatCommandClassification.ts:277` (classification list),
`syncDisposition.ts:889` (`not-synced`, `LIFECYCLE §NEEDS-TOMBSTONE-KIND`), `ElementProvenanceIndex.ts:64,383`
(comments), tests, RAC gates.

> ⭐ **Room is C84 EI-5's stated exception — *"Only `room.delete` has callers"* — and the measurement
> sharpens it: the working delete verb exists, is sound, restores four side-registrations
> (§1.2), and the UI does not use it.** ⛔ **TO-BE: route both UI paths to `room.delete`** — ⛔ **do NOT
> add a room branch to `DeleteElementCommand`.** Per [C84 EI-4a](C84-ELEMENT-INTEGRITY.md), the correct
> shape is **one route per user intent**; adding a branch mints the second answer EI-9 forbids, when a
> better command already exists. ⚠ And `DeleteElement.ts:63` must stop discarding `success:false`.

---

## 7. Undo / redo

### 7.1 Coverage — one table passes, one fails

- **`buildUndoStoreMap` ✅** — `performUndoRedo.ts:314` `room: w.roomStore, rooms: w.roomStore` (both
  aliases). Room is **not** among EI-7c's seven stranded families. *(Contrast `:345-352`: door/window/level
  are deliberately absent so they fall through to `commandManager`.)*
- **`createSnapshot` ⛔** — `CommandManagerImpl.ts:578-638` recognises `wall` `:590`, `slab` `:594`,
  `level` `:599` and the `optionalStores` array `:609-625`. **`room` is NOT among them. L-953 CONFIRMED —
  room is one of the twelve.**

**Consequence, stated precisely:** all six legacy room commands declare `affectedStores = ["room"]`, so
`scope` at `:583-585` is non-null, the all-stores fallback does **not** engage, and `createSnapshot`
returns **`{}`**.

> ⭐ **THE ROLLBACK SAFETY NET DOES NOT EXIST FOR ROOM — AND UNDO STILL WORKS.** These are different
> mechanisms and conflating them is how L-947 was misdiagnosed. **Undo** uses each command's own
> `snapshot` field (§1.2) and is sound. **Rollback-on-failed-execute** (Contract 01 §2.2,
> `CommandManagerImpl.ts:641`) uses `createSnapshot` and is a **no-op**. So a room command that throws
> half-way through leaves partial state with nothing to restore it.
> ⛔ **This is why room's `✅` in C84 §4 must not be read as "room is fine."** It is fine on the axis C84
> measured and broken on an adjacent one. **TO-BE:** add `['room','roomStore',…]` to `optionalStores`.

### 7.2 EI-7a — room is the counter-example

No room verb writes a plugin DTO store (§3.1), so `WRITES ⊋ RESTORES` **does not hold here**. ⭐ **Room is
the single measured family where C84's repo-wide inequality is false**, and the reason is structural:
the DTO store was never adopted, so there is no second store to leave stranded.

### 7.3 Audit envelope — the residual, and a sharpening of L-952

Room is **not** routed through `UpdateElementParameterCommand`, so it is **not** among L-952's eight
ratcheting families on the parameter path. Its residual is in the **re-detect** path (§9.3), and
**ADR-0319 splits it in two:**

| Field stamped | ADR-0319 class | Verdict |
|---|---|---|
| `metadata.modifiedAt` | **§3 DERIVED-INCIDENTAL** — *"may differ across a restore AND an undo, excluded by an explicit enumerated rule"* | ⚠ **PERMITTED — but only once it is on the enumerated exclusion list.** It is not. |
| `metadata.detectionVersion + 1` | **§2 DERIVED-BUT-CAUSAL** — *"may NOT differ across an undo… a counter that ratchets through an undo/redo cycle means the model is not the same model … a real defect, not a tolerance candidate"* | ⛔ **THE DEFECT** |

⭐ **L-952 states both halves as one finding; ADR-0319 makes only the counter a defect.** Recorded here
because fixing the timestamp is unnecessary work and fixing the counter is mandatory. **Cite ADR-0319,
not C75** — C75 §2.9 forbids restating its field classification.

---

## 8. `boundingWallIds` — the field this family is judged on

### 8.1 The determination module, quoted (`boundingWallDetermination.ts:113-125`)

```ts
const raw = room.boundingWallIds;
if (!Array.isArray(raw)) {
  return { kind: 'undetermined', scope, reason: 'RELATIONSHIP_NOT_RECORDED',
    detail: 'room.boundingWallIds is absent — the field names a dependency that no producer wrote ' +
            '(C79 §7.1). Zero walls was NOT determined.' };
}
return { kind: 'determined', elements: raw };
```

⭐ **This is the correct shape and the reason the family survives**: absence returns **UNDETERMINED**, not
`[]`. *"Zero walls was NOT determined"* is the [context-data-honesty](C74-CONSTRAINT-HONESTY.md) rule in
one sentence — failure and emptiness are not the same value.
Its header `:1-12` enumerates the three-layer defect: **(a) WRITER**, **(b) REBUILD** (fixed 2026-08-13,
`a55ed23e`), **(c) READER** — and states *"Any ONE fix alone changes nothing observable, which is
precisely why the family survived."*

### 8.2 Room's three writers — the field IS populated

1. `packages/room-topology/src/RoomDetectionEngine.ts:518-528` — with suffix-stripping
   (`wid.replace(/(_[cs]\d+)+$/, '')`, rationale `:519-527`)
2. `packages/command-registry/src/rooms/UpdateRoomBoundaryCommand.ts:60-62`
3. `packages/runtime-composer/src/CommandEventBridge.ts:923` (event forward)

Required by schema (`RoomDataSchema.ts:177`); preserved by clone paths (`RoomStore.ts:92`,
`roomSnapshotUtils.ts:104`). ⚠ **Empty-by-construction writers remain**: `RoomTool.ts:201`,
`roomFromGraphSpec.ts:97`, `roomSnapshotUtils.ts:278`. `plugins/floor/src/handlers/CreateFloor.ts:137`
still writes `boundingWallIds: []` — **layer (a) is closed for the two legacy commands and open in the
plugin.**

### 8.3 ⛔ THE SURVIVING DEFECT — the ordered half-edge record is collapsed to a Set, TWICE

`packages/room-topology/src/PlanarTopologyEngine.ts:126-135`:

```ts
const rooms: DetectedRoom[] = roomFaces.map((face, idx) => {
    const uniqueWalls = [...new Set(face.edgeIds.filter(Boolean))];
    const centroid = centroidXZ(face.nodeIds, positions);
    …
    return { …, boundaryWallIds: uniqueWalls, … };
});
```

The face walk produces `face.edgeIds[i]` **index-aligned with** `face.nodeIds[i]`. `:127` destroys that
correspondence; `:128-129` then consume `nodeIds` separately. **`RoomDetectionEngine.ts:518` applies a
SECOND `new Set` to the same array.**

⛔ **[C84 EI-2(d)](C84-ELEMENT-INTEGRITY.md) — collapse a sequence — LIVE, at `:127`, twice.**
Prose record of the loss already exists at `roomBoundarySketch.ts:62-67` and `:493-499`.

> ⚠ **CITATION CORRECTED.** [C79 §10.3](C79-REGION-SEMANTICS.md) (quoted by C84 §4C(b)) cites
> *"`PlanarTopologyEngine:174` … `face.wallIds`"*. **Both are wrong**: the site is **`:127`** and the field
> is **`edgeIds`**. `:174` is the closing brace of `mapOpeningsToWalls`. **The finding is real; the
> pointer does not resolve.**

---

## 9. The re-detect path — the good news, and its residual

### 9.1 `RoomTopologyObserver` recomputes after every wall undo (EI-7e)

`RoomTopologyObserver.ts:513-535` `resume()` flushes `_suppressedCommitLevels` and calls
`_executeRedetect(levelId)` **synchronously**, deliberately (`:496-505`: *"a deferred flush would be one
more thing that can be lost"*). Pause/resume around undo: `performUndoRedo.ts:393-405`
(`_withPausedObservers`), call sites `:460` (UNDO) and `:567` (REDO).
**`grep "isReverting"` in `RoomTopologyObserver.ts` → ZERO matches** — it does **not** consult it,
consistent with [C84's](C84-ELEMENT-INTEGRITY.md) three-service census.

**⇒ After any wall undo, room boundaries are RECOMPUTED from the post-undo wall set, not RESTORED.**

### 9.2 ⭐ AND THE AUTHORED SEMANTICS SURVIVE — C84's highest-value open question, ANSWERED

[C84 EI-7e](C84-ELEMENT-INTEGRITY.md) calls this *"the single highest-value open question in this
contract"*, and [C84 §9](C84-ELEMENT-INTEGRITY.md) lists it NOT MEASURED. **Measured here: they survive.**

**The matcher — `RoomDetectionEngine.ts:914-948`** — pairs recomputed faces to existing rooms by
**Jaccard overlap of `boundingWallIds`**: `shared / union` at `:929-931`, threshold
**`STRUCTURAL_MATCH_MIN_OVERLAP = 0.34`** (`:146`), ties broken by centroid distance then by id
(`:944-945`), one claim per room (`:948`, PARTITION-FIX). Second pass: centroid fallback within
**`CENTROID_MATCH_RADIUS = 2.0` m** (`:127`, applied `:952,987-994`).

**The carry — `:957-973` — FOURTEEN fields including identity:**

```ts
const merged: RoomData = {
  ...d,
  id:            match.id,    // preserve ID so undo works
  name, roomNumber, department, occupancyType, occupancyLoad, programmeArea,
  finishes: {...match.finishes}, colour: match.colour ?? d.colour, opacity,
  properties: {...match.properties}, ifcData, revitId, phase,
```

⚠ **The brief named nine fields; measured, it carries THIRTEEN plus `id`** — the extra three are
`occupancyLoad`, `programmeArea`, `opacity`. **NOT carried** (taken from the fresh detection `d`):
`boundary`, `boundingWallIds`, `boundingSlabIds`, `boundingColumnIds`, `computed`, `levelId`, `parentId`,
`unitId`, `type` — **correctly**, since those are precisely what the re-detect exists to recompute.

> ⭐ **`id: match.id` — with the comment *"preserve ID so undo works"* — is the load-bearing line.**
> Because identity survives, the room the user renamed is still the room after a wall undo. **The
> geometry is recomputed; the meaning is carried across.** That is the right division, and it is the
> answer C84 §9 was waiting for.

### 9.3 The residual — the audit envelope, stamped TWICE

**Stamp 1 — `RoomDetectionEngine.ts:974-978`:**

```ts
metadata: { ...match.metadata, modifiedAt: now, detectionVersion: (match.metadata.detectionVersion ?? 0) + 1 },
```

**Stamp 2 — `ReDetectRoomsCommand.ts:134` `roomStore.update(room.id, room);`** — the **third argument is
omitted**, so `preserveMetadata` defaults to `false` and `RoomStore.update` stamps `modifiedAt` and
`version` **again**.

⛔ **`grep preserveMetadata` in `RoomDetectionEngine.ts` → ZERO matches.** The contract exists on the
store (`RoomStore.ts:281-291`) and `mergeWithExisting` re-implements metadata handling by hand at
`:974-978` instead of consuming it. **Repo-wide, `preserveMetadata` has exactly four code sites, all
inside `RoomStore.ts`, and the ONLY caller passing `true` is `restoreSnapshot` (`:384`).**

**And `ReDetectRoomsCommand` is `nonUndoable = true` (`:57-65`), so the stamp rides along invisibly with
a wall undo that triggered a re-detect.** This is **L-952**, and per §7.3 the defect is
`detectionVersion` (ADR-0319 §2), not `modifiedAt` (§3).

**TO-BE:** `mergeWithExisting` consumes the existing `preserveMetadata` contract; `ReDetectRoomsCommand.ts:134`
passes `true`. ⛔ **Do not mint a second preservation mechanism — one exists and is unconsumed.**

---

## 10. Verbs

| Verb | Lineage | `affectedStores` | WRITTEN | RESTORED | Equal? |
|---|---|---|---|---|---|
| `room.create` | L3 | `[]` | roomStore + bimManager + elementRegistry | same three | ✅ |
| `room.delete` | L3 | `[]` | roomStore + roomSpatialIndex | **all four** | ✅ **restore ⊇ write** |
| `room.move` | L3 | `[]` | roomStore | roomStore | ✅ |
| `room.setName` / `setNumber` / `rename` | L3 | `[]` | roomStore | full record | ✅ **one gesture, one Ctrl+Z (§L-905)** |
| `room.setOccupancy` | L3 | `[]` | roomStore | full record | ✅ |
| `room.setMaterial` / **COLOUR** | L3 | `[]` | roomStore `.colour` | full record | ✅ |
| `room.setFinish` | L3 | `[]` | roomStore `.finishes` | full record | ✅ |
| `room.setHeightOffset` (**PARAMETER**) | L3 | `[]` | roomStore | full record | ✅ |
| `room.recomputeBoundary` | **L6** | `[]` | **nothing — refuses to write** | n/a | ✅ vacuously |
| `room.regenerate` | **L6** | `[]` | **nothing — typed refusal** | n/a | ✅ vacuously |
| **`room.redetect`** | **L5** | `[]` | roomStore ×3 (`:107,127,134`) | ⛔ **NOTHING** — `nonUndoable` `:65`, `undo()` no-op `:256` | ⛔ **THE ONE EXCEPTION** |
| `template.create` | L3 | `[]` | templateStore | templateStore | **NOT MEASURED** |
| BATCH CREATE | L3, legacy-only | — | roomStore | roomStore | **NOT MEASURED** — `BatchCreateRoomsCommand` has **no bus verb**; reached only from `ProjectLoader.ts:2258-2261` |
| ROTATE / TRANSFORM | — | **NO VERB** | — | — | n/a |
| LEVEL CHANGE | — | **BLOCKED** — `levelId` immutable, `RoomStore.ts:302-304` throws | — | — | ✅ **an enforced refusal** |

**⇒ 12 of 13 room verbs have write-set ≡ restore-set.** The exception is `room.redetect`, and it is
**deliberate and documented** (`ReDetectRoomsCommand.ts:57-64`: *"a side-effect of wall changes, not a
direct user action… prevents phantom undo entries"*).

⚠ **`room.redetect` is lineage L5 and therefore an unconditional EI-7 violation by C84 §4A's letter** —
a `CustomEvent` (`RedetectRooms.ts:82-90`) to a PRYZM-1 command, on **neither** stack. **C94 records it
as a JUSTIFIED L5**: the reasoning at `:57-64` is sound, and forcing it onto a stack would make one wall
undo require N presses. ⛔ **But the justification covers the GEOMETRY, not the AUDIT STAMP** — §9.3's
`detectionVersion` ratchet rides on `nonUndoable` and is **not** justified by it.

---

## 11. Vocabularies

**Room's material/finish vocabulary is family-private. It is NOT V1-V5.**

- **Finish surfaces — 3 members:** `plugins/rooms/src/handlers/SetRoomFinish.ts:85`
  `ROOM_FINISH_SURFACES = ['floor','ceiling','walls']`; spec shape `:88-101` (`materialId?`,
  **`materialName` required**, **`materialColor` required**, `finishCode?`, `nbs?`, `csiDivision?`,
  `notes?`), mirroring `RoomFinishSpecSchema` (`RoomDataSchema.ts:73-81`).
  ⚠ Header `:79-83` records a **deliberate non-import** of `@pryzm/room-topology` for lockfile reasons —
  an EI-10(a)-style named reason, and the transcription **is not pinned by a test** (EI-8a owed).
- **THREE colour palettes, none shared:** `DETECTION_COLOUR_PALETTE` (`RoomDetectionEngine.ts:154`,
  cycled `:507`); `SYNC_FILL_COLOURS` — 6 states (`RoomBoundaryBuilder.ts:23-30`); `SYNC_STATE_COLOURS`
  (`RoomColourSystem.ts:52`); plus `ROOM_TYPE_COLOUR` (`livingGraphSchema.ts:245`).
- **V4 contains ZERO room entries** — `grep -i room` on `packages/ai-host/src/intents/finishRef.ts` → no
  matches; its aliases are wall/ceiling substrates.
- **No live material bridge**: `plugins/rooms/src/committer/material-bridge.ts` exists and parses a colour
  from slot 2 of `room|<materialId>|<color>|fill` (`:15-22`), **discarding `parts[1]`, the `materialId`** —
  and it is reached only from `RoomCommitter`, which is **never constructed**. `room.setMaterial` writes
  `colour: string` straight onto the record (`SetRoomMaterial.ts:124`).

⛔ **Reported to lane ZA: room adds a family-private 3-surface finish vocabulary + four colour palettes
to C84 EI-8's five.** C94 does **not** design the unification. **`materialName` and `materialColor` are
BOTH required in the room finish spec** — so room already encodes the V5 distinction (name carries
physical semantics, colour is a tint) that [C84 EI-8](C84-ELEMENT-INTEGRITY.md) protects. ⭐ **Room is
evidence that the name/tint split is the right model, independently arrived at.**

---

## 12. Geometry

| Axis | AS-IS |
|---|---|
| **Stack A (live)** | `packages/room-topology/src/RoomBoundaryBuilder.ts:1-2` — *"THREE.js mesh overlay for room floor fills + 3D volumes"*; `FLOOR_EPSILON=0.01` `:21`, `ROOM_RENDER_ORDER=5` `:32`, `VOLUME_RENDER_ORDER=4` `:34`. Instantiated `initBuilders.ts:457`. Labels: separate `RoomLabelRenderer` `:477` |
| **Stack B (dead)** | `packages/geometry-kernel/src/producers/room.ts:355` `produceRoom` — half-edge flood-fill `:212,296,303,322`. Reached only via `RoomCommitter`; `grep "new RoomCommitter"` → **0** |
| **Proven to agree?** | ⛔ **NO.** `packages/geometry-kernel/__tests__/produceRoom.parity.test.ts:62` self-describes as *"parity suite (synthetic-but-analytic)"* — determinism `:83,98-99`, door opening `:168`, no-walls `:270`. **It never compares Stack B to Stack A.** [C84 §8.e](C84-ELEMENT-INTEGRITY.md) |
| **Area / volume** | ⚠ **one canonical + four rivals.** Canonical: `RoomPolygonUtils.ts:873` `computeRoomMetrics`, called from `RoomStore.ts:232,328`, `roomSnapshotUtils.ts:285` (*"always recomputed — never trusted from JSON"*) and `:303-304`, `roomFromGraphSpec.ts:13`. **Independent**: `produceRoom` (`producers/room.ts:373`), `RoomPlanToolHandler.ts:134`, `WallMoveConsequencePlanner.ts:477`, and `plugins/ifc-export/src/exporters/space.ts:282` — which reads **`room.grossAreaM2 ?? room.netAreaM2`, a THIRD field spelling** |
| **Datum** | `FLOOR_EPSILON = 0.01` above the slab; volume from `boundary` + height offset. Not a multi-site datum problem |

⛔ **"What is this room's area?" has five implementations and three field spellings** —
[C84 EI-9](C84-ELEMENT-INTEGRITY.md), and it reaches the **IFC export**, so two exporters can disagree
about a certified quantity. ⚠ `roomSnapshotUtils.ts:285`'s *"never trusted from JSON"* is the right
instinct and makes the canonical path authoritative on load — but it does not bind the four rivals.

---

## 13. THE DELTA

| # | Fix | Invariant | Proof required |
|---|---|---|---|
| **1** | **Correct C84 EI-4a's "CLOSED"** (§0.3) — `BimService.ts:169` is unchanged and the test is not on `main` | governance | C84's prose matches its own §5 correction |
| **2** | **Make Delete work on a room** — route **both** UI paths to `room.delete`. ⛔ **Do NOT add a room branch to `DeleteElementCommand`** (EI-4a: one route per intent; a better command exists) | **EI-4 / EI-4a** | `OneDeletePathAcrossSurfaces.test.ts` **on `main`**, covering room, watched RED |
| **3** | **Stop discarding `success:false`** at `DeleteElement.ts:63` and `BimService.ts:172` | **EI-4**, C16 CA-18 | a failed delete surfaces to the user |
| **4** | **Add `['room','roomStore',…]` to `createSnapshot`'s `optionalStores`** — rollback is a no-op for room today (§7.1) | **EI-7d**, L-953 | the C84 §5 table-driven sweep |
| **5** | **Consume `preserveMetadata` in `mergeWithExisting`**; pass `true` at `ReDetectRoomsCommand.ts:134`. ⛔ Do not mint a second mechanism | **ADR-0319 §2**, L-952 | **watched-RED**: rename a room, delete a bounding wall, undo, assert `detectionVersion` byte-equal. *(This is C84 §5's third named test, `roomIdentitySurvivesUndoRedetect.test.ts` — §9.2 answers its identity half; this closes its audit half)* |
| **6** | **Add `modifiedAt` to ADR-0319 §3's enumerated exclusion list** — by naming, never by pattern | **ADR-0319 §3** | the list is a visible diff |
| **7** | **Fix the sequence collapse** at `PlanarTopologyEngine.ts:127` — preserve the index-aligned half-edge record; and correct C79 §10.3's citation (`:174`/`wallIds` → `:127`/`edgeIds`) | **EI-2(d)** | ordered `boundingWallIds`, asserted against the face walk |
| **8** | **Delete the `room.created` emitter — ⛔ but MEASURE the webhook subscribers first** (§5.1). It is a published API surface | **EI-13**, [C47](C47-FILE-FORMAT-VERSIONING.md) | the webhook allow-list and `VALID_EVENTS` are updated in the same PR |
| **9** | **One area implementation.** Five today, three field spellings, and two IFC exporters | **EI-9**, C73 §3.1 | every caller reaches `computeRoomMetrics`; `grossAreaM2`/`netAreaM2` reconciled |
| **10** | **Close `boundingWallIds` layer (a) in the plugin** — `plugins/floor/src/handlers/CreateFloor.ts:137` still writes `[]` | **C79 §7.1** | no unconditional `[]` writer remains |
| **11** | **Fold the three scene-graph marks into one** (`isRoomOverlay` / `isRoomVolume` / `elementType`) | **EI-9**, C15 §12 | one predicate |
| **12** | **Retire the DTO shim** on its own declared 3-step path (`store.ts:1-29`); fix its stale "twelve" | **EI-5a** | the shim is gone |
| **13** | **Declare or retire the second `RoomStore`** (`packages/stores/src/RoomStore.ts`) and the second IFC exporter | **EI-9 / EI-10** | named reason + EI-8a test, or retirement |
| **14** | **Pin `ROOM_FINISH_SURFACES`' deliberate transcription** to its source (§11) | **EI-8a** | an executed equality test |

---

## 14. REFUSALS

| # | Refusal | Named where | Verdict |
|---|---|---|---|
| **R1** | **A room cannot change level** — `levelId` is immutable | `RoomStore.ts:302-304` (throws) | ✅ **ENFORCED, not merely documented** — the strongest refusal shape measured in this lane |
| **R2** | **`room.recomputeBoundary` refuses to write** and returns a determination instead | `RecomputeRoomBoundary.ts:276-295` | ✅ **C16 CA-18 model** |
| **R3** | **`room.regenerate` is a typed refusal** | `RegenerateRooms.ts:220-227` | ✅ |
| **R4** | **`boundingWallIds` absent ⇒ UNDETERMINED, never `[]`** | `boundingWallDetermination.ts:113-125` | ⭐ **EXEMPLARY** — *"Zero walls was NOT determined."* The C74 honesty rule in one line |
| **R5** | **`room.redetect` is deliberately non-undoable** — it is a side-effect of wall changes, not a user action | `ReDetectRoomsCommand.ts:57-65` | ✅ **JUSTIFIED for geometry** — ⛔ **NOT for the audit stamp (§9.3)** |
| **R6** | **Room has no rotate/transform verb** — a room is defined by its bounding walls, not by a transform | nowhere | ⚠ **UNDOCUMENTED but architecturally correct.** **TO-BE: declare it** |
| **R7** | **Room is absent from GLB export** | nowhere | ⛔ **NOT A REFUSAL — an undeclared absence** (`GLBExporter.ts:112` is a comment) |
| **R8** | **Delete does nothing on a room** | nowhere | ⛔ **NOT A REFUSAL — a silent failure.** DELTA #2/#3 |

---

## 15. NOT MEASURED

1. **`BatchCreateRoomsCommand`** — `affectedStores`, snapshot and `undo()` body. **It has no bus verb**;
   reached only from `ProjectLoader.ts:2258-2261`.
2. **`template.create` / `CreateTemplateCommand`** — `affectedStores` and undo shape.
3. **Bake worker** — no room-reading bake path located; only `apps/bench/src/benches/bake-incremental.bench.ts`
   matched.
4. **`packages/stores/src/RoomStore.ts`** and the `aggregate-commands/roomCreate.ts` world — editor
   reachability.
5. **Room → floor/ceiling cascade reversal** — `CreateFloorCommand` / `CreateCeilingCommand` `undo()` bodies.
6. **`CreateDoorsBetweenAdjacentRoomsCommand.ts:163`** undo shape. ⚠ It still reads
   `room.boundingWallIds ?? []` — **layer (c) is NOT closed here**.
7. **Whether `roomSpatialIndex` is correctly restored after an UPDATE-class undo** — only the delete path
   (`DeleteRoomCommand.ts:93-96`) was measured.
8. **`plugins/rooms/src/boundaryRecomputeDetermination.ts`** — not read.
9. **Webhook subscriber registrations against `room.created`** — **blocks DELTA #8.**
10. **Whether the semantic-graph edges a room command writes are reversed by its undo** — per
    [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) this requires an **executed read-back**, not the presence of a
    restore call, and C84 §4C(a) records awarding exactly that pass by read. **Not attempted here.**
11. **`SetRoomOccupancyCommand.execute()`'s exact `roomStore.update` line.**


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

### THE VERB — ⛔ **DECLARED REFUSAL. THIS FAMILY MUST NOT GET A LEVEL DROPDOWN.**

| | |
|---|---|
| **Declared at** | `packages/command-bus/src/levelChangeVerbs.ts` — `LEVEL_CHANGE_REFUSALS.room` |
| **Disposition** | `structural` |
| **Deciding clause** | [C84 EI-1](C84-ELEMENT-INTEGRITY.md) — one authority per family. For `room`, the authority is **wall topology**, not a user-authored `levelId` |
| **Evidence** | `packages/room-topology/src/RoomStore.ts:302-304` — `update()` **THROWS** when `levelId` differs |
| **Shown to the user** | *"Rooms are detected from the walls around them. Move the walls and the room is re-detected on the new storey."* |

**A room is not authored; it is DERIVED.** `REDETECT_ROOMS` produces the room set for a
storey from that storey's wall topology — which is precisely why a wall level change fires
`REDETECT_ROOMS` on **both** the source and the destination level, and why `RoomStore.update()`
throws rather than warns when handed a differing `levelId`: the throw is the store refusing to hold
a fact it is not the authority for.

Offering a level dropdown on a room would therefore create a second, rival answer to *"which storey
is this room on?"* — one authored by the user, one derived from geometry — and the very next
re-detection would silently overwrite the user's. **A control whose effect is erased by the next
unrelated edit is worse than no control**, because the user cannot tell which of the two happened.

The correct user path already exists and is the wall level change: move the walls, and the room
follows by construction.

### THIS IS A FEATURE OF THE DESIGN, NOT A GAP IN IT

The property panel renders **three** distinct outcomes and never collapses them into two: a
dropdown, the declared refusal sentence, or nothing at all when no one has decided. Rendering
nothing for a family that MUST NOT move would be indistinguishable from a family nobody looked at —
the blank-reads-as-fine failure [C84 EI-1b](C84-ELEMENT-INTEGRITY.md) names, and the same shape as
§context-data-honesty, where failure and emptiness are the same value. **The user is owed the
sentence.**

`apps/editor/__tests__/SlabLevelChangeReachesLegacyStore.test.ts` ARM 5 enforces this: every panel
family must resolve to a verb **XOR** a declared refusal — never to neither, never to both.

### DUPLICATE-TO-LEVEL

⛔ **Also refused, and for the same reason.** Duplicating a room to another storey would mint a
room record on a storey whose wall topology does not produce it; the next `REDETECT_ROOMS` on that
level deletes it. To get the room upstairs, duplicate the **walls** that bound it.
