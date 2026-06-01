# Phase 3 — Completion, Hardening, GA (Months 25–36, Sprints S49–S72)

> **Phase goal**: bring the remaining moats (AI subsystem, IFC/DXF/Rhino, parametric component editor) across, ship the **Plugin SDK 1.0**, ship the **public APIs** (REST + WS + headless + AI), **delete every line of legacy code**, harden for production at GA on M36.
>
> **The bet**: by Phase 3 the spine is proven (Phase 1) and the documentation pipeline + collaboration are live (Phase 2). Phase 3 is about **closing the moats** that beat each competitor — D2 (AI as L7.5), D4 (Plugin SDK + marketplace), D7 (headless), D9 (IFC), D10 (component editor), D3 (self-host), D5 (full OTel coverage). When this phase ends, every box in the `09-AS-IS-VS-TO-BE.md §8` matrix is ticked at PRYZM 2 GA and PRYZM 1 sunset is announced.

This document expands `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6 with sprint-level detail. Companion docs: `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` (what came before), `08-VISION.md` (the contract being delivered).

---

## §1 Phase 3 strategic context

### §1.1 Where we start (M24 morning)

- 18 element families operational + documentation pipeline (plan / section / sheets / schedules / PDF) + multi-user via Yjs + awareness + soft locks + Visibility-Intent waves 1–5.
- Beta cohort of 25 active users; crash-free > 95%; < 5 P0/P1 bugs.
- 50% of legacy `(window as any)` deleted; 50% of commands consolidated.
- AI host lazy-loaded with approval queue UI but no real AI workflows yet.
- `.pryzm` v1 stable + email-portable.
- All M12 and M24 NFT targets green and bench-protected against regression.

### §1.2 What Phase 3 must deliver

- **AI subsystem fully migrated to L7.5** — floor-plan-from-PDF (CV pipeline), generative design, semantic NL query, voice spatial interface, AI rule engine. All as plugins against the approval-queue flow. Public AI API endpoints at `api.pryzm.com`.
- **IFC + DXF + Rhino as plugins** — viewer build excludes them; OBC fully demoted from core to `plugins/ifc-import/` only.
- **Parametric component editor (D10)** — separate vanilla-TS SPA at `apps/component-editor`; component definitions sharable via plugin marketplace.
- **Plugin SDK 1.0 + marketplace** — manifest schema, 7 permissions, sandbox, hot-reload (`pryzm dev` < 500 ms), signed packages, revenue share infrastructure, ≥30 first-party plugins listed.
- **Public REST + WebSocket APIs** — OAuth2-authenticated, rate-limited, OpenAPI 3.1 auto-generated from Zod, webhooks.
- **`@pryzm/headless` published to public npm** — with full docs at `docs.pryzm.com/headless/`.
- **Self-host packaging** — `docker-compose up` deploys editor + sync-server + bake-worker + Postgres + MinIO in < 10 minutes on a fresh Linux VM.
- **Legacy deletion** — `EngineBootstrap.ts`, `ProjectSerializer.ts`, `initUI.ts`, `ImportProjectCommand.ts`, all 264 legacy command files, all 2,078 `(window as any)` sites, all OBC imports outside plugins.
- **Production hardening** — pen test, CSP audit, plugin sandbox audit, RLS audit, browser matrix (Chrome/Firefox/Safari/Edge), accessibility, performance regression hunt against the 10K-wall fixture.
- **GA launch on M36** — marketing site, full docs site, 5-min demo, 5 case studies, pricing, public sign-up, monitoring + support workflow live.

### §1.3 Phase 3 sub-phase shape

```
M25 ─┐
M26  │  Sub-phase 3A — Visibility-Intent + AI complete   S49–S54
M27 ─┘
M28 ─┐
M29  │  Sub-phase 3B — IFC/DXF/Rhino + Component editor  S55–S60
M30 ─┘
M31 ─┐
M32  │  Sub-phase 3C — Plugin SDK + marketplace + APIs   S61–S66
M33 ─┘
M34 ─┐
M35  │  Sub-phase 3D — Hardening + GA                    S67–S72
M36 ─┘                                                   ★ M36 GA GATE
```

### §1.4 The "no surprises" principle for Phase 3

By Phase 3 nothing about the architecture should be in flux. Every sprint adds capability against rails that have been stable since M12. If a Phase 3 sprint requires changing layer boundaries, ADRs, or core contracts, **stop**: that's a Phase 1/2 issue surfacing late, and continuing on top of it compounds debt. Re-open the relevant pre-flight ADR before proceeding.

---

## §2 Sub-phase 3A — Visibility-Intent + AI complete (M25–M27, S49–S54)

**Sub-phase goal**: finish the 11-wave Visibility-Intent migration (waves 6–11), migrate the entire 31-file AI subsystem to L7.5, ship the public AI API. After 3A, the AI moat (D2) is fully realised — the differentiator that beats every competitor including Pascal.

### S49 — Visibility-Intent waves 6–11 (Weeks 97–98, M25)

**Goal**: remaining 6 waves of the 11-wave system carried verbatim into `plugins/visibility-intent/`. Includes the bug-fix sprint absorption from beta cohort feedback (any P1/P2 visibility-intent issues from M24 beta).

**Why now**: this completes the most battle-tested PRYZM 1 UI subsystem. The 11 waves must be 100% present before AI workflows in S50 can target them.

**Deliverables**:
- `plugins/visibility-intent/waves/{w06,w07,w08,w09,w10,w11}.ts` — exact functional equivalents of PRYZM 1.
- VG (Visibility Graphics) commands folded in (4 commands, per `09 §4`, becomes 3 after merge).
- Parity tests for each of waves 6–11.
- Beta-cohort visibility-intent bug fixes (capacity reserved Day 7–10).

**Daily**: D1 wave 6 (canonical for this batch); D2–D5 waves 7–10 (one per day); D6 wave 11 + VG fold-in; D7 parity tests + beta bug fixes; D8 lint+typecheck; D9 demo; D10 buffer.

**Exit**: all 11 waves parity-tested vs PRYZM 1; visual diff < 1 px; OTel spans visible across all waves; beta bugs from M24 closed.

---

### S50 — AI floor-plan import (CV pipeline) (Weeks 99–100, M25–M26)

**Goal**: `plugins/ai-floorplan/` migrates the 31-file AI subsystem's floor-plan-from-PDF capability — `PdfToBimConstraints`, `DoorGapInpainter`, `WallCandidateScorer`, `WallIntersectionResolver`. Heavy CV runs in `apps/ai-worker`.

**Why now**: this is the AI moat's flagship capability — *"upload a PDF floor plan, get a reviewable command batch"*. Beta cohort has been waiting for it.

**Deliverables**:
- `plugins/ai-floorplan/index.ts` — plugin wiring + UI integration.
- `apps/ai-worker/jobs/PdfFloorplanJob.ts` — CV pipeline in BullMQ worker.
- `packages/ai-host/floorplan/` — pure orchestration (constraint extraction, candidate scoring, intersection resolution).
- Approval queue UI extension for floor-plan batches (review walls/doors before commit).
- `apps/bench/ai-floorplan.ts` — end-to-end PDF → reviewable batch latency; gate < 15 s.

**Daily**: D1 plugin + UI integration; D2 PDF parsing in worker; D3 constraint extraction; D4 wall candidate scoring; D5 door gap inpainter; D6 intersection resolver; D7 approval queue UX; D8 perf tune; D9 demo; D10 buffer.

**Exit**: sample PDF → reviewable command batch in < 15 s; user can accept/reject/edit before commit; all approved walls + doors persist via standard event log.

---

### S51 — AI generative + rule engine + semantic query (Weeks 101–102, M26)

**Goal**: 3 more AI workflows migrated as plugins — `plugins/ai-generative/` (constraint-based design generation), `plugins/ai-rules/` (code compliance / rule engine), `plugins/ai-query/` (semantic NL query against project).

**Deliverables**:
- `plugins/ai-generative/` + `packages/ai-host/generative/` — DSL for constraints; iterates candidates.
- `plugins/ai-rules/` + `packages/ai-host/rules/` — rule definitions, validation runs, violation reports.
- `plugins/ai-query/` + `packages/ai-host/query/` — NL → semantic query (re-uses `SemanticQueryEngine` from PRYZM 1).
- All three use the same approval-queue + batched-commands pattern.

**Daily**: D1–D3 generative (most complex of three); D4–D6 rule engine; D7–D8 semantic query; D9 demo; D10 buffer.

**Exit**: all four AI workflows (incl. floorplan from S50) functional with approval queue; OTel spans cover the AI host + worker.

---

### S52 — Voice spatial interface as plugin (Weeks 103–104, M26–M27)

**Goal**: `plugins/ai-voice/` migrates `VoiceSpatialInterface` from PRYZM 1; voice commands hit the same approval queue.

**Deliverables**:
- `plugins/ai-voice/` — Web Speech API + intent parser; emits AI commands to approval queue.
- Microphone permission UX; visual feedback of recognition state.
- Voice command vocabulary (start with PRYZM 1's parity set).

**Daily**: D1 plugin skeleton; D2 Web Speech wiring; D3 intent parser; D4 approval queue integration; D5 voice command vocabulary + tests; D6 visual feedback UX; D7 e2e test; D8 lint; D9 demo; D10 buffer.

**Exit**: voice commands work for the PRYZM 1 parity vocabulary; same approval queue; OTel spans visible.

---

### S53 — AI public API endpoints (Weeks 105–106, M27)

**Goal**: `apps/api-gateway/ai/` exposes 4 public endpoints: `POST /v1/ai/floorplan-import`, `POST /v1/ai/query`, `POST /v1/ai/generate`, `POST /v1/ai/validate`. OAuth2-authenticated, rate-limited, OpenAPI auto-generated.

**Why now**: D7 and D2 combined — AI as a public API is something **no competitor offers**. Sprint S65 generalises this into REST + WS for everything; this sprint is the AI-specific surface.

**Deliverables**:
- `apps/api-gateway/` — Express + OAuth2 (PKCE) + rate limiter (`express-rate-limit` or `bottleneck`).
- `apps/api-gateway/routes/ai/{floorplan,query,generate,validate}.ts`.
- OpenAPI 3.1 spec auto-generated from Zod schemas via `zod-openapi`.
- `apps/bench/api-latency.ts` — measures p50/p95/p99 of AI endpoints.
- API key issuance UI in `apps/editor/src/settings/api-keys.ts`.

**Daily**: D1 OAuth2 + API key infra; D2 rate limiter + per-key quotas; D3 floorplan endpoint; D4 query endpoint; D5 generate + validate endpoints; D6 OpenAPI generation; D7 perf bench; D8 lint+security review; D9 demo; D10 buffer.

**Exit**: 4 AI endpoints live behind OAuth2; rate limits enforced; OpenAPI viewable; sample curl requests work.

---

### S54 — AI batching + undo as one + audit (Weeks 107–108, M27)

**Goal**: every AI mutation is a **command batch** — undoes as one user-facing operation; audit trail shows AI-actor with full prompt + output capture.

**Deliverables**:
- `packages/command-bus/batch.ts` — `executeBatch(commands)` produces atomic patch group.
- AI-host extension to wrap output as batch.
- Audit metadata extension: `actorType: 'human'|'ai-floorplan'|'ai-generative'|'ai-rules'|'ai-query'|'ai-voice'`.
- AI prompt + output capture in `event_log` for debuggability.
- 100% of AI workflows go through batched commands.

**Daily**: D1 batch primitive in command-bus; D2 AI-host integration; D3 audit metadata extension; D4 prompt + output capture; D5–D6 retrofit all 5 AI plugins to batch; D7 audit dashboard hook; D8 lint; D9 sub-phase 3A demo; D10 retro.

**Exit (3A)**: all 11 visibility-intent waves migrated; AI moat fully on L7.5 with public API; AI batches undo as one; audit trail captures actor + AI prompt.

---

## §3 Sub-phase 3B — IFC + DXF + Rhino + Component Editor (M28–M30, S55–S60)

**Sub-phase goal**: import/export plugins (D9), parametric component editor (D10), BCF round-trip. By end of 3B, OBC is fully demoted from core to `plugins/ifc-import/` only — the viewer build excludes IFC entirely (saves ~3.4 MB).

### S55 — IFC import as plugin (web-ifc isolated) (Weeks 109–110, M28)

**Goal**: `plugins/ifc-import/` loads `web-ifc` only when invoked; viewer build (`apps/viewer-only`) excludes IFC entirely.

**Deliverables**:
- `plugins/ifc-import/` — lazy-loaded plugin with `web-ifc` dynamic import.
- IFC parser + DTO mapping to PRYZM schemas.
- Property set preservation; classification mapping (Uniclass / OmniClass).
- 9 IFC commands lifted from PRYZM 1.
- `apps/bench/ifc-import.ts` — measures import latency for small/medium/large IFC fixtures.
- `apps/viewer-only` build config: tree-shake `web-ifc` out.

**Daily**: D1 plugin skeleton + dynamic load; D2 IFC parser wiring; D3 DTO mapping for walls/slabs/doors/windows; D4 property sets + classification; D5 commands lift; D6 viewer-only build exclusion; D7 perf; D8 lint; D9 demo; D10 buffer.

**Exit**: sample IFC4 file imports correctly; property sets preserved; viewer-only bundle drops by ~3.4 MB; lazy load proven (no IFC code in initial bundle).

---

### S56 — IFC export with Psets + ISO 19650 (Weeks 111–112, M28–M29)

**Goal**: `plugins/ifc-export/` with full Pset round-trip and ISO 19650 naming compliance.

**Deliverables**:
- `plugins/ifc-export/` — IFC4 writer using `web-ifc-three` or equivalent.
- Pset templates configurable per project.
- ISO 19650 naming compliance (filename + element naming patterns).
- `tests/ifc/round-trip/` — export → re-import → byte-equivalent (modulo timestamps + metadata).
- `apps/bench/ifc-roundtrip.ts`.

**Daily**: D1 IFC writer skeleton; D2 element export per type; D3 Pset templates; D4 ISO 19650 compliance; D5 round-trip tests on 50-file fixture; D6 perf; D7 lint; D8 demo; D9 buffer; D10 buffer.

**Exit**: round-trip IFC: export → re-import → byte-equivalent on 50 of 50 fixtures; ISO 19650 naming check passes; OTel spans cover write pipeline.

---

### S57 — DXF + Rhino as plugins (Weeks 113–114, M29)

**Goal**: `plugins/dxf/` + `plugins/rhino/` — both round-trip on fixture files; both are isolated lazy loads.

**Deliverables**:
- `plugins/dxf/` — DXF reader/writer (e.g., `dxf-parser`); 2D import as annotations or 3D import as basic geometry.
- `plugins/rhino/` — Rhino .3dm reader (e.g., `rhino3dm`).
- 7 commands lifted (4 DXF + 3 Rhino per `09 §4`).
- Round-trip tests on fixture files.

**Daily**: D1–D4 DXF (read + write + tests); D5–D8 Rhino (read + write + tests, simpler than DXF); D9 demo; D10 buffer.

**Exit**: both formats round-trip on fixtures; lazy load proven; commands lifted.

---

### S58 — Component editor as separate vanilla-TS SPA (Weeks 115–116, M29–M30)

**Goal**: `apps/component-editor` — separate vanilla TS SPA for parametric component authoring; component definitions = Zod schemas + producers; sharable via plugin marketplace (which lands in S64).

**Why now**: D10 (parametric component editor) is the most "Revit-killer" of the 10 differentiators — none of Forma/Qonic/Motif/Pascal has it. The architecture (Zod schemas + pure producers) makes this clean; the editor is the human-facing surface.

**Deliverables**:
- `apps/component-editor/` — separate Vite app; vanilla TS; deep-links from `apps/editor`.
- Component DSL: parameters (Zod-typed), producers (pure function).
- Live-preview pane: parameter slider → producer re-runs → preview re-renders.
- Export: component package (`.pryzm-component` ZIP) shareable across projects + via marketplace.
- Sample components: parametric chair, parametric table, parametric door frame.
- `tests/component-editor/round-trip.test.ts` — author → export → re-import → render.

**Daily**: D1 SPA scaffold + deep-link routing; D2 component DSL + parameter UI; D3 producer authoring UX (Monaco editor + sandboxed eval); D4 live preview pane; D5 export package format; D6 sample components; D7 marketplace stub for component packages; D8 round-trip test; D9 demo; D10 buffer.

**Exit**: author a parametric chair end-to-end in < 30 min; export to `.pryzm-component`; reload in main editor; chair renders correctly with editable parameters.

---

### S59 — BCF issue round-trip (Weeks 117–118, M30)

**Goal**: `plugins/bcf/` — issue creation, comments, viewpoint capture, BCF 3.0 export. Solibri-compatible files.

**Deliverables**:
- `plugins/bcf/` — BCF 3.0 reader + writer.
- Issue store + per-element issue badges in 3D + plan + section views.
- Comments thread + @mentions tied to multiplayer awareness (so a peer is notified when @-mentioned).
- Viewpoint capture: camera + visibility + selection state snapshot.
- Round-trip tests on Solibri-exported fixtures.

**Daily**: D1 plugin + store; D2 issue creation UX; D3 comments thread + @mentions; D4 viewpoint capture; D5 BCF 3.0 writer; D6 BCF reader; D7 round-trip tests; D8 lint; D9 demo; D10 buffer.

**Exit**: BCF round-trip with Solibri-compatible files; @mentions notify peers; viewpoint capture restores correct state.

---

### S60 — PropertyPanel + PropertyInspector decomposition (Weeks 119–120, M30)

**Goal**: the two largest legacy files broken into per-element vanilla classes following the wall pattern.

**Deliverables**:
- Decomposition of `PropertyPanel.ts` (3,339 LOC) into `packages/ui/PanelHost.ts` (~200 LOC) + `plugins/<elem>/inspector/Panel.ts` (~250 LOC each, 12 elements).
- Decomposition of `PropertyInspector.ts` (2,808 LOC) into `packages/ui/InspectorHost.ts` + per-plugin inspector contributions.
- All inspector features still work; visual regression test (visual-diff < 2 px on 30-case property-panel fixture).
- LOC reduction: 6,147 → ~3,200 across ~25 files (~50% reduction in line count, ~95% reduction in single-file complexity).

**Daily**: D1 PanelHost + InspectorHost contracts; D2–D5 per-element decomposition (Wall, Slab, Door, Window canonical pattern, then agent-multiplied across remaining 8); D6 visual diff regression pass; D7 lint+typecheck; D8 sub-phase 3B demo; D9 retro; D10 buffer.

**Exit (3B)**: IFC + DXF + Rhino + component editor + BCF all functional as plugins; OBC fully demoted; PropertyPanel/Inspector decomposed; all M24 capabilities still working.

---

## §4 Sub-phase 3C — Plugin SDK 1.0, marketplace, public APIs (M31–M33, S61–S66)

**Sub-phase goal**: open the platform. By end of 3C, third-party developers can build, ship, and earn revenue from PRYZM plugins; integrators can call REST + WS + headless + AI APIs; PRYZM 2 the platform is the same shape from inside and outside.

### S61 — Legacy deletion sprint (Weeks 121–122, M31)

**Goal**: a sprint dedicated to **deleting code**. After this sprint, `src/legacy/` is empty; `EngineBootstrap.ts`, `ProjectSerializer.ts`, `initUI.ts`, `ImportProjectCommand.ts` are gone; all 264 legacy command files removed; all 2,078 `(window as any)` sites deleted.

**Why now**: by S61, every customer-facing capability is live in PRYZM 2. Legacy code can finally be deleted without losing any user functionality. The bundle drop is dramatic (target: < 6 MB raw initial).

**Deliverables**:
- DELETE: `src/EngineBootstrap.ts` (2,086 LOC).
- DELETE: `src/serialization/ProjectSerializer.ts` (1,894 LOC).
- DELETE: `src/initUI.ts` (2,724 LOC).
- DELETE: `src/commands/ImportProjectCommand.ts` (1,720 LOC).
- DELETE: all 264 legacy command class files.
- DELETE: `legacy/window-shim.ts` and the last 2,078 `(window as any)` sites.
- `apps/editor/src/index.html` — `?pryzm2=1` becomes default; `?pryzm1=1` is the deprecated fallback (sunset announcement begins).
- Bundle-size CI gate re-baselined: < 6 MB raw / < 1.8 MB gzip initial confirmed.
- `git ls-files src/legacy/` returns empty.

**Daily**: D1 inventory of every file to delete + dependency check; D2 delete first 50% (the easy ones — files no longer imported); D3 delete remaining 50% + fix any straggler imports; D4 delete `(window as any)` last sites; D5 swap default URL behaviour; D6 bundle-size re-baseline + visual regression sweep; D7 lint+typecheck full repo; D8 OTel coverage check; D9 demo; D10 buffer.

**Exit**: legacy directory empty; bundle below 6 MB raw; all visual regression tests still green; PRYZM 1 only accessible via explicit `?pryzm1=1` flag (deprecated); 90-day sunset countdown begins.

**Risk**: missed import breaks production. Mitigation: full visual regression sweep + e2e test suite + canary deploy to 5% of beta cohort first.

---

### S62 — Plugin SDK 1.0 — manifest, lifecycle, permissions (Weeks 123–124, M31–M32)

**Goal**: `packages/plugin-sdk/` 1.0 — published. Manifest schema, 7 named permissions, sandbox model (Web Worker + postMessage + CSP), lifecycle hooks, hot-reload via `pryzm dev`.

**Deliverables**:
- `packages/plugin-sdk/manifest.ts` — Zod schema for `plugin.manifest.json`.
- `packages/plugin-sdk/permissions.ts` — 7 named permissions: `read:project`, `write:project`, `read:user`, `network:fetch`, `register:tool`, `register:panel`, `register:command`.
- `packages/plugin-sdk/sandbox.ts` — Web Worker isolated; postMessage host bridge; CSP rules.
- `packages/plugin-sdk/lifecycle.ts` — `onInstall`, `onActivate`, `onDeactivate`, `onUninstall`.
- `packages/plugin-sdk/dev/` — `pryzm dev` CLI that watches plugin source and hot-reloads in < 500 ms.
- ADR-009 (plugin sandbox) re-validated against final implementation.
- `apps/bench/plugin-install.ts` — < 2 s plugin install + first invocation.

**Daily**: D1 manifest + permissions schema; D2 sandbox model (Worker + postMessage); D3 lifecycle hooks; D4 host bridge API surface; D5 `pryzm dev` hot-reload tooling; D6 sample external plugin built end-to-end (founder simulating external dev); D7 perf bench; D8 lint+security review; D9 demo; D10 buffer.

**Exit**: external developer can build a `hello-plugin` in < 1 hour following docs (S63); `pryzm dev` hot-reloads in < 500 ms; sandbox escape attempts blocked.

---

### S63 — Plugin SDK docs site (Weeks 125–126, M32)

**Goal**: `docs.pryzm.com/plugin-sdk/` — getting started, manifest reference, permission catalogue, sandbox guarantees, host API surface, examples, recipes for the 30 first-party plugins as templates.

**Deliverables**:
- `docs.pryzm.com` site (e.g., Astro/Starlight or VitePress).
- Sections: Getting Started, Manifest, Permissions, Sandbox, Host API, Tool Plugins, Panel Plugins, Command Plugins, Element Plugins (advanced), AI Plugins, Distribution + Marketplace.
- 30 example plugins documented (the first-party ones from S07–S60).
- Tutorials: "Build a wall counter", "Build an AI workflow", "Build a custom inspector".

**Daily**: D1–D2 site scaffolding + nav structure; D3 Getting Started + Manifest; D4 Permissions + Sandbox + Host API; D5–D6 plugin type tutorials; D7 examples gallery; D8 search + a11y; D9 demo; D10 buffer.

**Exit**: docs site live; 30 plugins documented; 3 tutorials walkable end-to-end by external developer.

---

### S64 — Marketplace v1 (Weeks 127–128, M32–M33)

**Goal**: `marketplace.pryzm.com` — list, install, update, uninstall plugins; signed plugin packages; revenue share infra; first-party plugins listed; one external test plugin installable.

**Deliverables**:
- `apps/marketplace/` — Next.js or vanilla; listing pages; install button.
- Plugin signing: Ed25519 signatures verified at install time.
- Revenue share infra: Stripe Connect for plugin authors; 80/20 split (default).
- 30 first-party plugins listed as canonical examples (most are free).
- One external test plugin (e.g., a "Wall Counter" published by a friendly third party).
- Plugin update + uninstall flows.
- `apps/sync-server` extension: per-project installed-plugin manifest; install enforced server-side.

**Daily**: D1 marketplace site + listing; D2 install flow (download + verify + sandbox load); D3 signing infra; D4 Stripe Connect integration; D5 first-party plugins listed; D6 external test plugin published; D7 update + uninstall flows; D8 lint+security; D9 demo; D10 buffer.

**Exit**: marketplace live with 30+ first-party plugins; one external plugin installable end-to-end; signing verified; install < 2 s end-to-end.

---

### S65 — Public REST + WebSocket APIs (Weeks 129–130, M33)

**Goal**: `apps/api-gateway` — REST endpoints from OpenAPI 3.1 (auto-generated from Zod); WebSocket stream; OAuth2; scoped API keys; rate limits per key + per IP; webhooks registered + delivered.

**Deliverables**:
- REST: `GET /v1/projects`, `GET /v1/projects/:id`, `POST /v1/projects/:id/elements`, `PATCH /v1/elements/:id`, `DELETE /v1/elements/:id`, etc.
- WS: `wss://api.pryzm.com/v1/projects/:id/stream` — broadcasts events + awareness.
- Webhooks: `POST /v1/webhooks` to register; deliver project events with HMAC-signed payloads.
- OpenAPI 3.1 auto-generated from Zod schemas + endpoint definitions.
- Rate limits: per-key tier (free / paid), per-IP fallback.
- API explorer at `api.pryzm.com/explorer/` (Scalar or Stoplight).
- `apps/bench/api-latency.ts` — gates p95 < 200 ms for reads, < 500 ms for writes.

