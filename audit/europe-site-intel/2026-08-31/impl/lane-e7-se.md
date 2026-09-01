# LANE E7-SE — SWEDEN: AN HONESTLY GATED COUNTRY ADAPTER

**Date:** 2026-09-01 · **Tree:** `Product_Rediness_08` @ `main` (not committed — hard rule) ·
**Authority:** `E4-EXECUTION-CONTROL.md` controls 1–10 · E7-family conventions
`impl/e7-family-extraction-verdict.md` §6 · C74 (Constraint Honesty) · C84 EI-9 ·
[[identity-bootstrap-gate-offline-legislation-pattern]]

---

## §0 — THE ONE-PARAGRAPH ANSWER

**The E5 verdict for Sweden — "graded GREEN but no API endpoint URL was ever captured; an
OAuth2/organisational-onboarding gate" — is HALF WRONG, and the wrong half is the important
one.** It applies one gate verdict to two different authorities. The gate is real for
**Lantmäteriet** (all geometry, and therefore every Swedish *number*): three separate doors were
probed today and all three answered **HTTP 401 code `900902` Missing Credentials**, with
byte-identical bodies. It is **false for Boverket**, which serves the national
**Planbestämmelsekatalog** — the controlled planning-provision vocabulary the brief singled out —
**keyless**: `https://api.boverket.se/planbestammelsekatalogen`, `subscriptionRequired: false` on
the state's own APIM catalogue, **HTTP 200, 13,176,663 bytes, 3,707 provisions, no credentials of
any kind.** So Sweden is not a blocked country. It is a country where **PRYZM can know exactly
which parameters exist and none of their values** — and that is what this adapter now says, in
those words, with the ratio asserted rather than narrated: **83 declared numeric parameters, 83
tier-6 UNKNOWNs, 0 values.**

**Shipped:** 8 adapter modules (2,600 lines), 1 test suite (860 lines, **49 tests, 46 offline +
3 live**), 16 fixtures that are the state's own bytes — including the three 401 bodies, because
*the state's own bytes saying no are as much a recorded fact as the state's own bytes saying yes*.
**Root tsc RC=0. Lint RC=0. Package suite 166 files / 3,524 tests RC=0. Two falsifications
executed and restored byte-identically.**

---

## §1 — WHAT THE BRIEF ASKED FOR, AND WHAT EACH ASK GOT

| Ask | Answer |
|---|---|
| **FIRST TASK: discovery pass — find the actual service, record what it needs** | DONE. Two services found, two different gate verdicts. §2 and §3. |
| If identity-gated: ship the OFFLINE half (the Planbestämmelsekatalog imported as data) | DONE — **83 provisions imported verbatim**, generated from the live release, `sePlanProvisionCatalogue.ts`. §4. |
| …the source rows recorded with their gate named | DONE — 3 rows through `defineSources`, the two gated ones carrying the **measured** 401 in `gate`. §6. |
| …a DEFERRED stub for the gated half — **never a fake client** | DONE, and this is the part that took restraint: **no Lantmäteriet client, no `fastighetsbeteckning` parser, no detaljplan-GML parser** — see §5 for why each was refused. |
| IMPORT verbatim rather than harmonise | DONE — every Swedish string is Boverket's own; the only PRYZM-authored columns are `parameter`/`unit`, which are the §J vocabulary seat. |

---

## §2 — THE DISCOVERY PASS: BOVERKET IS KEYLESS (transcript 01)

The E5 row named the Boverket page but no endpoint. The chain that found one:

1. `boverket.se/sv/om-boverket/oppna-data/planbestammelser/` links
   `https://api-portal.boverket.se/reference#api=planbestammelsekatalogenv2` — an **Azure APIM
   developer portal**, a JS SPA that a naive fetch reads as an empty nav.
2. The SPA's own config is public: `GET https://api-portal.boverket.se/config.json` names the
   management API, and **`GET /developer/apis?api-version=2022-04-01-preview` answers
   unauthenticated**. Seven APIs; the row that matters:

   ```
   planbestammelsekatalogenv2   subscriptionRequired=False  path=planbestammelsekatalogen
   ```

   (For contrast, the *same list* shows `andamalskatalogen` with `subscriptionRequired=True` — so
   the field is discriminating, not uniformly false.)
