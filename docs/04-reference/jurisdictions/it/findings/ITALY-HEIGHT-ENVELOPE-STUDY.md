# Italy — Height & Envelope Study

**Status:** RESEARCH FOLD — captured study of 2026-07-30 · **Confidence default:**
`CONVERGENT-SECONDARY` — every regional and municipal claim in this document is corroborated but not
live-probed. The only distinctly-flagged live anchors are the **Agenzia Entrate Catasto WFS**
(`VERIFIED-LIVE 2026-07-24`) and **TINITALY DEM** (`live`); both are national and neither is a height
or envelope source — they anchor the parcel and terrain layers *beneath* this study. ·
**Companion to:** `ITALY-MASTER-DATA-SOURCE-STUDY.md` (legal mechanism) and
`../ITALY-GEOSPATIAL-DATA-INVENTORY.md` (dataset catalogue).

> **§CONTEXT-DATA-HONESTY.** Nothing in this document moves a RATE % cell. Rome/Milan RATE cells move
> only when the Catasto is *wired* and the regional heights are *probed*; the envelope stays
> not-assessed until per-city rule packs exist and carry L-449 sign-off. Every height matrix star and
> every envelope claim below is `CONVERGENT-SECONDARY` and ships the probe before the fix.

---

## 1 — Why height is a separate problem from parcels

Italy solves parcels nationally (one Catasto, Spain-like) but has **no national height raster** — the
same posture as Portugal. There is no Italian equivalent of France's BD TOPO `HAUTEUR` or Germany's
LoD2-DE, and no coordinating national body (no ZSHH analogue). The national LiDAR programmes
(TINITALY, PST/SIM) produce **terrain/surface models only** — a DTM/DSM, not a semantically
classified building layer. Building height therefore has to be constructed **region by region**, from
each region's own topographic database or LiDAR, and is a genuine per-city research question rather
than a config toggle.

---

## 2 — The height hierarchy

Every building carries a stamped `heightSource`, resolved best-available-first:

```
heightSource precedence  (stamp it; never present a lower tier as a higher one)
  1. lod2         — regional LoD2 / CityGML / DBT with true roof + eave height   (surveyed)
  2. lidar_ndsm   — regional LiDAR nDSM = DSM − DTM → per-footprint P90           (surveyed)
  3. osm_levels   — OSM building:levels × storey height                          (crowd/modeled)
  4. assumed      — typology default (project-chosen assumption, flagged)        (assumed)
```

`lidar_ndsm` is computed as the 90th-percentile of (DSM − DTM) sampled inside the building footprint —
robust against roof furniture and edge noise. `lod2` is preferred where a region publishes true eave
/ ridge heights. `osm_levels` and `assumed` are modeled tiers and must be labelled as such — they
must **never** be presented at the surveyed confidence of `lod2`/`lidar_ndsm` (the OpenBuildingMap /
OSM caveat from the master study §D.6).

### 2.1 Regional height-coverage matrix

Stars are relative *coverage + quality confidence*, all `CONVERGENT-SECONDARY`:

| Region | Height coverage | Primary source | heightSource tier |
|---|---|---|---|
| **Lombardia** | ★★★★★ | DBT + regional LiDAR | `lod2` / `lidar_ndsm` |
| **Veneto** | ★★★★★ | DBT + LiDAR (IDT) | `lod2` / `lidar_ndsm` |
| **Emilia-Romagna** | ★★★★★ | DBTR + regional LiDAR | `lod2` / `lidar_ndsm` |
| **Piemonte** | ★★★★ | ARPA Edifici 3D (BDTRE + terrain) | `lidar_ndsm` (mean elevation) |
| **Toscana** | ★★★★ | Regional LiDAR nDSM | `lidar_ndsm` |
| **Lazio** | ★★★★ | Regional LiDAR / Roma Capitale SIT | `lidar_ndsm` |
| **Campania** | ★★★ | SIT semplificato edifici | `lidar_ndsm` / `osm_levels` |
| **Sicilia** | ★★ | Regional DBT / LiDAR (patchy) | `osm_levels` |
| *All other regions* | ★–★★ | OSM levels / OpenBuildingMap fallback | `osm_levels` / `assumed` |

