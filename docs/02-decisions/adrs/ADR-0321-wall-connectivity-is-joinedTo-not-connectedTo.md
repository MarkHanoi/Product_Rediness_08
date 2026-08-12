# ADR-0321 — Wall↔wall connectivity is `joinedTo`, a new type; `connectedTo` stays room↔room

- **Status**: PROPOSED — awaiting founder ratification (it changes the persisted vocabulary)
- **Date**: 2026-08-12
- **Evidence**: the CONNECT-3 handoff (commit `8552de14`) · `SemanticGraph.ts:48` ·
  [EV-05](../../04-reference/bim30-evidence/EV-05-relationship-coverage-ledger.md)
- **Depends on**: ADR-0320 · **Constrains**: C71, the junction→graph writer

## Context — the decision an agent correctly refused to take

CONNECT-3 retained the wall junction records (L/T/Y/X, participant wall ids, typed refusals) and
made wall↔wall connectivity deterministically writable into the SemanticGraph for the first time.
It then stopped, because the obvious target type is wrong: **`connectedTo` is documented at
`SemanticGraph.ts:48` as "room ↔ room via door" and both production readers consume it as
rooms** — `SemanticQueryEngine.ts:140` ("rooms without a door") and `WorldModelAdapter.ts:151`
(`connectedRoomIds`). Emitting wall↔wall edges under the same name is not a wiring task; it is a
vocabulary change with two live consumers in the blast radius. The agent specified both options
and declined to choose unilaterally. This ADR is that choice.

## Decision

**Add one member to `RelationshipType`: `joinedTo` — wall ↔ wall, via a retained junction.**

- Written (both directions) by the junction→graph writer from the retained index, with
  `metadata: { junctionType: 'L'|'T'|'Y'|'X'|'N-WAY', junctionDegree }`.
- `connectedTo` keeps its documented meaning untouched. Neither existing reader changes.
- This matches IFC's own separation — `IfcRelConnectsPathElements` (element path connectivity)
  is a different relationship from space connectivity — so the export mapping is 1:1.
- Per ADR-0320 rule 4, `joinedTo` lands with its writer (the flush-time emitter specified in the
  CONNECT-3 handoff), its reader (the graph query path / Q4 lookup), its rebuild disposition
  (**regenerated** — junctions are derived; the rebuild source is the retained index, so this
  type is *not* persist-or-lose), and its delete behaviour (the wall-family cascade landed in
  `3ee632f6` already removes all edges for a deleted wall, `joinedTo` included).

### Why `joinedTo` and not the plausible alternatives

- **Not overloading `connectedTo`**: two live readers would silently start receiving wall ids
  where they expect room ids. `WorldModelAdapter.getRelationshipContext` enumerates untyped and
  *would* surface them into AI context — a poisoned world model with no error anywhere.
- **Not `connectsTo`** (the founder's §3C candidate list spells it this way): one letter of
  edit distance from `connectedTo` is a review hazard — the two would be confused in greps, in
  chat capabilities, and in every future audit. The near-miss name is worse than a new name.
- **`joinedTo` is the repo's own domain language**: `WallJoinResolver`, `WallJunctionRecord`,
  "wall joins" throughout ADR-0055. The name greps cleanly to its machinery.

## Consequences

Q4 ("which walls connect to wall Y") becomes a graph LOOKUP with a deterministic writer. The
stale-edge risk the CONNECT-3 handoff named is inherited by the writer spec: edges for a level
must be **removed and re-emitted at flush**, because `addRelationship` idempotency alone lets a
wall that *stops* joining keep its stale edge. `deserialize` on old snapshots is unaffected
(additive union member). The writer must NOT use `WallJunctionRecord.id` as a stored key — it is
a within-solve handle and renumbers when walls move (measured, junctionRetention test §UNPROVEN
note).
