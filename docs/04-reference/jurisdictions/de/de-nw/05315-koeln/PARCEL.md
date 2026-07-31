# Köln / Cologne (`05315`) — PARCEL (PART B: cadastral data layer)

**Country:** `de` · **Land:** Nordrhein-Westfalen (`de-nw`) · **AGS:** `05315000` ·
**C63 axis:** PARCEL · **C57:** Parcel Data Layer · **Last updated:** 2026-07-31 ·
**Status:** RESEARCH CAPTURE — parcel source identified (ALKIS NRW, open); exact Köln endpoint
PENDING PROBE.

> **§CONTEXT-DATA-HONESTY.** An OSM building footprint is **NEVER** a legal parcel answer. If ALKIS
> is not reachable for a point, the correct output is a typed *not-queried* / *adapter-limitation*
> unknown — never a footprint dressed up as a parcel. (See MEMORY: footprint-fallback is capped low
> by construction, C57 §L-640.)

---

## 1 — Parcel source (ALKIS NRW)

| Attribute | Value | Confidence |
|---|---|---|
| `hasOpenSource` | **yes** | CONVERGENT (per `../../LANDS/NORDRHEIN-WESTFALEN.md`, `../../LAND-REGISTRY.md` row 10) |
| Provider | Geobasis NRW / GDI-NW (IT.NRW) | CONVERGENT |
| Protocol | **WFS / OGC API Features** | CONVERGENT |
| Auth | **none** (open) | CONVERGENT |
| CRS | **EPSG:25832** (ETRS89 / UTM 32N, west zone) | CONVERGENT (Land-native) |
| `parcelId` | **Flurstück** = `Gemarkung` / `Flur` / `Flurstück` (national ALKIS Objektartenkatalog) | CONVERGENT |
| Coverage | **full NRW** (Köln included) | CONVERGENT |
| Grade | **survey-grade** | CONVERGENT |
| Licence | **DL-DE Zero 2.0** (open, attribution-free) | CONVERGENT |
| Reverse coordinate lookup (lat,lon → Flurstück) | available (used by the extraction pipeline point-in-polygon) | CONVERGENT — endpoint PENDING |

> All rows above are **CONVERGENT-SECONDARY** (research-confirmed open, not live-probed for Köln).
> Probe before any of these gate production. The Land file marks NRW cadastre as CONVERGENT while
> only NRW **LoD2** is VERIFIED-LIVE.

### ⚠ PENDING PROBE (not captured)

The following are **not** yet captured and MUST be probed before wiring:

- **Exact WFS endpoint URL** (ALKIS Flurstück feature service, GDI-NW / `opengeodata.nrw.de`).
- **Exact feature-type name** for the Flurstück layer.
- **Köln bbox** (EPSG:25832) to scope the GetFeature request.
- ALKIS reverse-lookup endpoint exact URL (Land file §20 lists this as an outstanding unknown).

These are `PENDING PROBE` — see `EXTRACTION-PIPELINE.md §Pilot` and `RATE.md §Next probe`.

---

## 2 — Buildings & height (LoD2, not OSM)

| Attribute | Value | Confidence |
|---|---|---|
| Source | **NRW LoD2-DE CityGML** (`opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/`) | **VERIFIED-LIVE** (2026-07-24) |
| Height fields | `measuredHeight`, `traufhoehe` (eaves), `firsthoehe` (ridge), roof planes (3D) | VERIFIED-LIVE (roof geometry present) |
| Use | Physical building model + true height. **No DSM / P90 sampling needed** — LoD2 carries height directly. | VERIFIED-LIVE |

**OSM footprints are FORBIDDEN as a legal parcel answer.** OSM may only ever be a *context* layer
(neighbours), never the parcel or the building-of-record height for the subject site.

---

## 3 — Terrain (rasant note)

NRW DGM1 (1 m LiDAR) supplies terrain. The BauO NRW height determinant (and any B-Plan height in
`m`) is measured from the **rasant** (ground reference at the façade / defined reference point), not
a single block-centroid sample. Sampling one point at the block centroid is a known **legal defect**
(MEMORY: "terrain/rasant is a legal defect", L-584) — capture the DTM at the façade line.

---

## 4 — PARCEL axis readiness (honest)

Parcel **source** is open and survey-grade (ALKIS NRW, DL-DE Zero 2.0) — the strongest German
parcel position after the LoD2 anchor. But **no Köln parcel has been queried**; the axis is
`not-assessed` (`not-queried`) until the WFS endpoint is probed and a `computeParcelConfidence`
sample is run. Confirmed-open ≠ confirmed-wired.

---

**Related:** `SOURCES.md §B` · `EXTRACTION-PIPELINE.md` (parcel → B-Plan intersection) ·
`../../LANDS/NORDRHEIN-WESTFALEN.md` · `RATE.md`.

*Last updated: 2026-07-31. Authority: [C57](../../../../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md).
Founder research capture; exact Köln ALKIS endpoint PENDING PROBE.*
