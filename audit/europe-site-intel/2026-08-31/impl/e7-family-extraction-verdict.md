# E7-FAMILY — THE ADAPTER-FAMILY EXTRACTION VERDICT

> Lane E7-FAMILY · 2026-09-01 · subject: `packages/site-parcel-data/src/countryAdapters/{ee,dk,lt,pl}/`
> at HEAD `de23a59f` (all 27 adapter files tracked and clean; `git status --porcelain
> packages/site-parcel-data/` empty before and after this lane).
> Authority: `audit/europe-site-intel/2026-08-31/E4-EXECUTION-CONTROL.md` controls 2, 3, 5, 8, 9, 10.
> Transcripts: `impl/lane-e7-family-transcripts/` (5 files, all executed in foreground this session).

---

## §0 — THE VERDICT

**REFUSED. Extract nothing into `countryAdapters/`. The four country lanes behind this one build
four honest siblings under the conventions in §6.**

Not because the four adapters share nothing — they share a measurable spine. **Because every part
of that spine already has an authority OUTSIDE `countryAdapters/`, and three of those four
authorities are files this wave may not touch.** A `countryAdapters/_shared/` module would not be
the family's first parent; it would be the *fourth* home for concepts that already have three, and
it would be misplaced on the day it was minted. Four honest siblings plus a written convention is
cheaper than a parent that is known-wrong at birth.

The hypothesis under test was the E5 sweep's *"SE, FI, NO, LU, LV, SI form a structured-plan adapter
family."* That is a claim about six **data channels**. Measured against our **code**, it does not
hold: the four committed adapters converge on **transport** and diverge on **everything the wave
exists to get right** — the R1/R2/R3/R5 seats, the UNKNOWN rule, the vocabulary shape, the chain
entry type. **32.4% of the four adapters (2,422 of 7,482 lines) is rule-mapper, and the rule-mapper
spine is a `SiteIntelRuleSchema.parse()` call — i.e. the frozen L0 schema's own shape, already the
single authority.** Re-spelling it adapter-side is the rival, not the fix.

**The most valuable output of this lane is therefore the refusal itself, plus three defects the
measurement exposed** — one of them proven by execution (§4), and one of them a live instance of the
exact review rule this lane was told to enforce (§7 · L-12874).

---

## §1 — WHAT WAS MEASURED, AND HOW

Every file of all four adapters was read in full. The brief named nine axes; all nine were measured
mechanically (not read impressionistically), and the raw greps are transcript 05.

| Method | Where |
|---|---|
| Line census per file and per directory | 05 §1 |
| Literal `grep -c` of every shared refusal string across the four clients | 05 §2 |
| Comment-stripped, whitespace-normalised, country-token-folded **diff** of the four fetch-classify functions, then the exact 4-way identical line set | 05 §3 |
| `diff` of the two OWS exception extractors modulo name | 05 §4 |
| `diff` of the three jurisdiction modules modulo country name + the four bbox numbers | 05 §5 |
| Copy census of `ISO_DATE_RE`, `ringPolygon`, and the eleven `str`/`num` readers, with a behaviour classification of each | 05 §6–7 |
| Refusal-token grep across `src/` | 05 §8 |
| `nowIso` derivation grep + an **executed** probe (§4) | 05 §9, transcript 02 |
| Per-seat occurrence count of `valueBasis` / `normativeForce` / `validityBasis` / `rank` in the four mappers | 05 §10 |
| Existing-solver greps (`countryBbox`, `retryWhileUnreachable`, `TRANSIENT_FETCH_REASONS`) | 05 §5, §11, §12 |

**Baseline** (transcript 01, foreground, RC=0): `npx vitest run` over the five suites that touch the
adapters — `eeAdapterRework` · `dkCorrections` · `ltAsgrAdapter` · `plAdapter` · `sourceRegistry` →
**5 files, 122 tests, all passing.** Root `tsc --noEmit -p tsconfig.json` → **RC=0** (transcript 03);
package `tsc -p tsconfig.json --noEmit` → **RC=0** (transcript 04).

**mtime check, per the standing rule.** `lt/ltRuleMapper.ts` and `pl/plRuleMapper.ts` carry mtime
`2026-09-01 17:50` — *after* the sibling lanes' own transcripts were written and roughly thirty
minutes into this session. Nothing inherited was trusted: the baseline above was re-executed against
the tree as it stands, not read out of `lane-e6-lt-adapter.md` or `lane-e6-pl-adapter.md`.

---

## §2 — THE MEASUREMENT TABLE

Read the **right-hand column** first. It is the one that decides.

### 2.1 · Source-row shape — **CONVERGENT, and the authority is already `sourceRegistry/`**

| | EE | DK | LT | PL |
|---|---|---|---|---|
| File | `eeSources.ts` (115) | `dkSources.ts` (90) | `ltSourceRefs.ts` (119) | `plSources.ts` (162) |
| Rows minted **in the adapter** | 4 (all of them) | **0** | 1 (`ribos`) | 1 (APP GML) |
| Rows resolved from `sourceRegistry/` | 0 | 2 | 3 (`LT_SOURCES`) | 3 (`PL_SOURCES`) |
| Validated at module load | `SiteIntelSourceSchema.parse` | via the registry | `defineSources('LT', …)` | `SiteIntelSourceSchema.parse` |
| Anti-drift guard | none | `assertEndpoint()` — throws naming both strings | endpoint-binding table | `registryIds.has(...)` + duplicate-id scan |

