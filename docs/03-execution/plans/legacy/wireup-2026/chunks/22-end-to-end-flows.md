# §22  End-to-end flows — operator's named demos

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable — not in the source monolith.
>
> The operator named seven canonical flows: *landing → signup → create project → open project → import (PDF/DXF/IFC) → views (3D/elevations/sections/schedules) → all elements/annotations/dimensions/sheets → export (IFC/PDF) → AI*.
>
> Each flow below stitches the click trail (§11) + the sub-phase IDs (§16) + the bench (§13) + the architecture legs (§21) end-to-end. **A flow is GA-ready when every step's bench is hard-fail green and every step's sub-phase has merged.**
>
> Use this file to walk through what the operator will demo at GA. Each flow is independently shippable — it does not depend on later flows.

---

## §22.1  Flow 1 — Landing → Signup → Hub

> *"I open the site and sign up; the editor never loads engine code on this path."*

| Step | Gesture | Click trail | Architecture leg | Sub-phase | Bench |
|---|---|---|---|---|---|
| 1.1 | Visit `/` → landing page paints | §11.1 | platform/LandingPage.ts (no engine import) | A.1 | `bench/ui/landing-paint.bench.ts` (LCP < 600 ms) |
| 1.2 | Click "Sign up" / "Log in" → AuthModal opens | §11.2 | platform/AuthModal.ts → `runtime.persistence.client.auth.*` (oauth2-pkce) | A.1 + C.2–C.3 | `bench/ui/auth-modal-open.bench.ts` (< 50 ms) |
| 1.3 | Submit credentials → OAuth/PKCE round-trip | §11.2 | api-gateway → oauth2-pkce + api-rbac | C.2 | (auth integration test) |
| 1.4 | Token returned → router navigates to ProjectHub | §11.2 | platform/PlatformRouter.ts → ProjectHub.ts | A.1 | `bench/ui/hub-paint.bench.ts` (TTI < 500 ms with 100 projects) |
| 1.5 | ProjectHub paints user's project list | §11.2 | `runtime.persistence.client.projects.list(userId)` | C.4 | included |

**GA gate**: steps 1.1 → 1.5 complete in < 1.5 s wall clock; bundle delta landing → hub < 200 KB gzip; engine code is **not** loaded on this path.

---

## §22.2  Flow 2 — Create or Open Project → Editor mounts

> *"I click '+ New project' (or 'Open' on a card); the white toolbar paints over the canvas."*

| Step | Gesture | Click trail | Architecture leg | Sub-phase | Bench |
|---|---|---|---|---|---|
| 2.1 | Click "+ New project" → name modal | §11.3 | ProjectHub.ts | A.1 | `bench/ui/hub-create.bench.ts` |
| 2.2 | Submit name → `runtime.persistence.client.projects.create(...)` | §11.3 | persistence-client → api-gateway → file-format → storage-driver | C.6.* | included |
| 2.3 | New `projectId` returned → `runtime.workspace.openProject(projectId)` | §11.3 | persistence-client.openProject (event-log replay + parallel renderer init) | A.1 + C.7 | `bench/ui/workspace-mount.bench.ts` (< 800 ms first interactive) |
| 2.4 | EngineLoadingOverlay shows progress | §11.4 | platform/EngineLoadingOverlay.ts subscribes to `runtime.events.on('persistence.openProject.progress')` | A.1 | included |
| 2.5 | Layout paints: top bar + left rail + right tools + canvas | §11.4 | Layout.ts (preserved) threaded with `runtime` in Phase B | B.1–B.5 | `bench/ui/contextual-edit-bar.bench.ts` |
| 2.6 | First scene frame painted | §11.4 | renderer (mounts into `#container`) + scene-committer + frame-scheduler | A.1 + D.6 | `bench/ui/workspace-mount.bench.ts` includes |

**GA gate**: step 2.1 → 2.6 < 4 s wall clock with M-medium fixture; cold load < 1.5 s first interactive; existing-project open < 800 ms.

---

## §22.3  Flow 3 — Import (PDF / DXF / IFC / Rhino)

> *"I drag-and-drop a file or pick Import from the menu; the panel shows progress and lands the elements."*

