# ADR-0325 — `hierarchyStore` + `parentId` is the sole hierarchy substrate; hierarchy nodes are not graph citizens

> ## ⛔ SUPERSEDED IN PART — 2026-08-17, founder decision. READ THIS BEFORE THE BODY.
>
> **The title's second clause is REVERSED.** Hierarchy nodes **ARE** graph citizens. Superseded by
> **[ADR-0328](ADR-0328-partof-is-a-derived-projection-of-the-hierarchy-store.md)**, which is now
> the governing decision for `partOf`.
>
> **The first clause STANDS, and is the reason this ADR is only PARTLY superseded:**
> `hierarchyStore` + `parentId` remains the **sole hierarchy SUBSTRATE** — the storage source of
> truth. The founder's ruling, verbatim:
>
> > *"parentId = storage/implementation substrate. partOf = graph-level semantic relationship.
> > **Do not create a second independent hierarchy source of truth. Graph projection should be
> > DERIVED FROM the hierarchy store rather than maintained independently.**"*
>
> **WHAT IS NO LONGER TRUE — do not act on these clauses:**
> - **§2 "`partOf` moves from REQUIRED to PARKED"** — it is answered, by projection.
> - **§4 "No writer. Writing a `partOf` edge is now forbidden"** — ⚠ this is the clause that most
>   needs reading in context. Writing an **INDEPENDENTLY AUTHORED** `partOf` edge is *still*
>   forbidden, and that prohibition is the load-bearing half of this ADR. What is permitted is a
>   **derived projection** that re-derives from the substrate at read and reconciles — holding no
>   hierarchy state of its own, and removing any `partOf` edge the substrate does not imply.
>
> ⭐ **WHY THE ORIGINAL REASONING WAS SOUND AND ITS CONCLUSION STILL WRONG.** Both DECLINED rows
> rested on ONE measured premise: *the edge is empty until a reload while the field is right
> immediately.* That is true — of an independently authored edge, which was the only implementation
> anyone had proposed. This ADR's own ¶5 already conceded the projection shape for the loader's
> reconstruction — *"a projection of the substrate, not a rival to it"* — but permitted it at ONE
> instant and forbade it at every other. **The lag it objected to is precisely the interval between
> those instants.** A projection does not argue with the premise; it removes it.
>
> The absence objection falls with it: this ADR held that `getUnassignedRooms` needs a set *"an
> unwritten edge cannot answer at all"*. A projection is TOTAL over the substrate it read, so
> "citizen with no parent" is a positive `[]` and "not a citizen" is a refusal.
>
> **MEASURED at HEAD:** `check-graph-write-coverage` went `[1] DECLARED-LEVEL, 2 findings` →
> **`[0] CLEAN, 0 findings, hard-0, no baseline`**; the C-INV-1 matrix for `partOf` went
> `✗ / ✗ / ●1` → `●1 writer / ●3 reader / ●1 rebuild`. The C-INV-4 ledger is now **empty**.
>
> **The body below is preserved unedited** — its census and its reasoning are the evidence
> ADR-0328 consumes, and rewriting them would destroy the record of how a sound argument reached a
> wrong conclusion.

- **Status**: ⛔ **SUPERSEDED IN PART by [ADR-0328](ADR-0328-partof-is-a-derived-projection-of-the-hierarchy-store.md)** (2026-08-17, founder decision) — the *substrate* clause stands; the *"not graph citizens"* clause is reversed. Originally ACCEPTED — founder decision, 2026-08-14
- **Date**: 2026-08-14
- **Evidence**: `npx tsx tools/ga-gate/check-graph-write-coverage.ts` — the **C-INV-4 ledger**,
  whose two DECLINED rows (`partOf/writer`, `partOf/reader`) carry the full census this ADR
  consumes rather than re-derives · commits through `806292f3` (unit containment shipped on the
  `room.unitId` field)
- **Constrains**: [C71](../contracts/C71-GRAPH-AND-TOPOLOGY.md) §2.1/§2.2/§2.5 · `GraphQueryService`
  (`packages/ai-host/src/graph/GraphQueryService.ts`) · every future proposal to write a `partOf`
  edge
