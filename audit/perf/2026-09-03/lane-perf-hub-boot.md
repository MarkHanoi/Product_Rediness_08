# LANE PERF-HUB-BOOT — the "~76.7s hub:mount-start" (2026-09-03)

Marker: **§PERF-HUB-BOOT**. Signal: founder production console, 2026-09-03 —
`[§STARTUP-BUDGET] hub:mount-start +76753ms (t+82680ms)` after clicking back-hub from an open
project, followed by `hub:warm-start +36ms`, `hub:grid-painted +104ms`, `hub:sync-done +103ms`.
NO commit — orchestrator commits.

## 0. Verdict in one paragraph

**The 76.7 s is the founder's own editing session, not a hub boot.** `markStartupPhase`
(`apps/editor/src/engine/startupBudget.ts`) computes `sincePrevMs = at − prevAt` against the
**previous mark of the run** — and no mark existed at the back-hub gesture, so the delta at
`hub:mount-start` spanned: the tail of the project open (previous mark at t+5,927 ms, by
arithmetic 82,680 − 76,753) → the entire time the founder spent editing → the click → a
synchronous navigation stack measured in single-digit milliseconds. This is
**§CONTEXT-DATA-HONESTY applied to a stopwatch, in the RETURN direction of the exact defect
`hub:open-clicked` closed for the open direction** (PERF100, L-11440 — "human dwell and machine
work were the same value"). The fix is instrumentation honesty, not optimization: a
`hub:back-clicked` mark now sits at the gesture's choke point, so the next paste attributes
dwell to the human and navigation cost to the machine. **No real blocking work exists on the
back-hub path** — verified in code order below.

## 1. WHAT the +76753ms actually measures (the code path)

- **Delta semantics** — `apps/editor/src/engine/startupBudget.ts`, `markStartupPhase()`:
  `sincePrevMs: at − prevAt` where `prevAt` is the last mark's `performance.now()`. Deltas are
  since-previous-mark, NOT since-t0 and NOT "cost of this phase's own work".
- **The founder's run** — began at `beginStartupBudget()` (PlatformRouter.ts:709, the
  onboarding arm; `onboarding:shown +0ms` at t0). Startup marks ran to the pipeline tail; the
  last mark before the dwell fired at **t+5,927 ms**. §STARTUP-BUDGET's vocabulary is
  startup-only — nothing marks during editing — so the next mark was `hub:mount-start` at
  t+82,680 ms, 76,753 ms later.
- **The click→mount synchronous stack, in order** (all verified cheap):
  1. Leaf click: `[ProjectHub] §HUB-CLICK action=back-hub`
     (`apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts:462`) → `dispatch('back-hub')`
     (:403–404): emits `pryzm-go-hub` on the **runtime bus first**, then
     `window.dispatchEvent` — both synchronous.
  2. Runtime-bus leg: `initCollaboration.onGoHub`
     (`apps/editor/src/engine/initCollaboration.ts:1040–1052`) — `clearJoinRetry()`, one
     `socket.emit('leave-project')`, `socket.disconnect()`, cursor-overlay removal. Plus
     `PlatformCollabPill` hide (:117). Milliseconds; both log their own lines.
  3. Window-bus leg: `PlatformRouter`'s `pryzm-go-hub` listener
     (`apps/editor/src/ui/platform/PlatformRouter.ts:292`) — §BACK-TO-PROJECT log, five style
     writes on `#platform-root`, `hub?.destroy()` (hub is null after a prior open),
     `showHub(u)` → `landing/pricing destroy` (null), `history.pushState`, →
     **`markStartupPhase('hub:mount-start')`** (was :600).
- **What is NOT on this path** (the suspects the lane brief named): the §L-676 teardown chain,
  `ClearProjectCommand`, `captureThumbnail`, scene disposal — **none run on back-hub**. The
  editor runtime stays alive underneath; the platform root is merely re-shown and z-elevated
  (PlatformRouter :303–315). Project teardown belongs to the NEXT `launchWorkspace`
  (`launchWorkspace` sets `display:none` again on the next open — its own comment says so).
  Collaboration suspend is the only teardown that fires, and it is the cheap leg measured in
  step 2.
- **Corroboration from the same paste**: `hub:warm-start +36ms → grid-painted +104ms →
  sync-done +103ms` — the hub's own work after mount totals ~250 ms, consistent with the
  §PERF100 probe's 178 ms CPU table (`perf100Probe.spec.ts`). A 76.7 s machine cost with a
  250 ms tail is not a plausible shape; a 76 s human dwell with a 250 ms mount is.

## 2. THE FIX — instrumentation honesty (3 files, no behavior change)

1. **`apps/editor/src/ui/platform/PlatformRouter.ts`** — `markStartupPhase('hub:back-clicked')`
   at the TOP of the `pryzm-go-hub` window listener (the single choke point: every back-hub
   emitter dual-dispatches on the window bus — ProjectBrowserPanel :403,
   PlatformProjectBrowser :565, ExistingProjectsPanel :140, EngineLoadingOverlay :178). After
   this: everything before `hub:back-clicked` = editor dwell; `hub:back-clicked →
   hub:mount-start` = the machine cost of back-hub navigation. Passive mark only, per
   startupBudget's own "marks, not gates" contract — nothing runs differently.
