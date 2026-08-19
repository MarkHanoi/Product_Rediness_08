# STR-17 — Computational-Geometry Capability: Evidence Register

**Status:** Living evidence document · **Measured:** 2026-08-19 · **Branch:** `main`

## 0. What this document is, and how to read it

This is an **evidence register**, not a capability claim. It answers one question — *which
computational-geometry techniques does the PRYZM codebase actually implement, and where* — with a
`path/file.ts:NN` citation or a re-runnable command behind every line.

It is written to be read adversarially. Three rules govern it:

1. **Four verdicts, never blurred.** `PRESENT` (implemented here, first-party), `PARTIAL` (real
   implementation with named limits), `VIA DEPENDENCY` (a third-party library provides it — the
   library is named), `ABSENT` (stated plainly).
2. **A gap stated is worth more than a keyword inflated.** §6 lists what PRYZM does *not* do. That
   section is load-bearing: everything else is credible only because it exists.
3. **Every number is re-derivable.** Where a count appears, the command that produced it appears
   beside it. Counts rot; commands do not.

⚠ **This document describes the artefact, not any individual's contribution to it.** It makes no
claim about who wrote which line. It is a description of a system, offered as material a reader can
verify and question.

---

## 1. Requirement → evidence map

For a reader traversing against a specific job requirement:

| # | Requirement | Where this document answers it | Strength |
|---|---|---|---|
| 1 | 5+ yrs SWE, significant CAD/CAM or computational geometry | §3 technique matrix · §4 case studies · §7 scale | **Direct** |
| 2 | 2+ yrs managing technically deep engineering teams | §8 governance · §9 AI-supported development | **Indirect — artefacts, not headcount** |
| 3 | Deep comp-geo: booleans, mesh processing, BReps, constraint solving | §3 matrix · §4.1, §4.2, §4.4, §4.5 | **Direct on booleans and predicates; two named gaps** — no 3-D B-rep (§6.2), constraint solver shallow and out of the main editor (§6.1) |
| 4 | Parametric/generative modelling; **feature-based modelling, history graphs, dependency propagation**, robustness at scale | **§5 — the strongest section** | **Direct and unusually deep** |
| 5 | Platform development and API design for multiple consumers; versioning, performance, DX | §8.1–§8.3 | **Direct** |
| 6 | Familiarity with geometry kernels — commercial, OSS or custom — and comfort with the trade-offs | **§4.1 (two stacks, escalated decision) · §6** | **Direct — a trade-off story, not a feature list** |
| 7 | Fluency in AI-supported software development, actively used | **§9 — evidenced by this document's own provenance** | **Direct, artefact-backed** |
| 8 | Delivery in a fast-paced distributed environment | §8.4 · §9 | **Direct** |
| 9 | Exposure to AEC / homebuilding software | §2 · §3 · §10 | **Direct hit** |

---

## 2. What PRYZM is, and where the geometry sits

PRYZM is a browser-based BIM (Building Information Modelling) platform: a 3-D architectural editor
with real-time CRDT collaboration, AI-assisted design, and IFC/Revit/DXF/Rhino interoperability. It
is a pnpm monorepo of **98 workspace packages**, **48 plugins** and **13 apps**.

The client is governed by an 8-layer dependency rule — *a layer may import from any lower layer,
never a higher one* — mechanically checked by `tools/ga-gate/check-layer-boundaries.ts`, which
resolves `@pryzm/X` → directory by reading each workspace manifest rather than trusting symlink
state.

```
L7  apps/*            (13)  — composition roots (editor, marketplace, workers, docs-site)
L6  plugins/*         (48)  — user-facing features: wall, door, roof, stair, rooms, annotations…
L5  packages/plugin-sdk     — curated public SDK facade
L4  renderer, render-runtime, persistence-client, scene-committer
L3  runtime-composer, ui-base, stores, view-state, file-format, sync-client
L2  geometry-kernel, geometry-*, ai-host, constraint-solver, drawing-primitives, spatial-index
L1  command-bus, picking, visibility, snapping, renderer-three, frame-scheduler
L0  packages/schemas   — pure Zod schemas; no I/O, no THREE, no DOM
```

Geometry is split deliberately. **`packages/geometry-kernel`** is the pure layer: no THREE, no DOM,
no I/O, no RNG, no clock — so the same model produces the same bytes in a browser worker, a bake
worker, an AI worker, and a snapshot test. **`packages/geometry-<family>`** (15 packages: wall,
slab, roof, stair, door, window, curtain-wall, column, beam, lift, lighting, plumbing, pool,
furniture, kernel) hold the per-family builders that the viewport consumes.

Two properties of this split matter more than the layer diagram, and both are covered below: the
kernel's purity is **gated, not merely intended** (§4.3), and the two geometry paths are **known to
disagree, measured, and deliberately not yet reconciled** (§4.1).

---

## 3. The technique matrix

