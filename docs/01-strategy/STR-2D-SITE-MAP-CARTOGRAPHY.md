# STR — 2D Site Map cartography: architectural masterplan quality on the parcel-selection architecture we have

**Status:** founder direction captured 2026-09-05 · plan proposed · Stage M1 in flight (lane MAP2D-PASTEL)
**Owner:** founder · **Related:** [ISSUE-LOG L-12928](../04-reference/ISSUE-LOG.md), `apps/editor/src/ui/geospatial/siteMap2DStyle.ts`, `SiteBoundaryMap2D.ts`, C57 (parcels), C12 (context datum), the context-bake pipeline (`tools/context-bake/`).

## 0. The founder's ask (2026-09-05, verbatim in substance)

> Can we improve the 2D existing OpenStreetMap — quality, performance, graphics — to have a more detailed, nice pastel-colour graphic, still being able to select parcel data as we are doing now? Just want to improve massively the graphics, still keeping the architecture towards selecting parcels as we have now.

The reference image is an **architectural masterplan drawing**: warm-white building masses with soft shadows, green roofs and courtyards, hundreds of individual round tree symbols along streets and in gardens, pastel sage lawns, powder-blue water, very light grey roads with cars as tiny accents, paths and pedestrian circulation readable without labels, terracotta plazas, and a soft visual hierarchy. It is *not* a navigation map.

