# Norway — roads and pedestrian infrastructure

**Last updated:** 2026-07-24 · **Status:** RESEARCH OUTLINE — sources identified; no live probe run

---

## National road data sources

| Source | Content | Access | Licence | Status |
|---|---|---|---|---|
| **Elveg / NVE Vegnett** (Statens vegvesen + Kartverket) | National road network, centrelines, road class, speed limits, directional attributes | Free download via NVDB (Nasjonal vegdatabank) and Geonorge | Open | Published — endpoint not yet probed |
| **FKB-Veg** (Felles KartBase) | Detailed road geometry including carriageway edges, kerbs, footpaths; part of FKB family | Norge digitalt parties: free; commercial: same licence gate as FKB-Bygning | Norge digitalt / Geovekst | Schema confirmed; **licence-gated for commercial use** (same gate as FKB-Bygning) |
| **OSM Norway** | Community-maintained road + path network; high quality in Norway (active community) | Free, ODbL | ODbL | Live alternative to FKB-Veg for non-Norge-digitalt entities |
| **NVDB (Nasjonal vegdatabank)** | Official attribute data for all public roads: surface type, width, speed limits, access restrictions, cycle infrastructure | API: `nvdbapiles.vegvesen.no` | Open | Published — API documented; not yet probed |

---

## Pedestrian / cycle infrastructure

Norway's national road database (NVDB) includes dedicated attributes for:
- Gang- og sykkelveg (combined pedestrian and cycle path)
- Fortau (pavement/sidewalk)
- Sykkelfelt (on-road cycle lane)
- Gangveg (pedestrian path)

These are queryable via the NVDB API and are linked to the road segment geometry.

**FKB-TraktorvegSti** (part of FKB) covers unpaved tracks and footpaths outside the road network — subject to the same Norge digitalt licence gate as FKB-Veg.

---

## Setback implications

Under pbl. § 29-4 and most reguleringsplaner, byggegrense (building line) distances are measured from **road boundary** (veggrense), not road centreline. The road boundary geometry is in FKB-Veg or the reguleringsplan itself. For the § 29-4 fallback case (no plan), the setback is from the **neighbour property boundary** (nabogrense), not the road — road setbacks in the § 29-4 regime are governed by veglova § 29 (controlled by Statens vegvesen), not pbl. § 29-4 directly.

---

## Recommended approach

- **For engine context data (road network):** NVDB API (open, free) for road centreline + attributes; supplement with OSM for pedestrian paths where FKB-Veg is unavailable without a licence.
- **For precise setback geometry:** FKB-Veg (Norge digitalt licence required) or the reguleringsplan's own byggegrense polygon (from the planregister WFS).
