# PRYZM 2 — Master Implementation Plan (36 Months)

This is the **definitive 36-month execution plan** for the rebuild defined in `08-VISION.md` and `09-AS-IS-VS-TO-BE.md`. It is calibrated to the confirmed parameters:

- **Path A** — vanilla TypeScript everywhere (no React migration). Saves the 10-month React rewrite, preserves the 11-wave Visibility-Intent UI.
- **Solo founder + Replit Agent** as the engineering team. No FTE hires. Single track of work.
- **All 10 differentiators (D1–D10)** in scope. No cuts.
- **Feature freeze on PRYZM 1.** Critical bug fixes only. All engineering effort on PRYZM 2.
- **Four binding additions**: `.pryzm` portable ZIP file format, public REST + WS + headless + AI APIs at `api.pryzm.com`, on-premise self-host as a GA requirement, Pascal Strategy B (adopt patterns, no fork).
- **Strangler-fig migration** — never a 10,000-line "v2 branch" merge. PRYZM 1 ships at every step; PRYZM 2 grows alongside behind feature flags.

**Cadence**: 72 two-week sprints (S01–S72) across 36 calendar months, organised into **3 phases** of 12 months each, each phase split into **4 quarterly sub-phases** of 3 months / 6 sprints.

---

## §1 Plan overview at a glance

```
M0   Pre-flight        12 ADRs, scaffolding, baseline benches, CI gates
─────────────────────────────────────────────────────────────────────────
M1–M12   PHASE 1 — FOUNDATION                              Sprints S01–S24
   1A (M1–M3)   Skeleton, persistence, command bus, scheduler
   1B (M4–M6)   Geometry kernel + first plugin (Wall) end-to-end
   1C (M7–M9)   Slabs, Doors, Windows, Openings, Roofs, Curtain Walls
   1D (M10–M12) Bake worker, .pryzm format v1, internal alpha demo
                                                           GATE: M12 alpha
─────────────────────────────────────────────────────────────────────────
M13–M24  PHASE 2 — MIGRATION & MULTI-USER                  Sprints S25–S48
   2A (M13–M15) Stairs, Handrails, Ceilings, Rooms, Structural, MEP, Furniture
   2B (M16–M18) Plan view (the single highest-risk sub-project)
   2C (M19–M21) Section view, Sheets, Schedules, Title blocks
   2D (M22–M24) Sync server (Yjs + awareness), soft locks, beta launch
                                                           GATE: M24 beta
─────────────────────────────────────────────────────────────────────────
M25–M36  PHASE 3 — COMPLETION, HARDENING, GA               Sprints S49–S72
   3A (M25–M27) Visibility-Intent migration, AI subsystem to L7.5
   3B (M28–M30) IFC plugins, DXF, Rhino, Component editor migration
   3C (M31–M33) Plugin SDK 1.0, marketplace, public APIs (REST/WS/headless/AI)
   3D (M34–M36) Hardening: legacy deletion, security, perf, browser matrix, GA
                                                           GATE: M36 GA
```

**Hard gates** (a gate that fails delays GA): M12 alpha demo, M24 beta launch, M36 GA. Each gate has explicit exit criteria (§13).

---

## §2 The solo execution model

The classical playbook in `07-EXECUTION-PLAYBOOK.md` assumes 4 → 11 FTE. This plan replaces that assumption with **1 human + Replit Agent**. The structural implications:

### §2.1 What the human does

- All ADR decisions and architectural taste calls.
- All PR review of code the agent writes.
- All product / UX / customer / strategic decisions.
- Every kill-switch decision.
- Hands-on coding for the parts the agent cannot reliably do alone: novel CRDT integration logic, perf tuning across multi-process boundaries, unprincipled debugging of WebGPU shader bugs.
- Daily 30-minute check on yesterday's agent work; weekly 2-hour deep-review on the sprint deliverables.

### §2.2 What the Replit Agent does

- All scaffolding (monorepo init, package skeletons, ESLint configs, CI YAML).
- All mechanical migration: codemods, find-replace-with-validation, AST transforms (e.g. moving 2,078 `(window as any)` → typed registry sites in batches).
- All test generation against agreed snapshot fixtures.
- All boilerplate handler authoring once the pattern is set by the human in one canonical example.
- Documentation upkeep — every shipped sprint generates a doc-update PR.
- Bench harness maintenance and bench result pasting into sprint exit reports.
- All file-format `pack` / `unpack`, all OpenAPI generation from Zod, all per-plugin manifest scaffolding.

### §2.3 What this does to the calendar

Solo + Agent ≈ ~1.5–2× the velocity of a single human, because the agent absorbs the mechanical 60% of every sprint. It does **not** equal the original 4-FTE assumption, which is why we keep the **36-month** envelope (not the 22-26-month minimum for Path A with a real team).

The buffer that 36-month-vs-26-month gives us is spent on:

- Per-sprint risk margin (one extra week absorbed in every sub-phase for unknown bugs).
- Plan view sub-project overrun (Sub-phase 2B has the highest risk; budget a full extra 2 weeks).
- Customer support drag (even with feature freeze, paying users file bugs).
- Weeks of life: holidays, illness, burnout recovery, market events.

### §2.4 Sprint rhythm

- **Day 1 (Mon week 1)** — Sprint plan written by human, agent expands into per-task issues.
- **Days 2–9** — Agent does the bulk; human reviews PRs daily.
- **Day 10 (Wed week 2)** — Sprint demo (recorded, even for solo — discipline of presenting forces honest assessment).
- **Day 10 (Wed PM)** — Sprint retro: what slipped, what to absorb, what to defer.
- **Day 11–14 (Thu–Sun week 2)** — Buffer / strategic work / customer / docs.

### §2.5 Forbidden compromises

The solo-mode plan is **structurally the same** as the team-mode plan. We do not skip ADRs because "I'm only one person". We do not skip CI gates because "no one else will touch this code". We do not skip OTel instrumentation because "I'll add it later". The discipline of the architecture (P1–P8 in `08-VISION.md`) is the entire reason this is achievable in 36 months. Cutting discipline to "go faster" rebuilds PRYZM 1 a second time — which is precisely the failure mode this plan exists to avoid.

---

## §3 Pre-flight — Month 0 (4 weeks before Sprint S01)

Before a single line of PRYZM 2 production code is written, **12 ADRs are merged**, the **CI baseline is captured**, and the **monorepo scaffolds compile and pass an empty test**. If any of these is incomplete, **S01 does not start**.

### §3.1 The 12 ADRs (must be merged in `docs/03_PRYZM3/reference/adrs/`)

