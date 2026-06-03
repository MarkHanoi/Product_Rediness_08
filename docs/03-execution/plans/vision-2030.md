# PRYZM — Implementation Vision 2030

> **Stamp**: 2026-06-03 · **Status**: CANONICAL · **Horizon**: H1 — 5-year
> **Reconciled 2026-06-03** to ADR-055/C51 (contract count refreshed to 51).
> **Authority**: this doc owns **the 5-year capability vision** — what PRYZM looks like in 2030. It is the longest-arc planning doc in the system. Update yearly (or on a major strategic pivot per [risks-and-assumptions.md](../../01-strategy/risks-and-assumptions.md)).
> **Foundation above**: [manifesto.md](../../01-strategy/manifesto.md) · [product-vision.md](../../01-strategy/product-vision.md) · [positioning.md](../../01-strategy/positioning.md)
> **Downstream**: [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) (Phase 1) · [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) (Phase 2) · [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) (Phase 3)

---

## §1 — The 2030 picture

By **end of 2030** (4.5 years from now), PRYZM is:

- The default **design intelligence platform** for the global architectural mid-market — used by **~10,000 paying architects** across ~1,500 firms in 30+ countries
- A **two-sided platform**: ~10,000 customer architects on the demand side; ~500 active marketplace developers on the supply side
- A **multi-typology** product covering **25+ PRYZM-curated typologies** (residential, workplace, retail, healthcare, education, sports, civic, industrial, transport, specialist) + the long-tail community-authored marketplace
- A **cognition substrate** spanning the 7-layer stack from environment to typology priors — meaning every PRYZM-shipped model carries the substrate's structured knowledge, not just geometry
- A **sovereign-default** infrastructure: EU customers in EU; US in US; AP in AP; UK in UK. Multi-region BYOK for Enterprise
- An **interchange platform**: lossless IFC4X3 round-trip with Revit; BCF round-trip with Solibri / Navisworks / BIMcollab; DWG / DXF / Rhino / COBie / PDF/A-3 / FBX export
- An **enterprise-readiness** posture: WCAG 2.2 AA + SOC 2 Type II + ISO 19650 phase compliance + GDPR / CCPA / APPI

