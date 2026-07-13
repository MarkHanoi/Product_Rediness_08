# V1 Launch Implementation Plan — Phased (LIVING DOCUMENT)

> **Status**: ACTIVE · **Target**: v1 launch (next week) · **Companion audit**:
> `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` (issue log L-NN + area conformance, side-by-side).
> Each item cites its audit id (L-NN), the queue id (Q-NN), the `§`-tag, the agent, acceptance, and a gate (G-NN).
> **Rule**: phases are ordered by launch-criticality; a phase ships when its gate is green on `pryzm.fly.dev`
> (root `tsc --skipLibCheck --noEmit` = exit 0). Deliver Phase 0 → 1 → 2 first; 3–5 run in parallel as capacity frees.

## Delivery model
Up to **6 agents in parallel**, one issue each, isolated git worktrees → merge → gate → push. The orchestrator
maintains the fleet and routes each newly-reported issue to a free slot or the most relevant running agent.

---

## Phase 0 — STOP THE BLEED (freezes & fails) — **MUST for launch**
Blocking defects that make the app unusable. Gate: G1, G2, G3.

- **0.1 Host-wall move freeze** (L-01 / ADR-0099 / §FIX-HOSTWALL-DOOR-INDEX) — **SHIPPED** (52ce2693). Verify on
  the deployed bundle (founder was on pre-fix build).
- **0.2 Per-move redetect + plan-reprojection storm** (L-06 / Q6 / §FIX-WALLMOVE-REDETECT-DEFER) — *agent aba7751*.
  Sub: 0.2a defer redetect to drag-end; 0.2b defer + incrementalize plan re-projection; 0.2c one-settle test.
  **Gate G1** (belt-and-suspenders with 0.1).
- **0.3 Heavy-project load fail/freeze** (L-03 / Q3) — *agent a14d3b7*. Sub: 0.3a progress-aware load timeout;
  0.3b suppress autosave during load; 0.3c batch clear-on-switch (one spatial-tree refresh); 0.3d stop
  persisting/loading degenerate RBLs; contracts C13/C05. **Gate G2**.
- **0.4 Heavy-tower navigation perf** (L-02 / Q2) — *agent aa374d0*. Sub: 0.4a enforce shadows-off ≥8000 casters
  during nav; 0.4b instancing coverage (walls/slabs/windows across floors); 0.4c nav-LOD (suppress non-essential
  passes while camera moves); 0.4d cached/incremental frustum culling. **Gate G3**.

- **0.-1 WEBGPU 3D-SCENE STUTTER — AND IT PROBABLY *IS* 0.0** (L-253 / §FIX-WEBGPU-PREWARM-STUTTER) —
  **OPEN, CRITICAL. Do this BEFORE 0.0.** Founder, 2026-07-13: *"freezing on moving — when I move in the scene
  is not flowing… then I swap to WebGL and back to WebGPU and it works well."* **The CURE is the clue.**
  Geometry is backend-agnostic — a wall's baseline, the join resolver and the rebuild coordinator do not care
  who draws them. **So if swapping the RENDERER fixes it, the fault is in the RENDERER.** That is why every
  L-250 hypothesis came back clean under measurement (rebuild is O(affected): 200 bodies → 4, 48 CSG → 0;
  `resolveLevel` is a proven fixed point; the no-progress signature cannot be defeated). **I was hunting in the
  wrong subsystem, and the founder's own workaround is the proof.** Two smoking guns in his console:
  (i) `WebGPU: too many warnings, no more warnings will be reported` — **the device is flooding validation
  warnings and nobody has read them**; (ii) the first WebGPU renderer is the **PRE-WARMED** one
  (`RendererPrewarm … pre-warmed in 226 ms` → `Phase 5: pre-warmed renderer consumed`), and a live swap
  **throws it away and builds a fresh one — which is exactly when it goes smooth.** Sub: **0.-1a READ THE
  WEBGPU WARNINGS FIRST** (cheapest step; they may name the bug); **0.-1b** run the founder's control
  experiment properly — boot → measure orbit frame-time → swap → back → measure; **the only variable is the
  renderer instance**; **0.-1c** if the prewarmed instance is the culprit, **make it correct, do NOT delete it**
  — it removes a 2,401 ms LONGTASK from project-open; **0.-1d** answer the asymmetry: WebGL2 turns ON continuous
  repaint during camera move (`§PERF-WEBGL2-RENDER-ON-MOVE`) and WebGPU does not — **one of the two is wrong**;
  **0.-1e RE-TEST L-250 afterwards** — if the wall+door freeze goes when the renderer is healthy, L-250 was a
  symptom of this all along and the audit must say so. **Gate G3.**
