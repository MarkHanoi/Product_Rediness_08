// RevisionsTableWidget — tabular list of revisions for the sheet (S39 /
// Phase 2C).
//
// Column widths are computed from the available widget width and a
// fixed weight per column (rev=1, date=1.5, description=4, by=1.5);
// callers that pass custom headers get equal-weight distribution.

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  RevisionsTableWidgetPayloadSchema,
  type RevisionsTableWidgetPayload,
} from '@pryzm/plugin-sdk';
import { Widget, drawUprightText, type WidgetCtx2D } from './base.js';

const STANDARD_HEADERS = ['Rev', 'Date', 'Description', 'By'];
const STANDARD_WEIGHTS = [1, 1.5, 4, 1.5];

export class RevisionsTableWidget extends Widget<RevisionsTableWidgetPayload> {
  readonly type = 'revisions-table' as const;

  parsePayload(raw: Record<string, unknown>): RevisionsTableWidgetPayload {
    return RevisionsTableWidgetPayloadSchema.parse({ ...raw, kind: 'revisions-table' });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: RevisionsTableWidgetPayload): void {
    const isStandard = p.headers.length === STANDARD_HEADERS.length
      && p.headers.every((h, i) => h === STANDARD_HEADERS[i]);
    const weights = isStandard
      ? STANDARD_WEIGHTS
      : new Array(p.headers.length).fill(1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => (w / totalWeight) * dto.width);
    const colXs = colWidths.reduce<number[]>((acc, w, i) => {
      acc.push((acc[i - 1] ?? 0) + (i === 0 ? 0 : colWidths[i - 1]!));
      return acc;
    }, []);

    const rowH = 4;
    const headerH = 4.5;

    // Background + outer border.
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(dto.x, dto.y, dto.width, dto.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(dto.x, dto.y, dto.width, dto.height);
    ctx.restore();

    // Header band (top of the widget, since Y grows up).
    const headerYTop = dto.y + dto.height;
    const headerYBottom = headerYTop - headerH;
    ctx.save();
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(dto.x, headerYBottom, dto.width, headerH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.25;
    ctx.beginPath();
    ctx.moveTo(dto.x, headerYBottom);
    ctx.lineTo(dto.x + dto.width, headerYBottom);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < p.headers.length; i++) {
      drawUprightText(
        ctx,
        p.headers[i] ?? '',
        dto.x + (colXs[i] ?? 0) + 1,
        headerYBottom + 1.2,
        2.8,
        '#000000',
        'left',
        'bold',
      );
    }

    // Rows.
    const maxRows = Math.max(0, Math.floor((headerYBottom - dto.y) / rowH));
    const visible = p.rows.slice(0, maxRows);
    for (let i = 0; i < visible.length; i++) {
      const row = visible[i]!;
      const yTop = headerYBottom - i * rowH;
      const yBottom = yTop - rowH;
      const cells = [row.rev, row.date, row.description, row.by];

      for (let c = 0; c < Math.min(cells.length, p.headers.length); c++) {
        drawUprightText(
          ctx,
          cells[c] ?? '',
          dto.x + (colXs[c] ?? 0) + 1,
          yBottom + 1,
          2.5,
          '#000000',
          'left',
        );
      }

      // Row separator.
      if (i < visible.length - 1) {
        ctx.save();
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 0.15;
        ctx.beginPath();
        ctx.moveTo(dto.x, yBottom);
        ctx.lineTo(dto.x + dto.width, yBottom);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Column separators.
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.15;
    for (let c = 1; c < p.headers.length; c++) {
      ctx.beginPath();
      ctx.moveTo(dto.x + (colXs[c] ?? 0), dto.y);
      ctx.lineTo(dto.x + (colXs[c] ?? 0), headerYTop);
      ctx.stroke();
    }
    ctx.restore();
  }
}
