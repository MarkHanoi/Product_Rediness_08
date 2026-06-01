# PRYZM — Go-To-Market Strategy

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns **how PRYZM reaches and retains customers** — channels, geographies, sales motion, pricing strategy, growth loops, retention model. The contract suite codifies what we ship; this doc codifies how we sell and keep.
> **Foundation above**: [manifesto.md](./manifesto.md) → [positioning.md](./positioning.md) → [personas.md](./personas.md)
> **Cross-cut**: [platform-strategy.md](./platform-strategy.md) (the marketplace side) · [risks-and-assumptions.md](./risks-and-assumptions.md) (GTM-risk treatment)

---

## §1 — The GTM thesis in one paragraph

PRYZM is sold to architects via **product-led growth** at the Solo and Studio tiers (low-friction self-serve), to mid-firms via **assisted sales** (a sales engineer + a 30-day evaluation), and to enterprise customers via **contract-based procurement** (6–9 month cycle with legal + security review). The marketplace side (C5 developers) acquires itself via the developer-relations programme + the published contract suite. We open in **Western Europe + North America** in year 1, expand to **AP + UK-distinct + Eastern Europe** in year 2, and consider **CN / India / Brazil / Middle East** in year 3+ subject to demand + compliance budget.

---

## §2 — The customer acquisition motion

Different personas convert via different motions. We name and resource each one separately.

### §2.1 — Product-Led Growth (PLG) — C1 Solo + C2 Studio

