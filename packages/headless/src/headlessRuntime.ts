/**
 * @pryzm/headless — headlessRuntime() factory.
 *
 * Phase F boolean #8 prerequisite (2026-05-02).
 *
 * Headless mode is natively supported by @pryzm/runtime-composer:
 * `composeRuntime({ canvas: null, … })` returns a fully functional
 * PryzmRuntime where `runtime.scene.renderer === null` and no WebGL
 * context is created.  No NullRenderer shim is needed.
 *
 * ⚠ CORRECTED 2026-08-11 — 1.0.0-rc.1 COULD NOT COMPOSE.
 *
 * This function used to call:
 *
 *     composeRuntime({ audit: options.audit, canvas: null })
 *
 * `ComposeRuntimeOptions` has TWO required fields — `audit` **and**
 * `bootstrapFn` — and `composeRuntime` calls `opts.bootstrapFn(...)`
 * unconditionally at composeRuntime.ts:883.  With `bootstrapFn` omitted
 * every call threw `TypeError: opts.bootstrapFn is not a function`.
 * `1.0.0-rc.1` therefore cannot do the one thing the package exists for.
 * `pnpm --filter @pryzm/headless typecheck` did report it
 * (`TS2345: Argument of type '{ audit; canvas }' is not assignable to
 * ComposeRuntimeOptions`) — but the unit test mocked
 * `@pryzm/runtime-composer` wholesale, so the suite stayed green and the
 * one honest signal was drowned in unrelated repo-wide tsc noise.
 *
 * `bootstrapFn` is REQUIRED here rather than defaulted, deliberately.
 * The data half (12 element-family stores + every plugin's handler set)
 * is assembled by `bootstrapWithEverything` in `@pryzm/editor`, which is
 * a `"private": true` workspace and can never be a dependency of a
 * published package.  Silently defaulting to an empty bootstrap would
 * hand callers a runtime whose `bus.registry` has no `wall.create` and no
 * IFC import while looking exactly like a working one — failure dressed
 * as emptiness.  So: you pass it, or you get an error that names it.
 *
 * Two supported ways to supply it:
 *
 *   // In-monorepo / full command surface (~236 handlers):
 *   import { bootstrapWithEverything } from '@pryzm/editor/bootstrap.everything';
 *   await headlessRuntime({ audit, bootstrapFn: bootstrapWithEverything });
 *
 *   // Stores + bus only, you register your own handlers:
 *   import { minimalHeadlessBootstrap } from '@pryzm/headless';
 *   await headlessRuntime({ audit, bootstrapFn: minimalHeadlessBootstrap() });
 */

import { composeRuntime } from '@pryzm/runtime-composer';
import type {
  ComposeRuntimeOptions,
  PryzmRuntime,
  RuntimeAudit,
} from '@pryzm/runtime-composer';

/** The composition root's own bootstrap-callback type, derived rather than
 *  re-declared, so this package cannot drift from `composeRuntime`'s
 *  signature.  `@pryzm/runtime-composer`'s barrel exports
 *  `ComposeRuntimeOptions` but not the underlying `BootstrapEverythingFn`
 *  / `EditorBootstrapResult` aliases; indexing the options type is the
 *  non-invasive way to get them.  (Optional hand-over to the
 *  runtime-composer owner: re-export those two aliases from
 *  `packages/runtime-composer/src/index.ts` and this indirection goes
 *  away.  Nothing here depends on that happening.) */
export type BootstrapEverythingFn = ComposeRuntimeOptions['bootstrapFn'];

export interface HeadlessRuntimeOptions {
  /**
   * Audit triple required by every composeRuntime() call.
   * In headless / CI contexts use synthetic identifiers:
   *   audit: { actorId: 'headless', projectId: 'ci', clientId: 'node' }
   */
  readonly audit: RuntimeAudit;

  /**
   * Data-half bootstrap.  REQUIRED — see the file header for why this is
   * not defaulted.  Pass `bootstrapWithEverything` from `@pryzm/editor`
   * for the full command surface, or `minimalHeadlessBootstrap()` from
   * this package for stores + bus with handlers you register yourself.
   */
  readonly bootstrapFn: BootstrapEverythingFn;
}

/**
 * Thrown when `headlessRuntime()` is called without a `bootstrapFn`.
 * Named so callers who hit it from untyped JS get a message that says
 * what to do, instead of `opts.bootstrapFn is not a function` raised
 * from three frames deep inside the composition root.
 */
export class HeadlessBootstrapMissingError extends Error {
  override readonly name = 'HeadlessBootstrapMissingError';
  constructor() {
    super(
      "@pryzm/headless: `bootstrapFn` is required. composeRuntime() cannot " +
        'build the data half without it. Pass `bootstrapWithEverything` from ' +
        "'@pryzm/editor/bootstrap.everything' for the full command surface, or " +
        "`minimalHeadlessBootstrap()` from '@pryzm/headless' for stores + bus " +
        'with no element handlers.',
    );
  }
}

/**
 * Compose a full PryzmRuntime in headless (no-browser-canvas) mode.
 *
 * The returned runtime has:
 *  - All data-half slots: bus, stores, selection, persistence, sync,
 *    visibility, ai, plugins, events, undoStack, viewRegistry, …
 *  - `runtime.scene.renderer === null` (no WebGL context)
 *  - `runtime.bus.registry` populated by whatever `bootstrapFn` registered
 *    plus the handlers `composeRuntime` owns
 *
 * Suitable for: CI pipelines, Node.js integrations, benches, IFC export
 * automation, headless test harnesses.
 *
 * NOTE ON THE ENVIRONMENT — `composeRuntime` reads `document` while
 * wiring DOM-adjacent slots even with `canvas: null`.  Under bare Node
 * you must provide a DOM shim (`happy-dom` / `jsdom`); this package's own
 * suite runs under happy-dom for that reason.  "Headless" here means
 * "no canvas, no WebGL", not "no globalThis.document".  Removing that
 * last dependency is a `runtime-composer` change, not a headless one.
 */
export async function headlessRuntime(
  options: HeadlessRuntimeOptions,
): Promise<PryzmRuntime> {
  if (typeof options?.bootstrapFn !== 'function') {
    throw new HeadlessBootstrapMissingError();
  }
  return composeRuntime({
    audit: options.audit,
    canvas: null,
    bootstrapFn: options.bootstrapFn,
  });
}

export type HeadlessRuntime = Awaited<ReturnType<typeof headlessRuntime>>;
