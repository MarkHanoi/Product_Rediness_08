// UpdateCeilingLayersHandler — TASK-12 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18).
//
// Handles 'ceiling.updateLayers' dispatched by PropertyPanelTypeSelector when the
// user applies a system-type change from the property panel.
// Uses produceCommand<CeilingsState> so the RingBufferUndoStack receives inverse
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
import type { CeilingsState } from '../store.js';

export interface UpdateCeilingLayersPayload {
  readonly ceilingId: string;
  readonly systemTypeId?: string;
  readonly layers?: unknown[];
  readonly thickness?: number;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export const UpdateCeilingLayersHandler: CommandHandler<UpdateCeilingLayersPayload, CeilingHandlerStores> = {
  type: 'ceiling.updateLayers',
  affectedStores: ['ceiling'] as const,

  canExecute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: UpdateCeilingLayersPayload,
  ): ValidationResult {
    if (!cmd.ceilingId) return { valid: false, reason: 'ceilingId is required' };
    if (!ctx.stores.ceiling[cmd.ceilingId]) return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: UpdateCeilingLayersPayload,
  ): HandlerResult {
    return withHandlerSpan('ceiling.updateLayers.handler', { 'pryzm.command.type': 'ceiling.updateLayers' }, () => {
      const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, draft => {
        const ceiling = draft[cmd.ceilingId] as Record<string, unknown> | undefined;
        if (!ceiling) {
          console.error('[ceiling.updateLayers] ceiling not found in store:', cmd.ceilingId);
          return;
        }
        if (cmd.systemTypeId !== undefined) ceiling['systemTypeId'] = cmd.systemTypeId;
        if (cmd.layers     !== undefined) ceiling['layers']     = cmd.layers;
        if (cmd.thickness  !== undefined) ceiling['thickness']  = cmd.thickness;
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    });
  },
};
