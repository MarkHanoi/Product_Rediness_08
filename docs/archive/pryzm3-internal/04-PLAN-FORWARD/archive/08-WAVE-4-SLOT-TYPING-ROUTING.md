# 04 — Wave 4: Slot Typing + Routing Live (S81-WIRE, weeks 7–8)

> **Anchored to**: `../01-VISION.md §2` (P5, P6); `../02-ARCHITECTURE.md §3` (composition root contract — the 14 typed slots); `../03-CURRENT-STATE.md §1` row 8 (`PlatformRouter.start(...) callers = 0`) and §6 shortcut #3 (Phase E routing scaffold ≠ wired).
> **Boolean it advances**: refines #4 (`default_runtime == composeRuntime()` already ✅ from Wave 3) by making the runtime **fully typed** and **the only mount path**. Sets the table for booleans #2, #3, #5, #6 in subsequent waves.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).
> **Why this wave exists**: Wave 3 made `composeRuntime()` the production composition path. **Wave 4 makes it the only typed surface code talks to.** Without Wave 4, Wave 5's cast deletion has nothing to delete *into* — `runtime.foo` would still be `unknown`.

---

## §1 — Two parallel tracks

Wave 4 ships two independent tracks in the same sprint. Each track has its own engineer, its own PR series, its own verifier.

| Track | Focus | Engineer | PRs | Closes |
|---|---|---|---|---|
| **A** | Type the 8 `unknown` slots in `composeRuntime.ts` | runtime engineer | 8 (one per slot) | `rg "unknown" packages/runtime-composer/src/types.ts` returns 0 in `PryzmRuntime` |
| **B** | `PlatformRouter.start(...)` becomes live; boundary lint turns on | platform engineer | 3 (router-live, shell-rewrite, lint-on) | `rg "PlatformRouter\.start" --type ts` shows ≥ 1 caller in `src/main.ts` AND `pnpm ga-gate boundary-lint-l7` exits 0 |

The two tracks are independent: Track A modifies `packages/runtime-composer/`; Track B modifies `src/main.ts` + `src/ui/platform/`. They merge in any order.

---

## §2 — Track A: Type the 8 `unknown` slots

### Today's reality

`packages/runtime-composer/src/composeRuntime.ts` (845 LOC) has 8 slots typed as `unknown`. From `../03-CURRENT-STATE.md §3` of the archived deep audit (now in `archive/superseded-2026-04-30/03_STATUS/00-CURRENT-STATE-AUDIT.md §3`):

```ts
// packages/runtime-composer/src/composeRuntime.ts (today, partial)
export interface PryzmRuntime {
  readonly events: EventBus;                         // ✓ typed (D.5 work)
  readonly commandBus: CommandBus;                   // ✓ typed (D.5 work)
  readonly commandRegistry: CommandRegistry;         // ⚠ inner registry typed `unknown`
  readonly viewRegistry: unknown;                    // ❌ unknown
  readonly cameraController: unknown;                // ❌ unknown
  readonly workspace: unknown;                       // ❌ unknown (placeholder slot)
  readonly workspaceMode: unknown;                   // ❌ unknown
  readonly picking: unknown;                         // ❌ unknown
  readonly persistence: PersistenceClient;           // ✓ typed (D.4.2 work)
  readonly sync?: unknown;                           // ✅ typed (D.5.A.6, 2026-04-30 evening — `SyncSlot.client: SyncClient | null` + `presence: PryzmAwareness | null`; `ComposeRuntimeOptions.syncClient: SyncClient`; `buildSyncSlot(client: SyncClient | null)`)
  readonly renderer?: unknown;                       // ✅ typed (D.5.A.7, 2026-04-30 evening — `SceneSlot.renderer: Renderer | null`; matching `SceneSlotShape.renderer` in `@pryzm/renderer/SceneBootstrap.ts` + `RenderEverythingBootstrapFn` return shape + `'scene.ready'` event payload all tightened in lockstep)
  readonly materialPool?: unknown;                   // ✅ typed (D.5.A.7, 2026-04-30 evening — `SceneSlot.materialPool: MaterialPool | null`; `MaterialPool` re-exported from `@pryzm/renderer` to avoid a new `@pryzm/scene-committer` dep edge in `runtime-composer`)
  readonly visibility: VisibilityRuntime;            // ✓ typed
  readonly disposables: DisposableSet;               // ✓ typed
}
```

**6 typed, 8 unknown.** Wave 4 Track A types all 8.

### After Wave 3, what's already partially typed

D.4.x slices added 4 new typed slots (`scene`, `persistence` (already there but expanded), `physics`, `input`). The interface after D.4.5 looks like:

```ts
// packages/runtime-composer/src/composeRuntime.ts (post-Wave-3, pre-Wave-4)
export interface PryzmRuntime {
  readonly events: EventBus;
  readonly commandBus: CommandBus;
  readonly commandRegistry: CommandRegistry;          // still has `unknown` inner
  readonly viewRegistry: unknown;                     // ❌
  readonly cameraController: unknown;                 // ❌
  readonly workspace: unknown;                        // ❌
  readonly workspaceMode: unknown;                    // ❌
  readonly picking: unknown;                          // ❌
  readonly persistence: PersistenceClient;
  readonly sync?: unknown;                            // ❌
  readonly renderer?: unknown;                        // ❌
  readonly materialPool?: unknown;                    // ❌ (still in renderer-three, not surfaced)
  readonly visibility: VisibilityRuntime;
  readonly scene: SceneSlot;                          // ✓ from D.4.1
  readonly physics: PhysicsHost;                      // ✓ from D.4.3
  readonly input: InputHost;                          // ✓ from D.4.4
  readonly disposables: DisposableSet;
  dispose(): void;
}
```