**Daily**: D1 REST endpoints (CRUD on projects + elements); D2 WS stream; D3 webhooks + HMAC; D4 OpenAPI auto-generation; D5 rate limits + quota tiers; D6 API explorer; D7 perf bench; D8 lint+security; D9 demo; D10 buffer.

**Exit**: REST + WS + webhooks live; OpenAPI spec viewable; rate limits enforced; API explorer functional; sample integrations (curl, Node, Python) work.

---

### S66 — `@pryzm/headless` published to public npm + docs (Weeks 131–132, M33)

**Goal**: `apps/headless` published as `@pryzm/headless`; `docs.pryzm.com/headless/` complete; CLI `pryzm` published as `@pryzm/cli`; sample scripts run.

**Deliverables**:
- `@pryzm/headless` published on public npm registry; semver locked at 1.0.0.
- `@pryzm/cli` published as `npx pryzm` for CLI usage.
- `docs.pryzm.com/headless/` — Getting Started, API reference, examples.
- Recipes: "Generate 1000 project variants overnight", "Validate against rules in CI", "Convert IFC → PRYZM in pipeline".
- `apps/bench/headless-perf.ts` — gates per-element generation throughput.

**Daily**: D1 npm publish prep (package metadata, README, license); D2 CLI separation; D3 docs site sections; D4 recipe scripts; D5 perf bench; D6 npm publish (real); D7 verification on fresh install; D8 sub-phase 3C demo; D9 retro; D10 buffer.

