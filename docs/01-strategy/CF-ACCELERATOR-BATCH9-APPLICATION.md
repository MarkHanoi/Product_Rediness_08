# CF Accelerator Batch #9 — application answers (DRAFT for the founder)

> **Stamp**: 2026-08-16 · **Status**: DRAFT — founder-owned, not canonical
> **Repo HEAD at drafting**: `1f88085e` · **Branch**: `main`
> **Programme**: 12 weeks onsite, Heilbronn · starts 30 Sept 2026 · pitches 24–26 Aug 2026
> **Authority**: none. This document decides nothing and binds nothing. It is a drafting aid.
> Where it disagrees with a contract, a gate reading or
> [`BIM30-MASTER-COMPLETION-TRACKER.md`](../03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md),
> **those win** and this file is wrong.

---

## §1 — How to use this draft

These are **drafts for the founder to edit and own**, not finished submissions — the voice should end
up being Antonio's, not this document's. Every factual claim carries the file, command or commit that
produced it, so any sentence can be checked or struck before it is pasted into the form. Nothing here
is estimated, rounded or inferred: where the repository cannot evidence an answer it is **not
guessed**, it is moved to the founder-input table in §3 — which is itself a deliverable, because
knowing precisely which sixteen facts only the founder holds is worth more than sixteen plausible
sentences.

Three disciplines are applied throughout, all of them this repository's own standing rules. **Built ≠
measured ≠ planned** are never blurred. **Traction is never invented** — there are no users, revenue,
pilots, LOIs, partnerships or logos in this draft, because the repo evidences none. And **no
impressive number is quoted without its companion caveat**: this codebase audits itself unusually
hard and repeatedly downgrades its own claims, so several strong figures sit next to measured
scorecards that qualify them. §4.3 lists every claim deliberately *not* made and why — read it before
adding anything of your own.

---

## §2 — Answers ready to paste

### Q · Describe what your startup does (< 100 characters)

Five options, each **counted, not estimated** (`awk '{print length($0)}'`). All are ≤ 100.

| # | Text | Chars |
|---|---|---|
| **A** ⭐ | `AI design platform that turns a brief into a real building, on real land, under real law.` | **89** |
| **B** ⭐ | `Browser-based AI BIM platform: from plot and brief to a coordinated, code-checked building model.` | **97** |
| **C** ⭐ | `Conversational BIM for architects: brief in, coordinated IFC building model out. In the browser.` | **96** |
| D | `One conversation, from raw site to coordinated building. Browser-native, AI-native BIM.` | **87** |
| E | `AI that designs real buildings, not pictures of them — browser BIM, real IFC, real planning law.` | **98** |

**Recommendation: A.** It is the only one carrying the *differentiator* (real land, real law) rather
than the *category*, and at 89 characters it survives a form that counts trailing whitespace. **B** is
safer for a non-technical reviewer — "browser-based" and "code-checked" do more work than "under real
law" for someone outside AEC. **D** is the manifesto's own promise ([STR-01 §2](./STR-01-manifesto.md))
and is right if consistency with existing PRYZM copy matters more than novelty.

> ⚠ **On E**: at 98 characters it is the tightest option, and it contains an em-dash. If the form
> counts **bytes** rather than characters, the em-dash costs 3 and E lands at exactly **100** — on the
> limit with nothing spare. If any field rejects non-ASCII, or you cannot tell how it counts, prefer
> **A** (89), which has eleven characters of headroom either way.

---

### Q · What role does AI play in your product?

> *Founder's own sentence, kept as the spine:* "It is improving the quality of predictions, finding
> new relationships in data."

**Draft answer:**

AI plays two roles in PRYZM, and they map onto exactly those two things — plus a third that I think
matters more than either.

**Improving the quality of predictions.** PRYZM generates buildings, not pictures of buildings. A
brief becomes a real BIM model — rooms, walls, doors, furniture, ceilings, lighting, circulation —
produced by deterministic generative engines reasoning over a constraint database of 248 normative
requirements drawn from building regulations and standards. The prediction improves through
*constraint*, not scale: a layout is valid by construction because the rules are enforced while it is
built. The core engine turns a site polygon and a program brief into ranked candidate layouts using
established computational-geometry and space-syntax methods, and it is **deterministic by contract** —
same input, byte-identical output, no randomness, under two seconds in the browser. Most of these
engines contain **no LLM at all**. House, office, residential, ceiling, furniture and lighting
generation involve zero model calls.

