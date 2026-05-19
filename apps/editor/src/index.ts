// @pryzm/editor — public surface (L7).
//
// S05 ships the bootstrap data half — see `bootstrap.ts`.
// S06 adds the render half — see `bootstrap.render.ts`.
// S07 adds the wall-data convenience entry — see `bootstrap.data.ts`.
// S18 ships the canonical "every-plugin" bootstrap — see
//     `bootstrap.everything.ts`.  This is the only bootstrap callers
//     should reach for in 1A→1D.
//
// W-15 — `bootstrap.render.data.ts` was deleted at the Phase-1 audit
// close-out.  It was a wall-only render+data convenience that
// `bootstrap.everything.ts` superseded at S18.  Callers that need the
// render half compose `bootstrapWithEverything()` then `bootstrapRender()`
// themselves — see `apps/editor/__tests__/bootstrap-shape.test.ts` for
// the contract test that pins the surface to four bootstrap entries.

export { bootstrap, type BootstrapOptions, type EditorRuntime } from './bootstrap.js';
export {
  bootstrapRender,
  type RenderBootstrapOptions,
  type RenderRuntime,
} from './bootstrap.render.js';
export {
  bootstrapWithWalls,
  type WallsEditorRuntime,
  type PryzmDevHandle,
} from './bootstrap.data.js';
export {
  bootstrapWithEverything,
  type EverythingRuntime,
  type BootstrapEverythingOptions,
} from './bootstrap.everything.js';
export {
  ALL_PLUGINS,
  ELEMENT_PLUGIN_IDS,
  gatherAllContributions,
  wireAllPluginSubscriptions,
  type PluginDescriptor,
  type PluginDeps,
  type ElementPluginId,
} from './PluginRegistry.js';
export {
  ToolRegistry,
  type ToolEntry,
  type ToolFactory,
  type ToolHandle,
  type ToolMeta,
} from './toolbar/index.js';

// S28 — Pure URL router for the PRYZM 2 client.  Spec:
// `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S28 D4.
export {
  parseRoute,
  buildHubUrl,
  buildProjectUrl,
  PRYZM2_FLAG,
  PRYZM2_PROJECT_PARAM,
  type Pryzm2Route,
} from './router.js';

// D-finish.1 (S77-WIRE) — `mountEditor()` and its dedicated Vite
// build (`vite.pryzm2.config.ts`) were deleted at D-finish.1.  The
// active composition root for PRYZM 2 is `composeRuntime()` in
// `@pryzm/runtime-composer`, called directly from `src/main.ts`
// (the browser entry).  The dark per-project mount that mountEditor
// once owned was already an @deprecated shell with no production
// callers — its only invokers were the router test fixture (kept
// for `parseRoute`/`buildHubUrl`/`buildProjectUrl`) and a few
// historical doc references.
