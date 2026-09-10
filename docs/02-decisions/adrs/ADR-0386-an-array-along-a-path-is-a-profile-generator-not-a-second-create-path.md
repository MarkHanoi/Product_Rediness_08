# ADR-0386 — An array along a path is a PROFILE GENERATOR, not a second create path

- **Status:** ACCEPTED
- **Date:** 2026-09-10
- **Lane:** ARRAY-ALONG-PATH
- **Supersedes:** nothing. **Extends:** ADR-0383 (massing groups / master planning),
  ADR-0385 (massing group → hierarchy store → `IfcBuilding`), ADR-0380/0381 (the space envelope family).
- **Binding contracts:** C114 §6a / §6d / §12 · C58 §1.19 · C16 CA-2 / CA-18 · C73 · C84 EI-9 ·
  C08 §3.1 · P1 · P6 · P8.

---

## Context

The founder, 2026-09-10, on master planning:

> *"For masterplanning creation — on the 2D site plan / 3D site plan — we need to enable not only an
> option to create envelope BUT to create envelopes following a LINE. The user first defines the
> first envelope, then as it would be a wall tool (with all the wall modes — straight, ortho, curved
> etc.) creates a line starting from the CENTRE of the first envelope and ending wherever it wants.
> Then define the FREQUENCY — and the tool creates footprints following the first envelope alongside
> — every, let's say, 10 metres. Like that you can easily create all perimeter envelopes as
> independent building IFC units. Then select the levels — e.g. 3 — and then apply, and all
> envelopes will create at once."*

Read literally, that sentence describes a whole feature: a gesture, a repeat rule, a level picker
and a bulk create. **Three of those four already existed the day he asked.** ADR-0383 shipped the
transient profile roster, the storey field and the ONE **Create all blocks** button;
`masterPlanAuthoringPlan` turns N profiles into ONE `spaceEnvelope.batch.create`; ADR-0385 projects
each group into `hierarchyStore` so each becomes a distinct `IfcBuilding` — measured end-to-end at
3 groups × 3 shared storeys → 3 `IfcBuilding`, 9 storeys, ONE Ctrl+Z.

So the real decision was **where to cut the new work**, and the tempting cut — "build the array
tool" — would have produced a second batch create, a second undo story and a second group-minting
path. [[same-rule-two-implementations]] has recurred eight times in this repository and the shape
never varies: the fix lands in the copy nobody is looking at, and the guarding test stays green
because it measured the other one.

---

## Decision

**The array is a profile generator whose output is N rings appended to the existing transient
roster. It creates nothing.** Everything downstream is the machinery that already shipped.

    prototype ring ─┐
    spine ──────────┼─► buildEnvelopeArrayAlongPath ─► N rings ─► drawnEnvelopeFootprintState
    spacing ────────┘                                                        │
                                                                             ▼
                                          [existing]  masterPlanSection · "Create all blocks"
                                                                             │
                                          [existing]  ONE spaceEnvelope.batch.create · ONE Ctrl+Z
                                                                             │
                                          [existing]  ADR-0383 group → ADR-0385 projection
                                                                             ▼
                                                      N independent IfcBuilding

### D1 — Spacing is CENTRE-TO-CENTRE **arc length**, measured from the prototype's centre

