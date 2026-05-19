// constraint.addParallel — make two sketch lines parallel (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
  type AddParallelArgs,
  type ConstraintCommandContext,
} from './types.js';

export const ADD_PARALLEL_VERB = 'constraint.addParallel';

export function createAddParallelHandler(
  ctx: ConstraintCommandContext,
): CommandHandler<AddParallelArgs, string> {
  return {
    category: CONSTRAINT_COMMAND_CATEGORY,
    execute(args): CommandResult<string> {
      if (args.l1 === args.l2) {
        throw new Error('constraint.addParallel: l1 and l2 must differ.');
      }
      const id = ctx.constraintStore.newId('parallel');
      ctx.constraintStore.add({
        id,
        kind: 'parallel',
        l1: args.l1,
        l2: args.l2,
      });
      return {
        payload: id,
        undo: () => ctx.constraintStore.remove(id),
      };
    },
  };
}
