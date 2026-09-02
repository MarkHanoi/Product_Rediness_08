// SceneBootstrap — D.4.1 single composition root for scene-half wiring.
//
// Anchored to:
//   * `docs/archive/pryzm3-internal/02-ARCHITECTURE.md §3` (composition-root contract:
//     every bootstrap surface emits one OTel span, accepts an audit, returns
//     a typed slot + tearDown).
//   * `docs/archive/pryzm3-internal/01-VISION.md §2` P2 (single THREE owner — the lazy
//     loader injected here is the only path through which @pryzm/renderer's
//     internal THREE dependency reaches a canvas) and P8 (every architectural
//     boundary surfaces an OTel span — `pryzm.bootstrap.scene` is the one
//     for this boundary).
//   * `docs/archive/pryzm3-internal/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md §3`
//     STATUS-UPDATE Option A — "rebase §3 to match HEAD … D.4.1 work =
//     relocate the existing `src/engine/subsystems/initScene.ts` to
//     `packages/renderer/src/SceneBootstrap.ts` + add `pryzm.bootstrap.scene`
//     OTel span + add `bootstrapScene()` wrapper".
//
// Why this file is a wrapper today (not the relocated 2,117 LOC of initScene):
//   * The initScene F-1 extraction lives in app-level land
//     (`src/engine/subsystems/initScene.ts`) and pulls in @thatopen/components,
//     ProjectContext, BimManager, navigation controllers, plan-representation
//     listeners — all L7+ concerns that cannot move into L5 wholesale without
//     dragging app dependencies into the renderer package and inverting the
//     layer rule.
//   * D.4.1 establishes the SCENE-HALF ENTRY POINT in @pryzm/renderer: it
//     owns the typed input/output contract, the OTel span, and the soft-fail
//     semantics. Concrete code from initScene.ts moves in at the L7 surface
//     (apps/editor/src/bootstrap.render.everything.ts and successors), then
//     graduates into L4 plugin committers / L5 renderer passes over D.4.2-5
//     and Wave 4.
//   * The CALLER (composeRuntime.ts) injects `loadRenderEverything` via lazy
//     `import()` so this L5 file never takes a static dependency on
//     @pryzm/editor (which would be a layer inversion).
//
// Span shape:
//   `pryzm.bootstrap.scene` records:
//     * `pryzm.bootstrap.scene.mode` — 'auto' | 'webgpu' | 'webgl2'
//     * `pryzm.bootstrap.scene.has_canvas` — true (idle path skips the span)
//     * `pryzm.bootstrap.scene.outcome` — 'ok' | 'soft-fail'
//   On soft-fail the span still ends with status OK (the slot exposes the
//   captured error via `rendererError`); only an unrecoverable throw inside
//   the loader / wrapper records an exception.

import { withSpan } from './otel.js';
import type { Renderer } from './Renderer.js';
import type { MaterialPool, CommitterHost } from '@pryzm/scene-committer';
import type { FrameScheduler } from '@pryzm/frame-scheduler';

/** The audit triple every composition-root surface accepts.  Mirrors
 *  `RuntimeAudit` from `@pryzm/runtime-composer` without taking a static
 *  dependency on it (L5 must not depend on L2). */
export interface SceneBootstrapAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Input the caller hands to `bootstrapScene()`. */
export interface SceneBootstrapInput {
  readonly audit: SceneBootstrapAudit;
  readonly canvas: HTMLCanvasElement;
  readonly mode?: 'auto' | 'webgpu' | 'webgl2';
  /** The CommitterHost the data half already produced.  This object is
   *  shared with the returned `SceneSlotShape.host` so writers reach the
   *  same instance whether they go through the scene slot or the inner
   *  runtime.
   *
   *  D.5.A.10 (2026-04-30 evening): tightened from `unknown` to
   *  `CommitterHost` — the L5/L4 producer at `apps/editor/src/bootstrap.ts`
   *  declares `EditorRuntime.host: CommitterHost` (line 70) and the
   *  composer at `composeRuntime.ts` lines 749/769 passes `inner.host`
   *  directly (no widening), so the contract was just lagging the
   *  implementation (same shape as the D.5.A.7 + D.5.A.9 fixes).
   *  `@pryzm/scene-committer` is already in this package's deps so the
   *  type import is dep-edge-free.  The CommitterHost is constructed
   *  synchronously by `bootstrap()` and is therefore non-null in every
   *  caller path (success / soft-fail / idle).  Anchor:
   *  `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2.5 SceneSlot follow-on #2`. */
  readonly committerHost: CommitterHost;
  /**
   * ⭐ §COMPONENT-RENDER-MOUNT-ADOPTS-INNER (lane 4E, audit §12 Phase 4E) — the
   * caller's ALREADY-CONSTRUCTED data runtime, forwarded to the render-everything
   * bootstrap so it attaches the render half to THAT runtime instead of building
   * a rival one.
   *
   * ⛔ `unknown` on purpose, and it is the same reason `loadRenderEverything` is
   * injected: the concrete type is `EverythingRuntime` from `@pryzm/editor`, an
   * L7 app package that this L5 file must not depend on. The producer and the
   * consumer are both in `apps/editor`, and they type-check each other at the
   * point where they meet; widening here buys the layer rule at the cost of one
   * un-typed hop, which is the trade this file already makes for the loader.
   *
   * ⚠ Optional. Omitted, the loader constructs its own data half exactly as
   *   before — this seam adds no behaviour of its own.
   */
  readonly innerRuntime?: unknown;
  /** Lazy loader for the render-everything bootstrap.  Injected so this
   *  file does not take a static dependency on @pryzm/editor; the caller
   *  uses dynamic `import()` to supply the function on first use. */
  readonly loadRenderEverything: () => Promise<RenderEverythingBootstrapFn>;
}

