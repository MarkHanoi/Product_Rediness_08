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
> **Changelog**:
> · 2026-08-14 — created, on a founder request (§0), after a survey found that this product's spatial
> reasoning is real, good, and **almost entirely locked inside the generators**.
> · 2026-08-14 (same day, `28b47ec1` → this revision) — **materially corrected** by a 26-agent
> prior-art survey with adversarial reachability checking. **§0.2.3 REFUTES a premise the first draft
> was built on** (the `contains` edge exists for generated furniture — it does not; no path writes
> it). **§1.1.1 maps this contract's three verdicts onto C74's four canonical classifications** rather
> than minting a fifth vocabulary, after the survey found a two-tier split independently decided four
> times already. **§2.2.1 records that the role split is already materialised** as the `RoomContents`
> bucket boundary, which makes the first rule far cheaper. **§8 REORDERED**: the founder's headline
> ENFORCEMENT case moved from first to last — not because it shrank, but because it costs a C74 §2
> contract row and a preview trigger that has zero callers, while a regression fix and one advisory
> rule were found to be strictly cheaper and immediately shippable.

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
- **most-executed reader**: `PropertyPanelStoreEnricher.ts:109` → `getRoomForElement(id, type,
  levelId)`, on the **unconditional path of `PropertyPanel.showElement` for every selected element**;
- `RoomPropertySection.ts:1076` — the room inspector's "Contents" card;
- `apps/editor/src/ui/inspect/audit/ElementTypeSelectorZone.ts:99-103` → `getContents(roomId)`.

So a live, honest, per-frame-memoised containment answer already reaches the shipping UI. **C83 does
not need to build one.**

> ⚠ **Everything from here to §0.2.3 was CORRECTED on 2026-08-14 by a 26-agent prior-art survey with
> adversarial reachability checking** (the "prior-art map", `whhjjb27r`). Two of the three verdicts
> below moved, and **one of the corrections refutes a premise this contract's first draft was built
> on.** Corrections are made in place with the refuted claim preserved, per this suite's convention.
> The survey is the evidence; C83 carries only the verdicts that bind its design.

| Meaning | Mechanism | Verdict |
|---|---|---|
| **BOUND** — walls that enclose the room | `room.boundingWallIds`, **top-level on the schema** (`packages/schemas/src/elements/Room.ts:140`), written by `RoomDetectionEngine.ts:518`, persisted verbatim (`ProjectSerializer.ts:975`). The `'boundedBy'` graph edge is a **mirror, not the authority.** | **STORED, WRITTEN, MAINTAINED, HAND-REACHED — with three live defects (§0.2.1)** |
| **HOSTED** — doors/windows in that boundary | `hosts`/`hostedBy` is **wall ↔ opening, never room ↔ opening**. Room→doors is **DERIVED AT READ TIME** by scanning `boundingWallIds` (`RoomContentsService._hostedOpenings:601-608`) | **YES as wall↔opening; NO as room↔opening — and the plan tools do not write the edge at all (§0.2.2)** |
| **CONTAINED** — furniture standing in the room | `pointInPolygon` over element centroids at read time (`_containedByCentroid:620-637`). `RoomContentsService` imports `semanticGraphManager` **zero times.** | ⚠ **THE `contains` EDGE DOES NOT EXIST ON ANY PATH (§0.2.3)** |

**BOUND and HOSTED are the same fact.** `RoomContentsService.ts:218-221` states the consequence in
its own words: *"A `boundingWallIds` record here means `bounding.walls` AND all three `hosted.*`
buckets are undetermined — doors, windows and openings are found THROUGH the bounding walls, so an
unrecorded wall list silently empties them too."* This is handled honestly *inside the service* — it
returns `undetermined` and sets `totals.exact = false` (`:203-212`) rather than reporting zero doors.
**A C83 rule MUST read `undetermined` before acting on an empty bucket** (§5.3).

### §0.2.1 — BOUND is real, and carries three live defects a C83 rule must survive

1. **The refusal-bearing reader has ZERO production callers.** `SemanticGraph.getBoundingWalls`
   (`:613-640`) distinguishes `boundary-undetermined-after-element-move` from
   `room-unknown-to-boundedBy-writer`; its only caller is `SemanticGraph.boundedByInvalidation.test.ts`.
   **Every production reader uses raw `getTargets(roomId,'boundedBy')` → `[]`** — so a move-invalidated
   room is reported to `SemanticQueryEngine.ts:148` (*"rooms without a door"*) as an affirmative
   *bounded by nothing*. **This is the `[]`-means-unknown collapse C71 §4.4 forbids, inside the family
   this contract's first draft called the mature one.**
2. **"Maintained" is FALSE on generated levels.** `markGraphAuthoritative` has four production callers
   (the four building executors); `clearGraphAuthoritative` has ~~**0 production callers**~~ — ⛔ **CORRECTED 2026-08-18: it has ONE**,
   `packages/room-topology/src/RoomTopologyObserver.ts:351`
   (`grep -rn clearGraphAuthoritative --include=*.ts packages apps plugins | grep -v __tests__`).
   **The conclusion below is UNAFFECTED and still holds**: that caller is the same narrow GR2 branch,
   refactored under `§PR-05-ONE-RELEASE-AUTHORITY` to delegate to the one release method rather than
   keep an inline `.delete(…)` twin — **consolidated, not widened**, and still gated on
   `!isBatching && !__pryzmBuildingGenActive()`. On a generated level the suppression still never
   releases. ⚠ **Do not mark this fixed on the caller count.** See [C72 §4.1](./C72-PROPAGATION-AND-PREVSTATE.md),
   which carried the identical false claim and is corrected in the same pass — So on a generated
   level a hand wall move deletes the edges (`WallRebuildCoordinator.ts:1496`) and the corrective
   re-detect is suppressed at `RoomTopologyObserver.ts:728-731` — **permanently.**
3. **Hand-drawn rooms start empty.** `RoomPlanToolHandler.ts:127` creates rooms with
   `boundingWallIds: []`.

**Consequence for C83, and it is not small**: for a hand-drawn room, and for any room on a generated
level after a wall move, the `hosted.doors` bucket is **empty for a reason that is not "no doors"** —
while the `contained.*` centroid arms still answer normally. A rule that reads `hosted.doors` and
finds nothing MUST NOT conclude the room has no doors.

### §0.2.2 — ⚠ NAMED DEFECT: the same user action produces different graph state in plan vs 3D

Independent of this feature, and recorded here because C83's first rule sits on exactly this seam:

- **3D writes the edge** — `packages/geometry-door/src/DoorTool.ts:503` (`WindowTool.ts:455` symmetric)
  → `CreateWallOpeningCommand.ts:236/:242`.
