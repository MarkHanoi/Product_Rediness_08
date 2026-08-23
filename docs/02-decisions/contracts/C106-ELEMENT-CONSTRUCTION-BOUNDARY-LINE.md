# C106 — Element: Construction Boundary Line

**Status:** CANONICAL
**Minted:** 2026-08-23 (lane BOUND43, `§FEAT-CONSTRUCTION-BOUNDARY-LINE`, L-7900..L-7980)
**Governs:** `packages/geometry-boundary-line/**`, `plugins/boundary-line/**`,
`packages/command-registry/src/boundaryLine/**`, the `boundaryLine` store, and every
consumer that reads a boundary line's attachments.
**Ratified by:** [ADR-0348](../adrs/ADR-0348-a-construction-line-is-a-host-and-what-cannot-follow-it-is-named.md)

> ⚠ **THIS CONTRACT WAS COMMISSIONED AS `C105` AND IS `C106`. RECORDED, NOT SILENTLY
> RENUMBERED.** The lane brief said *"Mint C105. ⛔ NOT C103."* Measured mid-lane,
> 2026-08-23: `C105-AI-PROVIDER-CREDENTIALS-BYOM.md` was already on disk — **untracked**
> (`git status --short` → `??`) and being written by a concurrent lane, with its README
> row already added. Taking C105 anyway would have produced **two contracts under one
> number**, which is strictly worse than any numbering inconvenience and is the exact
> collision `check-contract-index-equivalence.ts` cannot detect (both files would exist;
> only one row would). C103 remains RESERVED for *Balcony & Compound Systems* — cited by
> five source files and by C104 §0.2, unminted, **L-7060 OPEN** — and this contract does
> not take it either. **75 citations across 41 files were renumbered in one pass**, and
> the pass is named in the commit so the correction is auditable rather than invisible.

---

## §0 — What this contract owns, and what it explicitly does NOT

### §0.1 Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| The **legal parcel outline** and the Site model | **C19** — see §0.2, which is the most important section in this file |
| Element creation pipeline | **C11** |
| Command authoring, one-gesture-one-undo | **C16 §8.6**, **C81** |
| Commands as the only mutation path | **C03**, P6 |
| Element integrity, per family, and the host-move rule | **C84** and its C85–C99 block |
| What a COMPOUND is (member identity, ownership, aggregate undo) | **C103** — ⛔ and a boundary line is **NOT** a compound; see §6 |
| Propagation protocol and `prevState` | **C72** |
| The relationship *vocabulary* (`RelationshipType`) | **C71** — ⛔ this contract mints **no** edge family; see §3.2 |
| Appearance, pens, visibility intent | **C09** |
| Material assignment | **C100** |
| Constraint honesty; a refusal is an answer | **C74** |
| Provenance — *why* a write happened | **C75**, **C79 §4.4** |

This contract owns exactly **one** question those twelve do not ask:
**what is an AUTHORED setting-out line, and what happens to the building when it moves?**

### §0.2 — ⭐ THREE LINES EXIST. CONFUSING TWO OF THEM CORRUPTS DATA.

**This section comes first, before anything is specified, because a reader who conflates
the first two rows will write through a legal document with an ordinary edit gesture.**

| | `Parcel.boundary` | `RoomBoundingLine` | **`BoundaryLine` (this contract)** |
|---|---|---|---|
| **What it is** | the **legal lot outline** — a surveyed, recorded title polygon | an **invisible splitter** used by room DETECTION to divide an open-plan space | the architect's **construction / setting-out line** |
| **Owner** | the SITE subsystem (**C19 §1.4**) | room topology (`core-app-model`) | this contract |
| **Where it comes from** | cadastre, survey, GeoJSON ingest | drawn to split a room | **drawn by the architect** |
| **Mutable?** | ⛔ **NO. One-shot IMMUTABLE for the lifetime of the Site.** C19 §1.4: *"A Project that needs to redraw the parcel boundary MUST replace the entire Site (`site.replace`) — there is no `site.editParcelBoundary` command."* | yes | ✅ yes, and moving it is the point |
| **Hosts anything?** | no | no | ✅ **yes — it is a HOST (§3)** |
| **Can carry volume?** | no | no | ✅ yes (§5) |
| **Id brand** | site-owned | `core-app-model` | `boundaryLine` (L0) |

