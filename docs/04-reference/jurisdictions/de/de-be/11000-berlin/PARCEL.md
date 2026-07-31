# Berlin (11000) — PARCEL (ALKIS Berlin)

> **Captured:** 2026-07-31 · **Source:** founder research.

The parcel is the **spine** of the buildability answer: the answer attaches to a **Flurstück**, and the applicable B-Plan is found by point-in-polygon of the parcel against the plan extent. ALKIS must be wired before the B-Plan join.

---

## Source

- **Service:** ALKIS Flurstücke, GDI-BE / FIS-Broker.
- **Endpoint:** `https://gdi.berlin.de/services/wfs/alkis_flurstuecke` (VERIFIED-per-founder) — also reachable via base `https://gdi.berlin.de/services/wfs` (feature-type name to lock via GetCapabilities).
- **Protocol:** WFS (assume 2.0.0; PROBE-REQUIRED).
- **CRS:** EPSG:25833 (VERIFIED).
- **Coverage:** complete Berlin. Edge cases: railway / water / public-space / merged (re-parcelled) Flurstücke.
- **Licence:** DL-DE Zero 2.0 (founder) / DL-DE BY 2.0 for GDI-BE broadly per `de/LAND-REGISTRY.md` — **flag, verify per-service.**

## Identity

- **parcelId concept:** Flurstück = Gemarkung / Flur / Flurstück.
- **parcelIdField:** `flurstueckskennzeichen` (AAA/ALKIS id) — **exact field name PROBE-REQUIRED.**
- **administrative keys:** `gemarkung`, `flur`, `zaehler`, `nenner`.

## Quality

- Survey-grade cadastral geometry.
- **`ownershipBoundary: false`** — ⚠ ALKIS is NOT a substitute for the ownership register (Grundbuch). It is the cadastral geometry/id spine only.

## Joins

- **parcel → plan:** point-in-polygon (parcel vs B-Plan `SpatialPlan` polygon) → applicable `planid`.
- **parcel → building:** LoD2 CityGML / ALKIS Gebäude (existing built form — context only).

---

**Related:** `gis/parcel-source.json` · `gis/alkis-source.json` · `gis/bplan-source.json` · `gis/lod2-source.json`
