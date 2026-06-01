# PRYZM — Risks & Assumptions

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns **the named bets PRYZM is making and what could falsify them**. Every strategic claim elsewhere in `01-strategy/` rests on assumptions; this doc surfaces them. If an assumption is invalidated, the strategy doc that depends on it must be revised — not silently abandoned.
> **Foundation above**: every other doc in `01-strategy/`. This doc is the audit trail for the strategy.

---

## §1 — Why this doc exists

Strategy docs that don't name their assumptions become dogma. Six months later, the world has moved, the assumption is invalid, and the strategy doc reads like wishful thinking. The discipline: **every claim about market, technology, customer, or competitive behaviour traces to an assumption named here**.

When an assumption flips:

1. We update the relevant section of this doc with the flip + the date + the evidence
2. We revisit the strategy doc(s) that depend on the assumption
3. We update those docs explicitly (per the [operating principles O5](./operating-principles.md) discipline of editing canonical docs, not writing audit-replacements)
4. We communicate the change to the team + to relevant customers

This doc is itself written in pencil. It is the strategy's mutable shadow.

---

## §2 — The core thesis bets

These are the foundational claims. If any of them is wrong, PRYZM-the-strategy needs significant revision.

### §2.1 — Bet 1: AI changes the design phase materially

**The claim**: Large language models with spatial reasoning capability (Claude 3+, GPT-4o+, and their successors) reach a level where the *brief* is a sufficient input to produce a *plan* the architect refines — meaningfully accelerating the design phase. The 90-second apartment-layout generation is real and customers value it.

**What would falsify it**: (a) AI quality plateaus before reaching the architect-useful threshold — the platform is then a marginally-better Revit, not a category-changing tool. (b) The cost of API tokens stays high enough that the marginal economics don't work — we cannot afford to give every architect $500 of API calls per month at Solo pricing. (c) Architects culturally reject AI assistance in core design (vs the documentation phase) — the marketing promise lands flat.

**Mitigation**: we control the dependency by carrying the constraint database + workflow engine ourselves. The AI is a layer; the substrate is ours. If AI improves, we ride the wave; if AI plateaus, the apartment-engine + the cognition stack remain valuable on their own. We are not betting solely on the model.

**Confidence**: high (Bet works at Claude 3.5+ levels today; further capability is a tailwind).

### §2.2 — Bet 2: Browser-native BIM is performant enough

**The claim**: A modern browser (Chrome / Safari / Firefox / Edge latest 2 versions, per [C45](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md)) on commodity hardware can run a BIM editor at 60 fps with 10k+ elements. WebGL2 / WebGPU + the careful architecture (single THREE owner, single rAF, frame-scheduler-based renderer) makes desktop-class performance possible in the browser.

**What would falsify it**: (a) The 10k-element threshold cannot be sustained on average M1-class hardware — the most enthusiastic customer's project hits a wall. (b) WebGPU rollout takes longer than expected + WebGL2 is insufficient for the ceiling. (c) Browser-vendor priorities shift away from heavy-graphics web apps (e.g. Safari de-prioritises WebGPU; Chrome adds CPU limits that affect us).

**Mitigation**: NFT 4 ([engineering-vision §5](./engineering-vision.md)) measures frame-budget every commit. NFT 2 measures project-load with 10k elements. NFT 16 measures memory ceiling with 1 hour of editing. If any of these regresses sustainedly, we know within a sprint. Our control: we maintain capacity to drop to a "lite" rendering mode for low-end devices (per [C44 form-factor matrix](../02-decisions/contracts/C44-MOBILE-AND-TABLET.md)).

**Confidence**: high (current code hits the targets in CI; WebGPU is on a confident trajectory).

### §2.3 — Bet 3: The architect-and-consultant ecosystem is open to a new BIM front-end

**The claim**: Architects (the design-phase customer) will use PRYZM for design + hand off via IFC to Revit-using consultants for documentation. The IFC round-trip works lossy-enough to be useful + lossless enough to avoid manual rework.

**What would falsify it**: (a) The consultant ecosystem rejects IFC and demands native RVT — PRYZM's Revit round-trip ([C26](../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md)) is the mitigation, but if it lags or is unreliable, architects don't switch. (b) Autodesk closes the IFC-export feature in Revit (defensive move), making round-trip painful. (c) Mid-firm architects insist on doing documentation in PRYZM too — and PRYZM's sheet engine isn't ready at the required quality.