**Fallback floor everywhere:** OSM `building:levels` → storey height, or OpenBuildingMap modeled
height, both stamped `osm_levels` / modeled and never presented as surveyed.

---

## 3 — The 3-DB model

Italy's envelope engine separates three databases that must not be conflated (mirrors the Barcelona
model in the master status doc):

| DB | Question | Contents | Source layer |
|---|---|---|---|
| **A — Existing reality** | *What is there?* | buildings, footprints, heights, terrain | Catasto geometry + regional LiDAR/LoD2 + TINITALY |
| **B — Legal planning** | *What is allowed?* | zoning, FAR (`indice di fabbricabilità`), coverage, max height, setbacks, heritage/landscape vincoli | municipal plan (PRG/PGT/PSC/PUC/PUG) + SITAP/Vincoli |
| **C — Rule engine** | *What is buildable?* | `A + B → BuildableEnvelope` | PRYZM solver (== Barcelona) |

DB A is national-plus-regional and largely solved (parcels VERIFIED-LIVE, terrain live, heights
regional). DB B is the fragmented, human-gated cost centre. DB C is the same solver already proven
for Barcelona/Madrid: `Parcel + Zone polygon + Rules → BuildableEnvelope`.

---

## 4 — The municipal envelope model

**No national machine-readable zoning layer exists** (unlike France's GPU or Germany's XPlanung).
Each municipality's plan is drafted under its region's own planning law — the instrument *type* itself
differs by region:

```
PRG   Piano Regolatore Generale        — classic 1942-law (Piemonte, Umbria, Marche, Abruzzo, Molise, Lazio/Roma)
PGT   Piano di Governo del Territorio  — Lombardia only (L.R. 12/2005): DdP + Piano dei Servizi + Piano delle Regole
PSC   Piano Strutturale Comunale       — Friuli, Basilicata, Calabria, Tuscany variant
PUC   Piano Urbanistico Comunale       — Liguria, Campania, Sardegna
PUG   Piano Urbanistico Generale       — Emilia-Romagna, Puglia, Sicilia
PUC/Piano Operativo                    — Tuscany operative layer (Firenze)
```

**Envelope record (per zone):**

```jsonc
{
  "municipality": "015146",           // ISTAT codice comune
  "plan": "PGT",                       // instrument type
  "zone": "TUC",                       // operative zone / tessuto / ambito
  "rules": {
    "max_height": 0,                   // m — from plan NTA (0 = unknown, refuse)
    "FAR": 0.35,                        // indice di fabbricabilità (mq/mq or mc/mq)
    "coverage": 0,                     // rapporto di copertura
    "setbacks": { "front": 0, "rear": 0 }
  },
  "source": "…",                       // NTA article citation
  "confidence": "CONVERGENT-SECONDARY"
}
```

**Solver:** `Parcel + Zone polygon + Rules → BuildableEnvelope` — identical to Barcelona. Each city is
a **per-city rule pack** like Barcelona, because the plan is per-municipality and the instrument type
is per-region. Milan (unified territorial index + perequation) and Rome (tessuto typology +
direct/indirect intervention split) each need a **new engine kind**, not a parameter change; Turin
(PRG, DM 1444 zone-letters if confirmed) is the cheapest candidate. See `../CITIES/` for per-pilot
stubs and `../it-<region>/<istat>-<city>/` for the existing RATE dossiers.

---

## 5 — Recommended code structure

```
packages/site-parcel-data/italy/
├── cadastral/
│   └── agenziaEntrate.ts          // ONE national ItalyCatastoProvider (WFS, VERIFIED-LIVE)
├── heights/
│   ├── lombardia.ts               // DBT / LiDAR nDSM adapter
│   ├── piemonte.ts                // ARPA Edifici 3D adapter
│   ├── veneto.ts                  // IDT DBT / LiDAR adapter
│   └── …                          // one adapter per region, added as probed
├── envelopes/
│   ├── lombardia/milano.ts        // PGT territorial-index + perequation kind
│   ├── emilia/bologna.ts          // PUG kind (best pilot)
│   ├── piemonte/torino.ts         // PRG zone-letter kind (contingent)
│   └── lazio/roma.ts              // PRG tessuto + direct/indirect kind
└── italy-municipality-registry.json
```

