# ENVELOPE REACHABILITY TRACKER

**Status**: LIVE (founder directive, 2026-08-02). **Built from measured artefacts only.** Maintained per reporting cycle.
**Related**: [PEC-EXECUTION-DASHBOARD](./PEC-EXECUTION-DASHBOARD.md) · [C64](../../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) · [ADR-0290](../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) · [ADR-0292](../../02-decisions/adrs/ADR-0292-no-tool-reports-a-result-it-cannot-verify-against-external-ground-truth.md) · [ES-REGIONAL-PLANNING-DATA-STANDARDS](../../04-reference/jurisdictions/es/ES-REGIONAL-PLANNING-DATA-STANDARDS.md)

> **The question this answers — two numbers, always together:**
> **How much of Spain is envelope-REACHABLE, and how much of that has PRYZM REACHED?**
>
> *"Coverage alone hides whether the gap is our failure or Spain's data."*

---

## 1 · THE FRAME — what is even reachable

| State | Meaning | Envelope |
|---|---|---|
| **R0** | no **municipal** planning instrument exists | ⚠ **NOT automatically never — see the rule below** |
| **R1** | instrument exists, raster or PDF only | not without vectorisation |
| **R2** | classification only (urbano/urbanizable/no urbanizable) | **never** — a regime selector, not an envelope hook |
| **R3** | ordinance/zone **code** published, parameters in the ordinance text | yes, **with corpus** |
| **R4** | **structured parameters** (altura / edificabilidad / profundidad as attributes) | **yes, directly** |
| **RU** | never properly probed | **unknown** |

### Measured today — by municipality count

| State | Municipalities | Share | Evidence |
|---|---:|---:|---|
| **R0** | **1,357** | **16.7 %** | SIU `Planeamiento_Vigente`, `FiguraVigente = 'Sin Planeamiento'`. Census, **8,217 rows, 0 errors**, re-runnable: `tools/cold-start-probe/_siu_planvigente.json` |
| **R1–R4** | — | — | **NOTHING HAS BEEN MEASURED INTO THESE STATES.** See §1.1 |
| **RU** | **6,774** | **83.3 %** | everything with an instrument whose digital/parameter status is untested |
| **TOTAL** | **8,131** | 100 % | |

⚠ **Denominator note:** the SIU census returns **8,217 rows**; **86 carry `CodINE 53xxx`** and are *entidades locales menores / comunidades*, **not municipalities**. Excluding them gives **8,131**, which is the frame used throughout.
⚠ **This tracker's first computation of R0 was WRONG** — it tested for an empty `FiguraVigente` and returned 86 (1.0 %), contradicting the known 1,357. The real vocabulary is `Sin Planeamiento`. Recorded per ADR-0292: *a verification tool with no error history has usually not been verified.*

### 1.0 · ⛔ THE R0 RULE — "no municipal instrument" is NOT "no applicable ordinance"

> **Supletory regional and provincial instruments defeat it.** State it once here so it is not rediscovered
> per region.

- **Galicia — the proven case.** *Plan Básico Autonómico* (Decreto 83/2018) **applies** where there is no
  general municipal planning and is **complementary** where there is, supplying *"indeterminations and
  gaps"* with its own ***ordenanzas***. Beneath it, *Planes Básicos Municipales* are drafted **by the
  region** for municipalities under 5,000 — *"so all Galician municipalities end up with a basic urbanistic
  instrument."*
- ⭐ **Castilla y León — the evidence is in data we already hold.** Its own listing distinguishes *Sin Plan*
  **with an explicit pointer to NSAP — provincial subsidiary norms** — and that pointer is in the open-data
  description already in the corpus. **Check the field before re-deriving this.**
- **Aragón** — provincial *normas subsidiarias*, same check outstanding.

⇒ **R0 as counted here is an UPPER BOUND ON TERMINALITY, not a measurement of it.** A municipality leaves R0
the moment a supletory instrument with parameters is shown to apply.

⚠ **AND THE COMPLEMENTARY CLAUSE IS DANGEROUS AS WELL AS LARGE** — see counsel **Q5**. A regional instrument
that fills municipal gaps is *"exactly the kind of thing that produces a plausible parameter with no
municipal basis"*, and the error direction is **over-granting**.

### 1.1 · ⛔ WHY R1–R4 ARE EMPTY, AND WHY THAT IS CORRECT

> **THE SINGLE MOST IMPORTANT RULE IN THIS TRACKER:** *"A filing produced by municipal URL guessing does not count as measured. That method scored **0/20 with 88 % DNS failure**, and **three of its 'no data' verdicts have already been overturned**. Anything resting on it goes back to **RU**."*

