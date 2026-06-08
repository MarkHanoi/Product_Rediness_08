# Internal-Layout Generation Algorithm — D-TGL Deterministic Engine + House Pipeline

> **Status:** living reference. Engineering-grade walkthrough of how PRYZM turns a drawn
> parcel boundary + a typology brief into placed BIM elements (walls, doors, windows,
> stairs, floors, ceilings, furniture, lighting).
>
> **Read-only doc.** Every claim below is grounded in source. File references use
> `path` and `path:function`/`path:NNN` forms. Where a behaviour was recently changed or
> reverted, that is called out honestly with the section tag (e.g. `§WINDOW-CORNER-SETBACK`).

---

## 0. One-paragraph mental model

The engine is **NOT** a search/optimiser with randomness. It is a *fixed enumeration*:
for a given shell + program it builds **exactly 8 candidate layouts** (a deterministic
strategy set), runs each through a pure `P1→P9` pipeline, ranks them by **exact Pareto
dominance** then a **weighted sum** of 20 objective axes, and returns the best `N`.
Same input ⇒ byte-identical output, every run (no `Math.random`, no time budget, no
population evolution). "House" is the same single-plate engine wrapped in a storey loop
that adds a stair core, per-storey level stamping, slab voids and a roof. The editor
seam gathers the payload from live stores, the executor commits the chosen option as
one undoable batch, and a post-gen chain fills floors/ceilings/furniture/lighting.

---

## Files Index

### Core engine — `packages/ai-host/src/workflows/apartmentLayout/`

