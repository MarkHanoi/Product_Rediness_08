# ADR-0026 — Second-tier element families (Structural / Lighting / Plumbing) triage

**Status:** ACCEPTED — S26 (Phase 2A, M13–M15 non-element completion).
**Supersedes:** none. **Sibling of:** ADR-0010 (slab triage), ADR-0014 (column/beam triage), ADR-0022 (rooms).

## Context

PHASE-2A §S26 unblocks three element families that PRYZM 1 carried but
which had been deferred while PRYZM 2 finished its first-tier MEP-adjacent
backlog (rooms, ceilings, handrails, curtain walls, stairs).

The three families are:

| Family       | Sub-types (registered as `kind`)                                                 | Handlers | Producer style              |
|--------------|----------------------------------------------------------------------------------|----------|-----------------------------|
| `structural` | `brace`, `footing`, `foundation-slab`, `connection`                              | 7        | linear extrusion + box      |
| `lighting`   | `downlight`, `pendant`, `strip`, `wall-sconce`, `emergency`                      | 5        | small fixture body + light* |
| `plumbing`   | `straight`, `elbow`, `tee`                                                       | 4        | cylinder + torus + tee      |

\*The lighting committer is the only PRYZM 2 committer that may attach a
`THREE.PointLight` / `THREE.RectAreaLight` to its mesh — committers are
the THREE-allowed boundary, but lighting is the first family that
actually exercises that allowance for emission rather than just for
geometry.  The kernel producer remains pure-TS and only emits the
visible fixture-body geometry; the emitter parameters travel as
`materialKey` strings (`lighting|<sub>|<intensity>|<color>|<range>`) so
the committer can reconstruct the emitter without ever calling back
into the kernel.

## Decision

1. **Three plugins, three producers, three schemas — not one.**  Bundling
   them under a single `mep` family was rejected because:

   * the PRYZM 1 split is along the same lines (each had its own
     manager / detection service / IFC mapping);
   * the K1-C "≤3-day per family" budget is hit only when each family's
     handler set, store, and committer are independently testable;
   * cross-family coupling is empty in S26 — each plugin's only edge
     is the global element-id graph.

2. **Sub-type discriminator inside the schema, not at the plugin level.**
   `Structural.kind ∈ {brace,footing,foundation-slab,connection}` keeps
   the four shapes inside one DTO — they share `levelId`, `origin`,
   `materialId`, etc. — and the producer dispatches on `kind`.  Same
   pattern for `Lighting.kind` and `Plumbing.kind`.  This matches how
   `Roof.kind` (flat / gable / hip / mansard / mono) and `Stair.kind`
   already work, and avoids a combinatorial explosion of brand IDs.

3. **OTel span names follow the existing convention**
   (`pryzm.kernel.produce.<family>` and
   `pryzm.plugin.<family>.<command>`).  No new span family is introduced.

4. **Wall→Room cross-rule (S25 carry-over) lands in this sprint.**
   `plugins/cross/src/wall-room.ts` synthesises a
   `room.recomputeBoundary` cascade for every room on the affected
   wall's level when wall geometry changes.  A new no-payload
   `RecomputeRoomBoundaryHandler` lands in the rooms plugin to consume
   that cascade and re-run `recomputeRoomAnalytic` per affected room.
   This is the missing edge documented at the end of ADR-0022.

## Consequences

* `ElementType` gains `'structural' | 'lighting' | 'plumbing'`; brands
  and `IdFor<T>` extend in lockstep (`StructuralId`, `LightingId`,
  `PlumbingId`).
* The protocol re-export surface gains three names; downstream callers
  (sync layer, AI layer, fixture loader) MUST add them to their
  discriminated unions on next sync — non-breaking until they do
  (the union narrows on `node.type` so unknown types fall through).
* Lighting committers may import `THREE.PointLight` /
  `THREE.RectAreaLight` (P2 lint already permits THREE in
  `committer/**`).
* The wall→room cascade is **N×M** in the worst case (N walls, M rooms
  on the level).  Acceptable at S26 because the only callers issue
  single-wall edits; a per-level spatial index lands in S30 with
  fixture replay.

## Out of scope (defer to S27+)

* Fluid-flow / pressure-drop simulation for plumbing (purely a
  schedule field today).
* IES photometric files for lighting (the `materialKey` carries
  intensity + color only).
* PRYZM 1 byte-parity fixtures for any of the three families — the
  parity tests in S26 are synthetic-but-analytic per ADR-0022's
  precedent; lifted-fixture parity is a follow-up tracked on the S30
  bake-fixtures pipeline.
