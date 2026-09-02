# LANE S1 — the three append-only schema seats: datum · height-proportional-offset · context-aggregate

**Date:** 2026-09-02 · **Lane:** S1-FINISH (predecessor killed twice: mid-falsification of seat 1,
then the account switch) · **ADRs minted:** ADR-0377 / ADR-0378 / ADR-0379 ·
**Commit:** none (orchestrator owns the commit). `siteintel/**` untouched; Porto's pack and gate
untouched (§PORTO-SIGN-OFF blocker 4 belongs to the orchestrator).

---

## 1 · INHERITED-PIECE VERDICTS (trust nothing — every claim re-executed)

The predecessor's true death state was NOT what the handover brief described. The brief said the
working GeometricRule.ts carried "the import re-added + kind usage at ~:443/:457/:532". Measured:
the working file was **447 lines = HEAD + the import line only — the two seat kinds, the registry
and the datum usages were GONE**, while `/tmp/schemas-tsc.txt` (19:47) proves a ≥532-line version
with usages existed minutes earlier. Reconstruction of events from mtimes + transcripts: the
predecessor severed the seat additions for the seat-1 falsification (capturing the 4×TS2304 proof
at 19:47), and the kill landed before the restore. The severed content survives nowhere — staged
never; a sweep of all **8,960 dangling git blobs** (batch `cat-file`, marker grep) found no copy.

| # | Inherited piece | Verdict | Evidence |
|---|---|---|---|
| 1 | `packages/schemas/src/site/HeightDatum.ts` (committed, swept by 384e2b74) | **VERIFIED** | Compiles; 26/26 seat-test arms incl. registry closure + strict-member rejects; falsified F1b + the datum-switch sever (§3) |
| 2 | `JurisdictionZoningContract.ts` working delta (optional `heightDatum` + datum-of-nothing superRefine) | **VERIFIED** | Legacy zone parses with NO injected key (byte-parity guard green); DE «72,2 m über NHN» represents-and-flags; datum-of-nothing rejects; explicit `unknown` beside null height parses |
| 3 | `GeometricRule.ts` working delta (import only; seat content LOST) | **CORRECTED — RE-AUTHORED** | The two kinds + `GEOMETRIC_RULE_KIND_REGISTRY` + `GeometricRuleKind` re-authored from the surviving spec (the 306-line seat test + both evaluators + the engine's registry read). 748 lines final. `requiresBlockRing()` now reads the registry row (one fact, one home — C84 EI-9); behaviour asserted unchanged by the pre-existing regression tests |
| 4 | `heightDatumResolver.ts` (untracked; switch DELIBERATELY severed — `terrain-highest` case missing) | **CORRECTED — restored the severed case** | The sever was the predecessor's mid-flight closure falsification (`/tmp/tsc-scoped.txt`, 19:44). Proof RE-CAPTURED on the final tree first (§3), then the case restored |
| 5 | `evaluateHeightProportionalOffset.ts` (untracked) | **VERIFIED** | tsc green; 6/6 tests; falsified twice (F2b floor-degradation, F2c guard sever) |
| 6 | `evaluateContextAggregate.ts` (untracked) | **VERIFIED** | tsc green; 8/8 tests; falsified twice (F3a switch case, F3b count-weighting) |
| 7 | `ZoningRulesEngine.ts` delta (footprintShaping predicate → registry read) | **VERIFIED** | Compiles; full suite green; never-overstate gate RC=0 over 189 zone-solves (byte-identical predicate for every pre-existing kind: `setback` false on purpose, five shaping kinds true, both declarative-seat kinds false) |
| 8 | `packages/site-parcel-data/src/index.ts` export block; `packages/schemas/src/site/index.ts` HeightDatum export | **VERIFIED** | Barrel resolves; all consumers compile |
| 9 | The four test files (`heightDatumAndSeatKinds`, `heightDatumResolver`, `evaluateHeightProportionalOffset`, `evaluateContextAggregate`) | **VERIFIED — adopted as the reconstruction spec** | 26+5+6+8 = 45 arms green on the final tree; every ⭐ arm proven load-bearing by a sever (§3) |
| 10 | Predecessor transcripts (`/tmp/suite-before.txt` 172-file green baseline · `/tmp/schemas-tsc.txt` seat-1 4×TS2304 · `/tmp/tsc-scoped.txt` TS2345 · `/tmp/spd-suite.txt` collection wreck) | **VERIFIED as history, inherited-unproven as proof — every proof re-executed on the final tree** | §3 |

**Sibling-lane files in the shared tree — attributed, untouched:** lane G1 (gate-fixtures) owns
`tools/ga-gate/check-envelope-never-overstates.ts`, `geometry/explicitArea.ts`,
`geometry/inclinedTop.ts`, `geometry/polygonDifference.ts` + test, `tools/ga-gate/corpus/never-overstate/`,
and `audit/demo-esfrpt/2026-09-02/lane-g1-gate-fixtures.md`; `lane4e-dist/` is another lane's.
G1's report claims its own falsifications restored sha-identical; its gate runs RC=0 here.
**The tree is LIVE:** during this lane's run further sibling lanes landed (K1 kernel-primitives,
a PT-envelope lane with transcripts + tsconfig.lane-pt-envelope.json, FR adapter files,
envelope-geometry-census/). Acceptance below was re-measured at 20:30 on that state — the full
site-parcel-data suite still reads 178/178 green.