| File | Role |
|---|---|
| `tgl/runDeterministicLayout.ts` | **Engine entry.** `generateDeterministicLayouts()` — principal-axis rotation, threads solar/keep-out/tuning, calls `enumerateLayouts`, projects each candidate to a scored `LayoutOption`. |
| `tgl/enumerate.ts` | **P8 — strategy enumeration + ranking.** The 8-strategy set, per-strategy `buildCandidate` (runs P1→P7), Pareto dominance, weighted sum, the 5-tier legality/shape/topology/circulation gate. |
| `tgl/rectDecomposition.ts` | **P1.** Shell polygon → axis-aligned rects (vertical slab sweep). `§RECTIFY-QUAD` (convex-quad → bbox), `principalAxisAngle`/`rotatePt`, `subtractRectsFromRects` (stair keep-out carve). |
| `tgl/bubbleGraph.ts` | **P2.** Program → rooms + target areas (`§AREA-FRACTIONS`, `roomAreasByName`/`roomTypesByName`) + adjacency edges (the "bubble diagram"). `scaleProgramToShell`. |
| `tgl/squarify.ts` | **P3a.** Treemap squarify — fills a rect with a room set ∝ area at good aspect. |
| `tgl/subdivide.ts` | **P3b.** Rooms → footprints. `§SINGLE-RECT-CARVE` corridor spine, ensuite-from-master carve, `§STAIR-OBSTACLE-CARVE`, `§FEASIBILITY-ALLOC` (rebalance-don't-drop), `snapAxisLines`. |
| `tgl/wallsAndDoors.ts` | **P4.** Footprints → walls + doors. Open-plan zone suppression, the door reconciliation passes (`§SEALED-ROOMS`, `§CIRCULATION-REROUTE`), `DOOR_WIDTH_BY_KIND`, `§DOOR-MINIMUMS`, `§EXTEND-TO-PERIMETER`, `§JUNCTION-REPAIR`. |
| `tgl/semanticGraph.ts` | **P5.** Placements + walls + openings → persistent `LayoutGraph` (Spaces/Walls/Openings/Doors/Windows + typed edges + deterministic GUIDs). |
| `tgl/edgeTypes.ts` | `classifyEdge` — semantic EdgeType (SOCIAL_FLOW / INTIMATE_ACCESS / BUFFER / …) per bubble edge. |
| `tgl/spaceSyntax.ts` | **P6.** Space-syntax depth metrics from the entry (drives the `circulation`/`hierarchy` axes). |
| `tgl/objectives.ts` | **P7.** The 20-axis `ObjectiveVector` + `computeObjectives`. |
| `tgl/envDrivers.ts` | E.1 priority bands + E.2 solar / E.3 acoustic / E.4 ventilation objective scorers. |
| `tgl/emitGeometry.ts` | **P9.** `LayoutGraph` → `LayoutOption` (mm), incl. the per-room window emission call. |
| `rules/programRules.ts` | **The normative room DB.** `ROOM_RULES`, `doorAllowedBetween`, `maxDoorsFor`, `isOpenPlanEligible`, `preferenceBetween`, `MIN_DOOR_WIDTH_BY_TYPE`/`§DOOR-MINIMUMS`. |
| `dimensions/*` | Dimensional validators: `validateRoomShape`, `validateRoomFit`, `validateFrontage`, `validateApartmentEnvelope`, kitchen-triangle, corridor-width, daylight, hierarchy. |
| `topology/*` | Topology validators: mandatory/forbidden adjacency, wet-cluster, acoustic-zoning, circulation sequence/connectivity. |
| `windowEmission/emitWindows.ts` | Per-room window placement: multi-window distribution, `§WINDOW-CORNER-SETBACK`, door/junction avoidance, climate sizing. |
| `windowEmission/shellWallMatch.ts` | Maps engine windows onto pre-existing shell walls; `cornerSetbackForWall`, de-overlap, full-span-or-drop guards. |
| `windowEmission/solarOrientation.ts` | `equatorFacingDir`, `solarLengthMultiplier`, `climateGlazingFactor` — the sun bias. |
| `executePlan.ts` | `buildLayoutPlan`/`buildLayoutCommands` — `LayoutOption` → dispatchable `wall.batch.create` + `wall.createOpening` + `door`/`window.batch.create`. `§COLLINEAR-MERGE`. |
| `resolvers/defaultElementTypes.ts` | Per-room default door/window finish (`dt-*`/`wt-*`). |
| `generate.ts` / `workflow.ts` / `score.ts` | Generate orchestrator + D-TGL/strip-slicer fallback seam + `scoreLayout`/`ScoringWeights`. |
| `environment/facadeValueField.ts` / `daylightDepthField.ts` | Per-edge façade value + per-point daylight depth fields (feed `facadeAlignment`/`daylight`). |

### House orchestration — `packages/ai-host/src/workflows/houseLayout/`

| File | Role |
|---|---|
| `houseOrchestrator.ts` | **House entry.** `generateHouseLayout` / `generateHouseLayoutOptions` — storey loop over the apartment engine, stair core, `bestStoreyOptionIndex` (variant-0 invariant), assembly of stairs/voids/roof. |
| `storeyAllocation.ts` | Split the brief across storeys (`allocateProgramToStoreys`). |
| `houseProgramFloor.ts` | `enrichStoreyProgramToPlate` — raise a sparse storey program to a full house floor. |
| `houseEnvelope.ts` | `validateHouseStorey` / `houseStoreyBand` — house-aware gross-area gate (injected into the engine). |
| `stairCore.ts` | `reserveStairCoreShaped` — pick stair rect + I/L/U shape + flight split. |
| `stairPosition.ts` | `chooseStairCorePosition` — worst-aspect/back-corner placement scoring. |
| `houseVertical.ts` | Roof base elevation/offset; per-storey continuity. |
| `weldPartitionsToShell.ts` | Snap generated partitions to the shell perimeter. |

### Editor seam — `apps/editor/src/ui/`

| File | Role |
|---|---|
| `apartment-layout/gatherLayoutPayload.ts` | Read live walls/facades/openings + brief + overrides + site latitude → generate payload. |
| `apartment-layout/apartmentLayoutTrigger.ts` | Single shared trigger (AI panel + `window.pryzmGenerateApartmentLayout()`). |
| `apartment-layout/ApartmentLayoutExecutor.ts` | Commits the chosen option as one undoable batch (walls + openings). |
| `house-layout/HouseLayoutExecutor.ts` | Builds every storey + stairs + voids + roof. |
| `house-layout/runHousePostGenChain.ts` | Fans floor→ceiling→furnish→light across every storey. |
| `site/siteDispatch.ts` | `getCurrentSiteOrigin()` — the LTP-ENU origin lat/lon (C19), source of `siteLatitudeDeg`. |

---

## 1. PIPELINE OVERVIEW — brief/GIS → placed BIM elements

### 1.1 End-to-end flow

```
USER ──▶ draws parcel boundary on GIS (Cesium/Forma) ──▶ shell walls in wall store
      ──▶ typology brief (sliders / RAC) ──▶ ApartmentProgram

EDITOR SEAM (L5)
  apartmentLayoutTrigger.triggerApartmentLayout()
    └─ gatherLayoutPayload(levelId)            reads stores → ApartmentGenerateLayoutPayload
       (walls + isExterior + openings + program + constraints + siteLatitudeDeg + tuning)
    └─ requestApartmentLayout(rt, payload)     → runtime.ai.layoutOptions plane

ENGINE (L2, pure)
  generate.ts orchestrator → generateDeterministicLayouts(shell, program, …)   [runDeterministicLayout.ts]
    └─ principal-axis rotation of the shell        (§PRINCIPAL-AXIS)
    └─ enumerateLayouts(...)                        [enumerate.ts]
         for each of 8 STRATEGIES:
           P1 decomposeToRects          shell → rects          [rectDecomposition.ts]
           (carve stair keep-out)                              [subtractRectsFromRects]
           P2 buildBubbleGraph          program → rooms+edges   [bubbleGraph.ts]
           P3 subdivideWithReport       rooms → footprints      [subdivide.ts → squarify.ts]
           (window/door snap)                                   [windowAvoidance.ts]
           D3.1/D2.2 shape+fit gate                             [dimensions/*]
           P4 buildWallsAndDoors        footprints → walls+doors[wallsAndDoors.ts]
           P5 buildSemanticGraph        → LayoutGraph           [semanticGraph.ts]
           T3.3 topology gate                                   [topology/*]
           P6 computeSpaceSyntax        depth metrics           [spaceSyntax.ts]
           P7 computeObjectives         20-axis vector          [objectives.ts + envDrivers.ts]
         GATE  (5-tier: clean∧legal∧routed → … → anything)
         RANK  Pareto dominance, then weighted sum, stable tie-break
    └─ for each ranked candidate:
         P9 emitGeometry               LayoutGraph → LayoutOption (mm)  [emitGeometry.ts]
            (incl. per-room window emission                   [emitWindows.ts])
         rotate option back to world   (inverse §PRINCIPAL-AXIS)
         scoreLayout(...)              attach LayoutScore      [score.ts]

EDITOR EXECUTOR (L5)
  user picks option ──▶ buildLayoutCommands(option)            [executePlan.ts]
    wall.batch.create  +  wall.createOpening (door+window)  +  door/window.batch.create
    + roomBoundingLine.create (open-plan splitters)
  ──▶ one BatchCoordinator.runBatch (single undo) ──▶ room redetect ──▶ post-gen chain
```

### 1.2 The deterministic enumerate → rank → build shape

The single bridge between the editor and the pure engine is
`generateDeterministicLayouts(...)` in
`tgl/runDeterministicLayout.ts:86`. It:

1. Computes the shell's dominant-edge angle and (when off-axis) rotates the whole problem
   into an axis-aligned frame (`§PRINCIPAL-AXIS`, §3 below).
2. Forward-maps the window/door avoidance spans, the stair keep-out rects, and the solar
   sun direction into that frame.
3. Calls `enumerateLayouts(...)` (`tgl/enumerate.ts:524`), which returns up to `count`
   ranked `TglCandidate`s.
4. For each candidate, projects the graph to a `LayoutOption` via
   `emitGeometry` (`runDeterministicLayout.ts:206`), rotates the emitted geometry back to
   world (`rotateOptionBack`, line 52), scores it with `scoreLayout`, and pins the 20
   objective axes onto `score.breakdown` for the modal (lines 235–256).

**Entry points:**
- AI panel leaf + console: `triggerApartmentLayout()`
  (`apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts:33`).
- House: `generateHouseLayout` / `generateHouseLayoutOptions`
  (`houseLayout/houseOrchestrator.ts:180` / `:237`).
- The `generate.ts` orchestrator selects D-TGL and falls back to the bounding-box
  strip-slicer (`proceduralLayout.ts`) only when D-TGL returns `[]`.

---

## 2. THE STRATEGY ENUMERATION (no RNG) — `enumerate.ts`

### 2.1 The fixed strategy set (8 candidates)

`enumerate.ts:144-152` builds the strategy set once, in fixed order:

```ts
interface Strategy { axis: boolean; order: 'fwd'|'rev'; mirror: boolean }
for (axis  of [false, true])
  for (order of ['fwd','rev'])
    for (mirror of [false, true]) out.push({ axis, order, mirror });   // 8, fixed order
```

This is the **NSGA-II replacement** (block comment at the top of the file): instead of
evolving a random population, the engine enumerates a finite, deterministic strategy set.
The three knobs change *how* the shell is tiled:

- **`axis`** — swap X↔Z before subdivision (`makeTransform`, `enumerate.ts:155`). Tiles
  the plan along the other axis.
- **`order`** — `'rev'` reverses the bubble-graph room list
  (`enumerate.ts:213`), so the squarifier hands rects to rooms in the opposite order,
  yielding a genuinely different placement.
- **`mirror`** — reflect across the bbox X-mid (`enumerate.ts:156`).

Every strategy transform is an **involution**, so the inverse is the reverse compose
(`enumerate.ts:154`): the tiling is done in the transformed frame and untransformed back,
but every emitted graph is in the canonical `{x,z}` frame.

### 2.2 Each strategy runs the full P1→P7 pipeline

`buildCandidate(input, shellArea, s)` (`enumerate.ts:166`) is the per-strategy pipeline:

1. `decomposeToRects(polyT)` → rects (P1); subtract the inflated stair keep-out
   (`§STAIR-KEEPOUT`, lines 187-202) — sets `stairCarved` when the carve fractures the
   plate.
2. `buildBubbleGraph(...)` (P2); `rev` reverses the room list.
3. `subdivideWithReport(rectsT, bubble, { stairCarved, corridorWidthM })` (P3).
4. Window/door partition snap (`snapRectsAwayFromWindows`, lines 245-260).
5. **Shape + fit gate** (D3.1/D2.2): `validateAllRoomShapes` + `validateRoomFit`
   → `shapeAdmissible` + soft `shapeQuality` (lines 281-304).
6. `buildWallsAndDoors(...)` (P4) → segments, openings, boundaries, `compromises`,
   `unroutedToCirculationRoomIds`.
7. `buildSemanticGraph(...)` (P5).
8. **Topology gate** (T3.3): mandatory/forbidden adjacency, wet-cluster, acoustic,
   sequence, frontage, corridor-connectivity → `topologyAdmissible` + soft
   `topologyQuality` (lines 327-377).
9. `computeSpaceSyntax` (P6) + `computeObjectives` (P7) → the 20-axis vector.

It returns a `TglCandidate` carrying `objectives`, `weighted`, `compromises`,
`connected`, `shapeAdmissible`, `topologyAdmissible`, `circulationRouted`,
`droppedRooms`, `boundaries` (`enumerate.ts:389`).

### 2.3 Pareto dominance + weighted-sum ranking

- **Dominance** (`dominates`, `enumerate.ts:495`): `a` dominates `b` iff `a ≥ b` on every
  axis (EPS-tolerant, rounded to 1e-6) and `>` on at least one.
- **Pareto ranks** (`assignParetoRanks`, line 506): repeatedly peel the non-dominated
  front (rank 0, then 1, …). No evolution — pure non-dominated sorting.
- **Weighted sum** (`weightedSum`, line 398): maps the 4 user weights onto the 20 axes
  (the rest carry fixed weights — `regularity 0.5`, `shapeQuality 0.6`,
  `topologyQuality 0.6`, etc.), applies the E.1 priority band multiplier
  (`priorityMultiplier`, lines 488), normalises, and sums. Used as the **secondary
  tie-break within a Pareto rank**.
- Final sort (`enumerate.ts:616`): `rank asc → weighted desc → strategy string` (stable).

### 2.4 `bestStoreyOptionIndex` / variant-0 invariant

In the house path (`houseOrchestrator.ts:127` `bestStoreyOptionIndex`): the engine ranks by
Pareto front first, so `options[0]` is the architecturally-best candidate, but its scalar
`score.overall` is **not** guaranteed maximal in the set (a Pareto-inferior alternative can
post a slightly higher `overall`). The whole-house modal sorts variants best-first by
aggregate `overall`, and the **A.21.D18 equality invariant** requires variant 0 to equal the
single best *and* sort first. Both hold iff variant 0 picks `argmax(overall)` per storey —
hence `bestStoreyOptionIndex` selects argmax-`overall`, tie-broken by engine order (lowest
index = best Pareto rank). `generateHouseLayout` and `generateHouseLayoutOptions`
enumerate with the **same** `DEFAULT_VARIANT_COUNT = 3` so option[0] is identical on both
paths (`houseOrchestrator.ts:201`, comment lines 188-200).

### 2.5 Why it is deterministic

- No `Math.random`, no population, no time budget. The 8 strategies are enumerated in a
  fixed order.
- The seed is *derived* from shell geometry + program (`makeSeed`,
  `runDeterministicLayout.ts:68`) — used only to make GUIDs deterministic, never to draw
  random numbers.
- All tie-breaks are stable (sorted by id/strategy string). Same input ⇒ byte-identical
  graphs **and** GUIDs.

---

## 3. SHELL → RECTANGLES — `rectDecomposition.ts`

### 3.1 Vertical slab sweep (`decomposeToRects`, `rectDecomposition.ts:147`)

The shell polygon (metres, plan `{x,z}`) is split into axis-aligned rectangles by a
vertical slab sweep: collect unique X coordinates, and for each adjacent X-band take the
even-odd crossings of the vertical line at the band midpoint to recover the inside `z`
bands → one rect per (band × inside-interval). `mergeHorizontally` (line 294) glues
vertically-seamed rects back into one. **Exact** for rectilinear polygons (rectangle / L /
T / U); a **stair-step approximation** for slanted edges (each slab takes the edge's `z` at
the slab midpoint).

### 3.2 `§RECTIFY-QUAD` — non-orthogonal plots (`rectifyConvexQuad`, line 116)

A skewed plot (parallelogram/trapezoid drawn off-axis) stair-steps into a big central rect
+ unusable slivers, so subdivide packs everything into the one big rect → the "one giant
93 m² merged room + slivers" defect. The fix: when the (already principal-axis-rotated)
shell is a **convex quadrilateral** (after `dropCollinear` simplification, `isConvex` true,
4 vertices) **and** fills ≥ `minFill = 0.5` of its bbox, rectify it to its axis-aligned
bounding rectangle before tiling. Then it tiles as one clean rect.

**Gating is what makes it safe:** an L/U/T shell is concave and/or has >4 vertices → never
rectified, so its notch-aware stair-step decomposition is preserved bit-identically.
Vertex-count + convexity (not fill-ratio) is the discriminator — an L can fill its bbox
*more* than a sheared quad. The outer shell walls remain the real drawn shape (emitted
separately and `§EXTEND-TO-PERIMETER`-extended); only the partition grid is rectified.

### 3.3 Principal-axis rotation for skewed plots

`principalAxisAngle(poly)` (`rectDecomposition.ts:211`) returns the residual rotation to
make the dominant edge axis-aligned, computed as the **length-weighted circular mean of
edge directions at 4× angle** (so the two orthogonal edge families of a rectilinear plot
collapse together). Range `(−π/4, π/4]`; a perfectly axis-aligned shell returns 0.

In `runDeterministicLayout.ts:122-149`: `angle = |rawAngle| ≥ PRINCIPAL_AXIS_MIN_RAD (0.01
rad ≈ 0.6°) ? rawAngle : 0`. When non-zero, the shell, window spans, door spans, keep-out
rects, and sun direction are all forward-mapped (`−angle` about the centroid), the entire
axis-aligned D-TGL pipeline runs in that rotated frame, and the emitted geometry is rotated
back (`rotateOptionBack`, `+angle`). **Rectilinear shells (angle ≈ 0) ⇒ no rotation ⇒
bit-identical output, no regression.**

### 3.4 Stair keep-out subtraction

For a multi-storey house the vertical stair core is a real spatial keep-out:
`subtractRectsFromRects` (`rectDecomposition.ts:279`, guillotine split, drops sub-min
slivers) carves the core rect out of the buildable rect set **before** subdivide, so no
room/partition tiles across the stair. In `enumerate.ts:187-202` the carve is **inflated by
`KEEPOUT_MARGIN_M = 0.05 m`** on every side (matches the subdivider's alignment-snap
epsilon, so a post-carve snap can never push a room back into the core). The apartment path
passes no keep-out ⇒ decomposition is bit-identical.

---

## 4. ROOM PROGRAM + WHAT DECIDES WHERE EACH ROOM GOES

### 4.1 `rules/programRules.ts` — the normative room DB

The single source of truth. `ROOM_RULES` (`programRules.ts:215`) is a
`Record<RoomType, RoomRule>` (TS exhaustiveness — a new room type fails to compile until
authored). Each rule carries:

- **Sizing:** `areaWeight` (proportional share — living 1.7, master 1.3, bedroom 1.0,
  kitchen 0.95, corridor 0.85, bathroom 0.45), `minAreaM2` + `minShortSideM` (UK Building
  Regs / HQI minima, each tagged with a `DB-NNN` constraint id), and the **`§AREA-FRACTIONS`**
  `minAreaFrac`/`maxAreaFrac` *size-scaled* clamps (living ≥15%, kitchen ≥7%, master ≤20%,
  bedroom ≤16%, corridor ≤10%, bathroom ≥5%).
- **Habitability:** `needsWindow`, `windowMandatory`, `frontage` (`required`/`preferred`/
  `none`), `acousticRole` (`source`/`receiver`/`neutral`).
- **Connectivity:** `accessFrom` (the **PERMISSION matrix** — a door A↔B is allowed iff
  `B ∈ accessFrom(A)` OR `A ∈ accessFrom(B)`, `doorAllowedBetween`, line 592), `maxDoors`
  (the **privacy door cap** — bedroom 1, master 2, bathroom 1, ensuite 1; `maxDoorsFor`),
  and `adjacencyPreference` (soft per-pair weight, `preferenceBetween`, line 610).
- **Program contents:** `requiredFurniture`/`optionalFurniture`/`requiredFixtures` +
  door-vector-aware `furnitureSpec` (consumed by D-FLE).

**Key predicates:**
- `isOpenPlanEligible(type)` (line 582) — **only `living`/`kitchen`/`dining`** may ever
  share a wall-less open threshold. This is the hard guarantee against the central-blob.
- `minDoorWidthBetween(a,b)` / `MIN_DOOR_WIDTH_BY_TYPE` (`§DOOR-MINIMUMS`, line 696) —
  habitable 0.80 m, entrance/hall 0.90 m, wet 0.70 m; a door serving both rooms takes the
  `max`.

The privacy matrix encodes the founder's hard rules directly, e.g. `hall.accessFrom =
['living','corridor']` (the front door lands in a clean lobby that opens *only* to the
social space and the corridor — never a bedroom/bathroom); `bathroom.accessFrom =
['corridor']` only (`§BATH-CORRIDOR-ONLY` — a bath-off-bedroom is an *ensuite*, a separate
type); `ensuite.accessFrom = ['master']` only.

### 4.2 `bubbleGraph.ts` — program → bubble graph + area allocation

`buildBubbleGraph` (`bubbleGraph.ts:124`):

1. **Auto-scale to shell** (`scaleProgramToShell`, line 93): ~130 m²/bedroom rule of thumb,
   capped at 5 beds; bathrooms = ⌊beds/2⌋ capped at 3; auto-ensuite at ≥3 beds. Never
   downscales (user counts are a floor). An explicit studio (0 bed/0 bath) stays a studio.
2. **Mint rooms in public-first order** (lines 160-178): hall → living → kitchen → dining →
   corridor → bedrooms/master → ensuite → bathrooms. The corridor exists only when there
   are private rooms.
3. **Per-instance overrides** (`roomTypesByName`, lines 193-211; `roomAreasByName`/
   `roomAreas`, lines 224-227) — A.26 editable-living-graph + ADR-0061; re-type a named
   room, or pin its area, then re-derive its weight/minima from the new rule.
4. **`§AREA-FRACTIONS` allocation** (lines 256-279): `target = clamp(weight-proportional
   share, [max(minAreaM2, minAreaFrac·A), maxAreaFrac·A])`. A small façade bonus
   (`facadeWeightBonus`, +20% max on windowMandatory rooms toward a high-value façade) and
   the A.25.3 `spaceGenerosity` slider modulate weights.
5. **Edges = the bubble diagram** (lines 282-321): `hall↔living` open; `hall↔corridor`
   door; `living↔kitchen` door (`§KITCHEN-DISTINCT` — kitchen is **always** an enclosed
   room with a door even when the open-plan toggle is on; the toggle now only controls
   whether *dining* merges with *living*); private rooms hang off the corridor (`spine`);
   `master↔ensuite` door; baths off the corridor.

### 4.3 `subdivide.ts` — squarify + corridor spine + stair carve

`subdivideWithReport` (`subdivide.ts:708`):

- **`§SINGLE-RECT-CARVE`** (single-rect shell + corridor + ≥1 private room):
  `trySingleRectCarve` (line 524) slices the shell into `[public | corridor strip | private]`
  along its longer axis (`tryCarveCorridor`, line 414 — strip width
  `CORRIDOR_STRIP_WIDTH_M = 1.2 m`, ≥2 m usable zones either side). The corridor runs the
  full length so every private room shares a wall with it. The ensuite is then carved from
  *inside* the master's squarified rect (`tryCarveEnsuiteFromMaster`, line 460), guaranteeing
  the only-permitted master↔ensuite shared wall exists.
- **`§STAIR-OBSTACLE-CARVE`** (lines 743-775): a stair keep-out fractures the plate into a
  frame/L; rather than packing each sub-rect independently (→ no corridor spine → merged
  blob), if one sub-rect holds ≥55% of the area, run the corridor carve on that dominant
  rect with the whole programme; run the generic multi-rect path too and keep whichever
  drops fewer rooms (`§STAIR-CARVE-NO-DROP`, ties → carve, to preserve the spine).
- **`squarify`** (`squarify.ts`) packs each rect's room set ∝ area at good aspect.
- **`allocationOrder`** (line 385): hoists **Living + Master** to the front so the
  squarifier gives them the best aspect (without it, Master ends up a thin leftover strip);
  within each privacy class the input order is preserved (so `rev` still varies secondaries).
- **`§FEASIBILITY-ALLOC`** (`placeInRectReported`, line 210): the engine **never silently
  drops** a requested room. It first tries proportional then min-first seedings
  (`tryFitAll`, line 317), runs a bounded rebalance loop that grows too-narrow rooms by
  stealing slack from over-allocated neighbours (`runRebalance`, line 233), and only when a
  rect *genuinely* can't hold every room at its minimum does it drop the **lowest-priority**
  room (`DROP_PRIORITY_RANK`, line 171 — living/kitchen/master/bathroom protected; ensuite/
  wc/utility go first) and record it in `droppedRooms`.
- **`snapAxisLines`** (line 662, `§L4-δ-1b`): post-pass that clusters room-rect edges within
  `ALIGNMENT_SNAP_EPS_M = 0.05 m` and snaps each to the cluster mean — layouts arrive
  pre-aligned.

### 4.4 What really drives a BEDROOM vs KITCHEN vs BATHROOM landing where it does

This is the founder's headline question. There is **no single placer** — placement emerges
from the interaction of four forces, all deterministic:

1. **Public-first streaming order + privacy classes.** Rooms are minted and allocated in
   `public → circulation → private → service` order (`bubbleGraph` mint order + `subdivide`
   `allocationOrder`). The corridor carve splits the plate into a public zone (near the
   entrance), the corridor strip, and a private zone. So **social rooms (living/kitchen/
   dining) land near the front/entry; bedrooms/baths land in the private zone behind the
   corridor.** Living + Master are *hoisted* to claim the two best-aspect cells.

2. **The permission matrix + adjacency preferences.** `accessFrom` decides which doors are
   *legal*; `adjacencyPreference` (kitchen↔dining 1.0, master↔ensuite 1.0, bedroom↔corridor
   1.0, kitchen↔corridor 0.3) feeds the `adjacency` objective so the ranker *prefers* a
   tiling where the kitchen is next to the dining and every bedroom is off the corridor.

3. **The wet cluster + privacy gradient.** `validateWetCluster`/`wetStackAlignment` reward
   wet rooms (kitchen/bath/ensuite/wc/utility) sharing a plumbing axis; the space-syntax
   `circulation`/`hierarchy` axes (`objectives.ts:401-448`) reward **public shallow, private
   deep** — private rooms at graph depth ≥3 from the entry, public ≤2 — so a strategy that
   buries the bedrooms scores higher than one that opens them straight off the lobby.

4. **Solar + acoustic objectives.** `solarOrientation` (E.2) biases daytime rooms
   (living/dining/kitchen) toward the equator face and buffer rooms (bath/wc/utility/garage)
   toward the cold face; `acousticZoning` (E.3) penalises a bedroom directly against a
   kitchen/wc and rewards a hall/corridor buffer between them.

Across the 8 strategies, these forces produce 8 genuinely-different tilings; the
Pareto+weighted rank picks the one that best satisfies all of them simultaneously.

---

## 5. ROOM SHAPE / PHYSIOGNOMY

### 5.1 Squarify aspect + min short side

`squarify` packs to a good aspect; the per-type **`minShortSideM`** floor
(`programRules.ts`, e.g. bedroom 2.6 m, master 2.75 m, kitchen-galley 1.8 m, corridor 1.0 m)
is enforced in subdivide (`floorFor`, `subdivide.ts:139`, clamped to an absolute 0.9 m floor).
A room whose squarified cell drops below its floor triggers the rebalance pass; only a
genuine over-program drops it.

### 5.2 The corridor strip rule — current state (honest)

The corridor is forced to its real architectural shape: a **1.2 m-wide strip running the
long axis** of a single-rect shell (`CORRIDOR_STRIP_WIDTH_M = 1.2 m`, `subdivide.ts:132`;
the A.25.3 accessibility slider can widen it to ≤2.0 m). The architect-mandated clear range
is 1.0–1.4 m (UK HQI recommends 1.2 m).

**Recently changed/reverted:** a tighter "narrow 0.9–1.2 m × length" corridor physiognomy
(tracked as D46) was **reverted** because it regressed the every-room-access guarantee — a
narrower corridor stopped spanning all private rooms, re-introducing the "bedroom only
reachable through another bedroom" defect. The current shipping value is **1.2 m**, and the
corridor `areaWeight` was bumped to 0.85 (`programRules.ts:338`) specifically so the corridor
physically spans every private room. The `corridor.maxAreaFrac = 0.10` caps it so the 0.85
weight doesn't eat 25% of a small flat.

### 5.3 Dimensional validators — `dimensions/`

Run pre-furnishing in `enumerate.ts` (P3.1):
- `validateRoomShape` (D2.1) — area max + width + aspect bounds; hard findings ⇒
  `shapeAdmissible: false`; soft findings ⇒ `shapeQuality`.
- `validateRoomFit` (D2.2) — the room must hold its required furniture program.
- `validateFrontage` (T2.5) — every `frontage:'required'` room (living/kitchen/master/
  bedroom) must touch the shell perimeter; `preferred` rooms (dining/study) get a soft
  penalty if fully interior.
- `validateApartmentEnvelope` (D3.5, `enumerate.ts:539`) — refuses absurd shell+program
  combos (200 m² 1-bed, 35 m² 3-bed) *before* building the 8 strategies. House path injects
  `validateHouseStorey` instead (judges by the full programme, not bedroom count).

### 5.4 Topology validators — `topology/`

Run post-walls in `enumerate.ts` (T3.3, lines 327-377):
mandatory adjacency (every declared adjacency has a door), forbidden adjacency (every door
is a permitted pair), wet-cluster (≤1 plumbing stack — soft), acoustic zoning (quiet↔noisy
buffering — soft), circulation sequence + corridor connectivity (every private room opens
onto circulation). Hard findings drop the candidate from the clean pool; soft findings
gradient `topologyQuality`.

---

## 6. WALLS + DOORS — `wallsAndDoors.ts` → `emitGeometry.ts` → `executePlan.ts`

### 6.1 Partition emission between cells (`buildWallsAndDoors`, `wallsAndDoors.ts:551`)

Every room-rect edge becomes a wall segment. The extraction sweeps **vertical faces (const
x) then horizontal faces (const z)**: along each wall line the rooms on the −/+ side of each
elementary sub-interval are resolved, equal runs merged (`runsForLine`, line 133), so each
shared boundary yields **exactly one** segment (`emit`, line 624). A wall touching the void
(only one room) is flagged exterior.

### 6.2 Open-plan wall suppression (private-rooms-always-walled guard)

Rooms transitively linked by `via:'open'` form a **zone** (union-find). A wall *within* a
zone is omitted and replaced by a virtual `BoundarySeg` (so room detection still separates
the spaces). **The hard guard** (`§OPEN-PLAN-ELIGIBLE`, lines 604-616): an `open` edge is
honoured only when **both** endpoints are `isOpenPlanEligible` (living/kitchen/dining).
Any `open` edge touching a sleeping/wet/circulation room is downgraded to a real wall — so
a bedroom/bathroom/corridor is **never** merged into a shared open space, whatever the graph
requests. This is what stops the "one 100 m² space labelled Living/Bedroom/Corridor/Bath"
central-blob defect.

### 6.3 Door reconciliation passes

The door pipeline (lines 646-1009) runs in order:

- **(1) bubble-requested doors** (line 777): place the intended adjacencies, but
  `§D5.d`-skip any forbidden pair (a forbidden bubble door is *never* a door).
- **(2a) permitted reconciliation, two passes** (lines 819-831): Kruskal over shared walls,
  circulation-touching first. Pass-i places only **primary-access** doors (private/service →
  circulation/public) so a bedroom's one door always lands on the corridor, not a bathroom.
  Pass-ii places any remaining permitted pair.
- **(2b) over-cap last resort** (line 838): relax the privacy cap to reconnect a sealed
  room, but **never** cross a forbidden pair; each such door counts as a `compromise`.
- **(2c) `§CIRCULATION-REROUTE`** (lines 844-929): "connected" ≠ "opens onto the spine".
  For every private/service room lacking a *direct* circulation door, add one on a permitted
  circulation-adjacent wall (ensuite-via-master excepted).
- **(2c-ii) multi-hop BFS** (lines 931-1009): if no direct circulation wall exists, BFS the
  shortest permitted door-chain to a circulation-served room and realise every door on it.
- **`§SEALED-ROOMS`** (line 1043) + `unroutedToCirculationRoomIds` (line 1018): diagnostics
  the enumerate gate ranks on.

### 6.4 Door widths + per-room finish

- **`DOOR_WIDTH_BY_KIND`** (line 541): SOCIAL_FLOW 1.10, CEREMONIAL_THRESHOLD 1.00, BUFFER
  0.90, SERVICE_ACCESS 0.90, INTIMATE_ACCESS 0.80 (master↔ensuite — privacy reading).
- **`§DOOR-MINIMUMS` clamp** (`addDoor`, lines 728-744): the emitted door is the preferred
  width clamped **up** to `minDoorWidthBetween(a,b)`; a wall too short to host the floor (+
  clearance each side) is rejected so reconciliation picks a longer wall — never a
  sub-minimum door.
- **`§DOOR-CLEAR-OFFSET`** (`findClearOffset`, line 671): slide the door off any
  perpendicular wall endpoint that would slice the cavity.
- **Per-room TYPE** (`resolvers/defaultElementTypes.ts`): `defaultDoorSystemTypeId(a,b)` →
  wet rooms `dt-white-primed`, kitchen `dt-glazed-timber`, else `dt-solid-timber`
  (the live build reads the finish off the *opening's* `systemTypeId`, `executePlan.ts:569`).

### 6.5 Geometry emission + command build

- `emitGeometry` (`emitGeometry.ts:57`) projects the `LayoutGraph` → `LayoutOption` (×1000
  mm, plan-y = world-z): Space→LayoutRoom, Wall→LayoutWall, Door (Door→FILLS→Opening→
  HOSTED_BY→Wall) → `{wallRef, offset, width}`, plus the per-room window emission call.
- `buildLayoutCommands` (`executePlan.ts:516`) → the dispatchable set: pre-mint wall ids
  (no read-back), one `wall.createOpening` per door/window (opening.elementId === element id,
  C15 cascade), `door.batch.create` + `window.batch.create`, and `roomBoundingLine.create`
  for open-plan splitters. `§COLLINEAR-MERGE` (`mergeCollinearWalls`, line 207) folds
  collinear segments at T/X junctions into single passthrough walls, remapping door offsets.
- `skipExteriorWalls` (`executePlan.ts:312`): the shell already exists in the model, so the
  build omits perimeter walls (building them again duplicates coincident walls and corrupts
  room detection); the preview still shows them.

---

## 7. WINDOWS + SUN/ORIENTATION

### 7.1 Per-room placement — `emitWindows.ts`

`emitWindowsForRoom(roomType, externalWalls, …)` (`emitWindows.ts:349`):
1. Filter external walls to those long enough for the room's `WINDOW_SPECS` width (fall back
   to the smaller variant).
2. **Rank by `length × solar-orientation multiplier`** (`score`, line 375) — so a sun-facing
   façade beats a marginally-longer wrong-facing one. The *minimum-length filter* uses raw
   length; only *ranking* uses the biased score.
3. Walk qualifying walls in score order; on each, emit `windowCountForWall` evenly-spaced
   windows (`evenOffsetsMm`, line 252; `WINDOW_STRIDE_GAP_MM = 1400` so a 5 m wall keeps ONE
   centred window for every room type — only genuinely long runs earn 2–3). Cap
   `MAX_WINDOWS_PER_WALL = 3`, `MAX_WINDOWS_PER_ROOM = 4`. So a corner room fronts two
   façades.
4. Keep windows clear of door footprints (`blockedSpansFor`) and interior-partition
   junctions (`blockedSpansForJunctions`, `§A.21.D33(d)`).

### 7.2 Which shell walls get windows + corner setback — `shellWallMatch.ts`

The engine emits windows hosted on the option's *external* walls; `resolveShellWindow`
(`shellWallMatch.ts:239`) maps each onto the matching **pre-existing shell wall** in the
editor store. `matchShellHost` (line 167) does an exact endpoint match first, then a tolerant
near-parallel/near-collinear/overlapping fallback (`§SHELL-MATCH-TOLERANT`, ANGLE_TOL 30°,
PERP_TOL 1 m) for non-orthogonal plots.

- **Corner setback** (`cornerSetbackForWall`, line 126, `§WINDOW-CORNER-SETBACK / A.21.D45`):
  a **real masonry pier** at each corner — wall-length-scaled `clamp(0.10·len, 0.5 m, 1.2 m)`,
  reduced on short walls but never below 0. No window (first/last/middle) may land within the
  setback of a corner. The de-overlap/distribution all key off this setback, not the bare
  0.1 m clearance. **Recently fixed (A.21.D45, 2026-06-08):** the founder's recurring
  "windows on the EDGE of the wall" — shell windows were landing at `offset = 0.1 m` (the
  cosmetic `END_CLEAR_M`); the D5.c multi-window rework had distributed the first window at
  that bare margin. The fix replaced the cosmetic 0.1 m with this real setback in *both*
  `emitWindows.ts` (`endSetbackMm`, line 91) and `shellWallMatch.ts`.
- **De-overlap** (`deOverlapShellWindows`, line 411): two rooms fronting the same shell wall
  can resolve to overlapping spans (each room de-overlaps only its own walls); the later one
  is dropped deliberately up front (`WINDOW_GAP_M = 0.1`) so `wall.createOpening` never
  silently rejects it.
- **Full-span-or-drop:** `§WINDOW-SHELL-CLAMP` (width clamped to fit the host wall),
  `§WINDOW-CORNER-FIT`/`§WINDOW-CORNER-SPAN`/`§WINDOW-IN-SHELL-FINAL` (the full span must sit
  inside `[setback, len−setback]`; if no clearance-respecting position exists, the window is
  **dropped**, never slammed to a corner).

### 7.3 How the sun drives the layout — `solarOrientation.ts` + `envDrivers.ts`

The sun has **three** distinct effects, all flowing from one input — `siteLatitudeDeg`:

1. **Window FACE (orientation bias).** `equatorFacingDir(latDeg)` (`solarOrientation.ts:40`):
   returns the equator-facing unit direction in the emit frame (x=East, +y=South per
   LTP-ENU; scene −z = North). Northern hemisphere → +y (South); Southern → −y (North); null
   within `EQUATORIAL_BAND_DEG = 10°`. `solarLengthMultiplier` (line 79) = `1 + weight·fit`
   where `fit = max(0, outwardNormal·sunDir)` — multiplies the candidate wall's length so the
   sun-facing façade is preferred (orientation *tunes*, a much longer wall can still win).
   `SolarBias.weight` defaults to **0.6** (the A.25.3 climate slider overrides it).
2. **Window SIZE (passive solar glazing).** `climateGlazingFactor(latDeg, fit)` (line 99):
   COLD climates (high |lat|) **enlarge** sun-facing glazing up to +25% for winter gain;
   HOT climates (low |lat|) **shrink** it down to −15% to limit overheating; temperate pivot
   ≈ 37.5°; clamped `[0.85, 1.25]`. Applied per window in `emitWindowsForRoom` (lines
   413-423).
3. **Room PLACEMENT (E.2 objective).** `solarOrientationScore` (`envDrivers.ts:221`):
   daytime rooms (living/dining/kitchen) want the equator side, buffer rooms (garage/utility/
   bath/wc/storage) the cold side; area-weighted compliance projected onto the equator axis.
   This is the `solarOrientation` axis in the Pareto vector (weighted via the user's
   `naturalLight` slider × 0.5, `enumerate.ts:464`).

**`siteLatitudeDeg` flow:** `getCurrentSiteOrigin()` (`siteDispatch.ts:65`, the committed
LTP-ENU/C19 origin) → `gatherLayoutPayload.ts:160-163` stamps `payload.siteLatitudeDeg`
(only when the origin is a real, non-(0,0) location) → threaded as `solar.latDeg` into
`generateDeterministicLayouts` → forward-mapped into the emit frame
(`runDeterministicLayout.ts:131-141`) and passed to both `emitGeometry` (window face/size)
and `enumerateLayouts` `solarLatDeg` (E.2 room placement). **Absent site data ⇒ pure-length
placement and a neutral (rank-invisible) solar axis ⇒ byte-identical to the no-site
baseline.**

---

## 8. STAIRS — `houseLayout/stairCore.ts` + `stairPosition.ts` + `houseVertical.ts`

### 8.1 Reservation + shape (`reserveStairCoreShaped`, `stairCore.ts:234`)

Default core 1.0 m × 3.0 m, clamped to `MAX_FRACTION = 0.45` of either plate dimension.
`chooseStairShape` (line 185) picks **I / L / U** from the available box: long-thin slot
(aspect ≥ 2.2) → I; squarer box → L (1.6×1.6 m, two flights round a corner) or U (2.0×2.8 m,
parallel flights + half-landing). `splitRisersForShape` (line 212) splits the floor-to-floor
riser count across flights.

### 8.2 Worst-aspect / back-corner placement (`stairPosition.ts`)

The founder's rule: *the stair takes the least space, hugs a wall, ideally the worst
(poor-aspect/north) façade; habitable rooms keep the best frontage.*
`chooseStairCorePosition` (`stairPosition.ts:363`) scores a small deterministic candidate set
(central / left / right / back) by:
`cost = circulationWaste + PERIMETER_PREFERENCE·(central?1:0) − ASPECT_WEIGHT·aspectScore`.

- `stairCoreWaste` (line 201) penalises a marooned-central core (circulation must wrap it on
  all four sides) and rewards a wall-abutting core (frees the centre for habitable rooms).
- `PERIMETER_PREFERENCE = 1.0` makes any feasible perimeter candidate beat central (a central
  stair *holes* the subdivision so rooms can't enclose — Defect A).
- `aspectScore` (line 87) derives from `aspectFromSunDir(latDeg)` — north default from the
  site latitude (Northern hemisphere sun toward +y/back, so the stair avoids it). A
  good-view-flagged façade is avoided the same way.
- `§STAIR-CORNER-ANCHOR` (line 294): side-wall candidates anchor to the **back corner**
  (flush to a side wall AND the rear wall), carving a clean L (one dominant rect + one corner
  sliver) so `§STAIR-OBSTACLE-CARVE` can run the corridor carve and every room encloses.
- `A.21.D34(a)` (line 122): on a skewed/rotated shell, perimeter candidates whose core rect
  pokes outside the real polygon are culled (`rectInsidePoly`).

The same rect is reserved on **every storey** (it's a pure function of the footprint →
vertical alignment §7).

### 8.3 Vertical continuity, void, roof — `houseOrchestrator.ts` + `houseVertical.ts`

`assembleHouse` (`houseOrchestrator.ts:504`):
- **(d)** one `StairCore` per adjacent storey pair, carrying the shape + per-flight risers/
  directions (`resolveFlightPlans`, line 47; flight 1 along the longer axis, L turns 90°, U
  reverses) — flight directions resolved in the layout frame then rotated back to world by
  `+principalAxisRad`.
- **(e)** one `SlabVoid` over the core on **every non-ground storey** (the stairwell hole).
- **(f)** a `RoofDescriptor` over the topmost storey; `roofBaseElevationM`/`roofBaseOffsetM`
  (`houseVertical.ts`) cap the roof base at the top floor's wall head
  (`§ROOF-CAP-ELEVATION`, `houseOrchestrator.ts:569`).

The editor's `HouseLayoutExecutor` + `houseStairVoids.ts` then build the actual stair, punch
the void, and place the roof (railings + the stair geometry come from the stair plugin).

---

## 9. GIS / SITE / CONTEXTUAL BUILDINGS

### 9.1 What grounds the layout in the GIS

1. **The drawn parcel boundary (C19).** The user plots the parcel on the Cesium/Forma GIS
   surface; the committed boundary becomes shell walls in the wall store (C19 §1.3 —
   `siteModelStore` + `ParcelBoundarySchema`, `apps/editor/src/ui/site/*`). The shell is the
   *literal* drawn plot, in LTP-ENU world coordinates.
2. **LTP-ENU origin.** `getCurrentSiteOrigin()` (`siteDispatch.ts:65`) returns the pinned
   origin lat/lon; `setLtpOriginIfSafe` (line 81) sets it when no boundary has shifted yet.
3. **`siteLatitudeDeg` → solar.** As in §7.3: the origin latitude drives window face, window
   size, the E.2 room-placement axis, and the stair's worst-aspect/north default.
4. **The front door (`§A.21.D29` entrance).** The hand-placed entrance door on the perimeter
   is honoured: its opening span is threaded through `gatherLayoutPayload` (door spans) so
   interior partitions never land inside the front-door opening
   (`runDeterministicLayout.ts:93`, `enumerate.ts` `doorSpansWorld`/`§DOOR-AVOIDANCE`).

### 9.2 Contextual buildings — what they do and DON'T do (honest)

The Forma/Cesium **context buildings** (OSM/Overpass massing, the pastel surroundings) are
**visual context + site framing only**. As of this writing they do **NOT** feed the internal
layout decisions — no neighbour-shadow, view-corridor, or overlooking term reads OSM geometry
into `computeObjectives` or the subdivider. The *site* influences the layout solely through
the **drawn parcel boundary** (the shell shape) and the **site latitude** (solar). View/
shadow from real neighbours is a queued capability (the cognition-stack Environmental-
Intelligence layer + the geospatial PG0 plan), not a live input to the generator today.

---

## 10. OBJECTIVES + RANKING

### 10.1 `objectives.ts` — the 20-axis `ObjectiveVector`

`computeObjectives` (`objectives.ts:317`) produces every axis raw (un-weighted) in `[0,1]`:

| Axis | Meaning (higher = better) |
|---|---|
| `efficiency` | 1 − circulation area / total area |
| `adjacency` | satisfied bubble edges / required, **weighted by `preferenceBetween`** + A.25.3 strictness exponent |
| `daylight` | habitable area fronting the façade / habitable area (depth-field weighted) |
| `circulation` | space-syntax gradient — public shallow, private deep (P6) |
| `regularity` | mean room aspect (→1) blended with axis alignment |
| `hierarchy` | discrete privacy-depth tier (private ≥3, public ≤2 from entry) |
| `shapeQuality` / `topologyQuality` | injected from the D2/T validators' soft findings |
| `edgeRealisation` | does each edge's `via` match its semantic `kind` (INTIMATE via door, not open) |
| `openingCadence` | rhythmic opening spacing per wall (1 − CV of gaps) |
| `proportionalElegance` | per-room aspect comfort plateau (square→φ ideal) |
| `spatialClimax` / `entrySightline` / `arrivalSequence` | Layer-2 arrival sequence (compression-release) |
| `wetStackAlignment` / `alignmentField` | plumbing-axis + plan-wide axis discipline |
| `facadeAlignment` | habitable rooms on high-value shell edges (`facadeValueField`) |
| `solarOrientation` / `acousticZoning` / `naturalVentilation` | E.2/E.3/E.4 env drivers (`envDrivers.ts`) |

`OBJECTIVE_AXES` (line 287) lists all 20 in fixed order. Many axes return a **neutral 1.0**
when their driver is absent (no site latitude, no acoustic tension, no window data) — a
constant across candidates is rank-invisible, so absent data leaves the order byte-identical.

### 10.2 Space syntax — `spaceSyntax.ts`

`computeSpaceSyntax(graph, entryGuid)` computes per-space graph depth from the entry, feeding
`circulation` and `hierarchy`. `entrySightlineRaycast.ts` adds a literal sight-line raycast
variant for `entrySightline` when every space carries a polygon.

### 10.3 Weights — `score.ts` + `ScoringWeights` + the A.25 sliders

- `weightedSum` (`enumerate.ts:398`) maps the 4 user weights — `corridorEfficiency`,
  `kitchenWorkflow`, `naturalLight`, `privacy` — onto the 20 axes (e.g. `daylight ←
  naturalLight`, `circulation ← privacy`, `adjacency ← kitchenWorkflow`), with the quality
  axes at fixed weights, then applies the **E.1 priority band** (`priorityMultiplier`,
  `envDrivers.ts:158`: site-fixed 1.30 > env-performance 1.10 > technical 1.00 >
  form-regulation 0.85) and normalises.
- `scoreLayout` (`score.ts`) produces the user-facing `LayoutScore` for the modal.
- **A.25 living-design sliders** re-weight these: `getActiveScoringWeights()` →
  `payload.scoringWeights` (the 4 weights), and `getActiveEngineTuning()` →
  `payload.tuning` (`EngineTuning`: `adjacencyStrictness`, `corridorWidthM`, `solarWeight`,
  `spaceGenerosity`) which re-run the *engine* not just the scorer
  (`gatherLayoutPayload.ts:147-170` → `runDeterministicLayout.ts:111`). Neutral midpoints ⇒
  omitted ⇒ byte-identical baseline (Pareto-equality invariant).

---

## 11. POST-GEN CHAIN — `runHousePostGenChain.ts`

After the executor commits walls/openings, `BatchCoordinator.runBatch` makes it one undo,
then room detection runs. The finish chain (`apps/editor/src/ui/house-layout/
runHousePostGenChain.ts`) fans out per storey, **in sequence** (so storeys don't race on the
shared active level + stores). For each storey level (`runChainForLevel`, line 99):

1. **Room detection + naming** (`nameDetectedRooms`): tag each room's occupancy. The
   orchestrator **awaits** `apartment.room-name-completed {levelId}` before furnishing
   (`§A.21.D25`, lines 116-126) — furnish/floor/ceiling all key off occupancy, so furnishing
   un-tagged rooms places nothing (this was the "only the top floor has furniture" bug).
2. **Floors + ceiling** (parallel, line 133): `triggerFloorLayout` (D-FLOOR; the D48
   finish-on-slab places realistic flooring per room) + `ceiling.layout-execute` (D-CE — one
   ceiling slab per ceilable room).
3. **Furniture** (line 143): `furnish.layout-execute` (D-FLE — auto-furnish per the
   `furnitureSpec` door-vector-aware program).
4. **Lighting** (line 149): `lighting.layout-execute` — the chain terminus.

The apartment single-level path fires this chain **once** on the active level (byte-identical
to the per-storey path with one storey). The house orchestrator suppresses the apartment
cascade handlers during fan-out (`beginHouseFanout`/`endHouseFanout`) so furnish/lighting
don't double-fire, and restores the originally-active level when done.

---

## 12. CONTRACTS / SPECS MAP

| Doc | Path | Governs |
|---|---|---|
| **SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE** | `docs/03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` | The P1→P9 pipeline + §2.2 deterministic Pareto enumeration. |
| **SPEC-APARTMENT-LAYOUT-GENERATOR** | `docs/03-execution/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md` | The apartment generator end-to-end (modal, execute, §11 trigger, §12 execute-plan). |
| **SPEC-ARCHITECTURAL-PROGRAM-RULES** | `docs/03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md` | The normative room DB (`programRules.ts`). |
| **SPEC-LAYOUT-CONSTRAINT-DATABASE** | `docs/03-execution/specs/SPEC-LAYOUT-CONSTRAINT-DATABASE.md` | The 248-constraint `DB-NNN` minima cited in `ROOM_RULES`. |
| **SPEC-ENVIRONMENTAL-DESIGN-DRIVERS** | `docs/03-execution/specs/SPEC-ENVIRONMENTAL-DESIGN-DRIVERS.md` | E.1 priority + E.2 solar + E.3 acoustic + E.4 ventilation (`envDrivers.ts`). |
| **SPEC-FURNITURE-LAYOUT-ENGINE** | `docs/03-execution/specs/SPEC-FURNITURE-LAYOUT-ENGINE.md` | D-FLE auto-furnish. |
| **SPEC-CEILING-LAYOUT-ENGINE / -LIGHTING-LAYOUT-ENGINE** | `docs/03-execution/specs/` | D-CE ceilings + lighting. |
| **SPEC-CASA-UNIFAMILIAR-TYPOLOGY** | `docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md` | The multi-storey house (§6 orchestration, §7 stair vertical alignment, §13 envelope). |
| Dimensional + Topology frameworks | `docs/03-execution/plans/` (APARTMENT-DIMENSIONAL-CONSTRAINTS-… / cognition-stack) | The D2/D3 + T1/T2/T3 validator classes + ObjectiveVector axes. |
| **C19 — Site Model & Parcel** | `docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` | Parcel boundary, LTP-ENU origin, `siteLatitudeDeg`. |
| **C50 — Typology Pipeline** | `docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md` | The typology-agnostic generation spine. |
| **C52 — Editable Building Graph** | `docs/02-decisions/contracts/C52-EDITABLE-BUILDING-GRAPH.md` | Per-node area/type overrides (`roomAreasByName`/`roomTypesByName`). |
| **ADR-0061** | `docs/02-decisions/adrs/0061-building-graph-bidirectional-edit-substrate.md` | The bidirectional-edit substrate + the byte-identical-baseline (I2) invariant. |
| **C16** | `docs/02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md` | Command authoring (the `wall.batch.create` / `wall.createOpening` doctrine). |

**Conflict resolution order** (per `CLAUDE.md`): vision → architecture → the C-contracts →
ADRs → SPECs. When code disagrees with a contract, **the code is wrong** — fix the code or
raise a superseding ADR.

---

## Appendix A — Glossary of the §-tags in the code

| Tag | Where | What it does |
|---|---|---|
| `§PRINCIPAL-AXIS` | `runDeterministicLayout.ts`, `rectDecomposition.ts` | Rotate skewed plots to dominant-edge frame, untransform after. |
| `§RECTIFY-QUAD` | `rectDecomposition.ts:43` | Convex quad → bbox so it tiles as one clean rect. |
| `§AREA-FRACTIONS` | `programRules.ts`, `bubbleGraph.ts` | Size-scaled min/max room-area clamps. |
| `§SINGLE-RECT-CARVE` | `subdivide.ts:402` | `[public \| corridor \| private]` slice + ensuite-from-master. |
| `§STAIR-OBSTACLE-CARVE` / `§STAIR-KEEPOUT` | `subdivide.ts`, `enumerate.ts`, `rectDecomposition.ts` | Carve the stair core out before subdivide; keep a spine. |
| `§FEASIBILITY-ALLOC` / `§FEASIBILITY-FIRST` | `subdivide.ts` | Rebalance-don't-drop; report shortfalls, never silent. |
| `§OPEN-PLAN-ELIGIBLE` | `programRules.ts:582`, `wallsAndDoors.ts:604` | Only living/kitchen/dining may go wall-less. |
| `§SEALED-ROOMS` / `§CIRCULATION-REROUTE` | `wallsAndDoors.ts` | Door reconciliation so every room opens onto circulation. |
| `§DOOR-MINIMUMS` | `programRules.ts:650`, `wallsAndDoors.ts:728` | Per-room-type clear-width floor. |
| `§EXTEND-TO-PERIMETER` / `§JUNCTION-REPAIR` | `wallsAndDoors.ts` | Close gaps on slanted shells; weld junctions for room detection. |
| `§WINDOW-CORNER-SETBACK` (A.21.D45) | `emitWindows.ts:67`, `shellWallMatch.ts:86` | Real masonry pier at each corner (reverts the edge-hugging window). |
| `§KITCHEN-DISTINCT` / `§BATH-CORRIDOR-ONLY` | `bubbleGraph.ts`, `programRules.ts` | Kitchen always enclosed; bath off corridor only. |
| `§STAIR-WORST-ASPECT` / `§STAIR-CORNER-ANCHOR` | `stairPosition.ts`, `stairCore.ts` | Stair takes the poor-aspect back corner. |
| `§COLLINEAR-MERGE` | `executePlan.ts:184` | Fold collinear segments at T/X junctions into passthrough walls. |

---

## Appendix B — Recently changed / reverted behaviours (honest status)

- **Corridor physiognomy (D46) — REVERTED.** The narrow 0.9–1.2 m corridor regressed the
  every-room-access guarantee; current shipping width is **1.2 m** (`subdivide.ts:132`) with
  `corridor.areaWeight = 0.85` so it spans every private room.
- **Window corner setback (A.21.D45, 2026-06-08) — FIXED.** Shell windows were landing at
  0.1 m from corners ("on the edge"); replaced the cosmetic clearance with a real
  wall-length-scaled pier (≥0.5 m) in both the emit and shell-match passes.
- **Stair worst-aspect / corner anchor (2026-06-08) — SHIPPED.** Central stairs holed the
  subdivision; the chooser now strongly prefers a perimeter back-corner on the poor-aspect
  (north-default) façade.
- **`§STAIR-CARVE-NO-DROP` (2026-06-08) — SHIPPED.** The dominant-rect corridor carve could
  drop a room; the subdivider now runs both carve + generic packing and keeps whichever drops
  fewer rooms (tie → carve, to preserve the corridor spine).
- **Contextual (OSM/Forma) buildings — NOT wired into layout.** Visual context + site framing
  only; no neighbour-shadow/view term feeds the generator today.