- **Subordinate to**: [ADR-0320](ADR-0320-relationship-vocabulary-scoped-by-consumers.md) (the
  vocabulary is scoped by measured consumers) — this ADR is the first application of its
  **unparking rule** running in the *negative* direction: a REQUIRED family being answered, on the
  evidence, with "no consumer, and none is coming".

## Context

The repository answered the hierarchy question **both ways at once**, and had done so for months.

- `partOf` / `unitOf` / `levelOf` are in the `RelationshipType` union, `partOf` is one of C71
  §2.1's **REQUIRED nine**, and `GraphQueryService` advertised all three as supported query
  relationships.
- Meanwhile **every production hierarchy traversal in the repository** goes through
  `hierarchyStore.getChildren` / `getUnits` / `parentId`, and every production *room→unit* read
  goes through the `room.unitId` field.

Measured at HEAD, `partOf` has **no production writer**. Its sole writer is the loader's
reconstruction (`packages/persistence-client/src/loader/rebuildSemanticGraph.ts:193`) from
`room.unitId` — so a room assigned to a unit in-session carries **no edge until the project is
reloaded**, and the graph and the authoritative field disagree for the whole session. It has no
typed production reader either. The C-INV-4 ledger declined to close either half, deliberately,
per C71 §2.5 (a writer or reader added *to satisfy a gate* is the `sitsOn` defect committed on
purpose), and named the prior question that had to be settled first:

> **should hierarchy nodes (unit / level / building / site) be graph citizens AT ALL, or is
> `hierarchyStore` + `parentId` the sole hierarchy substrate?**

That ledger's census is the evidence for this ADR and is **cited, not restated**. Its findings in
one line each:

| Census | Finding |
|---|---|
| `room.unitId` property accesses | **36**, all correct today, all one property access from a room already in hand |
| Forward readers (`SyncStateEngine._findAffectedNodes`, `ScheduleExtractor`, `SpatialQueryPanel`, `RoomBoundaryBuilder`, `IfcSemanticWriter`) | routing them through `getTargets(roomId,'partOf')` would be **more indirection AND less correct** — the edge is empty until reload, the field is right immediately |
| Reverse scans (`roomStore.getAll().filter(r => r.unitId === unitId)`) | **8**, named by file:line; each already runs inside a pass that scans the room store anyway |
| `getUnassignedRooms` (`HierarchyTreeAddActions:279`) | needs the **ABSENCE set** — `!r.unitId` — which an unwritten edge **cannot answer at all** |
| `WorldModelAdapter` | the component that would most naturally want "which rooms are in this unit" **does not model units**: zero occurrences of "unit" in the file |

There is no currently-worse-off consumer, and the one query shape the graph could never serve
(absence) is the one the UI actually calls.

**Unit containment shipped this session on the authoritative field** (commits through
`806292f3`). That is not an interim measure to be migrated later — it is the sanctioned path, and
this ADR says so, so nobody re-opens it as a gap.

## Decision

1. **`hierarchyStore` + `parentId` is the SOLE hierarchy substrate.** Unit / level / building /
   site containment and structure are read from, and written to, `hierarchyStore`. Room→unit
   containment is the **`room.unitId` field**, authoritative, and the path shipped through
   `806292f3`. **Hierarchy nodes are not graph citizens.**
2. **`partOf` moves from REQUIRED to PARKED**, joining `unitOf` and `levelOf`. C71 §2.1's REQUIRED
   set becomes **eight** families. *(C71 is the contract and outranks this ADR; the §2.1 table and
   the `check-graph-write-coverage` REQUIRED list must be amended to match — see Consequences.
   Until they are, this ADR is the stated intent and the C-INV-4 rows stay ledgered exactly as
   they are.)*
3. **PARKED, not gap, and not deletable.**
   - **C71 §2.3** — no coverage census, status document, audit, roadmap or gap register may count
     `partOf` / `unitOf` / `levelOf` as *missing capability*. Parked and gap are different states.
   - **C71 §2.4** — they **may not be deleted** from `RelationshipType`. Removing them breaks
     `deserialize` on **snapshot v3** for any project carrying one, for zero computational gain.
     They stay declared, and stay out of the ratchet.