**Exit (3C)**: SDK 1.0 + marketplace + public REST/WS + AI API + headless npm — every public surface live; PRYZM 2 the platform open to third parties.

---

## §5 Sub-phase 3D — Hardening + GA (M34–M36, S67–S72)

**Sub-phase goal**: production hardening — pen test, security audit, performance regression hunt, browser matrix, accessibility, self-host packaging, marketing site, GA launch.

### S67 — Self-host packaging (Weeks 133–134, M34)

**Goal**: `pryzm-selfhost/docker-compose.yml` deploys editor + sync-server + bake-worker + Postgres + MinIO on a fresh Linux VM in < 10 minutes. Single-binary path documented for post-GA.

**Why now**: D3 (open self-host) is a binding GA requirement (Ask 04 confirmation). Customer C3 (large enterprise IT) cannot adopt without this.

**Deliverables**:
- `pryzm-selfhost/docker-compose.yml` — full stack incl. Postgres + MinIO (S3-compatible).
- `pryzm-selfhost/install.sh` — one-shot installer for Ubuntu/Debian/RHEL.
- `pryzm-selfhost/.env.example` — config template.
- `docs.pryzm.com/selfhost/` — installation guide, upgrade guide, backup/restore.
- `apps/bench/install-time.ts` — measures fresh-VM install duration.
- ARM64 + x86_64 multi-arch Docker images.

