// CreateBeamHandler — mint a new beam (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Beam, createId } from '@pryzm/plugin-sdk';
import { BeamGeometryError, BeamSchemaError } from '../errors.js';
import type { BeamData, BeamsState } from '../store.js';
import { isFiniteVec3, isNonZeroBaseLine } from '../intent.js';

export interface CreateBeamPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly baseLine?: BeamData['baseLine'];
  readonly shape?: BeamData['shape'];
  readonly width?: number;
  readonly depth?: number;
  readonly rotation?: number;
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type BeamHandlerStores = Readonly<{ beam: BeamsState } & Record<string, unknown>>;

export class CreateBeamHandler implements CommandHandler<CreateBeamPayload, BeamHandlerStores> {
  readonly type = 'beam.create';
  readonly affectedStores = ['beam'] as const;

  canExecute(_ctx: HandlerContext<BeamHandlerStores>, cmd: CreateBeamPayload): ValidationResult {
    if (cmd.baseLine !== undefined) {
      const [a, b] = cmd.baseLine;
      if (!isFiniteVec3(a) || !isFiniteVec3(b)) {
        return { valid: false, reason: 'baseLine endpoints must be finite Vec3' };
      }
      if (!isNonZeroBaseLine(a, b)) {
        return { valid: false, reason: 'baseLine endpoints must differ' };
      }
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.depth !== undefined && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: 'depth must be > 0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<BeamHandlerStores>, cmd: CreateBeamPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('beam')) as BeamData['id'];
    const seed: Partial<BeamData> = {
      id,
      levelId: cmd.levelId ?? '',
      shape: cmd.shape ?? 'rectangular',
      width: cmd.width ?? 0.2,
      depth: cmd.depth ?? 0.4,
      rotation: cmd.rotation ?? 0,
      materialId: cmd.materialId ?? cmd.systemTypeId,
    };
    if (cmd.baseLine) seed.baseLine = cmd.baseLine;
    if (seed.baseLine && !isNonZeroBaseLine(seed.baseLine[0], seed.baseLine[1])) {
      throw new BeamGeometryError('baseLine endpoints must differ');
    }
    let beam: BeamData;
    try { beam = Beam.parse(seed); }
    catch (err) { throw new BeamSchemaError(err); }

    const [next, forward, inverse] = produceCommand<BeamsState>(ctx.stores.beam, (draft) => {
      draft[beam.id] = beam;
    });
    return { forward, inverse, nextStates: { beam: next } };
    }); // withHandlerSpan — C10 §2
  }
}
