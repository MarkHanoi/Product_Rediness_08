# SOURCE — Founder: France tiered scoring model + national buildability roadmap (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31. Captured **verbatim** in §A–§B.
> §C is mine and is marked as such.
>
> **France has no agent lane yet** (lane 5 is Portugal). This is captured so the analysis is on disk
> and reviewable when France is scheduled — not left in session memory.
>
> ⚠ **§A/§B contain two mutually inconsistent scoring rubrics and two mutually inconsistent national
> dashboards.** Both are preserved as delivered; the conflicts are itemised in §C (F-2, F-3).

**The core position, quoted:**

> I would **not** target 100% for France. Doing so would be misleading because **the missing data is
> structural, not an engineering gap.** The limiting factor is the decentralised PLU/PLUi system and
> the fact that numeric rules remain in municipal PDFs.

---

## §A — The tiered scoring model

### Split the single score into coverage vs completion

| Metric | Meaning | France realistic |
|---|---|---:|
| **Geographic coverage** | % of municipalities you can identify, zone, and return a governing ordinance for | **~95%** |
| **Structured completion** | % where all required numeric fields are machine-readable and verified | **~22% today** |
| **Verified extraction** | % after OCR + human verification | target **55–65%** |
| **Long-term ceiling** | assuming national structured SRU rollout | **85–90%** |

> This removes the impossible expectation that every municipality can ever become "100%".

### Four tiers

| Tier | Name | You can answer | Target |
|---|---|---|---:|
| **1** | **Bronze** (usable) | parcel · zoning · governing ordinance · official GIS. *Missing numeric rules is acceptable.* Essentially GPU coverage. | **95%** of French municipalities |
| **2** | **Silver** (structured) | + height · coverage · setbacks · permitted use, all extracted **with citations** | **30–40%** nationally |
| **3** | **Gold** (verified) | every numeric rule has ordinance article · paragraph · legal citation · **human verification** | **55–65%** — *the ceiling achievable via systematic OCR + verification without waiting for national reform* |
| **4** | **Platinum** | machine-readable legislation nationwide | **85–90%** — *only if France completes a structured national SRU rollout, which is outside your control* |

### Per-municipality score — **rubric A** (each municipality scored independently, not inheriting a national figure)

| Field | Weight |
|---|---:|
| Zoning polygons | 15 |
| Official ordinance | 10 |
| Uses | 10 |
| Height | 15 |
| Coverage | 15 |
| Setbacks | 15 |
| Buildable depth | 5 |
| Parcel API | 5 |
| Official GIS | 5 |
| Citations complete | 5 |
| **Total** | **100** |

**Bands A:** `95–100` Complete · `80–94` High confidence · `60–79` Partial · `40–59` Basic · `0–39` Discovery only

### National progress — **dashboard A**

```
Municipalities discovered:            34,900 / 34,900
Municipalities zoned:                 33,100  (~95%)
Municipalities with verified legislation: 7,700  (~22%)
Municipalities fully extracted:        1,800  (~5%)
Municipalities human verified:           620  (~2%)
```

> This gives a much more honest picture than a single percentage.

### Engineering KPIs

```
Coverage      = municipalities with official zoning ÷ total municipalities
Extraction    = verified legislative fields ÷ expected legislative fields
Verification  = human verified fields ÷ extracted fields
Completeness  = municipalities scoring ≥80 ÷ total municipalities
```

> These make it easy to see whether improvements come from expanding geographic coverage, extracting
> more structured rules, or increasing verification quality.

### Long-term targets

| Stage | Coverage | Completeness |
|---|---:|---:|
| MVP | 95% | 20–25% |
| v2 (OCR + verification) | 95% | 55–65% |
| Best realistic without national reform | 95% | 65–75% |
| National structured SRU rollout | 98–99% | 85–90% |

---

## §B — The national roadmap (10–15 month programme, "not a data import")

| Phase | Name | Deliverables | Target |
|---|---|---|---|
| **0** | National Foundation (2 weeks) | INSEE municipality registry · commune→PLU/PLUi mapping · GPU connector · IGN parcel connector · official GIS registry · metadata DB | Coverage **95%** |
| **1** | National Discovery | a profile per municipality: region · department · planning authority · PLU-or-PLUi · document version · effective date · GPU status · GIS availability. **Nothing legislative yet.** | 34,900 profiles ≈**100%** |
| **2** | Zone Inventory | zone codes (`UA UB UC AU A N …`) · official designation · permitted use · links to regulations. **No numeric values.** GPU already exposes these nationally. | ≈**95%** municipalities, ≈100% zones |
| **3** | Rule Classification | **classify before extracting** — every rule as `Numeric` / `Formula` / `Graphical` / `Conditional` / `Unknown` | Coverage **100%** |
| **4** | OCR Pipeline | extract Art 6 · 7 · 9 · 10 · 13 · 14 → raw text · article · paragraph · confidence · needs-review flag | **30%** automatic |
| **5** | Human Verification | planners/lawyers verify every extracted number → `Verified` or `Rejected` | **55–65%** national — *the shared OCR + human-gate ceiling* |
| **6** | Buildability Packs | `rules.json` · `zones.json` · `citations.json` · `metadata.json` · `history.json` — **everything immutable** | — |
| **7** | Solver | envelope · max volume · max footprint · height plane · street alignment · exceptions — **verified municipalities only** | — |
| **8** | Quality Control | missing citations · duplicate articles · impossible heights · coverage>100% · negative setbacks · broken ordinance links | score per municipality |

