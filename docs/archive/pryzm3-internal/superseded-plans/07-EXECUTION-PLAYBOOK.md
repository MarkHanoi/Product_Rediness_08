# PRYZM 2 — Execution Playbook

> ⚠️ **SUPERSEDED BY** `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the `phases/PHASE-1*` … `phases/PHASE-3*` sub-docs for operational sequencing (re-anchored 2026-04-26; banner formalised 2026-04-29 per `phases/audits/PRYZM2-WIREUP-PLAN-S72/25-architecture-docs-cross-alignment.md` §25.8.2 Doc-PR-2).
>
> This document is preserved as the **per-subdomain migration recipe book**. Read `10-MASTER…` and the four `PHASE-1` sub-docs first; consult this doc only for legacy → new-architecture migration recipes.
>
> Audience: tech lead, every engineer, eventually every new hire.
> Honest timeline: **30–36 calendar months** for a team of 4 → 11 FTE.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/` (`PHASE-1A` … `PHASE-1D`).
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: PRYZM 2 stays **vanilla TypeScript** at L7. There is **no React migration**. The "vanilla-TS-to-React migration" workstream described in §10 of this playbook is **withdrawn**.
>
> **What in this doc is still authoritative**:
> - **§6 Per-subdomain migration recipes** — the canonical recipe book for each of the 30+ subdomains. PHASE-1B/1C/2 reference these recipes when migrating each family.
> - **§7 The 30-worst-files transformation table** — still the priority queue.
> - **§8 The 2,078 `(window as any)` deletion plan** — still the policy. The PHASE-1A CI gate (kill-switch K1A-2) tracks the count downward sprint by sprint.
> - **§9 The 264-command consolidation plan** — recipe still authoritative; raw counts are now ~110 *new* handlers per `06` §3.1.
> - **§11 AI subsystem migration plan (D2)**, **§12 documentation pipeline migration plan (D8)**, **§13 component-editor migration plan (D10)**, **§14 IFC subsystem migration plan (D9)**, **§15 collaboration migration plan (D1)** — all still the per-area playbook.
> - **§16 Pivot points** and **§21 Kill-switch criteria** — adopted by every PHASE doc as named kill-switches.
> - **§17 Team structure & hiring plan**, **§18 Culture & process changes**, **§19 Operational excellence (D5)** — still authoritative.
> - **§20 The endgame — what GA looks like** — still authoritative; equivalent to `10-MASTER…` §M36 GA gate.
>
> **What in this doc is SUPERSEDED**:
> - **§2 The 36-month roadmap at a glance** and **§§3–5 Year 1 / Year 2 / Year 3 sprint sequencing** → **superseded by `10-MASTER-IMPLEMENTATION-PLAN-36M.md`** as the single source of truth for *when* work happens. Use this doc for *what* migrates and *how*; use `10-MASTER…` and the PHASE docs for *when*.
> - **§1 Phase 0 — Pre-flight** "12 ADRs from `05` §17" → still the *seed* list, but the actual ADR sequence is now ADRs 001–019+ defined across PHASE-1A/B/C/D §3 (and growing through PHASE-2/3).
> - **§10 The vanilla-TS-to-React migration plan** → **WITHDRAWN ENTIRELY**. PRYZM 2 stays vanilla TS at L7 per the TypeScript Vanilla Decision in `08-VISION.md` §3 / `06` §0. Any sub-section of §10 that prescribes a React-port recipe for a panel or tool is null and void; the same panel/tool migrates onto the new layered architecture *as vanilla TS*. The effort budgeted to §10 is reallocated per `06` §0: kernel-purity hardening, L7.5 AI Operations, documentation pipeline.
> - References to a 7-layer model anywhere → use the 8-layer model from `08-VISION.md` §4 (L7.5 added).
> - "If `07` and `05` disagree, `07` wins" → superseded; the new conflict order is `06` + `.pryzm` spec → `08` → `10-MASTER…` + PHASE docs → `07` → `05` → `00`/`01`/`02`/`03`/`04`.

---

## Table of contents

0. How to read this playbook
1. Phase 0 — Pre-flight (month -1 to 0)
2. The 36-month roadmap at a glance
3. Year 1 — Foundation (months 1–12)
4. Year 2 — Migration & multi-user (months 13–24)
5. Year 3 — Completion, hardening, GA (months 25–36)
6. Per-subdomain migration recipes (30+ subdomains)
7. The 30-worst-files transformation table
8. The 2,078 `(window as any)` deletion plan
9. The 264-command consolidation plan
10. The vanilla-TS-to-React migration plan
11. The AI subsystem migration plan (D2 differentiator)
12. The documentation pipeline migration plan (D8 differentiator)
13. The component-editor migration plan (D10 differentiator)
14. The IFC subsystem migration plan (D9 differentiator)
15. The collaboration migration plan (D1 differentiator)
16. Pivot points — when to revisit
17. Team structure & hiring plan
18. Culture & process changes
19. Operational excellence buildout (D5 differentiator)
20. The endgame — what GA looks like
21. Kill-switch criteria
22. Post-GA roadmap

---

## 0. How to read this playbook

- **Sequencing is causal, not aspirational.** Each sprint depends on previous sprints. Do not parallelise out of order.
- **Every subdomain has a migration recipe.** §6 is the authoritative list. When in doubt, look up the subdomain in §6.
- **The 36-month timeline is honest, not optimistic.** Do not negotiate it down to make a stakeholder comfortable; renegotiate scope instead.
- **Each Year ends with a public deliverable.** Year 1: internal alpha. Year 2: external beta. Year 3: GA.
- **Pivot points (§16) are when the lead must re-examine the plan.** If a pivot makes the plan invalid, write a new playbook and supersede this one.
- **Numbers in `(parentheses)` reference §1 of `06-PRYZM-IDENTITY-AND-RECOUNT.md`** for the underlying audit data.

---

## 1. Phase 0 — Pre-flight (month -1 to 0)

Four weeks of zero-code preparation. If skipped, the plan fails by month 6.

### Sprint -2 (weeks -4, -3) — Decisions

| Deliverable | Who | Done when |
|---|---|---|
| 12 ADRs from `05` §17 written, reviewed, merged | L | All 12 in `docs/00_NEW_ARCHITECTURE/adrs/` |
| Stack frozen (`05` §2 + React confirmed for L7) | L | `package.json` of the empty `apps/editor` skeleton compiles |
| Identity + recount (`06`) reviewed by every engineer | All | Sign-off in PR comment |
| Timeline communicated up — 30–36 months, not 40 weeks | L + product | Stakeholder ack |
| Pascal repo cloned read-only at `editor/`, kept as a reference (not a dependency) | L | `.cursor/rules/pascal-reference.mdc` declares boundary |

### Sprint -1 (weeks -2, -1) — Scaffolding

| Deliverable | Who | Done when |
|---|---|---|
| pnpm workspace + Turborepo set up at repo root | L | `pnpm i && pnpm build` returns success on empty packages |
| ESLint + boundaries config + Prettier + tsconfig.base | S1 | CI gates one boundary violation correctly |
| Vitest harness + Playwright harness + load-bench skeleton | S1 | One unit test, one visual test, one perf test all pass |
| OpenTelemetry SDK init in `apps/editor` (currently dummy) | S2 | Trace appears in local Tempo |
| First nightly load-bench on existing PRYZM (baseline) | S2 | Numbers committed to `tools/load-bench/baseline-2026-Q3.json` |
| `.cursor/rules/*.mdc` (10 from Pascal + 5 PRYZM-specific) | L | All 15 rules pass linter |

### Phase 0 exit gate

PR is opened with the empty monorepo. CI is green. Every engineer has read `06` and signed off. **Now Sprint 1 begins.**

---

## 2. The 36-month roadmap at a glance

```
                       Year 1 (foundation)         Year 2 (migration)          Year 3 (completion)
Month                   1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36
─────────────────────  ─────────────────────────── ──────────────────────────  ──────────────────────────
L0–L3 foundation       █████████░
L4 kernel + walls/slabs        ████████░
L5 render runtime              ██████░
L6 plugin host                       ████░
First-party plugin set                        █████████░
React migration starts                         ████████████████████████████░
Multi-user (D1)                                          ██████░
Documentation pipeline (D8)                                       ████████████░
Visibility-Intent migration                                                ██████░
Import / export (IFC + DXF + Rhino + GLB)                                  ███████░
AI subsystem (D2)                                                                  ████████░
Component editor (D10)                                                                          ███████░
Tools, gizmo, snapping React                                                                            █████░
Platform shell React + commercial UI                                                                    ████░
Hardening + observability (D5)                                                                                █████░
Self-host (D3) packaging                                                                                            ████░
Plugin SDK 1.0 + marketplace (D4)                                                                                       ██░
Public REST/WS/headless API (D7)                                                                                          ██░
GA prep (security, perf, docs, demo)                                                                                          ████
                                                  ▲                              ▲                                           ▲
                                                  Internal alpha (m12)           External beta (m24)                          GA (m36)
```

**Year 1**: Foundation + element primitives + first-party plugins for primitives + start React. *Internal alpha at month 12.*
**Year 2**: Multi-user + documentation pipeline + visibility intent + import/export + AI. *External beta at month 24.*
**Year 3**: Component editor + tools + platform shell + hardening + GA. *Production GA at month 36.*

---

## 3. Year 1 — Foundation (months 1–12)

Goal: prove the architecture is real on a small but realistic feature set. Internal alpha at month 12 for one project type (residential, no IFC, single user).

### Q1 (months 1–3) — Monorepo, foundation, walls

#### Sprint 1 (m1) — Monorepo foundation
- Empty packages (`05` §3), CI green, OTel plumbed, load-bench baseline captured.
- Owner: L. Exit: `pnpm i && pnpm test && pnpm build` clean in < 5 min.

#### Sprint 2 (m1.5) — Schema migration & telemetry
- New Postgres tables (`05` §6) applied to staging.
- OTel spans (`05` §11.1) registered (dummy implementations).
- Owner: S2. Exit: nightly cold-load numbers recorded.

#### Sprint 3 (m2) — `protocol` + `domain` skeleton
- Event types, ULID, msgpackr codecs, base store contract.
- Reducer for level + wall + slab.
- Property tests via `fast-check`; 95% reducer coverage.
- Owner: S1. Exit: 1000-event random sequence reduces deterministically.

#### Sprint 4 (m2.5) — `geometry-kernel` walls
- `produceWallGeometry(dto, ctx)` — pure, no THREE, runs in Node.
- Math lifted from `WallFragmentBuilder.ts` lines ~800–1500 (the pure parts).
- Visual regression: 50 wall fixtures byte-identical in browser and Node.
- Owner: S1. Exit: vs legacy `WallFragmentBuilder` mesh, MSE < 0.01 mm² per vertex.

