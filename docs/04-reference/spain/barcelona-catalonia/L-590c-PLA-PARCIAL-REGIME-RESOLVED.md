# L-590c — The Pla Parcial regime question, RESOLVED against the live AMB service

**2026-07-22.** The Art. 350.1-vs-350.2 question that blocked clau 22a — **17.5% of Barcelona's
private buildable land** — is **answered**. The answer is the opposite of what we were about to
assume, and it **retires option A permanently**.

> ## ⚠ HEADLINE
>
> **Barcelona's clau-22a industrial land IS covered by a definitively approved *Pla Parcial*.**
> Therefore **PGM Art. 350.1 governs it, not Art. 350.2.**
>
> ⇒ **Option A — "assume no Pla Parcial by default" — would have been WRONG on the land we
> measured, 8 samples out of 8.** The founder's decision on 2026-07-22 to *hold* A was correct,
> and it is now correct **on evidence** rather than on caution.
>
> ⇒ **22a will NOT yield ~15 end-to-end points.** Under Art. 350.1 the PGM states **only** the FAR
> and the occupation. That is exactly **Track C**, already in flight. **Track C is not a stopgap —
> it is the complete and correct answer for 22a.**
>
> ⇒ **The projected 62.2% is withdrawn.** See §6.

---

## 1 — How this was obtained (and why the previous attempt failed)

Two external research passes narrowed the question correctly but could not close it. The second
concluded its fetch tool *"cannot execute this specific operation"* against the `/query` endpoint.

**That diagnosis was wrong, and the reason matters.** The AMB service had **moved**:

| Host / path | Result |
|---|---|
| `geoportal.amb.cat/arcgis/rest/services` | **301** → *"Servidor no disponible"* notice |
| `ide.amb.cat/arcgis/rest/services` | **301** → same notice |
| `geoportalcartografia.amb.cat/arcgis/rest/...` | **301** → same notice |
| ✅ **`geoportal.amb.cat/geoserveis/rest/services`** | **200, ArcGIS 11.5, 16 folders, 154 services** |

The path segment is **`/geoserveis/`**, not `/arcgis/`. Every `/query` attempt against the old path
was being redirected into an HTML notice page — which is exactly what "silently rewritten to a
generic documentation page" looks like from the client side.

⚠ **The lesson is the §CONTEXT-DATA-HONESTY lesson again, one level up:** *an endpoint that 301s to
a human-readable notice returns HTTP 200 with a body, so a naive client cannot distinguish
"redirected" from "answered".* Four identical dead ends were read as a capability limit when they
were a **redirect**. Always assert on the *content type and shape* of a response, never on the fact
that one arrived.

**All queries below were executed live from the PRYZM dev environment on 2026-07-22 and are
reproducible.** Base URL for everything that follows:

```
https://geoportal.amb.cat/geoserveis/rest/services
```

---

## 2 — The services that matter

| Service | Layer | What it is |
|---|---|---|
| `qualificacio_refos` | **16 · `QU_Trames`** | The qualification (clau) polygons — what we already consume conceptually via the MUC |
| `expedients_refos` | **1 · `Expedients_Etiquetes`** | ⭐ **The planning-instrument register, with approval dates** |
| `sectors_refos` | 9 · `SECT_Trames` | Sector polygons with buildability parameters (see §5 — unverified for Barcelona) |
| `pla_general_metropolita_refos_1987` | — | The PGM refós itself |

### 2.1 — `QU_Trames` field schema (verified, layer 16)

```
SIGLES · OBJECTID · SHAPE · CLAU_URB · PLAN · EQUI_PGM · SINTETIC · DGU · DESCRIP
NORMATIV · INE_URB · COLOR · CODI_INE · JERARQ_V · CODI_SECT · TIPUS_SECT · US_SECT
GRAU_DES · CS · NOMMUNI · PGM · SHAPE_Length · SHAPE_Area
```

⚠ **`GRAU_DES` exists but is `null` on 100% of Barcelona clau-22a features.** The external analysis
had identified it as *"the single highest-value missing information"*. **It is empty here and does
not encode approval status.** Recorded so nobody re-opens that line of enquiry.

