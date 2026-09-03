# LANE HR — Croatia parcel adapter · findings (2026-09-03)

## Verdict
**Croatia's parcel leg is LIVE and KEYLESS.** A map click at the capital returns a real
cadastral parcel with no credential, through DGU / Uređena zemlja's INSPIRE GeoServer. The
adapter is built on the proven EE sibling shape. Rules half: **honest no-rule-pack path** (no
machine-readable rule pack exists at parcel grain). Routing: registered on `claimsNation('HR')`,
correct-by-construction but **inert until HRV is added to the national resolver** — a declared,
named follow-up (a shared-decider lane), not speculative machinery here.

## The channel (the deliverable)
- **Endpoint** `https://api.uredjenazemlja.hr/services/inspire/cp_wms/wfs` (GeoServer, WFS 2.0.0).
- **typeName** `cp_wms:CP.CadastralParcel` — the SIMPLE feature type behind the DGU INSPIRE WMS.
- **Native CRS** EPSG:3765 (HTRS96/TM). **Keyless** (GetCapabilities + GetFeature both answered
  with no credential this session, despite NIPP src 1129's "uz registraciju" note).
- **Click shape (measured, in the adapter):** `GetFeature` with
  `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,urn:ogc:def:crs:EPSG::4326` (**lat,lon** axis order),
  `outputFormat=application/json`, **no `srsName`** → the server reprojects the FILTER but the
  OUTPUT geometry stays native EPSG:3765 (E1a native-CRS-on-the-object discipline; no in-package
  projection). GeoJSON coords `[easting, northing]`.
- **Response properties (measured):** `ID` (int, GeoServer object id) · `BROJ_CESTICE` (**string**,
  the parcel number / broj čestice) · `MATICNI_BROJ_KO` (int, cadastral-municipality code /
  matični broj katastarske općine). The KO **name** is not on the parcel — it lives on
  `cp_wms:CP.CadastralZoning.LABEL` (`"<koCode>-<KO NAME>"`), an optional join, not identity.

## LIVE CLICK PROOF @ the capital (Zagreb, Ban Jelačić ~45.8132,15.9771)
`GetFeature COUNT=1` → HTTP 200, `numberMatched=1`, one Polygon (161 verts, EPSG:3765,
first vert `[459411.84, 5074884.16]`):
`ID=21609461 · BROJ_CESTICE="2379" · MATICNI_BROJ_KO=335240` = **k.č.br. 2379, k.o. CENTAR
(335240), Zagreb**. KO name from `cp_wms:CP.CadastralZoning.LABEL="335240-CENTAR"`. Cross-confirmed
the SAME parcel via WMS GetFeatureInfo (keyless). Byte-exact body recorded as the test fixture
(`__tests__/fixtures/hr-zagreb/recorded-live-2026-09-03.json`). Transcripts:
`hr-transcripts/PROBES.md`.

## Why NOT the INSPIRE complex WFS
The nominal INSPIRE channel `cp:CadastralParcel` at `.../services/inspire/cp/wfs`
(nationalCadastralReference, harmonized) answers GetCapabilities + DescribeFeatureType keyless, but
**every** GetFeature (incl. bare `COUNT=1`) returns HTTP 400 `ORA-01000: maximum open cursors
exceeded` — the app-schema→Oracle mapping saturates cursors. 26 backoff retries over ~520 s never
cleared. Persistently degraded → the adapter uses the reliable simple `cp_wms` type instead. The
adapter classifies ORA-01000 as `transient` (`upstream-failed:` carrying the server text), never
`absent` (§CONTEXT-DATA-HONESTY).

## Rules half — honest no-rule-pack path
HR has NO machine-readable rule pack at parcel grain. Numeric provisions (odredbe za provođenje)
are per-plan **PDF**; plan CONTENT is served as scanned **raster** (county PPRaster* WMS). The one
national machine-readable geometry — MGIPU **Građevinska područja** (89,911 construction-area
polygons, gis4.mgipu.hr, EPSG:3765, keyless, census-proven 2026-09-02) — is **SCREENING-GRADE**
(register: interpretation of plans in force Sept 2020, "ne smiju [se] koristiti u svrhu izdavanja
akata"). It is recorded in `HR_SOURCES` for the future rule-pack lane and as a first-gate buildable
mask; it is **NOT** consumed as rules and **NOT** the legal envelope. `hrCountryAdapter.rules =
{ kind: 'none', reason: HR_NO_RULE_PACK_CAVEAT }` — the honest marker, not a stub.

## Jurisdiction / resolver — the one deferral, named
`hrJurisdiction.ts` provides `CROATIA_BBOX` + `isInCroatia` as a **pre-filter only** (the EE sibling
shape). The registry row's `contains` is `claimsNation('HR')`, never the box (L-12871: CROATIA_BBOX
overlaps ITALY_BBOX and the SI/HU/RS/BA/ME borders). But the national resolver
(`nationalJurisdictionResolver.ts` + `data/nationalBoundaries.json`) models 16 claimable countries
+ 16 neighbours; **HRV is in neither**, so `claimsNation('HR')` is false everywhere and the row is
INERT (proven below) — correct-by-construction, can never misroute. Adding HRV (rings + land-
neighbour refusal geometry HUN/SRB/BIH/MNE + red-pin border tests) is a SHARED-DECIDER lane, so it
is **declared, not done** here (barrel-additions-hr.txt §3, reviewBy 2026-10-03). This session
showed a concurrent lane doing exactly that for the Gulf states (ARE/KWT/BHR/OMN) — HR's belongs to
the same coordinated resolver work.

## Deliverables
- `packages/site-parcel-data/src/countryAdapters/hr/` — `hrJurisdiction.ts` (pre-filter),
  `hrWfsClient.ts` (the one impure FetchOutcome seam + URL builder + extractOwsExceptionText),
  `hrParcelProvider.ts` (parse + `resolveHrParcelAtWgs84Point`), `hrSources.ts` (4 typed rows),
  `index.ts` (§J shape, curated re-export, `rules.kind:'none'`).
- `__tests__/hrParcelAdapter.test.ts` (11 tests) + `__tests__/fixtures/hr-zagreb/recorded-live-2026-09-03.json`.
- Shared (also in barrel-additions-hr.txt): registry row (footprint-fallback + `claimsNation('HR')`
  + `HR: CROATIA_BBOX` specificity + import) and `export * from './countryAdapters/hr/index.js'`.

## Proof
- `npx vitest run __tests__/hrParcelAdapter.test.ts` → **11 passed** (recorded-live Zagreb parcel
  resolves; empty≠failure — ORA-01000/network→transient, 200-empty→absent; measured axis URL; §J
  shape; pre-filter overlap).
- `npx vitest run parcelRegistryWiring + parcelRegistryNationalWiring + hrParcelAdapter` → **107
  passed** (no regression; HR row has finite specificity; unique proxyPath).
- Throwaway proof (removed): HR row registered once (footprint-fallback, null proxy, providerId
  `hr-dgu-dkp-cp`) AND Zagreb does NOT route to HR today (inert, never wrong).
- Package typecheck: **0 HR errors** (the lone tsc error, `'Pt'` in `frPrescriptionGeometry.test.ts`,
  is a pre-existing FR-lane barrel gap, unrelated to HR).
- **Falsification (each break → RED, then byte-identical restore, sha verified):**
  (A) parser key `BROJ_CESTICE`→`BROJ_CESTICEX` → recorded-live test RED;
  (B) `!res.ok`→`fetchAbsent` → ORA-01000-transient test RED;
  (C) bbox axis lat,lon→lon,lat → URL test RED.

## ⚠ Concurrent-lane note (NOT HR)
Full-package run: **192/194 files, 4052 tests pass**; the single failing file is
`nationalJurisdictionResolver.test.ts > "covers every country in the shipped boundary set"` (16
CONTROLS vs 20 boundary-set countries). Cause: a concurrent **Gulf lane added ARE/KWT/BHR/OMN** to
`data/nationalBoundaries.json` without updating that test's CONTROLS. HR touches neither the
resolver (sha unchanged from my baseline; the Gulf lane changed it) nor the boundary set (HRV
absent). Not attributable to HR; its fix is the Gulf/resolver lane's.

## Reused / re-probed (not re-derived)
Sweep + census rows REUSED for orientation; one endpoint re-probed live to confirm the pin (the
cadastre channel). Census's envelope channel (gis4.mgipu.hr) noted for the rules half. Register
discovery via `registri.nipp.hr/api/izvori/` (DKP src 1 fee/agreement-gated → the INSPIRE cp_wms
simple WFS is the free point-query channel; DKP ATOM `oss.uredjenazemlja.hr` open-licence bulk).
