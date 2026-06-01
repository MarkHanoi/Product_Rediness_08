# PRYZM — Architecture Breakdown

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc provides the **per-package + per-plugin + per-app inventory** with verified one-line descriptions. Companion to [architecture.md](./architecture.md) (the rules + shape + lint gates). When code changes, this doc updates in the same PR (per [operating-principles O4](./operating-principles.md)).
> **Source of truth**: each row is derived from the package's `package.json` description + `src/index.ts`. Cross-check with `ls -d packages/*/` etc.

---

## §0 — How to read this doc

This document is a flat **inventory** — it answers *"what is each package / plugin / app for?"* in one line per row. The shape, principles, and lint gates live in [architecture.md](./architecture.md). The per-decision rationale lives in [02-decisions/adrs/](../02-decisions/adrs/). The per-system normative rules live in [02-decisions/contracts/](../02-decisions/contracts/).

Numbers below are verified from `ls -d` + file counts. If you find drift, fix this doc in the same PR as the code change.

---

## §1 — Repository top-level

```
/
├─ apps/        (13)   L7   — runnable surfaces (editor, workers, marketplace, CLI, bench, docs-site)
├─ packages/    (79)   L0–L8 — pure / kernel-shaped / runtime / SDK libraries
├─ plugins/     (47)   L9   — element-family + AI + view + interchange plugins
├─ tools/       (3)    —    — build-time tooling (ga-gate, pryzm1-sunset, scripts)
├─ tests/       (15)   —    — cross-package suites (e2e, parity, integration, ga-gate, …)
├─ scripts/     (~50)  —    — Node scripts (CI, isolation guards, codegens)
├─ server/      (38)   —    — Express BFF + per-feature service modules
├─ src/         (7)    L7.5 — transitional legacy zone (monotonically shrinking)
├─ docs/                —    — engineering documentation (this folder)
├─ public/             —    — static assets served by Express/Vite
├─ rules/              —    — (no top-level rules/ directory; programRules.ts lives inside ai-host)
└─ root config files   —    — TS / Vite / pnpm / Tailwind / ESLint / Turborepo + server.js entry
```

**Verified counts at 2026-06-01**: 79 packages, 13 apps, 47 plugins, 7 `src/` files (no subdirs), 38 server files, 21 CI gates in `tools/ga-gate/`, 68 bench files in `apps/bench/src/benches/`.

---

## §2 — Root-level config files

The project root contains configuration and the Express entry point. Every file here is part of the build/runtime contract.

| File | Purpose |
|---|---|
| `index.html` | Browser entry. Inline `<style>` skeleton + inline `<script>` for auth-state detection + `window.__pryzmPendingActions` replay queue + `#platform-root` mount. Stage 0 paint (< 100 ms, the NFT-1 enabler). |
| `browser.html` | Secondary entry for the embedded/canvas-2D browser view (Vite `rollupOptions.input.browser`). |
| `server.js` | Main Express server, 5648 LOC, 278 KB. Single backend process; routes 45+ endpoints; Socket.io; Vite middleware (dev) or static (prod); Anthropic proxy; Stripe; OAuth (Google + Microsoft); auth middleware; DB migrations on startup. |
| `tsconfig.json` + `tsconfig.base.json` | TypeScript config. `strict: true`, `moduleResolution: bundler`, `jsx: react-jsx`, `target: ES2022`. |
| `vite.config.ts` | Vite + cesium plugin + custom `itemCatalogPlugin` + manual chunks (cesium/web-ifc/thatopen/three/pathtracer/pdfjs/dxf/rhino3dm/chart.js) + `optimizeDeps.exclude: ['web-ifc','three']`. |
| `vitest.config.ts` | Root vitest config (per-package overrides per-folder). |
| `turbo.json` | Turborepo pipeline; defines `build`, `test:ci`, `lint` task ordering across the workspace. |
| `postcss.config.js` + `tailwind.config.js` | CSS toolchain. |
| `eslint.config.js` | Root ESLint flat config. Loads `eslint-plugin-boundaries`, `eslint-plugin-pryzm`, `@typescript-eslint`. The primary P2/P4/P6/P7 gate mechanism. |
| `eslint-baseline-window-as-any.json` | P4 cast-count tripwire baseline. |
| `package.json` | Root workspace manifest. 16 `workspace:*` deps in the Vite build graph. Node ≥ 20, pnpm@10.26.1. |
| `pnpm-workspace.yaml` | Declares `packages/*`, `apps/*`, `plugins/*`, `tools/*`, `tests/*` as workspace members. |
| `pnpm-lock.yaml` | Deterministic lockfile. Never edit manually. |
| `replit.md` | Agent/platform memory file — wave-by-wave change history. |
| `CLAUDE.md` | Repo-root instruction file for Claude Code sessions. |