4. **No writer.** Writing a `partOf` edge is now **forbidden** rather than merely unjustified —
   C71 §2.5's writer-first prohibition applies with full force. The obvious write site
   (`AssignRoomToUnitCommand`, beside the `room.unitId` update) stays deliberately empty. A
   writer would create a second, lagging record of a fact the field already holds correctly, and
   two records of one fact is how they come to disagree.
5. **The loader's reconstruction is retained, unchanged.** `rebuildSemanticGraph` may keep
   emitting `partOf` from `room.unitId` on load: it costs nothing, it keeps IFC-imported
   snapshots round-trippable, and it is the reason the family cannot simply be treated as absent.
   It is a **projection of the substrate, not a rival to it**.
6. **Unparking remains possible, by the ordinary rule.** C71 §2.5 is unchanged: a future ADR that
   names a real first CONSUMER — a reader and the computation it feeds — unparks the family.
   This ADR closes the question *on today's evidence*; it does not weld it shut.

## Consequences

**The one code consequence, applied in this ADR's commit.**
`packages/ai-host/src/graph/GraphQueryService.ts` listed `partOf`, `unitOf` and `levelOf` in
`SUPPORTED_RELATIONSHIP_TYPES`. Because a room **is** a node of the graph via its `boundedBy` /
`adjacentTo` edges, the `unknown-element` refusal did **not** fire, and `graph.query(roomId,
'partOf')` returned a **confident `{ ok: true, targets: [] }`** — "nobody ever wrote this edge"
and "this room is in no unit" reaching a caller as the same value. That is the
§CONTEXT-DATA-HONESTY defect at the AI query surface, where the `[]` leaves the type system and
becomes English in a prompt. C71 §4.4 forbids it explicitly.

The three families now refuse with a new, distinct reason **`hierarchy-not-in-graph`**, carrying
the C78 §8.1 member **`RELATIONSHIP_NOT_RECORDED`** — the member whose own docblock names
`partOf` literally. The refusal is a separate reason from `unsupported-relationship` because the
two differ in kind and the caller deserves the difference: a temporal family has no answer
**anywhere**, whereas a hierarchy question has a precise authoritative answer **in another
substrate** — so the refusal text names `hierarchyStore` and `room.unitId` rather than dead-ending.
No new member was added to the closed C78 union, and no rival vocabulary was minted.

**Gate readings.** `check-graph-write-coverage` stays at **declared 2** — the two DECLINED
C-INV-4 rows are unchanged by this ADR and remain the correct record of a *reasoned decline*.
`check-no-empty-means-unknown` does not move: this change **removes** an empty-means-unknown site
rather than adding one.

**Documents that must follow** (not this ADR's territory, listed so they are not forgotten):
C71 §2.1/§2.2 amended to eight REQUIRED and fifteen PARKED; the REQUIRED list inside
`tools/ga-gate/check-graph-write-coverage.ts`; and the register rows for the two declined graph
findings, whose disposition changes from *"blocked on an unmade decision"* to *"DECIDED —
ADR-0325"*.

## Alternatives rejected

**Make hierarchy nodes graph citizens** — add `AssignRoomToUnitCommand`'s writer and migrate the
36 field readers onto `getTargets`. Rejected on the census: it is more indirection, it is *less
correct* mid-session (the edge lags the field until a reload), and it **cannot serve
`getUnassignedRooms` at all**, because an absence set is not derivable from an edge that may
simply be unwritten. It would also mint a second record of unit containment beside the
authoritative field.

**Add the writer alone, and leave the readers on the field** — the exact shape C71 §2.5 forbids
and `sitsOn` demonstrated: months of measured-but-meaningless coverage, a gate reading green over
edges no computation consumes.

**Delete `partOf` / `unitOf` / `levelOf` from the union** — breaks `deserialize` on snapshot v3
for any project carrying one (C71 §2.4), and would silently drop edges already present in
IFC-imported snapshots. Parked members cost nothing where they are.

**Leave `GraphQueryService` advertising them** — the status quo, and the one option that is
actively harmful: it is the confident `[]`, reaching an LLM prompt, about a fact nobody
established.
