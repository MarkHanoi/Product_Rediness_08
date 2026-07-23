# Italy — Buildings, LOD, and Height Data

**Summary:** Italy has no national building-height product equivalent to France's BD TOPO `HAUTEUR`
or Germany's LoD2-DE. National LiDAR programs (PST/SIM) produce terrain/surface models only. What
building-height data exists is constructed per-region from each region's own topographic database,
with no coordinating federal body (no Italian equivalent of Germany's ZSHH). This makes building
height a genuine per-city research question, not a configuration toggle.

---

## National terrain program — PST/SIM (MASE)

| Attribute | Value |
|---|---|
| Programme | PST (Piano Straordinario di Telerilevamento) + PNRR SIM (Sistema Integrato di Monitoraggio) expansion |
| Operator | MASE — Ministero dell'Ambiente e della Sicurezza Energetica |
| Coverage | Historical: ~50% of national territory. PNRR target: **100% by 2026** |
| Resolution | 25 cm point cloud; derived DTM/DSM products |
| Vertical accuracy | ~8 cm |
| Product type | **DTM and DSM (terrain/surface models) only** — NOT a building model or semantic building layer |
| Licence | CC BY 4.0 (open, attribution required) |
| Direct analogue | France's LiDAR HD (same completion timeline, same terrain-only product at the raw level) |
| **Key gap** | PST/SIM does NOT produce per-building height attributes or LOD2-classified building geometries — a further processing step (point-cloud classification + building reconstruction) is needed, and that step has not been nationalised |

---

## Per-region building height — what exists

### Piedmont — ARPA Piemonte Edifici 3D ✅ Confirmed (research level)

| Attribute | Value |
|---|---|
| Dataset | Edifici 3D (ARPA Piemonte) |
| Coverage | Entire Piedmont region (including Turin) |
| Derivation | Per-building volumetric footprints + mean elevation, derived from BDTRE (Piedmont topographic database) combined with terrain-height data from PST/MASE or regional altimetric sources |
| Quality code | Includes per-building data-quality/derivation code |
| Licence | Regional — CC-style (exact terms TBD on live probe) |
| Endpoint | `opendata.arpa.piemonte.it` — WFS/download path not yet live-probed |
| Confidence | `corroborated` — dataset existence and method confirmed in research; endpoint and field schema TBD |
| Notes | If the height field is reliable for the Turin urban core specifically, Turin has the closest Italian analogue to Lyon Métropole's structured `HBCPRINC` attribute — the key differentiator from Milan and Rome |

### Lombardy — status unconfirmed

| Attribute | Value |
|---|---|
| Status | NOT CONFIRMED. Lombardy's Geoportale hosts PGT cartography per comune; whether a building-height attributed layer (LOD1+ equivalent) is published alongside is unknown. Milan's own SIT may carry building data; regional aggregation status TBD. |
| Inference | Northern, well-resourced region — has a mature regional topographic database; a building-height layer plausibly exists but has not been identified. |
| Action | Check `www.geoportale.regione.lombardia.it` WFS capabilities for building-height or 3D edifici layer |

### Lazio / Rome — status unconfirmed

| Attribute | Value |
|---|---|
| Status | NOT CONFIRMED. Rome's SIT (Sistema Informativo Territoriale) may carry building-footprint data; regional LOD aggregation unknown. |
| Action | Check `dati.lazio.it` or `geoportale.regione.lazio.it` for building-height or 3D edifici layer |

### All other regions

Assume building-height data is absent or unconfirmed unless a dedicated probe confirms otherwise.
The PRG regions (Umbria, Marche, Abruzzo, Molise) are lower-resourced and less likely to have a
dedicated 3D-buildings product. Do not assume presence.

---

## Comparison with France and Germany

| Country | National building-height product | Coordinator | Coverage |
|---|---|---|---|
| Germany | LoD2-DE (CityGML, ~58 M buildings, LiDAR-derived, ~1 m accuracy) | **ZSHH** (national body) | National; per-Land licensing |
| France | BD TOPO® `HAUTEUR` (continuous national attribute) | **IGN** (national body) | National; Etalab 2.0 (open) |
| **Italy** | **None** — PST/SIM produces terrain/surface only | No national building-model coordinator | Regional patchwork; Piedmont confirmed |

Italy's absence of a national building-model coordinator is a genuine structural gap, not a data-
currency lag. Even when PST/SIM reaches 100% terrain coverage by 2026, the building-classification
and building-reconstruction steps remain un-nationalised — each region must do its own processing
(as Piedmont has done with ARPA Edifici 3D).

---

## LOD achievability per target city

| City | LOD1 (footprint) | LOD1 (footprint + height) | LOD2 (roof shape) | Path |
|---|---|---|---|---|
| **Turin** | ✅ Catasto WFS (indicative) | ✅ **ARPA Piemonte Edifici 3D** (pending probe) | ❌ No confirmed source | PST/SIM point cloud → processing (long path) |
| **Milan** | ✅ Catasto WFS (indicative) | ❓ Unconfirmed — check Lombardy Geoportale | ❌ No confirmed source | — |
| **Rome** | ✅ Catasto WFS (indicative) | ❓ Unconfirmed — check Lazio geoportal | ❌ No confirmed source | — |

**Catasto geometry caveat:** Catasto planimetrie are not survey-grade — the same precision caveat as
French PCI Express. Use for zone identification, not for millimetre-accurate footprint work.

---

## Resume steps

1. **ARPA Piemonte Edifici 3D:** `curl "https://opendata.arpa.piemonte.it/api/3/action/package_search?q=edifici+3d" | python3 -m json.tool` — find WFS endpoint URL and field names; confirm `mean_elevation` or `altezza_media` field reliability.
2. **Lombardy building height:** check `https://www.geoportale.regione.lombardia.it/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` for a buildings/3D layer.
3. **PST/SIM tile download:** confirm whether 25 cm tiles for Turin, Milan, Rome bbox are available from the MASE open-data portal and can feed a standard point-cloud → building reconstruction pipeline.