---

## §3 — `server/` — Backend BFF (38 files, ~395 KB)

The Express server layer. **Not part of the layered L0–L9 frontend architecture.** It is the BFF clients talk to. All files are JavaScript (ESM).

### §3.1 — Core infrastructure

| File | Purpose |
|---|---|
| `pgClient.js` | PostgreSQL connection pool (`pg`). `getPgPool()`, `query()`, `getBackendInfo()`. Falls back to Replit's `DATABASE_URL`. |
| `dbMigrate.js` | Runs schema migrations on startup. **19 tables** + idempotent DDL. Prefers Supabase REST, falls back to pg. |
| `schema.sql` | Canonical SQL schema (the 19 tables listed below). Shared with Supabase. |
| `supabaseClient.js` | Supabase REST client factory. Prefers `SUPABASE_SERVICE_ROLE_KEY`. |
| `supabaseMigrate.js` | Supabase-side schema migration. |
| `supabase-rls.sql` | Row Level Security policies for Supabase. |

### §3.2 — Authentication + plans

| File | Purpose |
|---|---|
| `authStore.js` | Core auth: signup/signin/verify. bcrypt (12 rounds) + JWT (SESSION_SECRET, 30 d). |
| `oauthService.js` | Google + Microsoft OAuth2 popup-based flow. |
| `permissions.js` | RBAC: `hasPermission(userId, projectId, action)`. |
| `planStore.js` | AI quota enforcement; plan resolution (free / architect / studio / firm / owner). |

### §3.3 — Project + data

| File | Purpose |
|---|---|
| `projectStore.js` (33.5 KB) | CRUD for projects + versions. Supabase primary, pg fallback. |
| `projectAccess.js` | `canUserAccessProject(userId, projectId)` — ownership + membership. |
| `projectMembers.js` | Project membership: list / upsert / role-update / remove. |
| `versionStateMachine.js` | ISO 19650 CDE state machine: WIP → SHARED → PUBLISHED → ARCHIVED. |

### §3.4 — Storage + files

| File | Purpose |
|---|---|
| `ifcStorageService.js` | IFC file storage; wraps pg/Supabase JSONB. |
| `dwgConversionService.js` | DWG → DXF server-side adapter. |
| `renderService.js` (19.9 KB) | Render + panorama gallery CRUD. |
| `familyMarketplaceRoutes.js` | `/api/v1/families` — browse + publish `.pryzm-family` artefacts. Ed25519 signature verification. |

### §3.5 — AI + billing

| File | Purpose |
|---|---|
| `aiPublicApiRoutes.js` (17.4 KB) | Public AI API (`/v1/ai/*`); per-call cost ceilings; AI usage row per call. |
| `aiUsageStore.js` | `recordAiUsage`, `getSpendSummary`; writes `ai_usage` rows. |
| `stripeRoutes.js` | Checkout session, billing portal, webhook handler. |
| `stripeService.js` | Stripe wrapper; subscription + marketplace events. |
| `stripeMiddleware.js` | Raw-body capture for Stripe webhook signature verification. |
| `webhookService.js` | Outbound webhook delivery for model change events. |

### §3.6 — Middleware + security