| ADR | Decision | Default (per Context.md) | Spike required? |
|-----|---|---|:---:|
| ADR-001 | Pascal adoption strategy | **B** — adopt patterns + rules, no fork | No |
| ADR-002 | CRDT choice | **Yjs** (over Automerge / centralised OT) | **1-week prototype** |
| ADR-003 | Object storage backend | **Cloudflare R2** (cheapest egress) | No |
| ADR-004 | Wire format | **MessagePack** (over JSON / Protobuf / FlatBuffers) | No |
| ADR-005 | Worker pool policy | **Browser**: Web Worker per task, max 4 concurrent. **Server**: BullMQ + Node `worker_threads`, R2-backed durable queue. | No |
| ADR-006 | Default render mode | **WebGPU when available, WebGL2 fallback**. Visual diff CI gate enforces parity. | **3-day spike** |
| ADR-007 | Telemetry backend | **OTel SDK + self-hostable Tempo + Honeycomb dev account** | No |
| ADR-008 | IFC scope | Read+write Pset round-trip; defer IFC4.3 advanced for post-GA | No |
| ADR-009 | Plugin sandbox model | **Web Worker isolation + postMessage bridge + CSP** | **5-day spike** |
| ADR-010 | Bake debounce policy | Per-element edit triggers per-chunk re-bake; 250 ms coalescing window | No |
| ADR-011 | Permission granularity | Project-, view-, element-class- (not per-element instance for v1) | No |
| ADR-012 | Self-host minimums | `docker-compose up` deploys editor + sync-server + bake-worker + Postgres + R2-compatible (MinIO bundled). Single-binary later. | No |

### §3.2 Pre-flight scaffolding deliverables

- pnpm workspace + Turborepo `turbo.json`.
- Empty package skeletons compiling under `tsconfig.base.json`: `packages/protocol`, `packages/schemas`, `packages/file-format`, `packages/persistence-client`, `packages/command-bus`, `packages/stores`, `packages/geometry-kernel`, `packages/scene-committer`, `packages/frame-scheduler`, `packages/renderer`, `packages/sync-client`, `packages/plugin-sdk`, `packages/ai-host`, `packages/ui`, `packages/picking`, `packages/view-state`, `packages/drawing`.
- Empty app skeletons: `apps/editor`, `apps/viewer-only`, `apps/sync-server`, `apps/bake-worker`, `apps/ai-worker`, `apps/ifc-worker`, `apps/api-gateway`, `apps/bench`, `apps/headless` (npm publish target).
- ESLint boundaries config enforcing the 8-layer matrix from day one.
- Custom ESLint rules: `pryzm-no-raf` (P3), `pryzm-no-window-any` (P6), `pryzm-no-three-in-kernel` (P1), `pryzm-affected-stores-required` (P4).
- Vitest + Playwright wired with one passing smoke test.
- GitHub Actions CI: typecheck, boundaries lint, custom rules, vitest, playwright, bundle-size budget, bench delta gate.
- OTel SDK initialised in every app (no spans yet — just the plumbing).
- `.cursor/rules/*.mdc` — 15 files: Pascal's 10 + 5 PRYZM-specific (`command-event-bus`, `worker-pool`, `chunked-persistence`, `multi-view`, `ifc-pipeline`).

### §3.3 Baseline bench capture (the regression-protection floor)

- `apps/bench/load-small.ts`, `load-medium.ts`, `load-large.ts` — measure today's PRYZM 1 cold load on the same fixtures we'll use for 36 months.
- `apps/bench/save-edit.ts`, `idle-cpu.ts`, `orbit-fps.ts`, `undo-single.ts`, `concurrent-users.ts`, `largest-model.ts`, `sync-latency.ts`, `bake-incremental.ts`.
- Three reference projects checked into `tests/fixtures/`: `small.pryzm-1.json`, `medium.pryzm-1.json`, `large.pryzm-1.json`.
- Numbers stored in `apps/bench/baseline.json` — every PR's bench result compared. Regression > 5% blocks PR.

### §3.4 Pre-flight exit criteria (gate to S01)

- All 12 ADRs merged (or explicitly deferred to a sprint with date).
- Three spikes completed (ADR-002 Yjs, ADR-006 WebGPU, ADR-009 plugin sandbox); each produces a 1-page report linked from its ADR.
- `pnpm i && pnpm build && pnpm test` passes on a fresh clone.
- All baseline benches captured in `baseline.json` and PR'd.
- `09-AS-IS-VS-TO-BE.md` reviewed and signed off.

### §3.5 Strategic and gap-closure ADRs (added during Phase 1 + post Phase-1 audit)

The 12 Pre-flight ADRs above are the **starting** decision set. Nine more strategic ADRs were merged across Phase 1 as the architecture deepened (`ADR-013` … `ADR-021`). The Phase-1 GREEN re-audit (2026-04-27) and the corpus gap review (`GAP-REVIEW-2026-04-27.md`) identified eight additional decisions that needed ADRs to keep Phase 2 + Phase 3 work unambiguous; they are merged at the start of Phase 2A (S25):

| ADR | Title | Closes (gap review §) | Merged at sprint |
|-----|---|---|---|
| ADR-013 | Stripe-mediated entitlements | §15 (cost model context) | S07 |
| ADR-014 | Honeycomb / Tempo OTel pipeline | §29 #5 | S07 |
| ADR-015 | Per-element bake debounce policy | §22 (perf) | S08 |
| ADR-016 | View-state package as the multi-view authority | §29 #4 | S17 |
| ADR-017 | First-party catalog inventory | §29 #2 | S20 |
| ADR-018 | Capacity cut list (velocity-slip triage) | (own ADR) — extended 2026-04-27 with T1.7 + T1.8 | S22 |
| ADR-019 | Soft-locks via Postgres | §29 #6 | S22 |
| ADR-020 | Robustness budget per geometry kernel op | §29 #1 | S23 |
| ADR-021 | SOC2 evidence pipeline | §29 #7 | S24 |
| **ADR-022** | **Renderer topology + backend runtime** | **§6.1, §13, §29 #10–13** | **S31** |
| **ADR-023** | **Library rAF quarantine** | **§6.1, §29 #11** | **S31** |
| **ADR-025** | **three.js version pin & WebGPU path** | **§29 #16** | **S31** |
| **ADR-026** | **UI binding: vanilla TS (Path A confirmed)** | **§29 #18** | **S31** |
| **ADR-027** | **Schedule formula library scope** | **§10, §29 #19** | **S35** |
| **ADR-028** | **Authority unification (one permission model)** | **§29 #21–22** | **S31 → S32** |
| **ADR-029** | **PDF-to-BIM scope (the moat)** | **§21.5, §29 #25** | **S49** |
| **ADR-030** | **Lifecycle subsystem placement** | **§29 #14** | **S31** |

