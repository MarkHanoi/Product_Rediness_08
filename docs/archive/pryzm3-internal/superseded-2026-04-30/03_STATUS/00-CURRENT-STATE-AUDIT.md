# PRYZM 3 — Current State Audit (Brutal Edition)

> **Date**: 2026-04-30
> **Author**: Architect-pass
> **Audience**: Founder + anyone who needs to know what's actually true today
> **Sibling docs**: `01-PROCESS-TRACKER.md` (the live ledger — also brutal in places, rosy in others), `02-LATEST-PHASES-AUDIT.md` (the 2,220-LOC missing-items deep dive)

This is the **single source of truth for "what is the codebase actually doing today?"** It will replace, not supplement, drift-prone summaries. When a discrepancy is discovered, **edit this document.** Do not write a new `*-AUDIT-2026-MM-DD.md`. The whole reason the doc corpus exploded to 226 files was that exact pattern.

Every claim in this document is evidence-cited. Numbers are reproducible with `rg` or `wc -l` in 30 seconds.

---

## §1 — TL;DR (the four sentences)

1. The codebase has shipped **~31 of 207 sub-phases** (15%) of the post-S72 wireup. Phase A (7/7) and Phase D.5–D.7 (~5/14) are the only fully landed bands. Phases B (1/40), C (3/33), E (0–15/54), and F (0/195) are at the start line or earlier.
2. **`(window as any)` casts in `src/ui/` total 773 across 96 files** — drifted *up* from the 764 baseline that Phase E was supposed to drive *down*. The cast removal program is going the wrong direction.
3. **`EngineBootstrap.ts` is 2,063 LOC and still owns wiring** that the architecture said `composeRuntime()` would own. **`WorkspaceMountBridge` is alive in 5 files** including the new `composeRuntime.ts` itself — meaning the new composition root is wiring through the legacy bridge it was designed to replace.
4. **3 of 9 workflows are red right now**: `ifc-export-tier1`, `pryzm-persistence`, `pryzm-vi-parity`. `01-PROCESS-TRACKER.md §1` claims "9/9 green" — that claim is stale.

---

## §2 — Evidence (commands you can run yourself)

| Claim | Command | Result (2026-04-30) |
|---|---|---|
| `(window as any)` casts in `src/ui/` | `rg '\(window as any\)' src/ui \| wc -l` | **773** |
| Files containing those casts | `rg -l '\(window as any\)' src/ui \| wc -l` | **96** |
| `EngineBootstrap.ts` line count | `wc -l src/engine/EngineBootstrap.ts` | **2,063** |
| `composeRuntime.ts` line count | `wc -l packages/runtime-composer/src/composeRuntime.ts` | **845** |
| Files referencing `WorkspaceMountBridge` | `rg -l 'WorkspaceMountBridge' src packages apps` | **5** (`src/main.ts`, `src/ui/platform/PlatformRouter.ts`, `packages/runtime-composer/src/{types,composeRuntime,buildPersistence}.ts`) |
| Workflow status | `<system_log_status>` in env | **6/9 green, 3/9 red** |

If any of these change, **update this row.** Don't write a new audit.

---

## §3 — `composeRuntime()` slot-by-slot reality

The architecture says `composeRuntime()` is the single composition root that returns a fully-typed `PryzmRuntime` handle. Reality of the 845-LOC `packages/runtime-composer/src/composeRuntime.ts`:

| Slot | Typed? | Real or stub? | Notes |
|---|---|---|---|
| `events` | ✅ typed | real | EventBus wired |
| `commandManager` | ⚠ `LegacyCommandManagerLike` from `(window as unknown as { commandManager? })` | **stub** | Falls back to a global window stash. The "single composition root" reads from window. |
| `commandRegistry` | ⚠ `ReadonlyMap<string, unknown>` | partial | Inner registry is typed `unknown`. Defensive readers all over. |
| `viewRegistry` | ⚠ activate path emits to bus, registry typed `unknown` | partial | |
| `syncClient` | ❌ `unknown` | **stub** (`buildSyncSlot(client: unknown)`) | Defined as `unknown`; `cached: unknown \| null = null` |
| `workspace` | comment says "D.9-prep" + "**placeholder slots**" | **placeholder** | Text in file: `// 4c. D.9-prep — workspace + cameraController placeholder slots` |
| `cameraController` | placeholder per same comment | **placeholder** | |
| `renderer` | typed `unknown` (lines around line 700) | **stub** | |
| `scheduler` | typed `unknown` | **stub** | |
| `materialPool` | typed `unknown` | **stub** | |
| `persistence` | imported from `buildPersistence.ts` which itself references `WorkspaceMountBridge` | **leaks legacy bridge into the new composition root** | |

