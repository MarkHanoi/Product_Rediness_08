/**
 * @file packages/renderer-three/src/three-webgpu-types.d.ts
 *
 * Ambient type declarations for `three/webgpu` — Three.js r183 ships minimal
 * .d.ts coverage for this entry-point.  Declarations mirror the public surface
 * used by the WebGPU rendering migration.
 *
 * Location (Task 2.3, 2026-05-09):
 *   Moved from `src/engine/subsystems/rendering/three-webgpu-types.d.ts`
 *   to this file (packages/renderer-three/src/).  Rationale: P2 requires that
 *   all THREE-related type declarations live in the sole THREE owner package
 *   (packages/renderer-three/).  WebGPURendererAdapter.ts (also in this pkg)
 *   is the sole caller of `import('three/webgpu')`, so the ambient declaration
 *   belongs here.  The root tsconfig (src/) no longer includes this file —
 *   callers in src/ that do `await import('three/webgpu') as any` do not need it.
 *
 * r183 API notes:
 *  - `isWebGPUAvailable` does NOT exist.  Use:
 *      renderer.isWebGPURenderer     → true on any WebGPURenderer instance
 *      renderer.backend.isWebGPUBackend → true on native WebGPU, absent on WebGL2
 *  - PostProcessing (r175) renamed to RenderPipeline in r183.
 *    PRYZM imports RenderPipeline from three/webgpu.
 *
 * NOTE: imports inside `declare module` use 'three' (not '@pryzm/renderer-three/three')
 * because this file IS inside packages/renderer-three/ — the sole THREE owner.
 */

declare module 'three/webgpu' {
    import * as THREE from 'three';

    // ── WebGPURenderer ──────────────────────────────────────────────────────

    export interface WebGPURendererParameters {
        canvas?: HTMLCanvasElement | OffscreenCanvas;
        antialias?: boolean;
        alpha?: boolean;
        depth?: boolean;
        stencil?: boolean;
        samples?: number;
        forceWebGL?: boolean;
        logarithmicDepthBuffer?: boolean;
        powerPreference?: 'default' | 'high-performance' | 'low-power';
    }

    /**
     * Three.js WebGPU/WebGL2 renderer (r183).
     * Automatically selects WebGPU if available; falls back to WebGL 2.
     *
     * CRITICAL: `await renderer.init()` must be called before any rendering.
     * Apply all settings before calling init().
     */
    export class WebGPURenderer extends THREE.WebGLRenderer {
        constructor(parameters?: WebGPURendererParameters);

        /**
         * Asynchronously initialises the GPU device.
         * MUST be awaited before render(), setAnimationLoop(), or RenderPipeline use.
         */
        init(): Promise<void>;

        /**
         * Always `true` on any WebGPURenderer instance (r183 API).
         * Use this to distinguish WebGPURenderer from plain THREE.WebGLRenderer.
         * Does NOT indicate which backend is in use — check `backend.isWebGPUBackend`
         * for native WebGPU vs WebGL2 fallback.
         */
        readonly isWebGPURenderer: true;

        /**
         * Internal backend — populated after `await init()`.
         * `isWebGPUBackend = true`  → native WebGPU backend acquired.
         * `isWebGPUBackend` absent  → WebGL2 fallback backend in use.
         * `device` is a direct GPUDevice reference (undefined on WebGL2).
         */
        readonly backend?: { isWebGPUBackend?: boolean; device?: GPUDevice };
    }

    // ── RenderPipeline (r183) ─────────────────────────────────────────────
    //
    // Three.js r175 name: PostProcessing
    // Three.js r183  name: RenderPipeline  ← used by PRYZM (r183.2)
    //
    // Usage:
    //   const rp = new RenderPipeline(renderer);
    //   rp.outputNode = vec4(scenePassColor.rgb, float(1));
    //   // in render loop:
    //   renderer.setClearAlpha(0);
    //   rp.render();

    export class RenderPipeline {
        constructor(renderer: THREE.WebGLRenderer, outputNode?: unknown);

        /** The final output node of the post-processing chain. */
        outputNode: unknown;

        /**
         * When `true` (default), applies tone mapping and colour-space conversion.
         * Set to `false` when effects run after tone mapping (e.g. FXAA, SMAA).
         */
        outputColorTransform: boolean;

        /** Renders one frame of post-processing. */
        render(): void;

        /** Releases GPU resources. */
        dispose(): void;
    }

    export class PostProcessing extends RenderPipeline {}

    // ── Re-export all of three ───────────────────────────────────────────────
    // Changed from '@pryzm/renderer-three/three' to 'three' since this file
    // IS inside packages/renderer-three/ (the sole THREE owner).
    export * from 'three';
}
