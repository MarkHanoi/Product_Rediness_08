/**
 * @pryzm/renderer-three — typed renderer accessors  (B3)
 *
 * Replaces the `(world.renderer as any).three as any` cast pattern used
 * throughout the codebase.  OBC's BaseRenderer does not expose `.three` in
 * its public type surface, but all concrete runtime implementations
 * (PostproductionRenderer, WebGLRenderer wrappers) do expose it.
 *
 * Contract C04 §1.1 — packages/renderer-three is the sole owner of any
 * THREE import.  All callers obtain the WebGLRenderer reference through
 * this accessor rather than casting independently.
 */

import type { WebGLRenderer } from '@pryzm/renderer-three/three';

/**
 * Minimal structural interface satisfied by any OBC renderer that wraps a
 * raw THREE.WebGLRenderer under a `.three` property.
 */
export interface ObcRendererLike {
    readonly three: WebGLRenderer;
}

/**
 * B3: Type-safe accessor for the underlying `THREE.WebGLRenderer` from an
 * OBC renderer component.
 *
 * Throws a descriptive error if the renderer does not expose a `.three`
 * property, which would indicate a renderer-type mismatch at boot time
 * (far easier to diagnose than a silent `undefined` crash downstream).
 *
 * Usage:
 * ```ts
 * import { getThreeRenderer } from '@pryzm/renderer-three';
 *
 * // BEFORE (implicit any everywhere):
 * const renderer = (this.world.renderer as any).three as any;
 *
 * // AFTER (single controlled cast, typed result):
 * const renderer = getThreeRenderer(this.world.renderer);
 * ```
 */
export function getThreeRenderer(renderer: unknown): WebGLRenderer {
    const candidate = renderer as Partial<ObcRendererLike> | null | undefined;
    if (!candidate?.three) {
        throw new Error(
            '[renderer-three/accessors] getThreeRenderer: ' +
            'renderer.three is unavailable — ensure the OBC renderer has been ' +
            'fully initialised before calling this accessor.',
        );
    }
    return candidate.three;
}
