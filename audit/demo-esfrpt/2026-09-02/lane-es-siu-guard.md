# LANE ES-SIU-GUARD — SIU land classification as a guard ahead of the ES estimated fallback

**Date:** 2026-09-02 · **Demo gap:** G5 (`DEMO-READINESS.md` §2) · **Defect family:** L-616
(overstatement: an Estimated buildable triple rendered on land the state classifies
`no_urbanizable`) · **No commit made** (per brief).

## What shipped

The live, already-mounted SIU proxy (`server/jurisdiction/siuClassificationProxy.js`,
`/api/siu/classification` — untouched) finally has a dispatch-ladder consumer. Inside Spain, at
the ONE chokepoint every `applyEstimatedZoning` call site funnels through (the §L-663 structural
seat), the national SIU clasificación-del-suelo register is consulted at the parcel's own query
point BEFORE the estimated-default triple may publish:

- **SIU answers `no_urbanizable`, in force, not a rural nucleus** → a CITED refusal
  (`code: 'protected-soil'`, `legallyGrounded: true`, `status: 'not-applicable'`,
  `jurisdictionRef: 'es-siu-national'`) naming **SIU** (register + layer URL), **the
  classification** (verbatim `SUELO NO URBANIZABLE` + normalised key + municipality INE), and
  **the query** (the exact `/api/siu/classification?lat=…&lon=…` URL + the point) — both halves
  of the never-overstate refusal doctrine. Never the estimate.
- **SIU unreachable / times out / proxy reports upstream failure** → the guard **records the
  transient** (`recordSiuGuardOutcome`, reason `'transient'`, loud console.warn) and does **NOT**
  block: the estimate publishes exactly as before the guard existed (control 9 — availability is
  not a land-class answer; UNKNOWN ≠ no-restriction ≠ restriction).
- **SIU answers urbano/urbanizable** → existing ladder proceeds unchanged.
- Every other outcome proceeds under its **own named reason**, never a collapsed boolean:
  `no-coverage` (a durable coverage answer — also what Portugal points inside the coarse
  SPAIN_BBOX get), `unknown-class` (SIU published a word the closed normalisation rejects),
  `class-not-guarded` (`sistemas_generales` — semantics not established, so no refusal by
  default), `nucleo-rural` (`NuclRural=1` — a delimited rural nucleus retains building rights;
  refusing there would overstate the RESTRICTION, the L-942 mirror), `not-in-force` (repealed
  record grounds nothing).

