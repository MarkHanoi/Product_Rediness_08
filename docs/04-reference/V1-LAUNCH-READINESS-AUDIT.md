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
| L-11 | founder | **Environment & Camera panel must be REAL**: real sun (Forma/Cesium ephemeris basis), real shadows + an invisible L0 shadow-catcher so every element casts a ground shadow, and every button meaningful (climate/heat/wind/population/post-fx) | Camera/Render/Env | GAP | design ready (map ab4e868) → ADR + impl; C04/C12/C19/C21/ADR-0074 |
| L-12 | founder | **Wall T-junction draws an "arrow"/spike** — guest wall should butt clean on the host, host unchanged | Editing/Geometry | BROKEN→FIXED | ADR-0055 §FIX-WALL-TJUNCTION-BUTT (batch 2) |
| L-13 | founder | **Plan-view door: wall lines don't close onto the frame — gap at the jamb** | Views/Drawing | BROKEN→FIXED | ADR-0104 §FIX-PLAN-DOOR-JAMB-SEAM (batch 2) |
| L-14 | founder | **Floor Finish default assembly thickness should = base offset** (avoid overlap; user-overridable) | Creation | GAP | queued; C11/C03 |
| L-15 | founder | **Properties panel must be professional** — remove stray lines, absolute alignment, organic to use | UI | BROKEN→FIXED | ADR-0103 §FIX-PROPERTIES-PANEL-POLISH (batch 2) |
| L-16 | founder | **Spacebar rotates the preview element 90° CW during placement** (all placeable elements, 3D+plan) until click/Enter commit / Esc cancel | Modeling/Creation | GAP | queued; extends F5/Q7; C06/C11 |
| L-17 | founder | **Every element needs a "change type" dropdown** to swap it for another type (e.g. sofa→another sofa). Exists for walls (WALL TYPE) but **doesn't work for existing placed elements** — select an element → replace with a different type | Editing/Types | GAP | queued; C11/C03/C16 |
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
  Partial: **placement-time** rotation shipped — Spacebar rotates the live placement preview
  +90° CW (`§FEAT-PLACEMENT-SPACEBAR-ROTATE`, ADR-0107) for one-click placeables (furniture 3D +
  plan, carousel GLB), with the chosen yaw carried through to the committed element. The general
  post-placement first-class Rotate command/gizmo (F5/Q7) remains OPEN.
- **Dimensions**: OK coverage (`UpdateWall/Slab/Door/Window Dimensions/Height/Width/SillHeight`).
- **Materials**: uneven (L-08/F6) — structural/MEP/furnishings have no material command.
- **Hosting**: correct model (C15) — offset + dual-store; the perf failure (L-01) is fixed.
- Contract: C03, C11, C15, C16.

### 3.4 Selection — **BROKEN**
- `findSelectableRoot` walk-up correct; **L-04** gpu-pick chooses wrong candidate under density (Q4 agent).
- `§SELECT-STUCK-STATE-SELFHEAL` exists (escape un-wedges) — a symptom of the edit-storm (L-06), not a fix.
- Contract: C15 §11/§12, C06.

### 3.5 Views — plan / 3D / elevation / section / sheets / **view creation** — **VERIFIED (2 fixes shipped)**
- Commands present: `CreateViewDefinitionCommand`, `UpdateViewDefinitionCommand`, `DeleteViewDefinitionCommand`,
  `CreateViewTemplateCommand`/`Update`/`Delete`, `UpdateViewportScaleCommand`; `DefaultViewsManager` guarantees a
  3D + Ground-Floor plan on every project; split-view plan (Canvas2D) auto-opens; `EdgeProjectorService` +
  `HiddenLineRemoval` + `NativeElementMeshExporter` drive plan projection.
