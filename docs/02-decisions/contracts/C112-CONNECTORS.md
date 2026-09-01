# C112 — Connectors

**Status:** CANONICAL — deliberately **NOT ACTIVE**. §9 states the exit condition.
**Minted:** 2026-09-01 (lane C112, Phase 3A of the Universal Component Editor programme)
**Subject:** spec [§26–28](../../01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md) —
*"**Connectors are first-class** (MEP, structural, facade, attachment points, openings, insertion
points) with identity, position, orientation, type, allowed connections, dimensions, direction,
compatibility — enabling machine reasoning over systems"* — and the §34–38 query it exists to answer:
*"components connected to this MEP connector."*
**Authority:** [ADR-0376](../adrs/ADR-0376-universal-component-editor-founding-rulings.md) D3 (metres
canonical) and D5 (`Component` is the vocabulary; **no new symbol may use `Family`**).
**Parent:** [C71 — Graph & Topology](./C71-GRAPH-AND-TOPOLOGY.md). Its §2.5 and §2.6 are **applied,
not restated**, and they are the reason this contract is the shape it is.
**Siblings:** [C15 — Hosted Elements](./C15-HOSTED-ELEMENT-CONTRACT.md) (the host-frame rule this
contract refuses to duplicate) · **C111 — Component Definition** (the document a connector is
declared on; minted by this same phase).
**Gate:** `tools/ga-gate/check-graph-write-coverage.ts` — **it already exists and it is already
hard-0.** This contract specifies **no new gate**. §8.

---

## §0 — What this contract owns, and what it does NOT

### §0.1 Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| The component document a connector is declared on | **C111** |
| Parameters, units, expressions (a connector dimension driven by a formula) | **C110** |
| Where a hosted element's frame comes from | **C15 §2.1**, quoted once in §2.3 and never restated |
| Which host surfaces accept openings | **C15 §0.1.1** ⚠ its slab/roof rows are under correction by Phase 3C — do not read them out of this contract |
| Adding a `RelationshipType` member | **C71 §2.6**. ⛔ §4 below does **not** add one |
| Unparking `servesZone` | **C71 §2.5**. ⛔ §0.3 refuses to |
| Element integrity, per family | **C84** and its C85–C99 block |
| Commands as the only mutation path | **C03**, P6 |
| A refusal must name the reason AND the route back | **C16 CA-18**, **C74** |
| Whether a geometric constraint solver may be built | **C74 §4.1** — it may not, and nothing here asks for one |

### §0.2 — ⭐ THE GREENFIELD CLAIM, MEASURED IN BOTH DIRECTIONS

A contract for a subsystem nobody has built is the one most at risk of being written against an
imagined repository. The claim that connectors are absent was therefore **falsified before it was
relied on**, not transcribed from the audit that proposed it. Measured 2026-09-01 at HEAD:

```
grep -rniE "connector" --include=*.ts --include=*.tsx packages plugins apps    -> 141 hits, ZERO a building object
grep -rniE "attachmentPoint|insertionPoint|anchorPoint|attachPoint" (same)     ->   8 hits, ZERO a building object
grep -rnE  "\bMEP\b|\bmep\b" (same scope)                                      -> 115 hits, ZERO an MEP element
```

All 141 `connector` hits are one of four unrelated senses: a **natural-language grammar** connector
(`FloorFinishIntent`, `WallSideFinishIntent`, `ZeroTokenResolver`), a **corridor connector spine** in
the layout engines (`platePartition.ts`, `deriveCorridorSpine.ts`, `§CORRIDOR-CONNECTOR`), a
**radiator part** (`ToiletRadiatorBuilder`), and a **SIEM log connector** in `entitlements`. The 8
`anchorPoint`/`attachPoint` hits are a wall-centreline local in `WallIntentResolver` and a DOM
listener helper in `RoomTool`. **`MEP` is a discipline LABEL** (`packages/building-graph/src/discipline.ts`
maps `plumbing`/`lighting` → `mep`), a set of **furnish-scoring axis names**, and floor-plate zone
text. There is no MEP element, no routed system and no connector.

**Four-axis reachability of the connector subsystem — 0 on every axis:**

| Axis | Reading |
|---|---|
| import / construction | **0** — no type, no schema, no store |
| bus verb | **0** — no `connector.*` verb in any registry |
| build graph | **0** — nothing to include |
| call | **0** |

