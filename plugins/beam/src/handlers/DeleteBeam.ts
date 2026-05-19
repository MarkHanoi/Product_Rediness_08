// DeleteBeamHandler — remove a beam (S12-T3).

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

export interface DeleteBeamPayload { readonly beamId: string }

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class DeleteBeamHandler implements CommandHandler<DeleteBeamPayload, BeamHandlerStores> {
  readonly type = 'beam.delete';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: DeleteBeamPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: DeleteBeamPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      delete draft[cmd.beamId];
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
