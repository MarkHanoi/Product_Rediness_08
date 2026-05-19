# PRYZM 2 — Identity & Recount

> Step back. Look at what PRYZM actually is today. Decide what it must become. Every architectural choice in `01`–`05` and every step in `07-EXECUTION-PLAYBOOK.md` is justified against this document.
> If `06` and any other doc disagree, `06` is the strategic anchor — the others must be revised to match.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor (UNCHANGED)**: This document **plus the `.pryzm` file-format spec remain the highest-priority overrides** in the doc set. `08-VISION.md` defers to `06` and to the file-format spec. Every other doc (00, 01, 02, 03, 04, 05, 07, 09, 10, PHASE-1A/B/C/D) defers to `08-VISION.md`, which in turn defers to `06`.
>
> **TypeScript Vanilla Decision (binding, sourced from this doc)**: §2.1 of this document established that PRYZM is **vanilla TypeScript today** (1,298 `.ts` files vs 2 `.tsx` files) and §3.1 noted the React migration would be "9–12 months running in parallel". The team has now formally **decided not to undertake that migration**. PRYZM 2 stays vanilla TS at L7. The implications:
> - The "L7 React migration" rows in §3.1 and §4 are **withdrawn**. L7 stays vanilla TS panels + canvas hosts.
> - The 30+ subdomain inventory in §1.4 still migrates onto the 8-layer architecture, but **none of them migrate to React** as part of the rebuild.
> - The "30–36 calendar months" estimate in §4 remains — the time saved by skipping React is reinvested in (a) hardening the L4 kernel as pure (no THREE, no DOM, no React), (b) the L7.5 AI Operations layer, and (c) the documentation pipeline migration.
> - Pascal's Next.js + React shell is therefore **not adopted** — only its patterns (per `03-PASCAL-EDITOR-ANALYSIS.md` §0).
>
> **What in this doc is fully authoritative (no changes)**:
> - All recount data in §1 (the numbers, the 30 worst files, the 30+ subdomains, the half-built CQRS).
> - The identity sentence in §2.6 — quoted as the opening epigraph of `08-VISION.md`.
> - The 10 differentiators D1–D10 (§2.4) — mirrored in `08-VISION.md` §5.
> - The 8-layer model with L7.5 AI Operations added (§3.2) — mirrored in `08-VISION.md` §4.
> - The expanded repository structure (§3.3) — `~12 packages + ~7 apps + ~30–35 plugins`.
> - The realistic 30–36-month timeline (§4) — operationalised by `10-MASTER-IMPLEMENTATION-PLAN-36M.md`.
>
> **Downstream propagation**: each of `00`, `01`, `02`, `03`, `04`, `05`, `07` carries its own `§0 Alignment header` reflecting the TypeScript Vanilla Decision and the supersessions noted here.

---

## 1. The recount — what PRYZM actually is, by the numbers

A fresh, exhaustive read of the repository (April 2026):

### 1.1 Scale

| Metric | Number | What it means |
|---|---|---|
| TypeScript lines in `src/` | **390,412** | Roughly 5× larger than I implicitly assumed in `00–05`. |
| `.ts` files | **1,298** | Vanilla TypeScript. |
| `.tsx` files | **2** | The UI is **not React** today. (`browser-entry.tsx`, `ProjectBrowser.tsx`.) |
| `server.js` | **149,954 bytes** single file | Plus the `server/` folder with another ~30 files. |
| Command classes | **264** | Across **30+** subdomains. |
| Element-type subdirectories | **23** | walls, slabs, ceilings, roofs, columns, beams, curtainwalls, stairs, handrails, grids, doors, windows, openings, dimensions, annotations, rooms, roomBoundingLines, structural, lighting, plumbing, furniture, floors, preview. |
| Files importing `three` | **372** | THREE permeates the codebase. |
| Files importing `@thatopen/components` | **91** | OBC permeates much further than the IFC pipeline. |
| Files calling `requestAnimationFrame` | **58** | 58 frame-loop owners, no single scheduler. |
| `(window as any).*` cast sites | **2,078** | In **325 distinct files** — 1 in 4 source files. |
| Named stores already in `src/core/` | **27** | A partial CQRS shape already exists, half-finished. |
| Engine init subsystems | **8** | `initBuilders`, `initCollaboration`, `initDataPlatform`, `initPersistence`, `initScene`, `initStores`, `initTools`, `initUI` — already a partial layering. |
| Stripe-touching files | **12** | Real billing wired end-to-end. |
| Supabase-importing files in `src/` | **0** | Auth/DB live entirely server-side. Good. |
| `replit.md` size | **4,187 lines** | A working architectural log, currently at "§VI-WAVE-11" of the Visibility-Intent system. |
| `docs/` folders | **50+** | Including `MASTER-IMPLEMENTATION-PLAN.md`, `IFC-IMPORT-NATIVE-PARITY-IMPLEMENTATION.md`, `PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md`, `MULTI-CAMERA-SINGLE-PIPELINE-PLAN.md`. PRYZM has a **strong planning culture**. |