| File | Purpose |
|---|---|
| `corsPolicy.js` | Centralised CORS; shared by Express + Socket.io. |
| `securityHeaders.js` (16.7 KB) | Helmet + CSP + COEP + COOP + HSTS + Referrer-Policy. |
| `rateLimiter.js` | Three rate limiters: globalLimiter / apiLimiter / aiLimiter. |
| `auditLogMiddleware.js` | Audit log rows on POST/PUT/DELETE. |
| `exportGuard.js` | JWT-based short-lived export-download tokens. |
| `logSafe.js` | Sensitive-field redaction. |
| `namingValidator.js` | ISO 19650 naming validation. |
| `telemetry.js` | Optional OpenTelemetry SDK boot (only if `OTEL_EXPORTER_OTLP_ENDPOINT` set). |

### §3.7 — API routes

| File | Purpose |
|---|---|
| `api/v1/routes.js` (66 KB) | REST API router. Phases E-1/E-2/E-3/E-4. JWT auth required. |

### §3.8 — Portfolio

| File | Purpose |
|---|---|
| `portfolio/portfolioGraphService.js` | Aggregate analytics across all user projects; backs E-4 endpoint. |

### §3.9 — The 19 PostgreSQL tables

`pryzm_users` · `projects` · `project_versions` · `project_members` · `version_audit_log` · `user_plans` · `render_gallery` · `panorama_gallery` · `project_webhooks` · `template_registry` · `visibility_intents` · `project_command_log` · `ifc_uploads` · `ai_usage` · `ai_response_cache` · `event_log` · `marketplace_plugins` · `plugin_publisher_keys` · `plugin_revocations` · `plugin_purchases` · `plugin_reviews`. (5 are marketplace-specific.)

---

## §4 — `src/` — L7.5 transitional zone (7 files, 0 subdirs)

This zone has migrated from the pre-2026 30+ files / 7+ subdirs state down to **7 transitional files**. Monotonically shrinks toward zero. The engine + UI halves have moved to `apps/editor/src/{engine,ui}/`.

| File | Purpose |
|---|---|
| `boot-shell.d.ts` | TypeScript declarations for the boot-shell singleton (auth detection + replay queue). |
| `browser-entry.tsx` | Secondary entry for the embedded browser view. |
| `browser.css` | Stylesheet for `browser-entry.tsx`. |
| `familyCreatorPlaceholder.ts` | Stub for the Family Creator entry from the editor shell. |
| `global-window.d.ts` | Global `Window` type augmentations. |
| `main.ts` | Stage 1 boot entry. `bootPlatform()` Phase A (runtime composition + landing/hub mount). |
| `three-addons.d.ts` | THREE addon module type declarations (for legacy `import 'three/addons/...'`). |

---

## §5 — `apps/` (13 apps)

| App | Purpose |
|---|---|
| **editor** | Main L7 editor application; bootstrap data (S05) + render + start pump (S06 D5). |
| **api-gateway** | REST + WS surface (PORT 5101). S65 / ADR-041 + ADR-042. |
| **sync-server** | Server-side sync skeleton (S22); linearises commands, broadcasts via WebSocket. |
| **ai-worker** | AI worker (S47); BullMQ queue + handler registry (InMemory dev / Redis prod). |
| **bake-worker** | Server-side bake worker (S21); geometry producers + chunk writer + cost telemetry. |
| **export-worker** | Async export job queue worker (Phase 2C); PDF/IFC/DXF pipeline. |
| **marketplace** | Plugin catalog browser + developer submission portal (Wave A20-T22). |
| **marketplace-api** | Plugin marketplace API skeleton; browse/version/sign-verify/revoke (S64 D1). |
| **marketplace-web** | Family Marketplace SPA; browse published `.pryzm-family` artefacts (S59). |
| **component-editor** | Family Creator SPA; 2D sketcher → constraint solver → 3D extrude/sweep/loft/revolve. |
| **docs-site** | Developer docs site (Astro Starlight); S63 / ADR-0039. |
| **cli** | `pryzm-cli`; pack/unpack `.pryzm` v1 files from shell. |
| **bench** | Micro-bench harness; vitest timing wrappers; **68 benches** with baseline regression gate. |

---

## §6 — `packages/` (79 packages)

Grouped by layer. Each row: name + one-line purpose. Layer assignments per [architecture.md §1](./architecture.md).

### §6.1 — L0 — Schemas (1 package)

