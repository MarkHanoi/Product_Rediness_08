# LANE SK — SLOVAKIA parcel adapter (europe-adapters-2 wave)

**Date:** 2026-09-03 · **Status:** SHIPPED — LIVE cadastre, routing DEFERRED (one boundary wave),
rules DOCUMENTS-ONLY. **No commit** (per brief; orchestrator owns commits + shared-file re-apply).

## Verdict in one line

Slovakia's cadastre is **live, keyless, and LIVE-PROVEN at Bratislava** — the parcel leg (the
deliverable) ships as a real working provider on the GR shape. The **only** open gate is JURISDICTION
ROUTING, deferred with the gate named + a reviewBy (the SE/GR pattern), because SVK is a
refusal-only NEIGHBOUR in the shared boundary set, not a claimable country.

## Channel (PROBED LIVE 2026-09-03 — reused + re-confirmed, not re-derived)

- **Sweep row** (`audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md` §SK): cadastre
  "INSPIRE WMS+WFS, HVD, daily; ZBGIS integrates cadastre + address register" — **GREEN**. Census
  row 25: **DOCUMENTS-ONLY** (planning pre-digital, state IS ~2028).
- **Where the parcels actually live (probed):** the sweep's ZBGIS hint
  (`zbgis.skgeodesy.sk/zbgis/rest/services`) carries **only raster/basemap** services (DMR, Ortofoto,
  ZBGIS, RA_Adresne_body) — **NO cadastre layer**. The cadastre is the separate ÚGKK/GKÚ **ESKN**
  service: **`https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer`** (ArcGIS 10.91,
  `copyrightText "© Úrad geodézie, kartografie a katastra SR"`, KEYLESS). Layer **9 "Plocha parcely
  C"** = C-register parcel AREA polygons (`Map,Query,Data`, `esriGeometryPolygon`).
- **LIVE CLICK PROOF — Bratislava Old Town (48.1436, 17.1077):** 1 feature →
  **register-C id `2090872505`, PARCEL_NUMBER `"15"`, CADASTRAL_UNIT_ID `2933`, area (Výmera SPI)
  `832 m²`, FOLIO_ID (list vlastníctva) `335384911`**, 23-vertex WGS84 ring, flagged a national
  cultural monument. `objectIds=2090872505` → same feature. Bodies recorded at
  `__tests__/fixtures/sk-bratislava-2026-09-03/recorded-live-2026-09-03.json`.
- **CRS:** layer stores EPSG:3857 (national CRS S-JTSK/EPSG:5514); reprojects **server-side** —
  click path asks `inSR=4326&outSR=4326`, gets a WGS84 ring (`spatialReference {wkid:4326}`).
- **⛔ WAF finding (measured):** the ESKN endpoint's WAF returns **HTTP 403** for any attribute
  `where=` clause (even `where=1=1`) — a SQL-injection guard. **`objectIds=` is NOT SQL and IS
  allowed** (HTTP 200). So the by-id lookup uses `objectIds`, never `where` — a by-`where` resolver
  would 403 on every call. This is why `resolveSkParcelByRegisterCId` is built on `objectIds`.
- **Failure vs empty (measured):** a point outside SK coverage (Vienna 48.2082,16.3738) → **HTTP
  200, `features: []`** (durable ABSENT). Transport throw / non-OK HTTP / the WAF 403 → TRANSIENT.

## Deliverables

- **`countryAdapters/sk/`** (sibling shape to EE/DK/GR):
  - `skJurisdiction.ts` — `SLOVAKIA_BBOX` (specificity metric ONLY), `isInSlovakia`,
    `claimsSlovakia` (delegates to the resolver — no bbox authority), and **`SK_ROUTING_DEFERRAL`**
    (assertable data record).
  - `skEsknClient.ts` — the ONE impure seam; **reuses `providers/containers/arcgisRest.ts`** for the
    point path (grep-first, C84 EI-9) + a hand-built `objectIds` by-id query; FetchOutcome
    classification (found/absent/transient DIFFERENT VALUES); encodes the 6 measured facts incl. the
    WAF-blocks-`where` constraint.
  - `skParcelProvider.ts` — `SkCadastralParcel` + `parseSkParcelFeature` (area carried VERBATIM,
    never derived from ring) + `resolveSkParcelAtWgs84Point` + `resolveSkParcelByRegisterCId`.
  - `skSources.ts` — `defineSources('SK', [...])`, ONE probed row (ESKN C-parcel layer), licence
    **YELLOW** (HVD + CC-BY tag are strong, endpoint terms unread).
  - `index.ts` — `skCountryAdapter` (§J shape), `rules.kind: 'documents-only'` (the honest
    no-rule-pack path — územné plány are PDFs; no rule mapper minted), `SK_APPLICABILITY_LADDER`.
