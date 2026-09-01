# E1 ARCHITECTURE GATE — SUPPLEMENT REVIEW (§3 · §6 · §7 · §8 · §9 · §10)

> **Reviewer:** supplement lane (E1B-GATE-BRIEF.md §3/§6/§7/§8/§9/§10; §1/§2/§4/§5 are the
> parallel challenge review's). **Date:** 2026-09-01. **Read-only** — no code changed.
> **Read completely:** all 9 files of `packages/schemas/src/siteintel/` (+ vocabularies),
> `packages/schemas/__tests__/siteintel.test.ts` (507 lines), REPORT §H–§K/§R,
> DECISION-SUMMARY.md, all 8 files of the uncommitted E1d draft
> `packages/site-parcel-data/src/countryAdapters/ee/` (1,700 lines), spot-checks in
> `packages/site-parcel-data/src/parcelProviders/`, and the four lane chain sections.

**Verdict line per section (digest):**

| § | Verdict |
|---|---|
| §3 spatial rules | **6/6 EXPRESSIBLE** — two annotations, one architectural risk (dangling `geometryRef` referent) |
| §6 temporal | **DOES-NOT-PREVENT: PASS** — 2 additive gaps (ingestion-vs-legal `valid_from` is prose-only; `DevelopmentPotential` has no time anchor) |
| §7 registry | **NOW (thin: schema + data files only)** — the schema already exists as `SiteIntelSourceSchema`; ~1–2 days; add 4 nullable columns |
| §8 partial data | **DOCTRINE ENCODED at the rule layer** — structurally enforced where it matters; one overload at the envelope-solid seam; one coercion seam left to E1b |
| §9 adapter boundary | **1 flag (low), 1 architectural note, otherwise CLEAN with grep evidence** — E1d is the best-behaved adapter in the repo |
| §10 20-parcel test | **DEFINED** — 20/20 parcels lane-named (1 needs a pinned id, 1 is a deliberate measured-negative); expected-grade table below is the acceptance baseline |

---

## §3 SPATIAL RULES — the six examples against the E1a fields

End-state requirement restated: the envelope engine receives deterministic spatial constraints
whether the source was GIS, structured data, or a document. The uniform carrier in E1a is:
`SiteIntelRule` (provenance + applicability) + `SiteIntelPrescription` (drawn geometric
constraints) + `SiteIntelRestriction` (overlay themes) — document-derived values land in the
SAME `RuleProvenanceSchema` with `derivation: 'AI_EXTRACTED'` and document/article/page
addressing (`provenance.ts:96–118`), so source-kind never changes the constraint's shape.
That satisfies the requirement's *regardless-of-source* clause by construction.

| # | Brief rule (verbatim) | E1a path | Grade | Justification |
|---|---|---|---|---|
| 1 | "Max height = 18m" | `SiteIntelRule.provenance{parameter:'maxHeight', value:18, unit:'m'}` + `applicability.zoneRef` | **EXPRESSIBLE** | Proven verbatim by the test fixture `DE_BRIEF_11_EXAMPLE` (`siteintel.test.ts:106–137`) — round-trips with document/article/page addressing. |
| 2 | "Max height = 18m within this building field" | Same rule; `applicability.geometryRef` → a `SiteIntelPrescription{kind:'buildingField', geometry}` (`entities.ts:216–247`; `KNOWN_PRESCRIPTION_KINDS` includes `buildingField`) | **EXPRESSIBLE** | The E1d mapper does exactly this live: each rule's `geometryRef` names the drawn hoonestusala, not the parcel (`eeRuleMapper.ts:192–208`) — PlanS ehitusõigus semantics carried spatially. |
| 3 | "Min setback = 5m from this boundary" | Two routes: (a) drawn — `SiteIntelPrescription{kind:'setback', geometry:<the boundary/strip>, value:5}`; (b) text-derived — `SiteIntelRule{parameter:'minSetback', value:5, unit:'m'}` + `applicability.geometryRef` → the boundary geometry object | **EXPRESSIBLE** | `Prescription.value` (`entities.ts:236`) is the scalar payload slot for exactly this. *Annotation:* the DIRECTIONALITY (measured from which edge, into which side) is a convention riding the referenced geometry, not a schema field — acceptable at L0, but E1b's evaluator must pin the convention or FR `typepsc`-style prescriptions will be evaluated inconsistently. |
| 4 | "Max height depends on distance from the street" | `SiteIntelRule.body` = JSON-Logic conditional over context facts (`entities.ts:333–336`, `json.ts`) + `applicability.predicate`; the constructed input (street width/distance has NO national source — Road schema deliberately omits width, `entities.ts:160–168`) is a `constructions[]` rule in `DeclarativeRulePackDocumentSchema` (`ruleformat.ts:166–171`) | **EXPRESSIBLE (carrier)** | The data shape is complete and honest (derivation of the distance is itself a rule with provenance, never a bare field). *Annotation:* the FACT VOCABULARY (`{"var":"distanceToStreet"}` — who computes it, in what CRS) is undeclared; that is explicitly E1b's evaluator contract and must be in the E1b freeze list, or two packs will spell the same fact two ways. |
| 5 | "Coverage differs between two spatial portions of the same parcel" | Two `SiteIntelRule`s, same `parameter:'coveragePercent'`, each `applicability.geometryRef` → a different Zone/Prescription geometry | **EXPRESSIBLE** | Multiplicity is native: applicability is per-rule, geometry-scoped, sub-parcel. The E1d chain returns one rule set PER hoonestusala (`index.ts:151–166`) — a parcel with two building areas already produces exactly this shape live. |
| 6 | "An environmental restriction removes only part of the otherwise buildable envelope" | Input: `SiteIntelRestriction{theme, geometry OR areaShare}` (`entities.ts:252–277` — the refine requires at least one leg). Output: `SiteIntelEnvelope.solids[]` (plural) + `derivationTrace[]` → the Evidence node citing the restriction | **EXPRESSIBLE** | The carve OPERATION is engine work (C58, correctly outside L0); the model carries the deterministic input and the multi-solid output. The degenerate case is also honest: CH Basel serves `AreaShare` with `Geometry: []` (lane 2 chain CH-B) — geometry:null + areaShare parses, and an engine that cannot locate the carve must degrade `confidenceTier`/`isUpperBound`, both of which are required fields (`entities.ts:441,447`). |

**§3 architectural risk (feeds the DECISION's B-list): the `geometryRef` referent is unpinned.**
`RuleApplicability.geometryRef` (`entities.ts:308`) and `SiteIntelPlan.geometryRef`
(`entities.ts:193`) are bare `SiteIntelId`s with no declared target kind — and there IS no
standalone geometry entity among the 17 (geometry is inline on Zone/Prescription/Restriction).
The one live producer, the E1d mapper, emits refs like `dp_hoonestus:181` (`eeRuleMapper.ts:208`)
that resolve to **no entity in the graph** — the hoonestusala is never minted as a
`SiteIntelPrescription`, so "why does this rule apply HERE" currently dead-ends at a string.
Expressibility is unharmed (the ref slot exists); *traceability* is, until E1b/E1c either
(a) documents that adapters must mint a Prescription/Zone for every geometry a rule cites, or
(b) declares `geometryRef` an adapter-scoped opaque locator and gives Evidence the job of
resolving it. Cheap to fix now, expensive after two more adapters copy the E1d pattern.

---

## §6 TEMPORAL VALIDITY — "applied on 2025-01-01" vs "applies today"

**What E1a actually declares `valid_from`/`valid_to` on (measured, not assumed):**

| Entity | Time axis | Where |
|---|---|---|
| Rule (via RuleProvenance) | `valid_from` REQUIRED, `valid_to` nullable (null = in force) | `provenance.ts:150–153` |
| Plan | `adoptedDate`, `inForceFrom`, `inForceTo` (all nullable) | `entities.ts:189–191` |
| Version (spine) | `entityRef` + `validFrom`/`validTo`/`supersededBy` — points at ANY entity id | `entities.ts:540–556` |
| Scenario | `asOfDate` (the point-in-time query object) | `entities.ts:390` |
| Evidence | `checkedDate` + content `hash` (a dated, tamper-evident observation) | `entities.ts:475–478` |
| Document | `version` (string) + `retrievedDate` | `entities.ts:503–504` |
| Source | `probes[]` dated log + `licence.verifiedDate`; NO validity window of its own | `entities.ts:414–428` |
| Evaluator | `isInForceOn(valid_from, valid_to, date)` — lexicographic ISO, inclusive bounds, malformed dates REFUSE (never coerce to always-in-force) | `ruleformat.ts:181–199` |

**Both queries, conceptually:** "what applied on 2025-01-01" = `Scenario{asOfDate}` filtered
through `isInForceOn` over Rule + Plan windows, with entity states resolved through Version
rows; "what applies today" = the same with `valid_to === null` as the current-set shortcut.
Nothing requires a `Date` object, history table, or schema change to run either.

**Can everything EVENTUALLY be evaluated in time?** Yes — the structural insight is that
`SiteIntelVersion.entityRef` is an untyped `SiteIntelId`, so ANY entity (including ones with no
inline `version` field: Zone, Prescription, Restriction, Source, Evidence) can acquire version
rows externally, additively, without touching its schema. No reference in the model is
unversionable: refs are by id, and superseding an entity is a new id + a Version row with
`supersededBy`. **DOES-NOT-PREVENT: PASS.**

**Two gaps — both additive, neither blocking, both worth naming before E1b hardens:**

1. **Ingestion-date-as-`valid_from` is machine-indistinguishable from legal validity.** The E1d
   mapper, when the plan-register join fails, sets `valid_from` = FETCH date with a prose warning
   in `confidence.note` (`eeRuleMapper.ts:131–141`: "never read this as the legal adoption
   date"). But `confidence.ts:88` declares the note "never load-bearing for logic" — so the ONE
   field a point-in-time evaluator reads carries two different semantics distinguished only by
   text the evaluator is forbidden to parse. A query for 2024-01-01 against such a rule returns a
   confident false NOT-IN-FORCE. REPORT §K.2 sanctions ingestion-versioning where the state
   serves no validity axis, but the sanction assumed the graph would *know which is which*.
   **Smallest fix:** one enum field on `RuleProvenanceSchema` — `validityBasis: 'legal' |
   'ingestion'` — before a second adapter copies the E1d pattern.
2. **`SiteIntelDevelopmentPotential` has no time anchor at all** (`entities.ts:456–487`): no
   computedAt, no scenarioRef/envelopeRef, no version pointer. Every other computed artefact is
   pinned (Envelope: `computedAt` + `ruleSetVersion`; Scenario: `asOfDate`). A dev-potential
   record cannot be placed in time or reproduced. Version rows could patch identity but not the
   missing computation key. **Smallest fix:** add `envelopeRef` (or `scenarioRef`) +
   `computedAt` — additive, and it also closes the reproducibility hole for the product-facing
   number, which is the number customers will dispute.

---

## §7 EUROPEAN DATA REGISTRY — recommendation: **NOW, thin**

**One recommendation: implement the machine-readable Source Registry NOW, as schema + data
only — no fetching, no UI, no OME2 harvest yet.**

Why now and not a later lane:

- **The schema already exists and is already in production use by the E1d draft.**
  `SiteIntelSourceSchema` (`entities.ts:378–428`) covers 8–9 of the brief's 12 columns:
  country, authority, dataset, API/download (`endpoint`), format (`protocol`), licence +
  commercial-use (`licence{id, colour, verifiedDate, textRef}` — the GREEN/YELLOW/RED colour IS
  the commercial-use status per REPORT §G), machine-readable status (≈ `protocol` +
  `accessOption` 1–6), plus `gate` and dated `probes[]` which the brief doesn't even ask for.
  **Missing columns: `theme`, `coverage`, `updateFrequency`, `adapterStatus`** — four nullable
  additions, additive, zero migration.
- **Rows already exist in four prose/embryo forms and are actively rotting:** the parcel-provider
  `registry.ts` per-row probe notes (internal-review lane §1.1: "a working source registry"),
  the `heightSources.mjs` per-country `impl:` table (internal review, "itself a source
  registry"), `docs/04-reference/jurisdictions/**` dated probes, and REPORT §F's 30-country ×
  7-axis matrix — which is ALREADY the registry's content in prose. REPORT §H.2 lists "Source
  registry" as **item 1** of the minimum European core; §H.4 row 6 grades it MUST-BUILD
  ("discovery layer post-INSPIRE is DIY").
- **The E1d draft has proven the pattern end-to-end:** `EE_SOURCES` (`eeSources.ts`) is 4 typed
  rows, schema-validated at module load ("a source row that does not parse is a build error"),
  carrying exactly the churn intelligence the registry exists for (PLANIS June-2026 URL-churn
  watch, the axis-order trap, the geometry-column trap — as dated probe notes). Copying this
  pattern per country IS the registry.
- **`adapterStatus` is the coordination column** — it is what turns the registry from
  documentation into the E1b/E1c sequencing instrument (EE → NL → LT → PL, DECISION-SUMMARY
  row 6) without lane-file archaeology per country.

**Cost:** ~1–2 engineer-days. (1) Add the 4 nullable columns to `SiteIntelSourceSchema`;
(2) create one data module per audited country seeded from EE_SOURCES + the four prose forms;
(3) one loader that validates all rows at build time. Nothing fetches; L0 purity untouched.

**What it unblocks:** E1b/E1c country sequencing as data; the §H.2-item-8 coverage heatmap
(`computeScorecard.mjs` extension gets its input table); the licence-audit discipline
(`verifiedDate` becomes queryable — DECISION-SUMMARY row 10b's four outstanding licence texts
become registry nulls that show up); and it freezes the audit's 30-country findings into a
shrink-proof artefact before the prose rots (this repo's documented failure mode — see the
CLAUDE.md count/range boxes).

**Deferred to a later lane, deliberately:** the OME2 Open Cadastral Map harvest (the OSS lane's
"ready source-registry seed for 15 countries": BE HR CZ DK EE GR IE LV LU PL SK SI ES CH NL).
It is a SEED for rows PRYZM has not probed, its licence text is one of the four DECISION-SUMMARY
10b names as un-fetched (YELLOW per-source), and seeding unprobed rows before the probe
discipline exists would mint exactly the unverified-claims table the probes[] field exists to
prevent. Registry first, OME2 rows second.

---

## §8 PARTIAL DATA MUST BE NORMAL — the worked example against the schemas

Brief's example: Parcel ✓ · Buildings ✓ · Planning ✓ · **Height ✗** · FAR ✓ · **GFA DERIVED**.

**Walkthrough — does the site resolve?** Yes, at every layer, and the test file proves the
load-bearing legs:

- **Height ✗ (unknown):** representable THREE ways, all explicit. (1) As a rule:
  `value: null` — and the `superRefine` at `provenance.ts:154–163` makes null **parseable ONLY
  at confidence tier 6** (uncertain-missing); tier 1 + null is a named parse error. Both
  directions are tested (`siteintel.test.ts:471–489`: "value=null at tier 1 is rejected" AND
  "value=null IS representable at tier 6 — absence is an answer"). (2) On the building:
  `height.value` nullable with method labelled (`entities.ts:113–117` — "never 0-as-unknown").
  (3) In the live adapter: the E1d mapper EMITS a tier-6 rule for every unfilled attribute
  (`eeRuleMapper.ts:215–236`) rather than dropping it — UNKNOWN is materialised as a first-class
  row carrying the served raw value (`korgus="0"`) in the note. This is the strongest form of
  the doctrine: a consumer cannot even mistake absence-of-rule for unknown, because unknown
  arrives as a rule.
- **FAR ✓ / GFA DERIVED:** `derivation: 'DERIVED'` is a first-class enum member
  (`provenance.ts:56–61`) with the DK GFA construction as its own doc example; tier 3
  (deterministic-inference) is its confidence home.
- **The site does not fail:** there is no aggregate that requires completeness. The 17 entities
  parse independently (test §5's mini-graph), and the one cross-field integrity rule is
  *anti*-fabrication, not pro-completeness: `SiteIntelDevelopmentPotentialSchema.superRefine`
  (`entities.ts:471–486`) REJECTS a non-null `deltaGfaM2` when either side is null — "a parcel
  with unknown existing GFA has UNKNOWN spare capacity, not maximal capacity" — tested at
  `siteintel.test.ts:491–500` (fabricated delta rejected).

**Doctrine check (context-data-honesty family / L-616):**

- *failure ≠ empty:* enforced at the fetch layer, not the schema layer — correctly.
  `FetchOutcome` (`packages/schemas/src/site/zoning/FetchOutcome.ts`) is composed by the E1d
  client, which classifies zero-features as `absent` and every failure mode (network, HTTP,
  ExceptionReport-in-200, non-JSON, wrong layer) as `transient` naming the endpoint
  (`eeWfsClient.ts:117–185`). E1a's header says it plainly: "these entities are the shapes a
  successful fetch lands in".
- *UNKNOWN never drawn as zero/unbounded (L-616):* at the RULE layer, structural (above). At the
  ENVELOPE layer, the seams are `isUpperBound` — required, no default, "must never silently
  default" (`entities.ts:432–441`) — and `confidenceTier` required with "weakest input governs".

**Two honest weaknesses (neither breaks the gate; name them in the DECISION):**

1. **`SiteIntelEnvelopeSolidSchema.maxHeightM: null` is overloaded** (`entities.ts:414–420`):
   the doc comment defines null as "geometrically determined but no published vertical limit" —
   a POSITIVE claim — while an UNKNOWN height input would produce the same null on the solid.
   The distinction lives only in `confidenceTier` + `derivationTrace`, i.e. one level up. A
   consumer reading solids alone can render an unbounded prism from a tier-6 height — the exact
   L-616 overstatement, one dereference away. The C58 authority (refusal vocabulary,
   over-statement doctrine) governs the scene-space twin, but this catalogue form can leak into
   naive consumers. **Smallest fix:** forbid `maxHeightM: null` when the envelope's
   `confidenceTier.tier === 6`, or require solids derived from unknown heights to be refused
   into `determinationRef`-less honesty — an E1b evaluator rule at minimum, a superRefine
   ideally.
2. **The converse of "null only at tier 6" is a modelling asymmetry, not a bug, but should be
   stated once:** a state-CONFIRMED "no restriction exists" (a positive finding) is NOT
   representable as a rule (`value: null` forces tier 6 = uncertainty). `ruleformat.ts:117–124`
   handles this deliberately for packs — confirmed-absence is encoded as absence-from-`rules`
   with pack-level curation ("the packs' nulls are mostly POSITIVE findings... not
   uncertainty") — but in an ADAPTER stream (no pack curation layer) a confirmed no-limit has no
   carrier at all. The asymmetry errs in the safe direction (you cannot accidentally mint
   no-limit), so: accept, document, revisit only if a state is found that machine-serves
   "no limit" as a value (none probed does).

**Coercion audit:** could a consumer silently coerce absence? Not through any parse path — every
null is either tier-6-guarded (rule value), method-labelled (building height), delta-guarded
(dev potential), or refine-guarded (Terrain tileRef/dtmRef, Restriction geometry/areaShare).
The remaining coercion surface is post-parse consumer arithmetic (`gfaM2 ?? 0` in some future
engine) — unpoliceable at L0, which is exactly why the §10 test's LT rows below make
"MAX_INTENS must stay refused until unit resolution" an acceptance criterion rather than
trusting the schema alone.

---

## §9 COUNTRY-ADAPTER BOUNDARY — E1d Estonia draft (uncommitted) + one existing adapter

Audited: all 8 files of `packages/site-parcel-data/src/countryAdapters/ee/` (1,700 lines,
untracked per `git status`). Allowed list: source discovery ✓ (`eeSources.ts`), fetching ✓
(`eeWfsClient.ts`), schema mapping ✓ (`eeParcelProvider/eePlanProvider/eeBuildingsProvider` +
`eeRuleMapper`), country semantics ✓ (the "0"/""-means-UNKNOWN rule, the axis-order and
geometry-column traps, the applicability ladder as data), document extraction — correctly
ABSENT (tingimus prose is carried verbatim and explicitly NOT parsed, `eeRuleMapper.ts:283–305`).

**FLAGS (everything found; severity honest):**

1. **`ee/index.ts:96–100` + `:134` — generic polygon-centroid geometry inside the adapter**
   (`ringCentroid`, a vertex-mean). Two problems: (a) it is generic geometry math, which the
   forbidden list places in core, and the next adapter will copy-paste it; (b) it is WRONG as a
   representative point — a vertex-mean is biased by vertex density AND by the GeoJSON closing
   vertex (the ring parser at `eeParcelProvider.ts:96–107` keeps the duplicated closing pair),
   and for a concave/L-shaped parcel the centroid can fall OUTSIDE the parcel, silently querying
   the neighbour's plan features — a wrong-RESULT risk, not a style nit. Also computed twice on
   `:134`. **Fix direction:** a representative-point (pole-of-inaccessibility or
   point-on-surface) util in core geometry, consumed by adapters — or query the plan layers by
   the parcel ring's bbox instead of a point. LOW severity today (Kopli tn 2 is convex),
   structural if replicated.
2. **Architectural note, not a violation — `eeRuleMapper.ts:208/:303`: applicability
   `geometryRef`s are minted strings (`dp_hoonestus:<objectid>`) that resolve to no graph
   entity.** Not business logic — but it is the adapter quietly DEFINING the core's reference
   discipline by default (see §3 risk). The boundary rule this brief enforces ("generic
   applicability" belongs to core) is why this must be settled in the E1b contract, not
   per-adapter.
3. **Shape deviation, sanctioned:** `index.ts:222` `rules: { kind: 'structured', fetchChain }`
   vs REPORT §J's `fetch(parcel): FetchOutcome<Rule[]>`. The header explains why (the shared SDK
   type is roadmap item 3, "NOT minted here — minting a rival core interface from a lane would
   be the L-7060 shape") — correct restraint, but the E1b SDK lane must reconcile the signature
   or the second adapter will diverge again.

**Explicit clean bill on the six forbidden items (grep evidence):**

- *Generic envelope geometry / FAR calculation / development-potential:* `grep -n
  "gfaM2|Envelope|maxVolume|DevelopmentPotential|deltaGfa| \* |Math\." countryAdapters/ee/*.ts`
  → only 2 doc-comment hits, ZERO code hits. The mapper never multiplies anything; `sbp`
  (state-served GFA) is carried as served, never recomputed.
- *Generic confidence:* tier assignment in `eeRuleMapper.ts` (12 `tier` mentions) uses ONLY the
  shared E1a vocabulary (tiers 1/6) driven by a MEASURED country semantic (lane-4 EE-1
  fill-quality rule) — this is the allowed "country semantics", and is in fact the exemplar of
  it. No rival confidence enum, no numeric scoring.
- *Generic provenance:* every rule is built through `SiteIntelRuleSchema.parse` (imported from
  `@pryzm/schemas`, `eeRuleMapper.ts:167`); `FetchOutcome` helpers (`fetchFound/fetchAbsent/
  fetchTransient`) are imported, not re-minted (`eeWfsClient.ts:60`).
- *Generic applicability:* the EE applicability LADDER is data + captions
  (`index.ts:58–80`), evaluated by nothing in the adapter.

**Spot-check of one existing jurisdiction adapter (the framework the internal-review lane
names):** `parcelProviders/dkMatrikelParcelProvider.ts` — a deferred stub (MitID access gate,
founder-ruled 2026-07-30) that returns null honestly, never fabricates, carries the single
`// DEFERRED:` swap-in seam, and holds geometry + identity ONLY. Framework-wide grep across
`parcelProviders/*.ts` for envelope/FAR leakage: every provider self-declares and honours
"GEOMETRY + identity only (no envelope)" (brussels/dgt/flandersGrb/gbOsInspire/mml/scotlandRos/
wallonia), and `sfParcelProvider.ts:321` is explicit: "never a buildable envelope. Emits NO FAR
(SF is height-and-bulk, not FAR — ADR-0270)". **CLEAN.** The boundary discipline the brief
demands already has a lived tradition in this framework; E1d inherits it faithfully.

---

## §10 THE 20-PARCEL ARCHITECTURE TEST — definition + expected-grade baseline

**Definition (DEFINE, not implement).** For each parcel below, the real test later runs the
nine-step chain and records each step's grade; THIS table is the acceptance baseline it is
compared against. Steps: **P** parcel → **C** contextual (buildings/terrain) → **S** planning
source (the service answers) → **PL** applicable plan → **R** applicable rule (numeric) →
**E** evidence (machine-anchorable citation) → **D** deterministic constraint (typed
`SiteIntelRule` set) → **V** envelope → **DP** development potential.
Grades: DIRECT / DERIVED / AI / HUMAN / MISSING (brief §10). Two structural expectations apply
to every row, from REPORT §R: **V is never state-served (0/20) — expected DERIVED wherever R
resolves, and that derivation is PRYZM IP**; and E is expected DIRECT-anchorable in all 20
(the doc URL or attribute address is machine-served everywhere probed).

All 20 candidates are lane-named (probed 2026-08-31; EE re-probed by E1d 2026-09-01). One needs
a pinned id (DE-B); one is a deliberate measured-negative (PT-B).

| # | CC | Parcel (lane-named, verbatim) | P | C | S | PL | R | E | D | V | DP | Chain must PROVE (the per-row acceptance criterion) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | DK | København Nørrebro, matr. 4801 Udenbys Klædebo Kvarter, BFE 6021259 | DIRECT | DIRECT (BBR key-gated: gate recorded ≠ absence) | DIRECT | DIRECT (ramme R24.B.3.40) | DIRECT (bebygpct=150, **af=4**) | DIRECT | DIRECT | DERIVED | DERIVED | **The denominator branch:** af=4 → per-cadastral-parcel multiply is legal; the rule must carry the codelist row from `vocabularies/dk.ts`, never an assumed basis (C63 lesson as wire data). |
| 2 | DK | Aarhus Midtby, matr. 7000ad Aarhus Bygrunde, BFE 5625716 | DIRECT | DIRECT | DIRECT | DIRECT (lokalplan 591, numerics null) | DIRECT via 4-layer fallback (ramme 010109CY: bebygpct=180, **af=1**) | DIRECT | DIRECT | DERIVED | DERIVED/**REFUSED per-parcel** | **The anti-trap:** af=1 = plan-area-as-a-whole → a per-parcel 180% GFA must be REFUSED, not computed; plus the precedence ladder (null lokalplan → ramme) exercised as data. |
| 3 | EE | Tallinn Kalamaja, 78401:101:7194 (Kopli tn 2) | DIRECT | DIRECT (etak_ehr 121395845) | DIRECT | DIRECT (sysid 30100071 → DP041780) | **DIRECT incl. served GFA** (tihedus 2.1 · protsent 61 · korgus 17.4 · sbp 3500) | DIRECT | DIRECT + tier-6 rows for unfilled siblings | DERIVED (volume only — GFA number is DIRECT) | **DIRECT(permitted GFA)** / DERIVED | The reference chain (E1d already runs it): served-GFA collapses the envelope step to geometry assembly; sibling korgus="0" must emit a tier-6 rule, never 0/no-limit. |
| 4 | EE | Tallinn Old Town, 78401:101:0109 (Raekoja tn 4 // 6) | DIRECT | DIRECT | DIRECT | **absent-with-caveat** (dp_kehtiv 0 features, measured) → üldplaneering | DIRECT (use only) / AI (numerics in heritage statute) | DIRECT | AI→HUMAN | DERIVED after extraction | DERIVED | **The absence leg:** `absent` must carry `EE_PLANK_ABSENCE_CAVEAT` (not-in-PLANK ≠ no plan); the fallback ladder step 3→4 exercised; no numeric invented from the use code. |
| 5 | DE | Köln, Flurstück 05495800500898 (Gemarkung Köln, Flur 005, Nr. 898) | DIRECT | DIRECT | DIRECT (NRW OGC API) | DIRECT (5 B-Pläne + officialDocument PDF URL) | **AI** (GRZ/GFZ/H in PDF only) | DIRECT (PDF machine-addressed) | AI→HUMAN | DERIVED after extraction | DERIVED(permitted)/MISSING(existing) | The document-country leg: rule rows must carry document/article/page addressing (the `DE_BRIEF_11_EXAMPLE` shape) and derivation AI_EXTRACTED, tier 4 until human-validated. |
| 6 | DE | Cramonshagen (MV), B-Plan Nr. 4 Baugebietsteilfläche — **CANDIDATE NEEDS PINNING:** the lane probed the XPlanung feature but named no Flurstückskennzeichen; pin any MV-ALKIS parcel intersecting that Baugebietsteilfläche | DIRECT (once pinned) | DIRECT | DIRECT (MV XPlanung WFS) | DIRECT | **DIRECT** (grz=0.4, z=1, Dachform; gfz/hoehenangabe EMPTY) | DIRECT | DIRECT + tier-6 for the empty gfz/hoehenangabe | DERIVED (storey route) | DERIVED | The structured-DE leg (the brief's own "XPlanGML-served B-Plan" ask, satisfied by MV): empty XPlanung attributes must land as tier-6 UNKNOWN rules, and the storey-count GFA route must cite z=1, not a fabricated GFZ. |
| 7 | CH | Luzern, parcel 3729, EGRID CH873588275009 | DIRECT (ÖREB GetEGRID) | DIRECT | DIRECT | DIRECT (Nutzungsplanung TypeCodes w/ geometry) | AI (BZR Luzern named as THE doc) | **DIRECT — best-in-class** (ÖREB legal provisions) | AI→HUMAN | DERIVED after extraction | MISSING until extraction | The consume-not-rival leg (REPORT §H.3 row 6): the evidence chain must MIRROR the ÖREB extract's restriction→typeCode→lawStatus→document hops into `SiteIntelRestriction`/`Evidence`, not re-derive them. |
| 8 | CH | Basel, parcel 0039, EGRID CH516702897010 | DIRECT | DIRECT | DIRECT | DIRECT (Schutzzone + Wohnanteil overlay) | AI (versioned-law API + ÖREBlex PDFs) | DIRECT | AI→HUMAN | DERIVED | MISSING until extraction | **The areaShare leg:** 11 BauStrassenWeglinien restrictions arrive with `Geometry: []` + AreaShare — must parse as geometry:null+areaShare (the entities.ts refine), and the envelope must degrade honestly where the carve cannot be located. |
| 9 | ES | Barcelona, C/ Sancho de Ávila 174–180, refcat 2940601DF3824B | DIRECT | DIRECT (wfsBU: 10 BuildingParts, floors) | DIRECT | DIRECT (PGM/Refós, prod path) | **HUMAN** (pack es-08019: doc-derived + human-validated, cited refusals) | DIRECT | HUMAN | DERIVED (where the 20.9% resolves) | **DERIVED(permitted) / DIRECT(existing — OfficialArea 19,567 m²)** | The pack-migration pilot leg (DECISION row 5): the TS pack's rules re-expressed as `DeclarativeRuleSchema` must golden-match; permitted−existing computable TODAY only here. |
| 10 | ES | Madrid, C/ Castelló 47, refcat 2255404VK4725E | DIRECT | DIRECT (service-level) | DIRECT (VPLA_V_ORDENANZA — EPSG:25830 ONLY; 4326 bbox silent-zero) | DIRECT (NZ 1 grado 3º, PGOUM 1997) | AI/HUMAN-pending (altura 3.6% populated; rule FRAGMENTS as data: ático retranqueo 3 m) | DIRECT | AI→HUMAN | DERIVED (partial — NZ-1 ring) | MISSING(permitted)/DIRECT(existing DNPRC) | The native-CRS trap as acceptance: the chain must FAIL if queried in 4326 (silent zero = the Madrid trap in `entities.ts`'s own invariants); mixed served-fragment + doc rules coexist in one rule set. |
| 11 | FR | Paris 11e, idu 75111000BK0051 (section BK n°0051, 388 m²) | DIRECT | DIRECT (BD TOPO hauteur) | DIRECT (GPU) | DIRECT (UG, idurba 75056_PLU_20260616 + règlement PDF) | AI | DIRECT (idurba = versioned doc identity for free) | AI→HUMAN | DERIVED after extraction | MISSING/DERIVED (volume proxy) | The prescription leg: the 4 GPU prescription-surf polygons (incl. "Hauteur plafond" 39-02) must land as `SiteIntelPrescription` rows with typepsc typology, value pending ≠ value zero. |
| 12 | FR | Lyon Presqu'île, idu 69382000AB0062 (AB 0062, 2,861 m²) | DIRECT | DIRECT | DIRECT | DIRECT (UCe1b, PLUi 200046977_PLUI_20260326) | AI | DIRECT | AI→HUMAN | DERIVED after extraction | MISSING/DERIVED | Same as FR-A on a PLUi (intercommunal) instrument — proves plan-kind is an open string, not a PLU assumption. |
| 13 | NL | Amsterdam Dam-square block, ASD04 F 8039 (43 m²; sibling ASD04 F 8137) | DIRECT | DIRECT (3DBAG Pand NL.IMBAG.Pand.0363100012243483, LoD2.2) | DIRECT (key-gated, FREE — the key request is DECISION row 6's week-1 action) | DIRECT | **DIRECT** (Ozon normwaarden + RP maatvoeringen) | DIRECT (Normwaarde 3-way split → valueLocation) | DIRECT | DERIVED | DERIVED | **The dual-regime merge leg** (§J first-class capability): IMOW ∪ IMRO by temporal validity in ONE rule set; `waardeInRegeltekst` values must map to `in-document-text` (the imported `nl.ts` function), never to a numeric guess. |
| 14 | NL | Utrecht Domplein, UTT00 C 1203 (164 m²) | DIRECT | DIRECT | DIRECT (key-gated free) | DIRECT | DIRECT | DIRECT | DIRECT | DERIVED | DERIVED | Second NL point proves the path is national, not an Amsterdam special case. |
| 15 | PT | Tavira, NIC AAA 000 582 219 (PT.DGT.CP.AAA000582219, 32 m²) | DIRECT (OGC API `cadastro`) | DERIVED (nDSM; no national footprint+height) | DIRECT | DIRECT (CRUS class + PDM Tavira via SNIT) | AI (PDM regulamento text) | DIRECT | AI→HUMAN | DERIVED after extraction | MISSING | The CGPR-vintage leg: parcel temporal extent 2000–2007 — the Version/ingestion axis must record vintage, and existing-GFA must stay MISSING (matriz predial is fiscal, not open), never proxied silently. |
| 16 | PT | Central Lisbon (Baixa/Avenidas bbox — **deliberate measured-negative**: numberMatched 0, no national parcel exists) | **MISSING (measured)** | DIRECT (context) | DIRECT (source answers) | DIRECT (Lisbon PDM 2011 via municipal ArcGIS) | AI | DIRECT | AI | DERIVED (over municipal/user-drawn geometry) | MISSING | **The honest-absence leg:** the chain must return absent-with-citation at P and still proceed on a fallback geometry labelled as such — genuine absence ≠ gate ≠ failure, end-to-end. |
| 17 | LT | Vilnius, kad. Nr. 0101/0054:0328 (unikalus_nr 440055970193, 0.1544 ha) | DIRECT | DIRECT (existence; heights DERIVED) | DIRECT | DIRECT (TPD_URL → doc card) | DIRECT-where-filled / AI-else (ASGR fill 14–18%) | DIRECT (**per-value** `*_TP/_NR/_D/_TPR` columns → RuleSourceRef) | DIRECT + **REFUSED: MAX_INTENS** | DERIVED **after unit resolution only** | MISSING until then | **The unit-refusal leg:** MAX_INTENS (unit unresolved — `lt.ts` header caution) must produce a REFUSAL/tier-6, and any GFA computed from it is an acceptance FAILURE; PILN=N must surface as a completeness caveat on the rule set. |
| 18 | LT | Vilnius, kad. Nr. 0101/0054:0345 (adjacent block) | DIRECT | DIRECT | DIRECT | DIRECT | DIRECT-where-filled / AI-else | DIRECT | DIRECT+REFUSED | DERIVED after unit resolution | MISSING until then | Same; lane notes re-run in Kaunas post-adapter for geographic spread (national services — an allowed later swap, not a gap now). |
| 19 | PL | Warszawa, dz. 24/35 obr. 5-03-09 (`146510_8.0309.24/35`) | DIRECT (ULDK) | DIRECT (BDOT10k GeoParquet) | DIRECT | DIRECT-reference (MPZP via KIMPZP) / POG **pending RU fill ≤2026-11-30** | **MISSING today → DIRECT after RU** (the source-class flip, §J mandatory capability) / AI (MPZP text) | DIRECT | DERIVED+AI | DERIVED | DERIVED (POG ceiling) | **The regime-flip leg:** the adapter's RuleSource kind must flip document→structured WITHOUT a core change when RU fills; the test pins the pre-flip grades so the flip is visible as a grade IMPROVEMENT, not a silent rewrite. |
| 20 | PL | Kraków, dz. 311 obr. 1 Śródmieście (`126105_9.0001.311`) | DIRECT | DIRECT | DIRECT | as PL-A (POG adopted earlier in 2026 — verify at RU) | MISSING→DIRECT / AI | DIRECT | DERIVED+AI | DERIVED | DERIVED | Second PL point; earlier POG adoption may make this the FIRST PL chain to flip — the pair brackets the transition window. |

**Test-wide acceptance rules (beyond the per-row column):**
1. Every graded step lands as a typed artefact (FetchOutcome + E1a entity), never a prose note —
   grades are read OFF the artefacts, or the run is invalid (committed ≠ reachable doctrine).
2. Any UNKNOWN encountered must be visible as a tier-6 rule or a nulled field with its guard —
   a chain that silently drops an unfilled attribute fails even if every number it did emit is right.
3. Envelope rows assert `isUpperBound` explicitly per row; a chain may not emit an envelope with
   unresolved height inputs unless `isUpperBound:false` + degraded tier (the §8 finding-1 seam).
4. The baseline above is shrink-only in the MISSING/AI direction: a later run may upgrade a step
   (AI→HUMAN, MISSING→DIRECT after a regime flip) but any DOWNGRADE from this table is a
   regression requiring a named cause (source churn is a probe-log entry, not a silent re-grade).

---

## TOP-3 FINDINGS OVERALL

1. **(§3/§9) `geometryRef` has no declared referent and the first live producer emits refs that
   resolve to nothing** — `entities.ts:308`/`:193` are bare ids with no target-kind contract; the
   E1d mapper mints `dp_hoonestus:<objectid>` strings (`eeRuleMapper.ts:208`) that name no graph
   entity. Spatial expressibility is intact; TRACEABILITY of "why does this rule apply HERE" is
   not, and every subsequent adapter will copy the pattern. Settle it in the E1b contract now
   (either adapters must mint the Prescription/Zone they cite, or the ref is declared an opaque
   adapter locator with Evidence carrying resolution).
2. **(§6) Ingestion-time-as-`valid_from` is distinguishable from legal validity only by prose in
   a field documented as never-load-bearing** (`eeRuleMapper.ts:131–141` vs `confidence.ts:88`).
   Point-in-time queries — the §6 requirement and DECISION row 8's funded feature — will return
   confident false negatives on exactly the rows where the state served no validity axis. One
   additive enum (`validityBasis: 'legal' | 'ingestion'`) on `RuleProvenanceSchema` closes it;
   it should land before a second adapter exists.
3. **(§8) The envelope-solid `maxHeightM: null` overloads "no published vertical limit" with
   "height unknown"** (`entities.ts:414–420`) — the one place in E1a where the L-616
   overstatement (UNKNOWN drawn as unbounded) is a single naive dereference away, because the
   guard (`confidenceTier`, `isUpperBound`) lives one level above the solid a renderer consumes.
   Guard it structurally (superRefine tier-6 ⇒ no null-capped solids) or as a hard E1b evaluator
   rule + the §10 test-wide rule 3.

**§7 in one line for the DECISION:** Source Registry = NOW, thin (schema exists as
`SiteIntelSourceSchema`; add theme/coverage/updateFrequency/adapterStatus as nullable columns;
seed from EE_SOURCES + the two registries' prose notes + REPORT §F; ~1–2 days; defer the OME2
15-country seed until its licence text is fetched per DECISION-SUMMARY 10b).