3. The gateway host is `https://api.boverket.se` (the APIM default
   `https://delat-prd-ams.azure-api.net` serves the same bytes; both probed).
4. `GET /planbestammelsekatalogen/release/full/platt/aktuell` → **HTTP 200 · 13,176,663 bytes ·
   no credentials**. Release `id 7`, `namn 20251201`, `publicerad 2025-12-01T10:39:00`,
   `typ {id:1, namn:"Juridisk"}`, **3,707 bestämmelser**.

**The lesson is [[bulk-vs-query-endpoint-false-refusals]] in a new dress.** The blocker was never
the data; it was that nobody had asked the *portal* what it served. One unauthenticated call to a
Microsoft product's own catalogue endpoint turned a "GREEN but unreachable" country into a live one.

### 2.1 · The measured error shapes — and the trap they set

| Request | HTTP | Body | Correct class |
|---|---|---|---|
| a uuid Boverket does not hold | **404** | `"Bestämmelse med id … saknas i aktuell publicerad release."` (a JSON **string**) | **ABSENT** — durable |
| a nonexistent värdedomän id | **404** | `"Bestämmelsetyp med id 999 saknas."` | **ABSENT** |
| a path this adapter got wrong | **404** | `{ "statusCode": 404, "message": "Resource not found" }` (APIM envelope) | **TRANSIENT** |
| a malformed uuid | **404** | **empty, no content-type** | **TRANSIENT** |

⛔ **The reflex — `if (!res.ok) return transient` — inverts the first two rows** and turns "Sweden
does not define this provision" into "the source did not answer". `isSePbkAbsenceBody()` is the
whole discriminator: a 404 is an absence **iff** the body is a JSON string containing `saknas`.
Six tests hold each branch.

---

## §3 — THE GATE, MEASURED (transcript 02)

**Three Lantmäteriet doors. One gate.** All three answered HTTP 401 with **byte-identical** bodies
(sha256 `9aed6cff…a42e9`), committed as fixtures:

```
…/sokning/v1/detaljplan/v1/search                    → 401 {"code":"900902","message":"Missing Credentials",…}
…/visning/v1/detaljplan/v1/wms?…GetCapabilities      → 401 (identical)
…/sokning/v1/fastighetsindelning/v1/search           → 401 (identical)
apimanager.lantmateriet.se                           → 302 (login wall)
```

`900902` is the WSO2 API-Manager code. The gate is **client registration + per-product
subscription**, then OAuth2 client-credentials or Basic. The 2025 HVD opening made the DATA free
and CC BY 4.0; it did not remove the registration step. That is the SE/DK lesson stated precisely:
**the data is not missing, and a gate is not an absence.**

### 3.1 · ⭐ A SECOND REACHABILITY FACT THAT LOOKS LIKE THE FIRST AND IS NOT

`opendata.lantmateriet.se` — the open-data host — has **AAAA only, no A record**
(`2001:67c:268c:f110::2063`). From this IPv4-only egress it fails as *"Could not resolve host"* /
connection timeout. **That is a PRYZM network limitation, not a Swedish access gate and not an
absence of data.** It is deliberately NOT encoded as a gate anywhere in the adapter, and it is
recorded here so a later lane that hits the same timeout does not write "SE open data unreachable"
into a national coverage table. This is the [[context-data-honesty-family]] rule applied to *our*
side of the wire: **three causes of silence, and one of them is us.**

---

## §4 — THE OFFLINE HALF: THE CATALOGUE, IMPORTED VERBATIM

### 4.1 · The subset is defined by two SERVED predicates, not by judgement

Of 3,707 provisions: `slutargalla === null` → **908 in force**; of those, the formulering carries a
`[…:decimaltal]` slot → **83**. Those 83 are **the closed, state-declared set of numeric parameters
a Swedish detaljplan can carry.** The other 825 are prose/geometry provisions with no number —
counted (`SE_PBK_CENSUS.nonNumericInForce`), not imported.

This is E7-family §6.E's UNKNOWN doctrine at its strongest: *"key the emission off the DECLARED
layer vocabulary, not the served bag."* **In Sweden the declared vocabulary is a versioned national
API, not a hand-written list in an adapter** — so the emission cannot be quietly wrong about what
exists. The generator (transcript 06) **refuses to emit** when the served set and the canonical map
disagree in either direction: `rows 83 unmapped 0 stale-map-keys 0`.

