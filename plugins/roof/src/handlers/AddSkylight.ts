// AddSkylightHandler — append a skylight to a roof (W-1C-5).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Skylight } from '@pryzm/plugin-sdk';
import { RoofNotFoundError, RoofSchemaError } from '../errors.js';
import type { RoofsState } from '../store.js';

export interface AddSkylightPayload {
  readonly roofId: string;
  readonly skylight: {
    readonly id: string;
    readonly position?: { x: number; y: number; z: number };
    readonly width?: number;
    readonly depth?: number;
    readonly frameWidth?: number;
    readonly materialId?: string;
  };
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export class AddSkylightHandler
  implements CommandHandler<AddSkylightPayload, RoofHandlerStores>
{
  readonly type = 'roof.addSkylight';
  readonly affectedStores = ['roof'] as const;

  canExecute(ctx: HandlerContext<RoofHandlerStores>, cmd: AddSkylightPayload): ValidationResult {
    if (typeof cmd.roofId !== 'string' || cmd.roofId.length === 0) {
      return { valid: false, reason: 'roofId must be a non-empty string' };
    }
    if (!ctx.stores.roof[cmd.roofId]) {
      return { valid: false, reason: `roof not found: ${cmd.roofId}` };
    }
    const parsed = Skylight.safeParse(cmd.skylight);
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.message };
    }
    const roof = ctx.stores.roof[cmd.roofId];
    if (roof && roof.skylights.some((s) => s.id === cmd.skylight.id)) {
      return { valid: false, reason: `skylight id already exists on roof: ${cmd.skylight.id}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<RoofHandlerStores>, cmd: AddSkylightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const roof = ctx.stores.roof[cmd.roofId];
    if (!roof) throw new RoofNotFoundError(cmd.roofId);
    const parsed = Skylight.safeParse(cmd.skylight);
    if (!parsed.success) throw new RoofSchemaError(parsed.error.message);
    const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, (draft) => {
      const d = draft[cmd.roofId];
      if (d) d.skylights = [...d.skylights, parsed.data];
    });
    return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  }
}
