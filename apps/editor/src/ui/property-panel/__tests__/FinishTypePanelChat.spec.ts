// @vitest-environment happy-dom
//
// §OPENING-PANEL-CHAT (L-9630) — PROVEN AT THE LAYER THE FOUNDER EXPERIENCES
// ==========================================================================
//
// ⭐ [[committed-is-not-reachable]] / C11 §7.6: a pure function returning the right
// value is not the claim. The claim is *"he types it into the panel and the panel
// changes."* So these tests drive the REAL `openFinishTypeEditor` DOM — they find
// the chat input by its id, dispatch a real click on Send, and then read the actual
// number input, the actual state chip and the actual draft handed to `onSave`.
//
// ⛔ Nothing here mocks `FinishTypeDraftIntent`. If the resolver and the wiring
// disagree about which field an edit names, that is exactly the defect this file
// exists to catch, and mocking the resolver would hide it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openFinishTypeEditor, type FinishTypeDraft } from '../FinishTypeEditorModal';
import { resolveElementTypeAuthoring } from '../ElementTypeAuthoringRegistry';

const WINDOW = resolveElementTypeAuthoring('window');
if (!WINDOW) throw new Error('window authoring must be declared');

/** A valid starting draft: both slots name a real library material, so save is legal. */
const INITIAL = (): FinishTypeDraft => ({
    name: 'Test Casement',
    frameFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    sillFinish: { name: 'Wood · Oak (Light)', materialId: 'wood-oak', materialColor: '#c8a96e' },
    glazingOpacity: 0.3,
    dimensions: {},
});

let saved: FinishTypeDraft[] = [];
let close: (() => void) | null = null;

function open(): HTMLElement {
    close = openFinishTypeEditor({
        mode: 'create',
        authoring: WINDOW!,
        initial: INITIAL(),
        existingNames: [],
        onSave: (d) => { saved.push(d); },
    });
    return document.querySelector('.fte-panel') as HTMLElement;
}

/** Type into the panel's chat and press Send, exactly as a user does. */
function say(panel: HTMLElement, text: string): void {
    const input = panel.querySelector('#fte-chat-input') as HTMLInputElement;
    expect(input, 'the chat input must exist inside the dialog').not.toBeNull();
    input.value = text;
    const send = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === 'Send')!;
    expect(send, 'the Send button must exist').toBeTruthy();
    send.click();
}

const dim = (panel: HTMLElement, key: string) =>
    panel.querySelector(`#fte-dim-${key}`) as HTMLInputElement;

/** The state chip lives in the same card as its number input. */
function chip(panel: HTMLElement, key: string): HTMLButtonElement {
    const card = dim(panel, key).closest('div')!.parentElement!;
    return card.querySelector('.fte-auto-btn') as HTMLButtonElement;
}

beforeEach(() => { saved = []; });
afterEach(() => { close?.(); close = null; document.body.innerHTML = ''; });

