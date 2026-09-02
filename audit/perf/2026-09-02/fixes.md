# LANE FIX — executable-now perf fixes applied (2026-09-02)

Follows `diagnosis.md` (same directory). Environment: Windows 11, node v24.15.0, AMD Ryzen 5
7235HS, HEAD c5d0109c + the concurrent UCE/E9 wave's in-flight tree. Every fix below was
red-first (the assertion FAILS at pre-fix code — RC captured), applied, re-verified green,
and the touched package's behavioural suite run. The byte-identical revert→regress→reapply
falsification was performed on fix 2a. **No commit was made (orchestrator commits).**

## Headline — measured at the REAL composed runtime (the layer the user’s verbs hit)

Re-run of the BASE-INNER harness (`npx vitest run -c tools/perf/vitest.inner.config.mts`,
RC=0, all 10 behavioural tests green) with the fixes in place. The pre-fix baseline
`baseline-inner.json` was backed up and RESTORED BYTE-IDENTICAL (sha1 edc4e064…, verified);
the post-fix run is preserved as **`postfix-inner.json`**.

| metric (median) | before | after | × |
|---|---|---|---|
| **B2 wall.batch.create, 1000 walls — total** | 285.7 ms | **68.3 ms** | 4.2× |
| B2 — authoritative-mirror replay (`emit_authoritativeMirrorAdd`) | 228.3 ms | **23.2 ms** | 9.8× |
| B2 — emit total | 265.6 ms | 48.1 ms | 5.5× |
| B2 — ctx (`storesProvider`) | 0.101 ms | 0.030 ms | 3.4× |
| **A1 wall.create single — total** | 1.167 ms | **0.410 ms** | 2.8× |
| A1 — mirror add | 0.342 ms | 0.101 ms | 3.4× |
| A1 — ctx | 0.064 ms | 0.013 ms | 4.9× |
| B2 singles anti-pattern, 1000 × wall.create | 2288 ms | 1522 ms | 1.5× |

---

## Fix 2a — WallStore per-add sibling scans → per-level spatial hash (§PERF-WALL-ADD-PROXIMITY)

**Diagnosis rank 2a.** `WallStore.add()` fed `deriveJoinIntent` (L-927) and
`retreatOntoHostFaces` (L-929) ALL level walls per add — O(N²) per batch, and the growing
per-single-create cost (32→348 µs/add at 1000 walls).

- **Files**: NEW `packages/geometry-wall/src/WallJoinProximityIndex.ts` (endpoint cells +
  padded band cells, superset queries); EDIT `packages/geometry-wall/src/WallStore.ts`
  (candidate query in `add()`; incremental insert in `_addToLevelIndex`; invalidation in
  `emit()` for update/remove, `_removeFromLevelIndex`, `clear()`; lazy `_getProximityIndex`).
- **Answer preservation** (C83/L-927/L-929 — same stamps, faster lookup): both consumers
  re-check candidates with their exact predicates; the index only guarantees a SUPERSET
  (proof sketch in the index header). Asserted by the NEW oracle
  `packages/geometry-wall/__tests__/WallJoinProximityEquivalence.test.ts`: 200-wall corpus
  (lattice corners, T body-landings, 19/21 mm near-eps probes, diagonals, explicit stamps,
  interleaved `update()` invalidations); for every add the stored `joinIntent` + `baseLine`
  must equal the pre-fix FULL-scan result, with non-vacuity floors (≥10 stamps, ≥10
  retreats, ≥5 invalidations). **Green.**
- **Red-first**: NEW `tools/perf/wallstore-add-scaling.assert.mts` — pre-fix **RC=1**
  (`FAIL: disjoint total 234.1ms > 120ms; growth 11.0x > 4x`); post-fix **RC=0**
  (22.1–88.9 ms across runs, growth 0.9–1.4×). Diagnose bench arm A: 259.3 → **44.4 ms**,
  now equal to arm B (scans off, 45.6 ms) — the scan cost is gone, not moved.
- **Falsification #1 (harness binds to subject)**: band-candidate query sabotaged via sed →
  equivalence test FAILED (`baseLine mismatch on eq-wall-61`) → restored byte-identical
  (sha1 3423ab36… before and after) → green.
- **Falsification #2 (the ONE byte-identical revert-regress-reapply)**: `WallStore.ts`
  reverted to HEAD → assertion prints `FAIL: disjoint total 433.9ms > 120ms; growth 10.2x`
  → fixed file re-copied (sha1 3423ab36… verified) → `OK: 50.2ms, growth 1.4x`.
- **Behavioural suite**: `pnpm`-style `npx vitest run` in packages/geometry-wall —
  **125 files / 1244 tests passed; 1 failed** (`WJ1MovePropagateRecompute.measure.test.ts`,
  "non-vacuity guard"): **PRE-EXISTING** — fails IDENTICALLY with the HEAD WallStore
  (control run captured). Not mine; flagged for the orchestrator.
