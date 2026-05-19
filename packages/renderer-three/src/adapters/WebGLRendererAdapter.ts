// @pryzm/renderer-three/adapters — WebGL 2 adapter.
//
// CONTRACT (C04 §1.3, §1.4):
//   Wraps a THREE.WebGLRenderer in the RendererHandle interface so the rest
//   of the codebase has zero THREE coupling.  Implements context-loss recovery
//   by delegating to `setupContextLossHandlers` from contextLossHandlers.ts.
//
// Wave A15 S121 (A15-T2): minimum safe implementation — no WebGPU dependency,
// no TSL pipeline concern.  Used as the last-resort fallback when
// WebGPURenderer fails to initialise (webgl-only path in createRenderer.ts).
//
// NOTE: This file IS inside packages/renderer-three/ and MAY import from
// 'three' directly.  Files outside this package may not.

import * as THREE from 'three';
import { setupContextLossHandlers } from '../contextLossHandlers.js';
import type { RendererHandle } from '../RendererHandle.js';

export interface WebGLRendererAdapterOptions {
  /** Forwarded to THREE.WebGLRenderer constructor. */
  antialias?: boolean;
  /** Forwarded to THREE.WebGLRenderer constructor. Enables screenshot capture. */
  preserveDrawingBuffer?: boolean;
  /** Power-preference hint forwarded to the context. */
  powerPreference?: 'default' | 'high-performance' | 'low-power';
  /** Max device-pixel-ratio cap. Defaults to 1.5 (Pascal pattern). */
  dprCap?: number;
}

const DEFAULT_DPR_CAP = 1.5;

/**
 * WebGLRendererAdapter
 *
 * Implements RendererHandle over a plain THREE.WebGLRenderer.
 *
 * Context-loss callbacks are wired via `setupContextLossHandlers` so all
 * context-loss logic stays inside packages/renderer-three/ (C04 §1.4).
 *
 * @example
 * ```ts
 * import { WebGLRendererAdapter } from '@pryzm/renderer-three';
 *
 * const handle = new WebGLRendererAdapter(canvas, { antialias: true });
 * const cleanup = handle.onContextLost(() => frameScheduler.pause());
 * handle.onContextRestored(() => { rebuildTargets(); frameScheduler.resume(); });
 *
 * // later:
 * cleanup();
 * handle.dispose();
 * ```
 */
export class WebGLRendererAdapter implements RendererHandle {
  readonly type = 'webgl2' as const;
  readonly domElement: HTMLCanvasElement;

  /**
   * @internal — transitional accessor for createRenderer.ts backward compatibility.
   *
   * Exposes the underlying THREE.WebGLRenderer so that initScene.ts can pass it
   * to RenderPipelineManager.bind() and store it on window.pryzmRenderer.
   *
   * Once initScene.ts migrates to a RendererHandle-first API (Wave 11+, Task 2.3
   * follow-on), this getter will be removed.  Do NOT use from plugin or ui code.
   */
  get threeRenderer(): THREE.WebGLRenderer {
    return this._renderer;
  }

  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _lostCallbacks  = new Set<() => void>();
  private readonly _restoredCallbacks = new Set<() => void>();
  private readonly _removeContextHandlers: () => void;

  constructor(canvas: HTMLCanvasElement, options: WebGLRendererAdapterOptions = {}) {
    const {
      antialias            = true,
      preserveDrawingBuffer = true,
      powerPreference      = 'high-performance',
      dprCap               = DEFAULT_DPR_CAP,
    } = options;

    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias,
      alpha:                 true,
      preserveDrawingBuffer,
      powerPreference,
      // C12 §2 — logarithmic depth buffer is required when any loaded model
      // spans more than 500 m in any axis (rail corridors, road alignments,
      // campus-scale geospatial models).  C12 §2 permits unconditional
      // activation; the GPU cost (minor) is acceptable for BIM use-cases.
      // Tracked in Phase 0 Task 0.2 acceptance criteria.
      logarithmicDepthBuffer: true,
    });

    // Apply BIM defaults.
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFShadowMap;
    this._renderer.outputColorSpace  = THREE.SRGBColorSpace;
    this._renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 0.9;

    this.domElement = canvas;

    // Wire context-loss recovery — all context event logic lives here (C04 §1.4).
    this._removeContextHandlers = setupContextLossHandlers(this._renderer, {
      label:     'WebGLRendererAdapter',
      onLost:    () => this._lostCallbacks.forEach(cb => cb()),
      onRestore: () => this._restoredCallbacks.forEach(cb => cb()),
    });
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._renderer.render(scene, camera);
  }

  setSize(width: number, height: number, updateStyle = true): void {
    this._renderer.setSize(width, height, updateStyle);
  }

  setPixelRatio(ratio: number): void {
    this._renderer.setPixelRatio(ratio);
  }

  getSize(target: THREE.Vector2): THREE.Vector2 {
    return this._renderer.getSize(target);
  }

  setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this._renderer.setRenderTarget(target);
  }

  getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this._renderer.getRenderTarget();
  }

  /**
   * Reads RGBA8 pixel data from `target` into `buffer`.
   * Used by GPUPicker for O(1) ID-buffer readback (C04 §3).
   */
  readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void {
    this._renderer.readRenderTargetPixels(target, x, y, width, height, buffer);
  }

  /**
   * Subscribe to WebGL context loss.  Returns an unsubscribe function.
   * The adapter automatically pauses the THREE animation loop on loss (C04 §1.4).
   */
  onContextLost(cb: () => void): () => void {
    this._lostCallbacks.add(cb);
    return () => { this._lostCallbacks.delete(cb); };
  }

  /**
   * Subscribe to WebGL context restoration.  Returns an unsubscribe function.
   */
  onContextRestored(cb: () => void): () => void {
    this._restoredCallbacks.add(cb);
    return () => { this._restoredCallbacks.delete(cb); };
  }

  /** Release all GPU resources and context-loss listeners. */
  dispose(): void {
    this._removeContextHandlers();
    this._lostCallbacks.clear();
    this._restoredCallbacks.clear();
    this._renderer.dispose();
  }
}
