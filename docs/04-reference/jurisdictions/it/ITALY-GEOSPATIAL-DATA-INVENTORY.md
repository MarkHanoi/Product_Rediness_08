# Italy (`it`) — Geospatial Data Inventory

**Status:** RESEARCH FOLD — captured geospatial study of 2026-07-30 · **Maintainer:** UNASSIGNED ·
**Confidence default:** `CONVERGENT-SECONDARY` for every row **except** the two flagged
`VERIFIED-LIVE` / `live` (Agenzia Entrate Catasto WFS and TINITALY DEM). ·
**Scope:** national + regional layer catalogue that feeds the parcel / terrain / height / context /
envelope pipeline.

> **§CONTEXT-DATA-HONESTY.** Two rows in this inventory are independently probe-confirmed and are
> flagged distinctly: the **Agenzia delle Entrate INSPIRE Catasto WFS** (`VERIFIED-LIVE 2026-07-24`,
> Rome H501 / Milan F205 parcels returned) and **TINITALY DEM** (INGV, `live`). **Every other row is
> `CONVERGENT-SECONDARY`** — corroborated across sources but not live-probed in this pass; each must be
> live-probed before it gates production or moves a readiness figure. "Something free and technically
> real almost always exists in Italy, but it always carries one of three caveats — *not current*,
> *not legally certifying*, or *not publicly accessible past the general-cartography layer*"
> (`findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §D.9`). This inventory does not restate or alter any
> RATE % cell — those live only in the RATE dossiers.

---

## 1 — Architecture headline

**ONE national `ItalyCatastoProvider` (Agenzia delle Entrate) + regional height/context adapters +
municipal envelope packs.** Italy is **Spain-like for parcels** (a single national keyless cadastre,
exactly the shape of `catastroParcelProvider` in
`packages/site-parcel-data/src/parcelProviders/registry.ts`), **NOT Germany-like** (no per-region
parcel providers to build). Wiring the national Catasto WFS as a `kind: 'cadastral'` jurisdiction in
that registry flips parcel selection ON nationally in one data addition — the same move that turned on
Spain, France, NL, NO, CH, DK.

The fragmentation Italy does have sits **above** the cadastre, in the height and planning layers:
regional LiDAR / LoD2 for heights, and per-municipality planning instruments (PRG / PGT / PSC / PUC /
PUG) for the buildable envelope. Those are adapters and packs, not parcel providers. See
`findings/ITALY-HEIGHT-ENVELOPE-STUDY.md` for the height + envelope model.

```
coordinate
  → ItalyJurisdictionResolver (ISTAT: Region → Province → Comune)
      → ItalyCatastoProvider  (Agenzia Entrate WFS)         ── national, VERIFIED-LIVE
      → ItalyTerrainProvider  (TINITALY DEM → Copernicus)   ── national, live
      → ItalyHeightAdapter    (regional LiDAR nDSM / LoD2)   ── regional, CONVERGENT-SECONDARY
      → ItalyContextAdapter   (regional DBT / OSM)           ── regional, CONVERGENT-SECONDARY
      → MunicipalEnvelopePack  (PRG/PGT/PSC/PUC/PUG rules)   ── per-city, CONVERGENT-SECONDARY
```

---

## 2 — National datasets

