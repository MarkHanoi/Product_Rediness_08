# United Kingdom — Geospatial Data Inventory

**Level:** country · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED ·
**Status:** RESEARCH INVENTORY — probe-gated

> **Confidence banner (§CONTEXT-DATA-HONESTY):** all rows are **CONVERGENT-SECONDARY**
> (multi-source, NOT live-probed in PRYZM; OS + constituent services NOT wired — audit `gb` ≈ 51%).
> The Confidence column flags each row. An empty result and a failed probe are the same value — probe
> before a `RATE.md` cell moves.

> **⚠ HMLR / INSPIRE honesty (repeat, load-bearing):** the "parcel" rows below are **OWNERSHIP
> extents with GENERAL boundaries** (s.60 Land Registration Act 2002). They are **NOT a survey-grade
> cadastre** and must never be presented as a legal parcel edge. The UK has **no national cadastre**.

Companion files: federation architecture → [`UNITED-KINGDOM.md`](./UNITED-KINGDOM.md); per-country
profiles → [`JURISDICTIONS/`](./JURISDICTIONS/); per-layer badging → 
[`findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md`](./findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md);
citations → [`sources/SOURCES.md`](./sources/SOURCES.md).

Column legend: **National?** = one GB/UK feed vs per-jurisdiction · **prod-ready** = usable in a
production wiring today (Y / N / partial) · **Confidence** = VERIFIED-LIVE · CONVERGENT-SECONDARY.

**CRS note:** GB (England, Scotland, Wales) native CRS is **EPSG:27700 (OSGB36 / British National
Grid)** — a single clean national grid, height datum **ODN (Ordnance Datum Newlyn)**. **Northern
Ireland** is the exception: **Irish Grid (EPSG:29903)** / **Irish Transverse Mercator (EPSG:2157)**,
Malin Head datum. Web ingest via EPSG:4326.

---

## Priority 1 — ownership, routing, planning-as-data

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **HMLR INSPIRE Index Polygons** — freehold **ownership** extents (⚠ general boundaries, NOT cadastre) | HM Land Registry | Download per LPA | ATOM / GML | **OGL v3** | 27700 | ✅ YES (E+W) | partial | CONVERGENT-SECONDARY |
| **HMLR title plans** — registered **ownership** interest (⚠ general boundaries s.60 LRA 2002) | HM Land Registry | Per-title purchase | n/a | HMLR terms | 27700 | ✅ YES (E+W) | N | CONVERGENT-SECONDARY |
| **Registers of Scotland Land Register** — **ownership** (map-based, ⚠ general boundaries) | Registers of Scotland | Portal / per-title | ScotLIS | RoS terms | 27700 | ✅ YES (Scotland) | N | CONVERGENT-SECONDARY |
| **LPS Land Registry NI** — **ownership** (⚠ general boundaries) | Land & Property Services | Portal | LandWeb | LPS terms | 29903 / 2157 | ✅ YES (NI) | N | CONVERGENT-SECONDARY |
| **ONS GSS boundaries** — routing (E/S/W/N → LPA) | ONS / OS | Download / API | Geoportal / WFS | OGL v3 | 27700 / 4326 | ✅ YES | Y | CONVERGENT-SECONDARY |
| **planning.data.gov.uk** — Conservation Areas / Article 4 / listed-building boundary data | MHCLG | API / download | REST | OGL v3 | 4326 | ⚠ aggregating (partial coverage) | partial | CONVERGENT-SECONDARY |
| **NPPF / NPF4 / PPW / SPPS** — national POLICY frameworks (text, not numeric rules) | MHCLG / Scot Gov / Welsh Gov / DfI | Web / PDF | n/a | OGL / Crown | n/a | ⚠ per-jurisdiction | N | CONVERGENT-SECONDARY |
| **LPA Local Plans / LDPs** — envelope rules (⚠ PDF, per-LPA, discretionary) | ~330 LPAs (E) + councils | PDF | n/a | per-LPA | — | ❌ per-LPA | N | CONVERGENT-SECONDARY |

Notes:
- The "parcel" rows are **ownership**, general boundaries — there is **no survey cadastre row** because
  none exists in the UK. This is the structural gap, not an omission.
- **INSPIRE Index Polygons (OGL)** is the only free, national, machine-readable ownership-extent layer
  (freehold index) — the practical routing/footprint-fallback candidate, **badged general-boundary**.

---

## Priority 2 — buildings, roads, greenspace, water, addresses (OS — the UK edge)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **OS MasterMap Topography / OS NGD** — authoritative building + topo polygons | Ordnance Survey | OS Data Hub | OGC API / WMTS / download | OS licensed (Premium/Public Sector) | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **OS Open Buildings / OpenMap Local** — free national footprints | Ordnance Survey | OS Data Hub | Download / API | **OGL v3** | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **OS Open Roads / MasterMap Highways** — centrelines + class hierarchy | Ordnance Survey | OS Data Hub | Download / OGC API | OGL (Open) / OS licensed (Highways) | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **OS Open Greenspace** — parks/sports/cemeteries/allotments/play | Ordnance Survey | OS Data Hub | Download / API | **OGL v3** | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **OS Open Rivers** — watercourse network | Ordnance Survey | OS Data Hub | Download / API | **OGL v3** | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **AddressBase / UPRN** — national property-identifier spine | GeoPlace (OS + LAs) | OS Data Hub | API / download | OS licensed (Open UPRN = OGL) | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **OSNI topographic / greenspace** — NI equivalent (separate agency) | OSNI (LPS) | OpenDataNI / LPS | Download / WMS | OGL / LPS terms | 29903 / 2157 | ✅ YES (NI) | partial | CONVERGENT-SECONDARY |