| # | Technique | Verdict | What PRYZM actually does | Evidence |
|---|---|---|---|---|
| 1 | **Half-edge mesh / planar topology** | **PRESENT (2-D)** | A real half-edge structure over the plan graph: directed half-edges with `twin` pointers, CCW angular sort of outgoing edges per node, and left-face traversal via `next = out[(idx−1) mod n]`. Used for room/face detection from wall centrelines. | `packages/geometry-kernel/src/producers/room.ts:76-87` (`interface HalfEdge { … twin: HalfEdge \| undefined }`), `:146` (`fwd.twin = rev`), `:172-184` (`nextFaceEdge`), `:193` (`extractFaces`) |
| 2 | **Canonical planar face walk** | **PRESENT** | The same algorithm, declared as *the* canonical body and consumed by two domain layers as adapters. Documents its own filtering rules and deterministic tiebreak order explicitly, so two callers cannot get subtly different geometric answers. | `packages/geometry-kernel/src/pure/planarFaceWalk.ts:230` (`tracePlanarFacesXZ`), `:290-313` (`nextHalfEdge`), `:383` (`selectOuterFaceXZ`). Adapters: `packages/room-topology/src/PlanarTopologyEngine.ts:116`, `packages/auto-dimension/src/perimeter.ts:247` |
| 3 | **B-rep (3-D boundary representation)** | **ABSENT** | No `Shell` / `Face` / `Loop` / `Coedge` solid-model entity graph. Solids are triangle soup in a typed-array `BufferGeometryDescriptor`; area geometry is polygon-with-holes (outer ring + hole rings). The 2-D half-edge work above is a *plan* topology, not a solid B-rep. | Negative result — `Brep\|Coedge\|winged` returns no geometric hits across `packages/**/src` |
| 4 | **3-D boolean / CSG** | **VIA DEPENDENCY** (`manifold-3d`, WASM) | `KernelCSG` lazy-loads `manifold-3d` via dynamic `import()`, welds vertices to Manifold's epsilon, lifts to a solid, and releases native WASM memory on the way out. `produceBoolean` wraps union/subtract/intersect, explodes the returned triangle soup to per-triangle flat normals (booleans create new sharp seams), and emits a zero-length descriptor for an empty result rather than throwing. | `packages/geometry-kernel/src/csg/KernelCSG.ts:61` (`await import('manifold-3d')`), `:118-120` (union/difference/intersection), `:151-160` (lift). Producer: `packages/geometry-kernel/src/producers/boolean.ts:37,57-63`. Manifest: `package.json:268` `"manifold-3d": "^3.4.1"` |
| 5 | **2-D polygon boolean** | **PRESENT (first-party)** | An **arrangement + midpoint-classification** boolean (intersection and union). Chosen over Greiner–Hormann/Weiler–Atherton for a stated reason: real parcels share a whole collinear street-frontage edge with the published footprint by construction, which is exactly the input that breaks entry/exit classification. Splits both boundaries at all crossings *and* at vertices lying on the other's interior, then classifies each sub-edge by its **midpoint** — so the inside/outside verdict is never taken *at* a crossing. | `packages/geometry-kernel/src/pure/polygonBoolean.ts:85-118` (algorithm rationale), `:469` (`polygonBoolean2D`), `:534/:548`. Production consumer: `packages/site-parcel-data/src/geometry/explicitArea.ts:442` |
| 6 | **Polygon offset (Minkowski / parallel)** | **PRESENT (first-party)** | True parallel offset: shift each edge's supporting line along its own outward normal, intersect consecutive shifted lines. Replaced a radial-from-centroid "scale" that was shape-dependent. Detects but does not resolve self-intersection folds, and reports `degenerate: true` rather than returning a folded ring. | `packages/geometry-kernel/src/pure/polygonOffset.ts:201` (`offsetPolygon`), `:170` (`findSelfIntersection`), measured error table at `:30-44` |
| 7 | **Tessellation / triangulation** | **PRESENT (vendored) + VIA DEPENDENCY** | The kernel's canonical body is a trimmed port of public-domain `mapbox/earcut` (ISC), **embedded rather than installed** to preserve the kernel's zero-runtime-dependency property — including hole elimination via bridge-finding, z-order hashing for the accelerated ear test, and local-intersection cure. A second, rival path exists: the renderer-side builders call `THREE.ShapeUtils.triangulateShape` (three.js's own bundled earcut). | Canonical: `packages/geometry-kernel/src/pure/triangulatePolygon.ts:106` (`earcut`), `:120` (`eliminateHoles`), `:385` (`findHoleBridge`), `:425/:479` (z-order). Rival path: `packages/geometry-slab/src/SlabFragmentBuilder.ts:982`, `packages/geometry-roof/src/RoofGeometryBuilder.ts:245` |
| 8 | **Feature-based modelling operators** | **PRESENT** | A pure operator set with frozen signatures: **extrude**, **sweep**, **loft**, **revolve**, **boolean**. `produceSweep` uses **parallel-transport (Bishop) frames** to minimise twist along the path, with dominant-axis-perpendicular seeding to avoid gimbal lock. `produceRevolve` emits end caps only for partial sweeps so a full revolution stays watertight without a duplicated seam. | `producers/extrude.ts`, `producers/sweep.ts:22-26` (Bishop frames), `producers/loft.ts`, `producers/revolve.ts:16-21`, `producers/boolean.ts` — all under `packages/geometry-kernel/src/` |
| 9 | **Spatial indexing** | **PRESENT (first-party, two structures)** | (a) A uniform 3-D cell hash-grid with a typed `SnapBoundsError` refusal for NaN/Infinity/cell-count-explosion bounds, rather than letting V8 throw on the implicit array-grow path. (b) A **median-split AABB BVH** for O(log n) ray intersection and frustum culling; build O(n log n), longest-axis split, centroid sort, surface-area heuristic explicitly deferred. Separately, mesh-level raycasting uses the real **`three-mesh-bvh`** library (**VIA DEPENDENCY**) in `picking` and the solar occlusion pass. **No R-tree, quadtree or octree anywhere.** | `packages/spatial-index/src/SpatialGrid.ts:156-243` (`insert`/`remove`/`query`/`queryRadius`), `:22-30` (bounds refusal); `packages/spatial-index/src/BVHQuery.ts:8-9,143-172`. Library: `packages/picking/src/bvh-pick.ts:345` (`new MeshBVH(...)`), `package.json:284` `three-mesh-bvh ^0.9.9` |
| 10 | **Geometric predicates** | **PARTIAL — epsilon-based, not exact** | A canonical, unit-qualified tolerance policy (§4.3) plus canonical predicate bodies for segment/segment intersection, point-in-polygon, point-to-segment, and signed area. **Explicitly disclaims exact arithmetic**: no adaptive/expansion predicates à la Shewchuk (`orient2d`, `robust-predicates` — zero matches repo-wide). But the split between exact and epsilon is **reasoned, not accidental**: the boolean views compare **only signs** of four cross products, so they are exact and scale-independent (*"Exact sign tests: no epsilon, no divide"*), and epsilon appears only where a divide happens. `pointInPolygon` carries **no** degenerate-divide guard and argues why that is a *theorem*: the x-interpolation divide executes only when the straddle test `(yi > py) !== (yj > py)` holds, and that holding implies `yi ≠ yj` exactly, so the divisor is structurally non-zero. Boundary rule is half-open PNPOLY; `−0` is canonicalised to `+0` for determinism. | `packages/geometry-kernel/src/tolerance.ts:76,92,120,139`; `pure/segmentIntersection.ts:98-100,160-179` (exact signs), `:264` (guarded divide), `:269` (`+ 0`); `pure/pointInPolygon.ts:37-54`; `pure/pointToSegment.ts:29`; disclaimer `pure/polygonBoolean.ts:59-63` |
| 11 | **Constraint solving (geometric/sketch)** | **PARTIAL — see §6.1** | A real **sequential-projection (Gauss–Seidel-style) relaxation solver**: build per-constraint residual + projector functions, project onto each constraint's manifold in order, track max residual, stop on `< tolerance` or iteration cap. Tolerance `0.001` mm, cap 64 iterations. **Five constraint kinds** (`distance-pp`, `parallel`, `perpendicular`, `coincident-pp`, `fixed`), 2-D points and lines only. **Not** Newton/Jacobian — the module says so, and its DOF count is a naive variable-minus-removed count, not a Jacobian rank. Reachable only from `apps/component-editor`, not the main editor. | Solve loop `packages/constraint-solver/src/engine.ts:124-135`; projectors `:247-377`; `DEFAULT_TOLERANCE_MM = 0.001` `:56`, `DEFAULT_MAX_ITERATIONS = 64` `:61`; DOF `:385-403`; kinds `src/types.ts:21-26` |
| 12 | **Constraint solving (rule/compliance)** | **PRESENT** | A separate 17-rule advisory engine that *is* wired into the shipping editor: min room area, room-needs-door, habitable-needs-window, stair headroom, accessible route, travel distance, fire compartment area, means-of-escape count, corridor width, plumbing zone, acoustic RT60, daylight, thermal glazing. Debounced auto-run; feeds nine consequence planners. | `packages/constraint-solver/src/ConstraintEngine.ts:269-808` (rule registrations), `:140-150` (`validateAll`); wired at `apps/editor/src/engine/initDataPlatform.ts:50,165,298-312` |
| 13 | **Dependency graphs / change propagation** | **PRESENT — see §5** | Multiple cooperating graphs: view↔level dependency tracking with incremental graft-eligible re-projection, finish/ceiling/floor host trackers, and a semantic-graph cascade resolver with a 4-tier rebuild priority ordering. | `packages/core-app-model/src/views/ViewDependencyTracker.ts` (1103 lines), `packages/core-app-model/src/DependencyResolver.ts` (471 lines), `packages/finish-host-tracker/src/*DependencyTracker.ts` |
| 14 | **NURBS / B-splines** | **ABSENT (authored geometry)** · **VIA DEPENDENCY (import only)** | PRYZM's curved walls are **quadratic Bézier** curves — one control point, a segment count, no knot vector, no weights, no degree. They are **not** NURBS, not B-splines, not even cubic Bézier. Repo-wide grep for `knots\|controlPoints` across `packages/`, `apps/`, `plugins/` returns **zero** matches. NURBS appears only where the Rhino importer tessellates them on read (via three.js `Rhino3dmLoader`); no knot/control-point payload is retained. True circular arcs (centre/radius/angle) exist separately and only for structural grid lines, curved stairs, door swing symbols and the 2-D drawing primitive. **Do not describe any of this as NURBS.** | Schema: `packages/schemas/src/elements/Wall.ts:48-53` (`control: Vec3`, `segments ≥ 4`), `:14-15`. Evaluators: `geometry-wall/src/PathResolver.ts:84-93`, `geometry-kernel/src/producers/_internal/WallPath.ts:29-56` (`B(t) = (1−t)²P₀ + 2(1−t)tP₁ + t²P₂`). Import-only NURBS: `file-format/src/import/rhino/RhinoImporter.ts:15` |
| 14a | **Adaptive curve discretisation (sagitta control)** | **PRESENT** | Chord density is derived, not guessed. For a quadratic Bézier sampled at uniform `t` the second derivative is **constant**, so the mid-chord sagitta is exactly `\|P₀ − 2C + P₁\|·h²/4`. The module inverts that to solve for the segment count meeting a 5 mm sagitta target, bounded by a 64-segment ceiling and a minimum-chord cap, and **reports which bound it hit** (`'none' \| 'ceiling' \| 'min-chord'`). The inverse problem — recovering an arc from an already-tessellated polygon — is solved via the constant-second-difference identity and **verified by resampling**. | `packages/core-app-model/src/geometry/curvedWallTessellation.ts:79-83` (sagitta derivation), `:114` (`ARC_SAGITTA_TARGET_M = 0.005`), `:121` (`ARC_MAX_SEGMENTS = 64`), `:170-209` (`computeArcDensity`); inverse at `geometry-slab/src/boundaryArc.ts:179-304` |
| 15 | **Hidden-line removal** | **PRESENT** | Two engines, both first-party. The kernel-pure classifier sorts edges back-to-front by `worldZFront` and midpoint-tests each against occluder polygons. The drawing-layer engine is declared *one occlusion engine, three consumers* (plan, section, elevation) and is explicit about the one question it answers and the one it refuses. | `packages/geometry-kernel/src/hidden-line/classifier.ts:1-16,42`; `packages/core-app-model/src/drawing/HiddenLineRemoval.ts:1-13` |
| 15a | **GPU-side geometry: id picking** | **PRESENT** | Colour-encoded index picking: a parallel pick scene mirrors each pickable as a clone sharing the *same geometry reference* (no buffer duplication) with a `MeshBasicMaterial` whose colour encodes the slot index; a **1×1 render target** is drawn at the cursor and the pixel read back and decoded. A **driver-bug probe** renders a known colour and verifies the decode round-trips — the Mesa silent-zero bug returns `[0,0,0,0]`, which would decode to a valid-looking index 0, so failure falls back to CPU BVH raycast. A slot free-list bounds the index space by live element count instead of exhausting 2²⁴ in long sessions. | `packages/picking/src/gpu-pick.ts:1-16` (design), `:26-32` (driver probe), `:34-41` (free-list), `:972-1056` (per-instance pick clones); encode/decode `packages/picking/src/types.ts:203,212` |
| 15b | **GPU-side geometry: instancing and shadow scheduling** | **PRESENT** | `InstancedMesh` allocation with dynamic-usage instance matrices, capacity refusal rather than silent overflow, and a coalescer merging per-element instanced meshes. Shadow-map handling is scheduled rather than static: the map is frozen during camera motion and refreshed once against the settled scene, upgraded 512→2048 on an idle frame without ever disposing a GPU texture, and caster-set mutation **pauses WebGPU submits** first. | `packages/core-app-model/src/rendering/InstanceGroup.ts:66,102-105`; `packages/scene-committer/src/InstancedMeshCoalescer.ts:355,437`; `packages/renderer-three/src/pipeline/RenderPipelineManager.ts:1555-1576,1598-1617,1634-1683` |
| 15c | **Topological sort with cycle detection** | **PRESENT (scoped)** | **Kahn's algorithm** over the family-parameter expression graph, with in-degree seeding and decrement. Parameters in a cycle are surfaced as `cycle` **diagnostics at edit time** and excluded from resolution — resolution still proceeds for every parameter *not* in a cycle, rather than failing the whole graph. | `packages/family-runtime/src/resolution/resolveParameter.ts:90-126`; graph built from parsed expressions at `packages/family-runtime/src/expression/parser.ts:190` |
| 16 | **Mesh processing (normals, welding, orientation)** | **PARTIAL** | Winding normalisation (`ensureCCW`/`ensureCW`, earcut hole convention), per-face flat normals for boolean output, sharp per-station/per-segment normals to keep silhouette creases crisp, vertex welding at the CSG boundary. **No** decimation, remeshing, subdivision, parameterisation/UV-unwrap, or manifold repair. | `producers/slab.ts:63-68,96`; `producers/boolean.ts:11-16`; `producers/revolve.ts:24-27`; `csg/KernelCSG.ts:151-160` |

**Verdict counts (20 rows):** **PRESENT 13** · **PARTIAL 4** · **VIA DEPENDENCY 2** (rows 4 and 7;
row 14's import leg and row 9's `three-mesh-bvh` leg are further partial cases) · **ABSENT 2**
(row 3 B-rep, row 14 NURBS as authored geometry).

---

## 4. Hard problems, with the measurement

Adjectives are omitted. Each case gives the number.

### 4.1 Two geometry stacks, a parity harness, and an escalated decision *(requirement #6)*

PRYZM runs **two independent geometry implementations** of the same questions:

- **Stack A — the viewport.** `packages/geometry-wall/` → `MiterPrismBuilder.ts:66`,
  `CurvedWallLayerBuilder.ts` → `WallFragmentBuilder` → the 3-D editor.
- **Stack B — the bake/export worker.** `packages/geometry-kernel/src/producers/` (25 producer
  files) → `produceWall` → `HeadlessBakeSession.ts:124` → `RebakeChunkJob.ts:79`, shipped in
  `pryzm-selfhost/docker-compose.yml:94`.

**Nothing compared them until 2026-08-18.** The two suites that existed were both Stack-B-only:
`tests/parity/wall/wall-snapshot.test.ts` snapshots Stack B against *itself*, and
`wall-headless-node.test.ts` compares Stack B in-process against Stack B in a `worker_thread`. A
harness that compares a stack to itself does not establish parity — that observation is itself the
finding.

A real A-vs-B harness was then written, feeding identical inputs to both. Measured
(`ADR-0331-one-answer-per-question-and-the-decided-loser.md:66-69`):

| case | max &#124;Δposition&#124; |
|---|---|
| straight / mitered prism, 6 cases | ≤ 1.2e-8 m |
| curved plain / layer-offset / base-offset, 3 cases | ≤ 2.2e-7 m |
| **curved, MITERED at both ends** | **9.774 m** |

**Nine of ten agree to float32 storage noise** — recorded as *"a valuable negative result that
de-risks convergence"*. The tenth is a real divergence with an identified mechanism: Stack A
(`CurvedWallLayerBuilder.ts:69-83`) miter-projects the terminal corners and **writes back into the
corner table its face loops consume**; Stack B (`buildCurvedLayer.ts:133-137,159-165`) projects the
cap quad only, while its face loops (`:95-118`) consume unprojected stations. **Stack B predates a
fix Stack A shipped.**

The case is pinned `it.fails` rather than tolerated, because widening the threshold is forbidden:
*"Do not 'fix' it by loosening the tolerance — 9.774 m is not a tolerance"*
(`SPEC-ELEMENT-INTEGRITY-CONVERGENCE.md:97-98`; anti-pattern §8.f at `C84:1088`).

**The trade-off is formally escalated, not resolved by preference.**
`ADR-0331 §D5` is marked *ESCALATED to the founder*, with three costed end-states
(`ADR-0331:223-236`):

| | End state | Cost | Buys |
|---|---|---|---|
| **B-1** | Stack B becomes *the* engine; the editor migrates onto it | largest change on the board; Stack B covers 4 of 20 families today | one implementation, headless-native, server-side evaluation |
| **B-2** | Stack B serves bake/export only; Stack A stays the viewport | a mandatory per-family parity harness forever | smallest change; divergence becomes *gated* rather than unknown |
| **B-3** | Stack B is retired; bake calls Stack A | Stack A is THREE-coupled, so needs a THREE-free extraction | one implementation, no parity burden |

⛔ *"Until §D5 is decided, nothing in `packages/geometry-kernel/src/producers/` or
`plugins/*/src/committer/` may be deleted"* — because an editor-only importer census reads all 25
producers as dead, and the bake worker calls them.

> ⚠ **Honest caveat, and it belongs here rather than in a footnote.** The A-vs-B harness
> `stackAB-miter-parity.test.ts` **does not exist on `main`**. It lives in the lane worktree branch
> `salvage/z8-dupaudit` (commit `4dd9f820`). Verify:
> `ls tests/parity/wall/` → `wall-headless-node.test.ts`, `wall-snapshot.test.ts`, `configs`,
> `snapshots`, `vitest.config.ts` — no `stackAB-*`. C85 states the consequence itself: *"a gate that
> lives in a worktree gates nothing at HEAD"* (`C85-ELEMENT-WALL.md:707`). The **measurement** is
> real and reproduced in four contracts; the **continuous gate** is not yet at HEAD. Its threshold
> is also a bare `const TOL = 1e-4` — an unnamed, unit-unqualified literal that C73 §2.2 forbids,
> flagged as such at `C84:979`.

### 4.2 A vertical-datum authority: six rival expressions, two declared planes, delta 0

Before `WallVerticalDatum.ts` existed, **six expressions computed a wall-related world Y and none of
them was the authority** (`WallVerticalDatum.ts:4-15`; `C85-ELEMENT-WALL.md:616-617` states the root
cause precisely — *"not a datum disagreement — it was the absence of a datum"*).

The failure was invisible at defaults: **at zero offsets all six collapse to one number**, which is
why it survived. It is live at a 150 mm plinth. Measured (`C84:1147-1152`): wall bodies rendered at
`elevation + slabBaseOffset + 2 × wall.baseOffset` — `wall.baseOffset` applied **twice**, a doubling
that had never been named — while hosted door/window leaves used `elevation + sillHeight +
height/2`, with `slabBaseOffset` occurring **zero** times across `geometry-door/src` and
`geometry-window/src`. Leaf-vs-hole delta = `slabBaseOffset + 2 × wall.baseOffset`; the worked case
is **350 mm** out. Both offsets are user-editable from the property panel and from a shipped chat
capability, so *"set the base offset to 150 mm"* displaced every door and window on that wall from
its own hole.

The fix declares **two named planes** and applies each exactly once:

```
SEAT PLANE = level.elevation + slabBaseOffset      ← the wall GROUP's origin      (wallSeatY():86)
BASE PLANE = SEAT + wall.baseOffset                ← the body underside in world  (wallBaseY():103)
```

**Result: eleven datums agree and the leaf-vs-hole delta is 0** — wall group, layered arm,
miter-prism arm, hole band, in-wall frames, instanced arm, hit proxy, junction infill, door leaf,
window leaf, rake pivot (`C85:648-654`; `C84:1165-1167`, commit `8f63fb6f`).

Three details worth more than the headline:

- The pinning test `WallYDatumAgreement.test.ts` was written as a **characterisation ledger, not an
  approval** — it recorded the wrong numbers as they were, so a real fix had to come back and change
  them deliberately.
- A **fourth** defect surfaced during the fix: both dependency trackers omitted `baseOffset` from
  `_wallGeometryChanged`, so the edit that moved a hole never re-anchored what fills it (§5).
- **Four divergences remain**, each named with its delta under `§STILL-DIVERGENT` (`C85:657-670`).
  The largest, `SpatialAuthority.ts:159`, cannot see `slabBaseOffset`, and its closure is recorded
  as a design decision (*may the spatial authority read the slab store?*), not a patch. The
  publish/resolve mechanism is also flagged in its own contract as *"a process-global side channel,
  not a parameter"*.

### 4.3 One tolerance policy: 271 rival epsilons across three orders of magnitude

*"Every private epsilon is a private definition of 'the same place.'"*
`check-epsilon-policy` measured **271 rival declarations** (file × name) outside the kernel, across
**~50 distinct numeric values spanning three orders of magnitude** — and `geometry-kernel`, the
layer that owns geometry, **exported none**, so every consumer formed its own.

`packages/geometry-kernel/src/tolerance.ts` ends that with four declared, unit-qualified constants:

```ts
EPSILON_ZERO        = 1e-9    // :76   dimensionless — degenerate-case guards, divisors
COINCIDENT_M        = 0.001   // :92   metres — model-space point identity
RECOMPUTE_IDENTITY_M= 1e-9    // :120
PARALLEL_RAD        = 1e-9    // :139  radians
```

Three design decisions in it are the interesting part:

- **Canonicalised, not invented.** Values are grounded in the measured histogram
  (`1e-6×45, 0.05×20, 0.001×18, 1e-9×15, …`), with the gate declared authority for the *number* and
  the contract for the *ordering*.
- **Where two live conventions conflict, the tighter one is canon** — because the policy is a
  shrink-only ratchet, and starting loose means fighting the ratchet later.
- **Domain bands are not epsilons.** A 0.20 m wall-junction band and a 2.0 m room-identity radius
  stay under their own owners and are explicitly excluded. Conflating a snap radius with a point
  identity test is the error the module exists to prevent.

The ratchet: *"A tolerance may not be **widened** to make a test, a gate, or a user-visible artefact
pass"* (C73 §2.5). This is the clause that forced the 9.774 m case in §4.1 to be pinned as a defect
instead of tolerated.

### 4.4 One predicate family written fourteen times, in two spellings, with five epsilons

The segment/segment intersection predicate was measured **written at least fourteen times in
production**, in two algebraic spellings, with **five different degenerate-divide guards** between
them (`1e-8`, `1e-9`, `1e-10`, `1e-12`, and an EPS-signed straddle) and at least four different
boundary bands — *fourteen private definitions of "these two segments cross"*.

The consolidation is notable for **proving the two spellings are one family before merging them**:
the cross-product form's four determinants *are* the parametric form's numerators up to exact sign
flips, with `r = b−a`, `s = d−c`, `D = r × s`. Without that proof, collapsing them would have been a
behaviour change shipped as a refactor.

`packages/geometry-kernel/src/pure/segmentIntersection.ts:1-40,179-255`. Enforced by
`tools/ga-gate/check-predicate-canonical.ts`, a shrink-only ratchet currently reading **140 findings
against a declared level of 138** across the tracked families (segment/segment: 11 production
bodies; polygon area & winding: 73). The gate names its own blind spot: *"NOT PROVEN by this gate:
correctness of the surviving body — counting gates are blind to it by design."*

The same collapse pattern ran on triangulation: **seven rival bodies**, including three centroid
fans that were *"SILENTLY WRONG on concave input"* and a roof ear-clip whose `break` on "no ear
found" **shipped partial caps without a word** (`pure/triangulatePolygon.ts:5-25`).

### 4.5 Raked walls: a shear with no TRS decomposition

A raked (leaning) wall's end face is no longer vertical, which breaks every downstream assumption
that a wall is a prism. `WallRake.ts` is declared the single authority for what a rake *means*, and
states the sign convention once so it is never re-derived:

```
topOffset = height · cot(rakeAngleDeg) · leftPerp(direction)
```

measured on the wall's left side, reusing the *same* `leftPerp(d) = (−d.z, d.x)` that
`WallFootprint2D` and `JunctionResolverV2` already use — *"there is exactly one notion of 'left' in
the wall subsystem and this reuses it."* The header pins the sign with a worked example in both
directions (80° → +0.529 m; 120° → −1.732 m), and separately pins that `thickness` remains
**horizontal plan thickness**, not the perpendicular thickness of the leaning slab.

`rakeShearPerMetre` — the declared authority for `cot(rake)` — is consumed by **8 production modules
across 4 packages** (`geometry-wall`, `geometry-door`, `geometry-window`, `geometry-stair`), plus
**11 test files**: 19 files, 56 occurrences. `WallFragmentBuilder.ts:72` names it *"the ONE place
cot(rake) is computed"*; `HandrailRunGeometry.ts:220` says *"imported, not restated."*
Verify: `grep -rl rakeShearPerMetre packages/ | wc -l` → 19.

The shear is stated as a single transform rather than as a set of per-builder adjustments: the whole
wall — solid, void, reveal, frame, leaf — is the image of the vertical wall under
`(x, y, z) ↦ (x, y, z + k·(y − yBase))` with `k = cot(rakeAngleDeg)` (`WallRake.ts:113-119`). Rake is
bounded to 15°–165° and **rejected at the schema rather than clamped**, because |cot(15°)| ≈ 3.73
would shift a 3 m wall's top by 11.2 m. Two combinations are still **refused** rather than
approximated: `rake × curve` is recorded as ill-posed (*"this one never lifts"*), and
`rake × layers × openings` because the layered opening builder has no shear (`WallRake.ts:80-98`).

The hosted-element consequence is the sharp part: a shear has **no TRS decomposition**, so
`DoorBuilder` writes the object matrix directly with `matrixAutoUpdate` disabled rather than setting
position/rotation/scale (`geometry-door/src/DoorBuilder.ts:642-655`). On a degenerate baseline it
returns early and leaves the leaf plumb rather than emitting a NaN transform.

### 4.6 Hosted openings on straight, curved and raked hosts, in one parameterisation

C15 defines a hosted opening's position on a straight wall as a 1-D offset along a direction vector.
`WallArcParam.ts` generalises that correctly rather than special-casing curves: *"`offset` is a
distance measured **along the wall centreline**"*, of which the straight formula is the special case.

The implementation detail that makes it correct: the arc-length parameterisation **samples the same
quadratic Bézier at the same `curve.segments` resolution** the wall builder itself uses, *"so an
opening at arc length `s` lands EXACTLY on the built face, with no accumulating tessellation drift."*
Doors orient to the **tangent at their centre, never to the chord**, and this reduces exactly to the
straight case when the host is straight.

`packages/geometry-wall/src/WallArcParam.ts:213` (`arcFrameAt`), `:271` (`arcLengthAtPointXZ`),
`:388` (`hostedElementFrame`); consumed at `geometry-door/src/DoorBuilder.ts:586`,
`geometry-window/src/WindowBuilder.ts:947-952`.

The contract also documents the geometric consequence honestly rather than hiding it: offset and
width are measured on the centreline while jambs are **radial**, so on a curved host the outer-face
void is slightly wider than `width` and the inner slightly narrower, with the centreline exactly
`width` (`WallArcParam.ts:37-46`).

### 4.7 Numerical failure modes, found and measured

These are the defects that make the tolerance and predicate work above non-theoretical.

| Failure | Measurement | Evidence |
|---|---|---|
| **Unclamped line–line intersection** in junction infill — denominator guard `1e-9` with **no distance cap**. A near-collinear pass-through T sends a vertex **metres** out. | Live in production for opening/layered walls | `ISSUE-LOG.md:4996-4999` (L-909a) |
| **Near-parallel corner spike** — `intersectLines` rejected only *exactly* parallel, so barely-crossing offset edge lines produced **239 m and 1275 m** wall bodies. Fixed with an angular guard (`sinAngle < 0.05`), after a prior distance-threshold clamp *"tripped at ~13° and wrongly square-capped acute corners"*. | 239 m / 1275 m | `JunctionResolverV2.ts:1359-1379` |
| **Spike guard** — a degenerate miter corner made a plain joined wall's **body bbox span 125 m while its centreline was a clean 3.5 m**. Now budgeted and rejected. | 125 m vs 3.5 m | `WallFragmentBuilder.ts:4100-4105,4134-4162` |
| **Bow-tie / negative-area footprint** — a wall degenerate at a cluster (both endpoints in one raw endpoint cluster) hinges both ends on one pivot, inverting normals. This is the user-reported *"black triangular prism"* at T/L joints. | Recurrent, persisted across reopen | `JunctionResolverV2.ts:1178-1184`; `ISSUE-LOG.md:224` (L-74) |
| **Winding-flip refusal** — an inverting slab move re-derived a ring covering ground the user never enclosed, signed area **24 → −24**, with no refusal. Now refuses with **both numbers**, never a silent clamp. | 24 → −24 m² | `finish-host-tracker/src/reprojectFinishBoundary.ts:318-324` |
| **Zero-area hole that punches nothing, silently** — two `holes` fields with the same name in different coordinate spaces (`Vec3` with `y = elevation` vs `{x,y}` with `y = world Z`). Feeding one into the other collapses every vertex onto `z = elevation`. | Silent no-op; downstream empty `BufferGeometry` | `ISSUE-LOG.md:451` (L-300), `:472` (L-310) |
| **Degenerate baseline refused** rather than produced | `< 1e-6` m planar length → throw | `producers/wall.ts:77-81` |

One of these carries a process lesson recorded in the log itself: the unclamped-intersection defect
was *"correctly named, written down with a recipe, and still shipped for weeks because naming is not
fixing"* (`ISSUE-LOG.md:5006-5009`).

---

## 5. Parametric modelling, history graphs and dependency propagation *(requirement #4)*

This is the section that maps most directly onto *"feature-based modelling, history graphs,
dependency propagation, and keeping parametric systems robust at scale."*

### 5.1 The model is the single source of truth for every downstream output

One authoritative model drives, from the same state:

- **3-D geometry** — the per-family builders and the kernel producers (§2).
- **2-D drawings** — plan, section and elevation, produced by *projection* plus **hidden-line
  removal**, not by drawing separately. `HiddenLineRemoval.ts` is declared **one occlusion engine,
  three consumers, no second occluder**, and is explicit that it answers *"is a solid standing in
  front of this segment?"* and refuses the different question *"is this segment far away?"* — a
  distinction that had previously been conflated into one dashed layer, so a wall that was merely
  **far** drew identically to a wall that was **behind**.
- **Poché fill, edge projection, dimensions and view resolution** — `geometry-kernel/src/poche.ts`,
  `edge-projection.ts`, `dimensions/`, `view-resolution/`, plus `packages/auto-dimension/`.
- **Interoperability** — IFC/Revit/DXF/Rhino under `packages/file-format/`, and PDF via
  `packages/pdf-export`.

### 5.2 Feature-based operators with frozen signatures

The producer set is an explicit feature vocabulary — `extrude`, `sweep`, `loft`, `revolve`,
`boolean` — each with a **FROZEN signature**, each **L4 PURE** (*"no THREE, no DOM, no Node
primitives — so it runs byte-identically in the browser worker, the bake worker, the AI worker, and
the snapshot tests"*), and each emitting a **deterministic content hash** (`composeBooleanHash`,
`HASH_SCHEMA_VERSION = 'boolean:1'`, `'sweep:1'`, `'loft:1'`, …) so downstream cache and dedupe
layers can key on the hash without depending on the payload.

Versioned hash schemas per operator are the mechanism that makes a parametric cache safe to
invalidate across releases.

### 5.3 Dependency propagation, three cooperating graphs

**`ViewDependencyTracker`** (1103 lines) tracks which views depend on which spatial levels,
subscribes to the store event bus, marks **only** the affected views dirty, and queues a debounced
re-projection. Its refinement is the interesting part: a declared set of **graft-eligible** element
types whose entire plan representation is their own base projection, so a change to one re-projects
**only that element** and grafts its lines onto the already-warm cached drawing — `O(dirty)` instead
of disposing the drawing and re-projecting all N elements, which was a measured **~0.5 s** plan-view
lag. Types that inject a separate whole-view plan symbol are deliberately excluded from grafting,
because grafting them without their symbol pass would silently drop the symbol.

```
ViewDependencyTracker.ts:41-49   GEOMETRY_ELEMENT_TYPES  (19 types that carry 3-D geometry)
ViewDependencyTracker.ts:69-71   PLAN_INCREMENTAL_SAFE_TYPES = wall, slab, beam, ceiling, floor
```

**`DependencyResolver`** (471 lines) computes the **downstream cascade** over a semantic graph, with
a declared rebuild priority ordering:

```
1 structural (walls, slabs, columns) → 2 hosted (doors, windows on walls)
→ 3 spatial (rooms bounded by walls) → 4 derived (analytics, compliance)
```

It announces the computed cascade on exactly **one** event carrying `{tasks, triggerElementId,
operation, prevState}`, routed into the **existing** rebuild entry points — *"never a parallel
rebuild path."* Three rival specialised cascade events were deleted with their catalog entries in
the same commit, one of which had **zero listeners since authoring** — a dependency edge that had
never fired.

**A real topological sort with cycle detection exists, but only over family parameters.**
`packages/family-runtime/src/resolution/resolveParameter.ts:90-126` runs **Kahn's algorithm** over the
parameter expression graph - in-degree seeding, decrement, and a `cycle` diagnostic for anything left
over. Two design choices are worth naming: cycles are detected **at edit time, not save time**, and a
cycle does not fail the whole graph - *"Resolution proceeds for every parameter NOT involved in a
cycle."* This is the closest thing in the codebase to a classical parametric history graph, and it is
scoped to family parameters rather than to the element model.

**`finish-host-tracker`** carries `FinishHostDependencyTracker`, `FloorHostDependencyTracker` and
`CeilingHostDependencyTracker` for the host→finish relation.

### 5.4 Where dependency propagation actually failed, and how it was caught

The honest half of this section. Two measured failures:

- **A missing edge.** Both dependency trackers omitted `baseOffset` from `_wallGeometryChanged`, so
  the property edit that moved a hosted opening's hole **never re-anchored what fills it** (§4.2).
  The parametric relation was correct; the *invalidation input set* was incomplete — which is the
  characteristic failure mode of dependency-tracked parametric systems.
- **A documented invariant the implementation does not hold.** `DependencyResolver` describes
  itself twice as computing which elements are **transitively** affected (`:189-190`, `:299`), but
  `_tasksFromRelationships:423-445` iterates one element's relationships **once** and never enqueues
  the neighbours. There is no worklist, no depth loop and no visited set at that layer - the only BFS
  with a visited set lives in `SemanticGraph.traverse:1600`, which the resolver never calls.
  **The traversal is one hop; the doc says transitive.**
- **No cycle detection on the element graph.** Cycles are avoided by fiat rather than detected: the
  wall-to-wall `joinedTo` edge is given the lowest priority and explicitly excluded from driving a
  rebuild, because *"Scheduling a wall rebuild from the edge the rebuild just wrote would be
  circular"* (`DependencyResolver.ts:113-118`). The one real re-entrancy guard is in the finish
  tracker and was written against a measured failure: running host recomputation on the reverse pass
  of an undo *"invented 63 m2 of floor on a Ctrl+Z"*, so the tracker now does nothing while a revert
  is replaying (`FinishHostDependencyTracker.ts:30-33,115`).
- **A cascade registered against a verb nobody dispatches.**
  `plugins/cross/src/wall-room.ts:53,61` registers `wall.delete` as the wall→room cascade trigger,
  but every real delete reaches `element.delete` instead. **The room boundary recompute never fires
  on a user delete**, so `boundingWallIds` go stale while the delete command purges the `boundedBy`
  edges (`ADR-0331`, Consequences). Registration is not reachability.

Both are the reason `check-verb-liveness.ts` exists as a grow-only baseline: it measures whether a
declared dependency edge is ever actually travelled.

---

## 6. Honest gaps — what PRYZM does *not* do

Stated without apology, and deliberately placed before the platform section rather than after it.

### 6.1 The geometric constraint solver is real but shallow, and it is not in the main editor

This needs stating precisely, because both the overclaim and the underclaim are available and both
are wrong.

**What exists.** A genuine numeric solver: sequential projection onto each constraint's manifold
(Gauss–Seidel in structure), residual tracking, convergence at `0.001` mm or 64 iterations, and a DOF
readout. It handles five constraint kinds over 2-D points and lines.

**What it is not.** Not Newton–Raphson, not Jacobian-based, not least-squares. The module states its
own limits rather than hiding them: *"For cyclic systems (multiple coupled constraints) it tracks
slower than a real Jacobian-based solver would. No such solver ships in this repo."* Its DOF count is
`variableCount − removed`, and the docstring says plainly: *"the real planegcs Jacobian-rank counter
is more accurate."* Redundancy detection is duplicate-signature string matching, not rank analysis.

**Where it runs.** Only in `apps/component-editor`, a standalone family/component editor. The main
`apps/editor` imports **only** `@pryzm/constraint-solver/compliance` — the 17-rule advisory engine,
which is a different thing wearing the same package name.

**The naming defect, and the response to it.** `PlanegcsAdapter` declares `kind = 'planegcs'` while
delegating 100 % of its work to a class declaring `kind = 'mock'`, and `planegcs` appears in **zero**
`package.json` files. Rather than quietly renaming the adapter, two gates were written:
`check-solver-is-real.ts`, whose premise is *"no adapter reports a solve it did not perform"* — it
settles the question from the manifest without reading a line of adapter source — and
`check-constraint-honesty.ts`, which requires **every constraint family's declared strength to have
executable evidence at that strength**. The second also documents why it refuses the tempting
implementation: importing and driving the engine would make *"the instrument also the subject's only
witness."*

A further gap is named by the repo's own gate rather than by this document: the package's two test
files both bind the mock/adapter layer, and **neither opens `ConstraintEngine.ts`** — *"the component
doing the repo's only real ADVISORY constraint work has no suite at all."*

**Defensible phrasing:** a projection-based sketch solver over five constraint kinds, plus a wired
17-rule compliance engine — and the mechanical checks that stop either from misreporting what it did.
**Not** defensible: "built a geometric constraint solver" without those qualifiers.

Also absent: the richer constraint catalogue (`tangent`, `radius`, `angle`, `equalLength`,
`horizontal`, `vertical`, `diameter`, `distancePointLine`) exists as a **schema enum with no
evaluator**, and family profile baking refuses anything but point entities with a typed
`'profile-needs-solver'` error rather than approximating.

### 6.2 No 3-D B-rep

No shell/face/loop/coedge topology, no NURBS surfaces, no exact solid model. Solids are triangle
soup; the half-edge work is 2-D plan topology. Watertightness of boolean output is **not verified
in-repo** — it is delegated to the CSG engine (`__tests__/produceWallWithVoids.test.ts:45-52`).

### 6.3 No exact/robust predicates

Explicitly disclaimed: *"no adaptive/expansion arithmetic à la Shewchuk."* The 2-D boolean avoids
classic degeneracy by construction (midpoint classification) rather than surviving it, and states a
**proved** resolution limit — an area bound of `COINCIDENT_M × (P_A + P_B) / 2`, i.e. **≤ 0.015 m²**
for a 30 m parcel perimeter — validated by a differential arm over **240 generated concave pairs**
against exactly that bound. Two rings whose crossings are separated by less than 1 mm are outside
what it can resolve. `polygonBoolean.ts:59-82`.

### 6.4 Boolean difference is not delivered

`polygonBoolean2D` supports **intersection and union only**. Difference *"falls out of this body with
a third keep-rule"* but is deliberately absent: *"it is not oracle-pinned, and an unproven boolean
silently corrupts every consumer downstream of it."*

### 6.5 The 3-D CSG path is wired but off by default

`produceWallWithVoids` → `manifold-3d` is injected at `initTools.ts:876-877` but is **inert unless
`window.__wallSingleVolume === true`, and no source sets it**. A default-on experiment *"shipped a
malformed cut in production"* and was reverted to opt-in. What actually runs for wall openings today
is a `THREE.Shape`-with-holes extrude (plain walls) and a hand-written break-line cell grid (layered
walls) — **no boolean at all**. The CSG path is real, exercised by tests, and not yet the shipping
path.

### 6.6 Determinism and canonicalisation are incomplete, and the gates say so

All three geometry-determinism gates are currently **RED**, and the contract's own front matter
records it rather than the document discovering it:

| Gate | Reading |
|---|---|
| `check-epsilon-policy` | RATCHET EXCEEDED - 322 findings / 318 declared |
| `check-predicate-canonical` | RATCHET EXCEEDED - 140 / 138 (measured 2026-08-19) |
| `check-deterministic-regeneration` | STALE LEDGER |

Specific, nameable consequences:

- **The `signedArea` / winding family is not collapsed.** At least **7 distinct definitions inside
  `geometry-kernel` alone** (`producers/ceiling.ts:39`, `producers/room.ts:189`,
  `producers/slab.ts:54`, `_internal/roof/polygon.ts:52`, `pure/polygonOffset.ts:123`,
  `pure/triangulatePolygon.ts:617`, `pure/planarFaceWalk.ts:208`), with 73 production bodies
  repo-wide. The tolerance and predicate work in §4.3-§4.4 is **in progress, not finished.**
- **Private epsilons survive inside the rake/junction path**, contrary to the policy: `1e-6` and
  `1e-12` in `WallRake.ts:213,249`, `1e-9` in `JunctionResolverV2.ts:248` (value-equal to the
  declared `PARALLEL_RAD` but locally re-declared), `1e-12` in `polygonOffset.ts:254`. The last of
  these is *deliberate* and argued: migrating it to `PARALLEL_RAD` would **widen** the collinear
  branch and change output geometry and hashes - so it is a documented exception, not an oversight.
- **`crypto.randomUUID()` is live inside geometry packages** (`WallFragmentBuilder.ts:1494,1534,1931`,
  `OpeningTool.ts:459`, `CeilingTool.ts:587`, `StairMeshBuilder.ts:170`, and others), which sits
  against "geometry is a pure function of authoritative model state." The `pure/` layer is clean by
  declaration; the family builders are not.
- **`JunctionResolverV2` carries seven `globalThis` feature flags**, so wall junction geometry is a
  function of process-global state and not of model state alone.
- **GPU-side geometry is outside every gate.** The contract says so directly: *"anything computed in
  a shader is outside every gate here, and UNPROVEN."* The TSL types are `any` stubs because the
  installed three.js release does not export them.
- **The depth-readback path returns `distance = 0` on failure** (`gpu-pick.ts:59-60`) - a `0` meaning
  "could not compute", which is the exact anti-pattern the refusal contract forbids.

### 6.7 Other absences



- **No Delaunay / constrained Delaunay** anywhere (`poly2tri`, `libtess` — not present).
- **No mesh decimation, remeshing, subdivision, or UV parameterisation.**
- **No straight-skeleton** — named as where the roof engine is heading, not as what exists.
- **Polygon offset does not resolve self-intersection folds** or split a pinching polygon; it
  detects and reports `degenerate: true`.
- **The A-vs-B parity harness is not on `main`** (§4.1).

---

## 7. Scale, derived

Each row is the literal command and its output on `main`, 2026-08-19.

| Command | Output |
|---|---|
| `ls packages/*/package.json \| wc -l` | **98** workspace packages |
| `ls -d packages/geometry-* \| wc -l` | **15** geometry packages |
| `ls plugins/ \| wc -l` | **48** plugins |
| `ls apps/ \| wc -l` | **13** apps |
| `ls packages/geometry-kernel/src/producers/*.ts \| wc -l` | **25** producers |
| `ls packages/geometry-kernel/src/pure/*.ts \| wc -l` | **7** canonical pure primitives |
| `find packages/geometry-kernel/src -name '*.ts' \| wc -l` | **98** kernel source files |
| `find packages/geometry-kernel/src -name '*.ts' -exec cat {} + \| wc -l` | **15,220** kernel LOC |
| `find packages/geometry-* -path '*/node_modules' -prune -o \( -name '*.test.ts' -o -name '*.spec.ts' \) -print \| wc -l` | **250** geometry test files |
| `ls docs/02-decisions/contracts/ \| grep -c '^C[0-9]'` | **99** contracts |
| `ls docs/02-decisions/adrs/ADR-*.md \| wc -l` | **268** ADRs |
| `ls tools/ga-gate/check-*.ts \| wc -l` | **60** CI gates |

⚠ The `-prune` in the test-count command is load-bearing: without it `find` descends into nested
`node_modules` and double-counts a mirrored copy of the kernel's tests (**288** vs **250**). This is
the kind of denominator error the register discipline in §8.4 exists to catch.

**Geometry-specific gates, by name** — `check-epsilon-policy`, `check-predicate-canonical`,
`check-triangulation-canonical`, `check-offset-implementations`, `check-deterministic-regeneration`,
`check-cross-process-determinism`, `check-geometry-ceiling`, `check-solver-is-real`,
`check-constraint-honesty`, `check-derived-not-authored`, `check-height-fidelity`.

---

## 8. Platform, API design, and engineering governance *(requirements #2, #5, #8)*

### 8.1 An explicit, versioned public API

`packages/plugin-sdk` is a **curated facade**: a 693-line barrel re-exporting a deliberate subset of
11 upstream packages across **8 declared subpath exports** (`.`, `./descriptor`, `./types`,
`./lifecycle`, `./hosts`, `./sandbox`, `./signing`, `./dev`), plus a `pryzm dev` CLI. It is the only
workspace package at **v1.0.0**, and it publishes under a different name than its workspace name
(`@pryzm/sdk`). Consumption is real, not nominal: **867 import statements** from `plugins/` across
554 files, in **35 of 48** plugin manifests.

The API promise is written down and dated:

- `plugin-sdk/src/index.ts:22-23` - *"Anything you can import from here is locked for v1.x per
  ADR-0038 §A. Anything not exported here is internal and may move."*
- `plugin-sdk/CHANGELOG.md` - *"Breaking changes require v2.0.0 + 1-year deprecation cycle."* The
  v1.0.0 entry records three pre-publish audit gates, including an **API surface diff: 26/26 locked
  symbols, 0 breaking changes**.
- Deliberate narrowing, not just re-export: the store registry is re-exported **without**
  `register()` - *"READ-ONLY BY INTENT ... Plugins ask; they do not fill"* (`index.ts:666-693`).

Versioning machinery elsewhere: `packages/api-spec` is **OpenAPI 3.1** whose byte-stable SHA-256 is
**pinned in a test**, so an auto-formatter rewrite fails CI and schema changes must go through ADR
review. `packages/file-format` declares `PRYZM_FORMAT_SCHEMA_VERSION` with an **append-only,
single-version-step** migration framework: *"once a `MigrationStep` has shipped in a release, it is
NEVER removed"*, and each step's `toVersion` must equal `fromVersion + 1`. Command types are treated
as wire identifiers, not names - *"Renaming one is therefore not a refactor, it is a protocol
change"* - with aliases as the deprecation vehicle: *"An alias is a DEPRECATION, not a synonym.
Every alias needs a plan to remove it."*

### 8.2 The boundary is measured, and the measurement is public

`tools/ga-gate/check-layer-boundaries.ts` resolves `@pryzm/X` to a directory from
`git ls-files ... package.json`, and **imports the layer table from `eslint.config.js` rather than
copying it**. Run on `main`, 2026-08-19:

```
$ npx tsx tools/ga-gate/check-layer-boundaries.ts
workspace packages: 159 - classified: 146 - UNCLASSIFIED: 13
upward imports between classified packages: 102
L6 plugin imports bypassing the L5 SDK facade: 172
banned third-party imports outside their allowed homes: 113
within baselines (violations 102/102, unclassified 13/13, sdk-bypass 172/182).     [exit 0]
```

Four design choices here are the actual evidence of API-boundary maturity:

- **It replaced a rule that checked nothing.** The prior ESLint `boundaries` rule was set to
  `'error'` with no `import/resolver`, so `@pryzm/*` specifiers - essentially every cross-package
  import - could not be resolved and were silently skipped. The gate's header argues against
  resolver-based checking explicitly: *"A gate that fires unpredictably is worse than one that is
  off, because people trust it."*
- **Facade bypass is counted separately from layer violation**, because `plugin` importing
  `renderer-three` goes *downward*: it is an encapsulation breach, not a layering breach, and merging
  the two would make both numbers unreadable. That count has **fallen to 172 against a ceiling of
  182** - real convergence, not a frozen number.
- **Coverage is itself ratcheted.** UNCLASSIFIED (13) is a first-class reported number *"or the gate
  could be made green by classifying less."*
- **Exit codes do not alias.** `0` within baselines, `2` MISCONFIGURED (the gate could not reach its
  subject), `3` ratchet exceeded - deliberately **not** `1`, because `1` is the code the debt file
  can absorb. "Could not measure", "measured a failure" and "measured a regression" are three
  different facts.

Violations sit at **102/102 with zero headroom** - the file states that the next real upward import
fails the gate.

### 8.3 Commands as a declared, registered API surface

The command handler contract is a type, and the required field is the interesting one
(`packages/command-bus/src/types.ts:150-193`):

```ts
export interface CommandHandler<TPayload, TStores extends AnyStores = AnyStores> {
  readonly type: string;                        // canonical wire verb, e.g. 'wall.create'
  readonly aliases?: readonly string[];         // a DEPRECATION, not a synonym
  readonly affectedStores: readonly (keyof TStores & string)[];
  canExecute(ctx: HandlerContext<TStores>, cmd: TPayload): ValidationResult;
  execute(ctx: HandlerContext<TStores>, cmd: TPayload): Promise<HandlerResult> | HandlerResult;
}
```

`affectedStores` is required - a lint rule hard-fails any handler omitting it - and appears **1,031
times** across the repo. Registration validates at boot rather than at runtime, and **alias
collisions are fatal, not last-write-wins**: *"An alias silently shadowing a real command would route
a caller to the wrong handler and produce patches against the wrong store"*
(`CommandBus.ts:99-144`). Query verbs return their payload on a separate `report` channel rather than
in `forward`, specifically so *"Ctrl+Z would not 'undo' a QUESTION"*.

**The API register is generated and diffed in both directions, not maintained by hand.**
`tools/ga-gate/check-verb-register.ts` emits `docs/04-reference/API-VERB-REGISTER.md` - **326 verbs**
over 1,261 handler files, each row carrying seven columns (verb, owner, liveness, authoritative
store, undo, sync, chat):

| LIVE | REFUSES | SHADOWED (dead route) | UNKNOWN |
|---|---|---|---|
| 118 | 37 | **0** | 171 |

The gate's premise is explicitly anti-transcription - its header lists four measured cases where a
hand-maintained count in this repo had already rotted - and it enforces **symmetry in both
directions** plus a no-blank-cells rule: `UNKNOWN`, never blank, because *"an empty 'authoritative
store' cell would read as 'fine' and mean 'nobody looked'."* It also names its own blind spot: a
handler authored but never added to a handler set counts as registered, and liveness answers *"does
this reach an execution authority"*, not *"does it compute the right value."*

### 8.3a Performance budgets as a versioned artefact with an honesty rule

`packages/perf-budgets/src/nft-targets.ts` holds **19 non-functional targets** reproduced verbatim
from the performance contract, with a cross-check test that **parses the contract's markdown table at
test time and fails if any cell drifts**. It replaced four mutually inconsistent target sets, one
anchored to a deleted document and one carrying numbers *"up to 40x weaker."*

The rule that makes it worth citing: **a bench may only assert a contract limit when the thing it
measures is the thing the contract names.** `nftLimit()` *throws* rather than lend a budget to a
proxy measurement - *"A green bench that measures something adjacent is worse than no bench: it
manufactures false confidence."*

**6 of 19 are measured; 13 are `not-yet-measurable`**, each carrying a mandatory `blockedBy` and a
`measuresInsteadToday` disclosure. Three of those disclosures:

- AI critique latency - *"sub-microsecond pure JS, asserted < 3000 ms. **This assertion can never
  fail and therefore carries zero information.**"*
- Memory ceiling - *"2,000 (not 10,000) DTOs against a 200 MB (not 1.5 GB) ceiling, over seconds (not
  an hour). **Three separate deviations in one file.**"*
