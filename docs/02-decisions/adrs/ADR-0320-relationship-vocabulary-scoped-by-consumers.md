# ADR-0320 — The relationship vocabulary is scoped by measured consumers, not by ontology

- **Status**: ACCEPTED — implements the founder's BIM 3.0 directive §3C rule ("only
  relationships with demonstrated computational value should be required")
- **Date**: 2026-08-12
- **Evidence**: [EV-05](../../04-reference/bim30-evidence/EV-05-relationship-coverage-ledger.md)
  (the coverage ledger, including its same-day correction) · the Phase 0 re-baseline sweeps
- **Constrains**: C71 (graph & topology contract) · every future `RelationshipType` addition

## Context

`SemanticGraph` declares **25 relationship types**. Measured at HEAD: **12 have zero writers and
zero readers anywhere in production** — vocabulary without computation. Two more are broken in
instructive ways that the census of either side alone could not see: `sitsOn` was write-only
(ten kinds emitting an edge nothing consumed) until `DependencyResolver` and `buildBuildingGraph`
gained reads; `contains` is read-only (two production surfaces querying an edge only IFC import
ever writes, so on native projects "no data" and "contains nothing" are the same answer).

The lesson EV-05 stated: **an edge is only real when a writer and a reader agree it exists.**
A declared type with no consumer is not partial progress toward BIM 3.0 — it is a false signal
that inflates every coverage census and misleads every future audit that greps for capability.

## Decision

1. **REQUIRED (9 families)** — these are the BIM 3.0 graph, each with its demonstrated consumer:
   `hosts`/`hostedBy` (occupancy gating, query engine) · `boundedBy` (room queries) ·
   `adjacentTo` (world model, query engine) · `connectedTo` (room↔room via door — pathfinding)
   · `sitsOn` (dependency scheduling, building graph) · `supports` (beam assignment) ·
   `contains` (world model, hierarchy tree — **needs its first-party writer**, a named gap) ·
   `partOf` (unit containment) · **wall↔wall junction connectivity** (retained junction index —
   naming decided by ADR-0321).
2. **PARKED (12 + circulation edges as-is)** — `unitOf`, `levelOf`, `servesZone`, `precededBy`,
   `supersedes`, `branchedFrom`, `causedFailureOf`, `wasMitigatedBy`, `exceededBenchmark`,
   `replacedBy`, `maintainedBy`, `decommissionedBefore` remain **declared-not-required**. They
   stay in the union (removing them would break `deserialize` on any snapshot that carries one),
   but no gate demands writers for them, and no coverage census may count them as "missing
   capability" — they are *parked*, which is a different state from *gap*.
3. **The unparking rule**: a parked type becomes REQUIRED only by an ADR that names its first
   **consumer** — the reader and the computation it feeds. A writer-first unparking is forbidden:
   writing edges nothing reads is how `sitsOn` spent months as measured-but-meaningless coverage.
4. **The addition rule**: any NEW `RelationshipType` member must land in the same PR as at least
   one writer, at least one reader, its `_rebuildSemanticGraph` disposition (regenerated or
   explicitly persist-only), and its delete-cascade behaviour. C71 makes this a gate.

## Consequences

The graph write-coverage gate ratchets over the **REQUIRED nine**, not the declared 25 — so its
number means something. The `contains` writer becomes a named Tier-2 item. The identically-named
types in `packages/building-graph` (UBG) are explicitly out of scope: that is a different graph,
and greps that conflate the two have already produced one false claim this week.

## Alternatives rejected

**Require all 25** — mandates writers for edges with no computation, manufacturing the
write-only defect twelve more times. **Delete the 12 parked members** — breaks snapshot v3
deserialization for any project carrying one, for zero computational gain.
