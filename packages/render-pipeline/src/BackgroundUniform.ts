/**
 * @file packages/render-pipeline/src/BackgroundUniform.ts
 *
 * Phase 2/3 — Animated background colour uniform.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-3, Step 3.4):
 *  - Background colour animates smoothly on theme change (no snap).
 *  - The uniform value is a THREE.Color that lerps toward the target each frame.
 *  - `bgUniform` is injected into the TSL pipeline output node:
 *       finalOutput = vec4(mix(bgUniform, contentColor, hasGeometry), 1)
 *  - Dark/light colours match PRYZM's existing CSS variables.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - Pure projection-layer utility — no store mutations.
 *
 * Usage:
 *   const bg = createBackgroundUniform('dark');
 *   // In render loop:
 *   bg.tick(deltaSeconds);       // lerps current → target
 *   bg.setTheme('light');        // changes target for next tick
 *   // In pipeline:
 *   const finalOutput = vec4(mix(bg.node, contentNode, hasGeometry), float(1));
 *
 * Extracted from src/engine/subsystems/rendering/pipeline/ via strangler-fig (A16-T1).
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { UniformNode } from '@pryzm/renderer-three';

// ── Theme colours — exactly match the editor (post-processing.tsx lines 49–50) ──

/** Dark-theme background. Editor: `const DARK_BG = '#1f2433'` */
export const DARK_BG_HEX  = '#1f2433' as const;

/** Light-theme background. Editor: `const LIGHT_BG = '#ffffff'` */
export const LIGHT_BG_HEX = '#ffffff' as const;

export type BgTheme = 'dark' | 'light';

// ── Lerp speed ────────────────────────────────────────────────────────────

/**
 * Lerp factor applied per second:  speed × min(delta, 0.1).
 * At 60 fps the transition completes in ~250 ms.
 */
const LERP_SPEED = 4;

// ── BackgroundUniform ─────────────────────────────────────────────────────

export interface BackgroundUniform {
    /** The TSL uniform node to inject into the pipeline output. */
    readonly node: UniformNode<THREE.Color>;

    /**
     * Advance the lerp by `delta` seconds.
     * Call once per frame inside the render loop / useFrame equivalent.
     */
    tick(delta: number): void;

    /** Switch the target theme colour. The lerp will animate to it. */
    setTheme(theme: BgTheme): void;

    /** Immediately snap to the target (no animation). */
    snapToTheme(theme: BgTheme): void;

    /**
     * Animate to an arbitrary hex color string.
     * Use this when the user picks a custom color from a color picker.
     * The lerp will animate to it over ~250 ms (same as setTheme).
     */
    setColor(hex: string): void;

    /**
     * Immediately snap to an arbitrary hex color string without animation.
     */
    snapToColor(hex: string): void;
}

/**
 * Creates an animated background colour uniform.
 *
 * @param initialTheme — Starting theme; defaults to `'dark'`.
 */
export function createBackgroundUniform(initialTheme: BgTheme = 'dark'): BackgroundUniform {
    const tsl = (globalThis as any).__PRYZM_TSL__;

    if (!tsl) {
        throw new Error(
            '[BackgroundUniform] TSL module not loaded. Call initTSL() before createBackgroundUniform().',
        );
    }

    const { uniform } = tsl;

    const initialColor = new THREE.Color(
        initialTheme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX,
    );

    const current = initialColor.clone();
    const target  = initialColor.clone();

    // The TSL uniform wraps the THREE.Color; mutating `.value` updates all
    // pipeline nodes that reference `node` without recompiling the graph.
    const node: UniformNode<THREE.Color> = uniform(current);

    return {
        get node() { return node; },

        tick(delta: number): void {
            current.lerp(target, Math.min(delta, 0.1) * LERP_SPEED);
            node.value.copy(current);
        },

        setTheme(theme: BgTheme): void {
            target.set(theme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX);
        },

        snapToTheme(theme: BgTheme): void {
            const hex = theme === 'dark' ? DARK_BG_HEX : LIGHT_BG_HEX;
            current.set(hex);
            target.set(hex);
            node.value.copy(current);
        },

        setColor(hex: string): void {
            target.set(hex);
        },

        snapToColor(hex: string): void {
            current.set(hex);
            target.set(hex);
            node.value.copy(current);
        },
    };
}
