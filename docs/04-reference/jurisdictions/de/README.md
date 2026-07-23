# Germany (`de`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `DE` · **Join key:** AGS (Amtlicher Gemeindeschlüssel, 8-digit municipality code) · **Subdivision law:** Länder (ISO 3166-2, `de-<subdiv>`) · **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline ready

> **This file is the country-level umbrella.** Municipality-level packs live under
> `de/<Land-iso>/<AGS5>-<slug>/`. The national legal structure and federal data sources are fully
> characterised; no rule pack is implemented yet.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Grundgesetz (Basic Law) → federal land-use law
  → BauGB (Baugesetzbuch) — federal statute governing when/where building is permitted
    → Bebauungsplan (B-Plan) — binding municipal zoning plan (§30 BauGB) — the primary instrument
    → §34 BauGB — unplanned interior area: buildability by "Eigenart der näheren Umgebung" (character of surroundings), discretionary, NO numeric table
    → §35 BauGB — outlying area: presumptively NOT buildable (privileged uses excepted)
  → BauNVO (Baunutzungsverordnung) — federal ordinance defining zone type taxonomy + §17 density ceilings
    → Anlagen- und Nutzungsarten (§§2–11 BauNVO) — WA, MI, GE, GH, MK etc. — NATIONAL fixed list
    → §17 Obergrenzen — federal density ceilings per zone type (GRZ, GFZ) — may ONLY be reduced locally, never exceeded without formal §17(2) derogation
    → §20 BauNVO — definition of Geschossfläche (floor area for GFZ calculation) — national
  → Landesbauordnung (LBO) — each Land's own building code, governs Abstandsflächen, Geschosse, Dachform
    ← 16 separate LBOs; concept is shared, multipliers/minima are Land-specific
  → Denkmalschutzgesetz — heritage protection, Land law, no federal register