#### Sprint 5 (m3) — Persistence v1 + grids
- `persistence-client` reads/writes manifest + chunks against R2.
- Client-side baker (server bake comes later).
- `geometry-kernel/producers/grid.ts` (smallest primitive — single file in `src/elements/grids/`).
- Owner: S2 (persistence), S1 (grid). Exit: a fixture saves and reloads correctly.

#### Sprint 6 (m3.5) — `render-runtime` + scene committer + hierarchy store
- `FrameScheduler` (single rAF owner, lint-enforced).
- R3F shell in `frameloop="demand"`.
- `SceneCommitter` + `SceneRegistry` (Pascal pattern verbatim).
- `domain/store/hierarchy-store.ts` — port from `src/core/hierarchy/HierarchyStore.ts`.
- Owner: S1 (render-runtime), S2 (hierarchy). Exit: idle CPU < 1% verified.

### Q2 (months 4–6) — Worker pool, slabs, doors/windows, snapping

#### Sprint 7 (m4) — Worker pool + wall integration end-to-end
- `geometry.worker.ts` with Comlink, pool size = `hardwareConcurrency - 1`.
- `WallCommitter` listens to wall store dirty set, dispatches to worker, swaps THREE meshes.
- Behind `PRYZM_NEW_ARCH=walls` flag.
- Owner: S1. Exit: 1000-wall fixture renders identically; cold-load improvement ≥ 30%.

#### Sprint 8 (m4.5) — Slabs end-to-end
- Repeat the wall recipe for slabs.
- `geometry-kernel/producers/slab.ts` lifts pure math from `SlabTool.ts` (1779 LOC) and existing slab builder files.
- `SlabCommitter` analogue.
- Owner: S1. Exit: 500-slab fixture renders identically; flag `PRYZM_NEW_ARCH=walls,slabs`.

#### Sprint 9 (m5) — Server bake worker
- `apps/bake-worker` Node service + BullMQ.
- Chunk format = glb + Draco + Meshopt + KTX2 via `gltf-transform`.
- Sync server triggers bake on event append (sync server itself is minimal — just an HTTP endpoint at this stage).
- Owner: S2. Exit: single wall edit re-bakes affected chunk in < 2 s.

#### Sprint 10 (m5.5) — Doors + windows + openings
- Three small element families ported together (similar shapes; share opening logic).
- `geometry-kernel/producers/{door,window,opening}.ts`.
- Owner: S1 (door), S2 (window + opening). Exit: doors create real holes in walls (the producer context lookups work).

#### Sprint 11 (m6) — Snapping (early — UX critical)
- Port `src/snapping/providers/*` into `packages/render-runtime/snapping/` + `plugins/tools-suite/snapping/`.
- Grid, endpoint, midpoint, perpendicular, parallel snaps.
- Owner: S2. Exit: drawing a wall snaps to existing wall endpoints reliably.

#### Sprint 12 (m6.5) — Sync server bootstrap (no merge yet)
- `apps/sync-server` Yjs WS provider + auth (Supabase JWT) + per-project rate limit.
- Awareness only at this stage (cursors, selection halos, camera pose).
- No multi-user merge yet.
- Owner: S2. Exit: 3 simultaneous users see each other's awareness within 100 ms.

### Q3 (months 7–9) — Roofs, columns, beams, curtainwalls, stairs, handrails

Six element families ported in parallel by S1 + S2 (one each per sprint, alternating ownership).

#### Sprint 13 (m7) — Roof + column
- `geometry-kernel/producers/{roof,column}.ts`.
- Owner: S1 (roof), S2 (column).

#### Sprint 14 (m7.5) — Beam + curtain wall
- `geometry-kernel/producers/{beam,curtain-wall}.ts`.
- Curtain wall is non-trivial (panels + mullions); budget extra 0.5 sprint.
- Owner: S1 (beam), S2 (curtain wall).

#### Sprint 15 (m8) — Stairs + handrail
- Stairs is the largest primitive (27 files in `src/elements/stairs/` + 18 commands).
- Owner: S1 (stairs), S2 (handrail).
- Exit: spiral, straight, U-turn, switchback variants all render correctly.

#### Sprint 16 (m8.5) — Conflict-free merge + soft locks
- Server linearises events; per-command conflict policy (LWW for properties, reject-on-delete for refs).
- Soft locks: `pryzm_element_permissions` rows with TTL.
- Conflict inbox UI for unresolvable cases.
- Owner: S2. Exit: 5 users editing 50 walls in parallel converge to deterministic state.

#### Sprint 17 (m9) — Spatial + topology + constraints
- Port `src/spatial/`, `src/topology/`, `src/constraints/` into `packages/domain/spatial/`.
- These are foundational services many primitives need.
- Owner: S1. Exit: wall-wall miter joints, slab-wall connectivity all work in new arch.

#### Sprint 18 (m9.5) — Rooms + roomBoundingLines
- Rooms (17 files) + roomBoundingLines (4 files).
- Rooms depend on walls + spatial; that's why they come now.
- Owner: S2. Exit: room auto-detection from enclosed walls works.

### Q4 (months 10–12) — Furniture, ceilings, floors, structural, plan view phase 1, internal alpha

#### Sprint 19 (m10) — Ceilings + floors
- `geometry-kernel/producers/{ceiling,floor}.ts`.
- Owner: S1.

#### Sprint 20 (m10.5) — Structural + lighting + plumbing
- Three small subdomains in one sprint.
- Owner: S2.

#### Sprint 21 (m11) — Furniture core
- 12 element files + 39 builders + 4 carousel UI files.
- Strategy: all 39 builders become a single `plugins/furniture/` package with subfolders mirroring categories.
- Carousel UI deferred to Year 2 React migration; for alpha, a simple list works.
- Owner: S1 + S2 (split builders).

#### Sprint 22 (m11.5) — Plan view PHASE 1 (read-only projection)
- `geometry-kernel/producers-2d/wall-projection.ts`, `slab-projection.ts`, etc.
- A second R3F canvas in `apps/editor` rendering 2D projections.
- No annotations, no schedules, no sheets — just the geometry projected.
- Owner: S1. Exit: switching between 3D and plan view shows synchronized geometry.

#### Sprint 23 (m12) — Annotations + dimensions (basic)
- For alpha, basic annotations only (text + leader lines + dimensions).
- Full visibility-intent integration deferred to Year 2.
- Owner: S2.

#### Sprint 24 (m12.5) — **Internal alpha gate**
- 5 internal users build real residential projects on the new architecture for one week.
- Daily standup to triage issues.
- Demo: full session — login, create project, draw walls/slabs/doors/windows, switch to plan view, save, reload.
- Exit gate: zero P0 bugs after 7 days of daily use.

**Year 1 ends.** Internal alpha works. Foundation + 23 element families + plan view phase 1 + multi-user awareness + conflict-free merge + server bake. ~10 of 23 element families fully production-quality on the new arch; the other ~13 work but need polish.

---

## 4. Year 2 — Migration & multi-user (months 13–24)

Goal: External beta at month 24. Full feature parity with PRYZM today plus real multi-user collaboration. AI subsystem migrated. Documentation pipeline (plan/section/sheet/schedule) migrated. IFC import/export migrated.

### Q5 (months 13–15) — Plan view PHASE 2, section view, sheet preview

#### Sprint 25 (m13) — Plan view PHASE 2
- Port `EdgeProjectorService` (1867 LOC) into `geometry-kernel/producers-2d/` as pure functions.
- Port `PlanViewCanvas` (2150 LOC) into `plugins/plan-view/` as a React component.
- Port `PlanViewAnnotationRenderer` (2589 LOC) into `plugins/plan-view/annotation-renderer.tsx`.
- Owner: S1 + S2 (split). This is a 4–6 week effort, not a 2-week sprint. Allocate 3 sprints.

#### Sprint 26 (m13.5) — Plan view PHASE 2 continued
- Continue Sprint 25 work.
- `PlanViewManager`, `PlanViewService`, `PlanViewToolOverlay`, `PlanView2DSnapService`, `PlanView2DCreationMode`, `PlanViewVisibilityCuller`, `PlanViewInteraction` — port one per day.
- Owner: same.

#### Sprint 27 (m14) — Plan view PHASE 2 done + section view
- `SectionViewService`, `SectionBoxTool` ported.
- `OrthoPlanCameraLockController` ported.
- Multi-pipeline render runtime: 3D + plan + section all live, share scheduler.
- Owner: S1 (plan), S2 (section).

#### Sprint 28 (m14.5) — Sheet preview + title block
- `SheetStore`, `SheetCommentStore`, `TitleBlockStore` ported.
- Sheet editor as React app (port `SheetEditorPanel.ts` 2919 LOC).
- For beta: sheet editing works; advanced features (multi-page, sheet families) deferred.
- Owner: S2.

#### Sprint 29 (m15) — Schedule store + table producer
- `ScheduleStore`, `ScheduleDefinitionTypes` ported.
- `geometry-kernel/producers-table/schedule-table.ts` — pure function: store state → table data structure.
- For beta: schedule view works for walls + doors + windows; full coverage in v2.
- Owner: S1.

#### Sprint 30 (m15.5) — View definitions + view templates + view camera state
- `ViewDefinitionStore`, `ViewTemplateStore`, `ViewCameraStateStore` ported.
- `DefaultViewsManager`, `IViewSwitchListener`.
- Owner: S2.

### Q6 (months 16–18) — Visibility-Intent + IFC + DXF + Rhino

#### Sprint 31 (m16) — Visibility-Intent core
- Port `IntentRuleResolver`, `IntentBindingResolver`, `VisibilityIntentStore`, `VisibilityIntentDefaults`, `VisibilityIntentTypes`, `VisibilityRuleEngine` into `plugins/visibility-intent/`.
- The 11 waves of accumulated logic in `replit.md` must be respected — **no behaviour regression**.
- Owner: S1. Exit: parity test against the existing 11-wave behaviour passes 100%.

#### Sprint 32 (m16.5) — Visibility-Intent supporting machinery
- `IFCProjectionStore`, `PhaseFilterStore`, `ViewIntentInstanceStore`, `VGGovernanceStore`, `VGInstanceOverrideStore`, `VGSceneApplicator`, `ViewportPreviewRenderer`, `GhostOverlayRenderer`, `UnderlayRenderService`, `LayoutEngine`, `RenderingIntent`, `SystemIntents`, `PresentationEngine`.
- Owner: S1 (visibility), S2 (ghost + underlay + presentation engine). 3 weeks of coordinated work.

