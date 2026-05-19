// @pryzm/renderer-three — RendererHandle interface.
//
// CONTRACT (C04 §1, §1.3 — P2 Single THREE Owner):
//   This interface is the P2 boundary.  All consumers MUST import from
//   '@pryzm/renderer-three', NEVER from 'three' directly.  Any file that
//   imports THREE outside this package is a P2 violation and WILL fail CI
//   (tools/ga-gate/check-three-imports.ts — HARD_FAIL=0).
//
// Wave A15 S121 (A15-T1): introduces the typed abstraction over
// THREE.WebGLRenderer / WebGPURenderer so the rest of the codebase can
// work with a RendererHandle rather than a concrete THREE class.
//
// NOTE: only files inside packages/renderer-three/ may `import from 'three'`.
// This file only uses type imports — no runtime THREE dependency is emitted.

import type * as THREE from 'three';

/**
 * RendererHandle — the single abstraction over THREE.WebGLRenderer / WebGPURenderer.
 *
 * CONTRACT (C04 §1):
 * - All consumers MUST import from '@pryzm/renderer-three', NEVER from 'three' directly.
 * - Callers receive a RendererHandle from createRenderer(); they MUST NOT reach
 *   into THREE objects directly beyond the surface exposed here.
 * - The type discriminant `type` allows safe narrowing where backend-specific
 *   behaviour is needed (e.g. TSL pipeline availability).
 */
export interface RendererHandle {
  /** The canvas element the renderer draws into. */
  readonly domElement: HTMLCanvasElement;

  /**
   * GPU backend in use.
   * - `'webgpu'`  — native WebGPU backend (Three.js WebGPURenderer + WebGPU adapter).
   * - `'webgl2'`  — WebGL 2 backend (WebGLRenderer or WebGPURenderer WebGL2 fallback).
   * - `'webgl1'`  — WebGL 1 last-resort fallback (no TSL pipeline).
   */
  readonly type: 'webgpu' | 'webgl2' | 'webgl1';

  /** Render scene from camera's point of view into the current render target. */
  render(scene: THREE.Scene, camera: THREE.Camera): void;

  /** Resize the renderer output. Mirrors THREE.WebGLRenderer.setSize(). */
  setSize(width: number, height: number, updateStyle?: boolean): void;

  /** Set device pixel ratio cap. */
  setPixelRatio(ratio: number): void;

  /** Read renderer output dimensions into `target`. */
  getSize(target: THREE.Vector2): THREE.Vector2;

  /**
   * Switch the active render target.
   * Pass `null` to render to the default framebuffer (the canvas).
   */
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;

  /** Return the currently active render target, or null for the canvas. */
  getRenderTarget(): THREE.WebGLRenderTarget | null;

  /**
   * Copy a rectangle of pixels from `target` into `buffer` (RGBA8).
   * Required by GPUPicker for O(1) ID-buffer readback (C04 §3).
   */
  readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): void;

  /**
   * Release all GPU resources.  Must be called before dropping the handle.
   * Subsequent calls to any other method are undefined behaviour.
   */
  dispose(): void;

  /**
   * Subscribe to WebGL context loss.
   * Returns an unsubscribe function — call it to remove the listener.
   *
   * CONTRACT (C04 §1.4): implementations MUST pause rendering on context loss.
   */
  onContextLost(cb: () => void): () => void;

  /**
   * Subscribe to WebGL context restoration.
   * Returns an unsubscribe function.
   *
   * CONTRACT (C04 §1.4): implementations MUST invoke callbacks so consumers
   * can rebuild render targets and resume rendering.
   */
  onContextRestored(cb: () => void): () => void;
}
