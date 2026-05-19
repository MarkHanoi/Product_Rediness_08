// @pryzm/renderer-three — WebGL context loss / restoration handlers.
//
// Contract C04 §1.4 (P2): packages/renderer-three/ is the sole owner of
// THREE. Context loss recovery must therefore also live here.
//
// Wave A14 (S118): A14-T6 — adds `setupContextLossHandlers` as the canonical
// helper for context-loss recovery. Consumers (e.g. initScene.ts, WorkspaceSurface
// mount path) call this once after the THREE.WebGLRenderer is created.
//
// Behaviour:
//   contextlost  — calls renderer.setAnimationLoop(null) to stop the rAF loop
//                  and emits a console.error so monitoring tooling can pick it up.
//   contextrestored — calls onRestore() so the consumer can rebuild render
//                     targets, shaders, and restart the loop.

import type { WebGLRenderer } from '@pryzm/renderer-three/three';

export interface ContextLossOptions {
  /** Called when the WebGL context is lost. Default: no-op. */
  onLost?: () => void;
  /** Called when the WebGL context is restored. REQUIRED: use this to rebuild
   *  render targets, re-compile shaders, and restart the animation loop. */
  onRestore?: () => void;
  /** Optional label printed in console messages for easier log correlation. */
  label?: string;
}

/**
 * Attaches `webglcontextlost` and `webglcontextrestored` event listeners to
 * the canvas owned by `renderer`.
 *
 * Call once, immediately after creating the `THREE.WebGLRenderer`.
 *
 * Returns a cleanup function that removes both listeners — call it from
 * `dispose()` to prevent listener leaks.
 *
 * @example
 * ```ts
 * import { setupContextLossHandlers } from '@pryzm/renderer-three';
 *
 * const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
 * const cleanup  = setupContextLossHandlers(renderer, {
 *   label:     'scene-renderer',
 *   onLost:    () => frameScheduler.pause(),
 *   onRestore: () => { rebuildTargets(); frameScheduler.resume(); },
 * });
 *
 * // Later, in dispose():
 * cleanup();
 * renderer.dispose();
 * ```
 */
export function setupContextLossHandlers(
  renderer: WebGLRenderer,
  options: ContextLossOptions = {},
): () => void {
  const { onLost, onRestore, label = 'renderer' } = options;
  const canvas = renderer.domElement;

  const handleLost = (event: Event) => {
    event.preventDefault();
    console.error(
      `[renderer-three/contextLoss] WebGL context lost on <${label}>. ` +
      'Animations paused. Awaiting context restoration.',
    );
    renderer.setAnimationLoop(null);
    onLost?.();
  };

  const handleRestored = () => {
    console.info(
      `[renderer-three/contextLoss] WebGL context restored on <${label}>. ` +
      'Triggering onRestore callback.',
    );
    onRestore?.();
  };

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}