- E2E suite - the spec file the contract names *"**DOES NOT EXIST anywhere in the repo**."*

And an **inverted ratchet** that may only rise: benches executed in CI, baselined at 16, recorded
against the finding that before 2026-08-11 the number was **0 of 19** - *"C10 §4 lists 'All 17 NFT
benches pass' as a MERGE BLOCKER, so for the entire life of that clause the gate has been asserting a
fact nobody checked."*

### 8.3b Three ledger states, not two

Debt is tracked in a shape that distinguishes three genuinely different situations, which is unusual
and is the part worth defending in conversation:

1. **Shrink-only ratchets embedded in each gate's source** - a `LEDGERED_` constant *"is a record of
   how bad the debt was when someone last looked, and it may only ever fall - raising one converts a
   measurement into a permission."*
2. **`gate-debt.json` - declared debt.** Currently **2 gates**, down from 16 at the 2026-08-08
   baseline. Its rules cut both ways: a gate *not* on the list that fails is a regression and blocks
   CI; a gate *on* the list that starts **passing** is also a failure, and its line must be removed
   in the same commit.
3. **`gate-newly-measured.json` - a deliberately separate third file** (**28 entries**) for gates
   built this week that land RED on defects predating them. The rationale is precise: calling that a
   regression is wrong, and absorbing it as founder-approved debt backdates a decision that was never
   made - *"both labels are wrong, in opposite directions."* Each entry carries `firstReading`,
   `pinnedTo`, `predatesTheGate` and `exitCondition`, and `run-all.ts` refuses an entry present in
   both files.

