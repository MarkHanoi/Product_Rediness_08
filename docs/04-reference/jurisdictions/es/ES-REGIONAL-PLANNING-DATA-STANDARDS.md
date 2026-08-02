# SPAIN — REGIONAL PLANNING-DATA STANDARDS (the acquisition route the probe was not looking for)

**Status**: FOUNDER RESEARCH, captured verbatim 2026-08-02, then **DOWNGRADED BY ITS OWN AUTHOR the same day** — see §0.1 and §5.
**What it establishes**: a reason to **RE-OPEN** three closed files. **NOT** evidence that they open.
⛔ **NOT ONE FEATURE WITH A POPULATED ORDINANCE FIELD WAS RETRIEVED FROM ANY OF THE THREE REGIONS.** Documents were read; services were not reached.
**Related**: [DATASET-DISCOVERY-PROTOCOL](../../standards/DATASET-DISCOVERY-PROTOCOL.md) · [MACHINE-READABLE-EVIDENCE-REGISTER](../../standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) · [ADR-0290](../../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) · [ADR-0292](../../../02-decisions/adrs/ADR-0292-no-tool-reports-a-result-it-cannot-verify-against-external-ground-truth.md) · `tools/dataset-discovery/reports/probe-c.json`

## 0.1 · ⛔ THE AUTHOR'S OWN DOWNGRADE — read before anything below

The founder revised this within hours of producing it, unprompted, citing the week's own failure mode:
*"the failure mode this week has been confident signals that turned out hollow, and I'd rather not be the
sixth."* That is [ADR-0292](../../../02-decisions/adrs/ADR-0292-no-tool-reports-a-result-it-cannot-verify-against-external-ground-truth.md)
applied by a human to their own finding, and it is the reason this section exists rather than a triumphant one.

**PROVED — documents exist:** Andalucía passed an Orden on 18-02-2026 with a downloadable data schema ·
Aragón's NOTEPA defines *edificabilidad* and its índices normatively · Extremadura's directory lists a
*Calificación de suelos (Usos)* layer. **That is the entire proven set.**

**NOT PROVED — and one of these is serious:**
1. ⚠⚠ **Andalucía's mandate is FORWARD-ONLY.** It binds instruments approved **after 24 April 2026** —
   about **fourteen weeks** ago. Across ~785 municipalities, the number of *general* planning instruments
   approved in a fourteen-week window is **plausibly zero to a handful**. **The PIPELINE is mandated; the
   CORPUS today may be empty.** This materially deflates the finding and belongs in the same breath as it.
2. ⚠ **Extremadura's layer is listed as WMS, not WFS. WMS returns PICTURES.** If no WFS sits behind it,
   that is **a raster wall wearing a vector-sounding name — the exact Lugo problem.**
3. ⚠ **Aragón defines the terms without proving publication.** NOTEPA is a **drafting standard for what
   municipalities SUBMIT**. The 2013 vector release described classification and *global* land use — the
   precise basis of the original "clasificación only" filing. **Defining *edificabilidad* in Art. 7 is not
   the same as serving it as an attribute.**
4. ⚠ **The services were never reached.** `icearagon.aragon.es` → **`ROBOTS_DISALLOWED`**, the same wall the
   agents hit as 403s. **Directories and legal texts were read; capabilities were not.**

**THE HONEST VERDICT, verbatim:** *"What I found is **a reason to re-open three closed files, not evidence
that they open.** The prior said 'eight regions cannot do envelopes' on the basis of five guessed URLs and a
schema glance. The new position should be **'three of those eight were never properly tested'** — which is
weaker than unblocked and stronger than where you were this morning."*

## 0.2 · THE THREE TESTS THAT WOULD SETTLE IT — hours, not days

| # | Region | Test | Answer shape |
|---|---|---|---|
| **1** ⭐ | **Aragón** | Download `icearagon.aragon.es/descargas.jsp?coleccion=Urbanismo`, open the attribute table. **Is `edificab` present AND POPULATED WITH VALUES?** | **Binary** |
| 2 | **Extremadura** | `GetCapabilities` on `mapas.ideex.es/CICTEX/urbanismo`. **Is there a WFS at all**, and does `III-04_Calificación de suelos (Usos)` appear in it? | Binary |
| 3 | **Andalucía** | Open `Plantilla_NNDD.zip`, read the schema — **ordinance parameters or only classification?** Then **count instruments actually submitted under it.** | That count **is** the real Andalucía number |

⭐ **Test 1 is the cheapest and the most decisive.** The founder's own stake:
> *"If `edificab` comes back populated, Aragón flips and the pattern is probably real. **If it comes back
> empty, treat my whole finding as unproven.**"*

## 0 · Why this document exists

The Stage-0 sweep measured **0 of 20 sampled municipalities self-hosting an OGC service** and concluded —
correctly — that *the municipality is the wrong unit of analysis*. It then filed three regions as absent or
dead. **Those three filings were never properly TESTED** — they rest on five guessed URLs and a schema glance
— and the reason they are untested rather than merely unlucky is a single structural fact the tool does not
look for (⚠ **untested is not refuted** — §0.1):

> ⭐ **Several CCAAs have legislated a REGIONAL PLANNING-DATA STANDARD: municipalities must deliver planning
> instruments to a regional authority in a defined schema, and the authority publishes them.**
> **One adapter · one legal interpretation · N municipalities.**

