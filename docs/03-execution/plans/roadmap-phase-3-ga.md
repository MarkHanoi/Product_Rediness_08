# PRYZM — Roadmap Phase 3: GA + post-GA (18–36 months)

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Horizon**: H2 — phase roadmap
> **Window**: 2028-07-01 → 2029-12-31 (~18 months — months 19–36 from now)
> **Authority**: this doc owns **the Phase 3 delivery list** — GA launch + multi-region full + 25 typologies + cognition substrate L5/L6/L7 complete + enterprise scale (30+ customers, ~$10M ARR target).
> **Foundation above**: [vision-2030.md](./vision-2030.md) themes T1–T5 → Phase 3 is months 19–36 of the 5-year arc.

---

## §1 — Phase 3 exit criteria

Phase 3 closes when **all** of these hold:

| # | Criterion | Verification |
|---|---|---|
| **E1** | **25 typologies** shipped (per [typology-expansion §5](./typology-expansion-roadmap.md)) | Reference projects × 5 per typology; nightly playwright |
| **E2** | **4 regions live** (EU + US + AP + UK) per [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) — same-sovereignty failover tested in each | Quarterly DR drills passing |
| **E3** | **30+ Enterprise customers** (per [personas C4](../../01-strategy/personas.md)) | Stripe MRR Enterprise tier > $500,000 |
| **E4** | **5,000 paying customers** total | Stripe MRR > $300,000 |
| **E5** | **200 active marketplace developers** + **2,000 artefacts** | Marketplace dashboard |
| **E6** | **30 % of revenue from marketplace-adjacent products** | Finance dashboard |
| **E7** | **L6 behavioural simulation** live (pedestrian flow + occupancy patterns) | First customer demo in 5 typologies |
| **E8** | **Revit round-trip** fully production-grade per [C26](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) | Round-trip test against 100 reference projects |
| **E9** | **DXF/DWG + Rhino + COBie + Schedule (4D) + Cost (5D)** all canonical and shipping per C32/C33/C35/C37/C38 | Per-contract test suites green |
| **E10** | **Cognition substrate API published** — third parties query "what does PRYZM know about this site/building/room?" via documented REST | Public API doc; first 3 external consumers |
| **E11** | **ISO 19650 Phase 2 + Phase 3 compliance** (production-phase + completion-phase BIM coordination) | Audit pass |
| **E12** | **TIER 1 i18n** complete for 5 locales (en-US, en-GB, de-DE, fr-FR, ja-JP) + TIER 2 for 3 (es-ES, pt-BR, zh-CN) | [C46](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |

Closure recorded via **ADR-NNN-phase-3-exit-ga.md** (immutable).

---

## §2 — Phase 3 capability buckets

| # | Bucket | Weeks |
|---|---|---|
| **B1** | **15 more typologies (school, library, hotel, hospital, warehouse, care-home, spa, vet, day-care, university, supermarket, distribution-centre, data-centre, restaurant evolution, shop evolution)** | ~110 wk |
| **B2** | **US + AP + UK region launches** per C49 | ~30 wk |
| **B3** | **Cognition substrate L6 + L7 maturity** | ~25 wk |
| **B4** | **Revit round-trip full** (C26) — RVT/RFA via IFC4 + optional Python adapter | ~20 wk |
| **B5** | **DXF/DWG (C32) + Rhino (C33) + COBie (C35) + Schedule 4D (C37) + Cost 5D (C38)** | ~50 wk |
| **B6** | **Marketplace ecosystem maturity** — 200 developers, 2000 artefacts, plugin author conference | ~15 wk + ongoing |
| **B7** | **Enterprise scale** — 30+ Enterprise customers; ISO 19650 Phase 2/3 audits; SOC 2 Type II annual | ~30 wk + sales staff |
| **B8** | **Cognition substrate as published API** | ~15 wk |
| **B9** | **TIER 1 i18n complete (5 locales) + TIER 2 (3 locales)** | ~25 wk |
| **B10** | **Mobile + tablet experience evolution** per [C44](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) | ~15 wk |
| **B11** | **Operational maturity** — backup/DR · quarterly drills · file-format versioning · status page | ~10 wk + ongoing |

**Total capacity required**: ~345 effective dev-weeks. Phase 3 = 18 months. Team grows to ~80 per [vision-2030 §5](./vision-2030.md).

---

## §3 — Bucket B1: 15 more typologies (~110 wk)

Per [typology-expansion §5](./typology-expansion-roadmap.md), Phase 3 typologies #11–25:

| # | Typology | Category | Target quarter |
|---|---|---|---|
| 11 | Shop / boutique retail evolution | Retail + hospitality | 2028 Q3 |
| 12 | Car park (multi-storey) | Transport | 2028 Q3 |
| 13 | School (primary) | Education | 2028 Q3 |
| 14 | Library | Civic + cultural | 2028 Q4 |
| 15 | Hotel | Retail + hospitality | 2028 Q4 |
| 16 | Hospital (small) | Healthcare | 2028 Q4 |
| 17 | Warehouse | Industrial + logistics | 2029 Q1 |
| 18 | Care home | Healthcare | 2029 Q1 |
| 19 | Spa / wellness | Sports + leisure | 2029 Q1 |
| 20 | Veterinary clinic | Healthcare | 2029 Q2 |
| 21 | Day-care nursery | Education | 2029 Q2 |
| 22 | University seminar building | Education | 2029 Q2 |
| 23 | Supermarket | Retail + hospitality | 2029 Q3 |
| 24 | Distribution centre | Industrial + logistics | 2029 Q3 |
| 25 | Data centre (small) | Industrial + logistics | 2029 Q4 |

Each typology delivers the standard pack surface (per [typology-expansion §9](./typology-expansion-roadmap.md)) at ~7 wk steady state per typology.

### §3.1 — Cross-typology infrastructure investment in Phase 3

| Investment | Rationale |
|---|---|
| Typology-pack `extends` mechanism | Hospital extends Clinic; Hotel extends Co-living + Restaurant; reduces effort per new typology |
| Per-typology regulatory overlay framework | Phase 3 typologies have heavier regulatory load (hospital fire-egress, school accessibility, hotel ADA, data-centre tier classification) |
| Marketplace-pack-import-from-PRYZM-first-party | Allow community-authored sub-typologies (e.g. "PRYZM University extends to Music Conservatoire") |

---

## §4 — Bucket B2: US + AP + UK regions (~30 wk)

| # | Deliverable | Cites |
|---|---|---|
| 4.1 | US region (us-east-1 / Virginia primary + us-west-2 / Oregon secondary) | [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 4.2 | AP region (ap-northeast-1 / Tokyo + ap-southeast-1 / Singapore secondary) | [C49 §1.2](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 4.3 | UK region (eu-west-2 / London — post-Brexit separate from EU) | [C49 §1.5](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 4.4 | Region-migration workflow tested across all pairs | [C49 §1.9](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 4.5 | Cross-region access gate hardening + DR drills per region | [C49 §1.4](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 4.6 | Per-region Stripe Connect (for marketplace settlement currency) | [C40](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |
| 4.7 | Per-region AI relay (CF Worker per region) | [C09](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) |
| 4.8 | Region-aware telemetry warehouse | [C41 §1.7](../../02-decisions/contracts/C41-TELEMETRY-AND-ANALYTICS.md) |

---

## §5 — Bucket B3: Cognition substrate L6 + L7 maturity (~25 wk)

| # | Deliverable | Cites |
|---|---|---|
| 5.1 | L6 behavioural simulation: pedestrian flow + occupancy patterns | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 5.2 | L6 evacuation simulation (basic) | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 5.3 | L7 typology priors expand to all 25 PRYZM-curated typologies | [typology §6](./typology-expansion-roadmap.md) |
| 5.4 | L7 community-authored typology priors framework (marketplace authors extend the cognition stack) | NEW |
| 5.5 | Constraint DB expansion: 250 → 1000 rules code-enforced | [site-and-cognition §6](../../01-strategy/site-and-cognition-strategy.md) |
| 5.6 | Constraint DB versioning + per-jurisdiction variants (UK / EU / US / JP regulatory packs) | [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) + [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |

---

## §6 — Bucket B4: Revit round-trip full (~20 wk)

| # | Deliverable | Cites |
|---|---|---|
| 6.1 | IFC4 reader for Revit-export edge cases | [C26 §2](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.2 | Family mapping table (Revit Family → PRYZM Family Pack format) | [C26 §3](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.3 | Parameter translation via `IfcPropertySet` | [C26 §4](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.4 | Level/view/sheet translation Revit ↔ PRYZM | [C26 §5](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.5 | Optional external Python adapter (phasing / worksets / design options) | [C26 §6](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.6 | 100-project reference round-trip suite (large enterprise-grade test corpus) | [C26 §7](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |
| 6.7 | Customer-facing Revit-import + Revit-export documentation | [C26 §5](../../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md) |

---

## §7 — Bucket B5: Additional interchange formats (~50 wk)

### §7.1 — C32 DXF/DWG (~10 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.1 | DXF export ASCII writer (existing `plugins/dxf/` extend) | [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md) |
| 7.2 | DXF import reader | [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md) |
| 7.3 | ODA library integration for DWG (commercial license) | [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md) |
| 7.4 | Layer mapping + linetype + block library | [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md) |
| 7.5 | 10 reference DXF/DWG round-trip diff testing | [C32](../../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md) |

### §7.2 — C33 Rhino (~10 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.6 | 3DM round-trip via rhino3dm WASM (existing `plugins/rhino-import/` extend to round-trip) | [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md) |
| 7.7 | NURBS preservation through interchange | [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md) |
| 7.8 | Mesh fallback for non-NURBS-capable consumers | [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md) |
| 7.9 | Grasshopper bridge (definitions consumable from PRYZM AI host) | [C33](../../02-decisions/contracts/C33-RHINO-INTERCHANGE.md) |

### §7.3 — C35 COBie FM Handover (~12 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.10 | COBie export (Excel + IFC4 variant) | [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| 7.11 | Equipment lists + maintenance schedules | [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| 7.12 | Asset tagging | [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| 7.13 | Tier-1 IFC + COBie Pset coverage | [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| 7.14 | First customer: NHS hospital (or US equivalent) running COBie handover | Customer pilot |

### §7.4 — C37 Schedule 4D (~9 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.15 | Schedule store + Gantt UI | [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md) |
| 7.16 | Time-based phasing + animation | [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md) |
| 7.17 | Phase model shared with C38 cost | [C37 + C38](../../02-decisions/contracts/C37-SCHEDULE-4D.md) |
| 7.18 | Synchro + Asta export | [C37](../../02-decisions/contracts/C37-SCHEDULE-4D.md) |

### §7.5 — C38 Cost 5D (~9 wk)

| # | Deliverable | Cites |
|---|---|---|
| 7.19 | `packages/cost-engine/` per C38 | [C38](../../02-decisions/contracts/C38-COST-5D.md) |
| 7.20 | RSMeans + BCIS + Spon's importers | [C38 §4.2](../../02-decisions/contracts/C38-COST-5D.md) |
| 7.21 | Quantity takeoff from C25 Qto Psets | [C38 §1.4](../../02-decisions/contracts/C38-COST-5D.md) |
| 7.22 | Roll-up: CSI / NRM2 / Uniformat II | [C38 §1.3](../../02-decisions/contracts/C38-COST-5D.md) |
| 7.23 | Excel + CostX + Bluebeam + SAP exporters | [C38 §4.1](../../02-decisions/contracts/C38-COST-5D.md) |
| 7.24 | Budget-vs-actual variance | [C38 §1.9](../../02-decisions/contracts/C38-COST-5D.md) |

---

## §8 — Bucket B6: Marketplace ecosystem maturity (~15 wk + ongoing)

| # | Deliverable | Cites |
|---|---|---|
| 8.1 | Plugin author annual conference (first edition) | [platform-strategy §10.3](../../01-strategy/platform-strategy.md) |
| 8.2 | Plugin-author monthly newsletter scaled to 500+ authors | NEW |
| 8.3 | Established-developer programme: 50+ developers qualified | [C40 §1.10](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |
| 8.4 | Marketplace API for partners (programmatic publish) | [C07] |
| 8.5 | Plugin author premium tier (revenue share modifier for top contributors) | NEW |
| 8.6 | Marketplace-acquisitions framework (bring strategic plugins under PRYZM-first-party umbrella) | [platform-strategy §10.3](../../01-strategy/platform-strategy.md) |
| 8.7 | Open governance: plugin-affecting contract changes go through public comment period | [platform-strategy §10.3](../../01-strategy/platform-strategy.md) |
| 8.8 | Marketplace contributes 30 % of PRYZM ARR | E6 verification |

---

## §9 — Bucket B7: Enterprise scale (~30 wk + ongoing)

| # | Deliverable | Cites |
|---|---|---|
| 9.1 | 30+ Enterprise customers signed | per [go-to-market §2.3](../../01-strategy/go-to-market.md) |
| 9.2 | ISO 19650 Phase 2 (production-phase) audit pass | [C30](../../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md) |
| 9.3 | ISO 19650 Phase 3 (completion-phase + handover) audit pass | [C35](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| 9.4 | SOC 2 Type II annual re-audit | [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) |
| 9.5 | First defence/intelligence customer (self-host required) | [C49 §1.6](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) |
| 9.6 | First government procurement win (UK Cabinet Office or US GSA) | [vision-2030 §1](./vision-2030.md) |
| 9.7 | Multi-tenant + multi-org per Enterprise customer (organisations hosting multiple jurisdictions) | NEW |
| 9.8 | Customer success organisation scaled (regional CSMs) | [go-to-market §8.3](../../01-strategy/go-to-market.md) |
| 9.9 | Reference customer programme: 10 named Enterprise customers in case studies | Marketing |

---

## §10 — Bucket B8: Cognition substrate as published API (~15 wk)

| # | Deliverable | Cites |
|---|---|---|
| 10.1 | REST API: `GET /api/v1/cognition/site/{id}` returns structured site knowledge | [site-and-cognition §3.4](../../01-strategy/site-and-cognition-strategy.md) |
| 10.2 | REST API: `GET /api/v1/cognition/building/{id}` returns hierarchy + relationships | [C20](../../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md) |
| 10.3 | REST API: `GET /api/v1/cognition/room/{id}` returns typology + adjacencies + constraints | [C19 + C20 + C27] |
| 10.4 | OpenAPI 3.1 spec published (extends existing `packages/api-spec/`) | NEW |
| 10.5 | First 3 external consumers (academic research lab · AEC AI startup · research firm) | Partnerships |
| 10.6 | Citation policy + usage rate limits (per [C39](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) entitlements) | NEW |

---

## §11 — Bucket B9: Internationalisation completion (~25 wk)

| # | Deliverable | Cites |
|---|---|---|
| 11.1 | de-DE + fr-FR + ja-JP locales reach TIER 1 production parity | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.2 | es-ES + pt-BR + zh-CN locales reach TIER 2 production parity | [C46 §1.2](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.3 | RTL pilot: ar-SA + he-IL TIER 3 launch | [C46 §1.5](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.4 | Locale-pack marketplace runtime (community-authored translations) | [C46 §5.6](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.5 | AI host glossary covers all 8 locales | [C46 §1.7](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.6 | Currency display per locale (Stripe Adaptive Pricing) | [C46 §1.9](../../02-decisions/contracts/C46-I18N-AND-L10N.md) |
| 11.7 | Per-region drawing standards × i18n: Japanese drawings · German drawings · French drawings | [C34](../../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) |

---

## §12 — Bucket B10: Mobile + tablet evolution (~15 wk)

| # | Deliverable | Cites |
|---|---|---|
| 12.1 | 2D plan-view touch authoring on phone (per C44 §5.4) | [C44 §5.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |
| 12.2 | Tablet (iPad Pro 12.9") full editor capability | [C44 §1.4](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |
| 12.3 | PWA install flow polish across iOS + Android + Chrome | [C44 §1.10](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |
| 12.4 | Offline queue robustness (~1 hour of authoring queued + sync on reconnect) | [C44 §1.9](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |
| 12.5 | Field-tier pricing experiment (mobile-viewer-only for site supervisors) | [C44 §10 OQ-6](../../02-decisions/contracts/C44-MOBILE-AND-TABLET.md) |

---

## §13 — Bucket B11: Operational maturity (~10 wk + ongoing)

| # | Deliverable | Cites |
|---|---|---|
| 13.1 | Quarterly DR drill cadence established (per region) | [C48 §1.11](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 13.2 | C47 file-format versioning live + first MAJOR bump (when needed) | [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md) |
| 13.3 | Status page evolution: per-region health + per-feature SLA | [C48 §5.3](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) |
| 13.4 | Trust report monthly cadence + customer summit (in-person) | [C42 §5.5](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) |
| 13.5 | C42 customer support tier maturity: 4 channels live; SEV-1 PMI cadence holds | [C42](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) |
| 13.6 | Annual external accessibility audit (recurring per [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md)) | [C43 §1.13](../../02-decisions/contracts/C43-ACCESSIBILITY.md) |

---

## §14 — Contract gap closures in Phase 3

By end of Phase 3, **all 49 contracts** are CANONICAL (no DRAFTs remain) + **C50 Typology Pipeline** ratified:

| Contract | Phase 2 state | Phase 3 closure |
|---|---|---|
| C19–C49 | Various (CANONICAL / partial) | All CANONICAL |
| C50 Typology Pipeline | CANONICAL (Phase 2) | Stable + 25 typologies live |
| **Future contracts (proposed in Phase 3)** | — | NEW: |
| C51 — Customer Onboarding Pipeline (RAC + role × typology routing) | — | DRAFT in Phase 1; CANONICAL in Phase 3 |
| C52 — Cognition Substrate API | — | DRAFT in Phase 3 |
| C53 — Enterprise Procurement Compliance | — | DRAFT in Phase 3 |
| C54 — Plugin Author Premium Tier | — | DRAFT in Phase 3 |

Phase 3 ends with **~53 contracts** (49 + 4 new).

---

## §15 — Risk + dependency register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Revit round-trip 100-project test fails on edge cases | Medium | High | 6-month pre-Phase work; per-project triage |
| R2 | Three regions launching simultaneously stretches ops capacity | High | Medium | Sequenced (US → AP → UK over 12 months) |
| R3 | Enterprise customer-acquisition slower than target | High | High | Sales team scaled (per [go-to-market §8.3](../../01-strategy/go-to-market.md)); pricing experiments |
| R4 | Marketplace developer churn at scale | Medium | Medium | Per [C40 §10.4](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) — established-developer rewards + featured placement |
| R5 | L6 behavioural simulation depth becomes a separate product | Medium | Low | Bound the scope; sketch-level only; round-trip to specialists |
| R6 | DXF/DWG (ODA license) commercial terms change | Low | High | Annual contract renewal; alternate library evaluation |
| R7 | Government procurement cycles longer than budgeted | High | Medium | Phase the announcement; budget conservatively |
| R8 | TIER 3 RTL pilot reveals layout-bug iceberg | Medium | Medium | Pilot with 1 customer in arabic + 1 in hebrew before broader push |

---

## §16 — Cross-references

| Doc | Relationship |
|---|---|
| [vision-2030.md](./vision-2030.md) | Phase 3 = months 19–36 of the 5-year arc |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Predecessor |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | 15 more typologies ship = Phase 3 (typologies 11–25) |
| [annual-2028.md](./annual-2028.md) | Most of Phase 3 |
| [annual-2029.md](./annual-2029.md) | Remainder of Phase 3 |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Enterprise scale = Phase 3 |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This is H2 |

---

*End — PRYZM Roadmap Phase 3: GA + post-GA, 2026-06-01 — CANONICAL.*
