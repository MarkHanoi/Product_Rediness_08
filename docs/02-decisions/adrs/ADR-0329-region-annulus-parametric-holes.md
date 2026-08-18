# ADR-0329 — The region annulus: a parametric hole, not a polygon difference

> **Status**: ACCEPTED · **Date**: 2026-08-18 · **Lane**: Z5
> **Supersedes**: nothing. **Superseded by**: nothing.
> **Governing contracts**: **C79** (region semantics — the owner), **C11** (element creation
> pipeline), **C15** (hosted elements), **C16** (command authoring), **C03** (schemas / commands
> / state), **C72** (propagation & `prevState`), **C73** (geometry determinism & tolerance),
> **C71** (graph & topology — the verbatim-restore rule), **C78** (universal relationship
> contract — the `UNDETERMINED` reason union).
> **Founder request**: *"you can create holes on slab — the concept is exactly the same. Create a
> slab within the perimeter of the boundary, then create a **dynamic hole** (in case walls move,
> to adapt) from within the space defined by the walls of the building."*

---

## 1 — Context: the problem, and the blocker that turned out not to be one

A user clicks in the garden — between the parcel boundary line and the building's perimeter
walls — and asks the slab "By Region" tool for a slab. The correct answer is an **annulus**: the
parcel polygon with the building footprint removed.

A previous lane measured this as unbuildable and committed a RED probe
(`packages/geometry-slab/__tests__/regionParcelBoundaryAnnulus.probe.test.ts`, `37d4742d`). On a
40×40 m parcel with a 20×20 m building it showed the obvious implementation — feed the parcel
ring to the tracer alongside the walls — returning a region that is **not null and not the
garden**: area **1600 m² (the whole parcel) where the correct answer is 1200**, with the building
centre *inside* the returned ring. A slab built from it buries the building, with no error and no
refusal.

Four blockers were named. The fourth was *"there is no polygon DIFFERENCE in the kernel"* —
`polygonBoolean.ts:45-49`:

> **DIFFERENCE (A \ B) IS NOT DELIVERED.** … it is not oracle-pinned and an unproven boolean
> silently corrupts every consumer downstream of it.

**That refusal is correct and this ADR does not touch it.** No boolean is minted here.
`check-predicate-canonical` sits at 138/138 and must stay there.

### 1.1 — The measurement that dissolves the fifth blocker

The fifth blocker read: *"Nothing derives a building footprint ring from a level's walls. This is
the genuinely new piece and probably the bulk of the work."*

**Measured — it is already derived, by the tracer already in this code path.** Feeding the probe's
own fixture (parcel walls + building walls) to `buildAttributedClosedLoops` and printing every
loop:

```
LOOPCOUNT 4
LOOP 0: n=4 area=-1600.000 containsGarden=true  containsBldgCentre=true  hosts=parcel-0|parcel-1|parcel-2|parcel-3
LOOP 1: n=4 area= 1600.000 containsGarden=true  containsBldgCentre=true  hosts=parcel-3|parcel-2|parcel-1|parcel-0
LOOP 2: n=4 area= -400.000 containsGarden=false containsBldgCentre=true  hosts=bldg-0|bldg-1|bldg-2|bldg-3
LOOP 3: n=4 area=  400.000 containsGarden=false containsBldgCentre=true  hosts=bldg-3|bldg-2|bldg-1|bldg-0
```

The building footprint ring is **loop 2/3** — 400 m², attributed to the building's own walls,
already carrying `hostId` provenance on every edge. `findAttributedRegionAtPoint`
(`SlabRegionTracer.ts:570-594`) keeps the *smallest enclosing* loop and **returns the other three
to the garbage collector**.

This is C79 §0's defect, in the same file, one function further out. C79 §0 records that the
tracer *"received the wall array … then returned bare `{x, y}` points and threw the wall ids
away"* — **information present in the tracer's own intermediate, discarded on the way out**. The
loops are the same class of loss: computed, correct, attributed, and dropped.

> **The founder's architectural insight is therefore not merely *a* way to build this. It is the
> only one that does not add machinery: outer ring = the loop enclosing the click, inner loop =
> a loop the same walk already produced.** The difference operation is not needed because the
> planar walk has already performed the topological separation that a boolean would be asked to
> re-derive from coordinates.

---

