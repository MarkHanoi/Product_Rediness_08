# PRYZM — Platform Strategy

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns the **platform thesis** — how PRYZM evolves from a vertical BIM editor into a multi-sided platform with Plugin SDK, Family Marketplace, AI Marketplace, Pricing Catalogue Marketplace, and per-discipline element vocabulary. The Plugin SDK + Family Platform exists in code today (`packages/family-{instance,loader,runtime}`, `apps/marketplace-web`, `apps/component-editor`, `server.js` family-marketplace routes) — this doc codifies the strategy that work serves.
> **Foundation above**: [manifesto.md](./manifesto.md) → [positioning.md](./positioning.md) → [personas.md](./personas.md) (esp C5)
> **Cross-cut**: [go-to-market.md](./go-to-market.md) (developer relations) · [site-and-cognition-strategy.md](./site-and-cognition-strategy.md) (the substrate the platform extends over)

---

## §1 — The platform thesis in one paragraph

PRYZM begins life as a vertical product (an AI-native BIM editor for architects) and **becomes a platform** over the next 36 months. The platform's value is not in PRYZM-the-company's ability to ship every element type, every regional drawing standard, every pricing catalogue, every typology-specific AI workflow — that is impossible. The platform's value is in **lowering the cost for third parties to ship those things** and **distributing the resulting work to architects who need it**. The three pillars are: **(1) Plugin SDK** for code-defined extensions, **(2) Family Platform** for parametric component definitions, and **(3) Marketplace** as the discovery + payment surface. All three pillars are first-class — none is a phase 2 add-on.

---

## §2 — Why a platform, not just a product

A vertical BIM editor's ceiling is determined by how many features one team can ship. A platform's ceiling is determined by how many features the ecosystem ships. Five reasons we go platform-first:

### §2.1 — The element vocabulary is unbounded

A building consists of "elements" — walls, doors, slabs, columns, beams, stairs, curtain walls, furniture, fixtures, equipment, signage, MEP, structural connections, etc. Each discipline + each region + each typology adds vocabulary. A Tokyo townhouse needs different door families than a Cologne apartment. A hospital needs medical equipment families that no residential project does.

PRYZM-the-company cannot maintain 10,000 element types curated for 50 regions across 12 typologies. The Family Platform allows the long tail to be authored, monetised, and consumed by the customers who need each fragment of vocabulary.

### §2.2 — Pricing catalogues are licensed third-party content

RSMeans (NA cost data), BCIS (UK cost data), Spon's (UK architectural cost data), regional equivalents — each is licensed proprietary data from organisations that have curated cost information for decades. We do not own this data and have no plausible path to authoring it ourselves. The Pricing Catalogue Marketplace (codified by [C38 Cost / 5D §4.2](../02-decisions/contracts/C38-COST-5D.md)) is where these vendors' content reaches PRYZM customers.

### §2.3 — AI workflows are domain-specific

The apartment-layout AI workflow is one of many possible. Office space planning is different. Hospital floor planning is different. Retail layout is different. The Plugin SDK + AI host allow third-party AI workflows to ship — owned by the firms that have domain expertise we don't.

### §2.4 — Regulatory + drawing-standard knowledge is per-jurisdiction

[C34 Print & Drawing Standards](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) lists nine drawing-standard regimes (AIA + RIBA + DIN + NF + JIS + UNE + ABNT + GB + ISO 19650 + others). PRYZM ships the engine; the per-region standard *content* (title-block templates, line-type conventions, naming conventions, mandatory annotations) is authored by per-region experts — published as marketplace packs.

### §2.5 — The integration surface is fractal

Customers ask: "Can PRYZM integrate with X?" — where X is BIM360, Procore, ArchiCAD's BIMcloud, Autodesk Construction Cloud, Bentley iTwin, Trimble Connect, Aconex, Asite, Newforma, Vectorworks, etc. We cannot build all integrations. The Plugin SDK lets the customer (or their preferred integrator) build the integration once and distribute it to other customers via the marketplace.

The conclusion: the long tail of customisation IS the product. The platform is how we serve it.

---

## §3 — The three pillars

### §3.1 — Pillar 1: Plugin SDK (code-defined extensions)

