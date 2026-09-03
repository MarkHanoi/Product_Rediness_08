# Lane LU-PARCEL — a LIVE Luxembourg parcel adapter (founder bug: click resolves nothing)

**Date:** 2026-09-03 · **Verdict: WIRED (live).** A Luxembourg click now resolves a real cadastral
parcel through the same-origin `/api/parcel/lu` proxy against the LIVE ACT / INSPIRE endpoint.

## The bug

At Luxembourg City the live log showed:
```
parcel-registry: no cadastre answered at 49.61195,6.12926 — falling back to the OSM footprint
footprint: no OSM building outline
```
→ nothing selectable. **Root cause:** the LU adapter was registered RULES-ONLY. The registry row
for `LU` was a `footprint-fallback` with `providerId: 'footprint'`, `proxyPath: null` — there was
no parcel source and no server proxy leg, so every Luxembourg click fell straight to the OSM
footprint (and central Luxembourg City has no OSM building outline at that point → dead click).

## Why the earlier "LU has no parcel source" verdict was too narrow

The E7-LU lane's verdict ("LU has no parcel source by design") was **about the national PAG
GeoPackage channel only** — it measured `PAG_PAG_FOND_DE_PLAN.NUM_CADAST` and correctly found it is
**not a key** (`"N/A"` on 4.9%, 15,110 duplicate `(commune, number)` groups, no cadastral section
served), so a key-join off the bulk GPKG would silently return the wrong polygon. That verdict was
never a survey of the **ACT cadastre**. The Administration du cadastre et de la topographie (ACT)
publishes the parcels on a **separate, live, keyless INSPIRE service** that resolves the parcel
*under a click by geometry* — exactly the click-to-select answer the GPKG could not give.

The E7-LU note "NO LIVE QUERY SERVICE EXISTS: wfs.geoportail.lu returns 000/0 bytes" is also
correct **for that host** — `wfs.geoportail.lu` does not resolve (confirmed this lane). The live
WFS lives on a **different host**: `wms.inspire.geoportail.lu`.

## Live probe (UA `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`)

| probe | result |
|---|---|
| `wfs.geoportail.lu/?…GetCapabilities` | **DNS FAIL** (host does not resolve) — matches the E7-LU 000/0 reading |
| `wms.geoportail.lu/geoserver/{wfs,ows}` | HTTP 404 "not found" |
| **`wms.inspire.geoportail.lu/geoserver/wfs?…GetCapabilities&VERSION=2.0.0`** | **HTTP 200, 1.44 MB, WFS 2.0.0**, keyless, `"CC0"` present. Layer **`cp:CP.CadastralParcel`** (Title "Cadastral Parcel") |
| GetFeature bbox @ 49.611,6.129 (`srsName=urn:…EPSG::4326`, GeoJSON) | **HTTP 200**, real parcels: `075F00461001970` (label 461/1970, 248.49 m²), `075F00460002287`, … WGS84 rings |

**Response shape** (per feature `properties`): `national_cadastral_reference` (e.g.
`075F00137000000`), `label` (`137` / `461/1970`), `area` + `area_uom:"m2"`,
`inspireid_identifier_localid`, `zoning` (`…LIMADM_SECTIONS.75F` → section `75F`),
`administrative_unit`. Geometry: WGS84 `[lon,lat]` when `srsName=EPSG:4326`.

## Two LU-specific measured facts that shaped the wiring

1. **A CQL `INTERSECTS(geometry, POINT(...))` returns 0 even at a known-interior point.** The CQL
   geometry literal carries no SRID, so GeoServer reads it in the layer's native **EPSG:2169**
   (LUREF metres), where a lon/lat degree pair falls outside Luxembourg → empty. The click path is
   therefore a **WGS84 urn-authority bbox** (`urn:ogc:def:crs:EPSG::4326`, lat,lon order), which the
   server reprojects as a filter. `srsName=EPSG:4326` returns WGS84 output.

2. **LU parcels are DENSE — `features[0]` is the WRONG parcel, and a coarse bbox truncates the true
   one.** A ~5 m click window straddles 3–4 parcels returned in feature-id order, not spatial order:
   at the founder click `features[0] = 075F00138000000` but the **containing** parcel is
   `075F00137000000`; at Esch `features[0]` was a neighbour, container `039A00606016640`. And the
   shared proxy window (`HALF_DEG` ±38 m) capped at `count=20` **truncated the true container out**
   of the returned set at Esch → point-in-polygon then mis-picked `039A00604016543`. So LU uses
   (a) its **own small window** (`LU_HALF_DEG` ±~11 m, `count=30`) and (b) **point-in-polygon**
   selection (the containing ring, else nearest centroid) — never `features[0]`. This is exactly the
   discipline the proxy's `pickCandidate` already implements; the package provider mirrors it.

