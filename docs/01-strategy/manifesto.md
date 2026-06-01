# PRYZM — Manifesto

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns the **founding intent**, the **brand voice**, and the **why-now**. It sits beside [product-vision.md](./product-vision.md) (the what and how) and above the contract suite. Use this when writing customer-facing copy, sales decks, recruiting collateral, or onboarding docs — every word PRYZM says traces back here.

---

## §1 — What we believe

Buildings are made of light. Of habit. Of weather. Of money. Of compromise.

The software that builds them treats them as geometry.

For thirty years the industry's answer to "how does an architect design a building?" has been a CAD command line in a 3D viewport. Walls are line segments. Doors are stretched holes. Rooms are derived polygons. The intent — the bedroom that needs a south window, the kitchen that needs a triangle, the corridor that must reach every room, the apartment a family will actually live in — sits in the architect's head and never enters the model.

PRYZM exists to fix this. We are building the first design platform where the model knows what it is and the conversation is the interface.

---

## §2 — The promise

> **One conversation, from raw site to coordinated building.**

That is the only promise. Everything else — the renderer, the file format, the constraint database, the marketplace, the sovereignty model, the WCAG audit — is in service of that single line.

When we ship a feature, we ask: does this make the single-conversation promise more true, less true, or the same? Features that don't move the needle don't ship.

---

## §3 — Why now

Three things became possible between 2023 and 2026:

| Capability | What changed | Why it matters to PRYZM |
|---|---|---|
| **Large language models with spatial reasoning** | Claude 3+ / GPT-4o handle "make the master bedroom face south and put the bathroom between it and the kids' room" as a coherent instruction | The brief becomes the input. The model becomes the output. The middle is the platform. |
| **Browser-native 3D at desktop performance** | WebGL2 → WebGPU; offscreen canvas; 60fps rendering of 10k+ elements in Chrome / Safari / Firefox without an installer | A BIM tool can finally run where the architect actually works — the browser. Not Windows-only. Not 18 GB downloads. Not per-seat license dongles. |
| **CRDT collaboration at design-tool fidelity** | Yjs and Automerge mature enough to hold a BIM scene with hundreds of concurrent edits; explicit-conflict semantics solved | Architects working with consultants, clients, and contractors in the same model — not in a chain of WeTransfer'd IFCs |

We are not early. We are not late. The wave is breaking. The window is open and will not stay open.

This is the bet: that an AI-native, browser-native, collaborative BIM platform built on these three capabilities replaces the Revit-and-WeTransfer workflow for a generation of architects, and that the architecture team that ships it first wins the decade.

---

## §4 — Who we are

We are the team building PRYZM. We are not a Revit replacement vendor. We are not a generative AI demo. We are not an image generator with rectangles on top.

**We are building a design intelligence platform for the built environment.** Every word matters.

- **Design** — not analysis, not visualisation, not documentation. The act of deciding what a building should be.
- **Intelligence** — the platform carries spatial, environmental, regulatory, and programmatic knowledge. It is not a passive editor.
- **Platform** — not a tool. Plugin authors, family creators, pricing catalogue vendors, and AI workflow developers extend it. The marketplace is a first-class surface.
- **Built environment** — buildings, but also rooms, neighbourhoods, sites, climates. We do not stop at the building envelope.

---

## §5 — Brand voice

The way we talk to customers, in three sentences:

> **Aspirational about the result. Plain-spoken about the work. Curated about what we ship.**

Every customer-facing surface — landing page, in-product copy, sales conversation, support email, conference talk — passes through these three filters.

### §5.1 — Aspirational about the result

The villa-rental ad does not say "47 affordable holiday properties available." It says **"Stay where the light is different."** That is the result, not the inventory.

When we describe what PRYZM does, we describe the design that comes out, not the toolbar. We describe the building the architect ships, not the panels they clicked.

| Don't say | Say |
|---|---|
| "Generate apartment layouts with our AI engine." | "Move from site to plan in one afternoon." |
| "BIM editor with IFC export." | "The model your engineer receives is the model you authored." |
| "Plugin marketplace with 47 extensions." | "Your office's domain knowledge, codified, paid for the work you already did." |
| "WCAG 2.2 AA accessible." | "Designed so a blind architect can lead a project, not just contribute." |

### §5.2 — Plain-spoken about the work

We do not promise magic. We do not claim our AI "understands buildings" — we claim our AI **routes a prompt through a 248-rule constraint database to produce a layout the architect refines**. Specifics are the credibility.