- **Types**: package tsc error count unchanged (1892 = 1892, none in my files; the 1892 are
  pre-existing strictness debt in sibling packages swept by that tsconfig).

## Fix 1 — DataWorkbench DOM built on first open, not at boot (§PERF-DW-LAZY-BUILD)

**Diagnosis rank 1, ~850 ms of every editor boot** (profile: `_buildDOM` 448 incl +
type-schedule builder 263 + materials matrix 84 + filter bar 50 — all into `dw--hidden`).

- **Files**: EDIT `apps/editor/src/ui/dataworkbench/DataWorkbench.ts` — `_buildDOM()` moved
  out of the constructor into `_ensureDomBuilt()` (first transition out of 'hidden' via
  setMode/show/toggle); pre-open `refresh()` no-ops (the build reads live stores at open —
  strictly fresher than build-at-boot+refresh); pre-open `_switchBucket` keeps bookkeeping
  so a `pryzm-workspace-mode` inspect lands at build; `_show/_hideAuditSheet` guarded.
  `engineLauncher.ts` unchanged (construction site untouched — the constructor is now cheap).
- **Red-first**: NEW `__tests__/lazyBuild.spec.ts` — pre-fix **RC=1**
  (`AssertionError: no #dw-workbench before first open`); post-fix green, including
  build-exactly-once, no duplication, pre-open events safe, requested bucket landing.
- **Adapted (not weakened)**: `L847-shipped-data-surface.spec.ts` and
  `dataPanelChromeDom.spec.ts` asserted DOM presence immediately after `new DataWorkbench()`
  — both now open the panel first; their differentiators (hierarchy sub-tab reachable,
  one-header-band chrome) are asserted unchanged.
- **Suite**: all dataworkbench specs — **8 files / 94 tests green**.
- Observable change: `#dw-workbench` (display:none) absent from the DOM until first open —
  invisible either way; no command/store/undo semantics involved (C03/C11/C16 untouched).

## Fix 4 — memoize the scaled master stylesheet (§PERF-APPTHEME-MEMO)

**Diagnosis rank 4, ~437 ms/boot** (t6+UP+BP: the ~1 MB concatenated sheet regex-scaled
char-by-char on EVERY `injectAppTheme()` call; a dozen panels call it; profile saw ≥2 runs).

- **Files**: EDIT `apps/editor/src/ui/styles/AppTheme.ts` — `_scaledCssCache` keyed by
  `UI_SCALE`; DOM write skipped when bytes identical (no forced CSSOM re-parse);
  self-healing preserved (an externally clobbered sheet is restored on the next call).
- **Red-first**: NEW `apps/editor/src/ui/styles/__tests__/appThemeMemo.spec.ts` — pre-fix
  **RC=1** (`repeat took 47.5ms vs first 31.3ms: expected < 5`); post-fix green.
- **Suite**: all styles specs (incl. `uiScale.spec.ts`, the WCAG clamp contract) —
  **7 files / 101 tests green**.

## Fix 5 — defer the boot default-viewpoint snapshot (§PERF-VIEWPOINT-SNAPSHOT-DEFER)

**Diagnosis rank 5, 560 ms measured** inside `initViewpointsPanel.ts` (`viewpoints.create()`
+ awaited `updateCamera()` on the boot path).

- **Files**: EDIT `apps/editor/src/engine/initViewpointsPanel.ts` — registration moved into
  an idempotent one-shot `captureDefaultViewpointSnapshot` (exposed on the panel result —
  additive key, no caller churn), scheduled via `requestIdleCallback` (timeout 8 s) with a
  `setTimeout(2 s)` fallback. Nothing on the boot path reads the default viewpoint (tables
  render the list reactively; CameraRailPanel shows its empty-state until then). A MID-BOOT
  capture was itself the documented §CAM-ECEF-HANDBACK race (L-746 — mid-boot captures
  recorded positions 4,000 km off), so capturing at first idle lands on the safer side of
  the same race the old code already ran.
- **Red-first**: NEW `apps/editor/src/engine/__tests__/viewpointSnapshotDefer.spec.ts` —
  pre-fix **RC=1** (viewpoint existed synchronously; no capture closure); post-fix green
  (no boot-path create/snapshot; deferred capture creates "Default View", snapshots once,
  idempotent).
- **Declared not-unit-asserted**: the 4-line rIC/timeout scheduling itself (the capture
  closure it invokes is fully asserted). Browser-layer re-profile owed (below).

## Fix 6 — memoize `storesAsRecordView` (§PERF-STORESVIEW-MEMO)

**Diagnosis rank 6** — `apps/editor/src/bootstrap.ts` rebuilt `Object.fromEntries` over
EVERY store on EVERY dispatch (0.117→0.672 ms/dispatch at 1000 walls); its own comment
promised the memo "if it shows up in the bench".

