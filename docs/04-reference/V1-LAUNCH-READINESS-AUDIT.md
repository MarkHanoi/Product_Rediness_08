# V1 Launch-Readiness Audit — Basic Modeling UX (LIVING DOCUMENT)

> **Status**: LIVING · **Owner**: engine · **Started**: 2026-07-02 · **Target**: v1 launch (next week)
> **Companion plan**: `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (phased/subphased, side-by-side).
> **Feeds from**: `ADR-0098` (element-lifecycle conformance audit), `ADR-0099` (host-wall freeze fix),
> `ELEMENT-LIFECYCLE-REMEDIATION-PLAN.md` (element detail + Q-queue).
> **Governance**: this is a launch-readiness rollup, NOT a `*-AUDIT.md` contract-derivative — it references the
> canonical C-contracts (`docs/02-decisions/contracts/`) and never redefines them.

## How to use this document
Every issue the founder reports (past + future) is logged in **§2 Issue Log** with an `L-NN` id and mapped to a
functional area in **§3**. Append new issues to the bottom of §2 and tick the area table in §3. The companion
plan turns these into phased work. **Nothing is dropped.**

Verdict legend: **OK** (verified working) · **GAP** (works but diverges/incomplete) · **BROKEN** (reproduced
defect) · **N/V** (needs source verification — file cited).

---

## §1 Scope — the "basic modeling must be perfect" surface

The v1 promise is that an architect can, flawlessly and responsively: **navigate the camera**, **create elements**,
**move/rotate/edit elements** (dimensions, materials, hosting), **select**, **create & manage views**
(plan / 3D / elevation / section / sheets), **annotate & dimension**, **undo/redo**, and **save/load** — on both
an empty project and a heavy one, without freezes or stutter.

---

## §2 Issue Log (append-only; founder-reported + audit-found)

| ID | Reported | Issue | Area | Verdict | Maps to |
|----|----------|-------|------|---------|---------|
| L-01 | founder | Wall-move with hosted door/window **freezes** the app | Editing/Hosting | BROKEN→FIXED | ADR-0099 (shipped 52ce2693); amplifier Q6 in flight |
| L-02 | founder | Heavy 40-storey tower **navigation too slow** | Camera/Perf | BROKEN | Q2 (agent) |
| L-03 | founder | Heavy project **load fails** ("timeout 30s") + frozen view; autosave-during-load; clear-on-switch O(N); 940 RBLs | Save/Load | BROKEN | Q3 (agent) / ADR-0098 F2 |
| L-04 | founder | **Selection picks wrong element** (window→door), worse with density | Selection | BROKEN | Q4 (agent) / F4 |
| L-05 | founder | **WebGL2 ghost/duplicate on rotate** (WebGPU fine) | Camera/Render | BROKEN | Q5 / F7 |
| L-06 | audit | Per-edit **redetect + full plan re-projection storm** (freeze amplifier) | Editing/Perf | BROKEN | Q6 (agent) / F3 |
| L-07 | audit | **No first-class Rotate command**; rotation absent for most elements | Editing | GAP | Q7 / F5 |
| L-08 | audit | **Uneven material commands** (only walls/doors/windows) | Editing/Materials | GAP | Q7 / F6 |
| L-09 | founder | **Wall-draw rubber-band preview stutters/gets stuck** (empty project) | Modeling | BROKEN | Q8 (agent) / W6 |
| L-10 | founder | Wall-move freeze **"still present"** — was testing pre-F1 bundle; F1 deploying | Editing | INFO | verify post-deploy + Q6 |
| _next_ | | _append here_ | | | |

---

## §3 Functional-area conformance

### 3.1 Camera & navigation — **NEEDS HARDENING**
- Surface: `packages/renderer/CameraController`, `packages/view-state/ViewController`,
  `packages/stores/CameraPositionService`, `packages/renderer-three/LTPENUCameraService`,
  `runtime-composer/buildCameraControllerSlot`. Constraints armed (`minDist=0.2, maxDist=10000`, polar clamp).
- Issues: **L-02** (heavy-scene orbit slow — shadow-ceiling bypass + instancing + no nav-LOD), **L-05** (WebGL2
  ghost-on-rotate). Zoom-fit/zoom-selected handlers exist (`§C-B1`).
- **N/V**: pan/zoom/orbit smoothness on mid projects; camera state persistence per view; frame-on-view-switch.
- Contract: C04 (rendering/scheduling).

### 3.2 Element creation — **MOSTLY OK, one BROKEN**
- Dual-write/bus-bridge paths verified for walls/curtain-walls/doors/windows/slabs/floors/roofs/stairs/columns/
  beams/plumbing/lighting (ADR-0098 §4, prior audit §3). Hardened door/window creation fallback (§DPT/§WPT).
- Issue: **L-09** wall-draw preview stutter (creation *interaction*, not the command).
- Contract: C11, C15.

### 3.3 Element editing — move / rotate / dimensions / materials / hosting — **CORE GAPS**
- **Movement**: wall=`UpdateWallBaselineCommand`, door/window=offset, furniture=params — non-uniform (F8).
  **L-01** host-wall move freeze FIXED (ADR-0099); **L-06** per-move storm amplifier in flight (Q6).
- **Rotation**: **BROKEN/absent** — no `Rotate*Command` (L-07/F5).
- **Dimensions**: OK coverage (`UpdateWall/Slab/Door/Window Dimensions/Height/Width/SillHeight`).
- **Materials**: uneven (L-08/F6) — structural/MEP/furnishings have no material command.
- **Hosting**: correct model (C15) — offset + dual-store; the perf failure (L-01) is fixed.
- Contract: C03, C11, C15, C16.

### 3.4 Selection — **BROKEN**
- `findSelectableRoot` walk-up correct; **L-04** gpu-pick chooses wrong candidate under density (Q4 agent).
- `§SELECT-STUCK-STATE-SELFHEAL` exists (escape un-wedges) — a symptom of the edit-storm (L-06), not a fix.
- Contract: C15 §11/§12, C06.

### 3.5 Views — plan / 3D / elevation / section / sheets / **view creation** — **N/V (verify for launch)**
- Commands present: `CreateViewDefinitionCommand`, `UpdateViewDefinitionCommand`, `DeleteViewDefinitionCommand`,
  `CreateViewTemplateCommand`/`Update`/`Delete`, `UpdateViewportScaleCommand`; `DefaultViewsManager` guarantees a
  3D + Ground-Floor plan on every project; split-view plan (Canvas2D) auto-opens; `EdgeProjectorService` +
  `HiddenLineRemoval` + `NativeElementMeshExporter` drive plan projection.
- **N/V for launch**: creating a new plan/elevation/section view from the UI end-to-end; view range/crop;
  section/elevation marks (`CreateSectionMarkCommand`/`CreateElevationMarkCommand`) placing + navigating;
  viewport scale on a sheet. The projection cost is the L-06 storm's biggest consumer.
- Contract: C04, C06, C09.

### 3.6 Annotations & dimensions — **N/V (verify for launch)**
- Commands: `CreateAnnotationCommand`/`UpdateAnnotation`/`DeleteAnnotation` (seen live), `UpdateElementMarkCommand`;
  `AnnotationManager` + `OBCAnnotationAdapter` (note: linear/angle/slope annotations "not present in this OBC
  build — skipping" — **confirm dimension tooling coverage for v1**).
- **N/V**: placing a linear dimension; editing/deleting; annotation persistence + plan re-projection; tag
  auto-populate (`RoomTagAutoPopulator`).
- Contract: C06, C03.

### 3.7 Undo / redo — **OK (verify at scale)**
- History/redo stacks, per-command snapshot scope, remote/PROJECT_LOAD exclusions verified (prior audit §6).
- **N/V**: undo of a wall-move-with-openings after the ADR-0099 changes; undo during the L-06 storm.

### 3.8 Save / load & lifecycle — **BROKEN at scale**
- **L-03**: 30s false-timeout, autosave-during-load serialize (22.7MB), O(N) clear-on-switch, 940 degenerate RBLs
  (Q3 agent, C13/C05). Small projects load fine.
- Contract: C05, C13.

### 3.9 Performance & responsiveness (cross-cutting) — **BROKEN**
- **L-02** heavy nav, **L-06** edit storm, **L-09** preview stutter, **L-03** load. The shadow-ceiling bypass
  (12,737 casters at `shadows=standard`) and instancing gaps are the render-side; the redetect/plan storm is the
  interaction-side. Contract: C04, C10.

---

## §4 Launch-gate summary (what MUST be green for v1)

| Gate | Requirement | State |
|---|---|---|
| G1 | No freeze on host-wall move (any element count) | F1 shipped; Q6 amplifier in flight |
| G2 | No freeze/fail opening a heavy saved project | Q3 in flight |
| G3 | Smooth camera navigation on a full building | Q2 in flight |
| G4 | Correct click-selection at any density | Q4 in flight |
| G5 | Smooth wall/element draw preview | Q8 in flight |
| G6 | No ghost/trailing on rotate (both backends) | Q5 queued |
| G7 | Move + rotate + material editable for every visible element | Q7 queued (F5/F6) |
| G8 | Create/manage plan+3D+section+elevation views from UI | §3.5 verify |
| G9 | Place/edit annotations + dimensions | §3.6 verify |
| G10 | Undo/redo sound across all of the above | §3.7 verify at scale |

See the companion plan for the phased path to green.