> **Note (2026-04-27 directive):** The 8 gap-closure ADRs above were originally scheduled to merge at S25 (Phase 2A start). Per the founder's directive that Phase 2A is in active development and holds no gap-closure work, all eight have been deferred to **S31 (Phase 2B start)**. See PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §Gap-Closure Subphase for the absorbed schedule and the schedule risk acknowledgement.

(ADR-024 is reserved for a future strategic decision and intentionally skipped to keep slot continuity.)

Each post-Pre-flight ADR has its own `Phase rollout` section; cross-phase scheduling is summarised in the per-phase `§Gap-Closure Subphase` blocks. The single consolidated index of "what closes which gap" lives in `11-GAP-CLOSURE-PLAN.md`.

### §3.6 Gap-closure subphase scheduling (added 2026-04-27)

The corpus gap review surfaced 9 missing SPECs and 8 missing ADRs. Rather than create new sprints, the work fits into existing Phase 2 / Phase 3 sprints as documented in each phase doc's `§Gap-Closure Subphase` block. **Per the 2026-04-27 directive Phase 2A holds no gap-closure work** (Phase 2A is in active development; mid-sprint new-work injection forbidden); all originally-2A items have been absorbed into Phase 2B's S31:

| Where | Sprint span | Document |
|---|---|---|
| Phase 2A | **none — no gap-closure work** (Phase 2A in active development per 2026-04-27 directive) | `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §Gap-Closure Note |
| Phase 2B | S31 (heavy: ratification + reverse-doc + service-role removal + drawing-primitives MVP + ESLint promotion to error + pre-port), S32–S36 (original plan-view migration) | `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §Gap-Closure |
| Phase 2C | S37–S42 | `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §Gap-Closure |
| Phase 2D | S43–S48 | `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` §Gap-Closure |
| Phase 3A–3D | S49–S72 | `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §Gap-Closure |

The single largest risk-reducer added by the gap review is the **S31 plan-view pre-port** (per SPEC-30 §5): the 5 highest-traffic plan-view operations (selection, drag, snap, pan, zoom) are rewritten on the new Canvas2D backend before the 11-wave VI engine port begins, derisking Phase 2B (the highest-slip-risk phase). **S31 is the heaviest sprint of the 36-month plan**; its slip risk is mitigated by ADR-018 Tier-1 cuts T1.7 (PDF-to-BIM degradation) and T1.8 (formula library 24→14), either of which buys back a sprint of calendar.

---

## §4 PHASE 1 — Foundation (Months 1–12, Sprints S01–S24)

**Phase goal**: produce an alpha PRYZM 2 build that opens a small project (1 wall, 1 slab, 1 door) end-to-end through every layer (L0 → L7.5) under feature flag, alongside the unaltered PRYZM 1, with all CI gates active. By M12 we know the architecture works.

### §4.1 Sub-phase 1A — Skeleton & rails (M1–M3, S01–S06)

**Goal**: the spine. Persistence client, command bus, frame scheduler, scene committer skeleton, store framework, OTel — all wired but doing trivial work. A `Hello World` cube renders through the new stack alongside PRYZM 1.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S01** | Schemas + ID system + ULID factory | `packages/schemas/{Project,Wall,Slab,Door,...}.ts` Zod schemas; typed-ID factory; `packages/protocol/index.ts` exporting all DTOs | Every primitive has a Zod schema with a typed ID; `Wall.parse({...})` round-trips |
| **S02** | Command bus + handler registry + Immer patches | `packages/command-bus/` with `CommandHandler<T>`, `executeCommand`, `affectedStores` enforcement, patch generation | Sample `MoveCubeCommand` produces forward+inverse patches; CI rule `affected-stores-required` blocks a missing-affected-stores test fixture |
| **S03** | Frame scheduler + custom ESLint rule + dirty-flag set | `packages/frame-scheduler/FrameScheduler.ts` with `requestFrame(reason, priority)`; `pryzm-no-raf` lint rule; reasons tagged in OTel | A demo `bouncing cube` runs at 60 fps when interacting, 0 fps idle; lint blocks any new `requestAnimationFrame(` in the repo outside the package |
| **S04** | Persistence client v0 (event log only, no chunks) | `packages/persistence-client/` with `appendEvent`, `loadEvents`, in-memory + IndexedDB backends; MessagePack codec | 100 events round-trip, sequence preserved; bench shows < 10 ms per append |
| **S05** | Scene committer + scene registry skeleton | `packages/scene-committer/SceneCommitter.ts` with `bindStore`; `SceneRegistry: Map<id, Object3D>` | A `CubeStore` mutated via command produces patches → committer adds/removes a `THREE.Mesh` in a registry; lint blocks any `new THREE` outside the committer |
| **S06** | Renderer skeleton + WebGPU/WebGL2 dual-mode | `packages/renderer/` minimal: clear color, one mesh, one camera, dirty-flag-driven render | The cube renders through the new stack at < 1.8 MB initial bundle (gzip); no continuous frame loop in dev tools profiler |

**1A exit**: `apps/editor` (PRYZM 1) is unchanged and shipping. A `?pryzm2=1` URL flag swaps in the new stack and renders one cube. The rails work.

### §4.2 Sub-phase 1B — Wall end-to-end (M4–M6, S07–S12)

**Goal**: the **Wall primitive** in PRYZM 2 — schema, store, command, handler, pure producer, committer, tool, panel — works for every operation walls support today (create, move, mirror, scale, offset, join, cut, reference-edit). Wall is the canonical example. Every other primitive copies this recipe.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S07** | Wall schema + store + 5 simplest commands | `packages/schemas/Wall.ts` (typed ID, defaults, refinements); `packages/stores/WallStore.ts`; `plugins/wall/handlers/{Create,Delete,Move,SetType,SetHeight}.ts` | 5 commands executable through the bus; patches apply; OTel spans visible |
| **S08** | Pure wall producer | `packages/geometry-kernel/producers/wall.ts` — pure function: simple wall, openings, layered, curved | Snapshot tests against `__snapshots__/wall.snap`; runs in Node `vitest`; identical bytes browser vs Node |
| **S09** | Wall committer + tool | `plugins/wall/committer.ts` (THREE side); `plugins/wall/tool.ts` (vanilla TS class extending `Tool`) | Drawing a wall in the editor produces correct 3D mesh; the wall persists through reload |
| **S10** | Remaining wall ops + intent resolution | Mirror/Scale/Offset/Join/Cut/ReferenceEdit handlers; intent resolver in `plugins/wall/intent.ts` | Parity with PRYZM 1 wall tool on `tests/wall-parity/` 30-case fixture |
| **S11** | Roof + Door + Window — pattern multiplication | Per-element schemas, stores, producers, committers, tools | All three primitives draw and persist; `tests/parity/` extended |
| **S12** | Slab + Curtain Wall + Grid + Column + Beam | Same pattern, 5 more elements | 9 element families end-to-end through PRYZM 2; PRYZM 1 still ships |