The founder also pasted a research note (an external assistant's answer) whose substance is recorded in §2 so the reasoning lives in the repo, not in a chat.

## 1. What we already have (measured 2026-09-05)

| Concern | Today |
|---|---|
| Renderer | MapLibre GL (`SiteBoundaryMap2D.ts` is the only importer). Vector, GPU, fractional zoom — the performance half is already right. |
| Style | `siteMap2DStyle.ts` (625 lines): a cream "Forma minimal-vector" style — `FORMA_PALETTE.land #F0EDE8`, roads `#D9D6CF`, water `#C8DCE8`, buildings as flat footprints. |
| Data on the map | Basemap vector tiles (OSM-derived) + context buildings pushed in as a GeoJSON source from the same baked read the 3D uses (`map2d: context buildings → N footprint(s)`). |
| Data we own | Seven baked PMTiles layers on R2 for 49 regions: buildings (with measured heights where a national source exists), roads, water (+coastline), parks, landuse, rail, trees — the exact layers the reference drawing is made of. Canopy (Copernicus tree cover) and street furniture layers are being added today (L-12924..L-12926). |
| Parcel selection | Click → per-country cadastre ladder (`server/jurisdiction/*Proxy.js`, `parcelRegistry.ts`) → ring + attribution + honesty verdicts (C57). This is the architecture the founder wants kept. |

So the gap is **cartography and symbolisation**, not the stack. We do not need to buy a map API.

## 2. The research note, condensed (external, 2026-09-05)

- **Base map:** Overture Maps (buildings, addresses, land use/cover, water, transportation, places, divisions; monthly; publishes PMTiles) → MapLibre → a custom pastel style. OSM + MapLibre can reach the same look; the difference is data enrichment + style.
- **Parcels are a separate data product**, never the basemap. There is no global cadastre; OGC's Open Parcel Number work exists because identifiers are not internationally persistent. Hierarchy: official national cadastre → Regrid (US 100 %, 22 countries incl. a 20-country European set, point/polygon/ID queries, tiles, bulk) → other → *no parcel layer*, with **coverage awareness** in the UI.
- **Zoom behaviour:** z10–15 no parcels; z16 thin pale parcel lines; z18+ hover highlight, click = strong highlight + panel.
- **Palette language:** land `#F5F2EA`, parks `#DDEBD4`, woodland `#C9DDBF`, water `#D9E9E8`, buildings `#E8E1D4`, roads `#D2CEC5`, labels `#77766F` — low saturation.
- **The secret ingredient is trees**: render individual tree symbols (mapped trees + procedural placement inside vegetation polygons with building/road exclusion), fading to a vegetation fill at low zoom. Buildings get a subtle outline and a pseudo-shadow offset without going 3D.
- **Performance:** vector tiles + WebGL, never raster; parcel tiles built server-side (normalise → simplify → PostGIS → MVT/PMTiles → CDN) so a click hits the loaded tile, not a live API per pan.
- Open question the note ends on: do we need ownership/valuation attributes, or only polygon + ID? **PRYZM's answer today: polygon + ID + area + zoning link (the envelope pipeline), no ownership/valuation.**

## 3. Decision proposal

1. **Keep MapLibre and keep the parcel ladder untouched.** The click path (`onClick → parcel proxy → ring`) is not modified by any cartography work; the map style is a pure presentation layer.
2. **Our baked R2 layers become the basemap's content at z14+**, styled pastel: buildings (warm white + hairline outline + 1.2 px SE shadow offset, roof-green where `roof:material`/`building:levels` suggest a green roof only if tagged — no invention), parks (sage), woodland (darker sage), water (powder blue), roads by class (light grey with casing; footways/paths dashed; cycleways with a faint accent), rail (hairline), landuse (very faint tints). Below z14 the existing OSM vector basemap continues to carry the map.
3. **Trees as symbols**: mapped trees from the `trees` layer; synthesised canopies inside wood/forest polygons (L-12924) and Copernicus-sampled canopies (L-12925) as the same round symbol at z15+; hidden below z15.
4. **Parcels**: at z16+ draw subtle grey-green parcel outlines *where a country serves a parcel tile/WFS* (ES Catastro WMS, FR IGN parcellaire express, NL Kadaster, DK, LU already have proxies) — a "coverage-aware" outline layer; the existing click ladder remains the selection path. Regrid is an evaluation item for the US/CA and the non-official European countries — **procurement decision for the founder**, not a code change.
5. **Overture**: evaluate as a *data* source for the bake (buildings/land cover where OSM is thin), not as a renderer change. Fold into the bake pipeline if it wins on coverage in a three-area A/B (OSM vs Overture vs current) at z14/z16/z18.

## 4. Stages

| Stage | Deliverable | Gate |
|---|---|---|
| **M1 — Pastel style on what we load today** (lane MAP2D-PASTEL, 2026-09-05) | New `FORMA_PALETTE_V2` + layer set in `siteMap2DStyle.ts`; building shadow + outline; parks/water/landuse/roads/rail/trees pushed into the 2D map from the same baked collections the 3D already reads (one read, two renderers); tree symbols at z15+; zoom-gated. Pure style module with a vitest spec that pins the palette and the zoom gates. | Founder visual check on prod; parcel click still works at Sète, Córdoba, Belverde, Euston. |
| **M2 — Own-tiles basemap** | MapLibre sources pointed at our R2 PMTiles directly (pmtiles protocol) for z12+ instead of GeoJSON pushes; OSM basemap only under z12. | Pan/zoom at 60 fps on a 4 k viewport; no extra reads. |
| **M3 — Parcel outline layer** | Coverage-aware parcel outlines at z16+ from the countries with a tile/WFS source; hover highlight; click unchanged. | Outline never shown where the ladder would refuse (C57 honesty). |
| **M4 — Data A/B** | OSM vs Overture vs current on three areas; decision memo. | Founder decision; procurement (Regrid) if the US/CA case needs it. |

## 5. Honesty constraints carried over

- A symbol placed procedurally (a tree inside a wood polygon, a lamp along a road) is **scenery**, labelled `synthetic: true` in the data and counted separately in the console line (C57 §1.5). Nothing procedural may be presented as a survey.
- A parcel outline is drawn only from a source that would also answer the click; no outlines from OSM landuse (the research note's own warning).
- The palette is a presentation choice; it must not encode a legal verdict (C58 §1.2 hues stay reserved for confidence).