Distribution of the 83 by category: Höjd på byggnadsverk 28 · Utnyttjandegrad 26 · Utformning av
allmän plats 10 · Markens anordnande 8 · Takvinkel 6 · Fastighetsstorlek 2 · Placering 1 ·
Utförande 1 · Markreservat 1.

### 4.2 · ⭐ CONTROL 8: SWEDEN SERVES THE DENOMINATOR AND THE MEASUREMENT BASIS **AS CODE**

This is the most valuable thing found this lane, and it is why `valueBasis` carries the
`bestammelsekod` **verbatim** rather than any PRYZM vocabulary.

**The denominator — the C63 lesson, served natively, four codes one Swedish word apart:**

| bestammelsekod | Served formulering | Divisor |
|---|---|---|
| `…AreaProc_BruttoEgen` | "% av fastighetsarean inom **egenskapsområdet**" | property area ∩ the property-designation area |
| `…AreaProc_BruttoAnv` | "% av fastighetsarean inom **användningsområdet**" | property area ∩ the *use* area |
| `…AreaKvm_BruttoFastigh` | "m² **per fastighet**" | per property |
| `…AreaKvm_Brutto` | "m²." | none — the value *is* an area |

A consumer that multiplies a percentage by "the parcel area" without reading the code reproduces
the **Aarhus trap** (`bebygpct=180, af=1`) with every field parsing clean. **Falsification F2
proved this seat is load-bearing:** collapsing `valueBasis.code` from the provision code to its
*category* — which merges all four into `"Utnyttjandegrad"` — turned **three** named tests red.

**The measurement basis — ⭐ the L-584 rasant defect, answered by the state BEFORE any terrain is
sampled:**

| code suffix | meaning |
|---|---|
| `…_Nockhojd` | **ridge** height, measured from the ground |
| `…_NockhojdNollplan` | **ridge** height, **above a stated zero plane (a datum)** |
| `…_Totalhojd` / `…_TotalhojdNollplan` | **total** height, the same two bases |

L-584 is *"terrain/rasant is a LEGAL defect: we sample ONE point at the centroid, the ordinance
measures at the façade."* Sweden makes the two cases **machine-distinguishable in the code itself**:
a `Nollplan` provision needs a **datum**, not a terrain sample; a non-`Nollplan` one needs a ground
reference the plan does not itself carry. The adapter maps them to **different canonical
parameters** (`maxRidgeHeight` vs `maxRidgeHeightAboveDatum`) so they cannot be conflated
downstream, and a test pins the distinction.

### 4.3 · The sense token, and why nothing keys off it

`uttrycktvarde` ∈ {Max, Min, Exakt} is served — **but it is NOT a closed codelist**: there is no
`/vd/uttrycktvarde` endpoint (the API publishes nine other värdedomäner and not this one). Across
all 3,707 rows, **46 of the 271 non-null values (17.0%) are not a sense token at all**: `'0,0'` ×29,
`'00'` ×10, `'00-00'` ×2, `'Mellan'` ×2, `'0,0/0,0/…'` ×1, and — the interesting one —
**`'MIn'` ×2, a casing typo of `Min` in the national catalogue.**

Restricted to the 908 in-force rows it is clean. So the field is carried **verbatim** and used for
nothing, and §6.E's *"a value outside a closed state codelist MUST throw"* is deliberately **NOT**
applied to it, because it is not one. That distinction is measured, not assumed —
`assertSeClosedDomainValue('uttrycktvarde', …)` **throws by name**, telling the caller not to assert
against a list the state does not publish.

### 4.4 · ⚠ A SERVED ASYMMETRY THE FIRST TEST RUN CAUGHT

The suite's first run failed on one row: **`DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre` (Planområdet,
storey count) carries NO `uttrycktvarde`, while its Kvartersmark twin
`DP_KM_Eg_Hojd_ExaktHojd_ExaktVan_Aldre` carries `Exakt`.** Same wording, same category, one of the
pair unfilled. It would have been one line to default the missing one from its sibling. That would
have been **inventing a qualifier the state did not serve** — control 9's neighbour: *an unfilled
QUALIFIER is not the sibling's qualifier.* It is recorded (`SE_PBK_CENSUS.importedWithoutSense`),
the exact distribution `{Min:34, Max:28, Exakt:20, null:1}` is asserted, and the twin's `Exakt` is
pinned so the asymmetry cannot be silently "cleaned up" later.

