# Liège (`lie-liege`) — per-field sources

**Status:** OPEN — no pack values verified. Plan de secteur endpoint VERIFIED LIVE; no GetFeature run for Liège; GCU adoption unknown.

> **Trust gate:** a field with NO citable source stays `null` in the pack.

## A — VERIFIED (research-cited)

| Field (pack key) | Value | Unit | Governing article | Document | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Plan de secteur zone layer | `LU.ZoningElement_pds` — 23 plans covering all of Wallonia, adopted 1977–1987, still fully in force | — | CoDT Art. D.I.1 and preceding CWATU provisions | WMS GetCapabilities 2026-07-24 | `geoservices.wallonie.be/geoserver/inspire_lu/ows` | `VERIFIED-LIVE` 2026-07-24 |
| Plan de secteur zone categories | Zone d'habitat, d'activité économique, agricole, forestière, espaces verts, etc. — broad affectation categories; NO height/FAR dimension | — | CoDT Art. D.I.1 et seq. | CoDT; confirmed from capabilities layer description | `geoservices.wallonie.be` | `published` (code categories) + `VERIFIED-LIVE` (endpoint) |
| Wallonia zoning licence | "Accès libre et gratuit au service pour tout public" — free, no key | — | SPW open-data policy | WMS `<AccessConstraints>` | `geoservices.wallonie.be` | `VERIFIED-LIVE` 2026-07-24 |
| OGC API Features endpoint | `geoservices.wallonie.be/geoserver/inspire_lu/ogc/features/v1/openapi` | — | OGC API Features Part 1 standard | HTTP 200, OpenAPI JSON 2026-07-24 | `geoservices.wallonie.be` | `VERIFIED-LIVE` 2026-07-24 |
| Wallonia planning code | CoDT (Code du Développement Territorial); reformed May 2025; successor to CWATU | — | CoDT | CoDT current consolidated text | `walllex.be` | `published` |
| Bon aménagement des lieux | CoDT Art. D.IV.13 — the operative standard for most specific Wallonia envelope questions; both load-bearing and derogation basis | — | CoDT Art. D.IV.13 | CoDT Art. D.IV.13 (May 2025) | `walllex.be` | `published` |
| GRU — indicative status | Guide régional d'urbanisme (GRU) is explicitly indicative, not binding | — | CoDT; GRU text | GRU text; confirmed from CoDT | `amenagement.wallonie.be` | `published` |
| Heritage layer (AWaP) | SPW Géoportail "Patrimoine — biens classés et zones de protection" — CC-BY 4.0 | — | CoPat (Code wallon du Patrimoine) | Géoportail de Wallonie catalogue | `geoportail.wallonie.be` | `stated` — CC-BY 4.0 and layer name confirmed; not independently fetched |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Plan de secteur zone affectation for any Liège parcel | GetFeature not yet run | `curl` the OGC API Features endpoint for a Liège parcel bbox (see `NEXT.md §3.2`) |
| Whether any numeric height/FAR attribute exists in `LU.ZoningElement_pds` features | GetFeature not yet run | Same probe; inspect full attribute list; expected: no numeric field |
| Whether Liège has adopted a GCU | Not confirmed in this pass | Search `liege.be` and `amenagement.wallonie.be` for "guide communal d'urbanisme Liège" |
| GCU numeric provisions (if GCU exists) | GCU existence unknown | Obtain and read GCU text; search for "hauteur," "gabarit," "implantation" |
| Wallonia PICC building-footprint schema | Not probed | `curl "https://geoservices.wallonie.be/geoserver/picc/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities"` |
| Wallonia LiDAR terrain product (density, coverage, endpoint) | Not probed | Search `geoportail.wallonie.be` for "LiDAR," "MNT," "MNH" |
| AWaP heritage layer attribute schema | Layer name confirmed; not fetched | GetCapabilities + GetFeature on the AWaP layer from `geoportail.wallonie.be` |
| Any height, FAR, setback, or gabarit value for any Liège parcel | No primary source read | Run full instrument cascade for a test parcel; read applicable GCU text (if adopted) |
