// constraint.addDistance — fix the metric distance between two sketch points (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
  constraintStoreForArgs,
  type AddDistanceArgs,
  type ConstraintCommandContext,
} from './types.js';

export const ADD_DISTANCE_VERB = 'constraint.addDistance';

export function createAddDistanceHandler(
  ctx: ConstraintCommandContext,
): CommandHandler<AddDistanceArgs, string> {
  return {
    category: CONSTRAINT_COMMAND_CATEGORY,
    execute(args): CommandResult<string> {
      if (args.p1 === args.p2) {
        throw new Error('constraint.addDistance: p1 and p2 must differ.');
      }
      if (typeof args.value === 'number') {
        if (!Number.isFinite(args.value) || args.value < 0) {
          throw new Error(
            `constraint.addDistance: value must be a non-negative finite mm number (got ${args.value}).`,
          );
        }
      } else if (typeof args.value !== 'string' || args.value.length === 0) {
        throw new Error('constraint.addDistance: value must be a number or a non-empty parameter name.');
      }
      // §CONSTRAINT-IS-VIEW-SCOPED — the store of THIS work plane, never an
      // ambient one. See `types.ts` for why that distinction is load-bearing.
      const store = constraintStoreForArgs(ctx, args, ADD_DISTANCE_VERB);
      const id = store.newId('distance-pp');
      store.add({
        id,
        kind: 'distance-pp',
        p1: args.p1,
        p2: args.p2,
        value: args.value,
      });
      return {
        payload: id,
        undo: () => store.remove(id),
      };
    },
  };
}
