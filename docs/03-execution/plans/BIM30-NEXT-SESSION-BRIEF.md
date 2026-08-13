# BIM 3.0 — NEXT SESSION BRIEF · THE PATH FROM ~48 % TO 100 %

> **Purpose**: open the next session at full speed and drive the counted figure to **100 %**.
> **Written** 2026-08-13 at the end of a **57-commit, 16-lane** session · **HEAD** `abaeef1d`
> **Companions**: [MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) ·
> [IMPLEMENTATION-ROADMAP](BIM30-IMPLEMENTATION-ROADMAP.md) §3.1 (the three bars) ·
> [GAP-REGISTER](../../04-reference/BIM30-GAP-REGISTER.md) (the 82 rows)
>
> ⚠ **TWO THINGS DID NOT FINISH AND ARE THE FIRST TWO ACTIONS BELOW.** The session ended on an
> API session limit that killed four lanes mid-flight: the **final recount never ran**, and the
> **deploy never completed**. Neither failure is a code failure. Read §-1 before anything else.

---

## §-1 — WHAT IS UNFINISHED, STATED FIRST SO IT CANNOT BE MISSED

| # | Unfinished | Evidence | Consequence |
|---|---|---|---|
| **1** | **The deploy did NOT happen.** | `flyctl releases --app pryzm` → latest is **v1270, 3h43m before session end** = `aa219a31`. The deploy lane got as far as builder-verified (16 GB), args shape-checked (cesium 257 / google 39), `GIT_SHA=03356e5a` stamped — then died on the session limit **during the image build**. | **Production runs a build that predates EVERY fix in this session.** Browser behaviour of the slab fix and the model tree is **UNPROVEN**, exactly as it was this morning. |
| **2** | **The final recount did NOT run.** | Lane died on `Not logged in`. Its last executed reading before dying: PV-04 confirmed exit 1 at 5/5. | **The counted figure is not officially stamped.** The register still carries the **mid-session 34/82**. Do not quote any other number until a recount produces it. |
| **3** | Docs lane died mid-edit | `BIM30-MASTER-COMPLETION-TRACKER.md` is **dirty in the working tree** — a partial edit. | Inspect the diff before trusting or committing it. |

**Nothing was lost.** Every lane's *code* is committed and pushed through `abaeef1d`. What is missing
is the deploy, the stamp, and one doc edit.

---

## §0 — PASTE THIS AS THE OPENING PROMPT

```
Read docs/03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md in full — §-1 FIRST,
it records the two things that did NOT finish last session.

DO THESE TWO IN ORDER, BEFORE ANY NEW WORK:
  1. DEPLOY. Production is still aa219a31 and predates the entire last
     session. Follow docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md §7.
     The pre-deploy cover is ALREADY GREEN and recorded as ISSUE-LOG L-852
     (root tsc 0 errors, isolation exit 0, server 613/613) — re-run it only
     if HEAD has moved since 03356e5a. Then give me the browser checks in §7.4.
  2. RECOUNT. Run the gates, restamp docs/04-reference/BIM30-GAP-REGISTER.md
     and its §9.0. Face GR-09 honestly (§2.2) — it may move BACKWARD.
     Report the counted figure only after a recount produces it.

Then execute §2 Phase A. Launch the lanes in §3 IN PARALLEL on the partition
map. Enforce §4 git discipline verbatim — every rule there cost real work.

Do NOT re-read contracts C67-C80 end to end; §1 carries the digest. Open a
contract only when you are about to change what it governs, and only that §.

Poll lanes by commits and file mtimes, never by launch records. A lane that
has written nothing in 15 minutes is stalled: message it to commit-or-report.
```

---

## §1 — THE CONTRACT DIGEST (so you never re-read 13 contracts)