## 2 · WHAT THE FINISH DID

1. **Re-authored the GeometricRule.ts seat additions** (`packages/schemas/src/site/GeometricRule.ts`,
   447 → 748 lines): `HeightProportionalOffsetRuleSchema` + `ContextAggregateRuleSchema` (both with
   required `heightDatum` and registry-driven absolute-altitude rejection), union extended
   append-only to 8 kinds, `GeometricRuleKind`, `GeometricRuleKindMeta`,
   `GEOMETRIC_RULE_KIND_REGISTRY` (compile-closed `Record` over the union; rows carry
   meaning/citation/solveSeat/footprintShaping/requiresBlockRing), `requiresBlockRing()` reads the
   registry. Import comment tidied (§S1-IMPORT-DEFERRED closed).
2. **Restored the severed `terrain-highest` case** in `heightDatumResolver.ts` — after re-capturing
   its RED proof.
3. **Minted the three mini-ADRs:** `ADR-0377-a-stated-height-names-its-datum.md`,
   `ADR-0378-height-proportional-offset-is-a-kind-evaluated-after-height.md`,
   `ADR-0379-context-aggregate-a-fabric-statistic-is-a-rule-value.md`.
4. Runtime type and persisted schema move in ONE change-set: the Zod schemas ARE both (z.infer
   types are the runtime types; the same schemas parse persisted packs). No migration — every
   shipped pack parses byte-identically (asserted by the byte-parity guard arm).

## 3 · PROOFS (verbatim, all on the FINAL tree)

