// CursorRenderer — paints remote-peer cursors into a Canvas2D context.
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S44 lines
// 322-337 ("Implementation Detail — Multiplayer cursors"):
//
//   "The cursor renderer plugs into every CanvasHost subclass: Scene3DHost,
//    PlanViewCanvasHost, SectionViewCanvasHost, SheetEditorHost.  Per
//    [ADR 0025-multi-view-sync] the cursor is rendered in the view that
//    the peer's `activeViewId` names; when a peer switches view, their
//    cursor disappears from the old view and appears in the new one
//    within one frame."
//
// DESIGN
// ─────────────────────────────────────────────────────────────────────────────
// One CursorRenderer instance per host.  Each instance:
//   1. Holds the host's `viewId` (e.g. `'main-3d'`, `'plan-L1'`,
//      `'section-A'`, `'sheet-1'`).
//   2. Holds a `localClientID` so the local peer's own cursor is NOT
//      painted (you don't paint your own mouse).
//   3. Provides a single `render(ctx, awareness)` method that the host
//      calls once per frame, after its main draw, and before any
//      selection-highlight overlay.
//
// The host owns the camera transform (the cursor coords are stored in
// "the active view's local coords" per spec line 293).  For the plan/
// section/sheet hosts that's already paper-mm world space and the host
// applies its camera transform BEFORE calling render.  For the 3D host
// (which renders via THREE), the cursor is painted on a sibling overlay
// <canvas> in screen-space coords — the editor publishes screen-space
// (clientX/clientY) cursor positions when activeViewId='main-3d'.
//
// PURE: no THREE, no DOM beyond the passed-in CanvasRenderingContext2D.

import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';

export interface CursorHostBinding {
  /** The view this host represents (matches PryzmAwarenessState.activeViewId). */
  readonly viewId: string;
  /** The local client's awareness clientID — used to skip self. */
  readonly localClientID: number;
}

export interface CursorRendererOptions {
  /** Cursor arrow size in CSS pixels.  Default 16. */
  readonly size?: number;
  /** Idle threshold in milliseconds — peers whose `lastActivity` is older
   *  than this fade their cursor.  Default 30 000 (30 s). */
  readonly idleThresholdMs?: number;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
}

const DEFAULT_SIZE = 16;
const DEFAULT_IDLE_MS = 30_000;

/** CursorRenderer — one instance per CanvasHost.  Subscribes to a single
 *  PryzmAwareness; renders the subset of peers whose activeViewId matches
 *  the host's viewId. */
export class CursorRenderer {
  private readonly viewId: string;
  private readonly localClientID: number;
  private readonly size: number;
  private readonly idleThresholdMs: number;
  private readonly now: () => number;

  constructor(binding: CursorHostBinding, opts: CursorRendererOptions = {}) {
    this.viewId = binding.viewId;
    this.localClientID = binding.localClientID;
    this.size = opts.size ?? DEFAULT_SIZE;
    this.idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_MS;
    this.now = opts.now ?? Date.now;
  }

  /** Paint every visible peer cursor.  Call once per frame, after the
   *  host's main draw.  The ctx must already have the host's camera
   *  transform applied (so cursor.x/y in view-local coords land at the
   *  correct screen pixel). */
  render(ctx: CanvasRenderingContext2D, awareness: PryzmAwareness): number {
    const states = awareness.getStates();
    let painted = 0;
    const now = this.now();
    for (const [clientID, state] of states) {
      if (clientID === this.localClientID) continue;          // skip self
      if (state.activeViewId !== this.viewId) continue;       // wrong view
      if (state.cursor === null) continue;                    // no cursor
      const idle = now - state.lastActivity;
      const alpha = idle >= this.idleThresholdMs ? 0.3 : 1.0;
      const color = peerColorFor(state.userId);
      this.drawCursor(ctx, state.cursor.x, state.cursor.y, state.displayName, color, alpha);
      painted++;
    }
    return painted;
  }

  /** Single-cursor primitive — exposed for the bench + visual-diff harness. */
  drawCursor(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    label: string,
    color: string,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Arrow body — Microsoft-style cursor outline rendered as a path.
    const s = this.size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x + s * 0.30, y + s * 0.75);
    ctx.lineTo(x + s * 0.55, y + s * 1.20);
    ctx.lineTo(x + s * 0.70, y + s * 1.10);
    ctx.lineTo(x + s * 0.45, y + s * 0.65);
    ctx.lineTo(x + s * 0.75, y + s * 0.55);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label badge — colored pill with white text, drawn below+right of cursor.
    const padX = 6, padY = 3;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const textW = ctx.measureText(label).width;
    const badgeX = x + s * 0.6;
    const badgeY = y + s + 4;
    const badgeW = textW + padX * 2;
    const badgeH = 12 + padY * 2;
    roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(label, badgeX + padX, badgeY + padY);

    ctx.restore();
  }
}

// ─── peerColorFor ─────────────────────────────────────────────────────────
//
// Deterministic per-userId color.  Hashes the userId to a hue in
// [0, 360), holds saturation + lightness fixed for legibility against
// both light + dark canvas backgrounds.

const PEER_COLOR_SATURATION = 70;  // %
const PEER_COLOR_LIGHTNESS = 50;   // %

export function peerColorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  // Use the comma-separated legacy hsl() form — universally parsed (CSS
  // Color Module 4's space-separated syntax trips some older parsers and
  // happy-dom's CSSStyleDeclaration in particular).
  return `hsl(${hue}, ${PEER_COLOR_SATURATION}%, ${PEER_COLOR_LIGHTNESS}%)`;
}

// ─── Internals ────────────────────────────────────────────────────────────

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Re-export the awareness state shape for plugin callers that don't want to
 *  reach all the way back into @pryzm/sync-client. */
export type { PryzmAwarenessState };
