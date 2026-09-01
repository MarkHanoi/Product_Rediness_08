# LANE E1bc — THE EVALUATOR + BARCELONA GOLDEN PARITY (gate decision §F items 3–4 · verdict §G items 3–4) — LANDED

Executed 2026-09-01, AFTER the R-batch (this lane builds on the frozen R1/R2/R3/R5 shapes).
All changes uncommitted per the lane brief. No ceiling raised, no gate disabled, no gate-debt
entry, no rival minted.

## What was built (files)

New, under `packages/site-parcel-data/src/rulepacks/declarative/`:

- `factVocabulary.ts` — THE FACT VOCABULARY as data (supplement §3.4): 2 facts
  (`parcelAreaM2`, `ampladaDeVialM` — each with unit/meaning/computedBy/space, both consumed
  by the 20a constructions that stay TS-resolved today), `collectConditionVars` +
  `assertKnownFacts` (undeclared spelling ⇒ refusal naming the token), and
  `DECLARATIVE_PARAMETERS` — the canonical parameter vocabulary (7 C58 scalar seats with the
  named `c58Calculation` per seat), the owner seat the verdict's EXPERIMENTAL list demands
  before country #3. **Joins the freeze at golden parity** (which this lane reached — see
  below; the freeze stamp is the orchestrator's to apply on commit).
- `evaluateDeclarative.ts` — the typed deterministic evaluator at L2 over scalar rules +
  `isInForceOn`. Per (zone, parameter, temporal query): R3-aware temporal split → R1 basis
  companion contract (dangling ref = HARD refusal) → fact-vocabulary condition gate →
  tier-6 split (UNKNOWN is an answer) → R1 rank precedence ENGINE-side (min level wins on one
  scheme; tie/incomparable = refusal, never a guess) → binding decision through the EXISTING
  attribution layer (`resolveParameter`, @pryzm/ordinance-extraction) where every survivor
  carries a verbatim `rase.requirement`; article-addressed `resolved-unattributed` path with
  the gap NAMED where not. Emits the E1c evidence chain
  (zone → plan → document → article → rule → verbatim → calculation → value);
  `walkEvidenceChain` fails naming the missing required hop; `envelopeSolidHeightCap` is the
  tier-6 envelope guard (supplement §8.1: no null-capped solids from tier-6 rules).
- `deriveC58Contract.ts` — the loader ruleformat.ts promises: document → C58
  `JurisdictionZoningContract` THROUGH the evaluator (`current-set` at `lastReviewed`), refusal
  outcomes THROW (failure ≠ absence: a refused parameter never becomes an honest-looking null),
  `no-rule`/`unknown-tier6` load as the C58 null, percent→fraction is the one named calculation,
  final shape via `JurisdictionZoningContractSchema.parse` (one authority for enums + key order).
- `esBarcelona20aAillada.decl.json` + `.decl.ts` — the migrated pilot pack AS DATA: 10 zones,
  **66 scalar rules**, each carrying R1 (typed applicability, basis → the minted
  `plan-es-08019-pgm-1976`), R2 (`valueBasis` where the semantic is real: FAR
  `{es-pgm-edificabilitat, neta}` — the C63 denominator lesson; coverage
  `{es-pgm-ocupacio-mesura, Art. 249.1}`), R3 (`validityBasis:'legal'` with grounds in
  `notes[]`: Arts. 342/343 → DOGC núm. 4277 publication 2004-12-10; Art. 340.1 → the curated
  1976-07-14 effectiveDate), R5 (`normativeForce: null` — no force flag served). Verbatim
  `rase.requirement` ONLY where the repo holds the span (Art. 340.1 operative clause from
  claus/20a/CLAU.md on the 8 FAR rules; the Art. 342.3 IVb sentence on 20a/9b height/floors) —
  never a fabricated quote. Schema-parsed at module load (EE_SOURCES discipline).
  `BCN_20A_DECL_INSTRUMENT_CONTEXT` carries the instrument status as pack DATA (§9 boundary).

