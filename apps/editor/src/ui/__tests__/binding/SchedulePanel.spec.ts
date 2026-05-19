// wave-6-b-d5: Real binding test — SchedulePanel
import { describe, expect, it, vi } from 'vitest';
import { SchedulePanel, SCHEDULE_PANEL_ID } from '../../SchedulePanel.js';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

function makeRuntime() {
    return {
        viewRegistry: {
            activeViewId: null,
            activate: vi.fn(),
            list: vi.fn(() => []),
            subscribe: vi.fn(() => ({ dispose: vi.fn() })),
            activatePanel: vi.fn(),
            deactivatePanel: vi.fn(),
            getActivePanelIds: vi.fn(() => new Set<string>()),
            subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
        },
    } as unknown as PryzmRuntime;
}

describe('SchedulePanel — wave-6-b-d5 binding contract', () => {
    it('SCHEDULE_PANEL_ID is "schedule-panel"', () => {
        expect(SCHEDULE_PANEL_ID).toBe('schedule-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new SchedulePanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new SchedulePanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("schedule-panel", { label: "Schedule Panel" })', () => {
        const rt = makeRuntime();
        new SchedulePanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'schedule-panel', expect.objectContaining({ label: 'Schedule Panel' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new SchedulePanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("schedule-panel")', () => {
        const rt = makeRuntime();
        const p  = new SchedulePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-panel');
    });

    it('hide() sets display:none', () => {
        const p = new SchedulePanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new SchedulePanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new SchedulePanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default scheduleType is "element"', () => {
        expect(new SchedulePanel(makeRuntime()).getState().scheduleType).toBe('element');
    });

    it('default phase is "new-construction"', () => {
        expect(new SchedulePanel(makeRuntime()).getState().phase).toBe('new-construction');
    });

    it('setState() patches scheduleType to "material"', () => {
        const p = new SchedulePanel(makeRuntime());
        p.setState({ scheduleType: 'material' });
        expect(p.getState().scheduleType).toBe('material');
    });

    it('setState() patches showGrandTotal to false', () => {
        const p = new SchedulePanel(makeRuntime());
        p.setState({ showGrandTotal: false });
        expect(p.getState().showGrandTotal).toBe(false);
    });

    it('renders a select for scheduleType', () => {
        expect(new SchedulePanel(makeRuntime()).element.querySelector('[data-sp-field="scheduleType"]')).not.toBeNull();
    });

    it('renders an input for category', () => {
        expect(new SchedulePanel(makeRuntime()).element.querySelector('[data-sp-field="category"]')).not.toBeNull();
    });

    it('renders a checkbox for itemiseByLevel', () => {
        expect(new SchedulePanel(makeRuntime()).element.querySelector('[data-sp-field="itemiseByLevel"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new SchedulePanel(rt);
        p.show();
        (p.element.querySelector('.sp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-panel');
    });
});
