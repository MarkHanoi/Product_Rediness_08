// RegionWidget — filled / hatched / outlined rectangle annotation
// (S39 / Phase 2C).

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  RegionWidgetPayloadSchema,
  type RegionWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, type WidgetCtx2D } from './base.js';

export class RegionWidget extends Widget<RegionWidgetPayload> {
  readonly type = 'region' as const;

  parsePayload(raw: Record<string, unknown>): RegionWidgetPayload {
    return RegionWidgetPayloadSchema.parse({ ...raw, kind: 'region' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: RegionWidgetPayload): void {
    ctx.save();
    if (p.opacity !== 1) ctx.globalAlpha = p.opacity;

    // Solid fill (or no fill if hatch > 0; hatch lives on the fill
    // visual layer instead).
    if (p.hatch === 0) {
      ctx.fillStyle = p.fill;
      ctx.fillRect(dto.x, dto.y, dto.width, dto.height);
    } else {
      // Background still fills with the colour, hatch overlays.
      ctx.fillStyle = p.fill;
      ctx.fillRect(dto.x, dto.y, dto.width, dto.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(dto.x, dto.y, dto.width, dto.height);
      ctx.clip();

      const spacing = Math.max(0.3, 1 / p.hatch);
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = Math.min(0.2, p.lineWeight);
      const span = dto.width + dto.height;
      for (let k = -span; k <= span; k += spacing) {
        ctx.beginPath();
        ctx.moveTo(dto.x + k, dto.y);
        ctx.lineTo(dto.x + k + dto.height, dto.y + dto.height);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Outline.
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = p.lineWeight;
    ctx.strokeRect(dto.x, dto.y, dto.width, dto.height);

    ctx.restore();
  }
}
