/**
 * §UX1-PHASE-CHROME — the phase decision actually reaches the DOM.
 *
 * `panelDefaults.spec.ts` pins the TABLE. This pins the half that the table
 * cannot: that something turns "absent on the globe" into pixels that are not
 * there, and — the part that would otherwise rot silently — that it turns them
 * back on when the canvas is reached.
 *
 * The failure this exists to catch is the one this repo names "committed ≠
 * reachable": a correct table wired to nothing. Before this spec, `setAppPhase`
 * and `installPhaseChrome` had ZERO production callers and every panelDefaults
 * test still passed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    applyPhaseChrome,
    installPhaseChrome,
    PHASE_CHROME_SELECTORS,
    __resetPhaseChromeForTests,
} from '../layout/phaseChrome';
import {
    setAppPhase,
    setPanelOpen,
    panelState,
    __resetPanelSessionStateForTests,
} from '../layout/panelDefaults';

/** Builds one element per selector so a pass has something real to act on. */
function mountFixtures(): void {
    document.body.innerHTML = '';
    for (const row of PHASE_CHROME_SELECTORS) {
        for (const sel of row.selectors) {
            const el = document.createElement('div');
            if (sel.startsWith('#')) el.id = sel.slice(1);
            else if (sel.startsWith('.')) el.className = sel.slice(1);
            else continue;
            document.body.appendChild(el);
        }
    }
}

beforeEach(() => {
    __resetPanelSessionStateForTests();
    __resetPhaseChromeForTests();
    mountFixtures();
});
afterEach(() => { __resetPhaseChromeForTests(); document.body.innerHTML = ''; });

describe('§UX1-PHASE-CHROME — the globe pass', () => {
    it('hides every founder-boxed group while the phase is the onboarding globe', () => {
        const report = applyPhaseChrome();
        expect(report.phase).toBe('onboarding-globe');
        expect(report.hidden).toBeGreaterThan(0);
        for (const row of PHASE_CHROME_SELECTORS) {
            for (const sel of row.selectors) {
                const el = document.querySelector(sel) as HTMLElement | null;
                expect(el, sel).not.toBeNull();
                expect(el!.style.display, `${sel} is still visible on the globe`).toBe('none');
            }
        }
    });

    it('reports rows it could not resolve, instead of counting a no-op query as success', () => {
        // "matched nothing" and "matched and hid it" must never print the same
        // result — a selector that has rotted is invisible otherwise.
        document.body.innerHTML = '';
        const report = applyPhaseChrome();
        expect(report.hidden).toBe(0);
        expect([...report.unresolved].sort()).toEqual(
            PHASE_CHROME_SELECTORS.map((r) => r.panel).sort(),
        );
    });
});

