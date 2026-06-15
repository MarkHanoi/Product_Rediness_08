# 0069 — Graph-Authoritative Room Identity at Execution

**Status**: PROPOSED
**Date**: 2026-06-15
**Deciders**: architecture team (founder-driven — *"we need to have a GRAPH first, then circulation — this is the key. Make the clean apartment approach happen in the house."*)
**Related ADRs**: [0066](./0066-access-graph-first-generative-layout-doctrine.md) (this ADR resolves its AG2 "re-assert the graph on the detected plan" by inverting room-identity authority), [0061](./0061-building-graph-bidirectional-edit-substrate.md) (determinism + bidirectional edit), [0063](./0063-house-generative-layout-doctrine.md) (per-storey pipeline), [0068](./0068-five-graph-model-circulation-first-building-graph.md) (circulation-first graph)
**Related contracts**: C53 §1 (topology is source of truth, geometry is its projection), C52 (editable building graph), C16 (command authoring), C11 (element creation pipeline)
**Related SPEC**: [SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR](../../03-execution/specs/SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md)

## Context

The apartment generator ships clean (correct rooms, edges, joints, names); the house fragments the same engine's output into thin strips, slivers, merged rooms, and generic `Room 01-NNN` names. Root cause, established by direct investigation (this session):

- **The two executors diverge at the room-identity boundary, not in the engine.** The apartment executor dispatches the engine's walls **1:1** and re-detects; because its walls *close*, detection re-derives exactly the designed rooms. The house executor **re-processes** the same engine output through `weldPartitionsToShell` (moves partition endpoints onto a pre-drawn/minted shell), per-storey perimeter-minting, stair-carving and the comb — each shifts/doubles/loosens edges.
- **`RoomDetectionEngine` is a planar half-edge face tracer, not a flood-fill** (`PlanarTopologyEngine.computeTopology`). A room **merge = an unclosed loop** (a partition endpoint not node-coincident with its host after the snap chain — `WallJoinResolver` trims generated members 0.3–1.2 m loose at multi-clusters). There is **no size-based merge and no tunable detection tolerance** that fixes this without re-introducing the `§STRICT-ROOMS` false-fusion regression. The cure is therefore **upstream**, exactly as the founder framed it: graph first.

ADR-0066 AG2 kept **detection authoritative** for room identity and reconciled *names* afterward (`§ROOM-NAME-BIJECTIVE`). That is insufficient: when detection over/under-segments, name reconciliation has the wrong *number* of rooms to name. This ADR takes the next step.

## Decision

**The engine's `option.rooms` (the typed, graph-derived room polygons the clean PREVIEW already draws) is the AUTHORITATIVE source of room identity at generation. Detection is demoted to validation-only.** Four binding sub-decisions answer the open questions:

**GR1 — Room identity is graph-authoritative at generation; detection is validation-only.**
At generation, the executor **creates Room elements directly from `option.rooms`** (polygon + type + name + occupancyType), inside the existing one-undo `runBatch`. `RoomDetectionEngine` **still runs**, but only to *validate*: it traces the built walls, compares the detected face set to the graph rooms, and on divergence (count mismatch / area-cap breach / unclosed loop / sliver) emits a `§DIAG-GRAPH-VALIDATE` warning into the existing `§DIAG-EXEC-*` spine. It **never overrides** the graph rooms and **never aborts**. *Undo:* the room-create commands ride the same atomic batch as walls/doors (no undo-model change). *Editable living graph (C52/ADR-0061):* unchanged and strengthened — a graph edit now maps 1:1 to a created Room element with no detection round-trip; post-generation rename/re-type edits that element directly.

**GR2 — Graph authority is a generation-time SEED, surrendered to detection on the first manual wall edit.**
Each graph-created room carries `provenance: 'generated'`. The instant the user draws/edits a wall that intersects a generated room, the normal detection-on-wall-change pipeline re-asserts for the **touched** rooms (exactly as for hand-drawn projects today); untouched generated rooms stay graph-authoritative. Hand-drawn projects (no graph) remain fully detection-authoritative — **zero change**. This bounds the graph's authority so it never fights the user (and forecloses the next cycle of follow-up fixes).

