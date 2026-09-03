# ADR-0380 — The space envelope is ONE family with TWO authored roles, and the legal ceiling is not one of them

**Status:** ACCEPTED · **Date:** 2026-09-03 · **Lane:** ENVELOPE-ELEMENT
**Authority:** the founder directive
[`STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`](../../01-strategy/STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT.md)
(received 2026-09-03, committed `2ddfb560`), whose §6 names five questions and says, in terms,
that they **must not be decided implicitly in code**. This ADR decides them.
**Measured base:** [`RESI-ORCHESTRATOR-PLAN`](../../03-execution/plans/RESI-ORCHESTRATOR-PLAN.md)
§0 / §10–§12 — the independent inventory that found the same gap.
**Spawns:** [`C114`](../contracts/C114-ELEMENT-SPACE-ENVELOPE.md) (the C84 §6 per-element
contract, without which C84 forbids the family: *"A new family may not be added while its
per-element contract is absent"*).

> Each ruling states the decision, why it is the *architecturally sound* one rather than the
> convenient one, and **what would falsify it**. Where a ruling declines to build something the
> directive asks for, it says so in its own words rather than quietly scoping it out.

---

## D1 — THE ROOM-ENVELOPE IS A **NEW KIND**, NOT `Room` WITH A NEW `boundaryMode`

The founder left this open (*"and maybe that ARE rooms"*). It is the largest decision here because
it reaches `IfcSpace` identity, C84's per-element block, and whether `multiLevelSpan` un-pins.

**RULING: a new element kind, `spaceEnvelope`. It is NOT `Room`, and it does not extend `Room`.**

**Why — three measured reasons, not a preference.**

1. ⭐ **`Room` has a subsystem whose job is to RECOMPUTE it from walls, and it runs after undo.**
   C84 **EI-7e**, measured: *"`RoomTopologyObserver` is merely paused around undo and discharges
   the suppressed commits on `resume()` (`:513-520`) — so after any wall undo, room boundaries are
   recomputed from the post-undo wall set, not restored."* A wall-free volume placed in the room
   store would be **recomputed away by the room detector**, and the recompute is the *correct*
   behaviour of that subsystem. A `boundaryMode: 'envelope'` member would therefore need every
   room consumer to learn a mode in which the family's own derivation engine must not run — which
   is EI-9's *"one answer per question"* broken from the inside: `boundaryMode` would decide
   whether the room detector owns the record.
2. **The directive requires ONE primitive across the types, and `Room` cannot carry the LEVEL
   type.** §2.1: *"The same primitive serves both the legal ceiling and the design intent
   underneath it."* A **level envelope** is not a room under any reading. Making type C a `Room`
   and type B a new kind would split the founder's one primitive across two element models, and
   the containment relation (room ⊂ level) would then be a cross-model reference — the exact shape
   C106 §0.2 exists to keep three different "lines" from becoming.
3. **IFC identity is not the same fact.** `room → IfcSpace` (`core-app-model/src/CoreElement.ts:96`)
   asserts a bounded space in a building. A design-stage volume placed before any bounding element
   exists is not that, and stamping it `IfcSpace` would export a design study as building fabric.
   C114 §9 records the mapping question as **NOT MEASURED** rather than guessing — but whatever it
   resolves to, it is a *different* answer from `Room`'s, which is by itself sufficient to keep the
   records apart (C84 EI-1).

**And the founder's "maybe they ARE rooms" is honoured as a VERB, not as a shared record.** A room
envelope **promotes** to a `Room` (`spaceEnvelope.promoteToRoom`, C114 §6, deferred to Stage H).
Design intent and built result are two states of one design, not one record in two costumes —
which is also what makes C80's authority question (*may this pass replace this?*) answerable at
all: you can only ask it if the two things have separate identities.

**Falsifier:** a measured consumer that must treat a room envelope and a room identically and
cannot be given a shared *read* projection (`RoomContents`-shaped) to do it. None found: every
room consumer surveyed reads `roomStore` for a boundary the room detector owns.

**Consequence recorded, not hidden:** `Room.multiLevelSpan` **stays pinned `null`**. This ADR does
not un-pin it. A room envelope spanning levels is expressed as `role: 'level'` envelopes stacked by
`withinId`, and the `Room` question is untouched. Un-pinning it would be a C94 amendment with its
own blast radius, and nothing here needs it.

---

## D2 — THE FAMILY IS **ONE KIND WITH A `role`**, AND `maximumBuildable` IS DECLARED BUT NOT MINTABLE

Two questions, answered together because the second only makes sense given the first.

**RULING 2a: ONE element kind, `spaceEnvelope`, carrying a closed `role` union — not two kinds.**

C83 §2.1 states the cost directly: *"A new element kind must not require 30 new decisions."* Two
kinds would mean two C84 twelve-section contracts, two stores, two undo adapters, two persistence
legs, two IFC dispositions and two entries in every family census in the repository — for two
things that differ **only in semantic role**. And C83 §2 is the standing instruction for exactly
this: *"Rules key on ROLES, not on element kinds."* A level envelope and a room envelope share
every geometric and behavioural axis the directive names — prismatic volume over a footprint,
face-draggable, contained, solar-exposed, level-seated, boundary-measured. What differs is what
each one *means*, and meaning is a role.

**RULING 2b: `role: 'maximumBuildable'` is a DECLARED member of the union, and `spaceEnvelope.create`
REFUSES it by name. Type A is NOT promoted to an authored element in this slice.**

This declines part of the directive, and the reason is the honesty constraint the directive itself
ends on (§7).

- **An editable maximum-buildable volume is a legal claim a user can drag.** PRYZM's ratified
  position is *"a STUDY, not a permit"* (C58 / C74 / C75, `CONTEXT_DERIVED_STUDY_STATUS`,
  `EnvelopeConfidence`). The moment the legal ceiling is an authored record with a face gizmo, the
  product renders a volume it describes as the *legal* ceiling which **the law did not produce and
  the provenance chain cannot explain**. That is [`§ENVELOPE-SOLID-OVERSTATES-PARTIAL-DATA`](../../04-reference/ISSUE-LOG.md)
  (L-616) with a drag handle attached.
- **It would mint a second authority for one question** (C84 EI-1). `BuildableEnvelope` is solved
  by the zoning engine; an `spaceEnvelope` record for the same volume is a rival, and EI-5a is
  explicit that mirroring two representations where one has no readers *"makes both copies
  authoritative and neither trustworthy"*.
- **The directive itself scopes the new behaviour away from A** — *"not the maximum buildable
  volume envelope but other kinds"* — so face-drag was never asked for on it.

**Why DECLARE the member at all rather than omit it.** A verb payload is a wire identifier
(C69 §1.1) and a persisted `role` value is a file-format value (C47). Adding a member to a closed
union **later** is a migration; declaring it **now**, with a refusal that names its reason, costs
one refusal string. The refusal is the correct answer, not a gap (C16 `CA-DOCTRINE-A`), and no UI
offers the gesture — which is the half C84 EI-3 actually polices.

**How A participates without being an element:** as the **constraint reference** the other two
roles cite. A `spaceEnvelope` carries `withinId: SpaceEnvelopeId | null` for envelope-in-envelope,
and the maximum-buildable study is reached through the *existing* solve, never through a record.

**Falsifier:** a jurisdiction where PRYZM cannot solve the envelope and an architect must draw the
legal ceiling by hand. That is a real case — and the correct answer to it is a **`role: 'level'`
envelope carrying a declared study provenance**, not an authored record that calls itself the law.
If a lane can show a consumer that needs the authored volume to be *typed* as the legal ceiling,
this ruling is wrong.

---

## D3 — `UBG_EDGE_TYPES` IS **NOT EXTENDED**, AND THE MEASUREMENT SAYS IT DOES NOT NEED TO BE

The directive asks the envelope to know *"which other envelopes are within it, around it, and on
top of it"*. Three candidate relations; the closed 10-member tuple looked like their home.

⭐ **First, a correction to the brief's own premise, measured 2026-09-03.** The brief (and this
lane's opening assumption) treated *"envelope enters the living graph"* as requiring a vocabulary
change. It does not. **`UbgNodeSchema.kind` is a free `z.string()`** —
`packages/building-graph/src/types.ts:56-59`: *"A free string so the substrate is
typology-agnostic; **adapters own the vocabulary, the UBG core does not constrain it**."* A new
element kind costs the graph **zero schema edits**. What it costs is three small table rows, and
they are in the *editor*, not the graph package:
`kindFromId`'s `KNOWN` set (`apps/editor/src/engine/buildBuildingGraph.ts:922` — omit it and every
envelope node renders as the generic label `"Element"`), a `FAMILY_DISCIPLINE` row
(`packages/building-graph/src/discipline.ts:150`, bucket `spatial`, **both singular and plural
keys** — the census says the plural and the graph says the singular), and `CONNECTIVITY_TYPES`
(`buildingGraphMaintainer.ts:186`) **only if** the kind changes room connectivity, which an
envelope does not.

