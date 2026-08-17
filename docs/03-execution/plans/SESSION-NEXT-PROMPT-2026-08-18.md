# NEXT SESSION PROMPT — from the 2026-08-17 close

Paste the block below as the first message of the next session.

---

## Standing discipline (carried, non-negotiable)

- **MEASURE, never infer.** A stated premise lost to a measurement **four separate times** this
  session — including twice where the premise was mine. Every brief must carry an explicit
  refutation path.
- **§EXIT-CODE-THROUGH-A-PIPE.** Never read a verdict through `| tail` / `| head`. Capture with
  `CMD > out.txt 2>&1; echo "RC=$?" >> out.txt` and read the file. **Misread five times.** Once the
  printed text said FAILED while the piped code said 0.
- **Root tsc needs `NODE_OPTIONS=--max-old-space-size=8192`.** The default heap aborts with **exit
  134** (SIGABRT) — an OOM, not a type error, and it prints no diagnostics. Misread four times.
- **Exit 3 is never absorbable** (C70 §5.1). Fix the breach; never raise the threshold.
- **Committed ≠ reachable.** Prove at the layer the user experiences.
- **Never `git stash`** — the stack is global across worktrees.
- ⭐ **A refusing half and its escape hatch ship together, or neither ships** (C83 §10.6.7, new).
- ⭐ **A control that cannot fail is not a control.** Watch every new assertion go red first.

## Deploy state

**`6c676413` deploying to Fly as this session closed** (L-942 wall-move fix). Verify with
`tools/deploy/fly-bundle-proof.sh <sha>` — and **read `DEPLOY-CONTRACT-MANUAL-FLY.md` §6.7 FIRST**:
the proof **failed a healthy deploy** earlier today and its text says `ROLL BACK NOW, DO NOT RETRY`.
Interim rule: do not run it until the deploy script has **exited**; on a SHA mismatch re-run after
60 s and poll `/version` several times. **L-941 is the fix and it is HIGH** — it sits on the deploy
path and its failure mode is a destructive action on a false positive.

Earlier deploy `c2e8ba00` (735 commits) is live and proven 6/6.

## ⭐ FIRST THING: finish L-942's test rewrites

A workflow was rewriting these when the session ended — **check whether it landed** (`git log`).

**9 tests fail in two files**, and every one is a *stale defect-measurement*, not a broken behaviour:
- `packages/command-registry/__tests__/L936InteriorLPairMove.measure.test.ts` (4)
- `packages/command-registry/__tests__/L932AngledWallMove.measure.test.ts` (3, one a CONTROL)

Their own describe blocks say *"the partner is REACHED, **and then deliberately left behind**"* and
*"the 30° junction is dropped **SILENTLY**"*. They measured the defect; the defect is gone.

⛔ **Do not flip numbers until green.** Derive the expected seat analytically — the intersection of
the partner's line with the mover's NEW line — assert the FAR endpoint byte-identical, and assert
**the loop is still closed**. Watch each arm fail first by forcing `isMutualCorner` to `return false`
(that is pre-§10.6 behaviour exactly), then restore.

## What L-942 was, and what shipped

**Every wall move that broke a junction was hard-blocked in production** by `c2e8ba00`. Founder-
reported within hours. Proven a regression by measurement: `moveReweldPreflight.ts` did not exist at
`52bfb2ba` and `wallPlacementGate` had zero `incumbentBreach` there.

**Root cause: a discarded discriminator, not geometry.** A MUTUAL corner (two walls jointly own it —
the partner must follow) and a TERMINATING corner (an incumbent — it must not move) are *the same
picture*. The separator is STORED on the `joinedTo` edge: interior↔interior `L`/2, interior↔perimeter
`T`/3. `getJoinedWalls` loaded it and returned `joinedWallIds` alone. Unable to tell them apart, and
with L-922 fresh, the engine refused **both**.