### Per-municipality score — **rubric B**

| Area | Weight |
|---|---:|
| Metadata | 5 |
| Official ordinance | 10 |
| Zone coverage | 10 |
| Uses | 10 |
| Height | 15 |
| Coverage | 15 |
| Setbacks | 15 |
| Depth | 5 |
| Citations | 10 |
| Human verification | 5 |
| **Total** | **100** |

**Bands B:** `95–100` Complete · `85–94` Verified · `70–84` High confidence · `50–69` Partial · `25–49` Discovery · `0–24` Metadata only

### National dashboard — **dashboard B**

```
Municipalities        34,900 total
Profiles              34,900   100%
Zones                 33,100    95%
Articles classified   31,000    89%
OCR extracted         14,000    40%
Human verified         8,700    25%
Complete rule packs    5,900    17%
Production ready       4,600    13%
```

### Priority order (ROI) — prioritise by impact per planning document

| Tier | Months | Targets | Population coverage |
|---|---|---|---|
| **1** | 1–3 | Large metropolitan **PLUi** authorities: Paris · Lyon · Toulouse · Bordeaux · Nantes · Rennes · Strasbourg · Lille · Grenoble · Montpellier | ~15–20% |
| **2** | 3–6 | Remaining metros: Dijon · Angers · Clermont-Ferrand · Brest · Tours · Metz · Nancy · Reims · Rouen · Orléans · Caen · Le Havre … | ~45–55% |
| **3** | 6–12 | Medium PLUi authorities (50k–250k inhabitants) | ~80% |
| **4** | 12–15 | Small communes and rural municipalities | ~95% |

### Final KPI framework

| KPI | Target | Ceiling |
|---|---:|---:|
| Geographic coverage | 95% | ~98% |
| Rule extraction | 60% | ~75% |
| Human verification | 95% *of extracted* | 100% |
| Production-ready municipalities (score ≥85) | 50–60% | ~65–75% without national reform |

---

## §C — Capture notes (MINE, not the founder's)

### F-1 — The coverage/completion split is a genuine improvement and should be adopted beyond France

Separating **"can we route this parcel to a governing ordinance?"** from **"do we hold verified numeric
rules for it?"** is correct, and France makes structural what other jurisdictions have hit accidentally.

**Madrid proved the same point the hard way this session.** Its previously-recorded **71%** turned out
to be a renormalisation over the three *cheap* C63 axes only; scoring all seven honestly gave **28%**,
with LEGISLATION a *measured* 0% (0 of 34 claus carry a full citation atom). Same defect, same fix:
never let a cheap-axis average stand in for the expensive ones.

The four engineering KPIs are the strongest artefact in this delivery — they make it visible *which*
lever moved, which a single percentage cannot.

### F-2 — CONFLICT: two different per-municipality rubrics, in the same delivery

Both total 100, but they are not the same instrument:

| Field | Rubric A | Rubric B | Δ |
|---|---:|---:|---|
| Metadata | — | 5 | **B only** |
| Official ordinance | 10 | 10 | — |
| Zoning polygons / Zone coverage | 15 | 10 | **−5** |
| Uses | 10 | 10 | — |
| Height | 15 | 15 | — |
| Coverage | 15 | 15 | — |
| Setbacks | 15 | 15 | — |
| Depth | 5 | 5 | — |
| Parcel API | 5 | — | **A only** |
| Official GIS | 5 | — | **A only** |
| Citations | 5 | 10 | **+5** |
| Human verification | — | 5 | **B only** |

The **bands differ too** — A has 5 classes and a 60–79 "Partial"; B has 6 classes with "Partial" at
50–69 and adds "Verified" and "Metadata only". A municipality scoring 82 is *"High confidence"* under
A and *"High confidence"* under B by coincidence; one scoring 88 is *"High confidence"* under A but
*"Verified"* under B.

**Do not average or merge these.** Rubric B is later and better (it scores *citations* at 10 and adds
*human verification* explicitly, which matches the Gold-tier definition), but this is a decision to
make, not a detail to smooth over.

