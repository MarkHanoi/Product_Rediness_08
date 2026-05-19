// CreateStairHandler — mint a new stair (S14-T1).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Stair, createId } from '@pryzm/plugin-sdk';
import {
  StairRiserCountError,
  StairSchemaError,
  StairGeometryError,
} from '../errors.js';
import type { StairData, StairsState } from '../store.js';
import { isFiniteVec3, validateStairDims } from '../intent.js';

export interface CreateStairPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly topLevelId?: string;
  readonly shape?: StairData['shape'];
  readonly origin?: StairData['origin'];
  readonly rotation?: number;
  readonly treadDepth?: number;
  readonly riserHeight?: number;
  readonly width?: number;
  readonly numRisers?: number;
  readonly materialId?: string;
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class CreateStairHandler implements CommandHandler<CreateStairPayload, StairHandlerStores> {
  readonly type = 'stair.create';
  readonly affectedStores = ['stair'] as const;

  canExecute(_ctx: HandlerContext<StairHandlerStores>, cmd: CreateStairPayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must be a finite Vec3' };
    }
    const v = validateStairDims(cmd);
    if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid dimensions' };
    return { valid: true };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: CreateStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('stair')) as unknown as StairData['id'];
    const seed: Partial<StairData> = {
      id,
      levelId: cmd.levelId ?? '',
      topLevelId: cmd.topLevelId ?? '',
      shape: cmd.shape ?? 'straight',
      rotation: cmd.rotation ?? 0,
      treadDepth: cmd.treadDepth ?? 0.28,
      riserHeight: cmd.riserHeight ?? 0.18,
      width: cmd.width ?? 1.0,
      numRisers: cmd.numRisers ?? 15,
      materialId: cmd.materialId,
    };
    seed.origin = cmd.origin ?? { x: 0, y: 0, z: 0 };

    if (seed.numRisers !== undefined && seed.numRisers < 2) {
      throw new StairRiserCountError(seed.numRisers);
    }

    let stair: StairData;
    try { stair = Stair.parse(seed); }
    catch (err) { throw new StairSchemaError(err); }

    const existing = ctx.stores.stair as StairsState;
    if (existing[id]) throw new StairGeometryError(`stair id ${id} already exists`);

    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      (draft as Record<string, StairData>)[stair.id] = stair;
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
