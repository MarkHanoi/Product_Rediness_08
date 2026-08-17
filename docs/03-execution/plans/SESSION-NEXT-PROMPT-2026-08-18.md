# NEXT SESSION PROMPT — from the 2026-08-17 close

Paste the block below as the first message of the next session.

---

## Standing discipline (carried, non-negotiable)

- **Measure, never infer.** A row's stated premise was wrong more often than right this session.
  Five of my own hypotheses were refuted by the lanes I briefed. **Every brief must carry an
  explicit refutation path** — that is the only reason those five were caught.
- **§EXIT-CODE-THROUGH-A-PIPE.** Never read a verdict through `| tail`/`| head`. Capture with
  `CMD > out.txt 2>&1; echo "RC=$?" >> out.txt` and read the code from the file. **Misread five
  times in the 2026-08-17 session**, most recently on the deploy proof where the text said FAILED
  and the piped code said 0.
- **Root tsc needs `NODE_OPTIONS=--max-old-space-size=8192`.** The default heap aborts with **exit
  134** (SIGABRT), which is an OOM, not a type error, and prints no diagnostics. Misread four times.
- **Exit 3 is never absorbable** (C70 §5.1). Fix the breach; never raise the threshold.
- **Committed ≠ reachable.** Prove at the layer the user experiences, never at a pure function's
  return value.
- **Never `git stash`** — the stack is global across worktrees. Agents commit scoped CODE; the
  orchestrator owns docs and cherry-picks.
- **Architectural soundness**: contract/ADR-mapped, no shortcuts, in every subagent brief.

## Where the deploy stands

**`c2e8ba00` is LIVE on Fly** (2026-08-17), bundle proof **6/6**, `DEPLOY_RC=0`. 735 commits since
the previous release `52bfb2ba`. Hard-refresh before testing (service worker).

⚠ **Before the next deploy, read `DEPLOY-CONTRACT-MANUAL-FLY.md` §6.7 first.** The bundle proof
**failed a healthy deploy** and its text says `ROLL BACK NOW, DO NOT RETRY`. Interim rule: do not run
the proof until the deploy script has **exited**; on a GIT_SHA mismatch re-run once after 60 s and
poll `/version` several times. **L-941 is the fix and it is HIGH** — it sits on the deploy path and
its failure mode is a destructive action on a false positive.

## The one thing I would do first

⭐ **Wire the typed preview outcome — `apps/editor/src/engine/consequence/ConsequencePreviewService.ts:58` and `:766`.**

Both halves already exist and are unwired:
- `UndeterminedReason`, the closed 11-member union — `packages/command-bus/src/consequence.ts:109`
- `PreviewOutcome` — `packages/command-bus/src/consequence.ts:635`
- the production entry point still returns **`ConsequencePlan | null`**

**Why it is the highest-leverage edit on the board:** a bare `null` cannot carry a typed reason, so
**`honestRefusalCells = 0` across all 4,100 Half 2 cells** — and C78 §4.3 rule 2 makes an honest
refusal a **PASS**. This is a Half 1 sub-phase (**B.4**) that unblocks a Half 2 pass condition
across the entire product. **Neither document names the dependency**, because each only documents
its own side.

⚠ Not a signature swap. Every caller must handle the new shape and every return site must produce a
typed outcome. Scope it, then land it whole (C78 §19.1).

## Half 1 — the trust register

**53 / 79 measured-closed at the last hand stamp** (`3785eae6`, 2026-08-16) — **already historical**,
~45 commits have landed since. **Do not quote it. Generate it:**

```bash
npx tsx tools/bim30-status/bim30-status.ts --fast     # human table
npx tsx tools/bim30-status/bim30-status.ts --json     # machine readable
```

**New this session.** It parses the 84 rows out of the tracker and runs each row's own deciding
gate. Carried rows are counted **separately** and never folded into the numerator; a gate that
cannot run yields `NOT_DETERMINED` with a typed reason, never 0. **A first full run had not
completed at session close — run it and record the reading.**

Worst blocks by a wide margin: **C70 model-truth 2/10** and **C73 geometry 4/12** — 24 of the 26
open rows. C70 is the foundation, which is the uncomfortable part.

**Phase A** is materially complete. **A.10 is DONE and the tracker does not say so** — all 13
formerly-orphaned certification gates are registered in `run-all.ts`, verified by census, including
`check-relationship-determination` (the bar-3 gate). **The tracker's §5 is STALE and should be
rewritten or struck.** A.12 (zero exit-3s) is what remains.

**Phase B.12 / MT-01 is 1 of 3 arms**: wall CLOSED; **slab OPEN** (shape mismatch — mirroring it
would mint a second translation rival, do not); **room OPEN** (a different defect — `affectedStores:[]`,
no patch pair exists to mirror).

## Half 2 — bar 3

**4,100 cells** = 100 consequential verbs × 41 relationships. Ledger:
`tools/rac-conformance/certification/gates/relationship-determination.json`.

| | first | now |
|---|---|---|
| findings | 134 | **124** |
| silent cells | 4,018 | **3,649** |
| structurally answerable | 10 | **66** |
| **honest-refusal cells** | 0 | **0** ← see "the one thing" above |

Exit condition is the ledger reaching **empty**. Landing discipline: **one verb family per PR,
landed whole**. Next cheapest: `wall.delete` / opening-delete on existing substrate. ⚠ **Roof needs
an L0 schema field FIRST** — Zod strips the reference in transit; that is a sequenced solo change,
never part of a family PR.

## Open rows nobody owns

| Row | What |
|---|---|
| **L-941** | **HIGH** — bundle proof false-failure + `DO NOT RETRY`. Deploy path. |
| **L-940** | 6 tests RED on `main` (`elementIdsForRoom` renamed). ⚠ A mechanical rename goes green while pinning the defect. Second half: `apps/editor/__tests__/**` is typechecked and run by nothing — census the other `apps/*/__tests__` before fixing. |
| **L-939** | `captureThumbnail()` is a second render driver (off-rAF `render()`); P3's gate counts rAF call sites and cannot see it. |
| **L-937** | No `wall.create` replicates — a contract defect, NOT a call-site defect. Sweep `syncDisposition.ts` whole. |
| **L-938** | `hostSnap` triplicated; fold into the C73 §2.2 epsilon drain (GE-01). |
| — | `check-deterministic-regeneration` still exit 3, 3 real findings in `WallCrossesOpening.ts`. |
| — | MT-01 slab + room arms (above). |

## Founder decisions still open

1. **C83 §10.6** — minted **AWAITING CONFIRMATION**. It **changes what §10.1 permits**: in a mutual
   2-wall L junction the partner FOLLOWS. Safety rests on condition 1 (`junctionType==='L' &&
   junctionDegree===2`), which is what stops it reopening L-922 (that was `T`/degree-3). L-936's
   other two parts have shipped; only the follow waits. **If the founder's intent differs, §10.6 is
   wrong and the code must not ship against it.**
2. **Half 2 denominator** — C78 §20 vs C71 §2.3, both CANONICAL. Needs an ADR.
3. **VisibilityIntent 3-D colour override vs a declared layer colour** — product call.

## Documentation health

The prose is the strongest asset in the repo — it records what someone already got wrong, by name,
and that **prevented a bad rollback this session**. The bookkeeping is the weakness: three fresh
instances of *a document asserting enforcement that no longer holds* (tracker §5; the stale
headline; the proof's rollback clause). `tools/bim30-status` closes the first class. The other two
are L-941 and a §5 rewrite.
