# LANE FR-ZONEID — the FRANCE national zone-identity leg (GPU) · findings + verification record

Written 2026-09-02 by lane FR-ZONEID-FINISH. The implementing predecessor was cut by a rate
limit after writing the code, tests, fixtures and `barrel-additions-fr-zoneid.txt`, and BEFORE
writing this document — which the barrel file already cited (§4). Per the
verification-artifact-can-predate-subject discipline, **nothing inherited was trusted: every
acceptance arm below was RE-EXECUTED foreground on 2026-09-02 by the finishing lane**, RC read
directly. The dangling citation is resolved by this file; the barrel file needed no correction.

## §1 — Verdict per inherited file (VERIFIED / CORRECTED / DISCARDED)

| Path | Verdict |
|---|---|
| `packages/site-parcel-data/src/countryAdapters/fr/frGpuClient.ts` | **VERIFIED** (10,142 B, sha256 `c62b8878ab1bf6766dd6efa73201bc45b7b590e961247c953893aeb7da5b55b7`). FetchOutcome classification proven by unit tests + live severed-URL falsification (§5). Byte-identical after the falsification restore. |
| `packages/site-parcel-data/src/countryAdapters/fr/frZoneIdentity.ts` | **VERIFIED**. Pure mappers proven on recorded live bags; refusal builders emit only L0 codes `no-rule-pack` / `no-plan-at-point` (both in `EnvelopeRefusalSchema`'s code table, `packages/schemas/src/site/zoning/BuildableEnvelope.ts:252,263`); no numeric field exists in any output type (structural key assertion in the tests). |
| `packages/site-parcel-data/src/countryAdapters/fr/frSources.ts` | **VERIFIED**. One source row `fr-gpu-apicarto-du`, three dated probe notes; consumes `defineSources` (the lt/lu seam), no rival registry. Migration into `sourceRegistry/fr.ts` correctly queued for the orchestrator (barrel item 2), not done by the lane. |
| `packages/site-parcel-data/src/countryAdapters/fr/index.ts` | **VERIFIED**. Chain order = `FR_APPLICABILITY_LADDER` (bbox pre-filter → registered-jurisdiction guard → zone-urba → secteur-cc → municipality/RNU); transient STOPS the ladder; guard defaults to the real `resolveRegisteredJurisdictionAt` (never a copied Paris bbox). |
| `packages/site-parcel-data/__tests__/frZoneIdentity.test.ts` | **VERIFIED** — re-run foreground: **RC=0, 20/20 passed** (vitest 4.1.10). |
| `packages/site-parcel-data/__tests__/fixtures/fr-gpu-zoneid/recorded-live-2026-09-02.json` | **VERIFIED as a GENUINE recording** — independent cross-check: today's LIVE Lyon answer carries `gpu_doc_id 4f3ddc27a9611b4bc94fa161443b8e86`, `libelle UCe1b`, `typezone U`, `idurba 200046977_PLUI_20260326`; the fixture holds the identical values (and the rural CC bag `N`/`03`/`63268_CC_20190221` likewise). 8 keys, labelled with the re-record path. |
| `audit/demo-esfrpt/2026-09-02/barrel-additions-fr-zoneid.txt` | **VERIFIED, no correction needed**. Its "VERIFIED STATE AT WRITING" block re-executes green verbatim (§3); its Item-1 name-collision grep re-run → **0 hits** outside `countryAdapters/fr/`; its §4 citation into this file was dangling at pickup and is now resolved. |

**DISCARDED: nothing.** **CORRECTED: nothing in the lane's code.** The only finishing work was
this document plus the re-execution.

## §2 — What the leg is

Every French point outside a registered jurisdiction now gets a ZONE-NAMED, source-cited
refusal — identity + honest refusal ONLY, never a number:

- `zone-urba` (PLU/PLUi/POS/PSMV) → `kind:'zone'` + `no-rule-pack` refusal naming libelle,
  typezone, idurba, règlement doc and `#page=` anchor when served;
- `secteur-cc` (carte communale) → same shape (the brief's own rural point lives here — it has
  NO zone-urba; a zone-urba-only leg would have misread ~thousands of CC communes);
- `municipality` `is_rnu:true` → the RNU regime refusal (an answer, not a gap);
- `is_rnu:false` with no polygon → `no-plan-at-point` naming the commune;
- 0 municipality features → honest `absent` (sea / not France);
- any rung not answering → `transient` by name; the ladder STOPS (an outage never becomes
  "no PLU here").

Refusal/transient tokens are all pre-existing L0 vocabulary (L-12874 — nothing minted):
`endpoint-unreachable` / `upstream-failed` ∈ `TRANSIENT_FETCH_REASONS`
(`packages/schemas/src/site/zoning/FetchOutcome.ts:74`), `no-feature:` = the dk/ee/lt sibling
genuine-absence spelling, `mapper-refused:` = the settled spelling already used by 8 sibling
adapters (ee/fi/lt/lu/no/pl/se/pt).

## §3 — Re-executed acceptance arms (all foreground, 2026-09-02, finishing lane)

- **Arm 4a — scoped tsc:** `npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit` →
  **RC=0**.
- **Arm 4b — lane tests:** `npx vitest run frZoneIdentity` (package root) → **RC=0,
  1 file, 20/20 passed**.
- **Arm 4c — FULL package suite:** `npx vitest run` (package root) → **RC=0,
  Test Files 170 passed (170) · Tests 3718 passed | 3 skipped (3721) · 60.29s.** The Paris
  certified-pack tests (`frParisPluPack.test.ts`, `frParisPluProvider.test.ts`) are inside this
  run — the existing deeper path is unchanged.
- **Arms 1–3 — live driver:** §4 below, **RC=0, DRIVER_VERDICT=PASS**.
- **Arm 5 — falsification:** §5 below, transient by name + byte-identical restore.

## §4 — LIVE acceptance transcript (real GPU, 2026-09-02, driver RC=0)

Driver: `resolveFrZoneIdentityAt(lat, lon)` (production deps — real fetch, real registry guard)
via tsx. Verbatim output:

```
=== Lyon Presqu'ile (45.764,4.8357) → status=found
kind=zone
  libelle="UCe1b" typezone="U" typesect=null idurba="200046977_PLUI_20260326" instrument=PLUi
  date=2026-03-26 doc="200046977_reglement_20260326.pdf" page=null
  gpuDocId="4f3ddc27a9611b4bc94fa161443b8e86"
  refusal.code=no-rule-pack legallyGrounded=false
  refusal.headline=Zone UCe1b (PLUi 200046977_PLUI_20260326) — règlement not yet extracted; no envelope asserted.

=== rural Auvergne (brief "Solignat") (45.5636,3.1856) → status=found
kind=zone
  libelle="N" typezone=null typesect="03" idurba="63268_CC_20190221" instrument=CC
  date=2019-02-21 doc=null page=null gpuDocId="f59b1c89b86f69b964c5ca06dedcf9a2"
  refusal.code=no-rule-pack legallyGrounded=false
  refusal.headline=Zone N (CC 63268_CC_20190221) — règlement not yet extracted; no envelope asserted.

=== Bergonne RNU (45.525,3.22) → status=found
kind=rnu
  municipality={"insee":"63036","name":"BERGONNE","isRnu":true}
  refusal.code=no-rule-pack headline=BERGONNE (INSEE 63036) is under the RNU — no local plan; no envelope asserted.

=== Paris Marais (regression arm) (48.859,2.348) → status=found
kind=deferred
  deferred to=["fr-75056-paris"] names=["Paris (Ville de Paris)"]

=== Golfe du Lion sea (42.9,3.6) → status=absent
  reason=no-feature: gpu/municipality @ 42.9,3.6

DRIVER_VERDICT=PASS
```

Notes against the brief's literal arms:
- **Arm 1** — Lyon: live `libelle "UCe1b"`, `typezone "U"` verbatim, wrapped in the typed
  refusal. The brief's "rural Solignat (45.5636,3.1856)": live `libelle "N"`, `typesect "03"`
  — served by **secteur-cc**, NOT zone-urba, and the commune at that coordinate is PARDINES
  (insee 63268), not Solignat (barrel item 6a/6b: the brief's coordinate label is off; the
  point is real and answered by name).
- **Arm 2** — Paris: `deferred` to `fr-75056-paris` with **zero network calls** (the unit test
  proves 0 fetches; the live run confirms the same branch). The existing certified-pack path
  is consulted through THE `resolveRegisteredJurisdictionAt`, untouched.
- **Arm 3** — sea point → `absent` by name. GPU 5xx → transient: proven at the unit layer
  (fake 502 → `upstream-failed: HTTP 502`, ladder stops after 1 call) and at the live layer by
  the §5 severed-URL falsification (`endpoint-unreachable:`) — never empty, never a refusal card.

## §5 — Falsification (arm 5): severed base URL → transient BY NAME; byte-identical restore

1. `sha256(frGpuClient.ts)` before: `c62b8878ab1bf6766dd6efa73201bc45b7b590e961247c953893aeb7da5b55b7`.
2. `FR_GPU_APICARTO_BASE` severed to `https://apicarto.invalid.pryzm-severed.example/api/gpu`.
3. Live Lyon call → verbatim:
   `status=transient` ·
   `reason=endpoint-unreachable: https://apicarto.invalid.pryzm-severed.example/api/gpu/zone-urba?geom=… (fetch failed)`
   → **SEVERED_VERDICT=PASS (transient by name)**, RC=0. Not absent, not empty, not a zone.
4. Restore from backup; `sha256` after: `c62b8878ab1bf6766dd6efa73201bc45b7b590e961247c953893aeb7da5b55b7`
   → **BYTE-IDENTICAL**.

## §6 — Footprint and the forbidden files

`git status --porcelain -- packages/site-parcel-data` at close shows ONLY:
`?? __tests__/fixtures/fr-gpu-zoneid/` · `?? __tests__/frZoneIdentity.test.ts` ·
`?? src/countryAdapters/fr/` (plus `?? src/countryAdapters/pt/`, the concurrent G4 PT lane's).
**`src/index.ts` and `parcelProviders/registry.ts` are untouched** (absent from status);
`packages/schemas/**` and `apps/editor/**` carry only the concurrent UCE/component lane's edits.
Barrel/registry wiring is queued for the orchestrator in `barrel-additions-fr-zoneid.txt`
(items 1–4). **NOT COMMITTED — per the lane brief, the orchestrator owns the commit.**

## §7 — Open items handed to the orchestrator (from the barrel file, re-verified)

1. Barrel export line into `src/index.ts` (item 1 — collision grep re-run: 0 hits).
2. GPU source-row migration into `sourceRegistry/fr.ts` + delete the adapter literal (item 2).
3. Dispatcher wiring in `apps/editor/.../siteDispatch.ts` — the edit that closes G3 at the
   user layer (item 3; the leg self-defers, so mis-ordering cannot pre-empt Paris).
4. C57 same-origin proxy for browser use (item 4 — the E9 shape).
5. DEMO-READINESS G3 qualifiers: the "zone_urba 6/6" sentence and the point-6 commune label
   (items 6a/6b).
