// constraint.addPerpendicular — make two sketch lines perpendicular (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
  constraintStoreForArgs,
  type AddPerpendicularArgs,
  type ConstraintCommandContext,
} from './types.js';

export const ADD_PERPENDICULAR_VERB = 'constraint.addPerpendicular';

export function createAddPerpendicularHandler(
  ctx: ConstraintCommandContext,
): CommandHandler<AddPerpendicularArgs, string> {
  return {
    category: CONSTRAINT_COMMAND_CATEGORY,
    execute(args): CommandResult<string> {
      if (args.l1 === args.l2) {
        throw new Error('constraint.addPerpendicular: l1 and l2 must differ.');
      }
      // §CONSTRAINT-IS-VIEW-SCOPED — the store of THIS work plane, never an
      // ambient one. See `types.ts` for why that distinction is load-bearing.
      const store = constraintStoreForArgs(ctx, args, ADD_PERPENDICULAR_VERB);
      const id = store.newId('perpendicular');
      store.add({
        id,
        kind: 'perpendicular',
        l1: args.l1,
        l2: args.l2,
      });
      return {
        payload: id,
        undo: () => store.remove(id),
      };
    },
  };
}
