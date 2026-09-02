# E9 REGISTRATION WAVE — ADVERSARIAL VERIFIER TRANSCRIPT (2026-09-02)

Verifier: independent subagent. Every drive below was EXECUTED against the working tree
(uncommitted wave state), with fresh subjects the lanes did not use wherever the check allowed it.
Verdict: **safe_to_commit = true**, with one NEW residual discovery (enclave-scale foreign claims)
recorded below for an L-row — it is below the shipped dataset's resolution, self-limiting at the
cadastre-null layer, and outside the wave's acceptance set.

## CHECK 1 — border towns, driven by me (drive1.ts)

The 5 named towns + THREE fresh pairs the lanes never used:

| point | national verdict | basis / refusal detail |
|---|---|---|
| Suwałki (PL) | **CLAIM POL** | polygon-containment, rival LTU @ 22,731 m, tol 1500 m |
| Sejny (PL) | **CLAIM POL** | rival LTU @ 8,014 m |
| Marijampolė (LT) | **CLAIM LTU** | rival POL @ 31,230 m |
| Frankfurt (Oder) (DE) | NAMED REFUSAL | within-dataset-tolerance-of-rival: DEU contains, POL @ 1,103 m ≤ 1500 m |
| Słubice (PL) | NAMED REFUSAL | POL contains, DEU @ 485 m ≤ 1500 m |
| **Tønder (DK)** (fresh) | **CLAIM DNK** | rival DEU @ 3,447 m |
| **Leck (DE)** (fresh) | **CLAIM DEU** | rival DNK @ 10,329 m |
| **Halden (NO)** (fresh) | **CLAIM NOR** | rival SWE @ 4,279 m |
| **Strömstad (SE)** (fresh) | **CLAIM SWE** | rival NOR @ 12,141 m |
| Övertorneå (SE) (extra) | NAMED REFUSAL | SWE contains, FIN @ 677 m |
| Ylitornio (FI) (extra) | NAMED REFUSAL | FIN contains, SWE @ 759 m |

Zero points claimed by two countries; zero non-claims without a named reason; every answer carries
dataset + sha + measured margin. Registry pools on every CLAIM contained exactly ONE country's rows.

## CHECK 2 — no smallest-box anywhere

`grep smallest|area|specificity` over non-comment lines of `nationalJurisdictionResolver.ts` → **no
hits** (RC=1); the only `.sort()`s are by **metres to boundary** (`edgeM`), never area.
`parcelJurisdictionSpecificity` has exactly ONE call site (`registry.ts:669`) and it runs AFTER the
national filter — on a claim the pool is single-country (proven empirically at every driven claim),
so area orders only sub-national rows within one country and the national-REFUSAL fall-through, as
documented at `registry.ts:625-646`.

## CHECK 3 — a REAL click (drive2.ts): the exact `resolveParcelWithFallback` seam
the editor drives (`apps/editor/src/ui/site/parcel/parcelRegistry.ts`), with the REAL country
adapters against the LIVE national services:

- **Tallinn → EE** `ee-maaamet-kataster` → live Maa-amet WFS → **tunnus 78401:114:0086**
- **Vilnius (Žvėrynas) → LT** `lt-rc-ntr-parcels-featureserver` → live NTR → **0101/0039:1406**
  (Gedimino pr. centre returns the NAMED `absent` for unparcelled state land — honest fall-through;
  Marijampolė, the L-12871 witness itself → **1801/7001:0010**)
- **Suwałki → PL** `pl-gugik-uldk` → live ULDK → **206301_1.0005.11523/3** (TERYT 2063 = Suwałki)
- **Copenhagen → DK** → live keyless DAWA → **matrikelnr 7000q** (matches the row note verbatim)

Gated / not-yet-servable: SE row names the Lantmäteriet 401 (APIM 900902), LU row names the
measured PAG defect (NUM_CADAST not a key: N/A on 4.9%, 15,110 duplicate groups), FI row names the
MML_API_KEY gate — Stockholm and Luxembourg City still route to their OWN country's row alone.

## CHECK 4 — Denmark

Exactly **1** DK row (`matrikel-dk`, `/api/parcel/dk`); note names **DAWA** and **keyless**. The
DAWA leg is stacked INSIDE `server/jurisdiction/dkMatrikelProxy.js` (keyed Datafordeler first,
keyless DAWA fallback — header says so, `server/__tests__/dkMatrikelProxy.test.ts` **10/10** green,
RC=0), and `DK_PARCEL_PATH` is registered BEFORE the `/:cc` catch-all in
`server/jurisdiction/index.js` (rows 183/184). No rival Danish path exists anywhere.

## CHECK 5 — the stale reassurances

All three deleted and replaced by correction notices that QUOTE the false sentence and mark it
false (`ee/eeJurisdiction.ts:4-7`, `lt/ltJurisdiction.ts:6-9`, `mmlParcelProvider.ts:86-93`), each
pointing at the resolver. Sibling sweep (`not load-bearing|does not overlap|unregistered, so|no
conflict`) found only the three US-city rows' "no overlap with any box (Western hemisphere)" —
geographically true today and no longer load-bearing (area never decides between countries now).
The L-650 doc block that said "specificity decides everything" carries an explicit
"⚠ PARTLY SUPERSEDED 2026-09-02 (L-12871)" box.

## CHECK 6 — scope + regression

