/**
 * §AUTHORING-CONTEXT-GATE (L-5100..L-5106) — the founder's 'WA' report.
 *
 * *"in the location parcel selection the user in this view clicks 'WA' and
 * activates the wall tool — which should not be the case."*
 *
 * ⚠ WHAT THIS SUITE CAN AND CANNOT ESTABLISH. Two arms, and the difference is
 * stated rather than blurred:
 *
 *   · ARM A — BEHAVIOURAL. Real calls into the real predicate against the real
 *     `appPhase()` latch. This genuinely runs the decision.
 *   · ARM B — SOURCE-TEXT. It reads the three call sites and asserts each one
 *     consults the predicate. It does NOT press a key: the two shortcut layers
 *     bind `window.addEventListener('keydown')` from inside constructors that
 *     need a live `bimManager` / `toolManager` / renderer, and standing a fake
 *     one up here would be a fake built from the header — it could not falsify
 *     the header. A source-text arm that says so is worth more than a
 *     behavioural-looking arm over a stub that cannot fail.
 *
 * ⛔ Neither arm sees a browser. What would falsify the fix in ONE look is named
 * in the report and in ISSUE-LOG L-5100.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
    elementAuthoringAvailability,
    isElementAuthoringAvailable,
    refuseElementAuthoring,
} from '../layout/elementAuthoringContext';
import {
    setAppPhase,
    resetAppPhaseForNewProject,
    __resetPanelSessionStateForTests,
} from '../layout/panelDefaults';

const REPO = resolve(__dirname, '../../../../..');
const read = (p: string): string => readFileSync(join(REPO, p), 'utf8');

/** Source with comment lines removed — a comment quoting code is not code. */
function codeOnly(src: string): string {
    return src
        .split(String.fromCharCode(10))
        .filter((l) => {
            const t = l.trimStart();
            return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join(String.fromCharCode(10));
}

describe('§AUTHORING-CONTEXT-GATE — ARM A: the predicate decides', () => {
    beforeEach(() => {
        __resetPanelSessionStateForTests();
        resetAppPhaseForNewProject();
    });

    it('REFUSES during guided setup — the founder\'s exact context', () => {
        // `OnboardingStepController.start()` calls `resetAppPhaseForNewProject()`,
        // and `setAppPhase('canvas')` is reached only from its `dispose()`. So the
        // whole of steps 1-4, parcel draw included, is this state.
        const v = elementAuthoringAvailability('onboarding-globe');
        expect(v.available).toBe(false);
        expect(v.code).toBe('project-setup');
    });

    it('ALLOWS on the BIM canvas', () => {
        const v = elementAuthoringAvailability('canvas');
        expect(v.available).toBe(true);
        expect(v.code).toBeNull();
    });

    it('reads the LIVE phase when no argument is passed', () => {
        // The gate is consulted at gesture time from a listener bound once, at
        // construction. If it captured the phase instead of reading it, the fix
        // would work for exactly one project per page load.
        expect(isElementAuthoringAvailable()).toBe(false); // reset → onboarding
        setAppPhase('canvas');
        expect(isElementAuthoringAvailable()).toBe(true);
        resetAppPhaseForNewProject();
        expect(isElementAuthoringAvailable()).toBe(false); // and back again
    });

    it('⛔ a refusal ALWAYS carries a reason, and an allow never fabricates one', () => {
        // C82 §1.2 — a block with no explanation is the defect, not the fix.
        const blocked = elementAuthoringAvailability('onboarding-globe');
        expect(blocked.reason).toBeTruthy();
        expect(blocked.reason!.length).toBeGreaterThan(20);
        // `code` and `reason` are non-null together or not at all — a caller must
        // never be able to pair one code with another's text.
        expect(blocked.code !== null).toBe(blocked.reason !== null);

        const allowed = elementAuthoringAvailability('canvas');
        expect(allowed.code === null).toBe(allowed.reason === null);
    });

    it('refuseElementAuthoring returns STOP + narrates, and is silent when allowed', () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => { /* quiet */ });
        try {
            expect(refuseElementAuthoring('spec')).toBe(true);
            expect(info).toHaveBeenCalledTimes(1);
            // The refusal names the source and the reason — a silent no-op is what
            // the next bug report would have to guess at.
            expect(String(info.mock.calls[0]?.[0])).toContain('spec');
            expect(String(info.mock.calls[0]?.[0])).toContain('project-setup');

            info.mockClear();
            setAppPhase('canvas');
            expect(refuseElementAuthoring('spec')).toBe(false);
            expect(info).not.toHaveBeenCalled();
        } finally {
            info.mockRestore();
        }
    });
});

