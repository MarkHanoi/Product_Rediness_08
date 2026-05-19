// LockBadgeRenderer — paints a "padlock" badge next to elements held under a
// soft-lock by another peer (S45 D4).
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S45 lines
// 444-458.  Mirrors the `CursorRenderer` design pattern from §S44 — same
// pure-Canvas2D contract, same `(viewId, localClientID)` parameterisation,
// same per-frame `render(ctx, awareness, bboxResolver)` entry point.
//
// DESIGN
// ─────────────────────────────────────────────────────────────────────────────
// One LockBadgeRenderer instance per CanvasHost.  Each instance:
//   1. Holds the host's `viewId` and `localClientID`.
//   2. Holds an injected `bboxResolver(elementId, viewId)` — the multiplayer
//      plugin doesn't know the geometry of any element, so the host
//      provides a function that maps an elementId to its bounding box in
//      the host's view-local coords.  Returns `null` if the element isn't
//      visible in this view (different level scope, halftoned, etc).
//   3. Provides a single `render(ctx, awareness, bboxResolver)` method that
//      the host calls once per frame, after the cursor pass.
//
// The badge is a small padlock icon rendered top-right of the bbox plus a
// label badge ("Bob") below.  Same color scheme as cursors via `peerColorFor`.
//
// Per spec §S45 line 452 ("don't badge own locks"), the local peer's own
// `heldLocks` are skipped.
//
// PURE: no THREE, no DOM beyond the passed-in CanvasRenderingContext2D.

import type { PryzmAwareness, PryzmAwarenessState } from '@pryzm/plugin-sdk';
import { peerColorFor } from './cursor.js';

export interface LockUiHostBinding {
  /** The view this host represents (matches PryzmAwarenessState.activeViewId). */
  readonly viewId: string;
  /** The local client's awareness clientID — used to skip self. */
  readonly localClientID: number;
}

export interface ElementBbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Per-element bbox resolver injected by the host.  Returns `null` if the
 *  element is not present in this view (e.g. a wall hidden by visibility-
 *  intent waves, or an element from a different level scope). */
export type BboxResolver = (elementId: string, viewId: string) => ElementBbox | null;

export interface LockBadgeRendererOptions {
  /** Padlock icon size in CSS pixels.  Default 14. */
  readonly size?: number;
  /** Optional clock injection for tests. */
  readonly now?: () => number;
}

export interface LockBadgeEntry {
  readonly elementId: string;
  readonly holderUserId: string;
  readonly holderDisplayName: string;
}

const DEFAULT_SIZE = 14;

/** Collect every (elementId, holder) that should be badged in `viewId`,
 *  excluding the local peer's own locks.  Pure, exposed for tests + the
 *  bench harness. */
export function collectBadgeEntries(
  awareness: PryzmAwareness,
  viewId: string,
  localClientID: number,
): readonly LockBadgeEntry[] {
  const out: LockBadgeEntry[] = [];
  const seen = new Set<string>();
  // Find the local peer's userId so we can skip it even for entries that
  // arrive via a different clientID (reconnect — same user, new client).
  let localUserId: string | null = null;
  const states = awareness.getStates();
  for (const [clientID, state] of states) {
    if (clientID === localClientID) {
      localUserId = (state as PryzmAwarenessState).userId;
      break;
    }
  }
  for (const [clientID, raw] of states) {
    const state = raw as PryzmAwarenessState;
    if (clientID === localClientID) continue;          // skip self by clientID
    if (state.userId === localUserId) continue;         // skip self by userId
    if (state.heldLocks.length === 0) continue;
    for (const elementId of state.heldLocks) {
      if (seen.has(elementId)) continue;
      seen.add(elementId);
      out.push({
        elementId,
        holderUserId: state.userId,
        holderDisplayName: state.displayName,
      });
    }
  }
  // Stable order — by elementId — so the bench's snapshot diff is deterministic.
  out.sort((a, b) => a.elementId.localeCompare(b.elementId));
  return out;
}

export class LockBadgeRenderer {
  private readonly viewId: string;
  private readonly localClientID: number;
  private readonly size: number;
  private readonly now: () => number;

  constructor(binding: LockUiHostBinding, opts: LockBadgeRendererOptions = {}) {
    this.viewId = binding.viewId;
    this.localClientID = binding.localClientID;
    this.size = opts.size ?? DEFAULT_SIZE;
    this.now = opts.now ?? Date.now;
  }

  /** Paint badges for every element held under a soft-lock by another peer.
   *  The ctx must already have the host's camera transform applied (so the
   *  bbox coords from `bboxResolver` map to the correct screen pixels). */
  render(
    ctx: CanvasRenderingContext2D,
    awareness: PryzmAwareness,
    bboxResolver: BboxResolver,
  ): number {
    const entries = collectBadgeEntries(awareness, this.viewId, this.localClientID);
    let painted = 0;
    for (const entry of entries) {
      const bbox = bboxResolver(entry.elementId, this.viewId);
      if (bbox === null) continue;
      const color = peerColorFor(entry.holderUserId);
      this.drawBadge(ctx, bbox, entry.holderDisplayName, color);
      painted++;
    }
    return painted;
  }

  /** Single-badge primitive — exposed for the bench + visual-diff harness. */
  drawBadge(
    ctx: CanvasRenderingContext2D,
    bbox: ElementBbox,
    label: string,
    color: string,
  ): void {
    ctx.save();
    const s = this.size;
    // Anchor: top-right of the bbox, with a small inset.
    const ax = bbox.maxX - s * 0.5;
    const ay = bbox.minY + s * 0.5;

    drawPadlock(ctx, ax, ay, s, color);

    // Label badge — colored pill with white text, drawn under the padlock.
    const padX = 6, padY = 3;
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    const text = label;
    const textW = ctx.measureText(text).width;
    const badgeX = ax - textW * 0.5 - padX;
    const badgeY = ay + s * 0.7;
    const badgeW = textW + padX * 2;
    const badgeH = 11 + padY * 2;
    roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(text, badgeX + padX, badgeY + padY);

    ctx.restore();
  }
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

/** Padlock glyph — body is a rounded rectangle, shackle is a half-arc.
 *  Drawn around (cx, cy) with overall pixel size `s`. */
function drawPadlock(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, s: number,
  color: string,
): void {
  const bodyW = s * 0.9;
  const bodyH = s * 0.7;
  const bodyX = cx - bodyW / 2;
  const bodyY = cy - bodyH / 2 + s * 0.1;

  // Shackle (half-arc)
  ctx.lineWidth = Math.max(1.2, s * 0.12);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, bodyY, bodyW * 0.32, Math.PI, 0, false);
  ctx.stroke();

  // Body
  roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, s * 0.12);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Keyhole — a small white circle in the body center.
  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(cx, bodyY + bodyH * 0.5, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

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