### 8.4 Register discipline: UNPROVEN, FAIL and PASS are three values

The governance artefacts are a **99-contract suite** with a declared conflict-resolution order
(strategy → architecture → contracts → **268** ADRs → **96** SPECs), and *"when code disagrees with a
contract, the code is wrong."*

The discipline that matters for engineering leadership is narrower, and it is written down as a
rule rather than practised informally. `C67-RAC-CAPABILITY-CONTROL-PLANE.md:110-112`, verbatim:

> **Three values, never two: `PASS` != `FAIL` != `UNPROVEN`.** *"UNPROVEN is a different fact from
> FAIL, and the two are never merged"* ... An UNPROVEN cell is an invitation to measure; a FAIL cell
> is a defect with an owner; collapsing either into the other destroys the difference.

`C70 §3.4` extends it to composed systems: *"a chain containing an UNPROVEN link scores as
incomplete, never as passing. This is the rule that stops 'we have no transport' from silently
reading as 'collaboration is fine'."* And the failure mode has a named anti-pattern - *"Reporting
UNPROVEN as a blank, a zero, or a pass"* - alongside the observation that a register where every
cell reads UNPROVEN and the FAILED tally is 0 is *"maximally broken, maximally green."*

The corollary is the one that bites: **an unmeasured row may not be recorded as a measured one.** The C84 datum row (§4.2) had been marked LATENT *"on the stated ground
that nothing authors either offset non-zero"* — and **nobody had tested that ground**. The
correction names the failure exactly: *"an assumption recorded in the NOT-MEASURED register as
though it were a measurement."* The defect was live and 350 mm.

