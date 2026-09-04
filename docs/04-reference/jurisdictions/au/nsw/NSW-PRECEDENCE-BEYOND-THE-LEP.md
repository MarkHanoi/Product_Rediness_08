# NSW — PRECEDENCE BEYOND THE LEP: SEPPs, the DCP's second axis, and the two oracles

> Lane **ENVELOPE-NSW** round 4 · 2026-09-04 · **A DECISION MEMO, NOT A STATUS REPORT.**
> Everything measured here is re-runnable from `phase0-transcripts/scripts/`. **Re-run, do not
> re-transcribe.** Companion: `NSW-CITATION-DECISION.md` (the three-arm citation decomposition),
> whose §8 table this memo closes two rows of and re-opens none.

---

## 0 — The one-paragraph version

Round 3 left two acceptance criteria marked ⛔ **NOT BUILT**: *"a SEPP-covered parcel is never
resolved LEP-alone"* and *"the 10.7 certificate CI check"*. **The first is now built, and the
obvious implementation of it would have been a regression.** The second **cannot be built as
specified** — the s10.7 API is real, state-published, and subscription-key gated as a
council-to-portal integration pipe, not a public read endpoint — so it is decomposed, per L-716,
onto the oracle that *is* reachable: the government's own determinations. Along the way the
layer-429 reading was overturned **for the third time**, and this time by a clause rather than by
an attribute.

---

## 1 — SEPP overrides: the criterion is met by reading a FIELD, not by adding a SERVICE

### 1.1 — The classification the brief asked for

| Layer | Instrument | Class | Why |
|---|---|---|---|
| 44 · 118 · 134 · 614 · 631 · 648 · 684 · 715 · 726 | Gosford / Growth Centres / SSP / CRC / T&I | **REPLICA** | measured to serve the identical value Principal/14 already serves at the same point |
| **799** Incentive HOB | Growth Centres map, WPC 2021 instrument | **DIRECT** | P14 says 30 m / 24 m where this says `80-99.9` — same value on **0 of 4** |
| **718** Reduced Level | CRC 2021 (Sydney Olympic Park) | **DIRECT** | the only measured SEPP height P14 does **not** carry (0 of 5 interior points) |
| **278** Obstacle Limitation Surface | Western Sydney Aerotropolis | **GEOMETRIC** | serves surface elevations, not a building height; s 4.22 states no number at all |
| 43 · 116 · 611 · 628 · 645 · 682 · 713 · 800 | (FSR family) | REPLICA / DIRECT | 800 is 799's floor-space twin under the same s 6.16 |
| **798** Minimum Non-Residential Floor Space | Growth Centres | **IRRELEVANT** *(to the top)* | a minimum floor-space **mix**; binds the programme, not the envelope |

`TEXTUAL` is unpopulated, honestly: no probed SEPP layer turned out to be prose-only.

### 1.2 — ⭐ The structural finding, and why "also query the SEPP service" is wrong

`Principal/14`'s `EPI_TYPE` is a coded domain — **`LEP` 40,221 · `SEPP` 743 · other 0**
(`p14-sepp-census.json`). **The state already replicates SEPP height controls onto the principal
layer.** An engine reading Principal/14 has been reading SEPP heights all along; it simply could
not *say* so, because it never read `EPI_TYPE`.

Sampling an interior point of every SEPP-service HOB polygon and asking Principal/14 what is there
(`sepp-overlap2.json` Q1, 94 polygons):

- seven layers → **one** P14 hit, SEPP-drawn, **same value, 100% of samples**;
- layer 134 → **two** P14 hits on 4 of 5 — *the real LEP+SEPP stack, and it arrives as two rows of
  one layer*, which a precedence engine partitioning by LAYER cannot see;
- layer 799 → different value on 4 of 4 — a genuinely additional control;
- layer 718 → **no** P14 polygon at all.

