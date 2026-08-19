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
    it('restores everything when the phase latches to canvas', () => {
        applyPhaseChrome();
        setAppPhase('canvas');
        const report = applyPhaseChrome();
        expect(report.phase).toBe('canvas');
        expect(report.shown).toBeGreaterThan(0);
        for (const row of PHASE_CHROME_SELECTORS) {
            for (const sel of row.selectors) {
                const el = document.querySelector(sel) as HTMLElement | null;
                expect(el!.style.display, `${sel} stayed hidden on the canvas`).not.toBe('none');
            }
        }
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
