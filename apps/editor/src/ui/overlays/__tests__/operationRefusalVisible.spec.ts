/**
 * §FIX-OP-REFUSAL-VISIBLE (L-813, §CONTEXT-DATA-HONESTY)
 *
 * THE DEFECT THESE PIN. Every operation tool reports a command refusal as
 *     this._showError(info);   // "Walls are parallel — no intersection exists"
 *     this._complete();        // fires instructions{msg:null} AND operation-completed
 * and BOTH of those completion events called the overlay's `_hide()`, which cleared
 * the error class and blanked the message **in the same tick the error was set**.
 * So the whole family of correct, well-worded wall-edit refusals rendered for ~0 ms:
 * a refusal and a success were literally the same observable — nothing on screen.
 * That is precisely why "the wall edit tools don't work" was so hard to diagnose.
 *
 * The contract these tests hold the overlay to:
 *   1. an error survives a same-tick completion/hide,
 *   2. it clears itself afterwards (nothing gets permanently stuck),
 *   3. a still-running operation gets its instruction back rather than a blank bar,
 *   4. an ordinary hide with no error on screen is still immediate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OperationModeOverlay } from '../OperationModeOverlay';

const ERROR_MS = 2500;

let container: HTMLElement;
let overlay: OperationModeOverlay;

function el(): HTMLElement { return overlay.element; }
function msg(): string { return (el().querySelector('.oop-msg') as HTMLElement).textContent ?? ''; }
function visible(): boolean { return el().classList.contains('oop-overlay--visible'); }
function errored(): boolean { return el().classList.contains('oop-overlay--error'); }

function instructions(m: string | null, operationId = 'join'): void {
    window.dispatchEvent(new CustomEvent('bim-operation-instructions', { detail: { msg: m, operationId } }));
}
function error(m: string): void {
    window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: m } }));
}
function completed(operationId = 'join'): void {
    window.dispatchEvent(new CustomEvent('bim-operation-completed', { detail: { operationId } }));
}

beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    overlay = new OperationModeOverlay(container);
});

afterEach(() => {
    overlay.destroy();
    container.remove();
    vi.useRealTimers();
});

describe('OperationModeOverlay — a refusal must be readable (§FIX-OP-REFUSAL-VISIBLE)', () => {
    it('keeps a refusal on screen when the tool completes in the SAME tick', () => {
        // Exactly the JoinTool failure path: instructions → error → _complete().
        instructions('Click the second wall to join with — Esc to cancel');
        error('Walls are parallel — no intersection exists');
        instructions(null);   // _hideInstructions() from _complete()
        completed();          // bim-operation-completed from _complete()

        expect(visible()).toBe(true);
        expect(errored()).toBe(true);
        expect(msg()).toBe('Walls are parallel — no intersection exists');
    });

    it('clears the refusal after its window — nothing is left stuck on screen', () => {
        instructions('Click the second wall to join with — Esc to cancel');
        error('Join rejected: the walls are too close to parallel');
        instructions(null);
        completed();

        vi.advanceTimersByTime(ERROR_MS + 10);

        expect(visible()).toBe(false);
        expect(errored()).toBe(false);
        expect(msg()).toBe('');
    });

    it('restores the running instruction when the operation did NOT complete', () => {
        // A rejected pick that does not end the operation (e.g. "click a wall").
        instructions('Click the second wall to join with — Esc to cancel');
        error('⚠ Join needs a WALL — you clicked a floor');

        expect(msg()).toBe('⚠ Join needs a WALL — you clicked a floor');

        vi.advanceTimersByTime(ERROR_MS + 10);

        expect(visible()).toBe(true);
        expect(errored()).toBe(false);
        expect(msg()).toBe('Click the second wall to join with — Esc to cancel');
    });

    it('hides immediately when there is no error on screen (no regression)', () => {
        instructions('Click the FIRST point of the mirror axis', 'mirror');
        expect(visible()).toBe(true);

        completed('mirror');

        expect(visible()).toBe(false);
        expect(msg()).toBe('');
    });

    it('a refusal with no prior instruction still shows, then hides', () => {
        // The ContextualEditBar decline path: an error with no operation running.
        error('Join unavailable — nothing is selected');

        expect(visible()).toBe(true);
        expect(errored()).toBe(true);
        expect(msg()).toBe('Join unavailable — nothing is selected');

        vi.advanceTimersByTime(ERROR_MS + 10);
        expect(visible()).toBe(false);
    });
});