- **Files**: EDIT `apps/editor/src/bootstrap.ts` — `makeMemoizedStoresRecordView`: per-store
  dirty flags via `Store.subscribeDirty` (sound: `applyPatch` is the Store's ONLY mutation
  door — verified: no direct Map mutation anywhere, and even the perf harness wipes via
  `applyPatch`); disposal wired into `tearDown()`. This is THE production provider:
  `bootstrap.everything.ts` → `bootstrap()` is what `composeRuntime` composes.
- **Red-first**: NEW `apps/editor/__tests__/bootstrapStoresViewMemo.test.ts` — pre-fix
  **RC=1** (identity assertions fail; the FRESHNESS assertion passed pre-fix and still
  passes — the C03 behaviour-preservation guard: handlers always see latest state at
  context build). Post-fix green: identity reuse, per-store granularity, freshness after
  add/remove, disposal.
- **Suite**: all 5 bootstrap suites — **26 tests green**. Editor-package tsc error count
  unchanged (1080 = 1080 with HEAD vs fixed bootstrap.ts — control run).
- Measured at the composed runtime: ctx 0.101→0.030 ms (batch), 0.064→0.013 ms (single).
- ⚠ Coordination note (from the diagnosis blocker): `bootstrap.ts` was UNHELD at every
  porcelain re-check this lane made, but the UCE wave owns apps/editor halves — the
  orchestrator should sequence this hunk with them. Same-shape sibling
  `packages/headless/src/minimalHeadlessBootstrap.ts` (unheld) still carries the O(N) copy
  — candidate for the same memo, left untouched to keep blast radius minimal.

---

## Verification gates

- **Root tsc (the Fly build gate)**: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc
  --noEmit --skipLibCheck` → **RC=0, 0 errors** (plain `npx tsc` OOMs at default heap —
  RC=134 — which is why the build script sets 6144).
- Foreground everywhere; every RC read immediately after the command.
- Baseline artefacts untouched: `baseline-inner.json` restored byte-identical (sha1 match);
  `baseline-outer.json` and the cpuprofile never written.

## Refused / deferred (with owners)

- **2b mirror batch bracket** (`runtime-composer/authoritativeElementMirror.ts`) — HELD
  (UCE). PLANNED per diagnosis; note fix 2a already removed 90% of the replay cost.
- **3 loader replay batching** (`ProjectLoader.ts`) — HELD (UCE persistence). PLANNED.
- **7 dynamic-import web-ifc** (`packages/file-format`) — HELD (UCE). PLANNED.
- **8 shader/material sharing** (`packages/renderer/SceneBootstrap.ts` modified by UCE) —
  PLANNED, render wave; program-count probe owed first.
- **9 correctness riders** (door vocab unify; stop advertising the broken
  `runtime.undoStack.undo()` element path) — deliberately NOT applied by this lane: both
  CHANGE behaviour (a refusing path starts working / an advertised surface is withdrawn),
  which this lane's charter forbids for a perf fix ("no fix may change behavior to buy
  speed" — C16 vocabulary + C03 §4.6/4.7 ownership); they belong to a correctness lane.
- **Browser-layer re-profile of fixes 1/4/5** (the ~850+437+560 ms boot savings are
  profile-attributed; the deferral/memo CONTRACTS are spec-proven here) — owed as the
  orchestrator's acceptance run of the outer harness against a fresh production build once
  the UCE wave's tree is buildable; running `npm run build` against a half-landed
  concurrent tree from inside this lane would misattribute any failure.

## Pre-existing failure discovered (not mine)

`packages/geometry-wall/__tests__/WJ1MovePropagateRecompute.measure.test.ts` — "⭐ THE
NON-VACUITY GUARD — without PROPAGATE the move OPENS the joint" fails with `baseSep 0`
**identically at HEAD WallStore** (control run in this lane's transcript). Needs its own
diagnosis; nothing in this lane touches move/propagate.

## Reproduce

```bash
npx tsx tools/perf/wallstore-add-scaling.assert.mts                 # RC=0, caps 120ms/4x
npx tsx tools/perf/diagnose-wallstore-add-bench.mts                 # arm A ≈ arm B now
npx vitest run -c tools/perf/vitest.inner.config.mts                # rewrites baseline-inner.json — back it up first
cd packages/geometry-wall && npx vitest run                         # 1 pre-existing WJ1 failure, see above
npx vitest run apps/editor/src/ui/dataworkbench/__tests__/ \
               apps/editor/src/ui/styles/__tests__/ \
               apps/editor/src/engine/__tests__/viewpointSnapshotDefer.spec.ts
cd apps/editor && npx vitest run __tests__/bootstrapStoresViewMemo.test.ts __tests__/bootstrap*.test.ts
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck
```
