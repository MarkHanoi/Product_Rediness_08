# 04 — Plan Forward (Implementation)

> **Stamp**: 2026-05-16 (reorganised) · **Author**: architecture lead · **Status**: OPERATIVE PLAN  
> **Anchored to**: `../01-VISION.md` (P1–P8 principles, 8 layers, 17 NFTs, 5 customers, discipline rules), `../02-ARCHITECTURE.md` (layered model, `composeRuntime()` contract, 9 convergence booleans), `../03-CURRENT-STATE.md` (live verifiers, honest sub-phase ledger).  
> **Reference (preserved, not authoritative)**: `../reference/plan-detail/01-MASTER-36M.md` (the 36-month master), `../reference/plan-detail/04-LINEAR-EXECUTION.md` (per-PR enumeration), `../reference/wireup-2026/` (the 30-chunk wireup plan + 8 reconciliation audits).  
> **⚠ TRACKER RULE**: Any edit to any file in this folder — whether closing a wave, advancing a task, or correcting a sprint estimate — must update `../00-PROCESS-TRACKER.md` in the same commit.  
> **🗂 ARCHIVE RULE (2026-05-16)**: 28 plan documents have been moved to `archive/` after a full code audit confirmed implementation. See **[`MASTER-IMPLEMENTATION-TRACKER.md`](./MASTER-IMPLEMENTATION-TRACKER.md)** — the single source of truth for what is genuinely complete vs still open.

This folder is the **only operative plan** for getting from `03-CURRENT-STATE.md` to `01-VISION.md`. It expands what was a single 3,600-word file into 16 technically-driven documents with concrete file paths, shell verifiers, code snippets, importer cluster lists, ESLint rules, and rollback procedures — one per concern.

> **2026-04-30 reorganisation**: 4 new files (04–07) were folded in from `reference/wireup-2026/chunks/` to make the canonical plan self-contained on (a) the operator's 8 named end-to-end demos + the architecture↔UI reverse map, (b) the 220-file UI inventory + the 14 click-trail wireups, (c) the per-family + per-toolbar + per-panel wireup ledgers used to assign sub-phase IDs, and (d) the retro-fit / extraction ledger that proves no orphan code at GA. The previously-numbered files 04–11 were renumbered to 08–15. See `../03-CURRENT-STATE.md §10` (2026-04-30 entry) for the move log.

---

## START HERE — Master Tracker

> **[`MASTER-IMPLEMENTATION-TRACKER.md`](./MASTER-IMPLEMENTATION-TRACKER.md)** — Created 2026-05-16 from a full code audit.  
> Contains: live scorecard (§1), architecture reality map (§2), contract compliance matrix C01–C14 (§3), status of all plan documents (§4), open gaps in priority order (§5), and the 8-sprint sequence to reach architectural soundness (§6).  
> **Read this before any other file in this directory.**

---

## Reading order

