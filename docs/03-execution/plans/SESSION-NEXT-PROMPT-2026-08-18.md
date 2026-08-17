# NEXT SESSION PROMPT — written 2026-08-17, from scratch

Paste everything below as the first message of the next session.

---

You are continuing PRYZM (BIM SaaS, pnpm monorepo). Read `CLAUDE.md` first, then this.

## 0. How I want you to work — each rule below was broken at least once on 2026-08-17

- **MEASURE, never infer.** A stated premise lost to a measurement **six times** in one
  session — four of them were the agent's own premises, twice inside its own fix. Put an
  explicit refutation path in every brief you write and every claim you make.
- **§EXIT-CODE-THROUGH-A-PIPE.** Never read a verdict through `| tail` / `| head`. Capture as
  `CMD > out.txt 2>&1; echo "RC=$?" >> out.txt` and read the file. Misread **five times**;
  once the printed text said FAILED while the piped code said 0.
- **Root tsc needs `NODE_OPTIONS=--max-old-space-size=8192`.** The default heap aborts with
  **exit 134** (SIGABRT) — an OOM, not a type error, and it prints no diagnostics. Misread
  four times.
- **Exit 3 is never absorbable** (C70 §5.1). Fix the breach; never raise the threshold.
- ⭐ **Committed ≠ reachable — and the sharp version:** proving a fix at the layer that
  **computes** is worth nothing if the layer that **decides** keeps its own copy of the
  inputs. This shipped a broken fix to production **twice in one day**. Census every
  construction site of a value, not just the one your test drives.
- ⭐ **A refusing half and its escape hatch ship together, or neither ships.** A gate that
  can only say "no", whose "yes" branch is blocked on a pending decision, is a **regression
  with a contract citation attached** (C83 §10.6.7).
- ⭐ **A control that cannot fail is not a control.** Watch every new assertion go red first.
  One L-922 control written this session stayed GREEN with the safety check removed.
- **Never `git stash`** — the stack is global across worktrees and lanes are usually live.
  Agents commit scoped CODE by explicit path; the orchestrator owns docs. Never `git add -A`.
- **Architecturally sound, contract-mapped, no shortcuts.** Founder's standing instruction.

## 1. Production state

**`9bb11a4c` is LIVE on Fly** — bundle proof 6/6, deployed 2026-08-17. Preceded by
`c2e8ba00` (735 commits) and `6c676413`.

⚠ **Before any deploy read `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` §6.7.** The
bundle proof **failed a healthy deploy** that day and its own text says
`ROLL BACK NOW, DO NOT RETRY`. Interim rule: do not run it until the deploy script has
**exited**; on a SHA mismatch re-run after 60 s and poll `/version` several times.
**L-941 is the fix and it is HIGH** — it sits on the deploy path and its failure mode is a
destructive action taken on a false positive.

Deploy = `DOCKER_CONFIG="<windows-shaped-path>" bash tools/deploy/fly-manual-deploy.sh`,
no MSYS exports. ~25 min, uplink-dominated.

## 2. ⭐ FIRST THING — verify L-942 actually works in the browser

**L-942: every wall move that broke a junction was hard-blocked in production.** It shipped
broken **twice** before `9bb11a4c`. The founder had not yet confirmed the third attempt when
the session ended.

**Ask the founder, or check the console yourself.** The deciding line is:

```
[wallPlacementGate] ... cascade ok=true, incumbentBreach=true
```

Gone + neighbours follow ⇒ fixed. Still present ⇒ a **fourth** partner-construction site
exists and the census lane's report is where to look.

