# CONTRACT AMENDMENT REGISTER — measured defects awaiting amendment

> ## THIS REGISTER'S OWN MEASUREMENT DATE: **2026-08-19, second pass** (lane REG1) · first pass 2026-08-19 (lane RG1) · opened 2026-08-18
>
> ⭐ **THE TWO DURABLE FIXES THIS REGISTER PROPOSED ARE NOW BUILT AND GREEN** (`1fd1cc63`). Every
> row below is now measurable by a command instead of by a lane — and §0's estimate was **four
> times too low**:
>
> ```
> npx tsx tools/ga-gate/check-contract-cited-paths.ts        # RC=0  (2026-08-19)
>   101 contract files · 2960 citations -> 1527 distinct · 1028 RESOLVE
>   491 UNRESOLVED  <- pinned baseline, shrink-only   ·  8 exempt (PLANNED/struck)
>
> npx tsx tools/ga-gate/check-contract-index-equivalence.ts  # RC=0  (2026-08-19)
>   100 files · 83 rows · declared RESERVED: C61
>   A FILE-WITHOUT-ROW 18 (baselined) · B 0 · C 0 · D 0   (B/C/D hard-0)
> ```
>
> **§0 sized the first at "119+". It measures 491.** Not because the estimate was careless — §12's
> sweep was two axes across ONE range and the gate is seven roots across all 100 contracts. **But
> the direction of the error is this register's own recurring finding** (§9: 15 -> 22 -> 24):
> *a confident count forecloses the measurement that would have corrected it.*
>
> **Every row below carries one of FOUR verdicts, and they are not two:**
> **STANDS** (re-measured, still true) · **CLOSED** (fixed — SHA cited) ·
> **SUPERSEDED** (the defect changed shape) · **NOT RE-MEASURED** (nobody checked — not a pass).
> **NOT RE-MEASURED is not CLOSED. UNPROVEN is not FAIL is not PASS.** A row with no verdict is
> stale by definition — the point of this banner is that its age is visible at a glance.
>
> **Re-derive the suite count before citing it — never transcribe it:**
>
> ```
> ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'     # -> 100  (2026-08-19)
> ls docs/02-decisions/adrs/ADR-*.md | wc -l              # -> 268  (2026-08-19)
> find docs -name 'SPEC-*.md' | wc -l                     # -> 96   (2026-08-19)
> ```
>
> **= C01–C100 minus C61, plus C24.1. `C61` is now the ONLY reserved, unminted slot** — **C76 was
> MINTED 2026-08-19** (`baa98eba`), which is exactly why the command is printed instead of its
> answer. The suite has now had the count/range staleness failure **FIVE times**
> (C67 → C81 → C84/C85–C99 → C100 → C76). **A register that cannot say how old it is would be the sixth.**
>
> **Retractions are struck and annotated, NEVER deleted** (C84 §6). A closed row is evidence about
> *what kind of defect this suite keeps producing*, which is half of what this file is for.

- **Status**: LIVE WORKING REGISTER — not a contract. It records what is **measured to be wrong**
  in the contract suite, so the amendments can be applied in priority order rather than all at once.
- **Date opened**: 2026-08-18
- **Method**: four read-only sweep lanes (C01–C20, C21–C50, C51–C75, C77–C84 + index) plus four
  element audits. **Every entry below was measured** — `ls`, `grep -n`, or the gate's own exit code
  read from a file. Claims that could not be verified are marked **NOT MEASURED** and are findings,
  not gaps.
- **How to use**: work top-down. Rank is by **blast radius** — a false claim that sends an engineer
  to *rebuild something that exists* or to *delete something live* outranks a stale count.

---

## 0. Why this register exists

Four contracts were found factually false within an hour of each other, by four independent lanes,
and **each had already propagated into a further document**. That is not four mistakes; it is a
missing control.

**The three defect shapes, all measured, all recurring:**

| Shape | What it looks like | Why review misses it |
|---|---|---|
| **A — "NOT BUILT" outliving the code** | contract stamped before the feature landed, never re-read | the claim was true when written |
| **B — one-axis reachability** | *"zero importers"* → deletion order | the count is correct; the conclusion is not |
| **C — declared but never called** | *"called every frame by the render loop"* | the declaration exists, so grep finds it |
| **D — the check that could never have failed** | a gate or audit RUNS, PASSES, and is structurally incapable of a negative | **there is nothing to find.** A green result and an unaskable question are the same output |

### ⭐ SHAPE D — ADDED 2026-08-19 (lane REG1). **Read this before working any row below.**

Shapes A, B and C are all *false claims*. **D is not a claim at all** — it is a check whose **✅ is
uninformative**, because no possible state of the world would have turned it red. It is the most
dangerous shape in this table for one reason: **A, B and C are found by measuring; D is invisible
to measurement, because measuring it returns PASS.** The only instrument that finds a D is a
*planted control* — a violation deliberately introduced to prove the check can still say no.

**Measured instances, all from this repository, each recorded independently of the others:**

| Instance | The check | Why it could never fail |
|---|---|---|
| **L-827** | `check-project-isolation.ts` | `execSync('grep -c ... 2>/dev/null \|\| echo 0')` on win32 — the redirect fails, `echo 0` fires. It reported **0 hits for all four C13 anchors while all four were present** (33/3/1/1). *"I could not run"* and *"I looked and found nothing"* were **the same value**, and it did **not throw**. |
| **L-811** | `check-three-imports.ts` | shelled to `rg`, undeclared and never installed. The crash was recorded as the declared failure. **P2 was clean the whole time and nobody could see it.** |
| **§RAF-GATE-COMMENT-BLIND** | `check-raf-count.ts` | counted **comment lines** as rAF owners — three of the four "owners" were doc comments *asserting P3 compliance*. The gate was counting sentences. |
| **2026-08-19 · THIS LANE** | `check-contract-index-equivalence.ts` **arm D**, first draft | `reservedIds()` matched `RESERVED` in **both** directions, so the changelog idiom *"C61 remains the RESERVED unminted slot — **C64** does not take it"* declared **C64** reserved. Six live contracts (C24.1, C64, C66, C68, C69, C76) were silently exempted. **Arm D would have run, passed, and could never have failed.** Caught by a planted control on its first execution — **not** by reading the code. |
| **2026-08-19 · reported** | an isolation audit whose underlay detector **only its own tests could satisfy**; a clash gate whose fake and production **disagree about the argument shape** | the fake was built from the header, so it **cannot falsify the header**. |

⛔ **The consequence for THIS register.** §5 already records the *inverse* error — treating a
`MISCONFIGURED` exit as if it were a reading. **Shape D is worse, because it does not announce
itself as MISCONFIGURED. It announces itself as ✅.** Every *"✅ APPLIED"*, *"VERIFIED CLEAN"* and
*"CLOSED"* below rests on some instrument, and **this register has never once asked of any of them:
could this have come back red?**

> **THE RULE, STATED ONCE:** *a gate with no planted control has not been shown to work — it has
> been shown to run.* Both gates landed today execute their controls **inside every invocation**
> and exit **2** if a control fails to fire. Every pre-existing row below is **NOT RE-MEASURED** on
> this axis. That is the honest verdict, not a gap. [L-1222]

---

⭐ **The cheapest durable fix, and it would have caught 119+ of the defects below:** a gate asserting
that **every `tools/ga-gate/*.ts` and `packages/*/` path cited anywhere in
`docs/02-decisions/contracts/` resolves on disk**, or carries an explicit `PLANNED` marker.
*Proposed as L-960.*

