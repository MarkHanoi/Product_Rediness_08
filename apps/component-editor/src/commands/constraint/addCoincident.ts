// constraint.addCoincident — pin two sketch points to share a position (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
  constraintStoreForArgs,
  type AddCoincidentArgs,
  type ConstraintCommandContext,
} from './types.js';

export const ADD_COINCIDENT_VERB = 'constraint.addCoincident';

export function createAddCoincidentHandler(
  ctx: ConstraintCommandContext,
): CommandHandler<AddCoincidentArgs, string> {
  return {
    category: CONSTRAINT_COMMAND_CATEGORY,
    execute(args): CommandResult<string> {
      if (args.p1 === args.p2) {
        throw new Error('constraint.addCoincident: p1 and p2 must differ.');
      }
      // §CONSTRAINT-IS-VIEW-SCOPED — the store of THIS work plane, never an
      // ambient one. See `types.ts` for why that distinction is load-bearing.
      const store = constraintStoreForArgs(ctx, args, ADD_COINCIDENT_VERB);
      const id = store.newId('coincident-pp');
      store.add({
        id,
        kind: 'coincident-pp',
        p1: args.p1,
        p2: args.p2,
      });
      return {
        payload: id,
        undo: () => store.remove(id),
      };
    },
  };
}