That pattern is documented repeatedly rather than hidden, in both directions:

- A gate documented as **RED** was re-run and found **GREEN** — *"the earlier reading was not merely
  stale, it was stale pessimistically — it named a breach that the gate does not report."*
- An enforcement claim (*"CI enforces this via eslint-plugin-boundaries"*) was found to be **false**
  and the architecture document corrected in place (§8.1).
- A tolerance figure quoted as the harness threshold was found to be an **observation** three orders
  of magnitude tighter than the actual `TOL` — corrected as *"the mirror image"* of reporting a
  defect as a tolerance (§4.1).
- Three rival gates counting the same subject were found to return three different verdicts, with
  the standing instruction: *"Name the gate you ran, or do not quote a number."*

Each correction is a documented instance of *"intellectually honest about what's hard, surface
constraints early instead of overpromising."* The practice is also why this document's §6 exists.

---

## 9. AI-supported software development *(requirement #7)*

The evidence here is contemporaneous: **this document was produced by one of a set of AI agent lanes
running concurrently against this repository on 2026-08-19**, and the working model is itself a
written artefact. Measured throughput under that model:

| Command | Output |
|---|---|
| `git log --since='2026-08-19 00:00' --oneline \| wc -l` | **75** commits (partial day) |
| `git log --since='2026-08-18 00:00' --until='2026-08-19 00:00' --oneline \| wc -l` | **197** commits |
| `grep -oE '^(#+ \| \| *)L-[0-9]+' docs/04-reference/ISSUE-LOG.md \| grep -oE 'L-[0-9]+' \| sort -u \| wc -l` | **949** distinct logged defects (highest id `L-1086`), each with the measurement that establishes it |

