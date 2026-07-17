# PRYZM — Company Briefing for an External Strategy Consultant

> **Stamp**: 2026-07-17 · **Mode**: READ-ONLY repo audit. No code or existing docs modified; this file is the only artefact created.
> **Purpose**: A precise, gap-flagged briefing for a consultant with zero prior knowledge. Every product claim is cited to `file:line` or a named doc. Anything not evidenced in the repository is labelled **NOT AVAILABLE IN REPO**, **UNVALIDATED ASSUMPTION**, or **NOT YET BUILT / UNVERIFIED**.
> **Truth sources for build-status**: `reports/CATEGORY-READINESS-AUDIT-2026-07-17.md`, `reports/PRE-LAUNCH-AUDIT-2026-07-17.md`, and the `L-NNN` issue log in `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`. Where a marketing/vision doc and the shipping code disagree, **the code is treated as truth** and the disagreement is flagged.

---

## 0. Reading note — two conflicting narratives in this repo

The repository contains two layers that do not agree, and the consultant must not conflate them:

1. **The aspiration layer** — `docs/01-strategy/STR-*` (product vision, GTM, positioning) and the DRAFT contracts (C19–C56). These describe an intended enterprise BIM platform.
2. **The reality layer** — the shipping code plus two honest internal audits dated 2026-07-17 (`reports/`) and the `L-NNN` issue log. These show what actually runs.

Where this briefing states a capability is "built," it means code exists and (where noted) is wired into production. Several vision claims are contradicted by the audits; those are flagged inline.

---

## 1. One-sentence description

PRYZM is a **browser-based BIM (Building Information Modeling) editor** — a pnpm/TypeScript monorepo web app — that lets a user author a building model in 3D, generate residential/house/office layouts from a natural-language brief plus a rule database, place it on a real-world geolocated site, and export interoperable BIM data (IFC4X3, `.pryzm`, PDF, GLB); its stated audience is professional architects and architecture firms (`docs/01-strategy/STR-02-product-vision.md:21`, `:305-311`).

---

## 2. Core problem + buyer

**Problem asserted (docs, not customer-validated):** architecture/construction runs on fragmented, high-learning-curve legacy tools (Revit, Archicad) that "store shapes" without design intelligence, with broken IFC interoperability and no conversational interface (`STR-02-product-vision.md:34-46`). PRYZM's stated wedge is "one conversation, from raw site to coordinated building" (`STR-02:13`).

**Target buyer (asserted):** professional architects, segmented into five archetypes — C1 Solo architect, C2 Studio (2–10 seats), C3 Mid-firm (11–50 seats), C4 Enterprise (50+ seats), C5 plugin developer (`STR-02:305-311`, `STR-08-go-to-market.md:20-110`). The primary go-to-market motion is product-led self-serve for Solo/Studio, assisted sales for Mid-firm, procurement for Enterprise (`STR-08:10-12`).

> **UNVALIDATED ASSUMPTION.** The buyer, the problem framing, and the segment sizing exist only in strategy docs authored internally (`STR-02`, `STR-08`, `STR-09-personas.md` — personas are named fictional archetypes "Sofia," "MORI," "BRAUER"). There is **no evidence in the repo of a single paying or piloting customer** validating that this buyer will pay for this product. Treat the entire buyer thesis as an internal hypothesis.

---

## 3. Product architecture — module inventory with honest build-status

Status legend: **LIVE** (built + wired into the single production process) · **BUILT-NOT-DEPLOYED** (code exists, not reachable in prod) · **PARTIAL** (works for a narrow case) · **IN-DEV / DRAFT** · **SCAFFOLDED-NOT-WIRED**.

### 3.1 Core editor engine — LIVE
Layered TypeScript SPA (`apps/editor`), single composition root (`packages/runtime-composer`), command bus as the only mutation path, single THREE.js owner (`packages/renderer-three`), single rAF scheduler, L0 Zod schemas. CI-enforced architectural boundaries. 14 element families (wall/door/window/slab/roof/column/beam/stair/curtain-wall/etc.), each split geometry-package + plugin (`STR-02:54-90`). This substrate is real and is the most mature part of the system.

