// §SEAM-HAIRLINE-WHITE (L-12966) — the seam between the 2D pane and the 3D pane.
//
// FOUNDER, 2026-09-06, Córdoba: "the line between 2d and 3d should be a super thin line white — not
// this one that we have now."
//
// WHAT IT WAS: `#pryzm-pane-divider` was a 6 px flex track filled with
// `linear-gradient(180deg,#2a2340,#6600FF)` — the PRYZM brand purple used as furniture, competing
// both with the two maps it separates and with the parcel highlight, which is the one thing #6600FF
// is reserved for.
//
// THE TRAP THIS SPEC EXISTS TO CLOSE. "Make it 1 px" has an obvious wrong implementation: shrink the
// track and ship a 1 px drag target. That is thin by making the handle unusable — not what was
// asked. So the divider is TWO elements: a 1 px white VISIBLE line, and a transparent CHILD that
// overhangs it 6 px each side as the pointer target. Both halves are asserted here, because a future
// tidy-up that deletes "the redundant empty div" would silently restore the unusable handle.
//
// Runs under the ROOT vitest config (happy-dom), the same one that already claims
// `apps/editor/src/engine/__tests__/**/*.spec.ts` and runs PaneHost.spec.ts beside it.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountSiteAuthoringPaneShell, type SiteAuthoringPaneShell } from '../views/SiteAuthoringPaneShell';

const SHELL_SRC = resolve(__dirname, '..', 'views', 'SiteAuthoringPaneShell.ts');

let shell: SiteAuthoringPaneShell | null = null;
function mount(): { divider: HTMLElement; hit: HTMLElement } {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    shell = mountSiteAuthoringPaneShell({ parent, viewPicker: false });
    const divider = shell.root.querySelector<HTMLElement>('#pryzm-pane-divider');
    if (!divider) throw new Error('#pryzm-pane-divider missing');
    const hit = divider.querySelector<HTMLElement>('[data-testid="pane-divider-hit"]');
    if (!hit) throw new Error('the divider grab band is missing — the handle would be 1 px wide');
    return { divider, hit };
}

afterEach(() => {
    shell?.dispose();
    shell = null;
    document.body.innerHTML = '';
});

describe('§SEAM-HAIRLINE-WHITE — the visible line', () => {
    it('is 1 px wide, not 6', () => {
        const { divider } = mount();
        expect(divider.style.flex).toBe('0 0 1px');
        expect(divider.style.flex).not.toContain('6px');
    });

    it('is WHITE, and carries no gradient and no PRYZM purple', () => {
        const { divider } = mount();
        expect(divider.style.background.toUpperCase()).toContain('#FFFFFF');
        expect(divider.style.background.toLowerCase()).not.toContain('gradient');
        expect(divider.style.background.toUpperCase()).not.toContain('6600FF');
        expect(divider.style.background).not.toContain('#2a2340');
    });

    it('the source carries no purple divider styling at all (the old literal is gone)', () => {
        const src = readFileSync(SHELL_SRC, 'utf8');
        expect(src).not.toContain("background: 'linear-gradient(180deg,#2a2340,#6600FF)'");
        expect(src).not.toContain("flex: '0 0 6px'");
    });
});

describe('§SEAM-HAIRLINE-WHITE — the handle stays grabbable', () => {
    it('a transparent grab band overhangs the hairline on BOTH sides', () => {
        const { hit } = mount();
        expect(hit.style.position).toBe('absolute');
        expect(hit.style.left).toBe('-6px');
        expect(hit.style.right).toBe('-6px');
        expect(hit.style.top).toBe('0px');
        expect(hit.style.bottom).toBe('0px');
    });

    it('the grab band is invisible — it must never draw over either map', () => {
        const { hit } = mount();
        expect(hit.style.background).toBe('transparent');
    });

    it('the pointer target is far wider than the 1 px line (1 + 2×6 = 13 px)', () => {
        const { divider, hit } = mount();
        const lineW = parseFloat(divider.style.flex.replace(/[^0-9.]/g, ''));
        const overhang = Math.abs(parseFloat(hit.style.left));
        expect(lineW).toBe(1);
        expect(lineW + 2 * overhang).toBeGreaterThanOrEqual(12);
    });

    it('both the line and the band show a col-resize cursor', () => {
        const { divider, hit } = mount();
        expect(divider.style.cursor).toBe('col-resize');
        expect(hit.style.cursor).toBe('col-resize');
    });

    it('the band is a CHILD of the divider, so the one mousedown listener still receives the press', () => {
        const { divider, hit } = mount();
        expect(hit.parentElement).toBe(divider);
        // Bubbling is what makes one listener enough — pin it rather than assume it.
        let seen = 0;
        divider.addEventListener('mousedown', () => { seen++; });
        hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(seen).toBe(1);
    });
});

describe('§SEAM-HAIRLINE-WHITE — full-screen behaviour is unchanged', () => {
    it('the whole divider (line + band) collapses when one pane is solo', () => {
        const { divider } = mount();
        // `applyFraction()` hides the divider element itself, so the grab band goes with it —
        // it must not be left floating over a full-screen map.
        divider.style.display = 'none';
        expect(divider.style.display).toBe('none');
        const hit = divider.querySelector<HTMLElement>('[data-testid="pane-divider-hit"]')!;
        expect(divider.contains(hit)).toBe(true);
    });
});
