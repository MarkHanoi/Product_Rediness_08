# PRYZM — Roadmap Enterprise Delivery

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Horizon**: H2 sibling
> **Authority**: this doc owns **how PRYZM delivers to paying customers at scale** — the customer-side sequence (typically 2–4 quarters behind the engineering build sequence). Customer onboarding, pilot motions, training, change-management, success measurement, all per-tier.
> **Companion to**: [roadmap-phase-{1,2,3}.md](./roadmap-phase-1-alpha.md) — those are the BUILD sequence; this is the DELIVERY sequence.
> **Foundation above**: [go-to-market.md](../../01-strategy/go-to-market.md) (the strategic GTM frame) → this doc operationalises.

---

## §1 — The customer-vs-internal distinction (why this doc exists)

A capability that engineering ships in Q3 2026 may only land in production for **Customer A** in Q1 2027 — three quarters later. This is not a defect; it is the structural reality of:

- **Enterprise procurement cycles** (6–9 months per [go-to-market §2.3](../../01-strategy/go-to-market.md))
- **Pilot evaluation periods** (30 days for Mid-firm; 60–120 days for larger)
- **Change-management lead times** (rolling a new tool out to 100+ architects requires training + onboarding + workflow rewriting)
- **Security + legal review** (SOC 2 evidence, MSA negotiation, DPA, sovereignty annex)

Engineering and sales-side roadmaps must NEVER be conflated. Public roadmap commitments that come from engineering velocity get broken on the customer-cycle reality.

This doc records the **customer delivery sequence** — what's available to which customer-tier when, who onboards, how long, and what success looks like at each stage.

---

## §2 — The four customer tiers — onboarding shapes

Per [personas.md](../../01-strategy/personas.md) + [C39 Pricing Plan Tiers](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md):

| Tier | Customers (Phase 3 target) | Onboarding shape | Time to value |
|---|---|---|---|
| **C1 Solo** | ~4000 | Self-serve PLG; 14-day trial | < 30 minutes (per [go-to-market §2.1](../../01-strategy/go-to-market.md)) |
| **C2 Studio (2–10 seats)** | ~700 | Self-serve PLG + opt-in CSM call | < 1 week |
| **C3 Mid-firm (11–50 seats)** | ~200 | Assisted sales + 30-day evaluation + named CSM | 60–120 days |
| **C4 Enterprise (50+ seats)** | ~30 | Contract-based procurement + pilot + change-management + named CSM | 6–9 months |

Total target: ~5,000 paying customers by end of Phase 3 (per [vision-2030 §5](./vision-2030.md)).

---

## §3 — C1 Solo: self-serve PLG onboarding

The most volume; the simplest motion.

| Step | Customer experience | Time | Owner |
|---|---|---|---|
| 1 | Hits `pryzm.app` landing page | — | Marketing |
| 2 | Watches 90-sec interactive demo (apartment generates live) | 1.5 min | Marketing |
| 3 | Signs up with Google/Microsoft/email (no credit card) | 30 sec | Auth surface |
| 4 | RAC chatbot onboarding: who are you? → architect; project? → apartment | 1 min | RAC |
| 5 | Generates first apartment layout in 90 seconds | 1.5 min | AI host |
| 6 | Edits a room, exports IFC | 5 min | Editor |
| 7 | Trial day 1–14 — full Studio-tier access | — | Product |
| 8 | Day 14 paywall: pick a plan (Solo $25/mo · Studio £15/seat/mo) OR continue as Solo with PM on file | 30 sec | Billing |
| 9 | First export of IFC = conversion criterion | — | Activation tracking |

### §3.1 — Activation funnel + conversion targets

| Funnel stage | Target conversion (Phase 1) | Target conversion (Phase 3) |
|---|---|---|
| Landing → signup | 12 % | 18 % (better targeting) |
| Signup → first project | 70 % | 80 % |
| First project → first IFC export | 50 % | 65 % |
| First IFC export → day-14 conversion (Solo plan with PM) | 35 % | 45 % |
| Conversion → 12-mo retention | 75 % | 80 % |

Per [go-to-market §6](../../01-strategy/go-to-market.md), Phase 3 NRR target for Solo > 98 %.

---

## §4 — C2 Studio (2–10 seats): PLG + CSM opt-in

A studio customer starts as a Solo customer (one founder signs up); the platform detects "you have 2+ active seats — would you like Studio?"

