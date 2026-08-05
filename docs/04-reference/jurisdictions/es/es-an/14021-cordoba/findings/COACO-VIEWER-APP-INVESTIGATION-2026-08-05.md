# COACo Viewer App (`visor.pgou.coacordoba.org/app/`) Investigation — 2026-08-05

## Question

Does the interactive PGOU viewer at `https://visor.pgou.coacordoba.org/app/` expose the same
2-district pilot (`coaco:ordenanzas`, Sur + Noroeste, 453 polygons, ~4.96 km²) already documented,
or does it call a different/broader backend covering more of Córdoba?

## Method

The app is a Vite/React SPA (`/app/assets/index-c4150013.js`, ~4.6 MB minified bundle). WebFetch
only sees the empty HTML shell (`<div id="root">`), so the raw JS bundle was pulled directly with
`curl` and grepped for endpoint strings, layer names, and service config objects.

## Backend identified

The app's config object (`Ya = {... SERVICE_WFS, LAYERS, zonas ...}`) hard-codes:

- WFS/WMS base: `https://geoserver.pgou.coacordoba.org/geoserver/coaco/ows` and
  `.../geoserver/coaco/wms` — **same host, same `coaco` workspace** as the already-documented
  GeoServer.
- A CORS proxy: `https://visor.pgou.coacordoba.org/api/?url=<encoded target>` — the app doesn't
  call GeoServer directly, it routes through its own proxy, but the proxy target is the same
  GeoServer.
- A Catastro proxy: `https://visor.pgou.coacordoba.org/api/catastro/` — forwards to Spain's
  national Sede Catastro service (`ovc.catastro.meh.es`), independent of COACo's own data.
- Declared layers (`MG` array): `ambito` (→ `coaco:distritos`), `parcelario_urbanismo`,
  `distritos`, `hojas_cus`, `ordenanzas`, `usos_dotacionales`, `usos_globales`, `actuaciones`,
  plus base layers (PNOA, OSM, Carto Dark) and a live `catastro` WMS overlay
  (`ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx`, `LAYERS=Catastro`).
- Generic WFS helper: `SERVICE_WFS.url + "&typeName=coaco:" + <layer> + "&outputFormat=..."` —
  confirms every COACo layer the app can fetch lives in the same `coaco:` workspace already known.

**Conclusion: same backend, same workspace, same layer name (`coaco:ordenanzas`).** No different
or broader GeoServer instance was found.

## Direct coverage test (outside the known pilot bbox)

Queried `coaco:distritos` (the "ambito" / working-area layer) directly:

```
GET https://geoserver.pgou.coacordoba.org/geoserver/coaco/ows?service=WFS&version=1.0.0
    &request=GetFeature&typeName=coaco%3Adistritos&outputFormat=application%2Fjson
```
→ `"totalFeatures":2"` — exactly **"Sur" (zona 01, 248.9 ha)** and **"Noroeste" (zona 02, 247.2
ha)**. No other district exists in this layer. This directly confirms item 4 of the task: there is
no hidden broader district list — the app's own district layer enumerates only the 2 known pilot
zones.

Investigated the founder's screenshot location (Calle Eduardo Dato / González López, near the
Roman Bridge, Distrito Centro — geocoded via Nominatim to `37.8838, -4.7842`, well outside the
Sur/Noroeste polygons). Queried every COACo vector layer with a tight BBOX around that point:

| Layer | Result at Eduardo Dato (37.8835–37.8840, -4.7845–-4.7838) |
|---|---|
| `coaco:ordenanzas` | `totalFeatures:0` |
| `coaco:actuaciones` | `totalFeatures:0` |
| `coaco:usos_globales` | `totalFeatures:0` |
| `coaco:usos_dotacionales` | `totalFeatures:0` |
| `parcelario_urbanismo` (WMS GetFeatureInfo) | `numberReturned:0` |
| `coaco:hojas_cus` | 1 hit — sheet `CUS26W`, a **scanned plan-sheet index** (raster JPG reference, not parcel data) |

Every COACo *data* layer (zoning, uses, actions, catastro-joined parcels) is empty at this
location. Only `hojas_cus`, which is just a grid index of scanned PDF/JPG sheet images covering
the whole city as printed-plan references (not usable vector/attribute data), returns anything.

## The roman-numeral labels — explained, not a new discovery

The bundle shows the roman-numeral floor-count labels the founder saw come from a **separate,
independent, nationally-run layer**: `ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx`
(`LAYERS=Catastro`) — Spain's official Dirección General del Catastro cartography WMS, which
nationally renders building outlines with roman-numeral floor-count symbology as standard
cadastral cartographic convention. This is wired into the app as the toggleable "Servicio WMS
Catastro" layer (`name:"catastro"`), turned on independently of any COACo zoning layer. It is
**not** COACo-specific data and does not indicate broader `ordenanzas`/zoning coverage. Clicking a
parcel with the catastro toggle on calls `visor.pgou.coacordoba.org/api/catastro/` (a proxy to
the same national OVC service), which is why RC lookups like `3246108UG4934N` at Eduardo Dato 13
work everywhere in Spain — that's national Catastro identity/geometry data, unrelated to the
PGOU zoning pilot.

## Verdict

**Negative finding, independently confirmed from a second angle.** The viewer app is a nicer UI
in front of the exact same `geoserver.pgou.coacordoba.org/geoserver/coaco` backend and the exact
same 2-district (Sur + Noroeste) pilot already documented. It additionally surfaces Spain's
national Catastro WMS/proxy for building footprints and floor counts (which covers the whole
country, but is not COACo zoning/ordinance data) and a scanned-sheet index (`hojas_cus`, whole-city
raster references, not usable parcel data). No broader or different zoning/ordinance backend was
found. This corroborates, from an independent app-inspection angle, that the 453-polygon pilot is
the genuine extent of COACo's live vector PGOU coverage.
