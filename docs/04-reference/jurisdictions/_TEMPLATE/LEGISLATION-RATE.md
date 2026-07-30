# Legislation Data-Readiness Rate — `<JURISDICTION>` (`<iso>`) `<national | city>`

<!-- ────────────────────────────────────────────────────────────────────────────
`LEGISLATION-RATE.md` is the structured legislation/data-fill rate — a PER-AXIS
detail rate that FEEDS the LEGISLATION axis of the composite master `RATE.md`
(city) / `COUNTRY-RATE.md` (country). Naming rule: `RATE.md` = composite master;
`<AXIS>-RATE.md` = per-axis detail. See `NAMING-CONVENTION.md`.

COPY THIS FILE to start a `LEGISLATION-RATE.md` for a country or a city. Delete
these HTML comments as you fill it in. The standard is defined in
`docs/04-reference/jurisdictions/README.md` §"LEGISLATION-RATE.md — the
legislation data-readiness-rate standard". Read it before authoring.

⚠ HONESTY RULES — these are the whole point of the number (C58 §1.2/§1.4):
  1. The metric DEFINITION below is FIXED and identical in every jurisdiction, so
     the numbers are COMPARABLE. Do not redefine it per country.
  2. The rate is DERIVED from endpoint/schema checks you actually ran or from the
     jurisdiction's own findings — NOT assumed from a country's open-data
     reputation. Cite what you checked.
  3. If NO research has been done, the honest headline is
     **"NOT YET ASSESSED — scaffold only"**, NOT a guessed percentage. A missing
     rate is honest; a fabricated one is the §CONTEXT-DATA-HONESTY failure the
     whole tree exists to prevent (a guess presented as a measurement).
  4. A city rate MAY differ from its country rate (a heritage overlay, a
     confirmed-open municipal WFS, a geo-fence). Say WHY it differs.
──────────────────────────────────────────────────────────────────────────── -->

**Headline rate: `<NN>%`**  <!-- or: NOT YET ASSESSED — scaffold only -->

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

<!-- The cross-jurisdiction benchmark. Keep this table in SYNC across every LEGISLATION-RATE.md — it is
     the shared ruler. Insert this jurisdiction at its honest position. -->
| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **`<THIS JURISDICTION>`** | **`<NN>%`** |

---

## Field-by-field breakdown

<!-- One row per governing field. `Structured?` = ✅ / ⚠️ partial / ❌ text-PDF / ❌ absent.
     `Score` = this field's contribution, with a one-line justification of WHY (which endpoint,
     which schema slot, whether it is populated per-parcel). This table IS the derivation of the
     headline number — the headline is a weighted read of these rows, not a separate guess. -->

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | | | |
| Plan/zone existence + boundary | | | |
| Zone/use code | | | |
| Density metric (FAR / coverage / %-utilisation) | | | |
| Max height (parcel-level) | | | |
| Setback / alignment | | | |
| Building footprint + height (LOD1/2) | | | |
| Terrain (DTM/DSM) | | | |
| Heritage overlay | | | |

---

## The structural gap

<!-- 1–3 short paragraphs: the ONE reason the number is what it is. Usually "the schema defines a
     slot for the numeric value but it is delivered as prose in an ordinance PDF, not a structured
     field" — state the jurisdiction's specific version of that, with the confirming evidence
     (an object-catalogue stub, a sampled plan document, a geo-fenced endpoint). If the rate is
     unusually HIGH or LOW versus the benchmark, this is where you justify the outlier. -->

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| | | |

---

*Last updated: `<YYYY-MM-DD>`. `<one line: what is CONFIRMED live vs TBD vs geo-fenced.>`
Maintainer: `<UNASSIGNED or name>`.*