**1B exit**: 9 element families work in PRYZM 2 in single-user mode with patch-based undo, demand-driven render, `< 800 ms` cold load on the small fixture project. A peer can demo against the small project. No bake worker yet — geometry is built in the browser worker.

### §4.3 Sub-phase 1C — Element families completion (M7–M9, S13–S18)

**Goal**: bring the remaining "buildings" element families to parity. By end of 1C, every primitive in PRYZM 1 has a PRYZM 2 equivalent except documentation primitives (sheets / schedules / annotations) and AI workflows.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S13** | Curtain Wall handlers complete + producer perf tune | All 12 (-2 dropped) curtain-wall handlers; producer < 50 ms for typical façade | Curtain-wall snapshot tests pass; bench < target |
| **S14** | Stairs + Handrails + Ceilings | Schemas, stores, producers, committers, tools | All three families functional; tests pass |
| **S15** | Renderer hardening: post-FX, TRAA, SSGI | Bloom, TRAA, SSGI driven by FrameScheduler with idle-continuation budget | Idle CPU < 2% confirmed; orbit fps p95 > 55 |
| **S16** | Selection / picking system | `packages/picking/` — gpu-pick or BVH-pick; selection store; selection events | Click-to-select latency < 10 ms; selection diff applied via committer |
| **S17** | Camera + viewport + multi-view foundation | `packages/view-state/` — view definitions, view registry; one canonical 3D view | View switching through commands; OTel traces |
| **S18** | Headless `@pryzm/headless` package alpha | `apps/headless` — Node entry that runs the same producers + persistence client; one CLI: `pryzm-cli new-project`, `pryzm-cli add-wall`, `pryzm-cli export-pryzm` | Generate a wall+slab project from a Node script; produces a `.pryzm` file (format spec from S20) |

**1C exit**: complete element-family coverage; `@pryzm/headless` proves the kernel runs in Node identically.

### §4.4 Sub-phase 1D — Bake worker, .pryzm format, alpha gate (M10–M12, S19–S24)

**Goal**: the persistence-and-streaming story stands up. `.pryzm` ZIP format spec'd and round-tripping. Bake worker producing chunks. Alpha demo at M12.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S19** | Chunked binary persistence (glb + Draco + KTX2) | `packages/persistence-client/chunks.ts`; per-level chunk strategy; chunk index in manifest | Medium project saves to chunks + event log; reload in < 1.5 s |
| **S20** | `.pryzm` ZIP format v1 + spec doc | `packages/file-format/` — `pack(projectId)`, `unpack(blob)`; `docs/file-format/spec.md`; `signatures/` block; `schemaVersion: 1`; migration framework | A `.pryzm` round-trips losslessly; `pryzm-cli pack/unpack` works; spec doc complete |
| **S21** | Bake worker (server-side) v0 | `apps/bake-worker` — BullMQ + `worker_threads` + `gltf-transform`; per-element re-bake on event; R2 upload | Single wall edit triggers chunk re-bake in < 1.5 s; OTel spans cover the pipeline |
| **S22** | `apps/sync-server` skeleton + event linearisation | Express + Yjs server; events durable to Postgres; bake enqueue on commit; CDE legacy commands folded in | Two browser tabs see each other's events with last-writer-wins (CRDT comes 2D); OTel sync spans |
| **S23** | Tier-streamed loader | `packages/persistence-client/loader.ts` — manifest first, visible-level chunks second, background levels third, history events on demand | Large fixture loads with **first interactive < 3 s**, full < 12 s |
| **S24** | **Alpha demo build + M12 GATE** | A flagged `?pryzm2=1` build that opens small/medium/large fixtures end-to-end with all M12 numerics met | All cold-load benches green; alpha demo recording cut; PRYZM 1 unchanged and shipping |

**M12 GATE — Alpha (Phase 1 → Phase 2)**:
- All element families in PRYZM 2 with parity to PRYZM 1 for tests in `tests/parity/`.
- Cold load < 800 ms (small) / < 1.5 s (medium) / < 3 s (large) on the baseline fixtures.
- Save < 10 ms event append.
- Idle CPU < 2%.
- Bake worker reduces incremental save → ready time to < 1.5 s for a single-element edit.
- `.pryzm` v1 round-trips losslessly.
- Zero `(window as any)` in PRYZM 2 packages (lint-enforced).
- Zero non-scheduler `requestAnimationFrame` in PRYZM 2 packages.
- `@pryzm/headless` published to internal npm and runs a wall+slab project end-to-end in Node.
- All OTel spans firing in dev.

**Kill-switch**: if cold-load is > 1.5 s for the small fixture at M12, halt; spend up to 4 weeks tuning and re-bench. If still missing, escalate to scope cut decision (drop one of D8/D9/D10 to free a quarter).

---

## §5 PHASE 2 — Migration & Multi-User (Months 13–24, Sprints S25–S48)

**Phase goal**: bring the **non-element subsystems** across (rooms, structural, MEP, furniture, plan view, section view, sheets, schedules), and **turn on multi-user collaboration**. By M24 a beta cohort opens shared projects with two browser tabs editing simultaneously.

### §5.1 Sub-phase 2A — Non-element family completion (M13–M15, S25–S30)

**Goal**: rooms, structural, MEP, furniture, dimensions — the "second tier" element families.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S25** | Rooms (boundaries, area calc, naming) | `plugins/rooms/` full pattern | Rooms compute area + perimeter; tests pass |
| **S26** | Structural + Lighting + Plumbing | `plugins/structural/`, `plugins/lighting/`, `plugins/plumbing/` | All three families functional |
| **S27** | Furniture + carousel + multi-representation | `plugins/furniture/` (preserves sofa multi-representation Contract 48); R3/R4/R5 producers | Sofa with all 5 representations correct; tests pass |
| **S28** | Persistent project hub + portfolio view | `apps/editor/src/projects/` — multi-project workspace, recent projects, thumbnails | List, open, create, delete projects; project cards show thumbs |
| **S29** | Dimensions + first plan-view foundation | `plugins/dimensions/` + `plugins/plan-view/canvas-host.ts` skeleton | Dimensions in 3D + plan view skeleton renders one level outline |
| **S30** | Edge projection + poche fill (pure) | `packages/geometry-kernel/edge-projection.ts`, `poche.ts` (both pure) | Edge-projection unit tests pass; poche fills computed in worker |

**2A exit**: every non-documentation element family ported; plan view skeleton renders.

