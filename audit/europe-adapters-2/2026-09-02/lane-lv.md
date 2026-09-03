# LANE LV — Latvia parcel adapter (europe-adapters-2, delivered 2026-09-03)

**Verdict: DELIVERED — the parcel leg is LIVE and keyless.** Latvia's national cadastre answers a
WGS84 click with a real land-unit, no credential. The adapter ships a working provider (not a
deferred stub), a dormant-but-final registry row, and an honest no-rule-pack rules leg. The ONLY
open gate is the resolver-geometry gate (GATE 2), owned by a boundary wave.

## 1. Channels — re-probed live 2026-09-03 (pin confirmed, then discovered the real WFS)

The sweep/census banked the cadastre as "weekly SHP + WFS" but no point-query WFS endpoint. The
data.gov.lv INSPIRE dataset `kadastralie-zemes-gabali-inspire` links only the geolatvija VIEWER
(`geoProductId=175`), never a bare WFS. The endpoint was DISCOVERED, not guessed:

- `https://geolatvija.lv/runtime-config.js` → `geoserverUrl: "https://geolatvija.lv/geoserver"`.
- The SPA bundle `static/js/main.*.js` carries the route `/geoserver/vraa/wfs` (+ `/api/v1/public/
  geoproducts/dpps-capabilities/`, the census DPPS pin).
- **`https://geolatvija.lv/geoserver/vraa/wfs` GetCapabilities → HTTP 200, 120 KB, WFS 2.0.0,
  keyless** (ows:Fees NONE, ows:AccessConstraints NONE). Layers include `vraa:parcel` (cadastral
  land-units / zemes vienība), `vraa:parcel_part`, `vraa:building` (ēkas), `vraa:parcel_property`.
- `vraa:parcel` DefaultCRS = `urn:ogc:def:crs:EPSG::3059` (LKS-92 / TM). WGS84 entry + output via
  `srsName=urn:ogc:def:crs:EPSG::4326` (server reprojects) — NO hand-rolled projection anywhere.

TAPIS planning WFS pin re-probed and confirmed live: `https://tapis.gov.lv/izpl/geoserver/wfs`
GetCapabilities → HTTP 200 (~116 KB). This is the RULES substrate (functional zones), not the
parcel channel — see §4.

## 2. THE LIVE CLICK PROOF (the deliverable) — Rīga, real parcel identifier

```
GET https://geolatvija.lv/geoserver/vraa/wfs?service=WFS&version=2.0.0&request=GetFeature
    &typeNames=vraa:parcel&outputFormat=application/json&srsName=urn:ogc:def:crs:EPSG::4326
    &bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,urn:ogc:def:crs:EPSG::4326   (@ 56.9496,24.1052)
→ HTTP 200 application/json, MultiPolygon (WGS84), properties:
   code="01000070006"  (cadastral designation — THE parcel identifier)
   property_code="01000070006"  objectcode="7201060110"
   address="Pils iela 23, Rīga, LV1050"
   purpose_use="Komercdarbības objektu apbūve"   area=1435   area_scale=1434.89…
   owner="juridiska persona (Īpašnieks)"  (ownership FORM, not identity)  owned_by_municipality=false
   geom_act_d="2011-11-02Z"  parcel_status_kind_name="*nekustamais īpašums"
```

By-code path confirmed: `cql_filter=code='01000070006'` → HTTP 200, 1 feature. The recorded live
bodies are committed as the offline fixture `__tests__/fixtures/lv-riga-pilsiela/recorded-live-2026-09-03.json`.

## 3. FetchOutcome shapes — all three proven live (empty ≠ failure, L-12874 table honoured)

| case | request | result | classification |
|---|---|---|---|
| found | bbox @ Rīga / cql code= | HTTP 200, ≥1 feature | `found` |
| absent | bbox over Gulf of Rīga water | HTTP 200, 0 features | `absent` (`no-feature:…`) |
| transient | `typeNames=vraa:parcel_WRONG` | HTTP 400 + ows:ExceptionReport | `transient` (`upstream-failed`, carries server text) |

Refusal tokens come ONLY from the L0 `TRANSIENT_FETCH_REASONS` table (`endpoint-unreachable`,
`upstream-failed`) — never minted at the call site.

## 4. Rules leg — HONEST NO-RULE-PACK (deferred), per the brief's zero-fill warning

TAPIS `funkcionalais_zonejums` serves functional-zone GEOMETRY + national unified codes + document
linkage (`dok_id/dok_nos/dok_datums_no`), but **no numeric envelope attributes and no būvlaide
(building-line) layer** (census 2026-09-02). The numbers live per zone index in the TIAN legal text
on likumi.lv (structured HTML — an F-extraction target). The brief: "advertise nothing with zero
national fill (PILN/ATN_DOK, L-12872)". So `lvCountryAdapter.rules = { kind: 'deferred', reason }`
— no fabricated chain. The TAPIS substrate is still recorded in `sources()` (`adapterStatus:
'documented'`) so an extraction lane can find it. This matches the census verdict (⭐⭐⭐ geometry+
codes machine-readable; numbers = structured legal HTML).

