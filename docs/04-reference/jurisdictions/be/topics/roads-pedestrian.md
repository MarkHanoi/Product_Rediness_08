# Belgium — Roads / Pedestrian Infrastructure (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Target:** road centre-lines, pedestrian paths, street widths (relevant to Brussels RRU Titre I
  setback formulas: H = P + 3.00 + D, where P = rue width)
- **Primary source (all regions):** OpenStreetMap (ODbL) — immediate availability, no key
- **Secondary source (Brussels):** UrbIS — Brussels' own base reference dataset; confirmed as a
  named WMS/WFS service at `geoservices-urbis.irisnet.be`; attribute schema not yet probed
- **Secondary source (Flanders):** GRB road/path layers (Informatie Vlaanderen) — free; robots-blocked
- **Integration effort:** LOW–MEDIUM. OSM immediately available. Brussels-specific street-width
  data is important because the RRU Titre I height formula uses `P` (rue width) as an input.

---

## Source details

| Source | Region | Endpoint | Feature type | Licence | Status |
|---|---|---|---|---|---|
| OpenStreetMap (Overpass API) | All | `overpass-api.de/api/interpreter` | `highway=*`, `footway`, `pedestrian`, `width` tag | ODbL | Immediately available |
| UrbIS | Brussels | `geoservices-urbis.irisnet.be/geoserver/ows` | Road network, building footprints, administrative boundaries | TBD | ❔ Service confirmed; GetCapabilities not run; field schema unknown |
| GRB road/path layers | Flanders | `geoservices.informatievlaanderen.be` | Road centrelines, paths (GRB topography) | Free ("kosteloos") | ⚠ Robots-blocked; confirmed via cache |
| PICC road layer | Wallonia | `geoservices.wallonie.be/geoserver/picc/ows` | Road network (PICC continuous cartography) | TBD | ❔ Existence confirmed via aggregator; not probed |

---

## Brussels-specific note: street width as RRU Titre I input

Brussels' RRU Titre I height formula uses the **rue width (P)** as a direct input:
`H = P + 3.00 + D` (where D = depth of the parcel and H = maximum building height).

This means **street-width data is not merely context** for Brussels — it is a required input to the
height rule calculation. Source options for rue width in Brussels:
1. UrbIS road network (if it carries a `largeur_rue` or `width` attribute — not yet confirmed)
2. OSM `width` tag on `highway=*` features (coverage inconsistent)
3. Geometric derivation from building-footprint polygons on both sides of the road (last resort)

**Before authoring any Brussels pack, confirm whether UrbIS carries a queryable street-width
attribute.** This is a precondition for implementing the Titre I formula algorithmically rather
than requiring a manual lookup.

```bash
# UrbIS WFS — check GetCapabilities for road layer attribute schema
curl "https://geoservices-urbis.irisnet.be/geoserver/ows\
?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i "rue\|road\|street\|width\|largeur"
```