> ### ✅ **BUILT AND GREEN — 2026-08-19 (lane REG1), `1fd1cc63`**
>
> `tools/ga-gate/check-contract-cited-paths.ts` — **RC=0** at a shrink-only baseline pinned to its
> first honest reading: **1527 distinct citations · 1028 resolve · 491 UNRESOLVED · 8 exempt.**
> The **119+** estimate above is left standing and unedited, because the gap between it and **491**
> is the artefact. Its sibling `check-contract-index-equivalence.ts` closes the README banner's own
> stated exit condition (§1). Both are registered in `run-all.ts` — **last, after the R5 meta-gate,
> so a documentation failure can never mask a code failure** — and ledgered in
> `gate-newly-measured.json`, **not** `gate-debt.json`, per C76 §6.3.
>
> **The four largest holders of the 491** — none of them new findings, all of them now counted:
> `scripts/ci-check-spans.ts` **24 sites** (§9 owns it; the file has never existed — L-812) ·
> `server/parcelZoningProxy.js` **12** (C57) · `packages/schedule-4d/` **8** (C37) ·
> `packages/schemas/src/standards/` **6** (C34).
>
> ⚠ **A sub-family the gate deliberately does NOT separate, named here so it is not misread:**
> `src/ui/` and `src/engine/**` (C06, C11). Those paths **were real**; they moved to
> `apps/editor/src/**`. **STALE is not FICTIONAL** — it is a different amendment from *"this was
> never built"*, and a reader who treats all 491 as phantom work will go and retire live code.
> [L-960]
>
> ⚠ **NOT CLAIMED:** the gate strips a trailing `:1025-1031` before resolving. It does **not**
> check that a line anchor still holds what the contract says it holds — §2 records C96 §3.1's own
> evidence going stale in **one day**. That is a different gate and this one does not claim it.

---

## 1. ⛔ RANK 1 — THE INDEX ITSELF

