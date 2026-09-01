# LANE E6-PL — THE POLAND COUNTRY ADAPTER

Wave E6 (plan; lane brief 2026-09-01). Built on the ESTONIA exemplar
(`packages/site-parcel-data/src/countryAdapters/ee/`) — same shape, no second idiom.
NOT COMMITTED (lane rule): the files below sit in the working tree.

**One-line verdict:** Poland's zone-envelope layer is now mapped end-to-end onto the frozen
canonical model and proven on the state's own artifact — **and the national channel is not live
yet, which every source row, every grade and the chain's own refusals say out loud.**

---

## A · What was built

`packages/site-parcel-data/src/countryAdapters/pl/` (new; 6 files) + one test file + two
pinned fixtures.

| File | Role |
|---|---|
| `plJurisdiction.ts` | `POLAND_BBOX` + `isInPoland`, with the overlap audit run and its **unresolved DE overlap recorded as a blocker to registration** |
| `plSources.ts` | the §J `sources()` leg — the thin registry's PL rows **by reference** + ONE adapter-owned APP-GML row carrying `adapterStatus:'not-yet-live'`; `PL_RU_ENDPOINT_DISCOVERY` (the dated, controlled discovery transcript); a build-time anti-drift guard |
| `plUldkClient.ts` | the parcel arm — GUGiK ULDK, keyless, live-probed; body-not-HTTP-status classification; a module-local WKT polygon reader (grep-justified) |
| `plRuleMapper.ts` | **the core** — `app:StrefaPlanistyczna` → minted `SiteIntelZone` + `SiteIntelRule[]`, with R1/R2/R3/R5 seats and tier-6 UNKNOWNs |
| `plPogChain.ts` | document → rule set; the not-yet-live fetch seam; the parcel→strefa join seam; `PL_APPLICABILITY_LADDER`; `PL_CHAIN_GRADES` |
| `index.ts` | the §J adapter value + the module door |
| `__tests__/plAdapter.test.ts` | **39 proofs** |
| `__tests__/fixtures/pl-uldk-2026-09-01/*.txt` | the two 20-parcel-baseline ULDK responses, as served 2026-09-01 |

**The parser was consumed, not rebuilt** (E4 control 5): `parsers/appGml/` (lane E2b, committed,
24 tests) is the country-FORMAT machinery; this lane wrote the country-SEMANTICS half and never
re-parses XML.

---

## B · The one live endpoint-discovery attempt — the answer is NOT-YET-SERVABLE

Transcripts: `impl/lane-e6-pl-transcripts/`. Recorded in code as `PL_RU_ENDPOINT_DISCOVERY`
so the next lane re-runs it instead of re-guessing.

| Attempt | Result |
|---|---|
| `https://rejestr-urbanistyczny.gov.pl/` | HTTP 200, 22,530 B, `text/html` — Angular SPA shell |
| `…/api/` · `…/wfs?…GetCapabilities` · `…/csw?…` · `…/wms?…` · `…/geoserver/ows?…` | ALL HTTP 200 with the **same 22,530-byte shell** — a catch-all route, not a service |
| `https://api.rejestr-urbanistyczny.gov.pl/` | connection reset (curl 56) |
| RU bundle `main-ADGQ7UID.js` → `/assets/federation.manifest.json` | five **front-end** remotes (`published-fe`, `eservices-fe`, `published-details-fe`, `repo-fe`, `notifications-fe`); **no data-service base URL** |
| `…/assets/{config,app-config,environment}.json` | SPA shell (no config served) |
| `https://integracja.gugik.gov.pl/eziudp/` | HTTP 200, 197,045 B; **zero** occurrences of `urbanistyczn` in the served HTML — the eziudp register is itself an app shell, so the lane-4 OPEN ITEM (harvest RU endpoints from eziudp) still needs the harvest lane |

### ⭐ The near-miss, and the control that killed it

`https://mapy.geoportal.gov.pl/wss/ext/**KrajowaIntegracjaPlanowOgolnych**?service=WMS&request=GetCapabilities`
→ **HTTP 401 "Unauthorized." (96 bytes).** That reads exactly like "the national POG integration
service exists and is access-gated" — a finding worth reporting, at the same base path where
KIMPZP (the MPZP equivalent) answers **HTTP 200 with a real GetCapabilities title**.

**It is not a finding. Negative control:**

