# LANE REGISTRATION WAVE — L-12887 fixed, the adapters wired, the resolver deciding the real click

**Date:** 2026-09-02 · **Scope:** close L-12887 (un-modelled-neighbour annexation) INSIDE
`src/jurisdiction/`, wire `resolveNationalJurisdiction` into `resolveParcelCandidates` as the
NATIONAL decider, register EE/LT/PL/LU/SE, repoint DK (L-12888), state the FI/NO authority
decision at the rows, apply the queued barrel additions · **Commits:** none (briefed `do NOT
commit`) · **Authority:** E4-EXECUTION-CONTROL controls 2/3/5/9/10 · **Transcripts:**
`lane-registration-transcripts/` (siblings of this file).

---

## A. Verdict in one paragraph

Ten confident wrong claims (L-12887) are now ten NAMED refusals — pinned red-first, all ten
CLAIMED in the failing run (transcript 02), all ten refused after the land-neighbour ring landed
— and the resolver is no longer an unused alternative: `resolveParcelCandidates` consults it on
every point, so **no click anywhere is decided by box area between countries any more**. The five
blocked countries are registered on `claimsNation(cc)` (boundary geometry, never a rectangle), a
Copenhagen click resolves the REAL parcel keylessly through DAWA (`7000q`, 64,981 m², 115-vertex
WGS84 ring — executed live with no key), and every acceptance point in the brief routes as
demanded: Tallinn no longer offers Kartverket, Stockholm no longer offers NO, Luxembourg City no
longer offers BE-WAL/DE/FR, Flensburg/Niebüll no longer offer DK (transcript 16, all checks OK).

## B. L-12887 — the fix, red-first

- **RED (transcript 02):** the 10 towns added as failing tests before any fix. All ten CLAIMED,
  verbatim — e.g. `Cesky Tesin (CZ) was CLAIMED: POL (PL) — inside its boundary … nearest rival
  no rival at no rival in range` (containment with a DISARMED tolerance band — the exact
  mechanism the issue names). 21 failed / 55 passed.
- **The fix:** `nationalBoundaries.json` gains `neighbours` — REFUSAL-ONLY members from the SAME
  pinned ne_10m source (sha256 re-verified byte-identical on download day:
  `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`), same DP-100 m + 5-decimal
  discipline (`build_neighbours.py` beside this file). The 12 named (CZE/LVA/BEL/AUT/LIE/RUS/
  BLR/AND/MCO/SMR/SVN/MAR) **+ 4 discovered members of the same class, recorded per control 10:
  SVK and UKR (land neighbours of POL with towns inside POLAND_BBOX within annexation range),
  GIB (inside SPAIN_BBOX, under 1 km from the ESP polygon), VAT (enclaved in ITA; kept at raw
  resolution because DP-100m collapses a 0.44 km² state).** RUS/UKR/BLR/MAR are clipped to
  windows whose artificial edges are over 100 km from every modelled routing bbox — for
  refusal-only geometry clipping can only turn one refusal reason into another in un-modelled
  land, never mint a claim. 16 neighbours, 6,169 verts, JSON 902 KB → 1.01 MB.
- **Resolver changes:** new closed-vocabulary reason `claimed-by-unmodelled-neighbour` (detail
  names the true owner); neighbour containment refuses immediately; neighbours are RIVALS in the
  containment tolerance check (Český Těšín/Hrádek now refuse `within-dataset-tolerance-of-rival`
  naming CZE/DEU) and in the nearest-polygon rescue (a nearest NEIGHBOUR refuses instead of
  handing the point to the runner-up). No tolerance was tuned; no ceiling moved.
- **GREEN:** 76/76 (10 towns + name-carrying refusals + 14 interior neighbour controls + the
  refusal-only sweep + provenance). **Control kept falsifiable:** strip `neighbours` via deps
  injection → Vaduz is claimed CHE again (asserted in-suite, so it cannot rot).
- ⚠ ne_10m displacement discoveries: Narva (EE) is placed INSIDE RUS by ne_10m — it now refuses
  naming RUS (was: silent nearest-polygon miss); Fnideq/Monaco/Vise annexations were
  nearest-polygon; Český Těšín was CONTAINMENT — the strongest basis the module issues.

## C. The resolver now decides the real click

`resolveParcelCandidates` (the layer a map click reaches, via `resolveParcelWithFallback`):

