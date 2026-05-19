// SetDoorSwingHandler — change a door's swing direction (S11-T1).
//
// TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): stub replaced with a real
// Immer produceCommand that writes `door.swing` to the DoorsState store.
// The Door schema now declares `swing` with `optional().default('left-in')`
// (packages/schemas/src/elements/Door.ts) — all existing door records read
// as 'left-in' so this is fully backward-compatible.
//
// DoorCommitter.GEOMETRY_FIELDS includes 'swing', so the committer triggers
// a geometry rebuild when swing changes — the mesh reflects the new direction.
// produceDoor(dto, placement) receives the full DoorData including swing and
// produces geometry accordingly.

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
  DoorSwing,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan, produceCommand } from '@pryzm/plugin-sdk';
import { DoorNotFoundError } from '../errors.js';
import type { DoorsState } from '../store.js';

const VALID_SWINGS: readonly DoorSwing[] = [
  'left-in',
  'left-out',
  'right-in',
  'right-out',
  'sliding',
];

export interface SetDoorSwingPayload {
  readonly doorId: string;
  readonly swing: DoorSwing;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorSwingHandler
  implements CommandHandler<SetDoorSwingPayload, DoorHandlerStores>
{
  readonly type = 'door.setSwing';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorSwingPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (!VALID_SWINGS.includes(cmd.swing)) {
      return { valid: false, reason: `invalid swing: ${String(cmd.swing)}` };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorSwingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      // Race-defensive re-check (door may have been removed between canExecute and execute
      // in a concurrent session — same pattern as CreateWallBatchHandler).
      if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, draft => {
        const door = draft[cmd.doorId];
        if (door) (door as Record<string, unknown>)['swing'] = cmd.swing;
      });
      return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
