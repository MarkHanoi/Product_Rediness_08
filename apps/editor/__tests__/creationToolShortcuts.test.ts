// creationToolShortcuts — pure tooltip/shortcut SSOT tests (§CREATE-SHORTCUT-SSOT).
//
// Guards the founder's two asks on the CREATE-rail (discipline accordion):
//   1. EVERY creation tool the panel renders has a keyboard shortcut.
//   2. The hover tooltip composes "Name (Shortcut)" from the SAME map the key
//      handler fires on — so they can never drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    CREATION_TOOL_SHORTCUTS,
    shortcutForTool,
    formatTooltip,
    assertNoShortcutCollisions,
} from '../src/ui/tools-panel/panels/creationToolShortcuts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL_SRC = resolve(
    __dirname,
    '../src/ui/tools-panel/panels/CreateRailPanel.ts',
);

describe('formatTooltip', () => {
    it('renders "Name (Shortcut)" when a shortcut is present', () => {
        expect(formatTooltip('Wall', 'Alt+W')).toBe('Wall (Alt+W)');
        expect(formatTooltip('Roof (2pt)', 'Alt+O')).toBe('Roof (2pt) (Alt+O)');
    });

    it('renders just the name when there is no shortcut (no empty brackets)', () => {
        expect(formatTooltip('Wall', undefined)).toBe('Wall');
        expect(formatTooltip('Wall', null)).toBe('Wall');
        expect(formatTooltip('Wall', '')).toBe('Wall');
        expect(formatTooltip('Wall', '   ')).toBe('Wall');
    });
});

describe('CREATION_TOOL_SHORTCUTS map', () => {
    it('has no two tools sharing the same combo', () => {
        expect(() => assertNoShortcutCollisions()).not.toThrow();
    });

    it('every shortcut is Alt-prefixed (Contract 11 — off the single-letter layer)', () => {
        for (const [label, spec] of Object.entries(CREATION_TOOL_SHORTCUTS)) {
            expect(spec.split('+').map((p) => p.trim()), `${label} must start with Alt`)
                .toContain('Alt');
        }
    });

    it('shortcutForTool resolves known labels and returns undefined for unknown', () => {
        expect(shortcutForTool('Wall')).toBe('Alt+W');
        expect(shortcutForTool('Plants')).toBe('Alt+Shift+P');
        expect(shortcutForTool('Nonexistent Tool')).toBeUndefined();
    });
});

describe('CREATE-rail completeness (every rendered tool has a shortcut)', () => {
    // Extract every `label: '...'` declared inside CreateRailPanel._buildSections.
    // This reads the live source so a newly-added tool without a map entry fails.
    // The 5 accordion DISCIPLINE headings are `label:` too, but they are
    // category headers, not creatable tools — they have no shortcut by design.
    const SECTION_LABELS = new Set([
        'Architecture', 'Structure', 'Services', 'Interiors', 'Landscape',
    ]);

    function panelToolLabels(): string[] {
        const src = readFileSync(PANEL_SRC, 'utf8');
        const start = src.indexOf('_buildSections(');
        expect(start, '_buildSections must exist in CreateRailPanel').toBeGreaterThan(-1);
        // The method is the last one in the class; scan to end of file.
        const body = src.slice(start);
        const labels: string[] = [];
        const re = /label:\s*'((?:[^'\\]|\\.)*)'/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(body)) !== null) {
            const label = m[1].replace(/\\'/g, "'");
            if (SECTION_LABELS.has(label)) continue;     // discipline headings
            if (/^Plant \d+$/.test(label)) continue;     // plant-subpanel leaf items
            labels.push(label);
        }
        return labels;
    }

    it('finds the architecture tools (sanity check on extraction)', () => {
        const labels = panelToolLabels();
        expect(labels).toContain('Wall');
        expect(labels).toContain('Door');
        expect(labels).toContain('Window');
        expect(labels.length).toBeGreaterThanOrEqual(40);
    });

    it('every tool label rendered by the panel has a shortcut in the map', () => {
        const labels = panelToolLabels();
        const missing = labels.filter((l) => !CREATION_TOOL_SHORTCUTS[l]);
        expect(missing, `tools missing a shortcut: ${missing.join(', ')}`).toEqual([]);
    });
});
