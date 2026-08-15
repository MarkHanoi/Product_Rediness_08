# C79 — Region Semantics & Derived Boundary

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: every creation path in this repository that derives an element's boundary from **other elements** rather than from coordinates the user drew — the "By Region" family (slab, roof, and any future ceiling / floor-finish mode), the pick-the-boundary family (`SlabPickWallsController`), and the room-boundary-copying commands (`CreateFloorCommand`, `CreateCeilingCommand`, and their by-room batch siblings). Owns **what a region MEANS**, the attribution rules that decide which bounding element an edge belongs to, the reference-frame decision, the degradation path, and the five distinguishable recomputation outcomes. Does **not** own: the tracing algorithm, the wall-face resolution maths, the command envelope (C16), or the creation pipeline's stages (C11).
> **Key principle**: *A region is a relationship the user expressed, not a quadrilateral they happened to enclose.* Where a semantic boundary relationship exists at creation time, discarding it is a **loss of authored information**, and the loss is silent — which is what makes it a contract concern rather than a bug.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`, and to [**C78**](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md), the universal relationship & consequence contract. **C79 is C78's REGION SPECIALISATION.** Where C78 states a general rule about relationships and their consequences, C79 MUST NOT restate it; C79 states only what is specific to *region-derived boundaries* — the tracer as the attributing authority, the by-construction rule, the traced-frame decision, and the two-buttons-differ asymmetry. **C78 was minted the same day as C79, in parallel** (both stamped 2026-08-12); the two were authored without sight of each other, so **§9.7 makes a cross-read against C78 an exit condition** — any C79 clause that turns out to duplicate a C78 clause MUST be deleted from C79 in favour of the universal one, not kept in both. In particular, C79's §5 five-state vocabulary and C78's UNDETERMINED-with-a-typed-reason rule are answering the same question and MUST be reconciled to one vocabulary.
> Peers with **C11** (element creation pipeline — owns *where in creation* a boundary is resolved and where a refusal may be raised), **C15** (hosted elements — owns the host↔hosted domain rule for openings; C79 is the same shape applied to *boundaries* rather than *openings*), **C16** (command authoring — owns how a refusal and an undoable degradation are written, incl. `CA-DOCTRINE-A`), **C65** (element type system), **C70** §2 pillar F (propagation invariants F-INV-1…F-INV-3, which C79's §5 instantiates for boundaries), **C71** (graph & topology — owns the `boundedBy` edge family and the six required per-edge semantics), **C72** (propagation & `prevState`), **C73** (geometry determinism — owns the tolerance under which "the same ring" is the same ring), **C74** (constraint honesty — the *did the work happen* sibling; C79's fallback-counting rule is C74's refusal idiom applied to attribution), **C75** (provenance — owns whether a value's origin may be invented; C79 §2.3 is C75's rule applied to `hostId`).
> **Gate**: `tools/ga-gate/check-region-host-attribution.ts` — **UNBUILT at stamp time** (§6). No gate asserts any clause of this contract today.
> **Changelog**: 2026-08-12 — created, from the founder-found slab-by-region defect closed in `e6c8cb58` and the five still-open instances the fix did not reach.

---

## §0 — Why this contract exists

The founder asked a five-word question: *"closed polyline of walls → slab by region → move a
wall — does the slab follow?"*

The measured answer was **no, silently**, and the mechanism is worth stating exactly, because
every clause below is a generalisation of it.

- `SlabRegionTracer` **received the wall array**. It walked their centrelines to close the
  ring. Then it **returned bare `{x, y}` points and threw the wall ids away**
  (`packages/geometry-slab/src/SlabRegionTracer.ts:44-62`, the docstring that now records the
  defect).
- `SlabDependencyTracker.registerSlab` indexes a slab's dependencies by walking its sketch for
  `edge.type === 'hostReference'` (`packages/geometry-slab/src/SlabDependencyTracker.ts:86`).
  A ring of bare points produces **zero** such edges. So a region slab registered an **empty
  dependency graph** and could never be re-projected when a bounding wall moved.
- Meanwhile the *pick-the-walls* path — the other button, in the same tool, for the same
  outcome — emitted `HostReferenceEdge`s and **did** follow
  (`packages/geometry-slab/src/SlabPickWallsController.ts:218-225`).

**Two buttons that look identical behaved differently, with no error, no warning, and no
degraded-mode indication.** The information was never missing: the wall ids were in the
tracer's own input. They were discarded on the way out.

This is the same class of failure C74 §0 enumerates — *a measurement whose subject was not the
thing being claimed* — pushed into the model layer: **a relationship that was expressed,
recorded as coordinates, and therefore unrecoverable.** Coordinates are lossy with respect to
intent. A user who clicks inside four walls has said *"the floor of this room"*; a user who
draws four lines has said *"this quadrilateral"*. Once both are stored as four line segments,
nothing downstream can tell them apart — and the system will treat the first as the second
forever.

**Fixed for exactly one of six paths** in commit `e6c8cb58` (slab-by-region, plan view). The
asymmetry **moved rather than vanished**: `SlabTool.findRegionAtPoint`
(`packages/geometry-slab/src/SlabTool.ts:1416-1428`) still calls the bare-ring twin
`traceRegionAtPoint` and passes the result to `createSlabFromPolygon` (`:1399`, `:348`), so
**region-by-3D now produces a non-following slab while region-by-plan follows.** The user
cannot see which surface they used.

### §0.1 — The five open instances this contract governs

Measured at HEAD, all cited in `BIM30-PHASE0-RELATIONSHIP-INVENTORY.md` §5 (deleted 2026-08-15 in
the corpus collapse and not carried forward — see git history; the file:line evidence for each
instance is restated in full below, so this list stands on its own):

1. **Roof-by-region uses a SECOND, INDEPENDENT tracer.** `WallRegionDetector` in
   `@pryzm/geometry-roof` (`packages/geometry-roof/src/WallRegionDetector.ts:35`,
   `_extractSegments:80`, `_buildClosedLoops:88`). Its signature is
   `detect(hitPoint, wallStore): Pt[] | null` (`:44`) and its walk returns
   `loopIdxs.map(idx => points[idx])` (`:193`) — **a projection to coordinates that discards
   wall identity before returning. There is no field to fill in.** The roof gap is therefore
   NOT a missing call to an existing function.
2. **`SlabTool.ts` (3D) is unfixed** — `:1424`, above.
3. ~~**Ceilings have no region mode at all.**~~ **CLOSED 2026-08-13 — CAPABILITY BUILT.**
   `apps/editor/src/engine/views/plantools/CeilingPlanToolHandler.ts` had **0 occurrences of
   `region`** (measured 2026-08-12); its AUTO-from-room gesture is now a region mode that derives
   from the room per §10.3.
4. ~~**Floor finishes have no region mode at all.**~~ **CLOSED 2026-08-13**, same commit, same
   shared attributor. The original finding, retained: neither (3) nor (4) could *inherit* a fix,
   because the capability did not exist — so this was new build, and §6.6 governed it. See §6.3
   rows 9–10.
5. ~~**`boundingWallIds: []` — a field that NAMES the dependency, written empty.**~~
   **CLOSED 2026-08-13 via §7.2(a) POPULATE** — both commands now write the walls that produced
   an edge of the boundary, and both write a reference-carrying `sketch`; see §6.3 rows 6–8 and
   the §10.3 decision. The original finding, retained: it was hardcoded at
   `packages/command-registry/src/floors/CreateFloorCommand.ts:231` and
   `packages/command-registry/src/ceilings/CreateCeilingCommand.ts:191`. Alongside it,
   `hostRoomId` (`:233` / `:192`) is read by `RoomFinishResolver` **for finish colour only —
   the boundary is never re-derived**, and `coveredRoomIds` (`:230` / `:190`) has **no reactor
   on room change**. The Phase 0 census: **14 fields name a dependency; 2 are honoured**
   (`hostSlabId` on floors, `hostId` on slab sketch edges); **12 are not.**

**One of six region paths retains the relationship.** That is the state this contract exists
to make visible and to close.

### §0.2 — What this contract is NOT

It is **not** a mandate to build a constraint solver (C74 §4.1 forbids reaching for one), and
it is **not** a design for any tracer. It contains **no implementation design**. It states what
must be true of any region path's *output*, and what a path must say when it cannot make that
true.

---

## §1 — The region as a first-class semantic

> **§1.1 — MUST.** A region-created element is **bounded BY REFERENCE, not by copied
> coordinates.** Every boundary edge that a creation path can attribute to a specific bounding
> element MUST be stored as a reference to that element — id + reference frame + offset — and
> never as a static coordinate pair standing in for one.
>
> The canonical shape at HEAD is `HostReferenceEdge`
> (`packages/geometry-slab/src/SketchTypes.ts:34-46`): `{ type, hostId, hostType, reference,
> offset, fallback }`, discriminated against `FreeLineEdge` (`:23-27`) in the
> `SketchEdge` union (`:48`). C79 does not mandate this *type* outside slabs; it mandates that
> whatever a family stores carries **the same five facts**.

> **§1.2 — MUST.** **Where a semantic boundary relationship exists at creation time, it MUST be
> retained.** This is the contract's central clause. The relationship's existence is decided at
> the moment of creation and cannot be recovered later (§2.3), so "retain it now or lose it
> permanently" is the actual choice — not "retain it now or retain it later".

> **§1.3 — MUST.** A region creation path MUST distinguish, in the record it writes, between
> edges that are references and edges that are not. A boundary in which the two are
> indistinguishable is a boundary in which the system cannot tell the user which parts of their
> element will follow — and per §5 it must be able to.

> **§1.4 — MUST NOT.** A region path MUST NOT present a user-facing affordance whose promise
> exceeds what it retains. The roof affordance reads **"By Region · Auto-detect from enclosed
> walls"** (`apps/editor/src/ui/layout/CreatePanelLayout.ts:310`,
> `elementCreationMatrix.ts:256`) — byte-for-byte the same promise the slab makes, over a path
> that retains nothing. Either the retention lands or the affordance states its limit; the
> current state is neither.

> **§1.5 — MUST.** Region-derived-ness is a property of the **element**, not of the tool that
> made it. Two elements with identical geometry, one traced from walls and one drawn freehand,
> are **different model records** and MUST remain distinguishable after a save/load round trip.
> (Persistence disposition per C71 §1 item 3 and C70 I-INV-2: an unretained region relationship
> is persist-or-lose and belongs on the named ledger, or it is regenerated — there is no third
> state.)

---

## §2 — Attribution: by construction, never by proximity

> **§2.1 — MUST.** An edge is attributed to a bounding element **iff that element's own
> geometry produced that edge during the trace.** Attribution is a fact carried forward from
> construction. It is a record of what happened, not a conclusion drawn afterwards.
>
> The rule as implemented and named in-tree (`SlabRegionTracer.ts:266-290`,
> `ATTRIBUTION_RULE`): *a chord is attributed to a wall only when produced by that wall's own
> centreline, the wall has an id, and the wall is straight (one chord); otherwise
> `hostId = null`.*

> **§2.2 — MUST NOT.** Attribution MUST NOT be re-derived by **proximity**, nearest-neighbour
> search, coordinate matching, or any other after-the-fact geometric query. This is not a
> performance preference. **Proximity is precisely where a WRONG `hostId` comes from**, and:

> **§2.3 — the reason, stated as its own clause.** **A wrong host is strictly worse than no
> host.** No host means the edge does not move — a visible, inspectable, correctable state that
> matches what the system did before the relationship existed. A wrong host means the element
> **follows the wrong element**, actively corrupting the model in a way that looks like working
> behaviour. An unattributable edge that guesses is C75's invention defect (`'auto-topology'`
> written over an unknown origin) reproduced in the boundary layer: **an unknown is upgraded to
> the most authoritative answer available.** A null `hostId` must remain representable and must
> never be rewritten to a plausible one.

> **§2.4 — MUST.** Attribution failure is **named**, not anonymous. Every unattributed edge
> carries a reason from a closed vocabulary. The three named at HEAD
> (`SlabRegionTracer.ts:251-260`) are the minimum:
>
> | reason | meaning | why refusal is correct |
> |---|---|---|
> | `curved` | the edge came from a tessellated arc | the face resolver has no notion of *"the 7th chord of this arc"*; attributing it would re-project every chord of the arc onto **one** straight chord and destroy the curve the tracer exists to preserve (`SlabRegionTracer.ts:279-282`) |
> | `noWallId` | the producing element carried no id | there is nothing to reference. Also the compatibility path: a caller passing bare `{ baseLine }` shapes keeps its exact previous behaviour (`:55-62`) |
> | `ambiguous` | two **different** bounding elements welded onto the same ring edge | this *is* the wrong-host scenario. It drops to `null` rather than keeping first-writer (`:388-399`) |
>
> A family MAY add reasons. A family MUST NOT collapse them into a single boolean: "curved" and
> "I gave up" are not the same value, and the roof detector's own good behaviour on its loop cap
> (`WallRegionDetector.ts:28-31,183-189`, L-699) is the precedent.

> **§2.5 — MUST.** **Curved boundaries ALWAYS fall back, and the count is RETURNED, never
> absorbed.** Attribution counts are part of the creation result, per reason:
> `hostEdges`, `freeEdges`, `curvedFallbacks`, `missingIdFallbacks`, `ambiguousFallbacks`
> (`SlabRegionTracer.ts:615-627`, populated at `:674-703`, returned at `:711-717`). The measured
> reference reading on the 3-straight + 1-arc fixture: **3 host edges, 16 curved fallbacks** —
> *a measurement, not a silent gap*.

> **§2.6 — MUST NOT.** A fallback MUST NOT be silently absorbed. A creation path that produces
> zero host references MUST be able to say so with a reason, and MUST NOT report the same
> success as a path that produced all of them. **Zero-host and all-host must not be the same
> value at the caller** — this is C74's rule (an adapter may not report work it did not perform)
> applied to boundary attribution. The slab plan handler's log line is the reference form: it
> reports all five counts and states plainly that *"free edges do NOT follow a wall"*
> (`apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:394-404`).

---

## §3 — The reference frame is a CONTRACTED decision, not an implementer's choice

`HostReferenceEdge.reference` is a five-member union — `'centerLine' | 'exteriorFace' |
'interiorFace' | 'coreExterior' | 'coreInterior'` (`SketchTypes.ts:15-20`). A region path must
pick one. **`e6c8cb58` picked `'centerLine'` at `offset: 0`, and this section contracts that
choice so a future implementer cannot silently pick a face.**

> **§3.1 — MUST.** A region-traced edge's reference frame MUST be **the frame the ring was
> actually traced on**, at **offset 0**. For every wall-region tracer in this repository that
> frame is the wall **centreline**: `wallPlanCenterline` samples `baseLine`, which
> `WallFaceResolver` documents as *"the wall's center line in world XZ space"*. At offset 0 the
> resolved segment **IS** the traced chord — the reference and the geometry the user saw are the
> same line.

> **§3.2 — MUST NOT.** A region path MUST NOT name `interiorFace`, `exteriorFace`,
> `coreInterior` or `coreExterior` for a centreline-traced edge. Two independent reasons, both
> measured, either sufficient:
>
> 1. **It moves the geometry.** Naming a face shifts every edge by half the wall thickness away
>    from where the user saw the region highlighted. The element would be created somewhere
>    other than where it was previewed.
> 2. **The side cannot be determined.** Interior/exterior sense depends on the wall's authored
>    **start→end direction**, which the ring walk does not preserve. Choosing a face would
>    therefore be **a coin flip** — a §2.3 wrong-answer, not a §2.4 honest refusal.

> **§3.3 — MUST.** If a future path traces on something other than the centreline, it MUST
> change §3.1's stated frame **in this contract, in the same PR**, with the traced frame named.
> The invariant is *"reference == traced frame"*, not *"reference == centerLine"*; the second is
> today's reading of the first.

> **§3.4 — MUST.** A region path's edge shape MUST be **byte-identical** to the already-working
> non-region path for the same family, where one exists. `e6c8cb58` copied the shape verbatim
> from `SlabPickWallsController.ts:218-225` rather than inventing one. Two shapes for one
> relationship is how two buttons come to behave differently (§0).

> **§3.5 — UNPROVEN.** Whether a **non-wall** bounding element (slab edge, roof edge, grid line,
> another region-derived element) has an equally unambiguous "traced frame" is **not settled by
> any evidence in this repository**: every region path at HEAD bounds against walls only. §3.1
> MUST NOT be assumed to extend to them without a measurement.

---

## §4 — Degradation: what happens when a bounding element is deleted

> **§4.1 — MUST.** Deleting a bounding element MUST NOT delete or invalidate the derived
> element. The reference degrades; the element survives. (C70 F-INV-3's *never delete a hosted
> element to make room*, applied to boundaries.)

> **§4.2 — MUST.** Degradation MUST go through an **undoable command**, never a direct store
> write. The reference form is `DegradeSlabSketchCommand`, constructed and executed by
> `SlabDependencyTracker.onWallRemoved` (`SlabDependencyTracker.ts:174-190`) after a
> `canExecute` check whose failure is **logged with the reason** (`:181-186`). Its direct
> `slabStore.update()` path is explicitly a **declared failure mode** — reached only when no
> command manager exists, and it warns that *"this degradation will NOT be undoable. This should
> never happen in normal operation."* (`:165-172`). That is the correct shape for a fallback:
> declared and audible. It is **not** a licence for new direct-write degradation paths (P6).

> **§4.3 — MUST.** The `fallback` geometry a reference degrades **to** MUST exist **at authoring
> time**, populated from the traced geometry itself.
>
> **This is a MUST because the alternative degrades to NOTHING.**
> `WallFaceResolver.degrade` → `resolveOrFallback` returns **`null`** when the host is gone and
> no fallback was stored (`SlabRegionTracer.ts:655-659`); `SlabDependencyTracker` then keeps the
> original unresolvable edge (`:146`, `if (!freeEdge) return edge`). Pick-walls relies on a
> later rebuild having cached one — **so a wall deleted before any rebuild leaves an edge that
> resolves to nothing.** A region edge already knows its own geometry when it is authored, so it
> MUST ship with the fallback rather than depend on a rebuild having happened first
> (`SlabRegionTracer.ts:686-694`).

> **§4.4 — MUST.** A degraded edge MUST be distinguishable from an edge that was never a
> reference. Degradation is a **state change with a cause** (`removedWallId` is carried on the
> command, `SlabDependencyTracker.ts:178`); collapsing it into an ordinary free edge destroys
> the only evidence that the boundary once followed something.

---

## §5 — Recomputation determinism and the five states

> **§5.1 — MUST.** After a bounding element moves, the derived geometry MUST be **deterministically
> re-derivable** from (references + offsets + the current state of the bounding elements) alone
> — the same inputs yielding the same output, under C73's declared tolerance policy. Re-derivation
> MUST NOT depend on how many times the element has already been re-derived, on iteration order,
> or on any cached intermediate that is not itself part of the model.

> **§5.2 — MUST.** The outcome of a re-derivation MUST be reported as **exactly one** of five
> states, and the five MUST be distinguishable from outside the recomputation:
>
> | state | meaning | the honest reading |
> |---|---|---|
> | **preserved** | the boundary is unchanged within tolerance — the move did not affect this element | nothing happened, and we checked |
> | **resized** | the boundary changed and the element re-derived cleanly at its new extent; topology (edge count, ordering, host set) is unchanged | the normal success case |
> | **regenerated** | the element was rebuilt from its references and the result is **topologically different** — edges merged, split, or a host set changed | success, but the user's element is not the shape they last saw |
> | **conflicted** | re-derivation produced a result that violates a rule the family enforces (self-intersection, degenerate area, an occupancy or validation refusal) | **a refusal, naming both numbers** per C73 §4 / C70 F-INV-3 — never a silent clamp, never a substitution |
> | **undetermined** | re-derivation could not be attempted or could not be judged — a reference did not resolve, a bounding element is mid-delete, or the edge was never a reference at all | the **known-unknown**, and the reason MUST be named |
>
> **§5.2.0 — MUST. `undetermined` is C78's `UNDETERMINED`, not a rival.** The reason accompanying
> it MUST be a member of **[C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) §8.1's closed union** —
> C79 mints no reason vocabulary of its own on the consequence path. The mapping for this
> contract's own failure modes, stated so no implementer improvises a twelfth member:
> an edge that was never a reference because the field naming the dependency is written empty
> (§7.1, `boundingWallIds: []`) is **`RELATIONSHIP_NOT_RECORDED`** — which C78 §8.1 row 8 cites
> by this exact defect; a region path that emits coordinates only (§6.3's non-conforming rows) is
> likewise `RELATIONSHIP_NOT_RECORDED`, **not** `UNSUPPORTED_ELEMENT_TYPE`, because the element
> kind is supported and the relationship is what is missing; a curved edge that structurally
> cannot be attributed (§2.4, §10.5) is **`GEOMETRY_UNPREDICTABLE`**; a resolver that raises
> mid-re-derivation is **`PLANNER_THREW`**. §2.4's `curved | noWallId | ambiguous` vocabulary is
> an **authoring-time attribution** vocabulary, one layer below this — it explains why a
> reference was never minted, and it MUST NOT be surfaced on the consequence path in place of a
> §8.1 member.
>
> **§5.2.1 — MUST NOT.** `undetermined` MUST NOT be collapsed into `preserved`. They are the
> same *pixels* and opposite *facts*: `preserved` means "we re-derived and nothing moved";
> `undetermined` means "we did not re-derive". Conflating them is exactly the §0 defect —
> a slab that did not follow was indistinguishable from a slab that had nothing to follow.
> The precedent for the discriminator is `ImpactDetermination`'s `determined | undetermined`
> (`BIM30-PHASE0-CONSEQUENCE-MACHINERY.md:71` — deleted 2026-08-15, see git history; the
> `ImpactDetermination` type itself is live in the tree and is the citable precedent).
>
> **§5.2.2 — MUST NOT.** `conflicted` MUST NOT be resolved by substituting a value that is not
> the derived one. C73 §4's precedents (`planOpeningRefit` relocating or refusing with **both**
> measurements, the three named roof-collapse modes) are the required shape.

> **§5.3 — MUST.** An element whose boundary is **partly** referenced and partly free reports
> per-edge, and the element-level state is the **worst** of its edges under the ordering
> `preserved < resized < regenerated < conflicted < undetermined`. Reporting `preserved` for an
> element whose free edges did not move, while its host edges failed to resolve, is a false
> green.

> **§5.4 — MUST.** The propagation that triggers §5.1 MUST satisfy C70 **F-INV-1**: a live
> listener **and** an emitter carrying `prevState`. C72 §0 records the measured cost of the other
> arrangement — four typed cascade events with **zero listeners across 4,556 files**, which read
> like wiring to anyone auditing by grep. **A typed boundary-changed event with no listener is
> not propagation.**

> **§5.5 — UNPROVEN.** No path in this repository has been shown to *distinguish* all five
> states today. `SlabDependencyTracker` covers move-triggered re-projection and delete-triggered
> degradation; it does not classify outcomes. §5.2 is therefore a **target**, and any status
> document reporting on it says UNPROVEN, never a green inherited from the slab fix.

---

## §6 — Universality: every region-capable path, or a named reason

> **§6.1 — MUST.** **Every region-capable creation path — plan tool, 3D tool, roof detector, and
> any future ceiling or floor-finish mode — MUST produce host references, or state, at its own
> boundary and in a form a caller can read, why it cannot.** There is no third option, and
> "the other surface does it" is not compliance: the user does not know which surface they used.

> **§6.2 — MUST.** A path that cannot comply is a **NAMED GAP with an owner**, per C70 §7.1 — in
> this section, by file:line, with the reason it cannot comply. It is never a blank row and never
> an inherited green.

### §6.3 — The conformance table (measured 2026-08-12 at HEAD `e6c8cb58`)

| path | family | tracer / source | retains references? | status |
|---|---|---|---|---|
| `SlabPlanToolHandler._findRegionAtPoint` → `traceRegionSketchAtPoint` (`apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:7,106,372`; `SlabRegionTracer.ts:730`) | slab (plan) | `SlabRegionTracer` | **YES** — ring **+** `HostReferenceEdge` sketch, all five attribution counts reported (`:394-404`) | **CONFORMING** — the reference implementation |
| `SlabPickWallsController.complete` (`packages/geometry-slab/src/SlabPickWallsController.ts:218-225`) | slab (pick) | user-picked wall ids | **YES** — the canonical edge shape §3.4 copies | **CONFORMING with one defect**: emits **no `fallback`**, so a wall deleted before any rebuild degrades to nothing (§4.3). NAMED GAP |
| `SlabTool.findRegionAtPoint` → `createSlabFromPolygon` (`packages/geometry-slab/src/SlabTool.ts:34,1399,1416-1428,348`) | slab (3D) | `SlabRegionTracer`, **bare-ring twin** | **NO** — coordinates only | **NON-CONFORMING.** The attributing entry point exists in the same module; this call site does not use it. **Owner: `@pryzm/geometry-slab`.** Smallest gap in the table |
| `RoofTool` (`packages/geometry-roof/src/RoofTool.ts:7,73,276`) | roof (3D) | **`WallRegionDetector`** | **NO** — coordinates only | **NON-CONFORMING, structurally.** See §6.4. **Owner: `@pryzm/geometry-roof`** |
| `RoofPlanToolHandler._commitRegion` (`apps/editor/src/engine/views/plantools/RoofPlanToolHandler.ts:2,44,200,209`) | roof (plan) | **`WallRegionDetector`** | **NO** — passes a bare `[number, number][]` to `_commit` | **NON-CONFORMING, structurally.** Same owner |
| `CreateFloorCommand` (`packages/command-registry/src/floors/CreateFloorCommand.ts`) | floor finish | room boundary, attributed via `rooms/roomBoundarySketch.ts` | **YES** — `FloorData.sketch` `HostReferenceEdge`s (`centerLine`@0, `fallback` at authoring time) **+** `boundingWallIds` POPULATED (§7.2(a)); all counts reported | **CONFORMING** (2026-08-13) — §10.3 resolved **DERIVE FROM THE ROOM**; one named gap remains, below |
| `CreateCeilingCommand` (`packages/command-registry/src/ceilings/CreateCeilingCommand.ts`) | ceiling | same shared builder | **YES** — byte-identical edge shape to the floor (§3.4) | **CONFORMING** (2026-08-13). Same owner |
| `CreateFloorsByRoomTypeCommand` / `CreateCeilingsByRoomCommand` | batch finish | room boundary via the above | **YES** — by COMPOSITION | **CONFORMING** (2026-08-13) — they construct the parent commands and hold no record-construction site of their own, so they inherit the fix by the same mechanism that propagated the defect |
| `CeilingPlanToolHandler` (`apps/editor/src/engine/views/plantools/CeilingPlanToolHandler.ts`) | ceiling | room boundary, attributed via the shared `attributeFinishRegion` → `rooms/roomBoundarySketch.ts` | **YES** — `CeilingData.sketch` `HostReferenceEdge`s (`centerLine`@0, `fallback` at authoring time) **+** `boundingWallIds` POPULATED; counts reported at commit; **REFUSES** with `RELATIONSHIP_NOT_RECORDED` when the room's own boundary is undetermined | **CONFORMING** (2026-08-13) — capability BUILT on the §10.3 decision, not inherited |
| `FloorPlanToolHandler` (`apps/editor/src/engine/views/plantools/FloorPlanToolHandler.ts`) | floor finish | same shared attributor | **YES** — byte-identical edge shape to the ceiling's (§3.4/§7.4) | **CONFORMING** (2026-08-13). Same owner |

**Reading (updated 2026-08-13): ALL TEN ROWS CONFORM — `check-region-host-attribution` re-measures
11 declared paths as 11 CONFORMING · 0 NON-CONFORMING · 0 CAPABILITY-ABSENT, exit 0.** Rows 9–10
were the last two, and they were **CAPABILITY ABSENT**: §0.1(3)(4) recorded that neither could
*inherit* a fix because the capability did not exist. It was therefore **new build**, and §6.6 bound
it — a region mode emitting coordinates would have created the §0 defect new, in 2026, in a family
that never had it. Per §10.3 the closure routes both handlers through the **room-derived** path
(`buildRoomFinishBoundarySketch`, the same function rows 6–7 call) rather than minting a third
tracer. **No new tracer was created; the count of wall-region tracers in this repository is
unchanged.**

> ⚠ **What a green §6.3 does and does not mean.** It means *attribution at creation*: every region
> path emits host references or names why it cannot. It says **nothing** about §9's other six exit
> conditions, all of which remain open — in particular §5.2's five recomputation states are still
> **UNPROVEN** (§5.5), so "the finish follows when its wall moves" is not claimed by this table.
> The finish families' per-edge attribution also remains **CONSTRAINED rather than §2.1-exact**,
> per the named gap at the foot of `roomBoundarySketch.ts` (owner `@pryzm/room-topology`).

*Original reading, retained so the movement is legible: "one conforming region path of six; one
conforming non-region path with a fallback defect; two families with no region capability at all."*

### §6.4 — Roof is NOT a one-line omission (recorded so the estimate is not re-lowered)

An earlier draft of the Phase 0 inventory called the roof gap *"a one-line omission"* and was
corrected on measurement. Both halves were wrong. Verified end to end:

- `traceRegionSketchAtPoint` — the host-reference-producing entry point — has **exactly one
  caller in the entire tree**, the slab plan handler (`SlabPlanToolHandler.ts:7`, called at
  `:372`); definition `SlabRegionTracer.ts:730`.
- **Neither roof path imports `SlabRegionTracer` at all.** `RoofTool` constructs its own
  detector (`RoofTool.ts:7,73`) and calls `this._regionDetector.detect(point, this.wallStore)`
  (`:276`).
- `WallRegionDetector.detect` **cannot carry a reference even in principle** (§0.1(1)).

Closing it is either (a) porting roof onto `SlabRegionTracer` — the ADR-0306 *fix once, import
everywhere* precedent, which would also inherit the curved-wall pre-trim corrections roof does
not have — or (b) threading an id channel through `WallRegionDetector`'s walk and both callers.
**Both are real work; neither is one line.** §6.5 states which.

> **§6.5 — MUST.** Where a family's region capability duplicates another family's tracer, the
> duplicate MUST be **retired onto the shared tracer**, not extended in parallel. Two tracers is
> how one fix reaches one family: `e6c8cb58` closed the defect in `SlabRegionTracer` and roof —
> which has the identical defect and the identical user-facing promise — did not move at all.
> Extending `WallRegionDetector` with an id channel satisfies §6.1 while leaving the
> second-copy disease in place, and is therefore the **non-preferred** option.

> **§6.6 — MUST NOT.** A new region-capable path MUST NOT ship without host references on the
> grounds that existing paths lack them. Every non-conforming row above is a **debt entry**, not
> a precedent. Adding a region mode to ceilings or floor finishes (§6.3, rows 9–10) that emits
> coordinates would create the §0 defect **new**, in 2026, in a family that has never had it.

---

## §7 — A field that names a dependency MUST be honoured or removed

> **§7.1 — MUST NOT.** A schema field that **names a dependency** MUST NOT be written with a
> value that cannot express one. **`boundingWallIds: []` is the anti-pattern**, hardcoded at
> `packages/command-registry/src/floors/CreateFloorCommand.ts:231` and
> `packages/command-registry/src/ceilings/CreateCeilingCommand.ts:191`.
>
> The field's **name** is a claim: *this floor is bounded by these walls.* Written empty on
> every creation path, it makes three false statements at once — to a reader (who sees a
> dependency model), to a grep-auditor (who sees the field and counts the capability present),
> and to any future consumer (who will find the array reliably empty and reasonably conclude the
> floor has no bounding walls). `RoomWorldModelAdapter` reads `boundingWallIds` for adjacency
> (`packages/ai-host/src/rooms/RoomWorldModelAdapter.ts:93,201`) — **but only for rooms**, whose
> array is populated. The floor and ceiling arrays are read by nothing, because there is nothing
> in them.
>
> This is C72 §0's mechanism in the schema layer: *a typed entry reads like wiring to anyone
> auditing by grep.*

> **§7.2 — MUST.** For every such field, exactly one of:
> **(a) POPULATE** it on every path that writes the record; or
> **(b) REMOVE** it from the schema; or
> **(c) DECLARE** it — in the schema, at its declaration site — as not-yet-populated, with the
> owner and the closing condition, and register it as a NAMED GAP per C70 §7.1.
>
> **Leaving it as an empty array is none of these three.**

> **§7.3 — MUST.** A field that names a dependency and is read **for a purpose other than that
> dependency** MUST say so at its declaration. `hostRoomId` is honoured for **finish colour
> only** (`RoomFinishResolver.ts:91,151`; `RoomFinishSyncService.ts:77`) — the boundary is
> **never** re-derived from it (`CreateFloorCommand.ts:233`, `CreateCeilingCommand.ts:192`).
> A name that promises a host relationship while delivering a colour lookup is a partial
> honouring recorded as a full one. Same for `coveredRoomIds` (`:230` / `:190`): **no reactor on
> room change.**

> **§7.4 — MUST NOT.** A field MUST NOT be populated correctly on one write path and empty on
> another. Per-path divergence within one field is §0's two-buttons defect at the schema level,
> and it is worse than uniform emptiness because it makes the field look honoured to whoever
> checks first.

---

## §8 — Gates

> **§8.1 — MUST.** Per C70 §7.1, a gate named here that does not exist at HEAD is a **named
> gap**; the correct entry in any status document is **UNPROVEN** — never a blank row, never an
> inherited green. **Measured 2026-08-12: none of the gates below exist.**

| gate | asserts | minimum evidence | exit condition |
|---|---|---|---|
| `check-region-host-attribution` | §6.1 — every region-capable creation path either emits references or declares, in a machine-readable form, why it cannot | region paths discovered **> 0** (a discovery of zero is exit **2**, MISCONFIGURED — see the empty-seed lesson, `e5addac8`) | the non-conforming set in §6.3 is empty or founder-signed |
| `check-dependency-fields-honoured` | §7.1/§7.2 — no field naming a dependency is written with an unconditional empty value | dependency-naming fields scanned ≥ the §0.1(5) census of 14 | the 12 unhonoured fields reach 0, each via (a), (b) or (c) |
| `check-region-reference-frame` | §3.1/§3.2 — no region-traced edge names a face reference | region edge constructions found > 0 | hard-0, permanently |
| `check-region-fallback-populated` | §4.3 — every emitted host reference carries a `fallback` at authoring time | host-reference construction sites > 0 | hard-0; closes the `SlabPickWallsController` gap in §6.3 |
| `check-boundary-recompute-states` | §5.2 — a re-derivation reports exactly one of the five states, and `undetermined` is representable | re-derivation paths > 0 | all five distinguishable at every re-derivation site |

> **§8.2 — MUST.** These gates obey C70's **four-exit-code contract** (`0` clean · `1` declared ·
> `2` MISCONFIGURED, never absorbable · `3` RATCHET EXCEEDED, never absorbable). A region gate
> that finds **zero** region paths has not passed — it has failed to measure, and exit `2` is the
> only honest answer.

> **§8.3 — what these gates CANNOT see**, stated so no reader takes the table for coverage:
> **(a)** a gate can verify a `hostId` is *present*; it cannot verify it is the *right* one —
> §2.2 is enforced by construction, and static analysis cannot distinguish a by-construction
> attribution from a proximity re-derivation that happens to produce a plausible id;
> **(b)** none of these gates observe **runtime** behaviour, so *"move a wall and the slab
> follows"* — the founder's actual question — remains provable only by an executed test, of
> which `packages/geometry-slab/__tests__/regionHostAttribution.test.ts` (400 lines, incl. the
> id-less-ring regression guard) is the only instance in the tree;
> **(c)** they say nothing about whether the user is *told* which edges follow.

---

## §9 — Exit conditions

C79's clauses are satisfied when **all** of the following are measured true, each with the
command that measured it:

1. ~~**§6.3 has no NON-CONFORMING or CAPABILITY-ABSENT row**, or every remaining row is
   founder-signed with a dated reason.~~ **MET 2026-08-13.** Measured by
   `npx tsx tools/rac-conformance/certification/gates/check-region-host-attribution.ts` →
   *"§6.3 conformance re-measured: 11 CONFORMING · 0 NON-CONFORMING · 0 CAPABILITY-ABSENT of 11
   declared region paths"*, **exit 0**, `declaredFindings` empty. **This is the FIRST of seven
   exit conditions and it does not carry the others** — §9.2 and §9.4–§9.7 remain open, and §9.3
   is partially closed (12 → 10 unhonoured fields, target 0). A reader who takes a green §6.3 for
   a green C79 has made exactly the inherited-green mistake §8.1 forbids.
2. **The second tracer is retired** (§6.5): `WallRegionDetector` has zero callers, or a dated
   ADR records why two tracers is the settled answer.
3. ~~**`boundingWallIds` is populated, removed, or declared** on floors and ceilings (§7.2)~~ —
   **DONE 2026-08-13 via (a) POPULATE** on both families and both their batch siblings (§6.3 rows
   6–8), so the Phase 0 census moves **12 → 10** unhonoured dependency-naming fields. The exit
   condition remains open until that count reaches **0**. Still unhonoured on these same two
   records and NOT addressed here: `coveredRoomIds` (no reactor on room change) and `hostRoomId`
   (read for finish colour only — §7.3 requires that partial honouring be declared at the field's
   declaration site, which has not been done).
4. **The five recomputation states are distinguishable** at every re-derivation site (§5.2), and
   `undetermined` is representable and never rewritten (§5.2.1).
5. **Every emitted host reference carries a `fallback` at authoring time** (§4.3), including
   `SlabPickWallsController`.
6. **All five §8 gates exist**, are wired into the suite, and obey the four-exit-code contract.
7. **C79 has been cross-read against [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)** — the two
   were authored the same day, in parallel, without sight of each other — and every clause that
   duplicates a C78 clause is **deleted from C79** in favour of the universal one. The known
   overlap to reconcile first: C79 §5.2's five states against C78 §1.3's three legal answers and
   §8.1's closed reason union (§5.2.0 states the intended mapping; it has not been ratified by
   C78's owner). **A clause kept in both contracts is the two-copies defect §6.5 exists to
   forbid, applied to prose.**

---

## §10 — Open questions the evidence could not settle

Stated as questions, with what is known, because C70 §0.1 forbids recording an unanswered
question as an answer.

1. ~~**Does the region relationship survive persistence?**~~ **ANSWERED 2026-08-13 by executed
   measurement — IT SURVIVES.** Retained here rather than deleted, because §10 records what the
   evidence could not settle and this entry now records how it was settled.

   `hostId`, `reference` (`'centerLine'`), `offset` (`0`) and `hostType` round-trip **byte-identical**
   through `ProjectSerializer.serializeSlab:432` → JSON → `ProjectLoader:531` /
   `ImportProjectCommand:546` → `CreateSlabCommand:153` → `SlabValidator:59`. The reloaded sketch
   reproduces `SlabDependencyTracker.registerSlab`'s dependency graph; §2.5's counts are
   reproducible from the reloaded sketch alone; and §1.5's freehand/region distinguishability
   holds after save→load (a freehand slab with an identical polygon still has no sketch).

   **The answer is CONTINGENT on one line and must be re-measured if it ever tightens:**
   `SlabValidator.ts:59` reads `sketch: z.any().optional()`. A typed object schema without
   `.passthrough()` at that line would silently strip the sketch — and `SlabStore.add()` stores the
   original rather than the parse result, which is the second half of why it survives.

   Evidence: `packages/persistence-client/__tests__/regionSketchPersistenceRoundTrip.test.ts`
   (16 tests, commit `458c013a`), proven load-bearing by MUTATION rather than assertion —
   `ProjectSerializer.ts:432` was edited to `sketch: undefined` and **9 tests went red**, then
   restored. The probe never writes a `hostReference` literal (the sketch under test is produced by
   the tracer), so C74 §3.4's fixture-supplies-the-answer failure mode does not apply.

   **Residual UNPROVEN, stated so it is not read as fully closed:** `ProjectLoader.load()` itself is
   pinned by source assertion rather than executed (it needs a live `CommandManager`, `BimManager`
   and ~40 singleton stores, unavailable in a Node-env suite); and post-load **re-projection** —
   whether the reloaded slab actually *follows* when its wall moves — is `SlabDependencyTracker`'s
   axis and remains unmeasured.
2. **What is the correct reference frame for a non-wall bounding element?** §3.5. Every path at
   HEAD bounds against walls only.
3. ~~**Should ceilings and floor finishes get a region mode at all, or should they derive from the
   ROOM?**~~ **ANSWERED 2026-08-13 — DERIVE FROM THE ROOM.** Decided while closing §6.3 rows 6–8;
   retained rather than deleted because §10 records how a question was settled, not only that it was.

   **The decision, and the three reasons in order of weight** (full argument at the head of
   `packages/command-registry/src/rooms/roomBoundarySketch.ts`):

   1. **A second tracer is the disease §6.5 exists to forbid.** Roof had its own
      `WallRegionDetector`, and that is exactly why `e6c8cb58`'s slab fix never reached it. Minting
      a third tracer for finishes would repeat that knowingly — §6.6's "creating the §0 defect NEW
      in a family that never had it".
   2. **A finish is not independently bounded — it IS the room's surface.** These commands never
      traced anything: they copy `room.boundary.polygon` and inset it to the bounding walls' inner
      faces. The relationship the user expressed is *"the floor OF THIS ROOM"* (`hostRoomId`), and
      the room already carries a by-construction `boundingWallIds` from the planar face walk
      (`PlanarTopologyEngine:152,174`). An independent trace would re-derive, by a rival mechanism,
      a fact the model already holds — and the two could then DISAGREE, which is §7.4's per-path
      divergence, worse than uniform absence.
   3. **The transitive `undetermined` is the honest answer, not a cost.** This question noted the
      transitive design is `undetermined` whenever the room's detection is. That is correct and
      desirable: a finish whose room could not be detected genuinely has no known boundary
      relationship, and §2.3 is explicit that no host beats a wrong host. An independent tracer
      would manufacture an answer in precisely the case the room could not.

   **THE PRICE, STATED (a new NAMED GAP, owner `@pryzm/room-topology`).** The derivation is only as
   trustworthy as `room.boundingWallIds`. That array IS populated by construction — but as a **`Set`**:
   `PlanarTopologyEngine:174` does `[...new Set(face.wallIds.filter(Boolean))]`, collapsing the
   ordered, index-aligned per-half-edge record (`face.wallIds[i]` ↔ `face.nodeIds[i]`) that the walk
   HAD into unordered membership. **This is §0's mechanism — "the information was never missing; it
   was discarded on the way out" — occurring one layer upstream.** So the room knows WHICH walls
   bound it but no longer WHICH EDGE came from WHICH WALL, and the finish commands' per-edge step is
   therefore a **CONSTRAINED match** (candidate set closed by construction to the room's own walls,
   refusing on ambiguity) rather than §2.1-exact attribution. It will report `ambiguous` on collinear
   welded partitions where the face walk itself knew the answer.
   *Closing condition:* `DetectedRoom` grows an ordered per-edge wall channel (e.g.
   `boundaryWallIdByEdge: (string | null)[]`, index-aligned with `polygonVertices`), `RoomData`
   persists it, and `roomBoundarySketch.ts` consumes it directly — at which point its `_attributeEdge`
   deletes and attribution becomes §2.1-exact for every edge the walk attributed.

   **Measured counts on the reference fixture** (6 m × 4 m room, four 200 mm walls): 4 straight →
   **4 host edges / 0 free**; 3 straight + 1 arc → **3 host edges / 1 curved fallback** (the §2.5
   shape); one welded straight twin → **3 host / 1 ambiguous**, and *neither* rival kept (§2.3);
   room with no declared walls → **0 host / 4 `roomUndetected`**, distinguishable from all of the
   above (§2.6).
4. **Is `ambiguous` the right answer for two welded walls, or should the edge be split?** The
   implemented choice (`SlabRegionTracer.ts:388-399`) drops to `null` rather than first-writer,
   which is correct under §2.3 — but a split edge with two references would retain *both*
   relationships. Not attempted; not measured.
5. **How does a curved boundary ever follow its wall?** §2.5 makes curved fallback permanent, so
   a filleted room's slab edge is **structurally incapable** of following. Closing it needs a
   reference that can name *a parameter range on an arc*, which `WallFaceRef`
   (`SketchTypes.ts:15-20`) cannot express. **The contract does not resolve this; it records that
   the honest refusal is not a solution.**
6. **Does the user ever see which edges follow?** The attribution counts are returned and
   **logged to the console** (`SlabPlanToolHandler.ts:394-404`). No evidence was found of any UI
   surface reading them. A measurement that reaches only the console is C75's repair-path defect:
   *the repair goes to the console; it does not go to the model.*
7. **Is `SlabTool`'s 3D path reachable in the shipped product**, or is the plan surface the only
   live one? If the 3D tool is dead, row 3 of §6.3 is a deletion rather than a fix — and per
   `authored-but-unwired`, reachability must be audited, not assumed.

---

*Cited files, verified at HEAD `e6c8cb58` on 2026-08-12:
`packages/geometry-slab/src/{SketchTypes,SlabRegionTracer,SlabDependencyTracker,SlabPickWallsController,SlabTool}.ts` ·
`packages/geometry-roof/src/{WallRegionDetector,RoofTool}.ts` ·
`packages/command-registry/src/floors/{CreateFloorCommand,CreateFloorsByRoomTypeCommand}.ts` ·
`packages/command-registry/src/ceilings/{CreateCeilingCommand,CreateCeilingsByRoomCommand}.ts` ·
`apps/editor/src/engine/views/plantools/{SlabPlanToolHandler,RoofPlanToolHandler,CeilingPlanToolHandler,FloorPlanToolHandler}.ts` ·
`packages/ai-host/src/rooms/RoomWorldModelAdapter.ts` ·
`packages/geometry-slab/__tests__/regionHostAttribution.test.ts` ·
`BIM30-PHASE0-RELATIONSHIP-INVENTORY.md` §4.1, §5, §5.1 (deleted 2026-08-15 — see git history)*
