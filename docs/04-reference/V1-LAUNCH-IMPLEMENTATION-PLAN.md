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