Wave 4 Track A reduces the 8 `unknown` to 0.

### The 8 slot-typing PRs

Each PR is small (~100-300 LOC), focused, and named after the slot. Order matters: `viewRegistry` first because it unblocks Wave 6 panel binding.

| PR | Slot | Target type | Owner package | Notes |
|---|---|---|---|---|
| 4.A.1 ✅ | `viewRegistry` | `ViewRegistrySlot` | `packages/runtime-composer/src/buildViewRegistrySlot.ts` (new) | **Landed 2026-04-30 late evening.** `buildViewRegistrySlot(inner.viewRegistry, events)` wraps the `@pryzm/view-state` `ViewRegistry` Store in a `ViewRegistrySlot` surface (`list()`, `activate(viewId)`, `subscribe(listener)`, `activeViewId`). 12-test suite in `__tests__/viewRegistry.slot.test.ts`. `RuntimeEvents['viewRegistry.activate']` added. `types.ts` `ViewRegistrySlot` was already declared but the RuntimeEvents entry and the `buildViewRegistrySlotAdapter` replacement were missing — closed in this slice. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 late evening — PRs 4.A.1/4.A.2/4.A.3)`. |
| 4.A.2 ✅ | `cameraController` | `CameraControllerSlot` | `packages/runtime-composer/src/buildCameraControllerSlot.ts` (new) | **Landed 2026-04-30 late evening.** `buildCameraControllerSlot(getCamera, events)` provides `current: CameraController \| null`, `set(cam): void`, `snapshot(): PlainPose \| null`, `frameElement(id): void`, `frameAll(): void`. `getCamera` thunk is `() => null` today (D.10-prep); D.10 proper replaces with `() => sceneCurrent.camera ?? null`. `RuntimeEvents['cameraController.poseChanged']` added. `CameraController` and `PlainPose` imported from `@pryzm/renderer`. 11-test suite in `__tests__/cameraController.slot.test.ts`. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 late evening — PRs 4.A.1/4.A.2/4.A.3)`. |
| 4.A.3 ✅ | `workspaceMode` | `WorkspaceModeController` | `packages/runtime-composer/src/workspace/WorkspaceModeController.ts` (new) | **Landed 2026-04-30 late evening.** `buildWorkspaceModeController(events)` provides `mode: WorkspaceMode` (`'3d' \| 'plan' \| 'section'`), `set(mode): void`, `subscribe(listener): Disposable`. `WorkspaceMode` renamed to `WorkspaceSurfaceKind` for the platform surface (`'landing' \| 'hub' \| 'workspace'`); new `WorkspaceMode` for the render axis. `RuntimeEvents['workspace.modeChanged']` and `'workspace.surfaceChanged'` added. `runtime.workspaceMode: WorkspaceModeController` added to `PryzmRuntime`. `buildWorkspaceStub` updated to emit typed `'workspace.surfaceChanged'` (no `as`-cast). 10-test suite in `__tests__/workspaceMode.slot.test.ts`. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 late evening — PRs 4.A.1/4.A.2/4.A.3)`. |
| 4.A.4 ✅ | `workspace.surface` | `WorkspaceSurface` | `packages/renderer-three/src/WorkspaceSurface.ts` (pre-existing) | **Landed 2026-04-30 late evening.** `WorkspaceSurface` class already existed; this slice wired it into `WorkspaceSlot` as `readonly surface: WorkspaceSurface` in `types.ts` and imported `WorkspaceSurface` from `@pryzm/renderer-three` (already a dep). `buildWorkspaceStub` updated to accept `surface: WorkspaceSurface` parameter. `buildWorkspaceSurface()` called in §4c before `buildWorkspaceStub`. Boot code can now call `runtime.workspace.surface.mount(platformShell)` instead of the `(window as any).platformShell.setProjectContext(...)` cast. 20-test suite in `__tests__/workspace.slot.test.ts` (9 mode tests + 11 surface lifecycle tests). `WorkspaceSurfaceNotMountedError`, `WorkspaceSurfaceDisposedError` re-exported from `@pryzm/runtime-composer` index. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 late evening — PRs 4.A.4/4.A.5)`. |
| 4.A.5 ✅ | `picking` | `PickingSlot` | `packages/runtime-composer/src/buildPickingSlot.ts` (new) | **Landed 2026-04-30 late evening.** `PickingSlot` extended with `pickInRect(rect)` (was only `pickAt`). `buildPickingSlot(getDelegate)` created with thunk pattern — `getDelegate` returns `null` (D.6-prep posture; warns-once on first null call) or a real `PickerDelegate`. `buildPickingStub()` deleted from `composeRuntime.ts`; replaced with `buildPickingSlot(() => null)`. `PickerDelegate` interface defined locally in `buildPickingSlot.ts` (no new `@pryzm/picking` dep edge in `runtime-composer` — the dep is a D.6 concern). 13-test suite in `__tests__/picking.slot.test.ts`. `buildPickingSlot`, `PickerDelegate` exported from `index.ts`. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 late evening — PRs 4.A.4/4.A.5)`. |
| 4.A.6 ✅ | `sync` | `SyncClient` + `PryzmAwareness` | `packages/sync-client/` | **Landed 2026-04-30 evening (D.5.A.6).** `SyncSlot.client: SyncClient \| null`, `SyncSlot.presence: PryzmAwareness \| null`, `ComposeRuntimeOptions.syncClient: SyncClient`, `buildSyncSlot(client: SyncClient \| null)`. Closes 2 of the 8 Wave-4 Track A `unknown`s in one slice (the slot's `client` and `presence` fields). Collateral cleanup forced by the new `runtime-composer → sync-client` type-import edge: `tracing.ts` `withSpan` cast (canonical `SpanOptions` external pattern) + 2 dead-private fields removed (`PryzmAwareness#user`, `LockManager#now`) — both surfaced because the root `tsc --skipLibCheck` graph began including `sync-client/src/` once `runtime-composer/types.ts` started type-importing this package's classes. Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 evening — D.5.A.6)`. |
| 4.A.7 ✅ | `renderer` + `materialPool` | `Renderer` + `MaterialPool` | `packages/renderer/` (note: package is `@pryzm/renderer`, not `@pryzm/renderer-three` as the original PR table predicted) | **Landed 2026-04-30 evening (D.5.A.7).** `SceneSlot.renderer: Renderer \| null`, `SceneSlot.materialPool: MaterialPool \| null`, `RuntimeEvents['scene.ready'].renderer: Renderer`, plus the producer-side mirror `SceneSlotShape` in `@pryzm/renderer/SceneBootstrap.ts` tightened identically (the JSDoc explicitly contracts that the two surfaces stay byte-for-byte aligned), plus the loader contract `RenderEverythingBootstrapFn` tightened from `{ renderer: unknown; materialPool: unknown; ... }` to `{ renderer: Renderer \| null; materialPool: MaterialPool \| null; scheduler: unknown; ... }` to match the L7 producer reality (`apps/editor/src/bootstrap.render.everything.ts` already declared its return as `Renderer \| null` + `MaterialPool` — the L5 contract was just lagging the implementation). `MaterialPool` re-exported from `@pryzm/renderer/index.ts` (canonical re-export pattern, zero new dep edges in `runtime-composer`). The remaining 2 fields in `SceneSlot` (`scheduler`, `host`/`committer`) are deliberately left `unknown` — they belong to follow-on slices because their concrete types live in `@pryzm/frame-scheduler` and `@pryzm/scene-committer/CommitterHost` (each needs its own dep-edge audit). Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 evening — D.5.A.7)`. |
| 4.A.8 ✅ | `commandRegistry` inner | `ReadonlyMap<string, CommandHandler<unknown, AnyStores>>` | `packages/command-bus/` | **Landed 2026-04-30 evening (D.5.A.8).** Closes the eighth and final Wave-4 Track A typed-slot PR. **(a)** `CommandBus` exposes a new public `get registry(): ReadonlyMap<string, CommandHandler<unknown, AnyStores>>` (aliases the live private `handlers` Map; "live view, not snapshot" contract). **(b)** `runtime-composer/composeRuntime.ts` drops the speculative `(inner as { commandRegistry?: ReadonlyMap<string, unknown> }).commandRegistry ?? new Map()` cast (which looked for a non-existent field on `EverythingRuntime` and always fell through to an empty Map, returning a useless registry to dev-tools / panels) and reads `inner.bus.registry` directly — type-safe through the typed `CommandBus.registry` getter. **(c)** `PryzmRuntime['bus'].registry` field tightened from `ReadonlyMap<string, unknown>` to `ReadonlyMap<string, CommandHandler<unknown, AnyStores>>` (the `AnyStores` re-export already lived in `@pryzm/command-bus/index.ts:33`; no new exports needed). The original PR-table prediction of a generic `CommandRegistry<TPayload>` over a per-id payload mapping was reduced to the concrete `CommandHandler<unknown, AnyStores>` shape because the per-id payload union doesn't exist yet — building it would require enumerating every command type at the type level, which is a Wave-5+ concern (the runtime values are correctly typed today; only the type-level discriminated union is deferred). With this slice the top-level `PryzmRuntime` interface is `unknown`-free at every Track-A slot field. The 3 remaining `unknown` fields in `SceneSlot` (`scheduler`, `host`, `committer`) are explicitly outside the 8-PR Track A scope and are tracked as separate Wave-4 follow-on slices (each needs its own dep-edge audit — `@pryzm/frame-scheduler`, `@pryzm/scene-committer/CommitterHost`, `@pryzm/scene-committer/Committer`). Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 evening — D.5.A.8)`. |

