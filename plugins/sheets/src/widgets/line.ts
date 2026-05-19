// LineWidget — straight line annotation between two widget-local points
// (S39 / Phase 2C).

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  LineWidgetPayloadSchema,
  type LineWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, type WidgetCtx2D } from './base.js';

const DASH_PATTERNS: Record<LineWidgetPayload['dash'], number[]> = {
  solid: [],
  dashed: [2, 1],
  dotted: [0.6, 0.6],
};

export class LineWidget extends Widget<LineWidgetPayload> {
  readonly type = 'line' as const;

  parsePayload(raw: Record<string, unknown>): LineWidgetPayload {
    return LineWidgetPayloadSchema.parse({ ...raw, kind: 'line' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: LineWidgetPayload): void {
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.lineWeight;
    ctx.setLineDash(DASH_PATTERNS[p.dash]);
    ctx.beginPath();
    ctx.moveTo(dto.x + p.x1, dto.y + p.y1);
    ctx.lineTo(dto.x + p.x2, dto.y + p.y2);
    ctx.stroke();
    ctx.restore();
  }
}
