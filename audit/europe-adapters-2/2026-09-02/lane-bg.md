# LANE BG — Bulgaria parcel adapter · findings (2026-09-03)

## Verdict

**Bulgaria's PARCEL leg is LIVE, KEYLESS, and PROVEN at the capital — the GR/HR/SI class, NOT a
deferral of the data.** The channel hint ("KAIS/cadastre.bg… likely credential-gated: probe, and
defer honestly if so") was over-pessimistic for the parcel leg: the GCCA/AGKK **INSPIRE**
Cadastral-Parcels service answers a keyless ArcGIS REST query returning a real Bulgarian cadastral
identifier + a WGS84 ring at Sofia. What is credential/fee-gated is the *official PDF extract*
(a paid KAIS product) and the *KAIS app backend* `arcgis.cadastre.bg` (WAF) — neither is the
machine-readable channel.

The only OPEN gate is the **JURISDICTION (routing) gate**, shared with RO/GR/LV/SI/SK: BGR is not
in the national-jurisdiction resolver, so `claimsNation('BG')` is false everywhere and the registry
row is DORMANT (a Sofia click falls to the OSM footprint — never a misroute). Registered in FINAL
`cadastral` form so clearing the gate is a single-line flip.

Rules = **DOCUMENTS-ONLY** (ОУП/ПУП under the ЗУТ framework = PDF/DWG per municipality; Sofia has a
city-GIS island, Sofiaplan; no national machine-readable zoning register). No rule pack shipped — the
honest no-rule-pack path, not a stub written against nothing.

## Channels found (live-probed 2026-09-03 from this machine)

| Channel | Endpoint | Result |
|---|---|---|
| National INSPIRE geoportal | `inspire.egov.bg` + GeoNetwork `inspireportal.egov.bg` | 200 — catalog record "Cadastral parcels - GCCA" is the discovery key |
| **Cadastral parcel REST (PRIMARY)** | `inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer/0/query` | **200 — capabilities Data,Map,Query; identifier + WGS84 ring; keyless, non-browser-UA-safe** |
| Cadastral parcel WMS (sweep-confirmed) | `.../Cadastral_Parcel/MapServer/WMSServer` GetFeatureInfo | 200 — `application/geo+json`, same identifier, geometry null |
| INSPIRE download WFS for parcels | `.../exts/InspireFeatureDownload/service?...WFS` | 200 **ExceptionReport "No operation"** — WFS DISABLED for parcels (matches sweep: WFS only for Geographical Names) |
| KAIS app backend | `arcgis.cadastre.bg/arcgisnopki/rest/services/...` | **WAF-guarded (F5 "Request Rejected")** — root + `/export` allowed, every attribute/geometry path 403. Not usable. |
| KAIS portal (official extract) | `kais.cadastre.bg` | 200 — free view + free preview reports; **official extract is PAID** |

Layer `0` = `CP.CadastralParcel`, stored EPSG:4258 (ETRS89), reprojects server-side (WMS also
advertises native EPSG:7801 / BGS2005). Fields: `nationalcadastralref` (the id), `id_localid`,
`id_namespace` ("BG.CP"), `areavalue` + `areavalue_uom`, `label`, `admunit`, `validfrom`,
`beginlifespanversion`.

## THE LIVE CLICK PROOF — Sofia capital (42.6975 N, 23.3223 E)

```
REST 0/query point → nationalcadastralref "68134.100.5", areavalue 3499 m², id_namespace "BG.CP",
                     51-vertex WGS84 ring (spatialReference wkid 4326)
WMS GetFeatureInfo → nationalCadastralReference "68134.100.5" (same parcel; geometry null)
where=nationalcadastralref='68134.100.5' → the same parcel
```
`68134` = the EKATTE settlement code for **гр. София (Sofia)**. Re-confirmed live at the end of the
lane (pin stable). Full transcript: `lane-bg-transcripts/01-inspire-cadastre-probe.md`.

Controls (empty ≠ failure; failure ≠ empty): Black Sea point → HTTP 200, **0 features, no error**
(durable `absent`); invalid field → HTTP 200 `{"error":{"code":400,...}}` (classified `transient`).

## Deliverables (all under the proven EE/DK/GR sibling shape)

- `countryAdapters/bg/bgJurisdiction.ts` — `BULGARIA_BBOX` + `isInBulgaria` (prefilter ONLY; the row
  routes on `claimsNation('BG')`, never the rectangle) + `BG_ROUTING_DEFERRAL` (owner/date/evidence/
  retiredBy/reviewBy 2027-03-01).
- `countryAdapters/bg/bgCadastreClient.ts` — the ONE impure seam; **reuses**
  `providers/containers/arcgisRest.ts` (grep-first, C84 EI-9) for the point-intersect, adds the
  FetchOutcome classification (found/absent/transient as DIFFERENT VALUES, C57 §1.5) + a by-reference
  `where` query + the sweep-confirmed WMS GetFeatureInfo URL builder & parser.
- `countryAdapters/bg/bgParcelProvider.ts` — pure `parseBgParcelFeature` (native-CRS ring, register
  `areavalue` verbatim — never derived), `resolveBgParcelAtWgs84Point`, `resolveBgParcelByReference`,
  `BG_INCOMPLETE_CADASTRE_CAVEAT` carried on `absent`.
- `countryAdapters/bg/bgSources.ts` — `defineSources('BG', …)` with 2 rows (keyless INSPIRE parcel
  service, YELLOW/keyless; paid KAIS official extract, RED/gate 'paid'), each with a dated probe;
  endpoint drift bindings.
- `countryAdapters/bg/index.ts` — `bgCountryAdapter` (§J shape: country BG, sources, rules
  documents-only, precedence ladder as data).
- `__tests__/bgAdapter.test.ts` — 22 tests over recorded-live fixtures (found/absent/transient,
  parser, WMS parse, routing-deferral-is-inert, sources split). **22/22 pass.**
- Fixtures `__tests__/fixtures/bg-sofia-2026-09-03/` — recorded-live REST bodies + WMS GFI body.
- SHARED files applied live (re-apply source: `barrel-additions-bg.txt`): registry.ts (import + row +
  REGION_BBOX) + src/index.ts (barrel). Row is `cadastral`, DORMANT, proxyPath `/api/parcel/bg` reserved.

## Deferrals (declared, named, dated — the SE/L-12879 pattern)

1. **Routing** (`BG_ROUTING_DEFERRAL`, reviewBy 2027-03-01): BGR absent from
   `nationalBoundaries.json` (measured: not in `countries`, not in `neighbours`). Retire by adding a
   BGR polygon + `["BGR", isInBulgaria]` prefilter TOGETHER with RS/RO/GR/TR/MK neighbour integrity
   (L-12887). Until then the row is inert-but-safe.
2. **Server proxy**: `/api/parcel/bg` not wired in `euCadastreProxy.js` — even once routing clears, a
   click resolves null → OSM footprint until the `bg` proxy row lands (queued in barrel-additions).
3. **Rules**: no national machine-readable zoning register → documents-only, no rule pack minted.
4. **Official extract**: the legally-authoritative скица/удостоверение is a PAID KAIS service —
   recorded as a second, `deferred-stub` source row (why the parcel axis is YELLOW, not GREEN).

## Verification

- Full package suite: **200 files, 4211 passed / 3 skipped**; typecheck **RC=0** (after shared-file edits).
- Registry/source wiring: parcelRegistry + parcelRegistryWiring + parcelRegistryNationalWiring +
  sourceRegistry = **145/145 pass** (every row has a finite REGION_BBOX entry; no source drift).
- **Falsification A** (deliverable = the live proof is bound to real bytes): corrupting the Sofia
  reference in the fixture → the FOUND test fails (`expected '99999.999.9' to be '68134.100.5'`);
  fixture restored byte-identical (sha256 `682a85b3…56ef` before == after).
- **Falsification B** (deliverable = empty≠failure honesty is load-bearing): mapping the empty-feature
  branch to `transient` → the ABSENT test fails (`expected 'transient' to be 'absent'`); source
  restored byte-identical (sha256 `b088556c…0e80` before == after).
- NO commit (per brief).

## Census cross-check

The envelope-geometry census (`audit/envelope-geometry-census/2026-09-02/census-south-east.md` §BG)
adds no new PARCEL channel — it confirms "KAIS cadastre free-view/paid-extract" and flags Sofia's
code→ЗУЗСО-table join as the most automatable single-city RULES path (Sofiaplan). That is the
RULES-half retirement lead, not the parcel deliverable; noted for a future BG rules lane.
