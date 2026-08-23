# ADR-0364 — One graph, six projections; and one WebGL port, not a second renderer

- **Status:** Accepted
- **Date:** 2026-08-23
- **Lane:** GRAPH48
- **Supersedes:** nothing. **Extends** ADR-0343 (the Analysis widget contract), ADR-0358 (a facet
  is a question), ADR-0058 (the UBG as the relational substrate), ADR-0320 (relationship
  vocabulary scoped by consumers).
- **Contracts:** **C71 §2.2/§2.3** (PARKED is not a gap) · **C71 §4.1/§4.2/§4.4** (the three graph
  stores stay separate; the UBG's vocabulary is the canonical QUERY vocabulary; `[]` may only mean
  "zero results") · **C78 §4** (relationship direction is a fact) · C27 §4 (SelectionBus) ·
  C66 §1.1 (no capacity claim without a bench) · C100 §2.1/§5 (never substitute on failure)
- **Issue log:** L-8400 … L-8462
- **SPEC:** `docs/03-execution/specs/SPEC-ANALYSIS-RELATIONSHIP-GRAPH-3D.md`
- **Implements:** `packages/building-graph/src/hierarchy.ts`,
  `packages/building-graph/src/discipline.ts`, `apps/editor/src/ui/analysis/forceLayoutND.ts`,
  `apps/editor/src/ui/analysis/GraphViewport.ts`,
  `apps/editor/src/ui/analysis/graphViewState.ts`,
  `apps/editor/src/ui/element-preview/GraphPreviewSubject.ts`, and the graph path added to
  `apps/editor/src/ui/element-preview/ElementPreviewRenderer.ts`

---

## 1. Context

> *"I want to improve 200 % the graph section under Analytics… Spatial-based 3-D graph where the
> user can navigate and select an element — and it should highlight in PRYZM 3-D. Element-based ·
> System-based · Room-based · Topology-based relationships between elements. The user can also
> select an element in the PRYZM view and the graph will display all element topology
> relationships."*

The request names **six views**, a **3-D viewport**, and **two directions of selection**. Each of
the three invites an implementation that would have been a second copy of something this
repository already has exactly one of. This ADR records the three refusals and what was built
instead.

**What the Phase-1 audit found first** (full table in the SPEC, one command per row): of twenty
requested capabilities, **twelve already shipped** and are reused by direct import — the graph read
model, the shared node-link renderer, the Barnes-Hut layout, the measured node cap, the facet
cross-filter, the focus/dim controller, the UBG and its ten edge families, the per-family reality
verdicts, and one of the two selection directions.

---

## 2. Decision A — a hierarchy view is an EDGE-FAMILY FILTER, not a graph

**Six views are six projections of one graph.**

The tempting implementation is six builders — one that walks the room graph, one that walks
topology, one that walks the semantic graph. It is forbidden by the contract and it is wrong on
the merits:

- **C71 §4.1 — MUST NOT merge the three graph stores.** SemanticGraph, RoomGraphService and the
  UBG are three stores with three jobs.
- **C71 §4.2 — the UBG's vocabulary IS the canonical QUERY vocabulary,** and the other stores map
  onto it.

So there is exactly one projection — the UBG, built by five adapters — and a view selects a
**subset of its ten declared edge families**:

| View | Families |
|---|---|
| Element-based | `hostedIn`, `dependsOn` |
| Spatial-based | `bounds`, `adjacentTo` |
| System-based | `servesZone` |
| Room-based | `connectsTo`, `circulatesVia` |
| Topology-based | `bounds`, `adjacentTo`, `hostedIn`, `connectsTo` |
| Mixed | all ten, enumerated by hand |

**⛔ `mixed` enumerates its ten rather than spreading `UBG_EDGE_TYPES` at runtime.** A future
eleventh family must be added by a person who has decided it belongs to "mixed", not swept in by a
spread that nobody re-read.

### 2.1 A view may be EMPTY, and an empty view states its own cause

Node selection is **edge-driven**: a view keeps a node only when an edge of its families touches
it. So every count on the card is exact for what is drawn, and an orphan is never drawn under a
heading that promised a relationship.

The consequence is that a view can produce nothing — and **one of them produces nothing on every
model and always will**. `emptySentence` is therefore a **required** field of a view definition,
not an optional one, and the test suite asserts each is present and substantive. The System view's
sentence names C71 §2.2 PARKED status, the absent zone model (no `zone` kind among the 29 declared,
no zone store, `SemanticGraph.ts:57` marking its own member `// (future)`), C71 §2.3 (*parked is
not a gap*) and C71 §2.5 (*a writer-first unparking is forbidden*) — and separates itself from the
large, real URBAN zoning subsystem, whose subject is a PARCEL and which references no element id.

