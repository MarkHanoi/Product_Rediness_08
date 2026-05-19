// ImageWidget — embed an external image (logos, branding) (S39 /
// Phase 2C).
//
// The widget renders a placeholder rectangle + alt text in headless
// (Node) and JSDOM environments where there's no browser Image loader.
// In the real DOM, callers can pre-resolve the src to an HTMLImageElement
// and pass it via env.images[src] (left as a future hook so the wire
// payload stays JSON).  S40's PDF export worker resolves URLs to bytes
// using node-canvas before calling renderInto.

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  ImageWidgetPayloadSchema,
  type ImageWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, drawUprightText, type WidgetCtx2D } from './base.js';

export class ImageWidget extends Widget<ImageWidgetPayload> {
  readonly type = 'image' as const;

  parsePayload(raw: Record<string, unknown>): ImageWidgetPayload {
    return ImageWidgetPayloadSchema.parse({ ...raw, kind: 'image' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: ImageWidgetPayload): void {
    // Placeholder frame (filled in by the editor when an image is
    // resolved out of band; the wire payload stays a URL string).
    ctx.save();
    ctx.fillStyle = '#F8F8F8';
    ctx.fillRect(dto.x, dto.y, dto.width, dto.height);
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(dto.x, dto.y, dto.width, dto.height);

    // Diagonal cross to mark "image slot".
    ctx.beginPath();
    ctx.moveTo(dto.x, dto.y);
    ctx.lineTo(dto.x + dto.width, dto.y + dto.height);
    ctx.moveTo(dto.x + dto.width, dto.y);
    ctx.lineTo(dto.x, dto.y + dto.height);
    ctx.stroke();
    ctx.restore();

    const label = p.alt || p.src.slice(0, 28);
    drawUprightText(
      ctx,
      label,
      dto.x + dto.width / 2,
      dto.y + dto.height / 2,
      Math.min(3, dto.height / 6),
      '#444444',
      'center',
    );
    // Hint to the eye that fit policy matters once an image is wired.
    drawUprightText(
      ctx,
      `[${p.fit}]`,
      dto.x + dto.width / 2,
      dto.y + 1.5,
      Math.min(2, dto.height / 8),
      '#888888',
      'center',
    );
  }
}
