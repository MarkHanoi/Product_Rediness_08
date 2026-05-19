// wave-6-b-d10: Real binding test — CDETransmittalPanel
//
// Contract: show() calls activatePanel; hide() calls deactivatePanel.
// Docs: docs/03_PRYZM3/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import {
    CDETransmittalPanel,
    CDE_TRANSMITTAL_PANEL_ID,
    TRANSMITTAL_PURPOSES,
} from '../../CDETransmittalPanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeViewRegistryMock() {
    return {
        activeViewId: null,
        activate: vi.fn(),
        list: vi.fn(() => []),
        subscribe: vi.fn(() => ({ dispose: vi.fn() })),
        activatePanel: vi.fn(),
        deactivatePanel: vi.fn(),
        getActivePanelIds: vi.fn(() => new Set<string>()),
        subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
    };
}

function makeRuntime() {
    return { viewRegistry: makeViewRegistryMock() } as unknown as PryzmRuntime;
}

describe('CDETransmittalPanel — wave-6-b-d10 binding contract', () => {
    it('has the correct CDE_TRANSMITTAL_PANEL_ID constant', () => {
        expect(CDE_TRANSMITTAL_PANEL_ID).toBe('cde-transmittal-panel');
    });

    it('exports at least 4 transmittal purposes', () => {
        expect(TRANSMITTAL_PURPOSES.length).toBeGreaterThanOrEqual(4);
    });

    it('TRANSMITTAL_PURPOSES includes for-review', () => {
        expect(TRANSMITTAL_PURPOSES.map(p => p.purposeId)).toContain('for-review');
    });

    it('TRANSMITTAL_PURPOSES includes for-approval', () => {
        expect(TRANSMITTAL_PURPOSES.map(p => p.purposeId)).toContain('for-approval');
    });

    it('TRANSMITTAL_PURPOSES includes for-construction', () => {
        expect(TRANSMITTAL_PURPOSES.map(p => p.purposeId)).toContain('for-construction');
    });

    it('constructs without throwing', () => {
        expect(() => new CDETransmittalPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element after construction', () => {
        expect(new CDETransmittalPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('element has role="dialog"', () => {
        expect(new CDETransmittalPanel(makeRuntime()).element.getAttribute('role')).toBe('dialog');
    });

    it('show() calls activatePanel with panel-id "cde-transmittal-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDETransmittalPanel(runtime);
        panel.show();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'cde-transmittal-panel',
            expect.objectContaining({ label: 'CDE Transmittal' }),
        );
    });

    it('show() passes optional transmittalId in spec', () => {
        const runtime = makeRuntime();
        const panel = new CDETransmittalPanel(runtime);
        panel.show('tx-001');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'cde-transmittal-panel',
            expect.objectContaining({ transmittalId: 'tx-001' }),
        );
    });

    it('show() makes the element visible', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        panel.show();
        expect(panel.element.style.display).toBe('flex');
    });

    it('hide() calls deactivatePanel with panel-id "cde-transmittal-panel"', () => {
        const runtime = makeRuntime();
        const panel = new CDETransmittalPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('cde-transmittal-panel');
    });

    it('hide() hides the element', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        panel.show();
        panel.hide();
        expect(panel.element.style.display).toBe('none');
    });

    it('show() then hide() produces exactly one activate and one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new CDETransmittalPanel(runtime);
        panel.show();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('renders subject input', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        expect(panel.element.querySelector('[data-ctp-subject]')).not.toBeNull();
    });

    it('renders recipients input', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        expect(panel.element.querySelector('[data-ctp-recipients]')).not.toBeNull();
    });

    it('renders purpose select with transmittal purposes', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        const sel = panel.element.querySelector('[data-ctp-purpose]');
        expect(sel).not.toBeNull();
        expect(sel!.querySelectorAll('option').length).toBe(TRANSMITTAL_PURPOSES.length);
    });

    it('renders a document list placeholder', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        expect(panel.element.querySelector('[data-ctp-doc-list]')).not.toBeNull();
    });

    it('renders a send button', () => {
        const panel = new CDETransmittalPanel(makeRuntime());
        expect(panel.element.querySelector('[data-ctp-send]')).not.toBeNull();
    });

    it('constructs without runtime — no throw (warns)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => new CDETransmittalPanel(null)).not.toThrow();
        warnSpy.mockRestore();
    });

    it('show()/hide() without runtime — no throw', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const panel = new CDETransmittalPanel(null);
        expect(() => { panel.show(); panel.hide(); }).not.toThrow();
        warnSpy.mockRestore();
    });
});
