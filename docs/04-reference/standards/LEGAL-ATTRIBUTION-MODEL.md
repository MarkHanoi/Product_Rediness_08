# The Legal Attribution Model — deciding WHICH correctly-read value binds

> **Status:** SHIPPED as a typed layer, WIRED INTO NOTHING (deliberately — §8) · **Date:** 2026-07-31
> **Code:** `packages/ordinance-extraction/src/attribution/**` (L2, pure, no I/O)
> **Extends:** the `resolved` / `conflicted` / `unknown` output of `src/envelope/**`. It does not replace it.
> **Reference model:** `dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md` §4 state machine
> **Ratified vocabulary:** `ENVELOPE-REPLICATION-STANDARD.md` §"Legal status is an evidence attribute"

## Evidence discipline

Claims are tagged **VERIFIED** (read from a live response, a repo file, or a local test run on the
stated date), **ASSERTED-UNVERIFIED** (stated by a source, not independently re-read), or
**UNKNOWN** (not measured, named rather than left silent). An untagged factual claim is a bug.

---

## §0 — The problem this layer exists to solve

Parsers are reading values **correctly** and packs are still wrong, because nothing decides which
reading is authoritative.

| Jurisdiction | Multiple correct readings | Which binds |
|---|---|---|
| **Berlin B-Plan 8-30** | GRZ `0,3` · `0,39` · `0,4` · `0,8` — all four are correct readings of the text | `0,4` (the §9 BauGB Festsetzung). `0,3` is the 1958/60 Baunutzungsplan's *depiction* (`dargestellt`, §5 BauGB). Taking `0,8` overstates footprint **2×** |
| **Madrid NZ 7 grado 2º nivel e** | FAR `0,5` (Art 8.7.9) vs `1,0` (Art 8.7.20) | **unresolved** — and correctly left unpicked |
| **Paris** | `plub_filet` / `plub_hauteur` / `plub_hmc` | precedence **UNKNOWN** |
| **Denmark byggefelt** | binding vs advisory | **SOLVED** via published metadata booleans |

The German finding states it exactly (`de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` §9):

> *"The next missing component is not a better parser, it is a document MODEL."*

**The central claim of this layer:** legal status is a property of a **statement**, not of a
document. Berlin 8-30 contains, inside one binding plan, a binding Festsetzung, a superseded
instrument's depiction, a statutory overrun allowance and a descriptive computation. A model that
attaches `legalStatus` to the *document* cannot express that. This one attaches it to the
**evidence**.

---

## §1 — The model: `ParameterEvidence<T>`

One **candidate reading** of one parameter, carrying its provenance and its authority.
Source: `src/attribution/types.ts`.

```ts
interface ParameterEvidence<T> {
  parameter: string;               // 'maxHeight_m' | 'farRatio' | 'buildableDepth_m' | 'worksRegime' …
  value: T | null;                 // null is legitimate: prohibited / graphical / could-not-read
  unit?: string;

  instrument: InstrumentRef;       // WHICH legal instrument this statement belongs to
  legalStatus: LegalStatus;        // binding | illustrative | superseded | unknown
  legalStatusSource: LegalStatusSource; // metadata | plan_text | statute | unresolved
  ruleKind: RuleKind;              // numeric | formula | graphical | conditional | reference
                                   // | prohibited | discretionary | unknown
  citation: EvidenceCitation;      // { document, article?, paragraph?, page?, verbatim }
  confidence: EvidenceConfidence;  // unknown | low | medium | high
  note?: string;
}
```

### `parameter` is a `string`, not the `ExtractableField` enum — on purpose

The attribution layer must be able to rank parameters the envelope-field vocabulary does not
contain. Madrid's only *express* precedence clause (Art. 8.0.6) governs **`worksRegime`** and
**`hospedajeUseConditions`** — neither is a buildable-envelope field, and both are load-bearing for
the priority table (§3.2). Narrowing `parameter` to `ExtractableField` would make the one real
Spanish precedence rule inexpressible. The three jurisdictions in the repo also disagree on names
(`maxFAR` in `src/types.ts`, `farRatio` in the Madrid extraction JSON) — the attribution layer takes
the caller's vocabulary and never rewrites it.

