# USA (`us`) — Jurisdiction Overview

**Level:** country · **ISO 3166-1:** `US` · **Join key:** FIPS (state 2-digit + county 3-digit + place 5-digit; see §5) · **Subdivision law:** States (ISO 3166-2, `us-<subdiv>`); municipalities hold planning authority under state enabling acts · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — implementation pipeline not started

> **This file is the country-level umbrella.** Municipality-level packs live under
> `us/<state-iso>/<FIPS-place>-<slug>/`. The national legal structure is fully characterised;
> no rule pack is implemented yet. See `findings/USA-MASTER-DATA-SOURCE-STUDY.md` for the full
> source and legal-mechanism study.

---

## 1 — What governs here (national structure)

### 1.1 Legal hierarchy

```
US Constitution (10th Amendment: police powers reserved to states)
  → State Zoning Enabling Act (each state adopted its own variant of the
    1922 model Standard State Zoning Enabling Act)
    → Municipal zoning ordinance — THE governing instrument
      → Zoning district (use code, density, height, setbacks, FAR, lot coverage)
      → Overlay district / Planned Development (PD) — layers on top of base zone
      → Non-conforming use / grandfathered structure — vested rights, no numeric rule
    → Subdivision regulations — separate instrument (lot dimensions, road standards)
    → Building code — state-adopted (IBC variants) — structure, not zoning
  → County zoning ordinance (for unincorporated territory; some counties unzoned)
  → Federal environmental overlays (FEMA flood zones, wetlands, EPA, NPS, USFS)
```

**The US central structural difference from every other jurisdiction studied:** there is no
equivalent to Germany's BauNVO (a national zone taxonomy + density ceilings), France's Code de
l'urbanisme, Sweden's PBL, or Denmark's Planloven. Every zoning rule is an independently-drafted
local ordinance — not just different numbers, but different vocabularies, different zone codes,
different FAR definitions, different height measurement methods. *Euclid v. Ambler Realty Co.*
(1926) confirmed zoning as a municipal police power; no subsequent federal statute has created
a national zoning framework.

### 1.2 The regime classifier (prerequisite for any US parcel — analogous to Germany's §30/§34/§35)

| Regime | Basis | Numeric rules? | Engine response |
|---|---|---|---|
| **(a) Zoning district** | Municipal zoning ordinance | YES — use code + density metrics + height in ordinance | Source and apply; Zoneomics API is the primary commercial path |
| **(b) Overlay / PD** | Overlay ordinance or Planned Development agreement | PARTIAL — overlay may supersede base zone numerics | Flag; source overlay rules separately |
| **(c) Non-conforming / grandfathered** | Vested rights under municipal code | NO applicable envelope | Reasoned refusal |
| **(d) Unincorporated / unzoned territory** | County (if exists) or no zoning | VARIES — some counties have structured data, others nothing | County fallback or refusal |

There is no single spatial layer that answers "which jurisdiction's ordinance governs this
parcel?" for all ~33,000 US zoning authorities. Regrid and Zoneomics both provide a
jurisdiction-routing layer — this is a commercial service, not a public API.

### 1.3 Zone taxonomy — no national fixed list

Unlike Germany (BauNVO §§2–11: a closed national list — `WA`, `MI`, `GE`, etc.) or Sweden
(Planbestämmelsekatalog, ~3,700 standardised codes), the US has **no national zone taxonomy**.
Each municipality invents its own zone codes: `R-1`, `RM-3`, `C-2`, `MX`, `PDR-1`, `SFRD`,
and thousands of other locally-defined abbreviations. A lookup table that maps `WA → AllgWohn`
works for all of Germany; there is no US equivalent.

**Practical implication:** zone codes must be interpreted relative to a specific municipality's
zoning ordinance. Zoneomics normalises across municipalities; raw zone codes from a parcel
layer are not self-describing.

---

## 2 — National data sources

### 2.1 Parcel geometry