**⛔ Filling that view would mean INVENTING a zone model, which is strictly worse than an honest
blank.** It stays empty on purpose.

### 2.2 `bounds` is drawn UNDIRECTED

The TopologyLayer test behind a `bounds` edge is `intersects`, a **symmetric** bounding-box
overlap. `A --bounds--> B` does **not** mean "A contains B"; the direction is an artefact of which
element the adapter iterated first. Drawing an arrowhead would assert containment nothing
measured — **C78 §4 failed at the render layer**. The projection carries an `undirected` set, the
card prints the caveat, and the JSON export marks `directed: false` per edge.

The second warning travels with it: **`bounds` emitted nothing in production until 2026-08-21**
(L-3253), because its id universe read `window.pryzmScene`, which nothing ever assigned.

---

## 3. Decision B — discipline is a table layered ON the IFC authority, never a fifth copy of it

The reference groups elements as Structural / Architecture / MEP / Equipment / Spatial with an IFC
type tree beneath. PRYZM-type → IFC-class already has **four homes** —
`core-app-model/src/CoreElement.ts`, `file-format/.../IfcModelBuilder.ts`,
`file-format/.../FragmentReader.ts`, and the normative table in **C25 §2** — and lane **IFCTREE47**
is reconciling them into `plugins/ifc-inspector/src/tree/ifc-class-authority.ts`.

**A fifth was not written.** `discipline.ts` maps element FAMILY → discipline and takes the IFC
class through an **injected `IfcClassResolver`** whose return shape is exactly IFCTREE47's. Their
files were untracked when this shipped (`git status --porcelain plugins/ifc-inspector` →
`?? src/tree/`) and `SendMessage` to that lane was undeliverable, so the resolver is `null` today
and every IFC cell renders a **named non-answer** — never a guess, and never a blank.

### 3.1 Two absence rows, kept apart

`unclassified` (a known family this taxonomy deliberately places nowhere — a grid is a datum) and
`unresolved` (family unknown) are **different answers** and are never merged; merging them would
hide a real gap inside a deliberate one. Both render in the named neutral, never in the
categorical rotation.

**The generic UBG kind `'element'` resolves to `unresolved` on purpose.** Three of the five
adapters (`semanticAdapter`, `dependencyAdapter`, `constraintAdapter`) stamp it on every endpoint
they materialise; folding that into a named bucket would make every bucket unfalsifiable. The card
prints the unresolved count and states that every category figure is a floor while it is non-zero.

### 3.2 The stated limit: discipline is per FAMILY

A load-bearing wall is structural; a partition is not. **PRYZM does not author that distinction.**
Measured 2026-08-23: `Wall.ts` declares no `loadBearing` field, and `ai-host/src/RuleEngine.ts:617`
filters walls on `loadBearing === undefined` — it expects the absence. `BeamData.loadBearing` is
real and required; `SlabSystemTypeStore`'s is optional and its own comment calls it *"metadata,
with nothing enforcing it"*.

So the card says so, in as many words: *a family tally, never a structural analysis*. Deriving a
per-element split from geometry would be a fabricated measurement.

---

## 4. Decision C — the 3-D viewport reuses the ONE WebGL port

**⛔ REJECTED: a `WebGLRenderer` for the Analysis card.** Browsers cap live WebGL contexts
(commonly 8–16) and silently kill the **oldest** when a new one is created. In this application
the oldest is **the main viewport**. The standing constraint is *"don't compromise graphics"*, and
the founder is on WebGL with nothing beneath it. `ElementPreviewRenderer` was written to prevent
exactly this; a graph renderer would have been the same defect wearing a graph's costume.

**ACCEPTED: the graph is a second SUBJECT for one rig.** An `InstancedMesh` of spheres — one draw
call for 320 nodes, with colour per INSTANCE rather than per material, so instancing is not
defeated the way it was in the main viewport — plus one vertex-coloured `LineSegments`.

- **P2** — THREE is reached only via `@pryzm/renderer-three/three`, the path
  `check-three-imports.ts` names as compliant in its own header. **No THREE type crosses into
  `ui/analysis/` in either direction.**
- **P3** — no rAF, no ticker, no loop. A frame is drawn only when the orbit, the subject or the
  size changes, each coalesced through `getFrameScheduler().scheduleOnce`.

### 4.1 Picking is 2-D, and that is a design choice with three payoffs