### `InstrumentKind` — the enum that would have caught Berlin

| Kind | Meaning | The case it exists for |
|---|---|---|
| `binding-plan` | the instrument whose own determination this is | Berlin 8-30 §9 BauGB Festsetzung; PGOUM Norma Zonal; Lokalplan |
| `superseded-plan` | an instrument no longer in force for this parcel | a repealed B-Plan |
| **`depiction`** | **this document *describing another instrument's* content** | **Germany `dargestellt` (§5 BauGB) — the one that broke Berlin** |
| `catalogue-overlay` | a catalogue / overlay / protection listing layered over a base plan | Madrid Catálogos de Protección (Art. 8.0.6) |
| `special-plan` | an area-specific regime that substitutes for the base plan | Madrid API / APE / APR |
| `statute` | national/regional law applying above any plan | BauNVO §19(4); BR18 |
| `unknown` | **could not classify** (mandatory — §5 invariant 3) | an un-attributed grammar hit |

`depiction` is the axis nothing else in the codebase had. It is **orthogonal to whether the depicted
instrument is in force**: Berlin 8-30 p8 says the Baunutzungsplan *"weiter gilt"* (still applies) and
*still* its GRZ 0,3 does not bind this parcel, because 8-30's own Festsetzung supersedes it there.
So the fixture carries `kind: 'depiction'` **and** `legalStatus: 'superseded'` — two independent
facts, both true.

### `LegalStatus` × `LegalStatusSource`

`legalStatus ∈ {binding, illustrative, superseded, unknown}` — ratified in
`ENVELOPE-REPLICATION-STANDARD.md`; `superseded` is added here as the fourth (invariant 4: superseded
/ illustrative / absent / errored are four different results).

`legalStatusSource ∈ {metadata, plan_text, statute, unresolved}` records **how we know**, and the
resolver never reads it. That is what lets producers be added per country without new resolver logic
(the DK probe §6 conclusion).

| Jurisdiction | `legalStatusSource` | Evidence | State |
|---|---|---|---|
| **Denmark** | `metadata` | Plandata publishes `bygkunifelt` / `bygvejledende` as booleans | **VERIFIED** (DK probe §2, live `DescribeFeatureType` 2026-07-31) |
| **Germany** | `plan_text` | the verb decides: `festgesetzt`/`begrenzt auf` vs `dargestellt` | **VERIFIED** (WP1-WP6 §4, parser run over 209 pages) |
| **Madrid** | `statute` | the PGOUM determines legal force | **ASSERTED-UNVERIFIED** — expected, no producer built |
| **Paris** | `unresolved` | precedence between `plub_filet`/`plub_hauteur`/`plub_hmc` is not known | **UNKNOWN** |

### `RuleKind` — what SHAPE the rule is

`numeric | formula | graphical | conditional | reference | prohibited | discretionary | unknown`.

