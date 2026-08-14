# BIM 3.0 — NEXT SESSION BRIEF · THE PATH FROM ~48 % TO 100 %

> **Purpose**: open the next session at full speed and drive the counted figure to **100 %**.
> **Written** 2026-08-13 at the end of a **57-commit, 16-lane** session · **HEAD** `abaeef1d`
> **Companions**: [MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) ·
> [IMPLEMENTATION-ROADMAP](BIM30-IMPLEMENTATION-ROADMAP.md) §3.1 (the three bars) ·
> [GAP-REGISTER](../../04-reference/BIM30-GAP-REGISTER.md) (the 82 rows)
>
> ⛔⛔ **STOP — THIS HEADER AND §-1 ARE STALE. GO STRAIGHT TO [§11](#11--session-close-2026-08-13-evening--the-fleet-session--80-commits-25-agents), THE 2026-08-13 EVENING FLEET-SESSION CLOSE.**
> §11 is the youngest, fully-executed state and **overrides everything above it, §10 included**.
> The two actions §-1 below calls "first" are **both resolved**: the recount RAN (38/82 counted,
> GR-09 re-opened) and the deploy it refers to LANDED as `517f7a70`. §-1's task list is likewise
> spent — GE-02 is CLEAN at 0, PR-12 and PV-04 are closed, the dark specs are on, the
> finish-trackers are wired, CI-0/CI-1/CI-2 all shipped.
>
> **What is actually owed now** (§11.0 and §11.3 carry the detail): a **restamp of the register,
> which still reads 34/82 and is known-wrong in the pessimistic direction** (counted 38, earned
> ~41 — and the founder rejected two restamp edits without stating why, so **ask first**); a
> **deploy of the ~80 commits HEAD now carries beyond `517f7a70`**; and six founder decisions.
>
> ⚠ Everything from here to §11 is retained as the historical record and as the still-valid
> reference material (§1's contract digest, §4's git discipline, §5's path gotchas, §7's deploy
> contract, §9's 32-prompt assessment). **Read those sections for their content; do not read §-1's
> ordering as a live instruction.**

---

## §-1 — WHAT IS UNFINISHED, STATED FIRST SO IT CANNOT BE MISSED

| # | Unfinished | Evidence | Consequence |
|---|---|---|---|
| **1** | **The deploy did NOT happen.** | `flyctl releases --app pryzm` → latest is **v1270, 3h43m before session end** = `aa219a31`. The deploy lane got as far as builder-verified (16 GB), args shape-checked (cesium 257 / google 39), `GIT_SHA=03356e5a` stamped — then died on the session limit **during the image build**. | **Production runs a build that predates EVERY fix in this session.** Browser behaviour of the slab fix and the model tree is **UNPROVEN**, exactly as it was this morning. |
| **2** | **The final recount did NOT run.** | Lane died on `Not logged in`. Its last executed reading before dying: PV-04 confirmed exit 1 at 5/5. | **The counted figure is not officially stamped.** The register still carries the **mid-session 34/82**. Do not quote any other number until a recount produces it. |
| **3** | ~~Docs lane died mid-edit~~ **RESOLVED 2026-08-13** — the partial edit was inspected and **KEPT**, committed as `b9fdf4b8`. | Discarding it would have made the file **more** wrong: the working-tree text (34/82, 41 %) is sourced to the register's executed §9.0 recount at `7028060c`, which is exactly what the register carries at HEAD and what row 2 above states; the committed text it replaced was `25/82` at `c0a1785c`, already self-labelled STALE. | **None — the tree is clean.** The tracker and the register now agree. Row 2's caveat still stands: that 34 is mid-session and the end-of-session recount has not run. |

**Nothing was lost.** Every lane's *code* is committed and pushed through `abaeef1d`. What is missing
is the deploy, the stamp, and one doc edit.

---

## §0 — PASTE THIS AS THE OPENING PROMPT

```
Read docs/03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md — §10 FIRST (it is
the session close and it OVERRIDES anything earlier it contradicts), then §-1,
then §2.

⚠ THE DEPLOY IS DONE. Production is 517f7a70, live, bundle proof 6/6
(ISSUE-LOG L-853). Do NOT re-deploy at the start of the session.

DO THIS FIRST, BEFORE ANY NEW WORK:
  RECOUNT. The register still says 34/82. Run the gates, restamp
  docs/04-reference/BIM30-GAP-REGISTER.md and its §9.0. Gate-confirmed since
  the last stamp: PR-03, CO-12, GR-18, GE-03, GE-11 (~39). Face GR-09 honestly
  (§2.2) — it may move BACKWARD. Report the counted figure only after a
  recount produces it. Never hand-increment.

THEN, in this order (§10.6):
  1. CI-0 — carry hardValid/hardFailedRules onto LayoutOption (SPEC-49). Small,
     purely additive, and the precondition for EVERY circulation gate: today the
     engine computes the right answer and throws it away at emitGeometry.
  2. ASK ME the house-refusal question (§10.6 item 3). A house storey currently
     CANNOT refuse and ships a 50%-sealed-room plan silently. It is my decision,
     not a code change, and it blocks the house typology.
  3. SURFACE WHAT IS ALREADY KNOWN (§10.2) — the 121 unannounced compliance
     errors, the furnish stage dropped at a 12s timeout, the discarded layout
     verdict, and the "Circulation 100%" badge on a doorless plan (L-869).
     No new detectors needed. Cheapest high-value work on the board.
  4. Unit containment (L-864) — the hard precondition for C81's edit layer.

Then §2 Phase A. Launch the lanes in §3 IN PARALLEL on the partition map.
Enforce §4 git discipline verbatim — every rule there cost real work.

DOCUMENTATION-FIRST STANDS: contracts/specs/ADRs before implementation. C81
(edit layer), SPEC-49 (circulation) and GENERATIVE-QUALITY-MASTER-TRACKER all
landed last session — read them before writing code against them.

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
| **A8** | ⚠ **CARRY-FORWARD — a SECOND programme now has a tracker, and it must NOT move this file's percentage.** [GENERATIVE-QUALITY-MASTER-TRACKER.md](GENERATIVE-QUALITY-MASTER-TRACKER.md) opened 2026-08-13 on its own denominator (**28** = 4 typology packs × 7 readiness gates) after the founder reported the shipped generators are not production-ready. **All three defects are now REPRODUCED BY EXECUTION** ([SPEC-49](../specs/SPEC-49-CIRCULATION-INTEGRITY.md)): `casa-unifamiliar` ships **12 of 24 storeys with an unreachable room** and **11 of 24 doorless** — one with a doorless `Stair`; apartment **7/106** on both; residential **0/34**. Reading: **0 PROVEN · 4 FAILED · 2 CONTESTED · 22 UNPROVEN · 0 GATED** — the two greens were **withdrawn within the hour** when the browser probe (L-859…L-865) contradicted the synthetic sweep; a harness said `residential-building` was clean, the founder watching a real generated building said *"rooms without doors, circulation not good"*. ⚠ **The 28 is known too small**: L-862/L-863/L-864 found generator defects no R1–R7 cell can hold (121 unannounced compliance errors · furnish times out at 12 s and is skipped while lighting fires anyway · generated buildings have no unit containment), held as candidate **R8–R10** outside the denominator until the gate set is ratified as a contract. **Its cells never enter the 82 and register rows never enter its 28** — different questions, different denominators. What it owes next: **`CI-0` first** (the `hardValid` verdict is computed and dropped at the emit boundary, so nothing downstream can refuse a broken plan — every other gate is blocked on it), then the house generator, then R1 keyed by room **id** not display name. **Its Phase 3, the edit layer, is blocked on THIS programme's bar 3** — see the new [C81](../../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md) §8 — so **bar-3 progress is now load-bearing for two programmes, not one.** |

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
| [MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) | §-3 the 100 % bar · §-2 the matrix · §1 the counted figure. ✅ **clean** — the partial edit was kept, `b9fdf4b8` | first, always |
| [GENERATIVE-QUALITY-MASTER-TRACKER](GENERATIVE-QUALITY-MASTER-TRACKER.md) | ⚠ **a DIFFERENT programme with a DIFFERENT denominator** — generator output quality (**28** = 4 typology packs × 7 readiness gates) and, as its Phase 3, the **edit layer**. §-1 says why it must never be folded into the 82. Its Phase 3 is blocked on **this** programme's bar 3 | when the work is *"is the generated design correct?"* rather than *"did the model stay truthful?"* |
| [typology-expansion-roadmap](typology-expansion-roadmap.md) | the multi-typology **vision** (25+ typologies, packs, marketplace). Carries **no status** — the tracker above is its status half | when scoping typology work |
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

---

## §9 — WHAT A USER CAN ACTUALLY DO AT 100 % — 32 REAL SCENARIOS, ASSESSED

> **Founder question, 2026-08-13:** *"After 100/100 — open PRYZM. What could the user do? Could
> they achieve these 32 prompts?"* Assessed one by one below, **against the code that exists**,
> not against ambition.

### §9.0 ⚠ THE MOST IMPORTANT THING ON THIS PAGE: 100 % OF *WHAT*

**The 82 rows do not measure "can PRYZM generate an apartment". They measure "when the model
changes, does PRYZM stay truthful".** They are the *consequence* layer: does a moved wall drag its
slab · does a relationship answer DETERMINED/UNDETERMINED instead of silently guessing · is a
number AUTHORED or COMPUTED or INVENTED · does a refusal say why.

| | What 100 % on the register buys | What it does NOT buy |
|---|---|---|
| **Buys** | Every edit propagates or refuses honestly. Areas, schedules and exports agree with the geometry. Nothing is silently wrong. **You can trust the model enough to sell from it.** | — |
| **Does not buy** | — | **New generative capability.** A typology PRYZM cannot design today, it still cannot design at 100 %. That lives in the **typology packs / executors** — a different axis with its own roadmap. |

**Two independent axes. Both are needed for the 32 prompts. Only one of them is what "100/100" counts.**

- **AXIS 1 — TRUST** (the 82 rows + the three bars). Nearly every *modification* prompt depends on this.
- **AXIS 2 — GENERATIVE REACH** (the executors). Nearly every *generation* prompt depends on this.

**Measured 2026-08-13**, `packages/ai-host/src/workflows/` contains: `apartmentLayout` ·
`houseLayout` · `residentialBuilding` · `officeBuilding` · `officeFurnish` · `furnishLayout` ·
`ceilingLayout` · `lightingLayout` · `daylight` · `Generate3Options` · `PlanCritique` ·
`VoiceCommand`. **There is no `townhouse`, no `housingScheme`, no `masterplan`, no `courtyard`.**

### §9.1 — THE ONE STRUCTURAL LIMIT THAT DECIDES 16 OF THE 32 PROMPTS

Every prompt in categories **2, 4, 6 and 8** (MODIFICATION) asks PRYZM to **change an existing
design and keep everything else valid**. That is exactly what **bar 3** measures, and its reading is:

> **4,100 cells (100 consequential verbs × 41 relationships): 4,018 SILENT · 72 refusal-BLOCKED ·
> 10 structurally-answerable.** 98 of 100 verbs have **no normaliser and no composed planner**;
> the preview entry point is still bare-null.

**In plain words: PRYZM can today *make* a design far better than it can *modify* one.** A
modification needs the system to work out what its change breaks — which walls, slabs, doors,
rooms, schedules, daylight results and areas are now wrong — and either fix them or say it cannot.
Until bar 3 is green that reasoning is mostly absent, so a modification either regenerates from
scratch (losing your work) or leaves stale artefacts behind.

**Corollary worth holding onto:** *shipping bar 3 is worth more commercially than any new typology*
— it converts 16 of these 32 prompts from "no" to "yes" at once, and it is the difference between
a generator and a design tool.

### §9.2 — THE 32 PROMPTS

**Legend** — ✅ **YES at 100 %** · 🟡 **PARTIAL** (works, with a named gap) · 🔴 **NO** (needs work
that is *not* in the 82 rows or the three bars — a new executor, engine or rule set).

#### 1. APARTMENTS — GENERATION · *the strongest category in the product*
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **1** | 2-bed ~85 m² in envelope | ✅ **YES** | `apartmentLayout` (D-TGL, P1–P9, 67 tests) + the normative `programRules` room DB + `furnishLayout` + `daylight`. Area targeting, room mix, circulation minimisation and daylight scoring all exist. |
| **2** | 5 types, 50–120 m², studio→4-bed | 🟡 **PARTIAL** | Each type generates. **"Consistent architectural language" is not a modelled objective** — no cross-unit style constraint. You get five good plans, not a designed family. |
| **3** | Apartment behind a façade bay | 🟡 **PARTIAL** | Window-aware placement exists (`wallsAndDoors`, default door/window resolver) and daylight-depth fields drive room placement. **Gap:** the façade *bay* is not a first-class input — you align to openings, not to a bay rhythm. |
| **4** | 110 m² family, 3-bed, terrace, cross-vent | 🟡 **PARTIAL** | Zoning, two bathrooms, storage, daylight: yes. **Terrace is weak** (outdoor space is not a modelled room type) and **cross-ventilation is not computed** — daylight is, airflow is not. |

#### 2. APARTMENTS — MODIFICATION · *blocked on bar 3*
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **5** | 75 → 90 m², absorb adjacent area | 🔴 **NO** | Boundary surgery preserving entrance, grid and openings. `RECONCILABLE_TYPES` is `['Wall','Slab']` — columns, stairs, doors and furniture on a changed plate are classified **STRANDED** (C72). |
| **6** | 2-bed → 3-bed, same envelope | 🔴 **NO** | Topology re-partition of an *existing* plan. The only honest path today is regenerate-with-new-brief, which discards your edits. |
| **7** | Improve layout, same envelope | 🔴 **NO** | Needs *critique → targeted edit*. `PlanCritique` exists and can score a plan — **the edit half is the silent-verb problem**. It can tell you what is wrong and not fix it. |
| **8** | Combine two apartments, reuse wet areas | 🔴 **NO** | Hardest of the four: cross-unit merge, party-wall removal, service-zone reuse. Needs bar 3 **and** junction re-weld (§2.5 item 3 — walls still do not re-mitre after a move). |

#### 3. HOUSING — GENERATION · *strong for a single house, absent at scheme scale*
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **9** | 180 m² 3-bed detached house | ✅ **YES** | `houseLayout` with spine-first upper-floor logic, containment checks, stair placement and garden orientation. Well-tested; known defects (stair fragmentation, roof clash) logged and largely closed. |
| **10** | 3-storey 150 m² narrow townhouse | 🟡 **PARTIAL** | No `townhouse` workflow — you would drive `houseLayout` on a narrow plot. **Vertical circulation on a narrow plate is the known weak spot** (§CORRIDOR-STAIR-CONTIGUITY: stairs fragment the plate). Roof-level daylight not modelled. |
| **11** | Scheme of 12 houses on a site | 🔴 **NO** | **No site-scale multi-building placement engine exists.** Plot subdivision, unit orientation, shared vs private outdoor space, pedestrian networks — none built. A new engine ("masterplan pack"), not a gap in the 82 rows. |
| **12** | Compact 100 m² 3-bed homes, repeated | 🟡 **PARTIAL** | One home: yes. **"Across the scheme" is the prompt-11 gap** — repetition with consistent character is not modelled. |

#### 4. HOUSING — MODIFICATION
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **13** | 2-bed → 3-bed house, same envelope | 🔴 **NO** | Same root as prompt 6. |
| **14** | Extend house 25 m² to garden | 🔴 **NO** | An extension is a *consequential* geometry change: new walls must weld to existing ones (**junction re-weld, untouched**), the slab must extend (works now), the roof must follow — **roof has no reference field and needs an L0 schema change** (§2.5 item 2). |
| **15** | Optimise scheme, same site area | 🔴 **NO** | Needs prompt 11's engine *plus* modification. Furthest of all 32 from shipping. |
| **16** | Change housing mix 20×2-bed → mixed | 🔴 **NO** | Same. |

#### 5. RESIDENTIAL BUILDING — GENERATION · *real capability, with named blockers*
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **17** | 8-storey, ~8,000 m², ~80 apartments | 🟡 **PARTIAL** | `residentialBuilding` does shared core + N apartments/floor + corridor with plate partitioning. **Known blocker: the corner-cell problem** — doors cannot be routed in cells with two external faces, so some plates fail. Communal spaces are not a modelled programme. |
| **18** | 5-storey courtyard, ~60 apartments | 🟡 **PARTIAL** | No courtyard typology; the plate partitioner assumes a solid floorplate, not a ring. **Dual-aspect maximisation is not an objective function** — it is an outcome you may or may not get. |
| **19** | 6-storey urban, responding to street + neighbours | 🟡 **PARTIAL** | **Where PRYZM is genuinely differentiated:** real context (3D site tiles, neighbour heights, terrain), real envelope law (Barcelona/Madrid/Murcia, Portugal in progress), street-width-driven height. Balconies and public-realm relationship are not modelled. |
| **20** | From programme: 40×1-bed, 30×2-bed, 20×3-bed | 🟡 **PARTIAL** | The typology brief schema is brief/slider-driven, so the *input* is expressible. **Core positioning is not optimised** — it is placed, not solved for. |

#### 6. RESIDENTIAL BUILDING — MODIFICATION
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **21** | +15 % apartments, same footprint | 🔴 **NO** | Whole-building re-partition holding quality floors. Bar 3 plus a constrained optimiser that does not exist. |
| **22** | Add two floors, keep façade language | 🔴 **NO** | **The clearest single example of why bar 3 matters.** Adding a level must reconcile columns, stairs, cores, roof and façade. `RECONCILABLE_TYPES` covers **Wall and Slab only**; every other type is classified **STRANDED by design and announced at runtime** — so PRYZM honestly tells you it did not move them. Correct, and still not the feature. |
| **23** | Optimise floorplate, keep core + grid | 🔴 **NO** | "Improve without breaking" — bar 3 exactly. |
| **24** | Change apartment mix, same GFA | 🔴 **NO** | Same. |

#### 7. OFFICE — GENERATION
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **25** | 6-storey ~12,000 m² office building | 🟡 **PARTIAL** | `officeBuilding` + `officeStoreyFloors` exist. **Programme depth is the gap**: meeting rooms, quiet rooms and collaboration zones need normative rules the room database only partly has (missing-room-types is a live queue item). |
| **26** | Flexible 1,800 m² floor for ~150 people | 🟡 **PARTIAL** | `officeFurnish` exists. **The occupancy chain (people → desks → area → support ratio) is not modelled** — you can furnish a floor, not solve one for a headcount. |
| **27** | Hybrid office: café, event space, amenities | 🔴 **NO** | Those room types are **not in the programme rules database**. Without normative rules a generator invents dimensions — the exact C75 "never invented" failure. Needs rule authoring first: cheap, unglamorous, high value. |
| **28** | 5-storey office around a courtyard | 🟡 **PARTIAL** | Same courtyard limitation as prompt 18. |

#### 8. OFFICE — MODIFICATION
| # | Prompt | Verdict | Why |
|---|---|---|---|
| **29** | Cellular → hybrid workplace | 🔴 **NO** | Demolition plus re-partition of an existing fit-out. Bar 3. |
| **30** | 120 → 160 people, same area | 🔴 **NO** | Bar 3 **plus** the occupancy chain from prompt 26. |
| **31** | Make floor flexible (movable partitions) | 🔴 **NO** | Needs a **movable/demountable partition element type** that does not exist. A new element kind makes C67/C68 mandatory. |
| **32** | Extend office by 2,000 m² | 🔴 **NO** | Same class as prompt 14 (extension = consequential), at building scale. |

### §9.3 — THE SCORE, AND WHAT IT SAYS

| | ✅ YES | 🟡 PARTIAL | 🔴 NO |
|---|---|---|---|
| **All 32 prompts, at 100 % of the current programme** | **2** | **12** | **18** |
| Generation prompts (1–4, 9–12, 17–20, 25–28) | 2 | 12 | 2 |
| **Modification prompts (5–8, 13–16, 21–24, 29–32)** | **0** | **0** | **16** |

**Read the bottom row twice.** At 100 % of the 82 rows and the three bars, **generation is 14 of 16
working or partly working — modification is 0 of 16.** Not because modification is harder to
*design*, but because modification is where **truth** is required, and truth is what the 82 rows and
bar 3 are building. **Finishing bar 3 is what flips that row.**

### §9.4 — WHAT THE USER CAN HONESTLY DO ON DAY ONE OF 100 %

Open PRYZM, and this works end to end, on real land, with numbers you can defend:

1. **Pick a real site** anywhere there is a rule pack (Barcelona, Madrid, Murcia; Portugal in progress) — real terrain, real neighbours, real cadastral parcel.
2. **Get a legally-reasoned envelope** — or an honest refusal naming the missing instrument, never a guess (C63: a refusal is a correct answer).
3. **Generate a residential building, a house, or an office** inside it, with rule-checked rooms, furniture, ceilings and lighting.
4. **Get real analysis** — daylight and solar hours computed, not estimated.
5. **Change something and trust the result** — move a wall and the slab follows in both the drawing *and* the recorded area; anything the system cannot determine says so with a typed reason instead of silently guessing.
6. **Export and schedule** with confidence that the numbers match the geometry.

**What they still cannot do:** ask PRYZM to *improve, convert, combine, extend or re-mix* an
existing design. For that they open the model and edit by hand — with the difference that, at
100 %, **their hand edits stay consistent**. That is precisely what the 82 rows buy.

### §9.5 — THE THREE INVESTMENTS THAT UNLOCK THE MOST

| Rank | Investment | Unlocks |
|---|---|---|
| **1** | **Bar 3 to green** (Phase C — verb families through normaliser + planner; relationship refusal arms) | **All 16 modification prompts.** The highest-leverage item in the programme. |
| **2** | **A masterplan / multi-building pack** (plot subdivision, orientation, shared vs private outdoor space, pedestrian networks) | Prompts **11, 12, 15, 16** — the whole housing-scheme category, today a hard no. |
| **3** | **Programme-rule authoring** (café, event, amenity, quiet room, collaboration; the occupancy→desks→area chain; courtyard/ring plates) | Prompts **26, 27, 28, 18** — and it is the **cheapest** of the three: rule authoring, not engine building. |

> **The one-line answer to the founder's question:** at 100 % PRYZM becomes a **trustworthy
> generator** — it designs well and never lies about what it did. It becomes a **design partner you
> can argue with** only when bar 3 is green.

### §9.6 — THE STRATEGIC READ: WHAT THE 32 PROMPTS ACTUALLY REVEALED

> **Founder question:** *"Should new capabilities go into the implementation plan, or was this
> wrong expectations / wrong wording / wrong scope?"* Assessed honestly, the answer is **mostly the
> first** — and it exposes a hole that §9.1 above understates. Recorded here so the correction is
> not lost.

#### §9.6.1 ⚠ THE CORRECTION TO §9.1 — BAR 3 IS NECESSARY BUT NOT SUFFICIENT

§9.1 says the 16 modification prompts are "blocked on bar 3". **That is true and incomplete, and
the difference is a whole missing workstream.**

| | What it does | What it does NOT do |
|---|---|---|
| **Bar 3 (C78 consequence)** | Makes a modification **SAFE** — every affected element is determined, or refused with a typed reason. Nothing goes silently stale. | Decide **WHAT to change.** |
| **A modification/edit engine** *(does not exist, is not in the plan)* | Decides that "2-bed → 3-bed" means split the larger bedroom, relocate one door, re-route the corridor, preserve the wet stack. | — |

**PRYZM's plan has generation engines** (D-TGL apartments, D-FLE furniture, D-CE ceilings, house,
residential-building, office) **and a trust layer** (BIM 3.0, the 82 rows, the three bars).
**It has no EDIT layer.** There is no workstream anywhere in the roadmap whose subject is
*transforming an existing design while preserving intent*.

That is the real finding. Bar 3 green + no edit engine = a tool that will faithfully tell you it
does not know how to convert your apartment.

#### §9.6.2 — THE FOUR THINGS THAT SHOULD ENTER THE PLAN

| # | New workstream | Why it is real, not a wording problem |
|---|---|---|
| **1** | **The EDIT ENGINE (D-EDIT)** — transform-with-intent: split/merge rooms, re-partition a plate, absorb adjacent area, extend an envelope, re-mix a unit schedule. Built ON bar 3, not instead of it. | **An architect's working week is mostly modification, not generation.** You do not design a building once; you iterate it fifty times. Every one of the 16 failing prompts is an ordinary Tuesday. This is the single largest gap between what PRYZM does and what the job is. |
| **2** | **PROGRAMME-RULE AUTHORING** — café, event space, amenity, quiet room, collaboration zone; the occupancy→desks→area→support-ratio chain. | **Cheapest item on this page and it is pure data.** Failing prompt 27 for want of a room-size table is not an engineering limit, it is an unfilled spreadsheet. Should be pulled forward ahead of engine work. |
| **3** | **RING / COURTYARD PLATES** — the partitioner assumes a solid floorplate. | Courtyard blocks are a **dominant European residential typology**. Not exotic; missing. Blocks prompts 18 and 28. |
| **4** | **AN EXPLICIT DECISION on cross-ventilation / airflow** (prompt 4) | Daylight is computed; airflow is not. This is a real new capability (CFD-lite) with real cost. **Decide it yes or no in the open** — an unstated "no" reads as a defect every time someone asks. |

#### §9.6.3 — WHAT WAS GENUINELY WRONG EXPECTATION OR SCOPE (be honest about these too)

| Prompt | Verdict on the ask itself |
|---|---|
| **11, 15, 16** — housing schemes, site optimisation, scheme re-mix | **WRONG SCOPE, not a gap.** This is masterplanning / urban design — a different product from a BIM editor. It may well be a future PRYZM product; it should be an explicit *product* decision, not an item quietly failing on a BIM roadmap. |
| **2, 12** — *"consistent architectural language"* | **WRONG WORDING.** Nobody has operationalised aesthetic consistency, and a tool claiming to would be lying. **Reframe the ask** as "shared parameter set + repeated unit types + a common façade rule" — that IS buildable and is most of what the founder actually means. |
| **31** — movable partitions | **TRIVIAL BY COMPARISON** — an element-library/system-type gap, not design reasoning. Cheap, and it makes prompt 31 flip on its own. |

#### §9.6.4 — THE ONE-PARAGRAPH STRATEGIC FINDING

**PRYZM has been built generation-first; the market asks modification-first.** The 32 prompts are
not a wishlist — they are a fair description of an architect's week, and they split 50/50 between
the two. We are strong on the half that wins demos and absent on the half that wins renewals. The
correct response is **not** more typologies (a townhouse generator wins nothing). It is:
**(a)** finish bar 3 so modification can be *safe*, **(b)** open a D-EDIT workstream so it can be
*intelligent*, **(c)** spend a cheap week on programme rules to stop losing prompts to missing
tables, and **(d)** decide masterplanning and airflow in the open, as product scope, rather than
letting them read as defects.

---

## §10 — SESSION CLOSE 2026-08-13 · THE BROWSER TOLD US MORE THAN THE GATES DID

> Written after the deploy landed and the founder tested it live. **Everything above §10 was
> written before that test. Where they disagree, §10 wins** — it is OBSERVED (C75), the strongest
> evidence class for anything a user can see.

### §10.1 — DEPLOY: DONE. `517f7a70` IS LIVE.

`https://pryzm.fly.dev` · bundle proof **6/6, values read** · `GIT_SHA` verified
`517f7a7080e5992086d03bc678afe688fc521766` · `/api/health/live` ok · recorded **L-853**.
**§-1 item 1 is CLOSED.** It took three attempts; both failure causes are in L-853 and both recur:

1. **STALE LOCKFILE** — `pnpm-lock.yaml` declared a dependency `finish-host-tracker`'s
   `package.json` had dropped. The Docker build runs `--frozen-lockfile` and fails closed.
   **RULE: a lane that edits any package.json re-syncs the lockfile IN THE SAME COMMIT.**
2. **§6.5.6 HALF-APPLIED** — the npipe fix is TWO commands. Only `mkdir` was run; the
   `echo '{}' > /tmp/empty-docker-config/config.json` was skipped, so flyctl still resolved the
   Windows named pipe from the context file. **Both halves, every time.**

### §10.2 ⚠ THE PATTERN OF THE SESSION — PRYZM FINDS PROBLEMS AND DOES NOT SAY

Four independent instances, measured the same day. **This is one defect class, not four bugs.**

| # | What PRYZM knew | What the user saw |
|---|---|---|
| 1 | `Compliance overlay: 121 error, 0 warning room(s) tracked` on a generated building (and `2 error` on a 10-wall manual test) | The Validate panel DOES show them (founder confirmed). But **both PROACTIVE channels default off**, so nothing tells the user to go and look. **L-862** |
| 2 | `[lighting-layout] §CHAIN-TIMEOUT — no furnish.layout-executed within 12000 ms — firing lighting anyway` | A finished-looking building with **0 furniture** and no warning. |
| 3 | The layout engine computes `hardValid` / `hardFailedRules` **correctly** for every rule (reach · circulation · served-through · corridor-stair · corridor-hall) | The verdict is **dropped at the `emitGeometry` boundary**. A caller that wanted to refuse cannot see it. |

### §10.2b ⚠⚠ THE FINDING OF THE SESSION — A GATE WENT GREEN *BECAUSE OF* UNREACHABLE CODE

`check-move-propagation` arms **A5/A6 (floor-finish, ceiling) now print ✓**. They count *consumer
files*. The count moved **0 → 1**. The one consumer is `packages/finish-host-tracker` — which is
**wired into nothing** (grep confirmed zero sites repo-wide; no `package.json` declares it). Both
rows were struck from `declaredFindings` as **PAID**. **They were not paid.**

> **A gate built to detect unreachable code was satisfied by authoring MORE unreachable code**, and
> its own output still prints *"machinery present, capability unreachable"* beside the green tick.
> **Those two ledger rows are a FALSE GREEN and must be re-opened.** This is why the founder sees
> floor finishes and ceilings not follow a moved wall while the gate says they do.
>
> **The general lesson, and it belongs in every gate review from now on: a gate that counts
> ARTEFACTS can be satisfied by producing artefacts. Only a gate that counts REACHED BEHAVIOUR
> cannot be gamed — including accidentally, by an honest lane.** Cross-reference CE-05.

> **The cheapest, highest-value work in the whole programme is not a new engine. It is making
> PRYZM say what it already knows.** Every one of these four is a surfacing fix, not a detection
> fix. Contrast the envelope panel, which gets this exactly right in production today
> (*"within the limits that could be checked · indicative only, not a compliance determination ·
> NO LIMIT SET"*). **That is the standard the other four must meet.**

### §10.3 — CIRCULATION: MEASURED, PER TYPOLOGY (SPEC-49 · L-854…L-858)

| Defect | apartmentLayout | houseLayout | residentialBuilding |
|---|---|---|---|
| Unreachable room | **7 %** (7/106) | **50 %** (12/24) | **0 %** (0/34) |
| Room with no door | **7 %** (7/106) | **46 %** (11/24) | **0 %** (0/34) |
| Furniture blocks a door | 0 % vs the solver's box · **1 % vs the real swing arc** (3/288); production rate **UNPROVEN** | | |

**Two corrections to the founder's report, produced by measurement:**
- **Defects 1 and 2 are ONE defect.** The failing sets are *identical* on apartment and 11-of-12 on
  house. It is not "the corridor fails to reach a doored bedroom" — **no door was ever emitted**.
  One victim was a doorless **Stair**.
- **residentialBuilding is CLEAN at 0 %**, affirmatively measured — matching the founder's own
  observation that the rectangular-footprint building "looked better".

**ROOT CAUSE — the detection is not missing, the REFUSAL is.** `§TOPO-HARD-REJECT-ALL` ships the
least-bad **hard-invalid** candidate by design, and on the house path structured rejection is
**disabled outright** (`isHousePath` is always true for a house storey). Same engine, same door
router, one fewer refusal — that is the entire 50 %-vs-7 % gap.

**A METHOD NOTE THAT SAVED THE NUMBER:** the furniture probe's first run reported a clean 0/288.
The C70 §5.6 negative control caught it as a **FALSE ALL-CLEAR** — a struct-field mismatch
(`{x0,z0}` vs `{minX,minZ}`) that **Vitest does not typecheck in test files**. Watching the check
go red is the only reason that 1 % is real. *Never trust a green arm you have not watched fail.*

### §10.4 — THE MODEL TREE: FIXED, AND IT EXPOSED A BIGGER GAP

**L-847 is browser-CONFIRMED.** `[DataWorkbench] Mode → full` · `[DataCommandCenter] Hidden` ·
`Bucket → audit / Tab → hierarchy`, rendering real rooms with real areas (Corridor 11.9 m²,
Living Room 25.0 m², Bedroom 12.6 m² …). **Close it.**

**But the tree header reads "Unassigned rooms on Level 01."** Every room sits flat under its level:
Corridor, Kitchen, Living Room, Bathroom, Bedroom 1, Bedroom 2, then *another* Living Room,
Kitchen, Bedroom. A building generated as five apartments per floor produces rooms with **no unit
containment** — nothing in the model knows which rooms form an apartment. `+ Unit` exists as a
manual affordance; the generator never uses it. The generator also never triggers the hierarchy
auto-setup it already offers, and ships the building object with `BUILDING USE —`, `STOREYS —`,
`No template assigned` — all three of which it knew.

> **⚠ THIS IS A HARD PRECONDITION FOR C81.** "Combine these two apartments" and "convert this
> 2-bed to a 3-bed" are meaningless instructions to a model with no concept of an apartment.
> **Unit containment must land before the edit layer, not alongside it.**

### §10.5 — THE THREE PROGRAMMES, AND THE RULE THAT KEEPS THEM HONEST

| Programme | Measures | Denominator | Home |
|---|---|---|---|
| **BIM 3.0 — TRUST** | does the model stay truthful when it changes | the **82 rows** + the three bars | `BIM30-GAP-REGISTER.md` |
| **GENERATIVE QUALITY** | is the generated output fit to ship | **its own**, do not merge | `GENERATIVE-QUALITY-MASTER-TRACKER.md` |
| **THE EDIT LAYER** | can an existing design be transformed with intent preserved | contract-defined | `contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md` |

**NEVER fold one denominator into another.** "X/82" means *trust*, and a generator defect counted
there destroys the meaning of the number. They cross-reference; they do not merge.

**C81 §8 states bar 3 as a HARD PRECONDITION** — an edit engine cannot be built on a model that
does not know what its changes break. The founder's ordering is therefore also the correct
engineering ordering: **fix the generators → expand typologies → build the edit layer.**
Expanding typologies before circulation correctness would multiply one defect across school,
museum and hospital.

### §10.6 — NEXT SESSION, IN ORDER

1. **RECOUNT** (§-1 item 2, still owed). The register still says **34/82**. Gate-confirmed since:
   PR-03 · CO-12 · GR-18 · GE-03 · GE-11 → ~39. **Face GR-09 honestly (§2.2) — it may move
   backward.** Never hand-increment.
2. **CI-0 — carry `hardValid`/`hardFailedRules` onto `LayoutOption`.** Small, purely additive,
   changes no behaviour by itself, and is **the precondition for every circulation gate**. Today
   the engine computes the right answer and throws it away. Highest leverage in SPEC-49.
3. **A FOUNDER DECISION, not a code change:** a house storey currently **cannot refuse**. Either it
   refuses and says why, or it ships with a blocking banner naming the sealed rooms. **Silently
   shipping a plan the engine knows is broken is the one option that should be off the table.**
4. **Surface what is already known** (§10.2): default the compliance overlay ON or promote its
   errors; make the furnish `§CHAIN-TIMEOUT` report a dropped stage instead of advancing silently;
   verify `ConflictResolutionDialog` actually opens.
5. **Unit containment** (§10.4) — the C81 precondition.
6. Then Phase A as written in §2.3: GE-02's last 7 · L-851's 72 dark specs · PR-12's one-liner ·
   `certify.ts` enrolment of the now-green room-aabb gate · the `finish-host-tracker` audit
   (its trackers are **still unwired into any init path**, which is why floor finishes and
   ceilings do not follow a moved wall — machinery present, capability unreachable, C70 §4.2).

### §10.7 — WHAT IS PROVEN TO WORK IN PRODUCTION (say this too)

Perimeter walls + slab: **move a wall, the slab follows — mesh AND recorded area** (the harness
claim is now browser-confirmed). **Walls extend — but only in one narrow case, now precisely bounded (L-859).** Walls in the OUTER
LOOP of a pick-walls slab sketch do extend: `SlabWallConnectivityService` welds neighbour endpoints
and emits `CASCADE_WALL_BASELINE`. The **mitre pass (`WallJoinResolver`) is genuinely untouched** —
the service suppresses itself while it runs. So §2.5 item 3 is **NARROWED, not struck**; still
unmeasured are non-slab walls, `FreeLineEdge` neighbours (explicitly skipped), inner loops, and
true mitre geometry. ⚠ **My `scope=[wall]` explanation for the finish defect was a RED HERRING** —
a partition IS a wall. The real mechanism: the graph is keyed on **slab-loop membership**, so a
polyline partition belongs to no loop and receives no cascade. **One cause, two symptoms** (L-861). Envelope: `SOLVED envelope → 1 solid,
confidence=block-constructed, maxHeight 22.4 m`, `FRAME VERDICT: CONSISTENT`. Ceilings: 22/22 rooms
per level. Lighting: 24/24 rooms, 51 fixtures. Room tags, door swing arcs, window symbols, stair
symbols and hidden-line removal all inject correctly into plan views.

**PRYZM generates a real building on real land with real law. What it does not yet do is tell you
what is wrong with it, or let you change it.**

---

## §11 — SESSION CLOSE 2026-08-13 (EVENING) · THE FLEET SESSION — ~80 COMMITS, 25 AGENTS

> **Where §11 disagrees with anything above it — §10 included — §11 wins.** Everything here is
> executed, committed, cited by SHA.

### §11.0 — READ FIRST

1. **THE DEPLOY WAS NOT RUN.** Production is still `517f7a70`. HEAD carries ~80 commits of
   verified work. §7 applies verbatim; browser checks in §11.5.
2. **THE REGISTER STILL SAYS 34/82 — KNOWN-WRONG, PESSIMISTIC.** Executed recount this session:
   **38/82** (+PR-03, CO-12, GR-18, GE-03, GE-11; **GR-09 RE-OPENED** as §2.2 predicted, narrowed
   to `sitsOn` — the `joinedTo` half is now false). Earned since, unstamped: GE-02, PR-12, PV-04
   → **~41/82 (50%)**. ⚠ The founder REJECTED two restamp edits without stating why — ASK before
   touching `BIM30-GAP-REGISTER.md`, then stamp from fresh gate runs, never from this paragraph.
3. **THE GATE SUITE RAN ZERO GATES IN CI FOR A DAY** (incomplete newly-measured entry blocked
   `run-all.ts` pre-execution). Repaired `64edbc8e`; full exit-2/3 triage done; most cleared (§11.2).

### §11.1 — LANDED, BY PROGRAMME

**TRUST:**
- **CI-0** `1559275e` — `LayoutOption.circulation`; THREE room sets never merged (unreachable ≠
  unrouted ≠ doorless), keyed by ID never name.
- **GE-02 53→0 CLEAN**, gate deleted its own baseline. Kernel edge-set body `faf52bae` ((k,k−1)
  pairing bit-identical, deliberate); HiddenLineRemoval multi-loop preserved `51f89b0b`.
- **BAR 3 MOVED: 134 → 132; structurally-answerable cells 10 → 20** (`e34d2543`) — `door.move` +
  `window.move` landed WHOLE (C78 §19.1) as normaliser rules + registry entries, ZERO new planner
  machinery (§PLANNER-REGISTRY-GENERIC's predicted extension). Reaching verbs now
  wall.move/wall.create/door.move/window.move. The 36 refusal-BLOCKED relationships are the other
  half — refusal-bearing readers in `SemanticGraph.ts`, untouched.
- **PR-12** `befb4244` (canonical geometry-event family; structural spec now SPIES real
  registrations). **PV-04 5→0 CLEAN** (IFC pset; absence-by-name inside DXF/PDF artefacts).
- **A5/A6 HONESTLY PAYABLE**: `5b36fad5` wired finish-host-tracker (reached: wall +2 m → floor
  22.04→33.64 m², once). Re-strike the two rows citing that SHA; the arm itself still counts
  files and should move to reached behaviour.
- **`[]`-drain 85→73** (12 paid + 2 reasoned DECLINES `935bcf8f`; remaining rows listed in the
  L-EMPTY report — houseExecDiagnostics ×8 is the largest).
- **Refusal identity** `10e1c975` — minted `CanPlaceRefusalCode` (closed 6-member union) in
  WallOccupancyStore; gate 89→88 exit 0.
- **structuredClone→produceWithPatches: BOTH new files done** (`476c4b06`/`42d1594c` stair,
  `34f83dda`/`435b07f1` rooms; byte-equal round-trip pins green against OLD code first; gate
  135→129, exit still 3 on OTHER lanes' 10 remaining uses in the two MODIFIED boundary commands —
  the migration shape + `PatchSnapshot.ts` landing zone are proven, follow the pins).
- Epsilon roles: `RECOMPUTE_IDENTITY_M` `f580a721`; WallMoveReweld→EPSILON_ZERO `2b7737bb`.
- **+1,433 tests** `2f374805` (dark ledger 137→65); certify runs 20 gates `beed92b0`.

**GENERATIVE QUALITY:**
- **CI-2 gate** `6c065bb1` — drives 166 real generator runs; 18-row ledger (7/106 · 11/24, four a
  doorless Stair · 0/34). First CI gate on generator output. Blind-comparator proofs by mutation.
- **CI-1** `c6ed8618`+`30fae370` — house names sealed rooms. Banner carries a FOURTH set
  (built-plan reachability) because the engine's verdict reads clean over two measured unwalkable
  cases (residual-fill islands; stair-as-BFS-root). Report REQUIRED; undefined → not-measured,
  never sound. UI toast branch was committing at close — VERIFY (`HouseLayoutExecutor` ~1843 is
  the last silent-ship surface).
- **§10.2 SURFACING COMPLETE** (8 commits): three non-emitting furnish paths emit typed outcomes;
  §CHAIN-TIMEOUT double-fire killed; lighting stamps basis + disclosure; WARN "computed WITHOUT
  furniture". Root cause: 12 s was UNSATISFIABLE (L-716 class). FOLLOW-UP: extend `PryzmEventMap`
  (runtime-composer), delete the annotated casts.
- **UNIT CONTAINMENT SHIPPED** (→`806292f3`): rooms stamped `unitId` AT BIRTH; hierarchy from
  existing verbs; NO partOf write (the ADR is still owed and now louder). Only residential;
  house/apartment/office still ship flat rooms.

**PHASE C:**
- **Junction re-weld MEASURED + ENGINE LANDED** (`a370cbed`, `81e35360`): L-corner gap 1.000 m,
  no re-mitre; T 1.100 m; DIFFERENT breakage from the slab cascade. `computeMoveReweld` 11/11
  with refusal guards (CLAMP-COSHARE slides, over-extension, degenerate stubs). REMAINING: the
  move-commit dispatch (joinedTo partners → ONE CascadeWallBaselineCommand, slab-service latch
  pattern; mechanism in the instrument header). NB: the dev "hang" was vitest's 2–7 min import
  phase on a saturated machine; tests run in 93 ms.
- **PR-10/GE-06 slice** `83c82c02` (13 oracle tests; subscriber point:
  `initWallLevelSubscribers.ts:39-57`). GE-06-general still missing.
- **H6 gesture probe** `b32d56ff` — **all 30 toolbars have ZERO importers; 267/280 toolbar verbs
  dispatch into NOTHING** (only the 4 §C-B1 hand-registered resolve — the probe's own validation).
  No baseline until the founder's mount-or-delete.
- PR-11 OPEN by recorded decisions (F-1.4 + R2), but `c5ca3dd9` killed the silent no-op seam and
  fixed a real bug: 100% of wall→room follow-ons dropped as FALSE CYCLES (payload carried the
  root wall's id).
- Predicate families (segment-intersection, area-winding) were committing at close — VERIFY;
  L-PREDFAM owed 3 epsilon-ledger strikes in its commits.
- **Compile roots** (4 commits `ccef72e9`/`3977cf95`/`62f9b504`/`8ff72e7d` + schemas `6e1df658`):
  the window-global root recurred in 23 of 27 failing packages. ⚠ HONEST SWATH CORRECTION: the
  roots are ~11 of ~1,800 errors per package — NO package flips PASS from them alone; the bulk is
  latent `noUncheckedIndexedAccess` debt (top: PlanViewAnnotationRenderer 103, WallJoinResolver
  86, SelectionManager 73) masked at root by the flag being off. Two triage citations DISPROVEN
  by measurement (`AiPlane.ts:169` — no such error; `epwParser.ts:86` — clean; the real
  climate-host root was `liveNormalsAdapter`). `polygonOffset.ts:333` one-liner deferred
  (conditional spread; file was contended at close).
- CE-03/04 measured (15/15 · 48/48 · 26/26 — EXCEEDS the rows); stale cert pin fixed `d27bb92b`;
  drop-in row texts in the L-CETEXT report. NEW GAP: Supabase remote-save leg has ZERO client tests.

### §11.2 — GATE ESTATE
Cleared: zoning (4th spelling-blinding; learned `safe*`), secrets (26→12 arithmetic; NO credential;
top row `PRYZM_PUBLISHER_TOKEN` undeclared-not-leaked), subject-floors (3rd false accusation;
reads reportGate contract now), otel (Zone B at baseline), layers (finish-host-tracker L2
MEASURED), verb-register V1 (V4 = C80 author's UNKNOWN-vs-REFUSES call), xss struck, epsilon
re-anchored-not-struck `67355f18`, refusal-identity exit 0.
Still red by design: 8 newly-measured · 2 declared-debt at ZERO headroom (the 11 tolerated
`commandManager.execute` are in the GENERATION EXECUTORS) · bar 3 at 132 · custom-event-packages
(test-scope gate defect; triage has the C70-compliant exclusion recipe, wants a second opinion) ·
structuredclone at 129>119 (the two MODIFIED files).

### §11.3 — FOUNDER DECISIONS OPEN
1. Register restamp direction (two edits rejected unstated). 2. Toolbar mount-or-delete (267 dead
verbs). 3. per-package-compile newly-measured entry (27/85/9 — file's rule makes it a founder
edge case; two cascade roots named, bulk is nUIA debt). 4. PV-06 schemas confidence fields.
5. structuredclone remainder (UpdateFloor/CeilingBoundaryCommand ~10 uses — rewrite or accept).
6. The `partOf` ADR (unit containment made the mid-session disagreement louder).

### §11.4 — NEXT SESSION, IN ORDER
1. VERIFY the last close-out commits (L-PREDFAM families, L-HBANNER toast) — `git log` since
   `2b7737bb`, re-run their gates; treat claims as suspect.
2. RECOUNT + restamp (founder direction first). Strike A5/A6 citing `5b36fad5`.
3. **DEPLOY** (§7 verbatim; BOTH npipe halves; bundle proof reads VALUES). Then §11.5.
4. Re-weld dispatch wiring (solo lane; engine init is shared-dangerous).
5. Bar 3 by family (next: the refusal-BLOCKED 36 via SemanticGraph readers, or the slab.move
   family); PryzmEventMap extension; drain 73→; dark-runner scope call (57 files).

### §11.5 — BROWSER CHECKS FOR THE FOUNDER (post-deploy)
> 🚀 LIVE — hard-refresh first:
> 1. **Move a wall carrying a floor finish/ceiling** — it now ACTUALLY re-projects (mesh + area),
>    once. The §10.2b false green is real code (`5b36fad5`).
> 2. **Generate a residential building** → Data F3 → Hierarchy: rooms grouped under UNITS; no
>    "Unassigned rooms on Level 01" for apartment rooms (corridor/core correctly stay unassigned).
> 3. **Generate a house that seals rooms** — a BLOCKING banner names them; no silent success toast.
> 4. **Force a furnish failure/timeout** — lighting completes with WARN "computed WITHOUT
>    furniture: <reason>"; no double fixtures on slow furnish.
> 5. **Known NOT fixed**: walls still do not re-mitre after a neighbour moves — the engine exists
>    (`81e35360`), the dispatch wiring does not. Expected; say so if asked.

---

## §12 — SESSION CLOSE 2026-08-14 · THE 30-AGENT SESSION — 217 COMMITS

> **§12 OVERRIDES §11 AND EVERYTHING ABOVE IT** where they disagree. Every claim below is an
> executed reading or a cited SHA. Where a number here disagrees with a document elsewhere in the
> repo, **re-run the gate** — that is the rule this session enforced against itself repeatedly, and
> it kept being right.

### §12.0 — THE FOUR THINGS THE NEXT SESSION MUST NOT MISS

1. **⚠ FOUR COMMITTED GATES ARE REGISTERED IN NO RUNNER AT ALL** — not `run-all.ts`'s `GATES`, not
   `ci.yml`, not `package.json`, and there is no exemption allowlist:
   `check-derived-not-authored` · `check-deterministic-regeneration` · **`check-predicate-canonical`** ·
   `check-provenance-coverage`. **This is the L-774 defect recurring inside the C73 gates
   themselves.** It matters because `check-predicate-canonical` is the instrument **GE-02, GE-03 and
   GE-12 are measured against** (including this session's `[0] CLEAN`), and
   `check-deterministic-regeneration` is one of the three gates **GE-07 is recorded CLOSED on**.
   Those readings are REAL — but they are enforcement only when a human runs them, and `run-all`'s
   own inventory arm is RED on them today (`inventoryFailed = true`). **FIRST ACTION: measure all
   four, then register them.** Deliberately not done at session close: registering four unowned
   gates could turn the merge-blocking suite red for reasons nobody has measured.
2. **THE DEPLOY WAS NOT RUN.** Production is still `517f7a70`; HEAD carries **217 commits** it does
   not have. §7's contract applies verbatim. Browser checks in §12.5 — there are now **seven**.
3. **THE REGISTER RESTAMP DID NOT COMPLETE.** The founder authorised it mid-session and the lane
   was killed twice by transient API 529s. The file still reads **34/82** and is known-wrong in the
   **pessimistic** direction. See §12.1 for the counted position and §12.2 for the drop-in texts
   every lane produced — the next session should stamp from fresh gate runs, using those texts as
   the evidence cells, never as the reading itself.
4. **THE FLEET'S OWN FAILURE MODE IS NOW MEASURED**: lanes idle on background test runs. Vitest's
   import phase on this tree is **2–7 minutes** on a saturated machine (measured 28–63 s for a
   single transform; one "hang" turned out to be 93 ms of tests behind 420 s of import). A lane
   that reports "waiting" twice should be told to read its output file directly, not to wait again.

### §12.1 — THE COUNTED POSITION

**~74 of 82 rows closable on executed evidence**, against a register that still says 34. The
distance is not work — it is an unstamped file. The session's own verification workflow (12 agents,
refute-by-default) **re-ran every decisive gate independently and CONFIRMED all seven sampled
closure claims**, so the evidence base is corroborated, not self-reported.

**Gate estate at close** — all executed this session:

| Gate | Reading |
|---|---|
| `check-predicate-canonical` | **[0] CLEAN hard-0** (was 53 at session open) |
| `check-prevstate-contract` | **[0] CLEAN hard-0, empty ledger** |
| `check-provenance-export-boundary` | **[0] CLEAN** (was 5) |
| **`check-conflict-surfacing`** | **[0] CLEAN hard-0** — 103 silent merges → 0 |
| `check-structuredclone-new-commands` | **exit 0, AT baseline 119** (was 135) |
| `check-room-aabb-canonical` · `check-topology-survives` · `check-domain-purity` | **[0] CLEAN** |
| `check-verb-register` · `check-refusal-identity` · `check-otel-spans` | **PASS / 87 baseline / Zone A 250-250** |
| `check-no-empty-means-unknown` | **71** (was 95 two sessions ago, 85 at open) |
| `check-relationship-determination` (**bar 3**) | **132** (was 134) — 2 verbs of 100 |
| `check-no-dark-test-files` | **13** (was 137) |
| `check-epsilon-policy` | 382 at declared 382, E1 **PRESENT**, 0 widenings |

### §12.2 — WHAT LANDED, BY THEME

**THE MODEL STOPS LYING (the session's spine).**
- **CI-0/CI-1/CI-2** — the layout verdict crosses the emit boundary (`1559275e`); a house that
  seals a room raises a **blocking, dismiss-only banner naming the sealed rooms** instead of a green
  success toast (`30fae370` + `9e98484a`); generator output quality is gated in CI for the first
  time, 166 real generator runs (`6c065bb1`).
- **The furnish→lighting chain** stops advancing silently: three non-emitting paths emit, the
  §CHAIN-TIMEOUT double-fire is dead, lighting stamps `basis: furnished|unfurnished` with a
  mandatory disclosure. Root cause was **unsatisfiable**, not a short timer (L-716 class).
- **`[]`-means-unknown 85 → 71**, each with a differentiating test. Headlines: the live reconcile
  was **deleting annotations it merely could not see**; room isolation could be **forged from an
  unanswered query**; a door dependency index answered "no doors" when it had never been populated.
- **P8 data loss** — `_discloseOverwrittenLocalWrites` wiped the whole doc's pending bookkeeping
  after any merge, so a second concurrent edit was discarded **in silence, 103 of 103 cases**.
  Fixed per-property (`a926a93d`); gate now 0 CLEAN.
- **The AI relay was dead in production** — a bundler-evasion `Function('s','return import(s)')`
  resolved against the realm, so the configured branch **always threw and always served demo
  fixtures as AI output**. The guard protecting the adapter's former absence is what killed it.

**CAPABILITIES THAT NOW REACH THE USER.**
- **Finishes follow a moved wall** — `5b36fad5`, reached-behaviour proof (22.04 → 33.64 m², exactly
  once). The §10.2b false green is now genuinely paid.
- **Rooms are born assigned to units** — the resi executor had the apartment identity in scope and
  dropped it on one line. C81's precondition is met for residential.
- **PR-10 closed end to end** — roof-vs-walls clash detector (13 oracle tests) + the subscriber that
  consumes the reconcile's elevation delta and **announces** findings with both magnitudes.
- **The ribbon**: 30 professional BIM toolbars had **zero production importers** and 267 of 280
  verbs dispatched into nothing. Founder decided MOUNT. Phase 3 landed FIRST, deliberately — **all
  276 unbacked verbs now refuse with a reason** (`4bfe86f0`), each citing its SPEC-50 backlog row.
  Phase 2 then found the deeper truth: **the editor has no visible toolbar host at all** — the only
  chrome host ships `display:none`, with two shipped features already injecting into it invisibly.
- **GE-05, the 2-D boolean** — built, oracle-pinned, and **wired** to all three deferring sites. Its
  stake is measured: the `non-convex-both` refusal fired on **47.2 % of 1,000 real Danish parcels**.

**GOVERNANCE.**
- **ADR-0325** — `hierarchyStore` + `parentId` is the sole hierarchy substrate; `partOf` PARKED, and
  `GraphQueryService` stops answering a confident `[]` about it.
- **C82 + ADR-0326 + SPEC-50** — the ribbon capability surface: three legal states, dispatch-into-
  nothing abolished, backlog sized per toolbar.
- **CB-01/CB-05 scoping** — the headline nobody expected: **the code half is done and
  convergence-proven; what is missing is one always-on process, ~$5–10/mo.**
- **ADR-0319 §2 defect measured** (§CE04-RING-PIN): the **unified ring-buffer undo path is less
  faithful than the legacy path it replaces** — ratchets class-2 counters, drops `_sourceBaseLine`.
  Plus `UpdateWallBaselineCommand` has no `targetIds`, so U-8's shadow-drop removes nothing: **one
  phantom Ctrl+Z after a gizmo wall move.**
- **+1,433 tests** turned on; the test runner that never existed created (dark ledger 137 → 13).

### §12.3 — WHAT REMAINS FOR 82/82, EXACTLY

**Stamp-only (≈8 rows, zero code):** the restamp itself, using each lane's drop-in text.

**Small, owned, named:**
| Row | What closes it |
|---|---|
| MT-03 | 6 of 8 dual registrations remain; 6 are bridge-shaped (precedent `fc4de954`), 2 (`sheet.addViewport`, `stair.create`) need a read-back test to decide direction |
| GR-10/GR-14 | the drain from 71; each site needs a differentiating test |
| PV-08 | an exhaustive L0 `member → ValueOrigin` map; pay it **with** `check-provenance-coverage`'s FINDING C2 (same `floor` kind) |
| CE-05 | the mount queue behind L-MOUNT's host fix |

**Above the ceiling, each with a named reason:**
- **CB-02** — one env flip (`PRYZM_AUTHZ_MODE` + `DATABASE_URL` on sync-server). `PgAuthz` is
  written, wired, tested, fail-closed. **Yours, 5 minutes.**
- **CO-06** — 57 scaffold declarations (the row says 19; it is three stamps stale). ⚠ **Close the
  gate's grace-clause loophole first** — a header carrying only a fresh date currently passes, so a
  bulk pay would walk the ratchet down having bought nothing.
- **MT-04** — 11 element kinds unadopted by ADR-0318; real per-kind migration.
- **GE-06** — decomposition landed (`69f7dda1`); slices are construction, ordered by pain.
- **CE-06** — **stays UNPROVEN because that is the true reading.** A one-client, two-level fixture
  cannot prove a multi-client claim. Closing it would be the lie the row exists to prevent.
- **GR-12** — the arm now exists and its first reading is a **new measured defect**: `boundedBy` is
  STALE after a ring-breaking wall move. The row is honest and open.

**BAR 3 remains the second half of 100 %** (§2.0): 132, moved by 2 verbs of 100. It lands by verb
family (C78 §19.1 forbids partial credit) and it is load-bearing for **C81's edit layer**.

### §12.4 — NEXT STEPS, IN ORDER

1. **Register the four unwired gates** (§12.0 item 1) — measure, then register. Highest leverage:
   it converts three GE closures from "true when someone runs it" to "enforced".
2. **RESTAMP** from fresh gate runs, absorbing §12.2's drop-in texts as evidence cells.
3. **DEPLOY** (§7 verbatim: fresh cover · 16 GB builder · **both** npipe halves · bundle proof
   reading VALUES not lengths), then §12.5.
4. **Finish the ribbon**: un-hide `.plat-toolbar` (one commit — it also un-hides two shipped
   features), mount MainToolbar, then the drafting group, H6 probe delta as the only proof.
5. **The two undo-fidelity defects** (§CE04-RING-PIN + the missing `targetIds`) — user-visible,
   measured every certify run, owner named.
6. **Bar 3 by verb family** — next natural family is the slab/opening move class; the three existing
   planners are the pattern and the registry extension is two entries per verb.

### §12.5 — THE BROWSER CHECKS (post-deploy)

> 🚀 LIVE — hard-refresh first:
> 1. **Move a wall carrying a floor finish / ceiling** — it re-projects, once. (`5b36fad5`)
> 2. **Generate a residential building** → Data F3 → Hierarchy — rooms grouped under **Units**; no
>    "Unassigned rooms on Level 01" for apartment rooms.
> 3. **Generate a house on a plot that seals a room** — a blocking, dismiss-only card naming the
>    sealed rooms. **No green success toast.**
> 4. **Force a furnish failure** — lighting completes with a WARN naming the reason; no double
>    fixtures on slow furnish.
> 5. **The toolbar host** — is any ribbon chrome visible at all? (If not, item 4 of §12.4 is why.)
> 6. **Any unbacked ribbon button** — it must be visibly disabled with a reason, never silent.
> 7. **Known NOT fixed**: walls still do not re-mitre after a neighbour moves. The engine exists
>    (`81e35360`, 11/11, refusal guards); the move-commit dispatch does not. Expected.

### §12.6 — THE GENERATIVE PROGRAMME (the other tracker)

This session was a TRUST session; the generative programme moved only where the two touch. Its
state and next steps:

- **CI-0 ✅ · CI-1 ✅ · CI-2 ✅ · CI-3 ⬜ · CI-4 measured-not-ledgered.**
- **The founder decision that is still owed**: CI-1/CI-4's ratchet. `check-generator-circulation`
  measures the unreachable-room and corridor-contiguity rates and **prints them without ledgering
  them** — deliberately, because ledgering is a product decision (SPEC-49 §4). Until it lands,
  nothing fails if the unreachable rate doubles.
- **Next generative steps, in order**: (1) ledger CI-1/CI-4 at their measured baselines;
  (2) **CI-3** — thread `Door.swing` through the wall-opening payload into `OpeningPose` so the
  real swing sector reaches the furnisher (`doorSwingKeepout.ts` is authored, tested, and imported
  by exactly one file: its own test); (3) the house generator's remaining sealed-room rate — the
  banner now *announces* it, which makes the fix measurable; (4) unit containment for the house,
  apartment and office generators (residential is done; the pattern transfers directly).
- **The 28-cell denominator stays separate from the 82.** Different questions. Never merge them.

### §12.7 ⚠ CORRECTION TO §12.1 — THE COUNTED FIGURE IS **51**, NOT ~74

**§12.1 said "~74 of 82 rows are closable on executed evidence." That number was a FORECAST
wearing a count's clothing, and it is superseded.** The restamp ran and produced the counted
figure at commit **`8788b5cd`**:

| | Count |
|---|---|
| **CLOSED** | **51** — executed evidence in 48; 3 source-verified only (PR-06, GR-15, MT-08) |
| **OPEN** | **24** — most at named shrink-only ledgers |
| **UNPROVEN** | **7** — GE-08, MT-04, MT-05, CB-05, CE-03, CE-04, CE-06 |
| | **= 82** |

**Progression across three stamps: 25 → 34 → 51.** This session moved it 34 → 51: nineteen rows
closed, two moved UNPROVEN→OPEN by being measured, and **MT-10 re-opened** on an XSS regression
(`houseCirculationNotice.ts:159`, a new unguarded innerHTML sink — the builder does escape via its
local `esc()`, so it is not believed exploitable, but `check-xss-guards` is exit 3 and a baseline
may never be raised).

**Why the forecast was 23 rows high, stated plainly because the mechanism will recur:** the
orchestrator counted rows for which *a lane had produced evidence*. The restamp counted rows for
which *it had re-run the gate itself*. It marked **nine rows NOT RE-MEASURED THIS PASS** rather than
inheriting a lane's claim — including **MT-09**, whose "26 packages fail isolated compilation" is a
two-day-old reading. That is §0.1 working exactly as designed, and it caught the orchestrator doing
the thing this programme exists to prevent. **Use 51. Anything above it in this file or in chat
history is a projection, not a measurement.**

---

## §13 — THE STRATEGIC PATH: WHAT PRYZM SHOULD DO NEXT

> §12 is tactical — the next actions. §13 is the argument for *why those and not others*, written
> at session close while the evidence is fresh. It is opinion **derived from measurement**, and it
> says so; where it recommends, it names what it is recommending against.

### §13.1 — Finish trust, but stop treating 82/82 as the goal

51 closed; the remaining 31 are, with few exceptions, **measured and named** rather than mysterious.
Chasing the number for its own sake would now buy less than the work it displaces.

**The single highest-value item is not a row at all.** Four committed gates are registered in **no
runner** — `check-derived-not-authored`, `check-deterministic-regeneration`,
**`check-predicate-canonical`**, `check-provenance-coverage` (§12.0). One of them is the instrument
**three closures depend on**. Enforcement that runs only when a human remembers is not enforcement,
and this repository has paid for that lesson twice already (L-774, and the 56-gate suite that ran
zero gates for a day). **Register them first.** It is hours of work and it retroactively hardens
everything the session claimed.

### §13.2 — Bar 3 is the gate to the product the founder actually wants

It moved **134 → 132** this session: two verbs of a hundred. That sounds like nothing and is
actually the proof of concept — the pattern is now established (three planners, one registry, two
entries per verb family) and the next family is cheaper than the last.

Everything in the "change an existing design" category sits behind it, and **C81's edit layer is
blocked on it entirely** (C81 §8). §9.3 measured the stake: at 100 % of the register, *generation*
prompts are 14 of 16 working-or-partial while *modification* prompts are **0 of 16**. Bar 3 is what
flips that row.

**Recommendation: fund bar 3 as a standing multi-session workstream by verb family**, not as
opportunistic row-closing. It converts PRYZM from a generator into a design tool, and no new
typology does.

### §13.3 — Collaboration is a purchase decision, not an engineering one

Measured this session and it surprised everyone: **the code half is done.** The client provider seam
is wired end-to-end, WS-upgrade auth is fail-closed, `PgAuthz` is written/wired/tested/fail-closed,
and `check-two-client-convergence` runs green with 8 real crossings across 2 composed clients.

What is missing is **one always-on process (~$5–10/mo)** and **one env flip**
(`PRYZM_AUTHZ_MODE` off `memory-allow-by-default`, plus `DATABASE_URL`). Two register rows and a
headline capability for less than the cost of a lunch. **It is the cheapest capability on the board
by an order of magnitude** and it is waiting on a decision, not a sprint.

### §13.4 — Generative quality needs its ledger, and that is a founder call

`check-generator-circulation` **measures** the unreachable-room and corridor-contiguity rates and
**deliberately does not ratchet them** — SPEC-49 §4 says ledgering is a product decision. The
consequence, stated flatly: **nothing fails today if the generation quality regresses.** The
instrument exists and is blind by consent.

**Recommendation: ledger CI-1/CI-4 at their measured baselines.** Then the next generative step is
CI-3 — thread `Door.swing` into `OpeningPose` so the real swing sector reaches the furnisher
(`doorSwingKeepout.ts` is authored, tested, and imported by exactly one file: its own test).

### §13.5 — The pattern worth institutionalising: fund instruments before features

Every one of this session's largest findings was **invisible to the existing test suite and obvious
to a probe**:

| Found | Was invisible because |
|---|---|
| The AI relay served demo fixtures in every configured deployment | the fallback was silent and the tests injected the adapter |
| 103 of 103 concurrent edits discarded without a conflict | the second-merge path had no arm |
| 30 toolbars unmounted, 267 verbs dispatching into nothing | 30 spec files asserted dispatch **against a mock bus** |
| The ring-buffer undo less faithful than the path it replaced | nothing compared the two |
| `boundedBy` stale after a wall move | C71 §1.2 semantic 5 had **NO ARM for any family** |

In every case the *code* had been reviewed and the *tests* were green. **The measurement was the
deliverable.** The corollary for planning: when a capability is claimed but unproven, the cheapest
next step is almost always the probe, not the fix — and this session's own verification workflow
(12 agents, refute-by-default, all seven sampled claims CONFIRMED) is the pattern for auditing a
large body of work without trusting its authors, including when the author is the orchestrator.

### §13.6 — What this implies for sequencing

1. **Register the four gates** (§13.1) — hours, hardens everything already claimed.
2. **Deploy** — production is 220+ commits behind and the user-visible wins of this session
   (finishes following walls, the sealed-room banner, the ribbon, honest lighting) are all unshipped.
3. **Two decisions, both cheap**: the collaboration process + env flip (§13.3); the CI-1/CI-4
   ledger (§13.4).
4. **Then bar 3, as a programme** (§13.2) — and treat remaining register rows as opportunistic
   rather than as the plan.
5. **Standing rule**: before building against any row, **re-measure it**. Five row headlines were
   overturned this session in the healthy direction (§12/§8.5) and one forecast was 23 rows high.
   The register describes the past; the gate describes the present.
