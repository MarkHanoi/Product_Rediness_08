// CreateCeilingHandler — mint a new ceiling (S14-T8).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Ceiling, createId } from '@pryzm/plugin-sdk';
import {
  CeilingGeometryError,
  CeilingSchemaError,
} from '../errors.js';
import type { CeilingData, CeilingsState } from '../store.js';
import { validateCeilingBoundary } from '../intent.js';

export interface CreateCeilingPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly boundary?: CeilingData['boundary'];
  readonly ceilingHeight?: number;
  readonly thickness?: number;
  readonly materialId?: string;
  readonly materialColor?: string;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class CreateCeilingHandler implements CommandHandler<CreateCeilingPayload, CeilingHandlerStores> {
  readonly type = 'ceiling.create';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(_ctx: HandlerContext<CeilingHandlerStores>, cmd: CreateCeilingPayload): ValidationResult {
    if (cmd.boundary !== undefined) {
      const v = validateCeilingBoundary(cmd.boundary);
      if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };
    }
    if (cmd.ceilingHeight !== undefined && (!Number.isFinite(cmd.ceilingHeight) || cmd.ceilingHeight <= 0)) {
      return { valid: false, reason: 'ceilingHeight must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness <= 0)) {
      return { valid: false, reason: 'thickness must be > 0' };
    }
    if (cmd.thickness !== undefined && cmd.ceilingHeight !== undefined && cmd.thickness >= cmd.ceilingHeight) {
      return { valid: false, reason: 'thickness must be < ceilingHeight' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: CreateCeilingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('ceiling')) as unknown as CeilingData['id'];
    const seed: Partial<CeilingData> = {
      id,
      levelId: cmd.levelId ?? '',
      ceilingHeight: cmd.ceilingHeight ?? 2.7,
      thickness: cmd.thickness ?? 0.05,
      materialId: cmd.materialId,
      materialColor: cmd.materialColor,
    };
    if (cmd.boundary) seed.boundary = cmd.boundary;
    if (seed.thickness !== undefined && seed.ceilingHeight !== undefined && seed.thickness >= seed.ceilingHeight) {
      throw new CeilingGeometryError('thickness must be < ceilingHeight');
    }
    if (seed.boundary) {
      const v = validateCeilingBoundary(seed.boundary);
      if (!v.ok) throw new CeilingGeometryError(v.reason ?? 'invalid boundary');
    }

    let ceiling: CeilingData;
    try { ceiling = Ceiling.parse(seed); }
    catch (err) { throw new CeilingSchemaError(err); }

    const existing = ctx.stores.ceiling as CeilingsState;
    if (existing[id]) throw new CeilingGeometryError(`ceiling id ${id} already exists`);

    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      (draft as Record<string, CeilingData>)[ceiling.id] = ceiling;
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
