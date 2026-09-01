# LANE R — THE REVISION BATCH (gate decision §C · verdict §E "REVISE batch") — LANDED

Executed 2026-09-01. ONE coherent change-set in `packages/schemas/src/siteintel/` + test
extensions, uncommitted per the lane brief. Per §H the R-batch **joins the freeze the day it
lands** — every shape below now changes only by superseding ADR.

## Files changed (all under the lane's scope)

- `packages/schemas/src/siteintel/entities.ts` — R1, R4, DP ride-along.
- `packages/schemas/src/siteintel/provenance.ts` — R2, R3, R5, tier-projection superRefine.
- `packages/schemas/src/siteintel/confidence.ts` — doc-comment rewrite ONLY (shape untouched,
  per §H "changes its documentation, not its shape").
- `packages/schemas/src/siteintel/ruleformat.ts` — `§DRAFT-RULEFORMAT` in-code marker ONLY
  (§G item 1a); no schema change.
- `packages/schemas/__tests__/siteintel.test.ts` — fixtures re-emitted with R-batch fields
  (the §F Step 0 rationale applied to fixtures) + §7 per-R positive/negative arms. 45/45.

## Per-item, verdict wording → implementation

- **R1** `RuleApplicabilitySchema` replaces the three untyped legs (old entities.ts:306–315)
  with the typed value object: `basis[]` `{kind: zone|prescription|plan|restriction|regulation|
  parcel, ref}` (`RuleBasisRefSchema`, the `Evidence.from` shape) · `geometry` inline
  `NativeCrsGeometry` · `useScope[]` verbatim national tokens · `rank` nullable
  `{scheme, level}` (`level` = 1-based rung, 1 = most specific — resolution stays engine-side
  per §F.7) · `condition` the JSON-Logic predicate unchanged. At-least-one-leg refine kept
  (basis/geometry/condition are legs; useScope/rank documented as QUALIFIERS that cannot found
  an applicability). Temporal legs untouched. **Companion contract sentence documented at the
  field**: every `basis` reference MUST resolve to a MINTED entity. The OLD three-leg shape no
  longer parses (tested).
- **R2** `RuleProvenanceSchema.valueBasis` — optional `{scheme, code}` (both `min(1)` strings,
  code VERBATIM, e.g. `{scheme:'dk-bygberegnaf', code:'4'}`). No mapping table at L0 (L-664
  cited in the doc comment); adapters map.
