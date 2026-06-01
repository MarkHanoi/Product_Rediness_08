# PRYZM — Master Architecture, Capabilities & Track File

> **Stamp**: 2026-06-01 · **Status**: SYNTHESIS — orchestrator's audit
> **Derived from**: full read of `docs/01-strategy/product-vision.md` · `01-VISION.md` · `02-ARCHITECTURE.md` · `docs/02-decisions/contracts/README.md` + all C01–C30 · all top-level PRYZM3 plans · 4 parallel reconnaissance sweeps over `packages/` (78) · `plugins/` (47) · `apps/` (13) + `server/` + `src/`.
> **Authority below**: `00-PRODUCT-VISION` > `01-VISION` > `02-ARCHITECTURE` > C-contracts > ADRs > SPECs. This doc is a NAVIGATION + SYNTHESIS layer, not a contract.
> **Why this exists**: a single map of what PRYZM is today, where every piece of code lives, and what's still on the road. Built so future sessions don't reinvent existing systems.

---

## §0 — North Star (one sentence)

> **PRYZM is the design intelligence platform for the built environment** — the first tool where a single conversation can take a project from raw site to coordinated building model, with every spatial, environmental, and regulatory constraint baked in from the first prompt.

PRYZM 3 is a **browser-native, layered, plugin-extensible BIM/AEC editor** that competes with Revit/Archicad on capability, Bonsai/IFC.js on openness, Forma/Qonic/Motif on collaborative speed. **Single white UI**, **single composition root** (`composeRuntime()`), **single open file format** (`.pryzm` ↔ IFC4 round-trip).

## §1 — The 5 platform principles (product vision §3)

| Principle | Practice |
|---|---|
| Conversation-first authoring | Every workflow begins with NL prompt. RAC drives project initiation. Batch AI commands drive generation. |
| Site-grounded design | Geolocation drives orientation, sun, wind, shadows BEFORE any geometry. |
| Constraint-aware generation | 248+ architectural/regulatory/spatial constraints. ROOM_RULES is the law. Layouts valid by construction. |
| Living BIM model | Stores intent + constraints + relationships + performance targets ALONGSIDE geometry. Changing a target adapts the layout. |
| Human + AI collaboration | AI generates, humans review/refine. Manual + batch AI + conversational coexist. Human always in control. |

## §2 — The 8 architectural principles (P1–P8, CI-enforced)

| # | Principle | Gate today |
|---|---|---|
| P1 | Single composition root (`composeRuntime()`) | Soft-fail counter; hard at Phase D exit |
| P2 | Single THREE owner (`packages/renderer-three/`) | Hard-fail (ESLint boundaries) |
| P3 | Single rAF (`packages/runtime-composer/src/scheduler.ts`) | Soft-fail tripwire; hard at Wave 7 |
| P4 | No `(window as any)` outside `src/legacy/window-shim.ts` | Soft-fail counter; hard at Phase E exit |
| P5 | Schemas are pure (no I/O / THREE / DOM in `packages/schemas/`) | Hard-fail |
| P6 | Commands are the only mutation path (no direct store writes from UI) | Hard-fail |
| P7 | Visibility intent ≠ UI state (`packages/visibility/` is a domain concept) | Hard-fail |
| P8 | Sync conflicts explicit + every public function ≥ 1 OpenTelemetry span | Hard-fail per-PR |

## §3 — The 13 differentiators (D1–D13)

| # | Differentiator | Status |
|---|---|---|
| D1 | Open `.pryzm` file format (IFC4 lossless round-trip) | Live |
| D2 | Run-anywhere browser-native | Live |
| D3 | Real-time multi-user with explicit conflicts (CRDT) | Live (LWW today; Yjs full CRDT in Phase 2D) |
| D4 | Plugin SDK with marketplace (`@pryzm/sdk` v1.0.0) | Live; npm-publish + DNS pending |
| D5 | AI as first-class layer | Live (ai-host + 45+ workflows) |
| D6 | Sovereignty default (EU region + BYOK) | Architecture defined; deployment pending |
| D7 | Self-host minimum (5-user team in < 1 day on their own AWS) | Live (`pryzm-selfhost/`) |
| D8 | Federated clash detection (BCF round-trip with Solibri/Navisworks/BIMcollab) | Live (`plugins/bcf/`) |
| D9 | Pascal-editor-grade family creation | In progress (`apps/component-editor/`, Family Platform P0 pending) |
| D10 | Honest performance contracts (17 NFTs measured in CI every sprint) | 17/17 bench files live |
| **D11** | **Architecturally sound Sheet & PDF export** | **α-substrate shipped (C24+C29)** |
| **D12** | **Native Revit round-trip via IFC4** | **α-substrate shipped (C26)** |
| **D13** | **BIM 3.0 Inspect & Data Model** | **α-substrate shipped (C27+C28)** |

## §4 — The 9-layer model

```
L9.5  src/ (2 folders: engine/, ui/) — transitional, shrinking → src/ui/ only
L9    plugins/* (47)           ← may only import L8 (plugin-sdk)
L8    packages/plugin-sdk      ← public SDK facade (v1.0.0)
L7    packages/ui-base, src/ui ← UI hosts bound to runtime
L6    packages/runtime-composer ← THE composition root (composeRuntime)
L5    apps/* (13) + packages/file-format + view-state
L4    packages/renderer, render-runtime, render-pipeline, persistence-client, scene-committer
L3    packages/stores, runtime-composer consumers (frame-scheduler, sync-client, input-host, physics-host, ui, view-state, data-engine, headless, crash-reporter, family-* runtime)
L2    packages/geometry-* (13 element types) + ai-host + constraint-solver + drawing-primitives + geometry-kernel + spatial-index + room-topology + family-instance/loader/runtime + types-builtin
L1    packages/command-bus, picking, visibility, snapping, ai-cost, sync-client, runtime-undo-stack, renderer-three (single THREE), event-bus, formula-library, geospatial, storage-driver, stores (base), feature-flags
L1½   packages/protocol, drawing-primitives (L0-consumers)
L0    packages/schemas (Zod foundation)
```

A higher layer may import a lower; the reverse is forbidden. CI gate: `eslint-plugin-boundaries`.

---

## §5 — Folder-by-folder map

### §5.1 — `packages/` (78 active + 3 retiring stubs)

Grouped by layer + concern. Source: full audit pass 2026-06-01.

#### L0 / L1½ — Foundation

| Package | Purpose |
|---|---|
| `schemas` | Zod schemas for every domain type (L0 pure; foundation for all layers) |
| `protocol` | Public DTO surface — re-exports from `@pryzm/schemas` for wire format |
| `drawing-primitives` | 2-D primitive set + multi-backend rendering (Canvas2D / SVG / PDF) — **owns the sheet composition substrate (C24)** |
| `feature-flags` | Feature flag + kill-switch registry |
| `persistence-client` | EventLog interface + InMemory/IndexedDb backends + codecs |
| `formula-library` | Read-only immutable catalogue of named type-checked formulas |

#### L1 — Infrastructure leaves (no internal `@pryzm/*` deps)

