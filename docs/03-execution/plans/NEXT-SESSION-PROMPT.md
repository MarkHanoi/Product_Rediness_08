# NEXT SESSION PROMPT — paste this to open a fresh session

> Written 2026-08-16 at the close of a 7-deploy session. Everything below is **measured**, not
> forecast. Where a number is stale it says so. The two authoritative documents are
> `docs/03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md` (the plan) and
> `BIM30-MASTER-COMPLETION-TRACKER.md` (the measured state). The whole BIM30 doc surface was
> collapsed into those two — 23 other files were deleted; do not recreate them.

---

## PASTE FROM HERE

You are resuming PRYZM. Read `CLAUDE.md`, then
`docs/03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md` (plan) and
`BIM30-MASTER-COMPLETION-TRACKER.md` (state) before doing anything. Do not re-derive their content.

### 0 — THE STANDING DISCIPLINE, learned the hard way and non-negotiable

1. **COMMITTED ≠ REACHABLE.** Four times in one session a fix was committed, tested green, and could
   not run: a discarded return value, a `TEMP-AB-PROBE` short-circuit, a chokepoint that was 1-of-6,
   and 13 gates registered in no runner. **Prove every fix at the layer the user experiences — a
   STORED value, a rendered result — never a pure function's return.** If you cannot write that
   assertion, say so rather than shipping.
2. **MEASURE FIRST, COMMITTED ALONE.** Pin the current wrong behaviour with numbers in its own
   commit, then fix and flip the pin. Several hypotheses were REFUTED this way — do not skip it.
3. **Exit codes through a pipe are lies.** `cmd | tail` reports tail's status. Use `cmd; RC=$?` or
   read the `process.exit` in source. This produced two false "exit 0" readings in one pass.
4. **Never hand-increment a count.** A row closes only when you re-run its deciding gate.
5. **Refusals carry identity and both numbers.** Silence is the one forbidden outcome.
6. **Tolerances are CONSUMED from `@pryzm/geometry-kernel`** (C73 §2.2), never minted, never
   camera-derived.
7. **Commit incrementally.** Agents died repeatedly; only committed work survived.
8. **⛔ Never `git stash`** — the stack is global across worktrees.

### 1 — DEPLOY STATE

- **Live: `49befd93`**, bundle proof 6/6. Method: `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`
  (§6.5.6 amended — `DOCKER_CONFIG` needs a **Windows-shaped path**; no MSYS exports per §6.6.1).
- Deploy from a **clean detached worktree** (`C:/pzdep2`) at a committed SHA so in-flight lane work
  cannot leak into the image. Cover: root tsc → `check:isolation` → `test:server` → deploy → proof.
- **2 commits ahead of live** (`6183b9a3`, `ea20eaa2`) — behaviour-identical (a diagnostic flag
  defaulting to shipped behaviour + tests). Deploy only if bundling something else.

### 2 — HALF 1 · the 82-row register

**Counted position: 59 CLOSED / 16 OPEN / 6 UNPROVEN. Ceiling 82 absolute, 79 with the founder's
CB-01/02/05 deferral. So 59/79 = 75%.** Verification coverage: 30 of those 59 were re-proven by
execution; 29 are carried and named individually in the tracker.

⚠ **THIS IS STALE.** ~30 fix commits landed after that stamp and are NOT counted.
**FIRST JOB: RESTAMP.** Re-run each row's deciding gate, never hand-increment. Expect the restamp to
REFUSE some rows it is handed — that is the instrument working (it refused ten last time).

#### Phase A — 3 of 8 items done
- ✅ deploy+verify · recount · L-851 dark specs (verified complete at `2f374805`).
- ❌ **A2 GE-02** — its carried CLOSED is **contradicted by its own gate**. Start here.
- ❌ **A3** — `pointInEdgeSetEvenOdd` kernel predicate designed, never written
  (`HiddenLineRemoval.ts:331`; `pointInSilhouette` is not a ring — it is a flat multi-loop edge set).
- ❌ **A7** finish-host-tracker — audited: 4 of 5 row claims were STALE (wiring is live, no OOM,
  0 no-empty findings). Two real holes were paid. Row is closable after re-measure.
- ❓ A5 (PR-12 one-liner, its structural test is designed to go red on the fix), A6 (enrol
  `check-room-aabb-canonical` in `certify.ts`) — unmeasured.

