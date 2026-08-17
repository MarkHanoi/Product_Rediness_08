# SESSION BRIEF — finish the connected-system fixes and VERIFY them

**Written 2026-08-17 at session end. Paste everything below as the first message.**

---

You are continuing PRYZM (BIM SaaS, pnpm monorepo). Read `CLAUDE.md`, then this.

## 0. ⛔ FIRST ACTION — VERIFY, DO NOT BUILD

**`0f88bbc6` shipped four lanes' UNVERIFIED work.** The lanes stalled mid-implementation —
transcripts frozen at identical byte counts across three checks, journal 4 started / 0
finished, none committed or ran its own suite. The founder directed the ship knowingly.

**Verified before shipping:** root tsc **RC=0, 0 errors** across 29 files ·
`wallMoveReweldSeam` **11/11** (the load-bearing L-922 degree control still holds).

**Not verified:** everything else.

**RUN THESE FIRST, capture each exit code TO A FILE, before writing a single line of code:**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --skipLibCheck -p tsconfig.json
pnpm --filter @pryzm/geometry-wall test        # was 648/664; a lane observed 670/670
pnpm --filter @pryzm/geometry-slab test
pnpm --filter @pryzm/command-registry test
pnpm --filter @pryzm/finish-host-tracker test
pnpm --filter @pryzm/core-app-model test
npm run check:isolation
npm run test:server                            # expect 613/613
npx vitest run                                 # root config
```

⚠ `WallCreateJoinIntentCensus.measure` is KNOWN-FLAKY when another process writes files
mid-scan — its own header says so. Re-run it alone before believing a failure.
⚠ `packages/renderer-three/__tests__/depth-buffer.test.ts` has **3 PRE-EXISTING** failures
unrelated to any of this.

⚠⚠ **CHECK FOR CLOBBERED ASSERTIONS.** The partner-census lane edited
`packages/geometry-wall/__tests__/L926*`, `L932*`, `WallMoveReweld.test.ts` — files owned by a
concurrent re-scope workflow. The `computeMoveReweldPlan → computeMoveReweldCensus` rename
forced it, but **two workflows in one file is how work gets lost.** Diff against `21d0890e`
before trusting those suites.

## 1. WHAT EACH STALLED LANE INTENDED — their claims, not proven outcomes

| Lane | Files | Intent |
|---|---|---|
| **L-943** floor/ceiling undo | `FinishHostDependencyTracker` ×24 · `UpdateFloorBoundaryCommand` ×20 · `UpdateCeilingBoundaryCommand` ×12 · new `floorFollowUndoRestore.test.ts` | It went to a **TRACKER — a LISTENER**, which is the suspected root: the finish follow *reacts* to the wall change instead of being a latched forward/inverse patch pair, so undo **RE-DERIVES where it should RESTORE**. ⭐ It also touched **CEILINGS**, unbriefed — same mechanism, so ceilings are almost certainly corrupting too. |
| **L-944b** dead preflight | `wallPlacementGate` ×4 · `SlabWallConnectivityService` ×3 · `WallStore` ×1 · new `wallMoveSlabWeldPreMove.test.ts` | Smallest footprint = a contained crash fix. The `WallStore` touch is likely the real shape mismatch behind `t.getAll is not a function`. |
| **L-944a** GPU draw-after-free | `WallFragmentBuilder` ×16 · `DiagnosticMaterialManager` ×13 · `GhostOverlayRenderer` ×7 · `SelectionBoundsRegistry` ×6 | ⚠ **WENT SOMEWHERE THE BRIEF DID NOT SAY.** Briefed at `renderer-three`/L-930's submit gate; went to fragments + overlays. If right, the buffer isn't freed by the pipeline — **a wall fragment is rebuilt on undo while an OVERLAY holds a draw reference**, which explains `MeshBasicMaterial` (an overlay material). **UNCONFIRMED — the lane's reading, not mine.** |
| **partner census** | `WallMoveReweld.ts` ×3 + 3 test files | `computeMoveReweldPlan` → `computeMoveReweldCensus`, new `MoveReweldNotApplicable`. Every partner now leaves as entry / refusal / typed not-applicable. **Silence was the fourth state.** |

## 2. THE THREE DEFECTS, AS MEASURED — these are facts, unlike §1

### L-943 — the undo invented 63 m²

```
MOVE: [Dne] §C79-5.2 conflicted: floor "162a95a2" NOT re-projected — ring self-intersects
UNDO: [Dne] §C79-5.2 resized:    floor "162a95a2" follows wall — 75.171 → 138.262 m²
```

It **refused** going forward — nothing to reverse — and undo resized it anyway. Forward has a
refusal arm; reverse doesn't consult it. **C71: undo RESTORES, it does not RECONSTRUCT.**
⛔ Do NOT fix by making undo refuse too — both arms then go silent about a floor that no longer
matches its walls. Restore the stored boundary verbatim. **HIGH: it silently changes areas the
user bills from.** Prove at the STORED boundary across move→undo, never at the reported m².

### L-944b — a rival cascade with a dead guard

```
[WallMoveReweldService]       2 partner(s) considered → 0 entries, 0 refusals
[SlabWallConnectivityService] the new corner lies PAST this wall's far endpoint … -1.190 → -5.000
[SlabWallConnectivityService] §L-921-SLAB-PREFLIGHT preview failed (non-fatal): t.getAll is not a function
```

Two services weld the same corner; compounds `-1.190 → -5.000 → -11.654` (gate reported
**10464 mm**). ⭐ **"(non-fatal)" is exactly backwards — a check that throws has NOT ANSWERED**,
and the weld proceeds unguarded. Also explains `§MOVE-REWELD-EMPTY-PLAN`: the reweld service
isn't failing to compute, the slab service got there first.
⛔ Do NOT fix with a `typeof x.getAll === 'function'` guard — that turns a crash into a silent
skip, the same defect in a quieter coat.
⛔ **Which service owns a corner is ARCHITECTURAL and needs the founder.** Measure and report;
do not pick a winner.

### L-944a — WebGPU draw-after-free

```
uncaptured WebGPU error: Vertex buffer slot 0 required by
  [RenderPipeline "renderPipeline_MeshBasicMaterial_6268"] was not set.