Every existing per-municipality "no ordinance data" filing in this corpus was produced by that method. **They are untested, not refuted**, and they buy nothing in either direction. R1–R4 populate only on a **populated-attribute measurement over a real sample** — never a schema read, never a service ping, never a directory listing.

### R0 by CCAA — measured

| CCAA | munis | R0 | R0 % | | CCAA | munis | R0 | R0 % |
|---|---:|---:|---:|---|---|---:|---:|---:|
| Castilla y León | 2,248 | 785 | **34.9 %** | | Cantabria | 102 | 2 | 2.0 % |
| Castilla-La Mancha | 919 | 282 | **30.7 %** | | Extremadura | 388 | 4 | 1.0 % |
| Aragón | 731 | 167 | **22.8 %** | | C. Valenciana | 542 | 2 | 0.4 % |
| La Rioja | 174 | 27 | 15.5 % | | Catalunya · Madrid · Murcia · País Vasco · Illes Balears · Asturias · Canarias · Ceuta · Melilla | | **0** | **0.0 %** |
| Galicia | 313 | 24 | 7.7 % | | | | | |
| Navarra | 272 | 18 | 6.6 % | | | | | |
| Andalucía | 785 | 46 | 5.9 % | | | | | |

⚠ **Population split: NOT MEASURED.** *"Population is what tells you what the product is worth"* — and it is the missing half of this table. INE table **29005** (8,136 municipalities, period 2025) is the frame the probe already used for stratification; joining it is the cheapest outstanding item in this tracker. **No population figure is estimated here.**

---

## 2 · REACHABLE vs REACHED

**Nothing can be entered in this section yet**, because §1.1 leaves R3/R4 empty. It is defined now so that the first measurement has a place to go and cannot be reported as a single blended number.

| | Definition |
|---|---|
| **Reachable** | envelope is **possible** given published data |
| **Reached** | PRYZM **generates one today** |
| **Gap** | the difference, **and why** |

**Gap categories — and they are NOT equal:**

| Category | Nature | Enters a sprint? |
|---|---|---|
| legally terminal | **not a gap** — a correct answer | no |
| delegated to an instrument not held | **sourcing cost** | no |
| missing authoritative data | acquisition | no |
| **missing engineering capability** | **the only one that enters a sprint** | **yes** |
| awaiting legal interpretation | external | no |

### ⭐ The calibration case — Barcelona, measured

100 non-envelope parcels, seeded and re-runnable: **86 of 100 are answered by law or by an instrument someone else holds.** The engineering bucket is **~3 of 7 parcels ≈ 0.75 % of assessed parcels** — the only part PRYZM can close by building something. The other 4 are **open/disjoint published cadastral tiling, unrecoverable at any tolerance ≤ 1.0 m**.

> ⚠ **Use this as the sanity check it was commissioned to be:** *"If a new city's engineering bucket comes out far larger, **question the measurement before believing it.**"*

**And the roadmap consequence:** the largest lever is **delegated-to-instrument-not-held**, which is the same fact as `PD*` over **70.69 % of Barcelona's buildable land**. More Barcelona envelopes means **acquiring derived instruments — a sourcing cost, not an engineering task.**

---

## 3 · PER-REGION STATUS

⚠ **The `norm specifies ordinance parameters?` column is the one that decides scale and NOBODY HAS FILLED IT.** Andalucía's own Order says it standardises what is *"essential for interoperability"* — **which is not the same set as sufficient to compute an envelope.**

| CCAA | State | Endpoint | Parameter fields **populated**? | Norma técnica mandates delivery? | Norm specifies **ordinance parameters** or only classification/metadata? |
|---|---|---|---|---|---|
| **Catalunya** | **RU** ⚠ | AMB Refós `qualificacio_refos_3857` | **not measured as a non-null count** | **YES** (Refós framework) | **UNREAD** |
| **C. Valenciana** | RU | `terramapas.icv.gva.es/0702_Planeamiento` | not measured | unknown | — |
| **Illes Balears** | RU | MUIB | not measured — ⚠ `OBS` self-declares **not in force** | unknown | — |
| **Canarias** | RU | — | not measured (point-query only) | unknown | — |
| **Madrid** | RU | `idem.comunidad.madrid/geoserver3/wfs` · `sitcm:VPLA_V_ORDENANZA` | ⛔ **NEVER SAMPLED** — under test | unknown | — |
| **Murcia** | RU | municipal GeoServer | *Edificabilidad observed in a schema*; **populated + normative NOT established** | unknown | — |
| **Aragón** | RU | `icearagon.aragon.es/descargas.jsp?coleccion=Urbanismo` | **under test** | **YES — NOTEPA, Decreto 78/2017** | **UNREAD** |
| **Extremadura** | RU | `mapas.ideex.es/CICTEX/urbanismo` | **under test** — ⚠ listed **WMS**, WFS unconfirmed | unknown | — |
| **Andalucía** | RU | SITUA / VITUA | not measured | **YES — Normas Directoras, Orden 18-02-2026, in force 24-04-2026** | **UNREAD — this is the decisive cell** |
| *the other 8* | **RU** | — | — | **unknown — the 17-CCAA gazette sweep is running** | — |

