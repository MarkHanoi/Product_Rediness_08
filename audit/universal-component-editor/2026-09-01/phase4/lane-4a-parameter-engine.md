# Lane 4A — the parameter engine · findings

**Date 2026-09-01 · OWNS `packages/family-runtime/**` exclusively · NOT COMMITTED (per brief).**
Authority: ADR-0376 **D3/D4** + addendum **D9/D10** · audit §12 PHASE 4 row **4A** · **C110** ·
spec §66 / §10 / §11. Gate: **§76 C**.

> ⛔ **Every number below was read from a redirected file with `$?` taken immediately.** No number
> in this document is transcribed from another document. Where a contract's own table is now stale
> because of this lane, that is stated as OWED to the contract's owner, not silently corrected here.

---

## 0 — Verdict

| Acceptance (audit §12, row 4A) | State |
|---|---|
| Fix the precedence inversion per C110 | **INHERITED — verified, not redone** (see §1) |
| Add the both-present test case the suite lacks | **INHERITED — verified, not redone** (§1) |
| Type `EvalScope` with `CanonicalKind` so `UnitMismatchError` **throws for the first time** | ⭐ **DONE — it throws. First construction in the repository's history.** (§2) |
| Widen `Unit` toward §10's quantity kinds | **PARTIAL AND DELIBERATELY SO** — 4 of 9 kinds; `cm` added; five kinds reported OWED with the reason (§3) |
| **§66 partial: a formula change recomputes its dependents** | **PROVEN BY EXECUTION** — and the property was ALREADY TRUE at HEAD; this lane measured it, it did not create it (§4) |
| ⛔ D3 (metres canonical) | **NOT EXECUTED — correctly.** Reduced from "rewrite a switch" to **one token** (§5) |

---

## 1 — The inherited Phase-3 work: verified against the tree, mtime checked, NOT redone

The brief instructed verification rather than repetition. Measured:

```
$ find packages/family-runtime -type f -not -path "*/node_modules/*" -printf "%T+ %p\n" | sort -r
2026-09-01+18:52:56  packages/family-runtime/src/resolution/resolveParameter.ts
2026-09-01+17:56:21  packages/family-runtime/__tests__/resolveParameter.test.ts
2026-09-01+17:54:29  packages/family-runtime/src/types.ts
2026-08-09+16:44:48  (everything else — untouched since S55)
$ git status --short packages/family-runtime/     ->  (empty: committed)
$ git log --oneline -1 -- packages/family-runtime/
569e482e feat(UCE/§PHASE3): the three contracts, the D4 repair, …
```

**Both halves of D4 are on disk and committed.** `resolveParameter`'s expression branch sits ABOVE
the default branch under a `⛔ ORDER IS LOAD-BEARING` comment; `types.ts` carries `supersededDefault`
and the `superseded-default` diagnostic; `resolveParameter.test.ts` carries the
`§BOTH-PRESENT` arm *"expression BEATS defaultValue when BOTH are present (ADR-0376 D4)"*.
**Baseline before this lane touched anything: 6 files / 63 tests / RC=0.**

⭐ This lane BUILT ON it rather than around it: the §66 file's last arm re-exercises the D4
precedence from the dependents' side (a parameter that BECOMES derived while other formulas read
it), so a regression of the inversion now fails in two files, not one.

---

## 2 — ⭐ `UnitMismatchError` THROWS. It had never once been constructed.

### 2.1 — What was wrong, stated as the mechanism and not as "a missing check"

`unit-coercion.ts` promised in its own header: *"We DO NOT cross-convert: a `m` literal supplied
where an angle parameter is expected raises `UnitMismatchError`."* C110 §3.5 measured four textual
hits and **no throw site**. The root is `§UNIT-KIND-ERASURE`: `EvalScope` was
`Readonly<Record<string, number>>`, so **a value's unit kind was erased the moment it entered
scope** and `walk()` could not compare kinds *even in principle*. `toCanonical` ran on **literals**
only — mixed-unit literals worked, mixed-unit **parameters** were unchecked and uncheckable.

### 2.2 — The change, at the layer C110 §3.5-a names

- `EvalScope` is now `Readonly<Record<string, number | Quantity>>` where
  `Quantity = { value: number; kind: CanonicalKind }`.
