# APPLY ORDER — Phase 4b proposed patches

**PROPOSED, NOT APPLIED (D9).** Audit `audit/element-creation/2026-08-29` · HEAD `064a838e` ·
branch `main` · order verified **2026-08-30**.

Nothing in this directory has been applied. The repository working tree was clean before and
after this verification (`git status --porcelain` → empty).

## The order is load-bearing — three patches edit the same table

```bash
git apply audit/element-creation/2026-08-29/proposed-patches/p01-C11-section11-matrix.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p02-C11-section7.2-otel.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p03-C01-section3-package-census.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p04-C01-section4-booleans.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p07-C01-P3-rows.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p05-C01-section5-gate-inventory.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p06-CLAUDEmd-P4-bullet.diff
git apply audit/element-creation/2026-08-29/proposed-patches/p07-CLAUDEmd-P3-bullet.diff
# p08-ISSUE-LOG-rows.md is NOT a diff — it is a block of rows to append by hand.
```

**Measured result of exactly that sequence, run against `064a838e` and then reverted with
`git checkout --`: RC=0 for all eight, zero rejects, three files modified
(`CLAUDE.md`, `C01-…md`, `C11-…md`).**

| Constraint | Why |
|---|---|
| **p01 before p02** | Both edit `C11`. p01 shifts §7.2's line numbers by +11. |
| **p03 → p04 → p07-C01 → p05** | All four edit `C01`. p07-C01 owns the P3 rAF row **inside the §5 table that p05 rewrites**; p05 carries that row as unchanged context. Applying p05 before p07-C01 rejects. |
| p06 / p07-CLAUDEmd | `CLAUDE.md` only, independent of the rest. |

## ⛔ `git apply --check` IS NOT A VALID TEST OF THESE PATCHES — IT REPORTS TWO FALSE FAILURES

Measured 2026-08-30 against a clean `064a838e` (`git status --porcelain` empty, `md5sum CLAUDE.md`
unchanged before and after):

| Patch | `git apply --check` | `git apply` (real) |
|---|---|---|
| p05-C01-section5-gate-inventory.diff | **RC=1** *"patch failed: C01-…md:301"* | **RC=0** when its three predecessors have been applied |
| p06-CLAUDEmd-P4-bullet.diff | **RC=1** *"patch failed: CLAUDE.md:162"* | **RC=0** |
| the other six | RC=0 | RC=0 |

**Two independent causes, and neither is a defect in the patch:**

1. **`--check` does not chain.** It writes nothing, so each patch in a multi-patch invocation is
   validated against the *original* file rather than against its predecessor's result. p05's hunk
   header `@@ -301,20 +301,62 @@` is correct **for the post-p03/p04/p07-C01 file** — §5's table sits
   at line 225 in the pristine file and at 301 after the three preceding patches insert 76 lines
   above it. p05 carries the P3 rAF row (which p07-C01 rewrites) as *unchanged context*, so it
   cannot be validated before p07-C01 exists.

2. **`--check` skips the line-ending conversion that `git apply` performs.** `CLAUDE.md` and both
   contracts carry **mixed line endings** — `grep -c $'\r' CLAUDE.md` → **323** — and
   `.gitattributes:35` declares `*.md text eol=lf`. `git apply -v --check` prints its search block
   with the CRs visible (`… as a rule*.?`) and fails; the same patch applied for real succeeds.
   This is why p06 fails `--check` while modifying the file cleanly.

**Verify the way it will be used:** run the eight `git apply` commands above in order, confirm
`git status --porcelain` lists exactly `CLAUDE.md`, `C01-…md`, `C11-…md`, then either commit or
`git checkout -- CLAUDE.md docs/02-decisions/contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md
docs/02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md` to discard. **That is the exact
sequence this record is based on.**

## ⚠ Do NOT verify these in a bare copy of the files outside the repo

Copy the three `.md` files into a scratch `git init` directory and p06 / p07-CLAUDEmd fail with
*"patch does not apply"* even for a real `git apply` — the mixed line endings need the repo's own
`.gitattributes` and index state to normalise against. **The repo is the only valid test bed.**

## What changed on 2026-08-30, and why it is recorded rather than silently fixed

Three defects were found **in the patches themselves** and corrected. All three are the same
failure the patches exist to remove, which is why they are named here instead of edited away.

1. **p02 transcribed `253` instead of running the command.** The figure came out of C11 §0.0:48,
   not out of a shell. Re-run at HEAD: `grep -rIl "withHandlerSpan" --include=*.ts
   --exclude-dir=node_modules packages apps plugins | wc -l` → **293**. §0.0's own gate figures
   were stale too (Zone A 246/246 → **275/275**, Zone B 54 of 70 → **66 of 87**, Zone C
   1772 of 2023 → **2100 of 2399**). p02 now carries a **second hunk** correcting §0.0, so the two
   sections cannot print two readings of one fact (C84 EI-9).

2. **p01 and p08 said `curtainwall.create` "does not exist anywhere". It does.**
   `grep -rn "curtainwall.create" --include=*.ts apps packages plugins` →
   `plugins/curtain-wall/src/handlers/CreateCurtainWall.ts:51  readonly aliases =
   ['curtainwall.create']`, canonicalised to `curtain-wall.create`
   (`packages/command-bus/__tests__/command-aliases.test.ts:92`). It is a **registered bus alias**
   — a real, dispatchable identifier named at the wrong layer, not a phantom. **D2 exactly:**
   "no such verb" authorises deleting a live alias, and a command type is a wire identifier
   replayed out of `project_command_log`. `check-command-naming.ts`'s own remedy text prescribes
   that alias pattern. Its real curtain-wall finding is a **third** spelling — `curtainWall.changeLevel`
   (`ChangeCurtainWallLevel.ts:79`), which has no alias.

3. **Four acceptance criteria were self-defeating substring greps that can never print 0.**
   Each correction **quotes the text it retracts** — deliberately, so the next reader can tell a
   fixed defect from one that never existed — and a substring grep cannot distinguish an
   assertion from a quotation of a retracted assertion. Measured on the patched copy:

   | Patch | Criterion as first written | Post-patch reading | Replaced with |
   |---|---|---:|---|
   | p01 | `grep -n "No bridge" C11` → 0 | **4** | `grep -c '\| ❌ No bridge \|' C11` → 0 *(3 today)* |
   | p01 | `grep -c "curtainwall.create" C11` → 0 | **6** | the matrix-CELL form → 0 *(1 today)* |
   | p03 | `grep -c "54 packages, 12 apps, 46 plugins" C01` → 0 | **1** | `grep -cE '^\*\*54 packages, 12 apps, 46 plugins\.\*\*' C01` → 0 *(1 today)* |
   | p07-CLAUDEmd | `grep -rc "5 owner files" C01` → 0 | **2** | `grep -cE '[*][*]FAILING: 5 owner files' C01` → 0 *(2 today)* |

   **An acceptance criterion that cannot be satisfied is the same defect as a gate that cannot
   fail** (§1.2a: *"a gate without a subject floor cannot tell '0 violations' from 'walked
   nothing'"*). Every replacement above was run against the pristine file to confirm it prints a
   non-zero number **today**, and against each patch's added lines to confirm none of them
   re-introduces a match.

## §RATCHET-EXCEEDED-IS-NEVER-DEBT

No patch in this directory proposes raising a shrink-only ceiling or adding a `gate-debt.json`
entry. Seven gates exit 3 at HEAD; `run-all.ts:1162` sets `anyFailed = true` on code 3
unconditionally, so no ledger can absorb any of them. Every remediation names the subjects to fix.
