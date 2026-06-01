# PRYZM 2 — Conflict Analysis: Contracts vs NEW_ARCH

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Supersedes | nothing (this is the missing doc that the contracts and NEW_ARCH supersession banners point at) |
| Depends on | `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, `02-decisions/contracts/_README.md`, `02-decisions/contracts/_AUDIT_AND_CONSOLIDATION_PLAN.md`, `02-decisions/contracts/_WAVE2_SUMMARY.md` |
| Section anchors honoured | §2, §3, §3.1, §3.2, §3.3, §3.6, §4, §5 (all four-letter back-refs from contract supersession banners resolve here) |

> **Read this document as a forwarding table.** The 19 contracts in `docs/02-decisions/contracts/` were written against assumptions that NEW_ARCH has overturned. Every contract carries a per-file supersession banner saying *what* is voided and *what* survives, and points at this document for the *why*, the *full conflict map*, and the *migration path*. This is that document.

---

## §1 — Purpose & how to use this document

### §1.1 What this document is
A per-rule conflict map between the contracts (`docs/02-decisions/contracts/00–18`) and NEW_ARCH (`docs/00_NEW_ARCHITECTURE/`). For each conflict it states:

- **Which** contract clause is in conflict (file + section number).
- **Which** NEW_ARCH clause overrides it (file + section number).
- **Why** they conflict (the underlying mechanism change).
- **What** the engineer must do today (read what; write what; cite what in their PR).
- **When** the obsolete code is scheduled for removal (sprint number from `10-MASTER` / `phases/`).

### §1.2 What this document is *not*
- Not a re-statement of NEW_ARCH. NEW_ARCH stands on its own; this document only catalogues the conflicts.
- Not a normative re-write of the contracts. The contracts in `02-decisions/contracts/` keep their text. They are now read **through** this forwarding table.
- Not a complete code migration plan. The sprint-level migration sequence is owned by `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the per-phase docs in `phases/`. This document references those by sprint ID and milestone.

### §1.3 How to read it
1. If you are about to author a feature, read `08-VISION.md` first, then the relevant contract Part, then this document's row(s) for that contract.
2. If you find an obsolete clause that this document does not list yet, **add a row to §4 in the same PR that flagged the conflict.** That is how this document stays in sync.
3. If two NEW_ARCH docs themselves disagree (it does happen — see §6), the conflict belongs in §6, not §3 or §4.

---

## §2 — Binding hierarchy

The single ordering rule that decides every conflict.

