# Saudi Arabia — roads and pedestrian infrastructure (context data)

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH OUTLINE — national roads
authority located (regulatory, not an open feed); OSM is the reachable network layer; street width feeds the
envelope

---

## Why roads matter more here than in most jurisdictions

Roads are not just context in Saudi Arabia — **street width is a load-bearing envelope input.** The national
setback formula is `max(streetWidth/5, floor)` (§4-1 / §4-2 cl. 4), where عرض الشارع is defined as *"the
horizontal distance between the property boundaries on the two sides of the street"* = **frontage-to-frontage**
(§2). This is exactly what PRYZM's `streetWidth.ts` computes (ray from the block edge across the carriageway
to the opposing parcel ring), so the algorithm ports — but the *inputs* (opposing parcel rings) live in the
geo-fenced Balady parcel service, so on the production path the module has no inputs and the demo takes the
width from the user. See
[`../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §A.3 and
[`../SAUDI-ARABIA-ENTRY-ASSESSMENT.md`](../SAUDI-ARABIA-ENTRY-ASSESSMENT.md) §7.

---

## National road data sources

| Source | Content | Access | Licence | Confidence |
|---|---|---|---|---|
| **Roads General Authority (RGA)** | National road network regulator (formed Aug 2022); oversees construction/operation/maintenance of 200,000+ km (66,000 km intercity) | **Regulatory authority — not a confirmed open GIS feed** | State | `published` (existence); `TBD` (open data) |
| **Balady `Umaps_Click/MapServer/26`** (street) | Per-street geometry + attributes, linked to the parcel service | **geo-fenced** (same WAF as `/28`) | MOMRAH/Balady | `geo-fenced` |
| **OpenStreetMap Saudi Arabia** | Community road + path network; attributes: name, `highway` class, surface, width, lanes | Free, ODbL — HDX export `hotosm_sau_roads` | ODbL | `published` — **the reachable network layer** |
| **HDX HOTOSM Saudi roads** (`data.humdata.org/dataset/hotosm_sau_roads`) | Curated OSM roads export for KSA | Free download | ODbL | `published` — confirmed dataset |
| **GEOSA National Geoportal — transport** | National transport network layers | **Licensed** (NGC policy) | GEOSA licence | `TBD` — exists, not open |

---

## Pedestrian / cycle infrastructure

No confirmed national open pedestrian-network feed. OSM carries `footway`, `sidewalk`, `pedestrian`, and
`cycleway` tags for the major cities; coverage is good in central Riyadh (including the metro/BRT corridors),
Jeddah, and Dammam, and sparse elsewhere. The Balady street service (`MapServer/26`) would carry authoritative
pavement/sidewalk geometry per street but is geo-fenced.

⇒ For a context render of pedestrian infrastructure, **OSM is the practical layer**; treat Balady `/26` as a
`geo-fenced` upgrade contingent on an in-SA egress or data agreement.

---

## Setback implications — the road boundary vs the road centreline

The 2024 MOMRAH decision measures setbacks from the **property boundary** (§2 — *"counted from the start of
the property line"*), and the street width from **frontage-to-frontage** (opposing property boundaries), not
from the carriageway centreline. This matters for the width measurement:

- **`streetWidth` = distance between the two property lines fronting the street** — includes the carriageway
  *and* any pavement/verge inside the property lines. An OSM carriageway-centreline-to-edge measurement will
  **understate** the ordinance width; the correct measurement is boundary-to-boundary (the Balady parcel
  rings, geo-fenced) or a user-supplied width.
- Because the setback uses the width **÷5**, a metre of width error moves the setback by only 0.2 m (not a
  whole storey as in Barcelona's banded height table) — so the width sensitivity is *low*, and an OSM-derived
  approximate width is demo-acceptable where the exact parcel rings are unreachable.

---

## Recommended approach

1. **Road network (context):** OSM Saudi Arabia (HDX `hotosm_sau_roads`, free, ODbL) — the reachable layer.
2. **Street width (envelope input):** user-supplied in a demo; on a production path, boundary-to-boundary
   from Balady parcel rings (geo-fenced) via `streetWidth.ts` — algorithm ports, inputs gated.
3. **Pedestrian/cycle:** OSM tags; Balady `/26` is the authoritative-but-gated upgrade.
4. Do not use an OSM carriageway measurement as the ordinance street width without noting it understates the
   frontage-to-frontage definition (low sensitivity given ÷5).

---

**Open questions / unverified** (not for `SOURCES.md`):
- Whether RGA or GEOSA exposes any open road-network tile (both are regulatory/licensed; no open feed
  confirmed).
- OSM road-width tag completeness for Riyadh/Jeddah/Dammam (network geometry is good; `width=*` tags are
  sparse — the ordinance width usually needs the parcel rings or user input, not the OSM `width` tag).
