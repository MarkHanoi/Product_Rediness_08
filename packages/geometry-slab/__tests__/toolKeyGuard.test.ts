import { describe, it, expect, vi } from 'vitest';
import { consumeToolKey, releaseFocusedControl } from '../src/toolKeyGuard';

/**
 * §FIX-COMMIT-STEALS-VIEW (founder, 2026-08-07)
 *
 *   "when the user wants to finish the process and clicks ENTER — one time the
 *    view went to 3D SITE VIEW, another time the 3D view went WHITE SCREEN."
 *
 * The log showed `ViewController.activate("3D") ENTRY — activeDefinitionId=null`
 * 0.0 ms after the floor's commit line and BEFORE `CREATE_FLOOR` ran.
 *
 * ROOT CAUSE: the committing Enter was never consumed, so the browser delivered it
 * to the still-focused toolbar button the user had clicked to reach the tool — and
 * the camera toggle is such a button, whose activation calls
 * `viewController.activate('3D')`.
 *
 * These specs pin the two guards. They are ORDERING/STATE assertions, not pixels:
 * the invariant is "committing an element never changes the active view", enforced
 * by making the keystroke unable to reach a view control at all.
 */
describe('toolKeyGuard — committing an element must never change the active view', () => {
    describe('consumeToolKey', () => {
        it('calls BOTH preventDefault and stopPropagation', () => {
            // preventDefault alone blocks the focused button's synthesized click but
            // still lets a document-level listener act; stopPropagation alone leaves
            // the browser default intact. The defect needs both closed.
            const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
            consumeToolKey(e);
            expect(e.preventDefault).toHaveBeenCalledTimes(1);
            expect(e.stopPropagation).toHaveBeenCalledTimes(1);
        });

        it('never throws on a partial event object', () => {
            expect(() => consumeToolKey({})).not.toThrow();
            expect(() => consumeToolKey({ preventDefault: vi.fn() })).not.toThrow();
        });
    });

    describe('releaseFocusedControl — the view button must not stay focused during a draw', () => {
        const fakeDoc = (tagName: string) => {
            const blur = vi.fn();
            return { doc: { activeElement: { tagName, blur } as unknown as Element }, blur };
        };

        it('blurs a focused BUTTON — the camera/view toggle is one', () => {
            const { doc, blur } = fakeDoc('BUTTON');
            releaseFocusedControl(doc);
            expect(blur).toHaveBeenCalledTimes(1);
        });

        it('blurs a focused link', () => {
            const { doc, blur } = fakeDoc('A');
            releaseFocusedControl(doc);
            expect(blur).toHaveBeenCalledTimes(1);
        });

        it.each(['INPUT', 'TEXTAREA', 'SELECT', 'DIV'])(
            'leaves a focused %s ALONE — never yank a field from a typing user',
            (tag) => {
                const { doc, blur } = fakeDoc(tag);
                releaseFocusedControl(doc);
                expect(blur).not.toHaveBeenCalled();
            },
        );

        it('is safe with no focus and with no document at all', () => {
            expect(() => releaseFocusedControl({ activeElement: null })).not.toThrow();
            expect(() => releaseFocusedControl(undefined)).not.toThrow();
        });
    });

    /**
     * The end-to-end shape of the defect, modelled: a focused view button whose
     * activation switches the view, and a tool that commits on Enter.
     */
    describe('the defect, reproduced and then closed', () => {
        /** Stands in for ViewController — records any view change. */
        const makeView = () => {
            const calls: string[] = [];
            return { calls, activate: (m: string) => calls.push(m) };
        };

        /** A focused toolbar <button> that switches the view when "clicked". */
        const makeFocusedViewButton = (view: { activate: (m: string) => void }) => {
            const el = {
                tagName: 'BUTTON',
                blur: vi.fn(),
                click: () => view.activate('3D'),
            };
            return el;
        };

        /**
         * A keydown whose DEFAULT ACTION is to click the focused control — which is
         * exactly what a browser does for Enter on a focused button.
         */
        const dispatchEnter = (focused: { click: () => void } | null) => {
            let defaultPrevented = false;
            const e = {
                key: 'Enter',
                preventDefault: () => { defaultPrevented = true; },
                stopPropagation: () => {},
            };
            return {
                event: e,
                runDefault: () => { if (!defaultPrevented && focused) focused.click(); },
            };
        };

        it('REGRESSION: an unconsumed Enter reaches the focused button and switches the view', () => {
            const view = window ? makeView() : makeView();
            const btn = makeFocusedViewButton(view);
            const { runDefault } = dispatchEnter(btn);
            // Tool commits but does NOT consume the key (the pre-fix FloorTool).
            const committed: string[] = [];
            committed.push('CREATE_FLOOR');
            runDefault();
            expect(committed).toEqual(['CREATE_FLOOR']);
            expect(view.calls).toEqual(['3D']); // ← the founder's bug
        });

        it('FIXED: consuming the Enter leaves the view untouched, and the element is still created', () => {
            const view = makeView();
            const btn = makeFocusedViewButton(view);
            const { event, runDefault } = dispatchEnter(btn);
            const committed: string[] = [];
            // The tool now consumes the key it acted on.
            consumeToolKey(event);
            committed.push('CREATE_FLOOR');
            runDefault();
            expect(committed).toEqual(['CREATE_FLOOR']); // still created
            expect(view.calls).toEqual([]);              // view UNCHANGED
        });

        it('FIXED: ESC-to-cancel likewise leaves the view untouched', () => {
            const view = makeView();
            const btn = makeFocusedViewButton(view);
            let defaultPrevented = false;
            const e = {
                key: 'Escape',
                preventDefault: () => { defaultPrevented = true; },
                stopPropagation: () => {},
            };
            consumeToolKey(e);
            if (!defaultPrevented) btn.click();
            expect(view.calls).toEqual([]);
        });

        it('DEFENCE IN DEPTH: releasing focus on activation removes the target entirely', () => {
            const view = makeView();
            const btn = makeFocusedViewButton(view);
            // Tool activates → drops focus from the launching button.
            releaseFocusedControl({ activeElement: btn as unknown as Element });
            expect(btn.blur).toHaveBeenCalledTimes(1);
            // With nothing focused, even an UNCONSUMED Enter has no control to hit.
            const { runDefault } = dispatchEnter(null);
            runDefault();
            expect(view.calls).toEqual([]);
        });
    });
});
