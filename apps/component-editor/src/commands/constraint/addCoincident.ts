// constraint.addCoincident — pin two sketch points to share a position (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
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
      const id = ctx.constraintStore.newId('coincident-pp');
      ctx.constraintStore.add({
        id,
        kind: 'coincident-pp',
        p1: args.p1,
        p2: args.p2,
      });
      return {
        payload: id,
        undo: () => ctx.constraintStore.remove(id),
      };
    },
  };
}
