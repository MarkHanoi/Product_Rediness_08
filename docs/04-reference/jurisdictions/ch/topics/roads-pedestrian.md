# Switzerland — Roads / Pedestrian (context layer)

> Part of L-511 (`../../../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth:
> `../findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`. **Gate d (roads): PASSED** (2026-07-24).

## Source

**swissTLM3D**, topic groups **"Strassen und Wege"** (roads and paths) + **"Öffentlicher Verkehr"**
(public transport: rail, ship lines, PT stops). Part of the 8-topic, 21M+-object national topographic
landscape model, maintained by swisstopo.

| Property | Value |
|---|---|
| Coverage | Full national + Liechtenstein; confirmed across every version checked (1.7 → 2.4) |
| Geometric accuracy | 0.2–1.5m in all 3 dimensions; roads are explicitly named as a "well-defined" object class in the product specification |
| Object-level? | **YES** — real feature classes with type + attributes, not a generalized line layer |
| Key attributes confirmed | `VERKEHRSBEDEUTUNG` (traffic significance) · `VERKEHRSBESCHRAENKUNG` (traffic restriction, incl. "closed") · `VERKEHRSMITTEL` (mode of transport) · `EIGENTUEMER` (owner) |
| Update cadence | 3-year full cycle + **annual** update specifically for road links and admin boundaries (official cadastral survey is a named reference partner) |
| Format | ESRI FileGDB (native), SHP, DXF, and others |
| Licence | Free OGD since 1 March 2021; no login; commercial use permitted |
| Download | `map.geo.admin.ch` selection UI or swisstopo documented API |

## What this gives concretely

Real object-level road/path centerlines with type classification (road category, path category), plus
traffic-significance and restriction attributes — enough to distinguish a public through-road from a
private access track or a closed road. Useful for pedestrian/vehicular context modeling around a
parcel, not just a visual road layer.

## Gate answer

| # | Question | Answer |
|---|---|---|
| d (roads portion) | Object-level? | **YES** — confirmed feature classes + attribute list, nationwide, no gaps |

## Fallback condition

None needed — swissTLM3D is authoritative, nationwide, free OGD. OSM/Overture fallback not required.

## Open items

| Item | What to confirm | How |
|---|---|---|
| Full attribute-value domains | All `VERKEHRSBEDEUTUNG` and `VERKEHRSBESCHRAENKUNG` code values | Read the swissTLM3D 2.4 Objektkatalog PDF (versions 1.7–2.4 confirmed to contain the full domain lists) |
| Pedestrian sub-classification | Whether "Wege" is further subdivided by pedestrian-network type vs. generic path | Check the 2.4 object catalogue's path sub-types directly before assuming full pedestrian-network detail |