### §5.2 Sub-phase 2B — Plan view (the highest-risk sub-project) (M16–M18, S31–S36)

**Goal**: the documentation pipeline migration begins with **plan view** — Contract 44 (plan vs SVP parity) gaps closed in the new architecture, not patched in the old. This is the riskiest sub-project of Phase 2 because plan view is 54 files and the existing 11-wave Visibility-Intent system must be carried across without regression.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S31** | Plan-view canvas host + dirty-flag rendering | `plugins/plan-view/canvas-host.ts` — full vanilla `CanvasHost` subclass; dirty-flag driven; one rAF (scheduler) | Plan view renders walls/slabs/doors at 60 fps interactive, 0 fps idle |
| **S32** | Plan-view annotation renderer | `plugins/plan-view/annotation-renderer.ts` (pure parts) + committer | Visual diff vs PRYZM 1 plan view: < 2 px difference on parity test set |
| **S33** | Plan view + SVP parity (Contract 44 G1–G10) | All level-scoped renderers + per-view styleResolver fix (G4); selection + drag in pane (G9/G10) | Contract 44 gap matrix clean; visual diff continues green |
| **S34** | Annotations migration (general) | `plugins/annotations/` — text, leaders, callouts, regions | Annotations work in 3D + plan view; tests pass |
| **S35** | Section view foundation | `plugins/section-view/` — section line tool, section view canvas host | Section line drawn → section view renders correct cut |
| **S36** | Section view ↔ 3D ↔ plan view sync | Multi-view sync through view-state package | Edit in one view, change visible in others within 1 frame |

**2B exit**: plan view + section view migrated and parity-tested. **Per-project kill-switch flag** retained (`featureFlags.plan_view_v2`) until M24 — any project can fall back to PRYZM 1 plan view if the new one regresses.

### §5.3 Sub-phase 2C — Sheets, schedules, title blocks (M19–M21, S37–S42)

**Goal**: the rest of the documentation pipeline.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S37** | Sheet store + sheet editor host | `plugins/sheets/` host; `SheetStore.ts` Zod-validated | Create/delete sheets; sheet list renders |
| **S38** | Title blocks + viewports | `plugins/sheets/title-block.ts`; viewport placement on sheets | Drop a 3D / plan / section view onto a sheet; titleblock fills metadata |
| **S39** | Sheet widgets (10 widget types) | `plugins/sheets/widgets/*.ts` migrated from `SheetEditorPanel.ts` decomposition | All 10 widget types work; tests pass |
| **S40** | PDF export | `plugins/sheets/export/pdf.ts` — runs in worker via `apps/ai-worker`-class infra | A 5-sheet drawing set exports to PDF; OTel spans cover the pipeline |
| **S41** | Schedule store + schedule view | `plugins/schedules/` — schedules editable, formula evaluator | Door schedule with quantities + types; auto-updates on element edit |
| **S42** | Schedules export (CSV, XLSX, PDF) | Exporters in `plugins/schedules/export/` | Round-trip CSV/XLSX import + export |

**2C exit**: full documentation pipeline ported.

### §5.4 Sub-phase 2D — Sync, awareness, beta (M22–M24, S43–S48)

**Goal**: turn on real-time multi-user. Yjs CRDT live, awareness with active view + tool, soft locks. **Beta launch at M24**.

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S43** | Sync client (Yjs) + protocol | `packages/sync-client/` over WebSocket; events as Yjs map operations; commands committed via patch+event | Two tabs converge after 100 random edits; CRDT merge invariants tested |
| **S44** | Awareness extended (view, tool, selection) | Yjs awareness broadcasts `activeViewId`, `activeTool`, `selection[]` | Multiplayer cursor + view chip + tool indicator visible to peers |
| **S45** | Soft locks + lock UI | `packages/sync-client/locks.ts`; per-element lock TTL; UI badges | Concurrent edit attempts respect the lock; visible lock holder name |
| **S46** | Visibility-Intent migration (waves 1–5) | `plugins/visibility-intent/` — first half of the 11 waves carried verbatim into plugin | 5 waves parity-tested vs PRYZM 1 |
| **S47** | AI subsystem migration begins (decomposition) | `packages/ai-host/` skeleton; `apps/ai-worker` skeleton; first AI plugin shell `plugins/ai-floorplan/` | AI host loads lazily; OTel spans on first AI invocation only |
| **S48** | **Beta launch + M24 GATE** | Public beta sign-up; 25 invited beta users; crash + telemetry monitoring; bug triage workflow | All beta gate criteria met (below) |

**M24 GATE — Beta (Phase 2 → Phase 3)**:
- Two-user concurrent edit on same wall: conflict-free merge, < 250 ms p95.
- 20 concurrent users on one project: no crashes, < 500 ms sync latency.
- Sheet, schedule, plan view, section view all functional with parity tests green.
- 50 beta sign-ups, 25 active in first 2 weeks, < 5 critical bugs reported.
- Cold-load numbers from M12 still green (regression bench).
- `.pryzm` v1 stable; users can email files between machines.
- 50% of `(window as any)` sites deleted (target: 1,039 remaining).
- 50% of 264 commands consolidated into plugins.

**Kill-switch**: if 2-user same-element conflict produces data loss in any beta user's project, halt all forward work; root-cause in CRDT layer; do not resume sub-phase 3 work until the regression is locked out by a test.

---

## §6 PHASE 3 — Completion, Hardening, GA (Months 25–36, Sprints S49–S72)

**Phase goal**: bring the remaining moats (AI, IFC, component editor) across, ship the **plugin SDK 1.0**, ship the **public APIs**, delete the entire legacy codebase, harden for production GA at M36.

### §6.1 Sub-phase 3A — Visibility-Intent + AI complete (M25–M27, S49–S54)

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S49** | Visibility-Intent waves 6–11 | Remaining 6 waves carried into `plugins/visibility-intent/` | All 11 waves parity-tested vs PRYZM 1 |
| **S50** | AI floor-plan import (CV pipeline) | `plugins/ai-floorplan/` + heavy CV in `apps/ai-worker`; PdfToBimConstraints, DoorGapInpainter, WallCandidateScorer migrated | Sample PDF → reviewable command batch in < 15 s |
| **S51** | AI generative + rule engine + semantic query | `plugins/ai-generative/`, `plugins/ai-rules/`, `plugins/ai-query/` | All four AI workflows functional with approval queue |
| **S52** | Voice spatial interface as plugin | `plugins/ai-voice/` against approval flow | Voice commands work; same approval queue |
| **S53** | AI public API endpoints | `apps/api-gateway/ai/` — 4 endpoints: floorplan-import, query, generate, validate | OAuth2-authenticated; rate limited; OpenAPI spec generated |
| **S54** | AI batching + undo as one + audit | All AI mutations are command batches; appear as one undo entry; audit trail complete | 100% of AI workflows go through batched commands; tests cover undo as one |

