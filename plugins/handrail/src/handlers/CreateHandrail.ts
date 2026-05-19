// CreateHandrailHandler — mint a new handrail (S14-T4).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Handrail, createId } from '@pryzm/plugin-sdk';
import { HandrailGeometryError, HandrailSchemaError } from '../errors.js';
import type { HandrailData, HandrailsState } from '../store.js';
import { validateHandrailPath } from '../intent.js';

export interface CreateHandrailPayload {
  readonly id?: string;
  readonly levelId?: string;
  readonly hostId?: string;
  readonly path?: HandrailData['path'];
  readonly shape?: HandrailData['shape'];
  readonly height?: number;
  readonly diameter?: number;
  readonly materialId?: string;
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class CreateHandrailHandler implements CommandHandler<CreateHandrailPayload, HandrailHandlerStores> {
  readonly type = 'handrail.create';
  readonly affectedStores = ['handrail'] as const;

  canExecute(_ctx: HandlerContext<HandrailHandlerStores>, cmd: CreateHandrailPayload): ValidationResult {
    if (cmd.path !== undefined) {
      const v = validateHandrailPath(cmd.path);
      if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid path' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.diameter !== undefined && (!Number.isFinite(cmd.diameter) || cmd.diameter <= 0)) {
      return { valid: false, reason: 'diameter must be > 0' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: CreateHandrailPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const id = (cmd.id ?? createId('handrail')) as unknown as HandrailData['id'];
    const seed: Partial<HandrailData> = {
      id,
      levelId: cmd.levelId ?? '',
      shape: cmd.shape ?? 'round',
      height: cmd.height ?? 1.0,
      diameter: cmd.diameter ?? 0.04,
      materialId: cmd.materialId,
    };
    seed.path = cmd.path ?? [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
    if (cmd.hostId !== undefined) seed.hostId = cmd.hostId;

    let handrail: HandrailData;
    try { handrail = Handrail.parse(seed); }
    catch (err) { throw new HandrailSchemaError(err); }

    const existing = ctx.stores.handrail as HandrailsState;
    if (existing[id]) throw new HandrailGeometryError(`handrail id ${id} already exists`);

    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      (draft as Record<string, HandrailData>)[handrail.id] = handrail;
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
