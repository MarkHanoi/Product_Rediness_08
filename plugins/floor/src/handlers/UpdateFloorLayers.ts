// UpdateFloorLayersHandler — TASK-12 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18).
//
// Handles 'floor.updateLayers' dispatched by PropertyPanelTypeSelector when the
// user applies a system-type change from the property panel.
// Uses produceCommand<FloorsState> so the RingBufferUndoStack receives inverse
// patches and Ctrl+Z reverts the layer/thickness change.
//
// Contract compliance: C11 §5 (handler MUST/MUST NOT), C14 §2.1 (no commandManager.execute).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { FloorsState } from '../store.js';

export interface UpdateFloorLayersPayload {
  readonly floorId: string;
  readonly systemTypeId?: string;
  readonly layers?: unknown[];
  readonly thickness?: number;
}

type FloorHandlerStores = Readonly<{ floor: FloorsState } & Record<string, unknown>>;

export const UpdateFloorLayersHandler: CommandHandler<UpdateFloorLayersPayload, FloorHandlerStores> = {
  type: 'floor.updateLayers',
  affectedStores: ['floor'] as const,

  canExecute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: UpdateFloorLayersPayload,
  ): ValidationResult {
    if (!cmd.floorId) return { valid: false, reason: 'floorId is required' };
    if (!ctx.stores.floor[cmd.floorId]) return { valid: false, reason: `floor not found: ${cmd.floorId}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<FloorHandlerStores>,
    cmd: UpdateFloorLayersPayload,
  ): HandlerResult {
    return withHandlerSpan('floor.updateLayers.handler', { 'pryzm.command.type': 'floor.updateLayers' }, () => {
      const [next, forward, inverse] = produceCommand<FloorsState>(ctx.stores.floor, draft => {
        const floor = draft[cmd.floorId] as Record<string, unknown> | undefined;
        if (!floor) {
          console.error('[floor.updateLayers] floor not found in store:', cmd.floorId);
          return;
        }
        if (cmd.systemTypeId !== undefined) floor['systemTypeId'] = cmd.systemTypeId;
        if (cmd.layers     !== undefined) floor['layers']     = cmd.layers;
        if (cmd.thickness  !== undefined) floor['thickness']  = cmd.thickness;
      });
      return { forward, inverse, nextStates: { floor: next } };
    });
  },
};