| Source | Plugin | UI surface | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| **PDF (underlay)** | annotations + pdf-to-bim | drop on viewport → `runtime.bus.executeCommand('underlay.import', {file})` | (§11.5 derivative) | F.5.* + F.12.19 | `bench/ui/underlay-scale.bench.ts` |
| **PDF (AI floor plan)** | ai-floorplan + ai-worker | ai/FloorPlanImportPanel.ts → `runtime.ai.floorPlan.import(file)` | §11.12 derivative | F.7.10–F.7.14 | `bench/ui/floorplan-import-progress.bench.ts` |
| **DXF** | annotations (DXF subset) | import-manager/ImportManagerPanel.ts → `runtime.dxf.import.start(file)` | §11.11 derivative | F.12.16 | (interop fidelity test) |
| **IFC** | ifc-import + ifc-inspector | ImportManagerPanel.ts or drag-drop → `runtime.ifc.import.start(file)` | §11.11 | F.12.06–F.12.10 | `ifc-import-tier2` workflow + `ifc-inspector-pset-editor` |
| **Rhino .3dm** | rhino-import | ImportManagerPanel.ts → `runtime.rhino.import.start(file)` | §11.11 derivative | F.12.18 | `rhino-import-3dm` workflow |

Common substeps for all imports:
1. File received → job created → progress events stream via `runtime.events.on('<format>.import.progress')`.
2. Worker (ai-worker for AI/PDF, in-process for IFC/DXF/Rhino) parses → produces `CommandBatch`.
3. Batch enters approval queue (`runtime.ai.approvalQueue.enqueue(batch)`) — user reviews in HISTORY spine icon.
4. User clicks Accept → `runtime.bus.executeCommand` over the batch → committed to event log → baked → painted.

**GA gate**: PDF AI import < 15 s for typical floor plan; IFC import meets `ifc-import-tier2` budget; UI overhead during import < 200 ms per progress tick.

---

## §22.4  Flow 4 — View kinds (3D · Plan · Section · Elevation · Schedule · Sheet)

> *"I switch between 3D, plan, section, elevation, schedule, and sheet views; the camera + visibility filters + panel content all swap."*

