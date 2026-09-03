# LANE RO — Romania parcel adapter · findings

> Lane: RO (europe-adapters-2 wave) · date: 2026-09-03 · verdict: **TWO-GATE DECLARED DEFERRAL**
> (the SE / L-12879 pattern). Deliverable shipped in FINAL form; both gates named with a reviewBy
> date; clearing them is a single-line flip. Package tests **152/152 green**; scoped tsc clean for
> this lane (the one repo error, `frPrescriptionGeometry.test.ts` "no exported member 'Pt'", is an
> untracked file from the parallel FR lane, not RO).

## The one-paragraph verdict

Romania's national cadastre is **ANCPI's geoportal** (ArcGIS Server 10.8 serving INSPIRE Cadastral
Parcel / Buildings as GeoJSON, keyed on `INSPIRE_ID`). It is the right source, but this lane could
not resolve it and could not route to it — **two independent gates, either sufficient on its own**:

- **GATE 1 — SERVICE (host unreachable).** `geoportal.ancpi.ro` returns **NXDOMAIN** from every
  resolver available to this build. Not a credential 401, not a geofence 4xx — the host has **no
  public A/AAAA record**. Measured **twice** (2026-09-02 seeded transcript + my 2026-09-03
  re-probe) across **Google DoH, Cloudflare DoH, and sandbox getaddrinfo**. With no served bytes,
  shipping a GeoJSON→parcel parser built from documentation would be the
  [[fake-more-capable-than-real]] failure, so **no parser is shipped**; the two parcel resolvers
  refuse with a self-announcing **transient** (never `absent` — Romania HAS a cadastre).
- **GATE 2 — JURISDICTION (not in the resolver).** `claimsNation('RO')` routes via the L-12871
  national-jurisdiction resolver, and **ROU is absent from its boundary set**
  (`jurisdiction/data/nationalBoundaries.json` carries 16 claimable countries + 16 neighbours; RO
  in neither). So `claimsRomania` is **false everywhere** and the RO registry row is **DORMANT** —
  it matches nothing until a coordinated boundary wave adds ROU (exactly how EE/LT/PL/LU/SE were
  added on 2026-09-02). Extending the resolver is out of this lane's scope by the brief
  ("L-12871/12887 closed") and is a shared-geometry change owned by a boundary wave.

## Live gate transcript (falsification: the gate is real, not my egress)

Test point: **Bucharest, 44.4268, 26.1025** (Piața Universității). Full transcript:
`audit/europe-adapters-2/2026-09-02/ro-transcripts/ancpi-gate-probe.txt` (fixture mirror:
`packages/site-parcel-data/__tests__/fixtures/ro-ancpi-gate-2026-09-03/`).

| Probe (2026-09-03 re-probe) | Result |
|---|---|
| `curl geoportal.ancpi.ro/maps/rest/…/eterra3_publish/MapServer/1/query?f=json` | **curl exit 6** (could not resolve host), HTTP 000 |
| Google DoH `A geoportal.ancpi.ro` | **`{"Status":3}`** (NXDOMAIN), Authority SOA `iris.ns.cloudflare.com` |
| **CONTROL** — Google DoH `A www.ancpi.ro` | **`{"Status":0}` → 104.18.9.54 / 104.18.8.54** (zone live) |
| **CONTROL** — `curl raw.githubusercontent.com` | HTTP 200 (my egress is fine) |

The **CONTROL is the falsification**: `www.ancpi.ro` and the apex resolve from the *same* resolvers
that NXDOMAIN `geoportal`, and unrelated hosts (github) resolve — so the failure is a property of
ANCPI's `geoportal` subdomain DNS, **not** my network. The 2026-09-02 seed transcript adds
Cloudflare DoH NXDOMAIN too. Two sessions · three+ resolvers · one answer = a stable, reproducible
gate, per [[probe-can-be-wrong-three-ways]] (demanded an independent source) and
[[context-data-honesty-family]] (failure ≠ absence — classified transient, cacheable never).

Re-check command (in the deferral record): `curl -sk "https://dns.google/resolve?name=geoportal.ancpi.ro&type=A"` — Status 0 with an Answer array means GATE 1 cleared.

## Rules half — the honest no-rule-pack path (no rule mapper shipped)

