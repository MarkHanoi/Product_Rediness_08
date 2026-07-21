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
| **G0 the unit tests actually gate CI** | **0.5/0.6** | shipped | **🟡 CLOSED FOR THE EDITOR — AND I OVERCLAIMED IT. Corrected 2026-07-13 by the truth audit.** The editor's 1,495 tests run in CI and on pushes to `main`; red surface **34 → 0**, triaged PRODUCT-FIRST (three of five groups were the **product's** fault, incl. **L-249, a live production bug**). **BUT the CI job ran `pnpm --filter @pryzm/editor run test:ci` — THE EDITOR AND NOTHING ELSE.** The other **121 workspaces were still invisible to CI**, and the audit found a **RED test in `packages/picking` within ten minutes of looking**. **That is the L-247 disease one level up: a gate that looks green because it does not COVER.** Now broadened to the root aggregator (`pnpm run test:ci` → all **14** workspaces that declare it, incl. picking). **HONEST REMAINING LIMIT (0.5e):** `--if-present` still silently skips the ~120 workspaces with a `test` but no `test:ci`. |
| **G0-CONTRACTS every Tier-1 contract is ACTIVE** | contracts | queued (L-347) | **🔴 OPEN — NEW GATE (L-347, 2026-07-16).** Launch is blocked until every **Tier-1** contract (C05, C08, C10, C13, C48-min, C22-min) is **ACTIVE** = CANONICAL + code-matches + §6 CI gate green (status vocabulary defined in `contracts/README` C00). Today: C05 CANONICAL (L-334 shipped); **C08 NOT ACTIVE** (silent LWW — L-53/L-335); **C10 NOT ACTIVE** (benches un-wired to CI — L-341); **C13 NOT ACTIVE** (teardown G1–G7 — L-342); **C48-min / C22-min DRAFT+unimplemented** (L-344/L-345). Goes green ONLY when all six are ACTIVE. |
| **G1 no host-wall-move freeze** | **0.0** (was 0.1/0.2) | **queued (wall-rebuild agent)** | **🔴 REOPENED — CRITICAL. L-250: founder re-reported 2026-07-13 with a log + screenshot; the freeze is LIVE after three fixes (L-01, L-97, L-234). The screenshot shows the PROPERTY-PANEL `Length` edit — a path L-234 never measured. This is the #1 item on the board.** |
| G2 no heavy-load freeze/fail | 0.3 | shipped | **🟢 CLOSED (all 4 sub-items), AWAITING FOUNDER CONFIRMATION.** The board said *"in flight"* for **eleven days** — it shipped `f0b6c680`. §LOAD-TIMEOUT-PROGRESS (a **progress-reset** stall watchdog, not a fixed-30s race) + §AUTOSAVE-SUPPRESS-DURING-LOAD (load-window latch) + §CLEAR-PROJECT-BATCH + §RBL-NO-PERSIST-DEGENERATE. Guarded 9/9, and those DO run in CI. |
| G3 smooth heavy-nav | 0.4 | **partial — and DO NOT BUY THE REST YET** | **🟡 PARTIAL.** `dd9bd8df`: **0.4a shipped** (heavy-scene shadow suppression, now guarded — 8 tests), **0.4c shipped** (nav LOD). **0.4b NOT done:** element instancing for windows/columns/beams/furniture/railings **is fully built but gated behind `__pryzmElementInstancingV1`, which NOTHING IN THE REPO EVER SETS TRUE.** **0.4d NOT done** (deliberately: not a per-frame hotspot). **THE IMPORTANT PART: L-253 (§FIX-WEBGPU-INVALID-PIPELINE-MRT, `873832c5`) was very likely the TRUE root of the heavy-nav stutter all along** — every frame's submit was being **rejected** by an invalid pipeline. **RE-MEASURE G3 AFTER L-253 BEFORE BUYING 0.4b/0.4d — the remaining perf work may be unnecessary.** |
| G4 correct selection | 1.1 | shipped | **🟢 CLOSED — but its guard had been RED on `main` and NOBODY COULD SEE IT.** Fixed `27496231` §SELECT-EXACT-PIXEL-FIRST (an exact centre-pixel hit returns immediately; the neighbourhood scan runs **only** on background) — and L-04 was already marked FIXED in the audit on **2026-07-05**; the board simply never caught up. **The red test:** `PickStrategyResolver.test.ts`'s *"healthy"* fake renderer returned an **all-zero readback — exactly the broken-driver signature the real probe is built to detect** — so the resolver correctly fell back to `bvh-pick`. **Product right, FAKE stale.** Fixed + the missing `zero-readback` case added. **52/52 green**, and `packages/picking` now runs in CI at all (see G0). |
| G5 smooth draw preview | 1.2 | shipped | **🟢 FIXED (thinly guarded).** `c5a908e3` §FIX-WALLPREVIEW-RENDER-REQUEST + §DEFER-TIER-DURING-DRAW (ADR-0101): the stall was a **mid-draw quality-tier escalation rebuilding the WebGPU pipeline**; the tier is now deferred behind a balanced latch while a tool is drawing. 1.2a ✅ 1.2b ✅ — **1.2c only indirectly** (TRAA is suppressed *because* the escalation is deferred; there is no explicit "TRAA off during transient preview" if the scene is **already** cinematic — answer that explicitly). The latch is guarded (10 tests) but **the load-bearing wiring — WallTool opening/closing the latch — is not**; `packages/geometry-wall` is contested by the wall agents right now. |
| G6 no rotate ghosting | 1.3 | shipped | **🟡 FIXED, AWAITING FOUNDER CONFIRMATION.** Root cause proven: the WebGL2 renderer is **shared**, and a borrower (the GPU picker — every hover) redirects it to an offscreen target; when the inner `render()` **throws** (it does: `GL_INVALID_OPERATION: Mismatch between texture format and sampler type`) the restore never runs and the renderer stays **permanently bound** to the pick buffer. Every later frame paints offscreen while the canvas shows its last image — **that is the ghost**. It also **silently defeated the existing fix**, because `clear()` clears the *bound* framebuffer, so the ghost-clear was wiping the pick target, not the canvas. Fixed in 3 places (frame-owner assert + unbind-before-clear + `try/finally` on the leaking borrower). §FIX-WEBGL2-GHOST-STALE-TARGET. |
| G7 move+rotate+material all elements | 2.1/2.2 | **rotate SHIPPED (`4b05c8d4`)** | **🟡 ROTATE SHIPPED — and the mechanism was worse than 'not implemented'. THE BUTTON WAS LYING.** In `ContextualEditBar`, `move`/`align`/`copy` all route through the **view-context router**, so they act on whichever surface is active. **`rotate` alone jumped straight to `transformControls.setMode('rotate')` — the 3-D gizmo, attached to the 3-D canvas, INERT while a plan surface is up.** So the Rotate button and the `R` key were **present, enabled, capability-gated ON… and silently did nothing.** It was not missing. **It was lying.** And it was never a furniture bug: **the plan view had no rotate at all, for ANY element.** **The fix refuses to fork:** `RotatePlanToolHandler` does not re-implement rotation — it calls `elementYawRotate`, which emits **the exact same command, with the exact same payload, that the 3-D gizmo already dispatches on drag-end**. One definition of 'rotate about world-Y', two surfaces. A furniture-only plan rotate would have been **instance EIGHT** of the signature disease. 23 parity tests green. **Still open under G7: MOVE and MATERIAL across all element types** (material currently dispatches only through the Property Inspector). The founder asked why a wardrobe placed in PLAN can't be rotated. PRE-placement rotation *is* shipped (Spacebar, ADR-0105) — but **POST-placement rotation does not exist in plan view for ANY element: the PLAN VIEW HAS NO TRANSFORM GIZMO.** Not a furniture bug. Agent is under a hard rule: **do NOT build a wardrobe-specific rotate** — that would be instance EIGHT of the seven-times-repeated 'two paths, one drops what the other resolves' disease. Plan must dispatch through the SAME commands as 3D (P6), reusing the existing scalar yaw (C11 §7.0). First deliverable: the REAL move/rotate/material matrix (3D vs PLAN, per element type). |
| G8 view creation/management | 3.1 | shipped | **🟢 VERIFIED + HOLE CLOSED.** Deleting a view could **orphan** its dependent state (templates, crop, per-view camera, visibility intents) — new `ViewDeletionCascade` makes teardown total. create/rename/delete pinned through the **command bus** as ONE undo entry each (P6). Also guards the L-252 hazard: a persisted view must restore its **own** stored detail level, not be clobbered by the new `'fine'` default. |
| G9 annotations+dimensions | 3.2 | **in flight (annotations agent)** | **OPEN — the biggest cluster on the board: L-256 (dimension conformance — the founder RE-RAISED it with acceptance criteria: *selectable as easily as a door; panel shows its properties*), L-268 (auto-dim covers only ONE of TWO buildings — a MISSING CONCEPT: the documentation layer has no notion of a BUILDING), L-263 (elevation auto-dim), L-265 (auto-tag). Order is mandatory: **RECORD → PICK → PANEL**, then multi-building, then volume. **Soundness before volume — an auto-TAG executor that mass-produces a non-conformant annotation merely multiplies the problem.** |
| G10 undo/redo at scale | 4.3 | shipped | **🟢 VERIFIED + GUARDED.** Four invariants pinned at scale (C03 §4.5–4.8): one gesture = ONE undo entry · a batch undoes **atomically** · undo→redo is a **fixed point** · undo restores the **neighbour walls** the join resolver re-trimmed on create. Asserted with **counts, never wall-clock** — a gate that reds when the CI box is busy is a gate everyone learns to ignore. |

**Current fleet (6/6):** Q2 nav-perf · Q3 load · house-circ · Q8 wall-preview · Q4 selection · Q6 edit-storm.
As each lands (merge→gate→push) the freed slot takes the next queued gate item (G6 → G7 → G8/G9).

---

## Reported-item → phase mapping (L-11 … L-37)

