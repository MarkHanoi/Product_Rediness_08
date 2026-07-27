# Parcel-select coverage — per-country reachability (L-613)

**What this is.** The map's "Select parcel" mode turns a click into the plot boundary. Until
L-613 the only wired provider was Spain's Catastro, so a click outside Spain resolved nothing
(L-613 gap). This file is the evidence table behind the per-jurisdiction **parcel-provider
registry** (`packages/site-parcel-data/src/parcelProviders/registry.ts`): every country PRYZM
was asked to reach, the cadastre endpoint, whether it was **live-probed reachable keylessly**,
and whether it is **wired to a cadastre** or falls back to the **OSM building footprint**.

**Honesty rule (C58 §1.4).** A cadastre is wired ONLY if a live probe returned a real parcel
polygon **keylessly**. Everything else falls back to the OSM footprint, which is labelled
`footprint (OSM)` in the UI and is **never** presented as a legal cadastral parcel — a footprint
is the building outline, not the land boundary.

All probes run 2026-07-24 from the PRYZM build environment (no gov API keys, no VPN).

---

## Coverage table

| Country / region | Cadastre endpoint (typeName) | Probed reachable? — verbatim evidence | Verdict |
|---|---|---|---|
| **Spain** (ES) | `ovc.catastro.meh.es` OVC `Consulta_RCCOOR_Distancia` + INSPIRE WFS `GetParcel` | ✅ live since L-380 (the original pilot; keyless) | **WIRED** → `/api/catastro/parcel` (`catastro`) |
| **France** (FR) | `data.geopf.fr/wfs` `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle` | ✅ `HTTP 200 application/json`, real MultiPolygon `parcelle.94439632`, props `idu=75104000AE0003 contenance=15168` @ Paris | **WIRED** → `/api/parcel/fr` (`ign-fr`) |
| **Netherlands** (NL) | `service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0` `kadastralekaart:Perceel` | ✅ `HTTP 200 application/json`, `numberMatched:1`, real Polygon `perceel …` props `ASD04 F 6685, kadastraleGrootteWaarde 9402` @ Amsterdam | **WIRED** → `/api/parcel/nl` (`pdok-nl`) |
| **Norway** (NO) | `wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig` `app:Teig` | ✅ `HTTP 200 GML 3.2.1`, real teig polygon, `teigId 291175379 kommune 0301 gnr/bnr 208/644` @ Oslo (posList **lon,lat**) | **WIRED** → `/api/parcel/no` (`geonorge-no`) |
| **Germany — NRW** (DE-NW) | `www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht` `ave:Flurstueck` | ✅ `HTTP 200 GML 3.2.1`, `numberReturned=1`, real Flurstück `flstkennz 05311000400273, flaeche 2355.0, gemarkung Altstadt` @ Düsseldorf (posList **lat,lon**) | **WIRED** → `/api/parcel/de-nrw` (`alkis-nrw`) |
| **Germany — other Länder** (DE) | ALKIS is per-Land licensed; no keyless national WFS | ⚠️ NRW is the one open Land; the rest require a per-Land licence/registration | **FOOTPRINT** — wire a per-Land open WFS or a licence to upgrade |
| **Switzerland** (CH) | `api3.geo.admin.ch` REST `identify` on `ch.kantone.cadastralwebmap-farbe` (federal AV *Grundstück*) | ✅ `HTTP 200` Esri-JSON, real parcel ring + `egris_egrid CH119192997709, number AA8048, ak ZH` @ Zürich (and the *endpoint* also serves GE: `egris_egrid CH453165896335, ak GE`) — **keyless, all-canton, from a non-CH egress** (2026-07-26). ⚠️ The earlier "no free Liegenschaft layer" verdict was for the **different** `geodienste.ch/av_0` WFS host; the federal identify service *does* serve parcels. **Licence:** geo.admin.ch FSDI — free, commercial OK, fair-use ~20 req/min avg, attribution "© swisstopo + canton". | **WIRED** → `/api/parcel/ch` (`swisstopo-av`), an Esri-JSON source in `euCadastreProxy.js`. See `ch/findings/ZURICH-PARCEL-SOURCE.md`. ⚠️ Geneva coarse-routes to the FR proxy (see tradeoffs). |
| **Denmark** (DK) | Datafordeler Matrikel WFS `mat:Jordstykke` (EPSG:25832) | ❌ **not keyless** — every anonymous probe → `HTTP 404` (Datafordeler's unauthenticated response; host reachable at `87.60.242.40`, `Server: datafordeler.dk`). Needs a **free Datafordeler service user** (username+password) | **WIRED (credential-gated)** → `/api/parcel/dk` (`matrikel-dk`), a Catastro-shaped clone. Carries `DATAFORDELER_USERNAME`/`PASSWORD` server-side + reprojects UTM32N→WGS84. Resolves real parcels once the credential is set; footprint-falls-back until then |
| **Saudi Arabia** (SA) | Balady / U-Maps municipal cadastre | ❌ IP geo-fenced (WAF blocks non-SA IPs, L-606) — not reachable from our environment | **FOOTPRINT** — needs an in-SA proxy or a MOMRAH data agreement |
| **rest of world** | — | no cadastre wired | **FOOTPRINT** (universal fallback) |

Opportunistic probes not yet wired (IT/BE/PT/SE/US) fall to the universal footprint; each is a
future registry row once live-probed keyless.

---

## How routing works

1. `resolveParcelJurisdiction(lat, lon)` (pure, in `@pryzm/site-parcel-data`) routes the click to
   the country whose **coarse national bbox** contains it — the national analogue of the way the
   zoning dispatch routes on city predicates (`isInBarcelona`, …). Bboxes overlap at borders, so
   the registry order encodes the tie-breaks (NRW before NL; Switzerland before the Germany
   footprint). A misroute to a neighbour's cadastral proxy is **self-correcting**: that proxy
   returns `null` for a point outside its territory, and the client falls to the footprint.
2. **Cadastral** jurisdiction → the editor hits the same-origin proxy
   (`/api/parcel/<cc>` or `/api/catastro/parcel`); on a **hit** it returns the real parcel.
3. On a **miss** (or a footprint-fallback jurisdiction) → the **universal OSM footprint**
   (`FootprintParcelProvider`), labelled `footprint (OSM)`.

## Files (L-613)

- `packages/site-parcel-data/src/parcelProviders/registry.ts` — the pure routing table + verdicts.
- `packages/site-parcel-data/src/parcelProviders/countryBbox.ts` — national bbox predicates.
- `server/euCadastreProxy.js` — the same-origin proxy for FR/NL/NO/DE-NRW (WFS → WGS84 ring).
- `apps/editor/src/ui/site/parcel/WfsParcelProvider.ts` — the generic proxy-backed client provider.
- `apps/editor/src/ui/site/parcel/FootprintParcelProvider.ts` — the universal OSM-footprint fallback.
- `apps/editor/src/ui/site/parcel/parcelRegistry.ts` — the client dispatcher (`defaultParcelProvider`).

## Coarse-router tradeoffs (documented, not silent)

- **Corsica → footprint.** `FRANCE_BBOX.maxLon` is 8.3° (mainland France's eastern edge) so it
  does not swallow Zurich (8.54°E). Corsica (~9.5°E) therefore routes to the footprint; a polygon
  gate would be needed to include it without Swiss bleed.
- **NL/DE and CH/DE border towns** may route to the neighbour and self-correct to the footprint —
  acceptable for a proximity gate whose only hard requirement is that each country's interior
  routes to its own cadastre.
- **Geneva (CH) → FR proxy → footprint.** Geneva (6.14°E, 46.20°N) sits inside `FRANCE_BBOX`, which
  precedes CH in the registry order, so a Geneva click resolves via the French cadastre (which
  returns null for Swiss soil → OSM footprint). The swisstopo endpoint *does* serve Geneva parcels
  (live-probed), but Geneva is nearly encircled by France, so reaching it needs a polygon gate, not
  a bbox — reversing the FR/CH order would instead sacrifice French Alpine border towns inside
  `SWITZERLAND_BBOX`. Zürich (8.54°E) is east of France's 8.3° edge and routes to CH correctly.