⚠ The external analysis also named `REGIM`, `EXP_PD` and `CLAU_PD` as fields of interest. **None of
those three appear in this layer's published schema.** They may exist in a municipal (Barcelona
Ajuntament) service rather than the metropolitan one; **not verified either way** — do not treat
their absence here as proof of absence elsewhere.

---

## 3 — MEASURED: the `PLAN` field is the instrument discriminator

`PLAN` distinguishes **`PG`** (governed by the general plan) from **`PD`** (governed by *planejament
derivat*). The `*` suffix is AMB's documented **assimilation** convention, the same one that makes
bare `20a` an editorial artefact rather than a zoning outcome.

### 3.1 — Whole of Barcelona (`CODI_INE = '08019'`), by area

| `PLAN` | features | area | share |
|---|---:|---:|---:|
| **`PD*`** — derived planning | 9,390 | 63,950,346 m² | **62.8%** |
| **`PG`** — general plan | 3,337 | 37,831,377 m² | **37.2%** |

> ⭐ **Nearly two-thirds of Barcelona is governed by derived planning, not by the PGM directly.**
> This is a structural fact about the city and it was not in our model.

### 3.2 — Clau 22a only

| `CLAU_URB` | `PLAN` | `GRAU_DES` | features | area | share |
|---|---|---|---:|---:|---:|
| `22a` | **`PD*`** | `null` | 79 | 4,907,691 m² | **98.9%** |
| `22a` | `PG` | `null` | 2 | 53,666 m² | 1.1% |
| | | | **81** | **4,961,358 m²** | |

Descriptive attributes on 22a: `DESCRIP='Industrial'`, `SINTETIC='A1'`, `DGU='7'`,
`NORMATIV='Barcelona'`, `PGM='S'`, `EQUI_PGM` ∈ {`'22a*'`, `'22a'`}.

---

## 4 — MEASURED: the instrument register, and the decisive test

### 4.1 — `Expedients_Etiquetes` carries the exact legal predicate Art. 350.1 names

```
CMB · LLETRA · CODIS_INE · TIPUSASS · NOMEXP · VIGENT · TANCAMENT_IN
DAPRDEF · DASSAB · DPUBLIC · DHISTORIC · MHISTORIC · EXP_DEROG · TANCAMENT_OUT
OBSERVACIONS · RECURS_O_SENTENCIA · DGU · CODI_INE · NOMMUNI · ANY_PUBLIC · URL · TIPUS_AMB
```

- **`DAPRDEF` = *data d'aprovació definitiva*** — the definitive-approval date. Art. 350.1 turns on
  *"Pla Parcial **definitivament aprovat**"*. **This field IS that predicate.** Populated on every
  record sampled.
- **`VIGENT`** — in force (`V`) or in force/amended (`V/A`).
- **`TIPUSASS`** — the instrument type code.
- **`URL`** — a link to the instrument document.

**2,595 expedients are registered for Barcelona, all `VIGENT`.**

### 4.2 — `TIPUSASS` decoded from `NOMEXP`, one live sample per code

| code | instrument | n | sample `DAPRDEF` | sample name |
|---|---|---:|---|---|
| `022` | **PERI** — Pla Especial de Reforma Interior | 753 | 1981-10-29 | *PERI del sector limitado por las calles Méjico, San Fructuoso…* |
| `271` | **PEU** — Pla Especial Urbanístic | 408 | 2007-02-02 | *PEU d'ordenació i definició d'usos del subsòl a la plaça…* |
| `281` | **PMU** — Pla de Millora Urbana | 403 | 2011-03-25 | *PMU del Sector 3 de la MPGM a l'àmbit de la Marina de la Zona Franca* |
| `025` | **PE** — Pla Especial | 609 | 1986-02-27 | *PE de ordenación volumétrica … Hospital de la Cru…* |
| `003` | **MPGM** — Modificació del PGM | 281 | 1981-11-03 | *MPGM de Barcelona de la manzana limitada por … Palencia, Bofarull…* |
| `272` | **MPPEU** — Modificació de PEU | 48 | 2008-11-28 | *MPPEU de l'edifici industrial consolidat al carrer d'Àlaba 94-96…* |
| **`251`** | ⭐ **PP — PLA PARCIAL** | **38** | **1956-12-07** | *PP de ordenación del sector final de la Avenida del Generalísimo Franco…* |
| `252` | Estudi (de detall / modificació) | 22 | 1958-07-29 | *Estudi de modificació de l'urbanització rasants…* |
| `282` | MPMU — Modificació de PMU | 32 | 2014-01-31 | *MPMU del subsector 6 del PERI Perú-Pere IV…* |