1. rows match on their own `contains` (bbox for pre-existing rows; `claimsNation(cc)` for the
   five new national rows — the one-entry-memoised national verdict, so ONE resolve per click);
2. a national CLAIM filters the candidate set to that country's rows alone — **the specificity
   sort survives ONLY as the sub-national order within one country (NRW before DE, BE-BRU before
   BE-VLG) and as the refusal-path fallback order — stated at the site**;
3. a national REFUSAL leaves the full matched set in specificity order — the established
   per-cadastre-null fall-through (a refusal ≠ a dead click).

Measured consequences (transcripts 09/16): Barcelona no longer tries the FRENCH cadastre first
(the old smallest-box rule genuinely ordered `['ign-fr','catastro']`); Kirkenes offers NO alone;
Eindhoven NL alone; Calais FR alone; Geneva CH alone; the Oder band offers only the honest DE
footprint. **Executed falsification (transcript 17):** disable the claim filter → 4 named
failures (Tallinn offers NO again, Malmö offers DK again); restore verified byte-identical
(sha256 `0fa9dda7…` before == after) → 61/61.

## D. Registrations

| row | contains | kind | note carries |
|---|---|---|---|
| EE `ee-maaamet-kataster` | `claimsNation('EE')` | cadastral, `/api/parcel/ee` | keyless WFS live-probed; proxy NOT yet wired |
| LT `lt-rc-ntr-parcels-featureserver` | `claimsNation('LT')` | cadastral, `/api/parcel/lt` | keyless ArcGIS live-probed; proxy NOT yet wired |
| PL `pl-gugik-uldk` | `claimsNation('PL')` | cadastral, `/api/parcel/pl` | keyless ULDK; proxy NOT yet wired; Słubice data-limit named |
| LU `footprint` | `claimsNation('LU')` | footprint-fallback | NO parcel source is wired (NUM_CADAST is not a key) |
| SE `se-lantmateriet-fastighetsindelning` | `claimsNation('SE')` | footprint-fallback | 401 credential gate, fixtures cited |
| DK `matrikel-dk` (existing) | `isInDenmark` (bbox; the claim filter fixes Flensburg) | cadastral, `/api/parcel/dk` | **DAWA + KEYLESSLY** (L-12888) |
| FI `mml` (existing) | unchanged | unchanged | ⭐ ONE AUTHORITY: mmlParcelProvider REMAINS the FI parcel authority; countryAdapters/fi SUPPLEMENTS (plans) |
| NO `geonorge-no` (existing) | unchanged | unchanged | ⭐ ONE AUTHORITY: the proxy row REMAINS; countryAdapters/no SUPPLEMENTS (its parcel leg blocked on xmlScan, see barrel-additions-no [1]); L-12885 noted |

DK (L-12888): the DAWA leg is stacked INSIDE `/api/parcel/dk`
(`server/jurisdiction/dkMatrikelProxy.js`: keyed Datafordeler WFS first, keyless DAWA
`format=geojson&srid=4326` on a miss or when unkeyed) — ONE row, ONE proxy seat, no rival
registration. Executed with no key against live DAWA (transcript 15): København `7000q` /
64,981 m² / 115 verts / `via: dawa-jordstykker`; Aarhus `1683`; Malmö null. The server test that
pinned "no upstream call is even attempted without creds" pinned the defect and was corrected.

## E. Inherited red-first spec — audited, corrected where wrong (as briefed)

`__tests__/parcelRegistryNationalWiring.test.ts` (60 tests, 47 RED at baseline — transcript 01)
was turned green with SEVEN assertions corrected, each with a dated in-file note:

1–3. §2 Tallinn/Stockholm/Luxembourg City asserted the wrong-country rows were still OFFERED
   behind the right one (`toContain('NO')`) — written for a registration-only design. Tightened
   to the shipped stronger guarantee (claim routes alone). **Tightened, not loosened.**
4. §5 Malmö/Göteborg pinned "DK's smaller box still ranks first (recorded, not hidden)" —
   that measured limit is now FIXED at the root; and it HAD to be, because the DK route is no
   longer a dead stub (DAWA), so "harmless because null" was about to become a real
   wrong-country query.
5. §9's control asserted the LIVE resolver claims LU at Athus — exactly the L-12887 defect;
   moved to a deps-injection control (neighbours stripped → annexation returns) + a new test
   asserting the shipped refusal names BEL.
