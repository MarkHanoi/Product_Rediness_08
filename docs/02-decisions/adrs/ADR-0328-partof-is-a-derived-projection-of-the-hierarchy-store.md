# ADR-0328 — `partOf` is a DERIVED PROJECTION of the hierarchy store; hierarchy nodes ARE graph citizens

- **Status**: ACCEPTED — founder decision, 2026-08-17
- **Date**: 2026-08-17
- **Supersedes**: [ADR-0325](ADR-0325-hierarchy-store-is-the-sole-hierarchy-substrate.md) — its
  **¶1 second half** (*"hierarchy nodes are not graph citizens"*), **¶2** (`partOf` → PARKED) and
  **¶4** (*"no writer … writing a `partOf` edge is now forbidden"*). ADR-0325's **¶1 first half**
  (`hierarchyStore` + `parentId` is the sole hierarchy **substrate**), **¶3** (parked ≠ gap, and
  `unitOf` / `levelOf` are not deletable) and **¶5** (the loader's reconstruction is a projection,
  not a rival) are **RETAINED AND STRENGTHENED** — this ADR generalises ¶5 from load-time to
  all-time. ⚠ ADR-0325's own Status line still reads ACCEPTED and is not edited here; see
  *Documents that must follow*.
- **Evidence**: `npx tsx tools/ga-gate/check-graph-write-coverage.ts` — **before: exit 1**,
  *"2 finding(s) against a NAMED ledger of 2"* (`partOf/writer`, `partOf/reader`); **after: exit 0**,
  *"0 findings, hard-0, no baseline"*, with the C-INV-1 matrix reading `partOf` writer ●1 /
  reader ●3 / rebuild ●1. Executed controls: `PartOfProjection.test.ts` (16) and
  `graphQueryServiceParkedHierarchy.test.ts` (16), the two load-bearing ones watched RED first.
- **Constrains**: [C71](../contracts/C71-GRAPH-AND-TOPOLOGY.md) §2.1/§2.2/§2.5/§3.4/§4.4 ·
  `packages/core-app-model/src/hierarchy/PartOfProjection.ts` ·
  `packages/ai-host/src/graph/GraphQueryService.ts` · every future proposal to write a `partOf` edge
- **Subordinate to**: [ADR-0320](ADR-0320-relationship-vocabulary-scoped-by-consumers.md) — the
  vocabulary is scoped by measured consumers. This is an **unparking** under its ordinary rule,
  which ADR-0325 ¶6 explicitly left open: *"a future ADR that names a real first CONSUMER … unparks
  the family. This ADR closes the question on today's evidence; it does not weld it shut."*

## The ruling

> **partOf: YES — hierarchy nodes ARE graph citizens.** `hierarchyStore` + `parentId` remains the
> storage source of truth; **`partOf` is the DERIVED graph semantic.**
>
> *"parentId = storage/implementation substrate. partOf = graph-level semantic relationship. **Do
> not create a second independent hierarchy source of truth. Graph projection should be DERIVED
> FROM the hierarchy store rather than maintained independently."***

## Context

### What ADR-0325 got right, and what it assumed

ADR-0325 declined both halves of the `partOf` coverage gap and parked the family. Its reasoning
rested on **one measured premise**, stated in the C-INV-4 ledger it consumed:

> the edge exists only after a load, never after a live command — so routing a reader through
> `getTargets(roomId,'partOf')` would be *more indirection AND LESS CORRECT*, since the edge is
> empty until a reload while the field is right immediately.

Every conclusion it drew followed from that one fact:

| ADR-0325 conclusion | The premise it rests on |
|---|---|
| a reader would be a REGRESSION | the edge lags the field mid-session |
| a writer would mint a **second, lagging record** | a command-authored edge is independent state |
| an ABSENCE set (`getUnassignedRooms`) is **not derivable** | an edge may simply be unwritten |
| the AI surface must REFUSE `partOf` | an answer from that edge cannot be trusted |

The premise was true of **an independently authored edge**. It is not a property of `partOf`; it is
a property of *maintaining a second copy*. ADR-0325 measured the only implementation anyone had
proposed — `AssignRoomToUnitCommand` writing the edge beside the `room.unitId` update — and
correctly refused it. Its closing line is the one this ADR takes up: *"two records of one fact is
how they come to disagree."*

### What the founder's ruling changes

The ruling keeps that invariant word for word — **do not create a second independent hierarchy
source of truth** — and rejects the inference that the graph must therefore stay silent. A
**projection** is not a second record. It is the *same* record, expressed in the graph's vocabulary,
re-derived from the substrate rather than accumulated beside it.

ADR-0325 already conceded exactly this shape in its own ¶5, about the loader's reconstruction:

> `rebuildSemanticGraph` may keep emitting `partOf` from `room.unitId` on load … **It is a
> projection of the substrate, not a rival to it.**

