# LANE E7-FI — FINLAND (Ryhti) · FINDINGS

**Date:** 2026-09-01 · **Scope:** probe what Ryhti serves TODAY for plan geometry and plan
provisions; build `countryAdapters/fi/` against what is actually there; check HSY reachability
without building a second path.
**Authority:** `E4-EXECUTION-CONTROL.md` (controls 2, 3, 5, 6, 8, 9, 10) ·
`impl/e7-family-extraction-verdict.md` §6 (the binding conventions) · C84 EI-9.
**Everything below is measured.** Commands + verbatim outputs: `impl/lane-e7-fi-transcripts/`.

---

## §0 — THE VERDICT IN FIVE SENTENCES

Ryhti's open channel is **LIVE, keyless, CC BY 4.0, national in intent — and it is an INDEX**.
It serves the plan's outer boundary, its identity, its type, its lifecycle status, its temporal
axes and its PDFs; it serves **zero building-right numbers**, and the state itself declares, on
99.94% of features, that only the *outline* was digitised. That answers a named, dated, unrun
question this repo has been carrying (`mmlParcelProvider.ts:631`, the "second-Denmark gate"):
**Outcome B — index-only.** Coverage is 39 of 308 municipalities (12.66%) and the delivery
obligation does not complete until 1.1.2029, so *absent* is the normal answer and it is not
*absent of regulation*. The adapter is built, proven end-to-end on real Finnish plans, and its
most important property is what it **refuses** to emit.

---

## §1 — WHAT THE SYSTEM SERVES TODAY (probed, not read off a page)

### 1.1 The open channel is four collections, and two of them are empty

`https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections` → **200,
17,024 bytes, keyless, 4 collections**:

| collection | title | features (2026-09-01) |
|---|---|---:|
| `pub_valid_ld_plan_ix_gs` | Asemakaavahakemisto (valid detail-plan index) | **5,635** |
| `pub_valid_lm_plan_ix_gs` | Yleiskaavahakemisto (valid master-plan index) | **647** |
| `pub_prep_ld_plan_ix_gs` | Valmisteilla olevat asemakaavat | **0** |
| `pub_prep_lm_plan_ix_gs` | Valmisteilla olevat yleiskaavat | **0** |

⭐ The two `prep` collections are **declared, served, and empty** — the brief's first kind of
nothing, at collection granularity.

### 1.2 There is NO hidden plan-object layer — the check was run and came back NEGATIVE

Per [[getcapabilities-is-not-an-inventory]] I checked WMS against WFS. WMS lists **8** `<Name>`
elements against WFS's 4, which looks exactly like a hidden-layer find. **It is not.** Dumping
the `<Capability>` tree shows the four extras (`pub_valid_ld_plan`, `pub_prep_ld_plan`,
`pub_valid_lm_plan`, `pub_prep_lm_plan`) sitting inside `<Style>` blocks titled "Ryhti plan".
They are **style names**. `grep -c "<Layer"` → 5 (one root + four). WMS and WFS expose the same
four index layers.

I also swept 17 candidate workspace names on the same host. Sixteen 404. One did not:

> ⭐ **DISCOVERY (recorded, NOT actioned — control 10): `ryhti_building` answers HTTP 200** with
> five collections — `avoimet_rakennukset` (Valmiit rakennukset), `avoimet_lupa_rakennukset`
> (Rakennushankkeet), `open_building`, `open_address`, `open_address_deleted`. The national
> BUILDING half of Ryhti is serving openly today. It is **not** in `sourceRegistry/fi.ts` and
> **not** in the E5 sweep, which recorded only that building data must be machine-readable from
> 1.1.2026. Wiring it is a buildings-lane job, not this lane's (control 2).

### 1.3 The plan index serves 33 fields, and none of them is a building right

Censused across **all 6,282 valid-plan features** (transcript 02 §1). The fields are: national
permanent id, plan key, producer id, plan type (codelist), lifecycle status (codelist), digital
origin (codelist), master-plan legal effect (codelist), municipality codes (current + original),
names and descriptions in six languages, five date axes, case identifiers, record numbers, and
`documents`.

