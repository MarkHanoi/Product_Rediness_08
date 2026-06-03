# PRYZM — Quarterly Plan 2026 Q3 (Jul–Sep 2026)

> **Stamp**: 2026-06-03 · **Status**: CANONICAL · **Horizon**: H4 — quarterly
> **Reconciled 2026-06-03** to ADR-055/C51 (apex/app split; `pryzm.so` canonical; `pryzm.app` retired; C19 Site substrate shipped).
> **Window**: 2026-07-01 → 2026-09-30 (~13 weeks; 6 × 2-week sprints)
> **Authority**: this doc owns **Q3 2026 sprint-by-sprint deliverables**. Updated at each sprint close. Q3 close → Q4 refresh.
> **Foundation above**: [annual-2026.md §2.1](./annual-2026.md) → quarterly is H4 derivative of H3.

---

## §1 — Q3 2026 theme + capacity

**Theme**: **Typology pipeline foundations** + **marketplace go-live** + **apex/app split** (ADR-055/C51). Q3 sets up the infrastructure for Q4's deliverables.

**Sprint cadence**: 6 sprints × 2 weeks, with 1 week buffer mid-quarter.

| Sprint | Window | Capacity (dev-weeks) |
|---|---|---|
| S1 | Jul 1–14 | ~5.5 |
| S2 | Jul 15–28 | ~5.5 |
| S3 | Jul 29 – Aug 11 | ~5.5 |
| S4 | Aug 12–25 | ~5.5 (mid-quarter buffer week embedded) |
| S5 | Aug 26 – Sep 8 | ~5.5 |
| S6 | Sep 9–22 | ~5.5 |
| Buffer / planning | Sep 23–30 | Q4 planning + Q3 retro |

Net Q3 dev-week capacity: ~33 weeks. Q3 work allocation: ~28 dev-weeks committed; ~5 weeks buffer for incidents + customer escalations.

---

## §2 — Q3 epics + owners

| Epic | Engineer | Architect | Designer | Sprints |
|---|---|---|---|---|
| **E1 — TypologyPipeline infrastructure** | Engineer 1 (lead) | Architect 1 | — | S1–S4 |
| **E2 — RAC chatbot + TypologyPicker UI v1** | Engineer 1 (extend) | — | Designer 1 (lead) | S3–S5 |
| **E3 — C19 Site element + UI** | Engineer 2 (lead) | Architect 2 | Designer 1 (Cesium-light) | S1–S5 |
| **E4 — C21 Climate ingestion (EPW + NOAA)** | Engineer 2 (extend) | Architect 2 | — | S3–S6 |
| **E5 — Apartment refactored as TypologyPack** | Engineer 1 (extend) | Architect 1 (rules) | — | S2–S3 |
| **E6 — Marketplace go-live (npm publish + DNS)** | Engineer 3 (lead) + Founder + ops | — | Designer 2 (marketplace UX) | S1–S6 |
| **E7 — Apex/app split (ADR-055/C51), tracked under IP-A5.X** | Engineer 3 (extend) | — | Designer 2 + Marketing | S1–S5 |
| **E8 — C22 PII + C23 provenance partials** | Engineer 4 (lead) | — | — | S4–S6 |
| **E9 — Cognition substrate L1–L4 hardening (50 new rules code-enforced)** | Engineer 6 (lead) | Architect 1 + Architect 2 | — | S2–S6 |
| **E10 — Per-sprint NFT bench maintenance** | All engineers | — | — | continuous |

---

## §3 — Sprint-by-sprint plan

### §3.1 — Sprint 1 (Jul 1–14): Foundations

**Goal**: TypologyPipelineRouter skeleton + Site schemas + marketplace publish kickoff.

