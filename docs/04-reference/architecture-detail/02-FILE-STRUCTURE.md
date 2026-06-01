# PRYZM — Architectural File-Structure Breakdown

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc is the **per-folder + per-file reference** for the live repository tree. It is intentionally short — the per-package detail lives in [docs/01-strategy/architecture-breakdown.md](../../01-strategy/architecture-breakdown.md). The shape + lint matrix + composition root lives in [docs/01-strategy/architecture.md](../../01-strategy/architecture.md).
> **Source of truth**: each row is verified against `ls -d` or `git ls-tree` at 2026-06-01.

---

## §0 — Why this document exists

The repo has 79 packages, 13 apps, 47 plugins, ~50 scripts, 38 server files, plus root config + tests + docs + tools. A newcomer needs ONE map that says **"here is the canonical layout, here is what each folder is for."** This doc is that map. It is *descriptive* of the shipped tree at 2026-06-01 and *prescriptive* for anything that lands in the tree from now on — new top-level dirs need an ADR; new packages/plugins/apps need an entry in [architecture-breakdown.md](../../01-strategy/architecture-breakdown.md).

For per-package one-liners (79+47+13 = 139 entries), see [architecture-breakdown.md §6, §7, §5](../../01-strategy/architecture-breakdown.md).

For layer rules + boundary lint + composition root, see [architecture.md](../../01-strategy/architecture.md).

---

## §1 — Top-level layout

```
/  (repository root)
│
├─ apps/        (13)   L7   — runnable surfaces
│                              editor, api-gateway, sync-server, ai-worker,
│                              bake-worker, export-worker, marketplace,
│                              marketplace-api, marketplace-web,
│                              component-editor, docs-site, cli, bench
│
├─ packages/    (79)   L0–L8 — pure / kernel / runtime / SDK libraries
│                              (see §2 below for the layered map)
│
├─ plugins/     (47)   L9   — element-family + AI + view + interchange plugins
│                              (see §3 below for the categorised map)
│
├─ tools/       (3)    —    — build-time tooling
│                              ga-gate (21 CI gates), pryzm1-sunset, scripts
│
├─ tests/       (15)   —    — cross-package suites
│                              e2e, integration, parity, visual-diff,
│                              browser-matrix, family-load-*, contract-44,
│                              audit-log-s57, s70-lifecycle-deletion,
│                              ci, ga-gate, playwright, fixtures, commands,
│                              family-marketplace-publish
│
├─ scripts/     (~50)  —    — Node scripts (CI, isolation guards, codegens)
│
├─ server/      (38)   —    — Express BFF + per-feature service modules
│                              (see §4 below for the categorised map)
│
├─ src/         (7)    L7.5 — transitional legacy zone (NO subdirs)
│                              boot-shell.d.ts, browser-entry.tsx,
│                              browser.css, familyCreatorPlaceholder.ts,
│                              global-window.d.ts, main.ts, three-addons.d.ts
│
├─ docs/                —    — engineering documentation
│                              01-strategy/ · 02-decisions/ · 03-execution/
│                              04-reference/ · 05-guides/ · archive/
│
├─ public/             —    — static assets (Cesium tiles, fonts, icons)
├─ .changeset/         —    — semver changelogs
├─ .github/            —    — GitHub Actions workflows
├─ .ga-gate/           —    — CI baselines
│
└─ Root config:
   ├─ index.html, browser.html         — browser entries
   ├─ server.js (5648 LOC, 278 KB)     — Express BFF entry
   ├─ package.json, pnpm-workspace.yaml, pnpm-lock.yaml
   ├─ tsconfig.json, tsconfig.base.json
   ├─ vite.config.ts, vitest.config.ts, turbo.json
   ├─ postcss.config.js, tailwind.config.js
   ├─ eslint.config.js, eslint-baseline-window-as-any.json
   ├─ replit.md, CLAUDE.md             — agent memory + Claude Code instructions
   ├─ RELEASE-NOTES-2.0.0.md, REGRESSION-DIAGNOSIS.md
   └─ .gitattributes, .gitignore, .dockerignore, replit.nix
```

---

## §2 — `packages/` layered map (79 packages)

Layer assignments per [architecture.md §1](../../01-strategy/architecture.md). One-line purposes per [architecture-breakdown.md §6](../../01-strategy/architecture-breakdown.md).