**Finding new relationships in data.** The model is a typed semantic graph, not a bag of shapes. It
knows *this wall bounds this room*, *this door is hosted in that wall* — and those relationships are
queryable and propagate. Move a wall and the slab, the room boundary and the recorded area follow.
The generative engine's own output is the graph; the geometry is a projection of it. On top sits the
relationship we treat as the company's core problem: **connecting a plot of land to the planning law
that governs it.** PRYZM resolves a real cadastral parcel to its zoning instrument, constructs the
block, and derives the buildable envelope *carrying the article it was derived from*. That solver is
deterministic and has no AI on it, deliberately — "the AI said 18 m" is not a compliance claim;
"zone 22a → 18 m, from rule-pack `es-barcelona`, ordinance reference X" is. **Reproducibility is the
product.**

**The third role: the AI is not allowed to be the source of truth.** Language is the interface, but
the editor registers what it can do and language resolves against that registry — grammar first,
then synonyms, then a semantic parse, and only as a *last* rung a language model. Most instructions
resolve at **zero tokens**. The LLM is an escalation mechanism, not the command router, and it gains
no authority the user does not have: it emits structured intents, never raw commands, and unknown
intents are rejected rather than coerced. The consequence is a property we test for: **remove the AI
entirely and PRYZM loses conversation and nothing else.**

**What I would ask you to notice is the refusal.** In this category, systems guess. PRYZM is built so
it cannot. An empty answer and *"I cannot determine this"* are never the same value — enforced by
contract and by CI gates, not good intentions. When the system declines it names the rule and **both
numbers**. Where a zoning code genuinely grants no envelope we return a cited refusal and treat it as
a *correct answer*; where we simply have not encoded a zone we say that instead — opposite claims,
and collapsing them is what once rendered a fabricated setback over a forest reserve. Today **73.1%
of Barcelona's ground returns a cited refusal rather than a fabricated number**, and a refused
envelope must null every numeric field so nothing downstream can extrude a figure that was never
granted.

For an architect the value of an AI that refuses honestly exceeds one that always answers. They are
professionally liable for the output.

---

### Q · Describe your traction so far

> ⚠ **Founder: read before pasting.** Everything below is evidenced in the repository. Deliberately
> **absent** is any claim about users, revenue, pilots, LOIs, partnerships or logos — the repo
> evidences none. If you have any, add them yourself; do not let this draft's silence understate you
> (§3 rows 1–7, 14).

**Draft answer:**

PRYZM is in external testing: a working product, live in production, with users testing the
MVP/beta. Rather than claim numbers I cannot show you, here is what is verifiable.