> ⛔ **Fetching all ten SEPP HOB layers would have manufactured a second BASE control on ~1.8% of
> NSW parcels and driven them to a status-D refusal.** The visible symptom of getting this wrong is
> not a wrong number — it is a REFUSAL on parcels that were answerable. **A regression dressed as
> coverage is the hardest kind to notice**, and it would have shipped under the banner of closing an
> acceptance criterion.

### 1.3 — Precedence is a registry of read sentences, never a rule about `EPI_TYPE`

All four precinct SEPPs state it themselves, verbatim, from `legislation.nsw.gov.au` fetched
2026-09-04 (`lep-text-probe2.json`):

> *"…section 74(1) of the Act, in the event of an inconsistency between this Chapter and another
> environmental planning instrument … **this Chapter prevails to the extent of the inconsistency**."*

⛔ **`EPI_TYPE === 'SEPP' ⇒ wins` is tightest-number-wins wearing a statutory costume.** Three
measured reasons:

1. **Chapter scope.** Each says *"THIS CHAPTER"*. A SEPP with no such clause displaces nothing.
2. **Carve-outs are named and real.** Eastern Harbour City s 6.3 subordinates its own precedence
   *"subject to section 36 (4) of the Act"* — **and s 36(4) has not been read**, so that row is
   recorded as a partial reading rather than a clean win. Central River City s 4.3 excepts SEPP
   No 55 by name.
3. **The direction is not always displacement.** Western Parkland City s 4.4(2) and
   Regional s 3.4(2) say *"a local environmental plan **does not apply** to land shown on the Land
   Application Map"* — disapplication, not tie-breaking. ⚠ That map is **not fetched**, so the
   engine acts on the weaker s 4.4(1) reading and says so.
4. Regional s 5.9(2) subordinates that chapter to SEPP (State and Regional Development) 2011 —
   **precedence is a partial order, not a hierarchy of two.** Two prevailing SEPPs therefore
   **refuse**.

`nswResolveInstrumentContest` is handed instrument identities and **no values**, deliberately, so a
future edit cannot reach for a tie-break even by accident. The pair of fixture parcels proves why:

| Parcel | LEP | SEPP | Governs |
|---|---|---|---|
| `hornsby-ehc-stack` | Hornsby LEP 2013 · **8.5 m** | Eastern Harbour City 2021 · **9.5 m** | SEPP — **the larger** |
| `parramatta-north-ssp-stack` | Parramatta LEP 2023 · **20 m** | Central River City 2021 · **6** | (would be the smaller) |

A "conservative" tie-break is wrong by a metre on the first and by fourteen on the second.

### 1.4 — What happens when the SEPP applies and cannot be read

`parramatta-north-ssp-stack`'s SEPP row serves `UNITS: null`, so it never reaches the base
partition and **no contest fires**. The parcel still must not resolve LEP-alone. It emits 20 m
with `envelopeIsUpperBound = true`, `publishable = false`, and an explanation naming the policy:
*"A STATE ENVIRONMENTAL PLANNING POLICY APPLIES HERE AND COULD NOT BE EVALUATED."*

> ⚠ **This case nearly passed for the wrong reason.** A test asserting *"the SEPP wins"* would have
> been asserting a mechanism that does not fire on this parcel. The property that must hold is
> weaker and more important than the one it is tempting to write.

### 1.5 — Two traps the SEPP schema sets

- **`LAY_CLASS` on the modern schema is a symbology BAND, not a value** — `"80-99.9"`, `"5-5.99"`.
  `nswNumber` already rejects it (safe), and that is a **16-metre loss**: the captured row carries
  `LABEL: "96"`. `nswBandedValue` reads `LABEL` **only when it falls inside its own band** — two
  independent readings agreeing. A label outside its band **refuses**; picking a winner discards
  the warning. ⚠ `LABEL` is not always a number: on layer 718 it reads `"S"`.
- **Layer 718's datum is contested by its own attributes.** `LAY_NAME "Maximum Building Height (m)"`
  and `UNITS "m"` against `MAP_TYPE "RDL"` and `MAP_NAME "…Reduced Level Map"`, where a *reduced
  level* is an AHD elevation. CRC Appendix s 18 names the two maps separately. **Three readings say
  AHD and two say metres; a 3–2 vote is not a determination.** Reported, not applied. At Sydney
  Olympic Park the difference is the whole ground elevation.