```
L0 — Schemas (1)
└─ schemas/                          — Zod schemas + typed IDs (pure; no I/O, no THREE, no DOM)

L1 — Infrastructure (13 + 2 L1½)
├─ command-bus/                      — L2 command bus + Immer-patch
├─ frame-scheduler/                  — sole rAF owner (P3)
├─ renderer-three/                   — sole THREE owner (P2)
├─ picking/                          — GPU + BVH hybrid
├─ visibility/                       — visibility-intent waves (P7)
├─ snapping/                         — 11-provider snap engine
├─ spatial-index/                    — SpatialGrid + BVH queries
├─ sync-client/                      — Yjs CRDT
├─ ai-cost/                          — per-call cost meter
├─ input-host/                       — pointer + wheel + keyboard
├─ physics-host/                     — broad-phase spatial query
├─ runtime-undo-stack/               — ring buffer
├─ drawing-primitives/        (L1½)  — vector primitives (Canvas2D/SVG/PDF/Print)
└─ protocol/                  (L1½)  — DTO re-exports from schemas

L2 — Domain logic (17)
├─ geometry-kernel/                  — pure producers → BufferGeometryDescriptor (8k LOC, 90 files)
├─ ai-host/                          — lazy AI host (7 workflows under src/workflows/)
├─ constraint-solver/                — planegcs WASM
├─ types-builtin/                    — built-in type catalogues
├─ geometry-wall/                    — wall geometry subsystem
├─ geometry-door/                    — door geometry subsystem
├─ geometry-window/                  — window geometry subsystem
├─ geometry-slab/                    — slab geometry subsystem
├─ geometry-roof/                    — roof geometry subsystem
├─ geometry-stair/                   — stair geometry subsystem
├─ geometry-column/                  — column geometry subsystem
├─ geometry-beam/                    — beam geometry subsystem
├─ geometry-curtain-wall/            — curtain-wall geometry subsystem
├─ geometry-lighting/                — lighting geometry subsystem
├─ geometry-plumbing/                — plumbing geometry subsystem
├─ geometry-furniture/               — furniture geometry subsystem
└─ geospatial/                       — LTP-ENU + Proj4 + IfcProjectedCRS

L3 — State (1)
└─ stores/                           — Immer-patch + DirtyDiff fan-out

L4 — Scene + persistence (5 + 1 fixture)
├─ scene-committer/                  — PrimitiveCommitter + SceneRegistry + MaterialPool
├─ persistence-client/               — EventLog + Backend (InMemory/IndexedDb/FileSystem)
├─ renderer/                         — WebGPU/WebGL2 dual-mode pipeline
├─ render-runtime/                   — selection-highlight + edge-outline
├─ render-pipeline/                  — TSL WebGPU passes
└─ legacy-shim/                      — fixture-only (lint integration test)

L5 — File + view (2)
├─ file-format/                      — .pryzm v1 ZIP + .pryzm-family format
└─ view-state/                       — ViewDefinition/ViewRegistry/ActiveView

L6 — Composition root + UI base (2)
├─ runtime-composer/                 — composeRuntime() — ~29 typed slots
└─ ui-base/                          — Panel lifecycle + runtime field + OTel

L8 — Plugin SDK + Family Platform (4)
├─ plugin-sdk/                       — @pryzm/sdk v1.0.0 (sandbox + signing + CLI + bSDD)
├─ family-instance/                  — pure-Node family-instance bake pipeline
├─ family-loader/                    — opens .pryzm-family ZIP
└─ family-runtime/                   — expression DSL + resolver + unit coercion

Headless + Editor public API (5)
├─ headless/                         — @pryzm/headless v1.0.0-rc.1 (Node.js PryzmRuntime)
├─ editor-ui/                        — Editor-UI public API contracts
├─ engine/                           — Engine public API contracts (type-only)
├─ views/                            — View-layer public API contracts
└─ ui/                               — UI host primitives

Standalone / utility (~27)
├─ command-registry/                 — all BIM commands
├─ core-app-model/                   — Wave 10 LIFT model
├─ event-bus/                        — typed event bus (595 event names)
├─ data-engine/                      — Data Panel + automation
├─ pdf-export/                       — PDF export (fills C29 typed stub)
├─ pdf-to-bim/                       — PDF-to-BIM extraction proposals
├─ ai-spend/                         — AI spend aggregator
├─ admin-overrides/                  — enterprise admin overrides
├─ api-rbac/                         — OAuth2 scope catalogue
├─ api-spec/                         — Public API OpenAPI 3.1 schema
├─ rate-limit/                       — token-bucket rate limiter
├─ wcag-audit/                       — WCAG 2.2 AA audit runner
├─ webhooks/                         — webhooks + HMAC-SHA256 signing
├─ oauth2-pkce/                      — PKCE OAuth2 helper
├─ beta-signup/                      — beta cohort sign-up
├─ crash-reporter/                   — crash + uncaught-error reporter
├─ email-transport/                  — transactional email transport
├─ storage-driver/                   — InMemory + R2 (S3-compat)
├─ perf-budgets/                     — canonical NFT-target list
├─ formula-library/                  — read-only formula library
├─ feature-flags/                    — feature flag + kill-switch registry
├─ expr-eval/                        — light parametric expression evaluator
├─ room-topology/                    — room spatial index + adjacency graph
├─ speculative-engine/               — read-only consequence preview
├─ release/                          — GA gate orchestrator
├─ bench-visual-diff/                — visual-diff harness wrapper
└─ eslint-plugin-pryzm/              — custom ESLint rules
```

