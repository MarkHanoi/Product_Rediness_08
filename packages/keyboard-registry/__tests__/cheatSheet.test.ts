// A.33.a — cheat-sheet data builder tests.

import { describe, expect, it } from 'vitest';
import { buildCheatSheetData } from '../src/cheatSheet.js';
import { KEYBOARD_REGISTRY, CATEGORY_ORDER } from '../src/registry.js';

describe('buildCheatSheetData()', () => {
    it('totalShortcuts equals the registry size', () => {
        const data = buildCheatSheetData('mac');
        expect(data.totalShortcuts).toBe(KEYBOARD_REGISTRY.length);
    });

    it('sections appear in CATEGORY_ORDER', () => {
        const data = buildCheatSheetData('mac');
        const order = data.sections.map((s) => s.category);
        const expected = CATEGORY_ORDER.filter((c) =>
            KEYBOARD_REGISTRY.some((s) => s.category === c),
        );
        expect(order).toEqual(expected);
    });

    it('every section has at least one row', () => {
        const data = buildCheatSheetData('mac');
        for (const s of data.sections) {
            expect(s.rows.length, s.category).toBeGreaterThan(0);
        }
    });

    it('sum of rows equals totalShortcuts', () => {
        const data = buildCheatSheetData('mac');
        const sum = data.sections.reduce((acc, s) => acc + s.rows.length, 0);
        expect(sum).toBe(data.totalShortcuts);
    });

    it('macOS render uses ⌘ glyph for cmd-or-ctrl', () => {
        const data = buildCheatSheetData('mac');
        const save = data.sections
            .find((s) => s.category === 'global')!
            .rows.find((r) => r.id === 'global.save')!;
        expect(save.primaryCombo).toBe('⌘ S');
    });

    it('Windows render uses Ctrl+ for cmd-or-ctrl', () => {
        const data = buildCheatSheetData('win');
        const save = data.sections
            .find((s) => s.category === 'global')!
            .rows.find((r) => r.id === 'global.save')!;
        expect(save.primaryCombo).toBe('Ctrl+S');
    });

    it('aliases are also formatted per platform', () => {
        const data = buildCheatSheetData('mac');
        const redo = data.sections
            .find((s) => s.category === 'global')!
            .rows.find((r) => r.id === 'global.redo')!;
        expect(redo.primaryCombo).toBe('⌘ ⇧ Z');
        expect(redo.aliasCombos).toEqual(['⌘ Y']);

        const winData = buildCheatSheetData('win');
        const redoWin = winData.sections
            .find((s) => s.category === 'global')!
            .rows.find((r) => r.id === 'global.redo')!;
        expect(redoWin.primaryCombo).toBe('Ctrl+Shift+Z');
        expect(redoWin.aliasCombos).toEqual(['Ctrl+Y']);
    });

    it('preserves registry-order within a category', () => {
        const data = buildCheatSheetData('mac');
        for (const section of data.sections) {
            const registryIds = KEYBOARD_REGISTRY.filter(
                (s) => s.category === section.category,
            ).map((s) => s.id);
            expect(section.rows.map((r) => r.id)).toEqual(registryIds);
        }
    });

    it('flags experimental shortcuts on the row', () => {
        const data = buildCheatSheetData('mac');
        // The current registry has at least one experimental entry — toggle-stats.
        const allRows = data.sections.flatMap((s) => s.rows);
        const exp = allRows.find((r) => r.experimental);
        expect(exp).toBeDefined();
        expect(exp?.id).toBe('inspect.toggle-stats');
    });

    it('platform field on output matches input', () => {
        expect(buildCheatSheetData('mac').platform).toBe('mac');
        expect(buildCheatSheetData('win').platform).toBe('win');
        expect(buildCheatSheetData('linux').platform).toBe('linux');
    });
});
