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
| `storeyAllocation.ts` | Split the brief across storeys (`allocateProgramToStoreys`). The entrance hall is **ground-only** — UPPER storeys carry `entranceHall:false` (§LANDING-NOT-HALL / G14). |
| `houseProgramFloor.ts` | `enrichStoreyProgramToPlate` — raise a sparse storey program to a full house floor. The UPPER room-set floor is bedroom + bathroom + the engine's `corridor` (the stair LANDING), **never** an entrance hall (§LANDING-NOT-HALL / G14). |
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
   are private rooms. The `hall` ("Entrance Hall") is minted purely from
   `program.entranceHall === true` — and per **§LANDING-NOT-HALL (G14)** only the **ground
   (entrance) storey** of a house carries that flag, so an upper floor never mints a hall.
   Its stair arrival is the `corridor` (always present upstairs because beds+baths ≥ 1),
   relabelled "Landing" by `HouseLayoutExecutor`. An entrance hall is where the front door
   lands → ground-only; upper floors are reached by the stair → a landing.
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

---

## Residential House Generator (Casa Unifamiliar) — Deep Reference + Code Audit (2026-06-08)

> Canonical, exhaustive reference for the multi-storey **single-family house** ("Casa Unifamiliar")
> generator. The house generator is an **outer orchestration layer** that **reuses the apartment
> D-TGL engine UNCHANGED, once per storey** (that engine is documented in §1–§10 above — this
> section references it, it does not re-document it). Every file cited here lives in
> `packages/ai-host/src/workflows/houseLayout/` (pure L2) or `apps/editor/src/ui/house-layout/`
> (the editor seam). All §-tags and `A.21.Dxx` markers are the founder-driven rationale recorded in
> the source comments; they are cited inline so the *why* is traceable to the code.

### H0. Mental model + the three invariants the apartment never needed

`houseOrchestrator.ts:1-13` states the doctrine: the house is the apartment's single-plate D-TGL
engine grown into a stack of storeys. The apartment engine (`generateDeterministicLayouts`,
`reserveStairCore`, the pure tgl pipeline) is **FROZEN** — the orchestrator never forks it. It adds
exactly the three things a single plate never required:

1. **A vertically-aligned stair core** — the SAME XZ rectangle on every storey it passes through, so
   stairs stack and the stairwell void punches directly over the run (§7 vertical alignment).
2. **Per-storey `levelId` + elevation stamping** — the apartment stamps ONE level; a house stamps N.
3. **A stairwell void on every non-ground slab + a roof cap** over the topmost storey.

**Purity / spans:** every file in `houseLayout/` is pure, deterministic L2 — no I/O, no THREE, no
DOM, no `Math.random`, **no OTel spans** (`houseOrchestrator.ts:10-13`). This matches the apartment
tgl convention: spans live at the AiPlane boundary (P8, C09 §2.4), not in pure helpers. The editor's
AiPlane wraps the call.

**The stages (the §6 algorithm, `houseOrchestrator.ts:137-179`):**
```
(a) allocateProgramToStoreys   — split the whole-house brief across storeys      (storeyAllocation.ts)
(b) reserveStairCoreShaped     — one shared XZ rect + I/L/U shape on every storey (stairCore.ts + stairPosition.ts)
(c) generateDeterministicLayouts — per storey, the UNCHANGED apartment engine, with:
        · enrichStoreyProgramToPlate (plate-program floor)                        (houseProgramFloor.ts)
        · validateHouseStorey       (house-aware envelope gate, injected)         (houseEnvelope.ts)
        · keepOutRects              (stair core as a carve-out)                    (enumerate.ts + subdivide.ts)
(d) StairCore per adjacent storey pair                                            (houseOrchestrator.assembleHouse)
(e) SlabVoid on every non-ground slab
(f) RoofDescriptor over the shell, capped at the right world-Y                    (houseVertical.ts)
```

### H1. Output shapes — `types.ts`

The orchestrator's product is a fully-resolved `HouseLayoutResult` (`types.ts:148-154`) the editor
executor consumes:

| Type | Where | Key fields | Why |
|---|---|---|---|
| `StoreyRole` | `types.ts:20` | `'ground' \| 'upper' \| 'roof'` | `'ground'` = entrance level; `'upper'` = private levels above; `'roof'` carried for completeness (no habitable program). |
| `StoreyProgram` | `types.ts:29-35` | `storeyIndex`, `role`, `program: ApartmentProgram` | One storey's single-plate sub-program — an `ApartmentProgram`-shaped blob the D-TGL engine consumes per storey. |
| `StoreyPlate` | `types.ts:43-49` | `levelId`, `storeyIndex`, `elevationM`, `floorToFloorM`, `footprint` | A resolved plate: where it sits + its exterior footprint (identical on every storey → walls stack, §7). |
| `StairShape` | `types.ts:55` | `'I' \| 'L' \| 'U'` | Chosen per core from its aspect ratio (A.21.D18). |
| `StairFlightPlan` | `types.ts:59-63` | `riserCount`, `direction: {x,y,z}` (y≡0) | One flight's risers + WORLD-XZ plan direction. One entry for I, two for L/U. |
| `StairCore` | `types.ts:76-104` | `rectMm`, `from/toLevelId`, `shape`, `flights[]`, `landingDepthM?`, `risersBeforeLanding?`, `footprintMm`, `principalAxisRad`, `pivot` | The reserved core for ONE adjacent level pair, carrying everything the editor needs to emit a `CreateStairInput` with no re-derivation (A.21.D18) + the A.21.D24 rotation back to world. |
| `SlabVoid` | `types.ts:110-113` | `levelId`, `rectMm` | The stairwell hole punched in an upper slab. One per non-ground storey. |
| `RoofDescriptor` | `types.ts:123-140` | `levelId`, `footprint`, `kind`, `pitchDeg?`, `baseElevationM?`, `baseOffsetM?` | The roof over the topmost storey; `baseElevationM`/`baseOffsetM` are the §ROOF-CAP-ELEVATION decision so the editor places it deterministically (never a racy wall-store lookup). |
| `HouseLayoutResult` | `types.ts:148-154` | `storeys[]`, `perStoreyLayout[]`, `stairs[]`, `voids[]`, `roof` | The full orchestrator output. 1-storey → `stairs`/`voids` empty (strict superset of the apartment single-plate bridge). |
| `ScoredHouseLayoutOption` | `types.ts:166-173` | `result`, `overallScore` (0-100), `variantIndex` | One whole-house variant for the "Choose a house layout" modal. |

`perStoreyLayout[i]` is the chosen `ScoredLayoutOption` for `storeys[i]` (`types.ts:143-147`). Note
the **index alignment is conditional** — see Audit Finding ⚠-1.

### H2. Storey allocation policy — `storeyAllocation.ts`

**`allocateProgramToStoreys(program, storeyCount)` (`storeyAllocation.ts:42-122`)** splits ONE
whole-house `ApartmentProgram` into N `StoreyProgram`s.

