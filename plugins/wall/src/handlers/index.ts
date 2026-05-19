// Wall handler registration helper (S07-T10 — bus wiring).
//
// `bootstrap.ts` (apps/editor) calls `registerWallHandlers(bus)` to
// wire the 5 simplest handlers in one go.  Returns the list of
// registered command-type strings so callers can introspect the
// registry from tests + dev tools.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateWallHandler } from './CreateWall.js';
import { DeleteWallHandler } from './DeleteWall.js';
import { MoveWallHandler } from './MoveWall.js';
import { SetWallDimensionsHandler } from './SetWallDimensions.js';
import { SetWallColorHandler } from './SetWallColor.js';
import { TransformWallHandler } from './TransformWall.js';
import { SetWallSystemTypeHandler } from './SetWallSystemType.js';
import { SetWallLayersHandler } from './SetWallLayers.js';
import { BulkSetWallVisualsHandler } from './BulkSetWallVisuals.js';
import { CreateWallOpeningHandler } from './CreateWallOpening.js';
import { WallOpeningLegacyAdapterHandler } from './CreateWallOpeningLegacyAdapter.js';
import { CreateWallBetweenMarksHandler } from './CreateWallBetweenMarks.js';
import { CreateWallsFromSlabHandler } from './CreateWallsFromSlab.js';
import { CreateWallBatchHandler } from './CreateWallBatch.js';
import { ChangeWallLevelHandler } from './ChangeWallLevel.js';
import { JoinWallHandler } from './JoinWall.js';
import { CutWallHandler } from './CutWall.js';
import { UpdateWallSystemTypeHandler } from './UpdateWallSystemType.js';
import { UpdateWallDimensionsHandler } from './UpdateWallDimensions.js';
import { UpdateWallBaselineHandler } from './UpdateWallBaseline.js';
import { CascadeWallBaselineHandler } from './CascadeWallBaseline.js';
import { CreateWallsOnAllSlabsHandler } from './CreateWallsOnAllSlabs.js';
import type { WallSystemTypeStore } from '../system-type-store.js';

/** Optional dependencies the wall plugin's handlers may consume.  S07
 *  used the catalogue only for `wall.create`'s `systemTypeId` check;
 *  S10 grows this surface — `SetWallSystemType` REQUIRES the catalogue
 *  (it materialises resolved `layers[]` into the store), and the new
 *  `CreateWallBetweenMarks` / `CreateWallsFromSlab` paths reuse the
 *  same optional validation as `CreateWall`. */
export interface WallHandlerDependencies {
  /** When set, `wall.create` / `wall.createBetweenMarks` /
   *  `wall.createFromSlab` validate `cmd.systemTypeId` against this
   *  catalogue and reject unknown ids at `canExecute` time.  REQUIRED
   *  when wiring `wall.setSystemType` — that handler is omitted from
   *  the handler set if no catalogue is supplied. */
  readonly systemTypeStore?: WallSystemTypeStore;
}

/** Every handler type owned by the wall plugin.  After S10 the set is
 *  the 14 PRYZM 2 wall handlers per ADR-008's post-merge headline:
 *    • 5 from S07 (create, delete, move, setDimensions, setColor)
 *    • 9 from S10 (transform, setSystemType, setLayers, bulkSetVisuals,
 *      createOpening, createBetweenMarks, createFromSlab, changeLevel,
 *      join, cut)
 *
 *  `wall.setSystemType` only appears when a `systemTypeStore` is wired
 *  (see {@link WALL_HANDLER_TYPES_WITH_CATALOGUE}). */
export const WALL_HANDLER_TYPES = [
  'wall.create',
  'wall.delete',
  'wall.move',
  'wall.setDimensions',
  'wall.setColor',
  'wall.transform',
  'wall.setLayers',
  'wall.bulkSetVisuals',
  'wall.createOpening',
  'wall.opening.create',
  'wall.createBetweenMarks',
  'wall.createFromSlab',
  'wall.batch.create',
  'wall.changeLevel',
  'wall.join',
  'wall.cut',
  'wall.updateSystemType',
  'wall.updateDimensions',
  'wall.updateBaseline',
  'wall.cascadeBaseline',
  'wall.create-on-all-slabs',
] as const;