```
KrajowaIntegracjaPlanowOgolnych               HTTP 401 len=96 <html>…<title>Unauthorized.</title>…
KrajowaIntegracjaPlanowOgolnychZZZNONSENSE    HTTP 401 len=96 <html>…<title>Unauthorized.</title>…
ZupelnieNieistniejacaUsluga123                HTTP 401 len=96 <html>…<title>Unauthorized.</title>…
```

Byte-identical 401 for a nonsense service name ⇒ the 401 is that base path's catch-all and is
**no evidence the POG service exists**. Reporting it would have been a confident false positive
of exactly the §GetCapabilities-is-not-an-inventory / §probe-can-be-wrong-three-ways class.
The control is stored in the source row so it cannot be lost.

**Expected answer, per the brief: nothing is servable before 2026-11-30.** Confirmed. The
adapter therefore runs on the official ministry fixture and says so in `adapterStatus`,
`coverage`, `PL_CHAIN_GRADES` and every refusal reason.

---

## C · What was ALSO probed live, and does work

| Source | Result (2026-09-01) |
|---|---|
| **ULDK** `GetParcelByXY&xy=21.0061,52.2317,4326` | HTTP 200 → **`146510_8.0309.24/35`** (Warszawa, obręb 5-03-09) + 125-vertex closed ring, `SRID=2180` |
| **ULDK** `GetParcelById&id=126105_9.0001.311` | HTTP 200 → **`126105_9.0001.311`** (Kraków, obr. S-1) + 41-vertex ring |
| **KIMPZP** WMS GetCapabilities | HTTP 200, `text/xml`, Title *Krajowa Integracja Miejscowych Planów…* (the positive control) |
| **KIEG** WMS GetCapabilities | HTTP 200, `text/xml`, Title *Krajowa Integracja Ewidencji Gruntów* |
| **INSPIRE registry** `ProcessStepGeneralValue.en.json` | 4 registered codes, mirrored verbatim into `PL_ACT_STATUS_CODELIST` |

### The ULDK honesty trap, measured and encoded

**Every ULDK answer is HTTP 200** — success, absence and misconfiguration alike. The status is
the first token of the BODY:

```
success        → "0\n<record>|<record>|…"
genuine absence→ "-1 brak wyników"        (measured: a nonsense id AND a Berlin point)
bad parameter  → "niepoprawny parametr NieMaTakiego, specyfikacja usługi…"   (no status token)
```

Reading `res.ok` as success would turn a service misconfiguration into "no parcel here" — the
failure≠absence conflation §CONTEXT-DATA-HONESTY forbids. `plUldkGet` classifies from the body:
`-1 brak wyników` → **absent**, anything else non-`0` → **transient**, and both shapes are tested.

Axis order is also a silent-absence trap: `xy=` is **LON,LAT**; the swapped pair is a point in
the Indian Ocean and answers `-1 brak wyników`. The swap happens exactly once, in
`buildUldkByXyUrl(lat, lon)`.

---

## D · The mapping — every load-bearing qualifier has a typed seat (E4 control 8)

`app:StrefaPlanistyczna` → **one minted `SiteIntelZone`** + **6–7 `SiteIntelRule`s**:

| APP element (XSD verbatim) | canonical parameter | unit |
|---|---|---|
| `maksNadziemnaIntensywnoscZabudowy` | `maxFloorAreaRatioAboveGround` | — |
| `maksUdzialPowierzchniZabudowy` | `maxCoveragePercent` | `%` |
| `maksWysokoscZabudowy` | `maxHeight` | the document's **own uom**, verbatim |
| `minUdzialPowierzchniBiologicznieCzynnej` | `minGreenSharePercent` | `%` |
| `nazwa` (RodzajStrefyPlanistycznejKod) | `zoneKindCode` | — |
| `profilPodstawowy` (KlasyPrzeznaczeniaTerenu) | `landUseProfilePrimary` | — |
| `profilDodatkowy` | `landUseProfileAdditional` | — |

- **R1 applicability** — the EE referent ladder, unchanged in shape: plan minted + geometry
  readable → mint the **Zone**, basis cites it; plan only → basis cites the **Plan**; geometry
  only → inline geometry (R1's residual leg — `Zone.planId` is required, so a plan-less zone is
  *no* Zone, never a half-minted one); neither → **throw by name**. Proof: all **174 basis refs
  resolve to entities minted in the same run**, asserted per-rule.
- **R2 valueBasis** — `{scheme:'pl-upzp-2003', code:'<the XSD's own article citation>'}`, e.g.
  `art. 13e ust. 2 pkt 2 oraz ust. 3 pkt 1 i 2`. ⚠ **A POINTER TO THE DEFINITION, NOT A RESOLVED
  DENOMINATOR** — see §F.
