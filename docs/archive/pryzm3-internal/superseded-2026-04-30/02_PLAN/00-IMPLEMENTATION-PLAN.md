# PRYZM 3 — Canonical Implementation Plan

> **Date**: 2026-04-30
> **Status**: CANONICAL — supersedes ad-hoc summaries
> **Source**: distilled from `01-MASTER-36M.md`, `02-SUMMARY.md`, `03-CONVERGENCE.md`, `04-LINEAR-EXECUTION.md`, plus `wireup-S72/00-PLAN.md` and the 28 wireup chunks
> **Discipline**: when the plan changes, **edit this file**. Do not write a new `*-PLAN-2026-MM-DD.md`.

This is the unified canonical implementation plan. Strategic intent is in `00_VISION/`. Architectural shape is in `01_ARCHITECTURE/`. Live progress is in `03_STATUS/`. This document answers: **"What are we building, in what order, against what gates, and what discipline prevents the work from drifting?"**

---

## §0 — Reading order

If you have **5 minutes**: read §1 (current reality) and §6 (the discipline section). Those are the two that matter most.
If you have **20 minutes**: read §1 → §2 (where we are in the 36-month plan) → §6.
If you have **2 hours**: read this whole doc.
If you have **2 days**: read this + `01-MASTER-36M.md` + `03-CONVERGENCE.md` + the 28 wireup chunks.

---

## §1 — Current reality (read this before any planning conversation)

The `03_STATUS/00-CURRENT-STATE-AUDIT.md` is the live brutal scoreboard. Headline numbers **re-verified from HEAD on 2026-04-30** (replacing prior baseline; commands shown so anyone can reproduce):

| Metric | Value | Verifier |
|---|---:|---|
| `(window as any)` total reaches across `src/` | **2,070** | `rg -c '\(window as any\)' src --type ts \| awk -F: '{s+=$2} END {print s}'` |
| `(window as any)` reaches in `src/ui/` only | **777** | `rg -c '\(window as any\)' src/ui --type ts \| awk -F: '{s+=$2} END {print s}'` |
| Files in `src/` containing the cast | **315** | `rg -l '\(window as any\)' src --type ts \| wc -l` |
| `EngineBootstrap.ts` LOC | **2,066** | `wc -l src/engine/EngineBootstrap.ts` |
| `EngineBootstrap` importers | **124** | `rg -l "EngineBootstrap" src apps packages plugins \| wc -l` |
| `composeRuntime.ts` LOC | **845** | `wc -l packages/runtime-composer/src/composeRuntime.ts` |
| `WorkspaceMountBridge` reaching files | **5** (incl. `composeRuntime` + `buildPersistence`) | `rg -l WorkspaceMountBridge` |
| `PlatformRouter.start(...)` callers | **0** | `rg "PlatformRouter\.start\|platformRouter\.start" --type ts` |
| `runtime.tools.register(...)` reaches | **21** in **2** files (`src/ui/Layout.ts` ×20, `src/elements/slabs/SlabTool.ts` ×1 comment) | `rg "runtime\.tools\.register" --type ts` |
| Plugin `contributions.ts` files with ≥1 `kind:` entry | **9 of 9** (each with exactly one stub entry) | `for f in plugins/*/src/contributions.ts; do rg -c 'kind:' "$f"; done` |
| `requestAnimationFrame` owners (vision baseline 58, P3 target = 1) | **68** | `rg -l 'requestAnimationFrame\(' --type ts \| wc -l` |
| Workflows green | **6/9** (red: `pryzm-persistence`, `pryzm-vi-parity`; `ifc-export-tier1` re-running) | workflow status |
| Wireup sub-phases counted done | **~31 of 207** (15%) — `04-LINEAR-EXECUTION` claims **~52 of 452** (11.5%) using a finer slicing | doc cross-read |

**Direction of drift since the last canonical update of this section**: cast count is *up*, EngineBootstrap LOC is *up* by 3 LOC, importers are *up* (110 → 124), rAF owners are *up* (58 vision baseline → 68 today). The §6.3 weekly delta paragraph has not been written for 3 weeks.

**Phase A done · B 1/40 real (≤9 partial via 9 contribution stubs) · C 3/33 · D ~5/14 (D.4 untouched) · E 0/54 productive (PlatformRouter.start has zero callers) · F 9/195 stubs only · G 0 · H 0.**

These numbers shape every decision in this plan. Anyone proposing to start Phase F before Phases A–E close their gates is making the same mistake S72 made. See §6.

---

## §2 — The 36-month frame (where we are)

The original PRYZM 2 → PRYZM 3 plan from `01-MASTER-36M.md` divides into 4 phases × 4 quarters × 6 sprints = 12 quarters / 36 months / S01–S72. Plus a wireup overlay (S73-WIRE → S87-WIRE) for the post-S72 cleanup.

