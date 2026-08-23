# ADR-0348 — A construction line is a HOST, and what cannot follow it is NAMED

- **Status:** Accepted
- **Date:** 2026-08-23
- **Lane:** BOUND43
- **Supersedes:** nothing. **Mints:** `C106` (Element: Construction Boundary Line).
  **Amends in place:** nothing — C84 §EI-PROP-a already required a new family to state
  its row, and this ADR is that requirement being met rather than a change to it.
- **Adds:** `packages/geometry-boundary-line/**`; `plugins/boundary-line/**`;
  `packages/command-registry/src/boundaryLine/**`;
  `packages/schemas/src/elements/BoundaryLine.ts`;
  `apps/editor/src/engine/views/plantools/BoundaryLinePlanToolHandler.ts` +
  `activeBoundaryLineDrawMode.ts`;
  `ElementGraphicsRules.solid`.
- **Contracts:** **C106** (this element), **C84 §EI-PROP** (a dependent adapts or refuses
  by name) + EI-1/EI-5/EI-8/EI-9, **C19 §1.4** (the parcel boundary — deliberately NOT
  touched), **C71 §2.5/§2.6** (why no graph edge was minted), **C72 §9.1**, **C74**,
  **C79 §4.4** + **C75** (provenance — why three families refuse), **C81**, **C100**,
  **C09/P7**, **C11**, **C16**, **C104 R-10** (pointer-layer admissibility), C08/P8, P5, P6.
- **Issue-log:** L-7900 … L-7980.
- **Builds on:** **ADR-0344** (*"when a host moves, every dependent either ADAPTS or
  REFUSES BY NAME — silence is a defect, not a default"*) and **ADR-0345**, which applied
  that rule to the LEVEL. This ADR applies it to a **second** host, and the value of doing
  so twice is that the SHAPE is now demonstrably reusable rather than level-specific.

---

## 1 · Context — the founder asked for a line that things hang off

> *"New feature — create a **construction boundary line** element (under the
> **Architecture** tab). We have the side-line boundary from the parcel, but I want to be
> able to create the **boundary construction line**. After creating it, I could ask via
> **RAC**: 'create a 3-bedroom apartment on this boundary line' … The UI should be **like
> the wall, with the same modes for creation — line, ortho, rectangle, ellipse, curve,
> circle** etc. … **if the user moves the boundary line and this line had slabs and walls,
> they should move, adapt, propagate with all elements!!** It is a simpler way of design
> for **early-stage design**. The line could **have volume** also, via a **bool setting on
> Visibility Intent** (it should have a **category** there too — everywhere!)."*

Four requests, and only one of them is hard.

---

## 2 · Decision 1 — it is a NEW family, and the first thing the contract says is what it is NOT

**C106 §0.2 comes before any specification**, because a reader who conflates two of these
three will write through a legal document with an ordinary edit gesture:

| | who owns it | mutable? | hosts? |
|---|---|---|---|
| `Parcel.boundary` | the SITE subsystem (C19 §1.4) | ⛔ **NO — one-shot immutable; there is deliberately no `site.editParcelBoundary`** | no |
| `RoomBoundingLine` | room DETECTION | yes | no |
| **`BoundaryLine`** | the architect | ✅ yes | ✅ **yes** |

The founder's own sentence draws the distinction — *"we **have** the side-line boundary
from the parcel, **but** I want to create the boundary construction line"* — and §0.2-a
turns it into a rule: no code in this family may read, write, extend or derive from
`Parcel.boundary`.

⭐ **`RoomBoundingLine` was found by looking, not by luck.** A repository this size will
usually already contain something with a similar name, and shipping a third line without
tabulating the other two is how a vocabulary acquires two words for one concept — or, far
worse here, one word for two.

---

## 3 · Decision 2 — the propagation mechanism is a PARAMETRIC ANCHOR (NORMATIVE)

