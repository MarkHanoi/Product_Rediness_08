// Title-block templates + render coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TITLE_BLOCK_TEMPLATES,
  computeTitleBlockRect,
  getBuiltinTitleBlock,
  resolveFieldValue,
  renderTitleBlock,
} from '../src/title-block.js';
import {
  EMPTY_PROJECT_METADATA,
  type ProjectMetadata,
  type SheetData,
  type TitleBlockField,
} from '@pryzm/plugin-sdk';

const sheet: SheetData = {
  id: 'sheet-1',
  name: 'Ground Floor Plan',
  number: 'A-101',
  size: 'A1',
  orientation: 'landscape',
  titleBlockId: 'standard',
  viewports: [{ id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 200, height: 150, scale: 100 }],
  widgets: [],
  revision: 'P1',
  issue: 'FOR REVIEW',
  approvedBy: 'A. Architect',
  seq: 0,
};

const meta: ProjectMetadata = {
  name: 'Riverside Apartments',
  number: '24-017',
  drawnBy: 'M. Drawer',
  checkedBy: 'C. Checker',
  client: 'Riverside Holdings Ltd',
  siteAddress: '12 Riverside Drive',
};

const FIXED_NOW = new Date('2026-04-15T00:00:00Z');

function field(overrides: Partial<TitleBlockField> = {}): TitleBlockField {
  return {
    key: 'sheetName', label: '', x: 0, y: 0, width: 100, fontSize: 4,
    fontWeight: 'normal', align: 'left', yAnchor: 'bottom', ...overrides,
  };
}

describe('BUILTIN_TITLE_BLOCK_TEMPLATES', () => {
  it('exposes exactly the 3 spec-defined templates', () => {
    expect(BUILTIN_TITLE_BLOCK_TEMPLATES.map((t) => t.id))
      .toEqual(['standard', 'architectural', 'minimal']);
  });

  it('every template has a default layout with positive width/height', () => {
    for (const t of BUILTIN_TITLE_BLOCK_TEMPLATES) {
      expect(t.defaultLayout.width).toBeGreaterThan(0);
      expect(t.defaultLayout.height).toBeGreaterThan(0);
      expect(t.fields.length).toBeGreaterThan(0);
    }
  });

  it('getBuiltinTitleBlock returns the matching template, or undefined', () => {
    expect(getBuiltinTitleBlock('standard')?.name).toBe('Standard');
    expect(getBuiltinTitleBlock('architectural')?.name).toBe('Architectural');
    expect(getBuiltinTitleBlock('minimal')?.name).toBe('Minimal');
    expect(getBuiltinTitleBlock('does-not-exist')).toBeUndefined();
  });

  it('only the architectural template has a logoArea', () => {
    expect(getBuiltinTitleBlock('standard')?.logoArea).toBeUndefined();
    expect(getBuiltinTitleBlock('architectural')?.logoArea).toBeDefined();
    expect(getBuiltinTitleBlock('minimal')?.logoArea).toBeUndefined();
  });
});

describe('resolveFieldValue', () => {
  const ctx = { sheet, projectMeta: meta, now: FIXED_NOW };

  it('resolves built-in keys from sheet + projectMeta', () => {
    expect(resolveFieldValue(field({ key: 'projectName' }), ctx)).toBe('Riverside Apartments');
    expect(resolveFieldValue(field({ key: 'projectNumber' }), ctx)).toBe('24-017');
    expect(resolveFieldValue(field({ key: 'sheetName' }), ctx)).toBe('Ground Floor Plan');
    expect(resolveFieldValue(field({ key: 'sheetNumber' }), ctx)).toBe('A-101');
    expect(resolveFieldValue(field({ key: 'sheetSize' }), ctx)).toBe('A1');
    expect(resolveFieldValue(field({ key: 'orientation' }), ctx)).toBe('landscape');
    expect(resolveFieldValue(field({ key: 'revision' }), ctx)).toBe('P1');
    expect(resolveFieldValue(field({ key: 'issue' }), ctx)).toBe('FOR REVIEW');
    expect(resolveFieldValue(field({ key: 'approvedBy' }), ctx)).toBe('A. Architect');
    expect(resolveFieldValue(field({ key: 'drawnBy' }), ctx)).toBe('M. Drawer');
    expect(resolveFieldValue(field({ key: 'checkedBy' }), ctx)).toBe('C. Checker');
    expect(resolveFieldValue(field({ key: 'client' }), ctx)).toBe('Riverside Holdings Ltd');
    expect(resolveFieldValue(field({ key: 'siteAddress' }), ctx)).toBe('12 Riverside Drive');
    expect(resolveFieldValue(field({ key: 'date' }), ctx)).toBe('2026-04-15');
    expect(resolveFieldValue(field({ key: 'scale' }), ctx)).toBe('1:100');
    expect(resolveFieldValue(field({ key: 'pryzm' }), ctx)).toBe('PRYZM 2');
  });

  it('static value override wins over key resolution', () => {
    expect(resolveFieldValue(field({ key: 'projectName', value: 'Override Co.' }), ctx)).toBe('Override Co.');
  });

  it('falls back to em-dash for missing data', () => {
    const emptyCtx = { sheet: { ...sheet, revision: '' }, projectMeta: EMPTY_PROJECT_METADATA, now: FIXED_NOW };
    expect(resolveFieldValue(field({ key: 'projectName' }), emptyCtx)).toBe('—');
    expect(resolveFieldValue(field({ key: 'revision' }), emptyCtx)).toBe('—');
  });

  it('reports unknown keys visibly as [<key>]', () => {
    expect(resolveFieldValue(field({ key: 'nonsense' as never }), ctx)).toBe('[nonsense]');
  });

  it('scale falls back to AS NOTED when sheet has no viewports', () => {
    const noVpCtx = { ...ctx, sheet: { ...sheet, viewports: [] } };
    expect(resolveFieldValue(field({ key: 'scale' }), noVpCtx)).toBe('AS NOTED');
  });
});

