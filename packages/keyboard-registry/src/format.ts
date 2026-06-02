// A.33.a — key-combo formatting for display.
//
// Pure: takes a KeyCombo + a Platform → returns a human-readable string.
// The platform is explicit (no `navigator.platform` sniff at file scope)
// to keep this L2-pure + deterministic in tests.

import type { KeyCombo } from './types.js';

export type Platform = 'mac' | 'win' | 'linux';

const MAC_GLYPHS: Readonly<Record<string, string>> = {
    'cmd-or-ctrl': '⌘',
    meta: '⌘',
    ctrl: '⌃',
    alt: '⌥',
    shift: '⇧',
};

const WIN_LINUX_GLYPHS: Readonly<Record<string, string>> = {
    'cmd-or-ctrl': 'Ctrl',
    meta: 'Win',
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
};

/**
 * Map of KeyboardEvent.code values to user-visible printed glyphs.
 * Only covers keys the registry actually uses; unknown codes fall through
 * to a stripped form ('KeyS' → 'S', 'Digit3' → '3', else identity).
 */
const KEY_DISPLAY: Readonly<Record<string, string>> = {
    Equal: '=',
    Minus: '-',
    Slash: '/',
    Backslash: '\\',
    Backquote: '`',
    Escape: 'Esc',
    Delete: 'Del',
    Backspace: '⌫',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Tab: 'Tab',
    Enter: 'Enter',
    Space: 'Space',
};

function stripKeyCode(code: string): string {
    if (code.startsWith('Key') && code.length === 4) return code.slice(3);
    if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
    return code;
}

/** Render a single key code (no modifiers) as user-visible. */
export function formatKey(code: string): string {
    return KEY_DISPLAY[code] ?? stripKeyCode(code);
}

/**
 * Render a key-combo for display on a specific platform.
 *
 *   formatKeyCombo({ key: 'KeyS', mod: 'cmd-or-ctrl' }, 'mac')   → '⌘ S'
 *   formatKeyCombo({ key: 'KeyS', mod: 'cmd-or-ctrl' }, 'win')   → 'Ctrl+S'
 *   formatKeyCombo({ key: 'Slash', mod: 'none', shift: true }, 'mac') → '⇧ /'
 *
 * The macOS variant uses the canonical glyphs separated by ' ' (no '+')
 * per the Apple HIG. The Windows/Linux variant uses 'Ctrl+S' per the
 * Microsoft style guide.
 */
export function formatKeyCombo(combo: KeyCombo, platform: Platform): string {
    const glyphs = platform === 'mac' ? MAC_GLYPHS : WIN_LINUX_GLYPHS;
    const parts: string[] = [];

    if (combo.mod && combo.mod !== 'none') {
        const g = glyphs[combo.mod];
        if (g) parts.push(g);
    }
    if (combo.alt) {
        const g = glyphs.alt;
        if (g) parts.push(g);
    }
    if (combo.shift) {
        const g = glyphs.shift;
        if (g) parts.push(g);
    }

    parts.push(formatKey(combo.key));

    const sep = platform === 'mac' ? ' ' : '+';
    return parts.join(sep);
}