### 1.2 The 30 worst files (~50 KLOC of concentrated debt)

Top-30 by line count — these 30 files are 13% of the codebase by LOC and ~80% of the architectural debt:

| LOC | File |
|---:|---|
| 3,339 | `src/ui/property-panel/PropertyPanel.ts` |
| 2,919 | `src/ui/SheetEditor/SheetEditorPanel.ts` |
| 2,808 | `src/ui/PropertyInspector.ts` |
| 2,724 | `src/engine/subsystems/initUI.ts` |
| 2,628 | `src/elements/annotations/AnnotationRenderLayer.ts` |
| 2,589 | `src/core/views/PlanViewAnnotationRenderer.ts` |
| 2,256 | `src/elements/walls/WallFragmentBuilder.ts` |
| 2,240 | `src/styles/panels/modePickers.ts` |
| 2,237 | `src/styles/panels/autonomousAuditor.ts` |
| 2,209 | `src/ui/icons/PryzmIcons.ts` (icons-as-code) |
| 2,207 | `src/ui/platform/PlatformShell.ts` |
| 2,150 | `src/core/views/PlanViewCanvas.ts` |
| 2,141 | `src/tools/SelectionManager.ts` |
| 2,114 | `src/ui/furniture-carousel/FurnitureCategoryRegistry.ts` |
| 2,086 | `src/engine/EngineBootstrap.ts` |
| 2,030 | `src/engine/subsystems/initScene.ts` |
| 1,939 | `src/core/navigation/ViewController.ts` |
| 1,870 | `src/ui/Layout.ts` |
| 1,867 | `src/core/views/EdgeProjectorService.ts` |
| 1,852 | `src/ui/ai/FloorPlanImportPanel.ts` |
| 1,842 | `src/ui/inspect/AuditStack.ts` |
| 1,811 | `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` |
| 1,811 | `src/ui/furniture-carousel/FurnitureGeometryFactory.ts` |
| 1,784 | `src/ui/dataworkbench/DataWorkbench.ts` |
| 1,779 | `src/elements/slabs/SlabTool.ts` |
| 1,683 | `src/elements/walls/WallTool.ts` |
| 1,665 | `src/elements/furniture/builders/ChairBuilder.ts` |
| 1,640 | `src/styles/panels/renderingPanels.ts` |
| 1,618 | `src/ui/rendering/VisualizationEnginePanel.ts` |
| 1,603 | `src/ui/ViewPropertiesPanel.ts` |

These are the priority targets for the migration playbook in `07`.

### 1.3 What we missed in earlier docs

Things `00–05` understated or omitted entirely:

1. **The codebase is vanilla TypeScript, not React.** A React migration is HALF the project. `05` glossed over this.
2. **Stripe billing is fully wired** (12 files). Not "to be added" — already in production.
3. **The AI subsystem is enormous** — 31 files including `FloorPlanAIFactory`, `GenerativeDesignAdvisor`, `RoomAIAssistant`, `VoiceSpatialInterface`, `RuleEngine`, `SemanticQueryEngine`, `PdfToBimConstraints`, `DoorGapInpainter`, `WallCandidateScorer`, `WallIntersectionResolver`, `WallTerminatorDoorDetector`, `WorldModelAdapter`. This is **research-grade computer-vision-to-BIM** infrastructure.
4. **The plan-view + sheet + schedule + section pipeline is a second renderer** — 54 files in `core/views`, 40 commands in `commands/views`, with `PlanViewCanvas` (2150 LOC), `PlanViewAnnotationRenderer` (2589 LOC), `EdgeProjectorService` (1867 LOC), `SectionViewService`, `SheetStore`, `SheetEditorPanel`, `ScheduleStore`, `TitleBlockStore`, `PlanSnapEngine`, `PocheFillBuilder`. Pascal has none of this.
5. **The Visibility-Intent system has 11 named refinement waves** in `replit.md`. PRYZM has architectural maturity in *some* areas.
6. **27 stores already exist**, organized into element stores, view stores, and system stores — the CQRS shape is **half-built**, not absent.
7. **The component-editor is a separate sub-app** for parametric component authoring (Revit Family Editor analogue). Forma doesn't have this.
8. **The Common Data Environment (CDE) is wired** — even if just one module today (`StructuredName.ts` + `CDEVersionPanel.ts`), the intent is ISO 19650 BIM workflow.
9. **`EngineBootstrap.ts` already does dynamic-import deferred loading** to keep the platform shell light. There IS architectural awareness; it's just been overpowered by accumulated wiring.
10. **The team uses a `§06 §9`-style architecture-contract notation** in code comments and `MODIFICATION DECLARATION` blocks. There's an existing discipline — patches haven't yet eaten it.

