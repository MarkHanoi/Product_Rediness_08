# PRYZM — Current-state Audit (Architectural Synthesis)

> Date: 2026-04-26
> Scope: identify the architectural patterns that block Forma/Qonic/Motif-class performance, collaboration, and maintainability.
> Style: brutal, citation-driven. No incremental excuses.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/` (`PHASE-1A` … `PHASE-1D`).
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: PRYZM 2 stays **vanilla TypeScript** for L7 (Presentation). There is **no React migration**. Layer count is **8** (L0 → L7.5; L7.5 = AI Operations). The L4 kernel is pure (no THREE, no DOM, no React). The only places `THREE` may be imported are `packages/scene-committer/` and `plugins/*/committer.ts`. See `08-VISION.md` §3 P1 / P2 / §10.
>
> **What in this doc is still authoritative**:
> - The six structural failure modes in the TL;DR — they are the precise problems the new architecture must solve.
> - All citation evidence (§1–§6) of today's coupling, monolith, render-loop sprawl, OBC ownership, command-system shape, and god-class boot. These are the *baselines* the PHASE-1 work is measured against.
> - The "What stays / what goes" verdict table — still the policy.
> - The "Cross-cutting rot" table.
>
> **What in this doc is SUPERSEDED**:
> - The "Person-week reality check" table (§Person-week reality check) and its 18–24-month estimate → superseded by the 36-month plan in `10-MASTER…` (Year 1 alpha, Year 2 beta, Year 3 GA), because the recount in `06` exposed ~5× the originally-assumed scope.
> - Any implicit assumption that the editor shell migrates to React → **superseded by the TypeScript Vanilla Decision**. L7 remains vanilla TS panels + canvas hosts; only the kernel/committer layering is rebuilt.
> - The 7-layer mental model implied here → superseded by the 8-layer model in `08-VISION.md` §4 (adds L7.5 AI Operations as a first-class layer).

---

## TL;DR

PRYZM works **functionally** but was assembled incrementally without a layered architecture. The result is six structural failure modes that no amount of patching can resolve. They must be replaced, not refactored:

1. **Geometry kernel is fused to the renderer** — primitives cannot run off the main thread or on a server.
2. **No streaming format** — projects round-trip as a single JSON blob.
3. **Render loop has no single owner** — 58 source files schedule their own animation frames.
4. **Persistence is monolithic** — one file = one project = one parse pass = no chunking.
5. **Command system is too granular and too coupled** — 264 commands, 105 third-party-render integrations, no clean transport for collaboration.
6. **Boot path is a 2,086-line god-class** — `EngineBootstrap.ts` orchestrates everything, blocking parallel init.

A new architecture is required for any of: <1s loads, real-time multi-user collab, server-side bake, web-worker geometry, plugin extensibility, predictable test surface.

---

## 1. Geometry kernel coupling

**Symptom**: Cannot bake geometry on the server. Cannot offload to a worker. Cannot test geometry in Node.

**Evidence**:
- `src/elements/walls/WallFragmentBuilder.ts` — 2,256 lines. Constructor takes `scene: THREE.Scene`. Calls `this.scene.add(group)` (line 451), `new THREE.MeshStandardMaterial(...)` (line 572), `new THREE.BoxGeometry(...)` (line 596), inline three-CSG miter prisms.
- `src/elements/slabs/SlabFragmentBuilder.ts` — 801 lines. Same pattern: `this.scene.add(root)` (line 238), inline triangulation, dispose loops.
- `src/elements/curtainwalls/CurtainWallBuilder.ts` — 1,044 lines. Same pattern.
- `src/elements/roofs/RoofFragmentBuilder.ts` — 164 lines, the *only* builder that calls a pure function (`RoofGeometryBuilder.generate(data)` line 128). The exception that proves the rule.

**Implication**: Geometry construction and scene mutation are the same code path. There is no intermediate representation (IR) that says *"here is a wall as buffer arrays + a material descriptor"* without a live `THREE.Scene` to mount it into.

---

## 2. Persistence is monolithic JSON

**Symptom**: Whole-project loads cap at the speed of `JSON.parse` + sequential builder calls. No chunked streaming possible.

**Evidence**:
- `src/core/persistence/ProjectSerializer.ts:834` — `return JSON.stringify(snapshot, null, 2)` (whole snapshot, pretty-printed).
- `src/core/persistence/ProjectSerializer.ts:845` — `JSON.parse(json)` (single pass, 30+ optional sections in order).
- `src/commands/project/ImportProjectCommand.ts:271–402` — strict serial restore: Levels (priority 10) → Grids (11) → Columns → Doors/Windows → Walls → Slabs → ... Each section is a `for` loop calling per-element sub-commands synchronously via `cmd.execute(ctx)`.
- No binary format. No per-element addressing. No range-request endpoints. No content-addressable storage. No CDN-friendly chunks.

**Implication**: Every project re-pays the full parse + rebuild cost on every load, on every device, every time. Forma streams chunks; PRYZM uploads/downloads the entire model.

---

## 3. Render loop has no single owner

**Symptom**: Demand-driven render is impossible. The system always *might* be busy.

**Evidence**:
- `UnifiedFrameLoop.ts` (402 lines) and `FrameCoordinator.ts` (68 lines) **exist** — the abstraction is right.
- `grep -l requestAnimationFrame src/ --include="*.ts"` returns **58 files** that bypass it. Confirmed offenders include `SlabFragmentBuilder.ts:156,188`, `CurtainWallBuilder.ts`, `ViewportPathTracer.ts`, `EnhancedBloomService.ts`, `BatchCoordinator.ts`, six `engine/subsystems/init*.ts`, three `engine/inspect/Diagnostic*.ts`, plus `physics/PhysicsEngine.ts`, `export/sheets/SheetExportService.ts`, `main.ts`.
- `RenderPipelineManager.setSuspended(true)` (lines 257–266) is the team's own admission: post-FX must be turned off during heavy CPU work because the WebGPU pipeline competes with the main thread.

**Implication**: 58 independent frame-schedulers means there is no central place to ask *"is anything dirty?"* before rendering. SSGI/TRAA temporal accumulation (`RenderPipelineManager.ts:127–129,150`) is constantly invalidated by background scheduling, never settling.

---

## 4. Renderer is owned by `@thatopen/components` (OBC)

**Symptom**: Cannot swap rendering pipelines. Cannot run headless. Cannot remove OBC without breaking views.

**Evidence**:
- `grep "from '@thatopen" src/` → **105 import sites** across 25+ files.
- `EngineBootstrap.ts:805` — `const view = new OBC.View(components)` (OBC owns the view).
- `RenderPipelineManager.ts:34–35` — explicit comment: *"Graceful degradation: when the renderer is WebGL (OBC-managed, Phases 1–4), the manager is a no-op. The full pipeline activates after Phase 5 (OBC decoupling)."* — Phase 5 has not started.
- OBC `FragmentsManager` is woven into `ViewController.ts:417,1371,1517`, `PlanViewManager.ts:610,719`, `EdgeProjectorService.ts:1093,1467`, `PlanViewService.ts:80`.

**Implication**: The TSL/WebGPU pipeline (1,261 lines in `RenderPipelineManager.ts`) is dead code in WebGL mode (the default). PRYZM cannot adopt a modern render pipeline until OBC is removed from these 25+ files, OR until OBC is reduced to "IFC importer" only.

---

## 5. Command system is too granular and coupled

**Symptom**: Every wall change is a custom class. Collaboration wire format is undefined. Per-command snapshots eat memory on large projects.

**Evidence**:
- 264 command files (`find src/commands -name "*.ts" | wc -l`).
- 19 wall commands alone (`ls src/commands/walls/`).
- 242 commands declare `affectedStores` (good intent), but each command is a bespoke TypeScript class that references stores, builders, and adapters directly.
- `CommandManager.ts:1` uses `enablePatches()` from Immer — patch-based undo wired but only ~half migrated. The team marked the rest as "Phase 1.5" (`ImportProjectCommand.ts:9–10`).
- `src/cde/RemoteCommandDispatcher.ts` exists for collab but no wire format is finalized; `initCollaboration.ts:8` says *"for future Phase E-2 CRDT/OT handlers to consume"*.

**Implication**: There is no clean "intent" layer to broadcast for collaboration, no event log to replay for time-travel, no compact wire format. Every collab edit would have to ship a serialized command class.

---

## 6. Boot is a god-class

**Symptom**: Cold start is fundamentally serial because one file decides the order of everything.

**Evidence**:
- `src/engine/EngineBootstrap.ts` — **2,086 lines**.
- 6 sub-files in `src/engine/subsystems/init*.ts`, each with their own `requestAnimationFrame` calls and side effects on the global `window` object.
- `(window as any).__pryzmDebugWalls`, `(window as any).slabBuilder`, `(window as any).__planSymbolCache` etc. — global-object coupling for cross-module wiring.

**Implication**: Cannot parallelize init. Cannot lazy-load tools. Cannot ship a viewer-only build without dragging the editor with it. Cannot test boot in isolation.

---

## Cross-cutting rot

| Area | Evidence | Impact |
|---|---|---|
| **No web workers for native primitives** | Single `new Worker()` site at `DrawingPipelineOrchestrator.ts:165`. Walls, slabs, roofs, curtain walls all build on the UI thread. | Main-thread budget capped. |
| **No server-side geometry** | Server is Express + Socket.io + Supabase auth only. No Node geometry pipeline, no `worker_threads`, no binary bake. | Client re-bakes every load. |
| **No load-time regression tests** | No timing harness, no perf budgets in CI. | Any rewrite optimism is unfalsifiable. |
| **Stores DO carry domain DTOs cleanly** | `WallStore.ts` carries plain `Point3D`, no THREE refs. (Verified: `grep "THREE\." src/elements/*/...Store.ts` = 0 hits.) | This is the **one** layer that does not need rewriting. Reuse it. |
| **`enablePatches()` already imported** | `CommandManager.ts:1` | The Immer machinery is in place if the new command/event design wants it. |
| **`UnifiedFrameLoop` already exists** | 402 lines, post-render listener registry. | The abstraction shape is right; just enforce it as the only frame source. |

---

## Architectural failure-mode summary

The shape of the system is:

```
[ DTO Stores (clean) ]
        ↓