⚠⚠ **CATALUNYA IS RATED `L4 (framework) / L2 (governing text unresolved)`, NOT L4.** `PD*` covers **70.69 % of Barcelona's buildable land**, recorded as *"the clau we read is a translation, not the governing text."* **Regional semantics with the governing determination delegated to an instrument we do not hold is L2 wearing L4's clothes across two-thirds of the best city we have** — and it is unresolved in Barcelona, therefore unresolved everywhere under the same corpus.

---

## 4 · THE SIGNATURE MULTIPLIER

> **Reachability is capped by what a SIGNATURE covers, not by what compiles.**

| If the signature is… | Then reached ≤ | Ceiling |
|---|---|---|
| **city-scoped** | signed cities | **≈ 5** |
| **corpus-scoped** | municipalities under a signed corpus | AMB PGM measured at **27 of 36** carrying `PGM='S'` |

### ⭐ Task 4 has reported, and the answer is NEITHER

**The signature binds to an exported source-code constant name, a repo file path, and a free-text substring — and nothing else.** `L449Gate` has four fields (`gate`, `file`, `value`, `signature{doc,anchor}`); verification is literally `readFileSync(doc).toContain(anchor)`. **There is no municipality field, no extent, no corpus id** — a grep for `corpusId|CORPUS_ID|ordinanceCorpus` returns **zero matches**. The corpus binding exists **only as prose inside `VERIFICATION.md` and is never machine-checked.**

Reading what each signature's **text** asserts splits three ways: **SIG-2** is municipality-bound **by the law itself** (*«al terme municipal de Barcelona»*, unre-scopable); **SIG-3** certifies a **dataset vintage** over a layer covering all 36 AMB municipalities but is confined to Barcelona **by hardcoded code**, not by the signature; **SIG-4** explicitly refuses extension.

⚠ **No signature in the ledger certifies "an interpretation of the PGM applied across a territory."**
⚠ **`isGateSignatureRecorded()` has ZERO production callers** — the L-449 registry is an audit artefact; the real gate is a hand-written per-city `if` chain in `siteDispatch.ts`.

⛔ **DO NOT WRITE "27 MUNICIPALITIES UNLOCKED."** `PGM='S'` means the metropolitan plan **applies**. It says nothing about each municipality's *modificacions* and *plans especials*. **`PD*` is unresolved in Barcelona, therefore unresolved in all of them.** The honest ceiling is **general PGM articles minus each municipality's derived instruments — and that subtrahend is unmeasured everywhere, including Barcelona.**

⚠ The per-municipality deviation list **already exists** (`esAmbPgmScope.ts`, `AMB_PGM_ARTICLE_SCOPE`) and is **short** for the articles Barcelona's envelope rides on — but its own source is **non-exhaustive, non-official, and consolidated only to 31-12-2009**. `metropolitan-no-recorded-modification` is **not** "verified unmodified".

**Until reachable and reached are both populated, they are reported SEPARATELY and never combined into a single national percentage.**

---

## 5 · WEEKLY DELTA — five lines, nothing else

**Cycle 1 — 2026-08-02 (frame established)**

1. **Left RU:** 1,357 municipalities → **R0**, on the SIU census. **No municipality has entered R1–R4.**
2. **Reachable ceiling:** **not yet measurable** — R3/R4 are empty by rule (§1.1).
3. **Reached:** **not yet measurable** against this frame. Five cities have measured envelope shares; **none has been placed in an R-state**, because none has had its parameter fields counted non-null.
4. **Largest gap category:** **delegated-to-instrument-not-held**, from Barcelona's calibration. **NOT engineering.**
5. **Next single action:** ⭐ **Aragón — download `icearagon.aragon.es/descargas.jsp?coleccion=Urbanismo` and count non-null on `edificab`, `aprove`, `densidad`.** Binary, one request, and it is the first municipality-set that can leave RU on evidence. *(Running.)*

---

## Rules — binding on every future edit

