/**
 * @pryzm/headless — `minimalHeadlessBootstrap`.
 *
 * A REAL `BootstrapEverythingFn` built from the real L1/L3/L4 primitives
 * (`CommandBus`, `PatchEmitter`, `UndoStack`, `Store`, `CommitterHost`,
 * `ViewRegistry`).  Nothing here is a stub or a spy: `composeRuntime`
 * receives the same classes the browser composition root receives.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO — read this before using it.
 *
 * It registers **zero element-family command handlers**.  A runtime
 * composed with this bootstrap can dispatch only the handlers
 * `composeRuntime` itself registers; `wall.create`, `door.create`,
 * IFC import, etc. are NOT present.  That is an honest emptiness, not a
 * failure: the element handlers live in `plugins/*` and are assembled by
 * `bootstrapWithEverything` in `@pryzm/editor`, which is a **private**
 * workspace (`"private": true`) and therefore cannot be a dependency of a
 * published package.
 *
 * So:
 *  - Need the full command surface (IFC import, element creation)?
 *    Pass `bootstrapWithEverything` from `@pryzm/editor/bootstrap.everything`
 *    as `bootstrapFn` yourself.  You have it if you are inside this
 *    monorepo; you do not if you installed `@pryzm/headless` from npm.
 *  - Need only stores + bus wiring, registering your own handlers?
 *    This is for you.
 *
 * There is no default that silently gives you an empty bus while looking
 * like a full one — `bootstrapFn` is a REQUIRED option on
 * `headlessRuntime()` for exactly that reason.
 */

import {
  CommandBus,
  PatchEmitter,
  UndoStack,
  type CommandHandler,
} from '@pryzm/command-bus';
import { attachStores, type Store } from '@pryzm/stores';
import { CommitterHost } from '@pryzm/scene-committer';
import { ViewRegistry } from '@pryzm/view-state';
import type { RuntimeAudit } from '@pryzm/runtime-composer';
import type { BootstrapEverythingFn } from './headlessRuntime.js';

/** The `{ bus, host, viewRegistry, tearDown }` shape `composeRuntime`
 *  requires back from a bootstrap — derived from the composition root's
 *  own signature so it cannot drift. */
type EditorBootstrapResult = Awaited<ReturnType<BootstrapEverythingFn>>;

export interface MinimalHeadlessBootstrapOptions {
  /** L1 stores to register.  Default: none — an empty record.  Keys are
   *  the store keys handlers name in `affectedStores`. */
  readonly stores?: Readonly<Record<string, Store<object>>>;
  /** Command handlers to register on the real bus.  Default: none. */
  readonly handlers?: readonly CommandHandler<unknown, never>[];
}

/** Build a real (non-stub) `bootstrapFn` for headless composition.
 *
 *  Mirrors `@pryzm/editor`'s `bootstrap()` data half — CommandBus +
 *  PatchEmitter + UndoStack + `attachStores` patch routing + a
 *  `CommitterHost` — minus the renderer, the plugin registry and every
 *  browser API.  Returns the `{ bus, host, viewRegistry, tearDown }`
 *  shape `composeRuntime` requires. */
export function minimalHeadlessBootstrap(
  opts: MinimalHeadlessBootstrapOptions = {},
): BootstrapEverythingFn {
  return async function headlessBootstrapFn(
    bootstrapOpts: { readonly audit: RuntimeAudit },
  ): Promise<EditorBootstrapResult> {
    const stores: Readonly<Record<string, Store<object>>> = opts.stores ?? {};

    const emitter = new PatchEmitter();
    const undoStack = new UndoStack({ maxSize: 200 });
    const bus = new CommandBus({
      audit: bootstrapOpts.audit,
      storesProvider: () => storesAsRecordView(stores),
      emitter,
      undoStack,
    });
    for (const handler of opts.handlers ?? []) {
      bus.register(handler as CommandHandler<unknown>);
    }

    const detachStores = attachStores(emitter, stores);
    const host = new CommitterHost();
    const viewRegistry = new ViewRegistry();

    let torn = false;
    return {
      bus,
      host,
      viewRegistry,
      tearDown(): void {
        if (torn) return;
        torn = true;
        detachStores();
        host.dispose();
      },
    };
  };
}

/** `Record<storeKey, Record<id, dto>>` view the bus's `storesProvider`
 *  must return.  Snapshotted at call time so handlers see latest state. */
function storesAsRecordView(
  stores: Readonly<Record<string, Store<object>>>,
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, store] of Object.entries(stores)) {
    out[key] = Object.fromEntries(store.getState());
  }
  return out;
}
