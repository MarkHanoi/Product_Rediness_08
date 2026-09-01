# LANE E6-LT — THE LITHUANIA ADAPTER (findings)

> Wave E6. Built on the Estonia exemplar (`packages/site-parcel-data/src/countryAdapters/ee/`),
> read in full first. Every claim below is a LIVE measurement of 2026-09-01 with its transcript
> in `lane-e6-lt-transcripts/`; nothing is transcribed from the audit lane file without
> re-measuring. **Where this lane contradicts `lanes/netherlands-poland-lithuania-estonia.md`
> §LT-1, the contradiction is the finding — see §2.**

## Status: COMPLETE — both baseline parcels resolved END-TO-END LIVE; the named blocker RESOLVED AS A REFUSAL, with evidence

| | |
|---|---|
| Root tsc | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**, 0 errors |
| Package tsc | `npx tsc -p tsconfig.json --noEmit` (site-parcel-data) → **RC=0**, 0 errors |
| Tests | `npx vitest run __tests__/ltAsgrAdapter.test.ts` → **RC=0, 26/26 pass** · with `eeAdapterRework` + `dkPlandataEnvelope`: **55/55** |
| Falsifications | 2 executed, both seen FAILING by name, both restored **byte-identically** (sha256 diff clean) — §6. **Re-executed against the FINAL code 17:31** (§6 correction box) |
| Re-verification | **Everything above re-run against the on-disk state at 17:26–17:31**, because the adapter was edited *after* transcripts 01–06 were written. Fresh live recording **diffs to 0 lines** against the replayed fixture. Transcript `07-reverification-final-state-2026-09-01.txt` |
| Shared files edited | **NONE.** Barrel + registry additions queued in `barrel-additions-lt.txt` |
| Commits | none (per brief) |

---

## 1. What was built

`packages/site-parcel-data/src/countryAdapters/lt/` — seven modules, the EE shape:

| File | Role |
|---|---|
| `ltJurisdiction.ts` | `LITHUANIA_BBOX` + `isInLithuania`, with the overlap audit (nothing registered intersects LT; ESTONIA_BBOX minLat 57.5 vs LT maxLat 56.5 — they do not touch) |
| `ltArcgisClient.ts` | The ONE impure seam: a FetchOutcome-classified ArcGIS REST `query` (POST), plus pure param builders and attribute readers |
| `ltParcelProvider.ts` | NTR parcels by `kadastro_nr` / at a WGS84 point |
| `ltAsgrProvider.ts` | ASGR consolidation polygons for a parcel ring + the TPDR `ribos` plan register |
| `ltRuleMapper.ts` | PURE: ASGR attributes → `SiteIntelRule[]` + minted `SiteIntelPlan`/`SiteIntelZone` |
| `ltSourceRefs.ts` | CONSUMES `sourceRegistry/lt.ts`; adds exactly ONE row (`ribos`) the registry lacks |
| `index.ts` | The §J adapter value + `resolveLtParcelChain` |

`packages/site-parcel-data/__tests__/ltAsgrAdapter.test.ts` — 26 tests over fixtures **recorded
by driving this adapter against the live services** (`lane-e6-lt-transcripts/probe-lt-chain.mts`
re-records them).

**Deliberate omission (E4 controls 2 + 10): no buildings arm.** Lithuania publishes no open
national 3D building model; footprints live in GRPK and per-building storeys in the priced Real
Property Register; LiDAR is behind a signed-licence gate. Those are GATES and DERIVATIONS, not a
keyless layer this lane could wire honestly. The one building fact the open parcel service does
serve (`pastat_sk`, the building count) is carried on the parcel.

**Deliberate reuse, not a rival.** `providers/containers/arcgisRest.ts` was read in full before
`ltArcgisClient.ts` was written; its `ArcgisRestFeature` type is imported and its ArcGIS honesty
doctrine inherited verbatim. It could not be used because it has none of the three shapes LT
needs (attribute-only `where`; polygon-ring intersect; POST) and returns `{ok:false}`, which
conflates EMPTY with FAILURE where E4 control 7 requires `FetchOutcome`. Extending it is the
right long-term home — but it is a shared file, so the reconciliation is queued, not performed.
Its `§ARCGIS-TRANSIENT-RETRY` backoff is deliberately **not** duplicated.

---

## 2. ⛔ THE LANE FILE AND THE L0 VOCABULARY ARE BOTH WRONG ABOUT LT's PER-VALUE PROVENANCE