ADR-0325 permitted that projection at **one instant** (load) and forbade it at every other. The
lag it then objected to is precisely the interval between those instants. This ADR removes the
interval: the projection runs at the **read**, so there is no window in which the graph and the
field can disagree.

### Every ADR-0325 objection, against a projection rather than a writer

| Objection | Why it does not apply to a derivation |
|---|---|
| *"less correct — the edge lags the field"* | The answer is derived from the substrate at the moment it is asked. There is nothing to lag. |
| *"a second, lagging record"* | The projection holds no state. Re-deriving it from an unchanged substrate performs **zero mutations**; the substrate is the only place a fact lives. |
| *"an absence set is not derivable"* | A projection is **TOTAL over the substrate it read**, so *"citizen with no parent"* is a positive `[]` and *"not a citizen"* is a refusal. `getUnassignedRooms` is answerable — this is the query ADR-0325 held an edge could never serve. |
| *"36 field readers would gain indirection"* | None are migrated. The field readers stay exactly as they are; see Decision ¶6. |
| *"a writer justified only by the gate is the `sitsOn` defect on purpose"* | Correct, and still binding. The consumer is named in ¶4 and was **worse off before**: it was refusing. |

## Decision

1. **`hierarchyStore` + `parentId` remains the SOLE hierarchy source of truth**, and `room.unitId`
   remains the authoritative room→unit field. Unchanged from ADR-0325 ¶1's first half. **No second
   store is introduced, and no command authors a `partOf` edge.**
2. **Hierarchy nodes ARE graph citizens, and `partOf` is the DERIVED graph semantic** over that
   substrate. It leaves PARKED and returns to C71 §2.1's REQUIRED set, which is **nine families
   again**.
3. **The projection is a reconcile, not an emit.** `PartOfProjection`
   (`packages/core-app-model/src/hierarchy/`) computes the derivation from the substrate and brings
   the graph's `partOf` edges into agreement with it: edges the substrate implies are added, and
   **every `partOf` edge it does not imply is removed** — including one written directly into the
   graph by something else. That is the mechanical guarantee that a rival hierarchy cannot come
   into existence: *an independent write does not survive the next read.*
4. **The projection is refreshed at the READ.** A projection refreshed only by its writers is a
   cache, and a cache is the second record ¶1 forbids. Deriving at the read makes staleness
   structurally impossible. Because the reconcile is a **diff**, an unchanged substrate costs no
   mutations and leaves edge ids stable.
5. **The first CONSUMER (C71 §2.5) is `GraphQueryService.query(id, 'partOf')`** — the AI query
   surface, which under ADR-0325 refused the question outright (`hierarchy-not-in-graph`). The
   refusal's only justification was that the edge could not be trusted; once it can, the refusal is
   the regression. It now answers, and keeps C71 §4.4 by asking the **substrate**, not the edge set:
   an id the substrate does not know REFUSES, an id it knows with no parent answers a positive `[]`,
   and an unreadable room store REFUSES with `hierarchy-substrate-unreadable` rather than reporting
   *"in no unit"*.
6. **No existing field reader is migrated.** The 36 `room.unitId` property accesses and the 8
   reverse scans stay exactly as they are. ADR-0325's census of them is still correct and this ADR
   does not overturn it: a room already in hand is one property access away from its unit, and
   routing that through a graph call would be indirection for its own sake. The projection exists
   for consumers that hold an **id and a question**, not an object.
7. **`unitOf` and `levelOf` remain PARKED**, and `GraphQueryService` still refuses them with
   `hierarchy-not-in-graph`. C71 §2.5 unparks a family for a named consumer, never by family
   resemblance. C71 §2.3 (parked ≠ gap) and §2.4 (not deletable) continue to govern them.
8. **Writing a `partOf` edge outside the projection remains forbidden**, and this is ADR-0325 ¶4
   preserved rather than reversed. The prohibition simply has a different subject: not *"nobody may
   write this edge"* but *"nobody except the derivation may, and anything else writes is undone"*.

## Consequences

**Code, in this ADR's commit.**

- `packages/core-app-model/src/hierarchy/PartOfProjection.ts` — new. A pure `derivePartOfEdges`
  (substrate → edges), the reconcile, and two refusal-bearing reads (`getParentOf`,
  `getMembersOf`). The substrate and the graph are both **injected**, so the controls can move the
  substrate under the projection; the production singleton binds `hierarchyStore` plus the room
  store obtained through `storeRegistry`.
- `packages/ai-host/src/graph/GraphQueryService.ts` — `partOf` moves out of
  `PARKED_HIERARCHY_RELATIONSHIPS` into the supported set and is routed through the projection in
  both `query` and `neighbors`. A new refusal reason `hierarchy-substrate-unreadable` is added to
  that surface's local union. **No member is added to the closed C78 §8.1 union** — the refusal
  still carries `RELATIONSHIP_NOT_RECORDED`.
