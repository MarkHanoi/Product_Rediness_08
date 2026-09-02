/**
 * §PERF-APPTHEME-MEMO (2026-09-02 perf lane, diagnosis fix 4).
 *
 * SUBJECT: injectAppTheme() concatenates ~150 static CSS chunks and runs the
 * whole string through scaleCssText() on EVERY call. The function is called
 * from a dozen panels; the axis-D cold-open profile measured the scaling pass
 * (~437 ms total) running at least twice per boot, on a pure function of
 * (static string × constant UI_SCALE).
 *
 * FIX UNDER TEST: the scaled sheet is memoized by scale factor; repeat calls
 * reuse it. Self-healing is preserved — an externally clobbered sheet is
 * restored on the next call (the pre-fix behaviour, kept deliberately).
 *
 * RED-FIRST: at the pre-fix code the repeat-call bound fails (repeat cost ≈
 * first-call cost, both re-scale).
 */
import { describe, it, expect } from 'vitest';
import { injectAppTheme } from '../AppTheme';

const THEME_ID = 'app-master-theme-v3';

describe('§PERF-APPTHEME-MEMO — the scaled master sheet is computed once', () => {
    it('a repeat injectAppTheme() reuses the scaled sheet instead of re-scaling', () => {
        const t1s = performance.now();
        injectAppTheme();
        const t1 = performance.now() - t1s;

        const el = document.getElementById(THEME_ID) as HTMLStyleElement;
        expect(el).toBeTruthy();
        const cssAfterFirst = el.textContent!;
        expect(cssAfterFirst.length).toBeGreaterThan(10_000);

        const t2s = performance.now();
        injectAppTheme();
        const t2 = performance.now() - t2s;
        console.log(`[apptheme-memo] first=${t1.toFixed(1)}ms repeat=${t2.toFixed(1)}ms`);

        // The memo claim: a repeat call is near-free relative to the first.
        expect(t2, `repeat took ${t2.toFixed(1)}ms vs first ${t1.toFixed(1)}ms`)
            .toBeLessThan(Math.max(t1 / 10, 5));
        expect(t2).toBeLessThan(30);

        // Output byte-identical, element still a singleton.
        expect(el.textContent).toBe(cssAfterFirst);
        expect(document.querySelectorAll(`#${THEME_ID}`).length).toBe(1);
    });

    it('self-heals an externally clobbered sheet (pre-fix behaviour preserved)', () => {
        injectAppTheme();
        const el = document.getElementById(THEME_ID) as HTMLStyleElement;
        const good = el.textContent!;
        el.textContent = '/* clobbered */';
        injectAppTheme();
        expect(el.textContent).toBe(good);
    });
});
