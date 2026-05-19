/**
 * @pryzm/renderer-three — ambient type declarations for packages that ship
 * without bundled .d.ts files.
 *
 * Wave A15 S119: migrated from src/three-addons.d.ts.
 * The Sky / EffectComposer / Pass / RenderPass / UnrealBloomPass / OutputPass /
 * GTAOPass module declarations that previously lived here have been replaced by
 * real re-export files in packages/renderer-three/src/addons/postprocessing/
 * and packages/renderer-three/src/addons/. Those are now real TypeScript
 * modules with proper type information from the three package itself.
 *
 * What remains here: third-party packages with no bundled .d.ts.
 */

/**
 * Ambient declaration for three-gpu-pathtracer.
 * The package ships CommonJS without bundled .d.ts files.
 * All exports are typed as `any` — strict usage is enforced at call sites
 * in PhotorealisticRenderer.ts and ViewportPathTracer.ts via JSDoc comments.
 */
declare module 'three-gpu-pathtracer' {
    const PathTracingSceneGenerator: any;
    const PathTracingRenderer: any;
    const PhysicalPathTracingMaterial: any;
    const WebGLPathTracer: any;
    const PhysicalCamera: any;
    export {
        PathTracingSceneGenerator,
        PathTracingRenderer,
        PhysicalPathTracingMaterial,
        WebGLPathTracer,
        PhysicalCamera,
    };
}
