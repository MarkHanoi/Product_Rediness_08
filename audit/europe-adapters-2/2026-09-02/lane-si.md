# LANE SI — Slovenia parcel adapter · findings (2026-09-03)

## Verdict
Slovenia's national parcel cadastre is **LIVE + KEYLESS** and the adapter is delivered in **FINAL
form** (`kind: 'cadastral'`). The row is **DORMANT-BUT-SAFE** today (`claimsNation('SI')` is false
because SVN is a resolver *neighbour*, not a claimable country) — the same one-line-flip gate the
LV lane sits behind. Wiring is queued for the orchestrator in `barrel-additions-si.txt`.

## Channel (re-probed live, pin confirmed)
- **Parcel WFS (deliverable):** `https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows` — GURS Kataster
  nepremičnin, GeoServer WFS 2.0, layer `SI.GURS.KN:PARCELE`. **Keyless. CC BY 4.0.**
  - Native CRS **EPSG:3794 (D96/TM)** — GetCapabilities advertises *only* 3794. But the server
    **reprojects on request** (measured both ways): a WGS84 `bbox=…,urn:ogc:def:crs:EPSG::4326` is
    accepted; without `srsName` the ring comes back native 3794; with `srsName=EPSG:4326` it comes
    back WGS84 [lon,lat]. **No hand-rolled projection** anywhere (EE native-CRS-on-object discipline).
  - Fields: `PARCELA_ID`, `EID_PARCELA`/`EID` (stable id), `KO_ID` (cadastral-municipality id),
    `NAZIV` ("1725 AJDOVŠČINA"), `ST_PARCELE` (parcel number), `POVRSINA` (m²), `E_CEN`/`N_CEN`,
    `DATUM_SYS`, `UPRAVNI_STATUSI_NAZIV_SL`. Canonical human id = `KO_ID + ST_PARCELE`.
  - Outcome shapes all measured: wrong layer → HTTP 400 `ows:ExceptionReport` naming the layer
    ("Feature type SI.GURS.KN:PARCELE_WRONGNAME unknown"); point outside SI → 200 empty (absent).
- **Envelope-geometry / rules channel (noted, not the parcel leg):** the census pin
  `https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/ows` — re-confirmed HTTP 200, `REG_CRTE_OPN`
  ("Gradbena meja") numberMatched **10,869** (matches census). Recorded in `siSources.ts`.
  Numeric FZ/FI/height rules stay municipal OPN act TEXT → **honest no-rule-pack path**
  (`rules.kind: 'none'`), never a faked national feed.

## Live click proof (at the capital, through the package provider — real fetch, no mock)
`resolveSiParcelAtWgs84Point(46.0569, 14.5058)` → **found**, `parcelRef "1737 3786"`, eid
`100100000278700999`, 2472 m², native 3794 ring (38 verts). `resolveSiParcelByEid('100100001379837235')`
→ found, `"1725 2468/4"`, 1896 m². (The recorded fixture body is the KO 1725 parcel at a slightly
larger bbox; the exact capital point sits on the adjacent KO 1737 parcel — both real.)

## The one real complication: SI is not yet claimable, and promoting it is a cross-lane change
`claimsNation('SI')` requires the national resolver to CLAIM Slovenia. Today **SVN is a refusal-only
NEIGHBOUR** in `nationalBoundaries.json` (not a `countries` member), so it is never claimed. Promoting
it is a single-line flip (SVN → `countries.SVN` regionCode SI + `['SVN', isInSlovenia]` prefilter) —
BUT it must not land alone:

- **MEASURED with the real resolver (injected deps):** promoting SVN *without* its land neighbours
  Croatia/Hungary as resolver members **annexes 7/10 border-hugging HR/HU points to SI** — the exact
  L-12887 defect. With them, **25/26** witnesses are correct; the one residual (a sub-1500 m Kolpa
  river point) is the documented ne_10m tolerance floor (same class as the DE/PL Oder band).
- The concurrent **HR + HU lanes are already promoting HRV + HUN to claimable countries**, so the
  clean fix is to apply SI + HR + HU together (then SI needs no HRV/HUN neighbours — a code cannot be
  both a country and a neighbour). Stop-gap HRV/HUN neighbour rings (byte-identical ne_10m provenance)
  are provided in `__tests__/fixtures/si-ljubljana/queued-resolver-additions.json` in case SI lands
  alone. Full instructions: `barrel-additions-si.txt` §B.

## Process note (multi-agent collision, handled)
I initially applied the SVN promotion + HRV/HUN neighbours to the shared resolver + boundary JSON and
proved it correct (0/15 witnesses). On discovering the fleet queue pattern (HR/HU/LV lanes register
DORMANT and queue the boundary change) — and that HR/HU promote HRV/HUN to *countries*, which would
collide with my *neighbour* additions (a code can't be both) — I **reverted both shared files to
zero net change** (verified: resolver 0 `isInSlovenia` refs; boundary JSON SVN-as-neighbour restored,
no HRV/HUN, Gulf lane's concurrent country additions preserved, no neighbour data loss vs HEAD) and
queued the change instead. This is the LV precedent exactly.

## Deliverables
- Package: `countryAdapters/si/{siJurisdiction,siWfsClient,siParcelProvider,siSources,index}.ts`
- Registry row + `REGION_BBOX['SI']` + import (applied); `src/index.ts` export (applied)
- Test: `__tests__/siParcelAdapter.test.ts` (15 tests, incl. a recorded-live fixture and the
  queued-promotion falsification control) — **15/15 pass**; package `typecheck` **0 errors**;
  `parcelRegistryWiring` + `eeAdapterRework` still green (63/63 together).
- Queued shared changes: `barrel-additions-si.txt` (resolver flip + boundary promotion + proxy row).

## Not in scope (recorded, not actioned)
- Buildings: the SAME KN WFS serves `SI.GURS.KN:STAVBE`/`STAVBE_OBRIS`/`DELI_STAVB`/`ETAZE` — a
  buildings lane.
- Envelope/rules: the MNVP `REG_CRTE_OPN`/`REG_POVRSINE_OPN`/`NRP_OPN` geometry is a rules/envelope
  lane (census CONSUME-GEOMETRY).
