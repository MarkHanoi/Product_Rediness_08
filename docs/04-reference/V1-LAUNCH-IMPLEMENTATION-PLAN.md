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