### 4.5 · The two-number provisions a scalar seat cannot hold

**Four** of the 83 express a slope as `[lutning1]:[lutning2]` — TWO numbers
(`…Markforhallanden_MinstaLutning`, `…StorstaLutning`, and the two `UtformAP_Mark` twins).
`RuleProvenance.value` is a scalar seat. Those rows carry `numericSlots: 2` and their note says they
**will stay UNKNOWN even after NGP opens**. Naming that now is cheaper than discovering it later as
a silently-halved ratio.

---

## §5 — THE DEFERRED HALF: THREE THINGS DELIBERATELY NOT BUILT

C74 §3.2/§3.3/§3.4/§3.8 govern this, and the brief's *"never a fake client"* is the same rule.

1. **No Lantmäteriet HTTP client.** Not "a client that returns an error" — **no client**. Both
   parcel resolvers and both detaljplan resolvers return `seNgpDeferredRefusal()`, which is
   `transient` (never `absent`: **Sweden has 11,662 digital plans across 236 of 290 kommuner**;
   answering "nothing here" would be the failure≠absence conflation at national scale), carries the
   distinguished token `se-ngp-credential-gate-deferred`, quotes the measured 401, and stamps
   `se.deferred = true` on its span. **C74 §3.2: detectable from outside without reading the source
   — "it is documented in the file header" is not detection.**
2. **No `fastighetsbeteckning` parser.** The grammar is published (`<kommun> <trakt> <block>:<enhet>`).
   Writing it with no served bytes to test against is [[fake-more-capable-than-real]]: a parser built
   from the spec cannot falsify the spec.
3. **No detaljplan GML/JSON parser.** PRYZM already has an APP-GML parser from lane E2b, and
   Lantmäteriet publishes a full specification — a Swedish sibling would have been easy and its tests
   would have confirmed the *header*, not the service. It waits for recorded bytes.

**C74 §3.4 — the scaffold expires.** `SE_NGP_DEFERRAL` carries owner, `declaredOn 2026-09-01`, the
retirement condition, and `reviewBy 2027-03-01`. `assertSeNgpDeferralNotExpired(todayIso)` **throws
by name** after that date, naming what retirement means, and ending *"do not extend this date to
silence the assertion."* Both branches are tested. **A deferral without an expiry is permanent
architecture nobody chose.**

**C74 §3.8 — the unwired is declared in the barrel**, not only in the files: `SE_DEFERRED_LEGS`
enumerates the four refusing legs and a test asserts each one actually refuses, so an audit of
*existence* cannot pass where an audit of *reachability* fails ([[committed-is-not-reachable]]).

---

## §6 — THE SEATS (E7-family §6.E), AND THE ONE JUDGEMENT CALL

| Seat | Sweden | Note |
|---|---|---|
| **R1 `basis`** | `[{kind:'regulation', ref:'se-regulation-<kod>'}]`, and the `SiteIntelRegulation` is **returned in the same result** | The referent ladder's rungs 1–3 are all unreachable (no plan, no geometry until NGP). `SiteIntelRegulationSchema`'s own doc sanctions `planId: null` for *"plan-independent instruments (national law)"* — which is exactly what a catalogue provision is. Minting it keeps the rule off rung 4 (*throw by name*) **honestly**, rather than by inventing a plan. |
| **R1 `rank`** | `null` — **the THIRD of §6.E's three reasons**: the ladder exists but is adapter DATA | `SE_APPLICABILITY_LADDER` (detaljplan → områdesbestämmelser → översiktsplan(guiding) → PBL/BBR). Boverket serves no rank column. Not "no ladder exists"; not "the state already applied it". |
| **R1 `useScope`** | `[anvandningsform]` verbatim (`Kvartersmark` / `Allmän plats` / `Planområdet`) | Genuinely use-conditioning, and a CLOSED värdedomän — an unrecognised value **throws**. |
| **R2 `valueBasis`** | `{scheme:'se-boverket-bestammelsekod', code:<kod>}` on **every** row, tier-6 included | §4.2. Nothing inferred: the code is the state's own identifier for the exact denominator + measurement basis. |
| **R3 `validityBasis`** | **`'legal'`**, `valid_from` = Boverket's `borjargalla`, `valid_to` = null | **THE JUDGEMENT CALL — argued in the mapper header, not asserted.** See below. |
| **R5 `normativeForce`** | `'Juridisk'` — Boverket's own word, verbatim, a whole-dataset constant (the LT pattern) | `/vd/releasetyp` is a **closed two-value list `{Juridisk｜Teknisk}`**; all seven releases are `Juridisk`. A `Teknisk` release would be non-legal, so this is a real force axis, not a label. The per-provision `tolkningsbestammelse` flag is a **different** axis and rides the note, not this string. |
| **UNKNOWN (control 9)** | `value: null`, tier 6, **83 of 83**, never dropped | Structural: the schema permits `null` only at tier 6. |