---

## 2 — ⛔ The layer-429 correction: the third reading, and the first one with a clause

**Byron LEP 2014 cl 4.3A** (`legislation.nsw.gov.au` epi-2014-0297, fetched 2026-09-04):

> *"(2) This clause applies to land identified as "Minimum Level Australian Height Datum (AHD)" on
> the Building Height Allowance Map. **(3) The maximum height of a building on land to which this
> clause applies is to be measured FROM the minimum level AHD permitted for that land** on the
> Building Height Allowance Map."*

It is a **MEASUREMENT DATUM SUBSTITUTION** — a fifth axis alongside envelope-top / floor-level /
plane / none. The history:

| Round | Reading | Verdict |
|---|---|---|
| 1–2 | additive height allowance → `8.5 + 2.1` | right arithmetic, **wrong mechanism** |
| 3 | *"a minimum floor level, off-axis; ignoring it overstates nothing"* | **wrong**, and confidently so |
| 4 | the origin the maximum height is measured from | the clause says it outright |

> ⭐ **Round 3 wrote of round 2: *"a guard aimed at the wrong property protects nothing."* The same
> sentence applies to round 3.** `offAxis` means *ignoring this overstates nothing*, and that is
> false for a datum: reporting "8.5 m above existing ground level" is wrong by
> `(datum level − ground level)` **in whichever direction the site slopes**. The error runs BOTH
> ways, so it is not covered by `envelopeIsUpperBound`, which asserts "could only be lower".

⚠ **And layer 469 is a genuinely different control** — Singleton LEP 2013 cl 7.1 really does bind
the *finished floor* level. Round 3 mapped both `LAY_NAME` strings to one constant. They differ by
more than the layer id, which is why a closed vocabulary can tell them apart and
`.includes('Minimum')` never could.

**Consequence, stated plainly: the fixture parcel `152//DP877246` (BALLINA) now REFUSES where it
used to report 8.5 m.** Ballina's clause has not been read; only Byron's has. That is a coverage
loss and a truth gain, and it has its escape hatch (**L-942**): the Byron branch resolves, to
`RL 2.1 + 8.5 = 10.6 m AHD`. One row of legal reading closes Ballina.

> ⛔ **The temptation to copy Byron's citation across is the entire failure mode of this lane.** The
> served attributes are byte-identical on all 203 rows and the clause reads cleanly. Copying it
> would be a claim about Ballina's instrument made from Byron's.

---

## 3 — s10.7(2): the harness cannot be built as specified, and here is the proof

**Probed live** (`s107-oracle-probe.json`, `scripts/s107-oracle.mjs`).

- The NSW Planning Portal publishes an **Online Section 10.7 Planning Certificate Service API**.
- `planningportal.nsw.gov.au/API`: *"**APIs require a unique subscription key to be accessed.**
  … To request a subscription key, please email [the department]."*
- Its own page: *"The **outbound** API enables a **council** to receive the Section 10.7 requests
  submitted by the applicant … directly into **their IT system**. … **Councils will issue** the 10.7
  Certificate and publish them via the … APIs."*

⛔ **It is a request/issue pipe between the Portal and a council's system, not a public read
endpoint.** There is no "GET the 10.7 for lot X" for a third party; a certificate is issued per
request, to the applicant, for a fee. Every guessed public data path returned an API-gateway 404
(`FetchEPILayers`, `FetchGeometry`, `FetchLandusePermissibility`, `GetPrincipalPlanningLayers` — all
`{"statusCode":404}` on a host that answers `OnlineDA` fine).

