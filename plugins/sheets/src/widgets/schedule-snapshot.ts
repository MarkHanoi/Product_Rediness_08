// ScheduleSnapshotWidget — embeds a live mini-table from the schedule
// store (S39 / Phase 2C).  The wire payload references a scheduleId;
// the host injects rows via env.schedules[scheduleId].
//
// S41 ships the actual ScheduleStore.  S39's exit criterion is that
// THIS widget reads from env.schedules and renders correctly when the
// data arrives — no upstream dependency.

import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  ScheduleSnapshotWidgetPayloadSchema,
  type ScheduleSnapshotWidgetPayload,
} from '@pryzm/plugin-sdk';
import {
  Widget,
  drawUprightText,
  type WidgetCtx2D,
  type WidgetRenderEnv,
} from './base.js';

export class ScheduleSnapshotWidget extends Widget<ScheduleSnapshotWidgetPayload> {
  readonly type = 'schedule-snapshot' as const;

  parsePayload(raw: Record<string, unknown>): ScheduleSnapshotWidgetPayload {
    return ScheduleSnapshotWidgetPayloadSchema.parse({
      ...raw, kind: 'schedule-snapshot',
    });
  }

  render(ctx: WidgetCtx2D, dto: WidgetDto, p: ScheduleSnapshotWidgetPayload, env: WidgetRenderEnv): void {
    const schedule = env.schedules?.[p.scheduleId] ?? [];
    const rows = schedule.slice(0, p.maxRows);

    // Pick the columns: explicit whitelist, else union of all keys
    // (stable order: first-seen).
    let columns: string[];
    if (p.columns.length > 0) {
      columns = p.columns.slice();
    } else {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const r of rows) for (const k of Object.keys(r)) {
        if (!seen.has(k)) { seen.add(k); ordered.push(k); }
      }
      columns = ordered;
    }

    // Background + border.
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(dto.x, dto.y, dto.width, dto.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(dto.x, dto.y, dto.width, dto.height);
    ctx.restore();

    const padding = 1.5;
    const titleH = p.title ? 4 : 0;
    const headerH = columns.length > 0 ? 4 : 0;
    const rowH = 3.5;

    if (p.title) {
      drawUprightText(
        ctx,
        p.title,
        dto.x + padding,
        dto.y + dto.height - padding - 2.8,
        3,
        '#000000',
        'left',
        'bold',
      );
    }

    if (columns.length === 0 || rows.length === 0) {
      drawUprightText(
        ctx,
        rows.length === 0 ? `(no data for "${p.scheduleId}")` : '(no columns)',
        dto.x + dto.width / 2,
        dto.y + dto.height / 2,
        2.5,
        '#888888',
        'center',
      );
      return;
    }

    const headerYTop = dto.y + dto.height - titleH;
    const headerYBottom = headerYTop - headerH;
    const colWidth = dto.width / columns.length;

    // Header band.
    ctx.save();
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(dto.x, headerYBottom, dto.width, headerH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(dto.x, headerYBottom);
    ctx.lineTo(dto.x + dto.width, headerYBottom);
    ctx.stroke();
    ctx.restore();

    for (let c = 0; c < columns.length; c++) {
      drawUprightText(
        ctx,
        columns[c] ?? '',
        dto.x + c * colWidth + 1,
        headerYBottom + 1,
        2.5,
        '#000000',
        'left',
        'bold',
      );
    }

    const availH = headerYBottom - dto.y - padding;
    const maxRows = Math.max(0, Math.floor(availH / rowH));
    const renderedRows = rows.slice(0, maxRows);

    for (let i = 0; i < renderedRows.length; i++) {
      const r = renderedRows[i]!;
      const yBottom = headerYBottom - (i + 1) * rowH;
      for (let c = 0; c < columns.length; c++) {
        drawUprightText(
          ctx,
          r[columns[c]!] ?? '',
          dto.x + c * colWidth + 1,
          yBottom + 0.8,
          2.3,
          '#000000',
          'left',
        );
      }
    }
  }
}