- **R3** `RuleProvenanceSchema.validityBasis: z.enum(['legal','ingestion'])` beside
  `valid_from`/`valid_to`. **REQUIRED, no default** — the verdict marks R2 "optional" and R5
  "nullable" but gives R3 no such marker, and a default would silently re-mint the exact
  machine-indistinguishability (gate §B.3) the field kills; house doctrine ("must never
  silently default", isUpperBound) applied.
- **R4** `EvidenceRefKindSchema` extended with exactly `zone|prescription|restriction|plan|
  parcel` (verdict wording; `regulation` deliberately NOT added — it is in the R1 basis enum
  only, per the two texts' own difference).
- **R5** `RuleProvenanceSchema.normativeForce` — nullable open string, `.default(null)`
  documented as "the register serves no force flag — NOT an assertion of bindingness"
  (mirrored, never harmonised; LT 'rekomendacinio pobūdžio' / DK 'bygvejledende' /
  DE 'Orientierungswert' cited).
- **Non-schema** — `SiteIntelConfidenceTierSchema` doc comment rewritten as a PROJECTION of
  derivation × valueLocation × source-kind × validation-event × known-unknown; superRefine on
  `RuleProvenanceSchema` rejects the demonstrated-incoherent pairs: tier 1 + AI_EXTRACTED (the
  named pair), tier 1 + in-document-text, tier 5 without HUMAN_VALIDATED derivation.
  Conflated-but-both-true pairs (tier 2 + AI_EXTRACTED, architect §5.1.2) stay parseable —
  tested as a CONTROL arm. No seventh tier, no score (§F.5).
- **Ride-along (§G item 3 names it)** — `SiteIntelDevelopmentPotentialSchema.computedAt`
  (required IsoDateString) + `envelopeRef` (nullable id). The tier-6 no-null-capped-solids
  guard was NOT built here (evaluator-side, E1bc lane, per the lane brief).
- **DK Aarhus case** — the DK worked-chain fixture now carries
  `valueBasis: {scheme:'dk-bygberegnaf', code:'4'}` and the note apology is GONE
  (`confidence.note` asserted undefined); a second fixture encodes the LIVE Aarhus row
  (`bebygpct=180`, af=`'1'` = area-as-a-whole) typed.

## §F do-not-add compliance

No Applicability entity (value object only, no id/lifecycle) · no seventh tier / numeric score ·
no harmonised use taxonomy (useScope verbatim strings) · no DSL (condition stays JsonValue
carrier) · no DK-code→LandBasis mapping at L0 · no precedence algorithm in the data model ·
non-rivalry register honoured (FetchOutcome/C58/LandBasis/C23/C62 untouched, no re-mint).
No ceiling raised, no gate disabled, no gate-debt entry.

## Proof transcripts (verbatim terminal lines)

- Siteintel suite: `Test Files  1 passed (1)` · `Tests  45 passed (45)`.
- P5: `[domain-purity] ✓ packages/schemas is pure — 0 impurities across 201 files. HARD-FAIL AT ZERO.` RC=0.
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → `TSC_RC=0`.
- Package tsc: `npx tsc -p tsconfig.json --noEmit` → `PKG_TSC_RC=0`.
- Full schemas suite: `2 failed | 49 passed` — the 3 failing tests are PRE-EXISTING
  (`round-trip.test.ts` water `surfaceElevation must be strictly above bottomElevation`,
  `view-template-roundtrip.test.ts` defaults), in committed files this lane never touched.

## Falsification (sever → named failure → byte-identical restore)

Baselines: `entities.ts 358a7873…`, `provenance.ts 11d1e272…`. Each sever ran the suite
foreground; each restore re-hashed to the baseline (`BYTE-IDENTICAL RESTORE CONFIRMED`).

| Sever | Named failing test (verbatim `×` line) |
|---|---|
| R1 refine disabled | `× NEGATIVE: no leg at all is rejected — a rule that applies nowhere is not a rule` (+2) |
| R2 field renamed | `× POSITIVE: the LIVE Aarhus row (bebygpct=180, af=1) parses with the denominator TYPED — the wrong-GFA path is machine-visible` (+1) |
| R3 field deleted | `× NEGATIVE: a record WITHOUT validityBasis fails naming the field — legal vs ingestion must never be indistinguishable again` (+2) |
| R4 'prescription' dropped from EvidenceRefKind | `× POSITIVE: an evidence hop can cite a prescription and a parcel directly` |
| R5 field deleted | `× POSITIVE: LT ASGR rekomendacinio pobūdžio travels VERBATIM — authoritative-but-ambiguous honestly encoded without touching the tiers` (+2) |
| tier1+AI_EXTRACTED guard off | `× NEGATIVE: tier 1 + AI_EXTRACTED is rejected (the named pair)` |
| DP computedAt dropped | `× NEGATIVE: a record without computedAt fails naming the field — an unplaceable potential is not reproducible` |

(A first R4 sever attempt hit R1's `RuleBasisKindSchema` — same literal, earlier in the file —
and correctly changed NOTHING in the R4 arms; re-run scoped to the `EvidenceRefKindSchema`
block. The miss is itself evidence the two enums are independent seats.)

## Consequences for the parallel lanes (expected, by design)

- The uncommitted E1d EE draft (`packages/site-parcel-data/src/countryAdapters/ee/`) builds the
  OLD applicability shape and no `validityBasis` inside `SiteIntelRuleSchema.parse(...)` — it
  compiles (parse takes `unknown`; root tsc RC=0 confirms) but its parses now FAIL at runtime.
  That is the §G item 2 rework, verbatim ("validityBasis:'ingestion' instead of the note
  apology", useScope, mint the cited Prescriptions) — its lane, not this one.
- `ruleformat.ts`'s `DeclarativeRuleSchema` extends `SiteIntelRuleSchema`, so R1/R2/R3/R5 flow
  through to pack documents unchanged (§G item 1's stated design).

## Freeze

Per §D/§H these shapes are now REVISED-THEN-FROZEN: `RuleApplicability` (basis/geometry/
useScope/rank/condition) · `RuleProvenanceSchema` + valueBasis + validityBasis + normativeForce
· `EvidenceRefKindSchema` + the five planning kinds. Extending the enforced incoherent-pair set
is an ADR-level change.