⚠ **The decode is inferred from the instrument names, not from a published domain table.** The
mapping is unambiguous for every code sampled (each `NOMEXP` opens with its own acronym), but it is
**an inference from data, not a documented code list.** Treat `251 = Pla Parcial` as **high
confidence, not certified**, and re-verify before it gates anything legally consequential.

### 4.3 — 🔴 THE DECISIVE TEST — point-in-polygon, 22a against the register

Eight clau-22a polygons in Barcelona, centroid computed from the returned ring, each queried
against `Expedients_Etiquetes` with `spatialRel=esriSpatialRelIntersects` in **EPSG:25831**:

| 22a centroid (ETRS89 / UTM31N) | instruments covering it |
|---|---|
| 425809, 4576605 | `022, 025, **251**, 272` |
| 425665, 4576494 | `022, 025, **251**, 272` |
| 428427, 4577349 | `022, 025, **251**, 272` |
| 428342, 4577133 | `022, 025, **251**, 272` |
| 428280, 4577385 | `022, 025, **251**, 272` |
| 425334, 4576201 | `022, 025, **251**, 272` |
| 428205, 4577242 | `022, 025, **251**, 272` |
| 425734, 4576626 | `022, 025, **251**, 272` |

**`251` (Pla Parcial) present on 8 of 8.** The covering instrument is named:

> ***"PP de ordenación del Polígono industrial del Consorcio…"***

— the Zona Franca / Consorci industrial estate **Pla Parcial**.

### 4.4 — What this means, stated carefully

**Art. 350.1 applies to Barcelona's 22a land.** The PGM therefore states only two things about it:
a FAR of 2 m² sostre/m² sòl and 90% occupation (`350.1.1r`, for *segons alineacions de vial* land).
**Height, storeys and the concentric band come from the Pla Parcial itself** — a document we do not
hold.

⚠ **Scope of the claim, honestly bounded:**
- **8 samples, not 81.** They cluster in the Zona Franca / Consorci estate — Barcelona's dominant
  industrial area, which is *why* it is dominant in the sample, but a full 81-polygon sweep has
  **not** been run. **Do not state "100% of 22a" — state "8 of 8 sampled, all in the Consorci estate".**
- The 1.1% of 22a with `PLAN='PG'` (2 features, 53,666 m²) was **not** individually tested and may
  genuinely lack a Pla Parcial — i.e. Art. 350.2 may govern *that* sliver.
- `251 = Pla Parcial` is inferred (§4.2).

---

## 5 — ⭐ The much larger prize this uncovered — and its unverified status

`sectors_refos` layer 9 (`SECT_Trames`) publishes a field set that is **derived-plan buildability
parameters as structured data**:

```
IE_BR (índex d'edificabilitat bruta) · DENS · N_H · N_HP · N_HP_RG/RE/RC/RCC
ST_TOTAL · ST_HD · ST_TER · ST_IND · ST_R_TOTAL · SUP_NORM · SUP_RES · SUP_TER
SUP_IND · SUP_VIARI · SUP_ZV · SUP_EQ · SUP_HD · CLAS_SOL · PENDENT · TIPUS_SECT · US
```

**If this were populated for Barcelona it would be a candidate answer to the clau-18 problem**
(22.5% of private buildable land), which every analysis so far concluded was a document-reading task
with no structured source.

### 5.1 — ⚠ RESOLVED SAME DAY: the first query was FAILING, not empty

My first attempt filtered on `CODI_INE='08019'` and got **zero records**, with `returnCountOnly`
returning `None` instead of a number. I recorded it as *unverified, not absent* — and that caution
was correct, because **the query was being rejected, not evaluated.**

