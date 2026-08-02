# ILLES BALEARS (MUIB) — ASSESSMENT

**Status**: **QUEUED. UNMEASURED.** Three queries defined (Q1–Q3), **none run.** Rated **L2–3**.
**Scored under**: [R/P REGIONAL SCORING](../../../standards/R-P-REGIONAL-SCORING.md) —
**`R` CLAIMED PUBLISHED (unverified) · `P` UNKNOWN.**
**Related**: [REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md) ·
[ADR-0293](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

> ⛔ **DO NOT WRITE "BALEARS IS ENVELOPE-CAPABLE." FOUR EXTERNAL RESEARCH PASSES CONVERGED ON THAT
> PHRASING AND NONE OF THEM RAN A QUERY.** `R` is **claimed by the publisher** and **unverified by
> us.** *Convergence is not corroboration when every pass read the same documentation.*

---

## ✅ MEASURED

- **`CODIAJ`** + **per-feature normativa URL.** Rated **L2–3**.
- ⭐ **THE REFERENCE CASE FOR CURRENCY.** Eivissa's `QUALIFICACIONS` rows carry `OBS`:
  > *"Del municipi d'Eivissa el MUIB NO mostra l'actual normativa vigent. Consultau la informació
  > proporcionada per l'Ajuntament."*

  **Vector present, explicitly NOT IN FORCE.** ⭐ **One publisher of seventeen exposes a validity flag
  at all** — which is why *absence of a flag is never evidence of currency.*

## 📖 DOCUMENTED — official, but **nothing fetched**

**Endpoint:** `ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer` — **ArcGIS REST,
public, keyless.**

⭐ **A four-layer model that maps onto the legal decision chain:**

| Layer | Role |
|---|---|
| **Àmbit** | instrument extent — ⚠ *may be discontinuous* |
| **Classificació** | three soil classes |
| **Qualificació** | zoning to minimum level |
| ⭐ **Gestió** | *unitats d'actuació* through to **the delimitation polygons of plans parcials and plans especials** |

> ⭐ **THAT MANAGEMENT LAYER IS CATALUNYA'S `PD*` PUBLISHED AS GEOMETRY.** **Catalunya reconstructed
> it. Madrid cannot.** **If it resolves uniquely, `R` is solved BY THE PUBLISHER.**

**Stated ontology:** MUIB involves systematisation and harmonisation, ⭐ **a wide parameter database
with a SINGLE DICTIONARY OF URBAN CONCEPTS**, georeferencing, digitisation, and *fitxes urbanístiques*.

⚠ **That is exactly what València's grammar hypothesis must PROVE — asserted here as the DESIGN.**
Design intent is `DOCUMENTED`, never `MEASURED`.

⚠ **Disclaimer:** *"El MUIB TÉ NOMÉS CARÀCTER INFORMATIU"* — **SIXTH REGION.** (Madrid ×2, CyL,
Balears, Aragón, València.) ⛔ **One counsel question, not six.**

---

## ⛔ THE WARNING NOT IN OUR CORPUS — a failure class PRYZM DOES NOT MODEL

> The cartography fuses municipal and territorial planning categories, but **the related attributes
> may not take into account the determinations of territorial planning — especially the ISLAND
> TERRITORIAL PLANS — so attribute information for NON-ADAPTED municipalities may be PARTIALLY OR
> TOTALLY ABROGATED.**

⭐ **THIS IS HIERARCHICAL SUPERSESSION: municipal PGOU under Island PTI, attributes superseded ACROSS
CORPORA.**

**PRYZM's supersession work is document→document WITHIN one corpus** — Barcelona ran
**1,755 → 773 → 147, 46 unread.** ⛔ **This is instrument-TIER → instrument-TIER. Different problem.**

**Record it as its own class**, alongside `f_fin`, `OBS`, `operacionbaja`, `fiab_geom` — ⭐ **and note
how it DIFFERS from all four: those flag a RECORD; this changes WHICH LAW APPLIES.**

⛔ **IT CAN ONLY OVER-GRANT** — the L-616 direction, reached through the instrument hierarchy.

⚠ **Consequence for `R`: it may NOT BE SINGLE-VALUED.** A parcel can route to a municipal instrument
**whose determinations an island plan has overridden.**

---

## The three queries

**Q1 · FULL SCHEMA, AND THE URL CHECK.** Layer descriptors on every `GOIB_MUIB` layer — fields, **VALID
rates (never non-null — populated is not present)**, domains.

⛔ **AND COUNT DISTINCT VALUES ON THE NORMATIVA URL.** ⚠ **València's `UrlLink` had 99 % coverage and
TWENTY distinct values** — per-CCAA register homepages, not per-feature documents, and treating it as
routing **fabricated a ~99 % tier estimate.** ⭐ **A per-feature URL with few distinct values is NOT
`R`.**

**Q2 · DOES `Gestió` RESOLVE A UNIQUE GOVERNING INSTRUMENT?** Parcels **seeded and stratified across
Mallorca, Menorca, Eivissa, Formentera.** Classify **unique · ambiguous · none**. ⭐ **The ambiguity
rate IS the `R` measurement.**

**Q3 · PTI ADAPTATION STATUS AND VALIDITY, ALL 67.** Which municipalities are **adapted to their
island territorial plan?** ⭐ **Unadapted ones carry attributes the publisher says may be abrogated —
THIS IS THE DEVIATION LIST** (intake item 8). Plus `OBS` and `DFIVIGEN` prevalence: **how many
self-declare not-in-force, as Eivissa does?**

**THEN, only if Q1–Q3 land — ONE ORDINANCE.** One municipality, one zone, follow the normativa URL,
and check whether **height, setbacks and occupation** are there **with an article reference.**
⭐ **That single read proves or refutes `P` — and the architecture only has to be proven once.**

---

## Method

**Zero-feature is not absence.** ⛔ **HTTP 200 IS NOT SUCCESS ON ArcGIS — a 200 can carry an Esri 400.**
Any count landing on **1000/2000/3000** is a **truncation suspect.** **Municipality attribute filter,
never bbox.** **Validate values for internal contradiction before quoting a rate.** ⛔ **UNKNOWN never
NO.** **State what you could not distinguish rather than choosing.**

## Verdict format

⛔ **In R/P terms, never a single Balears number:**

> ✅ *"`R` resolves uniquely on **X %** of sampled parcels; `P` unproven pending one ordinance read;
> **N of 67** municipalities unadapted to PTI."*

**Queue position:** ⛔ **YIELD TO A2.** Catalunya's 24 outrank this — **they are one run from the first
computed count this programme has had.**