describe('§UX1-PHASE-CHROME — reaching the canvas brings the chrome back', () => {
    it('restores everything the canvas OPENS — and leaves closed what the canvas closes', () => {
        applyPhaseChrome();
        setAppPhase('canvas');
        const report = applyPhaseChrome();
        expect(report.phase).toBe('canvas');
        expect(report.shown).toBeGreaterThan(0);
        // §UX1-VP-DEFAULT-CLOSED — this used to assert "everything comes back", which
        // was true only while every governed row was `open` on the canvas. It stopped
        // being true when `view-properties` became `closed` there, and the assertion
        // then demanded the exact regression the founder reported. The rule the
        // controller actually implements is `panelState(row) !== 'open'` ⇒ hidden, so
        // that is what is asserted — in BOTH directions, which is what makes it a test
        // of the mechanism rather than a transcript of today's table.
        for (const row of PHASE_CHROME_SELECTORS) {
            const wantHidden = panelState(row.panel) !== 'open';
            for (const sel of row.selectors) {
                const el = document.querySelector(sel) as HTMLElement | null;
                expect(el, sel).not.toBeNull();
                expect(
                    el!.style.display === 'none',
                    `${sel}: panelState=${panelState(row.panel)} but display=${el!.style.display}`,
                ).toBe(wantHidden);
            }
        }
    });

    it('⭐ the reopen click brings View Properties back — the route C82 §1.1 requires', () => {
        // `view-properties` being CLOSED on the canvas is only legal because there is
        // a way back. That way is: launcher → `setPanelOpen` → `onPanelStateChanged`
        // → this controller. Asserting the END of that chain is the point — a test
        // that only checked `isPanelOpen` would pass with nothing on screen.
        setAppPhase('canvas');
        applyPhaseChrome();
        const vp = document.querySelector('.vp-root') as HTMLElement;
        expect(vp.style.display, 'View Properties did not start closed').toBe('none');

        setPanelOpen('view-properties', true);
        applyPhaseChrome();
        expect(vp.style.display, 'the reopen route led nowhere').not.toBe('none');

        setPanelOpen('view-properties', false);
        applyPhaseChrome();
        expect(vp.style.display, 'the launcher could not close it again').toBe('none');
    });

    it('⭐ hides the panel SHELL too, not just the section — no titled empty box', () => {
        // §UX2-PANEL-SHELL. `showViewProperties()` builds
        // `.gpp-panel > .gpp-header('VIEW PROPERTIES' + close) + .vp-root` and then sets
        // display:block on the SHELL. Hiding only `.vp-root` left that header bar over
        // an empty body — neither open nor closed.
        const shell = document.createElement('div');
        shell.className = 'gpp-panel';
        const header = document.createElement('div');
        header.className = 'gpp-header';
        const vp = document.createElement('div');
        vp.className = 'vp-root';
        shell.appendChild(header);
        shell.appendChild(vp);
        document.body.appendChild(shell);

        setAppPhase('canvas');
        applyPhaseChrome();
        expect(vp.style.display).toBe('none');
        expect(shell.style.display, 'the VIEW PROPERTIES header bar survived the close').toBe('none');

        setPanelOpen('view-properties', true);
        applyPhaseChrome();
        expect(shell.style.display, 'the shell did not come back with the section').not.toBe('none');
        shell.remove();
    });

    it('⭐ RE-ASSERTS after another module turns the panel back on', () => {
        // `PropertyPanel._makeVisible()` sets `display:block` on the shell every time
        // `showViewProperties()` runs — which is every deselect. The old guard was
        // "have I marked it?", so it saw its own stale mark, concluded the job was
        // done, and never hid it again: one deselect and the closed panel was back for
        // the rest of the session. The guard is now "is it visible?".
        setAppPhase('canvas');
        const vp = document.querySelector('.vp-root') as HTMLElement;
        applyPhaseChrome();
        expect(vp.style.display).toBe('none');

        vp.style.display = 'block'; // another module, mid-session
        const again = applyPhaseChrome();
        expect(again.hidden, 'the re-assert pass hid nothing').toBeGreaterThan(0);
        expect(vp.style.display, 'a foreign display write defeated the phase controller').toBe('none');
    });

    it('restores the AUTHORED display value, never a guessed one', () => {
        // A pill authored `display: inline-flex` must not come back as `block`.
        const el = document.getElementById('pryzm-site-view-launcher') as HTMLElement;
        el.style.display = 'inline-flex';
        applyPhaseChrome();
        expect(el.style.display).toBe('none');
        setAppPhase('canvas');
        applyPhaseChrome();
        expect(el.style.display).toBe('inline-flex');
    });

    it('is idempotent — repeated passes neither double-hide nor lose the original', () => {
        const el = document.getElementById('pryzm-site-view-launcher') as HTMLElement;
        el.style.display = 'inline-flex';
        applyPhaseChrome();
        const second = applyPhaseChrome();
        expect(second.hidden, 'a second pass hid something already hidden').toBe(0);
        setAppPhase('canvas');
        applyPhaseChrome();
        expect(el.style.display).toBe('inline-flex');
    });
});