### §6.2 Sub-phase 3B — IFC + DXF + Rhino + Component Editor (M28–M30, S55–S60)

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S55** | IFC import as plugin (web-ifc isolated) | `plugins/ifc-import/` — web-ifc loaded only when plugin invoked; viewer build excludes IFC entirely | Sample IFC4 file imports; property sets preserved |
| **S56** | IFC export with Psets + ISO 19650 | `plugins/ifc-export/` | Round-trip IFC: export → re-import → byte-equivalent (modulo timestamps) |
| **S57** | DXF + Rhino as plugins | `plugins/dxf/`, `plugins/rhino/` | Both round-trip on fixture files |
| **S58** | Component editor as separate React-free SPA | `apps/component-editor` — vanilla TS, sharable component definitions = Zod schemas + producers | Author a parametric chair; export to project; reload; chair renders |
| **S59** | BCF issue round-trip | `plugins/bcf/` — issue creation, comments, viewpoint capture, BCF 3.0 export | BCF round-trip with Solibri-compatible files |
| **S60** | PropertyPanel + PropertyInspector decomposition | The two largest legacy files broken into per-element vanilla classes following the wall pattern | All inspector features still work; line count down 70% |

### §6.3 Sub-phase 3C — Plugin SDK 1.0, marketplace, public APIs (M31–M33, S61–S66)

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S61** | **Legacy deletion sprint** | DELETE: `EngineBootstrap.ts` 2,086 LOC, `ProjectSerializer.ts` 1,894 LOC, `initUI.ts` 2,724 LOC, `ImportProjectCommand.ts` 1,720 LOC, all 264 legacy commands, `legacy/window-shim.ts`, all 2,078 `(window as any)` sites | `git ls-files src/legacy/` returns empty; bundle size drops below 6 MB raw |
| **S62** | Plugin SDK 1.0 — manifest, lifecycle, permissions | `packages/plugin-sdk/` 1.0; manifest schema; 7 permissions; sandbox; `pryzm dev` hot-reload < 500 ms | An external developer (the founder simulating one) builds a `hello-plugin` in < 1 hour |
| **S63** | Plugin SDK docs site | `docs.pryzm.com/plugin-sdk/` — getting started, manifest reference, permission catalogue, examples | Docs site live, 30 example plugins documented |
| **S64** | Marketplace v1 | `marketplace.pryzm.com` — list, install, update, uninstall plugins; signed plugin packages; revenue share infra | First-party plugins listed; one external test plugin installable |
| **S65** | Public REST + WebSocket APIs | `apps/api-gateway` — REST endpoints from OpenAPI 3.1 (auto-generated from Zod); WebSocket stream; OAuth2; scoped API keys; rate limits | Public API responds; OpenAPI viewable; webhooks registered + delivered |
| **S66** | `@pryzm/headless` published to npm public + docs | `apps/headless` published as `@pryzm/headless`; `docs.pryzm.com/headless/` complete; CLI `pryzm` published as `@pryzm/cli` | A fresh `npm i @pryzm/headless` works; sample script generates a project |

### §6.4 Sub-phase 3D — Hardening + GA (M34–M36, S67–S72)

| Sprint | Focus | Deliverables | Exit criteria |
|---|---|---|---|
| **S67** | Self-host packaging | `pryzm-selfhost/docker-compose.yml` — editor + sync-server + bake-worker + Postgres + MinIO; `pryzm-selfhost/install.sh` | Fresh Linux VM → `docker-compose up` → working PRYZM at `localhost:3000` |
| **S68** | Security hardening | Pen test (third-party), CSP audit, plugin sandbox audit, secret rotation, RLS audit, OAuth2 review | Pen test report clean; HoundDog scan clean; SAST clean |
| **S69** | Performance hardening | All M36 NFT targets re-benched, regressions hunted, large-fixture (10K walls × 50 levels) tested | Every target in `08-VISION.md §6` green |
| **S70** | Browser matrix + accessibility | Chrome 130+, Firefox 132+, Safari 18.4+ (Mac + iPad review), Edge — full test suite | All browsers pass; tablet review mode confirmed |
| **S71** | Public docs site + marketing site + demo | `pryzm.com` (marketing), `docs.pryzm.com` (full docs), 5-min demo video, 5 case studies, pricing, signup | All sites live; demo recorded; case studies published |
| **S72** | **GA launch + M36 GATE** | Press, public launch, monitoring, support workflow live, GA blog post | All GA gate criteria below met; PRYZM 2.0.0 tagged |

**M36 GATE — GA**:
- Every NFT target in `08-VISION.md §6` green.
- Zero P0 / P1 bugs open.
- Pen test report clean.
- Self-host: fresh `docker-compose up` deploys in < 10 minutes.
- Plugin SDK 1.0 published, marketplace live, ≥ 30 first-party plugins, ≥ 5 third-party plugins.
- Public REST + WS + headless + AI APIs documented + rate-limited + OAuth2-authenticated.
- `.pryzm` v1 stable; backward-compat plan published.
- All legacy code deleted (`src/legacy/` empty; `git ls-files` of old files returns empty).
- 0 `(window as any)` sites; 0 non-scheduler rAF; 0 THREE imports outside `packages/scene-committer/` and `plugins/*/committer.ts`.
- 100% L0–L7 hot paths covered by OTel.
- Beta cohort upgraded; ≥ 100 paying users on PRYZM 2; PRYZM 1 sunset announced (90-day migration window).

---

## §7 Sprint master table (S01–S72)

A condensed reference: every sprint, one line.