**Fixed at the seam** (`53f93049`, `7025c400`, `9d6ed3d8`, `6c676413`): the query carries `junctions`;
`MoveReweldPartner` carries the discriminator; `isMutualCorner` gates a **pivot** — welded endpoint to
the analytic intersection, **far endpoint untouched**; the gate exempts role `mutual-corner`.
**Absent metadata ⇒ do not follow** (§10.6.3 #1).

**Two of my own bugs, both caught by probes, both worth knowing:**
1. **The follow was asymmetric.** It sat inside `beyond > ON_SEGMENT_EPS_M`, so it only fired on
   lengthening. Drag out → followed; drag back → stayed long with a 2 m stub. The `beyond` test
   protects *incumbents*; a co-owner of the corner isn't one.
2. **My first L-922 control was theatre** — it stayed GREEN with the discriminator check removed,
   because its mid-span fixture never reached the mutual-corner branch. Rewritten to vary exactly
   one thing: same geometry, `T`/3 instead of `L`/2.

**Proven green:** root tsc RC=0 · geometry-wall 664/664 · `wallMoveReweldSeam` 11/11 (incl. the
load-bearing L-922 control) · `hostedOpeningHostMoveSeam` 9/9 (the round-trip).

## The founder's PRYZM 3.0 connected-system spec — UNAUDITED

The founder issued an 8-section spec (perimeter behaviour, dependent elements, interior walls,
polylines, perimeter↔interior, hierarchy, intent-over-coordinates, MOVE→PROPAGATE→RECOMPUTE). It is
in the conversation and should be captured to a doc.

**L-942's fix delivers the wall-follow core of §1, §3, §4, §5.** A workflow auditing all 8 against
the code was stopped before reporting. **§2 (slabs, floor finishes, ceilings, roof geometry
regenerating on perimeter change) is the suspected large gap — audit reachability, not existence.**

## Half 1 / Half 2 — generate, never quote

```bash
npx tsx tools/bim30-status/bim30-status.ts --fast
```

New this session. First reading at `c2e8ba00`: **17/38 closed of rows MEASURED, 43 CARRIED, 5 exit-3
breaches** (GE-02, GE-03, GE-12, PV-01, PV-03). ⭐ **The headline is the 43: more than half the
register has no gate any runner can execute.** The tracker's hand-stamped 53/79 measures a different
thing and both are true.

**Half 2 (bar 3):** 4,100 cells, ledger at 124 findings. **honest-refusal cells = 0**, and it is ONE
seam: `ConsequencePreviewService.ts:58` and `:766` still return `ConsequencePlan | null`.
`UndeterminedReason` (11 members) and `PreviewOutcome` both EXIST and are unwired. **Wiring them is a
Half 1 sub-phase (B.4) that unblocks a Half 2 pass condition across all 4,100 cells** — neither
document names the dependency.

## Unowned rows

| Row | What |
|---|---|
| **L-941** | **HIGH** — bundle proof false-failure + `DO NOT RETRY`. Deploy path. |
| **L-940** | 6 tests RED on `main` (`elementIdsForRoom` renamed). ⚠ A mechanical rename goes green while pinning the defect. `apps/editor/__tests__/**` is typechecked and run by nothing. |
| **L-939** | `captureThumbnail()` is a second render driver; P3's gate counts rAF call sites and cannot see it. |
| **L-937 / L-938** | `wall.create` replicates nothing (contract defect — sweep `syncDisposition.ts` whole); `hostSnap` triplicated. |
| — | `check-deterministic-regeneration` exit 3, 3 findings in `WallCrossesOpening.ts`; MT-01 slab + room arms. |

## Founder decisions open

1. **Half 2 denominator** — C78 §20 vs C71 §2.3, both CANONICAL. Needs an ADR.
2. **VisibilityIntent 3-D colour override vs a declared layer colour** — product call.

*(C83 §10.6 is CONFIRMED as of 2026-08-17 — no longer open.)*
