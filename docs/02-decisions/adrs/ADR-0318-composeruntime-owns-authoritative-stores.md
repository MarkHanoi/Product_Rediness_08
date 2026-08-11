# ADR-0318 — composeRuntime adopts the authoritative element-store registry

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-08-11 |
| Decides | BIM20-CERTIFICATION-PLAN §B.1 — "Where do the authoritative element stores live?" (the drafted 3-option outline) |
| Closes | The root cause under the dead-verb class: the composed runtime offered nothing authoritative to write, so V3 was UNPROVABLE-BY-CONSTRUCTION for 12 of 14 element kinds |
| Owner | Architecture lead |
| Implementation | `packages/runtime-composer/src/composeRuntime.ts` (§6 elements slot); `packages/runtime-composer/src/types.ts` (`ElementStoresSlot`); `packages/core-app-model/package.json` (additive `./store-registry` export) |
| Probe | `tools/rac-conformance/runtime-harness/__tests__/adr0318.stores.probe.ts` (same-instance identity, executed) |
| Related | STR-03 P1 (single composition root); C03 (state); C16 §5.1 CA-21; ADR-0316 (the second-composition-root precedent this deliberately does NOT extend); DEAD-WRITE-REMEDIATION-PLAN §1.1 |
| Tags | `§ADR-0318-ELEMENTS-SLOT`, `§STORE-IDENTITY-NOT-CONSTRUCTION` |

---

## Context

`composeRuntime()` — the P1 single composition root — returns a runtime that cannot answer
"did this command change the model?" for 12 of 14 element kinds. Its `StoresSlot` is
`{registerHydrator, hydrate, viewState, project}` and nothing else (`composeRuntime.ts:1498`
pre-change). The authoritative geometry stores — the instances `ProjectSerializer`, the
fragment builders, the 2-D projector and the IFC exporter actually read — are constructed by
the DOM half (`apps/editor/src/engine/engineLauncher.ts` + `initBuilders.ts` + the tools:
`wallTool.getWallStore()`, `new SlabStore(projectContext)`, …) and were never referenced by
`composeRuntime`. Doors/windows were reachable headlessly only because `DoorStore.ts:224` /
`WindowStore.ts` happen to export module singletons — "by accident of module scope"
(audit §17.0.1). The executed evidence: `compose.probe.ts` / `discover.probe.ts` — 12
element-kind stores ABSENT from the composed runtime, `runtime.stores` keys =
`registerHydrator,hydrate,viewState,project`.

This is the single cause behind the dead-verb family, the 16 shadowed routes and the
curtain-wall no-op: handlers kept being authored against fresh plugin-DTO stores
(`PluginRegistry.buildStore: () => new WallStore()`) because the composition root offered
nothing authoritative to write.

**The load-bearing facts this decision rests on (verified in source, not remembered):**

1. **A shared registry already exists and is already populated with the authoritative
   instances.** `packages/core-app-model/src/StoreRegistry.ts:151` exports a module-singleton
   `storeRegistry`. `engineLauncher.ts:767–781` calls `registerAllStores(...)`
   (`apps/editor/src/engine/initStores.ts`) registering **21 element stores** under canonical
   type keys — and the instances it registers are expression-for-expression the same ones it
   hands to `initPersistence` for the serializer at `engineLauncher.ts:817–832`
   (`wallTool.getWallStore()`, `slabStore`, `roofStore`, …). Registry identity ≡ serializer
   identity, by construction, today, with zero new wiring.
2. **The only module-singleton element stores in `packages/geometry-*` are door/window**
   (`DoorStore.ts`, `WindowStore.ts`; the rest of the `export const *Store` hits are
   system-type stores). The other 12 kinds have **no headless-constructible authoritative
   instance**: their constructors take engine objects (`projectContext`, `bimManager`,
   level providers) and their construction sites live inside tools/builders.
3. **Constructing rivals forks state.** The plugin-DTO half already demonstrates it: every
   `new WallStore()` from `PluginRegistry` is a detached store whose writes render nowhere and
   serialize never. Any option in which `composeRuntime` `new`s stores that `engineLauncher`
   also `new`s reproduces the defect at the composition root itself.
4. `storeRegistry.clear()` has **zero production callers**, and `register()` is idempotent for
   the same instance (warns + replaces only on a *different* instance) — safe to adopt.

## Decision

**Option 2 of the §B.1 outline — invert the registration edge — instantiated on the registry
that already exists.** `composeRuntime` does not construct element stores and does not receive
them as parameters; it **adopts the module-singleton `storeRegistry` as the runtime's
authoritative element-store slot** and exposes it, typed, at `runtime.stores.elements`.

Concretely:

1. **`runtime.stores.elements`** (`ElementStoresSlot` in `types.ts`) is a live, typed view
   over `storeRegistry`: `get(kind)` / `has(kind)` / `kinds()` / `forElement(id)` /
   `register(kind, store)`. It is a *view*, not a copy — `get('wall')` after engine boot
   returns the **same instance** `ProjectSerializer` reads, because `registerAllStores`
   writes the same registry object.
2. **`composeRuntime` registers the two true module singletons itself** — `doorStore` /
   `windowStore` (dynamic-imported so chunk layering is preserved) — under their canonical
   keys at compose time. In the browser, `engineLauncher`'s later `registerAllStores` call
   re-registers the *same instances* (it imports the same module singletons at
   `engineLauncher.ts:24–25`), which is idempotent by the registry contract. Headless
   runtimes therefore have real authoritative door/window stores **by design, not by
   module-scope accident**.