New tests: `__tests__/declarativeEvaluator.test.ts` (16),
`__tests__/declarativeGoldenParity.test.ts` (11),
`__tests__/fixtures/es-barcelona-20a-golden-baseline.json` (captured from the LIVE TS pack
**before** any migration code existed — sha256 `63f4cb47f0d0…`).

Modified: `packages/site-parcel-data/package.json` (+ `@pryzm/ordinance-extraction`
workspace dep — L2→L2, legal per the layer table; layer gate re-run after: ✓ within baselines,
violations 48/102) · `pnpm-lock.yaml` (+3 lines, synced per the frozen-lockfile rule) ·
`packages/site-parcel-data/src/index.ts` (barrel appends the full SET of the 4 new modules).

## Pilot pack choice — es-08019 `20a` (and why not the Ensanche/22@ packs)

The brief's pilot is "the Barcelona pack es-08019" with SCALAR rules migrated and the body
dialect tag only for a migrated geometric construction. `ES_BARCELONA_20A_AILLADA_PACK` is the
one es-08019 pack whose C58 seats hold real scalars (10 claus × height/floors/FAR/coverage/
setbacks, PGM Arts. 337–343 Barcelona-exclusive text); the Ensanche pack's seats are all null
(its content IS the Art. 242 construction — exactly the class the verdict defers), and 22@ is
likewise construction/height-table shaped. The 20a `geometricRule` is the setback triple —
the ordinance's own operation, reconstructed by the deriver from the three setback rules —
**not** an Art. 242.4-class construction, so per the verdict **no body dialect tag was minted**.
NOT migrated (named in the document's `notes[]`, deliberate nulls, resolver modules stay live
TS): Art. 342.5 subzona-V amplada ladder, Art. 340.2/343.1 subzona-VI area construction,
Art. 343 small-parcel overrides, Art. 255 slope reductions.

## PROOF 1 — golden parity, verbatim

101-row table (10 zones × 10 fields + pack meta), every row MATCH; terminal lines of the
parity printer, verbatim:

```
zones: 10 vs 10 · TS bytes: 25706 · derived bytes: 25706
BYTE-IDENTICAL: true · field mismatches: 0
```

(The full 101-row table was printed in-session; representative rows:)

| zone | field | TS pack | derived (data) | match |
|---|---|---|---|---|
| 20a/6 | plotRatioFAR | 0.25 | 0.25 | MATCH |
| 20a/9b | maxHeight_m | 15.25 | 15.25 | MATCH |
| 20a/9b | maxFloors | 5 | 5 | MATCH |
| 20a/8 | maxHeight_m | null | null | MATCH |
| 20a/8 | plotRatioFAR | null | null | MATCH |
| 20a/9u | plotRatioFAR | null | null | MATCH |
| 20a/12 | setbacks | {"front_m":12,"side_m":10,"rear_m":12} | (same) | MATCH |
| (pack) | meta ×6 | (verbatim) | (verbatim) | MATCH |

Three stacked guards in `declarativeGoldenParity.test.ts`: (1) TS pack ≡ the pre-migration
baseline fixture (the target cannot move under the migration); (2) per-zone/per-field equality
— a delta FAILS NAMING zone + field; (3) full `JSON.stringify` byte equality. The TS pack
STAYS LIVE; nothing routes through the data pack in production.

## PROOF 2 — point-in-time, legal vs ingestion distinguished (R3)

Fixture arms (declarativeEvaluator.test.ts §R3): a legal rule (valid_from 2005-01-01, 20 m)
beside an ingestion rule (2026-01-15, 18 m):

- `legal-as-of 2010-06-01` → resolves **20** via the attribution layer; the ingestion rule is
  surfaced `notAnswerableTemporal` naming `validityBasis 'ingestion'` — never silently dropped;
