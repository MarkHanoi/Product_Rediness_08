// @pryzm/plugin-sdk — THE RUNTIME REGISTRATION CONTRACT, AT L5.
//
// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921, lane PLUGIN2 · ADR-0367 · amends C01 §3 / C11 §6.3)
//
// ─── What moved, and why it is the root cause of nine shipped defects ────────
//
// The shape a plugin contributes at boot — its store, its handler set, its
// auxiliaries, its UI contributions, its event subscriptions — was declared as
// `PluginDescriptor` in `apps/editor/src/PluginRegistry.ts:133`. That file is
// **L7**, the top of the model, and `PluginRegistry.ts:13-17` recorded the
// consequence as a deliberate decision:
//
//     // Layering note.  Each `PluginDescriptor` is constructed in this file
//     // (apps/editor → plugins is the correct dep direction; the reverse would
//     // require plugins to import editor types and would reintroduce a cycle).
//     // Per-plugin `descriptor.ts` files were considered and rejected on those
//     // grounds; the descriptor records below are the single source of truth.
//
// The reasoning was locally correct and globally load-bearing. A contract type
// at the TOP of a stack cannot be named by anything below it, so **a plugin
// could not describe itself** — every descriptor had to be hand-written in one
// central L7 file, and a family whose five lines were never written there was
// registered-and-undispatchable. That has now happened NINE times: furniture,
// plumbing, rooms, structural and dimensions (E-finish.0.E), then lighting
// (§LIGHTING-STORE-FIX), pool (L-5200), lift (L-5700) and balcony (L-5600) —
// each fully built, fully tested by its own suite, and thrown out by
// `CommandBus.buildContext` with
//
//     "<verb>: required store '<key>' is missing from HandlerContext.stores"
//
// before any mutation. The mitigation shipped each time was one more per-family
// reachability test: N tests for N families, with the (N+1)th uncovered by
// construction.
//
// ⭐ THE FIX IS WHICH END OF THE STACK THE TYPE SITS AT. Declared here, at L5,
// `plugins/<x>/src/registration.ts` importing `@pryzm/plugin-sdk` is a
// **DOWNWARD** import (L6 → L5) and therefore always legal — and it is a legal
// import THROUGH THE FACADE, so it cannot raise the SDK-bypass ratchet
// (`check-layer-boundaries.ts`, shrink-only) either. The objection
// `PluginRegistry.ts:13-17` recorded is removed rather than argued with.
//
// ─── Why the name is not `PluginDescriptor` ─────────────────────────────────
//
// ⚠ `PluginDescriptor` was ALREADY TAKEN, TWICE, and by two different things:
//
//   1. `packages/plugin-sdk/src/descriptor.ts` — `export type PluginDescriptor =
//      PluginManifest`, the on-disk `plugin.manifest.json` envelope, LOCKED for
//      v1.x by ADR-0038 §Decision C. Re-pointing that name would be a breaking
//      change to a published npm package (`@pryzm/sdk`).
//   2. `packages/runtime-composer/src/types.ts` — what `PluginsSlot.list()`
//      returns, i.e. the CATALOGUE row, which is a different object again.
//
// Three unrelated types called `PluginDescriptor` in one repo is how a census
// drifts in the first place. This one is named for what it IS — the record a
// plugin REGISTERS with — and `apps/editor/src/PluginRegistry.ts` keeps
// `PluginDescriptor` as a local alias so no existing call site moves.
//
// ─── What this file may NOT import ──────────────────────────────────────────
//
// ⛔ Nothing above L5. In particular NOT `@pryzm/runtime-composer`'s
// `PluginContribution` (its `activate` takes the whole `PryzmRuntime`) and NOT
// `@pryzm/plugin-rooms`' `RoomEventRuntime` — an L5 file importing an L6 plugin
// is exactly the upward edge this move exists to delete, and it would raise
// `check-layer-boundaries.ts` (currently a ratchet ABOVE its own ceiling).
// Both are therefore TYPE PARAMETERS, defaulted to the weakest structural
// shape that still type-checks. `apps/editor` supplies the real ones when it
// declares its alias; a plugin authoring its own registration uses the default
// and stays free of both packages.
//
// This is the same technique `plugins/wall/src/contributions.ts` already uses
// for `wallToolbarContribution` (a local structural `WallContributionRuntime`
// rather than a static dep on runtime-composer) — generalised, and written down
// once instead of per plugin.

