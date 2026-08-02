# DATASET DISCOVERY PROTOCOL — Stage 0 of every new municipality

**Status**: **APPROVED AND MANDATORY** (founder, Envelope Compiler programme, 2026-08-02) — *"The compiler
should discover datasets before engineers invent geometry. This should become **Stage 0 of every new
municipality**."*
**Scope**: every municipality entering the onboarding pipeline, and every derived capability proposed for one.
**Tool**: [`tools/dataset-discovery/`](../../../tools/dataset-discovery/) — `discover.mjs` · `classify.mjs` ·
`capabilities.mjs` · `taxonomy.mjs` · `discover.test.ts` (51 tests, offline over captured fixtures).

**Related**: [ADR-0290](../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md)
(**the invariant this protocol discharges**) · [ADR-0288](../../02-decisions/adrs/ADR-0288-machine-readable-is-not-publishable.md)
(**machine-readable ≠ publishable — the two scores never merge**) ·
[ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) ·
[ADR-0284](../../02-decisions/adrs/ADR-0284-derived-geometry-permissible-derived-law-is-not.md) ·
[ADR-0285](../../02-decisions/adrs/ADR-0285-computing-an-observable-criterion-is-implementation.md) (the
four-part test Stage 0 pre-fills but cannot answer) ·
[MACHINE-READABLE-EVIDENCE-REGISTER.md](./MACHINE-READABLE-EVIDENCE-REGISTER.md) (**what Stage 0 populates**) ·
[PROBE-DISCIPLINE.md](./PROBE-DISCIPLINE.md) · [BLOCKER-CLASSIFICATION-STANDARD.md](./BLOCKER-CLASSIFICATION-STANDARD.md) ·
[DECISION-REGISTER.md](./DECISION-REGISTER.md)

---

## Why this exists

Three authoritative datasets were found **by hand** in 48 hours, each of them *after* we had already begun
building the thing it made unnecessary:

| # | What we were about to build | What already existed, published, unsearched |
|---|---|---|
| 1 | a street-width construction, on the assumption Murcia published no alignments | **`Murcia:pgou_alineaciones`** — block-level alignment polygons, the exact datum the PGOU measures between |
| 2 | a refusal filed as a *missing-data* blocker | **`Murcia:pgou_eje_comercial`** — a published layer we simply never query. A live 0.7 % refusal rate that is **engineering, not absent data** |
| 3 | a cadastral-dissolve engine for block rings | **`idecordoba:manzana`** — **20 730** published blocks covering **92.9 %** of ordenanza polygons. Under ADR-0283 published geometry outranks our reconstruction, so the dissolve drops to *fallback* |

> *"**PRYZM currently discovers datasets manually. That does not scale.**"* — the founder

The failure was never analytical. **Nobody looked, because looking was not a required step.** This protocol
makes it one.

---

## §1 — What Stage 0 is, and what it must never become

**Stage 0 answers exactly one question: _what does this municipality publish, and how well can we read it?_**

| Question | Answered by |
|---|---|
| What is published, and can we read it? | **Stage 0 — this protocol** |
| Have we already tried? | the evidence register's `Closed` rows |
| Does this layer *supply* a planning variable? | **a human + the ordinance**, via the ADR-0285 four-part test |
| May we publish a determination from it? | **ADR-0288 + ADR-0283 — never Stage 0** |

Three prohibitions, enforced in code and pinned by test:

1. ⛔ **Stage 0 never resolves a variable.** Every variable it emits carries `status: 'candidate'`. *A layer
   that could supply a variable is a **candidate**, never a resolution.*
2. ⛔ **Stage 0 never emits a publication verdict.** Every record carries
   `publishable: 'not-assessed-by-discovery'`, a constant. The tool is *structurally* incapable of the
   question (ADR-0288).
3. ⛔ **Stage 0 never merges its two scores.** `assertScoresNotMerged()` throws if a record grows an
   `overallScore` / `qualityScore` / `confidence`. A future "let's just add them" refactor fails CI.