**Mitigation**: (a) C25 + C26 + C30 contracts codify the IFC + RVT + sheet quality bar. (b) D11 sheet quality + D12 Revit round-trip are explicit differentiators in [engineering-vision §4](./engineering-vision.md). (c) We can extend the editor to be the documentation phase too — the architecture supports it; the year-2 roadmap includes it.

**Confidence**: medium (the technical capability is achievable; the ecosystem behaviour is harder to forecast).

### §2.4 — Bet 4: Browser-native multiplayer collaboration is mature enough

**The claim**: Yjs + WebSocket sync (per [C08](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md)) handles a BIM scene with hundreds of concurrent edits + maintains explicit-conflict semantics + works at design-tool quality.

**What would falsify it**: (a) Real concurrent BIM editing produces silent data loss at scale — a customer reports "two people edited at once and now there's a phantom wall." (b) Network conditions in real architectural offices (corporate firewalls, VPNs) break WebSocket sync. (c) The CRDT cost (memory + CPU) scales unsustainably with project size.

**Mitigation**: NFT 7 measures CRDT merge latency at 2 concurrent users; NFT 8 measures sync conflict surface latency. Both are CI-monitored. The contract suite codifies explicit conflicts; we ship correctness, not LWW illusion. Multiple concurrent editors of real projects is one of our highest-priority QA scenarios.

**Confidence**: high at small-team scale; medium at large-team-on-large-project scale (we have less production data here).

### §2.5 — Bet 5: The two-sided platform thesis works for AEC

**The claim**: Architects (demand) + plugin/family developers (supply) generate a flywheel where each side compounds the other. The pattern works for Stripe / Shopify / App Store; it works for PRYZM at AEC scale.

