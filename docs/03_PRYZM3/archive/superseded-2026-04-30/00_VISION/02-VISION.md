# PRYZM 2 — Vision, Goals & North Star

> *"PRYZM 2 is what Revit would be if it had been built on the web in 2026, with AI from day one, with collaboration as a primitive, and with an open SDK on every surface."*

This document is the **strategic anchor** for the 36-month rebuild. Every plan, ADR, sprint and code review must trace back to one of the principles, goals or differentiators below. If a proposed change cannot trace back, it does not ship.

It is the companion to:

- `09-AS-IS-VS-TO-BE.md` — what we have today vs what we are building, layer by layer, plus the Forma / Qonic / Motif / Pascal competitive read.
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` — how we get from here to there over 72 two-week sprints across 36 months.

---

## §1 The one paragraph

PRYZM 2 is the **open, web-native, AI-native, multi-user BIM authoring platform with desktop-CAD documentation parity, that anyone can self-host and anyone can extend**. It opens projects in under one second by streaming server-baked geometry chunks tier-by-tier. It edits geometry collaboratively in real time with conflict-free merge and per-element soft locks. It produces plan, section, sheet and schedule documentation at parity with desktop CAD. It carries every project as a portable `.pryzm` ZIP that round-trips losslessly across versions, machines and self-hosted installs. It exposes every operation through a public REST + WebSocket + headless API and a sandboxed plugin SDK. Its geometry kernel is **pure** — it runs identically in a browser worker and in a Node bake worker because it imports neither THREE.js, the DOM, nor React. Every layer is instrumented with OpenTelemetry. Every architectural shortcut is lint-enforced out of existence in CI. Every behaviour we promise is covered by a regression test that fails the build before it can rot.

## §2 The identity sentence

> *"PRYZM 2 is what Revit would be if it had been built on the web in 2026, with AI from day one, with collaboration as a primitive, and with an open SDK on every surface."*

This is the sentence every engineer, designer, marketer and salesperson on the team must be able to recite. It encodes the four bets:

1. **Web-native, not desktop-ported.** No Citrix wrapper, no Electron-of-Revit. The browser is the product surface. Server bake + chunked streaming + demand-driven render are how we make the browser as fast as a 64-GB workstation.
2. **AI from day one.** Not a chat sidebar bolted on month 18. AI is L7.5 — a first-class architectural layer with its own command bus, approval flow and public API. The 31-file AI subsystem PRYZM already has is the moat we protect, not subordinate.
3. **Collaboration as a primitive.** The same Yjs document that drives the multiplayer cursor drives the undo stack drives the persistence layer drives the public WebSocket API. Single-user mode is just multi-user with a peer count of one.
4. **Open SDK on every surface.** Element families, AI workflows, tools, panels, exporters, importers, view engines — all expressed against the same plugin manifest, same permission model, same lifecycle. PRYZM the SaaS and a customer's first-party plugin look identical to the host.

## §3 The eight architectural principles

These eight principles **dictate every PR review**. If a change violates a principle, the change is wrong — not the principle.

### P1 — The geometry kernel is pure

`packages/geometry-kernel/` does not import THREE. It does not see a `Scene`. It does not call `requestAnimationFrame`. It does not touch the DOM. It does not import React. It exports pure functions of the shape `(dto, joinData, worldY) → BufferGeometryDescriptor`. It runs in a browser web worker, in a Node `worker_thread`, and in the headless `@pryzm/headless` npm package without modification. **CI gate**: the kernel package's `package.json` has `three`, `react`, `@thatopen/components` listed in a `forbiddenDependencies` ESLint rule, and the build fails if any of them appear in a transitive import.

### P2 — The Scene Committer is the only place THREE objects exist

A single class — `packages/scene-committer/SceneCommitter.ts` — owns every `new THREE.Mesh`, every `scene.add`, every `scene.remove`, every material instantiation. Nothing else in the codebase may instantiate a THREE object. Per-element committers (`plugins/wall/committer.ts`) implement a narrow `PrimitiveCommitter<TStore>` interface. **CI gate**: `eslint-plugin-boundaries` blocks any `import * as THREE` outside `packages/scene-committer/` and `plugins/*/committer.ts`.

### P3 — One frame owner

`packages/frame-scheduler/FrameScheduler.ts` is the sole owner of `requestAnimationFrame`. Every other module that wants a frame calls `scheduler.requestFrame(reason: string)`. The render pipeline reads a dirty-flag set; if no flags are set, the frame is skipped. Idle CPU is **0 fps**, interaction is **60 fps**, post-motion accumulation (TRAA, SSGI) gets a bounded 30-frame budget. **CI gate**: a custom ESLint rule blocks `requestAnimationFrame(` outside `packages/frame-scheduler/`.

### P4 — Commands and events are the wire format

Every state mutation flows through a `CommandHandler<TPayload>`. Handlers produce **Immer patches** scoped to declared `affectedStores`. The same patches are emitted as **MessagePack-encoded events with ULIDs**, which are simultaneously the undo log, the persistence event log, the sync wire format and the audit trail. There is one wire format, not four. **CI gate**: every command handler must declare `affectedStores: readonly StoreId[]`; the build fails on any handler that doesn't.

### P5 — Layer boundaries are mechanical, not cultural

The eight layers (L0 → L7.5) are enforced by `eslint-plugin-boundaries` with an explicit dependency matrix in `eslint.config.js`. L7 may not import L0. L6 may not import L7. L4 may not import any of L1, L5, L6, L7. **CI gate**: the boundaries lint runs on every PR; any violation blocks merge. **No `// eslint-disable` is permitted on the boundaries rule, ever.**

### P6 — No service locators, no `(window as any)`

Cross-module wiring goes through a typed `ServiceRegistry` that is constructed at boot in `apps/editor/src/bootstrap.ts` and passed explicitly into the layers that need it. **CI gate**: a custom ESLint rule blocks `(window as any).` outside two transitional files (`legacy/window-shim.ts`, deleted at Sprint 61), with progress targets per sprint moving the count from 2,078 → 0.

### P7 — Persistence is append-only events + chunked binary

`packages/persistence-client/` writes one event per command (MessagePack, ULID, ~hundreds of bytes) and one or more binary chunks per geometric change (glb + Draco + Meshopt + KTX2). It never serialises a full snapshot. Save is `O(Δ)`, not `O(project)`. The portable `.pryzm` file is a ZIP of the same chunks plus the same event log plus a manifest — there is no second format. **CI gate**: any `JSON.stringify` of a full project snapshot fails review; the only legal full snapshot is the one produced by the snapshotter into `.pryzm` ZIPs.

### P8 — Observability is shipped, not bolted on

Every layer emits OpenTelemetry traces with consistent span names (`pryzm.command.execute`, `pryzm.geometry.produce`, `pryzm.bake.chunk`, `pryzm.sync.merge`). Every PR that adds a new public function must add at least one span. **CI gate**: a custom check fails the build if a new exported function in L0–L6 has no span. Honeycomb / Tempo / Jaeger flame graphs are first-class debugging surfaces.

## §4 The eight layers (numbered for life)

```
┌─ L7   Presentation .................. vanilla TS panels + canvas hosts
├─ L7.5 AI Operations ................. CV pipeline, LLM orchestration, generative
├─ L6   Plugin Host ................... manifest, permissions, sandbox, lifecycle
├─ L5   Frame Scheduler & Renderer .... single rAF owner, dirty-flag render
├─ L4   Geometry Kernel ............... pure functions, headless, worker-safe
├─ L3   Sync (CRDT + awareness) ....... Yjs + soft locks + activeView/Tool
├─ L2   Command / Event Bus ........... handlers, patches, MessagePack events
├─ L1   Domain Stores ................. Zod schemas, typed IDs, dirty diffs
└─ L0   Persistence ................... event log + chunked binary (cloud + .pryzm)
```

The numbers are stable forever. New cross-cutting capabilities get sub-numbers (L7.5) rather than re-numbering. Engineers must be able to say "that work is L4" or "that's an L5 concern" in conversation.

## §5 The ten differentiators (D1–D10)

These are the things PRYZM 2 must do **better than every named competitor**, not just match. They are the marketing story, the sales answer to "why not Forma", and the architectural acceptance criteria.

| ID | Differentiator | Lead-on vs |
|----|---|---|
| **D1** | Real-time multi-user **geometry** collaboration with awareness, soft locks, conflict-free merge | Beats Motif (text/comments only). Matches Qonic. Beats Forma (delayed sync). |
| **D2** | AI as a first-class architectural layer, not a chat sidebar | Beats all four. None has AI as L7.5. |
| **D3** | Open self-host story, single-binary or `docker-compose up` | Beats Forma + Qonic + Motif (cloud-locked). Matches Pascal (open source). |
| **D4** | Sandboxed plugin SDK 1.0 with marketplace and per-plugin permissions | Beats all four. Forma plugin SDK is shallow; others have none. |
| **D5** | Brutal observability — OTel traces from click to pixel for every operation | Beats all four. None publishes its trace model. |
| **D6** | Hot-reload plugin developer experience — `pryzm dev` reloads plugin in <500 ms | Beats all four. |
| **D7** | Headless `@pryzm/headless` npm package — same kernel runs in Node for batch generation, CI checks, scripted projects | Beats all four. Forma has no headless story. |
| **D8** | Desktop-CAD-class documentation pipeline — plan, section, sheet, schedule, with view definitions and visibility-intent | Beats Pascal, Motif, Qonic. Matches Revit. |
| **D9** | Open IFC round-trip with property sets, BCF issues, ISO 19650 naming | Matches Forma + Qonic. Beats Motif + Pascal. |
| **D10** | In-editor parametric component authoring (Revit-Family-Editor analogue) sharable via plugin marketplace | Beats all four. |

## §6 Non-functional targets (the contracts we ship against)

These are the **measurable** promises. Every one has a CI bench gate (Sprint 0 deliverable). A regression > 5% on any gate blocks the PR.

| Target | Today (PRYZM 1) | GA (Month 36) | Bench |
|---|---|---|---|
| **Cold load — small project (50 walls, 1 level)** | 2.4 s wall-clock to interactive | **< 800 ms** | `apps/bench/load-small.ts` |
| **Cold load — medium (500 walls, 5 levels)** | 8.7 s | **< 1.5 s first interactive, full at 4 s** | `apps/bench/load-medium.ts` |
| **Cold load — large (5,000 walls, 20 levels)** | OOM / browser hang | **< 3 s first interactive, full at 12 s** | `apps/bench/load-large.ts` |
| **Save (single wall edit)** | 380 ms (full snapshot POST) | **< 10 ms (one event append)** | `apps/bench/save-edit.ts` |
| **Idle CPU (camera still, no input)** | 18% (continuous 60 fps render) | **< 2% (0 fps render, scheduler idle)** | `apps/bench/idle-cpu.ts` |
| **Interactive frame rate (camera orbit)** | 28 fps | **> 55 fps p95** | `apps/bench/orbit-fps.ts` |
| **Concurrent users per project (CRDT merge under load)** | 1 reliable, 4 best-effort | **20 reliable, 100 stress** | `apps/bench/concurrent-users.ts` |
| **Largest model (walls × levels)** | ~500 walls / 5 levels | **10,000 walls / 50 levels** | `apps/bench/largest-model.ts` |
| **Editor bundle size (uncompressed JS)** | 14.2 MB | **< 6 MB initial, lazy chunks for everything else** | CI bundle-size gate |
| **Editor bundle size (gzip)** | 4.1 MB | **< 1.8 MB initial** | CI bundle-size gate |
| **First contentful paint** | 1.9 s | **< 600 ms** | Lighthouse CI |
| **Plugin install → first invocation** | n/a | **< 2 s** | `apps/bench/plugin-install.ts` |
| **Server bake — single wall edit propagated to chunks** | n/a | **< 1.5 s** | `apps/bench/bake-incremental.ts` |
| **Sync — same-second multi-user edit visible to peer** | ~3 s | **< 250 ms p95** | `apps/bench/sync-latency.ts` |
| **AI floor-plan import (PDF → reviewable command batch)** | ~45 s | **< 15 s** | `apps/bench/ai-floorplan.ts` |
| **Undo single wall edit** | 80 ms (structuredClone of 10 stores) | **< 5 ms (Immer patch reverse-apply)** | `apps/bench/undo-single.ts` |
| **OTel trace — click to pixel coverage** | ~5% of operations | **100% of L0–L7 hot paths** | OTel coverage CI gate |

These numbers are the contract. They go on the homepage. They are the answer to "is PRYZM 2 done?" — when every row is green, GA ships.

## §7 What we are NOT building (non-goals)

Saying these out loud now saves arguments later.

- **NG1** — A native desktop app. PRYZM 2 is web-native. Electron is not on the roadmap. (Self-host runs the same web app behind a corporate firewall.)
- **NG2** — A general-purpose 3D modeller. PRYZM 2 is BIM. Walls, slabs, doors, windows, MEP-class objects — primitives carry semantic meaning. We do not chase Blender, Rhino or SketchUp use cases.
- **NG3** — Real-time analysis (CFD, FEM, energy simulation) inside the editor. These are plugins or external integrations.
- **NG4** — A native mobile app. The editor renders responsively for tablet review but mobile authoring is not a v1 promise.
- **NG5** — A SQL query language for projects. The semantic query engine (existing AI subsystem) is enough.
- **NG6** — Translating IFC into the native format on import. IFC is a foreign format with its own plugin; the native format is `.pryzm`.
- **NG7** — Cross-platform design-system parity (Material, Carbon, Fluent). PRYZM has its own minimal vocabulary.
- **NG8** — Backwards compatibility with PRYZM 1 project blobs **at the wire format level**. Migration is one-way: PRYZM 1 → PRYZM 2 via a one-time importer (`packages/file-format/migrations/v0-pryzm1-to-v1.ts`). Old `.json` snapshots open in PRYZM 2; nothing in PRYZM 2 ever writes the old format.

## §8 The customers we are building for

- **C1 — Solo / small-studio architect.** Wants Revit-class authoring without the Revit price tag and without Windows. Cares about: native web speed, desktop-CAD docs, IFC round-trip, no install.
- **C2 — Mid-size practice (5–50 seats).** Wants real-time multi-user, named users, audit trail, role-based permissions, BCF issues. Cares about: D1, D5, IFC, BCF.
- **C3 — Large enterprise / firm IT department.** Wants self-host behind their firewall, SSO, RLS, audit, OTel exportable to their own observability stack. Cares about: D3, D5, security, the `.pryzm` portable format for archival.
- **C4 — AEC software vendor.** Wants to integrate PRYZM as the BIM kernel of their own product (analysis, takeoff, 4D, energy). Cares about: D7 (headless API), D4 (plugin SDK), the public REST + WS API, the AI API.
- **C5 — Generative-design researcher.** Wants `@pryzm/headless` to script project generation, run thousands of variants overnight, validate against rules. Cares about: D7, D2 (AI API), `.pryzm` export.

If a feature does not directly serve one of C1–C5, it is suspect.

## §9 The discipline paragraph (read this weekly)

> *"The architecture is a shape. The discipline is what fills the shape with code that doesn't betray it. For 36 months, the team will be tempted, weekly, to take shortcuts: a `(window as any)` here, a feature added to `src/legacy/` 'just this once', a new `requestAnimationFrame` outside the scheduler 'because it's faster'. Each individual shortcut is small. The compound interest of 100 such shortcuts is the system PRYZM has today. PRYZM 2 will be THE software if and only if the team has the discipline to refuse those shortcuts every single time, even when a customer is shouting, even when a deadline is slipping, even when the lead is on holiday. The architecture is just a way to make the discipline physically enforceable through CI gates."*

Pinned in `#engineering` Slack. Read at every Monday standup. Re-read after every red-line review.

## §10 The single test that breaks the cycle

When in doubt about where new code belongs, ask:

> **"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"**

- If **yes**, it belongs in L4 (geometry kernel) or L1 (stores) or L2 (commands) or L0 (persistence).
- If **no**, identify the THREE / DOM / React reason. That reason places it in L5 (renderer), L7 (presentation), or a `committer.ts` (the THREE bridge).
- If you can't decide, the layer is wrong. Refactor the boundary.

This test, applied honestly to every PR for 36 months, is the one operational discipline that produces the system this document describes. Everything else — ADRs, sprints, hires, gates — is in service of giving the team enough tooling and slack to apply this test without flinching.

---

*Last updated: 2026-04-26. Owner: Architecture lead. Conflicts? `08-VISION.md` wins over every other doc except `06-PRYZM-IDENTITY-AND-RECOUNT.md` and the `.pryzm` file-format spec.*