- **R3 validityBasis** — `legal` **only** when the ACT's status is the INSPIRE code `legalForce`
  ("legally binding or active"); otherwise `ingestion` + the fetch date. Rationale is the XSD's
  own text: `obowiazujeOd` is *"data, od której dana **wersja obiektu przestrzennego**
  obowiązuje"* (an object-version axis) and `status` describes *"wersja aktu … **lub jego
  projektu**"* (a draft carries dates too). The official sample is `elaboration` — a **draft** —
  so its rules are honestly ingestion-versioned and answer no point-in-time question. The served
  object-version date is **preserved verbatim in the note**, and the act's version window gets
  its own typed seat: a minted **`SiteIntelVersion`** (`validFrom 2024-12-04`).
- **R5 normativeForce** — `charakterUstalenia` → `generallyBinding`, mirrored verbatim on all 174.

**Entities minted:** 1 `SiteIntelPlan` (`kind: planOgolnyGminy`, `status: elaboration`),
1 `SiteIntelVersion`, 28 `SiteIntelZone`, 174 `SiteIntelRule`, **0 `SiteIntelDocument`** — the
sample's single `DokumentFormalny` serves no `app:lacze`, and `Document.url` means a retrievable
address, so passing an IIP URI off as a URL was refused; the identity still travels on the rules.

---

## E · E4 control 9 — the state's own artifact exercises UNKNOWN, and it stays UNKNOWN

The ministry sample omits ceilings on many zones. Two independent counts agree:

| Element | present (grep of the fixture bytes) | absent | tier-6 rules emitted |
|---|---|---|---|
| `maksNadziemnaIntensywnoscZabudowy` | 18 / 28 | **10** | **10** |
| `maksUdzialPowierzchniZabudowy` | 18 / 28 | **10** | **10** |
| `maksWysokoscZabudowy` | 18 / 28 | **10** | **10** |
| `minUdzialPowierzchniBiologicznieCzynnej` | 20 / 28 | **8** | **8** |

**38 tier-6 rules with `value: null`, one per absent ceiling — visible rows, never dropped, never
0, never "no limit".** Each note names the absent element and its `minOccurs=0` status. A test
asserts that no ceiling anywhere is `0` and that every zone carries all four rows.

---

## F · Refused by name (and why the refusal is the right answer)

1. **GFA / development potential is REFUSED, not "missing".** The statutory denominator for
   *intensywność zabudowy* and *udział powierzchni zabudowy* is **powierzchnia działki
   budowlanej** — a planning object that is **not** the cadastral *działka ewidencyjna* ULDK
   serves, and the APP schema serves **no per-value denominator column** (unlike DK's
   `bebygpctaf`). Computing `GFA = FAR × ULDK parcel area` would be the C63 Aarhus trap with
   every field parsing clean. `PL_CHAIN_GRADES.DP` says `REFUSED` and names the reason.