**Daily**: D1 docker-compose composition; D2 MinIO + Postgres init scripts; D3 sync-server + bake-worker + editor + api-gateway containers; D4 install script; D5 ARM64 build; D6 fresh-VM install test (Ubuntu, Debian, RHEL); D7 docs; D8 lint; D9 demo; D10 buffer.

**Exit**: fresh Linux VM → `docker-compose up` → working PRYZM at `localhost:3000` in < 10 minutes; ARM64 + x86_64 both working.

---

### S68 — Security hardening (Weeks 135–136, M34–M35)

**Goal**: pen test (third-party), CSP audit, plugin sandbox audit, RLS audit, OAuth2 review, secret rotation. All findings remediated before GA.

**Deliverables**:
- Third-party pen test contract + report.
- CSP audit: report at `docs/security/csp-audit-2026-Q4.md`; restrictive CSP default for SaaS deployment.
- Plugin sandbox audit: independent confirmation no escapes.
- RLS audit on Postgres: every table has policy; verified test queries.
- OAuth2 review: PKCE flow correct; token expiry + refresh handled.
- Secret rotation playbook + scheduled job.
- `runDependencyAudit`, `runSastScan`, `runHoundDogScan` (per `security_scan` skill) all clean.

**Daily**: D1–D2 pen test (external; founder coordinates); D3 CSP audit + remediation; D4 sandbox audit; D5 RLS audit; D6 OAuth2 review; D7 dependency + SAST + HoundDog scans; D8 remediations; D9 demo; D10 buffer.