Corpus-wide literal grep, all 6,282 features:

```
tehokkuusluku 0 · kerrosluku 0 · kayttotarkoitus 0 · rakennusoikeus 0 · kerrosala 0 · korkeus 0
```

### 1.4 ⭐ THE SECOND-DENMARK GATE IS ANSWERED — a named, unrun probe, executed

`packages/site-parcel-data/src/parcelProviders/mmlParcelProvider.ts:631-645` carries
`RYHTI_IX_PROBE_URL` and `RYHTI_ATTRIBUTE_FIELDS` with an honest header:

> *"The single rate-defining Finland unknown is whether the Ryhti national planning platform
> serves STRUCTURED numeric plan attributes (FAR / storeys) or only a plan index + PDF link.
> … ⚠ HONESTY: the constant below is the documented target, NOT a re-probed result. No RATE
> cell moves, and no Ryhti reader is wired, until this GET actually runs."*

**I ran that URL verbatim.** 33 properties returned; `tehokkuusluku` **NO**, `kerrosluku`
**NO**, `kayttotarkoitus` **NO**. That is the file's own **Outcome B — "index-only (Hamburg
B-Plan pattern) → the LEGISLATION gain reverts to the Phase-4 PDF pipeline."**

**Finland is not a second Denmark on the legislation axis today.** Do not re-open this from a
hopeful reading of "Ryhti is live": it is live, and it is an index.

### 1.5 ⭐ THE STATE DECLARES ITS OWN FILL STATE, PER FEATURE — and it says "outline only"

`digital_origin` carries `RY_DigitaalinenAlkupera`, whose code 04 is literally
**"Rajaus digitoitu" — the boundary is digitised**:

| code | meaning | detail | master | total | share |
|---|---|---:|---:|---:|---:|
| **04** | Rajaus digitoitu | 5,630 | 638 | **6,268** | 99.78% |
| **0401** | Rajaus useamman kunnan alueella | 1 | 9 | 10 | 0.16% |
| **01** | **Tietomallin mukaan laadittu** (data-model native) | **3** | **0** | **3** | **0.048%** |
| 02 | Kokonaan digitoitu | 1 | 0 | 1 | 0.016% |

**6,278 of 6,282 (99.94%)** say, in the register's own vocabulary, that only the outline exists.
Exactly **three** features nationally claim to be kaavatietomalli-native. This is what "Ryhti is
filling" looks like measured instead of asserted, and it is the reason no provision is available
as an attribute: **the state has not claimed to have digitised any.**

### 1.6 The provisions DO exist — as PDFs, keyless, with a typed attachment kind

7,294 attachments over 5,375 of 6,282 features (85.6%), **100% `application/pdf`**:

| kind | label | count |
|---|---|---:|
| 05 | **Kaavakartta ja kaavamääräykset** (map AND provisions) | 5,144 |
| 04 | **Kaavamääräykset** (provisions alone) | 1,394 |
| 06 | Kaavaselostus | 308 |
| 03 | Kaavakartta (map only) | 297 |
| 14 / 99 / 16 | OAS / Muu / Pöytäkirja | 139 / 11 / 1 |

**6,538 of 7,294 (89.6%) carry the kaavamääräykset.** Probed one end-to-end: the Kuopio
`AK-000480` attachment → **HTTP 200, 11,738,411 bytes, `application/pdf`, `%PDF-1.4`, keyless,
no redirect.** So the legal address of every Finnish plan provision is reachable today; only
the *values* need the gated tier-4→5 extraction pipeline.

---

## §2 — COVERAGE, AGAINST AN INDEPENDENT CENSUS

Independent source: **Tilastokeskus `kunta_1_20260101` "Kunnat 2026"** (status VALID) —
**308 municipalities**.

