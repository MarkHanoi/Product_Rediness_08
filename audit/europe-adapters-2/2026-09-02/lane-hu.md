# LANE HU — HUNGARY parcel adapter · findings (2026-09-03)

## Verdict (one line)
Hungary's national parcel leg is a **DECLARED DEFERRAL**: the national cadastre is fee-gated
(Lechner TAKARNET / Geoshop), and the one keyless INSPIRE Cadastral-Parcels service is real but
covers a **single sample municipality (Mesterszállás)** — so a capital click is a self-announcing
deferral, never a false "no parcel here". A real, keyless-but-sample provider ships behind the
deferral, proven against recorded bytes.

## Channel hint, tested
The brief: *"the sweep graded Lechner PAID (L5:579) — expect a declared deferral for parcels unless
the INSPIRE CP download service answers keyless; probe it."* Probed. The INSPIRE CP service **does
answer keyless** (`ows:Fees` NONE, `ows:AccessConstraints` NONE) — but it serves **only the
Mesterszállás sample**, so the deferral stands for national coverage. This is a third shape,
distinct from SE (401, nothing behind it) and EE (live national cadastre): keyless-but-sample.

## Live probe (full transcript: `lane-hu-transcripts/01-inspire-cp-probe.md`)
- National entry `https://inspire.gov.hu/` (HTTP 200) → Lechner GeoNetwork catalogue.
- Catalogue (ES search) → the CP dataset/service records, all titled **"Mesterszállás sampling area"**.
- **WFS GetCapabilities** `https://inspire.lechnerkozpont.hu/geoserver/CP/ows` → HTTP 200, 90,332 B.
  FeatureType `CP:CP.CadastralParcels`, DefaultCRS **EPSG:23700 (HD72/EOV)**, Fees/AccessConstraints
  NONE, provider "Lechner Knowledge Centre".
- **Coverage measured**: `resultType=hits` → `numberMatched=1774`; the full collection reprojected
  to WGS84 → all 1774 features `administrativeunit="Mesterszállás"`, extent
  lon[20.399654, 20.500223] × lat[46.891381, 46.984411] (~7.7 × 10.3 km — one municipality).
- **THE CAPITAL CLICK (Budapest 47.4979, 19.0402)** → empty FeatureCollection, `numberMatched=0`
  (fixture `budapest-capital-empty.json`, sha256 `c103102050ecc455…95e8e3c1`). Re-confirmed live at
  lane close: still `numberMatched=0`.
- **THE SAMPLE CLICK (Mesterszállás)** → real parcel `nationalcadastralreference=015`, areavalue 455 m².
- National cadastre delivery: `geoshop.hu` HTTP 200 (JS SPA shell); PAID/quarterly/SHP-DXF-WMS per
  the rest-of-europe sweep §HU + envelope-geometry census row 26 (search-verified — NOT a byte-level
  price observation of my own; stated honestly).

## Deliverable (`packages/site-parcel-data/src/countryAdapters/hu/`)
- `huJurisdiction.ts` — `HUNGARY_BBOX` + `isInHungary`. Documented as a **prefilter, NOT a routing
  authority** (the row routes on `claimsNation('HU')`, never the rectangle — "no bbox of your own").
- `huInspireCpClient.ts` — REAL keyless WFS 2.0 client (found/absent/transient discipline, EE
  `eeWfsGetFeatures` shape), fetch-injectable, native EOV geometry kept on the object.
- `huParcelProvider.ts` — the parcel arm. `resolveHuParcelAtWgs84Point`:
  found → real parcel; empty **inside** the measured sample → `absent` (genuine gap);
  empty **outside** → the **DECLARED DEFERRAL** (`transient`, token
  `hu-national-cadastre-fee-gated-deferred`, naming the fee-gate) — never `absent`. Carries the
  C74 §3.4 scaffold (`HU_CADASTRE_DEFERRAL`, owner/declaredOn/retiredBy, `reviewBy=2027-06-01`,
  `assertHuCadastreDeferralNotExpired`).