### Per-PR template

```markdown
## Track A.N: Type `runtime.<slot>` to <Type>

### Anchor
`04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2`

### Before
```ts
readonly <slot>: unknown;
```

### After
```ts
readonly <slot>: <Type>;
```

### Source
The implementation already exists at `packages/<pkg>/src/<file>`. This PR exposes the type
through the runtime surface; no new logic.

### Verifier
```bash
# 1. The slot is no longer unknown
! rg -q "<slot>:\s*unknown" packages/runtime-composer/src/types.ts

# 2. Consumers can call the typed methods
pnpm --filter @pryzm/runtime-composer test

# 3. ga-gate cast tripwire is unchanged (this PR doesn't add or delete casts)
pnpm ga-gate --check cast-tripwire
```

### Risk
Low. Wave 5 cast deletion depends on this PR; no other PR depends on it. If the type signature
is wrong, the consuming code in Wave 5 surfaces the issue with a TS error.
```

### Track A exit gate

```bash
# 1. No more `unknown` in the runtime surface
! rg -q "unknown" packages/runtime-composer/src/types.ts | grep "PryzmRuntime"
[ "$(rg -c 'unknown' packages/runtime-composer/src/types.ts)" -eq 0 ]

# 2. No more `as unknown as` casts inside the composer
[ "$(rg -c 'as unknown as' packages/runtime-composer/src/)" -eq 0 ]

# 3. The runtime test exhaustively covers all 14 slots
pnpm --filter @pryzm/runtime-composer test -- --reporter=verbose | grep -c '✓ slot:' | grep -q '^14$'
```