> **§0.2-a (NORMATIVE).** No code governed by this contract may READ, WRITE, EXTEND or
> DERIVE FROM `Parcel.boundary`. A boundary line is authored from scratch. If a future
> feature wants "draw a setting-out line along the parcel edge", it MUST copy the
> vertices into a new `BoundaryLine` record and say so in its provenance — never alias,
> never reference, never write back.

> **§0.2-b — why the founder's own sentence draws this line.** He wrote: *"We have the
> **side-line boundary from the parcel**, but I want to be able to create the **boundary
> construction line**."* He is naming two different objects in one sentence, and this
> contract exists to keep them two.

---

## §1 — ONE store, and it is NAMED (C84 EI-1)

> **§1.1 (NORMATIVE).** The authority for a boundary-line record is
> `BoundaryLineStore` in `plugins/boundary-line/src/store.ts`, constructed exactly once
> by `PluginRegistry` and reachable as `runtime.stores.boundaryLine`. **There is no
> second store, no geometry twin and no legacy mirror.**

⭐ **This is a deliberate departure and it is worth stating why.** C84 §1 measures FIVE
rival representations per element family, and rows 2 and 3 — the plugin DTO store and
the legacy geometry store — are the pair that keeps diverging. The evidence is not
theoretical: `plugins/wall/src/handlers/MoveWall.ts` **REFUSES `wall.move`** in its own
words —

> *"wall.move writes the detached plugin wall store that nothing renders, exports or
> persists, and no production surface dispatches it."*

— and `elementMove.ts` had to mint DISTINCT verb names (`slab.movePolygon`,
`handrail.moveBaseLine`) so plugin handlers could not shadow the ones that reach the
real store. A NEW family does not have to inherit that.

> **§1.2 (NORMATIVE).** The singularity claim is **CHECKED, not written**.
> `plugins/boundary-line/__tests__/boundaryLineHasOneStore.test.ts` walks
> `packages/`, `plugins/`, `apps/`, `src/` and `server/` with Node's own `readdir` — a
> scanner sharing no ignore logic, no encoding heuristic and no binary detection with
> ripgrep — and fails on a second `class …BoundaryLineStore` **or** on any
> `window.boundaryLineStore` **assignment**. A claim about the whole repository that
> nothing measures is exactly the prose this project keeps finding to be stale.

> **§1.3 (NORMATIVE).** ⛔ **`window.boundaryLineStore` MUST NOT EXIST.** Every family
> that acquired a geometry twin acquired it as a window global first (`window.wallStore`,
> `window.slabStore`, `window.columnStore` — the ~40 legacy readers `authoritativeStores.ts`
> records under TASK-08). Keeping that door shut on day one is cheaper than the migration
> those families now owe.

---

## §2 — Geometry: one polyline, nothing derived stored

> **§2.1 (NORMATIVE) — the mode vocabulary is ONE list stated in three places and
> COMPARED, never shared.** The founder asked for *"the same modes for creation — line,
> ortho, rectangle, ellipse, curve, circle"*. Those six live in:
> 1. `BoundaryLine.drawMode` — an L0 Zod enum (L0 imports nothing, by P5);
> 2. `BOUNDARY_LINE_DRAW_MODES` — `@pryzm/geometry-boundary-line` (L2), the runtime union;
> 3. `BoundaryDrawMode` + `BoundaryLoopMode` — `@pryzm/geometry-slab` (L2), whose
>    `boundaryLoopVertices()` is the generator that actually produces the shapes.
>
> ⭐ An import could couple (2)→(3) but could never check (1). So the three are asserted
> **EQUAL AS SETS, in both directions** by `boundaryLineDrawModeVocabulary.test.ts`,
> which also asserts the enum REFUSES a seventh member. §FIX-STAIR-SHAPE-DESYNC is what
> happens without this: a strip offering a shape its generator does not implement.
>
> **Spelled `rectangular`, never `rectangle`** — the canonical side of the L-1322 split,
> chosen once so there is nothing to reconcile later (C84 EI-8).

