# ADR-0022 — Room boundary detection strategy

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Sprint | S25 (Phase 2A) |
| Owners | Architecture lead, room plugin lead |
| Supersedes | none |
| Superseded by | none |

## Context

Sprint S25 (`docs/03_PRYZM3/reference/phases/PHASE-2/2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`)
brings the **room** element family to PRYZM 2.  Rooms are the first family
that requires **reading other elements' geometry** during their own
production: a wall-bounded room derives its boundary from the surrounding
walls.  Three competing approaches were on the table at S25 D1 kickoff:

1. **Topological half-edge flood-fill** (this ADR's choice).  Build a
   half-edge graph of wall centerlines, flood-fill the face containing
   the user-supplied seed point, extract the polygon, then offset to the
   inner wall face.  This is what PRYZM 1's `RoomDetectionService.ts`
   (~520 LOC) does internally.
2. **Ray-casting grid scan**.  Discretise the level into a grid, march a
   ray from the seed point in every direction, intersect with walls,
   stitch the resulting boundary.  Rejected — fails on non-convex rooms,
   L-shaped rooms, and rooms with wall openings.  Not parity-faithful.
3. **Convex hull of inner wall faces**.  Phase-cut fallback only.  The
   kill-switch in §6 of the phase doc allows this as a temporary 2A
   contingency if Option 1 produces > 3 parity failures by D5.

## Numbering reconciliation

The Phase 2A document (written 2026-04-27 morning) reserved the slug
`docs/architecture/adr/0020-room-boundary-detection.md`.  By the time
S25 began, two Phase 1D-merged code-level ADRs had already taken the
adjacent numbers:

| Number | Title | Sprint |
|---|---|---|
| `0020` | Tier-streamed loader | S22 |
| `0021` | Plugin descriptor — bootstrap-everything | S23 |

The phase doc's three reservations therefore renumber as:

| Phase doc reservation | Actual slug | Sprint |
|---|---|---|
| `0020-room-boundary-detection.md` | **`0022-room-boundary-detection.md`** | S25 (this ADR) |
| `0021-furniture-multi-representation.md` | `0023-furniture-multi-representation.md` | S27 |
| `0022-plan-view-canvas-architecture.md` | `0024-plan-view-canvas-architecture.md` | S29 |

The strategic-ADR series (`docs/03_PRYZM3/reference/adrs/`) is
unaffected — `[strategic ADR-020]`, `[strategic ADR-021]`, and
`[strategic ADR-022]` continue to mean Property-test suite, Enterprise
security, and Bake worker pricing respectively.

## Decision

PRYZM 2 ships room boundary detection as a **topological half-edge
flood-fill from the user-supplied seed point**, implemented in
`packages/geometry-kernel/src/producers/room.ts`.

### Algorithm sketch

```
Input:  seedPoint ∈ ℝ², walls: WallData[] on the same level
Output: { polygon, area, perimeter }

1. Project every wall.baseLine onto the XZ plane.  Collect distinct
   nodes (with snapping tolerance ε = 1 mm) and edges.
2. For each node, sort incident half-edges by polar angle.  This is
   the **rotation system** that defines the embedded planar graph.
3. Walk faces by repeatedly turning right (next half-edge in the
   rotation).  Each closed walk is a face; one face is the unbounded
   outer face (negative signed area under the Shoelace test).
4. Locate the face containing seedPoint via point-in-polygon.  If
   none: return DescriptorInvariantError ('un-enclosed seed').
5. Extract the polygon vertices.  Apply a half-thickness inward
   offset along each wall's outward normal so the boundary lies on
   the inner face (Phase 2A v1: average of incident wall thicknesses).
6. Shoelace area + edge-sum perimeter.  Fan-triangulate around the
   centroid (rooms are mostly convex; ear-clipping deferred to S30
   when the drawing-primitives polygon ops land).
```

The algorithm is **O(W log W)** in the wall count (the polar sort
dominates).  For the projects we expect through the GA M36 gate
(< 500 walls per level), the per-room boundary recompute is well
under 5 ms in practice.

### Producer signature exception vs ADR-0009

ADR-0009 froze the producer signature as `(dto, joinData, worldY) =>
BufferGeometryDescriptor`.  Room is the **first producer** in PRYZM 2
that needs to read sibling element state, so it cannot accept a plain
`JoinData`.  S25 introduces a single-purpose context shape:

```ts
export interface RoomBoundaryContext {
  /** All walls on the same level as the room.  Read-only DTOs. */
  readonly walls: readonly Readonly<Wall>[];
  /** Snap tolerance for collapsing near-coincident graph nodes (m). */
  readonly nodeEpsilon?: number;
}

export type RoomProducer = (
  room: Readonly<Room>,
  ctx: Readonly<RoomBoundaryContext>,
  worldY: number,
) => BufferGeometryDescriptor;
```

The deviation is **intentional and bounded** — the third positional
argument (`worldY`) is preserved so the existing
`scene-committer` dispatch table can keep its uniform call shape, and
the second argument is a structural type the rest of the kernel does
not depend on.  ADR-0009 §"Allowed deviations" is updated as part of
this ADR's merge to enumerate Room as the singular permitted exception
for Phase 2A.  Subsequent producers that need sibling-element reads
(handrail-on-stair already does it via `JoinData`; ceiling does not;
furniture S27 will not) MUST justify the deviation explicitly rather
than copy-paste the room shape.

### Schema location

Per SPEC-06 §4.1, the Room schema is the **canonical** location for
`seedPoint`, `boundaryMode`, `multiLevelSpan`, and `boundingElementIds`.
S25 extends the existing `packages/schemas/src/elements/Room.ts` rather
than introducing a new `packages/types-schema/space.ts` package.  The
phase doc's reference to `packages/types-schema/space.ts` was written
before the M9 schema barrel consolidated the 20 element families under
`packages/schemas/`; the canonical path is the existing one.  No new
package is created for Phase 2A.

## Consequences

* **Positive** — half-edge flood-fill matches PRYZM 1's
  `RoomDetectionService.ts` line-for-line on the closed cases (rectangle,
  L-shape, opening, interior obstacle); the Phase-3A multi-level work
  (S49) reuses the same per-level half-edge graph layered with a
  vertical-span join table.
* **Positive** — the producer is **THREE-free**.  `pryzm/no-three-in-kernel`
  passes; the Shoelace area uses the same arithmetic as `produceSlab`'s
  `signedArea` so byte-identity across Node 20 and the browser is
  guaranteed (SPEC-01 §6).
* **Negative** — concave rooms with an island obstacle inside the seed
  face are **not** supported in Phase 2A v1 (the flood-fill returns the
  outer face only).  S49 (Phase 3A) introduces hole tracking via the
  half-edge graph's "inner boundaries" pass.  The current implementation
  raises `DescriptorInvariantError('island-obstacle-not-supported')`
  rather than producing a wrong-area mesh — this is the SPEC-01 §3
  "never silently degrade" rule applied verbatim.
* **Negative** — the producer signature exception costs us one place in
  `scene-committer`'s dispatch table where the room branch differs from
  the wall / slab / roof branch.  The room committer encapsulates the
  call (`onAdd`, `onUpdate`) so the rest of the runtime is unaffected.
* **Operational** — the room committer subscribes to
  `WallStore.subscribeDirty` and re-queues the producer for every
  affected room when a wall on the same level mutates.  The K1B-2
  budget for the room family is "wall edit → room recompute < 16 ms
  for 50 rooms" per the Phase 2A bench harness; that bench lands in
  S30 alongside the drawing-primitives roll-up.

## Open questions

* The Phase 2A v1 inner-face offset uses the **average** of the two
  incident walls' thicknesses at each polygon vertex.  The PRYZM 1
  reference uses the per-side-of-edge thickness (one offset for the
  left half, another for the right).  The simplification keeps the
  area within the < 0.1% budget on every parity case we've measured;
  the per-side variant lands as a straight refactor in S26 if any
  fixture exceeds the budget after the curved-wall pass closes.
* The OTel span name is `pryzm.geometry.produce.room`; the per-room
  attribute set is `{ roomId, levelId, wallCount, area, durationMs }`.
  This matches SPEC-06 §9's `spatial.room.recompute-boundary` /
  `spatial.room.area` contract; the alias is recorded in the room
  producer's exporter wiring (`packages/geometry-kernel/src/runners/
  produceRoomSpan.ts` — landed alongside this ADR in S25).

## References

* SPEC-06 §4 (Rooms) — `docs/03_PRYZM3/reference/specs/SPEC-06-ROOMS-LEVELS.md`
* SPEC-01 §3, §4.1 — `docs/03_PRYZM3/reference/specs/SPEC-01-GEOMETRY-KERNEL.md`
* SPEC-05 §5 — IFC mapping (Room → IfcSpace; export is Phase 3B)
* Phase 2A doc §S25 — `docs/03_PRYZM3/reference/phases/PHASE-2/2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
* `[strategic ADR-024]` — Constraint solver phase gating (no solver in 2A)
* `code-level ADR docs/architecture/adr/0009-producer-pure-function-signature.md`
* PRYZM 1 reference: `src/elements/rooms/RoomDetectionService.ts` (520 LOC)

---

## Amendment 2026-04-28 (W-19 — `RecomputeRoomBoundary` 9th handler)

**Source**: W-19 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §M-3.

The room plugin ships nine handlers, not the eight enumerated in §3 of this
ADR.  The ninth — `RecomputeRoomBoundary` — drives a half-edge re-flood when
walls move under a room without changing the room's adjacency graph (e.g.
trimming a wall against a column).  Without this handler the cascade
recompute would stale-paint the room outline until the next full
`commitRooms()` pass.

The handler is pure: it reads the (potentially stale) `RoomData` + the
current wall AABBs and emits `forward` / `inverse` patches restoring the
correct boundary polygon.  The OTel span name and attribute set match the
existing `pryzm.geometry.produce.room` contract from this ADR.

This amendment ratifies the +1 over spec; no further action required.
