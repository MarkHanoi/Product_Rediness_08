# C83 — Spatial Validity & Design Logic

> **Stamp**: 2026-08-14 · **Status**: DRAFT (governance authored; every slice in §8 UNBUILT at stamp time)
> **Scope**: the question *"is this arrangement of elements **valid**?"*, asked of a design a human is
> authoring, in the editor, while they author it. Owns the **severity taxonomy** (§1 — IMPOSSIBLE /
> INADVISABLE / FINE), the **role vocabulary** rules key on instead of element kinds (§2), **when** a
> rule may run (§3), the **resolution offer** — the concrete alternative a refusal must carry (§4),
> the **false-positive discipline** every rule must pass before it may speak (§5), the boundary
> against the legal stack (§6), and **typology variation** (§7).
> **Does NOT own**: the relationship lifecycle (**C78**), the consequence plan/preview/confirm
> pipeline (**C78** §9–§12, **ADR-0322**), generation authority (**C80**), provenance (**C75**), the
> generators' own internal constraints (**C53**), chat reachability (**C67**/**C68**), or **any**
> building-code or jurisdiction question (**C58**/**C64** — see §6, which is a MUST NOT, not a note).
> **Key principle**: *A rule must key on what an element **is for**, not on what it is near.* A door
> and a window are the same hole in the same wall to a proximity test; they are opposites to a person
> walking through one. Every false positive this contract exists to prevent comes from a rule that
> measured distance where it should have read intent.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md` and to
> [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) (§7.1's named-gap rule: an unbuilt gate is UNPROVEN,
> never an inherited green). **Defers entirely to [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)** on
> the consequence lifecycle and the `UndeterminedImpact` vocabulary — C83 mints no rival reason
> union. **Extends, and does not rival, `CanPlaceRefusalCode`** (§1.4). Peers with
> [C71](C71-GRAPH-AND-TOPOLOGY.md) (owns the graph this reads), [C15](C15-HOSTED-ELEMENT-CONTRACT.md)
> (owns hosting), [C11](C11-ELEMENT-CREATION-PIPELINE.md) (owns creation), **C67**/**C68** (bind every
> user-visible rule this contract ships), [C69](C69-API-VERB-REGISTER.md) (any verb minted here joins
> the register in the same PR). **Supersedes nothing.**
> **Gate**: **no gate decides C83 today.** §9 names four; every one is UNBUILT at stamp time and its
> honest status is **UNPROVEN**.
> **Changelog**: 2026-08-14 — created, on a founder request (§0), after a survey found that this
> product's spatial reasoning is real, good, and **almost entirely locked inside the generators**.

---

## §0 — Why this contract exists

### §0.1 — The request, verbatim

Preserved unedited, because the distinction it draws is the whole design and a paraphrase would
lose it:

> "I want you to add this type of logical thinking in the bim 3.0 living graph and typology - i
> thought that could be present - this should impact all objects - a interior wall can not be in the
> same place were a window is - this should be flagged - in the AI chat RAC again - and ask the user
> do you want to move the wall upwards or backwards? the wall should never be in this position -
> same with a door - etc... also a sofa should never be in front of a door neither a bed - however a
> sofa could be in front of a window or a bed too - please review - and document and add to the
> logic and to the implementation phases"

And, on being shown the taxonomy below:

> "the rule can't be 'furniture near opening = bad'; it has to know that a door is a passage and a
> window is not. ARCHITECTURALLY SOUND!"

And, on the method:

> "WE HAVE A STRONG TOPOLOGY AND GRAPH SYSTEM - EVERY ROOM KNOWS WHAT ELEMENTS ARE WITHIN (I THINK)
> ... I SAY THAT TO: DON'T BUILD THINGS FROM SCRATCH - REVIEW WHAT IS IN PLACE AND BUILD FROM THERE!"

The second quotation is the contract's §2. The third is the reason §0.2 exists and is the longest
section in this file: the founder asked to be corrected if their model of the product was wrong, and
**on one of three counts it is**.

### §0.2 — THE FOUNDATION QUESTION: does every room already know what is within it?

This section is **BY-READ** and says so first. Every fact below is a file read at HEAD `28c6b05c`,
cited to path and line. Per C70 §0.1, BY-READ is never an award — it establishes what exists, which
is the one claim reading supports.

**The answer is YES — and the founder's parenthetical "(I THINK)" is exactly the right amount of
doubt, because "within" means three different things here, held by three different mechanisms, with
three different reliabilities.** Conflating them is the single largest design risk in this contract,
so they are separated permanently below and every later section names which one it depends on.

The canonical answer-holder is
[`packages/room-topology/src/RoomContentsService.ts`](../../../packages/room-topology/src/RoomContentsService.ts) —
*"single canonical answer to 'what is in room R?'"* (`:2`). Its `RoomContents` interface (`:169`)
already splits the question exactly three ways: `bounding` / `hosted` / `contained`. **The founder's
mental model and the code's own structure agree.** The differences are underneath.

**It is WIRED, and this was verified adversarially** (a first pass wrongly concluded it was dead
code, because a `head -30` on the grep was consumed by its own test file — recorded here because
§5's whole subject is instruments that lie):

- constructed at
  [`apps/editor/src/engine/initBuilders.ts:526`](../../../apps/editor/src/engine/initBuilders.ts),
  with all fifteen element stores attached (`:990` logs *"all element stores attached"*);
- read by `PropertyPanelStoreEnricher.ts:108-109` → `getRoomForElement(id, type, levelId)` — this is
  how the property panel already tells a user which room an element is in;
- read by `apps/editor/src/ui/inspect/audit/ElementTypeSelectorZone.ts:99-103` → `getContents(roomId)`.

So a live, honest, per-frame-memoised containment answer already reaches the shipping UI. **C83 does
not need to build one.**

| Meaning | Mechanism | Written by | Maintained on MOVE? | Maintained on DELETE? |
|---|---|---|---|---|
| **BOUND** — walls that enclose the room | `room.boundingWallIds` + `'boundedBy'` graph edge (`SemanticGraph.ts:50`) | `DetectAllRoomsCommand.ts:152`, `ReDetectRoomsCommand.ts:154` (`createdBy: 'system'`) | **INVALIDATED, not recomputed** — GR-12 move-time invalidation (`02157ebb`, `9fa40ae2`) marks it UNDETERMINED | edge survives wall delete unless the cascade runs (`wallDeleteLeavesGraphEdges.test.ts`) |
| **HOSTED** — doors/windows in that boundary | **DERIVED from BOUND** — `_hostedOpenings(store, wallIds, …)` (`RoomContentsService.ts:289-291`) | nobody directly; it is a join through the bounding-wall list | inherits BOUND's invalidation | inherits BOUND |
| **CONTAINED** — furniture standing in the room | **TWO rival mechanisms — see below** | — | — | — |

**BOUND and HOSTED are the same fact.** `RoomContentsService.ts:218-221` states the consequence in
its own words: *"A `boundingWallIds` record here means `bounding.walls` AND all three `hosted.*`
buckets are undetermined — doors, windows and openings are found THROUGH the bounding walls, so an
unrecorded wall list silently empties them too."* This is already handled honestly — the service
returns `undetermined` and sets `totals.exact = false` (`:203-212`) rather than reporting zero doors.
**A C83 rule MUST read `undetermined` before acting on an empty bucket** (§5.3).

**CONTAINED is where the founder's model needs the correction, and it is a good-news correction.**
There are two mechanisms and they do not cover the same furniture:

1. **The `'contains'` graph edge** (`SemanticGraph.ts:51`, *"room → furniture/equipment"*).
   Sole first-party writer: `CreateFurnitureCommand.ts:249-255` — and **only when `hostedSpaceId` is
   set** (`:246-247`). Every producer of `hostedSpaceId` is inside
   `packages/ai-host/src/workflows/furnishLayout/**` — the D-FLE furnish engine
   (`placeSolver.ts`, `kitchenLayout.ts`, `wardrobeLayout.ts`, `bedVariety.ts`, `bedsideLamps.ts`).
   **Therefore: generated furniture has the edge; HAND-PLACED FURNITURE HAS NONE.** The command's
   own comment is explicit and correct that this is deliberate (`:233-235`): *"an item with no
   `hostedSpaceId` (hand-placed, not yet resolved to a room) writes NO edge, because inventing a
   containment the model does not assert is the provenance-invented defect one layer over."*
   It is also **not maintained on move**: `packages/command-registry/src/furniture/` contains no move
   command (`Create`, `ChangeType`, `UpdateParameters` only); `furniture.move` is a declared-dead verb
   that refuses (`plugins/furniture/src/handlers/MoveFurniture.ts:73`), and real moves go through
   `UpdateFurnitureParametersCommand`, which never touches the edge. **Drag a generated sofa into the
   next room and the graph still says the first room contains it.**
2. **Geometric containment** — `RoomContentsService._containedByCentroid(…)` (`:294`), a live
   `pointInPolygon` on the item centroid against `room.boundary.polygon`. **Computed on demand, so it
   is never stale, and it works identically for hand-placed and generated furniture.**

> ### ⚠ THE SINGLE MOST IMPORTANT SENTENCE IN THIS DOCUMENT
>
> **C83 rules MUST resolve containment geometrically, via `RoomContentsService`, and MUST NOT read
> the `'contains'` edge.** The edge is absent for exactly the population a live design-logic check
> exists to serve — furniture a human placed by hand — and stale for the population it does cover.
> A rule built on it would be silent on hand-authored designs and wrong after any drag: it would fail
> in the two ways §5 says are disqualifying, simultaneously.
>
> This does **not** make the edge a defect. It is a correct record of *the furnish engine's stated
> intent* and it has two live readers (`HierarchyTreePanel`, `WorldModelAdapter`). It is simply not
> an answer to C83's question. Two mechanisms, two questions.

### §0.3 — What already exists, and what reaches a person

The founder's instruction was *don't build from scratch*. The survey found a great deal built. It
also found the recurring shape this repository has a name for: **authored, and not reachable.**

**Reachable today, from the editor, on a human's design:**

| Instrument | Path | What it decides |
|---|---|---|
| `WallOccupancyStore.canPlace()` | `packages/geometry-wall/src/WallOccupancyStore.ts:505` | opening-vs-opening overlap **on one wall**, + 5 bounds/host arms; six-member `CanPlaceRefusalCode` |
| `canPlaceRefusalText()` | *ibid.* `:150` | renders the refusal **carrying its code** — ten consumers proven to carry it (`d18bc7a5`, `6688d82c`) |
| `ConstraintEngine` | `packages/constraint-solver/src/ConstraintEngine.ts` | **17 rules**, `severity: 'error'|'warning'|'info'`, debounced 600 ms on model change, broadcasts `pryzm-constraints-updated` |
| `CompliancePanel` | `apps/editor/src/ui/dataworkbench/CompliancePanel.ts:38` | renders those results — mounted at `DataWorkbench.ts:406` |
| `RuleEngine` | `packages/ai-host/src/RuleEngine.ts` (1153 lines) | **28 rules** P0-integrity / P1-functional / P2-IFC → `apps/editor/src/ui/ai/ValidatePanel.ts` buttons |
| `WallCreateConsequencePlanner` | `apps/editor/src/engine/consequence/WallCreateConsequencePlanner.ts` | pre-commit *"what will this wall do?"* — junction diff, room partition, violation diff |
| `ConsequencePlan` + `ConfirmationFlow` + `ConfirmationCard` | `packages/command-bus/src/consequence.ts`, `apps/editor/src/ui/consequence/` | **the canonical, gate-certified propose→confirm→execute surface** (§4.1) |
| `ZeroTokenUiHooks.confirm()` | `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:793` → `AIPanel.ts:1180` | the literal *"shall I?"* Confirm/Cancel bubble in RAC chat |
| `RoomContentsService` | see §0.2 | live three-way containment |

**Authored and NOT reachable — the gap this contract is mostly about:**

- **`doorSwingKeepout.ts`** (`packages/ai-host/src/workflows/furnishLayout/doorSwingKeepout.ts`) — a
  correct 90° swing sector with `rectIntersectsSwing` and a hard `rejectFurnitureClashingDoors`
  filter, fully unit-tested, **imported by nothing but its own two tests**. Logged as
  [ISSUE-LOG L-856](../../04-reference/ISSUE-LOG.md) — *"`doorSwingKeepout.ts` IS DEAD CODE;
  `Door.swing` NEVER REACHES THE FURNISHER"*. Root cause: `Door.swing` exists on the schema and is
  dropped at the wall-opening boundary, so `OpeningPose` carries no hinge side.
- **`programRules.ts`'s `excludeDoorSwing`** — every furniture kind declares, per
  `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`, whether it may overlap a
  door's opening arc (`bed`: `excludeDoorSwing: true`). **No code reads that flag.** The file's own
  header (`:60-65`) says the D-FLE migration to read it is *"a follow-up"*.
- **The shipped keep-out is a symmetric box, duplicated four times, one copy drifted** —
  `placeSolver.ts:165` (`width × max(width, 0.9)`), `kitchenLayout.ts:394`, `wardrobeLayout.ts:170`,
  and `rules/kitchenValidation.ts:130` with a fixed `depth = 0.45`. Measured defect rate over 288
  generated rooms: **3 items (1 %) intrude the true swing arc** while intruding none of the box
  (`packages/ai-host/__tests__/furnitureDoorClearanceAudit.test.ts`).
- **The 16-slice apartment validator family** — `packages/ai-host/src/workflows/apartmentLayout/validators/`
  (`orchestrator.ts` → `validateApartmentLayout`), holding all eight adjacency validators **A-1…A-8**
  (mandatory / preferred / forbidden adjacency, privacy gradient, acoustic separation, wet cluster,
  frontage topology, sequencing) and the G-class dimensional set. **Its only non-test reference is the
  barrel re-export at `packages/ai-host/src/index.ts:778`.** No executor, controller or panel invokes
  it; its output reaches no UI. (A *second*, differently-named family under `dimensions/` +
  `topology/` **is** wired into `enumerate.ts` and the modal badges — the two must not be confused.)
- **`PlanCritique.ts`** (`packages/ai-host/src/workflows/PlanCritique.ts`) — scores an existing plan
  into `CritiqueItem[]`; registered on `AiPlane` by nothing, and its one non-test registration hands
  the descriptor to a stub port whose `proposedCommands` is `[]` by construction.
- **Every clearance evaluation is generator-internal.** `FurnishLayoutExecutor.ts` never reads the
  existing furniture store; `validateFurnishedRoom` is called once, on the array the generator just
  produced. `plugins/furniture/src/handlers/CreateFurnitureBatch.ts:67-93` (`canExecute`) validates
  finite vectors and a valid LOD — **nothing spatial**. Grepping
  `furniture|swing|clearance|keepout` across the whole of `packages/constraint-solver` returns
  **zero matches**: the live rule engine is furniture-blind.

**And the founder's own headline case has no coverage at all.** Every one of the ~12 production
`canPlace()` call sites is on the **opening** side — create an opening, move a door, move a window,
set an offset, drag a hosted element. **Not one is on the wall-create path.** `canPlace(wall, offset,
width)` cannot express the question in any case: it takes *one* wall and compares against *that
wall's own* `openings[]`. A new interior wall arriving at an exterior wall that already holds a
window is invisible to it. The user-reported bug is over a year old and independently confirms the
mechanism (mesh interpenetration or silent failure, no constraint feedback).

> ### The thesis of this contract, already written down by someone else
>
> `docs/03-execution/specs/SPEC-49-CIRCULATION-INTEGRITY.md` §3, on its own subject:
> **"The detection is not missing. The refusal is."**
>
> That is the finding of this survey too, generalised. PRYZM computes an enormous amount of correct
> spatial reasoning — swing sectors, clearances, adjacency, reachability, occupancy — and then, at
> the boundary between the engine that computed it and the person who needed it, **drops it**.
> C83 is mostly a contract about carrying answers that already exist to the surface, and only
> secondarily about computing new ones.

**But the machinery is one branch away.** `WallCreateConsequencePlanner` already computes, for a
proposed wall, the list of existing walls whose **body** the newcomer crosses
(`segmentsProperlyCross`, `:571-581`) and declares it an `UndeterminedImpact` naming those wall ids.
It holds the crossed wall ids and the crossing geometry, in a planner that already runs before
commit. It simply never asks the next question: *is there an opening at that station?* —
for which `getOccupiedSpans(wall)` (`WallOccupancyStore.ts:684`) already exists and returns exactly
the `[offsetM, endM]` intervals needed. **That is §8's Slice 1, and it is small.**

---

## §1 — The taxonomy

### §1.1 — Three verdicts, and the boundary between them

| Verdict | Definition | System behaviour | Founder's cases |
|---|---|---|---|
| **IMPOSSIBLE** | The proposed state is **self-contradictory as geometry or as construction**. No amount of context makes it right; no user preference can license it. | **Always flagged. Never silent.** Refuse at the command seam, or commit-with-forced-resolution — never commit quietly. | interior wall crossing a window opening; wall through a door |
| **INADVISABLE** | The state is **buildable and internally consistent, but defeats the function** of an element involved. Context can make it right. | **Offer, never impose.** Surface a proposal (§4); the user decides; dismissal is honoured and remembered (§5.4). | sofa or bed blocking a door |
| **FINE** | No rule fires. | **Silence.** Not a green tick, not a toast, not a badge. | sofa in front of a window; bed under a window |

### §1.2 — Why the boundary sits exactly there

The boundary is not "severe vs mild". It is **"can context reverse it?"**

A wall occupying the same space as a window opening is not a bad idea; it is two mutually exclusive
claims about one volume. The wall's solid says *material here*; the opening says *void here*. The
model cannot represent both, the mesh interpenetrates, the room boundary is corrupted, and — as the
2026-05-29 report records — no downstream consumer can recover. There is no site, no typology, no
client brief and no user preference under which it becomes correct. **A rule that can never be wrong
may refuse.**

A sofa in front of a door is a *bad idea with exceptions*. It is buildable. It might be a
deliberately blocked service door, a fire exit kept clear by a removable piece, a client who wants
it there. **A rule that is right most of the time may only ever offer.** Escalating it to a refusal
would be this system telling a professional they may not draw something they can lawfully build,
which is both wrong and — per §5 — the fastest route to being muted.

### §1.3 — MUST NOT: severity may not be inferred from magnitude

A 5 cm overlap between a wall and a window is IMPOSSIBLE. A sofa 5 cm into a door swing is
INADVISABLE. **The verdict is a property of the RULE, declared when the rule is written, never
computed from how large the violation is.** A rule that promotes itself to IMPOSSIBLE at some
threshold has invented an unreviewable policy at runtime, and no negative control (§5.2) can cover
a policy that changes with its input.

### §1.4 — The refusal vocabulary EXTENDS `CanPlaceRefusalCode`; it does not rival it

`CanPlaceRefusalCode` (`WallOccupancyStore.ts:79`) is a closed six-member union with a value roster,
a compile-time completeness assertion (`:113-118`), a single renderer that carries the code into the
user-facing string (`:150`), a `Record<>`-typed default sentence per member (`:180`), ten proven
consumers, and a CI gate (`tools/ga-gate/check-refusal-identity.ts`). **This is the pattern. C83
adopts it wholesale.**

Specifically:

1. Codes for **wall-side occupancy** — the founder's headline case — are **added to
   `CanPlaceRefusalCode` itself**, because they are the same question asked from the other side, and
   the store already has the `planOpeningRefit` precedent for exactly that (`:395`, *"the WALL-SIDE
   mirror of `clampToWall`"*). The first is `OCC_CROSSES_HOSTED_OPENING`. Adding a member is a
   compile error until its roster entry and its default sentence land — by construction.
2. Codes for **functional (INADVISABLE) findings** get their own closed union, `DesignLogicCode`,
   because they are not `canPlace` refusals — nothing is refused. It obeys every structural rule
   above: closed union, value roster, completeness assertion, `Record<>` sentences, code carried into
   the rendered text.
3. **NEVER widen either to `string`.** Restated here because it is restated in both existing files.
4. A finding that arrives with no code is reported **as unidentified**, never smoothed over — the
   `OCC_UNIDENTIFIED` precedent (`:157-160`).

---

## §2 — Rules key on ROLES, not on element kinds

### §2.1 — The N×N matrix is unaffordable, and that is measurable

The naive shape is a matrix of (kind × kind). This repo has **13 apps, 48 plugins** and an element
family list that grows with every typology pack. At ~30 placeable kinds a full matrix is ~900 cells;
C82's ribbon census found 267 of 280 toolbar pairs silently dead, which is what happens to
hand-maintained N×N tables here. **A new element kind must not require 30 new decisions.**

### §2.2 — The role vocabulary

An element **declares what it is for**. Rules are written against roles. A new kind inherits every
rule the day it declares its roles, and nobody edits a matrix.

| Role | Means | Carries | Examples |
|---|---|---|---|
| `PASSAGE` | a person moves **through** it | approach clearance both sides; a swing arc when hinged | door, opening, gate, stair head/foot |
| `APERTURE` | light, air or view passes; **a person does not** | a sill height; a view cone; **no floor clearance** | window, rooflight, borrowed light |
| `STRUCTURE` | occupies solid volume; bears | thickness, extent | wall, column, beam |
| `OCCUPIABLE` | a person uses it in place | footprint + a *directional* use-clearance | sofa, bed, desk, WC |
| `CIRCULATION_SURFACE` | a route runs across it | minimum width | corridor, landing |

**This is the founder's distinction, made machine-readable.** A sofa in front of a `PASSAGE` blocks
the thing that passage exists for → INADVISABLE. The same sofa in front of an `APERTURE` blocks
nothing an aperture is for — light still arrives above the sofa back, the view is still there — →
FINE. A bed under a window is a normal, often preferred, arrangement. **One rule, keyed on role,
produces all three answers correctly and needs no exceptions list.**

### §2.3 — The honest cost of the role approach

Stated rather than sold:

- **Roles must be declared, and a kind with no declaration is UNDETERMINED, not FINE.** An
  undeclared kind is invisible to every rule — the silent-by-default failure. Per C78 §1.4 the
  absence is reported (§9's G-DL-3 counts undeclared kinds), never rendered as compliance.
- **Some elements carry two roles.** A curtain wall is `STRUCTURE` and `APERTURE`. A sliding door is
  `PASSAGE` and `APERTURE`. Roles are a **set**, not an enum, and a rule fires if any role matches.
- **Roles are coarser than kinds, so a role rule will occasionally be too broad.** The escape is a
  typology-pack override (§7) — never a hard-coded kind exception, which would rebuild the matrix
  one `if` at a time.
- **`Door.swing` must actually reach the evaluator.** The swing arc is a property of the `PASSAGE`
  role, and today the field is dropped before `OpeningPose` (§0.3, L-856). **Slice 3 is blocked on
  this and says so.** Until then, `PASSAGE` clearance uses the documented symmetric box and **the
  finding must say which geometry produced it** — a swing-shaped claim from a box-shaped test is a
  confident wrong answer.

### §2.4 — Where roles live

Roles are declared **beside the element type registry**
([C65](C65-ELEMENT-TYPE-SYSTEM.md)), not in a new parallel registry. C76 is the RESERVED slot for the
element-family register (COORD-01); **if C76 is minted, the role declaration belongs there and this
section defers to it.** C83 mints no second element taxonomy.

---

## §3 — When rules evaluate

| Moment | Which verdicts | Cost | Status |
|---|---|---|---|
| **Pre-commit `canExecute`** | IMPOSSIBLE only | one query per commit; already paid on the opening path | the seam Slice 1 uses |
| **Consequence plan** (`WallCreateConsequencePlanner` et al.) | IMPOSSIBLE + INADVISABLE | already computed for these operations | the seam Slice 1 and 2 use |
| **Post-move settle** | both | one pass per settled move | move-propagation now emits exactly such a point |
| **On demand** ("check my plan") | both, whole model | O(elements) — user-initiated, so acceptable | the CompliancePanel button |
| **Continuous, per frame** | — | **FORBIDDEN** (§3.2) | — |

### §3.1 — The debounce already exists and is already tuned

`ConstraintEngine._scheduleRun()` debounces **600 ms** on model change and — importantly — is
**suppressed entirely while `batchCoordinator.isBatching`** (`ConstraintEngine.ts:252-255`), with the
reason stated in source: *"The model is in an incomplete state — validating now produces spurious
compliance errors."* C83 rules run on the **same schedule, through the same suppression**. A generator
that emits 400 commands must not produce 400 findings about intermediate states; that is not a
performance concern, it is §5's concern.

Note also `__pryzmLoadActive()` (`WallOccupancyStore.ts:60-68`), which suppresses logging during
project restore and generation for the same reason. **Any C83 evaluator MUST honour both flags.**

### §3.2 — MUST NOT: no per-frame evaluation, and no evaluation inside the geometry pipeline

Per-frame spatial validation would put an O(n²)-ish query on the frame budget (P3: one rAF, owned by
`frame-scheduler`) and would fire findings about states the user is still dragging through. Evaluate
on **settle**, never on **motion**. A drag in progress is not a design.

---

## §4 — The resolution offer

The founder did not ask for an error. They asked: *"do you want to move the wall upwards or
backwards?"* — a **concrete alternative**, and more than one.

### §4.1 — There are already FOUR offer surfaces. C83 mints no fifth, and picks the canonical one.

A survey at HEAD `28c6b05c` found four live propose→consent surfaces:
`ConsequencePlan`/`ConfirmationFlow`/`ConfirmationCard`; the RAC chat `ZeroTokenUiHooks.confirm()`
bubble; the older `CommandProposal` Approve/Reject card; and `AiPendingAction`'s workflow approval
queue. **A fifth is the failure mode.**

> ⚠ **`CommandProposal` is declared TWICE, divergently, and both are exported** —
> `packages/command-registry/src/types.ts:397` (`id` required) and
> `CommandProposalFactory.ts:6` (`proposalId` + `intentId` required, no `id`). **Do not add a third,
> and do not build C83 on this type.** Its `validation` is `{ ok, reason? }` with **no code**, which
> is precisely the collapse §1.4 exists to prevent; and both approve paths still reach
> `window.commandManager` behind a `TODO: replace with runtime.bus.executeCommand` — a P6 debt C83
> must not inherit.

**THE CANONICAL SURFACE IS `ConsequencePlan` → `ConfirmationFlow` → `ConfirmationCard`**
(`packages/command-bus/src/consequence.ts`, `apps/editor/src/ui/consequence/`). It is the newest, it
is gate-certified (`check-approval-binding`, `check-execution-plan-agreement`,
`check-plan-determinism`, `check-ai-human-parity`), it is already built around `wall.move` /
`wall.create` / `opening.move` — **the exact operations C83's first slices target** — and it already
carries every field a C83 finding needs: `refused: RefusalSet`, `undetermined: UndeterminedImpact[]`,
`validation: ValidationDelta`, plus a `planHash` bound to the approval so a plan approved against a
stale model **refuses `APPROVAL_STALE` with a replan attached** rather than executing.

C83 therefore:

1. **Emits findings as fields of the plan a planner already produces** — an IMPOSSIBLE finding is a
   `ConsequenceRefusal` in `plan.refused` (its `reason` sentence *"NAMING the quantities that
   collide"*, per the type's own doc); an unanswerable one is an `UndeterminedImpact`. **No new plan
   type.**
2. **Escalates consent through `ConfirmationPolicy`.** `ConfirmationReason` is a deliberately **OPEN**
   union (`string & {}`), so a C83 reason needs no contract edit to the command-bus.
3. **Speaks in chat through the already-shipped hook** — `ZeroTokenUiHooks.confirm(summary):
   Promise<boolean>` (`ZeroTokenChatBridge.ts:793`), implemented by `AIPanel.showZeroTokenConfirm`
   (`:1180`). **One plan, two prompts**: the card for the gesture path, the chat bubble for the
   founder's *"ask the user"*.
4. **Previews the proposed geometry as a ghost**, where one exists, via
   `IPreviewManager.showProposal / accept / decline` — ghosts never enter an ElementStore.
5. **Attributes the execution without merging actor and approver** (ADR-0324): an accepted C83
   proposal executes with `CommandExecutionContext { actor: {kind:'ai'}, origin: {surface:'chat',
   proposalId}, approval: {proposalId, approvedBy: <human>} }`. **Never stamp `actorId="ai"` as a
   substitute for an approval record.**

The candidate positions themselves are ordinary commands (`MoveWall`, `SetDoorOffset`,
`UpdateFurnitureParameters`), and each is run through its own `canExecute` before being offered — so
**an offer that would itself violate a rule cannot be presented.**

### §4.1.1 — Undo cost is stated before consent, truthfully

`runBatch` is **undo-NEUTRAL** (ADR-0314): N commands produce N history entries. A C83 offer that
fans out MUST state N before the user consents. Claiming "one undo" for a fan-out is named as an
anti-pattern in C68 §7.f.

### §4.2 — How a candidate is computed, and the MUST NOT

For `OCC_CROSSES_HOSTED_OPENING` the candidates are derivable, not invented: the crossed wall's
occupied spans are known (`getOccupiedSpans`), so the **clear intervals** are their complement along
the wall. The two nearest clear stations either side of the requested one are *"move it back"* and
*"move it along"*, each expressed as a concrete offset, each already validated by `canPlace` before
being offered.

> ### ⚠ MUST NOT: never offer a candidate you cannot defend
>
> When no defensible alternative can be computed — the wall is fully occupied, the geometry is
> curved and the resolver is chord-based, the host is raked, the containment answer came back
> `undetermined` — the system **refuses with the reason and offers nothing**. It does **not** offer
> a nearest-fit guess.
>
> This is the codebase's central doctrine restated at the proposal layer: *a wrong answer is worse
> than no answer, because the user acts on it.* An offer carries an implicit claim that the
> alternative is valid. A guessed offset that lands on another opening spends the user's trust and
> the system's credibility in one click.

### §4.2.1 — The shape of "I cannot offer one"

A C83 refusal to offer follows `CapabilityRefusal` (C80 §1.4,
`packages/command-bus/src/consequence.ts`) and carries **both numbers and what it protects**:
`asked` (how many placements the user's action implicates), `unaccountedFor` (how many the rule could
not settle), and `protects` — **non-empty by contract**, naming what the refusal is defending. The
reason comes from C78 §8's **closed eleven-member** `UndeterminedReason` union; per-family precision
travels in the typed `UndeterminedSubReason`, **never as prose in `detail` and never as a new flat
member**. C83 mints no reason union of its own for this channel.

### §4.3 — MUST NOT: never auto-apply

No C83 finding may mutate the model. IMPOSSIBLE refuses (the command does not execute; nothing
changes); INADVISABLE offers (nothing changes until the user accepts a proposal, which executes as
an ordinary undoable command through the bus, per P6). **There is no "auto-fix" mode**, and a
resolution accepted by the user is one command with one undo entry.

---

## §5 — False positives are the primary risk

A validator that cries wolf gets switched off, and a switched-off validator is strictly worse than
none: it costs the same to build, it consumed the trust budget, and it now provides false assurance.
**This section is binding on every rule and is the reason §8's slices are small.**

### §5.1 — A rule earns its place; it is not granted one

Before a rule may ship it must have, in the same PR:

1. **A positive control** — a fixture that is genuinely wrong, where the rule fires, with the exact
   code and the exact rendered sentence pinned.
2. **A negative control — the SILENCE TEST.** A fixture that is a healthy, realistic design of the
   same shape, where the rule produces **zero** findings. *This is the test that may not be skipped.*
   A rule with only a positive control has been proven able to fire, which is not the same as being
   proven able to stay quiet, and the second property is the one users experience.
3. **A near-miss control** — the arrangement one tolerance away from firing, on the legal side.
   Bed under a window is the canonical near-miss for the sofa-vs-door rule: same furniture, same
   proximity, different role, **must be silent**.
4. **A whole-project baseline run** — the rule executed over the existing generated fixtures
   (the 288-room furnish corpus is the obvious subject). **A new rule that fires on a large fraction
   of known-good generated output is refuted by that run, not tuned until it passes.**

### §5.2 — The already-measured warning

The furnish audit found **3 of 288 rooms (1 %)** with true swing intrusion. That is the correct
order of magnitude for a healthy rule: **rare**. If a C83 rule fires on 30 % of rooms, it is not
finding 30 % bad designs; it is measuring the wrong thing, or the threshold encodes a preference and
not a fact. §5.1(4) exists to catch this before a user does.

### §5.3 — Silence on UNDETERMINED, always

If the containment answer, the bounding-wall list or the swing geometry is `undetermined`
(§0.2), the rule produces **no finding**. It does not guess, and it does not report an absence as
compliance. Where the fact matters, the *unanswerability* is surfaced as an
`UndeterminedImpact` through C78's existing channel — never as a violation. **An empty bucket that
came from an unrecorded relationship is not evidence of a clear floor.**

### §5.4 — Honest dismissal

A user dismissing an INADVISABLE finding is **information, not defeat**:

- Dismissal is **per finding identity** (rule + element set), not per rule globally, and **not**
  per session — re-nagging about a decision already made is the muting mechanism in slow motion.
- A dismissal **persists with the project** and is visible: the finding moves to an
  "acknowledged" list, it is not deleted. The user can see what they set aside.
- Dismissals are **counted per rule**. A rule dismissed by most users most of the time is a rule
  with a wrong threshold or a wrong premise, and the count is the evidence for retiring it.
- An IMPOSSIBLE finding **cannot** be dismissed — but it is also never merely surfaced: it refuses,
  so there is nothing to dismiss. If a rule offers a dismiss button, it was never IMPOSSIBLE.

---

## §6 — What this is NOT

### §6.1 — MUST NOT: this is not a building-code compliance engine

Code compliance is owned by the jurisdiction stack — [C58](C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md),
[C64](C64-ENVELOPE-COMPILER.md), the rule packs and the national capability register. That stack's
entire discipline is that a legal claim must cite a sourced instrument, and that a missing source is
a **refusal**, never a default. C83 rules cite **physics and function**, and may cite **no
regulation**.

> ⚠ **This boundary is already breached in shipped code and the breach is named here rather than
> inherited.** `ConstraintEngine`'s 17 rules carry hard-coded regulatory numbers and cite them —
> `MIN_AREA_M2` (`ConstraintEngine.ts:65-94`) asserts UK Part M minima; `ROOM_NEEDS_DOOR` cites
> *"Building Regulations Part B (fire egress)"*; `THERMAL_GLAZING_OVERHEATING` cites *"CIBSE TM52"*.
> These are **transcribed constants in a client-side rule file with no jurisdiction resolution and no
> provenance** — the exact defect C64 §2.13 forbids for coverage figures, in the legal domain, and
> they apply UK values to a product whose live jurisdiction work is Spanish.
>
> **C83 does not fix this and must not extend it.** A C83 rule MUST NOT populate the `regulation`
> field. Migrating the existing 17 is owed by C58's owner, and this paragraph is the record that it
> is owed. **Sharing the ConstraintEngine's rule registry and panel does not make C83 rules legal
> claims, and no C83 finding may be rendered in a way that implies one.**

### §6.2 — Not a replacement for the generators' constraints

D-TGL, D-FLE and D-CE keep their internal constraints. C83 validates **states**, not **processes**;
it never runs inside a generator's search loop, where it would be a slow duplicate of a fast
internal check. The relationship is one-directional and precise: **the generators are the richest
source of rules to promote into C83** — `programRules.ts`'s `excludeDoorSwing` flag and its
`clearFoot`/`clearSide` millimetres are already-authored, already-reviewed statements of exactly what
§2's `OCCUPIABLE` role needs. **Promoting them is cheaper and more honest than authoring rivals**,
and it retires a documented "declared but nothing reads it" gap in the same move.

### §6.3 — Not a clash-detection engine

[C36](C36-CLASH-DETECTION-AND-COORDINATION.md) owns MEP/structural clash. C83's IMPOSSIBLE arm
overlaps in spirit but not in scope: C83 is about **authoring-time single-discipline spatial
sanity**, C36 about **cross-discipline coordination** over federated models.

---

## §7 — Typology

### §7.1 — Which layer of a rule varies

| Layer | Varies by typology? |
|---|---|
| The **role vocabulary** (§2.2) | **No.** A door is a passage in a hospital and in a house. Universal. |
| **IMPOSSIBLE** rules | **No.** Geometry does not vary by building type. |
| **INADVISABLE** rules — whether the rule applies at all | **Yes.** |
| **INADVISABLE** rules — the threshold | **Yes.** |

The founder's example is the case: a sofa in front of a door in a **dwelling** is a circulation
defect. In an **office breakout**, a soft seat placed against a secondary door may be exactly the
intended layout. Same geometry, same roles, different brief.

### §7.2 — Overrides live in the existing typology pack; no parallel mechanism

[C50](C50-TYPOLOGY-PIPELINE.md) owns the pipeline, and the packs already hold typology-specific
rules. A pack may **disable** a rule, **retune** its threshold, or **add** a pack-scoped rule. It may
**NOT**:

- change a rule's **verdict class** — a pack may not promote an INADVISABLE rule to IMPOSSIBLE, nor
  demote an IMPOSSIBLE one. §1's boundary is a property of physics, not of brief, and a pack that
  could move it could refuse a legal design in one typology and permit a contradictory model in
  another;
- introduce a **role**. Roles are global (§2.4).

Every override is **attributed in the finding**: the user reads which pack changed the rule and what
the default was. An unattributed override is a rule nobody can audit.

### §7.3 — Default when no pack is resolved

The base rule set applies, and the finding says the typology was not resolved. It does **not**
silently assume `dwelling` — the silent-`apartment`-default problem already recorded elsewhere in
this programme.

---

## §8 — Implementation phases

Ordered by **value ÷ risk**. Each slice is independently shippable and independently verifiable.
Every slice carries a **silence test** per §5.1(2). **All are UNBUILT at stamp time.**

### §8.0 — The layering constraint that shapes every slice

`SPEC-49` §5 records a structural fault C83 will hit immediately and must not repeat:
`computeCirculationReachability` — *the only implementation of "is every room reachable"* — lives at
**L7** (`apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts:736`), while the generators that
must obey it live at **L2** (`packages/ai-host`). *"The engine physically cannot call the invariant
that judges it."* The test helpers were forced to **replicate** the predicate
(`packages/ai-host/__tests__/helpers/circulationPredicates.ts`) — a second copy of a rule, which is
how rules drift.

**Therefore: a C83 rule PREDICATE is authored as a pure function at the LOWEST layer all its inputs
permit, and the editor calls it — never the reverse, and never a copy.** The existing consequence
planners already model this correctly and say why: they sit in `apps/editor/src/engine` (L7) so that
every edge to `@pryzm/geometry-wall` and `@pryzm/constraint-solver` (both L2) is **downward**, and
every heavyweight collaborator is **injected** (`WallCreateConsequencePlanner.ts:48-58`). C83 slices
follow that placement exactly, and add zero layer violations.

### Slice 1 — `OCC_CROSSES_HOSTED_OPENING` (IMPOSSIBLE, wall × opening)

*The founder's headline case, and the smallest genuine value.*

- **Detects**: a proposed or moved wall whose centreline crosses an existing wall at a station that
  falls inside one of that wall's `openings[]` intervals.
- **Reuses**: `WallCreateConsequencePlanner`'s existing `segmentsProperlyCross` crossing set
  (`:571-581`) — the crossed wall ids are already computed; `getOccupiedSpans(wall)`
  (`WallOccupancyStore.ts:684`) for the intervals; the crossing parameter along the crossed wall for
  the station. **No new geometry, no new store, no new panel.**
- **Adds**: one member to `CanPlaceRefusalCode`, its roster entry, its default sentence (all three
  forced by the compile-time completeness assertion), and the branch that calls it.
- **Offers**: the two nearest clear stations, each pre-validated by `canPlace` — or, per §4.2,
  **nothing but a reason** when the wall has no clear interval wide enough.
- **Tested by**: positive (wall crossing a window → fires, exact code); **silence** (a wall
  T-junctioning into a clear stretch of the same wall → zero findings; a wall merely *touching* an
  endpoint → zero, since `segmentsProperlyCross` is deliberately strict); near-miss (crossing 10 mm
  clear of the opening edge → silent); the full generated-building corpus → **zero findings**, since
  generators do not author this defect.
- **Does NOT cover**: furniture; the true swing arc; curved hosts (the resolver is chord-based —
  declared `undetermined`, not guessed); walls on different levels; wall × wall crossings with no
  opening involved (that is a separate, already-declared blind spot).

### Slice 2 — surface Slice 1 through the RAC proposal path

- **Detects**: nothing new. Pure delivery.
- **Adds**: Slice 1's refusal + candidates surfaced as `plan.refused` on the existing
  `ConsequencePlan`, rendered by the existing `ConfirmationCard`, and spoken in chat through
  `ZeroTokenUiHooks.confirm(summary)` — so the founder's *"do you want to move the wall upwards or
  backwards?"* is answered in the place they asked for it. One plan, two prompts (§4.1).
- **Binding — and this is the expensive part of the slice, not the geometry**: **C68 §4 applies**
  (the PR registers a bus route and a user-visible capability), so **§5's checklist a–j applies in
  full**: a LIVE command route with a batch sibling (a `plugins/**` handler is LIVE *only* with both
  the `commandManager` delegation **and** `affectedStores: [] as const`); a declaration in **exactly
  one** of the three disjoint places (`ChatCapabilityRegistry` capability · `CHAT_UNAVAILABLE` with a
  reason a user could read · `ChatCommandClassification` with a falsifiable reason ≥ 40 chars);
  `targets` proven **both** directions by probe; every parameter naming a `valueSource`;
  `scopeModes` that actually reach `ctx.resolveScope`; natural plural `examples` with an
  **adversarial pin**; and — §5.i — **the PR description must state the resolver LOC added**, target
  zero, because a capability of a known shape is a table row, not resolver code.
  Verify by running the gate, never by transcribing it:
  `npx tsx tools/ga-gate/check-chat-capability-coverage.ts`. Any verb joins the C69 register
  (`docs/04-reference/API-VERB-REGISTER.md`) in the same commit.
- **Does NOT cover**: any new rule.

### Slice 3 — `Door.swing` reaches the evaluator (enabler; no user-visible rule)

*Deliberately a rule-free slice, because shipping a swing rule on box geometry would be a confident
wrong answer.*

- **Closes**: [ISSUE-LOG L-856](../../04-reference/ISSUE-LOG.md) — thread `Door.swing` from the
  schema through the wall-opening boundary into `OpeningPose`.
- **Unblocks**: `doorSwingKeepout.ts`'s already-written, already-tested sector geometry, and
  `SPEC-49`'s CI-3 remediation (`docs/03-execution/specs/SPEC-49-CIRCULATION-INTEGRITY.md` §4).
- **Verified by**: the existing `furnitureDoorClearanceAudit` corpus — the 3/288 true intrusions
  become detectable where the box test finds 0/288.
- **Does NOT cover**: any live check on hand-authored furniture (Slice 4), and does not itself
  replace the four duplicated box copies (a separate, sequenced clean-up).

### Slice 4 — `DL_BLOCKS_PASSAGE` (INADVISABLE, `OCCUPIABLE` × `PASSAGE`)

*The founder's second case. Sequenced last because it is the one that can cry wolf.*

- **Detects**: an `OCCUPIABLE` item whose footprint intrudes a `PASSAGE`'s approach clearance or
  swing sector, in the room that **geometrically** contains it (§0.2's MUST).
- **Reuses**: `RoomContentsService.getContents(roomId).contained.furniture` for membership;
  `doorSwingKeepout.rectIntersectsSwing` for the test; `programRules.ts`'s `excludeDoorSwing` and
  `clearFoot`/`clearSide` as the authored thresholds — **promoted, not re-authored** (§6.2).
- **Offers**: the nearest position clear of the sector, as an `UpdateFurnitureParameters` proposal —
  or nothing but a reason.
- **Tested by**: positive (sofa in a door swing → fires); **silence, three ways, all mandatory** —
  *sofa in front of a window → zero findings*; *bed under a window → zero findings*; *the same sofa
  rotated clear by 200 mm → zero findings*; and the 288-room corpus, where the expected finding
  count is **3, the known true intrusions** — a materially higher count refutes the rule (§5.1(4)).
- **Does NOT cover**: circulation-route reachability across a whole plan (that is SPEC-49's
  `§CIRCULATION-GRAPH`, a different instrument); offices, until a typology pack declares its own
  threshold (§7); any item whose kind has not declared a role — those are counted as undeclared, not
  passed.

### Sequencing note

Slices 1–2 are unblocked today. **Slice 4 is hard-blocked on Slice 3**: shipping it on the symmetric
box would produce a swing-shaped claim from a box-shaped test, and the audit measured that the box
misses every true intrusion. That is not an approximation; it is the wrong answer with a confident
sentence attached.

### §8.5 — Adjacent work that is NOT C83, and must not be absorbed into it

- **Whole-plan reachability / orphaned rooms** belongs to **SPEC-49** and its shipped instruments —
  the CI-0 `LayoutCirculationVerdict`, the §CI-1-BANNER blocking notice
  (`apps/editor/src/ui/house-layout/houseCirculationNotice.ts`), the "Circulation NN %" chip, and the
  `check-generator-circulation` ratchet with its 18-case ledger. **C83 is per-arrangement, not
  per-plan**, and duplicating a reachability rule here would create the second copy §8.0 forbids.
- ⭐ **One genuinely unowned defect sits between them**, and this contract records it rather than
  claiming it: `houseCirculationNotice.ts`'s **§BUILT-PLAN-REACH** note documents a measured case
  where the verdict reports `hardValid: true` with all five room sets empty, while two storage rooms
  form an unreachable **island** — each has a door, neither door leads anywhere else. The cause is
  that the engine's hard rules run on the **bubble graph**, not on the **realised door graph**.
  That is a real, named, measured gap with a natural home already identified. It is **SPEC-49's**,
  not C83's, and it should be scheduled there.

---

## §9 — Gates

Per C70 §7.1 an unbuilt gate is **UNPROVEN** — never an inherited green. **All four are UNBUILT at
stamp time.**

| Gate | Asserts | Status |
|---|---|---|
| `check-design-logic-silence` | every registered rule has a negative control that runs and produces zero findings | **UNBUILT — NAMED GAP** |
| `check-design-logic-refusal-identity` | every finding carries a code from a closed union; extends `check-refusal-identity.ts` rather than rivalling it | **UNBUILT — NAMED GAP** |
| `check-role-declaration-coverage` | counts placeable kinds with no declared role; shrink-only ratchet | **UNBUILT — NAMED GAP** |
| `check-no-regulation-citation` | no C83 rule populates `regulation` (§6.1) | **UNBUILT — NAMED GAP** |

### §9.1 — What this contract does NOT claim

- **Nothing here is executed.** §0.2 and §0.3 are file reads at HEAD `28c6b05c`. Where a run
  disagrees with this document, **the run wins**.
- The `'contains'`-edge finding (§0.2) is read from source, not from a live session. It should be
  confirmed by an executed probe before Slice 4 relies on the geometric path — though the
  geometric path is chosen precisely so that the edge's state does not matter.
- **The role vocabulary in §2.2 is a proposal, not a measurement.** Five roles are what the founder's
  cases and the surveyed rules need; the real set is discovered by declaring roles across the
  existing kinds, and §2.2 will be corrected in place when it is.
- No claim is made that Slices 1–4 are sufficient for "design logic". They are the four smallest
  steps that each deliver something a user can see.
- **A correction made during authoring, preserved rather than quietly fixed.** This contract was
  drafted expecting to defer to a concurrent lane's new RAC repair-proposal surface. A search of
  `git log --all` since 2026-07-01 and a source grep for `proposeRepair` / `RoomRepair` /
  `orphanedRoom` / `racProposal` found **no such work in any branch**; the only `"shall I"` in the
  repository is C67 §3's illustrative example, explicitly marked NOT-YET-TRUE. §4.1 was rewritten
  from "reuse the new surface" to "there are already four, here is the canonical one" — which is a
  materially different instruction. **Do not re-introduce a fifth on the strength of the earlier
  draft.**