- `packages/schemas/**` diff = **Component element kind only** (ADR-0376 §COMPONENT-PLACE, the UCE
  lane's known cross-lane state; +46 lines, zero parcel-related). ZERO schemas lines from E9 lanes.
- `tools/ga-gate/**` diffs (2 gates + `mirror-debt.json` component.* rows) — all UCE-lane; no
  ceiling raised, no gate-debt.json change, `.github/**` untouched.
- Scoped `tsc -p packages/site-parcel-data` → **RC=0**.
- Root `tsc --skipLibCheck --noEmit` (8 GB heap; default heap OOMs) → **RC=2 with exactly 2
  errors, BOTH in `apps/editor/src/ui/component/**`** (UCE lane, TS2367). ZERO from the E9 wave.
  The known E8 `spine/readers.ts` error **no longer appears at all**.
- Full site-parcel-data suite → **169 files / 3698 passed / 3 skipped, RC=0** (includes
  `parcelRegistryWiring`, `parcelRegistryNationalWiring` (61), `nationalJurisdictionResolver` (52),
  `parcelRegistry`).
- `check-envelope-never-overstates.ts` → **RC=0** (0 overstatements / 181 zone-solves / 6 jurisdictions).

## CHECK 7 — L-12887 at the driven layer (MY coordinates, not the tests')

All 10 annexation towns → **named refusals, zero foreign claims** (Český Těšín now
within-tolerance naming CZE @ 1,370 m; the other 9 `claimed-by-unmodelled-neighbour` naming
CZE/LIE/MCO/BEL/LVA/RUS/MAR). PLUS six un-modelled border points of my own — Salzburg (AUT),
Bregenz (AUT), Andorra la Vella (AND), Gibraltar (GIB), San Marino (SMR), **Daugavpils (LVA,
inside LITHUANIA_BBOX)** — **all named refusals naming the true owner, zero foreign claims.**
Kaliningrad, Narva-band, Casablanca-class controls also refuse.

## CHECK 8 — the click entry

Tallinn → `EE:ee-maaamet-kataster` alone; Stockholm → `SE:se-lantmateriet-fastighetsindelning`
alone (named-gate footprint row); Luxembourg City → `LU:footprint` alone; Flensburg →
`DE:footprint` alone (DK no longer offered). `parcelJurisdictionSpecificity` provably cannot
decide nationally (see CHECK 2).

## FALSIFICATION (my own subjects, not the lanes')

Emptied every `rings` array (countries + neighbours) in `jurisdiction/data/nationalBoundaries.json`:
Tønder, Leck, Halden, Strömstad, Suwałki, Vaduz ALL degraded to
`REFUSED (outside-every-candidate-polygon)` naming both bbox candidates — **0 claims, no box-area
fallback fired**; the two acceptance suites went **62 failed / 75 passed, RC=1**. Byte-identical
restore: sha256 `87460aa83a823610adab8543bb5160f438d107411c10a920d76a8a61e2d3fe3a` before == after;
210/210 green on re-run. (Note: the sha differs from the prec lane's `0b19cd0a…` because L-12887
later added the `neighbours` block to the same file — expected, not drift.)

## ⚠ NEW RESIDUAL DISCOVERY — enclave-scale foreign claims (needs an L-row; NOT in the wave's
acceptance set, recorded per control 10)

Driving European enclaves (a shape class no lane tested and the dataset cannot carry):

- **Baarle-Hertog (BE enclave in NL, 51.4413, 4.9339) → CLAIMED NLD** by polygon-containment
  (nearest BEL boundary 3,290 m > 1,500 m tolerance — the enclave ring simply does not exist in
  ne_10m, so no rival is near enough to trigger the band).
- **Büsingen (DE enclave in CH, 47.6967, 8.6900) → CLAIMED CHE** (DEU rival @ 1,934 m).
- Campione d'Italia correctly REFUSES (ITA @ 597 m, inside the band); Ceuta correctly CLAIMS ESP.

Mechanism: identical to L-12887 (absent geometry read as confidence) but BELOW the dataset's
resolution, so the neighbour fix cannot see it. Blast radius: the national verdict (and any UI that
shows its basis) is wrong on ~3 sub-km² enclave complexes; the parcel click itself self-limits
(PDOK/swisstopo answer null off their own territory → footprint). Fix rides the already-recorded
official-geometry upgrade path (per-country ADM0 at ~100 m tolerance), which models these rings.

## STILL OPEN (why each country is not fully live)

- **EE / LT / PL** — registered + routing correct + adapters LIVE-PROVEN, but
  `server/jurisdiction/euCadastreProxy.js` has NO `ee`/`lt`/`pl` legs (its table: fr, nl, no,
  de-nrw, ch, pt, us-sf, us-chi) → a production click today resolves null at the proxy and falls
  to the OSM footprint until those three proxy legs land (each row's note says exactly this).
- **SE** — Lantmäteriet credential-gated (HTTP 401 APIM 900902); footprint-fallback row until creds.
- **LU** — PAG GeoPackage NUM_CADAST not a key (measured); footprint until a sound source.
- **FI** — MML row live but key-gated (`MML_API_KEY` unset → null → footprint).
- **DK** — DAWA leg LIVE keylessly; the keyed Datafordeler attribute-join leg still needs
  `DATAFORDELER_*` creds for survey attributes (upgrade, not a blocker).
- **Oder/Neisse + Torne refusal bands** (Frankfurt (Oder), Słubice, Görlitz, Tornio, Övertorneå,
  Ylitornio) — data-limited named refusals at the measured 1,500 m NE10m tolerance; upgrade =
  official DEU+POL (+FIN/SWE) boundaries in `jurisdiction/data/` (licence audit owed).
- **Un-modelled neighbours** (CZ, SK, AT, LI, SI, SM, VA, MC, AD, GI, LV, RU, BY, UA, MA + BE at
  NATIONAL level) — refusal-only by design; no cadastre registered.
- **L-12885** (NORWAY_BBOX wider than Kartverket extent) — pre-existing, OPEN (P3).
- **Enclave residual above** — needs its own L-row.