| Phase | Quarter | Months | Sprints | Status today |
|---|---|---|---:|---|
| **1A** Skeleton rails | Q1 | M1–M3 | S01–S06 | ✅ done |
| **1B** Wall end-to-end | Q2 | M4–M6 | S07–S12 | ✅ done |
| **1C** Element families | Q3 | M7–M9 | S13–S18 | ✅ done |
| **1D** Bake PRYZM Alpha | Q4 | M10–M12 | S19–S24 | ✅ done |
| **2A** Non-element completion | Q5 | M13–M15 | S25–S30 | ✅ done |
| **2B** Plan view | Q6 | M16–M18 | S31–S36 | ✅ done |
| **2C** Sheets/schedules | Q7 | M19–M21 | S37–S42 | ✅ done |
| **2D** Sync / awareness / Beta | Q8 | M22–M24 | S43–S48 | ✅ done |
| **3A** AI + visibility | Q9 | M25–M27 | S49–S54 | ✅ done (per phase plan) |
| **3B** IFC + Component Editor | Q10 | M28–M30 | S55–S60 | ✅ done (per phase plan) |
| **3C** Plugin SDK + Marketplace + APIs | Q11 | M31–M33 | S61–S66 | ⚠ partial (SDK scaffold) |
| **3D** Hardening + GA | Q12 | M34–M36 | S67–S72 | ⚠ S72 GA gate signed-off but with the shortcuts catalogued in `00-CURRENT-STATE-AUDIT.md §9` |
| **WIREUP A–H** Post-S72 cleanup | overlay | M37 → ? | S73-WIRE..S87-WIRE | ⚠ **15% done** — the active phase today |

**We are nominally past the 36-month line** (today is M40 vs the M36 GA gate) **but the wireup overlay needed to make GA structurally sound is 15% done.** The honest read is: PRYZM 2 GA shipped as scheduled, then the team discovered the shortcuts in S72, and the wireup overlay (Phases A–H) is the work to retroactively make GA structurally honest. We're 3 months into wireup at 15% pace. Linear extrapolation: ~17 more months to finish wireup vs. the planned 7 more.

---

## §3 — The wireup overlay (Phases A → H)

Source: `wireup-S72/00-PLAN.md` (the 2,304-LOC monolith) and its 28 sliced chunks. Sub-phase counts come from `03_STATUS/01-PROCESS-TRACKER.md §3`.