| | |
|---|---|
| **What it is** | A TypeScript SDK (`@pryzm/sdk`) that lets developers extend PRYZM with new commands, new panels, new AI workflows, new integrations, new exporters. |
| **Codification** | [C07 Plugin SDK & Marketplace](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) |
| **Status today** | `packages/plugin-sdk/` v1.0.0 — locally complete with `publishConfig.name=@pryzm/sdk`; 47 first-party plugins use it; iframe sandbox + Ed25519 signing + 6 host proxies + `pryzm dev` CLI + bSDD lookup client all shipped. **Manual step pending**: `pnpm --filter @pryzm/plugin-sdk publish --access public` to npm (OI-011). |
| **Customer-side experience** | Browse `pryzm.app/marketplace`, click install, plugin appears in their editor next session. |
| **Developer-side experience** | `pryzm dev init <name>`, develop in TypeScript, `pryzm dev publish`. |
| **Why architects care** | A solo-architect's office's domain knowledge becomes a plugin. Other architects pay for it. The first architect monetises their know-how without building a separate SaaS. |

#### What plugins do (canonical use cases)

- **Element types** — new geometry-element types (e.g. `plugins/lighting`, `plugins/plumbing`, `plugins/structural` already exist; community-authored ones extend coverage)
- **Workflow automation** — bulk operations, integrations with external services, customised batch creation
- **Exporters** — new file formats, regional drawing-standard exporters, internal-tool export adapters
- **AI workflows** — domain-specific layout engines beyond apartment-layout (office, retail, hospital, prison, school, museum)
- **Integrations** — BIM360, Procore, Bentley iTwin, Trimble Connect, ArchiCAD bridge, etc.

### §3.2 — Pillar 2: Family Platform (parametric component definitions)

| | |
|---|---|
| **What it is** | A second extension surface — **content** rather than **code** — where component-style definitions ship as `.pryzm-family` files. Parametric, regulated, geometry-rich. |
| **Codification** | [C07 §3](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md), [C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) (economics) + SPEC-26 family-file-format |
| **Status today** | Full P0 infrastructure shipped: `packages/family-{instance,loader,runtime}` (3 runtime packages) + `packages/schemas/src/family-{definition,request,parametric,geometry,schemas,registry,pipeline}` (7 schema packages) + `apps/marketplace-web/` (browse + Ed25519 verify) + `apps/component-editor/` (functional Family Creator with planegcs sketcher + 3D ops + parameter table). Server-side: `/api/v1/families/*` routes live in `server.js`. |
| **Customer-side experience** | Browse families ("Italian high-end kitchens 2026," "British-spec sliding doors," "JIS-compliant tatami modules"), drop into project, parametrically adjust. |
| **Developer-side experience** | Use `apps/component-editor/` (the dedicated Family Creator app): sketcher → constraint solver → 3D ops → parameter table → publish. |
| **Why architects care** | Real CAD-block-library replacement. Their existing CAD-blocks port to families; they earn revenue when other firms use them. |

#### What families do (canonical use cases)

- **Element libraries** — kitchens, bathrooms, staircases, façade modules, structural connections
- **Regional / regulatory content** — JIS-compliant door families, Part-M-compliant accessible WC families, ADA-compliant ramp modules
- **Brand-specific content** — supplier-published family packs ("IKEA Kitchen System 2026," "Velux Windows 2026")
- **Heritage / specialist** — Victorian-restoration cornice families, historic-window-type families, traditional-Japanese-joinery families

### §3.3 — Pillar 3: Marketplace (discovery + payment + trust surface)

| | |
|---|---|
| **What it is** | The user-facing storefront where plugins + families + pricing catalogues + drawing-standard packs + locale packs + rule packs + template packs are browsed, reviewed, installed, and paid for. |
| **Codification** | [C07](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) (technical) + [C40 Marketplace Economics](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) (economic) |
| **Status today** | Two SPAs shipped: `apps/marketplace/` (React, plugin browse + developer submission, port 5001) + `apps/marketplace-web/` (Vite, family browse + Ed25519 client-side verify). Server-side: `/marketplace/api/plugins/*` (browse, versions, reviews, submit, install, checkout, revocations) + `/api/v1/families/*` routes in `server.js`. DB: 5 marketplace tables (`marketplace_plugins`, `plugin_publisher_keys`, `plugin_revocations`, `plugin_purchases`, `plugin_reviews`). Stripe Connect billing wired with 70/30 split. **Manual step pending**: DNS `marketplace.pryzm.app` + TLS cert (OI-013). |
| **Customer-side experience** | Browse by category (element / workflow / export / AI / integration / regional), read reviews, install in one click. |
| **Developer-side experience** | Publish via `pryzm dev publish` (or family-pack equivalent), see analytics dashboard, monthly payout in own currency. |
| **Why architects care** | One trusted source. One signed-binary format. One payment surface. No emailing CAD-blocks back-and-forth. |