| # | File | Read first if you... | Length |
|---|---|---|---|
| — | **[`MASTER-IMPLEMENTATION-TRACKER.md`](./MASTER-IMPLEMENTATION-TRACKER.md)** | want the honest status of everything against real code | 15 min · **READ FIRST** |
| 0 | **[`README.md`](./README.md)** (this) | want the full document index | 5 min |
| 1 | **[`01-CRITICAL-PATH-D4.md`](./01-CRITICAL-PATH-D4.md)** | want to know what unblocks everything | 18 min |
| 3 | **[`03-WAVE-2-3-D4-EXECUTION.md`](./03-WAVE-2-3-D4-EXECUTION.md)** | are executing one of the 5 D.4 PRs | 20 min |
| 4 | **[`04-END-TO-END-FLOWS-AND-COVERAGE.md`](./04-END-TO-END-FLOWS-AND-COVERAGE.md)** | are demoing PRYZM at GA, prioritising work against the 8 operator-named flows, or proving every architecture leg has a UI consumer (no orphans) | 25 min |
| 5 | **[`05-UI-INVENTORY-AND-CLICK-TRAILS.md`](./05-UI-INVENTORY-AND-CLICK-TRAILS.md)** | are mapping any of the 220 `src/ui/` files to its sub-phase, or tracing a single user gesture (e.g. *click "Wall" → draw → paint*) end-to-end through the new runtime | 30 min |
| 6 | **[`06-PER-FAMILY-AND-TOOLBAR-LEDGER.md`](./06-PER-FAMILY-AND-TOOLBAR-LEDGER.md)** | are migrating a family plugin (Phase E.1–E.13), wiring a discipline rail (Phase F.1.*), or building a per-family inspector (Phase F.2.*) | 25 min |
| 7 | **[`07-RETRO-FIT-AND-EXTRACTION-LEDGER.md`](./07-RETRO-FIT-AND-EXTRACTION-LEDGER.md)** | are running the Phase H extraction sweep, picking what to lift out of `src/` into a package, or auditing for orphan files before GA | 20 min |
| 8 | **[`08-WAVE-4-SLOT-TYPING-ROUTING.md`](./08-WAVE-4-SLOT-TYPING-ROUTING.md)** | are typing the 8 `unknown` slots or wiring `PlatformRouter.start()` | 12 min |
| 9 | **[`09-WAVE-5-CAST-DELETION.md`](./09-WAVE-5-CAST-DELETION.md)** | are deleting `(window as any)` casts at scale | 15 min |
| 10 | **[`10-WAVE-6-CONVERGENCE.md`](./10-WAVE-6-CONVERGENCE.md)** | are real-binding panels (Phase B) or toolbars (Phase C) | 14 min |
| 11 | **[`11-WAVE-7-CLEANUP-PHASE-F.md`](./11-WAVE-7-CLEANUP-PHASE-F.md)** | are running the post-convergence cleanup or staging Phase F | 14 min |
| 12 | **[`12-DISCIPLINE-AND-DOD.md`](./12-DISCIPLINE-AND-DOD.md)** | are reviewing a PR or proposing a new doc | 10 min |
| 13 | **[`13-RISK-REGISTER.md`](./13-RISK-REGISTER.md)** | are the founder doing a sprint check-in | 10 min |
| 14 | **[`14-VERIFIERS-CATALOG.md`](./14-VERIFIERS-CATALOG.md)** | want every shell command in one place | reference |
| 15 | **[`15-PACKAGE-POPULATION-GAP.md`](./15-PACKAGE-POPULATION-GAP.md)** | want the honest answer to "is end-of-Wave-7 fully wired and bottleneck-free?" (the answer is **NO**, and this file schedules Waves 8–15 that close the gap) | 25 min · **READ FIRST IF YOU ONLY READ ONE FILE** |
| 16 | **[`16-PACKAGE-DEPENDENCY-MAP.md`](./16-PACKAGE-DEPENDENCY-MAP.md)** | want the verified import graph for all 54 packages — who imports whom, which are standalone, the 9 `src/` direct imports, the 16 root-linked packages, and the full reverse index. Added 2026-05-01 (S98-WIRE deep-audit). | 15 min |
| 17 | **[`17-WAVES-9-12-SRC-MIGRATION.md`](./17-WAVES-9-12-SRC-MIGRATION.md)** | are planning or executing the `src/elements` strangler-fig deletion (Wave 9), the `src/core`/commands/styles/services/migration moves (Wave 10), the 21-folder small-folder sweep + cast deletion + recipe completion (Wave 11), or the 46-plugin L8-compliance pass (Wave 12). | 25 min |
| 18 | **[`18-WAVES-13-15-ZERO-WASTE.md`](./18-WAVES-13-15-ZERO-WASTE.md)** | are standing up the 17 NFT benches with real bodies (Wave 13), migrating the ~150 remaining panels/toolbars to `runtime.*` constructor injection (Wave 14), or closing the functional day-1 verifier (Wave 15). | 20 min |
| 19 | **[`19-WAVES-16-20-FULL-WIRE.md`](./19-WAVES-16-20-FULL-WIRE.md)** | are running the `commandBus` + 13 other runtime.* consumption codemod (Wave 16), collapsing the dual-boot path to a single `mountEditor()` entry (Wave 17), activating all 46 plugins via manifest-driven discovery (Wave 18), wiring Phase 2C/2D/3A/3D deliverables (Wave 19), or running the 326-file plugin-SDK migration codemod that closes boolean #1 (Wave 20). | 25 min |
| 20 | **[`20-PHASE-F-PLAN.md`](./20-PHASE-F-PLAN.md)** | are working on the SDK publish (`@pryzm/sdk` npm), the headless package (`@pryzm/headless` npm), the marketplace (`marketplace.pryzm.app`), the 5 reference plugins on the public SDK, or the Phase F exit gate that closes the final 3 of 9 convergence booleans. | 20 min · **READ LAST — Phase F is gated by Wave 20 close** |
| 21 | **[`21-WAVE-14-STATUS.md`](./21-WAVE-14-STATUS.md)** | want the detailed god-file split + 150 panel wiring status for Wave 14 | 10 min |
| 22 | **[`22-WAVE-15-STATUS.md`](./22-WAVE-15-STATUS.md)** | want the functional day-1 gate status for Wave 15 | 8 min |
| 23 | **[`23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md`](./23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md)** | want the detailed L2 command/event bus cleanup plan | 20 min |
| 31 | **[`31-WAVE-L2-BATCH-CREATION.md`](./31-WAVE-L2-BATCH-CREATION.md)** | want the AI floor-plan batch creation wave, from analysis → proposal batching → execution → deferred wall geometry | 20 min |
| 32 | **[`32-TASK-WALL-CURTAINWALL-CMD-BUS-AUDIT.md`](./32-TASK-WALL-CURTAINWALL-CMD-BUS-AUDIT.md)** | are auditing or fixing the `CreateWallsFromSlabCommand` / `CreateCurtainWallCommand` / `ReDetectRoomsCommand` migration from `commandManager.execute()` → `runtime.commandBus.dispatch()`, adding typed `CommandRegistry` entries, creating plugin handlers, and decoupling room redetection via event bus. Phase E.5.x — do not begin until a sprint slot is allocated. | 15 min · 🔴 **TODO (Phase E.5.x)** |
| 33 | **[`33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md`](./33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md)** | are planning or executing the full Phase E.5.x migration of all 214 remaining `commandManager.execute()` sites (41 command types across ~120 files) to `runtime.commandBus.dispatch()`. Includes the full family inventory (F1–F13), priority sequence (P1–P11), the `BatchCoordinator._executeFinalSweep()` fix that eliminates the 5,627ms LONGTASK, three-interface reconciliation checklist (dispatch + undo + events), and cumulative verification gates. **Read file 32 first — it is the proof-of-concept for this scale-out.** | 20 min · 🟢 **P0–P11 ALL DONE (2026-05-04). 2 sites remain: `engineLauncher:1306` + `RemoteCommandDispatcher:84`.** |
| 34 | **[`34-HANDLER-PROTOCOL-GAP-ANALYSIS.md`](./34-HANDLER-PROTOCOL-GAP-ANALYSIS.md)** | want to understand (a) which L2 To-Be requirements apply to ALL element families and ALL batch creation flows (not just walls), (b) the precise current vs. target state for each of the 8 L2 To-Be rows, (c) full C11 handler-contract compliance table across all 177 plugin handlers, (d) batch creation family matrix, and (e) sprint staging for each remaining gap (S03 / S04 / Wave A19+). **Read this before planning any S03 work.** | 20 min · 🟢 **CANONICAL — created 2026-05-04** |
| 35 | **[`35-PROJECT-ISOLATION-WAVE.md`](./35-PROJECT-ISOLATION-WAVE.md)** | are fixing the cross-project state leak that prevents wall/element creation after an AI batch on a prior project. Root cause: `BatchCoordinator._isBatching`, `_wallRebuildPaused`, `_wallRebuildDiscarding` and `_pendingWallEvents` are closure-private and never reset on `pryzm-project-switch`. Fix: `BatchCoordinator.forceReset()` + `window.__engineTeardown.resetWallRebuildState()` + full teardown sequence in `pryzm-project-switch` listener. **Read `C13-PROJECT-LIFECYCLE-AND-ISOLATION.md` first.** | 15 min · 🔴 **TODO — unblocked, 1 sprint** |
| 36 | **[`36-PHASE-D-CTRL-Z-AND-ENGINE-CLEANUP-WAVE.md`](./36-PHASE-D-CTRL-Z-AND-ENGINE-CLEANUP-WAVE.md)** | are wiring Phase D Ctrl-Z via `RingBufferUndoStack` (Sprint A22 — all prep done in A31 + A34), routing `SelectionManager.pick()` through `PickStrategyResolver` to activate GPU picking (closes G20 final wiring), removing the last 2 `commandManager.execute()` sites (`engineLauncher.ts:1306` + `RemoteCommandDispatcher.ts:84`), fixing the `(window as any)` cast regression in `BatchCoordinator.ts:312`, enforcing ring-buffer capacity = 200 (closes G19), adding OTel span `pryzm.undo.apply` (C10 §2), or adding GA gate `check-ctrl-z-wired.ts`. **Read `C03-SCHEMAS-COMMANDS-AND-STATE.md §4` and `34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §5.1` first. Do NOT duplicate Wave 35 tasks I-1–I-8 here.** | 15 min · 🔴 **TODO — unblocked, 1 sprint** |
| 50 | **[`50-PLAN-FORWARD-GAP-ANALYSIS.md`](./50-PLAN-FORWARD-GAP-ANALYSIS.md)** | want the 5 structural gaps (G1–G5) identified at Sprint AU close, with one-line diagnoses and sprint estimates for each | 10 min |
| 51 | **[`51-POST-EXTRACTION-ROADMAP.md`](./51-POST-EXTRACTION-ROADMAP.md)** | want the Phase F-1 through F-5 post-AU roadmap, including the updated 2026-05-16 debt dashboard with all 10 legacy-pattern baselines | 15 min |
| 54 | **[`54-COMPLETE-LEGACY-ELIMINATION-PLAN.md`](./54-COMPLETE-LEGACY-ELIMINATION-PLAN.md)** | want the authoritative **30-sprint execution spec** for eliminating all 1,800+ PRYZM1/2 legacy call sites across `apps/`, `packages/`, and `plugins/`. Covers the three migration axes (window global bus · legacy command path · CustomEvent bus), all 5 new GA gates (Phase 0), per-sprint file targets with ratcheting ceilings, the 5 migration phases (E.5.x / E.stores / E.undo / E.types / F.events / F.storebus / F.cleanup), a per-file migration ledger for ~60 files, and the zero-legacy acceptance script (`scripts/verify-zero-legacy.sh`). **START HERE for any legacy-elimination sprint.** Companion: C14 (pattern catalogue + package classification). | 35 min · 🔴 **ACTIVE — Phase 0 gates first** |