### 1.4 The 30+ subdomains in inventory

`src/` decomposes into these subdomains. Each is a distinct migration unit in `07`:

**Element families (23):** walls, slabs, floors, ceilings, roofs, columns, beams, curtainwalls, stairs, handrails, grids, doors, windows, openings, dimensions, annotations, rooms, roomBoundingLines, structural, lighting, plumbing, furniture, preview.

**Documentation (1, but huge):** plan-view + section-view + sheet + schedule + title-block + view-template + phase-filter (54 files in `core/views` + 40 commands).

**Visibility / presentation (1, also huge):** Visibility-Intent + Visual-Grammar + IntentBindingResolver + IntentRuleResolver + ViewRange + GhostOverlay + UnderlayRender + ElementGraphics + 3DAppearanceResolver (29 files in `core/presentation`).

**System services:** hierarchy, sync, snapping, spatial, topology, constraints, semantic-graph, semantic-index, spatial-authority, temporal-graph, decision-record, requirement, batch, comparison, remediation, schedules.

**AI:** core AI service + intents + rooms + vg + voice + computer-vision + generative.

**Generative:** layout-generator + types.

**Tools:** select, marquee, beam, detail-view, dxf-underlay, floorplan-underlay, level-plane-constraint, hosted-element-drag, wall-endpoint, wall-transform, gizmo, operations, section-box.

**Component editor:** sub-app with its own tools and workspace.

**Catalog:** asset catalog + commands.

**Import:** IFC (16 files, the deepest), DXF, Rhino.

**Export:** IFC (15 files), GLB, sheets.

**Platform / commercial:** PlatformShell, PlatformRouter, AuthModal, ProjectHub, PricingPage, ContactSalesModal, UpgradeModal, OwnerSettingsPanel, ProjectMemberPanel, CDEVersionPanel, ProjectRepository, SaveOrchestrator, ServerSyncQueue, monetization, portfolio.

**Geospatial:** Cesium-based site context.

**Physics:** physics overlay (small, niche).

**UI shell:** 45 files in top-level `ui/` plus dozens of sub-folders.

**That's 30+ first-class subdomains.** Each one needs its own migration recipe. Each one is bigger than most Pascal packages.

### 1.5 The half-built CQRS already in PRYZM

`StoreEventBus`, `StoreRegistry`, `CommandRegistry`, `RemoteCommandDispatcher`, `SyncStateEngine`, `CommandProposalFactory`, `CommandProposalStore`, 264 named command classes, and 27 stores already exist. A previous attempt to introduce CQRS got 30–40% of the way and stopped.

This is **a critical finding**: PRYZM 2 should *complete* this CQRS pattern, not replace it. Many of the tools, the contracts, and the team's mental model are already in place. Throwing them away would be wasteful; building on them is faster than starting from scratch.

The architecture in `01-TARGET-ARCHITECTURE.md` is fundamentally compatible with what's already here. It needs to be reframed as **finishing what was started**, not **rebuilding from zero**.

---

## 2. Identity — what PRYZM is, what THE software means

### 2.1 What PRYZM IS today

A **single-user, web-native, vanilla-TypeScript BIM authoring platform** with:
- Comprehensive element coverage (23 families).
- Full BIM documentation pipeline (plan, section, elevation, schedule, sheet, title block, phase filter).
- Native IFC import/export with property sets.
- Multi-tenant Supabase-backed projects with Stripe billing.
- A research-grade AI subsystem that converts PDFs and floor-plan images into BIM models.
- A parametric component editor sub-app.
- An 11-wave Visibility-Intent system rivaling Revit's Visibility/Graphic Overrides.
- A 4,187-line architectural memory.

