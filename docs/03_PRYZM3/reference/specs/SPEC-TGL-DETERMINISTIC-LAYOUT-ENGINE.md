# SPEC — Deterministic Topological Generative Layout (D‑TGL) Engine · BIM3.0

| Field | Value |
|---|---|
| Status | **Implemented & wired (v1.0).** Engine P1→P9 built, unit‑tested (72 tests) and wired as the offline fallback of the Apartment Layout Generator (#51); the non‑AI substrate of PRYZM's BIM3.0 generative stack. As‑built manifest in §10. |
| Version | 1.0 (2026‑05‑25) |
| Owner | Computational design / BIM3.0 architecture |
| Governed by | C09 (AI & generative L7.5), C15 (hosted openings), C16 (command authoring), SPEC‑APARTMENT‑LAYOUT‑GENERATOR (the consumer), C03 (schemas/state) |
| Hard constraints | **Deterministic** (same input → byte‑identical output), **synchronous in‑browser < 2 s**, **unit‑testable**, **no stochastic methods** (no NSGA‑II, no Monte‑Carlo, no `Math.random`), **no Voronoi** for interior orthogonal layouts. |

> D‑TGL turns a **shell polygon + a program brief** into **K Pareto‑ranked interior
> layouts**, each materialised as **both** (a) geometry (walls + hosted doors) and
> (b) a **persistent semantic graph** (spaces, boundaries, connections) that is
> IFC5‑/RDF‑ready and queryable post‑generation. The graph is the product; the
> geometry is a projection of it. That is what makes this **BIM3.0, not BIM2.0**:
> the model is a typed, linked knowledge graph, not a bag of meshes.

---

## §1 — Algorithm name & academic lineage

**Name:** *Deterministic Topological Generative Layout* (**D‑TGL**) — more fully:

> **Rectilinear Dissection + Squarified Slicing‑Tree Subdivision + Space‑Syntax‑Weighted Deterministic Pareto Enumeration, over a persistent topological space graph.**

**Lineage (each phase cites its source):**

- **Rectilinear polygon partition / dissection** — computational geometry; vertical‑slab sweep decomposition of rectilinear (and slant‑approximated) polygons. *(Lipski et al.; Ohtsuki — minimum rectangular partition.)*
- **Slicing‑tree floorplanning** — VLSI placement; recursive guillotine subdivision. *(Otten 1982, "Automatic floorplan design"; Wong & Liu slicing trees.)*
- **Squarified treemaps** — area‑proportional subdivision with aspect‑ratio minimisation. *(Bruls, Huizing & van Wijk 2000.)*
- **Bubble diagrams / architectural programming** — adjacency requirement graphs. *(classic; formalised in Michalek & Papalambros 2002, "Interactive design optimization of architectural layouts".)*
- **Space Syntax** — justified graph, mean depth, Relative Asymmetry, Integration. *(Hillier & Hanson 1984, "The Social Logic of Space"; Bafna 2003.)*
- **Deterministic multi‑objective ranking** — finite candidate enumeration + Pareto non‑domination (explicitly **NOT** NSGA‑II): the candidate set is small and seeded by fixed strategies, so the Pareto front is computed by exact dominance, not stochastic evolution.

This is the family that production tools (TestFit, Hypar, Spacemaker) approximate; D‑TGL keeps the deterministic, testable members and discards the stochastic ones for an in‑browser engine.

---

## §2 — Phased pipeline (modules, I/O, data contracts)

All modules are PURE (no DOM/THREE/network), live under
`packages/ai-host/src/workflows/apartmentLayout/tgl/`, operate in **metres, plan
frame `{x, z}`** (z = world Z = plan "up"), and round to 1e‑6 m at boundaries.

| Phase | Module | Input → Output | Status |
|---|---|---|---|
| **P1** | `rectDecomposition.ts` | `Pt[]` shell polygon → `Rect[]` (axis‑aligned, slab sweep) | ✅ 8 tests |
| **P2** | `bubbleGraph.ts` | `ApartmentProgram`, availableAreaM2 → `BubbleGraph` (rooms + targets + adjacency edges) | ✅ 6 tests |
| **P3a** | `squarify.ts` | `Rect`, `AreaItem[]` → `PlacedItem[]` (squarified treemap) | ✅ 6 tests |
| **P3b** | `subdivide.ts` | `Rect[]` + `BubbleGraph` → `RoomPlacement[]` (rooms→footprints; pack across rects, squarify each, corridor cell) | ✅ 5 tests |
| **P4** | `wallsAndDoors.ts` | `RoomPlacement[]` + `BubbleGraph` → `{ segments: WallSeg[]; openings: OpeningSpec[] }` (dedup shared walls; doors on realised adjacencies) | ✅ 5 tests |
| **P5** | `semanticGraph.ts` | `RoomPlacement[]`+`WallSeg[]`+`OpeningSpec[]`+`BubbleGraph` → `LayoutGraph` (the persistent BIM3.0 graph; §3) | ✅ 6 tests (+4 `ifcGuid`) |
| **P6** | `spaceSyntax.ts` | `LayoutGraph` → `SyntaxMetrics` (per‑space depth, mean depth, RA, integration; §4) | ✅ 5 tests |
| **P7** | `objectives.ts` | `LayoutGraph`+`SyntaxMetrics`+`BubbleGraph` → `ObjectiveVector` (5 raw axes; §4 — weights applied in P8) | ✅ 5 tests |
| **P8** | `enumerate.ts` | shell+program+weights → `TglCandidate[]` (graph+objectives+rank; run P1–P7 over a fixed 8-strategy set; Pareto‑rank; §2.2) | ✅ 7 tests |
| **P9** | `emitGeometry.ts` | `LayoutGraph` → `LayoutOption` (+ aligned GUIDs) (mm `{x,y}` walls+doors for `buildLayoutCommands`) | ✅ 5 tests |
| **P10** | `ifc5/` | `LayoutGraph` → IFC5 + RDF/OWL (§5) | ⏳ (post‑MVP) |

### §2.1 — Data contracts between phases

```ts
// P1
interface Pt { x: number; z: number }                 // metres, plan frame
interface Rect { x0; z0; x1; z1 }                      // x0<x1, z0<z1

// P2
interface ProgramRoom { id; type: RoomType; name; targetAreaM2; isPrivate; needsWindow }
interface AdjacencyEdge { a: id; b: id; via: 'open'|'door' }
interface BubbleGraph { rooms: ProgramRoom[]; edges: AdjacencyEdge[]; corridorId; entryId }

// P3b
interface RoomPlacement { roomId: id; rect: Rect }     // footprint for each ProgramRoom

// P4
interface WallSeg { id; a: Pt; b: Pt; thickness; boundsRoomIds: id[] }   // ≤2 rooms ⇒ interior shared/exterior
interface OpeningSpec { id; wallId; type:'door'|'window'; offsetM; widthM; heightM; sillM; betweenRoomIds:[id,id?] }

// P5 — the persistent graph (see §3)
interface LayoutGraph { nodes: GraphNode[]; edges: GraphEdge[]; meta: { shellArea; levelId; seed } }

// P6/P7
interface SyntaxMetrics { perSpaceDepth: Record<id, number>; meanDepth; integration: Record<id, number> }
interface ObjectiveVector { efficiency; adjacency; daylight; circulation; regularity }  // each 0..1, higher better
```

**Contract invariant (every phase):** outputs are a pure function of inputs; no
hidden global reads; arrays are returned in a **stable, sorted order** (never
Map/Set iteration order — see §6).

### §2.2 — Deterministic Pareto enumeration (the NSGA‑II replacement)

P8 runs the P1–P7 pipeline over a **fixed, finite strategy set** `S` (e.g.
`{ sliceMajorAxis: [x, z] } × { publicZone: [low, high] } × { corridorSide: [a, b] }`
→ ~8 candidates). Each candidate yields an `ObjectiveVector`. We then:

1. Compute the **Pareto‑non‑dominated set** by exact dominance (a dominates b iff
   ≥ on every axis and > on one).
2. Rank the front by the **weighted sum** of the (weight‑normalised) objectives.
3. Return the top `count`.

No populations, no mutation, no RNG → identical output every run. The strategy set
is the only "search"; it is enumerated, not evolved.

---

## §3 — Persistent semantic graph schema (what makes it BIM3.0)

The engine's primary output is `LayoutGraph` — a typed property graph that
**persists after geometry generation** and is the single source of truth. Geometry
(walls/doors) is emitted from it (P9); analyses (cost/energy/structure) attach to
it without regeneration (the digital‑twin bridge).

### §3.1 — Node types

| Node | Maps to (IFC5) | Key properties (Pset) |
|---|---|---|
| `Space` | `IfcSpace` | `guid`, `spaceType` (IfcSpaceTypeEnum + our RoomType), `name`, `netAreaM2`, `targetAreaM2`, `isPrivate`, `windowCount`, `polygon: Pt[]` |
| `Wall` | `IfcWall` / `IfcWallStandardCase` | `guid`, `baseLine:[Pt,Pt]`, `thickness`, `heightM`, `isExternal`, `loadBearing?` |
| `Opening` | `IfcOpeningElement` | `guid`, `hostWall: wallGuid`, `offsetM`, `widthM`, `heightM`, `sillM` |
| `Door` | `IfcDoor` | `guid`, `opening: openingGuid`, `widthM`, `heightM`, `operation` |
| `Window` | `IfcWindow` | `guid`, `opening`, `widthM`, `sillM` |
| `Level` | `IfcBuildingStorey` | `guid`, `elevationM`, `name` |

### §3.2 — Edge types

| Edge | Maps to (IFC5) | Meaning |
|---|---|---|
| `BOUNDS` (Wall→Space) | `IfcRelSpaceBoundary` (2nd level) | a wall is a boundary of a space |
| `ADJACENT_TO` (Space↔Space) | `IfcRelSpaceBoundary` (shared element) | two spaces share a wall |
| `CONNECTS_THROUGH` (Space↔Space, via Door) | `IfcRelConnectsElements` + door | circulation link (a door) — the **Space‑Syntax edge** |
| `HOSTED_BY` (Opening→Wall) | `IfcRelVoidsElement` | opening voids its host wall (C15 cascade) |
| `FILLS` (Door/Window→Opening) | `IfcRelFillsElement` | element fills the opening (C15) |
| `CONTAINS` (Level→Space/Wall) | `IfcRelContainedInSpatialStructure` | spatial containment |

### §3.3 — Property sets (extensibility for the digital twin)

Each node carries an open `psets: Record<string, Record<string, Primitive>>`. The
generator populates `Pset_SpaceCommon` (area, type, occupancy) etc.; downstream
twin services **add** psets (`Pset_ThermalLoad`, `Pset_CostEstimate`,
`Pset_StructuralLoad`) **without touching geometry** — they query the graph by
node type/edge and attach. The graph is append‑only‑friendly: regeneration is
never required to enrich it.

### §3.4 — Stable identity (IfcGUID)

Every node has a **deterministic** `guid` (§6): `ifcGuid(seed, role, index, geomKey)`
— a base64 IFC‑compressed GUID derived from a stable FNV‑1a hash of those inputs.
Re‑running the generator on the same input reproduces the same GUIDs (so diffs,
versioning, and twin links are stable). **Never `crypto.randomUUID()` here.**

---

## §4 — Space Syntax integration → Pareto scorer

**Where it attaches:** P6 consumes the `LayoutGraph`'s `CONNECTS_THROUGH` edges
(doors) + `ADJACENT_TO` (open thresholds) as the **justified graph**; the root is
the `Space` linked to the entrance (`entryId`).

**Computation (deterministic BFS):**
- `depth(s)` = graph distance (in connection steps) from the entrance space.
- `meanDepth (MD)` = Σ depth(s) / (n − 1).
- `RelativeAsymmetry (RA)` = 2(MD − 1) / (n − 2).
- `Integration(s)` = 1 / RRA(s), RRA = RA / D\_n (Hillier's normalisation constant).

**Feeds the 5‑axis `ObjectiveVector` (P7):**

| Axis | Formula (higher = better) | Uses |
|---|---|---|
| `efficiency` | 1 − corridorArea / totalArea | geometry |
| `adjacency` | (satisfied bubble edges) / (required edges) | graph vs `BubbleGraph` |
| `daylight` | Σ area(spaces with window) / totalArea | window proximity to façade |
| `circulation` | normalised **mean‑depth** term — *shallower public, deeper private* (reward low MD for `living`/`hall`, high depth for `bedroom`/`bathroom`) | **Space Syntax MD/integration** |
| `regularity` | mean(min(w,h)/max(w,h)) over spaces (aspect→1) + wall‑axis alignment | geometry/structure |

`circulation` is the direct Space‑Syntax injection: a layout where bedrooms are
shallow (off the entrance) and the living room is deep scores **low**; the
architecturally‑correct gradient (public shallow, private deep) scores **high**.

---

## §5 — IFC5 / RDF mapping layer (P10)

Attaches at the **end** (consumes the finished `LayoutGraph`); never mid‑pipeline,
so the geometry phases stay export‑agnostic.

- **IFC5** (`tgl/ifc5/toIfc5.ts`): node/edge → the IFC5 entity table in §3.1/§3.2.
  IFC5 is the ECS/graph‑native schema, so our property graph maps **1:1** (no
  lossy flattening): `Space`→`IfcSpace`, `ADJACENT_TO`→`IfcRelSpaceBoundary`,
  `CONNECTS_THROUGH`→door + `IfcRelConnectsElements`, psets→`IfcPropertySet`.
- **RDF/OWL** (`tgl/ifc5/toRdf.ts`): emit triples against **BOT (Building Topology
  Ontology)** + **PROPS/OPM** for properties:
  `bot:Zone`/`bot:Space`, `bot:adjacentZone`, `bot:Element`, `bot:hasElement`,
  `bot:interfaceOf` (doors). Each node's `guid` is the URI fragment, so IFC5 GUID
  ↔ RDF URI are the same stable identifier (no remapping). Linked‑data‑ready:
  external twins (energy, cost) reference our URIs directly.

**Lossless guarantee:** because our graph already carries typed nodes/edges +
psets + stable GUIDs, both exporters are **structure‑preserving projections** — no
information is invented or dropped.

---

## §6 — Determinism risks & protections

| Risk | Protection |
|---|---|
| **GUID/ID generation** | Deterministic `ifcGuid(seed, role, index, geomKey)` via FNV‑1a; the `seed` is derived from the shell + program (stable). **Banned:** `crypto.randomUUID`, `Math.random`, `Date.now` in the pipeline. |
| **Map/Set iteration order** | Never iterate a `Map`/`Set` for output; always materialise to arrays sorted by a stable key (id, then x, then z). |
| **Floating‑point drift** | Round to 1e‑6 m at every phase boundary; compare with EPS; never test exact equality on derived floats. |
| **Candidate "search"** | Fixed enumerated strategy set (§2.2) — no RNG, no time budget that changes results. A wall‑clock cap may *truncate* candidates but the kept set is prefix‑stable (strategies in fixed order). |
| **Object key ordering in JSON/RDF** | Emit keys in a fixed declared order so serialisation is byte‑stable. |
| **`squarify` tie‑breaks** | Equal‑ratio ties resolve by input order (already deterministic). |

**Determinism test (global):** `generate(input)` run twice → `deepEqual` on the
full `LayoutGraph` including GUIDs.

---

## §7 — Unit‑test contract per phase (invariants)

- **P1 `rectDecomposition`** — Σ rect area ≤ polygon bbox; for rectilinear input Σ area == polygon area; no rect center lies outside the polygon; rects pairwise non‑overlapping; rectangle→1, L→≥2. *(✅)*
- **P2 `bubbleGraph`** — every room area ≥ §8 minimum; Σ targets ≥ availableArea (pre‑clamp ≈); every private room has a path to `entryId` in the edge set; open‑plan kitchen↔dining edge `via:'open'`. *(✅)*
- **P3a `squarify`** — cells tile bounds (Σ area == bounds area ± EPS); pairwise non‑overlap; in‑bounds; area proportions preserved; aspect ratio bounded for even splits. *(✅)*
- **P3b `subdivide`** — every room gets exactly one footprint; footprints ⊆ shell rects; non‑overlapping; total footprint area ≈ shell area; corridor cell present iff `corridorId`.
- **P4 `wallsAndDoors`** — each interior wall references ≤2 spaces; each `via:'door'` bubble edge realised by exactly one opening on the shared wall; door fits (offset+width ≤ wall length, clearance ≥ 0.6 m); no duplicate wall for a shared boundary.
- **P5 `semanticGraph`** — graph connected via `CONNECTS_THROUGH`+`ADJACENT_TO` from `entry`; every Space has ≥1 `BOUNDS` wall; every Door has `FILLS`→Opening→`HOSTED_BY`→Wall (C15 chain intact); GUIDs unique + deterministic across two runs.
- **P6 `spaceSyntax`** — depths finite + monotone from entry; MD/RA match hand‑computed values on a fixture; disconnected graph → flagged (not NaN).
- **P7 `score`** — each axis ∈ [0,1]; a known‑good layout outscores a known‑bad one on the targeted axis (e.g. bedrooms‑deep beats bedrooms‑shallow on `circulation`).
- **P8 `enumerate`** — returns ≤ count options; options Pareto‑sorted (no option dominates an earlier one); **deterministic** (two runs deep‑equal); < 2 s for a 12‑room program.
- **P9 `emitGeometry`** — every Space/Wall/Door in the graph appears in the `LayoutOption`; mm conversion exact (×1000); door `elementId` == door GUID (C15).
- **P10 `ifc5/rdf`** — round‑trip node/edge counts preserved; every GUID present in both exports; RDF validates against BOT shapes.

---

## §8 — Build order & consumer wiring

P3b → P4 → P5 → P6 → P7 → P8 → P9, each pure + tested + committed. P8's
`ScoredLayoutOption[]` replaces `generateProceduralLayout` behind the existing
opt‑in `proceduralFallback` seam in `generate.ts`; P9 feeds the existing
`buildLayoutCommands` → the editor build pipeline is unchanged. The `LayoutGraph`
(P5) is exposed for the future digital‑twin + IFC5 work (P10) — that is the
BIM3.0 payload, persisted independent of the geometry.

## §9 — Cross‑references
SPEC‑APARTMENT‑LAYOUT‑GENERATOR (consumer + AI path), C09 §2.4/§3.4 (generative L7.5),
C15 (hosted opening cascade), C16 (command authoring), Hillier & Hanson 1984 (Space
Syntax), Bruls et al. 2000 (squarified treemaps), Otten 1982 (slicing floorplans),
BOT ontology (W3C LBD‑CG).

---

## §10 — As‑built manifest (v1.0)

Everything lives in `packages/ai-host/src/workflows/apartmentLayout/` (layer **L2**,
ai‑host). The pure engine is the `tgl/` subfolder; tests are in
`packages/ai-host/__tests__/tgl*.test.ts`.

| Module | Phase | Exports | Tests |
|---|---|---|---|
| `tgl/rectDecomposition.ts` | P1 | `decomposeToRects`, `mergeHorizontally`, `polygonBBox`, rect helpers, `Pt`/`Rect` | `tglRectDecomposition` (8) |
| `tgl/bubbleGraph.ts` | P2 | `buildBubbleGraph`, `BubbleGraph`/`ProgramRoom`/`AdjacencyEdge` | `tglBubbleGraph` (6) |
| `tgl/squarify.ts` | P3a | `squarify`, `AreaItem`/`PlacedItem` | `tglSquarify` (6) |
| `tgl/subdivide.ts` | P3b | `subdivide`, `RoomPlacement` | `tglSubdivide` (5) |
| `tgl/wallsAndDoors.ts` | P4 | `buildWallsAndDoors`, `WallSeg`/`OpeningSpec` | `tglWallsAndDoors` (5) |
| `tgl/ifcGuid.ts` | P5 | `ifcGuid` (deterministic IFC GlobalId) | `tglIfcGuid` (4) |
| `tgl/semanticGraph.ts` | P5 | `buildSemanticGraph`, `LayoutGraph`/`GraphNode`/`GraphEdge`, `nodesOfKind`/`edgesOfKind` | `tglSemanticGraph` (6) |
| `tgl/spaceSyntax.ts` | P6 | `computeSpaceSyntax`, `SyntaxMetrics` | `tglSpaceSyntax` (5) |
| `tgl/objectives.ts` | P7 | `computeObjectives`, `ObjectiveVector`, `OBJECTIVE_AXES` | `tglObjectives` (5) |
| `tgl/enumerate.ts` | P8 | `enumerateLayouts`, `EnumerateInput`/`TglCandidate` | `tglEnumerate` (7) |
| `tgl/emitGeometry.ts` | P9 | `emitGeometry`, `EmittedLayout` | `tglEmitGeometry` (5) |
| `tgl/runDeterministicLayout.ts` | wire | `generateDeterministicLayouts` (ShellAnalysis → `ScoredLayoutOption[]`) | `tglRunDeterministicLayout` (5) |

**Total: 72 tests, all green.** P10 (IFC5/RDF export, §5) is the only deferred
phase — post‑MVP; the `LayoutGraph` it consumes is already shipped.

### §10.1 — Dataflow (as built)

```
ShellAnalysis.perimeter (m, {x,z})  +  ApartmentProgram  +  ApartmentConstraints  +  ScoringWeights
        │  generateDeterministicLayouts()  (tgl/runDeterministicLayout.ts)
        ▼
   enumerateLayouts()  ── for each of 8 fixed strategies (axis × order × mirror) ──┐
        │   P1 decomposeToRects → P2 buildBubbleGraph → P3b subdivide (squarify)   │
        │   → P4 buildWallsAndDoors → P5 buildSemanticGraph (LayoutGraph + GUIDs)  │
        │   → P6 computeSpaceSyntax → P7 computeObjectives (5-axis)                │
        ▼                                                                          │
   Pareto non-domination rank + weighted sort ◄───────────────────────────────────┘
        │  top `count` TglCandidate[]  (each carries the persistent LayoutGraph)
        ▼
   emitGeometry(graph)  → LayoutOption (mm {x,y}) + aligned wall/door/space GUIDs   (P9)
        │  scoreLayout(option, weights)  → LayoutScore
        ▼
   ScoredLayoutOption[]  → §11 approval modal → buildLayoutCommands (pre-minted ids)
        → BatchCoordinator.runBatch( wall.batch.create + wall.createOpening + door.batch.create )
```

### §10.2 — Integration seam

`generate.ts` (the AI orchestrator) calls `generateDeterministicLayouts` inside the
opt‑in `proceduralFallback` block: when the relay throws or returns no valid option
(no API key / 401 / 500 / all‑invalid) **and** the flag is set, D‑TGL produces the
options and the result is `{ status:'ok', reason:'AI unavailable — deterministic
D‑TGL offline layout' }`. The legacy strip‑slicer (`generateProceduralLayout`)
remains only as a last‑resort net if D‑TGL itself returns `[]` (degenerate shell).

The editor binding (`apps/editor/src/engine/ensureApartmentLayoutRegistered.ts`)
sets `proceduralFallback: true`, so the live feature always delivers a real layout.
With a configured AI upstream the AI path runs first and D‑TGL never fires; the two
paths produce the **same `ScoredLayoutOption` shape**, so the modal, executor and
build pipeline are identical for both.

---

## §11 — Architectural soundness (layer & principle compliance)

- **Layering (L0–L7.5).** The whole engine is in `@pryzm/ai-host` (**L2**). It imports
  only sibling TGL types and L0/L2 (`../types.js`, `score.js`, `shellAnalysis.js`).
  It imports **nothing** from L3+ (no stores, renderer, plugins, editor) — the layer
  rule holds. The editor (L5) injects shell/level access and consumes the result.
- **P1 (single composition root).** No runtime wiring; the engine is pure functions
  reached through the already‑composed AiPlane. No `composeRuntime` bypass.
- **P2 (single THREE owner).** Zero THREE imports — the engine is plain math over
  `{x,z}` numbers; geometry is emitted as plain `LayoutOption` data.
- **P3 (single rAF).** No timers/rAF — fully synchronous, < 2 s (≈130 ms for 8
  strategies × 12 rooms).
- **P4 (no `window as any`).** None — Node‑pure; every test runs without a DOM.
- **P5 (schemas pure).** The engine consumes/produces plain types; ids come from
  `@pryzm/schemas` `createId` at the wiring layer, not inside the pure core.
- **P6 (commands are the only mutation path).** The engine mutates nothing; it emits
  a `LayoutOption` that `buildLayoutCommands` turns into bus commands
  (`wall.batch.create` / `wall.createOpening` / `door.batch.create`) dispatched in
  one `runBatch` (one undo unit).
- **P8 (explicit spans).** Observability spans live at the AiPlane boundary (C09
  §2.4), not inside these pure factories — per the established #51 doctrine.
- **C15 (hosted opening cascade).** Modelled exactly in the graph
  (`Door → FILLS → Opening → HOSTED_BY → Wall`) and preserved through emission
  (door `elementId` = the deterministic door GUID), so undo removes door + opening
  together.
- **Determinism (§6).** No `Math.random` / `Date.now` / `crypto.randomUUID`
  anywhere in `tgl/`; GUIDs are FNV‑1a hashes; every array output is sorted by a
  stable key. The global determinism test (`enumerate` deep‑equal on rerun, incl.
  GUIDs) passes.

### §11.1 — Known limitations (tracked)

1. **Adjacency‑awareness.** P3b squarifies by area; it does not yet *guarantee* that
   every `via:'door'` bubble edge lands on two adjacent rooms, so a door edge whose
   rooms aren't adjacent in a given tiling is skipped (P4 is best‑effort). The 8‑way
   enumeration mitigates this (the ranked winner tends to realise more adjacencies);
   a future P3c slicing‑tree placement keyed by the bubble graph would make it exact.
2. **Rectilinear shells.** Slanted shell edges are stair‑step approximated (P1);
   exact for rectangles / L / T / U.
3. **Windows.** P4 emits doors only; window placement (and the `Window` node) is
   modelled in the graph schema but not yet generated — daylight is scored from
   façade adjacency as a proxy. P10/next.