| Package | Purpose |
|---|---|
| **schemas** | Zod schemas, typed IDs, `createId` factory. Zero I/O, zero THREE, zero DOM (P5). Family schemas in 7 sub-folders: `family-{request,definition,parametric,geometry,schemas,registry,pipeline}`. |

### §6.2 — L1 — Infrastructure (13 packages)

| Package | Purpose |
|---|---|
| **command-bus** | L2 command bus; handler registry + Immer-patch producer + undo-stack interop. |
| **frame-scheduler** | L5 frame scheduler; dirty-flag set + rAF priority queue + idle pump. Sole rAF owner (P3). |
| **picking** | GPU-pick (default) + BVH-pick (fallback) strategies; hybrid selection. |
| **visibility** | Visibility-Intent legacy adapter; 11-wave system (waves 1–5 live; 6–11 at S49). P7 owner. |
| **snapping** | Snapping engine (Wave 11); 11 providers + SnapManager + SnapVisualizer. |
| **spatial-index** | Spatial index (Wave 8+11); `ElementSpatialIndex`, `SpatialGrid`, BVH queries. |
| **ai-cost** | AI call cost meter (USD) per surface/plan; tracks budgets against enforcement. |
| **sync-client** | Yjs CRDT sync client; `SyncClient` + `EventBridge` (Immer ⇄ Y.Map). |
| **runtime-undo-stack** | Ring-buffer undo stack (Sprint A35). |
| **input-host** | Input-host slot owner; keyboard/pointer/wheel/touch source + tool-layer routing. |
| **physics-host** | Physics-host slot owner; spatial query backend (raycast / AABB / point-in-volume). |
| **renderer-three** | Sole THREE owner (P2); WorkspaceSurface lifecycle handle. `three-re-export.ts` is the single import boundary. |
| **drawing-primitives** | Vector primitive set + multi-backend rendering (Canvas2D / SVG / PDF / Print). |

Plus **protocol** (DTO re-exports from schemas) as an L1½ consumer.

### §6.3 — L2 — Domain logic (17 packages)

| Package | Purpose |
|---|---|
| **geometry-kernel** | L4 geometry kernel; pure DTO → `BufferGeometryDescriptor` producers (no THREE). Ceiling producer lives here. |
| **ai-host** | AI host (L7.5); lazy-loaded surface; 7 workflows under `src/workflows/`. Zero first-paint bytes per ADR-014. |
| **constraint-solver** | 2D geometric constraint solver; planegcs WASM via `SolverPorter`. |
| **types-builtin** | Built-in type catalogues (8 doors, 8 windows, 4 roofs, 4 curtain-wall systems). |
| **geometry-wall** | Wall geometry; types, store, fragment builder, alignment guides. |
| **geometry-door** | Door geometry; types, store, system-type store. |
| **geometry-window** | Window geometry; types, store, system-type store. |
| **geometry-slab** | Slab geometry; types, store, fragment builder, validators. |
| **geometry-roof** | Roof geometry; types, snapshot utils, tools, fragment builder. |
| **geometry-stair** | Stair geometry; types, builders, tools, stairPath. |
| **geometry-column** | Column geometry; types and slab-column coupling. |
| **geometry-beam** | Beam fragment builder and level cleanup. |
| **geometry-curtain-wall** | Curtain-wall geometry; grid system, panel builder, worker pool. |
| **geometry-lighting** | Lighting geometry; fixture types, room resolver, placement tool. |
| **geometry-plumbing** | Plumbing geometry; fixture types, geometry builders. |
| **geometry-furniture** | Furniture geometry; AI element config/validator, kitchen/wardrobe types. |
| **geospatial** | Geospatial coordinate transforms; LTP-ENU rebasing, proj4js, IfcProjectedCRS. |

### §6.4 — L3 — State (1 package)

| Package | Purpose |
|---|---|
| **stores** | L1 stores layer; `Store<T>` base with Immer-patch + DirtyDiff fan-out. |

### §6.5 — L4 — Scene + persistence (5 packages)