| | |
|---|---|
| **Target persona** | C1 Solo architect · C2 Studio (2–10 seats) |
| **Acquisition motion** | Self-serve signup → 14-day trial → paid conversion |
| **Friction budget** | < 5 minutes from landing to first IFC export |
| **Sales involvement** | Zero (sales engineers may answer pre-sales questions via support, but never close) |
| **Trial mechanics** | One 14-day Studio-tier trial per organisation; conversion-required-at-day-15 (Solo plan with payment-method-on-file is the soft default; expired-no-PM means account in expired state per [C39 §1.8](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) |
| **Activation milestones** | (1) Account created. (2) First project opened. (3) First element created. (4) First IFC export. (5) Returned for second session in same week. The fifth is the leading retention indicator. |

**The PLG funnel**:

```
Visit pryzm.app
   │
   ▼  90 sec — interactive demo on landing (apartment generates live)
   │
   ▼  3 clicks — sign up with Google / Microsoft / email
   │     (no credit card)
   │
   ▼  Onboarding (skippable) — 5-step tutorial routed through real workflows:
   │     "Generate your first apartment" · "Edit a room" · "Add a door" ·
   │     "Save the project" · "Export to IFC"
   │
   ▼  Day 1–13 trial — Studio-tier access; in-product banner shows "X days left"
   │
   ▼  Day 14 — paywall modal: pick a plan (Solo $25/mo · Studio £15/seat/mo)
   │     OR continue without paying (Solo plan, single seat, with PM-on-file
   │     auto-charged at day 15)
   │
   ▼  Activation tracked: first export of IFC is the conversion criterion
```

### §2.2 — Assisted sales — C3 Mid-firm

| | |
|---|---|
| **Target persona** | C3 Mid-firm (11–50 seats) |
| **Acquisition motion** | Inbound lead → sales engineer demo → 30-day evaluation → MSA + PO |
| **Sales cycle** | 60–120 days typical |
| **Sales engineer's role** | Demos the federated-clash + IFC + ISO-19650 surfaces; runs the customer's actual project (or a representative one) through PRYZM; provides reference customers; coaches the BIM coordinator |
| **Evaluation mechanics** | 30-day Mid-firm-tier evaluation; full feature access; the customer's BIM coordinator gets a named contact + a weekly check-in |
| **Conversion criterion** | Customer's CTO + BIM lead sign-off + first PO |
| **Standard pricing** | $35/seat/month + clash module + ISO 19650 audit module; annual prepay 12 % discount; multi-year 18 % discount |

**The Mid-firm sales cycle** (typical):

| Stage | Duration | Activity |
|---|---|---|
| Inbound (1 day) | < 24 h | Lead from website demo request → routed to sales engineer |
| Discovery call (1 hour) | Week 1 | Understand the firm's current stack + pain |
| Live demo (1 hour) | Week 1–2 | Sales engineer walks through C25 + C36 + C30 surfaces with their data |
| Architect review (variable) | Weeks 2–3 | The firm's BIM lead + 1–2 architects run a sample project |
| Evaluation start | Week 3 | 30-day evaluation begins; CSM assigned |
| Mid-evaluation check-in | Week 5 | Address blockers; co-author the success criteria |
| Decision (Week 7) | Week 7 | Customer decides; if yes → MSA + PO |
| Onboarding | Weeks 7–10 | Migration of first project; team training |

### §2.3 — Contract-based procurement — C4 Enterprise

| | |
|---|---|
| **Target persona** | C4 Enterprise / GC / institutional (50+ seats) |
| **Acquisition motion** | Inbound lead OR targeted account-based → discovery → security + legal review → contract negotiation → MSA + PO |
| **Sales cycle** | 6–9 months |
| **Sales team** | Account executive + sales engineer + customer success engineer; legal + security + compliance reviews co-led with the customer's procurement |
| **Reference architecture** | The 49-contract suite + the SOC 2 evidence + the ISO 19650 audit + the WCAG 2.2 audit + the per-region sovereignty story is THE sales motion |
| **Standard pricing** | $100/seat/month base + enterprise SKU (BYOK, sovereignty, self-host options); 3-year contract typical; multi-year discount up to 25 % |

**The Enterprise procurement cycle**:

| Stage | Duration | Activity |
|---|---|---|
| Initial contact (1 week) | 1–2 weeks | Inbound or outbound; first-call qualification |
| Security questionnaire | 2–3 weeks | Customer-side security team sends 200-question SIG-Lite (or similar); we respond with the contract suite + SOC 2 evidence |
| Technical evaluation | 4–8 weeks | Customer trials with a representative team; PRYZM CSM dedicated to the evaluation |
| Legal + procurement | 4–8 weeks | MSA negotiation; DPA; sovereignty/region annex; SLA + support tier annex |
| Contract close | 1–2 weeks | Signatures; PO; provisioning |
| Onboarding | 4–8 weeks | Migration of pilot project; team training; CSM weekly cadence |
| First milestone | 3–6 months post-close | Customer expands to a second team / division |

### §2.4 — Developer relations — C5 Plugin developer

| | |
|---|---|
| **Target persona** | C5 Plugin developer · Family creator · Pricing catalogue vendor |
| **Acquisition motion** | Self-serve onboarding to the marketplace; supported by content + community + reference plugins |
| **Sales involvement** | None (developer relations team supports, doesn't sell) |
| **Friction budget** | First-plugin-published in < 30 days for an experienced developer |
| **Activation milestones** | (1) `pryzm dev init` succeeds. (2) Plugin published to marketplace. (3) First sale. (4) First payout received. (5) Established-developer threshold reached. |

**The developer onboarding flow**:

```
Visit pryzm.app/developers
   │
   ▼  Read the C07 + C40 contracts (transparent economics)
   │
   ▼  `pryzm dev init <plugin-name>` (or family-pack init)
   │     Scaffolds a plugin in TypeScript with example handlers
   │
   ▼  Local development; test against a personal PRYZM Studio seat
   │
   ▼  `pryzm dev publish` — uploads to staging
   │
   ▼  If open-category: live within 24 h.
   │  If curated-category: routes to PRYZM curation team; ~11 days to live.
   │
   ▼  First sale = $X (gross) → $X × 0.7 (net) → 14-day reserve → monthly payout
```

---

## §3 — Channels

### §3.1 — Primary channels (year 1)

| Channel | Purpose | Investment level |
|---|---|---|
| **Direct (pryzm.app)** | The PLG funnel — Solo + Studio acquisition | Highest (the website is the product) |
| **Content marketing** | Long-form thought leadership; tutorials; case studies; technical-architecture posts | High (1 article per fortnight; aimed at architect-developers as much as journalists) |
| **Community presence** | Reddit (/r/architecture, /r/BIM), Twitter/X, LinkedIn, Architects' Journal, archINFORM | Medium (1 community manager + sales engineer occasional time) |
| **Conferences + meetups** | RIBA London, NeoCon Chicago, AEC Hackathon, BILT, AU (Autodesk University — as a contrarian presence) | Medium (4–6 events/year; lean booths + a strong demo) |
| **Architectural press** | Dezeen, ArchDaily, Architects' Journal, BauNetz, Domus | Targeted (1 placement per quarter; story-led, not product-launch-led) |
| **Existing-customer referrals** | The "Sofia tells other solo architects" loop in [personas.md §2.6](./personas.md) | Compounding (built-in feature: $50 credit per referred trial that converts) |
| **Educational / academic** | University programmes: MIT, Bartlett, ETH, TU Delft, KTH; free student licences | Strategic (the architects of 2030 should have used PRYZM during their masters) |

### §3.2 — Secondary channels (year 2+)

| Channel | Purpose |
|---|---|
| **Channel partners (regional resellers)** | Japan, Middle East, Latin America — markets where local presence accelerates trust |
| **System integrators** | For Enterprise customers in regulated industries (defence, government); SIs become implementation partners |
| **Marketplace cross-promotion** | Plugin authors who get featured pull customers; customer base pulls plugin authors — two-sided loop |
| **OEM / embedded** | Long-tail: PRYZM-as-a-component in larger AEC platforms (e.g. a Hypar-or-Bonsai integration that ships the PRYZM editor in their UI) |
| **Open-source community presence** | We are not OSS but the contract suite is public + the family-pack format is open; the OSS community is a recruiting + content channel |

### §3.3 — Channels we explicitly do NOT pursue

- **Paid advertising at scale** — small targeted experiments only. We do not run Google Ads at $1000/day for architects. The CAC math doesn't work + the brand voice doesn't fit hyped digital advertising.
- **Aggressive outbound SDR cold-calling** — Enterprise account-based outbound exists, but mass-cold-call is off-brand.
- **Direct-mail to architects** — out of scope.
- **Influencer marketing in the consumer sense** — architectural micro-influencers are content collaborators, not sponsored-post buyers.
- **TV / billboard / radio** — not at our stage. The customer base is too narrow.

---

## §4 — Geographic expansion

### §4.1 — Year 1 (2026): Western Europe + North America

**Primary**: UK, Germany, France, Netherlands, US (East Coast architecture firms).

Why: Highest concentration of mid-size architectural practices; mature BIM adoption (ISO 19650 in UK + Germany); good payment infrastructure; English + German + French translations (per [C46 §1.2](../02-decisions/contracts/C46-I18N-AND-L10N.md)) cover most of the market.

Region: **EU primary** per [C49 §1.2](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). UK customers default to EU region with explicit UK opt-in.

### §4.2 — Year 2 (2027): AP + UK-distinct + Eastern Europe

**Add**: Japan, Singapore, Australia, Sweden, Denmark, Poland, Czech Republic, dedicated UK region (split from EU).

Why: AP customers culturally + technically ready; Eastern European practices increasingly working on Western European projects; Japan/AP needs the AP region (Tokyo + Singapore secondary) per [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md).

### §4.3 — Year 3 (2028): CN + India + Brazil + Middle East (selectively)

**Conditional adds**: China (with PIPL + CSL compliance investment), India (Indian-architect cost-sensitive segment), Brazil (LatAm hub), Saudi Arabia + UAE (oil-revenue-funded mega-projects).

Each requires a regional ADR + compliance review per [C49 §1.2](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). Not all four ship in year 3; the pipeline + customer demand decide.

### §4.4 — Languages

Year 1 ships TIER 1 locales per [C46](../02-decisions/contracts/C46-I18N-AND-L10N.md): en-US, en-GB, de-DE, fr-FR, ja-JP. Year 2 adds TIER 2: es-ES, pt-BR, zh-CN. Year 3 evaluates RTL pilots (ar-SA, he-IL) for promotion.

---

## §5 — Pricing strategy

### §5.1 — The pricing thesis

PRYZM's pricing is anchored to **value per architect, not features per tier**. We charge for capacity (seats) + outcomes (gated features), not for arbitrary bundles. Pricing is set in [C39](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md); the strategic rationale:

### §5.2 — The four tiers

| Tier | Price | Target | Justification |
|---|---|---|---|
| **Solo** | $25 / month / seat | 1 seat — C1 Sofia | Below the Revit LT price; well above "freemium." Solo customers pay because the alternative (Revit LT + manual workflow) costs more in time. |
| **Studio** | £15 / seat / month | 2–5 seats — C2 Studio MORI | Per-seat, transparent. Comfortably below Revit per-seat ($2200/year ≈ $183/month). |
| **Mid-firm** | $35 / seat / month + clash module + ISO 19650 module | 11–50 seats — C3 BRAUER | Higher per-seat reflects advanced features (federated clash, BCF, ISO 19650). Still 60–70 % cheaper than Revit + Solibri + BIMcollab stacked. |
| **Enterprise** | $100 / seat / month + custom SKU | 50+ seats — C4 ARUP-style | Custom (BYOK, sovereignty, self-host, named CSM, 4 h SLA). 6-figure annual deals typical. |

### §5.3 — Why these numbers (the unit economics)

| Tier | Gross margin | CAC payback | LTV/CAC |
|---|---|---|---|
| Solo | ~75 % | ~3 months | ~12× (3-year retention) |
| Studio | ~78 % | ~6 months | ~18× |
| Mid-firm | ~82 % | ~12 months | ~25× |
| Enterprise | ~85 % | ~18 months | ~40× |

These targets drive sales-cycle investment: we can afford a sales engineer + a CSM for Enterprise because the LTV/CAC is 40×; we cannot afford a sales engineer for Solo because the LTV/CAC math would break.

### §5.4 — What we will NOT do on pricing

- **Freemium** — no free tier. The trial is the free experience; thereafter customers pay. Freemium destroys the Solo unit economics + commoditises the perceived value.
- **Per-feature add-on pricing at Solo/Studio** — these tiers get the whole product. Add-ons are Mid-firm + Enterprise only.
- **Per-user-per-month price increase faster than inflation** — customers see stable pricing as a moat. The 10 % every-2-years increase happens, but with 6 months' notice + the customer can lock in legacy pricing for 12 months.
- **Aggressive discount-from-list** — discounts > 25 % off list signal pricing weakness. We hold the line.
- **Per-project pricing** — too complex to administer + creates incentive to under-report.

### §5.5 — Marketplace pricing (C5)

Plugin authors set their own pricing; PRYZM takes 30 % via [C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). Free plugins are supported (no marketplace fee — the moat is the marketplace as distribution, not extraction).

### §5.6 — Education + non-profit + emerging-market pricing

- **Students**: free with proof of enrollment (a real-email-verification + university check). Strategic — the architect of 2030 should use PRYZM during their thesis.
- **Educators / academic institutions**: free for course use; named on the case-study page.
- **Non-profits + architecture-for-humanity-style organisations**: 50 % discount, manually granted.
- **Emerging-market PPP-adjusted pricing**: Solo/Studio tiers are PPP-discounted in a defined list of countries (India, Brazil, Indonesia, Vietnam, Egypt, Nigeria, etc.) — typically 50 % off list. The list is published; not negotiable.

---

## §6 — Growth loops

### §6.1 — The four growth loops we're building

| Loop | How it compounds |
|---|---|
| **PLG self-serve** — Sofia signs up + invites a colleague → Studio plan → invites more → expands seats | Compounds at organic customer growth rate |
| **Marketplace flywheel** — More customers → marketplace value → more plugin authors → more plugin diversity → more customers | Two-sided network effect; compounds at rate of plugin-author acquisition |
| **Reference + content** — Each happy mid-firm produces a case study → other mid-firms see it → trial → close | Compounds at retention rate (happy customers compound, unhappy don't) |
| **Open contract suite** — The 49-contract suite gets referenced in customer security questionnaires → makes Enterprise sales faster → more Enterprise deals fund more contract authoring | Compounds at deal-cycle rate |

### §6.2 — The growth-loop maths

We expect a steady-state where Loop 1 (PLG) acquires the long-tail of customers, Loop 2 (marketplace) provides defensibility, Loop 3 (reference) provides credibility for upmarket sales, Loop 4 (contracts) accelerates the Enterprise pipeline.

If any loop breaks, the others slow. We monitor each independently with named owners.

### §6.3 — Loops we will not pursue

- **Viral consumer-style growth** — architects don't share PRYZM links on Twitter at the rate consumers share TikToks; we don't pretend
- **Affiliate / influencer commission loops** — out of scope (off-brand)
- **Acquisition via M&A** — out of scope at the company stage we're at
- **Aggressive paid-acquisition loops** — explained in §3.3

---

## §7 — Retention model

Acquisition is half the GTM; retention is the other half. We track **net revenue retention (NRR)** as the primary metric, segmented by tier.

### §7.1 — NRR targets per tier

| Tier | NRR target at 12 mo | NRR target at 24 mo |
|---|---|---|
| Solo | > 95 % (low churn; rare expansion) | > 98 % |
| Studio | > 110 % (expansion via seats) | > 120 % |
| Mid-firm | > 115 % (expansion via seats + add-on modules) | > 130 % |
| Enterprise | > 120 % (expansion via seats + custom features) | > 140 % |

Below-target NRR triggers an investigation per the [C42 §1.9](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) NPS + CSAT review cadence.

### §7.2 — Churn classification + response

Customer churn falls into four causes; each gets a different response:

| Churn cause | Detection | Response |
|---|---|---|
| **Feature gap** — customer churned because we don't ship X | Exit interview | Roadmap input; if X is critical for many, it goes to engineering. If for one, we don't chase. |
| **Pricing pain** — too expensive at this stage | Exit interview + plan-tier downgrade signals | Solo plan + clear pause/cancel flow. We don't fight; we wait for them to come back. |
| **Onboarding gap** — never activated | Activation-funnel data (5-step milestone) | CSM + content + tutorial improvements |
| **Service failure** — bad support / SLA miss / DR incident | Support ticket history + SLA breach record | Apologise + credit per [C42 §1.14](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) + root-cause fix |

### §7.3 — The win-back motion

A churned customer is a candidate for win-back. Cadence:

- 30 days post-churn: "Here's what we shipped since you left" email (highlighting features that fix THEIR specific gap)
- 90 days post-churn: 30-day reactivation discount offer
- 12 months post-churn: marketing-only (newsletter)
- Win-back conversion rate target: > 12 %

---

## §8 — Sales-team shape

### §8.1 — Year 1 (PLG-heavy)

| Role | Count | Owns |
|---|---|---|
| Founder / sales-engineer hybrid | 1 | First Enterprise deals; demo to mid-firm leads |
| Customer success manager | 1 | Mid-firm + Enterprise onboarding; CSAT + NPS |
| Developer relations | 1 | C5 plugin developer experience |
| Support agent (per [C42](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md)) | 2 | Inbound support across PLG tiers |
| Content marketer | 1 | Blog + technical content; case studies |

Total: ~6 people. The product is the salesperson at Solo + Studio; this is intentional.

### §8.2 — Year 2 (Mid-firm scaling)

Add: account executive (Mid-firm focus, $150k OTE), sales engineer (technical depth for AEs to lean on), 2 more support agents, regional CSM (EU + US split).

Total: ~12 people.

### §8.3 — Year 3 (Enterprise + multi-region)

Add: Enterprise account executive(s) targeted at SI partnerships, security + compliance lead, regional sales (AP), marketplace partnerships lead.

Total: ~20 people.

### §8.4 — What we will NOT hire

- **Aggressive growth-hacker** style growth marketers — wrong brand voice
- **Hot-comm-trained outbound SDR rooms** at scale — wrong customer (architects don't take cold calls)
- **Enterprise-only sales team isolated from product** — the AE + SE pairs always stay close to engineering

---

## §9 — Pricing-page strategy

The pricing page at `pryzm.app/pricing` is the single most-tested artefact. Rules:

1. **Always read from the entitlement registry** (per [C39 §1.13](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)). Hand-edited HTML feature lists are forbidden.
2. **Three columns, one Enterprise call-to-action.** Solo / Studio / Mid-firm self-serve; Enterprise is "Talk to us."
3. **Compare-to-Revit cell** on at least one tier. The dominant competitor is named directly.
4. **No "Most popular" badge** — every tier serves a real persona; we don't manufacture preference.
5. **No "Save XX %" annual-discount banner** at the per-tier level — annual discount appears at checkout, not on the marketing page.
6. **No countdown / urgency timers** — off-brand.
7. **Currency localised** — UK customers see £; EU sees €; US sees $; JP sees ¥. Per Stripe Adaptive Pricing + [C46 §1.9](../02-decisions/contracts/C46-I18N-AND-L10N.md).

---

## §10 — Brand surfaces at acquisition

The architecture-related design press, the architecture conferences, and the architectural-academic community are the surfaces where PRYZM brand voice lives publicly.

The villa-rental site reminds us: **one tagline, well-placed, beats ten taglines well-meant**. Our marketing-page hero text is one sentence and one CTA. The pricing-page is one matrix and one Enterprise CTA. The case-study page is one customer story per case-study. We avoid the SaaS-marketing default of "10 features in 3 sections + 5 social-proof logos + 2 lead-magnets + a chatbot." Restraint is the brand.

The first emergency for any growth-marketing pressure to add chaff is: re-read the [manifesto §5 brand voice](./manifesto.md). The chaff is removed.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | Brand voice that the GTM honours |
| [positioning.md](./positioning.md) | Competitive case the GTM operationalises |
| [personas.md](./personas.md) | The customer archetypes the GTM targets |
| [platform-strategy.md](./platform-strategy.md) | Marketplace + developer GTM (C5) |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | GTM-specific risks |
| [../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) | Codified pricing tiers + entitlements |
| [../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) | Codified marketplace economics |
| [../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | Per-tier support that retention depends on |
| [../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) | Regional expansion sequencing |

---

*End — PRYZM Go-To-Market Strategy, 2026-06-01 — CANONICAL.*
