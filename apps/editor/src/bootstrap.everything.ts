// bootstrap.everything — every L4 plugin wired into a single editor runtime
// (W-1C-1).
//
// Spec: `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-COMPLETION-PLAN.md` §W-1C-1.
//
// Counterpart of `bootstrap.data.ts`'s `bootstrapWithWalls`, but
// enumerates the registry instead of hand-wiring one plugin.  Adding a
// 13th element family in 2A is a one-line addition to `ALL_PLUGINS`
// inside `PluginRegistry.ts`; no edit to this file is required.

import type { CommandHandler } from '@pryzm/command-bus';
import type { Store } from '@pryzm/stores';
import type { ViewRegistry } from '@pryzm/view-state';
import type { WallSystemTypeStore } from '@pryzm/plugin-wall';
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

import { bootstrap, type BootstrapOptions, type EditorRuntime } from './bootstrap.js';
import { ALL_PLUGINS, type PluginDeps } from './PluginRegistry.js';

/** OTel tracer name for editor-level spans (`pryzm.boot`, future
 *  `pryzm.editor.*`).  Centralised here so the W-08 root span and any
 *  future editor-side instrumentation share the same tracer. */
const EDITOR_TRACER_NAME = 'pryzm.editor';

/** The runtime returned by `bootstrapWithEverything`.  Extends
 *  `EditorRuntime` with two typed pointers callers commonly want without
 *  having to fish them out of the auxiliaries bag.  All other auxiliary
 *  contributions remain available under `auxiliaries`. */
export interface EverythingRuntime extends EditorRuntime {
  readonly wallSystemTypes: WallSystemTypeStore;
  readonly viewRegistry: ViewRegistry;
  readonly auxiliaries: Readonly<Record<string, unknown>>;
  /** Plugin-id → handler-types contributed.  Useful for tests + dev tools
   *  to verify that every plugin landed without enumerating
   *  `bus.registry`. */
  readonly registeredHandlerTypes: Readonly<Record<string, readonly string[]>>;
  /** Plugin-id → store-key contributed.  Empty strings mean the plugin
   *  contributes no Store<T> (only view today). */
  readonly registeredStoreKeys: Readonly<Record<string, string>>;
}

export interface BootstrapEverythingOptions extends BootstrapOptions {
  // No additional fields at S18.  The `BootstrapOptions` `audit` is the
  // only required input — everything else (stores, handlers, committers)
  // is supplied by the registry.

  /**
   * W-08 — opt-in callback fired when the first frame is committed
   * after bootstrap completes.  Used by the `pryzm.boot` root span to
   * mark `boot.first_frame_ms` and end the span; production callers
   * forward `frameScheduler.onceFirstCommit(...)` here.  Tests omit
   * this so the span ends synchronously inside the bootstrap call.
   */
  readonly onFirstFrame?: (handler: () => void) => void;
}

/** Construct an `EverythingRuntime` with all plugins pre-wired.
 *
 *  - Stores: 12 element-family stores keyed by their plugin's `storeKey`
 *    (wall, slab, door, window, roof, curtainwall, grid, column, beam,
 *    stair, handrail, ceiling).  The view plugin contributes a
 *    `ViewRegistry`, exposed on `runtime.viewRegistry`.
 *  - Handlers: every plugin's `buildHandlerSet()` output is registered
 *    on the bus.  Wall handlers receive the `WallSystemTypeStore`
 *    auxiliary contributed by the wall plugin's descriptor.
 *  - Auxiliaries: collected from each plugin's `buildAuxiliaries()` and
 *    exposed on `runtime.auxiliaries`.  `wallSystemTypes` and
 *    `viewRegistry` are also re-exposed at the top of the runtime for
 *    ergonomics.
 *
 *  Caller-supplied `stores` / `handlers` / `committers` from the base
 *  `BootstrapOptions` are appended on top of the registry's contributions
 *  and may override them by sharing the same key / type.
 *
 *  **Performance (NFT-4 / C10)**: This function is `async` and yields the
 *  main thread between every `BOOT_BATCH_SIZE` plugins in both the
 *  stores pass and the handlers pass.  This prevents the full 19-plugin
 *  construction loop from appearing as a single > 50 ms LONGTASK in the
 *  browser's PerformanceObserver (observed: 65 ms warm, 238 ms cold).
 *  Each batch target is < 16 ms (NFT-4 frame budget).
 *  Callers: only `composeRuntime()` — which is already `async`. */