**Exit**: pen test report clean; HoundDog clean; SAST clean; SCA clean; CSP gates production traffic; RLS verified.

---

### S69 — Performance hardening (Weeks 137–138, M35)

**Goal**: every NFT target in `08-VISION.md §6` re-benched. Regressions hunted. Largest fixture (10K walls × 50 levels) tested.

**Deliverables**:
- Full bench suite re-run on baseline + production-scale fixtures.
- 10K wall × 50 level fixture created (`tests/fixtures/largest.pryzm`).
- Per-bench profile: any > 5% regression vs M24 hunted to root cause.
- `apps/bench/largest-model.ts` confirms < target on 10K-wall fixture.
- Memory profile: no leaks over 4-hour session simulation.

**Daily**: D1 baseline re-bench; D2 production-scale fixture creation; D3 large-model bench; D4 regression hunting (any > 5% slip); D5 memory profile + leak hunt; D6 perf doc updates; D7 lint; D8 demo; D9 buffer; D10 buffer.

**Exit**: every NFT target green incl. 10K-wall largest fixture; no memory leaks over 4h session; perf report at `apps/bench/reports/M35-perf.md`.

---

### S70 — Browser matrix + accessibility (Weeks 139–140, M35–M36)

**Goal**: Chrome 130+, Firefox 132+, Safari 18.4+ (Mac + iPad review mode), Edge — full test suite passes; WCAG 2.2 AA accessibility audit complete.

