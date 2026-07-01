// @pryzm/renderer-three — RendererHandleFactory (C04 §1.4).
//
// CONTRACT (C04 §1.4 — WebGL/WebGPU fallback chain):
//   packages/renderer-three/ MUST attempt WebGPU first, fall back to WebGL 2,
//   then plain WebGL.  It MUST log the selected backend at init time.
//   It MUST NOT throw on fallback — a headless/no-GPU environment returns the
//   WebGLRendererAdapter with a console warning (or throws only when truly no
//   GPU is available).
//
// Fallback chain:
//   1. WebGPURendererAdapter.create() → type='webgpu'  (native WebGPU backend)
//   2. WebGPURendererAdapter.create() → type='webgl2'  (WebGPURenderer WebGL2 fallback)
//   3. WebGLRendererAdapter           → type='webgl2'  (plain THREE.WebGLRenderer, last resort)
//
// Log format:  `[renderer-three] backend: webgpu|webgl2|webgl1`  (C04 §1.4)
//
// Task 2.3 (2026-05-09): introduces this class as the canonical boot-path
// factory so `createRenderer.ts` in src/ can delegate here instead of
// containing the WebGPU trial-init logic itself.
//
// NOTE: This file IS inside packages/renderer-three/ — importing from
// 'three' directly is intentional and P2-compliant.

import { WebGPURendererAdapter } from './adapters/WebGPURendererAdapter.js';
import { WebGLRendererAdapter }  from './adapters/WebGLRendererAdapter.js';
import type { RendererHandle }   from './RendererHandle.js';

/**
 * RendererHandleFactory
 *
 * Async factory that produces the best available `RendererHandle` for a canvas.
 * Implements the C04 §1.4 WebGPU → WebGL2 → plain-WebGL fallback chain and
 * logs the resolved backend per contract.
 *
 * @example
 * ```ts
 * import { RendererHandleFactory } from '@pryzm/renderer-three';
 *
 * const handle = await RendererHandleFactory.create(canvas);
 * console.log(handle.type); // 'webgpu' | 'webgl2'
 * handle.onContextLost(() => frameScheduler.pause());
 * handle.onContextRestored(() => { rebuildTargets(); frameScheduler.resume(); });
 * ```
 */
export class RendererHandleFactory {
  // Static-only utility class — no public constructor.
  private constructor() {}

  /**
   * §SHADOW-DEVICE-LOSS-FIX (Bug C) — return a canvas guaranteed to accept a
   * plain WebGL2 context.
   *
   * The browser forbids acquiring a WebGL2 context on a canvas that ALREADY holds
   * a context of a different type: once a WebGPU (or WebGPURenderer WebGL2) context
   * was created on `canvas`, `new THREE.WebGLRenderer({ canvas })` throws
   *   "A WebGL context could not be created. Reason: Canvas has an existing
   *    context of a different type"
   * — which killed the LAST fallback during WebGPU device-loss recovery and left
   * the viewer with NO renderer at all (total death / blank viewport).
   *
   * `maybeTainted` marks the canvas as possibly already holding a WebGPU/WebGL2
   * context (true on every fallback that follows a WebGPURenderer attempt). When
   * set, we mint a FRESH <canvas>, copy the tainted one's size / id / className /
   * inline style, splice it into the SAME parent in the SAME DOM position, and
   * remove the old one — so the plain WebGLRenderer gets a pristine canvas while
   * the viewport keeps the same on-screen element geometry and stacking.
   *
   * If the tainted canvas is not attached to the DOM (headless / offscreen) we
   * still return a detached fresh canvas sized to match, so construction succeeds.
   */
  private static _canvasForPlainWebGL(
    canvas: HTMLCanvasElement,
    maybeTainted: boolean,
  ): HTMLCanvasElement {
    if (!maybeTainted) return canvas;
    // No DOM (SSR / worker) — nothing to splice; hand back the original.
    if (typeof document === 'undefined') return canvas;

    let fresh: HTMLCanvasElement;
    try {
      fresh = document.createElement('canvas');
    } catch {
      return canvas; // document exists but createElement failed — best effort.
    }

    // Copy the pixel buffer size + presentation attributes so the swap is invisible.
    fresh.width     = canvas.width  || canvas.clientWidth  || 0;
    fresh.height    = canvas.height || canvas.clientHeight || 0;
    if (canvas.id)        fresh.id        = canvas.id;
    if (canvas.className) fresh.className = canvas.className;
    const styleText = canvas.getAttribute('style');
    if (styleText) fresh.setAttribute('style', styleText);

    // Splice the fresh canvas into the DOM in place of the tainted one.
    const parent = canvas.parentNode;
    if (parent) {
      try {
        parent.insertBefore(fresh, canvas);
        parent.removeChild(canvas);
        console.log(
          '[renderer-three] §SHADOW-DEVICE-LOSS-FIX replaced the WebGPU-tainted canvas with a ' +
          'fresh one so the plain-WebGL2 fallback can acquire a context (avoids "existing context of a different type").',
        );
      } catch (err) {
        console.warn(
          '[renderer-three] §SHADOW-DEVICE-LOSS-FIX canvas replace failed — using original canvas ' +
          '(WebGL2 context may fail if it is tainted):',
          err instanceof Error ? err.message : err,
        );
        return canvas;
      }
    }
    return fresh;
  }

