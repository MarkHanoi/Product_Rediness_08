# PRYZM 2 — Comprehensive Gap & Mistakes Review

| Field | Value |
|---|---|
| Date | 2026-04-27 |
| Scope | All of `docs/00_NEW_ARCHITECTURE/**` (top-level, `phases/`, `adrs/`, `specs/`, `audits/`) cross-checked against the actual codebase under `src/`, `apps/`, `packages/`, `plugins/`, `server*` |
| Type | Critical gap review — architecture, orchestration, structure, backend, performance, element creation, persistence, tech-stack, rendering, 2D documentation, implementation realism |
| Audience | Architecture lead (you) |
| Stance | Adversarial. Every finding is grounded in a file/line in the corpus or in the codebase. Not a re-statement of what the docs already say is missing — focused on what is **silently** missing or contradictory between the docs and the running code. |

> Read this document **alongside** `CRITICAL-REVIEW-2026-04-27.md` and `CONFLICT-ANALYSIS.md`. Those two are about *internal* consistency of the new corpus. This one is about the gap between the **proposed architecture and the code that actually exists today**, plus the architectural mistakes that will silently bite you regardless of which corpus wins.

---

## 0. What PRYZM is today (one screen, ground truth)

**The running app on `npm run dev` is PRYZM 1**, served by `server.js` (3,247 LOC, single Express monolith) with a Vite-middleware front-end booted by `src/main.ts` (vanilla TS) and a side-branch React editor under `apps/editor/`. The `pnpm` workspace already has the new monorepo skeleton (`packages/`, `apps/`, `plugins/`, `tools/`) but the editor that actually opens is still the legacy one, with:

- ~390k LOC of vanilla TS in `src/` covering 23 element families, 11-wave Visibility-Intent, plan/section/sheet/schedule, AI subsystem (31 files), Cesium geospatial, IFC import via `@thatopen/components` (OBC) + `web-ifc`, Stripe billing, Supabase auth fallback to Replit Postgres.
- Persistence: monolithic JSON snapshot through `ProjectSerializer.ts` (~1,894 LOC) and `ImportProjectCommand.ts` (~1,720 LOC), stored via `pg` to either Supabase or Replit Postgres.
- Wire: Socket.io JSON for collab, command rebroadcast (`command-executed`), Last-Write-Wins ordering by server receipt time.
- AI: a Cloudflare Worker relay to Anthropic `claude-haiku-4-5-20251014`.
- Render: Three.js r183, single rAF owner *not* yet enforced — the docs claim 58 owners. New runtime under `packages/renderer/` + `packages/render-runtime/` exists, but the legacy editor is not booted through it.
- Schemas: `packages/schemas/src/elements/*.ts` is real (Zod) but the legacy editor is *not* validated through it on the hot path.
- Plugins: `plugins/wall/`, `plugins/stair/` etc. exist as folders, but the editor still goes through legacy `WallFragmentBuilder.ts` for what users see.

**The docs in `00_NEW_ARCHITECTURE/` are the proposal.** The README explicitly says (`docs/00_NEW_ARCHITECTURE/README.md:36`): *"These documents are the proposal. Nothing has been built. The legacy code in `src/` is unaffected."* That sentence is half-true — scaffolding exists in the monorepo, but nothing on the user-visible path has migrated.

## 1. What `00_NEW_ARCHITECTURE` is trying to achieve

In one sentence (`08-VISION.md` §2 / `06-PRYZM-IDENTITY-AND-RECOUNT.md`): *"PRYZM 2 is what Revit would be if it had been built on the web in 2026, with AI from day one, with collaboration as a primitive, and with an open SDK on every surface."*

Operationally:

- An **8-layer stack** (L0 Persistence → L1 Stores → L2 Command/Event Bus → L3 Sync → L4 Geometry Kernel → L5 Render Runtime → L6 Plugin Host → L7 Presentation, with **L7.5 AI Operations** between L6 and L7).
- A **pure** kernel that runs identically in browser workers and Node (`apps/bake-worker/`, `@pryzm/headless`).
- Persistence as **append-only MessagePack event log + chunked `.glb` per level** stored on R2/S3, packaged as a `.pryzm` ZIP.
- Real-time collab via **Yjs CRDT** with awareness, soft locks, sub-250 ms p95 propagation.
- A **single FrameScheduler** owning `requestAnimationFrame`, demand-driven render (target idle CPU < 2%, edit-to-paint < 33 ms).
- A **plugin SDK** with manifest, sandbox (Web Worker + CSP), marketplace.
- **D8** documentation parity with Revit (plan/section/sheet/schedule, view templates, view filters).
- **D7** headless rendering and **D5** built-in observability (OTel, span coverage CI gate).
- All enforced by **eight CI gates** (P1–P8), 17 named bench gates, bundle-size gate, no-full-snapshot test, no-rAF lint, no-`(window as any)` lint, boundaries lint, forbidden-deps lint, span-coverage check.

Calibrated for **solo founder + Replit Agent over 36 months**, in 72 two-week sprints (`10-MASTER-IMPLEMENTATION-PLAN-36M.md`).

---

## 2. Method

For each of the 15 categories the brief calls out, I report:
- **G — Gap** (something missing from the docs, the code, or both)
- **M — Mistake** (something the docs assert that is wrong or will break)
- **L — Missing link** (a contract that one doc or sprint depends on but nobody owns)

with file/line citations. Severity: **🔴 Blocker**, **🟠 Serious**, **🟡 Important**, **🟢 Minor**.

---

## 3. Gaps on the **architecture**

### 3.1 🔴 G — The 8-layer stack has no enforced membrane between L1 (Stores) and L4 (Kernel) for *read* access
`08-VISION §3 P1/P2` and `01-TARGET §0/§1` define a strict downward-only import rule (`code in layer N may only import from layer ≤ N`). But the kernel is supposed to be **pure** — it cannot import L1 stores. The actual contract is: kernel is `(DTO + ctx) → BufferGeometryDescriptor`. **There is no specification anywhere** for how a producer gets the join data of *adjacent* walls, the host element of a door, or the level Z of a slab. In `packages/schemas/src/elements/*.ts` the wall has `baseLine` (just two endpoints) — a wall-end-to-end producer needs *neighbour walls and openings*, which require either (a) the producer reading the store (forbidden by P1), or (b) a `JoinData` / `HostContext` envelope assembled by L2 before invocation. The latter is only mentioned in passing in `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` (S08 producer signature) without a contract that says **what assembles it, where it caches, what invalidates it**.

> Without that contract, the wall producer in S07–S10 will reach back into stores via a "context" parameter that is a thin disguise for global state, and you will rebuild the same coupling you were trying to delete.

**Fix**: write `SPEC-13-CONTEXT-ENVELOPES.md` defining `WallContext`, `DoorContext`, `SlabContext` as L2-owned, L3-cacheable, L4-readable. Do this **before S07**.

### 3.2 🔴 G — L7.5 AI Operations is asserted as a "first-class layer" with no boundaries lint rule
`SPEC-07-AI-LAYER.md` describes Inspector/Generator/Modifier/Critic. `08-VISION §4` puts L7.5 between L7 and L6. But the boundaries-lint matrix has no entry for L7.5. Can L7.5 import L4 directly to inspect geometry? Or only L2 commands? Both are reasonable, both have very different security implications.

**Fix**: add the L7.5 column to the boundaries matrix in `eslint.config.js` *as part of S04*, not "before S30" as `CONFLICT-ANALYSIS §6.4` defers it.

### 3.3 🟠 G — No "core architecture" diagram includes the *server side*
Every architecture diagram in `01-TARGET §1`, `08-VISION §4`, `09-AS-IS-VS-TO-BE` shows **client layers only**. The bake worker, sync server, AI worker, IFC worker, export worker, OTel collector, R2 are mentioned as `apps/*` but never drawn in the layer diagram. Result: there is no diagram that shows *which client layer talks to which server, on which protocol, with which auth, with which back-pressure semantics*. Consequence: every reader of the architecture builds a different mental model of what runs on the client and what runs on the server.

**Fix**: extend `01-TARGET §1` with a second diagram captioned "Distributed Topology" showing client / sync-server / bake-worker / ai-worker / R2 / Postgres with arrows labelled by protocol (WS, HTTP, BullMQ, MessagePack, Yjs).

### 3.4 🟠 M — `SceneCommitter` is described as "the only place THREE may be instantiated" but the codebase already has `packages/renderer/`, `packages/render-runtime/`, `src/render/`, `src/rendering/` — **four** parallel renderers
- `packages/renderer/src/Renderer.ts` (new, dual WebGPU/WebGL2)
- `packages/render-runtime/` (new, frame scheduler boot entry)
- `src/render/` (legacy)
- `src/rendering/` (legacy, separate)

The conflict analysis (`CONFLICT-ANALYSIS §3.5`) says "renderer is owned by `packages/renderer/` directly." The codebase says four owners. There is no migration plan that names which one wins. `phases/PHASE-1A` says `packages/render-runtime/` is the boot entry but the editor still imports from `src/rendering/` today.

**Fix**: declare the One Renderer in an ADR (call it ADR-022) before any new committer code is merged. Likely answer: `packages/renderer/` is the device (WebGPU/WebGL), `packages/render-runtime/` is the scheduler+committer host, both `src/render/` and `src/rendering/` are scheduled for deletion in S55.

### 3.5 🟠 G — The 8-layer model has no story for *cross-cutting concerns*
Examples: i18n, theming, accessibility, error reporting, feature flags, telemetry breadcrumbs, undo-stack visibility in the UI. None of these fit cleanly into one layer. Forma and Qonic both have a "platform services" cross-cut. PRYZM 2 has `packages/` for some (`packages/ids/` is hinted), but no contract says where i18n lives, where flags live, where the error boundary owns the recovery action.

**Fix**: introduce an `L*` cross-cutting band in the layer diagram or define a `packages/platform-services/` package with a contract.

---

## 4. Gaps on the **orchestration**

### 4.1 🔴 G — `02-ORCHESTRATION.md` is 100% superseded but still appears in the README's "Read in order"
`02-ORCHESTRATION §0` (Alignment header) explicitly says: *"This document is now subordinate to `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `10-MASTER-IMPLEMENTATION-PLAN-36M.md`."* And then 287 more lines describe an 8-phase, 40-week, 2-senior-engineer plan that is no longer the plan. The README still includes it as #3 in "Read in order." A new engineer will read it cover-to-cover and internalise the wrong calendar, the wrong team size, and the wrong phase boundaries.

**Fix**: move `02-ORCHESTRATION.md` to `archive/` or replace its body with a 5-line "this document is archived; see `10-MASTER-IMPLEMENTATION-PLAN-36M.md`."

### 4.2 🔴 G — There is no orchestration of **server processes** in a single artefact
`apps/sync-server/`, `apps/bake-worker/`, `apps/ai-worker/`, `apps/ifc-worker/`, `apps/export-worker/` are listed in `06 §3` and `phases/PHASE-1A` but there is no:
- Process-supervision design (PM2? systemd? Replit deployments? K8s?)
- Health check / readiness / liveness contracts
- Inter-service auth (mTLS? signed JWT?)
- Service discovery / DNS / port assignments
- Failure-isolation policy (if `bake-worker` dies, does the editor degrade gracefully?)
- Local-dev `docker-compose` for the full stack (ADR-012 promises it but no compose file is in the repo)

This is the kind of detail Forma and Qonic have *because* they were built by a team that had operated production systems. PRYZM 2 will hit this on **day 1** of multi-process work and there will be no design.

**Fix**: write `SPEC-13-RUNTIME-TOPOLOGY.md` covering the above, *and* land a working `docker-compose.dev.yaml` before S04 (which is when the bake worker first ships per the conflict analysis).

### 4.3 🟠 G — The kill-switches in `02-ORCHESTRATION §6` and `phases/*` are not tracked in `PROCESS-TRACKER.md`
`CRITICAL-REVIEW §D2` already flags this. Reiterating: every phase doc names `K1A-1..3`, `K1B-1..3`, etc. There is no central "kill-switch dashboard" that says: *current sprint is S05; the active kill-switches are X, Y, Z; their trigger condition is …; the response is …*. Without that, the kill-switches are slogans.

**Fix**: add a "Kill-switches" column to `PROCESS-TRACKER.md` per sprint row, with `Trigger | Response | Owner`.

### 4.4 🟠 M — The "two parallel tracks from day one" pattern is asserted but the team is **one person** (you)
`02-ORCHESTRATION §1.1` says "Track A — Foundation (must lead)" and "Track B — Persistence & Server (can start after week 4)." `phases/PHASE-1A` operationalises it as "Two-Agent Daily Cadence." The whole 36M plan is calibrated for *solo + Agent*. You cannot run two parallel architectural tracks with one human; the Agent is not a senior engineer, it is a tool that needs your review on every PR. The cadence will collapse into **serial work with one Agent helper**, and the schedule will slip in proportion.

**Fix**: rewrite the daily cadence sections of every PHASE doc to explicitly say "Solo founder drives both tracks; Agent works on one track while founder reviews the other; tracks must be designed to *interleave*, not run truly in parallel." Then re-cost the schedule.

### 4.5 🟠 L — No orchestration for **data migration** of live customers
`CRITICAL-REVIEW §D3` raises this. Adding here: there is no spec for *operational* migration — Stripe subscription continuity, webhook re-binding, project sharing-link continuity, JWT/session cookie continuity, audit-log continuity. The first PRYZM 1 customer who logs into PRYZM 2 will hit at least three of these on day 1.

**Fix**: write `SPEC-14-CUSTOMER-MIGRATION-OPS.md`. **Before** any PRYZM 1 customer is told.

### 4.6 🟠 G — The plan claims `PRYZM 1 feature freeze` (`README.md:13`) but `server.js` is still being actively extended
The actual server contains active code paths for: `[server] Anthropic model id: claude-haiku-4-5-20251014`, `RENDER-SVC: photorealistic render job gallery`, `TIER-3: Panorama gallery`, etc. There is no commitment in the codebase that PRYZM 1 is frozen. Worse, the team has no policy for "what bug fix is allowed in PRYZM 1 during the freeze." Without that policy, every blocking customer bug becomes a temptation to pull effort off PRYZM 2.

**Fix**: write a one-page `FREEZE-POLICY.md` listing the categories of change allowed in PRYZM 1 during the 36 months (security patches only? P0 bugs only? nothing?).

---

## 5. Gaps on the **structure** (file/folder/package)

### 5.1 🔴 G — Two parallel monorepo "structures" are documented with no winner
`ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` (456 lines) describes the package layout. `06 §3` lists a *different* package layout (e.g. `headless` vs `@pryzm/headless`). The actual `pnpm-workspace.yaml` lists `packages/*`, `tools/*`, `apps/*`, `plugins/*` with directories that match neither in full. New engineers will guess.

**Fix**: regenerate `ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` from a single source of truth (e.g. a `pnpm ls -r --depth -1` output annotated with "owner / status: stable | scaffold | legacy | delete-by-S61").