import type { CommandHandler } from '@pryzm/command-bus';
import type { Store } from '@pryzm/stores';

/** Deps bag handed to `buildHandlers` — the accumulated `buildAuxiliaries()`
 *  output of every registration built so far, keyed by auxiliary name. Typed
 *  loosely (each plugin reads its own keys with a local cast) so the contract
 *  stays free of cycles. Formerly `PluginDeps` at L7. */
export type PluginRegistrationDeps = Readonly<Record<string, unknown>>;

/**
 * The weakest shape a UI contribution can have and still be routed.
 *
 * ⚠ Deliberately NOT `@pryzm/runtime-composer`'s `PluginContribution`. That
 * type's `activate` is `(runtime: PryzmRuntime) => void`, so naming it here
 * would drag the entire L3 runtime contract into L5 and make every plugin that
 * contributes a toolbar button depend on it. `kind` + `id` is what the host
 * actually dispatches on; everything else is the host's business.
 */
export interface PluginContributionLike {
  /** Discriminator the host routes on (e.g. `'toolbar.discipline'`). */
  readonly kind: string;
  /** Stable contribution id (e.g. `'wall.tool'`). */
  readonly id: string;
}

/**
 * A registered plugin's runtime contribution — built once at boot and consumed
 * by `bootstrapWithEverything()`.
 *
 * @typeParam TContribution         the host's contribution union. `apps/editor`
 *   narrows this to `@pryzm/runtime-composer`'s `PluginContribution`; a plugin
 *   authoring its own registration leaves it at the structural default.
 * @typeParam TSubscriptionRuntime  the runtime shape `wireSubscriptions`
 *   receives. Narrowed by the host for the same reason.
 *
 * ⚠ **STATED AS A LIMIT, NOT SOLD AS COMPLETE.** Both defaults are chosen so a
 * registration authored in a plugin with NEITHER field is assignable to the
 * host's narrowed alias — which is the case that matters, and the case
 * section-view proves. A plugin that wants to author its OWN `contributions`
 * or `wireSubscriptions` still cannot, because `readonly PluginContributionLike[]`
 * is not assignable to `readonly PluginContribution[]` (arrays are covariant)
 * and the host's subscription runtime is narrower than `unknown`. Closing that
 * needs `PluginContribution` itself moved to L5, which is a separate move with
 * a separate risk; it is item 2 of the backlog in ADR-0367 §6, NOT something
 * this file quietly half-does.
 */
export interface PluginRegistration<
  TContribution extends PluginContributionLike = PluginContributionLike,
  TSubscriptionRuntime = unknown,
> {
  /** Stable plugin id. ⭐ MUST equal the DIRECTORY NAME under `plugins/`, not
   *  the package name and not the store key — `check-plugin-census-equivalence.ts`
   *  compares this set against `ls plugins/` in both directions, so an id that
   *  drifts from the directory shows up as a phantom registration (arm D) AND a
   *  dark directory (arm A) at the same time. */
  readonly id: string;

  /** Key under `runtime.stores[<key>]`. ⭐ MUST equal the key the plugin's own
   *  handlers name in `affectedStores` and read as `ctx.stores.<key>` — these
   *  are NOT required to match `id` (section-view registers `'section'`), and
   *  every one of the nine undispatchable families was this key missing or
   *  misspelt. Empty string means the plugin contributes no `Store<T>`. */
  readonly storeKey: string;

  /** Build the canonical store instance. Returns `undefined` only for plugins
   *  that genuinely ship no `Store<T>`; the boot loop calls this
   *  unconditionally, so it may not be omitted. */
  readonly buildStore: () => Store<object> | undefined;

  /** Build the handler set. Receives the auxiliaries contributed by
   *  registrations built earlier in `ALL_PLUGINS` order. */
  readonly buildHandlers: (deps: PluginRegistrationDeps) => readonly CommandHandler<unknown>[];

  /** Auxiliary objects merged into `runtime.auxiliaries` (catalogues,
   *  registries, ad-hoc stores), keyed by a stable string. */
  readonly buildAuxiliaries?: () => Readonly<Record<string, unknown>>;

  /** UI / panel / toolbar contributions surfaced through
   *  `runtime.plugins.contributions(kind)`. */
  readonly contributions?: readonly TContribution[];

  /** Optional runtime event-subscription wiring, called once after
   *  `composeRuntime()` resolves. Returns a disposer invoked at tear-down. */
  readonly wireSubscriptions?: (runtime: TSubscriptionRuntime) => () => void;
}