**Verdict: no extraction needed and none possible.** `sourceRegistry/defineSources.ts` is already the
generalisation — its own header says so verbatim: *"the EE_SOURCES exemplar generalised."* EE is the
**only** adapter still minting its own rows, and that is because it predates the registry (LT's file
says exactly this in its header). The convergence is *toward an existing authority*, which is the
system working. **The one real asymmetry is that DK's `assertEndpoint` drift guard is the strongest
of the four and is copied by nobody** — §6.C makes it a convention.

### 2.2 · Fetch / `FetchOutcome` usage — **CONVERGENT ON 19 LINES, DIVERGENT ON EVERYTHING AFTER `res.ok`**

| | EE `eeWfsGetFeatures` | DK `dkGetJson` | LT `ltArcgisQuery` | PL `plUldkGet` |
|---|---|---|---|---|
| Verb | GET | GET + `Accept` header | **POST** form-encoded + `AbortSignal.timeout` | GET |
| Normalised length | 65 | 48 | 85 | 60 |
| Transport prelude | **identical** | **identical** | **identical** | **identical** |
| 200-with-error probe | `ows:ExceptionReport` | `ows:ExceptionReport` | ArcGIS `{"error":{…}}` | **none — status is the first token of a `text/plain` body** |
| Body form | JSON `features[]` | raw JSON (caller shapes it) | JSON `features[].attributes` | pipe-delimited lines |
| Where `absent` is decided | here, on zero features | **one level up**, after a 2-pass axis hedge | here, on zero features | here, on `-1 brak wyników` |

**4-way identical lines: 19.** Pairwise: EE↔LT 42, DK↔EE 38, LT↔PL 32, EE↔PL 31, DK↔PL 29, DK↔LT 28.

**Verdict: this is the strongest shared thing in the four adapters, and it is still only ~19 lines
per copy (76 total, 1.0% of 7,482).** And it is genuinely *transport* — resolve `fetchImpl`, catch
the network throw, read the body, check `res.ok`. Everything a country actually knows sits *after*
that line: PL classifies from the **body**, not the status; DK hedges the bbox axis and needs two
round-trips before it may say `absent`; LT must inspect a 200 for an `error` payload; EE must inspect
a 200 for an `ows:ExceptionReport`. **A shared prelude would be correct and would save 57 lines. It
would also put the refusal vocabulary in the wrong building — see §3.**

### 2.3 · Client shape — **FOUR DIALECTS, FOUR MEASURED TRAPS, NO SHARED SURFACE**

| | EE | DK | LT | PL |
|---|---|---|---|---|
| Protocol | WFS 2.0 (GeoServer **and** MapServer — two stacks) | WFS 2.0 (GeoServer) + DAWA REST | ArcGIS REST 11.1 | bespoke `text/plain` locator |
| Native CRS | EPSG:3301 | EPSG:4326 on the wire | EPSG:3346 (`latestWkid`, **not** 2600) | EPSG:2180 |
| The measured axis trap | CQL/GML `POINT(northing easting)`; `(E,N)` returns 0 **silently** | `lon,lat` answers; `lat,lon` returns 0 **silently** → 2-pass hedge | **none** — esri JSON is `[x,y]` both ways, and the file says *"do NOT copy the EE `n e` swap here"* | `xy=<LON>,<LAT>`; the swap is a point off Somalia and answers `-1 brak wyników` |
| Geometry column | three services, three names (`geom`, `shape`, `msGeometry`) | n/a | n/a | n/a |
| Exact-ring query | Filter-XML `Intersects` + CQL `INTERSECTS` | not offered | `esriGeometryPolygon` POST; **bbox deliberately not offered** | not offered |

**Verdict: extraction here would be actively harmful.** LT's own header already documents the one
attempt to reuse across dialects and why it was refused: *"do NOT copy the EE `n e` swap here; it
would silently query the wrong place."* Four axis conventions, four traps, each proven by a live
probe pair. **A shared query builder is a machine for reintroducing a silent-zero.**

### 2.4 · Rule-mapper spine — **THE DECISIVE ROW. 2,422 lines, and the "spine" is `SiteIntelRuleSchema`**

| | EE (559) | DK (382) | LT (768) | PL (713) |
|---|---|---|---|---|
| Vocabulary row shape | `{eeAttribute, parameter, unit, layers[]}` | `{dkAttribute, unit, layers[]}` — **no `parameter`**, the attribute name *is* the parameter | `{ltAttribute, parameter, unit, valueBasis}` | `{appElement, parameter, unit, statutoryBasis, …}` |
| Numeric UNKNOWN guard | `"" \| "0"` → UNKNOWN (PLANK serves strings) | `<= 0` or non-numeric → UNKNOWN | **per-field**: `MAX_AUK_M <= 0`; `MAX_TANKIS` outside `0<v<=100`; `MIN_APZELD` likewise **with a measured 1,802-row justification**; `MAX_INTENS` **always refused** | the parser hands `{kind:'unspecified'}`; no numeric guard here at all |
| Entity the rules cite | `SiteIntelPrescription` | `SiteIntelPlan` (always) | `SiteIntelZone` | `SiteIntelZone` |
| Referent ladder | 4-step, throws by name | **none** — no geometry in the hand-off | 3-step, throws by name | 4-step, throws by name |
| `buildRule` arg count | 15 | 6 (closes over layer/validity/force) | 17 | 8 |

