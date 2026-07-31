# DK — The byggefelt placement-evidence producer (G6 tier 1 is OPEN)

> **Status: SHIPPED + VERIFIED-LIVE, 2026-07-31.** Commit `1ff31ad1` on
> `worktree-agent-a6dfd20492b0791ee`. Package suite 1332 → **1380 green**; root `tsc` **88 errors
> before and after — zero net-new**; `check:isolation` clean.
>
> Input: [`BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`](./BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md).
> This document reports the **independent re-verification**, the **producer**, and the answers to
> that probe's open items **O1 / O3 / O4 / O5**. **O2 (parcel coverage) is answered in §5 — read the
> denominator before quoting the number.**

---

## §0 — TL;DR

1. **The counts reproduced. All six, exactly.** Re-run independently before any code was written (§1).
2. **The producer ships** (`ByggefeltProducer` + a pure classifier + a jurisdiction-agnostic
   `PlacementEvidence` vocabulary), and **G6 tier 1 now places a real footprint** end-to-end from a
   real binding byggefelt (§3, §6).
3. **O5 is CLOSED and the answer is good news:** binding byggefelter are **not** concentrated in a
   few municipalities. **96 of 98 kommuner** publish at least one; median 88; the top 10 account for
   only 41%. The 23.9% is **national practice**, not a Copenhagen/Aarhus artefact (§2.3).
4. **O4 is CLOSED and the answer is bad news:** there is **no `byggelinje` layer in Plandata at
   all** — 198 `pdk:` layers, none of them building lines. **G6 tier 2 has no data source** (§2.2).
5. **O1 is CORROBORATED, not yet confirmed:** a published Plandata codelist independently names
   "Vejledende byggefelt" and "Byggefelt med begrænsende byggeret" as official categories (§2.1).
6. **O3 delivered:** all 179 contradictory records listed, and they cluster into **63 lokalplaner**,
   not 179 (§7).
7. **⚠ Tier-1 reach is ~10,900, not 13,629.** Only **79-81%** of binding byggefelter are
   single-part and hole-free, and today's single-ring `explicit-area` primitive refuses the rest.
   Multi-part is the whole story (19.4%). Fixing the primitive to take multiple rings is a
   jurisdiction-agnostic win (§2.4).

---

## §1 — Did the counts reproduce? **YES — all six, exactly.**

