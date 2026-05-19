// w05-opening-culling — Wave 5.
//
// Spec: SPEC-30 §6 wave 5.  Openings (doors / windows) are culled when
// their host wall is hidden — an opening hovering in space without its
// wall is meaningless and was the #1 visual bug in PRYZM 1's plan-view
// renderer.
//
// PRYZM 1 SEMANTICS (verbatim):
//
//   • If `element.hostWallId` is set, look up the host wall's visibility
//     from `ctx.resolvedVisibility`.
//       - Host visible → opening continues to render (visible: true).
//       - Host hidden  → opening short-circuits (visible: false).
//       - Host not yet resolved → visible by default (same fall-back as
//         wave-4; the runner resolves walls before openings in the same pass).
//   • If `element.hostWallId` is null, this is not an opening — no-op.
//
// EDGE CASES PRESERVED
// ─────────────────────────────────────────────────────────────────────────────
//   • An opening whose host wall is HALFTONED: PRYZM 1 culling was
//     binary — halftoned host => opening fully visible (NOT halftoned).
//     This was a pragmatic choice ("openings are too small to be useful
//     halftoned"); preserved here.  Bug #11203 was filed against this
//     and rejected as "by design".
//   • An opening with `hostWallId` pointing at an unknown element ID:
//     resolvedVisibility lookup returns undefined; we fall through to
//     "pre-resolved → visible by default".  This was bug #11580 (orphan
//     opening, host wall deleted in another peer's session) — the fix
//     is a separate cleanup pass at L4 sync (S46 D8); the wave preserves
//     visibility so the user can see + delete the orphan.

import type { VisibilityWaveContext, VisibilityResult } from './types.js';

export function w05OpeningCulling(ctx: VisibilityWaveContext): VisibilityResult {
  const { element, resolvedVisibility } = ctx;
  if (!element.hostWallId) {
    return { visible: true, reason: 'not-an-opening' };
  }
  if (!resolvedVisibility.has(element.hostWallId)) {
    return { visible: true, reason: 'host-wall-pre-resolved' };
  }
  const hostVisible = resolvedVisibility.get(element.hostWallId) ?? true;
  if (!hostVisible) {
    return { visible: false, reason: 'host-wall-hidden' };
  }
  return { visible: true, reason: 'host-wall-visible' };
}