- **Traced end-to-end from the UI (§3.5 verdicts — replaces the N/V cells):**

  | Flow | Verdict | Evidence / fix |
  |---|---|---|
  | **View list / browser** (all types listed, grouped, badges, active pill) | **OK** | `ViewsRailPanel.ts` — `getByType()` per group; `vd:view-*` refresh subscriptions. |
  | **Create new plan / structural-plan view** (form + level picker + validation) | **OK** | `ViewsRailPanel._executeCreateView` → `view.createDefinition` → `CreateViewDefinitionCommand`. Level required + validated. |
  | **Create new 3D / section / elevation / detail / … view** (name form) | **OK** | Same path; `CreateViewDefinitionCommand.canExecute` whitelists all 12 `viewType`s. |
  | **Switch / activate view** (single-click; re-entry guard) | **OK** | `ViewsRailPanel._onActivateView` → `viewController.setActiveViewDefinitionId` + OBC-mode activate. Section/elevation route to Canvas2D `PlanViewManager`. |
  | **Duplicate / delete view** | **OK** | `view.createDefinition` (clone spatial) / `view.deleteDefinition`. |
  | **View range editing** | **OK** | `ViewPropertiesPanel._fireSetViewRange` → `view.setRange` (plugin-view `SetViewRangeHandler`, store-backed, undoable). Read by `EdgeProjectorService.resolveClipRange` (`spatial.viewRange.near/farOffset`). |
  | **View crop editing** | **OK** | `ViewPropertiesPanel._fireSetViewCrop` → `view.setCrop`. Read by `EdgeProjectorService` (`crop.region` / `crop.farClip`). |
  | **Elevation MARK placement** (4-dir click) | **OK** | `ElevationPlanToolHandler` → `elevation.create` → `CreateElevationMarkCommand` (creates elevation ViewDefinition + `elevation-mark` annotation with `linkedViewId`). |
  | **Section MARK placement** (2-click cut line) | **BROKEN → FIXED** | `SectionPlanToolHandler` fired `section.create`, whose bus key is owned by plugin-section-view's **geometry** handler (payload `{ line:{a,b,lookDepth} }`) — the tool's `{ sectionViewId, cutPointA, … }` was rejected at `canExecute` and swallowed by the caller `.catch()`, so **nothing was created**. Fixed **§FIX-SECTION-MARK-CREATE**: new distinct bus key `section.mark.create` (bridge in `initBusHandlers.ts`) → `CreateSectionMarkCommand`; tool repointed. |
  | **Click a placed section / elevation mark → navigate to its view** | **GAP → FIXED** | `PlanViewInteraction._onClick` only *selected* the mark; it never read `parameters.linkedViewId`. Fixed **§FIX-MARK-NAVIGATE**: on hit of a `section-mark`/`elevation-mark`, `_navigateToLinkedView()` activates the linked view (Revit click-to-navigate). |
  | **Viewport scale on a sheet** | **OK (unchanged)** | `UpdateViewportScaleCommand` + `sheet.addViewport` via `ViewsRailPanel` context-menu. |

- **Note (out of G8 lane, flag only):** the *3D* `SectionMarkTool` (plugins/annotations) additionally fires a generic
  `annotation.create` alongside `CreateSectionMarkCommand`, which can leave a redundant generic annotation. Belongs to
  the annotations subsystem (G9) — not touched here.
- The projection cost is the L-06 storm's biggest consumer.
- Contract: C04, C06, C09. Tests: `plugins/annotations/__tests__/section-elevation-mark.test.ts` (6, pins the
  mark-create + `linkedViewId` contract that both fixes depend on).

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
| G8 | Create/manage plan+3D+section+elevation views from UI | GREEN — §3.5 verified end-to-end; §FIX-SECTION-MARK-CREATE (section-mark tool no longer no-ops) + §FIX-MARK-NAVIGATE (mark click-to-navigate) shipped |
| G9 | Place/edit annotations + dimensions | §3.6 verify |
| G10 | Undo/redo sound across all of the above | §3.7 verify at scale |

See the companion plan for the phased path to green.
