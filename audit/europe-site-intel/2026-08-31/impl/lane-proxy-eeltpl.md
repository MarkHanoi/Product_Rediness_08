# LANE PROXY-EE-LT-PL — the E9 registration wave's named residual: three proxy legs (2026-09-02)

**State before:** `server/jurisdiction/euCadastreProxy.js` had legs for fr, nl, no, de-nrw, ch,
pt, us-sf, us-chi — and NONE for ee, lt, pl. The registry rows (committed at `c5d0109c`) routed
correctly and the adapters were LIVE-PROVEN, but a production click resolved `null` at
`/api/parcel/{ee,lt,pl}` (404 — no table row) and fell to the OSM footprint.

**State after:** all three legs exist as **table rows** in `EU_CADASTRE_SOURCES`, each
live-leg-probed to the acceptance identifier. No route registration changed — the
`/api/parcel/:cc` catch-all in `server/jurisdiction/index.js` already serves any table key.

## Row vs DK-module — the decision, per country (same answer three times, argued once)

DK earned its own module (`dkMatrikelProxy.js`, stacked before the `/:cc` catch-all) because it
needs FOUR things a table row cannot express: a CREDENTIAL gate (Datafordeler API key from env),
a Snyder EPSG:25832→WGS84 reprojection, a second-fetch ATTRIBUTE JOIN (lodflade→jordstykke for
matrikelnummer), and a two-leg fallback (keyed WFS → keyless DAWA). EE, LT and PL each need NONE
of them: one keyless GET, WGS84 geometry returned **server-side by the upstream itself**
(srsName / outSR / srid=4326 — each MEASURED live, below), identity + area + address on the same
response. That is exactly the FR/NL/PT/CH row shape, so each is a row. A DK-style module here
would have been structure without a payer.

## What the adapters pinned vs what the proxy needed — the ONE deliberate delta per country

The adapters (`packages/site-parcel-data/src/countryAdapters/{ee,lt,pl}/`) keep geometry in the
NATIVE CRS for measurement (E1a discipline). The browser's "Select parcel" needs WGS84 rings.
Each leg mirrors its adapter's endpoint/params/classification verbatim and differs ONLY in the
output-CRS request — measured live 2026-09-02 before wiring (probe scripts + raw transcripts in
the session scratchpad; the load-bearing lines are quoted verbatim below):

| cc | adapter's pinned shape | proxy's measured delta |
|---|---|---|
| ee | `gsavalik.envir.ee/geoserver/kataster/ows`, `kataster:ky_kehtiv`, lat,lon urn-4326 bbox (native L-EST97 out) | `+srsName=EPSG:4326` → GeoJSON `[lon,lat]` degrees (adapter header already recorded "srsName honoured for 4326") |
| lt | `osp-sdg.stat.gov.lt …/ntr_sklypai/FeatureServer/0/query`, POST, point intersects, explicit outFields, `outSR=3346` | GET (a point fits a URL; `fetchTextOnce` is GET-only — the adapter POSTs only because a parcel RING does not fit) + `outSR=4326` → esri rings `[lon,lat]` degrees |
| pl | `uldk.gugik.gov.pl GetParcelByXY`, `xy=LON,LAT,4326`, pinned `result=` field order, `SRID=2180` WKT out | `+srid=4326` → the SAME record serves `SRID=4326;POLYGON((lon lat …))` degrees |

Measured verbatim (2026-09-02):

```
EE  GetFeature …&srsName=EPSG:4326&bbox=59.43665,24.75324…,urn:ogc:def:crs:EPSG::4326
    → HTTP 200, 3 features; tunnus 78401:114:0086 | l_aadress "Viru väljak" | pindala 11445
    | first vertex [24.75354234,59.43738164]        (lon,lat DEGREES — the delta works)

LT  …/query?f=json&geometry={"x":25.24374,"y":54.69317,…}&inSR=4326&outSR=4326&outFields=…
    → HTTP 200, 1 feature; kadastro_nr 0101/0039:1406 | unikalus 440021798516
    | skl_plotas 0.4402 (HECTARES) | sav_pavad null | first vertex [25.2438…,54.6933…]
    (control: 54.6872,25.2797 Gedimino pr. → 0 features — the measured unparcelled-land absence)

PL  GetParcelByXY&xy=22.9305,54.10166,4326&result=id,…,geom_wkt&srid=4326
    → HTTP 200, status token `0`; 206301_1.0005.11523/3|podlaskie|powiat Suwałki|Suwałki (miasto)
    |Obręb Nr 5|11523/3|SRID=4326;POLYGON((22.9301330138031 54.099876968008,…
    (control without srid= → the SAME record with SRID=2180 metres — the delta is real)
```

## Honesty classifications carried over from the adapters (the part a naive row would have lost)

- **LT measured fact 3** (`ltArcgisClient.ts`): ArcGIS answers a BAD REQUEST with **HTTP 200 +
  `{"error":{…}}`**. A new `arcgis` format pre-check classifies that `unreachable`, never `empty`.
  (New format rather than reusing `esrijson`: the FeatureServer envelope is `features`+`attributes`,
  CH identify's is `results`+`attributes` — and CH's documented behaviour of letting an error body
  read as a clean miss is left untouched, deliberately: changing a wired country's semantics is
  not this lane's brief.)
- **PL measured fact 1** (`plUldkClient.ts`): EVERY ULDK answer is HTTP 200 — the status is the
  FIRST TOKEN OF THE BODY. New `uldk` format: `0`+records → candidates; `-1 brak wyników` →
  `empty` (durable absence); bad-parameter body / other `-1` / `0`-with-no-record → `unreachable`.
- **PL srid guard:** a record declaring any SRID other than 4326 is skipped, never passed through
  as fake degrees.
- **LT unit trap:** `skl_plotas` is HECTARES → `×10 000` in the row's normalise, mirroring the
  adapter's one unit transform. Live probe returns areaM2 4402 for the 0.4402 ha parcel.
- `source` values are the registry rows' providerIds (`ee-maaamet-kataster`,
  `lt-rc-ntr-parcels-featureserver`, `pl-gugik-uldk`) — one spelling per source (C84 EI-9), not
  new short names.

