// editor/bootstrap.data — opinionated default wiring for the wall plugin
// (S07 cleanup).
//
// `bootstrap.ts` is intentionally minimal: it ships the L0→L5 plumbing
// and a single CubeStore default so the legacy Hello-Cube demo keeps
// rendering verbatim.  Adding the wall plugin's stores + handlers + the
// dev-handle to that file would couple the skeleton to the wall plugin
// (and break the existing `bootstrap.test.ts` snapshot — `rt.stores.cube`
// instanceof CubeStore).
//
// `bootstrapWithWalls()` is the sibling for "I want walls in the runtime
// today, please."  It:
//
//   1. Constructs a `WallStore` (registered on `runtime.stores.wall`
//      so `attachStores()` routes `wall.*` patches to it) plus a
//      `WallSystemTypeStore` (held OUTSIDE the patch-routing registry
//      because the catalogue is project-level config, not undo-able
//      element state — see ADR-008 §3.D and the catalogue store's own
//      header comment).
//   2. Builds the 5 S07 handlers via `buildWallHandlerSet`, passing
//      the catalogue so `wall.create` validates `cmd.systemTypeId` at
//      the gate.
//   3. Forwards every other `BootstrapOptions` field verbatim to
//      `bootstrap()` so callers can layer their own stores, handlers,
//      and committers on top.
//   4. Installs `globalThis.__pryzm2DevHandle` (browser only) — a tiny
//      Console-friendly handle exposing `bus`, `stores`, `undoStack`,
//      the catalogue, and `runtime`.  Detection is `typeof window !==
//      'undefined' && window === globalThis` so Node's vitest + the
//      SSR bench don't mutate a global.  Detached on `tearDown()`.
//
// Smoke-tested by `__tests__/bootstrap.data.test.ts`.

import {
  WallStore,
  WallSystemTypeStore,
  buildWallHandlerSet,
} from '@pryzm/plugin-wall';
import type { CommandHandler } from '@pryzm/command-bus';
import type { Store } from '@pryzm/stores';
import { bootstrap, type BootstrapOptions, type EditorRuntime } from './bootstrap.js';

/** The dev-handle shape exposed on `window.__pryzm2DevHandle` in browser
 *  builds.  Kept intentionally narrow — wider surfaces (commands,
 *  scheduler) land at S08+. */
export interface PryzmDevHandle {
  readonly runtime: WallsEditorRuntime;
  readonly bus: EditorRuntime['bus'];
  readonly stores: EditorRuntime['stores'];
  readonly undoStack: EditorRuntime['undoStack'];
  readonly wallSystemTypes: WallSystemTypeStore;
}

/** Runtime returned by `bootstrapWithWalls` — extends `EditorRuntime`
 *  with a typed pointer to the catalogue.  Avoids forcing callers to
 *  re-import `WallSystemTypeStore` just to read built-in types. */
export interface WallsEditorRuntime extends EditorRuntime {
  readonly wallSystemTypes: WallSystemTypeStore;
}

declare global {
  var __pryzm2DevHandle: PryzmDevHandle | undefined;
}

/** Construct an `EditorRuntime` with the wall plugin pre-wired:
 *
 *  - `stores.wall` = `WallStore` — patches routed through `attachStores`.
 *  - `wallSystemTypes` = `WallSystemTypeStore` — exposed alongside,
 *    NOT in `stores`.
 *  - 5 S07 handlers registered on the bus, with `systemTypeId`
 *    validation enabled.
 *  - `globalThis.__pryzm2DevHandle` installed in browser environments.
 *
 *  Any caller-supplied `stores`/`handlers`/`committers` are appended on
 *  top — the wall store + handlers ALWAYS land first, so callers can
 *  override them by passing their own under the same keys / types.
 */
export function bootstrapWithWalls(opts: BootstrapOptions): WallsEditorRuntime {
  const wallStore = new WallStore();
  const wallSystemTypes = new WallSystemTypeStore();

  const stores: Record<string, Store<object>> = {
    wall: wallStore as unknown as Store<object>,
    ...(opts.stores ?? {}),
  };

  const handlers: CommandHandler<unknown, never>[] = [
    ...(buildWallHandlerSet({ systemTypeStore: wallSystemTypes }) as readonly CommandHandler<
      unknown,
      never
    >[]),
    ...(opts.handlers ?? []),
  ];

  const inner = bootstrap({ ...opts, stores, handlers });

  // Browser-only dev handle.  Detection: `window` exists AND it is the
  // global object — true in browsers, false in Node (where `window` is
  // undefined unless a test polyfills it).
  const win =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { window?: unknown }).window !== 'undefined' &&
    (globalThis as { window?: unknown }).window === globalThis
      ? (globalThis as unknown as { __pryzm2DevHandle?: PryzmDevHandle })
      : undefined;

  const innerTearDown = inner.tearDown.bind(inner);
  const runtime: WallsEditorRuntime = {
    ...inner,
    wallSystemTypes,
    tearDown(): void {
      innerTearDown();
      if (win !== undefined && win.__pryzm2DevHandle?.runtime === runtime) {
        delete win.__pryzm2DevHandle;
      }
    },
  };

  if (win !== undefined) {
    win.__pryzm2DevHandle = {
      runtime,
      bus: runtime.bus,
      stores: runtime.stores,
      undoStack: runtime.undoStack,
      wallSystemTypes,
    };
  }

  return runtime;
}