| Step | Customer experience | Time |
|---|---|---|
| 1 | Founder signs up as Solo customer (per C1 flow) | day 1 |
| 2 | Founder invites colleague(s) to project (built-in feature) | day 1–7 |
| 3 | At 2+ active seats, platform prompts: "Upgrade to Studio plan?" | day 7–30 |
| 4 | Studio plan: per-seat pricing, multiplayer, IFC round-trip robustness, sheet engine, family marketplace | — |
| 5 | OPT-IN: customer requests a 30-min Customer Success call (free for first 3 months) | — |
| 6 | CSM walks through Mid-firm-ready features customer might grow into | 30 min |
| 7 | Customer typically converts in week 2–4 of the upgrade prompt | — |

### §4.1 — Studio activation milestones

| Milestone | Phase 1 target | Phase 3 target |
|---|---|---|
| Solo → Studio conversion (within 90 days of adding 2nd seat) | 60 % | 75 % |
| Studio 12-mo retention | 80 % | 90 % |
| Studio 24-mo NRR (per [go-to-market §7.1](../../01-strategy/go-to-market.md)) | > 120 % | > 130 % |

---

## §5 — C3 Mid-firm (11–50 seats): assisted sales

The cycle is 60–120 days from first contact to MSA + PO. The motion is **sales-engineer-led**, not aggressive outbound.

### §5.1 — The Mid-firm sales cycle

| Stage | Duration | Activity | Output |
|---|---|---|---|
| 1. Inbound | < 24 h | Lead from website demo request → routed to sales engineer | Qualification call booked |
| 2. Discovery call | 60 min | Understand current stack + pain | Customer fit confirmed |
| 3. Live demo | 60 min | Sales engineer walks through C25 + C36 + C30 surfaces with customer data | Customer technical team excited |
| 4. Architect review | 1–2 wk | Customer's BIM lead + 1–2 architects run a sample project | Hands-on validation |
| 5. Evaluation start | day 21 | 30-day evaluation begins; CSM assigned | Eval kickoff |
| 6. Mid-evaluation check-in | day 35 | Address blockers; co-author success criteria | Joint success plan |
| 7. Decision | day 50 | Customer decides; if yes → MSA + PO | Contract |
| 8. Onboarding | day 50–80 | Migration of first project; team training | Production live |
| 9. First 90-day review | day 80–110 | CSM + customer review NRR signals | Renewal trajectory |

### §5.2 — Mid-firm onboarding plan (post-MSA)

| Day | Activity | Owner |
|---|---|---|
| 1 | Account provisioned; seats allocated; SSO configured (if applicable) | CSM + IT |
| 2–7 | Training sessions × 3 (90-min each): "Editor basics" + "Multi-disciplinary workflow" + "Marketplace + Plugins" | CSM + customer leads |
| 8–14 | First project migration (typically a small pilot project) | Customer BIM team + CSM |
| 15–30 | Full team rollout: introduction sessions for all seats; office-hours support | CSM weekly |
| 31–60 | First production deliverable shipped; CSM monitors weekly | CSM |
| 61–90 | Quarterly business review with named CSM | CSM + customer head-of-BIM |

### §5.3 — Mid-firm acceptance criteria

| Metric | Phase 1 target | Phase 3 target |
|---|---|---|
| Time to first production deliverable | 60 days | 30 days |
| 12-mo retention | 90 % | 95 % |
| 12-mo NRR | > 110 % | > 130 % |
| Customer NPS | > 50 | > 60 |
| Average seats expansion at 12 mo | 1.5× | 2× |

---

## §6 — C4 Enterprise (50+ seats): procurement + pilot + change-mgmt

The most complex motion; 6–9 months end-to-end. The motion is **contract-based** with deep security + legal review.

### §6.1 — The Enterprise procurement cycle

| Stage | Duration | Activity | Output |
|---|---|---|---|
| 1. Initial contact | 1–2 wk | Inbound or outbound; first-call qualification | Customer fit confirmed |
| 2. Security questionnaire | 2–3 wk | Customer-side security team sends 200-question SIG-Lite (or similar); we respond with the contract suite + SOC 2 evidence | Security clears initial gate |
| 3. Technical evaluation | 4–8 wk | Customer trials with a representative team; PRYZM CSM dedicated to the evaluation | Technical-fit validated |
| 4. Legal + procurement | 4–8 wk | MSA negotiation; DPA; sovereignty/region annex; SLA + support tier annex | Contract drafted |
| 5. Contract close | 1–2 wk | Signatures; PO; provisioning | Deal closed |
| 6. Onboarding | 4–8 wk | Migration of pilot project; team training; CSM weekly cadence | Pilot live |
| 7. First milestone | 3–6 mo post-close | Customer expands to a second team / division | Expansion |

