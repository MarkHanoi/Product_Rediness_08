// @pryzm/plugin-wall — public surface (S07 deliverable).
//
// Mirrors the canonical PRYZM 1 wall family files under `src/elements/walls/`
// and `src/commands/walls/`, BUT the new files NEVER touch THREE — the
// pure-state half lives here, the THREE half lands in `committer.ts`
// (S09) and the producer math lands in `packages/geometry-kernel/` (S08).
//
// The companion `docs/04-reference/architecture-detail/element-recipe.md` (this sprint) walks
// any subsequent element family (door, window, slab, …) through the same
// scaffold this plugin establishes.

export { WallStore, type WallData, type WallId, type WallsState } from './store.js';
export {
  WallSystemTypeStore,
  type WallSystemType,
  type WallLayer,
  type WallLayerFunction,
  BUILTIN_WALL_TYPES,
} from './system-type-store.js';
export {
  WallSystemError,
  WallNotFoundError,
  WallSchemaError,
  WallDimensionsError,
  WallSystemTypeNotFoundError,
  isWallSystemError,
} from './errors.js';

export { CreateWallHandler, type CreateWallPayload } from './handlers/CreateWall.js';
export {
  CreateWallBatchHandler,
  type CreateWallBatchPayload,
} from './handlers/CreateWallBatch.js';
export { DeleteWallHandler, type DeleteWallPayload } from './handlers/DeleteWall.js';
export { MoveWallHandler, type MoveWallPayload } from './handlers/MoveWall.js';
export {
  SetWallDimensionsHandler,
  type SetWallDimensionsPayload,
} from './handlers/SetWallDimensions.js';
export { SetWallColorHandler, type SetWallColorPayload } from './handlers/SetWallColor.js';

export {
  WALL_HANDLER_TYPES,
  registerWallHandlers,
  buildWallHandlerSet,
  type WallHandlerDependencies,
  type WallHandlerType,
} from './handlers/index.js';

// Pure-TS intent / hit-test helpers (THREE-free).  Re-exported so
// downstream plugins (door, window) can `import { WallIntent } from
// '@pryzm/plugin-wall'` without reaching into a subpath.
export { WallIntent } from './intent.js';

// S09 — Tool surface (THREE-free; safe for any layer to import).
export {
  WallCreationTool,
  WALL_TOOL_ID,
  type WallCreationToolDeps,
  type WallToolState,
  type ScreenToWorld,
  type SnapCycle,
  type PreviewLine,
  type ToolPoint3D,
} from './tool.js';

// S09 — Committer surface re-exported from `./committer` subpath so
// callers can `import { WallCommitter } from '@pryzm/plugin-wall'`
// without poking at the THREE-touching internals directly.  Only
// `apps/editor/src/bootstrap.render.data.ts` is expected to instantiate
// these — every other consumer should treat them as opaque registrations.
export {
  WallCommitter,
  WallSelectionHighlightCommitter,
  type WallCommitterStats,
} from './committer/index.js';

// F-launch.1 (S81 F.1.01) — toolbar discipline contribution consumed by
// `apps/editor/src/PluginRegistry.ts` and surfaced through
// `runtime.plugins.contributions('toolbar.discipline')`.
export { wallToolbarContribution } from './contributions.js';
