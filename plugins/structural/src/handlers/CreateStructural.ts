// CreateStructuralHandler — mint a new second-tier structural element (S26).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Structural, createId } from '@pryzm/plugin-sdk';
import { StructuralSchemaError } from '../errors.js';
import type { StructuralData, StructuralsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface CreateStructuralPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly kind?: StructuralData['kind'];
  readonly origin?: StructuralData['origin'];
  readonly endOffset?: StructuralData['endOffset'];
  readonly width?: number;
  readonly depth?: number;
  readonly thickness?: number;
  readonly radius?: number;
  readonly rotation?: number;
  readonly baseOffset?: number;
  readonly materialId?: string;
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class CreateStructuralHandler
  implements CommandHandler<CreateStructuralPayload, Stores>
{
  readonly type = 'structural.create';
  readonly affectedStores = ['structural'] as const;

  canExecute(_ctx: HandlerContext<Stores>, cmd: CreateStructuralPayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must have finite x, y, z' };
    }
    if (cmd.endOffset !== undefined && !isFiniteVec3(cmd.endOffset)) {
      return { valid: false, reason: 'endOffset must have finite x, y, z' };
    }
    for (const k of ['width', 'depth', 'thickness', 'radius'] as const) {
      const v = cmd[k];
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateStructuralPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('structural')) as StructuralData['id'];
    const seed: Partial<StructuralData> = {
      id,
      levelId: cmd.levelId ?? '',
      kind: cmd.kind ?? 'brace',
      origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
      endOffset: cmd.endOffset ?? { x: 1, y: 0, z: 0 },
      width: cmd.width ?? 0.6,
      depth: cmd.depth ?? 0.6,
      thickness: cmd.thickness ?? 0.4,
      radius: cmd.radius ?? 0.06,
      rotation: cmd.rotation ?? 0,
      baseOffset: cmd.baseOffset ?? 0,
      materialId: cmd.materialId,
    };

    let s: StructuralData;
    try { s = Structural.parse(seed); }
    catch (err) { throw new StructuralSchemaError(err); }

    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      draft[s.id] = s;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