Notes:
- **OS is the UK's edge** — world-class national topographic mapping. The redistribution trap is the
  **licensed** products (MasterMap, Highways, AddressBase Premium); the **Open** products are OGL v3.
- **OSM = fallback only** for buildings/roads/water — OS/OSNI are authoritative.
- **Northern Ireland is OSNI, not OS**, on the Irish Grid — a separate pipeline.

---

## Priority 3 — terrain, LiDAR / height, forest, flood (multi-agency, per-jurisdiction)

| Layer | Authority | Access | API | Licence | CRS | National? | prod-ready | Confidence |
|---|---|---|---|---|---|---|---|---|
| **EA LIDAR Composite DTM 1 m** — terrain | Environment Agency | WCS / download | WCS 2.0.1 | **OGL v3** | 27700 | ⚠ England (per-jurisdiction) | **Y (terrain, wired London bake)** | **VERIFIED-LIVE (DTM route, 2026-07-25)** / else CONVERGENT-SECONDARY |
| **EA LIDAR Composite DSM 1 m** — height derive (DSM − DTM) | Environment Agency | WCS / download | WCS 2.0.1 | OGL v3 | 27700 | ⚠ England | N (DSM route un-probed) | CONVERGENT-SECONDARY |
| **Scottish Remote Sensing Portal LiDAR** — terrain/height | SEPA / Scot Gov | Portal / download | WMS / download | OGL v3 | 27700 | ⚠ Scotland | partial | CONVERGENT-SECONDARY |
| **NRW LiDAR** — terrain/height | Natural Resources Wales | DataMapWales / download | WMS / download | OGL v3 | 27700 | ⚠ Wales | partial | CONVERGENT-SECONDARY |
| **DAERA LiDAR** — terrain/height | DAERA | OpenDataNI / download | download | OGL v3 | 29903 / 2157 | ⚠ NI | partial | CONVERGENT-SECONDARY |
| **National Forest Inventory (NFI)** — woodland extent (not per-tree) | Forest Research / Forestry Commission | Download | download / WMS | OGL v3 | 27700 | ✅ YES (GB) | partial | CONVERGENT-SECONDARY |
| **EA Flood Map** — flood zones (⚠ separate overlay, not permanent hydrography) | Environment Agency | API / download | REST / WMS | OGL v3 | 27700 | ⚠ England (SEPA/NRW/DAERA elsewhere) | partial | CONVERGENT-SECONDARY |

Notes:
- **LiDAR is multi-agency, project-based** (EA / SRSP / NRW / DAERA), varying resolution / year /
  density → every source carries acquisition metadata. **The DTM is wired for the London bake; the
  DSM sibling (for height derive) is NOT yet live-probed.**
- **No national building-height attribute** → height is DERIVED via the shared nDSM module (DSM − DTM,
  P90). OS Building Heights is a **commercial** attribute, deliberately skipped.
- **Flood ≠ hydrography** — the EA/SEPA/NRW/DAERA flood maps are discretionary refusal overlays.

---

## The layer-precedence honesty model

Each derived answer has an ordered fallback chain. **Every downgrade must be badged in the product;
a fallback value is never presented as authoritative.** Empty and failed are the same value.

### Parcel / ownership geometry
```
HMLR / INSPIRE / RoS / LPS ownership extent (⚠ GENERAL boundary — NOT survey cadastre)  [best available]
  → OS MasterMap topographic footprint  [BADGE: topographic, NOT ownership]
  → OSM footprint                        [BADGE: approximate]
```
> There is NO survey-grade parcel tier in the UK. The top of this chain is ownership-general-boundary,
> never a legal edge. Do not present it as a cadastral parcel.

### Building height
```
EA/SRSP/NRW/DAERA LiDAR nDSM (DSM − DTM, P90)   [primary — DERIVED, carries acquisition metadata]
  → LiDAR roof reconstruction                    [DERIVED]
  → OSM building:levels × storey-height          [BADGE: estimated]
  → fabricated default                           [BADGE: fabricated — last resort]
```
> No national height attribute — nDSM is the robust path. OS Building Heights (commercial) is skipped.

### Envelope / planning rule
```
planning.data.gov.uk / LPA boundary polygons     [REAL — boundaries only, partial coverage]
  → Local Plan / LDP règlement PDF                [PDF — manual/OCR extraction, citation-gated]
  → NPPF / NPF4 / PPW / SPPS national policy       [POLICY text — NOT a numeric parcel rule]
  → discretionary determination                    [reasoned outcome — NO numeric table by law]
```
> GB planning is discretionary — there is no numeric by-right envelope. The output is a reasoned
> determination, not a lookup.

---

## Cross-references / sources

- Federation architecture, national/devolved split → [`UNITED-KINGDOM.md`](./UNITED-KINGDOM.md).
- Per-country profiles → [`JURISDICTIONS/ENGLAND.md`](./JURISDICTIONS/ENGLAND.md) (full) +
  Scotland / Wales / Northern-Ireland stubs.
- Per-layer three-tier badging + comparison →
  [`findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md`](./findings/ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md).
- Greater London RATE dossier (linked, not edited) →
  [`gb-eng/E12000007-london/README.md`](./gb-eng/E12000007-london/README.md).
- Citations → [`sources/SOURCES.md`](./sources/SOURCES.md).

---

*Confidence: CONVERGENT-SECONDARY throughout, EXCEPT the EA LIDAR Composite **DTM** terrain row =
VERIFIED-LIVE (wired London bake, probed 2026-07-25). HMLR / INSPIRE / RoS / LPS = ownership, general
boundaries — NEVER a survey cadastre. No numeric envelope value is verified for any UK parcel. This
inventory changes NO RATE % cell.*