> ### ✅ **CLOSED — BOTH HALVES** by `4136ce53`, and **STRUCTURALLY DISARMED** by `1fd1cc63`.
> Re-measured and amended 2026-08-19, lane REG1. *(Prior verdict, kept: **CLOSED (README half) ·
> SUPERSEDED (CLAUDE.md half)** — re-measured 2026-08-19, lane RG1.)*
>
> **CLAUDE.md §Governance — CLOSED.** It read *"**C61 and C76 are RESERVED, unminted slots**"* and
> derived the count as *"C01–C100 minus the **two** unminted slots"* → **99**. Measured
> `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **100**. Now reads *"`C61` is the ONLY
> RESERVED, unminted slot — ~~C76~~ was MINTED 2026-08-19"*, with the fifth-recurrence box.
>
> **README:219 — CLOSED.** The undated present-tense *"69 contract files exist"* sentence is
> **struck and annotated per C84 §6**, not deleted, and replaced with a pointer to the gate rather
> than a fresh count — because a fresh count is how all five recurrences started.
>
> ⭐ **WHY THIS ROW IS NOW STRUCTURALLY CLOSED AND NOT MERELY ANNOTATED.** The README banner's own
> stated exit condition was *"a gate asserts `ls contracts/` equals this table's row set **in both
> directions** … Until that gate exists, this banner is the only thing standing between the index
> and its next drift."* **That gate now exists** —
> `npx tsx tools/ga-gate/check-contract-index-equivalence.ts` → **RC=0**, 100 files · 83 rows ·
> arms B/C/D **hard-0 and clean**. It compares **SETS, never a number**, which is the point: every
> one of the five recurrences was a range or count written as a *literal*, and a count can be right
> while the set is wrong.
>
> ⛔ **WHAT DID NOT CLOSE, and it is the substantive half — arm A reads 18.** Eighteen contracts
> exist as files with **no row in the index table**: **C81, C84, the entire C85–C99 per-element
> block, and C100.** CLAUDE.md defers the *conflict-resolution ordering* to that table, so **all
> eighteen are currently ordered by nothing** — including **C84**, binding on every PR touching an
> element family. The verdict *"the index is wrong"* is closed; the verdict *"the index is
> complete"* is **NOT RE-MEASURED because it is measurably FALSE at 18**. Baselined shrink-only.
> **AMENDMENT OWED: eighteen index rows. OWNER: README (C00) — unclaimed, and it is now the
> highest-value unstaffed edit in this file.** [L-1130, L-1131]
>
> ⚠ **A SIXTH INSTANCE OF THE SAME SHAPE, MEASURED TODAY AND DELIBERATELY NOT PATCHED:**
> `ls docs/02-decisions/adrs/ADR-*.md | wc -l` → **272** and `find docs -name 'SPEC-*.md' | wc -l`
> → **97**. README rows 5–6 and CLAUDE.md both say **268 / 96** — stale by four and one **after one
> day**. They are left alone **on purpose**: both carry their measurement date *and* their
> derivation command, which is the correct form. **A dated number is history; an undated one is a
> claim.** Patching the digits would restart the cycle; this is the shape the gate exists to end.
>
> *(Original 2026-08-19 lane RG1 finding retained below.)*
>
> **README — CLOSED** by `fb403310` (*"the contract index stated C01–C83 while C84–C100 existed as
> files"*), updated again by `baa98eba` when C76 was minted. Verified at HEAD: `README.md:16` reads
> **C01–C100 + C24.1**, prints **100**, and cites the derivation command; rows 5–6 read **268** /
> **96**, matching `ls docs/02-decisions/adrs/ADR-*.md | wc -l` -> **268** and
> `find docs -name 'SPEC-*.md' | wc -l` -> **96**.
>
> **CLAUDE.md — the RANGE is CLOSED** by `657abdba`; **a NEW defect of the identical shape opened the
> same day.** `CLAUDE.md:242` reads *"**C61 and C76 are RESERVED, unminted slots**"* and `:256`
> derives the count as *"C01–C100 minus the **two** unminted slots"* -> **99**. **C76 was minted
> 2026-08-19** and `C76-PLATFORM-AND-API-SURFACE.md` is on disk;
> `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` -> **100**. **This is the FIFTH recurrence,
> and it recurred within a day of the fourth being corrected** — the strongest available evidence
> that the rule *"the row and the range move together"* is stated in three places and enforced by
> nothing. **AMENDMENT OWED: CLAUDE.md §Governance. OWNER: no live lane holds it.** [L-1130]
>
> **Also STANDS, unamended:** `README.md:219` still opens *"**69 contract files exist (C01–C60 +
> C62–C69 + C24.1); C61 is a RESERVED slot**"* — undated, present tense, in changelog prose.
> (`README.md:20–24`'s banner still prints 98 / 267 / 95, but it is **dated 2026-08-18**, so it is
> historical rather than false. **The `:219` sentence is neither.**) **OWNER: README (C00), unclaimed.** [L-1131]

> **This is the highest blast radius in the suite.** CLAUDE.md calls
> `contracts/README.md` *"the authoritative enumeration — always defer to it over any range
> written here."* An index that is wrong outranks any single wrong contract.

| Claim | Where | Stated | **Measured 2026-08-18** |
|---|---|---|---|
| suite range | README row 4 | `C01–C83 + C24.1` | **98 files**; C84 + C85–C99 outside the range |
| file count | README §"69 contract files" | `69` | **98** |
| ADR count | README rows 5, 27 | `251` | **267** |
| SPEC count | README rows 6, 28 | `92` | **95** |
| suite range | **CLAUDE.md Governance** | `C01–C68 + C24.1` | **~30 contracts outside the stated ordering** |

**Files with NO row in the table:** C81, C84, and every landed per-element contract
(C85, C87–C99).

⚠ **CLAUDE.md's error is the dangerous one.** An agent reading it literally ranks **C84 below an
ADR** — and C84 binds every PR touching an element family. This is the *third* recurrence of the
same shape (C67 → C81 → C84/C85–C99).

**STATUS: ✅ BANNER APPLIED** to README rows 4–6. **CLAUDE.md still owed.**

---

## 2. ⛔ RANK 2 — C84's OWN #1 SEVERITY ROW IS FALSE

> ### ⛔ **STANDS — UNAMENDED. RE-CONFIRMED 2026-08-19 (second pass, lane REG1), and it is now
> the #1 open row in this file**, because RANK 1 closed and this did not.
>
> ```
> grep -ci lighting apps/editor/src/engine/persistence/ProjectSerializer.ts       # LIVE -> 10
> grep -ci lighting packages/persistence-client/src/loader/ProjectSerializer.ts   # DEAD -> 0
> grep -n lighting docs/.../C84-ELEMENT-INTEGRITY.md   # :734 still reads EI-6 "NEVER"
> ```
>
> **Unchanged in every particular.** C84 `:734` still carries the §4 row
> *"`lighting` | ⚠️ renders, never saves | … | ⚠️ **NEVER**"*, and `:85` still carries the §0
> narrative *"**Lighting is never persisted**"*. **Two contracts still answer one question in
> opposite directions**, with the wrong side ranked severity **#1** of the entire element-integrity
> programme.
>
> ⛔ **REG1 MUST NOT EDIT C84 — a live lane holds it** (element integrity, persistence round-trip).
> **ROUTED, NOT APPLIED.** This row is the reason it is routed rather than dropped. [L-1133]
>
> *(Prior verdict, kept: **STANDS — UNAMENDED**, re-measured 2026-08-19, lane RG1.)*
>
> ```
> grep -ci lighting apps/editor/src/engine/persistence/ProjectSerializer.ts       # LIVE -> 10
> grep -ci lighting packages/persistence-client/src/loader/ProjectSerializer.ts   # DEAD -> 0
> ```
>
> **C96 §3.1 RETRACTED the claim 2026-08-18 (`87c711ac`) — C84 was never updated.** At HEAD C84 still
> carries it in **five places**: `:52` (§0 audit table), `:85–89`, `:298`, **`:734`** (§4 row
> `lighting` — EI-1 *"renders, never saves"*, EI-6 **"NEVER"**) and **`:753`** (severity **#1**,
> *"Lighting never persisted — loses the work itself, on every save"*).
>
> **Two contracts now answer one question in opposite directions.** Under the suite's own conflict
> rule that is not a tie — it is a defect with a known correct side, and the wrong side is the one
> ranked severity #1 of the entire element-integrity programme.
>
> **And C96's own citation has already rotted.** C96 §3.1 (and this row) cite
> `ProjectSerializer.ts:1025-1031`. Measured 2026-08-19: `§PERSIST-LIGHTING` sits at **`:1138–1143`**,
> the field declaration at **`:149–150`**, the emit at **`:1219`**; C96 prints `grep -ic` = **9**, it
> now reads **10**. **The retraction is right and its evidence is one day stale** — the same
> rotted-citation shape `174f8206` recorded for C85's eight `file:line` cites.
>
> **AMENDMENTS OWED (unchanged, plus one): retract §4 row `lighting` EI-6 and severity row 1 citing
> C96 §3.1; re-anchor C96 §3.1's line numbers. OWNER: C84/C85 orchestrator lane — RG1 must not edit C84.** [L-1133]

**C84 §4 ranks *"lighting never persisted"* as severity 1 — "the work itself, lost on every save".
It is false, and has been for three months.**

| File | `grep -ci lighting` |
|---|---|
| `packages/persistence-client/src/loader/ProjectSerializer.ts` — **DEAD, app never builds it** | **0** ← what C84 measured |
| `apps/editor/src/engine/persistence/ProjectSerializer.ts` — **LIVE** | **9** |
| DEAD `ProjectLoader.ts` | 0 |
| LIVE `ProjectLoader.ts` | 18 |

Lighting has serialized since **`§PERSIST-LIGHTING`, 2026-05-22** (`ProjectSerializer.ts:1025-1031`,
`:1106`) — **three months before C84 was stamped**.

⭐ **How the error survived TWO attempts to fix it.** The original claim measured the dead
serializer. My *correction* then measured the **dead serializer against the LIVE loader** — two
different files — which is why *"the LOAD half exists and the SAVE half does not"* read so
convincingly. `initPersistence.ts:94` names the trap explicitly, and the repo had already recorded
a **prior casualty** of the identical mistake (a C23 provenance fix landed on the dead copy).

**This is C84 §8.b committed by C84, on its own severity-1 row.**

**What survives, and is sharper:** the real defect is a **lossy RESTORE** — 13 authored fields
(12 `*Params` blocks + `emission`) written to disk and discarded on load, because
`CreateLightingPayload` has no slot for them. Narrower, still live, and **invisible while the false
claim held attention.**

**AMENDMENTS OWED:** retract severity row 1; set §4 `lighting` EI-6 to ✅ citing C96 §3.1; re-measure
every serializer/loader `file:line` in §0, §1.2, §4 against the `apps/editor` path; re-rank the
severity table from what survives.

---

## 3. ⛔ RANK 3 — C84 EI-11 INVERTS THE SECTION IT CITES

> ### ⛔ **STANDS — UNAMENDED. RE-CONFIRMED 2026-08-19 (second pass, lane REG1).**
>
> ```
> sed -n '541,542p' C84-ELEMENT-INTEGRITY.md   -> "C73 §5.1 E1 records that the canonical
>                                                  tolerance module is specified and not yet built"
> sed -n '308p'     C73-GEOMETRY-...-TOLERANCE.md -> "E1 | hard | the declared tolerance module
>                                                  exists and is exported from packages/geometry-kernel"
> ls -la packages/geometry-kernel/src/tolerance.ts -> 10,389 B (Aug 13 20:41)
> ```
>
> **The inversion is intact and the file is on disk.** ⛔ **REG1 MUST NOT EDIT C84** — routed to the
> C84 lane, not applied.
>
> ⭐ **This row is ALSO a shape-D candidate, and nothing has asked the question.** C84 §4's own
> instrument for EI-11 is *a sentence read out of C73*. There is no planted control anywhere in
> this chain: nothing would have gone red when C73 §5.1 E1 was corrected and C84 was not — and
> nothing did. **NOT RE-MEASURED on the shape-D axis.**
>
> *(Prior verdict, kept: **STANDS — UNAMENDED**, re-measured 2026-08-19, lane RG1.)*
>
> `C84:541-542` still reads *"C73 §5.1 **E1** records that the canonical tolerance module is
> **specified and not yet built**"*. `C73:308` still reads *"**E1** | hard | the declared tolerance
> module **exists and is exported** from `packages/geometry-kernel`"*.
> `ls -la packages/geometry-kernel/src/tolerance.ts` -> **10,389 B**. The inversion is intact.
>
> The surviving half — the harness's `const TOL = 1e-4` cited at `C84:996` — is intact and is now
> **binding rather than aspirational**, because C73's front-matter excuse was struck by `2c141297`:
> `C73:7` now reads `~~Three gates are specified here and NOT YET BUILT~~`. **OWNER: C84 orchestrator lane.**

C84 `:542` states C73 §5.1 **E1** *"records that the canonical tolerance module is specified and not
yet built"*.

**E1 says the opposite.** C73 `:308` — *"**E1** | hard | the declared tolerance module **exists and
is exported** from `packages/geometry-kernel`"*.

And **C73 was corrected at 11:11 today; C84's mtime is 11:37** — the inversion was written
**26 minutes after** the correction landed.

`packages/geometry-kernel/src/tolerance.ts` exists (10,389 B, commits `3dba3557`/`07173cdf`/
`f580a721`, 2026-08-12/13), exported at `index.ts:22-34`.

**What still stands, and becomes binding rather than aspirational:** the harness's
`const TOL = 1e-4` (`:107`) is exactly the unnamed, unit-unqualified literal C73 §2.2/§2.3 forbid
and §5.1 **E2**'s ratchet counts. **There is no longer an "unbuilt module" excuse.**

---

## 4. ⛔ RANK 4 — C77 CALLS A GATE UNBUILT; IT IS FAILING MERGE

> ### **CLOSED by `c5446d9a`** — *"the contract called its own gate UNBUILT; the gate is RED and
> blocking merge"* — **and the gate itself re-measured 2026-08-19: still RED, same level.**
>
> `C77:27-28` now reads *"**BUILT, REGISTERED, and RED at `[3] RATCHET EXCEEDED`**"*, with §0.0
> carrying the derivation. The surviving `:240` *"UNBUILT at stamp time (2026-08-12)"* is the
> **dated** form and is correct — §11C already names that as the house model.
>
> ```
> npx tsx tools/ga-gate/check-secrets-register.ts     # RC=3  (2026-08-19)
>   -> [3] RATCHET EXCEEDED — 13 finding(s) against a declared level of 12
>   FINDING A x3 — PRYZM_PUBLISHER_TOKEN, SHARD, WORKER_CONCURRENCY: read, no declaration row
>   DRIFT — docs/04-reference/SECRETS-REGISTER.md is STALE
> ```
>
> **The CONTRACT defect is closed; the ENGINEERING defect is not.** Per
> `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)` that is still blocking. This register does not own it; it
> is named so it is not lost. [L-1134]
>
> > ### ⚠ **RE-MEASURED 2026-08-19 (second pass, lane REG1) — the LEVEL is unchanged and the
> > FINDINGS ARE DIFFERENT PEOPLE. Do not read 13/12 as "unchanged".**
> >
> > ```
> > npx tsx tools/ga-gate/check-secrets-register.ts   # RC=3  (2026-08-19, second pass)
> >   -> [3] RATCHET EXCEEDED — 13 finding(s) against a declared level of 12
> >   FINDING A — API_GATEWAY_PORT   (apps/api-gateway/src/index.ts:67, .../Dockerfile:62)
> >   FINDING A — BAKE_PORT          (apps/bake-worker/src/index.ts:183, .../Dockerfile:31)
> >   FINDING A — MARKETPLACE_PORT   (apps/marketplace-api/src/index.ts:38)
> >   FINDING A — NSHARDS            (.github/workflows/terrain-bake-all.yml:91)
> >   FINDING A — OTEL_RESOURCE_ATTRIBUTES (fly.toml:80)
> >   FINDING A — PNPM_HOME          (Dockerfile:53)
> >   DRIFT — docs/04-reference/SECRETS-REGISTER.md is STALE
> > ```
> >
> > The 2026-08-18 reading named **PRYZM_PUBLISHER_TOKEN, SHARD, WORKER_CONCURRENCY**. **None of
> > those three is in today's list.** The count held at 13 while the *membership* turned over —
> > which means *"13/12, unchanged, nobody fixed it"* was **the wrong reading of a right number**.
> > ⭐ **A ratchet total is not a ledger.** Two lanes can pay three findings and mint six, and the
> > total will sit still and report tranquillity. This is register §9's *"15 → 22 → 24"* lesson
> > with the count held constant instead of drifting — the same defect, harder to see.
> > **Do not quote a ratchet total without its membership.**

C77 `:26` / `:189` (and **propagated verbatim to README:148**):
*"`tools/ga-gate/check-secrets-register.ts` — **UNBUILT at stamp time (2026-08-12)**"*.

**Measured** — `npx tsx tools/ga-gate/check-secrets-register.ts` → **EXIT 3**:

> `FINDING A — WORKER_CONCURRENCY is READ (apps/bake-worker/Dockerfile:32) but has NO declaration row`
> `DRIFT — docs/04-reference/SECRETS-REGISTER.md is STALE`
> `→ [3] RATCHET EXCEEDED — 13 findings against a declared level of 12.`

Both the gate **and** the register exist. Per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)`, **exit 3 is
never absorbable.** A contract cannot describe as unbuilt a gate that is currently blocking merge.

