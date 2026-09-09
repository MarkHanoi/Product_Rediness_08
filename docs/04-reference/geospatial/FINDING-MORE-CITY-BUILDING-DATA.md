<!--
  A REUSABLE RESEARCH PROMPT — find city/region building datasets that drop into the context
  bake with days of work rather than months.

  Written 2026-09-09, immediately after ingesting Barcelona's `MTM_GPKG_alçades`. The
  requirements below are MEASURED from that file, not imagined: every "hard requirement" is
  something that file satisfies and that a rejected alternative did not.

  ⭐ WHY THIS EXISTS. Two prior lanes designed elaborate ingest routes — a live pass-through
  proxy, and an Esri-JSON harvester with a ring-winding converter — and BOTH were obsoleted the
  moment someone downloaded the catalogued GeoPackage and read its schema. The cheapest route
  was never found by reasoning about portals; it was found by opening a file. This prompt
  encodes that lesson as a checklist so the next search starts from the right question:
  **not "does this city have 3D data?" but "does this city publish a file GDAL can read, with
  metres in a column?"**

  ⚠ Keep this file in step with reality. If the bake's input requirements change — a new format
  becomes cheap, or the licence posture shifts — the checklist below is stale and will send
  someone hunting for the wrong thing.
-->

# Finding more city building data

A copy-pasteable research prompt, plus the reasoning behind each requirement so the list can be
amended intelligently rather than followed blindly.

---

## Why each requirement is there

| Requirement | The scar it comes from |
|---|---|
| Bulk file, not an API | The Barcelona FeatureServer silently ignored `resultOffset` on grouped queries and returned the row count when asked for a distinct count — two confident wrong answers, no errors |
| GDAL-readable format | The SLPK route needed Esri I3S node unpacking; the DWG route needed CAD tooling and ~70 per-neighbourhood downloads. The GeoPackage needed one `ogr2ogr` |
| 2D polygons, not mesh | Extracting a clean footprint from a triangle mesh is the expensive path the whole pipeline exists to avoid |
| Height in metres | A *categorised* height ("band 12–21 m") cannot be extruded. Barcelona's product is a thematic map and nearly got rejected for this — the raw metres turned out to be in the table underneath |
| Few files | Per-sheet distribution turns a one-hour ingest into a scraping project |
| Licence allows derivatives | Our tiles are a derivative on our own CDN. **CC BY-ND forbids exactly that**, and Barcelona's portal routes some data to ND |
| Multi-volume articulation | This is the only thing that made Barcelona worth doing. One box per building is what we already draw |

---

## The prompt

````markdown
# Find city/region building datasets that drop into a vector-tile pipeline with minimal work

I maintain a 3D city-context pipeline. I bake building footprints + heights into vector tiles
(PMTiles) hosted on my own CDN, and extrude them as prisms in a Cesium globe. I already cover
49 countries from OpenStreetMap plus national registers. I am looking for datasets that are a
GENUINE UPGRADE on that and that I can ingest with days of work, not months.

## The gold standard I already have — match this shape

Barcelona publishes `MTM_GPKG_alçades` (CartoBCN, "Mapa temàtic per alçades i edificació"):

- **GeoPackage**, 189 MB, direct HTTP download, **no registration, no API key**
- **503,596 MULTIPOLYGON features**, EPSG:25831, whole municipality in ONE file
- Attributes: `NIVELL, AREA, PERIMETRE, DISTRICTE, BARRI, Z_MIN_VOL, Z_MAX_VOL`
- **`Z_MAX_VOL − Z_MIN_VOL` gives a real height in metres per feature, zero nulls**
- ⭐ Crucially: it is **one building split into ~10 stacked volumes** (lift overruns, stair
  cores, setbacks), not one box per building — so the city renders with real relief

That last point is what made it worth doing. Plain one-box-per-building data I mostly have.

## HARD REQUIREMENTS — reject anything that fails these

1. **Bulk file download over HTTP.** Keyless and unauthenticated, or at most a free
   registration. ⛔ Reject WFS/REST-API-only sources that must be paged feature by feature.
2. **A format GDAL/`ogr2ogr` reads natively**: GeoPackage, Shapefile, GeoJSON, FlatGeobuf,
   GML/CityGML, GeoParquet. ⛔ Reject SLPK/I3S, 3D Tiles, OBJ/glTF meshes, DWG, DGN, PDF.
