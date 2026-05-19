// UpdateRoofHandler — TASK-07 Phase B (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced F-1.3 commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch and Ctrl+Z actually works.
//
// Previously returned { forward: [], inverse: [] } causing roof.update to be
// non-undoable. UpdateRoofCommand in packages/command-registry/ is now orphaned
// by this path; it may still be reached from other legacy callers.
// TODO(E.5.x): ORPHANED — bridge migrated to produceCommand. Confirm no other
// callers remain then remove UpdateRoofCommand in Phase E.5.x cleanup.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { RoofsState } from '../store.js';

export interface UpdateRoofPayload {
  readonly id: string;
  readonly updates: Record<string, unknown>;
}

type RoofHandlerStores = Readonly<{ roof: RoofsState } & Record<string, unknown>>;

export const UpdateRoofHandler: CommandHandler<UpdateRoofPayload, RoofHandlerStores> = {
  type: 'roof.update',
  affectedStores: ['roof'] as const,

  canExecute(
    ctx: HandlerContext<RoofHandlerStores>,
    cmd: UpdateRoofPayload,
  ): ValidationResult {
    if (!cmd.id) return { valid: false, reason: 'roof id is required' };
    if (!ctx.stores.roof[cmd.id]) return { valid: false, reason: `roof not found: ${cmd.id}` };
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<RoofHandlerStores>,
    cmd: UpdateRoofPayload,
  ): HandlerResult {
    return withHandlerSpan('roof.update.handler', { 'pryzm.command.type': 'roof.update' }, () => {
      const [next, forward, inverse] = produceCommand<RoofsState>(ctx.stores.roof, draft => {
        const roof = draft[cmd.id];
        if (!roof) {
          console.error('[roof.update] roof not found in store:', cmd.id);
          return;
        }
        Object.assign(roof, cmd.updates);
      });
      return { forward, inverse, nextStates: { roof: next } };
    }); // withHandlerSpan — C10 §2
  },
};
