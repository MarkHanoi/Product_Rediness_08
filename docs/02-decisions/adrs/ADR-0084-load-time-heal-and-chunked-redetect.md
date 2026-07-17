# ADR-0084 — Load-time degenerate-polygon heal + frame-chunked post-load room redetect

- Status: Accepted
- Date: 2026-06-30
- Tags: §LOAD-HEAL-DEGENERATE-POLYGON, §LOAD-REDETECT-CHUNKED, project-open, performance, WebGL
- Supersedes / relates to: ADR-0260 (§LOAD-CHUNKED — chunked element BUILD + diag-flood gating),
  §LOAD-REDETECT-FREEZE (skip redetect for levels with persisted rooms),
  §WALL-JOIN-LOAD-SKIP / §RESOLVED-STUB-SWEEP / §WJR-INVALID (wall self-heal on open),
  §RESI-CEILING-DEGENERATE-GUARD-2 (generation-time degenerate-ceiling drop)

## Context

Opening an EXISTING heavy saved project ("resi" — 793 elements, 7 levels, 192 walls,
127 doors, 87 windows) generated BEFORE the WallJoinResolver collinearity /
`_clampEndToShellInnerFace` fix exhibited two project-open defects that a fresh
generation does not:

**A) "120 elements failed — see console" persists on every open.**
The collinearity guard fixed NEW generations, but the saved snapshot already contains
collapsed sub-0.05 m wall baselines from the old bug. Those degenerate walls left room
perimeters unsealed at SAVE time, so the persisted ROOM / FLOOR / CEILING polygons were
written as zero-area or fewer-than-3-distinct-vertex rings. On every OPEN those records
fail the downstream `validatePolygon` / `validateCeilingBoundary` ("≥3 vertices") guard
— one failure per record — which is exactly the founder's banner. It can never self-heal
because the broken data is baked into the snapshot. (The WALLS themselves already heal on
open: the post-load WallJoinResolver restore flush flags the collapsed baselines `invalid`
via §RESOLVED-STUB-SWEEP / §WJR-INVALID, so the mesh builder skips them. What remained was
the persisted polygon records.)

**B) 3D view FREEZES while opening (WebGL fallback backend).**
§LOAD-CHUNKED (ADR-0260) chunks the element BUILD across frames, but NOT the post-load
per-level `REDETECT_ROOMS` sweep. That sweep ran as one synchronous `for`-loop: each
`rooms.redetect` dispatch lands (via the CustomEvent bridge) on a synchronous
`commandManager.execute(ReDetectRoomsCommand)` whose `RoomDetectionEngine.detectRoomsForLevel()`
graph-walk + the room-store churn it drives (→ `bim-room-updated` → `SpatialTree.refreshTree`
+ `RuleEngine` re-validation, per level) all run on the SAME task. For a 7-level building
that is a multi-hundred-ms synchronous block that freezes the WebGL viewport right as the
scene appears (the founder runs forced WebGL).

## Decision

**A — §LOAD-HEAL-DEGENERATE-POLYGON.** Add a pure, exported, unit-testable decision pair
in `packages/command-registry/src/project/projectLoaderUtils.ts`:

- `isDegeneratePolygon(polygon, epsilon?, minArea?)` — true when a ring is missing, has
  < 3 vertices, < 3 DISTINCT vertices (after collapsing near-coincident points), a
  non-finite coordinate, or effectively zero signed area (collinear / sliver). Mirrors the
  generation-time §RESI-CEILING-DEGENERATE-GUARD-2 test so a record dropped at SAVE for new
  projects is dropped at LOAD for already-saved ones.
- `dropDegeneratePolygonRecords(records, getPolygon)` — partition snapshot records into
  `{ kept, dropped }`. Records with NO polygon are KEPT (defaulted downstream); only records
  that HAVE a polygon AND it is degenerate are dropped.

Both the `ImportProjectCommand` fast path (default-on) and the legacy per-command path in
`ProjectLoader` filter ceilings, floor finishes, and rooms through this BEFORE dispatch, so
the degenerate records neither fail nor inflate the failure count. Levels whose ROOM polygon
was dropped are recorded (`ImportProjectStats.healedRoomLevelIds`) and removed from the
§LOAD-REDETECT-FREEZE skip-set so the post-load sweep re-seals them from the now
join-resolved walls. One concise per-class load-warn replaces N per-record failures.

**B — §LOAD-REDETECT-CHUNKED.** Drive the post-load per-level redetect sweep through the
P3-owned `FrameScheduler` (`@pryzm/frame-scheduler`, no new rAF) ONE LEVEL PER FRAME via a
recursive `scheduleOnce('project-load-redetect', drainNext, 'post-render')` drain. The
browser paints between levels, so the viewport stays live and the scene builds progressively
instead of freezing. Fire-and-forget, exactly like the old loop (`load()` never awaited these
dispatches). Gated by the existing `_useChunkedLoad()` flag (default ON; runtime kill-switch
`globalThis.__pryzmChunkedLoad === false` routes back to the synchronous one-task sweep for
parity debugging).

## Consequences

- Old broken projects HEAL on open: the banner clears (degenerate floor/ceiling/room records
  are dropped rather than counted as failures), and the dropped rooms re-seal via the
  post-load redetect on their level.
- Opening a 793-element / 7-level project paints progressively on WebGL instead of freezing;
  the heavy detect + SpatialTree/RuleEngine refresh for each level lands on its own frame.
- No semantic-model change: valid records load byte-identically; only degenerate records that
  would have failed anyway are dropped; redetect cadence — not its result — changes.
- `redetect_sweep` phase timing now measures only the (near-zero) SCHEDULING cost; the actual
  detection is intentionally spread across subsequent frames after `load()` returns.
- The heal predicate is pure (no THREE / DOM / I/O), matching the existing pure utilities in
  `projectLoaderUtils.ts` — covered by `loadHealDegeneratePolygon.test.ts` (12 cases incl. the
  founder snapshot simulation: a sub-0.05 m wall → degenerate room dropped + level re-seal).
