// w11-ghost-layer — Wave 11.
//
// Spec: SPEC-30 §6 wave 11; PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D6.
// Ghost layer for elements currently being edited by other peers (CRDT
// pending-merge state).  PRYZM 2 addition over PRYZM 1: the ghost
// layer is what lets multiple users edit the same view without
// confusion — peer-edited elements halftone instead of disappearing
// or jittering.
//
// PRYZM 2 SEMANTICS:
//
//   • When `activeView.ghostLayerActive === true`, elements with
//     `pendingPeerEdit === true` are halftoned (visible: true,
//     halftone: true).  This is the visual signal "another user is
//     working on this; don't bump them".
//   • When `ghostLayerActive` is `false` / `undefined`, peer-edits
//     render as normal — the wave passes through.  This is the
//     fallback for offline mode where there are no peers.
//   • `pendingPeerEdit === false` / `undefined` → pass through.
//   • Note: this wave does NOT hide anything — it can only halftone.
//     Hiding peer-edits would create the "element vanishes" UX bug
//     this wave was added to fix (bug #14502 in S46 retro).
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • An element that is halftoned by an earlier wave (e.g. wave-7
//     phase demolished) AND pending-peer-edit: the chain runner
//     preserves the strongest halftone signal; wave-11 sets the flag
//     idempotently.  No double-halftone math needed.
//   • Ghost layer + temporary isolation (wave-8) interaction: wave-8
//     runs first; isolation hides all non-isolated elements regardless
//     of ghost state.  This is intentional — isolation is the user's
//     explicit focus.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w11GhostLayer(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  if (!activeView.ghostLayerActive) {
    return { visible: true, reason: 'ghost-layer-inactive' };
  }
  if (!element.pendingPeerEdit) {
    return { visible: true, reason: 'no-pending-peer-edit' };
  }
  return { visible: true, halftone: true, reason: 'pending-peer-edit-ghost' };
}