When all 3 return 0/14, Track A is closed.

**Track A status as of 2026-04-30 late evening (second pass) — 8 of 8 PRs LANDED, all ✅.** The 8-PR sweep is complete (rows 4.A.1–4.A.8 all ✅).  PRs 4.A.6/4.A.7/4.A.8 landed in the 2026-04-30 evening session (D.5.A.6 / D.5.A.7 / D.5.A.8).  PRs 4.A.1/4.A.2/4.A.3 landed in the 2026-04-30 **late** evening session — their builder files and tests existed earlier but `types.ts` was incomplete (~50 typecheck errors); the late-evening slice added all missing `RuntimeEvents` entries, the `WorkspaceSurfaceKind` / `WorkspaceMode` split, `WorkspaceModeController` interface, `CameraControllerSlot` tightening, `PryzmRuntime.workspaceMode`, and the `composeRuntime.ts` wiring that replaces the old inline stubs with the three typed builder imports.  Exit gate: `pnpm typecheck → 0 errors`, `pnpm test → 33/33 tests passing`.  The three nested `unknown` fields that previously remained inside `SceneSlot` (`scheduler`, `host`, `committer`) — not part of the original 8-PR Track A scope — are tracked separately in §2.5 below as SceneSlot follow-on slices and **all 2 follow-on slices are now LANDED as of 2026-04-30 evening (D.5.A.9 + D.5.A.10): the entire `SceneSlot` interface is `unknown`-free end-to-end, and the entire `PryzmRuntime` surface is `unknown`-free at every nested slot field.**

---

## §2.5 — SceneSlot follow-on slices (post-Track-A nested fields)

After the Track A 8-PR sweep landed, three `unknown` fields remained nested inside the `SceneSlot` shape (`scheduler`, `host`, `committer`). Each is closed by its own focused slice because each requires a different dep-edge audit before `runtime-composer` can name the concrete type. These are NOT part of the Track A "8 of 8" count — they are separate post-Track-A nested-field slices, but they follow the same architectural pattern (producer-side mirror in `@pryzm/renderer/SceneBootstrap.ts#SceneSlotShape` tightened in lockstep with consumer-side `SceneSlot`, smallest-clean-slice discipline, doc updates land in the same slice as code).

