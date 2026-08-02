# SPAIN — REGIONAL PLANNING-DATA STANDARDS (the acquisition route the probe was not looking for)

**Status**: FOUNDER RESEARCH, captured verbatim 2026-08-02. **Not yet verified by query** — see §5.
**Supersedes in practice**: the "absence" filings for Andalucía, Aragón and Extremadura produced by the Stage-0 municipal sweep.
**Related**: [DATASET-DISCOVERY-PROTOCOL](../../standards/DATASET-DISCOVERY-PROTOCOL.md) · [MACHINE-READABLE-EVIDENCE-REGISTER](../../standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) · [ADR-0290](../../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) · [ADR-0292](../../../02-decisions/adrs/ADR-0292-no-tool-reports-a-result-it-cannot-verify-against-external-ground-truth.md) · `tools/dataset-discovery/reports/probe-c.json`

## 0 · Why this document exists

The Stage-0 sweep measured **0 of 20 sampled municipalities self-hosting an OGC service** and concluded —
correctly — that *the municipality is the wrong unit of analysis*. It then filed three regions as absent or
dead. **Three of those four absence claims are wrong**, and the reason they are wrong is a single structural
fact the tool does not look for:

> ⭐ **Several CCAAs have legislated a REGIONAL PLANNING-DATA STANDARD: municipalities must deliver planning
> instruments to a regional authority in a defined schema, and the authority publishes them.**
> **One adapter · one legal interpretation · N municipalities.**

That is a fundamentally different acquisition route from probing municipal GIS servers, and it is exactly the
shape the measured per-CCAA cost structure predicted (~2.8 min/CCAA discovery vs ~0.6 s/municipality
marginal). **It is also the mechanism that could make a REGIONAL signature defensible rather than merely
convenient** — see the open question in `l449CertificationGates` scope work.

## 1 · Andalucía — the biggest miss (8.5 M people)

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
> standard ten weeks ago.**

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