A dependent's world pose is **never stored against the line**. The attachment stores
`(segmentIndex, t, signed offset)`.

- Evaluate the anchor against the **OLD** line → where the dependent is.
- Evaluate the **SAME** anchor against the **NEW** line → where it must go.

**The move is therefore a re-evaluation, not a synchronisation someone has to remember to
run.** That single choice is what makes the founder's *"they should move, adapt,
propagate"* a property of the model rather than a subscriber somebody has to keep alive.

Two details are load-bearing and both were chosen against a plausible alternative:

- **The offset is SIGNED.** A wall drawn 150 mm inside the boundary stays 150 mm inside
  it, on the same side. An unsigned distance would mirror every inset wall to the outside
  on the first move — and would have passed a "the wall moved" test.
- **The projection is CLAMPED to the segment.** A point beyond an end belongs to the end.
  Unclamped, a dependent would fly off a shortened line instead of riding its new corner.

### 3.1 · The edge lives on the HOST, and it is not a graph edge

C84 EI-PROP-d requires the record to hold an edge to walk. Two placements were possible:

- ✗ a `boundaryLineId` field on Wall, Slab, Column, Beam, Roof, Stair, Furniture and
  Plumbing — **eight** L0 schema amendments across the C85–C99 block for ONE host, eight
  places that can disagree, eight contracts to amend;
- ✓ **one `attachments[]` array on the boundary line** — one record, one contract, and the
  host can answer *"what is on me?"* without scanning every store, which is the question
  the propagator actually asks.

⛔ **And it is deliberately not a `RelationshipType`.** C71 §2.6 requires a new member to
land with a writer, a typed reader, a rebuild disposition and a delete behaviour in one
PR; §2.5 forbids a writer-first addition outright, because *"writing edges nothing reads
is how `sitsOn` spent months as measured-but-meaningless coverage"*. An element-record
reference field is the already-blessed mechanism (`Pool.hostSlabId`,
`Balcony.childrenIds`, `Lift.servedLevels`).

### 3.2 · ⭐ Refuse at ATTACH time, not at move time

A family that cannot be carried is refused when the attachment is **recorded**, with the
table's own sentence. **A relationship the system cannot honour must not be recordable** —
that is what makes *"the cascade half-ran and said nothing"* structurally impossible
rather than merely unobserved.

---

## 4 · Decision 3 — the per-family table, and how membership was decided

Membership was decided by **one measured question**, the same shape ADR-0345 used for the
level: **does a command exist that reaches this family's AUTHORITATIVE store?**

"Authoritative" is not a formality. `wall.move` and `slab.updatePolygon` both **exist**
and both write the DETACHED plugin DTO store that nothing renders, exports or persists —
`plugins/wall/src/handlers/MoveWall.ts` refuses `wall.move` for exactly that reason, in
its own words, and `elementMove.ts` had to mint distinct verb names (`slab.movePolygon`,
`handrail.moveBaseLine`) so plugin handlers could not shadow the ones that reach the real
store.

| family | follows? | mechanism / measured reason |
|---|---|---|
| **Wall** | ✅ | `UpdateWallBaselineCommand` — span re-seated from both anchors |
| **Slab** | ✅ | `UpdateSlabPolygonCommand` — TRANSLATED by the anchor's displacement, never re-shaped |
| **Column · Furniture · Plumbing** | ✅ | point translation through each family's own command |
| **Beam · Curtain wall · Handrail/Railing** | ✅ | line families; both endpoints re-seated |
| **Stair** | ✅ | `MoveStairCommand`, which also re-reconciles its carved slab void |
| **Lighting** | ✅ | `MoveLightingCommand`. ⭐ **a corrected verdict — §5** |
| **Door / Window** | ❌ REFUSES | **HOSTED (C15)** — an offset along a wall, not a world point. *"Attach the WALL and the door rides it."* |
| **Roof · Ceiling · Floor** | ❌ REFUSES | their boundary commands require `cause: { wallId, kind }`, documented *"named, never inferred"* (C79 §4.4). **A fabricated `wallId` would write FALSE PROVENANCE** |
| **Room** | ❌ REFUSES | not *cannot* — **must not**. Its polygon records `detectionMethod`; writing it from a line is two authorities over one polygon. A room follows because its WALLS follow |
| **Grid · Level** | ❌ REFUSES | DATUMS. Things are set out FROM them; moving one inverts the hierarchy |
| **Pool · Balcony · Lift** | ❌ REFUSES | COMPOUNDS. Translating a member tears the assembly apart; a lift's voids would be left in mid-air |
| **Annotation · Dimension** | ❌ REFUSES | they belong to a VIEW (C101). A translated dimension reports a length it never measured |

