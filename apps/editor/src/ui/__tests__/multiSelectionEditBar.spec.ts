/**
 * §MULTI-SELECT-SHIFT (L-1552) — what the Contextual Edit Bar may OFFER when the
 * founder has SHIFT+clicked several elements, and what Delete must then do.
 *
 * Unlike its sibling `gridContextualEditBarWiring.spec.ts` — which reads SOURCE and
 * says so — this one BUILDS the bar and CLICKS its buttons, because the two claims
 * that matter here are behavioural and a source grep cannot settle either:
 *
 *   1. N selected ⇒ ONE undo entry. A loop of N `element.delete` dispatches is N
 *      undo entries, so undoing a mistaken five-element delete would be five
 *      Ctrl-Zs — and stopping halfway leaves a model the author never wrote.
 *      `element.deleteBatch` bridges to `DeleteElementsBatchCommand`, which
 *      composes the same children into one entry (proved as a COMMAND in
 *      `packages/command-registry/__tests__/deleteElementsBatch.test.ts`); what is
 *      proved HERE is that the founder's selection actually REACHES it.
 *
 *   2. A DISABLED BUTTON MUST ACTUALLY REFUSE. Every other operation on this bar is
 *      single-subject (`joinTool.activate(id, type)` takes ONE id), so at N>1 they
 *      are shown disabled with the reason. But a `<button>` marked only
 *      `aria-disabled` still dispatches click, and this class's listener ran the
 *      action regardless — the existing grid arm had the same hole. A greyed-out
 *      Move that silently moves the primary is worse than an enabled one: the
 *      author has no reason to check the other four elements.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectionBus } from '@pryzm/core-app-model';
import { ContextualEditBar } from '../ContextualEditBar';

interface BusCall { type: string; payload: unknown }

let calls: BusCall[];
let deleteSelectedSingle: ReturnType<typeof vi.fn>;
let bar: ContextualEditBar;

function build(): ContextualEditBar {
    calls = [];
    deleteSelectedSingle = vi.fn();
    (window as unknown as { runtime?: unknown }).runtime = {
        events: { on: () => {}, emit: () => {} },
        bus: {
            executeCommand: (type: string, payload: unknown) => {
                calls.push({ type, payload });
                return Promise.resolve({});
            },
        },
    };
    const service = {
        deleteSelected: deleteSelectedSingle,
        undo: vi.fn(),
        redo: vi.fn(),
    };
    return new ContextualEditBar(service as never, null);
}

function btn(actionId: string): HTMLElement {
    const el = bar.element.querySelector(`[data-action-id="${actionId}"]`);
    if (!el) throw new Error(`no button with data-action-id="${actionId}"`);
    return el as HTMLElement;
}

beforeEach(() => {
    document.body.innerHTML = '';
    selectionBus.clear();
    selectionBus.setSelectionManager(null);
    bar = build();
});

afterEach(() => {
    selectionBus.clear();
    bar.element.remove();
});

describe('Delete over a multi-selection is ONE undo entry', () => {
    it('dispatches element.deleteBatch ONCE carrying every selected id', () => {
        selectionBus.selectMany(['w1', 'w2', 'w3'], '3d-canvas', false);
        btn('delete').click();

        expect(calls).toHaveLength(1);
        expect(calls[0]!.type).toBe('element.deleteBatch');
        expect((calls[0]!.payload as { elementIds: string[] }).elementIds)
            .toEqual(['w1', 'w2', 'w3']);
    });

    it('does NOT loop the single-element verb', () => {
        selectionBus.selectMany(['w1', 'w2', 'w3'], '3d-canvas', false);
        btn('delete').click();
        expect(calls.filter((c) => c.type === 'element.delete')).toHaveLength(0);
        // …and it does not ALSO fall through to the single-element service route,
        // which would delete the primary a second time.
        expect(deleteSelectedSingle).not.toHaveBeenCalled();
    });

    it('a SINGLE selection still takes the existing single-element route', () => {
        selectionBus.select('w1', '3d-canvas');
        btn('delete').click();
        expect(calls).toHaveLength(0);
        expect(deleteSelectedSingle).toHaveBeenCalledTimes(1);
    });

    it('an EMPTY selection takes the single-element route (which owns the refusal)', () => {
        btn('delete').click();
        expect(calls).toHaveLength(0);
        expect(deleteSelectedSingle).toHaveBeenCalledTimes(1);
    });
});

describe('single-subject operations are DISABLED, with a stated reason', () => {
    it('every operation button is shown-and-disabled at N > 1', () => {
        selectionBus.selectMany(['w1', 'w2'], '3d-canvas', false);
        const move = bar.element.querySelector('[data-op-id="move"]') as HTMLElement;
        expect(move).toBeTruthy();
        expect(move.style.display).not.toBe('none');           // SHOWN, not hidden
        expect(move.getAttribute('aria-disabled')).toBe('true');
        expect(move.dataset.tooltip).toMatch(/multi-selection \(2 elements\)/);
    });

    it('clicking a disabled button REFUSES rather than acting on the primary', () => {
        const errors: string[] = [];
        const onErr = (e: Event): void => {
            errors.push((e as CustomEvent).detail?.msg as string);
        };
        window.addEventListener('bim-operation-error', onErr);
        try {
            selectionBus.selectMany(['w1', 'w2'], '3d-canvas', false);
            (bar.element.querySelector('[data-op-id="move"]') as HTMLElement).click();
            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatch(/unavailable/i);
            expect(errors[0]).toMatch(/multi-selection/i);
        } finally {
            window.removeEventListener('bim-operation-error', onErr);
        }
    });

    it('the disabled state is CLEARED when the selection drops back to one', () => {
        selectionBus.selectMany(['w1', 'w2'], '3d-canvas', false);
        selectionBus.select('w1', '3d-canvas');
        const move = bar.element.querySelector('[data-op-id="move"]') as HTMLElement;
        expect(move.getAttribute('aria-disabled')).toBe('false');
    });

    it('the bar names the COUNT so the author can see the set they built', () => {
        selectionBus.selectMany(['w1', 'w2', 'w3'], '3d-canvas', false);
        expect(bar.element.dataset.elementType).toBe('multi');
        expect(bar.element.title).toBe('3 elements');
    });
});
