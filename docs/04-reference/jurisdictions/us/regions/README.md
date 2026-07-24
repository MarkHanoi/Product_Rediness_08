# USA — regions / states

Region-level notes for the US context-data adapter. The US requires **state-level routing** for
any source that is licensed, delivered, or operated at the state level rather than nationally.

## Why state routing is required

Unlike Germany (16 Länder with separate land-survey authorities), the US does not have a
standard "state geodata portal" pattern. Routing complexity comes from a different source:

1. **Zoning ordinances:** always at the municipal (or county) level — route by jurisdiction FIPS,
   not by state.
2. **Parcel data (free portals):** county-operated ArcGIS Hub portals — route by county FIPS.
   State geoportals exist in some states (e.g. California, Texas) but coverage is inconsistent.
3. **USGS 3DEP LiDAR:** national product; no state routing needed — query by bbox.
4. **Overture Maps buildings/heights:** national product; no state routing needed.
5. **NRHP heritage:** national product; no state routing needed.
6. **FEMA NFHL:** national product; no state routing needed.
7. **State environmental overlays** (coastal zones, wetlands): state-specific — California Coastal
   Commission, New York DEC, Florida DEP. These are state-law overlays that must be sourced
   per-state.

## Routing keys

| Key | Use |
|---|---|
| **State FIPS (2-digit)** | State-level legal or licence regime (e.g. California Coastal Commission jurisdiction) |
| **County FIPS (5-digit: state 2 + county 3)** | County-operated parcel portals (ArcGIS Hub/Socrata) |
| **Place FIPS (7-digit: state 2 + place 5)** | Municipal zoning jurisdiction; Zoneomics routing; city open-data portals |
| **TIGER/Line jurisdiction polygon** | Spatial join to resolve which place FIPS covers a given lat/lon — the routing table |

## State-specific notes (target states for pilot cities)

### Illinois (us-il) — Chicago
- Illinois has no state cadastre portal; Cook County publishes parcel data via the Cook County
  Assessor open-data portal (ArcGIS Hub / Socrata).
- Chicago publishes its own open data at `data.cityofchicago.org` — likely the richest free
  source for the Chicago pilot.
- No Illinois-specific environmental overlay identified for Chicago at this research stage.

### California (us-ca) — Los Angeles
- **California Coastal Commission:** mandatory overlay in the Coastal Zone (areas within ~1 mile
  of the coast). LA contains significant Coastal Zone territory. The Commission's GIS boundary
  layer is free; permits within the Coastal Zone require CCC approval on top of LA zoning.
- LA County publishes parcel data via `egis.lacounty.gov`. City of LA publishes open data at
  `geohub.lacity.org`.
- California also has a state APN (Assessor's Parcel Number) system but no single state-wide
  free parcel API.

### New York (us-ny) — New York City
- **NYC-specific zoning:** NYC has its own Zoning Resolution — one of the most documented zoning
  codes in the US. NYC's ZOLA (Zoning and Land use Application) and ZAP (Zoning Application
  Portal) are city-operated systems with structured data.
- NYC publishes extensive open data at `data.cityofnewyork.us`; the NYC Department of City
  Planning operates `nyc.gov/planning`.
- New York State has no relevant state zoning layer; NYC is its own entity with no county
  intermediary (the five boroughs are co-terminus with five counties, but all zoning is at the
  city level).
