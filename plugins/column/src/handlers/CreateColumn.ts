// CreateColumnHandler — mint a new column (S12-T3).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Column, createId } from '@pryzm/plugin-sdk';
import { ColumnDimensionsError, ColumnSchemaError } from '../errors.js';
import type { ColumnData, ColumnsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface CreateColumnPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly topLevelId?: string;
  readonly origin?: ColumnData['origin'];
  readonly shape?: ColumnData['shape'];
  readonly width?: number;
  readonly depth?: number;
  readonly height?: number;
  readonly baseOffset?: number;
  readonly rotation?: number;
  readonly materialId?: string;
  readonly systemTypeId?: string;
}

type ColumnHandlerStores = Readonly<{ column: ColumnsState } & Record<string, unknown>>;

export class CreateColumnHandler
  implements CommandHandler<CreateColumnPayload, ColumnHandlerStores>
{
  readonly type = 'column.create';
  readonly affectedStores = ['column'] as const;

  canExecute(_ctx: HandlerContext<ColumnHandlerStores>, cmd: CreateColumnPayload): ValidationResult {
    if (cmd.origin !== undefined && !isFiniteVec3(cmd.origin)) {
      return { valid: false, reason: 'origin must have finite x, y, z' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.depth !== undefined && (!Number.isFinite(cmd.depth) || cmd.depth <= 0)) {
      return { valid: false, reason: 'depth must be > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.shape === 'circular' && cmd.width !== undefined && cmd.depth !== undefined && cmd.width !== cmd.depth) {
      return { valid: false, reason: 'circular column requires width === depth' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<ColumnHandlerStores>, cmd: CreateColumnPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('column')) as ColumnData['id'];
    const seed: Partial<ColumnData> = {
      id,
      levelId: cmd.levelId ?? '',
      topLevelId: cmd.topLevelId,
      origin: cmd.origin ?? { x: 0, y: 0, z: 0 },
      shape: cmd.shape ?? 'rectangular',
      width: cmd.width ?? 0.4,
      depth: cmd.depth ?? 0.4,
      height: cmd.height ?? 3,
      baseOffset: cmd.baseOffset ?? 0,
      rotation: cmd.rotation ?? 0,
      materialId: cmd.materialId ?? cmd.systemTypeId,
    };

    if (seed.shape === 'circular' && seed.width !== seed.depth) {
      throw new ColumnDimensionsError('circular column requires width === depth');
    }

    let column: ColumnData;
    try { column = Column.parse(seed); }
    catch (err) { throw new ColumnSchemaError(err); }

    const [next, forward, inverse] = produceCommand<ColumnsState>(ctx.stores.column, (draft) => {
      draft[column.id] = column;
    });
    return { forward, inverse, nextStates: { column: next } };
    }); // withHandlerSpan — C10 §2
  }
}