---

## Waves A14–A20: Senior Architect Audit Gap-Closing Sequence

> **Added 2026-05-03** · Source: `attached_assets/Pasted--PRYZM-3-Master-Implementation-Plan-to-100-100…txt` (generated from `06-SENIOR-ARCHITECT-AUDIT.md` + C01–C10 + `01-VISION.md`). These 7 waves raise the codebase from **5.8/10 → 9.8/10** and close all 9 convergence booleans.

| # | File | Read first if you… | Score Δ | Boolean Δ | Length |
|---|---|---|---|---|---|
| 24 | **[`24-WAVE-A14-CI-BACKBONE-SECURITY.md`](./24-WAVE-A14-CI-BACKBONE-SECURITY.md)** | are setting up the GitHub Actions PR-blocking CI pipeline, fixing the DOMPurify XSS gap, wiring OTel to a real collector, adding `/health`, or fixing the EnhancedBloom rAF violation | 5.8 → **6.5** | none (protects existing 5) | 25 min · 🔴 **START NOW** |
| 25 | **[`25-WAVE-A15-RENDERER-THREE.md`](./25-WAVE-A15-RENDERER-THREE.md)** | are implementing `packages/renderer-three/` RendererHandle, routing all 467 THREE importers through it (P2 closure), or implementing the offscreen GPU picking ID buffer | 6.5 → **7.2** | #3 confirmed, #8 unblocked | 30 min · 🔴 **BLOCKER** |
| 26 | **[`26-WAVE-A16-ENGINE-MIGRATION.md`](./26-WAVE-A16-ENGINE-MIGRATION.md)** | are extracting `src/engine/subsystems/` into canonical packages (strangler-fig), wiring the 30 remaining toolbar P6 violations, implementing the undo ring buffer cap, or promoting the BVH spatial index from stub | 7.2 → **7.8** | #1 partial progress | 30 min |
| 27 | **[`27-WAVE-A17-DATA-PERSISTENCE.md`](./27-WAVE-A17-DATA-PERSISTENCE.md)** | are moving IFC parse into a Web Worker, implementing IndexedDB offline cache + "Offline — read only" banner, implementing LTP-ENU geospatial rebasing with proj4js, adding the IFC4X3 exporter, or creating the new C11-GEOSPATIAL.md contract | 7.8 → **8.3** | none (D2 + D5 differentiators unblocked) | 25 min |
| 28 | **[`28-WAVE-A18-QUALITY-GATES-LOD-A11Y.md`](./28-WAVE-A18-QUALITY-GATES-LOD-A11Y.md)** | are writing the 10 Playwright E2E tests, adding ARIA roles + tabIndex to 84+ panels, implementing keyboard orbit in CameraController, building the 3-tier distance-based LOD manager, or wiring visual regression into `packages/bench-visual-diff/` | 8.3 → **8.9** | #6 reinforced (E2E in CI) | 30 min |
| 29 | **[`29-WAVE-A19-YJS-COLLABORATION.md`](./29-WAVE-A19-YJS-COLLABORATION.md)** | are replacing LWW sync with full Yjs CRDT, implementing the CONFLICTED project state + resolution dialog, adding the P8-compliant conflict disclosure banner, or wiring server-authoritative displayName on presence events | 8.9 → **9.2** | D3 differentiator real | 25 min |
| 30 | **[`30-WAVE-A20-PHASE-F-SDK-MARKETPLACE.md`](./30-WAVE-A20-PHASE-F-SDK-MARKETPLACE.md)** | are running the K3-C pre-publish audit, publishing `@pryzm/sdk` + `@pryzm/headless` to npm, building `marketplace.pryzm.app`, adding the PWA manifest + service worker, promoting priority-stub plugins, or running `pnpm tsx scripts/check-pryzm3-exists.ts` | 9.2 → **9.8** | **#7 ✅ #8 ✅ #9 ✅ → 9/9** | 35 min · **READ LAST** |

