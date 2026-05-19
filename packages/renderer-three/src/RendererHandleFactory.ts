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
   * Create the best available RendererHandle for `canvas`.
   *
   * Priority (C04 §1.4):
   *   1. WebGPURenderer with native WebGPU backend (navigator.gpu + adapter) → type='webgpu'
   *   2. WebGPURenderer with WebGL2 backend (TSL → GLSL transpilation)       → type='webgl2'
   *   3. Plain THREE.WebGLRenderer (last resort — no TSL pipeline)            → type='webgl2'
   *
   * Logs `[renderer-three] backend: webgpu|webgl2|webgl1` per C04 §1.4.
   *
   * @throws {Error} only when truly no GPU is available (neither WebGPU nor WebGL2).
   *   In practice this only occurs in truly headless CI environments.
   */
  static async create(canvas: HTMLCanvasElement): Promise<RendererHandle> {
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
      const webgl = new WebGLRendererAdapter(canvas, {
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
