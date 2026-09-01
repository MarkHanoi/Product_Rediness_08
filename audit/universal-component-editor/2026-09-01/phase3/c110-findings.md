# LANE C110 — findings, measurements and what is OWED

**Date:** 2026-09-01 · **Lane:** C110 (Phase 3A MINT) · **HEAD:** `de23a59f` ·
**Rule obeyed:** Phase 3 is *no code, no UI*. **No production file was modified by this lane.**
Two files were written: the contract and its index row. Nothing was committed.

## Deliverables

| File | State |
|---|---|
| `docs/02-decisions/contracts/C110-PARAMETER-UNIT-AND-EXPRESSION-MODEL.md` | **WRITTEN** — 9 sections, CANONICAL / NOT ACTIVE |
| `audit/universal-component-editor/2026-09-01/phase3/index-row-C110.txt` | **WRITTEN** — the exact row + the range-correction obligation, for the orchestrator |
| `docs/02-decisions/contracts/README.md` | ⛔ **NOT TOUCHED** — three lanes share it; the orchestrator applies all rows in one edit |

## Gate readings — FOREGROUND, redirected, `$?` read immediately

| Gate / suite | Reading | Note |
|---|---|---|
| `packages/family-runtime` — `npx vitest run` | **RC=0** · 6 files · **63 tests passed** | the subject is green; the contract describes a working engine |
| `check-contract-index-equivalence` — **with** C110 on disk | **RC=3** · arm A **20/18** · arms B/C/D clean | ⚠ **20, not 19: `C112-CONNECTORS.md` appeared in the tree mid-lane** from a concurrent Phase-3A lane |
| `check-contract-index-equivalence` — with **both** C110 and C112 removed | **RC=0** · arm A **18 = baseline** · `OK: arms B/C/D clean` | ⭐ the pre-lane green, measured both directions — **the rows close it, nothing else** |
| `check-contract-cited-paths` — **before** C110 | **RC=3** · **507** unresolved / baseline 490 | ⛔ **PRE-EXISTING BREACH, not this lane's.** The audit records its first reading as 491 |
| `check-contract-cited-paths` — with C110, **first draft** | **RC=3** · **512** | this lane added **5**: three absent `packages/*` directories + two unbuilt gates |
| `check-contract-cited-paths` — with C110, **fixed** | **RC=3** · **508**; `comm` of the two path SETS = **empty in both directions** | ⭐ **C110 adds ZERO paths to the unresolved set.** The 507→508 move is `C112`'s, measured by removing C110 and re-running |

**How the five were fixed, without laundering.** The gate's own header says `ABSENT`, `UNBUILT` and
*"does not exist"* are **not** exemptions, *"because the prose claim is exactly what cannot be
trusted."* So:

- The three absent directories (`units`/`quantity`/`measure`) were moved **into a fenced code block**
  as the FAILED SEARCH they are — fenced lines carry no inline backticks, so the gate does not read
  them as citations, and the reader gets the re-runnable `ls` instead of a claim.
- The two gates were marked **`PLANNED`** on their own lines, which is what PLANNED means here: this
  contract §8 *is* their written intent. Both now appear in the gate's EXEMPT block by name.

## Findings this lane produced that no earlier lane reported

**F1 — ⭐ Two `§`-tags were being cited by production code with no document to resolve to.**
`resolveParameter.ts` cites `§PARAM-PRECEDENCE`; `introduce-expression.ts` and
`family-migration.test.ts` cite `§SUPERSEDED-DEFAULT`. Neither existed anywhere. A `§`-tag pointing
at nothing is a citation to a contract that does not exist — this programme's own defect class, in
miniature. **C110 is now their home** and mints five more (`§CANONICAL-LENGTH-METRES`,
`§UNIT-KIND-ERASURE`, `§DIAG-CLOSED-SET`, `§APPROX-BUILTIN`, `§TWO-DEFAULT-STORES`).

**F2 — ⛔ The D4 repair clears `defaultValue` and does NOT clear `document.defaults[id]`.**
`grep '\bdefaults\b'` over `introduce-expression.ts` → no hits. A document has **two** default
stores: `FamilyParameter.defaultValue` (read by the resolver) and `FamilyDocument.defaults` (written
by `add-parameter`'s `seedDefault`, `change-parameter-type` and `delete-parameter`; **read by no
resolver anywhere**). So a superseded default can survive in the second store. **Inert today because
nothing reads it — which is exactly the condition that ends when someone adds a reader.**
Contract §2.8 / **G-8**.

**F3 — ⛔ FOUR OF THE TWELVE BUILT-INS ARE IMPLEMENTATION-APPROXIMATED.** ECMA-262 specifies
`Math.sin`, `Math.cos`, `Math.tan` and `Math.pow` as implementation-approximated; the other eight
(`min`, `max`, `if`, `sqrt`, `abs`, `round`, `floor`, `ceil`) are exactly specified. The package's
own header says the editor (browser), the bake-worker (Node) and the AI worker (Node) *"all import
the SAME runtime"* — which is precisely the cross-engine split where the difference shows. **C73
§1.2's MUST-NOT list does not name this.** Contract §5.4. Two smaller measured curiosities in the
same family: `Math.round(-0.5)` returns **`-0`**, and `JSON.stringify(-0)` is `"0"`, so a resolved
`-0` is not round-trip stable under `Object.is`.

**F4 — `FamilyParameterKind` is declared in two places and consulted by nobody.** Proven by
execution, not by reading:

