// CreateStairBatchHandler — mint multiple stairs in a single atomic command (Sprint A30).
//
// C11 §4.2: AI workflows creating multiple elements MUST use BatchCoordinator.runBatch();
//           this handler is the target of those dispatches.
// C11 §5.2: One produceCommand call for the entire batch — single forward+inverse patch pair.
// C10 §2:   withHandlerSpan wraps the full execute() body.

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
import type { CreateStairPayload } from './CreateStair.js';

export interface CreateStairBatchPayload {
  readonly stairs: readonly CreateStairPayload[];
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

export class CreateStairBatchHandler
  implements CommandHandler<CreateStairBatchPayload, StairHandlerStores>
{
  readonly type = 'stair.batch.create';
  readonly affectedStores = ['stair'] as const;

  canExecute(
    _ctx: HandlerContext<StairHandlerStores>,
    cmd: CreateStairBatchPayload,
  ): ValidationResult {
    if (!Array.isArray(cmd.stairs) || cmd.stairs.length === 0) {
      return { valid: false, reason: 'stairs array must be non-empty' };
    }
    for (let i = 0; i < cmd.stairs.length; i++) {
      const s = cmd.stairs[i];
      if (s.origin !== undefined && !isFiniteVec3(s.origin)) {
        return { valid: false, reason: `stairs[${i}].origin must be a finite Vec3` };
      }
      const v = validateStairDims(s);
      if (!v.ok) {
        return { valid: false, reason: `stairs[${i}]: ${v.reason ?? 'invalid dimensions'}` };
      }
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<StairHandlerStores>,
    cmd: CreateStairBatchPayload,
  ): HandlerResult {
    return withHandlerSpan(
      this.type + '.handler',
      { 'pryzm.command.type': this.type, 'pryzm.batch.size': cmd.stairs.length },
      () => {
        const parsed: StairData[] = [];
        const existing = ctx.stores.stair as StairsState;

        for (const entry of cmd.stairs) {
          const id = (entry.id ?? createId('stair')) as unknown as StairData['id'];

          if (existing[id]) throw new StairGeometryError(`stair id ${id} already exists`);

          const seed: Partial<StairData> = {
            id,
            levelId:      entry.levelId ?? '',
            topLevelId:   entry.topLevelId ?? '',
            shape:        entry.shape ?? 'straight',
            rotation:     entry.rotation ?? 0,
            treadDepth:   entry.treadDepth ?? 0.28,
            riserHeight:  entry.riserHeight ?? 0.18,
            width:        entry.width ?? 1.0,
            numRisers:    entry.numRisers ?? 15,
            materialId:   entry.materialId,
          };
          seed.origin = entry.origin ?? { x: 0, y: 0, z: 0 };

          if (seed.numRisers !== undefined && seed.numRisers < 2) {
            throw new StairRiserCountError(seed.numRisers);
          }

          let stair: StairData;
          try { stair = Stair.parse(seed); }
          catch (err) { throw new StairSchemaError(err); }

          parsed.push(stair);
        }

        const [next, forward, inverse] = produceCommand<StairsState>(
          ctx.stores.stair,
          (draft) => {
            for (const stair of parsed) {
              (draft as Record<string, StairData>)[stair.id] = stair;
            }
          },
        );
        return { forward, inverse, nextStates: { stair: next } };
      },
    );
  }
}
