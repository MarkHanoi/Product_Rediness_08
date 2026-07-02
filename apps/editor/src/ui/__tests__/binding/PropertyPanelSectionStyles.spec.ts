// §FIX-PROPERTIES-PANEL-POLISH — CSS-contract test for the SHARED parametric
// section stylesheet (door + window `.dw-` sections).
//
// The founder repro was ragged value columns in the WINDOW panel: "Width 1.2 /
// Height 1.2" values not landing on one shared right-aligned column. The fix
// converges the bespoke `.dw-` sections onto the same aligned 2-column grid the
// schema-driven `.gpp-section-body` uses. These assertions lock that layout
// contract so a future edit can't silently regress alignment.
//
// Pure string assertions — imports only the CSS constant (no THREE, no stores,
// no DOM), so it is safe in any environment the root vitest config runs.
//
// Governed by C06 (UI shell & tools) + C18 (element preview visual contract).

import { describe, expect, it } from 'vitest';
import { DOOR_SECTION_STYLES } from '../../styles/panels/propertyInspector';

/** Extract the declaration block for a single CSS selector from the sheet. */
function block(css: string, selector: string): string {
    // Match `selector { ... }` (first occurrence). Selector is escaped for regex.
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    return m ? m[1] : '';
}

describe('§FIX-PROPERTIES-PANEL-POLISH — shared .dw- section layout contract', () => {
    it('section body is an aligned 2-column grid (not a ragged flex column)', () => {
        const body = block(DOOR_SECTION_STYLES, '.dw-section-body');
        expect(body).toContain('display: grid');
        expect(body).toMatch(/grid-template-columns:\s*108px\s+1fr/);
        // The old ragged layout used flex-direction:column — must be gone.
        expect(body).not.toContain('flex-direction: column');
    });

    it('.dw-field flattens onto the grid so label + control share the columns', () => {
        const field = block(DOOR_SECTION_STYLES, '.dw-field');
        expect(field).toContain('display: contents');
        // No per-field space-between flex (the source of ragged right edges).
        expect(field).not.toContain('justify-content: space-between');
    });

    it('every editable control fills the shared value column (single right edge)', () => {
        for (const sel of ['.dw-select', '.dw-toggle-row', '.dw-slider']) {
            expect(block(DOOR_SECTION_STYLES, sel)).toContain('width: 100%');
        }
        // Grouped number + text inputs also fill the column.
        expect(DOOR_SECTION_STYLES).toMatch(/\.dw-number,\s*\.dw-text\s*\{[^}]*width:\s*100%/);
        // The old fixed control widths that caused misalignment are gone.
        expect(DOOR_SECTION_STYLES).not.toContain('width: 64px');
        expect(DOOR_SECTION_STYLES).not.toContain('width: 90px');
    });

    it('toggle active state matches the class the builders actually apply', () => {
        // Builders call classList.add("active"); the CSS must target `.active`
        // (the pre-fix sheet only defined `--active`, so toggles never lit up).
        expect(DOOR_SECTION_STYLES).toContain('.dw-toggle-btn.active');
    });

    it('inputs use on-brand PRYZM accent tokens for focus/active (no black)', () => {
        expect(DOOR_SECTION_STYLES).toContain('var(--app-accent)');
        expect(DOOR_SECTION_STYLES).toContain('var(--app-gradient)');
        // Brand rule: no hard black anywhere in the parametric section sheet.
        expect(DOOR_SECTION_STYLES).not.toMatch(/#000\b|#000000\b/);
    });
});
