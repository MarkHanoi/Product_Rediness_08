# STR — 2D Site Map cartography: architectural masterplan quality on the parcel-selection architecture we have

**Status:** founder direction captured 2026-09-05 · plan proposed · Stage M1 in flight (lane MAP2D-PASTEL) · §6 added 2026-09-07 (lane PALETTE-PARITY)
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
- ⚠ **ADDED 2026-09-07 (§ILLUMINANT-IS-A-COLOUR-SOURCE, L-13190): the palette is not the whole of what is seen.** The same hex under a different illuminant is a different colour on screen — measured at **ΔE76 17.02** for the terrain base and **6.13–8.39** for the ground drapes, against ≤ **1.28** for every 2D↔3D alpha difference. §6 below carries the mechanism, the measurement and the rule.

## 6. 2D↔3D pane parity is a THREE-VARIABLE claim, not a palette

**Founder direction, issued three times** — 2026-09-06 Córdoba ×2 (*"I would like exactly the same colours in 2d plan view and 3d site view — buildings, streets, green — everything, for all the countries and all the assets"*; then, with a 2D|3D split screenshot, *"colours needs to match … 3d site view needs to match ALL COLOURS to 2d maps view. DO IT!"*) and 2026-09-07 Barcelona. §2's palette language answers only the first third of it.

**A renderer does not draw an albedo. It draws `albedo × illuminant`, over whatever it happens to have loaded.** So *"the two panes agree"* decomposes into three independent claims, and an assertion that does not say which one it measures is not an assertion about what the founder sees:

| Variable | What it is | Where it is decided | What measures it |
|---|---|---|---|
| **PALETTE** | the authored albedo of each layer | `formaPaletteV2.ts` — `FORMA_PALETTE_V2`, aliased into 3D by `FORMA_CONTEXT_3D` | `formaPaletteParity.spec.ts` ARMs A–E |
| **ILLUMINANT** | the light every albedo is multiplied by | `CesiumViewport.applyFormaSunLight` — `FORMA_KEY_LIGHT_CSS` | ARM F (new, 2026-09-07) |
| **COVERAGE** | which features each pane actually holds | the readers + the C12 §13 site-scope clip | not a colour question — see below |

### 6.1 The illuminant was the largest term, and nothing could see it (L-13190)

The 3D key light was `warm ? '#FFE9CC' : '#FFF6EC'` — an amber. `czm_lightColor` is `normalise-by-max(colour × intensity)`, so **the intensity cancels and the light's pure chroma reaches every shader**: `(1.0000, 0.9137, 0.8000)` for the amber key. Measured against the shipped Cesium shaders, not estimated:

- **Terrain base** (globe FS, `ENABLE_VERTEX_LIGHTING`: `color.rgb × czm_lightColor × diffuseIntensity`) — `#F5F2EA` rendered **`#F5DDBB`, ΔE76 17.02.** That hex *is* "light brown".
- **Every ground drape** (entity polygon → `PerInstanceColorAppearance`, whose `flat` **defaults to false** → `czm_phong`) — ΔE76 **6.13–8.39** across the palette.
- For scale: every 2D↔3D **alpha** difference measured in the same session composites to **ΔE76 ≤ 1.28**, at or below the JND.

**This is why the ground kept coming back brown after three fixes.** L-12922 painted the urban base off-white, L-12948 made that write actually run, L-12987 aliased rural to the same page tone — and the founder reported *"light brown"* after all three, because none of them touched the number that made it brown. A spec comparing hex strings cannot see an illuminant; `formaPaletteParity.spec.ts` even carried a confident sentence asserting the drapes were *"FLAT-LIT and render their 2D hex exactly"*, which was false and sent three lanes at the albedo (L-13193).

**The fix is the one this document's own §5 discipline implies: delete the second source, do not re-tune the first.** The key light is now `FORMA_KEY_LIGHT_CSS = '#FFFFFF'`, declared beside the palette because it *is* a colour. `czm_lightColor` becomes `(1,1,1)`; at nadir `czm_phong` collapses to exactly `C`, byte-identical to the `flat: true` path — **ΔE76 0.00 for every layer, and for the terrain base.** `FORMA_LIGHT_INTENSITY` 2.3 is untouched: §A.21.D-FORMA2's founder quote was *"strong **white** + stronger contrast"*, which an amber key contradicts, so this restores that ruling rather than reversing it.

**What is NOT claimed: exposure.** `czm_phong` sums two hard-coded eye-space lambert terms, so at the Forma fly-in pitch a drape still renders ~15 % brighter than its hex under *any* key. That is a luminance term shared by every layer — it cannot tint one against another — and it is logged as L-13196, not hidden inside a darkened hex.

### 6.2 Coverage: the 3D pane is deliberately narrower, and that is not a colour bug

2D reads land use at `CONTEXT_WIDE_HALF_DEG` (~8 km) and pushes every polygon unclipped (1 873 at Barcelona); 3D reads the same 8 km and then cuts every layer to the site-scope slab (211). **That is C12 §13 working as designed.** A "colours don't match" report must never be answered by widening the 3D scope — that trades a conformant difference for a real one.

**The one coverage gap that IS a defect is the sea.** The 2D pane gets its ocean free from the OpenFreeMap basemap (`waterBase`, source-layer `water`, minzoom 8, no maxzoom). The 3D pane has **no basemap at all** — `globe.baseColor` is the ground — so a sea pixel exists only if a reader produced a polygon, and the baked `sea` layer is designed but has never been published (the live manifest names seven layers: buildings, landuse, parks, rail, roads, trees, water). The 3D sea therefore rests entirely on a **live-Overpass coastline supplement**, and its standing pre-plot load was gated on `formaMode && !photorealTilesActive` — a latch that is true for the rest of any session that showed the photoreal globe, i.e. every founder session (L-13191, the third instance of that same stale flag in one file). Publishing the `sea` layer would remove the supplement's coastline walk entirely; that is a publish decision, tracked as L-13192.

### 6.3 Honesty constraints, extended

Adding to §5:

- **The same hex under a different illuminant is a different colour on screen.** A parity assertion must name which of the three variables it measures; one that measures the palette must not be read as, or written as, a claim about pixels.
- **A sea the 3D pane derives from a live coastline read is a SUPPLEMENT, never baked data**, and the diagnostic line says so. A zero must name *which* zero it is — inland, refused by the coastline walk, or cut away by the site-scope slab — because those are three different bugs that were being reported as one sentence about geography.
- **No governing contract owns pane parity.** C59 (Multi-Pane View System) is the contract that owns two panes hosting two renderers of the same place and it has no clause on what must agree between them; this document is the only written authority today (L-13195).
