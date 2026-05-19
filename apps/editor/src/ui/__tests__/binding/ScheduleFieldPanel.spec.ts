// wave-6-b-d5: Real binding test — ScheduleFieldPanel
import { describe, expect, it, vi } from 'vitest';
import { ScheduleFieldPanel, SCHEDULE_FIELD_PANEL_ID } from '../../ScheduleFieldPanel.js';
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

describe('ScheduleFieldPanel — wave-6-b-d5 binding contract', () => {
    it('SCHEDULE_FIELD_PANEL_ID is "schedule-field-panel"', () => {
        expect(SCHEDULE_FIELD_PANEL_ID).toBe('schedule-field-panel');
    });

    it('constructs without throwing', () => {
        expect(() => new ScheduleFieldPanel(makeRuntime())).not.toThrow();
    });

    it('exposes a DOM element', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).element).toBeInstanceOf(HTMLElement);
    });

    it('show() calls activatePanel("schedule-field-panel", { label: "Schedule Field" })', () => {
        const rt = makeRuntime();
        new ScheduleFieldPanel(rt).show();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'schedule-field-panel', expect.objectContaining({ label: 'Schedule Field' }),
        );
    });

    it('show() sets display:block', () => {
        const p = new ScheduleFieldPanel(makeRuntime());
        p.show();
        expect(p.element.style.display).toBe('block');
    });

    it('hide() calls deactivatePanel("schedule-field-panel")', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFieldPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-field-panel');
    });

    it('hide() sets display:none', () => {
        const p = new ScheduleFieldPanel(makeRuntime());
        p.show(); p.hide();
        expect(p.element.style.display).toBe('none');
    });

    it('exactly one activate and one deactivate per show/hide cycle', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFieldPanel(rt);
        p.show(); p.hide();
        expect(rt.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('null runtime — show/hide do not throw', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const p = new ScheduleFieldPanel(null);
        expect(() => { p.show(); p.hide(); }).not.toThrow();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('default alignment is "left"', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).getState().alignment).toBe('left');
    });

    it('default columnWidth is 50', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).getState().columnWidth).toBe(50);
    });

    it('setState() patches heading', () => {
        const p = new ScheduleFieldPanel(makeRuntime());
        p.setState({ heading: 'Count' });
        expect(p.getState().heading).toBe('Count');
    });

    it('setState() patches alignment to "right"', () => {
        const p = new ScheduleFieldPanel(makeRuntime());
        p.setState({ alignment: 'right' });
        expect(p.getState().alignment).toBe('right');
    });

    it('renders an input for fieldName', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).element.querySelector('[data-sfp-field="fieldName"]')).not.toBeNull();
    });

    it('renders a select for alignment', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).element.querySelector('[data-sfp-field="alignment"]')).not.toBeNull();
    });

    it('renders a checkbox for isComputed', () => {
        expect(new ScheduleFieldPanel(makeRuntime()).element.querySelector('[data-sfp-field="isComputed"]')).not.toBeNull();
    });

    it('close button triggers hide()', () => {
        const rt = makeRuntime();
        const p  = new ScheduleFieldPanel(rt);
        p.show();
        (p.element.querySelector('.sfp-close-btn') as HTMLButtonElement).click();
        expect(p.element.style.display).toBe('none');
        expect(rt.viewRegistry.deactivatePanel).toHaveBeenCalledWith('schedule-field-panel');
    });
});