/** With a catalogue wired, `wall.setSystemType` joins the set. */
export const WALL_HANDLER_TYPES_WITH_CATALOGUE = [
  ...WALL_HANDLER_TYPES,
  'wall.setSystemType',
] as const;

export type WallHandlerType =
  | (typeof WALL_HANDLER_TYPES)[number]
  | (typeof WALL_HANDLER_TYPES_WITH_CATALOGUE)[number];

/** Build the wall handler set without registering — used by
 *  `bootstrap.ts` when callers want to pass `handlers: [...]` to
 *  `bootstrap(opts)`.  Pass `{ systemTypeStore }` to enable
 *  `wall.create` / `wall.createBetweenMarks` / `wall.createFromSlab`
 *  catalogue validation AND to register `wall.setSystemType`. */
export function buildWallHandlerSet(
  deps: WallHandlerDependencies = {},
): readonly CommandHandler<unknown>[] {
  const set: CommandHandler<unknown>[] = [
    new CreateWallHandler(deps.systemTypeStore) as unknown as CommandHandler<unknown>,
    new DeleteWallHandler() as unknown as CommandHandler<unknown>,
    new MoveWallHandler() as unknown as CommandHandler<unknown>,
    new SetWallDimensionsHandler() as unknown as CommandHandler<unknown>,
    new SetWallColorHandler() as unknown as CommandHandler<unknown>,
    new TransformWallHandler() as unknown as CommandHandler<unknown>,
    new SetWallLayersHandler() as unknown as CommandHandler<unknown>,
    new BulkSetWallVisualsHandler() as unknown as CommandHandler<unknown>,
    new CreateWallOpeningHandler() as unknown as CommandHandler<unknown>,
    new WallOpeningLegacyAdapterHandler() as unknown as CommandHandler<unknown>,
    new CreateWallBetweenMarksHandler(deps.systemTypeStore) as unknown as CommandHandler<unknown>,
    new CreateWallsFromSlabHandler(deps.systemTypeStore) as unknown as CommandHandler<unknown>,
    new CreateWallBatchHandler(deps.systemTypeStore) as unknown as CommandHandler<unknown>,
    new ChangeWallLevelHandler() as unknown as CommandHandler<unknown>,
    new JoinWallHandler() as unknown as CommandHandler<unknown>,
    new CutWallHandler() as unknown as CommandHandler<unknown>,
  ];
  if (deps.systemTypeStore !== undefined) {
    set.push(
      new SetWallSystemTypeHandler(deps.systemTypeStore) as unknown as CommandHandler<unknown>,
    );
  }
  set.push(
    UpdateWallSystemTypeHandler as unknown as CommandHandler<unknown>,
    UpdateWallDimensionsHandler as unknown as CommandHandler<unknown>,
    UpdateWallBaselineHandler as unknown as CommandHandler<unknown>,
    CascadeWallBaselineHandler as unknown as CommandHandler<unknown>,
    new CreateWallsOnAllSlabsHandler() as unknown as CommandHandler<unknown>,
  );
  return set;
}

/** Register every wall handler against an existing bus.  Returns the
 *  list of registered command types so callers can sanity-check the
 *  registry post-call.  When a catalogue is wired the returned list
 *  includes `wall.setSystemType`. */
export function registerWallHandlers(
  bus: CommandBus,
  deps: WallHandlerDependencies = {},
): readonly string[] {
  for (const handler of buildWallHandlerSet(deps)) {
    bus.register(handler);
  }
  return deps.systemTypeStore !== undefined
    ? WALL_HANDLER_TYPES_WITH_CATALOGUE
    : WALL_HANDLER_TYPES;
}
