/**
 * @pryzm/headless — public barrel.
 *
 * Exports `headlessRuntime()` + `HeadlessRuntime` type.
 * Phase F boolean #8 prerequisite (2026-05-02).
 *
 * Phase F §3.2 publish sequence:
 *   pnpm version 1.0.0 --filter '@pryzm/headless'
 *   pnpm --filter '@pryzm/headless' publish --tag next --access public
 *   npm view @pryzm/headless@next version   # → 1.0.0
 */

export { headlessRuntime } from './headlessRuntime.js';
export type { HeadlessRuntime, HeadlessRuntimeOptions } from './headlessRuntime.js';
export { minimalHeadlessBootstrap } from './minimalHeadlessBootstrap.js';
export type { MinimalHeadlessBootstrapOptions } from './minimalHeadlessBootstrap.js';

/**
 * composeHeadlessRuntime — spec-aligned alias for headlessRuntime() (A20-T12).
 *
 * CONTRACT (C07 §1 — boolean #8):
 * `audit` is optional; if omitted a default CI identity is used.
 *
 * ⚠ CORRECTED 2026-08-11 — `bootstrapFn` is NOT optional.
 *
 * The Wave A20 docstring here used to advertise
 *   `const runtime = await composeHeadlessRuntime({});`
 *   `await runtime.ifc.importFile('./model.ifc');`
 * That example never ran: with no `bootstrapFn`, `composeRuntime` threw
 * before returning (see headlessRuntime.ts header).  An identity default
 * is safe — a synthetic actorId harms nobody.  A bootstrap default is
 * not: it would silently produce a runtime with an empty command
 * registry, so `runtime.ifc.importFile(...)` would find no element
 * handlers to dispatch into and import zero elements without erroring.
 * Emptiness and failure are not the same value; the caller must choose.
 *
 * Usage (server / CI):
 *   import { composeHeadlessRuntime } from '@pryzm/headless';
 *   import { bootstrapWithEverything } from '@pryzm/editor/bootstrap.everything';
 *   const runtime = await composeHeadlessRuntime({ bootstrapFn: bootstrapWithEverything });
 *   await runtime.ifc.importFile('./model.ifc');
 */
export async function composeHeadlessRuntime(
  opts: Partial<import('./headlessRuntime.js').HeadlessRuntimeOptions> &
    Pick<import('./headlessRuntime.js').HeadlessRuntimeOptions, 'bootstrapFn'>,
): Promise<import('@pryzm/runtime-composer').PryzmRuntime> {
  const { headlessRuntime: _headlessRuntime } = await import('./headlessRuntime.js');
  return _headlessRuntime({
    audit: opts.audit ?? {
      actorId: 'headless-ci',
      projectId: 'headless-default',
      clientId: `headless-${Date.now()}`,
    },
    bootstrapFn: opts.bootstrapFn,
  });
}
