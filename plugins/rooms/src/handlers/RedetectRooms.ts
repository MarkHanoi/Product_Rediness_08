// RedetectRoomsHandler — 'rooms.redetect' command-bus handler (Phase E.5.x migration).
//
// Migration bridge (Phase E.5.x → Phase F.room-detection):
//   This handler bridges the PRYZM 2 command bus to the existing PRYZM 1
//   RoomDetectionEngine infrastructure.  When runtime.bus.executeCommand(
//   'rooms.redetect', payload) fires (e.g. from BatchCoordinator._executeFinalSweep),
//   this handler dispatches a CustomEvent ('pryzm-bus-rooms-redetect') that the
//   engine layer (engineLauncher.ts) listens to and converts into the actual
//   ReDetectRoomsCommand execution.
//
//   This bridge will be removed when the PRYZM 2 spatial room-detection producer
//   lands in Phase F (Sprint 90+), allowing this handler to invoke the detection
//   algorithm directly as a pure Immer patch without touching engine-layer code.
//
// Why CustomEvent (not a direct import)?
//   plugins/rooms is at architecture layer L4; ReDetectRoomsCommand and
//   RoomDetectionEngine live in src/engine/subsystems/ (L7).  A direct import
//   from L4 → L7 would invert the layer rule from ADR-002 and introduce a
//   circular dependency between the plugin package and the engine.  The
//   CustomEvent dispatch is the approved L4→L7 escape hatch used throughout
//   PRYZM 1 for the same reason.
//
// affectedStores: [] — no Immer patches produced here; all RoomStore mutations
//   happen through the PRYZM 1 ReDetectRoomsCommand path triggered by the event.
//
// Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §P2f

import type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  ValidationResult,
} from '@pryzm/plugin-sdk';
import { withHandlerSpan } from '@pryzm/plugin-sdk';

export interface RedetectRoomsPayload {
  readonly levelId: string;
  /** Defaults to 0 when omitted (C11 §6.3 event-driven path). */
  readonly elevation?: number;
  /** Defaults to 3 m when omitted (C11 §6.3 event-driven path). */
  readonly height?: number;
}

export class RedetectRoomsHandler
  implements CommandHandler<RedetectRoomsPayload>
{
  readonly type = 'rooms.redetect';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext,
    cmd: RedetectRoomsPayload,
  ): ValidationResult {
    if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
      return { valid: false, reason: 'rooms.redetect: levelId must be a non-empty string' };
    }
    if (cmd.elevation !== undefined && typeof cmd.elevation !== 'number') {
      return { valid: false, reason: 'rooms.redetect: elevation must be a number when provided' };
    }
    if (cmd.height !== undefined && (typeof cmd.height !== 'number' || cmd.height <= 0)) {
      return { valid: false, reason: 'rooms.redetect: height must be a positive number when provided' };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext,
    cmd: RedetectRoomsPayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    // MIGRATION BRIDGE: Dispatch a CustomEvent so the engine layer (which holds
    // references to the PRYZM 1 RoomDetectionEngine and CommandManager) can run
    // ReDetectRoomsCommand.  Keeps the plugin layer (L4) free of L7 imports and
    // avoids the circular plugins/rooms ← src/engine dep that would violate ADR-002.
    try {
      // Apply C11 §6.3 defaults: event-driven callers omit elevation/height;
      // explicit callers (BatchCoordinator) pass accurate level values.
      const elevation = cmd.elevation ?? 0;
      const height    = cmd.height    ?? 3;
      window.dispatchEvent(
        new CustomEvent('pryzm-bus-rooms-redetect', { // TODO(TASK-15)
          detail: {
            levelId: cmd.levelId,
            elevation,
            height,
          },
        }),
      );
    } catch (err) {
      console.error('[RedetectRoomsHandler] Failed to dispatch bridge event:', err);
    }
    // No Immer patches — room-store mutations happen through the PRYZM 1 path.
    return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
