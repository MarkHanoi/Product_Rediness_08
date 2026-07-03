// SetFloorMaterialHandler — uniform material-set command (L-08). §FEAT-UNIFORM-MATERIAL-COMMAND
//
// One `floor.setMaterial` handler mirroring the family-uniform shape used
// across every element family.  Object-literal style (the floor family has
// no NotFoundError class — see UpdateFloorLayersHandler): a missing element
// returns early inside the produce closure.  Mutates only materialId /
// materialColor; the scene-committer's MATERIAL_FIELDS dirty-check swaps
// materials on the next commit — no builder/committer change is required.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { FloorsState } from '../store.js';

export interface SetFloorMaterialPayload {
  readonly floorId: string;
  readonly materialId?: string | null;
  readonly materialColor?: string;
}

type FloorHandlerStores = Readonly<{ floor: FloorsState } & Record<string, unknown>>;

export const SetFloorMaterialHandler: CommandHandler<SetFloorMaterialPayload, FloorHandlerStores> = {
  type: 'floor.setMaterial',
  affectedStores: ['floor'] as const,

  canExecute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: SetFloorMaterialPayload,
  ): ValidationResult {
    if (typeof cmd.floorId !== 'string' || cmd.floorId.length === 0) {
      return { valid: false, reason: 'floorId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    if (cmd.materialId !== undefined && cmd.materialId !== null && cmd.materialId.length === 0) {
      return { valid: false, reason: 'materialId must be non-empty when provided' };
    }
    if (!ctx.stores.floor[cmd.floorId]) {
      return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: SetFloorMaterialPayload,
  ): HandlerResult {
    return withHandlerSpan('floor.setMaterial.handler', { 'pryzm.command.type': 'floor.setMaterial' }, () => {
      const [next, forward, inverse] = produceCommand<FloorsState>(ctx.stores.floor, draft => {
        const floor = draft[cmd.floorId] as Record<string, unknown> | undefined;
        if (!floor) return;
        if (cmd.materialId === null) delete floor['materialId'];
        else if (cmd.materialId !== undefined) floor['materialId'] = cmd.materialId;
        if (cmd.materialColor !== undefined) floor['materialColor'] = cmd.materialColor;
      });
      return { forward, inverse, nextStates: { floor: next } };
    });
  },
};