## 5. Routing — DORMANT on GATE 2 (the ONLY gate), the RO/HU pattern

`claimsNation('LV')` is FALSE everywhere today: LVA is a **refusal-only neighbour** in
`nationalBoundaries.json`, not a claimable country, so `resolveNationalJurisdiction(Rīga)` refuses
(`claimed-by-unmodelled-neighbour`, owner LVA). The registry row is therefore INERT-BUT-SAFE (a
Latvian click falls to the universal footprint exactly as before — never a misroute). Extending the
resolver is out of lane scope by the brief ("L-12871/12887 closed"); it is a single-line boundary-
wave flip, queued in `barrel-additions-lv.txt §3` and documented in `LV_JURISDICTION_DEFERRAL`
(reviewBy 2026-12-01). **Unlike RO/HU/GR, LV's SERVICE gate is OPEN** — the provider works today;
only the routing predicate is dormant. Registered in FINAL form (`kind: 'cadastral'`) so the flip
is one line.

## 6. Deliverables

- `countryAdapters/lv/lvJurisdiction.ts` — LATVIA_BBOX (specificity-only) + isInLatvia (tests only)
  + claimsLatvia (resolver delegate, false today) + LV_JURISDICTION_DEFERRAL.
- `countryAdapters/lv/lvWfsClient.ts` — the one impure FetchOutcome-classified GeoServer seam
  (tracer `pryzm.siteintel.lv`), WGS84-in/WGS84-out, self-naming refusals.
- `countryAdapters/lv/lvParcelProvider.ts` — `resolveLvParcelByCode` + `resolveLvParcelAtWgs84Point`,
  measured schema (`LvCadastralParcel`), ownership FORM only (no identity, no envelope).
- `countryAdapters/lv/lvSources.ts` — LV_SOURCES: the live cadastre (CC-BY-4.0, WFS2, `live`) + the
  documented TAPIS zoning substrate (CC0, WFS2, `documented`). Both validated through
  SiteIntelSourceSchema at load.
- `countryAdapters/lv/index.ts` — the §J adapter value (`parcel: {byNationalId, atPoint}`,
  `rules.kind: 'deferred'`, precedence ladder, sources).
- `parcelProviders/registry.ts` — LV row + import + REGION_BBOX['LV'] (APPLIED; also in barrel-additions).
- `src/index.ts` — barrel export (APPLIED; also in barrel-additions).
- `__tests__/lvAdapter.test.ts` (15 tests) + `__tests__/fixtures/lv-riga-pilsiela/recorded-live-2026-09-03.json`.

## 7. Verification (foreground, exit codes captured)

- `vitest run __tests__/lvAdapter.test.ts` → **15 passed, EXIT 0**.
- `vitest run parcelRegistryWiring + parcelRegistryNationalWiring + nationalJurisdictionResolver +
  parcelRegistry` → **209 passed, 1 failed**. The 1 failure is a **concurrent-lane** breakage
  ("covers every country in the shipped boundary set": CONTROLS=16 vs countries=20 after ME-OPEN
  added ARE/KWT/BHR/OMN) — **proven independent of LV** by reverting registry.ts+index.ts to their
  pre-LV bytes: the test stays red. Not this lane's file, not fixed here (barrel-additions §5a).
- `tsc -p tsconfig.json --noEmit` → exit 2 with **1 error, in a concurrent FR/PT lane's
  `frPrescriptionGeometry.test.ts` ('Pt' export)**. **ZERO type errors in countryAdapters/lv/**,
  registry.ts, or src/index.ts (barrel-additions §5b).

## 8. Falsification per deliverable

- **Provider**: the "found" bodies are the LITERAL live responses (fixture = recorded bytes), and
  the negative controls are live too — a water point returns 0 features (absent) and a wrong layer
  returns HTTP 400 (transient). A provider that conflated them would fail the offline suite.
- **Routing dormancy**: `claimsLatvia(Rīga)` asserted **false** (not skipped) — the honest dormant
  state, driven by the real resolver, not a stub.
- **Independence of the concurrent failures**: reverted my two shared edits to their `*.orig`
  bytes, re-ran the boundary-count test → still red; restored my edits (all concurrent rows
  EE/GR/HU/IL/QA/RO/SE/TR intact). No commit.

## 9. Notes for the rules/census half (parcel leg was the deliverable)

TAPIS `tapis_apvienotie:funkcionalais_zonejums` (CC0) is the national functional-zoning geometry +
code channel; numeric parameters are the TIAN saistošie noteikumi on likumi.lv (structured HTML).
`vraa:building` (ēkas footprints) is served on the same cadastre WFS — a candidate buildings leg,
deliberately not wired (E4 control 2). The weekly bulk SHP (`kadastra-informacijas-sistemas-atverti-
telpiskie-dati`, CC-BY-4.0) is the cache/mirror option; the bulk XML text set is attributes-only.