| # | Deliverable | Owner | Epic | Cites |
|---|---|---|---|---|
| 1.1 | `packages/typology-pipeline/` package scaffold + `composeRuntime()` slot integration | Engineer 1 | E1 | [Phase 1 §3.1.1–3](./roadmap-phase-1-alpha.md) |
| 1.2 | `packages/schemas/src/typology/manifest.ts` — TypologyManifest schema | Engineer 1 | E1 | [Phase 1 §3.1.2](./roadmap-phase-1-alpha.md) |
| 1.3 | `packages/schemas/src/site/` — Site + Parcel + Footprint + ContextBuilding schemas | Engineer 2 + Architect 2 | E3 | [Phase 1 §4.1.1](./roadmap-phase-1-alpha.md) |
| 1.4 | `SiteStore` in `packages/stores/` skeleton | Engineer 2 | E3 | [Phase 1 §4.1.2](./roadmap-phase-1-alpha.md) |
| 1.5 | `pnpm --filter @pryzm/plugin-sdk publish --access public` (OI-011) | Founder + ops | E6 | [Phase 1 §5.1](./roadmap-phase-1-alpha.md) |
| 1.6 | `pnpm --filter @pryzm/headless publish --access public` (OI-012) | Founder + ops | E6 | [Phase 1 §5.2](./roadmap-phase-1-alpha.md) |
| 1.7 | DNS `marketplace.pryzm.so` provisioned (OI-013) | ops | E6 | [Phase 1 §5.3](./roadmap-phase-1-alpha.md) |
| 1.8 | `pryzm.so` apex (Cloudflare Pages) + `app.pryzm.so` (Fly `fra`) DNS + TLS provisioned per ADR-055/C51 §4 | ops + Marketing | E7 | [Phase 1 §8.1](./roadmap-phase-1-alpha.md) |
| 1.9 | Cognition substrate: identify 50 unblocked rules from spec → code | Engineer 6 + Architect 1 | E9 | [Phase 1 §10.1](./roadmap-phase-1-alpha.md) |

**S1 acceptance**: TypologyPipeline package builds; Site schemas validate; npm publishes successful; DNS resolves; cognition rules identified.

### §3.2 — Sprint 2 (Jul 15–28): Apartment refactor + Site UI + marketplace plugins

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 2.1 | `TypologyRegistryStore` reactive store + slot wiring in PryzmRuntime | Engineer 1 | E1 |
| 2.2 | `TypologyPipelineRouter.dispatch(typologyId, role, site, brief)` first cut | Engineer 1 | E1 |
| 2.3 | Refactor existing apartment workflow into `packages/typology-pipeline/src/typologies/apartment/` | Engineer 1 + Architect 1 | E5 |
| 2.4 | Apartment TypologyManifest + program-rules.json + furniture-presets.json migrated | Engineer 1 + Architect 1 | E5 |
| 2.5 | `site.*` commands per C16 (site.set / site.updateParcel / site.setContextBuildings) | Engineer 2 | E3 |
| 2.6 | `apps/editor/src/ui/site/` Site authoring UI v1 (Cesium-light theme started) | Engineer 2 + Designer 1 | E3 |
| 2.7 | First marketplace plugin published: BCF round-trip | Engineer 3 + Dev-rel | E6 |
| 2.8 | First marketplace plugin published: IFC-Export | Engineer 3 + Dev-rel | E6 |
| 2.9 | C50 typology pipeline contract DRAFT authored | Architect 1 | E1 |
| 2.10 | 12 cognition rules implemented (out of 50 Q3 target) | Engineer 6 | E9 |

**S2 acceptance**: Apartment runs end-to-end via TypologyPipelineRouter (regression against pre-refactor); Site UI renders plot from address; marketplace has 2 plugins.

### §3.3 — Sprint 3 (Jul 29 – Aug 11): RAC chatbot + Climate + 3 more plugins

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 3.1 | `apps/editor/src/ui/onboarding/RACChatbot.tsx` first cut (role + typology + brief flow) | Engineer 1 + Designer 1 | E2 |
| 3.2 | `apps/editor/src/ui/onboarding/TypologyPicker.tsx` 10-category card grid | Engineer 1 + Designer 1 | E2 |
| 3.3 | IFC4X3 `IfcSite` round-trip via `plugins/ifc-export/` + `plugins/ifc-import/` | Engineer 2 + Engineer 5 | E3 |
| 3.4 | `packages/climate/` NEW package scaffold + EPW parser | Engineer 2 | E4 |
| 3.5 | 3 more marketplace plugins published: DXF · Multiplayer · Cesium-bridge | Engineer 3 + Dev-rel | E6 |
| 3.6 | Marketplace UX polish — browse + filter + detail + install flow | Engineer 3 + Designer 2 | E6 |
| 3.7 | `pryzm.so/manifesto` + `/about` + `/trust` + `/pricing` apex pages live | Designer 2 + Marketing | E7 |
| 3.8 | Pricing page reads live from the entitlement registry (`@pryzm/entitlements` via `apps/editor/src/ui/platform/PricingPage.ts`) | Designer 2 + Engineer 4 | E7 |
| 3.9 | 12 more cognition rules implemented (total Q3 progress: 24/50) | Engineer 6 | E9 |

