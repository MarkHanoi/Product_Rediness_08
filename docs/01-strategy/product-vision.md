# PRYZM — Product Vision

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Rewrite basis**: full code audit, 2026-06-01.
> **Authority**: this doc owns **the product north star + the user journey + the phased roadmap**. Sits above [engineering-vision.md](./engineering-vision.md) and below only [manifesto.md](./manifesto.md). When this doc disagrees with code, this doc updates.
> **Foundation above**: [manifesto.md](./manifesto.md) (founding intent + brand voice)
> **Domain**: `pryzm.app` (product) · marketplace at `marketplace.pryzm.app` (DNS pending)

---

## §1 — The promise (one line)

> **One conversation, from raw site to coordinated building.**

That is the only promise. Everything else — the renderer, the file format, the 49 contracts, the marketplace, the sovereignty model — is in service of that single line.

---

## §2 — What PRYZM is

PRYZM is an **AI-native design intelligence platform for the built environment**. It is a browser-based BIM editor that accepts a brief as input (natural language, structured constraints, or both), reasons across spatial / environmental / regulatory / programmatic layers, and produces coordinated BIM data (IFC4X3 or `.pryzm`) that downstream consultants and contractors can consume without rework.

Every word matters:

- **Design** — the act of deciding what a building should be (not analysing, not documenting, not visualising)
- **Intelligence** — the platform carries 248+ architectural rules, 14 room-type programs, climate substrates, and a 7-workflow AI host — actively reasoning, not passively storing
- **Platform** — plugins, families, pricing catalogues, AI workflows, and locale packs are first-class artefacts third parties extend over the substrate
- **Built environment** — buildings, but also sites, rooms, neighbourhoods, climates

---

## §3 — Why PRYZM exists — the problem

Architecture and construction is a $13 trillion global industry running on fragmented, disconnected software. The structural problems:

| Problem | Detail |
|---|---|
| **BIM complexity** | Revit and Archicad have 30-year-old interaction paradigms. Months of learning curve. Every project starts from scratch. |
| **No design intelligence** | Current tools store shapes. They do not know what a living room is, what adjacency rules apply, or whether a layout is compliant. |
| **Disconnected environmental data** | Sun, wind, climate, shadow analysis live in separate specialist tools most architects never open. |
| **Manual modelling dominates** | A skilled architect spends weeks drawing something an AI could generate in minutes — *if the AI understood buildings*. |
| **Poor interoperability** | IFC is the universal format but BIM-to-BIM workflows are routinely broken. Data is lost at every handover. |
| **No conversational interface** | Architects describe intent to colleagues in language. To Revit, they draw. Always manually. |
| **Generative tools miss the point** | Image generation produces pictures of buildings, not buildings. There is no constraint, no regulation, no geometry. |

PRYZM's wedge: between 2023 and 2026, three substrates matured simultaneously — large language models with spatial reasoning, browser-native 3D at desktop performance, and CRDT collaboration. The category opens. We enter (see [manifesto.md §3](./manifesto.md) and [positioning.md §1](./positioning.md)).

---

## §4 — What's actually shipped (verified 2026-06-01)

The following table is **derived from a full code audit on 2026-06-01**, not from prior documentation claims. Every row is auditable against the repository at that SHA.

### §4.1 — Core engine

| Capability | State | Owner code |
|---|---|---|
| 9-layer code architecture with L0 schemas → L9 plugins | ✅ Shipped | Per [architecture.md §1](./architecture.md) |
| Single composition root (`composeRuntime()`) | ✅ Shipped | `packages/runtime-composer/` (codified in [C02](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md)) |
| Command bus (the only mutation path; P6) | ✅ Shipped | `packages/command-bus/` |
| Single THREE owner (P2) | ✅ Shipped + CI-enforced | `packages/renderer-three/src/three-re-export.ts` |
| Single rAF / frame scheduler (P3) | ✅ Shipped + CI-enforced | `packages/frame-scheduler/src/RafAdapter.ts` |
| L0 Zod schemas (pure; P5) | ✅ Shipped | `packages/schemas/` |
| Yjs CRDT collaboration | ✅ Shipped | `packages/sync-client/`, `apps/sync-server/` |
| OpenTelemetry per public function (P8) | ✅ Shipped + CI-enforced | `tools/ga-gate/check-otel-spans.ts` |
| Headless mode | ✅ Ready | `packages/headless/` v1.0.0-rc.1 |