| Contract | The rule that will bite you |
|---|---|
| **C70** | A capability missing any Golden-Chain link **is not complete** — "90 %" is forbidden (§3.2). Exit **2 and 3 are NEVER absorbable** (§5.1). **A floor may never be lowered, and a shrink-only ledger may never GROW, to go green** (§5.3) — identical to deleting the gate. Paid debt leaves the ledger **in the commit that pays it** (§5.4). Every comparator **watched go red** before trusted (§5.6). **UNPROVEN is neither pass nor fail** (§2.2). |
| **C78** | Every operation: DETERMINED-affected / DETERMINED-unaffected / **UNDETERMINED with a typed reason** — no fourth answer (§1.1). Never infer "unaffected" from missing data (§1.4). Union **closed at 11 members**, `packages/command-bus/src/consequence.ts`. **§19.1 no-partial-credit applies ACROSS the element × relationship product** — this is what makes bar 3 expensive. |
| **C79** | Bounded **by reference, never copied coordinates**. Attribution **by construction, never proximity** — "a wrong host is strictly worse than no host" (§2.3). `fallback` at **authoring time** (§4.3). Five recomputation states (§5); §5.2.1 forbids collapsing `preserved` into `undetermined`. |
| **C80** | Generation is consequential: plan → validate → preview → approve → execute-the-same-plan → reconcile → undo. Authority per element: `may` / `protected` / **`unknown-authority` is not permission** (§2.3). |
| **C71** | Six semantics per family. **An untyped enumeration is not a reader** (§1.3). Writer-first unparking forbidden without an ADR naming the first consumer (§2.5). One family per PR (§2.6). |
| **C72** | A cascade with no listener and a diff with no `prevState` are the same defect. **Narrowing a claim to the truth IS an acceptable fix (§5/§7)** — it closed PR-07. Suppression must be reversible. |
| **C73** | One canonical implementation per predicate family. **ONE FAMILY PER PR (§3.5).** One declared tolerance policy; **never widen a tolerance to go green** (§2.5) — the epsilon comes from `EPSILON_ZERO` in geometry-kernel or the predicate refuses; it is never a per-call-site choice. |
| **C74** | **No adapter reports a solve it did not perform.** An arm never watched failing is **UNPROVEN** (§6.2). **A test whose fixture supplies the value under test proves nothing** (§3.4). |
| **C75** | AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED. **Never invented.** UNKNOWN is a value **with a reason** (§1.4). COMPUTED and INFERRED **never merged** (§1.2). |
| **C67/C68** | **Mandatory** for any PR registering a bus command: chat-reachable or declared `CHAT_UNAVAILABLE`. Run `check-chat-capability-coverage.ts` before *and* after; never weaken a baseline. |

**The sentence that generates all of it:** *a claim is not evidence; run the check.*

---

## §2 — THE PATH TO 100 %

### §2.0 — WHAT 100 % ACTUALLY MEANS (both halves, or it is not 100 %)

1. **All 82 register rows CLOSED on executed gates.** Not on commit subjects, not BY-READ.
2. **The three bars of ROADMAP §3.1** — including **bar 3**, `check-relationship-determination`,
   going from **RED at 134** to **exit 0**. That gate measures the element × relationship product:
   **100 consequential verbs × 41 relationships = 4,100 cells**, of which **4,018 are SILENT**
   (98 verbs with no normaliser + composed planner) and **72 are refusal-BLOCKED** (36
   relationships that structurally cannot refuse).

> **Bar 3 is the long pole and it is NOT a one-session job.** C78 §19.1's no-partial-credit rule
> means a verb family is done or it is not. Size it as **Phase C, multiple sessions, by family**.
> Anyone promising 100 % in one session has not read the gate's output.

### §2.1 — WHERE THE NUMBER STANDS

**Last EXECUTED recount: `34/82`.** Gate-confirmed closures landed after it, each verified by a run:

| Row | Closing evidence (executed) |
|---|---|
| **PR-03** | `check-prevstate-contract` → **exit 0 CLEAN, hard-0, EMPTY ledger** (was 17) |
| **CO-12** | plant/revert: an 18th rule moved enumeration 20→21 and exited 3; reverted → exit 1 at 2/2 |
| **GR-18** | `graphruntime.cert.ts` → 10/10, **REACHED 5 of 6**, exit 0 — the first runtime graph read-back |
| **GE-03** | `check-predicate-canonical` **C3 = 0** — CesiumViewport's three rival guards are one |
| **GE-11** | `check-room-aabb-canonical` → **[0] CLEAN, hard-0, no baseline** (was 3/3) |

→ **~39/82 (47.6 %)**, minus a possible honest re-open of **GR-09** (§2.2) → **38**.
**50 % = 41 rows. The recount decides. Never hand-increment.**