**Deliverables**:
- Cross-browser CI matrix in GitHub Actions.
- Visual regression suite per browser (Chrome reference; others diff < 5 px).
- Tablet review mode confirmed on iPad Safari (read-only, plan + section + sheet view, comments).
- WCAG 2.2 AA audit: keyboard navigation, screen reader support for property panels + inspector, contrast ratios, focus management.
- Accessibility report at `docs/accessibility/wcag-2.2-aa-2026-Q4.md`.

**Daily**: D1 CI matrix wiring; D2 Firefox-specific fixes; D3 Safari-specific fixes (WebGPU detection + WebGL2 fallback paths); D4 Edge confirmation (mostly Chromium); D5 iPad tablet mode; D6–D7 a11y audit + remediations; D8 demo; D9 lint; D10 buffer.

**Exit**: all 4 browsers pass full test suite; tablet review mode functional; WCAG 2.2 AA achieved on critical paths (project hub, editor, inspector, sheet view).

---

### S71 — Public docs site + marketing site + demo (Weeks 141–142, M36)

**Goal**: `pryzm.com` (marketing), `docs.pryzm.com` (full docs), 5-min demo video, 5 case studies, pricing, signup. Everything a launch announcement points to.

**Deliverables**:
- `pryzm.com` — marketing site: home, features (D1–D10 storytelling), pricing, customers, blog, signup.
- `docs.pryzm.com` — full docs (consolidates plugin SDK, headless, file format, REST/WS API, self-host, user guide).
- 5-min demo video — recorded, edited, captioned.
- 5 case studies — drawn from beta cohort with permission.
- Pricing page: free / pro / team / enterprise / self-host tiers with Stripe checkout integration.
- Signup flow live; email verification; project hub onboarding.
- SEO: sitemap, robots.txt, Open Graph metadata, structured data.

**Daily**: D1 site scaffolding + branding; D2 marketing copy; D3 pricing + Stripe integration; D4 docs consolidation; D5 demo video recording + editing; D6 case study writeups; D7 SEO + metadata; D8 launch dry-run; D9 demo; D10 buffer.

**Exit**: all sites live; demo video posted; signup works end-to-end; checkout works.

---

### S72 — **M36 GA LAUNCH GATE** (Weeks 143–144, M36)

**Goal**: PRYZM 2.0.0 tagged. Public launch. Press. Monitoring. Support workflow live. GA blog post. PRYZM 1 sunset announced (90-day migration window — already counting from S61).

**Deliverables**:
- `git tag v2.0.0`; release notes at `docs/release-notes/v2.0.0.md`.
- GA launch blog post: vision, journey, what's new, what's next.
- Press outreach: AEC publications, HN, Product Hunt, Twitter/LinkedIn.
- Monitoring: production OTel dashboards, alerting routes, on-call rota (founder + agent).
- Support workflow: per-tier SLAs, ticket triage, status page at `status.pryzm.com`.
- PRYZM 1 sunset confirmation: 90-day migration window (started S61); migration tool published; final shutdown date scheduled.
- M36 final bench report `apps/bench/reports/M36-GA.md`.
- Phase 3 retro + post-mortem of the 36-month journey.

**Daily**: D1 final integration sweep; D2 monitoring + alerting verification; D3 support workflow + status page; D4 launch dry-run; D5 release tag + notes; D6 launch blog post; D7 **LAUNCH** (Tuesday); D8–D9 first 48-hour monitoring + response; D10 retro.

**Exit (M36 GA GATE — full criteria)**:

#### Functional
- Every D1–D10 differentiator delivered.
- Every element family + documentation pipeline + multi-user + AI + IFC/DXF/Rhino + component editor functional.
- Plugin SDK 1.0 + marketplace + ≥ 30 first-party plugins + ≥ 5 third-party plugins.
- Public REST + WS + headless + AI APIs documented + rate-limited + OAuth2-authenticated.
- Self-host: fresh `docker-compose up` deploys in < 10 minutes (Linux x86 + ARM).

#### Performance
- Every NFT target in `08-VISION.md §6` green.
- 10K wall × 50 level largest fixture confirmed working.
- No memory leaks over 4h session.

#### Architectural
- All legacy deleted (`src/legacy/` empty).
- 0 `(window as any)` sites repo-wide.
- 0 non-scheduler rAF.
- 0 THREE imports outside committers.
- 100% OTel coverage on hot paths.

#### Quality
- Zero P0 / P1 bugs open.
- Pen test report clean.
- HoundDog scan clean.
- SAST clean.
- WCAG 2.2 AA on critical paths.
- Browser matrix green (Chrome / Firefox / Safari / Edge + iPad).

#### Business
- Marketing site live; pricing + checkout functional.
- 5 published case studies.
- ≥ 100 paying users on PRYZM 2.
- PRYZM 1 sunset announced; migration window active; migration tool published.
- Status page live; monitoring + alerting verified.

#### Documentation
- `docs.pryzm.com` complete: user guide + plugin SDK + headless + file format + REST/WS API + self-host + accessibility.
- `apps/bench/reports/M36-GA.md` published.
- 5-min demo video posted.
- GA launch blog post live.
- All 72 sprint retros archived in `docs/retros/`.
- 36-month journey post-mortem at `docs/post-mortems/PRYZM-2-build.md`.

---

## §6 Phase 3 risk register (specific to M25–M36)

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R3-01 | Legacy deletion (S61) breaks production via missed import | Medium | High | Full visual + e2e regression sweep; canary deploy to 5% beta first; fix-forward | S61 |
| R3-02 | Plugin sandbox escape post-publish | Low | Critical | ADR-009 + S62 sandbox audit + S68 pen test; bug bounty post-GA | S62, S68 |
| R3-03 | Public API abuse (excessive rate, scrape) | Medium | Medium | Rate limits + per-key quotas + abuse detection in S65; ban list operational | S65 |
| R3-04 | Self-host install fails on common Linux distros | Medium | High | Test matrix across Ubuntu/Debian/RHEL/Rocky + ARM64 in S67 | S67 |
| R3-05 | Pen test reveals critical issue | Medium | Critical | S68 has Days 1–7 reserved; S69 has buffer; if blocking, delay GA by 1 month | S68 |
| R3-06 | Browser matrix reveals Safari-blocking issue | Medium | High | WebGL2 fallback always present; visual-diff per-browser; iPad early test | S70 |
| R3-07 | 10K-wall fixture exposes new perf cliff | Medium | High | S69 perf hunting sprint; if missed, scope down largest-fixture target with disclosed ceiling | S69 |
| R3-08 | Marketplace plugin signing weakness | Low | Critical | Ed25519 + revocation list; signing key in HSM-equivalent | S64 |
| R3-09 | AI API costs unviable at scale | Medium | Medium | Per-key quotas + tier pricing in S53; usage caps; user-bring-your-own-key for heavy AI | S53, S65 |
| R3-10 | Founder burnout in final stretch | High | High | 1-week mandatory rest after S60 (M30); GA launch on a non-Friday; stakeholder support escalation routes ready | M30, M36 |