The sweep + census verified **no rules channel serving normative envelope parameters per parcel**.
Romanian PUG/PUZ/PUD stock is **CAD/PDF per municipality**. MDLPA's Date Locale platform publishes a
**GIS-PUG technical standard v1.1 (15.07.2024)** (`datelocale.mdlpa.ro/ro/about/tehnic_planurb/`,
census-verified HTTP 200) that *prescribes* structured slots (regim de înălțime / POT / CUT /
aliniament) for **new** plans, but serves **no plan geometry** and no conformant package has been
observed served. Per the brief ("rule mapper stub ONLY if a real rules channel was sweep-verified,
else the honest no-rule-pack path"): **no rule mapper, no vocabulary** — `roCountryAdapter.rules`
is `{ kind: 'deferred', reason }`, and `RO_APPLICABILITY_LADDER` records the ladder as DATA with the
2024 standard flagged as the source-class **upgrade path**. QMAP (qmap.ro) remains the
evaluate-partner for CAD/PDF→GIS conversion (sweep note).

## Deliverables (all under `packages/site-parcel-data/`)

New files (`src/countryAdapters/ro/`):
- `roJurisdiction.ts` — `ROMANIA_BBOX` (**specificity metric only, never a router**), `isInRomania`
  (specificity/tests), `claimsRomania` (delegates to the resolver — dormant, GATE 2),
  `RO_JURISDICTION_DEFERRAL` (assertable record, reviewBy 2026-12-01).
- `roAncpiGate.ts` — the GATE 1 scaffold mirroring `seNgpGate.ts`: `RO_ANCPI_DEFERRED_TOKEN`,
  `RO_ANCPI_ENDPOINTS` (DOCUMENTED pins — eterra3 parcels/buildings + INSPIRE CP_View),
  `RO_ANCPI_DEFERRAL` + `assertRoAncpiDeferralNotExpired` (C74 §3.4), `roAncpiDeferredRefusal`
  (transient, self-announcing, spans `ro.deferred=true`).
- `roParcelProvider.ts` — `resolveRoParcelByInspireId` / `resolveRoParcelAtWgs84Point`, both
  **DEFERRED** (return the refusal); `RoCadastralParcel` is the SEAT a future lane fills from
  RECORDED BYTES; **no parser**; providerId `ancpi-eterra3` reserved.
- `roSources.ts` — one typed `SiteIntelSource` row (`ro-ancpi-eterra3-cadastre`, protocol REST,
  licence **YELLOW / verifiedDate null** — terms not captured, never asserted GREEN, gate null,
  probes = the NXDOMAIN log, adapterStatus `deferred-stub`, coverage = incomplete national fabric).
- `index.ts` — §J conformance map, `RO_APPLICABILITY_LADDER`, `RO_DEFERRED_LEGS` (C74 §3.8),
  `roCountryAdapter`, explicit re-exports.

Tests + fixture:
- `__tests__/roAdapter.test.ts` — 18 tests: both gates, transient-never-absent refusals, the
  recorded-live fixture, C74 reviewBy assertions, sources parse, the dormant registry row + the
  honest Bucharest click (→ universal footprint, never a fabricated parcel).
- `__tests__/fixtures/ro-ancpi-gate-2026-09-03/ancpi-gate-probe.txt` — the committed gate bytes.

Shared-file additions (applied live; also in `barrel-additions-ro.txt` for orchestrator re-apply):
- `parcelProviders/registry.ts` — `import { ROMANIA_BBOX }`; the RO row (footprint-fallback,
  `claimsNation('RO')`, providerId `ancpi-eterra3`, proxyPath null); `RO: ROMANIA_BBOX` in
  `REGION_BBOX` (required by the wiring test's finite-specificity guard). **Additive only**.
- `src/index.ts` — `export * from './countryAdapters/ro/index.js';` (all exports RO-prefixed, no
  wildcard collision).

## "ONE live click proof at the capital" — resolved as the DECLARED DEFERRAL branch

The brief asks for a live parcel identifier at the capital **or** the declared deferral with the
live gate transcript. Taken the deferral branch: the transcript above is the live gate; a Bucharest
click currently and correctly resolves to the **universal footprint** (honest "no cadastre wired
here"), asserted in `roAdapter.test.ts`. It is **not** a dead click and **never** a fabricated
parcel. The day both gates clear (host re-points + ROU enters the resolver), the same row routes and
resolves with **no code change** — the single-line flip the L-12871 design promises.

## Falsification & byte-identical restore

- **Gate is real, not a false refusal** — the CONTROL (apex/www resolve, github resolves) isolates
  the failure to ANCPI's `geoportal` subdomain; independently confirmed across 2 sessions / 3+
  resolvers. The 09-02 transcript predates my session, so I **re-probed** rather than trusting it
  ([[verification-artifact-can-predate-subject]]).
- **Deferral is honest** — refusals are `transient`, never `absent` (asserted); Romania has a
  cadastre.
- **No regression to shared routing** — all three registry suites pass (national wiring EE/LT/PL/LU/SE
  reachability, wiring, registry): my dormant row changes nothing for other countries.
- **Byte-identical restore** — my `registry.ts` / `src/index.ts` changes are **additive only** (0
  deletions), localized, and each appears exactly once; cleanly reversible, and re-appliable from
  `barrel-additions-ro.txt`. (Note: `registry.ts` also carries GR/US/AU rows from parallel lanes in
  this wave — my hunks are independent of theirs.)

## Watch / next

1. **Re-probe `geoportal.ancpi.ro` at reviewBy (2026-12-01)** — if it resolves, write a client
   against RECORDED BYTES from `eterra3_publish/MapServer/1` (INSPIRE_ID + GeoJSON ring), retiring
   the GATE 1 scaffold. Do not build from the documentation.
2. **When a boundary wave runs**, add ROU to `nationalBoundaries.json.countries` (regionCode "RO",
   ne_10m ring at 100 m simplification) — GATE 2 clears with no adapter edit.
3. **Rules upgrade path** — watch for the first standard-conformant PUG-GIS package on Date Locale;
   that is the moment the rules half becomes buildable.