- **Registry row** (`parcelProviders/registry.ts`) — `regionCode 'SK'`, `kind 'cadastral'`,
  `contains claimsNation('SK')`, proxyPath `/api/parcel/sk` (reserved); + `SK: SLOVAKIA_BBOX` in
  REGION_BBOX; + the import. **Shared file — additive; re-apply source is `barrel-additions-sk.txt`.**
- **Barrel export** (`src/index.ts`) — `export * from './countryAdapters/sk/index.js';` after gr.
- **Tests** — `__tests__/skEsknAdapter.test.ts` (18 tests, all inject `fetchImpl` — no live call)
  + the **recorded-live fixture**.

## The routing deferral (MEASURED, not assumed — [[probe-can-be-wrong-three-ways]])

`jurisdiction/data/nationalBoundaries.json` (retrieved 2026-09-01) models **20 claimable countries**
+ **16 refusal-only neighbours**. **SVK is a refusal-only NEIGHBOUR** (with rings), not in
`countries` — so `claimsNation('SK')` is **false everywhere**. I first wrote the evidence assuming
Bratislava refuses `claimed-by-unmodelled-neighbour`; **measuring the resolver corrected me**:

| Point | inside POLAND_BBOX? | resolver verdict |
|---|---|---|
| Bratislava, Košice | no | `no-national-candidate` (candidates `[]`) — no prefilter covers it |
| Žilina, Poprad, Orava, Bardejov (N. Slovakia) | **yes** | `claimed-by-unmodelled-neighbour` naming **SVK** (candidates `["POL"]`) |
| Warsaw (control) | — | **claims POL** (resolver is live) |

So SVK-as-neighbour is **already load-bearing**: at the northern band it refuses the POL candidate
instead of misrouting Slovak land to Poland (the L-12887 protection). It just cannot be *claimed*
until promoted.

**Retirement (a shared boundary wave, NOT this lane's — `SK_ROUTING_DEFERRAL`, reviewBy 2026-12-03):**
(a) move SVK from `neighbours` to `countries.SVK` (regionCode `'SK'`); (b) add `['SVK', isInSlovakia]`
to `CANDIDATE_PREFILTERS`; (c) add **HUN** as a new refusal-only neighbour (SK's only land neighbour
absent — CZE/AUT/UKR already neighbours, POL already claimable — needed for SK↔HU border integrity);
(d) red-pin border tests. The day it lands, `claimsNation('SK')` flips true with **zero** change here.
⚠ Coordinate with the concurrent **SI** lane (also editing the neighbour set) so HUN is not added twice.

## Falsification controls (per deliverable, byte-identical restore)

1. **Parser reads bytes, not constants** — scrambled the fixture's `PARCEL_NUMBER 15→99` / `ID …505→…999`
   → exactly the 2 value-reading assertions FAILED; restored byte-identically (sha1 `b8701b3d…` matches),
   re-ran → 18/18 green.
2. **Live "found" is location-dependent** — same endpoint, Vienna (outside SK) → `features: []` (absent),
   Bratislava → real parcel. The found result is not canned.
3. **Deferral is a real refusal, resolver is live** — measured Warsaw → claims POL, Bratislava →
   `no-national-candidate`; the SK-false is a genuine refusal, not a stubbed function. The mechanism is
   asserted in the test, not just prose.
4. **Registry row is wired, not committed-but-inert** — `parcelRegistryWiring` gate "EVERY registered row
   has a finite specificity" fails any row lacking a REGION_BBOX entry; it passes only because
   `SK: SLOVAKIA_BBOX` is present → the addition is load-bearing.

## Proof of execution

- `npx vitest run __tests__/skEsknAdapter.test.ts` → **18 passed**, RC=0.
- `npx vitest run __tests__/parcelRegistryWiring.test.ts` (loads my SK row) → RC=0
  (one transient FAIL observed was a CONCURRENT **BG** lane mid-writing its REGION_BBOX entry — not SK;
  re-ran after it settled → green).
- `npx tsc -p tsconfig.json --noEmit` → **RC=0, 0 errors**.

## Not done (out of scope, named)

- `server/jurisdiction/euCadastreProxy.js` `sk` row (`/api/parcel/sk`) — the PROXY-EE-LT-PL follow-up.
- The boundary-set promotion of SVK (shared decider) — see `SK_ROUTING_DEFERRAL` + barrel §A.
- `sourceRegistry/sk.ts` migration (shared `sourceRegistry/index.ts`) — barrel §C.
- No rule mapper: sweep verified NO machine-readable rules channel; a stub built from the ~2028 reform
  roadmap would be [[fake-more-capable-than-real]]. The ladder is recorded as data; nothing minted.
