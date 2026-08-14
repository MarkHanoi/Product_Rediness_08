// wave-6-c-d10: Real binding test — QuantityToolbar
import { describe, expect, it, vi } from 'vitest';
import { QuantityToolbar, QUANTITY_TOOLBAR_ID, QUANTITY_TOOLBAR_BUTTONS } from '../QuantityToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { isBacked } from '../commandBacking.js';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('QuantityToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct QUANTITY_TOOLBAR_ID constant', () => {
        expect(QUANTITY_TOOLBAR_ID).toBe('quantity-toolbar');
    });

    it('exposes 10 button definitions', () => {
        expect(QUANTITY_TOOLBAR_BUTTONS.length).toBe(10);
    });

    it('contains quantity-material-takeoff command', () => {
        expect(QUANTITY_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('quantity-material-takeoff');
    });

    it('contains quantity-export-csv command', () => {
        expect(QUANTITY_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('quantity-export-csv');
    });

    it('constructs without throwing', () => {
        expect(() => new QuantityToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new QuantityToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new QuantityToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Quantity toolbar"', () => {
        expect(new QuantityToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Quantity toolbar');
    });

    it.each(QUANTITY_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches when BACKED, refuses visibly when not',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new QuantityToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            // §L-MOUNT Phase 3 — THE CONTRACT CHANGED, and it changed because the old
            // one was false. These specs used to assert that EVERY button dispatches;
            // the H6 probe + the Phase-1 census measured that 276 of the 280 declared
            // verbs have no handler anywhere, so "dispatches" meant "dispatches into
            // nothing" — the §C-B1 silent no-op, asserted as a feature. A backed verb
            // must still dispatch; an unbacked one must REFUSE, visibly.
            if (isBacked(commandType)) {
                expect(btn.disabled).toBe(false);
                expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
            } else {
                expect(btn.disabled).toBe(true);
                expect(btn.getAttribute('data-unbacked')).toBe('1');
                expect(btn.getAttribute('aria-disabled')).toBe('true');
                expect(btn.title).toContain(commandType);
                expect(runtime.bus.executeCommand).not.toHaveBeenCalled();
            }
        },
    );

    it('triggerCommand() dispatches when BACKED, refuses when not', () => {
        const runtime = makeRuntime();
        const toolbar = new QuantityToolbar(runtime);
        toolbar.triggerCommand('quantity-material-takeoff');
        // §L-MOUNT Phase 3 — triggerCommand is the PROGRAMMATIC door (keyboard
        // shortcuts). `disabled` cannot guard it, so refuseUnbacked() does.
        if (isBacked('quantity-material-takeoff')) {
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith('quantity-material-takeoff', expect.any(Object));
        } else {
            expect(runtime.bus.executeCommand).not.toHaveBeenCalled();
        }
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new QuantityToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new QuantityToolbar(makeRuntime()).element.querySelectorAll('.qtb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 10 buttons in the DOM', () => {
        expect(new QuantityToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(10);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new QuantityToolbar(makeRuntime()).element.querySelectorAll('.qtb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new QuantityToolbar(makeRuntime()).element.querySelectorAll('.qtb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new QuantityToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new QuantityToolbar(null).element.querySelector('[data-command="quantity-material-takeoff"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
