# PRYZM — Personas

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns the **customer archetypes (C1–C5)** with the depth a product team needs to make sensible feature decisions. The one-line summary in [engineering-vision.md §6](./engineering-vision.md) is the index; this is the long form.
> **Foundation above**: [manifesto.md](./manifesto.md) → [positioning.md](./positioning.md)
> **Cross-cut**: [go-to-market.md](./go-to-market.md) (how we reach each archetype) · [product-vision.md](./product-vision.md) (the user journey)

---

## §1 — How to use this doc

Every backlog ticket, every design decision, every pricing change asks: **which persona benefits?** A feature that doesn't sharpen the experience for at least one of C1–C5 is a feature we don't ship.

The five archetypes are exclusive (a customer is *one* of them — not all five — though their needs occasionally overlap). Tier assignments to the pricing ladder ([C39](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) follow:

| Archetype | Plan tier | Annual seats |
|---|---|---|
| C1 Solo architect | Solo | 1 |
| C2 Studio (boutique AEC) | Studio | 2–10 |
| C3 Mid-firm with consultants | Mid-firm | 11–50 |
| C4 Enterprise / GC / institutional | Enterprise | 50+ |
| C5 Plugin developer / family creator | (separate; marketplace revenue partner) | 0 (but consumes Studio seats for development) |

Each persona below carries: a name, a workplace, a typical day, a frustration with current tools, a "moment of truth" that converts them to PRYZM, the features that matter most, the features they won't pay for, and the metric we use to know we are serving them well.

---

## §2 — C1: Sofia Rojas — the solo architect

### §2.1 — Identity

Sofia is 34, RIBA-qualified, based in Porto (or Berlin, Amsterdam, Manchester — variations of the same archetype). She left a mid-size firm two years ago after her director made her redo a perfectly good south-facing apartment plan because the consultant's Revit model "didn't match" — she rebuilt the same building twice for no reason.

She now runs Rojas Arquitetura from a co-working space. Her clients are: a developer doing four-apartment infill schemes (~£600k builds), a couple converting a Victorian terrace, and a coffee-shop owner doing a refit.

She has Revit LT (£600/year — she can barely afford it). She has Archicad (a friend lent her a seat). She does most early-design in SketchUp because Revit is "where life goes to die."

### §2.2 — A day in her work life

08:30 — Coffee. Opens her laptop. The developer client emailed at midnight: "Can we get the first sketches by Friday for the planning pre-app?"

09:00 — She opens SketchUp. Pushes some boxes around. Three apartments per floor. She knows roughly what works.

10:30 — She switches to Revit because she needs IFC. Twenty minutes of progress bars. Click-drag-click-drag. The walls don't join properly at the L-corner. She googles "revit wall L corner doesn't join" — this is the 47th time.

13:00 — Lunch. She watches a YouTube video of an architect in California demoing some AI tool. She thinks: that's a toy.

14:00 — Back at Revit. The IFC export is wrong; the consultant's structural engineer reported the columns are off-grid. She manually re-aligns 38 columns.

19:00 — Done. The pre-app drawings exist. She still has not designed the actual apartments — those are six rectangles SketchUp told her would fit.

22:00 — Her son's bath. She thinks: there has to be a better way.

### §2.3 — The moment of truth

Sofia visits `pryzm.app` after seeing it on Instagram (an architect she follows posted a video of an apartment layout generating in real time). She signs up with Google. She clicks "Start a new project." The site asks:

> *Where is the project?*

She types her client's plot address. The site appears — real terrain, real surrounding buildings. She circles the plot. The platform suggests an envelope. She refines it.

> *Tell me about the building.*

She types: "Four 2-bed apartments per floor, three floors, lifts, residential street frontage to the south."

Twelve seconds later she has a floor plate with four apartments, a corridor, a stair core, a lift. She can see one apartment's plan. She moves the kitchen island. The platform asks if she wants to keep the change or revert. She keeps it.

She has done in 90 seconds what would have taken her 90 minutes. She wires Stripe. She is on PRYZM Solo at $25/mo by the end of the day.

### §2.4 — Features she cares about

| Feature | Why |
|---|---|
| Cold-boot under 2.5 s | Her time is the product. Slow software is theft. |
| Apartment generation from brief | The single biggest leverage moment in residential design |
| Real IFC export | Her consultants are in Revit + Tekla; she has to hand off |
| Lossless round-trip | When the consultant marks up the IFC, she gets the markup back without losing her plan |
| One-month trial of Studio tier | She'll grow into Studio when a second seat (her partner) joins |
| Honest pricing | $25/mo is a number she can justify against the Revit LT she's stuck with |

### §2.5 — Features she will NOT pay for

- Photoreal rendering — she uses Twinmotion when needed
- Detailed structural analysis — that's her consultant's job
- 4D / 5D — her projects are too small
- Custom enterprise SSO — overkill for one person
- 24/7 priority email — business-hours email is fine

### §2.6 — How we know we're serving her well

| Metric | Target | Why |
|---|---|---|
| Time from signup to first IFC export | < 30 minutes | The faster she's productive, the more likely she stays |
| Tickets / Solo customer / month | < 0.3 | Solo customers can't afford friction |
| Solo → Studio upgrade rate at 12 mo | > 15 % | Solo is the funnel; Studio is the retention |
| Solo NPS | > 50 | Sofia tells other solo architects about PRYZM or she doesn't |

---

## §3 — C2: Studio MORI — the boutique AEC practice (2–10 seats)

### §3.1 — Identity

Studio MORI is a 6-person Tokyo practice founded in 2019. Architecturally: 70 % small-residential (single-family + townhomes), 20 % interior fit-out, 10 % small commercial (cafés, shared workspaces). Average project value ¥80M – ¥200M ($550k–$1.4M).

The founders are Aiko (design lead, 41) and Kenji (BIM + delivery, 38). The other four are mid-level architects + one junior. They use Archicad (Aiko's preference; she finds Revit "soulless"), with one Revit license that Kenji uses for consultant-coordinated projects.

### §3.2 — Their organisational pain

MORI's pain is collaboration friction.

- Aiko sketches a concept in Procreate on iPad
- Kenji models it in Archicad
- One of the mid-levels does the detail drawings
- A junior compiles the schedules
- The structural engineer (external) wants IFC2X3 (Archicad gives him IFC4 — broken)
- The interior designer (external) wants DWG (Archicad gives her a 47-MB DWG that crashes her AutoCAD LT)
- The client wants PDFs they can review on a phone

Five people producing six file formats of the same building, and the file that hits the consultant is never quite right.

### §3.3 — The moment of truth

Kenji sees a PRYZM demo at a Tokyo BIM meetup. The presenter shows the multiplayer feature: two architects editing the same plan in real time, with conflicts surfacing as clear messages rather than silent overwrites. Kenji has been blocked on Archicad's BIMcloud-Teamwork model for years; the demo is a 3-second resolution of a 3-year frustration.

He signs MORI up for Studio tier the next morning (5 seats × ¥4,500/month, billed annually). The first project he migrates is a townhouse he's been struggling with for two weeks. The IFC export to the structural engineer arrives without errors. The engineer emails Kenji to ask what tool he switched to.

Within three months, MORI is a reference customer. They appear in a PRYZM case study on the marketing site.

### §3.4 — Features they care about

| Feature | Why |
|---|---|
| Multiplayer with explicit conflict resolution | The MORI-team-of-5 working pattern |
| Lossless IFC round-trip (especially IFC2X3 + IFC4X3) | Multiple consultants on multiple IFC versions |
| Apartment + multi-typology generation | Small-residential is their bread + butter |
| Plugin marketplace (especially for Japanese-specific content — JIS standards, Japanese drawing conventions per [C34](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md)) | Localisation matters; community-authored JIS content is reachable |
| Sheets + drawing-set + PDF export at publication quality | Client deliverables are pdf, frequently |
| BCF round-trip | Structural + interior + MEP consultants use it |
| 5-seat plan | Their team size matches the tier exactly |

### §3.5 — Features they will NOT pay for

- 4D / 5D / cost estimation — projects too small to justify; if needed, they outsource
- Enterprise SSO — Google Workspace covers it
- Named CSM — they want responsive email, not a relationship
- Self-host — happy with managed AP region

### §3.6 — How we know we're serving them well

| Metric | Target | Why |
|---|---|---|
| Multiplayer-conflict-resolution-success-rate | > 99 % | This is THE differentiator for them |
| IFC round-trip integrity (Pset + classification preservation) | 100 % | Lossy IFC is a churn cause |
| Studio NPS | > 60 | They are a reference + recruiting source for nearby studios |
| Studio churn at 12 mo | < 8 % | The "I tried it for a project + bounced back to Archicad" risk |

---

## §4 — C3: BRAUER + Partners — the mid-firm with consultants (11–50 seats)

### §4.1 — Identity

BRAUER + Partners is a 28-architect Cologne practice, 35 years old. They do mid-density residential (200–400 units / project), public buildings (schools, libraries), and corporate fit-outs (offices for ~500-employee tenants). Average project value €5–25M.

They have a senior BIM coordinator (Henrik, 47, ex-Autodesk consultant), a BIM-aware project architect on each project, and a partner-level director (Marlies, 52) who is the firm's IFC-and-ISO-19650 champion.

They use Revit (15 seats) + Archicad (3 seats, legacy from a partner who joined via acquisition) + Solibri (clash detection) + BIMcollab (issue management) + Navisworks (federated coordination, when a client mandates it).

### §4.2 — Their organisational pain

BRAUER's pain is **coordination cost + BIM-coordinator-as-bottleneck**.

Henrik is one person doing what should be a team. Every project on his desk requires:

- Federated clash detection (Solibri)
- BCF round-trip with consultants (BIMcollab)
- ISO 19650 phase compliance check
- Revit-to-IFC export validation
- Pset + classification sanity

The cost is structural: 28 architects, one Henrik. When Henrik takes a holiday, two projects slip.

Marlies' question over the past year: *can the BIM-coordinator role become a software feature?* She has trialled Autodesk Construction Cloud, Trimble Connect, and various Dalux-style tools. None of them solve the underlying problem.

### §4.3 — The moment of truth

A graduate hire from a Munich practice mentions PRYZM at her interview. Marlies investigates. She finds the [C36 Clash Detection contract](../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md) on the docs site. She reads it. She is impressed by the [C25 IFC Production contract](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md) — particularly the explicit Pset + Qto coverage matrix.

Henrik joins her on a sales call. He asks specifics: how do you handle BCF round-trip with Navisworks? How do you preserve IfcSpace + IfcZone on export? The PRYZM sales engineer answers — confidently, citing the contracts. Henrik trial-signs the firm up for Mid-firm tier (15 seats to start) on a 30-day evaluation.

By day 14 Henrik runs a federated clash review on a school project that used to take a week — it takes 90 minutes. He emails Marlies. "We need 15 more seats."

### §4.4 — Features they care about

| Feature | Why |
|---|---|
| Federated clash detection with the consultant ecosystem | Henrik's first-order pain |
| BCF round-trip with Solibri / Navisworks / BIMcollab | The existing-consultant-ecosystem reality |
| ISO 19650 phase compliance + audit trail | Public-sector projects require it |
| Production-grade IFC4X3 export | Government clients are starting to mandate IFC4X3 |
| Sheets + drawing sets + revision tracking | Mid-firm project size means revisions matter |
| Cost estimation (5D, [C38](../02-decisions/contracts/C38-COST-5D.md)) | Big enough projects to justify; QS hand-off via SAP |
| Schedule integration (4D, [C37](../02-decisions/contracts/C37-SCHEDULE-4D.md)) | Construction-phase planning value |
| Per-seat pricing at Mid-firm | $35/seat/month is comparable to Revit at scale |
| Plugin marketplace (private mode — install their existing CAD blocks as plugins) | Their 15-year-archive of detail blocks needs a home |

### §4.5 — Features they will NOT pay for

- Solo-tier features (they're long past) — they need every advanced feature on
- Photoreal rendering — they have a dedicated visualiser using Twinmotion + Enscape
- Direct construction-administration tools — they hand off to the GC's Procore + PlanGrid

### §4.6 — How we know we're serving them well

| Metric | Target | Why |
|---|---|---|
| BCF round-trip success rate | 100 % | Consultant trust is the asset |
| ISO 19650 audit pass rate | 100 % on Tier-1 audits | Marlies' job is on the line |
| Mid-firm NPS | > 55 | Mid-firms refer mid-firms |
| Henrik-equivalent productivity (minutes-saved-per-clash-review) | > 80 % vs the pre-PRYZM baseline | The structural BIM-coordinator-bottleneck thesis must work |
| Mid-firm net revenue retention | > 110 % | Mid-firms grow seat count; if NRR < 100, the customer churned |

---

## §5 — C4: ARUP-style firm — the enterprise / institutional customer (50+ seats)

### §5.1 — Identity

We pick ARUP as the archetypal example, though our actual C4 customers will include large GCs (Skanska, Bouygues), governments (UK Cabinet Office, US GSA), institutional clients (universities, healthcare systems), and 300-architect mega-firms (Gensler, Foster + Partners, NBBJ).

The buyer is typically a CIO or a head of digital design. They are evaluating PRYZM alongside Autodesk Construction Cloud, Bentley iTwin, and (sometimes) a custom-built internal platform.

### §5.2 — Their organisational pain

Enterprise pain is **risk + compliance + sovereignty + scale**, not feature velocity.

A 300-architect firm has 300 versions of "the right way to do X." A government client requires:

- ISO 19650 phase compliance
- Data residency (UK, EU, US — depending on the client)
- BYOK (the firm's KMS keys)
- SSO via Okta or Azure AD
- SOC 2 Type II report
- 7-year audit log retention
- IFC4X3 export validation
- Self-host option (for the most sovereign customers — defence, intelligence)
- 24/7 support with a named CSM

A startup-vendor selling them software loses on day one if any of these is missing.

### §5.3 — The moment of truth

The procurement-evaluation process is months long. The PRYZM Enterprise sales engineer walks the customer through:

- [C49 Multi-Region & Sovereignty](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md)
- [C22 Privacy & PII Tier](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md)
- [C48 Backup & DR](../02-decisions/contracts/C48-BACKUP-AND-DR.md)
- [C08 Collaboration & Security](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md)
- [C42 Customer Support Tier](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md)

Each contract is a published commitment the customer's legal team can read. Each is referenced in the MSA. Each has CI gates the customer can request evidence of.

The contract suite IS the sales motion for Enterprise.

The contract closes after a 6–9 month procurement cycle. The deal is six-figure annual + custom terms + a named CSM.

### §5.4 — Features they care about

| Feature | Why |
|---|---|
| Sovereignty (EU / US / AP / UK regions) | Non-negotiable |
| BYOK + customer-managed KMS | Non-negotiable for some customers |
| Self-host option | Defence + intelligence customers require it |
| Named CSM with 4 h SLA | Reflects the deal size |
| Audit log + ISO 19650 + SOC 2 evidence | Procurement gates |
| Federated clash + BCF + ISO 19650 phase compliance | C3 features + at scale |
| Revit round-trip | Their consultant ecosystem is Revit-locked |
| API + SDK + headless mode | They have internal tooling teams |
| SSO (Okta / Azure AD / Google Workspace) | Identity is centralised |
| Multi-tenant isolation guarantees | They host multiple jurisdictions in one tenant |

### §5.5 — Features they will NOT pay (separately) for

- Anything in lower tiers — they pay the bundle
- Marketplace plugins (they sometimes; often they build internal-only) — consume rather than pay |

### §5.6 — How we know we're serving them well

| Metric | Target | Why |
|---|---|---|
| Annual contract value (ACV) growth at 12 mo | > 20 % | Expansion via seats + premium features |
| Enterprise NPS | > 65 | Enterprise customers refer Enterprise customers; loss costs millions |
| Procurement-cycle compliance pass rate | 100 % | Failing a SOC 2 evidence request is a deal-killer |
| Enterprise customer escalation count / quarter | < 3 incidents | Enterprise customers experience operational pain at scale |
| Net revenue retention at 24 mo | > 130 % | Compounding expansion is the Enterprise model |

---

## §6 — C5: Lucia Demir — the plugin developer / family creator

### §6.1 — Identity

Lucia is 31, based in Istanbul, a self-taught architect-developer. She built a private library of Turkish-residential furniture families over four years for her own practice's projects. She also has scripts that auto-generate Turkish-code-compliant kitchen layouts (size, ventilation, refrigerator-placement rules per local building regs).

She is the kind of person who would, in another era, have sold a Revit add-in for $99 to maybe 50 firms. She is the marketplace customer.

### §6.2 — Her economic pain

Lucia's pain is **distribution + monetisation + technical liability**.

- Building a Revit add-in requires the Revit SDK (complex, Windows-only)
- Selling it requires running her own Stripe + tax + chargeback machinery
- Updating it requires emailing 50 customers every release
- Customer support is one-on-one email
- Revenue: ~$3000/year if she's lucky

Her time-vs-revenue math doesn't work. She has stopped maintaining the add-in and now does the customisations as paid consulting.

### §6.3 — The moment of truth

Lucia reads the [C07 Plugin SDK & Marketplace](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) contract. She reads the [C40 Marketplace Economics](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) contract. The 70/30 split is favourable; the monthly payout cadence is clear; the chargeback policy is sane; the curated category pathway suits her Turkish-code-compliance offering.

She uses the `pryzm dev` CLI to scaffold her first plugin. She ports her furniture library as a Family Pack. She publishes the Turkish-code-kitchen plugin to the curated marketplace. The PRYZM curation team reviews it (the back-office curation surface per [C40 §5.3](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)); it goes live in 11 days.

In her first six months on the marketplace, she earns more from PRYZM than she did in three years of selling her Revit add-in directly.

### §6.4 — Features she cares about

| Feature | Why |
|---|---|
| 70/30 revenue split | The economic engine |
| Stripe Connect payout (monthly, in TRY or USD per her settlement preference) | No payment-machinery overhead |
| Plugin SDK in TypeScript | No Revit-SDK learning curve |
| `pryzm dev` CLI for local development | Iteration speed |
| Family pack format (`.pryzm-family`) | Her existing CAD-library is portable |
| Curated category pathway for regulated content | Her compliance-claim is reviewed |
| Established-developer threshold + chargeback fee waiver | She is on the long-term economic ladder |
| Reviews + ratings | Her work gets visibility |
| Sales-CSV export + tax-form gating | Her accountant-and-self need it |

### §6.5 — Features she will NOT pay for

- Customer-side subscription (Lucia might also be a PRYZM customer, but the developer side is what matters here)
- Family-marketplace listing fees — that's a moat we don't extract

### §6.6 — How we know we're serving her well

| Metric | Target | Why |
|---|---|---|
| Time from `pryzm dev init` to live publication | < 30 days for an experienced developer | If onboarding is faster than Apple's App Store, developers choose us |
| Developer earnings per month (median across active developers) | > $500 at 12 mo, > $2000 at 24 mo | Real economic engine |
| Developer NPS | > 60 | Lucia tells other plugin developers about PRYZM |
| Plugin-to-customer reach ratio | > 1:5 (each published plugin reaches ≥ 5 customers) | The marketplace must actually distribute |
| Developer churn at 12 mo | < 15 % | A developer who publishes once + leaves is a sign of broken economics |

---

## §7 — The persona-to-feature mapping

A summary view: which feature serves which persona primarily?

| Feature | C1 Solo | C2 Studio | C3 Mid-firm | C4 Enterprise | C5 Developer |
|---|---|---|---|---|---|
| Apartment generation | ★ | ★ | ★ | ☆ | — |
| Multiplayer with explicit conflicts | ★ | ★ | ★ | ★ | — |
| IFC round-trip (lossless) | ★ | ★ | ★ | ★ | — |
| Federated clash + BCF | — | ☆ | ★ | ★ | — |
| Sheets + drawing sets + revisions | ☆ | ★ | ★ | ★ | — |
| 5D cost estimation | — | — | ★ | ★ | — |
| 4D scheduling | — | — | ☆ | ★ | — |
| ISO 19650 phase compliance | — | ☆ | ★ | ★ | — |
| Sovereignty + BYOK + self-host | — | — | ☆ | ★ | — |
| Plugin SDK + marketplace | ☆ (consumer) | ★ (consumer) | ★ (consumer) | ★ (consumer) | ★ (producer) |
| Apartment-layout AI workflows | ★ | ★ | ★ | ☆ | — |
| WCAG 2.2 AA accessibility | ☆ | ★ | ★ | ★ | — |

Legend: ★ = primary driver of value · ☆ = secondary · — = not relevant

The chart is itself a hiring filter: when we hire a product manager, they look at this chart and identify under-served personas. The work-on-the-edge of the table (the ☆ cells) is where C-tier-promotion happens (e.g. C2 Studio → C3 Mid-firm via sheets + BCF + ISO 19650 maturity).

---

## §8 — Anti-personas (who we will NOT pursue)

Naming the anti-persona is as important as naming the persona. We will not pursue:

| Anti-persona | Why we say no |
|---|---|
| **The Revit-clone seeker** — wants PRYZM to be exactly Revit but cheaper | We are a different category. We will lose to free Revit-clones, and rightly. |
| **The fully-autonomous AI building generator buyer** — wants PRYZM to design the building for them, no architect-in-the-loop | The architect-in-the-loop is constitutive of PRYZM. We are not the right vendor. |
| **The construction-only customer** — General contractor primarily, no design-phase use | PRYZM is for the design phase. Construction administration is Procore / PlanGrid. |
| **The single-project / one-time-use buyer** — Doesn't want a subscription, wants a one-off license | Our economics depend on renewal. We do not sell perpetual. |
| **The Windows-only / on-prem / air-gapped customer** — Cannot use any cloud component | We are browser-native + cloud-backed. Self-host helps but requires basic internet for some workflows. |

Each anti-persona is a deal we lose by design. Naming them clarifies the deals we should NOT chase.

---

## §9 — How personas evolve

A persona is not static. Sofia (C1) hires her first employee — now MORI-like (C2). MORI grows past 10 architects — now BRAUER-like (C3). BRAUER opens a US office, acquires another firm, doubles to 60 architects — now ARUP-style (C4).

The persona evolution is the customer-lifecycle. Our product surface must support the lateral move at each transition:

- **C1 → C2**: add a second seat, add basic multiplayer. Pricing change is automatic (Studio plan).
- **C2 → C3**: add BCF + clash + ISO 19650 access. Pricing change is automatic (Mid-firm plan).
- **C3 → C4**: open Enterprise contract negotiation. The transition is sales-led, not self-serve.
- **(Any) → C5**: customer becomes a plugin developer. Not exclusive — they continue paying as a customer.

A customer who can grow without leaving PRYZM is a customer the LTV math compounds for. The persona evolution is the deepest moat we can build.

---

## §10 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The brand voice the personas trust |
| [positioning.md](./positioning.md) | The competitive case per-persona |
| [go-to-market.md](./go-to-market.md) | The acquisition + retention strategy per-persona |
| [product-vision.md](./product-vision.md) | The user journey personas experience |
| [platform-strategy.md](./platform-strategy.md) | C5's economic ladder |
| [../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md) | Personas → plan tiers |
| [../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) | C5's economic engine |
| [../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | Per-persona support SLA |

---

*End — PRYZM Personas, 2026-06-01 — CANONICAL.*
