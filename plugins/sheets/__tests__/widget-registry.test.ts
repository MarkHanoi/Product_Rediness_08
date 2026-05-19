// Widget registry coverage (S39).

import { describe, it, expect } from 'vitest';
import {
  buildBuiltinWidgetRegistry,
  BUILTIN_WIDGET_REGISTRY,
  BUILTIN_WIDGET_KINDS,
  renderWidget,
  widgetBounds,
} from '../src/widgets/index.js';
import { WIDGET_KINDS, parseWidgetPayload, isWidgetKind } from '@pryzm/plugin-sdk';
import type { WidgetDto } from '@pryzm/plugin-sdk';
import { createMockCtx } from './_mock-ctx.js';

describe('built-in registry', () => {
  it('ships exactly the 10 spec kinds', () => {
    const kinds = Object.keys(BUILTIN_WIDGET_REGISTRY).sort();
    expect(kinds).toEqual([...WIDGET_KINDS].sort());
    expect(kinds).toHaveLength(10);
  });

  it('BUILTIN_WIDGET_KINDS is the parallel constant', () => {
    expect([...BUILTIN_WIDGET_KINDS].sort()).toEqual([...WIDGET_KINDS].sort());
  });

  it('every widget exposes a `type` matching its registry key', () => {
    for (const [k, w] of Object.entries(BUILTIN_WIDGET_REGISTRY)) {
      expect(w.type).toBe(k);
    }
  });

  it('returns a fresh registry each build call', () => {
    const a = buildBuiltinWidgetRegistry();
    const b = buildBuiltinWidgetRegistry();
    expect(a).not.toBe(b);
    expect(Object.keys(a)).toEqual(Object.keys(b));
  });
});

describe('renderWidget', () => {
  it('returns true for a known kind', () => {
    const ctx = createMockCtx();
    const dto: WidgetDto = {
      id: 'w-1', kind: 'text', x: 0, y: 0, width: 50, height: 10,
      payload: { text: 'hi', fontSize: 3 },
    } as WidgetDto;
    expect(renderWidget(ctx as unknown as CanvasRenderingContext2D, dto)).toBe(true);
  });

  it('returns false for an unknown kind so the host can draw the placeholder', () => {
    const ctx = createMockCtx();
    const dto: WidgetDto = {
      id: 'w-1', kind: 'mystery-future-widget', x: 0, y: 0, width: 10, height: 10, payload: {},
    } as WidgetDto;
    expect(renderWidget(ctx as unknown as CanvasRenderingContext2D, dto)).toBe(false);
  });

  it('returns false (and does not throw) on a malformed payload', () => {
    const ctx = createMockCtx();
    const dto: WidgetDto = {
      id: 'w-1', kind: 'image', x: 0, y: 0, width: 10, height: 10, payload: { src: '' },
    } as WidgetDto;
    expect(renderWidget(ctx as unknown as CanvasRenderingContext2D, dto)).toBe(false);
  });
});

describe('parseWidgetPayload', () => {
  it('fills defaults', () => {
    const p = parseWidgetPayload('text', {});
    expect(p.kind).toBe('text');
    expect(p).toMatchObject({ text: '', align: 'left', vAlign: 'top' });
  });

  it('throws on unknown kind', () => {
    expect(() => parseWidgetPayload('not-a-kind', {})).toThrow();
  });

  it('isWidgetKind accepts every built-in kind', () => {
    for (const k of WIDGET_KINDS) expect(isWidgetKind(k)).toBe(true);
    expect(isWidgetKind('xyz')).toBe(false);
    expect(isWidgetKind(42)).toBe(false);
  });
});

describe('widgetBounds', () => {
  it('returns dto rect for normal widgets', () => {
    const dto: WidgetDto = {
      id: 'w-1', kind: 'text', x: 5, y: 6, width: 7, height: 8, payload: {},
    } as WidgetDto;
    expect(widgetBounds(dto)).toEqual({ x: 5, y: 6, width: 7, height: 8 });
  });

  it('expands BimTag bounds to enclose the anchor', () => {
    const dto: WidgetDto = {
      id: 'w-1', kind: 'bim-tag', x: 5, y: 5, width: 10, height: 10,
      payload: { anchorX: 200, anchorY: 100, label: 'X' },
    } as WidgetDto;
    const b = widgetBounds(dto);
    expect(b.x + b.width).toBeGreaterThanOrEqual(200);
    expect(b.y + b.height).toBeGreaterThanOrEqual(100);
  });
});