/** Shape of the function the caller is expected to load.
 *
 *  D.5.A.7 (2026-04-30 evening): `renderer` and `materialPool` tightened
 *  from `unknown` to `Renderer | null` / `MaterialPool | null` to match
 *  the producer-side reality (`apps/editor/src/bootstrap.render.everything.ts`
 *  already declares its return as `{ renderer: Renderer | null;
 *  scheduler: FrameScheduler; materialPool: MaterialPool; ... }` —
 *  this contract was just lagging the implementation).
 *
 *  D.5.A.9 (2026-04-30 evening): `scheduler` tightened from `unknown`
 *  to `FrameScheduler` (non-null — the L7 producer line 91 declares
 *  `readonly scheduler: FrameScheduler` and only returns when
 *  bootstrap succeeded; the soft-fail path is wrapped in the try/catch
 *  in `bootstrapScene()` body and supplies its own `scheduler: null`
 *  to the slot).
 *
 *  D.5.A.10 (2026-04-30 evening): the `RenderEverythingBootstrapFn`
 *  return shape is unchanged here — the `CommitterHost` is supplied
 *  by the caller via `SceneBootstrapInput.committerHost`, NOT returned
 *  by this loader (the loader produces the renderer + scheduler +
 *  materialPool only; the host belongs to the data half and is
 *  threaded through unchanged).  See `SceneBootstrapInput.committerHost`
 *  above for the actual host tightening.  Anchor:
 *  `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2.5 SceneSlot follow-on #2`. */
export type RenderEverythingBootstrapFn = (opts: {
  audit: SceneBootstrapAudit;
  canvas: HTMLCanvasElement;
  mode?: 'auto' | 'webgpu' | 'webgl2';
  /** §COMPONENT-RENDER-MOUNT-ADOPTS-INNER — forwarded from
   *  `SceneBootstrapInput.innerRuntime`; see that field. */
  inner?: unknown;
}) => Promise<{
  renderer: Renderer | null;
  scheduler: FrameScheduler;
  materialPool: MaterialPool | null;
  /**
   * ⭐ §SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED (lane 4E) — the producer has
   * ALWAYS returned this field and this contract has never declared it, so the
   * success branch below could not read it and hardcoded `rendererError: null`.
   *
   * Consequence, executed and confirmed in both happy-dom and headless Chromium
   * on 2026-09-02: when `Renderer.init()` failed, `bootstrapRenderEverything`
   * caught it into its own `rendererError`, returned normally, and the slot the
   * caller received read `renderer === null` AND `rendererError === null` —
   * byte-identical to the IDLE (no-canvas) state. `composeRuntime`'s `runScene`
   * then took neither branch: no `scene.ready` event, and not even the
   * `console.error` it has for exactly this case. A GPU failure and "no canvas
   * was ever supplied" were the same value, which is the
   * [[context-data-honesty-family]] defect at the rendering boundary.
   */
  rendererError?: Error | null;
  tearDown?: () => void;
}>;