**Every normative clause of C77 stands** — §1.2, §1.3, §2.2, §2.3, §2.4 are unchanged and correct.
**Only the build-status line is false.**

---

## 5. ~~RANK 5 — C84 §5 QUOTES A READING FROM A MISCONFIGURED GATE~~ ⛔ **REFUTED 2026-08-18 — DO NOT APPLY**

**This amendment is wrong, and applying it would have retracted CORRECT figures from C84 §5.**
Recorded here rather than deleted, because the way it was wrong is the more useful artefact.

**Re-measured 2026-08-18, twice — by lane AM1 and independently by the orchestrator:**

```
npx tsx tools/ga-gate/check-verb-liveness.ts > /tmp/vl.txt 2>&1; echo "VL_RC=$?" >> /tmp/vl.txt
  VL_RC=0        ✅ PASS
  register verbs        326
  PROVEN                7     (executed dispatch + executed read-back)
  UNPROVABLE-NO-STORE   109   (authoritative store absent from the composed runtime)
```

Exactly the figures C84 `:981` quotes. The gate is registered at `run-all.ts:215` and exits **0**.

**What actually happened:** the `MISCONFIGURED` exit 2 this amendment observed is a **vitest
fork-worker flake** on `tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts` — it
reproduces intermittently and did not reproduce on either re-run.

**The reasoning error is worth naming, because it is the inverse of the one the register exists to
punish.** `MISCONFIGURED` means *the question was not asked*. It is not a reading. Concluding from a
`MISCONFIGURED` exit that the figures are *"NOT REPRODUCIBLE"* is the **same class of mistake as
quoting counts from one** — in both cases a gate that established nothing is treated as if it had
established something. A gate that cannot run has not refuted its subject any more than it has
confirmed it.

Compounding it: this amendment was written from **a single sample**, which
§EXIT-CODE-THROUGH-A-PIPE's sibling rule already forbids for deploy verdicts (*"a single sample is
not evidence"*) and which applies with equal force to a flaky gate.

⛔ **C84 §5's figures stand. C85–C99 may inherit them.** If `check-verb-liveness` exits 2 again,
**re-run it** — an exit 2 is a reason to ask the question again, never a reason to answer it.

---

## 6. ⛔ RANK 6 — C32: DXF **AND DWG** SHIPPED ELSEWHERE; THE CONTRACT ORDERS BOTH BUILT

> ### **CLOSED** — banner verified at HEAD 2026-08-19: `C32:299` *"SUPERSEDED IN PART — 2026-08-18,
> by measurement. READ BEFORE §3.1–§3.5 AND §7"*, with the DWG-licence ruling at `C32:316`.
>
> **RESIDUAL — NEW, and it is §11C's own shape: the banner did not reach the FRONT MATTER.**
> `C32:8` still reads *"Effort estimate: ~2 sprint-weeks (DXF) + **~3 sprint-weeks (DWG via ODA
> Teigha or LibreDWG)**"* — a procurement instruction against a decision already taken differently
> (Autodesk Platform Services, `server.js:2676`). **This is verbatim the failure §11C recorded for
> C73 line 7: the first thing a reader sees still carries the falsehood.** **OWNER: C32, unclaimed.** [L-1132]

C32 §7 calls `plugins/dxf/` a scaffold *"contributing nothing"*. **True** (5 `.ts` files). **The
conclusion is false** — the subsystem shipped in **`packages/file-format`**, a package C32 never
names: `DxfParser.ts`, `DxfGeometryBuilder.ts`, `import/dxf/DwgImportAdapter.ts`,
`DxfLayerStore.ts`, plus `DxfOverlayStore.ts` / `DxfPlanViewProjector.ts` / `DxfToBimTracer.ts`
which the contract does not mention at all. Public API at `index.ts:80-83`; dependency
`dxf@^5.3.1`.

⛔ **The DWG licence decision is already made, and differently.** C32 prescribes an
ODA-Teigha-vs-LibreDWG tier split. Shipped: `POST /api/import/dwg` → **Autodesk Platform Services**
(`server.js:2676`, `:2682-2686`). **Neither ODA nor LibreDWG is a dependency. Do not procure a DWG
licence against this contract.**

