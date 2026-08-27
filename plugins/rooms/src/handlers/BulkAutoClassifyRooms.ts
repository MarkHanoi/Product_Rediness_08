// BulkAutoClassifyRoomsHandler — §ROOMTYPE142.
// Bridges `room.autoClassify.batch` to the legacy `BulkAutoClassifyRoomsCommand`
// via `window.commandManager`, exactly like `RenameRoomHandler` /
// `BulkUpdateKitchenMaterialHandler` before it. One bus call, one legacy
// command, one undo entry for every room in the patch list.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
// §ROOM-ONE-LEGACY-SEAM — reach @pryzm/command-registry through the plugin's
// single re-export seam (legacyCommands.ts), not a new direct import (see that
// file's header: eleven direct edges were consolidated into one on purpose).
import { BulkAutoClassifyRoomsCommand } from './legacyCommands.js';

export interface BulkAutoClassifyRoomsPatch {
  readonly roomId: string;
  readonly name: string;
  readonly occupancyType: string;
  // §DEPT153 (L-12540+) — optional: absent means "leave this room's department
  // alone" (e.g. it is already human-authored). See BulkAutoClassifyRoomsCommand.
  readonly department?: string;
}

export interface BulkAutoClassifyRoomsPayload {
  readonly patches: readonly BulkAutoClassifyRoomsPatch[];
}

function isValidPatches(patches: unknown): patches is readonly BulkAutoClassifyRoomsPatch[] {
  if (!Array.isArray(patches)) return false;
  return patches.every((p) =>
    typeof p === 'object' && p !== null &&
    typeof (p as any).roomId === 'string' && (p as any).roomId.length > 0 &&
    typeof (p as any).name === 'string' && (p as any).name.length > 0 &&
    typeof (p as any).occupancyType === 'string' && (p as any).occupancyType.length > 0 &&
    // §DEPT153 — optional, but must be a string when present.
    ((p as any).department === undefined || typeof (p as any).department === 'string'),
  );
}

export const BulkAutoClassifyRoomsHandler: CommandHandler<BulkAutoClassifyRoomsPayload, Record<string, unknown>> = {
  type: 'room.autoClassify.batch',
  // Bridges to the legacy command manager — mutates NO plugin store.
  affectedStores: [] as const,

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkAutoClassifyRoomsPayload,
  ): ValidationResult {
    if (!isValidPatches(cmd.patches)) {
      return { valid: false, reason: 'patches must be a list of { roomId, name, occupancyType }' };
    }
    if (cmd.patches.length === 0) {
      return { valid: false, reason: 'patches is empty — nothing to rename' };
    }
    return { valid: true };
  },

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: BulkAutoClassifyRoomsPayload,
  ): HandlerResult {
    return withHandlerSpan('room.autoClassify.batch.handler', { 'pryzm.command.type': 'room.autoClassify.batch' }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        throw new Error(
          'room.autoClassify.batch: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): { success?: boolean; info?: string[]; error?: string } | void } })
        .commandManager;
      if (!cm) {
        throw new Error(
          'room.autoClassify.batch: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      let result: { success?: boolean; info?: string[]; error?: string } | void;
      try {
        result = cm.execute(new BulkAutoClassifyRoomsCommand(
          cmd.patches.map((p) => ({
            roomId: p.roomId,
            name: p.name,
            occupancyType: p.occupancyType as never,
            // §DEPT153 — forwarded only when the caller decided to write it.
            ...(p.department !== undefined ? { department: p.department } : {}),
          })),
        ));
      } catch (e) {
        console.error('[room.autoClassify.batch.handler] bridge failed:', e);
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (result && result.success === false) {
        const reason = result.info?.[0] ?? result.error ?? 'no reason given';
        console.warn(`[room.autoClassify.batch.handler] BulkAutoClassifyRoomsCommand refused: ${reason}`);
        throw new Error(`room.autoClassify.batch: refused — ${reason}`);
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  },
};