The cadastral provider is **national and singular** — do NOT build per-region parcel providers. Only
heights and envelopes are per-region / per-city. This mirrors the existing
`packages/site-parcel-data/src/parcelProviders/registry.ts` pattern: one national cadastral entry per
country, added as a data addition.

### 5.1 `italy-municipality-registry.json` schema

```jsonc
{
  "015146": {                            // ISTAT codice comune (6-digit) = join key
    "istat": "015146",
    "name": "Milano",
    "region": "it-lom",                  // region ISO folder / routing key
    "parcelProvider": "agenzia_entrate", // ALWAYS agenzia_entrate (national)
    "heightProvider": "lombardia_lidar", // regional height adapter id
    "planningProvider": "PGT"            // instrument type → envelope pack kind
  },
  "037006": {
    "istat": "037006", "name": "Bologna", "region": "it-emr",
    "parcelProvider": "agenzia_entrate", "heightProvider": "emilia_lidar", "planningProvider": "PUG"
  },
  "001272": {
    "istat": "001272", "name": "Torino", "region": "it-pie",
    "parcelProvider": "agenzia_entrate", "heightProvider": "piemonte_arpa", "planningProvider": "PRG"
  },
  "058091": {
    "istat": "058091", "name": "Roma", "region": "it-laz",
    "parcelProvider": "agenzia_entrate", "heightProvider": "lazio_lidar", "planningProvider": "PRG"
  },
  "048017": {
    "istat": "048017", "name": "Firenze", "region": "it-tos",
    "parcelProvider": "agenzia_entrate", "heightProvider": "toscana_lidar", "planningProvider": "PUC"
  }
}
```

`parcelProvider` is `agenzia_entrate` for every mainland comune (the two AP cadastres — Trento,
Bolzano — are excluded from the national WFS and need their own integration). `heightProvider` and
`planningProvider` are the per-region / per-city axes.

---

## 6 — Implementation order

| Sprint | Deliverable | Gate |
|---|---|---|
| **1** | `ItalyJurisdictionResolver` + `ItalyCatastoProvider` + `ItalyTerrainProvider` | Parcel selection works nationally (Catasto VERIFIED-LIVE + TINITALY live) |
| **2** | OSM bake + TINITALY tiles + regional LoD2 importer | Context + terrain seat |
| **3** | `ItalyHeightAdapter` (DSM − DTM → P90) | Regional heights probed per pilot region |
| **4** | Envelope packs: Milano / Bologna / Torino / Roma | Per-city NTA sourced + L-449 sign-off |

**City priority (Phase 1):** Milano ★★★★★ (Lombardia PGT + DBT + LiDAR) · Bologna ★★★★★ (best
pilot — Emilia DBTR + PUG) · Torino ★★★★★ (Piemonte SDI + PRG) · Roma ★★★★ (huge; PRG + Municipio
subdivision + heritage) · Firenze ★★★★ (Piano Operativo + vincoli). Then the top-20 metros.

---

## 7 — What must be probed before any of this ships

- Catasto WFS field schema for production use (VERIFIED-LIVE for GetFeature; wire-in still pending).
- Each regional height endpoint (field names, licence, nDSM reliability) — see `../sources/SOURCES.md §B`.
- Each pilot city's plan NTA (the envelope rules themselves) — the 65%-of-effort planning-rule
  extraction; human-gated sourcing.
- SITAP/APAR + Vincoli public WFS access (heritage overlay is `corroborated` max, never `certified`).

**Related:** `ITALY-MASTER-DATA-SOURCE-STUDY.md` · `../ITALY-GEOSPATIAL-DATA-INVENTORY.md` ·
`../topics/buildings-lod-height.md` · `../CITIES/` · `../regions/README.md`.