- `tools/ga-gate/check-graph-write-coverage.ts` — the two DECLINED C-INV-4 rows are **struck in the
  same commit that pays them** (C78 §20). The ledger is now **empty**, which makes this gate
  **hard-0**: any finding, in any REQUIRED member, is unledgered and exits 3.

**Why rooms are read through `storeRegistry` and not imported.** `@pryzm/room-topology` depends on
`@pryzm/core-app-model`, so a value import of `roomStore` here would close a module cycle at load
time (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD). `composeRuntime` already registers the room store
under `'room'`.

**§CONTEXT-DATA-HONESTY, at the substrate boundary.** The substrate snapshot's `rooms` field is
`null` — not `[]` — when the room store is not registered. This is load-bearing in two directions:
a snapshot that reported an unreadable store as empty would make the reconcile **delete every
loader-rebuilt room→unit edge** and call it a derivation, and it would make *"nobody can see the
rooms"* and *"this room is in no unit"* the same value at the query surface. On a `null` reading the
reconcile narrows to the half it can see, and the reader refuses.

**Gate readings.** `check-graph-write-coverage`: **1 → 0**, findings **2 → 0**, ledger **2 → 0**.
`check-no-empty-means-unknown` does not move — this change replaces a refusal with a *typed* answer
plus two typed refusals, and adds no empty-means-unknown site.

**Documents that must follow** — not this ADR's territory (this lane is scoped to add one ADR file
and touch no other doc), listed so they are not forgotten:

1. **ADR-0325's Status line** still reads `ACCEPTED` and its ¶2/¶4 now contradict shipped
   behaviour. It must become `SUPERSEDED IN PART BY ADR-0328`. **This is the highest-priority
   follow-up**: a live ADR asserting *"writing a `partOf` edge is forbidden"* is exactly the class
   of stale-authority defect the C71 suite keeps catching.
2. **C71 §2.1/§2.2** — REQUIRED returns to nine with `partOf` in it; PARKED returns to fourteen.
   (`tools/ga-gate/check-graph-write-coverage.ts` already lists `partOf` as REQUIRED, so the gate
   and the contract agree again; it was ADR-0325 that put them out of step.)
3. **`tools/ga-gate/gate-newly-measured.json`** — this gate's entry, now that it is hard-0 with an
   empty ledger. Shared with concurrent lanes, so not edited here.
4. **`BIM30-MASTER-COMPLETION-TRACKER.md` GR-01 / GR-05** — both rows read **CLOSED** with evidence
   `[1] 2/2`, quoting the **whole-gate** exit and finding count for rows whose own subjects are
   `contains` and `sitsOn`. The tracker has **no way to express a per-row finding against a
   per-vocabulary gate**, and papered over it in prose (*"both remaining rows are `partOf`"*). The
   evidence strings should now read `[0] 0/0, hard-0`. The instrumentation gap itself outlives this
   ADR and is worth its own row.

## Alternatives rejected

**Ship the writer ADR-0325 described** — `AssignRoomToUnitCommand` authoring the edge beside the
`room.unitId` update. Rejected for exactly the reason ADR-0325 gave: it mints a second record of
one fact, which can lag, and lagging is how two records disagree. The founder's ruling forbids it
in as many words. This is the option the ruling rules **out**, and naming it here is the point —
"YES to `partOf`" is not "yes to the writer".

**Derive on read only, and never materialise the edge.** A pure query helper, no graph edges at
all. Rejected because it does not make hierarchy nodes *graph citizens*: `graph.neighbors(unitId)`
and the serialized slice would still show no containment, and the loader's existing `partOf`
reconstruction would remain the odd one out — a family that exists after a load and not otherwise.
Materialising through a reconcile keeps one representation for the loader, the query surface and
the snapshot.

**Refresh from the store event bus instead of at the read.** A `storeEventBus` subscription would
keep the edges warm without work at query time. Rejected as the *cache* shape ¶4 rules out: it is
correct only while the subscription is correct, and it re-opens the staleness window on every path
that mutates the substrate without emitting (`deserialize` is one). It is a viable **optimisation**
later — as a way to skip a diff that would have been empty, never as the thing that establishes the
answer.

**Leave `GraphQueryService` refusing** — the status quo. Rejected: the refusal was justified solely
by a staleness that no longer exists, and a refusal whose "yes" branch was waiting on a decision
becomes a regression the moment the decision lands
(§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH). It would also leave the AI unable to answer *"which unit
is this room in"* about a fact the model holds correctly.

**Unpark `unitOf` / `levelOf` at the same time.** They are hierarchy families too and the same
projection could serve them. Rejected under C71 §2.5: no consumer has asked, and unparking by
family resemblance is how a vocabulary grows edges nobody reads — the `sitsOn` defect, arrived at
by a different road.
