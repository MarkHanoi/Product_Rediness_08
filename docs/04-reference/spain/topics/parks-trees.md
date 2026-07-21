# Spain — Parks / Green space & Trees (context layer)

> Umbrella **L-511**, deep-dive **L-512**.

## Parks / green — BTN25 (national, surveyed)
BTN25 has explicit thematic layers for **zonas verdes**, **instalaciones deportivas**, and
**instalaciones recreativas** (part of its 88-layer structure) — surveyed polygons distinguishing
facility type, better than OSM `leisure=*` which blurs them. Free (FOM/2807/2015), WFS/ATOM/CNIG.

## Trees — Barcelona is a real Tier-A exception; procedural elsewhere
**Open Data BCN (Ajuntament de Barcelona)** publishes three complementary **per-tree** geolocated
datasets: **Arbrat viari** (street trees, 170k+ records), **Arbrat de zona**, **Arbrat dels parcs**.
Each record: precise coords, species (common + scientific), district/neighborhood codes. Updated
**quarterly**, CSV/JSON (RDF/XML/KML discontinued March 2021 — update any old integration).

> **Live-probe honesty (2026-07-21):** the Open Data BCN CKAN API is **live (HTTP 200)**, but my
> headless `package_show?id=arbrat-viari` and `package_search?q=arbrat` probes did **not** resolve a
> package from this environment — likely a slug/encoding difference, not absence. **Impl MUST confirm
> the exact resource id before wiring** (do not hard-code `arbrat-viari` on trust).

**Pattern:** Barcelona = real per-tree Tier-A source; **everywhere else in Spain = procedural placement**
along BTN25/OSM street+park polygons. Many large ES councils (Madrid, Valencia, ...) run comparable
"arbol viario" open catalogs — **verify per-city before assuming absence** (this pattern is growing).

## Gate
| Q | Verdict |
|---|---|
| Parks object-level? | **YES** (BTN25 zonas verdes / instal.) |
| Trees per-tree? | **Barcelona YES** (Open Data BCN; slug to confirm) · elsewhere procedural |
| License | Parks free/open; BCN trees open |

---

## 3D modeling method — TREES (from founder modeling deep-dive, L-512)
Mirrors the building nDSM technique but on vegetation classes:
```
1. From classified LAZ: DTM = class 2 (ground); Veg surface = highest return among classes 3/4/5.
2. CHM (Canopy Height Model) = Veg surface - DTM.
3. Individual tree detection: local-maxima filter over CHM -> one candidate treetop per peak.
4. Crown delineation: watershed seeded at each treetop -> crown polygon + crown diameter per tree.
5. Place a scaled procedural asset (canopy height + crown diameter). Do NOT model leaves/branches
   or low groundcover as geometry (that is ground texture, see parks).
```
- **Barcelona (Tier-A real):** use Open Data BCN per-tree points + species -> map species to a small
  archetype library (broadleaf / conifer / **palm** — Barcelona has palm-lined avenues, distinct
  archetype); size by species avg OR by LiDAR CHM value at that exact point for real height.
- **Elsewhere (derived):** CHM treetop + crown-diameter -> scaled generic asset. Where veg
  classification is unreliable/absent -> procedural placement along BTN25/OSM polygons (labeled
  procedural, NOT measured).
- **Accuracy ref:** a Spanish PNOA-NIR+LiDAR study (Dehesas woodland, RURAL) hit 96.72% RF
  classification — treat as an **upper bound**; urban street trees (overlapping crowns) are harder,
  validate vs orthophoto per site.

## 3D modeling method — PARKS / GREEN (L-512)
- **Primary: BTN25** discrete `zonas verdes` / `instalaciones deportivas` / `instalaciones recreativas`
  polygons (surveyed, per-site precision).
- **SIOSE** (national land-cover, 1:25,000) is a **composite %-occupation polygon** with **1 ha min
  mapping unit** for artificial surfaces -> good for district-scale green-ratio context, **too coarse
  for an individual park/plaza** (often smaller than the min unit). Use as fallback/cross-check ONLY.
- **Ground cover = texture, not geometry:** render green polygons as flat DTM-draped surface + grass
  texture; reserve 3D volume for the individually-detected trees only (Cityweft/Forma principle).
