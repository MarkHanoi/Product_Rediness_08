/**
 * window-dev-augment.d.ts - Typed Window interface for dev/debug globals.
 *
 * Sprint F-2.5 (2026-05-15) - OI-024 resolution.
 *
 * Augments the global Window interface with the double-underscore-prefixed debug
 * properties and Pattern-E legacy globals that window-shim.ts writes.
 * Declaring them here removes all window-as-any casts from that file,
 * resolving OI-024.
 *
 * All properties are typed unknown - the purpose is to eliminate as-any
 * suppressions in production source, not to provide full type safety to
 * browser-console consumers.
 *
 * Picked up automatically by apps/editor/tsconfig.json (include: src/**-star).
 *
 * Contracts:
 *   §09-WAVE-5-CAST-DELETION Day 10 exit gate.
 *   OI-024 - CLOSED Sprint F-2.5 (2026-05-15).
 */

declare global {
  interface Window {
    // Pattern D: dev/debug singletons (DEV-only; exposeDevHelpers)

    /** Internal InstancedElementRenderer singleton (DEV inspect). */
    __instancedElementRenderer?: unknown;

    /** EdgeProjectorService singleton (DEV inspect). */
    __edgeProjectorService?: unknown;

    /** UnifiedFrameLoop singleton (DEV inspect). */
    __unifiedFrameLoop?: unknown;

    /** LevelClipPlaneCache singleton (DEV inspect). */
    __levelClipPlaneCache?: unknown;

    /** StairPlanSymbolRegistry singleton (DEV inspect). */
    __stairPlanSymbolRegistry?: unknown;

    /** ViewDependencyTracker singleton (DEV inspect). */
    __viewDependencyTracker?: unknown;

    /** FrustumCullingService singleton (DEV inspect). */
    __frustumCullingService?: unknown;

    /** Topology layer (wall connectivity graph) singleton (DEV inspect). */
    __topologyLayer?: unknown;

    /** View visibility map (per-view element visibility) (DEV inspect). */
    __viewVisibilityMap?: unknown;

    /** PRYZM WebGL renderer (DEV inspect). */
    __pryzmRenderer?: unknown;

    /** Rendering quality panel (DEV inspect). */
    __renderingQualityPanel?: unknown;

    // Pattern D: dev command constructors (DEV-only; exposeDevCommands)

    /** UpdateElementMarkCommand constructor for browser-console scripting. */
    UpdateElementMarkCommand?: unknown;

    /** CreatePlanViewCommand constructor for console/test automation. */
    CreatePlanViewCommand?: unknown;

    /** @thatopen/components OBC namespace for console inspection. */
    OBC?: unknown;

    // Pattern E: genuine browser/legacy-interop globals

    /**
     * Legacy project-export hook consumed by external tooling scripts.
     * Also declared in src/global-window.d.ts §8 (root scope). Re-declared
     * here so the apps/editor/ TypeScript scope resolves without a
     * cross-project triple-slash reference.
     */
    pryzmExport?: unknown;
  }
}

export {};