**Reality**: out of ~14 declared slots, **~6 are real** and the rest are `unknown`-typed placeholders or fall back to `(window as ...)` reads. The "single composition root" is currently a partial composition root with a window-global escape hatch.

This is **not** an indictment of the work done so far — Phase D got the scaffold landed. It is an indictment of any document claiming `composeRuntime()` "owns" wiring today. It does not. Phase D is ~5 of 14 sub-phases done.

---

## §4 — `WorkspaceMountBridge` resurrection (Phase D.4 violation)

Phase D.4 deletion ledger explicitly named `WorkspaceMountBridge` for removal. It is now referenced in 5 files including the new `composeRuntime.ts` and `buildPersistence.ts`. Re-introducing a thing under the new system that the new system was created to delete is **the exact failure mode** the architecture warns against.

**Status**: re-introduced. **Action required**: net delete or formally reclassify Phase D.4 as descoped — but do not pretend it was deleted.

---

## §5 — `EngineBootstrap.ts` is the real composition root

2,063 LOC. The architecture says `composeRuntime()` (845 LOC, partial) replaces it. Today **both exist and `EngineBootstrap.ts` is the one that runs in production** because `composeRuntime()`'s outputs flow back through `EngineBootstrap.ts`'s wiring.

**This is acceptable as a transitional state.** It is **not acceptable** to claim Phase D is done while `EngineBootstrap.ts` retains 2,000+ LOC of wiring responsibility.

---

## §6 — The cast inventory (Phase E reality)

Phase E was supposed to monotonically reduce `(window as any)` toward zero. Counts over the documented baselines:

| Date | `(window as any)` in `src/ui/` | Direction |
|---|---:|---|
| Phase E start (per S72 monolith) | 764 | baseline |
| 2026-04-29 (audit) | 776 | +12 (drift) |
| **2026-04-30 (today)** | **773** | **-3 vs yesterday, +9 vs baseline** |

Phase E sub-phase scoreboard claims **0–15/54 done** depending on which document you read. The actual production routing path that Phase E was supposed to enable is **dead code** — it's defined in `PlatformRouter.ts` but the production entrypoint never invokes it. (Cross-reference: `wireup-S72/reconciliation/05-phase-E-audit-and-plan.md`.)

**Status**: Phase E is in a worse position than the cast count suggests, because the routing layer Phase E was supposed to install is unreachable in the running app.

---

## §7 — The phase ledger (honest)

| Phase | Sub-phases done | Total | % | Notes |
|---|---:|---:|---:|---|
| **A** Skeleton + identity rails | 7 | 7 | **100%** | Genuinely done. |
| **B** Annotation panels meet bar | 1 | 40 | 2.5% | Then an "annotation sweep" annotated 24/40 panels as "binding meets bar" without changing binding code. The 24 number is a documentation sweep, not a binding completion. **Real number is 1/40.** |
| **C** Toolbar binding | 3 | 33 | 9% | |
| **D** Composition root + ServiceLocator deletes | 5–6 | 14 | ~40% | D.5–D.7 landed; D.4 violated (see §4); D.8–D.14 not started |
| **E** Routing + cast removal | 0 (productive) – 15 (declared) | 54 | <30% | Casts going up, routing dead in prod |
| **F** Plugin SDK + marketplace | 0 | 195 | **0%** | Phase F is unstarted. |
| **G** Hardening | 0 | declared | 0% | |
| **H** Per-package compile | 0 | declared | 0% | |
| **Aggregate** | **~31** | **207 (S73-WIRE..S87-WIRE)** | **15%** | Source: `01-PROCESS-TRACKER.md §3` |

The wireup plan was 36 months. We are ~3 months into wireup execution at 15%. Linear extrapolation: ~17 months to finish wireup at current pace, not the planned 7 remaining months until S87.

---

## §8 — Workflows (live)

