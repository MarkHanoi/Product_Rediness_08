# September Launch Wedge — strategy & feasibility assessment

> **Stamp**: 2026-07-21 · **Status**: STRATEGY + FEASIBILITY ASSESSMENT. No code changed, no contract
> flipped, no master tracker/plan edited. This file is the sole artefact.
> **Question**: is the proposed September wedge — *"click a parcel in Barcelona, get your legal
> buildable envelope and a compliant generated building in minutes"*, sold as a per-parcel report at
> professional-service pricing, Spain-deep before country-wide — TRUE on the code as it exists today?
> **Method**: every capability claim is checked against shipped code (`file:line`) or a measured
> probe (L-535, L-538). Market statements are labelled **[RESEARCHED]**, **[INFERENCE]** or
> **[ASSUMPTION]**. Nothing legal is asserted — §3.5 lists what must go to a lawyer.
> **Standing discipline applied**: an honest refusal beats a confident wrong answer — including in
> positioning.

---

## §0 — Verdict in one page

| # | Proposal element | Verdict | One-line reason |
|---|---|---|---|
| 1 | **Narrow the wedge** to parcel → legal envelope → compliant building, Barcelona | ✅ **ENDORSE — with the claim re-scoped** | The wedge shape is right and it is the only defensible one we have. But *"click a parcel in Barcelona"* is false today: the engine answers on **24.0 %** of Barcelona's private buildable land (L-538). The honest wedge names the fabric, not the city. |
| 2a | **Per-parcel report as the entry product** | ⚠️ **ENDORSE-WITH-MODIFICATION** | Report-as-entry-product is right. **Professional-service anchor pricing is not**, while every number is `estimated-ruleset` amber and the panel itself says *"not an authoritative determination"* (`GISAreaLayout.ts:2110`). Sell it as an **indicative screening report** at a screening price, not a feasibility study at a feasibility price. |
| 2b | **Convert repeat users into seats (NRR-first)** | ✅ **ENDORSE** | Structurally correct and it is the only motion that survives the certification gap: the seat sells the *authoring* substrate, which is genuinely strong and needs no legal warranty. ⚠️ Blocked on **L-397** — three inconsistent price tables in the codebase must be reconciled before any public price is quoted. |
| 3 | **Spain-deep before country-wide** | ⚠️ **ENDORSE THE DIRECTION, REJECT THE COST MODEL** | "Widening within Spain is a cheap curated-ruleset cost reusing the same Catastro pipeline" is **falsified by L-535**: block-ring dissolve succeeds **Barcelona 2/2 · Madrid 2/4 · Córdoba 0/3**. Madrid/Córdoba fail at *geometry*, before any ruleset is consulted. The correct sequence is **Barcelona-deep → Spain-broad**, not Spain-deep → country-broad. |
| 4 | **Follow-ons: anchor pricing + promotora/fund copy** | ⚠️ **PARTIALLY REJECT** | The promotora/fund *audience* choice is endorsed. The *anchor* is wrong: the authoritative document this would be compared against is the municipal **cédula urbanística at €30–150** [RESEARCHED], not a €3–6 k boutique feasibility study. §3 reprices against both anchors. |

**The single sentence that must survive this document:** *the wedge is real, the audience is right, and
the price anchor is wrong — because what we produce today is a screening estimate, not a determination.*

---

## §1 — The evidence base (what is actually true on 2026-07-21)

### §1.1 Coverage — measured, not estimated

`packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts:163` exports
`BCN_ENSANCHE_ZONE_CODES = ['13a', '13E']`, and `apps/editor/src/ui/site/siteDispatch.ts:992` gates
the real-envelope path on exactly those two codes. Everything else falls through to
`applyEstimatedZoning`.

The L-538 probe (2 907 grid points over INE 08019, 1 014 resolved, run through the *production*
`fetchQualificationAtPoint`) measured the consequence:

