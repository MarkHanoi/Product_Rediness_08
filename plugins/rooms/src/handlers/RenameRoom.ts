// RenameRoomHandler — F-1.3 migration bridge.
// Exfiltrates commandManager.execute(RenameRoomCommand) from apps/editor/src/.
// TODO(F-1.4): replace with authoritative room-store Immer update (merge into SetRoomName).

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { RenameRoomCommand  } from '@pryzm/command-registry';

export interface RenameRoomPayload {
  readonly roomId: string;
  readonly name?: string;
  readonly roomNumber?: string;
}

export const RenameRoomHandler: CommandHandler<RenameRoomPayload, Record<string, unknown>> = {
  type: 'room.rename',
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RenameRoomPayload,
  ): ValidationResult {
    if (!cmd.roomId) return { valid: false, reason: 'roomId is required' };
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: RenameRoomPayload,
  ): HandlerResult {
    return withHandlerSpan('room.rename.handler', { 'pryzm.command.type': 'room.rename' }, () => {
      if (!(window as any).__pryzmInitComplete) {
        console.error('[room.rename.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
      if (cm) {
        try {
          cm.execute(new RenameRoomCommand(cmd.roomId, { name: cmd.name, roomNumber: cmd.roomNumber }));
        } catch (e) {
          console.error('[room.rename.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