| Source | Coverage | Access | Licence | Confidence |
|---|---|---|---|---|
| **Regrid** (formerly Loveland/Landgrid) | 160M parcels, 99% of Americans, 3,229 counties | Commercial API / bulk files / Esri feature service | **Paid** — individual lookups free | `published` — existence confirmed; endpoint not live-probed |
| County/city ArcGIS Hub portals | Varies by county — major urban counties well-covered; rural coverage patchy | Free per-county download (ArcGIS Hub / Socrata / data.gov) | Typically Open Data commons or CC | `corroborated` — systematic coverage not measured |
| OpenStreetMap | Good urban coverage; sparse rural | Overpass API / Overture Maps | ODbL | `corroborated` |

**Regrid MCP server:** Regrid has shipped an MCP (Model Context Protocol) server for AI-native
parcel access — directly relevant for a Claude-based tool. Investigate before building a
custom API integration.

⚠ **No free national parcel layer exists at Regrid coverage levels.** Free county portals are
the alternative; they require a crawl and are schema-inconsistent across jurisdictions.

### 2.2 Zoning data

| Source | Coverage | Numeric fields | Access | Confidence |
|---|---|---|---|---|
| **Zoneomics API** | 20,000+ cities, 100M+ parcels | Zone code + permitted use + FAR + building height + lot size | **Commercial (paid)** | `published` — enterprise customer Sidewalk Labs confirmed |
| National Zoning Atlas (NZA) | 4,000+ jurisdictions (direct); partner teams add more | Standardised zone classification | **Browse-only** — no bulk download or API as of mid-2026 | `published` (existence); no endpoint |
| Mercatus Center redistributions | NZA partner team outputs — state/region-specific, partial | GeoJSON + XLS/CSV — structured where NZA partner covered | Free download — partial coverage | `corroborated` |
| Municipal open-data portals | Highly variable — major cities often have WFS or Shapefile | Variable; often zone code only, no numeric attributes | Free per-jurisdiction | `unsurveyed` |

⚠ **No free structured zoning API returning numeric FAR/height exists at national scale.**
The Mercatus/NZA outputs cover a subset of jurisdictions. Any national structured zoning
capability requires Zoneomics (or equivalent commercial vendor).

### 2.3 Building footprints

| Source | Count | Format | Licence | Height? |
|---|---|---|---|---|
| **Microsoft US Building Footprints** | 129.6 million | GeoJSON/PMTiles | **ODbL** | ❌ No |
| Overture Maps Foundation (buildings layer) | 200M+ globally; includes US | GeoParquet | ODbL | ⚠️ Partial (where Overture height model applied) |
| OpenStreetMap | Significant US coverage | ODbL | ⚠️ Partial (inconsistent `height` tag) |

### 2.4 Building height

| Source | Count | Format | Licence | Accuracy |
|---|---|---|---|---|
| **Overture Maps + USGS 3DEP** (modelled heights) | 20M+ buildings, growing to 40–50M | Overture Maps GeoParquet | ODbL | Modelled/estimated — ~2–3 m RMSE |
| USGS 3DEP national LiDAR | Full national terrain (point cloud) | LAZ / GeoTIFF (DSM/DTM) | Public Domain | ~10–30 cm bare-earth; ~1 m above-ground building heights from DSM |
| OpenStreetMap `building:levels` | Urban core coverage | ODbL | Estimated (~15% of US buildings have levels tag) |

⚠ **20M heights out of 129.6M footprints = ~15% coverage today.** Use Overture/USGS as the
primary modelled source; derive height from 3DEP DSM–DTM difference as fallback for uncovered
buildings; `building:levels × 3.0 m` as last resort.

**National LiDAR (3DEP):** the 3D Elevation Program is the US federal LiDAR programme. The
most recent data indicates substantial national coverage (>60% of the US land mass with high-
quality LiDAR as of 2024, with a target of full national coverage). The height above ground
per building can be derived by subtracting the DTM from the DSM. This is an indirect workflow
(point-cloud processing required), not a building-height field in a feature service.