## 2 — Which mechanism actually cuts slab holes, and whether `innerLoops` is a rival

The brief asked for this explicitly, because two rival hole mechanisms would itself be a finding.
Measured across `packages/`, `apps/`, `plugins/`, `src/`:

| channel | declared | written by | **read by geometry** |
|---|---|---|---|
| `SlabData.holes` | `SlabTypes.ts:53` | `SlabTool` HOLLOW_SLAB only (`:557-565`) | **YES** — `SlabFragmentBuilder.ts:1080` (`semanticHoles`) |
| `openingStore` record `{type:'opening', hostId: <slabId>, profile}` | `OpeningTypes.ts:12-18` | `CreateOpeningCommand`, `StairSlabOpeningReconciler`, `ImportProjectCommand` | **YES** — `SlabFragmentBuilder.ts:1088` (`openingHoles`) |
| `SlabSketch.innerLoops` | `SketchTypes.ts:62` | **nobody** | **NO** |

**Answer: there are not two rival mechanisms. There is ONE live mechanism with two feeder
arrays** — merged at `SlabFragmentBuilder.ts:1100` (`const allHoles = [...semanticHoles,
...openingHoles]`) and consumed once by `buildSlabGeometry` (`:1163`) through
`THREE.ShapeUtils.triangulateShape` with CW-normalised hole contours (`:927-945`) plus one inner
wall quad per hole edge (`:1011-1041`). The `opening holes slabId="…" count=N` log
(`:1103-1104`) is fed **exclusively** by `deps.openingStore`.

**`innerLoops` is not a rival. It is a half-honoured field** — C79 §7's anti-pattern in its
subtler form. It is:

- **registered** into the wall→slab dependency graph — `SlabDependencyTracker.ts:140`,
  `[slab.sketch.outerLoop, ...(slab.sketch.innerLoops ?? [])]`;
- **degraded** when a bounding wall is deleted — `SlabDependencyTracker.ts:362`;
- **deep-copied** on level duplication — `DuplicateFloorPlanCommand.ts:331`;
- **persisted** — `regionSketchPersistenceRoundTrip.test.ts:149` walks it;
- and **never read by any geometry producer.** `SlabFragmentBuilder` resolves `sketch.outerLoop`
  at `:474` and `:1075` and nowhere else; `resolveLoop` takes a `SketchLoop`, not a `SlabSketch`,
  so it *structurally cannot* see inner loops.

C79 §7.2 permits exactly three dispositions for such a field: **(a) POPULATE**, **(b) REMOVE**,
**(c) DECLARE as a named gap**. C79 §7.4 adds that a field populated on one path and empty on
another *"is worse than uniform emptiness because it makes the field look honoured to whoever
checks first"* — which is precisely today's state, since the *dependency* half is honoured and the
*geometry* half is not.

> **DECISION D1 — `innerLoops` is closed by C79 §7.2(a) POPULATE.** It is the only one of the
> three channels that can carry a **reference**, and therefore the only one that can follow a
> wall. `SlabData.holes` and `openingStore.profile` are both flat coordinate arrays with no host
> id; neither can express "this hole is the building's footprint" and neither can move when the
> building does. **The dead field is the right field.** Populating it is cheaper than the
> alternative *and* is the only option that satisfies C79 §1.1 (*bounded BY REFERENCE, not by
> copied coordinates*).

---

## 3 — Decision

### D2 — The annulus is selected from loops the walk already produced. No boolean.

`SlabRegionTracer` gains `findAttributedRegionWithHolesAtPoint`, which runs the **same**
`buildAttributedClosedLoops` walk once and then applies a stated selection rule:

1. **outer** = the smallest-area loop containing the click. *Unchanged from
   `findAttributedRegionAtPoint` — a click inside a room still yields that room.*
2. **hole candidates** = every other loop that is **strictly inside** the outer loop and does
   **not** contain the click.
3. **de-duplicate the winding twin.** The walk emits each boundary twice, once per direction
   (loops 2 and 3 above). Two rings are the same boundary iff their **canonical key** matches:
   winding normalised to positive area, rotated to start at the lexicographically smallest
   vertex, ordinates quantised at `REGION_WELD_TOLERANCE_M`. This is a canonical form, **not** a
   proximity guess — C79 §2.2 forbids the latter.