### 3.2 Generative layout engines — PARTIAL (single-apartment solid; multi-unit + house/office weaker)
Located in `packages/ai-host/src/workflows/`. Deterministic algorithmic engines (see §5), NOT trained models:
- **D-TGL apartment layout** (`apartmentLayout/tgl/`) — single-apartment generation. Shipped and the most-validated generative path.
- **D-FLE furnish**, **D-CE ceiling**, **D-LE lighting** — deterministic per-room engines (`furnishLayout/`, `ceilingLayout/`, `lightingLayout/`).
- **House, residential-building, office-building, office-furnish** orchestrators (`houseLayout/`, `residentialBuilding/`, `officeBuilding/`, `officeFurnish/`) — exist but the founder's own working memory documents numerous open defects (stair fragmentation, sealed rooms, out-of-boundary upper floors, corner-cell door routing, doubled walls). Treat multi-unit and non-residential typologies as **IN-DEV, defect-heavy**, not production-grade.
- Constraint DB: spec claims 248 constraints; **only ~40% is code-enforced** (area ratios, room sizes, door topology, furniture); daylight/acoustic/fire/thermal are documented but NOT enforced (`STR-02:106-113`).

### 3.3 Geospatial / "Forma" 3D site view — PARTIAL (viewer LIVE; site-as-data IN-DEV)
- LTP-ENU local Cartesian rebasing, proj4 CRS transforms, IfcProjectedCRS export, Cesium 3D-Tiles globe with georeferenced building placement — LIVE and verified 2026-07-17 (`STR-02:115-122`; C12 §7 "verified live 2026-07-17").
- Context buildings from OpenStreetMap (LOD1 outer-ring extrusions only), Esri raster basemap — LIVE but low-fidelity. Terrain is coded but **never attached** today (`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md:53`).
- **Site as a first-class schema element (C19), climate ingestion (C21)** — DRAFT contracts, "implementation in flight" (`STR-02:123-124`).
- **Four analysis heatmaps** (Sun Hours, Wind Comfort, Temperature, Population Density) ship on the site view but present **partly-heuristic spatial fields with undocumented data provenance** (L-373, P2 data-credibility). Do not represent these as validated engineering analysis.

### 3.4 Parcel / zoning / buildable-envelope — SCOPED, NOT BUILT
The parcel→zoning→envelope feature (select a cadastral parcel, read zoning legislation, derive a buildable envelope) is **scoping documents only**:
- L-380 (`ParcelProvider` for Catastro/ÖREB, server proxy) — **OPEN, owner UNASSIGNED, target TBD** (`V1-LAUNCH-READINESS-AUDIT.md:550`).
- L-383 Denmark reference implementation — a **validation/architecture doc**, explicitly "no code changed" (`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md:3`). Denmark is a *technical proving ground* on open data; **Spain is the stated business-priority market** but has "no free LOD2" so rides a lower-fidelity footprint-extrusion path (`:28-31`).
- **NOT YET BUILT.** This is a roadmap item, not a feature.

