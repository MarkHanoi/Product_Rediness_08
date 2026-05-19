// UpdateSlabHandler — TASK-07 Phase A (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced F-1.3 commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch and Ctrl+Z actually works.
//
// Previously returned { forward: [], inverse: [] } causing slab.update to be
// non-undoable. UpdateSlabCommand in packages/command-registry/ is now orphaned
// by this path; it may still be reached from other legacy callers.
// TODO(E.5.x): ORPHANED — bridge migrated to produceCommand. Confirm no other
// callers remain then remove UpdateSlabCommand in Phase E.5.x cleanup.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SlabsState } from '../store.js';

export interface UpdateSlabPayload {
  readonly id: string;
  readonly [k: string]: unknown;
}

type SlabHandlerStores = Readonly<{ slab: SlabsState } & Record<string, unknown>>;

export const UpdateSlabHandler: CommandHandler<UpdateSlabPayload, SlabHandlerStores> = {
  type: 'slab.update',
  affectedStores: ['slab'] as const,

  canExecute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabPayload,
  ): ValidationResult {
    if (!cmd.id) return { valid: false, reason: 'slab id is required' };
    if (!ctx.stores.slab[cmd.id]) return { valid: false, reason: `slab not found: ${cmd.id}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<SlabHandlerStores>,
    cmd: UpdateSlabPayload,
  ): HandlerResult {
    return withHandlerSpan('slab.update.handler', { 'pryzm.command.type': 'slab.update' }, () => {
      const { id, ...updates } = cmd;
      const [next, forward, inverse] = produceCommand<SlabsState>(ctx.stores.slab, draft => {
        const slab = draft[id];
        if (!slab) {
          console.error('[slab.update] slab not found in store:', id);
          return;
        }
        Object.assign(slab, updates);
      });
      return { forward, inverse, nextStates: { slab: next } };
    }); // withHandlerSpan — C10 §2
  },
};