### 5.2 🟠 G — `src/` has 40+ subfolders and the docs only triage ~20
`src/ai`, `src/api`, `src/cde`, `src/collaboration`, `src/commands`, `src/component-editor`, `src/constraints`, `src/core`, `src/dev`, `src/elements`, `src/engine`, `src/export`, `src/features`, `src/furniture`, `src/generative`, `src/geospatial`, `src/history`, `src/import`, `src/lifecycle`, `src/migration`, `src/monetization`, `src/persistence`, `src/physics`, `src/portfolio`, `src/render`, `src/rendering`, `src/services`, `src/snapping`, `src/spatial`, `src/structural`, `src/styles`, `src/tools`, `src/topology`, `src/types`, `src/ui`, `src/utils`, `src/visibility`. The docs (`09-AS-IS-VS-TO-BE §4`) name worst-files and per-subdomain triage (DROP/MERGE/PORT/LIFT) but never enumerate **every** folder with a per-folder verdict. The folders without a verdict (e.g. `src/cde`, `src/component-editor`, `src/lifecycle`, `src/monetization`, `src/portfolio`, `src/structural`, `src/physics`, `src/styles`, `src/visibility`) will be migrated last, by ad-hoc decision, with no contract.

**Fix**: add an appendix to `09-AS-IS-VS-TO-BE.md` titled "Per-folder verdict" with one row per `src/*` and a status of `KEEP` / `MOVE TO packages/X` / `MOVE TO plugins/X` / `DELETE` / `MERGE INTO Y`. This is mechanical and a one-day exercise that prevents months of confusion.

### 5.3 🟠 G — `Canvas2D` (root file) and `browser.html` (root file) are unreferenced in the docs
`ls` shows an empty `Canvas2D` file at the repo root and a `browser.html` that isn't `index.html`. Neither is mentioned in any doc. Either they are dead code, or they are part of a parallel scaffold that no one has documented. Either way it's noise that signals to a new contributor "we don't actually know what's in here."

> **Note (corrected 2026-04-27)**: the root-level `editor/` folder is the *Pascal Editor* reference project, not PRYZM. It is intentionally outside PRYZM's scope and should not be migrated, deleted, or counted as PRYZM code. A one-line `editor/README.md` saying "Pascal Editor — reference project, not part of PRYZM" would prevent future confusion.

**Fix**: walk root + first-level dirs once, classify, delete or document. Add the Pascal Editor README as part of that pass.

### 5.4 🟢 G — `pnpm-workspace.yaml` lists `tools/*`, but `tools/` is undocumented
`ARCHITECTURE-FILE-STRUCTURE-BREAKDOWN.md` doesn't enumerate `tools/`. The contents (`tools/load-bench`, `tools/scan-logs`, etc.) are referenced in `02-ORCHESTRATION §2 Phase 0` but with no per-tool spec.

**Fix**: list `tools/*` in the structure doc with a one-line description per tool.

---

## 6. Gaps on the **backend**