**Verdict: REFUSE, unambiguously.** The four `buildRule`s look alike because they all end in
`SiteIntelRuleSchema.parse({ id, body, applicability{…}, provenance{…} })` — that object literal *is*
the frozen L0 schema's shape, and the schema is already the single authority for it. A shared
`buildRule` would be a second, adapter-side spelling of a **frozen** schema (control 3), taking the
**union** of four countries' argument needs — 15 ∪ 6 ∪ 17 ∪ 8 — which country five widens again.
That is the parent minted once and fought forever.

### 2.5 · The R1/R2/R3/R5 seats — **THE SEATS ARE SHARED; NOTHING THAT FILLS THEM IS**

| Seat | EE | DK | LT | PL |
|---|---|---|---|---|
| **R1 `rank`** | `null` — "PLANK serves no rank axis" | **`{scheme:'dk-plan-ladder', level:1–4}`** — the only adapter that emits one | `null` — "ASGR is *already* the consolidation; the state applied precedence before we saw it" | `null` — "APP serves no per-rule rank axis" |
| **R1 `useScope`** | **per-use-slot verbatim tokens**, slot-aligned with `otstarve` | `[]` | `[]` | `[]` — "a POG ceiling binds the whole strefa" |
| **R2 `valueBasis`** | **0 occurrences — emitted nowhere** | 9 — `{dk-bygberegnaf, 1\|2\|3\|4}`, a **closed state codelist**; a fifth value **throws** | 20 — a **column of the vocabulary table**; 4 schemes incl. the `UNRESOLVED-RATIO-OR-PERCENT` refusal | 4 — `{pl-upzp-2003, <statutory article>}` on **every** rule |
| **R3 `validityBasis`** | `legal` iff `kehtestkp` well-formed, else `ingestion` | `inForceFrom ?? adoptedDate ?? ingestion` | **split by rule KIND**: classification `legal`, numeric `ingestion` — because ASGR serves provenance for one and not the other | `legal` **only** with act status `legalForce` **and** a date; also carries `valid_to` **and** a refusal note |
| **R5 `normativeForce`** | **0 — emitted nowhere** | served `bygvejledende` flag on byggefelt only | a **constant**, `'rekomendacinio pobūdžio'` | `plCodeTail(charakterUstalenia)` — a per-object INSPIRE codelist tail |

**Verdict: this table is the refusal.** Four adapters, four seats, and **no two adapters fill any
seat the same way**. Two of them (EE) are empty. One R3 is split by rule kind. R2 is variously
absent, a closed codelist with a throw, a vocabulary column, and a statutory article. This is exactly
control 5 working as designed — *"country-specific semantics remain in adapters"* — and it is the
strongest possible evidence that the seats do **not** want a shared filler. **A generic
`applySeats()` helper would have to accept all five mechanisms, i.e. it would accept anything, i.e.
it would assert nothing.**

### 2.6 · Chain resolver — **SIMILAR IN SHAPE, INCOMPATIBLE IN SIGNATURE**

| | EE | DK | LT | PL |
|---|---|---|---|---|
| Entry | `resolveEeParcelChain(tunnus)` | `resolveDkParcelChain(lat, lon)` | `resolveLtParcelChain(kadastroNr)` | `resolvePlParcelChain(parcelId)` |
| Parcel leg failing | **fails the whole chain** | carried as its own outcome; chain still `found` | **fails the whole chain** | carried per leg with a **grade** |
| Register-row cache | `Map<sysid, FetchOutcome>` | none | `Map<TPD_ID, FetchOutcome>` | none |
| Mapper-throw handling | catch → transient | catch → transient | catch → transient | catch → transient |
| Refusal token | `mapper-refused:` | **`mapper-refusal:`** | `mapper-refused:` | `mapper-refused:` |
| `fetchedAtIso` | `(nowIso ?? …).slice(0,10)` | **`nowIso ?? (….slice(0,10))`** | `(nowIso ?? …).slice(0,10)` | `(nowIso ?? …).slice(0,10)` |

**Verdict: no shared signature exists.** One takes a point, three take three different national
identifiers. Two hard-fail on the parcel leg and two do not — and both behaviours are *correct* for
their country (DK's plan layers answer at a point without a parcel; EE's plan query needs the parcel
**ring**). **The two bold cells are real defects the comparison exposed — §4 and §7.**

### 2.7 · Tier-6 UNKNOWN emission — **THE ONE GENUINELY SHARED DOCTRINE, AND IT IS ALREADY WRITTEN DOWN**

All four emit UNKNOWN as a **visible tier-6 rule with `value: null`**, never a dropped row, never `0`,
never "no limit". All four say so in their headers in near-identical words. **But the doctrine is
control 9, and the enforcement is the frozen L0 tier-projection guard in
`packages/schemas/src/siteintel/provenance.ts` — which already rejects `tier 1 + in-document-text` at
parse.** The shared thing is a *rule*, already enforced by a *schema*. What differs is the guard that
decides *when* a value is unknown, and that guard is national measurement (§2.4 row 2) — EE's `"0"`
rule rests on one live pull, LT's `MIN_APZELD` rule rests on a 1,802-row national count.

### 2.8 · Test shape — **STRONGLY CONVERGENT, AND THE ONE REAL GAP IS A MISSING CONTROL**