This is the lane's most consequential finding, because per-value provenance is "the LT prize"
and both descriptions of it name columns that do not exist.

**Claim (lane §LT-1, and `packages/schemas/src/siteintel/vocabularies/lt.ts`):** the
`*_TP` / `*_NR` / `*_D` / `*_TPR` suffix family attaches to "EACH of the four value families",
read as the four numeric regulation fields.

**Measured** (`ASGR/MapServer/0?f=json`, 33 fields, transcript
`asgr-layer0-descriptor-2026-09-01.json`) — wrong in two independent ways:

1. **There is no underscore before the suffix.** The columns are `PAGR_PASKTP`, `PAGR_PASKNR`,
   `PAGR_PASKD`, `PAGR_PASKTPR`. A regex for `_(TP|NR|D|TPR)$` over the field list returns **0
   matches**.
2. **The provenance families are the four CLASSIFICATION fields, not the four numerics.**
   Suffixed columns exist for `PAGR_PASK`, `NAUD_BUD`, `FUNKC_ZON`, `NAUD_TIP` and for nothing
   else. `MAX_AUK_M`, `MAX_INTENS`, `MAX_TANKIS`, `MIN_APZELD` carry **no source id, no document
   number, no approval date, no planning kind**.

`ltAsgrProvenanceColumns()` in the L0 vocabulary therefore emits column names that are wrong on
both axes; a caller trusting it queries non-existent columns and receives an ArcGIS
400-inside-a-200. The adapter does **not** call it — it uses a measured sibling,
`ltAsgrProvenanceColumnsMeasured()`, which a unit test pins. The L0 fix is queued in
`barrel-additions-lt.txt` §3a (it is a behaviour change to a shared L0 module, and it is **not** a
canonical-model change — E4 control 3 is not engaged).

**Live proof that per-value provenance is REAL and matters** (baseline parcel `0101/0054:0328`,
ASGR OBJECTID 97619 — one polygon, two governing documents, two dates):

| field | value | source TPD | document nr | approval date | planning kind |
|---|---|---|---|---|---|
| `PAGR_PASK` | `KT` | 123025 | T00087142 | **2021-12-17** | K_D (detail plan) |
| `NAUD_BUD` | `V;B` | 123025 | T00087142 | **2021-12-17** | K_D |
| `FUNKC_ZON` | `U_SK_F` | **203143899** | **T00086338** | **2021-06-02** | B_SAV (comprehensive plan) |
| `NAUD_TIP` | `SI` | 123025 | T00087142 | **2021-12-17** | K_D |
| `MAX_AUK_M` 25 · `MAX_INTENS` 1 · `MAX_TANKIS` 45 · `MIN_APZELD` 15 | | **— none —** | — | — | — |

That table is mapped into the **per-rule `RuleProvenance`** (`source.plan_id`,
`source.document`, `valid_from`, `validityBasis`), never into a shared note. It is the
falsification target in §6.

### 2b. Three declared flags are nationally EMPTY

`PILN` (completeness), `ATN_DOK` (non-spatial update) and `PRIORIT` (priority) are **non-null on
0 of 175,570 polygons** (`returnCountOnly`, 2026-09-01). The supplement §10 row 17 asks that
`PILN=N` surface as a completeness caveat on the rule set; the mapping is implemented
(`ltCompletenessCaveat`) so a future fill needs no code change, and its test input is **labelled
SYNTHETIC in the test body** because no live row can exercise it. A fake must never look more
capable than the real thing.

---

## 3. ⛔ THE NAMED BLOCKER — `MAX_INTENS` IS **REFUSED**, and the evidence is stronger than "ambiguous"

The brief required settling the unit from the official ASGR methodology first, and refusing if
it did not settle. Both halves were executed.

### (a) The official specification was fetched and read — and it declines to state a unit
**VTPSI LEIP specification, 2024-06-18** —
`https://www.geoportal.lt/download/Specifikacijos/VTPSI_LEIP_specifikacija_20240628.pdf`
fetched **2026-09-01**, HTTP 200, 1,191,746 bytes, PDF 1.7, 21 pages (extract:
`06-vtpsi-leip-spec-asgr-table.txt`). In its ASGR attribute table every dimensioned field
carries its unit in the text — `MAX_AUK_M` *"…pastatų aukštis (**metrais**)"*, `MAX_TANKIS`
*"…užstatymo tankis, **procentai**"*, `MIN_APZELD` *"…dalys **procentais**"* — while
`MAX_INTENS` gets **only a data type** (*"Skaičius, 1 ženklas po kablelio"*) **and no unit at
all**. The same contrast repeats in the sibling per-TPD dispositions layer (`sprendiniai` layer
82, aliases read live: `MAX_TANKIS` ", procentai" · `MAX_AUK_M` ", m" · `MAX_SKL_PL` ", kv. m" ·
`MAX_INTENS` — nothing).