This layer exposes **`CODIS_INE` (plural)**, not `CODI_INE`. Re-run:

| query | result |
|---|---:|
| `1=1` (unfiltered sanity check — run this FIRST, always) | **505** |
| `CODIS_INE LIKE '%08019%'` | **76** |
| `NOMMUNI LIKE '%arcelona%'` | **76** (agrees — two independent filters, same answer) |

> ⚠⚠ **This is §CONTEXT-DATA-HONESTY caught live, twice in one investigation.** A rejected
> where-clause and an empty result set are the same VALUE. Had I not run the unfiltered count, this
> document would have published *"Barcelona has no sector parameters"* — a confident, false,
> load-bearing negative. **Always prove the layer answers at all before believing a filtered zero.**

### 5.2 — MEASURED: derived-plan buildability parameters ARE published for Barcelona

**76 Barcelona sectors, with real values:**

| `IE_BR` | `N_H` | `ST_TOTAL` | `CLAS_SOL` | `NOM_SECT` |
|---:|---:|---:|---|---|
| 3.2 | 238 | 53,306 | SUNC | PMU-10 Pere IV – Selva de Mar – Veneçuela |
| 3.2 | 44 | 9,725 | SUNC | PMU-11 Treball – Pallars – Selva de Mar |
| 3.2 | 94 | 20,902 | SUNC | PMU-3 Almogàvers – Àlaba – Sancho d'Àvila |
| 3.2 | 73 | 16,256 | SUNC | PMU-5 Doctor Trueta – Àlaba – Ramón Turró |
| 3.2 | 76 | 17,091 | SUNC | PMU-6 Bilbao – Bolívia – Castella |

`IE_BR` = *índex d'edificabilitat bruta*, `ST_TOTAL` = *sostre total* (total floor area),
`N_H` = dwelling count, `CLAS_SOL=SUNC` = *sòl urbà no consolidat*.

**These are the derived plan's own parameters, published as structured data.** The sample is
Poblenou PMU sectors — the 22@ transformation area.

### 5.3 — What this does and does NOT establish

✅ **Establishes:** derived-plan envelope parameters exist in machine-readable form for Barcelona,
with a sector name, a soil classification, a gross buildability index and a total floor area.
**No analysis to date predicted this** — every prior pass concluded it was a document-reading task.

❌ **Does NOT establish** that this solves clau 18. **76 sectors is a small number** against 2,595
registered expedients, and I have **not** measured what share of clau-18 land these 76 polygons
cover, nor whether `IE_BR` is the parameter clau 18's envelope actually needs. **The `DENS` column
is null on every row sampled.**

⇒ **The next measurement — and it is now the highest-value open item in Barcelona — is: intersect
the 76 sector polygons with clau-18 land and report the covered share by area.** If it is high,
clau 18 partially opens. If it is low, this is a Poblenou-specific dataset and clau 18 stands.
**Do not assume either.**

---

## 6 — What this does to the end-to-end number

**The 62.2% projection is withdrawn.** It assumed 22a's 17.5% would resolve through Art. 350.2.
It will not.

| | end-to-end | basis |
|---|---:|---|
| today | **46.9%** | measured |
| + Track C (22a regime-neutral half) | **46.9%** | ⚠ **no change to the RESOLUTION rate.** A FAR + occupation pair is a partial answer, not a full envelope. It moves 22a out of the *owned gap* bucket and into *answered-but-partial* — a real quality gain, worth ~4.7% of all clicks, and **zero** points on this metric |
| + bare-20a subzones | ~48.4% | ~+1.5, sourcing-gated, and §Q2 says refusing is correct — so this may not be recoverable either |
| **realistic ceiling on the PGM alone** | **~48%** | not ~65% |

**The ~65% ceiling I previously stated was wrong**, because it assumed 22a resolves. It does not.
**Together, clau 18 (22.5%) and clau 22a (17.5%) are 40% of Barcelona's private buildable land whose
envelope is set by an instrument we do not hold.** That is not a coverage failure — it is a fact
about how Barcelona is planned, and §3.1 measured it directly: **62.8% of the city is governed by
derived planning.**