1. **Reachable and reached, ALWAYS BOTH.** *"A rise in reached against a flat reachable is real progress; a rise in reachable is discovery."*
2. **UNKNOWN, never NO.** An unreached service and an absent service are different findings; conflating them has already corrupted this survey once.
3. **POPULATED, never present.** A field name proves nothing. **Sample five values** — a column of `0`, `"NULL"` or `-9999` is populated and meaningless.
4. **No estimates without an interval, and no interval without a stated frame.**
5. **Everything traces to a re-runnable seeded run.**
6. ⚠ **No measured figure is transcribed into a contract, spec or ADR** (C64 §2.13) — this tracker is the artefact those documents cite.

---

## 6 · THE EXECUTION PLAN — phased, and every phase expressed as a count delta

**The pipeline, split by where the cost actually sits:**

| Per CCAA — **expensive, once** | Per municipality — **cheap, automated** |
|---|---|
| discover service → read ordinance corpus → encode ladder → identify municipal deviations → **one signature over the corpus** | INE code → parcels → ordinance polygons → variables → constraints → **envelope or cited refusal** → control check → publish |

⭐ **Catalunya's top half is DONE.** The PGM ladder is encoded, the AMB layer covers all 36 municipalities,
and SIG-3 certifies a **dataset vintage**, not a city. **That is why 26 are one unbinding away.**

| Phase | Work | Count effect |
|---|---|---|
| **0 · fail-closed** ⛔ *blocking, in flight* | `?? true` → `?? false`, 5 missing gates. **Measure coverage before/after — any loss was ungated and is a FINDING, not a regression.** | 0 direct; **precondition for all of it** |
| **1 · unbind Catalunya** | 3 hardcodes: `bcnRefosOVProvider` `08019` · the clau-18 guard · `registry.ts` packs. Parameterise on INE. **Control: Barcelona byte-identical.** | **2 proven → up to 26 reachable** |
| **2 · the onboarding runner** ⭐ | **The piece that does not exist and decides everything.** In: INE code. Out: coverage · deviation report · control pass/fail. | **reachable → proven, in batches** |
| **3 · run the AMB** | 26 through the runner. **Barcelona + Badalona flagged as deviations** (Arts. 327/328/320 rewritten); the other 25 on the base metropolitan ladder. | **up to 26 proven** |
| **4 · ⭐ storeys→metres — REORDERED 2026-08-02** | ⛔ **NOT street width.** Measured: the **OV route is 38.08 % / 58.33 %**, the **ladder route 5.87 % / 3.10 %** — street width serves the 3–6 % route, and **the storeys→metres module is worth ~10× more in both cold cities.** ⚠ **Two municipalities is a THIN base for an ordering decision — re-measure the OV/ladder split across more of the 26 before scoping.** Street width follows, for Arts. 320.3a/327.2a/328.2a. | **raises coverage INSIDE every municipality already onboarded** |
| **5 · Madrid as CCAA #2** | **The first real test of the per-CCAA cost, because the top half is NOT done.** 93,839 features, altura 70.2 % / plantas 72.9 %. ⚠ **Target the periphery — capital 3.6 %, Alcalá 69.4 %.** | **proves the CCAA model repeats, or shows what it costs when it doesn't** |

### ⭐ THE TWO DECISION POINTS — the plan turns on these, not on the phases

**After Phase 2 — does onboarding need code?**
> **Yes → you have 26 PROJECTS and the model is wrong. No → the model holds and Phases 3–5 are execution.**

⇒ **The runner's primary output is the ANSWER to that question**, not the coverage figures. **Success test: onboard a municipality with ZERO code changes.** *If it needs a branch, the branch is the finding — log it, don't fix it.*

**After Phase 5 — what did CCAA #2 actually cost, end to end?**
> ⚠ **That number, NOT Catalunya's, is what multiplies across the remaining regions.**

Catalunya's cost is **unrepresentative by construction**: its expensive half was already paid before the
count was being tracked. **Quoting Catalunya's cost as the per-CCAA cost would be the tenth
confident-and-wrong signal.**

### 6.1 · ⭐ THE FAN-OUT SEQUENCING RULE — serialise the shared code, parallelise everything downstream

⛔ **Region-per-agent is WRONG at Phase 0–2 and RIGHT after Phase 2.** The distinction is not stylistic; it
was **measured**.

**The evidence:** the five-agent city fan-out had **two agents independently and CORRECTLY fix the same
scorecard config bug** in one session. Shipping both would have been parallel wiring in a shared tool.
That produced the standing rule — ⭐ **"in a five-agent fan-out the reconciliation for shared code is
ADOPT, never ADD"** ([multi-agent-shared-tree-collisions]).

