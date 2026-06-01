# PRYZM — Annual Plan 2026

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Horizon**: H3 — annual
> **Window**: 2026 calendar year. **Year status**: H1 2026 (Jan–Jun) is closed; H2 2026 (Jul–Dec) is the active commitment.
> **Authority**: this doc owns **2026 calendar-year commitments** broken into quarters. Update at the end of each quarter (Q3 close → Q4 refresh; Q4 close → 2027 annual draft).
> **Foundation above**: [vision-2030.md](./vision-2030.md) → [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) (Phase 1 = H2 2026 + first half of H1 2027).

---

## §1 — Year-2026 summary

### §1.1 — H1 2026 (Jan–Jun) — closed

| Theme | Delivered |
|---|---|
| Documentation restructure | 3-layer pyramid (01-strategy / 02-decisions / 03-execution); 547 files migrated; per-folder READMEs |
| Contract suite | C01–C18 ratified CANONICAL; C19–C49 authored as DRAFT (49 contracts total) |
| Strategy expansion | 8 new strategy docs (manifesto · positioning · personas · GTM · platform · site-cognition · operating · risks) |
| Code-grounded audit | architecture.md + engineering-vision.md + product-vision.md rewritten from full code audit; architecture-breakdown.md refreshed |
| Apartment layout | shipped end-to-end (#51 closed) — RAC chatbot → site → AI generate → IFC export |
| Plugin SDK | v1.0.0 locally complete; `pryzm dev` CLI + iframe sandbox + Ed25519 + bSDD lookup all shipped |
| Family Platform | full P0 infrastructure (family-{instance,loader,runtime} + 7 schema packages + component-editor) |
| Marketplace | server + DB tables + SPA shells |

### §1.2 — H2 2026 (Jul–Dec) — active commitment

The active half-year. Maps to **the second half of [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md)** + the START of Phase 1 typology deliverables.

| Theme | H2 2026 commitment |
|---|---|
| Typology pipeline | TypologyPipelineRouter + apartment refactored as pack + house typology shipped |
| Site substrate | C19 + C21 contracts ratified CANONICAL; site authoring UI live; climate ingestion live |
| Marketplace go-live | `marketplace.pryzm.app` DNS + TLS; `@pryzm/sdk` npm publish; first 5 PRYZM-first-party plugins listed |
| Brand + domain | `pryzm.app` cutover from `pryzm.so` legacy |
| Enterprise readiness foundation | C22 PII + C23 provenance + first DR drill |
| First paying customers | First 50 paying via Solo + Studio PLG (target $1500 MRR) |

---

## §2 — Quarterly breakdown — H2 2026

### §2.1 — Q3 2026 (Jul–Sep)

**Theme**: TypologyPipeline foundations + marketplace go-live + brand cutover. Detailed in [quarterly-2026-Q3.md](./quarterly-2026-Q3.md).

| Epic | Owner | Sprints | Cites |
|---|---|---|---|
| TypologyPipelineRouter + TypologyRegistry skeleton | Engineer 1 | S1–S3 | [Phase 1 §3.1](./roadmap-phase-1-alpha.md) |
| Apartment typology refactored as pack | Engineer 1 + Architect 1 | S2–S3 | [Phase 1 §3.2](./roadmap-phase-1-alpha.md) |
| RAC chatbot UI v1 + TypologyPicker | Designer 1 + Engineer 1 | S3–S5 | [Phase 1 §3.1.5–6](./roadmap-phase-1-alpha.md) |
| C19 Site element schemas + SiteStore + UI | Engineer 2 + Architect 2 | S1–S4 | [Phase 1 §4.1](./roadmap-phase-1-alpha.md) |
| C21 Climate ingestion (EPW + NOAA) | Engineer 2 | S3–S6 | [Phase 1 §4.3](./roadmap-phase-1-alpha.md) |
| `pnpm publish @pryzm/sdk` (OI-011) + DNS marketplace.pryzm.app (OI-013) | Founder + ops | S1 | [Phase 1 §5](./roadmap-phase-1-alpha.md) |
| First 5 marketplace plugins published | Dev-rel + Engineer 3 | S2–S6 | [Phase 1 §5](./roadmap-phase-1-alpha.md) |
| `pryzm.app` domain cutover + landing-page rebuild | Designer 2 + Marketing | S1–S5 | [Phase 1 §8](./roadmap-phase-1-alpha.md) |
| C50 typology pipeline contract DRAFT | Architect 1 | S2 | [Phase 1 §3.1.7](./roadmap-phase-1-alpha.md) |
| C22 PII + C23 provenance partial ratification | Engineer 4 | S4–S6 | [Phase 1 §7.1, §7.2](./roadmap-phase-1-alpha.md) |

**Q3 acceptance** (sprint-6 close):
- Apartment typology lives as a Typology Pack
- House typology entered development (Q4 ship)
- TypologyRegistry slot on PryzmRuntime
- Site substrate C19 ratified
- npm @pryzm/sdk published
- marketplace.pryzm.app live with 5 plugins
- pryzm.app cutover complete

### §2.2 — Q4 2026 (Oct–Dec)

**Theme**: House + Small-Office typologies ship · Enterprise readiness foundation · first paying customers. Detailed in [quarterly-2026-Q4.md](./quarterly-2026-Q4.md).

| Epic | Owner | Sprints | Cites |
|---|---|---|---|
| House typology (T2) ship | Engineer 1 + Architect 1 | S7–S9 | [Phase 1 §3.3](./roadmap-phase-1-alpha.md) |
| Small-Office typology (T3) ship | Engineer 1 + Architect 1 | S10–S12 | [Phase 1 §3.4](./roadmap-phase-1-alpha.md) |
| C20 Building + Apartment Aggregates ratified | Engineer 2 + Architect 2 | S7–S9 | [Phase 1 §4.2](./roadmap-phase-1-alpha.md) |
| IFC + Revit polish (PSet coverage + IFC4X3-RV variant) | Engineer 5 | S7–S10 | [Phase 1 §9](./roadmap-phase-1-alpha.md) |
| Family marketplace UX polish + 3 community packs | Engineer 3 + Designer 2 + Dev-rel | S8–S11 | [Phase 1 §6](./roadmap-phase-1-alpha.md) |
| WCAG audit prep (axe-core CI all critical/serious green) | Engineer 4 | S8–S12 | [Phase 1 §7.3](./roadmap-phase-1-alpha.md) |
| Backup + DR runbooks + first drill | Engineer 4 | S10–S12 | [Phase 1 §7.4](./roadmap-phase-1-alpha.md) |
| Cognition substrate L1–L4 hardening (constraint DB 102→200 enforced) | Engineer 6 + Architect 1 + Architect 2 | S7–S12 | [Phase 1 §10](./roadmap-phase-1-alpha.md) |
| First 50 paying customers acquired | Marketing + product | continuous | [Phase 1 §1 E8](./roadmap-phase-1-alpha.md) |
| Phase 1 exit ADR + closure | Founder | S13 | [Phase 1 §1](./roadmap-phase-1-alpha.md) |

**Q4 acceptance + Phase 1 exit** (sprint-12 close):
- 3 typologies live in production (apartment + house + office)
- E1–E10 Phase 1 exit criteria all green ([Phase 1 §1](./roadmap-phase-1-alpha.md))
- ADR-NNN-phase-1-exit-alpha.md raised + ratified
- 50+ paying customers (target $1500 MRR)
- 21 CI gates stable for 4 consecutive weeks

---

## §3 — Capacity model 2026

### §3.1 — Team shape (H2 2026)

Per [operating-principles §4.1](../../01-strategy/operating-principles.md):

| Role | Count | Focus |
|---|---|---|
| Founder / CEO | 1 | Sales · vision · strategic decisions |
| Engineers (full-stack) | 6 | Buckets B1–B8 |
| Architect-consultants | 2 | Typology rules · BIM standards · cognition substrate |
| Designer-engineers | 2 | UI + UX + brand voice |
| Customer success | 1 | First customer onboarding |
| Developer relations | 1 | Marketplace ecosystem seeding |
| Support agents | 2 | Inbound across PLG tiers |
| Content / marketing | 1 | Brand voice + content + landing copy |
| Operations / finance | 1 | Stripe + accounting + Compliance |
| Legal (fractional) | 0.5 | MSA + contracts review |
| Security (fractional) | 0.5 | SOC 2 prep + DR drills |

**Total**: ~18 (some fractional). Net dev-week capacity ~5.5 FTE × 70% focus × 26 weeks = ~100 weeks. Phase 1 H2 demand = ~60 weeks; ~40 weeks reserve for incident response + customer escalations.

### §3.2 — Budget model (rough)

| Cost line | H2 2026 | H1 2026 actual |
|---|---|---|
| Headcount (~18 × £8k/mo avg) | ~£864k | ~£840k |
| Infra (AWS + Supabase + Anthropic) | ~£60k | ~£40k |
| Tools (GitHub + Linear + Slack + Cal + …) | ~£15k | ~£12k |
| Compliance + audit (SOC 2 prep) | ~£30k | ~£10k |
| Marketing (content + conferences + dev-rel) | ~£40k | ~£25k |
| Legal (MSA templates + advice) | ~£20k | ~£15k |
| **Total** | **~£1.03M** | **~£0.94M** |

Funding source: existing seed capital + first customer revenue (target $1500 MRR by Q4 = ~£15k/mo by year-end).

---

## §4 — 2026 contract closure plan

| Contract | Pre-H2 state | Q3 commitment | Q4 commitment | End-of-year state |
|---|---|---|---|---|
| C01–C18 | CANONICAL | Refresh package counts | Stable | CANONICAL |
| C19 Site | DRAFT | **CANONICAL** | Stable | CANONICAL |
| C20 Aggregates | DRAFT | DRAFT → Partial | **CANONICAL** | CANONICAL |
| C21 Climate | DRAFT | DRAFT → Partial | **CANONICAL** | CANONICAL |
| C22 PII | DRAFT | Partial | Partial | Partial (full in Phase 2) |
| C23 Provenance | DRAFT | Partial | Partial | Partial (full in Phase 2) |
| C24–C30 | DRAFT | No work | No work | DRAFT |
| C31 Documentation | DRAFT | Refresh on cadence stability | Ratify on doc-system stability | CANONICAL |
| C32–C38 | DRAFT | No work | No work | DRAFT |
| C39 Pricing | DRAFT | Partial — entitlement registry + Solo/Studio | Stable + Mid-firm tier | Partial |
| C40 Marketplace | DRAFT | Partial — 70/30 + payout test | Partial — first marketplace authors | Partial |
| C41 Telemetry | DRAFT | Partial — consent banner + cookie | Stable | Partial |
| C42 Support | DRAFT | Partial — support@pryzm.app + 4-channel | Stable + first SEV-1 PMI | Partial |
| C43 Accessibility | DRAFT | Partial — axe-core CI green | Partial — WCAG audit prep | Partial (full in Phase 2) |
| C44 Mobile | DRAFT | Partial — surface capability + share-link | Stable | Partial |
| C45 Browser | DRAFT | Partial — Tier 1 support live | Stable | Partial |
| C46 i18n | DRAFT | Partial — en-US baseline | Partial — en-GB | Partial |
| C47 File-Format Versioning | DRAFT | Partial — formatVersion field | Partial — writer signature | Partial |
| C48 Backup + DR | DRAFT | Partial — runbooks drafted | Partial — first drill | Partial |
| C49 Multi-Region | DRAFT | No work | No work | DRAFT (EU launch in Phase 2) |
| **C50 Typology Pipeline** | NEW | **DRAFT authored** | Stable | DRAFT |

**Summary**: by end-of-2026, C19/C20/C21 + C31 will be CANONICAL. 16 contracts partial. C50 drafted. Phase 2 (2027) will ratify ~10 more.

---

## §5 — 2026 typology delivery plan

Per [typology-expansion §5](./typology-expansion-roadmap.md):

| # | Typology | Q1 H1 | Q2 H1 | Q3 H2 | Q4 H2 |
|---|---|---|---|---|---|
| 1 | Apartment | shipped (current) | shipped | refactored as Pack | stable |
| 2 | House | — | — | development starts | **SHIP** |
| 3 | Small-office | — | — | — | **SHIP** |

H2 2026 delivers **3 typologies** in production by end-of-year. Phase 1 exit criteria satisfied.

---

## §6 — 2026 enterprise-side milestones

Per [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md):

| Milestone | Target month | Notes |
|---|---|---|
| First 5 paying customers (Solo + Studio) | Sep 2026 | PLG self-serve |
| First 25 paying customers | Nov 2026 | PLG flywheel kicks |
| First 50 paying customers | Dec 2026 | E8 criterion |
| First 1 Enterprise pilot started | Oct 2026 | UK mid-firm |
| First 1 Enterprise contract signed | Dec 2026 (best case) or 2027 Q1 | Procurement cycle |
| First 5 Enterprise pilots in flight | Dec 2026 | Sales pipeline |

Enterprise-revenue contribution H2 2026: ~$0 (Enterprise procurement closes typically 2-3 quarters after pilot start; first Enterprise MRR in 2027 Q1).

---

## §7 — 2026 NFT + perf commitments

| NFT | Q3 target | Q4 target |
|---|---|---|
| Cold-boot to first paint | < 2.5 s (NFT-1 baseline) | < 2.0 s |
| Project-load (10k elements) | < 6 s p95 | < 5 s p95 |
| Apartment layout generation | < 60 s end-to-end | < 45 s |
| House layout generation | n/a (Q4 ship) | < 60 s |
| Office layout generation | n/a | n/a (Q4 ship; first sprint of Q1 2027) |
| Frame budget (60 fps) | maintained | maintained |
| Bundle size (editor) | < 4.5 MB gzip | < 4 MB gzip |
| AI plan-critique latency | < 8 s e2e | < 6 s |
| Plugin install latency | < 10 s | < 5 s |

All measured in CI (`apps/bench/src/benches/*.bench.ts`); regressions block merge.

---

## §8 — 2026 risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | npm publish blocked (OI-011 issues) | Low | High | Founder + ops resolve in S1 week 1 |
| R2 | Marketplace cold start (no developer signups) | Medium | High | First 5 PRYZM-first-party + 20 invited developers |
| R3 | House typology AI quality below threshold | Medium | High | D-HOUSE deterministic engine is the gate; AI is the lift |
| R4 | First Enterprise customer slips to Phase 2 | High | Low | E8 doesn't depend on Enterprise revenue |
| R5 | WCAG audit reveals more `critical`/`serious` than budgeted | Medium | Medium | Q4 buffer; can defer to Phase 2 if needed |
| R6 | Anthropic API outage during demo or launch | Low | High | Deterministic fallback engines for all typologies |
| R7 | SOC 2 audit takes longer than expected | High | Medium | Phase 2 work; Q4 is prep only |
| R8 | Brand-voice content sweep underestimated | Medium | Low | Content writer hire by S1 |

---

## §9 — 2027 forward look

Annual-2027 plan will be authored at end of 2026 Q4. Phase 1 closes in 2026 Q4 → Phase 2 starts 2027 Q1.

**Expected 2027 themes** (from [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md)):
- 7 more typologies (townhouse + co-living + co-working + gym + pharmacy + clinic + restaurant)
- Sheet + PDF + drawing-set canonical
- BIM 3.0 Inspect + Data Panel canonical
- EU region launch (Frankfurt + Dublin)
- First 5 Enterprise customers
- SOC 2 Type II audit pass
- First 100 marketplace developers

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [vision-2030.md](./vision-2030.md) | 2026 = year 1 of the 5-year arc |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | This year delivers the back half of Phase 1 |
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | 3 typologies ship in 2026 |
| [roadmap-enterprise-delivery.md](./roadmap-enterprise-delivery.md) | Customer-delivery sequence for 2026 |
| [quarterly-2026-Q3.md](./quarterly-2026-Q3.md) | Q3 sprint-level detail |
| [quarterly-2026-Q4.md](./quarterly-2026-Q4.md) | Q4 sprint-level detail |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This is H3; quarterly is H4 derivative |

---

*End — PRYZM Annual Plan 2026, 2026-06-01 — CANONICAL.*