```
CLAIM 3 — kind is never consulted: an INSTANCE override lands on a kind:"type" param
  kind:"type" + instanceOverride -> {"TypeOnly":1.8} diagnostics: 0
```

`pickOverride` never reads `p.kind`. Contract §1.2 / **G-3** — the decision is deferred (it depends
on Phase-4 inspector behaviour) but the **disclosure is binding now**: no surface may claim a
`kind: 'type'` parameter is protected from instance override.

**F5 — the audit's "14 typed diagnostic codes" went stale inside one day.** The D4 repair added
`superseded-default`. Enumerated mechanically: resolver **9**, evaluator **6**, **15 slots / 14
distinct names** (`unknown-identifier` is in both). ⭐ The trap is that *14 is still a true number of
something*, which is how a stale count survives a review. Contract §4.4 carries the re-run command
instead of the number.

**F6 — spec §9 names FOURTEEN parameter attributes, not eleven.** Lane C scored "8 of 11" against a
paraphrase. Against the spec's own list (*identity, semantic meaning, name, datatype, unit, default,
current value, scope, formula, dependencies, constraints, editable, visible, provenance*) the score
is **8 present · 1 conflated (unit is folded into `dataType`) · 1 ambiguous (`scope` vs `kind` are
two axes wearing one word) · 4 absent**. ⚠ **Neither count is the point** — *which* four are absent
is, and they are the four that make a parameter a semantic object rather than a labelled number.

**F7 — `ParametricParameter.constraint`'s docstring is false today.** It claims the DSL is *"parsed
by `@pryzm/family-runtime` at instance-bake time."* Nothing anywhere reads that field. ADR-0376 D3
settles the **unit** half of the two-model rivalry in `ParametricParameter`'s favour (metres was
already its base) and settles nothing else. Contract §3.8 / **G-10** — C111's decision, not C110's.

## Falsification control

Every determinism claim in §5 was executed, and the probe was written to be able to FAIL:

- **CLAIM 1** (values are order-independent) — `PASSED`; had it failed, §5.2's MUST would have been
  written the other way.
- **CLAIM 2** (`order[]` IS array-order dependent) — `PASSED`, i.e. the arrays genuinely **differ**
  (`["p_ow","p_fw","p_gw"]` vs `["p_fw","p_ow","p_gw"]`). This is the control on CLAIM 1: had *both*
  been identical, CLAIM 1 would have proven nothing except that the probe ran twice on one input.
- **CLAIM 3** (`kind` unconsulted) — a `kind:'type'` parameter accepted an instance override with
  **zero** diagnostics.
- The §5.2 fixture is the founder's §64 demo **expressed in metres** (`1.2 − 2 × 0.06 = 1.08`), so
  §2.2 and §3.1 are shown holding *together*, and the numbers obey §3.3-b's rule — the metre and
  millimetre readings differ by three orders and both are physically plausible for a window.
- The gate work carries its own control: the unresolved-path sets were diffed **with** and
  **without** the contract file, in both directions, rather than trusting a total that another lane
  was concurrently moving.

## OWED — not done by this lane, deliberately

1. ⛔ **The C00 index row** — `index-row-C110.txt`, orchestrator-applied. Until it lands,
   `check-contract-index-equivalence` is **RC=3 at arm A 20/18**. **The fix is the rows; raising the
   baseline to 20 is the one forbidden fix** (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836).
   The same commit must move conflict-resolution **row 4's range** (it reads "C01–C108 + C24.1"
   while C109/C110/C112 are on disk) — quoting the gate's own reading, never a transcribed number.
2. **ISSUE-LOG rows.** `docs/04-reference/ISSUE-LOG.md` is a shared file and this lane did not touch
   it. Max L at measurement was **L-12872**. The gaps are registered as contract-local **G-1…G-13**
   (the C107 §12 / C109 R-n idiom) so nothing collides. If the orchestrator wants L rows, **G-8**
   (the second default store) and **G-12** (D3 is a TO-BE and its window decays) are the two that
   most deserve one — G-8 because it is latent and new, G-12 because it blocks Phase 4A.
3. **The two gates of §8** are UNBUILT and are Phase-5 work, not Phase-3 work (Phase 3 is *no code*).
   §8.2's negative control is written in advance so the lane that builds it cannot skip it.
4. **G-7 is UNMEASURED, not assumed.** Whether `rename-parameter` rewrites referencing expression
   strings was not measured by this lane, and the contract says so rather than asserting either
   answer. A rename that does not rewrite yields an `unknown-identifier` at the next resolve —
   loud, but *loud is not handled*.

## What this lane REFUSED to do

- ⛔ **No new expression engine, no new schema, no new refusal vocabulary** (audit R1). §4 contracts
  `packages/family-runtime` as it stands and names its gaps; §3.4 explicitly declines to mint the
  nine-kind quantity vocabulary, because minting a vocabulary with no consumer is how nine rival
  unit enums were acquired in the first place.
- ⛔ **No solver authorisation.** §6.6 states that §4.3's closed-form-assignment observation reaches
  C74 §4.2(b) and stops, against C74 §4.5's UNPROVEN verdict.
- ⛔ **Did not annex the element-parameter path.** G-2 (the join) is named as the headline gap and
  left with C03/C16/C65 and Phase 4.
- ⛔ **Did not re-score spec §9–§15 from scratch.** The audit's table is carried as the AS-IS with
  the two D4-moved cells marked; a second score of one subject is C84 EI-9.
- ⛔ **Touched neither `packages/schemas/src/siteintel/**` nor `packages/site-parcel-data/**`**
  (audit R9), nor any of the three serialize-only shared files. **No `git stash` was run.**