It is deliberately **not** an input to ranking (§2). It answers "can this become a number at all",
and it is why `discretionary` must never stand in for "could not classify": `discretionary` is a
positive legal claim (a named authority decides case-by-case — Madrid NZ 1's CPPHAN, Art. 8.1.15.1).
France's first taxonomy dropped `unknown` and thereby forced every unclassifiable rule into a
positive claim. Every enum in this model carries `unknown`.

### `EvidenceConfidence` is NOT `EnvelopeConfidence`

Two different axes, kept apart on purpose:

- **`EnvelopeConfidence`** (`@pryzm/schemas`) — the *human-verification tier*. Always
  `pipeline-extracted-unverified` for machine output; the only door up is a recorded sign-off
  (`confidence.ts` LOCK 3 / L-449). This layer does not touch it.
- **`EvidenceConfidence`** (`unknown | low | medium | high`) — how sure we are we **read and
  attributed this statement correctly**. Ordered, and the resolver is monotone in it (§5 invariant 2).

---

## §2 — The resolver contract

```ts
resolveParameter<T>(candidates: readonly ParameterEvidence<T>[],
                    table?: InstrumentPriorityTable): Resolution<T>
```

returns exactly one of

```ts
{ status: 'resolved',   value, winner, rejected[], reason, confidence }
{ status: 'conflicted', candidates[], reason }   // NO VALUE. Never picks.
{ status: 'unknown',    reason, rejected[] }
```

This mirrors `EnvelopeParameterOutcome` (`src/envelope/types.ts`) exactly — the three-outcome shape
is the package's existing contract and is extended, not replaced.

### The stages, in order (`src/attribution/resolve.ts`)

| # | Stage | Outcome if it fires |
|---|---|---|
| 0 | no candidates | `unknown('no-candidates')` |
| 1 | **every** candidate `legalStatus: 'unknown'` | `unknown('no-candidate-has-established-legal-status')` — **invariant 2**: a resolver cannot manufacture certainty from a set of uncertainties |
| 2 | `instrument.supersededBy` present ⇒ treat as `superseded` | demoted, recorded in `rejected[]` |
| 3 | drop `superseded` and `illustrative` | if none survive → `unknown('all-candidates-non-binding')`, with the full rejection trail |
| 4 | drop `unknown`-status candidates (≥1 known-binding candidate exists by now) | recorded in `rejected[]` |
| 5 | drop `value === null` | if none survive → `unknown`, reason naming the strongest survivor's `ruleKind` (`graphical` → "the value lives on the drawing"; `prohibited` → "development is prohibited") — **never 0, never a default (invariant 5)** |
| 6 | all surviving values equal | `resolved` by corroboration — no table needed |
| 7 | no table registered for the jurisdiction | `conflicted('no-priority-table')` — **Paris** |
| 8 | any survivor's `InstrumentKind` is unranked in the table | `conflicted('unrankable-instrument-kind')` |
| 9 | ≥2 survivors share the **minimum** rank with **different** values | `conflicted('tie-on-authority')` — **invariant 1, Madrid** |
| 10 | otherwise | `resolved`, winner = the unique minimum-rank candidate; every other survivor in `rejected[]` with a reason |

`resolution.confidence` is **copied from the winner** and never computed upward (invariant 2).

**Stage 8 is the safe direction and is worth stating explicitly.** An unranked kind does *not* mean
"the ranked one wins". It means the table has nothing to say about this comparison, so the resolver
refuses. That is what keeps Madrid's Art. 8.0.6 narrow (§3.2) instead of letting a catalogue listing
quietly beat a Norma Zonal on FAR.

---

## §3 — Per-jurisdiction priority tables, as DATA

`src/attribution/priority.ts` + `src/attribution/tables/*.ts`. A table is a value, not a function:

```ts
interface InstrumentPriorityTable {
  jurisdiction: string;                                  // 'de' | 'es-md' | 'dk'
  displayName: string;
  citation: string;                                      // WHERE the precedence rule comes from
  rank: Partial<Record<InstrumentKind, number>>;         // lower = stronger; ABSENT = unrankable
  parameterOverrides?: readonly ParameterPriorityOverride[];  // invariant 6
  note?: string;                                         // honest limits, carried in-band
}
```

### §3.1 Germany — `tables/germany.ts`

| Rank | Kind | Legal basis |
|---:|---|---|
| 0 | `binding-plan` | §9 BauGB — the B-Plan's own Festsetzung is the parcel-specific determination |
| 1 | `special-plan` | a vorhabenbezogener B-Plan / Ergänzungssatzung |
| 2 | `statute` | BauNVO — general law layered above the plan, e.g. the §19(4) overrun ceiling |
| 3 | `depiction` | §5 BauGB — a preparatory instrument merely *depicts* |
| 4 | `superseded-plan` | not in force for this parcel |

`catalogue-overlay` is **absent** — Germany's Denkmalschutz interaction has not been researched here,
so it is unrankable rather than guessed. **UNKNOWN**, named.

The decisive line is `binding-plan (0) < statute (2)`: Berlin's `0,8` is a *correct* reading of a
*binding* statute, and it still loses, because §19(4) BauNVO grants an overrun above a base the
plan sets — it is not itself the base. This is the ranking that produces `0,4`.

### §3.2 Madrid — `tables/madrid.ts`

Source: `es/es-md/28079-madrid/findings/COMPENDIO-2025-EXTRACTION-01.md` §5.

> **There is no global precedence clause in the PGOUM.** The ordering is assembled from four
> independently-scoped clauses (8.0.6, 8.0.4, 3.2.7, 3.2.10, 3.2.13). That sentence is carried
> verbatim in the table's `note` field so a reader of the data — not only a reader of this doc —
> meets it.

Base ranks:

| Rank | Kind |
|---:|---|
| 0 | `special-plan` (API/APE/APR — Art. 8.0.4 makes the área classes *mutually exclusive*, so where one applies it substitutes rather than layers) |
| 1 | `binding-plan` (Norma Zonal — governs *ordenación directa* land) |
| 2 | `superseded-plan` |

**`catalogue-overlay` is deliberately absent from the base ranks.** Art. 8.0.6's override is narrow —
*régimen de obras* and the *hospedaje* use conditions **only**. It says nothing about FAR, height or
coverage. So the catalogue gets rank 0 through a **per-parameter override** and is otherwise
unrankable:

```ts
parameterOverrides: [
  { parameters: ['worksRegime', 'hospedajeUseConditions'],
    rank: { 'catalogue-overlay': 0, 'special-plan': 1, 'binding-plan': 2, 'superseded-plan': 3 },
    citation: 'Art. 8.0.6 (PDF p366, printed 364)' },
]
```

This is **invariant 6 (per-parameter, not per-rule) doing real work**: the identical catalogue
listing outranks the Norma Zonal on `worksRegime` and cannot be ranked against it at all on
`farRatio`. A rule stored atomically with one priority cannot express that.

### §3.3 Denmark — `tables/denmark.ts` + `denmarkByggefelt.ts`

Denmark barely needs a rank table, because the register answers the question directly. The reusable
part is the **state machine** (`dkByggefeltLegalStatus`), transcribed from the probe §4:

| `bygkunifelt` | `bygvejledende` | → `legalStatus` | note |
|---|---|---|---|
| `true` | `false` | **`binding`** | published explicit-area geometry |
| any | `true` | `illustrative` | an explicit municipal declaration; **do not text-classify it away** |
| `false` | `false` | `unknown` | the register declines to classify (10.7 % — the correctly-scoped target for a text parser) |
| `true` | `true` | `unknown` (**data conflict**) | 179 records; refuse to infer, emit as QA |
| `null` on either | `unknown` (**metadata unavailable**) | **`null` ≠ `false`** |

All four map to `legalStatusSource: 'metadata'`. The counts (n = 57,035; 23.9 % binding) are
**VERIFIED-LIVE** in the probe and are not re-verified here.

### §3.4 France / Paris — no table

`plub_filet` (the coded hauteur-plafond letter), `plub_hauteur` and `plub_hmc` have **UNKNOWN**
precedence. No FR table is registered. Three candidates therefore resolve to
`conflicted('no-priority-table')` — the honest answer, and one that produces a fixable
data-sourcing question rather than a silent wrong number.

---

## §4 — How each jurisdiction's real case resolves

All four are pinned as tests in `__tests__/attribution/`, on real verbatims.

| Case | Candidates | Result | Mechanism |
|---|---|---|---|
| **Berlin 8-30 GRZ** | `0,4` binding-plan/binding · `0,3` depiction/superseded · `0,39` binding-plan/**illustrative** · `0,8` statute/binding/conditional | **`resolved` = 0,4** | stage 3 drops `0,3` (superseded) and `0,39` (illustrative); stage 10 ranks `binding-plan(0)` over `statute(2)` |
| **Madrid NZ 7.2.e FAR** | `1,0` Art 8.7.20 · `0,5` Art 8.7.9 — same instrument, same kind, same status | **`conflicted`, no value** | stage 9 — tie on authority. *Lex specialis is not applied*: the Compendio has no express derogation clause, so inferring one would be the guess this layer exists to prevent |
| **Denmark byggefelt** | one candidate, status from the metadata state machine | `binding` → `resolved` · `illustrative` → `unknown('all-candidates-non-binding')` · `(T,T)` → `unknown` · `null` → `unknown` | stages 1/3 |
| **Paris height** | `plub_filet` · `plub_hauteur` · `plub_hmc`, all binding, all `binding-plan` | **`conflicted('no-priority-table')`** | stage 7 |

The `0,39` row is the one that proves `legalStatus` belongs on the **statement**: it sits inside the
binding plan, in the binding plan's own voice, and is still `illustrative` because the sentence says
*"entspricht die zulässige Überbauung einer **rechnerischen** GRZ von 0,39"* — the author computed it
to describe existing building.

---

## §5 — The invariants, and how CI enforces them

Every invariant is a test in `__tests__/attribution/invariants.test.ts`, and every one carries a
**mutation-style twin** that first asserts the mutation *landed* and then asserts detection. A test
that cannot demonstrate its own failure mode is not evidence — four components shipped on 2026-07-31
reported success while doing nothing (a CI gate that scanned zero files, an audit asserting against
its own literal, 17 gates wired to no workflow, a mutation test that silently no-op'd on CRLF).

| # | Invariant | Test | Its mutation proof |
|---|---|---|---|
| 1 | **Never pick when candidates tie on authority** | Madrid → `conflicted`, `'value' in r === false` | give one candidate a strictly stronger kind ⇒ assert the mutation changed the input, then assert the result flips to `resolved` — proving the `conflicted` came from the tie and not from an unconditional refusal |
| 2 | **Resolution never increases confidence** | all-`unknown`-status set → `unknown`; resolved confidence === winner's | mutate one candidate to `binding`+`high` ⇒ assert the set changed, then assert it now resolves at exactly `high`, never above |
| 3 | **`unknown` is in every enum** | enumerate `INSTRUMENT_KINDS`, `LEGAL_STATUSES`, `RULE_KINDS`, `EVIDENCE_CONFIDENCES` and assert each contains `'unknown'` | delete `'unknown'` from a local copy ⇒ assert the copy differs, then assert the check fails on it. Guards the France taxonomy regression |
| 4 | **superseded / illustrative / absent / errored are four results** | four inputs → four distinguishable `reason` codes | collapse two reason codes in a local mapping ⇒ assert collapsed, then assert the discrimination test fails |
| 5 | **Never synthesise a missing constraint** | a `graphical` candidate with `value: null` → `unknown`, and `'value' in r === false` | make the resolver's caller default to `0` ⇒ assert the default landed, then assert the "no value key" check catches it |
| 6 | **Per-parameter, not per-rule** | the same catalogue candidate wins `worksRegime` and is unrankable on `farRatio` | strip `parameterOverrides` ⇒ assert stripped, then assert `worksRegime` stops resolving |

The invariant tests are pure and run under the package's existing `vitest run` (`pnpm --filter
@pryzm/ordinance-extraction test`), which `npm run test:ci` already sweeps via `pnpm -r run test:ci`.
**No new CI workflow was added** — a gate wired to nothing is the exact failure mode listed above.

### The suite passed on its first run, so it was sabotaged six ways to prove it can fail

An in-test mutation proves the *test's own logic* discriminates. It does not prove the test is
wired to the production code path. So the resolver itself was broken, six times, and the suite
re-run each time (**VERIFIED**, local runs 2026-07-31; every sabotage reverted, `git status`
confirmed clean afterwards):

| # | Sabotage applied to `src/attribution/**` | Invariant attacked | Tests that failed |
|---|---|---|---:|
| 1 | `if (distinct.length > 1)` → `if (false)` — never refuse on a tie | 1 | **5** |
| 2 | `instrumentRank` returns `99` instead of `null` — unranked treated as weakest | 6 | **4** |
| 3 | the all-candidates-`unknown` guard → `if (false)` | 2 | **1** |
| 4 | the `illustrative` rejection reason relabelled `superseded` | 4 | **4** |
| 5 | `confidence: winner.evidence.confidence` → `confidence: 'high'` | 2 | **2** |
| 6 | the `value === null` drop → `if (false)` | 5 | **4** |

Sabotage 3 failing only **one** test is itself a finding: the all-`unknown` guard is the least
redundantly covered invariant in the suite. Named rather than padded.

**One defect this discipline found in my own design while the tests were being written.** The first
draft of `resolveParameter` reused `no-candidate-has-established-legal-status` for its `catch`
block — which would have made a crash indistinguishable from an honest "could not establish the
status", i.e. invariant 4 violated by the code that enforces invariant 4. `internal-error` is now
its own reason code, and the comment in `types.ts` records why.

---

## §6 — Convergence with `PlacementEvidence` (NOT done here)

`packages/site-parcel-data/` is concurrently growing a `PlacementEvidence` model for Denmark's
byggefelt/byggelinje placement geometry. It is the **reference** for this design — `legalStatus` +
`legalStatusSource` came from it via `ENVELOPE-REPLICATION-STANDARD.md` — and it was **not touched**.

The two models are the same idea at two altitudes:

| | `PlacementEvidence` (site-parcel-data, L?) | `ParameterEvidence<T>` (ordinance-extraction, L2) |
|---|---|---|
| ranks | **geometry sources** for placement | **statements** for a scalar parameter |
| authority from | a tier list in code (`byggefelt → byggelinjer → cited depth → block study → REFUSE`) | a per-jurisdiction table as **data** |
| shares | `legalStatus`, `legalStatusSource`, refusal-as-a-typed-value, failure ≠ absence | same |

**The convergence to propose later** (not now, not unilaterally): `PlacementEvidence` becomes
`ParameterEvidence<Polygon>` with `parameter: 'buildableArea'`, and its tier list becomes a DK
priority table. That is a cross-package refactor of a package another agent owns, and it needs its
owner's sign-off and an ADR. Recorded here, not executed.

---

## §7 — Honest limits: what this does NOT handle

**KNOWN-OPEN (designed around, not solved):**

1. **Nothing produces `ParameterEvidence` yet.** The German grammar emits `ExtractedRule`, which has
   a citation but **no instrument attribution** — that is exactly WP1-WP6 §10 KNOWN-OPEN #1. A
   bridge would therefore stamp `instrument.kind: 'unknown'` on every Berlin rule, and stage 1 would
   turn every Berlin parameter `unknown`. That is *correct* and *useless*, so the bridge is
   deliberately **not built and not wired** (§8). The fixtures are hand-attributed from the verbatims
   the parser recovered — real values, human attribution.
2. **Zone attribution is untouched.** This layer decides *which instrument* binds. It does not decide
   *which zone* (WA 1 vs WA 2; grado 1º vs 2º) a parcel falls in. That is a GIS join. A `farRatio`
   with two values from two different grados is **not** a conflict this resolver should see — it
   should never have been grouped. Grouping is the caller's job and the caller can get it wrong.
3. **`effectiveFrom` is carried and not used.** Temporal resolution (the most-recent-in-force
   instrument wins) is a real precedence axis in every jurisdiction and is not implemented. Only the
   structural `supersededBy` pointer demotes.
4. **Ties are never broken by specificity.** Madrid's Art. 8.7.20 *is* the more specific provision
   and a Spanish planner would probably apply *lex specialis*. Encoding that would be a legal opinion
   this repo has not sourced, and the extraction findings say the Compendio contains no express
   derogation clause. `conflicted` is the honest answer; a signed-off resolution is a data-sourcing
   task, not a code task.
5. **Conditional rules are ranked, not evaluated.** Berlin's §19(4) `0,8` is `conditional` — it binds
   *for Garagen und Nebenanlagen*. This layer drops it by rank. It does not model "0,4 for the main
   building, 0,8 including ancillaries", which is the actually-correct planning answer.
6. **No Germany `catalogue-overlay` rank.** Denkmalschutz interaction is unresearched. Unrankable
   rather than guessed.
7. **`unit` is a free string and is not checked.** Two candidates stating `35` `%` and `0.35` `ratio`
   would be read as a conflict. Unit reconciliation belongs upstream (`localeGate`, `RuleUnit`).

**UNKNOWN (not measured):**

- Whether the DK field semantics hold against Plandata's published UML model (probe §7 O1 — still
  outstanding, inherited here unchanged).
- Whether Madrid's four scoped clauses are the *complete* set — the extraction read Título 8 and
  Capítulo 3.2, not the whole Compendio.
- Paris precedence between the three `plub_*` layers. Nobody has asked the question of the source.
- Whether the `InstrumentKind` set survives a fifth jurisdiction. See §9.

---

## §8 — What was deliberately NOT wired

`toEnvelopeParameters` is unchanged. The attribution layer is exported from the package index and
consumed by nobody. This is a decision, for the reason in §7.1: wiring a resolver to a producer that
cannot yet attribute instruments converts a useful "here are four cited values, you choose" into a
useless "unknown". The WP1-WP6 verdict ranks a real Layer-4 section parser as the #1 unblock; this
layer is the thing that parser will feed.

---

## §9 — Is this abstraction Germany-shaped? (the honest read)

**Partly. Two of the seven `InstrumentKind` values are German artefacts, and one of them is the
whole point.**

- `depiction` exists because German planning law marks the distinction with a verb (`dargestellt`
  §5 BauGB vs `festgesetzt` §9 BauGB). No other jurisdiction here has shown a `depiction` candidate.
  It is a *real, general* concept — a document quoting another instrument — but the evidence for it
  is **n = 1 jurisdiction**.
- `statute` outranked by `binding-plan` is a German reading (BauNVO layers above a B-Plan). In a
  jurisdiction where national code sets hard ceilings, `statute` should rank *above* the plan. The
  table being data makes that a per-country edit rather than a resolver change, which is the design
  working — but the *default* is German-shaped and there is no default-free position.

**What is genuinely not Germany-shaped:**

- The **three-outcome contract** is the package's pre-existing Spanish/Catalan-driven shape.
- **Per-parameter overrides** came from **Madrid**, not Germany, and Germany's table does not use
  them. That is the strongest evidence the abstraction is not a German mould — the sharpest feature
  is exercised only by Spain.
- The **`legalStatus`/`legalStatusSource` split** came from **Denmark**, and Denmark reaches a
  correct answer through this model without any priority table at all.
- **Paris resolves correctly by refusing.** A jurisdiction the model knows nothing about produces the
  right answer, which is the least Germany-shaped property available.

**The load-bearing weakness is not shape, it is n.** Four jurisdictions, of which one (Paris) is
tested only by its absence and one (Madrid) contributes exactly one real conflict. The Berlin case is
the only one where the ranking machinery does real work, and it was **designed after reading the
Berlin answer**. That is a fitted model, not a validated one. The falsifiable prediction to test it:
**a fifth jurisdiction should need a new priority table and no new resolver code.** Until that has
been tried, this is a hypothesis with four supporting cases, not a proven abstraction.

---

## §10 — Evidence chain (G11 pattern)

| # | Claim | How obtained | Date | State |
|---|---|---|---|---|
| A1 | Berlin 8-30 yields four correct GRZ readings, only `0,4` binds | parser run over 209 pages, reported in `de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` §4 | 2026-07-31 | **VERIFIED** (by that agent; verbatims re-read into the fixture here) |
| A2 | The `dargestellt` sentence describes the 1958/60 Baunutzungsplan | verbatim on 8-30 p8, quoted in WP1-WP6 §4 and the corrected PROBE VERDICT | 2026-07-31 | **VERIFIED** |
| A3 | Madrid NZ 7.2.e carries two rival FAR values, unresolved | `es/es-md/28079-madrid/extracted/nz7.json` records `7.2.e / farRatio` twice with a mutual `conflict.rival` block | 2026-07-31 | **VERIFIED** (repo file read here) |
| A4 | The PGOUM has no global precedence clause; Art. 8.0.6 is narrow | `COMPENDIO-2025-EXTRACTION-01.md` §5.1/§5.3 + the Art. 8.0.6 verbatim | 2026-07-31 | **VERIFIED** (repo file read here) |
| A5 | DK `bygkunifelt`/`bygvejledende` state machine | DK byggefelt probe §4, live WFS | 2026-07-31 | **VERIFIED-LIVE** (by that agent, not re-issued here) |
| A6 | Danish field-name *semantics* | inference from names + observed exclusivity | 2026-07-31 | **ASSERTED-UNVERIFIED** → probe O1 |
| A7 | Paris `plub_filet`/`plub_hauteur`/`plub_hmc` precedence | — nothing sourced — | — | **UNKNOWN** |
| A8 | The resolver produces the §4 results | `pnpm --filter @pryzm/ordinance-extraction test` | 2026-07-31 | **VERIFIED** — see §11 |
| A9 | The abstraction carries to a 5th jurisdiction | — not tried — | — | **UNKNOWN** → §9 |

## §11 — Verification record

All measured 2026-07-31 in this worktree.

| Check | Result |
|---|---|
| `npx vitest run __tests__/attributionCases.test.ts __tests__/attributionInvariants.test.ts` | **53 passed / 53** |
| Six sabotage runs (§5) | **all six detected**; 5 / 4 / 1 / 4 / 2 / 4 failures respectively |
| Package suite `npx vitest run` | **244 passed / 244**, 19 files — the 191 pre-existing tests unchanged and untouched |
| Root `npx tsc --noEmit` | **net-new errors vs baseline: 0.** `diff` of full output before vs after is empty. The 5 pre-existing errors (missing `@pryzm/street-analytics`, `@pryzm/solar-analysis`, two `@opentelemetry/*` subpackages, one `pdfjs` `RenderParameters`) are unchanged. Baseline captured before any edit on a clean tree — **not** via `git stash`, because the stash stack is shared across worktrees and caused a cross-agent collision today |
| `npx tsc -p packages/ordinance-extraction/tsconfig.json --noEmit` | clean. It caught one real defect the root config misses (the root project does not include this package's `__tests__`): `resolveParameter([], table)` infers `Resolution<unknown>` from a `never[]` literal, silently widening a comparison. Fixed with an explicit type argument |
| `npx eslint` on all new files | clean, exit 0 (includes the `eslint-plugin-boundaries` layer rule) |
| `npm run check:isolation` | pass — project isolation intact, C48 storage guard clean |

**Scope discipline.** Only `packages/ordinance-extraction/**` and this file were written.
`packages/site-parcel-data/**` (the concurrent DK `PlacementEvidence` work), `packages/schemas/`,
`tools/ga-gate/**`, `tools/spanish-genome-probe/**` and the `es`/`dk`/`pt` jurisdiction docs were
read but never modified.

*Related: `ENVELOPE-REPLICATION-STANDARD.md` · `de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` ·
`dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md` ·
`es/es-md/28079-madrid/findings/COMPENDIO-2025-EXTRACTION-01.md` · C58 · C63 · ADR-0279.*
