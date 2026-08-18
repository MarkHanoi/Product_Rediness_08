// @vitest-environment happy-dom
//
// §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — the creation panel must offer the SAME types
// the property panel does, and must keep offering them as more are published.
//
// The founder's report was that the wall creation panel offers a type dropdown while the
// curtain-wall one asked for four raw numbers. The fix is small; the way it goes wrong is
// not. A hand-copied list of type names would satisfy the screenshot, pass a shallow test,
// and then silently omit every type published afterwards — discovered only when someone
// asks why a type they can see with a wall SELECTED is missing when they go to DRAW one.
//
// So the load-bearing test here is not "a dropdown exists". It is that a type added to the
// store at RUNTIME appears in the panel without the panel being touched. That assertion is
// unsatisfiable by any hard-coded list, which is the point.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showCurtainWallPreDraw } from '../src/ui/property-panel/PropertyPanelPreDraw';
import { curtainWallTypeStore } from '@pryzm/core-app-model';

const CUSTOM_ID = 'cw.test.only-published-later';

function makeHost() {
    const element = document.createElement('div');
    document.body.appendChild(element);
    return {
        element,
        clearForPreDraw: () => { element.innerHTML = ''; },
        buildCloseBtn: () => document.createElement('button'),
        makeVisible: () => {},
        positionBesideModeBar: () => {},
    };
}

/** A tool double exposing only the pre-draw surface the panel actually uses. */
function makeTool() {
    let config: Record<string, unknown> = {};
    return {
        getPredrawConfig: () => ({ ...config }),
        setPredrawConfig: (c: Record<string, unknown>) => { config = { ...config, ...c }; },
        readConfig: () => config,
    };
}

function optionValues(host: { element: HTMLElement }): string[] {
    const sel = host.element.querySelector('select');
    return sel ? Array.from(sel.options).map(o => o.value).filter(v => v && !v.startsWith('__')) : [];
}

describe('§FEAT-CURTAIN-WALL-CREATE-TYPE — the creation panel reads the catalogue', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        try { curtainWallTypeStore.remove(CUSTOM_ID); } catch { /* not added */ }
    });

    it('renders a type dropdown listing the published types', () => {
        const host = makeHost();
        showCurtainWallPreDraw(host as never, makeTool());

        const published = curtainWallTypeStore.getAll().map(t => t.id);
        expect(published.length).toBeGreaterThan(0);
        expect(optionValues(host).sort()).toEqual([...published].sort());
    });

    it('⭐ a type published LATER appears without touching this panel', () => {
        // The anti-hard-coding assertion. No copied list can pass this.
        const before = makeHost();
        showCurtainWallPreDraw(before as never, makeTool());
        expect(optionValues(before)).not.toContain(CUSTOM_ID);

        curtainWallTypeStore.add({
            id: CUSTOM_ID,
            name: 'Published after the panel was written',
            description: 'Proves the panel reads the store rather than a copy of it.',
            mullionPitch: 1.25,
            transomCourse: undefined,
            mullionSize: 0.045,
            panelThickness: 0.024,
        });

        const after = makeHost();
        showCurtainWallPreDraw(after as never, makeTool());
        expect(optionValues(after)).toContain(CUSTOM_ID);
    });

    it('DEFAULTS to drawable: no type chosen, and the hint says so', () => {
        // Parity of BEHAVIOUR, not just of widget — a user must be able to draw
        // immediately without opening the dropdown.
        const host = makeHost();
        showCurtainWallPreDraw(host as never, makeTool());

        expect(host.element.textContent).toContain('Plain Curtain Wall ready');
        expect(host.element.textContent).toContain('click two points on the canvas');
    });

    it('arming a type pushes its grid + mullion + finish down to the tool', () => {
        const host = makeHost();
        const tool = makeTool();
        showCurtainWallPreDraw(host as never, tool);

        const sel = host.element.querySelector('select') as HTMLSelectElement;
        sel.value = 'cw.metal.copper-frame';
        sel.dispatchEvent(new Event('change'));

        const cfg = tool.readConfig();
        expect(cfg.systemTypeId).toBe('cw.metal.copper-frame');
        expect(cfg.uSpacing).toBe(1.0);          // the type's mullion pitch
        expect(cfg.mullionSize).toBe(0.04);      // "small" section
        expect(cfg.mullionMaterialId).toBe('copper-new');
        expect(cfg.glazingMaterialId).toBe('aluminium-brushed-dark');
    });

    it('HEIGHT re-resolves the armed type — a taller wall must not gain a transom', () => {
        // The height-agnostic rule, arriving at creation time. `transomCourse: undefined`
        // means "top and bottom rails only", and the V spacing expressing it depends on
        // the wall's own height: numV = max(1, floor(height / vSpacing)). Picking a type at
        // 3 m and then typing 6 m must not lay a transom across the facade.
        const host = makeHost();
        const tool = makeTool();
        showCurtainWallPreDraw(host as never, tool);

        const sel = host.element.querySelector('select') as HTMLSelectElement;
        sel.value = 'cw.glazed.pitch-1000';
        sel.dispatchEvent(new Event('change'));
        expect(tool.readConfig().vSpacing).toBe(3);

        const heightInput = host.element.querySelector('input[type="number"]') as HTMLInputElement;
        heightInput.value = '6';
        heightInput.dispatchEvent(new Event('change'));

        const cfg = tool.readConfig();
        expect(cfg.height).toBe(6);
        expect(cfg.vSpacing).toBe(6);
        expect(Math.max(1, Math.floor(6 / (cfg.vSpacing as number)))).toBe(1);
    });
});