**S3 acceptance**: RAC chatbot live in editor; TypologyPicker shows 10 categories; climate EPW parses 10 reference files; 5 marketplace plugins live; pricing page generator working.

### §3.4 — Sprint 4 (Aug 12–25): Pipeline router complete + Climate integration + PII

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 4.1 | TypologyPipelineRouter full implementation — 7-stage pipeline (S1–S7 per typology-expansion §6) | Engineer 1 | E1 |
| 4.2 | Per-role intent matrix (`intentMatrix.ts`) — 8 roles × 25 typologies | Engineer 1 + Architect 1 | E1 |
| 4.3 | RAC chatbot full integration with TypologyPipelineRouter | Engineer 1 + Designer 1 | E2 |
| 4.4 | Cesium-light theme final polish (cream/warm-white map aesthetic per product-vision §5 Step 3) | Designer 1 + Engineer 2 | E3 |
| 4.5 | NOAA climate fallback in `packages/climate/` | Engineer 2 | E4 |
| 4.6 | Climate substrate UI panel (sun-path + wind-rose + temperature/humidity profiles) | Engineer 2 + Designer 1 | E4 |
| 4.7 | `packages/schemas/src/privacy/` DataTier enum + PIIBridge schema | Engineer 4 | E8 |
| 4.8 | DSAR export endpoint `/api/v1/dsar/export` first cut | Engineer 4 | E8 |
| 4.9 | 12 more cognition rules (total: 36/50) | Engineer 6 | E9 |
| 4.10 | Apartment + house mock-up reference projects (placeholder; full house typology in Q4) | Engineer 1 + Architect 1 | E1 |

**S4 acceptance**: TypologyPipelineRouter fully routes apartment end-to-end; RAC chatbot + Picker integrated; Climate ingestion live; DSAR export endpoint live.

### §3.5 — Sprint 5 (Aug 26 – Sep 8): C19 ratification + content sweep

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 5.1 | C19 Site Model & Parcel — **CANONICAL ratification** (the substrate already SHIPPED — `SiteModelStore` + `ParcelBoundarySchema` + `site.create`/`site.setParcelBoundary` wired into `composeRuntime`, A.7.a/b/c.1; ratification is the remaining step) | Architect 2 + Architect 1 | E3 |
| 5.2 | C21 Climate Ingestion — **CANONICAL ratification** (move from DRAFT) | Architect 2 | E4 |
| 5.3 | Apartment-as-Typology-Pack regression suite (50+ tests) | Engineer 1 | E5 |
| 5.4 | AI workflow integration: apartment workflow queries climate for solar orientation | Engineer 1 + Engineer 2 | E4 |
| 5.5 | Marketplace API for partners — initial REST surface | Engineer 3 | E6 |
| 5.6 | Brand-voice content sweep — every customer-facing string audited against manifesto §5 | Designer 2 + Marketing | E7 |
| 5.7 | `app.pryzm.so` → `pryzm.so` apex 301-redirect live for marketing routes (`/pricing`, `/manifesto`, `/trust`) per C51 §3.2.1 | ops + Marketing | E7 |
| 5.8 | DSAR erasure endpoint with 90-day SLA tracking | Engineer 4 | E8 |
| 5.9 | `ai_usage` table extend with provenance fields (model + prompt_hash + context_hash + cost) | Engineer 4 | E8 |
| 5.10 | 8 more cognition rules (total: 44/50) | Engineer 6 | E9 |

**S5 acceptance**: C19 + C21 ratified CANONICAL; apex/app split live (ADR-055/C51); brand voice consistent; DSAR endpoints live.

### §3.6 — Sprint 6 (Sep 9–22): Q3 close