| Dataset | Authority | Access | API | Licence | CRS | National? | Prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Catasto parcel geometry (INSPIRE)** | Agenzia delle Entrate — Direzione Centrale Servizi Catastali | Keyless WFS (`owfs01.php`); WMS companion; bulk download since Feb 2025 | **WFS 2.0** (`CP:CadastralParcel`, `CP:CadastralZoning`); pagination `COUNT`+`STARTINDEX` | **CC BY 4.0** | EPSG:6706 (bbox `lat,lon`) | **YES** — all territory except AP Trento + Bolzano | **YES** (wire as cadastral provider) | ✅ **`VERIFIED-LIVE 2026-07-24`** — GetCapabilities + GetFeature returned real parcels for Rome (H501), Milan (F205), Turin (L219) |
| **TINITALY DEM** | INGV (Istituto Nazionale di Geofisica e Vulcanologia) | Free GeoTIFF tiles | Tiled raster download | Free (attribution) | national grid → reproject | **YES** (10 m, whole country) | **YES** (terrain seat) | 🟢 **`live`** — the national terrain anchor; same pipeline slot as ES PNOA |
| **Copernicus DEM (GLO-30)** | ESA / Copernicus | Free download | Raster | Free (Copernicus licence) | EPSG:4326 | YES (30 m, global) | YES (fallback) | `CONVERGENT-SECONDARY` — terrain fallback below TINITALY |
| **PST / SIM terrain (DTM/DSM)** | MASE — Ministero dell'Ambiente | Open-data portal | Raster | CC BY 4.0 | per-tile | Partial — ~50% historical; PNRR target 100% by 2026 (25 cm, ~8 cm vertical) | Not live-probed | `CONVERGENT-SECONDARY` — higher-res than TINITALY where present; terrain/surface only, **not a building model** |
| **ISTAT administrative boundaries** | ISTAT | Free download | Shapefile / GeoPackage | CC BY | routing only | YES (20 Regioni / 107 Province / ~7,900 Comuni) | YES (jurisdiction routing) | `CONVERGENT-SECONDARY` — admin routing key = ISTAT codice comune (6-digit) |
| **RNDT / dati.gov.it / Geoportale Nazionale** | AgID / Presidenza del Consiglio | Federated discovery catalogue | CS-W / metadata | CC BY | — | YES (discovery) | Discovery only | `CONVERGENT-SECONDARY` — *findability*, not structured data |
| **EU INSPIRE Geoportal** | EU (federates Italian regional metadata) | Federated search by comune / plan type | CS-W | — | — | YES (discovery) | Discovery only | `CONVERGENT-SECONDARY` — some hits are raster scans (`Grid`), not vector |
| **OSM building footprints (Italy)** | OpenStreetMap / Geofabrik | ~2.1 GB extract | ODbL download | ODbL | EPSG:4326 | YES (uneven completeness) | Context fallback | `CONVERGENT-SECONDARY` — ~1 M OSM vs ~2.8 M authoritative (Lombardy 2018) |
| **OpenBuildingMap national height** | JRC-derived (GHSL built-up characteristics) | Global download | Raster/vector | Free | — | YES (modeled) | ⚠ modeled only | `inferred — modeled; NOT a legal or surveyed claim` — never at the same tier as regional LiDAR |
| **SITAP / APAR (landscape constraints)** | MiC (Ministero della Cultura) | OGC WMS + WFS (`sitap.cultura.gov.it`) | WFS (public access TBD) | informational | vector | YES (heritage overlay) | Overlay only | `CONVERGENT-SECONDARY` — informational, acknowledged incomplete; a null ≠ certified absence |
| **Vincoli in Rete (listed buildings)** | MiC | Web consult | queryability TBD | informational | — | YES | Overlay only | `CONVERGENT-SECONDARY` |
| **ISPRA environmental (flood / geology / hydrography)** | ISPRA | OGC WMS/WFS | WMS/WFS | CC BY (per layer) | per layer | YES | Overlay only | `CONVERGENT-SECONDARY` — machine-readable; per-layer probe |
| **AGEA orthophotos** | AGEA (national agri-payments agency) | WMS/WMTS | OGC raster | per-programme | national | YES | Context/backdrop | `CONVERGENT-SECONDARY` — complements regional orthophotos |

---

## 3 — Regional height / building datasets

Heights have **no national raster** (Italy is PT-like here). Coverage is regional LiDAR nDSM
(DSM − DTM → P90) or regional LoD2 / DBT. **All rows below are `CONVERGENT-SECONDARY`.** The full
coverage matrix and the height hierarchy live in `findings/ITALY-HEIGHT-ENVELOPE-STUDY.md §2`.