```
LD covered 36 · LM covered 36 · UNION 39  ->  39 / 308 = 12.66%
codes served that are NOT real kunnat: 0
```

The covered set is **Pohjois-Savo + Etelä-Savo** — exactly the two VOOKA conversion regions the
CKAN dataset text names — plus seven municipalities that delivered themselves (Jämsä, Akaa,
Hämeenkyrö, Orivesi, Muurame, Enontekiö, Pihtipudas) and three master-plan-only entries
(Helsinki, Espoo, Vaasa).

The register's own words on why (`ckan.ymparisto.fi`, fetched verbatim): the obligation covers
plans approved after **1.1.2024** with a **five-year transition**, so *"uudet kaavat
valtakunnallisesti kattavasti **1.1.2029 lähtien**"*; and before the transition ends the content
for valid plans *"voi olla **suppeampi**"*.

⛔ **So `absent` is the ordinary answer for 87% of Finland, and it is NOT "no plan applies."**
That caveat is carried in code as `FI_RYHTI_ABSENCE_CAVEAT` and rides every absent outcome.

---

## §3 — THE BRIEF'S CENTRAL DEMAND: TWO KINDS OF NOTHING, KEPT APART

The brief: *distinguish "the field exists and is empty for this zone" (tier-6 UNKNOWN, visible)
from "the system does not serve this field yet" (an absent capability, recorded in the source
row) — they are different facts and control 9 forbids collapsing them.*

Finland makes both cases real and the split is **structural in the adapter**, not a comment.

| | CASE 1 — declared but empty | CASE 2 — not served at all |
|---|---|---|
| example | `approval_date` null on **1,143** of 6,282; `documents` null on **907** | `tehokkuusluku`, `kerrosluku`, `kayttotarkoitus`, `rakennusoikeus`, `kerrosala`, `korkeus` |
| what it is | a per-FEATURE fact | a fact about the SOURCE |
| encoding | a **visible tier-6 rule**, `value: null`, never dropped | `FI_RYHTI_UNSERVED_PARAMETERS` on every result + the source row |
| why not the other | there IS a column and it is empty here | emitting a tier-6 `floorAreaRatio` would assert Ryhti HAS an FAR column — a false claim about the source, and it would make a missing CAPABILITY look like ordinary sparsity that more coverage would fix |

`fiRuleMapper.ts` therefore emits **no `floorAreaRatio`, no `maxHeight`, no `coveragePercent` —
not even at tier 6.** That restraint is the lane's main design decision and block 1 of the test
suite fails by name if anyone adds one.

### And the same rule applied in the OPPOSITE direction, deliberately

`period_of_validity_end` is null on **all 6,282** features. It would have been easy to emit a
tier-6 UNKNOWN for it. That would be **wrong**: these are the *valid* collections, filtered to
lifecycle `13 Voimassa`, so a plan with no end date is *currently in force* — the OpenFisca
`valid_to: null` semantic exactly. Converting a coherent positive fact into uncertainty is
control 9 running backwards. The adapter maps it to `inForceTo: null` and says why.

---

## §4 — ⭐ THE SENTINEL: `1900-01-01` IS A PLACEHOLDER, AND IT ATTACKS R3 DIRECTLY

The brief warned that *a system that is FILLING is the sentinel-zero risk in slow motion.* It
is, and the sentinel is a **date**.

```
time_of_initiation        5,986 / 6,282 = 95.3%   and the ONLY pre-1950 value in the field
date_of_validity          5,654 / 6,282 = 90.0%   next-earliest distinct: 1897, 1947
period_of_validity_begin  3,673 / 6,282 = 58.5%
approval_date               303 sentinel + 1,143 null
```

A spike, not a distribution. **THE DISPOSITIVE CONTROL: 4,240 features carry the
`date_of_validity` sentinel while ALSO carrying a real `approval_date`** — the same row knows a
genuine 2014 approval and still claims validity from 1 January 1900.

Measured, not assumed — the LT `MIN_APZELD` standard: a date of 1900-01-01 is *semantically
coherent*, so it was **counted** rather than guessed at.

