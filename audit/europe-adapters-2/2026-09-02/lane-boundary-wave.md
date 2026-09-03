# LANE BOUNDARY-WAVE — the dormant parcel countries promoted to LIVE routing

Date: 2026-09-03 · Package: `packages/site-parcel-data` (sole editing lane, plus one
one-line comment fix in `server/jurisdiction/euCadastreProxy.js` per the PROXY-LEGS deltas).
NO commit — the orchestrator commits.

## Verdict

**SIX countries promoted** to claimable members of the national-jurisdiction resolver —
**LV, SK, SI, HR, GR, BG** — each with a LIVE-PROVEN keyless parcel channel. **Every proof
below is MEASURED through the real resolver/registry, and the full package suite + scoped tsc +
root tsc are green** (RCs at the bottom). The boundary set grew 20 → **26 countries** and
16 → **21 refusal-only neighbours** (−LVA/SVK/SVN promoted out, +HUN/SRB/BIH/MNE/ALB/MKD/ROU/TUR).

## Promoted — with the proof per country

| CC | ISO3 | Geometry | Capital proof (resolveNationalJurisdiction → resolveParcelCandidates) |
|----|------|----------|------------------------------------------------------------------------|
| LV | LVA | `neighbours.LVA` → `countries.LVA` **verbatim** (475 pts) | Rīga 56.9496,24.1052 → CLAIM LVA (containment) → `lv-vzd-kadastrs-geolatvija` cadastral `/api/parcel/lv`, EXCLUSIVE. Daugavpils + Liepāja also claim. |
| SK | SVK | `neighbours.SVK` → `countries.SVK` **verbatim** (493 pts) | Bratislava 48.1436,17.1077 → CLAIM SVK → `sk-ugkk-eskn-kn-parcela-c` cadastral `/api/parcel/sk`. Košice, Žilina, Poprad claim (Poprad/Žilina previously refused *naming SVK* — same ring, refusal → claim). |
| SI | SVN | `neighbours.SVN` → `countries.SVN` **verbatim** (393 pts) | Ljubljana 46.0569,14.5058 → CLAIM SVN → `si-gurs-kn-parcele` cadastral `/api/parcel/si`. Maribor, Koper, Murska Sobota claim; Trieste stays ITA. |
| HR | HRV | **SI lane's fixture rings** (`queued-resolver-additions.json`, 25 rings 2047 pts) — my re-extraction from the pinned source byte-matched them (see Provenance) | Zagreb 45.8132,15.9771 → CLAIM HRV → `hr-dgu-dkp-cp` **cadastral `/api/parcel/hr`** (flipped per PROXY-LEGS, see below). Split/Cavtat claim via coastal rescue; Osijek + Dubrovnik claim by containment. |
| GR | GRC | extracted from pinned ne_10m (74 rings, 5456 pts — the islands) | Athens 37.9755,23.7348 → CLAIM GRC → `gr-ktimatologio-geotemaxia-leitourgoun` cadastral `/api/parcel/gr`. Thessaloniki, Heraklion (Crete), Corfu, Rhodes, Chios, Kos claim. |
| BG | BGR | extracted from pinned ne_10m (1 ring, 765 pts) | Sofia 42.6975,23.3223 → CLAIM BGR → `bg-gcca-inspire-cadastral-parcel` cadastral `/api/parcel/bg`. Plovdiv, Varna, Ruse, Svilengrad, Sandanski claim. |

**BG is one country beyond the brief's expected five.** The brief's criterion — "Promote ONLY
countries whose parcel leg is live-proven" — includes it: `barrel-additions-bg.txt` records a
LIVE keyless capital-proven cadastre (Sofia → nationalcadastralref 68134.100.5) whose ONE open
gate was jurisdiction, and its queued promotion demanded exactly the RS/RO/GR/TR/MK neighbour
integrity this wave ships. It is NOT a declared deferral. Flagged here so the orchestrator can
drop it consciously if unwanted — reverting is deleting `countries.BGR`, the `['BGR',
isInBulgaria]` prefilter row, and the BG claims from the tests (ROU/SRB/MKD/TUR neighbours are
still wanted by HR/GR).

At every promoted capital the pool is **EXCLUSIVE** (the national claim removes all foreign
rows) — pinned per-capital in `parcelRegistryNationalWiring.test.ts` §11, including each row's
declared `proxyPath`.

## Deliberately NOT promoted — with the reason each

- **HU (Hungary)** — NO live parcel leg: Lechner INSPIRE CP is **sample-only** (Budapest
  `numberMatched=0`, Mesterszállás sample only; `barrel-additions-hu.txt` Section B is future
  work). Its row stays dormant `footprint-fallback`. **HUN entered as a refusal-only
  NEIGHBOUR** (SK/SI/HR border integrity): Hungarian points now refuse BY NAME
  (`claimed-by-unmodelled-neighbour` naming HUN) — a neighbour can never be claimed, so the HU
  row stays inert exactly as before, and HU's later promotion is a neighbours→countries move.
