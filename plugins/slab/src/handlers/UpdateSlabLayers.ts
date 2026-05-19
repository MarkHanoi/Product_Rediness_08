// UpdateSlabLayersHandler — TASK-12 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18).
//
// Handles 'slab.updateLayers' dispatched by PropertyPanelTypeSelector when the
// user applies a system-type change from the property panel.
// Uses produceCommand<SlabsState> so the RingBufferUndoStack receives inverse
// patches and Ctrl+Z reverts the layer/thickness change.
//
// Contract compliance: C11 §5 (handler MUST/MUST NOT), C14 §2.1 (no commandManager.execute), P6.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SlabsState } from '../store.js';

export interface UpdateSlabLayersPayload {
  readonly slabId: string;
  readonly systemTypeId?: string;
  readonly layers?: unknown[];
  readonly thickness?: number;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export const UpdateSlabLayersHandler: CommandHandler<UpdateSlabLayersPayload, SlabHandlerStores> = {
  type: 'slab.updateLayers',
  affectedStores: ['slab'] as const,

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabLayersPayload,
  ): ValidationResult {
    if (!cmd.slabId) return { valid: false, reason: 'slabId is required' };
    if (!ctx.stores.slab[cmd.slabId]) return { valid: false, reason: `slab not found: ${cmd.slabId}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabLayersPayload,
  ): HandlerResult {
    return withHandlerSpan('slab.updateLayers.handler', { 'pryzm.command.type': 'slab.updateLayers' }, () => {
      const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, draft => {
        const slab = draft[cmd.slabId] as Record<string, unknown> | undefined;
        if (!slab) {
          console.error('[slab.updateLayers] slab not found in store:', cmd.slabId);
          return;
        }
        if (cmd.systemTypeId !== undefined) slab['systemTypeId'] = cmd.systemTypeId;
        if (cmd.layers     !== undefined) slab['layers']     = cmd.layers;
        if (cmd.thickness  !== undefined) slab['thickness']  = cmd.thickness;
      });
      return { forward, inverse, nextStates: { slab: next } };
    });
  },
};