- **PLAN does not** — `DoorPlanToolHandler.ts:174` dispatches bus `wall.opening.create` →
  `plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts`, which writes only the Immer store.
  `grep semanticGraph plugins/` returns exactly one file, and it is a test: **the entire L6 plugin
  tier — the tier tools are being migrated INTO — writes zero SemanticGraph edges.**

The "recovered on next load" consolation is weaker than it looks: `rebuildSemanticGraphFromSnapshot`
is gated on `if (semanticGraphManager.size === 0)` (`ProjectLoader.ts:1879`) while
`ProjectSerializer.ts:1083` serialises the graph on **every** save — so once a project's graph is
non-empty for any reason, a plan-placed door's `hosts` edge is never reconstructed.
⚠ **That last step is a DERIVED INFERENCE from two file reads, not an executed result. C83 records it
as UNPROVEN** and does not build on it; one executed probe would settle it.

### §0.2.3 — ⚠ REFUTED: the `contains` edge does not exist on ANY path, hand-authored or AI

**This contract's first draft (`28b47ec1`) stated: *"generated furniture has the edge; hand-placed
furniture has none."* That is WRONG, and the correction is preserved rather than quietly swapped.**

The measured state:

- Exactly one first-party writer — `CreateFurnitureCommand.ts:249-255`, gated at `:246` on
  `data.hostedSpaceId`, populated only from `payload.metadata.hostedSpaceId` (`:179-181`).
- **All 14 non-test `new CreateFurnitureCommand(...)` sites were read. Not one sets it.** Every
  hand-placement surface (`plugins/furniture/src/tool.ts:67`, `FurniturePlanToolHandler.ts:412`,
  `FurnitureDragDropHandler.ts:475`, `KitchenCabinetTool.ts:410`, `WardrobeCabinetTool.ts:384`,
  `CopyPlanToolHandler.ts:477`) dispatches bus `furniture.create` into
  `plugins/furniture/src/handlers/CreateFurniture.ts`, which has **zero** `semanticGraphManager` calls.
- **The AI path computes the right answer and drops it three times.** D-FLE stamps `hostedSpaceId`
  (`buildFurnishCommands.ts:76`); it is discarded at `CreateFurnitureBatch.ts:99-122`
  (`Furniture.parse(seed)` strips it), at `CommandEventBridge.ts:687-736`, and at
  `initTools.ts:2011-2033`. The codebase says so in its own words at `initTools.ts:1985-1990`.
- Reload cannot bootstrap it: `ProjectSerializer` reads `f.hostedSpaceId` off a record nothing writes,
  so `rebuildSemanticGraph.ts:255` `continue`s on every item.
- **There is no refusing reader for `contains` at all** — only four families have one (`joinedTo`,
  `boundedBy`, `sitsOn`, `hostedBy`). Both live readers use raw `getTargets` → `[]`
  (`HierarchyTreePanel.ts:626` silently renders no Furniture group; `WorldModelAdapter.ts:200`).
- **Also REFUTED**: the earlier claim that room re-detect and furniture delete *destroy* these edges.
  Both destruction sites are live, but **there is never an edge to destroy.** `contains` is
  authored-but-unreachable **at the write end** — a distinct failure mode from the read-end
  unreachability this contract catalogues elsewhere, and worth the distinction.

**So the founder's belief holds for BOUND, holds with a caveat for HOSTED, and is FALSE for
CONTAINED.** The good news is that the correction does not change the design — it strengthens the
conclusion the first draft reached for the wrong reason.

> ### ⚠ THE BINDING DECISION OF THIS CONTRACT
>
> **C83 rules MUST resolve containment GEOMETRICALLY, via `RoomContentsService`, and MUST NOT read the
> `'contains'` edge.** Four reasons, in order of force:
>
> 1. **The edge does not exist** (§0.2.3). A rule reading it would be silent on every design, always.
> 2. **The geometric answer is self-correcting on move and delete for free.** The stored edge would
>    not be: there is no furniture move command that maintains it (`packages/command-registry/src/
>    furniture/` has `Create`, `ChangeType`, `UpdateParameters` only; `furniture.move` is a
>    declared-dead verb refusing at `plugins/furniture/src/handlers/MoveFurniture.ts:73`).
> 3. **A stored `contains` edge would today be actively WORSE than none.**
>    `tools/rac-conformance/certification/__tests__/graphmove.cert.ts` classifies `contains` as
>    **ID-KEYED** — *"surviving a move is CORRECT"*. That is right for `sitsOn`/`hosts` and **wrong for
>    a spatial containment**: drag a sofa from the bedroom to the kitchen and the edge would keep
>    asserting the bedroom, with full confidence and no refusal reader to catch it. **That
>    classification must be corrected to position-derived BEFORE anyone stores this edge.**
> 4. `RoomContentsService` carries a typed `undetermined[]` drawn from C78 §8.1's imported reasons and
>    a `totals.exact` flag. It is the highest-quality prior art in this area.
>
> ⚠ **The honest cost, stated rather than buried.** C71 §1.1 reads: *"Topology that is re-detected on
> every query is a cache pretending to be knowledge."* That sentence indicts the mechanism this
> contract has just chosen. C83's answer is not that C71 is wrong; it is that **for a validity rule,
> freshness beats retention** — a rule must judge where the sofa *is*, not where it was recorded. The
> tension is real, it is C71's to resolve for the graph generally, and §8's Slice C is where C83 pays
> into it rather than around it.

### §0.2.4 — ⚠ The `contained` arm did NOT receive the `undetermined` treatment the `bounding` arm did

Found while verifying the above, and load-bearing on every furniture rule. `RoomContentsService`'s §GR-10/GR-14
pass hardened the **bounding** reads — `determineBoundingIds` returns `undetermined` for an absent
field, and `totals.exact` goes false. **The `contained` arm has no equivalent guard**:

```ts
private _containedByCentroid(store: MinReadable | undefined, …): ElementRef[] {
    if (!store || polygon.length < 3) return [];
```

An **unattached** `furnitureStore` and a room with **no furniture** produce the identical value, and
so does a room whose boundary polygon has fewer than three vertices. `initBuilders.ts:524-525` states
the wiring intent plainly — *"The service degrades gracefully — any unattached store simply yields an
empty bucket, so partial wiring never throws"* — which is graceful for a property-panel label and
**wrong for a rule**: a C83 finding suppressed by an empty bucket would be silent for the reason
§5.3 says is disqualifying, and would look exactly like a healthy room.

**Binding on every furniture rule**: it MUST assert the furniture store is attached before
evaluating, and treat "not attached" / "degenerate boundary" as **UNDETERMINED → no finding, reason
recorded** — never as a clear floor. Hardening the arm to return a determination is the honest fix
and belongs to this service's owner; **C83 does not silently rely on it being done.**

