/**
 * Ambient type declarations for modules that ship without bundled .d.ts files.
 *
 * Wave A15 S119 cleanup: all `declare module 'three/examples/jsm/...'` blocks
 * that previously lived here have been REMOVED.  Those addons are now proper
 * TypeScript re-exports in packages/renderer-three/src/addons/ — the three
 * package itself supplies their .d.ts types, so ambient declarations are
 * no longer needed or correct.
 *
 * Removed blocks (now real exports):
 *   three/examples/jsm/objects/Sky.js
 *   three/examples/jsm/postprocessing/EffectComposer.js
 *   three/examples/jsm/postprocessing/Pass.js
 *   three/examples/jsm/postprocessing/RenderPass.js
 *   three/examples/jsm/postprocessing/UnrealBloomPass.js
 *   three/examples/jsm/postprocessing/OutputPass.js
 *   three/examples/jsm/postprocessing/GTAOPass.js
 *
 * What remains: third-party packages with no bundled .d.ts and Vite
 * virtual modules used at build time.
 *
 * The three-gpu-pathtracer ambient declaration has been migrated to:
 *   packages/renderer-three/src/ambient-declarations.d.ts
 * If your tsconfig.json includes that file, this entry is redundant and
 * can be removed in a follow-up cleanup. Kept here for backwards compat
 * during the Wave A15 transition.
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

/**
 * Auto-discovered item catalog.
 * Emitted by vite-plugin-item-catalog (vite.config.ts) at build time by
 * scanning public/items/<Category>/<slug>/model.glb.
 * Consumers can import this instead of hard-coding paths in the registry.
 */
declare module 'virtual:item-catalog' {
    export interface CatalogItem {
        slug:          string;
        category:      string;
        glbPath:       string;
        thumbnailPath: string;
        label:         string;
    }
    const catalog: CatalogItem[];
    export default catalog;
}