### §2.2 ⚠ GR-09 MAY MOVE BACKWARD — face it, do not quietly keep the stamp

GR-09 is stamped **CLOSED**. Its headline claim is *"`CreateWallCommand` writes no graph edges at
all."* Its closure evidence (`e878bdad` / `46d06234`) proved **`wall.create` VERB reachability** —
a different claim. The H5 runtime harness measured `getTargets('grt-wall-1','sitsOn')` → **`[]`**.

**If the row's headline is the edge write, re-open it on the executed reading.** That is the rule
that correctly re-opened MT-10 two sessions ago: **where a commit subject and a gate disagree, the
gate wins.** A recount that only moves rows forward is not a recount.

### §2.3 — PHASE A (next session · ~48 % → ~60 %)

| # | Work | Why it is fast / why first |
|---|---|---|
| **A0** | **DEPLOY + BROWSER VERIFY** | The only axis nobody can measure with a gate. §7. |
| **A1** | **RECOUNT** | +2 to +5 rows already earned and unstamped. ~30 min. |
| **A2** | **GE-02 — the last 7 point-in-polygon rivals** | Was 53 → **7**. **Six are blocked on one thing that is not code**: neither `geometry-slab` nor `core-app-model` declares `@pryzm/geometry-kernel`, so each needs a `package.json` dep **+ a `pnpm-lock.yaml` sync**. Both are L2, same layer as the kernel, so the layer gate permits it (precedent: `street-analytics` L1→L2 in `a930ff61`). Then five are trivial `pointInPolygonXZ/XY` swaps. |
| **A3** | **`HiddenLineRemoval.ts:331`** — the 7th, the one real design item | `pointInSilhouette` is **not a ring**: a flat `segs: number[]` quad array holding **multiple loops** (wall outline + window rectangles); even-odd over the union is what makes openings read as see-through. Needs a kernel **`pointInEdgeSetEvenOdd(px,py,edgeCount,ax,ay,bx,by)`** with `pointInRingEvenOdd` delegating to it — one straddle test total, so C2's exactly-1-body arm still holds. **Designed last session, not written.** |
| **A4** | **L-851 — 72 spec files that have never run** | Root `vitest.config.ts`'s two **founding** patterns are `src/ui/…` (repo-root-relative) and **repo-root `src/ui/` does not exist**; the tree moved to `apps/editor/`. ~1,140 cases dark in the suite CI calls `test-root`. **MEASURE THE 72 GREEN IN ISOLATION FIRST, THEN REPOINT.** Never enable blind — that is how a gap becomes a broken build. |
| **A5** | **PR-12 — a one-line fix with its test already written and red-ready** | `SchedulePanel.ts` constructor needs a geometry subscription beside the existing `sched:*` pair, same guarded `if (display !== 'none') this.render()` shape. ⚠ `schedulePanelGeometryStaleness.spec.ts`'s STRUCTURAL case asserts the listener list is **exactly** `['sched:schedule-updated','sched:store-loaded']` — it is **designed to go red when the fix lands** and must be re-stated in that same commit. |
| **A6** | **Enroll `check-room-aabb-canonical` in `certify.ts`** | Its header says it was kept out only while red. It is now CLEAN hard-0. `certify.ts` uses an explicit allowlist (~line 424), not directory discovery. |
| **A7** | **`finish-host-tracker` audit** | Landed **INHERITED, PARTLY VERIFIED** across a killed lane and its successor. **One test file OOMs.** Its trackers are **not wired into any init path**. It owes: 5 unledgered `check-no-empty-means-unknown` findings, and a §STEP7 prevState + seam test (`check-prevstate-contract` is hard-0 with an **empty** ledger — **zero slack**). One real bug already fixed in it: `f5f312de` §REENTRANT-SET — one wall move re-projected one floor **forever**, the tracker's own event path feeding its own iteration. |

### §2.4 — PHASE B (~60 % → ~75 %)