#### Six artefact kinds the marketplace carries

Per [C40 §1.1](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md), the marketplace treats six artefact kinds identically (70/30 split, 14-day refund, monthly payout):

1. **Code plugin** (Plugin SDK; the Pillar-1 surface)
2. **Family pack** (parametric components; the Pillar-2 surface)
3. **Pricing catalogue** (cost data; per [C38 Cost / 5D §4.2.5](../02-decisions/contracts/C38-COST-5D.md))
4. **Rules pack** (regulatory / program rules; per `rules/programRules.ts` substrate)
5. **Template pack** (project templates per-typology)
6. **Drawing standards pack** (per [C34](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md) — title blocks, scales, line types, conventions for a specific region/standard)

A future seventh kind — **Locale pack** (per [C46 §5.6](../02-decisions/contracts/C46-I18N-AND-L10N.md)) — extends localisation support. The taxonomy is open-ended; new kinds added per ADR.

---

## §4 — The platform flywheel

```
                  ┌──────────────────────┐
                  │  More architects     │◄────┐
                  │  using PRYZM         │     │
                  └──────────┬───────────┘     │
                             │                 │
                             ▼                 │
                  ┌──────────────────────┐     │
                  │  Larger market for   │     │
                  │  marketplace authors │     │
                  └──────────┬───────────┘     │
                             │                 │
                             ▼                 │
                  ┌──────────────────────┐     │
                  │  More authors        │     │
                  │  publishing          │     │
                  └──────────┬───────────┘     │
                             │                 │
                             ▼                 │
                  ┌──────────────────────┐     │
                  │  More + better       │     │
                  │  content available   │     │
                  └──────────┬───────────┘     │
                             │                 │
                             ▼                 │
                  ┌──────────────────────┐     │
                  │  PRYZM more valuable │     │
                  │  to architects       │─────┘
                  └──────────────────────┘
```

This is the two-sided-platform flywheel. The dynamic is well-understood from Stripe (developers + businesses), Shopify (merchants + app-developers), Apple App Store (consumers + developers), Steam (gamers + studios). Our version follows the same pattern at AEC-vertical scale.

The flywheel's slowest link is "more authors publishing." We invest in the developer relations programme and the published economic terms ([C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) is the contract a developer can read before signing up) to accelerate it.

---

## §5 — The sequencing: when each pillar becomes critical

### §5.1 — Year 1 (2026): Plugin SDK + Family Platform substrate ships; small marketplace

The infrastructure exists (it does). The first 50–100 plugins + families are PRYZM-first-party (the 47 plugins under `plugins/`) + a small number of early-adopter developers (~20). Marketplace economic flywheel begins but doesn't yet drive primary growth.

**Success criterion**: marketplace has > 100 published artefacts by end of year 1; > 20 unique developers earning > $500/month each.

### §5.2 — Year 2 (2027): Marketplace flywheel kicks in

Plugin authors who succeed earn enough to commit material development time. The marketplace catalogue grows to 500+ artefacts. PRYZM-first-party plugin development slows (replaced by external authoring). Customer expectation shifts: "is there a plugin for X?" becomes the natural question.

**Success criterion**: 50 % of new customer use-cases are served by marketplace artefacts (not PRYZM-first-party plugins).

### §5.3 — Year 3 (2028): Marketplace is the moat

The marketplace ecosystem becomes a switching cost. Competitors entering the category have no marketplace and cannot build one quickly. The "we have an apartment-layout engine" pitch is replaced by "we have the only marketplace where the apartment-layout engine, the regional drawing standards, the pricing catalogues, and the local-code-compliance rules all live in one place."

**Success criterion**: marketplace contains > 2000 artefacts; > 200 active developers; > 30 % of PRYZM revenue is from marketplace-adjacent products (premium tier features that gate marketplace usage, marketplace promoter placements, etc.).

---

## §6 — Why our marketplace is different from Autodesk's App Store

Autodesk has had a Revit + Forma app store for years. It is famously inactive — most plugins on it are unmaintained; revenue per developer is thin; the platform's ratio of effort-to-reward for developers is unfavourable.