3. **2D polygon geometry** (Polygon/MultiPolygon). A 3D mesh is a rejection, not a bonus —
   extracting footprints from a mesh is the expensive path I am trying to avoid.
4. **Per-feature height in METRES** as an attribute — either an explicit height, or a min/max
   elevation pair I can subtract, or a storey count. ⛔ Reject "heights" that are only
   categorical bands with no underlying number.
5. **Whole city or whole region in a small number of files.** ⛔ Reject anything tiled into
   dozens of per-neighbourhood or per-map-sheet downloads.
6. **A stated CRS with an EPSG code.**
7. **A licence permitting COMMERCIAL use and REDISTRIBUTION OF DERIVATIVES** — my tiles are a
   derivative hosted on my own CDN. CC BY 4.0, CC0, ODbL and most national open-data licences
   are fine. ⛔ **CC BY-ND is a hard reject** — no derivatives.

## STRONGLY PREFERRED

- **Multi-volume articulation** (several volumes per building), as in the Barcelona example
- National or regional coverage rather than a single city — it amortises the ingest work
- Roof form / eave / ridge attributes, but ONLY if densely populated (see the trap below)

## OUTPUT — one row per candidate, and no prose padding

| City / region | Publisher | Product name | Format | Direct download URL | Size | Feature count | Height attribute(s) | Multi-volume? | CRS | Licence (exact name) | Registration? | Last updated |

Then, per candidate, three short lines:
- **Why it beats OSM+national-register data** — be specific, or say "it doesn't"
- **The hardest part of ingesting it**
- **Confidence: HIGH / MEDIUM / LOW**, and what you did NOT verify

## RULES OF EVIDENCE — I will check these

- **Actually open every URL you cite.** Do not describe what a portal probably offers. If you
  could not fetch it, write `UNVERIFIED` next to it. An unverified link presented as a finding
  is worse to me than no candidate.
- **Quote the operative licence sentence verbatim**, in the original language, with a
  translation. Do not paraphrase a licence and do not summarise it as "open".
- Distinguish what you READ from what you INFERRED. Label inferences as inferences.
- If a portal returns 403 or a login wall, say exactly what you tried and what came back — then
  look for a second access route before declaring it blocked. Bulk-download endpoints and
  API endpoints often have different access rules for the same data.
- Prefer 10 verified candidates over 40 plausible ones.

## KNOWN TRAPS — I have hit all of these

- **"LOD2" in a product name often is not LOD2.** Barcelona's service is named LOD2 while the
  publisher's own documentation says LOD1 with flat roofs. Trust the documentation, not the name.
- **Roof-form attributes are frequently unusable.** On the Barcelona service, only 9.4% of
  volumes were fully specified and the stated building height contradicted the geometry on 41%
  of rows. Check POPULATION DENSITY of an attribute before counting it as a feature.
- **A "thematic" or "categorised" map may still carry the raw numbers underneath.** Check the
  actual table schema before rejecting one — I nearly discarded the Barcelona file over this.
- **Watch the vertical datum.** Orthometric (EGM96/EGM2008) versus ellipsoidal heights differ
  by tens of metres. A relative height (max − min) sidesteps it; an absolute elevation does not.
- **Coverage often stops at an administrative boundary**, leaving a hole against neighbouring
  municipalities. Say where each dataset stops.

## Where to look

National mapping agencies; municipal geoportals and open-data portals; INSPIRE Buildings theme
downloads (EU); national 3D building programmes (e.g. NL 3DBAG, the German Länder, Switzerland,
Poland, the Nordics); regional cartographic institutes. Also check `awesome-citygml` on GitHub,
but verify every entry — that list contains dead and mislabelled links.

Prioritise: **Spain, France, Italy, Portugal, Germany, Netherlands, Belgium, Switzerland,
Austria, Poland, the Nordics, UK, Ireland** — then anywhere else with a strong open-data record.
````

---

## How to judge what comes back

A candidate is worth acting on when **all seven hard requirements are verified**, not asserted.
The single most common failure mode in this repo's history of data sourcing is a confident
"blocked" or "available" verdict about the wrong product — nine of fourteen past blockers were
refusals about an endpoint that was not the one serving the data
([[bulk-vs-query-endpoint-false-refusals]]).

⚠ **And check the delta before funding the work.** Barcelona's heights were already 96.9% solid
before this lane; the entire gain was visual. That is a legitimate reason for a pilot city and a
poor one for the fiftieth. For each candidate, ask what a user would SEE that they do not see
today, and be willing to answer "nothing".