---

## §2 — The probe order

Stage 0 runs in a fixed order, cheapest and most decisive first. **Each step has an exit criterion**; a step
without one is an open-ended search, which is *"indistinguishable from an unstarted one"*.

### S0.1 · Enumerate services
Probe every **declared** endpoint, plus the standard sweep paths on every candidate host
(`/geoserver/{wfs,wms}`, `/{wfs,wms}`, `/arcgis/rest/services`, `/server/rest/services`,
`/ogcapi/collections`). Record the ProbeRecord (§3) for each.
**Exit**: every declared endpoint and candidate host has a recorded outcome — `ok`, `http-error`,
`network-error` or `timeout`.

### S0.2 · ⚠ Verify locality BEFORE believing a service name
Reproject the service's own extent (`fullExtent` / `ows:WGS84BoundingBox` / `EX_GeographicBoundingBox`) to
WGS84 and measure the distance to the municipality centroid. See §5 trap 1.
**Exit**: a verdict of `local` · `regional` · `contains-but-broad` · `far` · `unknown` — with the reprojection
route named.

### S0.3 · Enumerate layers
Every advertised layer: name, title, abstract, keywords, CRS, extent, and which services advertise it.
**One row per dataset**, merged across WFS/WMS by `(publisher, layer name)` — the same key the evidence
register uses. A **WMS-only** name is preserved and flagged, not hidden: COACo's WMS advertises `areas`,
`parcelario_urbanismo` and `actuaciones_tramitado`, none of which its WFS serves.
**Exit**: a complete inventory. **Nothing is dropped** — a `Closed` row is only defensible if the thing it
closes was actually looked at.

### S0.4 · Classify
Match the normalised (de-accented, separator-split) name + title + abstract + keywords against the planning
vocabulary in `taxonomy.mjs`. Emit: `kind` · candidate planning variables · instrument markers · caveats.
**Exit**: every layer has a `kind` and a candidate list, possibly empty.

### S0.5 · Deep-probe the triage head
For the top *N* by triage rank: `DescribeFeatureType` (→ geometry type + typed attributes) and a feature
count via the **axis-order ladder** (§5 trap 3).
**Exit**: for each probed layer, either a measured count or a *typed* unknown. Default `N = 30`; §9 measures
why 20–30 is the right depth.

### S0.6 · Score
Two independent axes plus a reusable-geometry flag (§4).
**Exit**: both axes present on every record, each self-reporting whether it is a **lower bound**.

### S0.7 · Emit
`<city>.discovery.json` (full evidence, every probe) · `<city>.discovery.md` (human triage table) · draft rows
for the evidence register (§7) · a **cold-start record** (§8).
**Exit**: a human has reviewed the top 20 and moved rows into the evidence register.

---

## §3 — What is recorded for every probe

> **Failure ≠ empty.** A 403 / 499 / timeout / DNS error is **UNKNOWN**, never "no data"
> (L-422/457/467/469 · PROBE-DISCIPLINE R5).

Every HTTP call emits, without exception:

| field | why |
|---|---|
| `url` | the probe must be reproducible by anyone, from the record alone |
| `httpStatus` | `null` when the request never completed — distinct from `200` and from `404` |
| `contentType` | a `text/html` body from a WFS endpoint is a portal, not a service |
| `bytes` | Córdoba's 41 dead CUS sheets are **69-byte** "Server under construction" pages that return **HTTP 200**. Only the byte count exposes them |
| `ms` | cost accounting, and a timeout's shape |
| `outcome` | `ok` · `http-error` · `network-error` · `timeout` — **the last two assert nothing about the data** |

**Counted separately, always**: network errors, refusals and genuine empties are three different facts, and
folding any of them into a rate makes it a lie.

---

## §4 — The scoring model

### Machine-readability — five bits, about **access only**

