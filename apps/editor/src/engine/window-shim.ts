/**
 * src/legacy/window-shim.ts — Wave 5 Day 10 / S82-WIRE
 *
 * The SINGLE allowlisted location for window-global assignments.
 *
 * Background
 * ──────────
 * Wave 5 (Cast Deletion Sweep) reduced window-global casts from 2,070 → ~167
 * across `src/`.  The residual falls into two categories:
 *
 *   Pattern D  Dev/debug globals — `__`-prefixed properties and constructor/
 *              library references exposed for browser-console inspection.
 *              Gated by `import.meta.env.DEV` so they vanish in production.
 *
 *   Pattern E  Genuine browser interop — legacy export hooks that external
 *              (non-Vite) scripts rely on, e.g. `window.pryzmExport`.
 *              These survive permanently and are declared in
 *              `src/global-window.d.ts §8` (root) and re-declared in
 *              `apps/editor/src/engine/window-dev-augment.d.ts` (editor scope).
 *
 * Usage
 * ─────
 * Call `exposeDevHelpers(refs)` from the engine bootstrap AFTER every
 * subsystem is initialised, gated by `import.meta.env.DEV`:
 *
 *   ```ts
 *   if (import.meta.env.DEV) {
 *     const { exposeDevHelpers } = await import('./legacy/window-shim');
 *     exposeDevHelpers({ instancedElementRenderer, edgeProjectorService, ... });
 *   }
 *   ```
 *
 * `bindLegacyBrowserGlobals(refs)` runs unconditionally for Pattern E
 * globals that external scripts depend on.
 *
 * Sprint F-2.5 (2026-05-15) — OI-024 CLOSED
 * ─────────────────────────────────────────
 * All 15 as-any casts replaced with typed `window.*` access via
 * `apps/editor/src/engine/window-dev-augment.d.ts`, which augments the global
 * `Window` interface with every property written here.
 * `eslint-disable pryzm/no-window-as-any` removed; the rule now fires on any
 * future re-introduction of casts in this file.
 *
 * Contracts
 * ─────────
 * §01-BIM-ENGINE-CORE-CONTRACT §9 — engine-layer only; no UI imports.
 * §09-WAVE-5-CAST-DELETION Day 10 exit gate.
 * OI-024 — CLOSED Sprint F-2.5 (2026-05-15).
 */

// ─── §1  Pattern D — dev/debug globals ───────────────────────────────────────

/**
 * Exposes internal engine singletons on `window` for browser-DevTools
 * inspection.  Only called in DEV mode — never shipped to production.
 *
 * Add new entries here instead of inline window.__X = ... writes
 * in the engine subsystems.
 */
export interface DevHelperRefs {
  /** `src/core/rendering/InstancedElementRenderer.ts` singleton. */
  instancedElementRenderer?: unknown;
  /** Edge-projector render service (scene pipeline). */
  edgeProjectorService?: unknown;
  /** Unified frame-loop scheduler. */
  unifiedFrameLoop?: unknown;
  /** Level clip-plane precompute cache. */
  levelClipPlaneCache?: unknown;
  /** Stair plan-symbol registry (floor-plan view). */
  stairPlanSymbolRegistry?: unknown;
  /** View-dependency tracker (view-graph). */
  viewDependencyTracker?: unknown;
  /** FrustumCullingService singleton. */
  frustumCullingService?: unknown;
  /** Topology layer (wall connectivity graph). */
  topologyLayer?: unknown;
  /** View visibility map (per-view element visibility). */
  viewVisibilityMap?: unknown;
  /** PRYZM WebGL renderer (dev inspect). */
  pryzmRenderer?: unknown;
  /** Rendering quality panel (dev inspect). */
  renderingQualityPanel?: unknown;
}

/**
 * Attach debug singletons to `window` for browser-console access.
 * Always call inside `if (import.meta.env.DEV)`.
 */
export function exposeDevHelpers(refs: DevHelperRefs): void {
  if (refs.instancedElementRenderer !== undefined) {
    window.__instancedElementRenderer = refs.instancedElementRenderer;
  }
  if (refs.edgeProjectorService !== undefined) {
    window.__edgeProjectorService = refs.edgeProjectorService;
  }
  if (refs.unifiedFrameLoop !== undefined) {
    window.__unifiedFrameLoop = refs.unifiedFrameLoop;
  }
  if (refs.levelClipPlaneCache !== undefined) {
    window.__levelClipPlaneCache = refs.levelClipPlaneCache;
  }
  if (refs.stairPlanSymbolRegistry !== undefined) {
    window.__stairPlanSymbolRegistry = refs.stairPlanSymbolRegistry;
  }
  if (refs.viewDependencyTracker !== undefined) {
    window.__viewDependencyTracker = refs.viewDependencyTracker;
  }
  if (refs.frustumCullingService !== undefined) {
    window.__frustumCullingService = refs.frustumCullingService;
  }
  if (refs.topologyLayer !== undefined) {
    window.__topologyLayer = refs.topologyLayer;
  }
  if (refs.viewVisibilityMap !== undefined) {
    window.__viewVisibilityMap = refs.viewVisibilityMap;
  }
  if (refs.pryzmRenderer !== undefined) {
    window.__pryzmRenderer = refs.pryzmRenderer;
  }
  if (refs.renderingQualityPanel !== undefined) {
    window.__renderingQualityPanel = refs.renderingQualityPanel;
  }
}

// ─── §2  Pattern D — dev command/constructor exposures ───────────────────────

/**
 * Exposes command constructors and library handles for browser-console
 * scripting and integration-test automation.  DEV-only.
 */
export interface DevCommandRefs {
  /** Allow `new window.UpdateElementMarkCommand(...)` from the console. */
  UpdateElementMarkCommand?: unknown;
  /** Allow `new window.CreatePlanViewCommand(...)` from console/tests. */
  CreatePlanViewCommand?: unknown;
  /** `@thatopen/components` OBC namespace for console inspection. */
  OBC?: unknown;
}

/**
 * Attach command constructors to `window` for browser console/test access.
 * Always call inside `if (import.meta.env.DEV)`.
 */
export function exposeDevCommands(refs: DevCommandRefs): void {
  if (refs.UpdateElementMarkCommand !== undefined) {
    window.UpdateElementMarkCommand = refs.UpdateElementMarkCommand;
  }
  if (refs.CreatePlanViewCommand !== undefined) {
    window.CreatePlanViewCommand = refs.CreatePlanViewCommand;
  }
  if (refs.OBC !== undefined) {
    window.OBC = refs.OBC;
  }
}

// ─── §3  Pattern E — genuine browser / legacy-interop globals ────────────────

/**
 * Refs for pattern-E globals that external (non-Vite) scripts depend on.
 * These survive permanently — they are NOT removed in Wave 7.
 */
export interface LegacyBrowserGlobalRefs {
  /**
   * Legacy project-export hook consumed by external tooling scripts.
   * Declared in `src/global-window.d.ts §8` and re-declared in
   * `apps/editor/src/engine/window-dev-augment.d.ts` for the editor scope.
   */
  pryzmExport?: unknown;
}

/**
 * Bind pattern-E globals that legacy scripts depend on.
 * Call unconditionally (runs in production too).
 */
export function bindLegacyBrowserGlobals(refs: LegacyBrowserGlobalRefs): void {
  if (refs.pryzmExport !== undefined) {
    window.pryzmExport = refs.pryzmExport;
  }
}