#### Sprint 33 (m17) — IFC import as plugin
- Port `src/import/ifc/` (16 files including conversion/) into `plugins/ifc-import/`.
- Heavy WASM (web-ifc) isolated to `apps/ifc-worker` Node service.
- Existing parity tests in `docs/IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md` must pass.
- Owner: S2. Exit: viewer build < 800 KB gzip without IFC; import a real customer IFC.

#### Sprint 34 (m17.5) — IFC export as plugin
- Port `src/export/ifc/` (15 files) into `plugins/ifc-export/`.
- IFC export validated against buildingSMART corpus (a subset for beta; full for GA).
- Owner: S2.

#### Sprint 35 (m18) — DXF + Rhino import + GLB + sheets export
- `plugins/dxf-import/`, `plugins/rhino-import/`, `plugins/glb-export/`, `plugins/pdf-export/`, `plugins/sheets-export/`.
- Most of these are thin wrappers around existing logic; quick wins.
- Owner: S1.

#### Sprint 36 (m18.5) — Catalog + asset library
- Port `src/core/catalog/` and `src/commands/catalog/` into `plugins/catalog/`.
- Owner: S2.

### Q7 (months 19–21) — AI subsystem migration (the differentiator)

This is one quarter of focused work because the AI subsystem is PRYZM's #1 competitive moat.

#### Sprint 37 (m19) — `ai-host` package (L7.5 layer)
- Create `packages/ai-host/`.
- Move `AIService`, `AIResponseParser`, `AIReadModel`, `AIElementFactory`, `AIApprovalRecord`, `AIApprovalStore` into it.
- Define the L7.5 contract: `AICommand`, `AIApproval`, `AIBatch`, `WorldModelAdapter` interfaces.
- Owner: S1.

#### Sprint 38 (m19.5) — Computer-vision pipeline as ai-worker
- Port `ImagePreprocessor`, `FloorPlanImageEnhancer`, `WallRegionExtractor`, `WallCandidateScorer`, `WallTerminatorDoorDetector`, `WallIntersectionResolver`, `DoorGapInpainter`, `DoorGeometricValidator` into `apps/ai-worker`.
- These run in Node (CPU-heavy CV) outside the browser.
- Browser uploads image → ai-worker processes → returns command batch → user approves → batch applied.
- Owner: S2.

#### Sprint 39 (m20) — `FloorPlanAIFactory` + batch executor
- Port `FloorPlanAIFactory`, `FloorPlanBatchExecutor`, `FloorPlanCommandBatcher`, `FloorPlanDiagnostics` into `plugins/ai-copilot/floor-plan/`.
- Owner: S1.

#### Sprint 40 (m20.5) — Generative + intents + rooms + voice
- `LayoutGenerator`, `GenerativeDesignAdvisor`, `RoomAIAssistant`, `RoomAICommandValidator`, `RoomWorldModelAdapter`, `VGIntentMapper`, `ViewAuthoringIntentMapper`, `VoiceSpatialInterface`, `SemanticQueryEngine`, `QueryEngine`, `RuleEngine`, `SemanticTagRegistry`, `SemanticIndex`, `SemanticGraph`.
- All ported into `plugins/ai-copilot/` or `plugins/generative/`.
- Owner: S2.

#### Sprint 41 (m21) — AmbientIntelligence + speculative engine + planar topology + AI documentation
- `AmbientIntelligence`, `SpeculativeEngine`, `PlanarTopologyEngine`, `WorldModelAdapter`, `Documentation.md`, `SYSTEM_PROMPT.md`.
- AI plugin integrated into editor: floor-plan upload → CV → batched commands → user approval → applied.
- Owner: S1 + S2.

#### Sprint 42 (m21.5) — AI plugin polish + first external-facing AI demo
- Approval UI in React.
- Streaming AI responses.
- Voice input wired.
- Demo video for marketing.
- Owner: S2 + product.

### Q8 (months 22–24) — Component editor, tools, platform shell, beta

#### Sprint 43 (m22) — Component editor sub-app
- Port `src/component-editor/` into `apps/component-editor/`.
- Component definitions become Zod schemas + producers, sharable via catalog.
- Owner: S1.

#### Sprint 44 (m22.5) — Tools migration
- Port `src/tools/` into `plugins/tools-suite/`.
- `SelectionManager` (2141 LOC) → smaller, composable selection plugins.
- `MarqueeSelectionTool`, `BeamTool`, `DetailViewTool`, `DxfUnderlayTool`, `FloorPlanUnderlayTool`, `LevelPlaneConstraint`, `HostedElementDragController`, `WallEndpointController`, `WallTransformController`, `SectionBoxTool`, `UnderlayReferenceRotateTool`, `UnderlayReferenceScaleTool`.
- Gizmo (`tools/gizmo/`) and operations (`tools/operations/`).
- Owner: S2.

#### Sprint 45 (m23) — Platform shell React rewrite phase 1
- Port `PlatformShell` (2207 LOC) and `PlatformRouter` into React.
- Landing page, auth modal, project hub all React.
- Stripe integration preserved (existing server.js untouched).
- Owner: dedicated React engineer (hired by m12).

#### Sprint 46 (m23.5) — Platform shell phase 2 + commercial UI
- Pricing page, contact sales, upgrade modal, owner settings, project member panel, CDE version panel React.
- Save orchestrator, server sync queue React.
- Owner: same.

#### Sprint 47 (m24) — Beta hardening
- Fix top P1 bugs from internal users.
- 30-day stability run.
- Performance budgets re-tuned.
- Owner: all.

#### Sprint 48 (m24.5) — **External beta gate**
- 10 customer projects on PRYZM 2.
- Customer success manager onboarded.
- Demo: customer scenario — open project, multi-user collab, AI floor-plan import, plan view + sheet, IFC export.

**Year 2 ends.** External beta running with real customers. ~80% feature parity with current PRYZM. Multi-user works. AI subsystem ported. Documentation pipeline ported. IFC ported.

---

## 5. Year 3 — Completion, hardening, GA (months 25–36)

Goal: Production GA at month 36. 100% feature parity. Plugin SDK 1.0 public. Self-host shipped. Marketplace launched. Legacy code deleted.

### Q9 (months 25–27) — UI completion + hardening start

#### Sprint 49–50 (m25–25.5) — Property panel + inspector React
- `PropertyPanel.ts` (3339 LOC) and `PropertyInspector.ts` (2808 LOC) → React.
- Decompose into per-element-type panels (composable).
- Owner: React engineer + S1.

#### Sprint 51–52 (m26–26.5) — Sheet editor + data workbench React
- `SheetEditorPanel.ts` (2919 LOC), `DataWorkbench.ts` (1784 LOC), `UnifiedBrowserPanel.ts` (1811 LOC) → React.
- Owner: React engineer + S2.

#### Sprint 53–54 (m27–27.5) — Furniture carousel + visualization engine + remaining UI
- `FurnitureCategoryRegistry.ts` (2114 LOC) → data-driven React component.
- `FurnitureGeometryFactory.ts` (1811 LOC) → producer function (already moved in m11).
- `VisualizationEnginePanel.ts` (1618 LOC), `ViewPropertiesPanel.ts` (1603 LOC), `ViewBrowser/*` → React.
- `Layout.ts` (1870 LOC) → React layout system.
- `initUI.ts` (2724 LOC) → deleted (replaced by React app shell).
- `EngineBootstrap.ts` (2086 LOC) → deleted (replaced by app boot).
- Owner: React engineer + S1.

### Q10 (months 28–30) — Plugin SDK 1.0 + marketplace + observability

#### Sprint 55 (m28) — Plugin SDK 1.0 published
- `@pryzm/plugin-sdk` published to npm.
- `pnpm pryzm-plugin dev <pkg>` and `pnpm pryzm-plugin pack <pkg>` CLIs.
- Sandbox proven against malicious plugin test.
- Owner: S1.

#### Sprint 56 (m28.5) — Marketplace
- Marketplace UI (project owner can browse + install plugins).
- Plugin signing + verification.
- 3 first-party plugins published as marketplace examples.
- Owner: S2.

#### Sprint 57 (m29) — Observability hardening (D5)
- Per-customer flame-graph dashboards in Honeycomb / Tempo.
- "Project performance" panel inside editor (admin view).
- Customer-facing slow-frame alerts.
- Owner: dedicated DevRel engineer.

#### Sprint 58 (m29.5) — Self-host packaging (D3)
- `docker-compose.yaml` complete (sync-server + bake-worker + ai-worker + ifc-worker + Postgres + Redis + MinIO).
- Helm chart for Kubernetes.
- Self-host docs site.
- Owner: DevOps engineer (hired by m24).

#### Sprint 59 (m30) — Public REST + WS + headless API (D7)
- `@pryzm/headless` published to npm.
- REST API documented at `api.pryzm.com/v2`.
- WebSocket API documented.
- Webhook integration documented.
- 3 reference integrations built (Linear, Slack, GitHub).
- Owner: S1.

### Q11 (months 31–33) — Decommission legacy + perf

#### Sprint 60 (m31) — Migration script + customer cutover
- `tools/scripts/migrate-legacy-project.ts` runs against every customer project.
- Per-project flag flipped from `legacy` to `pryzm2` after migration.
- 30-day rollback window kept.
- Owner: S2.

#### Sprint 61 (m31.5) — Legacy code deletion
- Delete `src/engine/EngineBootstrap.ts`.
- Delete `src/core/persistence/ProjectSerializer.ts`.
- Delete the 264 legacy command classes (replaced by ~110 handlers across plugins).
- Delete all 2,078 `(window as any).*` cast sites (per §8 below).
- Lint upgraded to `error` on all banned patterns.
- Owner: L (with seniors on standby).
- Exit: monorepo grep for `EngineBootstrap`, `ProjectSerializer`, `(window as any)`, `requestAnimationFrame` outside `packages/render-runtime`, `from 'three'` in `packages/protocol|domain|geometry-kernel` — **all return zero matches**.

#### Sprint 62 (m32) — Performance hardening
- 30-day perf observation summary.
- Top 10 slow paths optimised.
- Mobile viewer perf (<200 ms first interactive on a mid-tier Android tablet).
- Owner: S1.

#### Sprint 63 (m32.5) — Security hardening
- External pen test.
- Plugin sandbox tested with adversarial plugins.
- Audit log queryability stress-tested.
- Owner: external security firm + S2.

#### Sprint 64 (m33) — Browser support matrix verification
- Chrome, Edge, Safari 17+, Firefox 120+ all green.
- WebGPU on Chrome/Edge tested in production.
- Mobile Safari + Chrome verified for viewer.
- Owner: QA engineer (hired by m24).

