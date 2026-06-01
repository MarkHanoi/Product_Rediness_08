# PRYZM — Operating Principles

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
> **Authority**: this doc owns **how PRYZM the company works** — culture, hiring bar, decision-making, review cadence, what we celebrate, what we refuse to do. Distinct from [engineering-vision.md §2 P1–P8 architectural principles](./engineering-vision.md), which govern the *code*. This doc governs the *team and the practice*.
> **Foundation above**: [manifesto.md](./manifesto.md) → [positioning.md](./positioning.md)
> **Cross-cut**: [go-to-market.md](./go-to-market.md) (the GTM expression of these principles) · [risks-and-assumptions.md](./risks-and-assumptions.md)

---

## §1 — Why operating principles matter separately

A great architecture without a team that operates well degrades into a great architecture nobody can ship into. A great team without principles degrades into hero-mode followed by burnout followed by mediocrity. PRYZM commits explicitly to **how we work** the same way we commit to *what we build*. The principles below are operating commitments — not aspirations.

Like the P1–P8 architectural principles, every operating principle has a check: a behaviour we can observe, a decision we can audit, an outcome we measure. Principles without checks are wishes.

---

## §2 — The 10 operating principles (O1–O10)

### §2.1 — O1: We ship to the bar, not the deadline

The standard for "done" is the contract's CI gate going green + the NFT meeting target + the change reviewed. Deadlines are predictions, not commitments. When a deadline conflicts with the bar, the bar wins.

**Check**: PR reviews surface "this works but tests are flaky" comments → the PR doesn't merge until tests are stable. Closing PRs to hit a sprint number is forbidden. We review aggregate quality monthly, not aggregate velocity weekly.

**Why**: customers buy from teams that ship reliable software. Reliability compounds. Cutting corners doesn't.

### §2.2 — O2: The architect-on-the-team standard

Every product decision is reviewed by at least one team member who is a practising architect (or close adjacency — interior designer, engineer, contractor) by background. The architecture industry is not "design users we're guessing about" — it's the team's lived experience. We hire to keep this true at every team size.

**Check**: every feature in the backlog has a recorded "the architect take" from a team-member who has used a competing tool on a real project. The note is part of the spec.

**Why**: BIM tools designed by non-BIM-using engineers fail. We avoid the failure mode by structurally preventing it.

### §2.3 — O3: One team, one shape

We do not separate "product" and "engineering" and "design" into different reporting lines that hand specs to each other. We have one team that holds the whole shape: discovers, designs, ships, operates. The roles within the team (PM, designer, engineer) describe what someone is good at, not what they're isolated from.

**Check**: every feature has an engineer in the discovery conversation and a PM / designer in the implementation review. PR descriptions read like specs because the engineer wrote (and owns) the spec. No "throw it over the wall."

**Why**: the BIM market is full of products built by engineers who never sat with an architect, or by product managers who never wrote code. PRYZM avoids both.

### §2.4 — O4: We name things, including the things we got wrong

When we make a decision, we record why. When the decision turns out wrong, we record that too — in the same place, not in a quiet archive. The ADR template ([C31 §2.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md)) requires "what would have to be true to invalidate this." Every doc carries a Stamp + Status; superseded docs explicitly link to their successors.

**Check**: ADRs with status `SUPERSEDED` outnumber ADRs with status `EXPLORATORY`. Architecture-decision honesty is the proxy.

**Why**: hiding past mistakes erodes trust internally and makes pattern-recognition impossible. The team that names mistakes accelerates.

### §2.5 — O5: We do not write *-AUDIT-YYYY-MM-DD.md alongside canonical docs

When something is wrong in a canonical doc, we edit the doc. We do not create `01-VISION-AUDIT-2026-04-30.md` and `01-VISION-RECONCILIATION-2026-05-15.md` and `01-VISION-SECOND-RECONCILIATION-2026-05-22.md`. The discipline is binding ([C31 §1.2](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md)) and the archive shows what went wrong without this rule — 43 superseded audits in `archive/superseded-audits/`.

**Check**: the linter `check-no-audit-alongside-canonical.ts` rejects PRs that create an audit-suffix file alongside a canonical one. Edits to the canonical file are mandatory.

**Why**: documentation drift kills future-team understanding. The next engineer onboarding cannot read 7 conflicting versions of "what the architecture is."

### §2.6 — O6: We measure what we ship

Every shipped feature has a metric. The metric is published in CI per the NFT framework ([engineering-vision §5](./engineering-vision.md)) — `cold-boot`, `tool-latency`, `frame-budget`, etc. — or in the team's monthly OKR readout. Features without metrics aren't shipped.