/** The slot fields `bootstrapScene()` produces.  Mirrors the
 *  `SceneSlot` interface from `@pryzm/runtime-composer` exactly so the
 *  caller can assign the result directly into its slot field with no
 *  runtime adapter.
 *
 *  Wave 4 Track A.7 (D.5.A.7, 2026-04-30 evening): `renderer` and
 *  `materialPool` tightened from `unknown | null` to `Renderer | null`
 *  and `MaterialPool | null` respectively.
 *
 *  Wave 4 Track A SceneSlot follow-on #1 (D.5.A.9, 2026-04-30 evening):
 *  `scheduler` tightened from `unknown | null` to `FrameScheduler | null`.
 *  The `null` half preserves the soft-fail + idle paths where the
 *  scheduler was never constructed (the `bootstrapSceneIdle()` path
 *  returns `scheduler: null` synchronously, and the `bootstrapScene()`
 *  catch block returns `scheduler: null` on init error).
 *
 *  Wave 4 Track A SceneSlot follow-on #2 (D.5.A.10, 2026-04-30 evening):
 *  `host` tightened from `unknown` to `CommitterHost` (non-null — the
 *  CommitterHost is constructed synchronously by the data half's
 *  `bootstrap()` at `apps/editor/src/bootstrap.ts:106` and threaded
 *  through every code path here unchanged: the success branch at
 *  `bootstrapScene()` line 172, the soft-fail branch at line 192, and
 *  `bootstrapSceneIdle()` line 214 all assign `host: input.committerHost`
 *  / `host: committerHost` directly).  This closes the third (and
 *  final) nested `unknown` field on `SceneSlot`.
 *
 *  The mirror with `runtime-composer/types.ts#SceneSlot` is byte-for-byte
 *  preserved (both sides tightened in lockstep within the same slice).
 *  After this slice the `SceneSlotShape` interface is `unknown`-free
 *  end-to-end.  Anchor:
 *  `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2.5 SceneSlot follow-on #2`. */
export interface SceneSlotShape {
  readonly renderer: Renderer | null;
  readonly scheduler: FrameScheduler | null;
  readonly host: CommitterHost;
  readonly materialPool: MaterialPool | null;
  readonly rendererError: Error | null;
}

export interface SceneBootstrapResult {
  readonly scene: SceneSlotShape;
  /** Disposes the renderer + scheduler + camera + scene-reconciler in
   *  reverse construction order.  Always callable, even on soft-fail
   *  (in which case it is a no-op). */
  readonly tearDown: () => void;
}

/** The async path: a canvas is available, the render half should boot.
 *  Soft-fails on any error — the returned slot has `renderer === null`
 *  and `rendererError !== null` so panels can detect "no GPU" without
 *  the whole runtime crashing.  Emits one `pryzm.bootstrap.scene` span. */
export async function bootstrapScene(
  input: SceneBootstrapInput,
): Promise<SceneBootstrapResult> {
  const mode = input.mode ?? 'webgl2';
  return withSpan(
    'pryzm.bootstrap.scene',
    {
      'pryzm.bootstrap.scene.mode': mode,
      'pryzm.bootstrap.scene.has_canvas': true,
    },
    async (span) => {
      try {
        const bootstrapRenderEverything = await input.loadRenderEverything();
        const result = await bootstrapRenderEverything({
          audit: input.audit,
          canvas: input.canvas,
          mode,
          inner: input.innerRuntime,
        });
        // §SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED — the producer's OWN soft-fail
        // is a soft-fail here too. It used to be reported as `outcome: 'ok'`
        // with `rendererError: null`, which is the one reading that cannot be
        // told apart from a healthy idle slot.
        const innerRendererError = result.rendererError ?? null;
        span.setAttribute(
          'pryzm.bootstrap.scene.outcome',
          innerRendererError === null ? 'ok' : 'soft-fail',
        );
        if (innerRendererError !== null) {
          span.setAttribute('pryzm.bootstrap.scene.error', innerRendererError.message);
        }
        return {
          scene: {
            renderer: result.renderer,
            scheduler: result.scheduler,
            host: input.committerHost,
            materialPool: result.materialPool,
            rendererError: innerRendererError,
          },
          tearDown:
            typeof result.tearDown === 'function'
              ? result.tearDown
              : NOOP_TEARDOWN,
        };
      } catch (err) {
        // Soft-fail: capture the error in the slot, end the span as OK
        // (the failure mode is data, not an exception the caller must
        // handle).  Panels read `rendererError` to detect "no GPU".
        const error = err instanceof Error ? err : new Error(String(err));
        span.setAttribute('pryzm.bootstrap.scene.outcome', 'soft-fail');
        span.setAttribute('pryzm.bootstrap.scene.error', error.message);
        return {
          scene: {
            renderer: null,
            scheduler: null,
            host: input.committerHost,
            materialPool: null,
            rendererError: error,
          },
          tearDown: NOOP_TEARDOWN,
        };
      }
    },
  );
}

/** The synchronous "idle" path: no canvas was supplied (tests, the
 *  white landing/hub before a project opens).  Produces the same
 *  null-renderer slot the async path produces on soft-fail, but
 *  without a span (there is no boundary crossing to trace). */
export function bootstrapSceneIdle(
  committerHost: CommitterHost,
): SceneBootstrapResult {
  return {
    scene: {
      renderer: null,
      scheduler: null,
      host: committerHost,
      materialPool: null,
      rendererError: null,
    },
    tearDown: NOOP_TEARDOWN,
  };
}

const NOOP_TEARDOWN = (): void => {
  /* idle / soft-fail tearDown is a no-op */
};