> **§2.2 (NORMATIVE).** `vertices` is the SINGLE source of truth for where the line is.
> Length, segment count, centroid, every attachment's world pose and the extruded solid
> are **computed on demand** and MUST NOT be stored (C84 §8.i — a derived value stored is
> a value that goes stale on the first vertex drag).

> **§2.3 (NORMATIVE).** `closed` is **AUTHORED, not derived**, and a closed line is an
> **OPEN loop**: the first vertex is NOT repeated at the end. This is the Slab / Pool /
> Balcony convention, so a ring handed from this family to any of them needs no
> re-normalisation. The L0 schema REFUSES a duplicated closing vertex.

> **§2.4 (NORMATIVE).** ⭐ **TWO VERTICES ARE ENOUGH.** A boundary line is a PATH first;
> a single 10 m run IS a setting-out line. Only the three CLOSED modes require three.
> This is the one place the family differs from the pool, the slab and the balcony, and
> requiring a third point would make the commonest gesture impossible while every test
> still passed.

> **§2.5 (NORMATIVE).** A degenerate segment (< 1 mm) yields **`null`**, never a
> plausible-looking point. Both the L0 refine and the geometry layer refuse it
> independently: a record can reach the propagator from a legacy snapshot or a caller
> that skipped `parse()`, and the layer that would otherwise misplace an element must say
> no on its own authority.

---

## §3 — ⭐ THE LINE IS A HOST: what follows it, and what refuses BY NAME

> *"if the user moves the boundary line and this line had slabs and walls, they should
> move, adapt, propagate with all elements!!"* — the founder

This section is C84 **§EI-PROP** applied to a second host, after ADR-0345 applied it to
the LEVEL. Its rule is ADR-0345's, verbatim: **the host is a host, and what cannot follow
it is NAMED.**

### §3.1 — The three verdicts (C72 §9.1), and the one that is a defect

**PROPAGATES** (adapted through a command, composed so it costs ONE undo) ·
**REFUSES** (not adapted, said by name with a reason and the route back to success) ·
**SILENT** (nothing happens and nothing is said — **the only defect**).

> **§3.1-a (NORMATIVE).** ⛔ **A partial cascade that does not say what it skipped is
> worse than no cascade.** "Nothing moved" and "nothing should have moved" reach the user
> as the same value (C78 §1.4). `planBoundaryLineMove()` therefore returns FOUR buckets
> and asserts `adapt + refused + unresolved + unclassified === attempted`; nothing may be
> dropped.

### §3.2 — The edge lives on the HOST, and it is not a graph edge

> **§3.2-a (NORMATIVE).** The relationship is `BoundaryLine.attachments[]`: an array of
> `{ elementId, elementKind, segmentIndex, t, offset, end? }`.

⭐ **THE ANCHOR IS PARAMETRIC, AND THAT IS THE ENTIRE MECHANISM.** A dependent's world
pose is never stored against the line. Evaluate `(segmentIndex, t, offset)` against the
OLD line and you get where the thing is; evaluate the SAME anchor against the NEW line
and you get where it must go. **The move is a re-evaluation, not a synchronisation
someone has to remember to run.** `offset` is SIGNED, so a wall drawn 150 mm inside the
boundary stays 150 mm inside it — on the same side — rather than snapping onto the line.

**Why on the host and not on the dependents.** C84 EI-PROP-d requires the record to hold
an edge to walk. Two placements were possible:
- ✗ a `boundaryLineId` field on Wall, Slab, Column, Beam, Roof, Stair, Furniture and
  Plumbing — **eight** L0 schema amendments across the C85–C99 block for ONE host, eight
  places that can disagree, eight contracts to amend;
- ✓ one array on the boundary line — one record, one contract, and the host can answer
  *"what is on me?"* without scanning every store, which is the question the propagator
  asks.