4. **keep only the outermost.** A loop nested inside a hole candidate is a *room inside the
   building*, not a second hole of the garden. Dropping it is what stops the annulus becoming a
   sieve.

Containment uses the kernel's canonical `pointInPolygonXY` via the tracer's existing
`pointInPolygon` (`:527-529`, already delegating). Area uses the tracer's existing `polygonArea`
(`:597`). **No new point-in-polygon body, no new shoelace body, no new segment/segment body** —
`check-predicate-canonical` must not move.

### D3 — The hole is stored as `sketch.innerLoops`, built by the same `buildRegionSketch`.

`buildRegionSketch` is refactored so that the loop→edges conversion is one function applied to
the outer ring and to each inner ring. Every inner edge is therefore **byte-identical in shape**
to an outer edge — `{ type:'hostReference', hostId, hostType:'wall', reference:'centerLine',
offset:0, fallback:{start,end} }` — which C79 §3.4 requires (*"Two shapes for one relationship is
how two buttons come to behave differently"*), and C79 §4.3 requires the authoring-time
`fallback` this inherits for free. Attribution counts (C79 §2.5/§2.6) are summed across **all**
loops, so a fallback in a hole edge is reported, never absorbed.

`RegionSketchResult` gains `innerRings: RegionPoint2D[][]` alongside the existing flat `ring`.
`ring` keeps its exact meaning — the outer ring — so every current caller is unaffected.

### D4 — The follow is the resolution itself. `SlabFragmentBuilder` honours `innerLoops`.

`createSlabMeshWithEdges` already resolves `sketch.outerLoop` **in preference to** the static
`data.polygon` (`:1073-1076`). D4 applies the identical policy one level down:

> **when `sketch.innerLoops` is present and non-empty, the resolved inner rings replace
> `data.holes`; otherwise `data.holes` is used unchanged.**

This is deliberately a *replacement*, not an addition: punching the same contour twice would put
duplicate hole rings into `THREE.ShapeUtils.triangulateShape`. The rule is superset-safe —
`HOLLOW_SLAB` is the only writer of `data.holes` and it never writes a sketch — and the symmetry
with the outer loop is exact, so a reader who knows one rule knows both.

**This single change is the entire "dynamic" requirement.** Resolution runs
`WallFaceResolver.resolveWithProvenance` per edge on **every** rebuild, and
`SlabDependencyTracker.registerSlab` already walks `innerLoops` into the wall→slab graph
(`:140`) — so a wall move already reaches `triggerRebuild`, and the hole re-resolves. Nothing new
subscribes to anything. C72 §2.4's *do-not-rebuild rule* is satisfied by not building a second
tracker.

### D5 — Undo restores; it does not re-derive. (L-943)

L-943 is the standing hazard: a floor follow that **reconstructed** on the reverse pass turned a
75.171 m² boundary into 138.262 m². The ledger's rule — *"undo restores, it does not reconstruct"*
(C71, quoted at `C71-GRAPH-AND-TOPOLOGY.md:283`) — binds here.

The structural answer for the annulus, stated so it can be checked rather than believed:

- **A wall move never writes the sketch.** `SlabDependencyTracker.reprojectStoredPolygon` writes
  only the *derived* fields (`polygon`, `width`, `depth`); `slab.sketch` — which holds every
  reference, outer and inner — is not touched on the forward pass. There is therefore no
  authored value for a reverse pass to reconstruct differently. This is the property to assert,
  and it is asserted as a **byte-equality snapshot of the stored sketch** (`JSON.stringify`),
  copying `floorFollowUndoRestore.test.ts:209-211` — never as a reported m², which is what let
  L-943 read green.
- **`SlabData.holes` is written back alongside `polygon`.** Without this the record would claim
  1600 m² while the mesh drew 1200 — breaking the record ≡ mesh property that
  §FIX-SLAB-POLYGON-WRITEBACK exists to hold, and feeding 1600 to every `polygon` consumer
  (schedules, area take-off, IFC/DXF export). The write obeys the **same** rule as `polygon`:
  persisted only when the resolution is `fullyLive`, so a stale fallback is never laundered into
  the record.

### D6 — What this ADR does NOT claim

- **Floor finishes are NOT closed by this change.** Measured: `FloorPanelBuilder` builds from
  `floor.boundary.polygon` + `floor.serviceHoles` (`:123`, `:215`, `:303-350`) and **never reads
  `floor.sketch`**; `FloorTypes.innerLoops` (`:222`) is dead in exactly the same way
  `SlabSketch.innerLoops` was, and the floor region path is attributed by
  `command-registry/src/rooms/roomBoundarySketch.ts`, a *different* attributor from
  `SlabRegionTracer`. Closing the floor family means (i) honouring `FloorSketch.innerLoops` in
  `FloorPanelBuilder`, (ii) teaching the room-derived attributor to emit inner loops, and
  (iii) an `UpdateFloorBoundaryCommand` that carries them. **NAMED GAP, owner
  `@pryzm/geometry-slab` (floor sub-path) + `@pryzm/command-registry`**, per C79 §6.2 / C70 §7.1.
  It is recorded here rather than silently inherited from a green slab result — C79 §8.1's
  inherited-green prohibition.
- **The five C79 §5.2 recomputation states are not newly proven.** The annulus rides the existing
  `classifySlabRecompute` verdict, which classifies the **outer** loop. Whether a hole edge that
  fails to resolve should downgrade the element-level state per C79 §5.3 (*"the worst of its
  edges"*) is a real question this ADR does not answer.
- **No user-facing surface tells the user which edges follow** — C79 §10.6, still absent.

---

## 4 — Contracts, and what each one decided

| contract | clause | what it decided here |
|---|---|---|
| **C79** | §1.1, §1.2 | the hole is stored as **references**, not copied coordinates — this is why `innerLoops` and not `data.holes` |
| **C79** | §2.1, §2.2, §2.3 | hole edges are attributed **by construction** from the walk that produced them; the winding-twin de-dup is a canonical form, never a proximity match |
| **C79** | §2.5, §2.6 | fallback counts are summed over inner loops too — a hole with unattributable edges is reported, not absorbed |
| **C79** | §3.1, §3.4 | inner edges are `'centerLine'` @ `offset: 0`, **byte-identical** to outer edges |
| **C79** | §4.3 | every inner `HostReferenceEdge` ships a `fallback` at authoring time |
| **C79** | §6.5, §6.6 | **no new tracer.** The count of wall-region tracers in this repo is unchanged |
| **C79** | §7.2(a), §7.4 | `innerLoops` is POPULATED — the disposition for a field that names a dependency |
| **C71** | verbatim-restore | undo restores the sketch byte-for-byte; it does not re-derive it |
| **C72** | §2.4, §3.4 | no new tracker is built; the control drives the **real** mutation entry point |
| **C73** | §2.5, §3.1 | no new predicate body; ring identity is decided at a declared tolerance |
| **C11** | creation pipeline | the region result reaches the record through the existing creation path; no new stage |
| **C15** | host↔hosted | the hole is a *boundary* relationship, not an opening — it is C79's shape, not C15's, and it deliberately does **not** mint an `openingStore` record |
| **C16** | command authoring | **no new bus verb is introduced**, so C67/C68/`syncDisposition` are not engaged |
| **C03** | schemas | `innerLoops` is an existing optional field; no schema migration |
| **C78** | §8.1 | any refusal reason on the consequence path comes from the closed union |

## 5 — Alternatives rejected

1. **Implement polygon difference.** Rejected — `polygonBoolean.ts:45-49` refuses it for a stated
   reason, `check-predicate-canonical` is clean at 138/138, and the founder's approach does not
   need it. Reaching for a boolean here would re-derive from coordinates a separation the planar
   walk has already made topologically.
2. **Store the hole as an `openingStore` record** (the stair precedent). Rejected — an
   `OpeningData.profile` is a flat `{x,y}[]` with no host id. It would render today and would
   **never follow a wall**, which is the entire request. It would also put a boundary
   relationship into the openings family, which C15 owns and C79 does not.
3. **Widen `SlabData.holes` to carry host ids.** Rejected — that is `innerLoops`, re-invented
   under a second name, and C79 §6.5 forbids the second copy.
4. **A separate "building footprint" service over `partitionBuildings` /
   `tracePlanarFacesXZ`.** Rejected for *this* path. Both are real and canonical, but
   `SlabRegionTracer.buildAttributedClosedLoops` is the only one of the three that carries
   `hostId` provenance onto ring edges — and provenance is what a follow needs. Building a fourth
   producer to re-derive a ring the tracer already returned is the second-copy disease C79 §6.5
   names.