| Don't say | Say |
|---|---|
| "AI-powered." | "Routes your brief through 248 architectural rules and proposes layouts you can refine." |
| "Industry-leading performance." | "Cold-boot under 2.5 seconds on an M1 in Chrome. We measure it in CI every commit." |
| "Enterprise-grade security." | "EU customers' data stays in Frankfurt; failover to Dublin; never crosses sovereignty." |
| "Seamless interoperability." | "IFC4X3 round-trips with Revit. We test it nightly against 10 reference projects." |

The platform is full of complicated work. We name it. We do not hide it.

### §5.3 — Curated about what we ship

The villa rental does not list every property in Portugal. It lists **handpicked** ones. We ship features the same way.

We do not have a "Coming Soon" page. Every capability listed in product is shipped, measured, and supported. The roadmap is internal. The track record is external.

We ship to a higher bar than the industry expects. The default Revit user is browbeaten by software complexity into accepting workflows that take two weeks. The PRYZM user expects software to respect their afternoon.

---

## §6 — What we will not be

Equally important to keep the brand and product honest. We will not:

- **Build a Revit clone.** Revit exists. PRYZM is not a price-undercutting alternative; it is a different category of product. If a customer wants a faster Revit, PRYZM is not the answer.
- **Be the AI hype company.** AI is a technique we use, not a product we sell. We do not put "AI" in the company name. We do not name features after model versions. The customer's name on the building is what matters, not Anthropic's.
- **Sell shovel-ware to the construction industry.** PRYZM is for the *design* phase, where decisions are made. Construction-administration, facilities-management, asset-tracking — important markets, but adjacencies, not the core.
- **Compromise the file format.** `.pryzm` is open. IFC round-trip is real. No lock-in. Customers can leave with their data, and that fact alone constrains what we can do with the format forever.
- **Add features that don't pass the one-conversation test (§2).** Every backlog item is reviewed against the promise. Features that don't move the needle don't ship — they go to the marketplace as plugins where their authors can monetise them and we don't take responsibility.

---

## §7 — The shape of the company

PRYZM the company is built to ship the product PRYZM. Three structural commitments:

### §7.1 — Engineering-led, design-tasted

The decisions about what the product does are made by engineers who use it. The decisions about how the product feels are made by designers who understand engineering trade-offs. The two roles overlap and trade authority based on the question.

We do not have a "product team" that gathers requirements from a "design team" that hands specs to an "engineering team." We have one team that holds the whole shape.

### §7.2 — Open by default, paid by tier

Every customer-facing capability is documented publicly. The file format is open. The plugin SDK is open. The contracts (the suite C00–C49) are open. We trade the moat of secrecy for the moat of momentum.

We pay for the work via plan tiers ([C39](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) and the marketplace revenue share ([C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)). The first one is free for evaluation; the last one is "call us" because Enterprise needs are bespoke.

### §7.3 — Long-arc, not VC-financialised

We are building a 10-year company, not a 2-year exit. The roadmap (Phase 0 → Phase 3) spans years. The acquisitions we worry about are Revit-by-Autodesk-style (defensive incumbent moves), not exit-friendly inbound offers. We optimise for compounding capability + a customer base that renews — not GMV growth at the cost of unit economics.

Our north star metric is **net revenue retention of architects with > 12-month tenure**. Acquiring a new customer matters; keeping the architect who used PRYZM for three projects matters more.

---

## §8 — How this manifesto is used

This document is the source of truth for:

- The landing-page copy at `pryzm.app`
- The first slide of every external deck
- The "About PRYZM" page
- The voice + tone of customer support replies
- The voice + tone of the in-product onboarding
- The recruiting "About us" page
- The investor narrative (with financial framing added externally)
- The first chapter of the user manual
- The plugin developer's "why publish on PRYZM" page

If a customer-facing surface says something that disagrees with this doc — the customer-facing surface is wrong. Fix the surface.

---

## §9 — Cross-references

| Doc | Relationship |
|---|---|
| [product-vision.md](./product-vision.md) | The product details (what + how + roadmap) live there; this doc owns the *why* + brand voice |
| [engineering-vision.md](./engineering-vision.md) | The 8 architectural principles + 13 differentiators are codified there |
| [positioning.md](./positioning.md) | Competitive landscape + moats |
| [personas.md](./personas.md) | The customer archetypes (C1–C5) with day-in-the-life detail |
| [operating-principles.md](./operating-principles.md) | How the team works (culture + decision-making) |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | The bets we're making + what could falsify them |
| [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) | The 49 binding contracts that codify the platform's behaviour |
| [../NAMING-CONVENTIONS.md](../NAMING-CONVENTIONS.md) | Brand naming + identifier rules ("PRYZM", not "PRYZM 3") |

---

*End — PRYZM Manifesto, 2026-06-01 — CANONICAL.*