> **§3.2-b (NORMATIVE).** ⛔ This is **NOT** a `RelationshipType` graph edge and no lane
> may make it one without executing C71 §2.6. C71 §2.5 forbids a writer-first addition
> outright — *"writing edges nothing reads is how `sitsOn` spent months as
> measured-but-meaningless coverage"*. An element-record reference field is a different,
> already-blessed mechanism (`Pool.hostSlabId`, `Balcony.childrenIds`,
> `Lift.servedLevels`) governed by this contract.

> **§3.2-c (NORMATIVE) — REFUSE AT ATTACH TIME, NOT AT MOVE TIME.** A family the table
> below cannot carry MUST be refused when the attachment is recorded, with the table's
> own sentence. A relationship the system cannot honour must not be **recordable** — that
> is what makes "the cascade half-ran and said nothing" structurally impossible rather
> than merely unobserved.

### §3.3 — ⭐ THE PER-FAMILY TABLE — NORMATIVE. **NO CELL IS `SILENT`.**

Membership was decided by ONE measured question, and it is the same shape ADR-0345 used:
**does a command exist that reaches this family's AUTHORITATIVE store?** "Authoritative"
is load-bearing — see §1.

| family | verdict | mechanism / measured reason |
|---|---|---|
| **Wall** | ✅ PROPAGATES | line — `UpdateWallBaselineCommand` (`wall.updateBaseline`) |
| **Slab** | ✅ PROPAGATES | area — `UpdateSlabPolygonCommand` (`slab.movePolygon`, the L-220 distinct verb) |
| **Column** | ✅ PROPAGATES | point — `UpdateColumnCommand` (`column.update`) |
| **Beam** | ✅ PROPAGATES | line — `UpdateBeamCommand`; `BeamData.startPoint`/`.endPoint` measured. ⚠ see §3.5 |
| **Curtain wall** | ✅ PROPAGATES | line — `UpdateCurtainWallCommand`; `CurtainWallData.baseLine` measured |
| **Handrail / Railing** | ✅ PROPAGATES | line — `UpdateHandrailCommand`; `HandrailData.baseLine` **is** a line (the opposite claim stood in `elementMove.ts` for months and was measured false there) |
| **Stair** | ✅ PROPAGATES | point — `MoveStairCommand`, which also re-reconciles the stair's carved slab void (§STAIR-VOID-FOLLOWS-SPAN) |
| **Furniture** | ✅ PROPAGATES | point — `UpdateFurnitureParametersCommand` |
| **Plumbing** | ✅ PROPAGATES | point — `MovePlumbingCommand` |
| **Lighting** | ✅ PROPAGATES | point — `MoveLightingCommand`. ⭐ **A CORRECTION — see §3.4** |
| **Door / Window** | ❌ REFUSES | **HOSTED (C15).** Their position is an OFFSET along a wall, not a world point. *"Attach the WALL to the boundary line and the door rides it."* |
| **Roof** | ❌ REFUSES | `UpdateRoofBoundaryCommand` requires `cause: { wallId, kind: 'wall-moved' \| 'wall-removed' }`, documented *"named, never inferred (C79 §4.4 / C75)"*. **A boundary line is not a wall; a fabricated `wallId` would write FALSE PROVENANCE.** |
| **Ceiling** | ❌ REFUSES | identical measurement — `UpdateCeilingBoundaryCommand`'s `cause` union is wall-only |
| **Floor** | ❌ REFUSES | identical measurement — `UpdateFloorBoundaryCommand`'s `cause` union is wall-only |
| **Room** | ❌ REFUSES | not *cannot* — **must not**. A room's polygon carries `detectionMethod`: it records that it was DERIVED from its bounding walls. Writing it from a line is two authorities over one polygon (C84 EI-9). **A room follows because its WALLS follow.** |
| **Grid** | ❌ REFUSES | a grid is a **DATUM** — things are set out FROM it. Moving one because a construction line moved inverts the hierarchy. |
| **Level** | ❌ REFUSES | a vertical DATUM and a host in its own right; its move is `SetLevelHeightCommand`'s (ADR-0345) |
| **Pool / Balcony / Lift** | ❌ REFUSES | **COMPOUNDS** (ADR-0124 §3 / C103 §2 / C104 §2). Translating one member tears the assembly apart, and a lift's shaft voids would be left in mid-air. |
| **Annotation / Dimension** | ❌ REFUSES | they belong to a VIEW, not to model geometry (C101). A translated dimension would report a length it never measured. |