- **RO (Romania)** — DECLARED TWO-GATE DEFERRAL; gate 1 (service) is **NXDOMAIN** — promotion
  would route clicks into a dead adapter. Row stays dormant. **ROU entered as a refusal-only
  NEIGHBOUR** (BG Danube-border integrity: Giurgiu now refuses naming ROU; `claimsRomania`
  stays false — asserted in `roAdapter.test.ts`, unchanged and green).
- **SRB/BIH/MNE/ALB/MKD/TUR** — not adapter countries in this wave; added as refusal-only
  neighbours because promoting HR/GR/BG without them is the L-12887 annexation defect. TUR is
  **clipped** to window {34.0–44.0 N, 25.0–33.0 E} — the one real artificial edge (lon 33) is
  ~280 km east of the nearest resolver-candidate bbox edge (GREECE_BBOX 29.7), the same
  correctness-preserving argument as RUS/UKR/BLR/MAR. TR's own registry row is bbox-idiom and
  UNAFFECTED: a refusal keeps the whole candidate pool, so Istanbul/İzmir still route to the TR
  row (measured).

## Geometry provenance (never invented)

- Pinned source re-downloaded 2026-09-03: `ne_10m_admin_0_countries.geojson`, sha256
  **byte-identical** to the JSON header (`239eec57…`).
- Pipeline: shapely `simplify(0.0009°)` DP + 5-decimal rounding, exterior rings only, closed —
  **validated by re-deriving the SI lane's HUN and HRV fixture rings EXACTLY** (742 and
  25/2047 pts, list-equal) before extracting anything new. LVA/SVK/SVN promotions re-used the
  in-tree rings verbatim (no re-extraction).
- `nationalBoundaries.json` stays single-line `json.dumps` format; `neighboursNote` records the
  wave. File 1.03 MB → 1.34 MB.

## Border red-pins (all MEASURED, then asserted in tests)

- **SK↔HU**: Komárno refuses `within-dataset-tolerance-of-rival` at **208 m** from HUN;
  Štúrovo at **780 m**; Esztergom (HU bank) refuses `claimed-by-unmodelled-neighbour` naming
  HUN. Neither bank is ever offered the other country's row.
- **HR↔SI**: Zagreb → HRV, Ljubljana → SVN; Kumrovec (HR, ~1 km from SI) claims HRV in the
  shipped set — the exact point the SI lane's falsification control proved would be ANNEXED to
  SI without the HRV rival.
- **HR↔BA/ME/HU**: Trebinje → BIH, Herceg Novi → MNE, Mohács → HUN, all refuse by name;
  Vukovar (Danube bank) refuses within-tolerance — the honest Frankfurt-(Oder)-class answer.
- **GR↔TR (Aegean)**: Kaş (~2 km from Kastellorizo), Bodrum, Çeşme, Edirne, İzmir, Istanbul
  all refuse naming TUR; Rhodes/Chios/Kos/Corfu/Crete claim GRC. **Known data miss, named**:
  Kastellorizo itself is below the ne_10m island threshold → refuses
  `outside-every-candidate-polygon` (a refusal, never a wrong claim).
- **BG↔RO/MK/AL**: Ruse → BGR but Giurgiu (opposite bank) refuses naming ROU; Bitola → MKD,
  Korçë → ALB refusals.
- **No overreach**: Vienna, Budapest, Bucharest, Belgrade, Sarajevo, Podgorica, Tirana,
  Skopje, Istanbul, Praha, Uzhhorod all still refuse; none is offered any promoted row.
- **Valka reconciliation (the queued flip was WRONG about this point)**: `barrel-additions-lv.txt`
  §3c predicted "Valka becomes a correct LV claim". MEASURED: Valka refuses
  `within-dataset-tolerance-of-rival` at **452 m** from the EST boundary (Valga, the Estonian
  twin, refuses symmetrically at 1083 m from LVA). The twin towns straddle the border inside
  the 1500 m band — the honest answer. Tests assert the measured refusal, not the prediction;
  the ANNEXED witness row keeps Valka with a dated reconciliation comment.

## ADDITIONAL SCOPE — the PROXY-LEGS deltas (applied within this lane)

1. **LV mis-select FIXED (real bug)**: `resolveLvParcelAtWgs84Point` took `features[0]` at
   `count=1`. The recorded Rīga fixture holds **5 candidates in feature-id order**; the click
   (56.9497, 24.1038) is contained by **01000070008** (Doma laukums 4) while features[0] is
   **01000492026**, a 439 882 m² public-domain polygon that does NOT contain it. Fix = the LU
   `pickCandidate` discipline: window ±0.0001° (~11 m), `count=30`, new `pickLvParcelFeature`
   (containment via the package's own `pointInRingsEvenOdd` — the resolver's solver, not a
   reinvention — else nearest centroid, never features[0]); `parseLvParcelFeature` now shares
   `lvOuterRing` (one ring extraction). Test pins the containing code AND the falsification
   control (features[0] is the wrong parcel).
