# Germany — National Geospatial Architecture (Federation Atlas)

**Level:** country · **ISO 3166-1:** `DE` · **Join key:** AGS (Amtlicher Gemeindeschlüssel, 8-digit) ·
**Subdivision law:** 16 Länder (ISO 3166-2 `de-<subdiv>`) · **Last updated:** 2026-07-30 ·
**Maintainer:** UNASSIGNED · **Status:** RESEARCH ATLAS — probe-gated

> **Confidence banner (§CONTEXT-DATA-HONESTY):** every claim in this atlas is
> **CONVERGENT-SECONDARY** (multiple official/expert sources, NOT live-probed) **EXCEPT one**:
> **NRW LoD2 CityGML open download is VERIFIED-LIVE** (`opengeodata.nrw.de`, probed 2026-07-24).
> That is the single wire-first anchor. Nothing else here may move a `RATE.md` cell until the
> specific Land's service is probed live and wired. Failure and empty are the same value — ship
> the probe before the fix.

---

## 1 — The headline: Germany has NO federal cadastre

Germany is a **federated geodata ecosystem**, not a centralised one. National *standards* exist;
national *services* do not.

| Dimension | National? |
|---|---|
| Data standards (AAA-Modell: AFIS / ALKIS / ATKIS) | ✅ YES — one schema, 16 implementations |
| Data schema / object catalogue (ALKIS Objektartenkatalog) | ✅ YES |
| National identifiers (AGS, Flurstückkennzeichen) | ✅ YES |
| National routing boundaries (VG250, BKG) | ✅ YES |
| National **API** (one endpoint for parcels/buildings) | ❌ NO — per-Land |
| National **licence** (one uniform grant) | ❌ NO — per-Land (DL-DE Zero / DL-DE BY / CC-BY) |
| National **auth** model | ❌ NO — per-Land (anonymous / registration / fee) |

**Consequence for architecture:** the top object is a **router**, not a monolithic provider:

```
lon/lat  →  GermanyBoundaryResolver (VG250 polygon → AGS → Land)
         →  provider registry  →  { NRWProvider, BerlinProvider, BayernProvider, … }
```

`GermanyParcelProvider → resolveLand() → per-Land ALKIS provider`. The `AbstractALKISProvider`
is written **once** (one national ALKIS schema); each Land subclass overrides only
`endpoint / auth / CRS / reverse-lookup`. Everything downstream of `ParcelFeature` is identical
to the Barcelona replication model.

---

## 2 — The three AdV national models (AAA-Modell)

The Arbeitsgemeinschaft der Vermessungsverwaltungen (AdV) defines three interlocking standards.
Each is a national *standard* that each of the 16 Länder implements and operates independently.

| Model | Scope | Maturity | PRYZM use |
|---|---|---|---|
| **AFIS** — Amtliches Festpunktinformationssystem | Geodetic survey control (ETRS89 + DHHN2016 height datum) | ★★★★★ | CRS / datum authority. Not queried per-parcel; anchors every transform. |
| **ALKIS** — Amtliches Liegenschaftskatasterinformationssystem | Cadastre — `Flurstück` (parcel) + `Gebäude` (building footprint) | ★★★★☆ | Parcel geometry, building footprints, `Gebäudefunktion` (use), `traufhoehe`/`firsthoehe` (LoD1 height fallback). Per-Land WFS/OGC-API. |
| **ATKIS** — Amtliches Topographisch-Kartographisches Informationssystem | Topography / context (Basis-DLM, DGM, DOP) | ★★★★★ | Roads, water, land-use, terrain (DGM), orthophotos (DOP). Per-Land, one object catalogue. |

---

## 3 — National routing layer (build FIRST — Phase 0)

Routing is the one genuinely national, genuinely easy layer (★★★★★, difficulty VERY LOW).

- **VG250** (BKG — Bundesamt für Kartographie und Geodäsie): Verwaltungsgebiete 1:250 000, carries
  the AGS down to Gemeinde level. Download + WFS, EPSG:25832 / 4326.
  Licence **Datenlizenz Deutschland – Namensnennung 2.0** (DL-DE BY 2.0). CONVERGENT-SECONDARY.
- **AGS** (Amtlicher Gemeindeschlüssel, 8-digit) is the join key — the German analogue of
  PT DICOFRE / FR INSEE / EU LAU. **Landkreis = first 5 digits**; Land = first 2.
- Flow: `coordinate → VG250 polygon → AGS → Land → that Land's ALKIS/DGM/DOP/LoD2 endpoints`.
  No parcel call is made before this resolves.

---

## 4 — CRS (clean, two-zone)

| Zone | EPSG | Where | Notes |
|---|---|---|---|
| ETRS89 / UTM 32N | **25832** | Western Länder (roughly west of 12°E) | NRW LoD2 tiles are 25832 (verified context) |
| ETRS89 / UTM 33N | **25833** | Eastern Länder (Berlin, Brandenburg, Sachsen, Mecklenburg-Vorpommern) | |
| Gauss-Krüger (DHDN) | 31466–31469 | **legacy only** | do not target; transform on ingest |

Height datum: **DHHN2016** (NHN, normal heights) via AFIS. Transform chain: native UTM → WGS84 → ENU.
Per-Land CRS assignment in this atlas is CONVERGENT-SECONDARY (the ~12°E boundary is not sharp;
a few Länder straddle it — probe the actual service CRS before wiring).