- **The `[]`-means-unknown drain to 0** — `check-no-empty-means-unknown` at **85** (was 95). Rows GR-10/GR-14. Reference pattern: `a0a6ed09`, `701e8cfa`, `db64812d`, `f1595c29`. Shared seam: `apps/editor/src/ui/relationshipDetermination.ts`, which **type-only-imports** the closed C78 §8.1 `UndeterminedReason` union from `@pryzm/command-bus` — reuse the vocabulary, never restate it. Every fix needs a **differentiating** test.
- **CE-05 — the gesture-level reachability probe.** Command→graph reachability is now instrumented (`c2e250bb`); **gesture→command is not**. The harness starts one link too late. This is the defect class that produced **L-847** (a whole workbench shipping unreachable) and **L-849** (a whole test suite never running) — the highest-leverage missing instrument in the program.
- **PV-04 / PV-06** — export boundary is **MEASURED-ABSENT**: ifc-export 30 files / dxf 2 / export-pdf 2 / file-format-export 35, **zero** C75 vocabulary in all four (`check-provenance-export-boundary`, exit 1 at 5/5). PV-06: **0** `confidence` fields across 28 element kinds vs **143** in `site`.
- **PR-10** — needs the **GE-06 clash detector** (a missing algorithm) plus a roof→walls-beneath subscriber. Roof strandedness is at least *announced* at runtime now.
- **PR-11** — **implement the handler FIRST.** `room.recomputeBoundary` returns empty forward/inverse and `registerCrossHandlers` has zero callers. **Registering a no-op and claiming coverage is the defect, not the fix.**
- **CE-03 / CE-04 — correct the texts, do not over-fix.** Browser I/O and undo are **UNCERTIFIED, not untested**: persistence-client IndexedDB **15/15**, Save/quota/thumbnail **31/31**, `performUndoRedo` + gesture ordering **26/26**, all green. The gap is certification coverage, much smaller than the rows imply.

### §2.5 — PHASE C (~75 % → 100 %) — the long pole

1. **Bar 3, by family.** 98 silent verbs need a normaliser + composed planner; the preview entry
   point is still bare-null (2 null-returning signatures, 0 typed, 0 production producers of the
   typed `PreviewOutcome` constructors). 36 relationships need refusal capability. **C78 §19.1
   forbids partial credit** — plan it as verb-family sweeps, each landing whole.
2. **Roof.** `RoofTypes.ts` has no field that can hold a reference and `schemas/elements/Roof.ts`
   types `boundary` as `Vec3[]`, so **Zod strips a reference in transit**. Roof needs an **L0 schema
   field first** — and `packages/schemas/**` is shared-dangerous, so it is a sequenced, solo change.
3. **Junction re-weld after a move.** Walls still do not extend to re-mitre a corner when a
   neighbour moves. **Untouched all session.** It is the founder's other product promise and it is
   a different subsystem from the slab cascade — investigate, do not assume it is the same bug.
4. **The four NOT-YET-COUNTED predicate families** (C73, one per PR, in this order):
   `segment-segment-intersection` (signature written as `SEGMENT_CROSS_SHAPE`; blocker is proving
   the parametric and cross-product forms are one family) · `polygon-area-and-winding`
   (`polygonSignedArea2D` already canonical; blocker is that a bare `+=` is a weak signature) ·
   `point-to-segment-distance` (entangled with `check-epsilon-policy` E2; note CesiumViewport's
   surviving `len2 > 1e-12` is one of its instances) · `polygon-containment-overlap`
   (**must be counted LAST** — built from the other two, would double-count).
5. **The dark-test ledger to 0** — 137 rows. 57 files under `tests/{parity,visual-diff,contract-44,ci,playwright}` belong to **no runner at all** (5 red in isolation, 24 snapshots written on first run) — that needs a runner **created**, a founder scope call. `packages/webhooks` has **stale compiled `.js` test output checked in** beside green `.ts` twins — stop committing build output.

---

## §3 — LANE BRIEFS, PASTE-READY (launch 6–8 in parallel)

**Every brief must open with this block:**

```
GIT DISCIPLINE (non-negotiable): never git stash; never `git add -A`/`git add .`;
never `git commit --amend`; never `git checkout --` (use `git restore
--source=HEAD -- <path>`). Commit ONLY with `git commit -F <msgfile> --
<explicit paths>` — a bare `git commit` takes the whole shared index including
other lanes' staged files. USE A LANE-UNIQUE MSGFILE NAME: lanes share one
scratchpad dir and a collision once stamped a commit with another lane's
message (L13, commit 99c82e5f). Stage and commit in ONE tight sequence, then
verify content at HEAD. Commit INCREMENTALLY, not at the end — four lanes died
mid-flight last session on an API limit and only committed work survived.

If you are blocked, or the work is bigger than the brief, STOP AND REPORT rather
than guess. A truthful "this needs its own lane" beats a rushed half-fix.

Verify by EXECUTION, never by a commit subject or an inherited claim.
```