2. **`apps/editor/src/engine/startupBudget.ts`** — (a) vocabulary docblock gains the
   `hub:back-clicked` family entry with the ⛔ rule: *never quote a `hub:mount-start` delta
   without saying whether `hub:back-clicked` (return) or `platform:router-started` (cold)
   precedes it in the same run*; (b) `beginStartupBudget()`'s log line now prints
   `run started (t0 at nav+Xms)` — see §3, the cold-boot half.
3. **`apps/editor/src/ui/platform/__tests__/perfHubBackClickSplit.spec.ts`** (NEW, in the
   vitest include allowlist via `apps/editor/src/ui/platform/__tests__/**`) — two arms:
   - **A. SEMANTICS** (mocked clock against the real module): reproduces the misreading
     exactly (75 s dwell → `hub:mount-start sincePrevMs = 76,753`), then proves the split
     (with the gesture marked: dwell 76,737 ms on `hub:back-clicked`, 16 ms on
     `hub:mount-start`).
   - **B. SOURCE PIN**: the `pryzm-go-hub` listener contains
     `markStartupPhase('hub:back-clicked')` BEFORE `showHub(`, and
     `markStartupPhase('hub:mount-start')` still exists. (Source-level pin because importing
     PlatformRouter drags the engine-warmup graph into a unit test; precedent:
     `mt05StoreIdentityHeap.spec.ts` et al.)

## 3. COLD boot path (the separate audit, task 3)

- **`onboarding:shown +0ms` is tautological, not fast.** `beginStartupBudget()` is called on
  the line immediately before `markStartupPhase('onboarding:shown')`
  (PlatformRouter.ts:709–710), and every delta re-bases to the first mark — so the cost BEFORE
  t0 (script download + parse/eval) was invisible in every paste, even though
  `performance.now()` is navigation-relative. Fixed in the log line: `run started (t0 at
  nav+Xms)` now names that leg (suppressed on the `Date.now()` fallback where the value would
  be epoch ms). No mark added; no behavior change.
- **Bundle facts (dist of 2026-09-02, content-hashed):** `main` **8,542 KB** ·
  `engineLauncher` **4,426 KB** · `domain-engine` (the deliberate 8-package SCC chunk)
  **4,352 KB** · `vendor-web-ifc` 3,473 KB · `vendor-thatopen` 2,232 KB · `vendor-three`
  1,821 KB. `vite.config.ts` `manualChunks` (line 438) splits vendors deliberately;
  application code keeps rollup default chunking. The 8.5 MB `main` is the eager cold-boot
  parse/eval load the new `nav+Xms` line will now quantify per-session. Production is the
  target per memory `localhost-dev-unusable-test-on-prod` (dev starves the event loop; no dev
  measurement was used here).
- The outer harness (`tools/perf/outer/outer-baseline.spec.ts:155`) parses §STARTUP-BUDGET
  phase lines generically into a `Record<string, number>` — both the new mark and the changed
  t0 line are additive-safe (the t0 line never matched the phase regex).

## 4. PROOF

- **New spec**: `npx vitest run apps/editor/src/ui/platform/__tests__/perfHubBackClickSplit.spec.ts`
  → **4/4 pass**.
- **Whole platform suite**: `npx vitest run apps/editor/src/ui/platform/__tests__/` →
  **9 files, 68 tests, all pass** (includes `perf100Probe`, `perf104OpenPath`,
  `hubDeferredWorkBudget`, `saveWipeGuard` — the startup/hub suites this lane could regress).
- **Root tsc**: `npx tsc --noEmit -p tsconfig.json --skipLibCheck` → **RC=2, 490 errors, ALL
  in `packages/site-parcel-data/src/parcelProviders/registry.ts`** (TS1005/TS1109/TS1128
  syntax cascade — that package is scope-fenced to another lane and was already modified in
  the git snapshot before this lane started; the brief's known-in-flight TS6133s in
  `nationalJurisdictionResolver.ts` have since evolved into this). **Zero errors reference any
  file this lane touched** (grepped the full 490-line output for
  PlatformRouter/startupBudget/perfHubBackClick: no hits).
- **Scope fence respected**: this lane's diff is exactly `startupBudget.ts`,
  `PlatformRouter.ts`, and the new spec. The `component-*` / `site-parcel-data` working-tree
  modifications visible in `git status` are other lanes' in-flight edits, untouched.

## 5. OWED FOLLOW-UPS

1. **The next founder paste decides.** If a future back-hub shows a large
   `hub:back-clicked → hub:mount-start` delta (not dwell), THAT is a real defect — the split
   makes it visible for the first time. Nothing found in code order predicts one.
2. **The runtime-bus leg (collab suspend) sits before the choke-point mark** — the ~ms between
   the leaf §HUB-CLICK log and `hub:back-clicked` is bracketed by console timestamps but not
   by marks. Not worth 4 emitter-side marks today; revisit only if a paste shows a gap there.
3. **The hub-open path still never prints the summary table** (pre-existing KNOWN GAP,
   documented in startupBudget.ts — `reportStartupBudget` is one-shot from the onboarding arm
   only). Unchanged here: fixing it trades one missing report for another.
4. **The 8.5 MB eager `main` chunk** is the cold-boot cost owner the new `nav+Xms` line will
   quantify. Any split work is its own lane (rollup app-code chunking is deliberately default;
   see the Contract 47 §9.5 note in vite.config.ts for how a naive split regressed before).
5. ISSUE-LOG: orchestrator should append a §PERF-HUB-BOOT row (this lane does not commit;
   memory `capture-founder-research-to-repo` — this file is the repo capture).