- `legal-as-of 2004-01-01` → outcome **`not-answerable-temporal`** (NOT the confident
  not-in-force a naive `isInForceOn` would emit — the gate §B.3 false-negative made
  impossible), with the legal rule's real negative surfaced in `notInForce` beside it;
- `current-set 2026-06-01` → both bases answer (REPORT §K.2 membership claim), corroborating
  values resolve.

Real-pack arms: `legal-as-of 1990` → 20a/6 FAR (legal since 1976-07-14) answers **0.25** while
the 2004-instrument height is honestly **`not-in-force`**; `legal-as-of 2010` → height answers
9.15. Three-way distinction (in-force / not-in-force / not-answerable) exercised on both
fixture and real data.

## PROOF 3 — chain-walk (sever → names the hop)

`20a/9b maxHeight_m` resolves **15.25 through `resolveParameter`** (the first real producer
feeding the attribution layer its own header calls "deliberately wired to nothing"); the
winner's citation carries the HELD verbatim span ("l'alçada màxima serà de 15,25 m.",
Art. 342.3) and the chain walks
zone `20a/9b` → plan `plan-es-08019-pgm-1976` → document `…PGM-NNUU-metropolitana.pdf` →
article `Art. 342.3` → rule `rule-es-08019-20a-9b-maxheightm` → verbatim → value `15.25`,
`walkEvidenceChain` → `{ok:true, gaps:[]}`. Severs (in-test, on cloned documents):
basis ref → `plan-SEVERED` ⇒ outcome **`dangling-basis`** naming the ref (R1 companion
contract, gate §B.2); article → null ⇒ chain walk fails **naming `article`**. The
article-addressed path is proven on `20a/6 setback.front_m` (value 12, gap
`no-verbatim-span-curated` named in the chain, walk ok with the gap listed).

## PROOF 4 — R1 rank precedence engine-side (the DK-ladder shape)

Level 1 beats level 4 on one scheme (12 wins, loser recorded OUTRANKED naming both levels);
level tie with disagreeing values ⇒ `conflicted-rank/rank-tie` (never pick on a tie —
attribution invariant 1); mixed schemes or a missing rank with disagreement ⇒
`rank-incomparable` (refused, never guessed). `inheritsFromZoneCode` is implemented as §DEC-2
zone-supplement ONLY (per-parameter override/inherit, one level, cycle-refused) and plays no
precedence role (verdict §G item 1b).

## PROOF 5 — tier-6 envelope guard + fact vocabulary