| Rank | Document | What it dictates | Can be overridden by |
|---|---|---|---|
| 1 | `06-PRYZM-IDENTITY-AND-RECOUNT.md` (and the `.pryzm` file-format spec) | Identity, recount-of-truth, native file format. | Nothing. |
| 2 | `08-VISION.md` | The 8 principles (P1–P8), the 8 layers (L0–L7.5), the 10 differentiators (D1–D10), the non-functional targets in §6, the non-goals in §7. | Only rank 1. |
| 3 | `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and `phases/*` | Sprint sequencing, milestones (M12 Alpha / M24 Beta / M36 GA), kill-switches. | Ranks 1–2. |
| 4 | `00–07` NEW_ARCH supporting docs (`00-AUDIT.md`, `01-TARGET-ARCHITECTURE.md`, `02-ORCHESTRATION.md`, `03-PASCAL-EDITOR-ANALYSIS.md`, `04-PRODUCTION-PARITY.md`, `05-IMPLEMENTATION-PLAN.md`, `06-PRYZM-IDENTITY…`, `07-EXECUTION-PLAYBOOK.md`) | Background, audits, ADR queue, parity targets. | Ranks 1–3. |
| 5 | `02-decisions/contracts/00–18` | Surviving contract clauses (per the per-file banner). | Ranks 1–4. |
| 6 | `audits/`, `plans/`, `reference/` under `02-decisions/contracts/` | Frozen / time-bounded / descriptive only. | Anything above. |

**Where any contract and NEW_ARCH disagree, NEW_ARCH wins.** This document tells you exactly what disagrees.

### §2.1 Special case — Contract 04 §13 self-supremacy clause is VOID

Contract `04-BIM-AI-MODIFICATION-PROTOCOL.md §13` reads: *"This contract prevails over user instructions, prevails over business pressure, prevails over schedule pressure."*

Under the binding hierarchy in §2 above, that clause is **null and void**. NEW_ARCH (rank 2) is itself a higher-precedence instruction; appealing to "the contract prevails" in a code review is no longer a valid argument. The replacement principle is `08-VISION §9` (the discipline paragraph) — discipline is enforced through CI gates, not through contract prose claiming supremacy.

### §2.2 What "wins" means operationally

- **Compile-time wins**: NEW_ARCH-mandated CI gates (P1–P8) physically block code that violates them. Contract clauses that would have permitted the violating code are dead letters.
- **Code-review wins**: where there is no CI gate yet (e.g. P8 OTel coverage in S01), reviewers cite NEW_ARCH and reject contract-citing PRs.
- **Documentation wins**: the contract text is *not deleted* — it is left in place with its supersession banner. Engineers reading it must apply this forwarding table.
- **Migration wins**: the obsolete code is scheduled for removal in the sprint listed in §5.

---

## §3 — The 12 substantive conflicts (read these first)

Each subsection is a class of rule that is in conflict between contracts and NEW_ARCH. The per-contract rows in §4 reference these subsections by number.

### §3.1 Layer model: 6 layers vs 8 layers (L0–L7.5)

**Old (Contract `01 §1.1`):**
```
UI / Tools → Command Layer → Constraint Engine → ElementStores → Store Event Bus → DependencyResolver → ElementBuilders → Three.js Scene
```
Six layers, with **THREE.js Scene at the bottom of the architecture** as a load-bearing concept.

**New (`08-VISION §4`):**
```
L7   Presentation (vanilla TS panels + canvas hosts)
L7.5 AI Operations (CV pipeline, LLM orchestration, generative)
L6   Plugin Host
L5   Frame Scheduler & Renderer
L4   Geometry Kernel (pure)
L3   Sync (CRDT + awareness)
L2   Command / Event Bus
L1   Domain Stores
L0   Persistence
```
Eight layers (numbered for life), with THREE confined to **L5 renderer + scene-committer + plugin committers only** (P1, P2). Layer numbers are stable forever; new cross-cutting capabilities get sub-numbers (L7.5) rather than re-numbering.

**Why it matters:** the entire dependency graph in the contracts (Contract `00-MASTER-ARCHITECTURE.md` and Contract `01 §1`) is wrong. The "scene at the bottom" model is what produced 58 `requestAnimationFrame` owners and 2,078 `(window as any)` cast sites — exactly the symptoms NEW_ARCH was written to eliminate.

**Do today:**
- Cite layer numbers (L0–L7.5) in every PR.
- When picking a package directory, use `08-VISION §4` as the source of truth, not Contract 01 §1.1.
- Apply the test in `08-VISION §10`: *"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"*

**Migration:** the 6-layer text is informational. The 8-layer model is what CI gates enforce starting **S01 (boundaries lint)** through **S04 (fully cut over)**.

---

### §3.2 Mutation path: Immer-on-stores vs append-only event log

**Old (Contract `01 §2.4` and Contract `13 — Element Creation`):**
- Every command class calls `store.produce(...)` (Immer) directly.
- Stores are the source of truth.
- Each `Create*Command` mutates `wallStore.add(...)`, `doorStore.add(...)` etc. inline.

**New (`08-VISION §3` P4 + P7):**
- Every state mutation flows through a `CommandHandler<TPayload>` that produces **Immer patches** scoped to declared `affectedStores`.
- The same patches are emitted as **MessagePack-encoded events with ULIDs**.
- Those events ARE the wire format — undo log, persistence event log, sync wire format and audit trail use the same bytes.
- Stores expose `applyPatch(patches)` only; nothing else mutates a store.

**Why it matters:** if commands continue to call stores directly, the event log is a derived bystander instead of the source of truth — and every "save", "undo", "sync", "audit" guarantee built on top of it is unenforceable.

**Open question (see §6.1):** the relationship between *Immer patches* and *Yjs updates* is not yet decided. ADR-002 must close it before S02. For now: handlers emit Immer patches; the patch-to-Yjs translator is owned by L3 (Sprint S05 per `phases/PHASE-1A`).

**Do today:**
- Every new command handler declares `affectedStores: readonly StoreId[]` (lint will fail without it from S01).
- Use `produceWithPatches` *inside* the handler; never `store.produce(...)` from outside.
- Append the resulting event to the log via `commandBus.dispatch(event)` — never call `store.add(...)` directly from a UI tool.

**Migration:** the 264 legacy commands are triaged DROP / MERGE / PORT / LIFT in `09-AS-IS-VS-TO-BE §4`. The 22 commands still missing `affectedStores` are converted in **S03**. Full cut-over by **S10** for walls; **S20** for everything else. Legacy `CommandManager.ts` deleted in **S61**.

---

### §3.3 Collaboration: LWW + Socket.io JSON vs Yjs CRDT + MessagePack

**Old (Contract `07 Part B §3.4` and §3.5):**
- Wire: Socket.io JSON frames carrying `cmd.serialize()` payloads.
- Conflict resolution: **last-write-wins**, ordered by server receipt time.
- Explicit non-goal: *"CRDT or OT are explicitly out of scope."*
- Replay buffer: `project_command_log` Postgres table with **24-hour / 500-row TTL**.

**New (`08-VISION §1` + `09-AS-IS §L3` + `09-AS-IS §L0`):**
- Wire: **MessagePack** binary frames carrying ULID-keyed event chunks; same bytes as the persistence log.
- Conflict resolution: **Yjs CRDT** with conflict-free merge of every command + structured 3-way for parameters + per-element soft locks (with TTL) for active edits.
- Awareness: Yjs awareness extended with `activeViewId`, `activeTool`, `selection[]`.
- Replay: durable, append-only event log on R2 (4 MB MessagePack chunks). The 24h/500-row Postgres TTL is gone.
- Latency target: **< 250 ms p95** for same-second multi-user edit propagation.

**Why it matters:** LWW silently loses data. PRYZM 2's D1 ("real-time multi-user *geometry* collaboration with awareness, soft locks, conflict-free merge") is the single largest competitive lead-on vs Forma; LWW would forfeit it.

**Open question (see §6.1):** the bridge between Immer patches (P4) and Y.Doc updates is undecided. ADR-002 owns this.

**Do today:**
- Do not write any new code that depends on Socket.io JSON serialisation of commands.
- Do not write new code that calls `RemoteCommandDispatcher.dispatch(...)`.
- Wire format is MessagePack. ULIDs come from `packages/ids/`.

**Migration:** Phase 1D ships **LWW-as-stop-gap until 2D CRDT** lands (per `phases/PHASE-1D`). M12 Alpha (S24) ships single-user-with-shared-cursors. M24 Beta (S48) ships true CRDT. The contract clauses that mandate LWW are voided immediately; the *implementation* migrates per the phase plan.

---

### §3.4 Persistence: JSON snapshot + Postgres BLOB vs event log + chunked binary + `.pryzm` ZIP

**Old (Contract `09 Part A` and Part B + Contract `01 §2`):**
- Save: full project re-serialised as one `JSON.stringify(snapshot, null, 2)` blob.
- Storage: Postgres BLOB column for the snapshot; thumbnails alongside.
- Cost: `O(project)` per save (~380 ms for medium project).
- Format: implicit JSON shape with no `schemaVersion`; breaks silently on field renames.

**New (`08-VISION §3` P7 + `09-AS-IS §L0`):**
- Save: one **MessagePack event** per command (~hundreds of bytes), append-only.
- Geometry: per-element / per-tier `glb` chunks (Draco + Meshopt + KTX2) baked by the bake worker.
- Storage: Postgres for the event log + R2 (or S3) for chunks. RLS on both.
- Cost: `O(Δ)` per save; **< 10 ms** target for one event append.
- Portable file: **`.pryzm` ZIP** = `manifest.json` + `events/*.evt.bin` + `chunks/*.glb` + `thumbnails/` + `signatures/`. USDZ/OPC layout. Same chunks as the cloud store; no second format.
- Versioning: `schemaVersion` in manifest; in-place migrations live forever in `packages/file-format/migrations/`.
- CI gate: `tests/persistence/no-full-snapshot.test.ts` blocks any `JSON.stringify` of full project state.

**Why it matters:** the entire persistence contract (Contract 09 Parts A–D) is built around a JSON-snapshot model that is `O(project)` to write, single-threaded to read, and unstreamed. NEW_ARCH's load targets (< 800 ms small / < 1.5 s medium / < 3 s large) cannot be hit with that model.

**Open question (see §6.2):** event-log compaction policy, schema-migration of event payloads (`Wall.v1` → `Wall.v2`), bake-worker idempotency, and R2/Postgres consistency window are all unspecified. These need a single ADR (call it ADR-013) before S08.

**Do today:**
- No new code may call `JSON.stringify` on a project snapshot. (Lint gate in S01.)
- Save path is `commandBus.dispatch(event) → eventLog.append(event)`.
- Loading is tier-streamed via `packages/persistence-client/loader.ts`.

**Migration:** `ProjectSerializer.ts` (1,894 LOC) is replaced **S04–S08**, deleted **S61**. `ImportProjectCommand.ts` (1,720 LOC) is replaced **S05–S08**, deleted **S61**. PRYZM 1 JSON snapshots open via the one-time importer at `packages/file-format/migrations/v0-pryzm1-to-v1.ts`; nothing in PRYZM 2 ever writes the old format.

---

### §3.5 THREE locality: scattered vs scene-committer-only

**Old (Contracts `01 §3`, `02 §3`, `06 §3.4`, `11`, `13`, `15`, `16`):**
- Builders directly instantiate `THREE.Mesh`, attach to `scene` via `scene.add(...)`.
- `WallFragmentBuilder` constructor takes `scene: THREE.Scene` (`WallFragmentBuilder.ts:451`).
- `userData` keys are mandated *on every root mesh* by Contract 02 §3 — meaning the rest of the system reads from the THREE scene graph.
- `SelectionManager.applyHighlight()` (Contract 06 Part B) constructs `BoxGeometry` / `ExtrudeGeometry` directly inside the selection layer.

**New (`08-VISION §3` P1 + P2):**
- `packages/geometry-kernel/` does **not import THREE**. Pure functions of shape `(dto, joinData, worldY) → BufferGeometryDescriptor`.
- A single class — `packages/scene-committer/SceneCommitter.ts` — owns every `new THREE.Mesh`, every `scene.add`, every material instantiation.
- Per-element committers (`plugins/<elem>/committer.ts`) implement a narrow `PrimitiveCommitter<TStore>` interface.
- `userData` writes are **committer-internal only**; nothing else may read the scene graph for state — read the L1 store / L3 projection.
- CI gate: `eslint-plugin-boundaries` blocks `import * as THREE` outside `packages/scene-committer/` and `plugins/*/committer.ts`. `forbiddenDependencies` blocks THREE in `packages/geometry-kernel/`.

**Why it matters:** without this, the kernel cannot run in Node (`apps/bake-worker/`, `@pryzm/headless`). Differentiators **D7 (headless)**, **D5 (observability)**, and the load-time targets are all impossible.

**Do today:**
- New code in `packages/geometry-kernel/` may not import THREE. (Forbidden-deps lint from S01.)
- THREE construction lives in `packages/scene-committer/` or `plugins/*/committer.ts`. Nowhere else.
- Selection highlight geometry: build the descriptor in the kernel; commit in the committer.

**Migration:** wall producer/committer split lands **S07–S10** (`phases/PHASE-1B`). Slab S09–S10. Roof S11–S12. Curtain wall S13–S15. All others through Phase 2A. Legacy `WallFragmentBuilder.ts` deleted **S61**.

---

### §3.6 AI surface: Phase-4 gated vs L7.5 day-one

**Old (Contract `04 §1` + §3):**
- AI is a **Phase 4** deliverable, gated on Phase 1 (Stores), Phase 2 (Topology), Phase 3 (WorldModel) being complete first.
- `WorldModel` is itself a Phase-3 deliverable that reads from frozen Immer stores.
- The `MODIFICATION DECLARATION` template (Contract 04 §1) and the `MODIFICATION PROPOSAL` template (Contract 04 §5) are mandated as hard PR gates.
- Contract 04 §13 self-supremacy clause (already void per §2.1).

**New (`08-VISION §3` P-implicit + `09-AS-IS §L7.5` + `08-VISION §5` D2):**
- AI is **L7.5** — a first-class architectural layer that ships from **day 1**, not month 18.
- AI mutations enter through L2 commands (same Immer-patch / event-log pipeline as human edits) and pass through an **approval queue** in the inspector before commit.
- `WorldModel` is an **L7.5 AI-plugin projection** that reads the event log directly. Not a Phase-3 store.
- The `MODIFICATION DECLARATION` and `MODIFICATION PROPOSAL` templates *may* survive as an **optional PR convention**. They are no longer hard gates.
- D2: "AI as a first-class architectural layer, not a chat sidebar" — the named lead-on vs Forma/Qonic/Motif/Pascal.

**Why it matters:** the existing 31-file AI subsystem (`FloorPlanAIFactory`, `GenerativeDesignAdvisor`, `RoomAIAssistant`, `VoiceSpatialInterface`, `RuleEngine`, `SemanticQueryEngine`, `PdfToBimConstraints`, `DoorGapInpainter`, `WallCandidateScorer`, `WallIntersectionResolver`, …) is the **moat** PRYZM has. Gating it behind three other phases (per Contract 04) would forfeit that moat for 18 months. The whole reason for L7.5 is to refuse that gating.

**Open question (see §6.4):** the AI approval queue's interaction with CRDT ordering, prompt/version pinning for reproducibility, cost guardrails, and headless AI access for `@pryzm/headless` are all unspecified. These need an ADR (call it ADR-014) before S30.

**Do today:**
- Do not gate AI work behind Phase 2/3.
- AI mutations are commands; they go through `commandBus.dispatch(event)` like any other command.
- AI plugins live under `plugins/ai-*` with manifest-declared permissions.
- The `MODIFICATION DECLARATION` template is optional in PR descriptions, not mandatory.

**Migration:** AI host (`packages/ai-host/`) and AI worker (`apps/ai-worker/`) scaffolded **S04**. First public AI workflow plugin **S08** (per `phases/PHASE-1A`). Approval queue UI **S20**. Public AI API at `api.pryzm.com` **S48** (M24 Beta).

---

### §3.7 rAF ownership: 58 owners vs single FrameScheduler

**Old (implicit across `01`, `10`, `11`, `12`):**
- Every subsystem owns its own `requestAnimationFrame` loop.
- TRAA / SSGI run continuously even when the camera is still.
- Idle CPU is 18%.

**New (`08-VISION §3` P3 + `09-AS-IS §L5`):**
- `packages/frame-scheduler/FrameScheduler.ts` is the **sole owner** of `requestAnimationFrame`.
- Every other module that wants a frame calls `scheduler.requestFrame(reason: string)`.
- The render pipeline reads a dirty-flag set; if no flags are set, the frame is skipped.
- Idle CPU **0 fps** (target < 2%); interaction **60 fps**; post-motion accumulation gets a bounded 30-frame budget.
- CI gate: custom ESLint rule blocks `requestAnimationFrame(` outside `packages/frame-scheduler/`.

**Why it matters:** continuous render at idle is the #1 reason laptops get hot using PRYZM 1. The bench gate `apps/bench/idle-cpu.ts` enforces < 2% — non-negotiable for GA.

**Do today:** no new `requestAnimationFrame(` outside the frame scheduler. Lint gate from S01 (warning-only initially, error from S03).

**Migration:** `UnifiedFrameLoop.ts` (402 LOC) replaced by `FrameScheduler` in **S03**. The 58 known rAF owners are migrated through Phase 1A–1D; the lint goes from warning to error in **S04**. `BatchCoordinator.ts` (360 LOC) absorbed into FrameScheduler in S03.

---

### §3.8 Service wiring: window globals vs ServiceRegistry

**Old (no contract — but ambient code reality):**
- 2,078 `(window as any).foo` cast sites in 325 files.
- Cross-module coordination via globals: `(window as any).pryzmCanvas`, `(window as any).doorTool`, `(window as any).bimService`, etc.
- Contract 13 Part A explicitly cites `(window as any).doorTool = doorTool` in `initTools.ts` as a **fix**.

**New (`08-VISION §3` P6):**
- A typed `ServiceRegistry` is constructed at boot in `apps/editor/src/bootstrap.ts` and passed explicitly into the layers that need it.
- CI gate: custom ESLint rule blocks `(window as any).` outside two transitional files (`legacy/window-shim.ts`, deleted at Sprint 61), with sprint-level progress targets moving the count from 2,078 → 0.

**Why it matters:** the cast sites are the physical embodiment of the broken layer model. Every cast is a layer violation hidden as a runtime lookup. They cannot be type-checked, refactored, traced, or sandboxed — and they are the reason the plugin SDK (D4) is impossible until the count reaches zero.

**Do today:**
- New code may not introduce `(window as any).foo`. Lint gate from S01.
- Use the `ServiceRegistry` parameter passed into your module.
- If you genuinely need a global, add it to `legacy/window-shim.ts` with a TODO and a migration ticket.

**Migration:** the 2,078 → 0 burndown is tracked per sprint. `legacy/window-shim.ts` is deleted in **S61**. Until then the file is a budget, not a permission.

---

### §3.9 OBC role: ambient framework vs single import plugin

**Old (Contracts `01`, `09 Part A` (Phase 5), `10`, `11`):**
- `@thatopen/components` (OBC) is everywhere — 91 import sites in core.
- OBC owns the renderer in WebGL mode (`RenderPipelineManager.ts:34–35`).
- Phase 5 (Contract 09 Part A §2) is built around `world.renderer` (OBC) being the canonical scene owner, with PRYZM as an overlay canvas on top.
- Contract 11 Part A leans on `OBC.Clipper` and `OBC.EdgeProjector` for section/elevation views.

**New (`09-AS-IS §L6`):**
- OBC is **demoted to `plugins/ifc-import/` only** — the viewer build excludes OBC entirely.
- Renderer is owned by `packages/renderer/` directly.
- Section/elevation views reimplement edge extraction natively in PRYZM (no OBC dependency).
- Bundle gate: removing OBC and `web-ifc` from the editor bundle is what gets `< 1.8 MB gzip initial`.

**Why it matters:** OBC's static `web-ifc` import is what blocks Contract 18 Step 3 (deferring the 3.4 MB IFC chunk). Until OBC is demoted, every editor user pays for IFC even if they never open one.

**Do today:**
- No new code may import OBC outside `plugins/ifc-import/`.
- For section/elevation work, do not call `OBC.Clipper` or `OBC.EdgeProjector` — write the PRYZM-native equivalents in `packages/geometry-kernel/edge-projection.ts` (slated S29–S31).

**Migration:** OBC import sites burn down through Phase 1 (renderer extraction in **S15–S17**), Phase 2A (drawing engine extraction **S29–S33**), and Phase 2D / 3 (final IFC isolation). OBC removed from editor bundle by **S55**. `web-ifc` lazy-chunked at the same time.

---

### §3.10 Visibility-Intent: "preserved verbatim" — but spread across L4/L5/L7

**Old (Contract `12-VISIBILITY-INTENT-SYSTEM-CONTRACT.md`):**
- Cut/Beyond/Hidden/Projection rule matrix with override layers.
- `StyleResolutionCache` is a hot-path cache.
- Today: touches THREE materials, scene flags, and `userData` — mixed concerns across what NEW_ARCH calls L4/L5/L7.

**New (`09-AS-IS §L7` line 121):**
- "11-wave Visibility-Intent UI … **Preserved verbatim** — refactored into smaller classes but logic untouched. Visual diff every frame in CI."

**Conflict:** "preserved verbatim" while moving across the L4/L5/L7 boundary is a category error. Today's algorithm touches THREE; P1 forbids that in L4. The algorithm cannot be both "preserved verbatim" *and* moved into the pure kernel. The split must be:
- **Cut/Beyond classification** = pure geometry math → `packages/geometry-kernel/visibility/`.
- **Style resolution** (cut linework width, hatch, hidden-line dash) = data → `packages/stores/StyleStore.ts`.
- **Material swap / edge style** = side-effect → `plugins/<elem>/committer.ts`.
- **Per-pass dirty flags** = renderer concern → `packages/renderer/`.

**Open question (see §6.5):** the actual classification is a Phase 2A ADR (call it ADR-015). Contract 12 stays intact as the reference rule matrix; the *placement* of those rules into the new layer model is the open work.

**Do today:** treat Contract 12's rules as the *what*. The *where* is decided per ADR-015 before any visibility-intent code is touched in S29.

---

### §3.11 Drawing engine: Canvas2D rasteriser vs CAD-grade vector pipeline

**Old (Contracts `10 Part C`, `11 Part B`):**
- Canvas2D-only plan view; WebGPU is for the 3D viewport.
- "Hairlines and strokes" sized in screen pixels.
- Hidden-line *quality* not classified.
- Section hatch (poche fill) and far clip explicitly missing (Contract 11 Part B §6).

**New (`09-AS-IS §5` D8 + `08-VISION §5` D8):**
- "Desktop-CAD-class documentation pipeline — plan, section, sheet, schedule, with view definitions and visibility-intent. **Matches Revit. Beats Pascal, Motif, Qonic.**"

**Conflict:** matching Revit at the documentation level (D8) is not achievable with a Canvas2D rasteriser. Real CAD documentation requires anti-aliased vector primitives with consistent stroke ordering, dash phase preservation, hatch alignment, and PDF/SVG/DXF-faithful export. None of that comes from Canvas2D for free.

**Open question (see §6.6):** the drawing-engine architecture for Phase 2B / 3 needs an ADR (call it ADR-016) before S29. Likely answer: a vector-primitive layer (`packages/drawing-primitives/`) feeds three back-ends — Canvas2D for screen, SVG for in-browser export, native PDF writer for high-fidelity print.

**Do today:** treat Contract 10 Part C and Contract 11 Part B as the *current* implementation, not the *target*. Don't extend Canvas2D-only assumptions in new code.

---

### §3.12 Type catalog & material library — scope inversion

**Old (Contract `17-ELEMENT-TYPES-AND-MATERIALS-CONTRACT.md` — 271 lines):**
- Material persistence to Supabase: "Future Work."
- Material inheritance from layers to the WebGPU resolver: "still planned."
- No model for type catalog inheritance, type vs instance parameters, system families vs loadable families.

**New (`08-VISION §5` D10 + `09-AS-IS §L1`):**
- D10: "In-editor parametric component authoring (Revit-Family-Editor analogue) sharable via plugin marketplace — **Beats all four**."
- L1 stores carry Zod-validated types with typed IDs.

**Conflict:** Contract 17 is **the most under-invested document in the corpus**. D10 cannot be delivered without a real type-catalog model (system families, loadable families, type vs instance parameters, parameter inheritance, IFC mapping per type). The contract needs to **at least triple in size** before Phase 1C ships any element family against it.

**Do today:** do not write code against the current 271-line type-catalog contract. Wait for the rewrite (slated **before S11**).

**Open question (see §6.7):** the rewrite is owned by an open ADR (call it ADR-017). Without it, every element family added in Phase 1C bakes in a thin model that everything else has to work around forever.

---

## §4 — Per-contract supersession map

One row per contract. Read across: status, what's voided, what survives, the §3 conflict numbers it triggers, and the sprint that retires the obsolete code.

| # | Contract | Status | Voided clauses | Surviving clauses | §3 conflicts | Retire by |
|---|---|---|---|---|---|---|
| 00 | `00-MASTER-ARCHITECTURE.md` | 🟡 KEEP AS CODE MAP | The "6-layer" diagram and any "scene at the bottom" assertion. | The cross-reference index of which subsystem lives where in the *current* code. | §3.1 | Refresh on every Phase boundary. Final refresh **S62**. |
| 01 | `01-BIM-ENGINE-CORE-CONTRACT.md` | 🔴 SUPERSEDED — REWRITE IN FULL | §1.1 (6-layer model with THREE at the bottom); §2.4 (`produceWithPatches` on stores as mandatory); §2.6 (`StoreEventBus` buffered/queued flush — events ARE the wire); §2.9 (dual-store hosted-element pattern); §3 (builder-mutates-scene pipeline). | §2.7 (inversion principle: stores never call builders directly — re-stated as "event log → projection → committer"). | §3.1, §3.2, §3.5 | Replacement contract drafted **S04**. Old file kept verbatim with banner; deleted **S62**. |
| 02 | `02-BIM-SPATIAL-PROJECTION-CONTRACT.md` | 🟠 PARTIALLY SUPERSEDED — RELOCATE TO L3 | §2.1 (`BimManager` as in-memory spatial authority); §3 (mandatory `userData` keys on every `Object3D`); §4 (`ElementRegistry` as a globally-shared `Map`). | The *concept* of cached spatial projections (now an L3 projection module); spatial-query API surface (point-in-polygon, AABB, kNN) — moves into the L3 module unchanged. | §3.1, §3.5 | L3 spatial projection module ships **S05–S08**. Legacy `BimManager` deleted **S61**. |
| 03 | `03-BIM-SEMANTIC-MODEL-CONTRACT.md` | 🟢 SURVIVES (light edits) | None core — the Host/Insert relationship graph stands. | All of it. Surface change: typed IDs come from Zod schemas in `packages/schemas/` (per `09-AS-IS §L1`); `Math.random()` / `Date.now()` ID generation forbidden. | §3.1 (renaming only) | Edit in place, **S03**. |
| 04 | `04-BIM-AI-MODIFICATION-PROTOCOL.md` | 🔴 SUPERSEDED — REPLACE | §1 phase gating ("AI requires Phase 1–3 first"); §3 `WorldModel`-as-Phase-3-store; §5 12-section `MODIFICATION PROPOSAL` template as hard gate; **§13 self-supremacy clause (also see §2.1 above)**. | The *spirit* of structured AI changes with explicit before/after, blast-radius, and rollback. The `MODIFICATION PROPOSAL` template MAY survive as an **optional** PR convention (not a hard gate). | §3.6 | Replacement L7.5 contract drafted **S04**; AI host scaffolding **S04**; first plugin **S08**. Old file kept with banner; deleted **S62**. |
| 05 | `05-UI-ARCHITECTURE-AND-PLATFORM-SHELL-CONTRACT.md` | 🟢 SURVIVES (light edits) | Any clause that asserts a particular framework (vanilla TS confirmed by `08-VISION` and `09-AS-IS §L7` — Path A). | All component-model and panel-host rules, refactored into per-element vanilla classes (~200–400 LOC each) + `PanelHost` orchestrator (~200 LOC). | §3.8 | Edit in place across **S55–S60** (UI decomposition). |
| 06 | `06-INPUT-SELECTION-AND-ORCHESTRATION-CONTRACT.md` | 🟠 PARTIALLY SUPERSEDED — SPLIT | Part A §3 `ContextualEditBar` monolith with single keydown listener; Part B §3.4 `SelectionManager.applyHighlight()` instantiating geometry directly; Part C §4 builder responsibility table mandating `userData` keys. | `SelectionBus` as a single shared event channel — promoted to an **L5 service** registered in `ServiceRegistry`. Selection semantics (single/multi/box-select rules, hover vs select) — kept verbatim. | §3.5, §3.8 | Selection bus extracted **S20**. Per-plugin keyboard bindings **S55–S60**. |
| 07 | `07-SECURITY-AND-COLLABORATION-CONTRACT.md` | 🟠 BISECTED — SECURITY SURVIVES, COLLAB SUPERSEDED | Part B §3.4 (Socket.io + `cmd.serialize()` JSON wire); Part B §3.5 (LWW + "CRDT/OT explicitly out of scope"); Part B §3.6 (24h/500-row Postgres TTL); the `RemoteCommandDispatcher` round-trip. | Part A §1 JWT auth; Part A §2 Postgres RLS; Part A §4 rate limiting; Part A §5 CSP headers; Part A §6 Stripe billing; Part A §7 Cloudflare Worker AI relay (`/api/ai-proxy`). | §3.3 | Yjs server scaffolded **S05**. Security primitives unchanged. Replacement collab contract drafted **S08**. |
| 08 | `08-CAMERA-SYSTEM-CONTRACT.md` | 🟢 SURVIVES (light edits) | None — camera math is independent of layer model. | All of it. Surface change: must call `scheduler.requestFrame('camera')` instead of owning its own rAF. | §3.7 | Edit in place, **S03**. |
| 09 | `09-PERSISTENCE-CONTRACT.md` | 🔴 SUPERSEDED — REWRITE | Part A (full-snapshot save); Part B (Supabase BLOB column for the snapshot); Part C (snapshot-load flow); Phase-5 dual-canvas WebGPU framing where it asserts OBC owns the renderer. | Part D (project isolation rules — `ProjectScopeRegistry`, 48 scopes); Postgres RLS rules; Supabase RPC patterns. | §3.4, §3.5, §3.9 | Persistence client (`packages/persistence-client/`) ships **S04–S08**. Bake worker **S08**. `.pryzm` ZIP v1 **S22** (M12 Alpha). `ProjectSerializer.ts` deleted **S61**. |
| 10 | `10-DUAL-CANVAS-SPLIT-VIEW-AND-PLAN-VIEW-CONTRACT.md` | 🔴 SUPERSEDED — REWRITE | Part A (dual-canvas Phase-5 model with OBC owning the WebGL scene); any clause that asserts OBC ownership of the renderer. | Part B (Split View pane semantics, view-type dropdown, secondary-pane rules); Part C (Canvas2D plan view structure — until vector pipeline lands); Part D (`PlanToolHandler` modularization). | §3.5, §3.9, §3.11 | Renderer extraction from OBC **S15–S17**. Vector drawing pipeline **S29–S33**. Old dual-canvas Phase-5 path deleted **S55**. |
| 11 | `11-SECTION-ELEVATION-AND-DRAWING-ENGINE-CONTRACT.md` | 🟠 PARTIALLY SUPERSEDED — REIMPLEMENT AS L4 PLUGIN | Heavy OBC dependency (`TechnicalDrawings.create(world)`, OBC `Clipper`, OBC `EdgeProjector`); THREE-layer constants (`DOCUMENTATION_LAYER`, `PLAN_SYMBOL_LAYER`, `BIM_LAYER`) used outside the committer; module-level singleton `ViewTechnicalDrawingCache`. | ISO-13567 layer-mapping rules; semantic projection contract (which elements project to which view types); the *output shape* (vector edges + classified symbols + ISO layer assignment). | §3.5, §3.9, §3.11 | Native edge projection in `packages/geometry-kernel/edge-projection.ts` **S29–S31**. View-keyed L3 projection cache **S30**. OBC removal from drawing engine **S33**. |
| 12 | `12-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` | 🟢 SURVIVES (rule matrix verbatim) — *but the placement is open* | None of the *rules*. The *implementation locations* are not yet decided (see §3.10). | All Cut/Beyond/Hidden/Projection rules; override-layer precedence; `StyleResolutionCache` as a concept (re-implemented per ADR-015). | §3.5, §3.10 | ADR-015 owns the L4/L5/L7 split — required before **S29**. |
| 13 | `13-ELEMENT-CREATION-CONTRACT.md` | 🟠 PARTIALLY SUPERSEDED — REWRITE HANDLER-BY-HANDLER DURING PHASE 2 | Every `Create*Command` built on top of `CommandManager` + Immer `produce()`; any clause invoking `wallStore.add()`/`doorStore.add()` etc. directly from a Command; any builder code that mutates `THREE.*` from a Command. | Element parameter schemas (per type: Wall / Slab / Column / Beam / Door / Window / …); validation tables and value ranges; UX flows for placement (click-click for walls, polygon for slabs, point-and-rotate for furniture, …); snap targets and pre-placement preview semantics. | §3.2, §3.5 | Handler rewrites land per element family in Phase 2A (doors/windows S11; columns/beams S12; roofs S11–S12; curtain walls S13–S15; stairs/handrails/ceilings S14; rooms S25). |
| 14 | `14-EDITING-TOOLS-GRID-AND-SNAP-CONTRACT.md` | 🟢 SURVIVES (light edits) | None core. Grid renderer must call `scheduler.requestFrame('grid')`. | All snap surfaces (perpendicular, midpoint, intersection, extension, parallel); grid model; tool state machines (Move / Copy / Align / Rotate). | §3.7, §3.8 | Edit in place across **S08–S14**. |
| 15 | `15-IMPORT-CONTRACT.md` | 🟢 SURVIVES — but moves to plugin | None of the *rules*. The *location* moves: import code lives under `plugins/ifc-import/` and `plugins/dwg-import/`. | All IFC4 mapping rules; DWG/DXF entity-to-PRYZM-element mapping; Import Manager UX. | §3.9 | Plugin extraction lands **S55** (with OBC removal). IFC4 round-trip parity targeted **M36 GA** (no bSI cert in scope; see `09-AS-IS §C` matrix). |
| 16 | `16-SHEET-EDITOR-AND-EXPORT-CONTRACT.md` | 🟢 SURVIVES — but moves to plugin | The 2,919-LOC monolithic `SheetEditorPanel.ts` decomposition is structural, not contractual. | All sheet model rules; title-block model; viewport rules; export targets (PDF/PNG/DXF). | §3.8 | Decomposition + plugin extraction **S37–S42**. |
| 17 | `17-ELEMENT-TYPES-AND-MATERIALS-CONTRACT.md` | 🟢 SURVIVES nominally — **scope inversion required** (see §3.12) | The *narrowness* — Material persistence "Future Work"; layer→WebGPU resolver "still planned"; type-catalog inheritance absent. | The 271 lines that are present (basic type/material model). | §3.12 | Rewrite required **before S11** under ADR-017. Without the rewrite, every element family in Phase 1C bakes in a thin model. |
| 18 | `18-BUNDLE-CHUNK-SPLITTING-CONTRACT.md` | 🟢 SURVIVES (delivery story changes) | Step-3 (`web-ifc` defer) status as "blocked" — the *blocker* is OBC's static import of web-ifc, not the contract. | All chunk-splitting rules; pre-load / on-demand / lazy / never categories; Cesium lazy load. | §3.9 | OBC removed from editor bundle **S55** unblocks Step 3. < 1.8 MB gzip target **M36 GA**. |

### §4.1 Contracts referenced from contract supersession banners but not above

For completeness, the supersession banners on Contracts 01, 02, 04, 06, 07, 09, 11, 13 each name §3.x sections of *this* document. The mapping is:

| Banner says "see §3.x" | Means §3.x in this document |
|---|---|
| Contract 01 banner — §3.1 | §3.1 (layer model) |
| Contract 01 banner — §3.2 | §3.2 (mutation path) |
| Contract 02 banner — §3.1 | §3.1 (layer model) |
| Contract 02 banner — §3.2 | §3.2 (mutation path) |
| Contract 04 banner — §2 | §2 (binding hierarchy + §2.1 self-supremacy void) |
| Contract 04 banner — §3.6 | §3.6 (AI surface) |
| Contract 06 banner — §4 | §4 (per-contract row 06) |
| Contract 07 banner — §3.3 | §3.3 (collaboration) |
| Contract 07 banner — §4 | §4 (per-contract row 07) |
| Contract 09 banner — §3.4 | §3.4 (persistence) |
| Contract 11 banner — §4 | §4 (per-contract row 11) |
| Contract 11 banner — §5 | §5 (migration roadmap) |
| Contract 13 banner — §3.2 | §3.2 (mutation path) |
| Contract 13 banner — §4 | §4 (per-contract row 13) |

All back-references resolve.

---

## §5 — Migration roadmap (when each obsolete clause is retired)

The sprint IDs are taken from `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and the per-phase docs in `phases/`. This section is a forwarding table to those docs; it does not duplicate their content.

### §5.1 Sprint-ordered retirement

| Sprint(s) | Milestone | What gets enforced or replaced | Conflicts retired |
|---|---|---|---|
| **S00** | Pre-S01 | All 12 ADRs ratified (per `05-IMPLEMENTATION-PLAN.md §17`). Without this, the wire format is undecided. | (foundation for §3.2, §3.3) |
| **S01** | Phase 1A start | Eight CI gates (P1–P8) installed in **warning-only** mode. Boundaries lint, forbidden-deps lint, no-rAF lint, affected-stores lint, no-window-any lint, OTel-span coverage, no-full-snapshot test, bundle-size gate. | Foundation for all of §3. |
| **S03** | Phase 1A | Lint gates flip to **error**. `FrameScheduler` replaces `UnifiedFrameLoop` and absorbs `BatchCoordinator`. The 22 commands missing `affectedStores` are converted. | §3.7, §3.2 (partial) |
| **S04** | Phase 1A | `packages/persistence-client/` scaffolded; replacement contracts for 01, 04, 09 drafted; AI host scaffolded. | §3.2, §3.4, §3.6 (start) |
| **S05–S08** | Phase 1A | Yjs sync server scaffolded; bake worker; spatial projection L3 module replaces `BimManager`. Replacement collab contract drafted. | §3.2, §3.3, §3.4, §3.5 |
| **S07–S10** | Phase 1B | Wall producer/committer split. First fully-pure kernel module. | §3.5 |
| **S08** | Phase 1A | First L7.5 AI plugin ships against the new event-log surface. | §3.6 |
| **S09–S15** | Phase 1B/1C | Slab, roof, curtain wall producer/committer splits. | §3.5 |
| **S15–S17** | Phase 1C | Renderer extracted from OBC into `packages/renderer/`. Phase-5 dual-canvas path is deprecated. | §3.5, §3.9 |
| **S20** | Phase 1D | Selection bus extracted as L5 service. AI approval queue UI ships. `EngineBootstrap.ts` and `initUI.ts` split (delete in S61/S62). | §3.6, §3.8 |
| **S22** | M12 Alpha | `.pryzm` ZIP v1 ships. Single-user with shared cursors. **LWW remains** until S48 (per `phases/PHASE-1D`). | §3.4 (file format), §3.3 (interim) |
| **S25** | Phase 2A | Rooms (single-level only). Multi-level rooms deferred to Phase 3. | (related to §3.12) |
| **S29–S33** | Phase 2B | Native edge projection. Plan view rebuilt. ADR-015 (visibility-intent placement), ADR-016 (drawing-engine architecture) ratified. | §3.10, §3.11 |
| **S33** | Phase 2B | OBC fully removed from drawing engine. | §3.9 |
| **S37–S42** | Phase 2C | Sheet editor decomposed and lifted to plugin. | §3.8 |
| **S48** | M24 Beta | Yjs CRDT replaces LWW. Public WS API. Soft locks with TTL. | §3.3 |
| **S55** | Phase 3 | OBC removed from editor bundle entirely. `web-ifc` lazy-chunked. Bundle-size gate enforces < 1.8 MB gzip. | §3.9, §3.5 |
| **S55–S60** | Phase 3 | UI decomposition: `PropertyPanel.ts`, `PropertyInspector.ts`, per-plugin keyboard bindings. `(window as any)` count → near-zero. | §3.8 |
| **S61** | Phase 3 | **Legacy delete sprint.** `EngineBootstrap.ts`, `ProjectSerializer.ts`, `ImportProjectCommand.ts`, `CommandManager.ts`, `WallFragmentBuilder.ts`, `SlabFragmentBuilder.ts`, `legacy/window-shim.ts` deleted. | All §3 (cleanup) |
| **S62** | Phase 3 | `initUI.ts` deleted. Old contract files (01, 04, 09, 10) removed from repo. Replacement contracts become canonical. | All §3 (final) |
| **S64** | Phase 3 | Plugin marketplace ships (likely scope-cut — see `08-VISION` non-goals matrix discussion in `CRITICAL-REVIEW-2026-04-27.md`). | (D4 milestone) |
| **S72** | M36 GA | All bench gates green. IFC4 round-trip parity (no bSI cert). | All §3 fully retired. |

### §5.2 What "retire" actually means

For a §3 conflict, "retired" means three things in sequence:
1. **Lint/test gate** at error-level for the violating pattern.
2. **Replacement code** shipped behind a feature flag or in a parallel module.
3. **Old code deleted**, with the supersession banner staying on the contract file as historical record.

Skipping step 1 or 2 produces the symptom NEW_ARCH was written to prevent — old patterns silently re-emerging in new code.

### §5.3 Risk: "delete in one sprint" (S61)

The current plan lumps a great deal of legacy deletion into S61. The recommendation in `CRITICAL-REVIEW-2026-04-27.md §D6` is to stage:
- **S55–S60**: dual-run new + old behind a feature flag.
- **S61**: flip the flag default.
- **S62**: delete the old code.

Treat the S61 entry above as "flag flip + earliest-possible delete," not "all deletes happen in this sprint."

---

## §6 — Open contradictions *within* NEW_ARCH itself

These are not conflicts between contracts and NEW_ARCH (those are §3). These are places where two NEW_ARCH documents disagree, or where one document asserts something the rest cannot deliver. Each one needs a ratified ADR before the relevant sprint.

### §6.1 Wire format: "MessagePack event log" vs "Yjs CRDT"

- `08-VISION §3` P4: "MessagePack-encoded events with ULIDs … are simultaneously the undo log, the persistence event log, the sync wire format and the audit trail."
- `09-AS-IS §L3`: "Yjs CRDT with conflict-free merge."

These are not the same byte stream. Yjs has its own update encoding (`Y.encodeStateAsUpdate` / `Y.applyUpdate`).

**Required ADR (ADR-002):** define the bridge. Most likely answer: handlers emit Immer patches that an L3 translator turns into Y.Doc mutations on the way out, and Y.Doc updates back into Immer patches on the way in. The patch stream is the canonical undo/audit log; the Y.Doc update stream is the canonical sync-wire/CRDT layer; they are kept in sync by a single translator owned by L3.

**Until ADR-002 is ratified:** Phase 1 ships the patch/event-log path with LWW. Phase 2D introduces the translator and Y.Doc state. **Do not write code that assumes both paths are the same bytes.**

### §6.2 Persistence — undefined operational semantics

- Compaction policy for an append-only log.
- Schema migration of event payloads (`Wall.v1` → `Wall.v2`).
- Bake-worker idempotency / partial-failure recovery.
- R2 ↔ Postgres consistency window.

**Required ADR (ADR-013):** before S08.

### §6.3 Solo founder + Replit Agent capacity vs scope

`08-VISION §6` lists 17 bench gates plus 8 CI gates plus marketplace plus IFC plus headless plus AI layer plus sync server plus bake worker plus OTel pipeline plus self-host. `10-MASTER` is calibrated for solo + agent; `07-EXECUTION-PLAYBOOK` was calibrated for 4 → 11 FTE. The capacity model is missing.

**Required ADR (ADR-018):** named cut list for what gets dropped at velocity slip of 20% / 40% / 60%. See `CRITICAL-REVIEW-2026-04-27.md §A4` and §E4 for context.

### §6.4 AI layer (L7.5) — undefined operational semantics

- Approval queue interaction with CRDT ordering.
- Prompt/version pinning for reproducibility.
- Rate limit / quota / cost accounting per actor.
- Headless `@pryzm/headless` AI access (cannot embed LLM keys).
- Boundaries-lint rule for L7.5: may it import L4 directly, or only via L2?

**Required ADR (ADR-014):** before S30.

### §6.5 Visibility-Intent — "preserved verbatim" placement

See §3.10. **Required ADR (ADR-015):** before S29.

### §6.6 Drawing-engine architecture for D8 parity

See §3.11. **Required ADR (ADR-016):** before S29. Vector primitives → three back-ends (Canvas2D/SVG/PDF) is a likely shape.

### §6.7 Type catalog scope

See §3.12. **Required ADR (ADR-017):** before S11. Without it, every element family in Phase 1C bakes in a thin model.

### §6.8 Multi-user soft-lock semantics

`09-AS-IS §L3` references "Per-element soft lock with TTL; visible in awareness." But there is no spec for: who can grant a lock; UX on lock-expiry mid-edit; conflict when two users grab within milliseconds; whether a lock blocks the AI approval queue; whether a guest editor can lock a structural wall.

**Required ADR (ADR-019):** before S48 (M24 Beta).

### §6.9 Geometry kernel robustness budget

`08-VISION §6` mentions the 10,000-walls bench but does not define the geometric robustness contract (coordinate range, minimum feature size, snapping at the kernel level, behaviour on coplanar / degenerate / non-manifold input). `three-bvh-csg` is the named CSG library; its robustness limits are real.

**Required ADR (ADR-020):** before S07 (start of Phase 1B wall producer/committer).

### §6.10 Customer migration story (PRYZM 1 → PRYZM 2)

Not in the plan. See `CRITICAL-REVIEW-2026-04-27.md §D3`. **Required customer-migration contract:** before any PRYZM 1 user is told about PRYZM 2.

### §6.11 Enterprise security & data-residency for C3

`08-VISION §8` names C3 (large enterprise / firm IT). The corpus has no SSO / SCIM / audit-log streaming / tenant-scoped keys / RLS-per-project / OAuth scopes / MFA. Contract 07 Part A still leaks Supabase service-role-key behaviour.

**Required ADR (ADR-021) + threat model:** before any C3 sales conversation; latest before S40 if C3 is a Beta target.

---

## §7 — Maintenance

### §7.1 When to update this document

Add a row to §3 or §4 (or both) **in the same PR that introduces or discovers** the conflict. Do not let conflicts accumulate uncatalogued — the whole reason this document exists is to prevent that accumulation.

### §7.2 Where new conflicts come from

Three sources, in expected frequency order:
1. **A NEW_ARCH revision** that overrules a previously-surviving contract clause. (Highest source.)
2. **A new contract being drafted** that turns out to overlap an existing one or contradict NEW_ARCH.
3. **A previously-ratified ADR getting amended** (e.g. ADR-002 changes the wire format).

In all three cases: update §3 (if it's a new conflict class) or §4 (if it's a new contract row), and the relevant per-file supersession banner.

### §7.3 When a conflict is *closed*

A conflict is closed when:
1. The lint/test gate is at error-level.
2. The replacement code is shipped (not behind a flag).
3. The old code is deleted from `main`.

When closed, mark the §4 row's "Retire by" column as **DONE (sprint <ID>)** and leave the row in place as historical record. Do not delete rows.

### §7.4 Owner

Architecture lead. PRs touching this document require architecture-lead approval. PRs touching contracts under `02-decisions/contracts/` require either an updated row here or an explicit "no new conflict introduced" assertion.

---

## §8 — Cross-references

- Contracts index, binding hierarchy, supersession status table: `../02-decisions/contracts/_README.md`
- Wave-2 consolidation log (37 → 19 contracts): `../02-decisions/contracts/_WAVE2_SUMMARY.md`
- Pre-NEW_ARCH consolidation rationale (historical): `../02-decisions/contracts/_AUDIT_AND_CONSOLIDATION_PLAN.md`
- 8 principles, 8 layers, 10 differentiators, NFR targets: `08-VISION.md`
- Layer-by-layer As-Is vs To-Be + competitive matrix: `09-AS-IS-VS-TO-BE.md`
- 36-month sprint plan: `10-MASTER-IMPLEMENTATION-PLAN-36M.md` and `phases/`
- Open ADR queue: `05-IMPLEMENTATION-PLAN.md §17`
- Critical review of the corpus: `CRITICAL-REVIEW-2026-04-27.md`

---

*End of conflict analysis.*