[ 264 Commands (granular, store-coupled) ]
        ↓
[ Builders (THREE-fused, main-thread, sync, 6,000+ LOC) ]
        ↓
[ THREE.Scene + OBC.View (third-party-owned renderer) ]
        ↓
[ 58 ad-hoc rAF schedulers competing for frames ]
```

The shape it needs to be is:

```
[ Pure Domain Model (event-sourced) ]
        ↓
[ Command/Intent Layer (CQRS) ]
        ↓
[ Headless Geometry Kernel (workers + Node) ]   ←→ [ Server Bake Service ]
        ↓
[ Scene Committer (thin THREE binding) ]
        ↓
[ Single Render Scheduler (demand-driven) ]
```

The next document defines that target architecture in full.

---

## What stays, what goes

| Layer | Verdict | Why |
|---|---|---|
| Stores (DTO maps) | **Keep, evolve** | Already pure, already typed, already validated by Zod. |
| Command classes (264 of them) | **Replace with Command/Event split** | Too coupled, too many, no wire format. |
| Builders (Wall/Slab/Roof/Curtain) | **Rewrite as pure functions** | Cannot be ported as-is to workers/Node. |
| `RenderPipelineManager` (TSL/WebGPU) | **Salvage the passes, replace the host** | Good GPU code, wrong owner. |
| OBC (`@thatopen/components`) | **Demote to IFC import only** | Today it owns rendering; tomorrow it's a plugin. |
| `EngineBootstrap.ts` | **Delete, replace with a Composition Root** | God-class is structural debt. |
| `UnifiedFrameLoop` | **Promote to single source of truth** | Right shape, wrong enforcement. |
| `ProjectSerializer` (JSON v5) | **Keep as legacy import path** | Migration story, not the new format. |
| Persistence (Supabase project blob) | **Replace with chunked binary store** | Required for streaming. |

---

## Person-week reality check

These are calendar weeks for a team of **2 seniors**, before pessimism multiplier:

| Workstream | Calendar weeks | Confidence |
|---|---|---|
| Domain & event-sourcing core | 6–8 | High |
| Headless geometry kernel (walls + slabs first) | 10–14 | Medium |
| Streaming binary persistence + server bake v1 | 14–20 | Low–Medium |
| Demand-driven render scheduler | 6–8 | High |
| OBC demotion + scene committer | 8–12 | Medium |
| Real-time collaboration (CRDT) | 6–10 | Medium |
| Plugin host + tool migration | 8–12 | Medium |
| Cutover + parity tests | 6–8 | Medium |

**Total: 64–92 calendar weeks (128–184 person-weeks).** Add a 30% pessimism multiplier on the persistence/bake row because the team has never built one. That gives a realistic ceiling near **18–24 calendar months** to full parity, with a usable v1 viewer in **5–7 months** if the workstreams are sequenced as the orchestration plan describes.
