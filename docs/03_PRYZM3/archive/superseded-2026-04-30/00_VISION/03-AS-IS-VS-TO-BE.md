# PRYZM — As-Is vs To-Be

This is the definitive layer-by-layer, file-by-file, subsystem-by-subsystem comparison of **PRYZM today (1.x)** against **PRYZM tomorrow (2.0 GA, Month 36)**. It also answers the final unanswered ask in `Context.md`: the **Forma / Qonic / Motif / Pascal competitive read**, As-Is and To-Be — including a frank threat assessment of Pascal, which the user explicitly said "scares me the most".

Companion docs:
- `08-VISION.md` — what we are building and why.
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` — how we get there over 72 two-week sprints.

---

## §1 Method

Every "today" claim is grounded in the exact recount captured in `06-PRYZM-IDENTITY-AND-RECOUNT.md` and the architecture audit in `00-AUDIT.md` and `ARCHITECTURE-PERFORMANCE-AUDIT-2026.md`. Every "tomorrow" claim traces to a layer (L0–L7.5), a principle (P1–P8) or a differentiator (D1–D10) defined in `08-VISION.md`. Where a number changes, the regression bench that enforces it (CI gate) is named.

---

## §2 Layer-by-layer As-Is vs To-Be

### L0 — Persistence

| | As-Is (PRYZM 1) | To-Be (PRYZM 2 GA) |
|---|---|---|
| Save format | One JSON blob, schema v5, 30+ optional sections, `JSON.stringify(snapshot, null, 2)` (`ProjectSerializer.ts:834,845`) | Append-only **MessagePack event log** (one event per command) + per-level **glb chunks** (Draco + Meshopt + KTX2) |
| Save cost | `O(project)` — full re-serialize + POST. ~380 ms for medium project | `O(Δ)` — one event append. **< 10 ms** |
| Load format | One blob over HTTP, parse, `deepStrip`, ordered restore | Manifest + chunk index → **streamed by tier**: visible level chunks first, background levels lazily, history events on demand |
| Load cost | 2.4 s (small) → 30 s+ / OOM (large). Single thread. | **< 800 ms** to first interactive (small), **< 3 s** (large). Worker-parsed. CDN-streamed. |
| Portability | `.json` blob in DB. No file you can email. | **`.pryzm` ZIP** = `manifest.json` + `events/*.evt.bin` + `chunks/*.glb` + `thumbnails/*` + `signatures/`. USDZ/OPC layout. |
| Backup / archival | Whole project blob copy | Event log is the backup. Archive a `.pryzm` ZIP. |
| Versioning | Implicit, breaks silently | `schemaVersion` in manifest, in-place migrations live forever in `packages/file-format/migrations/` |
| Storage backend | Postgres BLOB column | Postgres for events + R2/S3 for chunks. RLS policies on both. |
| Server-side bake | None. Geometry built in browser. | `apps/bake-worker` (BullMQ + `gltf-transform`) re-bakes only the affected chunks per event. |
| CI gate | None | `tests/persistence/no-full-snapshot.test.ts` blocks any `JSON.stringify` of full project state. |

### L1 — Domain Stores

| | As-Is | To-Be |
|---|---|---|
| Number of stores | 27 named stores in `src/core/`, mixed responsibilities, partial CQRS | ~20 narrow stores in `packages/stores/`, each owning one element family or one cross-cutting concern |
| Schema | Hand-rolled TS interfaces, validated nowhere | **Zod schemas in `packages/schemas/`**, with typed IDs (`wall_abc123`), defaults, refinements |
| ID generation | Mixed: `Math.random()`, `Date.now()`, partial `crypto.randomUUID()` | `crypto.randomUUID()` + typed prefix from schema (`WallNode.parse({...})` generates `wall_<ulid>`) |
| Mutation | Direct `store.x = y` plus 264 command classes calling stores | `produceWithPatches` inside command handlers; stores expose `applyPatch(patches)` only |
| Subscriptions | Mixed: events, callbacks, `(window as any)` polling | `store.subscribeDirty((diff) => …)` — single contract |
| Project isolation | `ProjectScopeRegistry` (48 scopes, Apr 2026 fix) | Same registry, plus per-store namespacing under `projects/<id>/` in persistence |
| THREE refs in stores | None (verified clean, `WallStore.ts:23–35`) | None (P1 enforced) |
| CI gate | `npm run check:isolation` | Same + `eslint-plugin-boundaries` blocking THREE imports in `packages/stores/` |

### L2 — Command / Event Bus

| | As-Is | To-Be |
|---|---|---|
| Command count | 264 command classes in `src/commands/` across 30+ subdomains | **~110 handlers** across ~25 plugin packages (after triage: DROP / MERGE / PORT / PLUGIN-LIFT) |
| `affectedStores` adoption | 242 / 264 (92%) declare it | 100% declare it (CI gate). Migration of remaining 22 in Sprint S03. |
| Patch generation | Mixed: `structuredClone` snapshots, manual `produce`, ad-hoc | **Immer `produceWithPatches` mandatory** for every handler; forward + inverse patches stored |
| Undo | Stack of full-state snapshots (memory-heavy, slow restore) | Stack of `{forward[], inverse[]}` patch pairs. Reverse-apply on undo. **< 5 ms** vs current 80 ms. |
| Wire format | Bespoke Socket.io payloads (Contract 30) | **MessagePack-encoded events with ULIDs** — same bytes for undo, persistence, sync, audit, public WS API |
| Audit trail | None | Every event carries `actorId`, `projectId`, `timestamp`, `clientId` — queryable from `event_log` Postgres table |
| Cross-tab safety | Not guaranteed | Yjs document is single source of truth; tabs converge |
| CI gate | None | `tests/commands/affected-stores.test.ts` fails build on any handler without `affectedStores` |

### L3 — Sync (CRDT + awareness)

| | As-Is | To-Be |
|---|---|---|
| Real-time multi-user geometry | None at all (Socket.io broadcast only, last-writer-wins) | **Yjs CRDT** with conflict-free merge of every command |
| Awareness (who's where, what tool) | None | Yjs awareness extended with `activeViewId`, `activeTool`, `selection[]`. PRYZM is the first BIM tool to show *"User A is editing Sheet 3, User B is in plan view at Level 1"* |
| Soft locks | None | Per-element soft lock with TTL; visible in awareness |
| Server | `server.js` Express + Socket.io, 2,230 LOC | `apps/sync-server` — Yjs server, event linearisation, bake enqueue, Postgres-backed for crash recovery |
| Conflict resolution | Last write wins (silent data loss) | CRDT merge for shape data; structured 3-way for parameters; lock-respecting for concurrent edits |
| Reconnect | Not handled cleanly | Yjs auto-resync from offline buffer; events replayed in causal order |
| Latency target | n/a | **< 250 ms p95** for same-second multi-user edit propagation (`apps/bench/sync-latency.ts`) |
| ADR | None | **ADR-002 — CRDT choice (Yjs vs Automerge vs centralised OT)** — required pre-Sprint S01 |

### L4 — Geometry Kernel

| | As-Is | To-Be |
|---|---|---|
| Purity | Coupled to THREE, scene, OBC, DOM. `WallFragmentBuilder` constructor takes `scene: THREE.Scene` (`WallFragmentBuilder.ts:451`) | **Pure**. No THREE imports. No DOM. No React. No `requestAnimationFrame`. CI-enforced (P1). |
| Where it runs | Browser main thread only | Browser web worker **+** Node `worker_thread` **+** `@pryzm/headless` npm package — same bytes |
| Builder shape | `(scene, dto, …) → Group + Mesh + Material attached to scene` | `(dto, joinData, worldY) → BufferGeometryDescriptor` — no scene side-effects |
| WallFragmentBuilder | 2,256 LOC — CSG, miter, edges, hit proxies, materials, plan-symbol invalidation, GPU instancing, intent resolution all inline | Decomposed into 5–6 pure functions in `packages/geometry-kernel/producers/wall.ts`; THREE bits in `plugins/wall/committer.ts` |
| SlabFragmentBuilder | 801 LOC, scene-coupled | `producers/slab.ts` pure + `plugins/slab/committer.ts` |
| RoofFragmentBuilder | Already 80% pure (`RoofGeometryBuilder.generate()`) | `producers/roof.ts` pure |
| CurtainWallBuilder | 1,044 LOC, scene-coupled | `producers/curtain-wall.ts` pure + committer |
| CSG library | three-bvh-csg used inline | three-bvh-csg used by **pure producers** only; no scene refs |
| Server-side bake | Impossible (no headless mode) | `apps/bake-worker` runs the same producers in Node — incremental re-bake on every event |
| Test surface | 0 producer unit tests | Every producer has snapshot tests against `tests/geometry-kernel/__snapshots__/<element>.snap` |

### L5 — Frame Scheduler & Renderer

| | As-Is | To-Be |
|---|---|---|
| `requestAnimationFrame` owners | **58 files** own their own rAF | **One** — `packages/frame-scheduler/FrameScheduler.ts`. CI-enforced (P3). |
| Render mode | Continuous 60 fps even when idle (TRAA / SSGI accumulation runs) | **Demand-driven**: 0 fps idle, 60 fps interaction, 30-frame post-motion budget for accumulation |
| Idle CPU | 18% (continuous render) | **< 2%** (`apps/bench/idle-cpu.ts`) |
| Scheduling | Per-subsystem ad-hoc; no priority | Single rAF; tasks tagged with `reason` and `priority` |
| Renderer ownership | OBC owns renderer in WebGL mode (`RenderPipelineManager.ts:34–35`) | Renderer owned by `packages/renderer/` directly. OBC is one IFC plugin. |
| Post-FX | Suspended during load (workaround) | Post-FX gated by dirty flags; never blocks load |
| TRAA / SSGI | Always-on accumulation; corrupts on frame skip | "Idle continuation" pattern — bounded N frames after motion stops |
| CI gate | None | `eslint-plugin-pryzm-no-raf` — blocks any `requestAnimationFrame(` outside `packages/frame-scheduler/` |

### L6 — Plugin Host

| | As-Is | To-Be |
|---|---|---|
| Plugin model | None. All code is first-party. | **Plugin SDK 1.0** — `packages/plugin-sdk/`, manifest.json, lifecycle, 7 named permissions, sandbox model |
| First-party plugins | n/a | ~30: one per element family + AI + sheets + plan + section + IFC + DXF + Rhino + component-editor + each public AI workflow |
| Sandbox | n/a | Web Worker isolated; postMessage-only host bridge; CSP-restricted |
| Permissions | n/a | `read:project`, `write:project`, `read:user`, `network:fetch`, `register:tool`, `register:panel`, `register:command` |
| Marketplace | n/a | `marketplace.pryzm.com` — published Sprint S64 |
| Hot reload (dev) | n/a | `pryzm dev` reloads plugin in **< 500 ms** (D6) |
| OBC | Permeates 91 import sites in core | Demoted to `plugins/ifc-import/` only — viewer build excludes OBC entirely |
| ADR | n/a | **ADR-009 — Plugin sandbox model** — required pre-Sprint S01 |

### L7 — Presentation (vanilla TS)

| | As-Is | To-Be |
|---|---|---|
| Framework | Vanilla TS, 2 `.tsx` files only (`KEPT`) | **Vanilla TS** — Path A. No React migration. Saves ~10 months and a senior hire. (Per `Context.md` Ask 06.) |
| Top files | `PropertyPanel.ts` 3,339 LOC, `SheetEditorPanel.ts` 2,919 LOC, `PropertyInspector.ts` 2,808 LOC, `initUI.ts` 2,724 LOC, `AnnotationRenderLayer.ts` 2,628 LOC | Decomposed into per-element vanilla classes (~200–400 LOC each) + a `PanelHost` orchestrator (~200 LOC). See §3 below for per-file plan. |
| Cross-module wiring | **2,078 `(window as any)` cast sites in 325 files** | **0** — typed `ServiceRegistry` constructed at boot, passed explicitly. CI-enforced (P6). |
| 11-wave Visibility-Intent UI | Battle-tested, working, vanilla | **Preserved verbatim** — refactored into smaller classes but logic untouched. Visual diff every frame in CI. |
| Component model | Ad-hoc classes, mixed lifecycles | `Panel`, `Toolbar`, `CanvasHost`, `Overlay` — four base classes with consistent `mount/render/unmount/dispose` |
| Scene authoring | Imperative `scene.add()` everywhere | **`SceneCommitter` is the only place THREE objects exist** (P2) |
| Bundle size | 14.2 MB raw / 4.1 MB gzip | **< 6 MB raw / 1.8 MB gzip initial**, lazy chunks for everything else |

### L7.5 — AI Operations

| | As-Is | To-Be |
|---|---|---|
| Surface | 31-file AI subsystem mixed into core (`FloorPlanAIFactory`, `GenerativeDesignAdvisor`, `RoomAIAssistant`, `VoiceSpatialInterface`, `RuleEngine`, `SemanticQueryEngine`, `PdfToBimConstraints`, `DoorGapInpainter`, `WallCandidateScorer`, `WallIntersectionResolver`, …) | **Dedicated layer L7.5**, with `packages/ai-host/` (LLM orchestration) + `apps/ai-worker` (CV pipeline, heavy compute) + `plugins/ai-*` (specific workflows) |
| Approval flow | Direct apply, no review queue | Every AI batch enters an approval queue rendered in the inspector — accept / reject / edit before commit |
| Batching | Mixed | All AI mutations are command batches against L2; can be undone as one |
| Public API | None | `POST /v1/ai/floorplan-import`, `POST /v1/ai/query`, `POST /v1/ai/generate`, `POST /v1/ai/validate` at `api.pryzm.com` |
| Voice | Client-only | `VoiceSpatialInterface` becomes a plugin against the same approval flow |
| Generative | Mixed in core | `plugins/ai-generative/` with constraint DSL |
| Boot impact | Loaded eagerly | **Lazy** — AI host loaded only on first AI invocation (zero AI overhead on cold load) |

---

## §3 The 30 worst files — As-Is → To-Be transformation

Sourced from `06-PRYZM-IDENTITY-AND-RECOUNT.md` §7 and verified against current LOC. Top 30 = ~62,000 LOC = ~16% of the codebase. Each file gets an explicit target.

| # | File (As-Is) | LOC | Target (To-Be) | Sprint |
|---|---|---|---|---|
| 1 | `PropertyPanel.ts` | 3,339 | `packages/ui/PanelHost.ts` (~200) + `plugins/<elem>/inspector/Panel.ts` (~250 each, 12 elements) | S55–S60 |
| 2 | `SheetEditorPanel.ts` | 2,919 | `plugins/sheets/SheetEditorHost.ts` + `plugins/sheets/widgets/*.ts` (10 widgets, ~250 each) | S37–S42 |
| 3 | `PropertyInspector.ts` | 2,808 | `packages/ui/InspectorHost.ts` + per-plugin inspector contributions | S55–S60 |
| 4 | `initUI.ts` | 2,724 | DELETED. Replaced by `apps/editor/src/bootstrap.ts` (composition root) + per-panel mount in plugin manifests | S20 (split) → S62 (delete) |
| 5 | `AnnotationRenderLayer.ts` | 2,628 | `plugins/annotations/renderer.ts` + `packages/scene-committer/annotations.ts` | S31–S34 |
| 6 | `PlanViewAnnotationRenderer.ts` | 2,589 | `plugins/plan-view/annotation-renderer.ts` (pure parts) + `committer.ts` | S29–S33 |
| 7 | `WallFragmentBuilder.ts` | 2,256 | `packages/geometry-kernel/producers/wall.ts` (pure) + `plugins/wall/committer.ts` | S07–S10 |
| 8 | `EngineBootstrap.ts` | 2,086 | DELETED. Replaced by `apps/editor/src/bootstrap.ts` orchestrating layer init | S20 (split) → S61 (delete) |
| 9 | `ProjectSerializer.ts` | 1,894 | DELETED. Replaced by `packages/persistence-client/` + `packages/file-format/` | S04–S08 (replace) → S61 (delete) |
| 10 | `EdgeProjectorService.ts` | 1,867 | `packages/geometry-kernel/edge-projection.ts` (pure) + `plugins/plan-view/edges.ts` | S29–S31 |
| 11 | `PlanViewCanvas.ts` | 2,150 | `plugins/plan-view/canvas-host.ts` (vanilla `CanvasHost` subclass) + dirty-flag rendering | S29–S33 |
| 12 | `ImportProjectCommand.ts` | 1,720 | DELETED. Tier-streamed loader in `packages/persistence-client/loader.ts` | S05–S08 (replace) → S61 (delete) |
| 13 | `CurtainWallBuilder.ts` | 1,044 | `packages/geometry-kernel/producers/curtain-wall.ts` + `plugins/curtain-wall/committer.ts` | S13–S15 |
| 14 | `SlabFragmentBuilder.ts` | 801 | `producers/slab.ts` + `plugins/slab/committer.ts` | S09–S10 |
| 15 | `RoofFragmentBuilder.ts` | ~750 | `producers/roof.ts` (mostly already pure) + `plugins/roof/committer.ts` | S11–S12 |
| 16 | `CommandManager.ts` | ~700 | `packages/command-bus/` with handler registry + Immer + audit emitter | S05–S06 |
| 17 | `RenderPipelineManager.ts` | ~680 | `packages/renderer/RenderPipelineManager.ts` driven by frame scheduler dirty flags | S15–S17 |
| 18 | `UnifiedFrameLoop.ts` | 402 | `packages/frame-scheduler/FrameScheduler.ts` (replaces, simpler API) | S03 |
| 19 | `ViewController.ts` | ~650 | `packages/view-state/ViewController.ts` (no OBC import) | S25–S27 |
| 20 | `PlanViewService.ts` | ~620 | `plugins/plan-view/service.ts` | S29–S33 |
| 21 | `PlanViewManager.ts` | ~580 | `plugins/plan-view/manager.ts` | S29–S33 |
| 22 | `SectionViewService.ts` | ~520 | `plugins/section-view/service.ts` | S35–S36 |
| 23 | `SheetStore.ts` | ~480 | `packages/stores/SheetStore.ts` (Zod-validated) + `plugins/sheets/` | S37–S39 |
| 24 | `ScheduleStore.ts` | ~460 | `packages/stores/ScheduleStore.ts` + `plugins/schedules/` | S40–S42 |
| 25 | `TitleBlockStore.ts` | ~420 | `packages/stores/TitleBlockStore.ts` + `plugins/sheets/title-block.ts` | S38 |
| 26 | `PocheFillBuilder.ts` | ~400 | `packages/geometry-kernel/poche.ts` (pure) | S30 |
| 27 | `WallPerfBench.ts` | ~380 | `apps/bench/wall-perf.ts` (formal CI bench) | S03 |
| 28 | `BatchCoordinator.ts` | ~360 | DELETED — its rAF logic absorbed into `FrameScheduler` | S03 |
| 29 | `DrawingPipelineOrchestrator.ts` | ~340 | `packages/drawing/Orchestrator.ts` (no rAF) | S05 |
| 30 | `EnhancedBloomService.ts` | ~320 | `packages/renderer/passes/bloom.ts` (driven by scheduler) | S15 |

Net effect: **62K LOC → ~24K LOC across ~120 small files**, each < 400 LOC, each in a clear layer.

---

## §4 The 264 commands consolidation

| Subdomain | Commands today | Triage outcome | Target package | Sprint |
|---|---:|---|---|---|
| Walls | 28 | DROP 4 (dead), MERGE 6, PORT 14, LIFT 4 | `plugins/wall/handlers/` | S07–S10 |
| Slabs | 19 | DROP 2, MERGE 4, PORT 11, LIFT 2 | `plugins/slab/handlers/` | S09–S10 |
| Doors | 14 | MERGE 3, PORT 11 | `plugins/door/handlers/` | S11 |
| Windows | 13 | MERGE 2, PORT 11 | `plugins/window/handlers/` | S11 |
| Openings | 9 | MERGE 2, PORT 7 | shared in `plugins/wall/` & `plugins/slab/` | S08 |
| Grids | 11 | DROP 1, PORT 10 | `plugins/grids/handlers/` | S12 |
| Columns | 8 | PORT 8 | `plugins/columns/handlers/` | S12 |
| Beams | 7 | PORT 7 | `plugins/beams/handlers/` | S13 |
| Roofs | 12 | MERGE 3, PORT 9 | `plugins/roof/handlers/` | S11–S12 |
| Curtain Walls | 14 | DROP 2, MERGE 3, PORT 9 | `plugins/curtain-wall/handlers/` | S13–S14 |
| Stairs | 9 | MERGE 2, PORT 7 | `plugins/stairs/handlers/` | S14 |
| Handrails | 6 | PORT 6 | `plugins/handrails/handlers/` | S14 |
| Ceilings | 6 | PORT 6 | `plugins/ceilings/handlers/` | S14 |
| Rooms | 11 | MERGE 3, PORT 8 | `plugins/rooms/handlers/` | S25 |
| Dimensions | 8 | MERGE 2, PORT 6 | `plugins/dimensions/handlers/` | S31 |
| Annotations | 14 | DROP 2, MERGE 4, PORT 8 | `plugins/annotations/handlers/` | S31–S32 |
| Structural | 7 | PORT 7 | `plugins/structural/handlers/` | S26 |
| Lighting | 5 | PORT 5 | `plugins/lighting/handlers/` | S26 |
| Plumbing | 4 | PORT 4 | `plugins/plumbing/handlers/` | S26 |
| Furniture | 12 | DROP 2, MERGE 3, PORT 7 | `plugins/furniture/handlers/` | S27 |
| Sheets | 14 | MERGE 3, PORT 11 | `plugins/sheets/handlers/` | S37–S39 |
| Schedules | 8 | MERGE 2, PORT 6 | `plugins/schedules/handlers/` | S41–S42 |
| Plan view | 12 | MERGE 4, PORT 8 | `plugins/plan-view/handlers/` | S29–S33 |
| Section view | 6 | PORT 6 | `plugins/section-view/handlers/` | S35–S36 |
| Visibility-Intent | 9 | PORT 9 (verbatim) | `plugins/visibility-intent/handlers/` | S43–S46 |
| Generative / AI commands | 18 | LIFT 18 to L7.5 | `plugins/ai-generative/`, `plugins/ai-floorplan/`, `plugins/ai-rules/` | S47–S52 |
| IFC | 9 | LIFT 9 | `plugins/ifc-import/`, `plugins/ifc-export/` | S55–S57 |
| DXF | 4 | LIFT 4 | `plugins/dxf/` | S57 |
| Rhino | 3 | LIFT 3 | `plugins/rhino/` | S57 |
| VG (Visibility Graphics) | 4 | MERGE 1, PORT 3 | folded into `plugins/visibility-intent/` | S46 |
| Geospatial | 3 | PORT 3 | `plugins/geospatial/` | S58 |
| Monetization (Stripe) | 8 | KEEP in `apps/api-gateway/billing/` | stays vanilla | S60 |
| Portfolio / Project hub | 6 | PORT 6 | `apps/editor/src/projects/` | S35 |
| CDE | 3 | PORT 3 | folded into `apps/sync-server/` | S22 |
| **Total** | **264** | **DROP 13 / MERGE 47 / PORT 169 / LIFT 35** | **~110 handlers across ~25 plugins** | — |

---

## §5 The 2,078 `(window as any)` deletion plan

| Pattern | Sites | Replacement |
|---|---:|---|
| `(window as any).<service>` (cross-module access) | ~1,400 | Typed `ServiceRegistry.get(Symbol)` injected at boot |
| `(window as any).<store>` (store access) | ~340 | `useStore(StoreId)` from `packages/stores/` |
| `(window as any).<builder>` / `<command>` | ~180 | `commandBus.execute({type, payload})` |
| `(window as any).debug*` / `dev*` | ~110 | `import.meta.env.DEV ? import('./devtools') : noop` |
| Genuine window globals (legacy export) | ~48 | Confined to `legacy/window-shim.ts` until S61, then deleted |

**Per-sprint deletion target**: ~30 sites/sprint average across S03–S60. CI gate: file-count-of-violations is monotonic-non-increasing per sprint; PR that increases the count is blocked.

---

## §6 The 58 `requestAnimationFrame` owners — consolidation

| Owner type | Count | Action |
|---|---:|---|
| Engine init subsystems (`init*.ts`) | 6 | Folded into `bootstrap.ts` startup; no rAF |
| Builders (Slab, CurtainWall, Wall) | 3 | Removed — geometry produced once per command, not per frame |
| Plan-view & SVP renderers | 4 | Routed through `FrameScheduler.requestFrame('plan-view-dirty')` |
| Diagnostic / debug | 3 | Folded into devtools, no production rAF |
| Performance benches | 2 | Replaced by `apps/bench/*` formal benches |
| Render pipeline / post-FX | 8 | Replaced by single scheduler-driven render loop |
| AI / streaming | 5 | Removed — push-driven via event log, not polled |
| Misc (cursor, hover, drag, marquee) | 27 | Routed through scheduler with `reason: 'interaction'` |
| **Total** | **58** | **→ 1 (FrameScheduler)** |

---

## §7 The 91 OBC import sites — demotion plan

| Site type | Count | Disposition |
|---|---:|---|
| Renderer ownership (`OBC.View`, `OBC.Renderer`) | 4 | DELETED — replaced by `packages/renderer/` |
| FragmentsManager (geometry storage) | 14 | DELETED — replaced by Scene Registry |
| IFC loader / parser | 12 | KEPT, isolated into `plugins/ifc-import/` |
| Camera controls | 7 | DELETED — replaced by vanilla `CameraController` |
| Picker / raycaster | 9 | DELETED — replaced by `packages/picking/` |
| Misc utilities | 45 | Audited per-site: 30 deleted, 15 KEPT in `plugins/ifc-*` only |
| **Total** | **91** | **→ ~25 in `plugins/ifc-*` only** |

Viewer build (`apps/viewer-only`) excludes OBC entirely — saves ~3.4 MB chunk.

---

## §8 Competitive matrix — Forma / Qonic / Motif / Pascal — As-Is and To-Be (the FINAL UNANSWERED ASK)

This is the section the user explicitly requested. Three reads: (a) where each competitor is today, (b) where PRYZM is today, (c) where PRYZM 2 will be at GA. Pascal gets a separate threat section in §9 because the user singled it out.

### §8.1 Headline scoring (50 capabilities)

Symbols: ● = first-class, ◑ = partial / weak, ○ = absent.

| # | Capability | Forma | Qonic | Motif | Pascal | **PRYZM 1** | **PRYZM 2 GA** |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **— Performance & runtime —** | | | | | | | |
| 1 | Cold load < 1 s for medium project | ● | ● | n/a | ◑ | ○ | ● |
| 2 | Server-baked geometry chunks | ● | ● | n/a | ○ | ○ | ● |
| 3 | Demand-driven render (0 fps idle) | ● | ● | n/a | ● | ○ | ● |
| 4 | Worker-based geometry build | ● | ● | n/a | ◑ | ○ | ● |
| 5 | Tier-streamed load (visible level first) | ● | ● | n/a | ○ | ○ | ● |
| 6 | Δ-save (event append) | ● | ● | n/a | ○ | ○ | ● |
| 7 | Patch-based undo | ● | ● | n/a | ◑ (Zundo) | ◑ | ● |
| 8 | WebGPU rendering | ◑ | ● | n/a | ● | ◑ | ● |
| **— Collaboration —** | | | | | | | |
| 9 | Real-time multi-user geometry | ◑ | ● | ○ (text only) | ○ | ○ | **● ★** |
| 10 | Awareness (cursors, selection, view) | ● | ● | ● | ○ | ◑ | **● ★** |
| 11 | Soft locks / per-element locking | ◑ | ● | ○ | ○ | ○ | ● |
| 12 | Conflict-free merge (CRDT) | ◑ | ● | n/a | ○ | ○ | ● |
| 13 | Offline edit + resync | ○ | ◑ | ○ | ○ | ○ | ● |
| 14 | Comments / BCF issues | ● | ● | ● | ○ | ◑ | ● |
| **— Documentation pipeline —** | | | | | | | |
| 15 | Plan view | ● | ● | ○ | ○ | ● | ● |
| 16 | Section view | ● | ● | ○ | ○ | ◑ | ● |
| 17 | Sheet layout (titleblocks, viewports) | ● | ◑ | ○ | ○ | ● | ● |
| 18 | Schedules / quantities | ● | ● | ○ | ○ | ● | ● |
| 19 | View definitions / visibility graphics | ● | ◑ | ○ | ○ | ● (11-wave) | ● |
| 20 | PDF export with title blocks | ● | ● | ○ | ○ | ● | ● |
| 21 | Multi-view sync (plan ↔ 3D) | ● | ● | ○ | ○ | ● | ● |
| **— BIM data model —** | | | | | | | |
| 22 | IFC import | ● | ● | ○ | ○ | ● | ● |
| 23 | IFC export with property sets | ● | ● | ○ | ○ | ● | ● |
| 24 | BCF issue round-trip | ● | ● | ◑ | ○ | ○ | ● |
| 25 | ISO 19650 naming compliance | ● | ◑ | ○ | ○ | ○ | ● |
| 26 | Property sets / Pset templates | ● | ● | ○ | ○ | ◑ | ● |
| 27 | Element classification (Uniclass / OmniClass) | ● | ● | ○ | ○ | ◑ | ● |
| **— AI —** | | | | | | | |
| 28 | AI as first-class layer | ○ | ○ | ○ | ○ | ◑ | **● ★** |
| 29 | Floor-plan-from-PDF import (CV) | ○ | ○ | ○ | ○ | ● | ● |
| 30 | Generative design / constraints | ○ | ○ | ○ | ○ | ● | ● |
| 31 | Semantic NL query | ○ | ○ | ○ | ○ | ● | ● |
| 32 | Voice spatial interface | ○ | ○ | ○ | ○ | ● | ● |
| 33 | AI rule engine / code compliance | ◑ | ○ | ○ | ○ | ● | ● |
| 34 | Public AI API for third parties | ○ | ○ | ○ | ○ | ○ | **● ★** |
| **— Extensibility —** | | | | | | | |
| 35 | Plugin SDK with sandbox | ◑ | ○ | ○ | ○ | ○ | **● ★** |
| 36 | Plugin marketplace | ◑ | ○ | ○ | ○ | ○ | ● |
| 37 | Hot-reload plugin DX | ○ | ○ | ○ | ○ | ○ | **● ★** |
| 38 | Public REST API | ◑ | ◑ | ◑ | ○ | ○ | ● |
| 39 | Public WebSocket / event-stream API | ○ | ◑ | ○ | ○ | ○ | **● ★** |
| 40 | Headless (Node) library | ○ | ○ | ○ | ○ | ○ | **● ★** |
| 41 | Webhooks | ◑ | ◑ | ○ | ○ | ○ | ● |
| **— Openness & deployment —** | | | | | | | |
| 42 | Open self-host (single-binary / docker-compose) | ○ | ○ | ○ | ● | ○ | **● ★** |
| 43 | Source open (full or partial) | ○ | ○ | ○ | ● | ○ | ◑ (SDK + plugins open) |
| 44 | Portable file format (single-file export) | ○ (bundles) | ◑ | ○ | ◑ (IndexedDB) | ◑ (.json) | **● (`.pryzm` ZIP)** |
| 45 | OAuth2 / SSO | ● | ● | ● | ○ | ◑ | ● |
| **— Authoring depth —** | | | | | | | |
| 46 | Parametric component editor (Family Editor) | ○ | ○ | ○ | ○ | ● | ● |
| 47 | Curtain walls | ● | ● | ○ | ○ | ● | ● |
| 48 | Stairs / handrails | ● | ◑ | ○ | ○ | ● | ● |
| 49 | MEP (lighting/plumbing primitives) | ● | ○ | ○ | ○ | ● | ● |
| 50 | DXF / Rhino import | ● | ◑ | ○ | ○ | ● | ● |

★ = PRYZM 2 leads-on (no competitor has it).

### §8.2 Score totals

| | ● | ◑ | ○ | Score (●=2, ◑=1, ○=0) |
|---|--:|--:|--:|--:|
| Forma | 32 | 9 | 9 | **73 / 100** |
| Qonic | 28 | 11 | 11 | **67 / 100** |
| Motif | 6 | 4 | 40 | **16 / 100** |
| Pascal | 6 | 3 | 41 | **15 / 100** |
| **PRYZM 1** | **17** | **11** | **22** | **45 / 100** |
| **PRYZM 2 GA** | **48** | **2** | **0** | **98 / 100** |

PRYZM 2 GA outscores Forma (the highest-scoring incumbent) by **+25 points** because: (a) PRYZM 1 already leads on AI + docs + family editor (D2/D8/D10), (b) PRYZM 2 adds first-class geometry collab (D1), open self-host (D3), plugin SDK + marketplace (D4), headless API (D7), portable format (.pryzm), and observability (D5) that no incumbent ships.

### §8.3 Where PRYZM 2 beats each competitor — the elevator pitch

- **vs Forma**: Open (Forma is cloud-locked, Autodesk-owned), self-hostable, headless API, plugin SDK with marketplace, AI as architectural layer not bolt-on, portable `.pryzm` file, deeper documentation pipeline.
- **vs Qonic**: AI moat (Qonic has none), documentation pipeline (Qonic has weak sheet layout, no schedules), open self-host, plugin marketplace, portable file format, parametric component editor.
- **vs Motif**: Everything except text-comment polish. Motif is a comments-and-markup tool; PRYZM 2 is a full BIM authoring platform with Motif's collab strengths plus geometry collab on top.
- **vs Pascal**: See §9 — separate threat assessment.

---

## §9 Pascal threat assessment ("Pascal scares me the most")

The user explicitly named Pascal as the most threatening competitor. This is the honest read of why Pascal is scary, where it stops short, and what we must do to ensure PRYZM 2 dominates the slot Pascal occupies.

### §9.1 Why Pascal is genuinely scary

1. **Open source, MIT, free.** Anyone can download, fork, self-host, build a product on top. PRYZM has to compete with $0.
2. **Architectural cleanliness.** Pascal's wall system is **603 LOC** for the same functionality PRYZM 1's `WallFragmentBuilder` is 2,256 LOC. Pascal has the architecture today that we are trying to build. We are not racing them on quality of code per file — they are ahead.
3. **Modern stack.** Next.js 16, React 19, R3F, Three.js, Zustand, Turborepo, WebGPU. The defaults the JS/TS hiring pool already knows.
4. **Velocity.** v0.6.0 released last week, ~14 community contributors per release, packages on npm, momentum.
5. **The brand "open BIM".** Pascal owns the slot. If a customer types "open source BIM" into a search engine, they find Pascal. Repositioning from this is harder than it sounds.

### §9.2 Where Pascal stops short — the gaps we exploit

Pascal stops exactly where Forma/Qonic begin. Reading their roadmap, issues, and Discord (last refreshed 2026-04), Pascal currently has:

| Gap | Pascal status | PRYZM 2 |
|---|---|---|
| Multi-user collab (geometry) | None — single-user, IndexedDB blob | First-class (D1) |
| Server-side bake | None — all geometry built client-side | `apps/bake-worker` (L0) |
| Chunked binary persistence | None — one IndexedDB blob | glb chunks + event log (L0) |
| IFC round-trip | None | `plugins/ifc-*` (D9) |
| Documentation pipeline (sheet/schedule) | None | Existing strength preserved (D8) |
| Plan view + section view | None | Existing strength preserved (D8) |
| AI subsystem | None — zero AI | 31-file existing moat → L7.5 (D2) |
| Plugin SDK | None — tools statically registered | SDK 1.0 + marketplace (D4) |
| Public REST / WS / headless API | None | (D7, D1) |
| Audit trail / per-element permissions | None | Postgres event log + RLS |
| Self-host packaging | The repo IS the self-host (no easier path) | docker-compose-up + single-binary |
| Component editor / family editor | None | Existing strength preserved (D10) |
| Curtain walls, stairs, handrails, MEP | None or stubs | Existing strength preserved |
| Browser-matrix support / Safari / mobile review | Chrome-only experimental | Cross-browser CI (Sprint S65) |
| Enterprise SSO / RLS / observability | None | First-class (D5) |
| Stripe billing / monetization | None | Already wired, kept |

**Net read**: Pascal is *the wall and slab and door modeller you wanted in 2024 if you were OK with single-user and no docs*. PRYZM 2 is *the platform you want in 2027 if you are running an actual practice*. They do not compete on the same axis once PRYZM 2 ships D1, D8, D9, D10.

### §9.3 Pascal as a moat, not a threat — the strategic reframe

Three moves turn Pascal from a threat into a tailwind:

1. **Borrow without forking.** Pascal Strategy B (confirmed) — adopt the patterns (three-store split, scene registry, dirty-flag, `.cursor/rules/*.mdc`), the Zod schemas with typed IDs, the viewer-isolation rule, the tools-only-mutate-store rule. We get Pascal's architectural cleanliness in PRYZM's repo, with PRYZM's existing capabilities. Pascal has done the hard work of validating the patterns; we copy the result.
2. **Out-document them.** PRYZM 2's plugin SDK docs site, the `.pryzm` file format spec, the public REST/WS/headless API OpenAPI, the architecture docs (this set) — published. Pascal's docs are a `README.md`. We become the canonical reference architecture for "open BIM on the web" — which is the slot Pascal currently occupies by default.
3. **Marketplace ecosystem.** Pascal has no plugin model. By Sprint S64 PRYZM 2 has a marketplace with revenue share. Third-party developers prefer the platform that pays them. This compounds.

### §9.4 The Pascal-specific risks to watch

- **R-Pascal-1**: Pascal ships a multi-user mode in 2027 before our Sprint S22. Mitigation: front-load multi-user (Phase 2A is the bake worker; Phase 2B is sync). Don't push to year 3.
- **R-Pascal-2**: Pascal's React-first DX makes it the default teaching platform for BIM-on-web courses. Mitigation: PRYZM Plugin SDK docs and `pryzm dev` hot-reload (D6) target the same audience; Sprint S62 publishes the dev guide.
- **R-Pascal-3**: A Pascal fork with bake + IFC pops up. Mitigation: marketplace + AI moat + docs pipeline — these are 18+ month builds the fork won't catch up on. Also: PRYZM 2 SDK is open enough that the fork could *become* a PRYZM plugin host, turning a competitor into a customer.

### §9.5 The honest summary

> *Pascal is scary because it is what PRYZM 1's architecture wishes it were. PRYZM 2 outscopes Pascal by 4× — collab, bake, docs, AI, plugins, IFC, components, headless. The risk is not "Pascal is better" — it is "Pascal is the brand for open BIM and we have to reframe that". The 36-month plan in `10-MASTER-IMPLEMENTATION-PLAN-36M.md` does this with: borrow the patterns (free Pascal R&D), out-document them (claim the reference-architecture slot), out-extend them (marketplace + plugins + AI). Pascal stops being a threat the moment a Pascal user opens PRYZM 2 and sees: their model, in the browser, multi-user, with an IFC import, with a sheet and a schedule, with their own plugin loaded. That demo is Sprint S52 (month 26).*

---

## §10 Net summary — the one-screen view

| Dimension | PRYZM 1 (today) | Forma | Pascal | **PRYZM 2 (M36)** |
|---|---|---|---|---|
| Architecture layers | 2, fused | n/a | 4 (clean but small) | **8 enforced (L0–L7.5)** |
| LOC profile | 390K, 1,300 files, 2,078 hidden globals | n/a | ~50K, ~250 files, clean | ~280K, ~1,000 files, **0 globals**, every layer Zod-typed |
| Cold load (medium) | 8.7 s | <1 s | ~3 s | **<1.5 s** |
| Save | 380 ms full | <50 ms event | ~200 ms | **<10 ms event** |
| Multi-user | None | Partial | None | **Full geometry CRDT** |
| Plugin SDK | None | Shallow | None | **SDK 1.0 + marketplace** |
| AI | 31 files, mixed in | None | None | **L7.5 + public API** |
| Docs (plan/sheet/schedule) | Yes, deep | Yes | None | **Yes, ported clean** |
| Self-host | None | None | Yes (DIY) | **Yes (`docker-compose up`)** |
| Portable file | `.json` blob | None (cloud only) | IndexedDB | **`.pryzm` ZIP, spec'd** |
| Public API | None | Partial REST | None | **REST + WS + headless + AI** |
| IFC round-trip | Yes | Yes | None | **Yes, plugin** |
| Observability | Console logs | Internal | None | **OTel everywhere** |
| Hiring framework moat | High (vanilla TS) | n/a | Low (React) | **Vanilla TS, but with SDK so plugin authors use whatever** |

The bet, in one line: **PRYZM 2 = the union of PRYZM 1's existing moats (AI, docs, family editor, IFC) + everything Pascal does well + everything Forma does well + the things none of them do (open SDK, headless, portable format, observability)** — shipped over 36 months, by one founder + Replit Agent, with feature freeze on PRYZM 1 to make the engineering tractable.

---

*Last updated: 2026-04-26. Owner: Architecture lead. This document is the canonical reference for any "where are we vs them" conversation.*