describe('computeTitleBlockRect', () => {
  it('places bottom-right anchor inset from the right + bottom', () => {
    const tpl = getBuiltinTitleBlock('standard')!; // 180 × 60 mm, inset 10/10
    const rect = computeTitleBlockRect(tpl, 841, 594); // A1 landscape
    expect(rect.width).toBe(180);
    expect(rect.height).toBe(60);
    expect(rect.x).toBe(841 - 10 - 180);
    expect(rect.y).toBe(10);
  });

  it('handles all four anchors', () => {
    const baseTpl = getBuiltinTitleBlock('minimal')!;
    const W = 1000, H = 500, w = 120, h = 30, ix = 5, iy = 5;
    const tplBL = { ...baseTpl, defaultLayout: { ...baseTpl.defaultLayout, anchor: 'bottom-left' as const } };
    const tplTR = { ...baseTpl, defaultLayout: { ...baseTpl.defaultLayout, anchor: 'top-right' as const } };
    const tplTL = { ...baseTpl, defaultLayout: { ...baseTpl.defaultLayout, anchor: 'top-left' as const } };

    expect(computeTitleBlockRect(tplBL, W, H)).toEqual({ x: ix, y: iy, width: w, height: h });
    expect(computeTitleBlockRect(tplTR, W, H)).toEqual({ x: W - ix - w, y: H - iy - h, width: w, height: h });
    expect(computeTitleBlockRect(tplTL, W, H)).toEqual({ x: ix, y: H - iy - h, width: w, height: h });
  });
});

// ── Render: drive each template against a fake CanvasRenderingContext2D. ───
//
// We don't validate pixel output here (that's a node-canvas snapshot test
// in S40); we validate the call sequence to catch regressions like
// "renderer forgot to draw the border" or "renderer never wrote any text".

interface CallLog { name: string; args: readonly unknown[]; }

function fakeCtx(): CanvasRenderingContext2D & { __calls: CallLog[] } {
  const calls: CallLog[] = [];
  const log = (name: string, ...args: unknown[]) => { calls.push({ name, args }); };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === '__calls') return calls;
      const cached = target[prop];
      if (cached !== undefined) return cached;
      const fn = (...args: unknown[]) => log(prop, ...args);
      target[prop] = fn;
      return fn;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      log(`set:${prop}`, value);
      return true;
    },
  });
  return ctx as never;
}

describe('renderTitleBlock', () => {
  it('paints fill + stroke + at least one text run for the Standard template', () => {
    const ctx = fakeCtx();
    const tpl = getBuiltinTitleBlock('standard')!;
    renderTitleBlock(ctx, tpl, meta, sheet, 0, 0, tpl.defaultLayout.width, tpl.defaultLayout.height, FIXED_NOW);
    const names = ctx.__calls.map((c) => c.name);
    expect(names).toContain('fillRect');
    expect(names).toContain('strokeRect');
    expect(names.filter((n) => n === 'fillText').length).toBeGreaterThanOrEqual(tpl.fields.length);
  });

  it('renders border lines via stroke for templates that declare them', () => {
    const ctx = fakeCtx();
    const tpl = getBuiltinTitleBlock('architectural')!;
    renderTitleBlock(ctx, tpl, meta, sheet, 0, 0, tpl.defaultLayout.width, tpl.defaultLayout.height);
    const strokes = ctx.__calls.filter((c) => c.name === 'stroke').length;
    expect(strokes).toBeGreaterThanOrEqual(tpl.borderLines.length);
  });

  it('renders the LOGO placeholder when a template declares a logoArea', () => {
    const ctx = fakeCtx();
    const tpl = getBuiltinTitleBlock('architectural')!;
    renderTitleBlock(ctx, tpl, meta, sheet, 0, 0, tpl.defaultLayout.width, tpl.defaultLayout.height);
    const logoTexts = ctx.__calls.filter((c) => c.name === 'fillText' && c.args[0] === 'LOGO');
    expect(logoTexts.length).toBe(1);
  });

  it('renders all 3 built-in templates without throwing', () => {
    for (const tpl of BUILTIN_TITLE_BLOCK_TEMPLATES) {
      const ctx = fakeCtx();
      expect(() => renderTitleBlock(
        ctx, tpl, meta, sheet, 0, 0,
        tpl.defaultLayout.width, tpl.defaultLayout.height, FIXED_NOW,
      )).not.toThrow();
    }
  });
});
