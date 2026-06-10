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
dominance** then a **weighted sum** of 21 objective axes, and returns the best `N`.
Same input ⇒ byte-identical output, every run (no `Math.random`, no time budget, no
population evolution). "House" is the same single-plate engine wrapped in a storey loop
that adds a stair core, per-storey level stamping, slab voids and a roof. The editor
seam gathers the payload from live stores, the executor commits the chosen option as
one undoable batch, and a post-gen chain fills floors/ceilings/furniture/lighting.

---

## MASTER SUMMARY — the whole system in two pages

> Read this first. It is the executive walkthrough; §1–§12 are the drill-down. Two new
> deep-dive sections follow it: **"Why the apartment generator beats the house"** (after §8)
> and **"The stair is the circulation root-cause"** (the most important addition, §8.4).

### The engine has a name: **D-TGL**

The room-quality core is the **D-TGL deterministic layout engine**
(`packages/ai-host/src/workflows/apartmentLayout/tgl/`). It is **one pure function** —
`generateDeterministicLayouts(shell, program, …)`
(`tgl/runDeterministicLayout.ts:86`) — and **both** the apartment generator and the house
generator call **the same function**, unchanged. There is no second subdivision engine. Same
input ⇒ byte-identical output: no `Math.random`, no time budget, no population evolution.

### The eight stages, end to end

1. **Brief + site → program + shell.** The user draws a parcel boundary on the Cesium/Forma
   GIS surface (C19); the committed boundary becomes **shell walls** in the wall store, and a
   typology brief (sliders / RAC) becomes an `ApartmentProgram`. The editor seam
   `gatherLayoutPayload.ts` reads the live walls (with `isExterior`), the hand-placed front-door
   opening spans, the brief, the A.25 design sliders, and the **site latitude**
   (`getCurrentSiteOrigin()`, `siteDispatch.ts:65`) into one `ApartmentGenerateLayoutPayload`.

2. **Shell → axis-aligned frame.** `generateDeterministicLayouts` rotates a skewed plot into
   its principal-axis frame (`§PRINCIPAL-AXIS`, `runDeterministicLayout.ts:122-149`) — a
   rectilinear shell rotates by 0 and is bit-identical. Window/door avoidance spans, the stair
   keep-out, and the sun direction are all forward-mapped into that frame.

3. **8-strategy deterministic enumerate.** `enumerateLayouts` (`tgl/enumerate.ts:524`) is the
   NSGA-II replacement: instead of evolving a random population it builds **exactly 8**
   candidate tilings — `for axis∈{f,t} for order∈{fwd,rev} for mirror∈{f,t}`
   (`enumerate.ts:144-152`). Each strategy runs the full **P1→P7** pipeline:
   shell→rects (`rectDecomposition.ts`, P1) · program→bubble graph + area allocation
   (`bubbleGraph.ts`, P2) · rooms→footprints via squarify + corridor spine
   (`subdivide.ts`/`squarify.ts`, P3) · dimensional shape/fit gate (`dimensions/*`) ·
   footprints→walls+doors (`wallsAndDoors.ts`, P4) · persistent `LayoutGraph`
   (`semanticGraph.ts`, P5) · topology gate (`topology/*`) · space-syntax depth
   (`spaceSyntax.ts`, P6) · the **21-axis `ObjectiveVector`** (`objectives.ts`, P7).

4. **Gate → Pareto + weighted rank.** The **§TOPO-HARD-REJECT** top-level split prefers
   hard-valid candidates (no windowless habitable room / no land-locked room / no
   private-room-off-hall — §5.4.1); within that, a 5/7-tier gate keeps the cleanest pool
   (legal ∧ shaped ∧ routed → … → anything), then candidates are ranked by **exact Pareto
   dominance** (`assignParetoRanks`, `enumerate.ts:506`), tie-broken by a **weighted sum** of
   the 21 axes driven by the 4 user sliders + the E.1 priority band (`weightedSum`, line 681).
   Final order is stable (`rank asc → weighted desc → strategy string`). The pool is never
   emptied — if all 8 strategies are hard-invalid, the least-bad ships with a loud warning.

5. **Emit geometry (P9).** For each ranked candidate, `emitGeometry` (`emitGeometry.ts:57`)
   projects the `LayoutGraph` → a `LayoutOption` in mm — `LayoutRoom`s, `LayoutWall`s, doors as
   `{wallRef, offset, width}`, plus the per-room **window emission** (`emitWindows.ts`, sun-biased
   face + size). The option is rotated back to world and scored (`scoreLayout`).

6. **Editor executor commits.** The user picks an option in the modal;
   `buildLayoutCommands(option)` (`executePlan.ts:516`) turns it into a dispatchable set —
   pre-minted `wall.batch.create` ids, one `wall.createOpening` per door/window (C15 cascade),
   `door`/`window.batch.create`, and `roomBoundingLine.create` for open-plan splitters.
   `skipExteriorWalls` omits the perimeter (the drawn shell already exists). The whole set runs
   inside **one `BatchCoordinator.runBatch`** → a single undo.

7. **Room detection + naming.** The shared `RoomDetectionEngine` re-detects the enclosed rooms;
   `nameDetectedRooms` tags each room's occupancy. **This is where the system can fail visibly:**
   if a partition endpoint does not land on the shell centreline, the detection loop never
   closes and N rooms collapse into ONE merged room (see §8.4 — the stair is the dominant cause).

8. **Post-gen finish chain.** `runHousePostGenChain.ts` fans floors → ceilings → furniture →
   lighting across every level, in sequence, awaiting room-naming before furnishing. The
   apartment fires this chain **once** on the active level.

### The orchestration — apartment (single plate) vs house (storey loop)

This is the crux of the founder's "why is the apartment better" question, so it is stated up
front and proven in the two sections below:

- **Apartment = single plate.** There is **no orchestrator**. The editor calls D-TGL once for
  the active level and commits. No stair, no per-storey program sizer, no ground-shell weld.

- **House = the SAME engine wrapped in a storey loop.** `houseOrchestrator.ts`
  (`generateHouseLayout`) splits the brief across storeys (`allocateProgramToStoreys`), reserves
  a vertically-aligned **stair core** (`stairCore.ts` + `stairPosition.ts`), calls
  `generateDeterministicLayouts` **once per storey** (with a per-storey program sizer
  `enrichStoreyProgramToPlate` and the stair core carved out as a keep-out), then the editor
  `HouseLayoutExecutor` builds every storey + the actual stair + slab voids + a roof.

**The seam** between the pure engine and the live editor is one shape: the engine returns a
`LayoutOption` (apartment) / `HouseLayoutResult` (house); the executor calls the **same**
`buildLayoutCommands` and the **same** batch commands for both. Everything that decides
*per-plate room maturity* is shared; everything the house adds is either the genuinely-additional
multi-storey spine (stair / slab / roof) or **two compensating heuristics** (the ground-shell
weld and the parallel program sizer) that exist only because the house feeds the engine
differently. See **"Why the apartment generator beats the house"** below.

### What is genuinely broken today (honest)

The **stair desync** (§8.4 / §8.5) — historically the single largest live defect — is **CLOSED
as of 2026-06-09 (`§STAIR-CONTAIN-UPSTREAM`).** The engine used to carve the room-tiling keep-out
at the stair's *original reserved* position while the editor nudged the shipped stair body to a
*different* position to fit a rotated shell, so the final stair overlapped the rooms tiled in the
vacated region, its void cut the sealing partitions, and room detection flooded into one merged
room. Now the containment is solved **upstream**, in the orchestrator, BEFORE the keep-out is
carved, and the SAME world offset flows to the executor — so the keep-out == the shipped footprint
by construction and the executor's nudge is a verified no-op (§8.5.4). The founder's instinct was
exactly right: **the stair was the circulation root-cause.** A secondary, downstream-coupled gap
is that on a rotated ground
plate the partition↔shell weld can still merge rooms (`§GROUND-ENGINE-PERIMETER` takes the
`WELD-FALLBACK` path and `WallJoinResolver` reports `§MULTI-CLUSTER … PASS-THROUGH` joins plus the
occasional `§WJR-INVALID … self-cluster`). Both are documented with file:line in §8.4–§8.5.

---

## HOUSE ENGINE — COMPLETE ARCHITECTURE & ORCHESTRATION (master diagram)

> **This is the single entry-point map for the residential-HOUSE pipeline.** It is the
> consolidated architecture + orchestration view a new engineer should read first; the
> apartment internals it references (the `P1→P9` D-TGL pipeline) are documented in **§1–§10**
> and NOT re-drawn here, and the line-by-line house deep-reference is **H0–H11** (the
> "Residential House Generator (Casa Unifamiliar)" section) + the **AUDIT FINDINGS** at the end.
> Every box is annotated with the layer it lives in (L0–L7.5, see CLAUDE.md) and a `file:line`
> anchor. All claims are grounded in the CURRENT source (verified 2026-06-10).

### HE.0 — The one sentence

The house is the **apartment's single-plate D-TGL engine wrapped in a storey loop**. The shared
pure engine `generateDeterministicLayouts` (`tgl/runDeterministicLayout.ts:86`) is **FROZEN** and
called **once per storey, unchanged**; everything the house adds is either the multi-storey spine
(stair core · per-storey level stamping · slab voids · roof) or **two compensating heuristics**
(the ground-shell weld and the parallel program sizer) that exist only because the house feeds the
engine differently. See **§8.4** for *why the apartment beats the house* and the honest defect list.

### HE.1 — Master architecture / orchestration diagram (end to end)