| L-id | Phase | Status |
|---|---|---|
| **L-398 Zoning Rules Engine + BuildableEnvelope solver** | **Pipeline A — compliance-authoring (B0/B1) — C58-ZONING-RULES-ENGINE (NEW/unauthored)** | **OPEN — P1. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track (different subsystems: geo/site/new-packages vs persistence/collab/security). CONTRACTS-FIRST: author C57 + C58 + SPEC-COMPLIANCE-REPORT + ADR before the engine code — that governance work is L-403, promoted to the FIRST step of the compliance sequence (IN PROGRESS). UNASSIGNED/TBD.** Pure L2 `ZoningRulesEngine`: parcel ⊖ setbacks (Turf negative buffer) → inset polygon + `area×maxHeight` volume, two-fidelity (`structured` / `estimated-ruleset` / `none`) resolution → `site.updateZoning`. The core compliance value prop, ~0% built today — no `ZoningRulesEngine`/`computeBuildableEnvelope`/`BuildableEnvelope`/`JurisdictionZoningContract` in the tree, Turf not yet a dep. C58 unauthored (C00 index ends at C56); ties C19 §1.4/§1.6. Source: `docs/04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md` §7. |
| **L-399 ZoningProvider adapters + curated rule packs (DK Plandata + ES-Catalonia MUC)** | **Pipeline A — compliance-authoring (B1/B4) — C58 (NEW/unauthored)** | **OPEN — P1. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track. UNASSIGNED/TBD.** `DkZoningProvider` (Plandata.dk anonymous WFS structured fields) + `MucZoningProvider` (Catalonia MUC zone class) + curated `JurisdictionZoningContract` packs (`da-*`, `es-barcelona`) filling the PDF-trapped numbers; mirror `rules/programRules.ts`. No `ZoningProvider` implementation exists outside the interface stub. Ref L-383 (DK reference). Source: audit §7. |
| **L-400 Parcel Data Layer completion — lift to L2 `@pryzm/site-parcel-data` + DK/CH adapters** | **Pipeline A — compliance-authoring (B0) — C57-PARCEL-DATA-LAYER (NEW/unauthored)** | **OPEN — P2. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track. Datafordeler API key registered by founder, held as a Fly secret (to be wired here + L-399 — no key value in docs). UNASSIGNED/TBD.** Lift the shipped keyless Catastro P0 to an L2 `@pryzm/site-parcel-data` package; add `DkParcelProvider` (Matriklen via server-side Datafordeler service-user key) + `OerebParcelProvider` (CH EGRID-keyed); per-field provenance per L-373. C57 unauthored; ties C12/C19. Source: audit §7. |
| **L-401 Envelope → authoring constraint bridge** | **Pipeline A — compliance-authoring (B2) — C19 §1.6, C50, C53 (slider-as-intent, no parallel knob)** | **OPEN — P1. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track. UNASSIGNED/TBD.** Thread the inset polygon + maxHeight (+ permitted-use → typology brief) into `generateResidentialFromBoundary` / apartment / house / typology-pipeline as generation bounds. Today generators read `getParcelBoundary()` only — no setback inset or height cap — so compliance and authoring are disconnected; this bridge IS the competitive thesis. Preserve C53 slider-as-intent. Source: audit §7. |
| **L-402 Compliance "explain-why" report + 3D envelope render** | **Pipeline A — compliance-authoring (B3) — SPEC-COMPLIANCE-REPORT (NEW/unauthored), C23, C04/C18** | **OPEN — P1. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track. UNASSIGNED/TBD.** The Archistar-parity deliverable: envelope + rule refs + ordinance links + confidence chips; translucent max-height 3D volume render (P2-safe, existing renderer, brand `#6600FF`); CI fidelity-label gate so `estimated-ruleset` is never shown authoritative. No report artefact exists for zoning today. Ref L-373. Source: audit §7. |
| **L-403 Governance authoring — C57 + C58 + SPEC-PARCEL-SELECTION + SPEC-COMPLIANCE-REPORT + strategy ADR + VISION wedge** | **Pipeline A — compliance-authoring (B0) — governance** | **IN PROGRESS — P2. Pipeline A — compliance-authoring (September pillar); PROMOTED to the FIRST step of the compliance track (contracts before code); runs IN PARALLEL with the P0 launch-blocker track. Datafordeler API key registered by founder, held as a Fly secret (to be wired with L-399/L-400 — no key value in docs).** Author C57-PARCEL-DATA-LAYER + C58-ZONING-RULES-ENGINE (incl. `JurisdictionZoningContract`) + SPEC-PARCEL-SELECTION + SPEC-COMPLIANCE-REPORT + a strategy ADR (ADR-02XX) + a VISION amendment elevating site-feasibility to a named wedge; reserve C00 index numbers; record the CF-1/CF-2 founder decisions. Source: audit §4/§7. |
| **L-404 Denmark demo-fidelity bring-up (executes L-383a–e)** | **Pipeline A — compliance-authoring (B5) — extends L-383; C12-CONTEXT-ENGINE (NEW gap), C55** | **OPEN — P2. Pipeline A — compliance-authoring (September pillar); runs IN PARALLEL with the P0 launch-blocker track. UNASSIGNED/TBD.** Offline-bake LOD2 3D-Tiles ("Danmark i 3D") + DHM quantized-mesh terrain; DK Matriklen keyed parcel; flagship parcel → envelope → LOD2 + terrain demo in one Cesium view. Native binaries (GDAL/citygml-tools/cesium-terrain-builder/tyler) offline only — Fly app image stays pure Node (L-383e). Source: audit §7. |
| **L-387 93 open dependency advisories (7 critical / 28 high, runtime-reachable)** | **security gate — infra/security (C07/C29)** | **OPEN — CRITICAL/P1. UNASSIGNED/TBD.** `pnpm audit` (npm audit ENOLOCK in this pnpm repo) reports 93 open advisories; the launch risk is the runtime-reachable ones — jsPDF (LFI + injection + DoS, used in PDF export), Multer/ws/form-data/protobufjs DoS on the server — none fixed. Triage runtime-reachable first (jsPDF, Multer, ws, form-data, protobufjs) → upgrade those. Raw output: `reports/.pnpm-audit.txt`. |
| **L-391 CRDT collab is undeployed — prod is silent socket.io last-write-wins** | **collab gate — collaboration/infra (C08 §3.1/§3.3)** | **OPEN — P0/HIGH. UNASSIGNED/TBD.** Real-time CRDT has NO network backend: `apps/sync-server` is undeployed and no `WebsocketProvider` is ever constructed, so the Yjs doc + `CRDTConflictResolver` never see remote ops; production collab is socket.io command-rebroadcast applied in arrival order = silent last-write-wins for move/edit/delete. Plan: `docs/04-reference/L-391-CRDT-COLLAB-PLAN.md`. **Phase 0 (flagged wiring) SHIPPED behind `VITE_COLLAB_CRDT` (default-off); Phases 1-3 (deploy + auth + authority + durability; ratifications R-A..R-E) OPEN.** HUMAN DECISION (the September launch call): deploy sync-server + WebsocketProvider + harden CRDT, OR descope multi-user real-time for V1 and remove the conflict-UI claim. |
| **L-393 zero verified IFC/DXF/Rhino round-trip** | **interop gate — interop (C05, C47)** | **OPEN — P1/HIGH. UNASSIGNED/TBD.** No IFC/DXF/Rhino round-trip (import→export→re-import compare) test — geometry fidelity for the load-bearing BIM formats is ASSUMED; only BCF + family/chunk formats have round-trip coverage. Adversarial malformed-file behaviour (crash vs silent drop vs graceful reject) is also UNVERIFIED. Add an IFC round-trip fixture test first, then DXF (`packages/file-format/__tests__`). |
| **L-396 free plan = 0 server-persisted versions (data-loss trap)** | **data-integrity gate — durability/infra (C48)** | **OPEN — CRITICAL/P1. UNASSIGNED/TBD.** End-to-end backup RESTORE has never been drilled, and free-plan projects live ONLY in one browser's IndexedDB (`VERSION_LIMITS.free=0`, `server.js:3258`) → a free-plan user clearing browser data = total project loss, no proven restore path. `DR-DRILL-RUNBOOK.md:340` does not claim a real production drill has run; PITR "not yet wired" (:342). Run a real pg_dump→restore→verify drill; decide free-plan server-version policy. |
| **L-397 pricing contradiction: docs $25/£15/$35/$100 vs code $59/$149/$349 (FOUNDER DECISION)** | **billing/GTM — pre-marketing launch gate (C39-PRICING-AND-PLAN-TIERS)** | **OPEN — MEDIUM. Do NOT auto-resolve — one authoritative source of truth needed before any marketing/pricing page ships.** Marketing/strategy docs advertise Solo $25 / Studio £15/seat / Mid-firm $35/seat / Enterprise $100/seat (`docs/01-strategy/STR-02-product-vision.md:305-311`, `docs/01-strategy/STR-08-go-to-market.md:204-209`); the billing CODE charges architect $59 / studio $149 / firm $349 (`packages/core-app-model/src/monetization/PlanConfig.ts:178/186/194`, `monthlyUSD`) — the code is what would actually bill. C39 is the canonical pricing contract but lists NEITHER price set and uses a THIRD tier taxonomy (`solo/studio/mid-firm/enterprise`), and its §444 "there is no free tier" contradicts the code's `free` plan. Reconcile code + marketing to C39, or supersede C39 by ADR. Source: `reports/PRYZM-STRATEGY-BRIEFING-2026-07-17.md`. |
| **L-406 `/api/event-log` unauthenticated mutating write** | **security gate — security (C08 auth+roles; C07)** | **OPEN — P1. UNASSIGNED/TBD. Most serious of the six pre-launch-evidence uncaptured findings.** `server.js:3970` mounts a persisted event-log WRITE route outside `authMiddleware`; cross-tenant write is UNVERIFIED. Confirm the write's tenant scope, add `authMiddleware` (or document why authless is safe), add a test. Source: `reports/PRE-LAUNCH-EVIDENCE-2026-07-17.md` §B5. |
| **L-407 ~781 innerHTML/dangerouslySetInnerHTML/eval/new Function XSS sinks** | **security gate — XSS (C08/C07)** | **OPEN — P2, UNVERIFIED. UNASSIGNED/TBD.** ~781 sink occurrences across `apps/*`/`src/*`/`packages/*`; mostly static/escaped but a minority interpolate values — UGC marketplace family names/descriptions are highest-risk and need a focused XSS pass. Scope the interpolating sinks, enforce escaping, add a CI sink-scan. Source: `PRE-LAUNCH-EVIDENCE-2026-07-17.md` §A4. |
| **L-408 client bundle-size / first-paint budget never CI-gated** | **perf gate — perf (C10)** | **OPEN — P2. UNASSIGNED/TBD.** `main` 2.45 MB + `engineLauncher` 3.23 MB eager (uncompressed); gzip never gate-measured (`bundle-size.json` is a 0.31 KB schema-manifest proxy, not the real shell); `RoomAutoOrganiser.ts` static+dynamic import defeats a code-split. Add a real gzipped app-shell CI budget. Source: `PRE-LAUNCH-EVIDENCE-2026-07-17.md` §A6. |
| **L-409 browser/device matrix effectively one Windows box** | **QA/perf gate — device coverage (C44/C45 DRAFT)** | **OPEN — P2/GAP, UNVERIFIED. UNASSIGNED/TBD.** Playwright covers desktop chromium/firefox/webkit only (no mobile/tablet device projects); real GPU verification is one Windows box (WebGPU device-loses on real hardware — L-361/366/372); no `isMobile`/touch gating → tablet/mobile likely unsupported. Define + run a real device/GPU matrix; decide mobile/tablet scope. Source: `PRE-LAUNCH-EVIDENCE-2026-07-17.md` §B8. |
| **L-410 §SERVER-PG-DEGRADE non-durable-write window** | **durability gate — infra/persistence (C05/C48)** | **OPEN — P2. UNASSIGNED/TBD.** `server/pgClient.js:251-278` fails OPEN to a volatile in-memory project store during a DB blip → writes accepted during degrade vanish on restart. Decide the degrade-mode write policy (reject vs volatile-accept), surface a degrade banner, reconcile on recovery. Source: `PRE-LAUNCH-EVIDENCE-2026-07-17.md` §B7. |
| **L-411 no durable per-user audit trail** | **compliance/infra gate — audit (C23/C08 §8)** | **OPEN — P2. UNASSIGNED/TBD.** Command log keeps `user_id` but is purged after 24h (`server.js:578-596`); `TemporalGraph` keys on `sessionId` not a stable userId → durable per-element edit attribution is partial (version rows' `created_by` at :3434 is coarse). Decide a durable audit-trail policy (retention + stable userId) — ties GDPR/DSAR L-345 + the compliance pillar. Source: `PRE-LAUNCH-EVIDENCE-2026-07-17.md` §B5. |
| **L-261 wall POCHE fill in plan (by view intent)** | **3.2 drawing (C09/P7)** | **OPEN - HIGH.** A cut wall must be **FILLED**, not outlined - that is what makes a plan legible. **(i)** plain wall = ONE light-grey fill; **(ii)** layered wall = **grey-scale fill PER LAYER** (construction build-up). **The fill is INTENT (P7/C09), not a hardcoded material** - it resolves through the same intent -> pen/graphics -> layer chain as the lineweight, so a view can override it and a template can carry it. **Ground has just moved: L-246 gave `A-WALL:cut` a real closed region to fill (it was ALWAYS EMPTY before - that is why `_renderPocheFills` never produced a fill), and L-257 stopped layered walls landing on layer "0".** Verify the current deploy before coding. Do WITH L-260(C) - same intent chain. |
| **L-265 AUTO-TAG batch executor (doors / windows / walls, plan + elevation)** | **3.2 annotations (Gate G9)** | **🟢 SHIPPED (`57347a18`, `0116ca81`) — GENERALISED, NOT FORKED.** `TagReconciler` extracts the four decisions (create · refresh · duplicate · orphan) **pure and parameterised by category**; `RoomTagAutoPopulator` is now its **first consumer**, auto-tag its second. It reads **both** target keys, so it **adopts hand-placed tags instead of duplicating them**. ONE view-aware pill ("Auto-tag view"), plan **and** elevation. `commitAnnotationSet` grew `removals`, so a reconciliation (creations **and** deletions) is **one undo entry**. 34 engine + 4 canvas + 17 end-to-end tests. **THREE REFUTATIONS OF MY BRIEF, AND TWO OF THEM WOULD HAVE SHIPPED A BROKEN FEATURE:** **(i)** I said the mark was `ElementCode`. **It is not** — `ElementCode` mints a *different*, dash-free id; the mark is `MarkGenerator`'s `element.mark`, **and the door/window SCHEDULE JOINS ON `element.mark`**. Had it obeyed me, **every tag would have failed to join its schedule (C28)** — a perfect-looking, useless tag. **(ii)** **The tag RENDER half did not exist**: every tag renderer hardcoded the **plan** projection (`w2s(pt.x, pt.z)`), so **elevation tags could never have appeared, however perfectly created**. **(iii)** An elevation legitimately tags walls from **multiple levels** on one façade. |
| _(superseded)_ | | **OPEN.** A button beside auto-dimension that tags doors, windows and walls — the tag is what makes a drawing **schedulable** (it is the join between the drawing and the schedule, C28). **BOTH HALVES ALREADY EXIST — FOR ROOMS ONLY:** `RoomTagAutoPopulator` already auto-tags rooms per view/level, **idempotently, with duplicate + orphan cleanup** (his log: *8 room-tag(s) created, 3 orphan(s) removed*) — the hard lifecycle problem is SOLVED for one element type; and `ElementCode` auto-assignment already produces the marks (`WA-00-001`). **So the work is to GENERALISE the tag populator from rooms → doors/windows/walls and from plan → elevation. Anyone who writes a second tag engine has misunderstood the ticket.** **FOURTH SIGHTING TODAY OF ONE DISEASE** (L-262 LOD plan-only · L-263 auto-dimension plan-only · L-264 solidity/poché plan-only · L-265 tagging one-element/one-view): **PRYZM's documentation layer is built PLAN-FIRST and ONE-ELEMENT-AT-A-TIME, then never carried across.** Sequence AFTER **L-256** — mass-producing a non-conformant annotation just multiplies the problem. |
| **L-273 legacy inline underlay rasters still filling localStorage** | **0.x persistence — MEDIUM** | **OPEN — follow-up of L-269, which the agent correctly REFUSED to close silently.** L-269 made the app **fail loudly and NAME the hog**; it did not empty the store. The suspect is `pryzm.floorPlanUnderlay.v2.*` — multi-MB inline rasters owned by **`UnderlayPersistence`**, which migrates them to IndexedDB **only when the project is REOPENED**. A project the user never reopens keeps its raster in localStorage forever. **`ProjectRepository` must not delete another module's keys (C13 single-writer) — an agent that reached across the boundary to "just clear it" would have been taking a shortcut, and it refused. That refusal is the architecture working.** **DO NOT GUESS THE HOG — READ IT:** `StorageQuotaDiagnostics` now prints the ranking at the moment of failure. Get that output first. **Measure, then fix.** |
| **L-287 dimensions must be ASSOCIATIVE** | **3.2 annotations** | **🟢 SHIPPED (`6486dbad`) — AND IT WAS ALREADY BROKEN IN PRODUCTION, BEFORE ANYONE DRAGGED ANYTHING.** The pure engine plans proper element-anchored references; **the EXECUTOR threw them away**, evaluating them to world points and emitting point-refs with the position **baked into a cache** — and point refs were **explicitly excluded from orphan detection**. **Move a wall today and the dimension kept its old position and its old number.** A lie a builder would build from. **Fixed producer → drag → record-split.** The drag now goes through `UpdateAnnotationPresentationCommand`, which takes only `{offset, screenOverride, symbolPoint}` — **there is no field through which a drag can reach a reference.** Structural, not a comment. **A THIRD defect found on the way:** `resolveHostedOpeningPoint` read the store's `offset` as the opening **CENTRE**, when project-wide it is the **LEFT EDGE**. Every opening anchor would have landed **half a width off** the moment references went live — **invisible only because nothing had ever resolved an opening reference before.** **ADR-0121** records both calls: baked auto-dims are **regenerated on load, never reverse-engineered**; a model-driven reconcile is a **re-derivation** (`suppressUndo`), while a user-requested batch stays one-batch-one-undo. || **L-286 'SET OUT' — LIVE, self-maintaining documentation views** | **3.2 documentation — STRATEGIC (demo)** | **OPEN — STRATEGIC.** *"A Set Out view is a self-maintaining documentation view... the user should never think about regenerating tags or dimensions. This should become one of PRYZM's DEFINING FEATURES."* Add a door → tagged + dimensioned. Delete a window → tag vanishes, chain re-closes. Change elevation depth or crop → newly visible elements gain annotation, departing ones lose it. **No 'Update Documentation' command may ever exist.** **THE KEY FINDING — THIS IS NOT A NEW ENGINE, IT IS A BINDING OF THREE THINGS WE ALREADY HAVE:** **(1)** `ViewDependencyTracker` already watches the bus, computes which views a change dirties, and flushes them — **that IS his `detectChange()`, and it is shipped** (it's in every log he sends). **(2)** `RoomTagAutoPopulator` already reconciles idempotently — create / refresh / dedupe / **remove orphans** — which IS his synchronisation rule (*exactly one tag per visible element, no duplicates, no orphans*), **already solved for one element type**; **L-265 is generalising exactly that reconciler right now.** **(3)** `commitAnnotationSet` already commits creations **and** deletions as ONE undo entry. **So 'Set Out' = a view intent that turns the categories on and subscribes the reconcilers to the tracker's flush. That is why it is achievable.** **THE ONE DECISION HE HASN'T MADE, AND IT DECIDES USABLE vs UNBEARABLE: WHAT DOES CTRL-Z DO?** If each edit spawns its own annotation-reconcile undo entry, **moving one wall costs two undos** and Ctrl-Z becomes a lottery. Either the reconcile **rides the same undo entry as the edit**, or it is **excluded from undo and re-derived** (the drawing is a pure function of the model). **Needs an ADR before a line of binding code.** **Also: idempotence is the whole correctness argument** — if the reconciler is idempotent, *'live'* collapses to *'run it on every flush'*. And **visibility is the input, not the model**: his crop/depth examples break any implementation that reconciles against the LEVEL rather than against **what the view actually shows**. |
| **L-293 the WORKER render path holds a SECOND pen authority — intent never reaches it** | **3.2 drawing (Contract-23 §7.1) — HIGH** | **OPEN — HIGH. Found by the drawing agent while fixing L-290, and it REFUSED to smuggle the fix into that ticket.** The worker pipeline resolves pens through **its own mini rules engine**, not `graphicsRulesEngine.resolveStyle()` — so **L-285's wall-FUNCTION axis never reaches it**. **And it goes further than that axis:** the worker has **no `ViewDefinition`**, so it **structurally cannot know view intent at all** — not detail level, not occlusion disposition, not beyond-line style, not per-element overrides. **Anything built on the intent chain is invisible to that path by construction.** **THIRD SIGHTING THIS WEEK OF THE SAME SHAPE** — L-275 (ISO layer resolved from a case-sensitive type *name*), L-280 (symbol renderer bypassing the pen table), L-293 (a second pen authority in the worker): **a decision taken somewhere the intent chain cannot see.** **Fix: send the RESOLVED STYLE to the worker and keep ONE rules engine — a second style authority drifts, and this codebase has paid for that repeatedly.** Guard by asserting the two paths produce a **byte-identical** pen. |
| **L-294 the ENTIRE view-output panel was a silent no-op** | **3.2 view intent (Gate G7) — CRITICAL** | **FIXED `4c395c4b`.** Detail Level, Scale, Visual Style, Display Model and Shadows **all did nothing.** The panel fired `view.setOutput`; **nothing in the editor handles it.** It fell through to a handler whose `canExecute` probes `ViewRegistry` — **a store the real ViewDefinitions are never written into** — so the bus rejected every dispatch and **a bare `.catch(() => {})` ate it.** **The material bug (L-283) in a second organ.** And **it is why the founder's saved views are stuck on `medium`: he could not have fixed it by hand — the dropdown was dead.** **Every test was green, for the reason that makes this class lethal: they all assert at `resolveEffectiveDetailLevel()` — a seam BELOW the break.** See **LESSON L-M**. **Root hole still open:** `view.setOutput` is a live command type with no reachable handler — bridge it or delete it. |
| **L-295 V/G cannot switch off a door or window symbol — two spellings of one layer** | **3.2 view intent — HIGH, DEMO-VISIBLE** | **OPEN — HIGH.** The applicator probes `A-DOOR:cut`; the symbol builders emit `A-DOOR-CUT`. **They never meet — and door and window are the only two families that HAVE symbols.** Plus the applicator **never touches the `:hidden` zone.** **The demo IS the view intent** — if he switches the door category off and the door stays on the drawing, the feature being demonstrated visibly does not work. **Fix it with ONE canonical zone-layer authority, not a second probe** — L-275 already refused exactly that alias reflex. **Third shape, fourth sighting: a decision taken where the intent chain cannot see it.** |
| **L-292 SWIMMING POOL — a new element family** | **New family (post-demo)** | **OPEN — FEATURE.** *"The user defines it ON A SLAB — like the hole-on-slab element — and a hole is created; walls under the level 1.2 m high; a slab at the bottom within the walls; and a new element looking like WATER, transparent blueish."* **THE FINDING THAT DECIDES THE DESIGN — THREE OF THE FOUR PARTS ALREADY EXIST. ONLY THE WATER IS NEW.** **The hole is shipped**: `SlabData.holes` + `openingStore`, and `SlabFragmentBuilder` already caps the void (*"a wall is generated along each hole edge so the void is fully enclosed"*) — **this is the exact mechanism the STAIR already uses to carve its own void through a floor plate.** **The pool walls are walls** (a negative `baseOffset`, which the record already carries). **The pool floor is a slab.** **So a pool is an ASSEMBLY, not a primitive** — one gesture composing four elements. Same shape as the curtain wall (panels + mullions) and the stair (flights + railings): **follow whichever the contracts have made canonical; do not invent a fifth pattern.** **The one real design decision:** is WATER (a) its own element family with a record — level, volume, and therefore **schedulable (C28)** — or (b) a slab with a blue material? **(b) is the shortcut that gets regretted the moment anyone asks for the pool's volume.** **And the invariant that makes it a product rather than a demo: ONE gesture = ONE undo entry.** Creating a pool creates four elements; **Ctrl-Z must remove the pool, not one wall of it** — and deleting it must heal the slab hole. |
| **L-291 tags must SCALE with the view, and be SELECTABLE/EDITABLE** | **3.2 annotations (Gate G9) — HIGH** | **OPEN — HIGH.** *"The tags are great — but can they scale like the dimensions? Also the tags should be selectable and editable, like an annotation element."* His screenshot shows the bubbles are **the size of a room** — a *Timber Casement* bubble is wider than the window it names. **They are sized in WORLD METRES, not PAPER MILLIMETRES.** **PART A — the C24 paper-space rule, which the DIMENSIONS ALREADY OBEY.** A tag bubble is *N mm on the SHEET* at any scale. `packages/auto-dimension` already does this — L-281's tier gap is a **paper constant scaled by the view** (`tierGapWorldM`), no world literals. **The tag renderer must reuse that exact mechanism. It is not a new idea; it is an existing one that tags never got.** And the text must scale with the **view's scale**, never with **zoom** — get that wrong and the tag grows as you zoom out. **PART B — the machinery exists and tags are already half-wired.** L-287 split every annotation into *what it measures* (references, immutable by drag) and *how it is shown* (presentation, movable) — **and already implemented the tag drag: the bubble moves, the leader anchor stays on the element.** What is missing is the **PICK corridor** (bubble **and** hairline leader) and the **panel**. **RECORD → PICK → PANEL, in that order.** **And one decision to make deliberately:** editing a tag's text either edits the **element's MARK — which is the SCHEDULE JOIN (C28)** — or is a pure display override. **Those are different products.** Settle it in the ADR beside ADR-0266's DRIVE-vs-OVERRIDE call for dimensions; the two must not contradict. |
| **L-290 BEYOND draws DASHED in elevation + section (plan stays solid)** | **3.2 drawing (C09/Contract-23) — HIGH** | **OPEN — HIGH. DECIDED by the founder via an explicit question**, because his instruction contradicted his own normative spec. **Chosen: dashed by default in ELEVATION/SECTION only; PLAN keeps BEYOND solid + lighter.** **This does NOT re-open L-277.** The bug there was **dashing by DISTANCE** — far-but-visible geometry dashed because occlusion and depth shared one bucket. That stays fixed. This is the **override clause his own spec already contained** (*"never dashed **unless explicitly overridden by the user**"*), expressed as **per-view-type INTENT, not a code branch**. **THE TRAP, ALREADY MEASURED BY THE L-285 AGENT: `BEYOND` and `HIDDEN` SHARE A BASE WIDTH (0.09 mm) — they currently differ by DASH, not by WEIGHT.** So the instant BEYOND dashes in elevation/section, **BEYOND and HIDDEN become indistinguishable in exactly the views he asked for** — a stair's lower run would read identically to a pipe behind a wall. **Separate them FIRST** (dash pattern and/or weight — his spec: BEYOND *lighter than CUT*, HIDDEN *thin*), then dash. **A naive `dash = true` on beyond would ship a drawing that gained a dash and lost a distinction.** |
| **L-288 the 1-px hairline floor FLATTENS the whole pen hierarchy at dpr 1** | **3.2 drawing — HIGH** | **OPEN — HIGH.** At `devicePixelRatio = 1` the canvas floors every stroke at **1 px**, clamping **every pen below ~0.265 mm**: wall PROJECTION (0.25), door PROJECTION (0.18), ceiling PROJECTION (0.13) — **all render identically.** **This pre-dates the function axis and swallows the WHOLE ladder.** L-277 built the zone hierarchy, L-285 added FUNCTION — and **on a 1× display a user sees none of the projection-side distinctions.** Visible at dpr ≥ 2 and **correct in export** (2.95 px vs 2.07 px at `EXPORT_DPI`). **So the drawing is right and the SCREEN is lying** — the worst place for it to lie, because that is where the founder judges it. **A demo on a 1× projector would show none of the line hierarchy we just spent a day building.** **Do NOT inflate the pen table** — that corrupts the export. The invariant: **strict ordering must survive on screen at dpr 1**, asserted in **device pixels**. |
| **L-289 the window symbol bridges its frame CUT lines ACROSS the glazing** | **3.2 hosted elements — HIGH** | **OPEN — HIGH. SPECIFIED (C09 §4.6.4c), NOT YET APPLIED.** The REAL cause of *"the frame in plan view is much thicker than in reality"* — **and both earlier diagnoses were wrong.** The band was measured **dimensionally exact**; a PEN cause was then proposed and **refuted** (`symbolicRuleForLayer()` returns `null` for any `:cut` layer, so the window's cut frame never enters the symbolic path and gets the full 0.35 mm CUT pen — **the hierarchy was reaching the screen all along**). **The actual cause is a drawing CONVENTION:** the builder closes the symbol into a rectangle by running the frame's wall-face CUT lines **across the glazing**. **A heavy CUT line drawn across the glass asserts a solid that is not there** — so the window reads as a full-thickness slab instead of `frame | glazing | frame`. **And the bridge buys nothing**: the jamb seam is already sealed by the host wall's void-edge clip. |
| **L-285 interior/exterior pen weights + L-280 window frame** | **3.2 drawing (Contract-23)** | **🟢 SHIPPED (`94e4ab8f`) — TWO TICKETS, ONE BUG: both died at the last mile, where the line is actually painted.** **THE BYPASS:** `PlanViewCanvas` resolved a pen through the full Contract-23 chain and then, **for door and window symbols only, THREW IT AWAY** — hard-coding the state to `'projection'` and stroking a raw `appearance.line.weight`. **Two things died there.** **(1) THE ZONE:** what reached the symbolic path included `A-DOOR-HIDDEN` / `A-GLAZ-HIDDEN` — the layers `applyOcclusion()` **demotes** onto — so **an OCCLUDED door frame was painted SOLID, at PROJECTION weight.** L-277 named the `hidden` zone, produced it, and gave it a dashed pen; this **flattened all three zones back to `projection` for the only two element types that HAVE symbols. The zone ladder, undone at the last mile.** **(2) THE RULE CHAIN:** it called the **intent tier alone**, skipping VIEW and ELEMENT — so **per-element pen overrides and the V/G weight factor reached every line in the drawing EXCEPT door and window symbols.** **That is why the window frame read fat — and why the function weights would have vanished if we had built them first.** The pen now has its **third axis** (zone × category × **FUNCTION**), the zone ladder stays strict (an interior CUT wall is still heavier than ANY projection line), and the weight is proven to reach the canvas. || **L-283 elevation auto-dim is VERTICAL-ONLY — every horizontal dimension is missing** | **3.2 annotations (Gate G9) — HIGH** | **OPEN — HIGH.** *"The autodim elevation is working, but we are missing ALL the horizontal dims."* The vertical chains land correctly (sill 1000, opening 1200, floor-to-floor 2800); **not one horizontal dimension exists** — no window widths, no spacing, no façade length. **This is not a bug — it is the OTHER HALF of L-263, and it was never built.** The rule set that got written was the genuinely new one (the VERTICAL measurements an elevation needs and a plan does not). **The horizontal axis was left implicit, and 'implicit' means absent.** An elevation dimension set is **TWO chains**: vertical (have) and horizontal (don't). **And it is NOT the plan chain rotated** — it measures **along the FAÇADE PLANE**: opening widths, inter-opening spacing, distance to the façade ends, overall façade length outermost. **L-281's tier rule applies to both axes** — land that first and this inherits it. |
| **L-284 door symbol: handle + leaf alignment** | **3.2 hosted elements** | **🟢 SHIPPED (`6c612ab4`) — BOTH DEFECTS WERE REAL, AND THE SECOND WAS WORSE THAN IT LOOKED.** The hinge was `centre ± dir·clearHalf` — **on the wall CENTRELINE, with no across-wall component at all** — so **the arc's centre sat half a wall thickness INSIDE the wall**. Every swing arc, and every clearance read off the drawing, was wrong. `_hingeAtWallFace()` is now the ONE definition (jamb from the void edge, face from the wall's own thickness on the swing side), and the leaf, the arc **and** the ghost all derive from it. The handle looped over **both faces** (a symmetric plus sign); it is now **one face, latch end, plate + perpendicular lever** — an offset L, with the face derived from `swingDir`. || **L-282 a hosted DOOR promoted its HOST WALL to CUT** | **3.2 drawing (C09/C15)** | **🟢 SHIPPED (`7666b9c5`) — THE FOUNDER'S RULE WAS RIGHT; HIS MECHANISM WAS NOT, AND THE TRUTH IS WORSE.** **There is no `if (door.isCut()) wall.setCut(true)` in this codebase, and no Group lifting its zone from a child.** A fix that hunted for hierarchical propagation would have found nothing and concluded the bug did not exist. **THE PROPAGATION IS PURELY GEOMETRIC, and needs no hierarchy at all to fire:** `crossesCutPlane = |d0−near| <= CUT_LINE_EPSILON || |d1−near| <= CUT_LINE_EPSILON || (d0−near)·(d1−near) < 0`. **Only that last term is an honest INTERSECTION test.** The first two are a **15-CENTIMETRE PROXIMITY SKIRT** — *"if any edge comes within 15 cm of the cut plane, call it CUT."* So as the depth plane approached a door, **the WALL's own edges fell inside the skirt and flipped to CUT.** **The classifier was asking PROXIMITY, not INTERSECTION.** Now per-solid and honest; the founder's rule is the guard. || **L-281 the OVERALL dimension is drawn THROUGH the building** | **3.2 annotations (Gate G9)** | **🟢 SHIPPED (`845a4590`).** Fixed as a **TIER MODEL**, per building (reusing L-268's `partitionBuildings`): `magnitude = clearance(p1 → footprint bbox) + gap·(tier+1)`, so every chain lands at `bboxEdge + gap·(tier+1)` — openings → opening chain → exterior chain → **OVERALL outermost**. The gap is a **paper** constant (8 mm, C24) scaled by the view: no literals. **MY GUARD WAS UNFALSIFIABLE AND THE AGENT CAUGHT IT.** I insisted the test use an **L-shaped** plate (*"a rectangle would pass by luck"*). **An L passes by luck too** — every extreme node of an L **is** a bbox corner, so the overall never crosses. The defect needs an extreme node that is **not** a bbox corner: a **stepped/T/U** plate. The suite now reproduces the crossing on a **T**, proves the fix, and keeps the L as a regression case **with a comment saying why it is not a proof**. **Also fixed in passing:** the crossing guard was **probing a line the renderer never draws** (it anchored at `max(p1,p2)`; the renderer anchors at the *first reference*) — guard and serialiser now share one formula. Suite 62 → **75**. |
| _(superseded)_ | | **OPEN — HIGH.** *"The 'total' dims ALWAYS OUTSIDE and at the END of the dim pipeline — never through the building."* His **13000 mm** overall runs vertically **straight across the floor plate**. **Two rules in one sentence:** **(a) OUTSIDE** — a dimension line never crosses what it measures; **(b) OUTERMOST TIER** — chains stack outward (openings → exterior chain → **overall, furthest out**). **The real finding:** the planner takes the overall from the two extreme perimeter corners — **correct for the VALUE** — then draws it **on the axis those corners define**, which on an L-shaped/notched footprint crosses the plate. **The value is right; the OFFSET is missing.** **Fix it as a TIER MODEL, not a nudge:** each tier offset from the **FOOTPRINT BBOX** — not the nearest wall, because *'outside the nearest wall'* is still **inside** an L-plan, which is exactly his screenshot — scale-aware, each clearing the one inside it. **L-268's `partitionBuildings()` already supplies the footprints.** **Guard on an L-SHAPED plate; a rectangle would pass by luck.** |
| **L-280 window plan frame reads too thick** | **3.2 drawing** | **🟡 MEASURED — IT IS NOT THE GEOMETRY (`2fd94b6b`). The fix moved to the DRAWING agent.** Measured off the emitted symbol: band **0.050 m** == record `frameThickness` **0.050 m** == the 3D frame face width; halve the record and the band halves. **The geometry tracks the record exactly** — candidate (A) refuted, **no geometry was changed.** **The real cause is a PEN-TABLE BYPASS:** `PlanViewCanvas` resolves the window symbol with state **hard-coded to `'projection'`** and strokes with a raw `appearance.line.weight`, **bypassing Contract-23 entirely** — so `A-GLAZ-CUT` (0.35 mm) and `A-GLAZ-PROJ` (0.18 mm) **get the same weight**, and **L-277's cut/projection hierarchy is FLATTENED for windows.** **Same class of failure L-277 caught on itself** (the canvas calls `graphicsRulesEngine.resolveStyle()`, not `resolvePen()`). **It is very likely the same bypass that would have swallowed L-285's function weights — so the bypass is being fixed FIRST, and a weight change PROVEN to reach the canvas, before the function axis is added.** || **L-278 window cut-zone + 3D/elevation LOD** | **3.2 hosted elements** | **🟢 SHIPPED (`9f82c63d`, `2aeae3ec`) — AND MY CENTRAL INSTRUCTION WAS WRONG.** I told it `skipInPlan` would *"delete the very lines that make it a window"*, because the plane really does cut the frame and glazing. **The premise is true; the conclusion does not follow — and building what I asked would have created the bug the ticket exists to kill.** **THOSE CUT LINES DO NOT COME FROM THE MESH.** `WindowPlanSymbolBuilder` already authors them from the record (jamb ticks on the void edges, frame faces, the rebate step, true double-line glazing at real thickness). **The mesh does not ADD the window's cut section — it DUPLICATES it** from a second, un-LOD'd, un-penned source, *and* dumps on top the members a plan must never show (head bar at 2.2 m, transoms, every pane outline). **So `skipInPlan` is correct for the window too; Contract 48 §5 is the rule, not a door-shaped exception.** **Three real defects found:** the window was **double-drawing**; **`@pryzm/geometry-window` had not typechecked for TWO COMMITS** (my own L-266 `mullionThickness` revert was half-done — the field was dropped from the resolver's return but left REQUIRED on the record; invisible because that workspace was not in CI until the gate was broadened); and the **60 mm double meeting-stile was a LITERAL in the 3D builder**, invisible to the symbol — so the same window drew **60 mm in 3D and 30 mm in plan**. **LOD 4/42 → 6/42.** **One choice it REFUSED to make silently:** a plan sash would change the glazing SPAN between LOD tiers, contradicting the pinned *"dimensions do not change with LOD"* invariant. **Founder's call.** || **L-277 Revit line-type semantics — PROJECTION is being drawn as HIDDEN** | **3.2 drawing (C09/Contract-23) — HIGH** | **OPEN — HIGH. The founder handed us the normative model, and only ONE of the four zones dashes:** **CUT** (solid, heaviest, + poché — never dashed) · **PROJECTION** (solid, thinner — ***distance from the viewer does NOT make an edge hidden***) · **BEYOND** (solid, lighter — *not* hidden geometry; the lower run of a stair) · **HIDDEN** (**the only zone that dashes** — and it is an OCCLUSION fact, not a depth fact). **Why it is architectural:** we have a CUT/PROJECTION split and a **depth-based dash**. There is **no BEYOND zone at all**, and **HIDDEN is inferred from DEPTH rather than from OCCLUSION** — *"is it far?"* and *"is something in front of it?"* are different questions, and the drawing layer answers the wrong one. **This completes C09 §4.6 / ADR-0265:** that rule says an element is CUT or PROJECTED and that nothing is drawn through a solid; it does not yet say WHAT PEN each zone gets, and has no BEYOND. **Model `DrawingZone` explicitly** — a zone that is not named cannot be styled correctly, and that is exactly how PROJECTION got dashed. **Any dash keyed on distance is the bug and must be deleted.** |
| **L-276 property panel — Forma-style card layout** | **UX** | **🟢 SHIPPED.** *"Each SECTION is an individual component; BETWEEN them is TRANSPARENT; although everything as a whole is the panel."* That inverts what we had: one heavy opaque slab with sections stamped inside it. **The panel is now NOT A SURFACE — it is a transparent COLUMN**, and each section is an autonomous card floating on the scene, with the scene showing through the gaps. Depth comes from the cards, never from the frame. Purple is a brand **accent** (a 3px identity rail), not a background. **`display:flex`, not `block`** — the gap IS the design. **Residual:** legacy builders still set inline chrome, overridden with `!important`; migrate them and delete the overrides. |
| **L-272 FACADE sun analysis quality** | **Analysis / geospatial** | **🟢 SHIPPED (`9aedb9d7`) — ALL THREE OF MY HYPOTHESES REFUTED BY MEASUREMENT.** Lattice floor: **false** (a 1.5 m stub gets **0.75 m/node** — *denser* than the 34 m wall; narrow faces were OVER-sampled). Per-face normalisation: **false** (one global divisor since L-227). Façade texels/m was **already at parity** (1.00 vs the ground's 0.94). **THE REAL ROOT — and the 'parity' I told it to chase WAS the bug:** a sun-hours sample is a **binary lit/blocked raycast**, so the field is **quantised**. The ground paints a **7.1 m field at 0.94 m/texel** — each quantum step smears over ~7 texels and reads as a gradient. The façade painted a **1.2 m field at 1.0 m/texel — ONE-TO-ONE** — so **every single sun-sample flip became a one-texel step.** It was rendering **estimator variance at its own Nyquist frequency.** **SECOND ROOT, and it is specific to the founder's own flow:** the study's footprint ring took `input.boundary` **first — which is the PARCEL boundary he draws, not the building.** So on *locate → draw site → generate*, the façade study was computed on a **phantom envelope standing at the plot line**, with the real building inside it as an **occluder**, and the shader then draped that phantom onto the real model. Ring order fixed: wall-loop → floor-slab → parcel → centroid. **Fixed display-side only (BVH evaluator byte-identical — one field, two drapes):** hole-aware Gaussian reconstruction with **σ stated in METRES**, so a 1 m pier and a 30 m wall get identical physical fidelity; drape faces merged into **coplanar panels** (a 192-wall trace was emitting a seam per vertex). **Texel noise 8.3× → 1.9× of ground; blotchiness 11.4× → 2.0×; contrast loses 2.5%.** || **L-270 loading screens (3D-Globe / 3D-Site)** | **UX / view lifecycle** | **🟢 SHIPPED (`4cefee70`) — GENERALISED, NOT FORKED.** `BatchLoadingIndicator` → **`LoadingOverlayView`** (producer-agnostic) + a **ref-counted `LoadingOverlayController`**: **one surface, N producers**, so a batch ending mid-activation can no longer dismiss an overlay the globe still holds (there is a test for exactly that). **It DISMISSES ON A REAL SIGNAL, NEVER A TIMER** — and the signal ALREADY EXISTED: L-259's `reframeAfterBaseSettle()` is the chokepoint every ground-clamp terminal funnels through, so it already means *"the tiles have stopped streaming and the datum is known (or we gave up loudly)"*. **No second terrain-readiness notion was invented.** Real progress (*"412 / 1,205 tiles"*), a true **input gate** (backdrop + Cesium's own camera controller), and a **progress-FREEZE watchdog** (not a deadline) → an error card with *Try again / Continue anyway*. **The user is never trapped.** **IT PROVED ITS OWN GUARD COULD GO RED** (mutated the producer to dismiss on *content placed* instead of *ground settled* → 4 tests fail). **And it caught a latent bug:** the globe entry placed content on a **fixed 350 ms timer** that on a cold mount fires *before the viewport exists* — **the globe would open EMPTY**. Also: **C12 §1.4 did not exist** despite L-259's code citing it throughout; it is written now. || **L-271 nested `runBatch` SILENTLY DROPS its batch guards** | **0.x commands/batching** | **🟢 FIXED (`cae813ec`, on `main`) — AND MY FRAMING WAS REFUTED, WHICH IS THE MOST VALUABLE PART.** **I claimed the nested batch fragments UNDO. MEASURED, NOT ASSUMED: `CommandBus.executeCommand()` pushes exactly ONE ring entry PER DISPATCH and NEVER READS `batchCoordinator`. So `runBatch()` is UNDO-NEUTRAL — nesting, opening or dropping a batch CANNOT change the undo count. The batch never merged those entries, so it could not fragment them.** **What actually buys 'one gesture = one undo entry' is dispatching ONE `*.batch.create` command** (one `produceCommand` → one patch pair → one ring entry). An executor dispatching N `foo.create` commands inside a `runBatch` produces **N** undo entries and the batch cannot merge them. **Now written into C16 §8.6 (B-6/B-7) so it stops being re-learned.** **THE REAL BUG SURVIVED AND IS FIXED:** `runBatch` exists for the **GUARDS** — builder pauses, ViewDependencyTracker suppression, room-redetect suppression, the CRDT blackout, the registration queue, the loading overlay — and it was **dropping them silently while announcing that it had** (*a warning is not a guard*). Nested `runBatch` now **JOINS by depth-counting**, following the precedent already in this codebase (`StoreEventBus.beginBatch` → *'depth now 1'*); nothing releases until depth returns to 0, and joining is **refused** once the sweep has started (the registration queue is draining; new work cannot safely join). **G10 EXTENDED:** 7 nesting + 4 undo-atomicity tests, G10 still green (20/20). **G10 pinned the invariant but NOTHING pinned it under NESTING — a gate that did not cover, the same lesson as G0. Closed.** |
| _(original L-271 report)_ | | **Found by me in the founder's L-270 log; he did not report it.** `[BatchCoordinator] runBatch called while already batching — nesting not supported. Running fn() without batch guards.` — it detects the unsupported case, **announces it, and proceeds anyway with the guards OFF.** **The guards are what make a batch ONE UNDO ENTRY** (C16), what suppress the view-dependency tracker and room redetection, and what hold the CRDT blackout. **Running `fn()` without them commits the inner work OUTSIDE the batch's atomicity — the user's single "generate" can fragment into N undo steps.** It fires on a REAL flow (the resi-building ceiling + lighting fan-outs), not a corner case. **It also threatens G10, which we just marked VERIFIED: G10's guards pin the undo invariant, but NOTHING pins it under NESTED batching — the gate is green and the invariant is still breakable. A gate that does not cover; the same lesson as G0.** **Decide the semantics deliberately and write them into C16** — depth-counting (which `StoreEventBus.beginBatch()` ALREADY does — follow the precedent) or a HARD ERROR. **What is not acceptable is today's third option: detect, warn, carry on unguarded. A warning is not a guard.** |
| **L-268 auto-dimension covers only ONE of TWO buildings** | **3.2 annotations (Gate G9)** | **🟢 FIXED (`fb9eb26f`, on `main`) — REPRODUCED BEFORE IT WAS FIXED.** **Root cause (`perimeter.ts:tracePerimeter`): LARGEST-COMPONENT COLLAPSE.** The half-edge walk traces a closed face for **both** footprints correctly, then keeps the single **most-negative signed area** — the biggest building — and **silently discards every other one**. Not 'first loop wins', not bbox-collinearity: three hypotheses were on the table and **the fix waited for the reproduction rather than my guess** (which has been wrong ten times today). **The deeper finding: the engine's notion of 'the perimeter' is SINGULAR — there is no concept of a BUILDING anywhere in the documentation layer**, which is why the smaller footprint was not merely mis-dimensioned but **invisible**, and why nothing warned. **Fixed as the MISSING CONCEPT, not a branch:** `partitionBuildings()` + `tracePerimeters()` (plural) partition the level **ALWAYS** — one building is simply **N=1, the same code path**, which is how this stops recurring. C19 already contemplated a SITE with N buildings; the drawing layer had never learned it. **62/62 green.** |
| _(superseded)_ | | **A MISSING CONCEPT, not a missing branch.** `applyAutoDimensions.ts:153` feeds the planner **every wall on the level, undifferentiated** — **no connected-component split, no footprint grouping, no notion of a BUILDING anywhere in the documentation layer.** Two disjoint footprints collapse into one and **only one gets dimensioned — silently, with no partial-coverage warning.** **Fix the CONCEPT once, in the shared layer, not in the plan consumer:** partition the level's walls into connected footprints **ALWAYS** (one building is just N=1 — identical code path, which is how this stops recurring) and run the existing planner per component. **C19 already contemplates a SITE with N buildings** — the drawing layer never learned it. **The same assumption almost certainly breaks auto-tag (L-265), building elevations, and room-interior elevations — check them all.** And **never fail silently again**: the `warnings` channel already exists. **Reproduce with a failing test before fixing — the exact collapse point is not yet proven.** |
| **L-269 storage quota → autosave index fails SILENTLY (false success)** | **0.x persistence** | **🟢 FIXED (`bae46535`, on `main`) — and TWO of my THREE mechanisms were REFUTED by measurement.** **CONFIRMED, worse than described:** the data-loss shape is an **ORPHAN** — for a project not yet in the index, the version BODY persists to IndexedDB while **the project row never does**: versions exist, project unlisted, **never reopenable**. Proven by test. **REFUTED #1:** *'eviction exhausted'* does not mean the valve is spent — **it never ran**. The evictor only considers a key family a previous migration **already emptied**, so it loops **zero times** and prints 'exhausted' having evicted **not one byte**. *The L-249 family again: the safety path silently never ran.* **REFUTED #2:** *'why is quota full at 0.6 MB?'* — wrong question. That 0.6 MB is in **IndexedDB** and costs the localStorage cap **nothing**. **So the fix makes the app MEASURE AND NAME the hog instead of guessing** (`StorageQuotaDiagnostics`). **Shipped:** loud failure + latched terminal state + user-resolvable banner (P8) with **Export project** / **Free up space**; UI chrome can no longer take the app down on quota. 51/51 green. **Residual (origin still full): L-273.** |
| _(original L-269 report)_ | | **Found by me in the founder's L-268 log; he did not report it.** Every autosave logs `[VersionRepository] Quota exceeded — project meta index not updated (eviction exhausted)` — **the safety valve is already fully spent** — and an **uncaught** `QuotaExceededError` on `bim-pp-pos` (a property-panel POSITION — cosmetic chrome competing with project data for quota) escapes into the console. **The version BODY persists but its META INDEX does not — a version the user cannot find or restore — and `PlatformSaveController` logs *"Version saved"* anyway. The product tells him his work is safe while the thing that makes it findable failed to write. A FALSE SUCCESS is the worst class of bug we ship.** **P8: a data-losing outcome surfaces to the USER, not to `console.warn`.** Also: why is quota exhausted at ~0.6 MB of versions? Something else is filling the origin — that is the real question. |
| **L-274 untyped door/window records** | **3.2 hosted elements** | **🟢 SHIPPED (`8c8af20e`) — AND IT REFUTED THE SCARY PART OF MY FRAMING.** **The founder's doors do NOT change 0.900 → 0.926.** Width/height/offset are persisted **on the record** and every builder reads them from there; only the *pre-creation* resolver falls back to `DEFAULT_DOOR_DIMENSIONS`. Moving them would also desynchronise the record from the flat `WallData.openings[]` void that cuts the wall. **And the source is ALREADY CLOSED** — the most important question, answered NO: every creation path (3D, plan/bus, batch commands, PDF import, ai-host) lands **typed**, because the two store-record chokepoints backstop `systemTypeId` from the one tool config. Several callers *omit* the type and it still lands typed. **The only writer of an untyped record is the LOAD path replaying a legacy file — which is CORRECT** (a loader that silently retypes the founder's file is exactly what the contract forbids), and is what the migration answers. **User-invoked** (C17 batch catalogue), never at load; the type is **validated against the catalogue**, never invented. || **L-266 door + window plan symbols: PARITY still broken, and LOD far below reference** | **3.2 drawing (C15/C09) — HIGH** | **OPEN — HIGH. L-260A is NOT closed:** the founder still sees **two doors on one wall rendering differently** — parity between the plan and 3D creation paths is still broken (the **seven-times-repeated disease**). **His reference images encode a spec:** the door wants a **jamb/rebate profile in the reveal**, a **leaf with real thickness**, a swing arc, and — at LOD-300 — **hardware + open-leaf ghost on a lighter pen**; the window wants a **real frame profile — outer frame, sash, centre mullion, glazing line — drawn FROM THE WINDOW'S REAL LAYERS**, not a stack of arbitrary offsets. **The only sound route is to derive the symbol from the element's REAL RECORD at the LOD the VIEW asks for. A richer HARDCODED glyph is the same bug at higher resolution.** `WindowDimensions` already resolves frame/glazing thickness through record → systemType → DEFAULT with **no magic literals** — reuse it. **PARITY FIRST, THEN FIDELITY:** fixing fidelity while parity is broken just yields two beautiful symbols that disagree. Wire the grading to `DetailLevel` (L-262), never a private `detailed` boolean. |
| **L-267 rotation in PLAN view (wardrobe → all elements)** | **2.1/2.2 (Gate G7)** | **PARTIALLY SHIPPED + RE-SCOPED.** **PRE-placement plan rotation IS implemented and IS on `main`** — `§FEAT-PLACEMENT-SPACEBAR-ROTATE` (ADR-0105, `eb843bab`): **Spacebar rotates the plan placement preview +90°**, and `§FIX-FURNITURE-ROTATION` routes every branch (incl. the wardrobe branch, which used to hard-code `rotation: 0`) through the canonical scalar-yaw builder. **But the file's own docstring still read *"Plan view does not support rotation at placement time"* directly above the code that refutes it** — so when the founder asked *"why is it not implemented"*, **the source agreed with him**. Fixed (**§DOC-LIE-PLAN-ROTATION**). **The real surviving gap:** what exists is **PRE**-placement (90° steps, at creation). **POST**-placement rotation — select a placed wardrobe in plan and rotate it — **does not exist in plan view at all**, because rotation is the 3D gizmo's job. **That is not a furniture bug: the PLAN VIEW HAS NO TRANSFORM GIZMO, for ANY element.** Folded into **G7**. Must dispatch through the SAME commands as 3D (P6) — build a wardrobe-specific rotate and we own N rotate implementations. |
| **L-264 elements as SOLIDS across plan + elevation + section (the UNIFYING ticket)** | **3.2 drawing (C09/P7) — ARCHITECTURAL** | **OPEN — HIGH. Founder RE-RAISED: *"I already requested this."*** **Status of his screenshot:** the slab-through-wall defect **IS fixed** (`3b67ec57`, on `main`) — root cause: HLR hid a segment only when **BOTH endpoints** lay inside an occluder, so **a slab edge CROSSING a wall was never removed** (his `0/1532`). Now clips crossing spans against the true silhouette L-246 made available. **He must hard-refresh; if it persists on a fresh bundle, that is the surviving bug.** **But the REAL ask is broader and he is architecturally right:** one uniform rule — *an element is a SOLID; a view CUTS or PROJECTS it; nothing behind a solid is drawn through it, in ANY view type; and weight/fill/visibility come from VIEW INTENT.* Today plan **removes**, elevation **re-classifies**, section does **neither**; poché + cut weight are plan-only. **THIRD SIGHTING TODAY OF ONE DISEASE — L-262 (LOD is plan-only), L-263 (auto-dimension is plan-only), L-264 (solidity/poché/weight are plan-only). PRYZM's documentation layer is built PLAN-FIRST and never carried across. Fix it ONCE as an architecture, not three times as features.** One occlusion engine, three consumers; `viewPlane.isVertical` already expresses the only legitimate difference. Put the rule in a CONTRACT so it cannot be re-invented per view type. |
| **L-263 auto-dimension on ELEVATION views** | **3.2 annotations (Gate G9)** | **🟢 FIXED (`fb9eb26f`, on `main`).** An elevation dimension is **not** a rotated plan dimension — it measures the **VERTICAL** against a projected view (floor-to-floor, sill/head, parapet/eaves/ridge, level datums). The engine and the commands are **shared**, and `viewPlane.isVertical` was reused as the discriminator, so **no second notion of 'which way is up' was invented**. 15 elevation tests green. **Also fixed a real defect found in passing:** the new `commitAnnotationSet()` typed its parameter `readonly {id: string}[]`, which compiles at the call site and then hands `CreateManyAnnotationsCommand` an object that is **not** an `AnnotationElement` — and since the command's `undo()` removes `_added`, a structurally-typed impostor would **commit and then fail to undo cleanly**. Exactly the class of defect C16 exists to prevent. |
| _(superseded)_ | | **OPEN.** Auto-dimension runs in the batch pipeline for PLAN and works well; **elevation gets nothing.** **Same structural gap as L-262, from the other end: PRYZM's documentation capabilities are built PLAN-FIRST and not carried across to elevation/section.** An elevation dimension is NOT a rotated plan dimension - it measures the VERTICAL against a projected view (floor-to-floor, sill/head, parapet/eaves/ridge, level datums), so the rule set is genuinely new even though `packages/auto-dimension` and the dimension COMMANDS are shared and must be reused. **Sequence AFTER/WITH L-256** - auto-generating more dimensions before the dimension element passes its conformance audit just multiplies a non-conformant element. `viewPlane.isVertical` is already the discriminator; do not invent a second notion of 'which way is up'. |
| **L-262 LOD 200/300 across plan / elevation / section (STUDY + ADR first)** | **3.2 drawing (C09/P7) + C24/C24.1** | **OPEN - STUDY REQUIRED BEFORE CODE.** The `DetailLevel` enum (coarse/medium/fine = LOD 100/200/300) already EXISTS as the single source of truth (L-241) and the default is now `fine` (L-252) - **but almost nothing CONSUMES it.** Only the door honours all three tiers; **elevation and section have NO LOD story at all**, so the same building documented at 1:50 and 1:200 draws identically. **Deliverable is an ADR first:** a conformance matrix (element x view-type x LOD) saying what each tier draws today vs what it SHOULD - *the empty cells are the backlog* - plus the normative definition of each tier per view type. Then implement against it, reusing the shared enum and the door builder as reference. **One resolver, three consumers - not a second symbol engine per view type.** |
| **L-260 door creation parity + plan cut hierarchy (3 defects)** | **2.3 creation defaults (C11) + 3.2 drawing (C09/P7)** | **OPEN - HIGH. Three separate bugs in one screenshot.** **(A)** The SAME door renders DIFFERENTLY depending on whether it was created in PLAN or in 3D - **the SEVENTH confirmed instance of the signature disease** (cf. L-239, L-240, L-243, L-246, L-251, L-255). Fix = diff the two stored records field-by-field, then converge at the `door.create` chokepoint (the L-243 pattern), and ship the L-213 equality guard: *plan-created and 3D-created records must be BYTE-IDENTICAL*. **(B)** The SLAB line is drawn THROUGH solid walls in plan - the wall is CUT at 1.2 m and is a solid poche region; nothing beyond/below it may show through. Log shows `HiddenLineRemoval v1 pass - 2 occluder(s), 0/1532 segments removed` - **HLR runs and removes NOTHING**; may not even be an HLR bug but a draw-order/layer-priority one. **(C)** The CUT line must be HEAVIER than the projection line (ISO 13567 / Revit), **governed by VISIBILITY INTENT (P7/C09)**, not hardcoded. **Verify (C) against L-257 first** - layered walls were on layer "0" (no pen weight, no VG) until today's fix, so the pen table could never reach them. |
| **L-259 Cesium 3D globe: wrong elevation (underground) + wrong location, INTERMITTENT** | **1.x geospatial (C12)** | **OPEN - HIGH.** Menorca, near sea level, and the house renders UNDERGROUND - *sometimes*. **The intermittency is the clue: a geodetic transform is deterministic, so the variable is WHEN the terrain height is known.** Leading hypothesis: the model is anchored while the terrain/3D-Tiles sample is still async-loading, so the anchor falls back to **ellipsoid height 0** - and the **geoid/ellipsoid separation in the Balearics is ~+48-50 m**, which buries it. **Cesium's `fromDegrees(lon,lat,height)` takes an ELLIPSOIDAL height; architectural elevations are ORTHOMETRIC (MSL). Mixing them = ~50 m error.** Separately, *"the house is not in the correct LOCATION"* - an elevation bug CANNOT move it horizontally, so there is a SECOND (georeferencing/LTP-ENU) defect. **Split them; fix the race, not the maths; write the datum rule into C12.** Log also carries two TSL faults for the L-253 agent: `[ScenePass] TSL module not loaded. Call initTSL() before createScenePass()` (swallowed by ViewportCrashGuard) and `THREE.TSL: Invalid generated code, expected a "float"`. |
| **L-258 site-plan overlay: inverted order + Finish never enters canvas** | **1.x onboarding / site-first (C12 / C19 / C06)** | **OPEN - HIGH. THIS IS THE FIRST THING A NEW USER DOES.** Two defects: **(A)** the import fires on mode ENTRY, so the overlay lands at a random map location before the user has navigated to their site - the order must be **locate -> overlay -> place/calibrate**; **(B)** *"Finish - enter canvas"* **does not enter the canvas** - the user is stranded on the map with an Import Manager entry and no way into the model. Expected: land in the 3D view, **split view (3D + plan)**, with the PDF/JPG committed as an underlay in BOTH panes. **His boot log proves every piece already exists** (`CREATE_UNDERLAY`/`TRANSFORM_UNDERLAY`/`DELETE_UNDERLAY` registered, `UnderlayPersistence` installed, `Underlay Render Service` initialised, `ImportManagerPanel` mounted, `SplitViewManager` ready) - **so this is a WIRING/ORDERING bug, not a missing feature.** Model it as a state machine (`locating -> placing -> finished`); anchor the overlay in **LTP-ENU (C12)**; commit through the bus (**P6**) as one undo entry; guard with an end-to-end test. |
| **L-256 dimension not selectable/editable + unaudited** | **3.2 annotations/dimensions (Gate G9)** | **OPEN — HIGH.** Dimensions RENDER but cannot be SELECTED or EDITED, and their contract conformance has never been audited. Under **P6/C03** a dimension is an ELEMENT: schema, store, commands, one undo entry, selection, properties. **Founder asked for the CONFORMANCE AUDIT FIRST** — produce the six-point matrix (L0 schema · store · C16-compliant commands · single undo · pen table · OTel span); *the missing entries are the work*. **Then the ADR question he must answer before any code: does an editable dimension DRIVE the geometry (a real constraint, Revit-style) or only OVERRIDE the displayed text? Those are different products — do not guess.** Reuse `auto-dimension` + annotation commands; no parallel path. **RE-RAISED 2026-07-13 with acceptance criteria in the founder's own words: *"a dimension should be selected as easily as a door; once selected the properties panel should show its properties, as when a door is selected."*** **Two falsifiable tests, and both are downstream of the SAME conformance question:** **(A) PICKABILITY** — a dimension is a hairline; door-grade selection needs a **pick tolerance / hit-corridor** around the line, ticks AND text box. The likely truth is that annotations were **never given a pick representation at all**. **(B) PANEL PARITY** — the panel renders from the element's RECORD, so if the dimension has no proper record, the panel has nothing to show: **(B) is a SYMPTOM of the record gap, not a separate UI bug.** **ORDER: RECORD → PICK → PANEL. Fixing the panel first would be the shortcut, and it is forbidden.** |
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
| L-79 sibling room handlers (setNumber/setOccupancy/etc.) same store-key bug as L-75 | 2.x rooms | **QUEUED (rooms lane)** — bridge each to legacy command (§FIX-ROOM-SETNAME-STORE pattern); ADR-0202 |
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
| L-75 room rename not applied on Enter (room.setName missing 'room' store) | 2.x rooms/command-wiring | **QUEUED (rooms lane, quick)** — add `room` to room.setName storesProvider (ADR-0202 §3); Enter commits+persists+re-renders tag; handler test |
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

| L-188 [CRITICAL] GIS project loses site data on close+reopen — BIM restores but site location/boundary/globe context GONE, defaults to Madrid | Persistence / GIS site-state serialize+restore (C19) | **✅ FIXED 37cd943d→main** — SiteModel lived only in runtime SiteModelStore, never serialized/restored. Added site to snapshot + streaming header + restoreSiteState() re-seeds C19 origin + re-emits site events on load. 3+11 tests. §FIX-GIS-SITE-STATE-NOT-PERSISTED. 🏛️ COMPLIANCE PREREQUISITE (tagged 2026-07-18, fix-status unchanged): HARD PREREQUISITE for the Pipeline A compliance-authoring pillar (L-398–L-402) — parcel/zoning/buildable-envelope state (location, boundary, C19 origin, persisted zoning/envelope) must survive close+reopen. Cross-link: L-398/L-400/L-401, C19 §1.4/§1.6, C57. |

| L-189 [HIGH poss. L-165 regression] `Destroyed texture ShadowDepthTexture used in a submit` ×8 on project open (device-loss) since 1024px map live | Rendering / shadow realloc device-loss on project-switch (C04/ADR-0111/L-165) | **→ rendering-shadow agent (disjoint)** — verify 512→1024 triggers unguarded ShadowDepthTexture dispose mid-submit on project-switch tier realloc; defer old-texture dispose past in-flight submit, else REVERT to 512. §FIX-SHADOW-REALLOC-DEVICE-LOSS-PROJECT-SWITCH |

| L-190 [HIGH] elevation: windows absent from geometry + set-back wall solid-not-hidden (§ELEV-LINEWEIGHT-02) | Documentation / elevation geometry inclusion + occlusion | **✅ FIXED 19f12ba5→main** — separate roots from L-182. Bug A (query): windows only enter `Level.childrenIds` via CreateWallOpeningCommand; reload/batch rebuilds bypass it → elevation now unions hosted-opening roots from `elementRegistry.getAllRoots()`. Bug B (missing occlusion): `reclassifyOccludedElevationLines` stamps per-element depth + moves occluded `:proj` segs to dashed `:beyond`. 4+8 tests. §ELEV-LINEWEIGHT-02 |

| L-191 [HIGH PRIORITISE] perimeter dims must ALWAYS be outside the shell — bottom perfect, top+left not outward | Documentation / auto-dim perimeter outward side (C56/L-155) | **✅ FIXED 081140a2→main** — engine's +axis `side` disagreed with renderer's `leftPerp(measurementDir)` on vertical runs (left/right went inward). `side` now chosen so `leftPerp·side == outwardNormal`; conflicts scan matched. 34/34 tests. §FIX-AUTODIM-PERIMETER-ALWAYS-OUTWARD |

| L-192 [HIGH] ShadowDepthTexture destroyed-in-submit STILL ×21 at 512px on project-open (device-loss residual) | Rendering / shadow-dispose GPU-fence (ADR-0111/L-189) | **QUEUED → renderer/shadow agent** — replace setTimeout(0)-deferred old-texture dispose with GPU-fence-gated dispose (device.queue.onSubmittedWorkDone().then(dispose)); device-loss-proof at any map size; prereq before any 1024 re-attempt. §FIX-SHADOW-DISPOSE-GPU-FENCE |

| L-193 [HIGH — unblocks L-177 + L-186] GISAreaLayout never (re-)runs real-model placement → Forma shows massing prism not real GLB + globe loses building on re-entry | Geospatial / GISAreaLayout real-model placement orchestration (C18-23/A.24/L-177/L-186) | **→ GISAreaLayout agent (FENCE: GISAreaLayout.ts + pure placement sibling; call existing renderRealModelOnForma/renderRealModelOnGlobe, don't re-implement CesiumViewport internals)** — (A) Forma "3D Site" activation must invoke placeRealModelOnForma (fidelity='real') so the real GLB replaces the massing prism (then clearFormaMassingEntitiesOnly runs) → L-177 drape lands on the real house; (B) globe re-activation branch (lines 291–308) must idempotently re-run real-model placement + reframe on EVERY globe entry (not gated on isBimPlacedOnEarth alone). Tests + live-Cesium verify. §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY   **✅ FIXED 3f132de9→main** — both = stale placement cache after a view-switch destroys the Cesium primitive. New pure `globePlacementDecisions.ts` + `restorePhotorealGlobeContent()`: invalidate Forma real cache on photoreal-globe entry (A) + direct nav-rail re-entry re-places via modern path + reframes (B). Idempotent globe⇄forma⇄globe; L-179 clamp + L-184 reframe preserved. 10/10 + 29/29 tests, tsc 0. Unblocks L-177. Live-Cesium confirmation pending. |

| L-194 [HIGH PRIORITISE] onboarding "Overlay a plan/PDF": double panels / no map-zoom + boundary-draw still armed + Finish doesn't open 3D split | Onboarding / site-plan-overlay import flow (ADR-0259/SPEC-SITE-PLAN-OVERLAY/C19/O.2) | **→ onboarding/site-overlay agent (fenced OnboardingStepController + SitePlanOverlayController + SiteBoundaryMap2D overlay-only gate; disjoint)** — (1) single map-based overlay path (remove straight-to-plan import, always zoomable map); (2) suppress the boundary-draw tool + generate-confirm in overlay-only mode (terminal); (3) landInCanvasWithUnderlay → 3D SPLIT view via SplitViewManager, underlay framed, ready to draw. **✅ FIXED 6a0cc801→main** — no separate straight-to-plan path existed (only the map path); overlay-only now attaches NO draw handler + inerts Enter/mode keys + hides map ✕; Finish opens plan+3D split via splitViewManager.activate(). 24/24 tests. §FIX-ONBOARDING-OVERLAY-SINGLE-PANEL-NO-BOUNDARY-SPLIT3D |
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

Related: **ADR-0257** (realtime-edit perf — a door move triggering a whole-level rebuild).

### Phases — measure-first (this is a hang; the L-205 discipline applies)

| Phase | Work |
|---|---|
| **P1** | **LOCATE the hang first** — add a main-thread watchdog + bounded loop-iteration guards across wall-move → baseline-update → rebuild → opening-re-host → join-resolve. Counters that throw+log after N iterations; a frame-budget watchdog that dumps the active call stack when a synchronous span exceeds ~1 s. Turn the silent freeze into a located, logged failure — what every prior attempt lacked. |
| **P2** | **Reproduce deterministically** — a wall hosting a door, moved to a near-degenerate / endpoint-reversing baseline (`z ≈ 1e-16`). Add it as a test fixture. |
| **P3** | **Fix the actual loop** — a missing fixpoint/guard in the re-host cascade, or a degenerate-baseline guard in the reversal/join path. A degenerate baseline (near-zero length or `dot ≈ 0`) must be **rejected with a user toast**, never processed into a loop. |
| **P4** | **Preserve the `BaselineReversalError` guard** — it is CORRECT (opening offsets depend on endpoint[0]). The fix stops the swap/rebuild CASCADING, it does not remove the guard. |
| **P5** | Tests: moving a hosted-door wall to a degenerate baseline terminates (bounded), commits or cleanly rejects, never hangs; the re-host cascade reaches a fixpoint in ≤1 pass. |

**Contract mapping:** C11 (element pipeline), **C15** (hosted elements: doors/windows in walls),
**ADR-0257** (realtime-edit perf), P6. Fence: `packages/command-registry/src/walls/**`,
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


---

## L-323 — "3D Site" (Forma) view slow to generate: single-export + context cache + readiness gate

**Reported:** founder, 2026-07-16 (23-storey office GIS). **Severity:** MEDIUM (entry latency; the view is sound once generated). **Owner queue:** GIS / geospatial agent. **Audit row:** L-323.

**Root (all confirmed in code):**
1. The model is serialised to a ~40 MB GLB **twice** per GIS session — the photoreal globe path (`GISAreaLayout.ts:1952`, real materials) and the Forma "3D Site" path (`GISAreaLayout.ts:2111`, `{ formaWhite: true }`) hold **separate** signature caches and produce differently-tinted output, so the 1523-root geometry walk runs twice. The geometry walk is byte-identical; only the material tint differs. **The tint was baked into a GLB-export option by ADR-0093 — a presentation concern forcing a second serialisation.**
2. Overpass context over-fetch: ~13,974 footprints fetched/parsed to render 900 (`§FEAT-FORMA-CONTEXT-EXTENT-LOD` caps the *render*, not the *fetch*); roads + water re-fetched, no cache across globe↔forma re-entry.
3. The 25 s "tiles" stall: readiness gates on `snap.tilesLoaded && outstanding === 0` (`viewActivationLoading.ts:251`), but a keyless-ellipsoid flat-ground Forma study never finishes tile streaming → the overlay sits until the stall timeout.

**Contract mapping:** **C06** (GIS surface), **ADR-0093** (forma-white model — conflict-resolution: presentation ≠ data), **P7** (presentation intent ≠ data), **C04** (scheduling), `§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY`.

| Phase | Work |
|---|---|
| **P1** | **Single export (the architectural fix).** Move the Forma-white tint OUT of `exportFragmentsToGLB`'s options and onto the **Cesium primitive at placement** — a view-side material override (ADR-0093 says the white model is Forma-VIEW-ONLY; P7: it is presentation, not data). One signature-keyed export then serves both the globe and the Forma study. |
| **P2** | **Shared context cache + fetch cap.** Cap the Overpass **fetch** (not just the render) to the LOD extent; hold one signature-keyed context cache (buildings/roads/water) reused across globe↔forma re-entry. |
| **P3** | **Readiness gate.** On a keyless / no-terrain flat-ground study, resolve `waitForTiles()` immediately when no real tile provider is attached — do not gate readiness on tile streaming that will never complete. |
| **P4** | **Guards.** A single GIS session showing BOTH globe and Forma performs exactly **one** `exportFragmentsToGLB`; Overpass fetch count ≤ rendered-footprint cap; the flat-ground Forma study reports READY with no tiles stall. |

**Why this ordering:** P1 is the biggest lever and the one true architectural change (presentation off the data path); P2/P3 are latency + false-wait removal layered on top. `SS-FIX-FORMA-SITE-SINGLE-EXPORT-AND-CONTEXT-CACHE`.

---

## L-324 — Device-loss recovery loop has no terminal state → stuck "RECOVERING RENDERER…" hang

**Reported:** founder, 2026-07-16 (recurrent). **Severity:** CRITICAL (strands the viewport). **Owner queue:** render-crash agent (L-301 / L-312 family). **Audit row:** L-324. **Demo mitigation (no code):** stay on WebGL from the start and do not toggle the backend — the trigger is the live WebGL→WebGPU swap on the heavy office.

**Root (chain from the log):** the live backend swap is itself the device-loss trigger on the heavy office; the Cesium cascade re-mounts mid-recovery and fails, spending context-creation attempts; the 2/2 device-loss cap trips into WebGL2 safe-mode, but the browser has already blocked all page GL contexts (`Web page caused context loss and was blocked`), so the safety net cannot acquire a context either; the swap rolls back but the **"RECOVERING RENDERER…" overlay is never dismissed** — no terminal state.

**Contract mapping:** **C04** (scheduling), **P2** (single THREE owner), **P3** (single rAF), same family as **L-301 / L-303 / L-312**. This is the **terminal form of the L-312 device-loss family** — L-312B (PSO storm) is the frequency root; this item adds the swap-as-trigger and the no-exit overlay.

| Phase | Work |
|---|---|
| **P1** | **Frequency root (= L-312B).** Share curtain-wall materials per (level, kind) via `§INSTANCE-MAT-SHARE`; wrap the CW batch in `rpm.setSuspended()` so the ~9k window-class draws do not mint thousands of PSOs in one flush. Device loss stops happening at the source. |
| **P2** | **Swap is a reconstruction boundary.** The live backend swap must fully quiesce + dispose the OLD device before creating the new one — never two live GPU devices overlapping. Block the swap outright while a device-loss recovery is in flight. |
| **P3** | **Recovery must have a terminal state.** Once the browser reports `Web page caused context loss and was blocked`, STOP all context-creation attempts (WebGPU AND WebGL) and surface one honest "reload required" CTA — never an infinite "RECOVERING RENDERER…" overlay. Fix the 2/2 cap to account for the WebGL2 fallback also being blocked. |
| **P4** | **Cesium re-mount gating.** Do not attempt a fresh WebGL context for Cesium while the page is in the blocked/terminal state; skip re-mount when renderer recovery has hit its terminal cap. |
| **P5** | **Guards.** (1) A live backend swap on the heavy office never overlaps two GPU devices; (2) after the browser blocks contexts, the overlay resolves to a single reload CTA within one recovery cycle — never hangs; (3) Cesium does not re-mount during a blocked/terminal recovery. |

**Why this ordering:** P1 removes the cause (device loss on this scene); P2–P4 harden the boundary and the recovery so that when a loss *does* happen, it degrades gracefully or terminates honestly rather than thrashing the page into a permanent block. `SS-FIX-RECOVERY-LOOP-TERMINAL-STATE`.


---

## L-325 — Project isolation: projection/culling registries + ProjectOrigin not reset on new-project entry

**Reported:** founder, 2026-07-16 (recurrent). **Severity:** CRITICAL (a fresh project is unusable: empty 3D, no origin, ghost plan symbols). **Owner queue:** isolation / render agent (C13 family, L-316 / L-320 lineage). **Audit row:** L-325. **Demo mitigation (no code):** reload the page between projects; do not create a new project immediately after a render-recovery event (L-324).

**Root (confirmed in code + log):** the new project's snapshot has **10 elements**, but `NativeElementMeshExporter` (`NativeElementMeshExporter.ts:254`, iterating `elementRegistry.getAllRoots()`) exports **117**, and `FrustumCullingService` audits **878 elements / 1672 meshes** — the office tower is still resident in the global `elementRegistry`. The 3D **scene root was cleared** (empty view, no ProjectOrigin blue sphere) but the **element/projection registries were not**, and the new project's 3D geometry + origin were never rebuilt. `ClearProjectCommand.ts:81` *does* call `elementRegistry.clear()`, so the explicit Clear path is correct — the **"new project" entry path bypasses that chokepoint** (or repopulates after it). Strongly coupled to **L-324**: this occurred immediately after the recovery-render meltdown; a new project built against a torn/blocked renderer skips or corrupts the full teardown + reconstruction.

**The architectural framing:** C13 isolation has **two domains** — (a) the **data stores**, already audited clean by `ProjectIsolationAudit`; and (b) the **render/projection registries** (`elementRegistry`, `FrustumCullingService`, `NativeElementMeshExporter` proxy cache, `EdgeProjectorService` cache, `ViewTechnicalDrawingCache`) **plus** the 3D scene root and the ProjectOrigin. The new-project path resets (a) and the 3D scene root, but not (b) — so plan projection + culling still see the old project while 3D is empty. This is the same lineage as L-316 (project-switch GPU reset) and L-320 (builder disposal); L-325 extends the isolation chokepoint to the **projection/culling registries** and the **ProjectOrigin reconstruction**.

**Contract mapping:** **C13** (project lifecycle + isolation — render/projection side), **P1** (single composition root — one teardown path, not per-entry-point), lineage L-316 / L-320. Governing doc: `docs/02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md`.

| Phase | Work |
|---|---|
| **P1** | **One teardown chokepoint for every project-entry path.** New / create / switch / import must all route through the **same** C13 teardown that `ClearProjectCommand` runs — no entry point tears down "its own way" (P1). Identify the bypassing new-project path and fold it in. |
| **P2** | **Purge the render/projection registries in that chokepoint** (not just the data stores): `elementRegistry.clear()`, `FrustumCullingService` registry reset, `NativeElementMeshExporter` proxy cache, `EdgeProjectorService` cache, `ViewTechnicalDrawingCache.clear()`. |
| **P3** | **Re-seat the ProjectOrigin** in the new 3D scene (the blue sphere) — the intent is already covered by `projectOriginIsolation.test.ts`; find why it does not fire on this path and route origin reconstruction through the chokepoint. |
| **P4** | **Robust to a mid-recovery renderer (L-324).** Sequence: teardown → renderer settle → reconstruct → origin. Never build the new project against a blocked / recovering GPU device. Gate new-project creation until the renderer is live. |
| **P5** | **Dev-assert / gate (render-side isolation audit).** After a project switch, assert `elementRegistry` root-count == the new snapshot's element-count — 117 ≠ 10 must fail loudly, mirroring `ProjectIsolationAudit` but on the render/projection side. Extend `check-project-isolation` / the GA-gate accordingly. |
| **P6** | **Guards.** Creating a new project after any prior project leaves `elementRegistry` / culling / NME / EdgeProjector / technical-drawing holding **exactly** the new project's elements; the ProjectOrigin renders; the 3D view shows the new geometry; plan view shows **no** reminiscence symbols. |

**Why this ordering:** P1 before P2 — there must be a single path to attach the purge to; attaching purges to a bypassed path fixes nothing. P4 encodes the L-324 coupling so the two render-family bugs are fixed coherently rather than papering over each other. P5 makes the invariant self-enforcing so this class of leak cannot silently return. `SS-FIX-PROJECT-ISOLATION-PROJECTION-REGISTRIES`.


---

## L-326 — Grey viewport background on heavy batch scenes: WebGL2 fallback never paints the white

**Reported:** founder, 2026-07-16 (after office + residential batch generation). **Severity:** MEDIUM (cosmetic; brand — the model renders fine). **Owner queue:** render agent (L-317 / L-312 family). **Audit row:** L-326.

**Root (confirmed in code + screenshot):** the white viewport background is painted by the **WebGPU TSL background uniform** (`BackgroundUniform.ts:42`, `LIGHT_BG_HEX='#ffffff'`). On WebGPU, `RenderPipelineManager` deliberately nulls `scene.three.background` (`:1779`) and clears transparent (`:1783`) so the TSL uniform owns the fill. The office/residential batch trips the device-loss cascade (L-312 / L-324 family) into the **WebGL2 fallback backend** (GPU bar: `webgl-fallback`), where the TSL pipeline does not run — so nothing paints the white and the transparent clear over the grey container shows through as grey. The opaque white-fill exists (`:636`, `setClearColor(_lightweightBgColor, 1)`) but only on the `§PERF-WEBGL2-RENDER-ON-MOVE` lightweight path (disabled here), not the full fallback backend.

**The architectural framing:** the background is a **WebGPU-TSL-owned** concern; L-317 already established that *every non-WebGPU render path must independently paint the theme background opaque* (it fixed the lightweight WebGL2 overlay). L-326 is the same invariant, one path further: the **full WebGL2 fallback backend** was missed. Brand mandate: unified PRYZM white + purple, no grey/black backgrounds.

**Contract mapping:** **C04** (scheduling/rendering), **P2** (single THREE owner — renderer-three), lineage L-317 (WebGL2 opaque) + L-312 / L-324 (device-loss cascade that drops to the fallback). Brand: preview-color-unified-purple, onboarding brand (white + #6600FF).

| Phase | Work |
|---|---|
| **P1** | **Confirm the active path.** Full WebGL2 fallback backend clear vs `SceneQualityTier` `performance`-tier environment/IBL drop. The screenshot's `webgl-fallback` points at the former; rule the latter in or out before touching code. |
| **P2** | **The WebGL2 fallback backend paints `LIGHT_BG_HEX` opaque.** Either `setClearColor(_lightweightBgColor, 1)` with an opaque white fill on the full fallback render, or keep the TSL-null contract but guarantee the fallback clears to opaque white. Mirror L-317's opaque-overlay fix for the full fallback, not just render-on-move. |
| **P3** | **Theme-aware.** White in light theme, `DARK_BG_HEX` (#0a0f2c) in dark — reuse `_lightweightBgColor`, which already tracks theme (`:435` / `:830`). |
| **P4** | **Guards.** A light-theme heavy scene (office/resi batch) shows a WHITE viewport background on BOTH the WebGPU pipeline AND the WebGL2 fallback backend; dark theme yields #0a0f2c on both. |

**Why this ordering:** P1 first — the fix differs entirely depending on whether the grey is the fallback clear or a dropped environment; do not guess. P2/P3 restore the invariant on the confirmed path. Note the coupling: L-312B (stop the heavy batch from losing the device) prevents the drop to fallback in the first place — but the fallback must be white regardless, so this is fixed independently. `SS-FIX-WEBGL-FALLBACK-WHITE-BACKGROUND`.


---

## L-327 — Forma "3D Site" tiles-readiness false-wait on keyless ground (the visible "taking too long" error)

**Reported:** founder, 2026-07-16 (2nd report — Barcelona resi). **Severity:** HIGH (demo-blocking, recurrent). **Owner queue:** GIS / geospatial agent (with L-323). **Audit row:** L-327. **Parent:** L-323 (this is the shippable quick-win extracted from L-323 cause #3 — smaller + safer than the export-dedup / context-cache refactor, and the piece the founder actually sees).

**Root:** the view-activation readiness chain gates the `tiles` stage on `snap.tilesLoaded && outstanding === 0` (`viewActivationLoading.ts:251`), but the Forma flat-ground study runs on a **keyless ellipsoid with no tile/terrain provider** (`terrain clamp degraded — no real terrain provider attached`). Tiles never stream → the stage never advances → the stall watchdog trips at 25 s and shows the founder "The map tiles have stopped streaming." The `ViewActivationSignals` port (`viewActivationLoading.ts:62`) has **no signal for whether a real tile provider is attached**, so the state machine cannot distinguish "tiles still loading" from "there will never be tiles." **Second symptom, same root:** context buildings did not load (roads + parks did) — consistent with context-building fetch being **sequenced behind the tiles-ready gate that never fires**; buildings appear only "sometime after."

**Contract mapping:** **C06** (GIS surface); **C01 §2** — the loading state machine is deliberately Cesium-free (all signals arrive through the injected `ViewActivationSignals` port), so the fix must extend the **port**, not import Cesium into the state machine; **§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY**; **L-259** seat-and-reveal. Child of L-323.

| Phase | Work |
|---|---|
| **P1** | **Extend the port (C01 §2-safe).** Add `hasRealTileProvider(): boolean` to `ViewActivationSignals` (or a `providerPresent` flag on `TileStreamSnapshot`) — the state machine stays Cesium-free but can now know when tiles can never stream. Wire it from `CesiumViewport` (it already logs "no real terrain provider attached"). |
| **P2** | **Skip / immediately-resolve the `tiles` stage** when no real tile provider is attached — `waitForTiles()` resolves at once on a keyless flat-ground Forma study instead of waiting 25 s for a stream that will never begin. |
| **P3** | **Decouple context-building load from the tiles gate.** Context buildings (+ roads/parks) must fetch on their own schedule, never chained behind tile readiness. Confirm the current sequencing; parallelise + cap per L-323 cause #2. |
| **P4** | **Preserve the genuine stall watchdog.** When a real tile provider IS attached and streaming genuinely stalls, the 25 s progress-freeze detector must still surface "Try again" — do not blanket-disable it. |
| **P5** | **Guards.** A keyless-ground Forma "3D Site" reaches READY with no 25 s tiles-stall and no error dialog; context buildings render without waiting on tile readiness; with a real tile provider attached, a genuine streaming stall still surfaces the retry. Unit-test via the existing Cesium-free `viewActivationLoadingOverlay.test.ts` seam. |

**Why this ordering:** P1 before P2 — the skip must be driven by a real injected signal, not a hardcoded assumption that Forma is always keyless (a real provider may be attached later). P3 addresses the founder's "buildings didn't load" as the same root rather than a separate fetch bug. P4 keeps the safety net honest for the case it was built for. `SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE`.


---

## L-328 — Elevation-view creation loses the GPU device via a zero-size render target

**Reported:** founder, 2026-07-16 ("just creating a simple elevation view" — a trivial 53-mesh scene). **Severity:** HIGH (elevations are a core documentation workflow; device loss on a basic action). **Owner queue:** render agent (L-312 / L-324 device-loss family + L-312A / L-317 render-size family). **Audit row:** L-328.

**Root (confirmed in code + log):** creating the elevation view spins up a split-pane render target **before its pane has a measured size (0×0)**. The engine keeps submitting against that incomplete framebuffer → `Framebuffer is incomplete: Attachment has zero size` (glClear/glDrawElements/glDrawArrays/glBlitFramebuffer) → a shader-VALIDATE_STATUS burst on five material types with empty info logs (context going down mid-validate) → `WebGPU Device Lost` → the full recovery cascade, until `_reconcileRenderSize` catches up at 807×976 (the split pane finally laid out). The existing zero-size guard (`RenderPipelineManager.ts:798`, `if (w<=0||h<=0) return false`) only skips the **resize** — it does **not** suppress the **render submit**, so the loop draws against the incomplete framebuffer and the driver kills the device.

**The architectural framing:** two established families intersect here — the **render-size** family (L-312A `_reconcileRenderSize`, L-317 opaque overlay) and the **device-loss** family (L-312 / L-324). The new facet is the **trigger**: a lightweight, common documentation action (create elevation), not a heavy PSO storm. The durable invariant: **never submit a render pass against a zero-size / incomplete framebuffer**, and **never allocate a view's render target before its container has a non-zero measured size**.

**Contract mapping:** **C04** (scheduling / rendering), **C24 / C24.1** (documentation views — the elevation surface), **P2** (single THREE owner), **P3** (single rAF). Lineage: L-312A, L-317, L-312, L-324.

| Phase | Work |
|---|---|
| **P1** | **Suppress the render submit while the target is zero-size.** Pair the `_reconcileRenderSize` 0×0 early-return with a render-pass GATE that skips the submit entirely until the pane reports a non-zero measured size. Never submit against an incomplete framebuffer — this is the single change that stops the device loss. |
| **P2** | **Defer render-target allocation for a newly-created view / split pane** until its container reports non-zero `clientWidth/clientHeight` (ResizeObserver or first-laid-out frame). A zero-size attachment is then never created in the first place. |
| **P3** | **Confirm the shader-VALIDATE burst is symptom, not cause** (empty info log points to the context already going down from the incomplete-framebuffer submit). If confirmed, P1+P2 remove it; if a genuine link failure remains, investigate the material recompile on view switch separately. |
| **P4** | **Guards.** Creating an elevation view on a trivial scene issues no submit against a zero-size framebuffer, produces no "Attachment has zero size" GL error, and does not lose the WebGPU device; the elevation renders correctly on first layout. Add a unit/integration test on the split-pane sizing lifecycle. |

**Why this ordering:** P1 is the minimal change that stops the device loss (gate the submit); P2 removes the root condition (no zero-size target ever created), so P1's gate becomes a belt-and-braces safety net rather than the sole defence. P3 verifies the shader errors were downstream so we don't chase a phantom link bug. `SS-FIX-ELEVATION-VIEW-ZERO-SIZE-RENDER-TARGET`.


---

## L-329 — Element selection dies after a device-loss: make GPU picking survive recovery (DEDICATED agent)

**Reported:** founder, 2026-07-16 ("seen many times"). **Severity:** HIGH (editor becomes unusable mid-session — you can no longer select anything in 3D). **Owner queue:** DEDICATED selection-recovery agent (picking subsystem only, founder-requested). **Audit row:** L-329.

**Root:** 3D element selection uses **GPU id-picking** (`packages/picking/src/gpu-pick.ts`, `§SELECT-PICK-RESOLUTION` — a viewport-sized pick render target + search radius). The trigger in the log is the ShadowDepthTexture-mid-submit family (`Destroyed texture "ShadowDepthTexture" used in a submit` — §SHADOW-DISPOSE-DEFER) → `WebGPU Device Lost` → zero-size framebuffer flood → context lost/restored. After the device is recreated, **the pick render target (and/or the per-element id registrations the pick reads) is stale / zero-size / bound to the superseded GPU device**, so every pick returns nothing and the user "cannot select elements anymore." Picking is never rebuilt on recovery.

**Relationship to the render family:** this is the **selection-side victim** of the L-312 / L-324 device-loss family. Those agents stop the device loss at its source; **L-329 makes selection survive a loss if one still happens.** The two are complementary and independently valuable — L-329 is fenced entirely to the picking subsystem so it can land in parallel without touching `RenderPipelineManager` (render agent) or `initTools.ts` (isolation agent).

**Contract mapping:** **C04** (rendering/scheduling), **P1** (composition root — the picking slot is wired via `buildPickingSlot` / `composeRuntime`, not ad hoc), **P8** (OTel span — `packages/picking/src/otel.ts` already exists; any new exported fn adds one). Device-loss family L-312 / L-324; memories: gpu-pick-resolution-and-highlight, 3d-selection-instanced-gpu-pick-gap, null-at-mount-runtime-event-race (§SHADOW-DISPOSE-DEFER).

**Fence:** `packages/picking/src/**`, `packages/picking/__tests__/**`, `packages/input-host/src/SelectionManager.ts` (+ tests), `packages/runtime-composer/src/buildPickingSlot.ts`. MUST NOT touch `RenderPipelineManager.ts`, `createRenderer.ts`, `initTools.ts`, `ProjectLifecycleController.ts`, or geospatial (owned by the other four agents).

| Phase | Work |
|---|---|
| **P1** | **Self-healing pick target (primary, self-contained).** At pick time, detect an invalid / zero-size / stale-device GPU-pick render target and rebuild it before reading. Picking becomes idempotently recoverable with no dependency on cross-subsystem event wiring. This is the durable fix and it lives entirely in `gpu-pick.ts` / the picking slot. |
| **P2** | **Recovery-aware (secondary).** Locate the existing device-loss/recovery signal (grep — do NOT edit RenderPipelineManager) and, from within the picking slot / SelectionManager, re-create the pick target + re-register pickables when it fires. Belt-and-braces with P1. |
| **P3** | **Verify id-registration survives.** Instanced walls have per-instance ids but no group `userData.id` (memory 3d-selection-instanced-gpu-pick-gap) — ensure recovery re-establishes the id registrations the GPU pick depends on, for instanced and non-instanced elements alike. |
| **P4** | **Guards.** After a simulated WebGPU device loss + recovery, a click on a wall/window/door in 3D still selects it (GPU pick returns the correct id); the pick target is rebuilt (non-zero size, current device); there is no permanent selection-dead state. Red-before/green-after test in `packages/picking/__tests__/`. |

**Why this ordering:** P1 first because a self-healing pick path is robust regardless of whether a recovery event is emitted or wired correctly — it cannot silently fail the way an event subscription can. P2 makes recovery proactive (rebuild before the next click rather than on it). P3 guards the subtle instanced-id gap that a naive target-rebuild would miss. `SS-FIX-SELECTION-SURVIVES-DEVICE-LOSS`.


---

## L-330 — Wire the visibility-intent engine as the live SSOT of view graphics (Phase-3A port)

**Reported:** founder, 2026-07-16 ("the view graphics are good but I feel they are not connected to the visibility intent yet… the visibility intent should be aligned with the view graphics we have set up, and be able to modify them on the fly and the views change accordingly"). **Severity:** HIGH (architecture/maturity — not demo-blocking). **Owner queue:** view-intent / visibility agent (dedicated). **Audit row:** L-330. **Closes:** L-295.

**Confirmed state of the world (grep-verified):** `packages/visibility` ships a complete, pure, tested **11-wave visibility chain** (`w01LevelScope → w02CategoryVisibility → w03ViewTemplateInheritance → … → w09ElementHide → w10DesignOption → w11GhostLayer`, `runWaveChain`, `evaluateViewVisibility`), and its own header calls it *"the canonical runtime for live visibility evaluation."* **But `runWaveChain`/`evaluateViewVisibility` have zero call sites outside the package and its tests** — the engine is not wired into the app. The live view graphics are instead produced by a **separate, parallel path**: view definitions → `ViewVisibilityMap` (core-app-model, still carries `TODO(TASK-08)`) → `VGSceneApplicator.applyToProjectionLayers` (plan/elevation) + the symbol builders + the 3D scene-committer, plus a **deprecated** `vgGovernanceStore`/`applyVisibilityIntent` legacy reducer still consumed by element builders. So V/G edits don't flow through the intent SSOT, and the intent SSOT doesn't drive the views. The full port was **explicitly deferred to S49 / Phase 3A per ADR-0036** (the package header states this).

**Why this is architecture, not a bug:** the founder is asking for the intended C09/P7 end-state — visibility **intent** as the domain source of truth, view graphics as its projection, edits reactive on the fly. The building blocks exist; the wiring, the vocabulary unification, and the live reactivity do not. L-295 (V/G category-off doesn't remove the plan symbol — colon vs non-colon layer names in `VGSceneApplicator`) is one concrete leak that this port closes by construction.

**Contract mapping:** **C09** (AI & Visibility Intent — P7 intent ≠ UI state), **ADR-0036** (wave-chain phasing, S49/Phase-3A port), **ADR-0030** (VI legacy adapter to retire), **P6** (commands-only mutation — V/G edits are intents, not direct store writes), **P7**. Related: memory editable-living-graph-bim2-3 (the graph as a bidirectional edit surface is the same SSOT-drives-views principle).

| Phase | Work |
|---|---|
| **P1** | **Wave chain as the live per-view evaluator.** Build the adapter that feeds live element + view state into `runWaveChain`/`evaluateViewVisibility` and produces the per-view result (hidden / halftone / overrides). This is the one canonical evaluation, replacing the ad-hoc `ViewVisibilityMap` logic (which becomes a cache of the chain result, not a parallel authority). |
| **P2** | **V/G gestures become intents.** Every V/G edit — category toggle, element hide, halftone, filter override, phase filter, temporary isolation, ghost — dispatches as a visibility **intent** through the command bus (P6/P7), never a direct store write. The intent side-table is per-view. |
| **P3** | **Drawing layers consume the chain result.** `VGSceneApplicator.applyToProjectionLayers` reads the wave result; **unify the layer-name vocabulary** (colon vs non-colon) so `w02CategoryVisibility` and the symbol builders agree — this closes **L-295** by construction, not by a spot patch. |
| **P4** | **3D scene consumes the SAME result.** The scene-committer applies the identical per-view hidden/halftone/isolation output to the 3D scene (opacity/visibility), so plan, elevation, and 3D never disagree about what's visible. |
| **P5** | **Live reactivity.** An intent edit re-runs the chain only for affected views and updates their graphics on the fly (views subscribe to the intent side-table). Editing V/G in one open view updates that view immediately; other views recompute lazily on activation. |
| **P6** | **Persistence.** The per-view intent side-table serialises byte-stably (the `toJSON`/`fromJSON` round-trip already exists) and survives save/reopen. |
| **P7** | **Retire the parallel path.** Once builders + applicator read the chain result, delete `vgGovernanceStore`/`applyVisibilityIntent` legacy reducer and the ad-hoc `ViewVisibilityMap` authority. No parallel visibility path may remain (single-source invariant). |

**Guards:** toggling a category OFF in V/G removes it from BOTH plan and 3D **live**; hide/halftone/isolate reflect immediately across ALL open views; the intent persists + round-trips byte-stable; a static check asserts no non-test call path computes view visibility except through the wave chain.

**Why this ordering:** P1 establishes the single evaluator before anything consumes it; P2 makes edits flow as intents so the SSOT is actually driven; P3/P4 make both graphics surfaces read the one result (killing the disconnect and L-295 together); P5 adds the reactivity the founder asked for; P7 removes the parallel authority so the disconnect cannot silently return. This is a governed multi-phase port with live browser verification at P3–P5 — **not** a hot-wire. `SS-WIRE-VISIBILITY-INTENT-AS-LIVE-VIEW-GRAPHICS-SSOT`.


---

## L-331 — Heavy-scene WebGL-fallback renders blank: shadow-sampler / texture-format mismatch

**Reported:** founder, 2026-07-16. **Severity:** HIGH → downgraded (WebGPU confirmed good; this is the WebGL-fallback/survival-tier path only). **Owner:** render agent. **Audit:** L-331. **Coupled to:** L-332.

**Root:** on a heavy scene that trips the survival/performance tier, shadows are forced off and the shadow map deallocated (`shadowMapAllocated=false`) while ~13k meshes still declare `castShadow`; a shader still bound to a shadow sampler hits `GL_INVALID_OPERATION: Mismatch between texture format and sampler type (signed/unsigned/float/shadow)` → draw rejected → blank. WebGPU (primary backend) is unaffected and confirmed working; the fault is the WebGL2 fallback the device-loss cascade drops to.

| Phase | Work |
|---|---|
| **P1** | Reproduce on the WebGL2 fallback + survival tier; confirm it is the shadow-sampler binding (not a regression from L-312B/L-326 — bisect to be sure). |
| **P2** | When the tier turns shadows OFF + deallocates the shadow map, reconcile the materials so no shader samples a missing/mismatched shadow texture (recompile with a shadows-off define, or keep a correctly-formatted depth placeholder bound). Never issue a draw whose bound shadow texture format ≠ sampler type. |
| **P3** | Guard: the heavy scene on the WebGL2 fallback (survival tier, shadows off) renders non-blank with no format/sampler GL error. |

`SS-FIX-HEAVY-TIER-SHADOW-SAMPLER-MISMATCH`.

---

## L-332 — Saved office reopens as the grey envelope (L-321 not durable across load)

**Reported:** founder, 2026-07-16. **Severity:** HIGH. **Owner:** office/render agent (with L-331). **Audit:** L-332. **Coupled to:** L-331.

**Root:** L-321 pins `levelScoped3DCullingService.setMode('all')` inside `OfficeBuildingExecutor` (generation time only). On reopen the executor doesn't run, so the heavy office re-escalates to the massing LOD → grey blocks. The massing LOD is also what *avoids* the L-331 blank on the fallback — so fix L-331 first, then make full-detail durable, or reopening full-detail could blank instead.

| Phase | Work |
|---|---|
| **P1** | Persist a per-project "office full-detail" LOD/visibility intent (P7 — a domain intent, not a generation side-effect). |
| **P2** | Re-apply `setMode('all')` on `pryzm-project-loaded` for office projects (or gate the massing-LOD auto-escalation on the persisted intent). Only after L-331 lands. |
| **P3** | Guard: reopening a saved office shows the detailed tower (not grey massing), no blank; the LOD intent round-trips through save/reload. |

`SS-FIX-OFFICE-FULLDETAIL-DURABLE-ON-LOAD`.

---

# CATEGORY-READINESS LAUNCH-BLOCKERS (architectural) — L-334 / L-335 / L-336

Source: `reports/CATEGORY-READINESS-AUDIT-2026-07-16.md` (top-3 month-one risks). These are platform-hardening tasks on data integrity, collaboration correctness, and the multi-tenant access model — the two things this product category is judged on. Tracked here as first-class architectural work, not bugs.

## L-334 — Save/reload data-integrity hardening (Fix 1) — SS-FIX-LOAD-INTEGRITY-TRUTH-QUARANTINE-CHECKSUM
**Severity:** CRITICAL. **Contracts:** C05 (persistence), C47 §1.6 (forward-refuse), C48-adjacent, C10 (observability). **Extends:** L-333, L-269.

| Phase | Work |
|---|---|
| **P1 — Load-time truth** | `ProjectLoader.ts:1880`: a load with ANY dropped element reports PARTIAL/FAILED, not SUCCESS. Replace the 5 s toast with a persistent/blocking warning enumerating what was dropped. |
| **P2 — Whole-snapshot validation** | A validation pass on load BEFORE per-element re-creation that distinguishes "corrupt file" (parse/shape failure → hard fail) from "valid file, some elements incompatible" (per-element quarantine). |
| **P3 — Quarantine not discard** | Where an element is dropped, persist the RAW record to a quarantine store (recoverable by support) instead of console.warn-and-lose. Surface count + a recovery handle. |
| **P4 — Checksum** | Compute a digest at save (client + server-side on the stored blob) and verify at load; a mismatch is an explicit corruption error, not an inferred parse failure. |
| **P5 — Guard test** | A persisted project with ≥1 element that fails its current Zod validator → load surfaces a VISIBLE non-dismissible warning AND the raw element data is still retrievable afterward. Add before/after evidence to the FIX-VERIFICATION report. |

> 🔎 **CODE-VERIFIED 2026-07-18 (register reconciliation — settles the L-334/L-360 contradiction).** The P4 checksum (and the `SnapshotIntegrity` validation layer) was SHIPPED under Fix 1, then **REVERTED** by the L-360 fix — the current tree has **no checksum at all**. Repo-wide grep `SnapshotIntegrity|computeSnapshotChecksum|SnapshotChecksum|integrityHash` = **0 matches** in any `.ts/.js` (docs/reports only). No integrity digest is computed on save or verified on load: `SaveOrchestrator.ts` `getHash`/`lastHash` (:8/:317-319/:364-365/:507-527) is an in-memory dirty-check that skips no-op saves, **not** a persisted checksum; `ServerSyncQueue.ts` sends the snapshot verbatim; the server version-save `server.js:3186-3260` validates only `isValidProjectId` + a 50 MB size cap (:3213) + a `.passthrough()` Zod typing only the furniture array (:3250-3253); `ProjectSerializer.ts`/`ProjectLoader.ts` have 0 checksum/integrity matches. **Net: no corruption detection exists — P4 is un-done and the underlying data-integrity gap is OPEN again.** NOT shipped/ACTIVE; do not re-mark Fixed without RED/GREEN evidence. P1–P3 (load-truth/quarantine) status is UNVERIFIED pending live re-confirmation.

## L-335 — Real-time collaboration conflict-safety (Fix 2) — DECISION-GATED — SS-FIX-COLLAB-CONFLICT-SAFETY
**Severity:** CRITICAL. **Contracts:** C08 §3.1/§3.3 (P8 silent-LWW forbidden). **Ties:** L-53, L-206.

**GATE:** report the a-vs-b recommendation + effort estimate; DO NOT implement until the founder confirms the path.
- **(a)** Wire `SyncClient` providerFactory to a real transport (y-websocket or the existing socket.io channel); route ALL mutation types incl. bus-creates through the live CRDT; retire the JSON/LWW rebroadcast.
- **(b)** Per-field conflict detection on the CURRENT JSON path: moves/property-edits call `CRDTConflictResolver` (not raw overwrite); bus-dispatched creates added to the broadcast hook (closes L-206).

**Either path ends with:** a real two-client (or two-client-simulated) concurrent-edit test where two edits to the same element merge correctly OR surface a conflict — never silently overwrite.

**LAUNCH DECISION — THIS WEEK, not August (founder 2026-07-16).** Path (a) was chosen and Phases 1–2 (foundation) are shipped, but wiring it LIVE (Phase 3) is still gated. The launch-timing fork is now explicit:
- **(a-live)** Finish Path (a) Phase 3 — socket.io-tunnelled Yjs provider + `server.js` `YjsProjectCache` relay + retire the JSON/LWW path — so "real-time collaborative" is TRUE at launch.
- **(c) NARROW THE CLAIM** — if Phase 3 can't land safely before September, narrow the launch marketing to **single-user / basic-presence** (no "real-time collaborative multi-editing" claim) and ship real-CRDT post-launch. This removes the FALSE-ADVERTISING risk without blocking launch.
Do NOT let September arrive with this undecided. Owner: founder. Target: this week.

## L-336 — Non-owner project access (Fix 3) — SS-FIX-NONOWNER-PROJECT-ACCESS
**Severity:** CRITICAL. **Contracts:** C08 (auth + roles), C13.

| Phase | Work |
|---|---|
| **P1** | `server/projectAccess.js:96-137` — extend `canUserAccessProject` to consult `project_members` (role-aware: owner OR member) across all three source branches. |
| **P2** | Keep fail-closed + retryable-503 semantics intact — never fail open; a DB error still returns `allowed:false` + `retryable:true`. |
| **P3 — Guard test** | Test evidence (not code inspection): a user added as a MEMBER (not owner) can open the project via HTTP AND join the Socket.io room; a non-member is still denied. |


---

# DOC-ARCH READINESS GAPS (L-337 … L-351) — architectural plan

Source: `reports/DOC-ARCH-READINESS-SCORECARD-2026-07-16.md` (5-layer must-YES review; 3 YES / 8 PARTIAL / 9 NO of 20). Dominant failure mode: **documents (even CANONICAL) asserting capabilities the code does not provide**, plus **DRAFTs/runbooks describing tooling that does not exist**. Governance (CLAUDE.md): when code disagrees with a contract the code is wrong — so each item has exactly two honest resolutions: **build the capability, or correct the doc to the true state.** Sequenced in three tracks.

## Track C — VOCABULARY / PROCESS (do FIRST; unblocks honest gating)
| L | Work | Contracts |
|---|---|---|
| **L-347** | Define in C00 an **ACTIVE** status (= CANONICAL + code-matches + §6 CI gate green) and a **Tier-1** launch-blocking tier (C05/C08/C10/C13 + C48-min/C22-min). Add a **G0-CONTRACTS** gate to the G1-G10 board blocking launch until every Tier-1 contract is ACTIVE. | C00 status model; V1 gate board |
| **L-346** | Add **Owner + Target-date** columns to master-execution-tracker §3-§7; backfill open rows. | process |
| **L-338** | Add a **supported-scale ladder** to C10 §1 (<=10k supported / 10k-100k degraded / >500k out-of-scope). | C10 §1; engineering-vision §5.1 |
| **L-339** | Consolidate a **threat-model / security-posture** doc: promote SPEC-08 §9 → STRIDE + region data-flow + sub-processor list; index the security audits. | C08; SPEC-08 §9; ADR-0221 |

## Track A — HONESTY FIXES (this-week; pure doc edits, no new code capability)
| L | Work | Contracts |
|---|---|---|
| **L-337** | Raise an **ADR (or C05 §0)** naming ONE authoritative persistence format; reconcile the 3 contradictory `.pryzm` definitions (C05 §2.1 / pryzm-binary.md / C47 §2.3); close C47 §10.2 open-Q. **(also a real architectural decision — Track A+decision.)** | C05, C47, pryzm-binary.md, new ADR |
| **L-349** | **CRITICAL:** rewrite DR runbooks to the REAL hard-delete + version-history reality + a bold "recovery tooling not built" banner; document the real `errorId` key. | ops; ties C48 |
| **L-350** | Repoint dangling doc refs (`04-incidents`→`04-reference/runbooks`, `archive/pryzm3-internal/runbooks`→`04-reference/runbooks`). | docs |
| **L-343** | Retitle MISSING-CONTRACTS-AUDIT "RESOLVED/built" → "authored"; add impl-status column; keep C22/C48/C49 DRAFT. | governance |
| **L-348** | Spec status-vs-code sync (SPEC-AUTODIMENSION DRAFT→IMPLEMENTED, re-check SPEC-WALL-SINGLE-VOLUME-CSG); add "last code-synced" discipline. | specs |
| **L-340** (doc-half) | If L-335 merge is not landing pre-launch, **retract C08 Wave-A19 "Y.applyUpdate replaces LWW"** claim to the honest JSON-LWW state. | C08 §3.1 |
| **L-341** (doc-half) | If bench-CI not landing, **downgrade C10 §1/§4 "measured/merge-blocking"** language to "authored, not yet CI-gated". | C10 |

## Track B — CODE LIFTS (scheduled; build the real capability)
| L | Work | Contracts | Notes |
|---|---|---|---|
| **L-340** (code) | Land the real conflict/merge path — **= L-335 Path (a)** (Phase 1 done, commit 7a41d787). Makes C08 true. | C08; L-53/L-335 | already in flight |
| **L-341** (code) | Add a required CI job `bench:check` vs a committed baseline. Makes C10 true. | C10; ci.yml, ga-gate.mjs | |
| **L-342** | Close C13-G1..G7 teardown (`BatchCoordinator.forceReset()` + cancel wall-rebuild flags / `_wallRafHandle` / `_pendingWallEvents` / in-flight redetect on project-switch); flip §6 rows. | C13 §6 | |
| **L-344** | C48: build minimum DR (backup-worker + snapshot cadence + one automated restore test) OR honest-rewrite to nightly-snapshot+version-history (no PITR). | C48 | pairs with L-349 |
| **L-345** | C22 (EU blocker): minimum DSAR pipeline + data-tier tag + retention + CI gates OR honest-rewrite to residency-by-deployment + manual-DSAR SOP. | C22; C08 §8 | GDPR |
| **L-351** | Build the GUIDE layer: (a) real support runbook, (b) fix on-call + real-logs, (c) factual security one-pager + reconcile TrustPage, (d) developer/onboarding.md (two formats + two sync systems). | guides; ties L-337/L-335/L-349 | |

**Sequencing rationale:** Track C first (defines ACTIVE/Tier-1 so the rest can be gated + tracked with owners); Track A next (removes the *fiction* risk this week at zero code cost — the highest-leverage safety move); Track B scheduled against the September date, with L-340(code)=L-335 already underway and L-345(C22) the hard EU dependency.


---

## L-352 — Projects-hub stale-flash on first paint — SS-FIX-PROJECT-HUB-HYDRATION-NO-STALE-FLASH
**Severity:** P2 (perceived quality; P1-candidate on first-impression grounds — founder to confirm). **Type:** BUG. **Queue:** client boot/persistence (ProjectHub hydration).
**Contracts:** C02 §2/§115/§121 (boot + deferred-boot), C06 (PlatformRouter), C10 §1 NFT-1 (first-paint timing), C05 (local cache). **Coverage gap:** no spec governs hub hydration (logged to MISSING-CONTRACTS-AUDIT).

| Phase | Work |
|---|---|
| **P1 — Diagnose** | Confirm the two-paint sequence in `ProjectHub`/`PlatformRouter`: first paint from local cache, re-render on `Synced with server: N project(s)`. Confirm whether thumbnails are persisted locally (log shows placeholders → likely NOT). Confirm whether `PlatformShell`/runtime is composed against a default project on the `#/projects` route (C02 §121 check). |
| **P2 — Persist last-known-good (C05)** | Persist the project LIST + THUMBNAIL (data-URL or cache handle) to local storage so first paint has correct content, not placeholders. Network-first refresh in the background (aligns with the SW network-first cache discipline). |
| **P3 — Reconcile in place** | Replace the full-swap re-render with an in-place diff (add/remove/reorder cards) so the server sync patches the list without a visible content flip. |
| **P4 — Skeleton discipline (C02 §115)** | Show a skeleton ONLY when there is no cached list; never render stale placeholder cards as if real. |
| **P5 — Deferred-boot (C02 §121)** | If P1 confirms a PlatformShell/runtime is composed against a default project on the hub route, defer it — engine MUST NOT execute before a project is opened (renderer prewarm as a pure warm-up is acceptable; a project-bound shell is not). |
| **P6 — Guard test** | Warm-cache open of `#/projects` renders correct list + thumbnails on first paint with ZERO content swap; cold open = skeleton→content, never stale placeholders. Add to the perceived-perf/boot suite. |

**Shortcut explicitly rejected:** a spinner/skeleton over the whole hub until sync completes — hides the flash but delays all content and worsens perceived performance.


---

## L-353 — Gaussian Splatting product-strategy + architecture review (R&D) — SS-STRATEGY-GAUSSIAN-SPLATTING-REALITY-CAPTURE
**Severity:** P3 (strategy/R&D, post-V1). **Type:** NEW-FEATURE research (extends `spike-gaussian-splatting-photoreal-3d.md`). **Queue:** research / geospatial-reality-capture.
**Touches:** C04 (render/scheduling), C10 (perf budgets), C05 (persistence — new asset type), C13 (isolation), P2 (single-THREE-owner / renderer-three), ADR-0065 (pluggable geodata provider), SPEC-FORMA-SITE-VIEW, SPEC-GEODATA-ANALYTICAL-LAYERS. **Coverage gap:** no contract governs reality-capture assets (logged to MISSING-CONTRACTS-AUDIT).

> This is a strategy/research DELIVERABLE, not a build task. It is intentionally OFF the V1 critical path. The phases below are the research structure, to be executed by a dedicated strategy agent when capacity allows (note current session-limit constraint on subagents).

| Phase | Deliverable |
|---|---|
| **R1 — Product opportunity** | Lifecycle value map (site capture / heritage / progress / FM / inspection / scan-to-BIM / O&M): user · problem · value · ROI · frequency per use case. |
| **R2 — Workflow integration** | How splats combine with BIM+GIS+point-clouds+meshes; the capture→splat→georeference→overlay-BIM→review→progress→asset chain. |
| **R3 — Technical architecture** | Splats through renderer-three (P2), WebGPU, Cesium 3D-Tiles georeferencing; standalone vs streamed vs tiled; coexistence with IFC/GLTF/point-clouds/terrain; conversion-from-external vs in-browser generation. |
| **R4 — Authoring workflow + tooling** | Ideal pipeline; internal-generate vs integrate (Postshot / Luma / Polycam / Scaniverse / Nerfstudio / RealityCapture / OSS). |
| **R5 — UX** | Toggle reality-capture, BIM-vs-reality compare, progress time-slider, clip planes, measure, section, annotate, issues, AI inspection, mixed mesh+splat. |
| **R6 — Limitations + comparison** | Splat vs point-cloud vs photogrammetry-mesh vs LiDAR vs BIM vs 3D-Tiles: when to prefer each. |
| **R7 — Competitive + AI** | Bentley/Autodesk/NVIDIA/Cesium/Unreal/Unity/Luma/Polycam/Esri best-practices; highest-value AI (progress, defect, as-built-vs-design, quantity, safety, inventory, segmentation). |
| **R8 — Roadmap + recommendation** | Phase-1 view / Phase-2 collab / Phase-3 AI digital-twin (complexity · deps · value · impact · effort · deliverables); FINAL: core capability vs optional module vs specialized workflow, justified by long-term product strategy. |

**Architectural tensions to resolve (not blockers):** P2 single-THREE-owner (splat pass inside renderer-three, no parallel renderer); C10 + WebGPU device-loss family (stream/tile, never monolithic load); persistence of a new georeferenced asset type (C05).


---

## L-354 — Site-analysis credibility audit + provenance/confidence UI — SS-AUDIT-SITE-ANALYSIS-CREDIBILITY-PROVENANCE
**Severity:** P2 (trust; P1 sub-component = provenance/confidence labeling). **Type:** audit + gap + feature. **Queue:** environmental/geospatial analysis + data-provenance/UI.
**Touches:** C21-CLIMATE-INGESTION, ADR-0074 (solar), @pryzm/solar-analysis, SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS, SPEC-GEODATA-ANALYTICAL-LAYERS, ADR-0065, C18. **Coverage gap:** no contract governs analysis-layer provenance/confidence/units (logged to MISSING-CONTRACTS-AUDIT).

| Phase | Work |
|---|---|
| **P1 (P1-severity) — Provenance + honesty labeling** | For each layer (sun/wind/temp/population): surface source, method (measured/simulated/interpolated/estimated), units, resolution, accuracy, confidence, static/dynamic; label decision-grade vs INDICATIVE-ONLY. This is the pre-launch honesty minimum. |
| **P2 — Self-explanatory panel** | Legend + units + assumptions + date/time range + what's included (buildings/terrain) so colours are understandable without docs. |
| **P3 — Data-source validation** | Confirm actual sources (sun=raycast C21/ADR-0074; wind/temp/population=?) + confidence score per dataset; recommend more authoritative sources (Open-Meteo/Copernicus/WorldPop/gov-LiDAR). |
| **P4 — Advanced simulation roadmap** | Sun→solar radiation kWh/m²+PV; wind→CFD/Lawson; temp→UHI/UTCI; population→census/day-night. Phase by value. |
| **P5 — Missing analyses ranking** | Daylight, noise, flood, carbon, walkability, accessibility, view-corridors, tree-canopy, stormwater — ranked for architects/developers/gov. |

## L-355 — Forma 3D Site view: load-perf (P1) + provider-agnostic Context Engine (P2) — SS-FORMA-VIEW-PERF-AND-PROVIDER-AGNOSTIC-CONTEXT-ENGINE
**Severity:** P1 (load perf) + P2/P3 (context strategy). **Type:** BUG + strategy. **Queue:** geospatial/Forma-view (perf) + Context-Engine spike (strategy).
**Touches:** SPEC-FORMA-SITE-VIEW, ADR-0065, C04, C10 (+ heavy-scene/WebGPU-device-loss), C13; CesiumViewport forma path, contextBuildings, engineLauncher activation, BIM→GLB export. **Coverage gap:** no Context-Engine contract (MISSING-CONTRACTS-AUDIT).

| Phase | Work |
|---|---|
| **P1 (P1) — Diagnose the slow load** | Confirm from the log: the Forma 'REAL model' = a full BIM→GLB export (71 MB, 2574 elements) on EVERY activation, + heavy massing rebuild (39 bands, 920 openings, 78 stairs), + 4342 Overpass footprints — all synchronous. Attribute each cost. |
| **P2 (P1) — Get heavy work off the critical path** | Cache/incrementalise/worker-ize the BIM→GLB export (do NOT re-export the whole scene each activation); progressive camera-radius (~500 m) tiled context-building streaming; cache Overpass responses. |
| **P3 (P1) — Robustness + graphics review** | Keyless flat-ground/no-terrain state made explicit; device-loss safety on the heavy Cesium+WebGPU path (per the heavy-scene memory); graphics QA. |
| **P4 (P2 strategy) — Context Engine interfaces** | Provider-agnostic `TerrainProvider`/`ImageryProvider`/`BuildingProvider`/`VegetationProvider`/`RoadProvider` (extends ADR-0065) rendered THROUGH renderer-three (P2), streamed/tiled, EPSG-transformed. |
| **P5 (P2 strategy) — Adapters + fidelity tiers** | Adapters for Cityweft / Google Photoreal 3D Tiles / Cesium ion / Esri / OSM / gov-LiDAR; premium-where-available, open-fallback; DEM/DTM/DSM terrain, LOD2/3 buildings, orthophotos, instanced vegetation, extruded roads. Phased, evolving the current path (Cesium retained for globe-scale nav). |

**Shortcuts rejected:** L-355 — raise the load timeout / longer spinner (hides cost); L-354 — legends without provenance (hides the credibility problem).


---

# GEOSPATIAL / CONTEXT-ARCHITECTURE CLUSTER (L-353 · L-355 · L-356 · L-357)

These four items are ONE coherent workstream and must be planned together (not four independent tasks). **L-357 is the PARENT architecture decision** (should Canvas become GIS-aware; hybrid vs Cesium-only); it gates the rest. **L-355 (P1 perf) + L-356 (P2 perf) share a single root cause** — the BIM→GLB export (~69–71 MB) runs on the Cesium/Forma view-activation critical path — and should be fixed once. **L-353** (Gaussian Splatting) + the Context-Engine are downstream capabilities that plug into whatever L-357 decides. Shared architectural guardrails: P2 single-THREE-owner (all context rendering through renderer-three), C10 heavy-scene/WebGPU-device-loss budget, ADR-0065 pluggable-provider pattern, EPSG/ENU coordinate discipline.

## L-356 — Cesium 3D-tiles robustness + speed — SS-CESIUM-3DTILES-ROBUSTNESS-AND-SPEED
**Severity:** P2 (perf-hardening; view sound). **Queue:** geospatial/Cesium-view (shared with L-355).
| Phase | Work |
|---|---|
| **P1** | Cache/incrementalise the BIM→GLB export (shared with L-355 P2) — stop re-exporting the whole scene per activation. |
| **P2** | Eliminate the double massing render (place once after the photoreal-tile clamp resolves, not flat-then-reclamp). |
| **P3** | 3D-tiles LOD / screen-space-error + cache tuning; parallelise the anchor-retry chain with content load. |

## L-357 — Canvas GIS-awareness maturity + hybrid architecture (PARENT) — SS-CANVAS-GIS-AWARENESS-MATURITY-AND-HYBRID-ARCHITECTURE
**Severity:** P2/P3 (strategy — parent decision). **Queue:** GIS/geospatial architecture spike.
| Phase | Deliverable |
|---|---|
| **R1 — Maturity + feasibility** | Rate PRYZM Level 0-5 today (likely ~1.5: georef-in-Cesium, not yet streaming-GIS-in-Three.js); feasibility of native Three.js DEM/DTM/DSM/3D-Tiles/vector-tiles/CityGML/GeoJSON/CityJSON/point-cloud/orthophoto loading — libraries, coordinate transforms, limits. |
| **R2 — Coordinate authority** | Local engineering vs projected vs WGS84 vs ECEF vs ENU; recommend local-tangent-plane operation + stored global georef (confirm against the existing LTP-ENU/ECEF georef the Cesium path already uses). |
| **R3 — Terrain + context stack** | DEM-raster vs DTM/DSM-mesh vs streamed-tiles for an engineering platform; context-data stack comparison (Cityweft / Cesium-ion / Google-3D-Tiles / Mapbox / OSM / OpenTopography / national-LiDAR / gov-DSM-DTM) on quality/licensing/streaming/cost/accuracy. |
| **R4 — Rendering architecture recommendation** | Option A dual vs single Three.js GIS engine vs HYBRID; recommend with justification; MUST honour P2 single-THREE-owner. |
| **R5 — Roadmap + final assessment** | Phased roadmap (terrain+ENU → context-building streaming+3D-Tiles → DSM/DTM+clipping+shadow → city-scale+digital-twin+AI) with complexity/risk; biggest gap, biggest risk, easiest high-value win, path to Cityweft quality. Feeds the C-CONTEXT-ENGINE contract (MISSING-CONTRACTS-AUDIT). |


---

## L-358 — GLB-export cache invalidation (globe<->Forma round-trip) — SS-FIX-GLB-EXPORT-CACHE-INVALIDATION
**Severity:** P2 (real felt perf cost; NOT a launch-blocker). **Type:** BUG. **Queue:** geometry/export-perf (by root cause). **Status: FIX IN PROGRESS** (agent, 2026-07-16). **Shared root:** L-355 (P1 facet) + L-356. **Contracts:** C04, C10 (no view-activation NFT — secondary gap → L-359), C12.

| Phase | Work |
|---|---|
| **P1 — Correct the cache keying (PRE-LAUNCH-ELIGIBLE fast win — in progress)** | Memoize the exported GLB blob on `(computeBuildingSignature(), variant=plain\|formaWhite)`; invalidate ONLY on real geometry change, never on a view-mode switch. Evict/revoke stale-signature object-URLs. A globe↔Forma round-trip with unchanged geometry becomes a cheap re-placement, not a ~70MB re-export. |
| **P2 — Worker + diff export (FOLLOW-ON, separate)** | Move `exportFragmentsToGLB` off the synchronous activation path onto a Web Worker + a partial/diff export, so even a genuine geometry change doesn't stall on a full-scene 70MB serialization. |

**Shortcut vs correct:** P1 is NOT a shortcut — it fixes the actual defect (invalidate-when-nothing-changed). P2 is the complementary fuller fix for the changed-geometry case. Ship P1 now; schedule P2.

## L-359 — Author the C-CONTEXT-ENGINE contract (governance gap) — SS-AUTHOR-C-CONTEXT-ENGINE-CONTRACT
**Severity:** P3 (BACKLOG — explicitly NO September-launch pressure; documentation debt, not a launch risk). **Type:** GAP (missing contract). **Queue:** contract-authoring / architecture-documentation (not an engineering queue). **Consolidates:** the L-355 + L-357 missing-contracts gap notes.

> Documentation only at this stage. Do NOT begin Phase 1–4 GIS implementation from this item.

| Scope of the contract to author | Source |
|---|---|
| Coordinate authority (LTP-ENU local tangent plane + stored global georef) | spike §3 |
| GIS fidelity tiers (LOD1 vs LOD2/3; DEM/DTM/DSM) | spike §4/§6 |
| Provider model (ADR-0065-aligned Terrain/Imagery/Building/Vegetation/Road interfaces) | spike §6, ADR-0065 |
| Provenance / credibility bar | L-354 |
| Perf budget for context streaming + a view-activation NFT (the C10 gap from L-358) | L-358, C10 |

Gates the L-353 / L-355 / L-356 downstream work. No target date tied to launch.


---

## L-325 / L-181 — Project isolation on load (launch-breaker #4) — §FIX-PROJECT-2ND-OPEN-ISOLATION
**Severity:** CRITICAL (reputational — "I opened my project and saw someone else's data"). **Contracts:** C13 (isolation invariants), check:isolation CI, P8. **Mirrored here from the audit for doc symmetry (founder request).**

| Phase | Work | Status |
|---|---|---|
| **P1 — Switch-path** | `pryzm-project-switch` render-side reset. | ✅ SHIPPED (L-325, `e020fe18`) |
| **P2 — Origin-sphere leak** | Register `projectOriginStore` in `projectScopeRegistry`; re-seed on switch. | ✅ SHIPPED (L-181 partial, `3f8da8f8`) |
| **P3 — Load/2nd-open RESIDUAL (OPEN)** | The direct-load / 2nd-open leak (can't-create-elements + geometry bleeds from prior project) is NOT reduced to a specific defect by static analysis; the agent refused to ship a guess. **NEEDS FOUNDER LIVE PROD REPRO:** open A (batch-generate) → back → open/create B → capture the already-wired `ProjectIsolationAudit [CONTRACT 48 VIOLATION]` console line, which names the exact leaked surface (scene.bimElement vs window.globals + which store/mesh survived). Strong hypothesis: a batch/suppression latch left imbalanced when A ran a batch/AI op and the user navigated mid-settle. | 🟢 **FIX SHIPPED (L-342, `89145bd1`) — pending founder live confirm.** ROOT CAUSE FOUND: `ProjectLoader.load()` (the direct-open/version-restore chokepoint) only ran `ClearProjectCommand` (data stores) and never ran the pipeline teardown — only the SWITCH path did — so a leaked `_isBatching`/`_wallRebuildDiscarding` latch from an interrupted Project-A AI batch survived into B (walls stored-but-never-built → can't-create + geometry bleed). FIX: `ProjectLifecycleController.runTeardown('load')` now runs at the top of `ProjectLoader.load()` (idempotent, never-throws). 7/7 tests, tsc 0. |
| **P4 — Guard** | Test: open A → create/open B → assert B's scene is empty-but-initialised (origin present, 0 leaked elements from A, tools armed). | pending P3 |

**Related hardening (decision-free, reduces leak surface):** L-342 closes the C13-G1…G7 teardown gaps (BatchCoordinator.forceReset, wall-rebuild flags, rAF handles) — complementary to nailing the P3 residual.


---

## L-360 — L-334 checksum bricks valid projects (P0 REGRESSION) — SS-FIX-CHECKSUM-ROUNDTRIP-AND-NEVER-BRICK
**Severity:** P0. **Queue:** persistence. **Status: FIX IN PROGRESS.** **Introduced by:** L-334.

> 🔎 **CODE-VERIFIED 2026-07-18 (register reconciliation).** The brick mechanism is **no longer in the tree**: `SnapshotIntegrity.ts` / `computeSnapshotChecksum` and the `ProjectSerializer.ts:978-983` stamp + `ProjectLoader.ts` refuse-path do NOT exist in current source (repo-wide grep of `.ts/.js` = 0 matches; docs/reports only). The regression was resolved by **reverting the L-334 checksum entirely** rather than making it round-trip-stable (P1–P3 below un-executed as written) — so the `§L-334 CORRUPT snapshot … refusing to load` hard-refuse path cannot fire in the current code. This also removes L-334's corruption detection (net: no checksum either way). **Do NOT mark Fixed** — that a previously-bricked project now reopens is a RUNTIME claim, **UNVERIFIED** (needs live confirmation); this records only the static code reality.
| Phase | Work |
|---|---|
| **P1 — Confirm** | Real-codec round-trip test: `computeSnapshotChecksum(x) === computeSnapshotChecksum(codecRoundTrip(x))`? If not, the lossy/transforming codec is the false-positive source. |
| **P2 — Round-trip-stable checksum** | Compute + verify over the SAME representation (post-codec bytes, or post-round-trip snapshot). |
| **P3 — Never brick** | Checksum-mismatch → LOAD best-effort + loud warning + quarantine; hard-refuse ONLY for unparseable/forward-version. Unbricks existing corrupt-stamped projects. |

## L-361 — WebGPU batch-resi device-loss → browser GPU lockout (P0) — SS-FIX-WEBGPU-BATCH-RESI-DEVICE-LOSS-CASCADE
**Severity:** P0. **Queue:** render/renderer-three (WebGPU device-loss). **Contracts:** C04, C10, ADR-0089. **Reopens L-139.**

> **ROOT CAUSE CONFIRMED (2026-07-17).** The `THREE.TSL: Invalid generated code, expected a "float"` seed is a **non-finite `attenuationDistance` (THREE's `Infinity` default) on transmission glass**. On WebGPU a `MeshPhysicalMaterial` with `transmission > 0` (+ `thickness`) drives the Beer-Lambert volume TSL node, which reads `attenuationDistance`; a non-finite float breaks the WGSL generator → device loss. WebGL never runs the TSL path (why it is WebGPU-only — founder confirmed the identical 48-element batch renders clean on WebGL).
>
> **FIRST ATTEMPT DID NOT HOLD (b7348add).** It clamped `attenuationDistance` only in `ClearcoatMaterialUpgrader` — but residential Batch-AI mints its glass **directly** via `WindowBuilder.makeGlassMat` (and furniture builders), and `onSceneGeometryAdded` runs only the *PBR* upgrader, never the clearcoat/transmission one. So the LIVE batch glass kept the `Infinity` default and the crash persisted. This is the same "marked Fixed but incomplete" pattern as L-139 → do **not** mark Fixed again without human review of the diff + RED/GREEN evidence.

| Phase | Work | Status |
|---|---|---|
| **P1 — Direct transmission factories (the real seed)** | Clamp `attenuationDistance` finite at the 4 direct glass factories: `WindowBuilder.makeGlassMat` (the batch-AI culprit), `WardrobeEngine`, `TableBuilder`, `Plant06Builder`. Backend-agnostic + visually lossless (white attenuation at 1e4 m = no perceptible tint); transmission glass stays ON. | **DONE — awaiting human review + deploy** |
| **P1b — Shared chokepoint (anti-recurrence)** | New `@pryzm/renderer-three/materials` → `transmissionSafe()` + `FINITE_ATTENUATION_DISTANCE`; all 4 factories route through it (not hand-written inline values). | **DONE** |
| **P1c — Loud signal for the next builder** | Static CI guard test (`renderer-three/src/materials/__tests__/transmissionSafe.guard.test.ts`) scans packages/plugins/apps and fails if any `MeshPhysicalMaterial` sets `transmission` without `transmissionSafe(`. Proven RED (WindowBuilder line 120 named) → GREEN (8/8). This is the regression test missing from the first attempt. | **DONE** |
| **P1d — Upgrader gate call-site (defense-in-depth)** | `VisualizationEnginePanel.ts:594` now passes `webGpuActive` into `setClearcoatUpgrade` so the already-plumbed upgrader gate engages. NOT the batch-AI cause — the manual clearcoat toggle only. | **DONE** |
| **P2 — CW PSO / shadow storm** | Curtain-wall PSO + repeated SHADOW_REBUILD storm on batch creation at ~8000 meshes (extends L-312B); coalesced via §FIX-BATCH-SHADOW-REBUILD-STORM (ce45d895) — perf, not the crash. | Partial (perf) |
| **P3 — Graceful terminal (keep)** | §GPU-DISABLED-GRACEFUL-BOOT overlay already correct; a page refresh does NOT clear the browser GPU lock — only a full browser restart. | Correct as-is |
| **Follow-up (out of this fence)** | `GLBExporter.getGlass()` (`transmission:0.85`) also lacks the finite clamp — OFFLINE export path, not the live WebGPU renderer, so no device-loss during editing. Route through `transmissionSafe()` when file-format is next touched. Also: consolidate `ClearcoatMaterialUpgrader`'s private `FINITE_ATTENUATION_DISTANCE` onto the shared constant. | Backlog |
| **Workaround (now)** | WebGL backend for batch generation on this Windows box — but a full browser CLOSE is required first if a prior WebGPU crash already locked the tab's GPU (§L-324 terminal state). | — |

## L-362 — Auto-WebGL fallback for heavy scenes (Auto backend mode) — SS-AUTO-WEBGL-FALLBACK-HEAVY-SCENES
**Severity:** P0 mitigation (for L-361). **Queue:** render/renderer-three. **Contracts:** C04 §1.4, C10. **Decision:** ADR-0267. **Reuses:** ADR-0077 live-swap + ADR-0076 toggle. **Complements:** ADR-0089 recovery. **Status: IMPLEMENTED — awaiting live WebGPU confirmation.**

> **Approach.** Founder-approved: stop sending heavy scenes to WebGPU on hardware that TDRs on the heavy PSO storm (L-361) instead of chasing per-trigger seeds. Change ONLY the adaptive **Auto** mode; explicit WebGPU / WebGL are always respected; the reactive device-loss recovery (ADR-0089) stays as the net.

| Phase | Work | Status |
|---|---|---|
| **P1 — Shared heuristic** | Export `isHeavyModel(levelCount, elementCount)` from `LevelScoped3DCullingService` (≥ 15 levels AND ≥ 1000 elems, OR ≥ 4000 elems) as the single source of truth for "device-loss-risk", reused verbatim by the swap guard. | **DONE** |
| **P2 — Proactive swap guard** | New `apps/editor/src/rendering/autoWebGLHeavyScene.ts` → `maybeAutoSwitchToWebGLForHeavyScene(scene, reason)`: gates Auto-only + real-WebGPU (`status.webGpuActive`) + `isHeavyModel` + once-per-session (module guard set before the async swap, mirrored to `globalThis.__pryzmAutoSwappedToWebGL`), then fires the existing `window.pryzmSwapRendererBackend('webgl')`. P8 span `pryzm.renderer.auto-webgl-heavy`. | **DONE** |
| **P3 — Batched hook (proactive)** | Call the guard from `BatchCoordinator.setGpuCompileStartCallback` (`initBatchLifecycle.ts`) — fires with the scene fully populated but BEFORE `endBatchRenderSuppress` / any render; the swap's synchronous loop-stop beats the WebGPU PSO storm. Covers office / apartment / CW / slab. | **DONE** |
| **P4 — Non-batched hook** | Call the guard from `runTierPbrPass` (`initScene.ts`) — the residential-building pipeline adds geometry outside batches, so its heaviness only surfaces on the per-add tier pass (an ordinary live swap; rendering is live). | **DONE** |
| **P5 — Explicit-override respect** | `pref === 'webgpu'` on a heavy scene logs a one-time "respecting override, NOT switching" warning and never swaps. `pref === 'webgl'` / WebGL2-fallback → no-op. | **DONE** |
| **P6 — Docs** | ADR-0267; C04 §1.4 Known-behavior amendment; L-362 audit + this plan entry. | **DONE** |
| **Verify (live)** | Founder's WebGPU box: Auto + heavy resi/office batch → one `§AUTO-WEBGL-HEAVY` swap → renders clean on WebGL; explicit WebGPU → override honoured (may still device-loss → recovery net); light scene → stays WebGPU. **Not marked Fixed until confirmed.** | Pending |

## L-363 — Re-apply L-319 TSL-init guard (ScenePass-TSL-not-loaded on batch autoEnablePerf) — SS-FIX-TSL-NOT-LOADED-BEFORE-SCENEPASS-REAPPLY
**Severity:** P0 (light-scene WebGPU path). **Queue:** render/renderer-three. **Contracts:** C04 §1.4. **Cross-ref:** ADR-0267 (Auto-WebGL). **Status: RE-APPLIED — awaiting live WebGPU confirmation.**

> **Approach.** The #1110 rollback (base `26a165bd`) removed the L-319 guard (originally in `ec36b556`, co-bundled with L-314 + L-331). Re-apply ONLY the L-319 slice so a batch's `autoEnablePerf → _setSsgi → _fullRebuild → createScenePass()` landing in the `bind()` window (`_webGpuActive = true` set before `_loadTSL()` resolves) no longer throws the "TSL module not loaded" loop. This hardens the NON-swapped light-scene WebGPU path — Auto-WebGL (L-362/ADR-0267) only diverts HEAVY scenes to WebGL, so light WebGPU scenes still hit this path. **L-314 first-load-shadow-reattach stays ABSENT** (it caused the WebGPU shadow-rebuild device-loss regression).

| Phase | Work | Status |
|---|---|---|
| **P1 — TSL-loaded predicate** | Add `_tslLoaded` getter (`!!globalThis.__PRYZM_TSL__`) to `RenderPipelineManager.ts`. | **DONE** |
| **P2 — Guard every createScenePass caller** | Short-circuit `_buildPipeline` / `_buildPhase3Pipeline` / `_fullRebuild` with a warn when `!_tslLoaded`. `bind()` still awaits `_loadTSL()` before its own `_buildPipeline()`, so the guard only defers an EARLY external trigger until TSL resolves. | **DONE** |
| **P3 — L-314 stays absent** | Verified NO `_maybeReattachFirstLoadShadow` / `_firstLoadShadowReattachPending` / `FIRST-LOAD-SHADOW-REATTACH` code re-introduced. | **DONE** |
| **Verify (types)** | renderer-three typecheck 0, root tsc `--skipLibCheck --noEmit` 0. | **DONE** |
| **Verify (live)** | Founder's WebGPU box: batch resi-gen on a light WebGPU scene no longer spams `[ScenePass] TSL module not loaded`. **Not marked Fixed until confirmed.** | Pending |

## L-364 — Re-apply §L-361-WEBGPU-TRANSMISSION-GUARD (transmission-glass expected-float on WebGPU) — SS-FIX-L361-WEBGPU-TRANSMISSION-GUARD-REAPPLY
**Severity:** P0 (light-scene WebGPU path). **Queue:** render/renderer-three. **Contracts:** C04 §1.4. **Cross-ref:** ADR-0267 (Auto-WebGL). **Status: RE-APPLIED — awaiting live WebGPU confirmation.**

> **Approach.** The #1110 rollback removed the transmission guard (originally in `715a222d`). Re-apply the `_neutralizeTransmissionForWebGPU()` method + its `setShadowPassDisabled` hook so the transmission-glass `MeshPhysicalNodeMaterial` node graph (which emits invalid WGSL on three r183's WebGPU backend during `_renderTransparents` PSO compile → device loss, independent of finite floats) is never emitted on real WebGPU. Hardens the same NON-swapped light-scene WebGPU path as L-363. The co-bundled `_diagScanTransmissionFloats` diagnostic and the L-314-tied REGRESSION-GATE were SKIPPED (L-314 is absent here).

| Phase | Work | Status |
|---|---|---|
| **P1 — Transmission neutralizer** | Add `_neutralizeTransmissionForWebGPU()`: on `_webGpuActive` only, traverse the scene, set `transmission = 0` + `transparent = true` + opacity fallback (0.5 if opaque) + `needsUpdate` on every `MeshPhysicalMaterial` with `transmission > 0`. Idempotent; best-effort (never throws into the pipeline). | **DONE** |
| **P2 — Batch-boundary hook** | Call it from `setShadowPassDisabled(reason, disabled)` when `disabled && reason === 'batch'` — the moment just before the resi-batch PSO compile. WebGL is untouched (gated on `_webGpuActive`) and keeps full refractive glass. | **DONE** |
| **Verify (types)** | renderer-three typecheck 0, root tsc `--skipLibCheck --noEmit` 0. | **DONE** |
| **Verify (live)** | Founder's WebGPU box: batch resi-gen on a light WebGPU scene no longer emits `THREE.TSL: Invalid generated code, expected a 'float'` in `_renderTransparents`. **Not marked Fixed until confirmed.** | Pending |

## L-365 — Map verified Cesium 3D-Tiles globe placement into ADR + contract + spec — SS-MAP-CESIUM-3DTILES-GLOBE-PLACEMENT-BASELINE
**Severity:** DOCS / governance (VERIFIED-WORKING baseline, not a defect). **Queue:** docs / geospatial. **Contracts:** C12 §7 [new] + §1.4. **Decision:** ADR-0268 [new]. **Spec:** SPEC-FORMA-SITE-VIEW §11 [new]. **Baseline:** `snapshot-cesium-3d-globe-working-2026-07-17`. **Status: DOCUMENTED — behavior VERIFIED WORKING live on Fly (2026-07-17).**

> **Approach.** The photoreal 3D-Tiles building placement is confirmed sound end-to-end on Fly (anchor = LTP-ENU origin at LAT 40.420070/LON -3.705955, anchor↔LTP 0.0 m; base 706.90 m ELLIPSOIDAL via photoreal-tile-clamp; seat-and-reveal; §FORMA-FULL-HEIGHT full tower; CesiumThreeBridge camera-only coexistence). This item pins that known-good behavior into the canonical governance docs so it stays permanent + regression-testable against the snapshot tag. DOCS ONLY — no code changed.

| Phase | Work | Status |
|---|---|---|
| **P1 — ADR** | New `ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md`: the georeferenced-placement decision (D1 LTP-ENU anchor · D2 photoreal-tile-clamp datum · D3 seat-and-reveal · D4 §FORMA-FULL-HEIGHT · D5 CesiumThreeBridge coexistence · D6 frame-once) with Context/Decision/Consequences/Alternatives, §-tags + file:line, baseline tag. | **DONE** |
| **P2 — Contract** | C12 §7 (new normative section) — the georeferencing invariant (anchor == LTP-ENU origin; ground datum via photoreal-tile-clamp when no terrain provider; seat-and-reveal ordering; base height ELLIPSOIDAL WGS-84 not AMSL; full-height massing; camera-only coexistence; frame-once). Marked **Known-good ACTIVE** with live evidence; links ADR-0268. §6 history row added. | **DONE** |
| **P3 — Spec** | SPEC-FORMA-SITE-VIEW §11 — the step-by-step reproducible globe placement pipeline (activate → CesiumThreeBridge → GLB export → renderRealModelOnGlobe → photoreal-tile-clamp datum → seat-and-reveal → full-height → frame → anchor-evidence log) + the verified-good baseline table. | **DONE** |
| **P4 — Audit** | L-365 logged in V1-LAUNCH-READINESS-AUDIT §2 as VERIFIED WORKING (snapshot tag + live-run evidence). | **DONE** |
| **P5 — Index** | C00 contract README C12 row updated to note §7 + ADR-0268. | **DONE** |
| **Verify** | DOCS deliverable — behavior already confirmed working live by the founder; no live re-run required. Regression baseline = snapshot `snapshot-cesium-3d-globe-working-2026-07-17`. | **DONE** |

## L-366 — Auto-WebGL heavy-scene fallback: lower swap threshold + harden transmission guard + explicit-pin fallback — SS-AUTO-WEBGL-FALLBACK-THRESHOLD-AND-EXPLICIT-PIN
**Severity:** P0 (RENDER, WebGPU device-loss). **Queue:** render/renderer-three. **Contracts:** C04 §1.4. **Decision:** ADR-0267 (amended §Fix-1/§Fix-2/§Fix-3). **Cross-ref:** L-361, L-362, L-364 (§L-361-WEBGPU-TRANSMISSION-GUARD). **Status: IMPLEMENTED — awaiting live WebGPU confirmation.**

> **Approach.** Live Fly runs proved the ADR-0267 Auto-WebGL mitigation did not fire for real buildings: (§Fix-1) the swap reused the massing-LOD `isHeavyModel` gate, calibrated far too high — a ~1,300-elem / 6-level / ~1,645-mesh residential building never tripped it and device-lost on WebGPU; (§Fix-2) the transmission guard's only caller is `setShadowPassDisabled('batch', true)`, which fires only inside a batch, but the resi/office generators add glass OUTSIDE batches, so glass reached the first WebGPU render un-neutralized; (§Fix-3) a 29-level / 2,115-elem / ~12,700-mesh office tower on an EXPLICIT WebGPU pin was "respected" straight into a device loss. Founder expectation: heavy scenes fall back to WebGL regardless of the toggle.

| Phase | Work | Status |
|---|---|---|
| **P1 — §Fix-1 dedicated threshold** | `autoWebGLHeavyScene.ts`: new `isSwapWorthyHeavyScene(elementCount, sceneMeshCount)` — swap when **≥ 400 elements OR ≥ 1000 meshes**, decoupled from `isHeavyModel` (import removed). `initScene.ts` `runTierPbrPass` threads the live `meshCount`. Catches a ~1,300-elem / ~1,645-mesh building with margin; ignores a < 100-elem manual edit. `isHeavyModel` unchanged (massing LOD keeps its high gate). | **DONE** |
| **P2 — §Fix-2 transmission guard on non-batched path** | `RenderPipelineManager.ts`: public `neutralizeTransmissionForWebGPU()` wrapping the private neutralizer (real-WebGPU-gated + idempotent). `initScene.ts` `runTierPbrPass` calls it on every non-batched geometry add (same seam as the Auto-swap), so glass is neutralized before the first post-generation WebGPU render. `globals.d.ts` typed. WebGL untouched. | **DONE** |
| **P3 — §Fix-3 explicit-pin heavy fallback** | `autoWebGLHeavyScene.ts`: swap fires for BOTH `auto` AND explicit `webgpu` on device-loss-risk scenes (one swap/session, distinct warning + "Re-pick WebGPU to override"). Explicit-WebGPU override now honoured ONLY for light scenes; explicit `webgl` still no-op. Removed the obsolete `_explicitWarnDone` throttle. | **DONE** |
| **P4 — Docs** | ADR-0267 amended (§Fix-1/§Fix-2/§Fix-3 blocks + Decision/Consequences/Verification updated: explicit override now applies to LIGHT scenes only). L-366 audit row + this plan entry. | **DONE** |
| **P5 — Typecheck** | Root `tsc --skipLibCheck --noEmit` 0 errors; `@pryzm/renderer-three` typecheck 0. | **DONE** |
| **Verify (live)** | Founder's WebGPU box: resi building (Auto AND explicit-WebGPU) → one `§AUTO-WEBGL-HEAVY` swap → renders clean on WebGL; office tower explicit-pin → swaps with the "despite the explicit WebGPU pin" warning; a light scene on explicit WebGPU still keeps WebGPU; a small manual edit never swaps. **Not marked Fixed until confirmed.** | Pending |

## L-367 — Proactive start-of-generation WebGL swap + ONE continuous loading overlay for building generation — SS-PROACTIVE-START-SWAP-AND-CONTINUOUS-GEN-OVERLAY
**Severity:** P1 (RENDER + loading UX). **Queue:** render/renderer-three + loading-UX. **Contracts:** C04 §1.4, C10; §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270). **Decision:** ADR-0267 (amended — start-of-generation proactive-swap refinement). **Cross-ref:** L-361, L-362, L-366. **Status: IMPLEMENTED — awaiting live WebGPU confirmation.**

> **Approach.** Live Fly run after L-366: the Auto-WebGL swap now FIRES but MID-generation (the L-366 gate can only trip once geometry exists), so the first heavy WebGPU sub-batch still renders — a lingering `THREE.TSL: Invalid generated code, expected a "float"` flash + an ~11 s `FIRST-RENDER-POST-SUPPRESS … WebGPU PSO compile LONGTASK` stall precede the swap to `WebGPU: false`. And the loading modal cycles Preparing→Done→Preparing→Done, once per sub-batch, because the ref-counted overlay is opened+ended per sub-batch. FIX A: for a KNOWN heavy building command (residential/office/house) swap PROACTIVELY at generation START, before the first heavy render. FIX B: hold ONE continuous overlay across the whole generation. Both funnel through one lifecycle hook.

| Phase | Work | Status |
|---|---|---|
| **P1 — FIX A proactive swap** | `autoWebGLHeavyScene.ts`: new `proactivelySwitchToWebGLForBuildingGeneration(reason)` — skips Gate 3 (the caller asserts a known heavy building generation) but keeps Gates 1/2/4; the swap-firing tail refactored into a shared `fireSwapToWebGL(reason, explicitPin, diag)` reused by both the reactive and proactive paths, sharing the `_autoSwapDone` once-per-session guard so they never double-swap. The reactive threshold path (initBatchLifecycle gpu-compile-start + initScene tier pass) stays the fallback for scenes that go heavy without a known command. | **DONE** |
| **P2 — FIX B continuous overlay** | NEW `apps/editor/src/ui/generation/buildingGenerationLifecycle.ts`: `beginBuildingGeneration(reason,{title,label})` opens ONE outer `LoadingOverlayController` session so the ref-count never hits zero between sub-batches (per-sub-batch sessions still layer on top + drive live progress); released at the true end via a batch-idle SETTLE (6 s quiet after `pryzm-batch-ended` drains to zero — mirrors SaveOrchestrator §AUTOSAVE-BATCH-SUPPRESS), an explicit `endBuildingGeneration()`, and a hard 6-min cap (the overlay can never get stuck). | **DONE** |
| **P3 — Generator hooks** | `ResidentialBuildingExecutor.ts` / `OfficeBuildingExecutor.ts` / `HouseLayoutExecutor.ts`: `beginBuildingGeneration(...)` at the structural-batch boundary (after guards + level minting, before the first heavy sub-batch renders). `runHousePostGenChain.ts`: `endBuildingGeneration()` in its `finally` (the house's precise async terminus — the settle/cap cover resi/office + are the house safety net). NON-generation edits are untouched (no lease → per-batch overlay behaves as today). | **DONE** |
| **P4 — Docs** | ADR-0267 amended (start-of-generation proactive-swap refinement + two-entry-point model). L-367 audit row + this plan entry. | **DONE** |
| **P5 — Typecheck** | Root `tsc --skipLibCheck --noEmit` 0 errors. | **DONE** |
| **Verify (live)** | Founder's WebGPU box: start a resi/office/house generation → `§AUTO-WEBGL-HEAVY-PROACTIVE … switching WebGPU→WebGL up front` logs BEFORE any geometry renders, NO TSL flash / PSO stall, and NO reactive `§AUTO-WEBGL-HEAVY` line after; ONE continuous overlay for the whole generation (no Preparing→Done cycling); a single manual batch still shows its own overlay. **Not marked Fixed until confirmed.** | Pending |

## L-368 — Collapse Forma context-buildings to a SINGLE Overpass fetch (near+far split client-side) — SS-PERF-CTX-SINGLE-OVERPASS-FETCH
**Severity:** P2 (PERF / GIS). **Queue:** perf / geospatial (Forma context). **Contracts:** C12-GEOSPATIAL (§context-fetch note — new; closes the gap that NO contract governed context-fetch latency). **Decision:** ADR-0088 §OVERPASS-GENTLE-MIRRORS (preserved). **Cross-ref:** L-187 (§FEAT-FORMA-CONTEXT-EXTENT-LOD far ring), L-273 (persistent cache), L-323 (in-flight dedup). **Status: IMPLEMENTED — awaiting live confirmation.**

> **Approach.** Live Fly trace showed the 3D-Site/Forma context did THREE serial Overpass round-trips before neighbours drew: (1) `fetchContextBuildings` awaited a WIDE 0.008° tile first and only on a transient **0** awaited the NARROW 0.005° fallback (the wide returned 0 — transient, NOT size; the 0.016° superset returned 11,868 — the narrow 2,163; empty results are never cached, so the wasted wide call recurred every visit); (2) the FAR ring (0.016°) is a strict SUPERSET yet was a SEPARATE fetch; (3) the far ring was fired fire-and-forget only AFTER the near round-trip + render. FIX A collapses all three into ONE far-extent fetch split near/far client-side, which subsumes FIX B (far no longer waits on a separate near round-trip) and FIX C (the wide-first-0 recurring waste is gone).

| Phase | Work | Status |
|---|---|---|
| **P1 — Single far-extent fetch** | `contextBuildings.ts`: new `fetchContextBuildingsNearAndFar(lat,lon,signal,cap)` does ONE `fetchForBbox(0.016°)` (reusing the in-flight dedup + gentle-mirror race + proxy/localStorage cache), then splits client-side. Safety fallback: a genuinely-0 far tile falls back ONCE to the narrow 0.005° extent (far empty) — never the old wide-first storm. Honours the abort signal throughout; never throws. | **DONE** |
| **P2 — Near/far client-side split** | New pure `selectNearFootprints({farFeatures,nearBbox})` — footprints whose centroid falls inside the 0.008° near bbox (extruded+shadows). Reuses existing `selectFarRingFootprints` for the far annulus (superset minus near disc, dedup by osmId, nearest-first, cap 900, flat/shadowless). The two are the exact complement — no overlap, no gap. `fetchContextBuildings` (2D map + tests) now delegates to `.near`, eliminating its wide-first-0 serial call. | **DONE** |
| **P3 — CesiumViewport render** | `loadContextBuildings` calls `fetchContextBuildingsNearAndFar`, renders `near` the instant the single fetch resolves, then renders `far` from the SAME data via the render-only `renderContextBuildingsFarRing(far,…)` (was the fetch+abort `loadContextBuildingsFarRing`). Dropped the now-vestigial `contextBuildingsFarAbort` (the single fetch is cancelled by `contextBuildingsAbort`). | **DONE** |
| **P4 — Tests** | `contextBuildingsLod.test.ts`: +`selectNearFootprints` coverage (centroid-in-near-bbox) and a partition test proving near+far are the exact complement (no overlap, cover every input once). Existing `overpassMirrorThrottle` / `contextOverpassInFlightDedup` / `contextBuildingsCacheQuota` kept green. **19/19 pass.** | **DONE** |
| **P5 — Docs** | C12-GEOSPATIAL §context-fetch note (single-far-extent strategy — closes the ungoverned-latency gap the investigation flagged). L-368 audit row + this plan entry. | **DONE** |
| **P6 — Typecheck** | Root `tsc --skipLibCheck --noEmit` 0 errors. | **DONE** |
| **Verify (live)** | Founder's Fly run: open the 3D-Site/Forma view on a site → the context neighbours draw after ONE Overpass building fetch (`[gis] §PERF-CTX-SINGLE-FETCH near+far from ONE 0.016° fetch: …`) with NO `wide bbox returned 0 … retrying the narrower fallback` line; a repeat visit to the same site hits the localStorage cache with ZERO Overpass calls. **Not marked Fixed until confirmed.** | Pending |

## L-369 — Building-generation speed: gate hot per-element logs + raise wall-rebuild budget + single end-of-generation redetect — SS-GEN-PERF-LOG-GATE-DRAIN-BUDGET-SINGLE-REDETECT
**Severity:** P1 (PERF). **Queue:** perf / generation. **Contracts:** C10-PERFORMANCE-AND-OBSERVABILITY (§generation-perf note — new: log-gating + rebuild-budget + single-redetect). **Cross-ref:** L-63 (§FIX-ROOMREDETECT-NOPROGRESS-GUARD), L-367 (`buildingGenerationLifecycle`), ADR-0069 (graph-authoritative rooms), §LOAD-REDETECT-FREEZE (the `__pryzmProjectLoadActive` log-gate pattern reused). **Status: IMPLEMENTED — awaiting live confirmation.**

> **Approach.** A live resi-building generation WORKS on the WebGL fallback (post-L-367) but takes tens of seconds for ~580 elements. Profiled to three sinks: (1) a flood of hot per-element `console.log`s (`[BimManager] Registered element`, `[WallOccupancyStore] canPlace OK`, `[RoomFinishSyncService] Synced/Propagated`, `[WallFragmentBuilder] RAF_DRAIN`) — each `console.log` blocks the main thread with DevTools open; (2) the wall drain built only ~16 walls/frame so 192 walls took ~12 frames; (3) the RoomTopologyObserver armed wasteful per-sub-batch auto-redetects between sub-batches, tripping the L-63 circuit-breaker 40–56×. Implemented the SAFE, measurable top wins; deliberately did NOT restructure the sub-batch chain / CRDT-blackout handling.

| Phase | Work | Status |
|---|---|---|
| **P1 — Generation-active flag** | `buildingGenerationLifecycle.ts`: the generation lease publishes `globalThis.__pryzmBuildingGenActive = true` for the WHOLE generation (all sub-batches) and clears it in `release()`. Lower layers read it via `globalThis` (no import — mirrors the existing `__pryzmProjectLoadActive` seam), so no layering violation. | **DONE** |
| **P2 — Gate hot per-element logs** | Suppress (only while a load OR generation is in flight; interactive edits still log) the per-element loggers: `BimKernel.ts` register/unregister, `WallOccupancyStore.ts` canPlace-OK, `RoomFinishSyncService.ts` per-element Synced + per-room Propagated, `WallFragmentBuilder.ts` per-frame RAF_DRAIN. Per-sub-batch SUMMARY lines (e.g. `[resi-building] … N punched`) are untouched. | **DONE** |
| **P3 — Raise wall-rebuild batch budget** | `WallFragmentBuilder._drainBuildQueue`: during a batch drain (renders suppressed → pure geometry) raise the per-frame FLOOR to 32 BEFORE the splice (first frame already builds a chunk), ramp +8/cheap-frame, cap 40→64. The `frameMs > 20` back-off + cap bound a single frame; interactive edits keep the 15-floor/±1 ramp. | **DONE** |
| **P4 — Single end-of-generation redetect** | `RoomTopologyObserver._scheduleRedetect` + `_executeRedetect`: additive guard mirroring the existing `isBatching` check — suppress observer AUTO-redetects while `__pryzmBuildingGenActive`. Explicit `ReDetectRoomsCommand`s (house pre-naming) bypass the observer; graph rooms come from `BatchCreateRoomsCommand`. `release()` fires ONE `scheduleRedetectAllLevels` sweep at the true end (no-op on graph-authoritative levels, safety net for any non-graph level). | **DONE** |
| **P5 — Docs** | C10-PERFORMANCE-AND-OBSERVABILITY §generation-perf note; L-369 audit row + this plan entry. | **DONE** |
| **P6 — Typecheck + tests** | Root `tsc --skipLibCheck --noEmit` 0 errors. `@pryzm/geometry-wall` 259, `@pryzm/core-app-model` 453, `@pryzm/room-topology` 59, editor redetect suite 14 — all green. | **DONE** |
| **Deliberately NOT touched (follow-ups)** | §E1-CRDT-BLACKOUT ~8.6 s/sub-batch handling; the sub-batch chain structure; the SlabFragmentBuilder / CurtainWallBuilder drain budgets (same batch-floor pattern would help but out of scope / higher risk). | Reported |
| **Verify (live)** | Founder's Fly run: generate a resi/office/house building on the WebGL fallback → the per-element log flood is ABSENT, wall drains take far fewer frames, NO `redetect circuit-breaker TRIPPED` during the generation, ONE redetect sweep at the end, and rooms/finishes still land correctly. **Not marked Fixed until confirmed.** | Pending |

## L-370 — Frame the globe building AFTER the ground datum resolves (re-frame on a large base jump) so no manual zoom is needed — SS-GLOBE-STALE-FRAME-REFRAME
**Severity:** P2 (GIS). **Queue:** gis / globe-framing. **Contracts:** ADR-0268 (D6 §GLOBE-STALE-FRAME-REFRAME note), C12-GEOSPATIAL §7 ("frame once, no jump" MUST refined). **Cross-ref:** §GLOBE-FRAME-NO-JUMP (the small-settle protection preserved), §GLOBE-FIT-BUILDING, §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF / L-259 (seat-and-reveal), §A.21.D49 (real-model-on-globe). **Status: IMPLEMENTED — awaiting live confirmation.**

> **Approach.** Live log: the photoreal "3D globe" frames the building EARLY at base 0, then the Google-tile datum resolves LATE and the building JUMPS up ~706.9 m to seat on the tiles; the corrective re-frame is SUPPRESSED because the user already nudged the empty base-0 view (`§GLOBE-FRAME-NO-JUMP — … suppressing the corrective re-frame`), so the camera stays where the building WAS and the user must manually zoom to find it. Placement is correct — this is a framing-timing bug. **Chose Option B** (make the suppression base-jump-aware) over Option A (defer the FIRST frame until datum-resolved): the early frame is orchestrated EXTERNALLY in `GISAreaLayout.restorePhotorealGlobeContent → reframeSiteIn3D() → flyToFormaSite()` (shared with the Zoom-to-Site button + the no-massing fallback), so gating it cleanly is cross-file and risk-prone, while B is a single-seam fix at `performInitialReframe` keyed to the confirmed jump — and it also removes the "user moved during load → never framed" failure mode.

| Phase | Work | Status |
|---|---|---|
| **P1 — Record the framed base** | `CesiumViewport.flyToFormaSite` records `formaFramedAtBaseHeight = formaTerrainBaseHeight` (the ground base the current building frame is flown against — covers both the §GLOBE-FIT-BUILDING bounding-sphere path and the √area fallback, and the plan preset which delegates to it). New field reset in the mode-switch reset, the re-mount reset, and `armGlobeReframeOnBaseSettle`. | **DONE** |
| **P2 — Stale-frame re-frame gate** | `performInitialReframe`: when `formaUserMovedCamera` is set, compute `baseJumpM = |formaTerrainBaseHeight − formaFramedAtBaseHeight|`. If `≤ GLOBE_STALE_FRAME_BASE_JUMP_M` (20 m) → keep the original §GLOBE-FRAME-NO-JUMP suppression (small terrain jitter / progressive tile refinement — honour the user). If `> 20 m` → the frame is STALE (the building moved out of it), so fall through and re-frame ONCE despite the user move. The fire-at-most-once latch (`formaInitialReframeFired`) is unchanged, so a further settle after the corrective frame is still suppressed. | **DONE** |
| **P3 — Docs** | ADR-0268 D6 update + §-tag; C12-GEOSPATIAL §7 "frame once, no jump" MUST refined + changelog; L-370 audit row + this plan entry. | **DONE** |
| **P4 — Typecheck + tests** | Root `tsc --skipLibCheck --noEmit` 0 errors. `@pryzm/editor` `CesiumViewportFrameNoJump` suite 8/8 green (6 prior + 2 new: large-jump override fires once; small settle still suppressed). | **DONE** |
| **Preserved (explicit)** | Small-settle §GLOBE-FRAME-NO-JUMP user-control protection (≤20 m); fire-at-most-once latch; §GLOBE-FIT-BUILDING heading/pitch; seat-and-reveal ordering; massing↔real transition; re-entry framing (already-seated model → datum resolved → ~0 m delta → frames without yanking). | Done |
| **Verify (live)** | Founder's Fly run: open the 3D globe on a non-sea-level site → the globe lands FRAMED on the building with NO manual zoom; the log shows `§GLOBE-STALE-FRAME-REFRAME (L-370) … re-framing ONCE despite the user's camera move` instead of the old suppression line. **Not marked Fixed until confirmed.** | Pending |

## L-371 — Forma "3D Site" false "map tiles stopped streaming" 25 s stall: make the keyless-tiles gate authoritative on `formaMode` — SS-FIX-FORMA-TILES-READINESS-FORMAMODE-FIRST
**Severity:** P2 (GIS / loading UX). **Queue:** gis / Cesium readiness. **Contracts:** C12-GEOSPATIAL §7. **Cross-ref:** §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327), §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270). **Status: IMPLEMENTED — awaiting live confirmation.**

> **Approach.** The L-327 keyless-gate skips the readiness "tiles" stage when `hasRealTileProvider()` returns `false`, but that method returned a STALE `photorealTilesActive === true` (left by the prior globe view, never reset on Forma re-entry) BEFORE considering the view mode — so on a Forma study (keyless flat ground, imagery hidden, no streaming tileset) the tiles gate stayed armed and the 25 s stall watchdog fired a bogus "tiles stopped streaming" card on a view already rendered. Intermittent (Rome run skipped correctly, Lisbon run stalled) because it depended on whether the stale flag happened to be cleared at probe time. Fix: `formaMode` is the authoritative "there will never be streaming tiles" signal — check it FIRST.

| Phase | Work | Status |
|---|---|---|
| **P1 — formaMode-first gate** | `CesiumViewport.hasRealTileProvider()` returns `false` immediately when `this.formaMode` (before the `photorealTilesActive`/`globe.show` checks, which are kept for the non-Forma globe path). | **DONE** |
| **P2 — Typecheck + tests** | Root `tsc --skipLibCheck --noEmit` 0 errors; `viewActivationLoadingOverlay` 13/13 green (downstream keyless-skip behavior already covered). | **DONE** |
| **P3 — Docs** | L-371 audit row + this plan entry. | **DONE** |
| **Verify (live)** | Founder's Fly run: EVERY Forma-site entry logs `§SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE … skipping the tiles gate` and NEVER shows `readiness NEVER ARRIVED at stage "tiles"` for target `site`. **Not marked Fixed until confirmed.** | Pending |

## L-372 — Auto-WebGL fallback still runs TSL: fire the transmission neutralizer on the WebGL2-backed fallback + suppress shadows across the whole generation (Batch 1) — SS-FALLBACK-STILL-TSL-TRANSMISSION-AND-GEN-SHADOW-SUPPRESS
**Severity:** P1 (perf + render). **Queue:** render / renderer-three (WebGPU) + perf / generation. **Contracts:** C04 §1.4; corrects the false premise in ADR-0267 §Fix-2 + ADR-0077 ("`webgl-fallback` = no TSL"); C10 heavy-scene budgets. **Cross-ref:** §L-361-WEBGPU-TRANSMISSION-GUARD (L-364), §FIX-SHADOW-ENABLE-LATCH (L-205), Auto-WebGL (L-362/L-366/L-367). **Status: IMPLEMENTED — awaiting live confirmation.**

> **Approach.** Two independent investigations CONFIRMED the founder's hypothesis: the heavy-scene Auto-WebGL swap builds a `WebGPURenderer({ forceWebGL2:true })` (backend `webgl-fallback`), NOT a classic `THREE.WebGLRenderer` — it disables only the app-level post-FX (SSGI/TRAA/outlines via `_webGpuActive=false`), while the renderer STILL node-compiles every material and drives shadows through its TSL shadow-node graph on the WebGL2 backend. So generation stays slow and the transmission `expected a "float"` seed survives the swap. Batch 1 lands two low-risk fixes within proven seams; Batch 2 (below) is the complete fix.

| Phase | Work | Status |
|---|---|---|
| **P1 — (A) Transmission neutralizer gate** | `RenderPipelineManager._neutralizeTransmissionForWebGPU()` gated on `!this._webGpuActive` → now on `!isWebGPURenderer` (§L-361-FALLBACK-STILL-TSL): fires on native WebGPU AND the WebGL2-backed `webgl-fallback` (both emit the transmission TSL node → the "expected a float" seed), and correctly SKIPS a classic `webgl-only` renderer (no node graph → keeps refractive glass). | **DONE** |
| **P2 — (B) Whole-generation shadow suppression** | `buildingGenerationLifecycle` pushes `pushShadowPassDisabled('building-generation')` in the lease ctor and releases it (idempotent, exception-safe) in `release()` — removes the per-frame shadow-MAP render from the generation hot loop and defers the one shadow (re)compile to after the scene settles. Single-owner ref-counted latch (L-205), backend-agnostic (WebGPU / `webgl-fallback` / `webgl-only`); composes with the batch-scoped `'batch'` suppression but spans the whole lifecycle. §GEN-SHADOW-SUPPRESS. | **DONE** |
| **P3 — Typecheck + tests** | Root `tsc --skipLibCheck --noEmit` 0 errors; `RenderPipelineManager.shadowEnableLatch` 11/11 + `viewActivationLoadingOverlay` 13/13 green. | **DONE** |
| **P4 — Docs** | ADR-0267 §Fix-2 / ADR-0077 false-premise correction note; L-372 audit row + this plan entry. | **DONE** |
| **Batch 2 (separate, tracked)** | The COMPLETE fix = route heavy-gen to a classic `THREE.WebGLRenderer` (`webgl-only`, zero node compile). Material-safety audit confirmed the live generated scene is 100% classic materials (zero node materials / element-level TSL), so it is materially safe (LOW–MEDIUM risk). Needs: lift the `initScene.ts:1772` Phase-5 `webgl-only` abort, extend the `initScene.ts:2811` lightweight per-frame render to `webgl-only`, and a guarded fallback to `webgl-fallback` (worst-case = today). | Planned |
| **Verify (live)** | Founder's WebGPU-box run: after the swap, NO `expected a "float"` flash; `§L-361-WEBGPU-TRANSMISSION-GUARD neutralized …` now also fires on `webgl-fallback`; shadows do not re-render per frame during generation and reappear correctly at the end; generation materially faster. **Not marked Fixed until confirmed.** | Pending |

### L-373 — 3D Site Analysis credibility & provenance hardening (geospatial/climate)
Phase mapping (see docs/04-reference/3D-SITE-ANALYSIS-AUDIT.md §G):
- **Phase 0 (days, P1 — covers L-373a):** Fidelity badge (Measured/Simulated/Estimated/Indicative) + absolute-vs-relative legend disclosure with real numeric min/max + provenance & fetch-date on every heatmap. Rename bare "Lawson" until CFD backs it. Add CI gate `check-siteanalysis-fidelity-label.ts` mirroring C54 `check-windcfd-beta-label.ts`. Touches: FormaSiteAnalysisControls.ts (legend/caption), siteMetricLegend. No new data.
- **Phase 1 (weeks):** Terrain-aware sun occlusion (Cesium/LiDAR DTM); ERA5-Land base temp/wind as a C21 provider tier; C22 PII `dataTier` tag on Population; national-census provider for Population where available. Reuse siteRealData cache pattern.
- **Phase 2 (1–2 quarters):** Ship C54 WebGPU-LBM wind CFD (ADR-0064 / SPEC-WIND-CFD-LBM) as primary wind field; annual solar radiation + kWh/m² + PV (PVGIS/NSRDB) on the existing sun pass; satellite-LST UHI + UTCI/PET comfort.
- **Phase 3 (2+ quarters):** Build the C55 pluggable-provider geodata subsystem (ADR-0065) and land compliance/constraint layers (Daylight/overshadowing compliance, Noise, Flood, Planning controls, View corridors, BNG, Stormwater), feeding suitability/keep-out into the existing SPEC-ENVIRONMENTAL-DESIGN-DRIVERS consumer (C55 §1.8).
Links: L-373, L-373a. Owner UNASSIGNED. Target TBD. Deps: C54, C55, C21, C22/C23.

### L-374 — Forma "3D Site" production-readiness + provider-agnostic Context Engine (geospatial)
Full audit + roadmap: docs/04-reference/FORMA-CONTEXT-ENGINE-AUDIT.md. **DECISION (founder, 2026-07-17): TWO DISTINCT VIEWS.** Keep the existing abstract Forma massing "3D Site" view UNCHANGED (SPEC-FORMA §2/§8 abstract-massing intent preserved — no regression); ADD a NEW "engineering-grade context" view (real terrain/DEM + orthophoto + LOD2/LOD3 buildings + trees/vegetation + water/roads) as a SEPARATE view, accessible via a UI entry point (extend the existing segmented view-mode / result-toggle bar — do NOT bolt onto the Forma toggle). The provider-agnostic Context Engine (L-374f) backs the NEW view only. Licensing note: Google 3D Tiles ToS restricts derivative/offline use → the new view must support a provider strategy (premium Google/Cityweft tier + open Copernicus/Overture fallback) so it degrades gracefully and stays licence-clean. Design + UI + full options: docs/04-reference/CONTEXT-VIEW-DESIGN.md (in progress).
- [ ] **Phase 0 (L-374a, P1):** GLB export off critical path (worker/idle) + Draco; cross-view geometry-signature cache (fix view-mode-keyed re-export); seat-once (no place-at-0-then-re-place); defer non-critical context. Add C10 view-activation budget (<~2s first-interactive). SUBSUMES L-355/356/358. Effort M. Dep: none.
- [ ] **Phase 1 (L-374b):** attach TerrainProvider (Cesium ion/Copernicus); wire sampleTerrainMostDetailed clamp. Effort M. Dep: none.
- [ ] **Phase 2 (L-374e):** orthophoto ImageryLayer draping over terrain. Effort S. Dep: Phase 1.
- [ ] **Phase 3 (L-374f):** extract @pryzm/context-engine provider interfaces + refactor context loaders behind adapters. Effort L. Dep: none (enables Ph4/5).
- [ ] **Phase 4 (L-374c):** Overture + Cityweft/Google-3D-Tiles BuildingProvider adapters; 3D-Tiles hand-off; OSM LOD1 fallback. Effort L. Dep: Phase 3.
- [ ] **Phase 5 (L-374d):** VegetationProvider — instanced tree impostors. Effort M. Dep: Phase 3.
- [ ] **L-374g — Context View + UI (NEW peer view):** add a 4th PEER segment `▤ Context` to `mountResultToggleBar` (GISAreaLayout.ts:789, after the ◉ 3D Site button :871); new `applyContextView()` mirroring the '3D' branch (removeFormaViewToggle + startViewActivationLoading('context') + trackViewActivationPlacement); new `CesiumViewport.setContextMode()`/`contextMode` flag (peer to formaMode); optional `mountContextViewToggle()` sub-bar with layer checkboxes + provider-tier picker. REUSE L-270 overlay + L-371 tiles-gate. **HARD CONSTRAINT: abstract Forma view (formaMode/applyFormaMode/:2346 sub-bar) untouched.** Effort S–M (~1wk). Dep: L-374a (P0). Contracts: C06 §7, new SPEC-CONTEXT-VIEW. Design: docs/04-reference/CONTEXT-VIEW-DESIGN.md.
- [ ] **L-374h — Context view-activation perf budget (C10 gap):** <2s first-interactive (terrain first tile ≤600ms, model seated ≤900ms, near ortho+buildings ≤1.5s); author with L-374a/P0.
Recommended rendering path (design): **Cesium-native providers into the EXISTING viewer, 3D Tiles as the unifying format** (reuses the whole lifecycle + LTP-ENU + ADR-0268 anchor; scales globally). L-374a..f re-labelled as the Context View's phases P0–P5 (Forma view excluded from all). New specs: **SPEC-CONTEXT-VIEW** (view lifecycle + no-Forma-regression guarantee), **C12-CONTEXT-ENGINE** (provider interfaces + tier/fallback + budget), **C10** view-activation-budget clause.
Links: L-374, L-374a..h. Owner UNASSIGNED. Target TBD. Deps: C12-CONTEXT-ENGINE (new), SPEC-CONTEXT-VIEW (new), C10 budget, ADR-0065 pattern.
**Founder licensing decisions (deferred, Phase-0 works keyless): (1) premium tier Google 3D Tiles (photoreal, display-only ToS) vs Cityweft (semantic LOD2, licence-clean) vs open-only; (2) Cesium ion token for quantized-mesh terrain vs keyless Copernicus GLO-30; (3) offline/export posture (Google disqualified if offline needed).**

## L-376 — Commercial office-tower generation (errors + 40× perf amplification)
Full audit: docs/04-reference/COMMERCIAL-TOWER-AUDIT.md. Office mirrors resi (do NOT fork the pipeline).
- [ ] **L-376d (P1):** add `stair.batch.create` / `verticalCirculation.batch.create` / `slab.batch.create` / `floor.batch.create` bus handlers (C16 §8 canonical) + refactor resi/house/office executors to dispatch ONE batch command per element kind (one snapshot/group, not per-element structuredClone). Fixes resi+house+office. Ties L-375d. **Human decision: pipeline-wide (recommended) vs office-local wrap.**
- [ ] **L-376e (P2):** gate CommandManager EXECUTE/snapshot (CommandManagerImpl.ts:108,126) + CreateStairCommand.canExecute (:121,123,385) logs on `__pryzmBuildingGenActive`/`__pryzmProjectLoadActive`. Ties L-375b/c.
- [ ] **L-376f (P2):** office generate = one undo unit (folds into L-376d batch-command fix).
- [ ] **L-376a (P2):** IDB local-only-version cap + LRU eviction / server-flush reconcile (ProjectHub.ts:218-234). **Human decision: retention policy.**
- [ ] **L-376b (P3):** filter `L0` out of the ClearProjectCommand level loop (ClearProjectCommand.ts:179-181) to stop the `Cannot delete the default Ground level` warn.
- [ ] **L-376c (P3):** `PCFSoftShadowMap`→`PCFShadowMap` (set the actual supported type) + `THREE.Clock`→`Timer` — batch with L-372.
Links: L-376a–g. Owner UNASSIGNED. Target TBD. Deps: C16 §8 batch handlers, ties L-375.

## L-377 — Post-geometry "finishing up" latency (per-wall redetect storm + shader-compile + cascade)
Full context: L-377 audit row. **UNVERIFIED — investigation dispatched.** Building appears in 2-3s; the tail is slow.
- [ ] **P1 — Per-wall REDETECT_ROOMS storm:** root-cause the `§P2.1 wall.created`→legacy-store bridge triggering `REDETECT_ROOMS` per wall; suppress it during generation (extend the L-369 `__pryzmBuildingGenActive` gate to this bridge path, OR debounce/coalesce redetect to ONE sweep at generation end — the BatchCoordinator already skips the FINAL sweep via §FIX-SKIP-REDETECT-ROOMS, so the per-wall bridge path is the leak). Room-topology queue.
- [ ] **P1 — 14s FIRST-RENDER shader compile (6161 meshes):** the L-372/Batch-2 residual — the complete fix is Batch 2 (route heavy-gen to classic webgl-only = zero node compile). Cross-ref L-372.
- [ ] **P2 — 86s DependencyResolver CASCADE:** investigate whether the semantic-graph cascade can be deferred/batched/suppressed during generation (like the redetect + log gates).
Links: L-377, ties L-369, L-372, ADR-0069. Owner UNASSIGNED. Target TBD.

## L-378 — Auto-frame the BIM 3D scene when returning from Forma (stop the stale globe-scale camera restore)
**Severity:** P2 (view/camera UX). **Queue:** view-switching / camera-state. **Cross-ref:** L-370 (globe framing — DISTINCT). **Status: OPEN — queued behind L-377.**

> **Root cause (live log).** `ViewController._activate3DView → MultiViewCameraManager.restoreSlot("perspective")` restores a perspective slot saved WHILE the Cesium/Forma camera was globe-scale (`pos(-1.67M, 0.66M, -12.48M)`, target ~(17,9,9)), so the BIM camera is ~12.5M units out → building is a speck → user must manually zoom. The existing `§3D-FRAME-ON-VIEW-SWITCH` auto-frame hook doesn't win on the GIS-return path.

| Phase | Work | Status |
|---|---|---|
| **P1 — Root-cause the save/restore** | Confirm `ViewCameraStateStore.save("3D")` persists the globe-scale pose during the Cesium session and `restoreSlot("perspective")` replays it on return; confirm why §3D-FRAME-ON-VIEW-SWITCH doesn't fire/loses. | Pending |
| **P2 — Correct fix** | On the GIS/Forma→3D transition: either (a) INVALIDATE the perspective slot when it was saved during a Cesium/globe session (a globe-scale pose is not a valid BIM camera), OR (b) fire the existing §3D-FRAME-ON-VIEW-SWITCH auto-frame on the GIS-return path. Reuse the existing framing hook — no one-off. | Pending |
| **P3 — Guard** | Normal in-editor 3D↔plan toggles still restore the user's last BIM camera (do NOT unconditionally zoomToAll every activation). | Pending |
| **P4 — Verify (live)** | Forma → 3D+Plan lands framed on the building, NO manual zoom; in-editor toggles unaffected. Not marked Fixed until confirmed. | Pending |
Links: L-378, ties L-370. Owner UNASSIGNED. Target TBD.

## L-379 — Presentation-grade context render style ("presentation mode") — Spacio-style matte massing + soft AO + studio light + stylized ground/roads + instanced trees
**Severity:** P2 (render polish; high demo value). **Queue:** Rendering. **Contracts:** C04 (Cesium-owned render half), C55 §1.2/§1.7 (read-only draped context), C19/C12 (shading-only — heights stay accurate). **Cross-ref:** layers onto L-374g (Context View), tree-DATA half = L-374d. Full scoping: docs/04-reference/CONTEXT-PRESENTATION-RENDER-SCOPING.md. **Status: OPEN — planned, not started.**

> **CRUCIAL architectural finding (drives everything).** Context/Forma pixels are owned by **CESIUM's own WebGL renderer** (`new Cesium.Viewer`, CesiumViewport.ts:1199), NOT PRYZM's Three.js/WebGPU pipeline. So this styling is **Cesium-native**: the L-361 Three SSGI/TSL pipeline (SSGIPass.ts, WebGPU-only, OFF on webgl-fallback) is architecturally unreachable and CANNOT be reused. The upside — most of the Spacio look is **already shipped Cesium-native** (flat matte massing material, HBAO post-process, soft directional light + shadows, hierarchical road-ribbon corridors), so the bulk of the delta is PARAMETER TUNING on an existing path, near-zero risk. Context is cleanly separable (dedicated Cesium entity arrays), so no BIM-render-graph risk. **Fully additive / opt-in; touches only Cesium (`FORMA_PALETTE`/`FORMA_QUALITY` + Cesium entities/post-FX); shares NO code path with the P0/P1 launch work (L-334/360 persistence, L-335 collab, L-361/372 WebGPU, L-377 gen-perf — all Three/server).** P2/P3/P6/P7 clean: no new `import * as THREE`, no private rAF (Cesium drives its own `requestRender`), no model mutation (pure style/visibility intent).

| Phase | Sub-phase | Work | Effort | Dep | Verify gate |
|---|---|---|---|---|---|
| **P0 — Presentation-mode toggle + wiring** | 0.1 | Add a "Presentation" toggle to the Forma/context view (theme + quality state on the existing `setFormaMode` / `FORMA_PALETTE`/`FORMA_QUALITY` seam — no new render owner). Opt-in, off by default. | XS | none | Toggle flips context style live; abstract-massing default unchanged. |
| | 0.2 | Confirm the Cesium3DTileStyle `color` override path works for FUTURE 3D-Tiles context (so the same material system applies when L-374 swaps providers). | XS | 0.1 | A 3D-Tiles tileset (if available) recolours via the shared style. |
| **P1 — Context material presets (L-379a)** | 1.1 | Add warm-white / wood-tone matte presets to `FORMA_PALETTE.contextFill` (today one cool-grey flat `Cesium.Color`, CesiumViewport.ts:5288/:5320); low specular, no albedo texture. | XS | P0 | Presets switch; matches reference matte tone. |
| **P2 — AO + overcast-studio lighting (L-379b)** | 2.1 | Tune the existing Cesium HBAO stage (radius/intensity, `ensureFormaPostProcess` :2476-2524) toward the reference's soft crevice AO. | XS-S | P0 | AO reads soft in setbacks, not harsh/haloed. |
| | 2.2 | Soften the directional light (:2244) + shadow map (:2128/:2132) to the overcast-studio look; add a contact-shadow "studio pool" darkening under buildings. | S | 2.1 | Soft-lit, no hard sun; grounded buildings. |
| **P3 — Stylized ground + roads (L-379c, beta-optional)** | 3.1 | Colour-ramp / park-tinted material on the flat Forma ground plane (:1974) — SHADING only, terrain heights stay accurate (C19/C12). | S | P1/P2 | Ground reads stylized; measured heights unchanged. |
| | 3.2 | Road-ribbon polish — casing + a pedestrian/arterial tier on the existing hierarchical corridors (:5526-5559). | S | 3.1 | Roads read hierarchical + flat-shaded. |
| **P4 — Instanced stylized trees (L-379d, POST-LAUNCH)** | 4.1 | Cesium `ModelInstanceCollection`/billboard impostor trees scattered from OSM tree points / park polygons (net-new Cesium instancing — Three `InstancedMesh` NOT reusable). | M-L | **L-374d (tree DATA)** | Trees instanced, matte-styled, perf within tier budget. |

**September build order:** **Beta = P0 + P1 + P2** (toggle + material presets + AO/light tune — ~80% of the visual delta, param work on an already-Cesium-native path, near-zero risk). **Beta-optional = P3** (ground/road polish). **Post-launch = P4** (instanced trees — the only real new infra, paired with the L-374d VegetationProvider data half). Perf: Cesium AO is a single feature-gated post-pass (C10); trees gated behind the presentation toggle + tier budget.
Links: L-379, L-379a–d; ties L-374g/L-374d. Owner UNASSIGNED. Target: beta (P0–P2) pre-September; P4 post-launch. Governance: C04 note (Cesium-owned render half — context styling stays inside the Cesium owner), C55 §1.7 (style as render parameter).

## L-380 — Parcel selection → buildable envelope (Spain-first, Barcelona pilot) — strategic site-feasibility feature
**Severity:** P2 launch / **HIGH strategic**. **Queue:** geospatial / site-feasibility. **Contracts:** new C57 (Parcel Data Layer) + C58 (Zoning Rules Engine, fills C19 §9/§10.2) + SPEC-PARCEL-SELECTION + strategy ADR + VISION amend; reuses C19/C12/C18; mirrors L-374 provider pattern + L-373 credibility. Full scoping: docs/04-reference/PARCEL-ZONING-FEATURE-SCOPING.md. **Status: OPEN — plan authored; execution gated behind the L-376d code lane + 2 strategic sign-offs.** **Zero dependency on the September launch work.**

> **Architecture.** TWO separable systems. (1) **Parcel Data Layer** (L2, provider-agnostic, mirrors L-374 Context Engine): `ParcelProvider` + Catastro/ÖREB/Terrara adapters behind a server proxy (`server/parcelZoningProxy.js`, clone of `overpassProxy.js`) → WGS84 ring → existing `buildBoundaryFromLatLonRing` → `site.parcel-boundary-set`. (2) **Zoning Rules Engine** (L2, pure/deterministic): `ZoningProvider` adapters + curated per-jurisdiction `JurisdictionZoningContract` → `BuildableEnvelope` (setback inset + max-height volume + `confidence`) → `site.updateZoning`, feeding the existing `generateResidentialFromBoundary` (P6 bus). **Two fidelities** (structured where published, else labelled estimated-ruleset) because numeric zoning is PDF-trapped everywhere except Denmark. Reuses the C19 `Parcel` that ALREADY carries setbacks/maxFAR/maxHeight/zoning.

| Phase | Sub-phase | Work | Effort | Dep | Verify gate |
|---|---|---|---|---|---|
| **P0 — Server proxy + parcel fetch** | 0.1 | `server/parcelZoningProxy.js` (clone overpassProxy.js: forward-once, GML→GeoJSON, LRU cache, non-fatal fallback); CSP connect-src add for Catastro. **[human decision: CSP]** | S | none | `/api/catastro` returns a parcel polygon for a refcat. |
| | 0.2 | `CatastroParcelProvider` — point → OVC `Consulta_RCCOOR_Distancia` → refcat → `GetParcel` → WGS84 ring (WFS has NO BBOX — point→refcat flow). | S | 0.1 | Click a Barcelona point → correct parcel ring. |
| **P1 — Select-parcel map UX (L-380c)** | 1.1 | Add a "Select parcel ▸ / Draw boundary ▸" mode to `SiteBoundaryMap2D`. **[human decision: default mode]** | S | P0 | Mode toggle; draw path unchanged. |
| | 1.2 | Hover-preview → click → brand-purple (#6600FF) highlight → parcel info card (refcat/area/zone) → "Use this parcel" → `site.parcel-boundary-set`. | M | 1.1 | Selected parcel highlights + commits as the site boundary. |
| **P2 — Zoning Rules Engine (L-380b)** | 2.1 | `MucZoningProvider` (Catalonia PLANEJAMENT WFS, GeoJSON spatial query) → zone code for the parcel. | S | P0 | Barcelona parcel → its MUC qualificació. |
| | 2.2 | `JurisdictionZoningContract` schema + curated `es-barcelona` ruleset (zone → setbacks/height/FAR/use); pure `computeBuildableEnvelope()` (setback inset + max-height volume + `confidence`). **[human decision: curation vs Terrara]** | M | 2.1 | Envelope numbers match the curated ruleset. |
| **P3 — Envelope render + credibility (L-380c)** | 3.1 | Render envelope in PLAN (inset polygon) + 3D/site (max-height extrusion volume); provenance/confidence chips (L-373 discipline — never present estimated zoning as authoritative). | M | P2 | Envelope drawn; "estimated — verify against ordinance" label when confidence<structured. |
| | 3.2 | Graceful "zoning unavailable — draw manually" fallback when no zoning data. | S | 3.1 | Missing-zoning parcel → clean manual fallback. |
| **P4 — Hand-off to BIM authoring** | 4.1 | Feed the confirmed parcel + envelope constraints into `generateResidentialFromBoundary` via `site.updateZoning` (P6 bus — no one-off path). | S | P3 | Generate respects the envelope (footprint + max height). |
| **P5 — Governance + scale (L-380e)** | 5.1 | Author VISION amend + strategy ADR + C57/C58 contracts + SPEC-PARCEL-SELECTION + C00-index. **[gated on strategic sign-off]** | M | — | Governance merged; contracts DRAFT. |
| | 5.2 | Add Madrid (#2 municipality, ArcGIS REST) + Switzerland ÖREB (#2 country). | M each | P2 | Second jurisdiction selectable end-to-end. |

**Effort:** ~5–7 dev-weeks to ONE working pilot (Barcelona: parcel-click → envelope in plan). +2–3 wk per municipality; +1–1.5 wk per new-country parcel source. The long tail is **zoning curation**, not code. **September:** this is post-launch strategic — build after the launch-blocking backlog; nothing here touches L-334/360/335/361/372/377.
Links: L-380, L-380a–e. Owner UNASSIGNED. Target TBD. **Awaiting founder sign-off: (1) V1-pillar vs Phase-B; (2) Terrara buy-vs-build.**

## L-381 — Element-creation pipeline unification (bring every element to the walls/curtain-walls gold standard)
**Severity:** P2 (architecture / consistency tech-debt; NOT launch-blocking — generation works post-L-376d). **Queue:** pipeline / tech-debt. **Contracts:** C11 §2/§5/§11, C16 §3.2/§8, ADR-0055. Full audit + matrix: docs/04-reference/ELEMENT-PIPELINE-SOUNDNESS-AUDIT.md. **Status: OPEN — plan authored, not started.**

> **Gold standard (target for every element).** Bus `*.batch.create` handler + `CommandEventBridge` one-`*.created`-per-element fan-out + initTools render bridge (mirror to legacy store/builder) + one batch command per level in the executors. Reference impl = Wall + Curtain-Wall. **Undo is already uniform** (L-376d §GEN-UNDO-COALESCE coalesces all legacy creates to one entry) — so this migration is purely RENDER-PATH consistency + true bus batching, done PER-ELEMENT behind a geometry-identical + one-undo verify gate. **CRITICAL ordering (the L-376d lesson): the render bridge MUST land BEFORE the batch handler is dispatched, else the element stops rendering.** Incrementally launch-safe.

| Phase | Sub-phase | Work | Effort | Dep | Verify gate |
|---|---|---|---|---|---|
| **P1 — Stairs + Lifts (L-381a, highest value)** | 1.1 | Resolve the silent-stub trap: **register the real `registerStairHandlers()`** (the complete tested set incl. `CreateStairBatchHandler`) at the composition root, OR delete the dead no-op stub (initBusHandlers.ts:159). **[human decision]** | S | none | `stair.batch.create` is real, not a no-op. |
| | 1.2 | Add the stair render bridge (CEB `stair.created` + initTools mirror) so bus-created stairs render — BEFORE routing dispatch to the bus. Cover stair-railing + stair-landing sub-elements. | M | 1.1 | Bus-created stair renders identically (geometry + railings + landings). |
| | 1.3 | Give **lift/verticalCirculation** a bus surface (batch command + handler + render bridge — none exists today). | M | none | Bus-created lift renders identically. |
| | 1.4 | Route the resi/office/house executors to the stair/lift bus batch commands (one per level). | S | 1.2/1.3 | Office 78 stairs + 80 lifts via bus; identical building + rooms + one undo. |
| **P2 — Roof/Floor batch fan-out + executor convergence (L-381b)** | 2.1 | Point the executors at the gold slab/CW batch commands they currently bypass; add batch fan-out to roof (near-gold). | S | none | Slab/roof via gold batch; identical geometry. |
| | 2.2 | Floor batch fan-out (full floor dual-command retirement, C11 §5.4.3, DEFERRED — blocked on plugin-store residency). | — | deferred | (post-launch) |
| **P3 — Handrail/Lighting + doc-sync (L-381c)** | 3.1 | Add batch fan-out to handrail + lighting; **correct the STALE C11 §11 element matrix** (Handrail/Furniture rows say LEGACY-ONLY but were bridged §7.0). | S | none | C11 §11 matrix matches code; handrail/lighting batched. |

**Per-element verify gate (every migration):** generate resi + office → identical building geometry + rooms + railings/landings, ONE undo unit, no render regression. Incrementally launch-safe; touches NONE of persistence/collab/WebGPU/gen-perf. **Human decisions:** (a) register-real-handlers vs delete-dead-stub for stairs; (b) lift as first-class bus element (scope); (c) room-bounding-line bus-ify vs treat as derived; (d) floor dual-command retirement (deferred).
Links: L-381, L-381a–c. Owner UNASSIGNED. Target TBD. Governance: C11/C16 Known-Debt note (dead registerStairHandlers + lift-no-bus-surface).

## L-383 — Denmark geospatial reference implementation (unifies L-380 parcel/zoning + L-374 3D context)
**Severity:** P2 / HIGH strategic-technical. **Queue:** geospatial + devops. **Full phased plan (DK-0..DK-5, effort/deps/verify per phase) + per-tool integration verdicts + the GeoJSON-canonical data flow are in docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §7/§8** (extends, does NOT duplicate, the L-380 P0–P5 + L-374 Phase-1/4 phases). **Status: OPEN — validated, plan authored, not started.**
- **Canonical:** GDAL(offline)/proj4js(edge) → GeoJSON/WGS84; DK adapter quartet (Matriklen parcels + Plandata.dk zoning + Danmark-i-3D LOD2 + DHM terrain) feeds both the 2D MapLibre map and the Cesium 3D view.
- **L-383e (deploy, decision):** native binaries OFFLINE-baked (one-shot Docker job → object storage), NOT in the Fly app image; app image gains only the pure-Node `parcelZoningProxy.js` + server-side Datafordeler key.
- **Ties:** L-380 (C57/C58 parcel/zoning), L-374 (C12-CONTEXT-ENGINE, terrain L-374b, LOD2 L-374c). **Human decisions: engineering-context-vs-Forma-abstract default; PostGIS GPLv2 sign-off; serve-in-house scope; tyler license.**
Links: L-383, L-383a–e; ties L-380, L-374. Owner UNASSIGNED. Target TBD.

## L-384 — Onboarding boundary-draw needs undo/redo/ESC/BACK + step-progress affordances (forward-compatible with parcel-select)
**Severity:** P1 (UX, primary onboarding path). **Queue:** geospatial / site-authoring UX. **Contracts:** C06 §7 (UI/launcher); C18/C19 (site); **coverage gap — no contract governs onboarding step-machine UX** (log to MISSING-CONTRACTS). **Cross-ref:** ties L-380/L-383 parcel-select (shared affordances). **Status: OPEN — routed to Pipeline B worktree.**

> **Approach.** The site-authoring step (draw boundary today; parcel-SELECT tomorrow) must expose consistent edit affordances: **ESC to cancel the in-progress draw, BACK to the previous onboarding step, undo/redo of boundary vertices, and re-draw** (re-arm the draw after a committed boundary). The boundary is currently a C19 §1.4 immutable one-shot (`siteSetParcelBoundary`) — re-draw needs a clean re-arm/clear path (clear the committed boundary → re-enter draw), NOT a mutation of the immutable one. Build the affordances on the shared site-authoring step so the parcel-SELECT flow reuses them (one edit surface, two input modes: draw | select). Restore the "step N/4" progress indicator. Correct fix = the onboarding step-machine + `SiteBoundaryMap2D` gain a proper edit/undo/back state (UI layer only — no server/schema); the shortcut (a lone "clear" button) is NOT recommended because it doesn't give BACK/step-navigation or reuse for parcel-select.

| Phase | Work | Effort | Verify gate |
|---|---|---|---|
| 1 | ESC cancels in-progress draw; re-arm draw after a committed boundary (clear → re-enter, respecting the C19 one-shot immutability via a clear-then-recreate path). | S | Mis-drawn boundary can be cleared + re-drawn without abandoning the flow. |
| 2 | BACK button on each onboarding step (draw → back to location; generate-config → back to draw); restore the "step N/4" progress affordance. | S | User can step backward through onboarding; progress shown. |
| 3 | Undo/redo of boundary vertices during draw (Ctrl+Z/Y or on-screen). | S | Vertex undo/redo works during draw. |
| 4 | Structure the step so parcel-SELECT (L-380 P1) plugs in as a second input MODE sharing the same edit/undo/back surface. | S | Select-mode (when built) reuses the affordances; no one-off. |
Links: L-384; ties L-380/L-383. Owner UNASSIGNED. Target TBD. Route: Pipeline B (site-authoring worktree).

## L-385 — Unify all loading screens to the rotating-prism + translucent-bg + text aesthetic
**Severity:** P2 (UX consistency; founder-requested launch polish). **Queue:** UI / loading overlay. **Contracts:** C06 §7; coverage gap (loading-overlay visual spec → MISSING-CONTRACTS). **Status: OPEN.**
> **Approach.** Change the SINGLE shared `LoadingOverlayView` presentation so every producer (batch lifecycle §L1-BATCH-PERF-MODE, view-activation L-270, building-generation lease L-367) inherits the new look — reuse the crash-fallback / `ViewportCrashGuard` rotating-PRYZM-prism + translucent-backdrop + text component/CSS. NO per-screen fork. Keep the existing progress/label/error API (title, sub-label, N-elements, %, error+actions) — only the visual chrome changes (drop the frosted card + placeholder icon; prism spins over the translucent bg, text below). Preserves L-270 readiness/error states + L-367 continuous-overlay behavior.

| Phase | Work | Verify |
|---|---|---|
| 1 | Extract/locate the crash-fallback rotating-prism + translucent-backdrop component; make it the shared loading visual. | Prism + backdrop render standalone. |
| 2 | Re-skin `LoadingOverlayView` to use it (title + sub-label + N-elements + % + error/actions preserved). | All producers (batch/gen/view-activation) show the new aesthetic; progress + error states intact. |
| 3 | Remove the frosted-card + placeholder-icon chrome; verify light/dark + no layout regressions. | No visual regressions; one consistent loading look everywhere. |
Links: L-385. Owner UNASSIGNED. Target TBD.

## L-375a — Wire CRDT applier through the composition root
**Severity:** P2 (collab correctness + P1/P4 regression). **Queue:** runtime-composer/command-bus. **Contracts:** C08 §3.1, G3-T2; P1, P4. **Root:** composed runtime (composeRuntime.ts:1463-1548) has no `inner` property; engineLauncher.ts:825 `(runtime as any).inner.bus` is always undefined. **Fix:** wire setCrdtApplier inside composeRuntime() (owns inner.bus) OR add typed bus.setCrdtApplier slot; remove the any reach-through; fix stale marker tests/e2e/crdt-batch-conflict.spec.ts:15. **Status: OPEN.**

## L-375b — Gate CreateStairCommand.canExecute diagnostic dumps
**Severity:** P2 (quick win). **Queue:** command-registry. **Fix:** gate CreateStairCommand.ts:121/:123 (+ :385/:410/:421/:436/:473/:483) behind the L-369 `__pryzmBuildingGenActive` helper (BimKernel.ts:28-37), or delete. **Status: OPEN.**

## L-375c — Gate CommandManager per-command logs during building-gen
**Severity:** P2 (quick win). **Queue:** command-registry. **Fix:** extend CommandManagerImpl.ts:105-127 log fast-path to also skip EXECUTE/snapshot log lines when `__pryzmBuildingGenActive` (keep the snapshot). **Status: OPEN.**

## L-375d — Extend L-131 batch coalescing to slab/stair/lift/curtain/roof
**Severity:** P2 (perf/arch gap). **Queue:** command-registry + editor executor + plugins/stair. **Contracts:** C16, L-131 (ADR-worthy). **Fix:** route stairs via the existing `stair.batch.create` handler (VERIFY it is registered at bootstrap — likely missing in editor app); add sibling batch commands for slab/lift/curtain-wall; one snapshot per group. **Status: OPEN.**

## L-375e — Backend-correct FIRST-RENDER-POST-SUPPRESS label
**Severity:** P3 (diagnostic). **Queue:** core-app-model/rendering. **Cross-ref:** L-372 (do not duplicate cost). **Fix:** branch UnifiedFrameLoop.ts:506 label on `isRealWebGPUBackend()`. **Status: OPEN.**

## L-405 — Unified view-mode switcher (2D parcel-select as first-class + enhanced-Forma/LOD200 forward slot)
**Severity:** P2 (UX/GIS navigability + forward-wiring; post-launch-acceptable). **Queue:** view-system / UI-shell (C06) + geospatial (C12/C19/C57). **Contracts/specs:** C06 §7 (launcher/view-mode layer — governs) + C06 §1 (`viewRegistry`); C04 (single reused Cesium viewer); C12-GEOSPATIAL §7/§8; C19 §1.4 (immutable boundary); C57-PARCEL-DATA-LAYER §5/§5.4 (parcel-select UI, select-vs-draw default); C55 (enhanced context data); CONTEXT-VIEW-DESIGN.md (founder two-views decision + L-374g `▤ Context` segment); FORMA-CONTEXT-ENGINE-AUDIT.md; ADR-0016 (view-state command-driven), ADR-0115 (L-40/L-104 site-view launchers via C06 §7). **Relates to the compliance-authoring track (the 2D parcel-select map is that flow's entry — C57/L-380) and the CONTEXT-VIEW-DESIGN two-views work (enhanced-Forma segment = L-374g).** **Status: OPEN — logged only, not started. Owner UNASSIGNED. Target TBD.**

> **What exists (traced).** ONE segmented view-mode bar — `mountResultToggleBar` (`GISAreaLayout.ts:789`, `data-testid="gis-result-view-toggle"`), idempotent via `ensureResultToggle()`, with three peer segments driven by a single `activeSegment: '2D' | '3D' | 'forma'` truth (`:576`): `◧ 3D + plan` → `applyResultView('2D')`, `◉ 3D globe` → `applyResultView('3D')`, `◉ 3D Site` (Forma) → `mountFormaViewToggle`. The Forma segment carries a `[▦ 2D Map][◳ Plan][◉ 3D]` sub-bar (`:2346`) — its `▦ 2D Map` (`:2194/:2358`) is a Forma-mode cream basemap, **NOT** the parcel-select/draw surface. The **2D parcel-select map** is `SiteBoundaryMap2D.ts` / `mountSiteBoundaryMap2D`, mounted ONLY from the onboarding draw path (`GISAreaLayout.ts:128`).
>
> **The two gaps (founder request).** (a) The 2D parcel-select map is not a persistent switcher segment — you can only reach it through onboarding. (b) There is no enhanced-Forma / LOD200 "super-enhanced context" segment; the founder wants the SLOT wired now, placeholder-backed.
>
> **Architecturally-sound approach (follow the EXISTING pattern, do NOT fork a second view system):**
> - **Enhanced-Forma / LOD200 segment = L-374g's `▤ Context` peer segment** already designed in `CONTEXT-VIEW-DESIGN.md` (§1.3/§2). Add the segment NOW backed by the current Forma/Context path (open keyless tier: Copernicus terrain + ESRI ortho + Overture/OSM); the enhanced-data (LOD2/LOD200 via C55 + the proposed C12-CONTEXT-ENGINE, L-374c/f) swaps in behind the SAME view id later. This row is the founder-navigability framing of L-374g — do the two together, one segment.
> - **2D parcel-select segment** — register the parcel-select map as another peer segment in the SAME `activeSegment` set (extend the union + add a sibling `applyParcelSelectView()` that mounts `mountSiteBoundaryMap2D` in select|draw mode), decoupling its lifecycle from the onboarding-only entry. Mirrors L-40/L-104, which mounted their launchers via C06 §7 rather than one-off toggles. Ties L-384 (shared site-authoring edit/undo/ESC/BACK affordances) and C57 §5.4 (select-vs-draw default).
> - **Fast-fix vs correct-fix.** Fast = append two raw buttons to the ad-hoc segmented bar. Correct = lift the view-mode SET into a declared registry aligned with the C06 §1 `viewRegistry` intent, so each segment (incl. parcel-select + enhanced-Forma) is a first-class view entry and per-view camera state (`MultiViewCameraManager` / `ViewCameraStateStore`, incl. the L-378 globe-scale pose guard), the L-270 view-activation overlay, and view persistence all apply uniformly. **Recommend correct-fix.**
> - **Spans layers (call out up front):** UI switcher (C06 launcher / `GISAreaLayout`) + view-state/camera registry (`core-app-model` `MultiViewCameraManager`/`ViewCameraStateStore`) + parcel-select map lifecycle (`SiteBoundaryMap2D`, C57/C19) + Cesium/Forma render surfaces (`CesiumViewport`, C04/C12). Cross-cutting — coordinate with the L-374g Context View work + the L-380/C57 parcel-select track so both land on ONE switcher, not two.
>
> **Coverage gap (logged to MISSING-CONTRACTS-AUDIT-2026-06-01.md):** no contract/spec governs the view-mode-switcher SET/registry; SPEC-CONTEXT-VIEW and SPEC-PARCEL-SELECTION remain proposed/unauthored.

Links: L-405; ties L-374g (enhanced-Forma segment), L-380/C57 + L-384 (parcel-select), CONTEXT-VIEW-DESIGN.md. Owner UNASSIGNED. Target TBD.

## L-412 — Native multi-pane view system (renderer-agnostic view hosting; supersedes narrow "3D-Site-on-right" + enabler button; absorbs L-405)
**Severity:** P2 (view-system architecture; the foundation the site-authoring UX + L-405 switcher + envelope discoverability all sit on). **Queue:** view-system / UI-shell (C06/C59) + geospatial (C12/C19). **Contracts/specs:** **C59-MULTI-PANE-VIEW-SYSTEM** (NEW — authored this pass, CANONICAL, governs) + **C06 §7** (pane z-layering) + **C06 §8** (view-hosting pointer, amended in place) + **C04** (single rAF/P3) + C12/C19/C57/C58 (the site/parcel/envelope views); **SPEC-MULTI-PANE-VIEW-SYSTEM.md** (design + phased plan). **Status: OPEN — design-first landed; live wiring phased. Owner UNASSIGNED. Target TBD.**

> **Why (founder redirect, verbatim).** "The user should generally be able to swap from one view to another and project whichever view it wants in EITHER left or right split view, NATIVELY — without shortcuts — super robust for the long run — not just for the purpose of bringing the 3D Site to the right only." Per PRYZM governance (contracts before code), this pass is DESIGN-FIRST.
>
> **What exists (traced — the three incompatible owners).** (1) `SplitViewManager` (`apps/editor/src/engine/views/SplitViewManager.ts:350–516`) shrinks `#container` to 60% + mounts a FIXED Canvas2D-only right pane (`#svp-secondary-pane`), auto-opened on project load (`initScene.ts:3794`). (2) Cesium `CesiumViewport` hard-targets `#container` (`GISAreaLayout.ts:213,257`) + takes it over whole via `setVisible`. (3) MapLibre `SiteBoundaryMap2D` is an `inset:0` overlay in `#container` (`:287–297,668`). Each assumes it owns the container / a hard pane → no native swap. **Envelope render path is COMPLETE** (`resolveFormaEnvelope`→`renderFormaMassing`→`CesiumViewport.ts:3724` `#6600FF` extruded prism); invisible during authoring only because of the `formaViewMode !== 'map2d'` gate — a discoverability/architecture issue, not a render bug.
>
> **Architecturally-sound approach (NO shortcuts).** Replace the three ad-hoc owners with ONE renderer-agnostic abstraction: **pane hosts** fed by a **view-type registry**. Each renderer is handed a PANE ELEMENT to mount into (not `#container`); the ONE Cesium viewer / ONE WebGPU device is RE-TARGETED into a pane, never cloned. Core invariants: one instance per singleton renderer (singleton view MOVES between panes) · single rAF/P3 (panes subscribe to the composition-root frame bus) · command-driven assignment (P6, aligned with C06 §1 `viewRegistry` — this IS the L-405 correct-fix) · pane z-layering via `zLayers.ts` (C06 §7) · no `window as any` (P4).
>
> **Phased plan (verify-gated).**
> - **Phase 1a — Pure core. ✅ LANDED (this pass).** `apps/editor/src/engine/views/paneViewModel.ts` (vocabulary `ViewType`/`RendererKind`/`PaneId` + `VIEW_TYPE_REGISTRY` + pure layout algebra `assignViewToPane`/`swapPanes`/`validatePaneLayout`/`resolveHostPane`) + `apps/editor/__tests__/PaneViewModel.test.ts` (10 tests) + `CesiumViewport.reflowContainer()` primitive. Zero behaviour change. Gate: tsc + vitest green.
> - **Phase 1b — 3D Site hostable in either pane.** Minimal `PaneHost` re-parenting the single Cesium container into a pane element (reflow via `reflowContainer()`), driven by the pure model. Recreates the founder's original scenario (2D map LEFT · live 3D Site RIGHT · envelope visible during authoring) via the GENERAL host. Gate: host unit tests + founder live-confirm.
> - **Phase 2 — Registry-driven switcher (absorbs L-405).** `mountResultToggleBar` → `VIEW_TYPE_REGISTRY`-backed per-pane view-picker; assignment via a view-state command (P6). BIM plan/3D become pane views.
> - **Phase 3 — Full swap-any-view-any-pane + N-up.** WebGPU BIM 3D re-targetable into a pane; per-pane camera state (`MultiViewCameraManager`/`ViewCameraStateStore`, L-405); 3rd/4th pane; per-pane persistence.
> - **Phase 4 — Consolidation.** Retire the three legacy container-owner code paths once every flow routes through `PaneHost`.
>
> **Spans layers (call out up front):** UI switcher (C06 launcher / `GISAreaLayout`) + view-state/registry (`core-app-model`/`view-state`) + the three render surfaces (`CesiumViewport` C04/C12, `renderer-three` P2, `SplitViewManager`/`PlanViewCanvas` C06 §5). Cross-cutting — coordinate with the L-405 switcher + L-380/C57 parcel-select track so they land on the ONE pane system, not a rival.

Links: L-412; supersedes the "3D-Site-on-right" narrow ask + the "site-view enabler button" idea; absorbs L-405 (switcher registry); ties L-398/L-402b (envelope, now visible via a pane host), SPEC-BUILDABLE-ENVELOPE-UX. Owner UNASSIGNED. Target TBD.

## L-413 — Composition-root: thread the real runtime into the site subsystem; retire the `runtime ?? window.runtime` fallback (follow-up to L-412)
**Severity:** P1 (architectural debt / follow-up to L-412 — the L-412 envelope-visible fix is correct + safe, but patches a transitional smell not the root cause). **Queue:** view-system / composition-root (C02/C59). **Contracts/specs:** **P1** (single composition root) + **C02-COMPOSITION-ROOT-AND-BOOT** + **C59-MULTI-PANE-VIEW-SYSTEM §invariant-7**. Follow-up to **L-412** (`5fe0fa07`). **Status: OPEN — logged only, not started; NOT launch-blocking (correctness verified). Owner UNASSIGNED. Target TBD.**

> **Why (architectural review of the L-412 envelope fix, `5fe0fa07`).** The fix converges the emitter/subscriber onto one bus (no wrong-bus / double-subscribe) and is correct + safe — but it patches a transitional smell rather than the root cause.
>
> **Root cause (traced).** `apps/editor/src/engine/initUI.ts:2820` deliberately passes `createMainLayout(props, null)` — a "Phase B.2 / S73-WIRE" migration gate: threading the real runtime there would prematurely activate ~30 half-migrated child code paths. So `mountGISArea`'s captured runtime is null and site code reaches for the typed global `window.runtime`.
>
> **Sound fix (scoped, low-risk).** Inject the real runtime into the site subsystem (e.g. `mountGISArea(props, {runtime})` or a `setSiteRuntime(runtime)` post-construction injector) and retire the window fallback for the site path — WITHOUT flipping the global null (which would activate the gated Phase-C child paths). Sub-items:
> - **(a)** Inject runtime into the site subsystem + retire the `resolveFormaEvents` / `getFormaBoundary` window fallback.
> - **(b)** Route the latent same-class captured-null sites through the ONE shared accessor — `GISAreaLayout.ts:118`, `:1160`, `:2974` (site-location reads) and the 6 toast emits (`:186, :1890, :2986, :2994, :2997, :3021`).
> - **(c)** Wire the forma live-update disposer (`window.pryzmDisposeFormaLiveUpdate`, `GISAreaLayout.ts:~2902`) into a real pane-unmount hook — listeners currently persist for the session / orphan on re-mount.
>
> **Terminal state = Phase-C runtime threading** (`createMainLayout(props, runtime)`). The `runtime ?? window.runtime` fallback is time-boxed transitional migration debt (C59 §invariant-7), removed when Phase C threads the runtime.

Links: L-413; follow-up to L-412 (`5fe0fa07`); ties C02, C59 §invariant-7, P1. Owner UNASSIGNED. Target TBD.

## Pipeline A — REAL PLANNING DATA (approved 2026-07-20): target state + sequenced tasks

Cross-refs: **L-443** (rule model), **L-449** (extraction engine), **L-450** (corpus acquisition),
**L-438** (why no API can supply this), **L-441** (classification, shipped free).
Contracts: **C58 §1.2/§1.4/§1.11**, **C57**, **ADR-0269**.

### TARGET STATE — the flow this pipeline exists to deliver

> Open PRYZM → search an address in Barcelona / Madrid / Córdoba → click the parcel →
> **real boundary (Catastro)** + **real setbacks / edificabilidad / área de implantación read from
> that municipality's PGOU, each value citing its own document, page and clause** → buildable
> envelope computed from those REAL rules → generate a compliant building inside it → view it in
> photoreal context → carry it into full BIM authoring.

**Honest scope of that promise — record these so the target is not later remembered as broader
than it was approved to be:**

- **Parcel selection — WORKS TODAY.** Catastro, 15 CCAA + Ceuta/Melilla. No work required.
- **Real numbers — DELIVERABLE, per curated municipality.** Not "all Spain" on day one. The
  three pilot cities are THREE curations, not 318 — weeks, not quarters. The 318 (L-450) is the
  scale-out, and it is a programme of human verification, not an engineering sprint.
- **Provenance is the differentiator.** Every value carries `sourceRef` (document/page/clause),
  so "Why these numbers?" answers with the ordinance article rather than a confidence chip.
  This is Archistar parity and arguably past it.
- **Photoreal visual context — ALREADY WORKS** (Google 3D Tiles, 3D globe). Once L-448 stopped
  the tileset clipping, it is clean. No further work needed for LOOKING at real context.
- **⚠ ANALYTICAL LOD2 CONTEXT IS *NOT* PROMISED FOR SPAIN.** Google's tiles are ONE FUSED MESH —
  gorgeous, but individual neighbouring buildings cannot be selected, queried for height, or used
  as analysis inputs. Per-building LOD2 is a DIFFERENT dataset; **L-404** does this for Denmark
  only because Denmark publishes "Danmark i 3D". **No Spanish national LOD2 equivalent is known
  to exist.** Until one is found, Spanish analytical context remains OSM footprints + heights.
  Anyone reading this plan must not infer LOD2 neighbours from "photoreal context".

### SEQUENCED TASKS — order is load-bearing, do not reorder

| # | Task | L-ID | Why it must come here |
|---|---|---|---|
| A1 | **Extend C58's rule model** for street *alineación* + *profundidad edificable* (ADR required) | **L-443** | **THE UNBLOCK.** C58 §2.2 hardcodes `{front_m, side_m, rear_m}`, which CANNOT express the rules governing dense Spanish urban fabric. Extracted values would have nowhere to land. Acquiring 64 GB before this exists produces a corpus we cannot represent and must re-extract — the human-gated step done twice. |
| A1a | **ADR-0270 P1 — L0 `GeometricRule` discriminated union** (`setback`/`alignment`/`explicit-area`) + back-compat `.transform()` stamping `kind:'setback'` on legacy packs | **L-451** | ✅ **DONE** (`d662d4dd`, `3956e083`, `c5fed456`). Zod round-trips incl. packs with no `kind`. ⚠ This row read "SAFE TO BUILD NOW" for days AFTER it shipped — the plan is what someone reads to pick up work, so a stale row here costs a duplicated implementation. |
| A1b | **ADR-0270 P2 — L2 solver branches on KIND**; `alignment` projects a depth band from the aligned edge instead of eroding every edge | **L-451** | ✅ **DONE.** Byte-determinism per kind (C58 §1.1) + an alignment zone yields a DEPTH-limited ring, proven at engine level (`alignmentEnvelope.test.ts`, 9 tests). |
| A1c | **ADR-0270 P3 — persist the inset ring; amend C58 §1.7; `null` (never fabricated) setbacks on alignment zones** | **L-451**, **L-455** | ✅ **DONE 2026-07-20. TRIPWIRE LIFTED.** Schema + command + WRITER + READER + round-trip tests all exist (stores 755/755, validators 42/42). Setbacks are nullable, with `null` ("not setback-governed") kept DISTINCT from `0`; the §1.6 check skips a null edge. ⚠ The merged-but-unwired state that preceded this is logged as **L-455**: a persisted field nothing writes is indistinguishable at runtime from a field that does not exist. |
| A1d | **ADR-0270 P4/P5 — "Why these numbers?" renders alignment AS alignment; Barcelona *ensanche* pilot pack** | **L-451** | Done when the panel shows *alineación + profundidad* (never three invented setbacks) and one real zone solves end-to-end. |
| **A1e** | **ADR-0271 P1–P4 — BLOCK-DERIVED *profunditat edificable*** (PGM Art. 242.2). The Eixample states an ALGORITHM, not a number, so ADR-0270's scalar `buildableDepth_m` cannot express it. P1 bisection solver · P2 L0 `block-derived-alignment` variant + `granularity` · P3 engine takes an optional `blockRing` and REFUSES rather than falling back to the ordinance floor · P4 block-ring dissolve from parcels + frontage classification from the roads layer. | **L-460**, **L-462**, **L-465** | ✅ **P1–P4 DONE 2026-07-20** (site-parcel-data 140/140; ADR-0271 written). Found and fixed TWO latent solver bugs on the way: **L-462** (a zero setback made the inset report degenerate — i.e. every party-wall/*mitgera* parcel in Barcelona) and **L-465** (a block with no identified frontage returned the 30 m ordinance CAP with `degenerate:false`). |
| **A1f** | **ADR-0271 P4b — the block-ring SOURCE.** | **L-460**, **L-473** | ✅ **UNBLOCKED + SHIPPED v226 (verified live).** The open design question is CLOSED and the premise was wrong: the scoping note *"the WFS has no BBOX, it is ID-keyed only"* is FALSE — BBOX `GetFeature` on `cp:CadastralParcel` returns features (21 for a Passeig de Gràcia bbox), and **the refcat encodes the manzana in its first 5 chars** (established empirically). `GET /api/catastro/block?refcat=…` verified end to end: manzana `02297`, **23 parcels, ≈14,090 m²** vs a nominal Cerdà 12,769 m². ⚠ v225 shipped this route BROKEN (written from docs, not a response, and untested) — replaced in v226 with 11 tests. **REMAINING: wire `CatastroBlockProvider` → `siteDispatch`.** |
| **A1g** | **ADR-0271 P5 — the Barcelona pack** | **L-461**, **L-474** | 🟡 **PACK SHIPPED v227 on a FOUNDER-SIGNED source** (*"I accept what the PDF says in 2009"* — the L-449 gate, AMB consolidation to 31-12-2009). It carries the **Art. 242.2 construction**, so *área de implantación* is real and cited. **STILL BLOCKED for edificabilitat:** the signed source contains **no height bands** (the 3,35 m Barcelona variant was never located in it; the GENERIC PGM at 3,05 m is what verification kept confirming), so `maxHeight_m`/`maxFloors` stay null with tests that go RED if filled. `plotRatioFAR` null is a FINDING (Art. 322.1 — no per-parcel FAR). **NEEDS A HUMAN:** (a) the Art. 327.2a table from DOGC 4893/5224; (b) whether the 2002 ordinance is in force; (c) the volumetric rules — *cossos sortints*, *planta baixa*, *àtic*/*sotacoberta*, *patis de llum* — **ZERO corpus coverage, and the largest unquantified risk to any edificabilitat figure.** |
| A2 | **Draft-extraction schema + verification gate** — draft `JurisdictionZoningContract` w/ per-field `sourceRef`; draft→published promotion is what earns `confidence:'structured'` | **L-449** | Founder approved option (a): C58 §1.2/§1.4 stand UNAMENDED. Nothing unverified is ever served as authoritative. |
| A3 | **Object storage + acquire the 318** (`spain/priority_318.csv`) | **L-450** | ~64 GB, ~$1/month. NOT the repo (GitHub caps 100 MB/file; cf. the 185 MB GLB catalogue already `.dockerignore`d, which is why `/items/*.glb` 404s). NOT Postgres — the DB holds only rule packs (~1–5 KB each; 318 ≈ 2 MB, inside the FREE tier). **Same bucket closes OBJECT-STORAGE-GLB.** |
| A4 | **Pilot end-to-end on Madrid + Barcelona + Córdoba** | L-449/L-450 | Prove ONE municipality fully before scaling. Three curations is a demo; 318 is a programme. |
| A5 | Extend coverage BY DEMAND | L-450 | An uncovered municipality selected by a user is a coverage SIGNAL; its envelope honestly reports `estimated-ruleset` until curated. Coverage grows where users are, not alphabetically. |

**Cost to start: ~$1/month object storage. Supabase stays FREE.** The expensive input is human
verification time, not infrastructure — plan against that, not against hosting.

**Owner: UNASSIGNED. Target: TBD.**

## Pipeline A — compliance-authoring: sub-task breakdown (transcribed from `SEPTEMBER-READINESS-MASTER-PROGRAM-PLAN.md` §8)

The coarse compliance L-items (mapping-table rows L-393, L-398–L-402 above) break into schedulable sub-items. Parents stay **OPEN**; scope + contract map verbatim from the program plan §8. The **serial engine core** is `L-403 (C57/C58) → L-398a → L-398b/c → L-398d → L-401a/b/c` (critical path, ~4 weeks); once the engine interface freezes (~wk2) Track J (L-399/L-400 adapters), Track R (L-402), and Track I (L-393) fan out in parallel.

**L-398 → envelope solver:**
- **L-398a** — Turf dep (lockfile-synced) + L0 schemas `BuildableEnvelope` / `JurisdictionZoningContract` / `ZoningRecord`, P5-pure, Zod round-trip. *(C58, C57; P5)* — **◆ FREEZE ENGINE IFACE ~wk2 ◆**
- **L-398b** — `ZoningRulesEngine` core: parcel ⊖ setbacks (Turf negative buffer) → inset polygon + `area×maxHeight` volume; pure L2, deterministic. *(C58; C19 §1.4)*
- **L-398c** — Two-fidelity resolution (`structured` / `estimated-ruleset` / `none`) + per-field provenance + confidence labels. *(C58; L-373)*
- **L-398d** — Wire engine → `site.updateZoning` command (P6 bus); no direct store write. *(C19; P6)*

**L-399 → zoning providers + rule packs:**
- **L-399a** — `DkZoningProvider` (Plandata anonymous WFS; `bebyggelsesprocent`/`maksbygningshoejde`/`maksantaletager`/`anvendelse`). *(C58)*
- **L-399b** — Curated `da-*` `JurisdictionZoningContract` pack for PDF-gap fill (mirror `rules/programRules.ts`). *(C58; L-373)*
- **L-399c** — `MucZoningProvider` (Catalonia MUC zone class) + curated `es-barcelona` pack. **SEPTEMBER — Track J fan-out, shipped "estimated — flagged"** (C58 confidence label; numeric pack human-validated post-launch). *(C58; L-373)*
- **L-399d** — `ChZoningProvider` (cantonal structural adapter) + curated `ch-*` pack (pilot cantons). **SEPTEMBER — Track J fan-out, shipped "estimated — flagged"** (26-canton validation = post-launch fidelity-hardening backlog). *(C58; L-373)*

**L-400 → parcel data layer:**
- **L-400a** — Lift shipped Catastro provider to `@pryzm/site-parcel-data` (L2) + `ParcelProvider` registry. *(C57; C12)*
- **L-400b** — `DkParcelProvider` (Matriklen via server-side Datafordeler key in the proxy clone). *(C57)*
- **L-400c** — `ChParcelProvider` structural adapter (cantonal cadastre; parcel geometry only — estimated zoning rides L-399d). **SEPTEMBER — Track J fan-out.** *(C57)*

**L-401 → authoring bridge:**
- **L-401a** — Thread inset polygon + maxHeight into `generateResidentialFromBoundary` + the typology-pipeline constraints stage (`joinProgramRulesWithRegulatory`) as generation bounds. *(C19 §1.6; C50)*
- **L-401b** — Permitted-use (`anvendelse`) → typology-brief seed (brief-capture stage). *(C50; briefSchema)*
- **L-401c** — Envelope-containment `SpatialValidator` in the validators stage (`runValidators` → `ValidationReport`): generated footprint ⊂ inset ∧ height ≤ cap; C53 slider-as-intent preserved (no parallel knob). *(C53; C19 §1.6)*

**L-402 → report + render:**
- **L-402a** — Explain-why compliance report artefact (envelope + rule refs + ordinance links + confidence chips); reuse the pure-SVG-string overlay pattern `buildPlanGraphOverlaySvg` (`apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`). *(SPEC-COMPLIANCE-REPORT NEW; C23)*
- **L-402b** — 3D translucent max-height envelope volume via the Forma massing renderer (`pryzmRenderFormaMassing`, `apps/editor/src/ui/geospatial/`, same ENU frame), `#6600FF`, P2-safe. *(C04/C18)*
- **L-402c** — CI fidelity-label gate (`estimated-ruleset` never authoritative); mirror `check-windcfd-beta-label.ts`. *(L-373)*

**L-393 → interop (Pipeline A Track I):**
- **L-393a** — IFC/DXF/Rhino round-trip harness (import→export→re-import geometry-delta compare). *(C25/C26/C32/C33)*
- **L-393b** — Adversarial malformed-file behaviour (crash vs silent-drop vs graceful reject). *(L-393)*

---

## L-414 — SPIKE: interrogate & manipulate BIM / IFC DATA inside the Cesium geospatial view (post-launch / research backlog — QUEUED, NOT priority, P3)

**SPIKE — research-only, NOT a launch item.** Phase: **post-launch / research backlog** (alongside the L-353/L-355/L-357 geospatial-context cluster and the C-CONTEXT-ENGINE governance gap). Founder-explicit: *"Keep this as a SPIKE … QUEUED — not priority."* No implementation; docs only this pass.

**The ask.** Today the Cesium / Forma 3D Site is a **passive context surface** — BIM massing + the buildable envelope are rendered as a **whole-scene glTF `Cesium.Model` blob** (`CesiumViewport.ts` `realModelOnGlobe`/`realModelOnForma`) with **no per-element feature IDs**, so `scene.pick` (`:1707`) only resolves the whole model, not an element. The founder wants a future capability to **select / query / interrogate — and eventually manipulate — the BIM / IFC data** in that view, "super-performant and flexible."

**Candidate research directions** (not yet investigated — the spike's agenda; full detail in the stub `docs/03-execution/spikes/spike-bim-ifc-data-interrogation-in-cesium.md`):
1. Per-feature metadata in the geospatial payload — **3D Tiles + `EXT_mesh_features` + `EXT_structural_metadata`** (glTF) → Cesium feature-ID picking + styling. *(replaces the opaque single-GLB)*
2. **ThatOpen fragment IDs → Cesium feature IDs** — reuse existing per-element identity (`gpu-pick.ts` / `ProjectSerializer.ts`) as one key across the editor canvas + the Cesium surface.
3. Streaming (3D-Tiles LOD, city-scale) vs in-memory single GLB; ties the L-355/L-358 GLB-export-perf work + the C10 budget.
4. **Selection bridge** — a Cesium pick drives the same C27 Inspect `IsolationVisibilityIntent` (P7) / C28 Data-panel selection as an editor-canvas pick (one selection model, not a parallel one).
5. Any "manipulate" (edit-in-Cesium) routes through the command bus (P6) + OTel spans (P8); it is a much larger scope than "interrogate" (read/select) and should be phased.

**Spans layers (call out up front):** BIM data model (C03 / `packages/schemas`) + IFC/ThatOpen interop (C25/C26) + Cesium render + the bridge (C12/C55 / `CesiumViewport`) + performance (C10). Not a single-package change.

**Governance — the load-bearing finding.** **No contract governs interactive BIM/IFC data interrogation inside the geospatial view.** C27/C28 cover BIM inspect + Pset data but only on the editor canvas; **C55 §1.2** frames the Cesium surface as context-only (analytical layers drape, never BIM). This is **not a present violation** (C55 §1.2 governs drape *layers*, not picking the BIM model already placed) but a **forward tension** — logged to `MISSING-CONTRACTS-AUDIT-2026-06-01.md`, cross-referenced from C55 §4 and C12.

**FOUNDER DECISION — RESOLVED (2026-07-18): DIRECTION CHOSEN, DEFERRED.** *"It would be good to queue this for the future — not priority but definitely nice to have."* The geospatial view **should eventually become a first-class interactive BIM/IFC surface** (a wanted end-state), NOT stay permanently context-only — but explicitly **queued, not-priority (post-September)**. So the direction is settled; the remaining governance step is **sequencing, not choosing**: when picked up, the FIRST deliverable is the governing contract (a C55 §1.2 amendment + C27/C28 extension, or a new geospatial-interrogation contract) **before any code**, and C55 stays as-written (context-only) until it lands. Fast-vs-correct is N/A (spike).

Links: L-414; ties L-353/L-355/L-356/L-357 (geospatial-context cluster) + the C-CONTEXT-ENGINE governance gap (L-359) + L-374/L-412 (context/pane view work) + C57/C58 (parcel/envelope-in-Cesium). Contracts: C12, C55 §1.2, C19, C03, C27, C28, C25, C26, C10, C04. Spike stub: `docs/03-execution/spikes/spike-bim-ifc-data-interrogation-in-cesium.md`. Queue: geospatial / context-engine (primary) + data-platform (C03/C27/C28) + interop/IFC (C25/C26 + ThatOpen). Owner UNASSIGNED. Target TBD (post-launch).

---

## L-432 — Parcel boundary + buildable envelope as SNAP TARGETS (P1, Pipeline B)

**Founder (2026-07-19):** *"consider that the boundary line + envelope on pryzm views should allow snapping for element creation."*

**Why P1, not polish.** L-425/426/431 made both cadastral references *visible* in the PRYZM 3D + plan views, and L-401 makes the *generators* build inside the envelope. But a user drawing walls **by hand** has nothing to bite onto, so hand-authored geometry can silently violate the very setback line the envelope panel claims to enforce. Compliance-by-construction currently holds **only on the generated path**; snapping is what extends it to manual authoring. Until then the guides are decorative.

**Architecture — additive; reuse, do not reinvent.** `packages/snapping` (L1) already exposes `ISnapProvider` + `SnapManager.registerProvider()` with 11 shipped providers (`SnapManager.ts:12-22`). The work is **one** new `SiteContextSnapProvider` yielding:
- parcel-boundary **vertices**, **edges**, edge **midpoints** and **perpendicular-foot**;
- buildable-envelope **inset-ring** vertices + edges — the setback line is the highest-value target, since *"build to the setback"* is the single most common architectural move.

Source of truth is `siteModelStore.getParcelBoundary()` + `getLastBuildableEnvelope()` — the same pair L-431 slice 2 already feeds to the plan pane via `siteContextProvider`, so the read path exists.

**Design decisions to make explicitly:**
1. These are **reference geometry, not model elements** — they must snap but never become selectable/editable BIM (C34 reference-linework treatment, mirroring the dashed plan-pane draw).
2. A **distinct snap glyph + toggle**, so a setback snap is legible *as* a setback snap and not confused with a grid or wall snap.
3. **Priority ordering** vs existing providers: an envelope edge should probably outrank the grid, but not an explicit wall endpoint.

**Frame coupling — sequence AFTER the L-430 slice-3 decision.** Snapping works in scene coordinates. If slice 3 de-rotates the parcel ring at commit (the preferred RIGID-TRANSFORM-LAST option), the boundary and envelope become axis-aligned in the authoring frame and these snaps line up with orthogonal wall drawing **for free** — the project-north work compounding. If instead θ⁻¹ is applied per-consumer, this provider becomes another θ consumer. Building it before that decision means building it twice.

Contracts: **C58** (envelope), **C19** (site + parcel), **C34** (reference linework), **C11** (element pipeline). Files: `packages/snapping/src/providers/*`, `SnapManager.ts:12-22,49`, `siteModelStore`, `ParcelBoundarySceneRenderer.ts`. Completes L-425/426/431; extends L-401 to manual authoring. Owner UNASSIGNED.


---

## L-442 — Deploy: precompile the server so boot stops transpiling (P0 mitigated, durable fix open)

**Link:** audit row **L-442**. **Queue:** infra / deploy. **Owner:** UNASSIGNED. **Target:** TBD.

**Phase 0 — DONE (mitigation, this pass).** `fly.toml` VM 512 MB/1 cpu → 1024 MB/2 cpu;
`grace_period` 90 s → 60 s (Fly caps it at 60 s, so 90 s was tolerance we never had).
This buys headroom; it does not fix the cause.

**Phase 1 — the durable fix (OPEN).** Stop transpiling at boot. `dist/index.cjs` currently
re-spawns `server.js` under `--import tsx`, so ~100 workspace TS packages are compiled on
every cold start before `httpServer.listen()`. Precompile the server and its workspace deps
in the Docker builder stage and run plain `node` at runtime.

**Why this is P0 and not cosmetic:** boot cost grows monotonically with every package added.
It was intermittent for ~3 weeks and became deterministic in one session. Any future package
can re-break deploys, and the retry loop cannot rescue a deterministic overrun.

**Acceptance:** cold boot binds `0.0.0.0:5000` in <20 s with no `tsx` in the runtime image;
a deploy succeeds on attempt 1 with the machine reaching a good state.

---

## L-443 — Planning Rules Engine: extend C58's rule model (P1, CONFLICT — needs a decision)

**Link:** audit row **L-443**. **Queue:** compliance / geospatial (C58). **Owner:** UNASSIGNED.
**Target:** TBD. **Blocked on:** a human decision, not on engineering.

**The finding:** the founder's "compiler" model *is* C58 — §1.5 (jurisdiction-agnostic core +
adapters), §2.2 (`JurisdictionZoningContract`), §2.4 (`insetPolygon = parcel ⊖ setbacks`).
No new architecture is required. What is required is **content** and **one model extension**.

### Phase 1 — DECISION (blocking, human)
C58 §2.2 admits only `setbacks: { front_m, side_m, rear_m }`. The founder's own example
`{"alignment":"street", …}` cannot be expressed, nor can Madrid's published reality
(`Fondo de la Edificación` polyline + `Alineaciones`, verified live) or *profundidad
edificable*. **Choose:**
- **(a)** extend C58 with an alignment/depth/street-width rule family (recommended — it is
  the actual data shape of Spain's second city), or
- **(b)** restrict rule packs to zones that genuinely express a setback triple, and state the
  coverage limit publicly.

**Do not** coerce alignment zones into a front-setback number: that yields confidently wrong
envelopes on dense urban fabric, which is precisely where the product is most used.

### Phase 2 — the missing link: `calificación` (zone code)
L-441 landed national *clasificación* (urbano/urbanizable/rústico) via SIU. But applying a
rule requires the **specific zone code**, which is patchier — Catalonia and Valencia publish
it, Andalucía does not. **Without this, a perfect rule library is unusable.** This, not the
rule schema, is the practical blocker for step 1 of the founder's roadmap.

### Phase 3 — three-city end-to-end proof (Madrid · Barcelona · Córdoba)
Extract real ordenanzas into a `JurisdictionZoningContract`, run against real Catastro
parcels, compare the envelope to the municipal viewer. Madrid first — it fails on the hard
(alignment) case while changing the schema is still cheap. Córdoba tests Andalucía, where no
regional zone-code source was found. **Output: how long one municipality actually takes**,
turning ×318 from a guess into arithmetic.

### Phase 4 — Portugal (UNSTARTED, not an extension of Spain)
Zero coverage: no contract, no ADR, no verified endpoint. PDM ≠ PGOU, 308 municipalities,
different infrastructure (DGT / SNIG). Needs its own live-verification pass before any
estimate.

---

## L-454 — Forma context: bound the EXPENSIVE near ring (P1 perf, FIXED — pending live verify)

**Link:** audit row **L-454**. **Queue:** site / perf. **Contract:** **C12** (context engine),
**C04** (rendering). **Tag:** `§FEAT-FORMA-CONTEXT-NEAR-CAP`. **Status:** implemented
2026-07-20, 12/12 tests, root `tsc` clean; live perf verify OUTSTANDING.

### The defect
`§FEAT-FORMA-CONTEXT-EXTENT-LOD` (L-368) capped the FAR ring at 900 — shadows already OFF,
height clamped to 24 m, no outline, i.e. **the cheap half**. The NEAR ring — extruded to true
height, outlined, `ShadowMode.ENABLED` — had **no ceiling at all**. Live: 2,545 near + 900 far;
a Barcelona run hit 4,542 near. *A gap between the plan and the implementation, not a tuning
problem.*

### Why the literal fix ("add a cap + nearest-first sort") would have been wrong
Three findings, each of which would have shipped a new defect:

1. **The cap cannot live in the fetch.** The `near` collection feeds three consumers: the
   renderer, `setNeighbourFootprints` (PW.2 party-wall / blind-façade resolution) and
   `lastContextCollection` (site-metric population / wind / heat density grids). Capping the
   collection under-counts built density and yields a **wrong metric number** — a fabricated
   figure, which the standing constraint forbids outright. Tiering is applied at the **render
   boundary**; the fetched collection stays complete.
2. **Overflow is DEMOTED, not dropped.** Dropping leaves a **donut hole** — footprints between
   the cap radius and the near-bbox edge vanish while genuinely *farther* far-ring blocks keep
   drawing. Demoted footprints take the cheap shading, so **total entities are unchanged; only
   shadow casters are bounded.**
3. **The demoted tier keeps TRUE height.** The far annulus's 24 m clamp exists so no distant
   skyscraper dominates; applying it inside the near bbox would squash a real tower in the
   site's own neighbourhood — a visible geometry lie.

### The cap is derived, not felt
The entry warned that the far ring's 900 became load-bearing with no recorded evidence.
The primary rule here is **distance**, pinned to the Cesium shadow map's own
`sm.maximumDistance = 600` (§FORMA-GRAZING-BANDING-FIX). Beyond it Cesium renders no shadow at
all, so a caster there pays full cost for nothing — and the near bbox (0.008° ≈ 890 m on-axis,
~1,259 m at the corners) reaches **~2.1× past it**, which is *how* the ring accumulated
thousands of pointless casters.

| Input | Value | Source |
|---|---|---|
| Shadow horizon | 600 m | `CesiumViewport.ts` `sm.maximumDistance` (in-code) |
| Near bbox | 0.008° ⇒ 3.17 km² | `CONTEXT_BBOX_HALF_DEG` |
| Density, typical | ~803 /km² | live 2,545 footprints |
| Density, Barcelona | ~1,433 /km² | live 4,542 footprints |
| Shadow disc | 1.131 km² | π·0.6² |
| ⇒ Expected shadowed | **~908 … ~1,621** | density × disc |

So the distance rule alone cuts the typical case **2,545 → ~908 (−64%)** with no invented
number. `CONTEXT_NEAR_MAX_BUILDINGS = 1600` is a **runaway backstop only**, set just above the
densest fabric observed, applied nearest-first.

**⚠ HONESTY:** no GPU frame-time capture was taken. This is derived from the shadow horizon and
measured footprint densities, and says so in the constant's doc comment so it is never later
mistaken for a profiled value. A coupling-guard test pins the radius to 600 so the two knobs
cannot silently drift apart again — the exact failure mode being closed.

### Still open from this entry (deliberately untouched)
- The far-extent fetch intermittently returning 0 with a single narrow retry (the "takes a while").
- `readiness NEVER ARRIVED at stage "anchor" (25,000 ms)` before the tile clamp resolved at 52.16 m.

Neither is addressable by a render-tier change; both need their own evidence.

---

## L-511 — 3D context-data country study (buildings/LOD/height · roads · pedestrian · water · parks/trees)

**Links back to:** L-511 (`V1-LAUNCH-READINESS-AUDIT.md`). **Phase:** post-launch quality (P2), but
**Spain is founder-designated ship-first**. Full study + gates: `CONTEXT-DATA-COUNTRY-STUDY.md`.

**Pattern (correct-fix):** one ingestion **adapter per country behind the existing per-country
resolver** (the Barcelona zoning resolver's shape) → Tier A native LOD2 (NL/DK/CH/DE) mapped direct;
Tier B footprint + **shared nDSM height module** (ES/FR/PT); Tier C = current OSM/Overpass fallback,
untouched except as the clean fallthrough. Every rendered feature carries a `REAL — <source>` /
`ESTIMATED` provenance badge (**C23**), same as the zoning "Why these numbers?" panel.

**Two-phase gate:** Spike (live endpoint + sample + CRS/license + 5-building check + gaps) → founder
go-ahead → Implementation (adapter + reproject + mesh map + badge + re-run spot check). **No impl
before its spike Gate is evidence-passed.**

| Sub-task | Phase | Status |
|---|---|---|
| L-511a NL spike (reference pattern) | spike | **Buildings Gate PASSED (live); BGT re-verify pending** |
| L-511b **ES spike (ship-first)** | spike | **Footprint+height Tier-B Gate PASSED (live)**; Catastro bbox axis-order + nDSM module are the impl deltas |
| L-511c shared **nDSM height module** (footprint ∩ (DSM−DTM)) — ES+FR+PT | infra | NOT STARTED (build once) |
| L-511d ES adapter (Catastro EPSG:25831 → WGS84 + `numberOfFloorsAboveGround` stopgap → nDSM) | impl | BLOCKED on go-ahead |
| L-511e provenance badge on context features (C23) | impl | NOT STARTED |
| L-511f DK / CH / FR / DE / PT spikes | spike | NOT STARTED (build order) |

**Contracts touched:** C12, C19, C21, C23, C55. **Coverage note:** no contract yet governs
context-layer *provenance badging* end-to-end (C23 covers AI-audit provenance; extend it or add a
context-ingestion spec) — logged as a gap, not invented.

### L-512 — Spain deep-dive: concrete source map + hybrid-height model (child of L-511)

Refines L-511b for the ship-first country. Full docs: `spain/SPAIN-HEIGHT-MEASUREMENT.md`,
`spain/topics/*`, `spain/CONTEXT-DATA-SPIKE.md`. Design deltas this locks in:

| Sub-task | Phase | Status |
|---|---|---|
| L-512a **Hybrid-height model** — `floor_count` (Catastro) + `measured_height_m` (LiDAR nDSM 90th-pctile, cycle-tagged) + `height_confidence`; flag disagreements >~1 floor | design | **DOCUMENTED** — feeds the C23 provenance-model extension |
| L-512b **Shared nDSM module = L-511c**, now with the concrete PDAL/GDAL pipeline + 90th-pctile statistic + ASPRS class filter | infra | spec DONE, build NOT STARTED (ES+FR+PT) |
| L-512c ES roads — **BTN25 Redes de Transporte + CartoCiudad `portales`** (entrance points) | impl | source verified live, NOT STARTED |
| L-512d ES water — **BTN25 hydrography + IGR Hidrografía** (Pfafstetter) | impl | source verified, NOT STARTED |
| L-512e ES parks — **BTN25 zonas verdes/instalaciones** | impl | source verified, NOT STARTED |
| L-512f ES trees — **Open Data BCN** per-tree (Barcelona Tier-A; procedural elsewhere) | impl | CKAN live; **exact dataset slug to confirm before wiring** |
| L-512g roof shape — RANSAC reconstruction from classified LiDAR, Barcelona-first; badge "reconstructed" | stretch | NOT STARTED |

**Contract action (do NOT skip):** extend **C23** provenance to carry graded, source-tagged,
cycle-aware confidence (or add a context-provenance spec) BEFORE the badge ships — the three height
fields must not collapse into one "REAL". Coverage gap logged to MISSING-CONTRACTS-AUDIT.

### L-514 — Portugal deep-dive: source map + single-source LiDAR-height model (child of L-511)

Refines L-511f (PT spike) for build-order #7. Full docs: `portugal/PORTUGAL-CONTEXT-DEEP-DIVE.md`,
`portugal/README.md`, `portugal/topics/*`. **NOT live-probed this session** — every source is a spike
lead to re-verify (UNVERIFIED), unlike the live-verified Spain pass. **Reframing:** PT is NOT
uniformly the weakest — new 2023–25 national parcel cadastre + Lisbon's rich municipal 3D model; the
weakness is patchy parcel coverage (~134 munis) + no national LOD outside Lisbon. Design deltas:

| Sub-task | Phase | Status |
|---|---|---|
| L-514a **Parcels — Carta Cadastral coverage-check** (DL 72/2023, SNIC, DGT; NIC + geometry; ~134 munis = 127 CGPR + 7 SiNErGIC) — per-municipality resolver, PDM/OSM proxy fallback; BUPi is NOT a source | design | **DOCUMENTED** — coverage-gated; verify per-muni (esp. Lisbon/Porto) + OGC-API status |
| L-514b **DGT-LiDAR nDSM height = SAME module as L-511c/L-512b** (10 pts/m², DTM 50cm/DSM 2m, 90th-pctile) — **single-source: NO floor-count cross-check** → stands alone, lower confidence; no published RMSE-Z | infra | spec DONE (reuses ES/FR/PT module), build NOT STARTED |
| L-514c **Lisbon municipal 3D model licence verify** — CML "Modelo Tridimensional da Ocupação Superficial" (LOD2/3-ish) + Rede Viária + modelled sidewalks; **VERIFY open-redistribution** at geodados-cml.hub.arcgis.com | verify | **BLOCKER** — UNVERIFIED licence; do not integrate until confirmed |
| L-514d PT roads/water/parks — OSM/Overture + IP (roads, open-status UNVERIFIED) + SNIRH/DGT hydrography (water, flatten) + COS/COSc (parks, coarse) | impl | leads documented, NOT live-probed, NOT STARTED |
| L-514e PT trees — **Lisbon CML "Arvoredo"** legally-mandated per-tree register (Tier-A) + DGT LiDAR CHM elsewhere (**verify class codes vs ASPRS first**); procedural fallback | impl | source documented, NOT live-probed, NOT STARTED |

### L-522 — Terrain / DTM deep-dive: byproduct-of-height reframing + per-country DTM adapters (child of L-511)

Refines L-511 for the terrain-draping surface. Full docs: `CONTEXT-DATA-TERRAIN.md`. **NOT
live-probed this session** — every source is a spike lead to re-verify (UNVERIFIED), like the L-514
Portugal pass. **Reframing: terrain is NOT a new source** — the DTM is a byproduct of the SAME
classified LiDAR pull already done for building height (class-2 ground -> DTM); its `DTM` half IS
the draping surface. **Spain needs NO new sourcing**; the new work is per-country DTM adapters +
FABDEM global fallback + grid/accuracy badging. Design deltas:

| Sub-task | Phase | Status |
|---|---|---|
| L-522a **ES DTM reuse + grid badge** — PNOA/ICGC class-2 -> DTM = byproduct of the L-511c/L-512b height pull (NO new sourcing); add a **grid-resolution badge** alongside the coverage-cycle badge (3rd-coverage = finer terrain) | design | **DOCUMENTED** — reuses the height module; no new ES fetch |
| L-522b **`terrain_source` adapter interface** — `country/region -> terrain adapter` yielding `dtm_raster` (bare-earth, NEVER a DSM) + `grid_resolution` + `vertical_accuracy_rmse`; pipeline consumes raster + badge, never needs the country | design | **DOCUMENTED** — mirrors the height resolver pattern |
| L-522c **FR — IGN LiDAR HD** (MNT/DTM 1x1km @ 50cm, ~10cm vert; national, completion targeted 2026) + **RGE ALTI** 5m fallback (~7m RMSE alpine, flag like PNOA-1st) | impl | leads documented, NOT live-probed, NOT STARTED |
| L-522d **UK — EA LIDAR Composite DTM** 1m (~99% England, +/-15cm RMSE) + **Scotland** own composite; **Wales + NI check individually** — do NOT assume EA coverage extends there | impl | leads documented; **devolved-nation coverage UNVERIFIED** |
| L-522e **DE — DGM1 per-Land (16 adapters)** — 1m, published per state, no federal endpoint (own licence/tiling/cadence each); mirrors the L-511 German state-router | impl | **16-adapter cost flagged**; NOT live-probed, NOT STARTED |
| L-522f **NL — AHN reference adapter** — DTM + DSM, sub-decimetre; gold-standard national LiDAR terrain, replicate this adapter shape | reference | **DOCUMENTED** — the pattern to copy (as 3DBAG/AHN is for buildings) |
| L-522g **FABDEM global fallback** — GLO-30 DSM + ML bare-earth correction (~30m, coarse but genuinely bare-earth); use INSTEAD of raw SRTM/GLO-30 (surface models); **verify CC BY-NC-SA non-commercial clause** vs PRYZM commercial use | impl | **BLOCKER-risk = licence**; leads documented, NOT live-probed |

**Contract action (do NOT skip):** the grid+RMSE-tagged terrain provenance is richer than C23's
binary REAL/ESTIMATED badge — governed by the SAME graded-provenance gap already logged under L-512
(MISSING-CONTRACTS-AUDIT). Extend C23 (or the context-provenance spec) to carry grid + accuracy
tags; RMSE stays **NULL** where the provider published none (do not invent — the L-514 rule).

### L-515 — envelope depth applied to the WRONG parcel edge (Barcelona)

Founder: the profunditat edificable band runs off a SIDE edge, not measured back from the street
frontage. The depth SOLVE is correct (`blockDerivedDepth.ts` per-edge inset, refuses w/o a `front`
edge); the bug is upstream **frontage classification** — a side edge is being marked `front`.

| Sub-task | Phase | Status |
|---|---|---|
| L-515a **read §L-515-FRONTAGE-DIAG** on a real Barcelona parcel (probe shipped v244) — is the `front` edge the street side or a side edge? | diagnose | probe LIVE, awaiting console line |
| L-515b Fix the classifier so the parcel's actual STREET edge is the one the depth insets from (frontage-from-road adjacency; check the L-502 manzana-perimeter fallback interaction) | fix | BLOCKED on L-515a |
| L-515c regression test: a corner + a mid-block Eixample parcel both inset from the correct street edge | test | NOT STARTED |

**Contracts:** C58 (envelope determination), ADR-0270 (alignment/depth clip), ADR-0271 (block-derived
depth), C19 (frontage). Correct-fix = real road-adjacency frontage, NOT "longest edge = front" (wrong
on corner/irregular parcels). Relates L-507 (depth shape), L-502 (manzana-perimeter frontage).

### L-518 — envelope panel summary mislabels real BCN data as ESTIMATED + reads empty

Founder: the top summary shows ESTIMATED + empty setbacks while the detail shows real PUB data.
Two causes: (1) the catastro-muc record is rule-pack-solved → `confidence:'estimated-ruleset'` despite
published per-field provenance; (2) the setback-centric summary is null-by-design for alignment zones.

| Sub-task | Phase | Status |
|---|---|---|
| L-518a **C58 decision**: add/assign a confidence tier for "real determination constructed from a real block + rule pack (Art. 242.2)" distinct from `estimated-ruleset` | contract | BLOCKED — needs the founder/C58 call (gap logged) |
| L-518b Once tiered: BCN envelope carries the real confidence → badge + sourceLine reflect PUB, not ESTIMATED | fix | BLOCKED on L-518a |
| L-518c Alignment-zone summary: surface Buildable DEPTH + AREA in the headline (not just the null setback triple) so it isn't "empty" | fix | NOT STARTED |

### L-519 — interactive envelope↔data linking (click a row → select its geometry)

Founder: click "Buildable depth" etc. → highlight the envelope faces + boundary edges that row governs.
Study/plan done (see audit L-519). Correct-fix reuses SelectionBus + the GPU-pick highlight/overlay
pattern; the join key is the derivation `constraint` already on every row.

| Sub-task | Phase | Status |
|---|---|---|
| L-519a **C58: `constraint → geometry-selector` map** — expose, per derivation row, which envelope faces + boundary edges it derives from (depth→rear band edge + dimension; alignment→front edge; medianera→side edges; area→inset face) | schema | NOT STARTED (foundation) |
| L-519b Panel row `click`/hover → publish a highlight intent on **SelectionBus** (no one-off path) | ui | NOT STARTED |
| L-519c Overlay renderer draws the mapped envelope edges/faces + boundary segments (reuse element-highlight overlay), in **both** 3D Site (Forma) + 3D globe (Cesium) | render | NOT STARTED |
| L-519d Bidirectional: hover geometry → reverse-highlight the row (Editable-Living-Graph pattern) | ui | STRETCH |

**Contracts:** C58 (constraint→geometry map — the foundation), C27 (Inspect/selection), C28 (Data panel),
C03 (SelectionBus), C06, C12/C55. **Coverage gap** (data↔geometry link) logged to MISSING-CONTRACTS.

**Contract action:** governed by the SAME graded-provenance gap as L-512 (logged in
MISSING-CONTRACTS-AUDIT). PT is the MORE ACUTE case — single-source LiDAR height with no cross-check,
so `measured_height_m` + `height_confidence` must ship WITHOUT collapsing to one "REAL", and must
record the ABSENCE of a floor-count field rather than inventing one.

### L-513 — context 3D at MAX performance: static pre-baked tiles (delivery layer for L-511/L-512)

Root cause (live-reproduced): context is fetched live from public Overpass per site visit; public
mirrors 406/timeout/429 — an unfixable hot-path. Full design: `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`.
**Absorbs L-504** (context <2 s). **P1** — primary-surface UX + it gates the value of L-511/L-512.

| Sub-task | Phase | Status |
|---|---|---|
| L-513a Bake **Barcelona** context → **PMTiles** → Fly object storage | infra/bake | **TOOL BUILT** — `tools/context-bake/` (bake.mjs orchestrator + Dockerfile + README); download→osmium clip→tags-filter→export→tippecanoe→PMTiles; auto-detects local tools vs bundled Docker image; `--check`/`--dry-run` verified. Ready to run where Docker/toolchain exists (dev/CI/Fly). Source Geofabrik Cataluña live. NEXT: run it + upload + wire client reader (L-513b/c). |
| L-513b Client tile read: viewport z/x/y **range requests** + **Web Worker** decode + **instanced** render | client | NOT STARTED |
| L-513c Swap `fetchContextBuildings` body to tiles; Overpass demoted to emergency fallback (badged ESTIMATED) | client | code already anticipates the swap |
| L-513d Provenance badge travels IN the tile (keeps C23 honest) | client/data | NOT STARTED |
| L-513e Feed **L-511/L-512 authoritative** data into the same bake (3DBAG NL; Catastro+PNOA nDSM ES) + Cesium 3D Tiles for native LOD2 | infra | after L-513a proves the path |
| L-513f Region rollout on the L-511 build order | infra | NOT STARTED |

**Perf budget:** first bytes <50 ms (CDN range GET), near-ring <500 ms, repeat ~0 ms (cache), no
rate-limit risk. **Contracts:** C12/C55/C19/C10. **NOT this item:** the grey-scanline render fault
(webgl-fallback / §PERF-WEBGPU-FRAGMENT — relates L-503, separate live-browser diagnosis).

---

## Session 2026-07-21 — Barcelona real end-to-end production hardening (deploys v243–v253)

Barcelona real end-to-end (draw + select) reached **founder-confirmed SOUND** this session. Every
item cross-links its audit row (`V1-LAUNCH-READINESS-AUDIT.md L-NNN`). ✅ = shipped + confirmed / live;
🔧 = built, needs a run; ⏳ = open, needs a machine/browser/deep pass.

| L-NNN | What | Phase | Status |
|---|---|---|---|
| **L-508b** | Envelope panel readable with REAL data (widen 300px/minWidth 272px; `overflowWrap:anywhere`→`break-word`; stacked "Why?" rows so the value column can't starve) | UI / envelope panel | ✅ **v243** — founder-confirmed |
| **L-515** | Envelope depth insets from the real STREET frontage, not the −Z placeholder (parcel frontage = block-perimeter membership, reusing `classifyBlockFrontages`) | zoning / envelope geometry | ✅ **v245** (probe v244) |
| **L-516** | Envelope no longer waits on the slow Overpass roads fetch (2 s deadline; roads are a manzana-perimeter *refinement*) | zoning fetch latency | ✅ **v246** |
| **L-516b** | MUC clau ‖ Catastro parcel fetched in parallel (independent point lookups) | zoning fetch latency | ✅ **v251** |
| **L-517** | 3D-tiles parcel-clip facade-sliver mismatch (under-sized clip vs offset) | globe / photoreal clip | ⏳ needs a **live Cesium** clip-margin pass |
| **L-518** | New C58 confidence tier `block-constructed` → real **"Real · constructed"** badge + honest source line, not ESTIMATED (assigned only when `alignment.depthBinding` present) | zoning / envelope provenance (C58) | ✅ **v247** — founder-confirmed the decision; governed by `spain/barcelona-catalonia/RISK-REGISTER.md` R1 |
| **L-518c** | Alignment-zone summary shows Buildable depth + alignment offset + area instead of the null setback triple | UI / envelope panel | ✅ **v249** |
| **L-519** | Interactive envelope↔data linking (click a panel row → select its geometry) | geospatial / UI + zoning | ⏳ studied + planned (L-519a–d); foundation = C58 `constraint→geometry` map |
| **L-520** | 3D Site paints on first layout via a ResizeObserver (was blank until an incidental reflow; canvas mounts 0×0) | globe / Cesium canvas-sizing | ✅ **v250** |
| **L-521** | Draw flow queries Catastro at the drawn parcel's centroid, not the geocode anchor (new `sceneXZToLatLon` inverse; undo θ then invert projection) | zoning / draw-flow trigger | ✅ **v248** — founder-confirmed REAL on a draw |
| **L-521b** | Query point = AREA centroid (shoelace), not the vertex average (fixed intermittent estimated on irregular/concave draws) | zoning / draw-flow | ✅ **v252** |
| **L-522** | Terrain / DTM sourcing study (byproduct of the height LiDAR pull; per-country adapters + FABDEM fallback) | geospatial / context-data (docs) | ✅ documented (child of L-511); ⚠ FABDEM non-commercial licence |
| **L-523** | Envelope + context latency (Part A envelope = L-516/L-516b ✅; Part B context = the tile bake) | zoning fetch + geospatial/infra | ✅ Part A; ⏳ Part B = L-513a bake |
| **L-524 / L-524a** | Front-load the context wait: prefetch context at the **parcel** centroid (not the geocode anchor) so the render hits cache | geospatial / context prefetch | ✅ **v253** Part A (parcel prefetch); ⏳ Part B (context-ready loading gate) |
| **L-513a** | Context tile-bake tool (`tools/context-bake/`: download→osmium clip→tags-filter→export→tippecanoe→PMTiles; Docker or local) | infra / bake | 🔧 **BUILT** — needs a Docker run + upload |
| **L-513b** | Client PMTiles tile-reader (turnkey spec in `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` §9) | client / context | ⏳ spec ready; needs real tiles + the dep (lockfile sync) |
| **L-525** | Envelope HEIGHT + DEPTH too small vs the real Eixample neighbours (P1 ACCURACY) | zoning / envelope accuracy | ⏳ **root-caused, needs the deep 3-step pass** — see the L-525 section below |
| **L-527** | CONTEXT (neighbour) building heights inaccurate — ~36% are OSM-tagless → flat 9 m default | geospatial / context height | ⏳ root-caused (§CTX-HEIGHT-PROVENANCE); fix = feed L-512 LiDAR-nDSM heights into the context render + the L-513a bake; badge assumed heights honestly meanwhile |
| **L-526** | Verify the profunditat LEGAL basis (citation chain + 2008 Art. 327 §2 + "max depth" metric) — the RULE side of L-525 depth | zoning / legal provenance | ⏳ probe-first (L-526a–c); external research prompt in `spain/barcelona-catalonia/L-526-LEGAL-RESEARCH-PROMPT.md` |

### L-525 — envelope accuracy (the deep investigation)

Two independent defects (audit L-525 has the console evidence). **Do NOT blind-fix; each needs a probe.**

| Sub-task | Phase | Status / plan |
|---|---|---|
| L-525a **HEIGHT — source the 13a alçada reguladora** (street-width → regulated height per the PGM table; ~20.75 m @10–20 m streets, ~24.4 m wider) and drive the 3D massing height from it, replacing the fabricated ~9 m default. The alignment-zone envelope currently has a NULL max-height and the massing invents 9 m. | zoning / height data | OPEN — a real DATA addition (fetch the amplada de vial + the PGM height table); needs a live probe of the source, like the depth pipeline |
| L-525b **DEPTH — verify the block dissolve** captures the full Cerdà manzana. Block 02309 dissolved to ~6,686 m² ≈ HALF a normal manzana (~12,000 m²); a partial block makes the all-perimeter inset floor out at 11 m (`min-floor`). Probe: log/compare the dissolved block-ring footprint vs the real manzana outline for a known parcel. | zoning / block assembly (C57) | OPEN — if the block is partial, fix the Catastro manzana query/dissolve; if whole, go to L-525c |
| L-525c **DEPTH — re-examine the depth MODEL for small/irregular blocks.** All-perimeter inset (L-502) over-erodes a small block; the real profunditat edificable is a street-frontage BAND leaving a central courtyard, not an inset from every edge (incl. chamfers). Decide whether the model needs frontage-band geometry for non-square blocks. | zoning / depth model (blockDerivedDepth.ts) | OPEN — after L-525b confirms the block is whole |

**Contracts:** C58, ADR-0270/0271, C57, `blockDerivedDepth.ts`, the (unbuilt) alçada-reguladora height table.

### L-526 — verify the profunditat-edificable LEGAL BASIS (the rule/citation side of L-525 depth)

Founder doubt (audit L-526): the depth may be too shallow because the RULE or citation is wrong, not
just the geometry. **Probe the primary sources; do not assume.**

| Sub-task | Phase | Status |
|---|---|---|
| L-526a Confirm the **citation chain** — PGM-1976 NNUU Art. 242.2 (profunditat construction) + Art. 322.1 (13a), via AMB/MMAMB Normativa Urbanística Metropolitana (Dec 2010) consolidated 31-12-2009 — is the governing + current text we cite in `esBarcelonaEnsanche.ts` (`ordinanceRef`). | legal / provenance | OPEN |
| L-526b Confirm **"maximum depth" = the max DEPTH OF THE BUILDING** measured perpendicular from the alineació inward (our 11 m) — the right metric, not a courtyard offset or other measure. | legal / semantics | OPEN |
| L-526c **Source the 2008 modification to Art. 327 §2** (the panel caveats it is "not reflected", yet our source is consolidated to 31-12-2009 — a contradiction to resolve). Art. 327 governs alçada + storeys + profunditat, so this could be WHY depth (and height, L-525a) is off. If it changes 13a → update the pack + re-badge; note in RISK-REGISTER R1. May reopen the founder-signed **L-449** source-acceptance gate. | legal / rule model (C58) | OPEN — highest-value probe |

**Contracts:** C58 (rule + provenance), ADR-0271, L-449 (source acceptance), `esBarcelonaEnsanche.ts`.
This is the LEGAL half; **L-525b/c is the GEOMETRY half** (block dissolve + depth model). Do both — a
correct rule on a partial block is still wrong, and a whole block with a stale rule is still wrong.