**Check**: every PR that ships a customer-facing feature lists the metric + the target + the measurement method in its description. PR template enforces this.

**Why**: "we shipped it; users seem to like it" is not engineering. Measurement is.

### §2.7 — O7: Customer-facing surfaces honour the brand voice

Every customer-facing surface (UI copy, marketing site, support email, error message, sales deck) passes through the brand-voice filter ([manifesto §5](./manifesto.md)). The discipline is enforced via PR review + content audit. The brand voice is not negotiable for the sake of short-term conversion lift.

**Check**: a quarterly content audit samples 20 random customer-facing strings + scores them against the brand-voice rules. Misses ≥ 30 % trigger a content-team retraining.

**Why**: brand voice is the asymmetric moat (per [positioning §4.3](./positioning.md)). It compounds when consistent + collapses when inconsistent.

### §2.8 — O8: Hiring bar over team size

We do not grow the team to hit a planned headcount. We grow when the right candidate appears + the work demands them. The hiring bar is "would this person make the team better at the work?" — every hire makes the team materially stronger, or no hire happens.

**Check**: median time-to-hire-for-a-role is > 90 days because we say no often. Open roles stay open. The teamcount-vs-quality trade-off is decided in favour of quality every time.

**Why**: a 30-person team where every person sets the bar higher beats a 100-person team where the median drags. The asymmetry compounds.

### §2.9 — O9: We do work that scales asymmetrically

Every initiative is reviewed against "does this make next year's effort smaller or larger?" CI gates make next year's review smaller. Contract suites make next year's onboarding faster. Marketplace economics make next year's feature catalog larger without proportional team growth. We prefer one-time work that compounds.

**Check**: the engineering portfolio is reviewed quarterly for "compounding vs custodial vs reactive" work. Target: ≥ 50 % compounding, < 30 % custodial, < 20 % reactive.

**Why**: a startup spending its time on custodial work (keeping the lights on, paying maintenance debt) cannot escape its scale. Compounding work breaks the ceiling.

### §2.10 — O10: We respect the customer's afternoon

The customer's time is the product. A 30-second cold boot, a flaky multiplayer connection, a confusing error message — these are not small annoyances; they are direct customer-time-cost. The whole NFT framework ([engineering-vision §5](./engineering-vision.md)) operationalises this. The brand voice ([manifesto §5](./manifesto.md)) reinforces it.

**Check**: every NFT has a published target + is measured in CI. Any sustained regression on an NFT is treated as an incident, not a backlog item.

**Why**: customers who feel respected stay. The compounding NRR target ([go-to-market §7.1](./go-to-market.md)) depends on it.

---

## §3 — Decision-making

### §3.1 — Where decisions live

| Decision kind | Lives in |
|---|---|
| Strategic / company-shaping | [01-strategy/](./README.md) — published as a strategy doc; team-wide review |
| Architectural / cross-cutting | [02-decisions/contracts/](../02-decisions/contracts/) — C-numbered contract; team-wide review |
| Per-decision rationale | [02-decisions/adrs/](../02-decisions/adrs/) — ADR-numbered; review by affected team |
| Per-system normative spec | [03-execution/specs/](../03-execution/specs/) — SPEC-numbered; engineering-review |
| Per-sprint tactical | Team sprint plan; reviewed at sprint review |

A decision below the contract-or-ADR level lives in the team's sprint plan + commit history. The level chosen reflects the decision's reversibility cost: cheap-to-reverse decisions don't need ADRs; expensive ones do.

### §3.2 — How decisions get made

1. **Proposer** drafts the doc (PR with the proposed change)
2. **Affected reviewers** comment (typically engineers + 1 architect + 1 PM)
3. **Discussion** happens in the PR or a 30-minute meeting (the meeting is documented in the PR)
4. **Decision** is captured as "merged" or "rejected" or "deferred with reason"
5. **Status** is updated on the doc (DRAFT → CANONICAL once merged)

Disagreements at step 3 escalate to the founder for the first 50 employees; thereafter to a documented decision-rights matrix.

### §3.3 — When to override