```text
                            ┌──────────────────────────────────────────────────────────────────────┐
                            │  INPUT                                                          (L7.5) │
                            │  • drawn parcel boundary  → ShellAnalysis (perimeter+netAreaM2)        │
                            │      C19 SiteModel / ParcelBoundary → houseFromBoundary.ts:77           │
                            │      → analyseActiveShell()  HouseLayoutExecutor.ts:142  (exterior      │
                            │        walls + entrance + window counts + SL-3 orientation)            │
                            │  • typology brief (sliders / RAC)  → ApartmentProgram + ScoringWeights  │
                            │  • site latitude (climate)  → solar.latDeg                              │
                            └───────────────────────────────────┬──────────────────────────────────┘
                                                                │
                       request() / modal / preview              ▼
   ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
   │  EDITOR SEAM (L5 apps/editor)                                                                    │
   │  houseLayoutTrigger.ts:31 (console) · HouseLayoutController.ts:109 (request → modal → pick)      │
   │  HouseLayoutModal (cards) ── §MODAL-DYNAMIC re-runs generateHouseLayoutOptions on program edit   │
   └───────────────────────────────────┬───────────────────────────────────────────────────────────┘
                                        │  generateHouseLayout / generateHouseLayoutOptions(shell,program,…,opts)
                                        ▼
 ╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
 ║  ORCHESTRATOR — houseOrchestrator.ts            (L2, pure/deterministic, NO spans :10-13)           ║
 ║                                                                                                     ║
 ║  generateHouseLayout :190 ─┐     generateHouseLayoutOptions :247 ─┐  (N modal variants)             ║
 ║                            └──────────────► enumeratePerStorey :467 ◄──────┘                         ║
 ║                                                    │                                                ║
 ║  ── §PRINCIPAL-AXIS world↔layout FRAME boundary (:483-499) ────────────────────────────────────    ║
 ║     principalAxisAngle(footprint) → rotate plot to axis-aligned LAYOUT frame; angle 0 ⇒ identity.   ║
 ║     EVERYTHING below runs in the LAYOUT frame; geometry is rotated BACK to world on emit.           ║
 ║                                                    │                                                ║
 ║   (a) allocateProgramToStoreys  storeyAllocation.ts:44   split brief → StoreyProgram[]              ║
 ║         └ §HALL-SINGLETON :69/181  exactly ONE entrance hall (ground only); uppers get a Landing    ║
 ║   (b) reserveStairCoreShaped    stairCore.ts:275  + chooseStairCorePosition  stairPosition.ts:525   ║
 ║         └ §STAIR-DEFAULT-BIAS :541  ALWAYS a corner (never central) · I/L/U shape from aspect       ║
 ║   (b') §STAIR-CONTAIN-UPSTREAM  containStairCoreUpstream :355  solve inward containment vs ROTATED  ║
 ║         shell BEFORE the keep-out is carved → carved keep-out == shipped footprint (the §8.5 cure)  ║
 ║         emits §DIAG-STAIR-CONTAIN-UPSTREAM + §DIAG-STAIR-RULE (R1 corner/R2 aspect/R3 no-overlap/R4 in-shell)║
 ║   ── per storey loop (:653) ─────────────────────────────────────────────────────────────────────  ║
 ║   (c) enrichStoreyProgramToPlate  houseProgramFloor.ts:197  raise sparse brief → full floor program ║
 ║         └ growBedrooms (upper / single) · growGroundRooms (multi-storey ground)  [PARALLEL SIZER]   ║
 ║       §HOUSE-MAX-CAP / §AREA-AGREEMENT (:709-714)  cap subdivision budget for a sparse oversize plate║
 ║       §STAIR-KEEPOUT (:628)  AABB of CONTAINED stair footprint carved out of the buildable plate    ║
 ║                                                    │                                                ║
 ║       ┌──────────────────────────────────────────────────────────────────────────────────────┐    ║
 ║       │  SHARED ENGINE  generateDeterministicLayouts  runDeterministicLayout.ts:86  (L2)        │    ║
 ║       │  SAME function the apartment calls — see §1–§10 for the full pipeline:                  │    ║
 ║       │   P1 shell→rects · P2 bubble graph + area alloc (§ENVELOPE-FIT-GROWTH OFF for house)    │    ║
 ║       │   · P3 squarify subdivide + corridor spine · dimensional gate · P4 walls/doors          │    ║
 ║       │   · P5 LayoutGraph · topology gate (§ROOM-OVERLAP-HARD · §FRONTAGE-RECTIFY-FRAME)        │    ║
 ║       │   · P6/P7 21-axis ObjectiveVector · Pareto+weighted rank · P9 emit (+ §STAIR-ROOM-TYPE  │    ║
 ║       │     mints a named `stair` cell at the keep-out)                                          │    ║
 ║       │  INJECTED: validateHouseStorey  houseEnvelope.ts:120 (envelope gate keyed on FULL       │    ║
 ║       │  programme, not bedroom count) + keepOutRectsWorld (stair carve)                         │    ║
 ║       └──────────────────────────────────────────────────────────────────────────────────────┘    ║
 ║                                                    │  ScoredLayoutOption[] per storey               ║
 ║   (d) assembleHouse :762  StairCore per adjacent pair (flights rotated BACK to world :802)          ║
 ║   (e)               SlabVoid on every NON-ground slab :833                                           ║
 ║   (f)               RoofDescriptor over top storey, §ROOF-CAP-ELEVATION :847                         ║
 ╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
                                        │  HouseLayoutResult { storeys[], perStoreyLayout[], stairs[], voids[], roof }
                                        ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  EDITOR EXECUTOR — HouseLayoutExecutor.ts:216 execute()                          (L5 apps/editor)    │
 │  (a) mint upper levels + dedicated Roof level (AddLevelCommand)                  :261 / §ROOF-LEVEL  │
 │  (b) generateHouseLayout / …Options with levelIdForStorey → REAL editor ids      :314-332            │
 │  per-storey shell:  GROUND = drawn shell (skipExteriorWalls)                                          │
 │                     UPPER  = minted explicit perimeter  _buildPerimeterShell  (§PERIMETER-SHELL)     │
 │       └ §GROUND-ENGINE-PERIMETER :527 (weld SKIP when on-ring) / §UPPER-SHELL-WELD :589 (rotated)    │
 │  buildLayoutCommands(option) :479  → LayoutCommandSet (pure ai-host core, SHARED with apartment)     │
 │  ── ONE batchCoordinator.runBatch :799 (one undo, skipRedetectRooms) ──                              │
 │     0 upper perimeters → 0.5 §WALL-SLAB-CONTINUITY ground-wall bump → 1 partitions → 2 slabs         │
 │     → 3 stairs (computeStairFootprintRect; autoCreateOpening punches the §VOID) → 4 roof             │
 │       roof: §ROOF-CONCAVE :1889 (hip is convex-only → L/T/U degrade to flat)                         │
 │  _finishOpenings(perStorey, entranceDoor) :896  DEFERRED 2nd batch (walls must exist first):         │
 │       wall.createOpening (doors+windows, C15 cascade) · door/window.batch.create · boundaries        │
 │       + §A.21.D29 ground entrance door (resolveEntranceDoor) · final room redetect across storeys    │
 │  §DIAG-LEVELS :897 (live vs intended wall count per level) · §FLR-VIEWS/§ROOF-VIEW plan views        │
 └───────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                      │  emit 'house.layout-executed'  →  POST-GEN chain
                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  POST-GEN — runHousePostGenChain.ts:170                                          (L5 apps/editor)    │
 │  per storey, IN SEQUENCE (setActiveLevel → unchanged per-stage executors resolve it):                │
 │     room detect+NAME (nameDetectedRooms; §ROOM-NAME-BIJECTIVE + §STAIR-VOID-EXCLUDE on the stair)    │
 │     → floor (§FLOOR-INNER-FACE inset) + ceiling  →  furnish  →  light   (await *.layout-executed)    │
 │  beginHouseFanout guard suppresses the apartment cascade so stages don't double-fire :185            │
 └───────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  DERIVED — Living Graph / UBG  is a PROJECTION of the committed result, not an input (ADR-0061).     │
 │  Rooms/walls/doors/stairs become graph nodes/edges read-only-derived from the stores post-commit.   │
 └───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Frame boundary (read this twice).** The `§PRINCIPAL-AXIS` rotation
(`houseOrchestrator.ts:483-499`, mirroring `runDeterministicLayout.ts:122-149`) is the single place
world coordinates become layout coordinates. The stair core is *reserved* in the layout frame
(`stairCore.ts`), its flight directions are *resolved* in the layout frame then rotated **back** to
world (`resolveFlightPlans`, `houseOrchestrator.ts:57-85`), and `containStairCoreUpstream` solves
containment in the **world** frame (the frame the executor ships in) and carries the world offset on
`StairCore.containOffsetWorld`. On an axis-aligned plate the angle is 0 and every transform is the
identity — the apartment / rectilinear path is byte-identical.

### HE.2 — The orchestration sequence (apartment vs house)

**(a) Single plate vs storey loop.** The apartment has **no orchestrator**: the editor calls
`generateDeterministicLayouts` once for the active level and commits (one plate, one level, no stair,
no roof). The house is the **same engine wrapped in a storey loop** — `enumeratePerStorey`
(`houseOrchestrator.ts:467`) iterates `allocateProgramToStoreys`' output and calls the engine once
per storey, then `assembleHouse` (`:762`) stitches the storeys with the multi-storey spine. The
genuinely-additional things the house adds are exactly three (`houseOrchestrator.ts:1-13`, H0):

1. a **vertically-aligned stair core** — the same XZ rect on every storey (`reserveStairCoreShaped`),
2. **per-storey `levelId` + elevation stamping** — the apartment stamps ONE level, the house N,
3. **a stairwell void on every non-ground slab + a roof cap** (`assembleHouse` (e)/(f)).

**(b) The two compensating heuristics** (NOT new spine — they exist only because the house feeds the
engine a *footprint-derived* program + a *pre-drawn* ground shell, see §8.4):

- **Ground-shell weld** — the drawn ground shell is mitred/raised by the editor, so its post-miter
  centrelines can drift past the room-detection node grid from where the engine tiled the partitions.
  `§GROUND-ENGINE-PERIMETER` (`HouseLayoutExecutor.ts:527`, `_groundShellOnEnginePerimeter:1091`)
  SKIPS the weld when the shell is provably still on the engine ring, else falls back to
  `_weldGroundPartitions`. Its sibling `§UPPER-SHELL-WELD` (`:589`) welds rotated-plate upper
  partitions onto the minted perimeter.
- **Parallel program sizer** — `enrichStoreyProgramToPlate` (`houseProgramFloor.ts:197`) raises a
  sparse captured brief to a full house floor sized to its plate (`growBedrooms` for the private
  upper level / single-storey; `growGroundRooms` for a multi-storey ground), and `§HOUSE-MAX-CAP` /
  `§AREA-AGREEMENT` (`houseOrchestrator.ts:709-714`) cap the subdivision budget so a sparse oversize
  plate doesn't balloon one room. The apartment never calls either.

Both are cross-referenced in **§8.4** ("Why the apartment generator beats the house"). The seam stays
one shape: the engine returns a `LayoutOption`/`HouseLayoutResult`; the executor calls the **same**
`buildLayoutCommands` and the **same** batch verbs for both apartment and house.

### HE.3 — Per-storey data-flow diagram (the world/layout transforms + §DIAG-* checkpoints)

```text
  ShellAnalysis (WORLD m)           StoreyProgram (full floor)
  perimeter + netAreaM2                allocateProgramToStoreys → enrichStoreyProgramToPlate
        │                                          │
        ▼                                          ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  rotate WORLD → LAYOUT frame   (−principalAxisRad about pivot)    │  §PRINCIPAL-AXIS
  └─────────────────────────────────────────────────────────────────┘
        │                                          │
        │  footprintLayout                         │  storeyShell.netAreaM2 −= stairCoreArea
        ▼                                          ▼
  reserve stair core (LAYOUT)  ──►  containStairCoreUpstream  ──►  keepOutRectsWorld (WORLD AABB)
        │  §DIAG-STAIR-RESERVE          │  §DIAG-STAIR-CONTAIN-UPSTREAM + §DIAG-STAIR-RULE
        │                              ▼
        │                    ┌──────────────────────────────────────────────┐
        └───────────────────►│  generateDeterministicLayouts (LAYOUT frame)  │  §DIAG-STOREY (i, role,
                             │  P1..P7 → rank → P9 emitGeometry              │   usable/presented area)
                             │  + validateHouseStorey + keepOutRectsWorld    │
                             └──────────────────────────────────────────────┘
                                              │  rotate LAYOUT → WORLD on emit (+principalAxisRad)
                                              ▼
                                   ScoredLayoutOption (WORLD mm)  → assembleHouse → HouseLayoutResult
                                              │
        ── EDITOR EXECUTOR (WORLD m) ─────────┼────────────────────────────────────────────────────
                                              ▼
   buildLayoutCommands(option)  →  LayoutCommandSet      §DIAG-SHAPE (plate class) · §DIAG-STAIR
        │  ground: drawn shell  ·  upper: minted perimeter (_buildPerimeterShell)
        │  weld decision: §GROUND-ENGINE-PERIMETER / §UPPER-SHELL-WELD   §DIAG-SEAL (open-seam ≥0.30m)
        ▼
   runBatch: perimeters → §WALL-SLAB-CONTINUITY → partitions → slabs → stairs(§VOID) → roof
        │  _finishOpenings: doors/windows + §A.21.D29 entrance door     §DIAG-LEVELS · §DIAG-ROOMS
        ▼
   FINAL room redetect  →  detected rooms (per storey)  →  POST-GEN (name+§ROOM-NAME-BIJECTIVE
                                                            +§STAIR-VOID-EXCLUDE → floor/ceiling
                                                            (§FLOOR-INNER-FACE) → furnish → light)