### Q12 (months 34–36) — Documentation, marketing, launch

#### Sprint 65 (m34) — Docs site
- Architecture docs (this folder reformatted as a public docs site).
- Plugin SDK reference.
- REST/WS/headless API reference.
- Tutorial: "Build your first plugin in 30 minutes".
- Tutorial: "Migrate a Revit model to PRYZM 2".
- Owner: DevRel + technical writer.

#### Sprint 66 (m34.5) — Marketing-grade demo project
- A "showcase" project that demonstrates every differentiator (D1–D10).
- Used in launch video and on the website.
- Owner: product + marketing.

#### Sprint 67 (m35) — Launch checklist
- Security review signed off.
- Load test at 100 concurrent users per project, 1000 concurrent projects.
- Runbook published.
- On-call rotation set up.
- Customer success playbook written.
- Owner: L.

#### Sprint 68 (m35.5) — Pre-launch staging soak
- Production traffic mirrored to staging for 2 weeks.
- Zero P0 issues in last 14 days.
- Owner: all.

#### Sprint 69 (m36) — **Production GA**
- Public launch.
- Press, product hunt, IndustryNewsletter announcements.
- 100+ paying customer projects on PRYZM 2.
- Plugin marketplace live with 10+ plugins.
- Owner: all.

#### Sprint 70 (m36.5) — Stabilisation
- Hotfix sprint reserved for post-launch issues.
- Owner: all.

**Year 3 ends. PRYZM 2 is THE software.**

---

## 6. Per-subdomain migration recipes

For each of the 30+ subdomains identified in `06` §1.4. Format:

> **Name** | Current LOC, file count | Target package | Sprint | Recipe

### Element families (ported in Year 1)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **walls** | 24 files in `elements/walls/` + 19 commands; `WallFragmentBuilder.ts` 2256 LOC, `WallTool.ts` 1683 LOC | `plugins/wall/` | S4–S7 | Schema (Zod) → handler → reducer → producer (pure, lifted from FragmentBuilder lines 800–1500) → committer → tool |
| **slabs** | 14 files + 18 commands; `SlabTool.ts` 1779 LOC | `plugins/slab/` | S8 | Same as walls |
| **doors** | 9 files + 10 commands | `plugins/door/` | S10 | Same recipe; producer needs opening-cut context from wall |
| **windows** | 9 files + 8 commands | `plugins/window/` | S10 | Same as doors |
| **openings** | 4 files | `plugins/opening/` | S10 | Composes with doors/windows |
| **roofs** | 10 files + 13 commands | `plugins/roof/` | S13 | Same recipe |
| **columns** | 8 files + 8 commands | `plugins/column/` | S13 | Same recipe |
| **beams** | 5 files + 8 commands | `plugins/beam/` | S14 | Same recipe |
| **curtainwalls** | 13 files + 11 commands | `plugins/curtain-wall/` | S14 | Larger producer (panels + mullions); 1.5 sprints |
| **stairs** | 27 files + 18 commands; spiral/straight/U-turn variants | `plugins/stair/` | S15 | Largest single primitive; producer split per variant |
| **handrails** | 7 files + 10 commands | `plugins/handrail/` | S15 | Composes with stairs |
| **grids** | 1 file in `elements/grids/` + 12 commands | `plugins/grid/` | S5 | Smallest primitive — port first as warm-up |
| **rooms** | 17 files + 7 commands | `plugins/room/` | S18 | Auto-detection from enclosed walls; depends on `spatial` |
| **roomBoundingLines** | 4 files + 4 commands | (in `plugins/room/`) | S18 | Co-located with rooms |
| **structural** | 4 files | `plugins/structural/` | S20 | Beam + column composition |
| **lighting** | 5 files + 4 commands (in `commands/lighting`) | `plugins/lighting/` | S20 | Includes IES profiles |
| **plumbing** | 8 files + 5 commands | `plugins/plumbing/` | S20 | Pipe + fixture |
| **furniture** | 12 files in `elements/furniture/` + 39 builders + 4 carousel UI files; FurnitureCategoryRegistry 2114 LOC, FurnitureGeometryFactory 1811 LOC | `plugins/furniture/` | S21 | All 39 builders into the plugin; carousel UI deferred to React migration |
| **ceilings** | 9 files + 8 commands | `plugins/ceiling/` | S19 | Same recipe |
| **floors** | 10 files + 17 commands | `plugins/floor/` | S19 | Same recipe |
| **annotations** | 14 files + 22 in `annotations/tools/` + 10 commands; AnnotationRenderLayer 2628 LOC | `plugins/annotation/` | S23 | Basic in S23; full visibility-intent integration in S31–S32 |
| **dimensions** | 5 files + 11 commands | `plugins/dimension/` | S23 | Composes with annotations |
| **preview** | 2 files | (in `packages/render-runtime/preview/`) | S6 | Internal preview helper, not user-facing |

### Documentation pipeline (ported in Year 2 Q5)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **plan-view** | 27 files in `core/views/plantools/` + PlanViewCanvas (2150), PlanViewAnnotationRenderer (2589), PlanViewManager, PlanViewService, PlanViewToolOverlay, PlanViewVisibilityCuller, PlanViewInteraction, PlanView2DSnapService, PlanView2DCreationMode, PlanSnapEngine, PocheFillBuilder | `plugins/plan-view/` | S25–S26 | 2D producers in `geometry-kernel/producers-2d/`; React UI; multi-pipeline render |
| **section-view** | SectionViewService, SectionBoxTool, OrthoPlanCameraLockController | `plugins/section-view/` | S27 | Same pipeline as plan view |
| **edge-projection** | EdgeProjectorService 1867 LOC, FastPathProjectorService | `geometry-kernel/projection/` | S25 | Pure functions, run in worker |
| **sheet** | SheetStore, SheetCommentStore, SheetDefinitionTypes, SheetEditorPanel 2919 LOC | `plugins/sheet/` | S28 + S51–S52 | Store in S28; React editor in S51–S52 |
| **schedule** | ScheduleStore, ScheduleDefinitionTypes, ScheduleRegistry | `plugins/schedule/` | S29 | Table producer in `geometry-kernel/producers-table/` |
| **title-block** | TitleBlockStore, StructuredNameBuilder | `plugins/title-block/` | S28 | Composes with sheet |
| **view-definition** | ViewDefinitionStore, ViewTemplateStore, ViewCameraStateStore, DefaultViewsManager, IViewSwitchListener | `plugins/view-management/` | S30 | Manages all view types uniformly |
| **phase-filter** | PhaseFilterStore, PhaseFilterTypes | `plugins/phase-filter/` | S30 | Composes with visibility-intent |
| **navigation** | ViewController 1939 LOC, CameraToleranceService, navigation/ subdirectory | `packages/render-runtime/navigation/` | S30 | Camera control as part of render runtime |

### Visibility & presentation (ported in Year 2 Q6)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **visibility-intent** | 29 files in `core/presentation/` including IntentRuleResolver, IntentBindingResolver, VisibilityIntentStore, VisibilityIntentDefaults, VisibilityIntentTypes, VisibilityRuleEngine, VisibilityRuleTypes — 11 named refinement waves | `plugins/visibility-intent/` | S31 | Port verbatim; 11-wave behaviour parity test mandatory |
| **vg (visual grammar)** | VGGovernanceStore, VGInstanceOverrideStore, VGSceneApplicator, VGIntentMapper, ViewAuthoringIntentMapper | (in `plugins/visibility-intent/vg/`) | S32 | Composes with visibility-intent |
| **ifc-projection** | IFCProjectionStore, with parent-chain inheritance (Wave 10) | (in `plugins/visibility-intent/`) | S32 | Composes |
| **ghost + underlay rendering** | GhostOverlayRenderer, UnderlayRenderService, ViewportPreviewRenderer | (in `packages/render-runtime/passes/`) | S32 | Render passes |
| **view-range** | ViewRangeClassifier, ViewRangeFilterService, ViewRangeIntentResolver, ViewRangeZoneApplicator, CropRegionFilterService | (in `plugins/plan-view/view-range/`) | S26 | Plan-view-specific |
| **layout / data-panel** | LayoutEngine, DataPanelRenderer, DataPanelTypes | `plugins/sheet/layout/` | S28 | Sheet-specific |
| **3d appearance** | ThreeDAppearanceResolver | (in `packages/render-runtime/passes/`) | S32 | Render pass |
| **graphic hierarchy** | GraphicHierarchyRenderer | (in `plugins/visibility-intent/`) | S32 | Resolves layered graphic styles |
| **rendering intent / system intents / presentation engine** | RenderingIntent, SystemIntents, PresentationEngine | (in `plugins/visibility-intent/`) | S32 | Top-level orchestrators |
| **visual-style-manager** | VisualStyleManager | (in `packages/render-runtime/style/`) | S32 | Material/visual style application |

### Import / export (Year 2 Q6)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **ifc-import** | 16 files in `import/ifc/` + 20 in `import/ifc/conversion/` | `plugins/ifc-import/` (browser thin layer) + `apps/ifc-worker` (Node WASM heavy) | S33 | Existing parity tests must pass |
| **ifc-export** | 15 files in `export/ifc/` | `plugins/ifc-export/` + `apps/ifc-worker` | S34 | Validate against buildingSMART corpus |
| **dxf-import** | `import/dxf/` | `plugins/dxf-import/` | S35 | Thin wrapper around `dxf` npm package |
| **rhino-import** | `import/rhino/` | `plugins/rhino-import/` | S35 | Thin wrapper |
| **glb-export** | `export/glb/` | `plugins/glb-export/` | S35 | Uses `gltf-transform` |
| **pdf-export / sheets-export** | `export/sheets/`, RationaleExporter | `plugins/pdf-export/`, `plugins/sheets-export/` | S35 | jsPDF-based |

### AI subsystem (Year 2 Q7) — see §11 for the deep recipe