---

## §3 — `plugins/` categorised map (47 plugins)

```
Geometry / element (15):
├─ wall, door, window, slab, floor, ceiling, roof
├─ column, beam, stair, handrail, curtain-wall
└─ lighting, plumbing, structural

View / display (5):
└─ plan-view, section-view, view, navigate, render

AI (5):
└─ ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice

Interchange (7):
└─ ifc-import, ifc-export, ifc-inspector, bcf, rhino-import, dxf, export-pdf

Sheets + annotations (4):
└─ sheets, annotations, dimensions, schedules

Rooms + topology + grid (3):
└─ rooms, grid, levels

Cross + selection + visibility (3):
└─ cross, selection, visibility-intent

Family (1):
└─ family-editor

Collaboration (2):
└─ multiplayer, geospatial

Furniture + smoke (2):
└─ furniture, toy-cube
```

47 total. Per-plugin one-liners in [architecture-breakdown.md §7](../../01-strategy/architecture-breakdown.md).

---

## §4 — `server/` BFF map (38 files)

```
Core infrastructure:
├─ pgClient.js                       — PostgreSQL pool
├─ dbMigrate.js                      — 19-table schema migration on startup
├─ schema.sql                        — canonical SQL schema
├─ supabaseClient.js                 — Supabase REST client (preferred)
├─ supabaseMigrate.js                — Supabase-side schema
└─ supabase-rls.sql                  — Row Level Security policies

Authentication + plans:
├─ authStore.js                      — bcrypt + JWT (SESSION_SECRET, 30 d)
├─ oauthService.js                   — Google + Microsoft OAuth2
├─ permissions.js                    — RBAC
└─ planStore.js                      — AI quota + plan enforcement

Project + data:
├─ projectStore.js (33.5 KB)         — project CRUD + version storage
├─ projectAccess.js                  — ownership + membership checks
├─ projectMembers.js                 — ISO 19650 member roles
└─ versionStateMachine.js            — WIP → SHARED → PUBLISHED → ARCHIVED

Storage + files:
├─ ifcStorageService.js              — IFC blob storage
├─ dwgConversionService.js           — DWG → DXF adapter
├─ renderService.js (19.9 KB)        — render + panorama gallery
└─ familyMarketplaceRoutes.js        — /api/v1/families publish + browse (Ed25519)

AI + billing:
├─ aiPublicApiRoutes.js (17.4 KB)    — Public AI API (/v1/ai/*)
├─ aiUsageStore.js                   — recordAiUsage + spend summary
├─ stripeRoutes.js                   — checkout + portal + webhook
├─ stripeService.js                  — Stripe API wrapper
├─ stripeMiddleware.js               — raw-body capture for webhook signature
└─ webhookService.js                 — outbound webhook delivery

Middleware + security:
├─ corsPolicy.js                     — centralised CORS
├─ securityHeaders.js (16.7 KB)      — Helmet + CSP + COEP + COOP + HSTS
├─ rateLimiter.js                    — globalLimiter / apiLimiter / aiLimiter
├─ auditLogMiddleware.js             — audit log rows on mutations
├─ exportGuard.js                    — JWT-based export-download tokens
├─ logSafe.js                        — sensitive-field redaction
├─ namingValidator.js                — ISO 19650 naming validation
└─ telemetry.js                      — OpenTelemetry SDK boot (opt-in)

API routes + portfolio:
├─ api/v1/routes.js (66 KB)          — REST API router (Phases E-1/E-2/E-3/E-4)
└─ portfolio/portfolioGraphService.js — aggregate analytics (E-4)
```