| Family | claus | % of private buildable land | engine today |
|---|---|---|---|
| Densificació urbana intensiva | `13a` | **24.0 %** | ✅ constructed |
| Volumetria específica | `18` | 22.5 % | ❌ estimated fallback — and *no rule exists to encode* (PGM Art. 306 points at a per-site document) |
| Industrial / activitats | `22a`, `22@` | 18.2 % | ❌ needs a coverage+FAR rule kind that has never existed |
| Edificació aïllada | `20a/*` | 13.1 % | ❌ same new kind |
| Nucli antic | `12`, `12b` | 11.3 % | ❌ new kind + heritage-overlay prerequisite |
| Densificació urbana semiintensiva | `13b` | 8.7 % | ❌ config-only (cheapest win) |
| long tail | `15`,`16`,`17/6`,`8a` | 2.2 % | ❌ refusal is the correct output |

`13E` — one of the two codes the gate accepts — **returned zero times in 1 014 resolutions**
(`BARCELONA-COMPLETE-COVERAGE-PLAN.md:135-137`). So the live coverage is `13a` alone.

**Two consequences the proposal does not price in:**

1. A user clicking a random Barcelona parcel has, by land area, **roughly a 1-in-4 chance** of a
   constructed answer. **[INFERENCE, direction known]** — by *parcel count* the odds are somewhat
   better than 1-in-4, because `13a` is dense small-parcel fabric while `18`/`22a`/`20a` sit on large
   parcels (`BARCELONA-COMPLETE-COVERAGE-PLAN.md:104-113` states the skew direction; the magnitude is
   **unmeasured** — item 8 of its "could not be determined" list). *Do not quote a parcel-count
   number until that probe is run.* §6 makes running it a pre-launch task.
2. **~22.5 % of Barcelona can never be more than a reasoned refusal on today's architecture.**
   Clau `18`'s buildability is fixed by a per-site approved volumetry the PGM merely points at
   (`:247-269`). "Complete Barcelona" tops out at ~76 % constructed even after ~106 dev-days.

### §1.2 Certification — the numbers are constructed, not surveyed

- The pack ships `defaultConfidence: 'estimated-ruleset'` (`esBarcelonaEnsanche.ts:155`), and the
  file is explicit that this is **not provisional pending better data** (`:144`) — it is the correct
  permanent tier for a number authored from an ordinance text.
- The panel renders *"N of N value(s) are ESTIMATED — not an authoritative determination"*
  (`apps/editor/src/ui/layout/GISAreaLayout.ts:2110`).
- **L-528 is OPEN.** Certification against the official *fitxa urbanística* in the MUC/RPUC
  interactive viewers has not been run; the audit row states it "blocks the GREEN badge + the exact
  numbers, NOT the demo (which ships correctly badged amber)".
- The height figure comes from a **constructed** street width (L-537: no *ample oficial* dataset is
  published nationally or by Barcelona) feeding a height table whose PB+5 figure is itself
  uncertified (L-525a, pending L-528).
- The depth comes from a **construction**, not a lookup: PGM Art. 242.2 solved from the block ring
  (ADR-0271). And that construction was **silently wrong until v256** — L-529 found the inset
  primitive collapsing real cadastral rings and shipping a 12 m depth where the construction yields
  15.7 m.

**This is the crux.** Not "our numbers are unverified in the usual startup sense". They are the
output of a chain we have twice caught being confidently wrong (L-526 stale source, L-529 collapsed
inset), correctly labelled amber by our own UI, on a foundation where certification is a scheduled
future task.

### §1.3 Spain breadth — the proposal's cost assumption is falsified

L-535 / `SPAIN-CADASTRAL-DISSOLVE-PROBE.md`, run against live Catastro over 9 real addresses:

- Reverse-geocode + `GetParcel`: **9/9**. The parcel plumbing genuinely is national.
- Usable block ring: **Barcelona 2/2 · Madrid 2/4 · Córdoba 0/3**.
- Cause: `dissolveParcelsToBlockRing` requires a conforming tiling; real cadastral data has
  T-junctions and slivers, and outside the Eixample that is the *dominant* outcome, not the caveat.
- **Madrid's Salamanca district is also a 19th-century ensanche and still fails**, so this is not
  "old vs new fabric" — it is per-municipality digitisation hygiene, which we cannot see from the
  shape and therefore cannot predict before probing.