| | EE (304 / 13 tests) | DK (687 / 33) | LT (536 / 26) | PL (571 / 44) |
|---|---|---|---|---|
| Fixtures | recorded live bodies, replayed via `deps.fetchImpl` | verbatim live-probed features | recorded live, keyed `<url>\|<form body>`; **an unrouted request fails BY NAME** | the state's own bytes, **sha256-pinned** |
| Proven at | the **chain** layer ("committed ≠ reachable") | mapper + consumer + chain | the **chain** layer | parser + mapper + chain |
| Falsification target named in header | yes | yes | yes | yes |
| **Scramble control** | **no** | **no** | **no** | **yes** (`plAdapter.test.ts:561`) |

**Verdict: this is a CONVENTION, not a module.** There is nothing to extract from a test-authoring
discipline — but there is something to *write down*, because **only one of four suites carries the
scramble control** the `corpus-never-jittered` doctrine requires. §6.G makes it mandatory.

---

## §3 — THE DECIDING FINDING: EVERY SHARED PIECE ALREADY HAS A HOME, AND IT IS NOT `countryAdapters/`

The brief said: *grep first; if something already generalises this, adopt it.* It does. **Four times.**

| Candidate for `_shared/` | Copies | The authority that ALREADY exists | May this wave edit it? |
|---|---|---|---|
| `interface Bbox` + `isInX` | **3** (EE, LT, PL) | `parcelProviders/countryBbox.ts:23–33` — declares `CountryBbox` field-for-field and `within(bbox, lat, lon)` byte-identically; imported by `parcelProviders/registry.ts`, `rulepacks/registry.ts` and the package barrel | **NO** — shared file, barrel protocol |
| The refusal reason tokens (`endpoint-unreachable`, `upstream-failed`, `no-feature`, …) | **4** | `packages/schemas/src/site/zoning/FetchOutcome.ts:74` — `TRANSIENT_FETCH_REASONS`, a **closed table** whose own doctrine reads *"Add a new transient token HERE, once, rather than at a call site"* | **NO** — `packages/schemas/**` is FROZEN (control 3) |
| `ISO_DATE_RE` | **3** | `packages/schemas/src/siteintel/provenance.ts:34` — `IsoDateStringSchema`, the same regex, exported, and **the very schema those three adapters validate against three lines later** | **NO** — frozen |
| The bounded transient retry | 0 wired | `src/net/retryWhileUnreachable.ts` — already generalised over `FetchOutcome`, already tested; **zero consumers inside `countryAdapters/`** | shared file |
| A protocol transport seam | **4** | `providers/containers/{arcgisRest,wmsGetFeatureInfo,sipuShapefile}.ts` — the repo's established "reusable seam adjacent to callers" idiom | **NO** — shared, and it is the `{ok:false, detail}` idiom LT already logged as needing reconciliation |

**Read the fourth column.** Three of the five authorities are files this lane is forbidden to edit,
and two of those three are forbidden by **control 3, the canonical-model freeze**. So minting
`countryAdapters/_shared/` would not consolidate anything. It would create a **fifth** location for
concepts that already have four, sited at the wrong altitude, guaranteed to move the moment the
freeze lifts — and in the meantime it would be the very thing the standing review rule forbids:
*"a rival source registry, a rival FetchOutcome, or its own refusal vocabulary."*

**⭐ The bbox row is the most damning, because the repo has already made this mistake twice and
written the fix down both times.** `agenziaEntrateParcelProvider.ts:595` and `dgtParcelProvider.ts:67`
each carry a standing note reading *"relocate ITALY_BBOX/isInItaly into countryBbox.ts for parity"* /
*"…isInPortugal into countryBbox.ts…"*. EE, LT and PL are recurrences **three, four and five** of a
drift with a **known, named, single correct destination**. Extracting them into
`countryAdapters/_shared/bbox.ts` would be recurrence six wearing a hat.

---

## §4 — THE EXECUTED FALSIFICATION: THE COMPARISON FOUND A REAL BUG

The brief demands falsification per deliverable. The deliverable here is a refusal, so the
falsification is the inverse: **if the four adapters really are four honest siblings rather than one
family, the comparison should surface divergences that no shared parent is preventing.** It did — and
one of them is not cosmetic.

**Claim.** `resolveDkParcelChain(lat, lon, deps, nowIso)` and `resolveEeParcelChain(tunnus, deps,
nowIso)` interpret the **same-named parameter** differently, and the difference is load-bearing.

```
dk/index.ts:105        const fetchedAtIso = nowIso ?? new Date().toISOString().slice(0, 10);
ee/index.ts:157        const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);
```

`.slice(0,10)` binds to `new Date().toISOString()` in DK and to the whole `??` expression in EE/LT/PL.
A caller-supplied `nowIso` is therefore **sliced in three adapters and passed through raw in DK**.

**Executed** (transient probe `__tests__/e7FamilyProbe.test.ts`, run in foreground, **deleted after
the run**; transcript 02 verbatim):

```
✓ DK form keeps the caller timestamp; EE/LT/PL form slices it to a calendar date       3ms
✓ and the difference is LOAD-BEARING: the DK form fails SiteIntelRuleSchema by name    7ms
  Test Files  1 passed (1)      Tests  2 passed (2)

PROBE-A-THROW: [ { "origin": "string", "code": "invalid_format", "format": "regex",
                   "pattern": "/^\\d{4}-\\d{2}-\\d{2}$/",
                   "path": [ "provenance", "valid_from" ],
                   "message": "expected an ISO calendar date (YYYY-MM-DD)" } ]
```

