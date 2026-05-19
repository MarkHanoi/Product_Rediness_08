// Widget render + bounds smoke coverage (S39 / Phase 2C).
//
// One render-doesn't-throw + one bounds-shape test per widget kind, so a
// regression in any single widget surfaces as a single named failure.

import { describe, it, expect } from 'vitest';
import type { WidgetDto } from '@pryzm/plugin-sdk';
import {
  TextWidget,
  ImageWidget,
  NorthArrowWidget,
  ScaleBarWidget,
  LegendWidget,
  RevisionsTableWidget,
  ScheduleSnapshotWidget,
  BimTagWidget,
  LineWidget,
  RegionWidget,
  widgetBounds,
} from '../src/widgets/index.js';
import { createMockCtx, counts, texts } from './_mock-ctx.js';

function dto(kind: string, payload: Record<string, unknown> = {}): WidgetDto {
  return { id: `w-${kind}`, kind, x: 10, y: 20, width: 80, height: 40, payload } as WidgetDto;
}

describe('TextWidget', () => {
  it('wraps + draws each line at the correct font size', () => {
    const w = new TextWidget();
    const ctx = createMockCtx();
    const d = dto('text', { text: 'Hello world line one\nLine two', fontSize: 4 });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    const drawn = texts(ctx.ops);
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    expect(drawn.join(' ')).toContain('Hello');
    expect(drawn.join(' ')).toContain('Line two');
  });

  it('returns the dto bounds verbatim', () => {
    const d = dto('text', { text: 'x' });
    expect(widgetBounds(d)).toEqual({ x: 10, y: 20, width: 80, height: 40 });
  });
});

describe('ImageWidget', () => {
  it('renders a placeholder frame + alt label', () => {
    const w = new ImageWidget();
    const ctx = createMockCtx();
    const d = dto('image', { src: 'https://example/logo.png', alt: 'Logo' });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(counts(ctx.ops, 'fillRect')).toBeGreaterThanOrEqual(1);
    expect(texts(ctx.ops).join(' ')).toContain('Logo');
  });

  it('rejects an empty src', () => {
    expect(() => new ImageWidget().parsePayload({ src: '' })).toThrow();
  });
});

describe('NorthArrowWidget', () => {
  it('renders an arrow + the "N" label', () => {
    const w = new NorthArrowWidget();
    const ctx = createMockCtx();
    const d = dto('north-arrow', { rotation: 30 });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(texts(ctx.ops)).toContain('N');
    // rotate(...) MUST appear (proves rotation is plumbed).
    expect(counts(ctx.ops, 'rotate')).toBe(1);
  });
});

describe('ScaleBarWidget', () => {
  it('renders alternating segments + ratio + distance label', () => {
    const w = new ScaleBarWidget();
    const ctx = createMockCtx();
    const d = dto('scale-bar', { scaleRatio: 100, segments: 4, unit: 'm' });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    // 4 alternating segments → fillRect at least 4 times.
    expect(counts(ctx.ops, 'fillRect')).toBeGreaterThanOrEqual(4);
    const t = texts(ctx.ops);
    expect(t).toContain('1:100');
    expect(t).toContain('0');
    expect(t.some((s) => s.includes('m'))).toBe(true);
  });

  it('binds to a viewport scale via env when viewportId is set', () => {
    const w = new ScaleBarWidget();
    const ctx = createMockCtx();
    const d = dto('scale-bar', { scaleRatio: 999, viewportId: 'vp-1' });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {
      viewportScales: { 'vp-1': 50 },
    });
    expect(texts(ctx.ops)).toContain('1:50');
  });
});

describe('LegendWidget', () => {
  it('renders title + visible entry rows from explicit entries', () => {
    const w = new LegendWidget();
    const ctx = createMockCtx();
    const d = dto('legend', { title: 'Materials', entries: [
      { label: 'Wood', color: '#8b5a2b' },
      { label: 'Steel', color: '#888888' },
    ] });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    const t = texts(ctx.ops);
    expect(t).toContain('Materials');
    expect(t).toContain('Wood');
    expect(t).toContain('Steel');
  });

  it('reads from env in auto mode', () => {
    const w = new LegendWidget();
    const ctx = createMockCtx();
    const d = dto('legend', { auto: true });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {
      legendEntries: [{ label: 'Glass', color: '#aaffff', pattern: 'solid' }],
    });
    expect(texts(ctx.ops)).toContain('Glass');
  });
});