### §6.2 — The Enterprise pilot motion

| Phase | Duration | Activity |
|---|---|---|
| Pilot scoping | 2 weeks | Pick the pilot project (typically a smaller, contained scheme); name the success metrics |
| Pilot kickoff | 1 week | CSM + customer BIM lead set up environment; provision Enterprise tier; configure SSO/BYOK |
| Pilot execution | 8–12 weeks | Customer team uses PRYZM on the chosen project; CSM weekly checkpoints |
| Pilot retrospective | 2 weeks | Joint review against success metrics; expansion plan |
| Production rollout | 4–8 weeks | Migration of additional projects; full-team training (50+ architects) |

### §6.3 — Enterprise required compliance artefacts

Procurement gate items the sales team prepares per [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) + [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + [C48](../../02-decisions/contracts/C48-BACKUP-AND-DR.md):

| Artefact | Source | Available as |
|---|---|---|
| SOC 2 Type II report | External auditor | PDF (under NDA) |
| ISO 19650 Phase 1+2+3 compliance evidence | Internal + external auditor | PDF |
| WCAG 2.2 AA VPAT | [C43 §1.14](../../02-decisions/contracts/C43-ACCESSIBILITY.md) | Public at `pryzm.app/vpat` |
| GDPR DPA template | Legal | Bespoke per customer |
| Data residency annex | [C49](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Per-region (EU / US / AP / UK) |
| BYOK setup guide | [C49 §1.3](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Internal PDF + customer engineering session |
| Backup + DR runbook | [C48](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) | Internal PDF; per-incident sharing |
| Security questionnaire response (200+ Qs) | Sales engineer + security lead | Bespoke per customer |
| MSA template | Legal | Bespoke per customer; sovereignty clause per region |
| 4 h Enterprise SLA + named CSM contract | [C42 §1.1](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | Standard annex |

### §6.4 — Enterprise customer success motion

After contract close, the customer success organisation runs a **named CSM model**:

| Cadence | Activity |
|---|---|
| Weekly | CSM + customer head-of-BIM standup (30 min) |
| Monthly | Quarterly-business-review (QBR) prep + roadmap alignment |
| Quarterly | QBR with customer leadership + sales account exec |
| Annual | Renewal conversation + expansion planning |

### §6.5 — Enterprise expansion playbook

A first Enterprise customer typically lands with **one team or division**. The expansion path:

| Expansion stage | Trigger | New scope |
|---|---|---|
| Initial team adoption | Pilot success | 50–100 seats |
| Additional team / division | 6-month milestone | +50 seats |
| Office-wide rollout | 12-month milestone | +200–500 seats |
| Multi-office | 18-month milestone | +500 seats; multi-region |
| Strategic partner | 24-month milestone | Featured case study; joint marketing |

NRR target for Enterprise per [go-to-market §7.1](../../01-strategy/go-to-market.md): 24-mo > 140 %.

---

## §7 — Capability availability by tier (which tier gets what when)

| Capability | Solo | Studio | Mid-firm | Enterprise | Phase |
|---|---|---|---|---|---|
| Apartment-layout AI workflow | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| House + Office typologies | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| Multiplayer collaboration | — | ✅ | ✅ | ✅ | Phase 1 |
| IFC round-trip basic | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| Marketplace install | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| Marketplace publish (as developer) | — | ✅ | ✅ | ✅ | Phase 1 |
| Family Platform install | ✅ | ✅ | ✅ | ✅ | Phase 1 |
| Family Platform author + publish | — | ✅ | ✅ | ✅ | Phase 1 |
| Multi-typology (10+) | ✅ | ✅ | ✅ | ✅ | Phase 2 |
| Sheet composition + PDF + drawing set | — | ✅ | ✅ | ✅ | Phase 2 |
| BIM 3.0 Inspect + Data Panel | — | ✅ | ✅ | ✅ | Phase 2 |
| Federated clash + BCF round-trip | — | — | ✅ | ✅ | Phase 2 |
| Cost (5D) | — | — | ✅ | ✅ | Phase 3 |
| Schedule (4D) | — | — | ✅ | ✅ | Phase 3 |
| Revit round-trip (full) | — | — | ✅ | ✅ | Phase 3 |
| DXF/DWG + Rhino + COBie | — | — | ✅ | ✅ | Phase 3 |
| EU sovereignty default | ✅ EU users | ✅ EU users | ✅ EU users | ✅ all users | Phase 2 |
| US + AP + UK regions | — | — | — | ✅ | Phase 3 |
| BYOK | — | — | — | ✅ | Phase 3 |
| SSO (Okta, Azure AD) | — | — | — | ✅ | Phase 2 |
| Audit log + ISO 19650 evidence | — | — | ✅ | ✅ | Phase 2 |
| Self-host option | — | — | — | ✅ | Phase 3 |
| Named CSM + 4h SLA | — | — | — | ✅ | Phase 1 |
| Priority support email | — | — | ✅ | ✅ | Phase 1 |
| 25 typologies | ✅ | ✅ | ✅ | ✅ | Phase 3 |

---

## §8 — The first 10 Enterprise customers (named pipeline)

Without naming specific firms (commercial confidentiality), the target Enterprise pipeline mix:

| # | Sector | Region | Use case | Target close |
|---|---|---|---|---|
| 1 | Mid-firm architectural practice (~80 architects) | UK | Residential + workplace project pipeline | 2027 Q3 |
| 2 | Government estates department | UK | Public-sector building + ISO 19650 compliance | 2027 Q4 |
| 3 | Healthcare estates trust | UK | Hospital + clinic estates | 2027 Q4 |
| 4 | University estate | UK | Multi-building campus + COBie handover | 2028 Q1 |
| 5 | Top-30 architectural firm | Global | Enterprise tier; multi-region | 2028 Q2 |
| 6 | Government estates department | EU | Public-sector; EU sovereignty | 2028 Q2 |
| 7 | General contractor | US | Pre-construction + design phase | 2028 Q3 |
| 8 | Healthcare estates system | US | Hospital ROI + COBie | 2028 Q3 |
| 9 | Education institutional | US | University + library + research building | 2028 Q4 |
| 10 | Defence (self-host) | UK / US | Specialised; self-host requirement | 2029 Q1 |

Each customer is a separate sales motion led by the founder + account exec. Customer 5 onward typically requires a 9-month cycle; Customer 1–4 may close in 6 months.

---

## §9 — Phase-by-phase customer delivery summary

| Phase | Engineering ships | Customer delivery (lagging) | Customer count target |
|---|---|---|---|
| **Phase 1 (0–6mo)** | TypologyPipeline + 3 typologies + SDK publish + marketplace live + EU readiness | Solo + Studio PLG live; first 50 customers; first 2 Enterprise pilots starting | 50 paying |
| **Phase 2 (6–18mo)** | 10 typologies + EU region + Inspect/Data/Sheet/PDF + clash + i18n + SOC 2 | First 5 Enterprise customers closed; ~500 customers total; ~100 active marketplace devs | 500 paying |
| **Phase 3 (18–36mo)** | 25 typologies + 4 regions + Revit full + COBie + 4D/5D + cognition API | 30+ Enterprise customers; ~5,000 customers; ~200 active marketplace devs | 5,000 paying |
| **Phase 4 (36mo+)** | Marketplace ecosystem matures; long-tail typologies; substrate as research benchmark | 10,000+ paying customers; ecosystem flywheel compounding | 10,000+ |

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [go-to-market.md](../../01-strategy/go-to-market.md) | The strategic GTM that this doc operationalises |
| [personas.md](../../01-strategy/personas.md) | The 5 archetypes (C1–C5) that this doc onboards |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Phase 1 BUILD; this doc = Phase 1 DELIVERY |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Phase 2 BUILD; this doc = Phase 2 DELIVERY |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Phase 3 BUILD; this doc = Phase 3 DELIVERY |
| [../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md](../../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) | Plan tiers + entitlements |
| [../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md](../../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | Per-tier support SLAs |
| [../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md](../../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Per-region sovereignty (delivery constraint) |

---

*End — PRYZM Roadmap Enterprise Delivery, 2026-06-01 — CANONICAL.*