### F-3 — CONFLICT: the two national dashboards disagree by up to 14×

| Metric | Dashboard A | Dashboard B | Ratio |
|---|---:|---:|---:|
| Zoned | 33,100 (95%) | 33,100 (95%) | — |
| Verified legislation / OCR extracted | 7,700 (22%) | 14,000 (40%) | 1.8× |
| Fully extracted / complete rule packs | 1,800 (5%) | 5,900 (17%) | 3.3× |
| **Human verified** | **620 (2%)** | **8,700 (25%)** | **14×** |

Neither dashboard is labelled *today* vs *target*. Read in context, **A appears to be "today" and B
"end-state"** — but that is my inference, not stated. Given the founder's own headline says structured
completion is *"~22% today"*, dashboard A's 22% is the current figure and B's numbers are aspirational.
**This must be resolved before either is quoted**, or "France is 25% human-verified" will enter a deck
as a present-tense fact when the stated figure for today is 2%.

### F-4 — This competes with C63 and must be reconciled, not run alongside

France proposes a **100-point weighted per-municipality rubric** plus a **multi-metric national
dashboard**. PRYZM has already ratified **C63's 7-axis per-city scorecard** with agreed weights
(LEG25 · ENV20 · PAR15 · SRC15 · HGT10 · TER10 · CTX5), and `tools/city-completion` computes it.

This is the **third** competing completeness model to arrive in one day — Spain's batches produced five
mutually inconsistent scales (capture notes C-2, C-10, C-29, G-9), and the Genome's §37 proposed a
finer decomposition. The honest read: **C63's axes and France's rubric are measuring genuinely
different things** — C63 scores a *city's data estate*, France scores *per-municipality rule
completeness at national scale*. That may justify both, but only if the relationship is written down.

**Recommendation:** keep C63 as the ratified per-city instrument; treat France's rubric as a candidate
**national roll-up layer** above it; raise an ADR before either is used in reporting. Do **not** let a
second scoring system accrete silently — that is precisely the "dozens of incompatible schemas" outcome
the Genome architecture exists to prevent.

### F-5 — "Don't target 100%" is consistent with positions PRYZM has already ratified

This is not a retreat; it matches decisions already on record:

- **Madrid NZ-1 is ring-only by decision** — deliberately not computed, because per-*ficha* case law is
  not an engineering gap.
- **Spain's stated target is 95% automated + 5% explicit refusal with a cited reason** — the corpus's
  own definition of "complete" for a buildability engine.
- **Denmark's resolver refuses by design** when evidence is absent, and that refusal is a *typed value*
  with a diagnostic trail, not a failure.

France is the same principle at national scale. The tier model is arguably the clearest expression of
it yet, because it names *what you can honestly promise at each level* rather than a single number.

### F-6 — Phase 3 (classify before extracting) is the most transferable idea here

Classifying every rule as `Numeric` / `Formula` / `Graphical` / `Conditional` / `Unknown` **before**
attempting extraction is a better sequencing than any other jurisdiction in the corpus has proposed,
and it generalises:

- **Germany** — a `Graphical` classification is exactly the *Nutzungsschablone* / Planzeichnung problem,
  where the value is in a drawing rather than prose. The German extractor currently detects conflicts
  but cannot resolve zone attribution; a rule-kind classifier would tell it *why* a value is missing.
- **Barcelona** — `edificabilitat` is an **algorithm, not a lookup** (ADR-0271). Under this taxonomy it
  is `Formula`, and a compiler that assumed `Numeric` would silently produce a wrong value. **This
  classification would have caught that class of error by construction.**
- **Madrid** — `COEF_Z` is currently quarantined precisely because its *kind* is unknown.

**Recommendation:** lift `RuleKind` into the shared ontology rather than treating it as a French phase.
It costs almost nothing and it converts a whole class of silent-wrong-answer into an explicit `Unknown`.

### F-7 — Unverified inputs to flag before this is planned against

- **34,900 municipalities** is in the right range for French communes (~34,900–35,000), but the exact
  figure and its source date are not cited. INSEE revises it.
- **"GPU already exposes zone codes nationally"** is stated as fact and is the load-bearing assumption
  under the 95% coverage target. It is **ASSERTED-UNVERIFIED here** — no probe in this repo confirms
  GPU's actual national completeness, and the metadata-first sequence proven on Denmark today
  (schema → INSPIRE/ISO metadata → legal-status attributes → parser) has not been run against GPU.
- **The 10–15 month timeline** assumes a human verification workforce that does not currently exist.
  Phase 5's 55–65% ceiling *is* a staffing statement, not an engineering one.

**When France gets a lane, its Phase 0 should begin with the Denmark sequence against GPU/IGN** — that
is a day of work and it either confirms the 95% or invalidates the whole roadmap's foundation.
