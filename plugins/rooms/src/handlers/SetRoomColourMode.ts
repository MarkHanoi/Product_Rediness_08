// SetRoomColourModeHandler — §ROOM-VG-CATEGORY (L-1614)
//
// The founder: "I want a category for rooms — and that the user can colour code
// by room type, size, or colour defined, all white etc."
//
// This is the bus verb behind that control. It is NOT a room mutation: it writes
// the `room` VG category (`roomColourMode`), which is resolved per view and
// persisted with the project through `vgGovernanceStore.serialize()`. See
// `packages/command-registry/src/rooms/SetRoomColourModeCommand.ts` for why the
// mode belongs on the VG cascade rather than on a room, and for the honest note
// about undo (no VG category style change is on the undo stack anywhere today).
//
// P6 — this exists so the room panel DISPATCHES instead of writing a store. The
// panel previously called `window.roomBoundaryBuilder.setVisualisationMode(...)`
// directly, which is both a direct write from UI and a change that evaporated at
// the next room rebuild because nothing durable had been recorded.
//
// `affectedStores` is `[]`: the mutation lands in `vgGovernanceStore`, which is
// not an SDK plugin store, so there are no patches for the bus to apply.

import {
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { SetRoomColourModeCommand } from './legacyCommands.js';

const MODES = [
  'detection', 'occupancy', 'area', 'custom', 'uniform', 'sync-state',
] as const;

type Mode = (typeof MODES)[number];

export interface SetRoomColourModePayload {
  readonly mode: Mode;
  /** 'view' (default) styles the active view; 'project' sets the inherited default. */
  readonly scope?: 'view' | 'project';
  /** Explicit target view. Omitted → the view that is on screen. */
  readonly viewId?: string;
}

/**
 * `runtime.viewRegistry.activeViewId` is the bridge the editor already publishes
 * the active view on (ZeroTokenChatBridge reads the same one). Callers that know
 * their view SHOULD pass `viewId` explicitly; this is the fallback, not the
 * contract.
 */
function activeViewId(): string | null {
  const w = window as unknown as { runtime?: { viewRegistry?: { activeViewId?: string | null } } };
  return w.runtime?.viewRegistry?.activeViewId ?? null;
}

function activeModelId(): string {
  const w = window as unknown as { __pryzmVgModelId?: string };
  return w.__pryzmVgModelId ?? 'model-default';
}

export class SetRoomColourModeHandler
  implements CommandHandler<SetRoomColourModePayload, Record<string, unknown>>
{
  readonly type = 'room.setColourMode';
  readonly affectedStores = [] as const;

  canExecute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomColourModePayload,
  ): ValidationResult {
    if (!MODES.includes(cmd.mode)) {
      return { valid: false, reason: `mode must be one of ${MODES.join(', ')}` };
    }
    if (cmd.scope !== undefined && cmd.scope !== 'view' && cmd.scope !== 'project') {
      return { valid: false, reason: "scope must be 'view' or 'project'" };
    }
    return { valid: true };
  }

  execute(
    _ctx: HandlerContext<Record<string, unknown>>,
    cmd: SetRoomColourModePayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', {
      'pryzm.command.type': this.type,
      'pryzm.room.colour_mode': cmd.mode,
    }, () => {
      const scope = cmd.scope ?? 'view';
      const viewId = cmd.viewId ?? activeViewId();

      const command = new SetRoomColourModeCommand(cmd.mode, scope, activeModelId(), viewId);
      const check = command.canExecute({} as never);
      if (!check.ok) {
        // ⚠ A refusal is REPORTED, never swallowed into an empty patch pair — a
        // colour-mode control that silently does nothing is the dead-verb defect
        // (C16 CA-18), and the user would read the unchanged drawing as the answer.
        throw new Error(`room.setColourMode refused: ${check.reason}`);
      }
      const result = command.execute({} as never);
      if (!result.success) {
        throw new Error('room.setColourMode: the room graphics category could not be updated.');
      }
      return { forward: [], inverse: [] };
    }); // withHandlerSpan — C10 §2
  }
}