describe('§UX2-REOPEN-SHIPS-WITH-CLOSE — the route exists in the DOM, not just in the table', () => {
    // COMMITTED ≠ REACHABLE. `panelDefaults.spec.ts` proves the launcher's testid
    // occurs in a source file; that is a rename/typo check and C82 §5.4 says so
    // explicitly. THIS asserts the thing the founder experiences: after installing
    // the controller, is there a real button in the document, and does clicking it
    // put View Properties back? A model-level assertion would pass with nothing on
    // screen — which is exactly the state HEAD was in.
    it('⭐ installing the phase controller MOUNTS the reopen button on the canvas', () => {
        setAppPhase('canvas');
        const dispose = installPhaseChrome();
        const btn = document.querySelector('[data-testid="view-properties-launcher"]') as HTMLButtonElement | null;
        expect(btn, 'the close mechanism installed without its route back').not.toBeNull();
        expect(btn!.tagName).toBe('BUTTON');
        expect(btn!.style.display).not.toBe('none');

        const vp = document.querySelector('.vp-root') as HTMLElement;
        expect(vp.style.display, 'View Properties did not start closed').toBe('none');
        btn!.click();
        expect(vp.style.display, 'the button is on screen but leads nowhere').not.toBe('none');
        btn!.click();
        expect(vp.style.display, 'the button could not close it again').toBe('none');
        dispose();
    });

    it('⭐ and does NOT mount it on the Earth phase — skip-mount, not hide', () => {
        // The founder asked for View Properties to be absent on PRYZM Earth. A
        // button that opens a panel which should not exist in that phase is worse
        // than no button — and `display:none` is not good enough either, because a
        // hidden button is still in the accessibility tree and still tabbable.
        // The node must not be CREATED.
        document.body.innerHTML = ''; // no fixture stand-in for the launcher
        const dispose = installPhaseChrome();
        expect(
            document.querySelector('[data-testid="view-properties-launcher"]'),
            'the launcher was mounted on the globe',
        ).toBeNull();
        setAppPhase('canvas');
        expect(
            document.querySelector('[data-testid="view-properties-launcher"]'),
            'reaching the canvas did not bring the launcher with it',
        ).not.toBeNull();
        dispose();
        expect(
            document.querySelector('[data-testid="view-properties-launcher"]'),
            'disposing the controller left the button behind',
        ).toBeNull();
    });
});

describe('§UX1-PHASE-CHROME — installation', () => {
    it('applies immediately on install, and again on the phase change', () => {
        const dispose = installPhaseChrome();
        const el = document.getElementById('pryzm-renderer-backend-toggle') as HTMLElement;
        expect(el.style.display).toBe('none');
        setAppPhase('canvas');
        expect(el.style.display).not.toBe('none');
        dispose();
    });

    it('catches chrome that mounts AFTER the pass — the remount race', () => {
        // `RendererBackendToggle.mount()` calls `unmount()` first and rebuilds its
        // node, and initScene remounts it three times. Without the observer, a
        // rebuild after the phase pass would put the pill back on the globe.
        const dispose = installPhaseChrome();
        const fresh = document.createElement('div');
        fresh.className = 'vp-root';
        document.body.appendChild(fresh);
        return new Promise<void>((done) => {
            setTimeout(() => {
                expect(fresh.style.display, 'a late-mounted panel escaped the phase pass').toBe('none');
                dispose();
                done();
            }, 30);
        });
    });

    it('every selector row declares its enforcement strength and says what it does not achieve', () => {
        // HIDE and SKIP-MOUNT are different words on purpose: hiding removes the
        // pixels, not the subscriptions. A row that failed to say which it got
        // would let the weaker one be read as the stronger.
        for (const row of PHASE_CHROME_SELECTORS) {
            expect(['skip-mount', 'hide']).toContain(row.enforcement);
            expect(row.note.length, `${row.panel} has no stated rationale`).toBeGreaterThan(60);
            expect(row.selectors.length, `${row.panel} has no selectors`).toBeGreaterThan(0);
        }
    });
});
