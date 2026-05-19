// TextWidget — multi-line text with wrapping (S39 / Phase 2C).

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  TextWidgetPayloadSchema,
  type TextWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, drawUprightText, wrapText, type WidgetCtx2D } from './base.js';

export class TextWidget extends Widget<TextWidgetPayload> {
  readonly type = 'text' as const;

  parsePayload(raw: Record<string, unknown>): TextWidgetPayload {
    return TextWidgetPayloadSchema.parse({ ...raw, kind: 'text' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: TextWidgetPayload): void {
    const padding = 1;
    const innerW = Math.max(0, dto.width - padding * 2);
    const lines = wrapText(ctx, p.text, innerW, p.fontSize, p.fontWeight);
    if (lines.length === 0) return;

    const lineH = p.fontSize * 1.2;
    const totalH = lines.length * lineH;

    let baseY: number;
    if (p.vAlign === 'top') {
      baseY = dto.y + dto.height - padding - p.fontSize;
    } else if (p.vAlign === 'middle') {
      baseY = dto.y + dto.height / 2 + totalH / 2 - p.fontSize;
    } else {
      baseY = dto.y + padding + totalH - p.fontSize;
    }

    const xLeft = dto.x + padding;
    const xCenter = dto.x + dto.width / 2;
    const xRight = dto.x + dto.width - padding;
    const x = p.align === 'left' ? xLeft : p.align === 'right' ? xRight : xCenter;

    for (let i = 0; i < lines.length; i++) {
      drawUprightText(
        ctx,
        lines[i] ?? '',
        x,
        baseY - i * lineH,
        p.fontSize,
        p.color,
        p.align,
        p.fontWeight,
      );
    }
  }
}