| # | Phase / Sub | Sprint goal | Bench gate touched |
|---|---|---|---|
| S01 | 1A | Schemas + ID system + ULID | (none) |
| S02 | 1A | Command bus + Immer + affectedStores | (none) |
| S03 | 1A | Frame scheduler + no-rAF lint | idle-cpu |
| S04 | 1A | Persistence client (events only) | save-edit |
| S05 | 1A | Scene committer + registry | (none) |
| S06 | 1A | Renderer skeleton + WebGPU/WebGL2 | bundle-size |
| S07 | 1B | Wall schema + 5 commands | (none) |
| S08 | 1B | Pure wall producer | geometry snapshot |
| S09 | 1B | Wall committer + tool | orbit-fps |
| S10 | 1B | Wall ops + intent | parity |
| S11 | 1B | Roof, Door, Window | parity |
| S12 | 1B | Slab, CurtainWall, Grid, Column, Beam | parity |
| S13 | 1C | Curtain wall complete + perf tune | orbit-fps |
| S14 | 1C | Stairs, Handrails, Ceilings | parity |
| S15 | 1C | Renderer hardening (post-FX) | idle-cpu, orbit-fps |
| S16 | 1C | Selection + picking | interaction-latency |
| S17 | 1C | Camera + view-state | (none) |
| S18 | 1C | `@pryzm/headless` alpha | headless smoke |
| S19 | 1D | Chunked binary persistence | load-medium |
| S20 | 1D | `.pryzm` ZIP v1 + spec | file-format round-trip |
| S21 | 1D | Bake worker v0 | bake-incremental |
| S22 | 1D | Sync-server skeleton | sync-latency baseline |
| S23 | 1D | Tier-streamed loader | load-large |
| S24 | 1D | **M12 ALPHA GATE** | All cold-load benches |
| S25 | 2A | Rooms | (none) |
| S26 | 2A | Structural, Lighting, Plumbing | parity |
| S27 | 2A | Furniture + multi-rep (Contract 48) | parity |
| S28 | 2A | Project hub + portfolio | (none) |
| S29 | 2A | Dimensions + plan-view skeleton | (none) |
| S30 | 2A | Edge projection + poche (pure) | geometry snapshot |
| S31 | 2B | Plan-view canvas host | orbit-fps in plan |
| S32 | 2B | Plan-view annotation renderer | visual-diff |
| S33 | 2B | Plan view + SVP parity (Contract 44) | visual-diff |
| S34 | 2B | Annotations general | parity |
| S35 | 2B | Section view foundation | (none) |
| S36 | 2B | Multi-view sync | sync-latency |
| S37 | 2C | Sheet store + editor host | (none) |
| S38 | 2C | Title blocks + viewports | (none) |
| S39 | 2C | Sheet widgets (10 types) | parity |
| S40 | 2C | PDF export | export-perf |
| S41 | 2C | Schedule store + view | (none) |
| S42 | 2C | Schedule export (CSV/XLSX/PDF) | export-perf |
| S43 | 2D | Sync client (Yjs) | sync-latency |
| S44 | 2D | Awareness (view, tool, selection) | sync-latency |
| S45 | 2D | Soft locks + lock UI | (none) |
| S46 | 2D | Visibility-Intent waves 1–5 | parity |
| S47 | 2D | AI subsystem decomposition begins | (none) |
| S48 | 2D | **M24 BETA GATE** | concurrent-users |
| S49 | 3A | Visibility-Intent waves 6–11 | parity |
| S50 | 3A | AI floor-plan import (CV) | ai-floorplan |
| S51 | 3A | AI generative + rules + query | (none) |
| S52 | 3A | Voice as plugin | (none) |
| S53 | 3A | AI public API endpoints | api-latency |
| S54 | 3A | AI batching + undo + audit | undo-batch |
| S55 | 3B | IFC import plugin | ifc-import |
| S56 | 3B | IFC export + ISO 19650 | ifc-roundtrip |
| S57 | 3B | DXF + Rhino plugins | (none) |
| S58 | 3B | Component editor SPA | (none) |
| S59 | 3B | BCF round-trip | bcf-roundtrip |
| S60 | 3B | PropertyPanel/Inspector decomposition | (none) |
| S61 | 3C | **Legacy deletion sprint** | bundle-size |
| S62 | 3C | Plugin SDK 1.0 | plugin-install |
| S63 | 3C | SDK docs site | (none) |
| S64 | 3C | Marketplace v1 | (none) |
| S65 | 3C | Public REST + WS APIs | api-latency |
| S66 | 3C | `@pryzm/headless` public | headless-perf |
| S67 | 3D | Self-host packaging | install-time |
| S68 | 3D | Security hardening | pen-test |
| S69 | 3D | Performance hardening | all benches |
| S70 | 3D | Browser matrix + a11y | cross-browser |
| S71 | 3D | Docs + marketing + demo | (none) |
| S72 | 3D | **M36 GA GATE** | All NFT targets |

---

## §8 Pivot points & kill-switches

**Pivot points** (reassess scope, not direction):

- **End of M3** (after S06): does the spine work? If not, extend 1A by 4 weeks. Do not start 1B until rails are green.
- **End of M6** (after S12): does the wall pattern multiply cleanly? If element families take >4 weeks each instead of 1, the producer interface is wrong; refactor before continuing.
- **End of M9** (after S18): does headless work? If `@pryzm/headless` cannot run in Node, the kernel is impure. Stop and fix.
- **End of M12** (S24, ALPHA GATE): see exit criteria. If miss, follow kill-switch below.
- **End of M18** (S36): plan-view migration done? If still in flight, extend 2B by 4 weeks; defer 2C by same amount.
- **End of M24** (S48, BETA GATE): see exit criteria.
- **End of M30** (S60): legacy deletable? If not, delay S61, write more tests, do not GA with legacy code shipping.
- **End of M33** (S66): public APIs stable? If still volatile, delay GA marketing by 1 month; ship privately first.

**Kill-switches** (halt forward work):

- Cold-load bench regresses > 5% on a PR — block PR.
- 2-user same-element edit produces data loss in any beta project — halt all sprint work, fix CRDT first.
- Bake worker single-element re-bake takes > 30 s on production-scale fixture — halt 1D work, profile + redesign.
- Plugin sandbox escape (a plugin reads / writes outside its permission scope) — halt SDK 1.0 publish, block S64 until fixed.
- Self-host install fails on any of `[Linux x86, Linux ARM, macOS]` clean machines — block GA.

---

## §9 Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Owner sprint |
|---|---|---|---|---|---|
| R-01 | Solo + Agent velocity insufficient for 36 months | Medium | High | Feature freeze on PRYZM 1 (confirmed); strict adherence to ADR cadence; willingness to drop one of D2/D8/D9/D10 at M18 if behind by > 3 sprints | Continuous |
| R-02 | CRDT (Yjs) merge edge case loses data on multi-user element edit | Medium | Critical | ADR-002 spike pre-S01; chaos-test harness in S43; per-project kill-switch flag retained until M30 | S43, S48 |
| R-03 | Plan-view migration overruns | High | High | Both senior-level focus during 2B; daily visual diff; per-project fall-back flag retained until M24 | S31–S36 |
| R-04 | Bake worker $/project unviable | Low | High | Cost bench in S21; aggressive coalescing; tiered bake (per-element vs per-level vs per-project); soft-cap per project | S21 |
| R-05 | OBC removal breaks IFC import | Medium | Medium | IFC-import plugin parity tests against `tests/ifc/` 50-file fixture; no OBC removed from main bundle until plugin proven | S55, S61 |
| R-06 | `.pryzm` v1 forward-compat needed before v2 spec done | Low | High | Migration framework in S20; migrations live forever; CI test exercises v1→v2 round-trip every PR | S20 |
| R-07 | Plugin sandbox escapes | Low | Critical | ADR-009 spike pre-S01; pen test in S68; CSP + Worker isolation; review every plugin permission change | S62, S68 |
| R-08 | WebGPU regressions on Safari | Medium | Medium | WebGL2 fallback always present; visual-diff CI in 3 browsers; test on physical iPad in S70 | S15, S70 |
| R-09 | Beta users find a "show-stopper" UX gap | Medium | Medium | M24 beta is private (50 invited); 4-week bug-fix sprint S49 reserved for response | S48–S49 |
| R-10 | Founder burnout | Medium | High | Sprint buffer (Day 11–14); explicit "do nothing" weeks at end of M12 / M24 / M36; weekly 1-on-1 with mentor | Continuous |