### §0.2.5 — Both readers reach the service through a legacy global

`ElementTypeSelectorZone.ts:98` and `PropertyPanelStoreEnricher.ts:107` both read
`window.roomContentsService`, each carrying the same marker: `TODO(E.18-R): legacy
roomContentsService — replace with runtime.rooms.contentsService`. **A C83 rule MUST take the service
by injection**, as the consequence planners already do for every heavyweight collaborator
(`WallCreatePlannerDeps`), and MUST NOT add a third reader of the global — that is P4 debt this
contract will not deepen.

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
the `[offsetM, endM]` intervals needed. **That is §8's Slice 4** — small in geometry, though §8.0.1
records the two non-geometric costs (a C74 §2 row, and a preview trigger with zero callers) that
moved it out of first position.

---

## §1 — The taxonomy

### §1.1 — Three verdicts, and the boundary between them

| Verdict | Definition | System behaviour | Founder's cases |
|---|---|---|---|
| **IMPOSSIBLE** | The proposed state is **self-contradictory as geometry or as construction**. No amount of context makes it right; no user preference can license it. | **Always flagged. Never silent.** Refuse at the command seam, or commit-with-forced-resolution — never commit quietly. | interior wall crossing a window opening; wall through a door |
| **INADVISABLE** | The state is **buildable and internally consistent, but defeats the function** of an element involved. Context can make it right. | **Offer, never impose.** Surface a proposal (§4); the user decides; dismissal is honoured and remembered (§5.4). | sofa or bed blocking a door |
| **FINE** | No rule fires. | **Silence.** Not a green tick, not a toast, not a badge. | sofa in front of a window; bed under a window |

### §1.1.1 — ⚠ These are NOT a new classification. They map onto C74's four, which are canonical.

A two-tier hard/soft split has been **independently decided four times in this repository**, with
four vocabularies and no shared type: ADR-0071 §2 (HARD/SCORING) · SPEC-LAYOUT-CONSTRAINT-DATABASE §1
(Mandatory/Recommended/Info) · SPEC-ROOM-PLACEMENT-RULES §8 · SPEC-37 §2.1 (hard/soft/clearance).
**[C74](C74-CONSTRAINT-HONESTY.md) §1.1's four classifications are the canonical one** — it is a
contract; the others are ADRs and SPECs. **Minting a fifth is the drift ADR-0322 Decision 1 exists to
forbid, and C83 does not mint one.**

| C83 verdict | C74 §1.1 classification | What that binds |
|---|---|---|
| **IMPOSSIBLE** | **ENFORCEMENT** — *"a validation wired into a mutation path such that failure REFUSES the mutation"* | ⚠ C74 §2's protected table names **exactly one** ENFORCEMENT row today: `WallOccupancyStore.canPlace()`. **A second one is a C74 §2 contract edit, in the same PR** — it is not a code change with a doc follow-up. |
| **INADVISABLE** | **ADVISORY** | Flags; never refuses. No contract row needed. |
| **FINE** | *(not a classification — the absence of a finding)* | — |

C74 §1.3 also binds by default: **an unclassified family is VALIDATION until proven otherwise**, and
§4.1 **MUST NOT** build a solver on the argument that the product category implies one. C83 is a
rule layer, not a solver, and says so.

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

### §2.2.1 — ⭐ The role split is ALREADY MATERIALISED as the `RoomContents` bucket boundary

The survey's sharpest finding, and it makes §2 far cheaper than it looks. `RoomContents` (`:169-222`,
built at `:282-303`) already returns **four buckets**: `bounding{walls,slabs,columns,curtainWalls}` /
`hosted{doors,windows,openings}` / `contained{furniture,columns,plumbing,lighting,beams,handrails,
stairs,annotations}` / `vertical{above,below}`.

**"Door = passage, window = aperture, sofa = occupant" does not need a new taxonomy to be executable
today. It needs a rule that reads `hosted.doors` and `contained.furniture` and DELIBERATELY DOES NOT
READ `hosted.windows`.** The founder's whole distinction is expressible as *code that does not
exist* — which is the cheapest possible way to express it, and the least likely to drift.

This does not retire §2.2's role vocabulary; it sequences it. **The bucket boundary is the role split
for the element kinds that already have buckets** (Slice 1 needs nothing more), and the declared-role
registry is what generalises it to kinds that do not — a typology pack's new element, a fixture, a
partition system. **Ship the rule on buckets first; mint the vocabulary when a second rule needs a
kind the buckets cannot classify.**

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
  role, and today the field is dropped before `OpeningPose` (§0.3, L-856). **Slice 3 exists solely to
  close this, and Slice 1 ships before it on a DISCLOSED proxy.** Until then, `PASSAGE` clearance uses
  the documented symmetric box and **the finding must say which geometry produced it** — an
  *undisclosed* swing-shaped claim from a box-shaped test is a
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
| **Pre-commit `canExecute`** | IMPOSSIBLE only | one query per commit; already paid on the opening path | the seam Slices 0 and 4 use |
| **Consequence plan** (`WallCreateConsequencePlanner` et al.) | IMPOSSIBLE + INADVISABLE | already computed for these operations | the seam Slice 4 uses — ⚠ its trigger has zero callers (§8.0.1) |
| **Debounced post-edit sweep** (`ConstraintEngine`, 800 ms off `storeEventBus`) | INADVISABLE | already paid; non-blocking by construction | **the seam Slice 1 uses** |
| **Post-move settle** | both | one pass per settled move | move-propagation now emits exactly such a point |
| **On demand** ("check my plan") | both, whole model | O(elements) — user-initiated, so acceptable | the CompliancePanel button |
| **Continuous, per frame** | — | **FORBIDDEN** (§3.2) | — |

### §3.0 — ⚠ Of the ConstraintEngine's three registered triggers, only ONE fires

Measured, and binding on Slice 1 because it is the seam Slice 1 sits on:

- **LIVE** — hand wall edit → `WallStore.ts:1463` `storeEventBus.emit` → `initDataPlatform.ts:304-311`
  (**800 ms** debounce) → `ConstraintEngine.run()` → `:264` `_broadcast` → a real `window.dispatchEvent`.
- **SILENT NO-OP** — `ConstraintEngine.ts:113` `window.runtime?.events?.on(...)` runs at **module
  evaluation**, and `window.runtime` is not assigned until `engineLauncher.ts:142`, after the static
  import graph. It subscribes to nothing.
- **DEAD** — `:115`'s `pryzm-project-loaded` via `window.addEventListener`; all emitters route through
  the typed bus (`PlatformShell.ts:205/211/399`).

**A C83 rule must not assume the other two exist.** And the latent hazard beneath them is §8's Slice 1
precondition (b): `_constraintQuietUntil = Number.POSITIVE_INFINITY` is released only inside the dead
handler's live sibling, so a change in module ordering silently kills **every** automatic run.