⭐ **This is the rare case and it is itself the finding**: proving a subsystem honestly *unbuilt*
rather than merely *unwired*, in a repository where C107 §0.1 records **fifteen
built-but-unreachable surfaces found in one session**. The greenfield claim survives falsification.

### §0.3 — ⛔ THE RESTRAINT RULING, AND IT IS THE MOST IMPORTANT CLAUSE HERE

**A contract for a subsystem nobody has built must be SMALLER than one for a subsystem in production,
not larger.** A contract that specifies more than its first writer needs cannot be checked against
anything — so it cannot be wrong, so it can never be corrected. That is the `C103` failure mode this
suite has already paid for twice (C104 §0.2, C109 §0.2), and a greenfield subject is where it is
most likely to recur.

**Therefore, and each of these is a REFUSAL this contract makes deliberately:**

1. ⛔ **This contract mints NO schema.** No `ConnectorSchema`, and no new connectors package under `packages/schemas/src/`.
   It specifies the model the Phase-6C PR's schema must satisfy, so that PR has an authority to be
   wrong against. The standing review rule rejects a rival schema on sight; this contract does not
   supply one.
2. ⛔ **This contract adds NO `RelationshipType` member.** C71 §2.6 requires a new member to land in
   **ONE PR** carrying a writer, a typed reader, a rebuild disposition and a delete behaviour. A
   contract is none of those four. §4 states the obligations; it does not discharge them. **This is
   the [C106](./C106-ELEMENT-CONSTRUCTION-BOUNDARY-LINE.md) §3.2-b precedent, followed rather than
   re-argued.**
3. ⛔ **This contract does NOT unpark `servesZone`.** C71 §2.2 parks it; C71 §2.5 makes a
   writer-first unparking *"a defect, not progress"* and requires an ADR naming its first consumer.
   No such ADR exists, and a connector is not a zone-service edge in any case.
4. ⛔ **This contract specifies NO new gate.** §8 routes enforcement to an existing one.
5. ⛔ **No symbol named here uses `Family`** (ADR-0376 D5).

---

## §1 — Definitions

| Term | Meaning |
|---|---|
| **Connector** | A **declared joining site** on a `ComponentDefinition`: the place where this component is designed to meet something else, plus the statement of what it may meet. It is a property of the DEFINITION, resolved per instance. It is not geometry and it is not an element. |
| **Host-resolved connector** | A connector whose pose is **derived** from the element it joins (§2.3). **This is the only kind this contract makes NORMATIVE.** |
| **Free connector** | A connector whose pose must be **stored**, because nothing hosts it — an open pipe end. **DEFERRED** (§2.4), with its trigger written in advance. |
| **Demanded void** | The opening a connector requires its host to provide (§2.5). |
| **`connectsVia`** | The graph edge recording that two components are joined **through a named connector** (§4). ⛔ **Not yet a `RelationshipType` member** — §0.3 item 2. |

---

## §2 — THE MODEL: the eight spec §27 axes, each with its disposition

⛔ **Each axis is classified NORMATIVE NOW / ALREADY EXPRESSED / DEFERRED-with-trigger. A blank is
not permitted, and a "DEFERRED" without a trigger is not permitted either** (C84 EI-6: a declared
absence, never a silent one).

| # | Spec §27 axis | Disposition |
|---|---|---|
| 1 | **identity** | **NORMATIVE NOW** — §3 |
| 2 | **position** | ⭐ **ALREADY EXPRESSED — and storing a second copy is REFUSED.** §2.3 |
| 3 | **orientation** | ⭐ **ALREADY EXPRESSED — same clause, same reason.** §2.3 |
| 4 | **type** *(kind)* | **NORMATIVE NOW, opened only to members that have a writer.** §2.2 |
| 5 | **allowed connection types** | **NORMATIVE NOW** — §2.2 |
| 6 | **dimensions** | **NORMATIVE NOW for the demanded void** (§2.5); DEFERRED for free connectors (§2.4) |
| 7 | **direction** *(flow)* | **DEFERRED** — §2.4, trigger named |
| 8 | **compatibility** *(system / spec matching)* | **DEFERRED beyond host-class matching** — §2.4, trigger named |

### §2.1 — All lengths are METRES

ADR-0376 D3, applied. Every connector dimension, offset and coordinate in this contract and in the
schema that satisfies it is **metres**, at every model boundary. Millimetres remain an authoring
literal converted at parse and retained as provenance, never a stored value. ⛔ A connector field
carrying millimetres is a D3 defect, not a local convention.

