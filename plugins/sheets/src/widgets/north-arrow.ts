// NorthArrowWidget — compass-rose arrow rotated from paper-up (S39 /
// Phase 2C).
//
// Rotation semantics: 0° → arrow points to paper-up (toward the top of
// the sheet); positive degrees rotate clockwise (matches the geographic
// convention "true north is N degrees clockwise from grid north").

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  NorthArrowWidgetPayloadSchema,
  type NorthArrowWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, drawUprightText, type WidgetCtx2D } from './base.js';

export class NorthArrowWidget extends Widget<NorthArrowWidgetPayload> {
  readonly type = 'north-arrow' as const;

  parsePayload(raw: Record<string, unknown>): NorthArrowWidgetPayload {
    return NorthArrowWidgetPayloadSchema.parse({ ...raw, kind: 'north-arrow' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: NorthArrowWidgetPayload): void {
    // The widget bounds are SQUARE-ish; pick the smaller side as the
    // arrow span so the symbol always fits.
    const size = Math.min(dto.width, dto.height) - 2;
    if (size <= 0) return;
    const cx = dto.x + dto.width / 2;
    const cy = dto.y + dto.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((p.rotation * Math.PI) / 180);

    // Filled triangular arrow: tip up, broad base, narrow waist.
    ctx.beginPath();
    ctx.moveTo(0, size / 2);          // North tip
    ctx.lineTo(size / 6, 0);
    ctx.lineTo(0, -size / 4);         // South notch
    ctx.lineTo(-size / 6, 0);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.25;
    ctx.stroke();

    // Thin axis ticks (NW/NE/SW/SE) as a second rose layer.
    ctx.beginPath();
    const r = size / 2;
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.lineWidth = 0.1;
    ctx.stroke();

    ctx.restore();

    // "N" label hovering above the tip — drawn in widget-local space
    // so it counter-rotates back to paper-up.  We approximate the tip
    // position with a small upward offset; for non-zero rotations the
    // label still reads upright (which is the convention).
    drawUprightText(
      ctx,
      'N',
      cx,
      cy + size / 2 + 1,
      Math.max(2, size / 5),
      p.color,
      'center',
      'bold',
    );
  }
}