| bit | meaning |
|---|---|
| `advertised` | appears in a capabilities document |
| `featureQueryable` | queryable as **features** (WFS / OGC-API / ArcGIS), not WMS-only |
| `schemaRetrievable` | `DescribeFeatureType` returns a typed schema |
| `featuresReturn` | features actually return, **after the axis-order ladder** |
| `semanticAttributes` | carries attributes beyond an id/geometry column |

Each bit is `true`, `false` (**probed** and negative), or `null` (**not probed**). ⚠ **`null` never becomes
`false`.** With any bit unprobed the score reports `isLowerBound: true` and names the gaps — it is a **floor**,
not a measurement (PROBE-DISCIPLINE R8), and is printed with a `⌊` marker.

### Legal authority — five bits, about **standing only**

| bit | meaning |
|---|---|
| `competentPublisher` | the publisher is a competent planning authority **per a declared registry** — never inferred from a hostname |
| `namedInstrument` | attributed to a named instrument (`pgou`, `plan parcial`, `ordenanza`, …) |
| `instrumentDated` | an edition/date/version is asserted |
| `normativeObject` | depicts a normative object, not base cartography or an inventory |
| `featureLevelCitation` | an attribute carries a per-feature legal reference (`articulo`, `ficha`, `link`, …) |

> ⚠⚠ **A 5/5 here authorises nothing.** It means *"this looks like the publisher's own depiction of an
> in-force instrument"*. It does **not** mean the instrument **grants** the determination we want to publish —
> ADR-0288 condition 2, the exact inference Madrid's `PG_ANALISIS_EDIFICACION` is frozen on.

**The axes share no input.** The bit rosters are disjoint and a test asserts it. A layer can score
**1.00 machine-readability / 0.20 legal authority** — which is precisely what `idecordoba:manzana` does, and
precisely why the separation exists.

### Reusable geometry — a flag, not a score

`true` when the layer is a persistent spatial partition (block, parcel, footprint, boundary) that the compiler
can consume as scaffolding, **regardless of legal authority**. This is the Córdoba `manzana` insight promoted
to a first-class output: ADR-0284 permits derived **geometry** while forbidding derived **law**, and ADR-0283
ranks published geometry above our own reconstruction.

### Triage rank — ⚠ **not a score**

A sortable composite of planning relevance × machine-readability, used to order a 289-layer GeoServer for a
human. It **contains no legal-authority term** (a test proves the rank is identical for the same layer under a
competent and a non-competent publisher, while the LA axis differs). It never enters a publication decision,
a coverage number, or a C63 axis.

### Suggested integrations

Every record proposes at least one action, and **every action names an exit criterion** — *"investigate
further" is not an action* (evidence-register rule 4). For an ADR-0285-eligible variable the record carries
the four-part test with parts 1 and 2 marked **HUMAN — read the instrument**, part 3 partially pre-answered
from publisher standing and locality, and part 4 marked as engineering.

---

## §5 — The five traps, and the guard for each

Each of these cost real time in the last 48 hours. Each is now a coded guard with a test.

### Trap 1 · The acronym collision
`GMU_Services` looked like *Gerencia Municipal de Urbanismo Córdoba*. It was **George Mason University,
Virginia — 6 148 km away**, caught only by reprojecting `fullExtent`.
**Guard**: reproject every extent (Web Mercator, ETRS89/ED50/WGS84-UTM, WGS84) and measure. `> 300 km` ⇒
`far`, quarantined. **Plus** a *declared* publisher registry — competence is never inferred from a URL.
**⚠ The asymmetry**: an extent we **cannot** reproject is `unknown`, **never** `far`. Refusing to verify and
declaring a collision are different findings.