### §2.2 — `kind` and `allowedHostClasses` — opened only to what has a writer

The spec names six senses: *MEP, structural, facade, attachment points, openings, insertion points.*
⛔ **The vocabulary opens with the members that have a writer; the rest are DECLARED-NOT-REQUIRED on
the C71 §2.2 "parked" precedent** — an existing mechanism in this repository, reused rather than
reinvented. Parked is not a gap (C71 §2.3) and parked members may not be deleted (C71 §2.4).

| `kind` | State | Why |
|---|---|---|
| `insertion` | **REQUIRED at the first writer** | The Window vertical slice **is** this member: a window's connector is its insertion into a wall opening. |
| `opening` | **REQUIRED at the first writer** | The host side of the same join — what a wall offers. |
| `mep` · `structural` · `facade` · `attachment` | **PARKED — declared, not required** | Zero writers and zero readers today. Shipping one is C71 §2.5's *"defect, not progress"*. |

`allowedHostClasses` is a list of **semantic class references** (C111's vocabulary — never a display
string and never uncontrolled text, spec §33).

⛔ **An empty list means "joins nothing"; a missing list means "not yet declared". They are different
values and no reader may conflate them** — the honesty rule C70 L-INV-1 already binds elsewhere in
this repository, applied here at the moment the field is minted rather than after it has been wrong.

### §2.3 — ⭐ THE POSE IS NOT STORED. C15 §2.1 ALREADY RULES IT, AND A SECOND COPY IS A SECOND TRUTH

This is the clause that makes the contract small, and it is a §76 **gate B** ruling (no duplicate
source of truth), not a convenience.

C15 §2.1 states, and this contract lifts it as the universal invariant for host-resolved connectors
**by reference, quoting it exactly once**:

> *"A hosted element's frame IS its host's frame. Every transform the host carries, the hosted
> element carries — the arc tangent, the base datum, and the RAKE. There is no hosted-element frame
> that is a plumb approximation of a leaning host."*

**Therefore a host-resolved connector stores NEITHER position NOR orientation.** Its pose is
**resolved** from the host's existing parametric anchor at read time:

