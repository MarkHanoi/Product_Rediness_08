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

---

## RAC — the chat surface for this family (added 2026-08-19, lane RAC1)

> **Mandated by C84 §6**, measured against the **C67 §1.0 seven-verdict vector** (V1 RESOLVE ·
> V2 DISPATCH · V3 STATE · V4 PERSIST · V5 UNDO · V6 SYNC · V7 REPORT). Cross-family summary:
> **C84 §4F**. Capability surface: **C67 §1.8**. Decisions: **ADR-0334**. Rows: **L-1140 … L-1147**.
> ⛔ **No cell is left blank — a blank reads as "fine" (EI-1b). Unknown reads `NOT MEASURED`.**

### Status — **⭐ PUBLISHED — and this is the ONE family where CHAT ≥ PANEL**

| | Measured 2026-08-19 |
|---|---|
| **`element.changeType` tag(s)** | `room` (no `element.changeType` branch — occupancy is not a type) |
| **Branch** | `apps/editor/src/engine/initBusHandlers.ts`n/a |
| **Type catalogue** | ⛔ no type catalogue. **Occupancy is a CLOSED COMPILE-TIME ENUM** — `RoomOccupancyTypeSchema`, 51 members, identical in every project. |
| **Type field on the record** | `occupancy` |
| **Executor the chat must use** | ✅ `room.setOccupancy` — live, registered, undoable |
| **Chat capabilities published TODAY** | `set-room-occupancy` · `rename-room` · `set-room-number` · `set-room-height-offset` |
| **Retiring condition** | n/a. The open item points the other way — see below. |

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

- ⭐ **THE INVERSION, RECORDED EXPLICITLY BECAUSE IT IS EVIDENCE.** `ElementTypeCatalogRegistry.ts:134-138` declares a **`readOnlyReason`** for room — the property panel does **not** offer a type change — while the chat offers four capabilities including `set-room-occupancy`. **Here the PANEL is the lagging surface, not the chat.** C84 EI-3 is symmetric and this row is the proof: the audit must not assume the panel is always ahead.
- ⭐ **AND THIS FAMILY IS THE ORIGIN OF THE WHOLE ROOT CAUSE.** `ChatCommandClassification.ts:84-95` records that `room.setOccupancy` sat in `B_CATALOGUE` inheriting *"those catalogues are not injected yet"* — while occupancy is a closed enum with **no injection to wait for**. *"The blocker was unsatisfiable in the sense that matters: nothing anyone could build would ever have 'arrived'."* Cost: *"the founder's rooms read `unclassified` while a LIVE, undoable verb sat one sentence away."* **The identical mistake is on line 98 for `element.changeType`** — see C84 §4F.1 and C67 §1.8.4. **This family's history is the argument for C67 rule 15.**
- ⚠ `set-room-occupancy` uses **`fanOutPerId`**, the only spec that does. **ADR-0334 D1 reclassifies it as a MIGRATION TARGET, not a precedent**: its per-room commands are genuinely different (`planRoomOccupancyFanOut` does authored-name protection + next-free numbering), which is admissible — but **N undo entries for one sentence is not**, and it should converge on one.
- **NOT MEASURED**: V3/V4/V5/V7 for `set-room-occupancy`. This lane did not trace them.

### NOT MEASURED for this family (explicit — EI-1b)

- **No utterance was typed into a live editor.** Every verdict above is source-measured.
- **V6 SYNC** — inherited FAIL from C67 §1.0 (the CRDT read-back leg does not exist; the transport
  defaults OFF). **Not re-derived here**, and not a defect of this family.
- **V3 / V4 / V5 under a CHAT driver** — where this family is dark, they cannot be measured through
  chat at all; where it is published, they are measured only as C67 §1.0 records. ⛔ **The panel's
  passing is NOT transferable evidence** (ADR-0334): publication requires an **executed read-back**
  of this family's geometry store (C16 CA-21), never a `success: true`.

---

## §DIAG-ROOM-LOOP — the always-on loop-break audit is NORMATIVE about WHICH ARRAY IT READS (added 2026-08-20, lane FURN1, L-1390..L-1393)

### §DIAG.1 — RULE: the audit reads the array `buildWallGraph` consumes. Nothing else.

`RoomDetectionEngine._diagRoomLoop` MUST be called with **`wallGraphInputSplit`** — the exact
segment array handed to `buildWallGraph` — and its summary line MUST name the array it read.

**It was called with `combinedInput`** (`RoomDetectionEngine.ts:371`), the RAW list assembled from
the stores, and the pipeline runs **four repair passes** between the two:

| line | pass |
|---|---|
| 398 | `_snapNearbyCorners(combinedInput, 0.30)` — fuses endpoints within **300 mm** |
| 422 | `_reconnectDanglingEnds` — moves a dangling end onto the host body it aims at |
| 430 | `_splitAtBodyCrossings` — splits both walls at a true X-junction |
| 435 | `_splitAtTJunctions` — splits the host AND snaps the guest endpoint to the split point |
| 437 | `buildWallGraph(wallGraphInputSplit)` |

⭐ **So the audit predicted failures for geometry the engine had already fixed, and printed that
prediction beside a room count derived from the fixed array.** The founder's 7-level model logged
`detectedRooms=24 … unresolvedLoopBreaks=30` on **every level**. 24 is the right answer. 30
describes a state that never reached the graph. **The two halves of that line came from different
arrays and neither described the other.**

⛔ **The audit could not answer its own question.** "Did the repair close this loop, or decline it?"
is the only reason the audit exists, and reading the pre-repair array makes *repaired* and *declined*
**indistinguishable** — a §CONTEXT-DATA-HONESTY failure of the probe-reads-the-wrong-input shape.

**The evidence it was a WIRING SLIP, not a design choice:** the method's own `baseId` regex is
`/(_[cs]\d+)+$/`. `_s\d+` suffixes are minted **by `_splitAtTJunctions` at :435** — after
`combinedInput` was captured. On the array it was given, that half of its own regex could never
match anything. It was written for the post-split array.

### §DIAG.2 — RULE: an audit MUST NOT disagree with the repair it reports on

`_diagRoomLoop` had **no perpendicularity test**. Any endpoint whose perpendicular foot landed in
another wall's mid-span at 200–1000 mm was reported as a loop break — **including a wall running
exactly PARALLEL to its neighbour**, and reported **twice**, because both of its endpoints project
into the host's body. On a 24-room-per-level residential plate that is ordinary architecture: party
walls, riser shafts, service voids, and corridors (`minCorridorWidth` is **900 mm**, inside the
counting band).

The **repair** has the test — `_reconnectDanglingEnds`'s `REACH_COLLINEAR_MIN = 0.9` (`:844`) — and
correctly **refuses** to move a parallel near-miss. The audit and the repair therefore disagreed by
construction, and the audit was the one that was wrong. It now shares the same floor, and the
declined measurements are counted under their own name (`parallelNearMisses=`), never dropped.

Two further multipliers, both closed:
- **SAME PARENT.** The skip compared FULL UUIDs, so `w_c3` and `w_c7` — two chords of ONE curved
  wall from `tessellateCurvedWallForTopology` — were "different walls" and could report breaks
  against each other, up to `segments²` times. Both sibling passes already carried this guard
  (`_reconnectDanglingEnds:831`, `_snapNearbyCorners:1258`); this one did not.
- **ORDERED-PAIR DOUBLE COUNT.** One physical junction found from both sides printed twice.
  Aggregation is now on the **junction** (unordered base-pair + 100 mm-quantised foot).

### §DIAG.3 — `thickShellTJunctionsRescued` is UNSATISFIABLE at every thickness this product emits

The rescue window is `SNAP_FLOOR < dist < hostSnap`, where
`hostSnap = max(0.20, thickness/2 + 0.02)`. The window is non-degenerate **only above a 360 mm
host**, and only above **402 mm** does it catch the §PARTITION-SHELL-INNER-FACE clamp signature it
was written for (that clamp lands at `th/2 − 0.001`).

| producer | thickness |
|---|---|
| `apartmentLayout/executePlan.ts:32`, `tgl/wallsAndDoors.ts:969`, `layoutRequestPayload.ts:124` | **0.10 m** |
| `residentialBuilding/coreSizing.ts:34`, `WallPlanToolHandler.ts:59` | **0.20 m** |
| `AIService.ts:328` | **0.30 m** |

**Every generated wall is below both thresholds.** Of the built-in catalogue
(`WallSystemTypeStore.ts:80-186`) only `wt-monolithic` (1.000 m) clears them; brick at 0.375 m
clears 360 mm but not 402 mm.

⇒ **`thickShellTJunctionsRescued=0` printed next to `unresolvedLoopBreaks=N` read as a rescue
mechanism that failed. It was never applicable.** That is defect shape D — a check that runs, passes,
and could never have failed. The summary line now states `rescueWindow=EMPTY-BY-CONSTRUCTION`
whenever no host on the level exceeds 360 mm, and omits the clause when the window really does open.

⚠ **Recorded, not resolved:** the two wall-type catalogues disagree by 10× on `wt-monolithic` —
`WallSystemTypeStore.ts:94` declares **1.0 m**, `plugins/wall/src/system-type-store.ts:75` declares
**0.1 m**, and `PluginRegistry.ts:230-233` resolves in favour of the 1.0 m one. Not this lane's fix.

### §DIAG.4 — the >1 m blind spot

The BREAK clause is gated `dist < 1.0`. An endpoint further than a metre off a host body was
**counted nowhere and logged nowhere**. "917 mm" being the largest value the founder ever saw is
therefore **the cap, not the model**. Those measurements now have a named bucket
(`farEndpointsOver1m=`); they are still not warned, because they are usually unrelated walls.

### §DIAG.5 — RETRACTION: `_reconnectDanglingEnds`' stated root cause

Its docstring blamed the resolver's §MULTI-CLUSTER path for leaving a partition end *"up to ~1 m
SHORT"*. **Both halves are now false and the docstring is retracted in place** (not deleted):

1. **Capped at 50 mm.** §CONSENSUS-OVERTRIM-GUARD (`WallJoinResolver.ts:2144`,
   `OVERTRIM_BACK_ALLOWANCE_M = 0.05`) bounds axial retreat.
2. **The pass cannot fire on that geometry at all.** §MULTI-CLUSTER trims every unpinned member
   toward the SAME consensus point, landing them ≤ ~60 mm apart (`WallJoinResolver.ts:2096-2097`),
   so `connectedToWall` (`CORNER_CONNECTED_TOL_M = 0.30`) finds each one connected to its siblings,
   `dangling` is false, and the whole cluster is skipped — **even when it sits 500 mm off the shell**.