| Package | Purpose |
|---|---|
| **scene-committer** | L5 scene committer; `PrimitiveCommitter` interface + `SceneRegistry` + `MaterialPool`. |
| **persistence-client** | L0 persistence client; `EventLog` + pluggable Backend (InMemory / IndexedDb / FileSystem). |
| **renderer** | L5 renderer (WebGPU/WebGL2 dual-mode, single forward pipeline). |
| **render-runtime** | L5 render-runtime helpers; selection-highlight committer + edge-outline builder. |
| **render-pipeline** | TSL WebGPU render pipeline passes (ScenePass, ZonePass, SSGI, TRAA, Outline). |

Plus **legacy-shim** (fixture-only package for lint integration test; intentionally bad code).

### §6.6 — L5 — File + view (2 packages)

| Package | Purpose |
|---|---|
| **file-format** | `.pryzm` v1 portable ZIP format; pack/unpack/migration framework. Plus `.pryzm-family` (family pack format). |
| **view-state** | View state layer; `ViewDefinition`/`ViewRegistry`/`ActiveView`/`ViewController`. |

### §6.7 — L6 — Composition root + UI base (2 packages)

| Package | Purpose |
|---|---|
| **runtime-composer** | Composition root (S73); `composeRuntime()` wires all L0–L7.5 pieces. ~29 typed slots. |
| **ui-base** | Phase B.1 panel base class; Panel lifecycle + runtime field + OTel spans. |

### §6.8 — L8 — Plugin SDK + Family Platform (4 packages)

| Package | Purpose |
|---|---|
| **plugin-sdk** | PRYZM Plugin SDK 1.0; descriptor schema + 6 host proxies + iframe sandbox + Ed25519 + `pryzm dev` CLI + bSDD lookup. publishConfig.name = `@pryzm/sdk`. |
| **family-instance** | Pure-Node family-instance bake pipeline; parameter resolution + 3D geometry dispatch. |
| **family-loader** | Family loader; opens `.pryzm-family` ZIP, validates manifest/document, runs pre-flight resolver. |
| **family-runtime** | Family-runtime expression DSL + resolver + unit coercion; pure-Node, dep-free. |

### §6.9 — Headless + Editor surfaces (3 packages)

| Package | Purpose |
|---|---|
| **headless** | Full PryzmRuntime in Node.js without browser. `@pryzm/headless` v1.0.0-rc.1. |
| **editor-ui** | Editor-UI public API contracts (`InspectModeCoordinator`, `PreviewManager`, etc.). |
| **engine** | Engine public API contracts (type-only; concrete impl in `apps/editor`). |
| **views** | View-layer public API contracts (`PlanViewManager`, `SectionViewService`, `SplitViewManager`). |
| **ui** | UI host primitives (`PanelHost`/`InspectorHost`) for `PropertyPanel` decomposition. |

### §6.10 — Standalone / utility packages (the remainder)

| Package | Purpose |
|---|---|
| **admin-overrides** | Enterprise admin plan/role/feature overrides; CRUD via api-gateway. |
| **ai-spend** | Workspace AI spend aggregator; serves views to admin Spend panel. |
| **api-rbac** | OAuth2 scope catalogue + scope-checking middleware for Public API. |
| **api-spec** | PRYZM Public API OpenAPI 3.1 schema (hand-authored YAML). |
| **bench-visual-diff** | Visual-diff harness wrapper; capture + diff subcommands. |
| **beta-signup** | Beta cohort sign-up surface; validation + persistence + confirmation email. |
| **command-registry** | All BIM commands (walls, slabs, doors, rooms, hierarchy, etc.). |
| **core-app-model** | Core app model (Wave 10 LIFT); drawing pipeline types + style tables. |
| **crash-reporter** | Crash + uncaught-error reporter; lazy-loaded, OTel trace enrichment. |
| **data-engine** | Data Panel & Automation engine; predicate registry + rule evaluator. |
| **email-transport** | Transactional email transport; lazy-loaded SMTP/Resend/Postmark adapter. |
| **eslint-plugin-pryzm** | Custom ESLint rules enforcing architectural contracts. |
| **event-bus** | Typed event-bus; 595 platform event names + OTel span wrapper. |
| **expr-eval** | Light parametric expression evaluator (length=a+b, angle=90*0.5); no solver. |
| **feature-flags** | Feature flag + kill-switch registry; pure, no DOM/THREE. |
| **formula-library** | Read-only formula library extraction for plugin-SDK (immutable catalogue). |
| **oauth2-pkce** | PKCE (RFC 7636) code-verifier + OAuth2 token-exchange helper for API. |
| **pdf-export** | PDF export package (fills C29 typed stub). (no description in package.json) |
| **pdf-to-bim** | PDF-to-BIM extraction proposals + confidence model + review-queue feeder. |
| **perf-budgets** | Canonical NFT-target list mapping vision contract rows to bench baselines. |
| **rate-limit** | Token-bucket rate limiter for Public API; 60 r/m read + 20 r/m write (free tier). |
| **release** | GA gate orchestrator; runs 23 verification scripts, exits non-zero on failure. |
| **room-topology** | Room topology layer; spatial index + adjacency graph. |
| **speculative-engine** | Speculative state engine; read-only consequence preview for destructive actions. |
| **storage-driver** | Storage driver abstraction; `InMemoryStorageDriver` + `R2StorageDriver` (S3-compat). |
| **wcag-audit** | WCAG 2.2 AA audit runner; pure axe-core wrapper + critical-path declarations. |
| **webhooks** | Webhooks subscription store + HMAC-SHA256 signing + exponential backoff delivery. |

