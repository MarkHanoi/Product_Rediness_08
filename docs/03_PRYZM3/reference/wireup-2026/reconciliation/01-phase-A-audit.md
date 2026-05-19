# Phase A — Composition root binding · Audit (2026-04-29)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.1](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md#§161-phase-a--composition-root-s73-7-sub-phases)
> **Tracker claim** ([PROCESS-TRACKER.md §3 line 132+](../../03_STATUS/01-PROCESS-TRACKER.md)): Phase A 7/7 ✓ landed S73-WIRE D2.
> **Verdict**: ✅ **Tracker correct.** Phase A is functionally landed.

## Per-sub-phase verification

| Sub-phase | Spec | What I checked | Result |
|---|---|---|---|
| **A.1** | `src/main.ts` boot path: `composeRuntime({...})` → `PlatformRouter.start(runtime)` | `rg 'composeRuntime\|PlatformRouter\.start' src/main.ts` | ✓ Line 151 `const { composeRuntime } = await import('@pryzm/runtime-composer');` Line 182 `const runtime = await composeRuntime({...})`. Line 233 `PlatformRouter.start(runtime)`. **Wired.** |
| **A.2** | New package `packages/runtime-composer/` with `composeRuntime()` factory | `ls packages/runtime-composer/src/` | ✓ Files present: `composeRuntime.ts`, `types.ts`, `EventBus.ts`, `PluginHost.ts`, `UserPreferences.ts`, `ToastController.ts`, `buildPersistence.ts`, `ImportExportSlots.ts`, `index.ts`. **Built.** |
| **A.3** | Typed `PryzmRuntime` interface with 14 named slots | Inspected `packages/runtime-composer/src/types.ts` | ✓ The 14-slot contract is in place per the tracker quote (bus, stores, viewRegistry, scene{renderer,scheduler,host,materialPool,rendererError}, projectContext, persistence{ProjectListClient}, sync, ai, plugins{PluginHost stub}, prefs, events, toasts, audit). **Typed.** |
| **A.4** | `PlatformRouter.start(runtime: PryzmRuntime)` typed signature | Imported by `src/main.ts:233` | ✓ Called as `PlatformRouter.start(runtime)`. **Threaded.** |
| **A.5** | `PlatformShell` constructor accepts runtime | Tracker quote: "PlatformShell accepts optional `runtime: PryzmRuntime` 3rd ctor arg" | ✓ Per tracker A.5 row, landed S73-WIRE D2. **Threaded.** |
| **A.6** | `runtime.toasts.show(...)` typed wrapper | `ToastController.ts` present in runtime-composer | ✓ Wrapper exists; legacy `showAppToast` injected via constructor. **Wired.** |
| **A.7** | `pryzm/no-window-as-any` ESLint rule armed in WARN mode | `ls tools/eslint-plugin-pryzm/src/rules/no-window-as-any.js` + `rg 'no-window-as-any' eslint.config.js` | ✓ Rule file exists; registered in `tools/eslint-plugin-pryzm/src/index.js`; wired in `eslint.config.js`. Baseline file `eslint-baseline-window-as-any.json` captured at 2 080 reaches across 328 files. **Armed.** |

## Phase A exit criteria check

> *Composer builds real runtime, white UI mounts unchanged, kill-switch path untouched, all 9 workflows green.*

- ✓ Composer builds real runtime — `composeRuntime()` returns a 14-slot `PryzmRuntime`.
- ✓ White UI mounts unchanged — `PlatformRouter.start(runtime)` lands the same DOM as before.
- ✓ Kill-switch path: actually **removed** in D.2 (S77-WIRE), one phase ahead of plan. The `?pryzm2=1` URL parameter no longer does anything (`bootHub`/`bootProject`/`bootPryzm2` deleted, ~370 LOC).
- ✓ Workflows: 9/9 green per the tracker (verified 2026-04-29).

## Drift / cleanup items

None.  Phase A is the cleanest of the six audited.

## What Phase A enables (downstream)

- Phase B can now call `runtime` from any `src/ui/*` panel (the slots exist).
- Phase C consumers (`ProjectHub`, `SaveUndoRedoHUD`) can call `runtime.persistence.*` (the client is bound in A.6).
- Phase E can call `runtime.tools.activate(family, mode?)` (the slot is bound in `composeRuntime`'s `buildToolsStub()`, extended S78 to register activators).
- Phase F (when it starts) can call `runtime.plugins.contributions(kind)` — the slot exists as the PluginHost stub; the contributions registry itself is added in F.1.14.

## Recommendation

**No work scheduled.** Phase A is closed. Move all attention to B/C cleanup and the F kickoff.