### 3.5 Render pipeline — LIVE, but single-machine-verified
WebGPU-preferred renderer with WebGL2 / WebGL fallback (`apps/editor/src/rendering/createRenderer.ts`). **WebGPU repeatedly device-loses on real buildings** (L-361/366/372); WebGL is the only stable backend, verified on essentially **one Windows box** (the founder's). Broad-device / low-end-GPU behaviour is UNVERIFIED (category audit §8).

### 3.6 Interop (IFC / DXF / Rhino / Revit / BCF / PDF / GLB) — PARTIAL, fidelity UNVERIFIED
- IFC4X3 import + export, BCF round-trip, Rhino import, DXF import, vector PDF export, GLB export — code exists (`STR-02:126-138`).
- **No IFC/DXF/Rhino round-trip (import→export→re-import compare) test exists** — geometry fidelity for the load-bearing BIM formats is **ASSUMED, not verified** (L-393; category audit §4). Only BCF and internal family/chunk formats have round-trip coverage.
- Revit round-trip (C26) and DWG round-trip (C32) are DRAFT contracts; no `.rvt`/`.dwg` parsing in the repo.

### 3.7 Real-time collaboration — BUILT-BUT-NOT-DEPLOYED (silent last-write-wins in prod)
This is the single most important status correction for a consultant:
- The **advertised CRDT path** (Yjs `Y.Doc` + 3-way `CRDTConflictResolver` + explicit conflict UX) exists in `packages/sync-client/` but **has NO network provider** — `apps/sync-server` is **not deployed** (`fly.toml` runs a single `["app"]` process), and no `WebsocketProvider` is ever constructed. The conflict resolver never sees remote ops (L-391 P0; category audit §2.1).
- **What actually runs in production is socket.io command-rebroadcast = silent last-write-wins.** Concurrent move/property-edit/delete of the same element are applied in arrival order with no merge (`server.js:534-599`, `RemoteCommandDispatcher.ts:157`; category audit §2.2). Multi-user correctness is **UNVERIFIED end-to-end** — the two-browser CRDT test admits it can't run without an undeployed WS server.

### 3.8 Persistence / save-integrity — LIVE but with a CRITICAL open gap
- Save path: in-memory stores → debounced serialize → localStorage + IndexedDB → server version POST (`server.js:3172`) (category audit §1.1).
- **Server validates only a 50 MB size cap and the furniture array (Zod `.passthrough()`); walls, slabs, doors, rooms, levels, graphs are NOT validated** — a snapshot with corrupt/missing walls persists as HTTP 201 "success" (`server.js:3236-3239`; category audit §1.2).
- **No checksum / corruption detection exists in source.** A checksum was added, then reverted after it bricked a real 1009-element project (L-334 open; L-360; category audit §1.4). Silent element-loss is reported as success — the single biggest data-integrity gap, a KNOWN launch-blocker.
- Snapshot schema migration (v0→v5) is **UNTESTED**; a newer-schema snapshot "loads anyway" with silent field loss (L-394; category audit §1.5).

### 3.9 Plugin + Family marketplace — CODE LIVE, COMMERCE UNPROVEN
- Plugin SDK v1.0 (iframe sandbox + Ed25519 signing + `pryzm dev` CLI), Family Platform runtime, Component Editor, marketplace SPAs, marketplace API, 9 marketplace DB tables — code exists (`STR-02:140-153`).
- 30/70 revenue-split purchase flow is coded via Stripe `checkout.session.completed` + `plugin_purchases` table (`server.js:2019-2062`).
- `marketplace.pryzm.so` DNS is **manual pending** (OI-013); `@pryzm/sdk` / `@pryzm/headless` npm publish are pending manual steps. No evidence of any published third-party plugin or any marketplace transaction.

### 3.10 Docs / sheets / drawing output — PARTIAL
Sheet composition engine, vector PDF, sheet sets/revisions exist (`plugins/sheets/`, `packages/pdf-export/`); BIM-3.0 Inspect tree (C27), Data Panel (C28), 4D/5D (C37/C38) are DRAFT/partial (`STR-02:174-185`).

### 3.11 Observability — GAP (critical for a data product)
OpenTelemetry spans are created everywhere and CI-enforced, **but no tracer provider is registered → spans are no-ops that export nowhere**; crash reporter is a Noop stub (Sentry not wired); server logging is `console.log` to stdout; **there is no active alert if a project silently corrupts in prod** (category audit §9).

---

## 4. Data ingested — source-by-source, scoped-vs-live

| Data class | Source | Status |
|---|---|---|
| Context buildings | OpenStreetMap via a same-origin **Overpass proxy** (`server.js:357`) | **LIVE** — LOD1 outer-ring extrusions only |
| Photoreal globe / terrain tiles | Cesium 3D-Tiles (Google/Cesium Ion imagery) | **LIVE** (globe); terrain coded but **not attached** |
| Basemap raster | Esri | LIVE (raster only, no draping) |
| Parcels / cadastre | Spain **Catastro**, Swiss ÖREB (scoped `ParcelProvider`) | **SCOPED, NOT BUILT** (L-380 OPEN, unassigned) |
| Parcels + zoning + LOD2 buildings + LiDAR terrain | Denmark **Matriklen / Plandata.dk / "Danmark i 3D" / DHM** | **SCOPED reference-only** — validation doc, no code (L-383) |
| Climate (EPW / NOAA normals) | EPW files priority, NOAA fallback (C21) | **DRAFT contract, IN-DEV** |
| Analysis-layer inputs (sun/wind/temp/population) | Per L-373: partly heuristic; provenance (e.g. NASA POWER / WorldPop-style) **undocumented** | **LIVE but data-credibility flagged** (L-373) |
| Uploaded BIM/CAD | User-uploaded **IFC4X3, DXF, Rhino/3dm**, PDF/image underlay | **LIVE import**; round-trip fidelity UNVERIFIED (L-393) |
| Geodata analytical layers (flood/slope/noise/Natura2000) | Pluggable `GeodataProvider` (C55, Sweden Lantmäteriet reference) | **DRAFT contract, NOT BUILT** |

**Net:** the only genuinely-live external geodata ingestion today is **OSM context buildings + Cesium/Esri basemaps**. Everything cadastral/zoning/climate/analytical is scoped or DRAFT.

---

## 5. AI / ML actually used — the honest breakdown

**There is exactly one LLM and no trained/ML models. Most of what the product calls "AI generation" is deterministic algorithms.**

### 5.1 The LLM — Anthropic Claude (Haiku)
- Model: `claude-haiku-4-5` (`server.js:119`), reached via a **Cloudflare Worker relay** (`CF_WORKER_URL`) or a direct `ANTHROPIC_API_KEY` fallback (`server.js:97-127`). If neither is set, "AI features disabled" (`server.js:267-268`).
- Used for (`STR-02:92-104`):
  - **Generate3Options** — 3 parallel Haiku calls producing layout style options.
  - **PlanCritique** — single Haiku call critiquing a plan against constraints.
  - **VoiceCommand** — Whisper transcription + an LLM intent-parse fallback.
  - **ApartmentLayout** — "AI primary + deterministic D-TGL fallback."
  - Brief interpretation + a chat/RAC surface route through the same relay (`server.js:1031-1108`).

### 5.2 Deterministic algorithmic engines — NOT ML, NOT the LLM
These are rule-based / geometric solvers producing byte-identical output for identical input (ADR-0061 determinism):
- **D-TGL** apartment layout (topology graph → squarify/pack → geometry).
- **D-FLE** furnish, **D-CE** ceiling, **D-LE** lighting — "no LLM" per `STR-02:100-102`.
- **AutoDimension engine** (C56) — contract explicitly mandates "**NO AI/ML/LLM**", "no RNG."
- **Solar analysis** (`packages/solar-analysis/`: `solarPosition.ts`, `occluderIndex.ts`, `sunHours.ts`, `roomHeatGain.ts`) — deterministic sun-position math + ray-casting occlusion, not a model.
- The **248-rule constraint DB** is a hand-authored rules database (`programRules.ts`), not learned.

> **Consultant takeaway:** the defensible technical asset is the **deterministic generative + rules stack**, not proprietary ML. The LLM is a thin, swappable commodity layer (Anthropic Haiku behind a proxy). PRYZM trains no models and owns no model weights. Any "AI" positioning should be read against this.

---

## 6. Business model — grounded in the actual billing code

### 6.1 Who pays / how (coded)
Stripe subscriptions + Stripe Connect-style marketplace, all present in code but **gated on API keys that may not be set in prod**:
- `server/stripeRoutes.js` — `/config`, `/checkout`, `/subscription`, `/portal`. Checkout accepts plans `architect | studio | firm` × `monthly | annual` (`stripeRoutes.js:66`).
- Webhook `server.js:1951` provisions plans on `customer.subscription.*`. **Boot warns `STRIPE_WEBHOOK_SECRET` unset → webhook rejects with 503** (`server.js:279-282`, `:1961-1966`); `/config` returns `configured:false` if no publishable key (`stripeRoutes.js:37-44`). **Whether live Stripe keys are configured in production is NOT VERIFIABLE from the repo.**

### 6.2 Actual price tiers in code (`packages/core-app-model/src/monetization/PlanConfig.ts`)
| Plan (code name) | Monthly USD | Annual USD | Server version cap |
|---|---|---|---|
| free | $0 | $0 | **0 server versions** (`server.js:3258`) |
| **architect** | **$59** | **$590** | 15 |
| **studio** | **$149** | **$1490** | unlimited |
| **firm** | **$349** | **$3490** | unlimited |
| **enterprise** | custom (null) | custom | unlimited |

Feature gates (`PlanConfig.ts:216-228`): AI floor-plan / IFC export / GIS / version-history unlock at **architect**; collaboration + extra seats at **studio**; API access + SSO at **firm**.

> **FLAG — code contradicts the strategy docs.** The GTM/vision docs advertise **different tier names and prices**: Solo $25/mo, Studio £15/seat, Mid-firm $35/seat, Enterprise $100/seat (`STR-02:305-311`, `STR-08:204-209`). The shipping code uses architect/studio/firm at $59/$149/$349. **These are unreconciled.** The consultant should ask the founder which is authoritative; the code is what would actually bill.

> **FLAG — free-plan durability trap.** Two different `VERSION_LIMITS` exist in `server.js`: a display value `free:1` (`:2549`) and the enforcement gate `free:0` (`:3258`). Net effect: a free user gets **zero server-persisted versions** — their only durable copy is localStorage/IndexedDB in one browser (category audit §1.3). `PlanConfig.ts:75` says `free` cap is 1, a third inconsistent number.

### 6.3 Sales motion (asserted, not evidenced)
Self-serve PLG (Solo/Studio) + assisted sales (Mid-firm, 60–120 day cycle) + procurement (Enterprise, 6–9 months) + 30/70 marketplace split (`STR-08:20-110`, `:230-232`). **All aspirational** — no CRM, no deal, no funnel data in the repo.

---

## 7. Current traction — NOT AVAILABLE IN REPO

**Customers, pilots, revenue, funding, headcount, and valuation are business facts that do not exist in a codebase. None were found. None are estimated here.**

The only verifiable deployment facts:
- The app is configured to deploy to **Fly.io, single process, primary region Frankfurt (`fra`)** (`fly.toml`); founder working-memory references a live demo at **`pryzm.fly.dev`** and a canonical domain **`pryzm.so`** (per `STR-02`). Deployment existence is plausible; **uptime, usage, or that anyone other than the founder uses it is UNKNOWN.**
- Auth supports a single **owner account** seeded from `PRYZM_OWNER_EMAIL` / `PRYZM_OWNER_PASSWORD` env vars (`server.js:3261-3264`). This indicates a single-operator setup, not a customer base.
- No analytics, no revenue records, no customer table contents, no cap table, no team roster are in the repo.

**Everything about traction, funding, and headcount must be provided by the founder.** Do not infer any number.

---

## 8. Shipped vs roadmap vs not-built — the split

### 8.1 Genuinely shipped and working (LIVE)
- Layered editor engine, command bus, 14 manual element tools, single THREE/rAF architecture.
- Single-apartment deterministic layout (D-TGL) + furnish/ceiling/lighting.
- Cesium georeferenced 3D-Tiles site view (globe) + OSM context buildings.
- IFC4X3 / DXF / Rhino import, IFC4X3 / PDF / GLB export (fidelity untested).
- Local save to localStorage/IndexedDB + server version POST for paid plans.
- Stripe subscription + marketplace purchase code paths (key-gated).
- Claude-Haiku-backed generate/critique/voice/brief workflows.

### 8.2 Roadmap / DRAFT / in-flight (NOT shippable today)
- Site-as-first-class-element (C19), climate ingestion (C21), building/apartment aggregates (C20).
- Multi-apartment floor-plate + house/office typologies (defect-heavy, IN-DEV).
- Revit round-trip (C26), DWG (C32), Rhino round-trip (C33), COBie (C35), clash (C36), 4D (C37), 5D (C38) — DRAFT contracts.
- Marketplace go-live (DNS + npm publish pending); no third-party plugins.
- Accessibility (C43), i18n (C46), multi-region/sovereignty (C49), backup/DR (C48), privacy/DSAR (C22) — DRAFT, largely unbuilt.

### 8.3 The critical NOT-BUILT / NOT-VALIDATED items (launch-blocking per the audits)
| Item | Status | Evidence |
|---|---|---|
| **Multi-user CRDT collaboration** | **NOT DEPLOYED** — prod is silent last-write-wins | L-391 (P0); category audit §2 |
| **Save-integrity / checksum / corruption detection** | **NONE in source** (reverted after bricking projects); only furniture validated server-side | L-334 (CRITICAL), L-360; category audit §1.4 |
| **Snapshot migration robustness** | **UNTESTED**; forward-version loads with silent field loss | L-394; category audit §1.5 |
| **Parcel→zoning→buildable-envelope** | **SCOPED, unassigned** (Spain business market has no open LOD2; Denmark is reference-only) | L-380, L-383 |
| **Engineering-grade context / real LOD2 buildings + terrain** | **NOT BUILT** — LOD1 OSM only; terrain never attached | L-374 (open sub-items); Denmark doc §1 |
| **Real performance at scale (60 FPS, 40-storey)** | **UNVERIFIED** — only headless proxies exist; live logs show WebGPU device-loss + tens-of-seconds generation | L-389; category audit §3 |
| **Dependency security** | **93 open advisories (7 critical / 28 high)**, runtime-reachable (jsPDF, Multer, ws) — none fixed | L-387 |
| **Interop round-trip fidelity (IFC/DXF/Rhino)** | **NO round-trip test** — geometry fidelity assumed | L-393; category audit §4 |
| **Backup / restore proven** | **Never drilled**; PITR not wired; free-plan data lives in one browser | category audit §1.6, §10 |
| **Observability of corruption** | **GAP** — OTel spans are no-ops, crash reporter is Noop, no corruption alerting | category audit §9 |
| **Embed/share-link token scope** | **UNVERIFIED** — `/embed` serves a public shell with no server-side token check | category audit §5.2 |

---

## Open questions the founder must answer that the codebase cannot

1. **Traction** — Any paying customers, pilots, LOIs, or active users beyond the founder? How many, which segment, since when? (Repo shows a single owner account; zero customer evidence.)
2. **Revenue** — Is Stripe live in production (are `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` actually set)? Any MRR/ARR? (Code is key-gated; boot warns keys may be unset.)
3. **Funding** — Raised to date, stage, runway, investors? (Not in repo.)
4. **Headcount / team** — How many people build this? The `L-NNN` log and multi-agent memory suggest heavy automated/solo development — is this a solo founder + AI agents, or a team? (Not verifiable in repo.)
5. **Validated buyer** — Has any real architect/firm confirmed they will pay? Which of the five personas is real vs aspirational? (All personas are fictional archetypes in docs.)
6. **Pricing — which is authoritative?** Code bills architect/studio/firm at $59/$149/$349; docs advertise Solo/Studio/Mid-firm at $25/£15/$35. Which ships? Is there a free tier at all (docs say "no freemium," code has a `free` plan with 0 server versions)?
7. **GTM reality** — Any actual marketing spend, content, conference presence, or channel activity, or is `STR-08` purely a plan?
8. **Launch date + blocker acceptance** — The audits flag data-integrity (L-334) and collaboration (L-391) as launch-blockers; what is the real launch date and is the plan to ship with these open?
9. **Geographic/market focus** — Docs say Spain is the business-priority market but it lacks open cadastral/LOD2 data; is the near-term market Spain, Denmark, or Western-Europe-generally?

---

*Prepared read-only 2026-07-17. No code or existing docs were modified; this file is the sole artefact. Every product claim is cited; every gap is flagged.*
