// UpdateCurtainWallHandler — TASK-07 Phase A (MASTER-IMPL-PLAN-2026-05-18 BUG-7).
//
// Replaced F-1.3 commandManager bridge with authoritative Immer produceCommand so
// the RingBufferUndoStack receives a real inverse patch for curtain wall updates.
//
// Previously returned { forward: [], inverse: [] } — all curtain wall property changes
// (material, colour, height, grid spacing) were silently non-undoable.
// UpdateCurtainWallCommand in packages/command-registry/ is now orphaned by this path.
// TODO(E.5.x): ORPHANED — confirm no other callers then remove in Phase E.5.x cleanup.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { CurtainWallsState } from '../store.js';

export interface UpdateCurtainWallPayload {
  readonly id: string;
  readonly updates: Record<string, unknown>;
}

type CWHandlerStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export const UpdateCurtainWallHandler: CommandHandler<UpdateCurtainWallPayload, CWHandlerStores> = {
  type: 'wall.updateCurtainWall',
  affectedStores: ['curtainwall'] as const,

  canExecute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: UpdateCurtainWallPayload,
  ): ValidationResult {
    if (!cmd.id) return { valid: false, reason: 'curtain wall id is required' };
    if (!ctx.stores.curtainwall[cmd.id]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.id}` };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<CWHandlerStores>,
    cmd: UpdateCurtainWallPayload,
  ): HandlerResult {
    return withHandlerSpan('wall.updateCurtainWall.handler', { 'pryzm.command.type': 'wall.updateCurtainWall' }, () => {
      const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, draft => {
        const cw = draft[cmd.id];
        if (!cw) {
          console.error('[wall.updateCurtainWall] curtain wall not found in store:', cmd.id);
          return;
        }
        Object.assign(cw, cmd.updates);
      });
      return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  },
};