### A second, independent arm: register CORRUPTION, which the sentinel guard would miss

```
AK-004907 "Kortteli 29 osa, Kirkonseutu" (Hämeenkyrö)  approval_date = "1068-06-28Z"
total pre-1800 values across 5 date fields x 6,282 features: 1
approval decades (sentinel excluded): 1940s 17 · 1950s 51 · 1960s 148 · 1970s 554 ·
                                      1980s 1,087 · 1990s 996 · 2000s 924 · 2010s 766 · 2020s 285
```

An eleventh-century approval date that **passes the ISO regex cleanly**. Almost certainly a
transposed 1968. A floor at `1800-01-01` rejects exactly **one corrupt value and zero genuine
ones** (the four real pre-1930 approvals all survive). Both arms yield UNKNOWN, never a dropped
row.

**Consequence for R3:** `validityBasis: 'legal'` requires POSITIVE evidence — a served,
plausible approval date. All six Jämsä plans in the fixture fall to `'ingestion'`; all three
Helsinki master plans earn `'legal'` with their real dates. Proven both ways in the suite.

---

## §5 — ⭐ THE LADDER EXISTS, NOBODY HAS APPLIED IT, AND FINLAND IS A FOURTH CASE

§6-E of the family verdict names three legitimate reasons for `rank: null`. **Finland is none of
them and must not be folded in.**

| country | why `rank` is null |
|---|---|
| EE, PL | the ladder exists but is adapter DATA, not a per-rule fact |
| LT | the state ALREADY APPLIED the ladder before serving (ASGR consolidation) |
| DK | *not* null — a real per-feature rung |
| **FI** | **the ladder exists in statute, the state has NOT applied it, the register serves no rung, and it publishes overlapping instruments it does not order** |

Measured over 29 deterministic sample points drawn from the corpus:

```
1 plan: 2 pts · 2 plans: 12 · 3 plans: 6 · 4 plans: 6 · 5 plans: 1 · 6 plans: 2
mean 2.93 · MORE THAN ONE PLAN AT 27 OF 29 POINTS (93.1%) · max 6
```

Every one carries lifecycle `13 Voimassa`. And the dates that might have ordered them are
themselves unreliable — `approval_date` is null or the sentinel on **1,446 of 6,282**.

So `rank: null` here means **UNRESOLVED, not ABSENT**, and the adapter **returns every
overlapping plan and picks none**. Collapsing this into "no ladder exists" would licence exactly
the silent pick it forbids. Carried in code as `FI_RANK_ABSENCE_REASON`.

---

## §6 — HSY SeutuRAMAVA: REACHABLE (re-verified), AND THE INTERSECTION IS EMPTY

Briefed: check reachability, do **not** build a second path. Both honoured.

**Reachable, re-verified independently of E5:** `kartta.hsy.fi/geoserver/wfs` GetCapabilities →
**200, 349,217 bytes, keyless**, 26 distinct `SeutuRAMAVA_*` layers, newest
`asuminen_ja_maankaytto:SeutuRAMAVA_kortteli_12026`. `GetFeature count=1` → block `0490100001`
(Espoo): `kala 137777` · `karayht 116900` · **`laskvar_yh 27659`** · `laskvar_ak 20850` ·
`laskvar_y 6809` · `rakerayht 8092` · `rekpvm 20251219` — **byte-for-byte the E5 §A-1 payload**,
from an independent request.

### ⭐ But the finding that matters more than reachability

Per-municipality CQL counts against both Ryhti valid indexes:

| HSY municipality | valid **detail** plans | valid master plans |
|---|---:|---:|
| Helsinki (091) | **0** | 14 |
| Espoo (049) | **0** | 15 |
| Vantaa (092) | **0** | 0 |
| Kauniainen (235) | **0** | 0 |
| *(controls)* Tampere 837 / Turku 853 | 0 / 0 | 0 / 0 |
| *(control)* Kuopio 297 | 1,053 | 64 |

