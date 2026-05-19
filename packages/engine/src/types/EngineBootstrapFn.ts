/**
 * EngineBootstrapFn — type signature of the BIM engine's main entry point.
 *
 * Sprint F-2.1 surface audit.  Sprint F-2.2 (2026-05-15): tightened
 * `runtime: unknown` → `runtime: PryzmRuntime | null`.
 *
 * Concrete implementation: apps/editor/src/engine/engineLauncher.ts → `bootstrap()`.
 * The canonical form that callers (e.g. `src/main.ts`, headless test harness)
 * import without depending on the implementation module.
 *
 * ## Consumer pattern
 * ```ts
 * import type { EngineBootstrapFn } from '@pryzm/engine';
 * import type { PryzmRuntime } from '@pryzm/runtime-composer';
 *
 * // Lazy import — keeps the engine out of the initial bundle.
 * const { bootstrap } = await import('@app/engine/engineLauncher');
 * const typedBootstrap: EngineBootstrapFn = bootstrap;
 * await typedBootstrap(runtime);
 * ```
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer';

export type EngineBootstrapFn = (
    /**
     * The composed `PryzmRuntime` handle.
     * Pass `null` for headless/test initialisations that do not use the runtime bus.
     */
    runtime: PryzmRuntime | null,
) => Promise<void>;
