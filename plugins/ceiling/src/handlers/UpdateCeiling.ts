// UpdateCeilingHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced E.5.x commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch and Ctrl+Z actually works.
//
// Previously returned { forward: [], inverse: [] } causing ceiling.update to be
// non-undoable. UpdateCeilingCommand in packages/command-registry/ is now orphaned
// by this path; it may still be reached from other legacy callers.
// TODO(E.5.x): ORPHANED — bridge migrated to produceCommand. Confirm no other
// callers remain then remove UpdateCeilingCommand in Phase E.5.x cleanup.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CeilingsState } from '../store.js';

export interface UpdateCeilingPayload {
  readonly ceilingId: string;
  readonly updates: Record<string, unknown>;
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export const UpdateCeilingHandler: CommandHandler<UpdateCeilingPayload, CeilingHandlerStores> = {
  type: 'ceiling.update',
  affectedStores: ['ceiling'] as const,

  canExecute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: UpdateCeilingPayload,
  ): ValidationResult {
    if (!cmd.ceilingId) return { valid: false, reason: 'ceilingId is required' };
    if (!ctx.stores.ceiling[cmd.ceilingId]) {
      return { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<CeilingHandlerStores>,
    cmd: UpdateCeilingPayload,
  ): HandlerResult {
    return withHandlerSpan('ceiling.update.handler', { 'pryzm.command.type': 'ceiling.update' }, () => {
      const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, draft => {
        const ceiling = draft[cmd.ceilingId];
        if (!ceiling) {
          console.error('[ceiling.update] ceiling not found in store:', cmd.ceilingId);
          return;
        }
        Object.assign(ceiling, cmd.updates);
      });
      return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  },
};