3. **`engineLauncher` is unchanged.** Its existing `registerAllStores` call is the browser-side
   filler of the slot. The remaining 12 kinds migrate **per kind**: each kind's construction
   moves behind a headless-safe factory (or its constructor's engine deps become injected
   thunks), at which point `composeRuntime` registers it too and the kind leaves the
   ABSENT-headless list. That is Option 1's end state reached incrementally, without the
   big-bang wiring change or the L-816-class bundle risk.
4. **`composeRuntime` does not `clear()` or `unregister()` at tearDown.** The registry's
   entries are (or will be, post-migration) module-lifetime singletons — exactly the lifetime
   `doorStore` already has. Clearing on tearDown would wipe a hot-reload successor runtime's
   registrations (teardown of the old runtime can run *after* the new compose). Documented at
   the call site.
5. **Additive export**: `@pryzm/core-app-model` gains the subpath
   `"./store-registry": "./src/StoreRegistry.ts"`. `StoreRegistry.ts` imports nothing — the
   deep path lets `composeRuntime` reach the singleton without pulling the core-app-model
   barrel (THREE/@thatopen at module scope) onto the compose path. Barrel and deep path
   resolve to the same module file, hence the same singleton — asserted, not assumed, by the
   probe.

### Why not the other two options

- **Option 1 (composeRuntime constructs the stores, engineLauncher receives them)** is the
  right *end state* but the wrong *move*: it is the largest wiring change on the board,
  touches every store consumer at once, requires threading `projectContext`/`bimManager`
  construction out of tools mid-flight, and carries the measured-not-assumed bundle risk
  ADR-0316 quantified (281 KB THREE). This ADR reaches the same end state per kind, each step
  provable by the same-instance probe.
- **Option 3 (bless the split, ADR-0316 pattern)** is honest but a dead end the founder's own
  decision drivers exclude: server-side command evaluation (BIM 3.0, AI workers) and headless
  certification are on the path, and Option 3 makes V3 unprovable headlessly *forever* —
  every certification becomes a browser harness. ADR-0316 blessed a genuinely separate
  *application*; engineLauncher is not a separate application, it is the un-migrated half of
  this one.

### Invariants this creates

- **I-1 (identity, not construction):** `runtime.stores.elements.get(k)`, when defined, IS the
  instance the serializer reads — never a copy, never a rival. Enforced by the executed
  same-instance probe; any future gate (CA-21 / FINISH-2) may rely on it.
- **I-2 (one registry):** the slot is backed by `storeRegistry` and nothing else. A second
  registry, or a compose-time `new <X>Store()` for a kind engineLauncher also constructs, is
  a P1 violation of this ADR.
- **I-3 (honest absence):** a kind absent from the registry reads `undefined` — headless
  callers see ABSENT, loudly, until that kind's construction migrates. No scaffold, no empty
  stand-in.

## Exit condition (per the §B.1 outline)

The discover/compose probes report zero ABSENT element kinds headlessly, **or** the register
carries a per-verb disposition naming the kinds that legitimately have no headless store.
This ADR moves door/window from "accident" to "by design" and creates the slot + migration
path for the remaining 12: **wall, slab, roof, room, ceiling, floor, furniture, plumbing,
stair, column, curtain-wall, grid, beam, handrail** remain ABSENT-headless (present in-browser
via `registerAllStores`) until their per-kind construction migrates. Each migration PR must
extend `adr0318.stores.probe.ts` with that kind's same-instance assertion.

## Consequences

- V3 read-backs for door/window are now reachable through the composed runtime's own surface
  (`runtime.stores.elements.get('door')`), not a private import — the CA-21 gate and the
  §C.2.1/C.2.2 harnesses can target `runtime.stores` uniformly.
- In-browser, **all 21 registered kinds** become reachable from the runtime handle the moment
  engineLauncher boots — panels and probes no longer need `window.*Store` globals for lookup
  (a step toward retiring the TASK-08 TODOs).
- `packages/headless` (FINISH-2/CLOSE-3 territory — **not touched by this change**): once its
  `minimalHeadlessBootstrap` passes a real `bootstrapFn`, the composed runtime it returns now
  carries `stores.elements` with authoritative door/window for free. **Handover note:** when
  un-mocking `@pryzm/runtime-composer` there, assert against `runtime.stores.elements`, not
  module imports — that keeps the package honest under I-1.
- New legal downward deps: `runtime-composer (L3) → core-app-model (L2)`,
  `→ geometry-door (L2)`, `→ geometry-window (L2)`. `pnpm-lock.yaml` re-synced for the three
  workspace deps.

## Named residual risks (open, not resolved here)

- `engineLauncher.ts:822/824` registers `columnStoreInstance` / `curtainWallStoreInstance`
  into the registry but hands `window.columnStore ?? columnStoreInstance` (and the curtain
  twin) to the serializer — the `TODO(TASK-08)` globals. If those window globals are ever a
  *different* instance, registry identity and serializer identity diverge for those two kinds.
  The same-instance probe cannot see this headlessly; the per-kind migration for column /
  curtain-wall must delete the `??` fallbacks.
- The registry's `BimStore` duck type is read-shaped (`getAll`/`has`/`get`/`getById`); writes
  go through each store's own API. The slot intentionally does not invent a uniform write
  surface — commands remain the only mutation path (P6).
