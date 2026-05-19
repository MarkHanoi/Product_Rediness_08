// SetDoorTypeHandler — change a door's `systemTypeId` and re-apply
// the type's defaults (S11-T1).
//
// Symmetry with `wall.setSystemType` — re-materialises the typed
// defaults (width / height / frame / colours) into the DTO so the
// committer rebuild reflects the catalogue change without further input.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DoorNotFoundError, DoorTypeNotFoundError } from '../errors.js';
import type { DoorData, DoorsState } from '../store.js';
import { getDoorType } from '@pryzm/plugin-sdk';

export interface SetDoorTypePayload {
  readonly doorId: string;
  readonly systemTypeId: string;
  /** When false, only updates `systemTypeId` and leaves geometry/colour
   *  fields alone.  Default true (recommended). */
  readonly applyDefaults?: boolean;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorTypeHandler
  implements CommandHandler<SetDoorTypePayload, DoorHandlerStores>
{
  readonly type = 'door.setType';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorTypePayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (typeof cmd.systemTypeId !== 'string' || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: 'systemTypeId must be a non-empty string' };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    if (!getDoorType(cmd.systemTypeId)) {
      return { valid: false, reason: `door type not found: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const door = ctx.stores.door[cmd.doorId];
    if (!door) throw new DoorNotFoundError(cmd.doorId);
    const t = getDoorType(cmd.systemTypeId);
    if (!t) throw new DoorTypeNotFoundError(cmd.systemTypeId);

    const apply = cmd.applyDefaults !== false;

    const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
      const d = draft[cmd.doorId] as DoorData | undefined;
      if (!d) return;
      if (apply) {
        d.width = t.width;
        d.height = t.height;
        d.frameThickness = t.frameThickness;
        d.frameWidth = t.frameWidth;
        d.frameColor = t.frameColor;
        d.leafColor = t.leafColor;
        if (t.fireRating !== undefined) d.fireRating = t.fireRating;
        if (t.accessibility !== undefined) d.accessibilityType = t.accessibility;
      }
    });

    return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
