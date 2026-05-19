// constraint.addFixed — pin a sketch point to absolute coordinates (S52 D2).

import type { CommandHandler, CommandResult } from '../../app/commandBus.js';
import {
  CONSTRAINT_COMMAND_CATEGORY,
  type AddFixedArgs,
  type ConstraintCommandContext,
} from './types.js';

export const ADD_FIXED_VERB = 'constraint.addFixed';

export function createAddFixedHandler(
  ctx: ConstraintCommandContext,
): CommandHandler<AddFixedArgs, string> {
  return {
    category: CONSTRAINT_COMMAND_CATEGORY,
    execute(args): CommandResult<string> {
      if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) {
        throw new Error(
          `constraint.addFixed: x and y must be finite (got x=${args.x}, y=${args.y}).`,
        );
      }
      const id = ctx.constraintStore.newId('fixed');
      ctx.constraintStore.add({
        id,
        kind: 'fixed',
        p: args.p,
        x: args.x,
        y: args.y,
      });
      return {
        payload: id,
        undo: () => ctx.constraintStore.remove(id),
      };
    },
  };
}