### 6.1 · Why R3 is `'legal'` and not `'ingestion'` — the argument, written down

Read strictly, §6.E says `'legal'` needs an in-force date the register serves *for that value* — and
the value is null, so the row would fall to `'ingestion' + fetch date`. **That reading is wrong here,
and demonstrably worse:**

- What the row asserts is *"this parameter exists, with these semantics, and PRYZM does not know its
  value."* Boverket serves an in-force date for exactly that object (release typ `Juridisk`,
  `borjargalla`/`slutargalla` per provision). There **is** positive evidence of legal force for the
  thing the row is about.
- `'legal'` **cannot produce a wrong number**: the value is null at tier 6 and any evaluator must
  refuse to compute with it regardless of the window.
- `'ingestion' + today` **would produce a wrong answer**: an evaluator asking *"what applied on
  2021-01-01"* would exclude the row and thereby claim Sweden had no such provision in 2021. That
  **confident false negative** is the exact failure R3's own schema doc says the field exists to kill
  (gate decision §B.3).

The note states, in words, what the window IS about (the provision's legal availability as a
drafting/interpretation instrument) and what it is NOT (a value in force on any parcel). A test pins
`valid_from === '2020-10-01'` **and** `valid_from !== FETCHED_AT`.

---

## §7 — DEFECTS AND DISCOVERIES (control 10: recorded, not scoped)

⚠ **Numbers are NOT claimed.** The highest committed row is **L-12877**; sibling E7 lanes are running
concurrently in this tree and `L-12878` is already proposed by `lane-e7-lu.md`. These are labelled
SE-A…SE-D for the orchestrator to number.

**SE-A — ⛔ P2 · `SOURCE_ABSENCE_REASONS['SE']` APPLIES ONE GATE VERDICT TO TWO AUTHORITIES, AND
HALF OF IT IS FALSE.** `sourceRegistry/index.ts` records SE as having *"no API endpoint URL
captured … OAuth2/org-onboarding gate"*. True of Lantmäteriet; **false of Boverket**, whose
catalogue answered HTTP 200 keyless today. The generalisation is the defect shape: **a country is
not a gate**, and grading gates per country hid a live national API for the whole E5 wave.
Replacement text in `impl/barrel-additions-se.txt` §3. **Acceptance:** the SE key is deleted (rows
seeded) or reworded per-authority.

**SE-B — ⛔ P2 · `parcelProviders/mmlParcelProvider.ts:86` IS FALSIFIED THE DAY `SWEDEN_BBOX` IS
DECLARED.** That line reads *"FINLAND_BBOX does not overlap any"*. `FINLAND_BBOX {59.7–70.1,
20.5–31.6}` ∩ `SWEDEN_BBOX {55.3–69.1, 10.9–24.2}` = `lat[59.7,69.1] × lon[20.5,24.2]`, and the
intersection contains **Tornio (FI, 65.8482/24.1467)** and **Haparanda (SE, 65.8356/24.1345)** — one
bridge apart. Not patched (barrel protocol). **Acceptance:** the sentence is deleted or gains a dated
qualifier (*"…did not overlap any box REGISTERED AS OF \<date\>"*). This is the same class as SE-A:
a claim true when written, with nothing to re-check it.