⇒ **The path past ~48% is not more PGM work. It is acquiring derived-plan parameters** — which is
exactly what §5 might make tractable, and exactly why §5 must be resolved before any further
Barcelona rule work is scheduled.

---

## 7 — Consequences for the architecture (the durable finding)

The external analysis's structural conclusion is **confirmed by measurement**, and it is worth more
than the 22a answer:

> **The GIS is not the law. It is an editorial projection of the law.**

Our engine models `parcel → clau → article → algorithm`. The data says the honest chain is:

```
parcel → governing INSTRUMENT (PG or PD, and which one)
       → that instrument's classification
       → PGM assimilation (the *-suffixed clau) if needed
       → applicable article
       → algorithm
```

**The `*` suffix on `PD*`, `22a*` and bare `20a` is the assimilation marker, and it is telling us
every time that the clau we read is a translation, not the governing text.** We have been consuming
the translation and citing it as the original.

⚠ **This generalises to every city we will ever add**, and it is the reason a second jurisdiction
should be chosen partly on *how much of it is governed directly by its general plan*. Barcelona is
a hard case at 37.2%.

**This should become an ADR.** It changes what a rule pack is: not "the ordinance for a clau", but
"the ordinance for a clau **under a stated instrument regime**".

---

## 8 — Reproduce it

```bash
BASE="https://geoportal.amb.cat/geoserveis/rest/services"

# clau 22a distribution by governing instrument
curl -s -G "$BASE/qualificacio_refos/MapServer/16/query" \
  --data-urlencode "where=CODI_INE='08019' AND CLAU_URB LIKE '22a%'" \
  --data-urlencode "groupByFieldsForStatistics=CLAU_URB,PLAN,GRAU_DES" \
  --data-urlencode 'outStatistics=[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"N"},{"statisticType":"sum","onStatisticField":"SHAPE_Area","outStatisticFieldName":"AREA"}]' \
  --data-urlencode "returnGeometry=false" --data-urlencode "f=json"

# the planning-instrument register, with definitive-approval dates
curl -s -G "$BASE/expedients_refos/MapServer/1/query" \
  --data-urlencode "where=CODI_INE='08019' AND TIPUSASS='251'" \
  --data-urlencode "outFields=TIPUSASS,NOMEXP,DAPRDEF,VIGENT,URL" \
  --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
```

The point-in-polygon test of §4.3 uses `geometryType=esriGeometryPoint`, `inSR=25831`,
`spatialRel=esriSpatialRelIntersects`. ⚠ Build the request with a proper URL encoder — shell
quoting mangles the JSON `geometry` parameter and yields an empty body, which reads exactly like a
blocked request.

---

## 9 — Open, and deliberately not closed here

1. 🔴 **§5 — retry `SECT_Trames` against `CODIS_INE`, unfiltered count first.** Highest value item
   in this document. It may or may not be the clau-18 answer; right now we do not know which.
2. **Sweep all 81 clau-22a polygons**, not 8, and report the instrument mix by area.
3. **Verify `TIPUSASS` against a published domain table** rather than the name inference of §4.2.
4. **Test the 2 `PLAN='PG'` 22a features** — Art. 350.2 may genuinely govern those.
5. **Look for `REGIM` / `EXP_PD` / `CLAU_PD`** in the Ajuntament's own service; absent from the
   metropolitan schema, presence elsewhere unverified.
6. **Write the ADR** for §7.

---

**Related:** `BARCELONA-REASONING-RECORD.md` · `L-590-NNUU-PRIMARY-SOURCE-RECOVERED.md` ·
`ADR-0273-tiered-occupation-envelopes.md` · C58 §1.4 / KG-6 · `PROBE-DISCIPLINE.md`

---
---

# 10 — ✅ EXTERNAL VALIDATION (2026-07-22) — both questions answered, both readings CONFIRMED

The founder put §4 and §7 to two independent expert reviews. **Both confirmed the reading. One
raised a gap that turns out to be already closed. One added a genuine new requirement.**

## 10.1 — Art. 350 reading: CONFIRMED, word for word

