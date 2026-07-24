# Saudi Arabia — water bodies and flood zones (context data)

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH OUTLINE — no confirmed open
national flood product; flood risk is a real regulatory concern (Jeddah wadis); reachable layers are DEM-
derived + global fallbacks

---

## Why this layer matters in Saudi Arabia

Saudi Arabia is arid, so permanent surface water is minimal — but **flash flooding (السيول) is a first-order
hazard**, especially in Jeddah, where wadis draining the coastal escarpment meet dense impervious urban
fabric. The November 2009 Jeddah flood (90+ mm in ~4 hours) caused major loss of life and is the reference
event in a large academic flood-mapping literature. Amanat Jeddah's own mandate explicitly includes *"rainwater
drainage and preventing the dangers of flash floods."* ⇒ **Flood exposure is a genuine pre-condition to check
before shipping an envelope for a wadi-adjacent parcel**, even though the residential decision itself does not
carry a structured flood field.

---

## National water / flood data sources

| Source | Content | Access | Licence | Confidence |
|---|---|---|---|---|
| **GEOSA National Geoportal — hydrography** | National water bodies, wadis, coastline | **Licensed** (NGC policy) | GEOSA licence | `TBD` — exists, not open |
| **Amana stormwater / drainage GIS** (e.g. Amanat Jeddah) | Municipal drainage networks, flood-prone points | Municipal; not a confirmed open feed | Municipal | `TBD` |
| **Copernicus DEM GLO-30** | 30 m global DEM — the basis for flow-direction / drainage / flood-extent modelling | Free, global, KSA covered (AWS Open Data, OpenTopography) | Copernicus licence | `published` — **the reachable terrain basis** |
| **ALOS AW3D30 / SRTM** | Alternative global 30 m DEMs | Free | Open | `published` — fallback to Copernicus |
| **ESA WorldCover — water class** | 10 m water-body classification | Free (ESA) | CC BY | `published` |
| **OpenStreetMap Saudi Arabia** | Wadis, coastline, water bodies, drainage (`waterway`, `natural=water`, `natural=coastline`) | Free, ODbL | ODbL | `published` — the practical hydrography layer |
| **Academic Jeddah flood studies** | HEC-RAS 2D flood-hazard models validated against the Nov-2009 event (Wadi Qows and others) | Published papers (Springer, ScienceDirect) | Academic | `corroborated` — research-grade, not an operational per-parcel feed |

---

## Flood zones (السيول / flash-flood hazard)

Unlike Norway (NVE publishes authoritative regulatory 10/100/200/500-year flood-extent polygons as free
WMS/WFS, feeding pbl. §28-1 building approvals), **Saudi Arabia has no confirmed open national flood-zone
product** reachable from outside SA. What exists:

- **GEOSA / Amana hydrology layers** — likely hold flood-hazard geometry, but licensed / municipal, not open.
- **Academic HEC-RAS models** — high-quality but city/wadi-specific, research-grade, not a national per-parcel
  feed.
- **DEM-derived modelling** — the reachable path: derive flow accumulation, drainage, and approximate flood
  extent from Copernicus GLO-30 where no official zone is available.

⇒ **Flood-zone status is `TBD` at the national level (no open regulatory product) and derivable from a global
DEM as a research-grade approximation.** For a wadi-adjacent Jeddah parcel, surface a flood-exposure caveat
from the DEM-derived model; never assert an official flood-zone verdict from a source you could not reach.

---

## Regulatory link

The 2024 MOMRAH residential decision does not carry a structured flood/hazard field, and total building height
is measured *from the pavement/rasant at the main entrance* (§2) — a terrain-referenced datum that intersects
with drainage and flood grading. The Saudi Building Code (referenced as the decision's parent, م/43) and the
Amana's own drainage requirements are the operative flood-control instruments, not the residential decision
itself. ⇒ **Flood is a context + Amana-approval concern, not a residential-envelope parameter** — render/flag
it for context; do not derive an envelope rule from it.

---

## Recommended approach

1. **Coastline / water bodies (context):** OSM (`natural=coastline`, `natural=water`) + ESA WorldCover water
   class — both free, KSA covered.
2. **Wadis / drainage (context):** OSM `waterway` + Copernicus GLO-30 flow-accumulation derivation.
3. **Flood exposure (pre-condition):** DEM-derived approximate extent (Copernicus GLO-30); surface as a
   research-grade caveat for wadi-adjacent parcels. Treat GEOSA/Amana flood layers as a `TBD` upgrade
   contingent on a data agreement or in-SA egress.
4. Never present a DEM-derived flood extent as an official flood-zone verdict.

---

**Open questions / unverified** (not for `SOURCES.md`):
- Whether GEOSA or any Amana publishes an *open* flood-hazard polygon layer (licensed/municipal model
  confirmed; open tier not established).
- Whether the Saudi Building Code (م/43) mandates a specific flood-setback or freeboard that would become an
  envelope input for wadi-adjacent parcels (not read in this pass — the residential decision references the
  SBC but does not reproduce a flood rule).