> **§3.3-a (NORMATIVE).** A PR that **adds an element family** MUST place it in this
> table (C84 EI-PROP-a). An attachment whose family has **no row** is reported as
> `unclassified` with a reason citing EI-PROP-a — so a missing row reads to a *developer*
> as a missing row, not merely to a *user* as a rejection.

> **§3.3-b (NORMATIVE).** ⭐ **STAIR PROPAGATES HERE AND REFUSES FOR A LEVEL, AND THAT IS
> NOT A CONTRADICTION.** ADR-0345 refuses a stair on a level-HEIGHT change because the
> storey gap it spans changed, invalidating its riser count — a re-SOLVE, not a
> translate. A boundary-line move is horizontal in XZ: the rise is untouched. **Two
> hosts, two questions, two answers.** Flattening them would be the wrong kind of
> consistency.

> **§3.3-c (NORMATIVE).** Every PROPAGATES row MUST have an executable adapter in
> `boundaryLineDependentAdapters.ts`, and the coverage test checks **both directions**: a
> verdict with no adapter, **and** an adapter for a family the table refuses. C84 is
> explicit that a PROPAGATES row nothing can execute is a **FALSE** ledger entry, worse
> than the SILENT cell it replaces; an adapter for a REFUSES family is a loaded gun.

### §3.4 — ⭐ The lighting correction, recorded because it was refuted

The first draft of §3.3 **REFUSED** lighting, quoting `MOVE_UNSUPPORTED_REASON.lighting`
from `elementMove.ts` verbatim: *"Lighting fixtures have no move command on any surface
yet — tracked under Gate G7."*

**That sentence is TRUE of the BUS and FALSE of the command layer**, and the difference
decides the cell. Measured 2026-08-23:
`packages/command-registry/src/lighting/MoveLightingCommand.ts` **EXISTS**, takes
`{ elementId, to }`, and writes the lighting store. What is missing is a
`MOVE_COMMAND_BY_TYPE` row and a 3-D gizmo branch — i.e. no SURFACE dispatches it.
This cascade dispatches **COMMANDS, not bus verbs**, so it reaches the one that exists.

⚠ Copying the refusal without re-measuring would have shipped a REFUSES cell for a family
that follows perfectly well — **the inverse of the "PROPAGATES row that propagates
nothing" C84 warns about, and just as wrong.** The lighting row therefore carries **no**
`moveVerb`, and that absence is the honest statement that lighting has no bus route yet.
`AG-4` pins **both** halves so a later reader cannot "fix" either into agreement.

### §3.5 — The named remainder

> **§3.5-a.** A beam's `startSupportId` / `endSupportId` are **NOT re-solved**. A beam
> whose columns rode the same line still meets them; a beam whose supports did not move
> now spans differently. Bounded and stated, not silent — re-running support assignment
> is `AssignBeamSupportsCommand`'s job, not a construction line's.
> **Exit condition:** the cascade composes `AssignBeamSupportsCommand` for every carried
> beam, or the beam row moves to REFUSES with this as its reason.

> **§3.5-b.** The roof / ceiling / floor trio needs **one** change to become PROPAGATES:
> a `boundary-line-moved` member on C79's `cause` union. That is **C79's contract to
> amend**, and this lane deliberately did not force it. Naming the exact change is what
> makes this a bounded gap rather than a shrug.

> **§3.5-c.** The vertex **COUNT** may not change through `boundaryLine.move`. Every
> attachment stores a `segmentIndex`; adding or removing a vertex renumbers the segments
> and would silently re-anchor half the dependents to the wrong edge. The command REFUSES
> with both numbers and names the route back (*"detach them first"*). C74 — never clamp,
> never guess.