**For the founder doing a 5-minute review every Friday**: read this README + `13-RISK-REGISTER.md §1` (incident register) + `../03-CURRENT-STATE.md §10` (this week's delta paragraph).

---

## §0 — Scope (what this plan does and does not do)

**This plan does**:
- Replaces every aspirational sprint label with (a) the exact verifier shell command that closes the sprint, (b) the canonical doc clause it traces back to, and (c) the convergence boolean it advances. **Done = the verifier returns the target value, not "the PR landed".**
- Sequences 7 waves over 20 weeks (S78-WIRE → S87-WIRE) with hard exit gates on each wave.
- Names the **single critical-path PR series** (D.4) that unblocks everything else.
- Defines the **convergence point**: 6 of 9 booleans true at end of Wave 6 → Phase F may begin.

**This plan does not**:
- Start Phase F. Phase F (plugin SDK + headless + marketplace) is gated by Wave 6 close per `01-VISION.md §8` rule 4. Starting Phase F early is the highest-impact risk in `13-RISK-REGISTER.md` (R6).
- Touch `packages/plugin-sdk/` non-trivially.
- Add features. The entire 5-month window is structural debt against `01-VISION.md` (P1–P8) and `03-CURRENT-STATE.md §5` (the honest sub-phase ledger). Feature work resumes after Wave 6 (S83-WIRE).
- Pretend the 36-month original plan can still be hit. Calendar slip vs. `reference/plan-detail/01-MASTER-36M.md` is **3.5 sprints** consumed by S72 shortcut absorption. This plan absorbs the slip honestly. Recovery (more engineers, descope F-tail, extend GA-2 by a quarter) is the founder decision at end of Wave 4.

---

## §1 — The 7+1 waves at a glance (Waves 1–8 complete as of 2026-05-01)

```
Wave 1 (S78-WIRE)   weeks 1–2    Stop the bleed         · 3 tripwires + RED-CI quarantine     [P5 P6]   ✅ COMPLETE
Wave 2 (S79-WIRE)   weeks 3–4    D.4.1 + D.4.2          · scene + persistence slices          [P1 P2 P5] ✅ COMPLETE
Wave 3 (S80-WIRE)   weeks 5–6    D.4.3 + D.4.4 + D.4.5  · physics + input + shim              [P3 P5]   ✅ COMPLETE ⟶ boolean 4 ✅
Wave 4 (S81-WIRE)   weeks 7–8    D.5 + Phase E.routing  · typed 14 PryzmRuntime slots; PlatformRouter.start() live  [P5 P6] ✅ COMPLETE
Wave 5 (S82-WIRE)   weeks 9–10   Cast deletion sweep    · 2,070 → 0 (target ≤ 670 hit + cleared) [P6]  ✅ COMPLETE
Wave 6 (S83-WIRE)   weeks 11–12  Phase B + C real bind  · 39 panels + 30 toolbars real-bound  ✅ COMPLETE
                                 ⟶ CONVERGENCE GATE: 5 of 9 booleans true (#2,#3,#4,#5,#6) ⟶ Phase F ⚠ (#7 workspace not npm-published)
Wave 7 (S84–S87-WIRE) weeks 13–20  Cleanup               · rAF=1 ✅, EngineBootstrap DELETED ✅, src/=4 folders ✅  ✅ COMPLETE
                                 ⟶ STRUCTURAL DAY-1: booleans #2,#3,#4,#5,#6 ✅; #1 partial (4 folders, target 1)
Wave 8 (S88–S98-WIRE) weeks 21–22  Package stubs          · @pryzm/snapping (32 LOC) + @pryzm/spatial-index (88 LOC)  ✅ COMPLETE
                                 ⟶ Wave 8 exit gate CLOSED: both linked in node_modules/@pryzm/ ✅; pnpm tsc 0 errors ✅; 1,428/1,428 tests ✅
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Waves 9–15 (S99+)  weeks 23–54  Package population      · ~290k LOC src/→packages/ migration, 46 plugin SDK
                                 conformance, 17 NFT benches, ~150 panel/toolbar real-binds  ⟶ FUNCTIONAL DAY-1
Waves 16–20 (S108+) weeks 55–74 Full wiring             · commandBus codemod (971 callsites), boot unification,
                                 plugin auto-discovery, Phase 2C/2D/3A/3D closeout, 326-file plugin-SDK codemod
                                 ⟶ TRULY-WIRED + FULLY-CONSUMED DAY-1: booleans #1, #7 staged
Phase F (post-W20) weeks 75+    SDK + headless + mkt    · @pryzm/sdk npm publish, @pryzm/headless npm publish,
                                 marketplace.pryzm.app live, 195 sub-phases across 12 F-tracks
                                 ⟶ FULL CONVERGENCE: 9 of 9 booleans true → PRYZM 3 EXISTS
```

> **54 packages, 46 plugins, 12 apps** — verified 2026-05-01. Prior count (49 pkgs, 38 plugins) was wrong. See `16-PACKAGE-DEPENDENCY-MAP.md §8` for verifier commands.

---

## §2 — Calendar with exit gates

| Wave | Sprint(s) | Weeks | Booleans advanced | Hard exit gate (one shell command) | Status |
|---|---|---|---|---|---|
| 1 | S78-WIRE | 1–2 | (infra only) | `pnpm ga-gate` green + 3 tripwires registered | ✅ DONE |
| 2 | S79-WIRE | 3–4 | toward 4 | `wc -l src/engine/EngineBootstrap.ts` ≤ 1,250 AND WorkspaceMountBridge ≤ 3 files | ✅ DONE |
| 3 | S80-WIRE | 5–6 | **4 ✅** | EngineBootstrap.ts ≤ 35 LOC AND WorkspaceMountBridge = 0 | ✅ DONE |
| 4 | S81-WIRE | 7–8 | (14 slots typed; routing live) | `rg "unknown" packages/runtime-composer/src/types.ts` = 0 in PryzmRuntime | ✅ DONE |
| 5 | S82-WIRE | 9–10 | toward 2 | `(window as any)` count ≤ 670 + no-window-cast ESLint at error | ✅ DONE |
| 6 | S83-WIRE | 11–12 | **2 ✅, 3 ✅, 5 ✅, 6 ✅** | `pnpm test:phase-b-binding` + `pnpm test:phase-c-binding` both green | ✅ DONE |
| 7 | S84–S87-WIRE | 13–20 | **rAF=1 ✅, Bootstrap=0 ✅, src/=4 ✅** | `[ ! -f src/engine/EngineBootstrap.ts ]` passes + `ls -d src/*/ \| wc -l` = 4 | ✅ DONE |
| 8 | S88–S98-WIRE | 21–22 | (stubs for Wave 11 migration targets) | `ls node_modules/@pryzm/snapping node_modules/@pryzm/spatial-index` both exist + tsc 0 errors + 1,428/1,428 tests | ✅ DONE |
| 9–15 | S99–S107-WIRE | 23–54 | toward #1 | `pnpm tsx scripts/pryzm-3-functional-day-1.ts` green | ⏳ SCHEDULED |
| 16 | S108–S111-WIRE | 55–62 | (14 runtime.* facets consumed) | `rg "(window as any).commandManager" src/ --type ts \| wc -l` → 0 | ⏳ SCHEDULED |
| 17 | S112-WIRE | 63–64 | (single boot path) | `[ ! -f apps/editor/src/bootstrap-ai.ts ]` ✅ × 5 | ⏳ SCHEDULED |
| 18 | S113-WIRE | 65–66 | (46 plugins auto-discovered) | `pnpm tsx scripts/verify-plugin-discovery.ts` → 46/46 | ⏳ SCHEDULED |
| 19 | S114–S115-WIRE | 67–70 | (Phase 2C/2D/3A/3D wired) | `[ -d apps/export-worker ]` ✅; runtime.sync/visibility/audit reached | ⏳ SCHEDULED |
| 20 | S116–S117-WIRE | 71–74 | **#1 ✅** | `ls -d src/*/ \| wc -l` → 1; plugin L7-violations → 0 | ⏳ SCHEDULED |
| F | post-W20 | 75+ | **#7 ✅, #8 ✅, #9 ✅** | `pnpm tsx scripts/check-pryzm3-exists.ts` → 9/9 TRUE | ⏳ GATED (W20 close) |

**Convergence (5/9 booleans #2,#3,#4,#5,#6 true)**: reached at Wave 6 close (S83-WIRE). Boolean #7 (plugin-sdk npm-published) is ⚠ — workspace package fully implemented at v1.0.0-rc.1 (2,067 LOC) but E404 on npm. **Phase F is unblocked on the implementation side; the npm-publish step is the remaining gate.**

**Structural day-1 (src/ = 4 folders)**: reached at Wave 7 close (S87-WIRE). Boolean #1 requires Wave 11 to fully close (4 → 1 folder). Target: only `src/ui/` remains.

**Functional day-1** (Wave 15 close, S107-WIRE): `src/` = 2 folders; 17 NFT benches real and green; all 46 plugins L8-compliant; 150 panels/toolbars bound to `runtime.*`. Scheduled detail: `18-WAVES-13-15-ZERO-WASTE.md`.

**Truly-wired day-1** (Wave 18 close, S113-WIRE): all 14 runtime.* facets consumed, single boot path, all 46 plugins auto-discovered. Scheduled detail: `19-WAVES-16-20-FULL-WIRE.md §1–§3`.

**Fully Phase-1/2/3-consumed day-1** (Wave 20 close, S117-WIRE): boolean #1 closed (src/ = 1 folder), all 326 plugin importer files on `@pryzm/sdk` only, Phase 2C/2D/3A/3D deliverables wired. Scheduled detail: `19-WAVES-16-20-FULL-WIRE.md §4–§5`.

**PRYZM 3 exists** (Phase F close): 9/9 booleans true — `@pryzm/sdk` + `@pryzm/headless` published on npm, `marketplace.pryzm.app` live. Full execution plan: `20-PHASE-F-PLAN.md`.

---

## §3 — How to use this folder

1. **Every Friday at sprint close**: read `../03-CURRENT-STATE.md §10` (this week's delta), update the §1 metrics table, advance the §8 convergence-boolean table. **Discipline rule 3** of `12-DISCIPLINE-AND-DOD.md`.
2. **Every PR**: the author confirms the PR's verifier (one of the 50+ commands in `14-VERIFIERS-CATALOG.md`) returns the target value before requesting review. **Discipline rule 6**.
3. **Every wave kickoff**: the wave file (e.g. `02-WAVE-1-TRIPWIRES.md`) is read by the team in full at the kickoff meeting. The wave's exit gate is pinned in the team channel.
4. **Every wave close**: the wave file's "Exit gate evidence" section is filled in with the actual shell command output committed alongside the closing PR. No verbal "yes it's done"; only a green shell output.

---

## §4 — Conflict order

When this folder disagrees with another doc:

1. **`../01-VISION.md`** wins on intent — if a wave file proposes work that violates a vision principle, the wave file changes.
2. **`../02-ARCHITECTURE.md`** wins on shape — if a wave file proposes a layer-violating refactor, the wave file changes.
3. **`../03-CURRENT-STATE.md`** wins on facts — if a wave file's "today" numbers contradict §1 of the current-state doc, the wave file is wrong.
4. **This folder** wins on what we are doing about the gap — if `../03-CURRENT-STATE.md` claims something different about the operative plan, current-state changes.

When two files within this folder disagree (e.g. a slice budget in `01-CRITICAL-PATH-D4.md` differs from the verifier in `14-VERIFIERS-CATALOG.md`), the **verifier wins**. The catalog is the source of truth for thresholds; per-wave files are commentary.

---

## §5 — Discipline summary (full text in `12-DISCIPLINE-AND-DOD.md`)

The 6 binding rules — merge blockers, not "best efforts":

1. **Edit, don't fork.** When a discrepancy is discovered, edit the canonical document. Do not write `*-AUDIT-2026-MM-DD.md`. CI lint blocks new top-level docs in `docs/03_PRYZM3/`.
2. **Runtime-only "done".** A sub-phase is done when the runtime behaviour matches the spec. Documentation-only changes do not advance the counter.
3. **Weekly metric refresh.** The 13 verifiers in `../03-CURRENT-STATE.md §1` are re-run every sprint close. Wrong-direction drift on a tripwired metric is an incident.
4. **Phase F gate.** Phase F cannot start until 6 of 9 convergence booleans are true (end of Wave 6).
5. **Spans on every public function** (P8). No span = no merge.
6. **`pnpm ga-gate` is the merge gate.** Workflow-green is necessary but not sufficient; the gate runs the 3 tripwires + 6 cross-cutting CI checks + the 50+ catalog verifiers.

---

## §6 — Pointers into the canonical 4 docs

| If you need... | Read... |
|---|---|
| Why we are doing this work (the principles) | `../01-VISION.md §2` (P1–P8) |
| What "done" looks like architecturally | `../02-ARCHITECTURE.md §6` (target startup flow) and `§8` (the 9 booleans) |
| What is true about the codebase right now | `../03-CURRENT-STATE.md §1` (the 13 verifiers) |
| What was done in Phase 1/2/3 + wireup A→H | `../03-CURRENT-STATE.md §2-§6` |
| The original 36-month plan | `../reference/plan-detail/01-MASTER-36M.md` |
| The original fine-grained per-PR list | `../reference/plan-detail/04-LINEAR-EXECUTION.md` |
| The original 30-chunk wireup plan | `../reference/wireup-2026/` |
| The verified inter-package import graph | `16-PACKAGE-DEPENDENCY-MAP.md` (added S98-WIRE deep-audit) |
