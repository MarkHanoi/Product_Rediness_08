# ADR-0021 — Plugin descriptor + `bootstrapWithEverything()`

> Status: Accepted (W-1C-1, 2026-04-27)
> Context: Phase 1C exit. Wall plugin shipped its own `bootstrapWithWalls()`
> and the editor entry hand-wired it. Eleven other element families need to
> register the same way without N copies of the wiring code.

## Decision

Introduce a single `PluginDescriptor` shape that every PRYZM plugin exports,
plus a registry-driven `bootstrapWithEverything()` entry that iterates the
descriptors and wires the bus, stores, committers, and (optionally) the
view-state controller.

## Plugin descriptor contract

```ts
// apps/editor/src/PluginRegistry.ts (excerpt)
export interface PluginDescriptor<TStore = unknown> {
  /** Stable identifier — one of `wall | slab | door | window | roof |
   *  curtainwall | grid | column | beam | stair | handrail | ceiling | view`. */
  readonly id: string;
  /** Builds the plugin's store(s).  Single-channel per ADR-0002. */
  readonly buildStore: (deps: PluginDeps) => TStore;
  /** Builds the plugin's command handlers — must use the standard
   *  `buildXHandlerSet({ ... })` factory pattern. */
  readonly buildHandlers: (deps: PluginDeps & { store: TStore }) => readonly CommandHandler<unknown>[];
  /** Optional: scene committer hooks (kernel descriptor → THREE).
   *  `view` is the special-case plugin that omits this. */
  readonly committer?: SceneCommitterFactory;
  /** Optional: extra committers (e.g. wall has a join-edge committer in
   *  addition to the main wall committer). */
  readonly extraCommitters?: readonly SceneCommitterFactory[];
}
```

## Registry pattern

`apps/editor/src/PluginRegistry.ts` exports `ALL_PLUGINS: readonly PluginDescriptor[]`
and `ELEMENT_PLUGIN_IDS: readonly string[]`. The order is deterministic: the 12
element families first, then `view` last (so view-state can read the element
stores during defaults registration).

`bootstrapWithEverything()` walks the array exactly once:

1. For each descriptor, call `buildStore(deps)`. Insert into `runtime.stores`
   under the descriptor's `id`.
2. For each descriptor, call `buildHandlers({ ...deps, store })` and register
   them with the bus.
3. For each descriptor with a `committer`, register it with the scene-commit
   pipeline. Plugins that need extra committers (the wall-join-edge committer)
   declare them via `extraCommitters`.
4. After the loop, the `view` plugin's `buildStore` runs last so its
   defaults registry can introspect the now-populated element stores.

## Why `view` is special

The view plugin doesn't own any geometry — it owns the `ViewRegistry` and the
`ViewController`. It has no committer (its DOM-side render path lives in the
editor, not the committer pipeline), so the descriptor's `committer` field is
optional. The registry orders it last so its defaults can read element-store
metadata (e.g. "has at least one wall" → enable `default-3d` view).

## Handler-set DI consistency

Today the wall plugin's `buildWallHandlerSet({ systemTypeStore })` takes a
dependency object; the other 11 plugins take zero args. Under the descriptor
pattern every plugin receives `(deps: PluginDeps)`. Plugins that don't need
deps simply ignore the parameter. This unifies the contract and makes the
registry-iteration loop a one-liner.

## Acceptance gate

- `apps/editor/__tests__/hello-12-elements.test.ts` exercises every
  `<family>.create` command end-to-end through the registry-driven runtime.
- `apps/editor/__tests__/bootstrap.everything.test.ts` asserts the registry
  contains exactly 13 descriptors (12 element families + view).
- `tests/integration/all-12-elements.test.ts` exercises every kernel
  producer directly, pinning the producer-output invariant the registry
  relies on.

## Consequences

- Adding a 13th element family (e.g. `furniture` in 1D) is a one-line
  append to `ALL_PLUGINS`. No editor entry changes.
- The descriptor is intentionally narrow — it does NOT model UI panels or
  selection palettes. Those land in the editor's UI shell and key off the
  descriptor's `id` field.
- Cross-element cascade rules (ADR-0012) continue to register through their
  own dedicated registry; the plugin descriptor only models the element's
  own surface.