### (b) The methodology the spec defers to is not published
The spec states the data is *"rekomendacinio pobūdžio, rengiami pagal **ASGR sudarymo
metodiką**"*. That methodology could not be obtained:
`geoportal.lt/download/Specifikacijos/` → **HTTP 403**;
`tpdr.planuojustatau.lt/assets/ASGR_metodika.pdf` → **HTTP 404**; two targeted web searches
surfaced no public copy. Recorded, not guessed.

*(For completeness: the Lithuanian statutory definition of* užstatymo intensyvumas *is a
dimensionless coefficient — the ratio of above-ground gross floor area to plot area. That
settles what the TERM means. It does not settle what THIS COLUMN's numbers are scaled in, which
is the question — and (c) shows the column contradicts any single answer.)*

### (c) The served data is demonstrably MIXED-ENCODING — no methodology sentence could rescue it
Measured live 2026-09-01 (`05-asgr-fill-and-domain-measurements.txt`):

* **ASGR**: 175,570 polygons · `MAX_INTENS` filled on 23,932 (13.6%) — **22,921 ≤ 10** and
  **1,011 > 10, of which 122 > 100**.
* **`sprendiniai` layer 82** (the per-TPD dispositions the consolidation is built from): 25,270
  filled — 949 > 10, 56 > 100.
* The two populations are each coherent under **opposite** readings, in the same column, from
  different documents:

  | TPD | `MAX_INTENS` | `MAX_TANKIS` | storeys / height | only coherent as |
  |---|---|---|---|---|
  | T00071674 | 59 | 21 % | 3 storeys (ceiling FAR 0.63) | **percent** (0.59) |
  | T00071674 | 70 | 25 % | 3 storeys (ceiling 0.75) | **percent** (0.70) |
  | T00073313 | 19.3 | 55 % | 3 storeys (ceiling 1.65) | **percent** (0.193) |
  | **T00087142** (baseline parcel) | **1** | **45 %** | 25 m | **ratio** (1.0) — a percent reading gives FAR 0.01 on a plot permitted 45 % coverage, which is impossible |

  **Nothing served distinguishes them.**

### The decision
`MAX_INTENS` is **REFUSED**, and the refusal is a first-class, visible artefact — never a drop:

* emitted as a rule on **every** polygon (`parameter: 'floorAreaRatio'`),
* `value: null` at **confidence tier 6**,
* R2 `valueBasis: { scheme: 'lt-asgr-intensity-unit', code: 'UNRESOLVED-RATIO-OR-PERCENT' }` —
  so the refusal is **machine-visible**, not prose,
* a confidence note carrying **BOTH numbers** (C74): the raw served value and what it means
  under each reading, "a 100x difference in buildable area", with the measurement behind it.

A consumer computing GFA from it must ignore a null at tier 6 **and** a present `valueBasis`.
Supplement §10 row 17's acceptance criterion — *"any GFA computed from it is an acceptance
FAILURE"* — is enforced by a test that sweeps **every rule of every polygon of both baseline
parcels**.

**⛔ Do not "fix" this by picking a reading.** The disambiguation that would work — testing each
value against the coverage × storey ceiling — needs a storey count ASGR does not serve, and is
deterministic INFERENCE (tier 3) plus business logic: a different lane's work under E4 control
10. Recorded here, not performed.

---

## 4. R3 — the validity axis, DECIDED FROM FIELD SEMANTICS AND PROVEN BY MEASUREMENT

The brief asked: *is the served date a LEGAL date or an ingestion date? Decide from the field
semantics and record which.* The field semantics **conflict with themselves**, so the decision
was made by measurement instead:

* The `<FIELD>D` columns are aliased *"TP dokumento **tvirtinimo** data"* (APPROVAL date) by both
  the service and the specification.
* But the ASGR-generated `APIBENDR` prose on the same row calls the same value
  *"**Registravimo** data"* (REGISTRATION date). Those are different legal facts.

The TPDR `ribos` register serves **both** dates as separate columns, so the conflict is
decidable:

| TPD | ASGR `<FIELD>D` | `ribos.TVIRT_DATA` (approval) | `ribos.REGISTRUOTA` (registration) |
|---|---|---|---|
| 123025 | 2021-12-17 | **2021-12-17** ✓ | 2021-12-21 ✗ |
| 203143899 | 2021-06-02 | **2021-06-02** ✓ | 2021-06-08 ✗ |

⇒ **ASGR's `<FIELD>D` is the APPROVAL date — a legal axis.** The `APIBENDR` wording is the loose
one, and the rule that carries that prose says so on its own face.

Consequently:

* **Classification rules** → `validityBasis: 'legal'` + that approval date.
* **Numeric rules** → `validityBasis: 'ingestion'` + the fetch date, `source.plan_id` and
  `source.document` **null**. ASGR attributes no document to those columns; naming one of the
  polygon's cited documents would be a **fabricated legal address**. The candidates travel in the
  note (`"Candidate documents on this polygon: …"`) so a human can resolve what the machine may
  not. A point-in-time evaluator must treat these as not answering "was this in force on date D"
  — which, for these values, is the truth.

Plan date axes are kept apart too: `adoptedDate` ← `TVIRT_DATA`, `inForceFrom` ← `ISIGALIOJO`
(LT serves an in-force axis where EE does not), `inForceTo` ← **null** (the register's
`ISREGISTRUOTA` and `GALIOJA_IKI` are register acts and version windows, not legal repeal;
mirroring either would assert a fact the register does not serve — both stay available on the
raw row).

---

## 5. Control-8 and control-9 decisions made in this lane

**R2 `valueBasis` carries the DENOMINATOR (control 8).** `MAX_TANKIS` and `MIN_APZELD` are
declared by the register against the **žemės sklypas** — the cadastral LAND PLOT — while the ASGR
polygon they ride on is a consolidation zone that routinely spans many plots. Both carry
`{scheme:'lt-denominator', code:'zemes-sklypas'}`. Losing that is exactly the C63 Aarhus trap
(`bebygpct=180, af=1` → a wrong per-parcel GFA while every field parses clean). `MAX_AUK_M`
carries `{scheme:'lt-height-basis', code:'above-ground-relative'}`, justified by the sibling
`sprendiniai` layer serving absolute altitude as a **separate** field (`MAX_AB_ALT`).

**R5 `normativeForce`** = `'rekomendacinio pobūdžio'` on **every** rule, verbatim from the
specification. ASGR is a consolidation; the binding instrument is the underlying TPD. This is the
exact live form `provenance.ts` names as R5's LT example.

**Control 9 — zero is UNKNOWN, and that was measured, not assumed.** Counts of 175,570:

| field | `= 0` | out of domain | decision |
|---|---|---|---|
| `MAX_AUK_M` | 3,045 | none (`< 0`: 0; no upper bound imposed — see below) | UNKNOWN at 0: a maximum height of zero is a prohibition the register expresses no other way |
| `MAX_TANKIS` | 3,945 (2,570 sharing a row with `MAX_AUK_M=0`) | 16 above 100 (up to **2931**), 2 below 0 | UNKNOWN outside `0 < v ≤ 100` |
| `MAX_INTENS` | 2,095 | — | refused regardless (§3) |
| `MIN_APZELD` | 1,802 | none | **UNKNOWN at 0 — but only after checking** |

The `MIN_APZELD` call is the one that could have gone either way, because a *minimum* of zero is
semantically coherent ("no green share required") where a *maximum* of zero is not. So it was
measured: of the 1,802 zero rows, **1,343 (74.5 %) co-occur with an unfilled-looking
`MAX_AUK_M = 0`** while **441 sit beside a real positive height**. Both populations exist and
nothing served separates them — and reading it as a real zero is the **permissive** error,
asserting a permission the register never gave (the L-616 overstatement). It is therefore
tier-6, with that measurement in the note.