## Executed proof (all foreground, RC read immediately)

**(a) Server proxy tests** — `server/__tests__/{ee,lt,pl}ParcelProxy.test.ts`, one per country,
mirroring `dkMatrikelProxy.test.ts`'s shape (captured fixture drives the leg + the issued URL is
asserted against the adapter's measured request shape). Targeted run with neighbours:
`npx vitest run --config vitest.server.config.ts server/__tests__/{ee,lt,pl}ParcelProxy.test.ts
euCadastreProxy.test.ts dkMatrikelProxy.test.ts jurisdictionRouter.test.ts` →
**RC=0 · 6 files · 53 passed**.

**(b) LIVE probe through the actual leg function** (`resolveEuParcelOutcome`, real fetch):

```
PASS ee Tallinn (Viru väljak): outcome=ok refcat=78401:114:0086 (expected 78401:114:0086) areaM2=11445 address="Viru väljak" ringLen=25 firstVertex={"lat":59.43738164,"lon":24.75354234}
PASS lt Vilnius (Žvėrynas): outcome=ok refcat=0101/0039:1406 (expected 0101/0039:1406) areaM2=4402 address=null ringLen=18 firstVertex={"lat":54.69332046149317,"lon":25.243859848431104}
PASS pl Suwałki: outcome=ok refcat=206301_1.0005.11523/3 (expected 206301_1.0005.11523/3) areaM2=985 address="Suwałki (miasto)" ringLen=13 firstVertex={"lat":54.1015905802638,"lon":22.9301330138031}
PASS lt Gedimino pr. (unparcelled) → outcome=empty
PASS ee @ Paris → outcome=out-of-area
```
(RC=0. Vilnius probe point 54.69317,25.24374 is INSIDE parcel 0101/0039:1406 — derived by
attribute-resolving the acceptance kadastroNr and point-querying back; the city-centre point the
routing tests use, 54.6872,25.2797, is the adapter's measured unparcelled-land `absent`/`empty`,
live-confirmed above, so it can never be a parcel-identity acceptance point.)

**(c) `npm run test:server`** → **RC=0 · 54 files · 803 passed** (includes the 3 new files; zero
pre-existing reds to name).

**(d) tsc + registry suites** — server legs are `.js` (outside tsc); the TS edits
(registry.ts notes + the flipped §8 pin) keep scoped
`tsc -p packages/site-parcel-data --noEmit` → **RC=0**, and
`npx vitest run __tests__/parcelRegistryNationalWiring.test.ts __tests__/parcelRegistry.test.ts`
→ **RC=0 · 2 files · 99 passed**.

## Falsification

Swapped the PL leg's `xy=` to LAT-first in the working file (the exact silent-failure trap the
adapter measured) → `plParcelProxy.test.ts` **RC=1, 1 failed / 5 passed**, naming the mismatch:
`expected '…' to contain 'xy=22.9305,54.10166,4326' — Received "…&xy=54.10166,22.9305,4326&…"`.
Restored byte-identically: sha256 `2f0682f2a6f7a46de91ffe88dd17cbc4d41c499643320fc5657df78c6448e21e`
before == after. Full `test:server` re-ran green AFTER the restore (the (c) run above).

## Files touched (complete)

- `server/jurisdiction/euCadastreProxy.js` — header WIRED list + row-vs-module rationale; new
  `arcgis` + `uldk` parsers/classifiers; `eeUrl`/`ltUrl`/`plUrl`; three table rows; format
  dispatch + honesty pre-checks in `resolveEuParcelOutcome`.
- `server/__tests__/eeParcelProxy.test.ts` · `ltParcelProxy.test.ts` · `plParcelProxy.test.ts` — NEW.
- `server/__tests__/euCadastreProxy.test.ts` — the pinned wired-cadastre set gains ee/lt/pl.
- `packages/site-parcel-data/src/parcelProviders/registry.ts` — the three row notes now say the
  leg is WIRED (one line each), quoting the live-leg identifiers.
- `packages/site-parcel-data/__tests__/parcelRegistryNationalWiring.test.ts` — the stale header
  claim corrected (quoted + marked false, house style) and the §8 honesty pin FLIPPED from
  `toContain('NOT yet wired')` to `toContain('WIRED server-side 2026-09-02')` +
  `not.toContain('NOT yet wired')` — same rule, new truth.

## Refused / not done, and why

- No `server/jurisdiction/index.js` change: the `/:cc` catch-all already serves the new keys;
  adding per-country routes would create the specific-before-param ordering hazard DK's comment
  warns about, for zero behaviour.
- CH `esrijson` error-body semantics left as documented (error → clean miss): out of lane scope;
  flagged here as a candidate for the same `unreachable` upgrade the `arcgis` format got.
- No commit (orchestrator commits); `packages/schemas/**`, `apps/editor/**`, `tools/**`,
  `packages/family-*/**`, `packages/file-format/**` untouched.
