# Belgium — regions

Region-level notes for the Belgium jurisdiction adapter. Belgium requires **mandatory regional
routing** before any data query — spatial planning is a constitutionally exclusive regional
competence and the three regions share no zoning taxonomy, no exchange schema, and no heritage
register.

## The three regions

| Region | ISO 3166-2 | Code | Planning code | Zoning API | Heritage agency |
|---|---|---|---|---|---|
| **Flanders** | `BE-VLG` | VLG | VCRO | DSI WFS (`informatievlaanderen.be`) — robots-blocked; `mercator.vlaanderen.be` alternative | Onroerend Erfgoed (`geo.onroerenderfgoed.be`) — ✅ LIVE |
| **Wallonia** | `BE-WAL` | WAL | CoDT | SPW Géoportail `inspire_lu` WMS + OGC API Features — ✅ LIVE | AWaP (`geoportail.wallonie.be`) — stated |
| **Brussels-Capital** | `BE-BRU` | BRU | CoBAT | urban.brussels GeoServer — bot-blocked | Direction du Patrimoine culturel — unconfirmed |

## Routing logic

Route by which region polygon the target parcel's centroid falls into, then hand off to that
region's endpoint. A parcel cannot straddle a regional boundary — the Belgian constitution
establishes the three regions as mutually exclusive territorial units.

**Determine region from:** Belgian Lambert 72 (EPSG:31370) region boundary polygons, or ISO
3166-2 prefix of the NIS/INS municipality code:
- `1xxxx` → Brussels-Capital (`BE-BRU`)
- `2xxxx–7xxxx` → Flanders (`BE-VLG`) or Wallonia (`BE-WAL`) depending on municipality

The single exception is the German-speaking Community (a subset of Wallonia, NIS codes `6xxxx`
in the eastern cantons) — still governed by Wallonia's CoDT for spatial planning purposes.

## Federal layer (no regional routing needed)

The **federal cadastral parcel layer (CADMAP/CadGIS)** at
`ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/` is the one layer
that does NOT require regional routing — it covers all three regions identically through a single
national endpoint. Route the parcel-geometry query to the federal endpoint; route everything else
(zoning, height, setbacks, heritage, LiDAR) to the correct regional endpoint.