It is **not a toy modeller**. It is **closer to Revit-on-the-web than to Forma**.

### 2.2 What PRYZM MUST BECOME — "THE software"

> **PRYZM 2 is the open, web-native, AI-native, multi-user BIM authoring platform with desktop-CAD documentation parity, that anyone can self-host and anyone can extend.**

Each clause is non-negotiable; each maps to architecture choices.

| Clause | What it means | Where it lives in the architecture |
|---|---|---|
| **Open** | Public plugin SDK, public REST/WS API, IFC4 round-trip, BCF issues, ISO 19650-aware naming, optional self-host. | L6 plugin host, `apps/sync-server` REST surface, `plugins/ifc-import`, `plugins/ifc-export`. |
| **Web-native** | Browser-first, no desktop install, mobile viewer. WebGPU when available, WebGL2 fallback. | L5 render runtime, `apps/viewer` mobile build. |
| **AI-native** | AI is a first-class plugin that consumes the same event log a human does. Every command has an AI counterpart; every operation can be invoked from natural language. | L2 events as the AI substrate, L6 plugin host with an AI-ops permission tier, `plugins/ai-copilot`. |
| **Multi-user** | Same-second collaboration on geometry. Awareness includes which view/sheet/schedule each user is in. Conflict-free merge for non-overlapping edits. | L2 commands as the wire format, L3 sync (Yjs + linearisation server). |
| **BIM authoring platform** | All 23 element families, parametric components, IFC fidelity, materials, levels, grids, phases. | L1 stores (27 → ~50), L4 producers per family, `plugins/<family>`. |
| **Desktop-CAD documentation parity** | Sheets, schedules, title blocks, plan/section/elevation views, view templates, phase filtering, visibility/graphic overrides — all at Revit-class quality on the web. | L4 has 2D producers (the existing `EdgeProjectorService` machinery), L5 supports multi-pipeline render, `plugins/views`, `plugins/sheets`, `plugins/schedules`. |
| **Self-hostable** | The whole stack runs as `docker-compose up` for SMB and as a Helm chart for enterprise. No SaaS lock-in. Postgres + S3-compatible + Redis + Node services. | `docker-compose.yaml`, `charts/pryzm/`, storage abstraction in L0. |
| **Anyone can extend** | Plugin SDK with hot-reload in dev, sandboxed iframe in prod, signed manifests, public marketplace. | L6 plugin host, `@pryzm/plugin-sdk`, `plugins/*` as exemplars. |

### 2.3 Triangulation against the four real competitors

Every architecture must declare what it's NOT trying to be. This is mine:

| Product | What they have that PRYZM doesn't | What PRYZM has that they don't | PRYZM's lead-on |
|---|---|---|---|
| **Forma** (Autodesk) | Cloud-rendered analysis, GIS context, conceptual-design ergonomics, Autodesk ecosystem. | Full BIM authoring depth, parametric components, AI floor-plan import, plan-view/sheet/schedule pipeline at desktop quality, openness. | **BIM depth + openness.** PRYZM is "Forma if it could actually do detailed design and you could host it yourself." |
| **Qonic** | Real-time multi-user, IFC-native, BCF issues, dedicated cloud infra. | Deeper BIM documentation, AI subsystem, parametric components, broader element coverage. | **AI + documentation + extensibility.** PRYZM is "Qonic with the AI of Spacemaker and the documentation of Revit." |
| **Motif** | Real-time multi-user vector + raster CAD, presence-first UX, version branching. | Full 3D BIM (Motif is 2D-led), IFC, parametric, schedules. | **3D BIM + AI.** Motif is collab CAD; PRYZM is collab BIM. |
| **Revit / ArchiCAD** | 30 years of maturity, vendor ecosystems, structural/MEP coupling. | Web-native, multi-user, AI, openness, plugin SDK in 2026 not 1998. | **Web + collab + AI + open.** This is the real war. PRYZM 2's natural competitor is Revit, not Forma. |

PRYZM's true lane: **the open BIM platform that does what Revit does, on the web, with AI, multi-user, and self-hostable.** Architecture must serve this.

### 2.4 The ten differentiators (D1–D10)

`04-PRODUCTION-PARITY.md` introduced D1–D7. The recount adds three:

| # | Lead-on | Architectural enabler |
|---|---|---|
| **D1** | Same-second collab on geometry (not just text/comments) | L2 events + L3 sync + L4 worker pool. |
| **D2** | AI as a first-class plugin, not bolt-on | L2 events as AI substrate + L6 plugin host with AI permission tier. |
| **D3** | Open self-host story | `docker-compose.yaml` + Helm + storage abstraction. |
| **D4** | Plugin SDK with hot-reload in dev, sandbox in prod | L6 plugin host (dev/prod modes). |
| **D5** | Brutal observability — every command, render, AI call traced | OpenTelemetry across all 8 layers. |
| **D6** | Native multi-view (plan + section + 3D simultaneously synchronized) | L5 multi-pipeline + shared scene committer. |
| **D7** | Headless API for power users | L1–L4 must be browser/Node-shared from day one. |
| **D8 (new)** | **BIM documentation parity with desktop CAD** | Preserve and reframe `core/views` (54 files) + `core/presentation` (29 files). L4 produces 2D edges; L5 has a separate 2D pipeline. |
| **D9 (new)** | **Open IFC round-trip with property sets, BCF issues, ISO 19650 naming** | `plugins/ifc-import` + `plugins/ifc-export` + comments/issues with BCF schema + StructuredName upgraded to a first-class identifier system. |
| **D10 (new)** | **In-editor parametric component authoring** | Preserve and reframe `component-editor/` as a sub-app + plugin. Component definitions become Zod schemas + producers, sharable across projects via the catalog. |

These ten differentiators are the **input requirements** for any architectural choice. If a design decision blocks any of them, the decision is wrong.

### 2.5 What PRYZM 2 will NOT be

Stating the no's is part of the identity. None of these will be true at GA.

1. **Not a Revit clone.** PRYZM is open, web-native, AI-native — Revit is none of these. We will lose feature wars on parametric depth in v1; we win them on collaboration, openness, and AI.
2. **Not a Forma competitor on conceptual design.** Forma's GIS + sun + wind + massing UI is years ahead and not our lane. We integrate, not duplicate.
3. **Not a CAD platform.** Vector + raster + drafting is Motif's lane. We are 3D-BIM-first; 2D plans/sections/elevations are derivatives, not first-class authoring surfaces.
4. **Not a structural analysis tool.** We connect to analysis tools (via IFC); we don't run FEA.
5. **Not a rendering tool.** We have walkthrough + photoreal preview; for marketing renders, customers use V-Ray/Lumion via integration.
6. **Not single-tenant.** Self-host is supported; SaaS multi-tenant is the default deployment.
7. **Not a closed ecosystem.** No Autodesk-style lock-in; everything important is plugin-extensible or API-accessible.

### 2.6 The single sentence

When the team feels lost — at month 6, month 18, month 30 — they should re-read this:

> **PRYZM 2 is what Revit would be if it had been built on the web in 2026, with AI from day one, with collaboration as a primitive, and with an open SDK on every surface.**

Every architectural decision is justified against this sentence, or it's wrong.

---

## 3. The architecture, recalibrated for the real scale

The 7-layer model in `01-TARGET-ARCHITECTURE.md` is correct. The recount changes only the **scope per layer**, not the shape.

### 3.1 Layer scope adjustments

| Layer | What `01` said | What the recount changes |
|---|---|---|
| **L0 Persistence** | Manifest + chunks + event log | Add: BCF round-trip; project branching/versioning; CDE-aware structured naming (`StructuredName.ts` becomes the project identity primitive). |
| **L1 Stores** | "12+ node types" | **27 stores already exist; target is ~50.** Three categories: element stores (walls, slabs, doors, ...), view stores (sheets, schedules, view definitions, visibility intents, phase filters, IFC projection), system stores (hierarchy, template, sync, requirement, decision-record, semantic-graph, spatial-authority). |
| **L2 Commands/Events** | "~80 handlers" | Recount: ~110 handlers. The AI subsystem alone introduces ~15 commands; component editor ~10; sheets/schedules ~15. |
| **L3 Sync** | Yjs + awareness | Awareness must include **which view a user is in** (plan view A, sheet B, schedule C) — not just camera + selection. Critical for collab UX in the documentation pipeline. |
| **L4 Geometry kernel** | Pure 3D producers | **Add: 2D producers** (the existing `EdgeProjectorService`, `PlanViewAnnotationRenderer`, `PocheFillBuilder` machinery) and **table producers** (schedule data). The kernel produces **drawings** as well as meshes. |
| **L5 Render runtime** | Single frame scheduler | **Multi-pipeline**: 3D viewport, plan viewport, section viewport, sheet preview, schedule table, IFC inspector — each its own render target sharing one scheduler and one event source. |
| **L6 Plugin host** | "First-party plugins all migrated" | First-party plugin count is **~25**, not the 5–8 implied earlier. Each element family is a plugin; AI is a plugin; sheets/schedules/plan-view are plugins; IFC import/export are plugins; component editor is a plugin host of its own. |
| **L7 Presentation** | "React app" | **The React migration IS half the project.** PRYZM today is vanilla TS. This is a 12+ month sub-project on its own. |