---

## §7 — `plugins/` (47 plugins)

Grouped by category. Each plugin lives in `plugins/<name>/` with `src/descriptor.ts` + `src/index.ts` + (for active plugins) `src/handlers/` + (for element plugins) `src/committer/`.

### §7.1 — Geometry / element plugins (15)

| Plugin | Purpose |
|---|---|
| **wall** | Wall (S07-S10); Store + 5+ handlers + system-type catalogue + producer + tool. |
| **door** | Door (S11); Store + 6 handlers + frame/leaf/handle producer + committer/tool. |
| **window** | Window (S11); Store + 5 handlers + frame/mullion/glass slots producer. |
| **slab** | Slab (S12); Store + 8 handlers + top/bottom/side material slots producer. |
| **roof** | Roof (S11); Store + 8 handlers + producer (pitch/thickness/overhang). |
| **stair** | Stair (S14); Store + 8 handlers + tread/riser producer (straight/L/U-shape). |
| **handrail** | Handrail (S14); Store + 5 handlers + profile extrusion + stair cascade. |
| **column** | Column (S12); Store + 5 handlers + rect/circular/I-section producer. |
| **beam** | Beam (S12); Store + 5 handlers + geometry producer + committer/tool. |
| **ceiling** | Ceiling (S14); Store + 4 handlers + triangulated planar polygon producer. |
| **curtain-wall** | Curtain-wall (S12); Store + 9 handlers + grid/mullion/transom producers. |
| **floor** | Floor finish element (§P3.2-FL); `floor.create` handlers + legacy-store bridge. |
| **lighting** | Second-tier lighting (S26); 5 handlers + `THREE.PointLight` committer. |
| **plumbing** | Second-tier plumbing (S26); 4 handlers (Create/Delete/Move/SetSystem). |
| **structural** | Second-tier structural (S26); 7 handlers + brace/footing/connection producer. |

Plus **furniture** (S27); 7 handlers + multi-LOD representation + carousel catalogue.

### §7.2 — View / display plugins (5)

| Plugin | Purpose |
|---|---|
| **plan-view** | Plan-view foundation (S29); vanilla 2D-canvas: projection, LevelStore, PlanCamera. |
| **section-view** | Section-view skeleton (post-2B closeout); kernel section-cut producer. |
| **render** | Empty render plugin shell (F-prereq.0); post-FX/lighting presets land in F.x. |
| **navigate** | Empty navigate plugin shell (F-prereq.0); navigation rail / camera bookmarks land in F.x. |
| **view** | View plugin (S17); 5 handlers (Create/Delete/Rename/Switch/UpdateCamera). |

### §7.3 — AI plugins (5)

| Plugin | Purpose |
|---|---|
| **ai-floorplan** | AI-floorplan plugin shell (S47); lazy-loaded, zero first-paint bytes. |
| **ai-generative** | AI generative shell (S51); `Generate3Options` workflow via ai-host. |
| **ai-query** | AI semantic-query shell (S51); read-only inspector workflow via ai-host. |
| **ai-rules** | AI rule-engine shell (S51); rules/compliance workflow via ai-host. |
| **ai-voice** | AI voice shell (S52); `VoiceCommand` workflow via ai-host. |