```
Fires immediately after `UNDO: CASCADE_WALL_BASELINE`. Same lifetime family as L-930 (that was
the *free* side; this is the *draw* side). ADR-0297 L2 governs: *DETACH now, RELEASE at the
boundary*. Note L-939: `captureThumbnail()` drives a second off-rAF `render()` and an auto-save
fires on this exact gesture, so the interleave is real and documented.

## 3. WHAT WORKS — do not regress it

**Perimeter walls close when moved OUTWARDS past a neighbour's end.** The founder diagnosed it
in one sentence — *"inwards works, outwards doesn't"* — after three deploys had fixed the wrong
layer. Inwards: the corner lands ON the neighbour, nothing moves. Outwards: it lands PAST the
end, the neighbour must LENGTHEN, and that was banned outright.

**C83 §10.6.3, amended and founder-confirmed:** at **degree 2** the partner FOLLOWS — pivot,
welded endpoint to the analytic intersection, **far endpoint untouched**, both directions.
**Degree ≥ 3 NEVER follows** (the L-922 guard). Degree is READ from the stored `joinedTo` edge
or **MEASURED** by counting endpoints when absent — counting measures the same number the
metadata stores, so it is not the forbidden geometric inference.

## 4. DISCIPLINE — every rule below was broken on 2026-08-17

- **MEASURE, never infer.** A stated premise lost to a measurement **six times**; four were the
  agent's own, two inside its own fix.
- **§EXIT-CODE-THROUGH-A-PIPE.** Never `| tail` a verdict. `CMD > out.txt 2>&1; echo "RC=$?" >>
  out.txt`, read the file. **Misread five times**; once the text said FAILED and the code said 0.
- **Root tsc needs `--max-old-space-size=8192`.** Exit **134** = OOM, not a type error.
- ⭐ **COMMITTED ≠ REACHABLE**, sharp form: *proving a fix at the layer that COMPUTES is worth
  nothing if the layer that DECIDES keeps its own copy of the inputs.* **Shipped broken to
  production three times in one day, each with green tests.**
- ⭐ **A refusing half and its escape hatch ship together, or neither ships** (C83 §10.6.7).
- ⭐ **A control that cannot fail is not a control.** Watch every assertion go red first — one
  L-922 control stayed GREEN with the safety check removed.
- ⭐ **A probe can lie.** A watch grep for "L-944" matched the agent's own issue-log commit and
  falsely reported the fix had landed. **Read the output; never act on the match alone.**
- **Never `git stash`** (global across worktrees). Commit scoped paths; never `git add -A`.
- **Deploy:** read `DEPLOY-CONTRACT-MANUAL-FLY.md` **§6.7 FIRST**. The bundle proof failed a
  HEALTHY deploy and says `ROLL BACK NOW, DO NOT RETRY`. Do not run it until the deploy script
  has EXITED. **L-941 is that fix and it is HIGH.**

## 5. THE FOUNDER'S SPEC — the definition of done

**PRYZM 3.0 — Architectural Topological and Parametric Wall Behaviour.** The model must behave
as a **connected architectural system**.

1. **Perimeter** — move one wall: it moves perpendicular to its own vector; neighbours
   **extend, shorten, rotate or reposition** to keep the perimeter closed; corners resolve; no
   gaps or overlaps. *(wall-follow core: WORKING)*
2. **Dependent elements** — slabs, floor finishes, ceilings, roof geometry, roof finishes and
   rooms **regenerate** to the new perimeter, preserving thickness/offset/level.
   ⚠ **SUSPECTED LARGE GAP, UNAUDITED. Audit reachability, not existence.**
3. **Interior walls** — four connected walls define a room; move one and the room boundary,
   area and finishes update.
4. **Polylines** — a multi-segment wall behaves as ONE connected system.
5. **Perimeter ↔ interior** — a partition connected to the perimeter follows it and stays
   connected. Never produce disconnected ends, gaps, overlaps, floating walls, invalid rooms.
   **The connection is a persistent RELATIONSHIP, not a coincidence of coordinates.**
6. **Hierarchy** — DESIGN INTENT → PERIMETER → WALL NETWORK → ROOMS → SLABS/FINISHES →
   CEILINGS → ROOFS. A change propagates down; the user redraws nothing.
7. **Preserve intent, not coordinates** — ask *"what relationships must remain true?"*
8. ⭐ **MOVE → PROPAGATE → RECOMPUTE**, never MOVE → BREAK → MANUALLY REPAIR.

## 6. UNOWNED ROWS

| Row | What |
|---|---|
| **L-941** | **HIGH** — bundle proof false-failure + `DO NOT RETRY`. Deploy path. |
| **L-940** | 6 tests RED on `main` (`elementIdsForRoom` renamed). ⚠ A mechanical rename goes green while pinning the defect. `apps/editor/__tests__/**` is typechecked and run by **nothing**. |
| **L-939** | `captureThumbnail()` is a second render driver; P3's gate counts rAF call sites and can't see it. |
| **L-937 / L-938** | `wall.create` replicates nothing (contract defect — sweep `syncDisposition.ts` whole); `hostSnap` triplicated. |

## 7. HALF 1 / HALF 2 — generate, never quote

```bash
npx tsx tools/bim30-status/bim30-status.ts --fast
```
First reading: **17/38 closed of rows MEASURED, 43 CARRIED, 5 exit-3 breaches.** ⭐ **The
headline is the 43: more than half the register has no gate any runner can execute.**
⚠ The tracker's **§5 is STALE** — it claims 13 gates run in no runner; all 13 are registered.

**Half 2:** 4,100 cells, 124 findings, **honest-refusal = 0** — and it is ONE seam:
`ConsequencePreviewService.ts:58` and `:766` still return `ConsequencePlan | null`.
`UndeterminedReason` (11 members) and `PreviewOutcome` both EXIST, unwired. **Wiring them is
Half 1 sub-phase B.4 and it unblocks a Half 2 pass condition across all 4,100 cells.**

## 8. FOUNDER DECISIONS OPEN

1. **Which service owns a wall corner** — `WallMoveReweldService` vs `SlabWallConnectivityService`.
2. **Half 2 denominator** — C78 §20 vs C71 §2.3, both CANONICAL. Needs an ADR.
3. **`docs/03-execution/plans/` restructure** — 51 loose files; every move must rewrite its
   inbound citations in the same commit.
