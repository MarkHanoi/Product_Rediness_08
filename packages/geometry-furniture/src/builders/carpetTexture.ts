/**
 * @file packages/geometry-furniture/src/builders/carpetTexture.ts
 *
 * §CARPET97 (2026-08-25) — the ONE seam between the pure carpet pattern library
 * (`carpetPatterns.ts`) and THREE/DOM.
 *
 * Everything interesting about a carpet pattern is pure and lives next door.
 * This file does exactly three things:
 *   1. mint a canvas at the budgeted size,
 *   2. hand its 2D context to `drawCarpetPattern`,
 *   3. wrap the result as a `THREE.CanvasTexture`, configuring `repeat` /
 *      wrapping for the designs that tile.
 *
 * ⚠ `getContext('2d')` CAN RETURN NULL and that is not hypothetical: happy-dom —
 * the environment `packages/geometry-furniture/vitest.config.ts` runs every
 * suite in — returns null for it (measured, §CARPET97). The pre-existing three
 * carpet builders write `canvas.getContext('2d')!` and would throw a TypeError
 * on the very next line, which is why none of them has ever had a build() test.
 * Returning `null` here instead lets the caller fall back to a flat-colour
 * material, so the GEOMETRY is testable for real and a headless/SSR context
 * degrades instead of exploding.
 *
 * P2: THREE arrives through the `@pryzm/renderer-three/three` subpath, the same
 * legal route every builder in this package uses.
 */
import * as THREE from '@pryzm/renderer-three/three';
import {
    type CarpetPatternId,
    type CarpetTexturePlan,
    type Carpet2DContext,
    planCarpetTexture,
    drawCarpetPattern,
    CARPET_UNIFORM_AXIS_PX,
} from './carpetPatterns';

export interface CarpetTextureResult {
    readonly texture: THREE.CanvasTexture;
    readonly plan: CarpetTexturePlan;
}

/**
 * Build the pattern texture for one rug, or `null` when no 2D context exists.
 *
 * The returned texture is UNIQUE to this build and is the caller's to free —
 * hook it to the pattern material's `dispose` event, as every carpet builder in
 * this package does. There is deliberately NO cross-instance cache; see the
 * `carpetPatterns.ts` header for why sharing cannot be made safe here.
 */
export function createCarpetTexture(
    patternId: CarpetPatternId,
    widthM: number,
    lengthM: number,
): CarpetTextureResult | null {
    const plan = planCarpetTexture(patternId, widthM, lengthM);
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = plan.canvasW;
    canvas.height = plan.canvasH;

    // The real 2D context is checked against `Carpet2DContext` HERE — this
    // assignment is what guarantees a test double cannot declare capabilities
    // the browser does not actually provide.
    const ctx: Carpet2DContext | null = canvas.getContext('2d');
    if (!ctx) return null;

    drawCarpetPattern(patternId, ctx, plan);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    if (plan.tiled) {
        texture.wrapS = THREE.RepeatWrapping;
        // A design that is uniform along its length ships a 4 px strip; tiling
        // that axis would only alias it, so clamp instead.
        texture.wrapT = plan.canvasH > CARPET_UNIFORM_AXIS_PX
            ? THREE.RepeatWrapping
            : THREE.ClampToEdgeWrapping;
        texture.repeat.set(plan.repeatX, plan.repeatY);
    }
    texture.needsUpdate = true;
    return { texture, plan };
}
