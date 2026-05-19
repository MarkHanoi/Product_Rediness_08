/**
 * @pryzm/headless — headlessRuntime() factory.
 *
 * Phase F boolean #8 prerequisite (2026-05-02).
 *
 * Headless mode is natively supported by @pryzm/runtime-composer:
 * `composeRuntime({ canvas: null })` returns a fully functional
 * PryzmRuntime where `runtime.scene.renderer === null` and no browser
 * APIs (WebGL, DOM, canvas) are accessed.  No NullRenderer shim is
 * needed — the runtime already handles the canvas-absent path cleanly
 * per 02-ARCHITECTURE.md §3 ("renderer is optional in headless mode").
 *
 * Corrected vs. 20-PHASE-F-PLAN.md §3.2:
 *  - Plan used `composeRuntime({ renderer: new HeadlessRenderer() })` —
 *    there is NO `renderer` param in ComposeRuntimeOptions; headless is
 *    achieved by omitting canvas (canvas?: HTMLCanvasElement | null).
 *  - Plan used `new NullSyncClient()` from @pryzm/sync-client — that
 *    class does not exist; syncClient is already optional in
 *    ComposeRuntimeOptions, so omitting it is the correct approach.
 */

import { composeRuntime } from '@pryzm/runtime-composer';
import type { PryzmRuntime, RuntimeAudit } from '@pryzm/runtime-composer';

export interface HeadlessRuntimeOptions {
  /**
   * Audit triple required by every composeRuntime() call.
   * In headless / CI contexts use synthetic identifiers:
   *   audit: { actorId: 'headless', projectId: 'ci', clientId: 'node' }
   */
  readonly audit: RuntimeAudit;
}

/**
 * Compose a full PryzmRuntime in headless (no-browser) mode.
 *
 * The returned runtime has:
 *  - All data-half slots: commandBus, stores, plugins, persistence,
 *    sync, visibility, ai, audit, etc.
 *  - `runtime.scene.renderer === null` (no WebGL, no DOM)
 *  - `runtime.scene.canvas === null`
 *  - `runtime.sceneReady` resolves immediately (no renderer init)
 *
 * Suitable for: CI pipelines, Node.js integrations, NFT benches,
 * IFC export automation, headless test harnesses.
 */
export async function headlessRuntime(
  options: HeadlessRuntimeOptions,
): Promise<PryzmRuntime> {
  return composeRuntime({
    audit: options.audit,
    canvas: null,
  });
}

export type HeadlessRuntime = Awaited<ReturnType<typeof headlessRuntime>>;