### §4.2 — Element types (14 element families)

Each element family is split across a `packages/geometry-*` (geometry math) and `plugins/*` (UI tool + commands + UI) pair:

| Element | Geometry package | Plugin |
|---|---|---|
| Wall | `packages/geometry-wall/` | `plugins/wall/` |
| Door | `packages/geometry-door/` | `plugins/door/` |
| Window | `packages/geometry-window/` | `plugins/window/` |
| Slab | `packages/geometry-slab/` | `plugins/slab/` |
| Floor (decorative) | (in slab) | `plugins/floor/` |
| Ceiling | (in geometry-kernel) | `plugins/ceiling/` |
| Roof | `packages/geometry-roof/` | `plugins/roof/` |
| Column | `packages/geometry-column/` | `plugins/column/` |
| Beam | `packages/geometry-beam/` | `plugins/beam/` |
| Stair | `packages/geometry-stair/` | `plugins/stair/` |
| Handrail | (in geometry-stair) | `plugins/handrail/` |
| Curtain wall | `packages/geometry-curtain-wall/` | `plugins/curtain-wall/` |
| Lighting | `packages/geometry-lighting/` | `plugins/lighting/` |
| Plumbing | `packages/geometry-plumbing/` | `plugins/plumbing/` |
| Furniture | `packages/geometry-furniture/` | (consumed by AI workflows) |

Plus structural element coordination via `plugins/structural/`, grid systems via `plugins/grid/`, and room-detection via `plugins/rooms/`.

### §4.3 — AI workflows (7 in `packages/ai-host/src/workflows/`)

| Workflow | Path | Routing |
|---|---|---|
| **Generate3Options** | `Generate3Options.ts` | AI (fan-out 3 parallel Haiku calls per style) |
| **PlanCritique** | `PlanCritique.ts` | AI (single Haiku call) |
| **VoiceCommand** | `VoiceCommand.ts` + `VoiceCommand.impl.ts` | Whisper transcription + intent LLM fallback |
| **ApartmentLayout** | `apartmentLayout/workflow.ts` + `generate.ts` | AI primary + deterministic D-TGL fallback |
| **FurnishLayout** | `furnishLayout/furnishRoom.ts` | Deterministic D-FLE (no LLM) |
| **CeilingLayout** | `ceilingLayout/ceilingForRoom.ts` | Deterministic D-CE (no LLM) |
| **LightingLayout** | `lightingLayout/lightRoom.ts` | Deterministic D-LE (no LLM) |

LLM model: `claude-haiku-4-5-20251014` via Anthropic API (direct or via Cloudflare Worker relay; `CF_WORKER_URL` env var). Costs tracked via `@pryzm/ai-cost`; per-project budget caps enforced. AI plane wired into composition root.

### §4.4 — Constraint database

| Subject | State |
|---|---|
| Architectural program rules | `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` (627 LOC, 14 room types) |
| Per-room furniture specs | 53+ FurnitureSpec objects across room types |
| Spec database (full) | `docs/03-execution/specs/SPEC-LAYOUT-CONSTRAINT-DATABASE.md` — 248 constraints across 14 categories |
| Code-implemented subset | ~40 % of spec (area ratios, room sizes, door topology, programmatic furniture); daylight / acoustic / fire / thermal documented but not yet enforced |

### §4.5 — Geospatial substrate

| Capability | State |
|---|---|
| LTP-ENU local Cartesian (1 km recentre) | ✅ `packages/geospatial/src/LTPENURebase.ts` |
| Proj4 CRS transforms | ✅ `packages/geospatial/src/GeospatialAdapter.ts` |
| `IfcProjectedCRS` IFC4X3 export | ✅ `packages/geospatial/src/IfcProjectedCRSRecord.ts` |
| Cesium viewer integration | ✅ `plugins/geospatial/src/CesiumThreeBridge.ts` |
| Site element as first-class schema | ⬜ Codified DRAFT [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md); implementation in flight |
| Climate ingestion (EPW + NOAA) | ⬜ Codified DRAFT [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md); implementation in flight |