**⛔ Nobody may cite that docstring as evidence the multi-cluster case is handled. It is not.**
The pass still does real work on a **lone** dangling endpoint, which is what its tests exercise.

### §DIAG.6 — NOT MEASURED

- The **browser** cost of the audit's `console.warn` stack captures. The compute is measured and
  small (~0.20 ms per call at the founder's ~56 segments/level, node, 20-rep mean); the devtools
  stack-capture cost per warn line is **NOT measured** and must not be claimed as a win.
- Whether any of the founder's 30 measurements were real breaks at all. The pre-repair reading
  cannot be re-interpreted after the fact; only a re-run on the fixed audit can say.

---

# §TOBE-ROOM — THE ROOM AS A LIVING ENTITY, AT A STATED PERFORMANCE COST

> **Added 2026-08-24 by lane ROOM44**, from the founder's direction: *"document the TO BE — what the
> room system needs to become for it to be a **living entity without being a performance issue**"*,
> and his naming of **wall and room as the two critical operators**. The wall half is
> [C85](C85-ELEMENT-WALL.md), owned by lane GRAPH43.
>
> **⛔ NOTHING ABOVE THIS LINE IS REWRITTEN.** §0–§15, §L-1032, the RAC section and §DIAG-ROOM-LOOP
> are the measured AS-IS record and stay as they are. Where a clause here supersedes one above, it
> **names it and points at it**; §TOBE.9 collects the AS-IS pointers that have since rotted, as
> dated corrections rather than as edits.
>
> **Cites, does not restate.** [C72 §9](C72-PROPAGATION-AND-PREVSTATE.md) *(ADAPT or REFUSE, never
> SILENT)* is the **spine of this section** · [C71 §1](C71-GRAPH-AND-TOPOLOGY.md) the six edge
> semantics and §4 *"the three graphs stay separate"* ·
> [C78 §2](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *A · Element identity*, §6 *E · Dependency
> freshness*, §8 *G · UNDETERMINED semantics*, §11 *J · Reconciliation*, §14 *M · Persistence* ·
> [C83](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) IMPOSSIBLE / INADVISABLE / FINE ·
> [C84](C84-ELEMENT-INTEGRITY.md) EI-1…EI-13 · [C10 §1](C10-PERFORMANCE-AND-OBSERVABILITY.md) the
> NFTs and §1.1 the measurement methodology · [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) the
> tolerance register.
>
> **Measured at HEAD `0589a36c`, 2026-08-24.** Every `file:line` below was re-read for this section;
> where a number could not be measured from source it says **NOT MEASURED** and does not guess.

---

## §TOBE.0 — ⛔ THE PREMISE THIS LANE WAS GIVEN WAS WRONG, AND THE CORRECTION IS THE FIRST FINDING

This lane was briefed with the following, from the founder's production console:

```
RoomDetectionEngine: Detected 5 → 4 room(s)
[BimManager] Unregistered element 746ae083-…
§OPENED-REGION: Room 00-004 (85.7 m²) is no longer its own room — it has merged
  into the space next to it. 3.42 m of the boundary it used to have now has no
  wall on it. (gap 3.42 m, anchored 2/2, rooms 5 → 4, listeners=1)
```

…and with the reading: *"An 85.7 m² room was DELETED as a side effect of dragging a wall,
**silently**. A re-derived room cannot be 'damaged', it can only cease to exist, so **there is
nothing to report and nothing to recover**."*

**Measured: the word *silently* is false, and so are both halves of the sentence after it.** The
console line quoted as evidence of silence **is itself the report**. It is produced by
`packages/room-topology/src/RoomTopologyObserver.ts:1116-1120`, from a finding computed by
`scanForOpenedRegions` at `:1101`, and the same finding is carried to the user's chat by
`apps/editor/src/ui/ai/OpenedRegionProposal.ts:272` as an **Accept/Cancel card** which, on Accept,
dispatches one ordinary `wall.create` (`:248`, `:327`) and closes the region in **one undo step**.
The founder's own session ends `Done — an interior wall now closes Room 00-004. Ctrl+Z undoes it in
one step.` (`:328-331`).

### §TOBE.0.1 — ⭐⭐ THE DETECTION-AND-NARRATION LAYER IS THE STRONGEST PART OF THIS FAMILY

Recorded here **before** any defect, because a TO-BE section that reads as though nothing works is
as false as the silence claim it corrects — and because the parts named here are the ones a
refactor is most likely to break.

| What works | Where | Why it must be preserved |
|---|---|---|
| **A before/after room-set comparison at the re-derivation chokepoint** | `RoomTopologyObserver.ts:1101` → `OpenedRegionDetector.ts` (932 lines, pure, THREE-free, DOM-free, store-free) | It is the ONLY place in the repo that can say *"a region that used to be a room is not one any more"*. No store, no graph and no diagnostic can answer that — the module's own header measures all three candidates and rejects them |
| **Six named refusals instead of a confident wrong answer** | `OpenedRegionDetector.ts:567,578,589,603,649,684` | [C71 §4.4](C71-GRAPH-AND-TOPOLOGY.md) / [C74](C74-CONSTRAINT-HONESTY.md). §TOBE.2 enumerates them |
| **`§WD32-EXTEND-BEFORE-CREATE` — the CREATE rung stands down when EXTEND is available** | `OpenedRegionDetector.ts:662-690` | ⭐ This is the founder's *"extension, not a new partition"* principle, **already implemented**. §TOBE.1.1 |
| **A guarantee the question reaches a human, with a measurable fallback** | `chatPromptHost.ts` (§PROMPT-REACHES-A-HUMAN, L-881) · `getSurfaceDiagnostics().fallbackPrompts` | *"A console line is not a user-facing message"* — the rule this family paid for and the rest of the repo should adopt |
| **`listeners=N` printed with every finding** | `RoomTopologyObserver.ts:1113` | Distinguishes *"the offer ran and could not reach a surface"* from *"no offer was ever subscribed"*. A previous build could not tell them apart and it cost a founder test cycle |
| **Silence when nothing was lost** | `OpenedRegionDetector.ts` header, *"SILENCE IS A FEATURE"* | A wall move that grows a room produces no finding. A system that cries wolf gets muted |
| **Identity carried across re-derivation for rooms that survive** | `RoomDetectionEngine.ts:1139` `id: match.id, // preserve ID so undo works` | §9.2 above; still true, still load-bearing |

⛔ **No TO-BE clause below may be implemented by weakening any row of this table.**

### §TOBE.0.2 — WHAT IS ACTUALLY WRONG, stated in one sentence

> **The room's EXTENT is a first-class, self-healing, narrated, user-recoverable quantity.
> The room's MEANING — its name, number, occupancy, department, finishes, IFC identity, tag anchor
> and schedule row — is not. The recovery restores the shape, cannot restore the record, and reports
> success using the name of the record it did not restore.**

That is the whole of §TOBE.1, and everything after it is either the cost of fixing it or the
boundary of what is already fixed.

---

## §TOBE.1 — ⭐⭐⭐ THE CENTRAL QUESTION: does a room have identity that survives its walls changing?

### §TOBE.1.1 — The founder's objection, and the fact that the code already agrees with him

> **Founder, same day:** *"the new partition being created is also present — **NOT the extension of
> existing wall as requested**."* And, recorded verbatim inside the detector itself
> (`OpenedRegionDetector.ts:254-256`): *"the algorithm should just extend the wall to connect with
> whatever it can."*

**This is not an open defect on the room side. It was closed by §WD32-EXTEND-BEFORE-CREATE
(L-10810).** `OpenedRegionDetector.ts:662-690` runs **RUNG 1 (EXTEND) BEFORE RUNG 3 (CREATE)**: when
an existing wall is collinear with the gap and merely too short, the detector emits
`reason: 'gap-closable-by-extending-an-existing-wall'` (`:684`) — a `position-unknown` finding that
**names the wall that should have grown and offers no wall at all**.

Its docstring (`:275-305`) reconstructs the contradiction from the founder's own log, and the
reconstruction is the most valuable paragraph in this family:

```
1. §L-1571-UNREPAIRED-JUNCTION … the re-weld will leave 1 junction(s)
     UNREPAIRED [wall_…VSVR:INCUMBENT_EXTENSION_REQUIRED]
2. §MOVE-REWELD-REFUSED: INCUMBENT_EXTENSION_REQUIRED × 1
3. §OPENED-REGION — Room 00-002 … 7.14 m of boundary now has no wall on it
4. §OPENED-REGION accepted: wall.create on level L0
```

> ⭐⭐ *"The re-weld KNOWS the incumbent must be EXTENDED and refuses; a SECOND system then fills the
> hole it left with a NEW WALL. Refuse-to-extend → room opens → create. That is the founder's stated
> principle exactly inverted, and the two systems were contradicting each other with no channel
> between them."*

⚠ **The step-2 refusal is correct and must not be "fixed".**
[C83 §10.2.2](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) forbids a re-weld from re-baselining a wall
the user did not touch; the same log shows it would have moved a non-subject wall **1716 mm**, and
L-922 is the scar from doing exactly that.

**⇒ The missing capability is a wall EXTENSION verb, and it is not this contract's to build.** The
detector defers it by name to **[C85 §10.7 W-M-12](C85-ELEMENT-WALL.md) / ADR-0336 stage 2**. C94
cites that and does not restate it. **What C94 owes is the room-side clause: RM-1 in §TOBE.6.**

> **⚠ HONEST RESIDUAL — the founder's `Done — an interior wall now closes Room 00-004` line is not
> explained by this.** Either that session predates L-10810, or the 3.42 m gap had no collinear
> donor wall and CREATE was correctly the only available rung. **This lane cannot tell which from
> source alone** — it needs the build SHA of that session. Recorded in §TOBE.10, not guessed. The
> second branch is a real and undecided question in its own right: **R-2**, §TOBE.8.

### §TOBE.1.2 — ⭐⭐ WHAT THE RECOVERY ACTUALLY RECOVERED — the identity ledger, measured

**The question:** after `§OPENED-REGION` closes the gap, **is the recovered room the SAME room, or a
new one wearing the same shape?**

**Measured from source. It is a new one.** The chain, with every step at a `file:line`:

| # | Step | Site | Consequence for identity |
|---|---|---|---|
| 1 | Wall moves; observer debounces 150 ms and re-detects | `RoomTopologyObserver.ts:39` `DEBOUNCE_MS = 150`, `:427` | — |
| 2 | Faces are re-walked; **each detected face is minted fresh** | `RoomDetectionEngine.ts:511` `id: crypto.randomUUID()`, `:515` `name: ''`, `:516` `roomNumber: ''` | Every re-derivation starts from **no identity at all** |
| 3 | `mergeWithExisting` re-attaches identity by **Jaccard overlap of `boundingWallIds`** | `:1073`; threshold `STRUCTURAL_MATCH_MIN_OVERLAP = 0.34` (`:146`); centroid fallback `CENTROID_MATCH_RADIUS = 2.0` m (`:127`) | Identity is **re-earned by geometric similarity on every mutation** |
| 4 | `used` enforces **one claim per existing room** (PARTITION-FIX) | `:1129-1131` | When two before-rooms merge into ONE after-room, **exactly one of them can keep its record** |
| 5 | The unmatched before-room is **removed, with no snapshot taken** | `ReDetectRoomsCommand.ts:105-112` — `roomStore.remove` `:107`, `bimManager.unregisterElement` `:108`, `elementRegistry.unregister` `:109`, `semanticGraphManager.removeAllRelationshipsForElement` `:110`, `roomSpatialIndex.remove` `:111` | ⛔ **`RoomData` — `name`, `roomNumber`, `department`, `occupancyType`, `occupancyLoad`, `programmeArea`, `finishes`, `colour`, `opacity`, `properties`, `ifcData`, `revitId`, `phase` — is destroyed. Nothing captures it.** This is the `[BimManager] Unregistered element 746ae083-…` in the founder's log |
| 6 | The command is `nonUndoable` and `undo()` restores nothing | `ReDetectRoomsCommand.ts:65`; `:256-258` `return { success: true, affectedElementIds: [] }` | ⛔ **`undo()` reports SUCCESS while restoring nothing** — [C84 EI-7](C84-ELEMENT-INTEGRITY.md), and a `success: true` for work not done, the shape [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) forbids |
| 7 | User Accepts the offer → `wall.create` → observer re-detects again | `OpenedRegionProposal.ts:327` | The region closes and a face is detected at the old coordinates |
| 8 | That face runs `mergeWithExisting` against `existing` — **which no longer contains the lost room** | `ReDetectRoomsCommand.ts:88` `roomStore.getByLevel(levelId)` | ⛔ **There is nothing left to match.** The only candidate is the merged neighbour, and `used` awards it to **one** half |
| 9 | The other half falls through to `return d` | `RoomDetectionEngine.ts:1135` | ⛔ **A fresh `crypto.randomUUID()`, empty name, empty number**, renumbered by `assignUniqueRoomNumbers` |

> ⛔ **THE MEASURED VERDICT.** The recovered room is a **new record wearing the old shape**. Its
> `id` is new — so every `boundedBy` / `adjacentTo` / `connectedTo` edge, every schedule row keyed by
> room id, every IFC `IfcSpace` identity and every annotation reference that pointed at
> `746ae083-…` now points at nothing. Its `name` and `roomNumber` are regenerated. Its
> `occupancyType`, `department`, `programmeArea`, `finishes`, `properties`, `ifcData`, `revitId` and
> `phase` are **gone, and not recoverable by any undo.**
>
> ⛔ **AND THE CONFIRMATION MESSAGE NAMES THE RECORD IT DID NOT RESTORE.**
> `OpenedRegionProposal.ts:328-331` renders `Done — an interior wall now closes ${finding.roomName}`,
> and `finding.roomName` is read from the **BEFORE** snapshot (`OpenedRegionDetector.ts:713`) — i.e.
> from the record deleted at step 5. **The product tells the user it restored "Room 00-004" at the
> exact moment there is no Room 00-004 anywhere in the model.** That is
> [C78 §2](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *A · Element identity* failing at the one moment
> the user is watching, and it is the single most misleading sentence this family emits.

⚠ **A WORSE VARIANT, and it is a mechanism, not a hypothesis.** At step 8, when the partition is
restored, **both** halves score a similar Jaccard against the merged record, and the tie is broken
by **centroid distance to the merged room's centroid** (`:1122-1126`), then by id. That quantity has
no semantic meaning. **So the surviving name / occupancy / IFC identity can land on the OTHER
half** — the neighbour's record attached to the recovered polygon, or the reverse. **Silent
misattribution is worse than loss**, because loss is visible and misattribution reads as correct.
⚠ **Which half wins in the founder's specific geometry is NOT MEASURED** — it depends on his
coordinates. The *mechanism* is at `:1122-1131` and is not in doubt.

### §TOBE.1.3 — ⛔ THE UNDECIDED QUESTION, WITH BOTH FAILURE MODES COSTED

**⛔ THIS LANE DOES NOT DECIDE THIS.** It is the largest architectural choice in the family and it is
the founder's. Recorded as **R-1** in §TOBE.8. Both options are stated with the failure class each
creates, because *"persist it"* is **not** obviously right.

| | **OPTION A — PURE DERIVATION (today, made honest)** | **OPTION B — PERSISTENT ROOM IDENTITY** |
|---|---|---|
| **What a room IS** | A view over wall topology. `RoomData` is a cache with authored fields glued on | A first-class element with a durable id, reconciled against geometry |
| **Cheap because** | ⭐ **Never stale, never disagrees with what is drawn, no reconciliation pass, no freshness class, no conflict UI.** These are real virtues, not accidents | — |
| **Costs** | ⛔ Authored meaning is destroyed by geometry edits (§TOBE.1.2); undo cannot restore it. Ids are unstable, so **no downstream system may key on a room id** — schedules, IFC identities, sheet references and annotations are all built on sand | Reconciliation on every mutation ([C78 §11](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *J*); a persisted room can go **stale** ([C78 §6](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *E*) and **disagree with what is drawn** |
| **New failure class** | None new — the existing one is total and silent | ⛔ A whole class: a room record whose stored boundary no longer matches its walls. Requires **UNDETERMINED** as a first-class state ([C78 §8](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *G*), a reconciliation pass, and a user-visible *"this room no longer matches its walls"* affordance |
| **What breaks if we choose it and are wrong** | Every schedule, IFC export and sheet reference silently re-points or blanks after an ordinary wall drag. **Discovered late, at the worst moment: at export** | Rooms drift from the model and the user sees two answers to *"what shape is this room?"*. **Discovered early, and loudly** |
| **Against [C72 §9](C72-PROPAGATION-AND-PREVSTATE.md)** | The room ADAPTS its extent — the ledger's `room ← wall` cell is `PROPAGATES` and correct. But its **meaning** neither adapts nor refuses: **SILENT**, which §9.2 forbids | Extent ADAPTS; meaning REFUSES by name when it cannot follow — exactly §9.1's second terminal state |
| **[C66](C66-CONCURRENCY-AND-SCALE.md) / collaboration** | Two users editing walls on one level derive two room sets with two id sets. **No CRDT identity to merge on** | A durable id is a merge key. [C78 §14](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) *M · Persistence* becomes answerable |
| **Precedent already in this contract** | — | ⭐ §14 R1: `levelId` is an authored fact the store REFUSES to change (`RoomStore.ts:302-304` **throws**). ⚠ **Option B does not overturn [§L-1032](#l-1032--the-storey-axis-change-level-and-duplicate-to-level)** — a room's STOREY can stay derived while its MEANING is durable. Those are different axes and §L-1032 only rules on the first |

> ⭐ **A THIRD SHAPE EXISTS AND MAY BE THE ANSWER: OPTION A + A TOMBSTONE.** Keep derivation exactly
> as it is — never stale, never disagreeing — and make the **loss** durable rather than the room. At
> `ReDetectRoomsCommand.ts:105-112`, before `remove()`, capture the full `RoomData` into a
> level-scoped **orphaned-meaning register**; when a later re-detection produces an unmatched face
> whose centroid falls inside a tombstoned polygon, **OFFER** the user its former name / occupancy /
> finishes rather than silently re-applying them (the founder's standing *"always ASK, never
> auto-edit"*). It buys back everything §TOBE.1.2 loses, adds **no** staleness class, and is bounded
> by *rooms lost in this session*, not by N. **This is RM-3, it is cheap, and it does not pre-empt
> R-1** — it is compatible with either ruling.
> ⚠ It does **not** buy back id stability, so it does **not** unblock schedules or IFC identities.
> That half genuinely needs R-1.

---

## §TOBE.2 — THE COMPETENCE BOUNDARY OF `§OPENED-REGION`, stated exactly

The recovery in the founder's log succeeded because the finding read **`anchored 2/2`**. That is a
precondition, not a detail. Measured, the mechanism has **six** declared exits, and only one of them
produces an offer.

| Exit | Site | What the user gets |
|---|---|---|
| **OFFER** — a wall proposal at the region's own former coordinates | `OpenedRegionDetector.ts:695-718` → `OpenedRegionProposal.ts:184` | Accept/Cancel card; Accept = one `wall.create`, one undo |
| `no-unwalled-edge` | `:567` | Narration only — *the region stopped being a room and yet every metre of its former perimeter still has a wall on it* |
| `gap-dominates-perimeter` | `:578` | Narration only — *"the region was not opened, it was demolished; one wall does not restore it"* |
| `multiple-disjoint-gaps` | `:589` | Narration only — *"picking the longest would be a coin-flip presented as a decision"* |
| `gap-turns-corner` | `:603` | Narration only — one straight wall cannot close a bent run |
| `gap-not-anchored-at-both-ends` | `:649`, re-asserted at the consumer `OpenedRegionProposal.ts:211` | Narration only. ⭐ The founder **accepted one at 1/2** and got *"a random wall not connected to any other — corrupted and angled in plan view"* (`OpenedRegionProposal.ts:196-199`) |
| `gap-closable-by-extending-an-existing-wall` | `:684` | Narration only, **naming the donor wall**. §TOBE.1.1 |

> ⭐ **THE BOUNDARY, IN ONE LINE: recovery is available only for a SINGLE, STRAIGHT, BOTH-ENDS-ANCHORED
> gap that no existing wall could close by growing. Every other shape of damage is NARRATED and NOT
> REPAIRABLE by this mechanism.** That is [C72 §9.1](C72-PROPAGATION-AND-PREVSTATE.md)'s *REFUSES*
> branch, correctly implemented — **and §9.3 says so explicitly: reducing a cell to REFUSES is a
> legitimate fix.** ⛔ **This section does not ask for those refusals to be replaced with guesses.**
>
> ⚠ **What it does ask:** every one of those six exits leaves the user with a **damaged model and no
> next step**. A refusal that names the missing capability is honest; a refusal that leaves the user
> with no route forward at all is honest **and unfinished**. RM-4.

---

## §TOBE.3 — WHAT DOES *NOT* FOLLOW: the room is a living entity for its EXTENT only

The [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md) ledger
(`tools/rac-conformance/certification/gates/host-move-propagation-matrix.json`, 64 cells) is the
authority here, **not this table** — read the gate. Measured 2026-08-24, the room-touching cells:

| Cell | Ledger verdict | What it means for "living entity" |
|---|---|---|
| `room ← wall` | **PROPAGATES** | ✅ The extent follows. This is the cell the recovery lives in |
| `room ← slab` | **PROPAGATES** | ⚠ ledger note: *"wiring proven, behaviour UNPROVEN"* — no test drives it |
| `room ← room boundary` | **PROPAGATES** | ⚠ ledger note: *"also undriven by any test"* |
| `room ← level` | ⛔ **SILENT** | `RoomTopologyObserver.attach` has no level subscription and no reconcile listener |
| `room tag ← wall` | ⛔ **SILENT** | ⭐ *"the refresh writes only `parameters`, so the label and area update while the **ANCHOR strands**"* |
| `room tag ← room boundary` | ⛔ **SILENT** | *"area drift refreshes the text, the position stays at the old centroid"* |
| `annotation / dimension ← room boundary` | ⛔ **SILENT** | *"no production code mints a room StableReference and the resolver has no room branch"* |
| `lighting ← room boundary` | ⛔ **SILENT** | `roomId` resolved at create/move time only. *"Deliberate, but unannounced at the moment it matters"* |
| `furniture ← room boundary` | ⛔ **SILENT** | `FurnitureData` carries **no `roomId`** — [C72 §9.5](C72-PROPAGATION-AND-PREVSTATE.md): nothing propagates along an edge that cannot be recorded |
| `ceiling finish ← room boundary` | ⛔ **SILENT** | `RoomFinishSyncService` writes only `finishSpec`; *"its guard early-returns with no log"* |

> ⭐⭐ **THIS TABLE IS THE DIFFERENCE BETWEEN A DERIVED VIEW AND A LIVING ENTITY, IN LEDGER FORM.**
> The room's **shape** propagates. Everything that makes it a *named, scheduled, drawn, furnished,
> lit* entity does not. **A room tag whose text updates while its anchor strands is the exact visual
> of a room that has geometry and no identity** — and it is a cell the gate already counts.
>
> ⛔ **C94 does not re-derive these verdicts and must never restate the ledger** — that is
> [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md)'s own rule and the shape §0.1 of that contract names.
> C94's obligation is narrower and is RM-5: **the room-side half of the SILENT cells — publishing a
> stable room reference other families can hold — cannot be built under Option A**, because there is
> no stable room id to publish. **That is R-1 blocking four ledger cells**, and it is the strongest
> single argument in the pack.

---

## §TOBE.4 — THE WALL/ROOM SEAM — ⭐ SETTLED 2026-08-24, BY TWO LANES MEASURING SEPARATELY

> **This section was published RESERVED and deliberately empty**, because the claim in it is shared
> with [C85](C85-ELEMENT-WALL.md) and *"one boundary described two opposite ways in two contracts"*
> is a failure this repo has already logged. It is now written, once, after both lanes agreed.

**⛔ THE AUTHORITY IS [C85 §10.8.5](C85-ELEMENT-WALL.md), NOT THIS SECTION.** It carries the
ownership table (which layer owns what, with each side's tolerances and what each one mutates).
⛔ **C94 does not restate it** — a table restated in prose is a table that rots, and this contract
has already recorded three independent counts of one family's verbs disagreeing (§0.1). If this
section and C85 §10.8.5 disagree, **C85 wins and this section is stale.**

### §TOBE.4.1 — What was settled, and how

Both lanes were briefed that `§DIAG-PARTITION-REACH` is *"a second subsystem quietly healing what
the first one broke, with a different tolerance and no shared vocabulary"* — i.e. **accidental
architecture**. C94 contested it on measurement; C85 re-measured **independently** and recorded:
*"Lane ROOM44 (C94) contested that, and on re-measurement here ROOM44 is right."*

> ⭐ **THE ARRANGEMENT IS CORRECT BY DESIGN, and the reason is one sentence: a READ-SIDE graph
> repair may legitimately be MORE PERMISSIVE than a WRITE-SIDE one, because it cannot corrupt the
> model.** Forgiving 1.25 m when deciding whether a loop closes *for the purpose of naming a room*
> is sound; forgiving 1.25 m when *moving somebody's wall* is not. **The two numbers differ because
> the two acts differ** — not because two subsystems drifted apart.

**The C94-side fact that carries that verdict**, and the one this contract owns:
`RoomDetectionEngine._reconnectDanglingEnds` (`:838`) operates on an **in-memory copy** of the
segment array feeding `buildWallGraph` (`:437`) and **writes no `WallStore` record**. Its constants
are `CORNER_CONNECTED_TOL_M = 0.30` (`:849`), `REACH_MAX_M = 1.25` (`:854`),
`REACH_COLLINEAR_MIN = 0.9` (`:857`), `SPAN_MARGIN_M = 0.05` (`:859`), `SNAP_FLOOR = 0.20` (`:860`);
`_snapNearbyCorners` runs first at **0.30 m** (`:398`). C85 verified the in-memory-copy half
independently.

### §TOBE.4.2 — The division of labour, stated once so both contracts can cite it

| Question | Owner | Where |
|---|---|---|
| *"Did this region stop being a room?"* | **ROOM** | `OpenedRegionDetector`, §TOBE.0.1 |
| *"Where is the missing boundary, and may I say so?"* | **ROOM** | the six refusals, §TOBE.2 |
| *"Should an existing wall GROW to close it?"* | **ROOM decides it is needed; WALL performs it** | `OpenedRegionDetector.ts:662-690` stands CREATE down and names the donor; the verb is [C85 §10.7 W-M-12](C85-ELEMENT-WALL.md) / ADR-0336 stage 2 (§TOBE.1.1, RM-1) |
| *"May this baseline move?"* | ⛔ **WALL, exclusively** | C94 asserts nothing here |

### §TOBE.4.3 — ⛔ THE ONE REAL DEFECT AT THE SEAM — still open

**Neither layer publishes its tolerance to the other**, so nobody can state the **combined
competence envelope**: the band in which the room layer will report a closed loop that the wall
layer would refuse to weld. Both contracts now record this identically, and C85 adds — as a
`NOT MEASURED`, not a claim — that `DEFAULT_SNAP_RADIUS = 0.5` is *inherited from snapping and has
never been justified as a **weld** tolerance*.

> ⛔ **RM-6 / P2.5 REMAINS GATED.** Agreeing on ownership is **not** building the register, and the
> seam being settled must not create momentum into work that is not done. The fix is a shared, cited
> [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) register. ⛔ **C94 asserts nothing about which
> wall-side number is correct** — those are C85's to judge.

> ⚠ **RECORDED FOR THE METHOD, not for the credit.** Main briefed BOTH lanes the same wrong way.
> One lane contested it with measurement, the other re-measured and agreed, and the contracts now
> say the same thing for the same reason. **Two lanes correcting the brief is why this pair of
> contracts is worth trusting** — and it is the third time in this lane that re-measuring beat
> re-transcribing (§TOBE.0, §TOBE.9, here).

---

## §TOBE.5 — ONE GESTURE, TWO CENSUSES, ONE VERDICT

The founder's gesture reported **`0 junction(s) refused`** (`WallMoveReweldService.ts:860`) while
`§OPENED-REGION` simultaneously reported an 85.7 m² room merging away. **Both are true, and they
answer different questions:**

| Census | Set it counts | Where |
|---|---|---|
| `N junction(s) refused` | **junction re-seats the re-weld declined**, per partner wall | `WallMoveReweldService.ts:860`, from `plan.refusals` |
| `§OPENED-REGION` findings | **regions that stopped being rooms**, per level | `RoomTopologyObserver.ts:1116` |

> ⛔ **The defect is not that either number is wrong. It is that a gesture publishes a per-junction
> verdict and no per-gesture one**, so `0 junction(s) refused` reads as *"this move was clean"* when
> it means only *"no junction re-seat was declined"*. That is [C74](C74-CONSTRAINT-HONESTY.md)'s
> failure-vs-emptiness shape at the reporting layer, and §DIAG.1 above records the identical shape
> inside this family already (*"the two halves of that line came from different arrays and neither
> described the other"*). RM-7.

---

## §TOBE.6 — THE NORMATIVE CLAUSES

⛔ **Every clause carries (a) the MEASURED failure it answers, (b) what recomputes, (c) on what N,
(d) what bounds it.** A clause without all four is not usable and must not be added here.
⭐ **Ship the instrument before the cure** — RM-0 comes first for that reason.

| # | Clause | Measured failure it answers | What recomputes · on what N · what bounds it |
|---|---|---|---|
| **RM-0** | ⭐ **INSTRUMENT FIRST. Every room record destroyed by a re-derivation is COUNTED and NAMED before any behaviour changes** — id, name, number, area, occupancy, whether it carried authored data, and the cause (`merged` / `no-longer-detected`). Emitted at the drop site, not reconstructed later | §TOBE.1.2 step 5: rooms are removed at `ReDetectRoomsCommand.ts:107` with **no record of any kind**. Today nobody can say how often this happens or to what | **Cost: O(dropped rooms per re-detect), typically 0.** One object per drop, one console line. **Bounded by** the drop loop it already sits in — it adds no pass. ⛔ Log-gated per [C10 §7](C10-PERFORMANCE-AND-OBSERVABILITY.md) so a 7-level load does not print thousands of lines |
| **RM-1** | **A room-boundary loss that is closable by EXTENDING an existing wall must never be closed by CREATING one** | Founder: *"NOT the extension of existing wall as requested"* | ✅ **ALREADY IMPLEMENTED** at `OpenedRegionDetector.ts:662-690`. C94's obligation is to **keep the CREATE rung subordinate** and to consume the extension verb when [C85 §10.7 W-M-12](C85-ELEMENT-WALL.md) / ADR-0336 stage 2 ships. **Cost: none new** |
| **RM-2** | ⛔ **A recovery message MUST NOT name a record the recovery did not restore** | `OpenedRegionProposal.ts:328-331` says `Done — an interior wall now closes Room 00-004` when no Room 00-004 exists (§TOBE.1.2) | **Cost: zero.** A string change plus one store read to say what the region is called *now*. ⛔ **This is the cheapest clause in the section and the most user-visible** |
| **RM-3** | **The authored meaning of a room destroyed by a re-derivation is retained as a level-scoped tombstone, and OFFERED — never auto-applied — to a later unmatched face whose centroid falls inside it** | §TOBE.1.2 steps 5–9: `name`/`occupancy`/`finishes`/`ifcData` destroyed, `undo()` restores nothing | **Cost: O(rooms lost this session) memory, O(tombstones × unmatched faces) point-in-polygon at match time — both ~0 in the normal case.** **Bounded by** a per-level cap and a session lifetime; ⛔ it must be **project-scoped** and torn down on project switch per [C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md)/ADR-0298 — the exact leak `OpenedRegionProposal.ts:376-398` already documents for its own maps |
| **RM-4** | **Every one of `§OPENED-REGION`'s six refusals must leave the user a NEXT STEP** — at minimum *"these two rooms are now one; do you want to re-draw the boundary?"* | §TOBE.2: six exits, all narration-only, all leaving a damaged model with no route forward | **Cost: zero compute** — the finding already exists and already reaches the chat. This is wording plus, where the user says yes, an ordinary tool activation |
| **RM-5** | **A room must be able to publish a reference other families can hold** (`room tag`, annotation, lighting, schedules) | [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md) ledger: `room tag ← wall`, `room tag ← room boundary`, `annotation ← room boundary`, `lighting ← room boundary` are all **SILENT** (§TOBE.3) | ⛔ **BLOCKED ON R-1.** Under Option A there is no stable id to publish. **Do not schedule this before the ruling** — it is the authored-but-unwired hazard [C72 §9.5](C72-PROPAGATION-AND-PREVSTATE.md) names |
| **RM-6** | **The room-side and wall-side loop-closure tolerances must be declared in ONE cited register**, so the combined competence envelope is stateable | §TOBE.4: two healers, two tolerance sets, no shared vocabulary | **Cost: zero runtime.** A [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) register entry per constant. ⏸ **Held pending the GRAPH43 seam agreement** |
| **RM-7** | **A gesture that publishes a per-junction verdict must also publish a per-gesture one**, or must not be read as a verdict on the gesture | §TOBE.5: `0 junction(s) refused` beside a lost 85.7 m² room | **Cost: zero** — both numbers already exist in the same gesture; this is one line that reports them together |
| **RM-8** | **`ReDetectRoomsCommand.undo()` must not return `success: true` for work it did not do** | `ReDetectRoomsCommand.ts:256-258` | **Cost: zero.** ⚠ The `nonUndoable` **geometry** decision at `:57-64` is **sound and is not reopened** (§10, R5 above). What is wrong is the **return value**, and separately the `detectionVersion` ratchet §9.3 already records |
| **RM-9** | **Delete must work on a room from the UI** — route both surfaces to the working `room.delete` verb | `DeleteElementCommand` `grep -c roomStore` → **0**, re-measured at `0589a36c`. §13 DELTA #2 | **Cost: zero.** ⛔ **Do NOT add a room branch to `DeleteElementCommand`** — [C84 EI-4a](C84-ELEMENT-INTEGRITY.md), one route per intent, and a better command already exists (§6.3) |

> ⭐ **Note what is NOT in this table.** No clause proposes a new detection pass, a new observer, a
> new store, a new event or a per-frame computation. **Eight of the nine cost zero or near-zero
> compute**, because the expensive machinery — detection, comparison, narration, consent — **already
> exists and already runs**. The gap in this family is not capability. It is that the capability
> does not carry identity through, and does not say so.

---

## §TOBE.7 — PERFORMANCE: THE BUDGET IS THE CONSTRAINT, NOT A CAVEAT

Room detection runs on **every** wall mutation. Any richer room model multiplies that, and this repo
has already shipped a re-weld that ran once per mousemove. So the budget is stated **before** the
capability, per [C10 §1](C10-PERFORMANCE-AND-OBSERVABILITY.md).

### §TOBE.7.1 — What runs today, measured from source

| Stage | Site | Complexity |
|---|---|---|
| Debounce per level | `RoomTopologyObserver.ts:39` `DEBOUNCE_MS = 150`; `:40` `CW_DEBOUNCE_MS = 800`; `:42` `MAX_DEBOUNCE_RESETS = 12` | ⚠ **the debounce INVERTS under load** — the observer's own header `:99-101` records that 12 resets exhaust the guard and force-fire |
| `_snapNearbyCorners` | `:1404-1405` — `for i` / `for j = i+1` over `n` endpoints | **O(S²)**, S = segments on the level (n = 2S) |
| `_reconnectDanglingEnds` | `:909-914`, `:937` | **O(S²)** |
| `_splitAtTJunctions` | `:1655`, `:1667` | **O(S²)** |
| `_diagRoomLoop` | `:610` | measured **~0.20 ms** at the founder's ~56 segments/level (§DIAG.6, node, 20-rep mean). ⚠ §DIAG.6 also records the **devtools stack-capture cost per `console.warn` is NOT measured** |
| `mergeWithExisting` | `:1073` | **O(D × E)** claim enumeration, D = detected faces, E = existing rooms |
| `scanForOpenedRegions` | `RoomTopologyObserver.ts:1101` | containment tests **O(B × A)** (before × after rooms) + perimeter sampling × surviving walls, **per lost room** |

⇒ **A re-detect is pairwise-quadratic in segments per level, and it runs once per 150 ms of wall
edit activity.** At the founder's measured ~56 segments/level that is ~3 000 pair tests — trivial.
**At a real 500-segment floor plate it is ~250 000 per re-detect, and at 2 000 segments ~4 000 000.**

> ⛔ **NOT MEASURED, and it is the most important unmeasured number in this family:** the wall-clock
> cost of one `detectRoomsForLevel` at 500 and at 2 000 segments, in the browser. §DIAG.6 measured
> only the audit, in node. ⛔ **No capability in §TOBE.6 may be justified by "detection is cheap"
> until that curve exists.** [C10 §1.1](C10-PERFORMANCE-AND-OBSERVABILITY.md) governs how it is taken.

### §TOBE.7.2 — The budget discipline, normative

1. **A room capability MUST NOT add a pass.** Every §TOBE.6 clause rides inside a loop that already
   runs (RM-0 inside the drop loop; RM-3 inside the same; RM-2/RM-4/RM-7 are strings). ⛔ **A clause
   that needs its own traversal of the level is out of budget and must be refused or redesigned.**
2. **Per-gesture, not per-frame.** Everything here hangs off the existing debounced re-detect
   chokepoint. ⛔ **Nothing in this family may subscribe to the frame bus.**
3. **Cost is declared with the capability or the capability is not admitted** — the four columns of
   §TOBE.6, no exceptions.
4. **Log volume is a performance budget too.** [C10 §7](C10-PERFORMANCE-AND-OBSERVABILITY.md)
   log-gating applies to RM-0; a 7-level load must not print per-room lines. `ProjectLoader.ts:2807`
   already records this exact churn as a defect.
5. ⭐ **The instrument must be measured before it is trusted** — §DIAG.6's honesty about the
   unmeasured `console.warn` cost is the standard, not an exception to it.
6. **Under Option B (R-1), the reconciliation pass is a NEW pass** and therefore violates rule 1 on
   its face. ⛔ **If the founder rules for Option B, the reconciliation must be shown to fit inside
   the existing re-detect, or the ruling must knowingly buy a new pass.** That trade must be put to
   him explicitly; it must not be discovered afterwards.

---

## §TOBE.8 — ⛔ UNDECIDED — THE FOUNDER'S RULINGS

⛔ **This lane does not decide these and has not pre-empted them. No RM clause blocked on a ruling
may be implemented before it.**

### R-1 — Does a room have identity that survives its walls changing, or is it a pure derivation?

Costed in full at **§TOBE.1.3** (Option A / Option B / Option A + tombstone). **Blocks RM-5**, blocks
any room-keyed schedule, IFC identity or sheet reference, and determines whether §TOBE.7.2 rule 1 is
being knowingly bought out. **RM-3 (tombstone) is compatible with either ruling and does not
pre-empt it.**

### R-2 — What should happen when a boundary is lost and NO existing wall can be extended to close it?

The `anchored 2/2` case in the founder's log took the CREATE rung because — on the evidence
available — no collinear donor existed (§TOBE.1.1). **Three answers, none obviously right:**

| Answer | For | Against |
|---|---|---|
| **(a) Mint the wall** (today, when EXTEND is unavailable) | The room comes back; one undo; the coordinates are the room's own, not invented | ⛔ The user gets an element **he did not author**, which is the founder's own objection generalised |
| **(b) Refuse and ASK** — *"this region lost 3.42 m of boundary and no existing wall can reach it; draw one?"* then activate the wall tool pre-seeded | ⭐ Matches the founder's standing **"always ASK, never auto-edit"** and [C83](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md)'s INADVISABLE band | The room stays merged until the user acts; a schedule taken in between is wrong |
| **(c) Leave them merged and say so** — record the merge as a first-class event, offer nothing | Cheapest; never authors geometry; strictly honest | The model is silently *different* from what the user drew, and (with RM-0 absent today) unrecorded |

⚠ **These are not mutually exclusive** — (c) + (b) is a coherent product, and RM-0 is a precondition
for all three. **The founder decides.**

### R-3 — Should the identity tie-break at `RoomDetectionEngine.ts:1122-1126` be allowed to run at all?

When two before-rooms merge, exactly one keeps its record and the winner is chosen by **centroid
distance**, a quantity with no semantic meaning (§TOBE.1.2). **The alternative is to refuse: award
the record to NEITHER, tombstone both, and ask.** That is more honest and strictly more disruptive.
⚠ **This is a smaller question than R-1 but it is not implied by it** — either ruling on R-1 leaves
R-3 open.

---

## §TOBE.9 — CORRECTIONS TO THE AS-IS ABOVE (dated, not edited away)

⛔ Per [C84 §0](C84-ELEMENT-INTEGRITY.md) the AS-IS text is the record and is not rewritten. These
are the pointers that have rotted since the 2026-08-18 stamp, re-measured at **`0589a36c`,
2026-08-24**.

| AS-IS clause | What it says | Measured 2026-08-24 |
|---|---|---|
| **§9.2** | the matcher is at `RoomDetectionEngine.ts:914-948`, the carry at `:957-973` | ⚠ **STALE — the file has grown to 1806 lines.** `mergeWithExisting` is at **`:1073`**; the claim loop at **`:1092-1131`**; the carry block at **`:1137-1160`**, with `id: match.id` at **`:1139`**. ⭐ The **constants are unchanged and still resolve**: `CENTROID_MATCH_RADIUS = 2.0` `:127`, `STRUCTURAL_MATCH_MIN_OVERLAP = 0.34` `:146`. **The finding is intact; only the pointers moved** |
| **§6.2, bullet 2** | *"`BimService.ts:172` executes, `:173` `unselectAll()` regardless, return value discarded"* | ⛔ **CLOSED 2026-08-24 by `0589a36c`** (§DELETE-MUST-ANSWER, L-1403). `BimService.deleteSelected()` (`:223`) now reads the result, refuses **by name to console AND toast**, and ⭐ **keeps the selection on refusal** |
| **§6.2, bullet 1** | *"`DeleteElement.ts:63` returns `{forward:[],inverse:[]}` UNCONDITIONALLY — a returned failure is invisible"* | ⛔ **CLOSED.** `plugins/view/src/handlers/DeleteElement.ts:139-155` converts an explicit `success: false` into a `capabilityRefused` |
| **§6 heading** | *"BOTH UI PATHS FAIL, AND BOTH SWALLOW THE FAILURE"* | ⚠ **HALF STALE, and the surviving half is sharper.** **Neither path swallows any more.** But `DeleteElementCommand` still has **`grep -c roomStore` → 0** (re-measured), so a room delete is now a **LOUD REFUSAL** rather than a silent no-op. **The user still cannot delete a room.** §13 DELTA #2 stands; **DELTA #3 is banked** |
| **§14 R8** | *"Delete does nothing on a room — NOT A REFUSAL, a silent failure"* | ⚠ **It is now a refusal, and a named one.** Upgrade from ⛔ to ⚠: the honesty defect is closed, the capability gap is not |

> ⭐ **Two of these five were corrections to prose this lane was briefed with as fact.** Both were
> refuted by re-reading HEAD rather than by argument. That is the standing instruction working:
> **re-measure, never re-transcribe.**

---

## §TOBE.10 — NOT MEASURED (this section only; §15 above is unchanged)

1. ⛔ **Wall-clock cost of `detectRoomsForLevel` at 500 and 2 000 segments, in the browser.** The
   most important unmeasured number here (§TOBE.7.1). §DIAG.6 measured the audit only, in node.
2. ⛔ **The build SHA of the founder's `Done — an interior wall now closes Room 00-004` session.**
   Without it, whether that CREATE preceded §WD32-EXTEND-BEFORE-CREATE or correctly had no donor is
   **undetermined** (§TOBE.1.1). ⭐ It is answerable in one question and worth asking.
3. **Which half wins the §TOBE.1.2 step-8 tie-break in the founder's geometry.** The mechanism is
   measured; the outcome depends on his coordinates.
4. **Whether any downstream consumer actually keys on a room id today** — `ScheduleExtractor`,
   `RoomReader`/`space.ts` IFC identity, sheet references. **This sizes R-1 and was not traced.**
5. **Whether `roomSpatialIndex` is correctly restored after an UPDATE-class undo** — §15 item 7,
   still open, and now load-bearing for RM-3.
6. **The frequency of room loss in real use.** ⛔ Unknowable until RM-0 ships. **This is the whole
   argument for instrument-before-cure.**
7. **`RoomGraphService` node/edge loss** — the founder's `5 nodes, 5 door edges` → `4 nodes, 3 door
   edges` (`packages/spatial-index/src/RoomGraphService.ts:345`). The log line is measured; **whether
   the graph rebuild is correct or is losing edges it should keep was NOT traced by this lane.**
8. **The wall/room seam** — §TOBE.4, deliberately reserved pending cross-lane agreement with C85.

---

# §TOBE-PLAN — THE ORDERED IMPLEMENTATION PLAN FOR §TOBE-ROOM

> **Added 2026-08-24 by lane ROOM44 (Stage 2 of 3).** Derived from §TOBE-ROOM and from nothing else:
> **every item below traces to an RM clause in [§TOBE.6](#tobe6--the-normative-clauses) or a ruling
> in [§TOBE.8](#tobe8---undecided--the-founders-rulings).** An item with no clause behind it does not
> belong here.
>
> **Why this lives in C94 and not in a SPEC.** Every item is the execution of a clause stated forty
> lines above it; a SPEC would be a **second copy of the same ordering**, and this contract has
> already recorded three independent counts of one family's verbs disagreeing (§0.1). CLAUDE.md's
> conflict order also puts contracts **above** SPECs, so splitting a binding clause from its plan
> across two tiers would let the weaker document drift. ⛔ **If this plan and §TOBE.6 disagree,
> §TOBE.6 wins and this plan is stale — which is a defect, not a discrepancy to live with.**
>
> **Ordering principle: MEASURE → TELL THE TRUTH → RECOVER → then, and only then, RESTRUCTURE.**
> ⭐ *Ship the instrument before the cure.* Nothing in Wave 0 changes behaviour; nothing in Wave 1
> needs a ruling; nothing in Wave 2 may start before its gate opens.
>
> **Every item carries a test that FAILS ON TODAY'S HEAD and asserts a MEASURED QUANTITY** — a room
> count, an m², a gap in mm, a field's presence — never a `success: true`.
> ([C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md); the *committed-≠-reachable* rule.)

---

## §PLAN.0 — WAVE 0: MEASURE. No behaviour change, no ruling, ships immediately.

⭐ **The whole justification for this wave: §TOBE.10 item 6 — *"the frequency of room loss in real
use is unknowable until RM-0 ships"*. We are otherwise about to design against an anecdote.**

### P0.1 — `RM-0` · The room-loss census

| | |
|---|---|
| **What changes** | At `packages/command-registry/src/rooms/ReDetectRoomsCommand.ts:105-112`, before `roomStore.remove(r.id)`, emit one structured record per dropped room: `id`, `name`, `roomNumber`, `computed.area`, `occupancyType`, **whether it carried any authored field at all**, and the cause. Nothing else changes; the drop still happens |
| **Files** | `ReDetectRoomsCommand.ts` only (⚠ owned by no other live lane) |
| **Cost at N** | **O(rooms dropped per re-detect), typically 0.** One object + one gated line inside a loop that already runs. **Adds no pass** (§TOBE.7.2 rule 1) |
| **Log discipline** | ⛔ Gated per [C10 §7](C10-PERFORMANCE-AND-OBSERVABILITY.md). `ProjectLoader.ts:2807` already records per-room churn on a 7-level load as a defect — this must not re-mint it. Suppressed while `__pryzmLoadActive()`, exactly as `BimKernel.ts:331` already does |
| **Unblocks** | §TOBE.10 item 6; sizes **R-1**, **R-2** and **R-3** with real numbers instead of one session |
| **Test (RED on HEAD)** | `roomLossIsCounted.spec.ts` — build a 2-room level, delete the shared partition, run the re-detect, assert **exactly one** loss record naming the dropped room's **id and area in m²**. RED today because no emitter exists |
| **Risk** | ⭐ **Lowest in the plan.** Additive, inside an existing loop, no return value changes |

### P0.2 — `§TOBE.7` · The detection cost curve

| | |
|---|---|
| **What changes** | A bench that runs `detectRoomsForLevel` at **56 / 250 / 500 / 1000 / 2000** segments on one level and reports the wall-clock curve, alongside the pass breakdown (`_snapNearbyCorners`, `_reconnectDanglingEnds`, `_splitAtTJunctions`, `buildWallGraph`, face walk) |
| **Files** | a new bench beside `apps/bench/src/benches/*.bench.ts`; pattern already in-family at `packages/room-topology/src/__tests__/diagRoomLoopCost.test.ts` |
| **Cost at N** | none — it is the measurement |
| **Unblocks** | ⛔ **Every cost claim in §TOBE.7.** Until it exists, *"detection is cheap"* is inadmissible, and **rule 6 of §TOBE.7.2 cannot be put to the founder honestly** — we cannot tell him what Option B's reconciliation pass would cost on top of a curve we have not drawn |
| **Test (RED on HEAD)** | The bench IS the artefact. Its committed assertion is the shape, not the constant: **the curve is quadratic in segments** (the ratio between 500 and 1000 exceeds 3×), asserted so a future linearisation is visible |
| **Risk** | ⭐ None to production — bench-only. ⚠ Its numbers are **node**, not browser; it must say so in its own header, as §DIAG.6 does |
| **Honesty** | ⚠ §DIAG.6 already records that the **devtools stack-capture cost per `console.warn` is NOT measured**. This bench does not measure it either and must not be read as though it does |

---

## §PLAN.1 — WAVE 1: TELL THE TRUTH, THEN RECOVER. No ruling needed. Each item ships alone.

### P1.1 — `RM-2` · ⭐ The confirmation must not name a record it did not restore

| | |
|---|---|
| **Why first in this wave** | **Cheapest change in the plan and the most user-visible.** It is the sentence the founder reads at the end of a successful recovery, and it is false (§TOBE.1.2) |
| **What changes** | `apps/editor/src/ui/ai/OpenedRegionProposal.ts:328-331`. The success line stops asserting that *"Room 00-004"* is closed and instead states what is true: the region is closed, it comes back as a **new** room, and **its name, number and occupancy were not carried over** |
| **Files** | `OpenedRegionProposal.ts` only |
| **Cost at N** | **Zero.** One string, plus at most one `roomStore` read to name the region as it is now |
| **Depends on** | nothing. ⭐ It is **upgraded** by P1.3 (once a tombstone exists the same sentence can *offer* the old identity back) but it must not wait for it — an honest sentence now beats a better one later |
| **Test (RED on HEAD)** | `recoveryMessageDoesNotNameALostRoom.spec.ts` — drive a merge that drops a **named** room, accept the offer, assert the success string **does not contain the dropped room's name** while `roomStore.getById(droppedId)` is `undefined`. RED today: the string is built from `finding.roomName` |
| **Risk** | ⚠ **Do not over-correct into alarm.** *"SILENCE IS A FEATURE"* (§TOBE.0.1) — the sentence must stay one calm line. This is wording, and wording is the deliverable |

### P1.2 — `RM-4` · Every refusal leaves the user a next step

| | |
|---|---|
| **What changes** | Each of the six `position-unknown` reasons (§TOBE.2) gains a **next step**, not a new guess: *"these two rooms are now one — re-draw the boundary?"*, and on yes, activate the wall tool pre-seeded at the region's own former coordinates |
| **Files** | `packages/room-topology/src/OpenedRegionDetector.ts` (reason text only) · `apps/editor/src/ui/ai/OpenedRegionProposal.ts` (the offer) |
| **Cost at N** | **Zero compute.** The finding already exists and already reaches the chat |
| **⛔ Constraint** | **This must not weaken a single refusal.** [C72 §9.3](C72-PROPAGATION-AND-PREVSTATE.md): *reducing a cell to REFUSES is a legitimate fix* — the six refusals are correct and stay. What is added is a route forward **after** the refusal, never a replacement for it |
| **Test (RED on HEAD)** | `everyOpenedRegionRefusalOffersANextStep.spec.ts` — table-driven over **all six** reasons; each must yield a non-empty next-step. Table-driven on purpose: a **seventh** reason added later fails the test rather than slipping through silently ([C84 EI-1b](C84-ELEMENT-INTEGRITY.md), a blank reads as fine) |
| **Risk** | ⚠ Touches the chat surface. Must go through `chatPromptHost` (§PROMPT-REACHES-A-HUMAN), never a `console` line |

### P1.3 — `RM-3` · The tombstone: make the LOSS durable, not the room

| | |
|---|---|
| **What changes** | A level-scoped register capturing the full `RoomData` at `ReDetectRoomsCommand.ts:105-112` before removal. When a later re-detection produces an **unmatched** face whose centroid falls inside a tombstoned polygon, **OFFER** its former name / number / occupancy / finishes |
| **⛔ OFFER, never auto-apply** | The founder's standing *"always ASK, never auto-edit"*. ⚠ Auto-applying would mint a second authority for *"what is this room called?"* — the precise argument [§L-1032](#l-1032--the-storey-axis-change-level-and-duplicate-to-level) uses to refuse a level dropdown, and it would apply here with equal force |
| **Files** | `ReDetectRoomsCommand.ts` (capture) · a new module in `packages/room-topology` (register) · `OpenedRegionProposal.ts` or a sibling (offer) |
| **Cost at N** | **Memory O(rooms lost this session)**; **match cost O(tombstones × unmatched faces)** point-in-polygon — both ~0 in the normal case, because both factors are normally 0. **Bounded by** a per-level cap on tombstones |
| **⛔ Project scope** | Must register with `projectScopeRegistry` and tear down on project switch ([C13](C13-PROJECT-LIFECYCLE-AND-ISOLATION.md) / ADR-0298). ⭐ **The exact leak is already documented next door**: `OpenedRegionProposal.ts:376-398` records how level-keyed state carried across a project switch silences a real question on an unrelated project's `lvl-0` |
| **Depends on** | **P0.1** — the capture point is the same line, and shipping the census first means the tombstone is added to a site that is already proven to fire |
| **Unblocks** | Upgrades P1.1's sentence from *"was not carried over"* to *"restore it?"* |
| **Test (RED on HEAD)** | `roomMeaningSurvivesAMergeAndBack.spec.ts` — name a room, set its occupancy, delete the partition (room lost), restore the partition, assert the offer carries **the same name and occupancy strings**, and assert **nothing was applied without consent**. RED today: the data is destroyed at `:107` |
| **Risk** | ⚠ **Medium — the only Wave-1 item that adds state.** Two named hazards: the C13 leak above, and a tombstone matching a face that is genuinely a *different* room. Mitigation: centroid-in-polygon **plus** a floor on area similarity, and it **offers**, so a wrong guess costs a declined prompt, not a corrupted model |
| **⚠ Relationship to R-1** | **Compatible with either ruling and does not pre-empt it** (§TOBE.1.3). ⛔ It does **not** buy back id stability and therefore does **not** unblock RM-5, schedules or IFC identities |

### P1.4 — `RM-9` · Delete must work on a room (§13 DELTA #2)

| | |
|---|---|
| **What changes** | Both UI surfaces route a room selection to the working **`room.delete`** verb, which is sound and restores four side-registrations (§1.2, §6.3) |
| **⛔ Constraint** | **Do NOT add a room branch to `DeleteElementCommand`.** [C84 EI-4a](C84-ELEMENT-INTEGRITY.md) — one route per user intent; adding a branch mints the second answer EI-9 forbids when a better command already exists |
| **Files** | `plugins/view/src/handlers/DeleteElement.ts` · `apps/editor/src/engine/BimService.ts` |
| **⚠ COLLISION** | ⛔ **Both files were changed hours ago by `0589a36c` (§DELETE-MUST-ANSWER, L-1403).** That lane closed the *swallow*; this item closes the *capability*. **Sequenced deliberately AFTER it, and last in Wave 1**, to avoid re-touching a file mid-flight. **Re-measure both files at HEAD before editing** |
| **Cost at N** | **Zero** — a routing decision on one selection |
| **Test (RED on HEAD)** | `roomDeleteReachesRoomDeleteVerb.spec.ts` — select a room, delete from **each** surface, assert `roomStore.getById(id)` is `undefined` **and** that one Ctrl+Z brings it back **with its name**. RED today: `DeleteElementCommand` greps `roomStore` → **0**, so the delete refuses |
| **Bonus, free** | ⭐ Room's delete verb already restores **more** than it removed (`DeleteRoomCommand.ts:79-96`), so the undo half of that test should pass the moment the routing lands |

### P1.5 — `RM-8` · `ReDetectRoomsCommand.undo()` must not claim success

| | |
|---|---|
| **What changes** | `ReDetectRoomsCommand.ts:256-258` stops returning `{ success: true }` for work it did not do |
| **⚠ HONEST SIZING — this is the LOWEST-VALUE item in the plan and is listed last for that reason** | The command is `nonUndoable` (`:65`), so the manager does not call `undo()` on it. **The change is very likely inert at runtime.** It is worth doing because a `success: true` for work not done is the shape [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) forbids and the next reader will take it at face value — **not** because it fixes an observed bug |
| **⛔ Do not conflate** | The `nonUndoable` **geometry** decision at `:57-64` is **sound and is not reopened** (§10, §14 R5). Only the return value is wrong — and separately the `detectionVersion` ratchet that §9.3 and §13 DELTA #5 already own |
| **Test (RED on HEAD)** | Assert the returned shape directly. ⚠ **The test must state in its own header that this path is not reached in production**, or it will be read as proof of a fix that changes nothing |

---

## §PLAN.2 — WAVE 2: GATED. ⛔ Do not start any item before its gate opens.

| # | Item | Clause | ⛔ GATE | Why it cannot start early |
|---|---|---|---|---|
| **P2.1** | **Publish a stable room reference** other families can hold (room tag anchor, annotation, lighting, schedules) | **RM-5** | ⛔ **R-1** | Under pure derivation **there is no stable id to publish**. Building the subscriber before the field exists is the authored-but-unwired hazard [C72 §9.5](C72-PROPAGATION-AND-PREVSTATE.md) names. ⭐ **This one item closes four SILENT ledger cells** (§TOBE.3) and is the strongest argument in the R-1 pack |
| **P2.2** | **The no-donor answer** — mint / ask-and-pre-seed / leave-merged-and-say-so | **R-2** | ⛔ **R-2** | Three coherent products; the founder's *"always ASK"* points at (b) but (c) is cheapest and strictly honest. ⚠ They are **not mutually exclusive** — (c)+(b) is a coherent answer. **P0.1's numbers should be in front of him when he rules** |
| **P2.3** | **Refuse the centroid tie-break** — award the record to neither half, tombstone both, ask | **R-3** | ⛔ **R-3** | More honest, strictly more disruptive. **Cheap to build once ruled** — it is a branch at `RoomDetectionEngine.ts:1122-1131` and it reuses P1.3's register wholesale |
| **P2.4** | **Consume the wall EXTENSION verb** so the CREATE rung is never reached when a wall could grow | **RM-1** | ⛔ **[C85 §10.7 W-M-12](C85-ELEMENT-WALL.md) / ADR-0336 stage 2** | ⭐ **The room side is ALREADY DONE** — `OpenedRegionDetector.ts:662-690` stands CREATE down and names the donor. What is missing is the verb to call. **C94 owes only the consumption, and C85 owes the capability** |
| **P2.5** | **One cited tolerance register** across the room-side and wall-side loop-closure constants | **RM-6** | ⛔ **the §TOBE.4 seam agreement with C85** | ⛔ C94 **asserts nothing about which wall-side number is correct** — that is C85's to judge. What C94 can state alone is that **nobody can currently state the combined competence envelope** |
| **P2.6** | **The per-gesture verdict** beside the per-junction one | **RM-7** | ⛔ **cross-lane** | ⚠ The emitter is `packages/geometry-wall/src/WallMoveReweldService.ts:860` — **another lane's file.** ROOM44 must not edit it. Either C85's lane lands it, or it lands after both settle |

---

## §PLAN.3 — WHAT SHIPS INDEPENDENTLY, AND WHAT THE CRITICAL PATH IS

**Independent — any order, any time, no gate:** P0.1 · P0.2 · P1.1 · P1.2 · P1.5.
**One real dependency inside the plan:** P1.3 depends on P0.1 (same capture site).
**One sequencing constraint, not a dependency:** P1.4 goes last in Wave 1 to avoid re-touching two files another lane changed today.

> ⭐ **THE CRITICAL PATH IS NOT CODE. IT IS `R-1`.** Six of the nine RM clauses are already
> implemented, or cost near-zero and need no ruling. **P2.1 — the one item that turns a room from a
> derived view into something other families can hold onto — is blocked on a single founder
> decision, and every week it is open is a week the four SILENT ledger cells stay silent.**
> **P0.1 exists to make sure that decision is taken against numbers rather than against one
> session's console.**

> ⚠ **AND `R-3` MUST NOT BE ALLOWED TO QUEUE BEHIND `R-1`.** They are different rulings about
> different risks, and **R-3's is the one a user cannot catch.** Losing a room's name is *visible* —
> the room comes back blank and the user sees it. **Misattribution is not**: a surviving name,
> occupancy and IFC identity landing on the WRONG half of a merge, decided by centroid distance
> (`RoomDetectionEngine.ts:1122-1131`), produces a model that reads as correct and exports as wrong.
> ⛔ **Neither R-1 ruling implies an answer to R-3**, and P2.3 is cheap once ruled — a branch at one
> site, reusing P1.3's register wholesale. **It should be put to the founder in the same pack, not
> after it.**

## §PLAN.4 — WHAT THIS PLAN DELIBERATELY DOES NOT PROPOSE

⛔ Recorded so a later reader does not mistake absence for oversight:

1. **No new detection pass, observer, store, event or per-frame computation.** §TOBE.7.2 rule 1.
2. **No weakening of any `§OPENED-REGION` refusal.** §TOBE.0.1 and [C72 §9.3](C72-PROPAGATION-AND-PREVSTATE.md).
3. **No room branch in `DeleteElementCommand`.** [C84 EI-4a](C84-ELEMENT-INTEGRITY.md).
4. **No reopening of `room.redetect`'s `nonUndoable` geometry decision.** §14 R5.
5. **No re-derivation of the [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md) ledger inside C94.** Read the gate.
6. **No second preservation mechanism** — §9.3's `preserveMetadata` exists and is unconsumed; §13 DELTA #5 owns it.
7. **No overturning of [§L-1032](#l-1032--the-storey-axis-change-level-and-duplicate-to-level).** A room's STOREY stays derived under either R-1 ruling; only its MEANING is in question.
8. **No edit to `C85`, `WallMoveReweld*`, `Slab*` or `WallPlanToolHandler`/`WallTool`** — other lanes are live in these files.

---

## §TOBE.11 — SHIPPED (living record, appended never rewritten) — lane ROOM44, 2026-08-24

⛔ **This section records what LANDED, so no reader takes an RM clause or a DELTA row above as
still-open when it is closed.** The clauses themselves are not edited — [C84 §0](C84-ELEMENT-INTEGRITY.md).

| Clause | SHA | What shipped | What it did NOT do |
|---|---|---|---|
| **RM-2** | `db165a09` | §WD32-B-DO-NOT-NAME-WHAT-WAS-NOT-RESTORED. The recovery no longer announces it closed *"Room 00-004"* when that record was deleted. **A BRANCH, not a deletion** — when the finding's room is the merge keeper (`RoomDetectionEngine.ts:1129-1131`) naming it is true, and one `getById` separates the cases. **Three-valued**: `undefined` (no store to ask) is NOT folded into "removed" | ⛔ **Does not promise the name back** — that is RM-3, unbuilt. A test arm pins the absence |
| **RM-0** | `308f81c1` | §ROOM-LOSS-CENSUS. Every room dropped at `ReDetectRoomsCommand.ts:105-112` is counted and named, **with `authored` as its own number**, printed even when zero. O(dropped), inside the loop that already runs, one line for N rooms, suppressed on load/generation but still carried on the result | ⛔ **Does not classify merged-vs-vanished** — `OpenedRegionDetector` owns that (EI-9) |
| **RM-9** | `66f60f5e` | §DELETE-ONE-ROUTE. **The user can delete a room**, from both surfaces, and one undo restores it with its authored name. The `elementType → command` mapping was written **twice** — a chain in `plugins/view` and a direct construction in `BimService` — with the room gap in both; it is now one `resolveDeleteCommand` | ⛔ **No room arm in `DeleteElementCommand`** (EI-4a). An arm pins that it still refuses a room, because that refusal is the reason the route exists |
| **§TOBE.4** | `1f785312` | The wall/room seam, settled with [C85 §10.8.5](C85-ELEMENT-WALL.md) | ⛔ RM-6/P2.5 (the shared tolerance register) stays **GATED** |

⇒ **§13 DELTA #2 is CLOSED** (`66f60f5e`); **DELTA #3 was closed by another lane** at `0589a36c`
(§TOBE.9). **§14 R8** — *"Delete does nothing on a room"* — is now **neither a silent failure nor a
refusal: it is a delete.**

> ⭐⭐ **THE FINDING WORTH CARRYING OUT OF THIS LANE, recorded because it nearly went the other way.**
> The census's first authorship predicate asked `Object.keys(room.finishes).length > 0`. Against the
> REAL `RoomStore` **every untouched room read as authored** — `RoomStore.ts:95-100` normalises the
> finishes record by writing all three surfaces explicitly, `undefined` and all, so `.length === 3`
> on a room nobody has opened. **Shipped, it would have reported 100% authored on every model and
> argued for persistent identity (R-1 Option B) on evidence that was never there** — corrupting the
> exact ruling it exists to inform, *confidently, with a number attached*.
> ⚠ **Twenty-three unit arms passed against hand-built fixtures, because the fixtures were built
> from the same wrong assumption.** Only driving the real store broke it. **A fake built from the
> same premise as the code cannot falsify the premise** — and it was hiding in the one field this
> module's own header had just cleared for `colour`.

### §TOBE.11.1 — ⭐⭐ **R-1 RULED 2026-08-24: DERIVATION + TOMBSTONE**

> **The founder took the third option** — the one §TOBE.1.3 recorded as *"a third shape exists and
> may be the answer"*, not either of the two the lane was asked to cost.
> **Keep derivation exactly as it is. Make the LOSS durable instead of the room. OFFER the former
> name / number / occupancy back — never re-apply it.**

| Clause | SHA | What shipped | What it did NOT do |
|---|---|---|---|
| **RM-3** *(register)* | `72ed4450` | `roomTombstoneRegister` — an authored room's meaning is captured as it dies at `ReDetectRoomsCommand.ts:105-112`, and matched back to the face that later closes over it (centroid-in-polygon **plus** an area-similarity floor). **Bounded at 32 per level, FIFO, session- AND project-scoped** — by *authored rooms lost on one level in one session*, never by N | ⛔ **NOT persistence.** A tombstone does not survive a reload and is never written to the project file — that would be a second store of room meaning, i.e. the identity the ruling declined |
| **RM-3** *(offer)* | `a53d4d64` | The chat Confirm — *"Kitchen (48.0 m²) was lost when its boundary changed, and this space is now a new room. Restore its name…?"* — and on Confirm **one** `room.restoreMeaning`, a new bus verb bridging to `UpdateRoomCommand`: **one command, one Ctrl+Z** | ⛔ **Writes meaning only** — no `id`, no geometry, an explicit key allowlist, and an empty patch is a typed refusal |

> ⛔ **WHAT THE RULING DID NOT GRANT, and it was chosen knowingly.** **No persistent room id.** Rooms
> remain a pure function of wall topology. **RM-5 stays blocked and the four
> [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md) SILENT cells stay silent.** A tombstone restores
> **MEANING, never IDENTITY** — the recovered room keeps a fresh `crypto.randomUUID()`, so a room tag
> or schedule row anchored to the lost room stays pointing at nothing.
> ⭐ **The offer says so, before the user answers** — the honesty condition the founder attached to
> the ruling, held in ONE string (`describeTombstoneLimits`) so it cannot drift across call sites.
> **This is the same discipline as `db165a09`, which refused to promise a name back before the
> mechanism existed. It exists now, so the promise is made — and bounded in the same breath.**

> ⭐ **R-3's mechanism is now BUILT AND WAITING.** `captureRoomTombstone` takes a `RoomData` and knows
> nothing about *why* it was dropped, so the P2.3 branch at `RoomDetectionEngine.ts:1122-1131` can
> call it for the losing half of a merge — or for **both** halves — with **no change** to the
> register. ⛔ **R-3 is still OPEN and is not answered by the R-1 ruling.**

### §TOBE.11.2 — ⭐⭐ **R-3 RULED 2026-08-24: A MERGE AWARDS THE RECORD TO NOBODY**

> **REFUSE TO AWARD. TOMBSTONE BOTH HALVES. OFFER.** Shipped as `aa77f672`
> (§MERGE-AWARDS-NOBODY, L-10815).

**The failure closed is SILENT MISATTRIBUTION, not loss.** §TOBE.1.2 measured it: when two
rooms merged, the survivor was chosen — after a near-identical `overlap` — by **centroid
distance**, and then carried one room's polygon under the **other** room's name, number,
occupancy and IFC identity. ⭐ **Losing a name is visible; a wrong name is not.** That is the
one a user can ship to a client without ever noticing.

| | |
|---|---|
| **The rule** | A detected face is **CONTESTED** when two or more distinct rooms claimed it **AND at least one claimant ended the assignment with no face of its own.** A contested face is awarded to nobody, every claimant is withheld from *all* award paths (including the centroid fallback), both are tombstoned, and the user is offered the choice |
| **The copy** | Says a **merge** happened, names both rooms, and states that **neither** was applied. ⭐ **"Neither" is ONE click** — a merged space often wants a new name rather than either old one |
| **⛔ Unchanged** | The **split** direction (one room, two faces) is untouched — PARTITION-FIX still awards. An ordinary **reshape** still keeps its identity. Still **no persistent identity**: the merged space is a new room with a new id |
| **Reuse** | ⭐ **No second capture path and no merge-specific record.** The dropped rooms flow through the same `captureRoomTombstone` (RM-3). Matching now returns a **list**, so ONE offer shape covers a single loss (1 candidate) and a merge (2) |
| **Ctrl+Z of the merge** | Checked, per the ruling's condition 5. Both halves return **unnamed**; the offer is put **once** across an undo/redo cycle; and the apply path **re-checks the target still exists**, so confirming a stale card says so instead of failing opaquely |

> ⚠⚠ **THE FIRST IMPLEMENTATION OF THIS RULE WAS WRONG, AND A PRE-EXISTING TEST CAUGHT IT.**
> Recorded because the reasoning error is more instructive than the fix. The first rule was
> *"a face claimed by two or more distinct rooms is contested"*, argued from
> `STRUCTURAL_MATCH_MIN_OVERLAP`'s own note that a mere neighbour never files a claim. **That
> note reasons about two rooms sharing ONE party wall out of 4+4 (≈0.14).** But two rooms
> formed by **partitioning one rectangle** share **three** walls — both long sides and the
> partition — so each scores **3/5 = 0.6** against the other's face and files an ordinary
> claim. Under the first rule, **moving a shared partition — a reshape where both rooms
> plainly survive — read as a merge and both rooms lost their names.**
> `roomIdentityByStructure.test.ts` PART 3 failed, and it was right to.
> ⭐ **The correction: competition alone is not a merge — a merge is competition where the
> LOSER HAS NOWHERE ELSE TO GO.** It also satisfies the ruling's *"impossible, not unlikely"*
> condition better than the first rule did, because no face with an orphaned claimant is ever
> awarded at all.
> ⛔ **The lesson is not "the threshold is subtle". It is that a constant's stated rationale
> was measured against one shape and reused against another.** The same class as the
> §TOBE.11 `finishes` refutation, and the third time in this lane that a real store or a real
> test overturned a confident argument.

⚠ **STILL OPEN AND UNCHANGED BY ANY OF THE ABOVE:** ~~R-1~~ **RULED — §TOBE.11.1** · ~~R-3~~
**RULED — §TOBE.11.2** · **R-2** (§TOBE.8) — ⭐ *and the tombstone changes that question: "leave
merged and say so" is far more defensible now that the meaning is recoverable* · ~~RM-3~~
**SHIPPED** · **RM-4** the next-step refusals · **RM-5** the stable room reference (blocked on
R-1, and blocking four [C72 §9.4](C72-PROPAGATION-AND-PREVSTATE.md) ledger cells) · **RM-6**/**RM-7**.
⛔ **Nothing shipped here restores the authored meaning of a lost room. The census MEASURES the
loss; it does not prevent it.**