⚠ Also exposes a **code** defect: `DxfParser.ts` and `DxfGeometryBuilder.ts` exist **twice**.

**STATUS: ✅ BANNER APPLIED.**

---

## 7. ⛔ RANK 7 — C25: THREE IFC PHASES ORDERED AGAINST DELIVERED CODE

> ### **CLOSED** — banner verified at HEAD 2026-08-19: `C25:35`, *"CORRECTED 2026-08-18, by
> measurement"*, striking the IfcSite / IfcSpace / IfcZone sentence. The body's other claims were
> **NOT RE-MEASURED** today; the amendment this row asked for is applied.

C25 §2:35 — *"IfcSite is empty; IfcSpace is absent; IfcZone is absent. These are the master plan
IFC-α-1/α-2/α-3 gap-fill phases."* **All three false**: `hierarchy.ts:283,318` emits `IFCSITE` with
full attributes; `exporters/space.ts` and `exporters/zone.ts` both exist **with tests**.

**STATUS: ✅ BANNER APPLIED.**

---

## 8. ⛔ RANK 8 — C27: DELETE A LIVE COMPONENT FOR A REPLACEMENT THAT DOES NOT EXIST

> ### **CLOSED by `eaaa51dc`** — verified at HEAD 2026-08-19, and the dangerous half is
> **structurally disarmed**, not merely annotated:
>
> - `C27:14` — §0.0 correction banner.
> - `C27:218` Phase γ and `C27:219` Phase δ now both read **SUSPENDED**. **The delete order no longer
>   stands.** That is the outcome this row existed to force.
> - `C27:9` and `C27:214` — *"(~~80 files~~ — **RETRACTED**, the real figure is 14)"*.
>
> Re-measured: `grep -rn 'ElementInstanceDashboard' --include=*.ts --include=*.tsx apps packages
> plugins | wc -l` -> **0**. The replacement still does not exist; **the contract now says so.**

C27 §9 Phases γ/δ order `PropertyInspector` deprecated then **deleted**, in favour of
`ElementInstanceDashboard`.

- **`ElementInstanceDashboard` — ZERO occurrences repo-wide.** `apps/editor/src/ui/inspect/dashboards/`
  does not exist. **None of C27 §6's seven dashboards was built.**
- `PropertyInspector` is **live on three of C84 §3.5.1's four axes** — imports 3 live submodules;
  named in `apps/editor/migrations/sunset-pryzm1.json:50` (**build-graph axis — no import census
  sees this**); mirrored by `PropertyPanelAdapter.ts:5,60,68` (**call axis**).
- ⚠ **"(80 files)" is wrong by ~6×** — measured **13** + `PropertyInspector.ts` = **14**. The
  migration was sized against a number six times the real one.

**And C27 has substantially SHIPPED while labelling its files "(NEW)"**: `InspectSelectionStore`,
`IsolationStateStore`, `IsolationIntent`, `IsolationAnimator` (with tests),
`packages/schemas/src/inspect/`, and a live `ModelTree.ts:108`. Genuinely absent:
`SpatialRelationshipResolver`, `InspectBridge`.

---

## 9. ⛔ RANK 9 — SYSTEMIC: 15 CONTRACTS EXTEND A GATE THAT NEVER EXISTED

