// §SPLASH-IS-ONE-COMPONENT (lane STARTUP-SPEED-AND-SPLASH, founder 2026-09-06:
// "the loading, don't use the current one (photo 1), add photo 2, which is the project start-up").
//
// ⭐ THE ASK HAS TWO HALVES AND THE SECOND ONE IS THE ARCHITECTURAL ONE.
//   (1) the site-activation surface must LOOK like the boot splash — pastel mesh gradient, hero
//       pyramid, PRYZM wordmark, hairline rule, small caption; and
//   (2) it must BE the boot splash. Copying photo 2's hexes and gradient stack into
//       `LoadingOverlayView` would produce two definitions of one look, which is precisely the
//       defect the founder reported hours earlier the same day (L-12965: seven colours defined
//       twice in the 2D and 3D palettes, drifted apart, neither definition wrong on its own).
//
// So the anti-drift assertion below is not decoration — it is the point. A future edit that
// re-forks the gradient into either surface fails here.
//
// ⛔ AND THE HONEST PROGRESS MUST SURVIVE THE RESTYLE. The founder still wants to know it is
// working, so the tile counter and the percentage are asserted to reach the screen. A prettier
// screen that says less than the one it replaced is a regression.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoadingOverlayView } from '../LoadingOverlayView';
import { ensurePryzmSplashStyles } from '../PryzmSplashChrome';

const HERE = resolve(__dirname, '..');

beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
});

describe('the view-activation surface IS the boot splash', () => {
    it('paints the shared splash ground, the hero pyramid and the PRYZM wordmark', () => {
        const view = new LoadingOverlayView();
        view.show({ title: 'Opening the 3D Site', label: 'Starting the 3D view…' });

        const ground = document.getElementById('pryzm-loading-backdrop');
        expect(ground).not.toBeNull();
        // The GROUND is the shared mesh gradient, not this surface's own flat fill.
        expect(ground!.classList.contains('pryzm-splash-ground')).toBe(true);

        const card = document.getElementById('pryzm-loading-overlay')!;
        expect(card.querySelector('.pryzm-splash-column')).not.toBeNull();
        expect(card.querySelector('.pryzm-splash-pyramid')).not.toBeNull();
        expect(card.querySelector('.pryzm-splash-name')!.textContent).toBe('PRYZM');
        // The hairline rule is ALSO the progress track — one element, two readings.
        expect(card.querySelector('.pryzm-splash-track .pryzm-splash-bar')).not.toBeNull();
    });

    it('keeps the honest progress: the caption, the tile counter AND the percentage all land', () => {
        const view = new LoadingOverlayView();
        view.show({ title: 'Opening the 3D Site', label: 'Streaming terrain & 3D tiles… (step 2 of 4)' });
        view.setProgress({ completed: 59, total: 100, note: '48 / 49 tiles' });

        const caption = document.querySelector('[data-testid="pryzm-splash-caption"]')!;
        const meta = document.querySelector('[data-testid="pryzm-splash-meta"]')!;
        expect(caption.textContent).toBe('Opening the 3D Site');
        expect(meta.textContent).toContain('Streaming terrain & 3D tiles… (step 2 of 4)');
        expect(meta.textContent).toContain('48 / 49 tiles');
        expect(meta.textContent).toContain('59%');
        // The bar is a CSS width (compositor-driven), clamped below 100 % while still working.
        const bar = document.querySelector('.pryzm-splash-bar') as HTMLElement;
        expect(bar.style.width).toBe('59%');
    });

    it('drives the bar from the REAL ratio and never lets it run backwards', () => {
        const view = new LoadingOverlayView();
        view.show({ title: 'Opening the 3D Site' });
        view.setProgress({ completed: 70, total: 100 });
        view.setProgress({ completed: 40, total: 100 });
        const bar = document.querySelector('.pryzm-splash-bar') as HTMLElement;
        expect(bar.style.width).toBe('70%');
    });

    it('surfaces a stall as an ESCAPABLE error on the same splash, never an eternal spinner', () => {
        const view = new LoadingOverlayView();
        view.show({ title: 'Opening the 3D Site' });
        let retried = 0;
        view.showError({
            title: 'Opening the 3D Site — taking too long',
            message: 'The map tiles stopped arriving.',
            actions: [
                { label: 'Try again', primary: true, onClick: () => { retried++; } },
                { label: 'Continue anyway', onClick: () => {} },
            ],
        });
        const actions = document.querySelector('.pryzm-splash-actions') as HTMLElement;
        expect(actions.hidden).toBe(false);
        const buttons = [...actions.querySelectorAll('button')];
        expect(buttons.map((b) => b.textContent)).toEqual(['Try again', 'Continue anyway']);
        buttons[0]!.click();
        expect(retried).toBe(1);
        expect(document.querySelector('[data-testid="pryzm-splash-caption"]')!.textContent)
            .toContain('The map tiles stopped arriving.');
    });

    it('injects the splash stylesheet exactly ONCE however many surfaces are alive', () => {
        ensurePryzmSplashStyles();
        const a = new LoadingOverlayView();
        a.show({ title: 'Generating your model' });
        const b = new LoadingOverlayView();
        b.show({ title: 'Opening the 3D Site' });
        ensurePryzmSplashStyles();
        expect(document.querySelectorAll('#pryzm-splash-chrome-style').length).toBe(1);
    });

    it('animates the pyramid on the COMPOSITOR, never a rAF (P3 / C04)', () => {
        const raf = globalThis.requestAnimationFrame;
        let rafCalls = 0;
        (globalThis as { requestAnimationFrame: typeof raf }).requestAnimationFrame = ((cb: FrameRequestCallback) => {
            rafCalls++;
            return raf ? raf(cb) : 0;
        }) as typeof raf;
        try {
            const view = new LoadingOverlayView();
            view.show({ title: 'Opening the 3D Site' });
            view.setProgress({ completed: 10, total: 100, note: '5 / 49 tiles' });
            expect(rafCalls).toBe(0);
        } finally {
            (globalThis as { requestAnimationFrame: typeof raf }).requestAnimationFrame = raf;
        }
    });
});

describe('ANTI-DRIFT — the look is defined in exactly one file', () => {
    const read = (f: string): string => readFileSync(resolve(HERE, f), 'utf8');

    it('the mesh gradient exists ONLY in PryzmSplashChrome.ts', () => {
        expect(read('PryzmSplashChrome.ts')).toContain('radial-gradient(ellipse at 22% 44%, #c8b6ff');
        expect(read('LoadingOverlayView.ts')).not.toContain('radial-gradient');
        expect(readFileSync(resolve(HERE, '../platform/EngineLoadingOverlay.ts'), 'utf8'))
            .not.toContain('radial-gradient');
    });

    it('neither surface re-declares the wordmark, the pyramid scale or the bar gradient', () => {
        for (const f of ['LoadingOverlayView.ts', '../platform/EngineLoadingOverlay.ts']) {
            const src = readFileSync(resolve(HERE, f), 'utf8');
            expect(src).not.toContain('letter-spacing: 8px');       // the wordmark
            expect(src).not.toContain('transform: scale(2.8)');     // the hero pyramid slot
            expect(src).not.toContain('linear-gradient(90deg, #8B5CF6'); // the progress bar
        }
    });
});