A team member overriding the documented decision (e.g. shipping code that doesn't follow the contract) MUST raise a superseding ADR in the same PR. No silent overrides. Per [O5](#25--o5-we-do-not-write--audit-yyyy-mm-ddmd-alongside-canonical-docs), drift between code + contract is fixed at the contract level, not by quiet code that diverges.

---

## §4 — The team shape

### §4.1 — Year 1 team (~25 people)

| Role | Count |
|---|---|
| Founder / CEO (also active in product + engineering) | 1 |
| Engineers (full-stack, with architecture taste) | 10 |
| Designer-engineers (UI + UX with code) | 3 |
| Product manager (architect-by-background) | 2 |
| Customer success | 1 |
| Sales engineer | 1 |
| Developer relations | 1 |
| Support agents | 2 |
| Content / marketing | 1 |
| Finance / operations | 1 |
| Office manager / chief of staff | 1 |
| Legal (fractional) | 0.5 |
| Security (fractional) | 0.5 |

Total: ~25 (some fractional).

### §4.2 — Year 3 team target (~80 people)

Grows by adding engineers in the largest proportion, then sales + customer success at the C3/C4 scale, then specialised compliance + security + marketing roles as the customer base demands. The principle from [O8](#28--o8-hiring-bar-over-team-size) holds: we grow when the candidate + the work + the bar all line up.

### §4.3 — Roles we explicitly avoid

| Role | Why we don't hire |
|---|---|
| **Pure project manager (no domain expertise)** | The project manager who is not an engineer / designer / architect adds process overhead, not throughput. We prefer engineers who can run programmes. |
| **Aggressive growth hacker** | Off-brand. Brand voice rules out the role. |
| **Sales-only enterprise rep with no technical depth** | Customer credibility requires technical depth. Pure sales reps fail. |
| **Bizdev "partnerships" role chasing logos** | Partnerships should arise from product fit, not from outbound logo-hunting. |
| **Compliance officer at startup stage** | Compliance is everyone's job in a contract-driven organisation. We hire a compliance lead once we have > 5 enterprise customers requiring named compliance owner. |

---

## §5 — Hiring bar

### §5.1 — The five filters for an engineering hire

1. **Have they built a non-trivial thing end-to-end?** (Not "have they worked on a non-trivial thing" — the entry bar is shipping)
2. **Can they read a contract and form a position on it?** (We send a real contract; we ask them what they would change)
3. **Do they care about the work?** (Engineer who is "applying because Anthropic isn't hiring" is not the hire)
4. **Are they architect-adjacent?** (They have used a BIM tool, or have lived a parallel constraint-heavy product domain)
5. **Will they make this team materially stronger?** (The reference checks ask this directly)

### §5.2 — The five filters for a designer-engineer hire

1. **Show me your portfolio of shipped work.** (Static design files are not enough — we look for products that exist)
2. **Walk me through a design decision you regret.** (Self-reflection is the design-taste signal)
3. **What is the design system for the website you find best in the world right now?** (Conversation reveals taste)
4. **Have you collaborated end-to-end with engineers?** (Without being protected by a PM)
5. **Are you uncomfortable with the SaaS-marketing default of "feature-feature-feature, badge-badge-badge"?** (If yes — culture fit)

### §5.3 — The five filters for a sales / customer-success hire

1. **Have you sold a complex enterprise product?** (Not "marketing tools" — actual systems with technical depth)
2. **Have you been a customer of a B2B product you loved?** (Customer empathy is a signal)
3. **Can you read the contract suite and explain it in plain English?** (Sales credibility test)
4. **Would you say no to a deal that would be wrong for the customer?** (Long-term thinking)
5. **Are you OK being measured on retention, not just close?** (The retention compensation model)

---

## §6 — Cadence

### §6.1 — Daily

- Engineers commit code; PRs reviewed within 24 h
- Support tickets responded to within tier SLA per [C42](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md)
- Status page healthy

### §6.2 — Weekly

- Engineering sync (1 h, async-first; meeting is for blockers)
- Customer success review (1 h, top accounts, churn risk)
- Product + design + engineering trio meets to triage backlog
- Brand-voice spot check (one piece of customer-facing copy reviewed against [manifesto §5](./manifesto.md))

### §6.3 — Monthly

- Trust report ([C42 §5.5](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md)) — published to customers + internal team
- NFT report — every CI bench's actual-vs-target reviewed
- Marketplace report — developer earnings, plugin count, customer adoption
- Churn + NRR review — by tier; root-cause analysis
- All-hands (1 h) — what we shipped, what we learned, what's next

### §6.4 — Quarterly

- Strategy review — does the manifesto + positioning + GTM still describe what we're doing?
- Architecture review — any P-principle or convergence boolean changes?
- Headcount review — does the team shape match the next-quarter work?
- DR drill ([C48 §1.11](../02-decisions/contracts/C48-BACKUP-AND-DR.md))
- VPAT update ([C43 §1.14](../02-decisions/contracts/C43-ACCESSIBILITY.md))
- Compensation review (annual is the floor; some adjustments mid-year)

### §6.5 — Annual

- Audit cycle (external accessibility audit per [C43 §1.13](../02-decisions/contracts/C43-ACCESSIBILITY.md), external security audit, financial audit)
- Customer summit (in-person or hybrid; ~100 customers + the team)
- Plugin developer conference (per [platform-strategy §10.2](./platform-strategy.md))
- Strategy refresh (the manifesto + positioning + GTM at the 12-month mark — substantive review)

---

## §7 — Compensation philosophy

### §7.1 — The principles

- **Base salary at competitive levels** (top-quartile for the city, not 90th percentile — we are not the highest-paying)
- **Equity grants meaningful** (4-year vest, 1-year cliff, refresh grants for senior performers)
- **No commission for engineers** (engineers ship; commission distorts ship-quality)
- **Sales commission tied to retention** (12-month customer retention is the threshold for full commission; churned-within-12-months means clawback)
- **Senior IC track equal to senior management track** (Engineer V earns the same as Director-of-Engineering Y; no forced promotion to management)
- **Transparent salary bands** (every IC level + every management level has a published band — no information asymmetry between candidates and existing employees)

### §7.2 — What we don't do

- Annual "performance review" theatre with mandatory rankings
- Bonus structures that incentive last-day-of-quarter behaviour
- Stack-ranking
- Sales-quota structures that incentivise selling at any cost
- Promotion as the only career signal (lateral movement, project leadership, mentoring all explicitly valued)

---

## §8 — Remote + hybrid

PRYZM is remote-first. The team is distributed across Western Europe + US East Coast in year 1. Co-location days happen quarterly (3 days, typically in a city the team enjoys — Lisbon, Berlin, Amsterdam, NY). Headquarters is a fiction; the documentation is the office.

**Time zone discipline**: we organise work to allow asynchronous handoffs. Meetings are minimised; the few meetings we hold are 30 minutes maximum, agenda-led, recorded.

**Written-first culture**: every decision starts as a document. Discussion happens in PRs and threads. Real-time chat (Slack) is for coordination, not decision-making.

**No-meeting Wednesday**: half-day-per-week is meeting-free across the team.

---

## §9 — How we deal with failure

### §9.1 — When we break something for customers

Per [C42 §1.7 SEV-1 PMI obligation](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md): every SEV-1 incident triggers a post-mortem written within 5 business days. The PMI is published internally + (redacted) externally if customer impact warrants it.

The PMI structure:
- Timeline (objective)
- Impact (quantified)
- Root cause (technical, not human; if a human caused it, what process let that happen)
- 5-whys
- Remediation (concrete fixes)
- What went well
- What went badly
- Customer comms log

Blameless. The goal is system-level learning, not individual reprimand.

### §9.2 — When we miss a deadline

The deadline was a prediction; the work is the work. We re-publish the date with the new estimate. The internal cost is to the team's prediction quality — a person who consistently mis-predicts gets coaching on estimation. The external cost is honesty: we tell customers + investors before they discover.

### §9.3 — When we ship something wrong

Roll back. Apologise. Fix. Document in an ADR (if architectural) or a sprint retro (if tactical). Move on. We do not optimise for never being wrong; we optimise for quickly being less wrong.

### §9.4 — When a team-member underperforms

Coaching first, with clear measurable expectations + a documented timeline. Performance-improvement plan if coaching doesn't land. Termination if the PIP doesn't land. The discipline is to act on the signal — letting underperformance persist is unfair to the underperformer + corrosive to the team.

---

## §10 — Decisions about company shape

| Decision | When we revisit |
|---|---|
| Hire X | At each role-opening |
| Buy or build a tool | At each tooling proposal |
| Outsource a function | At each capability gap |
| Open an office | Year 3+ when customer geography warrants |
| Take more capital | When the business demands it; not on a fundraising calendar |
| Acquire a company | Almost never — we are organic-grow team |
| Spin out a division | Almost never — we are one team, one product |
| Take more PR / press | Story-led; never product-launch-led |
| Open-source a piece | Per ADR; favour openness; resist for proprietary advantage |

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [manifesto.md](./manifesto.md) | The brand voice + cultural foundation |
| [positioning.md](./positioning.md) | Why these principles serve the moat |
| [engineering-vision.md](./engineering-vision.md) | The P1–P8 architectural principles (code, not team) |
| [go-to-market.md](./go-to-market.md) | The GTM implementation of these principles |
| [risks-and-assumptions.md](./risks-and-assumptions.md) | Cultural / hiring risks |
| [../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md](../02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md) | The doc discipline these principles depend on |
| [../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md](../02-decisions/contracts/C42-CUSTOMER-SUPPORT-TIER.md) | The PMI obligation + customer-facing operating commitments |

---

*End — PRYZM Operating Principles, 2026-06-01 — CANONICAL.*
