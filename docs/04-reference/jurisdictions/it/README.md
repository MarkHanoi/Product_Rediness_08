# Italy (`it`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `IT` · **Join key:** ISTAT codice comune (6 digits) ·
**Subdivision law:** Regions (ISO 3166-2, `it-<subdiv>`) — 19 regions + 2 autonomous provinces ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline NOT started

> **This file is the country-level umbrella.** Municipality-level packs live under
> `it/<region-iso>/<ISTAT6>-<slug>/`. The national data-source layer is characterised at research
> level; no rule pack is implemented yet.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
Costituzione (Art. 117 Title V) → "governo del territorio" = CONCURRENT REGIONAL COMPETENCE
  → National floor:
      DM 2 aprile 1968 n. 1444 — zone taxonomy (A–F) + density/distance ceilings
      Codice Civile Art. 873 — national minimum boundary setback (3 m)
      DPR 380/2001 (Testo Unico dell'Edilizia) — national building-permit code
        Art. 2-bis → regional derogation regime for Art. 9 building distances
  → Regional planning law (one per region / autonomous province — NOT one national code):
      PRG (Piano Regolatore Generale) — classic 1942-law instrument (Piedmont, Umbria, Marche, …)
      PGT (Piano di Governo del Territorio) — Lombardy only (L.R. 12/2005)
      PUC (Piano Urbanistico Comunale) — Liguria, Campania, Sardinia
      PSC (Piano Strutturale Comunale) — Friuli, Campania, Basilicata, Calabria, Tuscany
      PUG (Piano Urbanistico Generale) — Emilia-Romagna, Puglia, Sicily; Lazio = PUGC
      PAT + PI (Piano di Assetto del Territorio + Piano degli Interventi) — Veneto (L.R. 11/2004)
      PCTP — Autonomous Province of Bolzano
  → Municipal plan within the regional instrument (numbers + operative zoning)
  → Regolamento Edilizio / REC / RUEC / RET — building-code layer (name varies by region)
```

**Italy's central structural difference from France and Germany:** the planning *instrument itself*
— not just its numbers, its legal architecture — is regional. A "PUC" in Campania and a "PGT" in
Lombardy are not two labels for the same mechanism the way `UA` in two French communes is at least
the same *kind* of document. This means a rule-engine kind built for reading a Lombard PGT's *Piano
delle Regole* may share almost nothing structurally with what is needed for a Campanian PUC. Italy
thus has France's "every commune writes its own numbers" problem, Germany's "delivery is
state-by-state" problem, AND a third problem neither has: the operative instrument *type* differs
by region and the zoning *mechanism* can differ again by city within one region.

### 1.2 The regional-instrument split (must be resolved before any city work)

| Regional instrument | Regions / provinces using it |
|---|---|
| **PRG** (Piano Regolatore Generale) | Piedmont, AP Trento, Umbria, Marche, Abruzzo, Molise, Valle d'Aosta |
| **PGT** (Piano di Governo del Territorio) | **Lombardy only** (L.R. 12/2005) |
| **PUC** (Piano Urbanistico Comunale) | Liguria, Campania, Sardinia |
| **PSC** (Piano Strutturale Comunale) | Friuli VG, Campania, Basilicata, Calabria, Tuscany |
| **PUG** (Piano Urbanistico Generale) | Emilia-Romagna, Puglia, Sicily; Lazio = PUGC |
| **PAT + PI** | Veneto (L.R. 11/2004) — structural plan + operational plan, split |
| **PCTP** | AP Bolzano — entirely separate cadastral system too |

The building-code layer beneath the plan is named:
- **Regolamento Edilizio (RE)** or **REC** — most regions
- **RUEC** — Campania
- **RET** (Regolamento Edilizio-Tipo) — Lombardy only

### 1.3 DM 1444/1968 zone taxonomy (nominally national — frequently superseded)

DM 2 aprile 1968, n. 1444, Art. 2, defines a closed national list of *zone territoriali omogenee*:

| Zone | Description | Art. 7–8 density ceiling (fondiario) |
|---|---|---|
| `A` | Historic centres | Conservative renovation; no net-new volume |
| `B` | Already built-up residential | 5 mc/mq (if plan is silent) |
| `C` | New residential expansion | 5 mc/mq |
| `D` | Industrial / productive | 5 mc/mq |
| `E` | Agricultural | 0.03 mc/mq (fondiario) |
| `F` | Public facilities and infrastructure | — |

Art. 9 sets the nationally inderogable minimum distance *between buildings with facing windows*:
10 m minimum (further conditions by zone type). Subject to regional derogation under DPR 380/2001
Art. 2-bis — **not a safe floor without checking each region's derogation law**.

**⚠ Critical caveat:** DM 1444's zone letters are a 1968 *minimum-standards* framework, not the plan
document itself. Many modern municipal plans still report zone letters for statistical purposes while
running a completely different operative zoning mechanism underneath. Milan (PGT territorial index)
and Rome (tessuto typology) have **abandoned the letter taxonomy for operative purposes entirely**.
Do not assume `A`/`B`/`C` letters are a universally safe query key the way BauNVO letters are in
Germany.

### 1.4 Italy's FAR-equivalent — alive nationally, but drifting away in large cities

Italy's working floor-area concept is **SUL/SLP** (*superficie utile lorda / superficie lorda di
pavimento*), paired with the **indice di fabbricabilità** (fondiario or territoriale, expressed as
`mc/mq` or `mq/mq`). Unlike France (FAR abolished nationwide since ALUR 2014), Italy's FAR
equivalent is still alive at the national floor level (DM 1444 Art. 7–8). But **individual cities
are choosing to abandon it on their own initiative** (Milan's PGT perequation system — see §B.1 of
the master study) — a *municipal choice*, not a national legal fact, so it cannot be assumed to
generalize the way "no FAR in France" safely can.

### 1.5 Three-tier sequencing recommendation (mirrors France and Germany)

| Tier | Definition | Candidate cities |
|---|---|---|
| **Tier 1** | DM 1444 zone letters still operative, numeric tables zone-keyed, decent regional geodata | **Turin** (pending primary-text confirmation of PRG NTA) |
| **Tier 2** | Bespoke city-specific mechanism replacing national taxonomy; new engine kind required | **Milan** (territorial index + perequation), **Rome** (fabric typology + intervention-mode split) |
| **Tier 3** | Unconfirmed regional mechanism — each its own research task before any estimate | Every other Italian region (Campania PUC, Veneto PAT/PI, Emilia-Romagna PUG, etc.) |

---

## 2 — National data sources

### 2.1 Parcel geometry — Catasto (Agenzia delle Entrate)

| Layer | Source | Access | Licence | Confidence |
|---|---|---|---|---|
| Cadastral parcel geometry | **Catasto** — Agenzia delle Entrate, Direzione Centrale Servizi Catastali | WFS: `wfs.cartografia.agenziaentrate.gov.it` · WMS: `wms.cartografia.agenziaentrate.gov.it` | **CC BY 4.0** (open) | `published` |
| Bulk download (parcels + addresses) | Agenzia delle Entrate open-data portal | Nationwide bulk download, available **since February 2025** | CC BY 4.0 | `published` |
| Scale / precision | 300,000+ sheets, >85 million parcels, 18 million buildings — not survey-grade (same precision caveat as French PCI Express) | — | — | `published` |

**⚠ Autonomous Province deviations:**
- **Trento:** runs its own cadastral system by statutory delegation — **excluded** from the national Agenzia WFS. Needs its own separate cadastral integration.
- **Bolzano:** same exclusion pattern. Also runs PCTP planning instrument entirely separately.

### 2.2 Zoning identification — no national machine-readable standard

Unlike France (GPU WFS) or Germany (XPlanung), **no national structured machine-readable municipal
zoning layer exists**. What exists instead:

| Source | What it covers | Quality | Confidence |
|---|---|---|---|
| **Geoportale Lombardia** | PGT archive + cartography for every Lombard comune | Best in class — MISURC mosaic + current PGT documentary | `corroborated` |
| **Piedmont regional PRG mosaic WMS** | PRG mosaicatura — destinazioni d'uso, vincoli, piani esecutivi | Explicitly uneven currency — more recently updated for metropolitan area/provincial capitals | `corroborated (with caveat)` |
| **Other regional geoportals** | Varies — most regions have some form of portal | Uneven quality and currency; no national coordination | per-region |
| **Private platforms (UrbisMap, PgtOnLine)** | Aggregate Agenzia delle Entrate cadastre + municipal SIT vectors across regions — commercial | Most comprehensive mosaics available; subscription required for premium access | secondary |

**Net assessment:** structured national zoning-rule data is **behind** where France's CNIG SRU pilot
is — France has one national standard under active development; Italy has no identified equivalent
public standardization effort. Private aggregators filling the vacuum is the clearest signal that no
free complete alternative exists.

### 2.3 Heritage and protective overlays — SITAP + Vincoli in Rete (Italy's one structural advantage)

Italy is structurally ahead of both France and Germany for heritage overlay coverage:

| System | Covers | Access | Confidence |
|---|---|---|---|
| **SITAP** (*Sistema Informativo Territoriale Ambientale e Paesaggistico*) | Georeferenced perimeters of landscape constraints (Codice dei Beni Culturali D.Lgs. 42/2004 Artt. 136/157 — "decreed" landscape interest) + archaeological-interest zones (Art. 142(1)(m)) | Web-GIS, MiC Directorate-General for Landscape | `published (with caveat)` |
| **Vincoli in Rete** | Cultural-heritage protections (Parts II and III of D.Lgs. 42/2004 — individually listed buildings, archaeological assets) | Freely consultable | `published (with caveat)` |

**⚠ SITAP self-described caveat (equivalent to Berlin's Baunutzungsplan provisionally-binding note):**
SITAP is explicitly described as "an archival and representational system of a purely informational
and support character" given "acknowledged incompleteness" and "variable positional accuracy." A
`NOT FOUND` from SITAP does not certify absence of a constraint — only absence of a *recorded* one.
Ship at `corroborated` maximum; never `certified` without a parallel decree check.

### 2.4 Building footprints and height — no national LoD2; terrain only (PST/SIM)

| Layer | Source | Coverage | Confidence |
|---|---|---|---|
| **PST/SIM terrain** (DTM/DSM) | MASE (*Ministero dell'Ambiente*) — Piano Straordinario di Telerilevamento + PNRR SIM expansion | ~50% historical; **PNRR target: 100% by 2026** (25 cm resolution, ~8 cm vertical accuracy) | `published` |
| **Building heights (LoD2 equivalent)** | **Not national** — produced per-region from regional topographic databases | Varies; confirmed for Piedmont (ARPA Piemonte Edifici 3D — region-wide); likely absent or patchy elsewhere | per-region |

**No German ZSHH equivalent coordinates building-model production across regions.** Italy's national
LiDAR program (PST/SIM) produces terrain/surface models — not semantically classified building
layers. Building-height data availability must be confirmed per target city before committing a dev
estimate, starting from a lower prior than Germany.

### 2.5 National floor rules — setbacks and distances

| Rule | Basis | Value | Derogation |
|---|---|---|---|
| Minimum boundary setback | Codice Civile Art. 873 | **3 m** minimum (absent stricter local rule) | Municipal plan may set stricter; cannot go below 3 m |
| Minimum distance between buildings (facing windows) | DM 1444/1968 Art. 9 | **10 m** minimum where either facade has windows | Regional derogation allowed under DPR 380/2001 Art. 2-bis — **check each region** |

---

## 3 — Context-data layer status (LOD / 3D)

| Layer | Source | LOD achievable | Licence gate | Status |
|---|---|---|---|---|
| Building footprints | Catasto WFS (planimetrie catastali) — indicative only, not survey-grade | LOD0/LOD1 | CC BY 4.0 | Not live-probed |
| Building height | ARPA Piemonte Edifici 3D (Piedmont only) — derived from BDTRE + terrain | LOD1 with height | Regional CC | Not live-probed |
| Terrain (DTM/DSM) | PST/SIM — MASE open data | Raster (not building model) | CC BY 4.0 | Not live-probed |
| Roads / pedestrian | OpenStreetMap or regional topographic DBs | Object-level | ODbL / per-region | Not live-probed |
| Parks / green | Regional topographic DBs / OSM | Object-level | per-region / ODbL | Not live-probed |
| Water | Regional topographic DBs / OSM | Object-level | per-region / ODbL | Not live-probed |

---

## 4 — Overlay risk

| Overlay | Visibility in available layers | Risk |
|---|---|---|
| **SITAP** (landscape constraints) | Queryable via SITAP web-GIS — but explicitly incomplete and informational only | **HIGH** — a null result does not certify absence |
| **Vincoli in Rete** (listed buildings + archaeology) | Queryable separately | **HIGH** — same incompleteness caveat |
| **Piani esecutivi / strumenti attuativi** (site-specific executive plans — the §34/Pla Parcial equivalent) | Partial coverage in regional geoportals; not standardised | **VERY HIGH** — whether a numeric envelope can be read directly or whether a secondary plan must first exist is parcel-by-parcel (Rome is clearest case) |
| **Regional derogations to DM 1444 Art. 9** | Not exposed as a queryable layer | **HIGH** — the national 10 m distance floor may not be operative in any given region |
| **Autonomous Province regimes** (Trento, Bolzano) | Separate cadastral + planning systems entirely | **HIGH** — not covered by national Catasto WFS at all |

---

## 5 — Municipality coverage

| Municipality | ISTAT | Region | ISO 3166-2 | Regional instrument | Zoning mechanism | Pack status | Dev-days est. |
|---|---|---|---|---|---|---|---|
| **Turin** (Torino) | 001272 | Piedmont | `it-pie` | PRG | DM 1444 zone letters (assumed; unconfirmed) | NOT STARTED | ~10–15 (contingent on NTA confirmation) |
| **Milan** (Milano) | 015146 | Lombardy | `it-lom` | PGT (L.R. 12/2005) | Territorial index + perequation (no zone-letter table) | NOT STARTED | ~20–25 (new engine kind) |
| **Rome** (Roma) | 058091 | Lazio | `it-laz` | PRG (Roma Capitale 2008) | Tessuto typology + direct/indirect intervention split | NOT STARTED | ~25–30 (new engine kind) |

**Recommended sequencing:** Turin → Milan → Rome, mirroring Hamburg→Munich→Berlin:
start with the most defensible mechanism (if confirmed), then the new-kind cities.

---

## 6 — Files in this folder

```
it/
├── README.md                           ← this file (country umbrella)
├── NEXT.md                             ← blockers, trip-wires, resume steps
├── RATE.md                             ← data readiness rate
├── sources/
│   ├── SOURCES.md                      ← per-field national data source citations
│   └── VERIFICATION.md                 ← human sign-off (open)
├── findings/
│   └── ITALY-MASTER-DATA-SOURCE-STUDY.md  ← full source/legal-mechanism study
├── topics/
│   └── buildings-lod-height.md
├── regions/
│   └── README.md                       ← Italy requires per-region routing (21 jurisdictions)
├── it-pie/
│   └── 001272-turin/                   ← Turin / Piedmont (PRG, Tier 1 candidate)
├── it-lom/
│   └── 015146-milan/                   ← Milan / Lombardy (PGT, Tier 2)
└── it-laz/
    └── 058091-rome/                    ← Rome / Lazio (PRG 2008, Tier 2)
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Turin PRG NTA primary text:** the entire Tier 1 classification for Turin rests on the assumption that the current Torino PRG NTA still uses DM 1444-style zone letters with numeric tables. This must be confirmed by reading the primary text before any dev-day estimate is committed.
- **SITAP machine-readability for automation:** SITAP is consultable as a web-GIS; whether its constraint perimeters are exposed as a WFS/WCS that can be queried programmatically per parcel needs direct probe.
- **Catasto WFS field schema and authentication:** the Agenzia delle Entrate WFS endpoint has been confirmed at research level but not live-probed in this pass. Field names, GetFeature response schema, and whether authentication is required for bbox queries need direct confirmation.
- **Lombardy Geoportale PGT WFS queryability:** Lombardy hosts the PGT archive for every Lombard comune; whether this is queryable as a WFS (returning zone polygons per parcel) or only as a map service with PDFs needs direct probe.
- **ARPA Piemonte Edifici 3D licence and field schema:** confirmed to exist and be regionally licensed; the exact WFS/download endpoint, field names, and whether `mean_elevation` translates reliably to usable building height for Turin specifically needs a live probe.
- **Catasto bulk download format (Feb 2025 release):** whether the 2025 bulk open-data release includes parcel geometry in a format directly ingestible (GeoJSON, GeoPackage, Shapefile) without the WFS overhead, and whether it covers the three target cities at sufficient current-date currency.
- **Regional derogation laws for DM 1444 Art. 9:** each of the 21 regional/provincial instruments potentially modifies the 10 m building-distance floor. Confirming which regions have active derogation regimes before shipping any distance-related rule is required.
