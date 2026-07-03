# ADR-0116 — One wall system-type catalogue, seeded at the composition root

- Status: Accepted
- Date: 2026-07-03
- Tags: `§FIX-WALL-TYPE-UNIFY-CATALOGUE`
- Scope: `apps/editor/src/PluginRegistry.ts` (wall descriptor `buildAuxiliaries`
  + `buildSharedWallCatalogue`), `apps/editor/src/engine/engineLauncher.ts`
  (removed the dead §WALL-TYPE-WIRE re-registration + its import), plus
  regression tests `apps/editor/__tests__/wallTypeCatalogueUnified.test.ts` and
  the updated aux assertion in `apps/editor/__tests__/bootstrap.everything.test.ts`.
- Governs: C06 (types/UI), C11 (element-creation pipeline). Supersedes the L-41
  workaround wiring (`§WALL-TYPE-WIRE`, engineLauncher) and folds it into the
  single composition-root seam. Keeps the `§WALL-TYPE-THICKNESS` /
  `§FIX-PLAN-WALL-TYPE-IGNORED` behaviour intact (thickness is still resolved in
  `CreateWallHandler` — it now resolves against the one true store).
- Consistent with: P1 (single composition root), P4 (no `(window as any)` — reads
  the *typed* `window.wallSystemTypeStore` global declared in `global-window.d.ts`),
  P6 (mutations via commands — unchanged).

## Context (audit L-50, under L-41)

There were **two** `WallSystemTypeStore` classes with **divergent** catalogues:

1. `plugins/wall/src/system-type-store.ts` (`get`/`has`/`list`) — its built-ins
   included `wt-cmu-200`, `wt-glazed-curtain-stub`, `wt-stud-150`,
   `wt-foundation-300`, and `wt-monolithic` with a **0.1 m** body.
2. `packages/geometry-wall/src/WallSystemTypeStore.ts` (`getById`/`getAll`/
   `getTotalThickness`, plus full CRUD + `storeEventBus` + project-scope registry)
   — its built-ins included `wt-exposed-*`, `wt-timber-frame`, and `wt-monolithic`
   with a **1.0 m** body. This is the module singleton exposed as
   `window.wallSystemTypeStore`.

The type picker (`WallTypeSelectorWidget`), the plan-view create path
(`WallPlanToolHandler`), and the 3D thickness/layers stamping all read **(2)**.
User-defined types created via the picker's "New Type…" / "Duplicate Type…" land
in **(2)**.

The **authoritative** `wall.create` handler, however, was registered by the
composition root (`composeRuntime` → `bootstrapWithEverything` → `PluginRegistry`
`ALL_PLUGINS` wall descriptor), whose `buildAuxiliaries` minted a **fresh
instance of (1)**. Because `CommandBus.register` throws on a duplicate and the
editor wraps re-registration in the §OI-053 skip-if-present facade,
`composeRuntime` **wins** and the later `engineLauncher.ts` §WALL-TYPE-WIRE
adapter (which *did* point at `window.wallSystemTypeStore`) was **dead** — its
registration was always skipped.

Consequences:

- Overlapping ids carried **different** thicknesses between picker and handler
  (the L-41 mechanism: pick a type, get the wrong / default thickness).
- Non-overlapping ids (everything the picker offers that (1) lacks, and **every
  user-defined type**) missed in the handler's store → thickness fell back to the
  default; `SetWallSystemType` rebinds silently no-op'd.

## Decision

Collapse to **one** catalogue at the **composition root**. The wall descriptor's
`buildAuxiliaries` now returns `buildSharedWallCatalogue()` — a thin adapter that
exposes the geometry-wall singleton (`window.wallSystemTypeStore`, the picker's
store) in the shape the plugin handlers consume (`has`/`get`/`list`/`add`/`size`).
The singleton is read **lazily at call time** via the typed `window` global:

- keeps the composition root free of an eager geometry-wall → core-app-model
  module load (which touches the DOM at import), so the registry stays
  node-testable;
- `get()` runs at command-execute time, by which point `initBuilders` has
  assigned `window.wallSystemTypeStore`;
- it is the exact seam the formerly-dead engineLauncher adapter used — now hosted
  where the **authoritative** handler actually reads it.

`has()` is deliberately **permissive** (`() => true`): a faithful `has()` would
re-arm the dormant "unknown `systemTypeId` → reject at `canExecute`" branch across
every wall create handler — including `wall.batch.create`, which the apartment
generator drives with occasionally-unresolved ids. Resolution via `get()` is
best-effort and falls back to the caller's default thickness on a miss, so an
unknown/stale id can never *reject* a wall. This preserves the shipped
`§FIX-PLAN-WALL-TYPE-IGNORED` behaviour while removing the divergence.

The dead §WALL-TYPE-WIRE adapter + `registerWallHandlers(_bus, { … })` in
`engineLauncher.ts` is removed; the call becomes a plain
`registerWallHandlers(_bus)` for parity with its sibling `registerXxxHandlers`
calls (still an idempotent no-op under the §OI-053 facade).

## Consequences

- The picker, the plan/3D create paths, and the authoritative `CreateWall` /
  `CreateWallBatch` / `SetWallSystemType` handlers now share **one** catalogue:
  the geometry-wall singleton. Picker-selected and user-defined types resolve to
  the correct thickness/layers everywhere.
- The plugin-side `system-type-store.ts` catalogue (1) is no longer instantiated
  on the active runtime path (it remains for its own unit tests and the dormant
  `bootstrap.data.ts` `bootstrapWithWalls` path). Its `WallSystemTypeStore` *type*
  is still the structural contract the handlers depend on.
- `§WALL-TYPE-THICKNESS` in `CreateWallHandler` is retained and correct — it is
  the mechanism by which the resolved thickness reaches the stored wall (so plan
  view and 3D agree); it now reads the one true store.

## Tests

- `apps/editor/__tests__/wallTypeCatalogueUnified.test.ts` — with a live
  `window.wallSystemTypeStore`, a picker built-in (`wt-monolithic`, 1.0 m) and a
  user-added type (0.33 m) both create walls at the correct thickness through the
  real `buildWallHandlerSet({ systemTypeStore: buildSharedWallCatalogue() })`;
  an unknown/picker-only id is **not** rejected.
- `apps/editor/__tests__/bootstrap.everything.test.ts` — the wall aux now exposes
  the unified catalogue adapter (`has`/`get`, permissive `has`) rather than an
  `instanceof` the plugin store.
