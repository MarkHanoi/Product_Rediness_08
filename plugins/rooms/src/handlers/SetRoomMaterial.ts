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
// `materialId` has no top-level legacy room field.
//
// §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — that used to make an id-only payload a
// "documented no-op": it returned `{forward: [], inverse: []}` and REPORTED SUCCESS.
// Documented or not, a no-op that reports success is a lie to the user, who had already
// seen the inspector repaint the fill. It is now an explicit refusal carrying its reason
// (`ROOM_MATERIAL_ID_UNSUPPORTED`).
//
// `affectedStores` is `[]` (the legacy commandManager owns the undo step).
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

/**
 * §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — a catalogue `materialId` has no legacy
 * room field, so this handler used to `return { forward: [], inverse: [] }` and report
 * SUCCESS. The inspector had already repainted the fill live, so the user saw the new
 * material, saved, reloaded, and it was gone. That is the Class-A dead verb.
 *
 * The refusal is phrased in the `MATERIAL_ID_UNSUPPORTED_REASON` idiom already
 * established at `apps/editor/src/ui/property-inspector/MaterialDispatch.ts:191-193`
 * (the colour applies end to end; the catalogue id does not). It cannot be IMPORTED from
 * there — that table lives at L7 and this is an L6 plugin — so the wording is mirrored
 * and the source is cited. The companion half of this fix adds
 * `supportsMaterialId: false` to the `room` route so the dispatcher stops sending a
 * `materialId` here at all, and surfaces this reason to the user instead.
 */
const ROOM_MATERIAL_ID_UNSUPPORTED =
  'A room’s visible plan / 3-D fill is the top-level `colour` field (the RoomColourSystem '
  + 'override), which is what the renderer and persistence read. There is no legacy room '
  + 'field for a catalogue material id, so picking a library material would write nothing. '
  + 'Pick a colour override instead — that applies end to end.';

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
    // §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — refuse the catalogue id OUT LOUD rather
    // than accepting it and returning an empty patch pair. A refusal keeps its reason;
    // an empty patch pair is indistinguishable from "applied, nothing to change".
    if (cmd.materialId !== undefined) {
      return { valid: false, reason: ROOM_MATERIAL_ID_UNSUPPORTED };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomMaterialPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      if (!(window as unknown as { __pryzmInitComplete?: boolean }).__pryzmInitComplete) {
        // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — an empty patch pair is
        // INDISTINGUISHABLE from "applied, nothing to change". Reporting success
        // for a command that was "ignored" is the Class-A dead verb, one layer
        // over: the user is told the model changed and it did not. Throw so the bus
        // rejects with a reason (C03 §4.6 U-4).
        throw new Error(
          'room.setMaterial: the engine is not initialised yet, so nothing was changed. '
          + 'Wait for the project to finish loading and try again.',
        );
      }
      // Only the colour maps to a legacy top-level room field; a catalogue
      // materialId alone has no legacy analog (see header) → nothing to forward.
      if (cmd.materialColor === undefined) {
        return { forward: [], inverse: [] };
      }
      const cm = (window as unknown as { commandManager?: { execute(cmd: unknown, options?: unknown): void } })
        .commandManager;
      // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — no commandManager means the ONLY path to
      // authoritative state is absent. That is a failure, not a no-op.
      if (!cm) {
        throw new Error(
          'room.setMaterial: the legacy command manager is not available, so the change could not be applied.',
        );
      }
      if (cm) {
        try {
          cm.execute(new UpdateRoomCommand(cmd.roomId, { colour: cmd.materialColor } as never));
        } catch (e) {
          // §FIX-DEAD-VERB-ROOM-BRIDGE (W3-3) — this used to log and return an empty
          // patch pair, i.e. report SUCCESS for a bridge that threw. Re-thrown so the
          // caller learns the room.setMaterial did not happen.
          console.error('[room.setMaterial.handler] bridge failed:', e);
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