### Trap 2 · The publisher's own broken metadata *(new — found by this tool, 2026-08-02)*
`Murcia:pgou_mpg` publishes **EPSG:25830 metres inside `<ows:WGS84BoundingBox>`**, which the spec defines as
degrees. Read literally it is 11 955 km away, and the naive gate quarantined **a genuine *modificaciones
puntuales del PGOU* layer**. `Murcia:tranvia_lineas` publishes a 1-metre extent on the equator — Null Island.
**A false quarantine is a false negative, the most expensive error this tool can make (ADR-0290).**
**Guard**: `sanitiseWgs84Bbox()` — an out-of-range "WGS84" extent is reinterpreted via the layer's declared
native CRS; a Null-Island or point-sized (< ~11 m) extent is `unknown`. Neither may ever become `far`. A
layer reading `far` inside a service that is itself local is downgraded to `extent-contradicts-service` —
flagged, **not** quarantined. Four Murcia layers are repaired this way on every run.

### Trap 3 · The axis-order artefact
Córdoba's first `manzana` query returned **0 features**. It was a WFS axis-order bug, not absence, and it was
verified across five bbox forms before anything was recorded.
**Guard**: count the **whole layer** first (no bbox ⇒ no axis ambiguity). Only if that fails, walk a
six-rung ladder: `urn:…EPSG::4326` (lat,lon) · `EPSG:4326` (lon,lat) · `CRS84` · bare lon,lat · bare lat,lon ·
native CRS. **Zero is reported only when every rung returned HTTP 200 with 0.** Any other mixture is
`unknown-mixed-ladder` with a `null` count, and the whole ladder trace ships in the report.

### Trap 4 · The plausible proxy
`sup_viales` yielded a believable **9.12 m** median street width and was still wrong — it is the *callejero*
(physical street surface), a different **legal object** from an *alineación*. *"Plausible, which is the trap."*
**Guard**: the `vial` term maps to `street-surface` and **deliberately not** to `street-width`; a test asserts
that mapping can never be added, because the substitution changes the criterion and is derived **law**
(ADR-0284). The caveat prints on every hit, forever. Institutional memory lives in the dictionary, not in the
reviewer's head.

### Trap 6 · Temporal validity — the unsafe direction
Murcia's planning layers carry `f_inicial` / `f_fin`, with **`f_fin = 2999-12-30Z` as the "still in force"
sentinel**. If a publisher serves superseded geometry *alongside* current geometry in one layer and the
compiler does not filter the end date, **it computes an envelope from a repealed alignment — which
over-grants (the L-616 direction, the unsafe one).**
**Guard**: `detectTemporalValidity()` classifies attributes into validity **end** fields (the ones that can
over-grant), **start** fields, and ambiguous date-like fields, and emits a per-layer
**`temporalFilteringRequired`** flag — hoisted to the record's top level so a consumer cannot miss it. ⚠ It
is a **tristate**: `null` when the schema was not retrieved, because *not probed ≠ not present*. Stage 0
flags that a filter is **required**; it never decides what the filter should be, because which edition is in
force is a legal question (ADR-0284).
**Measured on Murcia, 2026-08-02** — `f_fin > today` returns **23 066 / 23 066** alineaciones, **3 611 /
3 611** sectores, **69 / 69** ejes comerciales; `f_fin < today` returns **0** for all three. Murcia publishes
superseded editions as *separate layers* (`_2001`/`_2007`/`_2012`), not as expired rows. **So the risk is
latent here, not live** — see the operational note in §12.

### Trap 5 · The superseded edition
Murcia publishes `pgou_alineaciones` beside `_2001`, `_2007` and `_2012`. Binding the wrong one publishes
**repealed law**.
**Guard**: an edition suffix raises `superseded-edition-suspect`. ⚠ Note the honest consequence: the historic
editions score *higher* on legal authority (they assert a date), which is correct and is exactly why the flag,
not the score, carries the warning.

---

## §6 — How a negative is PROVEN

> ## ⚠⚠ A ZERO-RESULT PROBE IS NOT A NEGATIVE
>
> *"**This is the single biggest threat to Probe C, because Probe C's output is a count of cities with
> nothing.** A missed service and an absent service produce identical records, and nothing downstream
> will flag it."*
>
> **A negative resting on an untested axis order, an unverified CRS, or an unexercised alternate
> parameterisation is not a negative.** Any zero-result probe **must** retry across the axis/CRS matrix
> before it may emit one.