- `walk()` returns a `Quantity`, not a `number`. Literals enter their kind via `kindOf(unit)`;
  identifiers carry the kind the scope gave them.
- `resolveParameter` builds a **kinded** scope from each parameter's declared `dataType`
  (`kindOfDataType`). ⛔ **The kind comes from the DECLARATION, never from the magnitude.**
- The refusal is mapped to a typed diagnostic, not re-thrown — C110 §4.4 `§DIAG-CLOSED-SET` makes a
  bare `Error` a breach.

⚠ **A bare `number` scope entry is still accepted, and that is stated in the code as a limit rather
than left to be discovered.** A number with no declared kind IS `scalar`, the permissive member, so
the old spelling keeps its old meaning exactly — and `evaluate('W + A', {W: 1, A: 2})` **cannot**
refuse and does not pretend to. There is a passing test asserting that non-capability by name, so
nobody reads the throw as "the DSL always detects unit mismatches".

### 2.3 — What it refuses, and what it must not

**Refuses (4 executed arms, read back from the resolver's typed diagnostics):**
`length + angle` · `sin(<length>)` · `min(length, angle)` · `area + length` inside one expression.
Each asserts the **code**, the **parameterId**, and that the message names **BOTH kinds and the
operator** — a refusal that does not say what it refused against is not actionable.

**Must NOT refuse (4 executed negative-control arms):** `Width - 120` (a unit-less literal is
*adoptive*, not dimensionless-by-decree) · `Width / 2` · `length/length + angle` (a genuine ratio) ·
`area + area` · and the founder's §64 formula `OpeningWidth - 2 * FrameWidth`.
⛔ **These are load-bearing.** A kind checker that refuses everything is an outage, not a checker;
these are the arms that fail if the algebra is ever made stricter than the model can justify.

### 2.4 — The algebra, and why `unknown` is not `scalar`

`CanonicalKind = 'length' | 'area' | 'volume' | 'angle' | 'scalar' | 'unknown'`.
`+ - < > == min max if` **unify** (the only refusing rule, and it refuses exactly one shape: two
different NAMED kinds). `*` and `/` **build** derived kinds and never refuse — refusing unlike kinds
under `*` would refuse real formulas.

⭐ `unknown` (*this engine cannot name this quantity* — `length * angle`, `sqrt(area)`, `1/length`)
is a **different value from** `scalar` (*genuinely dimensionless*), on purpose. Collapsing them
would assert "dimensionless" about something that is not — failure and empty carrying one value,
which is the [[context-data-honesty-family]] defect. `unknown` is permissive and propagates: an
engine that cannot name a kind has no standing to refuse one, and one unnameable subexpression
never manufactures a confident refusal higher up the tree.

**Under-detection is a named gap; over-detection is a false refusal on a real formula. This lane
chose under-detection everywhere the two competed, and named each choice.**

---

## 3 — The `Unit` widening: what was done, what was NOT, and why the split is where it is

### 3.1 — ⭐ The vocabulary was declared FIVE times in one package. Now once.

Found while doing the work, and it is a spec **§76 gate B** (no duplicate source of truth) breach
inside a single package: the closed unit set was enumerated independently by (1) the `Unit` union,
(2) the tokenizer's hand-written `new Set(['mm','m','deg','rad'])`, (3) `toCanonical`'s switch,
(4) `kindOf`'s ternary, and (5) the tokenizer's LexError message as **prose** — the copy a user
actually reads. The type system checked none of them against the others.

All five now derive from one `§UNIT-TABLE` in `unit-coercion.ts`. **Adding a length spelling without
its conversion factor is now a compile error** (the factor table is typed by the unit table's own
keys — verified: the first `tsc` run failed exactly this way on `cm`).

### 3.2 — What was widened: `cm`, and the KIND set to four of spec §10's nine

`Unit` gains **`cm`**, proven by execution at three layers (`toCanonical`, `kindOf`, and the
**tokenizer**, whose derived keyword set is what makes the third one work — an arm that would have
failed before the refactor).

`CanonicalKind` gains **`area`** and **`volume`** as **DERIVED-ONLY, never declarable** kinds. They
are produced by the algebra (`length*length`, `area*length`) and buy the `area + length` refusal at
**zero cost to any other lane** — because nothing has to declare them.

### 3.3 — ⛔ What was NOT widened, and the rule that stopped it

**Mass, temperature, pressure, energy and power are NOT minted.** C110 §3.4 MUST binds a quantity
kind to be widened **in both the runtime type AND the persisted schema in the same change-set**, and
§3.7 MUST NOT forbids a tenth unit enum. The persisted enum is
`FamilyParameterDataTypeSchema` in `packages/file-format/src/family-schema.ts` — **lane 4B's
exclusive file.** Minting them here would fork the model in exactly the way that clause exists to
prevent. **OWED, with the reason, rather than half-built.**

Measured, so 4B does not have to re-derive it: the persisted parameter carries **no unit field at
all** — `grep -n "unit|Unit" packages/file-format/src/family*.ts` returns **one hit**, a comment on
a direction vector. Unit spellings live inside the `expression` string (`z.string()`), so **adding
`cm` required no schema change and no `formatVersion` bump.**

### 3.4 — ⛔ `§DERIVED-KIND-BOUNDARY` — a limit found BY EXECUTION, asserted so it cannot be misreported

**An arm was written expecting a refusal and did not get one.** It is kept, inverted, and named.

A derived kind survives only **inside one expression**. The instant a value becomes a parameter it
re-enters scope under its **declared** `dataType`, and `dataType` has no `area` member — so an area
stored in a `number` parameter comes back as `scalar`, permissive with everything:

```
Glazed  = Width * Height   (dataType 'number')   -> area inside the expression, scalar afterwards
Mixed   = Glazed + Width                          -> NOT refused. Resolves to 1801200.
```

⭐ **The declaration is left authoritative on purpose.** Letting a computed kind silently override a
declared one would give a parameter two sources of truth for what it measures (§76 B again) and
would **hide** the genuine authoring error of a `length` parameter whose formula computes an area.

This is C110 §3.4's same-change-set clause met **by execution rather than by reading**. Closing it
needs `FamilyParameterDataTypeSchema` to name `area` — 4B's file. **OWED.**

---

## 4 — §66 partial: a formula change recomputes its dependents

### 4.1 — The layer the property is read back at (audit R14 / C16 CA-21)

⛔ **`resolveParameter`'s returned `values` map IS the authoritative surface of this package, and
that is a contract fact rather than a convenience: C110 §2.7 rules that there is no stored
`currentValue`, and there must not be one.** There is no DTO store to avoid and no store to read
instead. So CA-21's discipline resolves here to: **never assert `ok === true` and stop; never spy on
`evaluateAst` and count calls; assert the DEPENDENT'S NUMBER, before and after.**
A spy would prove the evaluator was *called* again — not that the recomputed value reached the
resolved state, which is the property §66 actually asserts.

### 4.2 — The chain, and the numbers

`OpeningWidth(1200) + FrameWidth(60) → GlassWidth → PaneWidth → PaneReveal`, edited by producing a
**new parameter list** (the resolver is pure, C110 §5.1 — nothing is mutated in place):

| | GlassWidth | PaneWidth | PaneReveal |
|---|---|---|---|
| `OpeningWidth - 2 * FrameWidth` | **1080** | **540** | **530** |
| `OpeningWidth - 4 * FrameWidth` | **960** | **480** | **470** |

**Only `GlassWidth` was edited; `PaneWidth` and `PaneReveal` were not, and both move.** A
recomputation that updated only the edited parameter would pass an assertion on `GlassWidth` alone —
which is why the transitive dependent carries the test. The inputs are asserted UNCHANGED (a
recompute that moved its own inputs is a cascade defect, not a recomputation).

Three further arms: a formula change that introduces a **new dependency** re-sorts the topological
`order` (`MullionWidth` before `GlassWidth` before `PaneWidth` before `PaneReveal`); **no stale
derived value survives a re-resolution** (§66's last clause at this layer — resolve edited, then
original, and the original's numbers return exactly; a memo keyed on parameter id, the obvious
optimisation and the obvious way to reintroduce the defect, fails this arm); and progressive
parametrisation from the dependents' side.

### 4.3 — ⛔ HONESTY: this property was ALREADY TRUE at HEAD. This lane MEASURED it.

All four `formulaRecompute.test.ts` arms **pass against unmodified HEAD source** (transcript
`vitest-SEEN-FAILING-at-HEAD.txt`: 14 failures, none of them in this file). The D4 repair that
landed in Phase 3 is what makes it work. **Lane 4A's contribution here is the executed proof at the
resolver layer — not the capability.** Reporting it as newly built would be the overstatement this
programme exists to stop.

⚠ **§66 IS NOT PASSED.** Its other four properties (20 instances; one instance changes alone; type
change propagates; definition change follows version rules) need a **placed element** and belong to
lane **4C**. A green run of this file is not §66.

---

## 5 — ⛔ D3: NOT executed. Deliberately. And now cheaper by an order of magnitude.

`phase3/d3-unit-migration.md` was read first, as instructed. Its verdict — larger than one
change-set, blocked on an unmeasured sketch-solver-tolerance coupling, and **"do not half-do it"** —
**stands, and this lane did not touch it.** `toCanonical` still produces millimetres; every existing
assertion (`toBe(500)`, `toBe(2000)`) is unchanged and green.

⭐ **What changed is the cost.** The migration was *"rewrite a switch whose cases are the
vocabulary"* (Group A item 1). It is now **one token**:

```ts
const CANONICAL_LENGTH_UNIT: CanonicalLengthUnit = 'mm';   // ⛔ D3 rules 'm'.
```

Every length spelling — including the newly added `cm` — converts through one factor table keyed by
that constant, in exact literals in both columns (no division, so `toBe(500)` stays exact).
`CanonicalLengthUnit` is deliberately narrower than `LengthUnit`: `cm` is an authoring literal and
was never a candidate for the storage unit.

**Adding `cm` therefore cost the owed migration nothing** — it is a column in a table that flips
wholesale, not a new case in a switch.

⛔ **A guard test asserts the OWED state** (`⛔ D3 IS OWED: length is still stored in MILLIMETRES`)
using `2.1 m / 2100 mm` — C110 §3.3-b's negative control: three orders apart, both physically
plausible for a window. When the migration lands, that arm fails and must be inverted **with the
whole change-set**. It must never be deleted alone; deleting it is how the debt stops being counted.

**C110 §3.3-a's decay probe, re-run at the start of this lane as that clause requires:**
`find . -name "*.pryzm-family" -not -path "*/node_modules/*"` → **no files.** The window is still
open: no corpus, no `formatVersion` bump, no `scale-length-parameters` migrator required **yet**.

---

## 6 — Executed verification (foreground, redirected, `$?` read immediately)

| # | Command | Result |
|---|---|---|
| V1 | `npx vitest run` (baseline, before any edit) | **RC=0** · 6 files · **63 tests** |
| V2 | `npx tsc -p tsconfig.json --noEmit` (family-runtime) | **RC=0** |
| V3 | `npx vitest run` (final) | **RC=0** · 8 files · **88 tests** (+25) |
| V4 | `npx eslint packages/family-runtime --ext .ts` | **RC=0** · 1 warning, **pre-existing** (unused `eslint-disable` in `functions.ts` §`lookupBuiltin`, present at HEAD; left alone as unrelated churn) |
| V5 | `npx tsx tools/ga-gate/check-otel-spans.ts` | **RC=0** · Zone A **274/274** · Zone B **52 of 87, baseline 52** — unmoved. family-runtime is Zone C (census, ungated) |
| V6 | `npx tsx tools/ga-gate/check-layer-boundaries.ts` | **RC=0** · within baselines (violations **48/102**, unclassified **13/13**, sdk-bypass **156/182**) — unmoved |
| V7 | `pnpm --filter @pryzm/family-instance test` | **RC=0** · 5/5 |
| V8 | `pnpm --filter @pryzm/family-loader test` | **RC=1** — ⚠ **PRE-EXISTING, unrelated, and logged.** Collection-time `ReferenceError: DOMMatrix is not defined` from `pdfjs-dist` via `@pryzm/file-format`'s barrel, thrown on the test file's FIRST import, before any family-runtime code loads. `ISSUE-LOG.md` records this exact failure four times |

⛔ **No ceiling was raised, no gate disabled, no `gate-debt.json` entry added.**

### 6.1 — Falsification A: the new tests against unmodified HEAD (seen failing)

Backed up byte-exactly, `git checkout -- packages/family-runtime/` (path-scoped), copied the new
tests in, ran:

```
Tests  14 failed | 74 passed (88)      RC=1
  × refuses length + angle, with a typed `unit-mismatch` code naming BOTH kinds
  × refuses a length handed to a trigonometric function
  × refuses min() across two different kinds
  × refuses an AREA added to a LENGTH inside one expression
  × throws `UnitMismatchError` for a kinded scope — the class`s first construction
  × a mixed-unit LITERAL expression was always correct, and still is
  × refuses a length literal added to an angle literal
  × converts the new `cm` spelling with no bespoke code path
  × the TOKENIZER accepts it too, because its keyword set is derived
  × user-facing messages list the units from the same table
  × maps every declared dataType to a kind, exhaustively
  × unify: likes agree, scalar adopts, unknown propagates, unlikes REFUSE
  × multiply: builds the kinds it can name, `unknown` for the rest — and never refuses
  × divide: a ratio of likes really is dimensionless
```

⭐ **Note which four are absent: all of `formulaRecompute.test.ts`.** That is §4.3's evidence.

**Restore:** `diff sha-AFTER.txt sha-RESTORED.txt` → **empty. BYTE-IDENTICAL.** Re-run → **88/88,
RC=0**; typecheck → **RC=0**.

### 6.2 — Falsification B: the surgical one the brief names — remove the kind from the scope

One line in `resolveParameter`, `kindedScope[k] = { value: v, kind: kindOfDataType(...) }` →
`kindedScope[k] = v`:

```
Tests  4 failed | 84 passed (88)       RC=1
  × refuses length + angle, with a typed `unit-mismatch` code naming BOTH kinds
  × refuses a length handed to a trigonometric function
  × refuses min() across two different kinds
  × refuses an AREA added to a LENGTH inside one expression
```

⭐ **The asymmetry is the proof.** Exactly the four refusing arms fail, **by name**. Every permissive
arm still passes (so the refusal is not "throws a lot"), and the evaluator-layer arms still pass
(they build their own kinded scope, so they are independent of this line). **Restore:**
`diff sha-AFTER.txt sha-RESTORED-2.txt` → **empty. BYTE-IDENTICAL.** Re-run → **88/88, RC=0**.

### 6.3 — Control for the downstream typecheck failure

`pnpm --filter @pryzm/family-instance typecheck` reports **RC=2, 1892 `error TS` lines**. Ran the
identical command with family-runtime reverted to HEAD: **RC=2, 1892 `error TS` lines** — **the same
number.** **Zero** of them are in any `packages/family-*` file (they are `geometry-wall`,
`core-app-model`, `command-registry`, `spatial-index`, …; the script pulls the whole transitive
graph through project references). **This lane added exactly zero typecheck errors.**

---

## 7 — §76 gate C — semantic / parametric / geometric models remain distinguishable

**Held, and strengthened.** This lane touched only the **parametric** model and pushed the
distinction *further* apart rather than blurring it: a parameter's quantity kind is now derived from
its **declared `dataType`** — a parametric-model fact — and never from a geometric magnitude or a
semantic class. §3.4's `§DERIVED-KIND-BOUNDARY` finding is precisely the choice to keep the
parametric declaration authoritative rather than let a computed value redefine what a parameter
means. No geometry, no THREE, no DOM, no I/O entered the package; it remains dependency-free.

---

## 8 — OWED, each with its owner

| # | Owed | Owner |
|---|---|---|
| **O-1** | ⛔ **D3 metres migration.** Not executed; the plan's verdict stands. Now **one token**. ⚠ `phase3/d3-unit-migration.md` **§3 Group A item 1 is out of date in this lane's favour** and should be amended: `toCanonical`'s switch no longer exists, and `cm` joins the same flip at no cost | Whoever executes D3, after the sketch-tolerance measurement and D1 |
| **O-2** | **`§DERIVED-KIND-BOUNDARY`** — `area`/`volume` cannot cross a parameter boundary until `FamilyParameterDataTypeSchema` names them (§3.4) | **Lane 4B** |
| **O-3** | **Spec §10's mass / temperature / pressure / energy / power** — each needs a `Unit` spelling AND a persisted `dataType` member **in one change-set** (C110 §3.4) | **Lane 4B** + a D3-settled unit substrate |
| **O-4** | ⚠ **C110 §4.4's `§DIAG-CLOSED-SET` table is now stale by one.** Re-enumerated with §4.4's own commands: `ResolverDiagnostic['code']` = **10** (was 9; `unit-mismatch` added) · `ExpressionEvalError['code']` = **6** · **16 slots / 15 distinct names** (was 15/14). ⛔ Read the enumeration, never this line | C110's owner |
| **O-5** | ⛔ **These 88 tests DO NOT RUN IN CI.** `packages/family-runtime/package.json` has `test` but no `test:ci`, and root `test:ci` is `pnpm -r run test:ci --if-present`. `npm run check:testci-coverage` → **RC=1**, *"SILENTLY SKIPPED: 122"*, and **`@pryzm/family-runtime` is line 29 of `scripts/check/test-ci-coverage-baseline.json`**. The fix is two lines — add `"test:ci": "vitest run"` **and** remove that baseline row in the same commit — but the baseline file is outside this lane's ownership and the gate is already RC=1 for two unrelated stale entries. **Not done; named** | Orchestrator / a lane owning `scripts/check/` |
| **O-6** | **Declared-vs-computed kind check.** `evaluateAstQuantity` now RETURNS the computed kind, so *"does this expression's kind match the kind its parameter declares?"* is answerable. **Not enabled** — it needs a decision about `count`/`number` parameters carrying length-valued formulas (C110 §7 G-1's open half). Exposing the value is what stops the next lane having to redo the erasure fix to ask the question | Phase 4/5 |
| **O-7** | **C110 §8.2's `check-parameter-precedence.ts` and §8.1's `check-canonical-length-unit.ts` remain UNBUILT.** This lane's suite is their intent and its falsifiers are the negative controls those gates need — but a package test is not a ga-gate, and **C110 §7 G-13 (*"no gate enforces any clause of this contract"*) still stands** | A gate lane |
| **O-8** | **§66 is not passed** — the 20-instance, instance-alone and type-propagation arms need a placed element | **Lane 4C** |

---

## 9 — Files changed (all inside `packages/family-runtime/**`; NOT committed)

**Modified (8):** `src/expression/unit-coercion.ts` (§UNIT-TABLE, `Quantity`, the kind algebra,
`UnitMismatchError` given structured fields) · `src/expression/evaluator.ts` (`ScopeValue`, kinded
`EvalScope`, `walk` returns `Quantity`, `evaluateAstQuantity`) · `src/expression/tokenizer.ts`
(`Unit` and the keyword set and the error message all derived) · `src/expression/functions.ts`
(per-builtin `argKind`/`resultKind`/`unifyFrom` **on the one frozen table**, not a parallel map) ·
`src/expression/index.ts` (barrel) · `src/resolution/resolveParameter.ts` (kinded scope +
`unit-mismatch` mapping) · `src/types.ts` (the new diagnostic code) ·
`__tests__/unit-coercion.test.ts` (widening + algebra + the D3-owed guard).

**New (2):** `__tests__/unit-mismatch.test.ts` (13 tests) · `__tests__/formulaRecompute.test.ts`
(4 tests).

**Transcripts:** `C:\Users\LENOVO\AppData\Local\Temp\claude\c--Users-LENOVO-OneDrive-Desktop-PRYZM-Product-Rediness-08\beb33dfe-f32f-462e-9ed8-2a910f85af86\scratchpad\4a\`
(`baseline-vitest.txt`, `vitest-FINAL.txt`, `vitest-SEEN-FAILING-at-HEAD.txt`,
`vitest-FALSIFIER-kind-erased.txt`, `tsc-instance-CONTROL-AT-HEAD.txt`, `gate-otel.txt`,
`gate-layers.txt`, `sha-BEFORE.txt` / `sha-AFTER.txt` / `sha-RESTORED.txt` / `sha-RESTORED-2.txt`).

⛔ Nothing outside `packages/family-runtime/**` was modified. `packages/schemas/src/siteintel/**`
and `packages/site-parcel-data/**` were never opened. `git stash` was never used; the one revert was
`git checkout -- packages/family-runtime/`, path-scoped to this lane's exclusive ownership, with
byte-exact backups taken first and sha256 verified after.