6–7. §10 recounted: **45 of 50** cities route (was 44) — Helsingborg converts to a claim
   (nearest-polygon, DNK decisively farther); Narva's miss reason changes to
   `claimed-by-unmodelled-neighbour` naming RUS. Misses stay NAMED (1 EE + 4 LU).

Also corrected: the header cited `apps/editor/__tests__/parcelRegistryNationalClick.test.ts`,
which DOES NOT EXIST — re-labelled as queued work, with the DK click layer noted as the half
that IS proven live.

Older pins updated for the same reason (each with a dated note): `parcelRegistry.test.ts`
(Kirkenes/Eindhoven/Calais/Geneva/Düsseldorf candidate lists), `parcelRegistryWiring.test.ts`
(Barcelona `['ign-fr','catastro']` → `['catastro']`), `server/__tests__/dkMatrikelProxy.test.ts`
(the no-creds pin).

## F. Barrel + shared-file changes applied (say-which, per the brief)

- `src/index.ts`: applied ALL SIX queued files' item-1 lines (fi, lt, lu, no, pl, se) **plus EE
  and DK in the same pass** — every one of the six says "apply it to the siblings in one commit
  rather than making one the odd one out". One ambiguity surfaced and was resolved explicitly:
  EE and NO each mint their own `extractOwsExceptionText` (E7 §6-A copies, not imports) — the
  bare name resolves to EE's; NO's is aliased `noExtractOwsExceptionText`.
- `src/index.ts`: exported the resolver surface (`resolveNationalJurisdiction`,
  `describeNationalJurisdiction`, `NATIONAL_BOUNDARY_SET`, verdict/basis/refusal/deps types).
- NOT applied from those files (out of this wave's brief, still queued): the sourceRegistry
  migrations (fi item 2, lt item 2, lu item 2, no item 3, se items 2/3), the schemas correction
  (lt item 3a — `packages/schemas/**` untouched, control 3), and `xmlScan.ts:84`
  (barrel-additions-no item [1] — the NO parcel-leg unblocker; recorded, not actioned).
- `se/seJurisdiction.ts` stale citation fixed: it cited `mmlParcelProvider.ts:86`'s deleted
  sentence in the present tense; now cites the correction and the resolver.
- ⚠ Exposing the adapters to the stricter ROOT tsc surfaced two unused declarations
  (`dk/dkRuleMapper.ts` `planName`, `lt/ltRuleMapper.ts` `LtAsgrClassifiedValue`) — removed with
  dated notes. Root tsc now **RC=0 repo-wide** (transcript 19; the E8 `spine/readers.ts` error
  the brief flagged no longer reproduces at this tree state).

## G. Verification (all foreground, RC captured)

- Package suite: **169 files, 3,698 passed / 3 skipped, RC=0** (21-summary).
- Scoped tsc `-p packages/site-parcel-data/tsconfig.json --noEmit`: **RC=0**.
- Root tsc `--noEmit --skipLibCheck` (6 GB heap): **RC=0, zero errors** (transcript 19).
- Server suite `npm run test:server`: **51 files, 788 passed, RC=0**.
- Acceptance sweep at the click layer (transcript 16): **ALL FIRST-CANDIDATE CHECKS PASS**.
- Live DK click, no key (transcript 15): real parcel via DAWA.
- Falsifications executed BOTH ways: L-12887 red-first (transcript 02) + in-suite stripped-
  neighbours control; registry filter disabled → 4 named failures → byte-identical restore
  (transcript 17).

## H. Still open / not this wave (recorded, control 10)

1. `/api/parcel/{ee,lt,pl}` server proxies are NOT wired — the rows say so; routing is proven,
   the click still falls to the OSM footprint in those three countries.
2. The Słubice/Frankfurt (Oder) refusals remain a DATA limit (per-country official DEU+POL
   boundaries are the named upgrade path; the per-dataset tolerance field already exists).
3. Narva refuses (ne_10m places it inside RUS); an official EE boundary would convert it.
4. L-12885 (NORWAY_BBOX wider than the Kartverket service extent) — untouched, still open.
5. `xmlScan.ts:84` non-ASCII XML names — still the NO parcel-leg blocker; queued in
   barrel-additions-no.txt item [1].
6. The queued sourceRegistry migrations (F above) remain queued.
7. An editor-layer click test (`parcelRegistryNationalClick.test.ts`) does not exist; the header
   that cited it as existing was corrected.