## What was wired

- **Package adapter (new):** `countryAdapters/lu/luParcelProvider.ts` — the ACT/INSPIRE WFS client
  (FetchOutcome-classified GET: throw→transient naming endpoint, non-OK/OWS-exception→transient with
  server text, 200-empty→absent, ≥1 feature→found), a pure parser, pure point-in-polygon pick, and
  `resolveLuParcelAtWgs84Point`. Exposed on `luCountryAdapter.parcel.resolveAtWgs84Point`.
  **The rules half (`luPagProvider` / `resolveLuZoneChain`) is untouched** — one authority per
  concept (C84 EI-9); parcel and rules are joined by geometry (point ∈ parcel), never by NUM_CADAST.
- **Registry row (shared):** `LU` flipped `footprint-fallback` → `cadastral`,
  `providerId: 'lu-act-inspire-cp'`, `proxyPath: '/api/parcel/lu'`. `contains: claimsNation('LU')`
  unchanged. Because LU was already promoted to a claimable country in the L-12871 batch, this goes
  **live immediately** (unlike SI/LV/HR, which are dormant on the resolver gate).
- **Server proxy leg (shared):** `server/jurisdiction/euCadastreProxy.js` gains an `lu` entry in
  `EU_CADASTRE_SOURCES` + a `luUrl` builder (small window) + a header line. The generic
  `/api/parcel/:cc` route serves it with no route change.
- Exact shared-file edits recorded in `barrel-additions-lu-parcel.txt`.

## Acceptance (foreground, LIVE — through `resolveParcelWithFallback` → the proxy leg → ACT endpoint)

| point | resolved parcel (verbatim) | note |
|---|---|---|
| **Founder click 49.61195,6.12926** | **`075F00137000000`** (140.92 m², label 137) | the exact bug coordinate — now the CONTAINING parcel |
| **Esch-sur-Alzette 49.496,5.981** | **`039A00606016640`** (199.54 m², label 606/16640) | CONTAINING parcel |
| Acceptance 49.611,6.129 | `075F00421000009` (43.85 m²) | this exact coord is **public road** (no containing parcel); nearest-centroid, still a real LU parcel |

`resolveParcelWithFallback` correctly national-filters to the single `LU` candidate at each point
(`claimsNation('LU')`), so no wrong-country cadastre is even tried.

## Falsification (empty ≠ failure; never wrong-country; byte-identical restore)

Proven at the provider layer (`luParcelProvider.test.ts`, all green):
- **Sever the endpoint** (injected `fetchImpl` throws) → `transient`, reason `^endpoint-unreachable:`
  **naming `wms.inspire.geoportail.lu`** — never `absent`, never a FR/DE parcel (a LU body can only
  mint an LU reference).
- **200-empty FeatureCollection** → `absent` (`^no-parcel:`), a durable "nothing here", not a failure.
- **HTTP-400 OWS ExceptionReport** → `transient` carrying the server's own text.
- **Byte-identical restore** → re-running the recorded-live fixture yields the identical parcel + ring.

## Gates (foreground)

- scoped `tsc -p tsconfig.json --noEmit` (@pryzm/site-parcel-data) → **exit 0**
- `vitest run` full @pryzm/site-parcel-data → **200 files, 4199 passed, 3 skipped, 0 failed**
- server `euCadastreProxy.test.ts` → **24 passed**
- No concurrent-wave reds observed in the suite this session.

## Files touched

Owned: `countryAdapters/lu/luParcelProvider.ts` (new), `countryAdapters/lu/index.ts`,
`__tests__/luParcelProvider.test.ts` (new), `__tests__/fixtures/lu-luxcity/…json`,
`__tests__/fixtures/lu-esch/…json`.
Shared (recorded in barrel-additions): `parcelProviders/registry.ts`,
`server/jurisdiction/euCadastreProxy.js`, `server/__tests__/euCadastreProxy.test.ts`,
`__tests__/parcelRegistryNationalWiring.test.ts`.
Not touched: `src/index.ts` (already `export *`s `lu/index.js`).