### 2.5 Heritage — National Register of Historic Places (NRHP)

| Aspect | Value | Confidence |
|---|---|---|
| Authority | National Park Service (NPS) under National Historic Preservation Act of 1966 | `published` |
| Coverage | ~100,000 listed properties nationwide | `published` |
| Access | Free via NPS ArcGIS feature services + open-data portals | `published` |
| Update frequency | Weekly | `published` |
| Caveats | (1) Restricted/sensitive sites excluded; (2) Pre-1983 records use UTM/NAD27 — reproject; (3) Spatial layer has minimal attributes — join NRIS (~45 fields) for full data | `published` |

Full descriptive data (name, significance, boundaries, contributing elements) is in the
**National Register Information System (NRIS)** database, a separate join from the spatial
layer. Never ship an NRHP heritage assessment from spatial-layer attributes alone.

### 2.6 Context data layers (LOD / 3D)

| Layer | Source | LOD achievable | Licence | Status |
|---|---|---|---|---|
| Building footprints | Microsoft US Building Footprints | LOD1 | ODbL | Research-confirmed; not live-probed |
| Building height | Overture/USGS modelled; 3DEP DSM–DTM | LOD1 (modelled) | ODbL / Public Domain | 20M+ buildings; not live-probed |
| Terrain (DTM/DSM) | USGS 3DEP | 1 m grid (urban) / 10 m (rural) | Public Domain | Nationally available; not live-probed |
| Roads / pedestrian | US Census TIGER/Line (free); OSM (ODbL) | Object-level | Public Domain / ODbL | Not live-probed |
| Parks / green | OpenStreetMap + city open-data portals | Object-level | ODbL / varies | Not live-probed |
| Water | USGS National Hydrography Dataset (NHD); OSM | Object-level | Public Domain / ODbL | Not live-probed |

---

## 3 — Overlay risk

| Overlay | Source | Risk |
|---|---|---|
| **Overlay districts / PD agreements** | Municipal ordinance + separate layer | **HIGH** — supersedes base zone numerics; no national lookup |
| **FEMA flood zones (SFHA)** | FEMA National Flood Hazard Layer (NFHL) — free ArcGIS feature service | **HIGH** — development restrictions in SFHA; confirmed free API endpoint |
| **Historic district / landmark overlay** | Municipal landmark commission + NRHP | **HIGH** — design review; no numeric rule replaces; city-specific |
| **Coastal / environmental overlay** | Army Corps (Section 404 wetlands); state coastal commissions | **HIGH** — in coastal cities (LA, NYC); no national structured API |
| **Airport approach overlay** | FAA obstruction evaluation; city zoning overlay | MEDIUM — height limits in approach paths; FAA OE/AAT API exists |
| **Non-conforming use / grandfathered** | Municipal code — city-by-city | **HIGH** — no structured national source; case-by-case |

---

## 4 — Rate context

See `RATE.md`. Summary:

| Basis | Headline rate | Key driver |
|---|---|---|
| Free sources only | ~12% | Building footprints strong (Microsoft); zoning essentially absent free; parcel fragmented; height partial |
| With commercial APIs (Zoneomics + Regrid) | ~55–65% | Zoneomics covers 20,000+ cities with FAR/height; Regrid provides parcel routing; footprint near-complete; height growing |