**Applied forward instead of after the fact:** every region needs **the same three unbindings**. Four region
agents would each hit `bcnRefosOVProvider.ts`, `siteDispatch.ts:4146` and `registry.ts` and produce **four
incompatible parameterisations** of one interface.

| Stage | Agents | Why |
|---|---|---|
| **Phase 0 → 1 → 2** | ⛔ **ONE, ALONE** | the shared spine. **Nobody else touches those three files.** The parameterisation is *the contract every future region uses*, not a Barcelona fix. |
| **After Phase 2** | **TWO — not four** | once onboarding is `INE code → run`, regions **stop colliding**. |

**The two, and why only two:**

- **Catalunya-batch** — the 26 through the runner. **Mostly execution.**
- ⭐ **Madrid** — the expensive half: corpus, ladder, signature. **This is the CCAA-cost measurement, and
  therefore the most valuable agent on the board.**

⚠ **Balears and Galicia wait for Madrid, deliberately.** Verbatim: *"Madrid is the measurement that prices
every remaining region — until it reports, Balears and Galicia are GUESSES about cost."* When they do run:
**Balears** is the same shape (`CODIAJ` + normativa URLs) but ⚠ **must read `OBS` — Eivissa's rows
self-declare NOT IN FORCE**; **Galicia is a different problem entirely** — not an adapter but *mandated ≠
served*, one question, **does `EnlaceGIS` bridge to the expediente?** *Yes → Galicia opens. No → it is
classification and it closes.*

**Four preconditions before any fan-out:**

1. **One agent owns each file.** Region agents write **rulepacks only** — never shared dispatch, never the runner.
2. **Every agent runs the same known-answer control.** Barcelona after unbinding must be **byte-identical**. ⭐ *That is what caught `maxRecordCount`.*
3. ⭐ **One shared corrections channel.** The week's best findings were **NATIONAL corrections discovered incidentally by CITY agents** — the stale dissolve figure, the empty-parse defect, three DGC/INE collisions. **Those must reach everyone, not sit in one worktree.**
4. ⛔ **`main` must move first.** Five consecutive agents built on a stale base because `origin/main` is still `ed5d3a0e`. **Fanning out onto that yields four divergent trees.** Founder-owned, and *"now the actual blocker."*

### Deferred ON PURPOSE — not forgotten

- **Delegated instruments (*plans parcials*)** — a real per-municipality **sourcing** cost. ⭐ **Refuse
  cleanly and ship the rest.** `PD*` is **8.29 % in Sant Climent** against **59.53 % in Barcelona**, so it
  costs **far less outside the reference city.**
- **Galicia's `EnlaceGIS`** (the candidate bridge to the *expediente*), **the unverified 17-CCAA gazette
  sweep**, and **CyL's «sin validez jurídica» question** — all **after Phase 5**.

> ⛔ **PHASE 2 IS THE ONE TO GET RIGHT. Everything before it is three strings; everything after it depends on
> whether onboarding is a COMMAND or a PROJECT.**

---

## 7 · ⭐ THE TRACKER MUST BE EMITTED, NOT TYPED — a Phase 2 deliverable

⛔ **THE HEADLINE COUNT IS THE ONE NUMBER THIS PROGRAMME DOES NOT COMPUTE FROM THE REPO.** Every other
figure this week was **measured, seeded and re-runnable**; this one is **typed into a report by
whoever ran last**, which means it exists only in whichever agent transcript produced it.

**That is the exact shape of `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md`** — written with correct
numbers in hand, **wrong in both directions weeks later.**

**What it must become — one row per municipality, emitted by the same run that computes coverage:**

```
INE · name · CCAA · status · envelope% · determination% · blocking item · class · last measured
```

`status ∈ published | proven | reachable | blocked | untested`

⭐ **The headline count is then a `grep -c`, not a claim. Nobody types it. Nobody can be stale about
it.** The onboarding runner **already computes every one of those fields to do its job**, so the
tracker is **the runner's output aggregated — not a separate build.**

⚠ **Until it exists, the standing rule is:** *re-run the count from the artefacts before quoting it,
and treat any figure older than the last commit as INDICATIVE.*

### 7.1 · The nine-item intake list

Scoring a CCAA is now a **named checklist**, not a judgement — see
**[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md)**:
**parcel · instrument selector · ordinance text · footprint · height+inputs · bulk · constraints ·
deviation list · validity.**

**Catalunya scores 7/9**, blocked on **item 5 (height module)**; **item 7 (constraint layers) is
missing in ALL FIVE cities** — ⛔ *absent, every published envelope is an upper bound with missing
ceilings, which is the defect Madrid was withheld for.*
