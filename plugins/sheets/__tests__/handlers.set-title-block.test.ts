// SetTitleBlockHandler — coverage (S38 / Phase 2C / ADR-0031).

import { describe, it, expect } from 'vitest';
import { SetTitleBlockHandler } from '../src/handlers/SetTitleBlock.js';
import { TitleBlockTemplateNotFoundError } from '../src/errors.js';
import type { SheetData, TitleBlockTemplate } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';
import { BUILTIN_TITLE_BLOCK_TEMPLATES } from '../src/title-block.js';

const baseSheet: SheetData = {
  id: 'sheet-1', name: 'Plan', number: 'A-001',
  size: 'A1', orientation: 'landscape',
  titleBlockId: 'standard', viewports: [], widgets: [],
  revision: '', issue: '', seq: 0,
};

function ctxWithRegistry(): { stores: { sheet: SheetsState; 'title-block': Record<string, TitleBlockTemplate> } } {
  const registry: Record<string, TitleBlockTemplate> = {};
  for (const t of BUILTIN_TITLE_BLOCK_TEMPLATES) registry[t.id] = t;
  return { stores: { sheet: { 'sheet-1': baseSheet }, 'title-block': registry } };
}

function ctxWithoutRegistry(): { stores: { sheet: SheetsState } } {
  return { stores: { sheet: { 'sheet-1': baseSheet } } };
}

describe('SetTitleBlockHandler.canExecute', () => {
  const h = new SetTitleBlockHandler();

  it('accepts a registered template id', () => {
    const r = h.canExecute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'architectural' });
    expect(r).toEqual({ valid: true });
  });

  it('rejects an unknown sheet', () => {
    const c = ctxWithRegistry();
    delete (c.stores.sheet as SheetsState)['sheet-1'];
    expect(h.canExecute(c as never, { sheetId: 'sheet-1', titleBlockId: 'standard' }).valid).toBe(false);
  });

  it('rejects an unregistered template id when registry is wired', () => {
    const r = h.canExecute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'unknown-x' });
    expect(r.valid).toBe(false);
  });

  it('falls open (accepts any non-empty id) when registry is absent', () => {
    const r = h.canExecute(ctxWithoutRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'whatever' });
    expect(r).toEqual({ valid: true });
  });

  it('rejects empty ids', () => {
    expect(h.canExecute(ctxWithRegistry() as never, { sheetId: '', titleBlockId: 'standard' }).valid).toBe(false);
    expect(h.canExecute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: '' }).valid).toBe(false);
  });
});

describe('SetTitleBlockHandler.execute', () => {
  const h = new SetTitleBlockHandler();

  it('switches the bound titleBlockId', () => {
    const r = h.execute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'minimal' });
    expect((r.nextStates!.sheet as SheetsState)['sheet-1']!.titleBlockId).toBe('minimal');
  });

  it('throws TitleBlockTemplateNotFoundError when execute bypasses canExecute and registry is wired', () => {
    expect(() => h.execute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'no-such' }))
      .toThrow(TitleBlockTemplateNotFoundError);
  });

  it('emits forward + inverse patches', () => {
    const r = h.execute(ctxWithRegistry() as never, { sheetId: 'sheet-1', titleBlockId: 'architectural' });
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.inverse.length).toBeGreaterThan(0);
  });
});