That is a fundamentally different acquisition route from probing municipal GIS servers, and it is exactly the
shape the measured per-CCAA cost structure predicted (~2.8 min/CCAA discovery vs ~0.6 s/municipality
marginal). **It is also the mechanism that could make a REGIONAL signature defensible rather than merely
convenient** — see the open question in `l449CertificationGates` scope work.

## 1 · Andalucía — the largest population, and the weakest corpus claim (8.5 M people)

The probe searched **DERA** and **ideandalucia**. The planning system is neither.

- **SITUA** — *Sistema de Información Territorial y Urbanística de Andalucía*, established under **Art. 11 of
  Ley 7/2021 (LISTA)**, intended to reinforce **legal certainty in the determinations of urban plans** by
  ensuring their dissemination, interoperability and reusability.
- **VITUA** — its public viewer.
- ⭐ **Orden de 18 de febrero de 2026** approving the *Normas Directoras* for electronic documentation of
  Andalucía's urban planning instruments, published alongside a downloadable **normalised data schema**:
  *«Archivo normalizado de la especificación del esquema de datos de los instrumentos de ordenación
  urbanística»* — **`2026.02.18_Plantilla_NNDD.zip`**.
- ⚠ **It is MANDATORY.** For instruments approved after the Normas Directoras took effect on **24 April
  2026**, the viewer is the dissemination channel for the instrument's spatial data, and **submission is
  obligatory under determination 5**.

> **Andalucía is not "no calificación WFS". It is a region that legislated a compulsory planning-data
> standard.**
>
> ⚠⚠ **AND THE MANDATE IS FORWARD-ONLY.** It binds instruments approved **after 24 April 2026**. The
> *pipeline* is mandated; **the corpus today may be EMPTY.** The number that matters is not the schema's
> existence but **how many instruments have actually been submitted under it** — see §0.2 test 3.

**Next action:** download `2026.02.18_Plantilla_NNDD.zip`. **The schema states directly whether ordinance
parameters are in scope** — which is the Tier-1 gate, not the existence of a service.

## 2 · Aragón — the schema fields are NORMATIVELY defined

The sweep saw `edificab` / `aprove` / `densidad` and did not verify them. **They are not incidental columns.**

- **NOTEPA** — *Decreto 78/2017*, standardising planning cartography, terminology and general urbanistic
  concepts **to reduce discretion in interpretation** and to facilitate integration into **IDEARAGON** and
  **SIUa**.
- ⭐ **NOTEPA Art. 7 defines *edificabilidad* as maximum buildable area**, plus **Índice de Edificabilidad
  Bruta and Neta** in m² of floor per m² of land.
- **SIUa** publishes *fichas de datos urbanísticos generales* — parcel/area detail **including urbanistic and
  building parameters**. Urban layers last updated **November 2025**.
- **Vector download**: `icearagon.aragon.es/descargas.jsp?coleccion=Urbanismo`

⚠ **CAVEAT, and it keeps the question live rather than settled:** an older announcement describes the vector
coverage as **classification and *global* land-use geometries** — which is what the "clasificación only"
filing was based on. **One query against that download resolves it.**

## 3 · Extremadura — not dead, wrong host

- The sweep guessed **`geoportal.ideex.es`**. ⛔ **Spain's national IDE service monitor lists the live
  endpoint as `https://mapas.ideex.es/CICTEX/urbanismo`.**
- IDEEX's own directory lists a *urbanismo* service carrying `III-04_Categorías de suelos`,
  ⭐ **`III-04_Calificación de suelos (Usos)`**, `III-04_Unidades de actuación`, `III-04_Clases de suelo`.
- ⚠⚠ **THE LISTING IS WMS, NOT WFS. WMS RETURNS PICTURES.** If no WFS sits behind it, this is a **raster
  wall wearing a vector-sounding name — the Lugo problem exactly.** §0.2 test 2 settles it.

⚠ ***Calificación*, not merely *clasificación*** — and that distinction is the Tier-1 gate this corpus
already identified: an ordinance code is a regime selector *with* an envelope hook; a land class is only a
regime selector.

## 4 · THE PATTERN — and the change of search target

Three regions have, or have just legislated, a regional planning-data standard: **NOTEPA** (Aragón),
**Normas Directoras** (Andalucía), and **Catalunya's Refós**, already in the corpus.

> ⛔ **THE SEARCH TARGET CHANGES.** Not *"does this region publish a WFS"* but:
>
> **"Does this region have a Norma Técnica mandating planning-data delivery, and what schema does it
> specify?"**
>
> **That is a legal-register search, not a service probe — and the discovery tool does not look for it.**

A systematic version — **all seventeen CCAAs**, each checked for a planning-data norm, its **schema**, its
**enforcement date** and its **publication endpoint** — would **replace the current map wholesale**.

## 5 · What this document does NOT establish

⚠ Recorded explicitly, per ADR-0292 (*no tool may report a result it cannot verify against ground truth it
did not produce*) — these are the limits the founder stated, carried verbatim:

1. **Nothing here confirms fields are POPULATED.** It confirms they are **specified and mandated.** That
   still needs a query.
2. **`icearagon.aragon.es` returned `ROBOTS_DISALLOWED`** — the same wall the agents hit as 403s — so
   **SIUa's `GetCapabilities` was not read.** Under the negative-proof conditions that is `UNKNOWN`, never
   absence.
3. The three regions' filings are **superseded, not closed**: the original premise (*"no regional planning
   service"*) was false, which is institutional learning and must be recorded as such.
4. A single-source survey of seventeen CCAAs is not this document. **This is four data points and a
   pattern.**