#### Phase B — 2 closed, 4 advanced
- ✅ CE-04 · CE-05 census landed (`e08869f9`) — **but `EXECUTED-REACHED 0/230` BY CONSTRUCTION.**
  The census is done; the DRIVING is not. Follow-on gate answers the residency question YES →
  `certify.ts`. Two prerequisites: resolve the three indirection idioms (`commandType` ×30,
  `def.commandType` ×11, `_cmd.type` ×4 = 45 of 61 undetermined), and cross with `build-census.ts`
  — **a resolved dispatch into an UNBACKED verb is still a dead button.**
- 🟡 `[]`-drain **68 → 63**; UI scope at **0**; residual 63 in `packages/`/`plugins/`
  (WallStore 22 sites, WallFragmentBuilder 7).
- 🟡 **PR-11 blocked on a missing capability, not wiring**: the handler is genuinely implemented
  (`278b99e5`) but `new CascadeRunner()` exists **only in test files, repo-wide**. Standing up a
  production runner is a composition-root change — **founder decision, recorded in C72 §2.5**.
- 🟡 **GE-06**: all 12 `clash-*` verbs now REFUSE by name (`8de42e12`+2). Row STAYS OPEN — refusals
  are not detectors. Needs 5 pair-detectors, **but `geometry-roof` ALREADY HAS an oracle-tested
  roof×wall detector in state `EXISTS_BUT_UNWIRED` — so PR-10's cheapest path is WIRING, not
  construction.** Also: the bus declares 12 clash ids and the toolbar declares a DIFFERENT 12, only
  3 overlapping.
- ⛔ CE-03 correctly refused — its arm runs on `fake-indexeddb`, a shim, not a browser.

#### Phase C — 1 closed, 5 advanced
- ✅ junction re-weld. 🟡 epsilon **338 → 322** · CO-06 → 9 · GE-09 baseline **71 → 67**
  (command-registry fully drained; residual in `plugins/slab` ×9, `apps/editor/ui/apartment-layout`
  ×7, `site-parcel-data` ×6) · MT-07 ADR-0327 · roof L0 field landed.
- ⬜ **4 predicate families in a BINDING order**: segment-segment-intersection →
  polygon-area-and-winding → point-to-segment-distance → **polygon-containment-overlap LAST** (built
  from the other two; counting it earlier double-counts). Families 1 and 2 are MEASURED (11 and 77
  rivals) with censuses recorded; the `counted:true` flip is **uncommitted and currently reads
  exit 3 (89 vs 88)** because a new test added a rival after the pin — reconcile before landing.
- ⬜ dark-test ledger 13/13 — **needs a founder scope call on 57 no-runner files**.

### 3 — HALF 2 · bar 3

**125 findings** against a denominator of **4,100 cells = 100 consequential verbs × 41
relationships**. Three families landed WHOLE (C78 §19.1 forbids partial credit): hosted-opening
CREATE `78394be2` (131→128) · hosted-opening DELETE `9e780581` (128→126) · wall.delete `d572fb7e`
(126→125). `check-plan-determinism` is **6/6, exit 0 CLEAN** — the ARM-4 harness debt is paid.

- **Next family, named by measurement**: `wall.batch.create` — reuses `WallCreateConsequencePlanner`
  and the occupancy seam rather than minting new discovery. Open question per C78 §1.5: one plan or
  N — **either way it counts as ONE consequential verb**.
- **Selection rule, proven three times**: choose by *cheapest reuse of proven substrate*, never by
  verb popularity.
- ⚠ **`check-relationship-determination` ran in NO runner until `df0f6692`.** Every bar-3 number
  quoted before that was hand-run with nothing defending it. Registration precedes family work now.
- **2 gates still refused registration** (`check-index-can-refuse`, `check-region-reference-frame`)
  — both at exit 3, which no ledger may absorb. They need lanes that FIX, not lanes that register.

### 4 — OPEN FOUNDER DEFECTS (highest-value input stream in the repo — lane each same-turn)