describe('§AUTHORING-CONTEXT-GATE — ARM B: every creation entry point consults it', () => {
    /**
     * ⭐ THE POINT OF THIS ARM. The measured defect was not "a gate was wrong",
     * it was "three layers, three different answers". So the assertion is that
     * they all reach ONE function — and, separately, that nobody has re-grown a
     * private one.
     */
    const CALL_SITES: ReadonlyArray<[string, string]> = [
        // The layer the founder hit: two-letter WA/CW/DO/WN/SL/FL/CE.
        ['apps/editor/src/ui/bottom-menu/BottomActionMenu.ts', 'the two-letter shortcut layer'],
        // The Alt+letter layer, which had a DIFFERENT gate (levels > 0).
        ['apps/editor/src/ui/tools-panel/panels/CreateRailPanel.ts', 'the Alt+letter shortcut layer'],
        // The strip itself — "cannot render in that context at all".
        ['apps/editor/src/ui/DrawingModeBar.ts', 'the .wdh-bar mode strip'],
    ];

    it.each(CALL_SITES)('%s consults the predicate (%s)', (file) => {
        const src = read(file);
        expect(src).toContain('elementAuthoringContext');
        expect(src).toMatch(/refuseElementAuthoring\(/);
    });

    it('⛔ the two-letter layer gates BEFORE arming a combo prefix', () => {
        // A gate placed after `_pendingKey` is set would let a half-typed 'W'
        // survive a phase change and complete as 'WA' on the canvas — or worse,
        // stay latched on the parcel map.
        const src = read('apps/editor/src/ui/bottom-menu/BottomActionMenu.ts');
        const gate = src.indexOf('refuseElementAuthoring(\'BottomActionMenu shortcut\')');
        const arm = src.indexOf('this._pendingKey = letter;');
        expect(gate, 'the shortcut gate is missing').toBeGreaterThan(-1);
        expect(arm, 'the combo-arming line moved').toBeGreaterThan(-1);
        expect(gate, 'the gate runs AFTER the prefix is armed').toBeLessThan(arm);
    });

    it('⛔ the single activation funnel is gated, so a click cannot bypass the key gate', () => {
        const src = read('apps/editor/src/ui/bottom-menu/BottomActionMenu.ts');
        const fn = src.indexOf('private _activateStructureTool(');
        expect(fn).toBeGreaterThan(-1);
        // The guard is the first statement of the funnel, before any store write
        // (`localStorage.setItem`) or `activate*` call.
        const body = src.slice(fn, fn + 1600);
        const gate = body.indexOf('refuseElementAuthoring(');
        const write = body.indexOf('localStorage');
        expect(gate, 'the funnel lost its gate').toBeGreaterThan(-1);
        expect(gate, 'the funnel writes state before it checks it').toBeLessThan(write);
    });

    it('⛔ the mode strip dismisses an existing bar BEFORE it refuses', () => {
        // Otherwise a bar that was legitimately up when the phase flipped stays
        // on screen over the parcel map, owned by nothing.
        const src = read('apps/editor/src/ui/DrawingModeBar.ts');
        const show = src.indexOf('show(opts: DrawingModeBarOptions)');
        const body = src.slice(show, show + 1400);
        expect(body.indexOf('this.dismiss();')).toBeGreaterThan(-1);
        expect(
            body.indexOf('this.dismiss();'),
            'the refusal returns before the stale bar is taken down',
        ).toBeLessThan(body.indexOf('refuseElementAuthoring('));
    });

    it('⛔ no call site re-grows a private phase check instead of asking', () => {
        // The hand-copy this predicate exists to delete. If a layer starts
        // testing the phase itself, the answers fork again — which is precisely
        // the state the founder's report found.
        for (const [file] of CALL_SITES) {
            const code = codeOnly(read(file));
            expect(code, `${file} tests the phase by hand`).not.toMatch(
                /appPhase\(\)\s*===|===\s*'onboarding-globe'/,
            );
        }
    });

    it('the predicate itself has exactly ONE live phase source', () => {
        // ⚠ COMMENTS STRIPPED, and this arm is the record of why. It first read
        // the raw file and counted 5 — every one of the extra four was this
        // module's own header EXPLAINING the single reader. A comment that
        // quotes code is not code; `shellFloatBudget.spec.ts` carries the same
        // note for the same reason, and this suite reproduced the mistake
        // independently, which is the argument for the helper.
        const code = codeOnly(read('apps/editor/src/ui/layout/elementAuthoringContext.ts'));
        // One default-argument read, in `elementAuthoringAvailability`. A second
        // reader would be the fork moved inside the module rather than removed.
        expect((code.match(/appPhase\(\)/g) ?? []).length).toBe(1);
    });
});