**Consequence, traced.** `nowIso = '2026-09-01T12:34:56.000Z'` — the natural reading of a parameter
called `nowIso`, and exactly what `new Date().toISOString()` returns:

* EE / LT / PL → `provenance.valid_from = '2026-09-01'`, chain resolves.
* DK → `SiteIntelRuleSchema.parse` throws on `valid_from` → `resolveDkParcelChain` catches it
  (`dk/index.ts:132`) → **all four ladder rungs degrade to `transient`** and Denmark reports
  "the source did not answer" for a parcel where every source answered perfectly.

It is latent today only because the committed DK suite passes an already-sliced date. **A shared
`fetchedAtIso` helper would have made this unrepresentable. That is the single strongest argument
*for* extraction found in this lane — and §3 is why the helper still must not live in
`countryAdapters/_shared/`: the correct seat is beside `IsoDateStringSchema`, which is frozen.** It is
therefore reported as a defect (§7 · L-12873) and fixed **in DK's own file** by the DK owner, in one
line, not by minting a parent.

**Restore verified.** `git status --porcelain packages/site-parcel-data/` → **empty**. Baseline
re-runnable; root `tsc` RC=0; package `tsc` RC=0. No adapter byte was changed by this lane.

---

## §5 — THE THREE WAYS A `_shared/` PARENT WOULD GO WRONG (stated so a later lane can check them)

1. **It would be a union type that grows with every country.** `buildRule` takes 15 / 6 / 17 / 8
   arguments today. Sweden, Finland, Norway, Luxembourg, Latvia and Slovenia each add at least one
   seat mechanism nobody has yet (LU's *plan d'aménagement général* carries a two-level rank; SI's
   *OPN/OPPN* carries a municipal-vs-state normative force). A parameter bag that accepts all of them
   accepts anything, and a builder that asserts nothing is worse than four `parse()` calls that each
   assert their own country's shape.
2. **It would relocate a FROZEN vocabulary into an unfrozen directory.** The refusal tokens and the
   ISO-date regex are L0 exports today. Re-homing them adapter-side during the freeze creates a
   second definition that must be un-created later — and until then, a reader has two places to look
   and no rule for which wins. That is the C84 EI-9 failure verbatim.
3. **It would give a false sense that the seats are handled.** The genuine risk in this wave is not
   duplicated `fetch` plumbing; it is a country adapter that fills R2 with a plausible-looking
   denominator it did not measure. **A shared helper makes that *easier*, not harder** — it supplies
   a default-shaped `valueBasis` where today each adapter must justify its own. EE's honest **zero**
   R2 occurrences is the model: the seat is empty because PLANK serves nothing to put in it. A parent
   with a convenient default would have filled it.

**The counter-case, stated fairly.** ~19 lines × 4 of transport prelude, 3 bbox predicates, 3
`ISO_DATE_RE`, 2 `ringPolygon`, 2 OWS extractors and 11 `str`/`num` readers **are** real duplication —
roughly **190–250 lines, ~2.5–3.3% of 7,482**. If §3's authorities were editable this wave, adopting
them would be correct and this verdict would read the other way. They are not. The duplication is
therefore **recorded, sized and routed** (§7) rather than re-homed.

---

## §6 — THE CONVENTIONS (BINDING ON THE FOUR COUNTRY LANES BEHIND THIS ONE)

Follow these and four independent adapters stay consistent **without being coupled**. Each convention
names the file to copy from — copy the *shape*, never `import` across country directories.

**A · FILE LAYOUT.** One directory `countryAdapters/<cc>/`, lower-case ISO-3166-1 alpha-2. Files, in
this order and with these roles:

| File | Role | Copy the shape from |
|---|---|---|
| `<cc>Jurisdiction.ts` | `interface Bbox` + `<COUNTRY>_BBOX` + `isIn<Country>(lat, lon)`. **Pure, never throws.** Header MUST carry a dated overlap audit against every registered box. | `ee/eeJurisdiction.ts` |
| `<cc><Dialect>Client.ts` | the **ONE** impure seam. Endpoints, measured quirks, `FetchOutcome`-classified fetch, pure URL/param builders. **Knows nothing about rules.** | `ee/eeWfsClient.ts` (OGC) or `lt/ltArcgisClient.ts` (esri) |
| `<cc>ParcelProvider.ts` | `parse<Cc>ParcelFeature` (pure) + `resolve<Cc>ParcelBy<NationalId>` + `resolve<Cc>ParcelAtWgs84Point`, both → `Promise<FetchOutcome<<Cc>CadastralParcel>>` | `ee/eeParcelProvider.ts`, `lt/ltParcelProvider.ts` |
| `<cc>PlanProvider.ts` | plan/zone geometry + the register join | `ee/eePlanProvider.ts`, `lt/ltAsgrProvider.ts` |
| `<cc>RuleMapper.ts` | **PURE, TOTAL, DETERMINISTIC.** No fetch, no clock — the caller passes `fetchedAtIso`. | `ee/eeRuleMapper.ts` |
| `<cc>Sources.ts` / `<cc>SourceRefs.ts` | resolves rows out of `sourceRegistry/<cc>.ts`; mints **only** rows the registry lacks, via `defineSources` | `lt/ltSourceRefs.ts` (the correct modern shape) |
| `index.ts` | the ladder as data, the chain resolver, the `<cc>CountryAdapter` value, the explicit re-export list | `ee/index.ts` |