**As-found wreck** (`/tmp/s1-asfound-spd-tsc.txt`): 7 errors RC=2 — 4×TS2305 missing schema
exports, the resolver TS2345, a cascading any→never; site-parcel-data suite collecting 0 tests
per file (predecessor's `/tmp/spd-suite.txt`).

**Compile-closure, intermediate failure list → closure:**

- Datum switch (seat 1 consumer), RE-CAPTURED on the final tree with schemas complete, before the restore:
  `src/rulepacks/declarative/heightDatumResolver.ts(145,36): error TS2345: Argument of type '{ kind: "terrain-highest"; }' is not assignable to parameter of type 'never'.` → case restored → `SPD-TSC RC=0`.
- Registry closure (seat 2), F2a — HPO row deleted:
  `src/site/GeometricRule.ts(608,14): error TS2741: Property '"height-proportional-offset"' is missing in type … but required in type 'Readonly<Record<"setback" | … | "context-aggregate", GeometricRuleKindMeta>>'.` → row restored.
- Aggregate switch (seat 3), F3a — `case 'max'` deleted:
  `src/rulepacks/declarative/evaluateContextAggregate.ts(222,36): error TS2345: Argument of type '"max"' is not assignable to parameter of type 'never'.` → case restored.

**Falsifications (sever → SEEN-FAILING → byte-identical restore):**

- **F1a (seat 1, the predecessor's proof re-executed):** import line severed →
  `src/site/GeometricRule.ts(444,22)/(459,14)/(528,22)/(533,14): TS2304 Cannot find name 'HeightDatumSchema' / 'HEIGHT_DATUM_KIND_REGISTRY'` (RC=2; the predecessor's 19:47 capture read 443/457/532/535 on its lost layout — same shape).
- **F1b (seat 1):** `heightDatumOf` defaulting to `{kind:'facade-rasant'}` → 3 RED: `heightDatumOf is TOTAL`, `legacy pack zone parses UNCHANGED`, resolver `unknown REFUSES — and so does an ABSENT datum`.
- **F2b (seat 2, ⭐):** height-unresolved refusal replaced by floor substitution → `⭐ REFUSES when H is unresolved — and NEVER degrades to the minimum floor` RED (`AssertionError: expected true to be false`).
- **F2c (seat 2):** absolute-altitude guard severed → `REJECTS an absolute-national H-datum` RED.
- **F3b (seat 3, ⭐):** aggregation severed to COUNT-weighted → 3 RED: `⭐ MODE is extent-weighted`, `members sharing one value pool their extents`, `MEDIAN is extent-weighted`.

**Byte-identical restores:** sha256 of all five seat files identical to the green baseline after
every cycle — `339d43cc… GeometricRule.ts · f5d04bb8… HeightDatum.ts · e66948cc…
heightDatumResolver.ts · 633fb606… evaluateHeightProportionalOffset.ts · 386339879…
evaluateContextAggregate.ts` (`diff /tmp/s1-baseline-shas.txt /tmp/s1-final-shas.txt` → empty).

**Acceptance, final tree:**

- `packages/schemas` tsc **RC=0** · `packages/site-parcel-data` tsc **RC=0**.
- Seat tests: schemas `heightDatumAndSeatKinds` + `GeometricRule` regression **56/56**; evaluator
  files **19/19**.
- Full site-parcel-data suite: **`Test Files 178 passed (178) · Tests 3833 passed | 3 skipped` RC=0**
  (was 118/175 files failing collection on the half-state; predecessor's own green baseline was
  172 files before the S1+G1 additions).
- `check-envelope-never-overstates.ts`: **RC=0** — `OK: 0 overstatement(s) across 189
  zone-solve(s) in 6 jurisdiction(s) + estimated-default + the recorded live-route arms (Paris ·
  Denmark · Madrid NZ-1) + the planted self-test pack.`
- Root tsc (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --skipLibCheck`): **RC=0**.

## 4 · PRE-EXISTING DEFECTS SEEN, NOT MINE, NOT TOUCHED

- `packages/schemas` FULL suite: 3 failures in 2 tracked-unmodified files —
  `round-trip.test.ts` (water: `parse({})` violates its own surfaceElevation>bottomElevation
  refinement — defaults vs refinement defect) and `view-template-roundtrip.test.ts`. Fail at HEAD
  content; unrelated to site/*.
- `packages/schemas/tsconfig.tests.json` (`npm run schemas:typecheck`): 8 pre-existing errors in
  `envelopeConfidenceLadder.test.ts`, `familyPipeline.e2e.test.ts`, `round-trip.test.ts`
  (missing node types + strictness) — none in S1 files.

## 5 · WHAT THE PORTO FLIP NOW NEEDS (orchestrator, §PORTO-SIGN-OFF blocker 4)

The seat is ready: `context-aggregate` parses (`mode` over `urban-frontage` × `cornice-height`
with `mean-ground-at-facade`), `evaluateContextAggregate` resolves the moda over an injected set
and refuses honestly (unavailable ≠ empty ≠ tie ≠ poisoned). Still needed, in order:

1. **A frontage extractor** — construct the *frente urbana* member set (`value_m` per cércea
   stretch + `extent_m` along the frontage) from real context data (lane A row 1 names this
   adapter/kernel work; members are injected, this lane's module deliberately does not build them).
2. **Pack wiring** — `ptPortoPdmDraft.ts` states the moda rule as a `context-aggregate`
   geometric rule (Art. 3.º o / 24.º n.º 1 e / 27.º n.º 2 b) instead of blocker-4 prose.
3. **The gate flip itself**, citing ADR-0379 + §PORTO-SIGN-OFF blocker 4 — the orchestrator's
   call, explicitly not this lane's.
4. **The commit** — everything above is uncommitted working tree by mandate.