| Package | Purpose |
|---|---|
| `command-bus` | Handler registry, Immer-patch producer, MessagePack emitter, OTel span |
| `frame-scheduler` | Single rAF + idle pump (P3 home) |
| `picking` | GPU-pick + BVH-pick strategies behind `PickStrategy` interface |
| `visibility` | Visibility-Intent domain concept (P7) + IsolationVisibilityIntent (INS-α-3) |
| `snapping` | SnapManager + providers |
| `renderer-three` | THREE.js re-export boundary (the ONLY P2 owner) + WorkspaceSurface + IsolationAnimator (INS-α-7) |
| `ai-cost` | OTel meter tracking AI call costs against per-project/day budgets |
| `sync-client` | Yjs document + Y.Doc ⇄ Immer EventBridge (ADR-0033) |
| `runtime-undo-stack` | Undo stack abstraction (type-only) |
| `event-bus` | Typed event-bus + DOMEventBus + OTel wrapper |
| `geospatial` | LTP-ENU, proj4js, IfcProjectedCRS coordinate transforms (C12) |
| `storage-driver` | Storage driver abstraction: InMemory/R2/S3 implementations |
| `spatial-index` | ElementSpatialIndex + SpatialGrid + room services |
| `stores` (base) | `Store<T>` base class with Immer-Patch + DirtyDiff fan-out |
| `crash-reporter` | Crash + uncaught-error reporter with lazy OTel trace linking |

#### L2 — Domain math + AI

| Package | Purpose |
|---|---|
| `geometry-kernel` | Pure DTO → BufferGeometryDescriptor producers (no THREE allowed) — largest L2 package |
| `geometry-wall` / `geometry-door` / `geometry-window` / `geometry-slab` / `geometry-stair` / `geometry-column` / `geometry-beam` / `geometry-roof` / `geometry-curtain-wall` / `geometry-ceiling` / `geometry-furniture` / `geometry-lighting` / `geometry-plumbing` | One package per element type (13 packages) — fragment builders, validators, tools, system-type stores |
| `ai-host` | AI host lazy-loaded sandbox with CV + generative workflows pipeline — apartment-layout (D-TGL), furnish-layout (D-FLE), ceiling (D-CE), lighting (D-LE), validators, **activity archetypes (F4.1, F4.2)** |
| `constraint-solver` | 2D geometric constraint solver wrapping planegcs WASM |
| `room-topology` | Room topology spatial index (O(log n) AABB queries) + adjacency graph |
| `expr-eval` | Light parametric expression evaluator (length=a+b) without solver |
| `family-instance` | Family-instance bake pipeline: profiles → polygons → geometry descriptors |
| `family-loader` | Main-editor family loader with ZIP validation and caching |
| `family-runtime` | Family-runtime DSL + resolver + unit coercion (pure Node) |
| `types-builtin` | Built-in type catalogues (door/window/roof/curtain-wall) — drop Wave 12 |

#### L3 — State, runtime, composition

| Package | Purpose |
|---|---|
| `runtime-composer` | **The composition root** — `composeRuntime()` returns typed `PryzmRuntime` (14 slots) |
| `stores` | Zustand stores + InspectSelectionStore (INS-α-2) + IsolationStateStore (INS-α-6) + DataStore (DAT-α-2) + DrawingSetStore (DSM-α-2) + ApartmentParametersStore + RoomParametersStore + FamilyRegistryStore |
| `command-registry` | All BIM commands (walls, slabs, doors, rooms, hierarchy) |
| `core-app-model` | Drawing pipeline worker-protocol types, pen/hatch/poche style tables |
| `data-engine` | **NEW (DAT-α-3)** — PredicateRegistry + RuleEvaluator for quality-rules subsystem |
| `file-format` | `.pryzm` v1 portable ZIP format pack/unpack/migration |
| `input-host` | Input-host slot + tool-layer extraction (keyboard/pointer/wheel) |
| `physics-host` | Physics-host slot + broad-phase spatial queries (raycast/AABB) |
| `view-state` | ViewDefinition / ViewRegistry / ViewController |
| `sync-client` | Client-side sync: Yjs document + EventBridge |
| `pdf-export` | **NEW (PDF-α-1)** — `sheetToPdfBytes()` via pdf-lib |
| `pdf-to-bim` | PDF-to-BIM extraction + confidence model + review-queue feeder |
| `headless` | Full `PryzmRuntime` in Node.js without browser (no canvas/WebGL) |
| `ui` | UI host primitives (PanelHost / InspectorHost) for PropertyPanel |
| `ui-base` | Panel base class: lifecycle, runtime field, OTel spans |
| `speculative-engine` | Speculative state engine: read-only consequence preview |

#### L4 — Renderer + scene

| Package | Purpose |
|---|---|
| `renderer` | WebGPU / WebGL2 dual-mode single-pass renderer |
| `render-runtime` | Selection-highlight + edge-outline (deprecated — drop Wave 12) |
| `render-pipeline` | TSL WebGPU render pipeline passes (ScenePass, ZonePass, SSGIPass) |
| `scene-committer` | PrimitiveCommitter interface + SceneRegistry + MaterialPool |

#### L5 — Apps surface contracts

| Package | Purpose |
|---|---|
| `editor-ui` | Editor-UI public API contracts (InspectMode, Preview, DataWorkbench) |
| `engine` | Engine public API type-only contracts |
| `views` | View-layer public API contracts (PlanViewManager, SectionViewService) |

#### L6 — Plugin SDK

| Package | Purpose |
|---|---|
| `plugin-sdk` | **`@pryzm/sdk` v1.0.0** — descriptor schema, host proxies, sandbox, signing, `pryzm dev` CLI |

#### Backend / DevTools / Infra-side

| Package | Purpose |
|---|---|
| `admin-overrides` | Enterprise admin plan/role/feature override CRUD backend |
| `ai-spend` | Workspace admin AI spend aggregator + analytics views |
| `api-rbac` | OAuth2 scope catalogue + middleware for Public API |
| `api-spec` | OpenAPI 3.1 canonical hand-authored schema |
| `beta-signup` | Beta cohort sign-up surface + email confirmation dispatcher |
| `email-transport` | Transactional email transport (SMTP/Resend/Postmark) |
| `oauth2-pkce` | PKCE code-verifier/challenge + token-exchange helper |
| `rate-limit` | Token-bucket rate limiter (60 r/m read, 20 r/m write) |
| `webhooks` | Webhooks subscription store + HMAC-SHA256 signing + delivery scheduler |
| `bench-visual-diff` | Visual diff harness for perf gates |
| `eslint-plugin-pryzm` | Custom ESLint rules enforcing architecture (P2-P6) |
| `perf-budgets` | Canonical NFT-target list + baseline keys for regression gates |
| `release` | GA gate orchestrator running 23 verification scripts |
| `wcag-audit` | WCAG 2.2 AA audit runner using axe-core wrapper |
| `legacy-shim` | Fixture-only package for lint rule testing — DROP Wave 12 |

### §5.2 — `plugins/` (47, all L9)

#### Architecture / element-type plugins (16)

| Plugin | What user gets |
|---|---|
| `wall` | Create walls with layer-based system types and finishes |
| `door` | Doors with swings and widths; openings auto-sync to walls (C15 hosted) |
| `window` | Windows with sizes; openings auto-sync (C15 hosted) |
| `slab` | Floor/roof slabs with holes + material assignment + wall cascade |
| `column` | Columns with rect/circular/I sections |
| `beam` | Beams with rect/I/T profile options |
| `stair` | Stairs with run shapes + geometric parameters + handrail cascade |
| `handrail` | Handrails along stairs or custom paths |
| `curtain-wall` | Curtain walls with parametric grids (mullion/transom/panel) |
| `roof` | Pitched + flat roofs with parametric control |
| `floor` | Floor finish element |
| `ceiling` | Ceiling surfaces with materials |
| `furniture` | Furniture with LOD switching + catalogues |
| `cross` | Cascade rules (slab-wall, stair-handrail, wall-room) — single-responsibility |
| `family-editor` | Parametric component family creator (stub for F-phase) |
| `structural` | Structural bracing + foundation details |

#### MEP (2)

| Plugin | What user gets |
|---|---|
| `lighting` | Point-light intensity + emergency settings |
| `plumbing` | Plumbing equipment with system type |

#### Drafting / output (7)

