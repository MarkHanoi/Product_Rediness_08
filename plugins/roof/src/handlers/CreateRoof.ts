// CreateRoofHandler — mint a new roof (S11-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Roof, createId } from '@pryzm/plugin-sdk';
import { RoofSchemaError, RoofTypeNotFoundError } from '../errors.js';
import type { RoofData, RoofsState } from '../store.js';
import { getRoofType } from '@pryzm/plugin-sdk';

export interface CreateRoofPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly boundary?: RoofData['boundary'];
  readonly shape?: RoofData['shape'];
  readonly pitch?: number;
  readonly thickness?: number;
  readonly overhang?: number;
  readonly materialId?: string;
  readonly materialColor?: string;
  readonly systemTypeId?: string;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class CreateRoofHandler implements CommandHandler<CreateRoofPayload, RoofHandlerStores> {
  readonly type = 'roof.create';
  readonly affectedStores = ['roof'] as const;

  canExecute(_ctx: HandlerContext<RoofHandlerStores>, cmd: CreateRoofPayload): ValidationResult {
    if (cmd.boundary !== undefined && cmd.boundary.length < 3) {
      return { valid: false, reason: 'boundary requires ≥3 points' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: 'thickness must be > 0' };
    }
    if (cmd.pitch !== undefined && (!Number.isFinite(cmd.pitch) || cmd.pitch < 0 || cmd.pitch >= Math.PI / 2)) {
      return { valid: false, reason: 'pitch must be in [0, π/2)' };
    }
    if (cmd.systemTypeId !== undefined && cmd.systemTypeId.length > 0) {
      if (!getRoofType(cmd.systemTypeId)) {
        return { valid: false, reason: `roof type not found: ${cmd.systemTypeId}` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: CreateRoofPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const typeDefaults = cmd.systemTypeId ? getRoofType(cmd.systemTypeId) : undefined;
    if (cmd.systemTypeId && !typeDefaults) {
      throw new RoofTypeNotFoundError(cmd.systemTypeId);
    }
    const id = (cmd.id ?? createId('roof')) as RoofData['id'];
    const seed: Partial<RoofData> = {
      id,
      levelId: cmd.levelId ?? '',
      shape: cmd.shape ?? typeDefaults?.shape ?? 'flat',
      pitch: cmd.pitch ?? typeDefaults?.pitch ?? 0,
      thickness: cmd.thickness ?? typeDefaults?.thickness ?? 0.2,
      overhang: cmd.overhang ?? typeDefaults?.overhang ?? 0,
      materialId: cmd.materialId,
      materialColor: cmd.materialColor ?? typeDefaults?.materialColor,
    };
    if (cmd.boundary) seed.boundary = cmd.boundary;

    let roof: RoofData;
    try {
      roof = Roof.parse(seed);
    } catch (err) {
      throw new RoofSchemaError(err);
    }

    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      draft[roof.id] = roof;
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
