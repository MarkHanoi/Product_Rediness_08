// SetCurtainWallTransomTypeHandler — set the transom system type on
// a curtain wall (S12-T5).
//
// The schema does not yet model transoms separately from mullions
// (they share the same thickness + material).  This handler is a
// thin compatibility stub that delegates to mullion-type semantics
// — when transom-specific fields land in the schema (planned 1C),
// this handler will be updated in place without a payload break.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallGeometryError, CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';

export interface SetCurtainWallTransomTypePayload {
  readonly curtainWallId: string;
  readonly systemTypeId?: string;
  readonly thickness?: number;
  readonly materialId?: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallTransomTypeHandler
  implements CommandHandler<SetCurtainWallTransomTypePayload, CWStores>
{
  readonly type = 'curtainwall.setTransomType';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallTransomTypePayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: 'thickness must be > 0' };
    }
    if (cmd.systemTypeId === undefined && cmd.thickness === undefined && cmd.materialId === undefined) {
      return { valid: false, reason: 'must specify at least one of systemTypeId, thickness, or materialId' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallTransomTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if (cmd.thickness !== undefined && cmd.thickness <= 0) {
      throw new CurtainWallGeometryError('transom thickness must be > 0');
    }
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      const cw = draft[cmd.curtainWallId];
      if (!cw) return;
      if (cmd.thickness !== undefined) cw.mullionThickness = cmd.thickness;
      if (cmd.materialId !== undefined) cw.materialId = cmd.materialId;
      else if (cmd.systemTypeId !== undefined) cw.materialId = cmd.systemTypeId;
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
