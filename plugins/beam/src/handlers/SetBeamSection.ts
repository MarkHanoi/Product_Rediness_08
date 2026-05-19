// SetBeamSectionHandler — change a beam's profile shape and dims (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { BeamDimensionsError, BeamNotFoundError } from '../errors.js';
import type { BeamData, BeamsState } from '../store.js';

export interface SetBeamSectionPayload {
  readonly beamId: string;
  readonly shape?: BeamData['shape'];
  readonly width?: number;
  readonly depth?: number;
  readonly rotation?: number;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class SetBeamSectionHandler
  implements CommandHandler<SetBeamSectionPayload, BeamHandlerStores>
{
  readonly type = 'beam.setSection';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamSectionPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.depth !== undefined && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: 'depth must be > 0' };
    }
    if (cmd.rotation !== undefined && !Number.isFinite(cmd.rotation)) {
      return { valid: false, reason: 'rotation must be a finite number' };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: SetBeamSectionPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
    if (cmd.width !== undefined && cmd.width <= 0) throw new BeamDimensionsError('width must be > 0');
    if (cmd.depth !== undefined && cmd.depth <= 0) throw new BeamDimensionsError('depth must be > 0');
    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      if (cmd.shape !== undefined) b.shape = cmd.shape;
      if (cmd.width !== undefined) b.width = cmd.width;
      if (cmd.depth !== undefined) b.depth = cmd.depth;
      if (cmd.rotation !== undefined) b.rotation = cmd.rotation;
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