### §3.1 — ⚠ The batch suppression sits on the path that never fires

> **CORRECTED 2026-08-14 by reading the code rather than trusting this contract's own first draft,
> which asserted that a C83 rule would inherit the batch suppression. It would not.**

There are **two independent entry points, not one pipeline**, and the live one bypasses the guard:

| Entry point | Debounce | `batchCoordinator.isBatching` suppression |
|---|---|---|
| `storeEventBus.subscribe` → `constraintEngine.run()` **directly** (`initDataPlatform.ts:304-311`) — **the only live trigger** (§3.0) | **800 ms** | ❌ **NO — it calls `run()`, never `_scheduleRun()`** |
| `_scheduleRun()` (`ConstraintEngine.ts:245-260`) — reached only from the module-scope listeners at `:113-115`, i.e. the **no-op and the dead** ones | 600 ms | ✅ yes (`:252-255`) |

So the `isBatching` guard — written for exactly the right reason, *"the model is in an incomplete
state — validating now produces spurious compliance errors"* — sits on the path that never fires,
while the path that does fire has no such guard. **A generator emitting 400 commands is throttled by
an 800 ms debounce, not excluded.**

**Binding on Slice 1**: a C83 rule MUST check `batchCoordinator.isBatching` **itself**, or be
registered behind a `_scheduleRun`-equivalent — it may not assume the engine's suppression covers it.
This is not a performance concern; it is §5's concern, because findings about intermediate states are
false positives and false positives are what get the whole surface muted.

The load-quiet latch is genuine but narrow: `_constraintQuietUntil` initialises to
`Number.POSITIVE_INFINITY` (`initDataPlatform.ts:295`) and is only ever lowered, to `Date.now() +
2000`, inside the `pryzm-project-loaded` handler (`:297`). **If that handler ever stops firing, every
automatic constraint run dies silently** — Slice 1's precondition (b).

Note also `__pryzmLoadActive()` (`WallOccupancyStore.ts:60-68`), which suppresses logging during
project restore and generation for the same reason. **A C83 evaluator MUST honour these flags
explicitly.**

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

### §5.2.1 — ⚠ The worst outcome already ships, and it is the one to design against