The probe's own conclusion (`:60-67`): *"Madrid is NOT a 'write a new rule pack' job… fix the
dissolve first, or the rule work lands on a pipeline that cannot feed it."*

⚠️ And the fix is **not free and not safe-by-default**: a tolerant weld is "a new tunable standing
between cadastral data and a compliance number" and "the tolerance must be justified against
cadastral positional accuracy, not tuned until Madrid passes" (`:66-73`). That is exactly the L-529
failure class. **Widening within Spain is a geometry-correctness project with a compliance blast
radius, not a curation cost.**

### §1.4 The launch blockers that gate ANY commercial launch

Independent of the wedge, and unresolved as of this read of the living register:

| Item | Status | Why it gates selling anything |
|---|---|---|
| **L-360** | P0 — the L-334 checksum hard-refuses valid projects, bricking them | You cannot take money for a workspace that can refuse to open |
| **L-391** | P0 — no CRDT network backend; production collab is last-write-wins | Multi-seat expansion revenue is the *whole* of proposal 2b |
| **L-188** | CRITICAL — GIS/site data lost on close+reopen | **Directly fatal to a per-parcel report product**: parcel → envelope → persist is the product |
| **L-396** | P1 — free-plan projects live only in one browser's IndexedDB; restore never drilled | Durability under a paid promise |
| **L-397** | MEDIUM — three inconsistent price tables in docs vs billing code | You cannot publish a price you contradict in code |
| **L-387** | P1 — 93 dependency advisories (7 critical) | Selling to funds invites security questionnaires |

**L-188 deserves emphasis.** The proposal's entry product is a *saved, revisitable per-parcel
artefact*. If site/GIS data does not survive close+reopen, the report product does not exist as a
product — only as a live session.

---

## §2 — The honest wedge

### §2.1 What is FALSE today

> ❌ *"PRYZM Site Check: click a parcel in Barcelona, get your legal buildable envelope and a
> compliant generated building in minutes, not weeks."*

Three defects, in descending severity:

1. **"legal"** — the numbers are constructed and badged amber; our own UI says *not an authoritative
   determination*. "Legal buildable envelope" reads as a determination.
2. **"a parcel in Barcelona"** — true for 24.0 % of buildable land; the other 76 % gets an estimated
   generic pack (or, after Phase 1b, an honest refusal). A three-in-four miss rate on the headline
   verb is not a scoping nuance, it is a broken promise.
3. **"in minutes"** — true and defensible. L-533 shipped the block cache; this is the one clause
   that survives untouched.

### §2.2 The narrowest claim that is TRUE on today's code

> ✅ **"PRYZM Site Check — Barcelona Eixample. Click a plot on the *densificació urbana intensiva*
> fabric (clau 13a — the Cerdà Eixample) and in under a minute get an indicative buildable envelope
> constructed from the PGM's own rules — depth from Art. 242.2, height from Art. 327.2 — with every
> figure sourced, every assumption shown, and a generated building that fits inside it. Indicative
> screening, not a municipal certificate. Outside 13a, PRYZM tells you it cannot answer yet rather
> than guessing."**

Every clause is checkable:

| Clause | Backed by |
|---|---|
| clau 13a / Eixample | `esBarcelonaEnsanche.ts:163`; L-538 measures it at 24.0 % of buildable land |
| depth from Art. 242.2, constructed | ADR-0271, `solveBlockDerivedDepth`; citation re-signed L-526 |
| height from Art. 327.2 | L-525a height table; width constructed per L-537 |
| every figure sourced / assumptions shown | C58 §1.3 explain-why; provenance chips; `capacityComparison.ts:17-33` three honesty rules |
| indicative, not a certificate | `GISAreaLayout.ts:2110` — **the product already says this; the marketing must not contradict the product** |
| generated building fits inside | envelope → generation bridge (L-401 track) — ⚠️ **verify containment end-to-end before claiming it**; §4 gates this |
| "tells you it cannot answer" | ⚠️ **NOT TRUE YET** — requires Phase 1b (4 dev-days). Today the fallback silently shows a fabricated setback triple. **Do not make this claim until 1b ships.** |

