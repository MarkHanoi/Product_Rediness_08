// wave-6-c-d10: Real binding test — PluginManagerToolbar
import { describe, expect, it, vi } from 'vitest';
import { PluginManagerToolbar, PLUGIN_MANAGER_TOOLBAR_ID, PLUGIN_MANAGER_TOOLBAR_BUTTONS } from '../PluginManagerToolbar.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeBusMock() {
    return { executeCommand: vi.fn(), register: vi.fn(() => ({ dispose: vi.fn() })), registry: new Map() };
}
function makeRuntime() { return { bus: makeBusMock() } as unknown as PryzmRuntime; }

describe('PluginManagerToolbar — wave-6-c-d10 binding contract', () => {
    it('has the correct PLUGIN_MANAGER_TOOLBAR_ID constant', () => {
        expect(PLUGIN_MANAGER_TOOLBAR_ID).toBe('plugin-manager-toolbar');
    });

    it('exposes 12 button definitions', () => {
        expect(PLUGIN_MANAGER_TOOLBAR_BUTTONS.length).toBe(12);
    });

    it('contains plugin-install command', () => {
        expect(PLUGIN_MANAGER_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('plugin-install');
    });

    it('contains plugin-browse-marketplace command', () => {
        expect(PLUGIN_MANAGER_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('plugin-browse-marketplace');
    });

    it('contains plugin-devtools-open command', () => {
        expect(PLUGIN_MANAGER_TOOLBAR_BUTTONS.map(b => b.commandType)).toContain('plugin-devtools-open');
    });

    it('constructs without throwing', () => {
        expect(() => new PluginManagerToolbar(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new PluginManagerToolbar(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="toolbar"', () => {
        expect(new PluginManagerToolbar(makeRuntime()).element.getAttribute('role')).toBe('toolbar');
    });

    it('element has aria-label="Plugin manager toolbar"', () => {
        expect(new PluginManagerToolbar(makeRuntime()).element.getAttribute('aria-label')).toBe('Plugin manager toolbar');
    });

    it.each(PLUGIN_MANAGER_TOOLBAR_BUTTONS.map(b => [b.commandType, b.title]))(
        'button "%s" dispatches executeCommand',
        (commandType) => {
            const runtime = makeRuntime();
            const toolbar = new PluginManagerToolbar(runtime);
            const btn = toolbar.element.querySelector(`[data-command="${commandType}"]`) as HTMLButtonElement;
            expect(btn).not.toBeNull();
            btn.click();
            expect(runtime.bus.executeCommand).toHaveBeenCalledWith(commandType, expect.any(Object));
        },
    );

    it('triggerCommand() dispatches via runtime.bus.executeCommand', () => {
        const runtime = makeRuntime();
        const toolbar = new PluginManagerToolbar(runtime);
        toolbar.triggerCommand('plugin-install');
        expect(runtime.bus.executeCommand).toHaveBeenCalledWith('plugin-install', expect.any(Object));
    });

    it('triggerCommand() for unknown command is a noop', () => {
        expect(() => new PluginManagerToolbar(makeRuntime()).triggerCommand('unknown-cmd')).not.toThrow();
    });

    it('renders group separators', () => {
        expect(new PluginManagerToolbar(makeRuntime()).element.querySelectorAll('.pmtb-separator').length).toBeGreaterThan(0);
    });

    it('renders exactly 12 buttons in the DOM', () => {
        expect(new PluginManagerToolbar(makeRuntime()).element.querySelectorAll('[data-command]').length).toBe(12);
    });

    it('all buttons have aria-label attributes', () => {
        for (const btn of new PluginManagerToolbar(makeRuntime()).element.querySelectorAll('.pmtb-btn')) {
            expect(btn.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('all button icons have aria-hidden="true"', () => {
        for (const icon of new PluginManagerToolbar(makeRuntime()).element.querySelectorAll('.pmtb-btn-icon')) {
            expect(icon.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new PluginManagerToolbar(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('button click without runtime logs warning, does not throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const btn = new PluginManagerToolbar(null).element.querySelector('[data-command="plugin-install"]') as HTMLButtonElement;
        expect(() => btn.click()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