---

## 5 — Licensing model (per-Land, MESSY)

Licence is a **per-Land property**, never a national constant:

| Licence | Meaning | Example Länder (CONVERGENT-SECONDARY) |
|---|---|---|
| **DL-DE Zero 2.0** | Public domain, no attribution | NRW open geodata (the VERIFIED-LIVE anchor) |
| **DL-DE BY 2.0** | Attribution required | VG250 (BKG); GDI-BE (Berlin/Brandenburg) |
| **CC-BY 4.0** | Attribution required | several Land geoportals |
| State licence / fee / registration | Access-gated | Länder not yet opened |

---

## 6 — Legal envelope layer (the expensive one)

Technical geodata is a **Land** responsibility; the buildable **envelope** is a **municipality**
responsibility. This atlas separates them by design (`LANDS/` = technical, `CITIES/` = legal):

```
BauGB (federal) → BauNVO (federal zone taxonomy + §17 ceilings)
   → Bebauungsplan (municipal, §30 — the binding instrument)
   → §34 (unplanned interior — reasoned REFUSAL, no numeric table)
   → §35 (outlying — presumptively not buildable)
   → Landesbauordnung (per-Land: Abstandsflächen multiplier/minimum)
```

Envelope rules score ★☆☆☆☆ — municipality-by-municipality, like Barcelona. This is the only
expensive phase. The regime classifier (§30 / §34 / §35) must be built before any numeric sourcing.
Full national legal structure lives in `README.md §1`; per-city legal work lives in `CITIES/`.

---

## 7 — Staged implementation roadmap

| Phase | Layer | Difficulty | Note |
|---|---|---|---|
| **0** | National routing (VG250 → AGS → Land) | VERY LOW | prerequisite; no parcel call before it |
| **1** | National context bake (LoD2 primary / OSM fallback; roads/water/parks OSM) | LOW | identical to Barcelona |
| **2** | Terrain (DGM1 → DGM5 → Copernicus DEM 30 m fallback) | LOW-MED | GeoTIFF → quantized mesh → Cesium (Spanish workflow) |
| **3** | Heights — **LoD2 direct** (ridge/eaves/roof), NO DSM sampling; fallback DSM → OSM levels → 9 m | LOW | Germany's edge; skip the nDSM pipeline |
| **4** | Parcels — `AbstractALKISProvider` + per-Land subclass; order NRW → Berlin → BW → Bayern → rest | MED | one schema, 16 endpoints |
| **5** | Orthophotos (DOP10 → DOP20 → Copernicus) | LOW | WMTS/WMS/GeoTIFF |
| **6** | Environmental (flood/Natura2000/forest/soil/water) | MED | national-by-theme, authorities differ |
| **7** | Planning — municipal Bebauungsplan → envelope (XPlanung → PDF → §17 sanity → §34 refusal) | HIGH | the only expensive phase; per-municipality, manual |

---

## 8 — Overall verdict

Germany ≈ the **inverse of Portugal**: PT is centralised-but-sparse; DE is rich-data-but-federated.
Technical pipeline (excl. municipal envelope) scores **8.5–9/10**. The challenge is **service
orchestration, not data quality**. Once the Land-routing abstraction exists, DE maps naturally onto
the Barcelona model; only the legal rule pack stays municipality-specific.

Reference comparison — cadastre / heights:
- **ES** cadastre ★★★★★ / heights ★★★★★ (centralised)
- **PT** cadastre ★★★★☆ / heights ★★★☆☆ (centralised-but-sparse)
- **DE** cadastre ★★★☆☆ (no national API) / **heights ★★★★★** (LoD2-DE true height)

---

## 9 — Files in this atlas

```
de/
├── GERMANY.md                              ← this file (national architecture)
├── GERMANY-GEOSPATIAL-DATA-INVENTORY.md    ← Priority-1..4 dataset tables + precedence honesty model
├── LAND-REGISTRY.md                        ← the 16-Land endpoint/licence/CRS/LoD2/status matrix
├── README.md                               ← country legal umbrella (regimes, BauNVO, XPlanung)
├── LANDS/                                  ← TECHNICAL impl per Land (Land = technical authority)
│   ├── NORDRHEIN-WESTFALEN.md              ← fullest — VERIFIED-LIVE LoD2 anchor
│   ├── BERLIN.md · BAYERN.md               ← populated (convergent / TBD)
│   └── <13 scaffold stubs>                 ← status: unprobed, see LAND-REGISTRY
├── CITIES/                                 ← MUNICIPAL planning/envelope (city = legal authority)
│   ├── Berlin.md · Munich.md               ← link to the de city RATE dossiers
├── sources/SOURCES.md                      ← national data-source citations
├── findings/ · topics/ · regions/          ← existing research
└── de-be/ · de-by/ · de-hh/                ← existing per-city RATE dossiers (Berlin/Munich/Hamburg)
```

---

*Confidence: CONVERGENT-SECONDARY throughout, except NRW LoD2 = VERIFIED-LIVE (opengeodata.nrw.de,
2026-07-24). Extends the three founder studies of 2026-07-30. Do not raise any RATE cell on an
unprobed claim.*