```

The `§DIAG-*` checkpoints are the founder's debugging surface (full catalogue in §9.5): the reserve
(`§DIAG-STAIR-RESERVE`), the upstream containment + the four rule verdicts (`§DIAG-STAIR-CONTAIN-UPSTREAM`,
`§DIAG-STAIR-RULE`, `houseOrchestrator.ts:404-452`), the per-storey area reconciliation (`§DIAG-STOREY`,
`:722`), the plate classifier (`§DIAG-SHAPE`, `HouseLayoutExecutor.ts:249`), the world-containment of
the shipped stair (`§DIAG-STAIR`, `:365`), the per-endpoint seal forensics (`§DIAG-SEAL`, `:628`), the
glazing/access summary (`§DIAG-ROOMS`, `:714`), and the level-distribution audit (`§DIAG-LEVELS`, `:897`).

### HE.4 — Where the recently-shipped mechanisms sit on the flow

(Each is detailed in **§9.6**; this is the map.)

| Mechanism | Where on the flow | Anchor |
|---|---|---|
| `§STAIR-ROOM-TYPE` | engine P9 mints a named `stair` cell at the keep-out (so the modal draws it + nothing tiles in) | `programRules.ts:421/853` · `subdivide.ts:190` · `roomDimensions.ts:79` |
| `§HALL-SINGLETON` | orchestrator (a) — one entrance hall on ground only | `storeyAllocation.ts:69/181` |
| `§ENVELOPE-FIT-GROWTH` | engine P2 area alloc; **OFF for house** (house sizes via its own density) | `bubbleGraph.ts:160` · `enumerate.ts:318/326` |
| `§ROOM-OVERLAP-HARD` | engine topology gate — hard-reject any interior floor overlap | `enumerate.ts:252` · `validateNoRoomOverlap.ts` |
| `§FRONTAGE-RECTIFY-FRAME` | engine topology gate — rotated-plate frontage false-negative cure | `enumerate.ts:575` |
| `§PARTITION-SHELL-INNER-FACE` | post-commit wall resolution — partition butts the shell INNER face | `geometry-wall/WallJoinResolver.ts:205-356` |
| `§FLOOR-INNER-FACE` | post-gen floor — inset room polygon to inner wall faces | `CreateFloorsByRoomTypeCommand.ts:110-295` · `RoomPolygonUtils.insetPolygonToInnerFaces` |
| `§ROOF-CONCAVE` | executor step 4 — hip is convex-only → L/T/U degrade to flat | `HouseLayoutExecutor.ts:1889/1960` |
| `§STAIR-VOID-EXCLUDE` | post-gen naming — collapse the phantom void-cell stair rooms | `nameDetectedRooms.ts:95/211` · `resolveStairRooms.ts` |
| `§ROOM-NAME-BIJECTIVE` | post-gen naming — one detected room ↔ one option room (no duplicate "Stair") | `matchDetectedRooms.ts` · `nameDetectedRooms.ts:83` |
| `§STAIR-CONTAIN-UPSTREAM` | orchestrator (b') — the §8.5 stair-desync cure | `houseOrchestrator.ts:355/563` |
| `§PRINCIPAL-AXIS` | the world↔layout frame boundary (whole flow) | `houseOrchestrator.ts:483` · `runDeterministicLayout.ts:116` |

### HE.5 — Governance + file map for the house

**Pure orchestration core — `packages/ai-host/src/workflows/houseLayout/` (L2):**

| File | Role |
|---|---|
| `houseOrchestrator.ts` | the storey loop: `generateHouseLayout:190` / `generateHouseLayoutOptions:247` → `enumeratePerStorey:467` → `assembleHouse:762`; `containStairCoreUpstream:355`; `resolveFlightPlans:57` |
| `storeyAllocation.ts` | `allocateProgramToStoreys:44` (split brief; §HALL-SINGLETON); `storeyAcousticProfiles:233` |
| `houseProgramFloor.ts` | `enrichStoreyProgramToPlate:197` (the parallel program sizer) |
| `houseEnvelope.ts` | `validateHouseStorey:120` + `houseStoreyBand:100` (the injected house-aware envelope gate) |
| `stairCore.ts` / `stairPosition.ts` | `reserveStairCoreShaped:275` + `chooseStairCorePosition:525` (corner placement, I/L/U) |
| `stairContainment.ts` / `stairWorldFootprint.ts` | `solveStairContainmentWorld` + `computeStairWorldFootprint` (the shared world footprint) |
| `houseVertical.ts` | `roofBaseElevationM` / `roofBaseOffsetM` (§ROOF-CAP-ELEVATION) |
| `types.ts` | `HouseLayoutResult`, `StairCore`, `SlabVoid`, `RoofDescriptor`, `StoreyPlate` (see H1) |
| `buildingElevations.ts`, `houseVertical.ts`, `documentationSet.ts`, `roomDocumentation.ts` | elevations + auto-documentation helpers |

**Editor seam — `apps/editor/src/ui/house-layout/` (L5):**

| File | Role |
|---|---|
| `houseLayoutTrigger.ts:31` | console trigger (`installHouseLayoutConsoleTrigger`) |
| `HouseLayoutController.ts:109` | `request()` → modal → pick; §MODAL-DYNAMIC live regenerate |
| `HouseLayoutModal.ts` / `houseModalHtml.ts` / `houseCardModel.ts` | the "Choose a house layout" modal |
| `HouseLayoutExecutor.ts:216` | the executor: level mint, build, ONE batch, `_finishOpenings:896` |
| `runHousePostGenChain.ts:170` | per-storey name → floor/ceiling → furnish → light |
| `houseFromBoundary.ts:77` | `generateHouseFromBoundary` (C19 boundary → shell → generate) |
| `houseShellWalls.ts` / `houseStairRects.ts` / `houseStairVoids.ts` / `houseFanoutGuard.ts` | per-build state stores for the §DIAG-* + void/finish passes |
| `resolveStairRooms.ts` / `houseExecDiagnostics.ts` | §STAIR-VOID-EXCLUDE pure resolver + exec diagnostics |

**Contracts / ADRs / SPEC (governance, read before non-trivial change):**

- **ADR-0063** `docs/02-decisions/adrs/0063-house-generative-layout-doctrine.md` — the house doctrine
  (stair-as-room, hall-singleton, the storey-loop reuse).
- **ADR-0061** `docs/02-decisions/adrs/0061-building-graph-bidirectional-edit-substrate.md` — purity /
  determinism + the derived Living Graph as a projection.
- **ADR-0062 / ADR-0066** — the deterministic graph-solver + access-graph-first doctrines (the engine).
- **C53** `docs/02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md` — the generative
  layout engine architecture contract.
- **C19** `docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` — the drawn parcel boundary / site
  model that becomes the INPUT shell.
- **C50** `docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md` — the typology pipeline (house is one
  typology pack).
- **SPEC** `docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md` — the Casa Unifamiliar typology
  spec (the §-tag rationale `A.21.Dxx`, the stages H0–H11 mirror).

> **Drill-down:** for the line-by-line house reference (output shapes, stair geometry, the envelope
> reconciliation, the per-finding audit), read **H0–H11** + **AUDIT FINDINGS** below. For the shared
> engine internals every storey runs, read **§1–§10**. For the stair root-cause narrative, **§8.4–§8.5**.

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
| `tgl/objectives.ts` | **P7.** The 21-axis `ObjectiveVector` (`OBJECTIVE_AXES`, `objectives.ts:309`) + `computeObjectives`. |
| `tgl/envDrivers.ts` | E.1 priority bands + E.2 solar / E.3 acoustic / E.4 ventilation objective scorers. |
| `tgl/emitGeometry.ts` | **P9.** `LayoutGraph` → `LayoutOption` (mm), incl. the per-room window emission call. |
| `rules/programRules.ts` | **The normative room DB.** `ROOM_RULES`, `doorAllowedBetween`, `maxDoorsFor`, `isOpenPlanEligible`, `preferenceBetween`, `MIN_DOOR_WIDTH_BY_TYPE`/`§DOOR-MINIMUMS`. |
| `dimensions/*` | Dimensional validators: `validateRoomShape`, `validateRoomFit`, `validateFrontage`, `validateApartmentEnvelope`, kitchen-triangle, corridor-width, daylight, hierarchy. |
| `topology/*` | Topology validators: mandatory/forbidden adjacency, wet-cluster, acoustic-zoning, circulation sequence/connectivity. |
| `windowEmission/emitWindows.ts` | Per-room window placement: multi-window distribution, `§WINDOW-CORNER-SETBACK`, door/junction avoidance, climate sizing. |
| `windowEmission/shellWallMatch.ts` | Maps engine windows onto pre-existing shell walls; `cornerSetbackForWall`, de-overlap, `§WINDOW-MANDATORY-RESCUE`/`§WINDOW-DESIRED`, `§DIAG-WINDOW-RULE`, `§DIAG-PARTY-WALL` blind-façade suppression. |
| `entranceDoor/entranceDoor.ts` | **House front door** (`§A.21.D29`). `resolveEntranceDoor` — pick the hall's exterior shell wall, centre + clamp a 1.0 m door clear of windows (`findClearDoorOffset`, `§ENTRANCE-DOOR-CLEAR`). |
| `topology/validateNoRoomOverlap.ts` | `§ROOM-OVERLAP-HARD` detector — pairwise interior floor-area overlap (the 4th hard-gate rule). |
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
           P7 computeObjectives         21-axis vector          [objectives.ts + envDrivers.ts]
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
   world (`rotateOptionBack`, line 52), scores it with `scoreLayout`, and pins the
   objective axes onto `score.breakdown` for the modal (lines 257–277).

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
9. `computeSpaceSyntax` (P6) + `computeObjectives` (P7) → the 21-axis vector.

It returns a `TglCandidate` carrying `objectives`, `weighted`, `compromises`,
`connected`, `shapeAdmissible`, `topologyAdmissible`, `circulationRouted`,
`droppedRooms`, `boundaries` (`enumerate.ts:389`).

### 2.3 Pareto dominance + weighted-sum ranking

- **Dominance** (`dominates`, `enumerate.ts:495`): `a` dominates `b` iff `a ≥ b` on every
  axis (EPS-tolerant, rounded to 1e-6) and `>` on at least one.
- **Pareto ranks** (`assignParetoRanks`, line 506): repeatedly peel the non-dominated
  front (rank 0, then 1, …). No evolution — pure non-dominated sorting.
- **Weighted sum** (`weightedSum`, line 681): maps the 4 user weights onto the 21 axes
  (the rest carry fixed weights — `regularity 0.5`, `shapeQuality 0.6`,
  `topologyQuality 0.6`, etc.), applies the E.1 priority band multiplier
  (`priorityMultiplier`, lines 488), normalises, and sums. Used as the **secondary
  tie-break within a Pareto rank**.
- Final sort (`enumerate.ts:616`): `rank asc → weighted desc → strategy string` (stable).
- **§TOPO-HARD-REJECT** (Stage 5 — see §5.4.1): a **new top-level tier split** runs the whole
  tier fallback over the **hard-valid** candidates first (no windowless habitable room / no
  land-locked room / no private-room-off-hall / **no room-overlap**). Hard-invalid candidates rank
  **below** every hard-valid one; the pool is never emptied (loud `§TOPO-HARD-REJECT-ALL` if all 8
  fail). The four-rule predicate is `{window, circulation, privacy, overlap}`.

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

**`§RECTIFY-SHELL-PROJECT` — the by-construction cure for the rotated/sheared-plate
room-merge (2026-06-09, `rectDecomposition.ts` `projectPartitionEndpointsToShell`, line ~136;
wired `runDeterministicLayout.ts` after `emitGeometry`, before `rotateOptionBack`).** The
"only the partition grid is rectified" trade-off had a hidden cost: because the interior is
tiled inside the **bbox** of the rotated sheared quad, a partition endpoint that should
**terminate on the perimeter** lands on the **bbox edge** — but the executor's perimeter ring
(`HouseLayoutExecutor._buildPerimeterShell`, built from `storey.footprint === shell.perimeter`)
is the **real sheared shell**, which sits inside the bbox by up to **~1.9–2.1 m** on a
freehand quad (measured: a 0.75-fill quad diverges **2.12 m** at a corner; a 0.95-fill quad
~0.37 m). The 0.60 m weld (`§SHELL-SNAP-WIDEN`) cannot bridge that → an open seam →
RoomDetection floods → **every interior room merges into one** (the founder's recurring house
defect). The cure runs in the **same rotated frame the partitions were tiled in, before the
rotate-back**: for every **interior** partition endpoint lying on a rectified-bbox edge, cast
along that edge's perpendicular onto the **real** shell polygon and move the endpoint there
(keep x for a top/bottom edge, keep z for a left/right edge — so a vertical partition stays
vertical and meets the perimeter at the same plan position). The interior keeps its clean
rectangular tiling; only the perimeter contacts move onto the true ring, so the partitions
meet the executor ring **within the 20 mm RoomDetection node grid by construction** and the
weld degrades to a safety net. **Safety:** when the shell does NOT rectify (axis-aligned
rectangle, L/U/T, >4 vertices, or sub-fill quad), `projectPartitionEndpointsToShell` returns
the walls **unchanged (same reference)** → byte-identical for the apartment + every
rectilinear plate; external/perimeter walls are never moved (they are dropped by
`skipExteriorWalls` and moving them would shift already-emitted window offsets). Proven by
`rectShellProject.test.ts` (7 unit tests) + `tglRunDeterministicLayout.test.ts` (the
by-construction ≤20 mm property on a sheared quad + an axis-aligned byte-identical assertion).

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

#### 4.1.1 The full `RoomType` table — every room + its governing rule

The `RoomType` union has **14 members** (incl. `stair`, house-only). `ROOM_RULES`
(`programRules.ts:246`) is `Record<RoomType, RoomRule>`, so adding a member fails to compile until
its rule is authored. Areas are UK Building-Regs / HQI minima (each carries its `DB-NNN` constraint
id from SPEC-LAYOUT-CONSTRAINT-DATABASE). `area%` = the `§AREA-FRACTIONS` `min/max` share clamps;
`win` = `windowMandatory`; `front` = frontage preference; `cap` = `maxDoors`.

| type | privacy | front | win | areaWt | minM² / minShort | area% (min/max) | accessFrom | cap |
|---|---|---|---|---|---|---|---|---|
| `living` | public | required | ✓ | 1.7 | 14 / 3.2 m | 15% / 32% | hall, corridor, kitchen, dining | ∞ |
| `kitchen` | public | required | ✓ | 0.95 | 6 / 1.8 m | 7% / 16% | corridor, living, dining, utility | ∞ |
| `dining` | public | preferred | — | 0.9 | 9 / 2.4 m | — / 16% | corridor, living, kitchen | ∞ |
| `hall` | circulation | **required** | — | 0.5 | 2.5 / 1.2 m | — | living, corridor | ∞ |
| `corridor` | circulation | none | — | 0.85 | 0 / 1.0 m | — / 10% | hall, living, kitchen, dining, bedroom, master, bathroom, study, utility | ∞ |
| `stair` *(house-only)* | circulation | none | — | 0.4 | 4.0 / 2.0 m | — | corridor, hall | 2 |
| `master` | private | required | ✓ | 1.3 | 12 / 2.75 m | — / 20% | corridor, living, dining, ensuite | 2 |
| `bedroom` | private | required | ✓ | 1.0 | 11.5 / 2.6 m | — / 16% | corridor, living, dining | **1** |
| `study` | private | preferred | — | 0.85 | 5 / 2.0 m | — | corridor, living | 1 |
| `bathroom` | private | preferred | — | 0.45 | 5 / 1.8 m | 5% / — | corridor | 1 |
| `ensuite` | private | preferred | — | 0.4 | 3.5 / 1.5 m | — | master | 1 |
| `wc` | private | preferred | — | 0.25 | 1.2 / 0.9 m | — | corridor, hall | 1 |
| `utility` | service | none | — | 0.4 | 3.5 / 1.5 m | — | corridor, kitchen | 1 |

Notes the table can't show: the `corridor` carries the `§CORRIDOR-PHYSIOGNOMY` band
(`maxShortSideM 1.2`, `minLongSideM 2.0`, `maxLongSideM 6.0` — but the long axis is NEVER trimmed
below the served-room span, the `§EVERY-ROOM-ACCESS` invariant); `living`/`kitchen`/`dining` carry
the `§SOCIAL-CAVERN-CAP` `maxAreaFrac` ceiling; the wet rooms were all promoted `frontage 'none' →
'preferred'` (A.21.D55, "daylight in every room") so an interior bath is a SOFT penalty, never a
hard reject. `bedroom.maxDoors = 1` and `bedroom.accessFrom` excluding `bedroom` is what enforces
"no bedroom reachable only through another bedroom".

A representative entry (the `bedroom` rule — `programRules.ts:494`):

```ts
bedroom: {
    type: 'bedroom', occupancy: 'bedroom', privacy: 'private',
    acousticRole: 'receiver', frontage: 'required',
    // DB-026 double bedroom 11.5 m² (Building Regs); DB-028 min clear width 2.6 m.
    areaWeight: 1.0, minAreaM2: 11.5, minShortSideM: 2.6, needsWindow: true, windowMandatory: true,
    maxAreaFrac: 0.16,                          // §AREA-FRACTIONS — ≤16% each (spec ceiling)
    accessFrom: ['corridor', 'living', 'dining'], maxDoors: 1,   // never another bedroom / the hall
    adjacencyPreference: { corridor: 1.0, living: 0.4, dining: 0.3 },
    requiredFurniture: ['bed', 'bedside_table', 'wardrobe', 'lamp'],
    optionalFurniture: ['curtain_rod', 'curtain_panel'], requiredFixtures: [],
    furnitureSpec: [ /* door-vector-aware: bed opposite the door on a solid wall, … */ ],
    description: 'Bedroom. Exactly one door, onto a corridor / living / dining. …',
},
```

**Key predicates** beyond `doorAllowedBetween` / `maxDoorsFor` / `isOpenPlanEligible`:
`windowMandatoryFor(type)` (`programRules.ts:681`) — the LEGAL hard-window set
(living/kitchen/master/bedroom) that drives the §TOPO-HARD-REJECT `W` rule; `windowDesiredFor(type)`
(`:702`) — the WIDER "every room wants a window" set (adds dining/study + the wet rooms) that drives
the §WINDOW-MANDATORY-RESCUE protection and `§DIAG-WINDOW-RULE`; `isPrivate(type)` (`:708`) — drives
the privacy `P` rule.

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

#### 5.4.1 §TOPO-HARD-REJECT — the Stage-5 HARD topology gate

The four-flag `clean`/`legal`/`routed` tiering (§2.3) is **too permissive** on an
elongated/rotated plate: when every candidate fails the shape gate, the fallback could ship a
`circRouted=false` / `topologyQuality=0.00` layout (the founder's console audit — merged-name
rooms + windowless bedrooms). The **§TOPO-HARD-REJECT** gate adds a **new top-level tier split**
above the existing tiers: a candidate is **hard-invalid** if it violates ANY of **four**
architectural rules, and hard-invalid candidates rank **below every hard-valid one** so the
ranker prefers a better one of the 8 strategies. (Originally three rules; `O` overlap was added
2026-06-10 — see the gate code in §6 below.)

The four rules (each REUSES a signal already computed in `buildCandidate` — no new geometry
pass; predicate in `enumerate.ts:evaluateHardTopology`, internal/pure, ADR-0061):

1. **W (window)** — a `windowMandatory` room (bedroom/master/living/kitchen/dining per
   `ROOM_RULES`) is **fully interior** ⇒ no perimeter wall to host a window ⇒ ZERO windows.
   Reuses the **`frontage` validator's hard findings** (§5.3 `validateFrontage`), intersected
   with `windowMandatoryFor`. (§WINDOW-MANDATORY-RESCUE already reduces this; the gate catches
   the residual.)
2. **C (circulation)** — any room has NO door onto circulation. Reuses the
   `unroutedToCirculationRoomIds` / §SEALED-ROOMS signal (`circulationRouted === false`).
3. **P (privacy)** — a **private room opens DIRECTLY off the entrance hall** (a privacy breach;
   `hall.accessFrom` lists only `living`/`corridor`). Scans the realised door set for a
   `hall`↔private pair.
4. **O (overlap)** — `§ROOM-OVERLAP-HARD` (2026-06-10): two rooms claim the SAME interior floor
   (`Area(R_i ∩ R_j) > ε`). Rooms may touch along shared walls only; an interior overlap is
   invalid. Reuses `validateNoRoomOverlap(...).ok === false` (already computed for the
   `§DIAG-ROOM-OVERLAP` line). Makes a non-overlapping strategy rank above an overlapping one.

**Safe floor (CRITICAL — "prefer hard-valid, never crash"):** the existing 5/7-tier fallback is
factored into `selectTier(cands)` and run over the **hard-valid subset first**; only when EVERY
one of the 8 strategies is hard-invalid (a genuinely hard plate/program) does it fall through to
the same fallback over **all** candidates, emitting a loud **`§TOPO-HARD-REJECT-ALL`** warning that
names the failing rule(s). The pool is **NEVER emptied**. Byte-identical when at least one strategy
is hard-valid (the common case) — so no passing test regresses. Per-candidate decision logged as
`§DIAG-TOPO-GATE strategy=<s> hardValid=<bool> failed=[<rules>]`; the winner carries `hardValid` +
`hardFailedRules` on the `TglCandidate` and in `§DIAG-WINNER`.

**4th rule — `O` (overlap), 2026-06-10.** `§ROOM-OVERLAP-HARD` adds a fourth hard rule: two rooms'
interior floor areas overlap (`Area(R_i ∩ R_j) > ε`). The `hardFailedRules` type is therefore
`('window' | 'circulation' | 'privacy' | 'overlap')[]`. The pure predicate REUSES already-computed
signals — no new geometry pass (`enumerate.ts:205-261`):

```ts
// enumerate.ts:216-258 (abridged) — the 4-rule hard topology predicate (internal, pure, ADR-0061)
const failed: ('window'|'circulation'|'privacy'|'overlap')[] = [];
// W — a windowMandatory room with no perimeter frontage (reuses validateFrontage hard findings)
if (frontageHardRoomIds.some(id => windowMandatoryFor(typeById.get(id) ?? ''))) failed.push('window');
// C — any room land-locked from circulation (== !circulationRouted)
if (unroutedToCirculationRoomIds.length > 0) failed.push('circulation');
// P — a private room opens DIRECTLY off the entrance hall (read the realised door set)
for (const o of doorOpenings) { /* … a hall↔private door → */ failed.push('privacy'); break; }
// O — §ROOM-OVERLAP-HARD: any pairwise interior floor overlap
if (hasRoomOverlap) failed.push('overlap');
```

**The ranking** (`enumerate.ts:908-974`): the existing clean→legal→routed fallback is factored into
`selectTier(cands)` and run over the **hard-valid subset first**; only if every strategy is
hard-invalid does it run over all candidates (with the loud `§TOPO-HARD-REJECT-ALL`). Then within the
tier, prefer fewest dropped rooms, then Pareto-rank, then weighted-sum, stable tie-break:

```ts
// enumerate.ts:941-974 (abridged) — hard-split → tier → fewest-drops → Pareto → weighted → stable
const hardValidCands = candidates.filter(c => c.hardValid);
const allHardInvalid = hardValidCands.length === 0;
let pool = selectTier(allHardInvalid ? candidates : hardValidCands);   // never emptied
// … §FEASIBILITY-ALLOC: narrow to the fewest-dropped-rooms subset (never empties) …
const ranked = assignParetoRanks(pool).sort((a, b) =>
    a.rank - b.rank ||                 // 1° exact Pareto front (assignParetoRanks, :799)
    b.weighted - a.weighted ||         // 2° weighted-sum tie-break (weightedSum, :681)
    (a.strategy < b.strategy ? -1 : a.strategy > b.strategy ? 1 : 0));  // 3° stable strategy string
