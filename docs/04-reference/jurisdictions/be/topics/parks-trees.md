# Belgium — Parks / Trees / Green Space (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Target:** public park polygons, individual tree point locations, green-space overlays relevant to
  setback or overshadowing context
- **Primary source (all regions):** OpenStreetMap (`landuse=park`, `leisure=park`, `natural=tree`) —
  ODbL, no key, immediate fallback available
- **Secondary source (Wallonia):** SPW Géoportail — `LU.ExistingLandUse` layers include SIGEC
  agricultural/forestry land use and WALOUS land-cover classification, confirmed in the plan de
  secteur capabilities document; green-space layers likely present
- **Integration effort:** LOW — OSM fallback available immediately; regional layers are supplementary

---

## Source details

| Source | Region | Endpoint | Feature type | Licence | Status |
|---|---|---|---|---|---|
| OpenStreetMap (Overpass API) | All | `overpass-api.de/api/interpreter` | `landuse=park`, `leisure=park`, `natural=tree`, `natural=wood` | ODbL | Immediately available; no probe needed |
| SPW Géoportail `LU.ExistingLandUse` | Wallonia | `geoservices.wallonie.be/geoserver/inspire_lu/ows` | Sub-layers confirmed in WMS capabilities: WALOUS 2018 land cover, GSA 2023/2024, "sapin de noël" forestry, camping | Free, no key | ✅ Endpoint VERIFIED LIVE 2026-07-24 — green-space sub-layers confirmed in capabilities; attribute schema not yet probed for individual trees |
| Flanders nature layers (AGIV/Informatie Vlaanderen) | Flanders | `geoservices.informatievlaanderen.be` | Green space, natura 2000, forestry datasets (AGIV catalogue) | Free ("kosteloos") | ⚠ Robots-blocked on direct fetch; layer existence confirmed via catalogue |
| Brussels green layer | Brussels | `gis.urban.brussels` or `bruxelles-environnement.be` | Urban green space, parks, trees | TBD | ❔ Not probed; Brussels green-space / Bruxelles Environnement WFS not independently confirmed |
| Flanders open green (Flanders Heritage parks) | Flanders | `geo.onroerenderfgoed.be/geoserver/wfs` | `bes_landschap` — protected cultural-historic landscapes | Free, no key | ✅ VERIFIED LIVE 2026-07-24 (same endpoint as heritage) |

---

## Implementation notes

- **Start with OSM.** Belgium's OpenStreetMap coverage is excellent — the country is fully covered
  by an active Belgian OSM community. For parks and trees as a context layer, OSM is sufficient for
  Phase 1 in all three regions.
- **Wallonia `LU.ExistingLandUse` layers** are already accessible from the VERIFIED LIVE endpoint;
  check whether they contain disaggregated park/urban-green categories distinct from agricultural
  land. The WALOUS land-cover classification is a likely source.
- **Heritage landscapes (Flanders):** the `bes_landschap` layer (confirmed LIVE) carries legally
  protected landscape polygons — relevant as a constraint overlay, not only as a visual context.
