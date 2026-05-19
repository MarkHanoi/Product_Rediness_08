// UpdateWallDimensionsHandler — §TASK-07-PHASE-B: migrated from F-1.3 commandManager
// bridge to authoritative Immer produceCommand so the RingBufferUndoStack receives
// real inverse patches and Ctrl+Z correctly reverts wall dimension changes.
//
// Pattern mirrors UpdateSlab.ts, UpdateSlabPolygon.ts, UpdateCurtainWall.ts,
// and SetWallDimensionsHandler — all use produceCommand<WallsState> for a single
// atomic Immer mutation → one forward + one inverse patch per edit.
//
// The legacy UpdateWallDimensionsCommand is now ORPHANED for the bus path.
// Direct window.commandManager.execute(new UpdateWallDimensionsCommand(...)) calls
// from legacy sites still function; only the bus handler path is migrated.
//
// TODO(F-1.4): unify wall.setDimensions and wall.updateDimensions into one handler.
//
// Contract compliance:
//   C20 §3  — Ring Buffer is the single undo stack; bridge handlers must produce patches.
//   C14 §3 LP-04 — use produceWithPatches (via produceCommand), not manual snapshots.
//   P6      — commands are the only mutation path; no direct store writes from handlers.
//   P8      — withHandlerSpan wraps the hot path.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WallDimensionsError, WallNotFoundError } from '../errors.js';
import type { WallsState } from '../store.js';

export interface UpdateWallDimensionsPayload {
  readonly wallId: string;
  readonly height?: number;
  readonly thickness?: number;
}

type WallHandlerStores = Readonly<{ wall: WallsState } & Record<string, unknown>>;

export const UpdateWallDimensionsHandler: CommandHandler<UpdateWallDimensionsPayload, WallHandlerStores> = {
  type: 'wall.updateDimensions',
  affectedStores: ['wall'] as const,

  canExecute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: UpdateWallDimensionsPayload,
  ): ValidationResult {
    if (!cmd.wallId) {
      return { valid: false, reason: 'wallId is required' };
    }
    if (cmd.height === undefined && cmd.thickness === undefined) {
      return { valid: false, reason: 'at least one of height / thickness is required' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.thickness !== undefined && (!Number.isFinite(cmd.thickness) || cmd.thickness < 0.05)) {
      return { valid: false, reason: 'thickness must be ≥ 0.05 m' };
    }
    if (!Object.prototype.hasOwnProperty.call(ctx.stores.wall, cmd.wallId)) {
      return { valid: false, reason: `wall not found: ${cmd.wallId}` };
    }
    return { valid: true };
  },

  execute(
    ctx: HandlerContext<WallHandlerStores>,
    cmd: UpdateWallDimensionsPayload,
  ): HandlerResult {
    return withHandlerSpan('wall.updateDimensions.handler', { 'pryzm.command.type': 'wall.updateDimensions' }, () => {
      const wall = ctx.stores.wall[cmd.wallId];
      if (wall === undefined) throw new WallNotFoundError(cmd.wallId);

      // Race-defensive re-check (mirrors SetWallDimensionsHandler double-guard pattern).
      if (cmd.height !== undefined && cmd.height <= 0) {
        throw new WallDimensionsError('height must be > 0');
      }
      if (cmd.thickness !== undefined && cmd.thickness < 0.05) {
        throw new WallDimensionsError('thickness must be ≥ 0.05 m');
      }

      const [next, forward, inverse] = produceCommand<WallsState>(ctx.stores.wall, draft => {
        const w = draft[cmd.wallId];
        if (w === undefined) return;
        if (cmd.height    !== undefined) w.height    = cmd.height;
        if (cmd.thickness !== undefined) w.thickness = cmd.thickness;
      });

      return { forward, inverse, nextStates: { wall: next } };
    }); // withHandlerSpan — C10 §2 / P8
  },
};
