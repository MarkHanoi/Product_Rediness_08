/**
 * §POPUP-SURVIVES-ITS-OWN-CONTROLS (founder 2026-09-08 · L-13258 · C59 §1.5)
 *
 * THE ASK, VERBATIM:
 *   *"When i try to click the pane dropdown to access to other levels, elevations etc... it
 *    doesnt get static - it appears and goes off - check this is importnnat."*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ A DEFECT THIS SESSION'S OWN LANE INTRODUCED, INTO A CONTROL THAT WORKED BEFORE IT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `ViewSwitcherPill`'s popup closed on a click ANYWHERE in its body — correct while the body
 * held only row-buttons, where the interaction IS the click. §ONE-REGION-SWITCHER (L-13257)
 * then moved the plan pane's view-definition `<select>` INTO that body, so reaching for a
 * level or an elevation closed the popup and tore the native option list away with it.
 *
 * ⭐ THE FIX IS KEYED ON THE CONTROL, NOT ON A LIST OF CALLERS — so the next control a host
 * puts in a popup is handled without editing the pill, and a host cannot forget to opt out.
 *
 *   ARM A — the predicate is right about what owns a longer interaction, and about what does not.
 *   ARM B — ⭐ THE LIVE POPUP: a click on a `<select>` LEAVES IT OPEN; a click on a row CLOSES it.
 *   ARM C — the escape hatch works for a widget the predicate cannot see.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
    VIEW_SWITCHER_PILL_POPUP_TESTID,
    VIEW_SWITCHER_PILL_TRIGGER_TESTID,
    clickOwnsItsOwnInteraction,
    mountViewSwitcherPill,
} from '../views/ViewSwitcherPill';

const hosts: HTMLElement[] = [];
const mount = (fill: (body: HTMLElement) => void) => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    hosts.push(parent);
    const h = mountViewSwitcherPill({
        parent,
        label: () => 'Ground Floor',
        mountMenu: (body) => {
            fill(body);
            return { repaint: () => {}, dispose: () => {} };
        },
    });
    const q = <T extends Element>(sel: string): T => parent.querySelector<T>(sel)!;
    return {
        h,
        trigger: q<HTMLButtonElement>(`[data-testid="${VIEW_SWITCHER_PILL_TRIGGER_TESTID}"]`),
        popup: q<HTMLElement>(`[data-testid="${VIEW_SWITCHER_PILL_POPUP_TESTID}"]`),
        parent,
    };
};
const isOpen = (popup: HTMLElement): boolean => popup.style.display !== 'none';

afterEach(() => {
    for (const h of hosts.splice(0)) h.remove();
});

describe('§POPUP-SURVIVES-ITS-OWN-CONTROLS — ARM A · the predicate', () => {
    const el = (html: string): Element => {
        const d = document.createElement('div');
        d.innerHTML = html;   // test fixture only — never a production sink (C08 §3.1).
        return d.firstElementChild!;
    };

    it('⭐ controls whose interaction OUTLIVES the click are protected', () => {
        for (const html of [
            '<select><option>a</option></select>',
            '<input type="text" />',
            '<input type="checkbox" />',
            '<textarea></textarea>',
            '<label>x</label>',
            '<div data-keep-popup-open="true">custom</div>',
        ]) {
            expect(clickOwnsItsOwnInteraction(el(html)), html).toBe(true);
        }
    });

    it('⛔ a row-button is NOT — its interaction IS the click, so the popup must close', () => {
        // Leaving the popup open over a view that just changed is the L-13002 shape.
        for (const html of ['<button>2D Site Map</button>', '<div>plain</div>', '<span>x</span>']) {
            expect(clickOwnsItsOwnInteraction(el(html)), html).toBe(false);
        }
    });

    it('it matches through a DESCENDANT — the click lands on the option, not the select', () => {
        const sel = el('<select><option id="o">Ground Floor</option></select>');
        document.body.appendChild(sel);
        expect(clickOwnsItsOwnInteraction(sel.querySelector('#o')!)).toBe(true);
        sel.remove();
    });
});

describe('§POPUP-SURVIVES-ITS-OWN-CONTROLS — ARM B · the live popup', () => {
    it('⭐ clicking the view-definition SELECT leaves the popup open (the founder\'s case)', () => {
        const { trigger, popup, parent } = mount((body) => {
            const s = document.createElement('select');
            s.setAttribute('data-testid', 'svp-view-select-fake');
            const o = document.createElement('option');
            o.textContent = 'Ground Floor';
            s.appendChild(o);
            body.appendChild(s);
        });
        trigger.click();
        expect(isOpen(popup), 'the pill must open').toBe(true);
        parent.querySelector<HTMLSelectElement>('[data-testid="svp-view-select-fake"]')!.click();
        // ⛔ BEFORE L-13258 THIS WAS FALSE — the popup closed and took the native option
        // list with it, which is exactly *"it appears and goes off"*.
        expect(isOpen(popup), 'reaching for a level must not close the popup').toBe(true);
    });

    it('⛔ clicking a view ROW still closes it — the fix is narrow', () => {
        const { trigger, popup, parent } = mount((body) => {
            const b = document.createElement('button');
            b.setAttribute('data-testid', 'row-fake');
            b.textContent = '2D Site Map';
            body.appendChild(b);
        });
        trigger.click();
        expect(isOpen(popup)).toBe(true);
        parent.querySelector<HTMLButtonElement>('[data-testid="row-fake"]')!.click();
        expect(isOpen(popup), 'a dispatched view change must close the popup').toBe(false);
    });

    it('a click OUTSIDE still closes it', () => {
        const { trigger, popup } = mount((body) => { body.appendChild(document.createElement('select')); });
        trigger.click();
        expect(isOpen(popup)).toBe(true);
        document.body.click();
        expect(isOpen(popup)).toBe(false);
    });

    it('the trigger still toggles', () => {
        const { trigger, popup } = mount(() => {});
        trigger.click();
        expect(isOpen(popup)).toBe(true);
        trigger.click();
        expect(isOpen(popup)).toBe(false);
    });
});

describe('§POPUP-SURVIVES-ITS-OWN-CONTROLS — ARM C · the escape hatch', () => {
    it('a custom widget marked `data-keep-popup-open` survives', () => {
        const { trigger, popup, parent } = mount((body) => {
            const w = document.createElement('div');
            w.setAttribute('data-keep-popup-open', 'true');
            const inner = document.createElement('span');
            inner.setAttribute('data-testid', 'custom-inner');
            w.appendChild(inner);
            body.appendChild(w);
        });
        trigger.click();
        parent.querySelector<HTMLElement>('[data-testid="custom-inner"]')!.click();
        expect(isOpen(popup)).toBe(true);
    });
});