**No upper bound is imposed on `MAX_AUK_M`.** The register declares none. Six rows exceed 200 m
(Lithuania's tallest building is ~148 m), which is very likely fill quality — but inventing a
national height ceiling is exactly the guess this lane refused elsewhere. Recorded here, not
clipped. *(Candidate for a later data-quality lane.)*

**Float32 de-serialisation, done provably.** `MAX_AUK_M` and `MAX_INTENS` are esri `Single`, so a
served `0.2` arrives as `0.20000000298023224`. `ltDeserialiseSingle` rounds to the
specification's declared decimal count and keeps the result **only when it re-narrows to the
identical float32** — de-serialisation, not a transformation of the datum. A silent `toFixed()`
would be the latter.

---

## 6. Falsification (both executed in the foreground, both restored byte-identically)

Baseline: 26/26 green. `sha256sum` of all seven adapter files taken before and after.

**F1 — sever the per-value provenance mapping.** Patched `ltRuleMapper.ts` so every
classification rule reads the polygon's *first* resolvable provenance family instead of its own
— the "one document per polygon" shape a shared note would give. Result: **RC=1, 2 tests fail**,
and the first failure **names the field**:

```
FAIL  E6-LT 1 — per-value provenance lands on the RULE, not in a shared note
AssertionError: FUNKC_ZON must cite ITS OWN source document (FUNKC_ZONNR), not the
polygon's other one: expected 'T00087142' to be 'T00086338'
```
(second: `E6-LT 3 … expected 'legal' to be 'ingestion'` — a borrowed date on an unprovenanced
field.) Restored; `sha256` identical; 26/26 green.

**F2 — sever the `MAX_INTENS` refusal** (guess the unit as a ratio). Result: **RC=1, 4 tests
fail**, led by
`AssertionError: a refused unit must never become a computable value: expected 1 to be null`.
Restored; `diff` of the before/after hash files **clean**; 26/26 green.

Full transcripts: `03-falsification-per-value-provenance-severed.txt`,
`04-falsification-maxintens-refusal-severed.txt`.

> ⚠ **§6 CORRECTED 2026-09-01 17:31 by the re-verification pass — and the reason it needed
> one is the finding.** Transcripts 01–06 were written at **17:01–17:02**; `ltRuleMapper.ts`
> has mtime **17:17:42**. The adapter was edited *after* its own verification, so every
> number in this report was, until re-run, **unproven against the code on disk**. All of it
> was re-executed against the final state — 26/26 green, root tsc RC=0, package tsc RC=0,
> both baseline parcels re-resolved LIVE, and the fresh live recording **diffs to zero lines**
> against the fixture the tests replay. Both falsifications re-executed and restored
> byte-identically. **One number above is wrong:** F2 is recorded as *"4 tests fail"*; on the
> final code it is **3**. The 4th failure in transcript 04 was a note-TEXT assertion that
> fired because that earlier patch replaced the whole `MAX_INTENS` branch *including its
> null-case note*, where the re-run patch severs only the VALUE. A differently-shaped patch,
> not different behaviour — the load-bearing failure (*"a refused unit must never become a
> computable value: expected 1 to be null"*) reproduces identically.
> **Transcript: `07-reverification-final-state-2026-09-01.txt`. Read it, not this section's
> counts.**
>
> ⛔ **One methodological trap caught in the same pass, worth carrying to other lanes:**
> `npx vitest run <file> --reporter=basic` **exits RC=0 while running nothing** on vitest 4
> (*"Failed to load custom Reporter from basic"*) — a green RC from an invocation that never
> loaded a test. Plain `vitest run` only.

---

## 7. The 20-parcel baseline rows 17 and 18 — resolved END-TO-END LIVE

Both LT baseline parcels resolved against the real services on 2026-09-01, driving the real
`resolveLtParcelChain` (transcript `01-live-chain-both-parcels.txt`; the fixtures the test
replays are the bodies recorded during that run).

| step | row 17 — `0101/0054:0328` | row 18 — `0101/0054:0345` | baseline expectation | verdict |
|---|---|---|---|---|
| **P** parcel | DIRECT — `unikalus_nr` 440055970193, 0.1544 ha → 1544 m², 18-pt ring, EPSG:3346 | DIRECT — 440063553760, 0.0775 ha → 775 m², 8-pt ring | DIRECT | **met** |
| **C** contextual | building count 0 (served); heritage overlap **100 %** with "Vilniaus senamiestis / …Naujamiesčiu" | same, 100 % | DIRECT (existence) | **met**; no buildings arm (§1) |
| **S** source | DIRECT — ASGR answered, 3 polygons | DIRECT — 1 polygon | DIRECT | **met** |
| **PL** plan | DIRECT — TPD 123025 (K_D, "Registruotas", approved 2021-12-17, in force 2021-12-21) **and** 203143899 (B_SAV, approved 2021-06-02) both minted | DIRECT — 203143899 minted | DIRECT (TPD_URL → doc card) | **met**, and better: two plans from one polygon |
| **R** rule | DIRECT where filled — `MAX_AUK_M 25` · `MAX_TANKIS 45` · `MIN_APZELD 15` on OBJECTID 97619; the other two polygons all-null → tier 6 | all-null → tier 6 throughout | DIRECT-where-filled / AI-else | **met** |
| **E** evidence | DIRECT — **per-value**: each classification rule carries its own `*TP/*NR/*D/*TPR` in `RuleProvenance`, and `source.document` is the TPD card URL | DIRECT | DIRECT (per-value) | **met** |
| **D** constraint | DIRECT + **REFUSED: MAX_INTENS** (tier 6, `valueBasis` UNRESOLVED, both numbers in the note) | DIRECT + REFUSED | DIRECT + REFUSED | **met** |
| **V** envelope | not attempted — depends on the unresolved intensity unit | same | DERIVED **after unit resolution only** | **correctly not produced** |
| **DP** potential | MISSING | MISSING | MISSING until then | **met** |

Test-wide rule 2 (*"any UNKNOWN must be visible as a tier-6 rule … a chain that silently drops
an unfilled attribute fails even if every number it did emit is right"*) is enforced by a test
asserting that **every** polygon emits **all eight** vocabulary parameters, filled or not.

---

## 8. Honest gaps / queued for later lanes (E4 control 10 — recorded, not acted on)

1. **The ASGR compilation methodology is unobtained** (403/404/no public copy). If VTPSI
   publishes it, re-open §3 — but note that (c) is a property of the DATA, so a methodology
   sentence alone would not lift the refusal.
2. **`MAX_INTENS` disambiguation by the coverage × storey ceiling** is feasible where storeys are
   served (`sprendiniai` layer 82 has `MAX_AUK_SK`). It is tier-3 deterministic inference plus
   business logic — a separate lane, and it would still leave ASGR itself (which serves no
   storeys) unresolved.
3. **`sprendiniai` (the per-TPD dispositions layer) is NOT wired.** It is richer than ASGR
   (`MIN_AUK_M`, `MAX_AUK_KA` height-to-eaves, `MAX_AB_ALT` absolute altitude, `MAX_AUK_SK` /
   `MIN_AUK_SK` storeys, `UZST_TIP` building types, `MAX_SKL_PL` / `MIN_SKL_PL` plot sizes,
   `APRASYM` free text) **and it carries `TPD_ID`, so its numerics ARE attributable to a
   document** — which would upgrade the numeric arm from `validityBasis:'ingestion'` to
   `'legal'`. Wiring it is a scope expansion this lane did not take. **Strongest single
   follow-up for LT.**
4. **The ASGR daily FGDB mirror** (`asgr.gdb.zip`, ~129 MB, registry row
   `lt-tpdr-asgr-bulk-fgdb`) is documented but not wired; the adapter is live-query only.
5. **The geoportal.lt licence text is still not read verbatim.** The attribution requirement is
   confirmed from the specification (*"Duomenys yra vieši. Naudojant būtina nurodyti
   savininką."*); absence of share-alike is still assumed. `verifiedDate` stays `null` on all LT
   rows, matching the sibling rows' honesty.
6. **Data-quality outliers recorded, not clipped**: 6 `MAX_AUK_M` rows above 200 m; 16
   `MAX_TANKIS` rows above 100 % (up to 2931); 2 below 0.
7. **`pask_tipas_pavad` / `sav_pavad` / `sen_pavad` came back null on both baseline parcels**
   while the identity, area and date columns were filled. Honest service-side nulls, carried as
   null — never back-filled from the cadastral number's municipality prefix.
8. **Kaunas geographic spread** (lane §LT-4's "re-run in Kaunas post-adapter") not done; services
   are national and the adapter is location-agnostic, but the spread run is still owed.
9. **No LT parcel provider registered** in `parcelProviders/registry.ts` — a routing decision
   outside this lane. The overlap audit is done and recorded.

## 9. Cross-lane corrections raised (NOT applied — shared files)

Full text in `barrel-additions-lt.txt` §3:
* **`packages/schemas/src/siteintel/vocabularies/lt.ts`** — `ltAsgrProvenanceColumns()` returns
  non-existent column names on two axes (§2).
* **`packages/site-parcel-data/src/sourceRegistry/lt.ts`** — the ASGR row's `dataset` string
  repeats the same wrong claim and asserts a `PILN` flag that is nationally empty; replacement
  text and a re-measured probe-log entry are supplied.
* **`lanes/netherlands-poland-lithuania-estonia.md` §LT-1** — same correction at the source.