| Lane | Owns (disjoint) | Task |
|---|---|---|
| **L1 deploy** | nothing in the tree | §7. Deploy, bundle-proof, ISSUE-LOG L-853, then the browser callout. **Runs alone first.** |
| **L2 recount** | `docs/04-reference/BIM30-GAP-REGISTER.md` | §2.1 + §2.2. Run each gate; face GR-09. |
| **L3 predicates** | `packages/geometry-kernel/**`, `packages/geometry-slab/**`, `packages/core-app-model/**` package.json + `pnpm-lock.yaml` | A2 + A3. GE-02 to 0. **Owns the lockfile exclusively this session.** |
| **L4 dark-tests** | root `vitest.config.ts`, `tools/ga-gate/check-no-dark-test-files.ts` + ledger | A4. Measure-then-repoint. |
| **L5 finishes-audit** | `packages/finish-host-tracker/**` | A7. Audit, fix the OOM, pay its 5 no-empty findings + prevState/seam test, then report the init wiring needed. |
| **L6 empty-drain** | `apps/editor/src/ui/**` (NOT `engine/`, NOT `dataworkbench/`) | Phase B drain, 85 → lower. |
| **L7 schedules** | `apps/editor/src/ui/SchedulePanel/**` + its spec | A5. One-line fix + re-state the STRUCTURAL assertion in the same commit. |
| **L8 reachability** | a NEW gesture-probe under `tools/rac-conformance/` | CE-05. The highest-leverage missing instrument. |

**Shared and dangerous — sequence, never parallel**: `apps/editor/src/engine/{initBusHandlers,initScene,initTools}.ts` · `packages/command-bus/src/*` · `packages/schemas/**` · `pnpm-lock.yaml` (give it to ONE lane).

---

## §4 — GIT DISCIPLINE (each rule cost real work to learn)

1. **`git commit -F msg -- <explicit paths>`**, always. A bare `git commit` swept another lane's 31 staged files into the wrong commit — twice.
2. **`git commit --amend` is banned** in a shared tree.
3. **Never `git stash`** — the stash stack is global across worktrees.
4. **Never `git add -A` / `git add .`**.
5. **Ledger rows are struck in the commit that fixes them** — a fixed row left declared exits 3.
6. **NEW (L13):** **lane-unique msgfile names.** Lanes share one scratchpad directory; a collision stamped `99c82e5f` with a different lane's subject. Content was right, message was wrong, and amending was correctly refused.
7. **NEW (L5 rescue):** **a baseline strike may be paid by ANOTHER lane's uncommitted work.** Commit `11b208ba` struck three predicate rows, but two were paid by the finishes lane's dirty plantools files. Before committing a ledger strike, check *whose* change pays it — and say so in the message.
8. **NEW:** **a gate that "no longer measures" a row is not the same as a paid row.** `check-deterministic-regeneration` exited 3 STALE because line anchors shifted; all 8 usages still existed, so all 8 were **RE-ANCHORED, zero struck** (`f36015e5`). Blanket-striking would have erased 8 real findings.

---

## §5 — KNOWN-GOOD BASELINES (executed at session end, HEAD `abaeef1d` unless noted)

> **If your first run disagrees with this table, something regressed — do not assume the table is stale.**