### §7.4 — Interchange plugins (6)

| Plugin | Purpose |
|---|---|
| **ifc-import** | IFC Tier 2 import (S57); reads IFC4 via web-ifc; transform-only proxies. |
| **ifc-export** | IFC Tier 1 export (S56); writes IFC4 STEP via web-ifc + side-car metadata. |
| **ifc-inspector** | IFC Pset editor panel (S57); DOM component renders property-set editor. |
| **bcf** | BCF (BIM Collaboration Format) round-trip; reads/writes BCF 3.0 ZIP archives. |
| **rhino-import** | Rhino 3DM import (S57); reads `.3dm` via rhino3dm WASM (node-compatible). |
| **dxf** | Empty DXF plugin shell (F-prereq.0); import/export wiring lands in F.x. |
| **export-pdf** | Empty PDF-export shell (F-prereq.0); sheets/BCF → PDF pipelines in F.x. |

### §7.5 — Sheet + annotation plugins (4)

| Plugin | Purpose |
|---|---|
| **sheets** | Sheets (S37); Store + 4 handlers + Canvas2D sheet-editor + sheet-list view. |
| **annotations** | Annotations (S34); 8 handlers + `TextNoteTool` + plan-view adapter. |
| **dimensions** | Dimension annotations (S29); 6 handlers for dimension CRUD. |
| **schedules** | Schedules (S41); Store + 6 handlers + formula DSL parser + reactive table. |

### §7.6 — Rooms + topology + grid (3)

| Plugin | Purpose |
|---|---|
| **rooms** | Rooms (S25); Store + 8 handlers + half-edge flood-fill room producer. |
| **grid** | Grid (S12); Store + 4 handlers + flat ribbon-mesh producer (lines + labels). |
| **levels** | Empty levels plugin shell (F-prereq.0); level-set/story navigation lands in F.x. |

### §7.7 — Cross + selection + visibility (4)

| Plugin | Purpose |
|---|---|
| **cross** | Cross-element cascade rules; L4 rules wire plugins (e.g. slab → wall edge-pinned). |
| **selection** | Selection plugin; 3 handlers (select/deselect/clear) → SelectionStore patches. |
| **visibility-intent** | Empty visibility-intent shell (F-prereq.0); Visual rail routes via this. |
| **family-editor** | PRYZM Family Editor; parametric BIM family creator (Phase F reference stub). |

### §7.8 — Collaboration (2)

| Plugin | Purpose |
|---|---|
| **multiplayer** | Multiplayer (S44); remote-peer awareness + `CursorRenderer` + `PeerListPanel`. |
| **geospatial** | Empty geospatial plugin shell (F-prereq.0); CRS/tiles/terrain land in F.x. |

### §7.9 — Smoke + reference (1)

| Plugin | Purpose |
|---|---|
| **toy-cube** | S02 toy plugin; `MoveCubeCommand` registration (smoke test of L1↔L2 pipeline). |

---

## §8 — `tools/` (3)

| Tool | Purpose |
|---|---|
| **ga-gate** | 21 CI gate scripts (`check-*.ts`); run by `run-all.ts`. Merge-blocking. |
| **pryzm1-sunset** | PRYZM 1 sunset / migration tooling. |
| **scripts** | Build-time codegen + helper scripts. |

---

## §9 — `tests/` (15 cross-package suites)

| Suite | Purpose |
|---|---|
| **e2e** | End-to-end playwright tests across the editor + apps. |
| **integration** | Cross-package integration tests. |
| **ga-gate** | Gate test suite (validates each `check-*.ts` against fixtures). |
| **parity** | Parity tests between competing implementations (Canvas2D vs SVG, etc.). |
| **playwright** | Playwright config + shared fixtures. |
| **visual-diff** | Visual regression suite (3D + plan + sheet). |
| **fixtures** | Shared test fixtures. |
| **commands** | Command-bus integration tests. |
| **contract-44** | Tests bound to a specific contract (44 / project isolation leak). |
| **audit-log-s57** | S57 audit-log tests. |
| **family-load-into-project** | Family loading + bake regression tests. |
| **family-marketplace-publish** | Family publish flow tests. |
| **browser-matrix** | Per-browser × per-OS regression suite. |
| **s70-lifecycle-deletion** | S70 lifecycle deletion tests. |
| **ci** | CI-only smoke tests + bench baseline runners. |