⛔ **Not one asemakaava — the instrument that carries `rakennusoikeus` — exists in the open Ryhti
index for any of HSY's four municipalities.** So HSY **cannot** be used to validate a
Ryhti-derived Finnish capacity number today: the two datasets do not overlap on a single parcel.
Consuming it would additionally be a second, independent path (own service, own block geometry,
own vocabulary) — exactly what the brief forbade.

Carried in code as `FI_HSY_SEUTURAMAVA_FINDING` (`reachable: true`, `wired: false`, with the
overlap numbers), asserted by the test suite, and the ready-to-seed source row is queued in
`impl/barrel-additions-fi.txt` §3 rather than minted — a registry row for an endpoint no code
reads is documentation pretending to be a registry.

---

## §7 — WHAT WAS BUILT

`packages/site-parcel-data/src/countryAdapters/fi/` — 6 files, following §6-A exactly except
where §6-B (never mint a rival) overrides it, which is named below.

| file | role |
|---|---|
| `fiJurisdiction.ts` | **ADOPTION module — mints nothing.** Re-exports `FINLAND_BBOX`, `ALAND_EXCLUSION`, `isInFinland` from `parcelProviders/mmlParcelProvider.ts` |
| `fiRyhtiClient.ts` | the ONE impure seam: endpoints, 10 measured quirks, `FetchOutcome`-classified GET, pure URL builders |
| `fiPlanProvider.ts` | pure feature parse + the classified date reader + point/permanent-id resolvers |
| `fiRuleMapper.ts` | **PURE, TOTAL, DETERMINISTIC.** 5 frozen state codelists, the rule vocabulary, the absent-capability list, the referent ladder |
| `fiSourceRefs.ts` | consumes `sourceRegistry/fi.ts` + DK's `assertEndpoint` drift guard + ONE additive row + the HSY finding |
| `index.ts` | the ladder as data, `resolveFiPointChain`, `fiCountryAdapter`, explicit re-export list |

`packages/site-parcel-data/__tests__/fiRyhtiAdapter.test.ts` — **42 tests**, plus
`__tests__/fixtures/fi-ryhti-2026-09-01/recorded-live-2026-09-01.json` (222 KB, sha256-pinned).

### ⛔ THE ONE DELIBERATE DEVIATION FROM §6-A, AND WHY IT IS THE CORRECT ONE

§6-A says each adapter carries its own `<COUNTRY>_BBOX` + `isIn<Country>`, copying
`ee/eeJurisdiction.ts`. **Finland already has one** — `mmlParcelProvider.ts:167/177/183` — and it
is *better* than a fresh rectangle because it **subtracts Åland**, a separate jurisdiction with
its own land registry by statute. A copy-pasted plain rectangle would have silently routed
Mariehamn to a cadastre that may not serve it: a wrong-jurisdiction answer that parses clean.

And it would have been **recurrence SIX**. The family verdict §7 records `eeJurisdiction.ts`,
`ltJurisdiction.ts` and `plJurisdiction.ts` as recurrences three/four/five of a `CountryBbox` +
`within()` drift already logged twice. Finland is the first country in the wave where the
predicate *already existed*, so copying the sibling shape would have been the cheapest and most
invisible recurrence yet. §6-B ("NEVER MINT A RIVAL") and the standing review rule win over
§6-A's file-shape instruction; the deviation is declared at the top of the file.

### The seven seats (§6-E)