Tier-6 UNKNOWN height ⇒ `envelopeSolidHeightCap` refuses **`tier6-unknown-height`** citing
supplement §8.1/L-616; control: resolved 20 ⇒ `{ok:true, maxHeightM:20}`; absence
(20a/8's construction null) ⇒ `no-resolved-height` — the guard fabricates from neither unknown
NOR absence. Fact vocabulary: `parcel_area` refused naming `parcelAreaM2`; a declared-fact
condition still refuses via the NAMED `condition-not-evaluable` seam (a condition is never
silently ignored — constructions migrate with the body dialect tag, verdict §E LATER).

## Falsification (sever → named failure → byte-identical restore; all EXECUTED foreground)

Baselines: `esBarcelona20aAillada.decl.json 32bb934b…` · `evaluateDeclarative.ts f23bf777…` ·
`factVocabulary.ts 04fceeff…`. Each restore re-hashed to baseline (all three matched).

| Sever | Named failing line (verbatim `×`/assertion) |
|---|---|
| ONE data value corrupted (20a/5 setback.front 10→9) | `× guard 2: per-zone, per-field parity — a delta names the zone and the field` · `AssertionError: zone 20a/5 · field setbacks: expected { front_m: 9, … } to deeply equal { front_m: 10, … }` (+ guard 3 byte parity) |
| R3 ingestion gate disabled | `× POSITIVE: a legal-as-of query is answered by the LEGAL rule, and the ingestion rule is surfaced NOT-ANSWERABLE beside it — never silently dropped` · `× NEGATIVE (the R3 defect made impossible): …the outcome is NOT-ANSWERABLE, naming R3` |
| R1 basis contract disabled (`danglingBasisRefs` ⇒ []) | `× NEGATIVE: a basis ref naming no minted entity is a HARD refusal naming the dangling ref` · `× SEVER (basis hop): a dangling plan ref is a HARD refusal naming the ref` |
| tier-6 guard branch disabled | `× NEGATIVE: a tier-6 UNKNOWN height refuses the solid cap with the reason named` (`expected 'no-resolved-height' to be 'tier6-unknown-height'`) |
| fact `parcelAreaM2` renamed in the vocabulary | `× a declared-fact condition still refuses with the NAMED seam …` |

## Verification transcripts (verbatim terminal lines)

- New suites: `Test Files  2 passed (2)` · `Tests  27 passed (27)`.
- Full package suite: `Test Files  159 passed (159)` · `Tests  3260 passed (3260)` · RC=0
  (one earlier run showed a transient child-process teardown error with 0 test failures; the
  clean rerun above is the record).
- P5: `[domain-purity] ✓ packages/schemas is pure — 0 impurities across 201 files. HARD-FAIL AT ZERO.` RC=0
  (this lane changed nothing under packages/schemas).
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` →
  **TSC_RC=0** (RC captured directly; the first run flagged an unused import at root
  strictness — fixed by making the deriver validate its seat names against
  `DECLARATIVE_PARAMETERS`, which is the principled use of the vocabulary anyway).
- Package tsc: **PKG_TSC_RC=0**.
- Layer gate after the L2→L2 dep add: `[check-layer-boundaries] ✓ within baselines (violations 48/102, unclassified 13/13, sdk-bypass 156/182).`

## Findings & consequences

1. **Golden parity HOLDS at 100% (byte-identical, 0 deltas)** — the ratification condition for
   §DRAFT-RULEFORMAT and the fact vocabulary's freeze trigger is MET for the 20a pilot. The
   in-code `§DRAFT-RULEFORMAT` marker and the freeze stamps are deliberately left for the
   orchestrator/verify lane (this lane does not commit and does not self-certify its own
   parity).
2. **The attribution layer is now WIRED** (first producer): `resolveParameter` decides the
   binding value wherever candidates are verbatim-reviewable. Named authoring debt: only
   10 of 66 migrated rules hold verbatim spans (8 FAR + 2 IVb) — the rest are honest
   coordinate-read table cells riding the article-addressed path. Extending verbatim coverage
   is an authoring task (re-reading pp. 179–183 cell spans), not schema or engine work.
3. **Second copy declared**: the JSON document restates the `bcn20aSubzones.ts` numbers; the
   parity test is the machinery that makes the two-copy interim safe. End state (TS table
   becomes a thin loader) is a follow-up, founder-visible step — not taken here because the TS
   pack must stay live until the retirement decision.
4. **Known asymmetry carried, not hidden**: `deriveC58Contract` throws on refusal outcomes
   (failure ≠ absence) — so a future pack with a rank conflict or dangling ref cannot load at
   all, which is the intended migration-time behaviour.

## §F do-not-add compliance

No DSL (conditions stay JSON-Logic carriers and are REFUSED, not interpreted) · no precedence
algorithm in the data model (rank read engine-side) · no new evidence system (ParameterEvidence/
Resolution/EvidenceCitation adopted from @pryzm/ordinance-extraction) · no new independent
Applicability entity · no seventh tier / numeric score · no harmonised use taxonomy · no
DK-code→LandBasis mapping at L0 · non-rivalry register honoured (FetchOutcome/C58/LandBasis/
C23/C62 untouched — the C58 contract remains THE engine shape, derived not re-declared) ·
body dialect tag NOT minted (no geometric construction migrated) · no ceiling raised, no gate
disabled, no gate-debt entry, no commit.