Not gap-to-gap, and not chord distance. *"Every 10 metres"* is ambiguous in a way that matters on a
bending spine: a tool measuring straight-line distance from the previous block places the copies
somewhere the user did not draw as soon as the line turns. The arc reading is the one a road
centreline carries, and the panel **says so on its own face** (*"the spacing is CENTRE TO CENTRE,
measured along the line — not gap to gap"*) rather than leaving the user to discover which it meant.

⛔ **Overlap is NOT a spacing constraint.** A spacing smaller than the block is a real thing to draw
(back-to-back terraces, deliberate collision studies) and the answer to it is an ADVISORY carrying
both numbers, never a clamp — see D5. The only floor in the generator is `0.1 m`, and it exists
solely so a finite spine cannot request an unbounded count; the refusal says exactly that, so it
cannot be mistaken for a design opinion.

### D2 — Orientation is a REAL question, defaulting to the tangent, and **disclosed only when the ambiguity is real**

Copies can keep the prototype's bearing, or turn to meet the spine. Both are correct for different
plans: a terrace along a curving street turns; a solar- or grid-aligned scheme does not.

- **Default: `tangent`.** *"All perimeter envelopes"* along a street is the reading the founder's
  sentence carries, and a rank of blocks all facing the original bearing while the street bends is
  not a thing anyone draws on purpose.
- **The choice is visible and reversible** — two pills in the panel, each stating what it means, and
  changing one re-plans immediately. It is not buried in a preference.
- ⭐ **The rotation is measured RELATIVE TO THE SPINE'S FIRST HEADING**, not to world north. That is
  what makes a straight spine produce the **identical drawing** under both options — pinned as a
  spec case — which in turn is what licenses hiding the control there. Offering a choice where there
  is nothing to choose teaches the user that the options differ when they do not. This is the shape
  §WHOSE-FOOTPRINT-IS-THE-SLAB already established: disclose only when the ambiguity is real.

### D3 — The spine starts at the prototype's centre, and the prototype is never duplicated

The founder said *"starting from the CENTRE of the first envelope"*, so **the gesture SEEDS vertex 0
with that centre** and the user's first click is the spine's second vertex. That makes his sentence
a property of the tool rather than an instruction he can miss.

- The prototype is **profile #1** and copy 0 is never emitted. `N` copies means `N+1` blocks, and the
  panel states both numbers so the roster count is never a surprise.
- **The centre is `ringCentroid` from `@pryzm/geometry-space-envelope`** — the vertex mean, which is
  this family's *existing* answer to *"where is this envelope ring's centre"* and the reference the
  face-drag already resolves outward normals against. Adopting the area centroid instead would have
  minted a second answer to one question that the face-drag would then disagree with. It is stated
  here rather than left implicit because the two differ on an irregular ring.
- Backspace can still pop the seeded vertex. When it is popped the generator **MEASURES the resulting
  offset and states it** (*"the spine starts 4 m from the first envelope's centre"*) rather than
  silently re-anchoring. A silent correction would make the tool disagree with the drawing.

### D4 — A partial fit is REPORTED; no squeezed copy is ever placed

If the remaining arc is shorter than the spacing, nothing is placed there, and the leftover metres
are stated. The frequency the user asked for is the frequency they get. Squeezing a final copy in
would silently violate the one number they typed.

The same posture covers the roster ceiling: when more copies fit on the spine than the session
roster can hold, the plan carries **both numbers** (*"20 would fit; the roster has room for 4"*) and
places what it can.

### D5 — Overlaps and off-parcel copies are an ADVISORY WITH BOTH NUMBERS, and the array **calls** the existing one

ADR-0383 D4 and C114 §12 already rule that a collision between blocks is an advisory, never a
refusal, and `masterPlanAuthoringPlan` already measures it through `findMassingGroupOverlaps` →
the kernel's oracle-pinned `intersectPolygons2D`, with its own `unmeasurable` arm for a topology the
kernel could not resolve.

⛔ **The array measures none of this a second time.** The copies are ordinary roster profiles the
moment they are added, so the panel's existing preview runs the ONE planner over them and the
advisory appears with everything else. A second overlap routine here would be two answers to one
question, and the panel would have to choose between them.

### D6 — ONE stroke driver, TWO intents — the extraction is the FINISH TARGET

The spine must offer the wall modes. The obvious move was a second stroke machine, and it is the
forbidden one: `siteEnvelopeDrawArming.ts` already owns the founder-ruled perpendicular-foot ortho,
the 3-click arc, Backspace, the arm-every-surface registry, first-click-wins, and the six exits that
all pass through `disarmAll()` (L-7801). What actually differed between a perimeter and a spine was
**one thing** — what happens when the stroke finishes. So that is what was extracted:

| | perimeter (unchanged) | array-path (new) |
|---|---|---|
| minimum vertices | 3 | **2** — a single straight run is a good spine |
| last-vs-first collapse | yes (the closing edge is implied) | **no** — a loop road keeps its home vertex |
| preview closes the ring | yes | **never** |
| settled painting | closed polygon + fill | **open polyline, no fill** |
| closed modes (rect/circle/ellipse) | served | **refused BY NAME**, never coerced to `linear` |
| finish target | `drawnEnvelopeFootprintState` | `envelopeArrayPathState` |

- **The intent is an ARGUMENT to `armEnvelopeDraw`, never a mode the user sets**, and it is reset by
  every exit. A persistent "capture mode" flag decided by one surface and read by another is the
  [[view-region-one-owner]] shape the roster module's own header already refuses.
- `armEnvelopeDraw()` with no argument is **byte-identical** to its pre-lane behaviour — every
  existing caller passes nothing, and a control leg in the spec pins it.
- `drawSettledRing(ring, closed?)` defaults `closed` to **true**, so both adapters keep the exact
  argument list they were written for; the minimum vertex count moves with the shape (3 to enclose
  anything, 2 to be a run), because an adapter keeping a hard `< 3` guard would silently drop every
  two-point spine.

⚠ **The OTHER stroke family in this repo is not this one.** `BoundaryLinePlanToolHandler` (549
lines) strokes the BIM plan view through `PlanToolDrawContext`, which is hard-bound to
`HTMLCanvasElement`; `envelopeDrawSurface.ts` records in as many words that *"no Cesium or MapLibre
adapter could ever satisfy that interface"*. Plugging one into the other would be the same defect
inverted. Both families already delegate their **rules** to the same `@pryzm/geometry-slab`
primitives (`orthoConstrain`, `arcSegmentThroughMidpoint`, `boundaryLoopVertices`), which is the
sharing that matters; what differs is the surface binding, and that is not duplication.
`siteworksRailTools.ts` / **C116 §11** records a want for the *plan-view* extraction — that one is
still open and is a different seam from this one.

### D7 — The prototype is the MOST RECENT profile, and the panel NAMES it

`getDrawnEnvelopeFootprint()` already means *"the profile the user is working on"* and a redraw
already replaces exactly that. The founder's *"the first envelope"* means the first one he drew,
which in the session he describes is the most recent. Rather than leave that to be inferred, the
panel prints *"Repeating Profile 3 — 842 m²"*. A tool that silently repeats a different block than
the user is looking at is [[same-rule-two-implementations]] expressed as a UI: right answer, wrong
subject.

### Preview before commit is not a new feature — it is what the roster already is

The generated copies land as ordinary profile rows, with the per-profile **Remove** and **Clear all
profiles** that already existed. Nothing is dispatched until the founder presses **Create all
blocks**. The spine is cleared on a successful add, because its job is done and leaving it would
make a second press silently double the array.

---

## Consequences

**Good**

- The founder's whole sentence is served by ONE new pure function, ONE transient slot, ONE panel
  section and ONE new argument on an existing arm. No new command, no new store, no new undo story.
- N blocks from an array are N `IfcBuilding` under ONE Ctrl+Z **because they go through the path
  that already proved that** — not because this lane re-proved it.
- The spine gets every wall mode that the perimeter has, for free and permanently: a mode added to
  the one driver serves both strokes.

**Costs, stated**

- ⚠ **The generated copies are not painted on the globe.** Only the finished spine and the most
  recent settled ring are. That is not a gap this lane opened — the roster has never painted its
  N profiles (ADR-0383 S5 shipped without it) — and closing it means a new multi-ring channel on
  `EnvelopeDrawSurface` plus both adapters, which is a lane of its own. The panel's roster rows and
  the create preview are where the array is currently visible before commit.
- ⚠ **The `0.1 m` spacing floor is arbitrary in magnitude.** It is a degeneracy guard, it is stated
  as one in the refusal, and it is not derived from any ordinance or block dimension.
- The roster ceiling (`DRAWN_ENVELOPE_MAX_PROFILES = 24`) now binds a gesture that can easily ask
  for more. It refuses with both numbers rather than truncating silently, but a long street at a
  tight frequency needs more than one pass.

---

## Proof

| Arm | Where | What it pins |
|---|---|---|
| The generator | `apps/editor/src/ui/site/__tests__/envelopeArrayAlongPath.spec.ts` (28) | arc-length spacing round a corner, no copy at 0, leftover not squeezed, tangent vs prototype, identical drawing on a straight spine, area carried verbatim, ten named refusals, truncation with both numbers |
| The stroke | `apps/editor/src/ui/site/__tests__/envelopeArraySpineStroke.spec.ts` (17) | the intent defaults to today, two-point finish, no ring closure in preview or paint, loop modes refused by name, the intent dies with the gesture |
| ⭐ **The whole gesture** | `apps/editor/__tests__/arrayAlongPathBecomesNBuildings.test.ts` (5) | real `composeRuntime()`, the **production** deps factory, a curving spine at 10 m → 6 copies at the measured arc positions → ONE press of the existing Create → **21 envelopes, 7 distinct `IfcBuilding`, `undoCount() === 1`** |

Each suite carries a **scramble control** (L-586): reversing the spine must move every copy,
perturbing it must move the answer, changing the spacing must change the count, and the same input
twice must not move anything.

⚠ **The end-to-end arm earned its keep on the first run** — it caught a real defect the two unit
suites could not see: the array's preview node renamed its own `data-testid` when the plan was
refused, so anything reading the preview got an empty string on exactly the states that carry the
numbers. Fixed as two nodes, one hidden at a time.
