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
