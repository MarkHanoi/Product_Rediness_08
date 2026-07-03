// SetBeamMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `beam.setMaterial` handler mirroring the family-uniform shape used
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
import { BeamNotFoundError } from '../errors.js';
import type { BeamsState } from '../store.js';

export interface SetBeamMaterialPayload {
  readonly beamId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class SetBeamMaterialHandler
  implements CommandHandler<SetBeamMaterialPayload, BeamHandlerStores>
{
  readonly type = 'beam.setMaterial';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamMaterialPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
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
    if (!ctx.stores.beam[cmd.beamId]) {
      return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamMaterialPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);

    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      if (cmd.materialId === null) delete b.materialId;
      else if (cmd.materialId !== undefined) b.materialId = cmd.materialId;
      // materialColor accepted for uniform shape but not applied — beam colour derives from the material-library entry (materialId). §FEAT-UNIFORM-MATERIAL-COMMAND
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