**SE-C — ⛔ P1-adjacent · L-12871 GETS FIVE TIMES WORSE, AND THE AUDIT IS NOW ARITHMETIC.**
`SWEDEN_BBOX` overlaps **five** registered/adapter boxes, each intersection containing a named
foreign settlement a smallest-box resolver would route to Sweden: **DK (København, MUTUAL — Malmö is
inside DENMARK_BBOX, 25 km away), NO (Røros, MUTUAL — Kiruna), FI (Tornio, MUTUAL — Haparanda), EE
(Kuressaare, one-way), LT (Klaipėda, one-way)**; DE and PL are disjoint (their maxLat 55.1 / 54.84 <
SE minLat 55.3). **NO PARCEL PROVIDER WAS REGISTERED.** The audit is committed as DATA
(`SWEDEN_BBOX_OVERLAP_AUDIT`) and a test **recomputes every intersection arithmetically** and
asserts every witness point is inside both boxes — so this cannot decay into "minor overlap" prose.
**Acceptance:** L-12871 gains precedence data before any Nordic parcel provider is registered.

**SE-D — ⚠ P3 · DATA-QUALITY IN THE NATIONAL CATALOGUE (reported upstream, not corrected here).**
`uttrycktvarde` has no värdedomän endpoint and carries 46 dirty values across the corpus, including
**`'MIn'` ×2 — a casing typo of `Min`**; and `DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre` carries no
sense while its Kvartersmark twin does (§4.4). Neither is corrected in the import: **a national
catalogue's dirt is a fact about the catalogue.**

### Recorded, NOT actioned (control 10 — no scope expansion)