| View kind | Plugin | Activation | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| 3D | view (default) | view tab click → `runtime.viewRegistry.activate(viewId)` | §11.10 | D.11–D.12, F.6.10–F.6.15 | `bench/ui/view-tab-switch.bench.ts` (< 200 ms cached, < 500 ms cold) |
| Plan | plan-view | view tab → camera ortho top-down + level filter | §11.10 | F.6.10 | included |
| Section | section-view | view tab → section box from view def | §11.10 | F.6.10 | included |
| Elevation | view (elevation kind) | view tab → camera ortho side | §11.10 | F.6.10 | included |
| Schedule | schedules | view tab → SchedulePanel mounts | §11.10 | F.5.24–F.5.28, F.6.16–F.6.18 | `bench/ui/schedule-mount.bench.ts` (5K rows < 1 s) |
| Sheet | sheets | view tab → SheetEditorHost mounts (replaces #2 worst file SheetEditorPanel) | §11.10 | F.5.29–F.5.32 | `bench/ui/sheet-editor-mount.bench.ts` (< 500 ms) |

Cross-view operations:
- **Create view**: VIEWS spine → "+ New view" wizard → `runtime.bus.executeCommand('view.create', {kind, settings})` (F.6.12).
- **Apply view template**: VIEWS → templates section → `viewTemplate.apply` (F.6.15).
- **Visibility filters per view**: VG button → VisibilityIntentPanel → `runtime.bus.executeCommand('vi.setCategoryVisibility', ...)` (F.8.03).

**GA gate**: view switch < 500 ms cold; schedule paint < 1 s for 5K rows; sheet editor mount < 500 ms; visibility toggle < 50 ms.

---

## §22.5  Flow 5 — Element creation + editing (12 families) + annotations + dimensions

> *"I click Wall in the right rail, draw 5 walls, edit thickness, add a door, place a dimension."*

| Step | Family/tool | Click trail | Sub-phase | Bench |
|---|---|---|---|---|
| 5.1 | Click Architecture button → discipline subset of toolbar contributions filters | §11.5 (lines 833–977) | F.1.* (rail orchestrator + every tool button) | `bench/ui/toolbar-discipline-switch.bench.ts` |
| 5.2 | Click Wall tool → `runtime.tools.activate('wall', {mode:'polyline-ortho'})` → cursor changes + WallDrawingHUD mounts | §11.5 | F.1.01 + E.1 | `bench/ui/tool-activate.bench.ts` |
| 5.3 | Draw wall: mousemove + click sequence + ESC | §11.5 | E.1 | `bench/ui/wall-draw-frame.bench.ts` (60 fps incl snap) |
| 5.4 | Commit fires `runtime.bus.executeCommand('wall.create', {polyline, level, sysType})` | §11.5 | E.1 | included |
| 5.5 | Repeat 5.2–5.4 for door, window, slab, floor, ceiling, roof, stair, handrail, column, beam, grid | §11.5 derivative | E.2–E.13 | per-family `bench/ui/<family>-draw.bench.ts` (12 benches) |
| 5.6 | Click existing wall → PropertyInspector mounts (per-family contribution) | §11.6 | F.2.01 + F.2.18 | `bench/ui/inspector-mount.bench.ts` (< 50 ms p95) |
| 5.7 | Edit thickness numeric → live preview during drag → commit | §11.6 | F.2.01 | `bench/ui/dimension-edit-live.bench.ts` (60 fps) |
| 5.8 | Right-click wall → context menu (Move/Rotate/Mirror/Copy/Array/Group/Properties/Delete/Hide/Isolate/Override) | §11.6 derivative | F.4.03 + cross plugin | `bench/ui/radial-menu-open.bench.ts` |
| 5.9 | Activate Annotation rail → click Linear Dimension → place dim | §11.5 derivative | F.1.16 + F.2.14 | `bench/ui/dimension-preview.bench.ts` |
| 5.10 | Activate Text Annotation tool → place text | §11.5 derivative | F.1.15 + F.2.13 | `bench/ui/annotation-input.bench.ts` |

**GA gate**: every per-family draw frame < 16 ms p95; commit → first paint < 50 ms; inspector mount < 50 ms p95; multi-select common-fields panel < 200 ms for 100-element selection.

---

## §22.6  Flow 6 — Documentation (sheets) and export (PDF / IFC / DWG / CSV / IMAGE)

> *"I lay out a sheet, place views, then export PDF and IFC and a schedule CSV."*

| Step | Surface | Click trail | Sub-phase | Bench |
|---|---|---|---|---|
| 6.1 | Switch to sheet view → SheetEditorHost mounts | §11.10 | F.5.29 | `bench/ui/sheet-editor-mount.bench.ts` |
| 6.2 | Drag-drop view tab onto sheet → place viewport | §11.10 derivative | F.5.29 | included |
| 6.3 | Drag viewport corner → resize | §11.10 derivative | F.5.30 | included |
| 6.4 | Drop title block, edit revision row | §11.10 derivative | F.5.31–F.5.32 | `bench/ui/sheet-edit.bench.ts` |
| 6.5 | Export → PDF → `runtime.bus.executeCommand('export.pdf', {sheets, settings})` | §11.11 derivative | F.1.25 | (export integration test) |
| 6.6 | Export → IFC → `runtime.ifc.export.run({scope, schema})` | §11.11 derivative | F.1.27 + F.12.11 | `ifc-export-tier1` workflow |
| 6.7 | Export → DWG/DXF → `runtime.dxf.export.run(...)` | §11.11 derivative | F.1.26 + F.12.17 | (export integration test) |
| 6.8 | Export → Schedule CSV → `runtime.bus.executeCommand('schedule.exportCsv', {scheduleId})` | §11.11 derivative | F.1.28 + F.5.28 | (export integration test) |
| 6.9 | Export → Image (snapshot) → `runtime.scene.renderer.snapshot({preset})` | §11.11 derivative | F.1.29 | `bench/ui/render-export-start.bench.ts` |

**GA gate**: PDF export of 10-sheet set < 30 s; IFC export passes round-trip via `ifc-export-tier1` and `bcf-round-trip` workflows; CSV exports stable rows.

---

## §22.7  Flow 7 — AI command (sidebar prompt → batch → approval → commit)

> *"I open AI, type 'create a 3-bedroom apartment', review the proposed walls, accept."*

| Step | Surface | Click trail | Sub-phase | Bench |
|---|---|---|---|---|
| 7.1 | Click AI spine icon → AIPanel mounts | §11.12 | F.6.19 + F.7.* (orchestrator) | `bench/ui/ai-panel-mount.bench.ts` |
| 7.2 | Type prompt + Enter → `runtime.ai.streamCompletion({prompt, ctx:{projectId, selection}})` | §11.12 | F.7.01 | `bench/ui/ai-first-token.bench.ts` (< 800 ms p50) |
| 7.3 | First token streamed → AIPanel paints incrementally | §11.12 | F.7.01 | included |
| 7.4 | (Generative) AICreatePanel "Generate" → `runtime.ai.generative.create(...)` returns `CommandBatch` | §11.12 derivative | F.7.07 | `bench/ui/ai-generate.bench.ts` |
| 7.5 | Batch enqueued → HISTORY spine icon shows new proposal row | §11.12 | F.6.20–F.6.22 | (no specific bench; UI overhead included) |
| 7.6 | Click Accept → `runtime.ai.approvalQueue.commit(batchId)` → batch dispatched via bus → committed to event log → baked → painted | §11.12 | F.6.22 | included |
| 7.7 | (Validation) Click Validate → `runtime.ai.rules.validate(projectId)` → ValidatePanel paints results | §11.12 derivative | F.7.08 | `bench/ui/ai-validate.bench.ts` |
| 7.8 | Click rule violation → `runtime.selection.select(...)` + camera focus | §11.12 derivative | F.7.09 | included |
| 7.9 | (Voice) Click mic → `runtime.ai.voice.startSession()` → utterance → `runtime.ai.executeIntent(utterance)` | §11.12 derivative | F.7.15–F.7.16 | (informational) |

**GA gate**: AI first token < 800 ms p50; AI mutation flows through the same bus as user edits — undo/sync/bake apply uniformly (Vision differentiator D2); cost pill always-on.

---

## §22.8  Flow 8 — Plugin install + collaboration (cross-cutting)

> *"I install a plugin from the marketplace, then a teammate joins my session."*

| Step | Surface | Click trail | Sub-phase | Bench |
|---|---|---|---|---|
| 8.1 | Open marketplace panel → `runtime.plugins.marketplace.list()` | §11.13 | F.12.01 | `bench/ui/plugin-contribution-add.bench.ts` |
| 8.2 | Click Install → permission grant → `runtime.plugins.installFromUrl(manifestUrl)` | §11.13 | F.12.03 | included |
| 8.3 | Plugin loaded → contributions registered → toolbar repaints (no reload) | §11.13 | F.12.03 | included |
| 8.4 | Teammate opens project on second tab → `runtime.sync.client` joins room | §11.9 | C.10–C.13 | `sync-roundtrip.bench.ts` |
| 8.5 | Teammate cursor appears as overlay (`runtime.sync.presence.peers()`) | §11.9 | C.13 | `bench/ui/presence-cursor.bench.ts` |
| 8.6 | Either user edits → CRDT broadcast → other tab paints update | §11.9 | C.* | included |

**GA gate**: plugin install → first invocation < 2 s; sync latency < 250 ms p95; 20 concurrent users reliable.

---

## §22.9  Coverage check across §22

| Operator-named flow | Covered by §22 flow | Click trail § | Sub-phase IDs | Bench |
|---|---|---|---|---|
| landing → signup | §22.1 | §11.1–§11.2 | A.1, C.2–C.4 | landing-paint, auth-modal-open, hub-paint |
| create / open project | §22.2 | §11.3–§11.4 | A.1, C.6–C.7 | hub-create, workspace-mount |
| import PDF / DXF / IFC | §22.3 | §11.11–§11.12 | F.7.10–F.7.14, F.12.06–F.12.19 | ifc-import-tier2, rhino-import-3dm, floorplan-import-progress |
| views (3D / elevations / sections / schedules / sheets) | §22.4 | §11.10 | D.11–D.12, F.5.24–F.5.32, F.6.10–F.6.18 | view-tab-switch, schedule-mount, sheet-editor-mount |
| all elements + annotations + dimensions | §22.5 | §11.5–§11.6 | E.1–E.14, F.1.*, F.2.*, F.4.03 | per-family draw + inspector-mount |
| sheets + export IFC / PDF | §22.6 | §11.10–§11.11 | F.1.25–F.1.29, F.5.29–F.5.32, F.12.11, F.12.17 | sheet-editor, ifc-export-tier1 |
| AI | §22.7 | §11.12 | F.6.19–F.6.24, F.7.01–F.7.16 | ai-first-token, ai-generate, ai-validate |
| (plugin install + multi-user) | §22.8 | §11.9, §11.13 | C.10–C.13, F.12.01–F.12.05 | plugin-contribution-add, presence-cursor, sync-roundtrip |

**Every flow the operator named has at least one click trail, one sub-phase ID per step, and one bench per gate.** No flow is orphaned.