---

## §4 — ONE undo, and it counts what LANDED

> **§4.1 (NORMATIVE).** A boundary-line move is ONE user gesture and therefore ONE
> history entry (C81).

> **§4.2 (NORMATIVE).** ⛔ **It MUST NOT be built on `CompositeCommand`.** That class
> (L-2401) returns `success: true` **unconditionally in both directions** and counts
> children *attempted*, not *landed*. Inheriting it means telling the user a forty-element
> cascade undid cleanly when half of it did not. `SetLevelHeightCommand` refused it for
> the same reason (ADR-0345 §5) and this command follows that precedent.

> **§4.3 (NORMATIVE).** The mechanism is `STRUCTURAL_CASCADE`: children are dispatched
> from **inside** the parent's `execute()` with `source: 'STRUCTURAL_CASCADE'`, and
> `CommandManagerImpl` (§L-874-ONE-UNDO) folds them into the spawning gesture's
> `HistoryEntry.structuralChildren`. This is the mechanism `SlabWallConnectivityService`
> and `WallMoveReweldService` already use; nothing new is invented.

> **§4.4 (NORMATIVE) — VERIFY BY RE-READING, NEVER BY TRUSTING THE WRITE.** The line's new
> vertices are read back out of the store after the write; `success` is
> `landed === attempted`. A store write returns `void` and silently no-ops on an unknown
> id — the hazard ADR-0345 §5 learnt the hard way.

> **§4.5 (NORMATIVE).** `undo()` reverses **children first, in reverse order** (they
> mutated last), then the line, and **counts what landed**. A child whose element was
> deleted between execute and undo cannot be reverted, and saying "undone" would be the
> `CompositeCommand` lie.

> **§4.6 (NORMATIVE).** The refusal report reaches a **PERSON**, in `result.info`, naming
> every family that did not move and why. ⭐ **A `console.warn` is not a refusal — it is a
> refusal nobody reads.**

---

## §5 — ⭐ VOLUME: the founder's bool, and who wins

> *"The line could have volume also, via a bool setting on Visibility Intent (it should
> have a category there too — everywhere!)."*

> **§5.1 (NORMATIVE) — TWO INPUTS, ONE ANSWER, AND THE PRECEDENCE IS WRITTEN DOWN.**
> 1. The **VIEW's** visibility intent — `ElementGraphicsRules.solid` (C09 / P7) — wins
>    wherever it expresses an opinion.
> 2. The **RECORD's** `hasVolume` is the fallback, for every view whose intent says
>    nothing.
>
> `resolveBoundaryLineSolidity()` is the ONE place that decides. This is what makes
> *"massing in the 3-D view, construction line in the 1:100 plan"* **one model with two
> views** rather than two models.

> **§5.2 (NORMATIVE).** ⚠ On the intent side, `undefined` and `false` are **DIFFERENT
> VALUES and MUST NOT be collapsed.** `undefined` = *this view has no opinion* → ask the
> record. `false` = *this view says linework* → it WINS over a record that says volume.
> Resolving with `??` is correct; resolving with `||` silently turns every "this view says
> linework" into "ask the record" — the emptiness/failure collapse in one operator.

> **§5.3 (NORMATIVE).** `solid` is a property of the ELEMENT in a view, **not of one
> occlusion state**. It MUST NOT be made per-state: a line that was solid in projection
> and linework in beyond would be two different objects.

> **§5.4 (NORMATIVE) — C100. A SOLID MUST NAME A REAL MATERIAL.**
> `resolveBoundaryLineMaterial()` returns exactly three answers:
> - `linework` — `hasVolume: false`. **No material, and that is NOT a failure**; linework
>   is styled by the intent's pen (C09), a different authority that must not be collapsed
>   into material.
> - `resolved` — with the tier that answered.
> - `unresolved` — **with the reason**, and the builder's contract is to REFUSE TO PAINT
>   rather than invent a tint.
>
> The gate is at the command: `boundaryLine.create` and `boundaryLine.update` **refuse**
> a solid with no material. `HandrailFragmentBuilder`'s standing *"3 handrails have NO
> RESOLVABLE MATERIAL … the colour on screen is NOT these elements' material"* — live for
> every balcony — is the defect this makes unreachable.

