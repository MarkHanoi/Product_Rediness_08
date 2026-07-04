// SetRoomMaterialHandler — change the floor-fill colour / material (S25).
//
// §FIX-ROOM-SIBLING-HANDLERS-STORE (L-79) — LEGACY BRIDGE to the general
// `UpdateRoomCommand` (via `window.commandManager`), mirroring `SetRoomNameHandler`
// (§FIX-ROOM-SETNAME-STORE / L-75). See that file for the full root-cause note:
// the previous `affectedStores:['room']` mismatched the bus storeKey `'rooms'` and
// threw "required store 'room' is missing" (ADR-002 §3), and the mutation targeted
// the disconnected plugin `RoomsState`.
//
// The room's visible plan/3-D fill in the legacy world is the top-level `colour`
// field (`RoomColourSystem` override) — that is what a "material colour" edit
// changes and what the renderer + persistence read. So `materialColor` is
// forwarded as `UpdateRoomCommand(roomId, { colour })`. The uniform material path
// (`MaterialDispatch.ts`) only sends `materialColor` for rooms; a catalogue
// `materialId` has no top-level legacy room field, so an id-only payload is a
// documented no-op here (no legacy analog to write). `affectedStores` is `[]`
// (the legacy commandManager owns the undo step).
//
// TODO(F-1.4): replace with an authoritative plugin-store Immer update once the
// detected-room world is migrated off the legacy RoomStore.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { UpdateRoomCommand } from '@pryzm/command-registry';

export interface SetRoomMaterialPayload {
  readonly roomId: string;
  readonly materialId?: string;
  readonly materialColor?: string;
}

export class SetRoomMaterialHandler
  implements CommandHandler<SetRoomMaterialPayload, Record<string, unknown>>
{
  readonly type = 'room.setMaterial';
  // Bridges to the legacy command manager — mutates NO plugin store.
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomMaterialPayload,
  ): ValidationResult {
    if (typeof cmd.roomId !== 'string' || cmd.roomId.length === 0) {
      return { valid: false, reason: 'roomId must be a non-empty string' };
    }
    if (cmd.materialId === undefined && cmd.materialColor === undefined) {
      return { valid: false, reason: 'at least one of materialId / materialColor must be provided' };
    }
    if (cmd.materialColor !== undefined && cmd.materialColor.length === 0) {
      return { valid: false, reason: 'materialColor must be non-empty when provided' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomMaterialPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        console.error('[room.setMaterial.handler] Engine not yet initialised — command ignored');
        return { forward: [], inverse: [] };
      }
      // Only the colour maps to a legacy top-level room field; a catalogue
      // materialId alone has no legacy analog (see header) → nothing to forward.
      if (cmd.materialColor === undefined) {
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      if (cm) {
        try {
          cm.execute(new UpdateRoomCommand(cmd.roomId, { colour: cmd.materialColor } as never));
        } catch (e) {
          console.error('[room.setMaterial.handler] bridge failed:', e);
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