Re-run against `https://geoserver.plandata.dk/geoserver/wfs` on 2026-07-31 with
`resultType=hits` + `CQL_FILTER` (never a head sample — see the probe doc's §3 caution), **before**
writing any code.

| State | Filter | Founder | **Re-measured** | Match |
|---|---|---:|---:|:--:|
| Total adopted | *(none)* | 57,035 | **57,035** | ✅ |
| **BINDING** | `bygkunifelt=true AND bygvejledende=false` | 13,629 | **13,629** | ✅ |
| ADVISORY | `bygvejledende=true` *(raw, incl. the 179)* | 37,100 | **37,100** | ✅ |
| ADVISORY | *(excl. the 179)* | 36,921 | **36,921** *(37,100 − 179)* | ✅ |
| NEITHER | both `false` | 6,101 | **6,101** | ✅ |
| CONTRADICTORY | both `true` | 179 | **179** | ✅ |
| NULL | `bygkunifelt IS NULL OR bygvejledende IS NULL` | 205 | **205** | ✅ |

The partition closes exactly: `13,629 + 37,100 + 6,101 = 56,830`, and `57,035 − 56,830 = 205`.
The null residual was **measured directly**, not inferred as a remainder — it agrees with the
remainder, which is a genuine independent check rather than a restatement.

> **Drift note.** L-610 (2026-07-23) recorded 57,031 / 13,627. Today: 57,035 / 13,629. The register
> gained 4 features and 2 binding ones in 8 days. **These counts are a moving target** — anything
> that quotes them must carry a date.

`doklink` was present on every feature inspected here (4 sampled classes + all 179 contradictory
records = 183/183). Still a sample, not an exhaustive check.

---

## §2 — New findings (the probe's open items)

### §2.1 — O1: field semantics are **CORROBORATED** by a published codelist (not yet confirmed)

The probe flagged its reading of the Danish field names as *inference from names + data pattern*
(B4, ASSERTED-UNVERIFIED). A previously-unread Plandata layer strengthens it substantially:

`pdk:theme_pdk_codelist_byggefelttype_v` publishes **four official byggefelt categories**:

| code | text | reading |
|---:|---|---|
| 1 | *Byggefelt med begrænsende byggeret* | byggefelt with a **limiting building right** → binding |
| 2 | *Byggefelt med delvist begrænsende byggeret* | with a **partially** limiting building right |
| 3 | ***Vejledende** byggefelt* | **advisory** byggefelt |
| 4 | *Særligt udpeget byggefelt* | specially designated |

This is the register's own vocabulary, and it independently confirms that **"vejledende" is an
official ADVISORY category** and that **"begrænsende byggeret" (a limiting building right) is the
binding one** — exactly the two readings the state machine rests on.

**Why this is corroboration and not proof.** The codelist is **not joined to the feature by any
published key**: `theme_pdk_byggefelt_vedtaget` carries no `byggefelttype` column, and its
`objektkode` is `30` (the object class) rather than a 1–4 type code. The three booleans
(`bygkunifelt`, `bygvejledende`, `bygtillagtosh`) appear to be the WFS denormalisation of that
registration-form category, but **that mapping is inferred, not documented**. O1 therefore stays
open pending the published data specification / UML model, and B4 moves
**ASSERTED-UNVERIFIED → CORROBORATED**.

Note category 2, *delvist begrænsende* ("partially limiting"), has **no clean boolean
representation** — a plausible origin for part of the 6,101 both-false bucket.

### §2.2 — O4: **there is no byggelinje layer.** G6 tier 2 has no data source.

The probe asked whether `theme_pdk_byggelinje_*` carries an equivalent flag. It does not, because
**the layer does not exist.** `GetCapabilities` returns **201 layers, 198 of them `pdk:`**, and not
one is a building line. The only `*linje*` matches in the whole service are
`knz:theme-knz-kystnaerhedszone-linje` (a coastal-proximity zone boundary) and
`pdk:theme_pdk_digitalretningslinje_*` (*digital guidelines* — kommuneplan policy text objects, not
geometry setbacks).

**This is a material roadmap correction.** `dkEnvelopePlacement.ts` tier 2 (byggelinjer) and
`geometry/buildingLineOffset.ts` are built and tested, but **nothing in Plandata can feed them.**
Tier 2 is not "unwired" — it is **unsourceable from the national plan register**.

Danish *byggelinjer* are overwhelmingly **vejbyggelinjer** (road building lines) under the Road Act,
held by the road authority (Vejdirektoratet / the kommune), not by Erhvervsstyrelsen. Sourcing them
is a **separate data-acquisition project against a different authority**, and the DK roadmap's G2
should be re-scoped accordingly. It is **not** a Plandata wiring task.

> ⚠ Consequence for the ADR-0279 §6 debt (per-edge front/side/rear classification): **tier 1 does
> not need it.** An explicit-area polygon is placed by the published geometry itself and never
> measures from a frontage — the resolver's tier-1 branch does not read `frontIdx` at all. Per-edge
> classification remains a hard blocker for tiers 2–4, but **tier 1, the tier this work opens, is
> unaffected.** That is precisely the point of an explicit-area tier.

### §2.3 — O5: **CLOSED — binding practice is national, not concentrated**

The probe's worry was that a national 23.9% could hide "5 kommuner do this properly". It does not.
Measured exhaustively (all 13,629 binding records fetched with `propertyName=komnr,kommunenavn`):

| Measure | Value |
|---|---|
| Kommuner with ≥1 binding byggefelt | **96 of 98** |
| Median per kommune | **88** |
| Top-10 share | **41.0%** |
| Top-20 share | **57.5%** |
| Largest single kommune | Aarhus, 1,711 (12.6%) |

A 41% top-10 share on a country whose top 10 municipalities hold a large share of *all* development
is a mild urban skew, not concentration. **Binding byggefelter are a nationally-practised
instrument**, which means the capability this producer unlocks generalises across Denmark rather
than being a big-city feature.

### §2.4 — ⚠ **Only ~4 in 5 binding byggefelter are actually placeable today** (S5, measured)

The 13,629 binding records are **not** 13,629 placeable footprints. `ExplicitAreaSource.footprintRing`
is a **single ring**, so the tier-1 adapter refuses multi-part and holed geometry (§3.6). That
subtraction was previously unquantified. It now is.

**Method:** systematic sample of the binding set — 40 strata × 25 records = **n = 1,000**, spread
evenly across `startIndex` 0…13,600, 0 discarded. *(Systematic over storage order, not random —
better than a head sample, but storage order is not a random permutation, so treat this as a good
estimate rather than an exact proportion.)*

| Geometry property | Share of binding set |
|---|---:|
| single-part (`Polygon`, or 1-part `MultiPolygon`) | **80.6%** (806/1,000) |
| hole-free | **98.8%** (988/1,000) |
| **both — i.e. placeable at tier 1 today** | **79.4 – 80.6%** *(bounds from the marginals; the joint was not separately counted)* |

**So tier-1 reach is ≈ 10,900 of 13,629 binding byggefelter, not 13,629.**

Multi-part is the whole story (19.4%); holes are negligible (1.2%). The tail is long — sampled
records carried up to **55 parts** — i.e. a single lokalplan feature holding many separate building
fields.

> **The fix is well-defined and worth doing.** Nothing legal blocks these: they are binding,
> published geometry that PRYZM simply cannot represent. Teaching the `explicit-area` primitive to
> accept **multiple rings** (a multi-polygon footprint) would recover ~19% of DK tier-1 reach, and it
> is a **jurisdiction-agnostic engine improvement** — Madrid and Córdoba fondos have the same shape.
> Until then the refusal is right: silently taking part 0 would discard published buildable fields.

### §2.5 — A third flag exists and is negligible

`bygtillagtosh` (a third boolean on the same feature) is `true` on **345** records, **268** of which
sit in the both-false bucket. It dents the 6,101 by ~4% and does not constitute a fourth state. It
is **not** read by the classifier; recorded here so the next reader does not re-discover it.

---

## §3 — The producer

Three modules, split so that **geometry production and legal-status production are separate
concerns** — the architectural requirement that makes this carry to other jurisdictions.

```
providers/ByggefeltProducer.ts     IMPURE  WFS I/O, retry, cache, rate-limit → FetchOutcome
        ↓
evidence/byggefeltEvidence.ts      PURE    DK state machine: flags → legalStatus (+ tier-1 adapter)
        ↓
evidence/placementEvidence.ts      PURE    jurisdiction-agnostic vocabulary + ranking + QA
        ↓
rulepacks/dkEnvelopePlacement.ts   PURE    G6 resolver — UNCHANGED behaviour, gate now satisfiable
```

The G6 resolver was **not** modified behaviourally. Its `§BYGGEFELT-BINDING-GATE` still fires only
on `binding: 'binding'`. What changed is that something can now **prove** that precondition. Only
two stale docstrings were corrected.

### §3.1 — How `legalStatus` is populated

`classifyByggefeltLegalStatus()` implements the probe's state machine. **Evaluation order is
load-bearing and is deliberately not the order of the table:**

| # | Check | Result | Why it must be checked here |
|---|---|---|---|
| 1 | either flag `null` | `unknown` / `metadata-unavailable` | **`null` ≠ `false`.** If `bygkunifelt===true` were tested first, a null would be silently absorbed into "not binding". |
| 2 | **both** `true` | `unknown` / `metadata-conflict` | Both single-flag branches would otherwise match, and whichever ran first would "win" — an arbitrary resolution of a contradiction PRYZM has no standing to resolve. |
| 3 | `kunifelt ∧ ¬vejledende` | **`binding`** | The only state that may place a footprint. |
| 4 | `vejledende` | `illustrative` | An explicit municipal declaration. |
| 5 | otherwise | `unknown` / `not-declared` | The register declined to classify; the plan text is the only remaining source. |

**`wfsBool()` is the single coercion point**, returning `boolean | null`. GeoServer emits real JSON
booleans on the GeoJSON output format but the **strings** `'true'`/`'false'` on GML — and `'false'`
is **truthy in JavaScript**. A naive read classifies an advisory field as binding: a one-character
path to over-stating a building envelope. An unrecognised value returns `null` (→ `unknown`), never
a guess, so schema drift surfaces as a non-determination rather than a fabricated one.

### §3.2 — How `legalStatusSource` is populated

**From evidence, never assumed.** It is set to `'metadata'` **only** where a flag actually decided
the status, and is **`null` whenever `legalStatus === 'unknown'`** — there is no source for a
non-determination, and a guess wearing a provenance label is worse than no answer. There is
deliberately no `'inferred'` / `'heuristic'` member of the union.

The two axes are independent by construction:

| | Denmark (shipped) | Madrid (expected) | Germany (expected) |
|---|---|---|---|
| `geometrySource` | `official_gis` | `official_gis` | `official_gis` |
| `legalStatusSource` | **`metadata`** | `statute` (PGOUM Norma Zonal) | `plan_text` (textliche Festsetzungen) |
| `authority` | `plan` | `regulation` | `plan` |

Denmark is the **first** jurisdiction where the authority publishes legal status as a
machine-readable field. The resolver reads `legalStatus` and never learns why — which is what lets
SE *Byggrätt*, FI *Rakennusala* and NO *Byggegrense* be added as **new producers with no resolver
change** (ADR-0279 §2).

### §3.3 — `§UNKNOWN-HAS-THREE-CAUSES` (an extension beyond the brief)

`unknown` is not one state. The three causes have **different remedies**, so collapsing them would
be the L-422/457/467/469 failure at field granularity:

| Cause | n | Remedy | Retryable? |
|---|---:|---|---|
| `not-declared` | 6,101 | read the lokalplan PDF (G5) | no |
| `metadata-conflict` | 179 | ask the municipality to fix the record | no |
| `metadata-unavailable` | 205 | re-ingest / re-fetch — may be a publication gap | **yes** |

### §3.4 — `§FAILURE-IS-NOT-ABSENCE` in the client

Returns `FetchOutcome`, never a bare array. Two rules make it real rather than decorative:

- **Status is checked BEFORE the body.** A 500 whose error page happens to deserialise as
  `{features:[]}` reports `transient`, never `absent`. *(Pinned by a test.)*
- **Only `found` / `absent` enter the cache.** Caching a `transient` would turn one bad minute into
  a TTL-long fake "no byggefelt here" — a fetch failure persisted as a coverage fact.

A 4xx is reported `transient` **with a "check the query" reason and no retry**: a bad CQL filter is
our bug, and reporting it as `absent` would hide a broken query behind a plausible empty answer.

### §3.5 — `§TRUNCATION-IS-NOT-NONE` (the subtlest one)

If the WFS matched more features than it returned, **"none of these is binding" describes a page,
not the bbox** — a binding byggefelt could sit on page 2. `byggefeltResultToTierOne()` therefore
reports a truncated negative as **`transient`, not `absent`**, which makes the resolver set
`higherAuthorityUnresolved` and forbid caching the downstream answer. Concluding absence from a
partial read is exactly how a fetch limit becomes a fake coverage fact.

### §3.6 — The tier-1 adapter is deliberately paranoid

`dkByggefeltFromEvidence()` is the single chokepoint where evidence becomes a placeable footprint.
`binding` alone is **not** sufficient — every refusal below is a case where passing the value
through yields a **plausible-but-wrong building** rather than a visible error:

| Refusal | Why |
|---|---|
| `not-binding` | the gate |
| **`unprojected-crs`** | EPSG:25832 eastings/northings are **also metres** and **also plausible magnitudes**. Passing them through puts a plausible building in the wrong place. The CRS rides on the geometry and is checked, making the mistake unrepresentable rather than merely discouraged. |
| `holes-unsupported` | a hole is a published "do not build here"; `ExplicitAreaSource` carries one ring, so dropping it would **over-state** the buildable area (the L-616 direction). |
| `multi-part-unsupported` | silently taking part 0 would discard published buildable fields. Both parts are emitted as visible evidence so the loss cannot be invisible. |
| `degenerate-ring` | < 3 vertices |

Binding records that cannot be adapted are reported on `unusableBinding` and their `absent` reason
is prefixed **`pryzm-limitation:`** — so a coverage metric can never absorb *our* capability gap as
*the register's* missing data.

### §3.7 — Polite client

Identifying `User-Agent`; a min-interval single-flight queue; **in-flight de-duplication above the
fetch** (the L-585 lesson — below it, it de-dups nothing); bounded full-jitter exponential backoff
that **honours `Retry-After`** when sent; a bounded LRU cache.

> ⚠ **`User-Agent` is a forbidden header in browser `fetch`** and is silently dropped there. In
> production this should run **server-side behind the same-origin proxy** the DK zoning path already
> uses (`server/plandataZoningProxy.js`), so the identifying UA and the rate limit are enforced once
> rather than once per browser tab. Injecting `fetchImpl` + `baseUrl` is how a caller points at it.
> **This is not yet wired — see §8.**

---

## §4 — Tests

**48 behavioural tests**, over **recorded real Plandata responses** — four fixtures fetched live on
2026-07-31 with verbatim geometry and flags (`__tests__/fixtures/byggefeltFixtures.ts`), not
hand-written shapes. They assert behaviour, not the implementation restated.

The binding and advisory fixtures are **from the same lokalplan** (Silkeborg LP 12-002), which is
itself the point: bindingness is a **per-feature** property and can never be inferred from the plan
a feature belongs to.

Representative coverage: the four real record classes; `'false'`-string vs boolean encoding parity;
null vs both-false staying distinguishable; advisory never adaptable; contradictory resolving to
**neither** status; the CRS/holes/multi-part refusals; 500-vs-timeout-vs-abort-vs-empty as four
different answers; transient never cached while absent is; truncated-negative → transient; and an
end-to-end run where a real binding byggefelt drives the resolver to
`placement: 'byggefelt'` / `openSpace: 'byggefelt-hole'`.

**Fixture staleness is a real risk**: if Plandata changes its boolean encoding, these fixtures go
stale and the tests keep passing while production breaks. The fixture header says so and carries the
re-record queries.

---

## §5 — ⚠ Parcel-side coverage (O2) — **NOT DELIVERED. Do not quote 23.9% as parcel coverage.**

**The honest state: this number was not computed in this session.**

**What IS measured, and its denominator:**

> **23.9% is a FEATURE share. Denominator = 57,035 adopted byggefelt FEATURES.**
> It says *"of all adopted byggefelter, 23.9% are binding"*.
> It does **not** say what fraction of Danish parcels can be placed at tier 1.

The operational KPI — *"X% of Danish cadastral parcels intersect ≥1 binding byggefelt"* — has a
**different denominator (cadastral parcels, ~2.5 M nationally)** and is **not derivable** from the
feature count: a parcel may intersect zero or several byggefelter, one byggefelt may span several
parcels, and byggefelter cluster in recently-planned areas, so the parcel-side figure is expected to
be **far lower** than 23.9%.

**Why it is not delivered.** The blocker is parcel geometry, not the byggefelt side. The official
cadastre (**Matriklen** via Datafordeler) is **MitID/account-gated** — the standing
identity-bootstrap gate that also blocks SE (BankID) and DK live cadastral access. A parallel
research task was dispatched this session to establish whether a free keyless parcel source (DAWA /
`api.dataforsyningen.dk/jordstykker`) can supply a count-uniform parcel sample; **its result had not
returned when this document was written.**

**Rules for whoever finishes it:**
1. **State the denominator in the same sentence as the number.** Parcels, not features.
2. **Uniform-random POINTS in Denmark is AREA-weighting**, which biases hard toward huge rural
   parcels and answers a different question. Prefer a **parcel-count-uniform** sample; if only
   area-weighting is achievable, **label it**.
3. Any OSM or non-cadastral substitute is a **PROXY** and must be labelled one **in the document**,
   with its bias direction — not merely understood by the author.
4. An HTTP error during sampling is **not** "no byggefelt here" — discard and retry, and report the
   discard count.
5. Subtract nothing silently: the `unusableBinding` records (§3.6) are *our* gap, not the
   register's, and a coverage figure must say which it is counting.

**Until it is computed, the honest statement is: "23.9% of adopted byggefelter are binding; the
share of parcels this can place is UNKNOWN and expected to be materially lower."**

---

## §6 — What tier 1 produces end-to-end for a real binding parcel

Driving the shipped resolver with the real Silkeborg feature `id=1485483`
(LP 12-002, *Boligområde ved Vestre Ringvej-Hvinningdalvej*, `bygkunifelt=true`,
`bygvejledende=false`, `maxbygnhjd=14`, `maxetager=4`):

| Field | Before (gate shut) | **After** |
|---|---|---|
| `placed` | `false` | **`true`** |
| `tier` | `null` | **`byggefelt`** |
| `placement` | `null` | **`{ source: 'byggefelt' }`** |
| `openSpace` | `null` | **`{ courtyard: true, source: 'byggefelt-hole' }`** |
| `geometricRule` | `null` | **`{ kind: 'explicit-area', ringRef: 'dk-plandata-byggefelt' }`** |
| `explicitAreaSource` | `null` | the published ring, projected to scene-XZ |
| `refusalReason` | `no-usable-source` | **`null`** |
| `higherAuthorityUnresolved` | — | `false` (cacheable — the strongest source answered) |
| citation | — | `https://dokument.plandata.dk/20_1023378_APPROVED_1220596881068.pdf` |

The engine then clips `parcel ∩ byggefelt` through the existing Madrid-born `explicit-area`
primitive. **No new solver, no jurisdiction branch in the engine** (ADR-0279 §2).

The fall-through cases stay honest and **distinct**:

| Scenario | Result |
|---|---|
| only advisory fields | refuse **`no-usable-source`** (durable — a retry cannot make an advisory field binding) |
| fetch failed (500) | refuse **`sources-unresolved`** + `higherAuthorityUnresolved: true` (retryable, do not cache) |
| binding but multi-part/holed | `absent` reason prefixed **`pryzm-limitation:`** — falls through, never mislabelled as missing data |

---

## §7 — O3: the 179 contradictory records (QA output, unresolved by design)

Both `bygkunifelt` and `bygvejledende` are `true` — mutually exclusive declarations. **PRYZM refuses
to pick a winner**; these classify to `unknown` / `metadata-conflict`, rank **last** (a
self-contradictory record is a weaker basis for placing a building than an honest silence), and are
surfaced on a dedicated QA channel. They are **not dropped** — a silent drop makes a data-quality
problem invisible.

**Full machine-readable list:
[`data/byggefelt-contradictory-179.csv`](./data/byggefelt-contradictory-179.csv)** (179 rows;
`id, planid, lokplan_id, komnr, kommunenavn, lp_plannr, lp_plannavn, datovedt, bygkunifelt,
bygvejledende, doklink`).

**⚠ The important structural finding — it is 63 problems, not 179.** The 179 records carry 179
distinct `planid` (one per feature version) but only **63 distinct `lokplan_id` / 63 distinct
`doklink`**, across **36 kommuner**. So these are ~2.8 contradictory byggefelter per affected
lokalplan: a **per-plan registration error repeated across that plan's fields**, not 179 independent
mistakes. Routing this upstream is **63 conversations, not 179.**

Top affected municipalities:

| Kommune | Records |
|---|---:|
| Vordingborg | 20 |
| Roskilde | 16 |
| Silkeborg | 13 |
| Guldborgsund | 12 |
| Assens | 10 |
| Skive | 10 |
| Vejle | 9 |
| Aarhus | 9 |
| Glostrup | 7 |
| Gribskov | 7 |
| Haderslev | 7 |
| Favrskov | 7 |
| *(24 others)* | 52 |

At 0.31% of the national set these are a rounding error for coverage, but they are a **live signal
about municipal data-entry quality** — and the measured 0.31% self-contradiction rate is the one
empirical anchor behind weighting an explicitly-declared binding flag at 0.95 rather than 1.0.

---

## §8 — Still stubbed / not done (explicit)

| # | Item | State |
|---|---|---|
| **S1** | **Parcel-side coverage (O2)** | **NOT COMPUTED.** §5. The single most important open number. |
| **S2** | **No L5 wiring.** Nothing in `apps/editor` calls `createByggefeltProducer` yet. The producer, classifier, bridge and resolver are unit-wired and tested together, but the **live DK dispatch path does not use them** — a real user click still does not hit tier 1. | not started |
| **S3** | **No same-origin proxy route.** `server/plandataZoningProxy.js` has no byggefelt endpoint, so the browser cannot call this politely (UA dropped, rate limit per-tab). §3.7. | not started |
| **S4** | **No projector supplied.** The producer emits EPSG:25832 unless given a `project` fn; the CRS interlock then **refuses** every record. Whoever wires S2 must pass the scene-XZ projector or tier 1 silently never fires (loudly, at least — it refuses rather than misplaces). | by design, unwired |
| **S5** | **Multi-part binding byggefelter are refused — now MEASURED at ~19% of the binding set.** See §2.5. The refusal is correct for today's single-ring primitive, but it is the largest single subtraction from tier-1 reach and the fix is well-defined. | **measured**, unfixed |
| **S6** | **O1 not fully closed.** Semantics are corroborated by the codelist (§2.1) but not confirmed against Plandata's published data specification / UML model. | one doc read |
| **S7** | **Tier 2 has no data source (O4).** Not a wiring gap — a **different authority**. `buildingLineOffset.ts` and the tier-2 branch are dead code until vejbyggelinjer are sourced from the road authority. | re-scope needed |
| **S8** | **Pagination not implemented.** `pageSize` defaults to 500 and truncation is *detected and reported honestly* (§3.5) but never *followed*. A dense urban bbox returns a page and a `transient`. | detected, not resolved |
| **S9** | **`PlacementEvidence` lives in `@pryzm/site-parcel-data`, not L0.** It is pure and could be promoted to `packages/schemas`, but the L0 contract surface is ADR-governed. Promote when a **second** jurisdiction consumes it — not before. | deliberate |
| **S10** | **Advisory/unknown evidence is produced but nothing consumes it.** The ranked list, `unknownCause` and the conflict channel are all populated and returned; no UI surfaces them. | produced, unconsumed |

---

## §9 — Reproducing

```bash
U="https://geoserver.plandata.dk/geoserver/wfs"
UA="PRYZM-BIM/1.0 (site-feasibility research; pryzmhello@gmail.com)"
q(){ curl -sS -A "$UA" "$U?service=WFS&version=2.0.0&request=GetFeature\
&typeNames=theme_pdk_byggefelt_vedtaget&resultType=hits${1:+&CQL_FILTER=$1}" \
    | grep -oE 'numberMatched="[0-9]+"'; }

q ''                                                     # 57035
q 'bygkunifelt%3Dtrue%20AND%20bygvejledende%3Dfalse'     # 13629  BINDING
q 'bygvejledende%3Dtrue'                                 # 37100  (incl. the 179)
q 'bygkunifelt%3Dfalse%20AND%20bygvejledende%3Dfalse'    #  6101
q 'bygkunifelt%3Dtrue%20AND%20bygvejledende%3Dtrue'      #   179  CONTRADICTORY
q 'bygkunifelt%20IS%20NULL%20OR%20bygvejledende%20IS%20NULL'  # 205
q 'bygtillagtosh%3Dtrue'                                 #   345  (§2.4)

# O1 — the codelist that corroborates the semantics
curl -sS -A "$UA" "$U?service=WFS&version=2.0.0&request=GetFeature\
&typeNames=pdk:theme_pdk_codelist_byggefelttype_v&outputFormat=application/json"

# O4 — no byggelinje layer exists (198 pdk layers, zero building lines)
curl -sS -A "$UA" "$U?service=WFS&version=2.0.0&request=GetCapabilities" | grep -c byggelinje  # 0

# O5 — exact per-kommune binding distribution (13,629 rows, attributes only)
curl -sS -A "$UA" "$U?service=WFS&version=2.0.0&request=GetFeature\
&typeNames=theme_pdk_byggefelt_vedtaget&outputFormat=application/json&count=20000\
&propertyName=komnr,kommunenavn&CQL_FILTER=bygkunifelt%3Dtrue%20AND%20bygvejledende%3Dfalse"
```

No auth, no API key. CRS EPSG:25832 throughout.

---

## §10 — Evidence chain (G11)

| # | Claim | How obtained | Date | State |
|---|---|---|---|---|
| P1 | All six national counts (§1) | independent `resultType=hits` re-run before coding | 2026-07-31 | **VERIFIED-LIVE** |
| P2 | Codelist corroborates field semantics (§2.1) | live `GetFeature` on `codelist_byggefelttype_v` | 2026-07-31 | **VERIFIED-LIVE** (corroboration; O1 open) |
| P3 | No byggelinje layer exists (§2.2) | live `GetCapabilities`, 201 layers enumerated | 2026-07-31 | **VERIFIED-LIVE** |
| P4 | Binding practice spans 96/98 kommuner (§2.3) | exhaustive fetch of all 13,629 binding records | 2026-07-31 | **VERIFIED-LIVE** |
| P5 | The 179 contradictory records + their 63 plans (§7) | full `GetFeature` of the both-true set | 2026-07-31 | **VERIFIED-LIVE** |
| P6 | Tier 1 places a footprint end-to-end (§6) | 48 tests over recorded real responses | 2026-07-31 | **VERIFIED (test)** |
| P7 | Danish semantics of the two field names | name + data pattern + codelist | 2026-07-31 | **CORROBORATED** → S6 |
| P8 | **Parcel-side coverage** | — **nothing computed** — | — | **UNKNOWN** → S1 |
| P9 | Multi-part / holed share of binding set (§2.4) | systematic n=1,000 sample over startIndex, 0 discarded | 2026-07-31 | **MEASURED** (systematic, not random) |

---

*Related: [`BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`](./BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md)
(the input probe) · `DENMARK-GAP-ROADMAP.md` G2/G3/G5/G6/G11 · ADR-0279 §2/§6 · C57 §1.5 ·
C58 §1.4/§1.9 · L-449 · L-616 · L-619 · [[context-data-honesty-family]] ·
[[probe-can-be-wrong-three-ways]] · [[identity-bootstrap-gate-offline-legislation-pattern]].*