The mechanics, stated factually:

- **Contracts as machine-checkable specification.** A contract states a normative rule; a gate under
  `tools/ga-gate/` gives it a *mechanical reading* over a declared scope, with a declared baseline
  and an explicit exit condition. Where a contract has no gate, the contract says so.
- **Gates as ratchets, not booleans.** Most gates are shrink-only against a recorded ledger, so an
  agent cannot satisfy one by widening it. Several ledgers are keyed by
  `file::symbol::kind::fingerprint` rather than `file:line` specifically so that inserting a line
  above a finding does not silently re-key it — with an executed control fixture that inserts 31
  lines and asserts the key set is byte-identical.
- **Per-lane territory fences.** Lanes own disjoint file territory and commit with explicit
  path scoping, because the git index is shared across worktrees.
- **RED-first proof obligations.** A defect is logged with the measurement that establishes it
  before the fix lands, and the pinning test is written as a *characterisation ledger* (recording
  wrong numbers as they are) rather than an approval (§4.2).
- **Subagents as reviewers and as measuring instruments** — with the standing caution that a gate
  which is also its own witness proves nothing (§6.1).

Two failure modes of AI-assisted development are named in the repository's own memory and guarded
against, which is more useful than a claim of fluency:

- ***"Committed ≠ reachable"*** — four fixes in one session ran nowhere. Prove a change at the layer
  the user experiences, never at a pure function's return value. This is the same finding as §5.4's
  dead `wall.delete` cascade, generalised.