**Step by step:**
1. **Clamp** storey count ≥1 (`clampStoreyCount`, `storeyAllocation.ts:26-29`; non-finite → 1).
2. **`storeyCount === 1` → pass-through** (`storeyAllocation.ts:49-51`): the whole program lives on a
   single `ground` plate. *Why:* the house path is then a strict superset of the apartment
   single-plate path — no behavioural divergence for the common case.
3. **Bedroom split (`storeyAllocation.ts:53-59`):** with ≥2 bedrooms, **one** bedroom stays on the
   ground (a guest/accessible room); the rest go up. With <2, all bedrooms go up. *Why:* the upper
   level is the private level; the ground keeps at most a guest room so its area is free for
   living/kitchen/dining.
4. **Bathroom split (`storeyAllocation.ts:63-64`):** one WC stays on the ground (the entrance-level
   WC); the remainder distributes across upper storeys.
5. **`distributeEven(total, buckets)` (`storeyAllocation.ts:166-173`):** spreads upper
   bedrooms/baths evenly, **front-loading bucket 0** (the lowest upper storey, where the master
   lives) with the remainder. *Why:* the master + en-suite must land deterministically near the
   stair-top landing.
6. **GROUND program (`storeyAllocation.ts:77-94`):** `groundBedrooms` + `groundBathrooms`,
   `masterEnSuite: false` (master is upstairs), `includeKitchen: true` (**§A.21.x-KITCHEN** — the
   house kitchen lives on the ground floor ONLY), plus living/dining/hall flags + any `roomAreas`
   overrides passed through.
7. **UPPER programs (`storeyAllocation.ts:98-119`):** bedrooms/baths per `distributeEven`,
   `masterEnSuite` only on the **first** upper storey (`isFirstUpper`, storeyIndex 1),
   `includeKitchen: false` (**§A.21.x-KITCHEN**, SPEC-CASA §3 — upper storeys have no kitchen),
   `entranceHall: true` (kept as a circulation seed to anchor the **stair-top landing/corridor**,
   even though an upper floor has a landing, not an entrance hall).

**§ENV-E3-ACOUSTIC (vertical, `storeyAllocation.ts:124-160`):** a SOFT preference (never a gate) for
comparing two candidate allocations — a bedroom directly above a kitchen/noisy storey is a
structure-borne penalty. `storeyAcousticProfiles` derives `{hasBedroom, hasNoisy}` per storey (noisy
= `includeKitchen` or `openPlanKitchenDining`); `storeyAcousticPreference` scores the stack in [0,1]
via `verticalStackAcousticScore`. Neutral 1.0 for a single storey, or the common
kitchen-on-ground/bedrooms-above case. **Audit Finding ⚠-5: this acoustic-preference machinery is
exported but NOT consumed by the orchestrator.**

### H3. The plate-program floor + max cap — `houseProgramFloor.ts`

**Root cause it fixes (`houseProgramFloor.ts:1-13`, §HOUSE-PLATE-PROGRAM-FLOOR / A.21.D25 Defect 2):**
the frozen D-TGL engine faithfully lays out exactly the program it is handed. A SPARSE captured brief
(a 0/1-bedroom brief, or an upper storey `allocateProgramToStoreys` left with just a hall) makes
`squarify` stretch one or two rooms to fill the whole plate — the founder's "165 m² Room 00-001". The
apartment never hits this because its `scaleProgramToShell` density (~130 m²/bedroom) is tuned for a
small flat, not a house storey.

**The rule (house-only, never touches the apartment path):** given a storey's plate area + its
(possibly sparse) program, **ADD rooms — never remove** — until the programme's comfortable-target
area approaches the plate. It is a FLOOR, not a cap: every user-stated count is preserved (only
raised). The complementary §HOUSE-MAX-CAP in the orchestrator bounds the *subdivision* budget so the
added rooms stay sensibly sized.

**`enrichStoreyProgramToPlate(program, plateAreaM2, role, opts)` (`houseProgramFloor.ts:184-262`):**
1. **Degenerate guard** (`:190`): `plateAreaM2 <= 0` → returns a copy unchanged.
2. **Role room-SET floor (`:194-218`):** `ground` guarantees living + entranceHall + kitchen +
   `openPlanKitchenDining: true` (so the kitchen has a dining companion rather than the kitchen blob
   stretching). `upper` guarantees ≥1 bedroom + ≥1 bathroom + entranceHall seed, never a kitchen
   (SPEC-CASA §3). Only ever turns flags ON / raises counts.
3. **§HOUSE-GROUND-FILL branch (`:228-230`):** when `role === 'ground' && growGroundRooms &&
   !growBedrooms` → `fillGroundPlate` and **return early**.
4. **Bedroom-growth pass (`:236-261`), gated on `growBedrooms`:** if not set, return the role floor.
   Otherwise loop (bounded `MAX_ENRICHED_BEDROOMS = 5`, `:239`): measure programme area via
   `houseStoreyBand` (the SAME band the envelope gate + §HOUSE-MAX-CAP use → all three agree on "how
   full is this plate"), and while `grossTargetM2 < plateAreaM2 × TARGET_FILL_FRACTION` (0.85,
   `:54`) add `max(1, floor(remaining / APPROX_BEDROOM_BLOCK_M2))` bedrooms
   (`APPROX_BEDROOM_BLOCK_M2 = 18`, `:36`), with proportional baths (`bathroomsForBedrooms` = 1 per
   2 beds, ≥1, `:57-59`), and a master en-suite once `nextBedrooms ≥ 3` (parity with
   `scaleProgramToShell`; never down-grades an explicit en-suite).