ADR-0290 requires that a negative be **measured**, not assumed. A Stage 0 pass may conclude *"no
machine-readable source exists"* only when **all** hold:

1. Every declared endpoint and candidate host has a recorded ProbeRecord — including the ones that failed.
2. Every failure is classified as `UNKNOWN`, and the conclusion **does not rest on any of them**. A negative
   built on a 403 is not a negative.
3. Every enumerated layer has been classified — including the boring ones.
4. ⚠ **Every zero feature-count survived the full axis/CRS matrix** — *both* axis orders **and** both CRS
   families must have **answered**, not merely been sent. `countFeatures()` returns
   `unknown-matrix-incomplete` when they did not, and the count stays `null`. **A whole-layer query
   returning 0 is no longer sufficient on its own** — that single-query shortcut was the defect, and it is
   removed.
5. ⚠ **Every extent-based quarantine survived §5 trap 2** — a mislabelled or degenerate published bbox
   resolves to `unknown`, never `far`.
6. ⚠ **Every layer carrying a validity end-date was either filtered or flagged** (§5 trap 6). Coverage
   measured over unfiltered temporal data is unproven in *both* directions.
7. The remaining `UNKNOWN`s are **named**, with the concrete next action and its owner.

**Conditions 4–6 are the ones the tool found in itself.** Each was a case where an *absent* result and a
*missed* result were indistinguishable — which is precisely the class that cannot be caught downstream,
because both produce the same record.

**The stopping rule.** A Stage 0 pass is **one-shot and time-boxed**. Córdoba's six-avenue sweep is the
reference shape — exhaustive, evidenced, concluded once. If the exit criteria above are met, the negative is
recorded and **the row does not reopen without new evidence**.

⚠ **A proven negative is a successful outcome.** It converts a blocker from *engineering* to *data
acquisition* — which is what Córdoba's blocker 22 became, and why the correct next action there is **one
email to GMU**, not a vectorisation sprint.

---

## §7 — How Stage 0 populates the evidence register

The [MACHINE-READABLE EVIDENCE REGISTER](./MACHINE-READABLE-EVIDENCE-REGISTER.md) is the **mandatory first
check**; Stage 0 is what fills it.

- **Read the register first.** A Stage 0 pass over a dataset already recorded `Closed` is a process defect.
- **Stage 0 drafts rows; a human moves them in.** Rule 5 says a row does not change without evidence, and an
  agent's opinion is not evidence.
- **One row per dataset** — the tool's merge key is the register's key.
- **`Machine-readable`** is filled from the axis, and says `Partial/Unknown — <floor>` whenever bits are
  unprobed. It never rounds a floor up to `Yes`.
- ⛔ **`Publishable` is emitted as `not-assessed-by-discovery`, always.** Discovery cannot fill that column.
- **Rule 7 is honoured**: where a layer's geometry and its attributes differ in publishability, they are two
  rows. Stage 0 reports `geometryKind` and `semanticAttributeCount` separately so the split is visible.
- Layers with no candidate variable are drafted as `Closed` with the reason — the register's highest-value
  column.

---

## §8 — The cold-start record (Probe C)

> *"Its performance on virgin cities is itself a measurement — **log where it FAILS, not just what it
> finds**."* — founder, Addendum 1

Every run emits `pryzm.stage0.cold-start-record/1.0`, aggregable without re-running anything:

| field | values |
|---|---|
| `publishedGisService` | **`Yes` · `No` · `Unknown`** with evidence + basis |
| `digitalPgou` | ditto — ⚠ a **GIS-side** question only. `No` here says nothing about a scanned instrument |
| `vectorOrScanned` | `vector` · `raster-or-wms-only` · `none-found` · `Unknown` |
| `publisher` | `municipal` · `non-authority` · `Unknown` — from the **declared** registry |
| `cost` | `requests`, `wallClockMinutes`, `bytes`, `failedProbes`, `unknownProbes` |
| `undecided[]` | **equally weighted with the findings** — `endpoint-unreachable` · `auth-gated` · `timeout` · `schema-unrecognised` · `crs-unreprojectable` · `count-ladder-inconclusive` · `ambiguous-classification`, each with a count and detail |
| `tierSignal` | `tier-1-candidate` · `tier-3-candidate-via-gis` · `undetermined` |
| `knownLimitations[]` | shipped **inside** the record, so whoever aggregates it inherits the caveats |

⚠⚠ **Every headline fact is a tristate, never a boolean.** A boolean forces an unreachable endpoint to become
`false`. When every endpoint fails, the record says `publishedGisService: Unknown` and `tierSignal:
undetermined` — **an unknown may never be counted as tier 3.** A test pins this.

⚠ **The tier signal is a ceiling on the GIS route, not a determination.** Stage 0 never opens the ordinance,
so it cannot know whether the instrument *grants* a determination (ADR-0288). A `tier-1-candidate` may land at
tier 2 or 3 once the law is read; a `tier-3-candidate-via-gis` may still reach tier 2 from a scanned
instrument this probe never touched.

⚠ **`tierSignal.caveats` carries the publisher warning, and Córdoba is the live case.** The tier-1 test asks
whether an envelope variable is published as vector; it deliberately does **not** ask *who* published it,
because that is the legal-authority axis. So Córdoba reads `tier-1-candidate` on the strength of COACo's
layers — a **Colegio de Arquitectos**, a professional body hand-tracing a two-district pilot, **not the
planning authority**. Its measured envelope coverage is **0.0 %**. The caveat fires automatically whenever
*all* tier-1 evidence comes from a publisher declared non-competent, or from one whose competence is
undeclared. **An aggregator must not read `tier-1-candidate` as "the municipality publishes its plan as
vector".**

**Out of scope — País Vasco and Navarra.** INE prefixes `01` · `20` · `48` · `31` are excluded **before any
request is made**. They run their own cadastres under the foral regime: a separate adapter, **not** a coverage
gap, and letting one into a stratified sample would contaminate the tier estimate with a structural
difference masquerading as a data absence.

---

## §9 — Validation, measured

Two real cities, live, **2026-08-02**. The reviewable output is committed at
`tools/dataset-discovery/reports/` — `<city>.discovery.md` (triage table + draft register rows) and
`cold-start.jsonl`. The full multi-megabyte evidence dump is regenerable in seconds
(`node discover.mjs --city <c> --deep 30 --out reports`) and is deliberately not committed.

### ⭐ The acid test — the three datasets humans missed

> ## ⚠⚠ WHAT THIS TEST DOES AND DOES NOT SHOW — read before quoting any number below
>
> All three targets were **already-known discoveries**, found by hand and **held in context by the agent
> that wrote the vocabulary**. The test therefore demonstrates exactly one thing: **the tool does not miss
> known-good datasets.**
>
> It is **NOT evidence of recall on datasets nobody has found yet.** That number is unmeasured, and without
> a ground-truth inventory of what every city publishes it is **unmeasurable**. **A top-20 rank is not
> recall.** The tool prints this warning in the body of every report that runs an acid test, for the same
> reason it is here and not in a footnote.

| dataset | rank | of | percentile | kind | MR | LA | reusable | verdict |
|---|---:|---:|---:|---|---:|---:|:---:|---|
| `Murcia:pgou_eje_comercial` | **9** | 289 | 97.2 | normative | 1.00 | 0.60 | ✅ | ✅ top 20 |
| `Murcia:pgou_alineaciones` | **13** | 289 | 95.8 | normative | 1.00 | 0.80 | | ✅ top 20 |
| `idecordoba:manzana` | **14** | 120 | 89.2 | geometry | 1.00 | **0.20** | ✅ | ✅ top 20 |