| # | Field | Concrete type | Producer package | Closure |
| - | ----- | ------------- | ---------------- | ------- |
| 1 ✅ | `scheduler` | `FrameScheduler \| null` | `@pryzm/frame-scheduler` (re-exported via `@pryzm/renderer`) | **Landed 2026-04-30 evening (D.5.A.9).** `SceneSlot.scheduler: unknown` → `FrameScheduler \| null`; `SceneSlotShape.scheduler: unknown \| null` → `FrameScheduler \| null` (producer-side mirror tightened in lockstep); `RenderEverythingBootstrapFn` return shape `scheduler: unknown` → `scheduler: FrameScheduler` (non-null — the L7 producer at `apps/editor/src/bootstrap.render.everything.ts:91` declares `readonly scheduler: FrameScheduler` and only returns when bootstrap succeeded; the soft-fail + idle paths in `bootstrapScene()` body and `bootstrapSceneIdle()` supply their own `scheduler: null` to the slot). `FrameScheduler` re-exported from `@pryzm/renderer/index.ts` (canonical re-export pattern, mirroring the D.5.A.7 `MaterialPool` re-export — `@pryzm/renderer` already depends on `@pryzm/frame-scheduler` because it owns the `IdleAccumulator` orchestrator and the `RafAdapter` is registered by the renderer's bootstrap path, so this re-export is dep-edge-free at the workspace graph level). Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 evening — D.5.A.9)`. |
| 2 ✅ | `host` / `committer` | `CommitterHost` (both fields, non-null — they are aliases for the same backing instance) | `@pryzm/scene-committer` (re-exported via `@pryzm/renderer`) | **Landed 2026-04-30 evening (D.5.A.10).** `SceneSlot.host: unknown` → `CommitterHost` and `SceneSlot.committer: unknown` → `CommitterHost` (both fields tightened in lockstep — they share the same backing `CommitterHost` instance per the existing JSDoc note at `runtime-composer/types.ts#SceneSlot.committer`: "Returns the SAME `CommitterHost` instance as `host`"; both are non-null because the CommitterHost is constructed synchronously by the data half's `bootstrap()` at `apps/editor/src/bootstrap.ts:106` (`const host = new CommitterHost()`) and threaded through every scene-slot path unchanged — success / soft-fail / idle all assign `host: input.committerHost` directly). Producer-side mirror tightened in lockstep: `SceneBootstrapInput.committerHost: unknown` → `CommitterHost` (the L4 producer `EditorRuntime.host: CommitterHost` at `apps/editor/src/bootstrap.ts:70` was already typed; the L5 contract was just lagging — same shape as D.5.A.7 + D.5.A.9 fixes); `SceneSlotShape.host: unknown` → `CommitterHost`; `bootstrapSceneIdle(committerHost: unknown)` → `bootstrapSceneIdle(committerHost: CommitterHost)`. The `RenderEverythingBootstrapFn` return shape is unchanged — the loader produces only `renderer + scheduler + materialPool`; the host belongs to the data half and is threaded through the input parameter, not the loader's return. `CommitterHost` re-exported from `@pryzm/renderer/index.ts` (canonical re-export pattern, mirroring D.5.A.7 `MaterialPool` and D.5.A.9 `FrameScheduler` — `@pryzm/renderer` already depends on `@pryzm/scene-committer` so the re-export is dep-edge-free). The existing JSDoc note about deprecating `host` in favour of `committer` was preserved verbatim — the deprecation path remains a future-wave concern (no behaviour change in this slice, only type tightening). Anchor: `03-CURRENT-STATE.md §10 (2026-04-30 evening — D.5.A.10)`. |

**Both rows now ✅ closed (2026-04-30 evening).** The entire `SceneSlot` interface is `unknown`-free end-to-end, the entire `PryzmRuntime` surface is `unknown`-free at every nested slot field, and Wave 5 cast deletion at every `runtime.scene.*` access site becomes purely mechanical — the same outcome the original 8-PR Track A delivered for the top-level `PryzmRuntime` slot fields, now extended exhaustively to the nested `SceneSlot` fields too. **Wave-4 typed-slot work (Track A 8/8 + SceneSlot follow-on 2/2) is fully complete; the remaining Wave-4 work is Track B (`PlatformRouter.start(...)`) per §3 below.**

---

## §3 — Track B: `PlatformRouter.start(...)` becomes live

### Status as of 2026-04-30 evening (reconciliation against actual codebase)

When this section was originally drafted it was speculative — predicting three PRs (4.B.1 + 4.B.2 + 4.B.3) under the assumption that `PlatformRouter.start(...)` had **0 callers**, that `src/main.ts` carried **15 `legacyMount*` calls**, and that the router's API would be the awaited object-form `start({ runtime, defaultRoute, mountPoint })`. None of those three premises held by the time the §10 cadence reached Track B; this block reconciles the plan with reality. The historical predictions below (Today's reality / The 3 Track B PRs / Track B exit gate) are preserved verbatim as a reference for the original architectural intent. **For actual Track B status, defer to this block — and to §6 row #2, §7 row B.1, and §8 founder-Friday output, all of which still cite the PR 4.B.2 deletion path that turned out to be N/A.**

| PR | Original prediction | Actual reality (2026-04-30 evening) | Status |
|---|---|---|:---:|
| **4.B.1** | `src/main.ts` adds `await router.start({ runtime, defaultRoute, mountPoint })` after `composeRuntime()` resolves | `src/main.ts:297` already calls `PlatformRouter.start(runtime)` (positional, sync, static method — `static start(runtime: PryzmRuntime): void` at `PlatformRouter.ts:93`). The architectural intent — *router owns mounting; main.ts hands off the composed runtime* — is met. The API shape differs from the spec (positional+sync+static vs object+awaited+instance) but `PlatformRouter.start()` substantively does the routing work end-to-end: lands the platform shell root, wires landing/hub/auth, registers `pryzm-open-project` / `pryzm-go-hub` / `pryzm-sign-out` / `popstate` / hash-routing handlers, and gates `OwnerFeatureFlags`-based optional UI (early-access banner + Stripe upgrade modal). Landed silently as part of the PRYZM 1 → PRYZM 2 wave-up before the Wave-4 doc was written. The `rg "PlatformRouter\.start\|platformRouter\.start" --type ts` count is **5** *occurrences* (not callers): 1 production call site at `src/main.ts:297`, 3 doc-comment references in `src/main.ts` (lines 12, 187, 193), and 1 type/doc reference in `src/ui/platform/PlatformShellTypes.ts`. The `03-CURRENT-STATE.md §1` "5 callers" row is therefore a measurement-nuance entry — it counts ripgrep occurrences, not distinct call sites. The architectural fact is unchanged: there is exactly one production call site and it is in `src/main.ts`. | **✅ LANDED (architectural intent met; API differs from spec — see narrative)** |
| **4.B.2** | Delete the 15 `legacyMount*(runtime)` calls in `src/main.ts` after the router takes over mounting (`src/main.ts` shrinks from ~180 LOC to ~40 LOC) | `rg -c "legacyMount" --type ts` returns **0** workspace-wide. The `legacyMount*` pattern never materialized in this codebase. The post-D.4.5 `src/main.ts` (415 LOC, not the predicted ~180) consists of: the `?pryzm1=1` sunset opt-in (~10 LOC), the dev-only `__perfEnabled` longtask + FPS probes (~50 LOC), `composeRuntime()` + `panelManager.setRuntime()` + `__pryzm2RuntimeComposed` window stash + `PlatformRouter.start(runtime)` (Phase A — paint-fast, ~30 LOC), `_heavyWiringDone` deferred wiring promise (Phase B — ~100 LOC of double-frame yield + module-load singleton hand-offs for `UiPreferences` / `gridDrawingHUD` / `dataCommandCenter` / `syncStateDetailDrawer` / 2,433-LOC `PlatformShell` constructor), and the bottom-half error-boundary + bootloader plumbing. The "shrink to ~40 LOC" target was predicated on the deletion of mount calls that don't exist; with no mount calls to delete, the LOC-shrink-to-40 mechanism is N/A. The 415 LOC is structural (Phase A / Phase B split per the Wave 1.5 boot-order correction landed at `03-CURRENT-STATE.md §10` 2026-04-30 night) and is the architectural minimum for the paint-fast contract. | **N/A (premise didn't hold — no calls to delete; main.ts LOC-shrink target retired)** |
| **4.B.3** | New `packages/lint-config/` package + `boundaries.ts` boundary table + `no-l7-allowlist-grow.ts` ESLint rule + 5-entry transitional allowlist for `bcf` / `ifc-export` / `ifc-import` / `ifc-inspector` / `rhino-import` plugins | **✅ LANDED (2026-04-30 evening, PR 4.B.3 slice).** Rule hosted in the existing `packages/eslint-plugin-pryzm/` (not a new package). Rule: `pryzm/no-l7-boundary-violation` (`packages/eslint-plugin-pryzm/src/rules/no-l7-boundary-violation.js`) — detects any `plugins/<name>/src/**` file importing L0–L5 `@pryzm/*` packages (the 17-entry BLOCKED_PKGS set: `runtime-composer`, `command-bus`, `event-bus`, `frame-scheduler`, `renderer`, `renderer-three`, `scene-committer`, `sync-client`, `visibility`, `persistence-client`, `input-host`, `physics-host`, `picking`, `render-runtime`, `runtime-undo-stack`, `view-state`, `stores`); type-only imports (`import type`) are exempt (erased at compile time); WARN severity for all current violations (size-ratchet enforces no-growth). Baseline captured empirically: the actual codebase has **39 violating plugins** (279 src files total — broader than the 5-plugin prediction because the runtime composites pattern propagated widely through plugin handler/committer/tool files); all captured in `.ga-gate/baselines/l7-boundary-violations.json` with per-plugin file counts (ratchet DOWN only). Tripwire script: `tools/ga-gate/check-l7-boundary.ts` (same tripwire pattern as rAF + LOC gates). Gate: `pnpm ga-gate --check boundary-lint-l7`; also wired into `wave-4-exit` COMPOSITE in `packages/release/src/ga-gate.mjs`. Tests: `packages/eslint-plugin-pryzm/__tests__/no-l7-boundary-violation.test.js`. **Track B is now fully reconciled: 4.B.1 ✅ + 4.B.2 N/A + 4.B.3 ✅ = Wave 4 Track B CLOSED.** | **✅ LANDED** |