**RULING: mint no new `UBG_EDGE_TYPES` member. Two of the three relations are ALREADY in the closed
tuple; the third is derived and gets no edge at all.**

| relation | kind of fact | home |
|---|---|---|
| **within** | AUTHORED — the user says this room envelope belongs to that level envelope | `withinId` on the record, projected as the **existing `bounds`** edge (its documented meaning is *"A spatially bounds B (wall bounds room)"* — a level envelope bounding a room envelope is that sentence) |
| **around** (adjacent) | DERIVED — a function of two footprints and a tolerance | the **existing `adjacentTo`**, projected from geometry, never authored |
| **on top of** | DERIVED — a function of two `[base, top]` intervals plus footprint overlap | **no edge.** Computed on demand |

**Why no `stackedOn` member, given the other two fit.** C71 §2.5 forbids a writer-first addition
outright (*"writing edges nothing reads is how `sitsOn` spent months as measured-but-meaningless
coverage"*) and §2.6 requires a new member to land with a writer, a typed reader, a rebuild
disposition **and** a delete behaviour in one PR. Storing a derived predicate is a **cache**, and a
cache is a second answer to a question the geometry already answers (C84 EI-9). The last family to
hit this exact wall chose the same exit and wrote down why:
`plugins/boundary-line/src/handlers/AttachToBoundaryLine.ts` — *"it is **NOT** a
`RelationshipType` graph edge … An element-record reference field is a DIFFERENT mechanism, the one
`Pool.hostSlabId`, `Balcony.childrenIds` and `Lift.servedLevels` already use … Minting `boundOn`
would have been the rival vocabulary C84 EI-8 rules out."*

**Falsifier:** a consumer that must traverse envelope stacking at a scale where recomputation is
too slow. That is a `packages/spatial-index` problem (the index exists), not a vocabulary problem —
and if the index cannot serve it, the edge earns its place under C71 §2.6's full four-part rule.

---

## D4 — EXACTLY **ONE** ENFORCEMENT REFUSAL. THE CONTAINMENT VERDICTS ARE ADVISORY, AND THAT IS THE POINT

The directive names three candidate refusals. C83 §1.1's test is not severity — it is **"can
context reverse it?"** — and C83 §1.3 forbids inferring the verdict from magnitude.

| Proposed state | Verdict | Why |
|---|---|---|
| A face drag that would **invert or collapse the solid** | ⛔ **IMPOSSIBLE / ENFORCEMENT** — refuses at the command seam | Two mutually exclusive claims about one volume. No site, no brief and no user preference makes a negative-thickness prism correct. C83 §1.2's exact test: *"A rule that can never be wrong may refuse."* |
| A **room envelope outside its level envelope** | **INADVISABLE / ADVISORY** — reported, never refused | Buildable and internally consistent. It usually means *the level envelope needs to grow*, which is a design act, not an error. Refusing it would make the containment field a cage instead of a relationship. |
| A **level envelope outside the maximum buildable volume** | **INADVISABLE / ADVISORY** — reported, never refused | ⭐ **This is the decisive one.** The maximum buildable volume is a **STUDY, not a permit** (C58/C74/C75). Refusing an architect's edit on the authority of a study PRYZM computed would be the product telling a professional they may not draw something they may well be entitled to build — C83 §1.2's own words for why that boundary sits where it does, and *"the fastest route to being muted"* (§5). |

**Every one of the three carries BOTH numbers** — the founder's standing direction and C74's
requirement — read from the geometry, never re-typed: *"this face would put the envelope 1.42 m
outside the level envelope, whose nearest face is at 8.10 m."*

**The ENFORCEMENT row is a C74 §2 CONTRACT EDIT, and it lands in the same change.** C83 §1.1.1 is
explicit: *"C74 §2's protected table names exactly one ENFORCEMENT row today … A second one is a
C74 §2 contract edit, in the same PR — it is not a code change with a doc follow-up."* C114 §12
carries the row; C74 §2 is amended by this lane.

**The refusal vocabulary EXTENDS, it does not rival** (C83 §1.4). Geometric self-contradiction gets
a closed `SpaceEnvelopeRefusalCode` union with a value roster, a compile-time completeness
assertion and a `Record<>`-typed sentence per member — the `CanPlaceRefusalCode` pattern C83 §1.4
says to *"adopt wholesale"*. It is a separate union rather than a seventh `CanPlaceRefusalCode`
member because `canPlace` is about **wall occupancy**, and a code about envelope solidity in that
union would widen a wall concept to mean "any spatial refusal".

**Falsifier:** a measured case where an advisory containment finding is ignored so often that the
resulting model is unusable downstream. Then the fix is C83 §5.4's honest-dismissal path, or a
generation-time constraint — **not** promoting an advisory to a refusal, which C83 §1.3 forbids
doing by threshold.

---

## D5 — THE ENVELOPE DOES **NOT** FEED `measureAuthoredDesign`. THEY ANSWER DIFFERENT QUESTIONS, AND MERGING THEM WOULD LAUNDER INTENT INTO MEASUREMENT

The brief asked whether the level envelope's per-level gross area should feed the existing GFA
authority (`apps/editor/src/ui/site/designMeasurement.ts measureAuthoredDesign`) or compute its
own, noting that *"two GFA authorities would be a defect factory"*.

⭐ **Measured 2026-09-03, and it inverts the obvious answer.** Structurally, feeding it is trivial:
`measureAuthoredDesign` is pure, takes a plain `AuthoredModelSnapshot`, and its
`AuthoredFloorPlate.ring` is `readonly XZVertex[]` — **the same scene-XZ frame** as
`BuildableEnvelope.insetPolygon`. No projection needed. **The blocker is semantic and it is the
whole reason that file exists** (header, `designMeasurement.ts:41-52`): *"GFA is summed from REAL
floor plates, per level. No storey multiplication, ever"* and *"Footprint is the REAL ground-storey
plate. It is never approximated from the envelope."*

**RULING: `measureAuthoredDesign` stays exactly as it is and gains no envelope input. The level
envelope publishes an INTENDED area on its own, separately named channel, and the two numbers are
never summed into one.**

**Why this is not "two GFA authorities".** It is one authority per *question*, which is what C84
EI-9 actually requires:

| question | authority |
|---|---|
| *"How much floor area has been BUILT?"* | `measureAuthoredDesign` — measured off real plates, refusing (`overlapping-floor-plates`, `unattributed-floor-plate`, `no-floor-plates`) rather than guessing |
| *"How much floor area is INTENDED?"* | the level envelope's own footprint area × its own membership |
| *"How much is PERMITTED?"* | `BuildableEnvelope` — unchanged, and neither of the above may restate it |

Collapsing the first two would make the panel's headline built-area number **change when nothing
was built**, which is `§CONTEXT-DATA-HONESTY` at the single number the whole feasibility panel
turns on. It is also the defect `L-456` was written to stop, arriving through a new door.

**The precedent for the shape is already ratified and is followed exactly.**
`CONTEXT_DERIVED_STUDY_STATUS` (`packages/schemas/src/site/zoning/ContextDerivedStudyEnvelope.ts:54`)
became **its own standalone schema with a one-member status literal** rather than a seventh
`EnvelopeConfidence` tier or a fifth `EnvelopeStatus` member — its header says why: the existing
enums are *"CI-gated, contract-bound closed enums with consumers that key decisions off them
directly"*. A new honesty class gets a new channel; it does not get smuggled into an old one.

⚠ **What this lane does NOT do, and it is owed.** The *presentation* join — showing intended and
built side by side, with the delta, in one panel — lives under `apps/editor/src/ui/site/**`, which
lane RESI-ORCH owns. C114 §11 carries it. Building it here would be the cross-lane edit this lane's
rules forbid.

**Falsifier:** a consumer that genuinely needs one blended number and can state, in units, what it
means. None found — every consumer surveyed wants to know *which* it is looking at.

---

## D6 — THE FACE-DRAG **FORKS** `WallMoveReweld`'s SHAPE; IT DOES NOT INSTANTIATE IT — AND THIS IS A FINDING, NOT A CHOICE

Recorded as a ruling because the brief instructed reuse and the measurement refuses it.

**MEASURED 2026-09-03, `packages/geometry-wall/src/WallMoveReweld.ts` (2207 lines):** the module
has **no type parameter anywhere**. Its entry field is `wallId`, its input types are
`MoveReweldMovedWall` / `MoveReweldPartner`, its authorship bands are derived from **wall
thickness** (`cornerBandM = t/2 + COINCIDENT_M`), and it imports `DEGENERATE_STUB_LENGTH` from
`WallJoinResolver`. ⭐ **The decisive evidence is the repository's own precedent: curtain walls
needed the whole engine FORKED**, not a type argument —
`packages/geometry-curtain-wall/src/CurtainWallMoveReweld.ts` declares a parallel vocabulary
(`CurtainMoveReweldMovedWall`, `computeCurtainWallMoveReweldCensus`, …), and
`engineLauncher.ts:1027-1028` states the measurement in its own comment: *"no `CurtainWall`
reference anywhere in `WallMoveReweldService.ts` / `WallMoveReweld.ts`"*.

**RULING: the envelope face-move reuses the DISPATCH SHAPE — one command per gesture, a census that
separates `entries` from `refusals` from `notApplicable`, `IMPOSSIBLE | INCUMBENT` grounds, a
service that latches re-entrancy and coalesces drags — and implements its own solver.** A prism
face is not a baseline: it moves along its own normal and its neighbours are the four faces sharing
its edges, which is a different problem from re-welding a junction between two centrelines.

⛔ **What this ruling forbids is a THIRD shape.** The fork copies the *contract* — the census
triple, the refusal grounds, the one-command-one-undo dispatch — so that the third family to need
this has two matching precedents to generalise from, not two dialects.

**Falsifier:** a refactor that gives `WallMoveReweld` a real type parameter over `{id, geometry}`
and proves it on curtain walls first. That would be the right fix and it is strictly larger than
this lane; it is recorded as owed in C114 §11.

---

## What this ADR deliberately does NOT decide

- **The IFC mapping** for a space envelope (`IfcSpatialZone` is the plausible candidate; C114 §9
  carries it as **NOT MEASURED**, per C84 §6's rule that an unverified claim is a finding rather
  than a gap).
- **Whether `role: 'maximumBuildable'` is ever minted.** D2 reserves the slot and refuses the verb;
  promoting it is a later ADR with C58/C74/C75 at the table.
- **The promotion verb's semantics** (`spaceEnvelope.promoteToRoom`) — that is C80's
  *"may this pass replace this?"* question and belongs with Stage H.