| Plugin | What user gets |
|---|---|
| `annotations` | Text annotations with rotation/height/colour |
| `dimensions` | Dimension annotations with precision/unit/text |
| `sheets` | Canvas2D sheet editor + sheet-list view-model (governed by C24) |
| `plan-view` | Orthographic plan views with interactive panning/zooming |
| `section-view` | Generate orthographic section / elevation views |
| `render` | Post-processing effects + lighting configurations (stub) |
| `export-pdf` | Export sheet sets + markups as PDF (stub — uses `@pryzm/pdf-export`) |

#### Interchange (5)

| Plugin | What user gets |
|---|---|
| `ifc-export` | **Tier 1 IFC4 + IFC4X3 export** with Pset round-trip — α-1 to α-7 shipped psets for Wall/Door/Window + Qto + IfcSite/Space/Zone + Revit variant |
| `ifc-import` | Tier 2 import + proxy creation for furniture/structural/MEP |
| `ifc-inspector` | DOM property-set editor for Tier 1 + Tier 2 elements |
| `dxf` | Import/export drawings in DXF format (stub for F-phase) |
| `rhino-import` | Rhino 3DM reader via rhino3dm WASM |

#### AI workflows (5 — all empty shells; impls in `@pryzm/ai-host`)

| Plugin | What user gets |
|---|---|
| `ai-floorplan` | Generate floor plans via lazy-loaded AI workflow |
| `ai-generative` | Generate design variations |
| `ai-query` | Query the model semantically with natural language |
| `ai-rules` | Check designs against rules + compliance constraints |
| `ai-voice` | Control the editor using voice commands |

#### Authoring + site (8)

| Plugin | What user gets |
|---|---|
| `rooms` | Half-edge flood-fill room solver + wall cascade — automatic area/occupancy |
| `selection` | Select + highlight elements |
| `snapping` (in `packages/`) | Snap engine |
| `navigate` | Save and jump to camera bookmarks (stub) |
| `levels` | Navigate between building storeys (stub) |
| `grid` | Working grids on site plans |
| `geospatial` | Geographic coordinate systems + map tiles (stub — full impl in `packages/geospatial`) |
| `view` | Named views with camera state |
| `visibility-intent` | Visual rail gesture routing (hide/reveal/isolate) — stub |

#### Collaboration + automation (4)

| Plugin | What user gets |
|---|---|
| `multiplayer` | Canvas2D cursor + peer-list rendering |
| `bcf` | BCF 3.0 round-trip (topics, viewpoints, components) |
| `schedules` | Data tables with formulas + filters + CSV/XLSX/PDF export (governed by C28) |
| `toy-cube` | Smoke-test command (development only — drop post Phase 2D) |

### §5.3 — `apps/` (13)

| App | Purpose |
|---|---|
| `editor` | **The main BIM editor** — bootstrap, plugin registry, toolbar, panels, router; largest app |
| `ai-worker` | Background AI job processing (S47) — BullMQ queue + handler registry |
| `api-gateway` | Public API gateway (S65) — REST + WS surface on port 5101 |
| `bake-worker` | Server-side geometry bake worker — 250ms coalescing, worker_threads pool |
| `bench` | Micro-benchmark harness — baseline regression gate (17 NFT benches) |
| `cli` | `pryzm-cli` — pack/unpack `.pryzm` v1 files |
| `component-editor` | **Family Creator SPA** — 2D sketcher → solver → 3D extrude/sweep/loft → `.pryzm-family` |
| `docs-site` | Developer docs (Astro Starlight) — API reference, plugin guide |
| `export-worker` | Async export job queue (Phase 2C) — PDF/IFC/DXF (empty scaffold) |
| `marketplace` | Plugin catalog browser SPA |
| `marketplace-api` | Plugin marketplace API skeleton (S64) — browse, version, sign-verify, revoke |
| `marketplace-web` | Family marketplace browse/detail SPA (S59) — for `.pryzm-family` artefacts |
| `sync-server` | Server-side sync — linearizes commands per project, broadcasts via WS |

#### `apps/editor/src/` subdirectories

| Subdir | Purpose |
|---|---|
| `bootstrap.ts` + `bootstrap.render.ts` | Data half + render half boot |
| `engine/` | Core editor runtime: EngineContext, CommandRegistry, UnderlayPersistence, ViewController, WallPerfBench, inspect/, persistence/, views/ (plan/section), preview/, runtimeEventBridge |
| `ui/` | 90+ panel/toolbar/dialog components — property inspectors, layer panels, schedules, CDE tools, **6 dev modals** (Family Pipeline · Layout Validator · Master Tree · Sheet Generator · Generate PDF · Apartment Data Panel) |
| `ui/inspect/` | **C27 BIM 3.0 Inspect substrate** — ModelTree (L0-L6), ElementMeshRegistryAdapter, buildModelElementLocations |
| `ui/apartment-layout/` | Apartment layout modal — layoutCardModel, layoutModalHtml, ApartmentLayoutController, ApartmentLayoutExecutor (with Façade + Hierarchy narrative surfacing from EE) |
| `ui/dev/` | Dev modals — familyPlatformTestModal, validateLayoutTestModal, modelTreeTestModal, sheetGeneratorTestModal, pdfExportTestModal, apartmentDataTestModal |
| `ui/ai/AIPanel.ts` | AI Design Assistant panel — top-level UI surface with 6 "Test (dev)" leaves |
| `ui/styles/` + `ui/styles/panels/` | AppTheme.injectAppTheme() + per-panel CSS string constants |
| `projects/` | Project hub, new-project dialog, project card |
| `toolbar/` | Tool registry + toolbar binding |
| `rendering/` | Renderer prewarm before engine launch |
| `router.ts` | SPA routing (landing, hub, editor, family marketplace) |
| `featureFlags/` | Feature gate system |

### §5.4 — `server.js` + `server/` (Express BFF)

#### `server.js` sections (~240 KB single file)

1. **Telemetry + Auth** — OpenTel SDK first; JWT/bcrypt via `authMiddleware`; user/display-name cache.
2. **AI Proxy + AI Spend** — Anthropic routing (direct or CF Worker); per-call cost; response cache.
3. **Data APIs** — REST project CRUD, versions, visibility-intents, members, command log, V1 read-only public API.
4. **Socket.io + Collaboration** — Real-time command broadcast, cross-tenant guards, room access.
5. **Payments + Plugins + Renders** — Stripe webhooks, marketplace browse/publish/sign, render galleries (T1 + T3 panorama), DWG/IFC import endpoints.

#### `server/` modules

| Module | What it does |
|---|---|
| `aiResponseCache.js` | Postgres-backed LRU cache for Anthropic responses |
| `aiUsageStore.js` | Per-call AI spend tracking |
| `authStore.js` | signUp / signIn / verifyToken (bcrypt + JWT) |
| `corsPolicy.js` | Express + Socket.io CORS allowlist |
| `dbMigrate.js` | PostgreSQL schema migrations |
| `errors.js` | Custom error classes |
| `exportGuard.js` | Temporary auth tokens for PDF export jobs |
| `familyMarketplaceRoutes.js` | `.pryzm-family` publish/catalog/download |
| `ifcStorageService.js` | IFC upload staging + import workflow |
| `oauthService.js` | Google + Microsoft OAuth flows |
| `pgClient.js` | Postgres pool + backend info (Replit / Supabase) |
| `permissions.js` | Role-based access (ISO 19650 CDE phase 1) |
| `planStore.js` | Plan + AI quota enforcement |
| `pluginSigningService.js` | Ed25519 signature verification + CRL |
| `projectAccess.js` | Cross-tenant guard for socket.io join-project |
| `projectMembers.js` | Project team management (Supabase + in-memory fallback) |
| `projectStore.js` | Project + snapshots + versions; content-addressed |
| `rateLimiter.js` | Per-IP counters (AI: 10/min; API: 60/min) |
| `renderService.js` | Photorealistic + panorama galleries |
| `securityHeaders.js` | Helmet (CSP/HSTS/X-Frame-Options) |
| `stripeRoutes.js` + `stripeService.js` | Billing portal + webhook verification |
| `supabaseClient.js` + `supabaseMigrate.js` | Prod Supabase + RLS policies |
| `telemetry.js` | OpenTelemetry init (imported first) |
| `versionStateMachine.js` | ISO 19650 CDE phase 2 version states |
| `webhookService.js` | External webhook delivery |
| `api/v1/routes.js` | REST read-only public API |