### 3.2 New layer: L7.5 — AI Operations

The AI subsystem is large enough and architecturally distinct enough to deserve its own layer.

**Why a separate layer?** AI ops have unique requirements: LLM context windows, streaming responses, user approvals before destructive operations, batching of many small commands into a single review-and-apply unit, world-model adapters, voice input, semantic queries.

**Layer responsibilities:**
- LLM orchestration (model selection, context window budget, streaming).
- World-model adapters (`WorldModelAdapter`, `RoomWorldModelAdapter`) — translate domain state → LLM-ingestible context.
- Intent mappers (`VGIntentMapper`, `ViewAuthoringIntentMapper`) — translate LLM output → command sequences.
- Approval flow (`AIApprovalRecord`, `AIApprovalStore`) — every AI-issued command is reviewable.
- Batching (`FloorPlanCommandBatcher`, `FloorPlanBatchExecutor`) — collapse 100s of small AI commands into reviewable units.
- Semantic query (`SemanticQueryEngine`, `QueryEngine`).
- Voice (`VoiceSpatialInterface`).
- Computer vision (`ImagePreprocessor`, `FloorPlanImageEnhancer`, `WallRegionExtractor`, `DoorGapInpainter`, `WallCandidateScorer`).

**Position in the stack:**

```
L7   Presentation        (React + tools + panels)
L7.5 AI Operations       (LLM orchestration + intents + approvals + CV)
L6   Plugin host         (manifest + lifecycle + sandbox)
L5   Render runtime      (multi-pipeline scheduler + committer)
L4   Geometry kernel     (3D producers + 2D producers + table producers)
L3   Sync                (Yjs + awareness + linearisation)
L2   Commands/Events     (handlers + transactions + audit)
L1   Stores              (element, view, system — ~50)
L0   Persistence         (chunks + event log + manifests + BCF + CDE)
```

L7.5 sits between L7 and L6: AI is a *source* of commands (like a tool, like a plugin) but with its own approval flow that the rest of L6 doesn't need. Treating it as a layer keeps the AI surface area visible and bounded.

### 3.3 Repository structure update (vs `05` §3)

`05` listed 9 packages + 4 apps. The recount expands this:

```
pryzm/
├─ packages/
│  ├─ protocol/                # shared types (events, commands, manifests, chunks, BCF)
│  ├─ domain/                  # ~50 stores + reducers + selectors
│  ├─ geometry-kernel/         # 3D + 2D + table producers, pure
│  ├─ render-runtime/          # frame scheduler + scene committer + multi-pipeline
│  ├─ sync/                    # Yjs glue + awareness + linearisation client
│  ├─ persistence-client/      # manifest fetch + chunk fetch + event stream
│  ├─ plugin-host/             # manifest + lifecycle + sandbox
│  ├─ ai-host/                 # NEW: L7.5 LLM orchestration + intents + approvals
│  ├─ ui/                      # shared React primitives
│  ├─ cde/                     # NEW: structured naming + ISO 19650 + BCF
│  ├─ headless/                # NEW: Node-runnable bundle of L1–L4
│  └─ test-utils/              # fixtures + harness
├─ apps/
│  ├─ editor/                  # main editor SPA (React)
│  ├─ viewer/                  # read-only viewer SPA (React, smaller)
│  ├─ component-editor/        # NEW: parametric component authoring sub-app
│  ├─ sync-server/             # Node Express + Socket.io + Yjs WS
│  ├─ bake-worker/             # Node BullMQ worker, geometry baking
│  ├─ ai-worker/               # NEW: Node CV + LLM-batch worker
│  └─ ifc-worker/              # NEW: Node IFC import/export worker (heavy WASM)
├─ plugins/
│  ├─ wall/  slab/  floor/  ceiling/  roof/  column/  beam/
│  ├─ curtain-wall/  stair/  handrail/  grid/  door/  window/  opening/
│  ├─ dimension/  annotation/  room/  structural/  lighting/  plumbing/  furniture/
│  ├─ plan-view/  section-view/  sheet/  schedule/  title-block/  phase-filter/
│  ├─ visibility-intent/       # the 11-wave system, isolated
│  ├─ ifc-import/  ifc-export/  dxf-import/  rhino-import/  glb-export/  pdf-export/
│  ├─ ai-copilot/              # the existing src/ai/* refactored
│  ├─ generative/              # LayoutGenerator + future
│  ├─ catalog/                 # asset catalog + commands
│  ├─ tools-suite/             # selection, marquee, gizmo, section-box, etc.
│  └─ geospatial/              # Cesium site context
├─ tools/  docs/  charts/  .cursor/rules/  .github/workflows/
└─ ...
```