return ranked.slice(0, Math.max(1, input.count));
```

`dominates` (`enumerate.ts:788`) is EPS-tolerant (rounded to 1e-6): `a` dominates `b` iff `a ≥ b` on
**every** one of the 21 axes and `>` on at least one. `assignParetoRanks` (`:799`) peels non-dominated
fronts (rank 0, 1, …) — pure non-dominated sorting, **no evolution**.

**Both apartment + house use this gate** (one engine). Verified on a 45°-rotated 2-storey house
(`__tests__/houseLayoutInvariants.test.ts`): stair corner-not-central (I1), no merged-name rooms
(I3), no silently-dropped rooms (I4) — all PASS today.

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
- **De-overlap** (`deOverlapShellWindowItems`): two rooms fronting the same shell wall
  can resolve to overlapping spans (each room de-overlaps only its own walls); the later one
  is dropped deliberately up front (`WINDOW_GAP_M = 0.1`) so `wall.createOpening` never
  silently rejects it. Priority-aware: a **rescued** mandatory window (below) claims the wall
  first, then habitable rooms, then wet/service (`§WINDOW-HABITABLE-PRIORITY`).
- **Full-span-or-drop:** `§WINDOW-SHELL-CLAMP` (width clamped to fit the host wall),
  `§WINDOW-CORNER-FIT`/`§WINDOW-CORNER-SPAN`/`§WINDOW-IN-SHELL-FINAL` (the full span must sit
  inside `[setback, len−setback]`; if no clearance-respecting position exists, the window is
  **dropped**, never slammed to a corner).
- **A `windowMandatory` room keeps ≥ 1 window (rescue fallback)** (`§WINDOW-MANDATORY-RESCUE`,
  A.21.D60, 2026-06-09): when a window-mandatory room (`bedroom`/`master`/`living`/`kitchen`,
  per `windowMandatoryFor` in `programRules.ts`) would otherwise resolve to **zero** kept
  windows — because every emitted window was dropped by `cornerFitDrop` / `noShellMatch` /
  de-overlap — `resolveAllShellWindows` runs a **last-resort relaxed retry** to retain ONE
  window. The relaxations escalate in order: **(a)** reduce the corner setback toward the bare
  clearance (`RESCUE_CORNER_SETBACK_M = 0.1 m`, never the exact corner); **(b)** accept a
  smaller window (shrink toward `MIN_WINDOW_M`); **(c)** widen the shell-match tolerance (angle
  30°→45°, perp 1 m→1.6 m). A rescued window may pre-empt only a **lower-priority wet/service**
  conflicter on a shared wall — it never displaces another habitable room (that case surfaces
  as `NO-FRONTAGE`). The fallback is the **only** behavioural change: when a mandatory room
  already keeps ≥ 1 window the path is **byte-identical** to before. A room with literally no
  external frontage stays windowless but is **surfaced** (`§WINDOW-MANDATORY-RESCUE … NO-FRONTAGE`),
  not silently shipped. Pure + deterministic (ADR-0061; no `Date.now`/`Math.random`).

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

#### 8.2.1 `§STAIR-DEFAULT-BIAS` — always supply an aspect bias (Fix 1, SHIPPED 2026-06-09)

The cost terms above (`PERIMETER_PREFERENCE`, `FRAGMENT_PENALTY`) only fire **when an
`AspectBias` is supplied** to `chooseStairCorePosition` (`aspect` parameter). Previously the
orchestrator (`houseOrchestrator.ts`) built `stairSolar` **only when `opts.solar` was present**;
on the common modal path (no captured latitude) it passed `undefined`, so the chooser ran the
legacy **waste-only** path with neither term. On most plates the waste scorer alone already
corners the stair, but on plates where a `back` MID-EDGE candidate ties/beats a true CORNER by
waste — or where shell-containment culls thin the candidate set — the stair could land
mid-plate/mid-edge → the plate fractures into a 4-way picture-frame (no dominant rect) →
`§STAIR-OBSTACLE-CARVE` can't run the corridor spine → the private rooms merge into one blob
(the founder's *"Bedroom 2 / Bedroom 1 / Bathroom 101.8 m²"*).

**Fix (shipped):** `houseOrchestrator.ts` now **always** synthesises a `StairSolar` — when
`opts.solar` is absent it falls back to a deterministic Northern-hemisphere default
(`STAIR_DEFAULT_LAT_DEG = 45` → `equatorFacingDir` → `{x:0, y:1}`, back wall = best aspect). So
`aspectBiasFor` always returns a real bias → `PERIMETER_PREFERENCE` + `FRAGMENT_PENALTY` always
fire → the stair takes a back/side **CORNER**. `kind='central'` survives only as a genuine last
resort (a tiny plate with no fitting perimeter candidate). Pure + deterministic (constant
direction; no Date/RNG). When `opts.solar` **is** present the bias is byte-identical to before.
This is the **TOPOLOGY-level** fix (more robust than the geometry weld). The
`§DIAG-STAIR-RESERVE` line (`houseOrchestrator.ts`) logs the reserve `kind` so a prod run proves
corner vs central.

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

## 8.4 WHY THE APARTMENT GENERATOR BEATS THE HOUSE

> Founder's question, verbatim: *"WHY is the apartment layout generator way better, providing
> better design than the house?"* The honest, source-grounded answer is below. Full audit:
> `docs/03-execution/plans/HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09.md`.

### 8.4.1 The headline: the room-quality ENGINE is 100% shared

The apartment is **not** better because it has a better subdivision engine. **There is only one
engine.** Per storey the house calls the *exact same* `generateDeterministicLayouts(...)`
(D-TGL) the apartment calls, the *exact same* `buildLayoutCommands(...)` + opening/door/boundary
batch commands the apartment executor uses, and the *exact same* `nameDetectedRooms` +
floor/ceiling/furnish/light chain
(audit §1, `HOUSE-APARTMENT-UNIFICATION-AUDIT-2026-06-09.md:14-45`). The side-by-side map (audit
§2) marks **SHARE** on every row that determines per-plate room maturity:
bubble graph, rect decomposition, squarify, subdivide, program rules, wall+door emission,
window emission, plan→commands, room detection, room naming.

So the house's lower quality comes **entirely from the editor-side multi-storey orchestration it
bolts on top of the shared engine** — three things, in order of impact:

### 8.4.2 (a) The STAIR — the apartment has none

The apartment is a single plate with **no stair, no stair keep-out, no stair containment**. The
house must reserve a vertically-aligned stair core, carve it out of every storey's buildable
region, and build a real stair body that must fit a (possibly rotated) shell. When that body
poked out (`§DIAG-STAIR cornersInShell=1/4`) it conflicted the perimeter and the partitions —
and, as §8.5 proves, the *containment* of that body was the dominant root-cause of the house's
"merged room" defect. **The containment is now resolved UPSTREAM (§8.5.4, `§STAIR-CONTAIN-
UPSTREAM`, 2026-06-09)** so the keep-out == the shipped footprint and the overlap can no longer
arise. This is **genuinely additional** (it must stay). (`houseLayout/houseOrchestrator.ts`
`containStairCoreUpstream`, `houseLayout/stairWorldFootprint.ts`,
`houseLayout/stairContainment.ts` `solveStairContainmentWorld`,
`HouseLayoutExecutor.ts` §STAIR-CONTAIN verification.)

### 8.4.3 (b) The ground-shell weld + the §GROUND-ENGINE-PERIMETER / §UPPER-SHELL-WELD reconciliation

The house's GROUND floor reuses the user's **pre-drawn, mitred, height-raised** shell that the
engine did not author, so partition endpoints don't land on the shell-wall centreline → the
`RoomDetectionEngine`'s 20 mm node grid never closes the loop →
`rooms_total=1` (`weldPartitionsToShell.ts:1-21`). The house papers over this with the fragile
geometric `weldPartitionsToShell` heuristic whose tolerance has been re-tuned **five times**
(`DEFAULT_PARTITION_WELD_M = 0.50`, `weldPartitionsToShell.ts:51-84`, §WJ-SKEW-1..4). The
2026-06-09 Stage-1 mitigation `§GROUND-ENGINE-PERIMETER` (`HouseLayoutExecutor.ts:434-494`)
tries to make the ground close like the upper storeys by checking whether the drawn shell is
still ON the engine footprint ring — if so it takes the bit-exact **ENGINE-PERIMETER path**
(`:489-494`), otherwise it falls back to the load-bearing **WELD-FALLBACK path** (`:496-503`).
The upper storeys have the sister `§UPPER-SHELL-WELD` (`HouseLayoutExecutor.ts:998-1040`,
`:548-553`). **The apartment executor has NO weld at all** — `ApartmentLayoutExecutor.ts` calls
`buildLayoutCommands` → batches, with no `weldPartitionsToShell` import (audit §3 Gap 1,
`:86-101`). The apartment is "just lucky": its small flat plate has small residuals and the weld
isn't even in its code path.

### 8.4.4 (c) The parallel per-storey program sizer can starve or over-pack

The apartment uses the engine's internal `scaleProgramToShell` (tuned for a small flat plate).
The house cannot: a sparse captured brief stretched across a 165 m² storey would make `squarify`
balloon one room to fill the plate (the founder's "165 m² Room 00-001"). So the house runs a
**parallel program sizer** — `enrichStoreyProgramToPlate` / `fillGroundPlate`
(`houseProgramFloor.ts:1-13`, `:184-262`) — plus the `houseStoreyBand` envelope
(`houseEnvelope.ts`) and the `houseOrchestrator.ts` `presentedArea` reconciliation
(`houseOrchestrator.ts:472-484`, §AREA-AGREEMENT). The audit names the failure mode this fork
introduces verbatim: capping the area *"shrinks the bubble-graph budget and starves the program,
forcing §FEASIBILITY-ALLOC to drop rooms on a plate that is actually big enough (the founder's
generic 'Room 00-00x' voids)"* (`houseOrchestrator.ts:472-478`, audit §3 Gap 2). So a
correctly-sized apartment path was forked into a house path that can **both** under-fill (giant
room) **and** over-pack (dropped rooms) depending on the area math.

### 8.4.5 The cure direction (audit §4–§6, recommendation — not yet code)

The cure is **not** "share the engine" (already done). It is *"reduce the house's extra
orchestration to the multi-storey spine, and make every per-storey plate identical to an
apartment plate."* The smallest highest-leverage slice (audit §5): make the GROUND storey use the
**engine-authored perimeter** the upper storeys already use (`_buildPerimeterShell`), so the
ground closes rooms exactly the way the upper storeys do, and delete the weld from the common
path. **KEEP** only the genuinely-additional spine: the storey loop, level minting, slab voids,
the roof, and the stair (whose own deeper cure is §8.5). The one-line answer to the founder
(audit §6): *"the house already uses the apartment's engine for every room; it 'looks less
mature' because of two compensating bolt-ons the apartment never needs (a fragile ground-floor
weld and a parallel program sizer) plus the genuinely-new stair."*

---

## 8.5 THE STAIR IS THE CIRCULATION ROOT-CAUSE

> Founder, verbatim: *"honestly and clearly it seems like the main issue is the STAIR — the
> circulation needs to be critically sound and perfectly orchestrated."* This section documents
> the **exact desync** the founder is hitting, grounded in a real production run, traced through
> source. It is the most important addition to this doc.

### 8.5.1 The real prod run

```
§DIAG-STAIR #0 … shape=U rect=2.0×2.8m rot=-41.3° centreWorld=(11.9,2.8) centreInShell=true cornersInShell=1/4
§DIAG-STAIR ⚠ stair #0 is NOT fully inside the shell (1/4 corners in)
§STAIR-CONTAIN-GATE interior-side nudge insufficient — contained toward shell centroid
§STAIR-CONTAIN nudged stair inward by (-1.50,-0.55)m to keep its footprint inside the shell
§STAIR-CONTAIN-GATE stair footprint fully contained (4/4 corners inside shell)
```

The engine reported a clean six-room plan for that level — `§DIAG-ROOMS L0: rooms=6 …` — yet the
editor shipped **one merged room**: *"Living Room / Bedroom 1 / Kitchen / Bathroom / Corridor
76.0 m²"*. Six designed rooms collapsed into one. The `§STAIR-CONTAIN nudged stair inward by
(-1.50,-0.55)m` line is the smoking gun.

### 8.5.2 The mechanism — position → keep-out → tile → nudge (the desync)

The defect is a **position desync between two stages that each use a *different* stair position**:

**Stage 1 — the engine reserves the core and carves the keep-out at the ORIGINAL position.**
`chooseStairCorePosition` (`stairPosition.ts:363`) picks the core's min-corner `(x,y)` in the
layout frame. The orchestrator turns **that** `core.rectMm` into a world-XZ keep-out:

```ts
// houseOrchestrator.ts:404-417  — keepOutRectsWorld is derived from core.rectMm (the ORIGINAL position)
const keepOutRectsWorld = coreRect
    ? (() => {
        const corners = [ /* the 4 corners of coreRect */ ]
            .map(c => principalAxisRad === 0 ? c : rotatePt(c, principalAxisRad, pivot));
        return [{ x0: min…, z0: min…, x1: max…, z1: max… }];
      })()
    : undefined;