describe('RevisionsTableWidget', () => {
  it('renders standard headers + each row', () => {
    const w = new RevisionsTableWidget();
    const ctx = createMockCtx();
    const d = dto('revisions-table', { rows: [
      { rev: 'A', date: '2026-01-01', description: 'Initial issue', by: 'AB' },
      { rev: 'B', date: '2026-02-15', description: 'Updated wall layout', by: 'CD' },
    ] });
    d.width = 160; d.height = 30;
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    const t = texts(ctx.ops);
    expect(t).toContain('Rev');
    expect(t).toContain('Description');
    expect(t).toContain('Initial issue');
    expect(t).toContain('Updated wall layout');
  });
});

describe('ScheduleSnapshotWidget', () => {
  it('shows "no data" when env has no rows for the schedule id', () => {
    const w = new ScheduleSnapshotWidget();
    const ctx = createMockCtx();
    const d = dto('schedule-snapshot', { scheduleId: 'door-schedule' });
    d.width = 120; d.height = 40;
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(texts(ctx.ops).join(' ')).toContain('no data');
  });

  it('renders columns + rows when env supplies them', () => {
    const w = new ScheduleSnapshotWidget();
    const ctx = createMockCtx();
    const d = dto('schedule-snapshot', { scheduleId: 'doors', title: 'Doors' });
    d.width = 120; d.height = 60;
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {
      schedules: { doors: [
        { Tag: 'D-001', Type: 'Single', Width: '900' },
        { Tag: 'D-002', Type: 'Double', Width: '1800' },
      ] },
    });
    const t = texts(ctx.ops);
    expect(t).toContain('Tag');
    expect(t).toContain('Type');
    expect(t).toContain('D-001');
    expect(t).toContain('Doors');
  });
});

describe('BimTagWidget', () => {
  it('draws a leader line + balloon + label', () => {
    const w = new BimTagWidget();
    const ctx = createMockCtx();
    const d = dto('bim-tag', { anchorX: 200, anchorY: 200, label: 'W-001' });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(texts(ctx.ops)).toContain('W-001');
    expect(counts(ctx.ops, 'lineTo')).toBeGreaterThanOrEqual(1);
  });

  it('expands its bounds to include the anchor point', () => {
    const d = dto('bim-tag', { anchorX: 200, anchorY: 200, label: 'X' });
    const b = widgetBounds(d);
    expect(b.x).toBeLessThanOrEqual(10);
    expect(b.y).toBeLessThanOrEqual(20);
    expect(b.x + b.width).toBeGreaterThanOrEqual(200);
    expect(b.y + b.height).toBeGreaterThanOrEqual(200);
  });
});

describe('LineWidget', () => {
  it('issues a stroke between the two payload points', () => {
    const w = new LineWidget();
    const ctx = createMockCtx();
    const d = dto('line', { x1: 0, y1: 0, x2: 50, y2: 5, dash: 'dashed' });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(counts(ctx.ops, 'moveTo')).toBe(1);
    expect(counts(ctx.ops, 'lineTo')).toBe(1);
    expect(counts(ctx.ops, 'stroke')).toBe(1);
    expect(counts(ctx.ops, 'setLineDash')).toBe(1);
  });
});

describe('RegionWidget', () => {
  it('fills + strokes a rectangle', () => {
    const w = new RegionWidget();
    const ctx = createMockCtx();
    const d = dto('region', { fill: '#ff0', stroke: '#000', opacity: 0.8 });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    expect(counts(ctx.ops, 'fillRect')).toBeGreaterThanOrEqual(1);
    expect(counts(ctx.ops, 'strokeRect')).toBeGreaterThanOrEqual(1);
  });

  it('hatches when hatch > 0', () => {
    const w = new RegionWidget();
    const ctx = createMockCtx();
    const d = dto('region', { fill: '#fff', stroke: '#000', hatch: 1 });
    const p = w.parsePayload(d.payload as Record<string, unknown>);
    w.render(ctx as unknown as CanvasRenderingContext2D, d, p, {});
    // Hatching draws many short strokes.
    expect(counts(ctx.ops, 'stroke')).toBeGreaterThan(5);
  });
});
