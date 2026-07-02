# ADR-0099 — Host-wall → opening reverse index kills the wall-move total freeze (§FIX-HOSTWALL-DOOR-INDEX / §FIX-HOSTWALL-MOVE-COALESCE)

> Implements ADR-0098 finding **F1** (wall-move-with-hosted-door freeze). Renumbered 0098→0099 to avoid a
> collision with the ADR-0098 element-lifecycle conformance audit.

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-02 |
| Owner | Hosted openings + wall rebuild (`packages/geometry-door`, `packages/geometry-window`, `apps/editor/src/engine/WallRebuildCoordinator.ts`) |
| Builds on | ADR-057 (openings-only fast path) · ADR-061 (§PERF-WALL-DRAG-DEFER) · C15 (hosted element contract) |
| Governs | The CRITICAL "move a wall that hosts a door → whole app freezes" hang |
| Tags | §FIX-HOSTWALL-DOOR-INDEX · §FIX-HOSTWALL-MOVE-COALESCE |
| Contracts | P2 (no THREE outside renderer-three — unchanged) · P3 (no new rAF — builds still drain on the frame scheduler) · P6 (mutations still via commands; only the store's own bookkeeping changed) · 8-layer import rule respected (stores stay L-low) |

## Context

The founder reported a hard, reproducible total-freeze in production: create a few walls + a few
doors, then MOVE a wall that HOSTS a door. The whole app freezes — main thread pegged, 3D view and
all buttons dead. The last thing logged before the hang is `EXECUTE: UPDATE_WALL_BASELINE`.

Root cause (confirmed by deep trace). A wall baseline move lands in
`WallRebuildCoordinator._flush()`, which runs a synchronous, non-yielding whole-level pass. After it
resolves the level joins and rebuilds the wall bodies, it re-anchors each rebuilt wall's hosted
children by calling `DoorBuilder.rebuildForWall(wallId)` and `WindowBuilder.rebuildForWall(wallId)`
— **once per rebuilt wall**. Both methods were implemented as an **UNBOUNDED full-project scan**:

```ts
rebuildForWall(wallId) {
  for (const door of doorStore.getAll())       // O(all doors in the project)
    if (door.wallId === wallId) this._enqueue(door);
}
```

`getByWallId()` on both stores had the same `[...values()].filter(...)` full scan.

So a single wall move cost **O(walls-rebuilt × all-openings-in-project)** — quadratic in a dense
model — executed synchronously with no main-thread yield. On a real project (dozens of walls on the
level, many doors/windows) that is the pegged frame the founder saw. The many neighbour walls that a
whole-level rebuild touches each paid a full N-length scan even though they host **zero** doors.

## Decision

### §FIX-HOSTWALL-DOOR-INDEX — reverse index (the single biggest, most-contained win)

`DoorStore` and `WindowStore` now maintain a reverse index `Map<hostWallId, Set<openingId>>`,
updated transactionally alongside the primary `Map<id, opening>` in the only four mutators —
`add`, `update` (re-homes the id if the host wall changes), `remove`, and `clear`. A new
`getIdsByWallId(wallId)` returns that bucket in **O(openings-on-that-wall)**, and the legacy
`getByWallId()` is re-implemented on top of it (same signature, same result, no longer O(all)).

`DoorBuilder.rebuildForWall` / `WindowBuilder.rebuildForWall` now iterate only that bucket. A wall
that hosts no openings does **zero** opening work instead of an N-length scan.

**Invariant (holds after every mutation):** for every opening `o`, `o.wallId ∈ index` and
`o.id ∈ index[o.wallId]`, and no stale id remains in any bucket (an opening appears under exactly
its current host wall). Empty buckets are pruned so `getIdsByWallId` of an unrelated wall returns
`[]` with no allocation of a dangling Set.

### §FIX-HOSTWALL-MOVE-COALESCE — one redetect per move (verified, not re-plumbed)

A wall move already coalesces to **one** `_flush` per gizmo drag: `_scheduleFlush` defers the heavy
whole-level flush while `window.__wallDragInProgress` is set (ADR-061), and the drag-end commit
clears the flag *before* dispatching the single `wall.updateBaseline`, so that commit's store
mutation takes the one immediate scheduled flush. `_flush` runs `WallJoinResolver.resolveLevel`
once per affected level and emits `bim-wall-mutation-committed` once — the signal that drives room
redetect + plan re-projection. The regression test pins that this commit barrier fires **exactly
once** per move and the moved host wall is re-anchored exactly once, so redetect/plan-reprojection
do not fan out per hosted child. No change to the edit contract was required; the storm was the
unbounded scan, now removed.

## Consequences

- The wall-move freeze is removed at its dominant cost centre with a contained, O(1)-amortised
  bookkeeping change in two stores. No behavioural/visual change: `getByWallId` returns the same
  records; `rebuildForWall` enqueues the same doors; the openings-only fast path (ADR-057), the
  body-only `_rebuildWallBodies` (D40/D61), §POST-RESOLVE-PRESERVE, and instanced walls are all
  untouched.
- The index adds one `Set` insert/delete per opening add/remove — negligible, and it makes every
  other `getByWallId` consumer (plan symbols, dependency trackers) O(bucket) too.
- Not addressed here (out of scope, follow-up if profiling still shows cost): making
  `WallJoinResolver.resolveLevel` incremental for a single moved wall, and moving the whole
  `_flush` off the main thread in slices. With the scan bounded, the per-move cost is now dominated
  by the single level resolve, which is acceptable for interactive edits.

## Testing

`apps/editor/__tests__/hostWallOpeningIndexFreeze.test.ts` (7 tests):
- index exactness + lock-step across add / remove / re-home / clear for both stores;
- a single-wall re-anchor visits only the K openings on that wall and never calls `getAll()`
  (trip-wire for any O(all) regression);
- a real `WallRebuildCoordinator` wall move emits `bim-wall-mutation-committed` exactly once and
  re-anchors the moved host wall exactly once.
