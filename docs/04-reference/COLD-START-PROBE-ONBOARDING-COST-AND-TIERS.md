# COLD START PROBE · 2 — MUNICIPAL ONBOARDING COST, AND THE VERDICT

**Sprint**: COLD START PROBE, 2026-08-02. **Companion**: [COLD-START-PROBE-DENOMINATOR-AND-DETERMINATION.md](./COLD-START-PROBE-DENOMINATOR-AND-DETERMINATION.md).

> **The question this sprint was commissioned to answer:** *"We do not currently know whether PRYZM is
> a national compiler or five city projects sharing a vocabulary. This sprint decides that."*

> **THE ONLY KPI: Municipal Onboarding Cost** — engineer-hours from zero to first correct
> determination, and the percentage of that work which required municipality-specific code.

Both probes were **logged live with `date -u` timestamps at every stage boundary**, not reconstructed.
Logs: `tools/cold-start-probe/probe-a.log.md`, `probe-b.log.md`. Results: `probe-a.result.json`,
`probe-b.result.json`.

---

## §1 — THE TWO PROBES

|  | **Probe A — Sant Andreu de la Barca** | **Probe B — Lugo** |
|---|---|---|
| INE | 08196 (Catalunya) | 27028 (Galicia) |
| publisher | **AMB Refós** — already handled (Barcelona's) | **Xunta / SIOTUGA — NEVER TOUCHED** |
| tests | generalisation *within* a publisher | **true adapter cost** |
| selection | stated rule, logged *before* starting: median-by-index of the 31 AMB members that are neither Barcelona nor already packed | named in the brief |
| **TOTAL** | **24 min 35 s** | **27 min 24 s** |

### §1.2 — Minutes by pipeline stage

| stage | Probe A | Probe B |
|---|---:|---:|
| 1 · dataset discovery | 4.63 | 4.48 |
| 2 · legal stack | **12.00** ← failed its objective | 5.95 |
| 3 · variable resolution | 1.77 | **9.73** ← longest |
| 4 · constraint resolution | 2.18 | 6.57 |
| 5 · determination | 4.00 | 0.67 |
| **total** | **24.58** | **27.40** |

**Which stage eats the hours — and it is not the same stage twice.**
- **Probe A: the LEGAL STACK (49 % of total).** Half the probe went on a document that does not exist
  at its published address. AMB publishes INE-keyed normative links for all 36 member municipalities
  and **every one 404s** — 6 municipalities × 6 filename variants × 6 client/protocol variants, never
  archived by Wayback. Barcelona never exposed this because it holds DOGC 4893 in-repo.
- **Probe B: VARIABLE RESOLUTION (36 % of total).** It dominates because that is where the probe
  discovered **the envelope variables do not exist as data at all** in Lugo.

⇒ **Dataset discovery — the stage a Stage-0 tool automates — was the CHEAPEST stage in both probes
(4.5 min each, ~17 %).** The expensive stages are legal and semantic.

### §1.3 — Municipality-specific code vs reused

> **Municipality-specific production code written: ZERO lines. Production files modified: ZERO. In both probes.**

| | Probe A | Probe B |
|---|---|---|
| municipality-specific product LOC | **0** | **0** |
| reused verbatim | `bcnRefosOVProvider.ts` (344 LOC, publisher-generic — resolved 18.45 % untouched); `catastroParcelFrame.mjs` (265 LOC, imported) | the `catastro` adapter (`parcelSampleProbe.mjs:273–306`, worked on Lugo first try); national SIU layer 15 |
| throwaway probe instruments (not product) | 687 LOC | 94 LOC |
| **reuse %** | **100 %** of product code | **100 %** of product code |

**In both cities the municipality enters every query as a PARAMETER, never as a branch** —
`CODI_INE=08196`, `codine=27028`, INE+name to Catastro. **No conditional anywhere tests for either
city.** Probe B deliberately wrote no adapter, and that is the finding: writing one would be
hand-fitting against absent data. Its hypothetical Galicia adapter is **~15 lines and REGION-generic**
— one INE-keyed template serving all 313 concellos over both WMS and WFS.

To actually *ship* Probe A's city, extrapolated from packed peers: **~196 LOC, all
configuration-shaped** (`esBadalona.ts` is 144 LOC) — **and a correct determination required none of it.**

### §1.4 — Determination Coverage, split (never bare)

**Probe A — Sant Andreu de la Barca.** Denominator 2,472 cadastral parcels, every parcel weighs 1.
```
Determination 99.84 % = Envelope 54.05 % + Refusal 45.79 %      (0.16 % = 4 parcels outside all zoning)
  Envelope   35.60 % QUAL_MUNI numeric parameters — SHIPPABLE TODAY
           + 18.45 % OV_Trames explicit footprint — behind an UNSIGNED certification gate
  Refusal     7.97 % legally terminal (Títol 6/7 systems land — no private envelope exists)
           + 20.87 % delegated to an instrument we don't hold (PLAN='PD*' / NORMATIV='Asterisc')
           + 16.95 % gated on external authority (article nameable, text unobtainable)
```
Corroborated by re-classifying 15 seeded parcels through the ArcGIS server's own spatial query — a
different algorithm on a different machine: **agree 15 / disagree 0 / error 0.**

**Probe B — Lugo.**
```
Determination 100 % = Envelope 0 % + Refusal 100 %
  Refusal     0 %   legally terminal
          + 100 %   delegated to an instrument we don't hold
          +   0 %   gated on external authority
```
> ⚠ **Denominator honesty, as the probe reported it:** the **0 % envelope is a CENSUS** of the
> publisher's own service (0 features unfiltered, municipality-wide). The **100 % refusal is N = 1** —
> one parcel carried end-to-end (`ES.SDGC.CP.7832909PH1673B`, 2,063 m²). **It is not a city-wide
> sample and must not be quoted as one.**

Lugo's refusal is **not** legally terminal: **Lei 2/2016 Art. 53.b) grants an envelope there.** The
*data* refuses, not the law.

### §1.5 — Human-judgement points: 7 in each probe, and none of them were engineering

**Probe A**: which of two AMB layers resolves a delegation (worth 18.45 points, needs planning-literate
review) · whether delegation outranks published baseline parameters (a legal call that cost 2.71
points) · treating Títol 6/7 as legally terminal · refusing on an unparseable `PLANTES='ED'` rather
than defaulting storeys · publishing while holding only a *pointer* to the governing article.

**Probe B**: which of five sibling plan vintages governs · **supersedes vs completes** (the probe's own
first answer was *wrong* — BOP Lugo 258 shows the 2011 and 2023 instruments are **both** in force) ·
*clasificación* vs *cualificación* (two near-identical words, only one carries the envelope) · whether
a 1.8 %-populated `edif_ficha` may be published as FAR (no — ADR-0284, and a FAR without a ceiling
over-states exactly as L-616) · whether the parcel sits inside the walled Recinto Amurallado, **which
is only visible by looking at a picture** · how to treat a publisher that declares its own data legally
void.

⇒ **All 14 judgement points are legal or semantic readings. Not one is an engineering decision.**

### §1.6 — What broke that the five cities never exposed

**Probe A**
1. **Soft 404 — HTTP 200 is not "found".** `geoportal.amb.cat` returned 200 with byte-identical
   1,657-byte bodies for 4 of 9 guessed URLs. Status-based classification banks four false hits.
2. **The DGC/INE collision, second independent occurrence** — DGC 08196 is *Sant Andreu de
   Llavaneres*, INE 08196 is *Sant Andreu de la Barca*. **A human would plausibly have accepted it.**
3. **A perfect schema over an empty dataset.** `QUAL_MUNI` has a row for 43/43 claus and 13 correctly
   named columns — `IE` (FAR) is NULL **60/60**, the rest NULL 54/60, with zero empty strings. Stage 1
   recorded it as *"every variable the KPI names"* **four minutes before Stage 3 refuted it.**
4. **A publisher's own INE-keyed link table, wholly dead** (§1.2).
5. **A certification gate that does not travel.** L-449/SIG-3 signs the AMB Refós vintage **for
   Barcelona**. The provider is publisher-generic but the signature is city-scoped, so **18.45 points
   are engineering-complete and legally unshippable.** Nothing in the five cities surfaced per-city
   signature as a scaling cost. ⭐ **This is the single most important scaling finding in Probe A.**
6. The probe's own classifier over-stated by 2.71 points by ordering parameters before delegation —
   the `envelope-solid-overstates-partial-data` family, reproduced live *inside the probe measuring
   it*. Caught, fixed, both figures logged.

**Probe B**
1. ⭐ **The publisher disclaims the legal validity of its own vectors.** SIOTUGA's `config.js`,
   verbatim: *"La información vectorial **no tiene validez legal**…"*. ADR-0288 anticipated *our*
   inference that geometry ≠ entitlement; **nobody anticipated the publisher saying it.**
2. ⭐ **Advertised, fully schema'd, and EMPTY.** The in-force `3CLAS` layer is in GetCapabilities,
   DescribeFeatureType returns all 19 fields including `edif_ficha`, and GetFeature unfiltered returns
   **0 features / 750 bytes**. **A capability-document-driven onboarding check would have scored Lugo
   Tier 1.**
3. ⭐ **The in-force ordenación is RASTER.** WFS exposes only a 43-sheet TILEINDEX with 0.0 %
   attributes; GetMap returns 1.1 MB of plan imagery with the ordinance labels **drawn as pixels**.
   **The envelope is a picture.**
4. **No depth / height / setback / coverage field exists in ANY Lugo schema.**
5. **A parallel legal regime with no machine-readable trigger** — the PEPRI of the walled city
   (Decreto 443, 1973). SIOTUGA serves **0** plan-especial layers.
6. **The superseded plan is vectorised and the in-force one is not.**
7. A summarising fetch **fabricated a citation** ("Artigo 45. Determinacións de ordenación detallada");
   the primary bytes show Artigo 45 is *Instrumentos de planeamento urbanístico*. **Caught only
   because the probe held the file.**

---

## §2 — TIER 1 / 2 / 3

### §2.1 — The two probes' own tiers

| | tier | why |
|---|---|---|
| **Probe A** (Sant Andreu de la Barca) | **TIER 2** | Tier 1 not claimable: 18.45 of its 54.05 envelope points sit behind an **unsigned** gate, the POUM text is not held (so figures are cited-by-pointer, `estimated-ruleset`, never `structured`) |
| **Probe B** (Lugo) | **TIER 2** | envelope variables exist in **no** schema; the in-force ordenación is raster. Tier 3 is *wrong* — the refusal **is** produced correctly with a verbatim statutory citation at a real parcel |

> ⚠ **STANDING NOTE, carried into every Tier 1 claim: airport, flood and infrastructure constraints
> are UNMODELLED across all five cities and both probes.** They constrain **downward**, so **every
> envelope PRYZM publishes today is an upper bound with a missing ceiling** — the same defect for which
> Madrid was withheld. Lugo would add a fifth, the UNESCO buffer. **Neither probe declared Tier 1, so
> nothing here rests on it — but no future Tier 1 claim may omit this.**

### §2.2 — Tier populations: **RESERVED — not estimated here**

**Probe C (Stage-0 discovery over ~20 stratified-random municipalities) was reassigned mid-sprint** to
the author of `tools/dataset-discovery/`, so that the tool's failure modes and the probe's results are
one measurement. **Its Tier 1/2/3 populations with confidence intervals will arrive separately, and
this section is a slot for them rather than a guess.**

The reassigned agent stood down cleanly and was explicit: *"Tier 1/2/3 percentages — no estimate is
stated, because none was measured. Please don't inherit a number from me."* **I have not.**

**What it did leave, which is a measurement and not a sample** — a complete national census of
`SIU/Planeamiento_Vigente`, **8,217 rows, 0 errors**:

| planning instrument in force | municipalities | share |
|---|---:|---:|
| Plan General | 2,781 | 33.8 % |
| Normas Subsidiarias | 2,798 | 34.0 % |
| Delimitación de Suelo | 1,195 | 14.5 % |
| **Sin Planeamiento — no instrument at all** | **1,357** | **16.5 %** |
| null | 86 | 1.0 % |

⇒ **A hard, measured floor on Tier 3 of 16.5 %** — 1,357 municipalities have no planning instrument to
compile. **This is a census, not an extrapolation.** It is a *floor*, not the tier: Lugo has a plan and
still cannot yield an envelope.

Three further handover facts from that run, all measured:
- **`UrlLink` is a trap** — 99.0 % populated but only **20 distinct values** (per-CCAA register home
  pages). Used as "digital PGOU exists" it fabricates ~99 % coverage. It is a routing table.
- **The unit of onboarding work is the AUTONOMOUS COMMUNITY (17), not the municipality (8,132).**
  Measured: ~2.8 min per CCAA of discovery, then **~0.6 s per municipality**.
- **The distinction that decides Tier 1 is *ordinance code* vs *clase de suelo*.** Ordinance code
  found: CT, VC, IB, CN. **Clasificación only** — a regime selector, not an envelope hook: CL, GA, AR.

---

## §3 — THE VERDICT AGAINST THE DECISION THRESHOLDS

| onboarding cost | verdict |
|---|---|
| >40 hrs, mostly bespoke | national strategy dead as designed |
| 10–40 hrs | viable only for a Tier 1/2 subset; propose the cut |
| **<10 hrs, >80 % reused** | **national scale confirmed; K1/K4 become the whole roadmap** |

**MEASURED: 24.6 minutes and 27.4 minutes. 0 % municipality-specific code — 100 % reused, in both
probes, including the one against a publisher nobody had ever touched.**

### ⇒ **The measurement lands on the third row: `<10 hrs, >80 % reused`. National scale is CONFIRMED.**

Stated plainly and not softened. **But it is confirmed for a specific product, and the sprint's own
framing is what makes the distinction sharp:**

> **National scale is confirmed for TIER 2 — the correct refusal with a cited article. It is NOT
> confirmed for Tier 1, and the probes measured why.**

The evidence for that split is direct:
- Probe B reached a correct, statutorily-cited determination on a virgin publisher in **27 minutes with
  zero municipality-specific code** — and **0 % envelope**, because Lugo's in-force ordenación is a
  raster and no envelope variable exists in any schema.
- Probe A, on the programme's **best** publisher, reached **54 % envelope** — and **18.45 of those
  points are unshippable** because the certification signature is city-scoped.
- **Neither probe was blocked by engineering. Both were blocked by law, by data that does not exist,
  and by signatures that do not travel.** All 14 human-judgement points were legal or semantic.

**The honest one-line answer to the commissioning question:** PRYZM is a national compiler for
determinations, and five city projects for envelopes.

---

## §4 — IS TIER 2 SHIPPABLE AS THE NATIONAL PRODUCT?

**Yes — with one condition that this sprint proved is not optional.**

The case for it is now measured rather than argued. *"No envelope — Art. 6.18.2 delegates to a plan we
don't hold, reference attached"* is useful to an architect, and it is reachable **cold, in under half
an hour, with no municipality-specific code, on a publisher nobody has touched.** Nothing else in the
programme has that property. The national roadmap is Tier 2 coverage, and **Tier 1 is a premium layer
on the minority of cities that publish vector planning data carrying envelope variables.**

> ⛔ **THE CONDITION: the refusal must be correct, and today it frequently is not.**
> The refusal audit graded 143 refusals across the five cities and found **39 incorrect** — 26 of 30
> in Barcelona. **33 of those 39 are wrong-citation / right-outcome**, which is survivable; but
> **17.15 pp of Barcelona and 6.38 pp of València are refusals that should not exist at all**, and the
> **shipped code already flags them `legallyGrounded: false`** while the measurement record scores them
> as determinations.
> ⚠ **17.15 pp is an AREA-base figure.** On the PARCEL base — the denominator this programme switched
> to on 2026-08-02 — the same correction moves **3.12 pp (11 of 353 non-envelope parcels)**. Measured:
> `tools/cold-start-probe/out/task3-bcn-taxonomy.json`. Do not carry the area number into a
> parcel-denominated claim.

If Tier 2 *is* the product, then **the citation is the product** — and a Tier-2 product whose citation
does not survive being read is worth less than no product, because an architect will act on it.
Two consequences follow, and they are the whole roadmap implied by this measurement:

1. **Gate the metric on the code's own flag.** `EnvelopeAxisWeight` must refuse to score a slice
   `not-determined` unless the shipped refusal carries `legallyGrounded: true` **and** a non-null
   `ordinanceRef`. Mechanical, cheap, and it would have caught every mislabel in the audit.
2. **Make certification travel.** Probe A's 18.45 unshippable points are a **per-city signature**
   against a **publisher-generic** provider. If signatures stay city-scoped, the marginal cost of city
   N+1 is not 25 minutes of engineering — **it is one human legal review**, and *that* is the real
   national bottleneck this sprint uncovered. It does not appear in any hour count above, because no
   agent may perform it.

---

## §5 — WHAT I COULD NOT MEASURE (explicit)

- **Tier 1/2/3 populations** — reassigned with Probe C; deliberately **not** estimated (§2.2).
- **Probe B's city-wide refusal rate** — N = 1 parcel. The 0 % envelope is a census; the 100 % refusal
  is not a sample.
- **Whether Lugo's empty in-force layer is a publisher defect or intended** — needs the Concello
  (External authority).
- **Raster→vector cost for Lugo** — deliberately not estimated (the Córdoba D-002 precedent).
- **Probe A: the POUM Normes Urbanístiques text** — a real negative, established across 6
  client/protocol variants. **RPUC's query contract** is `Investigate`, **not** `No`: the API is live
  (GET → 500 NPE = params missing; POST → 405) and 8 parameter names did not reverse it.
- **Whether Probe A's `QUAL_MUNI` parameters are current or a stale vintage** — unverifiable without
  the plan text.
- **Engineer-hours in the human sense.** Every figure here is **agent wall-clock**. It excludes the
  legal review that Probe A proved is on the critical path, and which no agent may perform. **Treat
  24.6 and 27.4 minutes as the ENGINEERING cost only, and the true municipal onboarding cost as that
  plus one human legal signature of unmeasured duration.**