⚠ **Round 3's council-side hope also failed, and was measured rather than assumed.** City of Sydney
publishes 196 AGOL services and **not one of them carries the LEP height or FSR** — its
`Planning_Controls` layer is 60 DCP *areas* with `AreaNo`/`Description` and no values
(`sydney-planning-controls.json`; the probe's `parcels` block is empty because nothing matched).

**Decomposition (L-716).** Per §IDENTITY-BOOTSTRAP-GATE, an access-gated channel gets an offline
substitute and a deferred stub — never a permanently red gate. The reachable oracle is §4.

**Unblock, founder-channel:** request a subscription key for the Online s10.7 Service API and
confirm whether any read scope exists for a non-council subscriber. That is outside a lane's
authority to ask.

---

## 4 — The DA cross-reference, made a CI check — and a cause the brief did not list

`api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA` is **open, unauthenticated and free**. 1,841 City
of Sydney applications determined in 2025; **356** carry a storey count and a served X/Y.

| verdict | n |
|---|---:|
| within the DCP storey polygon | 224 |
| **exceeds** it | **100** |
| no DCP storey polygon at the point | 29 |
| DCP storeys non-numeric (`">15"`) | 3 |

⭐ **Of the 100 exceedances: 88 are exactly +1 storey, and 88 are "Alterations or additions to an
existing building". The cl 4.6 variation flag is `Y` on only 50.**

> ⭐ **The brief named three causes — a missing SEPP override, an unapplied incentive, a wrong
> measurement convention — and the measurement supports a FOURTH it did not name: a development
> control plan is not a development standard.** A DCP is a guideline; cl 4.6 variations attach to
> LEP standards (the metric height), not to DCP controls, so a consent authority may depart from a
> DCP storey map **on merit, with no variation of any kind**. That is why half the exceedances carry
> `EPIVariationProposedFlag = N` and were approved anyway, and why the modal case is a terrace
> gaining one storey in a "2 storeys" area.

⛔ So *"approved above resolved"* is **not** a defect signal on its own, and a gate treating it as
one would fire 100 times a year in one LGA and be muted within a week. What survives is the residue
the guideline reading does not explain — **not an alteration, and two or more storeys over**:

| PAN | council ref | storeys vs DCP | HOB (carried, **not compared**) | cl 4.6 |
|---|---|---|---|---|
| PAN-438096 | D/2024/407 | 3 vs 1 | 7.5 m | N |
| PAN-348746 | D/2023/707 | 6 vs 4 | 15 m | **Y** |
| PAN-537107 | D/2020/1457/A | **6 vs 2** | **53.1 m(RL)** | N |
| PAN-515132 | D/2025/184 | **8 vs 3** | 12 m | N |

`tools/ga-gate/check-nsw-da-crossref.ts` — ARM A (no unit conversion, hard-0, **including a
source-level guard against the code acquiring a floor-to-floor constant**), ARM B (`">15"` is never
15, hard-0), ARM C (the four above, shrink-only). Three teeth. First reading **RC=0**.

> ⛔ **ARM C falls by INVESTIGATING a row, never by narrowing the filter.** Adding *"…and not a
> residential flat building"* takes it to 1 and is the forbidden fix wearing a predicate.

⚠ **The comparison is storeys-against-storeys only.** The DA feed carries **no metric height at
all** (asserted on the captured record set). Reading "8 storeys against 12 m" as a contradiction
requires a floor-to-floor assumption the gate refuses to make; the HOB is printed so a human with
that judgement can exercise it.

---

## 5 — The clause registry: schema, signing workflow, and a ratchet that was closable by prose

**15 unsigned draft rows, 12 ready for a signer, 0 signed.** Every `verbatim` is a substring of a
committed live capture; nothing is recalled from memory.

New in the schema: `service` (SEPP layer ids are an independent namespace), `verbatim` (the
sentence, so a reader checks the law and not this file's paraphrase), and the `DATUM` role.

Clauses read this round, several of which **overturn a round-3 note**:

| Control | Clause | What changed |
|---|---|---|
| Burwood Building Height Plane | **cl 4.3A** | round 3 said the clause was unresolvable — *"0 hits"* in the **XML export**. The consolidated HTML has it. §GREP-SILENCE-HAS-THREE-CAUSES: the silence was the channel. |
| Wollongong Sun Plane Protection | **cl 8.3** | round 3 said the angle was *"derivable from solar geometry"*. **It is stated**: 32 m above the point, and a function of `D` within 26.4 m of Burelli St. ⚠ The formula is MathML the text-strip dropped — a hole in the **capture**, named rather than approximated. |
| Wollongong Overshadowing | **cl 7.20** | ⭐ **the polygons are the EXEMPTIONS.** `LAY_CLASS "C1 Brick Chimney Stack - 29m"` is an *existing structure excused* from the prohibition. Parsing 29 as a cap would have imposed a limit sourced from someone else's chimney. |
| Singleton Floor Height Restriction | **cl 7.1** | the one round-3 verdict the clause **confirms**. |
| Byron Building Height Allowance | **cl 4.3A** | §2 above. |
| SEPP Incentive HOB / FSR (799 / 800) | **WPC 2021 s 6.16(3)–(4)** | *"Despite section 4.3 … resulting from **incentivised development**"* — CONDITIONAL, never an entitlement. ⚠ Keyed on `EPI_NAME` (the 2021 instrument), not the map's 2006 title. |
| SEPP Obstacle Limitation Surface (278) | **WPC 2021 s 4.22** | ⛔ **states no height**: a discretionary prohibition triggered by a *controlled activity* under Commonwealth aviation law. |

### 5.1 — ⛔ The ratchet was satisfiable by the thing it exists to demand

Arm C of `check-nsw-citation-arms.ts` counted `citation.state === 'absent'`. An **unsigned** draft
moves a control to `registry-unsigned`, which the old predicate scored as **closed**.

> ⭐ **That let the ledger be driven to zero by prose — by the author of the prose — with no human
> having read the instrument.** A ratchet a writer can close by writing is a ratchet measuring its
> own author. Corrected to `!nswMayPublish(state)`, with a tooth (**T-C**) asserting the *predicate*
> rather than an outcome, so it cannot go vacuous as the registry grows drafts.

The two predicates are deliberately different and both are right: `nswMayContributeValue` admits an
unsigned draft (it may drive the **engine**, so the computation can be reviewed);
`nswMayPublish` does not (it may not close the **ledger**). **Count unchanged at 4/4** — the
correction cost nothing and closed a hole.

The gate now prints the signing queue on every run: *"0 signed rows means status A is unreachable
for every NSW parcel whose control depends on the registry."*

---

## 6 — Sydney DCP: two intersecting constraints, and never a conversion

`Sydney_Development_Control_Plan_2012/FeatureServer` — **3,592** storey polygons (layer 7, 17
distinct values), **1,214** more (layer 5), **311 + 133** mapped setbacks across 50 distinct type
strings.

The LEP says `9 m`. The DCP says `Storeys: "2"`. **Both bind. Neither implies the other.**

> ⛔⛔ **The one forbidden move is a floor-to-floor assumption.** `metres / 3.1` is a design decision
> dressed as arithmetic, wrong in both directions: it invents a storey the DCP forbids on a generous
> section and deletes one it permits on a tight one. `nswDcpStoreys.ts` therefore contains **no
> function that converts between the axes**, and a test plus a gate arm keep it that way.

⭐ **Lane PT reports the identical structure from RGEU art. 65. Two jurisdictions makes this a
platform concern** — the shared envelope model needs a storey axis, rather than each rulepack
inventing a conversion. The module is shaped as the NSW instance of a general type so promotion
costs a move, not a rewrite.

Two vocabularies that punish a careless reader:

- **`Storeys` is not numeric.** `">15"` on 38 polygons, `"Existing height"` on 2, `null` on 1.
  `parseInt(">15")` is `NaN`; `Number(">15")` is `NaN`; **`">15".replace(/\D/g,'')` is `15`** — the
  dangerous one, because it looks right. `">15"` means *the DCP declines to state a ceiling here
  because the metric height is doing the work*; it is neither 15 nor unlimited.
- **`SetbackType` mixes four different controls.** `"4m Build to alignment"` is an **obligation to
  build TO the line** — the inverse of a setback, and reading it as one shrinks the footprint by 4 m
  on a site where the plan requires the opposite. `"…Setback - Footpath widening"` is an exclusion
  strip (the Murcia *cesión* shape). `"Upper level setback"` does **not** bar building at ground
  level and its trigger level is not served. A regex over the number conflates all four.

---

## 7 — Elevation licence: an open port is not a grant

**Probed every machine-readable place a licence can live** (`elevation-licence-probe.json`,
`licence-ckan-probe.json`, `licence-ckan-fsdf.json`).

| Where | What it says |
|---|---|
| service `copyrightText` (Map + Feature) | **empty string** |
| layer `copyrightText` (SpotHeight, Contour) | **empty string** |
| `/info/iteminfo` `licenseInfo` | **empty string** |
| ArcGIS portal item `licenseInfo` | HTML that strips to two link labels — *"Terms of Service"*, *"Copyright"*. **No inline terms.** |
| portal item `accessInformation` | a © attribution string. **Not a grant.** |
| **data.nsw CKAN — the live service dataset** | **`license_id: "notspecified"` · "License Not Specified"** |
| data.nsw CKAN — *Theme Profile*, *Point Cloud*, *Contours*, *Relative Heights* | `cc-by` — **but their only resources are PDF documents** |

> ⭐ **THE TRAP, AND IT IS A GOOD ONE.** A careless reader searches data.nsw, finds **CC-BY**, and
> ships. Those CC-BY records are **datasets whose resources are PDFs describing the data**. The
> record for the *live REST service PRYZM would actually read* says **License Not Specified**.
> CC-BY on a document about the data is not CC-BY on the data.

**Verdict: `licence-unverified`. Do not design around it.** NSW terrain stays unavailable to the
envelope pipeline; nothing in this lane consumes it.

**What would close it** (founder-channel, one reading each):
`https://portal.spatial.nsw.gov.au/portal/apps/sites/#/homepage/pages/terms-of-service` and
`https://www.spatial.nsw.gov.au/copyright`. ⛔ A lane may not assert a licence from a page it has
not been authorised to accept on the founder's behalf.

---

## 8 — `NSW-CITATION-DECISION.md` §8, updated

| §13 criterion | Round 3 | Round 4 |
|---|---|---|
| A SEPP-covered parcel is never resolved LEP-alone | ⛔ NOT BUILT | ✅ **built** — `EPI_TYPE` + a precedence registry of read sentences; 63 tests |
| The 10.7 certificate CI check | ⛔ NOT BUILT | 🟠 **re-specified** — the s10.7 API is subscription-key gated and is a council integration pipe; decomposed onto the DA cross-reference, which **is** a CI check |
| CI: no value without a clause citation | 🟠 re-specified | 🟠 **and Arm C's predicate corrected** — an unsigned draft no longer closes the ledger |
| `m(RL)` never treated as height-above-ground | ✅ | ✅ **and extended** — layer 718's contested datum refuses rather than guessing |
| Conditional Incentive HOB → base + unapplied uplift | ✅ | ✅ **and extended to the SEPP incentive** (s 6.16), value 96 recovered from `LABEL` and never applied |

---

## 9 — What the founder is being asked to decide

1. **Accept that the fixture parcel `152//DP877246` now refuses.** It is the correct answer and it
   is a visible coverage loss. Closing it is one clause of Ballina LEP 2012.
2. **Fund the signing.** 12 draft rows are complete and waiting for a named human. **Zero signed
   rows means status A is unreachable for every NSW parcel whose control depends on the registry.**
   This is hours of legal reading against fully-quoted clause text, not a research programme.
3. **Request the s10.7 subscription key**, or accept the DA cross-reference as the standing oracle.
4. **Accept `licence-unverified` for NSW elevation**, or authorise someone to read and accept the
   two Spatial Services pages.
5. **Promote the storey axis to the shared envelope model.** NSW and PT both need it; the second
   jurisdiction is what makes it a platform decision rather than a rulepack detail.