**All three surfaced, in the top 20, from the capabilities documents alone** — before any deep probe. The
vocabulary was built **variable-first** (enumerate what an envelope compiler needs, then ask what a publisher
would call it), **not** by writing patterns that match the three answers. Nothing was tuned after the first
run; the only post-run changes were the two bug fixes in §5 trap 2 and §9's parser fixes, both of which
*reduce* false quarantines rather than promote targets.

**Independent corroboration of the counts.** The tool re-derived, without being told them:
`idecordoba:manzana` = **20 730**, `Murcia:pgou_alineaciones` = **23 066**, `idecordoba:sup_viales` = **6 529**,
`coaco:ordenanzas` = **453** — every one matching the hand-run dossier figures exactly.

**And the separation held on the case that matters.** `idecordoba:manzana` scores **1.00 readability / 0.20
legal authority** with `reusableGeometry: true`. That is the ADR-0288 distinction doing real work: the layer is
perfectly readable, is the best available block geometry, and **authorises nothing**.

### False-negative rate — and its honest denominator

**0 of 3 known-good datasets missed** (0 %), all above rank 20.

⚠ **This is a RECALL measurement over a known-good set, not a population false-negative rate.** The true rate
is **unmeasurable** without a complete ground-truth inventory of what every city publishes — which is exactly
the thing whose absence this tool exists to address. `falseNegativeRate()` carries that warning in its own
payload so it cannot be quoted stripped of it. **The denominator is 3.**

### False-positive rate — measured, and deliberately not tuned away

Adjudicated over the **top 30 of each city (n = 60)** against the city dossiers. A record is a **false
positive** when *none* of its proposed candidate variables is defensible; **partial** when at least one is and
at least one is not.

| | clean | partial | **false positive** |
|---|---:|---:|---:|
| Córdoba top 30 | 17 | 2 | **11** |
| Murcia top 30 | 14 | 5 | **11** |
| **combined (n = 60)** | 31 (51.7 %) | 7 (11.7 %) | **22 — 36.7 %** |

**Precision degrades sharply below rank 20**, which is the practical finding:

| band | false positives |
|---|---:|
| ranks 1–20 (n = 40) | 9 — **22.5 %** |
| ranks 21–30 (n = 20) | 13 — **65 %** |

⇒ **Review the top 20. Below it, the signal is mostly gone.**

**The false positives cluster in two families, both left in place deliberately:**
1. **Statistical / derived grids whose *abstract* borrows cadastral vocabulary** — Córdoba's six `vhex25_*`
   hex-grid layers, Murcia's `cultivos`. ⚠ Includes a real one: `vhex25_sup_brasante_m2` proposes
   `terrain-rasante` because its abstract says *"superficie **bajo rasante**"* — below-grade floor area, not a
   terrain datum.
2. **Cartographic furniture carrying a planning homonym** — `Murcia:Cartografía **Fondo** Gris` proposes
   `buildable-depth` because *fondo* means both *buildable depth* and *background*; likewise `linea_auxiliar`,
   `toponimia`.

These are **reported, not tuned away**. Suppressing them would mean editing the dictionary against its own
answer key, and a homonym filter tight enough to kill *"Fondo Gris"* is tight enough to kill a genuine
*"fondo edificable"* layer somewhere else. **A false positive costs a human ten seconds; a false negative
costs an engineering sprint (ADR-0290).** The asymmetry is priced in on purpose.

### Cost per city

| | Córdoba | Murcia |
|---|---:|---:|
| endpoints | 3 (2 publishers) | 2 |
| **datasets enumerated** | **120** | **289** |
| capabilities-only | **3 requests · ~4 s · 610 KiB** | **2 requests · ~4 s · 742 KiB** |
| **+ deep probe, top 30** | **63 requests · 5.6 s · 686 KiB** | **50 requests · 2.9 s · 811 KiB** |
| failed / unknown probes | 0 / 0 | 0 / 0 |

