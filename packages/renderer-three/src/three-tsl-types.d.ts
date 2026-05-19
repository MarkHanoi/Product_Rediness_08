/**
 * @file src/rendering/three-tsl-types.d.ts
 *
 * Ambient type declarations for `three/tsl` — Three.js Shading Language
 * node graph API (r175).  No official .d.ts ships with the build yet.
 *
 * CONTRACT (01-WEBGPU-RENDERING-MIGRATION §Phase-2, 3, 4):
 *  - Covers only the TSL symbols used by the PRYZM pipeline files.
 *  - Update when official types ship.
 *
 * r175 availability notes:
 *  - `sample()` does NOT exist in r175 (introduced in r183+). Removed.
 *  - `ssgi()` / SSGINode does NOT exist in r175 (introduced in r183+).
 *    The r175 equivalent is `ao()` from GTAONode.js. See SSGIPass.ts.
 *  - `traa()` (colour-filter variant) does NOT exist in r175.
 *    The r175 variant is `traaPass(scene, camera)` from TRAAPassNode.js.
 */

declare module 'three/tsl' {
    import type { Camera, Color, Layers, Scene, Texture } from '@pryzm/renderer-three/three';

    // ── Generic node type ──────────────────────────────────────────────────

    export interface TSLNode {
        readonly isNode: true;

        // Arithmetic
        mul(other: TSLNode | number): TSLNode;
        add(other: TSLNode | number): TSLNode;
        sub(other: TSLNode | number): TSLNode;
        div(other: TSLNode | number): TSLNode;

        // Comparison / blend
        max(other: TSLNode | number): TSLNode;
        min(other: TSLNode | number): TSLNode;
        greaterThan(other: TSLNode | number): TSLNode;
        select(trueNode: TSLNode, falseNode: TSLNode): TSLNode;

        // Swizzle components
        readonly rgb: TSLNode;
        readonly rgba: TSLNode;
        readonly r: TSLNode;
        readonly g: TSLNode;
        readonly b: TSLNode;
        readonly a: TSLNode;
        readonly x: TSLNode;
        readonly y: TSLNode;
        readonly z: TSLNode;
        readonly w: TSLNode;

        // Sampling — only available on PassTextureNode / TextureNode instances
        sample(uv: TSLNode): TSLNode;
    }

    /** A uniform node wrapping a mutable value. */
    export interface UniformNode<T> extends TSLNode {
        value: T;
    }

    // ── MRT configuration ─────────────────────────────────────────────────

    export interface MRTNodeConfig {
        output?: TSLNode;
        diffuseColor?: TSLNode;
        normal?: TSLNode;
        velocity?: TSLNode;
        [attachment: string]: TSLNode | undefined;
    }

    export type MRTNode = MRTNodeConfig & { readonly isMRTNode: true };

    // ── PassNode ──────────────────────────────────────────────────────────

    export interface PassNode extends TSLNode {
        setMRT(config: MRTNode): void;
        setLayers(layers: Layers): void;
        getTexture(name: string): Texture;
        getTextureNode(name: string): TSLNode;
        enabled: boolean;
    }

    // ── Built-in TSL nodes (inputs) ────────────────────────────────────────

    export const output: TSLNode;
    export const diffuseColor: TSLNode;
    export const normalView: TSLNode;
    export const velocity: TSLNode;
    export const time: TSLNode;

    // ── TSL functions ─────────────────────────────────────────────────────

    export function pass(scene: Scene, camera: Camera): PassNode;
    export function mrt(config: MRTNodeConfig): MRTNode;

    /** Encode a view-space direction as an RGB colour (range [0, 1]). */
    export function directionToColor(node: TSLNode): TSLNode;

    /** Decode an RGB colour back to a view-space direction. */
    export function colorToDirection(node: TSLNode): TSLNode;

    export function vec4(
        r: TSLNode | number,
        g?: TSLNode | number,
        b?: TSLNode | number,
        a?: TSLNode | number,
    ): TSLNode;

    export function vec3(
        x: TSLNode | number,
        y?: TSLNode | number,
        z?: TSLNode | number,
    ): TSLNode;

    export function float(value: TSLNode | number): TSLNode;

    /** Component-wise addition. */
    export function add(a: TSLNode | number, b: TSLNode | number): TSLNode;

    /** Linear interpolation: mix(a, b, t) = a + (b - a) * t. */
    export function mix(
        a: TSLNode | number,
        b: TSLNode | number,
        t: TSLNode | number,
    ): TSLNode;

    export function uniform(
        value: Color | number | { x: number; y: number; z?: number; w?: number },
    ): UniformNode<typeof value>;

    /** Sine oscillator node (output range [0, 1]). */
    export function oscSine(node: TSLNode): TSLNode;

    /** Wraps output through tone-mapping and colour-space conversion. */
    export function renderOutput(node: TSLNode): TSLNode;
}

// ── Three.js addon module declarations ────────────────────────────────────
// Loaded via dynamic import by pipeline pass factories.
// Three.js r175 ships no .d.ts for these paths.

declare module 'three/examples/jsm/tsl/display/GTAONode.js' {
    /**
     * GTAONode factory (r175 equivalent of spec's `ssgi()`).
     * Output: vec4(vec3(ao_scalar), 1.0) — AO in RGB (.r/.g/.b all equal).
     *
     * @param depthNode  — Depth texture node from MRT ScenePass.
     * @param normalNode — Raw view-space normal node (NOT color-encoded).
     * @param camera     — The rendering camera.
     */
    export function ao(depthNode: unknown, normalNode: unknown, camera: unknown): {
        radius:           { value: number };
        thickness:        { value: number };
        distanceExponent: { value: number };
        getTextureNode(): unknown;
    };
    export default class GTAONode {}
}

declare module 'three/examples/jsm/tsl/display/DenoiseNode.js' {
    /**
     * DenoiseNode factory (r175).
     * Calls convertToTexture(node) internally — accepts any TSL node as input.
     * Output: denoised colour in RGB (.r contains the denoised AO scalar).
     *
     * @param node       — AO texture/node to denoise.
     * @param depthNode  — Depth texture node.
     * @param normalNode — Normal texture node (same as passed to GTAONode).
     * @param camera     — The rendering camera.
     */
    export function denoise(node: unknown, depthNode: unknown, normalNode: unknown, camera: unknown): {
        index:  { value: number };
        radius: { value: number };
        r: unknown;
        g: unknown;
        b: unknown;
        a: unknown;
    };
    export default class DenoiseNode {}
}

declare module 'three/examples/jsm/tsl/display/TRAAPassNode.js' {
    /**
     * TRAA pass factory (r175).
     * Returns a TRAAPassNode that renders the scene with temporal anti-aliasing.
     * NOTE: In r175, this is a scene-level render pass (not a colour filter).
     * The r183 colour-filter API `traa(colorNode, ...)` does NOT exist in r175.
     */
    export function traaPass(scene: unknown, camera: unknown): unknown;
    export default class TRAAPassNode {}
}

declare module 'three/examples/jsm/tsl/display/OutlineNode.js' {
    export function outline(
        scene: unknown,
        camera: unknown,
        options?: {
            selectedObjects?: unknown[];
            edgeGlow?:        unknown;
            edgeThickness?:   unknown;
        },
    ): {
        visibleEdge: unknown;
        hiddenEdge:  unknown;
    };
    export default class OutlineNode {}
}
