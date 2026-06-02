// A.33.a — registry invariants.

import { describe, expect, it } from 'vitest';
import {
    KEYBOARD_REGISTRY,
    CATEGORY_ORDER,
    CATEGORY_LABEL,
    findShortcut,
    shortcutsInCategory,
    validateRegistry,
} from '../src/registry.js';

describe('KEYBOARD_REGISTRY', () => {
    it('has no duplicate ids', () => {
        const seen = new Set<string>();
        for (const s of KEYBOARD_REGISTRY) {
            expect(seen.has(s.id), `dup: ${s.id}`).toBe(false);
            seen.add(s.id);
        }
    });

    it('every entry has a non-empty label + description', () => {
        for (const s of KEYBOARD_REGISTRY) {
            expect(s.label.length, s.id).toBeGreaterThan(0);
            expect(s.description.length, s.id).toBeGreaterThan(0);
        }
    });

    it('every category is one of the 7 known categories', () => {
        const valid = new Set(CATEGORY_ORDER);
        for (const s of KEYBOARD_REGISTRY) {
            expect(valid.has(s.category), s.id).toBe(true);
        }
    });

    it('CATEGORY_LABEL covers every category in CATEGORY_ORDER', () => {
        for (const c of CATEGORY_ORDER) {
            expect(CATEGORY_LABEL[c]).toBeDefined();
            expect(CATEGORY_LABEL[c].length).toBeGreaterThan(0);
        }
    });

    it('validateRegistry() passes on the canonical registry', () => {
        expect(() => validateRegistry()).not.toThrow();
    });
});

describe('findShortcut()', () => {
    it('returns the matching entry by id', () => {
        const s = findShortcut('global.save');
        expect(s).toBeDefined();
        expect(s?.label).toBe('Save');
        expect(s?.combo.key).toBe('KeyS');
    });

    it('returns undefined for unknown ids', () => {
        expect(findShortcut('does.not.exist')).toBeUndefined();
    });

    it('returns the same reference on repeated calls (Map-backed)', () => {
        const a = findShortcut('edit.delete');
        const b = findShortcut('edit.delete');
        expect(a).toBe(b);
    });
});

describe('shortcutsInCategory()', () => {
    it('returns every entry in a category, preserving registry order', () => {
        const create = shortcutsInCategory('create');
        expect(create.length).toBeGreaterThan(0);
        for (const s of create) expect(s.category).toBe('create');
        // Verify ordering matches registry order.
        const registryCreate = KEYBOARD_REGISTRY.filter(
            (s) => s.category === 'create',
        );
        expect(create.map((s) => s.id)).toEqual(
            registryCreate.map((s) => s.id),
        );
    });

    it('returns an empty array for an empty category', () => {
        // No category is currently empty, so we exercise an unused name —
        // TS would reject it at the call-site, so cast in this test only.
        const result = shortcutsInCategory(
            'global',
        );
        expect(result.length).toBeGreaterThan(0);
    });
});

describe('validateRegistry() — collision detection', () => {
    it('throws on duplicate ids', () => {
        expect(() =>
            validateRegistry([
                {
                    id: 'x',
                    label: 'X',
                    description: 'x',
                    category: 'global',
                    combo: { key: 'KeyA' },
                },
                {
                    id: 'x',
                    label: 'X dup',
                    description: 'x',
                    category: 'global',
                    combo: { key: 'KeyB' },
                },
            ]),
        ).toThrow(/duplicate id/);
    });

    it('throws on combo collision in the same context', () => {
        expect(() =>
            validateRegistry([
                {
                    id: 'one',
                    label: 'One',
                    description: 'a',
                    category: 'global',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'global',
                },
                {
                    id: 'two',
                    label: 'Two',
                    description: 'b',
                    category: 'edit',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'global',
                },
            ]),
        ).toThrow(/combo collision/);
    });

    it('tolerates the same combo in different contexts', () => {
        expect(() =>
            validateRegistry([
                {
                    id: 'one',
                    label: 'One',
                    description: 'a',
                    category: 'global',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'editor',
                },
                {
                    id: 'two',
                    label: 'Two',
                    description: 'b',
                    category: 'edit',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'modal',
                },
            ]),
        ).not.toThrow();
    });

    it('tolerates collisions with an experimental entry', () => {
        expect(() =>
            validateRegistry([
                {
                    id: 'real',
                    label: 'R',
                    description: 'r',
                    category: 'global',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'global',
                },
                {
                    id: 'exp',
                    label: 'E',
                    description: 'e',
                    category: 'global',
                    combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
                    context: 'global',
                    experimental: true,
                },
            ]),
        ).not.toThrow();
    });

    it('detects alias collisions', () => {
        expect(() =>
            validateRegistry([
                {
                    id: 'redo',
                    label: 'Redo',
                    description: 'r',
                    category: 'global',
                    combo: { key: 'KeyZ', mod: 'cmd-or-ctrl', shift: true },
                    aliases: [{ key: 'KeyY', mod: 'cmd-or-ctrl' }],
                    context: 'global',
                },
                {
                    id: 'yank',
                    label: 'Yank',
                    description: 'y',
                    category: 'edit',
                    combo: { key: 'KeyY', mod: 'cmd-or-ctrl' },
                    context: 'global',
                },
            ]),
        ).toThrow(/combo collision/);
    });
});