> ### **CLOSED by `34821d57`** — **and the number in this row's own heading was wrong TWICE.**
>
> This row says **15**. `34821d57` says **22**. Measured 2026-08-19:
> `grep -rln 'PHANTOM-GATE\|GATE-ALIAS' docs/02-decisions/contracts/ | wc -l` -> **24**
> (C10, C24, C24.1, C26, C27, C31, C32–C49). **15 -> 22 -> 24 is itself the finding**, not a
> bookkeeping nit: the row was sized from a sample and the sweep found half again as many.
> *An honest blank invites measurement; a confident count forecloses it.*
>
> **Residual, which the banner sweep does not cover:**
>
> ```
> for f in $(grep -rl 'ci-check-spans\|ga-gate/check-spans' docs/02-decisions/contracts/); do
>   grep -q 'PHANTOM-GATE' "$f" || echo "NO-BANNER: $f"; done
>   -> C01-ARCHITECTURE-AND-GOVERNANCE.md · C23-PROVENANCE-AND-AI-AUDIT.md · (this register)
> ```
>
> - **C23 — actually addressed**, by a different instrument: `C23:13` §0.0 plus the strike at
>   `C23:184` (*"RETRACTED … a NEW GATE IS OWED"*). It carries no `†PHANTOM-GATE` header, which is
>   why a name-keyed sweep misses it. **A sweep that classifies by BANNER NAME can be defeated by
>   using a different banner** — the same name-blindness CLAUDE.md records for the three rival
>   `commandManager` counters.
> - **C01 — STANDS, UNAMENDED.** See §11B. `C01:22` and `C01:201` still assert P8
>   **"PASSING (245 ≥ floor 213)"**, and `C01:160` still names `ci-check-spans.ts` as the P8 gate.
>
> **THIS ROW'S OWN DESCRIPTION OF THE REAL GATE IS SUPERSEDED.** It says *"`check-otel-spans.ts` …
> counts handler FILES (255/256) against a `HARD_FLOOR` of 213"*. **There is no single `HARD_FLOOR`
> reading.** Measured 2026-08-19, `npx tsx tools/ga-gate/check-otel-spans.ts` -> **RC=3**, three zones:
>
> ```
> ZONE A (CommandBus handlers, zero tolerance)          256 / 256 instrumented (294 read, 38 excluded)
> ZONE B (command-registry + app handlers + barrels)     54 uninstrumented of 70 (baseline 52)  <- THE FAILURE
> ZONE C §CENSUS (NOT GATED)                           1788 / 2040 files with an exported fn have NO span
> FAIL (Zone B):  packages/command-registry/src/generic/UpdateElementParameterCommand.ts
>                 packages/command-registry/src/lighting/lightingAuthoredParams.ts
> ```
>
> **So *"every new exported function MUST add >=1 span"* is measured for ZERO of the 2040.**
> Extending this gate is not a one-line change — that half of the row **STANDS, and is stronger than
> written.** (CLAUDE.md's P8 bullet quotes 246/246 and 1772/2023; both moved. Read the gate.)
>
> > ### ⚠ **RE-MEASURED 2026-08-19 (second pass, lane REG1). EVERY FIGURE IN THE BLOCK ABOVE MOVED
> > WITHIN HOURS. This is the strongest argument in the file for citing a gate instead of a number.**
> >
> > ```
> > npx tsx tools/ga-gate/check-otel-spans.ts      # RC=3  (2026-08-19, second pass)
> > ZONE A  256 / 256 instrumented (294 read, 38 excluded)          <- unchanged
> > ZONE B  55 uninstrumented of 71  (baseline 52)                  <- was 54 of 70
> > ZONE C  1818 of 2071 files with an exported fn have NO span     <- was 1788 of 2040
> >         (4829 source files read)
> > FAIL (Zone B): 3 NEW files outside the baseline
> >   ✗ packages/command-registry/src/generic/UpdateElementParameterCommand.ts
> >   ✗ packages/command-registry/src/handrails/CreateHandrailRunOnSlabCommand.ts   <- NEW TODAY
> >   ✗ packages/command-registry/src/lighting/lightingAuthoredParams.ts
> > ```
> >
> > **Three readings of one gate now exist in the repository and no two agree**: CLAUDE.md §P8 says
> > 246/246 and 1772/2023; this row says 256/256, 54/70 and 1788/2040; the gate says 256/256,
> > **55/71** and **1818/2071**. All three were "measured". **Only the last one was measured
> > today.**
> >
> > ⭐ **The third Zone-B failure is NEW and it arrived from a LIVE LANE** —
> > `CreateHandrailRunOnSlabCommand.ts` is C95 handrail work landing while this register was being
> > re-measured. **Named, not absorbed:** the baseline is shrink-only, so the correct disposition is
> > one OTel span in that file, **not** a baseline of 53. Routed to the C95 lane. [L-1223]

`scripts/ci-check-spans.ts` and `tools/ga-gate/check-spans.ts` — **both ABSENT**. CLAUDE.md already
records that the four `scripts/ci-check-*.ts` paths *"never existed, see L-812"*, and **C10:158 was
already amended** to redirect to the real gate. **The correction never propagated.**

Still standing: **C23:116** (worst — concludes *"no new gate"*, so P8 coverage for the entire AI
audit trail is declared satisfied by a file that never existed), C31:168, C33:404, C34:502,
C35:460, C36:494, and C38–C49 (twelve more).

**The real gate is `tools/ga-gate/check-otel-spans.ts`** — and it counts **handler FILES**
(255/256) against a `HARD_FLOOR` of 213, *not* "every exported function". Extending it is not a
one-line change.

**Four more aliases pointing at real gates under wrong names** — *do not build a second copy*:

| Cited | Real | Citing |
|---|---|---|
| `check-schema-purity.ts` | **`check-domain-purity.ts`** | C24:183, C26:169, C34:500 |
| `check-direct-store-writes.ts` | **`check-no-direct-store-writes.ts`** | C24:185, C24.1:99, C34:501 |
| `check-three-import-boundary.ts` | **`check-three-imports.ts`** | C32:217, C32:468 |
| `check-commandmanager.ts` | **`check-no-commandmanager.ts`** + `check-commandmanager-any.ts` | C32:211,469 · C37:49,358 |

---

## 10. ⛔ RANK 10 — C47 vs C05: A VERSIONING SCHEME THE FORMAT DOES NOT USE

> ### **CLOSED by `36a4b556`** — **and the closure REFUTED a sentence of this row.**
>
> Verified at HEAD: `C47:15` §0.0 (*"§1.1 MANDATES A VERSIONING SCHEME THE SHIPPED FORMAT DOES NOT
> USE — AND C05 GOVERNS"*); `C47:80` and `C47:88` now carry **PROPOSAL ONLY — C05 GOVERNS. Do not
> implement.**; `C05:273` strikes `projects.user_id` -> **`owner_id`**, citing C05 §1.3.1 against itself.
>
> **REFUTED:** this row asserted *"the **only** `formatVersion` in the repo is on the family-pack
> schema"*. `C47:23` measured otherwise — the `.pryzm` manifest carries one too,
> `packages/persistence-client/src/manifest.ts:109`, as **`z.literal('pryzm-v1')`: an opaque STRING
> TAG**, neither SemVer nor an integer. The **conclusion survives unchanged** (the shipped format is
> not SemVer; C05 governs); **the supporting fact was wrong, and the fix is what found it.** Recorded
> per C84 §6 rather than quietly edited — **this register is not exempt from its own rule.**

C47 §1.1 mandates `formatVersion: SemVer`. **The shipped format uses a monotonic INTEGER named
`schemaVersion`**: `manifest.ts:105` (`z.literal(1)`), `PryzmArchive.ts:25,103,135`,
`ProjectSerializer.ts:113,1098,1272` + `MigrationEngine.getStoredVersion()`. The **only**
`formatVersion` in the repo is on the family-pack schema, and it is `z.literal('1.0')` — not SemVer.

**C05 owns the `.pryzm` envelope** and the shipped code implements its model. C47 legislated a rival
scheme without superseding it. **Until an ADR reconciles them, C05 governs and C47 §1.1/§1.2/§2 are
a PROPOSAL.** C47's *policies* — the 12-month deprecation window, migration-chain irreversibility,
writer-vs-feature version — all stand and have a real substrate in `MigrationEngine`.

---

## 11. OTHER MEASURED DEFECTS

| Contract | Defect | Measured |
|---|---|---|
| **C04 §3.5.2** | *"`setViewDistance` called every frame"* | **ZERO callers** — 3 occurrences, all in its own file. LOD tier is constant for the session. ✅ **APPLIED** |
| **C14 LP-09** | orders `legacy-shim` deleted, *"zero importers"* ×4 | 4 live non-import refs incl. a workspace dependency and the exclusion path of the **P3 gate, which is RED**. ✅ **APPLIED** |
| **C73 §0.1, §5** | 3 gates *"SPECIFIED, NOT BUILT"*; *"no epsilon"* | all 3 exist; 2 read this session, one at **exit 3**. ✅ **APPLIED** |
| **C03 §4.3** | *"No `affectedStores`/patch metadata"* on Path A | `types.ts:605` declares it **non-optionally**; L-947 is an instance. ✅ **APPLIED** |
| **C79 §6** | proposes extending `WallRegionDetector` | **file deleted 2026-08-12**, citing C79 §6.5 as its authority — the exit condition is discharged |
| **C83 §0.2.1** | *"`clearGraphAuthoritative` has 0 production callers"* | **FALSE** — `RoomTopologyObserver.ts:351` calls it, added citing C83's own finding. ⚠ **C72 §4 carries the same claim** |
| **C84 §4B** | *"four families"* lose audit-neutrality | **EIGHT** — the source comment ends in an ellipsis that was dropped. Owner is **ADR-0319 §2**, and **C75 §2.9 forbids citing C75** |
| **C84 EI-7d** | 9 named holes; §4 says 11 | **12 of 26** `StoreKey` members. And `affectedStores` is typed `string`, not `StoreKey` — a second, disjoint hole set |
| **C84 EI-1a** | *"24 keys"* | **38 key spellings** → 21 `window.*` globals |
| **C84 EI-7e** | *"single highest-value open question"* | **SETTLED** — 14 authored room fields survive re-detect (Jaccard on `boundingWallIds`). Residual is the audit envelope only |
| **C21** | *"No EPW reader. No NOAA reader. No ClimateStore"* | **3 of 4 false**; `runtime.climate` has 0 hits; status stated **three ways** |
| **C22** | DB columns/tables asserted present | `pryzm_users` has 10 columns, none of them these; **no `audit_log` table**; `pii-registry.ts` MISSING |
| **C23 §1.1** | central invariant | `packages/ai-host/src/**` has **zero** provenance calls — **AI calls are not audited**. Rival vocabulary vs CANONICAL **C75**, zero cross-citation |
| **C43 §57** | 4 marketing pages | **3 no longer exist** (C51 apex split); only `404.astro` remains |
| **C50** | `.tsx` component paths | `apps/editor/src/` contains **1 `.tsx` file total** — this is a vanilla-TS DOM codebase |
| **C36 :495** | *"`check-visibility-intent.ts` already exists"* | it does not |

---

## 11B. C01–C20 — **14 of 16 audited carry factual falsehoods**

⛔ **C01 §1 is FALSE on three P-gates — and I propagated one of them into an amendment TODAY.**

| | C01 says | Measured at HEAD | Exit |
|---|---|---|---|
| **P3** | *"FAILING: 5 owner files, target 1"* (twice) | `[raf-tripwire] OK: 1 owner` + **4 comment-only mentions** | **0 — PASSES** |
| **P4** | *"FAILING: 20 strict / 215 repo-wide"* | `OK: 3 = baseline`; repo-wide 100/100 | **0 — PASSES** |
| **P8** | *"PASSING (245 ≥ floor 213)"* | **FAIL (Zone B)** — 1 new uninstrumented file | **FAILS** |

⭐ **The P3 "5" is 1 owner + 4 COMMENT lines**, three of which are doc comments *asserting P3
compliance*. `gate-debt.json` recorded this on **2026-08-10** (`§RAF-GATE-COMMENT-BLIND` — *"the
gate was counting sentences"*). C01 is dated Aug 9 and never got the memo. **CLAUDE.md's P4 bullet
is stale in the opposite direction** — it claims RED/exit 3 where the gate exits 0.
**STATUS: ✅ my C14 banner corrected in place.**

| Contract | Verdict | Headline |
|---|---|---|
| **C02** | FALSE | §3.2/§3.3 mandate `getCommandManagerBridge()` — **zero production files**, and two tests *forbid* it. §1.1's `ComposeRuntimeInput` does not exist, so §5's own example cannot compile |
| **C03** | FALSE | §6.3 documents **two** live `level.add` handlers; the second was **deleted because two existed** (`§FIX-LEVEL-ADD-SHADOW`). §3.1 says stores are **Zustand** — the manifest declares **Immer, no zustand**; **6 of 8** slice names have zero definitions. Every source anchor in §4.2/§4.5/§4.6 has drifted |
| **C04** | FALSE | §1.1 cites `eslint-plugin-boundaries` as the P2 gate — L-809 already recorded it checks nothing. §4 attributes the render loop to `render-runtime`, whose **own manifest deprecates it for zero importers**; the real loop is `UnifiedFrameLoop.ts:284` at `pre-render`. §1.3's `CameraHandle` occurs **exactly once in the repo: on C04's own line 28** |
| **C05** | FALSE | §2.1's ZIP layout matches **nothing**; §6 mandates `projects.user_id`, the column is `owner_id` — and §1.3.1 of the same contract says so |
| **C06** | FALSE | `runtime.tools.register(tool)` doesn't exist; `KeyboardShortcutRegistry` — **zero files** |
| **C07** | FALSE | `NetworkProxy` doesn't exist; all six proxy names wrong; the §3.1 permission vocabulary is fictional against the **v1-LOCKED** enum. §5's *"target 0 ✅ achieved"* measures **172** |
| **C08** | FALSE | every rate-limit number wrong (`globalLimiter` **2000** not 200); `trust proxy 1` would **re-introduce IP collapse**; remote-factory gap is 164 and **grew 14 in eleven days** |
| **C09** | FALSE | §4.2 cites a P7 gate file that does not exist; the real gate tolerates 40 violations |
| **C10** | CONTRADICTORY | §2.3 states a gate as live fact that §4 of the same file says never existed. ⭐ Also **falsifies CLAUDE.md**: `check-conflict-surfacing.ts` exists, so *"the conflict-surfacing half has no gate"* is wrong |
| **C11** | FALSE | §11's normative matrix says handrail/furniture/lighting have **"❌ No bridge"** — all three shipped (`initTools.ts:1919/2031/1967`), and §11.9/§11.11/§11.19 of the same contract say so. §11.1 carries an **OPEN work order to build one that exists**. §7.2's *"no OTel span, plugin-sdk exposes no tracer"* → `withHandlerSpan` is used in **254 files** |
| **C15** | FALSE | §13 certifies a hardening fix that was **removed**; §9's four mandated span attributes have **zero occurrences**; §6 names `OpeningsChildrenMismatchError` — zero occurrences, so a `catch` on it is dead code |
| **C16** | FALSE | §11.1 says CA-21 *"NOT ENFORCED"* and G-CA-A4 unbuilt — `check-verb-liveness.ts` exists, is registered, and **quotes that very row as its reason for existing**. §12 records `roof.update` as a live P0 — the register reads it **LIVE**; the five move verbs read **REFUSES**. Its own top authority (`01-VISION.md`, `02-ARCHITECTURE.md`) — **neither file exists** |
| **C12** | STALE + CONTRADICTORY | ⛔ §9's L-631 row carries a **standing order not to enable terrain** — the founder decision was **taken and shipped**, and the code says so verbatim at `CesiumViewport.ts:7180-7185`. An engineer obeying C12 literally would **re-revert terrain for every city** |
| **C13** | STALE (core CLEAN) | §7.2's mandated E2E fires the switch on `window.dispatchEvent` — the channel §3.9 of the same contract declares a **silent no-op and PROHIBITED**. The acceptance test for the whole teardown cannot trigger it |
| **C14** | FALSE | LP-06 orders `storeEventBus` stripped from `command-registry` — **C13 §3.12 mandates it there**; doing so re-ships L-713. §6A declares 3 measurably RED gates *"✅ Passing"* and enumerates 15 of **82**. `global-bridge.ts` and `CommandManager.ts` — **neither exists anywhere** |
| **C17** | STALE (framing) | headed *"before implementation"*; `batchCatalogue.ts` shipped, 634 lines, and cites C17 back |
| **C18** | **CLEAN** | palette, paths and `PREVIEW_CSS` all verified |

---

## 11C. C51–C75 — the BIM 3.0 suite shares ONE authoring defect

**Eleven gates across C71/C72/C73 are described as unbuilt. All eleven exist. Four are at exit 3.**

| Contract | Claim | Measured |
|---|---|---|
| **C72** §6.2/§6.3 | *"SPECIFIED, NOT BUILT"* ×2 | both exist; `check-suppression-is-reversible` **exit 3 at 84/41 — double its ledger** |
| **C71** §6 | *"none of the three exists at HEAD"* | all 3 exist; `check-graph-write-coverage` **exit 3**. **§5 has been citing their output since the day §6 was written** |
| **C73** line 7 | *"three gates NOT YET BUILT"* | ⚠ **today's §5 banner did not reach the FRONT MATTER** — the first thing a reader sees still carries the falsehood |

⛔ **C71 §5.2's `contains` claim is INVERTED.** It says *"`contains` is read-only… a first-party
writer is a named Tier-2 gap."* Measured: the **writer exists**
(`CreateFurnitureCommand.ts:249`); the gate's unledgered exit-3 finding is the **opposite** —
*"REQUIRED family 'contains' has NO typed production reader — write-only state nobody can query."*
**The contract sends an engineer to build the half that exists while the failing half goes
unnamed.**

⭐ **C74 and C75 are the house model and the fix to copy suite-wide:** they wrote
*"UNBUILT **at stamp time (2026-08-12)**, stated explicitly so absence is never inferred from
omission."* **A dated historical claim cannot rot into a falsehood.** C71/C72/C73 wrote the present
tense and all three became false.

> **THE AMENDMENT TO PROPOSE ACROSS THE ENTIRE SUITE: never write a build status in the present
> tense. Write it dated, or cite the gate.**

**Also:** C73 §3.1 orders predicate work *"in the order their measured duplication argues for"* and
puts **point-in-polygon first — that family is at 0 and finished**. The real open families are
polygon-area/winding (73 rivals) and segment/segment (11). An engineer following §3.1 opens a
closed family. And **C73 §2.2 vs §5.1 E2 needs a DECISION, not a banner**: the one finding driving
`check-epsilon-policy` to exit 3 is a site that does **exactly what §2.2 demands**
(`const PLANAR_EPS_M = COINCIDENT_M;`) and E2 counts it as a rival declaration.

**VERIFIED CLEAN:** **C66** — every falsifiable claim held, and CLAUDE.md's warning is satisfied
(§1 still marks all tiers CLAIMED). **C69** — the best-authored contract in its range; §0.1's
*"no number in the body"* discipline is honoured throughout. **C72 vs C03 §4** — `prevState` and
the undo-restore set **are** genuinely different concepts; C72 does not duplicate C03
(`grep -c affectedStores` → 0).

---

## 12. COVERAGE HONESTY — what was NOT measured

> ### ⭐ **UPDATED 2026-08-19 (second pass, lane REG1) — the two hand-measured axes below are now
> MACHINE-measured, and a THIRD axis is named as entirely unmeasured.**
>
> **AXIS 1 + 2 — cited paths. NO LONGER A LANE'S JOB.**
> `npx tsx tools/ga-gate/check-contract-cited-paths.ts` → **RC=0**, and it covers **seven repo
> roots across all 100 contracts**, not two axes across one range: **1527 distinct citations · 1028
> resolve · 491 UNRESOLVED · 8 exempt.** The by-hand figures below (**99 → 2** and **43 → 21**)
> are *retained unedited* as the historical reading; **the gate supersedes them and is the only
> thing that should ever be quoted.**
>
> **AXIS 3 — SHAPE D, and it is NOT MEASURED for a single row in this file.** §0's new shape-D
> table records four instruments in this repository that ran, passed, and could not have failed.
> **No row below has been asked whether its instrument could have come back red.** That is not a
> gap in this register's coverage — it is a **named finding** about every ✅ in it. The two gates
> landed today are the only instruments in this document that carry planted controls executed
> inside every run. [L-1222]
>
> **AXIS 4 — LINE ANCHORS. NOT MEASURED, and now known to rot in under 24 hours.** §2 records C96
> §3.1's `ProjectSerializer.ts:1025-1031` moving to `:1138–1143` in **one day**. The cited-path
> gate strips line numbers before resolving and **does not check them**. Nothing does.

**Two axes were measured exhaustively across C21–C50:** every cited gate path (**99 distinct → 2
exist**) and every cited `packages/*` path (**43 distinct → 21 exist**).

**Deep-read:** C21–C25, C27, C29, C32, C33, C36, C39, C43, C47, C50, C73, C77, C79, C83, C84, and
C01–C20 in the first sweep.

⚠ **Body NOT MEASURED** (gate/package axis only): C24.1, C26, C28, C30, C31, C34, C35, C37, C38,
C40, C41, C42, C44, C45, C46, C48, C49 — and **C80, C81, C82**, which received a
falsehood-pattern sweep plus spot checks, not a line-by-line audit.

~~**C78 (944 lines) against C71/C72 is the highest-value unstaffed read.**~~ **PARTIALLY MEASURED
2026-08-18 (lane AD1). C78 does NOT carry the C21–C50 disease, and its §20 is a model of the
opposite** — but it carried a different one, and §17 was live-wrong.

- **Gate axis — CLEAN, and this is the notable result.** All 16 gate names C78 cites were tested:
  `grep -oE '(tools/ga-gate/[A-Za-z0-9._-]+\.ts|check-[a-z0-9-]+)' C78-*.md | sort -u`, each
  resolved with `find tools scripts -name "<name>*"`. **13 of 16 exist**; the other 3
  (`check-consequence-refusal-typing`, `check-planner-registry-generic`, `check-observer-bypass`)
  are **declared NAMED GAPS by §20.1's own preamble**, which is the honest form. Registration was
  read from the authority rather than by grep — `npx tsx
  tools/rac-conformance/certification/gates/check-gate-residency.ts` → **exit 0**, *"registry
  entries parsed … 103 · unresolvable: 0"*, with all 13 showing `✓file ✓reg ✓verdict`. **§13's
  "97 of 99 cited gates do not exist" does not extend to C78.** (My own first pass concluded five
  of these were unregistered; it was grepping `certify.ts` for quoted paths and missing its
  bare-name `const gates = [...]` array at `:464`. Running the residency gate corrected it —
  recorded because the wrong instrument produced a confident wrong answer.)
- **Path axis — ONE real defect, and it is §13's shape (b).** Of the 4 fully-qualified source paths
  C78 cites, 3 exist; **`packages/geometry-roof/src/WallRegionDetector.ts` does not exist anywhere
  in the tree** (`find . -name 'WallRegionDetector.ts' -not -path '*/node_modules/*'` → empty). It
  was **deleted 2026-08-12** on this suite's own authority — tombstone at
  `packages/geometry-roof/src/index.ts:60-78`, citing C79 §6.5. **C78 §17.2 and §17.3 cite it at
  four line numbers as the live roof region path**, and §17.2's premise (*"Roof uses a different
  detector"*) is false at HEAD: `RoofTool.ts:293` runs roof-by-region on the SAME shared tracer as
  slab, with attribution returned. The user-visible conclusion survives — a roof still does not
  follow a moved wall — but the cause moved from TRACING to **STORAGE** (`RoofData.footprint` has
  no reference-capable field; the L0 `Roof.boundary` is `Vec3[]` and Zod strips a reference before
  it can transit the bus). Both rows amended in place with the surviving half re-aimed, rather than
  deleted, so the MUST keeps binding and nobody is sent to retire a file that is already gone.
- ⚠ **STILL NOT MEASURED for C78:** the §0 eight-failure census, §8.1's consolidated union, the
  §19.3 living record, and the specific question this row was minted to ask — **whether C78
  restates rules C71/C72 own.** Its bare-filename citations (34 distinct, e.g.
  `ConsequenceExecutionService.ts`, `confirmationPolicy.ts`) were also not existence-tested; the
  sweep covered fully-qualified paths only.

---

## 13. THE PATTERN, STATED ONCE

C21–C50 were bulk-stamped 2026-08-09 as **forward-looking specifications written in normative
present tense**. That misleads in **both directions at once**:

- Where the feature **never shipped**, the contract reads as describing running enforcement.
  **97 of 99 cited gates do not exist.** An engineer citing *"per C41 §6, `check-event-no-rename`
  blocks this"* is citing nothing.
- Where the feature **did ship**, it shipped **somewhere else** — and the contract still orders it
  built. That is the C84 EI-10 defect, **minted by prose rather than by a coder**.

**Neither shape is visible from inside the contract. Both are one `ls` away.**

---

## 14. WHAT CHANGED 2026-08-19 (second pass, lane REG1) — and what the day's evidence adds

**The `ls` in §13's last line is now a gate, run on every CI invocation.** That was the point of
this lane, and it is done: `check-contract-cited-paths.ts` (L-960) and
`check-contract-index-equivalence.ts` (L-1221), both green at pinned shrink-only baselines, both
carrying floors and planted controls, both ledgered in `gate-newly-measured.json` per C76 §6.3.

**Four things the day measured that no row previously said:**

1. ⭐ **The estimate was low by 4×** — §0 said *"119+"*; the gate says **491**. Recorded as evidence
   for §9's own lesson (*15 → 22 → 24*): a confident count forecloses the measurement.
2. ⭐ **A ratchet TOTAL is not a ledger** (§4). `check-secrets-register` read **13/12** on both
   2026-08-18 and 2026-08-19 — with **zero names in common**. Six findings were minted while three
   were paid, and the total sat still and reported tranquillity.
3. ⭐ **Shape D** (§0) — *the check that runs, passes, and could never have failed.* Four measured
   instances in this repository, one of them **produced and caught inside this lane**. It is the
   only shape in the table that measurement cannot find, because measuring it returns PASS.
4. ⚠ **The count/range shape recurred a SIXTH time while being corrected for the FIFTH.** ADR
   **268 → 272** and SPEC **96 → 97** in one day. **Deliberately not patched** — both rows carry a
   date and a derivation command, which is the correct form. Patching the digits restarts the cycle.

**Routed, NOT applied — a live lane owns each of these and REG1 must not collide:**

| Row | Owner lane | What is owed |
|---|---|---|
| **§2** RANK 2 — C84 severity-1 `lighting` EI-6 "NEVER" | **C84 element-integrity** | retract §4 row + severity row 1, cite C96 §3.1; re-anchor C96's line numbers |
| **§3** RANK 3 — C84 EI-11 inverts C73 §5.1 E1 | **C84 element-integrity** | strike `:541-542`; `tolerance.ts` is 10,389 B on disk |
| **§9** Zone B — `CreateHandrailRunOnSlabCommand.ts` | **C95 handrail** | one OTel span. ⛔ **Not** a baseline of 53 |

**Unclaimed and now the highest-value unstaffed edit in this file:** the **eighteen missing index
rows** (§1 arm A) — C81, C84, C85–C99, C100. They are ordered by nothing until someone writes them,
and the gate will ratchet down the moment they land.