### System services (ported in Year 1 alongside primitives)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **hierarchy** | `core/hierarchy/HierarchyStore.ts` and supporting files | `packages/domain/store/hierarchy-store.ts` | S6 | Foundational; needed by everything |
| **sync-state** | `core/sync/SyncStateEngine.ts` | `packages/sync/sync-state.ts` | S12 | Foundational for collab |
| **collaboration** | `collaboration/CommandRegistry.ts`, `RemoteCommandDispatcher.ts` | `packages/sync/command-registry.ts`, `packages/sync/remote-dispatcher.ts` | S16 | Already half-built; complete it |
| **snapping** | `snapping/providers/*` | `plugins/tools-suite/snapping/` | S11 | Grid, endpoint, midpoint, perpendicular, parallel |
| **spatial** | `spatial/` + `core/SpatialAuthority.ts`, `SpatialIndex.ts` | `packages/domain/spatial/` | S17 | BVH-backed |
| **topology** | `topology/` + `core/TopologyGraph.ts`, `TemporalGraph.ts`, `SemanticGraph.ts` | `packages/domain/topology/` | S17 | Graph services |
| **constraints** | `constraints/` | `packages/domain/constraints/` | S17 | Geometric constraint solver |
| **schedules engine** | `core/schedules/` | (in `plugins/schedule/`) | S29 | Table data engine |
| **requirements** | `core/requirements/RequirementStore.ts` and supporting files | `plugins/requirements/` | S30 | Programme/brief tracking |
| **decision-records** | `core/DecisionRecordStore.ts` | (in `plugins/requirements/`) | S30 | Co-located |
| **batch / comparison / remediation** | `core/batch/`, `core/comparison/`, `core/remediation/` | `packages/domain/batch/`, etc. | S30 | Bulk operations infrastructure |
| **semantic-tag-registry / element-code-store / element-type-registry** | `core/SemanticTagRegistry.ts`, `core/ElementCodeStore.ts`, `core/presentation/ElementTypeRegistry.ts` | `packages/domain/registry/` | S6 | Registries used everywhere |
| **catalog** | `core/catalog/AssetCatalogStore.ts` and supporting files + 4 commands | `plugins/catalog/` | S36 | Asset library |
| **templates** | `core/templates/TemplateStore.ts`, `TemplateAssignmentStore.ts` + 4 commands | `plugins/templates/` | S30 | Project + element templates |
| **architecture-fragments / bim-kernel / bim-service / bim-world** | `core/ArchitectureFragments.ts`, `core/BimKernel.ts`, `core/BimService.ts`, `core/BimWorld.ts` | `packages/domain/bim/` | S6 | Foundational BIM facade |
| **store-event-bus** | `core/StoreEventBus.ts` | (replaced by L2 event bus) | S3 | Subsumed by new architecture |
| **store-registry** | `core/StoreRegistry.ts` | (replaced by L1 store contract) | S3 | Subsumed |
| **selection** | `core/selection/`, `core/SelectionBus.ts`, `tools/SelectionManager.ts` 2141 LOC | `plugins/tools-suite/selection/` | S44 | Decompose 2141 LOC into composable selection plugins |
| **persistence (legacy)** | `core/persistence/ProjectSerializer.ts` | DELETED | S61 | Replaced by L0 persistence-client |
| **migration** | `migration/` | DELETED | S60 | Replaced by `tools/scripts/migrate-legacy-project.ts` |
| **history** | `history/UndoManager.ts` | DELETED | S3 | Replaced by L2 event log replay |
| **physics** | `physics/` (small) | `plugins/physics/` (deferred) | post-GA | Niche |
| **lifecycle** | `lifecycle/` | `packages/domain/lifecycle/` | S30 | Element lifecycle states |
| **geospatial** | `geospatial/` | `plugins/geospatial/` | S35 | Cesium site context |
| **monetization / portfolio** | `monetization/`, `portfolio/` | (in `apps/editor` and existing server.js) | S46 | Commercial UI + Stripe — keep server.js logic |
| **cde** | `cde/StructuredName.ts`, `ui/platform/StructuredNameBuilder.ts`, `ui/platform/CDEVersionPanel.ts` | `packages/cde/` | S30 | ISO 19650 naming + BCF |

### UI shell (incremental React migration over months 4–32)

| Subdomain | Current | Target | Sprint | Recipe |
|---|---|---|---|---|
| **platform shell** | `ui/platform/PlatformShell.ts` 2207 LOC, `PlatformRouter.ts`, AuthModal, ProjectHub, PricingPage, etc. | `apps/editor/src/platform/` (React) | S45–S46 | 6-week React port |
| **property panel + inspector** | `ui/property-panel/PropertyPanel.ts` 3339, `PropertyInspector.ts` 2808 | per-element panels in `plugins/<element>/inspector/` | S49–S50 | Decompose by element type |
| **sheet editor** | `ui/SheetEditor/SheetEditorPanel.ts` 2919 | `plugins/sheet/editor/` (React) | S51 | Port verbatim then decompose |
| **data workbench** | `ui/dataworkbench/DataWorkbench.ts` 1784 | `plugins/data-workbench/` (React) | S52 | Tabular data inspection |
| **furniture carousel** | `ui/furniture-carousel/*` 4 files ~5 KLOC | `plugins/furniture/carousel/` (React) | S53 | Data-driven from category registry |
| **icons** | `ui/icons/PryzmIcons.ts` 2209 (icons-as-code) | `packages/ui/icons/` (extracted SVG files + tree-shakeable React component) | S55 | Convert to actual SVG + automated component generation |
| **layout** | `ui/Layout.ts` 1870 | `packages/ui/layout/` (React layout system) | S53 | Use TanStack Layout or custom |
| **inspect / audit stack** | `ui/inspect/AuditStack.ts` 1842 | `plugins/audit/` (React) | S54 | Audit trail viewer |
| **view browser** | `ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` 1811 | `plugins/view-management/browser/` (React) | S52 | View list + previews |
| **visualization engine panel** | `ui/rendering/VisualizationEnginePanel.ts` 1618 | `apps/editor/src/visualization/` (React) | S54 | Render settings UI |
| **view properties panel** | `ui/ViewPropertiesPanel.ts` 1603 | `plugins/view-management/properties/` (React) | S52 | View settings UI |
| **AI floor-plan import panel** | `ui/ai/FloorPlanImportPanel.ts` 1852 | `plugins/ai-copilot/floor-plan/import-panel/` (React) | S42 | Approval UI for AI batches |
| **bottom menu, tools panel, top bar, etc.** | `ui/bottom-menu/`, `ui/tools-panel/`, etc. | per-area folders in `apps/editor/src/` (React) | S43–S54 | Incrementally |
| **modePickers + autonomousAuditor + renderingPanels** | `styles/panels/*` 6+ KLOC | rewritten as React component panels | S54 | Most can be deleted (style code that grew arms and legs) |

### Tools (ported in Year 2 Q8)

Already covered in Sprint 44 above.

---

## 7. The 30-worst-files transformation table

For each of the top-30 LOC files (`06` §1.2), where does it go?

| LOC | File | Becomes | Sprint |
|---:|---|---|---|
| 3,339 | `ui/property-panel/PropertyPanel.ts` | Per-element React panels in `plugins/<elem>/inspector/`; the 3339 LOC decomposes to ~100 LOC per element panel × 23 elements + a 200-LOC framework in `packages/ui/inspector/` | S49–S50 |
| 2,919 | `ui/SheetEditor/SheetEditorPanel.ts` | `plugins/sheet/editor/` React component tree, decomposed | S51 |
| 2,808 | `ui/PropertyInspector.ts` | Same as PropertyPanel (paired) | S49–S50 |
| 2,724 | `engine/subsystems/initUI.ts` | DELETED (replaced by React app shell in `apps/editor/`) | S61 |
| 2,628 | `elements/annotations/AnnotationRenderLayer.ts` | `plugins/annotation/render-pass.ts` (render pass) + `plugins/annotation/producer.ts` (pure 2D producer) | S23, S31 |
| 2,589 | `core/views/PlanViewAnnotationRenderer.ts` | `plugins/plan-view/annotation-renderer.tsx` (React) | S26 |
| 2,256 | `elements/walls/WallFragmentBuilder.ts` | Pure parts → `geometry-kernel/producers/wall.ts` (~600 LOC); THREE bits → `plugins/wall/committer.ts` (~150 LOC) | S4 |
| 2,240 | `styles/panels/modePickers.ts` | DELETED (replaced by Tailwind + composable React panels) | S54 |
| 2,237 | `styles/panels/autonomousAuditor.ts` | DELETED (functionality moved to `plugins/audit/`) | S54 |
| 2,209 | `ui/icons/PryzmIcons.ts` | Extracted to `packages/ui/icons/*.svg` + auto-generated React components | S55 |
| 2,207 | `ui/platform/PlatformShell.ts` | `apps/editor/src/platform/Shell.tsx` (~400 LOC) + decomposed children | S45 |
| 2,150 | `core/views/PlanViewCanvas.ts` | `plugins/plan-view/canvas.tsx` (R3F) + `geometry-kernel/projection/plan.ts` | S25 |
| 2,141 | `tools/SelectionManager.ts` | Decomposed into `plugins/tools-suite/selection/{single,marquee,filter,history}.ts` | S44 |
| 2,114 | `ui/furniture-carousel/FurnitureCategoryRegistry.ts` | `plugins/furniture/category-registry.ts` (data-driven; ~300 LOC) + JSON catalog | S53 |
| 2,086 | `engine/EngineBootstrap.ts` | DELETED (replaced by `apps/editor/src/main.tsx` boot of ~150 LOC) | S61 |
| 2,030 | `engine/subsystems/initScene.ts` | DELETED (replaced by `<Viewer>` from `packages/render-runtime/`) | S6 |
| 1,939 | `core/navigation/ViewController.ts` | `packages/render-runtime/navigation/view-controller.ts` (~300 LOC; React/R3F native) | S30 |
| 1,870 | `ui/Layout.ts` | `packages/ui/layout/` (React layout primitives) | S53 |
| 1,867 | `core/views/EdgeProjectorService.ts` | `geometry-kernel/projection/edge-projector.ts` (pure function, ~600 LOC) | S25 |
| 1,852 | `ui/ai/FloorPlanImportPanel.ts` | `plugins/ai-copilot/floor-plan/import-panel.tsx` (React) | S42 |
| 1,842 | `ui/inspect/AuditStack.ts` | `plugins/audit/audit-stack.tsx` (React) | S54 |
| 1,811 | `ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` | `plugins/view-management/browser.tsx` (React) | S52 |
| 1,811 | `ui/furniture-carousel/FurnitureGeometryFactory.ts` | `geometry-kernel/producers/furniture/` (pure producers per category) | S21 |
| 1,784 | `ui/dataworkbench/DataWorkbench.ts` | `plugins/data-workbench/` (React) | S52 |
| 1,779 | `elements/slabs/SlabTool.ts` | Pure parts → `geometry-kernel/producers/slab.ts`; tool → `plugins/slab/tool.tsx` (R3F + React) | S8 |
| 1,683 | `elements/walls/WallTool.ts` | Pure parts → wall producer; tool → `plugins/wall/tool.tsx` | S4 |
| 1,665 | `elements/furniture/builders/ChairBuilder.ts` | `geometry-kernel/producers/furniture/chair.ts` (pure) | S21 |
| 1,640 | `styles/panels/renderingPanels.ts` | `apps/editor/src/visualization/` (React) | S54 |
| 1,618 | `ui/rendering/VisualizationEnginePanel.ts` | Same as renderingPanels | S54 |
| 1,603 | `ui/ViewPropertiesPanel.ts` | `plugins/view-management/properties.tsx` (React) | S52 |