describe('§OPENING-PANEL-CHAT — the founder’s sentence, in the real dialog', () => {
    it('"create a window with a 2m width" moves the WIDTH CONTROL, not just a return value', () => {
        const panel = open();
        expect(dim(panel, 'width').value, 'starts unauthored').toBe('');

        say(panel, 'create a window with a 2m width');

        // ⭐ THE PROOF. The control the user can see now holds the number they said.
        expect(dim(panel, 'width').value).toBe('2');
        expect(chip(panel, 'width').textContent).toMatch(/authored/);
    });

    it('and the SAVED DRAFT carries it — the chat edits the same object Create dispatches', () => {
        const panel = open();
        say(panel, 'create a window with a 2m width');

        const saveBtn = Array.from(panel.querySelectorAll('button'))
            .find((b) => b.textContent?.startsWith('Create'))!;
        saveBtn.click();

        expect(saved).toHaveLength(1);
        expect((saved[0]!.dimensions as Record<string, number>).width).toBe(2);
    });

    it('"create it" from the CHAT runs the same save path as the button', () => {
        const panel = open();
        say(panel, '1.8 m wide');
        say(panel, 'create it');
        expect(saved).toHaveLength(1);
        expect((saved[0]!.dimensions as Record<string, number>).width).toBe(1.8);
    });

    it('a compound ask moves EVERY control it names', () => {
        const panel = open();
        say(panel, '1.5m wide and 2.2 m high and 3 columns');
        expect(dim(panel, 'width').value).toBe('1.5');
        expect(dim(panel, 'height').value).toBe('2.2');
        const cols = panel.querySelector('#fte-grid-defaultColumnRatios') as HTMLInputElement;
        expect(cols.value).toBe('3');
    });

    it('"width auto" returns the control to INHERITED and names what it inherits', () => {
        const panel = open();
        say(panel, 'width 2 m');
        expect(chip(panel, 'width').textContent).toMatch(/authored/);

        say(panel, 'width auto');
        // ⛔ Blank, not "0" — the difference between a type that INHERITS and one that
        // ASSERTS zero metres.
        expect(dim(panel, 'width').value).toBe('');
        // …and the chip names the number that will actually be used.
        expect(chip(panel, 'width').textContent).toMatch(/^auto · [\d.]+ m$/);
        expect(dim(panel, 'width').placeholder).toMatch(/^auto [\d.]+$/);
    });

    it('the chip is a real way back: clicking "authored ×" clears to auto', () => {
        const panel = open();
        say(panel, 'height 2.4 m');
        expect(dim(panel, 'height').value).toBe('2.4');
        chip(panel, 'height').click();
        expect(dim(panel, 'height').value).toBe('');
        expect(chip(panel, 'height').textContent).toMatch(/^auto/);
    });

    it('an out-of-range ask changes NOTHING and says both numbers on screen', () => {
        const panel = open();
        say(panel, 'width 40 m');
        expect(dim(panel, 'width').value, 'the control must not have moved').toBe('');
        expect(panel.textContent).toMatch(/You asked for 40/);
        expect(panel.textContent).toMatch(/not changed/i);
    });

    it('an unknown material changes NOTHING and names the route back', () => {
        const panel = open();
        const before = (panel.querySelector('.fms-select') as HTMLSelectElement).value;
        say(panel, 'frame in unobtainium');
        expect((panel.querySelector('.fms-select') as HTMLSelectElement).value).toBe(before);
        expect(panel.textContent).toMatch(/not a material in the library/i);
    });

    it('an ambiguous ask LISTS the candidates in the transcript', () => {
        const panel = open();
        say(panel, 'frame 0.05 m');
        expect(panel.textContent).toMatch(/Frame face/);
        expect(panel.textContent).toMatch(/Frame depth/);
        expect(dim(panel, 'frameThickness').value, 'nothing was guessed').toBe('');
        expect(dim(panel, 'frameDepth').value, 'nothing was guessed').toBe('');
    });

    it('the honest instance-linkage sentence survives the redesign VERBATIM', () => {
        // F — load-bearing copy. It is the only place the user is told that editing a
        // type later will not restyle what is already placed.
        const panel = open();
        expect(panel.textContent).toContain(
            'Placed windows keep the finishes they were created with; ' +
            'editing this type later will not restyle them automatically.',
        );
    });

    it('every control the registry declares is present in the redesigned dialog', () => {
        // D — the two-column rebuild must not have dropped a field on the way.
        const panel = open();
        for (const f of WINDOW!.finishEditor!.dimensions ?? []) {
            expect(dim(panel, f.key), `dimension control ${f.key}`).not.toBeNull();
        }
        expect(panel.querySelector('#fte-grid-defaultColumnRatios')).not.toBeNull();
        expect(panel.querySelector('#fte-grid-defaultRowRatios')).not.toBeNull();
        expect(panel.querySelector('#fte-opacity')).not.toBeNull();
        expect(panel.querySelector('#fte-name')).not.toBeNull();
        expect(panel.querySelector('#fte-desc')).not.toBeNull();
    });

    it('Enter inside the chat SENDS and does not save the dialog (C43)', () => {
        const panel = open();
        const input = panel.querySelector('#fte-chat-input') as HTMLInputElement;
        input.value = '2 m wide';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(dim(panel, 'width').value, 'the ask was sent').toBe('2');
        expect(saved, 'and the dialog did NOT save').toHaveLength(0);
    });
});

describe('§OPENING-PANEL-CHAT — it does not steal the application’s chat', () => {
    it('registers no global chat host and dispatches no bus command of its own', async () => {
        const { chatPromptHostAvailable } = await import('../../ai/chatPromptHost');
        const executeCommand = vi.fn();
        (window as { runtime?: unknown }).runtime = { bus: { executeCommand } };
        const panel = open();
        say(panel, '2 m wide');
        // ⛔ The modal must not take the AI dock's only chat surface for as long as it
        // is open, and it must not reach the bus behind the dialog's own save path.
        expect(chatPromptHostAvailable()).toBe(false);
        expect(executeCommand).not.toHaveBeenCalled();
        delete (window as { runtime?: unknown }).runtime;
    });
});