The renderer returns each node's **projected screen position** after a draw. Hit-testing is then
"which projected disc contains the cursor, frontmost wins" — plain arithmetic. Consequently: no
THREE type leaks; labels are drawn into the 2-D canvas at full device resolution and stay crisp
where an in-scene sprite would be resampled by the blit; and the pick **cannot disagree with what
was drawn**, because it is computed from the very projection that drew it.

Nodes behind the camera are excluded rather than clamped — a mirrored projection would put a label
naming the wrong element in the wrong place.

### 4.2 One Barnes-Hut, made dimension-generic

A 3-D layout needs an octree where the 2-D one used a quadtree. Rather than a second tree, the
existing cell became `2^D`-ary with the quadrant computed over `D` axes, and `forceLayout` (2-D)
and `forceLayout3D` both call it.

**The 2-D output is unchanged, and that is measured.** `nodeLinkSvg.ts` carried a written promise
of byte-identical output. The previous implementation was run over four graph sizes straddling the
exact/approximate switch (**12 · 59 · 60 · 140**) and captured to a fixture *before the refactor
existed*; `graphLayout3d.spec.ts` compares every coordinate with `toBe`, not `toBeCloseTo`. The
arithmetic is preserved expression for expression — axis-ordered squared distance, `size[0]` as
the opening denominator, a branched repulsion constant instead of `Math.pow(area, 1)`.

---

## 5. Decision D — the inverse selection direction, and what it cost

The audit established that only ONE half of the founder's bidirectional request existed:

- **graph → 3-D: WORKED.** `widgetRenderers.ts` dispatches on `selectionBus`;
  `InspectModeCoordinator` subscribes; `DiagnosticMaterialManager.setAnalysisSelection` paints.
  (This wire was itself dead until L-6600 replaced a subscription to an event with zero emitters.)
- **⛔ 3-D → graph: DID NOT EXIST.** `relationship-graph` was `refresh: 'manual'`, and
  `_renderSelectionWidgets()` skips every widget that is not `'on-selection'`.

It is `'on-selection'` now. Two things had to be true first:

1. **A selection must re-solve nothing.** The layout cache is keyed on the node set, so a
   selection change reuses the existing positions. Without it, ADR-0343 §D.3 would be breached —
   a dashboard would be the reason a frame is dropped.
2. **⭐ And the picture must not move.** This is the stronger argument. If the layout rearranged
   every time the reader picked a node, they could never build a mental map of their own
   building — the thing they just clicked would be somewhere new. The same reasoning puts the
   ORBIT outside the widget: the card is rebuilt whole on every selection, and a widget-owned
   orbit would snap the camera back to the default on every click.

The focus itself is `focusNeighbourhood` — a BFS out to a **stated, clamped 1..4 hops**, traversed
**undirected even where the edge is directed**, because a door `hostedIn` a wall points *at* the
wall and following out-edges only would report the adapter's iteration order rather than the
building. It returns a **set to emphasise**, never a smaller graph: dormant, not gone, so every
count above stays true.

---

## 6. Consequences

**Good**

- One graph, one vocabulary, one layout, one WebGL context, one colour scale, one focus mechanism,
  one selection bus. Nothing on this card is a second copy of anything.
- Both directions of the founder's request work, and each states its own operands.
- Every view that can be empty says why it is empty in its own terms.
- The IFC seam is one import away from IFCTREE47's authority.

**Costs, accepted knowingly**

- **The 320-node cap survives.** A faster layout raises the number at which the tool stops
  drawing; it does not abolish it. The truncation notice remains, and every count is marked `≥`.
- **The four rival node-link implementations are NOT collapsed** (5,911 lines across
  `BuildingGraphOverlay`, the Living Graph and `RoomGraphPanel`). Migrating three live overlays was
  not this lane's remit and doing it blind is the larger risk — the same judgement L-3257 recorded.
  This lane's commitment is narrower and enforceable: **it adds no fifth.**
- **PNG export is 3-D only.** The 2-D card is SVG and would need a rasteriser. The button says so
  rather than handing the reader an empty image.
- **Alternating between the showroom and the graph reallocates the shared buffer**, because the
  graph is drawn at the card's aspect rather than letterboxed into a square. Stated rather than
  hidden; the alternative is a second context.

**Open**

- `servesZone` stays empty until an ADR names its first CONSUMER (C71 §2.5). This ADR does not
  name one and must not be read as unparking it.
- The IFC discipline column is unresolved until IFCTREE47's files are tracked.
- `BeamStore.ts:408` reads `wall.loadBearing` against a schema that never declares it — found
  while measuring the discipline limit, logged as **L-8412**, not fixed here.
