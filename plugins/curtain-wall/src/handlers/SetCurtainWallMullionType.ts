// SetCurtainWallMullionTypeHandler — change a curtain wall's mullion
// thickness + system material id (S12-T5).
//
// PRYZM 1's "MullionType" object also encoded a profile shape and a
// finish id; the schema tracks only `mullionThickness` and a
// curtain-wall-wide `materialId` for now.  When the catalogue lands
// in 1C this handler will resolve the systemTypeId to a profile.

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

export interface SetCurtainWallMullionTypePayload {
  readonly curtainWallId: string;
  readonly systemTypeId?: string;
  readonly thickness?: number;
  readonly materialId?: string;
}

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class SetCurtainWallMullionTypeHandler
  implements CommandHandler<SetCurtainWallMullionTypePayload, CWStores>
{
  readonly type = 'curtainwall.setMullionType';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallMullionTypePayload): ValidationResult {
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

  execute(ctx: HandlerContext<CWStores>, cmd: SetCurtainWallMullionTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    if (cmd.thickness !== undefined && cmd.thickness <= 0) {
      throw new CurtainWallGeometryError('mullion thickness must be > 0');
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
