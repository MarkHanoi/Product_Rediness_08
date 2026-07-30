# New York City — City Atlas (`us/CITIES/NEW_YORK_CITY.md`)

**State:** New York (`us-ny`) · **FIPS place:** 3651000 · **Adapter family:** `NYC*Provider` ·
**Routing key:** BBL (Borough-Block-Lot) · **Analogue:** Berlin (richest data, highest complexity)
**Readiness:** 9.5 (CONVERGENT-SECONDARY · unprobed) · **Last updated:** 2026-07-30
**Confidence (whole file):** CONVERGENT-SECONDARY (not probed — **pending-probe**).
**No RATE % cell is asserted here.**

> **The flagship.** NYC's **MapPLUTO** is the closest thing in the US to a *complete PRYZM
> dataset in a single layer* — tax-lot polygons + zoning district + building footprint + FAR +
> land-use + lot area. This doc is the architecture/data-source layer; the **scored** face is
> the dossier at [`../us-ny/3651000-new-york-city/`](../us-ny/3651000-new-york-city/README.md)
> (this atlas does not edit that dossier).

---

## 1 — Why NYC is the flagship

MapPLUTO (NYC Dept. of Finance + Dept. of City Planning) merges the tax-lot geometry (PLUTO)
with the zoning + land-use + FAR attributes into **one authoritative layer keyed by BBL**. In
most US cities these live in 4–6 separate datasets that must be joined; NYC ships them pre-joined.
That single-layer completeness is why NYC scores 9.5 and anchors Wave 1.

---

## 2 — Data sources (CONVERGENT-SECONDARY · pending-probe)

### 2.1 Parcels + zoning + FAR + land-use — **MapPLUTO** ★★★★★
| Aspect | Value |
|---|---|
| What | Tax-lot polygons + zoning district(s) + building footprint + FAR + land-use + lot area, one layer |
| Owner | NYC Dept. of Finance + Dept. of City Planning |
| Key fields | `BBL`, `ZoneDist1`–`ZoneDist4`, `Overlay1/2`, `SPDist1`–`3`, `LandUse`, `LotArea`, `BldgArea`, `NumFloors`, `ResidFAR`, `CommFAR`, `FacilFAR`, `BuiltFAR`, `MaxAllwFAR` |
| CRS | **EPSG:2263** (NAD83 / NY Long Island ftUS) → 4326 → ENU |
| Access | ArcGIS REST feature service + NYC Open Data (Socrata) API + bulk shapefile/GeoDatabase |
| Reverse lookup | **coord → BBL YES** (spatial query on the feature service) |
| Confidence | CONVERGENT-SECONDARY — **pending live probe** of the REST endpoint + `MaxAllwFAR` semantics |

### 2.2 Buildings / footprints + height ★★★★★
- **NYC Building Footprints** + **NYC 3D Building Model** — footprint + height + year + building
  class + **BIN**; GeoJSON / SHP / CityGML (LOD2). Near-100% city coverage.
- Height field present (not modelled) — a strength few US cities share.

### 2.3 Terrain
- City LiDAR (NYC DoITT) → **USGS 3DEP** national fallback ([`../DATASETS/USGS_3DEP.md`](../DATASETS/USGS_3DEP.md)); LAZ / GeoTIFF.

### 2.4 Orthophoto ★★★★★
- NYC DoITT / NYS GIS 3–6 inch imagery; WMTS / WMS.

### 2.5 Zoning map (rules) ★★★★★
- **NYC DCP Zoning Map** — base districts + commercial overlays + special purpose districts +
  FAR + height. Also structured access via **ZOLA** (Zoning & Land Use Application) and **ZAP**.

---

## 3 — Zone taxonomy (NYC-specific)

- **Residential** `R1-1`…`R10H`; **Commercial** `C1-1`…`C8-4`; **Manufacturing** `M1-1`…`M3-2`.
- **Contextual suffix** `-A`/`-B`/`-X` (street-wall + height-factor rules instead of FAR+SEP).
- **80+ Special Purpose Districts (SPDs)** overlay the base zone — the NYC analogue of LA's
  Specific Plans; individually adopted, may supersede base numerics.

---

## 4 — Adapter design

```
NYCParcelProvider    coord | BBL → tax-lot polygon + LotArea + BBL         (MapPLUTO REST)
NYCZoningProvider    BBL → ZoneDist1..4 + Overlay + SPDist + *FAR fields    (MapPLUTO / ZOLA)
NYCEnvelopeProvider  zoning + BBL → massing via FAR + Sky Exposure Plane    (NYC rule pack)
```

**Envelope automatability ★★★★☆:**
- **Automatable:** FAR (`MaxAllwFAR` / `ResidFAR` / `CommFAR`), lot coverage, absolute height
  where the district sets one → a first-order FAR-extrusion massing.
- **PARTIAL (text interpretation):** Sky Exposure Plane setbacks, special-district overrides,
  floor-area bonuses (Inclusionary Housing, POPS), and **TDR / air-rights** — none derivable
  from the base zone code alone (P1 legal-structure trap).

**Pipeline:** `coord → NYCParcelProvider → BBL → MapPLUTO → zoning district → NYC rule pack →
envelope → 3D massing`.

---

## 5 — Traps (P1)

- **`MaxAllwFAR` semantics** — does it already fold in bonus potential, or only base FAR? Probe
  before trusting it as *the* number.
- **SPD coverage fraction** — significant in Manhattan / major corridors; base-zone answer is
  wrong for SPD parcels.
- **TDR / air rights** — parcel-specific, recorded in BSA/ZAP; no automated query returns them.

---

## 6 — Links

- **Scored dossier (do not edit here):** [`../us-ny/3651000-new-york-city/README.md`](../us-ny/3651000-new-york-city/README.md)
  · [`ENVELOPE.md`](../us-ny/3651000-new-york-city/ENVELOPE.md) · [`HEIGHT.md`](../us-ny/3651000-new-york-city/HEIGHT.md)
- **National architecture:** [`../USA.md`](../USA.md) · **Atlas index:** [`./README.md`](./README.md)
- **National fallbacks:** [`3DEP`](../DATASETS/USGS_3DEP.md) · [`FEMA flood`](../DATASETS/FEMA_FLOOD.md) (NYC waterfront SFHA) · [`NHD`](../DATASETS/NATIONAL_HYDROGRAPHY.md)

## 7 — Pending-probe checklist
- [ ] MapPLUTO ArcGIS REST endpoint + `MaxAllwFAR` semantics probed live
- [ ] coord → BBL reverse lookup verified against a known lot
- [ ] SPD coverage fraction measured (Manhattan)
- [ ] ZOLA/ZAP structured FAR/height confirmed machine-readable
- [ ] 3DEP / city-LiDAR tile availability confirmed for the boroughs

**Honesty:** all of §2–§6 is CONVERGENT-SECONDARY (not probed). NYC moves off "unprobed" only
when MapPLUTO is probed live and wired as `NYCParcelProvider`/`NYCZoningProvider`; the envelope
stays not-assessed until the NYC rule pack exists.
