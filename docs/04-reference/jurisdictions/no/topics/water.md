# Norway — water bodies and flood zones

**Last updated:** 2026-07-24 · **Status:** RESEARCH OUTLINE — sources identified; no live probe run

---

## National water data sources

| Source | Content | Access | Licence | Status |
|---|---|---|---|---|
| **FKB-Vann** (Felles KartBase) | Detailed water body geometry: lakes, rivers, streams, fjords, coastline at 1:5000 | Norge digitalt parties: free; commercial: same licence gate as FKB-Bygning | Norge digitalt / Geovekst | Licence-gated for commercial use |
| **NVE NEVINA / Hydrologisk karttjeneste** | Rivers, lakes, watersheds, catchment areas | Free via NVE (Norges vassdrags- og energidirektorat) | Open | Published |
| **OSM Norway** | Rivers, lakes, coastline — community-maintained; high quality in Norway | Free, ODbL | ODbL | Live alternative |
| **Kartverket N50 / N250** | Small-scale generalised hydrography | Free via Geonorge | Open | Published |
| **NDH terrain** | Enables hydrological modelling (flow direction, drainage, flood extents) from DEM/DSM | Free, no login — `høydedata.no` | Open | **CONFIRMED LIVE** |

---

## Flood zones (faresoner)

Flood zones are a key regulatory overlay in Norway:

| Source | Content | Access | Confidence |
|---|---|---|---|
| **NVE flood zone maps** (`flomsonekart.nve.no`) | 10-year, 100-year, 200-year, 500-year flood extent polygons for mapped rivers | Free, WMS/WFS | `published` — NVE confirms these are regulatory inputs for pbl. § 28-1 building approvals |
| **NVE hazard data** | Landslide zones, debris flow, storm surge | Free via NVE and Geonorge | `published` |

**Regulatory implication:** pbl. § 28-1 prohibits building in areas with unacceptable natural hazard risk. Flood zones from NVE maps are the authoritative input — confirm per-parcel flood zone status before shipping any envelope answer for a potentially flood-exposed parcel.

---

## Hensynssone encoding of water/flood constraints

Within SOSI Plan, flood and hazard zones are encoded as **hensynssoner**:

| Code | Meaning |
|---|---|
| `H110` | Sikringssone — råstoffutvinning |
| `H210` | Faresone — høyspentanlegg og kraftledninger |
| `H220` | Faresone — trafikkstøy |
| `H310` | Sone med særlige krav til infrastruktur |
| `H730` | Sikringssone — drikkevann |

Flood-specific zones may also appear as `H110` or `H210`-type overlays with a plan-specific bestemmelse — check the specific hensynssone code and its associated bestemmelse text, not just the code alone.

---

## Practical approach for the engine

1. **Coastline / water boundary:** use FKB-Vann (via Norge digitalt agreement) or OSM as fallback
2. **Flood zone check per parcel:** query NVE flood zone WFS for parcel overlap; this is a required pre-condition before any envelope answer for a riverside/coastal parcel
3. **Terrain-based hydrological analysis:** use NDH (free, open) if the engine needs to compute flow accumulation or local flood extent beyond the mapped zones
