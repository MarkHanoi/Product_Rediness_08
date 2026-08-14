// Sheet handler registration coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import { CommandBus } from '@pryzm/plugin-sdk';
import {
  buildSheetHandlerSet,
  registerSheetHandlers,
  SHEET_HANDLER_TYPES,
} from '../src/handlers/index.js';

const EXPECTED_TYPES = [
  // S37
  'sheet.create',
  'sheet.delete',
  'sheet.rename',
  'sheet.reorder',
  // S38 — NB 'sheet.addViewport' is deliberately ABSENT: its live arm is the
  // initBusHandlers §E.5.5 bridge (§FIX-SHEET-ADDVIEWPORT-SHADOW, MT-03; see
  // __tests__/addViewportShadow.test.ts).
  'sheet.removeViewport',
  'sheet.setViewportScale',
  'sheet.setTitleBlock',
  'sheet.setSheetMetadata',
  // S39
  'sheet.addWidget',
  'sheet.removeWidget',
] as const;

describe('buildSheetHandlerSet', () => {
  it('returns all 10 handlers in S37→S39 declaration order', () => {
    const set = buildSheetHandlerSet();
    expect(set.map((h) => h.type)).toEqual([...EXPECTED_TYPES]);
  });

  it('SHEET_HANDLER_TYPES is the parallel constant', () => {
    expect(SHEET_HANDLER_TYPES).toEqual([...EXPECTED_TYPES]);
  });

  it('every handler declares affectedStores=[sheet]', () => {
    for (const h of buildSheetHandlerSet()) {
      expect(h.affectedStores).toEqual(['sheet']);
    }
  });
});

describe('registerSheetHandlers', () => {
  it('registers all 10 handlers on a fresh CommandBus', () => {
    const bus = new CommandBus({
      storesProvider: () => ({ sheet: {} }),
      audit: { actorId: 'test', projectId: 'p', clientId: 'c' },
    });
    const types = registerSheetHandlers(bus);
    expect(types).toEqual([...SHEET_HANDLER_TYPES]);
    for (const t of types) expect(bus.has(t)).toBe(true);
  });
});
