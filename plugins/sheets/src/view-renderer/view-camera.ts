// Per-viewport edit camera — the leaf of the view-renderer graph.
//
// ═══════════════════════════════════════════════════════════════════════════
// §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — WHY THIS FILE WAS SPLIT OUT
// ═══════════════════════════════════════════════════════════════════════════
// `view-source.ts` opens with this rule, in its own words:
//
//     "The `plugins/sheets` package MUST NOT import from `plugins/plan-view`,
//      `plugins/section-view`, `packages/renderer`, etc."
//
// It is broken one file away. `sheet-editor-host.ts:65` does
// `import { CanvasHost } from '@pryzm/plugin-plan-view'`, and `view-source.ts`
// imports a TYPE from `sheet-editor-host.js` — which is enough for TypeScript to
// load the module and, with it, the whole plan-view barrel.
//
// That was invisible for as long as nothing in the root `tsconfig.json` program
// imported `@pryzm/plugin-sheets` at all. The moment `apps/editor` wired
// `ViewportEditController` — its first construction site anywhere in the repo —
// `tsc --noEmit` walked the chain and surfaced nine errors in `plugins/plan-view`
// that had never been compiled, including four caused by an unrelated in-flight
// change to `CommandBus`. Wiring one 147-line controller made another package's
// typecheck the editor's problem.
//
// `ViewportEditController` needs exactly two things from `view-source.ts`:
// `EditCamera` and `IDENTITY_EDIT_CAMERA`. Neither has any dependency at all. So
// they live here, in a module that imports NOTHING, and `view-source.ts`
// re-exports them so no existing consumer changes. The controller is then
// reachable through a package subpath without dragging a renderer host, a canvas
// factory and a sibling plugin behind it.
//
// KEEP THIS FILE DEPENDENCY-FREE. Its whole value is that importing it costs
// nothing; one convenience import from a host or a schema gives the graph back.

/**
 * A no-argument teardown callback.
 *
 * Declared here rather than imported from `@pryzm/plugin-sdk`, which does not
 * export it — three files in this package imported `Disposer` from the SDK and
 * none of them had ever been type-checked. The nearest real SDK export is
 * `TickListenerDisposer`, a frame-bus concept and not this one; borrowing that
 * name would state something false. It is a one-line structural type, so there
 * is nothing gained by sharing it up the layer stack.
 */
export type Disposer = () => void;

/**
 * Per-viewport edit camera — the user's current "activate viewport" navigation
 * state. Identity when they are not navigating.
 */
export interface EditCamera {
  /**
   * World-space pan applied to the viewport's worldBounds centre. Units are the
   * source view's world units — DRAWING-SPACE METRES for the sheet editor's
   * composed SVG viewports.
   */
  readonly panWorldX: number;
  readonly panWorldY: number;
  /**
   * Multiplier on the worldBounds extents. `2` zooms IN by 2x (the visible world
   * rect halves); `0.5` zooms OUT by 2x. MUST be > 0.
   */
  readonly zoom: number;
}

export const IDENTITY_EDIT_CAMERA: EditCamera = Object.freeze({
  panWorldX: 0,
  panWorldY: 0,
  zoom: 1,
});
