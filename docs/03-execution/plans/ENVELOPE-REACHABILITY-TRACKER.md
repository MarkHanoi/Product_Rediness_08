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
| **R0** | no planning instrument exists | **never** |
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