- ***"A fake more capable than the real thing"*** — a test double built from a header cannot falsify
  that header, and `any`-typed seams are defect factories.

---

## 10. AEC domain coverage and interoperability *(requirement #9)*

PRYZM is a BIM platform, not a general 3-D tool. It models **walls with layered assemblies**
(multi-layer construction with per-layer geometry, junction resolution and plan-symbol linework),
**hosted doors and windows** on straight, curved and raked hosts, **slabs, roofs, stairs with
handrails, curtain walls, columns, beams, lifts, ceilings, floors, plumbing, lighting and
furniture**. It performs **room detection from wall topology**, produces **plan, section and
elevation drawings** with hidden-line removal and poche, generates dimensions and schedules, and
carries a jurisdictional planning layer that computes buildable envelopes from cadastral parcel data
and municipal ordinance - which is where the 2-D polygon boolean (§3 row 5) runs in production, on
a path where a wrong answer overstates what a user may legally build.

**Interoperability, implemented vs stubbed.** The distinction matters more than the format list, and
the repository draws it itself:

| Format | Verdict | Evidence |
|---|---|---|
| **IFC4 / IFC4X3 export** | IMPLEMENTED | `plugins/ifc-export/` 5,963 LOC; `exporters/IFC4X3Exporter.ts` binds `web-ifc` for real; 13-file engine writer under `file-format/src/export/ifc/` |
| **IFC import** | IMPLEMENTED | `file-format/src/import/ifc/IfcImporter.ts` (41 KB, the largest interop file); `plugins/ifc-import/` + parse worker |
| **BCF issue round-trip** | IMPLEMENTED **and perf-measured** | `plugins/bcf/` 1,710 LOC; one of the 6 measured NFTs (< 4 s over a 50-topic archive) |
| **Revit - native .NET add-in** | IMPLEMENTED | `revit-addin/PRYZM.Revit.Bridge/` - C#/XAML project with compiled `bin/`, export and token commands, credential store. A genuine second-language consumer of the model |
| **Revit - IFC4X3-RV variant** | IMPLEMENTED, one declared stub | `plugins/ifc-export/src/exporters/revit-variant.ts` emits `Pset_RevitType`/`Pset_RevitInstance` and Worksets as `IfcGroup`; it does **not** fork the IFC4X3 exporter. `Pset_SiteRevitVariant` is self-declared as a stub |
| **DXF parse / import / export** | IMPLEMENTED (engine) | `export/sheets/DxfExportService.ts` (18 KB), `AnnotationDxfBridge.ts`, 7-file import directory |
| **DXF plugin** | **DECLARED SHELL** | `plugins/dxf/src/index.ts` - 66 lines, *"empty workspace-package shell"* |
| **Rhino .3dm** | IMPLEMENTED **twice** | `plugins/rhino-import/reader.ts` (McNeel `rhino3dm` WASM, lazy-loaded) **and** `file-format/src/import/rhino/RhinoImporter.ts` (three.js `Rhino3dmLoader`). Two independent paths with no shared code - a duplication risk, flagged rather than hidden |
| **glTF / GLB export** | IMPLEMENTED | `export/glb/GLBExporter.ts` (26 KB) + 3 tests |
| **PDF vector export** | IMPLEMENTED | `packages/pdf-export/` + `PdfExportService.ts` + `SVGCompositeRenderer.ts` (51 KB) |
| **PDF plugin** | **DECLARED SHELL** | `plugins/export-pdf/src/index.ts` - 68 lines |
| **PDF to BIM** | **PARTIAL - governance only** | `packages/pdf-to-bim/` is a confidence model + human review queue. **There is no PDF parsing or geometry extraction in it.** Do not describe it as a converter |
| **`.pryzm` v0 to v1 migration** | **TYPED STUB** | The framework is real; the single registered step throws `MigrationStubError` with `code = 'migration-stub'` so callers can distinguish it from a generic failure |
| **Family migrations** | IMPLEMENTED | `family-migrations/registry.ts` with cycle detection and single-linear-path enforcement |