- **0.0 WALL-WITH-HOSTED-DOOR FREEZE — THE FOUNDER'S #1 BUG, RAISED MANY TIMES, STILL LIVE** (L-250 /
  §FIX-WALL-LENGTH-EDIT-HOSTED-DOOR-FREEZE) — **OPEN, CRITICAL. Gate G1 REOPENED. This outranks
  everything else on this board.** Escalated 2026-07-13 with a live log + screenshot. **It has survived
  THREE fixes (L-01/ADR-0099, L-97, L-234) — so every prior root cause is REFUTED until re-proven.**
  **The screenshot shows the founder editing the `Length` FIELD IN THE PROPERTY PANEL, not dragging** —
  and `Length` is the only editable placement field ([PlacementEditor.ts:84](apps/editor/src/ui/property-panel/PlacementEditor.ts#L84)).
  It dispatches `wall.updateBaseline` from [PropertyPanelSections.ts:98](apps/editor/src/ui/property-panel/PropertyPanelSections.ts#L98)
  with **no `_recordUndo`, no `_skipBridge`, no drag context**. There are **four** call sites into that
  command — and **L-234 measured and fixed only the DRAG path** (its own commit says *"the drag path
  (registerTransformDragHandler / MovePlanToolHandler)"*). **Nobody has ever measured the panel path.**
  That is the repo's signature disease: one element, two paths, the second silently keeping the old
  behaviour (cf. L-239, L-240, L-242, L-246). A `Length` edit also **moves ONE ENDPOINT**, changing
  junction topology in a way a rigid drag never does. **The freeze mechanism is already described in our
  own source** — [WallRebuildCoordinator.ts:227-234](apps/editor/src/engine/WallRebuildCoordinator.ts#L227):
  a moved **door-bearing** wall landing in a `§SELF-CLUSTER-GUARD` cluster makes the flush *"re-arm EVERY
  rAF frame and never converge → the founder's hard freeze."* A guard exists; he still freezes; **so the
  guard does not cover his case.** Sub: **0.0a REPRODUCE THE PANEL GESTURE FIRST** (extend L-234's existing
  `WallMoveRebuildCost.measure` / `WallMoveIncrementalRebuild.equality` harnesses — do not write new ones);
  **0.0b** count `_flush` iterations + `produceWall` calls on that path; **0.0c** if H1 holds, the fix is
  **CONVERGENCE, not optimisation** — every `wall.updateBaseline` call site enters ONE rebuild path with ONE
  scoping rule; **do not add a fifth special case**; **0.0d** ship the regression guard the last three fixes
  lacked — *a door-bearing wall whose Length is edited from the panel must settle in a BOUNDED number of
  flushes*; **0.0e** verify on the deployed build (localhost dev is unusable for this). **Gate G1.**
  *A fix is not done until the cost is MEASURED on THIS path — L-234 was closed on a measured drag path,
  which is precisely why it did not close this.*
- **0.0b WALL JOINT: a clean 2-wall MITRE is destroyed when a THIRD wall joins the corner** (L-251 /
  §FIX-WALL-JOIN-MITRE-BROKEN-BY-THIRD-WALL) — **OPEN, HIGH.** Founder, 2026-07-13, two screenshots: two
  walls meeting *en inglete* render correctly; add a third (L+I / T) into that corner and the mitre breaks —
  a dark **wedge** opens in 3D, a square **notch** appears in plan. **Our own source names the seam:**
  [WallJoinResolver.ts:258](packages/geometry-wall/src/WallJoinResolver.ts#L258) runs a **`§MULTI-CLUSTER`
  consensus-trim for 3+ endpoint clusters BEFORE the pair-wise loop**, while a 2-wall corner is **mitred by a
  bisector plane** ([:143-153](packages/geometry-wall/src/WallJoinResolver.ts#L143)). **So the same corner is
  MITRED at two walls and CONSENSUS-TRIMMED at three — adding a wall silently switches join algorithms, and the
  wedge is the difference between them.** Fourth appearance of the one-thing-two-paths disease (cf. L-239,
  L-242, L-246, L-250). Sub: **0.0b-1 reproduce IN ORDER** (build the mitre, confirm clean, *then* add the third
  wall — the order IS the bug); **0.0b-2 answer H3 FIRST, it is cheap and decides the fix** — the founder's wall
  **hosts a door**, and L-242 proved ADR-0055's JunctionResolverV2 only ever shipped for
  `!layers && !curve && openings.length === 0`, so this corner may be on the **legacy** resolver by construction
  — if so the real ticket is **"ADR-0055 P4b: land V2 for opening-bearing walls"** and patching the legacy trim is
  polishing a path we intend to delete; **0.0b-3** the fix is **CONVERGENCE, not another branch** — one algorithm
  whose result is *continuous* as wall-count goes 2 → 3; `WallJoinResolver` already carries a pair-wise mitre, a
  multi-cluster consensus trim, a partition-shell clamp and a diff-thickness butt, **and this bug exists because
  they disagree — do not add a fifth**; **0.0b-4 do NOT re-attempt §CLAMP-COSHARE-WELD** (reverted for DOUBLING
  walls) — solve it in the footprint/mitre-normal, never by moving baselines; **0.0b-5** guard: *a 2-wall mitre
  that gains a third wall must stay WATERTIGHT* — assert zero uncovered area, not merely "no exception".
  **Same agent as 0.0 (L-250) — both live in the wall-rebuild/join path and will collide if split.**
- **0.5 The unit-test estate is not a CI gate** (L-247 / §GATE-TEST-ESTATE-NOT-A-CI-GATE) — *queued, CRITICAL*.
  **This is the gate under every other gate on this board, and it is currently open.** `ci.yml:106` runs only
  `test:server`; it never calls `test:ci`. Root `test:ci` uses `--if-present`, and **122 workspaces define `test`
  but not `test:ci`** — including `@pryzm/editor`, whose **1,495 tests (34 currently RED) have never run in CI**.
  Sub: **0.5a** add `test:ci` to `apps/editor` + the other 121; **0.5b** add a `test-unit` job to `ci.yml` that calls
  `pnpm run test:ci`, landed **non-blocking for exactly one PR** so the true red surface shows up in CI, not on an
  agent's laptop; **0.5c** triage the 34 **product-first** (groups A–F in audit L-247) — quarantine via the existing
  `test:quarantined` script with an L-id, **never `.skip`/delete to green the board**; **0.5d** flip the gate to
  blocking; **0.5e** record it in **C10**'s CI-gate inventory and correct the "CI-enforced / merge-blocking" claim in
  **C01** + `CLAUDE.md`, which is true for lint/boundaries/ga-gate but **false for every unit test**. **Gate G0.**
  *Ordering is load-bearing: the gate lands RED and FIRST — fixes with no gate behind them regress by the next commit.*
  **0.5b SHIPPED (`d98f75e1`)** — `apps/editor` gains `test:ci`; new advisory `test-unit` job runs its 1,495 tests,
  the first unit tests ever to execute in CI. Not in required-checks until 0.5d.
  **⚠ 0.5f — NEW, FOUNDER DECISION, and it partly defeats the gate.** `ci.yml` triggers on **`pull_request` → `main`
  + `workflow_dispatch` ONLY** (§A.10.i, to save Actions minutes) — **it does NOT run on a direct push to `main`.**
  But push-straight-to-`main` **is** the founder's loop (every fix in this audit shipped that way, incl. L-246/L-248).
  **A gate that only fires on PRs will almost never fire.** Options: **(a)** also run `test-unit` on push to `main`
  (`paths-ignore` keeps doc pushes free) — *recommended, the only option that makes the gate true without changing how
  the founder works*; **(b)** move code changes to a PR flow; **(c)** accept G0 guards PRs only — **then say so out
  loud, because the gate is otherwise decorative.**
- **0.6 Level-explode offset compounding** (L-248 / §FIX-LEVEL-EXPLODE-OFFSET-COMPOUNDING) — **SHIPPED**
  (`7192e4cb`). **NOT the live prod regression I escalated it as** — H3 was right: the *guard* was broken, not the
  product; L-113 is not regressed and users were never affected. **But the guard broke because the product carried a
  latent two-clock defect.** `_startRaf()` seeded `_lastTime` from the **ambient** `performance.now()` while `_tick`
  differences it against a `now` **injected** by the FrameScheduler. A negative `dt` inverts the approach factor
  (`k = 1 − 0.01^(dt·10)` goes large-negative), so `position.y += diff·k` **diverges** — ~1e+119 in a few frames. The
  old `Math.min(dt, 0.05)` was an **upper** clamp only. Fix: **one clock, the injected one** (first tick adopts its own
  `now`, dt = 0) + clamp dt to **[0, 0.05]** — the lower bound is load-bearing and kills the whole bug class. 19/19
  green (was 10 red); suite 34→22 failures; root tsc 0. **The test only ever passed while the suite booted in under a
  second — it rotted with zero product change, and nothing saw it. That is the case for G0, made concrete.**

## Phase 1 — CORE INTERACTION CORRECTNESS — **MUST for launch**
The everyday gestures must be exact and smooth. Gate: G4, G5, G6.

- **1.1 Selection exact-pixel-first** (L-04 / Q4 / §SELECT-EXACT-PIXEL-FIRST) — *agent a536dda*. Exact cursor pixel
  wins; radius fallback only when empty, nearest-candidate + depth tiebreak. **Gate G4**.
- **1.2 Wall-draw preview responsiveness** (L-09 / Q8 / §FIX-WALLPREVIEW-RENDER-REQUEST) — *agent aebe543*. Sub:
  1.2a render-request every pointer-move; 1.2b defer tier-escalation/pipeline-rebuild during draw; 1.2c suppress
  TRAA on transient preview. **Gate G5**.
- **1.3 WebGL2 ghost-on-rotate** (L-05 / Q5 / §FIX-WEBGL2-GHOST-ON-ROTATE) — *queued*. Per-move clear/invalidate
  of the OBC base framebuffer on the WebGL2 path only. **Gate G6**.

## Phase 2 — MODELING COMPLETENESS — **MUST for launch**
Every visible element must be movable, rotatable, dimensionable, materialisable. Gate: G7.

- **2.1 Uniform transform command family** (L-07 / F5 / F8) — new `transform.move` / `transform.rotate` contract
  (extends C16) + ADR. Sub: 2.1a design ADR; 2.1b implement for furniture + columns/beams; 2.1c stairs/handrails/
  lighting/plumbing; 2.1d gizmo + properties panel both dispatch it; each with undo + OTel span.
- **2.2 Uniform material/finish affordance** (L-08 / F6) — `material.set` per element honouring C18. Sub: 2.2a
  design; 2.2b structural/MEP/furnishings; 2.2c properties-panel wiring. **Gate G7**.

## Phase 3 — VIEWS & ANNOTATIONS SOUNDNESS — **MUST for launch (verify-first)**
Gate: G8, G9. Start with verification (audit §3.5/§3.6 N/V cells) → fix what's broken.

- **3.1 View creation & management** — verify end-to-end from UI: new plan/elevation/section view, view range/crop,
  section/elevation mark placement + navigation, viewport scale on sheet. Fix gaps found. **Gate G8**.
- **3.2 Annotations & dimensions** — verify linear-dimension placement (note OBC linear/angle/slope "not present"
  — confirm PRYZM-native dimension path), edit/delete, persistence + plan re-projection, tag auto-populate. **Gate G9**.

## Phase 4 — SAVE/LOAD & LIFECYCLE ROBUSTNESS
Gate: G2 (deepened) + G10.

- **4.1** Determinate load progress UI for large projects (beyond 0.3a). 
- **4.2** Autosave coalescing across multi-batch generation (extends §AUTOSAVE-BATCH-SUPPRESS).
- **4.3** Undo/redo soundness at scale across move-with-openings, views, annotations. **Gate G10**.

## Phase 5 — POLISH & PERF HARDENING (nice-to-have for v1; fast-follow ok)
- **5.1** W5 hygiene: fix `CLAUDE.md` contracts path (`docs/02-decisions/contracts/`, not `docs/00_Contracts/`);
  E.5.6 bridge explicit-error path; `window.__pryzmInitComplete` sentinel.
- **5.2** Instancing/perf beyond nav (memory pressure, dispose safety — respect §SHADOW-DEVICE-LOSS-FIX).
- **5.3** GLB furniture object-storage hosting (needs founder infra).

---

## Launch gate board (mirror of audit §4)

| Gate | Phase | Owner | State |
|---|---|---|---|
| **G0 the unit tests actually gate CI** | **0.5/0.6** | **queued (platform/CI-governance)** | **OPEN — CRITICAL. The gate under every gate below: `ci.yml` never runs `test:ci`, 122 workspaces are invisible to it, and the editor's 1,495 tests (22 RED after L-248) have never run in CI. Until G0 closes, every "green" state on this board is asserted, not measured.** |
| **G1 no host-wall-move freeze** | **0.0** (was 0.1/0.2) | **queued (wall-rebuild agent)** | **🔴 REOPENED — CRITICAL. L-250: founder re-reported 2026-07-13 with a log + screenshot; the freeze is LIVE after three fixes (L-01, L-97, L-234). The screenshot shows the PROPERTY-PANEL `Length` edit — a path L-234 never measured. This is the #1 item on the board.** |
| G2 no heavy-load freeze/fail | 0.3 | a14d3b7 | in flight |
| G3 smooth heavy-nav | 0.4 | aa374d0 | in flight |
| G4 correct selection | 1.1 | a536dda | in flight |
| G5 smooth draw preview | 1.2 | aebe543 | in flight |
| G6 no rotate ghosting | 1.3 | queued | queued |
| G7 move+rotate+material all elements | 2.1/2.2 | queued | queued |
| G8 view creation/management | 3.1 | verify | pending |
| G9 annotations+dimensions | 3.2 | verify | pending |
| G10 undo/redo at scale | 4.3 | pending | pending |

**Current fleet (6/6):** Q2 nav-perf · Q3 load · house-circ · Q8 wall-preview · Q4 selection · Q6 edit-storm.
As each lands (merge→gate→push) the freed slot takes the next queued gate item (G6 → G7 → G8/G9).

---

## Reported-item → phase mapping (L-11 … L-37)

| L-id | Phase | Status |
|---|---|---|
| **L-259 Cesium 3D globe: wrong elevation (underground) + wrong location, INTERMITTENT** | **1.x geospatial (C12)** | **OPEN - HIGH.** Menorca, near sea level, and the house renders UNDERGROUND - *sometimes*. **The intermittency is the clue: a geodetic transform is deterministic, so the variable is WHEN the terrain height is known.** Leading hypothesis: the model is anchored while the terrain/3D-Tiles sample is still async-loading, so the anchor falls back to **ellipsoid height 0** - and the **geoid/ellipsoid separation in the Balearics is ~+48-50 m**, which buries it. **Cesium's `fromDegrees(lon,lat,height)` takes an ELLIPSOIDAL height; architectural elevations are ORTHOMETRIC (MSL). Mixing them = ~50 m error.** Separately, *"the house is not in the correct LOCATION"* - an elevation bug CANNOT move it horizontally, so there is a SECOND (georeferencing/LTP-ENU) defect. **Split them; fix the race, not the maths; write the datum rule into C12.** Log also carries two TSL faults for the L-253 agent: `[ScenePass] TSL module not loaded. Call initTSL() before createScenePass()` (swallowed by ViewportCrashGuard) and `THREE.TSL: Invalid generated code, expected a "float"`. |
| **L-258 site-plan overlay: inverted order + Finish never enters canvas** | **1.x onboarding / site-first (C12 / C19 / C06)** | **OPEN - HIGH. THIS IS THE FIRST THING A NEW USER DOES.** Two defects: **(A)** the import fires on mode ENTRY, so the overlay lands at a random map location before the user has navigated to their site - the order must be **locate -> overlay -> place/calibrate**; **(B)** *"Finish - enter canvas"* **does not enter the canvas** - the user is stranded on the map with an Import Manager entry and no way into the model. Expected: land in the 3D view, **split view (3D + plan)**, with the PDF/JPG committed as an underlay in BOTH panes. **His boot log proves every piece already exists** (`CREATE_UNDERLAY`/`TRANSFORM_UNDERLAY`/`DELETE_UNDERLAY` registered, `UnderlayPersistence` installed, `Underlay Render Service` initialised, `ImportManagerPanel` mounted, `SplitViewManager` ready) - **so this is a WIRING/ORDERING bug, not a missing feature.** Model it as a state machine (`locating -> placing -> finished`); anchor the overlay in **LTP-ENU (C12)**; commit through the bus (**P6**) as one undo entry; guard with an end-to-end test. |
| **L-256 dimension not selectable/editable + unaudited** | **3.2 annotations/dimensions (Gate G9)** | **OPEN — HIGH.** Dimensions RENDER but cannot be SELECTED or EDITED, and their contract conformance has never been audited. Under **P6/C03** a dimension is an ELEMENT: schema, store, commands, one undo entry, selection, properties. **Founder asked for the CONFORMANCE AUDIT FIRST** — produce the six-point matrix (L0 schema · store · C16-compliant commands · single undo · pen table · OTel span); *the missing entries are the work*. **Then the ADR question he must answer before any code: does an editable dimension DRIVE the geometry (a real constraint, Revit-style) or only OVERRIDE the displayed text? Those are different products — do not guess.** Reuse `auto-dimension` + annotation commands; no parallel path. |
| **L-253 WebGPU 3D-scene stutter (renderer, NOT geometry)** | **0.-1 (Gate G3) — do BEFORE 0.0** | **OPEN — CRITICAL. The warnings NAME the bug.** `THREE.Color target has no corresponding fragment stage output … While validating targets[1] … CreateRenderPipeline` → `[Invalid RenderPipeline] … While calling [Queue].Submit`. **The MRT ScenePass declares a second colour attachment the fragment shader never writes, so the render pipeline is INVALID and every frame's submit is REJECTED** — a validation-error flood, not a slow GPU. Explains the founder's cure exactly: a live backend swap rebuilds the pipeline and it goes smooth. **Very likely the true root of L-250** (geometry is backend-agnostic — if swapping the renderer fixes it, the fault is the renderer). |
| **L-254 window plan symbol not sound** | **3.2 annotations/drawing** | **OPEN.** The window has no LOD-300 plan symbol: no frame block, no jamb rebate, no glazing double-line, no sill, no pen hierarchy — it reads as a flat band. **The DOOR has all of this** (`DoorPlanSymbolBuilder`, L-241/L-252). Doors and windows are ONE family under **C15** and must be drawn to ONE standard. **Do not write a second symbol engine** — mirror the door's structure, reuse the shared `DetailLevel` enum, and keep L-127 dimensional truth (every dimension from the element's real record, never a literal). |
| **L-255 floor finish: plan tool skips the setup modal** | **2.3 creation defaults (C11)** | **OPEN — HIGH.** The 3D floor-finish tool opens a modal that collects the **elevation**; the plan `Auto` tool creates immediately with a silent default. **Sixth instance of the signature disease: one element, two creation paths, and the plan path drops what 3D resolves** (cf. L-239 layers, L-240 inner face — *the same element*, L-243 stair config, L-246). Fix = converge at the `floor.create` chokepoint via a `PlanToolDrawContext.floorFinishConfig`, exactly as L-243 replaced the scavenged `window.activeStairConfig` global. **Ask once per tool activation, not once per click** — the Auto tool is a rapid repeat-click flow. |
| **L-251 wall mitre destroyed by a third wall (L/T)** | **0.0b** | **SHIPPED** (`c495a534`, §WALL-JOIN-INTENT). **Reproduced exactly**: arm A's mitre normal goes `707107,707107` → `null` the instant a same-type collinear wall joins. Root cause: L-122 froze the corner only for a **different** `systemTypeId`, and its own comment concedes *"a same-type newcomer still passes through"* — the founder draws everything as "Plain Wall". **A mitred corner and a T-junction are the SAME GEOMETRY**, so no geometric rule can separate them; a `createdAt` heuristic was tried and REVERTED (it turns the genuine T-junction guards red). Founder decision: **pass the authoring gesture.** New optional `joinIntent` on the wall record, captured ONCE at the C11 creation chokepoint (a committed junction already existed at that endpoint ⇒ `butt`), consumed by the resolver. 249/249 — the founder's corner is fixed AND every T-junction still square-caps. |
| **L-252 door plan symbol not "real sound"** | **3.2 annotations/drawing** | **SHIPPED** (§FEAT-DOOR-PLAN-SYMBOL-LOD300-DEFAULT). The full LOD-300 door — frame rebate, threshold, lever hardware — **has been implemented since L-241 and never once ran**: every view was stamped `detailLevel: 'medium'`, and LOD 200 excludes exactly those three BY DEFINITION. Fix = `DEFAULT_DETAIL_LEVEL` `'medium'` → `'fine'`, and `DefaultViewsManager`'s three hard-coded literals now read the shared constant — killing the same enum fork L-241 existed to kill. Composes with L-246: the wall is truly sectioned, so the door draws its detail into a real void. |
| **L-250 wall+hosted-door FREEZE (founder #1, recurrent)** | **0.0 (Gate G1 REOPENED)** | **OPEN — CRITICAL.** Survived L-01/ADR-0099, L-97 and L-234. **The founder's screenshot shows the PROPERTY-PANEL `Length` edit, not a drag — and L-234 measured only the drag path.** Four call sites reach `wall.updateBaseline`; the panel one carries no `_recordUndo`/`_skipBridge` and moves ONE ENDPOINT (changing junction topology). Our own source already names the failure: a moved door-bearing wall in a `§SELF-CLUSTER-GUARD` cluster makes the flush *"re-arm EVERY rAF frame and never converge → the founder's hard freeze"*. **REPRODUCE ON THE PANEL PATH FIRST — every prior root cause is refuted until re-proven.** |
| L-246 plan: door must CUT the wall | 3.2 annotations/drawing | **SHIPPED** (`2fe5cf8b`, §FIX-PLAN-DOOR-CUTS-WALL). All 4 briefed hypotheses refuted: the opening-clip machinery was never the bug — **`A-WALL:cut` was ALWAYS empty** (`classifyByVertexY` only tags edges within 15 cm of the cut plane, and a wall has no edge near a 1.2 m cut). Fix cuts the SOLID (true plane∩triangle section), so the door void is empty **by construction** on every render path — which also explains the missing poché (L-241). 9/9 specs; snapshots unchanged; root tsc 0. **Projection-line clip (`_suppressPlanViewOpeningLines`) still unproven on screen — founder verification wanted.** |
| **L-247 unit-test estate is not a CI gate** | **0.5 (Gate G0)** | **OPEN — CRITICAL.** `ci.yml` never calls `test:ci`; `--if-present` skips the **122 workspaces** (incl. `@pryzm/editor`) that lack a `test:ci` script; **1,495 editor tests, 34 RED, have never run in CI.** The "CI-enforced / merge-blocking" claim in C01/`CLAUDE.md` holds for lint/boundaries/ga-gate and **is false for every unit test**. Gate lands RED first, then triage product-first. |
| **L-248 level-explode offset compounding** | **0.6** | **SHIPPED** (`7192e4cb`). **My "suspected live regression" was WRONG — H3 was right: the guard broke, not the product; L-113 is intact and users were never affected.** But the guard broke on a real latent defect: `_startRaf` seeded `_lastTime` from the **ambient** `performance.now()` while `_tick` gets an **injected** `now` — a negative `dt` inverts the lerp (`k = 1 − 0.01^(dt·10)`) and `position.y` **diverges to ~1e+119**. The old clamp was upper-bound only. Fix = **one clock (the injected one)** + clamp dt to **[0, 0.05]**. 19/19 green; suite 34→22; tsc 0. |
| **L-249 live climate normals never loaded** | **0.5c (found BY Gate G0 triage)** | **SHIPPED** (`d5e5176e`). **A LIVE PRODUCTION BUG.** `ensureSiteClimate` is offline-first: stage 1 resolves BUNDLED, stage 2 upgrades to live. But `resolveNormals` cached by lat/lon only, so **stage 1's bundled result was returned to stage 2 as a cache hit and the live fetch was NEVER ATTEMPTED.** Every site has been pinned to `fallback-defaults` for the life of the path; the Open-Meteo/PVGIS integration was dead code behind a cache hit. Fix = **tier-aware cache** (a bundled entry is a fallback, not an answer — it must not short-circuit a caller that can fetch live). 9/9; climate-host 99/99; tsc 0. **Found only because G0 forced "is the TEST wrong, or is the PRODUCT wrong?" on a red line that looked like rot.** |
| L-11 Environment real sun/shadows/buttons | new **Phase 3.3** (real environment) | **SHIPPED** `§FEAT-REAL-ENVIRONMENT` (ADR-0106) — real sun drives the Pascal key light (KeyLightHost seam, real+offset/manual modes, time-of-day) + invisible L0 `GroundShadowCatcher`; no parallel light, ADR-0111/§PERF-HEAVY-SHADOW-OFF intact. 12 tests. Remainder: verify AO/bloom/exposure post-FX reach the live WebGPU renderer. |
| L-12 wall T-junction spike | 0.5 geometry soundness | **SHIPPED** (ADR-0055 §FIX-WALL-TJUNCTION-BUTT, batch 2) |
| L-13 plan-view door jamb gap | 3.2 annotations/drawing | **SHIPPED** (ADR-0104) |
| L-14 floor-finish default thickness=offset | 2.3 creation defaults | queued |
| L-15 properties panel polish | 1.4 UI soundness | **SHIPPED** (ADR-0103) |
| L-16 spacebar-rotate preview during placement | 2.1 placement-preview UX | **SHIPPED** (ADR-0107, wave 4c) |
| L-17 element "change type" swap (all elements) | 2.4 element type-swap | **SHIPPED** (ADR-0105) |
| L-18 duplicate furniture on collab open | 4.x save/load/collab | HELD (user-cancelled acc09ea) |
| L-19 rotate gizmo single-axis default | 2.1 transform | HELD (user-cancelled) |
| L-20/21/23 placement preview immediate/accurate/parametric-rotate | 2.1 | **SHIPPED** (ADR-0107, wave 4c) |
| L-22 library card diagrammatic symbols | 1.4 UI/symbols | **SHIPPED** (ADR-0110, wave 4c) |
| L-24 MOVE_DOOR offset=NaN on catch-up | 4.x collab | HELD (user-cancelled acc09ea) |
| L-25 WebGPU black-screen (shadow mid-submit destroy) | 0.4 render/perf | **SHIPPED** (ADR-0111, wave 4c) |
| L-26 wall-draw align-guide perpendicular | 1.2 draw UX | **SHIPPED** (wave 4c) |
| L-27 wall T-junction cluster (L-corner + 3rd wall) | 0.5 geometry soundness | **SHIPPED** (§FIX-WALL-CLUSTER-DEGENERATE, wave 4f) — degenerate <0.20 m stub doubled in cluster → bow-tie neg-area footprint = black; detect+strip+skip |
| L-28 plan wall-tool active-by-default | 1.2 tool activation | **SHIPPED** (wave 4d) |
| L-29 wall-move preview dimensions (ortho) | 2.1 move UX | **SHIPPED** (wave 4d) |
| L-30 hosted door/window move dims (along wall) | 2.1 move UX | **SHIPPED** (§FEAT-HOSTED-MOVE-DIMENSIONS, wave 4h) |
| L-31 cross-level slab-corner refs + snap-bounds fix | 1.2 snapping | **SHIPPED** (ADR-0112, wave 4d) |
| L-32 slab-by-region preview mirror | 2.3 creation | **SHIPPED** (wave 4d) |
| L-33/34/35 kitchen 2nd-place / L-shape preview / pro plan symbol | 2.3 creation/kitchen | **SHIPPED** (ADR-0113, wave 4e); L-23 space-rotate verified |
| L-36 shower fixture wrong direction | 2.3 plumbing/placement | **SHIPPED** (ADR-0114, wave 4f) |
| L-37 composite shower+glass+gutter type | 2.3 plumbing/catalogue | **SHIPPED** (ADR-0114, wave 4f) |
| L-38 site-plan overlay + Project/True North | 3.4 site/geo dual-north | **PARTIAL** (ADR-0115, wave 4g-a) — dual-north model + OK-sets-PN + always-on site view shipped; raster-render + flow completion = L-58 |
| L-39 freeze after project load (load-time shadow realloc mid-submit) | 0.4 render/perf | **SHIPPED** (ADR-0111 §FIX-SHADOW-LOAD-TIER-DESTROY, wave 4g-b) — CRITICAL |
| L-40 3D globe/site always reachable | 3.4 site/geo | **SHIPPED** (ADR-0115, wave 4g-a) |
| L-41 plan view ignores chosen wall type | 1.2/types | **SHIPPED** (§FIX-PLAN-WALL-TYPE-IGNORED, wave 4g-a); true root = L-50 |
| L-42 camera navigation dead after load | 0.4 render | **SHIPPED** (downstream of L-39, wave 4g-b) |
| L-43 wall move/rotate broken in plan view | 2.1 move UX | **SHIPPED** (§FIX-PLAN-WALL-TRANSFORM, wave 4g-c) |
| L-44/46/47 wall length changes on nearby edit / type-change / 3-wall join | 0.5 geometry integrity | **SHIPPED** (§FIX-WALL-JOIN-BASELINE-IMMUTABLE, wave 4g-c) — join never mutates a stored baseline |
| L-45 underlay delete throws + localStorage quota | 4.x persistence | **SHIPPED** (§FIX-UNDERLAY-DELETE-AND-STORAGE, wave 4h) — register handlers + raster→IndexedDB |
| L-48 SHIFT multi-select + multi-property edit | 1.1 selection | HELD (user-cancelled; WIP in stash@{0}) |
| L-49 3D wall move not captured by Undo | 4.3 undo | **SHIPPED** (§FIX-WALL-MOVE-UNDO-CAPTURE, wave 4g-d) |
| L-50 dual wall-type catalogue (P1 root under L-41) | 0.5/arch | **SHIPPED** (ADR-0116 §FIX-WALL-TYPE-UNIFY-CATALOGUE, wave 4g-e) |
| L-51 undo routing asymmetry (plan vs 3D) | 4.3 undo | **SHIPPED** (§FIX-PLAN-WALL-MOVE-UNDO-UNIFY, wave 4g-e) |
| L-52 plan-projection cache thrash (L-06 storm mechanism) | 0.4 perf | **SHIPPED** (§FIX-WALL-VERSION-CONTENT-HASH, wave 4g-e) |
| L-53 collab silently drops concurrent baseline move (C08) | 4.x collab | SCHEDULED (needs shared CRDT id normalization first; finding recorded) |
| L-54 dual junction-resolver dead compute + `_flush` guard-pile | 5.x tech-debt | SCHEDULED (high-risk refactor; ADR-0055A P4a/P4b) |
| L-55 P8 span coverage (wall handlers) | 5.1 | **SHIPPED** (§P8-SPAN-COVERAGE codified, wave 4g-e) |
| L-56 door/window hosted on slab id → orphan opening | 2.3 hosting | **SHIPPED** (§FIX-DOOR-SLAB-HOST, wave 4h) |
| L-08/L-57 uniform material.set command across all element families | 2.2 materials (G7) | **IN FLIGHT** (Q7; ADR-0117 — facade+wiring drafted, per-family handlers incomplete/uncommitted; re-dispatch) |
| L-58 "Overlay a plan/PDF" not visibly working (raster non-render + flow) | 3.4 site/geo | **SHIPPED (pending merge)** (§FIX-SITE-OVERLAY-RENDER-AND-FLOW, commit e569daf6) — root: satellite `setStyle({diff:false})` tore down overlay layer; self-heal on `style.load` + auto-place + SiteOverlayRasterStore(IDB) + wizard-advance event; 44 tests |
| L-59 SSGI flicker (WebGPU) + TRAA black-flash on selection | 4.x render | **IN FLIGHT** (render lane, agent a7ae0228; SSGI default-off + TRAA flash; must not regress ADR-0111) |
| L-60 UI buttons overlap (split-view / Site-Globe over logo) | 1.1 UI/layout | **SHIPPED (pending push)** (§FIX-UI-BUTTON-OVERLAP, 0a8c1633) — split-view→bottom:144px, Site/Globe→top:56/left:220 |
| L-61 T/L wall joint still not clean (L-corner + 3rd-wall T) | 0.5 geometry | **SHIPPED (pending push)** (§FIX-WALL-LCORNER-T-CLEAN, a16ac169) — spike+doubled-edge were ONE bug (tee-attacher dissolved L-mitre); cluster-split pass; 129+107 tests |
| L-62 layered wall type renders as plain default in PLAN view | 0.5 geometry / plan-projection | **QUEUED (sole-wall lane, behind L-61)** — plan projection must emit LAYERED footprint (two render paths), not plain single-volume; C15/ADR-0055 |
| L-63 hosted-door wall MOVE freezes app (recurring; runaway rebuild loop) | 0.5 geometry / room-detect | **QUEUED (sole-wall lane, TOP — BLOCKER)** — resolver trim leaves >hostSnap dangling gap → non-closing loop re-arms rAF rebuild; fix trim + loop-guard redetect; ADR-0055 |
| L-64 black flash on polyline wall CLOSE (ShadowDepthTexture destroyed mid-submit) | 4.x render / ADR-0111 | **QUEUED (render lane, extends L-59)** — ref-count/defer shadow-map realloc across wall-commit frame (setShadowReallocFrozen family); must not regress L-39/L-59 |
| L-65 plan-view element creation lags ~0.5s (full plan re-projection per add) | 0.4 perf / plan-projection | **QUEUED (plan-projection perf lane, own agent)** — incrementally project only the newly-dirtied element (EdgeProjectorService + NativeElementMeshExporter + ViewDependencyTracker); MUST NOT touch wall geometry (sole-wall lane); builds on L-52/L-06; C04/DOC-1.x |
| L-66 plan-view wall tool needs extra "Apply" trigger to arm (3D immediate) | 2.1 plan-tools UX | **QUEUED (plan-tools lane, own agent)** — arm WallPlanToolHandler on tool-activate with current/default systemType (SvpPlanToolOverlay); make wall-type panel "Apply" optional (change-type only), never a gate; MUST NOT edit wall geometry (sole-wall lane); C11; sibling of L-41/L-50 |
| L-67 REGRESSION: catalog preview thumbnails replaced by generic line-art icons | 2.2 UI/catalog | **QUEUED (UI/catalog lane, own agent)** — restore image-preview path in catalogue card render (FloatingObjectCarousel / object-library / AssetCatalog thumbnail resolver); parametric icon = fallback-only; thumbnails must not depend on un-hosted GLBs (mem furniture-glb-404) |
| L-78 Finish-enter-canvas still doesn't land plan on canvas + old duplicate PDF-select menu on zoom | 3.4 site/geo | **IN FLIGHT (site agent aa0db418, with L-77)** — verify Finish→underlay renders in canvas + GIS exits end-to-end; remove stale duplicate uploader; ADR-0115 |
| L-79 sibling room handlers (setNumber/setOccupancy/etc.) same store-key bug as L-75 | 2.x rooms | **QUEUED (rooms lane)** — bridge each to legacy command (§FIX-ROOM-SETNAME-STORE pattern); ADR-002 |
| L-80 schedules edit/view mode | 3.x data/schedules | **QUEUED (data lane)** — editable+viewable schedule UI on Schedule Store; P6 |
| L-81 project DUPLICATION doesn't work | 4.x persistence | **IN FLIGHT (persistence lane)** — duplicate must deep-copy snapshot+versions under new id; C13/C05 |
| L-83 opening a project doesn't work (latest-version 404) | 4.x persistence | **QUEUED (persistence lane)** — open/streamLoad falls back to local snapshot on 404; sibling of L-81; C13/C05 |
| L-88 Import Manager sound at all times + persists across reopen | 3.4 site/import | **QUEUED (import/underlay lane, site agent)** — serialize+rehydrate import records; panel rebuilds on project-loaded; actions robust after reopen; L-45/L-58/L-71; C13/ADR-0115 |
| L-92 door flip on SPACE during placement (in/out + left/right) | 2.1 placement UX | **QUEUED (door placement lane)** — mirror furniture space-rotate (ADR-0107) for door hand×swing 4-state cycle in preview; C11/C15 |
| L-93 wall junction unclean at L-corner with a door opening nearby | 0.5 geometry | **QUEUED (sole-wall lane, with L-91)** — opening/MiterPrism path must mitre the corner cleanly with an opening near it; no spike/notch; ADR-0055/C15 |
| L-91 wall result still biased vs preview (remaining case) | 0.5 geometry | **QUEUED (sole-wall lane)** — eliminate residual executed-vs-preview bias at joins; executed baseline==preview; continues §FIX-NEWWALL-LCORNER-SKEW; ADR-0055 |
| L-90 [BLOCKER] plan view blank after wall create (stale-gen rejects projection) | 0.4 perf/plan-projection | **IN FLIGHT (plan-projection agent, FIX FIRST before L-89)** — never leave plan blank: fall back to prior/full projection on stale-gen; coalesce double redetect; guard incremental graft under gen race; regression of L-65; C04/DOC-1.4 |
| L-89 plan-view projection engine too slow on create (esp split view) | 0.4 perf / plan-projection | **QUEUED (plan-projection perf lane, extends L-65)** — verify incremental graft fires in split view; decouple REDETECT_ROOMS from interactive create; per-element not full-view; keep accuracy; C04/DOC-1.4 |
| L-84 copy not working | 1.1 selection/clipboard | **QUEUED (selection lane)** — copy captures selection, paste recreates via bus w/ new ids; C16 |
| L-85 kitchen/wardrobe/lighting lost on re-open | 4.x persistence | **QUEUED (persistence lane, w/ L-81/L-83)** — serialize+restore these stores in snapshot; C13/C05 |
| L-86 furniture base-offset missing | 2.x furniture | **QUEUED (furniture lane)** — add base-offset field schema+inspector+builder; C03/C15 |
| L-87 furniture default to FFL not slab | 2.x furniture | **QUEUED (furniture lane, w/ L-86)** — resolve create Y to floor-finish FFL; C15 |
| L-82 window dim-change out-of-bounds destroys opening + undeletable | 2.3 hosted/openings | **QUEUED (hosted-element lane, coord sole-wall)** — guard opening on OOB frame, restore when back in bounds, keep window deletable; C15 |
| L-77 double panel in site-overlay flow (overlay panel + plot-choice card both visible) | 3.4 site/geo UI | **IN FLIGHT (site agent aa0db418)** — dismiss onboarding plot-choice card when overlay panel shows; single active panel; extends L-70 |
| L-75 room rename not applied on Enter (room.setName missing 'room' store) | 2.x rooms/command-wiring | **QUEUED (rooms lane, quick)** — add `room` to room.setName storesProvider (ADR-002 §3); Enter commits+persists+re-renders tag; handler test |
| L-73 plan-view feature parity (main vs split) | 2.1 plan-tools | **QUEUED (plan-tools lane, resume L-66 agent)** — reconcile PlanViewToolOverlay (main) vs SvpPlanToolOverlay (split) so both expose same features (move door/window etc.); C11 |
| L-76 wall created near L-joint executes wrong (preview correct) | 0.5 geometry | **QUEUED (sole-wall lane, with L-74)** — IS the missing repro for L-63 Part-1 resolver-trim; executed footprint must match preview (perpendicular, length preserved), no taper/skew; ADR-0055 |
| L-74 RECURRENT black triangular-prism solids at T/L wall joints | 0.5 geometry | **QUEUED (sole-wall lane, behind L-63/L-62)** — square-cap/partition-trim emits bow-tie/neg-area footprint prism (black) at some T/L clusters; detect+repair, verify on reopened project; ADR-0055; builds L-27/L-61/L-63 |
| L-72 [CRITICAL systemic] undo doesn't capture element move/rotate/property (any element) | 4.3 undo robustness | **QUEUED (undo lane — hand to furniture/undo agent after L-68)** — audit EVERY element's move/rotate/property command for correct affectedStores + invertible PatchPair (same class as L-49); matrix test create→move/rotate/prop→undo per type; C03 §4.5–4.8 / performUndoRedo |
| L-68 furniture type-swap: wrong candidate list + broken undo (2 bugs) | 2.4 type-swap + 4.3 undo | **QUEUED (furniture type-swap + undo lane, own agent)** — (1) filter TYPE dropdown to element's own family (bed→beds); (2) CHANGE_FURNITURE_TYPE mints new id → undo can't restore original; mutate-in-place OR emit correct invertible PatchPair; ref L-17/ADR-0105 + performUndoRedo; C16/C03 |
| L-71 [HIGH PRIORITY] bring calibrated plan into PRYZM canvas as Project-North-aligned underlay | 3.4 site/geo/underlay (ADR-0115 §Remaining #1) | **IN FLIGHT (site agent aa0db418, PRIORITY)** — on Finish, instantiate calibrated raster as plan-canvas underlay (CREATE_UNDERLAY + UnderlayRasterStore + UnderlayRenderService) at project origin, scaled by calibration mpp, ROTATED by Project-North θ (projectTrueNorth) → orthogonal in plan so user traces walls over it; C18/C19 |
| L-70 PDF/image import still offers Generate-house + boundary draw — must go straight to canvas | 3.4 site/geo (extends L-69) | **IN FLIGHT (resume site agent aa0db418)** — image-import branch: don't arm boundary draw, don't show generate-confirm, relabel "Overlay a plan/PDF"; Finish = sole terminal → canvas; other branches intact; ADR-0115 |
| L-69 PDF/image import: 2-pt calibration dead + flow forces boundary/generate | 3.4 site/geo (extends L-58) | **SHIPPED (4aaf1c74, wave 4j)** — (1) exclusive calibration click during `calibrating` (suppress boundary-draw + stopPropagation) → apply computeCalibrationScale; (2) make image-import TERMINAL: "Use this placement"→ set Project North + keep plan as canvas underlay + land in editor canvas, NO boundary-trace/generate (that stays a separate choice); ADR-0115; C18/C19 |

**Waves shipped to Fly (feat/wall-move-dimensions → main):** batch 1–3 → **4c** (`0543c337`: L-25/22/20-21-23/26) → **4d** (`103b14f0`: L-28/29/31/32/27-v2) → **4e** (`b9d55ff3`: L-33/34/35 kitchen) → **4f** (`9d27f6b7`: L-27 cluster + L-36/37 shower) → **4g-a** (`32c0d88e`: L-38 dual-north + L-40 globe + L-41 wall-type) → **4g-b** (`5a6efea5`: L-39/L-42 CRITICAL freeze/nav) → **4g-c** (`fcede3ca`: L-43 + L-44/46/47 baseline) → **4g-d/e** (`58ac4e15`: L-49 undo + wall hardening L-50/51/52/55 + wall audit) → **4h** (`c23d69f8`: L-56 + L-30 + L-45) → **4i** (`c809db1b`: **L-58 PDF/map overlay (priority)** + L-59 SSGI/TRAA flash + L-60 UI-overlap + L-61 wall L+T joint + Q7/L-08 materials; root tsc exit 0).
**In flight:** none (all four wave-4i agents landed). **Scheduled (sole-wall lane, in order):** L-63 hosted-door-move freeze (BLOCKER, top) → L-62 layered-wall plan render → L-53 collab-conflict → L-54 legacy-resolver retirement. **Scheduled (render lane):** L-64 wall-close black flash (extends L-59). **Scheduled (plan-projection perf lane):** L-65 plan-view element-create ~0.5s lag. **Scheduled (plan-tools lane):** L-66 wall tool arm-on-activate. **Scheduled (UI/catalog lane):** L-67 restore catalog preview thumbnails. **Scheduled (furniture type-swap + undo lane):** L-68 bed dropdown list + CHANGE_FURNITURE_TYPE undo. **Held (user-cancelled):** L-18, L-19, L-24, L-48. **Queued:** L-11 environment (stashed), L-14 floor-finish default, site-overlay localStorage follow-up, GLB object-storage hosting (needs infra).
**Wall subsystem:** deep audit committed (§3 Walls + L-50…L-55); geometry/join/undo correctness now sound; L-61 SHIPPED (4i); open wall debt = L-63 → L-62 → L-53 → L-54, all through the SINGLE sole-wall agent (no parallel wall agents).


---

| L-94 [RECURRENT] new wall on L-joint corner still renders broken joint (should be flush like preview) | 0.5 geometry | **IN FLIGHT (sole-wall agent)** — new wall must sit flush/pegado to the existing L, no spike/gap, executed==preview, incl. snap to corner node or midpoint; ADR-0055 |

| L-95 element-tool parity main vs split plan (Move/Rotate/Scale work in main not split) + make contractual | 2.1 plan-tools/contract | **IN FLIGHT (plan-tools agent)** — extend L-73 registry so ContextualEditBar tools route through SvpPlanToolOverlay too; add parity contract clause + test; C11 |

| L-96 split-view 3D pane must be a true mirror of main 3D (currently click-forwarding, misbehaves) | 3.x split-view/render/contract | **QUEUED (split-view agent, after L-95)** — render synced 3D mirror + harden pick; extend view-parity contract to 3D; C04 |

| L-97 [BLOCKER] wall+door then move → FREEZE via infinite rAF wall-rebuild _flush loop (distinct from L-63 room loop) | 0.5 geometry | **IN FLIGHT (sole-wall agent, TOP)** — make _flush/resolveLevel idempotent+convergent; no-progress guard + circuit-breaker on re-arm; SELF-CLUSTER-GUARD cluster must stabilize; ADR-0055 |

| L-98 split-view plan wall creation drops systemTypeId (=none) → plain wall not layered interior type | 0.5 walls/parity | **IN FLIGHT (plan-tools agent)** — thread active wall systemTypeId from SvpPlanToolOverlay into wall.create like main plan; fold into L-95 parity contract (incl. system type); §FIX-SPLIT-WALL-SYSTEMTYPE; test |

| L-99 [HIGH] 3D selection corrupted in main(when split on)+split 3D; plan view fine — GPU-pick target desyncs from live viewport across split toggles + gizmo attaches to detached object (per-frame flood) | 1.0 selection/picking | **QUEUED (plan-tools agent, AFTER L-96)** — resize pick target to live 3D viewport on split enter/exit+resize; resolve selection via Scene Registry (id→Object3D) so rebuilt mesh re-resolves; study pascalorg/editor; §FIX-3D-SELECTION-ROBUST; tests |

| L-100 furnish batch creation slow + 3D unmanageable after — per-element meshes defeat instancing, N-command batch | 1.5 furniture/perf | **QUEUED (furnish agent)** — one furniture.batch.create→one produceCommand+registerMany; render-suppress+single flush; instance furniture geo; converge to interactive tier; measure | 
| L-101 furnish-all-apartments/all-floors doesn't cover every unit | 1.0 furniture/coverage | **QUEUED (furnish agent)** — enumerate every level×apartment/room, furnish each, per-unit coverage report, robust to per-unit failure; test | 

| L-102 [AUDIT+PLAN] expose all batch-creatable furniture/accessory types (TV, mirror, curtains, …) via right-hand toolbar + verify 02-decisions compliance | audit+plan (impl TBD from plan) | **IN FLIGHT (furniture-UI-audit agent, READ+PLAN only)** — enumerate batch-creatable types vs toolbar gap; per-type contract/ADR/spec compliance; correct toolbar section+UX; write phased impl plan here. C11/C17/C03 | 

| L-103 reposition "3D Site/Globe" launcher pill (floats mid-canvas) → dock to left rail/corner | 0.3 site UI | **QUEUED (GIS/site agent)** — anchor via existing L-40 mount; always-on; responsive | 
| L-104 [FEATURE] Plan View GIS — plan view with real building/GIS context (project-north, ortho) | plan+impl | **IN FLIGHT (GIS/site agent)** — reuse site-overlay/underlay+Cesium pipeline (SitePlanOverlayController/UnderlayRenderService/ADR-0115), NOT a new engine; analyse+write plan then implement; C18-23; avoid SplitViewManager/selection/wall geometry | 

| L-105 add floor-finish + ceiling TYPE selector to creation panel (types exist only post-creation) | 1.0 floor UI | **QUEUED (floor-finish agent)** - selector from same catalogue as post-create dropdown; thread into CREATE_FLOOR/ceiling payload via bus | 
| L-106 floor-finish type SWAP broken - floor.updateLayers canExecute 'floor not found' on a just-created id | 0.5 floor commands | **QUEUED (floor-finish agent)** - fix store/id lookup to the store FloorTool writes; test create->select->swap type | 

| L-107 [L-11 regression] grey ground shadow-catcher plane visible on empty project | 0.5 rendering | **QUEUED (environment agent)** - make catcher invisible when no casters (add-on-first-element or fully-transparent ShadowMaterial on WebGPU); test empty=no pixels; no ADR-0111 regression | 
| L-108 empty project ~16s load hang (LOAD-WATCHDOG, hydrate=16s for 0 elements) | investigate | **QUEUED (environment agent to check L-11 initScene first)** - instrument setup/hydrate; defer any blocking RealEnvironment/site/ground-catcher init off critical path | 

| L-109 [FEATURE] Project Origin / Base Point (Revit-style) - new element category, always-on blue sphere, View-Intent toggleable, shared-coordinate datum | analyse+plan+impl | **IN FLIGHT (project-origin agent)** - L0 schema singleton (C03) + pipeline (C11) + renderer-three blue marker (P2) + visibility-intent/View-Intent toggle (P7/VG) + ADR-0115 shared-coord datum; write phased plan then implement | 

| L-110 [FEATURE] 4 default elevations (N/E/S/W) guaranteed on project startup (+existing plan+3D); deletable but re-created; project-north oriented | feature | **QUEUED (project-origin agent, with L-109)** - extend DefaultViewsManager via ViewDefinition store/elevation view type, ADR-0115 project-north, verify real elevation projection | 

| L-112 [L-11/107] ground shadow-catcher shows grey rectangle, not true time-of-day building shadow | rendering | **QUEUED (environment agent)** — make catcher receive the REAL sun-cast building shadow (accurate silhouette + direction/length per time-of-day); investigate WebGPU ShadowMaterial sampling + tighten sun shadow-camera frustum/res; keep ADR-0111 + L-107; test shadow footprint matches caster silhouette. ADR-0106/C04 | 

| L-113 [EDITING] level stacked/unstacked breaks coordination — floating selection + move commits wrong (jumps to original) | editing/level-explode | **IN FLIGHT (level-explode agent)** — explode offset must stay a pure display transform; make pick/gizmo/move convert exploded↔model space via active per-level offset; selection tracks exploded mesh; test move commits correct model pos | 
| L-114 [PERF] elevation NME cache 0% hit (500/500) on 7-level/909-elt building — new L-110 elevations | perf/views | **OPEN (obs)** — adaptive/per-view NME cache size OR frustum-scope elevation export OR per-(view,gen) elevation cache; confirm via §PERF | 

| L-115 [RECURRENT] plan Draw Wall dropdown shows layered type but panel says 'Plain Wall ready' → draws PLAIN (dropdown select doesn't arm the type; needs Apply) | walls/plan-arm UX | **IN FLIGHT (plan-tools agent)** — dropdown-select must ARM the type immediately (no separate Apply / 'Plain Wall ready' mismatch); plan≡3D for wall type; test dropdown-select→wall.create carries systemTypeId. §FIX-PLAN-WALL-TYPE-ARM-ON-SELECT | 

| L-116 [FEATURE] elevation MARKERS on ground plan for the 4 default elevations (L-110 follow-up) | views/annotations | **IN FLIGHT (defaultviews/elevation-marker agent)** — create one elevation-mark annotation per default elevation via existing section/elevation-mark infra + annotation store (P6), project-north oriented (ADR-0115), lifecycle tied to elevations, respects C24.1 + C03 annotation contract; test 4 markers on fresh project | 

| L-117 [BLOCKER] big tower crashes on first 3D nav — 4 L-110 default elevations eagerly reproject ALL elements on every flush → NME thrash → WebGPU crash | views/projection/perf | **IN FLIGHT (view-projection agent)** — make inactive-view (elevation) reprojection LAZY (only active view projects; defer others until opened) + scope/cache elevation export + adaptive NME cache (subsumes L-114); no L-110/L-108 regression; test 3D edit doesn't reproject elevations. §FIX-LAZY-INACTIVE-VIEW-PROJECTION | 

| L-118 [BLOCKER] elevation projection bleeds into 3D + elevations render empty ('Generating view…') + extreme slowness (1006 elts thrash) | views/elevation projection | **IN FLIGHT (view-projection agent, expands L-117)** — isolate elevation output to the elevation view layer (no 3D bleed) + make it actually render the building + lazy/perf (subsumes L-117/L-114); check marker-vs-projection bleed. §FIX-ELEVATION-PROJECTION-ISOLATION-AND-RENDER | 

| L-119 elevations render solid BLACK fill instead of projection linework | views/elevation style | **IN FLIGHT (view-projection agent, with L-117/L-118)** — render elevation as 2D line drawing (edge linework + HLR, faces transparent/white/poché not black), align with plan-view drawing convention; C24.1. §FIX-ELEVATION-LINEWORK-STYLE | 

| L-120 [ARCH+PERF REVIEW] holistic documentation/view-projection architecture + perf across all view types (plan/elevation/section/…) | review+plan | **IN FLIGHT (read-only Plan agent)** — unified incremental+lazy+scoped projection+cache model across view types; sizing/keying (subsumes L-114/117/118); linework style (L-119); extensible for sections+sheets; C04/C24.1/ADR-0115 | 

| L-121 [BLOCKER] wall+door move FREEZE — now amplified by L-110 elevations (every edit reprojects 5 views); L-117 lazy-active-view fix resolves it | walls+views | **IN FLIGHT (view-projection agent, = L-117)** — edit reprojects ONLY active view not the 4 elevations; test wall+door+move no freeze; L-97 guard still holds | 

| L-122 interior wall (diff type) joining exterior L-corner: original 2 walls must stay UNCHANGED + new wall joins clean (exec==preview) | walls/joins | **IN FLIGHT (sole-wall agent)** — enforce ADR-0055 baseline immutability: existing walls' mitre unchanged, only new interior wall trims to seat clean; test exterior baselines byte-identical + interior seats flush + exec==preview. Builds on L-94 | 

| L-123 [BLOCKER] elevation shows only portion of elements — crop-region CULLS straddling walls (binary in/out, 'Culled 7/10') instead of clipping; also applied=0/14 layers | views/elevation crop | **IN FLIGHT (view-projection agent, with L-117/118/119/121)** — clip elements to crop (render in-crop portion, don't cull whole); default crop encompasses model; fix 0/14 layer application. §FIX-ELEVATION-CROP-CLIP | 

| L-124 [refines L-123] elevation lines incomplete as crop EXTENDS (small crop perfect); crop scope correct but projection completeness degrades; applied=0/14 layers | views/elevation completeness | **IN FLIGHT (view-projection agent, with L-119/L-123)** — every in-scope element projects ALL true lines (edge+HLR) as crop/far grows; fix 0/14 layer application; clip-not-cull. §FIX-ELEVATION-PROJECTION-COMPLETENESS | 

| L-125 ESC does not deselect elevation (section does); deactivateAll fires but elevation crop-gizmo+marker selection persists | views/selection | **IN FLIGHT (selection agent)** — route elevation deselect through the SAME teardown as section on deactivateAll/unselectAll. §FIX-ESC-DESELECT-ELEVATION | 
| L-120 doc-subsystem architecture + perf review (ALL view types) | views/documentation architecture | **REVIEW DELIVERED** — root cause: pipeline is plan-first (level-scoped export/dirty/graft/cache); every optimization is bypassed/inverted for elevation/section → worst-case plan path at 7x elements x4 views. UNIFIED TARGET = **ViewScope descriptor** (direction/nearFar/elementFilter/classifyZone/poche) shared by plan/elev/section/future. PHASED: **P1** frustum-scope elev/section export (SAFE, overlaps L-118); **P2** re-key proxy cache (elementId,gen) NOT viewId + resize to working set (SAFE, biggest perf win, kills 0%-hit thrash); **P3** frustum-scope dirty marking (SAFE, complements L-117); **P4** elevation linework=no poche/no A-WALL:cut via ViewScope flag (=L-119); **P5** incremental graft for elev/section (remove isPlan gate initScene.ts:963, RISKY); **P6** unify NME proxy cache + EPS _cwProjectionCache (RISKY); **P7** isolated per-view render target (fixes 3D bleed structurally, RISKY); **P8** ViewScope as N-view-type + C24.1 sheets seam. Maps C04 §3.3 + DOC-1.x + C24.1 + ADR-0115. L-117 delivered; L-118 covers P1+sizing-half-of-P2; L-119 covers P4 symptom. Ship P1-P4 now (additive, revertible), schedule P5-P8. | 

| L-126 [FEATURE] wall set-out dims: project to all 4 sides + 2 blue/2 grey + TAB-into-dim numeric entry (defines wall point) → TAB cycles → ENTER commits | wall creation preview / dynamic input | **FIXED 7f3a6e80** (browser-verify TAB on prod) — extend computeSetOutDimensions to 4 dirs tagged primary/secondary; WallPlanToolHandler._drawWallPreview renders 2 blue+2 grey + TAB numeric overlay back-solving the vertex from the typed value; command-path placement. Maps C11+C16+wall-preview contract; pure maths; P8 spans. §WALL-SETOUT-4SIDE + §WALL-SETOUT-TAB-INPUT | 

| L-127 door preview: SPACE-flip (verify existing §FEAT-DOOR-FLIP-ON-SPACE) + exact selected-type dims (not hardcoded DOOR_WIDTH) + render door FRAME (jambs/head, no gaps) | door creation preview + frame (C15) | **FIXED 44d15c1c** — DoorDimensions resolver (preview≡placed) + frame posts/head + reveal-closing lines; §FIX-DOOR-PREVIEW-EXACT + §FIX-DOOR-FRAME | 
| L-128 COPY tool creates no element — hosted copy fails `wall.createOpening: opening must be an object` (_copyHosted); check all elements | copy tool / command payload | **IN FLIGHT (copy-tool agent)** — build correct wall.createOpening payload; verify plain+hosted copy persists at delta; §FIX-COPY-HOSTED-OPENING-PAYLOAD | 

| L-129 SPACE rotate/flip preview dead in PLAN (main+split), works in 3D; handler.onKeyDown exists → SPACE not routed to plan handler | plan-view key routing | **IN FLIGHT (furniture/plan-key agent — single owner of plan-overlay SPACE routing; also unblocks L-127 door flip)** — forward SPACE to active handler.onKeyDown in PlanViewToolOverlay + SvpPlanToolOverlay; §FIX-PLAN-SPACE-ROUTING | 

| L-119/L-123/L-124 elevation drawing correctness (poche/crop-clip/completeness) | views/ViewScope | **FIXED 15425570** — unified ViewScope model (elevation cut:false/poche:false); prod-verify | 
| L-131 [PERF] massively speed up 80-apt large multi-family INITIAL generation/processing (independent perf agent) | perf/large-model gen + orchestration | **IN FLIGHT (independent perf agent — READ-ONLY deep-eval → phased plan first)** — §PERF-LARGE-MULTIFAMILY-GEN | 

| L-129 plan-view SPACE routing | plan overlay key precedence | **FIXED cb6c39d6** — window capture-phase router + stopImmediatePropagation + initTools isPlacing() yield; unblocks door flip too | 

### L-131 — 80-APARTMENT GENERATION PERF EVALUATION (deliverable; 2/3 profilers landed, generation-replication re-run pending)

**Root causes, ranked (code-grounded):**
1. **WALL REBUILD dominates.** `WallRebuildCoordinator._flush` runs `WallJoinResolver.resolveLevel` over the ENTIRE level's walls (WallRebuildCoordinator.ts:1081-1087), and `ResidentialBuildingExecutor` re-triggers whole-level resolves **~3×/level** (`_mitreShellCorners:1503` + `fireAfterSettle(2)` + openings-repair `rebuildWalls:2570`), all bypassing the openings-only/body-only fast paths → **O(F floors · W_floor² ) · k≈3**.
2. **Fragmented batch creation (~320+ commands).** Walls use the fast `wall.batch.create` produceCommand path BUT are dispatched **once per apartment/perimeter group** (~160 wall batches) + per-apartment legacy `CreateWallOpeningsBatchCommand` + boundary + room commands; each pays Zod parse + OTel span + event buffering. Not one produceCommand for the building; openings/rooms on legacy commandManager.
3. **Synchronous main-thread serialize/save.** `ProjectSerializer.serialize` (ProjectSerializer.ts:686) = O(all elements) + recursive `deepStrip` + ~30 sub-store serializes + `JSON.stringify(…, null, 2)` pretty-print; auto-save serializes the whole model **2-3× per fire** (SaveOrchestrator getHash + saveVersionInternal + stringify) then re-compresses a **20-version history** via synchronous `deflateSync` → the `localStorage/IndexedDB quota exceeded` thrash.
4. **Generation is 100% main-thread**, blocking rAF. Only project LOAD is chunked (`ImportProjectCommand.executeChunked`, 120 elems/frame); generation/serialize/save are not. No `requestIdleCallback`/`postTask`; `deferWork` does NOT offload. `WorkerPool` (cap 4) + `geometry.worker.ts` exist as substrate.
5. Spurious 5-view reprojection during gen — **partly mitigated already** by ViewScope lazy-projection (15425570 / L-117).

**Phased plan (map→contract; SAFE quick-win vs DEEP):**
| P | Change | Type | Contract | Expected |
|---|---|---|---|---|
| P0 ✅96332c7f | Add gated perf-trace on generation critical path (like __pryzmPerfTrace) so gains are prod-measurable | SAFE instrument | C04 | baseline |
| P1 ✅96332c7f | Resolve each level's walls **ONCE at end-of-generation** — remove the k≈3 repeated whole-level resolveLevel (mitre + openings repair) | SAFE (biggest win) | C04 | ~3× less wall-rebuild |
| P2 ✅c5992ad8 | Coalesce per-apartment `wall.batch.create` + opening/boundary/room commands into **whole-level** batches (one produceCommand/level) | SAFE | C11 + C17 | fewer×command overhead |
| P3 ✅a58f45b0 | Serialize: drop `JSON.stringify` pretty-print; **single-serialize per auto-save** (reuse hash bytes as payload) | SAFE | C04/persistence | ~2-3× less save cost |
| P4 ✅79db04e1 | Move snapshot stringify+deflate to a **Web Worker**; chunked/generator serialize (mirror executeChunked); version history = **deltas** not 20 full snapshots | DEEP | C04 | unblock main thread + fix quota |
| P5 ✅dd08529c | **Progressive-reveal generation** — chunk the executor across frames via frame-scheduler `scheduleOnce` (reveal floors incrementally); route through scheduler, keep P3 single-rAF | DEEP | C04 / P3 | non-blocking gen |
| P6 | Offload generation geometry to workers (geometry.worker.ts pattern); ensure per-element-unique-material doesn't defeat InstancedMesh at scale | DEEP | C04 | GPU + CPU at scale |

**Ship P0-P3 as SAFE quick-wins (independent, revertible); schedule P4-P6 as the orchestration refactor. Route all to the independent perf agent (re-run after session reset), one gated phase at a time. NO architecture compromise.**


| L-132 [CRITICAL] project-create hangs (no client timeout on POST /api/v1/projects) → stuck PREPARING WORKSPACE on any server blip; server verified healthy (transient deploy-window blip, not a regression) | onboarding/create robustness | **IN FLIGHT (create-hardening agent)** — AbortController timeout + retry + retriable error UI; §FIX-CREATE-TIMEOUT-RETRY. Separate: localStorage quota flood → L-131 P4 + old-project cleanup | 

| L-135 [FEATURE] plan-view wall-draw alignment inference (perpendicular 'tendency to stop' + dashed guide; 3D has it, 2D doesn't) | wall creation UX / snapping | **IN FLIGHT (plan-wall-snap agent, fenced off L-130 geometry + P6 render)** — mirror 3D guideline inference into WallPlanToolHandler via shared SnapManager; §FEAT-PLAN-WALL-ALIGN-INFERENCE | 

| L-136 [CRITICAL] project won't open — server access-check fails CLOSED on transient DB error (projectAccess.js:57-61); Supabase pooler degraded (7.5s) | server access resilience + client open-retry | **IN FLIGHT (server-resilience agent)** — fall-through+retryable-503 (never fail open), client retries open; §FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE | 

| L-137 [CRITICAL systemic] create+open+save+slowness = ONE cause: Supabase pooler SATURATED (deploy churn + save load + retry storm; pool max:10 exhausted). Analysis: INCIDENT-2026-07-06-DB-DEGRADATION-CASCADE.md | server DB resilience + pool hygiene + deploy discipline | **ANALYSIS DELIVERED; FIXES ROUTED** — immediate=stop deploy churn (recovering); code=L-136 access-check + ServerSyncQueue backoff/circuit-breaker + pool drain-on-shutdown + reduce autosave writes; infra=Supabase tier + L-133 zero-downtime. §FIX-DB-SATURATION-RESILIENCE | 

| L-138 [SPIKE] deterministic AutoDimension engine (walls/doors/windows → dimension set; 8-stage pipeline; 11 deliverables) | documentation core / auto-dimension | **IN FLIGHT (deep-spike design agent)** — grounded in existing wall-graph (JunctionResolverV2/room-topology) + view-projection (EdgeProjectorService/ViewScope) + annotation/dimension stores; spike doc + phased plan; §SPIKE-AUTODIMENSION-ENGINE | 

| L-139 [CRITICAL] large office (1366 elem/40 levels) 3D unnavigable — WebGPU device-loss cascade → renderer dies (no GPU available) | rendering / heavy-scene scalability | **IN FLIGHT (heavy-scene rendering agent, investigation-first)** — level-scoped 3D culling + device-loss recovery-cap→safe-mode + curtain-wall instancing verify + shadow/PSO budget; §FIX-HEAVY-SCENE-3D-SCALABILITY | 

| L-140 [HIGH] batch-generated building casts NO shadow (instanced meshes likely not castShadow; hand-drawn works) | rendering / instanced shadows | **QUEUED behind L-139 (same renderer-three shadow/instancing files — sequential, not parallel)** — castShadow on InstancedMesh + shadow-pass inclusion + catcher-frame check; §FIX-INSTANCED-GENERATED-SHADOWS | 

| L-141 [UX] loading overlay during renderer backend live-swap (WebGL<->WebGPU) + device-loss recovery | rendering / live-swap UX (ADR-0077) | **QUEUED behind L-139 (same initScene swap/recovery code)** — overlay on swap start/recovery, hide on complete/rollback; §FEAT-SWAP-LOADING-OVERLAY | 

| L-142 [HIGH] Cesium 3D globe opens black; only Zoom-to-Site frames it — (a) CSP blocks CesiumWorldTerrain→async clamp, (b) camera framed before async re-placement (base 0 vs 707m) | GIS / Cesium globe framing + CSP | **IN FLIGHT (GIS agent)** — CSP add ion terrain host + frame AFTER clamp/re-placement (initial open = Zoom-to-Site); §FIX-CESIUM-GLOBE-OPEN-FRAMING | 

| L-143 [HIGH perf] Sun Hours ~1min on 3D Site (1621 cells × raycast vs 4755 context buildings); navigation may re-trigger compute | solar-analysis / geospatial perf | **QUEUED behind L-142 (CesiumViewport collision)** — worker-offload raycast + BVH occluders + no-recompute-on-nav + adaptive sampling; §PERF-SUNHOURS-WORKER-BVH-NO-RECOMPUTE | 

| L-144 [HIGH] Forma façade/sun analysis runs on 4-face MASSING PROXY not the real building geometry (192 walls+openings already placed) | solar/Forma analysis fidelity | **QUEUED — bundled w/ L-143, behind L-142 (CesiumViewport)** — run analysis on REAL façade surfaces (reuse placed real geometry), massing = fast preview tier only; depends on L-143 worker+BVH; §FIX-FACADE-ANALYSIS-REAL-GEOMETRY | 

| L-145 [CRITICAL] AutoDim computes dims but NONE render — annotation.create Zod-rejects id (crypto.randomUUID ≠ annotation_<ULID>, ADR-0061); manual LinearDim silently same | Documentation / AutoDimension annotation-id | **FIXED (pending batch push)** — mint createId('annotation') at BOTH sinks (applyAutoDimensions + LinearDimPlanToolHandler); plugins/annotations sweep → compliance audit; §FIX-AUTODIM-ANNOTATION-ID |

| L-146 [CRITICAL] New wall started NEAR (not exactly at) the shared L-corner of two joined walls malforms the two EXISTING walls; mid-point T is sound | Wall junction resolver (ADR-0055 JunctionResolverV2) | **OPEN → wall-join agent (fenced geometry-wall + WallRebuildCoordinator + WallPlanToolHandler)** — snap-precision + near-coincident cluster: snap start EXACTLY to shared vertex or guard; existing walls immutable (__pryzmWallV2ExistingCornerImmutable); §FIX-WALL-3RD-AT-LCORNER-IMMUTABLE |

| L-147 [HIGH] AutoDim renders (L-145 works) but set not architect-correct on non-rectangular footprints: spurious DIAGONAL (34601mm corner-to-corner) + incomplete exterior chains (jogs/notch undimensioned) | Documentation / AutoDimension engine quality | **OPEN → AutoDim-engine-quality agent (fenced @pryzm/auto-dimension + applyAutoDimensions)** — orthogonal-only (axis-projected, NO diagonals; overall=bbox H+V offset chains) + complete per-side exterior chains over jogged perimeter + fold in deferred QA-2 gap/overlap; §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS |

| L-149 [UX] GIS launcher rail (3D Site/Plan+Site/Graph/Living Graph) below other UI + overlaps; NO central z-index scale (325 hardcoded z-index) — needs UI/UX layering CONTRACT | UI shell / layering (C06) | **OPEN → UI-layering agent (fenced apps/editor/src/ui chrome + initUI, EXCL documentation/auto-dimension)** — contract: single named z-layer token scale + no-overlap policy (extend C06 or new C57); audit 325 sites; raise launcher rail to correct layer + de-overlap; token migration phased; §FIX-UI-LAYERING-ZINDEX-CONTRACT |

| L-150 [HIGH] Large 40-storey tower: only active±1 of 40 levels render in 3D — L-139 LevelScoped3DCulling HIDES far levels (no massing-LOD half) | Rendering / heavy-scene level scoping (C04, A.24) | **OPEN → rendering lane (fenced core-app-model/rendering + initScene + renderer-three; disjoint from D/E; coord w/ L-140)** — far levels render as massing LOD (full building silhouette always visible) + user toggle full-detail vs scoped; complete the L-139 design; §FIX-HEAVY-SCENE-MASSING-LOD |

| L-151 [UX] default elevation marks too close to origin | Views / elevation-mark placement (C06) | **FIXED f619ea62** — doubled ELEV_MARK_RADIUS_M 6→12m; bounds-relative placement queued; §FIX-ELEV-MARK-RADIUS-DOUBLE |

| L-152 [HIGH] creating the LAST wall re-mutates earlier already-correct joints (whole-level re-resolve not idempotent) | Wall junction resolver (ADR-0055) | **OPEN → wall agent (resume Agent B; fenced geometry-wall + WallRebuildCoordinator)** — resolve must be idempotent: only the new wall's junctions may change, all settled joints byte-identical; broader than L-146; §FIX-WALL-RESOLVE-IDEMPOTENT-JOINTS |

| L-153 [HIGH] live swap WebGL→WebGPU CRASHES back to project page (WebGPU→WebGL fine) — TSL/device not ready before ScenePass on the to-WebGPU path | Rendering / renderer live-swap (ADR-0077, C04) | **OPEN → rendering lane, SEQUENCED after L-150 agent (shares initScene/createRenderer)** — order swap: create WebGPU→initTSL→rebuild pipeline→resume; roll back on failure (never remount/lose project); reuse L-141 overlay; §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH |

| L-156 [HIGH] resi-building façade walls only on ground floor (upper floors miss perimeter walls) | Generative / resi executor | **OPEN → resi-gen agent (fenced ui/residential-building)** — emit façade ring per storey; §FIX-RESI-FACADE-ALL-FLOORS |

| L-157 [HIGH REGRESSION] elevation crop edit won't engage (worked yesterday) — suspect L-149 launcher pointer-intercept or L-151 mark-move | Views / crop interaction | **OPEN → resume Agent E (investigate L-149 pointer + L-151 mark)**; §FIX-ELEV-CROP-EDIT-REGRESSION |

| L-158 [MED] default elevation marks only on ground plan; want all floor plans | Views / DefaultViewsManager | **OPEN → views agent (fenced DefaultViewsManager)** — emit marks per level plan; §FIX-ELEV-MARKS-ALL-FLOOR-PLANS |

| L-159 [HIGH REGRESSION L-149] launcher pills cover the Split View button | UI shell (C06 §7) | **OPEN → resume Agent E** — re-anchor launcher column clear of split-view btn / register it in slot system; §FIX-LAUNCHER-COVERS-SPLITVIEW |

| L-160 [HIGH re-review] Cesium not resolved: globe still needs Zoom-to-Site + building above ground; 'Real' still placeholder cube (L-144 deferred); sun-hours needs more perf | GIS/Cesium/Forma/solar (C18-23, C21, ADR-0074/79/110) | **OPEN → Cesium/Forma agent (fenced CesiumViewport+GISAreaLayout+solar-analysis+FormaControls)** — deterministic open-frame after clamp; real-geometry façade + land solar worker; more perf; §FIX-CESIUM-GLOBE-REAL-GEOMETRY-PERF |

| L-161 [HIGH] AutoDim/manual linear dims not selectable/editable in plan (render but inert) | Documentation / dim edit (C03, C56, DOC-2.x) | **OPEN → AutoDim/annotation-usability agent, SEQUENCED behind L-157 (shared PlanViewInteraction)** — make linear-dim selectable+draggable+value-editable+deletable (reuse manual dim edit path); bundle w/ L-155 offset-outward; §FIX-AUTODIM-DIMS-SELECTABLE-EDITABLE |

| L-162 [CRITICAL contract] AutoDim undo doesn't remove dims (violates C11/C24.1 one-undo) | Documentation / AutoDim undo (ADR-0119) | **OPEN → AutoDim agent (bundle L-155/L-161/L-162)** — CreateManyAnnotationsCommand must be one undoable unit on the CommandManager stack; §FIX-AUTODIM-UNDO-ONE-UNIT |

| L-163 [HIGH] L-stair landing: 2nd-run direction toward landing mis-fitted + landing railing mapped wrong | Stair / landing + railing (geometry-stair) | **OPEN → stair agent (fenced geometry-stair + StairMeshBuilder + StairRailingBuilder)** — fix landing orientation from flights + continuous landing railing polyline; §FIX-STAIR-LANDING-DIRECTION-RAILING |

| L-164 [HIGH REGRESSION L-150] batch resi building shows grey massing-LOD 'envelope shade' (threshold >5 levels/>500 elems too aggressive) | Rendering / massing-LOD threshold (C04, A.24) | **OPEN → rendering lane (fenced LevelScoped3DCullingService + LevelMassingRenderer)** — raise threshold so normal buildings render full detail; massing only for huge models; workaround __pryzmLevelScoped3DMode='all'; §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE |

| L-165 [LOW SPIKE] shadow projection pixelated (512px shadow map) — perf-conditional | Rendering / shadow quality (C04, C10) | **OPEN → rendering-spike (when capacity)** — spike: res-bump vs CSM vs PCF/PCSS, tier-aware, never regress heavy-scene budget; leave-as-is if too costly; §SPIKE-SHADOW-MAP-ACCURACY |

| L-166 [HIGH UX] two competing view-mode bars (Forma toolbar vs 3D+plan/3D globe/3D Site segmented); keep segmented only, can't tell/switch active view | UI/geospatial view-mode bar (C06, C12) | **OPEN → GIS/UI agent (fenced geospatial view-mode bar + GISAreaLayout + SplitViewManager)** — consolidate to ONE control, preserve Zoom-to-Site/Analysis/Real/Massing actions, fix Views-hides-panel; §FIX-VIEWMODE-BAR-CONSOLIDATE |

| L-169 [HIGH ⬆ 2026-07-07] massing envelope still on 40-storey OFFICE (not on resi/free-canvas — those are under the isHeavyModel threshold); founder wants no grey shell on office 3D either | Rendering / massing UX (C04, A.24) | **FIXED 5a5a2f9e → fa6c17cc→main** — opaque building-like massing + real geometry hidden under it (no grey double-image); L-164 thresholds preserved; residual = prominent Massing⇄Full toggle UI. CONFIRMED L-164-by-design (office 40 lvl/14609 meshes → massing; resi 6 lvl → full detail); escalated from founder's "L-177" office-envelope report. opaque/building-like massing that reads as the tower OR hide real under massing; prominent '3D detail: Massing⇄Full' toggle+tooltip; eval full-detail on WebGL for huge; respect 40-storey WebGPU device-loss ceiling; workaround __pryzmLevelScoped3DMode='all'; §FIX-MASSING-HUGE-TOWER-UX |

| L-170 [HIGH] office gen emits 100s of office-circ room-bounding-lines w/ undefined placement → flood + redetect circuit-breaker 65+× | Generative / office circulation RBL | **FIXED 9801c97b → main** — corrected root: office placement was already valid; the `undefined` skip is a SHARED {id}-only event bug (→ L-172). STOP emitting circulation-ring RBLs (never carve rooms — floors graph-authoritative — never render, storm redetect); office now emits RBLs only for real support rooms via officeFloorArchitectureBoundingLineSegments(); circulation = named Corridor/Open-Plan rooms. 34/34 tests; §FIX-OFFICE-CIRC-RBL-UNDEFINED-PLACEMENT |

| L-171 [HIGH] ground-floor invisible-layer shadow GONE AGAIN (post-L-168), backend=WebGPU — founder wants it back, architecturally sound | Rendering / ground shadow-catcher WebGPU receive | **FIXED 0a72a3ee → 986a4ba4→main** — corrected root: catcher receives fine + L-168 frustum correct; gap = light re-homed on idle scene but no shadow-map re-render/repaint requested on the on-demand WebGPU loop. Fix: onKeyLightDriven → guarded shadowMap.needsUpdate + markDirty (no mapSize touch); also fixes live sun-slider shadows. 23/23 tests. Residual: BatchCoordinator shadow-suppress-leak + UTC-noon sun. §FIX-GROUND-SHADOW-WEBGPU-RECEIVE |

| L-172 [MED] RoomBoundingLine dashed lines never render (any typology) — bim-room-bounding-line-added fires {id}-only, initBuilders.ts:965 build() gets no placement | Rendering / RBL builder wiring (F.events.17) | **FIXED fbcfb954→main** — initBuilders handler resolves full RBL record by id before build(); placement-guard passes, dashed line renders; test. §FIX-RBL-IDONLY-EVENT-NO-RENDER |

| L-173 [HIGH] dimension must be selectable + show PROPERTIES in the Properties Panel "like a wall", from the UI-drawn dim | Documentation / dim selection → Properties Panel (C03/DOC-2.x/C56/ADR-0119) | **FIXED 986a4ba4→main** — panel+click path existed (L-161); residual = trigger wasn't event-bus-driven. New openDimensionPropertiesOnSelect resolver on pryzm-element-selected (mirrors updateInspector→showElement), passes co-selected wall; removed L-161 redundant call. 8/8 tests. §FIX-DIM-SELECT-PROPERTIES-PANEL   ⬆ RE-REPORTED (can't select/move/delete) → ✅ FIXED 5822189f→main: SELECT+MOVE were wired (L-161/L-173); the real break was DELETE — keyboard delete only handled 3D Object3Ds, never Canvas2D AnnotationElements. New deleteSelectedDimension dispatches annotation.delete (element-delete precedence) + deselect clears stale highlight. 13/13 tests. §FIX-DIMENSION-FIRST-CLASS-SELECTABLE-L173 |

| L-174 [HIGH] batch resi building no longer auto-frames to 3D on generation (regression) — must click Fit All | Rendering / camera auto-frame after batch (C04/C06/L-131 P5) | **FIXED fa6c17cc→main** (7 tests, new batchAutoFrame module) — hook auto-frame to BUILD-QUEUE-DRAINED/geometry-settled (not fixed timer or once-per-session flag consumed at empty project-open); zoom-to-fit 3D; keep §AUTOFRAME-NO-HIJACK-WHILE-DRAWING guard; typology-generic. §FIX-BATCH-GEN-AUTOFRAME-3D |

| L-175 [HIGH] elevation view: allow EXTENDING the crop with drag-handles exactly like plan view (works great in plan) | Documentation / view crop interaction in elevation (C06/DOC crop) | **FIXED bf0741c4 (committed; batched for next push)** — added hitTestCropHandle + pure cropFromHandleDrag (affine calib) + PlanViewInteraction _cropDrag→view.setCrop; 7 tests. The crop overlay + handles already RENDER in elevation (screenshot: dashed rect + corner handles); enable the same crop-resize drag → view.setCrop that PlanViewInteraction does for plan (_renderSelectedScopeOverlay handles + _cropRegionFromSectionVolume). Extend to elevation ortho views. Builds on L-154/L-157. §FIX-ELEVATION-CROP-EXTEND |

| L-176 [HIGH] manual linear dim ignores 3rd-click position — lands at default offset, not where preview showed (user must drag) | Documentation / manual dim 3-click standoff (C56/ADR-0119/L-155) | **FIXED 45825136 → fa6c17cc→main** (3 tests) — capture 3rd click's perpendicular offset → annotation geometry2D.offset (WORLD m, per L-155) at CREATE, matching the live preview; no post-create drag. P6. §FIX-DIM-3RD-CLICK-OFFSET-PLACEMENT |

| L-177 [HIGH ⬆⬆ 2026-07-08 founder "multiple times"] façade sun-hours STILL on transparent envelope prism, not the real house | Geospatial / façade analysis on real model (C18-23/A.24/ADR-0110) | **⚠ PARTIAL 645495b3→main — drape machinery shipped; founder-visible prism PERSISTS → L-193** — `buildRealModelSunDrape` + UNLIT MODIFY_MATERIAL CustomShader drapes byte-identical BVH sun-hours (cyl wall + top-down roof, openings→alpha0) onto the REAL Cesium.Model faces; falls back to envelope only in massing/no-shader. 14 tests. BUT base building still renders as MASSING (renderRealModelOnForma never runs — GISAreaLayout) so drape has no real model → **L-193** unblocks it. §FIX-FACADE-ANALYSIS-ON-REAL-MODEL |

| L-178 [HIGH] shipped solar worker crashes (Math.random/crypto blocked) → falls back to slow sync raycast; perf inert | Geospatial / solar worker determinism (ADR-0110/C10; L-160 defect) | **FIXED bd158aa3→main** — was a module-LOAD side effect (worker pulled climate/street graph → transitive secure-crypto id-gen at load, illegal in worker). Moved pure raycast core into worker's solarCodec leaf; worker graph now crypto-free; byte-identical worker==main test. §FIX-SOLAR-WORKER-NO-RANDOM |

| L-179 [CRITICAL] 3D globe photoreal: building UNDERGROUND + camera not framing; "correct before today" | Geospatial / globe placement clamp to photoreal tiles (C18-23/L-142) | **FIXED bd158aa3→main** — regressor found: bd23f6a3 (2026-07-01) re-added ion World Terrain the L-142 revert had removed; clamp preferred ion sample over tile surface + token-abort left base at 0 → ~650m underground. Removed ion terrain entirely; clamp model+camera to Google 3D-tiles via clampToHeightMostDetailed. 82 tests. §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES |

| L-180 [HIGH] auto-dim mis-dimensions doors/windows — opening origin misaligned with dim (witness lines off the real jambs) | Documentation / auto-dim opening edge derivation (C56/ADR-0119) | **FIXED 3806a584→main** — store offset=LEFT EDGE but geometry-kernel evaluator reads it as CENTRE → −width/2 shift; buildEvalSnapshot now converts left→centre; 30+9 tests. Residual: same mismatch in other evaluator callers (manual dim path). Original: derive opening jamb edges = offset ± width/2 in the EXACT wall-run frame the dim chain uses (planAutoDimensions:253 intends left/right edges; bug = wrong origin/frame). §FIX-AUTODIM-OPENING-EDGE-ORIGIN |

| L-182 [HIGH] elevation views have NO line-weight hierarchy (cut/projection/beyond/hidden) — Visibility Intents 'elevation' tab EMPTY while 'plan' has modifiers | Documentation / elevation line-weight via Visibility Intents (C06 §7, DOC view render) | **FIXED 44313646→main** — schema DID support elevation (free viewType string); root = missing SEED (zero elevation modifiers) + the emit branch folded cut into :proj (old L-119). Added ELEVATION_MODIFIERS seed (cut ×1.5 + door/window projection) + un-folded cut→:cut. Ladder cut>projection>beyond(dashed)>hidden; L-119 poché no-regression verified; 8 tests. drafting/legend still empty (non-technical scope, arguably correct). §ELEV-LINEWEIGHT |

| L-181 [CRITICAL] 2nd project open/create in a session = corrupted (no clean 3D canvas/origin sphere, can't create elements, previous project bleeds in) | Client / project-switch isolation + scene/runtime re-init (project isolation, check:isolation) | **PARTIAL FIX 3f8da8f8→main** — origin-sphere leak fixed: ProjectOriginStore.reset() had zero callers + was missing from projectScopeRegistry → A's origin datum leaked to B. Registered in registry + re-seed on pryzm-project-switch; 4/4 tests. ⏸ RESIDUAL (open): "can't create elements"+"geometry bleeds" not statically reducible — needs FOUNDER live prod repro capturing ProjectIsolationAudit [CONTRACT 48 VIOLATION] on the 2nd empty load (hypothesis: batch/suppression latch imbalanced after mid-settle navigation). §FIX-PROJECT-2ND-OPEN-ISOLATION(-RESIDUAL) |

| L-183 [CRITICAL] 3D globe (Cesium photoreal tiles) CRASHES on select — likely regression from L-179 tile-clamp (bd158aa3) | Geospatial / Cesium globe activation + tile height-sample crash | **→ Cesium agent (lane free; need crash stack from founder)** — clampToHeightMostDetailed/sampleHeightMostDetailed reject/throw if tileset not ready or viewer torn down mid-await → unguarded on activation → crash. Harden: try/catch + viewer/tileset-ready guards + graceful fallback to bounding-sphere ground (like pre-L-179); preserve underground fix; no ion terrain. §FIX-GLOBE-3DTILES-CRASH |

| L-184 [MED] 3D globe polish: (a) no auto-frame to building on entry (must click Zoom to Site); (b) house sits slightly ABOVE tile ground. L-179 underground fix CONFIRMED working by founder | Geospatial / globe auto-frame + tile-clamp accuracy (L-179) | **FOLDED into L-183 Cesium agent (same file)** — (a) auto-frame/fly to placed building on globe entry (reframeSiteIn3D/flyToBoundingSphere), not 600m site overview; (b) robust ground estimate (low-percentile/ground-classified samples) so base seats flush not floating. No ion terrain. §FIX-GLOBE-AUTOFRAME-AND-SEAT |

| L-185 [MED] add SEA/WATER context to Forma (3D Site) view — site on the water (Sydney/Rose Bay) but no sea shown | Geospatial / Forma water context (C18-23) | **✅ FIXED 645495b3→main** — contextWater.ts fetches natural=coastline, stitches + clips to bbox (Liang–Barsky) + closes crossing strands on the water side into a closed sea ring; rendered as blue water surfaces. 6 tests. §FEAT-FORMA-SEA-CONTEXT |

| L-186 [HIGH] 3D globe: PRYZM house LOST after globe→forma→globe (re-entry doesn't re-place real model) | Geospatial / Cesium globe re-entry re-placement | **⚠ bf42add8 CesiumViewport-side cache-liveness gate shipped but RE-REPORTED still broken → L-193** — Forma-agent root: GISAreaLayout re-activation branch (lines 291–308) only re-loads via loadBimGltf gated on isBimPlacedOnEarth, never re-runs renderRealModelOnGlobe/reframe when placed via the newer real-model path. Caller-side fix = L-193. §FIX-GLOBE-REENTRY-MODEL-LOST |

| L-187 [MED ✅ APPROVED 2026-07-08] extend Forma 3D-site context radius w/ distance-LOD | Geospatial / Forma context radius+LOD | **✅ FIXED 645495b3→main** — `fetchContextBuildingsFarRing` + far annulus (0.016°) fetched progressively after near ring, nearest-900 cap, tagged ring:'far'; far ring flat/low-poly shadows-OFF (24 m cap), near ring stays extruded+shadowed. 4 tests. §FEAT-FORMA-CONTEXT-EXTENT-LOD |

| L-188 [CRITICAL] GIS project loses site data on close+reopen — BIM restores but site location/boundary/globe context GONE, defaults to Madrid | Persistence / GIS site-state serialize+restore (C19) | **✅ FIXED 37cd943d→main** — SiteModel lived only in runtime SiteModelStore, never serialized/restored. Added site to snapshot + streaming header + restoreSiteState() re-seeds C19 origin + re-emits site events on load. 3+11 tests. §FIX-GIS-SITE-STATE-NOT-PERSISTED |

| L-189 [HIGH poss. L-165 regression] `Destroyed texture ShadowDepthTexture used in a submit` ×8 on project open (device-loss) since 1024px map live | Rendering / shadow realloc device-loss on project-switch (C04/ADR-0111/L-165) | **→ rendering-shadow agent (disjoint)** — verify 512→1024 triggers unguarded ShadowDepthTexture dispose mid-submit on project-switch tier realloc; defer old-texture dispose past in-flight submit, else REVERT to 512. §FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH |

| L-190 [HIGH] elevation: windows absent from geometry + set-back wall solid-not-hidden (§ELEV-LINEWEIGHT-02) | Documentation / elevation geometry inclusion + occlusion | **✅ FIXED 19f12ba5→main** — separate roots from L-182. Bug A (query): windows only enter `Level.childrenIds` via CreateWallOpeningCommand; reload/batch rebuilds bypass it → elevation now unions hosted-opening roots from `elementRegistry.getAllRoots()`. Bug B (missing occlusion): `reclassifyOccludedElevationLines` stamps per-element depth + moves occluded `:proj` segs to dashed `:beyond`. 4+8 tests. §ELEV-LINEWEIGHT-02 |

| L-191 [HIGH PRIORITISE] perimeter dims must ALWAYS be outside the shell — bottom perfect, top+left not outward | Documentation / auto-dim perimeter outward side (C56/L-155) | **✅ FIXED 081140a2→main** — engine's +axis `side` disagreed with renderer's `leftPerp(measurementDir)` on vertical runs (left/right went inward). `side` now chosen so `leftPerp·side == outwardNormal`; conflicts scan matched. 34/34 tests. §FIX-AUTODIM-PERIMETER-ALWAYS-OUTWARD |

| L-192 [HIGH] ShadowDepthTexture destroyed-in-submit STILL ×21 at 512px on project-open (device-loss residual) | Rendering / shadow-dispose GPU-fence (ADR-0111/L-189) | **QUEUED → renderer/shadow agent** — replace setTimeout(0)-deferred old-texture dispose with GPU-fence-gated dispose (device.queue.onSubmittedWorkDone().then(dispose)); device-loss-proof at any map size; prereq before any 1024 re-attempt. §FIX-SHADOW-DISPOSE-GPU-FENCE |

| L-193 [HIGH — unblocks L-177 + L-186] GISAreaLayout never (re-)runs real-model placement → Forma shows massing prism not real GLB + globe loses building on re-entry | Geospatial / GISAreaLayout real-model placement orchestration (C18-23/A.24/L-177/L-186) | **→ GISAreaLayout agent (FENCE: GISAreaLayout.ts + pure placement sibling; call existing renderRealModelOnForma/renderRealModelOnGlobe, don't re-implement CesiumViewport internals)** — (A) Forma "3D Site" activation must invoke placeRealModelOnForma (fidelity='real') so the real GLB replaces the massing prism (then clearFormaMassingEntitiesOnly runs) → L-177 drape lands on the real house; (B) globe re-activation branch (lines 291–308) must idempotently re-run real-model placement + reframe on EVERY globe entry (not gated on isBimPlacedOnEarth alone). Tests + live-Cesium verify. §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY   **✅ FIXED 3f132de9→main** — both = stale placement cache after a view-switch destroys the Cesium primitive. New pure `globePlacementDecisions.ts` + `restorePhotorealGlobeContent()`: invalidate Forma real cache on photoreal-globe entry (A) + direct nav-rail re-entry re-places via modern path + reframes (B). Idempotent globe⇄forma⇄globe; L-179 clamp + L-184 reframe preserved. 10/10 + 29/29 tests, tsc 0. Unblocks L-177. Live-Cesium confirmation pending. |

| L-194 [HIGH PRIORITISE] onboarding "Overlay a plan/PDF": double panels / no map-zoom + boundary-draw still armed + Finish doesn't open 3D split | Onboarding / site-plan-overlay import flow (ADR-059/SPEC-SITE-PLAN-OVERLAY/C19/O.2) | **→ onboarding/site-overlay agent (fenced OnboardingStepController + SitePlanOverlayController + SiteBoundaryMap2D overlay-only gate; disjoint)** — (1) single map-based overlay path (remove straight-to-plan import, always zoomable map); (2) suppress the boundary-draw tool + generate-confirm in overlay-only mode (terminal); (3) landInCanvasWithUnderlay → 3D SPLIT view via SplitViewManager, underlay framed, ready to draw. **✅ FIXED 6a0cc801→main** — no separate straight-to-plan path existed (only the map path); overlay-only now attaches NO draw handler + inerts Enter/mode keys + hides map ✕; Finish opens plan+3D split via splitViewManager.activate(). 24/24 tests. §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D |
| L-198 [HIGH] 3D globe: REAL detailed model placed UNDERGROUND (base 0.00 m) while massing correctly clamps to 706.9 m tile surface; camera flies to right spot | Geospatial / Cesium real-model globe base height vs photoreal clamp (C18-23/L-179/L-193) | **→ Cesium/globe agent (fenced CesiumViewport.renderRealModelOnGlobe + caller in GISAreaLayout + tests; disjoint from L-197 shadow)** — real-model placement falls back to base ~0 instead of the clamped photoreal-tile height the massing uses; thread the sampled/clamped height into renderRealModelOnGlobe + drive reseatRealModelOnGlobe on async clamp-settle. Preserve L-179 (Google-tiles clamp, no ion terrain) + L-193. **✅ FIXED 15b870dd→main** — race: baseHeight captured BEFORE the GLB `await`; the 706.9 m clamp settles during parse but reseat fired while the primitive was still null → placed at stale ~0. Fix re-evaluates + re-seats the base AFTER parse (pure `resolveGlobeRealModelBaseHeight`); globe path only. 30/30 tests. §FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP |
| L-199 [HIGH] Forma "Analyse building façade" sun drape is garbled/low-quality — needs a proper per-surface layer like the ground heatmap, on the whole building | Geospatial / Forma façade sun-hours quality (C18-23/A.24/ADR-0110/L-177) | **→ Cesium/Forma-façade agent (BUNDLE with L-198 — same CesiumViewport.ts; fenced CesiumViewport + siteMetricGrids + tests)** — L-177 drape uses a cylindrical U=angle/V=height wall LUT that smears on rectangular/balconied buildings; replace with per-FACE planar sun-hours (raycast the byte-identical BVH per texel on each face's UV, ≈1 m/texel like the ground, openings→alpha0) so every face carries a clean gradient; keep CustomShader on the real model, no prism. **✅ FIXED 45982d47→main** — per-face planar atlas + 16-bit face-table (shader picks nearest face by planar projection, no angular wrap/apex singularity); roof top-down planar; openings→alpha0; A.24 atlas cap 4096 + envelope fallback. 7/7 tests. §FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE |
| L-200 [CRITICAL] ground shadow gone + massive grey square (WebGPU device-loss) | Rendering / ShadowQualityUpgrader.apply live-caster realloc + catcher visibility gate (C04/ADR-0111/L-107/L-112/L-195/L-197) | **✅ FIXED 507c12d7→main** — TRUE ROOT: `apply()` reached the LIVE key light via scene.traverse + shrank/disposed its shadow map mid-submit (the hole L-195/L-197 missed). apply() now only reallocs a COLD (unallocated) caster; live caster keeps its allocation + tunes params. Grey catcher: keep attached (receive) + gate visibility on caster count (0→hidden, ≥1→visible) — reconciles L-107+L-112. Tests green. §FIX-WEBGPU-SHADOW-TIER-DESTROY-AND-GREY-CATCHER |
| L-201 [LOW] elevation marks 2x further from origin | Documentation / DefaultViewsManager elev-mark radius (C24.1/L-116/L-151) | **✅ FIXED f2822b65→main** — ELEV_MARK_RADIUS_M 12→24 m; 9/9 tests. §FIX-ELEV-MARK-RADIUS-DOUBLE-2 |
| L-197 [CRITICAL] WebGPU ground shadow gone + ShadowDepthTexture destroyed-in-submit (L-195 fixed the wrong/OBC-WebGL renderer) | Rendering / WebGPU key-light shadow lifecycle + freeze latch (C04/ADR-0111/L-168/L-171/L-112) | **→ WebGPU-shadow agent (fenced RealSunService/RealEnvironmentService/PascalSceneLighting + renderer-three GroundShadowCatcher/RenderPipelineManager + initScene; disjoint) — IN FLIGHT** — real shadow = WebGPU Pascal key light + catcher; find the op reallocing/refreshing the ShadowDepthTexture OUTSIDE setShadowReallocFrozen mid-submit (L-168 refit / L-171 refresh, 07-07), freeze-latch or make non-destructive (camera-only + idle-frame re-render), or clean revert. Empty-project grey = known L-112 cosmetic. §FIX-WEBGPU-GROUND-SHADOW-DEVICE-LOSS |
| L-195 [CRITICAL] ground shadows gone — device-loss regression (setLevel grows shadow map 512→2048 → ShadowDepthTexture destroyed mid-submit) | Rendering / ShadowQualityUpgrader.setLevel realloc device-loss (C04/ADR-0111/L-189/L-192) | **✅ FIXED 01465ee2→main** — a LIVE tier change no longer touches sh.mapSize/sh.map; keeps apply()'s device-safe 512 alloc, tunes only radius/bias (non-realloc). No mid-submit texture destroy → ground shadow survives. Test rewritten to no-realloc contract (5/5); tsc 0. Map growth behind a GPU fence = future L-192. §FIX-SHADOW-GROUND-REGRESSION |
| L-196 [HIGH] elevation set-back wall must be PARTIALLY hidden — per-segment occlusion (one edge solid where visible + dashed where occluded) | Documentation / elevation per-segment occlusion (C06 §7 / Contract 23 §9; cont. L-190) | **→ elevation agent (fenced HiddenLineRemoval.ts + tests; disjoint)** — L-190's reclassify only re-buckets a FULLY-AABB-occluded segment; split projected edges at occlusion-state transitions using the true occluder silhouette, classify each sub-segment (visible→solid, occluded→dashed). **✅ FIXED cebd81e2→main** — L-190 Pass 2 was whole-coverage-only (trivial-accept) + coarse per-element AABB; now collects each occluder's true silhouette + `splitSegmentByOccluders` splits at exact crossings, AABB fallback logged. 4/4 (L-notch splits at real step-back). §ELEV-LINEWEIGHT-03 |

## STATUS RECONCILIATION — 2026-07-04 (session close)

**Founder-reported this session (L-58 … L-93): ALL fixed & deployed** except the 3 the founder cancelled (L-18, L-19, L-48 HELD). Doc-sync fix applied: L-62/L-64/L-66/L-67/L-74 were shipped in code but were mislabeled BROKEN/REGRESSION — now marked FIXED.

**Earlier-wave SHIPPED (verified live on pryzm.fly.dev):** L-16, L-20, L-21, L-25, L-26, L-27, L-28, L-29, L-30, L-31, L-32, L-33, L-34, L-35, L-36, L-37, L-38, L-39, L-40, L-41, L-42, L-43, L-44, L-45, L-46, L-47, L-49, L-50, L-51, L-52, L-55, L-56, L-57, plus L-08/Q7 materials, L-12, L-13, L-15, L-17, L-22.

**HELD (user-cancelled):** L-18, L-19, L-24, L-48.

**Genuinely OPEN → IN FLIGHT now (dispatched 2026-07-04):** L-11 (real environment), L-14 (floor-finish default thickness), and a verify-then-fix pass over the original interaction gate items **L-04** (selection exact-pixel), **L-05** (WebGL2 ghost-on-rotate), **L-06** (per-move redetect/reproject storm — likely already covered by L-65/L-89/L-90), **L-09** (wall-draw preview responsiveness).

**OPEN / SCHEDULED (high-risk wall debt, not yet started):** L-53 (collab CRDT baseline conflict — needs shared CRDT id normalization first), L-54 (dual junction-resolver retirement / `_flush` simplification — high-risk refactor).

---

# L-102 — Furniture/accessory UI exposure (AUDIT + PHASED PLAN)

> **Type**: audit + implementation plan (READ+PLAN produced this section; no furniture code was edited — the furniture command path is concurrently owned by L-100/L-101). **Authored**: 2026-07-05.
> **Problem (founder)**: batch/auto-furnish creation produces many element types (TV, bathroom mirror, curtains, wardrobe accessories, wall art, dressers, utility appliances, rugs, …) that have **no manual pick button** in the right-hand tools rail — the user cannot place them by hand. Founder also wants confirmation that these types are `docs/02-decisions`-compliant.
> **Contracts touched**: C03 (schemas/commands/state · P5/P6), C11 (element-creation pipeline · §11.19 FURNITURE-MODEL-GAP), C16 (command authoring), C17 (batch catalogue & panel binding · §4.3), C06 (UI shell & tools). ADRs: ADR-0027 (furniture multi-representation), ADR-0110 (unified furniture plan-symbol vocabulary), ADR-0105 (uniform change-type-in-place), ADR-0107 (placement preview). Memory: `ai-creation-default-element-types-queue`, `family-platform-strategic-direction` (FurnitureType union is a known blocker).

## §A — AS-IS (verified against source 2026-07-05)

- **Runtime taxonomy** (`packages/geometry-furniture/src/FurnitureTypes.ts`): `FurnitureType` = **143 parametric union members**; `FurnitureCategory` = **19** subcategories (`sofas, chairs, tables, beds, wardrobes, bedroom, outdoor, decor, soft_furnishings, lighting, kitchen, bathroom, utility, storage, kids, teens, pets, technical`). `FURNITURE_TYPE_TO_CATEGORY` (`FurnitureCategoryMap.ts`) is the exhaustive, authoritative **type → category** resolver (this is the correct toolbar-section assignment source).
- **Manual UI surface** = the right-hand rail `apps/editor/src/ui/tools-panel/panels/CreateRailPanel.ts` → **Interiors** discipline. It renders category buttons for only **13** of the 19 categories (`sofas, chairs, tables, beds, wardrobes, outdoor, kitchen, decor, soft_furnishings, bathroom, storage, kids, teens`) + `Lighting` + `Component`. Each opens an inline `FurnitureSidePanel` whose cards come from `getItemsForCategory()` in `FurnitureCategoryRegistry.ts` (`FurnitureCategoryDataA.ts` + `DataB.ts`). Legacy `CreatePanelLayout.ts` `CREATE_CONFIG` delegates furniture to the floating carousel and enumerates no per-type leaves.
- **Registry coverage gap**: the carousel `type` field is `FurnitureType | string`, mixing (a) real union members (parametric builders) with (b) `kave_*`/`wip_*` GLB IDs and `plumbing:*` sentinels that are **not** union members. **41 union members have no picker card**; of those, **~38 are actively emitted by the auto-furnish / office engines** — this is the gap.
- **Dispatch path (P6)**: `FurnitureSidePanel._activateItem` → `toolManager.activateFurniture(type)` / `furnitureTool.setFurnitureType(type)` + `.activate()` → placement preview → **`furniture.create`** via the command bus (or legacy `CreateFurnitureCommand`, Path A). The auto-furnish engine (`packages/ai-host/src/workflows/furnishLayout/buildFurnishCommands.ts` → `FurnishLayoutExecutor.ts`) dispatches N `furniture.create` inside **one** `batchCoordinator.runBatch` (one undo unit). **There is NO `furniture.batch.create` command/handler today** — L-100 is authoring one; do not duplicate.

## §B — GAP TABLE (batch-creatable + no manual UI button)

Legend: **Emit** = produced by an auto-furnish/office engine (Y); **Card?** = has a FurnitureSidePanel pick card today; **RailBtn?** = its category has a rail button; **GLB?** = parametric (no GLB — procedural builder). Section = target category per `FURNITURE_TYPE_TO_CATEGORY`.

| FurnitureType | Emit | Card? | Category (RailBtn?) | GLB? | Gap |
|---|---|---|---|---|---|
| `tv` | Y | **N** | technical (**no btn**) | parametric | **YES** (founder) |
| `tv_unit` | Y | **N** | storage (btn ✓) | parametric | YES |
| `bathroom_mirror` | Y | **N** | bathroom (btn ✓) | parametric | **YES** (founder) |
| `vanity_unit` | Y | **N** | bathroom (btn ✓) | parametric | YES |
| `towel_rail` | Y | **N** | bathroom (btn ✓) | parametric | YES |
| `bath` | Y | via `plumbing:bath:default` only | bathroom (btn ✓) | parametric | partial |
| `wc_washbasin`,`wc_mirror` | Y | **N** | bathroom (btn ✓) | parametric | YES |
| `curtain_rod`,`curtain_panel` | Y | **N** | soft_furnishings (btn ✓) | parametric | **YES** (founder) |
| `rug` | Y | **N** | soft_furnishings (btn ✓) | parametric | YES |
| `wall_art`,`wall_mirror`,`wall_tapestry` | Y | **N** | decor (btn ✓) | parametric | YES |
| `fireplace` | Y | **N** | decor (btn ✓) | parametric | YES |
| `armchair`,`sofa_unit` | Y | **N** | sofas (btn ✓) | parametric | YES |
| `sofa` (base) | Y | **N** | sofas (btn ✓) | parametric | YES |
| `desk` | Y | **N** | tables (btn ✓) | parametric | YES |
| `console_table`,`side_table` | Y | **N** | tables (btn ✓) | parametric | YES |
| `desk_chair`,`lounge_chair` | Y | **N** | chairs (btn ✓) | parametric | YES |
| `bookshelf`,`bookshelf_glass` | Y | **N** | storage (btn ✓) | parametric | YES |
| `shoe_cabinet`,`coat_rack`,`entry_bench` | Y | **N** | storage (btn ✓) | parametric | YES |
| `buffet`,`sideboard` | Y | **N** | storage (btn ✓) | parametric | YES |
| `pantry_cabinet` | Y | **N** | kitchen/storage (btn ✓) | parametric | YES |
| `dresser`,`vanity_table` | Y | **N** | bedroom (**no btn**) | parametric | YES |
| `washing_machine_standalone`,`tumble_dryer`,`utility_cabinet`,`utility_sink`,`drying_rack` | Y | **N** | utility (**no btn**) | parametric | YES |
| `ai_element`,`glb_import` | internal | N | (special) | — | out-of-scope (internal handles) |

**Two structural layers of the gap:**
1. **Orphaned categories with no rail button** — `bedroom`, `utility`, `technical` (and `pets`, currently empty). `tv` sits in `technical`, so it is entirely unreachable manually.
2. **Types missing from `items[]`** inside categories that DO have a rail button (bathroom, soft_furnishings, decor, storage, sofas, tables, chairs, kitchen) — the parametric builder + FurnitureFactory arm exists and the furnish engine places them, but no `FurnitureTypeDescriptor` card was ever authored.

## §C — CONTRACT COMPLIANCE (the flags to close BEFORE these are first-class tools)

- **C03 / L0 schema — FLAG (root cause).** `packages/schemas/src/elements/Furniture.ts` (ADR-0027) is **type-agnostic**: it models furniture by `catalogId` + `activeLod` + `representations` (LOD geometry), with **no `furnitureType` enum**. The entire 143-member taxonomy (incl. `tv`, `bathroom_mirror`, `curtain_*`, `vanity_unit`, `wall_art`, `dresser`, utility appliances) lives only in the **L2** `@pryzm/geometry-furniture` `FurnitureData.furnitureType`. The runtime store persists the legacy L2 `FurnitureData` shape, **not** the L0 schema. This is the **FURNITURE-MODEL-GAP** already catalogued in **C11 §11.19** ("does not yet create correctly — FURNITURE-MODEL-GAP must be resolved"). **No accessory type has an L0 schema home for its semantic identity.** This must be reconciled first (see P0) so a new manual tool is not built on an unschematised taxonomy.
- **C11 (pipeline) — OK-with-caveat.** Furniture creation IS in the C11 per-element compliance matrix; the bus handler `furniture.create` exists and `FURNITURE-BUS-MIGRATION` is marked DONE (§11.19). The gap types ride the same single-create path — no per-type pipeline work needed, only the model reconciliation above.
- **C17 (batch catalogue) — FLAG (phased).** The only furniture batch rows (§4.3: "Place a bed/desk in every room", `CREATE_FURNITURE` + SL-5) are **Phase 4, ⏳ phased**, and generic per-room — the 143 types are **not** individually catalogued. Manual single-placement of a type is NOT a batch entry and is Phase-1 feasible; C17 should record that distinction (a manual furniture tool ≠ a C17 batch leaf).
- **ADR-0110 (unified furniture plan-symbol vocabulary) — VERIFY per type.** Each newly-exposed type needs a plan-view symbol; audit that every gap type resolves a symbol (fill any missing) so a manually-placed item reads correctly in plan.
- **Verdict**: the *element family* is contract-homed; the *per-type taxonomy* is NOT L0-schema-homed and NOT C17-catalogued. Closing P0 (model reconciliation) is the merge-gate before shipping toolbar cards, per the standing architectural-soundness mandate.

## §D — PROPOSED TOOLBAR SECTION LAYOUT (Interiors rail)

Section assignment follows `FURNITURE_TYPE_TO_CATEGORY` (single source of truth — do NOT invent a parallel mapping). UX per type = one `FurnitureTypeDescriptor` card (label + icon + default dims) in the category's `FurnitureSidePanel`; click dispatches through the **existing** `FurnitureSidePanel._activateItem` → FurnitureTool → `furniture.create` on the command bus (P6 preserved — additive **data** only, zero new mutation path).

- **New rail buttons** (categories that already exist in the registry but have no Interiors button): **Bedroom** (`dresser`, `vanity_table`, + existing kave dresser/mirrors), **Utility** (`washing_machine_standalone`, `tumble_dryer`, `utility_cabinet`, `utility_sink`, `drying_rack`), **Technical** (`tv` + existing kave HVAC/safety GLB). Defer **Pets** until stocked.
- **Backfill `items[]`** in existing category panels: **Sofas** +`armchair`,`sofa_unit`,`sofa`; **Chairs** +`desk_chair`,`lounge_chair`; **Tables** +`desk`,`console_table`,`side_table`; **Decor** +`wall_art`,`wall_mirror`,`wall_tapestry`,`fireplace`; **Soft Furnishings** +`curtain_rod`,`curtain_panel`,`rug`; **Bathroom** +`vanity_unit`,`bathroom_mirror`,`towel_rail`,`bath`,`wc_washbasin`,`wc_mirror`; **Storage** +`bookshelf`,`bookshelf_glass`,`tv_unit`,`shoe_cabinet`,`coat_rack`,`entry_bench`,`buffet`,`sideboard`,`pantry_cabinet`.
- **Curtains** are per-window (rod + paired panels) — the card should place a rod and let the placement preview snap to a window wall (mirror the furnish engine's per-window emission); dimensions from the window width. **Wall-mounted** items (`tv`, mirrors, `wall_art`, `towel_rail`, `curtain_*`) carry a non-zero `baseOffset` default so they mount at height (the FFL/baseOffset stacking is already handled in `CreateFurnitureCommand`, L-86/L-87).
- **Default type per category** (per `ai-creation-default-element-types-queue`): a small `defaultTypeFor(category)` resolver so clicking the category button pre-selects a sensible default (e.g. Bathroom → `vanity_unit`, Technical → `tv`).

## §E — PHASED IMPLEMENTATION PLAN

| Phase | Scope | Contract/ADR mapping | Effort |
|---|---|---|---|
| **P0 — Close the model/contract gap (MERGE-GATE)** | Reconcile FURNITURE-MODEL-GAP: decide + document the canonical furniture data model — either (a) add an optional semantic `furnitureType` tag to the L0 `Furniture` schema, or (b) formally record that L2 `FurnitureData` is the transitional model and each type maps to a catalogue key. Amend **C03**/**ADR-0027**; update **C11 §11.19**; add a **C17** note that manual single-placement of a type is Phase-1 (not a phased batch leaf). No behaviour change — doc + schema decision only. | C03, C11 §11.19, C17, ADR-0027 | ~1.5 d |
| **P1 — Per-type builder + plan-symbol + dims audit** | For every §B gap type confirm: FurnitureFactory builder arm (present — furnish renders them), default-dimension descriptor, and an **ADR-0110** plan symbol. Fill any missing plan symbols / default dims. No UI yet. | C11, ADR-0110 | ~1.5–2 d |
| **P2 — Registry backfill + rail buttons** | Add `FurnitureTypeDescriptor` cards (§D) to `FurnitureCategoryDataA/B.ts`; add **Bedroom / Utility / Technical** buttons to `CreateRailPanel` Interiors. Additive data; dispatch unchanged (P6). Section = `FURNITURE_TYPE_TO_CATEGORY`. | C06, C03 (P6), C11 | ~2 d |
| **P3 — Default-type resolver + wall-mount defaults** | `defaultTypeFor(category)` + per-type `baseOffset`/anchor defaults (wall-mounted vs floor); curtain per-window placement affordance. | `ai-creation-default-element-types-queue`, ADR-0107 | ~0.5 d |
| **P4 — (Optional, gated on L-100) first-class batch leaves** | Once L-100 ships `furniture.batch.create`, add C17-compliant `⚡ Batch` per-room furniture leaves ("Place a wardrobe in every bedroom", etc.) reading the shared catalogue. Coordinate with the furnish agent; do not fork the batch path. | C17 §4.3, C16 §8 | ~1 d |
| **P5 — Tests** | Exhaustiveness test: every furnish-emitted `FurnitureKind` has a picker card (guards future regressions); FurnitureSidePanel renders the 3 new categories; assert dispatch routes through the command bus (P6); plan-symbol present per new type. | C10 (CI), C03 | ~1 d |

**Total ≈ 7.5–8.5 dev-days.** Ordering is strict: **P0 gates everything** (do not ship toolbar cards on an unschematised taxonomy). P2 depends on P1. P4 is gated on L-100. Every step maps to a contract above; no new mutation path is introduced (registry/rail changes are additive data + config; all placement continues through `furniture.create` on the command bus per P6).

**OPEN / needs heavy-scene repro (original perf gates):** L-02 (heavy-tower nav perf), L-03 (heavy-project load) — require a large test project to validate; flag for a dedicated perf pass.

**Non-blocking engineering follow-ups:** CSG path-convergence for a door hard against a corner (`§WALL-SINGLE-VOLUME-CSG`); align root vitest config so `packages/**/*.test.ts` regression suites run in CI.

---

# L-104 — Plan View GIS

**Founder ask.** A **plan view that shows the real building on GIS / real-world context** — the
plan-view analogue of the existing **◉ 3D Site / Globe** launcher (L-40). A toggle that renders the
PRYZM plan view WITH the real building **plus** the site / GIS context underneath it, on **PROJECT
NORTH** (not true north), **orthographic**.

## Analysis — what already exists (REUSE, do not reinvent)

1. **The building "projected to plan" already exists.** The BIM editor's **Top** view
   (`activateView('Top')` → `ViewController.activate` → orthographic camera, C04) IS the
   orthographic plan projection of the real building geometry, authored in the **project-north**
   frame. No new projector is needed — the building already renders axis-aligned in plan.
2. **A GIS raster → plan-canvas underlay pipeline already exists** (L-71, ADR-0115 §Remaining #1):
   `createPlanCanvasUnderlayFromSiteOverlay` (`apps/editor/src/engine/createSiteOverlayUnderlay.ts`)
   takes a raster data-URL + a project-frame placement (px/m scale, East/North centre, `rotationZ`)
   and instantiates it as a live underlay in the THREE plan+3D scene, reusing
   `FloorPlanUnderlayTool` (`@pryzm/input-host`) + `CreateUnderlayCommand` (P6, undoable). It already
   registers in the Import Manager and persists per-project (Contract §32). One OTel span (P8).
3. **The dual-north transform primitive exists** (`projectTrueNorth.ts`, ADR-0115). The site's
   **θ = project→true-north** angle lives on `SiteLocation.trueNorth` (C12/C19, radians). The plan
   view edits in the project frame; the globe re-applies θ. `trueToProjectNorth` = R(θ) (CCW by θ).
4. **A keyless GIS raster source exists.** `siteMap2DStyle.ts` already declares **ESRI World
   Imagery** (`ESRI_WORLD_IMAGERY_URL`, `{z}/{y}/{x}`, keyless, CORS-enabled, loads under
   `img-src https:` — the SAME endpoint Cesium + the 2D satellite basemap use). So the GIS context
   raster can be composited from those tiles with no new provider / no CSP change.

**Mesh-rotation correctness (the one subtle bit).** `FloorPlanUnderlayTool` builds the underlay as a
`PlaneGeometry` with `rotation.x = -π/2`, so local +Y → world **-Z = North**, and `rotation.z += δ`
rotates the raster **CCW viewed from +Y down** (E-right / N-up screen). A satellite raster is
**true-north-up** by construction (web-mercator, tile-row 0 = north). To seat true-north imagery
UNDER the **project-north** building we rotate the raster content from its true position **P** to its
project position `trueToProjectNorth(P) = R(θ)·P` — a CCW rotation by θ. Therefore the underlay
**`rotationZ = +θ`** (the site `trueNorth` value). Consistency check vs the L-71 PDF path: a PDF's
content DEFINES project north, so `computePlanUnderlayPlacement` returns `rotationZ = 0` (content
already project-framed); GIS imagery is true-framed, so it needs `rotationZ = θ`. Both reduce to the
identity when **θ = 0** (ADR-0070/0115 byte-identity discipline).

## Contract / ADR mapping

- **C12-GEOSPATIAL** — true-north radian convention (θ); ESRI imagery endpoint parity with Cesium.
- **C19-SITE-MODEL-AND-PARCEL** — §1.3 LTP-ENU / site origin is the underlay geo-anchor + project
  base point; θ read from `SiteLocation.trueNorth`. No schema change (P5).
- **C20-BUILDING-AND-APARTMENT-AGGREGATES** — the "real building" projected to plan is the authored
  aggregate; read-only consumer.
- **C22 / C23** — provenance/PII: the underlay is public basemap imagery (no PII); creation flows
  through the existing `CREATE_UNDERLAY` command (C23 audit path). No new PII tier.
- **ADR-0115 (dual-north)** — this is the plan-view consumer of θ, symmetric to §Remaining #2 (the
  globe applying θ). Reuses the §Remaining #1 underlay pipeline. **C04** — orthographic Top view.
- **P-principles:** P1 (no parallel runtime — reuses `createPlanCanvasUnderlayFromSiteOverlay`),
  P2 (no `import * as THREE` — mutation via the tool's state handle), P3 (no new rAF),
  P4 (typed `window.pryzmEnterPlanViewGis`, no `(window as any)`), P5 (θ on existing schema),
  P6 (underlay via `CreateUnderlayCommand`), **P8 (the new impure raster-builder adds an OTel span;
  the pure tile-math + rotation helpers are headless L5 geo-math following the ADR-0115-documented
  spanless convention of the `projectTrueNorth.ts` / `sitePlanOverlayGeometry.ts` family).**

## Files / phases

| Phase | Scope | Files |
|---|---|---|
| **P1 — pure GIS tile geometry (headless, tested)** | Web-mercator tile math: `webMercatorResolution(lat,z)` (m/px), `lonLatToWorldPixel(lon,lat,z)`, `chooseGisZoom(lat,extentM,maxPx)`, `computeGisTileGrid(centerLat,centerLon,zoom,canvasPx)` → tile list + destination offsets + `pxPerMeter`; `computeGisContextUnderlayRotationZ(θ)=normalizeAngle(θ)`. Pure, no DOM/THREE — sibling to `sitePlanOverlayGeometry.ts`. | **NEW** `apps/editor/src/ui/site/overlay/siteGisContextGeometry.ts` |
| **P2 — impure raster builder (span)** | `buildSiteGisContextRaster({centerLat,centerLon,extentMeters,maxCanvasPx})`: fetch ESRI tiles (`crossOrigin='anonymous'`), composite onto a `<canvas>`, crop to the centred extent, return `{ dataUrl, widthPx, heightPx, pxPerMeter }`. One OTel span (P8). Guarded — canvas-taint / fetch failure → returns null (never throws). | **NEW** `apps/editor/src/engine/buildSiteGisContextRaster.ts` |
| **P3 — wiring + toggle** | `enterPlanViewGis()` in `GISAreaLayout`: resolve origin (`getFormaOrigin`) + θ (`siteModelStore.getSite().location.trueNorth ?? 0`) → `buildSiteGisContextRaster` → `activateView('Top')` (exit GIS, orthographic) → `createPlanCanvasUnderlayFromSiteOverlay({ …, positionEast:0, positionNorth:0, rotationZ:θ, fileName:'Site GIS context' })` → `zoomToFit`. Typed global `window.pryzmEnterPlanViewGis`. A second always-on launcher pill **"▦ Plan + Site"** stacked with the L-40 launcher (bottom-left corner). | `apps/editor/src/ui/layout/GISAreaLayout.ts`, `apps/editor/src/global.d.ts` (typed global) |
| **P4 — test** | Unit-test the pure P1 helpers (resolution monotonicity, pixel round-trip, grid tile-count + centred origin, `rotationZ(0)=0`). | **NEW** `apps/editor/src/ui/site/overlay/siteGisContextGeometry.test.ts` |

**Tag:** `§FEAT-PLAN-VIEW-GIS`. **Non-goals:** no new rendering engine, no parallel projector, no
change to SplitViewManager / selection / wall geometry. The GIS underlay is a plain plan-canvas
underlay beneath the existing building projection — one composited image, project-north, orthographic.

---

# L-207 / L-208 / L-209 — commercial tower, WebGPU differentiation, batch-nesting

Filed 2026-07-10 from the founder's commercial-use-case report. Audit rows: `V1-LAUNCH-READINESS-AUDIT.md`.

**Evidence correction first.** The console pasted with the report is the **house** pipeline, not the
tower: `[house-postgen]` is emitted only by `apps/editor/src/ui/house-layout/runHousePostGenChain.ts`,
and the office lane never calls it. There is therefore no tower log yet; L-207 is being audited from
code. This is recorded so nobody later mistakes the house timings below for tower timings.

## L-207 — §AUDIT-OFFICE-TOWER-ENVELOPE-ONLY

| Phase | Scope | Files |
|---|---|---|
| **A — does the interior build at all?** | Trace `pryzmGenerateOfficeBuilding({stories,radiusM})` trigger → controller → executor → {perimeter glazing, core plan, floor plates, interior fit-out, rooms, furnish, lighting}. Per stage record: dispatched? silently no-ops (empty catch / `return []` / `if(!x) return`)? flag-gated off in the default 40-storey path? Precedent to hunt: §ENVELOPE-DIAGNOSTIC, where an envelope HARD-reject fell through to `[]` silently. | `apps/editor/src/ui/office-building/**` (audit only) |
| **B — non-orthogonal plate** | Determine whether `deriveOfficeCircle.ts`'s CIRCULAR plate breaks the orthogonal assumptions the house/resi executors depend on — same class as the known `shellWallMatch` failure on non-orthogonal shells that zeroed windows in the Casa demo. | `deriveOfficeCircle.ts`, `officePerimeterGlazing.ts`, `officeInteriorFitout.ts` |
| **C — parity gate** | Diff office stage list + ordering against `runHousePostGenChain.ts` and the residential-building executor. Enumerate: stages the house has that the office lacks; stages implemented differently; shared commands (`BATCH_CREATE_ROOMS`, `CREATE_FLOORS_BY_ROOM_TYPE`, furnish/lighting executors) reused vs reinvented. **Standing rule:** office/new typologies MUST mirror the proven resi+house executors, not reinvent. Every reinvention is a candidate defect. | audit only |

**Non-goals:** no new typology engine; no envelope rewrite. Reuse the proven executors.

## L-208 — §DECIDE-WEBGPU-VISUAL-DIFFERENTIATION (founder decision, not a code task)

Confirmed by design, not a bug. The TSL pipeline boots to **Phase 4 = Outlines only**; SSGI and TRAA
are **off by default** (`initScene.ts:2680`; `RenderPipelineManager.ts:222-223`), which the founder's own
log states verbatim: `Phase: phase4 | WebGPU: true | SSGI: false | TRAA: false`. Both backends therefore
render identical PBR + shadows. The WebGPU-exclusive effects are opt-in and nobody enables them, so the
WebGPU investment is invisible while still carrying WebGPU-only risk (L-139/L-153/L-197/L-200/L-202/L-203/L-205).

Options — **decide before spending more on WebGPU-only bugfixes**:

1. **Make WebGPU visibly better.** Enable SSGI and/or TRAA by default on capable devices via
   `SceneQualityTier` (the `cinematic` tier already implies this intent but explicitly does not do it),
   gated by tier + element count, accepting perf and device-loss risk.
2. **Keep parity; justify WebGPU on perf/compute** (instancing, compute picking, future GPU solar) and
   stop treating it as a visual tier — in which case the defensible default is WebGL2 for stability,
   with WebGPU opt-in.
3. **Status quo** — WebGPU default, zero visual delta, ongoing WebGPU-only risk with no user-visible
   payoff. Hardest to defend.

Maps C04 + the Massing/Presentation render-tier strategy (A.24).

## L-209 — §FIX-RUNBATCH-NESTING-DROPS-GUARDS

`LightingLayoutExecutor.ts:134` calls `batchCoordinator.runBatch(...)` explicitly to get ONE undo unit
(":131 — ONE runBatch — single undo unit"). Inside the post-gen chain a batch is already open, so it hits
`BatchCoordinator.ts:867` — *"runBatch called while already batching — nesting not supported. Running fn()
without batch guards."* — and the body runs **unguarded**. Consequences, both visible in the founder's log:

- **Correctness:** the 59 fixtures are 59 undo entries, not one. Auto-lighting cannot be undone as a unit.
- **Perf:** the per-element path runs for every fixture — 59 `§FT-LIGHTING: lighting mirrored to legacy store`
  lines, `step=lighting stepMs=8998`.

A warn-and-continue on a correctness-critical guard is the wrong failure mode: it turns a structural
violation into silent data damage. `beginBatch` has the same shape (`:1215` — *"Ignoring."*).

| Phase | Scope | Files |
|---|---|---|
| **P1 — contract** | Decide against C17 (§II-2) + P6 + the three-store undo design: make `runBatch` **re-entrant / ref-counted** (inner calls JOIN the ambient batch; the outermost commit closes exactly one undo unit), OR require callers to detect an ambient batch and join it. Either way the nesting case must become a **hard error in dev**, never a silent downgrade. | `docs/02-decisions/contracts/` (read), ADR if the semantics change |
| **P2 — sweep** | Find every `runBatch`/`beginBatch` caller that can execute inside an ambient batch (`officeFurnish`, `furnishLayout`, ceiling, floor, lighting). | `apps/editor/src/ui/**`, `packages/ai-host/src/workflows/**` |
| **P3 — fix + tests** | Implement; test that N nested batches produce exactly ONE undo unit and that guards are never dropped. | `BatchCoordinator.ts` + callers |

**Tag:** `§FIX-RUNBATCH-NESTING-DROPS-GUARDS`. **Non-goals:** no change to the undo store layering.

---

# FOUNDER DECISIONS — 2026-07-10 (L-207 fit-out scope, L-208 WebGPU differentiation)

Both decisions are recorded verbatim, together with a **compounding-risk warning and a mandatory
sequencing** that neither decision implies on its own.

## Decision 1 (L-207) — Fan out the finish chain PER STOREY, mirroring the house

> Chosen: mirror `runHousePostGenChain` on every storey (name → floor+ceiling → furnish → lighting),
> add the missing ceilings, and reuse the shared `LightingLayoutExecutor` instead of the bespoke
> `ceilingLightGrid` loop.

This satisfies the standing rule ("office/new typologies MUST mirror the proven resi+house executors,
not reinvent") and closes the envelope-only report at its root.

## Decision 2 (L-208) — Make WebGPU visibly better

> Chosen: enable SSGI and/or TRAA by default on capable devices, gated by `SceneQualityTier` and
> element count. The `cinematic` tier already implies this intent but explicitly does not do it.

## ⚠ COMPOUNDING RISK — why these two cannot be built in parallel

Taken together the two decisions reconstruct, almost exactly, the conditions of the **already-fixed
40-storey WebGPU device-loss cascade** (§SHADOW-DEVICE-LOSS-FIX):

- Decision 1 multiplies tower element count by roughly **20×** (2 fitted floors → 40).
- Decision 2 multiplies **per-frame GPU cost** (SSGI is a screen-space GI pass; TRAA adds temporal
  history buffers) on the exact heavy scene Decision 1 creates.
- **Instancing does not currently save us**: it is defeated by per-element unique materials (recorded
  in project memory). So 40 fully-fitted storeys means ~40× unique-material draw calls, not ~40×
  instances.
- Decision 1's per-storey fan-out invokes auto-lighting **inside an ambient batch** — which is
  precisely the L-209 nesting defect. Fanning out before L-209 lands would multiply broken undo
  units by the number of storeys.

## MANDATORY SEQUENCING (each gate blocks the next)

| Gate | Work | Why it must precede the next |
|---|---|---|
| **G0** | **L-209** — `LightingLayoutExecutor` commits via `onNextSettle` when `isBatching`. | Per-storey fan-out calls lighting inside a batch. Without G0, fan-out produces N×59 broken undo transactions. **In flight.** |
| **G1** | **Material dedup / instancing repair** — stop minting per-element unique materials so `InstancedMesh` batching actually engages for repeated tower geometry (~960 perimeter walls, ~960 windows). | Without G1, Decision 1 alone can re-trigger the device-loss cascade, before SSGI is even considered. |
| **G2** | **L-207 fan-out** — office runs the shared per-storey chain; add ceilings; reuse `LightingLayoutExecutor`; drop the non-rendering room-bounding lines (L-170). Add a `§DIAG-POSTGEN-TIMING`-equivalent for the office lane so the 40-storey cost is measured, not guessed. | Establishes the real heavy-scene cost envelope that G3 must be gated against. |
| **G3** | **L-208 SSGI/TRAA default-on** — gated by `SceneQualityTier` **and** element count, with an explicit escalation ceiling and a proven downgrade path (ADR-0087 `§RPM-RECOVERY-DOWNGRADE`). Must NOT auto-enable on the scenes G2 produces until G1's instancing win is measured. | SSGI on a 40-storey unique-material scene is the documented crash. |

**Blocked right now:** G3 touches `RenderPipelineManager.ts`, which the in-flight
`§FIX-SHADOW-PASS-SINGLE-OWNER` lane (L-205) currently owns. G3 cannot start until that lands —
and should not start before G1/G2 regardless.

**Non-negotiable for G3:** SSGI/TRAA default-on must be *measured*, not asserted. Before flipping the
default, capture frame time + device-loss telemetry on (a) a 2-storey house, (b) a 6-storey resi
building, (c) a 40-storey tower, on both an integrated GPU and a discrete one. If the tower regresses,
the tier gate — not the feature — is what ships.

---

# L-205 CLOSED — shadow caster-set ownership (ADR-0120, C04 §SHADOW)

**Status: FIXED and founder-confirmed on prod** (`92f437a0`, live in `domain-engine-Dygm4jwC.js`).
Element shadows now project correctly onto the invisible L0 ground layer; the grey rectangle is gone.

## What it was

`PascalSceneLighting._enableShadowsOnScene()` set `castShadow = true` on **every mesh in the scene**,
filtered only by whether the mesh name contained `edge`/`grid`/`collision`. A non-BIM ground-level
plane (installed by the OBC `ShadowedScene`) became a shadow caster. A ground-level plane that casts
shadows the entire L0 catcher, so every catcher fragment inside the shadow camera reads
`shadowMask = 0` and paints `alpha = opacity` — a solid grey rectangle **exactly the size of the
shadow camera's footprint**.

That last property is why it took ten attempts: resizing the shadow camera changed the grey's *size*
(`±113,657 m` → horizon; `±50 m` → a 100 m diamond) and never its cause. Nine fixes read the
symptom's dimensions as evidence about its origin.

## Fix

`§FIX-SHADOW-CASTER-DENYLIST` — **demote** (clear, never merely skip) any mesh that exists to
*receive* a shadow, and any mesh whose world bounding radius exceeds `MAX_CASTER_RADIUS_M = 500`.
Demotions are logged by name/type/role/radius. 5 tests pin the invariant, including a *pre-poisoned*
catcher (must be cleared, not skipped) and a 40-storey tower (must still cast).

## Governance written

| Doc | Content |
|---|---|
| **C04 §SHADOW** | Mental model; true root cause; **11 normative rules**; a **measure-first debugging protocol**; the nine refuted hypotheses |
| **ADR-0120** | Decision record: the caster set is owned, explicit, receiver-never-casts, size-bounded, self-logging |
| **V1-LAUNCH-READINESS-AUDIT.md** | L-205 row rewritten with the true root cause and the three adjacent defects |

## Three real defects found en route — none was the grey

| Commit | Defect | Verdict |
|---|---|---|
| `d9b8f7cf` | Off-frame `createScenePass()` + pipeline dispose destroying the live `ShadowDepthTexture` mid-submit (`Destroyed texture … used in a submit` ×485, climbing) | **Real.** WebGPU device-loss hazard. Keep. |
| `f4533641` (reverted) | Scene-AABB shadow-frustum fit deriving an **84 km** radius from a one-wall scene | **Real.** Why the grey once reached the horizon. Offending mesh **still unidentified**. |
| `f3b28961` | OBC WebGL + PRYZM WebGPU renderers sharing one light's `shadow.map` slot | **Real** hazard, though three's `ShadowNode` proved robust. Keep. |

**Finding a real bug adjacent to a symptom is not the same as finding the bug.**

## Remaining work — sharpness, done safely (C04 §SHADOW.4)

The shadow is now correct but **soft**: `metresPerTexel = 100 / 512 ≈ 0.195 m`. Sharpening is the
founder's original Tuesday request, whose careless implementation started L-205. Do it in this order,
each step verified on prod against `§DIAG-GROUND-SHADOW` before the next:

| Gate | Work | Constraint |
|---|---|---|
| **S1** | Raise `mapSize` **once, at allocation time**, on the **fixed** camera: 512 → 2048 ⇒ `0.049 m/texel` (4×) | Never resize a live caster's map (C04 §SHADOW.2.6 / ADR-0111). Check `maxTextureSize`; degrade on `performance` and lower tiers — a 2048² depth texture is 4× the memory, and the 40-storey tower is a known device-loss scene. Pin `metresPerTexel` in a test (§SHADOW.2.5). |
| **S2** | Only if S1 is insufficient: a **clamped** fit | Explicit max radius, `Number.isFinite` assert on every extent, log the offending object, fall back to the fixed frustum, and a regression test feeding the 84 km outlier. |
| **S3** | Identify the mesh that poisoned the AABB to 84 km | Prerequisite for S2. Latent bug; a per-object bound dump at sweep time will name it. |

**Non-goals:** do not shrink-wrap the shadow camera to sharpen (that is what exploded); do not
reintroduce a geometry-driven `scheduleShadowRebuild()` or `onKeyLightDriven → requestShadowRefresh`;
do not remove the caster denylist or the `alreadyAllocated` no-realloc guard.

## Also re-test now that shadows work

- **L-140** — "generated building casts no shadow." Almost certainly the same root cause; the fixed
  ±50 m frustum may still clip a very tall building (that was L-140/L-168's original motivation for
  the fit). Re-test before re-opening.

---

# L-210 — §FIX-RBL-3D-XRAY-ALWAYS-ON (pink dashed lines through the building)

Founder report: violet dashed lines drawn across every floor and *through* the roof and façade.
Assumed to be corridor floor finishes; **they are not**. They are **room-bounding lines**
(`packages/geometry-wall/src/RoomBoundingLineBuilder.ts`, `ACTIVE_COLOR = 0xA855F7`).

## Why they look like a bug

| # | Defect | Evidence |
|---|---|---|
| 1 | The dashed line **and** the vertex diamonds are built with `depthTest: false` + `renderOrder = 1` | `RoomBoundingLineBuilder.ts:101, 105, 110` — they render over ALL geometry, so every floor's lines x-ray through the roof at once |
| 2 | **Nothing ever hides them.** `setVisible()` exists but no view / level / V-G / visibility-intent path calls it | `setVisible` at `:42`; zero call sites outside the builder |
| 3 | Emitted unconditionally by every generator | `ApartmentLayoutExecutor:395`, `HouseLayoutExecutor:3393`, `OfficeBuildingExecutor:38`, resi |

## Architectural framing

A room-bounding line is a **plan / documentation** construct — it defines a room boundary so areas
and finishes can be computed. Its 3D mesh representation being **always-on and depth-ignoring**
violates **P7** (visibility is *domain intent*, not a hardcoded renderer flag) and bypasses the
visibility-intent system entirely.

Related: **L-170** already records that the office lane emits non-rendering room-bounding lines that
cause redetect churn — the same element, a different symptom. Fix them together.

## Phases

| Phase | Scope | Files |
|---|---|---|
| **P1 — default OFF, governed by intent** | The 3D representation defaults to hidden and becomes a V/G-togglable category driven through the visibility-intent system. **No hardcoded `visible = true`.** | `RoomBoundingLineBuilder.ts`, the visibility-intent registration site |
| **P2 — correct depth behaviour** | Remove `depthTest: false` from the line **and** the diamond materials, so that when a user *does* enable them they occlude behind geometry instead of x-raying it. Re-check `renderOrder`. | `RoomBoundingLineBuilder.ts` |
| **P3 — test** | Assert: default 3D visibility is OFF; enabling via visibility intent shows them; materials do not disable depth testing. | new spec beside the builder |

**Non-goals:** do **not** stop the generators emitting the room-bounding-line *elements* — rooms,
areas and floor finishes depend on them. Only the 3D mesh representation is at issue. The plan-view
representation is correct and must not change.

**Tag:** `§FIX-RBL-3D-XRAY-ALWAYS-ON`. Maps P7, C09 (visibility intent), C06 (UI shell + tools).

---

# L-211 / L-212 / L-213 — layered-wall plan lines, PBR floor finishes, floor-finish boundary

## L-213 — §FIX-FLOOR-FINISH-BOUNDARY-UI-VS-BATCH  **(HIGH — correctness, do first)**

The same conceptual element — a room's floor finish — has **two different boundary derivations**
depending on how it is created:

| Entry point | Boundary | Result |
|---|---|---|
| Batch (`residential house` / `residential building` generators) | room's **inner-face** polygon | correct — finish sits inside the walls |
| Interactive UI (floor tool) | wall **centreline** polygon | wrong — overshoots into every wall by half its thickness |

Areas, material take-off and IFC export all inherit the error. This is a **C11 violation**: one
element type must have **one** creation pipeline.

| Phase | Scope |
|---|---|
| **P1** | Locate the batch path's inner-face derivation (`CREATE_FLOORS_BY_ROOM_TYPE` / the floor-layout executor) and extract it as the single canonical `deriveRoomFinishBoundary(room, walls)` |
| **P2** | Make the interactive `floor.create` handler / FloorTool call that same function. **Do not add a second offset** — converge, don't compensate |
| **P3** | Test: UI-created and batch-created finishes for the same room produce an **identical polygon and area** |

**Non-goal:** do not change the batch behaviour — it is the correct one.

> **⚠️ P2 WAS ONLY HALF-DONE — SEE L-240.** P2 said *“Make the interactive `floor.create` handler **/ FloorTool** call that
> same function.”* Only the **plan** tool (`FloorPlanToolHandler.ts:246`) was converged. The **3D `FloorTool`**
> (`packages/geometry-slab/src/floor/FloorTool.ts`) was never touched, and its `AUTO_FROM_ROOM` mode still passes the raw
> **centreline** ring through. The founder re-reported the identical bug as **L-240**. The P3 equality test passed because it
> compared the two paths that *were* converged — it never enumerated the third. **Converging two paths is not a fix; it is a
> coincidence.** L-240 supersedes this section.

## L-240 — §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS

**Founder (recurrent):** *“On floor finish creation — AUTO — the floor finish gets created perfectly fine, however the
perimeter of it is aligned with the CENTER of the wall. I would like it aligned with the INNER FACE of the wall. This is
already happening [correctly] on the BATCH element creations during the residential house and residential building AI batch
creation.”*

He is right, and the code confirms it exactly. `packages/geometry-slab/src/floor/FloorTool.ts:921` (`AUTO_FROM_ROOM`):

```ts
const polygon: FloorVertex[] = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
…
this._createFloor(polygon);   // ← the room boundary ring, RAW
```

The room boundary **runs along wall centrelines**, so the finish is laid on the centreline and overshoots into every bounding
wall by half its thickness. `packages/geometry-slab` does not import `@pryzm/room-topology` at all — the inner-face inset is
simply never applied on this path.

### The canonical derivation already exists — and only two of the three paths call it

`deriveRoomFinishBoundary(centreline, walls)` — `packages/room-topology/src/RoomPolygonUtils.ts:845`, wrapping
`insetPolygonToInnerFaces` (`:233`, `§FLOOR-INNER-FACE`) — offsets each edge inward by the bounding wall's half-thickness and
miters the corners.

| Floor-finish creation path | Calls `deriveRoomFinishBoundary`? | Founder sees |
|---|---|---|
| **BATCH** — `CreateFloorsByRoomTypeCommand.ts:311` (resi house / resi building AI) | ✅ yes | **correct** |
| **PLAN tool** — `FloorPlanToolHandler.ts:246` | ✅ yes | correct |
| **3D FloorTool `AUTO_FROM_ROOM`** — `FloorTool.ts:921` | ❌ **NO** | **the bug** |

That table *is* the root cause. It also explains why the founder is certain the batch path is right — it is.

### The real lesson — do not repeat L-213's mistake

The one-line change (make `FloorTool.ts:921` call the shared function) fixes the founder's bug **and leaves the class alive for
the next tool that gets written.** L-213 already did exactly that kind of pairwise convergence and the bug came straight back.

**The inner-face inset is a domain rule of the floor-finish ELEMENT TYPE** — *“a floor finish is bounded by the inner faces of
its bounding walls”* — **not a per-tool decision.** So it must live **below every tool**, at the `floor.create` command
chokepoint, keyed off `hostRoomId`. This is the identical seam the founder mandated for **L-239** (wall layers resolved once, in
the `wall.create` handler). Same disease, same cure.

Note: `FloorTool` **already** records `this._pendingHostRoomId = room.id` (`:919`) — the host-room link the handler needs is
already captured and then dropped on the floor.

| Phase | Scope |
|---|---|
| **P0** | **Enumerate EVERY floor-finish creation path** (3D AUTO, 3D DRAW, plan tool, batch generator, AI, import, paste) and prove which reach `floor.create`. **The enumeration is a deliverable** — L-213 failed precisely because nobody produced one. |
| **P1** | **Layering check, before any code.** `packages/geometry-slab` does not depend on `@pryzm/room-topology` today. Verify that edge is legal under the 8-layer rule. **If it is not, that is positive evidence the derivation belongs at the command layer, not in the tool** — do not force the import. |
| **P2** | **Move the derivation to the chokepoint.** `floor.create` derives the boundary from `hostRoomId` + bounding walls via `deriveRoomFinishBoundary`. Every path inherits it by construction. Tools stop deriving boundaries themselves. |
| **P3** | **Preserve explicit user intent.** A hand-drawn DRAW-mode polygon is the user's stated geometry and must **NOT** be silently re-inset — only **room-derived** boundaries get the inset. `FloorTool.ts:553` auto-detects a host room from the polygon centroid for hosting purposes; hosting ≠ re-deriving. **Write this rule explicitly into C11.** |
| **P4** | **N-way equality test, not 2-way.** The same room floored via 3D-AUTO, 3D-DRAW(room), PLAN and BATCH must yield an **identical boundary polygon and area**, inset to the inner faces. Upgrade `deriveRoomFinishBoundary.test.ts` from its current *“L-213 UI↔batch convergence”* framing to **all-paths** convergence. |
| **P5** | Confirm areas / schedules / material take-off / IFC export all inherit the corrected boundary (they consume the stored polygon, so they should — assert it). |

**Non-goal:** do not change the batch behaviour — it is the correct one, and the founder has confirmed so from the product side.

## L-243 — §FIX-STAIR-PLAN-CREATION-BLOCKED

**Founder:** *“Stair in plan view can not yet be created.”* — **a re-report of L-217, which I marked FIXED (`f52f71f0`).**

### Why my L-217 fix did not close it (recorded honestly)

L-217 was a **real** bug and the fix stands: `BimService.activateStairPathTool` used a *snap-availability* predicate
(`planView2DCreationMode.isInPlanView`) as a plan-vs-3D discriminator, so an orthographic plan camera could mis-route to the 3D
handler. **But that fixed WHICH HANDLER RUNS — not WHETHER THE HANDLER CAN SUCCEED.** Once correctly routed, the plan handler
still hits a hard abort. **I closed L-217 on routing evidence without ever driving the tool to a created stair.**

> **Process lesson, and it generalises: a fix verified at the seam is not a fix verified at the outcome.**

### Root cause #1 — the missing-upper-level hard abort (the blocker)

`apps/editor/src/engine/views/plantools/StairPlanToolHandler.ts:93-104`:

```ts
const topLevelId = this._resolveTopLevel(baseLevelId, cm);
if (!topLevelId) {
    console.error('[StairPlanToolHandler] Could not resolve topLevelId for baseLevelId:', baseLevelId);
    window.runtime?.events?.emit('pryzm:toast', {
        message: 'Add a second level before placing a stair — go to Levels and create the floor above.',
        severity: 'error',
    });
    this._cornerA = null; this._cursor = null; this._clearOverlay();
    return;                                   // ← the in-progress stair is DISCARDED
}
```

`_resolveTopLevel` (`:236-259`) returns `null` when there is no level **above** the base level. **A fresh PRYZM project boots with
exactly one level (Ground)** — the boot log says so (`[ProjectLoader] Loading 0 levels`; `[BimManager] Cannot delete the default
Ground level`; `DefaultViewsManager` seeds one *Ground Floor* plan view). **So in a new project the stair tool is dead on arrival,
and the only feedback is a toast.** This is not a wiring bug — it is a **domain precondition the product never satisfies by
default.**

### Root cause #2 — the plan tool scavenges state the 3D tool writes (the C11 disease again)

`StairPlanToolHandler.ts:133-145` — the comment says it outright:

```ts
// §STAIR-L-U-PLAN — read the architect's chosen shape from the global stamped by
// BimService.createStair's onConfirm. Falls back to 'I' (straight) if no setup-panel ever ran.
// TODO(STAIR-PLAN-DI): replace with a PlanToolDrawContext.stairConfig slot … so this handler
//   matches the WallPlanToolHandler / SlabPlanToolHandler DI shape and complies with PRYZM-3 P4.
const config = window.activeStairConfig;
const shape  = (config?.shape as 'I'|'L'|'U'|undefined) ?? 'I';
const requestedWidth = config?.width ?? (depth >= w ? w : depth);
const typeId = config?.typeId;
```

**The plan path has no config of its own — it scavenges a global left behind by the 3D path's setup panel.** So a user's chosen
**shape (I/L/U), width and stair type silently do not reach a plan-created stair** unless they first went through the 3D flow.
This is **exactly** L-239 (wall layers), L-213 (floor finishes) and L-240 (floor inner face): *one element type, two creation
paths, and the plan path silently drops what the 3D path resolved.* It is also a live **P4** violation (`window.*` read), and the
file's own TODO admits both.

### Root cause #3 — the design question that must be ANSWERED, not patched

**Should a stair require a pre-existing upper level at all?** Today `riserHeight` is derived from `levelHeight` so that
`riserHeight × riserCount === levelHeight` exactly (`:122-131`), and `CreateStairCommand.canExecute` validates it against a height
tolerance. **That invariant is sound and must be preserved.** But it makes the upper level a *hard input*. In real BIM a stair is
authored by **height**, and commonly implies or creates the level above. **Forcing the user to hand-create the floor above before
they may draw a stair is a workflow trap — and it is the reason the tool appears broken.**

| Phase | Scope |
|---|---|
| **P0** | **Reproduce in a FRESH single-level project first.** Do not trust the above — drive the plan stair tool end-to-end and report exactly where it dies. My L-217 call was already wrong once on this very ticket. |
| **P1** | **Answer root cause #3 in an ADR before writing code.** **(a)** author the stair by explicit HEIGHT (default = level height when an upper level exists; a sane default otherwise) → the upper level becomes OPTIONAL; **(b)** drawing a stair with no level above **offers to create it** (a command, not a toast); **(c)** keep the hard requirement but make it a discoverable precondition, not an error *after* the user has drawn. **(a) is the strongest** — the stair's geometry becomes self-determining while preserving the `riserHeight × riserCount === height` invariant, which is the thing that actually matters. **Do NOT simply delete the guard** — the invariant it protects is real. |
| **P2** | **Converge the config at the chokepoint (the L-239 cure).** Stop reading `window.activeStairConfig`. Shape / width / typeId must reach `stair.create` identically from the plan tool, the 3D tool, batch generators and AI — resolved **once, below the tools**, not scavenged from a global one tool happens to set. Thread `PlanToolDrawContext.stairConfig` per the file's own TODO and match the `WallPlanToolHandler` / `SlabPlanToolHandler` DI shape. **Clears a P4 violation at the same time.** |
| **P3** | Tests: **(i)** a stair can be created in a **fresh single-level project** — the regression guard L-217 lacked; **(ii)** a plan-created and a 3D-created stair of the same shape/width/type produce **identical stored records** (the L-213 equality pattern); **(iii)** `riserHeight × riserCount === height` holds on every path. |
| **P4** | Coordinate with **L-216** (15 stair types) — same subsystem, and the `typeId` plumbing in P2 is the plumbing L-216 needs. |

## L-242 — §FIX-WALL-JOINTS-ADR0055-P4

**Founder:** *“Can you review the wall joints — they should be sound, but sometimes there are errors, especially around T and L
joints. Do this really carefully.”* (Two plan screenshots: an L-corner with a notch/sliver where the two faces fail to meet; a run
of T-joints between **layered** walls that **contain doors**, with a spurious diagonal at the right-hand junction.)

### The fix already exists — it was only ever shipped for half the walls

**ADR-0055** built `JunctionResolverV2` + `WallFootprint2D` + `WallPolygonExtruder`, which produce **edge-coincident corners at
L/T/X junctions BY CONSTRUCTION** — no wedge, no overlap, no infill prism. It is **default-ON**
(`WallPipelineV2.ts:44`, escape hatch `window.__pryzmWallPipelineV2 = false`).

But ADR-0055 P3b wired it into **one** call site, described in the ADR itself as *“(non-layered, no-openings — the simplest call
site)”*. And **P4 — “extend V2 to the layered + opening call sites; delete `WallJunctionInfill*`” — is ⏳ Backlogged.**

> **ADR-0055:118, verbatim:** *“The current ship state (P1+P2+P3a+P3b, default-ON) already closes the wedge for the **dominant**
> production case (plain partition walls)… **Layered + opening junctions retain `WallJunctionInfill` as the interim mitigation
> until P4a/P4b ship.**”*

| Wall class | Join engine today | Founder's screenshots |
|---|---|---|
| Plain, no openings | **V2** — correct by construction | clean |
| **Layered** | **LEGACY** `MiterPrismBuilder` + `WallJunctionInfill` | ❌ **his image 2** |
| **With openings (doors)** | **LEGACY** | ❌ **his image 2** |
| Layered **and** with openings | **LEGACY** | ❌ |

**Two join engines are live in the same scene, and which one a wall gets depends on whether it has layers or a door in it.** That
is precisely why the report is *“sometimes there are errors”*: a plain wall joins cleanly and the layered/doored wall beside it
does not.

### The legacy path's failure mode is already on record — and it is exactly what he is seeing

ADR-0055's own rationale for making V2 default-ON (`WallPipelineV2.ts:33-42`) records that routing every wall through the legacy
`MiterPrismBuilder` *“made the 3-WALL (T/X) JOINS WORSE: legacy **over-extends at complex junctions into degenerate dark
slivers**”* — founder, 2026-06-19: *“black shapes appearing in joins, often 3 wall joins, got worse.”* The legacy path is a
**prism-overlap + `polygonOffset` infill hack** that *patches* junctions instead of solving them. The residual notches and slivers
**are** its documented failure mode.

### Four join subsystems coexist in `packages/geometry-wall`

1. `JunctionResolverV2` + `WallFootprint2D` + `WallPolygonExtruder` + `WallPipelineV2` — the V2 solve (correct model)
2. `WallJoinResolver` — baseline trimming, carrying accreted patches (§MULTI-CLUSTER, §WJR-INVALID, §WJR-DIFF-THICKNESS, §PARTITION-SHELL-INNER-FACE)
3. `WallJunctionInfill` + `WallJunctionInfillManager` + `MiterPrismBuilder` — **the legacy patch ADR-0055 P4c exists to DELETE**
4. `WallJunctionClustering`

### This ticket is the hub of an open cluster, not an isolated bug

- **L-238** — the *“corrupted triangular shape created in wall joints of 3 walls in L or T shape”* leaking into a new project is
  almost certainly the **same artifact** (the `§V2-SPIKE-GUARD` / `§WJR-INVALID` degenerate-mesh family, `WallFragmentBuilder.ts:880-900`, `:2963`).
- **L-239** — layered walls: the same population of walls.
- **L-234** — the wall-move freeze lives in `WallJoinResolver.resolveLevel`.

| Phase | Scope |
|---|---|
| **P0** | **Do not invent a new approach and do not add a fifth patch to the infill.** The architecture already decided V2 is the correct model and the infill must be retired. This ticket is the business case for **finishing ADR-0055**. |
| **P4a** | **Layered walls.** ADR-0055:110 names the hard part: `WallMiter` stores absolute world-XZ corners computed against the wall's *half-thickness*, so a layered wall cannot reuse one wall-level miter (each layer has a different lateral offset + thickness). The ADR offers **(a)** run `resolveJunctions` once per layer offset, or **(b)** derive per-layer corners by **inset from a single wall-level envelope**. **(b) is the sound one** — one junction solve stays the single source of truth and layers derive from it; (a) creates N independent solves that can disagree at one corner. **Write an ADR-0055 addendum — decide this in the ADR, not in code.** |
| **P4b** | **Walls with openings.** ADR-0055:111: the end segments abutting a junction need a polygon footprint that *also* respects the opening's left/right edges (polygon-vs-rectangle carve). **Interacts with L-234** (which governs how *often* these bodies rebuild) — coordinate, do not collide. |
| **P4c** | **Retire the infill.** Delete `WallJunctionInfill*` + the `polygonOffset` patch, gated on P4a+P4b verification. **`polygonOffset` is a rendering band-aid over a geometry defect and must not survive V1.** |
| **P5** | **Golden junction matrix — the deliverable that makes “sometimes there are errors” measurable.** {L, T, X} × {plain, layered, opening-bearing, layered+opening} × {same thickness, different thickness}, asserting **no sliver, no notch, no negative-area polygon, edge-coincident faces**. |
| **P6** | Fold **L-238** in: fix the **producer** of the degenerate junction mesh, not just the cleanup. |

**Hard non-goal:** do **not** touch `§CLAMP-COSHARE-WELD`. That corner fix was **reverted** because moving shared baseline endpoints
surfaced **doubled walls**. Any new corner work must not move endpoints.

**Sequencing:** the fix is **blocked on the `packages/geometry-wall` file fence** — the L-239 (wall layers) and L-234
(incremental rebuild) agents currently own these files, and L-236 rule (c) forbids two agents on one file. Investigation runs
read-only now; the fix dispatches when the fence clears.

## L-241 — §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL

**Founder (feature request + quality defect, 3 reference images):** *“Look at the quality of the door in plan view — I want a
SOUND door, still absolutely accurate with regards to its element dims… I have attached an LOD 200-300 image and… an LOD 100.
**I want all doors to have the two options** — in the properties panel the user can choose — **also through the visibility
intent**… the projection in plan view is TRUE… but **the symbol needs to be better done — more sound.**”*

He is diagnosing this correctly: **the geometry is right, the draughting is wrong.** This is a presentation-quality item — the
opposite of most of this log — and it must land **without touching dimensional accuracy**.

### Finding 1 — `detailLevel` already exists end-to-end, and nothing consumes it. It is a dead knob.

The user can already choose Coarse / Medium / Fine today **and nothing on screen changes:**

| Layer | Where | State |
|---|---|---|
| Schema | `packages/schemas/src/view/view-template.ts:224` | ✅ `z.enum(['Coarse','Medium','Fine']).default('Medium')` |
| View store | `core-app-model/src/views/ViewDefinitionTypes.ts:245` | ✅ `detailLevel?: 'coarse'\|'medium'\|'fine'` |
| Command | `command-registry/src/views/SetViewOutputCommand.ts:57` | ✅ validates it |
| Defaults | `DefaultViewsManager.ts:279/302/329` | ✅ every default view ships `detailLevel: 'medium'` |
| **UI** | `apps/editor/src/ui/ViewPropertiesPanelBuilders.ts:258-265` | ✅ **a live dropdown the user can already operate** |
| View template | `ViewTemplateManagerPanel.ts:26`, `SyncStateEngine.ts:315` | ✅ lockable + syncable |
| **Consumer (geometry)** | — | ❌ **NOTHING READS IT** |

**~70% of the founder's feature is already in the tree. What is missing is precisely the consumer.** Same dead-wiring class as
**L-224** (listener on the wrong bus) and **L-219** (inert renderer toggle): a control the user can operate that is connected to
nothing.

### Finding 2 — the enum is FORKED (a real latent bug, and a blocker)

`schemas` says **`'Coarse' | 'Medium' | 'Fine'`**. `core-app-model` and `SetViewOutputCommand` say **`'coarse' | 'medium' |
'fine'`**. Two spellings of one domain enum across a layer boundary — a **P5 / C03 violation** (schemas are the single source of
type truth). **Unify this BEFORE writing the consumer, or the consumer will silently never match.**

### Finding 3 — the current symbol is structurally sound; the draughting is thin

`packages/geometry-door/src/DoorPlanSymbolBuilder.ts` (437 lines) already has a lineweight hierarchy (`:95-96` — `A-DOOR-CUT` =
leaf rectangle, **heavy**, cut by the section plane; `A-DOOR-PROJ` = swing arc + open line, **light**), a 32-segment arc (`:37`),
correct double-leaf handling (`:123-125`), and the **L-127** rule that resolves frame/leaf thickness from the *selected door type*
so the symbol matches the placed 3D door exactly (`:232-238`). **Dimensional truth is already guaranteed and must be preserved.**

The gap between the founder's image 1 (PRYZM today) and image 2 (target) is draughting: **no wall poché**, the **lineweight
hierarchy is too weak to see on screen**, no **frame reveal / jamb rebate** at Fine, no **lever hardware** at Fine, and the
closed-leaf + open-leaf + arc lines together read as a confusing extra chord.

### The architecture is already decided by the codebase — honour it

Detail Level is a **VIEW property** (Revit's Coarse/Medium/Fine). It already lives on `ViewDefinition.output.detailLevel`, and
per **P7** it is *visibility **intent**, not UI state*. **Do NOT invent a per-door `lod` field as the primary mechanism** — that
is a second authority, and a second authority over the same pixels is exactly the collision L-223 is stuck on.

> **Resolution order: per-element OVERRIDE (existing C09 graphic-override / visibility-intent mechanism) → the VIEW's
> `detailLevel` → the view-template default.**

The founder asked for **both** knobs — the properties panel *and* the visibility intent. This gives him both, with **one
authority and a defined precedence**, which is the only version of “both” that is architecturally sound.

| Phase | Scope |
|---|---|
| **P1** | **Unify the forked enum** (Finding 2) in `packages/schemas`; make `core-app-model` + `SetViewOutputCommand` import it. Prerequisite, not a nice-to-have. |
| **P2** | **Build the shared resolver — once.** `resolveEffectiveDetailLevel(elementId, viewId)` as drawing infrastructure implementing the precedence above. **Do not special-case the door.** Windows, stairs, plumbing (L-221) and furniture all have plan symbols; if this is written inside `DoorPlanSymbolBuilder` it becomes the next per-element-type if-ladder (cf. L-215 / L-229 / L-233). |
| **P3** | **Make the existing dropdown live.** The view Detail Level select (`ViewPropertiesPanelBuilders.ts:258`) starts working the moment a consumer exists. **Verify that end-to-end BEFORE building any new per-element UI** — the founder may already have most of what he asked for. |
| **P4** | **The door as first consumer.** `COARSE` (LOD 100, his image 3) = heavy jamb ticks + single thin leaf line + thin arc. `FINE` (LOD 200-300, his image 2) = frame with reveal, leaf as a true double-line rectangle at its real `leafThickness`, swing arc, threshold, lever hardware. **`MEDIUM` stays exactly as today** so nothing regresses by default. |
| **P5** | **Lineweight hierarchy + poché — the single biggest quality win, and it is already half-built.** `A-DOOR-CUT` vs `A-DOOR-PROJ` exist (`:95-96`) but render at near-identical weight. Find out why, make CUT genuinely heavy and PROJ genuinely light, and add wall poché for the cut. This alone moves image 1 most of the way to image 2. |
| **P6** | **Per-element override** through the existing C09 mechanism — *only after* P2/P3 prove the view-level path works. |
| **P7** | Tests: Fine and Coarse symbols of the SAME door yield different line counts but **identical leaf width, frame thickness and hinge position** (L-127 invariant holds at every LOD); changing a view's `detailLevel` re-projects; a per-element override beats the view value. |

**Non-negotiable:** dimensional truth. Every symbol dimension resolves from the door **type** (`DoorDimensions`) — never a
hard-coded literal. The founder was explicit: *“still absolutely accurate with regards to its element dims.”*

## L-211 — §FIX-LAYERED-WALL-PLAN-LINES

The plan symbol path is **healthy**: `[WallLayerPlanSymbolBuilder] injected layer lines for 2 layered
wall(s)` fires on every reprojection. The gate is `WallLayerPlanSymbolBuilder.ts:68`:

```ts
if (!wall.layers || wall.layers.length < 2 || wall.curve) continue;   // plain / curved → skip
```

A wall is drawn with layers only if the **instance** carries a populated `layers` array. Hypothesis:
assigning a layered wall **type** via the properties panel updates the 3D mesh (which reads the
systemType catalogue) but never writes `layers` onto the instance — so plan sees a plain wall.

| Phase | Scope |
|---|---|
| **P1** | Establish the single source of truth for a wall's layer stack: the systemType catalogue, or the instance `layers`? Prove which the 3D builder reads |
| **P2** | Make **both** the 3D builder and `WallLayerPlanSymbolBuilder` resolve through it. If the catalogue is canonical, do **not** duplicate the stack onto the instance |
| **P3** | Test: a wall whose type is layered draws N−1 layer lines in plan |

**Adjacent, same lane:** `[TechnicalDrawing] Layer "A-WALL" does not exist. Falling back to "0".` —
a CAD-layer registration gap seen in the same log.

## L-212 — §FEAT-PBR-FLOOR-FINISHES  *(quality, not a defect)*

The catalogue is already architecturally rich (porcelain, marble, carpet tile, broadloom, engineered
timber, solid oak, LVT, rubber sports, epoxy, UFH screed, raised access, wet-area tanked, oak
herringbone, smoked-oak chevron, walnut herringbone). Each renders as a **flat tinted
`MeshStandardMaterial`** — no maps, no real-world UV scale, and the herringbone/chevron patterns are
named but never drawn.

This is the **Presentation tier** (A.24) — not a new engine.

| Phase | Scope |
|---|---|
| **P1** | Give each floor-finish systemType a PBR definition: albedo + normal + roughness (+ optional AO), real-world UV scale in metres, pattern rotation for herringbone/chevron |
| **P2** | Tier-gate + memory-budget: no 4K maps on the 40-storey tower (see the WebGPU device-loss history) |
| **P3** | Test: one shared material **per finish TYPE**, never per element |

**Hard constraints:** textures MUST be self-hosted — the CSP is `connect-src 'self'` and the log
already shows external fetches blocked. **One material per type**, never per element: per-element
unique materials already defeat instancing (see G1).

---

# L-214 — §FIX-WARDROBE-CREATE-ROTATION-NAN  (HIGH)

## Root cause — printed verbatim in the founder's log

```
[WardrobeCabinetTool] furniture.create failed:
  CommandBusError: furniture.create: canExecute rejected — rotation must be finite
    at sB._placeWardrobe (engineLauncher-DZ2ZilFL.js:1944:10134)
    at e._onPointerDown (engineLauncher-DZ2ZilFL.js:1944:9060)
```

The 3D `WardrobeCabinetTool._placeWardrobe()` builds a `furniture.create` payload whose `rotation`
is **NaN / undefined**. The command's `canExecute` guard rejects it, so **nothing is created**. The
preview never passes through `canExecute` — which is exactly why it renders while the commit fails.

The same defect explains the second symptom: the Space-key rotation the preview accumulates **never
reaches the command payload**, so even on the plan path — which *does* succeed
(`[FurniturePlanToolHandler] Wardrobe run created furniture_01KX66BQ… wardrobe_straight`) — the
committed element ignores the previewed rotation.

**Two tools build the same `furniture.create` payload independently, and one of them loses
`rotation`.** That is the same class of defect as L-213: one element type, divergent creation paths
— a **C11** violation.

**The guard is correct and stays.** `rotation must be finite` caught a real bug. The failure is that
it was swallowed into a console error, leaving a silent no-op on click.

## Phases

| Phase | Scope |
|---|---|
| **P1** | Find where `WardrobeCabinetTool._placeWardrobe` derives `rotation` and why it is non-finite — likely an unset preview-rotation accumulator, or `Math.atan2` on a zero-length direction vector |
| **P2** | **Converge.** The previewed transform (position **and** rotation) must be the single source both the 3D tool and `FurniturePlanToolHandler` hand to `furniture.create`. Do **not** patch one tool's payload in isolation |
| **P3** | Rotation state (Space key) lives **with the preview** and is read at commit — never recomputed at commit time |
| **P4** | A rejected `canExecute` must surface to the user (toast). A command rejection must never be a silent no-op |
| **P5** | Tests: a Space-rotated preview commits an element whose rotation **equals** the preview's; a zero-length placement direction cannot produce NaN |

**Non-goals:** do not weaken or remove the `rotation must be finite` guard; do not change the plan
tool's successful creation path except to make it share the canonical payload builder.

---

# L-215 / L-216 — stair parametric rebuild, then stair types + PBR railings

**Sequence matters: L-215 first.** A richer type system built on top of a broken rebuild path only
multiplies the bug.

## L-215 — §FIX-STAIR-PARAM-NO-REGEN  (HIGH, correctness)

### Root cause (code-confirmed)

`packages/command-registry/src/generic/UpdateElementParameterCommand.ts` carries **explicit,
hard-coded post-update rebuild branches** for:

| Element | Line | Comment |
|---|---|---|
| window | :165 | "sync rich WindowStore so WindowBuilder rebuilds the frame geometry" |
| door | :171 | "sync rich DoorStore so DoorBuilder rebuilds the frame geometry" |
| roof | :251 | "rebuild is handled automatically via the bim-roof-updated event" |
| **stair** | — | **none** |

So a stair parameter edit **writes the store and stops**. `GenerateStairGeometryCommand` is never
re-run, and every *derived* quantity is left stale:

- `width` → landing polygon
- `riserHeight` → riser **count**, total run
- `treadDepth` → going

The stale mesh **and** the stale purple selection overlay both remain — exactly what the founder's
screenshots show.

### The architectural smell is the real defect

A per-element-type `if` ladder inside a **generic** command means every new element type must
remember to add its own rebuild branch. Stair was forgotten. **Do not add a fourth branch.**

| Phase | Scope |
|---|---|
| **P1** | Introduce a **declarative rebuild contract**: an element type declares which parameters are geometry-affecting and which command owns their rebuild. `UpdateElementParameterCommand` consults that registry instead of hard-coding types |
| **P2** | Migrate **stair** onto it first: a geometry-affecting parameter change re-runs `GenerateStairGeometryCommand`, rebuilding flight, landing, treads/risers and railing |
| **P3** | Leave window/door/roof branches working; document the migration path (do not big-bang them) |
| **P4** | Selection overlay + preview must invalidate with the mesh — kill the stale ghost |
| **P5** | Tests: `width` changes the landing polygon; `riserHeight` changes the riser **count**; `treadDepth` changes the going; the old mesh is disposed |

Maps **C11** (single element-creation pipeline), **C16** (command-authoring), **C03** (commands +
state), **P6**.

## L-216 — §FEAT-STAIR-TYPES-PBR-RAILINGS  *(quality; after L-215)*

### Current state (code-confirmed)

`packages/core-app-model/src/stores/StairTypeDefinitions.ts` defines exactly **5** types —
Monolithic Concrete, Steel Open Riser, Timber Closed String, Residential Timber, Marble Luxury.
Each carries a single `material: 'concrete' | 'steel' | 'wood'` **string**. There is **no railing /
balustrade specification in the type at all**, and no PBR material definition. The railing is built
independently by `StairRailingBuilder` and is not part of the stair TYPE.

| Phase | Scope |
|---|---|
| **P1** | Extend the stair TYPE schema: a type declares its tread, riser, stringer **and balustrade/railing** sub-specs (profile, material, baluster spacing, handrail section). **The railing becomes part of the type**, not a separate builder decision |
| **P2** | Author **≥15** architecturally-real types: in-situ + precast concrete, steel open-riser, steel with timber tread, timber closed string, timber cut string, oak, walnut, marble, terrazzo, glass-balustrade variants, floating/cantilever, helical, … |
| **P3** | PBR materials shared **per TYPE, never per element**; tier-gated; textures **self-hosted** |
| **P4** | Tests: every type produces a complete stair **and** railing; exactly one shared material per type |

**Hard constraints:** per-element unique materials already defeat instancing (see **G1**) — one
material per **type**. Textures must be self-hosted: the CSP is `connect-src 'self'` and external
fetches are already blocked in prod. **Reuse the L-212 floor-finish PBR material pipeline** rather
than inventing a second one.

---

## L-217 — §FIX-STAIR-PLAN-ROUTING-VIEWSTATE  (HIGH, correctness)

Founder: *"Check why the stair creation now is not working on plan view — maybe something is not
wired?"*

### Root cause (code-confirmed, and printed in the founder's own log)

The log establishes the view is a plan view beyond doubt:

```
[VST] dispatching "view-activated" event (mode="Top", type="orthographic")
[VST] dispatching "view-selected" event (viewId="vd-sys-plan-l0")
[WallEdgeVisibilityService] Edge render mode set to 'plan'.
...
[StairPath3DToolHandler] activated in 3D (shape=L, groundY=0)     <-- WRONG HANDLER
```

The routing decision lives at `apps/editor/src/engine/BimService.ts:292-297`:

```ts
const cam = window.world?.camera?.three;
const inPlanView = cam ? planView2DCreationMode.isInPlanView(cam) : false;
if (!inPlanView && window.stairPath3DTool) {
    if (window.stairPath3DTool.activate(shape)) return;
}
```

And `isInPlanView()` (`packages/core-app-model/src/views/PlanView2DCreationMode.ts:46-49`) is a
**conjunction**:

```ts
isInPlanView(camera: THREE.Camera): boolean {
    return camera instanceof THREE.OrthographicCamera &&
           activePlanDrawingRef.drawing !== null;
}
```

**The name lies about the meaning.** Its own header says it answers *"is the camera orthographic AND
a TechnicalDrawing currently mounted"* — i.e. **is 2D snapping available**. It does **not** answer
*"is the active view a plan view"*. `SlabTool` consumes it correctly, as a snap-availability guard.
`BimService` misuses it as a **view-mode discriminator**. So when the drawing is absent, the stair
tool concludes "we must be in 3D" and binds `StairPath3DToolHandler` over an orthographic plan
camera. Nothing is ever created.

**And the drawing is absent.** `apps/editor/src/engine/views/PlanViewManager.ts:251` runs
`activePlanDrawingRef.drawing = null` on deactivate — a **third writer**, contradicting the ref's own
contract header (`ActivePlanDrawingRef.ts:18`):

> *"Write access: ViewController._mountDrawing() and ._unmountDrawing() only."*

The founder's log shows precisely that teardown immediately before the stair activation
(`[SvpPlanToolOverlay] Detached`, `[SplitViewManager] Split view deactivated`). The accompanying
`GL_INVALID_FRAMEBUFFER_OPERATION: Framebuffer is incomplete: Attachment has zero size` flood
(hundreds of lines, then *"too many errors"*) suggests the drawing/render-target then fails to
re-mount at a non-zero size, so the ref is never repopulated.

**The authoritative view mode was available the whole time and was never consulted:**
`ViewController.viewMode` (`ViewController.ts:587`) returns
`ViewMode = '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' | 'Right'`
and was `'Top'`.

### The architectural smell is the real defect

Tool routing must be a function of **view state**, never of whether a *rendering artifact* happens to
be mounted. A creation tool asking "is a TechnicalDrawing attached?" to decide which pipeline to run
couples C11 element-creation to an incidental render-target lifecycle. This is the same class as
L-213 and L-214: **one element type, divergent creation paths, selected by an unreliable predicate.**

A second, independent hazard enabled it: a module whose header declares two writers has three. The
single-writer invariant on `activePlanDrawingRef` is what should have made the null unreachable.

### Phases

| Phase | Work |
|---|---|
| **P1** | Route on **view state**. `activateStairPathTool` asks `ViewController.viewMode` / the active `ViewDefinition` type — never `isInPlanView(camera)`. |
| **P2** | Rename `isInPlanView()` to what it means (`is2DSnapAvailable()`), keeping `SlabTool`'s snap guard working. If a genuine plan predicate is wanted, derive it from view state. |
| **P3** | Restore the single-writer invariant on `activePlanDrawingRef`: either `PlanViewManager` stops writing it and defers to `ViewController._unmountDrawing()`, or ownership genuinely moves and the header is amended. Header and code must agree. |
| **P4** | Investigate the zero-size framebuffer. A `TechnicalDrawing` mounted at 0×0 is a real defect, not noise. (Related: the `[TechnicalDrawing] Layer "A-WALL" does not exist` gap under L-211.) |
| **P5** | Tests: orthographic plan camera + **no** mounted drawing ⇒ stair resolves to the **plan** handler; 3D perspective ⇒ **3D** handler; split-view teardown does not strand the plan view in 3D-routing. |

**Contract mapping:** C11 (one element type ⇒ one creation pipeline), C06 (UI shell & tools),
DOC-5.2 / DOC-5.3 (`ActivePlanDrawingRef`, `PlanView2DCreationMode`), SPEC-STAIR-3D-CREATION (#101 —
the 3D sketch path this guard was added to gate).

**Sequencing:** independent of L-215 / L-216. L-215 owns `UpdateElementParameterCommand` +
`geometry-stair`; L-217 owns the view-state routing layer. Disjoint fences, may run in parallel.

---

## L-219 — §DIAG-WEBGPU-NEVER-ENGAGED  (HIGH; escalation of L-203; **BLOCKS L-208 / G3**)

Founder: *"still webgl and webgpu render the same — mistake! I think webgl is not being triggered."*
Two screenshots of the same model, toggle in different positions, pixel-indistinguishable.

### What is already established (log + source, not inference)

| Fact | Source |
|---|---|
| The pipeline reports it is **not** on WebGPU | founder's log: `[RenderPipelineManager] Phase: phase2 \| WebGPU: false \| SSGI: false \| TRAA: false` |
| The active backend is `webgl-fallback` | founder's footer: `GPU: … WebGL · webgl-fallback` |
| `webgl-fallback` = **WebGPURenderer on its WebGL2 backend**, NOT a plain `WebGLRenderer` | `apps/editor/src/rendering/createRenderer.ts:56-63` |
| `webgl-only` (plain `WebGLRenderer`, "TSL pipeline NOT available") is a **third, distinct** state | ibid. `:60-61` |
| Unset preference defaults to **`'webgl'`**, not `'auto'` | `createRenderer.ts:136-144` (§PERF-WEBGPU-FRAGMENT, ADR-0076) |
| Every "working" run in the L-205 investigation was also `webgl-fallback` | L-205 evidence trail |

### The architectural consequence

The toggle's **"WebGL" position does not select a WebGL renderer.** It forces the *WebGPU* renderer
onto a WebGL2 backend. If the `'webgpu'` position *also* degrades to `webgl-fallback` — via failed
adapter acquisition, the device-loss safe-mode cap (`__pryzmDeviceLossRecoveryCap`), or the L-203
swap-loop oscillation (`resolvedPreference=webgl (forceWebGL=true)`) — then **both positions resolve
to the same renderer running the same pipeline, and identical pixels are the correct and inevitable
output.** The toggle is then a no-op that advertises a choice the product does not have.

**This invalidates L-208.** The founder's decision *"make WebGPU visibly better"* (SSGI/TRAA
default-on, gate **G3**) is unobservable and untestable while the native backend is never acquired.
`SSGI: false | TRAA: false` is precisely what `§PERF-WEBGL2-NO-TSL` prescribes on the WebGL2 path —
so G3 would be built, shipped, and silently never run.

### Measure before touching anything

L-205 cost **ten** shipped root-cause attempts because it was debugged by inference. C04 §SHADOW.3
made measure-first normative. It applies here. **Phase 1 is diagnostic-only; it produces no code
change.**

| Phase | Work |
|---|---|
| **P1 (read-only)** | On the founder's machine, for EACH preference (`auto` / `webgpu` / `webgl`): report `navigator.gpu` presence, `requestAdapter()` result, the resolved `window.pryzmRendererBackend`, and whether `forceWebGL` was applied and by whom. Suspicion: `webgl-fallback` for all three. |
| **P2 (read-only)** | Determine whether `webgl-only` is reachable at all, and whether the device-loss safe-mode cap or the L-203 oscillation latches `forceWebGL=true` across reloads. |
| **P3** | **Contract decision, then code.** Either the three toggle positions map to three genuinely distinct, observable renderer configurations — and the label names the backend **actually in force**, never the one requested — or the toggle reports its degradation and *why*. A toggle whose positions are indistinguishable is a lie in the UI. |
| **P4** | Only once a native `'webgpu'` backend is provably acquired: revisit **L-208 / G3** (SSGI + TRAA default-on, tier-gated). |

**Hard non-goal:** do NOT "fix" this by making the two positions render differently at the label or
the tier level. The question is which GPU API is actually in force.

**Contract mapping:** C04 (rendering & scheduling), ADR-0007 (WebGPU/WebGL2 dual mode), ADR-0076
(§PERF-WEBGPU-FRAGMENT — the founder's `'webgl'` default), ADR-0077 (§RENDERER-LIVE-SWAP), L-203
(backend oscillation), L-208 (WebGPU differentiation — **blocked by this**).

**Fence note:** `RenderPipelineManager`, `PascalSceneLighting`, `RealSunService`,
`RealEnvironmentService` and `BimWorld` are frozen under the **L-205** investigation (C04 §SHADOW).
P1/P2 are read-only and therefore safe to run in parallel; P3 must wait for the L-205 fence to lift
or be explicitly re-scoped.

### L-219 — DIAGNOSTIC RESULT (2026-07-10, read-only; no code changed)

**The orchestrator's framing was incomplete and its implied fix was wrong.** The agent refuted it.
Recording the refutation, because the correction is the valuable part.

#### The measured truth table

`createRenderer(pref)` reduces the entire preference space to one boolean —
`forceWebGL = pref === 'webgl'` (`createRenderer.ts:203`). That line is the **sole** discriminator.

| # | preference | `navigator.gpu` | adapter | `forceWebGL` | resolved backend |
|---|---|---|---|---|---|
| 1 | `'webgl'` | any | any | **true** | **`webgl-fallback`** |
| 2 | `'webgl'` | any | any | true | `webgl-only` — *only if `WebGPURenderer` throws* |
| 3 | `'auto'` / `'webgpu'` | present | **yes** | false | **`webgpu`** |
| 4 | `'auto'` / `'webgpu'` | present | **no** | false | **`webgl-fallback`** |
| 5 | `'auto'` / `'webgpu'` | absent | n/a | false | **`webgl-fallback`** |
| 6 | `'auto'` / `'webgpu'` | any | n/a | false | `webgl-only` — *only if construction throws* |

#### Three stacked defects — any ONE alone yields identical pixels

1. **`'auto'` and `'webgpu'` are the identical code path.** Nothing branches on the difference.
   Three buttons, two possible behaviours; on non-WebGPU hardware, **one** observable outcome.
2. **`'webgl-only'` is unreachable by preference.** The plain `THREE.WebGLRenderer` documented at
   `createRenderer.ts:59-61` is **dead code in production** — reachable only when `WebGPURenderer`
   construction throws. The three-way type oversells a distinction the runtime never makes.
3. **THE REFUTATION — acquiring native WebGPU would not change the pixels today.** Even a successful
   native-WebGPU boot lands at `phase4` with **outlines only**. SSGI and TRAA are **default-OFF**,
   opt-in via the RenderRail (`initScene.ts:2659-2674`; §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH,
   founder L-59). Outlines paint on hover/selection only; shadows are the same fixed ±50 m soft
   shadow on both paths. Native-WebGPU vs `webgl-fallback` therefore differ only by TSL
   ScenePass/tonemap vs OBC forward render — **invisible on a static, unselected grey model.**

**So "WebGPU is never engaged" is REAL but NOT SUFFICIENT.** The default-off post-FX gating is an
equal, independent cause. *Any fix that only chases backend acquisition will reproduce the founder's
"still identical" complaint.* This is the single most important line in this section.

#### L-203's fix holds

No localStorage latch strands anyone. The only persisted key is `pryzm.renderer.backend`
(`createRenderer.ts:96`). The device-loss safe-mode cap is **session-only**, applied via a per-call
`backendOverride` and deliberately never persisted (`:294-303`, `:332-337`) — that *is* the L-203
fix, and it works. But the unset default is `'webgl'` (`:143`), so **a fresh profile never attempts
WebGPU at all** until the user actively picks it.

#### The contract violation is the UI promise, not the plumbing

ADR-0076 and ADR-0077 are honoured; the live swap (`initScene.ts:3740-3944`) correctly gates TSL on
`backend === 'webgpu'` (`:3846`). The **footer** honestly prints the *resolved* backend as its
`- <backend>` suffix (`RendererBackendToggle.ts:118-124`). But the three **buttons** highlight the
*requested* preference (`:99`, `:114-116`). The user sees `[WebGPU]` highlighted beside
`- webgl-fallback` with no explanation of the silent downgrade — and the WebGPU button's advertised
*"full WebGPU pipeline: SSGI/TRAA/shadows"* (`:115`) is **false by default even where WebGPU does
engage.** Per CLAUDE.md, when code disagrees with a contract the code is wrong; here the *UI copy* is
the contract being broken.

#### Still unmeasured — needs the founder

Whether `navigator.gpu.requestAdapter()` succeeds on his machine. Decisive cell, cross-referenced
with `backend.isWebGPUBackend`. If an adapter IS acquired but `isWebGPUBackend` is false while the
`'webgpu'` position is selected, the fault is in `WebGPURenderer` backend selection, not availability.

#### Proposed contract — fidelity tiers (agent's Option A; recommended)

Collapse the dead `'auto'` / `'webgpu'` duplication. Redefine the positions as **fidelity tiers**
(Stable / Balanced / Cinematic) where:

- the top tier **forces SSGI + TRAA on**, so the positions differ by post-FX that is visible on *any*
  model — not by a backend name the user cannot see;
- the top tier **hard-requires** `backend === 'webgpu'`. If the adapter cannot be acquired, that
  position renders **disabled with a reason** ("WebGPU unavailable on this GPU/browser") — never
  silently degraded to look like the others;
- the label always names the config **actually in force**, and a downgraded request surfaces the
  downgrade and why (promote the existing honest console warning at `createRenderer.ts:442-450`
  into the UI).

**This unblocks L-208 by construction:** selecting the top tier is the same control that turns
SSGI/TRAA on, so backend acquisition and pipeline gating are resolved by one decision instead of two
sequential ones.

**Hard non-goal, restated:** do NOT resolve this by relabelling buttons while the code paths stay
identical.

---

## L-220 — §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT  (HIGH, correctness, **SYSTEMIC**)

Founder: *"Please do an audit on all elements — I have moved a plumbing fixture, a toilet, in the 3D
view, but the 2D view did not get updated. The sofa for example moves; the toilet not."*

### Root cause — printed verbatim in his log

```
[TransformDrag] plumbing.move failed: CommandBusError:
    plumbing.move: canExecute rejected — plumbingId must be a non-empty string
```

`registerTransformDragHandler.ts:256-258` dispatches `{ id, to: {...} }`, but
`MovePlumbingHandler.canExecute` (`plugins/plumbing/src/handlers/MovePlumbing.ts:28-33`) requires
**`plumbingId`** and a **`delta`** with finite x/y/z. **Both the key name and the semantics are
wrong** — absolute `to` versus relative `delta`.

The gizmo moves the mesh on screen, the command is rejected, the store is never written, and the plan
view — which re-projects **from the store** — correctly keeps drawing the toilet where it always was.
The sofa works only because `furniture.updateParameters` happens to take a bare `id`.

The code admits it was never verified. `:241-243`:

> *"NOTE: this commit only fires if the gizmo actually attaches to the fixture on selection —
> pending in-browser confirmation (harmless no-op if it does not)."*

It was not harmless.

### A second, independent defect in the same log

```
[TransformDrag] floor.update failed: Error: [Immer] minified error nr: 18   (at applyPatches)
```

The floor drag's inverse-patch payload (`:426-431`, `_prev.boundary.polygon`) is malformed, so
**dragging a floor throws.**

### The systemic root — why an audit of ALL elements is the right ask

The id key is ad-hoc per command (`plumbingId`, `beamId`, `floorId`, bare `id`) and the dispatch site
is **stringly-typed with an `unknown` payload**:

```ts
// packages/runtime-composer/src/types.ts:3394
readonly bus: { executeCommand(type: string, payload: unknown): unknown; ... }
```

Meanwhile a fully-typed `CommandRegistry` **already exists** — `packages/command-bus/src/commands.ts:4`
describes itself as *"The typed contract for every command dispatched through
runtime.bus.executeCommand."* **`runtime.bus` throws that typing away.** Every payload mismatch is
therefore a *runtime* rejection instead of a *compile* error.

**Third founder-visible bug of this exact class in one day:**

| Tracker | Element | Payload defect |
|---|---|---|
| L-214 | wardrobe | THREE Euler **object** into a scalar `rotation: number` field |
| L-218 | carousel furniture | same Euler-object defect (deprecated path) |
| **L-220** | **plumbing** | **wrong id key + `to` where `delta` is required** |
| **L-220** | **floor** | **malformed inverse patch, Immer throws** |

One defect wearing four costumes.

### Phases

| Phase | Work |
|---|---|
| **P1** | **Audit every element type** in `registerTransformDragHandler.ts` — wall, slab, column, beam, floor, ceiling, roof, furniture, plumbing, lighting, stair, curtain-wall, grid, opening. For each, prove drag then command then store then **plan re-projection**, end to end. Deliver a table: element x id-key x payload shape x handler expectation x pass/fail. |
| **P2** | Fix `plumbing.move` (`plumbingId` + `delta`) and `floor.update` (the Immer patch). |
| **P3** | **Close the class, do not patch the instances.** Type `runtime.bus.executeCommand` against the existing `CommandRegistry` so each dispatch type-checks its payload at the call site. Incrementally: a typed overload alongside the loose one, then migrate call sites. A big-bang retype is unreviewable. |
| **P4** | A rejected `canExecute` on a user drag must **surface** (toast), never a swallowed `console.error` — the rule L-214 established. |
| **P5** | Tests: per element type, a drag commits a store change **and** the plan view re-projects. |

**Why P3 is the point.** L-214's `buildFurnitureCreatePayload()` closed this class *locally* by typing
one payload — the Euler-object regression became a compile error at every call site. P3 does the same
globally. Without it, this audit finds today's four and the next tool introduces the fifth.

**Contract mapping:** C03 (schemas/commands/state), C16 (command authoring), C11 (one element, one
pipeline), P6 (commands are the only mutation path).

---

## L-221 — §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS  *(quality)*

Founder: *"The existing toilets, showers etc. elevations and plan view are true projections — somehow
toooo many lines. Please make sound quality plan view and elevation projections for all plumbing
fixtures."*

### Current state — confirmed in code and in his log

Every element type needing a 2D representation has a dedicated symbol builder:

```
ColumnPlanSymbolBuilder      DoorPlanSymbolBuilder       WindowPlanSymbolBuilder
WallLayerPlanSymbolBuilder   SofaPlanSymbolBuilder       BedPlanSymbolBuilder
ChairPlanSymbolBuilder       KitchenPlanSymbolBuilder    WardrobePlanSymbolBuilder
TreePlanSymbolBuilder
```

**There is no `PlumbingPlanSymbolBuilder`.** Plumbing therefore falls through to
`EdgeProjectorService`'s generic **true-edge projection of the full 3D mesh**. His log measures it:

```
§DIAG-EPS-01 edgesGeo elemType=PlumbingFixture faceCount=2108 edgeVertices=3400 allocMs=11.38ms
§DIAG-EPS-01 edgesGeo elemType=PlumbingFixture faceCount=3916 edgeVertices=6552 allocMs=20.60ms
   ... six such meshes for ONE toilet ...
[HiddenLineRemoval] v1 pass — 2 occluder(s), 0/894 segments removed      <- before
[HiddenLineRemoval] v1 pass — 2 occluder(s), 0/11706 segments removed    <- after the toilet
```

One fixture: **~55 ms of edge extraction and +10,800 hidden-line-removal segments.**

### Framing

A **drawing-correctness** issue, not only aesthetics. An architectural plan shows a toilet as a
standardised symbol — bowl outline plus cistern rectangle — not a wireframe trace of its mesh. The
perf cost is a second, independent reason.

### Phases

| Phase | Work |
|---|---|
| **P1** | Author `PlumbingPlanSymbolBuilder` for every fixture type (toilet, basin, shower, bath, bidet, urinal, tap/mixer, cistern), following the `SofaPlanSymbolBuilder` / `DoorPlanSymbolBuilder` pattern **exactly**. Do not invent a second symbol mechanism. |
| **P2** | **Suppress the generic true-edge projection for any element that has a symbol builder.** Establish how door/window/sofa already do this — they must, or they would double-draw — and reuse it. The 11,706-segment HLR load must *go away*, not be overdrawn. |
| **P3** | **Elevation symbology is genuinely new** — the existing builders are plan-only. Decide, and record in C06 / DOC-2.x, whether elevation gets its own symbol set or a simplified silhouette + profile projection. Do not silently reuse plan symbols in elevation. |
| **P4** | Symbols follow architectural convention and scale with the **drawing**, not the model. |
| **P5** | Tests: a placed toilet contributes a **bounded, deterministic** number of plan segments (assert an upper bound — the regression is unbounded triangulation); the generic edge path is not invoked for fixtures that have a symbol. |

**Contract mapping:** C06 (UI shell & tools), DOC-2.x (plan symbols), C11. Sibling of **L-211**
(layered-wall plan lines) — same subsystem, likely the same agent.

---

## L-222 — §PERF-ELEV-CROP-DRAG-FLOW  (MEDIUM; perf + correctness)

Founder: *"The elevations are sound — really good to be honest — but I have a request. When the user
moves the crop view, at the moment the live elevation updates, but flickering a bit. Would it be
possible to update the performance and make it more organic, like flowing?"*

### Four defects, all printed in his log

One pointermove during a crop drag produces:

```
EXECUTE: UPDATE_VIEW_DEFINITION                          <- command 1
[ViewTechnicalDrawingCache] invalidated viewId=vd-sys-elev-south
[NativeElementMeshExporter] ... (x2)
EXECUTE: SET_VIEW_CROP                                   <- command 2, SAME pointermove
[SetViewCropCommand] View 'vd-sys-elev-south' crop updated.
project() ... near=0.000 far=3.669  cropRegion=[-20.73,21.39 -> 20.73,24.05]   <- projection A
project() ... near=0.000 far=2.557  cropRegion=[-20.73,21.39 -> 20.73,24.05]   <- projection B
[HiddenLineRemoval] ... (x2)
§PERF-CACHE-STATS ... cacheHits=0 cacheMisses=18 hitRate=0%
§FIX-PLAN-BLANK-STALEGEN — accepting a stale projection into an EMPTY cache
    to avoid a blank view: staleGen=1206 currentGen=1209
```

1. **Two commands per pointermove.** `UPDATE_VIEW_DEFINITION` *and* `SET_VIEW_CROP`. Each invalidates
   the drawing cache and drives a full `EdgeProjectorService.project()` + `HiddenLineRemoval`.
2. **The two projections disagree.** Paired `project()` calls in one tick carry **different `far`**
   values (`3.669` then `2.557`; `12.135` then `28.895`; …) because `resolveClipRange()` derives
   elevation depth from the crop and the first projection still sees the **previous** crop's depth.
   Each tick therefore renders two different drawings.
3. **The stale one sometimes wins.** `§FIX-PLAN-BLANK-STALEGEN` fires on **every tick** —
   `staleGen=1206 currentGen=1209`, then `1212/1215`, `1218/1221` … generation advancing by 3 per
   drag step. The guard is honest about what it does, and during a drag what it does is periodically
   present the **older** of the two competing projections. **This is the flicker.**
4. **The edge cache is useless during the drag.** `cacheHits=0 … hitRate=0%` every tick, because the
   cache key includes the crop-derived `far`. But **moving a crop does not change any element's edge
   geometry** — it changes the clip range and the `proj` vs `beyond` (dashed) classification. Re-
   extracting all 18 groups per mouse-move is pure waste. The 0% hit rate is a cache-key defect.

### Architectural framing

A crop drag is **one user gesture, not N commands.**

- **P6** — the *commit* is a command: one `SET_VIEW_CROP`, one undo entry, on pointer-up. The *live
  preview* between pointer-down and pointer-up is view state, not a mutation, and must not round-trip
  the command bus and the undo stack 60x/s.
- **P3** — all refresh coalesces through the single frame bus: at most one projection per frame,
  superseded ticks dropped, never two projections for one tick.
- A live view must **never regress to an older generation.** Hold the last good drawing until the new
  one is ready. The flicker is a *correctness* bug about ordering, not a *speed* bug — and it will
  not be fixed by making the projection faster.

**`FastPathProjectorService` already exists and boots** — `[main] FastPathProjectorService initialized
(sub-50ms interactive projection)`. The "organic, flowing" behaviour the founder is asking for is
**progressive refinement**: fast path while dragging, full-quality projection on settle.

### Phases

| Phase | Work |
|---|---|
| **P1** | **One gesture ⇒ one command.** Collapse the `UPDATE_VIEW_DEFINITION` + `SET_VIEW_CROP` pair. Commit one `SET_VIEW_CROP` on pointer-up (one undo entry). Live drag updates view state / the projector directly. |
| **P2** | **Coalesce to the frame bus (P3):** ≤ 1 projection per frame; drop superseded ticks. |
| **P3** | **Fix the clip-range ordering** so a projection can never run against the previous crop's `far`. |
| **P4** | **Never display a stale generation.** Replace the drag-time `§FIX-PLAN-BLANK-STALEGEN` behaviour with hold-last-good-drawing (double-buffer); swap only when the new generation is ready. **Keep** the blank-view guard for the genuine cold-cache case it was written for — do not delete it. |
| **P5** | **Fix the edge-cache key** so it excludes the crop-derived `far`. Element edge geometry is crop-invariant. Target a high hit-rate during drag. **Biggest single win.** |
| **P6** | **Progressive refinement:** drive the drag through `FastPathProjectorService`; settle to full `EdgeProjectorService` + `HiddenLineRemoval` on pointer-up. |
| **P7** | Tests: one drag gesture ⇒ exactly one committed command + one undo entry; N pointermoves ⇒ ≤ N projections, never two per tick; displayed generation is **monotonic**; edge-cache hit-rate > 0 during a pure crop drag. |

**Sequencing:** **after L-221** — that agent currently owns `EdgeProjectorService`, and P5 lives there.
P1–P4 are in the crop/drag/cache layer and could start earlier if the fences are respected.

**Contract mapping:** C04 (rendering & scheduling), **P3** (single rAF / frame bus), **P6** (commands
are the only mutation path), C06, DOC-1.4 / DOC-1.8 (projection + technical-drawing cache).

**Note on praise:** the founder called the elevation output itself *"really good"*. Nothing in this
task should change the rendered result — only *when* and *how often* it is computed, and *which*
generation is shown.

---

## L-223 — §AUDIT-VISIBILITY-INTENT-WIRING  (HIGH; audit-first, then phased fix)

Founder: *"Can you please audit the visibility intent full and complete architecture — orchestration,
element, and compliance with contracts? The concept is sound but I believe it is not connected and
wired with the actual real view properties. An example is the elevation view on the screenshot: they
are not connected with the ones on the real elevation (which are correct). The ones on the view
intent look just like placeholders — which should not be the case. Ideally if the user changes the
colours, the values, the view should be updated — and also the user should be able to change the
values. At the moment I click a colour but can't change it."*

### Grounded findings (established before any agent starts)

**1. The colour picker is disabled by design, and nothing says so.**

The live panel is `apps/editor/src/ui/VisibilityIntentPanel.ts` (1155 lines). It stamps
`${intent.isSystem ? 'disabled' : ''}` onto **every** input — 17 `isSystem` gates:

| Field | Line |
|---|---|
| name / description | `:140`, `:141` |
| visible | `:249` |
| line.colour / line.opacity / line.style | `:265`, `:267`, `:269` |
| fill.style / fill.colour / fill.opacity | `:274`, `:280`, `:284` |
| symbolicRule | `:286` |
| 3D surface section | `:326-330` |
| Add Modifier (view + purpose) | `:399`, `:481` |

**All four intents in the founder's sidebar are `system`.** The form is therefore inert for every
intent that ships. `Duplicate` is the only escape hatch, and the UI never says so.

This is the **L-219 failure mode restated**: a control that looks editable, is not, and gives no reason.

**2. The modifiers appear not to drive the real elevation.**

The correct elevation pen weights come from `packages/core-app-model/src/drawing/HiddenLineRemoval.ts`
(`§ELEV-LINEWEIGHT-02` / `§ELEV-LINEWEIGHT-03`, L-190 / L-196). A grep of that module finds **no
reference to the visibility-intent store or to `IntentStyle`**.

Meanwhile the intent system demonstrably does *something*:

```
[IntentStylePrewarmer] Pre-warmed 1632 style slots in 5.39ms
[VGSceneApplicator] DOC-1.13 applyToProjectionLayers() — applied=9/14 layers
```

So it is **half-connected**: layer visibility flows; per-view-type CUT / BEYOND / HIDDEN / PROJECTION
appearance apparently does not reach the drawing HLR emits. And **5 of 14 layers are never applied** —
unexplained. Half-connected is the worst state: it looks alive.

**3. Duplicate module hazard.** Two classes named `VisibilityIntentPanel`. The second,
`apps/editor/src/ui/visibility/VisibilityIntentPanel.ts`, is a **50-line Phase-F stub** whose header
reads *"Phase F stub: evaluates all elements as visible."* `initUI.ts:92-93` lazily imports the real
one. A stub that claims to evaluate visibility, sharing a class name with the real panel, is a trap.

**4. The panel mutates via the legacy path.** Seven `window.commandManager` sites (`:764`, `:785`,
`:883`, `:913`, `:926`, `:1038-1039`), each tagged
`TODO(E.5.x): legacy commandManager — replace with runtime.bus.executeCommand`. `npm run
check:commandmanager` is a CI guard against exactly this.

### Phase A — THE AUDIT (read-only; this is what the founder asked for)

Produce a **wiring map**, hop by hop, stating for each whether appearance data (line weight, colour,
fill, visible — per CUT | BEYOND | HIDDEN | PROJECTION, per view type) **flows or stops**:

```
VisibilityIntentTypes / Defaults / Store
   -> viewIntentInstanceStore
   -> IntentStylePrewarmer            (1632 style slots — of what? consumed by whom?)
   -> VGSceneApplicator.applyToProjectionLayers()    (applied=9/14 — which 5, and why?)
   -> EdgeProjectorService
   -> HiddenLineRemoval  (elevation lineweight)
   -> the rendered elevation
```

Answer explicitly:

- **A1.** Why `applied=9/14`? Name the five layers and why they are skipped.
- **A2.** Does **any** intent appearance field reach HLR's elevation lineweight decision, or is
  the elevation lineweight logic wholly independent of the intent system?
- **A3.** Is `VGToIntentMigration` leaving the four system intents with every field `inherit`, so the
  panel would render placeholders **even if it were editable**?
- **A4.** Contract compliance: **P7** (visibility intent is a DOMAIN concept, not UI state), **C09**,
  **P6**, **P1**. Where does the code disagree with the contract? Per CLAUDE.md, the code is wrong.

### Phase B — the fix, in this order (only after Phase A)

| Phase | Work |
|---|---|
| **B1** | System intents become **visibly read-only, with an explanation and a prominent "Duplicate to edit"**. Do **not** simply unlock them — they are the shipped defaults, a user editing them in place has no way back, and P7 makes them domain state, not preferences. |
| **B2** | **A user-owned intent's appearance edits must actually reach the elevation and plan.** This is the real request. If the pipeline cannot express per-view-type appearance today, **say so and propose the seam** rather than faking it. |
| **B3** | Delete or rename the 50-line stub panel (**P1** — single composition root, no parallel wiring). |
| **B4** | Migrate the 7 `window.commandManager` sites to `runtime.bus.executeCommand` (**P6**; `check:commandmanager`). |
| **B5** | Tests: a duplicated intent's `line.colour` change reaches the rendered elevation; a system intent cannot be mutated; the stub panel no longer resolves. |

**HARD NON-GOAL:** do not make the swatches *look* editable while the value still cannot reach the
view. That is precisely the lie-in-the-UI failure mode L-219 is about, and the founder would find it
within a minute.

**Contract mapping:** **P7** (visibility intent is not UI state), **C09** (AI and visibility intent),
C06 (UI shell and tools), C03 / C16 (commands), DOC-1.13 (projection layers), **P1**, **P6**.

---

## L-224 — §AUDIT-PROJECT-ISOLATION-E2E  (HIGH; audit-first, then fix)

Founder: *"Please audit the project isolation end to end. At the moment, when the user opens a
project, works on it, goes back to Projects and either creates a project or opens another, there is a
reminiscencia from the previous one. It is not a proper start-from-scratch concept."*

There **is** a guard — `ProjectIsolationAudit` (Contract 48). It is blind to exactly the case he hit.

### Structural finding 1 — the audit never runs when you OPEN another project

`packages/core-app-model/src/persistence/ProjectIsolationAudit.ts:144`:

```ts
if (detail.empty !== true) return;   // only audit fresh / cleared projects
```

Its own header (`:38-39`):

> *"The audit runs only on `empty:true` loads to keep the false-positive rate at zero — non-empty
> loads legitimately bring back saved geometry."*

The founder's scenario is *"go back to Projects and either **create** a project or **open another**."*
**Creating is audited. Opening another project is never audited at all.** The coverage hole is
precisely the reported bug.

The false-positive reasoning is sound **for geometry** — a loaded project legitimately has walls. But
it throws away *all* coverage of the surfaces where leakage actually shows: stores, caches, graphs,
registries, undo history. The right fix is to compare against **the loaded snapshot's expected
contents**, not against "must be empty".

### Structural finding 2 — the audit inspects the scene and two window globals. Not one store.

`runAudit()` (`:111-129`) checks only:

- `inspectScene()` (`:63-94`) — underlay meshes, IFC groups, DXF overlays, surviving BIM meshes
- `inspectGlobals()` (`:96-109`) — `window.floorPlanUnderlayTool`, `window._ifcServerUploadIds`

Boot logs:

```
[initStores] StoreRegistry: 37 stores registered — visibility-intent, view-intent-instance,
  vg-governance, view, phase-filter, RoomRequirement, title-block, schedule, user-material, sheet,
  view-template, AssetCatalogEntry, wall, slab, column, beam, stair, ..., annotation
```

**A stale schedule, sheet, view-template, annotation, room-requirement or visibility-intent carried
from project A would pass this audit as "✓ loaded clean".** Nor does it inspect `SemanticGraph`,
`TemporalGraph`, `RoomGraphService`, the `ViewTechnicalDrawingCache` / NME / EdgeProjector caches,
`ElementRegistry`, `BimManager`'s level registry, the selection, or the undo ring-buffer.

**It is a scene-graph guard wearing the name of a project-isolation guard.** A "✓ loaded clean" that
never looked at 37 stores is worse than no audit — it manufactures confidence.

### Suspects (real evidence; causality not yet proven)

**S1 — the undo ring-buffer survives the switch.** From his log:

```
[elementUndoStoreAdapter] skip remove — not found in store: furniture_01KX68Z34JZZNQBBQ528BEKAH3
[elementUndoStoreAdapter] skip remove — not found in store: plumbing_01KX68T0455A479V3YP5VYWD9P
```

…while the fixture he had just created in the open project carried id
`9e44427e-9bbf-4224-834b-9558616bab7f`. **Two different id namespaces in one undo stack.** Ctrl+Z was
reaching for elements that do not exist in the open project.

**S2 — collaboration catch-up replays across the switch.**

```
[initCollaboration] Catch-up: requesting commands since 2026-07-10T14:53:36.440Z
[initCollaboration] Catch-up: replaying 28 missed command(s)
[RemoteCommandDispatcher] §DUPLICATE-ROOMS-PERSIST — skipping already-applied create  (x21)
[RemoteCommandDispatcher] Applied remote command: ADD_OPENING
[CreateWallOpeningCommand] canExecute rejected: Opening overlaps existing opening(s):
    new=[1.561,2.487]m vs existing 7214bd62 [1.561,2.487]m
```

Immediately after a project switch, the replay tried to re-add openings that were already there —
identical intervals, to three decimal places.

### NOT a leak — checked, and my first instinct was wrong

`[UnderlayPersistence] Clear skipped — no current project bound` is **deliberate and correct**.
`clearPersistedUnderlay` (`apps/editor/src/engine/UnderlayPersistence.ts:112-124`):

> *"No-op when no project is bound, which is exactly what we want during project-switch teardown —
> the outgoing project's record must survive for next visit."*

Recorded so nobody re-litigates it.

### Phase A — the end-to-end audit (read-only)

Enumerate **every stateful surface** that must be reset on project switch, and classify each as
**CLEARED / RESTORED-FROM-SNAPSHOT / LEAKS**:

| Surface group | Members |
|---|---|
| Stores | all 37 in `StoreRegistry` |
| Graphs / engines | `SemanticGraph`, `TemporalGraph`, `RoomGraphService`, `DecisionRecordStore`, `ConstraintEngine`, `PhysicsEngine` |
| Registries | `ElementRegistry`, `BimManager` levels |
| Caches | `ViewTechnicalDrawingCache`, NME cache, `EdgeProjectorService` cache, `ViewRenderCache`, `IntentStylePrewarmer` |
| Interaction | `SelectionManager`, **undo ring-buffer + `commandManager` history** |
| Collaboration | `RemoteCommandDispatcher` catch-up cursor, socket room |
| Ambient | `window.*` singletons, `localStorage` / IndexedDB scoping |

Reconcile against what `ClearProjectCommand` and `ProjectLoader` actually do, and against the existing
static guards (`npm run check:isolation` → `scripts/check/check-project-isolation.mjs` +
`check-storage-isolation.mjs`).

### Phase B — the fix, in order

| Phase | Work |
|---|---|
| **B1** | **Make the audit cover the reported case:** run on EVERY project load, comparing against the loaded snapshot's expected contents rather than against "must be empty". That keeps the false-positive rate at zero *without* abandoning coverage. |
| **B2** | **Extend it beyond the scene** to the store / cache / graph / undo surfaces above. |
| **B3** | Prove or refute **S1** (undo ring-buffer) and **S2** (collaboration catch-up) **with evidence**, then fix what is real. |
| **B4** | Establish the invariant in **Contract 48**: *a project switch is a full teardown; every surface has a named owner responsible for clearing it, and the audit enumerates **owners**, not symptoms.* |
| **B5** | Tests: open A, edit, open B ⇒ every enumerated surface holds only B's state; Ctrl+Z in B never references an A-era id. |

**Non-goal:** do not silence the audit or narrow its scope to make it pass.

**Also:** `ProjectIsolationAudit` reads `window` through a `(window as any)` cast helper (`:59-61`).
Check it against **P4** and the allowlist while you are in there.

**Contract mapping:** **Contract 48** (project isolation), C02 (composition root & boot), C03
(stores), P1, P4.

---

## L-225 — §FIX-URINAL-BIDET-RENDER-AS-TOILET  (MEDIUM, correctness)

Found by the L-221 agent while authoring the plumbing symbols. **Not founder-reported.**

`packages/geometry-plumbing/src/PlumbingTypes.ts:13` declares seven fixture types:

```ts
export type PlumbingFixtureType =
    'toilet' | 'sink' | 'urinal' | 'bidet' | 'bath' | 'shower' | 'accessory';
```

**`urinal` and `bidet` have no 3D geometry factory.** `PlumbingFragmentBuilder` falls both through its
`else` branch to `createToiletMesh()`. Place a urinal, get a toilet — silently. The model, the
schedule, the IFC export and the take-off all disagree with the drawing.

L-221 authored correct 2D symbols for the **full** union (so the exhaustiveness test holds), which
means plan and elevation now draw a urinal while the 3D view draws a toilet. That inconsistency is
newly **visible** — and that is the honest way round.

### The real defect is the silent `else`

Two missing meshes are the symptom. A fixture type with no geometry factory silently rendering as a
*different fixture* is the disease.

| Phase | Work |
|---|---|
| **P1** | Author real `createUrinalMesh()` / `createBidetMesh()` parametric geometry, matching the footprints the L-221 symbols already declare — **the 2D symbol is now the spec.** |
| **P2** | **Remove the silent `else` fallback.** A type with no factory must fail loudly (typed exhaustiveness switch / dev-time error), never render as another fixture. |
| **P3** | Test: every member of `PlumbingFixtureType` produces geometry distinct from every other member. |

**Contract mapping:** C11 (one element type ⇒ one creation pipeline), C06.

---

## L-223 — PHASE A AUDIT RESULT + FOUNDER DECISION (2026-07-10)

**The orchestrator's root cause was a red herring; the agent refuted it from all 668 lines of
`HiddenLineRemoval.ts`.** HLR does **occlusion only** — it never held pen appearance, so its
ignorance of the intent store is irrelevant.

**Real root cause — a two-authority collision.** The intent store IS wired into the pen resolver
(`GraphicsRulesEngine.resolveStyle()._intentRules()`, `GraphicsRulesEngine.ts:187-218` — priority-1000
over PenWeightTable's priority-0). But the on-screen elevation renderer is **`PlanViewCanvas`**
(Canvas2D; `ViewController.ts:959-967` routes elevation/section here, not the OBC THREE scene), and at
`PlanViewCanvas.ts:321-329` it **overwrites** `_pen.color` with `vgEdge` and `_pen.widthMm` with
`vgLineWeight` — both from the **legacy `vgGovernanceStore`** (`PlanViewManager.ts:669-686`), which is
non-null for every real category, so the override **always fires**.

- Intent **opacity + dash + door/window symbolic** path → reach screen.
- Intent **width + colour** → computed, then **discarded**.
- The panel edits the **losing** authority — and can't even do that, because all four shipped intents
  are `isSystem` → all 17 inputs `disabled`.

**A1** `applied=9/14`: expected — a DXF layer exists only if EdgeProjectorService projected ≥1 element
of that category into the view; the 5 skipped had no geometry in the south elevation. Legacy VG path,
not the intent path. **A3** the values are concrete `PenWeightTable` seeds, NOT `inherit`;
`VGToIntentMigration` "0 migrated" is a no-op, not the cause. The disabled fields + the fact that
elevation weights live in the (also-disabled) **View Modifiers** tab is why they read as placeholders.
**A4** breaches: P7/C09 split-brain (two authorities; `VGSceneApplicator` self-marked `@deprecated`);
P6 — 7 `cm?.execute?.` sites that `check:commandmanager` **silently misses** (it scans only
`packages/`+`plugins/` for the literal `commandManager.execute`; the panel is in `apps/` and writes
`cm?.execute?.`); P1 — the 50-line stub panel has zero importers.

### FOUNDER DECISION (2026-07-10): **Retire VG everywhere (plan + elevation + section).**

The intent store becomes the **single** style authority for all 2D views; the deprecated
`vgGovernanceStore` override is fully removed. This is the `IntentSceneApplicator` supersession that
`VGSceneApplicator`'s own header promises. The founder chose the full retirement over the
elevation-only narrow fix, accepting that it also touches plan-view rendering he currently considers
correct — so **plan appearance must be proven unchanged** (regression guard), since the intent seeds
are `PenWeightTable`-derived and *should* resolve to the same weights VG produces today.

**This warrants an ADR** (retiring a legacy authority across all 2D views). Orchestrator to author
`ADR-01xx IntentSceneApplicator supersedes VGSceneApplicator` alongside the code, citing C09 / P7 and
superseding the Contract-25b VG governance path.

### Phase B — the fix, in order

| Phase | Work |
|---|---|
| **B0** | **Prove plan/elevation appearance is byte-identical FIRST** — capture the current resolved (width, colour, opacity, dash) per category×state for a reference model, as the regression oracle. The founder likes today's output; B2 must not change it, only change *which authority produces it*. |
| **B2a** | Make the intent-inclusive `_pen` from `GraphicsRulesEngine.resolveStyle()` **authoritative** for width+colour in `PlanViewCanvas` (all 2D views). Remove the `vgEdge`/`vgLineWeight` override at `:321-329`; keep VG only as an explicit fallback for a category the intent system genuinely doesn't cover, or remove it entirely if coverage is complete. Verify against B0 — plan + elevation unchanged. |
| **B2b** | Per-view **"assign intent"** affordance in the panel (`viewIntentInstanceStore.assign`), so a duplicated user intent actually binds to `vd-sys-elev-south`. Today only collab/migration call assign. |
| **B1** | System intents become **visibly read-only with a "Duplicate to edit"** explanation. Now meaningful, because post-B2a a duplicated intent's edits actually reach the view. |
| **B3** | Delete the zero-importer stub `apps/editor/src/ui/visibility/VisibilityIntentPanel.ts` (P1). |
| **B4** | Migrate the 7 `cm?.execute?.` sites to `runtime.bus`. **Not mechanical:** 3 (`BulkApplyAppearance`, `Copy/PasteAppearancePatch`) have **no bus handlers** and the panel is built with a **null runtime** (`initUI.ts:596`) — thread the runtime + author 3 handlers. **Also fix `check:commandmanager`** to scan `apps/` and match `cm?.execute?.`, so this class of P6 breach can't hide again. |
| **B5** | Tests: a duplicated+assigned intent's `line.colour` change reaches the rendered elevation AND plan; a system intent cannot be mutated; plan appearance matches the B0 oracle; the stub panel no longer resolves. |

**HARD NON-GOAL:** do not change the settled rendered appearance (B0 is the guard). The migration
changes the *authority*, not the *pixels* — until the user actually edits an intent.

**Contract mapping:** **P7** (intent is domain, not UI state), **C09**, **P6**, **P1**, C06,
DOC-1.13, Contract 25b (superseded), new ADR `IntentSceneApplicator`.

---

## L-224 — PHASE A AUDIT RESULT + PHASE B GREENLIT (2026-07-10)

**The root cause is a bus mismatch — not a missing clear, and neither of the orchestrator's two
suspects.** The `F.events` migration re-pointed the EMITTERS of `pryzm-project-switch` /
`pryzm-project-loaded` to the typed in-memory `runtime.events.emit()` (`EventBus`, which never
touches `window`), but left **six isolation-critical listeners bound with `window.addEventListener`**.
They are dead — they never fire:

| Dead listener | What died with it |
|---|---|
| `ProjectLifecycleController.ts:48` | the **entire C13 §4 teardown** (`batchCoordinator.forceReset()`, wall-rebuild reset, `clearUndoStacks()`) |
| `ProjectIsolationAudit.ts:142` | the **tripwire itself** — no audit has run since the migration |
| `ProjectScopedStorage.ts:60/67` | project-scoped storage binding (inert — zero callers) |
| `ConstraintEngine.ts:111` | per-project constraint re-run |
| `AmbientIntelligence.ts:118/121` | per-project ambient reset |
| `ImportManagerPanel.ts:99` | import-panel reset |

~30 other listeners were migrated to `runtime.events.on()` and DO fire — so the bus works; these six
were orphaned. **The teardown controller written specifically to prevent this class of bug has not
run since the migration, and the audit that should have surfaced the leak observes nothing.** That is
the reminiscencia: `BatchCoordinator` / wall-rebuild / `ConstraintEngine` / `AmbientIntelligence`
state surviving the switch.

### Both suspects refuted with evidence

- **S1 (undo ring-buffer) — REFUTED as an A→B leak.** Every load routes through `ProjectLoader.load`,
  whose `finally` (`:2079-2083`) calls `clearHistory()` + `runtime.bus.clearUndoStacks()` (ring +
  legacy). A's entries are gone before B is interactive. The `skip remove … furniture_01KX…` lines
  are within-B ring-apply failures (ULID vs UUID = two creation paths in B, not two projects). The
  dedicated switch-time undo clear IS dead, but the load-time clear makes it redundant — a backstop
  gap, not a live leak.
- **S2 (collab catch-up) — REFUTED.** Catch-up requests B's own projectId with a per-project
  `sessionStorage` cursor; replayed commands dispatch `source:'REMOTE'` → `suppressUndo`, never
  touching the ring. The 21 duplicate-skips + opening-overlap rejects are idempotency guards working
  as designed. Within-project chatter, not reminiscencia.

### Contract-number correction

This is **C13 (Project Lifecycle & Isolation)**, not "Contract 48" (C48 is Backup & DR).
`ProjectIsolationAudit.ts` / `ProjectScopedStorage.ts` cite "Contract 48"; `ProjectScopeRegistry.ts`
cites a non-existent `44/45-*` doc. Stale references — the orchestrator fixes the doc refs and lands
the invariant in **C13 §3**.

### Proposed C13 invariants (orchestrator to author)

- **C13 §3.9** — every project-lifecycle listener MUST subscribe on the same bus the events are
  emitted on (`runtime.events.on`), never `window.addEventListener`. CI gate: `check-project-isolation`
  fails any `window.addEventListener('pryzm-project-{switch,loaded,context-set}'`.
- **C13 §3.10** — a project switch is a full teardown with NAMED OWNERS; the audit enumerates owners
  (via `ProjectScopeRegistry`), runs on EVERY load, and compares live state against the loaded
  snapshot's expected contents across stores/graphs/caches/undo — not just the THREE scene.

### Phase B — GREENLIT (no founder decision needed; nothing changes appearance)

| Phase | Work |
|---|---|
| **B0** | Migrate the 6 orphaned `window.addEventListener` listeners to `runtime.events.on` / `onRuntimeEvent`, reviving `ProjectLifecycleController` + `ProjectIsolationAudit` first (they are the fix). |
| **B1** | Run the audit on EVERY load, comparing against the loaded snapshot's expected contents (not "must be empty"). |
| **B2** | Extend the audit beyond the scene to stores / graphs / caches / undo. |
| **B3** | Own-registry invariant: every switch-reset surface has a named owner in `ProjectScopeRegistry`; a store that registers no `clear` fails a test. |
| **B4** | CI gate in `check-project-isolation` on the forbidden `addEventListener` string; fix the stale "Contract 48"/`44/45-*` doc refs. |
| **B5** | Tests: open A → edit → open B ⇒ every enumerated surface holds only B's state; a new store with no clear-path fails; the revived audit fires on load. |

**Fence sequencing (from the agent):** `ProjectLifecycleController.ts` is in `packages/runtime-composer/src/`
— NOT L-220's fence (`runtime-composer/src/types.ts` only), so it is this agent's to fix, but confirm
no collision. `ConstraintEngine.ts` (`packages/constraint-solver/`) and `AmbientIntelligence.ts`
(`packages/ai-host/`) are outside the persistence fence — orchestrator sequences those two.
`EdgeProjectorService` CW drawing cache (possible cross-project drawing reminiscencia) is L-221's
fence — flagged, not touched.

**Contract mapping:** C13 §3 (project lifecycle & isolation), C02, C03, P1, P4.

---

## L-226 — §FEAT-GLOBE-DEFAULT-AUTOFRAME  (MEDIUM, UX)

Founder: *"The Cesium 3D tiles view (3D Globe) is sound, but I always need to click 'Zoom to Site' to
see the correct building. Could you add this on the default pipeline?"*

**The auto-frame is HALF-BUILT — this is almost certainly a wiring fix, not new camera code.**
§FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) already implements exactly "no manual Zoom to Site needed":

- `armGlobeReframeOnBaseSettle()` (`CesiumViewport.ts:3957`) arms a one-shot corrective reframe.
- `performInitialReframe()` (`:3995`) fires it ≤ once, honours a user who has grabbed the camera,
  frames the building's bounding sphere at the **settled** tile base.
- The header (`:3942-3956`) states the problem verbatim: `renderBuildingOnGlobe` runs
  `frameCentroid:false` (deliberately does not fly); `GISAreaLayout.reframeSiteIn3D()` frames the
  building immediately — but at FLAT base 0, before the async photoreal-tile height clamp settles.
  When the clamp re-seats the model on the real ground, the camera is **not** re-framed → it stays
  parked at the base-0 overview. **That is the founder's symptom.**

The Zoom-to-Site button (`GISAreaLayout.ts:795`) calls the same `reframeSiteIn3D()` the auto-path
should run — which is why clicking it works.

### Hypothesis to prove

`armGlobeReframeOnBaseSettle()` is either (a) not called on the default '3D globe' entry, (b) called
but its latches (`formaInitialReframeFired` / `formaUserMovedCamera`) are consumed before the
base-settle fires, or (c) the base-settle on the photoreal-tile path
(`clampToPhotorealTilesThenReplace`) is not wired to `reframeAfterBaseSettle()`.

### Phases

| Phase | Work |
|---|---|
| **P1** | Trace the default globe entry (`GISAreaLayout` launcher → `renderBuildingOnGlobe` → `clampToPhotorealTilesThenReplace`); establish why the L-184 one-shot does not fire (or fires against base 0). |
| **P2** | Wire `armGlobeReframeOnBaseSettle()` into the default entry so the settle-triggered `performInitialReframe()` frames the building at the settled base. **Reuse the funnel — no parallel flyTo.** |
| **P3** | Preserve the three §GLOBE-FRAME-NO-JUMP invariants: fire at most once, never after the user grabs the camera, never to a NaN target. |
| **P4** | Keep the manual 'Zoom to Site' button (explicit re-frame). |
| **P5** | Test: default globe entry ends framed on the building at the settled base, zero clicks, and does not re-yank after a subsequent tile-height restream. |

**Contract mapping:** C06 §7 (launcher layer), A.24 (render tiers), L-40 / L-104 / L-184 lineage.

---

## L-227 — §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY  (MEDIUM, quality)

Founder: *"Regarding the Forma '3D Site' view — can you make the 'Façade analysis ON' as sound as the
Sun Hours? The Sun Hours have an amazing quality gradient; on the building it is not nice, not sound.
It needs to be perfect — the exact quality in ALL the façades of the building."*

### Two different pipelines — that is the whole story

- **Ground (the one he loves)** — `computeSunHoursOnModel()` sampled per-face, coloured by the 5-stop
  `DEFAULT_SUN_HOURS_RAMP` (`packages/renderer-three/src/solar/heatmapRamp.ts:30-36`):
  `#6600FF purple (t0) → magenta → pink-red → orange → warm yellow (t1)`.
- **Façade (the flat cyan one)** — a *separate* subsystem: `prepareFacadeSunGrid` →
  `rasterizeFacadeSunTexture` (§FORMA-FACADE-SMOOTH, founder 2026-07-01) → Cesium entities
  (`CesiumViewport.ts:71-95, 656-679`, §FORMA-FACADE-ANALYSIS / ADR-0093), consumed via
  `siteMetricGrids.ts` + `workers/solarCodec.ts`.

Because they are different code, they produce different fidelity. His screenshot: ground = smooth
gradient, building = near-flat cyan.

### Hypotheses (measure; do not assume)

- **H-a** the façade rasteriser does not use `DEFAULT_SUN_HOURS_RAMP` → different colour mapping.
- **H-b** the façade sun grid samples at far lower density (or one band) than `computeSunHoursOnModel`
  → the gradient collapses to a flat tint.
- **H-c** the drape is a baked Cesium texture whose resolution / UV under-samples the wall.
- **H-d** the near-flat cyan is a *fallback* (occlusion / sun-vector returned constant), not a real
  per-point field. "In ALL the façades" suggests some faces carry no gradient at all.

### Phases

| Phase | Work |
|---|---|
| **P1** | Measure WHY the façade field is flatter: compare façade sun-grid density, ramp, and occlusion inputs against `computeSunHoursOnModel` for the SAME building + day. State which of H-a…H-d hold. |
| **P2** | Façade uses the **same `DEFAULT_SUN_HOURS_RAMP`** as the ground (single source of truth — identical quality ⇒ identical colour mapping). |
| **P3** | Per-face sample density high enough for a smooth gradient across each façade, not banded. If a baked texture, raise resolution / fix UV; if entity-per-sample, raise the grid. **Tier-gate + memory-budget** (40-storey WebGPU device-loss history — no 4K drapes on a tower). |
| **P4** | Occlusion parity: the façade study shadows by the same massing + OSM context as the ground study, so self-shadowed faces read correctly. |
| **P5** | Test: for a reference building + day, the façade per-face field has the same value range + ramp mapping as the ground field on a co-located probe, and varies smoothly per face (assert non-constant per-face variance — the regression is a flat tint). |

**Non-goal:** do not author a second ramp or a parallel solar sampler. Converge on the ground
pipeline's ramp + sampling; the façade path may keep its Cesium drape *mechanism* but must feed it the
same field + ramp.

**Contract mapping:** C21-CLIMATE-INGESTION, ADR-0074 (solar), ADR-0093 (façade analysis), A.24
(Presentation render tier). Related: L-226 (globe autoframe, same geospatial surface).

---

## L-222 — FIXED (078fa550) + L-228 deferred

§PERF-ELEV-CROP-DRAG-FLOW landed. The "crop drag" is a section/elevation **scope-box depth-handle**
drag. `PlanViewInteraction._applyScopeDragFromPointer` (`:1139-1157`) fired **two** legacy
`commandManager.execute` commands per throttled pointermove (`view.updateDefinition` + `view.setCrop`),
each dispatching `vd:view-updated` → `PlanViewManager._onViewUpdated` reprojected on each → two
projections/tick; the first saw the stale `far`. **D2 is caused by the two-command split — P1
subsumed P3.**

Fix: live drag = direct view-state write (0 undoable commands), ONE `view.updateDefinition` on
pointer-up (undo entries: dozens → 1); projections frame-coalesced (superseded dropped); cache holds
the warm drawing on a generation bump so a superseded projection hits reject, never stale-accept →
**displayed generation monotonic** (the flicker). §FIX-PLAN-BLANK-STALEGEN (L-90) preserved untouched.

**P6 (FastPathProjectorService) not routed** — hard-gated to orthographic plan previews, draws raw
`EdgesGeometry` to an overlay; would change the elevation look mid-drag. "Flowing" comes from
coalesce + hold-last-good instead.

**⚠ P5 was a wrong root cause — the agent refuted it.** `_cwProjectionCache` stores post-classification
geometry, and its `clipSignature` including `far` IS L-202's correctness fix. Removing `far` from the
key reintroduces the L-202 defect. Deferred as **L-228** (§PERF-EDGEPROJECTOR-TWO-LEVEL-CACHE): a
two-level cache — crop-invariant extraction (element+version) + per-crop re-classification (`far`).
LOW priority (the flicker is already gone; the 0% hit-rate is now harmless because the warm drawing
renders every frame). Must not regress L-202.

Gate: core-app-model views 49/49, geometry-plumbing 16/16, root tsc exit 0. 6 files.

---

## L-220 — FIXED (99f90411) + L-229 deferred

Both of the orchestrator's stated root causes were wrong; the agent refuted them from source.

**Plumbing:** `{id,to}` was CORRECT for the legacy `MovePlumbingCommand` (updates the geometry
`window.plumbingStore` the plan reads). A plugin `MovePlumbingHandler` (`{plumbingId,delta}`)
registered FIRST shadowed the bridge AND mutates a detached DTO store with no bridge to geometry — so
the brief's `{plumbingId,delta}` fix would have passed `canExecute` and still left the plan stale.
Fix: distinct un-shadowed `plumbing.moveFixture` dispatching `{id,to}`. No guard weakened.

**Floor/column/beam (Immer 18):** not a malformed patch. `affectedStores:['floor']` (correct for
undo) also drives `attachStores` to re-apply the forward patch to a detached empty `FloorStore`; the
id doesn't resolve → throw → `executeCommand` rejects. Fix: hardened `Store.applyPatch` to skip a
nested patch whose root id is absent, mirroring `ElementStore.applyPatch`'s existing guard. The matrix
test missed it because it wired no `attachStores`.

**P3 typed bus:** `dispatchTyped()` in `@pryzm/command-bus` + all 11 drag sites via `dragDispatch()`
→ wrong payload = compile error. A typed *overload* can't enforce it (loose signature always matches);
a typed *wrapper* can, and is what shipped. Non-drag dispatches stay loose (intended residue).
**P4:** rejections raise a toast, not a swallowed console error.

**+L-229 (§FIX-DRAG-MISSING-BRANCHES, MEDIUM):** the audit found slab/grid/lighting/opening have no
3D-drag branch (silent no-op — same class as the reported plumbing bug); ceiling commits but sets no
`_recordUndo`. Deferred to the same fence: add the missing branches (converging on `dragDispatch`),
add ceiling undo capture, and consider an exhaustive element-type switch so a new draggable type
without a branch fails loudly.

Gate: `@pryzm/stores` 745, matrix 14 (+ production-wiring regression), command-bus 26; every fenced
file tsc-clean. Sole root-tsc error is `CesiumViewport.ts:5346 normalizeFacadeStudy` — the live L-227
agent's mid-flight edit, resolves when L-227 commits.

---

## L-227 — FIXED (a6bcd902) + L-230 (founder colour question)

**The orchestrator's named ground pipeline was wrong; the agent refuted it.** The purple
`DEFAULT_SUN_HOURS_RAMP` + `computeSunHoursOnModel` (renderer-three) is a THIRD subsystem — the
BIM-model console heatmap — never used by the Cesium Forma view. In the real Forma view, both surfaces
live in `siteMetricGrids.ts`: ground = `sunHoursRgb` (blue→teal→gold→warm); façade =
`sunHoursRgbVivid` (same ramp ×1.45 sat).

**Real root cause (H-a + H-d):** (1) the vivid variant over-saturates the teal mid-band into cyan —
the founder's "cyan"; (2) `evaluateIntensity = lit / samples.length`, but a wall only accrues sun on
its outward side, so a vertical face can never reach the all-day divisor → the building collapses into
the cold half and never reaches gold/warm (open ground hits 1.0 → full ramp, which is why it looks
rich). H-b/H-c FALSE (façade lattice 2.5 m is finer than ground 4 m; atlas adequate). Material is
UNLIT — not a lighting wash.

**Fix:** façade → plain `sunHoursRgb` (dropped vivid) + field normalized to fill the ground's cold→warm
span (ported `computeSunHoursOnModel`'s own-max normalization). Drape mechanism + renderer-three
untouched; zero added GPU cost (deliberate — device-loss history). Occlusion parity confirmed. Gate:
apps/editor 64/64 (+4 incl. never-cyan ramp identity), solar-analysis 46/46, renderer-three 28/28,
tsc exit 0, 3 files.

**+L-230 (§FEAT-FORMA-SUNHOURS-PURPLE-RAMP, LOW, AWAITING FOUNDER):** the founder's "amazing" gradient
screenshots are purple→magenta→pink→orange→yellow = the renderer-three `DEFAULT_SUN_HOURS_RAMP`, NOT
the Forma ground's blue→teal→gold→warm. He may want the whole Forma feature restyled to the purple
ramp. One-function change (`sunHoursRgb` 4 stops → purple 5-stop) that moves ground+façade together
(they now share the ramp). Not started — needs the founder to confirm which gradient he means.

---

## L-224 — Phase B FIXED (51c3109a)

§FIX-PROJECT-ISOLATION-DEAD-LISTENERS. Migrated the orphaned `window.addEventListener`
project-lifecycle listeners to the typed `runtime.events` bus, reviving `ProjectLifecycleController`
(C13 §4 teardown: `BatchCoordinator.forceReset` + `clearUndoStacks` + wall/CW/slab resume) and
`ProjectIsolationAudit` (the tripwire). The new CI gate found a **7th** dead listener Phase A missed
(`FrustumCullingService.ts:139`). B1: `ProjectLoader` publishes `__pryzmLoadedProjectExpectation`
(snapshot ids); the audit flags a live element only if its id is not in that set → zero false
positives on a populated load, still catches a foreign id. Undo double-clear confirmed idempotent.
`ConstraintEngine` + `AmbientIntelligence` left dead (out of fence, gate-allowlisted) — per-project
recompute niceties, not isolation resets; orchestrator to sequence. Orchestrator TODO: land C13
§3.9/§3.10 invariants + fix the stale "Contract 48"→C13 doc references. Gate: `check:isolation` exit
0, runtime-composer 136/136, core-app-model 136/136 (+12 tests), root tsc exit 0, 12 files.

---

## L-231 — §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE  (CRITICAL, crash)

Founder: *"Check why the 3D view graphics broke while going to Cesium 3D tiles (3D globe view)."*

### The chain (all in the founder's log)

```
[RealEnvironmentService] §DIAG-GROUND-SHADOW-FIT … shadowMapAllocated=false … casters=7
[RenderPipelineManager] Rebuilding pipeline after shadow-map update.
SHADOW_REBUILD_SCHEDULED meshCount=1492
SHADOW_REBUILD_COMPLETE elapsed=6019.7ms                      ← 6-SECOND rebuild
Destroyed texture [Texture "ShadowDepthTexture"] used in a submit.   ×24
THREE.WebGPURenderer: WebGPU Device Lost: "A valid external Instance reference no longer exists."
→ WebGPU device recovered — renderer recreated
GIS toggle activated: true  →  Cesium activates
[Cesium WebGL] Fragment shader compile log: null
RuntimeError: Fragment shader failed to compile. Compile log: null
"An error occurred while rendering. Rendering has stopped."
footer: GPU: Auto WebGPU [WebGL] · webgl-fallback
```

**This is a recurrence of the 40-storey office device-loss cascade** (ShadowDepthTexture-mid-submit →
device loss), previously addressed by §SHADOW-DEVICE-LOSS-FIX / ADR-0111 — incomplete for heavy
*residential* scenes (3908 meshes, 1492 casters).

### Two linked defects

**(A) The shadow rebuild still destroys `ShadowDepthTexture` mid-submit.** `RenderPipelineManager`
already has §#47 coalescing + §FIX-SHADOW-REBUILD-LATCH-ASYNC (`:735-819`) that awaits the async
`_rebuildPipeline()` so the in-flight latch spans the real work. Yet the ×24 destroy still fires — so
a submit references the depth texture from a path the latch doesn't cover (candidates: the
device-loss RECOVERY dispose; an OBC/Pascal submit landing during the 6s async rebuild; the
shadow-map REALLOCATION itself). "External Instance reference no longer exists" = a Dawn instance
teardown = the whole GPU device died, not one texture.

**(B) Cesium can't survive the device loss.** After WebGPU is lost/recovered, Cesium's WebGL context
is invalid; `Compile log: null` is the classic lost/reset-GPU-process signature. The globe toggle then
hits a shader-compile failure and Cesium halts with a dead-end error panel and no recovery.

**L-205 freeze LIFTED** for this — the grey-square investigation is resolved (C04 §SHADOW + ADR-0120
shipped); this is a device-loss crash in the ADR-0111 domain. The fix must still honour C04 §SHADOW
(never resize a live map; never dispose off-frame).

### Phases

| Phase | Work |
|---|---|
| **A** | Instrument the ×24 `ShadowDepthTexture` destroy; identify which pass holds the submit-referenced handle when the 6s rebuild tears it down. Make teardown wait for the in-flight submit to drain (ADR-0111). Question whether a shadow-map *update* must rebuild the WHOLE pipeline — a 6s rebuild on 1492 casters says the scope is too broad. |
| **B** | Make Cesium activation survive/recover a device loss: gate the globe toggle until the renderer is confirmed live, and/or add a Cesium context-lost/restore handler that recompiles rather than halting. A `Compile log: null` must not be a dead end. |
| **C** | Tier-gate the shadow rebuild + map size for 1000+ casters (memory: oversized GPU resources + per-element unique materials are the device-loss triggers). |
| **D** | Tests: a simulated device-loss during a shadow rebuild does not destroy a submit-referenced texture; a device-loss followed by Cesium activation recovers instead of halting. |

**Contract mapping:** C04 §SHADOW, **ADR-0111** (shadow lifecycle / never sync-dispose
`ShadowDepthTexture`), §SHADOW-DEVICE-LOSS-FIX, A.24 (render tiers).

---

## L-232 — §FEAT-FACADE-ANALYSIS-SMOOTH-PER-FACE  (MEDIUM, quality — L-227 follow-up)

Founder: *"Check the façade analysis image (Forma 3D Site) — it is still really bad. Review, analyse
and make it sound (as ground — with this level of quality)."*

L-227 fixed the **colour** (dropped the vivid over-saturation, filled the ramp span so façades reach
gold/warm, not just the cold band). The founder's new image shows the colour is now right but the
**spatial** quality is not: per-storey horizontal banding and blotchy facets on the walls, vs the
ground's smooth continuous gradient. Different defect — resolution, not colour.

### Grounded root causes

1. **Sample spacing too coarse.** `prepareFacadeSunGrid` targets **2.5 m** (`siteMetricGrids.ts:1150`,
   *"Default 2.5 (clean per-face read)"*). Storeys are ~3 m → ~1 vertical sample per floor → the
   banding. The ground raster is continuous; the façade is under-sampled.
2. **The smooth path is spec'd but inactive.** `:1108` verbatim: *"clean per-face colouring; the
   smooth-interpolated-per-face version is SPEC'd in ADR-0093."* ADR-0093 specifies a smooth field;
   the coarse per-point path renders instead.
3. **Balcony/slab self-shadow hard edges.** The building's own balconies/slabs cast on the wall
   below; at 2.5 m those occlusion boundaries come out as hard blotches. The ground has no such fine
   self-occluders — which is why it looks clean.
4. **Possible per-face normalization seams.** L-227 added a fill-the-span normalization. If it
   normalizes per-face (each to its own max) rather than by the model's GLOBAL realised max (as
   `computeSunHoursOnModel` does), adjacent faces get different scales → seams. Verify it is global.

### Phases

| Phase | Work |
|---|---|
| **P1** | Implement the **smooth-interpolated-per-face** façade field ADR-0093 already specifies (`:1108`, `:1462-1464`) — smooth within a storey AND across every storey seam. |
| **P2** | Raise façade sample density below storey height (2.5 m → sub-metre) so self-shadow gradients resolve — **TIER-GATE + memory-budget HARD.** This is the 40-storey device-loss territory (**L-231**, an active CRITICAL crash); denser sampling + bigger drapes must scale DOWN on heavy scenes, never up on a tower. |
| **P3** | Verify L-227's normalization is by the model's **global** realised max, not per-face (per-face → seams). |
| **P4** | Soften balcony/slab self-shadow boundaries (denser sampling near occluder edges, or an AO-style soft term) so they read as gradient, not blotch. |
| **P5** | Tests: façade field is smooth across storey seams (no step at floor lines beyond the real sun gradient); co-located ground-vs-façade probe matches value + ramp; sample density bounded per tier (assert the heavy-scene budget). |

**Coordinate with L-231** — do not raise GPU resource use on heavy scenes while the device-loss crash
is open.

**Contract mapping:** C21-CLIMATE-INGESTION, ADR-0074 (solar), **ADR-0093** (façade analysis — the
smooth-per-face spec this implements), A.24 (Presentation tier). Follow-up to L-227.

---

## L-233 — §FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES  (MEDIUM, correctness)

Founder: *"When the levels are stacked, if the user moves or creates an element, many of the elements
in the view get un-stacked — back to normal. Is this intended?"* — No. Documented, partially-fixed bug.

### Root cause (code-confirmed; the code names the founder's bug)

`LevelExplodeController` (`apps/editor/src/engine/inspect/LevelExplodeController.ts`) applies a
VISUAL-only per-level Y-offset (`EXPLODE_GAP = 5 m`). Its own comment (`:48-50`): *"While the explode
is active, a rebuild (move / property edit) regenerate[s] the mesh at its true (model) elevation and
drops OUT of the exploded stack — the founder's [bug]."*

The partial fix **§FIX-LEVEL-EXPLODE-COORDINATION (L-113)** re-runs `_buildLevelGroups()` on a list of
`REBUILD_RECONCILE_EVENTS` (`:55-66`) to re-lift rebuilt meshes. **That allowlist is incomplete** —
it covers wall/slab/floor/ceiling/furniture/column/beam/roof/stair/curtainwall/door/window but NOT
`bim-room-*` / room-bounding-lines / room labels, handrail, opening, plumbing, lighting,
stair-railing, verticalCirculation, annotation.

**The log proves it:** exploded view = `rooms 526, labels 263`; the founder runs `MOVE_WINDOW` →
`bim-window-updated` + `bim-wall-updated` (in the list → wall re-lifts) BUT also a room re-detect
(rooms + labels rebuild) which is NOT in the list → **789 room/label roots drop to model Y** while
walls stay exploded. "Many elements un-stacked from one edit."

**Smell (same class as L-215 / L-229):** a per-element-type event allowlist — every new type must be
remembered, and derived elements (rooms/labels) rebuilt as a side-effect are the easiest to forget.

### Phases

| Phase | Work |
|---|---|
| **P1** | **Do NOT extend the allowlist.** Re-apply the explode offset **type-agnostically to ALL level-tagged roots** after a rebuild settles — reconcile on the batch-complete / frame-settle signal (or a single `bim-element-*` chokepoint), re-running `_buildLevelGroups()` for every root regardless of type. Rooms/labels/handrails/openings and any future type covered by construction. |
| **P2** | Preserve the L-113 `preservedBaseY` double-lift guard (`:292-300`) — a currently-lifted root must not re-capture its lifted Y as baseline. |
| **P3** | Coalesce: one move → N rebuilds must reconcile ONCE after the batch, not per-event (perf + correctness). |
| **P4** | Fix the gizmo/selection re-anchor after a rebuild-during-explode (the `§SELECT-GIZMO-REATTACH` per-frame flood in the log) so the moved element's selection tracks the rebuilt mesh at its exploded Y. |
| **P5** | Tests: in exploded mode, moving a window keeps rooms+labels+walls lifted; creating an element in exploded mode places it in the stack, not at model Y; collapsing restores exact original Y (no double-lift). |

**Contract mapping:** C06 (UI shell / inspect mode), C09 + P7 (visibility/inspect intent), L-113
lineage. Fence: `apps/editor/src/engine/inspect/**` — not owned by any live agent.

---

## L-234 — §FIX-WALL-MOVE-HOSTED-DOOR-FREEZE  (CRITICAL, hang — RECURRENT)

Founder: *"RECURRENT — moving a wall with a hosted door freezes the project, but the logs don't seem
to say much. I have raised this many times. Review, deeply analyse and fix."*

### The "no logs" clue is the whole diagnosis

A frozen tab that emits **nothing** is a **synchronous main-thread hang** — an infinite loop or an
unbounded (O(n²) / recursive) blow-up that never yields. The event loop never flushes console or
renders, which is exactly why every prior attempt found nothing: there is no error to log; the thread
simply never returns.

### Trigger (in the founder's log)

```
[WallTransform] Wall "wall_…" — gizmo aligned with direction N {x:-1, y:0, z:1.157487755090348e-16}
[CommandManager] EXECUTE: UPDATE_WALL_BASELINE
```

The near-zero `z` (1.16e-16) is a **degeneracy smell** — the moved baseline is almost degenerate.

### Suspect code

`packages/command-registry/src/walls/UpdateWallBaselineCommand.ts` (`:116-208`) handles the fragile
hosted-opening case: the drag recomputes the baseline; for a wall hosting doors/windows,
`WallStore.update()` throws `BaselineReversalError` if endpoints swap (opening offsets are measured
from endpoint[0]); the command detects reversal via a `dot` product (`:142-149`), swaps to preserve
offsets, then force-rebuilds the wall (`:165-200`).

### Hang hypotheses — MEASURE, do not assume

- **(a)** the reversal `dot` check misbehaves at a near-degenerate baseline (`dot ≈ 0`) → oscillates swap/no-swap.
- **(b)** the force-rebuild re-hosts the opening → re-triggers a baseline update → rebuild → re-host cascade with no fixpoint.
- **(c)** the door/window re-projection onto the moved wall loops when the opening no longer fits / falls off the wall (`WallOccupancyStore.canPlace`, interior-wall-on-opening conflict class).
- **(d)** `WallJoinResolver` / `JunctionResolverV2` enters an unbounded loop on the degenerate near-zero-length wall (known multi-cluster degenerate-wall bug).

Related: **ADR-057** (realtime-edit perf — a door move triggering a whole-level rebuild).

### Phases — measure-first (this is a hang; the L-205 discipline applies)

| Phase | Work |
|---|---|
| **P1** | **LOCATE the hang first** — add a main-thread watchdog + bounded loop-iteration guards across wall-move → baseline-update → rebuild → opening-re-host → join-resolve. Counters that throw+log after N iterations; a frame-budget watchdog that dumps the active call stack when a synchronous span exceeds ~1 s. Turn the silent freeze into a located, logged failure — what every prior attempt lacked. |
| **P2** | **Reproduce deterministically** — a wall hosting a door, moved to a near-degenerate / endpoint-reversing baseline (`z ≈ 1e-16`). Add it as a test fixture. |
| **P3** | **Fix the actual loop** — a missing fixpoint/guard in the re-host cascade, or a degenerate-baseline guard in the reversal/join path. A degenerate baseline (near-zero length or `dot ≈ 0`) must be **rejected with a user toast**, never processed into a loop. |
| **P4** | **Preserve the `BaselineReversalError` guard** — it is CORRECT (opening offsets depend on endpoint[0]). The fix stops the swap/rebuild CASCADING, it does not remove the guard. |
| **P5** | Tests: moving a hosted-door wall to a degenerate baseline terminates (bounded), commits or cleanly rejects, never hangs; the re-host cascade reaches a fixpoint in ≤1 pass. |

**Contract mapping:** C11 (element pipeline), **C15** (hosted elements: doors/windows in walls),
**ADR-057** (realtime-edit perf), P6. Fence: `packages/command-registry/src/walls/**`,
`packages/geometry-wall/**`, the wall/opening re-host + join path — disjoint from the live agents
(L-231 renderer, L-232 façade, L-233 level-explode).

---

## L-237 — §FIX-GREY-CATCHER-FIRST-CASTER-UNBOUND-SHADOWMAP  (HIGH — the L-205 grey, solved)

Founder, with the decisive new evidence: *"When the project starts the canvas is white, the 3D
renders perfect. **After the first wall is created** the wrong rectangular grey shape renders. Then I
switch to WebGL — render perfect. Then back to WebGPU — **also perfect**, all walls with the shade
projection on the invisible ground layer. But during the first element creation and until I switch,
the grey rectangle is present."*

### This closes the mechanism. Three facts do it:

1. **It appears exactly at the FIRST CASTER** — not before, not later.
2. **A renderer swap in EITHER direction cures it permanently.** So it is not "WebGL is better"; it is
   a **transient invalid state** that a full pipeline rebuild clears.
3. `RealEnvironmentService` keeps the catcher **attached but INVISIBLE until the first caster**
   (`_applyCatcher` → `setEnabled(this._hasCasters)`, `:184-189`). The reveal *is* the trigger.

### The code already confesses the bug

`RealEnvironmentService.ts:141-143`, verbatim:

> *"(The cosmetic empty-project grey — **ShadowMaterial not fully transparent where unlit on WebGPU** —
> is a SEPARATE follow-up that must NOT touch this receive path.)"*

The caster-visibility gate is a **workaround** that hid this on an empty scene. It resurfaces the
instant the catcher is shown.

### The mechanism (C04 §SHADOW.0)

The catcher paints `alpha = opacity × (1 − shadowMask)`. Lit ⇒ `shadowMask = 1` ⇒ alpha 0 ⇒ invisible.
**If the shadow map is not validly bound / not yet rendered when the catcher first composites, every
fragment reads `shadowMask = 0` ⇒ `alpha = opacity` ⇒ a solid grey plane bounded by the shadow
camera** — the founder's rectangle, exactly.

A renderer swap rebuilds the pipeline and recompiles the ShadowNode material against a freshly-bound
map — hence the permanent cure, in either direction.

### Direct link to L-231 (just landed, `068ff74d`)

The first caster fires `scheduleShadowRebuild()`. L-231 **measured** that its normal branch cleared
`_hasPipelineError = false` **synchronously before awaiting the async rebuild**, so the render gate
stayed **open for the whole rebuild** and frames kept submitting against a pipeline being torn down
and a shadow map being reallocated — **precisely the window in which the catcher reads
`shadowMask = 0`.** L-231 also found the entire shadow-freeze family was writing
`renderer.shadowMap.autoUpdate`, **inert on the WebGPU node path** (C04 §SHADOW rule 10), so the map
regenerated uncontrolled while nominally frozen.

**L-231's fix pauses WebGPU submits for the rebuild AND writes the real per-light flags — it may
already fix this grey.**

### Phases

| Phase | Work |
|---|---|
| **STEP 0** | **Founder, 1 minute: re-test on the deploy containing L-231 (`068ff74d`).** If the grey is gone, this is closed by L-231 and only the regression test remains. |
| **P1** | If it persists: the fix is an **ordering guarantee** — the catcher must not become visible until the shadow depth map has actually been rendered at least once **with the new caster**. Gate `setEnabled(true)` on *"shadow map valid"*, not merely on *"a caster exists"*. |
| **P2** | Investigate the recorded WebGPU `ShadowMaterial` transparency defect on its own terms: is `ShadowNodeMaterial` / `ShadowMaskModel` compositing correctly when the depth map is **empty**? Per C04 §SHADOW.11 the frustum test returns LIT *outside* the frustum — so an **empty/unrendered map INSIDE the frustum** is the suspect state. |
| **P3** | The caster-visibility gate is a workaround masking a real bug. Once compositing is correct, decide whether it is still needed. |
| **P4** | Tests: creating the FIRST caster in a fresh project does not produce a fully-opaque catcher; the catcher's alpha is 0 wherever lit, on the WebGPU path, **without a renderer swap**. |

**HARD NON-GOAL:** do **not** re-litigate the nine refuted L-205 hypotheses (C04 §SHADOW.3). The
caster denylist and the shadow-camera size are **not** the cause — resizing the camera only ever
changed the grey's *size*.

**Contract mapping:** C04 §SHADOW.0 + rules 7/10/11, ADR-0111, ADR-0120, L-205 lineage.

---

## L-238 — §FIX-ORPHAN-MESH-ISOLATION-BLINDSPOT  (HIGH — data integrity)

Founder: *"Project isolation is still not sound. I open an old project, go back to Projects, create a
NEW project — and the new project has an object on screen. It seems one of those corrupted triangular
shapes created in wall joints of 3 walls in an L or T shape."*

### The C13 teardown IS running — and the leak still happens, silently

His log proves the L-224 fix is live: `[ProjectLifecycleController] C13 project-switch`,
`[BatchCoordinator] C13 forceReset()`, `[WallRebuildCoordinator] C13 resetWallRebuildState()`,
`C13 teardown complete`, `[ProjectIsolationAudit] Installed — will audit every project load`.

**Yet an object leaked, and no violation was reported.** That silence is the diagnosis.

### Root cause — the id-less-mesh blind spot

`ProjectIsolationAudit.ts:126`:

```js
if (idKnown && ud.elementId != null && ud.elementType != null) {
```

**A scene node with no `elementId` is never examined.** A wall junction / mitre / corner-weld mesh —
exactly the *"corrupted triangular shape at an L or T joint"*, and the known `WallJoinResolver`
degenerate-wall artifact (the guard skips the degenerate wall, but its **mesh still renders**) —
carries **no element id**. So:

| Layer | Why it misses the shard |
|---|---|
| `ClearProjectCommand` | clears **by element id** → never sees it |
| `WallFragmentBuilder.dispose()` | fires, but only clears geometry it **owns** — an artifact parented elsewhere survives |
| `ProjectIsolationAudit` | **skips id-less nodes silently** → the tripwire reports nothing |

**An id-less mesh is invisible to the clear AND to the guard.**

### This blind spot is a consequence of the L-224 design the orchestrator approved

The skip-if-no-trackable-id rule was chosen to hold the false-positive rate at zero. The trade-off let
a real leak through. Recorded plainly. (L-233's agent independently used the same predicate for its
explode reconcile — fine for a *visual offset*, but for an **isolation guard** it is a hole.)

### C13 §3.10 already forbids this

The invariant that just landed says the audit must enumerate **OWNERS**, not symptoms: *every stateful
surface has exactly one named owner.* **A mesh in the scene with no element id has NO OWNER — it is,
by definition, the violation §3.10 exists to catch.** After a clear, the scene root must contain no
un-owned children.

### Phases

| Phase | Work |
|---|---|
| **P1** | **Close the audit hole — detect ORPHAN meshes.** Flag any renderable scene-root descendant with **no owner** (no `elementId`, and not in a positive infrastructure allowlist: catcher, grid, origin sphere, gizmo, outline, TransformControls helper). Never silently skip. **Beware the L-233 perf trap** — selection outlines and helpers are legitimately id-less, so use a positive allowlist, not a blanket skip. |
| **P2** | **Close the teardown hole.** Establish WHO owns wall junction/mitre meshes and ensure the C13 teardown disposes them. If they are parented outside `WallFragmentBuilder`, that is the bug — a geometry artifact with no owner must not exist (ADR-0120 made the same argument for the shadow caster set). |
| **P3** | **Trace the actual leaked object.** Instrument a fresh project: dump every scene-root child with its `userData` after `ClearProjectCommand` completes, and **name the shard**. Do not guess which mesh it is. |
| **P4** | **Fix the PRODUCER too.** The `WallJoinResolver` degenerate-wall bug (guard skips the wall, mesh still renders) is the likely source — an artifact that should never have been created. Cleanup alone is not enough. |
| **P5** | Tests: after `ClearProjectCommand` the scene root has **zero** renderable descendants outside the infrastructure allowlist; a junction artifact from project A is absent in project B; the audit **REPORTS** an id-less orphan mesh (it must fail loudly, not skip). |

**Contract mapping:** **C13 §3.10** (the owner-enumeration invariant — this is exactly the case it was
written for), C11, ADR-0120, the `WallJoinResolver` degenerate-wall class.

---

## L-239 — §FIX-WALL-LAYERS-PLAN-VS-3D-CREATION  (HIGH — recurrent, raised many times)

Founder: *"The user chooses a layered interior wall and creates it on plan view. The wall is created,
the correct thickness is applied — however **the layers are not present**. Whereas if the user creates
the wall in 3D, same interior wall, the wall **is** created with the correct layers. Why?"*

### The code answers it verbatim

`WallPlanToolHandler.ts:422-423`, in the header of the earlier L-41 fix:

> *"3D looked right because **the 3D builder re-resolves layers/thickness from `systemTypeId` at
> render**; PLAN view reads the **stored** thickness."*

**The layer stack is never persisted on the wall instance.** The 3D builder *derives* it from the wall
type on every render — so 3D can never be wrong. Plan reads what is actually on the wall record, and
there is no `layers` array there.

The prior fix (§FIX-PLAN-WALL-TYPE-IGNORED, L-41, `:410-430`) hit this exact wall for **thickness**,
and worked around it by resolving thickness locally (`_getSelectedWallThickness()`) and storing it
explicitly — **but nobody did the same for `layers`.** Hence the founder's precise symptom: **thickness
right, layers absent.** The thickness was patched onto the instance; the layers never were.

### This also explains L-211 — same root

`WallLayerPlanSymbolBuilder.ts:68` gates on `if (!wall.layers || wall.layers.length < 2 || wall.curve)
continue;` — it reads `layers` **from the instance**, which is empty. L-211 (layers render in 3D, not
in plan) and L-239 (plan-created wall has no layers) are the **same defect** seen from the symbol side
and the creation side.

### Contributing hazard, named in the same comment

The `systemTypeId` → thickness override (§WALL-TYPE-THICKNESS in `CreateWall.ts`) fires **only** when a
populated `WallSystemTypeStore` is wired into the *active* `wall.create` handler — and a
**"first-registration-wins" facade** means the picked `systemTypeId` reaches the store but its
thickness never resolves. Whichever handler wins registration decides whether type resolution works at
all. That is a **P1 composition-root smell**.

### Architectural class

The same **C11** violation as L-213 (floor finishes), L-214 (wardrobe), L-220 (plumbing/floor drag):
**one element type, two creation paths, a field silently dropped by one of them.**

### Phases

| Phase | Work |
|---|---|
| **P1** | **THE DECISION FIRST — do not code before answering it.** What is the SINGLE SOURCE OF TRUTH for a wall's layer stack: the systemType **catalogue**, or the wall **instance**? Both are defensible. What is **not** defensible is today's split — 3D derives from the catalogue, plan reads the instance. **(a) Catalogue canonical** (what the 3D builder already trusts) ⇒ `WallLayerPlanSymbolBuilder` and every plan/doc consumer must resolve through the systemType store, and `layers` must NOT be duplicated onto the instance. **(b) Instance canonical** ⇒ `wall.create` must persist resolved `layers` at creation **from both paths**, and the 3D builder must read the instance instead of re-deriving. Pick one, write it into C11/C03, make every consumer obey. |
| **P2** | **Converge the two `wall.create` payloads.** `WallPlanToolHandler` (`resolveActiveWallSystemTypeId()` + locally-resolved thickness) vs `WallTool` (`this.selectedSystemTypeId`, thickness overridden by the command) → **ONE payload builder**, the way L-214's `buildFurnitureCreatePayload()` did, so a dropped field is a **compile error**, not a silent visual difference. |
| **P3** | **Fix the first-registration-wins facade** so `systemTypeId` resolution does not depend on which handler registered first (**P1**). |
| **P4** | **Tests:** a layered wall created in PLAN and the same type created in 3D produce **identical stored records** AND identical layer rendering **in both views**. (This is the L-213 equality-test pattern — the guard that keeps it fixed.) |
| **P5** | **Closes L-211** as the same root. |

**Contract mapping:** **C11** (one element ⇒ one creation pipeline), C03 (store schema), **P1**
(composition root), L-41 + L-211 lineage.

---

## L-239 — FOUNDER DECISION (2026-07-12, BINDING): the INSTANCE is canonical

> *"The layers NEED to be STORED IN THE STORE — and have an architecturally sound engine strategy for
> ANY type of creation."*

So **option (b)**: `layers` is **persisted on the wall record**, and the strategy must hold for **every**
creation path — plan tool, 3D tool, batch generators, AI, import, paste — **by construction, not by
each tool remembering.**

### The seam that makes it by-construction

**Resolve `systemTypeId` → `layers` ONCE, inside the `wall.create` COMMAND HANDLER** — the chokepoint
every creation path already dispatches through — **not in the individual tools.**

That is precisely *why this bug exists*: each tool builds its own payload, so one of them forgot. Move
the resolution **below** the tools and no future tool can forget. The 3D builder then **reads the
stored `layers`** instead of re-deriving from `systemTypeId`, which collapses the two-source split at
its root.

### Revised phases

| Phase | Work |
|---|---|
| **P1** | **Schema (C03):** `layers` becomes a first-class, persisted field on the wall record. Define it properly in the Zod schema — it is domain data, not a render detail. |
| **P2** | **Resolve at the chokepoint.** The `wall.create` handler resolves `layers` (and thickness) from `systemTypeId` via the systemType store and persists them. **Every** path — plan, 3D, batch, AI, import, paste — inherits this for free. Tools stop resolving anything themselves. |
| **P3** | **3D builder reads the instance.** Stop re-deriving from `systemTypeId` at render. One source of truth, read by every consumer (3D builder, `WallLayerPlanSymbolBuilder`, IFC export, schedules). |
| **P4** | **Migration/backfill.** Existing walls have no `layers`. On load, backfill from `systemTypeId` via the catalogue — a one-way migration so old projects render correctly. Must be idempotent and must not corrupt walls whose type no longer exists (fall back safely + log). |
| **P5** | **Fix the "first-registration-wins" facade** (`WallPlanToolHandler.ts:410-430` names it): `systemTypeId` resolution must not depend on which `wall.create` handler registered first. That is a **P1 composition-root** violation and it is what makes the thickness override fire only sometimes. |
| **P6** | **Tests:** a layered wall created in PLAN and the same type created in 3D produce **identical stored records** (including `layers`) and identical rendering in **both** views. Same equality-test pattern as L-213. Plus: a batch/AI-generated wall also carries `layers`; a backfilled legacy wall renders layers in plan. |
| **P7** | **Closes L-211** (same root). |

**Why this ordering:** P2 before P3 — persist first, then switch the reader — so there is never a
window where the 3D builder reads a field that isn't populated yet.

**Contract mapping:** **C11** (one element ⇒ one creation pipeline), **C03** (schema — `layers` is
domain state), **P1** (composition root — the registration facade), L-41 + L-211 lineage.
