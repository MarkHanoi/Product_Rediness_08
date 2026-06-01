# PRYZM 2 — Production Parity Matrix

> Audience: tech lead, product owner, architecture review board.
> Purpose: define exactly what "production-ready, Forma/Qonic/Motif-class" means for PRYZM, score the gap from today, and set MVP / v1 / v2 cut lines.
> All claims about competitor features are based on public documentation, marketing, and observable behaviour as of Q1 2026.

---

## §0 — Alignment header (re-anchored 2026-04-26)

> **Strategic anchor**: This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`, and the four PHASE-1 sub-docs in `phases/`.
>
> **Conflict order** (highest wins): `06-PRYZM-IDENTITY-AND-RECOUNT.md` + the `.pryzm` file-format spec → `08-VISION.md` → `10-MASTER…` and the PHASE docs → this doc.
>
> **TypeScript Vanilla Decision (binding)**: L7 = vanilla TypeScript. The differentiator table below is unchanged; only the implementation stack for L7 is revised.
>
> **What in this doc is still authoritative**:
> - The 45-feature capability matrix (§1) — still the canonical scorecard against Forma / Qonic / Motif / Pascal / PRYZM-today. PHASE-1/2/3 acceptance gates roll up to these rows.
> - The "What we are NOT building" list (§5) — adopted into `08-VISION.md` §7 as NG1–NG8.
> - The 10 lead-on differentiators **D1–D10** — D1–D7 originate here, D8/D9/D10 added in `06-PRYZM-IDENTITY-AND-RECOUNT.md` §2.4. The full D1–D10 set is mirrored in `08-VISION.md` §5.
> - The "Definition of production-ready" gates (§6) — these are the inputs to `08-VISION.md` §6 non-functional targets.
>
> **What in this doc is SUPERSEDED**:
> - The **MVP / v1 / v2 cut-line calendar** (§3): "MVP week 16, v1 week 28, v2 week 40" → **superseded by the 36-month plan** in `10-MASTER…`: alpha = M12 (PHASE-1D exit), external beta = end Year 2 (PHASE-2 exit), GA = M36 (PHASE-3 exit). The 40-week assumption originates from a pre-recount estimate and is incompatible with the recounted scope in `06`.
> - Any wording that implies an L7 React migration is implicit in the "production-ready" definition → **superseded**. Production-ready means vanilla TS at L7 + the 8-layer architecture + all D1–D10 met.
> - The 7-layer references → use the 8-layer model from `08-VISION.md` §4 (L7.5 added).

---

## 0. Reference frame — what we're benchmarking against

| Product | Vendor | Class | Stack notes |
|---|---|---|---|
| **Autodesk Forma** | Autodesk | Cloud-native conceptual design + early-stage BIM | Cloud-rendered analysis, multi-user, AI-assisted, GIS context, plugin SDK. |
| **Qonic** | Qonic | Cloud-native BIM modeller | Real-time multi-user, conflict-free editing, IFC native, BCF issues, web-first. |
| **Motif** | Motif | Hybrid web CAD + collab | Real-time presence, comments, version history, branching, vector + raster. |

We are not trying to beat all three at everything. We are picking the **architectural floor** they share — cloud-native, multi-user, streaming, plugin-extensible — and picking specific features per product to lead on.

---

## 1. Capability matrix (45 features)

Categories: 🅷 Hard requirement (blocking for "production-ready"), 🅼 Medium (table stakes for v1), 🅻 Lead-on (where PRYZM should differentiate), 🅓 Defer (post-v2).

Scoring legend per column:
- ● = exists today and meets bar
- ◑ = partial (works but not at production quality)
- ○ = absent
- — = not applicable

| # | Capability | Forma | Qonic | Motif | Pascal | PRYZM today | Class |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **Foundations — collaboration & data** ||||||||
| 1 | Multi-user real-time editing | ● | ● | ● | ○ | ○ | 🅷 |
| 2 | Live presence (cursors, selection halos) | ● | ● | ● | ○ | ○ | 🅷 |
| 3 | Per-element soft locks / "who's editing" | ● | ● | ● | ○ | ○ | 🅼 |
| 4 | Conflict-free merge for non-overlapping edits | ● | ● | ● | ○ | ○ | 🅷 |
| 5 | Offline-capable editing with sync-on-reconnect | ◑ | ◑ | ● | ◑ | ○ | 🅼 |
| 6 | Comments / issues anchored to elements (BCF-class) | ● | ● | ● | ○ | ○ | 🅼 |
| 7 | Version history with named branches | ◑ | ◑ | ● | ○ | ◑ | 🅼 |
| 8 | Audit trail (who changed what, when) | ● | ● | ● | ○ | ○ | 🅷 |
| 9 | Permissions: project / folder / element-level | ● | ● | ◑ | ○ | ◑ | 🅷 |
| 10 | Multi-tenant project isolation | ● | ● | ● | — | ● | 🅷 |
| **Foundations — performance & delivery** ||||||||
| 11 | Cold load < 1s (cached chunks) on 50k-element project | ● | ● | ● | ○ | ○ | 🅷 |
| 12 | Edit-to-paint p95 < 33 ms | ● | ● | ● | ◑ | ○ | 🅷 |
| 13 | Demand-driven render (idle CPU < 1% when idle) | ● | ● | ● | ◑ | ○ | 🅷 |
| 14 | Worker-pool geometry (off main thread) | ● | ● | ◑ | ○ | ○ | 🅷 |
| 15 | Server-side geometry bake | ● | ● | — | ○ | ○ | 🅷 |
| 16 | Streamed binary chunks (per-level / per-region) | ● | ● | ● | ○ | ○ | 🅷 |
| 17 | LOD / progressive detail for large scenes | ● | ● | ● | ○ | ○ | 🅼 |
| 18 | WebGPU with WebGL2 fallback | ◑ | ● | ● | ● | ◑ | 🅼 |
| 19 | Mobile/tablet read-only viewer | ● | ● | ● | ◑ | ○ | 🅼 |
| 20 | CDN-cached asset delivery | ● | ● | ● | ○ | ○ | 🅷 |
| **BIM / domain capability** ||||||||
| 21 | IFC import (read all classes in IFC4) | ● | ● | — | ○ | ◑ | 🅷 |
| 22 | IFC export (write valid IFC4 with property sets) | ● | ● | — | ○ | ○ | 🅼 |
| 23 | Property sets, classifications, IFC-compliant attributes | ● | ● | — | ○ | ◑ | 🅼 |
| 24 | Federated models (link multiple projects) | ● | ● | — | ○ | ○ | 🅼 |
| 25 | Plan / section / elevation views | ● | ● | — | ○ | ● | 🅼 |
| 26 | Sheet generation (PDF, scaled, with title block) | ● | ● | ◑ | ○ | ● | 🅼 |
| 27 | Schedule / quantity takeoff | ● | ● | — | ○ | ◑ | 🅻 |
| 28 | Clash detection (geometric + rule-based) | ● | ● | — | ○ | ○ | 🅼 |
| 29 | Code compliance / rule validation engine | ● | ◑ | — | ○ | ○ | 🅻 |
| 30 | Site context (terrain, GIS, 3D Tiles) | ● | ◑ | — | ○ | ◑ | 🅻 |
| 31 | Daylight / sun analysis | ● | ◑ | — | ○ | ○ | 🅻 |
| 32 | Energy / wind analysis | ● | ○ | — | ○ | ○ | 🅓 |
| **Editor experience** ||||||||
| 33 | Tools: walls, slabs, roofs, doors, windows, stairs, fences | ● | ● | — | ● | ● | 🅷 |
| 34 | Snapping (grid, endpoint, midpoint, perpendicular, parallel) | ● | ● | ● | ◑ | ◑ | 🅷 |
| 35 | Undo / redo with > 1000-step depth | ● | ● | ● | ◑ | ◑ | 🅼 |
| 36 | Saved camera views / bookmarks | ● | ● | ● | ◑ | ● | 🅼 |
| 37 | Search across all elements & properties | ● | ● | ● | ○ | ○ | 🅼 |
| 38 | Walkthrough / first-person mode | ● | ◑ | — | ● | ● | 🅼 |
| 39 | Photoreal preview (TRAA + SSGI minimum) | ● | ● | — | ○ | ◑ | 🅻 |
| 40 | AI-assisted design (parametric, generative variants) | ● | ○ | — | ○ | ◑ | 🅻 |
| **Platform** ||||||||
| 41 | Plugin / extension SDK with sandboxing | ● | ◑ | ● | ○ | ○ | 🅼 |
| 42 | REST + WebSocket API for headless operations | ● | ● | ● | ○ | ◑ | 🅼 |
| 43 | Webhooks for project events | ● | ● | ● | ○ | ○ | 🅻 |
| 44 | Telemetry / observability (per-user perf metrics) | ● | ● | ● | ○ | ○ | 🅷 |
| 45 | Billing, plans, seats (Stripe-integrated) | ● | ● | ● | ○ | ● | 🅷 |

---

## 2. Score summary

| Bucket | Count | Pascal score | PRYZM today score | Gap if we just fork Pascal | Gap if we evolve PRYZM |
|---|---|:-:|:-:|:-:|:-:|
| 🅷 Hard requirement | 14 | 1 ● + 1 ◑ + 12 ○ | 3 ● + 2 ◑ + 9 ○ | 13 features to build | 11 features to build |
| 🅼 Medium / table stakes | 18 | 3 ● + 4 ◑ + 11 ○ | 5 ● + 4 ◑ + 9 ○ | 15 features to build | 13 features to build |
| 🅻 Lead-on | 8 | 0 ● + 0 ◑ + 8 ○ | 0 ● + 3 ◑ + 5 ○ | 8 features to build | 8 features to build |
| 🅓 Defer (post-v2) | 1 | 0 | 0 | — | — |

**Net**: PRYZM today is 5 hard-bar items closer than Pascal but loses on 3 collab/streaming items where Pascal is also at zero. **Neither product is production-ready alone.** PRYZM 2 takes the union: PRYZM's IFC + plan-view + permissions + billing, Pascal's clean editor architecture + WebGPU + R3F, and roughly 30 net-new features split across collab, streaming, server bake, and plugin SDK.

---

## 3. MVP / v1 / v2 cut lines

The implementation plan in `05-IMPLEMENTATION-PLAN.md` sequences against these cuts.

### MVP — "internal alpha", week ~16

The minimum that proves the architecture is real and a single user can replace today's PRYZM editor for one project type (residential, no IFC).

- All 🅷 foundations except #15 server bake and #16 streaming (still single-blob save on MVP).
- Capabilities: walls, slabs, doors, windows from #33; snapping #34; undo #35; permissions #9; multi-tenant isolation #10; auth + billing #45 (carry forward from PRYZM).
- Demand-driven render #13, worker geometry #14, edit p95 #12 — the architectural proof points.
- Multi-user collab #1, presence #2, conflict-free merge #4 — wired but feature-flagged off until v1.

### v1 — "external beta", week ~28

Customer-deliverable for PRYZM's existing customer base on existing project types.

- All 🅷 hard requirements ●.
- 🅼: 1, 2, 6, 8, 18, 19, 25, 26, 28, 41, 42, 44 ●; the rest ◑ acceptable.
- IFC import #21 ●; IFC export #22 ◑ (round-trip lossy).
- Sheet generation #26 ● (parity with today's PRYZM exporter).
- Plugin SDK #41 ● for first-party plugins; third-party deferred to v2.

### v2 — "production GA", week ~40

Public launch, public plugin SDK, full Forma-class lead-ons.

- All 🅷 and 🅼 ●.
- 🅻 27, 28, 29, 30, 31, 39, 40 ●.
- Public plugin marketplace, public REST/WebSocket SDK, public webhook API.
- Mobile-first viewer ●.

### Post-v2 (backlog)

- 🅓 32 (wind/CFD).
- Generative design exploration at Forma's depth.
- VR/AR viewer.
- Native desktop (Tauri shell).

---

## 4. Where PRYZM should *lead*, not just match

These are the deliberate differentiators — the reason a customer picks PRYZM over Forma or Qonic. The architecture must enable them, not block them.

| # | Lead-on | Why we can lead | Architectural enabler |
|---|---|---|---|
| **D1** | **Same-second collab on geometry (not just text/comments like Motif)** | Yjs + server linearisation + worker-baked geometry → other users see your wall move within the next frame, not after a save. | L2 event log + L3 sync + L4 worker pool. |
| **D2** | **AI as a first-class plugin, not bolt-on** | PRYZM's existing AI stack (`src/ai/`) reframed as a plugin that subscribes to events and dispatches commands like a human. | L2 events as the AI substrate + L6 plugin host. |
| **D3** | **Open self-host story** | Unlike Forma, the entire stack runs on your infra: Postgres + S3-compatible + Node sync server + Node bake worker. Customers worried about cloud lock-in can self-host. | L0 storage abstraction + apps/sync-server + apps/bake-worker shipped as containers. |
| **D4** | **Plugin SDK with hot-reload in dev** | Beat Qonic's plugin story by making plugin DX feel like editing app code. Vite plugin module replacement in dev, sandboxed iframe in production. | L6 plugin host with dev/prod modes. |
| **D5** | **Brutal observability** | Per-user, per-project flame graphs of every command. Customer reports "it's slow" → we open the trace, not guess. | L0–L7 OpenTelemetry spans + Honeycomb-class backend. |
| **D6** | **Native multi-view (plan, section, 3D synchronized)** | PRYZM already has this; competitors are weak on web. Architectural rule: every view is a viewer instance fed from the same store. | L5 multi-canvas pattern + shared scene committer. |
| **D7** | **Headless API for power users** | Same `packages/core` that the editor uses, runnable in Node. Customers can script project generation. | L1–L4 must be browser/Node-shared from day one. |

These seven items are non-negotiable inputs to the architecture. If a design choice in `05-IMPLEMENTATION-PLAN.md` blocks any of them, that choice is wrong.

---

## 5. What we are deliberately NOT building (and why)

Saying no to features is part of the architecture. The following are **out of scope** for v1 and v2; the architecture must not be designed around them.

| Item | Why out of scope |
|---|---|
| Native CFD wind simulation | Massive compute cost; defer to integration with external service. |
| Native VR/AR mode | Niche today; can be added later via plugin without architectural change. |
| Procedural generative design at Forma's depth | Requires a research team; v2 ships AI-assisted only. |
| Native desktop client | Web-first decision; native shell (Tauri) is post-v2 if customers ask. |
| Server-side raytracing for marketing renders | Defer to integration with external render service (V-Ray, Lumion). |
| Real-time IFC streaming editing (write IFC live) | IFC is import/export only; live storage is PRYZM's binary chunk format. |
| Full BCF compliance for issue tracking | We ship a comments + issues feature, but BCF round-trip is post-v2. |
| Full open-BIM consortium certifications (buildingSMART) | Pursued post-v2 once IFC export quality is at the bar. |

These exclusions are stated explicitly so reviewers can challenge them up front rather than discover them mid-project.

---

## 6. Definition of "production-ready" for PRYZM 2

PRYZM 2 is **production-ready** when *all* of the following hold simultaneously on a real customer project of ≥ 10,000 elements:

1. **Cold load** of an active level: < 1 s perceived (skeleton), < 3 s full level rendered, with cached chunks.
2. **Edit-to-paint p95** < 33 ms across walls, slabs, doors, windows.
3. **Idle CPU** < 1% when scene is unchanged for 5 s.
4. **Multi-user merge**: two users editing different rooms see each other's edits within one frame, no rebases, no conflict UI.
5. **Audit trail**: every event is queryable by `(actor, project, time-range)`. Time-travel to any historical state in < 5 s.
6. **Server bake**: a single wall edit triggers a bake of the affected level chunk in < 2 s end-to-end.
7. **No `EngineBootstrap.ts`** in the repo. No `(window as any).*` cross-wiring. No `requestAnimationFrame` outside the frame scheduler. CI enforces all three.
8. **Plugin SDK 1.0 published**, with at least three first-party plugins (wall, IFC import, AI copilot) shipped against it.
9. **Telemetry**: any customer issue can be opened to a flame graph within 2 minutes of the report.
10. **Single-tenant self-host**: a customer can `docker compose up` and run PRYZM 2 on their own infra in < 30 minutes.

These are the **gates the implementation plan must hit**. They appear again in the orchestration as Phase 8 exit criteria.

---

## 7. Cross-reference

| Want to know… | See |
|---|---|
| The architectural shape that delivers these features | `01-TARGET-ARCHITECTURE.md` |
| The execution sequence to build them | `02-ORCHESTRATION.md` (high-level) and `05-IMPLEMENTATION-PLAN.md` (deep) |
| What we borrow from Pascal vs build new | `03-PASCAL-EDITOR-ANALYSIS.md` |
| Per-feature implementation specifics | `05-IMPLEMENTATION-PLAN.md` §§ 5–18 |
