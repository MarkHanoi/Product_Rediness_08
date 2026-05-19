// LegendWidget — colour swatch + label rows (S39 / Phase 2C).
//
// Two modes:
//   • explicit:  payload.entries is the source of truth
//   • auto:      payload.auto = true → reads env.legendEntries (the host
//                injects this from a model query in production)

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  LegendWidgetPayloadSchema,
  type LegendWidgetPayload,
  type LegendEntry,
} from '@pryzm/plugin-sdk';
import {
  Widget,
  drawUprightText,
  type WidgetCtx2D,
  type WidgetRenderEnv,
} from './base.js';

export class LegendWidget extends Widget<LegendWidgetPayload> {
  readonly type = 'legend' as const;

  parsePayload(raw: Record<string, unknown>): LegendWidgetPayload {
    return LegendWidgetPayloadSchema.parse({ ...raw, kind: 'legend' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: LegendWidgetPayload, env: WidgetRenderEnv): void {
    const entries: ReadonlyArray<LegendEntry> = p.auto && env.legendEntries
      ? env.legendEntries
      : p.entries;

    const padding = 1.5;
    const titleH = 4;
    const rowH = 4;
    const swatchSize = 3;

    // Background + border.
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(dto.x, dto.y, dto.width, dto.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.25;
    ctx.strokeRect(dto.x, dto.y, dto.width, dto.height);
    ctx.restore();

    // Title bar.
    drawUprightText(
      ctx,
      p.title,
      dto.x + padding,
      dto.y + dto.height - padding - 2.5,
      3,
      '#000000',
      'left',
      'bold',
    );

    // Rows — top to bottom, capped by available height.
    const startY = dto.y + dto.height - titleH - padding;
    const maxRows = Math.max(0, Math.floor((startY - dto.y - padding) / rowH));
    const visible = entries.slice(0, maxRows);

    for (let i = 0; i < visible.length; i++) {
      const e = visible[i]!;
      const yTop = startY - i * rowH - 0.3;

      // Swatch.
      ctx.save();
      ctx.fillStyle = e.color;
      ctx.fillRect(dto.x + padding, yTop - swatchSize, swatchSize, swatchSize);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 0.15;
      ctx.strokeRect(dto.x + padding, yTop - swatchSize, swatchSize, swatchSize);
      // Pattern hint.
      if (e.pattern === 'hatch') {
        for (let k = -swatchSize; k <= swatchSize; k += 0.6) {
          ctx.beginPath();
          ctx.moveTo(dto.x + padding + k, yTop - swatchSize);
          ctx.lineTo(dto.x + padding + k + swatchSize, yTop);
          ctx.stroke();
        }
      } else if (e.pattern === 'dashed') {
        ctx.setLineDash([0.5, 0.5]);
        ctx.beginPath();
        ctx.moveTo(dto.x + padding, yTop - swatchSize / 2);
        ctx.lineTo(dto.x + padding + swatchSize, yTop - swatchSize / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      drawUprightText(
        ctx,
        e.label,
        dto.x + padding + swatchSize + 1.2,
        yTop - swatchSize + 0.3,
        2.5,
        '#000000',
        'left',
      );
    }
  }
}