> **§5.5 (NORMATIVE) — "A CATEGORY THERE TOO, EVERYWHERE" IS **SIX** PLACES, AND A PR
> ADDING A CATEGORY MUST TOUCH ALL SIX IN ONE COMMIT.** A category declared in one and
> missing from another is a control that appears in one panel and silently does nothing in
> the next.
>
> | # | site | what it gives |
> |---|---|---|
> | 1 | `ElementCategorySchema` (`@pryzm/schemas` view-template) | the VG taxonomy key |
> | 2 | `VisibilityIntentDefaults.ELEMENT_TYPES` | ⭐ **the DECLARATION** — a complete `ElementGraphicsRules` in every intent. Without it `solid` has nowhere to live |
> | 3 | `OverridePanel.CATEGORIES` | the per-VIEW toggle grid (curated, so it exists before the first element is drawn) |
> | 4 | `VGSceneApplicator`'s name map **and** its `VGCategory` union | without a row the node is UNCLASSIFIED and the toggle does nothing |
> | 5 | `PenWeightTable.SYSTEM_PEN_TABLE` | the drawn pen |
> | 6 | `DATUM_CATEGORIES` (`DrawingZone.ts`) | exemption from the solids-do-not-dash ladder, where it applies |

> **§5.6 (NORMATIVE) — the pen is PROJECTION-ONLY, and the datum exemption is NARROW.**
> A construction line has no CUT (it is not sliced by the cut plane — it IS that plane's
> notation), no BEYOND and no HIDDEN; a setting-out line that vanished behind a wall
> would be useless for setting out. Absent zones fall to `FALLBACK_PEN`, which is correct
> for a zone that does not apply. ⚠ And the `DATUM_CATEGORIES` exemption covers the
> **CENTRELINE only**: a boundary line with volume has real fabric, and that solid's own
> edges obey the ladder like anything else. Two pieces of geometry from one record.

---

## §6 — ⛔ DELETING THE LINE DELETES **ONLY** THE LINE

> **§6.1 (NORMATIVE).** `boundaryLine.delete` removes ONE record from ONE store.
> `childrenIds` is always empty. **A boundary line is a HOST, not a COMPOUND.**

`pool.delete` removes its walls, floor and water; `lift.delete` removes its enclosure,
doors and cabin parts; `balcony.delete` removes its plate, finish and railings. **All
three are right**, because those members BELONG to the compound and have no independent
existence. The wall an architect drew along a setting-out line is **hers**, not the
line's. C84 EI-5 (create/delete symmetry) is satisfied exactly: create wrote one record
in one store; delete removes one record from one store.

> **§6.2 (NORMATIVE).** After a delete the attached elements stay exactly where they are
> and stop following anything. **That is the correct outcome and it is stated so nobody
> "fixes" it.** An element whose host is gone is a free element, not an orphan — and the
> alternative (refusing to delete a line while anything is attached) would trap the user
> with a line they can neither move nor remove.

---

## §7 — RAC: what "create a 3-bedroom apartment on this boundary line" needs

> *"After creating it, I could ask via RAC: 'create a 3-bedroom apartment on this boundary
> line', for example."*

**Two different things are needed, and only one is a boundary-line problem.**

> **§7.1 — ADDRESSABILITY. ✅ DONE.** `boundaryLine_<ulid>` is a branded L0 id; the record
> lives in the ONE store at `runtime.stores.boundaryLine`; every verb takes it by id.
> Nothing further is required to REFER to a boundary line.

> **§7.2 — GENERATOR CONSUMPTION. ⛔ NOT DONE, AND NOT STUBBED.** The apartment generator
> seeds its plans from a level's slab outline (`ai-host/src/generative`,
> `FloorPlanBatchExecutor`). Teaching it to accept a boundary-line footprint is real work
> in that pipeline. **L-7961, OPEN.**