> *"Confirmed, word for word, against the AMB's published text of Art. 350.1. For 22a land with a
> definitively approved Pla Parcial, the article sets exactly two ceilings and nothing else."*

| | confirmed |
|---|---|
| Art. 350.1 applies on the **legal condition** *"compti amb Pla Parcial definitivament aprovat"* | ✅ |
| Art. 350.2 is the **alternative regime**, *"mancada de Pla Parcial"* | ✅ |
| Under 350.1 the PGM states **only** FAR ≤ 2 and an occupation cap | ✅ |
| Occupation is **90% for *alineacions de vial*, 70% for *edificació aïllada***, per sector type **inside** the Pla Parcial — **not one flat number for the zone** | ✅ **a flat 90% over-states by exactly 20 points** |
| **No height table and no band exist in 350.1 at all** — both come from the plan's own plànols and ordenances | ✅ |
| 350.2 by contrast **does** carry its own height table, the 70%-of-block band, a 90% façade rule and a minimum parcel (300 m², ≥10 m frontage) | ✅ |

> ⚠ **The delegation must be modelled, not collapsed.** One reviewer put it precisely: Art. 350.1
> does **not** say *ignore the Pla Parcial*. The correct chain is
> `Art. 350.1 → look up the governing Pla Parcial → read its volumetric parameters there`,
> **not** `Art. 350.1 → answer a complete envelope`. **PRYZM must never publish a 350.1 envelope as
> complete.** Our `regime-undetermined` refusal (ADR-0276) is the right shape; what it refuses on
> must be *"the plan's parameters, which we do not hold"*, not *"the regime, which we cannot tell"* —
> we now CAN tell the regime.

## 10.2 — ⚠ The flagged gap is ALREADY CLOSED

One reviewer's single caveat:

> *"I found this text on the AMB's normativa pages, which is a manually retyped consolidation, not a
> scan of the original 1988 Text Refós… worth a spot-check against the actual Text Refós PDF before
> your software cites it as authoritative."*

**That spot-check has already been performed.** `PGM-NNUU-metropolitana.pdf` — the primary MMAMB
volume — is **committed in this repository**, and Art. 350 was re-extracted **glyph-by-glyph from
p. 116 and reassembled in reading order** during the L-590b/Track-C pass. That extraction is
precisely what produced the 90%/70% distinction the reviewer independently confirmed, **and it
corrected our own earlier claim that the occupation was unconditional.**

⇒ **Two independent readings of the primary text, arrived at separately, agree.** This passage is
now `VERIFIED-PRIMARY`, not `VERIFIED-SECONDARY`.

⚠ Standing caveat unchanged: our PDF is the MMAMB **re-edition** of the 1988 Text Refós, with
documented transcription errors elsewhere in the volume (Arts. 251.3a, 330, 331). It is a primary
source and far better than a municipal mirror, but **a re-typeset primary source is not an
authenticated one** — which is why nothing here is `certified`.

## 10.3 — Citation architecture: CONFIRMED, and it is now the rule

Both reviewers endorsed the split, and one framed it as three distinct questions that **must not be
collapsed**:

```
WHICH instrument governs?      → factual   → Municipal WMS (index)
WHAT does it legally provide?  → legal     → RPUC / the approved instrument (AUTHORITY)
HOW is it applied?             → engine    → PGM, residual provisions only
```

- **Municipal WMS** — *"informatiu, no normatiu"* is **standard boilerplate on essentially every
  Spanish municipal planning portal**, existing to shield the administration from someone treating
  the portal as a legal document. **It is not a signal that the index data is unreliable.** Using it
  to identify *which* instrument governs is *"entirely consistent with its stated purpose"*.
  ⇒ **Trustworthy as an index. Never as a source of parameters.**
- **AMB refós** — keep for navigation, article numbering and consolidated reading. **Never cite it as
  the authority for a specific plan's parameters.**
- **RPUC** — the Generalitat's **statutory** register (Decret 305/2006), designated to guarantee
  public access to instruments in force. *"Not a summary of one."* **This is what we cite.**
  For a 1968 instrument, failing RPUC, the original BOPB/DOGC publication of the era.
- **Nothing more authoritative exists** than the approved instrument itself; the RPUC is the channel.