The US is unique in the corpus: it has the **worst free-source rate** of any non-Italy country
(comparable to Italy's ~8–10%) but the **highest commercial ceiling** of any country studied
(Germany's XPlanung delivers structured fields rarely; Zoneomics delivers them commercially).

---

## 5 — Municipality coverage

FIPS join key convention: `us-<state-iso>/<state-FIPS><place-FIPS>-<slug>/` (7-digit FIPS place code).

| Municipality | FIPS (place) | State | ISO 3166-2 | Pack status | Regime complexity | Notes |
|---|---|---|---|---|---|---|
| **Chicago** | 1714000 | Illinois | `us-il` | NOT STARTED | MEDIUM — strong open-data city; Zoneomics pilot candidate; Overture/USGS pilot coverage confirmed | Start here — highest data quality among the three |
| **Los Angeles** | 0644000 | California | `us-ca` | NOT STARTED | HIGH — complex zoning with heavy overlay use (Coastal Commission, hillside overlays, specific plans); CEQA environmental review | Pilot after Chicago |
| **New York City** | 3651000 | New York | `us-ny` | NOT STARTED | VERY HIGH — five boroughs, city-wide NYC Zoning Resolution, extensive special purpose districts, ULURP review; most documented zoning in the US but also most complex | Last — richest data but most complex regime |

**Recommended sequencing:** Chicago → Los Angeles → NYC, mirroring Germany's Hamburg → Munich → Berlin
principle (start with the most structured data city, then medium complexity, then the
most complex). Chicago has confirmed Overture/USGS height coverage, a strong open-data
tradition, and is a likely Zoneomics high-coverage city.

---

## 6 — Files in this folder

```
us/
├── README.md                               ← this file (country umbrella)
├── RATE.md                                 ← data readiness rate (+ revised IGC ceiling section)
├── NEXT.md                                 ← blockers, trip-wires, resume steps
├── sources/
│   ├── SOURCES.md                          ← per-field national data source citations
│   └── VERIFICATION.md                     ← human sign-off (open)
├── findings/
│   ├── USA-MASTER-DATA-SOURCE-STUDY.md     ← full source/legal-mechanism study
│   ├── USA-INSTITUTIONAL-GRAPH-ANALYSIS.md ← revised ceiling proof (institution compilation model)
│   └── USA-VISION-SHIFT-2026-07-24.md      ← theoretical framework: dataset aggregation → institution compilation
├── topics/
│   ├── buildings-lod-height.md
│   ├── parks-trees.md
│   ├── roads-pedestrian.md
│   └── water.md
├── regions/
│   └── README.md                           ← USA requires state-level routing (50 states + DC)
├── us-il/
│   └── 1714000-chicago/                    ← Chicago, Illinois (pilot city)
├── us-ca/
│   └── 0644000-los-angeles/                ← Los Angeles, California
└── us-ny/
    └── 3651000-new-york-city/              ← New York City, New York
```

---

## 7 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `SOURCES.md`.

- **Zoneomics field completeness per city:** claims FAR + height + lot size, but what % of
  their 20,000+ cities return all three numeric fields vs. use code only? Probe Chicago and
  NYC before assuming full numeric coverage.
- **Mercatus GeoJSON field schema:** whether the NZA-derived outputs include numeric FAR/height
  or only classified zone types. A direct file inspection converts this from "GeoJSON download"
  to a useful or useless source.
- **Regrid zoning field:** Regrid attaches some zoning data to parcels in its standard schema.
  What fields, what coverage, and what accuracy relative to Zoneomics? May reduce the need for
  two separate commercial API contracts.
- **3DEP LiDAR coverage by city:** national coverage is partially complete; actual tile
  availability for Chicago, LA, and NYC needs a specific check via the USGS National Map Viewer
  before relying on 3DEP as a height fallback.
- **NYC ZAP / ZOLA data:** New York City's ZAP (Zoning Application Portal) and ZOLA (Zoning
  and Land use Application) expose structured NYC zoning data publicly. This may make NYC
  partially addressable for free, despite overall US fragmentation.
- **Chicago open zoning data:** Chicago publishes zoning district boundaries via the city's
  open-data portal (data.cityofchicago.org). Whether numeric FAR/height/setbacks are included
  in the attribute table (not just the district code) needs a direct probe.
- **FEMA NFHL endpoint:** FEMA's National Flood Hazard Layer is a free ArcGIS MapServer. The
  exact endpoint URL, query syntax, and licence terms need confirmation before integration.