**Total reduction across 30 files: ~62 KLOC → ~22 KLOC** (estimated). The rest is decomposed into many smaller files across the new architecture.

---

## 8. The 2,078 `(window as any)` deletion plan

Today: **2,078 sites in 325 files**. Each is a cross-module wiring shortcut. Each must be replaced.

### Why they exist

The vanilla TS architecture lacks a typed registry. To call `slabBuilder.rebuild()` from anywhere, the code does `(window as any).slabBuilder = slabBuilder` once and `(window as any).slabBuilder.rebuild()` everywhere else. There are 2,078 of these.

### The replacement pattern

A single typed service registry, populated at boot:

```ts
// packages/protocol/src/registry.ts
export interface PryzmServices {
  scene: SceneStore
  events: EventBus
  commands: CommandDispatcher
  geometry: GeometryWorkerPool
  // ... ~30 named services total
}

declare global {
  interface PryzmGlobal { services: PryzmServices }
}

export const services = new Proxy({} as PryzmServices, {
  get(_t, k: string) {
    const s = (globalThis as any).__pryzm_services_?.[k]
    if (!s) throw new Error(`Service ${k} not registered`)
    return s
  }
})

export function registerService<K extends keyof PryzmServices>(name: K, instance: PryzmServices[K]) {
  ;((globalThis as any).__pryzm_services_ ??= {})[name] = instance
}
```

Use:

```ts
// Before:
(window as any).slabBuilder.rebuild()

// After:
import { services } from '@pryzm/protocol'
services.slabBuilder.rebuild()    // ❌ slabBuilder isn't a service — use commands instead
services.commands.dispatch({ command: 'slab.rebuild', payload: { id } })  // ✅
```

### Migration tactic

- Sprint 3: introduce `services` registry, type-only.
- Sprint 7+: as each subdomain ports, the legacy code's `(window as any).x = x` lines are deleted; new code uses `services.x` or commands.
- Sprint 61: lint rule upgraded from warn to error on `(window as any)`. Any remaining sites caught and removed.
- Estimate: **350 sites die per sprint** in the migration phase (S33 onward), since porting a subdomain typically removes 50–200 such sites.

### How to count progress

```bash
# Sprint exit gate target:
rg -c '\(window as any\)' src | wc -l
# Sprint 24 target: < 1500
# Sprint 36 target: < 600
# Sprint 48 target: < 200
# Sprint 60 target: < 50
# Sprint 61 target: 0
```

---

## 9. The 264-command consolidation plan

`05` §14 outlined a triage. Here's the deeper recipe.

### 9.1 Triage script

```ts
// tools/scripts/audit-legacy-commands.ts
// Walk src/commands/, classify each command class by:
//  - intent string (constructor arg / class name)
//  - mutation surface (which stores it touches)
//  - reversibility (does it implement undo?)
//  - parameters
// Emit JSON: { drop[], merge[], port[], pluginLift[] }
```

Run this script in Sprint 1. Output is reviewed by L. Becomes the source-of-truth for migration order.

### 9.2 Categorisation rules

- **DROP** if: command has no test, no caller in any UI tool, comment marks "deprecated" or "debug-only".
- **MERGE** if: command is `Update<Element><Property>` for one of N properties — collapse all N into one `<element>.update` with patch payload.
- **PORT** if: command represents a distinct user intent (split, merge, cut hole, etc.).
- **PLUGIN-LIFT** if: command is specific to a plugin's domain (IFC import, AI batch, sheet authoring).

### 9.3 Expected outcome

| Category | Estimated count | Resulting handlers |
|---|---|---|
| DROP | 30–50 | 0 |
| MERGE | 100–140 → ~30 | ~30 |
| PORT | 60–80 | ~50 |
| PLUGIN-LIFT | 20–30 | (counted under plugins) |
| **Total handlers** | — | **~110** |

Plugin handlers per plugin (rough):
- `plugins/wall/`: 5 (create, update, delete, split, merge)
- `plugins/slab/`: 4
- `plugins/door/`: 3
- `plugins/window/`: 3
- `plugins/opening/`: 2
- ... per element plugin: 2–5
- `plugins/sheet/`: 8 (create, add view, remove view, set scale, ...)
- `plugins/schedule/`: 6
- `plugins/plan-view/`: 4
- `plugins/ai-copilot/`: 12 (each AI operation = a command type)
- `plugins/ifc-import/`: 4
- `plugins/visibility-intent/`: 8 (set rule, override per view, etc.)
- ... etc.

### 9.4 Per-command migration steps

For each legacy command being PORT'd or MERGE'd:

1. Run the triage script to find every caller.
2. Open `<plugin>/src/handlers/<command>.ts`. Define payload Zod schema.
3. Write `validate()` — lift checks from legacy class.
4. Write `produce()` — return event(s).
5. Add reducer cases for new event types.
6. Write parity test: legacy → run command → snapshot. New → dispatch command → snapshot. Snapshots must match.
7. Replace each caller with `services.commands.dispatch({...})`.
8. Delete the legacy class.
9. Verify `(window as any)` count dropped (those callers usually were).

### 9.5 Cutover order

Walls, slabs, doors, windows, openings, ceilings, floors, roofs, columns, beams, curtainwalls, stairs, handrails, grids, rooms, structural, lighting, plumbing, furniture, dimensions, annotations — covered by Sprints 4–24.

Sheets, schedules, view-definitions, plan-view, section-view — Sprints 25–30.

Catalog, IFC, DXF, Rhino, exports — Sprints 33–36.

AI commands — Sprints 37–42.

Component editor commands — Sprint 43.

Tools commands — Sprint 44.

Last 20–30 commands DROP'd in Sprint 61.

---

## 10. The vanilla-TS-to-React migration plan

The UI is vanilla TypeScript with manual DOM. This is HALF the project effort.

### 10.1 Strategy: incremental React islands

- **Don't rewrite the whole UI in one go.** That fails by month 6.
- **React lives inside the existing vanilla shell** initially. Mount React components into existing DOM containers. The legacy vanilla shell hosts React islands until the shell itself is rewritten.
- Each subdomain's UI ports when its data layer ports (the engineer holding the subdomain owns both layers).
- The platform shell (`PlatformShell.ts` 2207 LOC) is the LAST thing to port (Sprint 45–46), because it's the host. Until then, React components are mounted into divs the legacy shell creates.

### 10.2 Sequencing

- **Sprint 1**: Add React + R3F to the codebase (alongside vanilla, not replacing).
- **Sprint 6**: First R3F `<Viewer>` mounted into a vanilla-created div. Switching between legacy 3D viewer and new R3F viewer is a flag.
- **Sprint 7+**: As each element family ports, its tool UI is React (mounted as an island).
- **Sprint 21**: Furniture carousel React.
- **Sprint 23**: Annotations panel React.
- **Sprint 25–30**: All view + sheet + schedule UIs React (huge — 6 sprints of UI work).
- **Sprint 42**: AI panel React.
- **Sprint 43**: Component editor React.
- **Sprint 44**: Tool panels React.
- **Sprint 45–46**: Platform shell React. Now React is the host; vanilla islands flip the relationship.
- **Sprint 49–55**: Property panel, inspector, sheet editor, data workbench, view browser, visualization, view properties — all the big-LOC UI files — React.
- **Sprint 61**: Delete the last vanilla UI files. `EngineBootstrap.ts`, `initUI.ts`, `Layout.ts` go away.

### 10.3 React stack

| Concern | Choice | Why |
|---|---|---|
| Framework | React 19 | Latest stable; matches Pascal stack. |
| Routing | React Router 6 | Industry standard. |
| State (UI) | Zustand 5 | Same as Pascal; `domain` stores already use it. |
| 3D | R3F + drei | Same as Pascal. |
| Styling | Tailwind 4 + CSS modules for complex panels | Already in `package.json`. |
| Forms | React Hook Form + Zod | Reuses `domain` schemas. |
| Animations | Framer Motion (sparingly) | Reach for it only when CSS won't do. |
| Icons | Auto-generated from `packages/ui/icons/*.svg` | Replace 2209-LOC `PryzmIcons.ts`. |

### 10.4 React engineer hire

Year 1 Q3: hire a senior React engineer dedicated to L7 migration. They own the React stack, the icon migration, and the platform shell rewrite. Without this hire, the timeline fails.

---

## 11. AI subsystem migration plan (D2 differentiator)

PRYZM's #1 competitive moat. 31 files, including computer vision, LLM orchestration, voice, semantic queries. Treated as its own layer (L7.5).

### 11.1 Decomposition

- **CV pipeline (heavy)**: ImagePreprocessor, FloorPlanImageEnhancer, WallRegionExtractor, WallCandidateScorer, WallTerminatorDoorDetector, WallIntersectionResolver, DoorGapInpainter, DoorGeometricValidator, PdfToBimConstraints. → `apps/ai-worker` (Node, isolated heavy WASM/native deps).
- **LLM orchestration**: AIService, AIResponseParser, AIReadModel, AIElementFactory. → `packages/ai-host/` (browser + Node).
- **Approval flow**: AIApprovalRecord, AIApprovalStore. → `packages/ai-host/approval/`.
- **Batching**: FloorPlanCommandBatcher, FloorPlanBatchExecutor, FloorPlanDiagnostics. → `plugins/ai-copilot/floor-plan/`.
- **Generative**: LayoutGenerator, GenerativeDesignAdvisor. → `plugins/generative/`.
- **World model adapters**: WorldModelAdapter, RoomWorldModelAdapter. → `packages/ai-host/world-model/`.
- **Intent mappers**: VGIntentMapper, ViewAuthoringIntentMapper. → `plugins/visibility-intent/intent-mappers/` and `plugins/view-management/intent-mappers/`.
- **Voice**: VoiceSpatialInterface. → `plugins/ai-copilot/voice/`.
- **Semantic queries**: SemanticQueryEngine, QueryEngine, RuleEngine, SemanticTagRegistry, SemanticIndex, SemanticGraph, AmbientIntelligence, SpeculativeEngine, PlanarTopologyEngine. → `packages/ai-host/semantic/`.
- **Room AI**: RoomAIAssistant, RoomAICommandValidator. → `plugins/ai-copilot/room/`.

### 11.2 Migration sequence (Sprints 37–42)

Per §4 Q7 schedule above.

### 11.3 New AI capabilities enabled by L7.5

The AI subsystem becomes more powerful once it sits on the new architecture:

