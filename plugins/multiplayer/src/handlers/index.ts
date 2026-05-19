/**
 * multiplayer handler set (Wave 11 recipe completion).
 *
 * Bridges awareness-protocol events to commandBus handlers so
 * multiplayer can be registered as a compliant L7 plugin.
 *
 * Spec: PHASE-2D §S44 awareness beta.
 * Recipe status: [. H . . .] — handlers now wired.
 */

import type { CommandBus } from '@pryzm/plugin-sdk';
import { MULTIPLAYER_COMMANDS } from '../intent.js';
import type {
  PeerJoinPayload,
  CursorMovePayload,
  LockChangePayload,
} from '../intent.js';

export type { MultiplayerCommandId } from '../intent.js';
export { MULTIPLAYER_COMMANDS };

/** Deps the multiplayer handler set receives from the host at bootstrap. */
export interface MultiplayerHandlerDeps {
  /** Called when a peer joins. Host re-renders PeerListPanel. */
  onPeerJoin?(payload: PeerJoinPayload): void;
  /** Called when a peer leaves. Host removes them from PeerListPanel. */
  onPeerLeave?(clientID: number): void;
  /** Called when a peer cursor moves. Host re-renders cursor overlays. */
  onCursorMove?(payload: CursorMovePayload): void;
  /** Called on lock change. Host updates lock-badge overlay. */
  onLockChange?(payload: LockChangePayload): void;
}

export const MULTIPLAYER_HANDLER_TYPES = [
  MULTIPLAYER_COMMANDS.PEER_JOIN,
  MULTIPLAYER_COMMANDS.PEER_LEAVE,
  MULTIPLAYER_COMMANDS.CURSOR_MOVE,
  MULTIPLAYER_COMMANDS.LOCK_CHANGE,
] as const;

export type MultiplayerHandlerType = typeof MULTIPLAYER_HANDLER_TYPES[number];

export function registerMultiplayerHandlers(
  bus: CommandBus,
  deps: MultiplayerHandlerDeps = {},
): void {
  bus.register(MULTIPLAYER_COMMANDS.PEER_JOIN, async (cmd) => {
    deps.onPeerJoin?.(cmd.payload as PeerJoinPayload);
  });

  bus.register(MULTIPLAYER_COMMANDS.PEER_LEAVE, async (cmd) => {
    const payload = cmd.payload as { clientID: number };
    deps.onPeerLeave?.(payload.clientID);
  });

  bus.register(MULTIPLAYER_COMMANDS.CURSOR_MOVE, async (cmd) => {
    deps.onCursorMove?.(cmd.payload as CursorMovePayload);
  });

  bus.register(MULTIPLAYER_COMMANDS.LOCK_CHANGE, async (cmd) => {
    deps.onLockChange?.(cmd.payload as LockChangePayload);
  });
}