> **§7.3 (NORMATIVE).** ⛔ While §7.2 is open, the boundary-line verbs are declared in
> `CHAT_UNAVAILABLE` **with readable reasons naming the route back to success** — never
> classified-and-dead. **A verb the chat classifies but that generates nothing is the
> silent-success shape this repository keeps finding.**

---

## §8 — Reachability: four axes, reported separately

> **§8.1 (NORMATIVE).** A family is reachable only when all four hold, and each is
> reported on its own. Measured 2026-08-23:
>
> | axis | state | proof |
> |---|---|---|
> | 1 · something CONSTRUCTS the store | ✅ | `PluginRegistry` descriptor |
> | 2 · a `storeKey` is declared | ✅ | same descriptor; `boundaryLineReachableThroughComposedRuntime.test.ts` R-1 reads `rt.stores.boundaryLine` off the REAL composition root and never builds a store |
> | 3 · something DISPATCHES | ✅ | `BoundaryLinePlanToolHandler` in the SHARED plan registry (both plan surfaces, L-73) + a palette row on **BOTH** create surfaces (L-1380) |
> | 4 · the AI classifies it | ✅ as a **named refusal** (§7.3); the generative half is **L-7961 OPEN** |

> **§8.2 (NORMATIVE) — C104 R-10 APPLIES.** A reachability claim is **INADMISSIBLE**
> without a **pointer-layer** proof. `boundaryLinePointerReach.spec.ts` starts from the
> real palette call, attaches the real split-view plan overlay, and fires real DOM
> `MouseEvent`s. The composed-runtime suite proves DISPATCHABILITY and says in its own
> header that it does not prove a person can draw one.

---

## §9 — Conformance rules

| # | Rule |
|---|---|
| **BL-1** | ⛔ No code in this family reads, writes or derives from `Parcel.boundary` (§0.2-a). |
| **BL-2** | ONE store, named, and the claim is measured by a scanner (§1). |
| **BL-3** | Nothing derived is stored on the record (§2.2). |
| **BL-4** | Every family has a row in §3.3; no row is SILENT; every REFUSES row carries a reason ≥ one sentence naming the route back. |
| **BL-5** | Every PROPAGATES row has an adapter, checked in both directions (§3.3-c). |
| **BL-6** | The cascade is ONE undo, not via `CompositeCommand`, and counts what LANDED (§4). |
| **BL-7** | A solid names a real material or the command refuses (§5.4). |
| **BL-8** | A category lands in all SIX sites in one commit (§5.5). |
| **BL-9** | Delete removes only the line (§6). |
| **BL-10** | Every verb declares a sync disposition in the commit that adds it (C08/P8). |
| **BL-11** | Reachability is reported per axis, and axis 3 needs a pointer-layer proof (§8). |

---

## §10 — What this contract does NOT establish

- **Persistence (C05/C47).** `BoundaryLine` is not yet in `SCHEMA_REGISTRY` and the
  serializer has no boundary-line slice. **Stated as ABSENT, not inherited** —
  **L-7965, OPEN**. C84 EI-6 makes this a real gap, and it is named rather than
  discovered.
- **A 3-D creation arm.** `TOOL_MANAGER_TOOL_KEYS` has no `boundary-line` key. The
  creation matrix declares the gap on the row (**L-7934**). A setting-out line is a plan
  gesture by nature, so this is a real but low-priority hole.
- **A fragment builder.** `boundaryLineSolid()` returns pure data (footprints + two Y
  values); no renderer consumes it yet. The volume bool is fully modelled and fully
  tested and **draws nothing in 3-D today** — **L-7966, OPEN**. ⛔ Do not read §5 as a
  claim that a solid appears on screen.
- **Multi-user (C66/P8).** The sync dispositions are declared; no CRDT transport is
  deployed (L-391) and no client reads the canonical map back into local stores.
- **Vertex-level editing.** Dragging one vertex is expressible (`vertices` is absolute)
  but no UI drags one yet.