1. **Two more keyless Boverket APIs exist and are not consumed.** `ÖP-katalogen`
   (`api.boverket.se/opmodell` — översiktsplan content model) and `Författningssamling`
   (`api.boverket.se/forfattningssamling` — Boverket's own regulations incl. BBR), both
   `subscriptionRequired: false`. They are the ladder's rungs 3 and 4 (`SE_APPLICABILITY_LADDER`).
   Recorded there and left alone.
2. **`Begreppsbanken`** (`api.boverket.se/begrepp`) — Boverket's national terminology bank for the
   PBL domain, keyless. Relevant to any future cross-country harmonisation seat; **not** used here,
   because harmonising is exactly what the brief said not to do.
3. **The `webblank` PDFs** (`/vd/webblank/pdf/{id}`) are the drafting guidance behind each
   provision — an extraction-pipeline input (tier 4→5), not a structured source.
4. **`Riktvärdeområden`** (A-11, the state's byggrätt *pricing* model) is confirmed as
   monetisation-layer only; it prices a m² of building right, it does not serve the quantity.
   Unchanged by this lane.
5. **The Swedish national parcel id is not parsed** — see §5.2. When a credential lands, the parser
   should be written against recorded bytes, from a real 200.

---

## §8 — WHAT WAS BUILT (files, and the acceptance ledger)

```
packages/site-parcel-data/src/countryAdapters/se/
    seJurisdiction.ts              132   SWEDEN_BBOX + isInSweden + the 7-row overlap audit AS DATA
    seBoverketClient.ts            224   the ONE impure seam; the Q1/Q2 404 discriminator
    seNgpGate.ts                   142   the C74 scaffold: token, endpoints, expiry assertion, refusal
    seParcelProvider.ts             81   DEFERRED (cadastre)
    sePlanProvider.ts               93   DEFERRED (detaljplan) + SE_DETALJPLAN_COVERAGE
    sePlanProvisionCatalogue.ts   1623   the 83 imported provisions + census + closed värdedomäner
    seRuleMapper.ts                316   PURE/TOTAL/DETERMINISTIC; the R1/R2/R3/R5 argument
    seSources.ts                   276   3 rows via defineSources + DK's assertEndpoint drift guard
    index.ts                       313   ladder, chain resolver, seCountryAdapter, SE_DEFERRED_LEGS
packages/site-parcel-data/__tests__/
    seAdapter.test.ts              860   49 tests (46 offline · 3 opt-in live)
    fixtures/se-boverket-pbk-2026-09-01/        13 files — the state's own bytes, sha256-pinned
    fixtures/se-lantmateriet-ngp-2026-09-01/     3 files — the state's own bytes saying NO
audit/europe-site-intel/2026-08-31/impl/
    lane-e7-se.md · barrel-additions-se.txt · lane-e7-se-transcripts/01…06
```

**No shared file was edited.** Not `src/index.ts`, not `sourceRegistry/*`, not
`parcelProviders/registry.ts`, not `parcelProviders/countryBbox.ts`, not
`packages/schemas/**` (control 3). No ceiling raised, no gate disabled, no `gate-debt.json` entry,
no rival minted (`FetchOutcome`, `defineSources`, the refusal vocabulary and `IsoDateStringSchema`
are all **adopted**, never re-implemented — C84 EI-9).

### Acceptance ledger

| Acceptance clause | Result |
|---|---|
| **≥1 REAL parcel or zone resolved end-to-end, LIVE where the service permits** | **83 real provisions resolved end-to-end LIVE** against `api.boverket.se` (transcript 03B, 83 HTTP round-trips, RC=0). ⚠ **HONEST LIMIT: a provision is not a parcel or a zone.** No Swedish parcel or zone was resolved, and none can be from this machine: the services that serve them answered 401. That is the deliverable the brief authorised, and it is stated as a shortfall, not dressed as a pass. |
| **fixtures LABELLED as fixtures where live is not permitted, with the reason** | 3 fixtures, each the literal 401 body, reason = the measured gate. **No fabricated NGP fixture exists** — §5. |
| **every rule carrying source + confidence tier** | All 83: `source{country,authority,dataset,object_id,document}` + `confidence.tier`. F1 severed `source.document` → named failure → restored. |
| **tier-6 UNKNOWNs visible and counted against an INDEPENDENT census** | `unknownCount === 83 === SE_PBK_CENSUS.numericInForce`, and the census is measured over the live 13.1 MB release (transcript 05), not derived from the table. Census internal consistency asserted (83+825=908; 678+230=908; 34+28+20+1=83). |
| **refusals carrying BOTH numbers (C74)** | The absent branch names **83** (imported) / **908** (in force) / **3,707** (total). The gated branch names HTTP **401** and code **900902**. |
| **Falsification: sever the provenance leg → a named test fails → restore byte-identically** | **TWICE.** F1 `source.document` → 1 named failure. F2 `valueBasis.code` → **3** named failures incl. the control-8 denominator test. Both restored to sha256 `bf25cd7c…4d7d`. Transcript 04. |
| **scramble control (§6.G.5, MANDATORY)** | Two: a provision perturbation reaching both the R2 code and the R3 date, and a **fixture** perturbation swapping `egenskapsområdet`→`användningsområdet` — the one-word denominator swap C63 exists to catch. |

### Verification, foreground, verbatim in transcript 03

```
npx vitest run __tests__/seAdapter.test.ts              → RC=0   46 passed | 3 skipped (49)
SE_LIVE=1 npx vitest run __tests__/seAdapter.test.ts    → RC=0   49 passed (49)   [83 live round-trips]
npx vitest run                        (whole package)   → RC=0   166 files | 3,524 passed | 3 skipped
npx tsc -p tsconfig.json --noEmit     (package)         → RC=0
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json   → RC=0   (ROOT, the strict one)
npx eslint <this lane's 9 files>                        → RC=0
```

⚠ **The package totals MOVED between the 19:11 run (165 / 3,482) and the 19:20 re-run
(166 / 3,524) — a sibling lane added a suite mid-lane. Both readings are recorded in
transcript 03 rather than one being quietly overwritten; the point of the number is that it
is GREEN and re-executed, not that it is stable.**

⭐ **MTIME DISCIPLINE (the hard rule).** Sibling lanes E7-FI / E7-LU / E7-NO are writing into this
same package **right now**: `countryAdapters/fi/`, `/lu/`, `/no/` did not exist when this lane
started, and a package typecheck at 19:02 caught a transient error in `fiRuleMapper.ts` — a file
stamped **30 seconds earlier**. It was not touched, and every reading above was **re-executed after
those directories appeared**, not carried forward. A green transcript written before its subject's
last edit proves nothing.

---

## §9 — THE ONE-SENTENCE HANDOFF

**Sweden is not blocked — it is *split*: Boverket serves the complete national planning-provision
vocabulary keyless and it is now imported, live-verified and mapped (83 parameters, each with its
denominator and measurement basis carried verbatim), while Lantmäteriet holds every geometry and
every number behind a client registration that this adapter refuses by name, with an expiry date,
rather than faking.**