**GR3 — Room polygons are created in the SAME projected frame as the dispatched walls, and the ground perimeter is clipped to the drawn shell.**
`option.rooms` polygons are transformed by the **identical** rigid/rectify transform applied to the partitions at dispatch (the `projectNorthWeld` frame), so walls and rooms share one coordinate projection → consistent by construction. On the ground floor's `skipExteriorWalls` path, perimeter-room outer edges are **clipped to the drawn shell** (the authoritative built boundary); rooms never extend past it. Where the engine footprint and the drawn shell diverge (the ≤2 m `§RECTIFY-SHELL-PROJECT` gap on rotated plates), the **drawn shell wins** the outer boundary and the graph supplies the interior partition→room mapping. The weld/rectify gap thus becomes **irrelevant to room identity** — it only ever corrupted detection loop-closure, which is now validation-only.

**GR4 — `buildLayoutCommands` gains a `roomCommands` output; BOTH executors dispatch it identically.**
The shared ai-host `buildLayoutCommands` returns a new `roomCommands` list of room-create commands `{ id (pre-minted, no read-back), levelId, polygon, type, name, occupancyType }` from `option.rooms`, reusing the editor's existing room-create path (the command the detection→commit flow already uses against `RoomStore`; C16-conformant — level-scoped, id-pre-minted, semantic-first). Both `ApartmentLayoutExecutor` and `HouseLayoutExecutor` dispatch `roomCommands` inside their existing `runBatch`, and **disable detection's auto-create-rooms for the generated level** (detection runs validation-only there). This **unifies the two executors** — the house's bespoke re-processing no longer *defines* rooms, so the divergence source is removed.

## What changes / what stays — the two executors

| Aspect | Apartment executor | House executor |
|---|---|---|
| Room identity source | detection → **`option.rooms` graph** | detection → **`option.rooms` graph** |
| Wall geometry (weld / perimeter-mint / comb) | n/a / minimal — **stays** | **stays** (walls still built + must close for render/validation) — but no longer *defines* rooms |
| `RoomDetectionEngine` | authoritative → **validation-only** | authoritative → **validation-only** |
| Net room result | ~byte-identical (walls already closed → graph == detected); gains explicit graph rooms | **rooms now match the preview**, independent of weld/trim divergence |
| Door / window / boundary dispatch | unchanged | unchanged |

## Acceptance gate (existing tests that must stay green + the new assertion)

- `§DIAG-SEAL` chain + `housePartitionReachDetection` invariant — **stay green** (walls must still close, for rendering + validation).
- `weldResolverRoomDetectionChain` — repurposed: assert the **created (graph) room set == `option.rooms` 1:1**, and that detection divergence only *warns* (never changes the room set).
- New `§DIAG-GRAPH-VALIDATE`: on the apartment reference plate, `detectedRooms == graphRooms` (proves no regression where detection already matched); on a stair-fragmented house plate, the **created** room set equals the engine design even when `detectedRooms` diverges.

## Consequences

- **Positive:** kills the apartment↔house divergence at its source; the house ships the clean plan the preview shows; `§RECTIFY-SHELL-PROJECT`/weld/trim defects become non-fatal (validation warnings, not corrupt rooms); apartment + house unify onto one room-creation path.
- **Determinism (ADR-0061):** room ids are pre-minted deterministically; no `Date.now`/`Math.random`; apartment room set stays effectively identical.
- **Walls still matter:** this does not abandon wall closure — walls render and are validated; it only stops *detection* from being the definition of room identity. The graph-first circulation reform (ADR-0068) continues above this.
- **Cost / staging:** (1) `roomCommands` in `buildLayoutCommands` + the shared dispatch; (2) detection→validation-only flag per generated level; (3) GR3 frame-shared room-polygon projection + ground clip. Staged behind the apartment byte-identity gate.

## Alternatives considered

- **Keep ADR-0066 AG2 (detection authoritative, reconcile names).** Rejected: name reconciliation can't fix a wrong room *count*; the founder's fragmentation is a count/segmentation failure, not a naming one.
- **Tune `RoomDetectionEngine` tolerance so loose partitions still close.** Rejected with evidence: detection has no size-merge lever, and widening snap radii re-opens the `§STRICT-ROOMS` false-fusion regression. Confirmed dead end.
- **Make the house dispatch walls 1:1 like the apartment (drop weld/perimeter).** Rejected as the *primary* fix: the ground reuses a user-drawn shell that genuinely needs closure to the partitions; removing the weld re-opens loop gaps. Graph-authoritative rooms make the weld’s *room-identity* role moot without removing its wall-closure role.