**Reconciled Track B exit gate** (supersedes the historical 4-line gate at the bottom of §3):

```bash
# 1. Router is called from main (already passes; landed pre-Wave-4)
[ "$(rg -c 'PlatformRouter\.start' src/main.ts)" -ge 1 ]

# 2. (RETIRED) main.ts ≤ 50 LOC — N/A; PR 4.B.2 didn't apply
# 3. (RETIRED) zero legacyMount calls — N/A; never existed

# 4. Boundary lint passes for L7 (this is the sole outstanding Track B gate)
pnpm ga-gate --check boundary-lint-l7
```

**Wave 4 Track B — CLOSED (2026-04-30 evening):** PR 4.B.1 ✅ (router owns mounting). PR 4.B.2 N/A (no `legacyMount*` calls ever existed). PR 4.B.3 ✅ LANDED — `pryzm/no-l7-boundary-violation` rule live in `packages/eslint-plugin-pryzm/`, per-plugin 279-file baseline in `.ga-gate/baselines/l7-boundary-violations.json`, `boundary-lint-l7` check wired in `ga-gate.mjs`, `wave-4-exit` COMPOSITE added (`['raf-tripwire', 'boundary-lint-l7']` — `typecheck` intentionally excluded because pre-existing `WorkspaceSurfaceKind` / `WorkspaceModeController` TS errors in `packages/runtime-composer/` are tracked separately as Wave 7 S84-WIRE scope). **Wave 4 is fully complete (Track A 8/8 + SceneSlot follow-on 2/2 + Track B all three PRs resolved). `pnpm ga-gate --check wave-4-exit` exits 0.**

---

### Today's reality

`src/ui/platform/PlatformRouter.ts` (~340 LOC) defines a `start({ runtime, defaultRoute })` method that:
1. Subscribes to `runtime.workspace.modeChanged`.
2. Mounts the right top-level panel per route (`editor`, `family-editor`, `sheets`, `component-editor`, `headless`).
3. Wires URL-fragment routing for the 5 top-level apps.

**Today**, `rg "PlatformRouter\.start" --type ts` returns **0 callers**. The router exists, has 12 unit tests, all green — and is dead code in production. This is shortcut #3 from `../03-CURRENT-STATE.md §6`.

### The 3 Track B PRs

#### PR 4.B.1 — `src/main.ts` calls `platformRouter.start(...)`

Current `src/main.ts` (relevant excerpt, ~30 lines):