| Row | State |
|---|---|
| **L-918** Auto mode unreachable in plan view | OPEN — lane was stopped; partial edits uncommitted. Mode is dropped at tool activation (`ToolsAreaLayout.ts:94/:101`); the seam may be shared across ALL plan tools |
| **L-924** roof follows its walls | ENGINE BUILT (`16ef37b0`, 36→48 m² or a typed refusal), WIRING UNFINISHED — needs `UpdateRoofBoundaryCommand`, tracker construction in `initTools.ts`, and `boundingWallIds` on **both** region paths (C79 §7.4: per-path divergence is worse than uniform absence) |
| **L-929 residue** | An OBLIQUE body-snap at tight zoom takes a square cap (~35 mm wedge) — detection measures endpoint→host-CENTRELINE against `SNAP_RADIUS`. Pinned `§CAP-AFTER-RETREAT` |
| **L-921 residue** | Pre-move atomicity not implemented: a residual collapse-refusal leaves the wall moved with a message rather than rolling back. Clean fix named: `previewSlabConnectivityWeld` consulted by `wallPlacementGate.gateWallMove`, mirroring `previewMoveReweld` |
| **L-928 residues** | Plan-stage reweld refusals reach nobody (`engineLauncher` wires no `onConsequence`); a missing `thickness` silently classifies every partner as a corner, disabling stem-follow entirely |
| **MT-06** | The seam fix landed (`c100df8f`) and the authority is derived at `WallStore.add()`, but the full single-authority migration (delete the rival store) is its own lane |

**11 wall defects were closed this session** (L-916, 919, 920, 921, 922, 923, 925, 926, 927, 928,
929). The founder confirmed the perimeter behaviour works. **Do not re-open them without measuring.**

### 5 — UNCOMMITTED WORK FROM STOPPED LANES — audit, do not inherit blindly

~20 files sit uncommitted. **Every one belongs to a lane that was stopped mid-work.** This session
proved twice that inheriting unaudited work ships defects (a `TEMP-AB-PROBE`, a 1-of-6 chokepoint).
Audit each as a SUSPECT INHERITANCE: read the diff, run its tests, keep what proves out, revert the
rest — and record what you discarded.

- `apps/editor/src/ui/ai/WallMoveClashProposal.ts` (+314) + `wallPlacementGate.ts` — L-921 chat
  surfacing, substantial
- 3 plantools handlers + `annotationPlanToolCommit.test.ts` — L-918
- `tools/ga-gate/check-predicate-canonical.ts` (+167) + baseline + `gate-newly-measured.json` — R5;
  **currently exit 3, reconcile the pin against the newer test**
- `apps/component-editor/{SketchCanvas,FilletTool,TrimTool}` — C4 CO-06
- `RoomGraphPanel.ts`, `src/global-window.d.ts`, 3 docs — mixed
- Artifacts that never ship: `test-results/`, `.claude/settings.local.json`,
  `packages/command-registry/tsconfig.tsbuildinfo`

### 6 — KNOWN-RED AT HEAD (measured, not guesses)

- **7 committed-at-HEAD test regressions** across 7 files, each with an owner: `darkTestFiles.spec`
  (structurally breaks on every ledger shrink — **fix the SPEC**), `otelSpanCoverage` ×3 (real
  uninstrumented violations), `xssSinkScan` (baseline not updated after `799255c0`),
  `LlmPlannerBridge` + `QueryEngineDrain` (stale after the RAC work), `autoTagActiveView` ×2,
  `L847-shipped-data-surface` (import exceeds 120 s hookTimeout even solo).
- **`check-deterministic-regeneration`**: STALE LEDGER, 21 entries — **line-number drift, needs
  re-anchoring, not a fix.**
- **MT-09**: 26 packages fail isolated compilation, and the 9 "skips" are a hard-coded map — so the
  true position is **35 of 94 unproven**, including `command-registry`, `core-app-model`,
  `runtime-composer`, `ai-host`. The shrink-only enforcement of that skip list did NOT land.
- **CLAUDE.md is measurably stale in three places**: P7 arm B is 40/43 (doc says RED 45/43);
  `layer-boundaries` sdk-bypass 171/182 (doc says 181/181); `cast-count` 6/4 scoped (doc says
  217/215 repo-wide).

### 7 — SUGGESTED ORDER

1. **RESTAMP** the register from fresh gate runs (§2). Everything else is guesswork until this runs.
2. **Audit the uncommitted pile** (§5) — land or revert, record which.
3. **Fix the 7 HEAD regressions** (§6) — a red suite erodes every gate reading's credibility.
4. **Founder defects**: L-918, then L-924's wiring (both are close to done).
5. **Phase B**: PR-10 by WIRING the existing roof×wall detector; CE-05's driving half.
6. **Half 2**: `wall.batch.create` family, whole.
7. Correct CLAUDE.md's three stale readings.

**Founder decisions outstanding, no urgency:** the production `CascadeRunner` (C72 §2.5) · the
dark-test no-runner scope call · CI-1's runtime half (refuse vs blocking banner).

## PASTE TO HERE
