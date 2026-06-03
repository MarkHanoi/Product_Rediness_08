# PRYZM — Roadmap Phase 1: Alpha (0–6 months)

> **Stamp**: 2026-06-03 · **Status**: CANONICAL · **Horizon**: H2 — phase roadmap
> **Reconciled 2026-06-03** to ADR-055/C51 (apex/app split; `pryzm.so` canonical; `pryzm.app` retired; Astro `docs-site` deleted; C19 Site substrate shipped).
> **Window**: 2026-06-01 → 2026-12-31 (~6 months, ~13 sprints of 2 weeks)
> **Authority**: this doc owns **the exhaustive Phase 1 delivery list** — every capability that ships, every contract gap that closes, every typology that lands, every infrastructure piece. Below this doc is [annual-2026.md](./annual-2026.md) (this year's split across quarters) and [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) / Q4.
> **Foundation above**: [vision-2030.md](./vision-2030.md) (5-year vision) → this doc is the first 6 months of that arc.

---

## §1 — Phase 1 exit criteria

Phase 1 closes when **all** of these are simultaneously true:

| # | Criterion | Verification |
|---|---|---|
| **E1** | **3 typologies** shipped to production (apartment + house + small-office) with end-to-end RAC → generate → IFC export | Reference projects in `__fixtures__/typologies/` × 3; nightly playwright run |
| **E2** | **RAC chatbot routing flow** live: user role + typology picker + brief capture | Customer can sign up → complete onboarding → open typology pipeline in < 5 min |
| **E3** | **Plugin SDK published** to npm (`@pryzm/sdk` v1.0.x) | `npm view @pryzm/sdk version` returns 1.0.x; CHANGELOG.md current |
| **E4** | **Headless package published** (`@pryzm/headless` v1.0.0) | `npm view @pryzm/headless version` returns 1.0.0 |
| **E5** | **Marketplace live** at `marketplace.pryzm.so` (DNS + TLS + first 5 PRYZM-first-party plugins listed) | https check; first plugin install end-to-end |
| **E6** | **Apex/app split live** per [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) / [C51](../../02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md): `pryzm.so` apex (static marketing on Cloudflare Pages) + `app.pryzm.so` editor (Fly.io, EU `fra`) | `curl -I https://pryzm.so/` 200 pre-rendered; `curl -I https://app.pryzm.so/` 200 from `fra`; apex→app deep-link resolves |
| **E7** | **Cold-boot NFT** holds at < 2.5 s on M1 + Chrome (`apps/bench/src/benches/cold-boot.bench.ts`) | CI baseline green for 4 consecutive weeks |
| **E8** | **First 50 paying customers** via Solo + Studio PLG (per [go-to-market §2.1](../../01-strategy/go-to-market.md)) | Stripe MRR > $1500 |
| **E9** | **All 21 CI gates** stable for 4 consecutive weeks; no soft-fail tripwires ratchet up | CI dashboard |
| **E10** | **Site substrate v1** shipped per [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) — Site as first-class element | Site shows in inspect tree; saves to .pryzm; round-trips through IFC4X3 `IfcSite` |

Closure is recorded via **ADR-NNN-phase-1-exit-alpha.md** (immutable, raised when E1–E10 hold). Until then this doc is the living plan; the ADR is the gate.

---

## §2 — Phase 1 capability buckets

Every deliverable in Phase 1 traces to one of these 8 buckets:

| # | Bucket | What it covers | Phase 1 weeks (estimated) |
|---|---|---|---|
| **B1** | **Typology Pipeline + 3 typologies** | TypologyPipelineRouter · TypologyRegistry · RAC chatbot · Typology Picker + apartment + house + small-office | ~14 wk |
| **B2** | **Site substrate (C19) + Climate (C21)** | Site as first-class element · plot/parcel/footprint · climate ingestion · EPW + NOAA | ~10 wk |
| **B3** | **Plugin SDK + Marketplace go-live** | npm publish · DNS + TLS · curation queue · first plugins | ~6 wk |
| **B4** | **Family Platform polish + first community packs** | family-marketplace UX · Ed25519 verification UX · first 3 community-authored family packs | ~5 wk |
| **B5** | **Enterprise readiness (compliance + SOC 2 prep)** | C22 PII tier · C23 provenance · C43 accessibility audit prep · C48 backup + DR runbooks | ~9 wk |
| **B6** | **PRYZM brand + apex/app split** | apex/app split per ADR-055/C51 (`pryzm.so` apex + `app.pryzm.so` editor) · landing page from editor `LandingPage.ts` · brand-voice content sweep · pricing page from `@pryzm/entitlements` | ~4 wk |
| **B7** | **IFC + Revit interchange polish** | IFC4X3 Pset coverage gap-fill · Revit IFC variant exporter · 10-project reference suite | ~6 wk |
| **B8** | **Cognition substrate L1–L4 hardening** | Constraint DB expand 248→350 enforced rules · daylight rule-checker · perceptual L5 first slice | ~7 wk |

**Total capacity required**: ~61 weeks of focused engineering across 6 calendar months. With a 6-person team and 70 % focus time, the budget is ~4.2 × 26 = ~109 effective dev-weeks. Buffer is ~80 % utilisation.

---

## §3 — Bucket B1: Typology Pipeline + 3 typologies (~14 wk)

The headline deliverable for Phase 1. Detailed in [typology-expansion-roadmap.md](./typology-expansion-roadmap.md).

### §3.1 — Universal infrastructure (new code, ~6 wk)

| # | Deliverable | Owner code | Weeks | Cites |
|---|---|---|---|---|
| 1.1 | `packages/typology-pipeline/` skeleton + the 7-stage pipeline runner | NEW package | 1.5 | [typology §6](./typology-expansion-roadmap.md) |
| 1.2 | `packages/schemas/src/typology/manifest.ts` — TypologyManifest schema | NEW | 0.5 | [typology §4.1](./typology-expansion-roadmap.md) |
| 1.3 | `TypologyRegistryStore` slot in `composeRuntime()` | extend runtime-composer | 0.5 | [C02](../../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md) |
| 1.4 | `TypologyPipelineRouter.dispatch(typologyId, role, site, brief)` | NEW in typology-pipeline | 1.0 | [typology §4.3](./typology-expansion-roadmap.md) |
| 1.5 | `RACChatbot` UI in `apps/editor/src/ui/onboarding/RACChatbot.tsx` | NEW | 1.0 | [product-vision §5 Step 2](../../01-strategy/product-vision.md) |
| 1.6 | `TypologyPicker` UI with 10-category card grid in `apps/editor/src/ui/onboarding/TypologyPicker.tsx` | NEW | 0.5 | [typology §3](./typology-expansion-roadmap.md) |
| 1.7 | **Author C50 — Typology Pipeline Contract (DRAFT)** | NEW contract | 0.5 | [typology §10](./typology-expansion-roadmap.md) |
| 1.8 | Per-role intent matrix (`intentMatrix.ts`) covering 8 roles × 25 typologies | NEW | 0.5 | [typology §11](./typology-expansion-roadmap.md) |

### §3.2 — Typology 1: Apartment (already shipped — refactor to pack format)

| # | Deliverable | Owner code | Weeks |
|---|---|---|---|
| 1.9 | Refactor existing `apartmentLayout` into `packages/typology-pipeline/src/typologies/apartment/` | refactor | 1.0 |
| 1.10 | Apartment TypologyManifest + program-rules.json + furniture-presets.json | refactor | 0.5 |
| 1.11 | Reference projects × 5 in `__fixtures__/typologies/apartment/` | new fixtures | 0.5 |

### §3.3 — Typology 2: House (single-family) — ~3 wk

| # | Deliverable | Detail |
|---|---|---|
| 1.12 | House `program-rules.json` — 12 room types (entry + living + kitchen + dining + bedrooms 1-4 + bathrooms + WC + utility + garage + garden access) |
| 1.13 | House AI workflow (`packages/ai-host/src/workflows/houseLayout/`) — extends apartment pattern; brief includes: storeys + plot orientation + style preference (contemporary / traditional / vernacular) |
| 1.14 | House deterministic engine D-HOUSE — simpler than apartment (typically 1-3 storeys; less constrained adjacency) |
| 1.15 | House validators — setback compliance · party-wall · garden minimum · daylight |
| 1.16 | 5 reference projects (semi-detached UK · ranch US · row-house EU · standalone JP · townhouse) |
| 1.17 | House intro panel (briefcapture UI) |

### §3.4 — Typology 3: Small office (<50 desks) — ~3 wk

| # | Deliverable | Detail |
|---|---|---|
| 1.18 | Office `program-rules.json` — 8 room types (reception + workstation-area + meeting rooms + private offices + kitchen-tea + WC + storage + breakout) |
| 1.19 | Office AI workflow + deterministic engine D-OFFICE |
| 1.20 | Office validators — desk-spacing per code · WC count per occupancy · accessibility · fire egress |
| 1.21 | 5 reference projects (open-plan tech · enclosed-office traditional · co-working · creative-studio · legal-firm) |
| 1.22 | Office intro panel |

### §3.5 — Acceptance criteria for Bucket B1

- End-to-end test: signup → role pick → typology pick → brief → site → AI generate → 3 layout options → accept → IFC export → re-open → identical model
- ≥ 50 unit tests per typology
- Layout generation < 60s p95 for apartment + house + office
- Apartment regression suite passes 100 %

---

## §4 — Bucket B2: Site substrate (C19) + Climate (C21) (~10 wk)

Per [site-and-cognition-strategy §2.4](../../01-strategy/site-and-cognition-strategy.md). The PG0 work track.

### §4.1 — Site element schemas + stores (~3 wk)

| # | Deliverable | Cites |
|---|---|---|
| 2.1 | `packages/schemas/src/site/` — Site · Parcel · Footprint · ContextBuilding · Setback · ZoningOverlay | [C19 §2](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) |
| 2.2 | `SiteStore` in `packages/stores/` — reactive site state with adjacencies to BuildingStore | [C19 §3](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md) |
| 2.3 | `site.*` commands per C16 — `site.set` / `site.updateParcel` / `site.setContextBuildings` / `site.applyZoning` | [C16](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) |
| 2.4 | `apps/editor/src/ui/site/` — Site authoring UI with the cream/light Cesium aesthetic (per product-vision §5 Step 3) | [product-vision §5](../../01-strategy/product-vision.md) |
| 2.5 | IFC4X3 `IfcSite` round-trip through `plugins/ifc-export/` + `plugins/ifc-import/` | [C25](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) |

### §4.2 — Building + Apartment aggregates (C20) (~3 wk)

| # | Deliverable | Cites |
|---|---|---|
| 2.6 | `packages/schemas/src/aggregates/` — Building · Level · Apartment (formalised; the inspect tree consumes these) | [C20 §2](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) |
| 2.7 | `BuildingStore` + `LevelStore` + `ApartmentStore` refactor to typed aggregates | [C20 §3](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) |
| 2.8 | Inspect tree wiring — Site → Building → Level → Apartment → Room → Element | [C27](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |
| 2.9 | Per-aggregate property panel | [C27 §4](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |

### §4.3 — Climate ingestion (C21) (~4 wk)

| # | Deliverable | Cites |
|---|---|---|
| 2.10 | `packages/climate/` NEW package — EPW parser + NOAA fallback + per-site cache | [C21 §3](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) |
| 2.11 | Climate substrate UI panel showing sun-path + wind-rose + temperature/humidity profiles | [C21 §5](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) |
| 2.12 | AI workflow integration: apartment + house workflows query climate for solar orientation suggestions | [typology §6](./typology-expansion-roadmap.md) |
| 2.13 | EPW file uploader with validation | [C21 §4](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md) |

### §4.4 — Acceptance criteria for Bucket B2

- Site can be authored from plot address → automatic site model generation
- Sun-path correct for any latitude/longitude (validated vs published almanacs at 8 reference cities)
- EPW import 10 reference files round-trip without data loss
- IFC4X3 export carries `IfcSite` + `IfcProjectedCRS` + `IfcGeographicElement`

---

## §5 — Bucket B3: Plugin SDK + Marketplace go-live (~6 wk)

Closes E3, E5, OI-011, OI-013.

| # | Deliverable | Detail |
|---|---|---|
| 3.1 | `pnpm --filter @pryzm/plugin-sdk publish --access public` (OI-011) | 1-day operation; requires npm token + 2FA |
| 3.2 | `pnpm --filter @pryzm/headless publish --access public` (OI-012) | Same |
| 3.3 | DNS `marketplace.pryzm.so` + TLS cert (OI-013) | Cloudflare DNS + LetsEncrypt or commercial cert |
| 3.4 | Marketplace `apps/marketplace/` UX polish — browse + search + filter + detail + install flow | ~2 wk |
| 3.5 | Family Marketplace `apps/marketplace-web/` UX polish | ~1 wk |
| 3.6 | Curation queue back-office (`apps/admin-tools/src/curation/`) — first version | Per [C40 §5.3](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md); ~1 wk |
| 3.7 | First 5 PRYZM-first-party plugins promoted to marketplace (BCF · IFC-Export · DXF · Multiplayer · Cesium-bridge) | Lifecycle: signed + curated + listed |
| 3.8 | Stripe Connect onboarding for developers — `pryzm dev publish` flow end-to-end | ~1 wk |

### §5.1 — Acceptance criteria

- Developer signs up + completes tax-form + publishes first plugin in < 30 minutes (per [platform-strategy §11](../../01-strategy/platform-strategy.md) target)
- Customer installs plugin in < 5 seconds (per NFT target)
- Marketplace catalogue has ≥ 50 artefacts at Phase 1 close (mix of plugins + family packs + typology packs)
- Stripe Connect payout cycle runs once successfully (test mode)

---

## §6 — Bucket B4: Family Platform polish (~5 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.1 | `apps/marketplace-web/` UX: pack detail page · 3D preview · Ed25519 verify badge | [C07 §3](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) |
| 4.2 | `apps/component-editor/` polish: sketcher UX · constraint solver feedback · publishFlow.ts step-by-step | [C07] |
| 4.3 | Family install flow in editor — "Drop family from marketplace" UX | NEW |
| 4.4 | First 3 community-authored family packs published (target: IKEA kitchen system clone · UK door catalogue · JIS-spec window catalogue) | Developer relations |
| 4.5 | Family-pack `.pryzm-family` format documentation + SPEC-FAMILY-FORMAT.md publish | NEW spec |

---

## §7 — Bucket B5: Enterprise readiness (~9 wk)

Phase 1 doesn't ship full Enterprise — but lays the foundation for first Enterprise pilots in Phase 2.

### §7.1 — Privacy + PII tier (C22) (~3 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.1 | `packages/schemas/src/privacy/` — DataTier enum + PIIBridge schema | [C22 §2](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| 5.2 | DSAR export endpoint `/api/v1/dsar/export` — generates user-data archive | [C22 §1.4](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| 5.3 | DSAR erasure endpoint with 90-day SLA tracking | [C22 §1.5](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| 5.4 | `pryzm.so/privacy` page + customer privacy settings UI | [C22 §5](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |

### §7.2 — Provenance (C23) (~2 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.5 | `ai_usage` table extend with provenance fields (model · prompt_hash · context_hash · cost · timestamp · user_id) — already partial | [C23 §2](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |
| 5.6 | Per-AI-artefact provenance graph linking AI calls to produced elements | [C23 §3](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |
| 5.7 | Provenance audit-trail UI in inspect tree (right-click element → "Show AI provenance") | [C23 §5](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) |

### §7.3 — Accessibility audit prep (C43) (~2 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.8 | `packages/a11y/` + announcer service + focus manager wired across editor shell | [C43 §3.1](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 5.9 | `axe-core` CI integration with baseline — all critical/serious violations fixed | [C43 §6](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 5.10 | Keyboard registry covering all tools + cheat-sheet UI | [C43 §1.3](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |
| 5.11 | Color-contrast token sweep | [C43 §1.5](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |

### §7.4 — Backup + DR runbooks (C48) (~2 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.12 | `server/backup/scheduler.ts` — 5-min PG snapshot scheduler | [C48 §3.6](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 5.13 | `server/backup/integrityChecker.ts` — nightly integrity sampling | [C48 §1.9](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 5.14 | Per-failure-mode runbook authoring (DB primary failure, ransomware, accidental delete, regional outage) | [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 5.15 | First DR drill run (simulated PG primary failure) | [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |

---

## §8 — Bucket B6: Brand + apex/app split (~4 wk)

Per [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) / [C51](../../02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md): `pryzm.so` is the canonical apex (static pre-rendered marketing on Cloudflare Pages); `app.pryzm.so` is the editor app (Fly.io, EU `fra`). The old `pryzm.app` cutover is **retired**.

| # | Deliverable | Detail |
|---|---|---|
| 6.1 | `pryzm.so` apex DNS + TLS (Cloudflare Pages) + `app.pryzm.so` → Fly `fra` | Cloudflare + Fly cert (C51 §4) |
| 6.2 | Landing page from the editor's `apps/editor/src/ui/platform/LandingPage.ts` (apex pre-renders the same component source) per [manifesto §5 brand voice](../../01-strategy/manifesto.md) | Curated + plain-spoken + aspirational |
| 6.3 | Pricing page reads live from the entitlement registry (per [C39 §1.13](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) | `apps/editor/src/ui/platform/PricingPage.ts` reads `@pryzm/entitlements`; consumed by both the apex prerender and the in-app router |
| 6.4 | Customer-facing copy sweep — every visible string passes the [manifesto §5 voice filter](../../01-strategy/manifesto.md) | Audit |
| 6.5 | `pryzm.so/manifesto`, `/about`, `/trust`, `/accessibility`, `/supported-browsers`, `/vpat`, `/dr-status`, `/pricing` all live | Marketing |
| 6.6 | `app.pryzm.so` 301-redirects marketing routes (`/pricing`, `/manifesto`, `/trust`) to the `pryzm.so` apex (per C51 §3.2.1) | Edge redirect |

---

## §9 — Bucket B7: IFC + Revit interchange polish (~6 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.1 | IFC4X3 Pset coverage gap-fill — every shipped element type exports its canonical Pset per `Pset_*` standard | [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) |
| 7.2 | `IfcSite` + `IfcSpace` + `IfcZone` + `IfcFurniture` export coverage | [C25 §3](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) |
| 7.3 | Revit IFC4X3-RV variant exporter (the Revit-import-friendly variant) | [C26 §2](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 7.4 | 10-project reference suite for IFC round-trip nightly | [C25 §6](../../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) |
| 7.5 | IFC import progress UI + error reporting | [plugins/ifc-import/] |
| 7.6 | `ifc.export.production` entitlement gate per [C39 §2.5](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) | NEW |

---

## §10 — Bucket B8: Cognition substrate L1–L4 hardening (~7 wk)

| # | Deliverable | Cites |
|---|---|---|
| 8.1 | Constraint DB expansion: 102 of 248 spec rules → 200 of 248 code-enforced | [site-and-cognition §6](../../01-strategy/site-and-cognition-strategy.md) |
| 8.2 | L5 daylight rule-checker (mandatory window per room) | [C21] + apartment-layout |
| 8.3 | L5 perceptual evaluator: corridor width + sightline + room aspect ratio scoring | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 8.4 | L3 semantic-topology expansion: adjacency permission matrix completion + privacy gradient enforcement | [site-and-cognition §3](../../01-strategy/site-and-cognition-strategy.md) |
| 8.5 | Constraint-validation UI: violations highlighted in inspect tree with rule reference | [C27 §5](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) |

---

## §11 — Contract gap closures in Phase 1

Phase 1 closes the following contract gaps (per the C01–C49 suite). Listed by contract, with the specific gap and its work item:

| Contract | Current state | Phase 1 closure | Work item ref |
|---|---|---|---|
| C01 Architecture & Governance | Canonical; minor refresh | Refresh package counts + add C50 (typology pipeline) entry | §3.1.7 |
| C02 Composition Root | Canonical; PryzmRuntime extended | TypologyRegistryStore slot added | §3.1.3 |
| C03 Schemas + Commands | Canonical | No change | — |
| C04 Rendering | Canonical | No change | — |
| C05 Persistence + File Format | Canonical | C47 versioning compliance added | §5.4 (parallel) |
| C06 UI Shell | Canonical | RACChatbot + TypologyPicker added | §3.1.5–6 |
| C07 Plugin SDK + Marketplace | v1.0.0 ready; manual publish pending | npm publish (OI-011) + DNS (OI-013) closure | §5.1, §5.3 |
| C08 Collab + Security | Canonical | No change | — |
| C09 AI + Visibility Intent | Canonical | TypologyPipelineRouter routes through AiPlane | §3.1.4 |
| C10 Perf + Observability | Canonical | New benches: typology-pipeline · site-load · climate-load | §8.5 (extend) |
| C11 Element Creation | Canonical | Per-typology pipelines emit per C11 | §3 |
| C12 Geospatial | Canonical | Site substrate (C19) extends C12 with first-class Site element | §4.1 |
| C13 Project Lifecycle | Canonical | No change | — |
| C14 Legacy Elimination | Canonical | Continue cast-count ratchet to 0; one more sweep | continuous |
| C15 Hosted Elements | Canonical | No change | — |
| C16 Command Authoring | Canonical | site.* + typology.* commands authored per C16 | §3, §4 |
| C17 Batch Creation Catalogue | Canonical | Per-typology batch entries (e.g. "house.batch.create-from-brief") | §3.3–4 |
| C18 Element Preview Visual | Canonical | No change | — |
| **C19 Site Model & Parcel** | Substrate **SHIPPED** — `SiteModelStore` + `ParcelBoundarySchema` + `site.create`/`site.setParcelBoundary` wired into `composeRuntime` (A.7.a/b/c.1) | Ratify CANONICAL; remaining gap is the L5 dispatch adapter + GIS UI (see [PIPELINE-RAC-TO-SITE-TO-DESIGN](./PIPELINE-RAC-TO-SITE-TO-DESIGN-2026-06-03.md)) | §4.1 |
| **C20 Building + Apartment Aggregates** | DRAFT | **CANONICAL** (ratify on §4.2 ship) | §4.2 |
| **C21 Climate Ingestion** | DRAFT | **CANONICAL** (ratify on §4.3 ship) | §4.3 |
| **C22 Privacy + PII Tier** | DRAFT | Partial ratification — DSAR endpoints + tier surface live | §7.1 |
| **C23 Provenance + AI Audit** | DRAFT | Partial ratification — provenance graph + UI live | §7.2 |
| C24 Sheet Composition Engine | DRAFT | No Phase 1 work (Phase 2) | — |
| C25 IFC Export Production | DRAFT | Partial — Pset coverage gap-fill | §9.1–2 |
| C26 Revit Round-Trip | DRAFT | Partial — IFC4X3-RV variant | §9.3 |
| C27 BIM 3.0 Inspect | DRAFT | Partial — Site/Building/Apartment aggregates wired | §4.2.8 |
| C28 Data Panel | DRAFT | No Phase 1 work (Phase 2) | — |
| C29 PDF Vector Export | DRAFT | No Phase 1 work (Phase 2) | — |
| C30 Drawing Set | DRAFT | No Phase 1 work (Phase 2) | — |
| C31 Documentation Authoring | DRAFT | Ratify on doc-system stability (Phase 1 close) | continuous |
| C32 DXF/DWG | DRAFT | No Phase 1 work (Phase 3) | — |
| C33 Rhino | DRAFT | No Phase 1 work (Phase 3) | — |
| C34 Print + Drawing Standards | DRAFT | No Phase 1 work (Phase 2) | — |
| C35 COBie | DRAFT | No Phase 1 work (Phase 3) | — |
| C36 Clash Detection | DRAFT | No Phase 1 work (Phase 2) | — |
| C37 Schedule 4D | DRAFT | No Phase 1 work (Phase 3) | — |
| C38 Cost 5D | DRAFT | No Phase 1 work (Phase 3) | — |
| C39 Pricing + Plan Tiers | DRAFT | Partial — entitlement registry + Solo/Studio/Mid-firm tiers + pricing page | §8 (parallel) |
| C40 Marketplace Economics | DRAFT | Partial — 70/30 split + payout cycle test | §5.8 |
| C41 Telemetry + Analytics | DRAFT | Partial — consent banner + cookie + first events | §7 (parallel) |
| C42 Customer Support Tier | DRAFT | Partial — support@pryzm.so + 4-channel surface | §8 (parallel) |
| C43 Accessibility | DRAFT | Partial — WCAG 2.2 AA audit prep + axe-core CI green | §7.3 |
| C44 Mobile + Tablet | DRAFT | Partial — surface capability matrix + share-link viewer | §8 (parallel) |
| C45 Browser + Device Matrix | DRAFT | Partial — Tier 1 browser support live | §8 (parallel) |
| C46 i18n + L10n | DRAFT | Partial — en-US + en-GB messages bundle | §8 (parallel) |
| C47 File-Format Versioning | DRAFT | Partial — formatVersion field + writer signature | §5 (parallel) |
| C48 Backup + DR | DRAFT | Partial — runbooks + first DR drill | §7.4 |
| C49 Multi-Region | DRAFT | No Phase 1 work (Phase 3 — region launches) | — |
| **C50 Typology Pipeline** | NEW (this phase) | DRAFT authored + first 3 typology packs live | §3.1.7 |
| **C51 Apex/App Deployment Split** | CANONICAL (normative form of [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md)) — `pryzm.so` apex + `app.pryzm.so` editor; DNS map §4 + route table §5 + build contract §6 + CI gates §7 | apex/app split deployed; 5 of 7 §7 gates live | §8 |

**Summary**: 25 contracts touched in Phase 1 (3 to CANONICAL: C19/C20/C21; 11 partial ratifications; 1 NEW DRAFT: C50; 1 NEW CANONICAL: C51). The apex/app split (B6) is governed by [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) + [C51](../../02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md); auth migration by [ADR-056](../../02-decisions/adrs/ADR-056-supabase-auth-migration.md) (Supabase, Phase A.5).

---

## §12 — Roles + capacity per bucket

| Bucket | Lead engineer | Architect-consultant | Designer-engineer | Notes |
|---|---|---|---|---|
| B1 Typology | Engineer 1 | Architect 1 (typology-rules curator) | Designer 1 (RAC + Picker UX) | The hero bucket |
| B2 Site + Climate | Engineer 2 | Architect 2 (site-context expert) | Designer 1 shared | PG0 work |
| B3 SDK + Marketplace | Engineer 3 | — | Designer 2 (marketplace UX) | Plus dev-rel hire |
| B4 Family Platform | Engineer 3 shared | — | Designer 2 shared | Continuation |
| B5 Enterprise readiness | Engineer 4 + 1 part-time security consultant | — | — | Cross-cutting |
| B6 Brand + domain | — | — | Designer 2 + content writer | Marketing-led |
| B7 IFC + Revit polish | Engineer 5 | Architect 1 (BIM standards) | — | |
| B8 Cognition substrate | Engineer 6 + Architect 1 + Architect 2 | | | The asymmetric asset |

Team size required: ~6 engineers + ~2 architect-consultants + ~2 designer-engineers + ~1 dev-rel + ~1 content writer + ~1 security consultant = ~13 people. Per [operating-principles §4.1](../../01-strategy/operating-principles.md), this is a stretch for Year 1; some roles are part-time.

---

## §13 — Risk + dependency register

Key Phase 1 risks (mitigation traces to [risks-and-assumptions §3–§5](../../01-strategy/risks-and-assumptions.md)):

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Typology #2 (house) generative AI quality below threshold | Medium | High (E1 blocked) | Deterministic fallback D-HOUSE is gates of usefulness; AI is the lift |
| R2 | Marketplace cold-start (no developer signs up) | Medium | High (E5 blocked) | First 5 PRYZM-first-party plugins seed; dev-rel team courts 20 invited developers |
| R3 | Site UI (Cesium-light) takes longer than expected | Medium | Medium (E10 deferred) | Phase B fallback: ship with Cesium-default; light theme deferred to Phase 2 |
| R4 | IFC round-trip data loss on house/office geometries | Medium | High (E1 blocked for those typologies) | Nightly regression vs 10 reference projects; per-element Pset audit |
| R5 | Cold-boot regression (NFT-1) | Low | High (E7 blocked) | Per-PR CI bench; rollback any PR that regresses |
| R6 | First Enterprise customer slips to Phase 2 | High | Low (Phase 1 doesn't depend on Enterprise revenue) | Plan-around; Enterprise readiness is Phase 1 foundation, not delivery |
| R7 | C19/C20/C21 contract drafts uncover invariants conflicting with code | Medium | Medium | Per-contract author works alongside engineer; weekly sync |
| R8 | npm publish (OI-011) blocked on account / token issues | Low | High (E3 blocked) | Founder + ops resolve in Q3 week 1; not engineering-blocking |

---

## §14 — Definition of done per bucket

| Bucket | Done means |
|---|---|
| B1 Typology | 3 typologies (apartment + house + office) live; reference projects pass; layout generation < 60 s; NFTs hold |
| B2 Site + Climate | Site authoring end-to-end; EPW + NOAA both ingested; round-trips through IFC; 8 city validation passes |
| B3 SDK + Marketplace | `npm view @pryzm/sdk` returns 1.0.x; `marketplace.pryzm.so` resolves; first plugin install succeeds; first developer payout test runs |
| B4 Family Platform | First 3 community-authored family packs live; component-editor publishes packs end-to-end |
| B5 Enterprise readiness | DSAR export + erasure paths live; provenance graph queryable; axe-core CI green; first DR drill complete |
| B6 Brand + apex/app split | apex/app split live per ADR-055/C51 (`pryzm.so` apex + `app.pryzm.so` editor); landing page + pricing page + all marketing surfaces refreshed |
| B7 IFC + Revit polish | 10-project reference suite passes nightly; IFC4X3-RV variant exports work; PSet coverage 100 % for shipped element types |
| B8 Cognition | 200 of 248 spec rules code-enforced; L5 daylight + perceptual validators live; constraint-violation UI in inspect tree |

---

## §15 — How Phase 1 informs Phase 2

Phase 1 outputs that Phase 2 builds on:

- TypologyPipeline infrastructure → Phase 2 ships 7 more typologies (E1 → E10 typologies)
- C19/C20/C21 canonical → Phase 2 builds L5 (daylight sim full) + L6 (behavioural sim) on the substrate
- SDK + marketplace live → Phase 2 grows from 50 to 500 artefacts; first 100 active developers
- Enterprise readiness foundation → Phase 2 starts first 5 Enterprise pilots
- First 50 paying customers → Phase 2 grows to 500 customers

---

## §16 — Cross-references

| Doc | Relationship |
|---|---|
| [vision-2030.md](./vision-2030.md) | This phase is the first 6 months of the 5-year arc |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | Phase 1 ships the first 3 typologies + the pipeline infrastructure |
| [annual-2026.md](./annual-2026.md) | Phase 1 = 2026 H2 (Jul–Dec) at the yearly horizon |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | Phase 1 first half (Q3) |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | Phase 1 second half (Q4) |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This is H2; quarterly is H4 derivative |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Next phase |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Customer delivery sequence (lags this build sequence by ~2 quarters) |

---

*End — PRYZM Roadmap Phase 1: Alpha, 2026-06-03 (reconciled to ADR-055/C51) — CANONICAL.*