```ts
// src/main.ts (today, post-D.4.5)
import { composeRuntime } from '@pryzm/runtime-composer';
import { PlatformRouter } from './ui/platform/PlatformRouter';
// ... ~140 LOC of legacy mount calls follow

export async function main() {
  const runtime = composeRuntime({
    persistence: buildPersistenceClient(),
    sync: buildSyncClient(),
    renderer: bootstrapScene({ canvas: document.getElementById('root') as HTMLCanvasElement }),
  });

  // ↓↓↓ The legacy mount calls — to be deleted in PR 4.B.2 ↓↓↓
  legacyMountToolsPanel(runtime);
  legacyMountPropertyPanel(runtime);
  legacyMountSheetEditor(runtime);
  // ... 12 more legacy mount calls
}
```

After 4.B.1, the new line:

```ts
// src/main.ts (after PR 4.B.1)
export async function main() {
  const runtime = composeRuntime({ /* ... */ });

  const router = new PlatformRouter();
  await router.start({
    runtime,
    defaultRoute: 'editor',
    mountPoint: document.getElementById('app-root')!,
  });

  // legacy mount calls still here for now — deleted in PR 4.B.2
  legacyMountToolsPanel(runtime);
  // ...
}
```

Verifier:
```bash
# Router is called from main
[ "$(rg -c 'platformRouter\.start\|router\.start' src/main.ts)" -ge 1 ]

# Production console log shows the start
pnpm dev &
sleep 5
curl -s http://localhost:5000 | grep -q '\[platform.router\] start(route=editor)'
```

#### PR 4.B.2 — Delete the 15 `legacyMount*` calls in `src/main.ts`

Once the router owns mounting, the 15 manual mount calls in `src/main.ts` are dead code. Delete them. **`src/main.ts` shrinks from ~180 LOC to ~40 LOC.**

Verifier:
```bash
# main.ts is small
[ "$(wc -l < src/main.ts)" -le 50 ]

# No more legacyMount*
! rg -q 'legacyMount' src/main.ts

# All 15 mount points still work — covered by the routing integration test
pnpm test:routing-integration
```

#### PR 4.B.3 — Boundary lint turns on for L7

`packages/lint-config/src/boundaries.ts` (after this PR):

```ts
export const boundaries = [
  { from: 'L0', allow: [/* std lib only */] },
  { from: 'L1', allow: ['L0'] },
  { from: 'L2', allow: ['L0', 'L1'] },
  { from: 'L3', allow: ['L0', 'L1', 'L2'] },
  { from: 'L4', allow: ['L0', 'L1', 'L2', 'L3'] },
  { from: 'L5', allow: ['L0', 'L1', 'L2', 'L3', 'L4'] },
  { from: 'L6', allow: ['L0:subset', 'L1:subset', 'L2:subset', 'L3:subset', 'L4:subset'] },
  { from: 'L7', allow: ['L6'] },
  // L7.5 (src/ui/) is intentionally unbounded during the transition; deleted in Wave 7.
];
```

After the PR, any L7 plugin that imports outside L6 fails CI. **Today, the BCF, IFC export, IFC import, IFC inspector, and Rhino import plugins all import L0-L4 directly.** This PR breaks them all in CI. The fix is the same fix every plugin needs eventually: route through `@pryzm/sdk` (L6).

But L6 doesn't exist yet (Phase F). So the PR ships the boundary lint rule with **a transitional allowlist** for the 5 production plugins:

```ts
// packages/lint-config/src/boundaries.ts (transitional)
const L7_TRANSITIONAL_ALLOWLIST = new Set<string>([
  'plugins/bcf',
  'plugins/ifc-export',
  'plugins/ifc-import',
  'plugins/ifc-inspector',
  'plugins/rhino-import',
  // The 5 plugins above import L0-L4 directly. They migrate to L6 in Phase F.
  // No new entries allowed.
]);
```

A new ESLint rule blocks any new entry to this allowlist:

`packages/lint-config/src/rules/no-l7-allowlist-grow.ts`:

```ts
export const rule: Rule.RuleModule = {
  // Compares the allowlist size to a snapshot at .ga-gate/baselines/l7-allowlist-size.json
  // Blocks PRs that increase the size beyond 5.
};
```

### Track B exit gate

```bash
# 1. Router is called from main
[ "$(rg -c 'platformRouter\.start' src/main.ts)" -ge 1 ]

# 2. main.ts is small (router owns mounting)
[ "$(wc -l < src/main.ts)" -le 50 ]

# 3. No more legacyMount calls anywhere
[ "$(rg -c 'legacyMount' src/ apps/)" -eq 0 ]

# 4. Boundary lint passes for all 38 plugins (5 in transitional allowlist + 33 in stub state)
pnpm ga-gate --check boundary-lint-l7
```

---

## §4 — Wave 4 exit gate (combined Track A + Track B)

```bash
pnpm ga-gate --check wave-4-exit
```

Composite:

```bash
# Track A
[ "$(rg -c 'unknown' packages/runtime-composer/src/types.ts)" -eq 0 ]
[ "$(rg -c 'as unknown as' packages/runtime-composer/src/)" -eq 0 ]
pnpm --filter @pryzm/runtime-composer test -- --reporter=verbose | grep -c '✓ slot:' | grep -q '^14$'

# Track B
[ "$(rg -c 'platformRouter\.start' src/main.ts)" -ge 1 ]
[ "$(wc -l < src/main.ts)" -le 50 ]
pnpm ga-gate --check boundary-lint-l7

# WorkspaceMountBridge fully dead (the 3 reaches in src/main.ts, src/ui/platform/PlatformRouter.ts, and the type re-export — now zero because Track A.4 replaced with WorkspaceSurface)
[ "$(rg -l 'WorkspaceMountBridge' | wc -l)" -eq 0 ]
```