| Region | Building-height dataset | Authority | Access | API | Licence | CRS | Confidence |
|---|---|---|---|---|---|---|---|
| **Piemonte** | ARPA Piemonte Edifici 3D (BDTRE-derived footprints + mean elevation) | ARPA Piemonte | WMS + ArcGIS REST FeatureServer (live-probed endpoint) | WMS / FeatureServer | Regional CC | EPSG:32632 | `CONVERGENT-SECONDARY` — endpoint confirmed; height field name TBD (`QUOTA_MEDIA`/`ALTEZZA`) |
| **Lombardia** | DBT + regional LiDAR; Indagine Offerta PGT (SLP by comune) | Regione Lombardia / ARIA S.p.A. | Geoportale Lombardia | WMS/WFS (endpoint TBD) | Regional CC | per-layer | `CONVERGENT-SECONDARY` — strongest region; schema TBD |
| **Veneto** | DBT + LiDAR; IDT stack | Regione Veneto (IDT) | OGC stack (general public); Quadro Conoscitivo institution-gated | WMS/WFS | Regional CC | per-layer | `CONVERGENT-SECONDARY` — planning layer access-gated |
| **Emilia-Romagna** | DBTR + regional LiDAR | Regione Emilia-Romagna | Full OGC stack (WMS/WFS/WCS/WPS/CS-W) | WMS/WFS | Regional CC | per-layer | `CONVERGENT-SECONDARY` — best pilot infra; zoning layer status TBD |
| **Toscana** | Regional LiDAR nDSM | Regione Toscana | Geoportale | WMS/WFS | Regional CC | per-layer | `CONVERGENT-SECONDARY` — PRG delivered as PDF scans (zoning-as-data negative) |
| **Lazio** | Regional LiDAR / Roma Capitale SIT | Regione Lazio / Roma Capitale | Geoportale | WMS/WFS (TBD) | Regional CC | per-layer | `CONVERGENT-SECONDARY` — no confirmed region-wide 3D-buildings layer |
| Campania | SIT semplificato (edifici) | Regione Campania | WebGIS | login-gated per comune | non-evidentiary | per-layer | `CONVERGENT-SECONDARY` — "study purposes only" disclaimer |
| Sicilia | Regional LiDAR / DBT | Regione Sicilia | Geoportale | WMS/WFS (TBD) | Regional CC | per-layer | `CONVERGENT-SECONDARY` — weaker coverage |

**Height-source precedence (best → weakest):** `lod2` → `lidar_ndsm` (DSM − DTM → P90) →
`osm_levels` → `assumed`. `heightSource` must be stamped on every building; a modeled/OSM value must
never be presented at the surveyed tier.

---

## 4 — Regional LoD2 / DBT (context geometry)

| Layer | Where | Access | Confidence |
|---|---|---|---|
| Lombardia DBT / CityGML | Geoportale Lombardia | WMS/WFS | `CONVERGENT-SECONDARY` |
| Emilia-Romagna DBTR | Regional geoportal | full OGC | `CONVERGENT-SECONDARY` |
| Piemonte BDTRE | ARPA / regional SIT | WMS/REST | `CONVERGENT-SECONDARY` |
| Veneto / Toscana / Lazio DBT | Regional geoportals | WMS/WFS | `CONVERGENT-SECONDARY` |
| OSM (national fallback) | Geofabrik | ODbL extract | `CONVERGENT-SECONDARY` — object-level; uneven |

---

## 5 — Readiness (study estimates — NOT RATE cells)

These are the captured-study readiness estimates. **They are engineering readiness notes, not RATE %
cells**, and do not touch any RATE dossier:

| Layer | Study estimate |
|---|---|
| Admin routing | 95–100% |
| Parcels | 90–95% (Catasto VERIFIED-LIVE) |
| Terrain | 95% (TINITALY live) |
| Context (buildings/roads) | 85–100% |
| Orthophotos | 80–85% |
| Buildings (LoD/height) | 75% (regional) |
| Heights (permitted/existing) | 60–65% (regional patchwork) |
| Envelope (planning rules) | 20–25% (per-city packs) |

**Investment split:** ~10% cadastre · ~25% height + context harvesting · ~65% planning-rule
extraction. The bottleneck is municipal planning, not the cadastre.

**Country comparison:** ES parcel🟢 / height🟢 / env🟡 · PT 🟢/🟡/🔴 · DE 🟡/🟢/🔴 ·
**IT 🟢/🟡/🔴** — cadastre SOLVED, bottleneck = municipal planning.

---

## 6 — Sources

Per-field national citations remain in `sources/SOURCES.md` (updated with a pointer to this
inventory). This inventory is the layer-catalogue companion to that citation ledger; the two flagged
live rows here (Catasto WFS, TINITALY) match the `✅`-annotated rows in SOURCES.md §A.

**Related:** `findings/ITALY-MASTER-DATA-SOURCE-STUDY.md` (full legal-mechanism study) ·
`findings/ITALY-HEIGHT-ENVELOPE-STUDY.md` (height + envelope model + code structure) ·
`topics/buildings-lod-height.md` · `regions/README.md` · `CITIES/` (Phase-1 pilot stubs) ·
`packages/site-parcel-data/src/parcelProviders/registry.ts` (where the Italy provider gets wired).