### §5.5 — Other top-level directories

| Path | Purpose |
|---|---|
| `src/` | **L7.5 transitional** — 2 folders (`engine/`, `ui/`); shrinks toward `src/ui/` only (boolean #1). Today: ~0 (already migrated to `apps/editor/src/`) |
| `client/` | Browser entry shells |
| `public/` | Static assets (PWA manifest, service worker, branding) |
| `tools/` | Fixture generators |
| `scripts/` | 30+ migration / CI / codegen helpers |
| `tests/` | Top-level Vitest + Playwright suites (cross-package + integration) |
| `tools/ga-gate/` | 15+ GA gates (run via `release` package's `run-all.ts`) |
| `pryzm-selfhost/` | One-day-deploy Helm + Terraform (D7) |
| `revit-addin/` | External Python adapter scaffold for D12 Revit round-trip |
| `docs/02-decisions/contracts/` | C00-INDEX + 26 binding C-contracts (C01-C18 + C24-C30) |
| `docs/archive/pryzm3-internal/` | Vision + Architecture + Master Plans + Status logs + 90+ archived references |
| `apps/marketplace-web/` `docs-site/` `marketplace/` | Public-facing surfaces |

---

## §6 — Contract suite (C01–C30)

| # | Status | Owns |
|---|---|---|
| C00 | CANONICAL | Index, conflict resolution order |
| C01 | CANONICAL | Architecture & governance — 8 layers, P1-P8, convergence booleans |
| C02 | CANONICAL | Composition Root & Boot — `composeRuntime()`, 3-stage boot |
| C03 | CANONICAL | Schemas, Commands & State — L0 schemas, command bus, stores, undo |
| C04 | CANONICAL | Rendering & Scheduling — single THREE + single rAF + scene-committer |
| C05 | CANONICAL | Persistence & File Format — `.pryzm`, IndexedDB cache, localStorage history |
| C06 | CANONICAL | UI Shell & Tools — PlatformRouter, panels, tools, camera |
| C07 | CANONICAL | Plugin SDK & Marketplace — L6 facade, L7 plugins, sandbox, Ed25519 |
| C08 | CANONICAL | Collaboration & Security — CRDT, JWT, ISO 19650, rate limiting |
| C09 | CANONICAL | AI & Visibility Intent — ai-host (L2), AiPlane, plan critique, cost |
| C10 | CANONICAL | Performance & Observability — 17 NFTs + OTel spans |
| C11 | CANONICAL | Element Creation Pipeline — user/AI/remote → commandBus uniform path |
| C12 | CANONICAL | Geospatial & Coordinate Systems — LTP-ENU, proj4js, IfcProjectedCRS |
| C13 | CANONICAL | Project Lifecycle & Isolation — open/active/close/switch + 7 invariants |
| C14 | CANONICAL | Legacy Elimination — LP-01..LP-10 patterns prohibited |
| C15 | CANONICAL | Hosted Element Contract — doors/windows in walls + opening voids |
| C16 | CANONICAL | Command Authoring Protocol — CA-1..CA-16 + L/S doctrines |
| C17 | CANONICAL | Batch Creation Catalogue & Panel Binding — CREATE panel registry |
| C18 | CANONICAL | Element Preview Visual Contract — unified #6600FF |
| C24 | DRAFT | **Sheet Composition Engine** — α-1..α-5 substrate shipped; backend gaps remain |
| C25 | DRAFT | **IFC Export Production** — α-1..α-7 shipped (Site/Space/Zone + Wall/Door/Window Psets + Qto) |
| C26 | DRAFT | **Revit Round-Trip** — α-1 schemas + α-2 IFC4X3-RV exporter shipped |
| C27 | DRAFT | **BIM 3.0 Inspect Model** — α-2..α-10 shipped (full model tree + isolation animator end-to-end) |
| C28 | DRAFT | **Data Panel & Automation** — α-1..α-3 shipped (schemas + DataStore + data-engine) |
| C29 | DRAFT | **PDF Vector Export** — α-1..α-2 shipped (pdf-export package + Generate PDF leaf) |
| C30 | DRAFT | **Drawing Set Management** — α-1..α-2 shipped (schemas + DrawingSetStore) |

The 7 DRAFT contracts are scheduled to move to **REVIEW-READY** once the 2026-06-01 autonomous-session work is reflected back in the contract scopes (estimated 18-week gap-fill reduction).

---

## §7 — PRYZM TODAY: complete capability table

Every capability the platform exposes today. Status column: ✅ live · 🟨 partial · ⬜ planned (but referenced in code). Layer column tells you where to look.

### §7.1 — Authoring (Tier 1 + Tier 2 BIM creation)

| Capability | Status | Where it lives |
|---|---|---|
| Wall creation (layer-based system types) | ✅ | `plugins/wall` + `packages/geometry-wall` |
| Door creation (frame + leaf + swing) | ✅ | `plugins/door` + `packages/geometry-door` |
| Window creation (frame + mullion + glass) | ✅ | `plugins/window` + `packages/geometry-window` |
| Hosted elements (doors/windows host in walls; openings auto-sync; opening void) | ✅ | C15 + `plugins/door` + `plugins/window` |
| Slab creation (floor/roof; holes; per-side materials) | ✅ | `plugins/slab` + `packages/geometry-slab` |
| Column creation (rect / circular / I) | ✅ | `plugins/column` + `packages/geometry-column` |
| Beam creation (rect / I / T) | ✅ | `plugins/beam` + `packages/geometry-beam` |
| Stair creation (straight / L / U; treads + risers) | ✅ | `plugins/stair` + `packages/geometry-stair` |
| Handrail creation (round / square / flat) | ✅ | `plugins/handrail` |
| Curtain wall (mullion / transom / panel grids) | ✅ | `plugins/curtain-wall` + `packages/geometry-curtain-wall` |
| Roof creation (pitched + flat) | ✅ | `plugins/roof` + `packages/geometry-roof` |
| Floor finish | ✅ | `plugins/floor` |
| Ceiling surfaces | ✅ | `plugins/ceiling` |
| Furniture placement (LOD + carousel catalogue) | ✅ | `plugins/furniture` + `packages/geometry-furniture` |
| Lighting fixtures (point lights + emergency) | ✅ | `plugins/lighting` + `packages/geometry-lighting` |
| Plumbing fixtures | ✅ | `plugins/plumbing` + `packages/geometry-plumbing` |
| Structural bracing + foundations | ✅ | `plugins/structural` |
| Cross-plugin cascade (slab→wall, stair→handrail, wall→room) | ✅ | `plugins/cross` |
| Dimensions (with precision + unit + text) | ✅ | `plugins/dimensions` |
| Text annotations (rotation/height/colour) | ✅ | `plugins/annotations` |
| Grid system (linear + arc) | ✅ | `plugins/grid` |
| Level / storey navigation | 🟨 | `plugins/levels` (stub; full impl in apps/editor) |
| Room creation (half-edge flood-fill solver) | ✅ | `plugins/rooms` |

### §7.2 — Views

| Capability | Status | Where |
|---|---|---|
| 3D viewport (WebGPU/WebGL2 dual-mode) | ✅ | `packages/renderer` + `packages/renderer-three` |
| Plan view (orthographic) | ✅ | `plugins/plan-view` + `packages/view-state` |
| Section view | ✅ | `plugins/section-view` |
| Elevation view | ✅ | `plugins/section-view` (variant) |
| Named camera views | ✅ | `plugins/view` |
| Camera bookmarks / navigation | ⬜ | `plugins/navigate` (stub) |
| Render post-FX presets | ⬜ | `plugins/render` (stub) |
| **Master Tree (Project→Building→Level→Apartment→Room→Type→Instance)** | ✅ | `apps/editor/src/ui/inspect/ModelTree.ts` (INS-α-4..10) |
| **Selection-driven viewport isolation (animated fade 200ms)** | ✅ | `packages/renderer-three/IsolationAnimator` + `packages/visibility/intents` + `packages/stores/IsolationStateStore` |

### §7.3 — Interchange

| Capability | Status | Where |
|---|---|---|
| **IFC4 Tier 1 export** (Wall/Slab/Door/Window/Column/Beam) | ✅ | `plugins/ifc-export` (S56) |
| **IFC4X3 export** (full IFC4X3Exporter pipeline) | ✅ | `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` |
| IFC Pset round-trip (`Pset_*` read + write) | ✅ | `plugins/ifc-inspector` |
| **IfcSite with refLat/refLon/refElevation + SiteAddress** | ✅ | IFC-α-1 (commit `48c1f4f`) |
| **IfcSpace from rooms with Pset_SpaceCommon** | ✅ | IFC-α-2 (`81e87de`) |
| **IfcZone aggregating apartments** | ✅ | IFC-α-3 (`6aec229`) |
| **Pset_WallCommon on every IfcWall** | ✅ | IFC-α-4 (`35a2deb`) |
| **Qto_WallBaseQuantities on every IfcWall** | ✅ | IFC-α-5 (`6b31f2e`) |
| **Pset_DoorCommon on every IfcDoor** | ✅ | IFC-α-6 (`58307e8`) |
| **Pset_WindowCommon on every IfcWindow** | ✅ | IFC-α-7 (`b0d796b`) |
| **IFC4X3-RV variant exporter shim** (Pset_RevitType/Instance + IfcGroup Worksets + coord mode) | ✅ | REV-α-2 (`3a82d8f`) |
| IFC import Tier 2 (with proxy creation) | ✅ | `plugins/ifc-import` |
| DXF import/export | ⬜ | `plugins/dxf` (stub) |
| Rhino 3DM import | ✅ | `plugins/rhino-import` |
| BCF 3.0 round-trip (Solibri/Navisworks/BIMcollab) | ✅ | `plugins/bcf` |
| PDF export | 🟨 | `packages/pdf-export` (PDF-α-1 substrate shipped); `plugins/export-pdf` stub for sheet/BCF |
| PDF-to-BIM (image OCR + confidence) | 🟨 | `packages/pdf-to-bim` |

### §7.4 — AI

| Capability | Status | Where |
|---|---|---|
| AI command engine (NL → design action) | ✅ | `packages/ai-host` |
| AI host with lazy load (L7.5 promotion per ADR-014) | ✅ | `packages/ai-host` + `apps/ai-worker` |
| **Apartment generation single-unit (D-TGL)** — pure deterministic engine | ✅ | `packages/ai-host/src/workflows/apartmentLayout/` |
| **Multi-apartment floor plate generation** | 🟨 | Specced in `apartment-cognition-stack` (Phase 11); engine work pending |
| **Furniture placement engine (D-FLE)** — door-vector-aware | ✅ | `packages/ai-host/src/workflows/furnishLayout/` |
| **Ceiling engine (D-CE)** — auto-fires on apartment generation | ✅ | `packages/ai-host/src/workflows/ceiling/` |
| **Lighting engine (D-LE)** | ✅ | `packages/ai-host/src/workflows/lighting/` |
| **Activity-archetype substrate** (S1 Media Wall + S2 Entry Storage) | 🟨 | `packages/ai-host/src/workflows/furnishLayout/activityArchetypes.ts` (F4.1+F4.2; F4.3-F4.7 pending) |
| **Cognition stack L1-L3 scoring axes** (Façade, Hierarchy, EdgeType) | ✅ | `packages/ai-host/src/workflows/apartmentLayout/tgl/` + `environment/` |
| **Cognition stack L4 compositional + L4-δ-1b constructive subdivider** | 🟨 | scoring axes ✅; constructive subdivider 1/3 |
| Cognition stack L5 perceptual sim (sightline / spaciousness / daylight reveal) | ⬜ | Planned (4 deliverables) |
| Cognition stack L6 behavioural sim (OccupancyAgent + 6 activities + FrictionScore) | ⬜ | Planned (3 deliverables) |
| Cognition stack L7 typology priors (selector + RoomRule overrides + AI critique) | ⬜ | Planned (4 deliverables) |
| **Pre-furnishing validators** (D1-D5 dimensional + T1-T5 topology) | 🟨 | 8 of 10 shipped; D4/T4 modal + D5/T5 docs partial |
| Plan critique | ✅ | `packages/ai-host` |
| 3-options generation | ✅ | `packages/ai-host` (S51) |
| Voice command interface | 🟨 | `plugins/ai-voice` (registered; impl in ai-host) |
| AI cost governance (per-project per-day budget) | ✅ | `packages/ai-cost` + `server/aiUsageStore.js` |
| AI response cache | ✅ | `server/aiResponseCache.js` |
| **6 dev modals testing AI flows from UI** | ✅ | `apps/editor/src/ui/dev/` (Family · Layout Validator · Master Tree · Sheet Generator · Generate PDF · Apartment Data Panel) |

### §7.5 — Data + automation

| Capability | Status | Where |
|---|---|---|
| Schedules with formula DSL + filters | ✅ | `plugins/schedules` (S41) |
| CSV / XLSX / PDF export from schedules | ✅ | `plugins/schedules` |
| **L0 data substrate (DataFilter + Sort + GroupBy + QualityRule + Violation + BulkUpdate + ScheduledCheck)** | ✅ | `packages/schemas/src/data/` (DAT-α-1) |
| **DataStore L3 state container** | ✅ | `packages/stores/src/DataStore.ts` (DAT-α-2) |
| **@pryzm/data-engine package** (PredicateRegistry + RuleEvaluator + 8 seed builtins) | ✅ | `packages/data-engine/` (DAT-α-3) |
| **Apartment Data Panel** (read-only dev modal) | ✅ | `apps/editor/src/ui/dev/apartmentDataTestModal.ts` (D-α-4) |
| Quality rules executor on edit / save / demand (Tier 1/2/3) | ⬜ | Specced in C28; runner not yet wired |
| Bulk-edit command + handler | ⬜ | Specced in C28 |
| Cron scheduled checks + email-on-violation | ⬜ | Specced in C28 |
| Excel / SQL / JSON / IFC-Pset export from data grid | ⬜ | Specced in C28 (Excel + CSV live via schedules) |

### §7.6 — Sheets + Drawing Set + PDF

| Capability | Status | Where |
|---|---|---|
| Sheet primitives (Paper / TitleBlock / Viewport / Sheet types + validators) | ✅ | `packages/drawing-primitives/src/sheet/` (SHT-α-1) |
| Sheet → SVG renderer (paper + grid + title block + viewport rectangles) | ✅ | `SheetToSvg.ts` (SHT-α-2) |
| Viewport content renderer (polygons / lines / texts) | ✅ | `ViewportContent.ts` + `ViewportToSvg.ts` (SHT-α-3) |
| `sheetToSvgWithContent` composer | ✅ | `SheetWithContentToSvg.ts` (SHT-α-4) |
| `buildSheetFromRooms` helper + Test Sheet Generator UI | ✅ | `buildSheetFromRooms.ts` + dev modal (SHT-α-5) |
| Sheet UI (in `plugins/sheets`) — Canvas2D editor + sheet-list view-model | ✅ | `plugins/sheets` (S37) |
| Book / Sheet-set exporter (multi-sheet composition) | ✅ | `plugins/sheets/src/book/book-exporter.ts` (S37) |
| **@pryzm/pdf-export** package — `sheetToPdfBytes()` via pdf-lib | ✅ | `packages/pdf-export/` (PDF-α-1) |
| **Generate PDF dev modal** (AI Panel → Test (dev) → Generate PDF) | ✅ | `apps/editor/src/ui/dev/pdfExportTestModal.ts` (PDF-α-2) |
| **DrawingSet L0 schemas** (Revision + SheetReference + DrawingSet + SheetIssue) | ✅ | `packages/schemas/src/drawing-set/` (DSM-α-1) |
| **DrawingSetStore L3 with revision + status management** | ✅ | `packages/stores/src/DrawingSetStore.ts` (DSM-α-2) |
| DXF backend | ⬜ | `plugins/dxf` (stub) |
| Section + elevation viewports inside sheets | ⬜ | Specced in C24 |
| Dimension + annotation INTEGRATION into sheets | ⬜ | Specced in C24 |
| PDF/A-3 compliance + IFC-embed (single-deliverable PDF + IFC) | ⬜ | Specced in C29 |
| Print-calibration test harness | ⬜ | Specced in C29 |
| Revision tracking state machine (draft→issued→superseded) | 🟨 | DrawingSetStore.markStatus shipped; cloud annotations pending |
| Transmittal package generation (cover + register + sheets in one PDF/A-3) | ⬜ | Specced in C30 |
| Automatic sheet numbering | ⬜ | Specced in C30 |

### §7.7 — Inspect (BIM 3.0)

| Capability | Status | Where |
|---|---|---|
| **InspectSelection / IsolationTier / IsolationOverride / SpatialRelationship L0 schemas** | ✅ | `packages/schemas/src/inspect/` (INS-α-2) |
| **InspectSelectionStore L3** | ✅ | `packages/stores/src/InspectSelectionStore.ts` (INS-α-2) |
| **IsolationVisibilityIntent L1 (pure tier resolver)** | ✅ | `packages/visibility/src/intents/IsolationIntent.ts` (INS-α-3) |
| **Master Tree component** (Project→Building→Level→Apartment→Room→Type→Instance) | ✅ | `apps/editor/src/ui/inspect/ModelTree.ts` (INS-α-4 + α-5 + α-9 + α-10) |
| **Test Master Tree dev modal** (AI Panel → Test (dev) → Test Master Tree) | ✅ | `apps/editor/src/ui/dev/modelTreeTestModal.ts` (INS-α-5 + α-8) |
| **IsolationStateStore L3** | ✅ | `packages/stores/src/IsolationStateStore.ts` (INS-α-6) |
| **IsolationAnimator L4 (subscribes to FrameScheduler at render priority; P3 compliant)** | ✅ | `packages/renderer-three/src/IsolationAnimator.ts` (INS-α-7) |
| **End-to-end viewport isolation** (click tree node → animator dims viewport over 200ms) | ✅ | INS-α-8 wired all the above through modelTreeTestModal |
| **ElementMeshRegistryAdapter** (duck-typed scene walker) | ✅ | `apps/editor/src/ui/inspect/ElementMeshRegistryAdapter.ts` (INS-α-8) |
| **buildModelElementLocations** (pure runtime → ElementLocation[] walker) | ✅ | `apps/editor/src/ui/inspect/buildModelElementLocations.ts` (INS-α-8) |
| L5 Element Type group nodes ("Walls (5)", "Doors (3)") | ✅ | INS-α-9 |
| L6 Element Instance leaves (cap at 50 + overflow tail) | ✅ | INS-α-10 |
| Per-node graphical dashboards (project / building / level / apartment / room / type / instance) | ⬜ | Specced in C27 §6 (INS-α-11) |
| `IsolationAnimator` wired to live `composeRuntime()` (not just dev modal) | ⬜ | INS-α-12 / composeRuntime extension |
| Migration: deprecate flat `PropertyInspector.ts` (80 files) → `ElementInstanceDashboard` | ⬜ | C27 §9 phased plan |

### §7.8 — Collaboration + security

| Capability | Status | Where |
|---|---|---|
| Real-time multi-user editing (Socket.io) | ✅ | `apps/sync-server` + server.js |
| Yjs CRDT semantics with explicit conflicts (full P8) | 🟨 | Yjs scaffolded; LWW today; full CRDT in Phase 2D |
| JWT + bcrypt auth | ✅ | `server/authStore.js` |
| Google + Microsoft OAuth | ✅ | `server/oauthService.js` |
| Plugin signing (Ed25519) + revocation (CRL) | ✅ | `server/pluginSigningService.js` |
| ISO 19650 CDE phase 1 roles (owner/admin/editor/viewer) | ✅ | `server/permissions.js` |
| ISO 19650 CDE phase 2 version state machine (locked/draft/issued/archived) | ✅ | `server/versionStateMachine.js` |
| Rate limiting (10/min AI · 60/min API) | ✅ | `server/rateLimiter.js` |
| CORS + Helmet security headers | ✅ | `server/corsPolicy.js` + `securityHeaders.js` |
| Audit log | ✅ | `dbMigrate.js` schema + `permissions.js` |
| Transmittal panel + revision clouds + worksets | 🟨 | UI present; transmittal pkg generation pending |
| Cross-tenant guards (socket.io join + project access) | ✅ | `server/projectAccess.js` |
| Webhooks (external integrations) | ✅ | `packages/webhooks` + `server/webhookService.js` |

### §7.9 — Geospatial + site

| Capability | Status | Where |
|---|---|---|
| Cesium 3D globe viewer + tiles | ✅ | `plugins/geospatial` + `packages/geospatial` |
| LTP-ENU coordinate transforms (1 km recentre trigger) | ✅ | `packages/geospatial` (C12) |
| proj4js integration | ✅ | `packages/geospatial` |
| IfcProjectedCRS read/write | ✅ | `packages/geospatial` + `plugins/ifc-export` |
| Logarithmic depth buffer (large-scale infra) | ✅ | `packages/renderer-three` |
| NOAA RealSunService | ✅ | `packages/ai-host` |
| ProjectLocation schema | ✅ | `packages/schemas` |
| FacadeValueField + DaylightDepthField (pure-geometry) | ✅ | `packages/ai-host/src/workflows/apartmentLayout/environment/` |
| Site / Building / Apartment schemas (GS0 platform level) | ⬜ | Planned (PG0.1; ~19 wk for full PG0) |
| Climate ingestion (EPW + NOAA normals) | ⬜ | Planned (GS0.4) |
| Site authoring UI (Cesium-backed parcel drawing) | ⬜ | Planned (GS0.6) |
| Climate-aware lighting / window / facade in AI | ⬜ | Planned (GS0.7) |

### §7.10 — Family Platform

| Capability | Status | Where |
|---|---|---|
| Family pipeline 6-stage transformers (FamilyRequest→Definition→Parametric→Geometry→Schemas→Registered) | ✅ | `packages/schemas/src/family-*/` |
| FamilyRegistryStore L3 | ✅ | `packages/stores/src/familyRegistryStore.ts` |
| `registerFamilyFromJson` ingestion bridge | ✅ | `packages/stores/src/registerFamilyFromJson.ts` |
| **Test Family Pipeline dev modal** | ✅ | `apps/editor/src/ui/dev/familyPlatformTestModal.ts` |
| **Register-into-runtime button + Show registry contents** | ✅ | Family modal (commit `95a8b95`) |
| `apps/component-editor/` Family Creator SPA (2D sketcher → solver → 3D extrude/sweep/loft) | 🟨 | Substrate present; full Pascal-grade parity pending |
| `.pryzm-family` file format read/write | ✅ | `packages/family-loader` + SPEC-26 |
| Family marketplace browse/detail SPA | ✅ | `apps/marketplace-web` |
| Family marketplace API (publish/catalog/download with Ed25519) | ✅ | `server/familyMarketplaceRoutes.js` |
| FamilyRegistry strategic substrate (P0.3 — composition-root seeding from hardcoded types) | ⬜ | Strategic substrate; ~3 wk |
| Schema-Discovery + IFC-reader-Discovery + property-panel-schema-Discovery APIs (P0.8) | ⬜ | ~4 wk |
| Plugin-marketplace runtime side (`.pryzm-family` loader → Registry) | ⬜ | ~3 wk (P0.7) |

### §7.11 — Engineering substrate

| Capability | Status | Where |
|---|---|---|
| Command bus with Immer-patch producer + MessagePack + OTel spans | ✅ | `packages/command-bus` |
| Command registry (all BIM commands) | ✅ | `packages/command-registry` |
| Single composition root (`composeRuntime()` with 14 typed slots) | ✅ | `packages/runtime-composer` |
| Single rAF in FrameScheduler | ✅ | `packages/frame-scheduler` |
| Zustand stores with Immer + DirtyDiff fan-out | ✅ | `packages/stores` |
| Plugin SDK v1.0.0 (descriptor + lifecycle + Ed25519 + 6 host proxies + sandbox + CLI) | ✅ | `packages/plugin-sdk` |
| Headless runtime (Node-only, no canvas/WebGL) | ✅ | `packages/headless` |
| 17 NFT benchmarks | ✅ | `apps/bench/src/benches/*.bench.ts` |
| 15+ GA gates (run-all.ts orchestrator) | ✅ | `tools/ga-gate/` + `packages/release` |
| Custom ESLint plugin enforcing P2-P6 | ✅ | `packages/eslint-plugin-pryzm` |
| Bundle-splitting (vendor-three / cesium / web-ifc + dynamic imports) | ✅ | `vite.config.ts` |
| App-shell skeleton paints before any JS | ✅ | `index.html` (Wave 1.5) |
| Crash reporter with OTel trace linking | ✅ | `packages/crash-reporter` |
| Telemetry via OpenTelemetry SDK | ✅ | `server/telemetry.js` + per-package |

### §7.12 — Apartment generation pipeline (semantic design assistant)

| Capability | Status | Where |
|---|---|---|
| §11 Apartment Layout modal | ✅ | `apps/editor/src/ui/apartment-layout/` |
| End-to-end command pipeline (AI prompt → buildLayoutCommands → wall.batch.create + wall.createOpening + door.batch.create → room redetect) | ✅ | C09 §3.4 + `ApartmentLayoutExecutor.ts` |
| Pre-furnishing validators (D1.1-1.5 dim tables + T1.1-1.6 topology + D2.1-2.5 + T2.1-2.6) | 🟨 | 8/10 shipped |
| Modal validation badge + expandable details (markdown report) | ✅ | `layoutCardModel.ts` + apartment-modal styles (commit `e47a438` / `c3606b7`) |
| **Modal Façade axis (L1-α-4) + Hierarchy narrative (L2-β-5)** | ✅ | EE (`d894735`) |
| Iteration trail when D-TGL rejects envelope (auto-iterate bedroom count) | ✅ | `generate.ts` §BEDROOM-AUTO-ITERATE |
| Activity-archetype substrate (Media Wall S1 + Entry Storage S2) | 🟨 | F4.1 + F4.2; 5 more (S3-S7) pending |
| Constraint database (248+ rules) — ROOM_RULES | ✅ | `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` |
| Multi-apartment floor plate (core-first subdivider, 2 options, per-apartment subdriver) | ⬜ | Specced in `multi-apartment-floor-plate-brief`; ~20 wk |

---

## §8 — WHAT WE WANT TO ACHIEVE: master goals tracker

Source: `01-VISION.md §4` differentiators · `PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md` · `APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md` master table · the 9 convergence booleans.

### §8.1 — Convergence booleans (when PRYZM 3 exists)

| # | Boolean | State |
|---|---|---|
| 1 | `legacy_src_folders ≤ 1` | ✅ src/ contains 0 legacy engine/ui dirs |
| 2 | `window_any_in_src_ui == 0` | ✅ |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ✅ |
| 4 | `default_runtime == composeRuntime()` | ✅ all 14 slots typed |
| 5 | `EngineBootstrap_LOC == 0` | ✅ deleted Wave 7 |
| 6 | `all_workflows_green == workflows_total` | ✅ 15/15 GA gates green |
| 7 | `plugin_sdk_published == true` | ⚠ code-complete; npm publish pending (OI-011) |
| 8 | `headless_published == true` | ⚠ code-complete; npm publish pending (OI-012) |
| 9 | `marketplace_live == true` | ⚠ code-complete; DNS + TLS pending (OI-013) |

**Code state: 9/9 TRUE. 3 manual infra steps remain.**

### §8.2 — Goals by C-contract subsystem

| Contract | What still needs to ship |
|---|---|
| C24 Sheets | SHT-α-6: viewport content extracted from REAL walls + doors + windows · plugins/sheets UI integration · DXF backend |
| C25 IFC | α-8+: IfcOpening completeness · Pset_StairCommon / Pset_RoofCommon / Pset_SpaceTypeCommon · COBie · classification · IfcAnnotation |
| C26 Revit | α-3: real coordinate-mode local-placement aliasing on IfcSite · workset member resolution · per-IfcType Pset_RevitType emission · external Python adapter prototype |
| C27 Inspect | α-11: per-node dashboards (Project / Building / Level / Apartment / Room / Type / Instance — 7 components) · α-12: wire animator to live composeRuntime · phased PropertyInspector → ElementInstanceDashboard migration (4 phases) |
| C28 Data | α-4: Data tab full UI (FilterChipBar + DataGrid virtualised + GroupByControl + BulkEditModal + QualityReportPanel) · α-5: quality rules engine executor (Tier 1 fast / Tier 2 medium / Tier 3 full) · α-6: bulk-edit command handler + Excel/JSON/SQL/IFC-Pset export · α-7: scheduled checks + email-on-violation |
| C29 PDF | Print-calibration test harness · PDF/A-3 compliance suite · IFC-embed (single-deliverable PDF + IFC) · Sheet export pipeline integration |
| C30 Drawing Set | Revision state machine UI · revision-cloud type in `plugins/annotations` · transmittal package generator · automatic sheet numbering · sheet UI integration |

### §8.3 — Apartment plan goals (the spatial-intelligence wedge)

From `APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §0.0` master table, advanced by Run 19-29:

| Tier | Phase | Deliverables done / total | Status |
|---|---|---|---|
| Z.1 Tier 0 | foundation D-TGL/D-FLE/D-CE/D-LE etc. | many | ✅ |
| Z.2 Tier 1 | T1.W window-emission · T1.C corridor connectivity · T1.D per-room door+window finish | 3/3 | ✅ |
| Z.3 Tier 2 | Pre-furnishing validators (D1-D5 dim + T1-T5 topology) | 8/10 | 🟨 |
| Z.4 Tier 3 | Cognition L1 Environmental Intel | 3/4 | 🟨 |
| Z.5 Tier 4 | Cognition L2 Spatial Hierarchy | 5/5 scoring · modal narrative ✅ via EE | ✅ |
| Z.6 Tier 5 | Cognition L3 Semantic Topology (EdgeType) | 4/4 | ✅ |
| Z.7 Tier 6 | Furniture Catalogue Extension (F1.1-F1.15) | 15/15 | ✅ |
| Z.8 Tier 7 | Cognition L4 Compositional Geometry | 4/4 scoring + 1/3 constructive | 🟨 |
| Z.9 Tier 8 | Archetype wiring (F3.1-F3.10) | 7/10 | 🟨 |
| Z.10 Tier 9 | **Activity Systems S1-S7** (F4.1-F4.7) | **2/7** (S1+S2 via KK+LL) | 🟨 |
| Z.11 Tier 10 | Lighting Programme (task / accent / pendant / scenes) | 0/4 | ⬜ |
| Z.12 Tier 11 | Cognition L5 Perceptual Sim | 0/4 | ⬜ |
| Z.13 Tier 12 | Cognition L6 Behavioural Sim | 0/3 | ⬜ |
| Z.14 Tier 13 | Built-in Joinery (wardrobe / shelving / window seat / headboard) | 0/4 | ⬜ |
| Z.15 Tier 14 | Soft Furnishings (rug / throws / plants) | 0/3 | ⬜ |
| Z.16 Tier 15 | Cognition L7 Typology Priors | 0/4 | ⬜ |
| Z.17 Tier 16 | **Multi-apartment floor plate** (core-first + 2 options + N apartments) | 0/18 | ⬜ ~20 wk |
| Z.18 Tier 17 | Cross-cut (Intent Field substrate + Pareto refactor) | 0/2 | ⬜ |
| Z.19 Tier 18 | Housekeeping (F8.1-F8.3) | 3/3 | ✅ |
| Z.−0a | BIM 2/3 D-α (Live Parametric L0) | **5/6** | 🟨 PP shipped D-α-4 |
| Z.−0b | BIM 2/3 D-β (6 Data Management Panels) | 0/6 | ⬜ |
| Z.−0c | BIM 2/3 D-γ (Propagation engine + multi-edit batching) | 0/3 | ⬜ |
| Z.−1 | **P0 Family Platform** (FamilyRegistry + Plugin marketplace runtime + Discovery APIs) | 0/9 (2 drafts) | 🟦 ~28 wk |
| Z.−2 | **GS0 Geospatial Foundation** (Site / Climate / Cesium ingest / climate-aware AI) | 0/9 | 🟦 ~19 wk |

### §8.4 — Strategic differentiators (D11/D12/D13) progress

| Diff | Substrate shipped | Remaining |
|---|---|---|
| D11 Sheet + PDF | C24 α-1..α-5 + C29 α-1..α-2 + C30 α-1..α-2 | Real-content viewport (walls/doors/windows from model) · PDF/A-3 + IFC-embed · transmittal generator |
| D12 Revit round-trip | C26 α-1 schemas + α-2 IFC4X3-RV shim | Real coordinate-mode transforms · workset member resolution · external Python adapter prototype |
| D13 BIM 3.0 Inspect | C27 α-2..α-10 (full tree + isolation animator end-to-end) + C28 α-1..α-4 | Per-node dashboards (7) · Data tab full UI · quality-rules executor · live composeRuntime wiring |

### §8.5 — Honest cost rollup

From master plan §5 + per-doc estimates:

- **Apartment plan remaining**: ~225 dev-days (F-tier full obligation ladder) + ~16 wk (cognition L4-L7) + ~20 wk (multi-apartment Tier 16). **~1.5 years single-contributor; ~9 months at two parallel.**
- **C-contracts remaining gap-fill**: ~10-12 wk (refresh of C24-C30 scopes after the autonomous-session work narrows them).
- **Strategic substrates**: GS0 ~19 wk + P0 ~28 wk + BIM 2/3 D-β+D-γ ~10 wk.
- **Manual infra**: 3 OIs (npm publish ×2 + DNS) to close convergence booleans 7/8/9.

---

## §9 — Anti-duplication doctrine

Critical for this session: I added Psets/Qto to the EXISTING `IFC4X3Exporter.ts` — I did NOT create a parallel pipeline. The same discipline applies to every future track:

1. **`plugins/ifc-export/` IS the IFC export.** Extend its `IFC4X3Exporter.ts`; don't write a parallel exporter.
2. **`plugins/sheets/` IS the sheets system** (S37). The new C24 substrate in `packages/drawing-primitives/src/sheet/` is COMPLEMENTARY — composes with `plugins/sheets/`, doesn't replace it.
3. **`plugins/schedules/` IS the data foundation** (S41). C28 wraps it; new `packages/data-engine/` adds quality rules ON TOP, not parallel.
4. **`packages/ai-host/` IS the AI engine.** Workflows go INSIDE `src/workflows/`; don't fork.
5. **`packages/ifc-inspector/`** + new `apps/editor/src/ui/inspect/` Master Tree — the C27 plan migrates `PropertyInspector.ts` (80 files) INTO the new dashboards. Migration, not replacement.
6. **`composeRuntime()` is the only composition root.** New slots get added to it; no parallel runtime.

Two prior near-misses in this session were caught:
- F4.1 attempted to admit `desk`+`desk_chair` to `FurnitureKind` without closing the 24-row obligation ladder (reverted; documented in `APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4.1`).
- Track AA + KK self-used `git stash` (flagged but didn't lose work). Hard rule restated.

---

## §10 — Where to look first (for newcomers)

Read these in this exact order:

1. `docs/01-strategy/product-vision.md` — north star, business intent
2. `docs/01-strategy/engineering-vision.md` — P1-P8 + D1-D13 + 17 NFTs + 5 customer archetypes
3. `docs/01-strategy/architecture.md` — 9-layer model, lint matrix, composition root, convergence booleans
4. `docs/02-decisions/contracts/README.md` — contract suite map + conflict resolution order
5. Specific C-contract relevant to the work
6. **This file** (`MASTER-ARCHITECTURE-AND-CAPABILITIES-2026-06-01.md`) — folder map + capabilities + goals
7. `docs/03-execution/status/autonomous-session-runs-log.md` — recent multi-agent work record
8. `docs/03-execution/plans/master-implementation-plan.md` — synthesis of all C-contracts + apartment plans into one delivery sequence
9. `docs/03-execution/status/prior-art-audit-2026-05-31.md` — what code already exists vs new work

---

## §11 — Closing notes

- **94 workspace packages** (78 packages + 47 plugins + 13 apps). Strict L0-L9 layer separation enforced by `eslint-plugin-boundaries`.
- **30 contracts** (C01-C18 RATIFIED + C24-C30 DRAFT). 7 new contracts ratified DRAFT 2026-05-31; should move to REVIEW-READY after the autonomous-session work is reflected.
- **15+ GA gates** (`tools/ga-gate/`); run via `release` package's `run-all.ts`.
- **17 NFT benches** (`apps/bench/src/benches/*.bench.ts`); all live + measured per sprint close.
- **6 user-testable dev modals** under AI Panel → Test (dev): Family Pipeline · Layout Validator · Master Tree (with viewport isolation) · Sheet Generator · Generate PDF · Apartment Data Panel.
- The session's biggest single output: **end-to-end viewport isolation** (C27 INS-α-2 through α-10, ~10 commits, multi-package — visibility/IsolationIntent + stores/IsolationStateStore + renderer-three/IsolationAnimator + apps/editor/ui/inspect substrate). Demonstrable from the Test Master Tree modal.

---

*This file is a SYNTHESIS for navigation. It is NOT a contract. When a capability description disagrees with the underlying contract or code, the contract or code wins. Re-derive this doc whenever you touch a contract or ship a substrate.*
