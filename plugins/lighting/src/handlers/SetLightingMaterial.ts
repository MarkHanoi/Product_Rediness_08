// SetLightingMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `lighting.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  The scene-committer's MATERIAL_FIELDS
// dirty-check swaps materials on the next commit — no builder/committer
// change is required here.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { LightingNotFoundError } from '../errors.js';
import type { LightingsState } from '../store.js';

export interface SetLightingMaterialPayload {
  readonly lightingId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type LightingHandlerStores = Readonly<{ lighting: LightingsState } & Record<string, unknown>>;

export class SetLightingMaterialHandler
  implements CommandHandler<SetLightingMaterialPayload, LightingHandlerStores>
{
  readonly type = 'lighting.setMaterial';
  readonly affectedStores = ['lighting'] as const;

  canExecute(ctx: HandlerContext<LightingHandlerStores>, cmd: SetLightingMaterialPayload): ValidationResult {
    if (typeof cmd.lightingId !== 'string' || cmd.lightingId.length === 0) {
      return { valid: false, reason: 'lightingId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (cmd.materialId !== undefined && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: 'materialId must be non-empty when provided' };
    }
    if (!ctx.stores.lighting[cmd.lightingId]) {
      return { valid: false, reason: `lighting not found: ${cmd.lightingId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<LightingHandlerStores>, cmd: SetLightingMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.lighting[cmd.lightingId]) throw new LightingNotFoundError(cmd.lightingId);

    const [next, forward, inverse] = produceCommand<LightingsState>(ctx.stores.lighting, (draft) => {
      const l = draft[cmd.lightingId];
      if (!l) return;
      if (cmd.materialId === null) delete l.materialId;
      else if (cmd.materialId !== undefined) l.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — lighting colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { lighting: next } };
    }); // withHandlerSpan — C10 §2
  }
}