**What it is:** a MUTUAL corner (subject + exactly ONE partner, stored `junctionType 'L'` AND
`junctionDegree 2`) must have the partner FOLLOW — pivoting, welded endpoint to the analytic
intersection, **far endpoint untouched**, in BOTH directions. A `T`/degree-3, or ABSENT
metadata, must NOT follow (§10.6.3 #1, C70 L-INV-1). C83 §10.6 is FOUNDER-CONFIRMED.

**Why it shipped broken twice:** the discriminator is stored on the `joinedTo` edge and
`getJoinedWalls` was discarding it. Fix 1 threaded it through `WallMoveReweldService` and
proved it there — but a gesture goes through `wallPlacementGate` → `moveReweldPreflight`,
**which builds its own partner list**. Fixed at three call sites in `9bb11a4c`, **typechecked
and untested at the gate layer.**

**Three lanes were running at session end** (workflow `wzxiwzxrk`) — check whether they
landed: (a) a **gate-layer reachability test**, (b) a **census of every partner-construction
site**, (c) the stale measure-test rewrites + full gate. **Read their results before assuming
anything.**

## 3. Known-failing tests

**9 tests in two files**, all stale *defect-measurements*, not broken behaviour:
`L936InteriorLPairMove.measure.test.ts` and `L932AngledWallMove.measure.test.ts`. Their own
describe blocks say *"the partner is REACHED, **and then deliberately left behind**"*. They
measured the defect; the defect is gone.

⛔ **Do not flip numbers until green.** Derive the expected seat analytically, assert the far
endpoint byte-identical, and assert **the loop is still closed**. Watch each arm fail first by
forcing `isMutualCorner` to `return false` (that is pre-§10.6 behaviour exactly), then restore.

**Green and must stay green:** `wallMoveReweldSeam` 11/11 (holds §10.6.5's three controls incl.
the load-bearing L-922 `T`/3 control) · `hostedOpeningHostMoveSeam` 9/9 · geometry-wall 664/664
· root tsc RC=0.

⚠ `WallCreateJoinIntentCensus.measure` is **known-flaky** when another lane writes files
mid-scan — its own header says so. Re-run it alone before believing a failure.

## 4. The founder's PRYZM 3.0 spec — CAPTURED NOWHERE, AUDIT NOT DONE

On 2026-08-17 the founder issued an 8-section specification titled *"PRYZM 3.0 —
Architectural Topological and Parametric Wall Behaviour"*: perimeter behaviour, dependent
elements regenerating, interior walls/rooms, polylines, perimeter↔interior connection,
hierarchical dependency, intent-over-coordinates, and the core principle
**MOVE → PROPAGATE → RECOMPUTE**. **It exists only in that conversation — capture it to a doc.**

L-942's fix delivers the **wall-follow core** of §1, §3, §4, §5. **§2 — slabs, floor finishes,
ceilings, roof geometry and roof finishes regenerating when the perimeter changes — is the
suspected large gap and is UNAUDITED.** Audit **reachability, not existence**: this repo's
defect list is overwhelmingly wiring, so reading the code always looks better than running it.

## 5. Half 1 / Half 2 — generate, never quote

```bash
npx tsx tools/bim30-status/bim30-status.ts --fast
```

Built 2026-08-17 because the hand-stamped tracker rots. First reading at `c2e8ba00`:
**17/38 closed of rows MEASURED, 43 CARRIED, 5 exit-3 breaches** (GE-02, GE-03, GE-12, PV-01,
PV-03). ⭐ **The headline is the 43: more than half the register has no gate any runner can
execute.** The tracker's hand-stamped 53/79 measures a different thing; both are true.

⚠ `BIM30-MASTER-COMPLETION-TRACKER.md` **§5 is STALE** — it says 13 gates run in no runner,
captioned *"THIS OUTRANKS THE ENTIRE TABLE ABOVE IT"*. All 13 are registered. Rewrite or strike it.

**Half 2 (bar 3):** 4,100 cells (100 verbs × 41 relationships), ledger at 124 findings.
⭐ **honest-refusal cells = 0, and it is ONE seam:** `ConsequencePreviewService.ts:58` and
`:766` still return `ConsequencePlan | null`. `UndeterminedReason` (11 members) and
`PreviewOutcome` both EXIST and are unwired. **Wiring them is Half 1 sub-phase B.4 and it
unblocks a Half 2 pass condition across all 4,100 cells** — neither document names the
dependency, because each only sees its own side. Highest-leverage edit on the board.

## 6. Unowned rows

| Row | What |
|---|---|
| **L-941** | **HIGH** — bundle proof false-failure + `DO NOT RETRY`. Deploy path. |
| **L-940** | 6 tests RED on `main` (`elementIdsForRoom` → `determineElementIdsForRoom`). ⚠ A mechanical rename goes green while pinning the defect the rename abolished. Second half: `apps/editor/__tests__/**` is typechecked and run by **nothing**. |
| **L-939** | `captureThumbnail()` is a second render driver (off-rAF `render()`); P3's gate counts rAF call sites and cannot see it. |
| **L-937** | No `wall.create` replicates — a **contract** defect, not a call-site one. Sweep `syncDisposition.ts` whole. |
| **L-938** | `hostSnap` triplicated; fold into the C73 §2.2 epsilon drain (GE-01). |
| — | `check-deterministic-regeneration` exit 3, 3 findings in `WallCrossesOpening.ts`; MT-01 slab + room arms. |

## 7. Founder decisions open

1. **Half 2 denominator** — C78 §20 vs C71 §2.3, both CANONICAL. Needs an ADR.
2. **VisibilityIntent 3-D colour override vs a declared layer colour** — product call.
3. **`docs/03-execution/plans/` restructure** — 51 loose files. The founder asked for it; it
   was deferred because every move breaks inbound citations from `CLAUDE.md`, contracts, ADRs
   and gate scripts. **Any move must rewrite its inbound references in the same commit.**

*(C83 §10.6 is CONFIRMED — no longer open.)*