⛔ **NO CELL IS SILENT.** That is C84 EI-PROP-b's target state, reached for a whole host on
the day the family shipped rather than retrofitted later.

### 4.1 · ⭐ Stair PROPAGATES here and REFUSES for a level — and that is not a contradiction

ADR-0345 refuses a stair on a level-**height** change because the storey gap it spans
changed, invalidating its riser count — a re-**solve**, not a translate. A boundary-line
move is horizontal in XZ: the rise is untouched, so `stair.move` carries it. **Two hosts,
two questions, two answers.** Flattening them would be the wrong kind of consistency, and
recording *why* they differ is what stops a later lane "harmonising" them.

### 4.2 · Every PROPAGATES row must be EXECUTABLE, checked both ways

A verdict table can claim a cell nothing can execute. C84 is explicit that such a row is a
**FALSE** ledger entry — worse than the SILENT cell it replaces. So the adapter table is
checked in **both** directions: a verdict with no adapter fails, **and** an adapter for a
family the table refuses fails (that one is a loaded gun — one table edit and doors start
moving).

---

## 5 · ⭐ A refuted verdict, recorded rather than quietly corrected

The first draft of the table **REFUSED lighting**, quoting `MOVE_UNSUPPORTED_REASON.lighting`
from `elementMove.ts` verbatim:

> *"Lighting fixtures have no move command on any surface yet — tracked under Gate G7."*

**That sentence is TRUE of the BUS and FALSE of the command layer**, and the difference
decides the cell. Measured 2026-08-23:
`packages/command-registry/src/lighting/MoveLightingCommand.ts` **exists**, takes
`{ elementId, to }`, and writes the lighting store. What is missing is a
`MOVE_COMMAND_BY_TYPE` row and a 3-D gizmo branch — no **surface** dispatches it. This
cascade dispatches **commands, not bus verbs**, so it reaches the one that exists.

⚠ **Copying the refusal without re-measuring would have shipped a REFUSES cell for a family
that follows perfectly well — the inverse of the "PROPAGATES row that propagates nothing"
defect, and just as wrong.** The lighting row therefore carries **no** `moveVerb`, and that
absence is the honest statement that lighting has no bus route yet. A test pins **both**
halves so a later reader cannot "fix" either one into agreement with the other.

---

## 6 · Decision 4 — ONE undo, and it counts what LANDED

The cascade is one user gesture, so it is one history entry (C81).

⛔ **It deliberately does NOT use `CompositeCommand`.** That class (L-2401) returns
`success: true` **unconditionally in both directions** and counts children *attempted*,
not *landed*. `SetLevelHeightCommand` refused it for the same reason; this command
follows.

The mechanism is **`STRUCTURAL_CASCADE`**: children are dispatched from inside the
parent's `execute()` with that source, and `CommandManagerImpl` (§L-874-ONE-UNDO) folds
them into the spawning gesture's `structuralChildren`. Nothing new is invented — it is
what `SlabWallConnectivityService` and `WallMoveReweldService` already use.

**And the line's own write is verified by RE-READING it back.** A store write returns
`void` and silently no-ops on an unknown id; `success` is `landed === attempted`.

