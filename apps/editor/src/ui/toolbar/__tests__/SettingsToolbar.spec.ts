// wave-6-c-d10: Real binding test — SettingsToolbar
import { describe, expect, it, vi } from 'vitest';
import { SettingsToolbar, SETTINGS_TOOLBAR_ID, SETTINGS_TOOLBAR_BUTTONS } from '../SettingsToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('SettingsToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct SETTINGS_TOOLBAR_ID constant', () => {
        expect(SETTINGS_TOOLBAR_ID).toBe('settings-toolbar');
    });

    it('exposes 12 button definitions', () => {
        expect(SETTINGS_TOOLBAR_BUTTONS.length).toBe(12);
    });

    it('contains settings-open command', () => {
        expect(SETTINGS_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('settings-open');
    });

    it('contains settings-shortcuts command', () => {
        expect(SETTINGS_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('settings-shortcuts');
    });

    it('contains settings-license command', () => {
        expect(SETTINGS_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('settings-license');
    });

    it('constructs without throwing', () => {
        expect(() => new SettingsToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new SettingsToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new SettingsToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Settings toolbar"', () => {
        expect(new SettingsToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Settings toolbar');
    });

    it.each(SETTINGS_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new SettingsToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new SettingsToolbar(runtime);
        toolbar.triggerCommand('settings-open');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('settings-open', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new SettingsToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new SettingsToolbar(makeRuntime()).element.querySelectorAll('.stgtb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 12 buttons in the DOM', () => {
        expect(new SettingsToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(12);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new SettingsToolbar(makeRuntime()).element.querySelectorAll('.stgtb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new SettingsToolbar(makeRuntime()).element.querySelectorAll('.stgtb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new SettingsToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new SettingsToolbar(null).element.querySelector('[data-command="settings-open"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
