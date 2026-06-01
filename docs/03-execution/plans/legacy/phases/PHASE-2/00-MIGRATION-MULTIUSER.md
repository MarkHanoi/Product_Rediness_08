# Phase 2 — Migration & Multi-User (Months 13–24, Sprints S25–S48)

> **Phase goal**: bring the **non-element subsystems** across (rooms, structural, MEP, furniture, plan view, section view, sheets, schedules), and **turn on multi-user collaboration**. By M24 a beta cohort opens shared projects with two browser tabs editing simultaneously through Yjs CRDT.
>
> **The bet**: Phase 1 proved the architecture works on simple primitives. Phase 2 proves it survives **the documentation pipeline** (the highest-risk legacy code) **and** the **first-class collaboration** that no other competitor ships for geometry. By M24 PRYZM 2 has functional capabilities no competitor matches.

This document expands `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §5 with sprint-level detail. Companion docs: `phases/PHASE-1-FOUNDATION-M1-M12.md` (what came before), `phases/PHASE-3-COMPLETION-GA-M25-M36.md` (what comes next).

---

## §1 Phase 2 strategic context

### §1.1 Where we start (M12 morning)

- 12 element families operational in PRYZM 2 behind `?pryzm2=1`.
- Cold load + save + idle + orbit benches green on small/medium/large fixtures.
- `.pryzm` v1 round-trips losslessly.
- `@pryzm/headless` runs in Node.
- Bake worker producing R2-hosted chunks per event.
- Sync server skeleton accepts events with single-tab durability.
- PRYZM 1 still ships unchanged to existing users (feature freeze in effect).

### §1.2 What Phase 2 must deliver

- **All remaining element families** — Rooms, Structural, Lighting, Plumbing, Furniture, Dimensions (the "second tier" not in the 9 core primitives).
- **The full documentation pipeline** — Plan view (the riskiest sub-project of the entire 36-month plan), Section view, Sheets, Schedules, Title blocks, PDF export.
- **Real-time multi-user via Yjs CRDT** — geometry collab, awareness with active view+tool+selection, per-element soft locks. This is **D1 turning on**, the differentiator that beats every named competitor including Pascal.
- **First half of Visibility-Intent migration** — waves 1–5 of the 11-wave system into the new plugin (`plugins/visibility-intent/`).
- **AI subsystem decomposition begins** — the 31-file moat starts moving to L7.5; full migration completes in 3A.
- **Beta launch at M24** — 25 invited users on the new stack with multi-user collaboration.

### §1.3 What Phase 2 deliberately does NOT do

| Deferred | When |
|---|---|
| Visibility-Intent waves 6–11 | Phase 3A |
| Full AI migration (CV pipeline, generative, rules, voice) | Phase 3A |
| Public AI API | Phase 3A |
| IFC, DXF, Rhino plugins | Phase 3B |
| Component editor migration | Phase 3B |
| BCF round-trip | Phase 3B |
| PropertyPanel/Inspector decomposition | Phase 3B |
| Plugin SDK 1.0 publish, marketplace | Phase 3C |
| Public REST + WS APIs | Phase 3C |
| Headless npm publish | Phase 3C |
| Self-host packaging | Phase 3D |
| Browser matrix beyond Chromium | Phase 3D |
| Legacy `apps/editor` deletion | S61 (Phase 3C) |

### §1.4 Phase 2 sub-phase shape

```
M13 ─┐
M14  │  Sub-phase 2A — Non-element families             S25–S30
M15 ─┘
M16 ─┐
M17  │  Sub-phase 2B — Plan view (highest risk)         S31–S36
M18 ─┘
M19 ─┐
M20  │  Sub-phase 2C — Sheets, schedules, title blocks  S37–S42
M21 ─┘
M22 ─┐
M23  │  Sub-phase 2D — Sync, awareness, BETA            S43–S48
M24 ─┘                                                  ★ M24 BETA GATE
```

### §1.5 The two sub-phases that scare us

- **2B (Plan view)** — 54 files in PRYZM 1, the 11-wave Visibility-Intent UI, Contract 44 plan-vs-SVP gaps. If anything in Phase 2 overruns, it will be 2B. Built-in mitigation: per-project fall-back flag `featureFlags.plan_view_v2` retained until M24.
- **2D (Yjs CRDT)** — the highest-impact failure mode. Same-element concurrent edit producing data loss in any beta project triggers an immediate kill-switch. `[strategic ADR-002]` (CRDT + event log bridge) was the framing decision; the Yjs spike pre-S01 was its first mitigation; chaos-test harness in S43 is the second.

---

## §2 Sub-phase 2A — Non-element family completion (M13–M15, S25–S30)

**Sub-phase goal**: every BIM element type that PRYZM 1 supports has a PRYZM 2 plugin. The "second tier" element families (Rooms, Structural, MEP, Furniture, Dimensions) join the 12 from Phase 1 to make ~18 total. Plan view skeleton lands as preparation for 2B.

### S25 — Rooms (Weeks 49–50, M13)

**Goal**: rooms with boundary detection, area + perimeter calc, naming, schedule integration hook.

**Why now**: rooms underpin schedules (S41) and visibility filters (the 11-wave system). Migrating them now unblocks 2C and 3A.

**Deliverables**:
- `packages/schemas/Room.ts` (already from S01; extended with `boundary`, `level`, `name`, `number`).
- `packages/stores/RoomStore.ts`.
- `plugins/rooms/handlers/{CreateRoom,DeleteRoom,RenameRoom,SetRoomNumber,RecalcArea}.ts` — 8 handlers (11 - 3 merged per `09 §4`).
- `packages/geometry-kernel/producers/room.ts` — pure boundary detection from wall geometry.
- `plugins/rooms/committer.ts` — boundary outline + area-fill rendering.
- `plugins/rooms/tool.ts` — click-inside-walls to instantiate room.
- `tests/parity/rooms/` — 20-case fixture (simple, L-shaped, with islands, multi-level).

**Daily**: D1 schema extension + store; D2 handlers (5 of 8); D3 remaining handlers + producer; D4 committer + tool; D5 boundary detection edge cases; D6 area calc accuracy; D7 parity tests; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: rooms compute area + perimeter with < 0.1% error vs PRYZM 1; 20 parity cases pass; OTel spans visible; rooms persist via S04 event log.

**Risk**: boundary detection edge cases (curved walls, openings) — mitigated by parity fixtures from real PRYZM 1 projects.

---

### S26 — Structural + Lighting + Plumbing (Weeks 51–52, M13–M14)

**Goal**: 3 MEP-class element families. Simpler than walls (no joins, no openings).

**Deliverables**: `plugins/{structural,lighting,plumbing}/` each with schema/store/handlers/producer/committer/tool. Handler counts per `09 §4`: 7+5+4 = 16 handlers total.

**Daily**: D1–D3 Structural (most complex of the three); D4–D6 Lighting; D7–D9 Plumbing; D10 cross-element integration test + retro.

**Exit**: 3 families functional; parity tests green; orbit-fps with 50 elements per family > 55 fps.

---

### S27 — Furniture + carousel + multi-representation (Weeks 53–54, M14)

**Goal**: furniture with **multi-representation** (the "sofa with 5 representations" Contract 48 promise). This is the model that the parametric component editor (S58) will generalise.

**Deliverables**:
- `packages/schemas/Furniture.ts` extended with `representations: { lod0, lod1, lod2, lod3, lod4 }`.
- `plugins/furniture/handlers/` — 7 handlers (12 → 7 per triage).
- `packages/geometry-kernel/producers/furniture.ts` — picks representation by LOD/distance.
- `plugins/furniture/committer.ts` — swaps mesh on representation change.
- `plugins/furniture/carousel/` — UI for browsing furniture catalogue (vanilla TS).
- `tests/parity/furniture/sofa-multi-rep.test.ts` — sofa renders correctly at all 5 LODs.

**Daily**: D1 schema + multi-rep model; D2–D3 producer with LOD selection; D4–D5 committer with mesh swap on representation diff; D6 catalogue carousel UI; D7 parity sofa test; D8 perf — 100 furniture items in scene at orbit; D9 demo; D10 buffer.

**Exit**: sofa with all 5 representations correct; LOD switches smoothly under orbit; carousel UI loads catalogue; orbit-fps with 100 furniture > 55 fps.

---

### S28 — Persistent project hub + portfolio view (Weeks 55–56, M14)

**Goal**: a multi-project workspace — list, open, create, delete, rename projects with thumbnails. Until now PRYZM 2 has been single-project.

**Deliverables**:
- `apps/editor/src/projects/` — vanilla TS project hub view.
- `packages/stores/ProjectListStore.ts` — list of projects with metadata.
- `apps/sync-server/handlers/{ListProjects,CreateProject,DeleteProject,RenameProject}.ts`.
- Project thumbnails — captured by `apps/bake-worker` on event commit (single thumbnail per project, regenerated every N events).
- `plugins/projects/` — project picker tool.

**Daily**: D1 project list store + hub view; D2 create/delete/rename handlers; D3 thumbnail capture in bake-worker; D4 hub UI styling; D5 deep-link routing (`/project/:id`); D6 e2e test; D7 demo prep; D8 buffer; D9 demo; D10 buffer.

**Exit**: list, open, create, delete, rename projects work; thumbnails appear; deep links open the right project; PRYZM 1 hub unchanged at default URL.

---

### S29 — Dimensions + first plan-view foundation (Weeks 57–58, M15)

**Goal**: dimensions in 3D + plan view skeleton renders one level outline. The plan view skeleton is the foundation for 2B.

**Deliverables**:
- `plugins/dimensions/` — full pattern. 6 handlers (8 → 6 per triage).
- `packages/geometry-kernel/producers/dimension.ts` — pure dimension computation.
- `plugins/plan-view/canvas-host.ts` (skeleton) — vanilla `CanvasHost` subclass renders one level outline.
- `plugins/plan-view/level-store.ts` — level switching, current level state.
- `plugins/plan-view/projection.ts` (skeleton) — top-down projection of element bounds.

**Daily**: D1 dimensions schema/store; D2–D3 dimension handlers + producer; D4 dimension committer + tool; D5 plan-view canvas-host skeleton; D6 level outline renderer; D7 plan-view smoke test; D8 lint; D9 demo; D10 buffer.

**Exit**: dimensions in 3D parity-tested; plan view skeleton renders walls + slabs + doors of the active level (no annotations yet); level switcher works; plan view at 60 fps interactive, 0 fps idle.

---

### S30 — Edge projection + poche fill (pure) (Weeks 59–60, M15)

**Goal**: `packages/geometry-kernel/edge-projection.ts` and `packages/geometry-kernel/poche.ts` are **pure** — both run in worker AND Node. These are the math foundations that 2B's plan view depends on.

**Deliverables**:
- `packages/geometry-kernel/edge-projection.ts` — pure: `(WallDto[], levelZ) => Edge2D[]`.
- `packages/geometry-kernel/poche.ts` — pure: `(WallDto, levelZ) => PolygonFill`.
- Snapshot tests in `packages/geometry-kernel/__tests__/{edge-projection,poche}.snap`.
- Node-worker tests proving byte-identical output to browser worker.

**Daily**: D1–D3 edge projection (the harder one — handle openings, miter resolution); D4–D6 poche fill; D7 snapshot tests; D8 Node worker tests; D9 sub-phase 2A demo; D10 retro.

**Exit (2A)**: 18 element families operational; project hub works; plan view skeleton renders; edge + poche math is pure and headless-tested.

---

## §3 Sub-phase 2B — Plan view (M16–M18, S31–S36) — the highest-risk sub-project

**Sub-phase goal**: the documentation pipeline migration begins with **plan view** — Contract 44's plan-vs-SVP parity gaps closed in the new architecture, not patched in the old. The 11-wave Visibility-Intent system from PRYZM 1 is preserved verbatim (waves 1–5 in S46, waves 6–11 in S49).

**Why this is the riskiest sub-project**: 54 files in PRYZM 1, deeply coupled UI logic, the 11-wave Visibility-Intent system, multi-view sync. The visual diff between PRYZM 1 plan view and PRYZM 2 plan view must be < 2 px on the parity test set — a visually loose tolerance is a subtly broken product.

**Built-in safety**: per-project fall-back flag `featureFlags.plan_view_v2` retained until M24. Any project can switch back to PRYZM 1 plan view if regression is found in beta.

### S31 — Plan-view canvas host + dirty-flag rendering (Weeks 61–62, M16)

**Goal**: `plugins/plan-view/canvas-host.ts` is a full vanilla `CanvasHost` subclass with dirty-flag rendering driven by `FrameScheduler`. Plan view at 60 fps interactive, 0 fps idle, renders walls/slabs/doors of the active level.

**Deliverables**:
- `plugins/plan-view/canvas-host.ts` — extends `CanvasHost`; owns 2D canvas; subscribes to `WallStore`, `SlabStore`, `DoorStore`, etc., for the active level.
- `plugins/plan-view/renderer.ts` — 2D rendering of edges + poche.
- `plugins/plan-view/camera.ts` — pan + zoom; pointer events dirty the scheduler.
- `apps/bench/orbit-fps-plan.ts` — 2D pan/zoom equivalent of orbit-fps; gate < 55 fps p95.

**Daily**: D1 canvas-host class + dirty-flag wiring; D2 2D camera (pan + zoom + dirty); D3 wall edge rendering; D4 slab + door rendering; D5 poche fill rendering; D6 perf bench; D7 visual-diff harness setup; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: plan view renders walls/slabs/doors at 60 fps interactive, 0 fps idle; visual-diff vs PRYZM 1 plan view: < 5 px difference (loose tolerance for this sprint; tightens in S33).

---

### S32 — Plan-view annotation renderer (Weeks 63–64, M16–M17)

**Goal**: `plugins/plan-view/annotation-renderer.ts` (pure parts) + committer renders annotations (text, leaders, callouts, regions) into plan view. Visual diff vs PRYZM 1: < 2 px.

**Deliverables**:
- `plugins/plan-view/annotation-renderer.ts` — pure layout for annotations in plan view.
- `plugins/plan-view/annotation-committer.ts` — Canvas2D drawing of annotations.
- Visual-diff CI gate at < 2 px tolerance vs PRYZM 1 reference (`tests/visual-diff/plan-view/`).

**Daily**: D1 pure layout function; D2 leader routing; D3 text placement + clipping; D4 callout boxes + regions; D5 committer side; D6 visual-diff harness pass; D7 edge cases (long leaders, overlapping text); D8 lint; D9 demo; D10 buffer.

**Exit**: annotations render in plan view; visual diff < 2 px on the 30-case fixture; OTel spans cover annotation rendering.

---

### S33 — Plan view + SVP parity — Contract 44 G1–G10 (Weeks 65–66, M17)

**Goal**: close all 10 gaps in Contract 44 (plan-vs-SVP parity matrix) in the new architecture. Per-view styleResolver (G4), level-scoped renderers (G1–G3), selection + drag in pane (G9/G10).

**Deliverables**:
- `plugins/plan-view/style-resolver.ts` — per-view style selection (one style per view, not global).
- `plugins/plan-view/level-scoped-renderers.ts` — every renderer takes `levelId` as input; no implicit current-level coupling.
- `plugins/plan-view/selection.ts` — selection in plan view drives 3D selection store.
- `plugins/plan-view/drag.ts` — drag-in-pane updates element transforms via commands.
- `tests/contract-44/` — gap matrix as automated tests (G1–G10 each a vitest).

**Daily**: D1 G1–G3 (level scoping); D2 G4 (style resolver); D3 G5–G6 (visibility flags); D4 G7–G8 (poche styling); D5 G9 (selection); D6 G10 (drag); D7 contract-44 test pass; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: all 10 contract-44 gap tests green; visual diff still < 2 px; selection/drag working.

---

### S34 — Annotations migration (general, all views) (Weeks 67–68, M17–M18)

**Goal**: `plugins/annotations/` covers text, leaders, callouts, regions across 3D + plan view + (in S35) section view.

**Deliverables**:
- `packages/stores/AnnotationStore.ts` (extracted from S29 dimension work).
- `plugins/annotations/handlers/` — 8 handlers (14 → 8 per triage, 2 dropped, 4 merged).
- `plugins/annotations/tool.ts` — annotation tools for each type.
- Annotations work in 3D AND plan view (section view in S35).

**Daily**: D1 store; D2–D3 handlers; D4–D5 tools; D6 cross-view rendering; D7 parity tests; D8 perf with 1000 annotations; D9 demo; D10 buffer.

**Exit**: all annotation types work in 3D + plan view; parity tests green; perf > 55 fps with 1000 annotations.

---

### S35 — Section view foundation (Weeks 69–70, M18)

**Goal**: `plugins/section-view/` — section line tool draws a section line in plan view, the section view canvas-host renders the correct cut from the geometry.

**Deliverables**:
- `plugins/section-view/canvas-host.ts` (mirrors plan-view structure).
- `plugins/section-view/section-line-tool.ts` — drawn in plan view, persisted in `SectionStore`.
- `packages/geometry-kernel/producers/section-cut.ts` — pure: `(elements, sectionLine) => Cut2D`.
- `plugins/section-view/renderer.ts` — Canvas2D of cut + far-side projections.
- 6 handlers for section view (per triage).

**Daily**: D1 section line tool in plan view; D2 SectionStore + commands; D3 pure section-cut producer; D4 section view canvas-host; D5 renderer with cut shading; D6 visual-diff harness extension; D7 parity tests; D8 lint; D9 demo; D10 buffer.

**Exit**: section line drawn in plan view → section view renders correct cut; pan/zoom working; visual diff < 5 px (tightens in S36).

---

### S36 — Section view ↔ 3D ↔ plan view sync (Weeks 71–72, M18)

**Goal**: edits in any one view propagate to the others within a single frame; multi-view layout works (split panes).

**Deliverables**:
- `packages/view-state/multi-view-layout.ts` — split pane orchestrator.
- `packages/view-state/view-sync.ts` — selection, hover, edit propagation across views.
- `apps/bench/multi-view-sync.ts` — measures cross-view edit propagation latency.
- Visual diff for section view tightened to < 2 px.

**Daily**: D1 multi-view layout (split panes); D2 selection sync; D3 hover sync; D4 edit propagation; D5 perf bench; D6 visual-diff section tighten; D7 e2e test; D8 lint; D9 sub-phase 2B demo; D10 retro.

**Exit (2B)**: edit in any view, change visible in others within 1 frame (16 ms p95); contract-44 gaps closed; visual diff < 2 px on plan + section; per-project fall-back flag still operational.

**Sub-phase 2B retro question**: did 2B overrun? If yes, defer parts of 2C accordingly. Mark `featureFlags.plan_view_v2` decision: enable by default for beta or keep behind flag for selected users only?

---

## §4 Sub-phase 2C — Sheets, schedules, title blocks (M19–M21, S37–S42)

**Sub-phase goal**: complete the documentation pipeline. By end of 2C, PRYZM 2 has plan view + section view + sheet layout + title blocks + viewports + schedules + PDF export — desktop-CAD documentation parity.

### S37 — Sheet store + sheet editor host (Weeks 73–74, M19)

**Goal**: `SheetStore` + `plugins/sheets/` host. Sheets list, create, delete, navigate.

**Deliverables**:
- `packages/stores/SheetStore.ts` — Zod-validated sheet definitions.
- `plugins/sheets/sheet-editor-host.ts` — main sheet editor canvas-host.
- `plugins/sheets/handlers/{CreateSheet,DeleteSheet,RenameSheet,ReorderSheet}.ts` — 4 of 11 handlers.
- `plugins/sheets/sheet-list.ts` — sidebar UI for navigation.

**Daily**: D1 store; D2 sheet editor host skeleton; D3 4 handlers; D4 sheet list UI; D5 navigation + state; D6 persistence integration; D7 lint; D8 perf; D9 demo; D10 buffer.

**Exit**: create/delete/rename/reorder sheets; sheet list navigable; sheets persist via event log.

---

### S38 — Title blocks + viewports (Weeks 75–76, M19–M20)

**Goal**: drop a 3D / plan / section view onto a sheet; titleblock fills metadata.

**Deliverables**:
- `packages/stores/TitleBlockStore.ts`.
- `plugins/sheets/title-block.ts` — title-block templates + metadata bindings.
- `plugins/sheets/viewport.ts` — viewport drag-drop from view list onto sheet, scale + crop.
- `plugins/sheets/handlers/{AddViewport,SetTitleBlock,SetSheetMetadata}.ts`.

**Daily**: D1 title block store + templates; D2 viewport drag-drop UX; D3 viewport rendering (downscaled view as image); D4 viewport scale + crop; D5 title block metadata bindings; D6 e2e test; D7 lint; D8 perf; D9 demo; D10 buffer.

**Exit**: 3D / plan / section views droppable onto sheets; titleblock fills with project metadata; multi-viewport layout works.

---

### S39 — Sheet widgets (10 widget types) (Weeks 77–78, M20)

**Goal**: 10 widget types from `SheetEditorPanel.ts` decomposition: text, image, north arrow, scale bar, legend, revisions table, schedule snapshot, BIM tag, line, region.

**Deliverables**:
- `plugins/sheets/widgets/{Text,Image,NorthArrow,ScaleBar,Legend,RevisionsTable,ScheduleSnapshot,BimTag,Line,Region}.ts` — 10 widget classes.
- `plugins/sheets/widget-tool-palette.ts` — drag-from-palette UX.
- Parity tests: `tests/parity/sheet-widgets/` 30-case fixture.

**Daily**: D1–D2 first 4 widgets (canonical pattern); D3–D5 remaining 6 widgets (agent-multiplied); D6 widget palette UX; D7 parity tests; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: all 10 widget types functional; parity tests green; sheet renders correctly with all widget types present.

---

### S40 — PDF export (Weeks 79–80, M20–M21)

**Goal**: a 5-sheet drawing set exports to PDF in < 30 s; runs in worker via `apps/ai-worker`-class infrastructure (re-using bake-worker BullMQ pattern).

**Deliverables**:
- `plugins/sheets/export/pdf.ts` — orchestrates per-sheet rasterise + assemble.
- `apps/export-worker/` (new) — BullMQ worker, runs `pdf-lib` + per-sheet rasterise.
- `apps/bench/export-pdf.ts` — measures export latency on 5-sheet, 20-sheet, 50-sheet.
- OTel spans `pryzm.export.pdf.{rasterise,assemble,upload}`.

**Daily**: D1 worker skeleton; D2 per-sheet rasterise (off-screen canvas); D3 PDF assembly with `pdf-lib`; D4 metadata + bookmarks; D5 R2 upload + signed URL; D6 perf bench; D7 e2e test; D8 lint; D9 demo; D10 buffer.

**Exit**: 5-sheet drawing set exports to PDF in < 30 s; PDFs visually correct (visual diff vs reference); OTel spans visible.

---

### S41 — Schedule store + schedule view (Weeks 81–82, M21)

**Goal**: `ScheduleStore` + `plugins/schedules/` — schedules editable, formula evaluator working, auto-update on element edit.

**Deliverables**:
- `packages/stores/ScheduleStore.ts`.
- `plugins/schedules/handlers/` — 6 handlers (8 → 6 per triage).
- `plugins/schedules/formula-evaluator.ts` — pure formula DSL (sum, count, group, filter).
- `plugins/schedules/view.ts` — table view with sort/filter.
- Sample door-schedule fixture working.

**Daily**: D1 store + schema; D2 handlers; D3 formula evaluator core; D4 formula evaluator edge cases; D5 table view UI; D6 auto-update on element edit; D7 parity test (PRYZM 1 vs PRYZM 2 same fixture); D8 lint; D9 demo; D10 buffer.

**Exit**: door schedule with quantities + types; auto-updates within 1 frame on element edit; formula evaluator correct on 20-case fixture.

---

### S42 — Schedules export (CSV, XLSX, PDF) (Weeks 83–84, M21)

**Goal**: schedules export to CSV / XLSX / PDF; round-trip CSV import → edit → export.

**Deliverables**:
- `plugins/schedules/export/{csv,xlsx,pdf}.ts`.
- `plugins/schedules/import/csv.ts` (round-trip).
- `apps/export-worker/jobs/ScheduleExportJob.ts`.
- `apps/bench/export-schedule.ts`.

**Daily**: D1 CSV export; D2 CSV import + round-trip test; D3 XLSX export with `exceljs`; D4 schedule-PDF export (re-uses S40 pipeline); D5 perf; D6 e2e test; D7 lint; D8 sub-phase 2C demo; D9 retro; D10 buffer.

**Exit (2C)**: full documentation pipeline ported — plan view + section view + sheets + title blocks + 10 widgets + PDF export + schedules + 3 export formats.

---

## §5 Sub-phase 2D — Sync, awareness, beta launch (M22–M24, S43–S48)

**Sub-phase goal**: turn on real-time multi-user. Yjs CRDT live, awareness with active view + tool + selection, soft locks. **Beta launch at M24** with 25 invited users.

### S43 — Sync client (Yjs) + protocol (Weeks 85–86, M22)

**Goal**: `packages/sync-client/` over WebSocket; events as Yjs map operations; commands committed via patch+event; two tabs converge after 100 random edits.

**Deliverables**:
- `packages/sync-client/SyncClient.ts` — Yjs document, WebSocket transport, reconnect logic.
- `packages/sync-client/event-bridge.ts` — bridges command-bus events ↔ Yjs ops.
- `packages/sync-client/causal-test/` — chaos test harness; 100 random concurrent edits across N tabs, assert convergence.
- `apps/sync-server` extended with Yjs sync protocol (`y-websocket`-style).
- `apps/bench/sync-latency.ts` — measures same-second multi-user edit propagation.

**Daily**: D1 Yjs document setup; D2 WebSocket transport; D3 event bridge (forward direction: command → event → Yjs op); D4 reverse direction (Yjs op → patch → store); D5 reconnect + offline buffer; D6 chaos test harness; D7 100-edit convergence test; D8 perf bench; D9 demo; D10 buffer.

**Exit**: two tabs converge after 100 random edits in < 5 s; sync latency < 250 ms p95 for single-edit propagation; chaos-test invariants assert.

**Risk (R-02 in master)**: CRDT merge edge cases — mitigated by chaos test harness + `[strategic ADR-002]` spike artifacts (CRDT + event log bridge per SPEC-03 §3).

---

### S44 — Awareness extended (view, tool, selection) (Weeks 87–88, M22)

**Goal**: Yjs awareness broadcasts `activeViewId`, `activeTool`, `selection[]`. Multiplayer cursor + view chip + tool indicator visible to peers — *"User A is editing Sheet 3, User B is in plan view at Level 1"*.

**Deliverables**:
- `packages/sync-client/awareness.ts` — extends Yjs awareness with PRYZM-specific fields.
- `plugins/multiplayer/cursor.ts` — render peer cursors in 3D / plan / section views.
- `plugins/multiplayer/peer-list.ts` — sidebar list of connected users with their current view + tool.
- `plugins/multiplayer/peer-view-chip.ts` — per-peer chip showing their view location.

**Daily**: D1 awareness fields; D2 cursor rendering in 3D; D3 cursor in plan + section views; D4 peer list UI; D5 view chip UI; D6 throttle + perf; D7 e2e multi-user test; D8 lint; D9 demo; D10 buffer.

**Exit**: peer cursor + view + tool visible across all view types; throttle keeps awareness traffic < 5 KB/s per peer.

---

### S45 — Soft locks + lock UI (Weeks 89–90, M23)

**Goal**: per-element soft lock with TTL; visible in awareness; concurrent edit attempts respect the lock.

**Deliverables**:
- `packages/sync-client/locks.ts` — `acquireLock(elementId, ttl)`, `releaseLock`, `extendLock`.
- `plugins/multiplayer/lock-ui.ts` — visible badge on locked elements showing holder name.
- Conflict-resolution policy: lock-respecting; if a peer tries to edit a locked element, command is rejected with friendly error.
- TTL default 30 s; auto-extend on continued edit; release on tool deselect.

**Daily**: D1 lock acquire/release/extend; D2 server-side lock state in Postgres; D3 conflict rejection path + error UI; D4 lock UI badges; D5 TTL expiry handling; D6 e2e multi-user lock test; D7 lint; D8 perf; D9 demo; D10 buffer.

**Exit**: 2 users attempting same-element edit → lock holder wins, peer sees friendly notification; lock badges visible; TTL expiry cleans up correctly.

---

### S46 — Visibility-Intent migration waves 1–5 (Weeks 91–92, M23)

**Goal**: first half of the 11-wave Visibility-Intent system carried verbatim into `plugins/visibility-intent/`. The 11 waves are PRYZM 1's most battle-tested UI subsystem — they get **literal preservation**, not redesign.

**Deliverables**:
- `plugins/visibility-intent/waves/{w01,w02,w03,w04,w05}.ts` — exact functional equivalents.
- `plugins/visibility-intent/store.ts` — visibility state with per-view intent.
- `plugins/visibility-intent/handlers/` — 9 handlers (per triage).
- Parity tests for each of waves 1–5 (`tests/parity/visibility-intent/w01..w05/`).

**Daily**: D1 wave 1 (canonical example, slow + careful); D2–D6 waves 2–5 (one per day after canonical); D7 parity tests; D8 lint; D9 demo; D10 buffer.

**Exit**: waves 1–5 parity-tested vs PRYZM 1; visual diff < 1 px on visibility test set; OTel spans visible. Waves 6–11 deferred to S49.

---

### S47 — AI subsystem decomposition begins (Weeks 93–94, M24)

**Goal**: skeleton of `packages/ai-host/` (LLM orchestration) + `apps/ai-worker` (CV pipeline scaffolding) + first AI plugin shell `plugins/ai-floorplan/`. AI host is **lazily loaded** — no AI overhead on cold start.

**Deliverables**:
- `packages/ai-host/AiHost.ts` — lazy-loaded LLM orchestrator with approval queue interface.
- `apps/ai-worker/` — BullMQ worker skeleton; first heavy job will be CV pipeline in S50.
- `plugins/ai-floorplan/` — empty plugin shell; full impl in S50.
- `packages/stores/AiApprovalQueueStore.ts` — pending AI actions awaiting human approval.

**Daily**: D1 ai-host skeleton + lazy load; D2 ai-worker scaffolding + queue contract; D3 approval queue store + UI hook; D4 plugin shell; D5 first end-to-end smoke (AI batch → approval queue → manual accept → command commit); D6 OTel + perf; D7 lint; D8 demo; D9 buffer; D10 buffer.

**Exit**: AI host loads only on first invocation (verified via DevTools); approval queue UI rendered; one mock AI workflow committable.

---

### S48 — **M24 BETA GATE** + beta launch (Weeks 95–96, M24)

**Goal**: public beta sign-up; 25 invited beta users; crash + telemetry monitoring; bug triage workflow established.

**Deliverables**:
- Beta sign-up page on `pryzm.com/beta`.
- 25 invitations sent (curated mix of C1–C3 segments).
- Crash reporting: Sentry-equivalent OSS or self-hosted.
- Telemetry dashboard: Honeycomb / Tempo with beta-specific filters.
- Bug triage workflow: Linear/GitHub issue templates + per-bug OTel trace link.
- M24 comprehensive bench run; report in `apps/bench/reports/M24-beta.md`.
- Beta announcement blog post + 3-min beta demo screencast.

**Daily**: D1 beta sign-up page + email; D2 25 invitations; D3 Sentry-equivalent setup; D4 dashboards; D5 triage workflow; D6 bench run; D7 demo screencast; D8 announcement copy; D9 launch; D10 first 48-hour monitoring.

**Exit (M24 BETA GATE — full criteria)**:

#### Functional
- ~18 element families operational.
- Plan view + section view + sheets + 10 widgets + PDF export + schedules + 3 schedule export formats functional.
- Multi-user real-time geometry collab via Yjs; awareness; soft locks.
- Visibility-Intent waves 1–5 parity-tested.
- AI host lazy-loaded with approval queue UI (full AI workflows in 3A).

#### Performance
- All M12 numbers still green (regression bench).
- Sync latency: < 250 ms p95 for same-second multi-user edit propagation.
- 20 concurrent users on one project: no crashes, < 500 ms sync latency.
- 2-user same-element conflict: lock-respected, no data loss.
- Plan view: 60 fps interactive, 0 fps idle.
- PDF export: 5-sheet drawing set < 30 s.

#### Beta cohort
- 50+ beta sign-ups, 25 active in first 2 weeks.
- < 5 critical bugs reported (P0/P1).
- Crash-free session rate > 95%.
- OTel coverage for every reported bug enables 1-click trace lookup.

#### Architecture
- 50% of `(window as any)` legacy sites deleted from `apps/editor` (target: 1,039 remaining; legacy code being progressively retired).
- 50% of 264 commands consolidated into plugin handlers.
- All boundary lint rules still active and PR-blocking.
- `.pryzm` v1 stable; users can email files between machines + import them.

#### Documentation
- `apps/bench/reports/M24-beta.md` published with all numbers.
- 3-min beta demo screencast public.
- Beta announcement blog post live.
- Sub-phase retros archived in `docs/retros/S25–S48/`.

---

## §6 Phase 2 risk register (specific to M13–M24)

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R2-01 | Plan view migration overruns 2B | High | High | Both senior-level focus; daily visual diff; per-project fall-back flag retained until M24 | S31–S36 |
| R2-02 | Yjs CRDT loses data on multi-user same-element edit | Medium | Critical | `[strategic ADR-002]` CRDT spike pre-S01 (per SPEC-03 §3 + §6); chaos test harness in S43; halt + root-cause if any beta user reports loss | S43, S48 |
| R2-03 | Plan-view visual diff > 2 px on parity set | Medium | Medium | Visual-diff CI gate in S32; tighten progressively; allow 5 px in S31 → 2 px by S36 | S32, S33, S36 |
| R2-04 | PDF export slow on large drawing sets | Low | Medium | `apps/export-worker` background processing; progress UI; off-screen canvas rasterise | S40 |
| R2-05 | Schedule formula evaluator inconsistent with PRYZM 1 | Medium | Low | 20-case parity fixture in S41; keep evaluator pure for unit testing | S41 |
| R2-06 | Awareness traffic too chatty (> 10 KB/s per peer) | Low | Medium | Throttle in S44; benchmark with 20 simulated peers | S44 |
| R2-07 | Soft lock conflicts produce poor UX | Medium | Medium | UX review in S45; clear error messages; auto-release on tool deselect | S45 |
| R2-08 | Visibility-Intent regression in any of waves 1–5 | Medium | High | Literal preservation in S46; per-wave parity tests; user-facing diff < 1 px gate | S46 |
| R2-09 | Beta cohort exposes show-stopper UX gap | Medium | High | M24 beta is private (25 invited); 4-week bug-fix sprint S49 reserved for response | S48–S49 |
| R2-10 | Founder burnout after 12 months | Medium | High | 1-week mandatory rest after S24 (M12) and after S48 (M24); explicit "do nothing" weeks | M12, M24 |

---

## §7 Phase 2 kill-switches

- **K2-A** — If at end of S30 (M15) any of the second-tier element families (Rooms, Structural, MEP, Furniture) have failing parity tests, halt entry to 2B. Plan view depends on rooms + element data being correct.
- **K2-B** — If at end of S32 (M17) plan-view visual diff exceeds 5 px on the parity set, halt forward 2B work; root-cause; consider partial overrun acceptance into S33.
- **K2-C** — If at end of S43 (M22) Yjs chaos test fails to converge after 100 random edits, halt 2D forward work; do not invite beta users with broken sync.
- **K2-D** — If during beta (S48) any user reports same-element edit data loss, halt all sprint work; root-cause in CRDT layer; do not resume Phase 3 until regression locked out by test.
- **K2-E** — If at S48 (M24) sync latency exceeds 500 ms p95 with 20 concurrent users, halt beta widening; tune sync server before adding more users.

---

## §8 M24 beta gate — full exit criteria (consolidated)

For convenience, all M24 acceptance items in one place:

### Functional
- 18 element families operational + documentation pipeline + multi-user collab.
- Visibility-Intent waves 1–5 parity-tested.
- AI approval queue UI rendered (full AI in 3A).

### Performance
- All M12 numbers still green.
- Sync latency < 250 ms p95.
- 20 concurrent users no crashes.
- Plan view 60 fps interactive / 0 fps idle.
- PDF export 5-sheet < 30 s.

### Architectural
- 50% legacy `(window as any)` deleted.
- 50% commands consolidated.
- All boundary rules active.
- `.pryzm` v1 stable + email-portable.

### Beta cohort
- 25 active beta users; crash-free rate > 95%; < 5 P0/P1 bugs.

### Documentation
- M24 beta bench report published.
- Beta demo screencast public.
- Sub-phase retros archived.

---

## §9 What Phase 2 explicitly did NOT do

For honesty about scope and to set Phase 3 expectations:

- Visibility-Intent waves 6–11 still in PRYZM 1.
- Full AI workflows (CV pipeline, generative, rules, voice) still in PRYZM 1.
- No public AI API yet.
- No IFC, DXF, Rhino plugins yet.
- No component editor migration.
- No BCF round-trip.
- PropertyPanel + PropertyInspector still 5,500+ LOC each in legacy.
- No plugin SDK 1.0 publish; layer boundaries enforced but no external developer surface.
- No marketplace, no public REST/WS APIs yet.
- `@pryzm/headless` still internal; not on public npm.
- No self-host packaging.
- Browser matrix: Chromium-only confirmed; Firefox + Safari + Edge come in S70.
- Legacy `apps/editor` still has the 2,078 `(window as any)` sites; deletion is S61.

---

## §10 Phase 2 → Phase 3 handoff checklist

Items that must be true on M24 morning before starting S49:

- [ ] All M24 beta gate criteria signed off.
- [ ] `apps/bench/reports/M24-beta.md` reviewed and committed.
- [ ] Beta cohort feedback synthesised; top 10 issues prioritised.
- [ ] One full week of buffer (founder rest week — non-negotiable).
- [ ] Sprint S49 plan written; agent issues expanded.
- [ ] No P0/P1 bugs in beta; if any, fix-first before S49 starts.
- [ ] `phases/PHASE-3-COMPLETION-GA-M25-M36.md` re-read; risk register updated with anything learned in Phase 2.
- [ ] Decide: enable `featureFlags.plan_view_v2` by default for beta? (informed by 2B retro outcomes).

---

## §Gap-Closure Subphase — Phase 2D (S43–S48; added 2026-04-27 per `GAP-REVIEW-2026-04-27.md`)

Phase 2D is the production-cutover phase: Yjs goes live, Supabase becomes the production primary, the `project_command_log` is deleted, AI per-project budgets enforce. Every line below is binding.

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S43** | **Production cutover Replit-PG → Supabase** per SPEC-27 §3 with the 14-day rollback window. Sync server Yjs running on Reserved VM per SPEC-15 §2.2. Production health-check fails fast if `SUPABASE_URL` missing per SPEC-15 §4. AI per-project budget enforced per SPEC-28 §4; UI surfaces shipped per SPEC-28 §9. `authz.can` in every gateway route per ADR-028 Part F. Instantiation hooks deleted from `src/lifecycle/`; replacements in per-family plugins per ADR-030 Part D. | SPEC-15, SPEC-24, SPEC-27 §3, SPEC-28, ADR-028 |
| **S44** | Backup verification (nightly restore-into-fresh + checksum) lit per SPEC-24 §3.4. AI usage telemetry → Honeycomb metric `pryzm.ai.cost.usd` live per SPEC-28 §5.3. | SPEC-24, SPEC-28 §5.3 |
| **S45** | After 14-day verification clean: **`project_command_log` deleted**; Replit PG production data deleted; auto-fallback in `server.js` becomes dev-only (`NODE_ENV !== 'production'`). `src/snapping/` deleted; lives in `packages/picking/`. | SPEC-24 §1.3, SPEC-27 §4.3 |
| **S46** | `apps/bench/restore-verify.ts` nightly + alerting per SPEC-24 §3.4. Soft-locks (`Postgres soft_locks` table) lit per ADR-019 + SPEC-24 §1.3. | ADR-019, SPEC-24 §1.3 |
| **S47** | Beta closes; Phase 2 retro; Phase 3 plan refreshed against any drift. Capacity-cut Tier checkpoint per ADR-018 — decide whether T1.x are needed. | ADR-018 |
| **S48** | Phase 2 GA-rehearsal bench: `pnpm bench all` green; backup-restore drill green; AI cost dashboard signed off; SOC2-evidence collection plan ratified. | ADR-021, SPEC-24 §1.10 |

### Updated bench gates (this phase, M24 beta gate)
The M24 beta gate (existing) now also asserts:
- `pnpm bench restore-verify` green (Supabase PITR → fresh checksum match).
- `pnpm spec:audit-storage` green (per SPEC-24 §4 — no production code creates a table not in the map).
- `pnpm bench yjs-collab` shows ≤ 250 ms broadcast lag p95 at 50 concurrent users per ADR-019 + SPEC-15 §8.
- AI cost dashboard reflects live `ai_usage` rows; pre-call cap rejection works.
- All references to `service_role` Supabase keys removed from production routes.

### Updated entry/exit criteria
Entry to Phase 2D requires Phase 2C exit + 14-day Supabase staging burn-in green per SPEC-27 §3.1. Exit to Phase 3 requires the 14-day post-cutover rollback window cleanly elapsed AND `project_command_log` deleted AND M24 beta gate items above all green.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? `08-VISION.md` overrides. Plan-view risk is the highest in this phase; CRDT data-loss is the most catastrophic. Both have explicit kill-switches.*