**B · NEVER MINT A RIVAL.** Import `fetchFound` / `fetchAbsent` / `fetchTransient` / `FetchOutcome`
from `@pryzm/schemas`. Do **not** define a `{ok:false, detail}` result. Do **not** add a second retry
ladder — `src/net/retryWhileUnreachable.ts` exists, is `FetchOutcome`-typed and is tested; if you need
retry, **adopt it and say so**, and if you deliberately do not, say *that* (LT's header is the model).

**C · SOURCE ROWS RESOLVE, THEY DO NOT DUPLICATE.** Read `sourceRegistry/<cc>.ts`. Mint only what it
lacks, through `defineSources` so it gets identical build-time validation. **Copy DK's
`assertEndpoint()` drift guard** (`dk/dkSources.ts:60`) — a comment claiming the client and the
registry pin the same endpoint is exactly the class of claim that rots; make it a module-load throw
naming **both** strings. Queue the migration line in `impl/barrel-additions-<cc>.txt`; never edit
`sourceRegistry/*`, `src/index.ts` or `parcelProviders/registry.ts`.

**D · DO NOT REGISTER A PARCEL PROVIDER.** L-12871 is OPEN; three country bboxes already overlap.
Write the registration line into your barrel-additions file with the overlap audit that justifies it,
and stop there.

**E · THE REQUIRED SEATS — fill them, or state in the rule's own note why they are empty.**

| Seat | Rule |
|---|---|
| **R1 `basis`** | Every `basis` ref MUST resolve to an entity **returned in the same result**. Implement the referent ladder explicitly: *(1)* plan + geometry → mint the geometry-bearing entity, cite it; *(2)* plan only → cite the Plan; *(3)* geometry only → carry it **inline**, cite nothing; *(4)* neither → **throw BY NAME**. Never a dangling string. |
| **R1 `rank`** | Emit `{scheme:'<cc>-…', level}` **only** where the state serves an instrument ladder per feature (DK is the only current example). Otherwise `rank: null` **plus a comment saying which**: *no ladder exists*, or *the state already applied it* (LT), or *the ladder exists but is adapter DATA, not a per-rule fact* (EE, PL). These are three different facts; do not collapse them. |
| **R1 `useScope`** | Verbatim national use tokens where a value is use-conditioned (EE's per-slot model). Never a positional id suffix, never prose-only. |
| **R2 `valueBasis`** | **MANDATORY on every percentage, ratio or area value.** Carry the SERVED denominator code verbatim as `{scheme, code}`. If the source does **not** serve it, emit **no** `valueBasis` and make the rule's note say the denominator is UNKNOWN and a consumer must refuse a per-parcel multiply (DK's `basisNote`). ⛔ **Never infer a denominator.** Where the code is a closed state codelist, a value outside it is a national schema change and MUST **throw**, never be absorbed. Emit the qualifier even on a **tier-6 UNKNOWN** row — it is a served fact about the rule (DK measured 261 such rows nationally). |
| **R3 `validityBasis`** | `'legal'` requires **positive evidence of legal force** — an approval/in-force date the register serves *for that value*. Everything else is `'ingestion'` + the fetch date. If one field family carries provenance and another does not, **split by field family** (LT). ⛔ Never name one of a feature's cited documents as the source of a number the register did not attribute to it. |
| **R5 `normativeForce`** | Mirror the state's own word VERBATIM — never translate, never reduce to a boolean. A whole-dataset qualifier may be a constant (LT); a per-feature flag rides the feature (DK, PL). Empty is fine when nothing is served (EE) — **say so**. |
| **UNKNOWN (control 9)** | UNKNOWN ≠ 0 ≠ unlimited ≠ no-restriction. Emit tier-6 rows with `value: null`, **never drop the row**. Key the emission off the **DECLARED** layer vocabulary, not the served bag, so a server that omits null keys cannot silently delete a parameter. **Justify each guard with a measurement, in the note** — LT's `MIN_APZELD` is the standard: a minimum of zero is *semantically coherent*, so it was counted (1,802 rows, 74.5% co-occurring with an unfilled height) rather than assumed. |

**F · NAMING (so four siblings read as one system).**

* `<COUNTRY>_BBOX` · `isIn<Country>` · `<CC>_NATIVE_CRS` · `<CC>_RULE_AUTHORITY` · `<CC>_RULE_VOCABULARY` · `<CC>_APPLICABILITY_LADDER` · `<cc>CountryAdapter`.
* Entity ids: `<cc>-plan-<nationalId>` · `<cc>-zone-<id>` · `<cc>-prescription-<layer>-<id>` · `<cc>-document-<id>`, each minted by **one** exported `<cc>XEntityId()` function so no two call sites spell an id differently.
* **Refusal reason prefixes are the L0 vocabulary — use these exact spellings, add none:**
  `endpoint-unreachable:` · `upstream-failed:` (both transient, both in `TRANSIENT_FETCH_REASONS`) ·
  `no-feature:` / `no-parcel:` (absent). ⛔ **`mapper-refused:` — with a `d`.** DK currently writes
  `mapper-refusal:` and is the odd one out (L-12874). Do not propagate the second spelling, and do
  not invent a third token; if you need a new transient class, write it into
  `impl/barrel-additions-<cc>.txt` for `TRANSIENT_FETCH_REASONS` and use `upstream-failed:` meanwhile.
* **`fetchedAtIso` — write it exactly this way**, and nothing else:
  `const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);`
  The parenthesised form is the one three of four adapters use and the only one that survives a
  caller passing a full ISO timestamp (§4).
* Every `<cc>CountryAdapter` is `{ country, sources(), rules: {kind:'structured', fetchChain}, precedence }`. **DK is currently missing its adapter value entirely** (L-12875) — do not copy that gap.

**G · TESTS.**

1. Fixtures are the **state's own recorded bytes**, replayed through `deps.fetchImpl`, with the
   re-record path named in the header. sha256-pin any downloaded artifact (PL's model).
2. Prove at the **CHAIN layer**, not on a pure mapper return — *committed ≠ reachable*.
3. **An unrouted request must fail BY NAME**, never fall through to an empty answer (LT's fake keys
   on `<url>|<form body>`).
4. Name the **falsification target** for each deliverable in the file header, and execute it: sever
   the mechanism → a named test fails → restore byte-identical.
5. **A SCRAMBLE CONTROL IS MANDATORY** — perturb the fixture and assert the suite goes red. Only
   `plAdapter.test.ts:561` has one today; three of four suites cannot currently prove they are not
   passing on arbitrary input.
6. Assert every emitted rule is a valid `SiteIntelRule` value (EE's closing describe block).

**H · WHAT YOU MAY NOT DO.** Do not edit `src/index.ts`, `sourceRegistry/*`,
`parcelProviders/registry.ts`, `parcelProviders/countryBbox.ts`, `providers/containers/*`, or
anything under `packages/schemas/**` (control 3 — the canonical model is FROZEN). Anything you need
from those goes in `impl/barrel-additions-<cc>.txt` for the orchestrator, with the exact one-line
change written out. If a schema change is genuinely required, **REFUSE the parameter and report it**
(control 3, verbatim).

---

## §7 — DEFECTS THE MEASUREMENT EXPOSED (proposed issue-log rows; highest existing is L-12872)

**L-12873 — ⛔ OPEN (P2) · `resolveDkParcelChain` MIS-PARSES ITS OWN `nowIso` ARGUMENT, AND THE
CONSEQUENCE IS A FALSE "SOURCE DID NOT ANSWER" ACROSS ALL FOUR DANISH LADDER RUNGS.**
`dk/index.ts:105` reads `nowIso ?? new Date().toISOString().slice(0, 10)`; the three sibling adapters
read `(nowIso ?? new Date().toISOString()).slice(0, 10)`. In DK the `.slice` binds to the `new Date()`
branch only, so a caller-supplied full ISO timestamp — the natural reading of `nowIso`, and exactly
what `new Date().toISOString()` returns — reaches `provenance.valid_from` unsliced and fails
`IsoDateStringSchema`. **EXECUTED 2026-09-01** (transcript 02, 2/2 passing): the throw is
`invalid_format` at `path: ["provenance","valid_from"]`; `dk/index.ts:132` converts it to
`mapper-refusal:` on **every** rung, so Denmark reports a transport failure for a parcel where every
source answered. Latent only because the committed DK suite passes an already-sliced date.
**Disposition: FIX — one line in `dk/index.ts:105`, plus a test passing a full ISO timestamp.**
**Acceptance:** `resolveDkParcelChain(lat, lon, deps, '2026-09-01T12:34:56.000Z')` returns the same
rules as `'2026-09-01'`.

**L-12874 — ⚠ OPEN (P3) · TWO SPELLINGS OF ONE REFUSAL TOKEN SHIPPED IN ONE WAVE, AND NEITHER IS IN
THE L0 TABLE THAT EXISTS TO PREVENT EXACTLY THIS.** `dk/index.ts:132` emits `mapper-refusal:`;
`ee/index.ts:212`, `ee/index.ts:238`, `lt/index.ts:221` and `pl/plPogChain.ts:259` emit
`mapper-refused:`. A consumer matching the prefix catches three adapters of four. Neither token is in
`TRANSIENT_FETCH_REASONS` (`packages/schemas/src/site/zoning/FetchOutcome.ts:74`), whose own doctrine
reads *"Add a new transient token HERE, once, rather than at a call site."* **⭐ This is a live
instance of the standing review rule this lane was told to enforce — *"any lane that mints … its own
refusal vocabulary is rejected"* — and it happened four times in one wave, silently, because
`__tests__/fetchOutcomeHonesty.test.ts` does not scan `countryAdapters/**` at all** (grep for
`countryAdapters` in that file → 0 matches). **Disposition: (a) settle on `mapper-refused:`; (b) seed
it into `TRANSIENT_FETCH_REASONS` when the freeze lifts; (c) extend the honesty gate to scan
`countryAdapters/**` for `fetchTransient`/`fetchAbsent` prefixes not in the L0 table.** (c) is the
part that stops recurrence six. **Acceptance:** a gate reads every `fetchTransient(`/`fetchAbsent(`
literal in `countryAdapters/**`, splits the prefix at the first `:`, and fails on a token outside the
L0 table.

**L-12875 — ⚠ OPEN (P3) · THE DENMARK ADAPTER'S §J CONFORMANCE MAP DOCUMENTS A `sources()` LEG THE
FILE NEVER BUILDS — DK IS THE ONE ADAPTER OF FOUR WITH NO `dkCountryAdapter` VALUE.**
`grep -rn "CountryAdapter" packages/ apps/` → `eeCountryAdapter` (`ee/index.ts:259`),
`ltCountryAdapter` (`lt/index.ts:239`), `plCountryAdapter` (`pl/index.ts:45`), and **nothing for DK**.
⭐ **The sharp part is that `dk/index.ts:9` states the contract in prose —** *"sources() →
DK_ADAPTER_SOURCES (typed rows, dated probe logs — the KEYLESS re-pin)"* — **while the file contains
no `sources()` function and no adapter value at all.** `DK_ADAPTER_SOURCES` (`dk/dkSources.ts:87`) is
referenced by exactly three things repo-wide: its own definition, **that comment**, and the test. This
is *committed ≠ reachable* inside the file that declares the §J contract, and a consumer iterating
adapters gets EE/LT/PL and silently misses Denmark. **Related, same row:** three of four `index.ts`
files use an **explicit re-export list**; `dk/index.ts:37–41` uses five `export *` lines, so a sibling
lane adding a symbol to any DK file changes the DK public surface without touching `index.ts`.
**Disposition: WIRE — add `dkCountryAdapter` on the EE shape; convert `export *` to an explicit list.**
**Acceptance:** the DK suite asserts `dkCountryAdapter.country === 'DK'`,
`.rules.fetchChain === resolveDkParcelChain`, `.sources() === DK_ADAPTER_SOURCES`, as the EE and LT
suites already do for theirs.

**Recorded, NOT actioned (control 10 — no scope expansion):**

* `src/net/retryWhileUnreachable.ts` has **zero consumers** in `countryAdapters/` (2 files reference it
  repo-wide: its own definition and the barrel). It is already `FetchOutcome`-typed and tested. Every
  adapter wrote prose about retry instead of adopting it. Whoever owns the transient-retry policy
  should decide adopt-or-delete; four adapters should not each re-decide it.
* EE carries **three mutually-inconsistent `str`/`num` readers inside its own directory**:
  `eeParcelProvider.ts:71` returns the string **untrimmed** while `eePlanProvider.ts:107` and
  `eeBuildingsProvider.ts:65` trim; `eeParcelProvider.ts:74` refuses numeric strings while the other
  two accept them. A `tunnus` with stray whitespace yields a parcel id that does not equal its own
  trimmed spelling. Latent; EE's owner should reconcile within EE.
* `eeJurisdiction.ts`, `ltJurisdiction.ts` and `plJurisdiction.ts` duplicate
  `parcelProviders/countryBbox.ts`'s `CountryBbox` + `within()` byte-for-byte, making recurrences
  **three, four and five** of a drift already logged twice (`agenziaEntrateParcelProvider.ts:595`,
  `dgtParcelProvider.ts:67`). Correct destination is `countryBbox.ts` — a shared file. Queue it with
  L-12871's precedence work, since the same file is the router that resolves the overlap.

---

## §8 — WHAT THIS LANE CHANGED, AND WHAT IT WROTE

**Source changed: NOTHING.** `git status --porcelain packages/site-parcel-data/` is empty. No file
was extracted, moved, renamed or edited; no barrel line was added; no ceiling was raised; no gate was
disabled; no `gate-debt.json` entry exists. **No `impl/barrel-additions-*.txt` is filed by this lane**
— it proposes no code change of its own, and the three defects belong to the DK owner (L-12873,
L-12875), the vocabulary owner (L-12874) and the L-12871 precedence lane.

**Written:** this verdict, and `impl/lane-e7-family-transcripts/` (01 baseline · 02 the executed
`nowIso` probe · 03 root `tsc` · 04 package `tsc` · 05 the measurement greps).

**Nothing committed**, per the brief.

---

## §9 — FALSIFICATION RECORD

| Deliverable | Falsification | Result |
|---|---|---|
| The refusal (§0) | Its own inverse: if the four are siblings not a family, comparing them must surface divergences a parent would have prevented. | **Passed** — three found, one proven by execution (§4, L-12873). |
| The `nowIso` claim (§4) | Ran BOTH forms through `mapDkFeatureToRules` on a feature with no `datovedt`/`datoikraft`, so R3 falls to `ingestion` + the caller's date. | **Seen failing by name:** `invalid_format` at `["provenance","valid_from"]`, *"expected an ISO calendar date (YYYY-MM-DD)"*. The sibling form parsed clean at `valid_from: '2026-09-01'`. |
| Byte-identical restore | Probe file deleted; `git status --porcelain packages/site-parcel-data/` re-run. | **Empty.** |
| Baseline preserved | 5 suites / 122 tests before; nothing edited after. | **RC=0** (transcript 01). |
| Typecheck | package `tsc -p tsconfig.json --noEmit`; root `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`, `$?` read immediately, no pipe. | **RC=0 / RC=0** (transcripts 04, 03), zero `countryAdapters` diagnostics. |
| Inherited-artefact check | mtimes of all 27 adapter files compared against the sibling lanes' transcript times; `lt/ltRuleMapper.ts` and `pl/plRuleMapper.ts` are newer (17:50). | **Re-executed rather than trusted** — the baseline above ran against the tree as it stands. |

---

## §10 — THE ONE-SENTENCE HANDOFF

**There is no adapter family — there are four honest siblings and four pre-existing authorities they
should each be adopting; build the next four the same way, follow §6, and fix L-12873 before anyone
calls a chain resolver with a real timestamp.**