| seat | FI |
|---|---|
| **R1 basis** | every rule cites the minted `SiteIntelPlan` returned in the same result; boundary rides `applicability.geometry` **inline** because `SiteIntelPlan` has no geometry field (only `geometryRef`, which must resolve to an entity — and no Zone/Prescription is minted, see below) |
| **R1 rank** | `null` + `FI_RANK_ABSENCE_REASON` — the **fourth** case (§5) |
| **R1 useScope** | `[]` everywhere + `FI_USESCOPE_ABSENCE_REASON`: the register serves **no use axis at all** (`kayttotarkoitus` 0 occurrences). Not "not use-conditioned" |
| **R2 valueBasis** | absent everywhere + `FI_VALUEBASIS_ABSENCE_REASON`: the source serves **no percentage, ratio or area value**, so no denominator question arises. Noted for the future: the moment Ryhti serves `tehokkuusluku` (e = floor area / plot area), a `valueBasis` naming WHICH plot area becomes MANDATORY |
| **R3 validityBasis** | `'legal'` only on a served, plausible `approval_date`; sentinel / implausible / malformed / absent all → `'ingestion'` + fetch date, each naming which (§4) |
| **R5 normativeForce** | master plans: the state's own Finnish `oikeusvaik_YK` label **verbatim** (`"Oikeusvaikutteinen yleiskaava"`, 647/647). Detail plans: `null` — the register serves no force flag for an asemakaava, and null is **not** an assertion of bindingness |
| **UNKNOWN** | keyed off the DECLARED field set; every guard justified by a measurement in its own note; rows emitted, never dropped |

**No Zone and no Prescription is minted.** Ryhti's open channel *draws nothing* — the polygon is
the plan's outer boundary. Minting a `SiteIntelZone` from it would assert a land-use zone the
register did not draw, the same error LT's header refuses for ASGR consolidation polygons.

### Non-rivalry (C84 EI-9) — what was adopted rather than re-invented

`FetchOutcome` + `fetchFound/Absent/Transient` from `@pryzm/schemas` · refusal prefixes only from
the L0 vocabulary (`endpoint-unreachable:` / `upstream-failed:` / `no-feature:` /
**`mapper-refused:` with a d**) · `defineSources` as the row loader · DK's `assertEndpoint` drift
guard · the existing `isInFinland` · the existing `mmlParcelProvider` as the FI parcel authority
(no rival minted — it is key-gated on an unset `MML_API_KEY`, so the FI chain is keyed by a
WGS84 **point**) · the parenthesised `fetchedAtIso` form that survives a full ISO timestamp
(L-12873). **No retry ladder adopted, and said so** (`src/net/retryWhileUnreachable.ts` has zero
consumers in `countryAdapters/`; making FI the only country that retries is a policy decision for
the transient-retry owner).

---

## §8 — ACCEPTANCE

| criterion | result |
|---|---|
| **≥1 REAL parcel or zone resolved end-to-end** | **YES — 9 real Finnish plans, LIVE.** Jämsä (61.8645, 25.19) → 6 valid asemakaava (`AK-005353/005418/005424/005425/005432/005470`); Helsinki-Vartiosaari (60.1842, 25.0737) → 3 valid yleiskaava (`YK-000597/000598/000603`). Fetched live from `paikkatiedot.ymparisto.fi` on 2026-09-01, then **replayed byte-for-byte as fixtures LABELLED as recorded live**, with the recorder script published |
| **fixtures LABELLED, with the reason** | YES — `__label__` in the fixture, the header of the test file, and `06-fixture-recorder.mts`. Reason: replay, not access — the service is keyless and was hit live |
| **every rule carries source + confidence tier** | YES — asserted at the chain layer for every rule of every plan; `SiteIntelRuleSchema.parse` re-run on all of them |
| **tier-6 UNKNOWNs visible and counted against an independent census** | YES — the census is Tilastokeskus `kunta_1_20260101` (308) → **39/308 = 12.66% coverage**; per-field emptiness counted over all 6,282 features (transcript 02 §1); the sentinel counted three ways with a dispositive control (§4) |
| **refusals carry BOTH numbers (C74)** | YES — `FI_RYHTI_ABSENCE_CAVEAT` carries 39 **of** 308; the sentinel notes carry 5,986/6,282, 5,654/6,282, 3,673/6,282, 4,240 and 1,143/6,282; the digital-origin note carries 6,278 **of** 6,282; the implausible-date note carries 1 **of** 5 fields × 6,282 |
| **falsification: sever the provenance leg → a NAMED test fails; restore byte-identically** | **EXECUTED — see §9** |

