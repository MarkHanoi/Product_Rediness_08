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
| G1 no host-wall-move freeze | 0.1/0.2 | aba7751 | F1 shipped; Q6 in flight |
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
| L-11 Environment real sun/shadows/buttons | new **Phase 3.3** (real environment) | design ready (WIP stashed) → ADR + impl |
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
| L-60 UI buttons overlap (split-view / Site-Globe over logo) | 1.1 UI/layout | **IN FLIGHT** (UI-layout agent aed4b026; reposition CSS) |
| L-61 T/L wall joint still not clean (L-corner + 3rd-wall T) | 0.5 geometry | **IN FLIGHT** (SOLE WALL AGENT a6f75567; ADR-0055; kill spike + doubled edge) |
| L-62 layered wall type renders as plain default in PLAN view | 0.5 geometry / plan-projection | **QUEUED (sole-wall lane, behind L-61)** — plan projection must emit LAYERED footprint (two render paths), not plain single-volume; C15/ADR-0055 |
| L-63 hosted-door wall MOVE freezes app (recurring; runaway rebuild loop) | 0.5 geometry / room-detect | **QUEUED (sole-wall lane, TOP — BLOCKER)** — resolver trim leaves >hostSnap dangling gap → non-closing loop re-arms rAF rebuild; fix trim + loop-guard redetect; ADR-0055 |
| L-64 black flash on polyline wall CLOSE (ShadowDepthTexture destroyed mid-submit) | 4.x render / ADR-0111 | **QUEUED (render lane, extends L-59)** — ref-count/defer shadow-map realloc across wall-commit frame (setShadowReallocFrozen family); must not regress L-39/L-59 |
| L-65 plan-view element creation lags ~0.5s (full plan re-projection per add) | 0.4 perf / plan-projection | **QUEUED (plan-projection perf lane, own agent)** — incrementally project only the newly-dirtied element (EdgeProjectorService + NativeElementMeshExporter + ViewDependencyTracker); MUST NOT touch wall geometry (sole-wall lane); builds on L-52/L-06; C04/DOC-1.x |

**Waves shipped to Fly (feat/wall-move-dimensions → main):** batch 1–3 → **4c** (`0543c337`: L-25/22/20-21-23/26) → **4d** (`103b14f0`: L-28/29/31/32/27-v2) → **4e** (`b9d55ff3`: L-33/34/35 kitchen) → **4f** (`9d27f6b7`: L-27 cluster + L-36/37 shower) → **4g-a** (`32c0d88e`: L-38 dual-north + L-40 globe + L-41 wall-type) → **4g-b** (`5a6efea5`: L-39/L-42 CRITICAL freeze/nav) → **4g-c** (`fcede3ca`: L-43 + L-44/46/47 baseline) → **4g-d/e** (`58ac4e15`: L-49 undo + wall hardening L-50/51/52/55 + wall audit) → **4h** (`c23d69f8`: L-56 + L-30 + L-45).
**In flight:** L-59 render-flash (a7ae0228) · L-60 UI-overlap (aed4b026) · L-61 wall T/L joint (SOLE WALL a6f75567). **Done pending merge:** L-58 site-overlay (e569daf6, urgent) · Q7/L-08 materials (b36014c7). **Scheduled (sole-wall lane, in order):** L-63 hosted-door-move freeze (BLOCKER, top) → L-62 layered-wall plan render → L-53 collab-conflict → L-54 legacy-resolver retirement. **Scheduled (render lane):** L-64 wall-close black flash (extends L-59). **Scheduled (plan-projection perf lane):** L-65 plan-view element-create ~0.5s lag (incremental projection). **Held (user-cancelled):** L-18, L-19, L-24, L-48. **Queued:** L-11 environment (stashed), L-14 floor-finish default, site-overlay localStorage follow-up, GLB object-storage hosting (needs infra).
**Wall subsystem:** deep audit committed (§3 Walls + L-50…L-55); geometry/join/undo correctness now sound; open wall debt = L-61 (in flight) → L-63 → L-62 → L-53 → L-54, all through the SINGLE sole-wall agent (no parallel wall agents).