**What would falsify it**: (a) The AEC developer community is too small / too anti-cloud-native to author meaningfully — the supply side never reaches critical mass. (b) The 70/30 economics aren't attractive enough vs developers directly selling to firms. (c) Customers don't actually install marketplace plugins (the curiosity gap between "I see a marketplace" + "I install plugins routinely" doesn't close).

**Mitigation**: developer relations programme + transparent economics ([C40](../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)) + first-party plugins (47 of them) that seed the marketplace. The flywheel risk has named monitoring metrics in [platform-strategy §11](./platform-strategy.md).

**Confidence**: medium (the pattern is well-established in other categories; AEC-specifically is unproven).

### §2.6 — Bet 6: The constraint database compounds asymmetrically

**The claim**: The 248-rule constraint database + the cognition substrate ([site-and-cognition-strategy.md](./site-and-cognition-strategy.md)) is hard to clone + grows in value with each rule added. The substrate is a durable moat.

**What would falsify it**: (a) An open-source equivalent emerges + matches our rule count + quality. (b) AI models become powerful enough to *derive* the rules from first principles + the human-curated rules become commodity. (c) The rules turn out to be narrow / fragile + don't generalise across markets.

**Mitigation**: we open-source the rules (per the brand's openness-over-secrecy moat in [positioning §4.1](./positioning.md)) and stop trying to defend them as a secret. The defensibility is the *platform that operationalises the rules*, not the rules themselves.

**Confidence**: medium (asymmetric assets compound; AI improvement could erode the asymmetry).

---

## §3 — Market + competitive risks

### §3.1 — Autodesk responds aggressively

**The risk**: Autodesk acquires a browser-native AI-BIM startup (Motif? Qonic?) + integrates it into Revit's roadmap + offers a free-or-cheap tier to undercut PRYZM. Their channel + brand dominance crushes PRYZM's funnel.

**Likelihood**: medium-high. Autodesk has acquired multiple AEC tools (Spacemaker → Forma, BuildingConnected, etc.) and the AI moment is high-priority.

**Impact**: severe. Could compress our growth window by 18–24 months.

**Mitigation**: the platform strategy ([platform-strategy.md](./platform-strategy.md)) is the asymmetric defence — Autodesk can match feature, but the marketplace ecosystem they would need years to build. Speed to platform maturity is the safety. The contract suite + the open file format + the published economics are designed to be hard for a giant to clone *without* losing what makes their existing customers loyal (Autodesk cannot suddenly say "by the way, your files are now open").

### §3.2 — A well-funded startup ships faster

**The risk**: A competitor (Motif appears closest based on public information; Qonic; possibly an unannounced Anthropic-affiliated AEC team) raises $50M+ and out-ships PRYZM at the AI-BIM intersection.

**Likelihood**: medium. The category is increasingly attractive to deep-pocketed investors.

**Impact**: significant but recoverable. They might win demand-side share faster, but the marketplace flywheel + the open-format moat + the contract-driven enterprise-readiness compound.

**Mitigation**: avoid the "burn cash to acquire customers" trap. Acquire to retention; not to GMV. The unit economics matter — a competitor with a worse unit economics burns out; one with comparable unit economics is a long-term competitor we share the market with.

### §3.3 — The IFC ecosystem regresses

**The risk**: buildingSMART / the IFC4X3 schema fragments + per-vendor IFC dialects re-emerge as the dominant reality. The IFC round-trip promise becomes a marketing claim that customers don't actually experience.

**Likelihood**: medium (history shows this pattern — IFC has gone through dialect periods before).

**Impact**: moderate. Our D1 differentiator (lossless round-trip) is asymmetric work — we have to maintain compatibility with every consumer.

**Mitigation**: contract-driven IFC export ([C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md)) + nightly regression testing against 10 reference projects + buildingSMART community engagement. We monitor the IFC ecosystem health as a leading indicator.

### §3.4 — A regulatory shift devalues the openness moat

**The risk**: ISO 19650-3 (or a national equivalent) becomes mandatory + Autodesk Construction Cloud is the certified-compliant tool of choice. Openness becomes table-stakes, not differentiation.

**Likelihood**: low-medium. Regulation is slow.

**Impact**: moderate. Openness is one moat of several; losing its differentiation status doesn't kill the strategy.

**Mitigation**: the contract suite ([C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md), [C30](../02-decisions/contracts/C30-DRAWING-SET-MANAGEMENT.md), [C35](../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md)) ratchets us toward compliance. We aim to be the first browser-native tool with full ISO 19650 phase + audit support — turning the regulation into a wedge for enterprise sales.

---

## §4 — Technical risks

### §4.1 — Browser-vendor dependency

**The risk**: Chrome / Safari / Firefox makes a change that breaks PRYZM (e.g. removes a WebGL extension, restricts WebSocket behaviour, changes service-worker semantics). Browser-native means we live or die by browser-vendor decisions.

**Likelihood**: low at any given moment; high over a 5-year horizon (something will break).

**Impact**: moderate. Each break costs engineering time + a customer impact period.

**Mitigation**: the [C45 browser-support matrix](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md) gives us the substrate + the polyfill posture + the conditional-load registry to respond quickly. We participate in browser-vendor community channels (W3C, Chrome Status, WebKit-dev) to see changes coming.

### §4.2 — WebGPU rollout delays

**The risk**: WebGPU adoption is slower than projected. We promise (per [C45 §1.4](../02-decisions/contracts/C45-BROWSER-AND-DEVICE-MATRIX.md)) WebGL2 as baseline + WebGPU as opt-in; if WebGPU stays niche, we don't get the performance lift we hope for.

**Likelihood**: medium. Browser adoption has historically been steady but slow.

**Impact**: low-moderate. WebGL2 is sufficient for current targets; WebGPU is a tailwind not a dependency.

**Mitigation**: not over-promising on WebGPU. The opt-in framing means we deliver WebGL2 performance + customers who can use WebGPU get a bonus.

### §4.3 — CRDT performance at large scale

**The risk**: Yjs (or any CRDT we use) hits a memory or CPU ceiling at very large projects (~50k+ elements) where the operational history compounds. The collaboration becomes unusable on the most-ambitious projects.

**Likelihood**: medium. CRDTs have well-known scaling characteristics.

**Impact**: significant for enterprise customers with mega-projects.

**Mitigation**: NFT 16 (memory ceiling) measures the upper bound. We have options — Yjs garbage collection, snapshot compaction, restart-from-snapshot semantics. The contract architecture supports swapping the CRDT engine if needed.

### §4.4 — AI vendor (Anthropic) outage / rate-limit

**The risk**: Anthropic's API has an outage during a customer demo + the apartment-layout workflow fails. Customer experience is broken at the critical-moment.

**Likelihood**: low-moderate (Anthropic is a startup, even if a well-resourced one).

**Impact**: high-perceived; recoverable.

**Mitigation**: the deterministic D-TGL apartment-layout engine (memory: it shipped) is the offline fallback. Apartment layout works even when the LLM is down — the result is less brief-driven but still functional. We make this fallback first-class + tested.

### §4.5 — AI vendor pricing change

**The risk**: Anthropic raises API pricing 5×. Our Solo / Studio unit economics break.

**Likelihood**: low-moderate.

**Impact**: significant.

**Mitigation**: the BYOK option ([C39 §1.10](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)) lets Enterprise customers absorb their own API costs. For Solo / Studio, we have the deterministic engine + the response-cache + the model-routing-to-cheaper-models options.

---

## §5 — Operational risks

### §5.1 — Security incident

**The risk**: a security incident (data breach, credential leak, malicious plugin) damages customer trust + triggers churn + creates regulatory exposure.

**Likelihood**: medium over a 5-year horizon (the security industry's baseline).

**Impact**: severe.

**Mitigation**: the [C08](../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) + [C22](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) + [C48](../02-decisions/contracts/C48-BACKUP-AND-DR.md) contracts define our security posture. Plugin sandbox (iframe + Ed25519 signing) limits blast radius. Quarterly DR drills test recovery. The bound is "we are not a perfect target; we are a hard target."

### §5.2 — Founder / key-person dependency

**The risk**: PRYZM at year 1 has critical reliance on the founder. Illness or departure causes severe disruption.

**Likelihood**: low but real.

**Impact**: severe.

**Mitigation**: the contract suite + the operating-principles + the team shape are designed to be more durable than the founder. Documentation is structural redundancy. Team members understand the strategy because they helped write it.

### §5.3 — Hiring miss at scale

**The risk**: rapid team growth dilutes the bar. Year-3 team is 80 people; the median operates below the year-1 team's bar. Quality degrades.

**Likelihood**: high (this is the default failure mode of scaling startups).

**Impact**: high — affects every product + culture metric.

**Mitigation**: the [operating-principles O8](./operating-principles.md) — hire bar over team size. Saying no to candidates. Slower headcount growth than industry typical.

### §5.4 — Burnout

**The risk**: the architecturally-ambitious culture + the year-1-team-size + the high bar leads to burnout. People we hired to set the bar themselves cannot sustain it.

**Likelihood**: medium-high if not actively managed.

**Impact**: severe (we lose our best people; the moat erodes).

**Mitigation**: the [operating-principles §8 remote + no-meeting-Wednesday + cadence discipline](./operating-principles.md). The "ship to the bar, not the deadline" principle ([O1](./operating-principles.md)) is partly a burnout-prevention principle.

### §5.5 — Customer concentration

**The risk**: one large Enterprise customer becomes > 20 % of revenue. Their loss is existential.

**Likelihood**: high in years 1–2.

**Impact**: severe.

**Mitigation**: deliberate customer-portfolio management — we may decline opportunities that would create concentration. Multi-year contracts with notice periods mitigate the volatility.

---

## §6 — Compliance + regulatory risks

### §6.1 — EU AI Act enforcement

**The risk**: the EU AI Act classifies our apartment-layout / generative-design workflows as "high-risk AI" + triggers a 12-month compliance scramble.

**Likelihood**: low-medium (the Act's scope on creative-tool AI is unclear).

**Impact**: moderate (compliance work is real but contained).

**Mitigation**: [C23 Provenance & AI Audit](../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) puts us ahead of any reasonable AI-Act audit requirement. We pre-emptively comply.

### §6.2 — GDPR / CCPA enforcement action

**The risk**: a privacy-regulator action against us or a peer creates a new compliance bar mid-year.

**Likelihood**: medium.

**Impact**: moderate.

**Mitigation**: [C22 Privacy & PII Tier](../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) + [C41 Telemetry & Analytics](../02-decisions/contracts/C41-TELEMETRY-AND-ANALYTICS.md) + [C49 Multi-Region & Sovereignty](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) are designed for this. DSAR export + erasure are codified.

### §6.3 — Data residency demands shift

**The risk**: customer markets demand stricter data residency (e.g. UK demands UK-only data; not even EU acceptable).

**Likelihood**: medium-high in 5-year horizon.

**Impact**: moderate.

**Mitigation**: [C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md) explicitly handles UK as a separate region. We can spin up additional regional primaries when customer demand justifies the cost.

### §6.4 — Accessibility compliance escalates

**The risk**: WCAG 3 publishes + becomes a procurement floor. Our WCAG 2.2 AA commitment lags.

**Likelihood**: medium over 3-year horizon.

**Impact**: low-moderate.

**Mitigation**: [C43 Accessibility](../02-decisions/contracts/C43-ACCESSIBILITY.md) maintains an audit cadence + remediation cycle. The work to upgrade compliance is incremental.

---

## §7 — Cultural + brand risks

### §7.1 — Mission drift toward generic SaaS

**The risk**: as we grow, the brand voice ([manifesto §5](./manifesto.md)) softens into generic SaaS marketing. The architect-specificity erodes. We lose the asymmetric brand moat.

**Likelihood**: high (this is the default trajectory of scaling startups).

**Impact**: significant.

**Mitigation**: the quarterly brand-voice audit + the [operating-principles O7](./operating-principles.md). The founder + the content lead jointly hold the line on every customer-facing surface.

### §7.2 — Press / influencer reaction

**The risk**: a critical piece in Dezeen / ArchDaily / Building Design that frames PRYZM negatively. Word-of-mouth in the architect community works in one direction.

**Likelihood**: medium.

**Impact**: significant.

**Mitigation**: transparency + brand voice. We respond by addressing the substantive issue, not by spinning. The community values that.

### §7.3 — AI backlash within the architectural community

**The risk**: architects collectively reject AI-assisted design as devaluing the profession. PRYZM becomes "the tool that ruined architecture" in trade media.

**Likelihood**: low-medium. The architectural community is mixed on AI — early adopters are enthusiastic; established practitioners are skeptical.

**Impact**: moderate.

**Mitigation**: the "human in the loop" framing ([product-vision §3](./product-vision.md) + [manifesto §6](./manifesto.md)) is genuine. We do not promise AI-replaces-architect; we promise AI-extends-architect. We invest in the architect-on-the-team standard ([operating-principles O2](./operating-principles.md)) so the framing is credible.

---

## §8 — Financial risks

### §8.1 — Macro downturn

**The risk**: a 2008-2020-style downturn freezes the AEC sector. Architectural firms cut software spend; new project starts collapse.

**Likelihood**: medium over 5-year horizon (cycles happen).

**Impact**: significant.

**Mitigation**: the pricing-tier breadth ([go-to-market §5](./go-to-market.md)) — Solo + Studio survives at low ACV; Enterprise customers who weather the storm provide recurring revenue. Net revenue retention models survive better than CAC-led models.

### §8.2 — Unit-economics collapse

**The risk**: AI costs + storage costs + region costs scale faster than revenue. The unit economics break before scale.

**Likelihood**: medium.

**Impact**: severe (existential).

**Mitigation**: monthly unit-economics review per [operating-principles §6.3](./operating-principles.md). Per-tier gross-margin targets in [go-to-market §5.3](./go-to-market.md). If unit economics regress, the response is product-side (cheaper AI routing, response-cache hit-rate improvements, BYOK adoption push) before pricing-side (which is the last resort).

### §8.3 — Fundraising environment shifts

**The risk**: the next funding round happens in a worse market. Dilution is higher or valuation is lower than projected.

**Likelihood**: medium (cycles).

**Impact**: dilutive but recoverable.

**Mitigation**: capital efficiency. We can run lean longer than peers. We don't need the next round on a calendar; we need it when the business is best served.

---

## §9 — How we monitor

| Risk class | Cadence | Owner |
|---|---|---|
| Core thesis bets (§2) | Quarterly review | Founder + strategy lead |
| Market + competitive (§3) | Monthly review | Strategy + sales leads |
| Technical (§4) | Weekly review | Engineering lead |
| Operational (§5) | Weekly review | Operations + people lead |
| Compliance + regulatory (§6) | Quarterly review | Security + legal leads |
| Cultural + brand (§7) | Monthly review | Founder + content lead |
| Financial (§8) | Weekly review (cash); monthly (unit economics) | Founder + finance lead |

Risks at "high impact" + "high likelihood" graduate to weekly review regardless of category. Risks that materialise (incident, market change, customer loss) trigger an [operating-principles §9 post-mortem](./operating-principles.md).

---

## §10 — When to update this doc

Trigger conditions:

- A named bet (§2) is partly invalidated by evidence
- A competitor takes a structural action (acquisition, product launch, pricing change)
- A regulatory change materially affects an §6 risk
- A technical change in the substrate (browser, AI vendor, CRDT engine)
- A new risk emerges that doesn't fit existing categories
- Every quarter as a discipline (even if nothing visibly changes — re-reading sharpens)

The discipline: changes to this doc are PR'd + reviewed. The team's interpretation of risk is itself an asset that benefits from the same review rigor as code.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The thesis whose bets these risks shadow |
| [positioning.md](./positioning.md) | The competitive risks (§3) reference this |
| [personas.md](./personas.md) | Customer-concentration risk (§5.5) traces to these |
| [go-to-market.md](./go-to-market.md) | Macro / unit-economics risks (§8) |
| [platform-strategy.md](./platform-strategy.md) | Platform-thesis risk (§2.5) |
| [site-and-cognition-strategy.md](./site-and-cognition-strategy.md) | Substrate-moat risk (§2.6) |
| [operating-principles.md](./operating-principles.md) | Cultural + hiring + burnout risks (§5, §7) |
| [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) | The contract suite that mitigates many risks |

---

*End — PRYZM Risks & Assumptions, 2026-06-01 — CANONICAL.*