---

## §10 — `docs/` — the documentation tree

Top-level docs structure (post-2026-06-01 restructure per [docs/README.md](../README.md)):

```
docs/
├─ 01-strategy/          this folder — vision, brand, architecture, GTM, principles
├─ 02-decisions/         contracts (C01-C49) + ADRs (108) + principles
├─ 03-execution/         specs (56) + plans + status logs
├─ 04-reference/         glossary, API, file formats, architecture-detail
├─ 05-guides/            user / developer / enterprise / plugin-author
├─ archive/              PRYZM 1 + 2 inheritance · superseded plans
├─ README.md             top-level navigation
├─ NAMING-CONVENTIONS.md naming + brand rules
└─ DOCUMENTATION-GAPS-AND-NEXT-PHASES.md tracker
```

Full doc-folder structure documented in [docs/README.md](../README.md).

---

## §11 — Tier summary (LOC + import-graph state)

Verified counts at 2026-06-01 (excludes node_modules + dist):

| Tier | Packages | Approx LOC | Direct deps from `src/` |
|---|---|---:|---|
| **L0 — Foundation** | `schemas` | ~3,000 | No (transitive) |
| **L1 — Infrastructure** | 13 packages | ~14,000 | `frame-scheduler`, `picking`, `visibility` |
| **L1½ — L0 consumers** | `protocol`, `drawing-primitives` | ~1,100 | `protocol` |
| **L2 — Domain logic** | 17 packages incl `geometry-kernel` (8k LOC, 90 files) + `ai-host` + 13 `geometry-*` | ~28,000 | — |
| **L3 — State** | `stores` | ~1,800 | `stores` |
| **L4 — Scene + persist** | 5 packages | ~10,000 | `persistence-client` |
| **L5 — File + view** | `file-format`, `view-state` | ~4,500 | `file-format` |
| **L6 — Composition** | `runtime-composer`, `ui-base` | ~4,700 | `runtime-composer`, `ui-base` |
| **L7 — Apps** | 13 apps | varies | — |
| **L8 — Plugin SDK + Family Platform** | 4 packages | ~5,000+ | — |
| **L9 — Plugins** | 47 plugins | varies | — |
| **Standalone** | ~27 endpoint/utility packages | varies | — |

Total: **79 packages**, **47 plugins**, **13 apps**.

---

## §12 — Known data gaps (to fix in this doc's next pass)

These rows have less than full information at 2026-06-01 and need cleanup:

| Item | Gap |
|---|---|
| `packages/pdf-export/` | No `description` field in `package.json` |
| `packages/runtime-undo-stack/` | No `description` field in `package.json` |
| Per-package LOC counts in §11 | Approximate; per-package `cloc` run pending |
| Plugin `descriptor.ts` per-contribution declarations | Not enumerated; each plugin's CONTRIBUTES list lives in its descriptor.ts |
| Apps `src/` entry-point routes | Not detailed per-app; each app's main.ts holds the routing |

Per [operating-principles O5](./operating-principles.md), gaps are filled by **editing this doc**, not by writing a `*-AUDIT-YYYY-MM-DD.md` alongside it.

---

## §13 — What this document is NOT

- Not the layered architecture rules → [architecture.md](./architecture.md)
- Not the per-decision rationale → [02-decisions/adrs/](../02-decisions/adrs/)
- Not the per-system normative contract → [02-decisions/contracts/](../02-decisions/contracts/)
- Not the per-system normative spec → [03-execution/specs/](../03-execution/specs/)
- Not a per-FILE inventory (this is per-PACKAGE/PLUGIN/APP) → `git ls-tree` is canonical for file-level

---

*End — PRYZM Architecture Breakdown, 2026-06-01 — CANONICAL.*