- **Streaming AI commands**: AI emits commands one at a time, user sees live preview, can stop/approve at any point.
- **AI as observer**: any user action becomes context for the next AI suggestion (event log is the AI's training context).
- **Multi-user AI**: one user's AI suggestion is visible to collaborators in real time.
- **Headless AI**: `apps/ai-worker` can be triggered by webhook for offline batch generation.
- **Plugin-defined AI ops**: third-party plugins can register their own AI commands via the L6 plugin host.

### 11.4 The AI-first workflow

For PRYZM 2 to feel AI-native, every UI surface has an AI counterpart:

- Property panel has "ask AI to suggest" button.
- Tool palette has "describe what you want, AI builds it".
- Sheet editor has "AI: generate sheet from view".
- Schedule has "AI: query in natural language".
- IFC import has "AI: clean up imported model".
- Plan view has "AI: detect rooms".

Each of these is a command in `plugins/ai-copilot/` consuming the world model.

---

## 12. Documentation pipeline migration plan (D8 differentiator)

The plan-view + section + sheet + schedule + title-block + view-template + phase-filter machinery. PRYZM's documentation depth is what makes it Revit-class. **Do not lose any of it during migration.**

### 12.1 The pipeline today

```
3D scene state → ViewController → PlanViewService → PlanViewCanvas
                                ↓
              EdgeProjectorService (pure-ish 2D projection math)
                                ↓
              PlanViewAnnotationRenderer (overlays annotations)
                                ↓
              PlanViewToolOverlay (interactive tools)
                                ↓
                     Browser canvas
```

### 12.2 Target pipeline

```
domain state → producers-2d (pure: edges, hatches, fills) ───┐
                                                              ↓
                                              render-runtime (multi-pipeline scheduler)
                                                              ↓
domain state → producers-2d/annotation (pure) ───────────────┤
                                                              ↓
                                                R3F canvas (orthographic, plan-view-tuned)
                                                              ↓
                                                React tool overlays
```

### 12.3 Migration steps (Sprints 25–30)

**S25 (m13)**: 
- Extract pure 2D projection math from `EdgeProjectorService.ts` into `geometry-kernel/projection/edge-projector.ts`. This is ~60% of the file's logic.
- The remaining 40% (THREE objects, event subscriptions) → `plugins/plan-view/edge-pipeline.ts`.
- Parity test: produce identical 2D projections vs legacy.

**S26 (m13.5)**:
- Port `PlanViewCanvas.ts` (2150 LOC) into `plugins/plan-view/canvas.tsx` (React + R3F orthographic).
- Port `PlanViewAnnotationRenderer.ts` (2589 LOC) into `plugins/plan-view/annotation-renderer.tsx`.
- Port the supporting services: `PlanViewManager`, `PlanViewService`, `PlanViewToolOverlay`, `PlanViewVisibilityCuller`, `PlanViewInteraction`, `PlanView2DSnapService`, `PlanView2DCreationMode`, `PlanSnapEngine`, `PocheFillBuilder`, `OrthoPlanCameraLockController`, `PlanElementDragController`.

**S27 (m14)**:
- Section view: `SectionViewService`, `SectionBoxTool` ported.
- Multi-pipeline render: 3D + plan + section all live, share scheduler.

**S28 (m14.5)**:
- Sheet editor (in S51 for the React UI; in S28 for the data layer).
- `SheetStore`, `SheetCommentStore`, `TitleBlockStore`, `LayoutEngine`, `DataPanelRenderer` ported.

**S29 (m15)**:
- Schedule store + table producer.
- `ScheduleStore`, `ScheduleDefinitionTypes`, `ScheduleRegistry` ported.
- `geometry-kernel/producers-table/schedule-table.ts`.

**S30 (m15.5)**:
- View management: `ViewDefinitionStore`, `ViewTemplateStore`, `ViewCameraStateStore`, `DefaultViewsManager`, `IViewSwitchListener`, `SplitViewManager`.

### 12.4 Risk

This is the riskiest single subsystem migration. Mitigations:
- Pair S1 and S2 on it (4 weeks of two seniors in lockstep).
- Run legacy and new pipelines side-by-side for a full sprint after each port; visual diff every frame.
- Customer feedback loop — beta customers test before broader rollout.
- Kill-switch: feature flag to fall back to legacy plan view per project, kept until end of Year 2.

---

## 13. Component-editor migration plan (D10 differentiator)

PRYZM has an in-editor parametric component authoring sub-app. Forma doesn't. This is a moat.

### 13.1 Today

- `src/component-editor/` — sub-app with own tools and workspace.
- `src/ui/component-editor/` — UI panels including Ribbon and ViewControls.

### 13.2 Target

- `apps/component-editor/` — separate React SPA, hosted at `editor.pryzm.com/components/:id`.
- Component definitions are Zod schemas with associated producers.
- A component is a small project with its own `domain` state, producers, and a publish flow that pushes into `plugins/catalog/`.
- Components published to catalog are usable in projects via a "place component" tool.

### 13.3 Migration (Sprint 43)

- `apps/component-editor/src/main.tsx` boots the sub-app.
- Reuses `packages/domain/`, `packages/render-runtime/`, `packages/ui/` — same as `apps/editor`.
- Component schema = `BaseComponent` (Zod) + `parameters[]` (Zod) + `producer` (function reference).
- Catalog entry = `{ schema, producer, thumbnail, metadata, version }`.
- Publishing = upload schema + producer code (TS) to catalog service.
- In a project, placing a component = create instance with parameter values; producer runs in worker; geometry committed.

---

## 14. IFC subsystem migration plan (D9 differentiator)

PRYZM today has IFC import (16 files) and IFC export (15 files). These need to be cleanly isolated as plugins with the heavy WASM moved to a Node worker.

### 14.1 Today

- `import/ifc/` uses `@thatopen/components` + `web-ifc` WASM in the browser.
- `export/ifc/` does intermediate model → IFC4 in browser too.
- Both are entangled with the main bundle.

### 14.2 Target

- `plugins/ifc-import/` — thin browser plugin: file upload UI, progress, post-import cleanup.
- `plugins/ifc-export/` — thin browser plugin: format selection, export trigger, download.
- `apps/ifc-worker/` — Node service that does the heavy WASM. Browser uploads file → worker processes → returns intermediate model → browser dispatches commands to add elements.
- Existing parity tests in `docs/IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md` must pass.
- Viewer build (`apps/viewer`) excludes `plugins/ifc-*` entirely → smaller bundle.

### 14.3 Migration (Sprints 33–34)

**S33 — IFC import**:
- Move WASM-using code into `apps/ifc-worker`.
- Move `IfcConversionCoordinator`, `IfcImporter`, `IfcLevelImporter`, `IfcModelStore`, `IfcGeometryRenderer`, `deleteIfcElement`, `ifcDebug` into the right places (worker for heavy lifting, plugin for orchestration).
- Browser plugin posts file via REST to worker, polls for completion, applies returned commands.
- Parity vs existing test corpus.

**S34 — IFC export**:
- Move `IfcExporter`, `IfcFileWriter`, `IfcGeometryWriter`, `IfcPropertyWriter`, `IfcSemanticWriter`, `IfcSpatialStructure`, `IfcModelBuilder`, `IntermediateModel`, `FragmentReader`, `auditIfc`, `ExportIFC`, `exportScope` into worker + plugin.
- Validate output against buildingSMART corpus.

### 14.4 BCF (BIM Collaboration Format)

`pryzm_comments` table + comments plugin can be exported as BCF 2.1 / 3.0. New plugin: `plugins/bcf/` (Sprint 35 backlog, deferred to v2 if needed).

---

## 15. Collaboration migration plan (D1 differentiator)

### 15.1 Today

- `src/collaboration/CommandRegistry.ts`, `RemoteCommandDispatcher.ts` — half-built remote command infrastructure.
- `src/core/sync/SyncStateEngine.ts` — sync state tracking.
- No real-time collaboration.

### 15.2 Target

- `apps/sync-server/` — Yjs WS provider + Express + Socket.io + auth + linearisation pipeline.
- `packages/sync/` — client-side: Yjs glue, awareness API, transport.
- Awareness state includes: cursor, selection, camera, **active view ID** (which view/sheet/schedule the user is looking at).
- Conflict-free merge: server linearises events; per-command policy; client rebases on rejected events.

### 15.3 Migration (Sprints 12, 16)

**S12 — Awareness only**:
- Yjs WS provider running.
- Cursors + selection halos + camera + active view shown.
- No conflict resolution yet — first writer wins.

**S16 — Conflict-free merge**:
- Server linearises events.
- Per-command policy:
  - Property updates: LWW.
  - Element deletes: reject if anyone else has a soft lock or recent edit.
  - Structural ops (split, merge): require optimistic-lock token from client.
- Soft locks: `pryzm_element_permissions` rows with TTL.
- Conflict inbox UI for unresolvable cases.

### 15.4 Same-second collab on geometry

The architecture enables this naturally:
- User A edits a wall → command → event → optimistic local apply → render.
- Event sent to sync-server in parallel.
- Server linearises, broadcasts to user B.
- User B's client receives event → reduces → committer → worker → render.
- End-to-end p95 target: **< 100 ms** for the wall to move on user B's screen after user A drags.

### 15.5 Awareness extension for multi-view

Pascal-class awareness shows cursor + selection. PRYZM goes further:

```ts
interface PryzmAwarenessState {
  cursor?: [number, number, number]
  selection?: string[]
  cameraPose?: { position: Vec3, target: Vec3 }
  editing?: { nodeId: string, lockedUntil: number }    // soft lock
  activeViewId?: string                                  // ← which view: 3D, plan-view-A, sheet-3, schedule-X
  activeTool?: string                                    // ← which tool they're using
}
```

This is the first time a BIM tool will show "User A is editing sheet 3, User B is in plan view at Level 1".

---

## 16. Pivot points — when to revisit

The plan is wrong if these pivots fail. Each is a checkpoint where the lead must re-examine.

| Month | Pivot question | If "no" |
|---|---|---|
| 3 | Does walls work end-to-end on the new architecture, with parity vs legacy and ≥ 30% cold-load improvement? | Halt. Revisit `01-TARGET-ARCHITECTURE.md`. Likely 1 month of architecture rework. |
| 6 | Does multi-user awareness work for 3 users at < 100 ms? | Halt. Revisit ADR-002 (Yjs choice). |
| 9 | Does the bake worker re-bake a chunk in < 2 s? | Halt. Revisit chunking strategy. |
| 12 | Internal alpha: 5 users, real residential project, 7 days zero P0 — yes? | Slip beta by one quarter. Spend Q1 of Year 2 on hardening. |
| 18 | Plan view + sheet + schedule pipeline ported with parity? | Slip beta by another quarter. This is the riskiest sub-project. |
| 21 | AI subsystem ported with all CV + LLM + voice working? | Slip AI plugin to v2; ship beta without AI. (Major identity hit; avoid.) |
| 24 | External beta: 10 customer projects on PRYZM 2 in production for 30 days, zero P0? | Slip GA by one quarter per failed pivot. |
| 30 | All UI in React; legacy `EngineBootstrap.ts` still alive — yes/no? | If `EngineBootstrap` is still alive: slip GA. The deletion gate is critical. |
| 33 | Plugin SDK 1.0 published with ≥ 3 third-party plugins from beta program? | Slip plugin marketplace to post-GA. |
| 36 | Definition of production-ready (`04` §6) all 10 met on a real customer project ≥ 10K elements? | Push GA back until all 10 are green. |

---

## 17. Team structure & hiring plan

### 17.1 Year 1 (months 1–12) — 4 FTE

- **L (lead)** — architecture, ADRs, PR review, customer comms.
- **S1 (senior, geometry-kernel-focused)** — L4, primitives, producers.
- **S2 (senior, persistence-and-sync-focused)** — L0, L3, server services.
- **D (designer / UX, part-time)** — UX patterns for new architecture, design system.

### 17.2 Year 2 (months 13–24) — 8 FTE

Adds:
- **R (senior React engineer)** — L7 migration (React + R3F).
- **B (BIM-domain expert)** — IFC, BCF, ISO 19650, customer comms with industry.
- **DR (DevRel)** — Plugin SDK, docs, third-party plugin program, observability customer surface.
- **AI (AI engineer)** — Owns L7.5 + AI subsystem migration + future AI features.

### 17.3 Year 3 (months 25–36) — 11 FTE

Adds:
- **DO (DevOps)** — Self-host packaging, Helm chart, SRE.
- **PM (product)** — Customer prioritisation, feature trade-offs.
- **QA (quality)** — Cross-browser, cross-device, regression suite, security review coordination.

### 17.4 Hiring sequence

| Month | Hire | Why |
|---|---|---|
| -2 | Confirm L + S1 + S2 + D | Pre-flight team. |
| 6 | Hire R | React migration starts ramping. |
| 9 | Hire B | IFC migration begins; need domain depth. |
| 12 | Hire DR | Plugin SDK design begins. |
| 15 | Hire AI | AI subsystem migration begins. |
| 24 | Hire DO + PM + QA | GA prep. |

### 17.5 Team rituals

- **Monday standup**: 30 min, demo per subdomain owner.
- **Wednesday architecture office hours**: lead 1 h, anyone can drop in.
- **Friday retro + demo**: 1 h per sprint end, public demo of what shipped.
- **Quarterly review**: half-day, review pivot points, re-baseline timeline.
- **ADR Tuesday**: any open decision, drafted as a 1-page ADR by the proposer, reviewed in standup.

---

## 18. Culture & process changes

The architecture is half the project. The other half is operating discipline.

### 18.1 Six rules nobody breaks

1. **No new features in `src/legacy/` after Sprint 8.** All new features in `packages/*` or `plugins/*`. Legacy is for bug fixes only.
2. **Every cross-cutting decision = ADR.** Lightweight, public, dated.
3. **Per-subdomain weekly demo.** Each subdomain owner shows progress in Friday retro.
4. **Performance budget enforced at PR time.** Anything > 5% regression blocked.
5. **Architecture office hours every Wednesday.** Lead holds 1 h to unblock anyone.
6. **Pascal repo is a reference, not a dependency.** Never `import` from `editor/`; never copy whole files; copy patterns and rules only.

### 18.2 The customer-pressure trap (and how to avoid it)

The single biggest risk to this plan: at month 14, a high-value customer asks for a feature that "would only take a week to add to the legacy system but two months to add the right way to the new system." If the team caves, the legacy system grows for another month and the migration slips by two.

**Rule**: any new feature work in legacy after Sprint 8 requires lead sign-off, and any "yes" is recorded as a budget overrun against the migration timeline. Three "yes"es in a quarter triggers a renegotiation of GA date. This must be visible to the customer-facing team so they understand the cost.

### 18.3 The 3-day rule for plan changes

If someone proposes a change to this playbook, they have 3 days to draft the change as a PR against this file. The PR is reviewed in the next architecture office hours. No verbal "let's just" — always written.

---

## 19. Operational excellence buildout (D5 differentiator)

### 19.1 Telemetry expansion (per `05` §11)

- All spans live by Sprint 24 (internal alpha).
- Per-customer dashboards by Sprint 32.
- "Project performance" in-app panel by Sprint 36 (admin-only).
- Customer-facing slow-frame alerts by Sprint 48.
- Anomaly detection on cold-load times by Sprint 57.

### 19.2 Observability stack

| Layer | Tool | Self-host alternative |
|---|---|---|
| Trace collection | OpenTelemetry SDK | (same) |
| Trace storage | Honeycomb | Tempo + Grafana |
| Logs | Honeycomb / Datadog | Loki + Grafana |
| Metrics | Prometheus | (same) |
| Errors | Sentry | GlitchTip |
| Frontend RUM | OpenTelemetry browser SDK | (same) |
| Uptime | Statuspage.io | Uptime Kuma |

For self-host customers: the entire stack ships in `docker-compose.yaml`.

### 19.3 SLOs (Service Level Objectives)

By GA:
- **Availability**: 99.9% per month for SaaS deployment.
- **Cold-load p95**: < 3 s on medium fixture.
- **Edit-to-paint p95**: < 33 ms.
- **Multi-user merge p95**: < 100 ms one peer to another.
- **Bake settled p95**: < 2 s.
- **Time to fix a P0**: < 4 h (on-call rotation).
- **Time to support response**: < 1 business day.

### 19.4 Customer support workflow

- Customer reports issue → support gathers the customer's project ID + time range.
- Support opens Honeycomb saved query: "all spans for project X in time range Y" → flame graph.
- Engineer can replay the customer's session in dev mode (events + chunks downloaded; same project state).
- 90% of issues resolved without back-and-forth.

This is **the support-debt killer**. PRYZM 2's TCO advantage over Revit isn't just price — it's that customer issues are reproducible.

---

## 20. The endgame — what GA looks like

Day of GA (month 36):

- ✅ `legacy/` folder deleted; lint enforces no imports from it.
- ✅ All 30 worst files (`06` §1.2) decomposed; none > 600 LOC.
- ✅ All 2,078 `(window as any)` deleted.
- ✅ All 264 legacy commands migrated or dropped.
- ✅ Multi-user collab working at < 100 ms p95 update.
- ✅ Server bake settled in < 2 s p95.
- ✅ Plugin SDK 1.0 published to npm with ≥ 5 third-party plugins.
- ✅ Public REST + WebSocket + headless Node API documented and used by ≥ 3 customer integrations.
- ✅ Self-host (docker-compose + Helm) used by ≥ 5 enterprise customers.
- ✅ Mobile viewer in app stores.
- ✅ IFC export passes buildingSMART certification at the level pursued.
- ✅ AI subsystem fully migrated; floor-plan import + voice + semantic query all live.
- ✅ Component editor sub-app live; ≥ 100 first-party components in catalog.
- ✅ Documentation pipeline (plan/section/sheet/schedule) at parity with current PRYZM.
- ✅ All 10 differentiators (D1–D10 in `06` §2.4) demonstrably true.
- ✅ Definition of production-ready (`04` §6) all 10 met on a real customer project ≥ 10,000 elements.
- ✅ 100+ paying customer projects on PRYZM 2; 0 P0 bugs in last 30 days.
- ✅ 30-day perf observation summary; mostly improvements vs legacy.
- ✅ External pen test passed.

When all are true: **PRYZM 2 IS THE software in this space.**

---

## 21. Kill-switch criteria

This plan is wrong if any of these become true. Halt and rethink:

1. **Month 6**: walls do NOT work end-to-end on new architecture with parity vs legacy. The architecture itself is wrong; spend a month redesigning.
2. **Month 9**: bake worker can't bake a chunk in < 5 s on the medium fixture. Re-evaluate chunking strategy.
3. **Month 12**: internal alpha fails — 5 users cannot use the new architecture for 7 days without P0 bugs. Slip beta by one quarter.
4. **Month 18**: plan view + sheet + schedule pipeline parity is < 80%. The riskiest sub-project; slip beta and add a senior.
5. **Month 24**: external beta has > 5 P0 bugs in last 14 days. Slip GA by 3 months; bring in QA earlier.
6. **Month 30**: legacy code is still ≥ 50% of the codebase. Cancel some non-essential lead-on features (D7, D9 partial); focus on legacy deletion.
7. **Month 33**: plugin SDK has zero third-party plugins. Marketing/devrel issue, not engineering; restructure DR org.
8. **Month 36**: definition-of-production-ready hits < 8 of 10. Delay GA by one quarter, fix the gaps.

If three kill-switch criteria fire in a single quarter: **escalate to leadership for re-baseline of the entire plan.**

---

## 22. Post-GA roadmap (year 4+)

After GA, the platform is real but not done. Planned work for year 4:

- **Q13–Q14**: Public plugin marketplace open submissions; revenue share.
- **Q14**: Native desktop shell (Tauri) for offline-first.
- **Q15**: Generative design at Forma's depth (parametric variants explorer).
- **Q15**: Native CFD wind simulation integration.
- **Q16**: VR/AR viewer mode.
- **Q16**: BCF round-trip certification.
- **Q17–Q18**: Localisation (EU, JP, CN markets).
- **Q18**: Open-source select packages (`@pryzm/protocol`, `@pryzm/headless`) under permissive license.

This is the shape of years 4+. But the playbook ends at GA.

---

## 23. The single discipline that makes this work

If only one paragraph from this entire 7-document architecture set is internalised by every engineer — make it this one:

> **The architecture is a shape. The discipline is what fills the shape with code that doesn't betray it. For 36 months, the team will be tempted, weekly, to take shortcuts: a `(window as any)` here, a feature added to `src/legacy/` "just this once", a new `requestAnimationFrame` outside the scheduler "because it's faster". Each individual shortcut is small. The compound interest of 100 such shortcuts is the system PRYZM has today. PRYZM 2 will be THE software if and only if the team has the discipline to refuse those shortcuts every single time, even when a customer is shouting, even when a deadline is slipping, even when the lead is on holiday. The architecture is just a way to make the discipline physically enforceable through CI gates. The CI gates fail; the team fixes the code; the code stays clean; the system stays inverted. That's it. That's the entire program.**

---

End of execution playbook.