| Workflow | Status | Notes |
|---|---|---|
| `Start application` | ✅ green | |
| `bcf-round-trip` | ✅ green | |
| `family-editor-quality-gates` | ✅ green | |
| `ifc-export-tier1` | ❌ **red** | Pre-existing failure |
| `ifc-import-tier2` | ✅ green | |
| `ifc-inspector-pset-editor` | ✅ green | |
| `pryzm-persistence` | ❌ **red** | Pre-existing failure |
| `pryzm-vi-parity` | ❌ **red** | Pre-existing failure |
| `rhino-import-3dm` | ✅ green | |

`01-PROCESS-TRACKER.md §1` line 17 currently asserts "9/9 green". That assertion is stale and should read **6/9 green, 3/9 red**.

---

## §9 — Shortcuts taken in PRYZM2-WIREUP-PLAN-S72 (the suspected ones, confirmed)

The founder asked specifically whether S72 took shortcuts. It did. Three concrete ones:

1. **Annotation sweep counted as binding**. 24/40 panels were marked as "binding meets bar" by adding documentation annotations to the panel files, not by changing binding code. The runtime behavior of those 23 panels is identical to before the sweep. Phase B is **1/40 done in code**, **24/40 done in docs**. The plan should not have collapsed those numbers.
2. **`composeRuntime()` declared as composition root while `EngineBootstrap.ts` still runs**. The plan promoted Phase D.5 to "complete" because `composeRuntime()` exists and returns a value. It does not yet replace `EngineBootstrap.ts` in the production startup path. Both exist; the legacy one runs.
3. **Phase E routing path declared "scaffold landed" while unreachable**. `PlatformRouter.ts` exists, has tests, and is dead code in the production entrypoint. The plan counted scaffold-existence as scaffold-wired, which is the most common shortcut in any migration.

**None of these are catastrophic.** They are recoverable in 1–3 sprints each. They become catastrophic only if the next phase is started before they are reconciled — at which point you build new floors on a structurally incomplete frame.

---

## §10 — What this audit does NOT claim

For balance — the things that ARE going well, and what the team should NOT take from this doc:

- ✅ The strategic spine (`00_VISION/02-VISION.md`, `00_VISION/01-IDENTITY.md`, `00_VISION/03-AS-IS-VS-TO-BE.md`) is genuinely excellent and stays verbatim.
- ✅ Phase A is genuinely done. The first 7 sub-phases were executed cleanly.
- ✅ Phase D's scaffolding (the 845-LOC `composeRuntime`) is **good structural work**, just incomplete.
- ✅ ADRs (45) and SPECs (40) are clean, well-numbered, and referenced consistently.
- ✅ The wireup S72 monolith → 28 chunks slicing was a **legitimate engineering response** to a too-large doc — the problem is the further audit-on-audit-on-audit pattern that grew on top of it.
- ✅ `01-PROCESS-TRACKER.md` is honest in its §3 sub-phase ledger, even when its §1 dashboard drifts.
- ✅ The recent 2,220-LOC `02-LATEST-PHASES-AUDIT.md` is a **good document** — the right kind of evidence-cited deep dive. It deserves its promotion to `03_STATUS/`.

This audit is brutal because brutality at month-3 of wireup is cheap; brutality at month-12 is expensive. The honest scoreboard is the cheap version.

---

## §11 — Discipline going forward

To prevent the audit-inflation pattern that produced 17 Phase-1 documents:

1. **When a discrepancy is discovered, edit this file or the relevant phase doc.** Do not create a new `*-AUDIT-2026-MM-DD.md`.
2. **When a sub-phase is completed, edit `01-PROCESS-TRACKER.md` §3.** Do not create a per-sprint audit document. The exception is the major Phase exit gate (e.g. `00-CANONICAL-PHASE-3D-GA-GATE.md` archived under `superseded-audits/phase-3-audit-trail/`).
3. **A phase is "done" when the runtime behavior matches the spec.** Documentation-only changes do not advance the sub-phase counter. The §9 shortcut pattern must not repeat.
4. **`(window as any)` count is reported weekly in this file's §6.** Phase E does not exit until the count is below 100. (Aspirational target: 0. Practical bar: <100, which is the long-tail of legitimate browser-API leaks.)
5. **`EngineBootstrap.ts` LOC is reported weekly in this file's §5.** Phase D does not exit until that file is below 200 LOC and the production startup path is `composeRuntime()`-driven.

These five rules are the answer to "the suspected shortcut in S72." They go in `02_PLAN/00-IMPLEMENTATION-PLAN.md §6` as binding.
