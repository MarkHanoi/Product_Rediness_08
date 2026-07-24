# Belgium — Water / Waterways (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Target:** river/canal polygons and centre-lines, flood-zone boundaries (relevant as overlay
  constraints), coastal/estuarine context for Antwerp
- **Primary source (all regions):** OpenStreetMap (ODbL) — immediate availability
- **Secondary source (Wallonia):** SPW Géoportail — confirmed live; water-body layers expected in
  the `LU.ExistingLandUse` or a separate hydrography collection
- **Integration effort:** LOW — OSM fallback immediate; regional layers supplementary

---

## Source details

| Source | Region | Endpoint | Feature type | Licence | Status |
|---|---|---|---|---|---|
| OpenStreetMap | All | `overpass-api.de/api/interpreter` | `natural=water`, `waterway=*`, `landuse=basin` | ODbL | Immediately available |
| SPW Géoportail — hydrography | Wallonia | `geoservices.wallonie.be/geoserver/inspire_lu/ows` + separate hydro collection | Water bodies, flood zones | Free, no key | ✅ WMS endpoint VERIFIED LIVE; hydrography layers not specifically enumerated in this pass — check WMS GetCapabilities for layer tree |
| INSPIRE Flood-Zone WMS (federal / per-region) | All | Per-region geoportal | Flood hazard zones (INSPIRE FD directive) | Varies | ❔ INSPIRE flood layers exist per INSPIRE Geoportal; access not probed |
| Flanders waterways (VMM / Informatie Vlaanderen) | Flanders | `geoservices.informatievlaanderen.be` | Waterway network, flood zones | Free | ⚠ Robots-blocked on direct fetch |
| Antwerp — Schelde estuary | Flanders | Flanders Maritime | Estuary polygons (relevant for Antwerp context data) | TBD | ❔ Not probed |
| Brussels canal / waterway | Brussels | `geoservices-urbis.irisnet.be` or Brussels Environnement | Canal, Senne, smaller waterways | TBD | ❔ Not probed |

---

## Implementation notes

- **OSM is sufficient for Phase 1** in all three regions. Belgium's waterway network (Meuse,
  Schelde, Sambre, canals) is well-mapped in OSM.
- **Flood-zone overlay** is relevant as a permit-constraint overlay in all three regions. Belgium's
  INSPIRE flood-hazard datasets are published per region; confirm which endpoint applies before
  building any flood-overlay integration.
- **Antwerp note:** the Schelde estuary and port waterfront create significant waterway-adjacency
  context for Antwerp parcels. Confirm whether any Flemish waterway layer carries navigable-zone or
  port-exclusion attributes relevant to the buildable-envelope calculation.
