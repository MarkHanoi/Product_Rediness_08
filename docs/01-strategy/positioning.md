# PRYZM — Positioning

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns **the competitive landscape, the differentiation thesis, and the moats**. Where two strategy docs disagree about a competitive claim or a category boundary, this doc wins.
> **Foundation above**: [manifesto.md](./manifesto.md) (founding intent + brand voice) → [product-vision.md](./product-vision.md) (what + how + roadmap)
> **Cross-cut**: [personas.md](./personas.md) (who we serve) · [go-to-market.md](./go-to-market.md) (how we sell)

---

## §1 — The category we're entering

PRYZM is not entering "the BIM tool market." The BIM tool market is a 30-year-old duopoly (Autodesk Revit + Graphisoft Archicad) with stable share, locked-in customers, and an exit price that nobody can match.

PRYZM is entering **the design intelligence platform category**. The category does not yet exist as a defined market segment. We are defining it.

A design intelligence platform is a piece of software where:

- The architect's brief is an input (natural language or structured)
- The platform carries spatial, environmental, regulatory, and programmatic constraints
- The platform proposes design candidates (one or many)
- The architect refines, accepts, or rejects — and the model adapts
- The final output is real BIM data (IFC4X3 or proprietary equivalent) — not a render, not a sketch

Three startups attempted this category and missed: **Spacemaker** (acquired by Autodesk 2020; became Forma; now a site-massing tool, not a design platform), **Hypar** (developer-facing parametric platform; never crossed the chasm to architects), **Higharc** (residential-developer focused; narrow vertical).

We re-enter with three advantages they did not have: large-language-model brief understanding, browser-native 3D at design fidelity, and CRDT collaboration. None of the three existed when the prior attempts launched. The category re-opens because the substrate changed.

---

## §2 — The competitive map

We name competitors directly. Customers do too — pretending they don't compete with us undermines our credibility.

### §2.1 — Direct competitors (overlap on customer + use case)

| Competitor | What they do | How PRYZM differs |
|---|---|---|
| **Autodesk Revit** | The market-leading BIM authoring tool. Windows-only. Per-seat licensing. 18 GB install. Used by ~70 % of large practices. | PRYZM is browser-native (D2), one-conversation-to-plan (the promise §2 in manifesto), and round-trips Revit losslessly via IFC4 + the Revit Round-Trip Contract ([C26](../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md)). We are not a replacement; we are the front-end where the brief becomes a model, and Revit is one of the back-ends where the model gets documented. |
| **Graphisoft Archicad** | Mac-friendly BIM authoring. Smaller market share than Revit but better-loved. EU-popular. | Same positioning vs Archicad as vs Revit. Archicad customers are a softer migration target because they already value the design-first ethos PRYZM amplifies. |
| **Autodesk Forma** | Site-level massing + early-stage feasibility. Cloud-based. Limited room-level. | Forma is upstream (site decisions); PRYZM goes from site through floor plans to interior. Forma → IFC → PRYZM is a legitimate workflow we support. We compete on depth past the massing stage. |
| **Bonsai (formerly BlenderBIM)** | Open-source BIM-in-Blender. Real IFC. Free. Steep learning curve. | Bonsai's IFC implementation is excellent and we share the open-format ethos. We differ in audience (PRYZM targets practising architects; Bonsai targets IFC-curious developers) and in interaction model (conversation-first vs Blender-paradigm). |
| **Qonic** | Browser-native BIM startup; collaboration-focused; Antwerp-based. | We share substrate (browser-native + collaborative) but differ in AI thesis. Qonic is a more conventional editor; PRYZM bets on the design-intelligence layer. |
| **Motif** | Browser-native BIM startup launched 2024; well-funded; UX-led. | Closest substrate-match competitor. We watch them carefully. We bet our differentiation is the spatial-intelligence layer (constraint DB + cognition stack); they appear to bet on the UX-first thesis. Both bets may be right — different customer subsets respond to each. |
| **Pascal** | New browser-native BIM platform; community-built; open-source-leaning. | Genuine substrate cousin (browser + collaboration + open format). Architecture-level: their Scene Registry pattern validates our spatial-index direction. We differ on platform extensibility (PRYZM has a marketplace; Pascal has community plugins) and on the cognition-stack thesis. |

### §2.2 — Adjacent competitors (overlap on capability, not customer + use case)

