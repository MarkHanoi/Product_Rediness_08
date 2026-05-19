/**
 * multiplayer intent — command IDs for the multiplayer/awareness plugin (Wave 11 recipe).
 *
 * Spec: PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md §S44 (cursors + peer list).
 * Recipe status: [. H . . .] — handlers + intent now present.
 */

export const MULTIPLAYER_COMMANDS = {
  /** A peer joined the session (awareness state arrived). */
  PEER_JOIN: 'multiplayer.peer.join',
  /** A peer left the session (awareness state disappeared). */
  PEER_LEAVE: 'multiplayer.peer.leave',
  /** A peer's cursor moved to a new view-local coordinate. */
  CURSOR_MOVE: 'multiplayer.cursor.move',
  /** A peer switched the active view. */
  VIEW_SWITCH: 'multiplayer.view.switch',
  /** A peer acquired or released an element lock. */
  LOCK_CHANGE: 'multiplayer.lock.change',
  /** Local user requests to lock an element for exclusive editing. */
  LOCK_REQUEST: 'multiplayer.lock.request',
  /** Local user releases an element lock. */
  LOCK_RELEASE: 'multiplayer.lock.release',
} as const;

export type MultiplayerCommandId = typeof MULTIPLAYER_COMMANDS[keyof typeof MULTIPLAYER_COMMANDS];

export interface PeerJoinPayload {
  clientID: number;
  displayName: string;
  activeViewId: string;
}

export interface CursorMovePayload {
  clientID: number;
  viewId: string;
  x: number;
  y: number;
}

export interface LockChangePayload {
  clientID: number;
  elementId: string;
  acquired: boolean;
}