2. **The parcel→strefa spatial join is REFUSED by default — with an escape hatch.** The parcel
   arrives in **EPSG:2180**, the POG sample draws zones in **EPSG:2176**; a cross-CRS
   point-in-polygon needs a reprojection this lane does not own ("never measure after a lossy
   reprojection"), a repo grep finds no point-in-polygon solver at this layer to adopt, and the
   sample is a synthetic gmina that does not cover Warszawa or Kraków anyway. The default
   locator returns a **transient** naming BOTH served CRSs and ending *"This is NOT 'no zone at
   this parcel'"*. `PlStrefaLocator` is injectable and **the injected path is tested end-to-end**
   — the refusing half has its escape hatch (§L-942).
3. **`ObszarUzupelnieniaZabudowy` (4), `ObszarZabudowySrodmiejskiej` (2),
   `ObszarStandardowDostepnosci` (1) are NOT mapped** (E4 control 2 — outside approved scope).
   They are **counted in `PlPogRuleSet.unmapped` with a reason**, so a consumer sees what it is
   not being told. The *śródmiejska* row states the direction of the incompleteness: that overlay
   RELAXES statutory minimums, so a rule set over a parcel inside one is **incomplete, not wrong**.
4. **No canonical-model change.** No new entity, field or abstraction; nothing in
   `packages/schemas/` was touched. No `vocabularies/pl.ts` was minted — the PL vocabulary lives
   in the adapter, exactly as EE's does.
5. **No shared file edited.** `src/index.ts`, `sourceRegistry/*`, `registry.ts` untouched; the
   barrel line is written to `impl/barrel-additions-pl.txt` for the orchestrator.
6. **No rival registry row.** `sourceRegistry/pl.ts`'s three PL rows are imported **by
   reference**; the adapter owns exactly one new row and asserts at module load that the ULDK id
   it cites exists in the registry.
7. **The adapter is deliberately NOT registered in `parcelProviders/registry.ts`.** The overlap
   audit found `GERMANY_BBOX` overlapping `POLAND_BBOX` over the Oder/Nysa strip
   (lon 14.12–15.1), where a smallest-box resolver would route **German** territory to Poland.
   Registering behind a known-wrong overlap would be the defect. A test pins the honest failure
   (`isInPoland(52.34, 14.55)` — Frankfurt (Oder) — is `true`).
8. **No MPZP/KIMPZP source row.** `sourceRegistry/pl.ts` deliberately defers it pending a licence
   read; adding one here would contradict a deliberate exclusion.

---

## G · 20-parcel benchmark — PL rows 19–20, graded honestly

Parcels: **`146510_8.0309.24/35`** (Warszawa) and **`126105_9.0001.311`** (Kraków), both
resolved LIVE this session and pinned as fixtures.

| Step | Grade (2026-09-01) | Evidence |
|---|---|---|
| **P** parcel | **DIRECT** | ULDK live + keyless; both baseline parcels; native EPSG:2180 ring, closed |
| **C** contextual | **MISSING** | BDOT10k GeoParquet is registry-documented; wiring DuckDB-over-HTTP is outside scope — recorded, not faked |
| **S** planning source answers | **DIRECT (document) / MISSING (service)** | the official APP GML parses and maps; no RU service exists yet (§B) |
| **PL** applicable plan | **DIRECT in-document / MISSING per-parcel** | the act→zone xlink join is real and tested; there is no per-parcel service to ask |
| **R** applicable numeric rule | **DIRECT in-document / MISSING per-parcel** | 174 rules incl. 38 tier-6; the baseline predicted *"MISSING today → DIRECT after RU"* — the **structured mapper is already built**, only the channel is missing |
| **E** evidence | **DIRECT (identity) / MISSING (document URL)** | every rule carries gml:id + IIP identity + plan_id + object_id; the sample act has no adopting document and no `lacze` |
| **D** deterministic constraint set | **DIRECT** | typed `SiteIntelRule[]`, every basis ref resolving to a minted entity |
| **V** envelope | **MISSING** | not computed by this lane |
| **DP** development potential | **REFUSED** | the denominator, §F.1 — a refusal is the correct answer, not a gap |

**The regime flip is pinned, not silent** (the row's own acceptance criterion): `PL_CHAIN_GRADES`
records the pre-flip grades and names the flip point — **`fetchPlPogDocument`, one function**,
plus a served `PlStrefaLocator`. **No core change is needed for the flip**, and a later run must
show an IMPROVEMENT against this pinned object rather than a rewritten adapter.

---

## H · Verification (all foreground, RCs captured directly)

```
npx vitest run __tests__/plAdapter.test.ts        → Test Files 1 passed · Tests 39 passed (39)
npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit   → PKG_TSC_RC=0
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json → ROOT_TSC_RC=0  (0 × "error TS")
npx vitest run  (whole package)  → PKG_VITEST_RC=1 · Test Files 1 failed | 162 passed (163)
                                   Tests 2 failed | 3389 passed (3391)
```

⚠ **The 2 package-wide failures are NOT this lane's** and are not caused by it: both are in
`__tests__/dkCorrections.test.ts`, an **untracked, in-flight sibling-lane file** (`git status`:
`?? __tests__/dkCorrections.test.ts`, `?? src/countryAdapters/dk/`, ` M src/sourceRegistry/dk.ts`
— the DK lane is mid-edit right now). That file imports only DK modules + the shared barrel and
nothing of PL's. This lane edited no shared file, so it cannot have caused them. **PL's own file
is 39/39 green.**

> ⚠ **RE-MEASURED 2026-09-01 17:34 (adversarial verification pass) — the two failures above
> are GONE and that reading is now STALE.** Transcript:
> `impl/lane-e6-pl-transcripts/verify-rerun-2026-09-01.txt` § 6.
>
> ```
> npx vitest run   (WHOLE PACKAGE)  → Test Files 163 passed (163) · Tests 3391 passed (3391) · RC=0
> ```
>
> The DK sibling lane settled; nothing was changed here to make this happen. Recorded rather
> than silently overwritten because the earlier reading was **stale-pessimistic** — it named a
> breach the gate does not report, which is the cheaper half of the oscillation defect
> `CLAUDE.md` §P4 documents, but still a wrong reading. **Run the suite; never quote either line.**

> ⛔ **A CAVEAT THE ORIGINAL H BLOCK DID NOT STATE, and it matters: ROOT TSC DOES NOT COVER
> THIS ADAPTER.** `ROOT_TSC_RC=0` is true, and it is **not** evidence the PL adapter typechecks.
> Measured, not assumed:
>
> ```
> npx tsc --noEmit -p tsconfig.json --listFiles | grep countryAdapters/pl  → ZERO
> npx tsc --noEmit -p tsconfig.json --listFiles | grep parsers/appGml      → 4 files
> npx tsc -p packages/site-parcel-data/tsconfig.json --noEmit --listFiles | grep -c countryAdapters/pl → 6
> ```
>
> Nothing in the root graph reaches `countryAdapters/pl/*` — the shared barrel exports no
> `countryAdapters` at all (which is also why the barrel line is deferred, §barrel-additions).
> **The PACKAGE tsc (RC=0, 6 files covered) is the arm that actually proves the adapter compiles.**
> Quoting the root RC for this adapter would be a gate that measures nothing.

---

## I · Falsification (seen failing → byte-identical restore → green)

**1 — the brief's exact ask: corrupt one mapped zone attribute.**
`<app:maksWysokoscZabudowy uom="m">15.0</…>` → `20.0` (first occurrence, on disk):

```
SHA BEFORE:       173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853
SHA AFTER CORRUPT:75f795180a52efab199c544d57b65de06544fa899ca29af36bf143dfc47e13b3
 FAIL  … > maps strefa 1SZ to the lane-audit values, in the document native CRS
       AssertionError: expected 20 to be 15
 FAIL  … > is the byte-identical official ministry POG sample (sha256 pinned by lane E2b)
       Tests  2 failed | 37 passed (39)
SHA AFTER RESTORE:173690566bf1fab5fbb448970efc007219848d06eb93ff5e7e35c70ea5090853   (cmp: identical)
re-run → Tests 39 passed (39)
```

**2 — the defect class this wave exists to kill: UNKNOWN → 0.** Injected into the mapper's
decimal-ceiling branch (`value: null, tier: 6` → `value: 0, tier: 1`):

```
 FAIL  … control 9 > emits a tier-6 rule for every absent ceiling: 10 / 10 / 10 / 8 (grep-verified)
       AssertionError: expected { maxHeight: 10 } to deeply equal { …(4) }
 FAIL  … control 9 > never turns an absent ceiling into 0, Infinity or a missing row
 FAIL  … control 9 > names the absent element in the tier-6 note
       Tests  3 failed | 36 passed (39)
mapper sha BEFORE = AFTER RESTORE = 45b2dc79fbe3f7f940be530c6fbd8cea2971fbe8209a05551af04ecd8193a5d7 (cmp: identical)
re-run → Tests 39 passed (39)
```

**3 — scramble control** (§corpus-never-jittered), inside the suite: a corruption the mapper is
NOT asked to refuse (`oznaczenie` `1SZ`→`9ZZ`) parses fine and changes the output visibly — the
suite cannot pass on arbitrary input.

**4 — the edit-actually-applied guard caught itself.** The R3 `legalForce` test first failed on
`expect(inForce).not.toBe(GML)` because the intended in-memory edit did not match. Without that
assertion the test would have "passed" while proving nothing about `legalForce` — a fake-green.

**5 — THE BRIEF'S EXACT ASK, RE-RUN INDEPENDENTLY ON THE *MAPPER* RATHER THAN THE FIXTURE
(adversarial verification pass, 2026-09-01).** Falsification #1 above corrupts a value in the
GML; that is additionally caught by the sha256 fixture pin, so it cannot isolate the mapper.
This one rewires the **mapping itself** — the coverage ceiling made to read FAR's element
(`plRuleMapper.ts:649`):

```
-  { entry: vocab('maksUdzialPowierzchniZabudowy'), v: strefa.maksUdzialPowierzchniZabudowy },
+  { entry: vocab('maksUdzialPowierzchniZabudowy'), v: strefa.maksNadziemnaIntensywnoscZabudowy },

sha256 BEFORE   45b2dc79fbe3f7f940be530c6fbd8cea2971fbe8209a05551af04ecd8193a5d7
sha256 CORRUPT  806d9881ca439650dcc62878c0645ed4beca7ea5f40a733a49e93c9e7407e603

 FAIL  __tests__/plAdapter.test.ts > APP GML 2.0 POG document → canonical rules
       > maps strefa 1SZ to the lane-audit values, in the document native CRS
 AssertionError: expected 0.8 to be 50 // Object.is equality
 ❯ __tests__/plAdapter.test.ts:182:45
    182|         expect(value('maxCoveragePercent')).toBe(50);
       |                                             ^
       Tests  1 failed | 38 passed (39)   RC=1

sha256 AFTER RESTORE 45b2dc79fbe3f7f940be530c6fbd8cea2971fbe8209a05551af04ecd8193a5d7  (== BEFORE)
re-run → Test Files 2 passed (2) · Tests 63 passed (63)
```

The failure **names the corrupted attribute** (`maxCoveragePercent`). ⭐ **Why only ONE test
failed — checked, not shrugged at:** the four ceilings are absent on the SAME zones (FAR,
coverage and height are each absent on the same 10 of 28), so rewiring coverage→FAR leaves the
tier-6 census at 10 and only the 1SZ value assertion moves. That is a property of the ministry
sample, not a hole in the suite.

**6 — the lane's own live NEGATIVES re-run independently, and TWO came back STRONGER.**
Transcript: `impl/lane-e6-pl-transcripts/verify-rerun-2026-09-01.txt`.

- **The 401 catch-all is byte-identical by SHA256**, not merely by length — the report claimed
  only "96 bytes". All three of `KrajowaIntegracjaPlanowOgolnych`, `…ZZZNONSENSE` and
  `ZupelnieNieistniejacaUsluga123` return
  `sha256=1ef5b68206afdf9b19e23e624fb0c4f167d877d3e2cf1fd75fbe004de54d6ff3`, while the positive
  control KIMPZP returns HTTP 200 `text/xml` with a real `<Title>`. **The refusal to report a
  "discovered gated POG service" was correct** (§GetCapabilities-is-not-an-inventory).
- **The pinned ULDK fixtures are byte-identical to what the live service serves TODAY** (`cmp`
  clean on both baseline parcels) — so the suite's fakes are not "more capable than real":
  they ARE the real bodies, including the two HTTP-200 honesty controls
  (`-1 brak wyników` → absent; `niepoprawny parametr …` → transient).
- **The control-9 census re-derived from the raw XML** (splitting the fixture into
  `StrefaPlanistyczna` blocks, never via the adapter) agrees exactly: **10 / 10 / 10 / 8 absent
  of 28**, 174 rules. ⚠ It also exposes a trap the naive grep walks into: **14
  `profilDodatkowy` ELEMENTS live on only 6 ZONES**, so the element count is NOT the rule count.

---

## J · Discoveries recorded, NOT acted on (E4 control 10)

1. **`mapy.geoportal.gov.pl/wss/ext/*` returns a blanket 401 for unknown services** — any future
   endpoint sweep against that base must carry a nonsense-name control or it will mint phantom
   "gated" services.
2. **RU is a five-remote micro-frontend** (`/assets/federation.manifest.json`). Its data services,
   when published, will be behind whatever those remotes call — the next discovery attempt should
   drive the SPA and capture network calls rather than guessing paths (the lane-4 OPEN ITEM's
   second half). Its JS is served with `server-name: test` today.
3. **The official sample declares `numberReturned="6"` while carrying 37 members.** Lane E2b left
   reconciliation to the adapter; the adapter **records the disagreement as a caveat and trusts
   the members**. Reconciliation policy for real exports is still open.
4. **`obowiazujeOd` semantics are a national-schema-wide trap**: the XSD defines it as an
   object-VERSION axis for every APP feature type, so any future PL work (MPZP, RU harvest) must
   gate `validityBasis:'legal'` on the act's status the same way, or it will emit confident
   false in-force claims at scale.
5. **The gmina TERYT code is inside the IIP namespace** (`PL.ZIPPZP.11111/321202-POG` →
   `321202`), which is the natural join key to ULDK's `commune` once RU serves per-gmina exports.
   Not wired (no service to wire it to).
6. **All 28 sample strefy carry `charakterUstalenia = generallyBinding`** — no `nonBinding` /
   advisory case exists in the sample, so the R5 arm is exercised structurally on one value only.
   The first real POG harvest should re-check whether gminy use the other codes.