```

That keep-out is threaded into the per-storey D-TGL call (`houseOrchestrator.ts:515`
`keepOutRectsWorld`). Inside the engine, `enumerate.ts` inflates it by `KEEPOUT_MARGIN_M = 0.05`
on every side and **subtracts it from the buildable rects** (`enumerate.ts:187-202`) via
`subtractRectsFromRects` (`rectDecomposition.ts:279`) **before** subdivide. So **all rooms are
tiled AROUND the stair at its ORIGINAL reserved position** — the partitions seal the rooms
precisely up to the edge of that original keep-out.

**Stage 2 — the editor nudges the SHIPPED stair body to a DIFFERENT position.** After the rooms
are already tiled, the editor `HouseLayoutExecutor` builds the actual rotated stair body, finds
its full footprint pokes out of the rotated shell (`cornersInShell=1/4`), and **moves the whole
body inward** to fit:

```ts
// HouseLayoutExecutor.ts:1297-1316  — §STAIR-CONTAIN: nudge the SHIPPED body AFTER the rooms were tiled
const off = computeInwardContainmentOffset(fp0XZ, shellPolyWorld, { x: inward.x, z: inward.z }, 0.1, 4.0);
containDx = off.dx; containDz = off.dz;
// … if the interior-side nudge failed, a SECOND attempt toward the shell centroid:
const off2 = computeInwardContainmentOffset(fp0XZ, shellPolyWorld, centroidDir, 0.05, 8.0);
// → console: §STAIR-CONTAIN nudged stair inward by (-1.50,-0.55)m …
```

`computeInwardContainmentOffset` (`stairContainment.ts:64-85`) steps the footprint inward until
every corner is inside the shell — here by **(-1.50, -0.55) m**.

**The consequence.** The final stair body now sits **1.5 m away from the keep-out the rooms were
tiled around.** It therefore overlaps the rooms/partitions that were tiled in the region the
stair vacated (the stair *"clashes with internal walls"*), and the stair void + stair walls cut
through the partitions that were sealing those rooms. Once a sealing partition is cut, room
detection floods across the gap and the six engine rooms merge into one — exactly the
`§DIAG-ROOMS rooms=6` (engine) vs *"Living Room / Bedroom 1 / Kitchen / Bathroom / Corridor 76.0
m²"* (shipped) divergence. **The post-hoc containment nudge is the architectural defect:
`position → keep-out → tile` uses one position; the shipped stair uses another.**

The `stairContainment.ts` header states the same conclusion (`stairContainment.ts:1-16`): the
nudge is "the CURE" for the pokes-out symptom, but it is applied *after* the engine has already
committed the room tiling against the un-nudged keep-out — so it fixes the stair-in-shell
geometry while *creating* the stair-vs-rooms overlap.

### 8.5.3 Why cornersInShell is SYSTEMATICALLY 1/4 — the start-corner-anchor problem

The `cornersInShell=1/4` is not random float noise; it is the **same every rotated run**, which
means a fixed geometric cause. The stair body is **ANCHORED at a start corner and GROWN in a
fixed direction** — only the anchor is positioned, the full footprint is never validated against
the rotated shell. A 2.0×2.8 m axis-aligned core rect, after a ~−44° rotation, becomes a diamond
whose far corners swing outside the rotated polygon; near 45° (the worst case for axis-snap
quantisation) a centre-ward nudge can't contain it, so only the centre + one corner end up inside.
This is documented in full in
`docs/04-reference/STAIR-CREATION-PIPELINE-AND-ANCHOR-ANALYSIS.md` (§2 — "the founder's
hypothesis is correct: it's an ANCHOR problem"; the 5-stage pipeline + the file map in §4).

### 8.5.4 The cure — upstream containment (step 1 SHIPPED 2026-06-09)

The robust model is the **opposite** of "anchor + grow + nudge afterward": the stair must be
**CONTAINED in the orchestrator BEFORE the keep-out is carved**, so that:

1. **The keep-out == the final shipped stair footprint — SHIPPED (`§STAIR-CONTAIN-UPSTREAM`).**
   `§STAIR-CONTAIN` is now resolved **upstream**, in `houseOrchestrator.ts`
   (`containStairCoreUpstream`), against the rotated **world** shell, on the *full* world
   footprint (all flights + landings + width) — NOT as an independent downstream
   `HouseLayoutExecutor` nudge. The orchestrator builds the shipped stair geometry with the
   SHARED `computeStairWorldFootprint` (`houseLayout/stairWorldFootprint.ts` — the SAME geometry
   the executor builds, a byte-for-byte port of `computeStairFootprintRect`), solves the inward
   offset with `solveStairContainmentWorld` (the SAME two-attempt interior-side → centroid gate
   the executor used), and carries that **world-XZ offset** on `StairCore.containOffsetWorld`.
   The **keep-out is then the world AABB of the CONTAINED footprint** (`enumeratePerStorey` →
   `keepOutRectsWorld` from `coreFootprintWorld`), so the rooms tile around the FINAL stair
   position and no stair-vs-room overlap can arise by construction. The executor applies the SAME
   `containOffsetWorld` to the shipped body and its `§STAIR-CONTAIN` becomes a **VERIFICATION**:
   it re-solves containment on the already-shifted body and expects a `{0,0}` residual (a no-op),
   logging a loud `§STAIR-CONTAIN ⚠ DESYNC` only if the two ever disagree. The reserved
   `core.rectMm` is **unchanged** (it still hugs the wall per §STAIR-DEFAULT-BIAS), so the
   placement invariants and the rectMm-equality tests are preserved; only the SHIPPED body +
   keep-out are shifted, together. Coincidence proven by
   `__tests__/stairContainUpstream.test.ts` (shipped footprint 4/4 inside; executor nudge `{0,0}`
   on axis-aligned, tight, AND rotated plates). **Consequence (correct, not a regression):** on a
   tight plate the keep-out now reflects the stair's REAL footprint (≈3×3.5 m for a U), so the
   ground floor may tile one fewer room than the old (too-small 2.0×2.8 core) keep-out did — but
   those rooms no longer overlap the stair (the `groundShellWeld` faithful test threshold dropped
   4 → 3 to match).
2. **Reserve / position the core in the ROTATED frame for strongly-rotated plates** — DONE for
   the rect (`reserveStairCoreShaped` reserves in the layout frame, A.21.D24) + the interior-side
   half-landing fold (§STAIR-HALF-LANDING-INWARD). Sizing the reserved cell to BOUND the full
   U/L footprint (so the upstream offset shrinks toward 0 on a wall-flush stair) is the remaining
   refinement (the current offset can be ~1–2 m on a tight plate; the cure makes that offset
   *consistent* between keep-out and shipped, which is what closes the merge).
3. **The corridor / circulation must explicitly connect to the stair LANDING.** Upstairs the
   stair arrival is the `corridor` relabelled "Landing" (§LANDING-NOT-HALL / G14); the
   reconciliation passes (`§CIRCULATION-REROUTE`, `wallsAndDoors.ts`) guarantee a door from that
   landing to every private room. Still queued: treating the stair footprint as a *first-class*
   circulation node rather than an obstacle the rooms merely avoid.

In short: **the position that drives the keep-out now equals the position the stair ships at** —
one upstream solve drives BOTH, so the desync is closed. The 2026-06-09 `interiorSide` change
(half-landing inward) + this `§STAIR-CONTAIN-UPSTREAM` change complete step 1; the
footprint-bounding reserve (step 2 refinement) + first-class-circulation-node (step 3) remain.

#### 8.5.4.1 Fix 1 + Fix 4 — the topology defence (SHIPPED 2026-06-09)

A central/mid-edge stair is what fractures the plate so the corridor spine can't run and the
rooms merge. The §8.5.4 cure (upstream geometric containment) is the deep geometry fix; **Fix 1 +
Fix 4 are the complementary, more robust TOPOLOGY fix — now shipped** — that stops the stair from
fragmenting the plate in the first place:

- **Fix 1 — `§STAIR-DEFAULT-BIAS` (`houseOrchestrator.ts`).** The orchestrator now ALWAYS supplies
  an `AspectBias` to `chooseStairCorePosition` (default Northern-hemisphere `{x:0,y:1}` when no
  site solar is captured), so the corner-preferring `PERIMETER_PREFERENCE` + `FRAGMENT_PENALTY`
  terms always fire → the stair takes a back/side **CORNER** (one dominant rect ~75-80 %), never
  the centre. See §8.2.1. Apartment/solar paths byte-identical. **Moved from recommendation →
  shipped.**
- **Fix 4 — `§STAIR-FRAGMENT` (`subdivide.ts`).** `DOMINANT_FRACTION` lowered `0.45 → 0.40` so a
  corner-carved plate reliably triggers the `§STAIR-OBSTACLE-CARVE` corridor carve. Defence-in-
  depth: the branch still runs BOTH carve and `packMultiRect` and keeps whichever drops fewer
  rooms (`§STAIR-CARVE-NO-DROP`), so a lower gate can only ADD a corridor spine, never remove
  rooms. Gated on `stairCarved=true` → the apartment (no-keep-out) path is unaffected. **Moved from
  recommendation → shipped.**
- **Diagnostics (Part 8).** `§DIAG-STAIR-RESERVE storey=… shape=… kind=… rect=… rot=…`
  (`houseOrchestrator.ts`, the `kind` is the corner-vs-central tell) and
  `§DIAG-BRANCH stairCarved dominantFrac=… path=carve|generic` (`subdivide.ts`) so the next prod
  run proves whether the stair went central and which subdivision path fired.

---

## 8.5.5 The other current wall-sealing gap (honest, downstream-coupled)

Even with `§GROUND-ENGINE-PERIMETER` / `§UPPER-SHELL-WELD` / `§SHELL-ANCHOR-PRESERVE` shipped,
the **same prod run** still merged rooms on the rotated ground plate. The evidence:

- **`§GROUND-ENGINE-PERIMETER` took the `WELD-FALLBACK` path** — the drawn (mitred/rotated) shell
  drifted off the engine footprint ring, so the bit-exact `ENGINE-PERIMETER` path was *not* taken
  and the load-bearing weld ran (`HouseLayoutExecutor.ts:496-503`). The cleaner path
  (`:489-494`) only fires when the drawn shell is still on the footprint ring within tolerance.
- **`WallJoinResolver` reports mostly `§MULTI-CLUSTER … PASS-THROUGH`** junctions —
  *"PASS-THROUGH (collinear pair → square caps to consensus) trimmed=3"* (`WallJoinResolver.ts`
  `§MULTI-CLUSTER-WHY` at `:586-602`, `§PASS-THROUGH-FLUSH` at `:671-710`). A pass-through join
  caps a near-collinear pair to a consensus point rather than forming a true mitred corner —
  acceptable for a real collinear run, but it means the rotated-plate junctions are being treated
  as pass-throughs, not crisp corners.
- **One wall hit `§WJR-INVALID … self-cluster`** — a degenerate wall whose **both** endpoints
  landed in one junction cluster; the resolver flags it `invalid` and skips it
  (`WallJoinResolver.ts:621-622`, `_flagInvalid` at `:230`). A skipped/invalid wall is one fewer
  sealing partition → a room can leak.

This is an **OPEN issue**, and it is **downstream-coupled to the stair desync**: the rotated
plate that forces the `WELD-FALLBACK` path is the same plate whose stair is nudged 1.5 m off its
keep-out. Fixing the stair containment upstream (§8.5.4) removes the partition-cutting cause;
moving the ground onto the engine-authored perimeter (§8.4.5, audit §5) removes the
weld-fallback cause. Both must land for the rotated-plate ground to seal reliably.

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

## 9.5 THE DIAGNOSTIC SUITE — `§DIAG-*` (the founder's debugging surface)

> This is the single most useful section for triaging a live generation. Every stage of the
> engine emits an **always-on** `[D-TGL]` / `[apartment-layout]` / `[floor §DIAG]` /
> `[WallJoinResolver]` console line tagged `§DIAG-…`. They are **logging-only** (no behaviour
> change, ADR-0061-safe) and were added deliberately so a single console paste from a prod run
> tells you *exactly* which strategy shipped, where it compromised, and which invariant broke.
> Read them top-to-bottom: they fire in pipeline order (program → bubble → subdivide → walls →
> doors → topology gate → winner → windows → executor → room detection → floors).

### 9.5.1 How to read a run

A clean apartment run emits, per generation: one `§DIAG-PROGRAM-FIT`, one `§DIAG-BUBBLE`, then —
**for each of the 8 strategies** — a block of `§DIAG-RECTS` / `§DIAG-BRANCH` / `§DIAG-DOORS` /
`§DIAG-ADJACENCY` / `§DIAG-DOOR-RULE` / `§DIAG-ROOM-OVERLAP` / `§DIAG-HALL-PERIMETER` /
`§DIAG-TOPO-GATE` / `§DIAG-ENUM`, and finally **one** `§DIAG-WINNER` (+ its objectives line). The
window pass then emits `§DIAG-WIN*` / `§DIAG-WINDOW-RULE` / `§DIAG-WINDOW-OVERLAP` /
`§DIAG-PARTY-WALL`, the entrance pass `§DIAG-ENTRANCE`, the house path `§DIAG-STAIR*` /
`§DIAG-ALLOC` / `§DIAG-ENRICH` / `§DIAG-LEVELS`, and finally the executor's floor pass emits
`[floor §DIAG]` / `§DIAG-FLOOR-INSET`. The two lines that matter most:
- **`§DIAG-WINNER`** — *which* strategy shipped, its tier, `hardValid`, every objective axis, and
  the rooms it dropped. If the shipped plan looks wrong, start here.
- **`§DIAG-TOPO-GATE`** (one per strategy) + the `§TOPO-HARD-REJECT-ALL` warning — *why* a bad
  plan was the best available (which of window/circulation/privacy/overlap every strategy failed).

### 9.5.2 The full `§DIAG-*` table

| Tag | Where (file) | What it logs / how to read it |
|---|---|---|
| `§DIAG-PROGRAM-FIT` | `tgl/bubbleGraph.ts:458,468` | The scaled program vs the shell: requested vs scaled bedroom/bath count, the §3.1 envelope band, and the fill verdict. The first place an over-/under-capacity shell shows up (drives §ENVELOPE-FIT-GROWTH). |
| `§DIAG-BUBBLE` | `tgl/bubbleGraph.ts:437,445,452` | The minted rooms + their target areas + the bubble edges (the "diagram"). Confirms the room SET (hall? corridor? ensuite?) and the `§AREA-FRACTIONS` clamped targets. |
| `§DIAG-RECTS` | `tgl/subdivide.ts:1429`, `houseOrchestrator.ts:720` | The buildable rect set after decomposition (+ stair carve): count + areas. A single big rect ⇒ `§RECTIFY-QUAD` fired; 2–4 rects ⇒ a stair fractured the plate. |
| `§DIAG-BRANCH` | `tgl/subdivide.ts:1430,1438,1457` | Which subdivision path ran: `path=carve` (the §STAIR-OBSTACLE-CARVE corridor carve on the dominant rect) vs `path=generic` (independent multi-rect pack) + the `dominantFrac`. On a house, this is the tell for whether the corridor spine survived the stair. |
| `§DIAG-DOORS` | `tgl/wallsAndDoors.ts:888,895,1170,1180` | Per-strategy door pipeline: how many doors each pass placed (bubble / permitted / over-cap / reroute / multi-hop) and which rooms ended sealed. |
| `§DIAG-ADJACENCY` | `tgl/wallsAndDoors.ts:1184,1214` | Realised room↔room adjacencies vs the bubble's required set — a missing mandatory adjacency (e.g. master↔ensuite) surfaces here. |
| `§DIAG-DOOR-RULE` | `tgl/wallsAndDoors.ts:1184,1190,1217` | Per-door legality: each door's pair + whether it is a PERMITTED pair (`doorAllowedBetween`) and within the privacy cap (`maxDoorsFor`). A forbidden/over-cap door is flagged (counts as a `compromise`). |
| `§DIAG-ROOM-OVERLAP` | `tgl/enumerate.ts:549,555`; detector `topology/validateNoRoomOverlap.ts` | **§ROOM-OVERLAP-HARD.** Per-strategy `pairsChecked` + the count of interior floor-area overlaps + each overlapping pair (names + m²). A non-zero count makes the strategy `hardValid=false`. |
| `§DIAG-HALL-PERIMETER` | `tgl/enumerate.ts:587,603` | Founder rule #2 (ADR-0063): does every entrance `hall` abut a perimeter wall (where the front door lands)? `✓` all halls on perimeter / `⚠` at least one interior. |
| `§DIAG-TOPO-GATE` | `tgl/enumerate.ts:648,650` | **The hard gate decision, one line per strategy:** `strategy=<s> hardValid=<bool> failed=[window,circulation,privacy,overlap]`. The single most important triage line — it names exactly which architectural rule each candidate broke. |
| `§DIAG-ENUM` | `tgl/enumerate.ts:654,663` | The terse per-candidate scoreboard: weighted score, `connected`/`shapeOK`/`topoOK`/`circRouted`/`compromises`, dropped rooms, frontage-fail room ids, and the key objective values (`eff`/`adj`/`daylight`/`circ`/`daylightReach`). |
| `§DIAG-WINNER` | `tgl/enumerate.ts:984,1005,1012` | **The chosen layout:** winning strategy, tier (`clean+legal+routed` … `any`), `hardValid` + `hardFailed`, Pareto `rank`, `weighted`, all flags, dropped rooms — plus a second line with EVERY objective axis. Paste this to see what shipped and where it compromised. |
| `§DIAG-LEVELS` | `tgl/enumerate.ts:417` | The per-level wall accounting (interior seal walls vs EXTERNAL/perimeter walls) — the founder's "ground-only EXTRA 4" stair-clamp regression was caught here (`§STAIR-SHELL-CLAMP`). |
| `§DIAG-WIN` | `windowEmission/emitWindows.ts:366…479` | Per-room window EMISSION: which external walls qualified, the solar-biased ranking, the count emitted per wall, and door/junction blocking. |
| `§DIAG-WIN-DIST` | `windowEmission/shellWallMatch.ts:711,729` | Window distribution along a shell wall (even-spacing offsets, corner-setback respected). |
| `§DIAG-WIN-UNMATCHED` | `windowEmission/shellWallMatch.ts:284,607…` | A window that could NOT host on any shell wall + the *reason tally* (`noShellMatch`/`cornerFitDrop`/`tooShort`). The first place a "missing window" shows up. |
| `§DIAG-WINDOW-OVERLAP` | `windowEmission/shellWallMatch.ts:498,636,733…` | Per shell-wall received-vs-dropped window counts from the §WINDOW-DEOVERLAP pass (two rooms fronting the same wall → the lower-priority one dropped before `wall.createOpening` can silently reject it). |
| `§DIAG-WINDOW-RULE` | `windowEmission/shellWallMatch.ts:583…847`, `emitGeometry.ts:246`, `executePlan.ts:697`, `types.ts:99` | **Founder rule #1 (2026-06-10): every room that FRONTS a perimeter wall must keep ≥1 window** (except a blind party-wall). Flags any perimeter-touching room that ends windowless as `⚠`, even when all its candidates were dropped upstream. |
| `§DIAG-PARTY-WALL` | `windowEmission/shellWallMatch.ts:575…771`, `executePlan.ts:80,694`, `entranceDoor.ts:209…233` | **PW.1 blind-façade suppression:** a window/door that resolved onto a *blind* shell wall (one abutting a neighbour within the setback) is deliberately suppressed (no glazing on a party wall), tallied separately from `unmatched`. |
| `§DIAG-ENTRANCE` | `entranceDoor/entranceDoor.ts:243…299` | The resolved main entrance (house path, A.21.D29): which hall + which shell wall + the clamped offset/width, or the degrade-to-nearest fallback. |
| `§DIAG-ALLOC` | `houseLayout/storeyAllocation.ts:50…61` | How the whole-house brief split across storeys (ground guest bed + WC; upper bedrooms/baths). |
| `§DIAG-FLOOR-OVERRIDE` | `houseLayout/storeyAllocation.ts:322,344` | Per-storey program overrides (`roomAreas`/floor-count) applied. |
| `§DIAG-ENRICH` | `houseLayout/houseProgramFloor.ts:53…219` | The §HOUSE-PLATE-PROGRAM-FLOOR enricher raising a sparse storey program to fill the plate (the "165 m² Room" cure): rooms added + the band fill. |
| `§DIAG-STAIR` / `§DIAG-STAIR-RESERVE` / `§DIAG-STAIR-CONTAIN-UPSTREAM` / `§DIAG-STAIR-RULE` | `houseLayout/stairPosition.ts:596…`, `houseOrchestrator.ts:402…609`, `stairContainment.ts:4` | The stair lifecycle: **`§DIAG-STAIR-RESERVE`** logs `kind=corner|central` (the corner-vs-central tell — see §8.2.1); **`§DIAG-STAIR-CONTAIN-UPSTREAM`** logs the upstream world-offset solve (`§STAIR-CONTAIN-UPSTREAM`); **`§DIAG-STAIR`** logs `centreInShell`/`cornersInShell=n/4`. |
| `§DIAG-STOREY` / `§DIAG-RECTS` (house) | `houseOrchestrator.ts:716,720,723` | Per-storey enumerate accounting (program, usable area, rect set). |
| `§DIAG-SEAL` | (measured in `__tests__/weldResolverRoomDetectionChain.test.ts`, `stairFractureSeam.test.ts`) | The end-to-end room-merge measurement: how many rooms RoomDetection actually closed vs the engine's count. The acceptance signal for the §FRACTURE-SEAL / §RECTIFY-SHELL-PROJECT / weld chain. |
| `§DIAG-WALL-JOIN` | `geometry-wall/WallJoinResolver.ts:367…1733` | Always-on wall-junction rule compliance: each cluster's kind (corner / T / multi-cluster pass-through), trims, and the §PARTITION-SHELL-INNER-FACE clamp decisions. |
| `§DIAG-FLOOR-INSET` | `room-topology/RoomPolygonUtils.ts:268…372`, `command-registry/.../CreateFloorsByRoomTypeCommand.ts:293` | **§FLOOR-INNER-FACE.** The per-room floor inset (centreline → inner face): miter-clamp fires (near-parallel/runaway corners → bevel fall-back), winding-inversion / larger-than-source / near-zero-area fall-backs. The cure for floors overlapping under partitions + the "floor spike" defect. |
| `[floor §DIAG]` (boundary/door-gap line) | `CreateFloorsByRoomTypeCommand.ts:160…295` | Per floored room: boundary source (`inner-face ✓` / `centreline ⚠`), the inset applied, and how many door-gap thresholds the floor met a neighbour at. |

### 9.5.3 The user-relayable warnings (not just logs)

Three `§…` lines are emitted as `console.warn` precisely so the trigger/modal can relay them to the
user as a toast — they describe a genuine architectural compromise the shell + program forced, never
a crash:

- **`§TOPO-HARD-REJECT-ALL`** (`enumerate.ts:951`) — *all 8 strategies are hard-invalid*; names the
  union of failing rules and ships the least-bad (the pool is never emptied).
- **`§CIRCULATION-REROUTE`** (`enumerate.ts:1016`) — the best plan still has a land-locked room (no
  legal corridor/hall-adjacent wall to re-route it onto).
- **`§ROOM-OVERLAP-HARD`** (`enumerate.ts:1038`) — even the winner overlaps (a genuinely
  over-capacity shell); emits the founder's "Room Overlap Detected" message naming the actual rooms.
- **`§FEASIBILITY-ALLOC`** (`enumerate.ts:1055`) — the winner dropped N requested rooms ("you asked
  for N bedrooms, M fit"); never a silent loss.

---

## 9.6 RECENTLY-SHIPPED MECHANISMS (this session — 2026-06-09/10)

> These eight mechanisms shipped in the current session and are the most likely to be unfamiliar.
> Each is gated so the apartment / rectilinear-plate path stays byte-identical (ADR-0061).

### 9.6.1 `stair` is now a first-class room type — `§STAIR-ROOM-TYPE`

`programRules.ts:433` adds a full `ROOM_RULES.stair` entry (ADR-0063, founder rule #1). On the
house path, after the stair keep-out is carved out of the buildable plate, `buildCandidate`
**mints a named `stair` ProgramRoom + placement at the (clamped, inflated) keep-out rect**
(`enumerate.ts:385-460`) so (a) the modal draws a "Stair" cell EQUAL to the executed stair body, and
(b) no habitable room can tile into the stair footprint. The stair is `privacy:'circulation'`,
`frontage:'none'`, `needsWindow:false`, `accessFrom:['corridor','hall']`, `maxDoors:2` — so the
reconcile pass connects it to the landing/corridor over a shared wall and `isOpenPlanEligible('stair')`
is false by construction (no room ever merges into it). **The apartment never passes a keep-out**, so
the block is skipped and the apartment is byte-identical.

```ts
// programRules.ts:433-452 — the stair room rule (house-only; apartment never mints one)
stair: {
    type: 'stair', occupancy: 'stair', privacy: 'circulation',
    acousticRole: 'neutral', frontage: 'none',
    areaWeight: 0.4, minAreaM2: 4.0, minShortSideM: 2.0, needsWindow: false, windowMandatory: false,
    accessFrom: ['corridor', 'hall'], maxDoors: 2,
    adjacencyPreference: { corridor: 1.0, hall: 1.0 },
    requiredFurniture: [], optionalFurniture: [], requiredFixtures: [],
    furnitureSpec: [],   // vertical circulation — the stair geometry IS its content.
    description: 'Vertical-circulation core (stair). … House-only — the apartment has no stair.',
},
```

`§STAIR-SHELL-CLAMP` (`enumerate.ts:410-431`): the keep-out is INFLATED by `KEEPOUT_MARGIN_M` so the
stair cell is flush with the cleared rooms — but the inflation is **clamped back into the shell bbox**
so a façade-abutting ground stair never pushes a stair edge 0.05 m outside the shell (the founder's
"purple wall beyond the façade" + the ground-only "EXTRA 4" seal walls in `§DIAG-LEVELS`). On an
interior keep-out the clamp is a no-op → byte-identical.

### 9.6.2 Over-capacity shell growth — `§ENVELOPE-FIT-GROWTH`

`bubbleGraph.ts:160-186` (`scaleProgramToShell`, founder bug #1). The #1 recurring residential defect:
an OVER-CAPACITY shell (much larger than the program's max area) inflated a fixed small program to fill
the plate → rooms collide/merge + every strategy `§TOPO-HARD-REJECT`s. Root cause: the 130 m²/bed
density is far sparser than the §3.1 envelope (~37-55 m²/bed), so a 206 m² shell rounded to only
2 bedrooms — yet the 2-bed envelope hard-maxes at 120 m². The cure grows the count one bedroom at a
time until the shell fits inside that count's envelope band:

```ts
// bubbleGraph.ts:179-186 — grow the bedroom count to FIT the §3.1 envelope (apartment 'single' role only)
if (plateRole === 'single' && envelopeFitGrowth) {
    while (
        targetBedrooms < maxBedrooms &&
        shellAreaM2 > apartmentDimensionsFor(targetBedrooms).grossMax + 1e-6
    ) {
        targetBedrooms += 1;
    }
}
```

This grows MORE rooms of NORMAL size rather than fewer ballooned ones, and **aligns
`scaleProgramToShell` with the §D3.5 envelope gate** (`enumerate.ts:845-850` now validates the SCALED
count, so the gate no longer hard-rejects the very shell it could grow into). The 130-rule result is
the FLOOR (`Math.max` never lowers it) → an in-band/small shell is byte-identical. The **house passes
`envelopeFitGrowth=false`** (`enumerate.ts:326`) — a house storey already sized its bedroom count via
its own `'ground'/'upper'` density (`PlateRole`, `bubbleGraph.ts:119-194`: 45 m²/bed vs the
apartment's 130), so re-growing it to the apartment envelope would re-inflate the sub-programme.

### 9.6.3 Hard room-overlap rule — `§ROOM-OVERLAP-HARD`

`validateNoRoomOverlap.ts` + the `O` rule in `evaluateHardTopology` (`enumerate.ts:252-258`). Two
rooms may share walls/edges/corners (zero-area intersection) but NEVER interior floor. The squarified
tiling is exact, but the subdivider's post-passes (`snapAxisLines` / comb carve / window snap) move
rects independently, so an overlap can appear on a tight shell. Detecting `Area(R_i ∩ R_j) > ε` makes
the candidate `hardValid=false`, so a non-overlapping strategy ranks above it; only when ALL 8 overlap
(a genuinely over-capacity shell) does the winner overlap and emit the user-facing
`§ROOM-OVERLAP-HARD` warning naming the actual rooms.

### 9.6.4 Fracture-seal external classification — `§FRACTURE-SEAL`

`wallsAndDoors.ts:35-43, 222-230, 711-719`. A one-sided wall (`boundsRoomIds.length === 1`) is normally
EXTERIOR (skipped by the executor's pre-drawn shell). But on a STAIR-CARVED plate the dominant rect's
boundary that borders the EMPTY stair keep-out fragment is ALSO one-sided — yet it is an INTERIOR
sealing wall. Classifying it as exterior makes `skipExteriorWalls` drop it → the rooms abutting the
fracture edge leak → RoomDetection floods → one merged room. The fix passes the real shell polygon and
tests a one-sided wall's BODY against the ring:

```ts
// wallsAndDoors.ts:717-719 — classify a one-sided wall against the REAL shell ring (house path)
const isExternal = bounds.length === 1 && shellPoly
    ? segmentOnPerimeter(a, b, shellPoly)   // sample both ends + midpoint, ALL within tol of the ring
    : undefined;