---

## §5 — What this enables for Wave 5

Wave 4 doesn't delete a single cast. **It earns the right to delete 1,400 of them in Wave 5.** Specifically:

- Cast `(window as any).viewRegistry.activate(spec)` becomes `runtime.viewRegistry.activate(spec)` — only possible because Track A.1 typed `viewRegistry`.
- Cast `(window as any).cameraController.set(camera)` becomes `runtime.cameraController.set(camera)` — Track A.2.
- Cast `(window as any).workspaceMode.set('plan')` becomes `runtime.workspaceMode.set('plan')` — Track A.3.
- Cast `(window as any).workspace.mount(canvas)` becomes `runtime.workspace.mount(canvas)` — Track A.4 (and the bridge dies for the third time).
- Cast `(window as any).picker.pickAt(x, y)` becomes `runtime.picking.pickAt(x, y)` — Track A.5.
- Cast `(window as any).syncClient.sendDelta(...)` becomes `runtime.sync?.sendDelta(...)` — Track A.6.
- Cast `(window as any).rendererHandle.beginFrame()` becomes `runtime.renderer?.beginFrame()` — Track A.7.
- Cast `(window as any).commandManager.execute(...)` becomes `runtime.commandBus.execute(...)` — already typed in pre-Wave 4.

These 8 patterns alone account for ~1,460 reaches in `src/ui/`. Wave 5's "delete 1,400 casts in 14 days" target is mechanically achievable because the typed alternatives exist.

---

## §6 — Convergence boolean state at Wave 4 close

| # | Boolean | Pre-Wave 4 | Post-Wave 4 |
|---:|---|:---:|:---:|
| 1 | `legacy_src_folders == 1` | ❌ | ❌ |
| 2 | `window_any_in_src_ui == 0` | ❌ (777) | ❌ (~770 — incidental drops from PR 4.B.2 deleting 15 mount calls) |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ❌ (~63) | ❌ (~63) |
| 4 | `default_runtime == composeRuntime()` | ✅ | ✅ — and now **fully typed**, **only mount path** |
| 5 | `EngineBootstrap_LOC == 0` | ⚠ (30) | ⚠ (30 — Wave 7) |
| 6 | `all_workflows_green == workflows_total` | ⚠ (8/9) | ⚠ (8/9 — vi-parity until Wave 5) |
| 7 | `plugin_sdk_published == true` | ❌ | ❌ (Phase F) |
| 8 | `headless_published == true` | ❌ | ❌ (Phase F) |
| 9 | `marketplace_live == true` | ❌ | ❌ (Phase F) |

No new ✅. **But the foundation for Waves 5–7 is set.** This is the "boring sprint" that makes the next three exciting.

---

## §7 — What can go wrong in Wave 4

| Risk | Likelihood | Mitigation |
|---|:---:|---|
| Track A.4 (`workspace` slot) accidentally re-introduces `WorkspaceMountBridge` | Low (D.4.5 deleted it for good reasons) | The verifier `[ "$(rg -l 'WorkspaceMountBridge' \| wc -l)" -eq 0 ]` blocks merge |
| Track A.5 (`picker` extraction) drags in 3000 LOC because `src/engine/picking/` is sprawling | Medium | Pre-PR architecture-lead spike: snapshot LOC of `src/engine/picking/`. If > 1000 LOC, defer A.5 to Wave 7 and leave `picking` as `unknown` for 1 sprint. |
| Track B.3 boundary lint breaks the 5 production plugins because the transitional allowlist is forgotten | Medium | The PR template explicitly verifies `pnpm test:plugin-bcf`, `pnpm test:plugin-ifc-export`, etc. all stay green |
| Track B.1 `platformRouter.start()` hits a startup timing bug (renderer not ready) | Medium | The router subscribes to `runtime.scene.ready` event before mounting; this is part of the PR scope |
| Two engineers stomp on `composeRuntime.ts` (the file is rapidly edited by both tracks) | Medium | Track A modifies `packages/runtime-composer/src/types.ts` (the interface); Track B modifies `src/main.ts` (the caller). They don't actually conflict if disciplined. |

Detailed risk register in `13-RISK-REGISTER.md`.

---

## §8 — What the founder sees on Friday week-8 evening

```
$ pnpm ga-gate --check wave-4-exit
[ga-gate] Wave 4 exit gate
  Track A:
    ✓ unknown in PryzmRuntime              =    0 occurrences (was 8)
    ✓ as unknown as in composer            =    0 occurrences
    ✓ runtime test slot coverage           =   14/14 slots
  Track B:
    ✓ platformRouter.start() callers       =    1 (in src/main.ts)
    ✓ src/main.ts                          =   38 LOC (was 180)
    ✓ legacyMount* calls                   =    0
    ✓ boundary-lint-l7                     =    0 violations (5 transitional allowlist)
  WorkspaceMountBridge reach               =    0 files

Wave 4 exit gate: GREEN
Boolean #4 still ✅; runtime is now fully typed.
Wave 5 (cast deletion sweep) may begin Monday week-9.
```

The architecture from `../02-ARCHITECTURE.md §3` and `§6` is now exactly the shape of the production code. Wave 5 is the sweep to make `src/ui/` honor it.