**It is a real, shipping product, not a prototype.** PRYZM runs in production on Fly.io in Frankfurt,
with blue-green zero-downtime deploys, a managed EU Postgres tier, and EU data residency mandated by
our own contracts. We have shipped **246 production releases** (tracked v35 → v281 in the deploy
workflow's changelog) — roughly **2.8 production deploys per day**. Deployment is contract-governed,
not ad-hoc: the pipeline refuses to deploy a commit whose CI run did not pass eight required checks,
and every deploy is verified by an automated bundle proof that the served build actually changed and
the live `/version` matches the commit.

**The engineering velocity is measurable.** 5,153 commits since the repository opened on 19 May 2026
— 908 in the last seven days, with commits on 88 of the last 90 days. The platform is 98 packages, 13
apps and 48 plugins: **1.57 million lines of TypeScript across 7,099 files, with 2,170 test files**
(31% of all source files are tests).

**I test against production personally, every day, and it closes the loop.** I run the live build and
file findings the same day into an append-only issue log that now holds **827 logged issues (L-01
through L-928) since 2 July 2026** — nearly 200 attributed directly to me, and nine pinned to the
*specific production deploy SHA* they were observed on. These are real production findings: a WebGPU
texture crash caught by our viewport crash-guard mid-session; wall-junction geometry on a live
Barcelona block; AI-chat element placement. They get fixed and redeployed within hours. Roughly 1,340
commit messages reference an issue ID, so the log and the code are one system rather than two.

The discipline behind it is worth naming: **a failing measurement is committed on its own, before the
fix**, so the fix is proven to have flipped something real. We do not mark work done because it looks
done.

**We invest heavily in catching ourselves being wrong.** 58 automated architecture gates, a
certification suite, 82 binding engineering contracts and 263 architecture decision records. This
week an adversarial audit run by eleven parallel review agents proved that an item we had recorded as
*fixed* was in fact unreachable in production; it was corrected before it shipped. I would rather
tell you that than not — the ability to falsify our own status reports is the thing I would most want
to keep as we grow.

**Capability breadth.** Natural-language chat drives real modelling commands against the live model,
with 45 declared chat capabilities over 319 registered commands and a CI gate that turns red if any
command ships without declaring whether it is speakable. Deterministic engines generate apartment,
house, office and multi-unit residential layouts, plus furniture, ceilings and lighting.
Interoperability is shipped and real: IFC4X3 import and export, BCF round-trip, Rhino and DXF import,
vector PDF export — work leaves PRYZM in formats consultants already accept.

**Geographic depth, stated honestly.** Parcel selection is wired to national cadastres across 14
countries (20 registered jurisdiction routes), and we hold planning-law research spanning 15
countries and a 91-city dossier matrix. But **exactly one city — Barcelona — is shipped to the full
buildable-envelope standard.** The bottleneck is not engineering: onboarding a city is a data
addition at five slots with no city-specific code, and two probes onboarded a new municipality in
about 25 minutes. The bottleneck is *sourcing planning law*, which is human-gated — which is also
precisely why a competitor cannot simply buy this.

**Where we are against our own plan.** Our BIM 3.0 programme measures completion mechanically: **59
of 79 achievable rows closed (75%)**, of which **30 of 59 (51%) were re-verified by executing the
deciding test in the last measurement pass**. I quote both deliberately — the first is where the
product is, the second is how much of it I can personally vouch for today.

**What I am not claiming.** No revenue: billing is built and wired (Stripe, six SKUs), but shipping
billing code is not being paid and I will not present it as such. Real-time collaboration is
code-complete but not switched on in production, so I call it unproven rather than working. And our
generative *quality* is measured but not yet certified — I know exactly which layouts still produce
an unreachable room, because we count them.

---

### Q · What are you aiming to achieve during the program? (KPIs / milestones for 3 months)

> ⚠ **Proposals derived from the roadmap's actual next phases**, not commitments the founder has
> made. Each is measurable by an instrument that already exists. Cut freely — a shorter list you hit
> beats a longer one.

| # | Milestone | Measured by | Target at week 12 |
|---|---|---|---|
| **1** | **Close the BIM 3.0 programme.** | The completion tracker's own count | **59/79 → 79/79**, verification coverage **51% → >75%** — no row counted closed without re-running its test |
| **2** | **Turn collaboration on.** Two architects in one model, conflicts surfaced not silently lost. | Two-client convergence gate against production | **UNPROVEN → proven**; one concurrency tier formally **held** with a recorded load run, not claimed |
| **3** | **Ship cities two and three.** | Envelope axis of the city scorecard | **1 → 3 shipped cities.** Candidates are engineering-complete and waiting on rule-pack sourcing |
| **4** | **Make the honesty guarantee mechanical.** Today "never present an estimate as authoritative" rides on convention. | A new CI fidelity-label gate | Gate exists and blocks merges — closing what our architecture record names its highest open risk |
| **5** | **Certify generative quality.** | The generative-quality tracker | **0 of 28 readiness cells proven → 28 of 28 measured and gated**; zero layouts shipping an unreachable or doorless room |
| **6** | **Ship the edit layer.** *"Make this 2-bed a 3-bed in the same envelope."* | The universal relationship/consequence bar | The five named modification scenarios stop returning "no". **The commercial milestone** — an architect's week is mostly modification, not generation |
| **7** | **Convert testing into revenue.** Incorporate (September), then move beta testers onto paid plans. | Stripe | *Founder to set the number* — §3 row 16 |

**Suggested framing sentence:** "Milestones 1–5 make the product trustworthy enough to sell from;
milestone 6 makes it worth renewing; milestone 7 is the commercial proof. I would use the twelve
weeks to move from *a product I can demonstrate* to *a product I can invoice for* — and I want the
cohort's pressure on milestone 7 specifically, because that is where being a technical founder
working alone has cost me the most time."

---

### Q · Why Heilbronn?

> ⚠ **This is the weakest answer here and the founder must personalise it.** Reasoned from what the
> programme offers plus general knowledge — no web research was done. **Verify the starred claims.**

**Draft answer:**

Three reasons, and one is specific to what PRYZM is.

**Germany is my next market, and the bottleneck there is physical, not technical.** PRYZM already
routes German cadastral parcels — North Rhine-Westphalia is wired today — and our production
infrastructure already runs in Frankfurt under EU data residency, because European sovereignty was an
architectural decision, not a marketing one. What blocks the rest of Germany is not engineering: it
is that planning law is licensed and published per-Land by authorities that do not serve
machine-readable ordinances and often block scripted access. That work is human-gated — it needs
conversations, institutional introductions, and someone physically in the country. Twelve weeks
onsite in Baden-Württemberg is worth more to that specific problem than twelve weeks anywhere else,
remote included. Germany is also the largest construction market in the EU.

**The onsite cohort is the correction I need.** I am a technical founder who has been building deep
and shipping fast; the engineering is genuinely ahead of the commercial work, and I know that is a
risk rather than a virtue. Twelve weeks in a room with other founders on a schedule I do not control
is a structural fix for that imbalance in a way advice alone is not.

**⭐ The region's AI and industrial concentration matches the vertical.** Heilbronn's AI ecosystem
around the Bildungscampus and IPAI is one of the few places in Europe where an applied-AI company
sits beside industrial and built-environment operators rather than only beside other software
companies. My customers are architects, developers and construction firms — proximity to the
Mittelstand and to regional construction activity puts me near buyers, not only peers.

The €25k founders-friendly loan matters honestly: it is pre-incorporation runway that lets me
register in September and spend the programme on customers rather than on fundraising.

> **⭐ Verify before submitting:** (a) that IPAI / Bildungscampus are correctly named and
> characterised, and (b) the exact loan terms in *this* batch's conditions. **Then add one sentence
> naming a specific person, company or programme element you have actually looked at** — reviewers
> discount generic "why us" answers, and this one is generic until you do.

---

## §3 — Answers requiring FOUNDER INPUT

| # | Form question | Why the repo cannot answer | What is needed | Suggested default |
|---|---|---|---|---|
| 1 | **Revenue, last 12 months** | No financial records in repo. Stripe is wired (6 SKUs) — code, not income. | Figure from Stripe / bank | **`0`** |
| 2 | **Fundraising stage** | Not in repo | Founder | `Pre-seed / not yet raised`, if true |
| 3 | **Currently raising? amount + valuation** | Not in repo | Founder | — |
| 4 | **Grants received** | Not in repo | Founder | **`0`** |
| 5 | **Previous accelerators / programmes** | Not in repo | Founder | `None`, if true |
| 6 | **Co-founder names + LinkedIn URLs** | Repo shows a single git identity | Founder | — |
| 7 | **Team size / FTE** | Cannot be inferred from commits | Founder | — |
| 8 | **Second-time founder?** | Not in repo | Founder | — |
| 9 | **Scholarship / financial support needed** | Not in repo | Founder | — |
| 10 | **Desks · apartments needed** | Not in repo | Founder — depends who relocates | — |
| 11 | **Demo link + credentials** | Live app is `https://pryzm.fly.dev` (canonical `app.pryzm.so`). **No credentials are committed, correctly.** | Create a reviewer account and paste working credentials. **Test in a private window first.** | — |
| 12 | **Pitch deck** | Not in repo | Founder | — |
| 13 | **How did you hear about CF?** | Not in repo | Founder | — |
| 14 | **Number of external testers** | ⚠ **Load-bearing for the traction answer.** `packages/beta-signup/` exists but has **no server or database consumer** — authored-but-unwired, so it is *not* evidence of a live waitlist and cannot be counted. | Founder must count testers from memory/inbox | — |
| 15 | **Incorporation** | Founder-stated | As stated: **not yet; registration planned September** | — |
| 16 | **Milestone 7 target** (§2 KPIs) | Depends on row 14 and a pricing decision | Founder to set a paid-conversion number | — |
| 17 | ⚠ **Is an AI key configured in production today?** | Repo records a state where production carried **neither** `CF_WORKER_URL` nor `ANTHROPIC_API_KEY`, making the LLM rung shipped-but-inert. The deterministic zero-token ladder works regardless. | Founder must confirm before demoing LLM-tier chat | — |

---

## §4 — Evidence appendix

Commands run at HEAD `1f88085e` on 2026-08-16 unless dated otherwise.

### §4.1 — Measured this session (re-runnable)

| Claim | Value | Command / source |
|---|---|---|
| Total commits | 5,153 | `git log --oneline \| wc -l` |
| History begins | 2026-05-19 | `git log --format=%ad --date=iso \| tail -1` |
| Commits, last 7 days | 908 | `git log --since=2026-08-09 --oneline \| wc -l` |
| Commits on 2026-08-15 | 91 (36 `fix(`) | `git log --since='2026-08-15 00:00' --until='2026-08-16 00:00'` |
| Days with commits, last 90 | 88 of 90 | `git log --since=2026-05-18 --format=%ad --date=short \| sort -u \| wc -l` |
| Packages · apps · plugins | 98 · 13 · 48 | `ls packages/*/package.json \| wc -l`, etc. |
| TS/TSX files · lines | 7,099 · 1,568,341 | `git ls-files \| grep -cE '\.(ts\|tsx)$'`; `wc -l` over the same set |
| Test files | 2,170 | `git ls-files \| grep -Ec '\.(test\|spec)\.(ts\|tsx\|mts)$'` |
| CI gates · benchmarks | 58 · 68 | `ls tools/ga-gate/check-*.ts \| wc -l`; `ls apps/bench/src/benches/*.bench.ts \| wc -l` |
| Contracts · ADRs · specs | 82 · 263 · 94 | `ls docs/02-decisions/contracts/ \| grep -c '^C[0-9]'`, etc. |
| **Production deploys** | **246 distinct versions, v35 → v281** (264 marker lines) | `# deploy-marker:` lines in `.github/workflows/deploy-fly.yml` |
| **Issues logged** | **827 IDs *defined*, L-01 … L-928**, since 2026-07-02; ~187 attributed to founder; 9 pinned to a deploy SHA | `docs/04-reference/ISSUE-LOG.md`. ⚠ A naive `grep -oE "L-[0-9]{1,3}" \| sort -u` returns **865** — that counts cross-*references* too. **Quote 827, or say "over 800".** |
| Commits referencing an issue ID | 1,340 | `git log --oneline \| grep -c 'L-[0-9]'` |
| Parcel routes | 20 routes / 14 countries; 15 `kind:'cadastral'` | `packages/site-parcel-data/src/parcelProviders/registry.ts` |
| Production host | Fly.io `app = "pryzm"`, region `fra`, blue-green | `fly.toml:17,20` |
| Live URL | `https://pryzm.fly.dev` (canonical `app.pryzm.so`) | `fly.toml:17`; `docs/04-reference/PRYZM-PATH-TO-PRODUCTION.md` §1 |

> ⚠ **These exceed the figures in the strategy docs** (97 packages / 32 gates / 68 contracts / 251
> ADRs, measured 2026-08-11). The repo grew. **Quote the commands, not the documents** — and re-run
> them the day you submit.

### §4.2 — Sourced from repository documents

| Claim | Source |
|---|---|
| **59/79 = 75%**; verification coverage **30/59 = 51%**; progression 25→34→51→55→59 | [`BIM30-MASTER-COMPLETION-TRACKER.md`](../03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md) §1.2.1 — **forbids quoting either number alone** |
| Remaining closable: 20 rows | Same, §1.2 |
| "One conversation, from raw site to coordinated building" | [`STR-01`](./STR-01-manifesto.md) §2 |
| LLM sits above the model; "remove the AI and you lose conversation, nothing else" | [`STR-16`](./STR-16-bim30-in-plain-words.md) §1.1, §5 pillar J |
| "An empty answer never means *I don't know*" | [`STR-16`](./STR-16-bim30-in-plain-words.md) §5 pillar L |
| The five modification scenarios; "an architect's week is mostly modification" | [`STR-16`](./STR-16-bim30-in-plain-words.md) §4.3 |
| Collaboration code-complete, awaiting one process + one env flip; word is UNPROVEN | [`STR-16`](./STR-16-bim30-in-plain-words.md) §4.4 |
| Rules database: 248 constraints, 14 categories, partial code enforcement | `docs/03-execution/specs/SPEC-LAYOUT-CONSTRAINT-DATABASE.md` |
| D-TGL deterministic, no randomness, <2 s, graph is the product | `docs/03-execution/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` §1 |
| Deterministic generators: house / office / residential / ceiling / furnish / lighting = no LLM | `docs/04-reference/RAC-GENERATIVE-INFRA-INVENTORY.md` §1 |
| Ladder: grammar → synonyms → semantic parse → LLM last; "escalation mechanism, not the command router" | `docs/02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md` §0, §1.1 |
| **319 bus commands · 45 chat capabilities · UNDECLARED 0 · 138 examples executed** | C67 §1.2 (printed by `tools/ga-gate/check-chat-capability-coverage.ts`) |
| Envelope solver is deterministic, **no AI/ML/LLM**; "reproducibility is the product" | `docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md` §1.1 |
| **73.1% of Barcelona ground returns a cited refusal**; 86.1% constructed-or-cited | C58 §1.13 |
| Refusal is a typed, cited return value; closed 11-member union | `packages/schemas/src/site/zoning/BuildableEnvelope.ts:222-267` |
| Three outcomes `pack` / `refusal` / `unregistered`; "opposite claims" | `packages/site-parcel-data/src/rulepacks/registry.ts:18-31` |
| Envelope: **exactly one shipped city** | [`MASTER-ROI-TRACKER.md`](../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5.1 |
| 15 countries of research; 91-city matrix | Same, header |
| City onboarding = 5 slots, 0% city-specific code, ~25 min | [`STR-02`](./STR-02-product-vision.md) §4.12 (ADR-0279) |
| Interoperability shipped (IFC4X3, BCF, Rhino, DXF, PDF) | [`STR-02`](./STR-02-product-vision.md) §4.6 |
| Stripe, 6 SKUs | [`STR-02`](./STR-02-product-vision.md) §4.8 |
| Deploy gated on CI success; 8 required checks; bundle proof | `.github/workflows/deploy-fly.yml`; `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`; `tools/deploy/fly-bundle-proof.sh` |
| EU data residency mandated | C22 §1.3 / C49 §1.2; `fly.toml` region `fra` |
| Generative quality: **0 of 28 readiness cells proven** | `docs/03-execution/plans/GENERATIVE-QUALITY-MASTER-TRACKER.md` |
| Concurrency tiers CLAIMED, none HELD | C66 §1 / §1.1 |

### §4.3 — Claims deliberately NOT made, and why

| Tempting claim | Why it is absent |
|---|---|
| Any user count, revenue, pilot, LOI, partnership or logo | Not evidenced anywhere in the repo. → §3 |
| A live beta waitlist | `packages/beta-signup/` has no server or DB consumer — authored-but-unwired. → §3 row 14 |
| "827 issues resolved" | 827 is issues *logged*. Much of the recent band is still OPEN — that is a live defect pipeline, and a strength, but it is not a resolution count. |
| "Chat can do anything you say" | The RAC conformance scorecard measures **24 of 53 founder-named operations with no route at all**, 29 known misread phrasings, and most runtime verdicts UNPROVEN. The 45-capability figure is real; this caveat travels with it. |
| "Our generated layouts are high quality" | **0 of 28 readiness cells proven, 4 failed by execution.** We know some layouts ship an unreachable or doorless room. Claim the measurement, not the quality. |
| "The AI chat is live in production" | Repo records production running with **no AI key**, making the LLM rung inert. The deterministic ladder still works. → §3 row 17 |
| "68 benchmarks measured every PR" | An `nft-bench` job exists but lands **ADVISORY**, not merge-blocking. Benches exist; they do not gate merges. |
| "Supports N concurrent users" | C66 §1.1 **forbids** describing a tier as supported while CLAIMED. All three are CLAIMED. |
| "Live in 14 / 15 countries" | Parcel *routing* spans 14 countries; **envelope delivery is one city.** Conflating them is the exact overstatement the pipeline exists to prevent. |
| "Real-time collaboration works" | Code-complete, not switched on. Correct word is UNPROVEN. |
| Figures from [`STR-07-positioning.md`](./STR-07-positioning.md) | Banner-marked **"UNREVIEWED SINCE 2026-06-01 AS TO FACT"**. Used for intent only; no counts quoted. |
| The headline table in `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` | Banner-marked **DO NOT QUOTE — superseded**. Machine-readable sources cited instead. |

---

*End — CF Accelerator Batch #9 draft answers. Founder-owned. Nothing here binds the codebase.*