| Gate / suite | Reading | Path gotcha |
|---|---|---|
| Root tsc | **0 errors** — ⚠ requires `NODE_OPTIONS=--max-old-space-size=6144`; it can **exit 0 while OOM-ing** | — |
| `check:isolation` | **exit 0**, 41/41 baseline | — |
| `test:server` | **613/613** | — |
| `check-prevstate-contract` | **exit 0 CLEAN, hard-0, EMPTY ledger** — zero slack | `tools/ga-gate/` |
| `check-room-aabb-canonical` | **[0] CLEAN, hard-0, no baseline** | `tools/rac-conformance/certification/gates/` |
| `check-predicate-canonical` | **[1] 7/7** (was 53 at session start) | `tools/ga-gate/` |
| `check-constraint-honesty` | **[1] 2/2** (was 14) | `tools/ga-gate/` |
| `check-no-empty-means-unknown` | **[1] 85/85** (was 95) | ⚠ **`tools/rac-conformance/certification/gates/`** — NOT `ga-gate/`. Looking in the wrong dir makes a healthy gate look crashed. |
| `check-move-propagation` | **[1] 3/3** (was 7) | `certification/gates/` |
| `check-graph-write-coverage` | **[1] 2/2** | ⚠ **`tools/ga-gate/`** — NOT `certification/gates/`. The opposite trap. |
| `check-no-dark-test-files` | **[1] 137/137** | `tools/ga-gate/`, registered in `run-all.ts` |
| `check-provenance-export-boundary` | **[1] 5/5** | `tools/ga-gate/` |
| `check-deterministic-regeneration` | **[1] 134/134** (re-anchored) | `tools/ga-gate/` |
| `check-relationship-determination` | **[1] 134** — RED by design, **this is bar 3** | `certification/gates/` |
| `check-xss-guards` · `check-plan-determinism` · `check-topology-survives` | exit 0 · exit 0 · exit 0 | — |
| Suites | core-app-model **823** · geometry-slab **136** · room-topology **156** · geometry-lift **23** · command-bus **73** · command-registry **386** | |
| `apps/editor` | **9 pre-existing failing files / 23 tests** (CesiumViewportClickNoNav, CesiumViewportFrameNoJump, MarketingPages, SiteEntryModel, contextOneReadPerBbox, contextPanRefreshDecision, creationToolShortcuts, murciaSiteDispatch, siteCaptureProvenance) — **do not chase, do not add to** | |
| `schemas` | 1555 pass · **3 pre-existing failures** (water round-trip ×2 = deliberate ADR-0124 refine; view-template `detailLevel` ×1) | |

---

## §6 — RUNNING LANES SO THEY DON'T STALL

**The default failure mode is a lane going silent holding uncommitted work.**

- **Poll by output**: `git log --since=…` and file mtimes. "I launched it" ≠ "it is working".
- **15 minutes with no write = stalled.** Message it: *"commit what is finished now, or report the blocker."* This worked twice last session — one lane woke and committed a 35 KB package it had been sitting on.
- **An API session limit can kill every lane at once.** Four died simultaneously last session. **Incremental commits are the only defence** — everything committed survived, everything uncommitted had to be rescued by the orchestrator.
- **Resuming a killed lane**: tell it exactly what its predecessor left and that the work is **suspect, not trusted**. The best findings come from lanes distrusting their inheritance.
- **Give every lane permission to STOP.** The most valuable outputs last session were honest refusals: a lane that refused a misrouted grant, a lane that refused to enable 5 red test suites, a lane that refused to strike 8 ledger rows that were shifted rather than paid.

---

## §7 — DEPLOY (contract: `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`)

**Production is `aa218a31`/v1270 and predates everything. This is action #1.**