2. **HR row FLIPPED** footprint-fallback → **`cadastral` + `proxyPath '/api/parcel/hr'`**
   (barrel-additions-hr step (vi)): both declared-deferred wirings cleared the same day
   (PROXY-LEGS wired + live-proved the leg; this wave promoted HRV). `hrWfsClient.ts` fact 2
   gained the new measurement — `srsName=EPSG:4326` IS honoured for OUTPUT (the old
   native-3765-only belief corrected as a service statement; the adapter's own no-srsName
   request shape unchanged, no reprojection module anywhere).
3. **SI B3 VERIFIED APPLIED server-side** (guard 45.4/46.9/13.35/16.65, source
   `si-gurs-kn-parcele` at `euCadastreProxy.js:1180`) — not re-applied. B1+B2 applied by this
   lane.
4. **LU citation drift** — RECONCILED FROM THE TREE: `countryAdapters/lu` contains NO
   `luParcelProxy.test.ts` citation (the coordinator's premise); the drift lives at
   `server/jurisdiction/euCadastreProxy.js:505` (PROXY-LEGS deltas §5 agrees). Fixed there —
   the LU pins live in `server/__tests__/euCadastreProxy.test.ts` (one-line comment fix, the
   only server-side edit by this lane).
5. **IL untouched** — `/api/parcel/il` 404s deliberately (no ring channel; an extent rectangle
   is the L-616 overstatement).
6. Registry notes: LV/SI/SK/GR "proxy not yet wired" sentences updated (those four legs ARE
   wired; **BG's `/api/parcel/bg` remains the ONLY unwired promoted leg** — its cadastral match
   self-corrects to the footprint on the 404, the row's documented state).

## Other reconciliations from the current tree

- The `covers every country` CONTROLS count was already reconciled for ARE/KWT/BHR/OMN by the
  ME-OPEN wave; this lane extended the same pattern (+6 → 26 controls) and added a
  both-sets-disjoint assertion (a code is never claimable AND refusal-only).
- The FR `Pt` TS2305 the LV/HU lanes reported is GONE (the FR lane now imports from
  `@pryzm/schemas`).
- `siParcelAdapter.test.ts` promotion block re-sourced SVN rings from `countries` (they left
  `neighbours`); its falsification control still proves the HRV-guard requirement.
- LV/SK deferral records gained `retiredOn: '2026-09-03'`; GR/BG gained
  `boundaryRetiredOn: '2026-09-03'` (BG's proxy half explicitly still open). Docstrings that
  said "RETURNS FALSE EVERYWHERE TODAY" now record the promotion.
- **Pre-existing root-tsc breakage fixed (in-package)**: `ro/index.ts` + `sk/index.ts` had 11
  unused-import errors under the stricter root tsc (committed at HEAD by the adapter lanes,
  invisible to the package tsc). Import blocks trimmed to what the adapter values consume; the
  public re-export surface unchanged.
- **Concurrent-lane note**: a LU-ENVELOPE lane landed `src/index.ts` export block +
  `fixtures/lu-c026/` + a `vitest.config.ts` hunk in this package mid-flight (despite the
  sole-lane fence). Not touched; all final RCs below were measured WITH those edits in-tree.
  Other worktree noise (apps/editor component-preview, lane-u5) is not this package.

## RCs (final tree, foreground, `$?` checked)

- `npx vitest run` (full `@pryzm/site-parcel-data`): **RC=0** — 201 files passed,
  **4244 passed / 3 skipped** (was 200 files / 4211 pre-wave per lane BG).
- `npx tsc -p tsconfig.json --noEmit` (package): **RC=0**.
- Root `npx tsc --noEmit --skipLibCheck` @ `--max-old-space-size=6144`: **RC=0**, 0 errors.

## Files touched (this lane)

- `src/jurisdiction/data/nationalBoundaries.json` — the promotion + neighbours + note.
- `src/jurisdiction/nationalJurisdictionResolver.ts` — 6 imports + 6 prefilter rows + docs.
- `src/parcelProviders/registry.ts` — HR flip; stale dormancy language across LV/SK/SI/GR/BG/HR/RO/HU notes+comments.
- `src/countryAdapters/lv/{lvParcelProvider,lvJurisdiction,index}.ts` — mis-select fix + retirement.
- `src/countryAdapters/sk/{skJurisdiction,index}.ts`, `ro/index.ts`, `gr/grJurisdiction.ts`,
  `bg/bgJurisdiction.ts`, `hr/hrWfsClient.ts`.
- `__tests__/{nationalJurisdictionResolver,parcelRegistryNationalWiring,lvAdapter,skEsknAdapter,siParcelAdapter,grKtimatologioAdapter,bgAdapter}.test.ts`.
- `server/jurisdiction/euCadastreProxy.js` — the one-line LU citation fix only.