**6 of 48 plugins are declared shells** (`dxf`, `export-pdf`, `geospatial`, `navigate`, `render`,
`visibility-intent`). Each says so in its first comment line - and each still exports a named
`*_PROVENANCE_MAPPING` absence record, so the gap is a typed artefact rather than nothing. Verify:
`grep -rln "empty workspace-package shell" plugins/*/src/index.ts | wc -l` -> 6.

One export budget is worth quoting on its own, because it is the same refusal discipline as §4.3
applied to a delivery decision. The GLB exporter declares a 1.5 M-triangle ceiling and then says what
it will *not* do about exceeding it: *"This is a BUDGET, not a decimator. PRYZM has no
mesh-simplification stage today, so the honest degradation for an over-budget model is to decline the
REAL representation and keep the MASSING one ... Inventing a third, silently-degraded 'REAL but
wrong' mode would misrepresent the model on a legal/feasibility surface."*

---

## Appendix — how to re-verify this document

```bash
# Layer model and gate inventory
ls tools/ga-gate/check-*.ts
npx tsx tools/ga-gate/check-layer-boundaries.ts

# Geometry-specific gates (each prints its own census and baseline)
npx tsx tools/ga-gate/check-epsilon-policy.ts
npx tsx tools/ga-gate/check-predicate-canonical.ts
npx tsx tools/ga-gate/check-triangulation-canonical.ts
npx tsx tools/ga-gate/check-solver-is-real.ts

# The kernel
ls packages/geometry-kernel/src/{pure,producers,csg,hidden-line}/
sed -n '1,60p' packages/geometry-kernel/src/tolerance.ts

# The two-stack decision and the divergence
sed -n '223,240p' docs/02-decisions/adrs/ADR-0331-one-answer-per-question-and-the-decided-loser.md
sed -n '525,555p' docs/02-decisions/contracts/C84-ELEMENT-INTEGRITY.md

# Confirm the parity harness is NOT on main (§4.1 caveat)
ls tests/parity/wall/
```

**Related contracts:** `C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md` (determinism and tolerance),
`C84-ELEMENT-INTEGRITY.md` (element integrity, one answer per question),
`C85-ELEMENT-WALL.md`, `C86-ELEMENT-WALL-OPENING.md`, `C15-HOSTED-ELEMENT-CONTRACT.md`,
`ADR-0331-one-answer-per-question-and-the-decided-loser.md`.
