# Saudi Arabia — parks, green space, and trees (context data)

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH OUTLINE — national green
programmes located; open geospatial layers are global fallbacks + city-programme GIS (not confirmed open)

---

## National green-space context

Saudi Arabia's green space is dominated by two large state programmes rather than a single national
land-cover feed. Neither is confirmed as an open geospatial download, but both define the green-space layer
a context engine would render:

| Programme | Content | Access | Confidence |
|---|---|---|---|
| **Green Riyadh** (`riyadhgreen.sa`) | 7.5M trees across 120 neighbourhoods; target green coverage 9.1%, per-capita green area 1.7 → 28 m²; 3,300+ new parks/gardens; 545 km² of green space | Programme portal; no confirmed open GIS feed | `published` (programme); `TBD` (open geospatial layer) |
| **Saudi Green Initiative (SGI)** (`sgi.gov.sa`) | National: 10bn trees kingdom-wide, 600M+ by 2030; rehabilitation of 74M ha | Programme portal; national scope | `published` (programme); `TBD` (parcel-level layer) |

⇒ **These are the authoritative green-space *programmes*, but neither publishes a confirmed open, machine-
readable parks/trees layer that a per-parcel engine could query.** The reachable green-space layer for a
context render is therefore the same global/community fallback stack used for any gated jurisdiction.

---

## Reachable green-space + land-cover sources (fallbacks)

| Source | Content | Access | Licence | Confidence |
|---|---|---|---|---|
| **OpenStreetMap Saudi Arabia** | Parks (`leisure=park`), gardens, greenery, tree rows; best in Riyadh/Jeddah/Dammam cores | Free, ODbL | ODbL | `published` — the practical parks layer |
| **ESA WorldCover / Copernicus land cover** | 10 m global land-cover classification (tree cover, grassland, built-up, bare) | Free (ESA) | CC BY | `published` — global, KSA covered |
| **Copernicus / Sentinel-2 NDVI** | Vegetation index for green-cover extent from satellite | Free (Copernicus Data Space) | Copernicus licence | `published` — derived, not a feature layer |
| **GEOSA National Geoportal — land cover** | National land-cover / vegetation layers | **Licensed** (NGC policy) | GEOSA licence | `TBD` — exists, not open |
| **Amana parks GIS** (e.g. Amanat Riyadh / Green Riyadh) | Municipal parks + street-tree registers | Not confirmed as open feed; likely behind the municipal portal | Municipal | `TBD` |

---

## Tree registers

Saudi Arabia has **no confirmed national open street-tree register**. The Green Riyadh programme necessarily
maintains a planting/asset GIS (7.5M trees across 120 neighbourhoods), and each Amana's parks department
holds its own tree assets — but **none is confirmed as an open API dataset** in this pass. This mirrors
Norway's finding (no national street-tree register; individual kommuner like Oslo maintain their own,
none confirmed open).

⇒ For a context render, derive tree/green-cover extent from **ESA WorldCover + OSM parks** rather than a tree
register; treat any Amana/Green-Riyadh tree GIS as a `TBD` upgrade contingent on an open feed or a data
agreement.

---

## Regulatory link — green space in the envelope

Unlike Norway (SOSI Plan carries structured green-space arealformål codes `3010`–`3040`, and TEK17 §5-6
defines MUA as a national outdoor-amenity metric), the 2024 MOMRAH residential decision does **not** encode a
national green-space or outdoor-amenity ratio as a structured field. Green/setback space is implied by the
footprint math (`plot ⊖ setbacks`, capped by coverage) rather than a separate amenity requirement. The
ground-floor build-in-setback rule (≤ 70% of plot perimeter, §4-1 cl. 8) is the closest analogue and is a
*footprint* rule, not a green-space rule.

⇒ **Green space is a context-data layer here, not an envelope parameter** — render it for context, do not
derive a rule from it.

---

## Recommended approach

1. **Parks / green polygons:** OSM (`leisure=park`) as the practical layer, supplemented by ESA WorldCover
   for tree-cover extent.
2. **Green-cover extent:** ESA WorldCover 10 m + Sentinel-2 NDVI (both free, global, KSA covered).
3. **Trees:** derive from land cover; treat Green Riyadh / Amana tree GIS as a `TBD` open-feed upgrade.
4. Do **not** derive an amenity/green-ratio *rule* from these — the residential decision has none.

---

**Open questions / unverified** (not for `SOURCES.md`):
- Whether Green Riyadh (`riyadhgreen.sa`) exposes an open parks/trees GIS layer (portal reachable; feed not
  confirmed).
- Whether GEOSA's National Geoportal land-cover product has any open tier (licensed model confirmed; free
  boundary not established).