---

## §9 — FALSIFICATION RECORD (executed, in the foreground)

| deliverable | falsification | result |
|---|---|---|
| the rule mapper's provenance leg | set `plan_id`/`object_id` to `null` in `buildRule`'s `source` block | **SEEN FAILING BY NAME.** `RC=1`, exactly 1 of 42 failed: *"block 6 · THE FALSIFICATION TARGET — every rule carries the FI provenance leg"* · `AssertionError: fi-AK-005418-planType must cite the national permanent plan identifier: expected null to be 'AK-005418'` (transcript 03) |
| byte-identical restore | sha256 before `236ce888…900d7` → after restore `236ce888…900d7` | **IDENTICAL**, and 42/42 green again (transcript 04) |
| the "no unserved parameter is emitted" claim | block 1 asserts the emitted set is disjoint from `FI_RYHTI_UNSERVED_PARAMETERS`, over both indexes | passes; adding one `floorAreaRatio` rule fails it by name |
| the closed-codelist throw | inject `RY_Kaavalaji/code/9999` into the fixture | chain returns `transient` with `mapper-refused: … RY_Kaavalaji code "9999" is not in the frozen national codelist` — never a silent absorb |
| **SCRAMBLE CONTROL (mandatory, §6-G rule 5)** | five perturbations, each asserted to CHANGE the outcome: real approval date → R3 flips `ingestion`→`legal`; legal-effect code 1→2 → R5 flips `Oikeusvaikutteinen`→`Oikeusvaikutukseton`; geometry→null → the inline leg disappears; `documents`→null → the provisions rule goes tier-6; unrouted URL → `endpoint-unreachable:` by name | **all five flip.** The suite cannot be passing on arbitrary input |
| axis-order trap | live control pair on the real service | lon,lat → 4 features; lat,lon → **HTTP 200, 0 features, silently** |
| paging trap | live control triple | `offset` 0/2000/4000 → byte-identical pages; `startIndex` 2000/4000 → 2000+1635, summing to 5,635 |
| suites | `npx vitest run` (whole package), foreground | **166 files / 3,524 passed, 3 skipped, RC=0** (transcript 05) |
| typecheck | package `tsc -p tsconfig.json --noEmit`; root `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`, `$?` read immediately, no pipe | **RC=0 / RC=0**, zero `countryAdapters/fi` diagnostics (transcripts 08, 07) |
| inherited-artefact mtime check | the four committed adapters and `sourceRegistry/fi.ts` were read at HEAD today; `lt/ltRuleMapper.ts` and `pl/plRuleMapper.ts` are stamped 17:50, i.e. AFTER the sibling lane transcripts | every baseline was **re-executed**, never read out of a sibling lane file |

---

## §10 — DEFECTS AND DISCOVERIES (proposed rows; highest existing is **L-12877**, so the
orchestrator should assign from L-12878 — sibling lanes are minting concurrently)

**⛔ P2 · `RYHTI_ATTRIBUTE_FIELDS` IS NOW WRONG, AND IT IS WRONG IN THE DIRECTION THAT COSTS
MONEY.** `parcelProviders/mmlParcelProvider.ts:636` names `tehokkuusluku` / `kerrosluku` /
`kayttotarkoitus` as fields to "CONFIRM PRESENT". **All three are absent** (probed verbatim,
§1.4). The constant is honestly labelled as unprobed, so it is not a lie — but it is now a
*resolved* question wearing an open question's clothes, and the next reader will spend a day
re-running it. **Disposition: replace the stub with the measured Outcome-B result + a pointer to
this lane; keep the probe URL.** *Acceptance:* the file states the answer and its date.

