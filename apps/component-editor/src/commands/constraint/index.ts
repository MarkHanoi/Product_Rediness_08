// Constraint commands — registration barrel (S52 D2).
//
// Bind every constraint handler to a `CommandBus` instance with one
// call. Tests + AppShell both go through this entry point so the
// verb list is single-sourced.

import type { CommandBus } from '../../app/commandBus.js';
import {
  ADD_COINCIDENT_VERB,
  createAddCoincidentHandler,
} from './addCoincident.js';
import { ADD_DISTANCE_VERB, createAddDistanceHandler } from './addDistance.js';
import { ADD_FIXED_VERB, createAddFixedHandler } from './addFixed.js';
import { ADD_PARALLEL_VERB, createAddParallelHandler } from './addParallel.js';
import {
  ADD_PERPENDICULAR_VERB,
  createAddPerpendicularHandler,
} from './addPerpendicular.js';
import type { ConstraintCommandContext } from './types.js';

export {
  ADD_COINCIDENT_VERB,
  ADD_DISTANCE_VERB,
  ADD_FIXED_VERB,
  ADD_PARALLEL_VERB,
  ADD_PERPENDICULAR_VERB,
};

export type {
  AddCoincidentArgs,
  AddDistanceArgs,
  AddFixedArgs,
  AddParallelArgs,
  AddPerpendicularArgs,
  ConstraintCommandContext,
} from './types.js';

export const ALL_CONSTRAINT_VERBS: readonly string[] = Object.freeze([
  ADD_COINCIDENT_VERB,
  ADD_DISTANCE_VERB,
  ADD_FIXED_VERB,
  ADD_PARALLEL_VERB,
  ADD_PERPENDICULAR_VERB,
]);

export function registerConstraintCommands(
  bus: CommandBus,
  ctx: ConstraintCommandContext,
): void {
  bus.register({
    verb: ADD_COINCIDENT_VERB,
    handler: createAddCoincidentHandler(ctx),
  });
  bus.register({
    verb: ADD_DISTANCE_VERB,
    handler: createAddDistanceHandler(ctx),
  });
  bus.register({ verb: ADD_FIXED_VERB, handler: createAddFixedHandler(ctx) });
  bus.register({
    verb: ADD_PARALLEL_VERB,
    handler: createAddParallelHandler(ctx),
  });
  bus.register({
    verb: ADD_PERPENDICULAR_VERB,
    handler: createAddPerpendicularHandler(ctx),
  });
}