Design notes:
- The estimate is **held, not pre-published**: the DK "framing now, replace async" pattern would
  render the buildable triple on no_urbanizable land for the round-trip window — the exact
  overstatement being closed. SIU answers ~0.5 s (proxy cache TTL 24 h); a hung socket is bounded
  by `SIU_GUARD_TIMEOUT_MS` (20 s > the proxy's own 15 s honest-transient answer) → transient →
  estimate. (Pre-existing behaviour unchanged: `computeAndCacheEstimatedEnvelope` still caches the
  estimated ring synchronously for the framing render, as it always has for DK too.)
- The guard runs AFTER `refuseEstimateInsideRegisteredJurisdiction` (a registered city's own card
  is better and already never publishes the triple) and, like §L-663, BEFORE the `!envelope`
  bail. Staleness: `_lastParcelQueryPoint` re-read after the await; mismatch → yield.
- The refusal's `zoneCode` is `null` — SIU answers a land CLASS, not a planning zone, and a
  class-shaped token in `Parcel.zoning.category` would read as one (§L-663's null-is-an-answer
  rule). Granularity is stated on the card: land-class polygon, not a parcel determination.

## Files touched

- `apps/editor/src/ui/site/siuLandClassificationGuard.ts` — **new.** Pure interpretation
  (`interpretSiuClassification`), never-throwing fetch leg (`fetchSiuClassificationVerdict`),
  cited refusal constructor (`buildSiuNonDevelopableRefusal`), outcome record
  (`recordSiuGuardOutcome` / `getLastSiuGuardOutcome` / `__resetSiuGuardForTests`).
- `apps/editor/src/ui/site/siteDispatch.ts` — the chokepoint edit inside `applyEstimatedZoning`
  + the async continuation `applySiuGuardedEstimate` + two imports (`isInSpain` from the
  barrel's EXISTING exports; the new local module).
- `apps/editor/__tests__/esSiuEstimateGuard.test.ts` — **new**, 13 tests driving the REAL
  `dispatchParcelBoundary` (the murcia/madrid/§L-663 reachability discipline).
- `audit/demo-esfrpt/2026-09-02/barrel-additions-es-siu.txt` — **no barrel additions needed**
  (only already-exported symbols consumed); records the optional future L2 move.
- This file.

Shared-file protocol honoured: no barrel/registry edits; `packages/schemas/**` untouched
(`'protected-soil'` is an existing `EnvelopeRefusalCode`); `countryAdapters/fr|pt` untouched;
server proxy untouched.

## Acceptance — executed foreground, proofs verbatim

**(1) Villacañas point → cited SIU refusal, never an Estimated envelope.**
Point taken from the probe transcripts: `route9.txt` → `rural-clm 39.55,-3.35 PARCEL=[catastro] ZONING=none`.
SIU stub replies the VERBATIM `live-clm-siu.json` payload; the suite drives the real dispatcher and
asserts: refusal `protected-soil` / `legallyGrounded:true` / `status:'not-applicable'`, detail
contains `Sistema de Información Urbana`, `SUELO NO URBANIZABLE`, `/api/siu/classification`;
knownFacts carry class + query + INE 45185; `jurisdictionRef:'es-siu-national'`; zero estimated
numbers anywhere (triple/FAR/height/ring all absent). The premise was ALSO re-proven live today:

```
$ curl -s "https://pryzm.fly.dev/api/siu/classification?lat=39.55&lon=-3.35"
{"found":true,"clase":"no_urbanizable","claseRaw":"SUELO NO URBANIZABLE","municipioIne":"45185",
 "nucleoRural":false,"inForce":true,"granularity":"municipality-polygon","source":"siu",
 "sourceUrl":"https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15",
 "confidence":"published-structured"}
```
(byte-identical to `transcripts/live-clm-siu.json`.)

**(2) Barcelona Eixample regression** — my suite's Eixample arm proves `/api/muc/zoning` is called
and `/api/siu/*` never is (the SIU stub is a live tripwire that WOULD refuse if wrongly consulted);
the Barcelona card is unchanged and never names SIU. The full §L-663 suite
(`estimatedFallbackJurisdictionGuard.test.ts`) is green, and the certified-envelope engine layer is
green in the package suite below (E4 byte-parity lives there).

**(3) Urban Madrid point reaches its existing path** — arm at `40.41678,-3.70379`
(madridSiteDispatch's own point): `/api/madrid/*` asked, `/api/siu/*` never,
`getLastSiuGuardOutcome() === null`, never the triple. `madridSiteDispatch.test.ts` green.

**(4) SIU severed → transient recorded, no refusal, restore byte-identical** — the severed arm
stubs `fetch` for `/api/siu/classification` to REJECT (network severed): the estimate publishes
exactly as pre-guard (`estimated-ruleset`, `estimated-default`, 3.0/1.5/3.0) and the record reads
`{kind:'proceed', reason:'transient'}`. A second arm covers the proxy's own honest transient
(`{found:false, reason:'upstream-timeout'}`) — same outcome. Byte-identical restore was exercised
for real on `siteDispatch.ts` during the pre-existing-red proof below:
sha256 `3b3701f1…c9ee` before and after the swap.

**(5) Green gates:**

```
Suites:
 apps/editor: esSiuEstimateGuard + estimatedFallbackJurisdictionGuard + madridSiteDispatch
   Test Files  3 passed (3) · Tests  29 passed (29)
 packages/site-parcel-data: npx vitest run
   Test Files  169 passed (169) · Tests  3698 passed | 3 skipped (3701)

Scoped tsc (the stricter ROOT project, exactly what @pryzm/editor's typecheck script runs):
 NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.json --noEmit → TSC RC=0

tools/ga-gate/check-envelope-never-overstates.ts:
 BEFORE: RC=0 — "[never-overstate] OK: 0 overstatement(s) across 181 zone-solve(s) in
          6 jurisdiction(s) + estimated-default + the planted self-test pack."
 AFTER:  RC=0 — identical line, 181/6, 0 overstatements.
```

## The gate arm (why not added red-first)

`check-envelope-never-overstates.ts` self-describes as binding "the ENGINE + SEAM arithmetic, not
the pack curation": it solves rule-pack zones through the pure L2 `computeBuildableEnvelope` +
`envelopeToMassing`, imports only `@pryzm/site-parcel-data`, and is a PURE READ ("no network").
The SIU guard is a DISPATCH-layer control in `apps/editor` fed by a fetch. Hosting a
rural-no-urbanizable arm would require either importing `apps/editor` into an L2-scoped gate (a
layer inversion) or moving the guard's pure halves into `site-parcel-data` — which this session's
shared-barrel protocol forbids. **Not cheap ⇒ not added.** The arm is pinned instead at the layer
the defect actually lived at — the dispatch — by `esSiuEstimateGuard.test.ts` (13 tests), and the
future L2 move + barrel lines that would make a gate arm cheap are recorded in
`barrel-additions-es-siu.txt`.

## Pre-existing red found (NOT this lane's)

`apps/editor/__tests__/murciaSiteDispatch.test.ts` — **8 tests failing at HEAD, independent of
this lane.** Proof: with my `siteDispatch.ts` swapped for HEAD's copy (byte-verified restore),
the suite fails identically (8 failed, e.g. "REFUSES the identical calificación inside a UE
ámbito" expects refusal `derived-plan` / ordinanceRef `5.25.1`, receives `no-rule-pack`). The
answers come from the Murcia disposition registry in `site-parcel-data`, which sibling lanes
committed to today (`b78f5337` Sevilla docs, `db91ae55` Córdoba corpus ahead of it). Left for the
Murcia/registry owner; not fixed here (shared files, not this lane's scope).

## Residual honesty notes

- The pre-existing framing behaviour (§ENVELOPE-VIA-MASSING) still caches the estimated ring
  synchronously before `applyZoning` runs, for ALL jurisdictions including DK; on rural ES the
  refusal replaces it as the settled answer ~0.5 s later. Removing the framing flash is a
  different (pre-existing, all-country) decision, out of this lane's scope.
- `isInSpain` (SPAIN_BBOX) swallows Portugal; PT estimate flows now pay one cached SIU round trip
  and proceed on its honest `no-coverage`. Carving PT out needs `isInPortugal` barrel-exported
  (recorded in the barrel-additions file).
- The guard consults SIU only where NO registered jurisdiction claims the point. A registered
  city whose own path falls through still gets the §L-663 suppression card, never SIU — deliberate
  (the city card names the jurisdiction; SIU's municipality-polygon class would be a coarser claim).
