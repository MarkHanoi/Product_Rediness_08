// SetStructuralDimensionsHandler — patch width/depth/thickness/radius (S26).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { StructuralNotFoundError } from '../errors.js';
import type { StructuralsState } from '../store.js';

export interface SetStructuralDimensionsPayload {
  readonly structuralId: string;
  readonly width?: number;
  readonly depth?: number;
  readonly thickness?: number;
  readonly radius?: number;
}

type Stores = Readonly<{ structural: StructuralsState } & Record<string, unknown>>;

export class SetStructuralDimensionsHandler
  implements CommandHandler<SetStructuralDimensionsPayload, Stores>
{
  readonly type = 'structural.setDimensions';
  readonly affectedStores = ['structural'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetStructuralDimensionsPayload): ValidationResult {
    if (!ctx.stores.structural[cmd.structuralId]) {
      return { valid: false, reason: `structural not found: ${cmd.structuralId}` };
    }
    for (const k of ['width', 'depth', 'thickness', 'radius'] as const) {
      const v = cmd[k];
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        return { valid: false, reason: `${k} must be > 0` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetStructuralDimensionsPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.structural[cmd.structuralId]) throw new StructuralNotFoundError(cmd.structuralId);
    const [next, forward, inverse] = produceCommand<StructuralsState>(ctx.stores.structural, (draft) => {
      const s = draft[cmd.structuralId];
      if (!s) return;
      if (cmd.width !== undefined) s.width = cmd.width;
      if (cmd.depth !== undefined) s.depth = cmd.depth;
      if (cmd.thickness !== undefined) s.thickness = cmd.thickness;
      if (cmd.radius !== undefined) s.radius = cmd.radius;
    });
    return { forward, inverse, nextStates: { structural: next } };
    }); // withHandlerSpan — C10 §2
  }
}
