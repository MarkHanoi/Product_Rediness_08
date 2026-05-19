// BimTagWidget — text balloon with a leader line pointing at a model
// element on a viewport (S39 / Phase 2C).
//
// The leader runs from the TAG (widget centre-left) to the ANCHOR (a
// sheet-space point recorded in the payload).  In Revit the anchor is
// resolved each frame from the underlying viewport's element id —
// here we keep the literal anchor coordinates in the payload so the
// widget stays a pure data render.

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  BimTagWidgetPayloadSchema,
  type BimTagWidgetPayload,
} from '@pryzm/plugin-sdk';
import {
  Widget,
  drawUprightText,
  type WidgetBounds,
  type WidgetCtx2D,
} from './base.js';

export class BimTagWidget extends Widget<BimTagWidgetPayload> {
  readonly type = 'bim-tag' as const;

  parsePayload(raw: Record<string, unknown>): BimTagWidgetPayload {
    return BimTagWidgetPayloadSchema.parse({ ...raw, kind: 'bim-tag' });
  }

  override getBounds(dto: WidgetDto): WidgetBounds {
    // Bounding box must contain both the balloon and the anchor.
    const raw = dto.payload as { anchorX?: unknown; anchorY?: unknown };
    const ax = typeof raw.anchorX === 'number' ? raw.anchorX : dto.x;
    const ay = typeof raw.anchorY === 'number' ? raw.anchorY : dto.y;
    const minX = Math.min(dto.x, ax);
    const minY = Math.min(dto.y, ay);
    const maxX = Math.max(dto.x + dto.width, ax);
    const maxY = Math.max(dto.y + dto.height, ay);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: BimTagWidgetPayload): void {
    const cx = dto.x + dto.width / 2;
    const cy = dto.y + dto.height / 2;

    // Leader line: balloon centre → anchor.
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.anchorX, p.anchorY);
    ctx.stroke();
    // Anchor dot.
    ctx.beginPath();
    ctx.arc(p.anchorX, p.anchorY, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();

    // Balloon: rounded rect with thin border.
    const r = Math.min(1.5, dto.width / 6, dto.height / 3);
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.3;
    roundRectPath(ctx, dto.x, dto.y, dto.width, dto.height, r);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawUprightText(ctx, p.label, cx, cy - p.fontSize / 2, p.fontSize, p.color, 'center');
  }
}

function roundRectPath(
  ctx: WidgetCtx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
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