## 10.4 — 🔴 NEW REQUIREMENT: the annulment / supersession check

The one real failure mode either reviewer identified, and it is not covered by anything we have
built:

> *"Municipal GIS layers lag behind the legal record when a plan is modified, annulled by a court
> judgment, or superseded… treat the WMS's index as reliable enough to select which document to
> fetch, but always confirm, from the fetched instrument itself, that no later modification or
> annulment is recorded against it in RPUC before finalizing the citation."*

⇒ **A design rule, to be written into C58:**

> **An instrument identified by a municipal index MUST NOT be cited until it has been confirmed
> against the statutory register that no later modification, supersession or judicial annulment is
> recorded against it. A stale index is a data-maintenance failure, not a legal-reasoning failure —
> but publishing from one would be OUR failure.**

⚠ Note the AMB expedients register already carries the fields this needs: **`EXP_DEROG`**
(derogating expedient), **`VIGENT`**, **`RECURS_O_SENTENCIA`** (appeal or judgment),
**`TANCAMENT_OUT`**. **The check may be largely runnable against data we have already reached** —
that is a measurement, not an assumption, and it has not been run.

## 10.5 — Expected, not verified: the form of the instruments

> *"For a 1968 instrument, the overwhelmingly likely form in the RPUC is a scanned document
> (image-based or OCR'd PDF), not structured text or data fields… treat this as expected, not
> verified — worth one direct check before your pipeline assumes it needs an OCR/PDF-extraction step
> versus a clean text pull."*

⇒ **This is the single cheapest measurement with the largest roadmap consequence.** It decides
whether the 40% of Barcelona governed by derived planning is a *data* problem or a *document*
problem. **Open — §9 item 1 now has a sibling.**

## 10.6 — What this changes

| | before | after |
|---|---|---|
| Art. 350 reading | ours alone | ✅ **confirmed by two independent reviews + our own primary extraction** |
| Occupation 90% | believed unconditional | ✅ **conditional; flat 90% over-states by 20 pp** |
| Height under 350.1 | assumed from Art. 350.2.c | ✅ **comes from the Pla Parcial; the PGM states none** |
| What to cite | open question | ✅ **WMS indexes · RPUC authorises · PGM applies the residue** |
| Annulment risk | **not considered** | 🔴 **new mandatory check (§10.4)** |

---
---

# 11 — 🔴 THE 80% MEASUREMENT — RUN, and the answer is NO (structured path refuted)

**2026-07-22, live against the AMB service.** The claim under test: *"the 40% of Barcelona governed
by derived planning becomes reachable because the city publishes the plans' parameters as data."*
**Measured. It does not hold. Here are the numbers that refute it.**

## 11.1 — The denominator

| | area |
|---|---|
| Barcelona qualification polygons, total | **101.8 M m²** (89 clau values) |
| Governed by **derived planning** (`PLAN='PD*'`) | **62.8%** ≈ 63.9 M m² |
| Governed by the **general plan** (`PLAN='PG'`) | 37.2% |

## 11.2 — 🔴 The refutation: structured parameters cover ~2% of the derived-planning land, not most of it

`sectors_refos/9` is the ONLY AMB layer carrying buildability parameters (`IE_BR`, `ST_TOTAL`,
`N_H`, `US`). For Barcelona:

| | value |
|---|---|
| Parameterised sectors | **76** |
| Their total area | **1.20 M m²** |
| As a share of ALL Barcelona | **1.2%** |
| **As a share of the derived-planning land we hoped to unlock** | **~1.9%** |
| `IE_BR` populated | **33 / 76** |
| `ST_TOTAL` populated | 63 / 76 |
| `N_H` populated | 35 / 76 |

And they are not the historical instruments at all — by use they are **52 residential (`R`) + 20
residential-tertiary (`RT`) + 4 tertiary**, i.e. **recent PMU transformation sectors (the Poblenou
22@ regeneration)**, not the 2,595 plans going back to 1956.

⇒ **The structured-parameter dataset unlocks ~2% of the blocked land, not ~40%.** The 80% figure
assumed the 18.30 m / 24.40 m heights we saw were representative of a broad structured dataset.
**They were a free-text note on one qualification polygon, not rows in a parameters table.**

## 11.3 — Where the other ~98% of the parameters actually live

The **2,595-instrument register** (`expedients_refos/1`) carries, per instrument:
`TIPUSASS` (type) · `NOMEXP` (name) · `DAPRDEF` (approval date) · `VIGENT` · **`URL`** — **identity,
not parameters.** Every `URL` points at a per-plan *fitxa* page, e.g.:

```
https://ajuntament.barcelona.cat/informaciourbanistica/cerca/ca/fitxa/LC084/--/--/ap/
```

That page is an **AngularJS SPA** (`ng-app`) — a client-rendered shell whose document list loads
from a backend the static HTML does not contain. **The plan's actual parameters are behind that
backend, or inside the linked documents, which for a 1956–1968 instrument are scans.** This is the
`w133.bcn.cat` / U-Maps soft-shell pattern again, and it is the **document-reading problem the 80%
hope was supposed to have eliminated. It is not eliminated.**

⚠ ⚠ **§CONTEXT-DATA-HONESTY, applied to my own earlier optimism:** I let one vivid data point
(*"real heights, 18.30 m / 24.40 m"*) stand in for a distribution I had not measured. **When I
measured the distribution, the structured data covered 2%, not 80%.** The lesson is the same one
this whole file keeps teaching: **an example is not a rate. Measure the rate before you promise the
outcome.**

## 11.4 — What IS reachable, and it is genuinely worth having

The refutation is of the *parameters* claim, not of everything. Fully reachable, measured, for
essentially all derived-planning land:

- **WHICH instrument governs** the parcel (spatial join, demonstrated 8/8 for 22a)
- **its approval date** (`DAPRDEF`), **type** (`TIPUSASS`), **whether it is in force** (`VIGENT`)
- **a link to it** (`URL`)

⇒ **That turns a blank refusal into a cited, navigable answer:** *"This parcel is governed by the
Pla Parcial of the Zona Franca industrial estate, definitively approved 16/02/1968 — here it is,"*
instead of *"zone rules coming."* **That is a real product improvement and a real honesty win.** It
does **not** move the end-to-end RESOLUTION rate, because a full envelope needs the numbers, and the
numbers are behind the document.

## 11.5 — Verdict on the ceiling

| path | ceiling | status |
|---|---|---|
| PGM rulebook alone | **~48%** | mined out |
| + AMB structured sector parameters | **~50%** | ⚠ only +~2%; refuted as the 80% path |
| + reading the 2,595 instrument documents | up to ~80% **in principle** | **a document-extraction project, not a data pull** — years, or an OCR/LLM pipeline, exactly what we hoped to avoid |
| + the "answered by pointing at the governing plan" tier | doesn't move resolution, **materially improves the product** | ✅ **reachable now, cheap** |

**Barcelona's real full-envelope ceiling is ~48–50% until someone extracts derived-plan documents.**
The 80% is reachable but **only through the document work**, and this measurement is what tells us
that honestly rather than after a quarter of building against a false premise.

## 11.6 — The generalisation still stands, and it is the strategic takeaway

Every Spanish city has this same three-tier structure (general plan → derived plans → the register
that indexes them). So the **"point at the governing instrument"** tier — identity, date, in-force,
link — **generalises for free to every Spanish city**, because it rides on the same registry
pattern. **That, not the 80%, is the portable win from today.** The full-parameter extraction is a
separate, expensive programme that must be justified on its own, per city.

## 11.7 — Reproduce

```bash
BASE="https://geoportal.amb.cat/geoserveis/rest/services"
# parameterised-sector coverage (the 80% test)
curl -s -G "$BASE/sectors_refos/MapServer/9/query" \
  --data-urlencode "where=CODIS_INE LIKE '%08019%'" \
  --data-urlencode 'outStatistics=[{"statisticType":"sum","onStatisticField":"SHAPE_Area","outStatisticFieldName":"A"},{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"N"}]' \
  --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
# ⚠ filter on CODIS_INE (plural). CODI_INE is rejected and returns a false zero — §5.1.
```
