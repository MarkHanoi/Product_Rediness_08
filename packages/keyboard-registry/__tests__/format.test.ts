// A.33.a — combo formatting.

import { describe, expect, it } from 'vitest';
import { formatKey, formatKeyCombo } from '../src/format.js';

describe('formatKey()', () => {
    it('strips Key/Digit prefixes for alphanumeric keys', () => {
        expect(formatKey('KeyS')).toBe('S');
        expect(formatKey('KeyA')).toBe('A');
        expect(formatKey('Digit3')).toBe('3');
        expect(formatKey('Digit0')).toBe('0');
    });

    it('uses canonical glyphs for punctuation / arrow / edit keys', () => {
        expect(formatKey('Equal')).toBe('=');
        expect(formatKey('Minus')).toBe('-');
        expect(formatKey('Slash')).toBe('/');
        expect(formatKey('Backslash')).toBe('\\');
        expect(formatKey('Backquote')).toBe('`');
        expect(formatKey('Escape')).toBe('Esc');
        expect(formatKey('Delete')).toBe('Del');
        expect(formatKey('Backspace')).toBe('⌫');
        expect(formatKey('PageUp')).toBe('PgUp');
        expect(formatKey('PageDown')).toBe('PgDn');
        expect(formatKey('ArrowUp')).toBe('↑');
        expect(formatKey('ArrowDown')).toBe('↓');
        expect(formatKey('ArrowLeft')).toBe('←');
        expect(formatKey('ArrowRight')).toBe('→');
    });

    it('passes function keys through unchanged', () => {
        expect(formatKey('F1')).toBe('F1');
        expect(formatKey('F12')).toBe('F12');
    });
});

describe('formatKeyCombo() — macOS', () => {
    it('uses ⌘ for cmd-or-ctrl', () => {
        expect(
            formatKeyCombo({ key: 'KeyS', mod: 'cmd-or-ctrl' }, 'mac'),
        ).toBe('⌘ S');
    });

    it('combines shift + cmd-or-ctrl', () => {
        expect(
            formatKeyCombo(
                { key: 'KeyZ', mod: 'cmd-or-ctrl', shift: true },
                'mac',
            ),
        ).toBe('⌘ ⇧ Z');
    });

    it('handles shift-only combos (no mod)', () => {
        expect(
            formatKeyCombo({ key: 'Slash', mod: 'none', shift: true }, 'mac'),
        ).toBe('⇧ /');
    });

    it('handles alt + cmd-or-ctrl', () => {
        expect(
            formatKeyCombo(
                { key: 'KeyA', mod: 'cmd-or-ctrl', alt: true },
                'mac',
            ),
        ).toBe('⌘ ⌥ A');
    });

    it('renders bare keys without any modifier glyphs', () => {
        expect(formatKeyCombo({ key: 'Escape', mod: 'none' }, 'mac')).toBe(
            'Esc',
        );
        expect(formatKeyCombo({ key: 'KeyW', mod: 'none' }, 'mac')).toBe('W');
    });
});

describe('formatKeyCombo() — Windows / Linux', () => {
    it('uses Ctrl+S for cmd-or-ctrl', () => {
        expect(
            formatKeyCombo({ key: 'KeyS', mod: 'cmd-or-ctrl' }, 'win'),
        ).toBe('Ctrl+S');
        expect(
            formatKeyCombo({ key: 'KeyS', mod: 'cmd-or-ctrl' }, 'linux'),
        ).toBe('Ctrl+S');
    });

    it('joins modifiers with + (not spaces)', () => {
        expect(
            formatKeyCombo(
                { key: 'KeyZ', mod: 'cmd-or-ctrl', shift: true },
                'win',
            ),
        ).toBe('Ctrl+Shift+Z');
    });

    it('uses Alt for the alt modifier', () => {
        expect(
            formatKeyCombo(
                { key: 'KeyA', mod: 'cmd-or-ctrl', alt: true },
                'win',
            ),
        ).toBe('Ctrl+Alt+A');
    });

    it('renders bare keys without any modifier prefix', () => {
        expect(formatKeyCombo({ key: 'KeyW', mod: 'none' }, 'win')).toBe('W');
        expect(formatKeyCombo({ key: 'F1', mod: 'none' }, 'win')).toBe('F1');
    });
});