```

A wall bordering an empty stair fragment lies metres inside the ring → `false` → built as an interior
seal. **The apartment / AI path leaves `shellPolygon` undefined → the legacy `length===1` heuristic →
byte-identical.**

### 9.6.5 Partition→shell inner-face join — `§PARTITION-SHELL-INNER-FACE`

`geometry-wall/WallJoinResolver.ts:205-223, 228-356` (founder invariant, 2026-06-10). A FINAL clamp
after the pairwise corner/T resolution: a partition endpoint that terminates ON a shell (perimeter /
through) wall must butt the shell's **INNER (room-side) face** — never the centreline, never through to
the outer face. Two routes can leave a partition end on the shell centreline, whose square-capped body
then crosses the shell and pokes out the façade (the founder's "partition stubs through the wall").
`_clampPartitionEndsToShellInnerFace` clamps it back to the inner face; it **refuses** the clamp if it
would collapse/invert the wall (logging `§PARTITION-SHELL-INNER-FACE REFUSED`), and the HOST (shell) is
never moved (§SHELL-ANCHOR-PRESERVE).

### 9.6.6 Floor inner-face inset — `§FLOOR-INNER-FACE`

`command-registry/.../CreateFloorsByRoomTypeCommand.ts:110-295` + the pure
`insetPolygonToInnerFaces` (`room-topology/RoomPolygonUtils.ts`). The room boundary runs along wall
CENTRELINES, so building the floor on it spans to the wall centre and OVERLAPS the neighbour's floor
under the partition. The fix insets each edge inward by the bounding wall's `thickness/2` — but keeps
the inset at **0 across a door span** so the two rooms' floors meet at the threshold. The pure inset
miters the offset edges with a robust fall-back ladder (`§DIAG-FLOOR-INSET`): near-parallel/runaway
corners bevel instead of spiking; winding-inversion / larger-than-source / near-zero-area all fall back
to the centreline polygon so a floor is **always** produced.

### 9.6.7 The entrance door — `entranceDoor.ts` (`§A.21.D29` / `§ENTRANCE-DOOR-CLEAR`)

The apartment relies on a HAND-PLACED front door (the user draws it before generating; its opening span
is threaded as a `doorSpan` so partitions avoid it). A generated house has none, so
`resolveEntranceDoor` (`entranceDoor/entranceDoor.ts`) **purely + deterministically** picks the
ground-floor `hall`, finds the EXTERIOR shell wall bounding it, and computes a centred, clamped door
(`ENTRANCE_DOOR_WIDTH_M = 1.0`, clamped down to fit a short wall, `END_CLEAR_M = 0.15` corner
clearance). `findClearDoorOffset` (`:52`) keeps the door clear of any already-placed shell window
(`OPENING_GAP_M = 0.1`, `§ENTRANCE-DOOR-CLEAR / G4`) so it never collides with a window and gets
skipped. The executor dispatches it exactly like a shell-hosted window (`wall.createOpening type 'door'`
+ `door.batch.create` on the existing shell id).

### 9.6.8 Single-hall + landing-not-hall — `§HALL-SINGLETON` / `§LANDING-NOT-HALL`

The entrance `hall` ("Entrance Hall") is minted **once**, purely from `program.entranceHall === true`
(`bubbleGraph.ts` mint order). Per `§LANDING-NOT-HALL` (G14, `storeyAllocation.ts` /
`houseProgramFloor.ts`) **only the ground (entrance) storey** of a house carries that flag, so an upper
floor never mints a hall — its stair arrival is the `corridor`, relabelled "Landing" by
`HouseLayoutExecutor`. There is no `landing` RoomType; a landing IS a `corridor`-typed room. This is why
a house has exactly one entrance hall (ground only) and N landings (one per upper storey), and why
`hall.frontage = 'required'` (the front door lands on the shell, in the hall — `§DIAG-HALL-PERIMETER`).

---

## 10. OBJECTIVES + RANKING

### 10.1 `objectives.ts` — the 21-axis `ObjectiveVector`

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
| `daylightReach` | **(A.21.D55, the 21st axis)** fraction of the WIDER *windowable* set (habitable **+** wet — `WINDOWABLE_TYPES`, `objectives.ts:315`) that touches the façade. A per-ROOM count, where `daylight` is the AREA-weighted habitable-only axis — so this term specifically rewards a tiling that fronts the bathroom/wc too ("a window in every room"). Neutral 1.0 when there are no windowable rooms / no external walls. |

`OBJECTIVE_AXES` (`objectives.ts:309`) lists all 21 in fixed order. Many axes return a **neutral 1.0**
when their driver is absent (no site latitude, no acoustic tension, no window data) — a
constant across candidates is rank-invisible, so absent data leaves the order byte-identical.

### 10.2 Space syntax — `spaceSyntax.ts`

`computeSpaceSyntax(graph, entryGuid)` computes per-space graph depth from the entry, feeding
`circulation` and `hierarchy`. `entrySightlineRaycast.ts` adds a literal sight-line raycast
variant for `entrySightline` when every space carries a polygon.

### 10.3 Weights — `score.ts` + `ScoringWeights` + the A.25 sliders

- `weightedSum` (`enumerate.ts:398`) maps the 4 user weights — `corridorEfficiency`,
  `kitchenWorkflow`, `naturalLight`, `privacy` — onto the 21 axes (e.g. `daylight ←
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
| `§RECTIFY-SHELL-PROJECT` | `rectDecomposition.ts` `projectPartitionEndpointsToShell`; wired `runDeterministicLayout.ts` (after `emitGeometry`, before `rotateOptionBack`) | Project bbox-edge interior-partition endpoints onto the REAL shell so they meet the executor perimeter ring within 20 mm by construction (the multi-storey room-merge cure; §8.5.5). No-op when the shell does not rectify → byte-identical for the apartment + rectilinear plates. |
| `§AREA-FRACTIONS` | `programRules.ts`, `bubbleGraph.ts` | Size-scaled min/max room-area clamps. |
| `§SINGLE-RECT-CARVE` | `subdivide.ts:402` | `[public \| corridor \| private]` slice + ensuite-from-master. |
| `§STAIR-OBSTACLE-CARVE` / `§STAIR-KEEPOUT` | `subdivide.ts`, `enumerate.ts`, `rectDecomposition.ts` | Carve the stair core out before subdivide; keep a spine. |
| `§FEASIBILITY-ALLOC` / `§FEASIBILITY-FIRST` | `subdivide.ts` | Rebalance-don't-drop; report shortfalls, never silent. |
| `§OPEN-PLAN-ELIGIBLE` | `programRules.ts:582`, `wallsAndDoors.ts:604` | Only living/kitchen/dining may go wall-less. |
| `§SEALED-ROOMS` / `§CIRCULATION-REROUTE` | `wallsAndDoors.ts` | Door reconciliation so every room opens onto circulation. |
| `§DOOR-MINIMUMS` | `programRules.ts:650`, `wallsAndDoors.ts:728` | Per-room-type clear-width floor. |
| `§EXTEND-TO-PERIMETER` / `§JUNCTION-REPAIR` | `wallsAndDoors.ts` | Close gaps on slanted shells; weld junctions for room detection. |
| `§WINDOW-CORNER-SETBACK` (A.21.D45) | `emitWindows.ts:67`, `shellWallMatch.ts:86` | Real masonry pier at each corner (reverts the edge-hugging window). |
| `§WINDOW-MANDATORY-RESCUE` (A.21.D60) | `shellWallMatch.ts`, `programRules.ts` | A windowMandatory room never ends with 0 windows: last-resort relaxed retry (corner→width→match-tolerance) retains 1; only fallback, byte-identical otherwise. |
| `§KITCHEN-DISTINCT` / `§BATH-CORRIDOR-ONLY` | `bubbleGraph.ts`, `programRules.ts` | Kitchen always enclosed; bath off corridor only. |
| `§STAIR-WORST-ASPECT` / `§STAIR-CORNER-ANCHOR` | `stairPosition.ts`, `stairCore.ts` | Stair takes the poor-aspect back corner. |
| `§STAIR-KEEPOUT` | `houseOrchestrator.ts`, `enumerate.ts:187-202` | Carve the stair out of the buildable rects before tiling. The keep-out is now the world AABB of the CONTAINED, shipped footprint (`§STAIR-CONTAIN-UPSTREAM`), not the reserved core rect. |
| `§STAIR-CONTAIN-UPSTREAM` | `houseOrchestrator.ts` `containStairCoreUpstream`, `stairWorldFootprint.ts`, `stairContainment.ts` `solveStairContainmentWorld` | Solve the inward containment UPSTREAM (orchestrator), before the keep-out is carved; the world offset is carried on `StairCore.containOffsetWorld`. Keep-out == shipped footprint by construction (closes the §8.5 desync). |
| `§STAIR-CONTAIN` / `§STAIR-CONTAIN-GATE` | `HouseLayoutExecutor.ts` (§STAIR-CONTAIN block), `stairContainment.ts:64` | Now a VERIFICATION: the executor applies the upstream `containOffsetWorld` and re-solves to confirm a `{0,0}` residual (a no-op nudge); a non-zero residual logs `§STAIR-CONTAIN ⚠ DESYNC`. |
| `§GROUND-ENGINE-PERIMETER` / `§UPPER-SHELL-WELD` | `HouseLayoutExecutor.ts:434-553` | Close the ground like the upper storeys; ENGINE-PERIMETER path vs the load-bearing WELD-FALLBACK path. |
| `§MULTI-CLUSTER` / `§PASS-THROUGH-FLUSH` / `§WJR-INVALID` | `WallJoinResolver.ts:179-622` | 3+-endpoint junction resolution; collinear pass-through caps; durable degenerate (self-cluster) flag. |
| `§COLLINEAR-MERGE` | `executePlan.ts:184` | Fold collinear segments at T/X junctions into passthrough walls. |
| `§STAIR-ROOM-TYPE` | `programRules.ts:433`, `enumerate.ts:385-460` | Mint a named `stair` room at the keep-out (house-only) so the modal shows a Stair cell + no room tiles into it. |
| `§STAIR-SHELL-CLAMP` | `enumerate.ts:410-431` | Clamp the inflated stair keep-out back into the shell bbox so a façade-abutting stair never pokes a wall stub past the shell. |
| `§ENVELOPE-FIT-GROWTH` | `bubbleGraph.ts:160-186`; gate `enumerate.ts:845-850` | Grow the apartment bedroom count to FIT the §3.1 envelope on an over-capacity shell (more normal rooms, not one ballooned). House passes `false`. |
| `§ROOM-OVERLAP-HARD` | `topology/validateNoRoomOverlap.ts`, `enumerate.ts:252-258` | 4th hard-gate rule: any pairwise interior floor-area overlap makes a strategy hard-invalid. |
| `§FRACTURE-SEAL` | `wallsAndDoors.ts:35-43,222-230,711-719` | Classify a one-sided wall against the REAL shell ring: a wall bordering an empty stair fragment is an INTERIOR seal, not exterior. Apartment = byte-identical. |
| `§PARTITION-SHELL-INNER-FACE` | `geometry-wall/WallJoinResolver.ts:205-356` | Final clamp: a partition end on a shell wall butts the shell's INNER face, never the centreline/outer face. Refuses a collapsing clamp; never moves the host. |
| `§FLOOR-INNER-FACE` / `§DIAG-FLOOR-INSET` | `CreateFloorsByRoomTypeCommand.ts:110-295`, `room-topology/RoomPolygonUtils.ts:268-372` | Inset each room floor edge by the wall `thickness/2` (0 across a door span) so floors meet at the threshold, not overlap under partitions. Robust miter/bevel/centreline fall-backs. |
| `§HALL-SINGLETON` / `§LANDING-NOT-HALL` (G14) | `bubbleGraph.ts`, `storeyAllocation.ts`, `houseProgramFloor.ts` | Exactly one entrance hall (ground only, `frontage:'required'`); upper storeys mint a `corridor` relabelled "Landing", never a hall. No `landing` RoomType. |
| `§ENTRANCE-DOOR-CLEAR` (G4) / `§A.21.D29` | `entranceDoor/entranceDoor.ts` | House front-door resolver: pick the hall's exterior shell wall, centre + clamp a 1.0 m door clear of windows + corners. |
| `§WINDOW-MANDATORY-RESCUE` (A.21.D60) / `§WINDOW-DESIRED` (A.21.D61) | `shellWallMatch.ts`, `programRules.ts:681-707` | A window-DESIRED room with external frontage keeps ≥1 window via a relaxed retry ladder (corner→width→match-tolerance); a room with NO frontage reports `NO-FRONTAGE`, never silent. |
| `§DIAG-WINDOW-RULE` | `shellWallMatch.ts:583-847`, `emitGeometry.ts:246` | Founder rule #1: flag ANY perimeter-touching room that ends windowless (except a blind party wall). |
| `§DIAG-PARTY-WALL` (PW.1) | `shellWallMatch.ts:575-771`, `executePlan.ts:80` | Suppress glazing/doors on a BLIND shell wall (one abutting a neighbour within the setback); tallied separately from `unmatched`. |
| `§SOCIAL-CAVERN-CAP` (PM-5) | `programRules.ts` (living/kitchen/dining `maxAreaFrac`) | Cap the social rooms' area share so a large/elongated plate doesn't stretch one into a daylight-starved deep-plan cavern. |
| `§PLATE-ROLE` | `bubbleGraph.ts:119-194` | `scaleProgramToShell(program, area, plateRole)`: `'single'` 130 m²/bed (apartment, byte-identical) vs `'ground'/'upper'` 45 m²/bed (a house storey holds only part of the dwelling). |

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
- **Stair containment desync — CLOSED 2026-06-09 (`§STAIR-CONTAIN-UPSTREAM`).** Historically the
  engine carved the room-tiling keep-out at the stair's *original* reserved position while the
  editor nudged the *shipped* stair body to a *different* position to fit a rotated shell
  (observed `(-1.50,-0.55)m`), so the stair overlapped the rooms tiled around the original
  keep-out, its void cut sealing partitions, and `§DIAG-ROOMS rooms=6` shipped as one merged
  room. **Fixed** by solving the containment UPSTREAM in `houseOrchestrator.ts`
  (`containStairCoreUpstream`, via `stairWorldFootprint.ts` + `solveStairContainmentWorld`) before
  the keep-out is carved: the keep-out is the world AABB of the CONTAINED footprint, the world
  offset rides `StairCore.containOffsetWorld` to the executor, and the executor's `§STAIR-CONTAIN`
  is now a verified no-op (a non-zero residual logs `§STAIR-CONTAIN ⚠ DESYNC`). Keep-out ==
  shipped footprint by construction; proven in `stairContainUpstream.test.ts`. §8.5.4.