| # | Deliverable | Owner | Epic |
|---|---|---|---|
| 6.1 | First customer end-to-end test: signup → RAC → Apartment → IFC export | Engineer 1 + Designer 1 | E1, E2 |
| 6.2 | C50 typology pipeline contract — partial ratification (CANONICAL after typology #2 ships in Q4) | Architect 1 | E1 |
| 6.3 | Climate substrate validated against 8 reference cities (sun-path accuracy) | Engineer 2 + Architect 2 | E4 |
| 6.4 | Marketplace dashboard for developers — analytics view | Engineer 3 + Designer 2 | E6 |
| 6.5 | Provenance graph UI in inspect tree (right-click → "Show AI provenance") | Engineer 4 + Designer 1 | E8 |
| 6.6 | First 10 paying customers acquired | Marketing + product | E1+E2+ |
| 6.7 | 6 more cognition rules (total: 50/50 — Q3 target hit) | Engineer 6 | E9 |
| 6.8 | Q3 retro + Q4 planning kickoff | Founder + all leads | — |

**S6 acceptance + Q3 close**:
- Apartment lives as TypologyPack
- RAC chatbot end-to-end live
- Site + Climate substrate live + IFC4X3 round-trip
- C19 + C21 + (C20 partial) ratified
- Marketplace 5+ plugins live; first analytics
- 50 of 248 spec rules → 50 (additional) → total 152 enforced (62%)
- First 10 paying customers acquired
- Phase 1 Q3 work-items closed; Q4 plan ratified

---

## §4 — Q3 NFT commitments

Per [annual-2026 §7](./annual-2026.md):

| NFT | Q3 target | Verification |
|---|---|---|
| Cold-boot to first paint | < 2.5 s on M1 + Chrome | `apps/bench/src/benches/cold-boot.bench.ts` CI baseline |
| Apartment layout generation | < 60 s end-to-end | `apartment-generation.bench.ts` |
| TypologyPipelineRouter dispatch | < 100 ms | new bench `typology-pipeline-dispatch.bench.ts` |
| Site authoring cold-load | < 1.5 s | new bench `site-authoring-cold.bench.ts` |
| Climate EPW parse (10 MB file) | < 2 s | new bench `climate-epw-parse.bench.ts` |
| Marketplace plugin install | < 10 s | new bench `marketplace-install.bench.ts` |
| Frame budget (60 fps interactive) | maintained | `frame-budget.bench.ts` |

Any sustained regression on these benchmarks blocks merge.

---

## §5 — Q3 dependencies + risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | npm publish (OI-011) blocked on account/token | Low | High (S1 stalls) | Founder + ops resolve in S1 week 1; backup plan: publish from CI |
| R2 | DNS marketplace.pryzm.so delays | Low | High | Cloudflare DNS provisioned in advance; cert via LetsEncrypt or commercial |
| R3 | TypologyPipelineRouter design changes require apartment-regression rerun | Medium | Medium | Refactor apartment FIRST (S2-S3); router refactor SECOND (S4) |
| R4 | Site UI Cesium-light theme takes longer than planned | Medium | Medium | Fallback: ship S4 with default theme; light-theme polish in Q4 |
| R5 | C19/C21 contracts uncover schema gaps during ratification | Medium | Medium | Pre-ratification review by architect-consultant + engineer pair in S2 |
| R6 | Cognition rule pace below 50/quarter target | Medium | Low | Pre-categorise rules into trivial / medium / hard; trivial in S1-S3 first |
| R7 | First customer acquisition slow (< 10 by S6) | Medium | Low | Phase 1 doesn't depend on it; Q4 acquisition pace target separate |

---

## §6 — Q3 → Q4 handoff

Per [annual-2026 §2.2](./annual-2026.md), Q4 picks up:

| Q4 priority | Q3 prerequisite | Status target by Q3 close |
|---|---|---|
| House typology ship | TypologyPipelineRouter + Apartment-as-pack | ✅ ready by S4 |
| Office typology ship | Same | ✅ ready by S4 |
| C20 Aggregates ratify | C19 + Site element in scene | ✅ partial by S5; full Q4 |
| IFC + Revit polish | IFC4X3 IfcSite round-trip | ✅ Q3 baseline |
| WCAG audit prep | C43 a11y foundation | ✅ axe-core CI baseline |

---

## §7 — Cross-references

| Doc | Relationship |
|---|---|
| [annual-2026.md §2.1](./annual-2026.md) | Q3 is part of H2 2026 |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Q3 delivers first half of Phase 1 deliverables |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | TypologyPipeline foundation = Q3 |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | Successor |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This is H4; sprint docs are H5 derivatives |

---

*End — PRYZM Quarterly Plan 2026 Q3, 2026-06-03 (reconciled to ADR-055/C51) — CANONICAL.*