- `huSources.ts` — two `defineSources('HU', …)` rows: keyless INSPIRE CP WFS (`WFS2`, gate null,
  `live-sample-only`) + fee-gated national TAKARNET/Geoshop (`bulk`, gate paid, `deferred-stub`).
  Endpoint-drift guard at module load. Licence NOT inherited (YELLOW/RED with caveats).
- `index.ts` — §J adapter value; **honest no-rule-pack path** (`rules.kind: 'unavailable'` — OTÉK
  is legal text, HÉSZ/rendelet are documents, E-TÉR is view-only; NO rule mapper minted, per the
  brief's "not speculative machinery").
- Tests: `__tests__/huAdapter.test.ts` (19/19), recorded-live fixtures
  `__tests__/fixtures/hu-lechner-inspire-cp-2026-09-03/`.

## Shared edits (applied; see `barrel-additions-hu.txt` for re-apply + the deferred half)
- `parcelProviders/registry.ts` — HUNGARY_BBOX import + the HU `footprint-fallback` row
  (`contains: claimsNation('HU')`, providerId reserved) + `HU: HUNGARY_BBOX` in REGION_BBOX.
- `src/index.ts` — `export * from './countryAdapters/hu/index.js';`.

## The one architectural call worth stating
`claimsNation('HU')` is **false today** because HUN is not in the national resolver's boundary set
(measured: `countries` has 20 keys, HUN is not one; nor is it a refusal-only `neighbour`). So the HU
row is **inert-but-safe** — empirically, `resolveParcelCandidates(Budapest) → []` → universal
footprint, never a misroute. This is the SAME dormant-`claimsNation` pattern the concurrent **RO and
GR** lanes already use in this file. Making it live requires adding HUN to the shared resolver +
boundaries JSON — a **coordinated boundary-lane commit**, not a solo per-lane edit, because Hungary's
HR/RS/RO borders need refusal-only neighbour rings (without them the coastal-rescue would annex
Croatian/Serbian/Romanian border points to HU — the L-12887 failure) and ROU collides with the RO
lane. The exact, ready-to-apply additions + the neighbour-integrity requirement + witness points are
in `barrel-additions-hu.txt` §B. This lane deliberately did NOT touch `nationalBoundaries.json` /
`nationalJurisdictionResolver.ts` (both already `M` from a concurrent Gulf lane).

## Falsification + restore (proof the tests are not tautologies)
- **Deferral**: replaced the out-of-sample deferral with `fetchAbsent` → the capital test FAILED
  ("Budapest → transient, NOT absent"). Restored byte-identical (sha256
  `2526dc84…d996d72549` before == after, zero residue); suite green again (19/19).
- **Fixture authenticity**: fixtures created 2026-09-03T07:35 (AFTER the live probe — not predating
  the subject); the recorded-live test pins `administrativeunit="Mesterszállás"` (UTF-8) and the
  Budapest `numberMatched=0`; the empty fixture carries the server's own `timeStamp`.

## Gates run (foreground, `$?`)
- `npx vitest run huAdapter` → RC=0, 19/19.
- `npx vitest run parcelRegistryWiring` → RC=0, 35/35 (HU row has finite specificity).
- `npx tsc -p tsconfig.json --noEmit` → only pre-existing error is a concurrent FR lane's
  `frPrescriptionGeometry.test.ts` "no exported member 'Pt'"; ZERO HU/registry errors.
- ⚠ `nationalJurisdictionResolver.test.ts` has 1 red ("covers every country in the shipped boundary
  set") — caused by the concurrent **Gulf lane** adding ARE/BHR/KWT/OMN to `countries` without
  control points. NOT this lane (HUN is not in the set). Flagged for that lane in §B4.

## packages/schemas/** — frozen, untouched
`WFS2` + `bulk` protocols and `endpoint-unreachable` already exist; FetchOutcome's three states
carry the whole HU story. No schema seat was needed and none was cut.
