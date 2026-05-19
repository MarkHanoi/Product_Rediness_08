// ScaleBarWidget — alternating segment bar showing world distance
// covered by the widget's width (S39 / Phase 2C).
//
// Reading the bar: the printed distance from "0" to the right-hand
// label = `(widthMm / 1000) * scaleRatio` in the widget's `unit`.

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  ScaleBarWidgetPayloadSchema,
  type ScaleBarWidgetPayload,
} from '@pryzm/plugin-sdk';
import {
  Widget,
  drawUprightText,
  type WidgetCtx2D,
  type WidgetRenderEnv,
} from './base.js';

export class ScaleBarWidget extends Widget<ScaleBarWidgetPayload> {
  readonly type = 'scale-bar' as const;

  parsePayload(raw: Record<string, unknown>): ScaleBarWidgetPayload {
    return ScaleBarWidgetPayloadSchema.parse({ ...raw, kind: 'scale-bar' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: ScaleBarWidgetPayload, env: WidgetRenderEnv): void {
    // Resolve the live scale: bound viewport wins, else explicit ratio.
    const liveScale = p.viewportId ? env.viewportScales?.[p.viewportId] : undefined;
    const scaleRatio = (typeof liveScale === 'number' && liveScale > 0)
      ? liveScale
      : p.scaleRatio;

    // Reserve 4 mm at the top for labels; the bar itself sits below.
    const labelBand = 4;
    const barH = Math.max(1, dto.height - labelBand);
    const barWidth = dto.width;

    const segments = Math.max(1, p.segments);
    const segWidth = barWidth / segments;

    // Convert paper distance to world distance, then to display unit.
    const worldUnitsM = (barWidth / 1000) * scaleRatio;
    const display = p.unit === 'm'
      ? worldUnitsM
      : p.unit === 'mm'
        ? worldUnitsM * 1000
        : worldUnitsM * 3.28084;
    const formatted = formatScaleNumber(display);

    ctx.save();
    for (let i = 0; i < segments; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#000000' : '#FFFFFF';
      ctx.fillRect(dto.x + i * segWidth, dto.y, segWidth, barH);
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.25;
    ctx.strokeRect(dto.x, dto.y, barWidth, barH);
    ctx.restore();

    drawUprightText(ctx, '0', dto.x, dto.y + barH + 1, 2.5, '#000000', 'left');
    drawUprightText(
      ctx,
      `${formatted} ${p.unit}`,
      dto.x + barWidth,
      dto.y + barH + 1,
      2.5,
      '#000000',
      'right',
    );
    drawUprightText(
      ctx,
      `1:${scaleRatio}`,
      dto.x + barWidth / 2,
      dto.y + barH + 1,
      2.5,
      '#000000',
      'center',
    );
  }
}

function formatScaleNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100) return Math.round(n).toString();
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