### §4.6 — Interchange

| Format | State |
|---|---|
| IFC4X3 import | ✅ `plugins/ifc-import/` |
| IFC4X3 export (production-grade) | ✅ `plugins/ifc-export/` + `packages/file-format/src/ifc/` |
| BCF round-trip | ✅ `plugins/bcf/` |
| Rhino import | ✅ `plugins/rhino-import/` |
| DXF import | ✅ `plugins/dxf/` |
| Revit round-trip (via IFC4X3 bridge) | Codified DRAFT [C26](../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md); IFC variant exporter shipped |
| PDF export (vector, via drawing-primitives) | ✅ `packages/pdf-export/` + `plugins/export-pdf/` |
| DWG round-trip | Codified DRAFT [C32](../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md); ODA library integration pending |
| COBie FM handover | Codified DRAFT [C35](../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |

### §4.7 — Platform (plugin SDK + family + marketplace)

| Surface | State |
|---|---|
| `@pryzm/plugin-sdk` v1.0.0 | ✅ `packages/plugin-sdk/` — full SDK with iframe sandbox + Ed25519 signing + 6 host proxies + `pryzm dev` CLI + bSDD lookup client. publishConfig.name=`@pryzm/sdk`. Manual step: `pnpm publish`. |
| Family Platform runtime | ✅ `packages/family-{instance,loader,runtime}/` |
| Family schemas (7 stages) | ✅ `packages/schemas/src/family-{definition,request,parametric,geometry,schemas,registry,pipeline}/` |
| `.pryzm-family` ZIP file format | ✅ `packages/file-format/` (packFamily / unpackFamily) |
| Component Editor (Family Creator) | ✅ `apps/component-editor/` — functional (not scaffold); sketcher + planegcs + 3D ops + parameter table |
| Plugin Marketplace SPA | ✅ `apps/marketplace/` (port 5001) |
| Family Marketplace SPA | ✅ `apps/marketplace-web/` |
| Marketplace API | ✅ `apps/marketplace-api/` + `/marketplace/api/*` routes in `server.js` |
| Marketplace DB (9 tables) | ✅ `marketplace_plugins`, `plugin_publisher_keys`, `plugin_revocations`, `plugin_purchases`, `plugin_reviews`, … |
| Marketplace DNS (`marketplace.pryzm.app`) | ⬜ Manual pending (OI-013) |

### §4.8 — Server + persistence + collaboration

| Capability | State |
|---|---|
| Express server | ✅ `server.js` (5648 LOC, 278 KB) |
| 19 PostgreSQL tables | ✅ `server/dbMigrate.js` (Supabase or Replit PG; in-memory fallback) |
| Auth: email/password (bcrypt) + JWT (30d) | ✅ `server/authStore.js` |
| OAuth Google + Microsoft | ✅ `server/oauthService.js` |
| SAML SSO | ⬜ Not shipped (planned per Enterprise C39) |
| Password reset flow | ⬜ Not shipped |
| Stripe subscriptions (architect / studio / firm × monthly / annual = 6 SKUs) | ✅ `server/stripeService.js` + webhook |
| Stripe marketplace (30/70 split, refunds, chargebacks) | ✅ `plugin_purchases` table + webhook handlers |
| Anthropic API proxy (`/api/anthropic/v1/messages`) | ✅ Direct API or Cloudflare Worker relay (CF_WORKER_URL) |
| Socket.io real-time | ✅ `socket.io` on httpServer; project-scoped rooms |
| Yjs CRDT sync | ✅ `packages/sync-client/` + `apps/sync-server/` (single-instance v0; Redis pub/sub deferred) |
| ISO 19650 CDE state machine (WIP → approved → published) | ✅ `project_versions.state` + `version_audit_log` table |
| OpenTelemetry tracing | ✅ Opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` env |
| Security: Helmet + CSP + COEP + COOP + HSTS + rate limiting | ✅ `server/securityHeaders.js` |

### §4.9 — Output + sheets + drawing

| Capability | State |
|---|---|
| Sheet composition engine | ✅ `plugins/sheets/` (S37 prior art); migrating under [C24](../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| Vector PDF export | ✅ `packages/pdf-export/` (fills the typed stub per [C29](../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md)) |
| Sheet sets + revisions | ✅ `packages/stores/src/SheetSetStore.ts` |
| BIM 3.0 Inspect tree (Site → Building → Level → Apt → Room → Element) | Codified DRAFT [C27](../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md); INS-α phases shipping |
| Data Panel + automation | Codified DRAFT [C28](../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md); migrating from `plugins/schedules/` |
| Schedules (PRYZM 2 prior art) | ✅ `plugins/schedules/` |
| Cost (5D) | Codified DRAFT [C38](../02-decisions/contracts/C38-COST-5D.md); implementation pending |
| Schedule (4D) | Codified DRAFT [C37](../02-decisions/contracts/C37-SCHEDULE-4D.md); implementation pending |

### §4.10 — Measurement + governance

| Capability | State |
|---|---|
| 68 benchmarks measured every PR | ✅ `apps/bench/src/benches/*.bench.ts` |
| 21 CI gates | ✅ `tools/ga-gate/check-*.ts` (run by `run-all.ts`) |
| 49 binding contracts | ✅ `docs/02-decisions/contracts/C01–C49` |
| 108 ADRs | ✅ `docs/02-decisions/adrs/` |
| 56 specs | ✅ `docs/03-execution/specs/` |

---

## §5 — The user journey (target end-to-end)

This describes the workflow a first-time PRYZM user experiences when creating a residential project. This is the workflow PRYZM must deliver as the Phase 1 commitment.

### Step 1 — Enter PRYZM (`pryzm.app`)

The user navigates to `pryzm.app`. They are greeted by a minimal interface: a single conversational input and a 3D site view. No toolbar. No palette. No empty canvas.

The first interaction is the brief — not the login. Account creation happens *after* the first project is initiated, reducing friction to near zero. Stripe payment is required only at trial expiry (per [C39 §1.7](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)).

### Step 2 — Project initiation chatbot (RAC)

The Rapid Authoring Chatbot drives the entire initiation sequence:

| Question | Purpose |
|---|---|
| Q1: Project type | Apartment / house / residential building / office / school / refurbishment / extension / commercial / other |
| Q2: Site location | Address, city, or plot coordinates. Triggers automatic geolocation + site model generation. |
| Q3: Scale | Single unit / multiple units / floor area / bedroom count |
| Q4: Existing conditions | Empty plot / existing building / drawings / IFC file / photos |
| Q5: Regulatory context | Auto-detected from geolocation; user confirms or overrides |
| Q6: Brief summary | RAC summarises the brief back; user confirms before generation |

### Step 3 — Site definition

The site model is generated automatically from the address (per [C12 Geospatial](../02-decisions/contracts/C12-GEOSPATIAL.md) + the in-flight [C19 Site Model](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)):

- Plot boundaries from GIS/cadastral data
- Latitude + longitude (WGS84) + project-local Cartesian (LTP-ENU)
- Orientation + cardinal directions + true north vs project north
- Sun paths for every season and hour
- Climate substrate (EPW priority; NOAA fallback per in-flight [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))
- Context buildings from OpenStreetMap
- Topography + level changes
- Street access + planning context

The site UI is cream / light (not the Cesium default dark globe); user defines plot boundary; PRYZM derives everything else.

### Step 4 — Existing conditions

Per Q4 answer:

| Path | Workflow |
|---|---|
| **Empty site** | Skip to Step 5; envelope generated from plot boundary + planning constraints |
| **IFC import** | User uploads IFC; PRYZM parses (per `plugins/ifc-import/`); model populated |
| **PDF / DWG / image import** | OCR + line detection (beta; clearly marked) |
| **Existing building** | RAC captures dimensions; simplified model generated |

### Step 5 — Design authoring (4 modes coexist)

- **Manual** — traditional BIM tools (wall, door, slab, etc.) via `plugins/*` commands
- **AI conversational** — *"add a master bedroom facing south with an ensuite"* — single-command natural language
- **Batch AI** — structured multi-step generation (full apartment via `apartmentLayout`; multi-apartment floor-plate)
- **Hybrid** — AI generates base; human refines

For residential, the generative AI workflow (`apartmentLayout`) activates. The 248-rule constraint database enforces spatial logic. Generated layouts are valid by construction.

### Step 6 — Design intelligence layer (background)

After initial generation, the design intelligence layer runs continuously:

- **Constraint validation** — rules checked; violations highlighted with rule reference
- **Daylight rule-checking** — mandatory window requirements (full simulation in [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))
- **Adjacency quality** — preferred adjacencies scored; improvements suggested
- **Circulation efficiency** — corridor length, dead ends, accessibility
- **Code compliance** — regulatory minimums per jurisdiction

Energy + wind + acoustic + behavioural simulation land in Phase 1b (per [site-and-cognition-strategy §3.4](./site-and-cognition-strategy.md)).

### Step 7 — Living BIM model

The generated design is stored as a **living model**: every element carries geometry + type + intent + constraints + relationships + performance targets. Changing a performance target adapts the layout dynamically. The model is always internally consistent.

### Step 8 — Sheets + IFC handoff

User generates sheets via [C24 Sheet Composition](../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md). Drawing standards per region ([C34](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md)). PDF export via [C29](../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md). IFC4X3 export via [C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). Customer collaborators consume the IFC in Revit / Archicad / Solibri.

---

## §6 — Deployment + environments

PRYZM runs across **four environments** ([codified by C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md)):

| Environment | Purpose |
|---|---|
| **Local (dev)** | Developer's machine. Hot reload. Full debug. Local DB + mocked Cesium tiles. |
| **CI** | Automated tests + 21 CI gates + 68 benches. Run on every PR. |
| **Staging** | Pre-production mirror. Real Cesium tiles. QA + stakeholder demos. Not indexed. |
| **Production** | Live. Monitored. Rate-limited. Region-aware (EU / US / AP / UK). Backed up per [C48](../02-decisions/contracts/C48-BACKUP-AND-DR.md). |

Release process:

- All changes via pull request — no direct commits to main
- Branches: `feat/...`, `fix/...`, `docs/...`
- Merges to `main` trigger CI (21 gates + bench baselines)
- Staging promoted manually after QA sign-off
- Production releases semantically versioned (`vMAJOR.MINOR.PATCH`)
- Hotfixes via `hotfix/<description>` branch, merged to main + backported

---

## §7 — Market positioning

Full treatment in [positioning.md](./positioning.md). Summary:

| Segment | Phase | Profile |
|---|---|---|
| **Solo architect (C1)** | Phase 1 | 1 seat; Solo $25/mo; PLG self-serve |
| **Studio (C2)** | Phase 1 | 2–10 seats; Studio £15/seat/mo; PLG |
| **Mid-firm (C3)** | Phase 1–2 | 11–50 seats; Mid-firm $35/seat/mo; assisted sales |
| **Enterprise (C4)** | Phase 2–3 | 50+ seats; custom; 6–9 month procurement |
| **Plugin developer (C5)** | Phase 1 onward | 30/70 marketplace revenue share |

Competitive positioning detailed in [positioning.md §2](./positioning.md).

---

## §8 — Gap analysis (Phase 1 blockers)

The deltas between code reality (§4) and the user journey (§5):

| Gap | Status | Resolution |
|---|---|---|
| **RAC end-to-end wiring** | Partial | Chatbot exists; integration with `apartmentLayout` workflow shipped per #51 (apartment-layout live). End-to-end RAC → site → generate flow needs onboarding polish. |
| **Site UI aesthetic (cream/light, not dark globe)** | Pending | Cesium bridge shipped; light-theme tile styling pending. |
| **Multi-apartment validation** | Partial | Single-apartment layout shipped; multi-apartment floor-plate generator + validation per [C20 §1.2 caveat](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md). |
| **Site as first-class element ([C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md))** | DRAFT contract; impl in flight | PG0 work track per [site-and-cognition-strategy §2.4](./site-and-cognition-strategy.md). |
| **Climate ingestion ([C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))** | DRAFT contract; impl in flight | PG0 work track. |
| **End-to-end IFC handoff test** | Partial | IFC4X3 export shipped; nightly round-trip vs 10 reference projects per [C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). |
| **PDF/image-to-BIM** | Not production | Marked beta; out of core scope (marketplace plugin opportunity). |
| **`pryzm.app` domain + DNS** | Pending | Currently `pryzm.so` legacy; cutover planned. |
| **`marketplace.pryzm.app` DNS** | Pending OI-013 | DNS + TLS cert. |
| **`pnpm publish @pryzm/sdk`** | Pending OI-011 | Manual npm publish; SDK ready. |
| **`pnpm publish @pryzm/headless`** | Pending OI-012 | Manual npm publish; package ready. |

---

## §9 — Phased roadmap

| Phase | Name | Horizon | Focus |
|---|---|---|---|
| **Phase 0** | Foundation | Complete | Constraint DB + ROOM_RULES + apartment engine (D-TGL) + D-FLE furniture + D-CE ceiling + D-LE lighting + command bus + IFC4X3 + Cesium + Plugin SDK v1.0 + Family Platform |
| **Phase 1** | Connected workflow | 0–6 months | RAC end-to-end + site UI polish + multi-apartment validation + marketplace DNS + npm publish + production-grade IFC4X3 |
| **Phase 1b** | Intelligence layer | 3–9 months | C19/C20/C21 site + climate + aggregates; daylight + performance-driven adaptation; cognition stack L5 (perceptual sim) |
| **Phase 2** | Platform breadth | 6–18 months | New typologies (office/hospital/retail); drawing production polish; PDF import robustness; family marketplace flywheel |
| **Phase 2b** | Market expansion | 12–24 months | Interior designer tools; homeowner self-service; mid-firm Mid-tier features (4D / 5D / clash) |
| **Phase 3** | Enterprise + twin | 18–36 months | Enterprise sovereignty (EU/US/AP/UK regions live per C49); BYOK; self-host; digital twin + FM integration |

The master implementation plan ([../03-execution/plans/master-implementation-plan.md](../03-execution/plans/master-implementation-plan.md)) overlays delivery tracks onto these phases.

---

## §10 — Guiding principles for future development

Every decision about what to build next is tested against these:

- **The constraint database is law.** No generated output bypasses it. Adding a new typology means adding its rules first.
- **Conversation before UI.** Every new capability should be accessible via natural language before a graphical control is built.
- **Site first.** Any feature ignoring real-world geography is a temporary measure. All design should eventually be site-grounded.
- **BIM output is non-negotiable.** PRYZM produces real interoperable geometry. Image generation is never a substitute.
- **Fail loudly on constraints.** When a layout violates a rule, the system tells the user which rule, why, and what to do.
- **The human is always in control.** AI generates proposals. Humans approve. No autonomous action without confirmation.
- **Honest performance contracts.** Every claim is measured in CI ([engineering-vision §5](./engineering-vision.md)).
- **Open file format.** Lock-in is anti-customer. `.pryzm` + IFC4X3 round-trip is the contract.
- **Marketplace as moat.** The long tail of customisation IS the product. PRYZM ships the substrate; the ecosystem ships the breadth.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | Founding intent + brand voice |
| [positioning.md](./positioning.md) | Competitive landscape + moats |
| [personas.md](./personas.md) | The 5 customer archetypes in depth |
| [go-to-market.md](./go-to-market.md) | Channels + pricing + retention |
| [platform-strategy.md](./platform-strategy.md) | Plugin SDK + Family Platform + Marketplace pillars |
| [site-and-cognition-strategy.md](./site-and-cognition-strategy.md) | Site/geospatial + cognition substrate strategy |
| [engineering-vision.md](./engineering-vision.md) | P1–P8 principles + D1–D13 differentiators + 68 benches |
| [architecture.md](./architecture.md) | System shape + composition root + lint matrix |
| [architecture-breakdown.md](./architecture-breakdown.md) | Per-package detail |
| [operating-principles.md](./operating-principles.md) | How the team works |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | Bets + risk register |
| [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) | 49 binding contracts (C01–C49) |
| [../03-execution/plans/master-implementation-plan.md](../03-execution/plans/master-implementation-plan.md) | Master delivery plan |

---

## Document control

| | |
|---|---|
| **Version** | 2.0 (code-grounded rewrite) |
| **Status** | CANONICAL — full code audit basis |
| **Domain** | `pryzm.app` (product) · `marketplace.pryzm.app` (pending) |
| **Next review** | 2026-09-01 (quarterly cadence) OR on substantive code shift |

---

*End — PRYZM Product Vision, 2026-06-01 — CANONICAL.*
