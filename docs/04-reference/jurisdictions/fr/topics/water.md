# France — Water (context layer)

> Part of the 3D-Context-Data country study. See `../README.md §3`.
> **Verify every endpoint live** before relying on it.

- **Primary source:** IGN **BD TOPO®** — feature types `COURS_D_EAU` (rivers/streams) + `SURFACE_HYDROGRAPHIQUE` (water body polygons)
- **Flood zone overlay:** GPU SUP layer (`ZONE_INONDABLE` or SUP type `PM1`/`PM2`) — structurally queryable via API Carto today
- **Integration effort:** LOW (same BD TOPO WFS, same Etalab 2.0 licence)

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| IGN BD TOPO® — rivers/streams | `data.geopf.fr/wfs` | `BDTOPO_V3:cours_d_eau` | Etalab 2.0 | Line geometry; includes `LARGEUR` (width) attribute |
| IGN BD TOPO® — water surfaces | `data.geopf.fr/wfs` | `BDTOPO_V3:surface_hydrographique` | Etalab 2.0 | Polygon geometry for lakes, basins, harbours |
| GPU SUP — flood zones | `apicarto.ign.fr/api/gpu` (SUP layer) | `servitude_utilite_publique_pm*` | Open | Flood risk overlay, **structurally queryable today** — unlike Ciutat Vella heritage overlay. Include in site pipeline. |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Object-level water polygons available? | YES (research-confirmed — BD TOPO `surface_hydrographique`) | NOT YET live-probed |
| River/stream lines available? | YES — `cours_d_eau` feature type | NOT YET live-probed |
| Flood zone overlay queryable? | YES — GPU SUP layer (research-confirmed for SUP type PM1/PM2) | NOT YET live-probed — confirm SUP type codes for flood zones |
| CRS | Likely EPSG:4326 or EPSG:2154 | Request `SRSNAME=EPSG:4326` |
| Licence (verbatim) | Etalab 2.0 | Check live response |

**Probe commands:**
```bash
# BD TOPO water surfaces — Seine in Paris
curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=BDTOPO_V3:surface_hydrographique\
&BBOX=2.3460,48.8490,2.3600,48.8580,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=5&OUTPUTFORMAT=application/json" | python3 -m json.tool | head -40

# GPU SUP — flood zone overlay for a Seine-adjacent parcel
curl "https://apicarto.ign.fr/api/gpu/zone?lon=2.3470&lat=48.8500" | python3 -m json.tool
```

## Implementation notes (fill during Phase 2)

- Flood zone SUP query should run as part of the site pipeline for every French parcel — the result is structurally queryable (unlike ABF perimeters) and should surface as a site overlay flag in the UI
- SUP types to include: `PM1`/`PM2` (flood risk plans), `PPRn` (natural risk prevention plans) — confirm exact type codes from a live probe response