The villa-rental site is curated; the Autodesk store is comprehensive-but-anonymous. We choose curated.

Our marketplace differs structurally:

| Dimension | Autodesk App Store | PRYZM Marketplace |
|---|---|---|
| **Revenue split** | 70/30 (favourable) | 70/30 (parity) — but with active payout cadence + chargeback policy |
| **Developer experience** | C++ + Revit API + Windows-only — steep | TypeScript + browser-native SDK + `pryzm dev` CLI — gentle |
| **Distribution mechanism** | Customer browses a sub-page on Autodesk's site | Marketplace is in-product; install is one click |
| **Customer trust** | Listings without curation; quality varies wildly | Curated category for regulated content (per [C40 §1.11](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)) |
| **Updates** | Author emails customers a new installer | Customers' PRYZM auto-updates the plugin (signed by Ed25519, sandboxed iframe) |
| **Visibility** | Long-tail listings get zero discovery | Editorial featured-placement opportunities (curatorial, not algorithmic) |
| **Economic floor** | Established-developer rewards none | [C40 §1.10](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) explicit established-developer benefits (fee waivers, priority support, featured placement) |
| **Trust mechanisms** | Customer reviews — gameable | Review-requires-purchase + fingerprint-cluster-detection per [C40 §1.9](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |

The bet: a 30 % cut split with a developer experience that's 10× better than Revit + a customer experience that's 10× better than Autodesk's app store creates an ecosystem the legacy player cannot match without rebuilding their substrate.

---

## §7 — The AI layer as platform (the L7.5 AI plane)

[C09 AI & Visibility Intent](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) codifies the AI plane as a first-class platform surface, not a bolted-on feature.

What this means for the platform thesis:

- **AI workflows ARE plugins**. The apartment-layout engine, the plan-critique workflow, the 3-options generator, the voice-command parser — all of them are AI workflows that follow the same registration pattern.
- **Third-party AI workflows are first-class**. A startup that builds a hospital-layout AI workflow ships it as a PRYZM plugin, not as a competing platform. Their reach is 10× via PRYZM's marketplace vs their own DTC effort.
- **The provenance model ([C23](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md)) applies uniformly**. Every AI artefact records its model, prompt, context, cost — whether PRYZM-first-party or third-party. Customers have one audit trail across all AI in their project.

This is the third long-term moat: **PRYZM becomes the canonical home for architecture-AI workflows**, the way Hugging Face has become the canonical home for open-source ML models. The customer using PRYZM gets every architecture-AI workflow author's product without buying ten separate SaaS subscriptions.

---

## §8 — The platform's contract surface (what we publish)

The platform is held together by the published contract suite. Five contracts most directly govern the platform:

| Contract | What it codifies |
|---|---|
| [C07 Plugin SDK & Marketplace](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) | The technical substrate (SDK, sandbox, signing, family format) |
| [C09 AI & Visibility Intent](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | The AI plane as platform surface |
| [C16 Command Authoring Protocol](../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | The shape of commands plugins dispatch |
| [C17 Batch Creation Catalogue](../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | The catalogue surface plugins extend |
| [C40 Marketplace Economics](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) | The economic contract between PRYZM + plugin authors |

A developer evaluating "should I publish on PRYZM?" reads these five docs. The economics + the technical substrate + the AI plane + the command authoring + the batch catalogue are all transparent. We trade the secrecy moat for the momentum moat — see [positioning §4.1](./positioning.md).

---

## §9 — What the platform does NOT do

We name the platform-boundary explicitly:

- **Not a generic web platform** — we serve AEC. A developer wanting to ship "a CRM extension for PRYZM" is misunderstanding the product.
- **Not a content commerce platform** — we are not Substack or Patreon. Customers buy code or data; not subscriptions to creators (though plugins themselves can be subscription-priced).
- **Not a low-code application builder** — we are not Bubble or Retool. Plugin authoring requires real code.
- **Not a marketplace for end-user services** (e.g. "hire a PRYZM-using architect via the marketplace") — out of scope; that would be Houzz or Bark, not us.
- **Not a marketplace for one-off file-trading** — we are not Sketchfab or 3D Warehouse for `.skp` files. Family packs are first-class parametric content with the platform's update + version + signing model, not flat 3D-model swaps.

---

## §10 — Sequencing the platform investment

### §10.1 — Year 1: substrate + first marketplace

| Investment | Outcome |
|---|---|
| `@pryzm/sdk` npm publish + docs | The SDK is consumable by external developers (closes OI-011) |
| `marketplace.pryzm.app` DNS + TLS | The marketplace is publicly browsable (closes OI-013) |
| Developer relations team (1 person) | First 20 external developers onboarded |
| Curation team (0.5 FTE) | Curated-category artefacts reviewed within 11-day SLA per [C40 §5.3](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) |
| First 5 marketplace case studies | Each documenting an external developer's path to first sale |

### §10.2 — Year 2: scale + ecosystem

| Investment | Outcome |
|---|---|
| Developer events (1 hackathon + 1 conference) | 100+ external developers attend |
| Marketplace-promoter editorial featured-placement | Per-week curated picks; community-discoverable |
| Family-platform expansion (more sketcher tools in `apps/component-editor/`) | Family-author barrier-to-entry drops |
| Plugin-author monthly newsletter | Top-developer revenue + ecosystem updates |
| Multi-language SDK docs | TypeScript canonical; per-locale plugin author onboarding |

### §10.3 — Year 3: ecosystem-as-moat

| Investment | Outcome |
|---|---|
| Marketplace-acquisitions team | Bring strategic plugins under PRYZM-first-party umbrella (rare; only when ecosystem-essential) |
| Platform-partnership programme | Enterprise plugin authors get dedicated CSM equivalent |
| Plugin-author conference (annual) | Community signal — PRYZM is committed to its ecosystem |
| Open governance on contract changes | Plugin-affecting contract changes go through public comment period |

---

## §11 — How we measure platform health

| Metric | Year 1 target | Year 2 target | Year 3 target |
|---|---|---|---|
| Active marketplace artefacts | > 100 | > 500 | > 2000 |
| Active developers (≥ 1 sale in trailing 90 days) | > 20 | > 100 | > 200 |
| Median active-developer monthly earning | > $500 | > $1500 | > $3000 |
| Top-decile developer monthly earning | > $5000 | > $20,000 | > $80,000 |
| Customer marketplace adoption (% of customers with ≥ 1 marketplace artefact installed) | > 30 % | > 60 % | > 85 % |
| Mean reviews per artefact | > 5 | > 12 | > 25 |
| Established-developer count (per [C40 §1.10](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)) | 0 (none yet qualified) | > 10 | > 50 |
| Marketplace contribution to PRYZM ARR | < 5 % | ~15 % | > 30 % |

If any year-N target is missed by > 25 %, the platform investment is re-examined.

---

## §12 — The risks the platform strategy faces

Cross-link to [risks-and-assumptions.md](./risks-and-assumptions.md) for full treatment. Briefly:

- **Chicken-and-egg cold start** — solved by PRYZM-first-party plugins seeding the marketplace + developer relations effort
- **Quality control + abuse** — solved by curated-category gate + fingerprint-cluster anti-abuse + review-requires-purchase
- **Author churn** — addressed by transparent economics + payout cadence + featured-placement opportunities
- **Marketplace-as-distraction** — the discipline is: the marketplace serves the editor's mission, not vice versa. We do not chase marketplace GMV at the cost of editor velocity.
- **Single-author dominance** — natural in early stages; mitigated as ecosystem matures + curation surface promotes diverse authors

---

## §13 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The platform reflects the brand's openness + curation |
| [positioning.md](./positioning.md) | The platform is the structural moat |
| [personas.md](./personas.md) — esp C5 | The plugin developer archetype |
| [go-to-market.md](./go-to-market.md) | Developer relations as a GTM channel |
| [site-and-cognition-strategy.md](./site-and-cognition-strategy.md) | The substrate the platform extends |
| [../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md](../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) | The technical substrate |
| [../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | The AI plane as platform surface |
| [../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md](../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | Command authoring surface |
| [../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md](../02-decisions/contracts/C17-BATCH-CREATION-CATALOGUE-AND-PANEL-BINDING.md) | Batch creation catalogue |
| [../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) | Marketplace economics |
| [../02-decisions/contracts/C46-I18N-AND-L10N.md](../02-decisions/contracts/C46-I18N-AND-L10N.md) | Locale-pack marketplace artefact |

---

*End — PRYZM Platform Strategy, 2026-06-01 — CANONICAL.*
