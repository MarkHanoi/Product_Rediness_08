# SPEC — Ceiling Layout Engine (D-CE) v1.0

**Status.** Live (shipped 2026-05-29, commit `ae9bf4e`).

**Governed by.** C09 §3.4 / §3.4.1 (auto-pipeline chain). Sibling of `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` (D-TGL) and `SPEC-FURNITURE-LAYOUT-ENGINE.md` (D-FLE).

**Owner.** `packages/ai-host/src/workflows/ceilingLayout/`. Editor trigger in `apps/editor/src/ui/ceiling-layout/`.

## §1 — Purpose

For every ceilable room on the active level, place exactly one ceiling slab on its polygon at the per-occupancy ceiling height. Pure + deterministic; no THREE / DOM / RNG (L2 doctrine per C09 §2.4).

## §2 — Inputs

- The set of detected rooms on the active level (from `RoomDetectionEngine`).
- Per-room `occupancyType` (set by `SET_ROOM_OCCUPANCY`).
- The per-room polygon + centroid.
- The level's floor-to-ceiling height from `LevelStore` (defaults: 2.4 m residential, 2.7 m commercial).

## §3 — Output

A `CeilingCommandSet` projected to `ceiling.create` commands. Pre-minted ids (no read-back).

```ts
interface CeilingCommandSet {
    readonly levelId: string;
    readonly commands: readonly CeilingCommand[];
    readonly ids: readonly string[];
    readonly totalElementCount: number;
    readonly warnings: readonly string[];
}
```

## §4 — Archetypes

| Occupancy | Archetype | Default |
|---|---|---|
| `living-room`, `dining-room`, `bedroom`, `entrance-lobby`, `study`, `corridor` | plasterboard suspended slab | 2.4 m |
| `kitchen` | plasterboard with greater height (for extractor + uplighting) | 2.5 m |
| `bathroom`, `wc` | moisture-resistant plasterboard | 2.4 m |
| `utility-room` | plasterboard | 2.4 m |
| (any other) | not ceiled (e.g. atrium, mezzanine) | — |

The archetype lookup MUST be a pure function of `occupancyType`. Adding a new occupancy MUST require an archetype entry; no silent fallthrough.

## §5 — Execution order

1. **Read** the active level + all detected rooms.
2. **Filter** to rooms with a ceilable archetype.
3. **Build** one `CeilingCommand` per filtered room (id pre-minted via `createId('ceiling')`; polygon from the detected room; height from the archetype + level metadata).
4. **Dispatch** the set through `batchCoordinator.runBatch({ levelIds: [activeLevel], totalElementCount, skipRedetectRooms: true })` — ceilings don't bound rooms, so `skipRedetectRooms: true`.
5. **Emit** `ceiling.layout-executed` on `runtime.events` with `{ placedCount, roomCount, levelId }`.

## §6 — Trigger semantics (`apps/editor/src/ui/ceiling-layout/`)

### §6.1 — Console command

`window.pryzmCeilAllRooms()` MUST manually invoke the trigger for a one-off test, regardless of pipeline state. Listed in `pryzmShowApartmentHelp()`.

### §6.2 — Auto-fire

The trigger MUST subscribe to `apartment.layout-executed` and defer the next-tick dispatch of `ceiling.layout-execute` (so the `REDETECT_ROOMS` cascade triggered by the apartment build settles first). The chain reads: `apartment.layout-executed → ceiling.layout-execute → ceiling.layout-executed → furnish.layout-execute → …`.

### §6.3 — §CHAIN-TIMEOUT

The furnish trigger arms a 12 s fallback on `ceiling.layout-executed`. If D-CE throws / never emits, the fallback fires furniture anyway with `console.warn('§CHAIN-TIMEOUT — no ceiling.layout-executed within 12 s — firing furnish anyway.')`. D-CE itself MUST emit `ceiling.layout-executed` on **both** success AND empty-placement paths to keep the chain ticking.

## §7 — Toasts

- `Ceiling rooms…` — `info` on dispatch.
- `Ceiled X/Y rooms — N slabs placed.` — `success` on completion.
- `No rooms detected — build walls first.` — `warn` on empty room set.
- `No ceilings placed — no rooms match a ceiling archetype.` — `warn` on filtered-out result.
- `Ceiling auto-place failed — see console.` — `error` on runBatch throw.

## §8 — Invariants

- **L2-pure.** No THREE / DOM / RNG in the pure engine.
- **One-undo.** All emitted commands sit inside one `batchCoordinator.runBatch`.
- **Idempotent under chain re-fire.** A duplicate `apartment.layout-executed` MUST NOT double-emit. The `runBatch` is itself idempotent; the trigger has no extra guard required because the engine reads detected rooms (which don't change between back-to-back fires).
- **Skip ceiled rooms on re-run.** If a room already hosts a ceiling (matched via `hostRoomId`), the engine MUST skip it — same pattern as `CreateFloorsByRoomTypeCommand` (C17 #34).
- **P8 spans at the plane boundary**, not in the pure engine.

## §9 — Files

- `packages/ai-host/src/workflows/ceilingLayout/types.ts`
- `packages/ai-host/src/workflows/ceilingLayout/archetypes.ts`
- `packages/ai-host/src/workflows/ceilingLayout/buildCeilingCommands.ts`
- `apps/editor/src/ui/ceiling-layout/ceilingLayoutTrigger.ts`
- `apps/editor/src/ui/ceiling-layout/CeilingLayoutExecutor.ts`

## §10 — Tests

ai-host: archetype-mapping, polygon plumbing, deterministic id stub, empty-set behaviour. Editor: typecheck only (executor is DOM glue).

## §11 — Linked

- C09 §3.4 / §3.4.1 — auto-pipeline chain.
- C17 #34 — sibling `CreateFloorsByRoomTypeCommand` (floor-finish path).
- SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE — sibling engine producing the rooms ceilings sit in.
- SPEC-FURNITURE-LAYOUT-ENGINE — successor in the chain.
