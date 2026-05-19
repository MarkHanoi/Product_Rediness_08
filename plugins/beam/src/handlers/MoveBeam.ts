// MoveBeamHandler — translate both baseLine endpoints by a delta (S12-T3).

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

export interface MoveBeamPayload {
  readonly beamId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class MoveBeamHandler implements CommandHandler<MoveBeamPayload, BeamHandlerStores> {
  readonly type = 'beam.move';
  readonly affectedStores = ['beam'] as const;

  canExecute(ctx: HandlerContext<BeamHandlerStores>, cmd: MoveBeamPayload): ValidationResult {
    if (typeof cmd.beamId !== 'string' || cmd.beamId.length === 0) {
      return { valid: false, reason: 'beamId must be a non-empty string' };
    }
    if (!cmd.delta || !Number.isFinite(cmd.delta.x) || !Number.isFinite(cmd.delta.y) || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.beam[cmd.beamId]) return { valid: false, reason: `beam not found: ${cmd.beamId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: MoveBeamPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.beam[cmd.beamId]) throw new BeamNotFoundError(cmd.beamId);
    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      const b = draft[cmd.beamId];
      if (!b) return;
      for (const p of b.baseLine) { p.x += cmd.delta.x; p.y += cmd.delta.y; p.z += cmd.delta.z; }
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