  /**
   * Create the best available RendererHandle for `canvas`.
   *
   * Priority (C04 §1.4):
   *   1. WebGPURenderer with native WebGPU backend (navigator.gpu + adapter) → type='webgpu'
   *   2. WebGPURenderer with WebGL2 backend (TSL → GLSL transpilation)       → type='webgl2'
   *   3. Plain THREE.WebGLRenderer (last resort — no TSL pipeline)            → type='webgl2'
   *
   * Logs `[renderer-three] backend: webgpu|webgl2|webgl1` per C04 §1.4.
   *
   * @param forceWebGL  When true (user picked "WebGL" in the corner backend
   *   toggle, §PERF-WEBGPU-FRAGMENT / ADR-0076), skip the WebGPU adapter
   *   entirely and create the plain WebGLRendererAdapter directly. This is the
   *   user's stability escape hatch — a simple, very stable forward render with
   *   no TSL post-FX. 'auto' / 'webgpu' leave the normal chain unchanged.
   *
   * @throws {Error} only when truly no GPU is available (neither WebGPU nor WebGL2).
   *   In practice this only occurs in truly headless CI environments.
   */
  static async create(canvas: HTMLCanvasElement, forceWebGL = false): Promise<RendererHandle> {
    // ── User escape hatch: forced WebGL — resolve to WebGL2, NOT plain WebGL1 ──
    // §PERF-WEBGPU-FRAGMENT / ADR-0076 (founder blocker 2026-06-25):
    //   The old short-circuit returned the plain THREE.WebGLRenderer last-resort
    //   (labelled 'webgl-only'), whose tight limits exhaust on a heavy generated
    //   building → crash-guard. The modern, high-limit WebGL2 path is the
    //   WebGPURenderer with its WebGL2 backend (type='webgl2'). Resolution for the
    //   'webgl' preference is: WebGL2 (via WebGPURenderer forceWebGL) → plain
    //   THREE.WebGLRenderer ONLY if WebGL2 is genuinely unavailable.
    //   The render quality tier (Axis 1) keeps SSGI/TRAA OFF on heavy scenes, so
    //   this WebGL2 path stays light despite the WebGPURenderer/TSL plumbing.
    if (forceWebGL) {
      try {
        const webgl2 = await WebGPURendererAdapter.create(canvas, { forceWebGL2: true });
        if (webgl2 !== null) {
          console.log(`[renderer-three] backend: ${webgl2.type} (forced WebGL → WebGL2 backend)`);
          return webgl2;
        }
      } catch (err) {
        console.warn(
          '[renderer-three] forced-WebGL: WebGPURenderer(forceWebGL) threw — ' +
          'falling back to plain THREE.WebGLRenderer (WebGL2 context):',
          err instanceof Error ? err.message : err,
        );
      }
      // Genuine WebGL2-via-WebGPURenderer failure → plain WebGLRenderer.
      // Note: THREE.WebGLRenderer requests a WebGL2 context in r150+; this is a
      // WebGL2 context, just without the WebGPURenderer node-resource manager.
      // §SHADOW-DEVICE-LOSS-FIX (Bug C) — the WebGPURenderer(forceWebGL2) attempt
      // above may have TAINTED the canvas with a context; use a fresh canvas so the
      // plain WebGL2 context can be acquired.
      console.log('[renderer-three] backend: webgl1 (forced WebGL — plain THREE.WebGLRenderer fallback)');
      return new WebGLRendererAdapter(
        RendererHandleFactory._canvasForPlainWebGL(canvas, true),
        {
          antialias: true,
          preserveDrawingBuffer: true,
        },
      );
    }

    // ── 1 + 2. Try WebGPURenderer first ─────────────────────────────────
    // WebGPURenderer handles both WebGPU and WebGL2 backends internally.
    // Returns null only when WebGPURenderer itself fails (no WebGL2 at all).
    try {
      const webgpu = await WebGPURendererAdapter.create(canvas);
      if (webgpu !== null) {
        // type is 'webgpu' (native) or 'webgl2' (WebGPURenderer WebGL2 fallback)
        console.log(`[renderer-three] backend: ${webgpu.type}`);
        return webgpu;
      }
    } catch (err) {
      // Unexpected throw from WebGPURendererAdapter.create() itself.
      console.warn(
        '[renderer-three] RendererHandleFactory: WebGPURendererAdapter.create() ' +
        'threw unexpectedly — continuing to WebGLRendererAdapter fallback:',
        err instanceof Error ? err.message : err,
      );
    }

    // ── 3. Plain WebGLRenderer last resort ───────────────────────────────
    // Reached only when WebGPURenderer fails catastrophically (no WebGL2?).
    // TSL pipeline (RenderPipelineManager) is NOT available on this path.
    console.warn(
      '[renderer-three] RendererHandleFactory: WebGPURenderer unavailable. ' +
      'Falling back to plain THREE.WebGLRenderer (no TSL pipeline).',
    );
    try {
      // §SHADOW-DEVICE-LOSS-FIX (Bug C) — we reach here ONLY after a WebGPURenderer
      // attempt, so the canvas may already hold a WebGPU/WebGL2 context; acquiring a
      // plain WebGL2 context on it throws "Canvas has an existing context of a
      // different type". Use a fresh, untainted canvas so this last-resort ALWAYS
      // succeeds — the difference between a graceful WebGL2 viewport and a dead viewer.
      const webgl = new WebGLRendererAdapter(
        RendererHandleFactory._canvasForPlainWebGL(canvas, true),
        {
        // 3D-VIEW-AUDIT-2026 §F2.3 — antialias=true intentionally diverges
        // from the WebGPU path (which uses antialias:false because TRAA
        // replaces MSAA).  TRAA is unavailable on this fallback path, so
        // MSAA is the best available AA.
        antialias: true,
        // 3D-VIEW-AUDIT-2026 §F36 — preserveDrawingBuffer required on this
        // path because thumbnail capture uses canvas.toDataURL().
        // The WebGPU path uses an offscreen composite pass instead.
        preserveDrawingBuffer: true,
      });
      // This path has no TSL pipeline — log as 'webgl1' per C04 §1.4 spec
      // to distinguish it from the WebGPURenderer WebGL2 fallback (type 2).
      console.log('[renderer-three] backend: webgl1');
      return webgl;
    } catch (err) {
      throw new Error(
        '[renderer-three] RendererHandleFactory.create(): no GPU renderer ' +
        'available — neither WebGPU nor WebGL2 is supported by this environment. ' +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