| Wireup phase | Owner | Sub-phases | Done | What it lands |
|---|---|---:|---:|---|
| **A** Skeleton + identity rails | runtime-composer | 7 | 7 ✅ | Identity contract, package-name conformance, dispose-handle scaffold |
| **B** Annotation panels meet bar | apps/* | 40 | 1 (24 paper) | Each panel emits `viewRegistry.activate`, subscribes to `workspace.modeChanged`, types its props |
| **C** Toolbar binding | apps/shell | 33 | 3 | Each toolbar button dispatches via `commandBus`, no direct store writes |
| **D** Composition root + ServiceLocator deletes | runtime-composer + src/ | 14 | ~5 | `composeRuntime()` becomes the only composition path; `EngineBootstrap.ts` shrinks to <200 LOC; bridge artifacts deleted |
| **E** Routing + cast removal | src/ui/platform | 54 | 0 productive | `PlatformRouter.ts` becomes live in production; `(window as any)` count drops from 773 to <100 |
| **F** Plugin SDK + marketplace | packages/plugin-sdk | 195 | 0 | L6 facade, headless package, REST/WS APIs, marketplace surface |
| **G** Hardening | repo-wide | TBD | 0 | NFTs validated under load; chaos drills; data integrity attacks |
| **H** Per-package compile | repo-wide | TBD | 0 | Each package compiles standalone with its own tsconfig; no monorepo coupling |
| **TOTAL** | | **207 (counted) + G/H** | **~31** | **15%** |

**The 9 booleans of the convergence point** (from `03-CONVERGENCE.md §2`): when all 9 are simultaneously `true`, PRYZM 3 exists as a single clean product. Today **3 of 9 are true**: A complete, ADRs/SPECs clean, monorepo green CI. The other 6 (single composition root, single THREE owner enforced, no window-any, plugin SDK published, headless package published, marketplace live) require Phase D, E, F to land.

---

## §4 — FIX IMPLEMENTATION PLAN — STAMPED 2026-04-30

> **Stamp**: 2026-04-30 · **Author**: architecture lead · **Anchored to**: `00_VISION/02-VISION.md` (P1–P8 principles, D1–D10 differentiators, §6 NFT contracts), `00_VISION/03-AS-IS-VS-TO-BE.md` (8-layer L0→L7.5 As-Is/To-Be deltas, 30-worst-files transformation, 264-command consolidation, 2,078-cast deletion, 58-rAF consolidation, 91-OBC demotion), `01_ARCHITECTURE/00-ARCHITECTURE.md` + `01-LAYERS-AND-PRINCIPLES.md` (10 architectural principles, layered model, dependency rule).
>
> **What this plan does**: replaces every aspirational sprint label with (a) the exact verifier shell command that closes the sprint, (b) the canonical doc clause it traces back to, and (c) the convergence boolean it advances. **Done = the verifier returns the target value, not "the PR landed".**
>
> **What this plan does not do**: it does NOT start Phase F. It does NOT touch `packages/plugin-sdk/` non-trivially. It does NOT add features. The entire 5-month window is structural debt against vision §3 (P1–P8) and AIVT §2 (the 8-layer transformation). Feature work resumes only after Wave 6 (S82-WIRE).

### §4.0 — The single critical-path PR

**D.4 — split `EngineBootstrap.ts` into 5 slices and retire `WorkspaceMountBridge`.** Until this lands, nothing downstream can move:

- **P2 (single THREE owner) is unenforceable** because `EngineBootstrap` instantiates THREE objects across 124 importers — `eslint-plugin-boundaries` cannot turn on without breaking 124 PRs.
- **P3 (one frame owner) is unenforceable** because `EngineBootstrap` constructs `UnifiedFrameLoop` and 6 of the 68 rAF owners live inside it transitively. The custom `eslint-plugin-pryzm-no-raf` rule (vision §3 P3 CI gate) cannot turn on.
- **P5 (mechanical layer boundaries) is unenforceable** because `EngineBootstrap` is L7.5-transitional code that imports L0 (persistence), L4 (kernel), L5 (renderer), L6 (plugin host stubs), L7 (UI panels) all in one file.
- **P6 (no `(window as any)`) cannot make progress** because the cast removal program (Phase E) requires `runtime.tools.register(...)` and `runtime.plugins.contributions(...)` to actually execute in production, which requires `PlatformRouter.start(...)` to be called, which requires the new composition root to own startup, which requires `EngineBootstrap` to step down.

D.4 is sequenced as **5 PRs** per `04-LINEAR-EXECUTION §9` plus the post-merge re-export shim. Each slice has a target LOC range, importer cluster, and verifier command. See §4.2 for the slice schedule.

### §4.1 — Wave map (12 calendar weeks · S78-WIRE → S83-WIRE · 6 two-week sprints)

```
Wave 1 (S78-WIRE)  Stop the bleed         · TRIPWIRES + RED-CI fix     [P5 P6 enforcement infra]
Wave 2 (S79-WIRE)  D.4.1 + D.4.2          · scene + persistence slices  [P1 P2 P5]
Wave 3 (S80-WIRE)  D.4.3 + D.4.4 + D.4.5  · physics + input + shim     [P3 P5]
Wave 4 (S81-WIRE)  D.5 + Phase E.routing  · type the 8 unknown slots; PlatformRouter.start() goes live  [P5 P6]
Wave 5 (S82-WIRE)  Cast deletion sweep    · 2,070 → ≤500                [P6 D2-stability]
Wave 6 (S83-WIRE)  Phase B + C real bind  · 39 panels + 30 toolbars     [§4.5 of plan]
                   ⟶ CONVERGENCE GATE: 6 of 9 booleans true ⟶ Phase F may begin
```

Calendar slip vs. the original `01-MASTER-36M.md` is **3.5 sprints** (the ones consumed by S72 shortcut absorption). This plan does not try to recover the slip; it absorbs it honestly. Recovery is the founder's call (more engineers, descope F-tail, or extend GA-2 by a quarter).

---

### §4.2 — D.4 slice schedule (the load-bearing PR series)

Each slice is **one PR**, blocks merge if its verifier fails, and lists the importer cluster it migrates. Source of LOC budgets: `04-LINEAR §9` cross-checked against current `wc -l src/engine/EngineBootstrap.ts` (2,066). Target end-state per vision §3 P5 + AIVT §2 L4/L5 rows.

| Slice | What moves out | Target file(s) | LOC out of EngineBootstrap | Importer cluster (number to migrate) | Closes verifier |
|---|---|---|---:|---|---|
| **D.4.1** | Scene graph init, camera anchoring, viewport bootstrap | `packages/renderer/src/SceneBootstrap.ts` (new), grow `composeRuntime` `scene` slot | ~480 LOC | 28 importers in `src/engine/subsystems/` and `src/core/views/` | `wc -l src/engine/EngineBootstrap.ts` ≤ **1,600** AND `rg -l "EngineBootstrap" src/core/views/` returns 0 |
| **D.4.2** | Persistence wiring (`buildPersistence` + project-load wiring + `WorkspaceMountBridge` retirement #1) | `packages/persistence-client/src/bootstrap.ts`, delete `packages/runtime-composer/src/buildPersistence.ts`'s use of the bridge | ~350 LOC | 22 importers in `src/services/`, `src/data/`, `src/ui/dataworkbench/` | `wc -l` ≤ **1,250** AND `rg -l WorkspaceMountBridge` ≤ **3** files |
| **D.4.3** | Physics + collision setup | `packages/physics-host/src/bootstrap.ts` (new), surface as `runtime.physics` slot | ~280 LOC | 14 importers in `src/physics/`, `src/tools/` | `wc -l` ≤ **970** AND `rg -l "EngineBootstrap" src/physics/` returns 0 |
| **D.4.4** | Input/keyboard/pointer wiring + selection bootstrap | `packages/input-host/src/bootstrap.ts` (new), surface as `runtime.input` slot | ~340 LOC | 19 importers in `src/tools/`, `src/ui/Layout.ts`, `src/ui/platform/PlatformShell.ts` | `wc -l` ≤ **630** AND `rg -l "EngineBootstrap" src/tools/` returns 0 |
| **D.4.5** | Re-export shim for the residual 30+ importers that still type-reference `EngineBootstrap` (delete in Wave 5) | `src/engine/EngineBootstrap.ts` becomes a 30-LOC `export { … } from '@pryzm/runtime-composer'` shim | ~430 LOC removed; net file = **30 LOC** | residual ~41 importers; deferred batch-rewrite | `wc -l` ≤ **35** AND `rg -L "EngineBootstrap" src apps packages` count drops by ≥ 80 vs. start of D.4 |

**D.4 exit gate** (Wave 3 close): `wc -l src/engine/EngineBootstrap.ts` ≤ 35 · `rg -l WorkspaceMountBridge` returns 0 · `rg -L "EngineBootstrap" src apps packages \| wc -l` ≤ 50 (down from 124) · all 4 new packages have a `package.json` `forbiddenDependencies` ESLint rule that blocks `three`/`react`/`@thatopen/components` imports per vision §3 P1.

**Discipline note (§6.5)**: every slice PR must add at least one OpenTelemetry span to comply with vision §3 P8 ("every PR that adds a new public function must add at least one span"). Spans named `pryzm.bootstrap.scene`, `pryzm.bootstrap.persistence`, `pryzm.bootstrap.physics`, `pryzm.bootstrap.input`.

---

### §4.3 — Wave 1 (S78-WIRE, weeks 1–2) — Stop the bleed + tripwire infrastructure

The two weeks before D.4 begins. Purpose: install the CI gates so D.4 cannot regress.

| # | Task | Verifier | Anchored to | Effort |
|---|---|---|---|---|
| 1 | **Add `EngineBootstrap.ts` LOC tripwire to `pnpm ga-gate`**: hard-fail at >2,100 LOC (regression gate); soft-warn at >200 LOC (vision target). Implementation: a 30-line node script in `tools/ga-gate/check-engine-bootstrap-loc.ts`. | `pnpm ga-gate` exits non-zero on a synthetic >2,100-LOC commit; passes on HEAD | Vision §3 P5 CI gate; §6.3 of this plan | 1 day |
| 2 | **Add `(window as any)` cast-count tripwire to `pnpm ga-gate`**: hard-fail if commit-over-commit count increases. Counter implementation: `rg -c '\(window as any\)' src --type ts \| awk -F: '{s+=$2} END {print s}'`, baseline written to `.ga-gate/baselines/cast-count.json`. | `pnpm ga-gate` blocks a PR that adds a new `(window as any)`; passes on a PR that removes one or stays flat | Vision §3 P6 + AIVT §5 (the 2,078-cast deletion plan); §S78-WIRE.1 of this plan (the prior text) | 2 days |
| 3 | **Add rAF-owner tripwire**: hard-fail if `rg -l 'requestAnimationFrame\(' --type ts \| wc -l` exceeds today's value of 68. Soft-warn at any count > 1 (vision §3 P3 absolute target). | `pnpm ga-gate` fails on a synthetic new rAF; passes on HEAD | Vision §3 P3 + AIVT §6 (58 → 1 consolidation plan) | 1 day |
| 4 | **Quarantine the 3 red workflows.** Move `pryzm-persistence` and `pryzm-vi-parity` to `pnpm test:quarantined` with a tracking issue; restore once D.4.2 (which touches persistence) and Wave 5 (which touches visibility-intent casts) close. Re-run `ifc-export-tier1` to confirm the transient flake. | `pnpm test:ci` reports 7/7 green (the 7 currently-green workflows); quarantined list documented in `03_STATUS/00-CURRENT-STATE-AUDIT.md §1` | §6.3 of this plan; honesty over green-CI theatre | 2 days |
| 5 | **Add the §6.3 weekly delta paragraph to `03_STATUS/00-CURRENT-STATE-AUDIT.md`** (Friday cron — manually for now). The delta paragraph hasn't been written for 3 weeks; backfill the 3 missing entries with the live numbers from §1 of this doc. | `03_STATUS/00-CURRENT-STATE-AUDIT.md` has a §6 entry dated 2026-04-30 | §6.3 of this plan | 0.5 day |
| 6 | **Update `01-PROCESS-TRACKER.md §1`** to reflect 7/9 green after quarantine. | Doc reads consistently with §S78-WIRE.4 result | §6.6 of this plan | 0.25 day |
| 7 | **Doc-link sweep**: `sed`-replace broken references to `00_NEW_ARCHITECTURE/` → `docs/archive/pryzm3-internal/01_ARCHITECTURE/` and `wireup-S72/chunks/` → `docs/archive/pryzm3-internal/wireup-S72/chunks/` across `02_PLAN/`, `03_STATUS/`, and `00_VISION/`. Owner: `02_PLAN/07-GAP-CLOSURE.md` per its existing scope. | `rg "00_NEW_ARCHITECTURE/" docs/` returns 0 hits | §6.6 of this plan | 0.5 day |

**Wave 1 exit gate**: `pnpm ga-gate` is green AND has 3 new tripwires (LOC, cast, rAF) AND `03_STATUS/00-CURRENT-STATE-AUDIT.md` reads consistently with the live numbers in §1 above.

---

### §4.4 — Waves 2–3 (S79-WIRE, S80-WIRE, weeks 3–6) — D.4 slice execution

Per §4.2 above. Five PRs across two sprints. PRs 1–2 in S79-WIRE, PRs 3–5 in S80-WIRE.

**S79-WIRE deliverables**:
- D.4.1 PR merged → `wc -l src/engine/EngineBootstrap.ts` ≤ 1,600.
- D.4.2 PR merged → `wc -l` ≤ 1,250 AND `WorkspaceMountBridge` reach drops to ≤ 3 files.
- Open tracker tickets for the 41 D.4.5 importers — these are the rewrite batch that follows the shim.

**S80-WIRE deliverables**:
- D.4.3 PR merged → `wc -l` ≤ 970, physics package extracted to `packages/physics-host/`.
- D.4.4 PR merged → `wc -l` ≤ 630, input package extracted to `packages/input-host/`.
- D.4.5 PR merged → `wc -l` ≤ 35 (re-export shim only) AND `WorkspaceMountBridge` reach = 0 AND `eslint-plugin-boundaries` rule for L4/L5 turns on (vision §3 P5 CI gate first activation).
- **`composeRuntime()` is now the only composition path.** `src/main.ts` calls `composeRuntime()` and the returned `runtime` object is the only thing handed downstream. The 5 post-`composeRuntime` singleton-injection sites in `src/main.ts` (lines 172, 242, 253 etc.) are deleted in favour of typed `runtime.*` access.

**Wave 3 exit gate** (= D.4 exit gate from §4.2): all 5 verifiers green.

This is the **single highest-leverage 4 weeks in the plan.** Closing it unblocks Phases C, E, and F simultaneously.

---

### §4.5 — Wave 4 (S81-WIRE, weeks 7–8) — `composeRuntime` slot typing + routing live

Two parallel tracks, both shipping in this sprint.

**Track A — Type the 8 `unknown` slots in `composeRuntime.ts`** (vision §3 P1 + P5; AIVT §2 L4 row):

| # | Slot | Today | Target type | Owner package |
|---|---|---|---|---|
| 1 | `viewRegistry` | `unknown` warn-stub | `ViewRegistry` interface | `packages/view-state/` |
| 2 | `cameraController` | `unknown` warn-stub | `CameraController` interface | `packages/view-state/` |
| 3 | `workspaceMode` | `unknown` warn-stub | `WorkspaceModeController` | `packages/runtime-composer/src/workspace/` |
| 4 | `workspace` slot | `unknown` warn-stub | `WorkspaceSurface` (replaces `WorkspaceMountBridge` per D.4.2) | `packages/renderer/` |
| 5 | `picking` | `unknown` warn-stub | `Picker` interface | `packages/picking/` |
| 6 | `physics` | (new from D.4.3) | `PhysicsHost` | `packages/physics-host/` |
| 7 | `input` | (new from D.4.4) | `InputHost` | `packages/input-host/` |
| 8 | `frame` | partial typed | `FrameScheduler` (single rAF owner per P3) | `packages/frame-scheduler/` |

Verifier: `rg "unknown" packages/runtime-composer/src/types.ts` returns 0 hits in the `PryzmRuntime` interface; `rg "as unknown as" packages/runtime-composer/src/` returns 0 hits.

**Track B — `PlatformRouter.start(...)` becomes live** (AIVT §2 L7 row; this plan §1 metric "PlatformRouter.start callers = 0"):

1. `src/main.ts` calls `platformRouter.start({ runtime, defaultRoute: 'editor' })` immediately after `composeRuntime()` resolves.
2. Router subscribes to `runtime.workspace.modeChanged`; mounts the right top-level panel per route.
3. `ToolsPanelController.ts:48` is updated to receive `runtime` from the router constructor (not `null`).
4. **Boundary lint turns on for L7 → L0 imports**: any `import` from `src/ui/` to `src/services/persistence/` is blocked; access goes through `runtime.persistence.*`.

Verifier: `rg "PlatformRouter\.start" --type ts` shows ≥ 1 caller in `src/main.ts`; production console log shows `[platform.router] start(route=editor)` on cold boot; `pnpm ga-gate` boundary-lint pass turns on.

**Wave 4 exit gate**: Track A + Track B verifiers all green. **At this point the architecture in `01_ARCHITECTURE/00-ARCHITECTURE.md §6` is finally the actual production path.**

---

### §4.6 — Wave 5 (S82-WIRE, weeks 9–10) — Cast deletion sweep + Phase E productive

Per AIVT §5 ("the 2,078 `(window as any)` deletion plan"). Now that `runtime.*` is real and typed, casts can drop. Per-pattern plan:

| Pattern (from AIVT §5) | Today reaches | Wave 5 target | Replacement |
|---|---:|---:|---|
| `(window as any).<service>` cross-module access | ~1,400 | **≤ 500** | `runtime.<service>` (typed) |
| `(window as any).<store>` store access | ~340 | **≤ 100** | `runtime.stores.<id>` selector |
| `(window as any).<builder>` / `<command>` | ~180 | **≤ 30** | `runtime.commandBus.execute({type, payload})` |
| `(window as any).debug*` / `dev*` | ~110 | unchanged this wave | gated by `import.meta.env.DEV` (later sweep) |
| Genuine window globals (legacy export) | ~40 | unchanged | confined to `src/legacy/window-shim.ts` (created this wave) |
| **TOTAL src/** | **2,070** | **≤ 670** | — |

Target: **≥ 1,400 casts deleted in 2 weeks** (140/day, 5 engineer-days × 280/day = 1,400). This is aggressive but mechanical: most are search-and-replace once `runtime.*` exists. The 1,400 are concentrated in 96 files in `src/ui/`; per-file LOC sweeps are bounded.

**Wave 5 also closes Phase E routing**: `(window as any).commandManager` (the highest-frequency single cast, ~210 reaches) is replaced by `runtime.commandBus`. **CI gate per vision §6.3**: cast tripwire baseline is reset to the new value at sprint close.

**Wave 5 exit gate**: `rg -c '\(window as any\)' src --type ts` total ≤ 670 AND `eslint-plugin-pryzm` adds the `no-window-cast` rule with allowlist = only `src/legacy/window-shim.ts`.

---

### §4.7 — Wave 6 (S83-WIRE, weeks 11–12) — Phase B + C real binding · CONVERGENCE

Two parallel sweeps to close B and C as the on-ramp to Phase F.

**Phase B real binding (39 annotation panels)**: each panel currently emits `viewRegistry.activate` only on paper (the 24 "paper" closures from `02-LATEST-PHASES-AUDIT`). Real binding = each panel:
1. Calls `runtime.viewRegistry.activate({panelId, viewSpec})` on mount.
2. Subscribes to `runtime.workspace.modeChanged` for workspace-aware panels.
3. Types its `props` interface against `packages/contracts/PanelProps.ts`.

Verifier per panel: a Vitest test asserting that mounting the panel calls `runtime.viewRegistry.activate` once and unsubscribes on unmount. **CI gate**: `pnpm test:phase-b-binding` must pass.

**Phase C toolbar binding (30 toolbars)**: each toolbar button currently dispatches via `(window as any).commandManager.execute(...)`. Real binding = `runtime.commandBus.execute({type, payload})` with the typed `Command<T>` shape from `packages/command-bus/`.

Verifier per toolbar: a Vitest test asserting button click dispatches a typed command on `runtime.commandBus` and that the command handler is registered.

**Wave 6 + convergence gate** — at this point the **9 booleans** of `03-CONVERGENCE.md §2` should read:

| # | Convergence boolean | Today | After Wave 6 |
|---:|---|:---:|:---:|
| 1 | Phase A complete | ✅ | ✅ |
| 2 | All ADRs and SPECs live | ✅ | ✅ |
| 3 | Monorepo CI green on all packages | ⚠ (3 quarantined) | ⚠ (still 2 quarantined; closes in Wave 7) |
| 4 | Single composition root (`composeRuntime`) | ❌ | ✅ |
| 5 | Single THREE owner (P2 enforced) | ❌ | ✅ (boundary lint on) |
| 6 | No `(window as any)` (P6 enforced) | ❌ | ⚠ (≤ 670, target = 0; rest in Wave 7) |
| 7 | Plugin SDK 1.0 published | ❌ | ❌ (Phase F starts now) |
| 8 | `@pryzm/headless` published | ❌ | ❌ (Phase F sub-track) |
| 9 | Marketplace live | ❌ | ❌ (Phase F sub-track) |

**6 of 9 booleans true at end of Wave 6.** Phase F may begin per discipline §6.4. The remaining 3 booleans (7, 8, 9) are the Phase F deliverables themselves and the post-Wave-6 calendar.

---

### §4.8 — Post-convergence (S84-WIRE → S87-WIRE, weeks 13–20) — Wave 7

Wave 7 is the wrap-up that delivers booleans 6 and 3 fully and stages booleans 7–9:

- **Cast count 670 → 0**: per-package final sweep, including the legacy `src/legacy/window-shim.ts` retirement at S87-WIRE.
- **De-quarantine `pryzm-persistence`** (now that D.4.2 is in) and **`pryzm-vi-parity`** (now that Wave 5 deleted the visibility-intent casts).
- **rAF consolidation 68 → 1** per AIVT §6: merge the 27 misc rAF owners into `runtime.frame.requestFrame('interaction')`, delete the 8 render-pipeline rAFs (use scheduler dirty flags), delete the 5 AI rAFs (push-driven from event log).
- **30-worst-files transformation start** per AIVT §3: `PropertyPanel.ts` (3,347), `SheetEditorPanel.ts` (2,923), `PropertyInspector.ts` (2,852), `initUI.ts` (2,770) are decomposed into their AIVT-§3 target files. This is the first wave of the L7 cleanup that spans S37–S60 in the original plan; we re-anchor here because Wave 6 unblocks it.

**Wave 7 exit gate** (= full convergence): all 9 booleans true; `pnpm ga-gate` zero-violations on a strict-config run; `EngineBootstrap.ts` deleted (the 30-LOC shim removed); the 27 NFT bench targets in vision §6 begin running in CI (the `apps/bench/*` shells exist; this is when they get measurements against the targets).

---

### §4.9 — Calendar summary

| Wave | Sprint | Weeks | Booleans advanced | Key gate |
|---|---|---|---|---|
| 1 | S78-WIRE | 1–2 | (infra only) | 3 tripwires live; 7/7 green CI; weekly delta paragraph restarted |
| 2 | S79-WIRE | 3–4 | toward 4 | EngineBootstrap ≤ 1,250 LOC; `WorkspaceMountBridge` ≤ 3 files |
| 3 | S80-WIRE | 5–6 | **4 ✅** | EngineBootstrap = 30-LOC shim; D.4 closed; boundary lint on for L4/L5 |
| 4 | S81-WIRE | 7–8 | **5 ✅** | composeRuntime fully typed; PlatformRouter.start live; boundary lint on for L7 |
| 5 | S82-WIRE | 9–10 | toward 6 | Cast count 2,070 → ≤ 670; `eslint no-window-cast` on |
| 6 | S83-WIRE | 11–12 | (39 + 30 panel/toolbar bindings) | Phase B + C real-binding tests pass; **6 of 9 booleans true → Phase F unblocked** |
| 7 | S84-87-WIRE | 13–20 | **3 ✅, 6 ✅** + Phase F start | Cast count = 0; rAF count = 1; 27 NFT benches running; Phase F begins on a clean foundation |

**Convergence (6/9 booleans) at end of S83-WIRE = week 12 = ~3 calendar months.** Full convergence (9/9) at end of S87-WIRE = week 20 = ~5 calendar months. **Phase F (booleans 7, 8, 9) is then a separate ~22-sprint program against the AIVT §3 + AIVT §4 + AIVT §6 targets** — the founder-decision point on staffing/descope/timeline.

---

### §4.10 — How to read progress against vision

Every sprint close, three things happen in `03_STATUS/00-CURRENT-STATE-AUDIT.md`:

1. **The §1 metrics table is re-run** (the 13 verifiers from §1 of this doc). Any positive delta on a tripwired metric is an incident.
2. **The convergence-boolean table from §4.7** is re-rendered with current truth values.
3. **The vision NFT bench table from `00_VISION/02-VISION.md §6`** gets one column added: "S78-WIRE measured value" → "S79-WIRE measured value" → … so the team can watch the contract numbers approach (or drift from) the GA targets continuously, not at GA-1 sprint.

This is the §6.3 weekly discipline operationalised. Without (1)+(2)+(3), the plan is "another doc". With them, the plan is the metric and the metric is the plan.

---

## §5 — Phases beyond convergence (post-GA roadmap)

After the 9 booleans converge:

- **Phase 4** (`phases/PHASE-4-POST-GA/4-BIM2-CLOSURE.md`): BIM 2 closure. M37–M42 in the original calendar; realistically M50+ at current pace. SPECs 32–48 are normative. Adds the post-GA features that Phase 1–3 deferred (advanced sheets, multi-user awareness graph, bidirectional Revit live-link).
- **Phase 5** (`02_PLAN/05-POST-GA-ROADMAP.md`): BIM 3 vision. Calendar TBD post-Phase-4. Adds AI-native parts of the platform (auto-coordination, code-checking, generative options).
- **AEC wishlist** (`02_PLAN/06-AEC-WISHLIST.md`): the parking lot of customer requests that are accepted-in-principle but not yet phased.

These are aspirational and **must not** be planned against until convergence. The discipline §6.4 makes this binding.

---

## §6 — DISCIPLINE (binding rules — the answer to "no shortcuts")

This is the section the founder asked for: the rules that prevent S72-style shortcuts from recurring.

### 6.1 — A sub-phase is "done" only when runtime behavior matches spec

Documentation annotations do not advance the sub-phase counter. The "annotation sweep counted as binding" pattern (the Phase B 24/40 paper count vs 1/40 real count, see audit §9) is the canonical example of what this rule prevents.

**Test**: for any sub-phase claimed "done", a reviewer must be able to write a failing test against the pre-state and a passing test against the post-state. If the same test passes against both, the sub-phase is not done.

### 6.2 — When a discrepancy is discovered, EDIT the canonical document

Do not write `PHASE-X-AUDIT-2026-MM-DD.md`. Do not write `PHASE-X-RE-AUDIT-2026-MM-DD.md`. Do not write `PHASE-X-CODE-VS-SPEC-AUDIT-2026-MM-DD.md`. The 17-document Phase-1 audit trail in `archive/superseded-audits/phase-1-audit-trail/` is what happens when this rule is violated.

**The exception**: a Phase exit gate may produce one canonical document (e.g. `00-CANONICAL-PHASE-3D-GA-GATE.md`). Per-sprint audits are forbidden.

### 6.3 — Cast count and EngineBootstrap LOC are reported weekly

`03_STATUS/00-CURRENT-STATE-AUDIT.md §6` (cast count) and §5 (EngineBootstrap LOC) get a row added every Friday. Direction matters more than absolute number — any week with a positive delta is an incident requiring a written paragraph in §6 of the audit.

### 6.4 — Phase F does not start before Phases A–E close their gates

The convergence boolean (§3) is binary. Phase F is **not** allowed to start sub-phases until D and E have shipped their exit gates. This rule has teeth: PRs that touch `packages/plugin-sdk/` non-trivially are blocked at review until D and E are green.

The reasoning: building the public SDK on top of a partial composition root and a 773-cast UI layer means every plugin author becomes a regression-tester for our own internal cleanup. That breaks our SDK promise on day one.

### 6.5 — The "unknown" type in production code is a Phase D exit gate

`unknown`-typed slots in `composeRuntime()`, `unknown`-typed parameters in public package APIs, and `as unknown as ...` casts in any L0–L4 package fail Phase D exit. (`src/` and `apps/` are exempt during the wireup overlay, but get the gate when their respective phases close.)

### 6.6 — The plan changes by editing this file, not by writing a new plan

`02-SUMMARY.md`, `03-CONVERGENCE.md`, `04-LINEAR-EXECUTION.md` are reference material. **This file is the operative plan.** When sequencing changes, this file changes. The other documents may be updated to stay consistent or marked superseded — but this file is what the team executes against.

---

## §7 — Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Founder/team starts Phase F before D/E close | **High** | **Catastrophic** | §6.4 hard rule; PR-level enforcement |
| Cast count keeps drifting | Medium | High | §6.3 weekly report; §S78-WIRE.1 hard-fail soft-gate |
| `WorkspaceMountBridge`-style bridge artifacts get re-introduced under new names | Medium | High | Boundary lint config gets a denylist; new names added to denylist on detection |
| 3 red workflows mask new failures | Medium | Medium | §S78-WIRE.2 fix-or-quarantine within 2 weeks |
| Velocity stays at 3 sub-phases/sprint when plan needs 11 | High | High | Founder conversation: more engineers, descope, or extended timeline. Not the architect's call. |
| Doc corpus grows back to 200+ files | Medium | Medium | §6.2 edit-the-canonical rule; archive grows, active set stays bounded |

---

## §8 — Cross-references

- **For the strategic anchor**: `00_VISION/02-VISION.md`
- **For the architectural shape**: `01_ARCHITECTURE/00-ARCHITECTURE.md`
- **For the brutal current state**: `03_STATUS/00-CURRENT-STATE-AUDIT.md`
- **For the legacy 36-month plan (reference)**: `02_PLAN/01-MASTER-36M.md`
- **For the convergence point definition**: `02_PLAN/03-CONVERGENCE.md`
- **For the wireup chunk-by-chunk detail**: `wireup-S72/chunks/00-INDEX.md`
- **For per-sprint detail of upcoming work**: `wireup-S72/reconciliation/00-INDEX.md`