1. **Cover** is already green and recorded as **ISSUE-LOG L-852** (root tsc 0, isolation exit 0, server 613/613, all gates stale-free) at `03356e5a`. **Re-run only if HEAD moved** — it has, to `abaeef1d` (two doc/test-cleanup commits), so a fresh root tsc is cheap insurance.
2. `flyctl apps list | grep builder` — **the builder gets reaped**; a fresh one is minted at 8 GB and needs `--vm-memory 16384`. *(Last session's lane verified 16384 successfully.)*
3. Run with **only** `DOCKER_CONFIG=/tmp/empty-docker-config`. **Add no MSYS exports** (§6.6.1 — the script defends itself; the global export breaks its own `curl`).
4. `bash tools/deploy/fly-bundle-proof.sh <the-SHA-the-script-printed>` — **mandatory**, and it must read **values, not lengths**: 39 characters of garbage passes a length check and once shipped green. *(Expected arg shapes, verified last session: cesium len 257, google len 39, `VITE_GLB_URL=/api/catalog/items/`, `VITE_CONTEXT_TILES_URL=/api/context-tiles/`, both root-relative.)*
5. **"Pushing image done" then a crash ⇒ delivery failed, not the build.** Reference-deploy the pushed tag; **never re-run the full script**.
6. The build/upload phase takes **~15–35 min**. Budget for it; do not start it with a nearly-exhausted context.

### §7.4 — THE BROWSER CHECKS TO GIVE THE FOUNDER

> 🚀 **LIVE — test this:** `<SHA>` at https://pryzm.fly.dev. **Hard-refresh first.**
> 1. **Move a wall** — the slab should follow, **both** the drawn mesh **and** the recorded area (click the slab, read its area in properties; the bug was 36 m² drawn vs 24 m² recorded).
> 2. **Data (F3) → AUDIT → Hierarchy** — the model tree should render, including the **Furniture group**, which C71 §5.2 records as *"has never rendered"*.
> 3. **Move a wall carrying a floor finish / ceiling** — it should re-project **once**, not loop (the §REENTRANT-SET bug, fixed in `f5f312de`).
> 4. **Known NOT fixed:** walls do **not** re-mitre a corner after a neighbour moves. Expected. Phase C.

---

## §8 — THE DOCUMENT MAP

| Doc | What it is | When |
|---|---|---|
| **THIS FILE** | the plan and the opening prompt | first, always |
| [MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) | §-3 the 100 % bar · §-2 the matrix · §1 the counted figure. ⚠ **dirty in the tree** — inspect the partial edit | first, always |
| [IMPLEMENTATION-ROADMAP](BIM30-IMPLEMENTATION-ROADMAP.md) | phases 0R–9 + F; **§3.1 the three bars** | when sequencing |
| [GAP-REGISTER](../../04-reference/BIM30-GAP-REGISTER.md) | **the 82 rows** — the denominator | for the recount |
| [READINESS-GATES](../../04-reference/BIM30-READINESS-GATES.md) | per-gate BUILT / SPECIFIED-NOT-BUILT | when building a gate |
| [ISSUE-LOG](../../04-reference/ISSUE-LOG.md) | L-NNN findings — **latest L-852; next is L-853** | append every founder-reported bug |
| [CERTIFICATION-PLAN](BIM30-CERTIFICATION-PLAN.md) | the harness, verdicts, exit-code order | when touching certify |
| [DEPLOY-CONTRACT-MANUAL-FLY](../../02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md) | §7 above | every deploy |

**Contracts** at `docs/02-decisions/contracts/`; the index `README.md` is the authority on the suite
(**C01–C68 plus C70–C80**). ⚠ **§1 digests C67–C80 only.** C01–C66 have **not** been read in the
sessions that produced this brief; what is known of them comes from `CLAUDE.md`'s summary, **which
has been measurably wrong before**. Before changing anything governed by C01–C66, open that contract.

### §8.1 — FINDINGS LOGGED LAST SESSION (read before re-discovering them)

| # | Finding |
|---|---|
| **L-847** | **RESOLVED** — two rival Data workbenches; founder decided `DataWorkbench.ts` ships. Model tree reachable via **Data F3 → AUDIT → Hierarchy**. AuditBucket **parked, not deleted**. Left-nav second `HierarchyTreePanel` mount still reachability-unverified. |
| **L-848** | `HostReferenceEdge.fallback` is **never refreshed** after authoring. Move-then-**delete** degrades to the authoring-time line while the polygon holds the post-move ring — the divergence the move-path fix killed **survives on the delete path**. |
| **L-849** | A whole `geometry-lift` suite had **never run** (wrong dir *and* wrong suffix, missing both include patterns). Measured dark → measured green (11/11) → then enabled. 9 → 23 tests. |
| **L-850** | Three constraint-rule defects **pinned, not fixed**: all three acoustic RT60 rules compare `>=` while their message says *"exceeds"* (self-refuting at the limit) · `ACOUSTIC_RT60_COURT`'s ≥500 m³ clause is **dead code** · `PLUMBING_ZONE`'s FP exact-tolerance gap gives one shared-stack pair's two rooms **different verdicts**. |
| **L-851** | The root vitest config's **two founding patterns point at a directory that does not exist** — 72 specs / ~1,140 cases never run. Full census: 2,043 test files × 163 runners → 147 dark, 137 after enabling 9 green suites (+115 tests). Five red suites **refused and quarantined** — headline: **ADR-0315 U2.2 typed room predicates are unverified and always have been**. |
| **L-852** | Pre-deploy cover ALL GREEN at session end; **deploy ready-not-run**. |