- **Rotated/sheared-plate room-merge — CURED 2026-06-09 (`§RECTIFY-SHELL-PROJECT`, §8.5.5).**
  ROOT (forensically established): `§RECTIFY-QUAD` tiles the interior partitions inside the
  **bbox** of the rotated sheared shell, so perimeter-terminating partition endpoints land on
  the bbox edge — up to **~1.9–2.1 m** inside which the executor's real perimeter ring
  (`storey.footprint === shell.perimeter`) sits. The 0.60 m weld (`§SHELL-SNAP-WIDEN`) cannot
  bridge that → open seam → RoomDetection floods → one merged room. **Fixed** by
  `projectPartitionEndpointsToShell` (`rectDecomposition.ts`, wired in `runDeterministicLayout.ts`
  after `emitGeometry`, before `rotateOptionBack`): the interior partition endpoints on a
  rectified-bbox edge are projected onto the **real** shell polygon in the rotated frame, so the
  partitions meet the executor ring within the 20 mm RoomDetection node grid **by construction**;
  the weld + `§UPPER-SHELL-WELD` + `§SHELL-ANCHOR-PRESERVE` degrade to a safety net. No-op (same
  reference) when the shell does not rectify → byte-identical for the apartment + every
  rectilinear plate. Proven in `rectShellProject.test.ts` + `tglRunDeterministicLayout.test.ts`
  (≤20 mm by-construction property + axis-aligned byte-identical). Any *residual* on a non-quad
  rotated plate that does not rectify is still caught by the `WELD-FALLBACK` path
  (`HouseLayoutExecutor.ts`) and surfaced by the `§DIAG-SEAL` prod measurement.
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
**NOTE (Fix 1, §8.2.1):** since 2026-06-09 the orchestrator **always** passes a `StairSolar` (a
default Northern-hemisphere bias when no site solar is captured), so the production stair path
**never** hits the `undefined`/waste-only branch — only direct test calls do.

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
valid.length ≥ 2` (`:1251`): if the largest sub-rect holds ≥ `DOMINANT_FRACTION = 0.40` (Fix 4, was 0.55→0.45) of the buildable
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
