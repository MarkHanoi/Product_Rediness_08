# STANDARD CITY DATA-REQUEST — Legislation (25%) + Parcel (15%)
> The reusable prompt the founder fills **per city** (with research assistance), then hands back to wire.
> Fill Part A + B + C, hand back → orchestrator ingests into the rule pack (LEGISLATION) + parcel provider (PARCEL).
> **HONESTY RULES (non-negotiable — same standard as Barcelona/Denmark):**
> 1. **Article-cited or it doesn't ship.** Every numeric value carries ordinance + article + paragraph.
> 2. **Unknown = "unknown", never 0.** A blank/guessed number is worse than an honest gap.
> 3. **Scope is load-bearing.** A FAR/percentage's denominator (parcel / property / planning-area) changes the answer — always state it.
> 4. **Survey-grade ≠ ownership boundary.** Say which the parcel source is.

---

## COPY-PASTE PROMPT (hand this to your research assistant, one city at a time)

> You are extracting planning legislation for **<CITY, COUNTRY>** into a structured, citable dataset for a buildability engine. Use ONLY official primary sources (the municipal/regional ordinance + official GIS). For every numeric value, give the exact **ordinance title, article, and paragraph**. If a value is not found in the primary text, write `unknown` — do NOT infer, round, or fill from reputation. For each FAR/percentage, state the **denominator scope** (parcel / property / planning-area). Produce the three tables below verbatim.

---

## PART A — LEGISLATION (one row per zoning district / grade)
For **every applicable zone** in the city:

| Field | What to provide | Notes |
|---|---|---|
| `zoneCode` | official zone/ordenanza/norma-zonal code | e.g. Madrid NZ-4, BCN 13a |
| `officialDesignation` | the ordinance's name for the zone | |
| `farRatio` | FAR / edificabilidad (value + unit m²/m²) | + **`densityScope`: parcel / property / planning-area** (mandatory) |
| `maxHeight_m` | max height (m) | + **how measured**: to cornice/ridge, from rasant/façade/ground |
| `maxFloors` | max storeys | |
| `maxCoverage` | coverage / ocupación (0–1 or %) | |
| `setback_front_m` / `_rear_m` / `_side_m` | setbacks (m) | **`null` if none — never `0`** |
| `buildableDepth_m` | fondo edificable (m) | if the zone uses depth-alignment |
| `permittedUse` | residential / mixed / etc. | |
| `legalSource` | ordinance title | e.g. "PGOUM Compendio 2024" |
| `article` | **article + paragraph** | ← mandatory, the whole point |
| `effectiveDate` / `supersededBy` | when in force / replacement | if known |
| `confidence` | official-ordinance / official-GIS-attr / parsed-PDF / secondary | evidence tier |

## PART B — PARCEL (the cadastre / parcel source)
| Field | What to provide |
|---|---|
| `hasOpenSource` | is there an open parcel/cadastre API or download? (yes / no) |
| `endpoint` | URL + protocol (WFS / OGC API Features / ArcGIS REST / bulk download) |
| `auth` | none / API-key (self-service) / eID-gated / access-agreement |
| `crs` | EPSG code (e.g. 25830, 27700, 3067) |
| `parcelIdField` | the identifier attribute name (e.g. refcat, BBL, kiinteistötunnus) |
| `coverage` | national / regional / city · **complete or partial** (state gaps) |
| **`grade`** | **survey-grade engineering cadastre  OR  ownership general-boundary** ← the honesty flag |
| `license` | e.g. CC BY 4.0, OGL v3, restricted |

## PART C — city meta (so the source is reproducible)
| Field | What to provide |
|---|---|
| `ordinanceUrl` | official source URL(s) + **consolidated version + date** |
| `officialGis` | official planning GIS portal URL (if any) |
| `machineReadable` | are the rules a queryable API attribute, or PDF-only? |
| `updateFrequency` | how often the ordinance is revised |

---

## Where each part lands (so you know it's used)
- **Part A → the LEGISLATION axis (25%)** — ingested into the executable planning-rule model `{zoneCode, constraintType, operator, value, unit, densityScope, legalSource, article, effectiveDate, supersededBy, confidence}`, rendered as the city's envelope rule pack (mirrors Barcelona's 4 packs).
- **Part B → the PARCEL axis (15%)** — either wires a new parcel provider (if a new open endpoint) or confirms/keys an existing one; `grade` sets the confidence cap (survey-grade → HIGH; general-boundary → MEDIUM, like GB/Scotland).
- **Part C → provenance** — keeps every rule diff-able and defensible in DD.

## Priority order (highest ROI first)
Lead with the cities already in flight: **Madrid** (template already scaffolded — just fill Part A) → your next target metros. Parcel (Part B) is usually already found by the code agents; **your highest leverage is Part A (Legislation), the 25%-weight axis that only you can source.**