| Competitor | What they do | Why customers compare us |
|---|---|---|
| **Hypar** | Parametric generation platform; developer-facing API; web-native. | Customers asking "can I script PRYZM?" sometimes consider Hypar instead. We answer: PRYZM has a Plugin SDK (no-code customers don't script; developers ship plugins to the marketplace). |
| **Vectorworks** | Mac-popular BIM/CAD; design-friendly. | Smaller-firm customers who couldn't afford Revit. Some are PRYZM-target. |
| **Sketchup** | Conceptual modeller; widely used early-design tool. | Architects use Sketchup for napkin-sketch + PRYZM for "real" design. We compete on "Sketchup → IFC is broken; PRYZM goes directly to IFC." |
| **Rhino + Grasshopper** | Parametric NURBS modelling + visual scripting. Computational-design favourite. | A different customer segment (computational designers). We round-trip Rhino via [C33](../02-decisions/contracts/C33-RHINO-INTERCHANGE.md) so the two coexist. |
| **Midjourney / Stable Diffusion** | Generative AI image tools. | Customers (and journalists) sometimes conflate "AI for architects" with image generation. We educate: PRYZM produces buildings, not pictures. |
| **Coram AI / Tract / Higharc / Architechtures** | Various residential-AI startups. | Narrow verticals. We're broader. Customers occasionally evaluate one of these for residential and PRYZM for everything else. |

### §2.3 — Non-competitors customers ask about

| Tool | Why it's NOT a competitor |
|---|---|
| **Navisworks** | Federated clash detection; we round-trip BCF with it ([C36](../02-decisions/contracts/C36-CLASH-DETECTION-AND-COORDINATION.md)) but do not author clash |
| **Solibri** | Model-checking + rule-based clash; same — BCF round-trip partner |
| **Synchro / Asta** | 4D scheduling; we export to via [C37](../02-decisions/contracts/C37-SCHEDULE-4D.md) |
| **CostX / SAP / Sage** | Cost estimation downstream; we export via [C38](../02-decisions/contracts/C38-COST-5D.md) |
| **Twinmotion / V-Ray / Enscape** | Photoreal rendering; we round-trip but do not photoreal |
| **Archicad MEP / Revit MEP** | MEP detailing; we author at the architectural level; consultants take over via IFC |

---

## §3 — The differentiation thesis (the 13 D-numbers)

These are the bets that distinguish PRYZM from every named competitor. Each is also codified as a "D-number" in [engineering-vision.md §4](./engineering-vision.md). The strategic thesis behind each:

### §3.1 — Substrate differentiators (the table-stakes for the category)

| # | Bet | Why this matters competitively |
|---|---|---|
| **D1** | **Open `.pryzm` format + lossless IFC4 round-trip** | Removes the lock-in objection that has kept architects in Revit. A customer can leave PRYZM with their full project; they choose to stay because the platform is better, not because their data is held hostage. |
| **D2** | **Browser-native** | Removes the install + IT-procurement + Windows-only barrier. An architect can try PRYZM in three clicks on a Chromebook. No deployment friction means PLG-driven distribution is possible. |
| **D3** | **Real-time collaboration with explicit conflicts** | The chain of WeTransfer'd IFCs is the canonical architect-consultant workflow pain. PRYZM solves it. Explicit conflicts (P8) means we ship CRDT correctness, not LWW illusion. |

### §3.2 — Platform differentiators (the moat)

| # | Bet | Why this matters competitively |
|---|---|---|
| **D4** | **Plugin SDK with marketplace** | Third-party developers extend PRYZM. The platform compounds: each plugin author who succeeds makes PRYZM more valuable to customers who would otherwise leave for a vertical-specific tool. Marketplace economics in [C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md). |
| **D5** | **AI as a first-class layer** | AI is not a feature; it is a substrate. The visibility-intent system, the constraint database, the apartment-layout engine are all "AI" that we control end-to-end. Competitors retrofitting AI to legacy editors will struggle to match the cohesion. |
| **D9** | **Pascal-editor-grade family creation** | The plugin marketplace requires families. The family editor must be first-class, not afterthought. Most platform plays fail because the family-creation surface is too painful for the long tail of authors. |
| **D11** | **Architecturally sound Sheet & PDF export** | The Revit-quality moment for many customers is when they print drawings. If our sheets look amateur, the entire credibility collapses. Vector PDF + drawing standards + revision tracking are first-tier work. |
| **D12** | **Native Revit round-trip** | The killer integration for the existing 70-% Revit market. We do not ask customers to leave Revit. We ask them to do the *design* in PRYZM, then hand off to Revit for documentation if their office requires it. |
| **D13** | **BIM 3.0 Inspect + Data Model** | The data layer that competitors do not have. Bulk-edit, schedule, query, automate — the architect's productivity layer. The Revit Schedules feature is universally beloved + universally limited; PRYZM ships a strictly better version on day one. |

### §3.3 — Trust differentiators (the enterprise moat)

| # | Bet | Why this matters competitively |
|---|---|---|
| **D6** | **Sovereignty default** | EU customers' data stays in EU. Customer-managed keys supported. This is table stakes for enterprise sales in 2026+, and the legacy desktop tools have no story for it. Codified in [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md). |
| **D7** | **Self-host minimum** | A team of 5 can run PRYZM on their own AWS account in < 1 day. For sovereignty-sensitive customers (defence, government, certain EU markets), this is the difference between yes and no. |
| **D8** | **Federated clash detection** | We work as the third party in a federated review (Solibri / Navisworks / BIMcollab). The architect using PRYZM doesn't isolate themselves from the consultant ecosystem. |
| **D10** | **Honest performance contracts** | 17 NFTs measured in CI every commit. The customer who buys PRYZM gets the cold-boot, frame budget, and bundle-size targets we publish, not the "best-case marketing demo" numbers. Codified in [engineering-vision.md §5](./engineering-vision.md). |

---

## §4 — The moats

A moat is a structural feature that makes it cost more for a competitor to catch up than it costs us to extend the lead. We name our moats with the same honesty we name competitors.

### §4.1 — Technical moats

| Moat | Strength | How it compounds |
|---|---|---|
| **The constraint database (248+ architectural rules)** | Strong | Every new rule + every new typology adds to the asset. A competitor cloning the API has to clone the rules too — and the rules took years of architect-curation to assemble. |
| **The 49-contract suite** | Strong | The CI gates that enforce the contracts make adding the *next* feature cheaper than competitors can do without the gates. A 5-year-old codebase without our gate culture cannot match our PR cycle speed. |
| **The layered architecture (L0–L9 with hard import boundaries)** | Strong | Refactoring is safe at PRYZM speed. The 8 principles (P1–P8) compound: every PR makes the next PR faster. Competitors with `(window as any)` baggage cannot refactor safely. |
| **The open file format** | Asymmetric | Customers leaving is free; switching from competitor formats to `.pryzm` is the high-friction direction. Our openness makes us the natural exit destination, not the entry trap. |
| **Family Platform with marketplace** | Compounding | Once 100 families are on the marketplace, the customer-value cost of leaving PRYZM rises sharply. The marketplace is the structural lock-in — earned, not extracted. |

### §4.2 — Distribution moats

| Moat | Strength | How it compounds |
|---|---|---|
| **PLG-able product (no install, no procurement)** | Medium | A solo architect can sign up, try, and stay paying — no enterprise sale needed for the first $25/mo. Distribution efficiency compounds as the funnel matures. |
| **Open-source-adjacent community** | Medium | The Plugin SDK + the IFC openness + the contract suite being public attracts the kind of architect-developer who becomes a marketplace contributor + a customer + a recruiter. |
| **Marketplace network effects** | Compounding (post-100-plugins) | Each marketplace plugin makes PRYZM more valuable; each PRYZM customer makes the marketplace more lucrative for plugin authors. Two-sided market dynamics kick in. |

### §4.3 — Trust moats

| Moat | Strength | How it compounds |
|---|---|---|
| **Honest perf + accessibility + sovereignty commitments** | Compounding | Enterprise sales are won by the team that *already* meets the bar, not the team that promises to. Our 49-contract suite + CI gates + audit cadence put us in the "already meets the bar" category for SOC 2, WCAG 2.2 AA, GDPR, EU sovereignty — at startup scale. |
| **No-lock-in promise (D1)** | Medium | Customers buy from companies they can leave. Easy exit is paradoxically the strongest lock-in we offer. |
| **Brand voice (curated, plain-spoken)** | Asymmetric | The industry's competitor language is corporate + hype-laden. Our voice is the inverse. Architects (a community that values precision in language) find our copy distinctive in a few-second scan. |

### §4.4 — What we are NOT defending

It is equally honest to name the things we are not defending:

- **Geometry kernel sophistication** — `geometry-kernel` is 12k LOC and growing, but a competitor with sufficient resources can match it in 6–12 months. We do not bet our durability here.
- **3D viewport polish** — every browser-native BIM tool will reach the same 60 fps Chrome rendering. We are not the rendering moat company.
- **Single-feature differentiation** — if our entire pitch were "PRYZM has the apartment-layout engine," we would lose to whoever ships theirs second with better marketing. The moat is the *combination* — the platform, not any one capability.
- **Pricing as a moat** — we are not the cheapest. Trying to be defends nothing.

---

## §5 — The two-sided positioning

Like the villa-rental site's "FOR OWNERS" nav item — PRYZM has two customer surfaces:

### §5.1 — Demand side: architects + designers + developers

The primary surface. They use PRYZM to make buildings. They pay subscriptions ([C39](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)).

### §5.2 — Supply side: plugin authors + family creators + content vendors

The platform surface. They build for PRYZM. They earn 70 % revenue share via the marketplace ([C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)).

The reason this matters: every demand-side customer makes the supply-side opportunity larger; every supply-side investment in the marketplace makes the demand-side product more valuable. The dynamic mirrors Stripe (developer-side API + business-side payments), Shopify (merchant-side store + app-developer-side ecosystem), and Apple (consumer-side iPhone + developer-side App Store).

Two-sided platforms are hard to start (chicken-and-egg) and hard to disrupt (network effects compound). We are explicitly building one, slowly. The first year is demand-heavy. The second adds the SDK + marketplace seriously. The third has critical-mass supply.

---

## §6 — Where we DO NOT compete

The discipline of saying no. We will lose deals where the customer needs:

- **Detailed structural analysis (FEM)** — we round-trip to ETABS / Tekla / SAP via IFC; we do not solve. Customers who need structural calc primary tool buy a structural calc tool.
- **MEP detailing at the consultant level** — architectural-level MEP is supported; consultant-grade detailing is the consultant's tool job.
- **Construction administration as the primary tool** — we author; the contractor takes the IFC. PlanGrid / Procore are the CA tools.
- **Facility management primary tool** — we export COBie ([C35](../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md)); customers run Archibus / Maximo for FM.
- **Photoreal final renders** — we round-trip to Twinmotion / V-Ray. Final renders happen elsewhere.
- **AI-only generation (no architect in the loop)** — PRYZM is a platform for architects to design *with* AI. Customers wanting fully-autonomous building generation are not our customer.

If a customer's primary use case is one of these, we say "we are not the right tool" and refer them. Saying yes to everything is the surest way to be excellent at nothing.

---

## §7 — The "why us" line by segment

Compressed positioning per customer archetype (see [personas.md](./personas.md) for full personas):

| Archetype | Why PRYZM in one sentence |
|---|---|
| **C1 Solo architect** | "Cold-boot in 2.5 seconds, design at the speed of your thinking, ship IFC your consultants accept — for $25/mo." |
| **C2 Studio (2–10 seats)** | "Your office's domain knowledge becomes plugins your team installs in one click. Stop emailing CAD blocks." |
| **C3 Mid-firm (11–50 seats)** | "Your BIM-coordinator role becomes a tool, not a person. Federated clash, BCF round-trip, ISO 19650 phases." |
| **C4 Enterprise (50+ seats)** | "EU sovereignty by default; BYOK supported; SOC 2 + audit log + self-host option from week one." |
| **C5 Plugin developer** | "70 % revenue share; one marketplace; one signed bundle format. Stop running your own Stripe integration." |

These are the lines that go on the landing page, in the sales deck's first slide per-segment, and in the support team's first-reply template.

---

## §8 — When to update this doc

Trigger conditions for a re-write:

- A new competitor enters the substrate (browser-native + AI-first + IFC-real)
- An existing competitor pivots into our category
- One of the 13 differentiators (D1–D13) is matched by a competitor (re-stack the moat)
- A category-redefining acquisition (e.g. Anthropic acquires Forma, or similar)
- A regulatory or technology shift (e.g. ISO 19650-3 publishes; WebGPU becomes default)

Otherwise: stable. Strategy positioning should not chase quarterly market noise.

---

## §9 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The founding intent + brand voice this positioning expresses |
| [product-vision.md](./product-vision.md) | The product capabilities this positioning describes |
| [engineering-vision.md](./engineering-vision.md) | The D1–D13 differentiators codified |
| [personas.md](./personas.md) | The customer archetypes (C1–C5) per-segment positioning addresses |
| [go-to-market.md](./go-to-market.md) | How we operationalise the positioning into channels + pricing |
| [platform-strategy.md](./platform-strategy.md) | The two-sided platform thesis |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | What could falsify the positioning thesis |
| [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) | The contract suite that codifies the platform's behaviour against the competitive landscape |

---

*End — PRYZM Positioning, 2026-06-01 — CANONICAL.*