**⚠ P3 · `ryhti_building` IS SERVING OPENLY AND IS IN NO REGISTRY.** Five collections at
`paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections`, HTTP 200,
keyless (§1.2). `sourceRegistry/fi.ts` has two FI rows and neither is this; the E5 sweep predicted
building data only from 1.1.2026 and did not probe it. **Disposition: hand to the buildings lane;
seed a source row after it probes a feature.** Not actioned here (controls 2, 10).

**⚠ P3 · `NORWAY_BBOX` OVERLAPS `FINLAND_BBOX` ACROSS THE WHOLE FINNISH NORTH.**
`countryBbox.ts:56` (57.8–71.4 N, 4.4–31.3 E) vs `FINLAND_BBOX` (59.7–70.1 N, 20.5–31.6 E).
Nothing mis-routes today because NO is not registered for a Finnish point, but this is the same
class as **L-12871** (LT/PL/DE) and belongs with that precedence work. The NO lane running in
parallel should be told. **Disposition: fold into L-12871.**

**⚠ P4 · ONE FEATURE OF THE NATIONAL REGISTER CARRIES SWAGGER PLACEHOLDER DATA.** In
`pub_valid_lm_plan_ix_gs`, one feature has `case_identifiers` `["string"]`, `record_numbers`
`["string"]` and `description_eng/swe/sme/smn/sms` each the literal `"string"`. Upstream data
quality; recorded so nobody spends time on it as a parser bug. Not actionable by PRYZM.

**⚠ P4 · ONE FEATURE CARRIES AN ELEVENTH-CENTURY APPROVAL DATE.** `AK-004907` (Hämeenkyrö)
`approval_date = "1068-06-28Z"`. Handled (the plausibility floor, §4). Upstream; worth a note to
SYKE if anyone has the channel.

**Recorded, NOT actioned (control 10):**
* The two `prep` collections are declared and empty. When Finnish municipalities start delivering
  in-preparation plans, an adapter that treats `absent` as "nothing" will silently keep reporting
  nothing. The absence caveat covers it in prose; a coverage-drift probe would cover it in code.
* `src/net/retryWhileUnreachable.ts` still has zero consumers in `countryAdapters/` — this is the
  **fifth** adapter to write prose about retry instead of adopting it. Whoever owns transient-retry
  policy should decide adopt-or-delete; five adapters should not each re-decide it.
* Ryhti's OGC API ignores `offset` and `skipGeometry` without complaint. Worth a one-line note in
  any future shared OGC-API helper: **read the server's own `next` link, do not trust the spec.**

---

## §11 — WHAT THIS LANE CHANGED

**Added (lane-owned only):** `packages/site-parcel-data/src/countryAdapters/fi/` (6 files) ·
`packages/site-parcel-data/__tests__/fiRyhtiAdapter.test.ts` ·
`packages/site-parcel-data/__tests__/fixtures/fi-ryhti-2026-09-01/` ·
`audit/europe-site-intel/2026-08-31/impl/lane-e7-fi.md` ·
`audit/.../impl/barrel-additions-fi.txt` · `audit/.../impl/lane-e7-fi-transcripts/` (8 files).

**Edited: NOTHING.** No shared file was touched — not `src/index.ts`, not `sourceRegistry/*`,
not `parcelProviders/registry.ts`, not `parcelProviders/countryBbox.ts`, not
`providers/containers/*`, and nothing under `packages/schemas/**` (control 3 — the canonical
model is FROZEN; it was read, never modified, and no schema change is requested). No parcel
provider registered (L-12871 is OPEN). No ceiling raised, no gate disabled, no `gate-debt.json`
entry, no rival built. **Nothing committed.**

---

## §12 — THE ONE-SENTENCE HANDOFF

**Ryhti is live, keyless and honest — and it is an index: it serves plan identity, boundaries and
PDFs for 12.66% of Finland and declares on 99.94% of features that only the outline was
digitised, so the FI adapter's most valuable property is the building-right numbers it refuses to
invent, and the next real gain for Finland is the kaavamääräykset PDF pipeline (6,538 addressable
documents, keyless, 89.6% of attachments), not more Ryhti attributes.**