---

## §7 Phase 3 kill-switches

- **K3-A** — If at end of S54 (M27) AI host has > 5% boot impact (i.e., loaded eagerly somewhere by accident), halt 3B. Lazy load is non-negotiable.
- **K3-B** — If at S55–S57 (M28–M29) IFC/DXF/Rhino plugins increase initial bundle size at all, halt; tree-shake regression must be fixed.
- **K3-C** — If at S62 (M32) plugin sandbox fails an escape attempt in audit, halt SDK 1.0 publish; do not enter S64 marketplace until resolved.
- **K3-D** — If at S65 (M33) public API p95 > 500 ms for reads, halt API publish; tune until < 200 ms.
- **K3-E** — If at S68 (M35) pen test reveals critical-severity finding without 7-day fix path, delay GA by 1 month and re-run pen test.
- **K3-F** — If at S69 (M35) regression > 10% on any NFT target, halt forward 3D work; root-cause + fix; re-bench.
- **K3-G** — If at S70 (M35–M36) any browser fails the full test suite, halt GA marketing; either fix or publicly document the unsupported browser.

---

## §8 M36 GA gate — full exit criteria (consolidated)

For convenience, all M36 acceptance items in one place. (Repeat of S72 exit, here for indexing.)

### Functional
- All D1–D10 differentiators delivered.
- All element families + docs + multi-user + AI + IFC/DXF/Rhino + component editor.
- Plugin SDK 1.0 + marketplace + ≥30 first-party + ≥5 third-party plugins.
- Public REST + WS + headless + AI APIs.
- Self-host < 10 min on fresh Linux.

### Performance
- All NFT targets in `08-VISION.md §6` green.
- 10K-wall fixture confirmed.
- No memory leaks over 4h.

### Architectural
- Legacy deleted.
- 0 `(window as any)`, 0 non-scheduler rAF, 0 THREE outside committers.
- 100% OTel hot-path coverage.

### Quality
- Zero P0/P1; pen test clean; HoundDog/SAST clean; WCAG 2.2 AA; browser matrix green.

### Business
- Marketing live; ≥100 paying users; PRYZM 1 sunset announced.

### Documentation
- Full docs site; bench reports; demo video; case studies; release notes; post-mortem.

---

## §9 What Phase 3 explicitly did NOT do (post-GA roadmap seeds)

These are deliberately deferred to post-GA so the M36 launch is achievable:

- **Native mobile authoring app** (NG4 in `08-VISION.md`).
- **CFD / FEM / energy simulation in-editor** (NG3) — these are post-GA plugins.
- **IFC 4.3 advanced features** (per ADR-008).
- **Single-binary self-host** (after Docker Compose path stable).
- **Multi-region SaaS deployment** (US/EU/APAC failover).
- **SOC 2 / ISO 27001 certification** (post-GA, ~6 months).
- **AI plugin marketplace tier** (revenue-share for AI workflow authors).
- **Real-time co-presence in component editor** (component editor is single-author at GA).
- **PRYZM 1 → PRYZM 2 batch migration tool** (S72 ships per-project migration; batch tool in 90-day window).

These seed the post-GA roadmap. They are NOT part of the 36-month plan.

---

## §10 Phase 3 → post-GA handoff checklist

Items that must be true on M36 evening after launch:

- [ ] All M36 GA gate criteria signed off.
- [ ] `apps/bench/reports/M36-GA.md` and `docs/post-mortems/PRYZM-2-build.md` published.
- [ ] Production monitoring + alerting verified (test alert fired + acknowledged).
- [ ] Status page live and updating.
- [ ] On-call rota live (founder + agent escalation).
- [ ] PRYZM 1 sunset migration tool published; migration window counter visible to existing users.
- [ ] Beta cohort transitioned to GA pricing tier.
- [ ] First 48-hour monitoring rota staffed.
- [ ] Press / launch announcement traffic monitored; CDN scale-up confirmed.
- [ ] Founder on mandatory 2-week rest by M36 + 1 week.
- [ ] Post-GA roadmap document drafted at `docs/roadmap/post-GA.md` with the §9 items prioritised.

---

## §11 The 36-month closing thought

By M36 morning, every claim in `08-VISION.md` is delivered. Every gap in `09-AS-IS-VS-TO-BE.md` is closed. The discipline test from `08-VISION.md §10` — *"would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"* — has been the daily ritual that made this possible.

PRYZM 2 is now what it set out to be: **the open, web-native, AI-native, multi-user BIM authoring platform with desktop-CAD documentation parity, that anyone can self-host and anyone can extend**. It outscores Forma (98 vs 73 in the 50-capability matrix), beats Pascal on every dimension that matters (collaboration, documentation, AI, plugins, IFC), and ships moats no competitor can copy in less than 18 months (D2, D4, D7, D5).

The 36 months were not a budget for engineering effort. They were a budget for **discipline**. The architecture worked because every shortcut was refused. The plan finished because every kill-switch was respected. The product is great because every NFT target was a contract, not a wish.

The post-GA roadmap is the next book.

---

## §Gap-Closure Subphase — Phase 3 (S49–S72; added 2026-04-27 per `GAP-REVIEW-2026-04-27.md`)

Phase 3 is GA. Every gap-closure work item below is binding; misses cascade into M36 slip and ADR-018 cut decisions.

### §3A — Phase 3A (S49–S54)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S49** | Full L7.5 architectural promotion per SPEC-07 + SPEC-28; cost telemetry → Honeycomb live; ADR-029 (PDF-to-BIM Scope) ratified; SPEC-31 (PDF-to-BIM Pipeline) outline drafted; fixture corpus collection begins. Capacity-cut Tier-1 checkpoint per ADR-018 (T1.7 + T1.8 added per gap review). | SPEC-07, SPEC-28, ADR-029 |
| **S50** | SPEC-31 published; PDF parsing + page classification lit per ADR-029 Part A. | ADR-029 |
| **S51** | AI plan-view critique surface lit per SPEC-28 §3 + SPEC-07 §3 (proposal queue with full UI). | SPEC-07, SPEC-28 |
| **S52** | AI generate-3-options surface lit; cost guardrails verified at $0.18/call ceiling per SPEC-28 §3. | SPEC-28 |
| **S53** | Visibility-Intent migration retro per SPEC-30 §6 — confirm legacy 11-wave is no longer the primary path; only `featureFlags.legacy_vi_fallback` retains it. | SPEC-30 §6 |
| **S54** | Component editor (D10 loadable families) **deferred per ADR-018 T2.2** — confirmed dropped from Phase 3A; v2 backlog item. | ADR-018 T2.2 |

