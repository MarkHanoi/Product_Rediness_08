// @pryzm/plugin-multiplayer — public barrel.
//
// L7 plugin hosting the visible side of awareness:
//   • CursorRenderer (Canvas2D) — paints remote-peer cursors into any
//     CanvasRenderingContext2D, gated on `peer.activeViewId === host.viewId`.
//     Used by 3D (overlay canvas), plan-view, section-view, and sheet-editor.
//   • PeerListPanel — vanilla-DOM sidebar listing every connected peer
//     with their displayName, active view chip, active tool chip, and a
//     "lastActivity" idle indicator.
//   • ViewChip — small DOM helper used by PeerListPanel and (later) the
//     view-tab strip.
//   • peerColorFor — deterministic per-userId color so the same user has
//     the same cursor color across reloads + clients.
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S44 lines
// 285-376 (cursors + peer list + view chip + active-tool indicator).

export {
  CursorRenderer,
  peerColorFor,
  type CursorRendererOptions,
  type CursorHostBinding,
} from './cursor.js';

export {
  PeerListPanel,
  type PeerListPanelOptions,
} from './peer-list.js';

export {
  renderViewChip,
  type ViewChipOptions,
} from './view-chip.js';

export {
  LockBadgeRenderer,
  collectBadgeEntries,
  type LockUiHostBinding,
  type LockBadgeRendererOptions,
  type LockBadgeEntry,
  type ElementBbox,
  type BboxResolver,
} from './lock-ui.js';

// Wave 11 recipe completion — handlers + intent.
export { MULTIPLAYER_COMMANDS, registerMultiplayerHandlers } from './handlers/index.js';
export type {
  MultiplayerCommandId,
  MultiplayerHandlerDeps,
  MultiplayerHandlerType,
} from './handlers/index.js';
export type {
  PeerJoinPayload,
  CursorMovePayload,
  LockChangePayload,
} from './intent.js';