19 PostgreSQL tables: `pryzm_users` · `projects` · `project_versions` · `project_members` · `version_audit_log` · `user_plans` · `render_gallery` · `panorama_gallery` · `project_webhooks` · `template_registry` · `visibility_intents` · `project_command_log` · `ifc_uploads` · `ai_usage` · `ai_response_cache` · `event_log` · `marketplace_plugins` · `plugin_publisher_keys` · `plugin_revocations` · `plugin_purchases` · `plugin_reviews`.

---

## §5 — Authoritative counts (verified 2026-06-01)

| Surface | Count | Verification command |
|---|---:|---|
| Packages | 79 | `ls -d packages/*/` |
| Apps | 13 | `ls -d apps/*/` |
| Plugins | 47 | `ls -d plugins/*/` |
| Tools | 3 | `ls -d tools/*/` |
| Tests | 15 | `ls -d tests/*/` |
| `src/` files | 7 (0 subdirs) | `ls src/` |
| Server files | 38 | `find server -type f \| wc -l` |
| CI gates | 21 | `ls tools/ga-gate/check-*.ts` |
| Benchmarks | 68 | `ls apps/bench/src/benches/*.bench.ts` |
| Contracts | 49 | `ls docs/02-decisions/contracts/C*.md` |
| ADRs | 108 | `ls docs/02-decisions/adrs/*.md \| grep -v README` |
| Specs | 56 | `ls docs/03-execution/specs/*.md \| grep -v README` |

---

## §6 — Conformance verdict

The repository structure **conforms to the layered model defined in [architecture.md §1](../../01-strategy/architecture.md)**. Specifically:

- **L0 schemas are pure** (CI-enforced)
- **L1 single-rAF + single-THREE** (CI-enforced)
- **L7.5 monotonically shrinking** (7 files at 2026-06-01; target zero per boolean #1)
- **L8 plugin SDK is the only L9 → lower-layer bridge** (CI-enforced)

The `src/` folder no longer has engine/ or ui/ subdirs (they migrated to `apps/editor/src/{engine,ui}/`). The convergence booleans hold at code level; remaining work is operational (npm publish + DNS).

---

## §7 — How to update this doc

This doc updates when **the repository structure changes**. Specifically:

- A new top-level directory → update §1 + §5 + raise an ADR
- A new package / plugin / app → add a row in [architecture-breakdown.md](../../01-strategy/architecture-breakdown.md) + update §5 counts here
- A renamed package / plugin / app → update both files in the same PR
- The boundary lint matrix or composition root changes → that updates [architecture.md](../../01-strategy/architecture.md), not this doc

Per [operating-principles O5](../../01-strategy/operating-principles.md), drift is fixed by **editing this doc**, not by writing `*-AUDIT-YYYY-MM-DD.md` alongside it.

---

## §8 — Cross-references

| Doc | Relationship |
|---|---|
| [docs/01-strategy/architecture.md](../../01-strategy/architecture.md) | Shape + boundary matrix + composition root + lint gates |
| [docs/01-strategy/architecture-breakdown.md](../../01-strategy/architecture-breakdown.md) | Per-package + per-plugin + per-app one-liner inventory |
| [docs/01-strategy/engineering-vision.md](../../01-strategy/engineering-vision.md) | P1–P8 principles + D1–D13 differentiators |
| [docs/01-strategy/product-vision.md](../../01-strategy/product-vision.md) | Product north star + user journey |
| [docs/02-decisions/contracts/README.md](../../02-decisions/contracts/README.md) | 49 binding contracts (C01–C49) |
| [docs/02-decisions/adrs/](../../02-decisions/adrs/) | 108 per-decision rationales |
| [docs/03-execution/specs/](../../03-execution/specs/) | 56 per-system normative specs |

---

*End — PRYZM Architectural File-Structure Breakdown, 2026-06-01 — CANONICAL.*