### 6.1 🔴 M — Backend tech-stack is not chosen
The corpus says: Yjs server, Express, BullMQ, Postgres + R2, MessagePack, OTel. The actual `server.js` uses: Express 4 + Socket.io + `pg`. There is no:
- Decision on **Yjs server framework** (`y-websocket`? `hocuspocus`? in-house?). `SPEC-03-SYNC-CRDT` says Yjs but does not name the server runtime.
- Decision on **BullMQ host** (Redis required — Replit has no managed Redis; ADR-005 says "BullMQ" but doesn't say where Redis lives).
- Decision on **bake-worker process model** (Node? Bun? Deno? `SPEC-02-PERSISTENCE` is silent).
- Decision on **AI worker isolation** (separate process? same Node? `SPEC-07-AI-LAYER` doesn't say).

You're moving from a `server.js` monolith to **at least four** server processes with no ADRs naming the runtime, the host platform, the deployment story.

**Fix**: ADR-022 backend runtime topology (Node 20 vs 22, Yjs server choice, BullMQ-Redis story for Replit Deployments specifically, IPC vs HTTP between workers). **Before S04**.

### 6.2 🔴 G — Replit Deployments is the implicit production target — but the docs assume R2 + Cloudflare Workers
`apps/sync-server`, `apps/bake-worker`, `apps/ai-worker` deployed where? Replit Reserved-VM? Replit Autoscale? AWS? Self-hosted only? The `.replit` deployment block uses `autoscale`. Autoscale **does not support background workers** — only request/response. The bake worker and the Yjs WebSocket server cannot run on autoscale. There is **no deployment plan that matches the architecture**.

**Fix**: pick the deployment topology now. Likely: editor on Autoscale (or Static), sync-server on Reserved VM, bake-worker on Reserved VM with BullMQ on Upstash Redis, R2 for chunks. Document this in `SPEC-15-DEPLOYMENT-TOPOLOGY.md`. **Before any apps/* server is written**.

### 6.3 🟠 M — `server.js` is 3,247 LOC and growing; the docs say PRYZM 1 is frozen
`server.js` already does: auth, project store, render gallery, panorama gallery, AI relay, Stripe webhooks, CDE permissions, Socket.io collab, audit log, member management, version state machine, export guards, Cloudflare Worker AI routing. This is six microservices' worth of code in one file. Even if PRYZM 1 is frozen, this file will be the *bridge* during the 36-month migration and **its 3,247 lines have to move incrementally to `apps/*`**. There is no plan for that decomposition.

**Fix**: a per-route inventory of `server.js` mapped to the future `apps/*` that will own it (similar to the per-file triage in §5.2 but for server-side). One row per Express route. Add to `09-AS-IS-VS-TO-BE.md`.

### 6.4 🟠 G — Auth is "JWT/bcrypt with Supabase fallback to Replit Postgres" — neither is the target
The startup banner shows: *"[server] Auth: custom JWT/bcrypt (SESSION_SECRET) … Supabase: FOUND … SUPABASE_SERVICE_ROLE_KEY IS NOT SET."* The architecture target (`SPEC-08-SECURITY-COLLAB`) names SAML/OIDC + RLS for C3 (large enterprise). There is no spec for **the migration path** from JWT/bcrypt to OIDC, no spec for what happens to existing `users` rows when SSO is bolted on, no spec for tenant separation when Supabase RLS is bypassed by service-role-key.

**Fix**: write `SPEC-16-AUTH-MIGRATION.md`. Phase 1 = current JWT, Phase 2 = OIDC opt-in, Phase 3 = SAML/SCIM enterprise. Define what happens to user records, project ownership, and audit log at each transition.

### 6.5 🟠 G — Rate limiting / quota / cost is partial and inconsistent
Code shows `aiLimiter`, `globalLimiter`, `apiLimiter` (`server/rateLimiter.js`), `enforceAIQuota`, `getUserPlan` — but no architectural spec aggregates them. `SPEC-07-AI-LAYER §6 risks` mentions cost guardrails as a *risk*, not a design. There is no plan for: per-tenant burst, per-actor cost ceiling, per-plan AI quota, queue admission control, billing integration with Stripe meter.

**Fix**: `SPEC-17-COST-AND-QUOTA.md`. Required before public AI API ships at S48.

### 6.6 🟠 L — `apps/sync-server` is supposed to replace Socket.io but Socket.io has 18 months of "live" semantics in PRYZM 1 (cursors, presence, command rebroadcast)
There is no contract for the migration. Will the editor open two sockets during the dual-run window (Socket.io for legacy, WS for Yjs)? Or does the sync-server speak Socket.io on one port and Yjs on another? The cost of the answer is real (CORS, auth, reconnection back-off, mobile network behaviour).

**Fix**: `SPEC-18-COLLAB-WIRE-MIGRATION.md`. **Before S05** when Yjs sync server is scaffolded.

### 6.7 🟢 G — Webhook delivery (`deliverWebhookEvent` in `server/webhookService.js`) has no architectural place in the new stack
Webhooks are how you become an enterprise platform. Public webhook subscriptions will be needed once you have a public API at M24. No mention in any spec.

**Fix**: add a "Webhooks & Outbound Integrations" section to `SPEC-08-SECURITY-COLLAB` or create `SPEC-19-WEBHOOKS.md`.

---

## 7. Gaps on **performance**

### 7.1 🔴 G — Performance budgets are global; per-feature budgets are missing
`08-VISION §6` lists 17 bench gates (cold load, edit-to-paint, idle CPU, AI floor-plan import < 15s, etc.). Missing budgets:
- **First wall create** (click → first frame with the wall) — should be < 16 ms; today it is unmeasured.
- **Large selection** (Ctrl+A on 5,000 elements) — Forma is sub-100 ms; PRYZM today is unmeasured.
- **Property-panel open** for a complex element type — known regression target, no budget.
- **Viewport pan/zoom at 60 fps with 5,000 elements visible** — implied by "edit-to-paint < 33 ms" but not separately gated.
- **First chunk-load → first frame** for a tier-streamed open — `phases/PHASE-1D` mentions 800 ms cold load but does not split it into manifest fetch / first chunk / first frame.
- **Round-trip to bake** for a single wall change — `02-ORCHESTRATION §6 P5` has a kill-switch at 30s but no green budget.
- **Sync round-trip** — `< 250 ms p95` is in `08-VISION` but never decomposed by network/server/render.

**Fix**: extend `SPEC-11-TESTING.md` with a per-interaction budget table. The 17 bench gates measure system-level numbers; user perception is in the ~30 budgets above.

### 7.2 🔴 M — The "single FrameScheduler owns rAF" goal is **incompatible** with three things in the corpus
- **Cesium** (`vite-plugin-cesium` is in dependencies, used in `src/geospatial/`). Cesium owns its own render loop and refuses to run without it. You cannot wrap Cesium's scheduler in PRYZM's frame scheduler without a forked Cesium.
- **`@thatopen/components` (OBC)** has its own update loop in WebGL mode (`RenderPipelineManager.ts:34–35`).
- **`three-gpu-pathtracer`** (in dependencies) runs continuous frames for accumulation; it cannot be 0 fps when idle.

The lint rule (`eslint-plugin-pryzm-no-raf`) will catch user-code violations but not library-internal `requestAnimationFrame`. The "idle CPU < 2%" target is unachievable while these libraries are loaded, even if zero PRYZM code calls rAF.

**Fix**: `ADR-023 — Library rAF Quarantine`: when Cesium / pathtracer / OBC are mounted, idle CPU target is "as low as the library allows." Document the regression. Lazy-mount these libraries so idle CPU is 0 fps when they are not in use.

### 7.3 🟠 G — No memory budgets
The corpus has frame-time and load-time budgets but **no memory budget**. PRYZM 1 routinely hits 2 GB of heap on large projects. The pure kernel running in workers will multiply the scene memory by `workerCount + 1`. There is no spec for: heap ceiling per worker, GC strategy for chunk caches, eviction policy, behaviour on Safari (4 GB tab limit).

**Fix**: add a "Memory budgets" section to `08-VISION §6` and to `SPEC-01-GEOMETRY-KERNEL`. Per-worker ceiling, per-chunk ceiling, per-scene ceiling.

### 7.4 🟠 M — `tools/load-bench` is named in `02-ORCHESTRATION §2 Phase 0` and `08-VISION §6` but is not in the codebase
`ls tools/` would have shown it. The bench gates (cold-load, edit-to-paint, idle-cpu, etc.) **all** depend on this tool. If S01 ships CI gates without a working bench harness, the gates are meaningless.

**Fix**: ship `tools/load-bench/` as the literal first deliverable of S01, before any boundaries lint.

### 7.5 🟠 G — No performance plan for the **bake worker**
A 10,000-wall edit produces *N* chunks to rebake. `ADR-010` says 250 ms debounce per chunk. But:
- Cold bake of a 10k-element project on first import — how long?
- Concurrent users editing different chunks — bake worker concurrency? BullMQ priority?
- Bake failure → fallback to client bake — under what threshold?
- R2 throughput ceiling under burst writes from bake worker.

**Fix**: `SPEC-20-BAKE-PERFORMANCE.md`. Before S08 (bake worker scaffold).

### 7.6 🟢 M — "Visual diff every frame in CI" (`09-AS-IS §L7 line 121`)
`CRITICAL-REVIEW §A7` already flagged this. Reiterating: visual diffs run on golden scenes, not "every frame" of an interactive system. Delete the slogan or rewrite as "visual diff on N golden frames per CI run."

---

## 8. Gaps on **element creation**

### 8.1 🔴 G — `CREATE` semantics are not standardised across element families
The new element-creation contract should answer, for each family: *what is the minimum input that produces a valid element? what defaults are derived? what is the validity-error UX? what is the placement-mode UX (click-click? polygon? snap-to-host?) what is the snap-target priority? what is the pre-placement preview policy? what is the affected-stores set? what is the post-create selection state? what is the undo-event payload?*

`packages/schemas/src/elements/Wall.ts` answers ~30% of that for walls. Doors, windows, slabs, roofs, columns, beams, stairs, handrails, ceilings, furniture, grids — **none** have a contract that answers all of those questions in one place. Without it, every element family will re-litigate the same decisions in S07–S25.

**Fix**: write `SPEC-21-ELEMENT-CREATION-PROTOCOL.md` with a one-page **template** that every element family fills in before its plugin is built.

### 8.2 🔴 G — Hosted elements (door-on-wall, window-on-wall) have no host-context spec
Linked to §3.1. A door is hosted on a wall. The DTO carries `hostId` and `offsetAlongBaseline`. But:
- What happens when the host wall is deleted? The current contract is silent.
- What happens when the host wall's baseline is shortened *past* the door offset?
- What happens when two doors collide?
- What happens during multi-user edit when user A inserts a door and user B shortens the wall?

`CRITICAL-REVIEW §B3` flags this for CRDT but the deeper issue is the *element model* itself has no rules.

**Fix**: `SPEC-22-HOST-INSERT-RULES.md`. Per-relationship: cascade-delete, cascade-resize, conflict semantics, AI override behaviour. **Before S11** (door/window plugins).

### 8.3 🟠 G — Compound elements (multi-layer walls, sandwich slabs, curtain walls with mullions) have no creation story
A "wall" in Revit is a *type* with N material layers. The current `Wall.ts` schema has no concept of layer composition. `CRITICAL-REVIEW §B5` flags this as the under-invested type catalog. Adding here: the **creation flow** for a compound wall is fundamentally different from a single-layer wall (you need to pick the type from a catalog, and that type's layer composition determines wall thickness, drives the join math, drives the hatch in plan view).

**Fix**: include compound-wall creation in `SPEC-21` and the type catalog rewrite in `SPEC-05` *together*. They cannot be designed separately.

### 8.4 🟠 G — Generative / AI element creation has no contract
PRYZM has `GenerativeDesignAdvisor`, `FloorPlanAIFactory`, `RoomAIAssistant`, `PdfToBimConstraints`, `WallCandidateScorer`, `WallIntersectionResolver`, `DoorGapInpainter` — a real moat. These create *batches* of elements. The L7.5 spec says "AI mutations enter through L2 commands … pass through an approval queue." But:
- A floor-plan import creates 200 walls + 50 doors + 20 rooms. Is that **200 commands** in the log, or **one batch command**? Both have implications for undo, sync, and audit.
- The approval queue: does the user approve element-by-element, or batch-by-batch? The UX is wildly different.
- AI-generated geometry that doesn't snap to existing geometry — is it auto-snapped (silently mutating user intent) or shown as-is?
- AI failure mode: half the floor-plan parses successfully, half fails. Partial-commit semantics?

**Fix**: `SPEC-23-AI-ELEMENT-CREATION.md`. Co-owned by L7.5 and L2. Before any AI plugin ships in S08.

### 8.5 🟠 G — Non-element entities (Levels, Grids, Views, Sheets, Schedules, Annotations) have no parallel "creation contract"
The phases `2A` (rooms, structural, furniture), `2B` (plan view), `2C` (sheets, schedules) treat each as a separate sub-project. No shared "creation protocol" applies across them. Result: levels are created in code as `Level.create({elevation})` and views are created as `View.create({type, viewport, level, scale})` and these will diverge in subtle ways (e.g. how undo handles them).

**Fix**: extend `SPEC-21` to cover *non-element* entities as well, with a single "creation protocol" that levels/grids/views/sheets/schedules all follow.

### 8.6 🟢 G — There is no "delete" contract that is the inverse of "create"
Element delete in Revit cascades through hosts, openings, schedules, sheets, view filters, dimensions, tags. Today's PRYZM has half of that ad-hoc. The new architecture says nothing about deletion semantics beyond "command goes through the bus."

**Fix**: add a "Deletion semantics" section to `SPEC-21`.

---

## 9. Gaps on **decision of database, storage, file formats**

### 9.1 🔴 M — The persistence stack uses **three** databases and the choice is undocumented at a top level
- **Replit Postgres** (`pgClient.js`) — current default for users, projects, members, audit log.
- **Supabase Postgres** (`supabaseClient.js`) — production target per the banner; falls back to Replit if `SUPABASE_SERVICE_ROLE_KEY` is missing.
- **R2 / S3** (`ADR-003`) — for chunked geometry.

Plus implied:
- **Redis** for BullMQ (ADR-005) — never named, never hosted.
- **IndexedDB** for offline (mentioned in `02-ORCHESTRATION §6 Phase 6`).
- **(Optional) Y.Doc on disk** somewhere — if Yjs awareness is durable.

There is no diagram, no migration plan, no ADR on which database owns which entity. `SPEC-02-PERSISTENCE` says "Postgres event log + R2 chunks" but does not explain the relationship between Replit Postgres (today) and Supabase (target) and what migrates when.

**Fix**: a single page `SPEC-24-DATA-STORE-MAP.md` with one table: entity / where it lives today / where it should live at M12 / at M24 / at M36 / migration sprint. No more, no less.

### 9.2 🔴 G — Event log compaction policy is missing
`CRITICAL-REVIEW §B2` and `CONFLICT-ANALYSIS §6.2` flag this. Not repeating; what I'll add: the operational implications include (a) backup strategy (point-in-time recovery vs. full snapshot at compaction boundary), (b) audit-log retention (regulators often require 7 years; if compaction throws away events, audit fails), (c) replay cost as a function of log length. Without compaction, a 36-month-old project becomes unloadable.

**Fix**: `SPEC-25-EVENT-LOG-COMPACTION.md`. Required before any production deployment.

### 9.3 🔴 G — The `.pryzm` file format spec is *the highest-priority document* (per `08-VISION §10` and `CONFLICT-ANALYSIS §2`) and **does not exist**
The README and binding hierarchy say *"`.pryzm` file-format spec → 08-VISION → 10-MASTER → …"*. Yet there is no `SPEC-PRYZM-FILE-FORMAT.md`. `01-TARGET §2.1` shows a directory layout. That is not a format spec. A format spec needs:
- Byte-level layout (ZIP central directory? streaming-readable?).
- Per-file schema (manifest.json schema, evt.bin envelope, glb chunk constraints).
- Versioning (`schemaVersion`, forward-compat rules).
- Signing (signature scheme, public key distribution).
- Encryption (at-rest? per-tenant key?).
- Compression boundaries.
- Streaming-read story (HTTP Range requests vs. central-directory-trailer).
- Conformance test suite.

**Fix**: write `SPEC-26-PRYZM-FILE-FORMAT.md` *now*. This is the single highest-leverage document in the corpus and it is missing.

### 9.4 🟠 M — `manifold-3d` is in dependencies but `three-bvh-csg` is the named CSG library in the corpus
`package.json` lists both. `ADR-020` mentions `manifold-3d` as a default. `CRITICAL-REVIEW §B1` flags `three-bvh-csg` as unsuitable for production BIM. Either you have already silently switched to manifold-3d (in which case the docs are stale), or you have two CSG libraries in the bundle (in which case the bundle budget is doomed).

**Fix**: pick one in an ADR (likely ADR-020 amendment). Document the migration of any code on the wrong library.

### 9.5 🟠 G — IFC, DXF, Rhino, PDF — no import file-format compatibility matrix
Dependencies include `web-ifc 0.0.77`, `dxf 5.3.1`, `rhino3dm 8.17.0`, `pdfjs-dist 5.6.205`. The corpus says these become plugins (S55). It does not say:
- Which IFC schema versions are supported (IFC2x3? IFC4? IFC4.3?). `ADR-008` says IFC4 building elements only — does that include or exclude IFC4.0 files?
- DXF: which AutoCAD versions / R-codes?
- Rhino: which rhino3dm versions?
- PDF: pdf.js is for raster; vector-extract for plan import is different — which?

**Fix**: a compatibility matrix in `SPEC-15-INTEROP.md` (does not exist; should). Specify in/out for each format.

### 9.6 🟠 G — Storage *cost* model
`CRITICAL-REVIEW §B2` flagged this. Reiterating: an active project produces N events/day × M chunks/event. Without garbage collection of stale chunks, R2 costs grow unbounded.

**Fix**: a "Storage economics" section in `SPEC-02-PERSISTENCE.md` with a per-project cost model (R2 storage GB-mo + Postgres rows + bandwidth).

### 9.7 🟢 G — Thumbnails (mentioned in `01-TARGET §2.1`) have no spec
PRYZM 1 has a `thumbnail` system today. The new format specifies a `thumbnails/` directory. No size, no format (webp? jpeg? at what resolution?), no generator (server-baked? client-baked?), no eviction.

**Fix**: minor addition to the file format spec.

---

## 10. Gaps on **tech-stack**

### 10.1 🔴 M — Node version mismatch
`package.json` engines mention `node: '>=22.0.0'` for `camera-controls` but the project runs on Node 20 (Replit default). `npm install` already warns. `ADR-022` (which I am proposing in §6.1) needs to pick Node 20 or 22 once and for all.

**Fix**: pin Node version in `.nvmrc` / `engines` and update `.replit` modules. Either upgrade to 22 or downgrade `camera-controls` to a version that supports Node 20.

### 10.2 🔴 M — React 19 + R3F is the listed UI stack (`react 19.2.5`, `react-dom 19.2.5`, `@types/react 19`) but the editor shell is **vanilla TS** (binding decision)
`08-VISION §3 P-decision` says vanilla TS for the editor shell. Yet React 19 is in dependencies and `apps/editor/` (one of two editors) is React-based. This means:
- Either the React editor under `apps/editor/` is *not* the one that ships, and React is just for the marketing site / pricing page / inspector panels — that should be documented.
- Or React **is** going to be in the editor bundle, in which case the bundle budget (1.8 MB) is at risk and the "vanilla TS" decision is rhetorical.

**Fix**: a one-line ADR amendment: "React is permitted in the marketing site (`apps/site/`) and in non-editor surfaces (component-editor, admin). It is forbidden in `apps/editor/` and in `apps/viewer/`. Boundaries lint enforces."

### 10.3 🟠 M — `@vitejs/plugin-react` is in `dependencies`, not `devDependencies`
This will ship React's dev-only warnings into production bundles unless explicitly excluded.

**Fix**: move to devDependencies; verify treeshaking eliminates `react-refresh`.

### 10.4 🟠 G — TypeScript 5.9 is fine but the `tsconfig.tsbuildinfo` (58k LOC) suggests project references are not yet split per package
The monorepo will produce 12+ `tsconfig.json` files. A single `tsconfig.tsbuildinfo` at the root means the build is monolithic.

**Fix**: configure TS project references per package (`tsconfig.base.json` already exists; wire up `references`). This is on the critical path for sub-1s incremental TS builds during sprint work.

### 10.5 🟠 G — `eslint-plugin-boundaries` is in `devDependencies` but the actual `eslint.config.js` is 12 KB and undocumented
The CI gate is the architecture (per `08-VISION §3` and `CRITICAL-REVIEW §A9`). `eslint.config.js` is 12,433 bytes and contains the layer rules. There is no doc in `00_NEW_ARCHITECTURE/` that links to that config as the *source of truth* for the layer model.

**Fix**: add to `08-VISION §4` a one-liner: *"The authoritative version of this layer model is `eslint.config.js` — if the diagram and the lint disagree, the lint wins."*

### 10.6 🟠 G — Deps for Yjs, msgpackr, BullMQ, OTel are missing
`package.json` shows `@msgpack/msgpack` (not `msgpackr`, which is faster and is what `ADR-004` assumes). No `yjs`, no `bullmq`, no `@opentelemetry/sdk-node`. The corpus assumes these are present; the codebase shows they are not.

**Fix**: install the chosen wire-format library (`msgpackr` per ADR-004, or amend ADR-004 to `@msgpack/msgpack`), Yjs, BullMQ, OTel SDK as part of S01 deliverables.

### 10.7 🟡 G — `@thatopen/components` (OBC) is at the root of dependencies and pulls in a huge transitive graph
`@thatopen/components`, `@thatopen/components-front`, `@thatopen/fragments`, `@thatopen/ui`, `@thatopen/ui-obc` — five OBC packages. The plan says they survive only inside `plugins/ifc-import/`. They are at the root today and contribute a large fraction of the bundle. The "demote OBC" sprint is S55. **For 18 months, every page load is paying for OBC.**

**Fix**: aggressive code-splitting of OBC *now* via `vite.config.ts` `manualChunks`, even before the plugin extraction. Document the bundle delta.

### 10.8 🟢 M — `bcrypt` is in dependencies but Node 20 + bcrypt has known native-build issues on Replit
A pure-JS alternative (`bcryptjs`) is more reliable in cloud environments. Marginal but worth flagging.

**Fix**: switch to `bcryptjs`.

---

## 11. Gaps on **rendering strategy**

### 11.1 🔴 G — Three rendering backends, two committers, no orchestrator
`packages/renderer/` claims dual WebGPU/WebGL2 (`ADR-006`). `apps/viewer/` may use a different code path. `src/render/` and `src/rendering/` are legacy. **Pathtracer** (`three-gpu-pathtracer`) is in dependencies for photorealistic. **OBC** has its own renderer. **Cesium** has its own. There is no document that says: *for any given scene, which backend is active, who decides, who switches, who flushes, who tears down*.

**Fix**: `SPEC-27-RENDER-ORCHESTRATION.md`. Define the matrix: viewport mode (3D / plan / section / sheet / panorama / pathtraced) × backend (WebGPU / WebGL2 / Canvas2D / Cesium / pathtracer) × who owns the canvas.

### 11.2 🔴 G — No "render mode contract" for what changes when WebGPU is unavailable
`ADR-006` says WebGPU when available, WebGL2 fallback. `SPEC-12-BUNDLE-SPLITTING §risks` mentions parity CI gate. But what *user-visible* features change between backends? Pathtracing? Edge rendering? Shadows? Bloom? Hatching? The contract should name the per-feature parity guarantee.

**Fix**: a per-feature parity matrix in `SPEC-04-DRAWING-ENGINE` and a separate one in `SPEC-27` (above).

### 11.3 🟠 G — No spec for *progressive* rendering during chunk streaming
Tier-streamed loading (`phases/PHASE-1D`) means chunks arrive over time. The render strategy during streaming is undefined: do you show a low-LOD placeholder per chunk and pop to high? Do you defer the first frame until enough chunks have arrived? Do you show a loading skeleton? Each has very different perceived performance.

**Fix**: `SPEC-28-PROGRESSIVE-RENDER.md` with the perceptual contract and the visual diff fixtures.

### 11.4 🟠 M — "Demand-driven render" + "frame scheduler owns rAF" + "post-FX (TRAA, SSGI)" cannot coexist as written
TRAA needs continuous frames to converge (~30 frames after a change). SSGI needs ~10. The plan says "post-motion accumulation gets a bounded 30-frame budget" (`CONFLICT-ANALYSIS §3.7`). That budget will be insufficient for indoor scenes with complex reflections. Either accept worse temporal AA on idle, or accept higher idle CPU.

**Fix**: define the trade-off explicitly. Either drop TRAA/SSGI from the architecture (leaving FXAA/MSAA only) or write the contract that says "idle CPU < 2% does not apply when post-FX is converging; budget = 30 frames; thereafter scene is frozen."

### 11.5 🟠 G — Selection rendering / hover preview / drag preview have no spec
Selection in Revit is a hot-path rendering concern (highlight overlay, edge thickening, hover scrim, drag ghost). Today's PRYZM uses a separate scene/material swap. The new architecture says selection is an L5 service, but no spec covers: per-frame cost target, conflict with post-FX, how it interacts with view-template visibility, whether the highlight is in the same render pass or a deferred composite pass.

**Fix**: extend `SPEC-04-DRAWING-ENGINE` or add to `SPEC-27`.

### 11.6 🟢 G — Edge rendering quality
Forma's edges look like CAD edges; PRYZM today's edges are commodity Three.js `EdgesGeometry`. No spec for the quality bar (anti-aliased? thickness-by-distance? visible-edge classification?).

**Fix**: per-feature in the parity matrix.

---

## 12. Gaps on **documentation strategy / 2D rendering**

### 12.1 🔴 M — Canvas2D rasteriser is the planned 2D backend; Revit-parity (D8) is the goal; **these are incompatible**
`CRITICAL-REVIEW §B4` and `CONFLICT-ANALYSIS §3.11` already flag this. Reiterating: Canvas2D produces hairlines that anti-alias to grey halos on most displays; line ordering is FIFO so dashed lines crossing solid lines look wrong; hatch patterns drift between zoom levels; PDF export from Canvas2D is rasterised-with-vector-overlay, not true vector. None of this matches Revit.

The SPEC and ADR say "vector primitives → 3 backends (Canvas2D / SVG / PDF)" but the codebase has only the Canvas2D backend partially implemented (`Canvas2D` empty file at root is symptomatic).

**Fix**: write `SPEC-29-VECTOR-PRIMITIVES.md` defining `Line | Polyline | Arc | Bezier | Hatch | Text` with stroke style, dash phase, hatch alignment, anti-aliasing strategy. Implement *all three* backends (Canvas2D + SVG + native PDF writer) before sheets/schedules ship in Phase 2C. The native PDF writer must avoid the SVG-to-PDF rasterisation path that `svg2pdf.js` does poorly.

### 12.2 🔴 G — No view-template / view-filter / view-range model
Revit's documentation power comes from view templates (a saved set of visibility/style overrides) applied to many views, view filters (rule-based overrides on top of templates), and view ranges (cut-plane top/bottom + view depth). PRYZM 2 docs do not contain a contract for any of these. `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` mentions plan view but does not specify view-templates.

**Fix**: `SPEC-30-VIEW-TEMPLATES.md`. Required *before* Phase 2B starts.

### 12.3 🔴 G — No annotation richness contract
Dimensions, leaders, callouts, revision clouds, tags, text styles, dimension styles — Revit ships these out of the box. PRYZM 2's plan mentions annotations once in Phase 2A. There is no contract for: dimension auto-update semantics on element move, leader bend rules, tag auto-positioning algorithm, revision cloud anchoring to elements, text-style inheritance.

**Fix**: `SPEC-31-ANNOTATIONS.md`. Required by Phase 2A.

### 12.4 🟠 G — No section-cut hatch (poche) spec
`CRITICAL-REVIEW §B4` flags poche fill is "missing." Adding: poche fill is what makes a section drawing readable. It is the difference between SketchUp-quality and Revit-quality output.

**Fix**: in `SPEC-29` (or a separate poche spec). Required by Phase 2B.

### 12.5 🟠 G — Sheet revisioning, title-block parameters, sheet sets — none specified
Phase 2C ships sheets/schedules but there is no contract for revisioning (the date stamps and revision clouds that engineers stake their licence on), title-block parameters (project number, client, scale), or sheet sets (groupings of sheets that print together).

**Fix**: extend the Phase 2C deliverables list with these items, *or* descope Sheets to "v1 = single sheet, no revisioning, no sheet sets" and document the descope.

### 12.6 🟠 G — Schedule formula language is "SUM, COUNT, IF" — that's not a language
A real schedule needs: conditional formatting, key schedules (a schedule whose rows define defaults for elements), embedded parameters (referencing element properties not on the row), grouping/sub-totals/grand-totals, cross-references. PRYZM's plan stops at three operators.

**Fix**: a schedule-DSL spec or a *named descope* ("schedule formulas v1 = SUM/COUNT/IF only; conditional formatting in v1.5; key schedules in v2").

### 12.7 🟢 G — Print preview / print-to-PDF round-trip is unspecified
Revit's "Print" workflow is a multi-page preview with collation, scaling, paper size. PRYZM's plan jumps to "PDF export" with no print model.

**Fix**: small, addable to the sheet spec.

---

## 13. Gaps on **core architecture** (additional, not covered above)

### 13.1 🔴 G — There is no "process boundary" diagram showing what runs in workers
A reader of `08-VISION §4` cannot tell which layers run in: main thread / web worker / shared worker / service worker / Node bake worker / Node sync server / Node AI worker. Layers ≠ processes. The corpus has not separated the two.

**Fix**: a "Layer × Process" matrix. Each cell answers: which thread does this layer run in for this process? L4 in Browser-Main (committer), L4 in Web-Worker (geometry), L4 in Bake-Worker (Node), L4 in AI-Worker (Node) — same code, four hosts. State this once.

### 13.2 🔴 G — No "boot sequence" for the editor
The editor at startup must: fetch manifest, hydrate stores from event log, mount canvas, register plugins, request first frame. The order matters (mount canvas before requesting frame; hydrate before plugin activation; etc.). There is no spec.

**Fix**: a `bootstrap.ts` design in `apps/editor/src/` and a sequence diagram in `01-TARGET`.

### 13.3 🟠 G — No "feature flag" framework
`02-ORCHESTRATION §2 Phase 0` mentions `PRYZM_NEW_ARCH=on|off`. The codebase has no flag library. Flags are essential to the strangler-fig pattern; without a real framework (per-user, per-tenant, server-evaluated, with kill-switch), the migration cannot ship safely.

**Fix**: pick a flag library (LaunchDarkly OSS / Unleash / homegrown YAML) and write `SPEC-32-FEATURE-FLAGS.md`. Flag-name lifecycle (created / staged / on / removed) belongs in here.

### 13.4 🟠 G — `ServiceRegistry` is asserted (P6 in `08-VISION`) but has no published API
Replacing 2,078 `(window as any)` casts with a typed registry needs: registration order, lazy init, circular-dep resolution, scoping (request? user? project?), test override.

**Fix**: write the `ServiceRegistry` contract as part of S01.

### 13.5 🟠 G — Time, units, locale
A BIM platform must be explicit about: linear units (mm? in? site units?), angle units, time zones (audit log), date format, currency (cost takeoff), language (i18n). Today's code has none of this consistently. The new architecture has nothing.

**Fix**: `SPEC-33-UNITS-AND-LOCALE.md`.

### 13.6 🟢 G — Error taxonomy
`ADR-020` mentions "structured errors not crashes." There is no error taxonomy (which errors are user-facing? which are dev-only? which trigger telemetry? which cause a project to be marked corrupt?).

**Fix**: a one-page error taxonomy in `SPEC-10-OBSERVABILITY`.

---

## 14. Mistakes (architectural)

### 14.1 🔴 The 36-month plan is calibrated for **solo founder + Replit Agent** while the architecture is sized for an 11-FTE team
Already in `CRITICAL-REVIEW §A4`. Not repeating; this is the load-bearing risk of the entire programme.

### 14.2 🔴 "Beats Forma/Qonic on every measured dimension" (`08-VISION §5`) is not what the matrix shows
Already in `CRITICAL-REVIEW §C` table. The honest claim is win-on-D1–D7, D10; match-on-D8–D9; lose-on geometric robustness, IFC certification, scale, sustainability, GIS depth.

### 14.3 🔴 "Path A (vanilla TS) preserves 390k LOC" — but most of that 390k LOC has to be *rewritten* for the new layer model
The vanilla-TS decision saves the *language*, not the *code*. The 264 commands, the legacy serializer, the 58 rAF owners, the 2,078 globals, the OBC import sites all have to be rewritten regardless. The "preservation" is largely rhetorical.

**Fix**: rewrite `09-AS-IS-VS-TO-BE §L7` to acknowledge: the 390k LOC is the reference *behaviour*, not the reference *implementation*. Most of it will be rewritten under the layer model.

### 14.4 🟠 The "K1-C multiplier" of 3 days per element family is fiction
Already in `CRITICAL-REVIEW §D5`. Real number is more like 2–6 weeks per family if you're solo.

### 14.5 🟠 "Delete legacy in S61" is a single-sprint big-bang
Already in `CRITICAL-REVIEW §D6` and `CONFLICT-ANALYSIS §5.3`. Stage S55–S60 dual-run, S61 flag flip, S62 delete.

### 14.6 🟠 Calling a Cloudflare Worker AI relay an "L7.5 architecture" is a category error
`server.js`: *"AI upstream: Cloudflare Worker relay → https://flat-morning-358d.antoniocanerosan.workers.dev/."* That worker is a single user's tunnel to Anthropic. It is not an architectural component; it is a stop-gap. The L7.5 design should *replace* it with a first-party AI worker that has its own scaling, quotas, and observability.

**Fix**: name the worker as a deprecated stop-gap, schedule its retirement as part of S04 (when AI host scaffolds).

### 14.7 🟠 Yjs as the "sole conflict resolution layer" for parametric BIM is novel CS asserted as proven
Already in `CRITICAL-REVIEW §B3`. No published BIM tool runs Yjs as the only conflict layer. PRYZM 2 is not just adopting Yjs; it is **proving Yjs works for BIM**, which is a research project, not an implementation.

**Fix**: name it as the research bet, plan a 4–6 week prototype before S48 (Beta), and define the fallback (operational locking with explicit merge) in case Yjs fails on real BIM workloads.

### 14.8 🟢 `eslint-plugin-pryzm-no-raf` is named in three docs and does not exist
Will need to be authored. Trivial but flag it as Sprint 1 work.

---

## 15. Performance issues (not already covered in §7)

### 15.1 🔴 The legacy editor mounts every plugin / every command on boot
`server.js` startup loads dozens of routes at boot. `src/main.ts` (9 KB) likely does the same on the client. The new architecture says "lazy plugin activation" (`SPEC-09-PLUGIN-SDK`). Until that ships in Phase 1, every editor user is paying the full TTI cost. The 1.8 MB bundle target is unreachable while this is true.

**Fix**: an interim measure — split the legacy editor into "always-on" + "lazy" *now*, before the plugin SDK arrives. Even a 30% bundle reduction wins back months of "unable to test the new architecture's bundle gate" risk.

### 15.2 🟠 `tsconfig.tsbuildinfo` (58k LOC) and `package-lock.json` (435 KB) suggest no incremental TS build at the package level
TS recompile during sprint work is on the critical path for solo+agent productivity. A 30 s tsc cold-start is a 4× slowdown on the feedback loop.

**Fix**: enable TS project references (also in §10.4).

### 15.3 🟠 Bake-worker chunk granularity is unspecified
`02-ORCHESTRATION §3 Phase 3` says "groups geometry by level." `01-TARGET §2.1` shows `chunks/levels/L0.geo.glb` and `chunks/libraries/walls.lib.glb`. But:
- One mega-chunk per level is too coarse — every wall edit invalidates the whole level.
- One chunk per element is too fine — N×M HTTP requests crush the CDN.

What is the granularity? Per-level + per-200-elements? Per-room? Adaptive? No spec.

**Fix**: chunk granularity contract in `SPEC-02-PERSISTENCE` or the file format spec.

### 15.4 🟠 No spec for *interaction frame budget* split across L4 / L5 / L7
60 fps = 16.6 ms / frame. How much for kernel? committer? renderer? UI react? The spec talks about edit-to-paint < 33 ms but does not split the budget. Engineers will optimise locally and the budget will silently overspend.

**Fix**: one row per layer in `SPEC-11-TESTING` benches: *L4 < 4 ms, L5 commit < 4 ms, L5 render < 6 ms, L7 react < 2 ms* — make the numbers explicit.

### 15.5 🟢 Cesium and pathtracer on the same page → GPU contention
Two GPU consumers competing for context. No spec says they cannot be on screen together.

**Fix**: lock-out rule in `SPEC-27-RENDER-ORCHESTRATION`.

---

## 16. Missing links (in general)

### 16.1 🔴 The README "Read in order" still includes superseded documents
`02-ORCHESTRATION` and `05-IMPLEMENTATION-PLAN` are explicitly superseded by `10-MASTER`. They are still in the canonical reading order.

**Fix**: prune the reading order to the binding documents only; relocate superseded ones to "Historical."

### 16.2 🔴 `00_Contracts/` lives in parallel with `00_NEW_ARCHITECTURE/` and the `CONFLICT-ANALYSIS.md` says contracts win unless overridden
Already in `CRITICAL-REVIEW §A1, §A3` and `CONFLICT-ANALYSIS §2`. The dual-corpus regime is the worst option. Either rewrite the contracts under NEW_ARCH or relocate `00_Contracts/` to `archive/`.

**Fix**: `archive/00_Contracts/` move + `_README.md` redirect.

### 16.3 🔴 Twelve ADRs are listed as pre-Sprint-1 prerequisites in `05-IMPLEMENTATION-PLAN §17`; PROCESS-TRACKER shows most unstarted; sprint S01 is in flight
Already in `CRITICAL-REVIEW §D1`. The work is being done on undecided foundations.

**Fix**: stop S01 work that depends on undecided ADRs; ratify them this week.

### 16.4 🟠 No "newcomer onboarding" doc
A new contractor (or you on a Monday morning) opens the repo and sees `docs/` with 50+ files in the new arch alone. There is no two-page onboarding doc that says: *"To start: read the identity sentence, the 8 layers, the binding hierarchy, and the current sprint card. Skip the rest until you need it."*

**Fix**: a 1-page `START-HERE.md`.

### 16.5 🟠 No "how do I add an X?" cookbook
*"How do I add a new element family? Write a new command? Wire a new plugin? Add a CI gate? Create a new view type? Bake a new chunk type?"* — none of these have step-by-step recipes. Without them, every new feature re-derives the architecture.

**Fix**: a `cookbook/` folder with one recipe per add.

### 16.6 🟠 No `.env` schema or "secrets contract"
The startup banner shows: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRYZM_OWNER_EMAIL, PRYZM_OWNER_PASSWORD, SESSION_SECRET, CF_WORKER_URL, DATABASE_URL, plus implied STRIPE_*. There is no `.env.example` and no `SPEC-34-ENVIRONMENT.md`.

**Fix**: a single canonical secrets list with description, owner, rotation policy.

### 16.7 🟢 No links between SPECs and the PHASE docs that consume them
SPECs are referenced from ADRs but not from the PHASE docs that need them as preconditions. A reader of `phases/PHASE-1B` cannot tell which SPECs they need to read first.

**Fix**: a "Preconditions: SPECs" header on each PHASE doc.

---

## 17. Gaps on **implementation** (codebase ↔ docs delta)

### 17.1 🔴 The boundaries-lint gate is in `eslint.config.js` (12 KB) but the rule body has not been audited against the 8-layer model
The CI gate is the architecture. Without a doc-level audit of the rule body, the lint may permit imports that the architecture forbids (and vice versa). Today nobody can tell from the docs alone whether `eslint.config.js` actually encodes the layer rules from `08-VISION §4`.

**Fix**: a one-page table in `08-VISION` (or appendix) listing each layer pair and the lint outcome (allow / deny / allow-with-exception). Generate from the lint config itself if possible.

### 17.2 🔴 `packages/schemas/` exists with Zod schemas; the legacy editor does not validate against them on the hot path
Until validation is a hot-path requirement (Zod parse on every command), the schemas are documentation that drifts. Zod has perf cost; it must be opt-in per command, not "it's just there."

**Fix**: a S01 deliverable — `command.dispatch()` validates the payload through the relevant schema. Bench gate: the validation cost is included in the edit-to-paint budget.

### 17.3 🟠 `apps/editor/` and `src/component-editor/` — two "editors" inside PRYZM
Same problem as four renderers (§3.4). Pick the editor that ships, name it, and label the other. (The root-level `editor/` is the *Pascal Editor* reference project — not PRYZM, not counted.)

### 17.4 🟠 No `apps/viewer/` exists
`02-ORCHESTRATION §2 Phase 7` and `08-VISION §6` mention a "viewer-only build" with bundle < 800 KB. There is no `apps/viewer/` in the workspace. The bundle target is fictional.

**Fix**: scaffold `apps/viewer/` in S01 with a stub that imports only the read-only path. Measure the bundle.

### 17.5 🟠 `apps/site/` (marketing) and `apps/component-editor/` are also missing
Listed in `06 §3.310` as part of the 7 apps. Not in the workspace.

**Fix**: scaffold all 7 apps with `package.json` placeholders so the `pnpm-workspace.yaml` is real.

### 17.6 🟠 The `AGENT.md` / `replit.md` is 422k characters
That's not a README; that's a transcript. New contributors (or you on a Monday) cannot ingest it.

**Fix**: truncate `replit.md` to a 2-page operating doc; archive the rest under `docs/replit-history/`.

### 17.7 🟠 `attached_assets/` is 84k entries
Project metadata pollution. Slows `git`, slows search, slows CI. Likely contains historical screenshots and generated artefacts that don't belong in `main`.

**Fix**: audit, move to a separate branch / Git LFS / object store, leave a `.gitignore` rule.

### 17.8 🟢 `Canvas2D` (root, empty file) is a smell
Suggests an aborted scaffolding step. Either delete or document.

### 17.9 🟢 `tests/` exists with `pryzm1` tests
Per `package.json` `test:pryzm1`. No `tests/pryzm2/` for the new architecture. The PHASE docs reference fixtures and parity tests but the directory layout is undefined.

**Fix**: define `tests/pryzm2/` layout in `SPEC-11-TESTING`. Required by S01.

---

## 18. Top 12 things to fix this week (priority-ordered)

1. **Write `SPEC-26-PRYZM-FILE-FORMAT.md`.** Highest-priority binding document, missing entirely. Without it, every persistence/sync/bake spec is approximate.
2. **Pick the deployment topology** (Replit Autoscale + Reserved VM + Upstash Redis + R2 vs alternatives). Document in `SPEC-15-DEPLOYMENT-TOPOLOGY.md`. Without it, no `apps/*` server can be designed correctly.
3. **Ratify ADR-002 (CRDT/event-log bridge)** with code-level interfaces. Stop S01 work on the wire format until it lands.
4. **Produce a single-page database/storage map** (`SPEC-24-DATA-STORE-MAP.md`). One row per entity, four columns (today / M12 / M24 / M36 / migration sprint).
5. **Resolve the React-in-bundle question** with a one-line ADR amendment. Either React is forbidden in `apps/editor/` (lint enforced) or the bundle target is wrong.
6. **Move `02-ORCHESTRATION.md` and `05-IMPLEMENTATION-PLAN.md` to `archive/`.** Prune the README's "Read in order."
7. **Move `00_Contracts/` to `archive/00_Contracts/`** and write the ~12 short replacement contracts under NEW_ARCH that match the layer model.
8. **Land a working `tools/load-bench/`** as the literal first deliverable of S01. Without it, every CI gate downstream is meaningless.
9. **Write `SPEC-13-CONTEXT-ENVELOPES.md`** before the wall producer (S07). Defines `WallContext`, `DoorContext`, `SlabContext` so the kernel stays pure.
10. **Write `SPEC-21-ELEMENT-CREATION-PROTOCOL.md`** so every element family in Phase 1B–2A follows the same recipe.
11. **Write `SPEC-29-VECTOR-PRIMITIVES.md`** + a working SVG and native-PDF backend, before any sheet/schedule code in Phase 2C.
12. **Re-cost the 36-month plan** for solo + Agent (real numbers) and publish the **named cut list** of what gets dropped at velocity slip 20% / 40% / 60% (ADR-018 has the slot; the table is empty).

---

## 19. Closing observation

The new architecture corpus is *thoughtful* — there is more discipline in `08-VISION` and `CONFLICT-ANALYSIS` than in 99% of architecture documents. The risk is not that the corpus is sloppy. The risk is that the **gap between the corpus and the running code is wider than the corpus admits**, and that the **delivery model (solo + Agent) is not sized for the scope (8 CI gates + 17 benches + 7 apps + 30 plugins + 12 packages + AI layer + sync server + bake worker + IFC + plugin marketplace)**.

The single highest-leverage move is to *cut scope until it matches capacity*, write the few missing foundational specs (file format, deployment topology, context envelopes, element-creation protocol, vector primitives), and stop adding documents to a corpus that is already harder to read than the code it describes.

Be ruthless about deleting documents that the new ones supersede. The discipline you wrote into `08-VISION §9` applies to docs as much as to code.

*— End of gap review.*

---

# PART II — DEEP-DIVE ADDENDUM (added 2026-04-27, evening)

> Sections 1–19 above were the *first pass*. After your instruction to "GO MUCH DEEPER, EVERYTHING IN THE SAME DOC, DON'T MISS ANYTHING," I re-read every ADR, every SPEC, every PHASE, every audit, every src/ subdir at the file level, and dissected `server.js` route-by-route. This addendum is the result. It is brutal and exhaustive on purpose. Severity tags (🔴 critical / 🟠 high / 🟡 medium / 🟢 low) are used throughout.
>
> **Headline correction to Part I:** the audit `PHASE-1-RE-AUDIT-2026-04-27.md` reports Phase 1 closed at **100/100** with 12 element families end-to-end, 18 bench gates GREEN, 5 ESLint rules live, and 163 parity fixtures passing. Part I's tone — "nothing has been built" — was wrong about the *foundation tier*. What hasn't been built is the *upper tier* (sync, AI layer, plugin SDK, plan view migration, multi-user). The gap that matters now is **between an internally-clean P1 and the impossible P2/P3 ahead**, not between vision and zero.

---

## 20. ADR-by-ADR forensic audit (22 present, 3 missing)

For each ADR I report: **status** (Accepted / Proposed / Stale), **what it locks**, **what it leaves open**, **where it conflicts** with another ADR, SPEC, or vision doc.

### 20.1 🟢 ADR-001 — Pascal adoption
- **Status:** Accepted. Reference editor is `/editor` (Pascal Editor) for *terminology and visual hierarchy*, not a code dependency.
- **Locks:** the visual reference. **Open:** none material.
- **Conflicts:** none. Part I §5.3 is correct as amended.

### 20.2 🔴 ADR-002 — CRDT / event-log bridge
- **Status:** Accepted (`adrs/ADR-002-crdt-event-log-bridge.md`). The bridge is **two byte streams**: durable event log (Postgres, ULID-ordered, source of truth) + Yjs CRDT (replay buffer for fast presence/typing).
- **Locks:** Y.Doc is *reconstructed* from event log on session start (`SPEC-03:93–100`). `applyCommandToYDoc` and `yDocUpdateToCommand` are the two translator boundaries.
- **Open:** the *failure modes* — what happens when (a) Yjs update arrives but event-log write fails, (b) event-log write succeeds but Yjs broadcast drops, (c) two clients diverge by >5s of lag, (d) the snapshot compaction (>500k events / >1GB, `SPEC-02:64–77`) collides with an in-flight session.
- **Conflicts:**
  - **🔴 vs `08-VISION §4 P4`** ("single source of truth"). Two byte streams with translation glue is *de facto* two sources. The vision says "the event log is the truth, Y.Doc is a cache" but ADR-002 doesn't enforce this — `yDocUpdateToCommand` is bidirectional.
  - **🟠 vs ADR-019 (soft-lock semantics).** Soft locks have TTLs of 60s/30s/120s/600s (`SPEC-03:123`). If the event log crashes during a 600s AI-batch lock and Yjs has the lock recorded but no durable evidence, locks survive longer than the system's idea of "I am alive."
- **Verdict:** the highest-risk distributed-systems decision in the project. Needs a **failure-mode test matrix** in `SPEC-11-TESTING` and a **chaos test suite** before S43 (Yjs sprint).

### 20.3 🟡 ADR-003 — Object storage (R2 + MinIO)
- **Status:** Accepted. Cloudflare R2 for managed cloud, MinIO for self-hosted.
- **Locks:** S3-compatible API surface so client code is identical.
- **Open:** **R2 ↔ Postgres consistency** — partially answered by `SPEC-02:130–134` (event log is master; on R2 lag, fall back to client-side baking via the kernel). Not yet answered: **what is the SLA for R2 → loader cache hit on a cold session?** `08-VISION §6` says "first useful triangle ≤ 800ms"; if a cold load includes an R2 round-trip + Draco decompress + kernel fallback rebake, that budget is unrealistic on a typical residential network.
- **Conflicts:**
  - **🟠 vs `08-VISION §6`** cold-load budget (800ms). Needs measured baseline before S20.

### 20.4 🟢 ADR-004 — Wire format (MessagePack)
- **Status:** Accepted. MessagePack for command payloads, Protobuf considered and rejected (toolchain weight).
- **Locks:** binary command transport.
- **Open:** schema evolution policy (does MessagePack tag every field? what's the migration story for command shape changes?). Touched by `packages/file-format/migrations/` (`SPEC-02:100–116`) but not bound to wire format.
- **Conflicts:** none material.

### 20.5 🟠 ADR-005 — Worker pool policy
- **Status:** Accepted. **BullMQ on Redis + Node `worker_threads`** for the bake worker.
- **Locks:** queue topology, worker isolation model.
- **Open:** **worker thread vs separate process** — Node `worker_threads` share heap pages with the parent, so a kernel OOM in a bake job kills the whole worker process. For 100MB+ models with manifold-3d CSG, this is non-trivial.
- **Conflicts:**
  - **🟠 vs ADR-009 (plugin sandbox).** Plugins run in a Web Worker on the client; bake jobs run in `worker_threads` on the server. Two different isolation models for "untrusted code that does geometry." Plugins eventually run on the server too (per `SPEC-09:79`), at which point we either add Node worker isolation for plugins or accept that server-side plugins are fully trusted.

### 20.6 🟡 ADR-006 — Default render mode (WebGPU primary, WebGL2 fallback)
- **Status:** Accepted, **strategic**, requires spike at S06 per `PHASE-1A`.
- **Locks:** WebGPU is the target; WebGL2 is the fallback for older browsers.
- **Open:** **what triggers fallback?** Detection-only (no `navigator.gpu`)? Performance-based (FPS < 30 for N seconds)? Per-feature (e.g., compute-shader edge projection only on WebGPU)?
- **Conflicts:**
  - **🟡 vs current code.** `src/core/` references `WebGLRenderer` paths only (Three.js classic). No WebGPU shim exists. The S06 spike is therefore not a *spike* — it's a *port*.
  - **🟡 vs `node_modules/three` version pin.** WebGPURenderer is in `three/examples/jsm/renderers/webgpu/` and was unstable through r161; we need to pin Three to a known-WebGPU-stable version (r170+) and verify drei/fiber compatibility. No ADR records the pin.

### 20.7 🟠 ADR-007 — Telemetry backend (Tempo + Honeycomb dual-export)
- **Status:** Accepted.
- **Locks:** OpenTelemetry SDK in client and server, dual-export to managed (Honeycomb) and self-hosted (Tempo).
- **Open:** **cost.** Honeycomb's pricing scales with event volume; with `SPEC-10:34–38` defining 100% sampling for L0 spans + 100% error sampling for L1, the bill at GA scale (10k DAU × 100 spans/session × 30 days) is non-trivial. The 7-day retention assumption (`SPEC-10:87`) is hopeful, not budgeted.
- **Conflicts:** **🟡 vs ADR-018 (capacity cut-list).** ADR-018 has an empty cut table; observability cost belongs in the cut hierarchy.

### 20.8 🟠 ADR-008 — IFC scope
- **Status:** Accepted, ringfenced.
- **Locks:** IFC2x3 + IFC4 import/export only; no IFC4.3, no IDS, no BCF in the core. `@thatopen/components` and `web-ifc` are explicitly **lazy-loaded plugins** (`SPEC-12:37–43`).
- **Open:** **IDS validation** is a real-world enterprise requirement and is left to "post-GA" (`SPEC-08` doesn't even mention it).
- **Conflicts:**
  - **🟠 vs `09-AS-IS-VS-TO-BE §8.x`** which lists IFC mapping for Walls, Doors, Windows, Slabs, Roofs as in-scope for Phase 1B–1C type catalog (`SPEC-05:170–194`). Phase 1 therefore needs IFC entity definitions even if the importer is lazy. The dependency is one-way (we need entity *names* and Pset shapes for type catalog) but isn't documented.

### 20.9 🟠 ADR-009 — Plugin sandbox
- **Status:** Accepted.
- **Locks:** Web Worker isolation for 3rd-party plugins; "fast-path" main-thread for first-party plugins (`SPEC-09:79, 103`).
- **Open:** **first-party / 3rd-party trust boundary.** Who decides? Is it a manifest field or a signing key? `SPEC-09` shows a `kind` field but not a signing scheme.
- **Conflicts:**
  - **🔴 vs SPEC-09 manifest schema.** `permissions: read/write/ui/network` is binary; there's no granularity for *which entities* a plugin can write. A plugin with `write` can mutate Walls and AI proposals indistinguishably. ADR-011 (permission granularity) was supposed to resolve this — see 20.11.

### 20.10 🟡 ADR-010 — Bake debounce
- **Status:** Accepted.
- **Locks:** debounce window (~500ms) before bake worker enqueues.
- **Open:** **multi-user debounce.** With 5 users editing concurrently, the debounce window is per-user or per-project? If per-user, baking thrashes; if per-project, last-writer-wins on the bake input. `SPEC-03` says event log is ordered, so per-project debounce is implicit, but the ADR doesn't say.

### 20.11 🔴 ADR-011 — Permission granularity
- **Status:** Accepted, but the granularity it locks is **role-based**, not entity-based. The matrix in `SPEC-08:73–86` has Owner/Admin/Editor/Reviewer/Viewer × Action.
- **Locks:** RBAC per workspace.
- **Open:** **per-element / per-discipline / per-level permissions** — the kind real BIM teams need ("the structural engineer cannot modify finishes; the MEP engineer cannot modify structural"). `SPEC-06:109–115` defines discipline-scoped levels but doesn't tie them to permissions.
- **Conflicts:**
  - **🔴 vs ADR-009.** Plugin permissions are coarse (`read/write/ui/network`), workspace permissions are role-based, AI permissions are queue-based. **Three different permission models** with no unified `Authority` table.

### 20.12 🟢 ADR-012 — Self-host minimums
- **Status:** Accepted.
- **Locks:** Postgres ≥ 14, Redis ≥ 7, MinIO ≥ 2024.x, Node ≥ 20.
- **Conflicts:** **🟠 vs `package.json`.** `engines` field declares `node >= 20.0.0`; `camera-controls@^2.10.0` requires Node ≥ 22.0.0 per its `package.json`. This is an *active* peer-dep mismatch, not a future risk. (Per Part I §6.4.)

### 20.13 🟡 ADR-013 — Persistence operational
- **Status:** Accepted.
- **Locks:** PITR enabled, snapshot strategy (every 500k events / 1GB), per-tenant DB schema namespacing.
- **Open:** **backup verification cadence.** Not specified; "test restore once a quarter" or "weekly automated restore + checksum" is a 10× difference in cost and confidence.

### 20.14 🟠 ADR-014 — AI L7.5 operational
- **Status:** Accepted.
- **Locks:** L7.5 layer with its own approval queue (`SPEC-07:96–121`); model pinned to exact version + system-prompt SHA (`SPEC-07:139–143`); per-actor / per-plugin / per-project budgets (`SPEC-07:175–189`).
- **Open:** **what happens when a pinned model is deprecated by the vendor.** Anthropic / OpenAI deprecate models on ~6-month cycles; the ADR doesn't define the migration path (re-pin? re-test all proposals? freeze user workflows?).
- **Conflicts:**
  - **🔴 vs `08-VISION §1`** which says "AI from day one." Master plan (`10-MASTER-PLAN:36`) defers L7.5 architectural integration to **Month 25** (Phase 3A). Day-one AI is therefore scaffolded (some `/api/ai/*` routes exist in `server.js`) but not architecturally first-class until Phase 3.

### 20.15 🟡 ADR-015 — Visibility-Intent placement
- **Status:** Accepted.
- **Locks:** Visibility-Intent moves from L7 (presentation) to its own plugin under `plugins/visibility-intent` (per src/visibility audit).
- **Open:** **migration of the 11-wave VG → Intent system.** PHASE-2B carries the 11-wave system over while refactoring the plan-view canvas host (the highest-risk sub-project per `10-MASTER-PLAN:30`).
- **Conflicts:**
  - **🟠 vs `src/migration/VGToIntentMigration.ts`.** A migration already exists in legacy code. Is it still authoritative, or does the plugin re-implement? The phase docs say "port"; the audit says "REFACTOR INTO `plugins/visibility-intent`." Resolve before S31.

### 20.16 🟡 ADR-016 — Drawing engine architecture
- **Status:** Accepted.
- **Locks:** vector-first (Lines / Polylines / Arcs / Polygons / Text / Symbols, `SPEC-04:42–50`), ISO-13567 stroke styles, hidden-line classification (Cut / Beyond / Hidden / Symbolic, `SPEC-04:142–155`).
- **Open:** **performance budget for hidden-line on a 100-room model.** Hidden-line is O(n²) naively; even with BVH it's 30–500ms per view. `SPEC-04` doesn't pin a budget.
- **Conflicts:**
  - **🟠 vs `08-VISION §6`** ("first useful triangle 800ms" — applies to 3D, but plan-view first-paint isn't budgeted at all in the vision). Need a `08-VISION §6.x` plan-view subsection.

### 20.17 🟡 ADR-017 — Type catalog scope
- **Status:** Accepted.
- **Locks:** System families (Wall/Floor/Roof/Stair) and Loadable families (Door/Window/Furniture); inheritance order `instance.parameters[k] ?? type[k] ?? family.defaults[k]` (`SPEC-05:75`).
- **Open:** **Curtain Wall mullions.** Listed as post-GA in `SPEC-05:258`, but `09-AS-IS-VS-TO-BE` claims curtain wall is in Phase 1B (already shipped per re-audit). This is a definitional gap: the curtain-wall *element family* is implemented; the curtain-wall *type system* (custom mullion profiles, panel patterns) is post-GA. Document the difference in `SPEC-05`.

### 20.18 🟢 ADR-018 — Capacity cut-list
- **Status:** Accepted, **table empty.**
- **Locks:** the *slot* for the named cut list at velocity slip 20% / 40% / 60%.
- **Open:** literally everything. Until this table is populated, "we will cut scope" is decorative.
- **Action:** mandatory population before S07 (start of Phase 1B). See Part I §18 item 12.

### 20.19 🟡 ADR-019 — Soft-lock semantics
- **Status:** Accepted.
- **Locks:** TTLs (edit 60s / transform 30s / parametric 120s / AI batch 600s, `SPEC-03:123`); `LockRecord` shape with `expiresAt`, `ownerActorId`, `reason`.
- **Open:** **lock escalation / steal.** What if an admin needs to break a 600s AI-batch lock? `LockRecord` doesn't expose a `force_release` action or audit trail.
- **Conflicts:** **🟠 vs ADR-002** (see 20.2 — TTL vs durable evidence of liveness).

### 20.20 🟡 ADR-020 — Kernel robustness
- **Status:** Accepted.
- **Locks:** coordinates ±10km, feature size 0.1mm, snap epsilon 0.5mm, angular tolerance 0.001°, max 2M vertices/mesh (`SPEC-01:57–68`); manifold-3d for CSG (exact predicates).
- **Open:** **what happens at the boundary** — a 12km building (rare but real, e.g., airport terminal) fails the 10km bound. No graceful degradation defined.
- **Conflicts:** none material.

### 20.21 🔴 ADR-021 — Enterprise security & data residency
- **Status:** Accepted.
- **Locks:** SAML 2.0, OIDC, SCIM 2.0 (`SPEC-08:47, 132–136`); EU-West and US-East data residency with tenant pinning (`SPEC-08:190–197`); WebAuthn deferred to Phase 3D (`SPEC-08:57`); explicit service-role-key removal (`SPEC-08:119`).
- **Open:** **SOC2 Type II audit budget.** ADR mentions ~$30k. That's the audit fee; it does not include the engineering cost of evidence collection (3–6 person-months across logging, access reviews, change management, vendor management). For a solo founder, this is a quarter of the year. ADR-018's empty cut list does not yet say "drop SOC2 if velocity slips 40%."
- **Conflicts:**
  - **🔴 vs solo-founder reality.** SOC2 + SCIM + SAML + dual-region residency is a 2–4 FTE compliance program, not an afterthought.
  - **🟠 vs `SPEC-08:119` "service-role-key removal."** Current `server.js` uses Supabase service role keys (per repo grep). Removal is a non-trivial refactor of every server-side data path.

### 20.22 🟠 ADR-024 — Constraint solver
- **Status:** Accepted.
- **Locks:** **planegcs** (the JS port of OpenCascade's GCS) for 2D geometric constraints.
- **Open:** **3D constraints, surface tangency, non-linear constraints** — all explicitly out of scope post-GA (`SPEC-01:118–121`). Stair geometry is constraint-heavy in 3D.
- **Conflicts:**
  - **🟠 vs PHASE-1C stair sprint (S14).** PHASE-1C plans "Stair producer first impl (straight, L, U) in 7 days" without 3D constraints. Stairs are *exactly* the case where 3D constraints help (riser/tread/landing/nosing relationships). Either stairs are simpler than PRYZM 1's stair (which uses `src/constraints/StairConstraintEngine.ts`, 1,078 LOC supporting it) or the 7-day estimate is wrong.

### 20.23 🔴 ADR-022 / ADR-023 / ADR-027 — **MISSING**
- **Referenced by:** various SPEC and PHASE docs (per Part I §15.1).
- **Status:** **No file in `adrs/`.** Not present, not stub, not "TODO."
- **Impact:** any sprint that depends on these is unstarted by definition. The audit in `PHASE-1-RE-AUDIT-2026-04-27.md` does not flag the missing ADRs because Phase 1 sprints (S01–S24) do not reference them; Phase 2 sprints will.
- **Action:** before S25 (Phase 2A start), write all three or remove every reference.

---

## 21. SPEC-by-SPEC forensic audit (12 SPECs, ~9 missing)

**Present (12):** SPEC-01 Geometry, SPEC-02 Persistence, SPEC-03 Sync-CRDT, SPEC-04 Drawing, SPEC-05 Type Catalog, SPEC-06 Rooms-Levels, SPEC-07 AI Layer, SPEC-08 Security, SPEC-09 Plugin SDK, SPEC-10 Observability, SPEC-11 Testing, SPEC-12 Bundle Splitting.

**Missing but referenced or required:** SPEC-13 Context Envelopes, SPEC-15 Deployment Topology, SPEC-21 Element Creation Protocol, SPEC-24 Data Store Map, SPEC-26 PRYZM File Format, SPEC-27 Migration & Rollback, SPEC-28 AI Cost Model, SPEC-29 Vector Primitives, SPEC-30 Plan-View Performance Budget. (Per Part I §10–15 and addendum §22.)

For each present SPEC: **lock-in statements**, **hand-waved bits**, **contradictions**, **silently-required dependency packages.**

### 21.1 🟡 SPEC-01 — Geometry Kernel
- **Concrete:** `BufferGeometryDescriptor` outputs; `Result<T, KernelError>`; `forbiddenDependencies` lint enforces purity (no THREE, no DOM, no I/O); analytic vs display split (centerline/axis vs swept solid, `SPEC-01:30–34`); robustness budget (see ADR-020); manifold-3d for CSG; planegcs for 2D constraints.
- **Hand-waved:** NURBS / b-rep "kernel-swap path Phase 3+" (`SPEC-01:86`); 3D constraints, surface tangency, non-linear post-GA (`SPEC-01:118–121`).
- **Conflicts:** none directly; aligns with `08-VISION §3 P1`.
- **Silently-required packages:** `packages/ids/`, `packages/scene-cache/` (referenced at `SPEC-01:20, 48` but **not yet scaffolded** per the dull-leafbird audit). Phase 1 cannot ship without them.

### 21.2 🟢 SPEC-02 — Persistence
- **Concrete:** `events` table schema with `ulid`/`sequence`/`payload` (`SPEC-02:33–45`); `.pryzm` ZIP layout `manifest.json` + `events/*.evt.bin` + `chunks/*.glb` (`SPEC-02:173–190`); compaction trigger (>500k events / >1GB) and algorithm (replay → projection → `__snapshot.v1` event → archive); R2-vs-Postgres consistency rule (event log master, R2 cache, kernel fallback).
- **Hand-waved:** multi-region replication post-GA (`SPEC-02:137`); archive retention "configurable" (`SPEC-02:240`).
- **Conflicts:** none material; resolves the R2/Postgres gap explicitly.
- **Note:** **this SPEC alone resolves ~30% of Part I's persistence concerns.** I missed it in the first pass.

### 21.3 🟠 SPEC-03 — Sync-CRDT
- **Concrete:** L2↔L3 translator pair (`applyCommandToYDoc`, `yDocUpdateToCommand`, `SPEC-03:64–85`); soft-lock TTLs (60/30/120/600s, `SPEC-03:123`); event-log bridge confirmed (`SPEC-03:93–100`).
- **Hand-waved:** "merge log queryable by the AI" (`SPEC-03:187`) — table is defined but the AI query interface isn't.
- **Conflicts:** see ADR-002 forensics (20.2).
- **Risk:** the translator pair is the single highest-stakes interface in the codebase. Bug here = data loss or session divergence. Needs property-based testing (fast-check in `SPEC-11`) **plus** chaos testing **plus** a lock-step replay harness against PRYZM 1's command log. None of those harnesses exist yet.

### 21.4 🟡 SPEC-04 — Drawing Engine
- **Concrete:** vector primitives; ISO-13567 stroke styles; hatch styles (concrete/brick/...); hidden-line classification.
- **Hand-waved:** force-directed labels Phase 3B (`SPEC-04:252`); ML-assisted placement post-GA (`SPEC-04:259`); 3D visualisation styles (watercolour, sketch) post-GA (`SPEC-04:306`).
- **Conflicts:** correctly downgrades "matches Revit MEP/Structural" claim to post-GA (`SPEC-04:196`) — honest.
- **Silently-required packages:** `packages/drawing-canvas2d/`, `packages/drawing-svg/`, `packages/drawing-pdf/` — all future-tense.

### 21.5 🟡 SPEC-05 — Type Catalog
- **Concrete:** System vs Loadable family split; inheritance order; `WallTypeSchema` / `WallInstanceSchema` / `WallLayerSchema` (Zod, `SPEC-05:49–103`); IFC Pset mapping.
- **Hand-waved:** Curtain Wall custom mullion profiles post-GA (`SPEC-05:258`); MEP families Phase 3+ (`SPEC-05:259`).
- **Conflicts:** see ADR-017 (20.17) — the family-vs-type split is real but undocumented at the audit level.
- **Silently-required packages:** `packages/material-library/`, `packages/types-schema/`.

### 21.6 🟡 SPEC-06 — Rooms & Levels
- **Concrete:** hierarchy (Project → Site → Building → LevelGroup → Level → Room); level geometry types (Flat/Split/Sloped/Mesh); discipline groups for arch/struct/MEP; room bounding (wallBound auto-seed or sketched, `SPEC-06:145–157`).
- **Hand-waved:** multi-level rooms Phase 3A (`SPEC-06:181`); Cesium basemap streaming Phase 3D (`SPEC-06:206`).
- **Conflicts:** **🟠 vs `src/spatial/RoomGraphService.ts`** (1,738 LOC). PRYZM 1 has a working room graph; SPEC-06 redesigns it. Migration plan ("PORT to `plugins/rooms`") doesn't say which behaviours port verbatim and which get dropped. Risk of regression at S29 (Phase 2A rooms sprint).

### 21.7 🟠 SPEC-07 — AI Layer (L7.5)
- **Concrete:** approval queue (`actor_kind='ai'`, `SPEC-07:96–121`); model pinning (exact version + prompt SHA); cost guardrails (per-actor/plugin/project, `SPEC-07:175–189`).
- **Hand-waved:** multi-modal photo-to-BIM Phase 3+ (`SPEC-07:249`).
- **Conflicts:**
  - **🟠 vs `08-VISION §1`** — see ADR-014 (20.14): "AI day one" vs L7.5 architectural integration M25.
  - **🔴 vs missing `SPEC-28-AI-COST-MODEL.md`.** The guardrails table refers to budgets but no SPEC defines *what the budgets are* in dollars per token per tier. Without it, cost guardrails are a placeholder.

### 21.8 🟠 SPEC-08 — Security & Collab
- **Concrete:** RBAC matrix; SAML/OIDC/SCIM endpoints; data residency (EU-West, US-East); service-role-key removal mandate (`SPEC-08:119`).
- **Hand-waved:** WebAuthn / passkeys Phase 3D (`SPEC-08:57`).
- **Conflicts:**
  - **🔴 vs current `server.js`.** Multiple endpoints use Supabase service-role keys (per repo grep). Removal is mandatory but not scheduled.
  - **🔴 vs ADR-021.** SOC2 Type II is an ADR-level commitment but `SPEC-08` does not enumerate the controls (access reviews, change management, vendor management, incident response). Without them, the SOC2 sprint cannot start.

### 21.9 🟡 SPEC-09 — Plugin SDK
- **Concrete:** manifest schema (`id`, `kind`, `permissions`, `extension_points`, `entry`, `SPEC-09:39–70`); Web Worker sandbox for 3rd-party; main-thread fast-path for first-party.
- **Hand-waved:** marketplace revenue model post-GA (`SPEC-09:194`); full marketplace ecosystem post-GA (`SPEC-09:164`).
- **Conflicts:** see ADR-009 (20.9), ADR-011 (20.11).
- **Honest commitment:** explicit downgrade of marketplace if launch partners aren't signed (`SPEC-09:160–167`). This is the *kind of discipline the rest of the corpus needs more of.*

### 21.10 🟡 SPEC-10 — Observability
- **Concrete:** span hierarchy (L0 100% / L1 100% errors + 1% success / L2 0.1% / L3 metric-only, `SPEC-10:34–38`); metric names (`pryzm.editor.fps`, `pryzm.sync.broadcast.lag_ms`, `pryzm.ai.cost.usd`, `SPEC-10:121–131`); 7-day retention for L2 traces (`SPEC-10:87`).
- **Hand-waved:** retention is hopeful, not budgeted (see ADR-007 / 20.7).
- **Conflicts:** none.

### 21.11 🟢 SPEC-11 — Testing
- **Concrete:** 7 test kinds (Unit / Property / Integration / E2E / Visual / Concurrent / A11y, `SPEC-11:20–27`); coverage gates (90–95% for L0–L4, 60% for L5, `SPEC-11:48–56`); visual gate with explicit approval >1% pixel diff (`SPEC-11:130–132`).
- **Hand-waved:** "manual screen-reader test before each milestone" (`SPEC-11:175`).
- **Conflicts:** none.
- **Silently-required dirs:** `apps/chaos/` (`SPEC-11:33`), `packages/sync/__tests__/concurrent/harness.ts` (`SPEC-11:140`). Neither exists.

### 21.12 🟢 SPEC-12 — Bundle Splitting
- **Concrete:** initial bundle ≤ 1.8 MiB gzip; on-demand chunk ≤ 200 KiB; `@thatopen/components` and `web-ifc` lazy-loaded (`SPEC-12:37–43`); Cesium lazy on zoom-out (`SPEC-12:55–58`).
- **Hand-waved:** "additional view kinds" lazy chunks (`SPEC-12:24`).
- **Conflicts:** **🟡 vs current dev bundle.** No measured baseline in the repo. Without `tools/load-bench/`, the 1.8 MiB target is aspirational. Part I §18 item 8 stands.

### 21.13 Contradiction matrix across SPECs

| # | A says... | B says... | Severity | Resolution sprint |
|---|-----------|-----------|----------|-------------------|
| C1 | `08-VISION §1` "AI day one" | `SPEC-07` + `10-MASTER-PLAN:36` L7.5 in M25 | 🟠 | Amend `08-VISION` |
| C2 | `ADR-002` two byte streams | `08-VISION §4 P4` single source | 🔴 | Land `SPEC-13` |
| C3 | `SPEC-12` lazy IFC | `09-AS-IS-VS-TO-BE §8.x` IFC for type catalog | 🟠 | Cite IFC entity defs only |
| C4 | `SPEC-05:258` mullions post-GA | `09-AS-IS-VS-TO-BE` curtain wall in P1B | 🟡 | Disambiguate family vs type |
| C5 | `SPEC-09` permissions | `ADR-011` permission granularity | 🔴 | Unify in `SPEC-13` |
| C6 | `SPEC-04:196` MEP/Struct docs post-GA | `09-AS-IS-VS-TO-BE` Pascal parity in P2C | 🟠 | Honest README update |
| C7 | `SPEC-08:119` service-role-key removal | `server.js` uses service-role keys | 🔴 | Sprint S26 |
| C8 | `SPEC-01:57–68` ±10km bound | airport-scale buildings | 🟢 | Document boundary |
| C9 | `SPEC-11` chaos suite | `apps/chaos/` doesn't exist | 🟠 | Sprint S43 prereq |
| C10 | `SPEC-06` discipline-scoped levels | `ADR-011` RBAC only | 🟠 | Unify in `SPEC-13` |

---

## 22. Phase-by-phase implausibility analysis

The phase-level explorer surfaced four findings that change the timeline picture. They are listed by severity.

### 22.1 🔴 PHASE-1B — "9 core families in 12 weeks (S07–S12)"
- **Claim:** Wall plugin + Slab + Door + Window + Roof + Curtain Wall + Grid + Column + Beam, end-to-end, in 12 weeks.
- **PRYZM 1 reality:** the wall subsystem alone is ~12k LOC across `src/commands/`, `src/services/SlabWallConnectivityService.ts`, `src/services/WallFaceResolver.ts`, plus ~20 wall handlers, plus the `RoomFinishResolver` interactions.
- **Re-audit reality (`PHASE-1-RE-AUDIT-2026-04-27`):** **all 12 element families are reported GREEN at 100/100.** This either means (a) the implementation is thinner than PRYZM 1 (i.e., feature gaps, not yet visible because of fixture coverage), or (b) the Wall recipe truly was a force-multiplier and the agent + you delivered. **Truth is probably (a).** The 163 parity fixtures are a strong bar but parity = "produces the same output for the same input"; they don't cover *the inputs PRYZM 1 has that PRYZM 2 doesn't yet generate.*
- **Action:** sample 20 random Pascal projects (real ones, not fixtures) and round-trip them through PRYZM 2's headless CLI. If any fail, the GREEN audit is generous.

### 22.2 🔴 PHASE-1C — "Stair producer (straight, L, U) in 7 days"
- `PHASE-1C:286–288` claims this.
- PRYZM 1 stair geometry uses `src/constraints/StairConstraintEngine.ts` (~1,078 LOC) plus a constraint DAG plus per-shape generators.
- 7 days of solo + Agent for risers + treads + landings + nosing + stringer + handrail attachment + IFC-class-correct output is **extremely** aggressive.
- The re-audit reports stair as one of the 12 GREEN families. Verify: does the current stair implementation handle a U-stair with mid-landing, 17 risers, with the top-tread aligned to floor finish? If it only handles straight stairs with no landings, "GREEN" is misleading.

### 22.3 🔴 PHASE-2B — "Plan view migration (54 files) in 3 sprints (S31–S36)"
- `10-MASTER-PLAN:30` calls this "the highest-risk sub-project."
- 54 files = `src/styles/panels/`, `src/visibility/`, the entire VG governance layer, the 11-wave Visibility-Intent system, plus the new canvas host.
- "Carrying over the 11-wave Visibility-Intent system while refactoring to a new canvas host" is **extreme risk** — the watchful-peacock explorer flagged it explicitly.
- **Recommendation:** schedule a 2-week pre-sprint (S30.5) to rewrite the *highest-traffic* 5 plan-view operations (selection, drag, snap, pan, zoom) on the new canvas host first, and only then port the VI engine. A "one big refactor" approach to a 54-file system at this complexity is the path to a 6-month slip.

### 22.4 🟠 PHASE-2D — "Yjs sync server + chaos suite + multi-user UAT in 6 weeks (S43–S48)"
- This is when ADR-002's distributed-systems decisions become *real*.
- The translator pair (`applyCommandToYDoc`, `yDocUpdateToCommand`) is the single highest-stakes interface in the project.
- Six weeks to write it, harness it, chaos-test it, run 5+ user UAT, ship beta. The chaos harness alone (`apps/chaos/` doesn't exist yet) is 3–4 weeks of work.
- **Recommendation:** start `apps/chaos/` in S07 (Phase 1B), in parallel with the wall sprint. The harness is independent of which element it tests.

### 22.5 🟡 PHASE-3-COMPLETION — AI L7.5 promotion at M25
- **Tension:** `08-VISION §1` says AI is day-one; `10-MASTER-PLAN:36` integrates L7.5 architecturally at M25.
- **Resolution:** "day-one AI" means the *route* (`/api/ai/*`) and *approval queue* exist from the start, but the *layer* (own scheduler, own budget enforcement, own context gathering) is M25.
- **Action:** add a `08-VISION §1.x` clarification: "AI features ship continuously; the AI *layer* is architecturally first-class at M25."

### 22.6 🟢 PHASES-UPDATE-PLAN-2026-04-27 itself
- This file (`phases/PHASES-UPDATE-PLAN-2026-04-27.md`) re-syncs ADR numbering and phase dates as of today.
- It explicitly flags the **ADR numbering collision** between strategic and code-level series (`UPDATE-PLAN:1.3`).
- This is good. Resolve before next ADR is written.

### 22.7 The 24-month dual-run question
- `10-MASTER-PLAN:10` says "PRYZM 1 ships at every step" (12-month dual-run for Phase 1).
- `10-MASTER-PLAN:39` says "Legacy deletion" in S61 (M21) — which means PRYZM 1 is *deleted* between Phase 2 ending (M24) and Phase 3 starting (M25). That's a 3-month overlap, not 24.
- **Risk:** if Phase 2 slips (it will), the dual-run window collapses to zero. PRYZM 1 must be deletable on a *date*, not a *sprint*, with a real cut date documented. ADR-018's empty cut list owes this answer too.

---

## 23. `src/` subdir-by-subdir migration map (21 directories, ~190k LOC surveyed)

The dull-leafbird explorer mapped every subdir to a target layer + status. Here are the **non-obvious findings** beyond the table.

### 23.1 🔴 `src/lifecycle/` (1,097 LOC) — orphan with no architectural home
- **Subsystem:** Facility Management / Post-Occupancy. `LifecycleStateManager.ts`, `PostOccupancyPanel.ts`, `MaintenanceRecord.ts`.
- **Mapping:** **NONE in the L0–L7.5 model.** Not in `08-VISION`, not in `09-AS-IS-VS-TO-BE`, not in any SPEC.
- **Status:** production code with no destination. Either it's a strategic differentiator that needs `plugins/lifecycle` (and a SPEC), or it's a Phase 3+ deferral that needs explicit "we are dropping this" wording in ADR-018.
- **Action:** decision required before S07.

### 23.2 🔴 `src/commands/` (34,023 LOC, ~264 command classes)
- **Triage outcome:** 13 DROP, 47 MERGE, 169 PORT, 35 LIFT to L7.5.
- That's a 264 → ~169 reduction (36% cut). Reasonable, but the *merge* category (47) is where regressions live. Two commands that were "merged" are actually three behaviors (the third was implicit), and the third behaviour gets lost.
- **Action:** every MERGE entry needs a behaviour-preservation fixture in `tests/pryzm2/parity/`. The re-audit's 163 parity fixtures don't cover *command-level* parity, only *element-output* parity.

### 23.3 🔴 `src/core/` (76,188 LOC) — the "God module"
- **Files:** `BimKernel.ts`, `StoreRegistry.ts`, `SemanticGraph.ts`, `SpatialIndex.ts`.
- **Spans L1–L5** in the new architecture. This single directory is the source for `packages/command-bus/`, `packages/persistence-client/`, `packages/scene-cache/`, `packages/picking/`, `packages/geometry-kernel/` — a 1→5 split.
- **Risk:** the boundary lint catches *imports*, not *circular logic*. Splitting this without introducing a hidden coupling between two of the new packages is a code-archaeology project.
- **Action:** for each of the 5 target packages, freeze a public interface *first*, then move code. PR-by-PR with the boundary lint as the merge gate.

### 23.4 🟠 `src/styles/` (30,977 LOC) — the UI behemoth
- **Subsystem:** vanilla TS + CSS-in-JS UI; `AppTheme.ts`, `tokens.ts`, `panels/propertyInspector.ts`.
- **Mapping:** L7. Refactored into `packages/ui/` and per-plugin panels.
- **Conflict:** **🟠 vs the React 19 dependency in `package.json`.** Part I §6.1 flagged this. If the new UI is React, 30,977 LOC of vanilla-TS panels is a rewrite, not a port. If the new UI is vanilla-TS, why is React 19 a dep?
- **Action:** ADR amendment (Part I §18 item 5).

### 23.5 🟠 `src/ai/` (15,104 LOC) — the moat
- **Files:** `AIService.ts`, `PdfToBimConstraints.ts`, `SemanticQueryEngine.ts`, `RuleEngine.ts`.
- **Mapping:** L7.5 + `apps/ai-worker/`.
- **The interesting bit:** `PdfToBimConstraints.ts` — PDF-to-BIM is **the** differentiator vs Revit/ArchiCAD/Vectorworks. It's not in `SPEC-07`'s scope tables. It needs its own SPEC or a callout in `SPEC-07` saying "PDF-to-BIM is the marquee L7.5 use case."

### 23.6 🟠 `src/import/` (4,294 LOC) — IFC + DXF + Rhino
- All three move from core to `plugins/import-*` (per `SPEC-12`).
- **Risk:** PRYZM 1's importers are tested against real-world files. Plugin sandboxing (Web Worker) limits their access to `OPFS` / `FileSystemAccess` APIs. Rhino's 3dm parser uses `rhino3dm.wasm` which is ~5MB; lazy-loading works but the *first* import on a fresh session is slow.
- **Action:** measure cold-import latency in `tools/load-bench/` and budget it.

### 23.7 🟢 `src/snapping/` (3,387 LOC) — high-quality engine, clean port
- Maps to `packages/picking/` + `packages/geometry-kernel/`.
- This subsystem is one of the cleanest in PRYZM 1. The port should be straightforward.

### 23.8 🟠 `src/visibility/` (only 106 LOC)
- The migration audit calls this 106 LOC, but the *Visibility-Intent system* it represents is the 11-wave behavior whose actual code lives in `src/styles/panels/`, `src/migration/VGToIntentMigration.ts` (604 LOC), and elsewhere.
- The 106 LOC is the *governance store*; the *engine* is distributed across the codebase.
- **Risk:** "port the 106 LOC" is misleading. The port-cost reality is closer to ~3–5k LOC across multiple subsystems.

### 23.9 🟢 `src/structural/` (375 LOC)
- Load-path graph. Small, isolated, clean. Moves to `plugins/structural`.

### 23.10 The aggregate picture
- Total surveyed: **~190k LOC across 21 subdirs.**
- Re-audit claims 12 element families end-to-end, ~390k total LOC in the legacy codebase.
- Therefore the 21 surveyed subdirs are roughly **half** the legacy code by LOC. The other half is in renderers (`src/rendering/`, `src/renderers/`, `src/renderer/`, etc. per Part I §6.3 — three parallel renderers), `src/ui/` panels (separate from `src/styles/`), and a long tail of utilities.
- **Action:** a follow-up subdir audit covering the other ~200k LOC is a Phase 1D prerequisite.

---

## 24. `server.js` route-by-route dissection (3,247 LOC, 28 files in `server/`)

The effective-triceratops explorer mapped all routes. Here are the **non-obvious findings** beyond the route table.

### 24.1 🟠 The "no formal cron" finding
- `server.js` has no scheduled tasks. Cleanup of `project_command_log` records older than 24h happens **probabilistically** on every `command-executed` event with **2% probability**.
- **Math:** 2% × N events/day = expected cleanup runs/day. For a quiet project (50 events/day), that's 1 cleanup/day on average — fine. For a busy project (5,000 events/day), that's 100 cleanup runs/day — N+1 query storm.
- **Action:** replace with a real cron (BullMQ scheduled job per ADR-005).

### 24.2 🔴 Three different auth implementations
1. Custom JWT (bcrypt + `SESSION_SECRET`).
2. Google OAuth (`server/oauthService.js`).
3. Microsoft OAuth (`server/oauthService.js`).
4. (And the SAML/OIDC future from `SPEC-08` makes 4.)
- They share `req.auth` populated by `authMiddleware` but the *issuance* paths are independent.
- **Risk:** session fixation across auth methods, account-takeover via OAuth → custom JWT bridge if the email match isn't strict.
- **Action:** security audit of the auth surface before SOC2. ADR-021's $30k budget assumes the audit is *clean*; if it surfaces a real vuln, the audit fails.

### 24.3 🟠 `command-executed` socket event is a relay, not a sync engine
- The current Socket.io topology: client emits `command-executed` → server rebroadcasts as `remote-command` to other clients in the project room.
- **No conflict resolution.** Two clients can emit conflicting commands; both apply locally and the server fan-outs both. Whichever arrives first "wins" on each remote client. This is not CRDT semantics; it's last-writer-wins-per-client-arrival-order.
- **In ADR-002 architecture**, this gets replaced wholesale by Yjs, with the event log as durability. But until S43 ships, the legacy relay is the production sync mechanism. **Any multi-user beta on the current relay is likely to produce data loss.**
- **Action:** disable multi-user in production until S43, OR add server-side ordering (single ULID generator, write-then-broadcast).

### 24.4 🟠 The `/api/ai/*` routes are scaffolded, not L7.5
- 6 AI routes exist: voice, ambient, room finishes, room programme, room adjacency, plus `/api/ai/voice/parse`.
- They route to either Anthropic directly or via Cloudflare Worker (`CF_WORKER_URL`).
- **Missing:** the approval queue from `SPEC-07:96–121`. None of these routes write to a queue; they call out, get a response, return it. There is no human-in-the-loop step.
- **Conclusion:** "AI day one" is true at the *route* level, but `08-VISION §5`'s L7.5 layer (approval queue, model pinning, budget enforcement) is not implemented. ADR-014's pinning + budget + queue all live in the future.

### 24.5 🟠 Stripe + Supabase + Replit Postgres = three data stores in flight
- Subscription state lives in Stripe (truth) + replicated to `pryzm_users.plan` + cached in some routes' decision logic.
- Project data lives in Supabase OR Replit Postgres (fallback). If a project is created on Replit Postgres and the operator later configures Supabase, **the project does not migrate.** No SPEC defines the migration.
- **Action:** document the dual-DB topology in `SPEC-24-DATA-STORE-MAP.md` (which doesn't exist yet — Part I §18 item 4).

### 24.6 🟢 Rate limiters look correct
- Global 200/15min, AI 20/15min, API v1 60/1min. Tiered correctly. AI limit is the right shape (low ceiling, high cost-per-call protection).

### 24.7 🟠 The ~9,449 LOC server side is on the path to one of two futures
- **Future A:** stays a Node monolith, gets split into `server/auth/`, `server/projects/`, `server/ai/`, `server/sync/`, `server/billing/` modules with shared middleware. Fits Replit Reserved VM. Cheaper to operate.
- **Future B:** splits into `apps/sync-server/` (Socket.io + Yjs + auth) and `apps/bake-worker/` (BullMQ consumers + AI routes) and `apps/billing-webhook/` (Stripe webhook isolation). Two or three Replit deployments. More resilient but more ops.
- **The corpus implies B but doesn't decide.** No deployment-topology SPEC exists. Part I §18 item 2 stands.

---

## 25. Audit GREEN vs reality gap

`PHASE-1-RE-AUDIT-2026-04-27.md` reports Phase 1 closed at **100/100**, with these specific GREEN claims:
- 8 CI gates GREEN (P1–P8).
- 18 bench gates GREEN.
- 12 element families wired end-to-end (Wall / Slab / Door / Window / Roof / Curtain Wall / Grid / Column / Beam / Stair / Handrail / Ceiling).
- 163 parity fixtures passing.
- 5 ESLint rules live.
- Boundaries lint enforces L0–L5 separation.
- MoveWall facade preserved for backward-compat.

This is **far more progress** than Part I implied. Three observations follow.

### 25.1 🟢 The audit is internally consistent
- The 5 ESLint rules + boundaries lint + 18 bench gates + 163 fixtures form a coherent quality bar.
- If any of those are red, CI is red, and the GREEN claim falls apart. So the claim is *verifiable from CI logs alone.*
- **Action:** spot-check CI runs from this week to confirm the GREEN. If they're red and the audit is GREEN, the audit is misleading.

### 25.2 🟠 Parity fixtures ≠ feature parity
- 163 parity fixtures cover *the inputs the team wrote fixtures for.* Real PRYZM 1 projects use thousands of edge cases (e.g., wall layers with non-standard core thickness, doors with custom families, slabs with edge profiles, grids with skewed angles, stairs with mid-landings).
- **Action:** randomized fuzzing against PRYZM 1's recorded command logs. If 95% of replayed PRYZM 1 sessions produce identical PRYZM 2 output, GREEN is real. If 60% diverge, GREEN is a fixture-coverage mirage.

### 25.3 🟠 "12 families end-to-end" needs definition
- *End-to-end* in the audit appears to mean: command bus → producer → renderer descriptor → bench-passable.
- It does **not** mean: UI panel → property edits → undo/redo → IFC export → plan-view symbol → schedule formula. Those land in Phase 2A–2C.
- **Action:** in the README, distinguish "Phase 1 end-to-end" (geometry pipeline) from "user-facing end-to-end" (UI + persistence + sheets) explicitly.

### 25.4 🟢 The `S26 cleanup deferral` is honest
- Legacy `client/`, `editor/`, `src/` are retained pending S26 cleanup. The audit calls this out.
- This is correct. Deleting them too early breaks the dual-run guarantee.

---

## 26. The 8 missing SPECs in priority order (with effort estimates)

| Priority | SPEC | Why it's needed | Effort |
|----------|------|-----------------|--------|
| 1 | **SPEC-26 PRYZM File Format** | `.pryzm` is referenced 80+ times; binary format unspecified | 3–5 days |
| 2 | **SPEC-15 Deployment Topology** | No `apps/*` server can be designed without it | 2–3 days |
| 3 | **SPEC-13 Context Envelopes** | `WallContext`/`DoorContext`/`SlabContext` shapes block S07 | 2 days |
| 4 | **SPEC-21 Element Creation Protocol** | Recipe for every Phase 1B–2A family | 2 days |
| 5 | **SPEC-24 Data Store Map** | Resolves Stripe/Supabase/Replit-PG triple-store mess | 1 day |
| 6 | **SPEC-29 Vector Primitives + PDF Backend** | Blocks Phase 2C sheets/schedules | 4–6 days |
| 7 | **SPEC-28 AI Cost Model** | Resolves SPEC-07's empty budget table | 2 days |
| 8 | **SPEC-30 Plan-View Performance Budget** | Phase 2B's highest-risk sub-project has no budget | 1 day |

**Aggregate:** ~17–22 person-days. With Agent + you, ~3 weeks of dedicated SPEC writing. **This is the work Phase 1D should not ship without.**

---

## 27. `00_Contracts/` legacy folder — fate decision needed

The repo has `00_Contracts/01-EVENT-LOG-CONTRACT.md`, `02-COMMAND-PROTOCOL.md`, `03-BIM-SEMANTIC-MODEL-CONTRACT.md`, `04-AI-CONTRACT.md`, etc. Part I §13 already noted these are **largely superseded** by SPEC-01..12. But:
- `PHASE-2A` references `00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md` for room semantics.
- `04-AI-CONTRACT.md` is explicitly called "dead" in `SPEC-07:13`.

**Action:**
1. For each of the ~12 contracts, either *port the still-relevant content into a SPEC* and delete, or *move to `archive/00_Contracts/`* with a one-line "see SPEC-XX" pointer.
2. Update every PHASE doc's references.

Until this is done, the README's "read in order" instruction sends new readers to dead documents.

---

## 28. Replit-specific delivery considerations

You are building this on Replit. The corpus assumes generic cloud (R2, MinIO, BullMQ, Tempo, Honeycomb). Three specific Replit constraints deserve a SPEC entry:

### 28.1 🟠 Replit Autoscale vs Reserved VM for the sync server
- Yjs sync needs **persistent connections** (Socket.io + WS). Autoscale spins up new VMs on traffic; persistent WS connections break or fan out poorly.
- **Recommendation:** Reserved VM for `apps/sync-server`. Autoscale for `apps/bake-worker` (stateless job consumer is autoscale-friendly). Document in `SPEC-15-DEPLOYMENT-TOPOLOGY.md`.

### 28.2 🟡 Replit Postgres vs Supabase vs external
- Current code falls back to Replit Postgres if Supabase isn't configured.
- **Replit Postgres:** good for dev, smaller backup story than Supabase.
- **Supabase:** better PITR, mature replication, $$$ at scale.
- **Decision:** Replit Postgres for dev/preview, Supabase for production, period. Document in SPEC-15.

### 28.3 🟡 Object storage on Replit
- Replit doesn't have native S3-compatible storage at GA-scale pricing. R2 is the right choice. The legacy `attached_assets/` (84k files) needs to migrate off the repo into R2 *before* SOC2 — committed binaries are an audit finding waiting to happen.

---

## 29. The 25 deepest concerns (final, prioritized)

Ranked by *what kills the project if not fixed*. Severity tags as before.

1. 🔴 **ADR-002 two-byte-stream design (event log + Yjs).** Single highest-risk distributed-systems decision. No chaos suite yet (`apps/chaos/` doesn't exist). Failure here = data loss in beta.
2. 🔴 **No `SPEC-26 PRYZM File Format`.** 80+ references, 0 specification.
3. 🔴 **Permission model is three different things** (RBAC / plugin manifest / AI queue). No unified `Authority` table. ADR-011 + ADR-009 + SPEC-07 don't agree.
4. 🔴 **`server.js` uses Supabase service-role keys.** SPEC-08:119 mandates removal. Not scheduled.
5. 🔴 **PDF-to-BIM (`src/ai/PdfToBimConstraints.ts`) is the moat but has no SPEC.** L7.5's marquee feature is unspecified.
6. 🔴 **`src/lifecycle/` (1,097 LOC production code) has no architectural home.**
7. 🔴 **PHASE-2B "54 files in 3 sprints"** is the project's most likely slip. No mitigation plan beyond a feature flag.
8. 🔴 **Missing ADR-022, ADR-023, ADR-027.** Referenced but not written.
9. 🔴 **Current `command-executed` socket relay has no conflict resolution.** Last-writer-per-arrival-order. Multi-user beta on this is dangerous.
10. 🟠 **No deployment-topology SPEC.** Replit Autoscale vs Reserved VM choice is unresolved.
11. 🟠 **No `apps/chaos/` harness yet.** Phase 2D depends on it; should start in Phase 1B.
12. 🟠 **React 19 in `package.json` vs vanilla-TS bundle decision.** `src/styles/` is 30,977 LOC of vanilla TS.
13. 🟠 **Node 20 vs `camera-controls@2.x` requires Node 22.** Active peer-dep mismatch.
14. 🟠 **Three.js version not pinned to a WebGPU-stable release** (ADR-006 needs an addendum).
15. 🟠 **`replit.md` is 422k chars.** Unusable as onboarding doc.
16. 🟠 **`attached_assets/` 84k files in repo.** Slows everything; SOC2 audit finding.
17. 🟠 **AI day-one vs L7.5 in M25** contradiction (`08-VISION §1` vs `10-MASTER-PLAN:36`).
18. 🟠 **163 parity fixtures ≠ feature parity.** Need randomized fuzz against PRYZM 1 command logs.
19. 🟠 **`src/commands/` MERGE category (47 of 264) is regression-prone.** No command-level parity tests yet.
20. 🟠 **SPEC-04 hidden-line on a 100-room model has no perf budget.**
21. 🟠 **Three auth implementations** (custom JWT + Google OAuth + Microsoft OAuth + future SAML/OIDC). Cross-implementation security audit pending.
22. 🟡 **2% probabilistic cleanup of `project_command_log`** — replace with a real cron.
23. 🟡 **ADR-018 capacity-cut-list table is empty.** "We will cut scope" is decorative until populated.
24. 🟡 **Stripe + Supabase + Replit Postgres** triple-store with no migration story.
25. 🟡 **`00_Contracts/` legacy folder** still referenced by `PHASE-2A`. Either port content into SPECs or archive with pointers.

---

## 30. Final verdict (updated post-deep-dive)

Part I's verdict was sharp but partially miscalibrated by the audit-vs-reality gap. The corrected verdict is this:

### 30.1 What is genuinely strong
- The vision (`08-VISION`) is one of the most disciplined I've reviewed.
- `CONFLICT-ANALYSIS.md` is *self-aware* in a way most architecture docs aren't.
- Phase 1 is genuinely closed at the foundation tier (12 element families, 163 fixtures, 18 bench gates, boundary lint).
- ADR-002 + SPEC-02 + SPEC-03 *together* form a coherent two-byte-stream design — the gap was that ADR-002 alone read as a contradiction; reading the trio resolved it.
- SPEC-09's honest commitment ("downgrade marketplace if launch partners aren't signed") is the discipline the rest of the corpus needs more of.

### 30.2 What is dangerous
- The **plan-view migration (PHASE-2B)** is the project's single most likely slip.
- The **Yjs sync server (PHASE-2D)** is the project's single most likely *data-loss* event.
- The **8 missing SPECs** (especially SPEC-26 file format, SPEC-13 context envelopes, SPEC-15 deployment) compound risk across the entire Phase 2.
- The **three permission models** (ADR-009 / ADR-011 / SPEC-07) need unification *before* SOC2.
- The **PDF-to-BIM moat** has no SPEC.
- The **legacy debt** (`replit.md` 422k, `attached_assets/` 84k, dead contracts in `00_Contracts/`, three parallel renderers) needs a deletion sprint, not a "later."

### 30.3 What is implausible
- "9 element families in 12 weeks" *delivered as audited GREEN* either means feature gaps are masked by fixture coverage, or the recipe truly worked. **Most likely:** somewhere between the two — the recipe worked and there are real gaps. Random-fuzzing against PRYZM 1 sessions will tell.
- "Stair producer in 7 days" is implausible at PRYZM 1's depth. If the audit says GREEN, the implementation is thinner.
- "Plan view in 3 sprints" is implausible. Plan a 5–6 sprint window or accept a slip.
- "SOC2 + SAML + SCIM + dual-region residency for solo founder + Agent" is implausible at the timeline implied by ADR-021. Cut at least two.

### 30.4 The two paths forward

**Path A — discipline scope to capacity.** Cut the cut-list (ADR-018) to a real list this week. Drop SOC2 to year 2. Drop dual-region to year 2. Drop the marketplace to v2. Drop multi-modal photo-to-BIM to year 2. Spend the saved capacity on the 8 missing SPECs and the chaos harness. **Probability of GA in 36 months: 60%.**

**Path B — keep the vision, accept the timeline slip.** Plan honestly for 48 months instead of 36. Use the extra year to make ADR-002 (sync) and PHASE-2B (plan view) properly hardened. **Probability of GA in 48 months: 75%.**

**Path C (the trap) — keep both vision and timeline.** Ship something at M36 that fails its own quality bar (CI green but real-world brittle). **Probability of a real GA in 36 months: 15%; probability of customer churn in M37: high.**

### 30.5 The single highest-leverage action this week
**Populate ADR-018 and write SPEC-26 + SPEC-15 + SPEC-13.**
- ADR-018 forces the cut-list conversation.
- SPEC-26 unblocks every persistence/sync/bake decision downstream.
- SPEC-15 unblocks every server-architecture decision.
- SPEC-13 unblocks the wall sprint S07 (the multiplier).

Three SPECs and one populated ADR. Maybe 8 person-days. Highest leverage in the corpus.

---

*— End of deep-dive addendum. Total document: Part I (~693 lines) + Part II (~600 lines) = comprehensive single-doc gap review as requested.*