```

**Germany's central structural difference from Spain and France:** the issue is not "which mechanism" (BauNVO's zone taxonomy and §17 density ceilings are genuinely federal), but **which of up to four legal regimes governs a given parcel at all** — a regime-classification step that must run *before* any numeric sourcing.

### 1.2 The four regimes (must be resolved per parcel before numeric sourcing)

| Regime | Basis | Governs | Numeric rules? |
|---|---|---|---|
| **(a) Modern B-Plan** | §30 BauGB | Parcel inside a formally adopted Bebauungsplan boundary | YES — GRZ, GFZ, Höhe in B-Plan; BauNVO §17 as ceiling |
| **(b) Historic plan** | §173(3) BBauG (Berlin only: 1958/60 Baunutzungsplan) | Pre-1960 legacy plan with binding remnant force | PARTIAL — "Baustufen" grading; may be judicially voided as *funktionslos* |
| **(c) §34 unplanned interior** | §34 BauGB | Urban fabric without a binding B-Plan | NO numeric table — "Einfügen" (fit the neighbourhood character) is the legal standard |
| **(d) §35 outlying area** | §35 BauGB | Outside the Zusammenhang of developed areas | PRESUMPTIVELY NOT BUILDABLE — exceptions for privileged uses only |

⚠ **§34 coverage is NOT negligible in German cities.** Berlin documents large former-East districts where no effective pre-1990 plan exists and no B-Plan has since been adopted. Munich's §34 fraction is assumed smaller but **not measured**. The correct output for a §34 parcel is a reasoned refusal (no numeric envelope), not a gap to fill later.

### 1.3 BauNVO zone taxonomy (national, fixed, applies everywhere)

| Zone | Full name | §17 GRZ ceiling | §17 GFZ ceiling |
|---|---|---|---|
| `WS` | Kleinsiedlungsgebiet | 0.20 | 0.40 |
| `WR` | Reines Wohngebiet | 0.40 | 0.80 |
| `WA` | Allgemeines Wohngebiet | 0.40 | 1.20 |
| `WB` | Besonderes Wohngebiet | 0.60 | 1.60 |
| `MD` | Dorfgebiet | 0.60 | 1.20 |
| `MU` | Urbanes Gebiet | 0.60 | 3.00 |
| `MI` | Mischgebiet | 0.60 | 1.20 |
| `MK` | Kerngebiet | 1.00 | 3.00 |
| `GE` | Gewerbegebiet | 0.80 | 2.40 |
| `GI` | Industriegebiet | 0.80 | 2.40 |
| `SO` | Sondergebiet | (varies) | (varies) |

**How to use this table:** the §17 figures are **ceilings**, not targets. A specific B-Plan may set a *lower* GRZ/GFZ for its zone — and frequently does. A B-Plan that states `GFZ 0.8` in a `WA` zone is legal; one that states `GFZ 1.5` is not without a §17(2) derogation. Always read the B-Plan first; use §17 only as an upper-bound sanity check.

---

## 2 — National data sources

### 2.1 Parcel geometry — ALKIS / AAA model

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Parcel geometry (`Flurstück`) | ALKIS (Amtliches Liegenschaftskatasterinformationssystem), part of the AAA-Modell (AFIS-ALKIS-ATKIS) | **Per-Land WFS/geoportal** — standardised schema but operated and licensed separately by each of the 16 Länder | **Varies per Land** — some free/open (NRW, Sachsen-Anhalt, GDI-BE Berlin/Brandenburg); others fee-based or registration-only | `published` (schema); per-Land (licence) |

⚠ **No single national ALKIS API.** Budget 16 separate licence/access integrations sharing one data model, not one endpoint. Check the specific Land before starting any city.

### 2.2 Zone taxonomy — BauNVO (one-time national lookup)

The BauNVO zone type codes (`WA`, `MI`, `GE`, etc.) form a **fixed, closed national list** under federal ordinance. Build once as a static lookup table; identical meaning in every Land. Source: BauNVO (current consolidated version), §§2–11.

### 2.3 Structured B-Plan exchange — XPlanung / XPlanGML

| Aspect | Value | Confidence |
|---|---|---|
| Standard name | XPlanung, exchange format XPlanGML — schema v6.1 (current) | `published` |
| Legal mandate | IT-Planungsrat resolution 5 Oct 2017; transition closed Feb 2023 | `published` |
| Access | Per-Land delivery platform — most Länder run their own XPlanung geoportal | `published` (standard); per-Land (actual availability) |
| Reality check | Self-reported adoption ≠ ground truth. Hamburg: **verified fully migrated** (1,900 B-Pläne + 900 pre-1960 plans; started 2011, complete 2018). NRW, Berlin (FIS-Broker): confirmed partially. Bavaria: **DiPlanung mandatory from 31 Oct 2026** — interim services until then. All other Länder: verify before assuming. | mixed |
| Structured GRZ/GFZ/Höhe fields | Present in XPlanGML schema — but only if the municipality populated them. A valid XPlanGML file may carry only the geometry without numeric attributes if the source B-Plan is a scanned Satzung. **Probe before assuming.** | `stated` — needs live probe per Land |

**The XPlanung structural advantage over France:** XPlanGML encodes GRZ, GFZ, and Höhe as structured XML attributes when the municipality has digitised them. France's GPU WFS has no equivalent — French rules live in prose PDFs. The catch: not every B-Plan is fully digitised even inside a Land that claims XPlanung compliance. **Probe one B-Plan before building any ingestion pipeline.**

### 2.4 Building footprints + height — LoD2-DE

| Aspect | Value | Confidence |
|---|---|---|
| Coverage | ~58 million buildings nationwide | `published` |
| Format | CityGML, ALKIS footprint + LiDAR-derived height, ~1 m height accuracy | `published` |
| Coordination | ZSHH (Zentrale Stelle für Hauskoordinaten und Hausumringe), hosted at Bavaria's state survey office | `published` |
| National feed | INSPIRE Art. 13(1)(e) — "limited group of authorised users" — restricted | `published` |
| Per-Land tiles | Several Länder publish own LoD2 tiles as free direct download: **confirmed** Sachsen-Anhalt, Baden-Württemberg; **plausible** Bavaria (ZSHH host). Berlin publishes LoD2 openly via FIS-Broker. Others: verify. | per-Land |

### 2.5 Setbacks — Abstandsflächen (Land-level)

The height-proportional setback from a boundary is universal in concept across all 16 Länder (commonly 0.4H from boundary, minimum ~3 m), but the specific multiplier and the minimum absolute distance are set by each Land's Landesbauordnung. One shared `GeometricRule` kind (`setback`, height-proportional) covers the concept; the multiplier/minimum is a per-Land config value.

### 2.6 Heritage — Denkmalschutz (Land law, fragmented)

Heritage protection is state (Land) law; there is no federal monument register. The Landesdenkmalamt (or equivalent municipal authority) administers it. Do **not** assume a queryable GIS layer exists just because XPlanung does — most Denkmal registers are not machine-readable at the parcel level. Flag as high-risk overlay wherever it applies.

### 2.7 Signature gate (all cities)

The **printed, signed official B-Plan** (Satzung + Begründung) remains the legally binding version. XPlanGML/INSPIRE versions are informational only. A structured field value from XPlanGML may only be shipped as `corroborated` until verified against the signed Satzung or an equivalent official viewer. This is the German analogue of Marseille's "règlement graphique prime" rule.

---

## 3 — Context-data layer status (LOD / 3D)

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Building footprints | ALKIS (per Land) | LOD1 | Per-Land | Not live-probed |
| Building height | LoD2-DE (per Land or ZSHH) | LOD2 (LiDAR-derived, ~1 m accuracy) | Per-Land — some free | Not live-probed |
| Roof shape | LoD2-DE (CityGML geometry) | LOD2 (CityGML LoD2 roof shapes) | Per-Land | Not live-probed |
| Roads / pedestrian | ATKIS Basis-DLM (per Land) or OSM | Object-level | Per-Land (ATKIS) / ODbL (OSM) | Not live-probed |
| Parks / green | ATKIS Basis-DLM / OSM | Object-level | Per-Land / ODbL | Not live-probed |
| Water | ATKIS Basis-DLM / OSM | Object-level | Per-Land / ODbL | Not live-probed |

**Germany vs France comparison:** France has a single national data source (IGN) with open licensing across the board. Germany has 16 Land-operated systems with heterogeneous licensing — the same data model (ALKIS/ATKIS/XPlanung) but 16 separate access points. Germany's LoD2 quality is on par with France's LiDAR-derived LOD2 (and predates France's full national LiDAR HD coverage), but the licence picture is more complex.

---

## 4 — Overlay risk

| Overlay | Visibility in XPlanung | Risk |
|---|---|---|
| **§34 regime** (no B-Plan) | Identified by *absence* of a covering B-Plan polygon — requires a classification query, not a lookup | **VERY HIGH** — largest single implementation risk; exact coverage unknown until measured |
| **§173(3) BBauG legacy plans** (Berlin only) | Separate digitised layer in FIS-Broker, predates XPlanung schema | **HIGH (Berlin-specific)** — may be judicially voided as *funktionslos* without warning |
| **Erhaltungsverordnung** (conservation area) | Administered per district; not in XPlanung schema | **HIGH (Berlin specific zones)** — layers on top of whichever regime applies |
| **Denkmalschutz** (heritage) | NOT in XPlanung generally — Land-law Denkmalamt layer, separate portal | **HIGH** — no queryable national standard |
| **Überschwemmungsgebiet** (flood zone) | INSPIRE WMS/WFS — some Länder publish, others PDF-only | MEDIUM |

---

## 5 — Municipality coverage

| Municipality | AGS (8-digit) | Land | ISO 3166-2 | Pack status | Regime complexity | Dev-days est. |
|---|---|---|---|---|---|---|
| **Hamburg** | 02000000 | Hamburg | `de-hh` | NOT STARTED | LOW — city-state, fully XPlanung-migrated 2018, no historic-plan legacy layer | ~10–12 |
| **Munich** | 09162000 | Bayern | `de-by` | NOT STARTED | MEDIUM — §34 fraction unmeasured; DiPlanung transition Oct 2026 | ~12–15 |
| **Berlin** | 11000000 | Berlin | `de-be` | NOT STARTED | VERY HIGH — 4 regimes, 1958/60 Baunutzungsplan legacy, §34 East-Berlin prevalence | ~30–35 |

**Recommended sequencing:** Hamburg → Munich → Berlin, mirroring Barcelona's `13a`→`13b` principle: start with the most defensible city (full XPlanung coverage, one jurisdiction, no historic-plan trap), then the medium-cost one, then the expensive one.

---

## 6 — Files in this folder

```
de/
├── README.md                           ← this file (country umbrella)
├── NEXT.md                             ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                      ← per-field national data source citations
│   └── VERIFICATION.md                 ← human sign-off (open)
├── findings/
│   └── GERMANY-MASTER-DATA-SOURCE-STUDY.md  ← full source/legal-mechanism study
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md                       ← Germany requires Land-level routing (16 Länder)
├── de-hh/
│   └── 02000-hamburg/                  ← Hamburg (city-state)
├── de-by/
│   └── 09162-munich/                   ← Munich / Bayern
└── de-be/
    └── 11000-berlin/                   ← Berlin (city-state, 4 regimes)
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **XPlanGML structured-field completeness:** the standard mandates the schema, not that every B-Plan's numeric rules are populated. A Land can be "XPlanung compliant" with only geometry and a scanned PDF reference. Measure the null-rate on GRZ/GFZ/Höhe attributes for a sample of Hamburg B-Plans before assuming the ingestion pipeline yields useful numbers.
- **ALKIS parcel licence per Land (Hamburg, Bavaria):** Hamburg's ALKIS licence is reported as open for Berlin/Brandenburg (GDI-BE) but not confirmed for Hamburg LGV directly. Bavaria's Bayerische Vermessungsverwaltung licence terms need to be read before building an ALKIS ingestion for Munich.
- **§34 fraction for Munich:** assumed smaller than Berlin (continuous West German urban fabric) but not measured. A grid-sample probe — same method as the Barcelona clau-distribution probe — would convert this from an assumption into a measurement. Required before committing a Munich dev-day budget.
- **Bavarian LoD2 licence terms:** ZSHH is hosted in Bavaria, but ZSHH hosting ≠ confirmed free/open terms for Bavaria-local access. Direct check of Bayerische Vermessungsverwaltung's LoD2 product page is required.
- **Berlin Baunutzungsplan voidance risk per area:** the OVG Berlin-Brandenburg 2020 case established that Baunutzungsplan figures can be voided as *funktionslos*. There is no database of "already voided" figures; a manual case-law check is required per target area before shipping a Baunutzungsplan-derived number.
