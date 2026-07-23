# France — Roads / Pedestrian (context layer)

> Part of the 3D-Context-Data country study. See `../README.md §3`.
> **Verify every endpoint live** before relying on it.

- **Primary source:** IGN **BD TOPO®** — feature type `TRONCON_DE_ROUTE` (road segments) + `SURFACE_DE_TRANSPORT` (road surfaces/pedestrian areas)
- **Fallback:** OpenStreetMap / Overture
- **Integration effort:** LOW (same BD TOPO WFS, same Etalab 2.0 licence, same endpoint)
- **Street width relevance:** unlike Barcelona (where *amplada de vial* drives the height table), French zoning does NOT key height on street width — but street geometry is still needed for urban-canyon context rendering and setback application

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| IGN BD TOPO® — road segments | `data.geopf.fr/wfs` | `BDTOPO_V3:troncon_de_route` | Etalab 2.0 | Includes `LARGEUR_DE_CHAUSSEE` (carriageway width) and `NOMBRE_DE_VOIES` fields |
| IGN BD TOPO® — transport surfaces | `data.geopf.fr/wfs` | `BDTOPO_V3:surface_de_transport` | Etalab 2.0 | Pedestrian areas, plazas, footpaths as polygons |
| OSM / Overture | Overpass API / `overturemaps.org` | `highway=*`, `footway=*` | ODbL | Fallback; generally good in French cities |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Object-level road polygons/lines available? | YES (research-confirmed — BD TOPO `troncon_de_route`) | NOT YET live-probed |
| Street width attribute available? | YES — `LARGEUR_DE_CHAUSSEE` field on `troncon_de_route` | NOT YET live-probed — verify field is non-null for a sample |
| Pedestrian surfaces as objects? | YES — `surface_de_transport` feature type includes pedestrian areas | NOT YET live-probed |
| CRS | Likely EPSG:4326 or EPSG:2154 | Request `SRSNAME=EPSG:4326` |
| Licence (verbatim) | Etalab 2.0 | Check live response |
| Fallback condition | OSM/Overture if BD TOPO road coverage is incomplete for a bbox | TBD |

**Probe command:**
```bash
curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=BDTOPO_V3:troncon_de_route\
&BBOX=2.3460,48.8520,2.3520,48.8560,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=10&OUTPUTFORMAT=application/json" | python3 -m json.tool | head -60
```

## Implementation notes (fill during Phase 2)

- `LARGEUR_DE_CHAUSSEE` gives carriageway width, not total street width including sidewalks — for urban-canyon analysis, prefer total cross-section width derived from the road surface polygon geometry
- Street width is NOT used by any current French zone height mechanism (unlike Barcelona's `amplada de vial`) — this layer is for context rendering only, not for rule-pack computation