---

## §10 The 30-worst-files retirement schedule

Cross-reference with `09-AS-IS-VS-TO-BE.md §3`.

| Sprint | File deleted / replaced |
|---|---|
| S03 | `BatchCoordinator.ts` (rAF logic absorbed into FrameScheduler) |
| S03 | `WallPerfBench.ts` (becomes `apps/bench/wall-perf.ts`) |
| S03 | `UnifiedFrameLoop.ts` (replaced by `packages/frame-scheduler/`) |
| S05 | `DrawingPipelineOrchestrator.ts` (replaced by `packages/drawing/`) |
| S06 | `CommandManager.ts` (replaced by `packages/command-bus/`) |
| S08–S10 | `WallFragmentBuilder.ts` (split into producer + committer) |
| S09–S10 | `SlabFragmentBuilder.ts` |
| S11–S12 | `RoofFragmentBuilder.ts` |
| S13–S15 | `CurtainWallBuilder.ts` |
| S15 | `EnhancedBloomService.ts` (replaced by `passes/bloom.ts`) |
| S15–S17 | `RenderPipelineManager.ts` (replaced by scheduler-driven `packages/renderer/`) |
| S25–S27 | `ViewController.ts`, `PlanViewService.ts`, `PlanViewManager.ts` |
| S29–S33 | `PlanViewCanvas.ts`, `PlanViewAnnotationRenderer.ts`, `EdgeProjectorService.ts` |
| S30 | `PocheFillBuilder.ts` |
| S31–S34 | `AnnotationRenderLayer.ts` |
| S35–S36 | `SectionViewService.ts` |
| S37–S42 | `SheetEditorPanel.ts`, `SheetStore.ts`, `ScheduleStore.ts`, `TitleBlockStore.ts` |
| S55–S57 | OBC import sites in core (down to plugins/ifc-* only) |
| S60 | `PropertyPanel.ts`, `PropertyInspector.ts` |
| S61 | **DELETION SPRINT**: `EngineBootstrap.ts`, `ProjectSerializer.ts`, `initUI.ts`, `ImportProjectCommand.ts`, all 264 legacy commands, all `(window as any)` sites |

---

## §11 The 264-command cutover order

Cross-reference with `09-AS-IS-VS-TO-BE.md §4`.

The cutover follows the element-family migration order. Each sprint that introduces a plugin lifts its commands at the same time. The full cutover map:

- Sprints S07–S14: walls, slabs, doors, windows, openings, roofs, curtain walls, stairs, handrails, ceilings, grids, columns, beams (170 commands).
- Sprints S25–S30: rooms, structural, lighting, plumbing, furniture, dimensions (47 commands).
- Sprints S31–S36: plan-view, annotations, section-view (~32 commands).
- Sprints S37–S42: sheets, schedules (22 commands).
- Sprints S46, S49: visibility-intent + VG (13 commands).
- Sprints S50–S54: AI commands lifted to L7.5 (18 commands).
- Sprints S55–S57: IFC + DXF + Rhino (16 commands).
- Sprints S58: geospatial (3 commands).
- Sprint S60: monetization (Stripe) handlers stay (8 commands kept).
- Sprint S61: **DELETION** — all 264 legacy command class files removed; `~110` new handlers across `~25` plugins remain.

---

## §12 Definition of done per phase (the gate criteria, repeated for visibility)

### Phase 1 (M12 — Alpha)
- All element families functional, end-to-end through L0–L7.
- Cold load < 800 ms small / < 1.5 s medium / < 3 s large.
- Save < 10 ms event append.
- Idle CPU < 2%.
- `.pryzm` v1 round-trips losslessly.
- `@pryzm/headless` runs a wall+slab project in Node.
- Zero CI gate violations.

### Phase 2 (M24 — Beta)
- 20 concurrent users, conflict-free merge, < 250 ms p95.
- Plan view, section view, sheets, schedules functional and parity-tested.
- Beta cohort signed up; 25 active.
- 50% legacy `(window as any)` deleted.
- 50% commands consolidated.

### Phase 3 (M36 — GA)
- All NFT targets in `08-VISION.md §6` green.
- Zero P0 / P1 bugs.
- Self-host installable in < 10 min on fresh Linux.
- Plugin SDK 1.0 + marketplace + ≥ 30 first-party plugins + ≥ 5 third-party.
- Public REST + WS + headless + AI APIs published and OAuth2-authenticated.
- All legacy deleted.
- Pen test clean.
- Browser matrix green (Chrome, Firefox, Safari, Edge).
- 100% OTel coverage on hot paths.
- ≥ 100 paying users on PRYZM 2.

---

## §13 The single discipline that finishes this plan

When tempted to take a shortcut at any point in the next 36 months, re-read `08-VISION.md §9` and `§10`. The architecture only works if the discipline survives. The plan only finishes if the architecture works.

> *"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"*

If you can't answer **yes** for L0–L4 work, the layer is wrong. Refactor the boundary, do not paper over it. This single test, applied to every PR for 36 months, is the entire reason this plan can be executed by one founder + Replit Agent rather than the 11 FTE the original `07-EXECUTION-PLAYBOOK.md` assumed.

The 36 months are not a budget for engineering effort. They are a budget for **discipline**. Every shortcut you don't take is a week off the back-end of GA. Every shortcut you take is a week added to GA *and* a permanent feature of PRYZM 2 that the next engineer (or the next agent session) has to work around.

---

*Last updated: 2026-04-26. Owner: Founder + Architecture lead (same person). Conflicts? `08-VISION.md` overrides this plan. Bench numbers in `08-VISION.md §6` are binding contracts; this plan exists to reach them by M36. Re-read `09-AS-IS-VS-TO-BE.md §9` (Pascal threat assessment) at end of M12 and M24 to recalibrate competitive position.*
