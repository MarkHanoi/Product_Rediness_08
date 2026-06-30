# ADR-0087 — Bulk room-finishes command (one mutation for N rooms)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Command registry (`@pryzm/command-registry` rooms) + residential-building executor |
| Supersedes | The per-room `UpdateRoomFinishesCommand` loop as the finish-authoring path on bulk generate |
| Contracts | C03 (commands are the only mutation path), C53/P8 (≥1 span / exported fn), §E.1 CRDT-blackout |

## Context

Founder (perf report): a **residential-building generate** froze for **~16–19 s** right after
layout. The console showed:

```
[resi-building] §RESI-WALL-CEILING-FINISH — authored finishes on 250 room(s)
… 250+ separate [CommandManager] EXECUTE: UPDATE_ROOM_FINISHES …
[StoreEventBus] endBatchYielded() — all 2883 event(s) delivered across 15 chunk(s)
[Collaboration] §E1-CRDT-BLACKOUT batchId=… duration=19047ms elements=160
```

**Root cause.** `ResidentialBuildingExecutor._scheduleRoomFinishes` wrapped the loop in ONE
`batchCoordinator.runBatch`, but inside fired **one `cm.execute(new UpdateRoomFinishesCommand(...))`
per room** (~250 commands). Each command runs the full CommandManager path — `canExecute`, undo-stack
push, sync/redetect trigger, telemetry — and each `roomStore.update` emits ~11 store events
(observer + DOM + StoreEventBus, ×detection/sync fan-out). 11 × 250 ≈ **2883 events**, which the §E.1
`YjsDocAdapter` measures as a single ~19 s drain → the "blackout".

## Decision

Add a **bulk command** `UpdateRoomFinishesBulkCommand` in `packages/command-registry/src/rooms/`
that takes an array of `{ roomId, finishes }` (`RoomFinishPatch[]`) and applies ALL patches in a
**single `execute`**: one mutation pass over `roomStore.update`, one captured snapshot per mutated
room, **one undo entry** that restores every room together (in reverse order). It mirrors
`UpdateRoomFinishesCommand` exactly — same patch shape (`{ finishes }`), same snapshot-based
undo semantics — and is **best-effort** (a vanished room is skipped, mirroring the pipeline's
per-room skip; a mid-pass throw rolls back what already applied).

`_scheduleRoomFinishes` now builds the patch array and dispatches the bulk command **ONCE** inside
the existing `runBatch`. The CommandManager-level multiplier (undo push / sync / redetect / telemetry)
collapses from N to 1; the room-store events still fire per room but inside one batch.

New `CommandType.UPDATE_ROOM_FINISHES_BULK` enum value + `PlanOrdering` priority (51, same band as
`UPDATE_ROOM_FINISHES`) + barrel exports.

## Consequences

- The 250-room finish authoring drops from ~250 commands / ~2883-event / ~19 s blackout to **one
  command** — sub-second. No CRDT blackout on generate.
- Undo of the whole finish pass is a single user action (matching `BatchCreateRoomsCommand`).
- No persistence/replay change: finishes live in the room-store snapshot, which `ProjectLoader`
  deserializes directly (the command is not replayed by type on load).
- P8: the command is a class mirroring the existing `UpdateRoomFinishesCommand` (no new exported
  *function*); no new span required, consistent with all sibling room commands.

## Scope

Only `ResidentialBuildingExecutor._scheduleRoomFinishes` is rewired. The
`apartmentLayout` / `houseLayout` executors and `RoomAIAssistant` were intentionally left untouched
(coordination boundary); they may adopt the bulk command in a follow-up.