### §3B — Phase 3B (S55–S60)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S55** | **OBC removed from editor bundle** per SPEC-12 §5; `src/import/ifc/` migrated to `plugins/ifc-import/`; OBC library-mount entry deleted per ADR-023. Bundle size budget verified per SPEC-12 §7. PDF-to-BIM wall extraction lit per ADR-029. Print-canvas backend lit per SPEC-29 §4.4. Backup verification bench live per SPEC-24 §3.4. | SPEC-12, ADR-023, ADR-029 |
| **S56** | `packages/ui/` design tokens + primitives lit per ADR-026; half of `src/styles/` migrated. | ADR-026 |
| **S57** | Audit-log schema lit per ADR-021 + ADR-028 Part G; SOC2 evidence pipeline begins. | ADR-021, ADR-028 |
| **S58** | **Legacy 11-wave Visibility-Gate engine deleted** per SPEC-27 §4.3 + SPEC-30 §6.2. PDF-to-BIM door/window symbol matching lit per ADR-029. | SPEC-27, SPEC-30, ADR-029 |
| **S59** | DXF / SVG export per ADR-018 T2.1 — decide v1 ship-or-defer based on Phase 2 velocity. | ADR-018 T2.1 |
| **S60** | PDF-to-BIM confidence model + review queue UI lit per ADR-029 Part A. Idle-CPU bench audit per ADR-023 Part F. Reserved VM capacity review per ADR-022 Part D — possible second VM for >2k concurrent users per SPEC-15 §2.2.1. | ADR-022, ADR-023, ADR-029 |

### §3C — Phase 3C (S61–S66)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S61** | **`src/engine/EngineBootstrap.ts` deleted** per SPEC-27 §4.3; `apps/editor/src/main.ts` is the new composition root. The hardest deletion. | SPEC-27 §4.3 |
| **S62** | PDF-to-BIM fixture corpus parity testing; accuracy bar measurement per ADR-029 Part E. WebGPU readiness re-evaluated per ADR-025 Part C. | ADR-029, ADR-025 |
| **S63** | Public API draft published; OpenAPI schema for `.pryzm` import / export per SPEC-26 §8. | SPEC-26 §8 |
| **S64** | `packages/ui/` migration covers all editor panels; `src/styles/panels/` 80% migrated. | ADR-026 |
| **S65** | Public REST `import` / `export.pryzm` endpoints lit per SPEC-26 §11. PDF backend large-sheet bench < 8 s green per SPEC-29 §9. WebGPU compute investigation for post-GA SPEC-30 acceleration. PDF-to-BIM pricing finalised; cost ceilings enforced per ADR-029 Part C. Workspace Admin AI Spend view shipped per SPEC-28 §9. Enterprise admin UI for plan/role overrides per ADR-028 Part E. Formula library extraction for plugin SDK exposure (read-only) per ADR-027. View+project lifecycle events deleted per ADR-030 Part D. | SPEC-26, SPEC-28, SPEC-29, SPEC-30, ADR-026, ADR-027, ADR-028, ADR-029, ADR-030 |
| **S66** | `src/styles/` deletion completes per ADR-026 + SPEC-27. Public API beta opens. | ADR-026 |

### §3D — Phase 3D (S67–S72, GA)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S67** | Multi-region prep — Tier-2 cuttable per ADR-018 T2.6; if not cut, EU-West + US-East regional Supabase primaries provisioned per SPEC-24 §1.3 + SPEC-15 §3.1. | ADR-018, SPEC-15, SPEC-24 |
| **S68** | SOC2 quarterly access-review automation per SPEC-24 §1.10. SAML / SCIM mappings table per ADR-021 + SPEC-24 §1.1. | ADR-021, SPEC-24 |
| **S69** | DR drill: rollback runbook tested in last DR drill per SPEC-27 §9. | SPEC-27 |
| **S70** | Self-host docker-compose published per SPEC-15 §7. Self-host migration tooling published per SPEC-27 §7. PDF-to-BIM public preview launch per ADR-029. Self-host BYO-key safety cap enforced per SPEC-28 §11. Legacy `src/lifecycle/` **deleted** per SPEC-27 §4.3 + ADR-030 Part D. | SPEC-15, SPEC-27, SPEC-28, ADR-029, ADR-030 |
| **S71** | Final hardening; all SPEC §11 Phase rollout items checked. Format v1 frozen per SPEC-26. | all SPECs |
| **S72** (GA) | All targets green: SPEC-15 §8 perf; SPEC-30 §2 all four tiers; SPEC-26 round-trip; ADR-022 single-frame-owner; ADR-026 zero `react` symbols in editor bundle; ADR-027 formula library frozen at v1; ADR-028 SOC2 evidence audit-trail captured; ADR-029 accuracy bar measured; ADR-030 `plugins/lifecycle/` GA-shipped. PDF-to-BIM ships under "preview" or full label per ADR-029 Part E gate. | all |

### Updated bench gates (Phase 3, GA)
The S72 GA gate (existing) now also asserts:
- `pnpm bench all` green at SPEC §11 Phase rollout requirements for every SPEC.
- `pnpm bench single-frame-owner-audit` green per ADR-023 Part F.
- `pnpm bench webgpu-feature-readiness` green if WebGPU is the default per ADR-025 Part C.
- Editor production bundle has zero `react` symbols (build-time gate per ADR-026 Part C).
- All SPEC-30 §2 four tiers green.
- SOC2 evidence pipeline produces quarterly auto-reports per ADR-021 + ADR-028 Part G.

### Updated GA exit criteria
GA ships only when **all** of:
1. M24 beta gate items elapsed cleanly.
2. Phase 3 rollout above complete.
3. ADR-018 Tier-1 + Tier-2 capacity cuts decided and reflected in scope.
4. Legacy `src/engine/`, `src/lifecycle/`, `src/styles/`, `src/visibility/` all deleted.
5. `pnpm bench all` green for two consecutive weeks.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? `08-VISION.md` overrides. The hardest sprint of Phase 3 is S61 (legacy deletion); the most important is S72 (GA launch). Both have explicit kill-switches. Re-read this document at end of M27, M30, M33 to recalibrate against any drift.*
