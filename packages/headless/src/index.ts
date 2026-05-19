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

/**
 * composeHeadlessRuntime — spec-aligned alias for headlessRuntime() (A20-T12).
 *
 * CONTRACT (C07 §1 — boolean #8):
 * Accepts an optional `audit` field; if omitted, uses a default CI identity.
 * This overload matches the Wave A20 spec's `composeHeadlessRuntime({})` usage.
 *
 * Usage (server / CI):
 *   import { composeHeadlessRuntime } from '@pryzm/headless';
 *   const runtime = await composeHeadlessRuntime({});
 *   await runtime.ifc.importFile('./model.ifc');
 */
export async function composeHeadlessRuntime(
  opts: Partial<import('./headlessRuntime.js').HeadlessRuntimeOptions>,
): Promise<import('@pryzm/runtime-composer').PryzmRuntime> {
  const { headlessRuntime: _headlessRuntime } = await import('./headlessRuntime.js');
  return _headlessRuntime({
    audit: opts.audit ?? {
      actorId: 'headless-ci',
      projectId: 'headless-default',
      clientId: `headless-${Date.now()}`,
    },
  });
}