**`fillGroundPlate(program, plateAreaM2)` (`houseProgramFloor.ts:82-127`, §HOUSE-GROUND-FILL /
A.21.D28 #4):** the multi-storey GROUND floor is NOT the private level (bedrooms live upstairs), so
it must not grow the full bedroom count — but the old behaviour left it with the sparse captured
brief, which the frozen engine stretched into ONE giant room (the founder's "167.9 m² Living
Room / Bedroom 2 / Corridor / … merge"). The fix fills it with GROUND-appropriate rooms WITHOUT
pulling the house's bedroom count down off the upper storeys:
- `bedCap` (`:96-98`): if the brief allocated 0 ground bedrooms → up to `MAX_GROUND_FILL_BEDROOMS`
  (2, `:48`); else keep the allocated count (never invent a 2nd ground bedroom for a house whose
  bedrooms belong upstairs).
- Raise to ≥1 bedroom + ≥1 bath first (`:104-108`), then loop (bounded by `MAX_GROUND_FILL_BEDROOMS`)
  adding bedrooms while under the 0.85 target fill AND under `bedCap`, master/en-suite stays upstairs.

**Why two growth levers:** `growBedrooms` is the heavy private-level fill (upper storeys + the
single-storey ground, which carries the whole programme). `growGroundRooms` is the light
multi-storey-ground fill. They are mutually distinct; if both were set, `growBedrooms` (the stronger
fill) wins — the early-return at `:228` requires `!growBedrooms` so the branches never both run.

### H4. The house-aware envelope gate — `houseEnvelope.ts`

**Why it exists (`houseEnvelope.ts:1-26`, A.21.h / SPEC-CASA §13.3, "Deviation B RESOLVED"):** the
apartment envelope (`validateApartmentEnvelope`) keys its gross-area band on **bedroom count alone** —
sound for an apartment (one plate ≈ bedrooms × ~30 m²), WRONG for a house GROUND floor, whose large
area is consumed by living + kitchen + dining + hall + WC, not bedrooms. The apartment band would
HARD-reject a 120 m² ground floor with one guest bedroom. The old kludge **faked** the area (clamped
it into the apartment band so the gate passed but the engine laid out for the wrong area). The fix:
pass the TRUE area and inject a house-aware validator.

**The rule (`houseEnvelope.ts:13-21`):** judge the storey by its **FULL PROGRAMME**:
```
programAreaM2 = Σ comfortable-target area of every room the storey programmes
grossTargetM2 = programAreaM2 × HOUSE_CIRCULATION_FACTOR (1.15 — 15% net→gross gross-up,  :35)
grossMinM2    = grossTargetM2 × HOUSE_GROSS_MIN_BAND (0.55 — generous floor,             :39)
grossMaxM2    = grossTargetM2 × HOUSE_GROSS_MAX_BAND (2.4  — generous ceiling,            :45)
```
HARD-REJECT below `grossMin` or above `grossMax`. The band is deliberately **WIDE / additive** — every
house that generates today must still generate.

- **`storeyRoomTypes(p)` (`houseEnvelope.ts:67-86`):** MIRRORS `buildBubbleGraph` exactly (hall? ·
  living? · kitchen always · dining? · corridor when beds+baths>0 · beds with master/ensuite split ·
  baths) so the summed area reflects what the engine actually builds.
- **`targetAreaForType(type, program)` (`:91-96`):** honours a per-type `roomAreas` override, else the
  midpoint of the room's comfortable band from `dimensionsFor`.
- **`houseStoreyBand(input)` (`:100-110`):** the exported band (also used by the orchestrator's
  §HOUSE-MAX-CAP and by `houseProgramFloor`'s growth loops).
- **`validateHouseStorey(input)` (`:120-178`):** returns the apartment validators'
  `DimensionalValidation` shape (drop-in sibling). Non-positive area → `grossDegenerate` hard reject
  (`:124-134`). Hard rejects below min / above max (`:140-151`). SOFT penalties outside the target
  ±25% band (`:153-171`) feed quality scoring without dropping.

**Wiring:** `enumerate.ts:58-63` accepts an OPTIONAL `envelopeValidator`; default is the apartment
§D3.5 gate (`enumerate.ts:549-554`), so the apartment path is byte-identical. The orchestrator injects
`validateHouseStorey` (`houseOrchestrator.ts:484`).

### H5. The stair core — sizing + shape (I/L/U) — `stairCore.ts`

**Sizing (`stairCore.ts:9-15, 49-59`):** a typical UK/EU domestic stair ≈ 1.0 m clear width × ~3.0 m
run (landing incl.). Defaults `STAIR_W_MM = 1000`, `STAIR_H_MM = 3000`, clamped so the core never
exceeds `MAX_FRACTION = 0.45` of either plate dimension, never below `MIN_DIM_MM = 600`.

**`reserveStairCore(footprint, _storeyCount, solar?)` (`stairCore.ts:97-141`):** the straight-run (I)
reservation. Computes the plate bbox, sizes the clamped core, calls `chooseStairCorePosition`
(§H6) with the plate-local shell polygon + the aspect bias, adds the bbox-min offset, and clamps the
result fully inside the plate bbox. Returns `{x,y,w,h}` mm (min corner + extent). Same rect on every
storey (pure function of the footprint → §7 vertical alignment).

**Shape selection — `chooseStairShape(availW, availH)` (`stairCore.ts:185-194`):** works off the
**available** (MAX_FRACTION-clamped) box, not the I-rect, so a plate that *could* fit an L/U is
offered one. Deterministic ladder (`:164-194`):
1. `availW < 1600 OR availH < 1600` (`MIN_SHAPED_W/H_MM = L_W/H_MM`) → **I** (too tight to fold).
2. else aspect (longer/shorter) ≥ `I_ASPECT_MIN = 2.2` → **I** (a long thin slot — straight run fits).
3. else `availW ≥ 2000 AND availH ≥ 2800` (`U_W/H_MM`) → **U** (generous square — most compact tall form).
4. else `availW ≥ 1600 AND availH ≥ 1600` (`L_W/H_MM`) → **L** (squarer mid box — corner landing).
5. else → **I** (couldn't fit L or U → straight-run fallback).

*Why:* the straight run suits a long thin slot; a squarer plate folds into an L (smaller plan rect) or
a U (most compact plan for a tall storey). Always degrades safely to I when space is tight.

**`splitRisersForShape(shape, totalRisers)` (`stairCore.ts:212-220`):** I or `totalRisers < 3` →
`{before: 0, after: totalRisers}`; L/U → `{before: floor(total/2), after: remainder}`, each ≥1.

**`reserveStairCoreShaped(footprint, storeyCount, totalRisers, solar?)` (`stairCore.ts:234-296`):** the
shaped path the orchestrator actually calls. Chooses the shape from the available box FIRST, then: for
I reuses `reserveStairCore` verbatim (`:256-259`); for L/U sizes a square-ish rect to the shape's
target footprint clamped to the available box, scores its position with `chooseStairCorePosition` on
its OWN w×h, computes `risersBeforeLanding` via `splitRisersForShape`, and sets `landingDepthM` (L =
1.0 m = one stair width; U = 2.0 m = two widths so the half-landing spans both parallel runs, matching
`StairCreationController`). Returns a `StairCoreShaped`.

**`aspectBiasFor(solar)` (`stairCore.ts:43-47`):** builds the plate-local `AspectBias` from optional
solar data. Always returns a bias object when `solar` is present (even near the equator → `sunDir`
null, which still activates the perimeter preference — the stair hugs a wall regardless of latitude;
that is what fixes the central-hole subdivision break). Absent → `undefined` → legacy waste-only path.

### H6. The stair core — position scoring — `stairPosition.ts`

**Doctrine (`stairPosition.ts:1-21`, A.21.D29 / #6, "the engine decides per-plot"):** instead of
HARD-CODING a central position, enumerate a SMALL deterministic candidate set and score each by
circulation **waste** for the specific plate, then pick the least-waste one. The position depends only
on plate dims + core size, so the same function serves both reservation paths (keeps the orchestrator's
rect byte-identical to a direct call → the A.21.D18 equality invariant; guarantees vertical stacking).

**Frame (`:16-21`):** plate-local mm, origin at the footprint bbox min corner. The entrance is
conventionally on the y=0 (min-Z) façade, so no candidate is ever placed on that edge.

**§STAIR-WORST-ASPECT (founder explicit ask, `:37-96`):** the founder's rule — "the stair should
occupy the LEAST space possible and always tend to be ADJACENT TO A WALL — ideally the wall where the
view/sunlight is WORST (normally NORTH unless the view is good)." The stair is pure circulation;
spending the best façade on it wastes the plot's most valuable frontage.
- `wallOutwardNormal(kind)` (`:70-77`): left→−x, right→+x, back→+y, central→{0,0}.
- `aspectScore(kind, bias)` (`:87-96`): 0 (best aspect — avoid) … 1 (worst — ideal for a stair).
  `central` → 0; explicit `goodViewKinds` member → 0; no sun → neutral 0.5; else
  `(1 − n·sun)/2` (a wall whose normal faces the sun is the GOOD façade → 0; facing away → 1).
- `aspectFromSunDir(latDeg)` (`:546-549`): N hemisphere → sun toward +y (back wall good); S → −y;
  `|lat| < 10°` → null (equatorial, aspect-neutral). Same threshold/sign as `equatorFacingDir`; kept
  local so `stairPosition` stays a zero-coupling leaf.

**`stairCoreWaste(plateW, plateH, coreW, coreH, x, y)` (`:245-291`):** dimensionless, plate-area
normalised. For each of the core's four sides it measures the GAP to the plate edge; a gap in the
**sliver band** (0, `USABLE = 2400` mm) is dead circulation space (too thin to use, too wide to be a
wall) and is penalised, peaking at the band midpoint and falling to 0 at both ends (flush wall vs real
room). A `flushBonus` (`:284-288`) rewards abutting a perimeter wall (left/right/back — NOT the front
entrance edge); each flush side earns `0.04 × plateArea`.

**Candidate set — `stairCorePositionCandidates(...)` (`:303-450`):**
- `central` (`:317-329`): X-centre, back-third Z — ALWAYS present (safe default/fallback).
- `left`/`right` (`:428-439`) and `back` (`:440-447`): perimeter-adjacent. **§STAIR-CORNER-ANCHOR
  (Defect A, `:339-353`):** the side-wall candidates anchor to the **BACK CORNER** (flush to a side
  wall AND the rear wall), NOT mid-edge. *Why:* a mid-edge stair fractures the plate into three
  comparable bands (none dominant) so the subdivider can't keep a corridor spine and rooms merge (the
  central-stair blob a mid-edge perimeter stair reproduces). A corner stair carves a clean **L = one
  dominant rect + one small corner sliver**, so §STAIR-OBSTACLE-CARVE can run the corridor carve on the
  dominant rect and every room encloses + links. The back corner is the only clean-carve corner (front
  corners sit on the entrance edge) and keeps the stair off the prime façade.
- Perimeter candidates are only offered when the plate can spare a GENUINELY USABLE open side
  (`PERIMETER_MIN_OPEN_MM = 2400`, `:336-337`); a too-small plate degrades to central-only.

**Shell containment ladder (A.21.D34 → D52 → D59):** the candidate set is reasoned against the plate
bbox; on a SKEWED/rotated plate the bbox over-covers the real (rotated) shell polygon, so a "flush"
candidate can poke OUTSIDE it (the founder's "stair rot −24.1°, core outside" / "U-stair flush but
extending OUTside the footprint" reports). The cull:
- **`rectInsidePoly` / `pointInPoly` (`:182-229`):** test 4 corners + 4 edge midpoints + centre;
  boundary samples within `tolMm` count as inside.
- **A.21.D34(a):** cull perimeter candidates whose full core rect isn't contained; pull `central`
  inward via `containedCentral` (`:457-472`) if it escapes.
- **A.21.D52 `SHELL_JITTER_MM = 150` (`:145-162`):** a real drawn boundary wobbles a few cm
  (edge-by-edge draw + WallJoinResolver miter); without this the 0.001 mm test culled EVERY perimeter
  candidate on a jittery plate, collapsing to central. 150 mm absorbs draw/miter jitter; a genuine
  skew/notch (metres) is still culled.
- **A.21.D59 `SHELL_TIGHT_JITTER_MM = 30` + the inward-nudge ladder (`:164-180, 392-426`):** "offered"
  ≠ "well-placed" — a flush candidate up to 150 mm proud of a skewed wall pokes outward. The
  `containedNudged` ladder (`NUDGE_LADDER = [0,25,50,100,150,250,400,600,900]`, `:393`) walks inward
  along the wall's INWARD normal first (left→+x, right→−x, back→−y — the axis on which a skewed wall
  makes the core proud) and takes the FIRST position contained at the TIGHT 30 mm band (genuinely
  inside), falling back to the loose 150 mm band only if no inward nudge reaches tight containment, and
  dropping the candidate if neither band is ever satisfied. The ladder starts at 0 so an already-tight
  flush anchor is returned unchanged (axis-aligned plate → bit-identical to pre-D59).

**`chooseStairCorePosition(...)` (`:483-534`):** generates candidates, then:
- **No aspect bias** → pure waste tie-break (`:515`), `central`-preferring on a genuine tie
  (`TIE_EPS = 1e-6`, `:113-115`) — the legacy byte-identical path.
- **With aspect bias** → combined cost `waste + PERIMETER_PREFERENCE·(central?1:0) −
  ASPECT_WEIGHT·aspectScore` (`PERIMETER_PREFERENCE = 1.0`, `ASPECT_WEIGHT = 0.25`, `:511-517`). The
  perimeter-preference term makes any feasible perimeter candidate beat central (fixes the central-hole
  subdivision break + the founder's "adjacent to a wall" rule); the aspect term orders perimeter
  candidates so the POOREST-aspect (e.g. North) wall wins. On a plate where central is genuinely the
  only feasible option central still wins.

### H7. Vertical / roof elevation math — `houseVertical.ts`

Single source of truth for THREE vertical decisions so the editor only PLACES what these functions
DECIDE (testable without the editor; `houseVertical.ts:1-28`). All pure, span-free.

1. **§ROOF-CAP-ELEVATION (founder v45) — `roofBaseElevationM(storeyCount, ftf, baseElev=0, wallHeight?)`
   (`:50-62`):**
   `roofBaseY = baseElev + (storeyCount − 1)·ftf  (top-storey floor)  + wallHeight  (wall head)`
   `= baseElev + storeyCount·ftf` when `wallHeight === ftf`. Keeps `wallHeight` explicit because the
   D38 continuity pass extends shell walls slightly past the slab — the roof still caps at the
   *nominal* head. Clamps storeyCount ≥1; non-finite inputs degrade to safe defaults (ftf→3) so the
   caller never gets a NaN. **`roofBaseOffsetM(ftf, wallHeight?)` (`:69-73`)** = the wall head above the
   top floor (the `baseOffset` the roof command needs), kept separate so the executor's `baseOffset`
   is the same decision a test pins.
2. **§DOOR-IN-WALL-SPAN (founder v46) — `isDoorWithinWallSpan` (`:93-104`) + `clampDoorToWallSpan`
   (`:121-137`):** a door opening (offset + width) must lie WITHIN the wall span clear of each end
   (`DOOR_END_CLEAR_M = 0.15`, `MIN_DOOR_WIDTH_M = 0.7`, `:79-83`). The predicate behind the executor's
   entrance-door guard; the clamp narrows + slides the leaf, returning null when the wall can't host
   even a min door (caller drops it).
3. **§WALL-SLAB-CONTINUITY (D38) — `wallVerticalExtents` (`:176-194`) + `wallExtentForLevel`
   (`:200-212`):** the exterior shell shows a dark exposed-slab band at each floor junction because a
   level's walls stop at its ceiling and the next level's start at the next floor. Fix: a level's walls
   rise INTO the slab above by `slab/2` and the next level's drop INTO the slab below by `slab/2`, so
   the outer faces overlap the slab band and the shell reads continuous. Ground base is NOT lowered
   (sits on the ground slab); the TOP top is NOT raised past its head (the roof caps there). Single
   storey → one extent, no overlap (apartment path unchanged).

### H8. The orchestrator core — `houseOrchestrator.ts`

**`generateHouseLayout(...)` (single best, `:180-206`):** enumerates up to `DEFAULT_VARIANT_COUNT = 3`
options per storey via `enumeratePerStorey`, then `assembleHouse` selecting `bestStoreyOptionIndex` on
every storey. **The A.21.D18 EQUALITY INVARIANT (`:187-200, 110-126`):** this MUST be byte-identical to
`generateHouseLayoutOptions(...)[0].result`. The apartment engine surfaces a DIFFERENT `option[0]` when
asked for 1 vs N options (it Pareto-ranks the larger candidate set), so the single-best path MUST
enumerate with the SAME count (3) as the options path or the two diverge — hence enumerate with 3, not
1, then select index 0 per storey.

**`bestStoreyOptionIndex(options)` (`:127-134`):** argmax of `score.overall`, tie-broken by lowest index
(best Pareto rank); empty → −1 (blank storey). *Why not just index 0:* the engine ranks by Pareto front
then weighted objectives, so `options[0]` is the architecturally-best candidate but its scalar
`overall` is not guaranteed maximal (on a tight §STAIR-OBSTACLE-CARVE storey a Pareto-inferior
alternative that drops an en-suite can post a slightly higher `overall`). The modal sorts whole-house
variants best-first by aggregate `overall`, and the invariant requires variant 0 to BOTH equal the
single best AND sort first — both hold iff variant 0 picks the max-`overall` option per storey
(`:113-126`). Pre-stair this argmax always landed on index 0, so it is byte-identical there.

**`generateHouseLayoutOptions(...)` (N variants, `:237-294`, A.21.k):** reuses the apartment engine's
multi-option enumeration per storey, then assembles N whole-house variants by varying the per-storey
selected index:
```
variant 0     , storey s → bestStoreyOptionIndex(s)   (the single best on EVERY storey)
variant v ≥ 1 , storey s → (v + s) % availableOptions(s)
```
The `+ s` rotation (`:265`) staggers v ≥ 1 so alternative cards differ on BOTH floors and never collide
with variant 0's tuple (storey-0 index `v % n ≠ 0`). De-dupes via `seenSelections` (`:267-269`) so the
modal never shows two identical cards. Aggregate score = mean of chosen per-storey option scores
(`:278-281`). Sort best-first then by original variant order (stable, `:291`), re-stamp `variantIndex`
post-sort (`:293`). Fully deterministic — no `Math.random`.

**`enumeratePerStorey(...)` (`:319-497`)** — carries (a)+(b)+(c):
1. **Defaults** (`:327-331`): ftf 3.0, baseElev 0, `levelIdForStorey = i => storey-${i}`, roof gable.
2. **§PRINCIPAL-AXIS / A.21.D24 (`:335-351`):** `principalAxisAngle(footprint)`; if `|angle| ≥ 0.01`
   rad use it, else 0 (mirrors `PRINCIPAL_AXIS_MIN_RAD ~0.6°`). Pivot = footprint centroid. The footprint
   is rotated into the layout frame (`footprintLayout`) so the stair core is reserved in the SAME rotated
   frame the D-TGL engine lays out in. Axis-aligned plots → angle 0 → bit-identical (no regression).
3. **(a) `allocateProgramToStoreys`** (`:354`).
4. **(b) stair core (`:360-388`):** `totalRisers = totalRisersForGap(ftf)` = `max(2, round(ftf / 0.18))`
   (`:77-80`). §STAIR-WORST-ASPECT threads `opts.solar` → maps the WORLD equator-facing direction into
   the layout frame by the SAME −principalAxisRad rotation the window engine uses (`:370-383`).
   `reserveStairCoreShaped(footprintLayout, …)` only when `storeyCount > 1` (`:384-387`).
5. **§STAIR-KEEPOUT world rect (`:391-413`):** the core rect (in the LAYOUT frame) is mapped BACK to world
   (corners rotated +angle about pivot → an AABB) so `runDeterministicLayout` can re-map it into its own
   principal-axis frame internally (exact round-trip).
6. **(c) per-storey loop (`:418-490`):** for each storey program:
   - `usableAreaM2` = `shell.netAreaM2 − coreAreaM2` (the stair core is a real obstacle subtracted from
     the area budget; single-storey → no subtraction, `:425-427`).
   - `growBedrooms = role === 'upper' || storeyCount <= 1`; `growGroundRooms = role === 'ground' &&
     storeyCount > 1` (`:442-452`).
   - `enrichStoreyProgramToPlate(sp.program, usableAreaM2, sp.role, {growBedrooms, growGroundRooms})`
     (`:453-455`).
   - **§HOUSE-MAX-CAP (`:458-471`):** `houseMax = houseStoreyBand({program, grossAreaM2: usableArea}).grossMaxM2`;
     `presentedAreaM2 = min(usableArea, houseMax)`; the storey shell's `netAreaM2` is capped to that. The
     TRUE footprint (walls/elevations) is unchanged — only the room budget the bubble graph subdivides is
     capped, so a sparse oversize upper storey stays sensibly sized instead of being rejected.
   - `generateDeterministicLayouts(storeyShell, storeyProgram, constraints, weights, max(1,count),
     undefined, undefined, opts.solar, validateHouseStorey, keepOutRectsWorld)` (`:473-488`) — the
     UNCHANGED engine with the house envelope + the stair keep-out injected.

**`assembleHouse(h, select)` (`:504-586`)** — carries (d)–(f):
- **Storeys + elevation (`:513-531`):** `elevationM = r3(baseElev + i·ftf)`; the chosen option (or null
  for a blank plate) is pushed to `perStoreyLayout` ONLY when non-null; a `StoreyPlate` is always pushed
  so the stack + per-storey arrays stay index-aligned.
- **(d) Stairs (`:533-558`):** one `StairCore` per adjacent pair when `core && coreRect && storeys ≥ 2`.
  Flight directions via `resolveFlightPlans(core, totalRisers, principalAxisRad)` (`:47-75`): flight 1
  runs along the core's longer plan axis (`runAlongZ = h ≥ w`); for L flight 2 turns +90° left, for U it
  reverses (parallel return). Directions are authored axis-aligned in the layout frame then rotated back
  to world by +principalAxisRad. L/U also carry `landingDepthM` + `risersBeforeLanding`; every stair
  carries `principalAxisRad` + `pivot` so the editor rotates the footprint back to world.
- **(e) Voids (`:560-566`):** one `SlabVoid` per non-ground storey (`i ≥ 1`), rect = coreRect.
- **(f) Roof (`:568-583`):** over the topmost storey; `baseElevationM = roofBaseElevationM(storeys.length,
  ftf, baseElev, ftf)`, `baseOffsetM = roofBaseOffsetM(ftf, ftf)` (§ROOF-CAP-ELEVATION).

### H9. Stair-as-keep-out vs stair-obstacle-carve duality — `enumerate.ts` + `subdivide.ts`

This is the heart of how the FROZEN apartment engine accommodates a stair without being forked. Two
complementary mechanisms:

**(1) §STAIR-KEEPOUT — carve the core out of the buildable rects (`enumerate.ts:64-69, 137-202`).** The
orchestrator threads `keepOutRects` (world-XZ metres). In `buildCandidate` (`:166-202`): the shell polygon
is decomposed to rects, then each keep-out is mapped into the strategy's frame (`xfRect`, exact for
mirror/swap transforms) and **inflated by `KEEPOUT_MARGIN_M = 0.05` m** on every side (`:139-142, 187-194`)
before subtraction. *Why the margin:* the subdivider's post-pass alignment snap (`snapAxisLines`, 0.05 m)
can nudge a carved room edge a few cm back toward the core; a 0.05 m clearance ring guarantees every room
stays strictly clear of the actual stair footprint (a genuine keep-out + an architecturally-correct
clearance gap). `subtractRectsFromRects` carves the hole; an empty result → return null (core consumed the
whole plate, `:197`). **`stairCarved` is set true iff the carve fractured the plate** (`rectsT.length >
before`, `:200-201`).

**(2) §STAIR-OBSTACLE-CARVE — keep a corridor spine across the hole (`subdivide.ts:87-101, 1242-1283`).**
A keep-out turns the single plate into a FRAME/L of 2–4 sub-rects, which the generic multi-rect packer
(`packMultiRect`, `:1295-1331`) would pack INDEPENDENTLY per rect → no corridor spine → a merged blob +
§CIRCULATION-REROUTE compromise (the founder's central-stair defect). When `options.stairCarved &&
valid.length ≥ 2` (`:1251`): if the largest sub-rect holds ≥ `DOMINANT_FRACTION = 0.55` of the buildable
area (`:1257-1258`), run `trySingleRectCarve` (the §SINGLE-RECT corridor carve) on that **dominant rect**
with the WHOLE programme so a real corridor encloses + links every room; the tiny stair-clearance slivers
are left empty (correct — they ARE the landing zone).

**§STAIR-CARVE-NO-DROP (`subdivide.ts:1260-1282`):** squeezing the whole programme into the dominant rect
(smaller than the full plate by the stair sliver) can force a DROP (e.g. on a back-corner stair the
dominant rect is ~75% of the plate and the master en-suite no longer fits). The generic multi-rect path
uses ALL sub-rects (incl. the sliver) so it usually keeps every room — but with no spine. So the engine
runs **BOTH** (`generic = packMultiRect(valid, graph)`, `:1272`) and prefers whichever drops FEWER
programme rooms; **on a tie it keeps the CARVE** (`genericDrops < carvedDrops ? generic : carved`, `:1275`)
because the corridor spine is what fixes the merged blob. Falls through to the generic path when the carve
fails or no rect dominates (no regression — apartment + L/U/T shells unchanged).

### H10. Per-storey reuse of the FROZEN apartment engine

`generateDeterministicLayouts` → `enumerateLayouts` (`enumerate.ts:534-665`) runs the UNCHANGED 8-strategy
deterministic Pareto enumeration (coordinate axis × room order × mirror, `:144-152`) per storey. The house
touches it only through the two OPTIONAL parameters it already exposes — `envelopeValidator` (default =
apartment §D3.5 gate, `:549-554`) and `keepOutRects` (default = none, decomposition bit-identical). Every
other axis (shape gate D3.1, topology gate T3.3, circulation reroute, feasibility-alloc, the 5-tier pool
fallback `:600-624`, Pareto rank + weighted sort `:626-629`) is identical to the apartment path documented
in §2/§4/§5/§10 above. **Determinism:** no RNG, no time-dependent budget, fixed strategy set → identical
output every run, on every storey, and identical between the single-best and N-variant paths at index 0
(the A.21.D18 invariant).

### H11. The editor seam — controller → executor → post-gen chain

**`HouseLayoutController.ts` (the modal wiring):**
1. `request(runtime, req)` (`:137-195`): resolves the active (ground) level (`resolveActiveLevel`),
   analyses its EXTERIOR shell (`analyseActiveShell`, `:69-93` — mirrors the executor exactly so the
   preview matches the build), caches the regenerate context (`_regen`, §MODAL-DYNAMIC A.21.D22), runs the
   PURE `generateHouseLayoutOptions(...)` (`_computeVariants`, `:201-219`, `HOUSE_OPTION_COUNT = 3`) and
   opens `HouseLayoutModal` with one card per variant. No scene mutation here.
2. `_regenerate(state)` (`:231-246`): debounced program-edit re-run — SYNCHRONOUS (the house generator is an
   offline deterministic L2 call, unlike the async apartment relay), refreshes cards in place, updates the
   cached program/storeys/weights so a later pick builds the EDITED variant. Changing FLOORS re-enumerates.
3. `_build(runtime, index)` (`:250-270`): calls `executor.execute(...)` with `variantIndex` + `variantCount`
   so the executor re-enumerates the SAME deterministic set against REAL minted ids and resolves the SAME
   variant.

**`HouseLayoutExecutor.ts` (the command emission) — ordering (`:412-502`):**
- **(a) Mint storeys 1…n-1 (`:236-258`)** above the ground via `AddLevelCommand` (synchronous `cm.execute`,
  id captured directly — no read-back). Ground reuses the active level id. Failure aborts.
- **(b) Pure generation (`:260-286`):** `generateHouseLayoutOptions(...)[variantIndex]` when a variant was
  picked, else `generateHouseLayout(...)`. `levelIdForStorey = i => levelIds[i]`. Level ids only affect
  `levelId` stamping, not layout/scoring, so preview (placeholder ids) and build (real ids) resolve to the
  same variant at the same index.
- `resetStairVoids()` (`:294`) clears any stale void from a previous build.
- **Pre-build per-storey command sets (`:327-410`):** ground reuses the drawn shell (`skipExteriorWalls:
  true` + gathered `shellWalls`); each upper storey gets a freshly-minted explicit perimeter
  (`_buildPerimeterShell`, §PERIMETER-SHELL A.21.D21, `:1036-1111`) so the perimeter is CLOSED by
  construction independent of room coverage. `buildLayoutCommands` (the REUSED apartment pure core) builds
  walls + openings + doors + boundaries. **§GROUND-WELD (A.21.D39, `:578-655`)** welds ground interior
  partition endpoints onto the pre-drawn shell so the ground closes every room the way upper floors do
  (`weldPartitionsToShell`). **§A.21.D29 #3** resolves ONE ground entrance door (`resolveEntranceDoor`),
  re-checked/clamped via §DOOR-IN-WALL-SPAN (`:377-409`).
- **ONE batch (`:427-502`, one undo unit):** order is **0** upper-storey perimeters → **0.5**
  §WALL-SLAB-CONTINUITY ground bump (`UpdateWallHeightCommand`, +slab/2, multi-storey only) → **1** interior
  partition walls (async bus) → **2** structural slabs (synchronous `cm.execute`, MUST precede stairs) →
  **3** stairs (`_createStair`, `autoCreateOpening` punches the void on the just-created slab above, §VOID)
  → **4** roof (`_createRoof` on the TOP storey). `skipRedetectRooms: true` here.
- **`_createStair` (`:708-862`):** sizes total risers to the gap (`round(ftf/0.18)`, clamped to
  [0.15,0.19] m per riser, `:718-721`); builds flights + landings in the LAYOUT frame
  (`_buildFlights`/`_normaliseSplit`, `:957-1020`) then rotates the rigid body back to world by +angle about
  pivot (A.21.D24); emits `CreateStairCommand` honouring the engine's shape + already-world-rotated flight
  directions; records the void (`computeStairFootprintRect` → `recordStairVoid`) as the SINGLE SOURCE OF
  TRUTH for the slab hole + floor/ceiling cut + the guardrail; rails 3 of 4 void edges
  (`_createVoidGuardrail`, leaving the step-off edge open).
- **`_createRoof` (`:1117-1212`):** subtracts the world centroid so `polygon` is centroid-local (§ROOF-FRAME
  fix); degrades `gable`→`hip` on a non-gable-friendly footprint (§ROOF-SHAPE); converts pitch° → `slope =
  tan(pitch)`; places at the TOP level with an EXPLICIT `baseOffset` + `autoBaseOffset: false` (§ROOF-LEVEL
  — the prior racy `getByLevel` lookup ran before the async upper walls committed).
- **`_finishOpenings` (`:1225-1366`):** a deferred SECOND batch (after the walls land — `wall.createOpening`
  reads the committed store) dispatching every storey's openings + boundaries + the entrance door, with the
  FINAL `skipRedetectRooms: false` redetect across all storeys; then a deferred `rebuildWallBodies` flush
  (§A.21.D28/D40) so the new opening holes render.

**`runHousePostGenChain.ts` (the finish chain, A.21.i):** the per-stage finish chain (floor → ceiling →
furnish → light) resolves the ACTIVE level internally, so a house must fan it out across every storey.
`runHousePostGenChain(runtime, levelIds, nameStorey)` (`:170-204`) iterates storeys IN SEQUENCE: per storey
`runChainForLevel` (`:99-155`) sets the level active (`window.projectContext.activeLevelId`), **names the
storey's rooms and AWAITS `apartment.room-name-completed {levelId}` BEFORE furnishing (§A.21.D25** — the
ground floor came out bare because furnish raced ahead of async naming), runs floor + ceiling (parallel),
then furnish, then lighting, awaiting each `*.layout-executed` terminus with a settle budget. The cascade
guard (`beginHouseFanout`/`endHouseFanout`) suppresses the apartment auto-cascade handlers so stages don't
double-fire. Restores the original active level when done. Runs ONLY for a house build — the apartment
single-level path is byte-for-byte unchanged.

---

## AUDIT FINDINGS

Systematic check of the shipped code against the documentation above. ✅ = confirmed as documented;
⚠️ = discrepancy / dead code / risk; ❓ = ambiguity needing founder/architect input.

### ✅ Confirmed as documented

- ✅ **A.21.D18 equality invariant is correctly engineered.** `generateHouseLayout` enumerates with
  `DEFAULT_VARIANT_COUNT = 3` (NOT count=1) and selects `bestStoreyOptionIndex` per storey
  (`houseOrchestrator.ts:201-205`); `generateHouseLayoutOptions` variant 0 uses the SAME selector
  (`:265`) and sorts max-`overall` first (`:291`). Both paths therefore produce a byte-identical
  index-0 result. Code matches the comment.
- ✅ **Determinism.** No `Math.random` anywhere in `houseLayout/`. Variant staggering is `(v+s)%n`,
  ladders and fraction-grids are fixed constants, ties resolve to lowest index / `central`. Confirmed.
- ✅ **§HOUSE-MAX-CAP only caps the room budget, not the footprint.** `presentedAreaM2 =
  min(usableAreaM2, houseMax)` is applied solely to `storeyShell.netAreaM2` (`houseOrchestrator.ts:468-471`);
  the `StoreyPlate.footprint` is always the raw `shell.perimeter` (`assembleHouse:529`). Walls/elevations
  unaffected, as documented.
- ✅ **Stair-as-keep-out 0.05 m inflation matches the snap tolerance.** `KEEPOUT_MARGIN_M = 0.05`
  (`enumerate.ts:142`) === `ALIGNMENT_SNAP_EPS_M = 0.05` (`subdivide.ts:106`). The clearance ring
  reasoning is sound.
- ✅ **§STAIR-CARVE-NO-DROP tie-breaks to the carve.** `genericDrops < carvedDrops ? generic : carved`
  (`subdivide.ts:1275`) keeps the carve on a tie (`carvedDrops === genericDrops` → `false` → `carved`),
  exactly as the comment claims.
- ✅ **Single-storey is a strict superset of the apartment path.** `storeyCount <= 1` →
  `allocateProgramToStoreys` pass-through (`:49-51`), `core = null` (`:384-387`, no stair/void),
  `growBedrooms = true` on the ground, no area subtraction (`:425-427`). Stairs/voids empty in the result.
- ✅ **Roof cap math is consistent end-to-end.** `roofBaseElevationM(n, ftf, base, ftf)` =
  `base + (n−1)·ftf + ftf = base + n·ftf` (`houseVertical.ts:50-62`); the executor resolves
  `topLevel.elevation + baseOffset = (base + (n−1)·ftf) + ftf` (`HouseLayoutExecutor.ts:1190-1195`) → the
  same value. Consistent.
- ✅ **§WALL-SLAB-CONTINUITY overlaps match.** Upper walls drop base by slab/2
  (`wallExtentForLevel`, applied at `:1057`); the ground shell is bumped up by slab/2
  (`UpdateWallHeightCommand`, `:452-456`). The two halves meet in the slab band as documented.
- ✅ **Void single-source-of-truth.** `computeStairFootprintRect` output feeds the slab hole
  (`autoCreateOpening`), `recordStairVoid` (floor/ceiling cut), and `_createVoidGuardrail`
  (`HouseLayoutExecutor.ts:816-860`) — all three consume the same `voidRect`, so edges coincide.

### ⚠️ Discrepancies / dead code / risks

- ⚠️ **⚠-1 `perStoreyLayout` is NOT reliably index-aligned with `storeys`** despite the `types.ts:143-147`
  comment ("`perStoreyLayout[i]` is the chosen option for `storeys[i]`"). In `assembleHouse`
  (`houseOrchestrator.ts:520-531`) a `StoreyPlate` is ALWAYS pushed but the option is pushed to
  `perStoreyLayout` **only when non-null** (`if (chosen) perStoreyLayout.push(chosen)`). If any storey
  yields a null option (empty plate, index −1), `perStoreyLayout` becomes SHORTER than `storeys` and the
  index correspondence breaks for every storey after the gap. The executor side-steps this by re-reading
  `result.perStoreyLayout[i]` positionally (`HouseLayoutExecutor.ts:330`) AND null-guarding
  (`:331`) — so a blank middle storey would mis-pair the executor's option lookup. The
  `generateHouseLayoutOptions` aggregate-score mean (`:278-281`) is unaffected (it iterates the array,
  not by storey index), but the documented invariant is only true when no storey is blank. **Fix
  direction:** either push `null` placeholders to keep strict alignment, or correct the `types.ts`
  comment to "compacted, blank storeys omitted" and have the executor pair by `levelId` rather than index.
- ⚠️ **⚠-2 `goodViewKinds` is dead-but-wired.** `AspectBias.goodViewKinds` is defined (`stairPosition.ts:64`)
  and honoured by `aspectScore` (`:89`), but NO caller ever populates it: `aspectBiasFor` builds
  `{ sunDir }` only (`stairCore.ts:43-47`), and the orchestrator's `stairSolar` carries only `latDeg` +
  `sunDirLayout` (`houseOrchestrator.ts:370-383`). The founder's "unless the view is good" half of the
  worst-aspect rule is therefore **not reachable** today — only the sun-derived aspect is used. Documented
  as a ready hook; flag for the architect that the good-view override has no data source.
- ⚠️ **⚠-3 `reserveStairCore`'s `solar`/aspect path is effectively unreachable in production.**
  `reserveStairCore` is only called by `reserveStairCoreShaped` for the **I** shape
  (`stairCore.ts:256-258`), and the orchestrator always calls `reserveStairCoreShaped`. So the standalone
  `reserveStairCore` export is exercised only by tests. Not a bug, but the documentation should note that
  the production stair-core path is exclusively `reserveStairCoreShaped`.
- ⚠️ **⚠-4 `_buildFlights` is always called with `engFlights = null` in the executor**
  (`HouseLayoutExecutor.ts:766`), so its `engFlights`-present branches (`:987-989`) are dead at this call
  site — the executor instead substitutes the engine's already-world-rotated directions AFTER building
  (`:771-779`). The `_buildFlights` engine-direction handling is therefore redundant for the house path
  (geometry is built from layout-frame `dir1Layout`, then directions are overwritten). Works correctly but
  carries an unused branch.
- ⚠️ **⚠-5 The vertical acoustic preference (§ENV-E3-ACOUSTIC) is computed but never consumed by the
  orchestrator.** `storeyAcousticPreference` / `storeyAcousticProfiles` (`storeyAllocation.ts:140-160`) are
  exported and tested, but `houseOrchestrator.ts` never calls them — there is a single deterministic
  allocation (`allocateProgramToStoreys`), not a set of candidate allocations to rank, so the SOFT
  preference has nothing to break ties between. The comment frames it as "the orchestrator/variants can use
  it to break ties," which overstates the current wiring. Flag as a designed-but-unwired hook.
- ⚠️ **⚠-6 Riser-count divergence between engine and executor is real (handled, but worth recording).** The
  orchestrator computes `totalRisers = max(2, round(ftf/0.18))` (`houseOrchestrator.ts:78-80`); the executor
  RE-derives its own `totalRisers` with an additional [0.15,0.19] m per-riser clamp loop
  (`HouseLayoutExecutor.ts:718-721`), then `_normaliseSplit` re-keys the L/U flight split off the executor's
  total (`:756, 957-966`). For ftf = 3.0 both give 17 risers, but for non-standard ftf the engine's
  `flights[].riserCount` (carried in `StairCore`) can disagree with the executor's per-flight counts. The
  executor's CreateStairCommand uses its OWN `split`, and the engine's `flights[].direction` only (not its
  riser counts), so the ±50 mm height gate keys off a consistent sum — but the `StairCore.flights[].riserCount`
  the engine emitted is not what is actually built. Not a defect; the doc records it so the two riser sources
  aren't assumed identical.

### ❓ Ambiguities needing founder/architect input

- ❓ **❓-1 Blank-storey behaviour (tie-in with ⚠-1).** When a storey produces zero options (e.g. an
  envelope HARD-reject on a tiny upper plate), `assembleHouse` still emits a `StoreyPlate` (walls/slab will
  be built) but NO rooms, NO entrance, and a possibly mis-indexed `perStoreyLayout`. Is a wall-only blank
  storey the intended graceful-degradation, or should the build abort / warn the user that a requested
  storey couldn't be laid out? Today it ships silently apart from a `console.warn`
  (`HouseLayoutExecutor.ts:331`).
- ❓ **❓-2 §HOUSE-MAX-CAP vs the per-storey footprint on a large plate.** On a genuinely large plot the cap
  shrinks the *room budget* but the *footprint* (and thus the slab + perimeter walls) stays full-size, so a
  capped upper storey has rooms that don't fill the plate — the very "one giant room / stretched rooms"
  failure mode the §HOUSE-PLATE-PROGRAM-FLOOR enricher exists to prevent, but now expressed as "rooms +
  empty perimeter band." `enrichStoreyProgramToPlate` (growth to 0.85 fill) and the cap (`grossMax`)
  push in opposite directions; on a plate larger than `grossMax/0.85` the enricher caps out at
  `MAX_ENRICHED_BEDROOMS = 5` and the cap then trims. Is the resulting "rooms hug one side, perimeter band
  empty" acceptable, or should the cap also drive a footprint inset for the upper storeys? Architect call.
- ❓ **❓-3 Entrance only on the ground.** Upper storeys are reached exclusively by stair (no external door,
  by design, `HouseLayoutExecutor.ts:377`). For a house on a slope / with a split-level entrance this may be
  wrong, but there is no site-grade input feeding the generator today (consistent with §9's "context not
  wired"). Confirm single-entrance is the intended scope for Casa Unifamiliar v1.