PRYZM is **not** the dominant BIM tool — that title still belongs to Revit at year 4 (Autodesk's installed base is decades-deep). PRYZM is the **dominant front-end** for *new design work*: architects start in PRYZM, hand off to Revit/Archicad consultants if their office requires it, and increasingly stay in PRYZM through to drawing production.

---

## §2 — The five-year capability themes

The themes that define what gets built, in priority order:

### T1 — Universal generative-AI design layer (the multi-typology vision)

By 2030, **every architectural typology** an SME firm encounters has a PRYZM pipeline:

- 25+ PRYZM-first-party typologies (per [typology-expansion-roadmap.md §5](./typology-expansion-roadmap.md))
- ~200 community-authored typology packs covering long-tail (museum, prison, embassy, observatory, cleanroom, etc.)
- Per-typology AI workflow + deterministic fallback + per-jurisdiction regulatory overlay
- The RAC chatbot routing pattern is **the** way users start a project

This is the headline differentiator vs Revit / Archicad. Their tools support all typologies via generic modelling; PRYZM supports them via **typology-aware AI pipelines that know the rules + the conventions + the validators**.

### T2 — Cognition substrate maturity

The 7-layer cognition stack (per [site-and-cognition-strategy.md §3](../../01-strategy/site-and-cognition-strategy.md)) is **fully implemented**:

| Layer | 2030 state |
|---|---|
| L1 Environmental | Site + climate + terrain + context-building + regulatory all first-class (per [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C21](../../02-decisions/contracts/C21-CLIMATE-INGESTION.md)) |
| L2 Spatial hierarchy | Site → Building → Level → Apartment/Room → Element fully formalised (per [C20](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md), [C27](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md)) |
| L3 Semantic topology | All 248 constraint-DB rules code-enforced (vs ~40 % today); adjacency + privacy + accessibility universally validated |
| L4 Compositional geometry | All 14+ element types + 50+ family categories shipping |
| L5 Perceptual simulation | Daylight + acoustic + sightline + thermal-comfort all live |
| L6 Behavioural simulation | Pedestrian flow + occupancy + emergency egress simulation |
| L7 Typology priors | All 25 + community typology packs operational |

The substrate is a **published API**. Third parties query "what does PRYZM know about this site/building/room?" and consume the structured output — making PRYZM the canonical *structured-knowledge layer* for AEC AI applications worldwide.

### T3 — Enterprise + sovereignty maturity

PRYZM passes the procurement bar for:

- **Government** (UK Cabinet Office · US GSA · EU Member State design procurement) via [C49 sovereignty](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) + [C22 PII](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + ISO 19650 / EN 301 549 / Section 508 compliance
- **Healthcare estates** (NHS England, HCA, regional US healthcare systems) via [C35 COBie](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) + HIPAA-adjacent privacy (separate from healthcare-record HIPAA — facilities)
- **Defence + intelligence** (limited offering — self-host required per [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md))
- **Education** (large public + private university estates) via [C30 drawing sets](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) + [C35 COBie](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md)
- **Top 100 architectural firms globally** (Foster + Partners, Gensler, NBBJ, Heatherwick, BIG, MVRDV, Snøhetta, etc.) via federated clash + Revit round-trip + custom plug-ins

The **multi-region** topology is live: 4 production regions (EU Frankfurt + US Virginia + AP Tokyo + UK London) + same-sovereignty secondaries.

### T4 — Two-sided platform flywheel

The marketplace (per [platform-strategy.md](../../01-strategy/platform-strategy.md)) is the structural moat. By 2030:

- ~2,000 published artefacts (plugins + family packs + typology packs + pricing catalogues + drawing-standard packs + locale packs + rules packs)
- ~500 active developers earning > $500/month (top decile > $80,000/year per [platform-strategy §11](../../01-strategy/platform-strategy.md))
- 30 % of PRYZM revenue from marketplace-adjacent products (premium tier features that gate marketplace usage; featured placements; revenue share)
- **Marketplace = the moat** — Autodesk + Archicad cannot replicate this without rebuilding their substrate

### T5 — Honest performance at scale

The 17 headline NFTs (per [engineering-vision §5](../../01-strategy/engineering-vision.md)) hold at 10× the 2026 scale:

| NFT | 2026 target | 2030 target |
|---|---|---|
| Cold-boot | < 2.5 s | < 1.5 s (WebGPU + better caching) |
| 10k-element load | < 6 s p95 | < 3 s p95 |
| Concurrent CRDT users per project | 2 | 25 |
| Max project size | 10k elements | 500k elements (large-firm projects) |
| Cross-region latency (EU customer in JP) | n/a | < 200 ms p95 |
| Marketplace plugin install | n/a | < 5 s end-to-end |

68 benchmarks today; **200+ benchmarks by 2030** (as new features add baselines).

---

## §3 — The seven strategic bets

These are the named bets. Failure of any of them re-shapes the strategy (per [risks-and-assumptions.md §2](../../01-strategy/risks-and-assumptions.md)).

| # | Bet | What it asserts | What success looks like in 2030 |
|---|---|---|---|
| **B1** | LLM-routed design assistance scales | Claude / GPT (and successors) handle multi-typology design briefing reliably enough to ship as a paid feature | 90%+ acceptance rate of AI-suggested layouts in customer projects; <1% catastrophic-failure rate on typology pipelines |
| **B2** | Browser-native BIM is performant enough | WebGL2 + WebGPU + 60fps with 500k elements at desktop class | NFT-2 holds at 500k-element load < 30 s p95; NFT-4 holds at 60fps |
| **B3** | The architect-and-consultant ecosystem accepts a new front-end | Architects use PRYZM for design + hand off via IFC to Revit consultants | IFC round-trip data-integrity > 99% on 100-project reference suite; > 50 % of Top-100 firm customers use PRYZM for at least 1 project type |
| **B4** | CRDT collaboration at design fidelity | Yjs (or successor) handles 25 concurrent editors per project without silent loss | NFT-7 holds at 25 users; explicit-conflict UX is the customer-perceived gold standard |
| **B5** | Two-sided platform thesis | Marketplace flywheel compounds; community supply matches PRYZM-first-party | ~500 active developers; 30 % rev from marketplace; > 60 % of customers install ≥ 5 marketplace artefacts |
| **B6** | Constraint database asymmetry | 248 rules (today) → 1500+ rules (2030); fully code-enforced; per-jurisdiction variants | All 7 cognition layers operational; competitors quote PRYZM as the structured-knowledge benchmark |
| **B7** | Sovereignty + compliance posture wins enterprise | EU + US + AP + UK regions live; BYOK; SOC 2 + ISO 19650 + WCAG 2.2 AA + GDPR | Top 5 government procurement wins; top 100 firm penetration > 30 % |

---

## §4 — What is NOT in scope by 2030

We will not have built:

- **A construction-phase tool** (per [engineering-vision §8](../../01-strategy/engineering-vision.md)). Procore / PlanGrid own that market. PRYZM exports COBie + IFC + drawing sets; the construction side consumes.
- **A facility-management primary tool**. Archibus / Maximo own that. PRYZM exports the asset register; FM tools consume.
- **A 4D scheduling / 5D cost primary tool**. Synchro / Asta / CostX own those. PRYZM exports per [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md) + [C38](../../02-decisions/contracts/C38-COST-5D.md).
- **A structural analysis solver**. Tekla / ETABS / SAP own that. PRYZM round-trips via IFC.
- **Photoreal rendering**. V-Ray / Twinmotion / Enscape / Lumion own that. PRYZM round-trips via export.
- **PDF-to-BIM as a primary on-ramp**. The marketplace authors this for the customers who need it.
- **Native desktop / mobile applications**. Browser-only per [C44](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) + [C45](../../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md). PWA install is the closest we ship.
- **A consumer / homeowner-only tool**. We serve C1 (Solo) which includes some self-builders but the brand voice is professional.

The discipline of saying no is the same as Year 1 (per [positioning §6](../../01-strategy/positioning.md)). Not all of these change in 5 years.

---

## §5 — The shape of the company in 2030

| Dimension | 2026 (today) | 2030 target |
|---|---|---|
| Team size | ~6 people (year 1) | ~120 people |
| Paying customers | ~50 | ~10,000 |
| ARR | trial-phase | ~$80M |
| NRR (12-mo) | n/a (early) | > 130 % |
| Regions live | 1 (US default) | 4 (EU + US + AP + UK) |
| TIER 1 locales | en-US, en-GB | en-US, en-GB, de-DE, fr-FR, ja-JP, es-ES, pt-BR, zh-CN |
| Typologies (PRYZM-first-party) | 1 (apartment) | 25+ |
| Marketplace artefacts | ~50 | ~2,000 |
| Active marketplace developers | ~20 | ~500 |
| Plugin SDK NPM version | v1.0.0 (pending publish) | v3.x stable |
| Enterprise customers | 0–2 | ~80 |

Capital + ownership structure: organic growth path (per [operating-principles §10](../../01-strategy/operating-principles.md) — no M&A; no fundraising on a calendar). Series A + Series B by 2028; Series C optional by 2030.

---

## §6 — Phase mapping to capability themes

Each theme maps to phase delivery:

| Theme | Phase 1 (0–6 mo) | Phase 2 (6–18 mo) | Phase 3 (18–36 mo) | Phase 4 (36 mo+) |
|---|---|---|---|---|
| **T1 Universal typology AI** | TypologyPipelineRouter + 3 typologies | 10 typologies + curated marketplace | 25 typologies + community marketplace mature | Long-tail community-authored expansion |
| **T2 Cognition substrate** | Site (C19) + climate (C21) substrate complete; L1–L4 mature | L5 daylight + acoustic; partial L7 typology priors | L6 behavioural sim; cognition API published | Substrate as published research / benchmark |
| **T3 Enterprise + sovereignty** | Solo + Studio + Mid-firm tiers; basic Enterprise pilots | First 5 Enterprise customers; SOC 2 audit | Multi-region live; 30+ Enterprise customers; ISO 19650 | Government procurement; defence-self-host |
| **T4 Marketplace flywheel** | SDK publish + marketplace DNS; first 20 developers | 100+ developers; 500 artefacts | 200+ active developers; 30% revenue | 500 developers; ecosystem moat established |
| **T5 Honest performance at scale** | 68 benches stable; 17 NFTs hold | NFTs hold at 5× scale | NFTs hold at 10× scale; new benches for new capabilities | 200+ benches; performance is brand-defining |

Detailed phase plans: [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) · [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) · [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md).

---

## §7 — Trade-offs the vision commits to

Strategy is what you say no to. The major trade-offs the 2030 vision commits to:

| We say YES to | We say NO to |
|---|---|
| Multi-typology breadth | Deep specialisation in any single typology (no PRYZM-Hospital-Specialist) |
| Browser-native | Native desktop / native mobile / Windows-only |
| Open file format + IFC round-trip | Lock-in moats; vendor-specific formats |
| Marketplace ecosystem | Building every feature in-house |
| Sovereignty + per-region | Single global region for simplicity |
| Curated quality | Marketplace volume at expense of quality |
| Architect-first product | Generic-AEC product that's mediocre for everyone |
| Honest perf + accessibility | Marketing-grade demo numbers + ship-with-aspirational compliance |
| Slow team growth (per [operating-principles O8](../../01-strategy/operating-principles.md)) | VC-financialised hyper-growth team that dilutes the bar |
| Revenue from architect subscriptions + marketplace | Acquisition-funded GMV growth at unit-economics expense |

These trade-offs are visible in every phase plan; every backlog item is reviewed against them.

---

## §8 — The single failure scenario this vision rejects

The vision rejects one failure mode explicitly: **becoming a generic browser-BIM editor with AI features bolted on, competing on price**.

A team that built browser-native BIM + collaboration + AI without the contracts + substrate + typology pipeline + marketplace would land in that bucket. The category is crowded with attempts (Motif, Qonic, Pascal, an Autodesk-acquired startup). The differentiator must be the **substrate × marketplace × multi-typology × honest-performance × sovereignty** combination — none in isolation; all in concert.

Per [positioning §4.4](../../01-strategy/positioning.md) — we do NOT defend on geometry-kernel sophistication, viewport polish, or single-feature differentiation. The 5-year vision is the *combination* moat compounding.

---

## §9 — When this doc updates

Trigger conditions:

- **Annual yearly review** — once per calendar year (typically January); the team re-reads + revises
- **Strategic pivot** — if a [risks-and-assumptions §2](../../01-strategy/risks-and-assumptions.md) "core thesis bet" is partly invalidated → emergency rewrite + ADR
- **Acquisition or major partnership** — if PRYZM acquires a competitor or signs a strategic partnership materially changing market position
- **Regulatory shift** — if a new compliance regime (EU AI Act extension, ISO 19650-3 mandatory, etc.) materially changes the enterprise gate

The doc is **PR'd + reviewed** by the founder + the senior engineering team + the head of product + the head of sales. Customers don't see this version; they see the [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) externalised version.

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](../../01-strategy/manifesto.md) | The brand voice this vision honours |
| [product-vision.md](../../01-strategy/product-vision.md) | Product north star + user journey |
| [positioning.md](../../01-strategy/positioning.md) | Competitive landscape + moats this vision sustains |
| [platform-strategy.md](../../01-strategy/platform-strategy.md) | Marketplace flywheel — T4 |
| [site-and-cognition-strategy.md](../../01-strategy/site-and-cognition-strategy.md) | Cognition substrate — T2 |
| [risks-and-assumptions.md](../../01-strategy/risks-and-assumptions.md) | Bets B1–B7 traceable to risk register |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This doc is H1; phase roadmaps are H2 derivatives |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | T1 detailed |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Phase 1 derivative |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Phase 2 derivative |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Phase 3 derivative |
| [../../02-decisions/contracts/README.md](../../02-decisions/contracts/README.md) | 51 binding contracts the vision conforms to (C01–C51; C51 = apex/app split per ADR-055) |

---

*End — PRYZM Implementation Vision 2030, 2026-06-03 (reconciled to ADR-055/C51) — CANONICAL.*