⇒ **A full Stage 0 pass costs well under a minute of wall-clock and ~50–65 requests.** ⚠ This is the *tool's*
cost against **responsive** services. It is **not** the cost of a Stage 0 *pass*: the human review of the top
20, and the sourcing conversations a negative triggers, dominate — Córdoba's hand sweep took a day. **Do not
size a national programme on the 5.6 s.** And it is n = 2, both with healthy GeoServers; a city that times out
costs the full timeout per endpoint.

### One measured discrepancy, recorded rather than reconciled

The Córdoba dossier records *"105 WFS + 119 WMS layers"*. This tool measures **105 WFS + 105 WMS** on
2026-08-02 — 106 `<Layer>` elements, of which one is the unnamed root container. The `119` is not reproducible
from the served document. Recorded here as a discrepancy; it changes no conclusion (the WMS layers are a
subset of the WFS names plus styling), and it is **not** silently corrected in the dossier.

---

## §10 — What Stage 0 cannot see

Enumerated deliberately — *"enumerate the failure modes the check is blind to"* (PROBE-DISCIPLINE R7).

1. **Undeclared services.** Only declared endpoints and candidate hosts are probed. A municipality whose
   service nobody told the tool about reads as `Unknown`, **not** `No`. ⚠ **This is the residual
   false-negative surface, and it is the largest one.**
2. **Idiom outside the dictionary.** Classification is lexical. A planning layer named in a Catalan, Basque,
   Galician or purely local idiom absent from `taxonomy.mjs` is a false negative. **Extending the dictionary
   is the highest-value maintenance on this tool.**
3. **The ordinance.** No instrument text is opened. `digitalPgou: No` is a statement about GIS only.
4. **Whether the instrument is in force.** Edition suffixes are flagged; supersession is not resolved.
5. **Whether the geometry is correct.** Feature counts and extents are read; no geometry is validated. A layer
   can score 1.00 readability and be wrong.
6. **Non-OGC distributions** — CSV/SHP/DWG downloads, GeoNetwork records, portal attachments. Córdoba's
   GeoNetwork (56 records) is *not* enumerated by this tool today.
7. **Anything behind auth.** A 499 `Token Required` (València's heritage folders) is `auth-gated` and
   `Unknown`, and the gap is named rather than papered over.

---

## §11 — Running it

```bash
cd tools/dataset-discovery

node discover.mjs --city cordoba                       # live, capabilities only (~3 requests)
node discover.mjs --city cordoba --deep 30 --out reports
node discover.mjs --city murcia  --deep 30 --out reports
node discover.mjs --city cordoba --offline             # replay fixtures/, zero network
node discover.mjs --city murcia  --cold-start          # the Probe C record, to stdout
node discover.mjs --batch munis.json --deep 30 --out reports    # Probe C, JSONL out
node discover.mjs --endpoints wfs=https://…/wfs --centroid 37.88,-4.77 --name "Ad hoc"
node discover.mjs --city cordoba --capture-fixtures    # refresh the offline fixtures

npx tsx --test discover.test.ts                        # 51 tests, fully offline
```

**Adding a municipality is a data edit** — one entry in `MUNICIPALITIES` (centroid + declared endpoints +
candidate hosts) and, if its publisher is new, one entry in `PUBLISHERS` stating whether it is competent for
planning. ⚠ **Leave `competentForPlanning` unset rather than guessing**: `null` scores as `Unknown` and marks
the legal-authority axis a lower bound, which is honest. Guessing `true` from a municipal-looking hostname is
the reasoning that produced George Mason University.

---

*Authority: ADR-0290 (the invariant this discharges) · ADR-0283 · ADR-0284 · ADR-0285 · ADR-0288 ·
MACHINE-READABLE-EVIDENCE-REGISTER · PROBE-DISCIPLINE · BLOCKER-CLASSIFICATION-STANDARD · C58 · C63 ·
L-422/457/467/469 · L-584 · L-616 · L-656.
All validation figures measured live 2026-08-02 and reproducible from `tools/dataset-discovery/reports/`.*