### §2.3 What shifts if the first 17 dev-days land

`BARCELONA-COMPLETE-COVERAGE-PLAN.md:436-439`: Phases 0 + 1 + 1b = **17 dev-days ≈ 3.5 weeks** →
**32.7 % constructed and 100 % honestly-tiered**.

The coverage move (24.0 → 32.7 %) is worth less commercially than the honesty move. **Phase 1b is
the highest-value marketing asset in the plan**, because it converts the sentence *"outside 13a you
get generic defaults"* — which is a liability — into *"outside 13a PRYZM refuses, with the article
that makes it refuse"* — which is a **differentiator against Archistar-class tools that interpolate**.
[INFERENCE: that competitors interpolate rather than refuse is an inference from category behaviour,
not verified against Archistar's product.]

Post-17-days the honest wedge upgrades to:

> ✅ **"Click any Barcelona plot. On the Eixample and the semi-intensive fabric (~a third of the
> city's buildable land) you get an indicative envelope constructed from the PGM. Everywhere else
> PRYZM tells you exactly which article governs and why it will not guess. No fabricated numbers,
> anywhere in Barcelona."**

That is a *complete* claim over the whole city — completeness of **answer**, not of **envelope**. It
is the strongest honest position available before September and it does not require certification.

---

## §3 — Pricing

### §3.1 The anchor the proposal chose is the wrong anchor

The proposal anchors a per-parcel report against "Spanish boutique feasibility-study costs". Two
anchors actually exist, and the product sits between them — much nearer the cheap one.

| Anchor | Price | What it is | Evidence |
|---|---|---|---|
| **Cédula urbanística** (municipal) | **€30–150**; Murcia €43.80/parcel, Santa Cruz de Tenerife €63.60, Guadalajara €10.82 | The *official, municipality-issued* statement of the planning regime on a parcel — the actual authoritative document | [RESEARCHED] — municipal sede pages + arquitasa summary |
| **Estudio de viabilidad / due diligence urbanística** | professional guideline **0.5–2‰ of the investment budget** → **≈ €1,500–6,000 on a €3 M promotion** | A human professional's *economic + urbanistic* opinion: costs, revenue, margin, contingencies, CAPEX, risk — and their name on it | [RESEARCHED, secondary] — professional-forum guideline + Gesvalt DD scope; **the ‰ range is a rule of thumb, not a tariff. Architects' fees have been free in Spain since 1996** |

**The decisive observation the proposal misses:** the cheap anchor is the *authoritative* one. A
promotora can buy the legally binding planning readout from the ayuntamiento for **€44**. What they
pay €1.5–6 k for is the **judgement, the economics and the professional's liability** — none of
which we supply. Note also that even the official cédula is "merely informative with no binding
effect" [RESEARCHED] — which tells us the market already distinguishes *information* from
*entitlement*, and prices information near zero.

So: **an uncertified constructed envelope cannot be priced at the feasibility-study anchor.** It is
not that anchor's product. Selling amber numbers at €1,500 while the panel reads *"not an
authoritative determination"* is a misrepresentation risk we should not run — and it is
self-defeating, because the €44 official document undercuts us on authority.

### §3.2 What the product actually is, priced honestly

The value we add over the €44 cédula is **speed, geometry and the generated building** — a
three-minute 3D screening answer with a massing that fits, versus a 15–30 day text document
[RESEARCHED: cédula turnaround 15–30 days]. That is a *screening* product: it changes which parcels
a promotora bothers to pay a professional to study. It does not replace the professional.

| Tier | What it is | Band | Gate |
|---|---|---|---|
| **Free / lead** | Click a plot, see the envelope + massing in-browser, watermarked, no export | €0 | none — this is the demo, and it is real today on 13a |
| **Indicative Site Screening report** (PDF/link, cited, amber-badged, refusals included) | The September entry product | **€49–149 per parcel** [INFERENCE], deliberately bracketing the cédula band | Phase 1b (honest refusals) + L-188 (it must persist) |
| **Volume screening pack** | 10 / 50 / 200 parcels, for funds sweeping a district | per-parcel price stepping to **€20–40** at volume [INFERENCE] | same |
| **Seat / subscription** | The authoring substrate — generate, edit, IFC/DXF export, collaboration | existing tiers, **once L-397 is reconciled** | L-391, L-360 |
| **Certified / stamped report** | Green-tier figures certified against the official *fitxa urbanística* | **€300–800 per parcel** [INFERENCE] — approaching the DD anchor | **L-528 certified per clau + professional indemnity + a lawyer's sign-off on the wording. Not September.** |

**Recommendation on report-vs-seat: the proposal's structure is right, its emphasis is inverted for
September.** Report-as-hook → seat-as-expansion is the correct motion, but in September the *seat*
sells the thing that is genuinely excellent and carries no legal warranty (the authoring substrate),
while the *report* is a cheap, honest lead magnet that proves we know the fabric. Pricing the report
high inverts the risk: it puts the highest price on the least certain artefact. **Sell the report at
screening prices; earn the revenue on the seat.**

### §3.3 What certification would unlock

Running L-528 per clau (~2–3 dev-days each, ~15 days for the full track) moves packs
`estimated-ruleset` → structured/green. **[INFERENCE]** that is plausibly a **3–6× price step** on
the report, because it moves the artefact from "screening" toward the DD anchor. It is the highest
price-per-dev-day lever in this document — but it is **necessary and not sufficient**: certification
makes the number right; it does not make us liable-capable of standing behind it. See §3.5.

### §3.4 One thing we must not do

Do not sell a **subscription** whose value proposition is coverage we do not have. A monthly seat
sold on "Barcelona zoning intelligence" churns the moment the second user clicks a Ciutat Vella plot
and gets a refusal. Either the report is per-parcel (pay for what answered) or the seat is sold on
**authoring** (which works everywhere). The failure mode is a seat sold on coverage.

### §3.5 ⚠️ FOR A HUMAN — NOT ANSWERABLE HERE

**I am not able to give legal advice and none of the following is legal advice.** These are the
questions a Spanish lawyer must answer *before* any price is published:

1. **Does selling a paid per-parcel "buildable envelope" report constitute a regulated professional
   service in Spain** (a *trabajo profesional* touching the reserved competences of arquitecto /
   arquitecto técnico), or is it an unregulated information product? The answer decides whether a
   disclaimer is sufficient or whether a collegiate professional must sign.
2. **Is our disclaimer wording sufficient and enforceable** in a B2B contract with a promotora who
   relies on the number and loses money? What limitation-of-liability clause is enforceable under
   Spanish consumer/commercial law?
3. **Professional indemnity insurance** — is it obtainable for a software product that outputs
   planning figures, at what premium, and does the insurer require certification (L-528) as a
   condition?
4. **Naming risk** — can a commercial product use "cédula", "informe urbanístico", "certificado" or
   any term the market reads as the municipal document? **[INFERENCE: assume no; use "screening" /
   "indicativo" until told otherwise.]**
5. **Catastro / MUC terms of use for a paid derivative product.** The WMS carries a "no massive
   downloads" clause (`ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md:84`); reselling derived
   outputs at scale is a different question from personal consultation, and it is unanswered.
6. **GDPR / data-residency** for parcel-level records tied to identified buyers.

**Rule for September, pending 1–6: do not sell a report as a determination, do not use certificate
language, and keep the in-product disclaimer verbatim in every commercial surface.** The panel's
sentence at `GISAreaLayout.ts:2110` is the ceiling on what marketing may claim — marketing may not
outrun the UI.

---

## §4 — Sequencing: a dated path to September

Today is **2026-07-21**. "Early-to-mid September" ≈ **6–7 calendar weeks**.

### §4.1 The sequencing argument: Barcelona-deep → Spain-broad

The proposal says *Spain-deep → country-broad*. The evidence says **Barcelona-deep → Spain-broad**,
and the reason is arithmetic, not sentiment:

- **Barcelona rule work converts to output at 100 %.** Block dissolve is 2/2 (L-535). Every dev-day
  spent on `13b`/`12`/`22a` produces a working answer.
- **Madrid rule work converts at ~50 %, Córdoba at ~0 %** — *before* a single rule is written. A
  perfect PGOUM-1997 pack still shows nothing on half of Madrid.
- **Therefore the marginal dev-day in Barcelona is worth ~2× the same day in Madrid and ~∞ in
  Córdoba**, until the tolerant-dissolve work lands — and that work is a compliance-critical
  tolerance change of exactly the class that produced L-529.
- **And the market argument points the same way**: one dense, complete, honest city is a stronger
  reference than three half-covered ones. **[ASSUMPTION — untested with buyers; §6 Q1.]**

The proposal's phrase *"widening within Spain is a curated-ruleset cost reusing the same Catastro
pipeline"* is the specific sentence to strike. It is true of the *parcel* pipeline (9/9) and false of
the *block* pipeline (4/9 outside Barcelona), and the envelope depends on the block pipeline.

### §4.2 The dated path

| Window | Track | Deliverable | Gates which claim |
|---|---|---|---|
| **W1 · Jul 21–27** | **Truth-first** | (a) Run the **parcel-weighted** clau probe — replace the area-share 24.0 % with a click-probability number. (b) Verify **envelope→generation containment** end-to-end on a real 13a parcel. (c) Decide the L-397 price table. | Unblocks *any* quantified coverage claim and the "building fits inside" clause |
| **W1–W2 · Jul 21 – Aug 3** | **Phase 0** (6 d) | De-hardcode the dispatch gate → clau→pack registry; ADR-0272 (coverage+FAR kind); **refusal vocabulary** | Prerequisite for everything below. ⚠️ P0.1 is owned by the L-537 agent — coordinate |
| **W2–W3 · Jul 28 – Aug 10** | **Phase 1b** (4 d) — *do this before Phase 1* | Honest cited refusals for systems + `18` + tail | **Unlocks "no fabricated numbers anywhere in Barcelona"** — the strongest September sentence |
| **W3–W4 · Aug 4–17** | **Phase 1** (7 d) | `13b` pack → **32.7 %** constructed | Unlocks "the Eixample *and* the semi-intensive fabric" |
| **parallel, all weeks** | **Blockers** | **L-188** (site data must persist) · L-360 · L-391 · L-396 · L-387 | **L-188 gates the report product existing at all**; L-391 gates the seat |
| **W4–W6 · Aug 11–31** | **Certification** | Run **L-528** on 13a (the saved browser prompt exists: `PAU-CLARIS-155-CERTIFICATION-PROMPT.md`). Founder-runnable. | Only path from amber → green on the launch fabric. **If it lands, and only then, the report price band may move** |
| **W5–W6 · Aug 18–31** | **Commercial** | Legal answers §3.5 Q1–Q4; publish price; landing copy = §2.2/§2.3 sentence verbatim | Gates publishing any price |
| **W6–W7 · Sep 1–14** | **Launch** | Ship the wedge at the honest claim level reached | — |

**Explicitly NOT on the September path**: Phase 2 (`22a`+`20a`, 26 d), Phase 3 (`12`/`12b`, 28 d),
Madrid, Córdoba, the tolerant dissolve, Denmark, Switzerland. `12`/Ciutat Vella additionally carries
an unresolved blocker — the heritage-overlay layer may not be queryable at all
(`BARCELONA-COMPLETE-COVERAGE-PLAN.md:471-473`), which would make correct clau-12 answers impossible
rather than merely expensive.

**Realistic assessment of this schedule.** 17 dev-days of coverage work + the P0 blocker track +
certification + legal, in 6–7 weeks, is achievable **only** under the parallel-agent execution model
the September program plan assumes — and that plan's own honest residuals apply: human ratification
latency and verification load do not parallelise. **If something must give, give up coverage, not
honesty**: launching at 24 % with Phase 1b's refusals shipped is a better product than launching at
32.7 % with silent fabricated fallbacks still in place.

---

## §5 — What we CANNOT say in September

The do-not-claim list. Each line names the evidence that forbids it.

### Absolutely forbidden

| ❌ Do not say | Because |
|---|---|
| **"legal buildable envelope"** / "legally binding" / "certificate" / "cédula" / "certified" | Figures are `estimated-ruleset` (`esBarcelonaEnsanche.ts:155`); the UI says *not an authoritative determination* (`GISAreaLayout.ts:2110`); L-528 is OPEN |
| **"click any parcel in Barcelona"** / "Barcelona coverage" / "all of Barcelona" | 24.0 % of private buildable land (L-538) |
| **"compliant building"** — as a verdict | `capacityComparison.ts:19-31`: a verdict inherits the weakest input; "COMPLIANT" against an estimated pack "would be a fabricated compliance claim about a real building". Say **"fits inside the indicative envelope"** |
| **"works across Spain"** / "national coverage" / "Madrid next month" | L-535: block ring Madrid 2/4, Córdoba 0/3 |
| **"replaces your feasibility study / your urbanista"** | We supply no economics, no judgement, no professional liability (§3.1) |
| **"real-time collaboration"** | L-391 — no CRDT network backend; production collab is last-write-wins |
| **"European BIM platform" / "the European Archistar"** | The 2026-07-17 competitive audit's positioning verdict, §8: *"No."* Nothing since changes the category claim |

### Forbidden until a specific gate

| ⏳ Do not say — *yet* | Gate |
|---|---|
| "PRYZM never fabricates a number" / "tells you when it can't answer" | **Phase 1b shipped** (4 d). Today the fallback silently shows a generic setback triple |
| "the generated building provably fits inside the envelope" | **W1 containment verification** |
| "surveyed / official figures" | **L-528 certified for that clau** |
| "your report is saved and shareable" | **L-188 fixed** |
| any specific seat price | **L-397 reconciled** (three inconsistent tables) |
| "a third of Barcelona" | **Phase 1 (`13b`) shipped** — 24.0 % until then |

### The reframe that keeps the honesty and the pitch

Three claims that are true today, and stronger than the forbidden versions:

1. **"We show our working."** Every figure carries its article, its source and its confidence tier.
   Nobody else in this category ships the provenance chip. **[INFERENCE on the competitive claim.]**
2. **"We refuse rather than guess."** After Phase 1b, on 100 % of Barcelona. That is a *feature* for
   a fund's risk committee, not an apology.
3. **"Minutes, not weeks."** [RESEARCHED: the official cédula is 15–30 days.] This clause of the
   original pitch survives entirely intact — and it is the one that actually sells.

---

## §6 — Open questions for the founder, and the research that resolves them

| # | Question | Why it is open | How to resolve |
|---|---|---|---|
| **Q1** | Will a promotora pay for an explicitly **indicative** screening report, or does anything short of a stamped document have zero willingness-to-pay? | **The single commercial unknown this document cannot close.** All pricing in §3.2 is [INFERENCE] | **5–10 buyer interviews.** Show the amber panel *including the disclaimer* and ask for a price. Do not survey — sell |
| **Q2** | Is the buyer the **promotora** (deal-by-deal, price-sensitive, wants a stamp) or the **fund/land-sourcing analyst** (portfolio sweep, wants speed over authority)? | They want opposite products. The fund is the better fit for an uncertified screening tool **[INFERENCE]** | Same interviews. Split the sample |
| **Q3** | What is the **parcel-count** click-success rate, as opposed to the 24.0 % land-area share? | Explicitly undetermined (`BARCELONA-COMPLETE-COVERAGE-PLAN.md:477-478`) | Catastro-driven parcel-weighted probe. **W1. Cheap. Do it before any coverage claim is published** |
| **Q4** | Does L-528 certification actually move willingness-to-pay 3–6×, or is it table stakes with no premium? | [INFERENCE] in §3.3 | Ask Q1 interviewees both prices, amber vs green |
| **Q5** | Is 22.5 % of Barcelona (clau `18`) permanently unanswerable? | Depends on whether RPUC/NUMAMB publishes per-site approved volumetries as data — unknown | Phase 5's 12-day investigation. **Materially changes the ceiling of the whole wedge** |
| **Q6** | Buy-vs-build on rule curation (the Terrara question, CF-2 in the competitive audit) | 106 dev-days for one city is a *recurring* maintenance cost, not a one-off | Commercial: does a Spanish equivalent of Terrara exist for PGOU normalisation? Unresearched |
| **Q7** | Should September launch **at all**, or should it be a design-partner programme? | The P0 blockers (L-360, L-391, L-188) are the real critical path, and a paid launch on top of them is the risk this document is least able to price | Founder call. **[INFERENCE: 5 paid design partners at €500/mo beats a public launch at a published price, because it converts every honesty gap into a conversation instead of a refund.]** |

### Research done here, and its limits

**[RESEARCHED]** — cédula urbanística fees €30–150 (Murcia €43.80, Santa Cruz de Tenerife €63.60,
Guadalajara €10.82); 15–30 day turnaround; "merely informative, no binding effect". Viability-study
professional guideline 0.5–2‰ of investment budget; architects' fees deregulated in Spain since 1996.
Archistar publishes subscription pricing (~USD 95 / 345 / 595 per month by tier) and sells
per-site report add-ons **without publishing per-report prices** — i.e. the closest comparable
company also monetises primarily by subscription, which supports proposal 2b.

**Limits.** All Spanish pricing above is from municipal sede pages and professional-forum/consultancy
secondary sources, not a tariff, and the ‰ guideline is a rule of thumb. **No Spanish buyer was
interviewed.** Everything in §3.2's bands is [INFERENCE] until Q1 is run.

**Sources:**
[Ayuntamiento de Murcia — Cédula Urbanística (730)](https://sede.murcia.es/ficha-procedimiento/730) ·
[Gerencia de Urbanismo Santa Cruz de Tenerife — Cédula urbanística](https://www.urbanismosantacruz.es/es/procedimientos/cedula-urbanistica) ·
[Ayuntamiento de Guadalajara — Cédulas urbanísticas](https://www.guadalajara.es/es/procedimientos/informacion-o-cedulas-urbanisticas-relacionadas-con-el-planeamiento-mod-1080.html) ·
[Ayuntamiento de Madrid — Cédula urbanística](https://sede.madrid.es/portal/site/tramites/menuitem.62876cb64654a55e2dbd7003a8a409a0/) ·
[Arquitasa — Cédula urbanística: qué es](https://arquitasa.com/cedula-urbanistica/) ·
[Gesvalt — Due Diligence Urbanística](https://gesvalt.es/empresas/consultoria/due-diligence-urbanistica/) ·
[Sólo Arquitectura — honorarios de estudio de viabilidad](https://www.soloarquitectura.com/foros/threads/calculo-de-honorarios-de-estudio-de-viabilidad-de-promocion-inmobiliaria.126598/) ·
[Risco Arquitectos — honorarios reales](https://riscoarquitectos.es/honorarios-precios-risco-arquitectos/) ·
[Archistar — Pricing](https://www.archistar.ai/pricing/) ·
[Archistar — Development Feasibility](https://www.archistar.ai/development-feasibility/) ·
[Capterra — Archistar pricing](https://www.capterra.com/p/213621/Archistar/)

---

## §7 — Closing

The proposal is **directionally right and quantitatively wrong in two places**, and both are fixable
without abandoning it:

- It prices a **screening estimate** at a **determination's** anchor. Reprice to €49–149 and earn on
  the seat; hold the higher band behind L-528 + indemnity + a lawyer.
- It assumes Spanish breadth is a **curation** cost. L-535 measures it as a **geometry-correctness**
  cost with a compliance blast radius. Go Barcelona-deep first — the founder's instinct, and the
  numbers agree with it.

Everything else in the proposal survives: narrow wedge ✅, report-as-hook → seat-as-expansion ✅,
promotora/fund audience ✅, one country proven first ✅.

**And the thing worth protecting above the launch date:** this product already says
*"not an authoritative determination"* on its own screen. That sentence is the most commercially
valuable asset in the repository — it is why a fund's risk committee can use us. Marketing must sit
*underneath* it, never on top of it.

*End of assessment. No code was modified, no contract flipped, no master tracker/plan edited.*