`RoomValidationService.ROOM_AREA_TOO_SMALL` / `ROOM_AREA_OVER_TARGET`
(`packages/spatial-index/src/RoomValidationService.ts:124-137`) are guarded on
`window.roomSystemTypeStore`, which is **never assigned anywhere in the repository** — six
occurrences, all reads or type declarations; `new RoomSystemTypeStore` returns zero hits. **The guard
fails CLOSED into a green "✓ No issues found."** A 2 m² bedroom renders identical to a conforming
room. **Absence-of-check and absence-of-defect are the same pixels** — the context-data-honesty
defect, in the exact surface C83 wants to occupy. (`validateLevel` at `:192-214`, the "badge counts
on toolbar" reader, has **zero callers repo-wide**; that badge does not exist.)

⚠ **And two independent room-area authorities both reach the user and disagree**:
`ConstraintEngine.ROOM_MIN_AREA` (hardcoded table `:65-94`) versus the above — different codes,
thresholds, severities and panels. **C83 must not become a third.** Where a C83 rule overlaps an
existing one, it replaces it or defers to it; it does not sit beside it.

**Binding**: a C83 rule that cannot compute its own precondition **emits nothing and records why**.
It may never render a pass it did not compute — which is the same rule as §5.3, stated from the
failure side rather than the data side.

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

### §8.0.1 — ⚠ THE ORDER CHANGED 2026-08-14, and the reason is worth more than the order

The first draft opened with the IMPOSSIBLE wall × opening rule, on the argument that it is
unambiguous and needs no judgement. **The survey did not refute the rule; it refuted its cheapness.**
Three measured facts moved it:

1. **It is ENFORCEMENT, and ENFORCEMENT costs a contract row.** C74 §2's protected table has exactly
   one entry. A second is a C74 edit in the same PR (§1.1.1) — real work, and correctly so.
2. **Its delivery trigger does not exist.** The `wall.create` planner is registered
   (`consequencePreviewServiceComposition.ts:63-87`) but `wireToolForConsequencePreview` has **zero
   callers repo-wide**, and `triggerConsequencePreview` has exactly one production caller
   (`MovePlanToolHandler.ts:256`) which returns early unless `_targetType === 'wall'`. The registry's
   own comment names the class: *"authored and proven standalone (38/38) but registered nowhere."*
   **The engine is done; the trigger is the missing piece** — and C11 §7.6 warns precisely about what
   happens if you ship the refusal without it: *"a rejection surfaces to the user as a DEAD CLICK
   BEHIND A PERFECT PREVIEW."*
3. **A strictly cheaper, strictly more urgent item was found in the same family** — and it is a
   regression, not a feature (Slice 0).

So the order is now: **fix a regression → ship one advisory rule → make the graph honest → thread the
swing → then the enforcement rule.** The founder's headline case is *later, not smaller*, and Slice 0
delivers a real piece of it on day one.

### Slice 0 — plan-view opening occupancy parity (REGRESSION FIX, not a feature)

*Ship this first and independently. It is the §0.2.2 defect's sibling and it is two lines.*

- **The defect**: `canPlace` guards the 3D path (`DoorTool.ts:238/:477`) and **not** the plan path.
  `DoorPlanToolHandler.ts:85-179` → `CreateWallOpeningLegacyAdapter.ts:50-77` performs structural
  checks only, and `WallStore.addOpening:927-957` applies Zod + rake only. **Two overlapping doors
  are creatable from plan view; the identical action is refused in 3D.** `CopyPlanToolHandler.ts:370`
  pastes through the same unguarded verb. The bridge was removed for C11 §3 single-pipeline
  compliance (`initBusHandlers.ts:2340-2345`) and the replacement never inherited the gate.
- **The fix**: call `canPlace` + `canPlaceRefusalText` in `CreateWallOpeningLegacyAdapter.canExecute`,
  exactly as the sibling handler `plugins/wall/src/handlers/CreateWallOpening.ts:128` already does
  one file away. ⚠ **Import from `@pryzm/geometry-wall`** (arc-aware, rake-refusing) — **NOT** the
  drifted plugin copy at `plugins/wall/src/occupancy.ts`, which uses **chord** length (wrong on
  curved hosts) and lacks `OCC_HOST_RAKED`.
- **Why safe**: pure `canExecute` addition; no new vocabulary (the closed union exists); no second
  mutation path (C67 §2); the executed test pattern already exists
  (`packages/command-registry/__tests__/canPlaceRefusalIdentity.test.ts`, `6688d82c`).
- **Does NOT cover**: anything about walls. This is opening-vs-opening only.

### Slice 1 — `FURNITURE_BLOCKS_DOOR` (ADVISORY, the founder's second case)

*Promoted to first rule because it needs **zero** new geometry, refusal vocabulary, UI surface or
schema change — and it establishes role-keying as **data** (§2.2.1) rather than as a fifth taxonomy.*

- **Detects**: furniture whose footprint intrudes a door's clearance, in the room that
  **geometrically** contains it.
- **Classification**: **ADVISORY** (C74 §1.1). It flags; it does not refuse. **Slice 1 must not mint
  a second ENFORCEMENT family.**
- **Reuses**: one `this.register({...})` in `ConstraintEngine._registerBuiltIns`; `_getContext`
  (`:234-243`) gains `roomContentsService` — **not** the furniture store, because the service already
  has all fourteen stores attached and already returns a typed `undetermined[]`. Reads exactly
  `hosted.doors` and `contained.furniture`; **`hosted.windows` is deliberately not read — that is the
  semantic-role decision, expressed as code that does not exist.**
- **Geometry**: the **symmetric keep-out proxy** (`placeSolver.doorObstacles:139-203`,
  `swingR = max(doorWidth, 0.9)`), and **the message must say it is a proxy**, because `Door.swing`
  does not reach the opening. **Do NOT import `doorSwingKeepout.ts`** — it has no hinge data to run
  on; wiring it is Slice 3, with a schema change at its head.
- **Surfaces at**: `CompliancePanel` via the **Data pill / F3 → VALIDATE → Compliance**
  (`WorkspaceModeBar.ts:89`, `DataWorkbench.ts:406`) — severity, rule, element, message, regulation,
  suggestion and row-click-to-navigate all render with **no new code** (`CompliancePanel.ts:415-441`).
  ⚠ It also reaches the compliance tint and both toasts, but those are **preference-gated OFF by
  default — do not claim them.** ⚠ The *"🏗 Data toolbar button"* is **DEAD** (`.plat-toolbar` is
  never in the DOM, ISSUE-LOG **L-870**); cite the Data pill / F3 path only.
- **Tested by**: positive (sofa in a door swing → 1 warning); **silence, three ways, all mandatory** —
  *sofa in front of a window → **0** findings* (this is the assertion the whole brief turns on);
  *bed under a window → 0*; *the same sofa rotated clear by 200 mm → 0*; **undetermined control** — a
  room whose `boundingWallIds` was never recorded (§0.2.1 defect 3 makes this the common case for
  hand-drawn rooms) → the rule emits **nothing and records why**, never a clean pass.
- ⚠ **Two honest preconditions to verify before committing**: (a) `ConstraintEngine` reads stores off
  `window.*` and touches `window` at module scope (`:113`, `:234-243`) — `check-constraint-honesty.ts:17-26`
  records this as why the gate cannot import it, so a rule added there **inherits that debt**;
  whether a runtime-composed alternative reaches hand-edits as reliably is **UNPROVEN**.
  (b) `initDataPlatform.ts:~297` initialises `_constraintQuietUntil = Number.POSITIVE_INFINITY`, an
  infinite latch released only inside the `pryzm-project-loaded` handler; it works today only because
  of module ordering. One executed probe closes it.
- **Does NOT cover**: refusing anything; producing a fix command (§5.1 of the survey remains the true
  gap — Slice 1 emits the finding in the *shape* a later capability can consume: typed `ruleId` +
  `elementId` + both numbers); firing during the gesture.

### Slice C — make `contains` reachable (its own slice, and NOT a blocker for Slice 1)

*The coordinator asked whether this deserves its own slice. It does — and it must not be smuggled
into Slice 1, because Slice 1 is correct without it and would be made **worse** by it today.*

- **What it is**: stop dropping `hostedSpaceId` at the three named sites —
  `CreateFurnitureBatch.ts:99-122` (`Furniture.parse(seed)` strips it),
  `CommandEventBridge.ts:687-736`, `initTools.ts:2011-2033` — so the AI path's already-computed answer
  (`buildFurnishCommands.ts:76`) survives to `CreateFurnitureCommand.ts:246`. Three drop sites, no new
  concepts.
- ⚠ **HARD PRECONDITION**: `graphmove.cert.ts` classifies `contains` as **ID-KEYED** ("surviving a
  move is CORRECT"). **That classification must be corrected to position-derived in the same PR.**
  Landing the edge under the current classification would ship a relationship that keeps asserting the
  bedroom after the sofa is dragged to the kitchen, with no refusing reader to catch it — **strictly
  worse than the absence it replaces.**
- **Also owed by C71 §2.6** in that PR: a **typed** reader (the `contains` family has none — only four
  families do), a rebuild disposition, and delete behaviour.
- **Why it is NOT a Slice 1 dependency**: Slice 1 resolves containment geometrically (§0.2.3), which
  is fresher, self-correcting, and covers hand-placed furniture that this slice still would not.
  Slice C gives the Living Graph a fact it currently only pretends to have; it does not make any C83
  rule possible that was impossible before.

### Slice 3 — `Door.swing` reaches the evaluator (enabler; no user-visible rule)

*Deliberately a rule-free slice, because shipping a swing rule on box geometry would be a confident
wrong answer.*

- **Closes**: [ISSUE-LOG L-856](../../04-reference/ISSUE-LOG.md) — thread `Door.swing` from the
  schema through the wall-opening boundary into `OpeningPose` (`placeSolver.ts:184-185` is where the
  hinge side is currently absent).
- **Unblocks**: `doorSwingKeepout.ts`'s already-written sector geometry and its hard rejector
  `rejectFurnitureClashingDoors:113`; `SPEC-49`'s CI-3 remediation. Unwired since `bd43b2bf`
  (*"engine wiring follows"* — it never did).
- **Upgrades Slice 1 in place**: the proxy disclaimer comes out of the message and the real sector
  goes in. The existing `furnitureDoorClearanceAudit` corpus is the verification — the 3/288 true
  intrusions become detectable where the box finds 0/288.
- **Does NOT cover**: replacing the four duplicated box copies (separate, sequenced clean-up).

### Slice 4 — `OCC_CROSSES_HOSTED_OPENING` (ENFORCEMENT, the founder's headline case)

*Last, not least. It is the only slice that refuses, and refusal is the expensive verdict.*

- **Detects**: a proposed or moved wall whose centreline crosses an existing wall at a station that
  falls inside one of that wall's `openings[]` intervals.
- **Reuses**: `WallCreateConsequencePlanner`'s existing `segmentsProperlyCross` crossing set
  (`:571-581`) — the crossed wall ids are already computed; `getOccupiedSpans(wall)`
  (`WallOccupancyStore.ts:684`) for the intervals; the crossing parameter along the crossed wall for
  the station. **No new geometry, no new store, no new panel.**
- **Adds**: one member to `CanPlaceRefusalCode`, its roster entry, its default sentence (all three
  forced by the compile-time completeness assertion), and the branch that calls it.
- ⚠ **Also adds, and this is the part that is not geometry**: a **second row in C74 §2's protected
  ENFORCEMENT table, in the same PR** (§1.1.1); and **the missing trigger** —
  `wireToolForConsequencePreview` has zero callers, so `triggerConsequencePreview` must be called from
  the wall tool. **Shipping the refusal without the trigger produces C11 §7.6's dead click behind a
  perfect preview**, which is a worse user experience than the silent bug it replaces.
- **Reuses the already-proven predicate rather than inventing one**: the generator's
  **`§DOOR-CLEAR-OFFSET`** (`packages/ai-host/src/workflows/apartmentLayout/tgl/wallsAndDoors.ts:1170-1260`)
  is *the exact predicate* for "a wall crossing a door opening" — it projects a perpendicular wall's
  endpoint into a door footprint. It exists, it is proven, and it currently resolves the conflict by
  **moving the door**. Extract its endpoint-projection into a pure package and call it here; C83
  changes only *what is done about it* (refuse the wall, offer the alternatives), not how it is
  detected. §6.2's promote-don't-re-author rule, applied.
- **Offers**: the two nearest clear stations, each pre-validated by `canPlace` — or, per §4.2,
  **nothing but a reason** when the wall has no clear interval wide enough.
- **Delivered through** the existing `ConsequencePlan` → `ConfirmationCard`, and spoken in chat via
  `ZeroTokenUiHooks.confirm(summary)` — so the founder's *"do you want to move the wall upwards or
  backwards?"* is answered in the place they asked for it. One plan, two prompts (§4.1).
- **Tested by**: positive (wall crossing a window → fires, exact code); **silence** (a wall
  T-junctioning into a clear stretch of the same wall → zero findings; a wall merely *touching* an
  endpoint → zero, since `segmentsProperlyCross` is deliberately strict); near-miss (crossing 10 mm
  clear of the opening edge → silent); the full generated-building corpus → **zero findings**, since
  generators do not author this defect.
- **Does NOT cover**: furniture; curved hosts (the resolver is chord-based — declared `undetermined`,
  not guessed); walls on different levels; **wall × wall solid overlap with no opening involved** —
  that is declared `ENGINE_NOT_AVAILABLE` in those words at `WallCreateConsequencePlanner.ts:362-372`,
  and `WallJoinResolver`'s complete clash trim is **DEFAULT-OFF** behind
  `globalThis.__pryzmWallFaceTrimNoClash` because enabling it turns 20 assertions across 11 files red
  (L-94). **Do not absorb that into this slice.**
- ⚠ **Binding on the delivery**: **C68 §4 applies**
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
- **Precondition** carried from Slice 1's lessons: any room whose bounding relationship is
  `undetermined` (§0.2.1 — the *common* case for hand-drawn rooms and for generated levels after a
  wall move) yields **no finding and a recorded reason**, never a refusal and never a pass.

### §8.1 — Sequencing, and what blocks what

| Slice | Verdict class | Blocked by | Delivers to the founder |
|---|---|---|---|
| **0** — plan-view `canPlace` parity | (regression fix) | **nothing** | overlapping doors stop being creatable in plan view |
| **1** — `FURNITURE_BLOCKS_DOOR` | ADVISORY | **nothing** | *"a sofa should never be in front of a door"* — flagged, with the window case provably silent |
| **C** — make `contains` reachable | (graph honesty) | its own `graphmove.cert` reclassification | the Living Graph stops pretending to hold a fact it has never held |
| **3** — `Door.swing` → `OpeningPose` | (enabler) | nothing; upgrades Slice 1 in place | the swing rule becomes *true* rather than a documented proxy |
| **4** — `OCC_CROSSES_HOSTED_OPENING` | **ENFORCEMENT** | C74 §2 row + the missing preview trigger | *"an interior wall can not be in the same place where a window is"* — refused, with alternatives |

**Slices 0, 1 and C are each unblocked today and independent of one another.** Slice 3 is unblocked
but has a schema change at its head. **Slice 4 is last by cost, not by importance** — it is the only
one that refuses, and refusal is the verdict that must not be shipped behind a dead click.

⚠ **Slice 1 ships on the proxy and says so.** That is not the same defect as shipping Slice 4 early:
a disclosed proxy in an advisory message is honest and upgradeable in place; an undisclosed
swing-shaped claim from a box-shaped test is the confident wrong answer §4.2 forbids. The distinction
is **disclosure**, and Slice 1's message text is where it lives.

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

- **Nothing here is executed.** §0.2–§0.3 are file reads at HEAD `28c6b05c`, corroborated by a
  26-agent prior-art survey with adversarial reachability checking on 2026-08-14. Where a run
  disagrees with this document, **the run wins**.
- ⚠ **One claim is explicitly an INFERENCE, not a reading**: §0.2.2's conclusion that a plan-placed
  door's `hosts` edge is *never* reconstructed follows from two file reads (`ProjectLoader.ts:1879`'s
  `size === 0` gate and `ProjectSerializer.ts:1083`'s unconditional serialise). **UNPROVEN. One
  executed probe settles it, and C83 builds nothing on it.**
- **§0.2.3 corrected a premise this contract shipped with.** The first draft (`28b47ec1`) asserted
  that generated furniture carries the `contains` edge. It does not; **no path does.** The correction
  strengthened rather than changed the design, which is luck, not method — recorded so the next
  reader treats §0.2's verdicts as measured rather than assumed.
- **Two upstream corrections this contract depends on and does not own**: `graphmove.cert.ts`'s
  ID-KEYED classification of `contains` (Slice C's hard precondition), and C71 §5.2's now-stale
  *"`contains` has no first-party writer"* (a writer landed 2026-08-13; the reachability gap is at
  the **call sites**, not the writer).
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

---

## §10 — §JOINT-AUTHORITY-IS-THE-INCUMBENT (founder-stated 2026-08-15, MINTED same day)

> Stated verbatim by the founder while reporting L-919/L-920/L-922, and minted here because four
> production defects in one day were the SAME rule violated at four seams:
>
> *"The perimeter wall joints — **NEVER** should be changed after creation because an interior wall
> is created. **NO MATTER the mitre joint. NO MATTER the type of wall.** The 3rd wall created in
> this case needs to **ADAPT and connect with the FACE of the wall originally there.**"*

### §10.1 — The invariant (MUST)

**An existing junction is AUTHORITATIVE. The gesture's SUBJECT is the only wall whose baseline may
change.** A wall being CREATED onto, or MOVED against, existing walls ADAPTS to them — trimmed or
terminated at the incumbent's **FACE** — and the incumbents' resolved geometry comes out
**byte-identical**. This holds regardless of wall type (layered or not), regardless of the
incumbent's mitre style, and regardless of angle: the founder closed both escape hatches explicitly.

An enclosed-polyline perimeter is incumbent **by construction** for every interior wall that later
touches it (L-922: a move-reweld that shifted a perimeter baseline ~2.19 m, proven by three hosted
doors re-seated by the same delta, is this invariant violated on the MOVE path).

### §10.2 — MUST NOT

1. A junction resolver MUST NOT re-solve, re-mitre, or re-cluster walls that were already joined
   because a newcomer arrived (L-920: a third wall re-clustering a correct 2-wall L into a 3-wall
   problem is the mechanism, not a side effect).
2. A re-weld MUST NOT close a joint by moving a non-subject wall's baseline (L-922).
3. A creation MUST NOT be "resolved" by interpreting a snap point as "start my centreline here" —
   a snap onto a wall's body means **join here**, and the newcomer terminates at the face (L-919).
4. An impossible adaptation MUST NOT be absorbed by a silent clamp (a hosted opening re-seated to
   offset 0.000 is a clamp standing where a refusal belongs).

### §10.3 — The refusal arm (MUST)

If the newcomer cannot be soundly adapted to the incumbent's face, the gesture REFUSES per §4's
offer shape — naming the rule and both numbers — or, for a cascade mid-gesture, the whole gesture
resolves per U-INV-8/U-INV-9 (C78): the plan executed is the plan approved, one gesture is one undo
unit, and a dependent cascade's refusal either aborts the gesture or is REPORTED to the user in the
same breath. Half-applied-and-silent is the one forbidden outcome (L-921).

### §10.4 — The test this section makes mandatory

Every junction-touching change (create, move, re-weld, infill) MUST carry an
**incumbent-unchanged assertion**: capture the incumbent walls' resolved geometry BEFORE the
gesture, perform it, assert the incumbents byte-identical. **This is the half that was silently
failing everywhere** — every prior fix asserted on the newcomer, and nothing asserted the incumbents
stayed still, which is why the defect family survived fix after fix.

### §10.5 — Residency

Violations are C83-taxonomy IMPOSSIBLE-class findings (§1.2 — two mutually exclusive claims about
one volume, here about one JOINT). Open instances at mint time: L-919 (CREATE), L-920 (infill),
L-921 (gesture atomicity), L-922 (move-reweld) — each laned, each owing the §10.4 assertion.
Tolerances touched by any fix are CONSUMED from `@pryzm/geometry-kernel` per C73 §2.2, never minted.

### §10.6 — ⭐ THE MUTUAL 2-WALL L — the one case where the PARTNER follows (founder-stated; MINTED 2026-08-17)

> ⚠ **This section was CITED BEFORE IT EXISTED.** Three commits — `7bccc3d3`, `73dceaff`,
> `6183b9a3` — carry `C83 §10.6` in their subject or body while §10 ended at §10.5. That is the
> §7B.7 defect class ("claims of enforcement that were not enforcement") pointed at a contract
> rather than a gate: a citation that resolves to nothing reads as authority and enforces none.
> Minting it here pays that debt. **The content below is derived from founder statements, not
> invented to fit the citations** — the earlier commits' *use* of "§10.6" was about weld authorship
> generally, and is subsumed by §10.1 + this section.

#### §10.6.1 — Why §10.1 alone is not sufficient, stated plainly

**§10.1 as written covers this gesture and gives the wrong answer for it.** *"A wall being CREATED
onto, or MOVED against, existing walls ADAPTS to them"* — read literally, when the user drags one of
two interior walls that meet in an L, the partner is an incumbent and MUST NOT move. Measured
behaviour matches the text exactly: `classifyWeldAuthorship` sees the partner's endpoint inside
`cornerBandM` of the mover's own endpoint, returns `corner`, and §10.2.2 forbids moving a non-subject
baseline. **The engine is obeying the contract. The contract was incomplete.**

The founder has reported the resulting behaviour as a defect **four times** (L-921, L-922, L-925,
L-936) and stated the intent directly:

- *"A RIGHTFULLY MOVE A PERIMETER WALL SEGMENT — THE INTERIOR WALLS WITHIN THE SCOPE SHOULD FOLLOW
  ALLONG"*
- *"the perimeter wall joints — NEVER should be changed after creation … no matter the mitre joint,
  no matter the type of wall"*
- *"two interior walls connected on L shape — one of them gets moved — the other in this precise
  scenario should follow"*

**Those two rules are not in tension; they are one rule with two sides**, and §10.1 only wrote down
the second.

#### §10.6.2 — The invariant (MUST)

> **When the gesture's SUBJECT and exactly ONE partner meet at a MUTUAL corner that the two of them
> jointly own, the partner FOLLOWS. Everywhere else §10.1 stands unchanged and the incumbent is
> untouchable.**

A corner is **MUTUAL** when all of the following hold. All four are MEASURED, none inferred:

| # | condition | why it is the right test |
|---|---|---|
| 1 | the stored junction reads `junctionType === 'L'` **and** `junctionDegree === 2` | `JunctionResolverV2` already computes this and `replaceJoinedToForLevelWalls` already **stores** it. It is read from the model, not re-derived from geometry. |
| 2 | the junction's participants are exactly `{subject, partner}` | degree 2 with no third wall — nobody else's authority is at stake |
| 3 | the subject's nearer endpoint was within `weldTol` of the partner's welded endpoint **BEFORE** the move | they were joined to begin with; this is a re-weld, not a new adjacency |
| 4 | the partner's FAR endpoint is held FIXED and its direction unchanged | the partner pivots at the shared corner; it is not translated |

⭐ **Condition 1 is the whole safety argument, and it is why this carve-out cannot reopen L-922.**
That regression — an interior move dragging a **perimeter** baseline 2.19 m and re-seating three
hosted doors — was measured as a `T` junction at **degree 3**. Interior↔interior reads `L`/2;
interior↔perimeter reads `T`/3. **The topology separates the two cases by measurement, not by
naming, intent, or a wall-type flag.** An enclosed-polyline perimeter remains incumbent by
construction (§10.1) and can never satisfy condition 1.

#### §10.6.3 — MUST NOT

1. **MUST NOT** follow when the junction has **degree ≥ 3**, whether that degree is READ from the
   stored record or MEASURED. This is the L-922 guard and it is the only load-bearing half.

   ⚠⚠ **AMENDED 2026-08-17 (L-942, founder-directed), and the original text is kept because the
   reasoning behind it was sound and only its CONSEQUENCE was wrong.** This clause read:

   > *"Absent metadata means DO NOT FOLLOW — a missing discriminator is «I could not determine»,
   > never «L» (C70 L-INV-1)."*

   **Measured on the founder's own model**: production `joinedTo` edges frequently carry no
   metadata, so a perimeter wall dragged **past a neighbour's far end** could not close the corner
   on any gesture — the neighbour would have to lengthen, `INCUMBENT_EXTENSION_REQUIRED` refused,
   and the founder reported it as *"everything works — only when the wall surpasses the vertex it
   corrupts."* Inwards worked (the corner lands ON the neighbour, nothing must move); outwards did
   not (the corner lands PAST it, the neighbour must grow).

   ⭐ **THE RESOLUTION: DEGREE IS MEASURABLE, AND THE TYPE LETTER WAS NEVER THE SAFETY ARGUMENT.**
   - **Keyed on `junctionDegree === 2`, not on `junctionType === 'L'`.** §10.6.2's argument is
     *"degree 2 with no third wall — nobody else's authority is at stake"*, which is a statement
     about PARTICIPANT COUNT. The letter is redundant with it, and on a real cross-shaped perimeter
     the resolver may legitimately record a 2-wall corner under another letter for an obtuse or
     reflex turn.
   - **Absent record ⇒ MEASURE the degree** by counting wall endpoints within `weldTol` of the
     welded point. **§10.6.3 #2 still stands unchanged**: the MUTUAL-vs-TERMINATING distinction may
     never be re-derived from geometry, because those two are the same picture. **Degree is a
     different question** — it is defined as *how many walls meet at this point*, and counting them
     measures the same number the metadata stores. It is not a category guess, and it cannot
     disagree with a stored record because it never runs when one exists.

   **C70 L-INV-1 is not weakened.** *"I could not determine"* remains forbidden as an answer — the
   amendment removes the need to say it, by measuring the thing that was missing rather than
   guessing it.

   *Pinned by:* `wallMoveReweldSeam.test.ts` — the `T`/degree-3 control goes **RED** when the degree
   guard is removed (verified 2026-08-17), and an absent-metadata 2-wall corner now asserts the
   follow, the pivot, and a closed perimeter.
2. **MUST NOT** re-derive the mutual/terminating distinction from geometry. Both cases are "an
   endpoint near an endpoint"; that is precisely why `classifyWeldAuthorship` folds them into one
   verdict today. **The discriminator is stored — read it.**
3. **MUST NOT** move the partner's far endpoint, change its direction, or alter its length beyond
   the seat solution.
4. **MUST NOT** drop the existing guards. The seat is `intersectLines(welded, far, newS, newE)` and
   `computeStemFollow`'s `STEM_REVERSAL` / `STEM_COLLAPSE` / `STEM_EXTENSION_EXCEEDS_CAP` apply
   verbatim. A follow that would collapse or reverse the partner **REFUSES** — it does not clamp.
5. **MUST NOT** treat this as licence to widen §10.1. This is a carve-out of one measured topology,
   not a softening of incumbent authority.

#### §10.6.4 — The refusal and reporting arm (MUST)

When the follow is declined for any reason in §10.6.3, the outcome **carries identity and BOTH
numbers** and **reaches the user**. L-936 measured why this clause is not optional: the engine
already computed `INCUMBENT_EXTENSION_REQUIRED: the new corner falls 600 mm past that` and it
reached nobody, because `WallMoveReweldService.report()` is `this.deps.onConsequence?.(r)` and the
one production construction site omitted the field. **An absent sink is a silent no-op** — L-921's
own fix, authored and unreachable (fixed `89f8d501`).

⚠ **And the dispatch line must distinguish "no partner found" from "partner found and declined".**
Those rendered as the same eleven words, and **six rows in this family were triaged against that
misreading** (fixed `09e248c1`).

#### §10.6.5 — The test this section makes mandatory

Every fix claiming §10.6 asserts, at the **STORED** layer:
- the partner's baseline in the store **DID** change, seated at the analytic intersection, on a
  mutual `L`/degree-2 pair; **and**
- a `T`/degree-3 interior↔perimeter pair in the **same** fixture is **byte-identical** before and
  after — the L-922 control, which must be present or the L-922 regression is unguarded; **and**
- an absent-metadata case takes the pre-§10.6 branch byte-identically.

#### §10.6.6 — Residency and status

✅ **CONFIRMED BY THE FOUNDER 2026-08-17.** This section was minted AWAITING CONFIRMATION because it
**changes what §10.1 permits** and no lane may widen incumbent authority on an agent's reading of
intent. The founder confirmed §10.6.2 as written, in response to a direct choice between shipping it,
downgrading the gate to a warning, rolling the deploy back, and inventing a shift threshold.
**§10.6 is now BINDING and §10.1 must be read as qualified by it.**

#### §10.6.7 — ⚠ WHAT THE CONFIRMATION DELAY COST, recorded so the pairing rule is not learnt twice

**The incumbent gate and this carve-out were designed as a PAIR and only the refusing half shipped.**
`moveReweldPreflight` + the `incumbentBreach` arm went to production in `c2e8ba00`; §10.6 stayed
unconfirmed. Measured at the previous release `52bfb2ba`: `moveReweldPreflight.ts` **did not exist**
and `wallPlacementGate` contained **zero** occurrences of `incumbentBreach`.

The result was **L-942 — every wall move that broke a junction hard-blocked in production**, on the
single most common gesture in the product, reported by the founder within hours of the deploy. The
gate's own log stated the position exactly: `cascade ok=true, incumbentBreach=true` — *the geometry
was sound and the policy refused anyway.*

> ⭐ **THE RULE, AND IT GENERALISES BEYOND THIS CONTRACT: a REFUSING half and its ESCAPE HATCH ship
> together, or neither ships.** A gate that can only say no, whose "yes" branch is blocked on a
> pending decision, is not a partial feature — it is a **regression with a contract citation
> attached**. Sequence the decision BEFORE the gate, or hold the gate.

⚠ And the second half, which is the cheaper lesson: **no test exercised a wall move at the GESTURE
layer.** Every existing test drove `moveReweldPreflight` directly, so all of them passed while the
gesture was dead — [[committed-is-not-reachable]] again, and the reason the founder found this
rather than CI. §10.6.5's assertions are at the STORED layer for precisely this reason.

#### §10.6.8 — Residency

Tolerances CONSUMED from `@pryzm/geometry-kernel` per C73 §2.2 — `weldTol` and `cornerBandM` are not
re-declared here. Open instance at mint time: **L-936**. Instance that forced confirmation: **L-942**.
Implementing commit: `53f93049` (the discriminator was already STORED; `getJoinedWalls` was
discarding it one line after loading it).

