# France — Parks / Trees (context layer)

> Part of the 3D-Context-Data country study. See `../README.md §3`.
> **Verify every endpoint live** before relying on it.

- **Primary source:** IGN **BD TOPO®** — feature type `ZONE_DE_VEGETATION` + LiDAR HD classified vegetation points (11-class scheme includes low/medium/high vegetation)
- **Fallback:** OpenStreetMap / Overture — where BD TOPO vegetation coverage is insufficient
- **Integration effort:** LOW (LiDAR HD vegetation is co-classified with buildings; no separate dataset)
- **Key advantage over Barcelona:** LiDAR HD delivers vegetation classification **bundled** with building point cloud — no separate tree dataset acquisition needed

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| IGN BD TOPO® — vegetation zones | `data.geopf.fr/wfs` | `BDTOPO_V3:zone_de_vegetation` | Etalab 2.0 | Object-level polygons; includes `NATURE` field (forêt, bois, lande, etc.) |
| IGN LiDAR HD — classified veg points | `lidarhd.ign.fr` (tiles) | Classes 3/4/5 = low/medium/high vegetation | Etalab 2.0 | Co-published with building points in same tile download |
| OSM / Overture | `overturemaps.org` / Overpass API | `leisure=park`, `natural=wood`, etc. | ODbL | Fallback — use where BD TOPO insufficient |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Object-level park polygons available? | YES (research-confirmed — BD TOPO `zone_de_vegetation`) | NOT YET live-probed |
| Tree/individual tree point data? | Via LiDAR HD classified points (classes 3–5) — not individual tree objects, but point cloud | NOT YET live-probed |
| CRS | Likely EPSG:4326 or EPSG:2154 (Lambert-93) | Request `SRSNAME=EPSG:4326` |
| Licence (verbatim) | Etalab 2.0 | Check live response |
| Vegetation bundled with building LiDAR tile? | YES — same tile download; 11-class scheme includes veg classes | Research-confirmed |
| Fallback condition | OSM/Overture when BD TOPO zone_de_vegetation is absent for a bbox | TBD |

**Probe command:**
```bash
curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=BDTOPO_V3:zone_de_vegetation\
&BBOX=2.3460,48.8520,2.3600,48.8600,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=10&OUTPUTFORMAT=application/json" | python3 -m json.tool | head -60
```

## Implementation notes (fill during Phase 2)

- LiDAR HD vegetation classification (classes 3/4/5 = low/medium/high veg) arrives in the same tile as building points — process in the same pipeline pass, not a separate fetch
- For context rendering, use `ZONE_DE_VEGETATION` polygons (BD TOPO) as the primary objects; individual tree positions from LiDAR canopy points where needed for shadow analysis
