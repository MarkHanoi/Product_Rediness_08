// wave-6-c-d10: Real binding test — AnnotationInputPanel
//
// pryzmAnnotationInput creates a PRYZM-styled modal dialog.
// This spec validates the DOM contract: overlay, card, input field, buttons.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §3

import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationInputOptions, AnnotationInputResult } from '../../AnnotationInputPanel.js';

/** Click every cancel button in the DOM to drain any stale dialogs. */
function drainDialogs(): void {
    document.querySelectorAll<HTMLButtonElement>('.cdlg-btn-cancel').forEach(b => b.click());
}

afterEach(() => {
    // Force-remove any overlay left in the DOM (animation timer may not have fired).
    document.querySelectorAll('.cdlg-overlay').forEach(el => el.remove());
});

describe('AnnotationInputPanel — wave-6-c-d10 binding contract', () => {
    it('module exports pryzmAnnotationInput function', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        expect(typeof mod.pryzmAnnotationInput).toBe('function');
    });

    it('AnnotationInputOptions type accepts required title field', () => {
        const opts: AnnotationInputOptions = { title: 'Test' };
        expect(opts.title).toBe('Test');
    });

    it('AnnotationInputOptions type accepts all optional fields', () => {
        const opts: AnnotationInputOptions = {
            title:        'Test',
            subtitle:     'Sub',
            label:        'Enter text',
            placeholder:  'Type here',
            defaultValue: 'hello',
            multiline:    false,
            confirmLabel: 'OK',
            secondField:  { label: 'Field 2', placeholder: 'F2', defaultValue: 'v2' },
        };
        expect(opts.confirmLabel).toBe('OK');
        expect(opts.secondField?.label).toBe('Field 2');
    });

    it('AnnotationInputResult shape has value and optional secondValue', () => {
        const r: AnnotationInputResult = { value: 'test' };
        expect(r.value).toBe('test');
        expect(r.secondValue).toBeUndefined();
    });

    it('pryzmAnnotationInput returns a Promise', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const result = mod.pryzmAnnotationInput({ title: 'T' });
        expect(result).toBeInstanceOf(Promise);
        drainDialogs();
        await result;
    });

    it('pryzmAnnotationInput resolves null when cancel is clicked', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'T' });
        drainDialogs();
        await expect(promise).resolves.toBeNull();
    });

    it('overlay element has correct CSS class .cdlg-overlay', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'X' });
        expect(document.querySelector('.cdlg-overlay')).not.toBeNull();
        drainDialogs();
        await promise;
    });

    it('dialog card element has correct CSS class .cdlg-card', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'X' });
        expect(document.querySelector('.cdlg-card')).not.toBeNull();
        drainDialogs();
        await promise;
    });

    it('input field element has correct CSS class .ann-text-prompt-input', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'X' });
        expect(document.querySelector('.ann-text-prompt-input')).not.toBeNull();
        drainDialogs();
        await promise;
    });

    it('multiline option renders a textarea.ann-text-prompt-input', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'Multi', multiline: true });
        expect(document.querySelector('textarea.ann-text-prompt-input')).not.toBeNull();
        drainDialogs();
        await promise;
    });

    it('defaultValue is pre-filled in the input', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'X', defaultValue: 'prefilled' });
        const input = document.querySelector<HTMLInputElement>('.ann-text-prompt-input');
        expect(input?.value).toBe('prefilled');
        drainDialogs();
        await promise;
    });

    it('custom confirmLabel appears on confirm button', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'Y', confirmLabel: 'Apply' });
        const btn = document.querySelector('.ann-btn-primary');
        expect(btn?.textContent).toContain('Apply');
        drainDialogs();
        await promise;
    });

    it('dialog resolves AnnotationInputResult after confirm with non-empty value', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'Z', defaultValue: 'text' });
        document.querySelector<HTMLButtonElement>('.ann-btn-primary')?.click();
        const result = await promise;
        expect(result).not.toBeNull();
        expect((result as AnnotationInputResult).value).toBe('text');
    });

    it('overlay has role=dialog on its card child', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'R' });
        expect(document.querySelector('.cdlg-card')?.getAttribute('role')).toBe('dialog');
        drainDialogs();
        await promise;
    });

    it('cancel button text is "Cancel"', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({ title: 'C' });
        expect(document.querySelector('.cdlg-btn-cancel')?.textContent).toBe('Cancel');
        drainDialogs();
        await promise;
    });

    it('secondField option renders two inputs', async () => {
        const mod = await import('../../AnnotationInputPanel.js');
        const promise = mod.pryzmAnnotationInput({
            title: 'S',
            secondField: { label: 'Second', placeholder: 'ph2' },
        });
        expect(document.querySelectorAll('.ann-text-prompt-input').length).toBe(2);
        drainDialogs();
        await promise;
    });
});