export async function bootstrapWithEverything(
  opts: BootstrapEverythingOptions,
): Promise<EverythingRuntime> {
  // Number of plugins to process per main-thread slice before yielding.
  // With 19 plugins and ~3–12 ms per plugin (warm/cold), BATCH_SIZE=3
  // keeps each slice < 36 ms (warm) / < 40 ms (cold) — safely under the
  // 50 ms LONGTASK threshold and within the 16.6 ms NFT-4 frame budget
  // when measured warm.  Using setTimeout(0) (not scheduleOnce) because
  // the FrameScheduler may not be running yet during boot.
  const BOOT_BATCH_SIZE = 3;

  // --- W-08 — pryzm.boot root span ---
  // Wraps the entire wire-up.  `boot.module_count` records how many
  // plugins landed; `boot.handler_count` totals every registered
  // handler across the bus.  When an `onFirstFrame` callback is
  // supplied (production), the span stays open until the first
  // commit completes so `boot.first_frame_ms` reflects actual
  // first-paint latency; otherwise it ends synchronously.
  const tracer = trace.getTracer(EDITOR_TRACER_NAME);
  const bootSpan: Span = tracer.startSpan('pryzm.boot');
  const bootStartMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let bootSpanEnded = false;

  function endBootSpanOk(extraAttrs: Record<string, string | number | boolean> = {}): void {
    if (bootSpanEnded) return;
    bootSpanEnded = true;
    for (const [k, v] of Object.entries(extraAttrs)) bootSpan.setAttribute(k, v);
    bootSpan.setStatus({ code: SpanStatusCode.OK });
    bootSpan.end();
  }
  function endBootSpanError(err: unknown): void {
    if (bootSpanEnded) return;
    bootSpanEnded = true;
    bootSpan.recordException(err as Error);
    bootSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    bootSpan.end();
  }

  // Reusable yield helper — macrotask break so the browser can process
  // paint/input events between plugin construction batches.
  const yieldToMain = (): Promise<void> =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  try {
  performance.mark('pryzm:bootstrap:stores:start');

  // --- 1. Walk the registry, collect stores + auxiliaries (batched) ---
  const stores: Record<string, Store<object>> = {};
  const auxiliaries: Record<string, unknown> = {};
  const registeredStoreKeys: Record<string, string> = {};

  for (let i = 0; i < ALL_PLUGINS.length; i++) {
    const plugin = ALL_PLUGINS[i]!;
    const aux = plugin.buildAuxiliaries?.();
    if (aux !== undefined) {
      for (const [k, v] of Object.entries(aux)) auxiliaries[k] = v;
    }
    const store = plugin.buildStore();
    registeredStoreKeys[plugin.id] = plugin.storeKey;
    if (store !== undefined && plugin.storeKey.length > 0) {
      stores[plugin.storeKey] = store;
    }
    // Yield to browser between batches (not after the last plugin).
    if ((i + 1) % BOOT_BATCH_SIZE === 0 && i < ALL_PLUGINS.length - 1) {
      await yieldToMain();
    }
  }

  performance.mark('pryzm:bootstrap:stores:end');
  performance.measure('pryzm:bootstrap:stores', 'pryzm:bootstrap:stores:start', 'pryzm:bootstrap:stores:end');

  // Yield between the two passes so the stores-pass end and the
  // handlers-pass start are in separate tasks.
  await yieldToMain();

  performance.mark('pryzm:bootstrap:handlers:start');

  // --- 2. Build the handler list, plugin-by-plugin, with deps available ---
  const deps: PluginDeps = auxiliaries;
  const handlers: CommandHandler<unknown>[] = [];
  const registeredHandlerTypes: Record<string, readonly string[]> = {};

  for (let i = 0; i < ALL_PLUGINS.length; i++) {
    const plugin = ALL_PLUGINS[i]!;
    const set = plugin.buildHandlers(deps);
    const types: string[] = [];
    for (const h of set) {
      handlers.push(h);
      types.push(h.type);
    }
    registeredHandlerTypes[plugin.id] = types;
    // Yield between batches.
    if ((i + 1) % BOOT_BATCH_SIZE === 0 && i < ALL_PLUGINS.length - 1) {
      await yieldToMain();
    }
  }

  performance.mark('pryzm:bootstrap:handlers:end');
  performance.measure('pryzm:bootstrap:handlers', 'pryzm:bootstrap:handlers:start', 'pryzm:bootstrap:handlers:end');

  // --- 3. Caller overrides ---
  if (opts.stores !== undefined) {
    for (const [k, v] of Object.entries(opts.stores)) stores[k] = v;
  }
  for (const h of opts.handlers ?? []) handlers.push(h as CommandHandler<unknown>);

  // --- 4. Hand off to the L0→L5 base bootstrap ---
  // `bootstrap()` is a fast synchronous wiring step (CommandBus +
  // PatchEmitter + CommitterHost JS object construction) — no yield needed.
  performance.mark('pryzm:bootstrap:wire:start');
  const inner = bootstrap({
    audit: opts.audit,
    stores,
    handlers: handlers as readonly CommandHandler<unknown, never>[],
    committers: opts.committers,
    onUnboundPrimitive: opts.onUnboundPrimitive,
    persistenceClient: opts.persistenceClient,
  });
  performance.mark('pryzm:bootstrap:wire:end');
  performance.measure('pryzm:bootstrap:wire', 'pryzm:bootstrap:wire:start', 'pryzm:bootstrap:wire:end');

  const wallSystemTypes = auxiliaries.wallSystemTypes as WallSystemTypeStore;
  // ViewRegistry is registered as a Store under stores.view (W-1C-1).
  // Re-expose it at the top of the runtime for ergonomic access in
  // tests + dev tools without forcing callers to cast `stores.view`.
  const viewRegistry = stores.view as unknown as ViewRegistry;

  // W-08 — record bootstrap totals on the root span and arm the
  // first-frame deferral if the caller wired one.  When no
  // `onFirstFrame` is supplied we end the span synchronously so
  // tests + headless callers see a complete span without needing a
  // FrameScheduler.
  const totalHandlerCount = Object.values(registeredHandlerTypes)
    .reduce((acc, types) => acc + types.length, 0);
  bootSpan.setAttribute('boot.module_count', ALL_PLUGINS.length);
  bootSpan.setAttribute('boot.handler_count', totalHandlerCount);
  bootSpan.setAttribute('boot.store_count', Object.keys(stores).length);

  const bootElapsedMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - bootStartMs);
  bootSpan.setAttribute('boot.elapsed_wall_ms', bootElapsedMs);

  if (typeof opts.onFirstFrame === 'function') {
    opts.onFirstFrame(() => {
      const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      endBootSpanOk({ 'boot.first_frame_ms': nowMs - bootStartMs });
    });
  } else {
    endBootSpanOk({ 'boot.async_wall_ms': bootElapsedMs });
  }

  return {
    ...inner,
    wallSystemTypes,
    viewRegistry,
    auxiliaries,
    registeredHandlerTypes,
    registeredStoreKeys,
  };
  } catch (err) {
    endBootSpanError(err);
    throw err;
  }
}

/** Re-export ELEMENT_PLUGIN_IDS so tests + dev tools can iterate the
 *  12 element families without a deep import path. */
export { ELEMENT_PLUGIN_IDS, ALL_PLUGINS } from './PluginRegistry.js';