- **position** — the wall `Opening` record already carries `offset` (*"distance along the wall
  baseline from start, in metres"*) and `sillHeight`. That is the anchor.
- **orientation** — the host's frame supplies it, including the rake. Nothing is left to store.

⛔ **A connector record carrying its own world position or normal for a hosted case is REFUSED.** Two
authorities over one pose is C84 EI-9, and the failure is not hypothetical: the moment the host
moves, rakes or curves, the stored copy is stale and nothing says so.

⭐ **This is [C106](./C106-ELEMENT-CONSTRUCTION-BOUNDARY-LINE.md) §3.2's proven device — THE ANCHOR
IS PARAMETRIC — applied one subsystem over.** A dependent's pose is stored as a parametric reference
against its host, never as a world point, so a host move is a **re-evaluation** rather than a
synchronisation someone must remember to run.

**Measured, so this is not merely asserted.** `ReferencePlane` in the component document
(`packages/file-format/src/family-schema.ts` — a FROZEN legacy filename under ADR-0376 D5) already carries `id`, `origin`,
`normal` and `isHost`: identity, position, orientation and a host flag — **the first four of spec
§27's eight axes, already on disk.** Its four-axis reachability:

| Axis | Reading |
|---|---|
| import / construction | **YES** — schema, plus a store and commands in the rival SPA |
| bus verb | **YES, in the rival runtime only** (`apps/component-editor`) |
| build graph | **NO** — nothing outside `apps/component-editor` imports it |
| call | **ZERO production callers** — `isHost` is written by **two test files** and read by **nothing**; `bakeFamilyInstance` never consults `referencePlanes` |

⛔ **So `ReferencePlane` is a HARVEST candidate under ADR-0376 D1, not a shipping mechanism, and this
contract does not claim it works.** It is cited as evidence that the pose axes are already modelled
somewhere — not as a dependency.

### §2.4 — DEFERRED: free connectors, direction, compatibility — each with its trigger written in advance

Recorded **in advance** so it cannot be rationalised later (the C74 §4.2 discipline).

| Deferred | Trigger that unparks it |
|---|---|
| **Free connector** (stored position + orientation) | The first element family with a **routed run whose ends must be proven to join** — a pipe end that no element hosts. |
| **`direction`** (flow: supply / return / in / out) | The same trigger. Direction is meaningless without a routed system; a window insertion has no flow. |
| **`compatibility`** beyond host-class matching | The same trigger, and it is **concrete**: `packages/schemas/src/elements/Plumbing.ts` already carries `diameter` (*"outer diameter, metres"*) and `systemTag` (*"fluid system tag, e.g. `cold-water`, `waste`"*). **Those two fields are exactly what a compatibility rule would match on.** When a writer must refuse a `waste` end joined to a `cold-water` end, this axis becomes REQUIRED — and not before. |

⚠ **`plumbing` is a real element family today (C99), but it has no routing, no run topology and no
end-to-end join.** The trigger is genuinely ahead of us, not already met. Stating the distance
honestly is the point: a contract specifying flow direction today would be specifying against nothing.

### §2.5 — Dimensions: the DEMANDED VOID, and only that

A connector's normative dimension today is **the void it requires its host to provide**. That is
already modelled: the wall `Opening` record carries `width`, `height` and `sillHeight`, in metres.

⛔ **A connector may not mint a second width/height for the same opening.** It **declares a demand**;
the host's `Opening` record remains the single authority for the void actually cut. Where a declared
demand and a cut void disagree, **the cut void is the fact** and the disagreement is a refusal (§7),
never a silent reconciliation.

⚠ **The demand is expressed for ONE host surface only.** C15 §0.1.1 measures that
`packages/schemas/src/elements/Wall.ts` is the only element schema declaring an `openings[]` array,
with `Opening.type` limited to `window | door`. `OpeningData`
(`packages/core-app-model/src/stores/OpeningTypes.ts` — `{ type:'opening', hostId, profile, depth?,
baseOffset? }`) is a **separate**, store-side mechanism. ⛔ **Do not read C15 §0.1.1's slab/roof rows
out of this contract** — the audit records them as false and Phase 3C owns the correction. **C112
asserts nothing about slab or roof host surfaces.**

---

## §3 — IDENTITY, and the keying rule — PROVEN, in both directions

Spec §7 requires ids that survive recomputation, save/load, undo/redo and AI modification.

**§3.1 — A connector has a stable id, minted once on the definition.** Not derived from its index in
an array, and not from its name.

**§3.2 — ⭐ THE KEYING RULE — the one normative claim here that was EXECUTED rather than argued.**

Two different connectors may join the same two components. The graph must hold that as **two facts**.

`SemanticGraphManager.addRelationship` is idempotent on `(sourceId, targetId, type)` **unless the
caller supplies `authoredBy`**, in which case identity widens to
`(sourceId, targetId, type, authoredBy)` — the `§FIX-CONNECTEDBY-EDGE-KEYING` mechanism. **A
connector edge's endpoints are the two components; the connector itself appears nowhere in them.**
That is exactly the membership test `AUTHOR_KEYED_RELATIONSHIP_TYPES` documents, and `connectsVia`
passes it precisely as `connectedByStair` does.

⛔ **THEREFORE: a connector edge MUST carry `authoredBy: <connectorId>` from its first writer.**

**Executed 2026-09-01 against `SemanticGraphManager` at HEAD — six arms, including a scramble
control, because a probe that cannot fail proves nothing:**

| Arm | Result | What it establishes |
|---|---|---|
| 1 — two connectors, **unkeyed** | **1 edge**; both writes returned the **same id** | ⛔ The collapse is REAL. The second connection is silently lost. |
| 2 — two connectors, **`authoredBy`-keyed** | **2 edges**, distinct ids | The fix works. |
| 3 — re-write connector 1 | **same id**, still 2 edges | ⭐ Idempotency is **preserved per connector** — the fix does not degrade into "always insert". |
| 4 — real JSON round-trip | `loaded: 2`, `dropped: 0`, `authoredBy` = `["conn-1","conn-2"]` | **`authoredBy` SURVIVES serialize → wire → deserialize.** |
| 5 — re-write after reload | still **2 edges**; matched the existing one | Identity is intact *after* a reload — the thing that fails if the wire drops the key. |
| 6 — **scramble control**: strip `authoredBy` at the wire, replay arm 2 | a subsequent write **collapsed onto an existing edge** | ⭐ The probe **can** fail; arms 2/4/5 are therefore meaningful. |

⭐ **Arm 6 also sharpens the failure mode, and the sharpened form is what §5 is built on.** Stripping
the key at the wire does **not** merge the already-persisted rows — they keep distinct `id`s and both
load. It makes them **indistinguishable to every subsequent write and to delete**. The damage is not
a lost row; it is a **stranded survivor**.

---

## §4 — The `connectsVia` edge: the four C71 §2.6 obligations, stated and NOT discharged

⛔ **C112 does not add `connectsVia` to `RelationshipType`.** C71 §2.6 requires all four elements in
**one PR**, and a writer-first addition exits 3 (C71 §2.5, enforced by the §8 gate). This section is
the specification that PR must satisfy.

| C71 §2.6 element | What the `connectsVia` PR must carry |
|---|---|
| **1. a writer** | The command that joins two components. It MUST pass `authoredBy: <connectorId>` (§3.2) **and** carry the connector id in `metadata` — §5 explains why both are required and not redundant. |
| **2. a typed reader** | **Spec §35 query 7** — *"components connected to this MEP connector"* — as a **typed** query, not an untyped sweep (C71 §1.3 excludes untyped sweeps from coverage). §6. |
| **3. rebuild disposition** | **Persist-only, and added BY NAME to the persist-or-lose ledger.** A connection is an authored fact; nothing can re-derive it from geometry. ⛔ **Proximity is not a rebuild rule** — two pipe ends that happen to touch were not necessarily connected, and inferring the edge fabricates provenance. |
| **4. delete behaviour on both endpoints, and what undo restores** | §5. |

---

## §5 — DELETE, and a measured gap the endpoint indices cannot close

**Measured at HEAD:** `SemanticGraphManager` maintains exactly **two** indices — `_bySource` and
`_byTarget`. **There is no index on `authoredBy`.** `removeAllRelationshipsForElement` collects ids
from those two indices only.

⛔ **Consequence, and it is the whole of this section: deleting the CONNECTOR does not remove its
edge.** A connector is not an endpoint of its own edge, so the endpoint purge cannot see it. The edge
left behind names a connector that no longer exists.

⛔ **And the naive repair is worse than the defect:** purging by endpoint id would tear down **every
other** connector's edge between the same two components — the over-purge C71 §5.6 warns against.

**THE RULE — reusing an existing, named, shipped mechanism rather than inventing one:** a connector's
delete path MUST remove its authored edges **edge-wise**, following
**`§FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES`** in `DeleteStairCommand`, which solves this exact shape one
family over: it scans the endpoints' relationships and matches on the authoring element recorded in
`metadata`.

**This is why §4 obligation 1 requires the connector id in BOTH places:** `authoredBy` is what keeps
the two edges apart **at write time** (§3.2); `metadata` is what the edge-wise purge matches on **at
delete time**. Dropping either one breaks a different half.

**Undo** restores the purged edges **verbatim from a pre-delete capture**, including `authoredBy` —
the `DeleteStairCommand` disposition. An undo that re-derives the edge instead of restoring it loses
the key and re-collapses the pair.

> ⚠ **A STALE COMMENT THIS CONTRACT MUST NOT INHERIT — reported, not fixed here** (outside this
> lane's file ownership). `DeleteStairCommand`'s `§UPSTREAM-LIMITATION` docblock still reads *"NOT
> fixed here … two stairs joining the SAME level pair collapse onto ONE `connectedByStair` edge — the
> second create is a silent no-op"*, citing `stairDeleteLeavesGraphEdges.test.ts` as its assertion.
> **That test file records the opposite**: `§UPSTREAM-LIMITATION — **CLOSED** by
> §FIX-CONNECTEDBY-EDGE-KEYING`, with an arm named *"two stairs on one level pair now produce TWO
> DISTINCT edge pairs — the collapse is closed"* — and `CreateStairCommand` does pass
> `authoredBy: stairId`. The source comment is **stale in the pessimistic direction** and points at a
> test that contradicts it. ⛔ **A future connector author reading that docblock would conclude the
> keying mechanism does not work and would build a rival.** Its opening mechanism sentence
> (*"`addRelationship` … IGNORES metadata"*) remains true; the consequence it draws is false.

---

## §6 — The machine-reasoning goal (spec §35), and what "answerable" may mean

The subsystem exists to make one question answerable **without inspecting rendered geometry**:

> *"components connected to this MEP connector"*

**§6.1 — The query is BY CONNECTOR, and that is the whole difficulty.** The connector is not an
endpoint of its own edge, so the query cannot be served by `getRelationships(elementId)` alone; it is
served by matching the authored key. ⛔ **A reader answering "what is component A connected to" is
NOT this query** and may not be counted as its typed reader under C71 §2.6 element 2.

**§6.2 — "nothing" and "I could not tell" are DIFFERENT VALUES.** C71 §4.4 and C78 §1.4 already rule
this for the graph and it applies here without amendment: a connector with no `connectsVia` edge is
**unconnected**; a connector whose edges could not be read is **NO ANSWER** and must be a typed
refusal. ⛔ Returning `[]` for both is the defect this repository has already paid for in `hosts`, in
`boundedBy`, and across the context-data family.

**§6.3 — ⛔ Answerable means answerable AT THE LAYER THE USER EXPERIENCES.** A test's name is not
evidence. The §35 query is proven by a read-back from the **authoritative** store after a real
dispatch — never from a DTO store the handler itself wrote, and never from a pure function's return
value.

---

## §7 — Refusals: both numbers, always

Per C16 CA-18 and C74, every refusal names **the reason AND the route back**, and where two
quantities disagree it names **both**.

| Situation | Required behaviour |
|---|---|
| Connector demands a void the host cannot provide | ⛔ **REFUSE, naming both numbers** — *"this connector needs a 1.80 m clear opening; this wall offers 1.40 m."* Never shrink the demand; never widen the host silently. |
| `allowedHostClasses` does not admit the proposed host | ⛔ **REFUSE, naming the classes it does admit.** |
| `allowedHostClasses` is **missing** (not declared) | ⛔ **REFUSE as UNKNOWN — not as "joins nothing".** §2.2. |
| Declared demand disagrees with the cut void | ⛔ **REFUSE and report both.** The cut void is the fact (§2.5); silent reconciliation writes a lie into the model. |
| A second connection between the same two components | ✅ **PERMITTED — it is two facts** (§3.2). A writer that silently no-ops here is the defect arm 1 measured. |

---

## §8 — Gate

**No new gate.** Enforcement routes to **`tools/ga-gate/check-graph-write-coverage.ts`** (C71 §6 ·
C70 C-INV-1 / C-INV-4), which already exists and already covers exactly the four §2.6 obligations.

**Executed 2026-09-01 — foreground, redirected to a file, `$?` read immediately (never piped to
`tail`, which returns `tail`'s exit code):**
`npx tsx tools/ga-gate/check-graph-write-coverage.ts` → **RC=0** ·
`[0] CLEAN — 0 findings, hard-0, no baseline` · C-INV-4 ratchet **0 findings against a NAMED ledger
of 0** · 53 cascade-purge sites.

⚠ **What this gate CANNOT tell you, in its own printed words — and therefore what C112 may not
claim:**

- *"runtime reachability — a writer that exists but is never reached counts as **PRESENT**."*
- *"correctness — a writer emitting the **WRONG** edge passes every arm."*
- move-time invalidation has **no arm here**, and no static arm is possible.

⛔ **A green reading of this gate is NOT evidence that a connector edge is reachable or correct.** The
§6.3 read-back at the user-facing layer is the evidence; the gate is the floor beneath it.

---

## §9 — What is ABSENT — declared, so a blank is never read as a clearance

C84 EI-6. Every row is a **declared absence**, not a routed one.

| Absent | State |
|---|---|
| Any connector type, schema, store or verb | **UNBUILT** — §0.2, 0 on all four reachability axes |
| `connectsVia` as a `RelationshipType` member | **DELIBERATELY NOT ADDED** — §0.3 item 2 · §4 |
| A connector UI | **UNBUILT and out of scope** — §77 forbids UI before the model is clear |
| MEP elements, routed systems, run topology | **UNBUILT** — `plumbing` has `diameter` + `systemTag` and no routing (§2.4) |
| An `authoredBy` index on the graph | **ABSENT and NOT PROPOSED** — §5 solves delete with the existing edge-wise precedent instead |
| A production reader of `ReferencePlane.isHost` | **ZERO** — written by two test files, read by nothing (§2.3) |
| Slab / roof host surfaces | **NOT ASSERTED HERE** — C15 §0.1.1 is under correction by Phase 3C (§2.5) |

**Status: CANONICAL — deliberately NOT ACTIVE.**

⭐ **EXIT CONDITION to ACTIVE:** the Phase-6C PR lands `connectsVia` with all four C71 §2.6 elements;
`check-graph-write-coverage` stays **RC=0** with the new member counted; and the spec §35 query-7
read-back of §6.3 passes **at the authoritative store**. Until then this contract governs a subsystem
that does not exist, and it says so on every page rather than implying otherwise.