⛔ **The vertex COUNT may not change through a move.** Every attachment stores a
`segmentIndex`, so adding or removing a vertex renumbers the segments and would silently
re-anchor half the dependents to the wrong edge. The command refuses with both numbers and
names the route back. C74 — never clamp, never guess.

---

## 7 · Decision 5 — the volume bool is a PRECEDENCE, not a second authority

> *"The line could have volume also, via a bool setting on Visibility Intent."*

There are two inputs and one answer:

1. the **VIEW's** intent — `ElementGraphicsRules.solid` (C09/P7) — wins where it has an
   opinion;
2. the **RECORD's** `hasVolume` is the fallback.

That is what makes *"massing in the 3-D view, construction line in the 1:100 plan"* **one
model with two views** rather than two models. Naming the precedence is what makes it two
INPUTS to one answer instead of the two-authorities-over-one-pixel collision C84 EI-9
names.

⚠ On the intent side, `undefined` (*no opinion*) and `false` (*this view says linework*)
are **different values and must not be collapsed**. `??` is correct; `||` silently turns
every "this view says linework" into "ask the record".

**And *"a category there too — everywhere"* was made mechanical: EVERYWHERE is SIX places**
(the VG taxonomy key, the intent defaults, the per-view toggle grid, the scene-name map +
its union, the pen table, and the datum set), enumerated in C106 §5.5 so the next family
can copy the list instead of finding the sixth one after a founder report.

---

## 8 · Decision 6 — RAC is scoped honestly, and the open half is not stubbed

- **Addressability — ✅ DONE.** `boundaryLine_<ulid>` is a branded L0 id, the record lives
  in the one store at `runtime.stores.boundaryLine`, and every verb takes it by id.
- **Generator consumption — ⛔ NOT DONE, and deliberately NOT STUBBED.** The apartment
  generator seeds from a level's slab outline; teaching it a boundary-line footprint is
  real work in `ai-host/src/generative`. **L-7961, OPEN.**

⛔ While that is open, the verbs are declared in `CHAT_UNAVAILABLE` with readable reasons
naming the route back to success — never classified-and-dead. **A verb the chat classifies
but that generates nothing is the silent-success shape this repository keeps finding.**

---

## 9 · Consequences

- **One store, and the singularity is measured, not asserted.** This family does not
  inherit the DTO/geometry duality that made `wall.move` unusable. A scanner fails on a
  second store class or a `window` assignment.
- **Reachability is reported on four axes separately**, and axis 3 carries a
  **pointer-layer** proof because C104 R-10 makes the claim inadmissible without one.
- **`DATUM_CATEGORIES` gained a fourth member**, and its exact-set test was updated with
  the reason. The exemption covers the **centreline** only: a boundary line with volume
  has real fabric whose edges obey the ladder like anything else.
- **The commissioned contract number moved.** The lane was told to mint `C105`; a
  concurrent lane's untracked `C105-AI-PROVIDER-CREDENTIALS-BYOM.md` was already on disk
  with its README row added, so this is `C106`. **Two contracts under one number is worse
  than any renumbering**, and it is the one collision the equivalence gate cannot see —
  both files would exist, only one row would. 75 citations across 41 files were renumbered
  in one named pass.

## 10 · What this ADR does NOT establish

- **Persistence.** `BoundaryLine` is not in `SCHEMA_REGISTRY` and the serializer has no
  slice. **Stated as absent rather than inherited** (L-7965).
- **A fragment builder.** `boundaryLineSolid()` returns pure data; nothing renders it yet.
  The volume bool is fully modelled, fully tested, and **draws nothing in 3-D today**
  (L-7966). ⛔ Do not read §7 as a claim that a solid appears on screen.
- **A 3-D creation arm** (L-7934), and **vertex-level dragging** — expressible in the
  payload, with no UI.
- **Beam support re-solve** — a carried beam keeps its `startSupportId` / `endSupportId`
  untouched (C106 §3.5-a).