**Plugin count: ~30–35 first-party plugins.** This matches the 30+ subdomain inventory.

`apps/` has **7 apps**, not 4: editor, viewer, component-editor (it's a separate UX), sync-server, bake-worker, ai-worker, ifc-worker. The IFC and AI workers are split out because their dependencies (web-ifc WASM, LLM SDKs, CV libraries) are heavy and version-volatile; isolating them protects the rest.

---

## 4. The truth about the timeline

`02-ORCHESTRATION.md` and `05-IMPLEMENTATION-PLAN.md` both state ~40 calendar weeks. **This was wrong.** The recount makes the real number visible.

| Layer | Realistic effort for the recounted scope |
|---|---|
| L0 + L3 + persistence + sync server + bake worker | 3–4 months |
| L1 (port 27 → ~50 stores) + L2 (264 → ~110 handlers) | 4–6 months |
| L4 (3D producers for 23 element families + 2D producers for plan view + table producers for schedules) | 6–8 months |
| L5 (single scheduler, multi-pipeline, scene committer, render passes) | 3–4 months |
| L6 + L7.5 (plugin host + AI ops layer) | 3 months |
| L7 React migration (the entire UI is vanilla TS today; there are 30 files > 1500 LOC each) | 9–12 months running in parallel |
| Documentation pipeline migration (54 files in `core/views`) | 4–6 months |
| Visibility-Intent migration (29 files in `core/presentation`, 11 waves of accumulated logic) | 3–4 months |
| AI subsystem migration (31 files including CV, intents, approvals, voice) | 3–4 months |
| Component-editor sub-app | 2–3 months |
| Tools migration (18 files including SelectionManager 2141 LOC) | 2–3 months |
| Platform shell + commercial UI React rewrite | 3–4 months |
| Hardening, observability buildout, marketing demo, security review, launch | 3 months |

**Honest total: 30–36 calendar months for a team of 4–8 FTE growing to 10–11 by GA.**

This is the truth. `07-EXECUTION-PLAYBOOK.md` ships against this honest timeline. The 40-week plan in `02` and `05` should be reframed as **"the foundation phase only"** — what gets built in months 1–10. The full 36-month picture lives in `07`.

---

## 5. The single test for every architectural decision

Whenever the team faces a design choice, it must pass this test:

> **Does this decision serve the sentence in §2.6, in a way that is consistent with the recount in §1, while preserving each of D1–D10 in §2.4?**

If yes: ship it.
If no: revisit. Either the decision is wrong, or the identity / differentiator list needs to be amended (and amending requires a Pull Request against this document, reviewed by the lead).

This is the entire architectural review process distilled to one paragraph. It works because the identity is concrete (one sentence), the differentiators are enumerated (D1–D10), and the scale is known (the recount).

---

## 6. Cross-reference

| Want to know… | See |
|---|---|
| The actual numbers behind every claim here | §1 of this doc |
| What PRYZM must become and why | §2 |
| The recalibrated 8-layer architecture | §3 |
| The honest timeline | §4 |
| The deep step-by-step plan | `07-EXECUTION-PLAYBOOK.md` |
| The original 7-layer architecture spec | `01-TARGET-ARCHITECTURE.md` |
| The 45-feature parity matrix | `04-PRODUCTION-PARITY.md` |
| What we copy from Pascal | `03-PASCAL-EDITOR-ANALYSIS.md` |
