// SetBeamTypeHandler — change a beam's section material id (S12-T3).
//
// No `@pryzm/types-builtin/beam` catalogue exists yet (planned for
// 1C); this handler simply records the type id on `materialId`.

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

export interface SetBeamTypePayload {
  readonly beamId: string;
  readonly systemTypeId: string;
  readonly materialId?: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class SetBeamTypeHandler implements CommandHandler<SetBeamTypePayload, BeamHandlerStores> {
  readonly type = 'beam.setType';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamTypePayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    if (typeof cmd.systemTypeId !== 'string' || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: 'systemTypeId must be a non-empty string' };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      b.materialId = cmd.materialId ?? cmd.systemTypeId;
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
