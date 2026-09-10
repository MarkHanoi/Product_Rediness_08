/**
 * §PERF-DW-LAZY-BUILD (2026-09-02 perf lane, diagnosis fix 1).
 *
 * SUBJECT: `new DataWorkbench()` used to run `_buildDOM()` in the constructor —
 * 9 class panels + ~30 mounted tabs (type schedules from live store getAll()s,
 * the materials matrix, lifecycle/mediciones panels) built into a `dw--hidden`
 * node at BOOT, before the user ever opened the panel. Measured on the axis-D
 * cold-open cpuprofile: ~850 ms of every editor boot (_buildDOM 448 ms incl +
 * type-schedule builder 263 ms + materials matrix 84 ms + filter bar 50 ms).
 *
 * FIX UNDER TEST: the DOM is built lazily on the first transition out of
 * 'hidden' (setMode/show/toggle). Pre-open interactions must be safe no-ops
 * that keep their bookkeeping (bucket switches land after build; refresh()
 * before first open defers to the build itself, which reads the live stores).
 *
 * RED-FIRST: at the pre-fix code the FIRST assertion fails — #dw-workbench
 * exists immediately after construction.
 */
import { describe, it, expect, beforeAll } from 'vitest';

type Handler = (payload: unknown) => void;

function makeEventsBus() {
    const handlers = new Map<string, Set<Handler>>();
    return {
        on(event: string, handler: Handler): () => void {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            return () => { handlers.get(event)?.delete(handler); };
        },
        emit(event: string, payload?: unknown): void {
            handlers.get(event)?.forEach(h => h(payload));
        },
    };
}

interface WorkbenchLike {
    setMode(mode: 'hidden' | 'panel' | 'split' | 'full'): void;
    show(tab?: string): void;
    toggle(): void;
    refresh(): void;
}

let bus: ReturnType<typeof makeEventsBus>;
let DataWorkbenchCtor: new (runtime: null) => WorkbenchLike;

beforeAll(async () => {
    bus = makeEventsBus();
    (window as unknown as { runtime: unknown }).runtime = { events: bus };
    ({ DataWorkbench: DataWorkbenchCtor } = await import('../DataWorkbench') as unknown as {
        DataWorkbench: new (runtime: null) => WorkbenchLike;
    });
}, 300_000);

describe('§PERF-DW-LAZY-BUILD — workbench DOM is built on first open, not at boot', () => {
    it('construction defers the DOM; first open builds the full surface exactly once', () => {
        const t0 = performance.now();
        const dw = new DataWorkbenchCtor(null);
        const ctorMs = performance.now() - t0;
        console.log(`[lazy-build] constructor took ${ctorMs.toFixed(1)}ms`);

        // THE deferral claim — pre-fix this is the failing line (node existed at boot).
        expect(document.getElementById('dw-workbench'), 'no #dw-workbench before first open').toBeNull();

        // Pre-open refresh (project-load handler) must be a safe no-op.
        dw.refresh();
        expect(document.getElementById('dw-workbench')).toBeNull();

        // First open builds the complete surface.
        dw.setMode('panel');
        const el = document.getElementById('dw-workbench');
        expect(el, '#dw-workbench after first open').toBeTruthy();
        expect(el!.querySelector('[data-panel="hierarchy"]'), 'hierarchy panel mounted').toBeTruthy();
        expect(el!.querySelector('.dw-subtab-bar'), 'sub-tab bar mounted').toBeTruthy();
        expect(el!.querySelectorAll('.dw-panel').length, 'all tab panels mounted').toBeGreaterThan(20);
        expect(el!.classList.contains('dw--hidden')).toBe(false);

        // Later transitions must not rebuild or duplicate.
        dw.setMode('hidden');
        dw.setMode('full');
        expect(document.querySelectorAll('#dw-workbench').length).toBe(1);
        dw.setMode('hidden');
    // ⭐ EXPLICIT TIMEOUT (2026-09-10, lane CI-SIX-RED). This arm builds the WHOLE
    // workbench surface (20+ panels) and was the only `it` here left on vitest's 10 s
    // default, while its own `beforeAll` already carries 300_000. Run alone it passes
    // in ~2 s; run inside the full root suite it intermittently reported
    // "Test timed out in 10000ms" — a CONTENTION artefact reported as a product
    // failure, which is worse than a slow test because it sends the next reader after
    // a defect that is not there.
    // ⛔ This weakens NO assertion: every expectation above is STRUCTURAL (the node
    // is absent before first open, present after, panels mounted, no duplicate). The
    // constructor cost is `console.log`ged, never asserted — so there is no timing
    // claim here for a longer budget to soften. A real hang still fails, at 300 s.
    }, 300_000);

    it('pre-open bucket switches and sheet events are safe and land after build', () => {
        document.getElementById('dw-workbench')?.remove();
        const dw = new DataWorkbenchCtor(null);

        // Both of these arrive from the runtime bus BEFORE the first open.
        // Pre-fix they manipulated live DOM; now they must not throw and must
        // not force a build.
        bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
        bus.emit('pryzm-workbench-select', { id: 'wall-1' });
        expect(document.getElementById('dw-workbench')).toBeNull();

        // The requested bucket must land when the DOM materializes.
        dw.setMode('panel');
        const el = document.getElementById('dw-workbench')!;
        const auditBtn = el.querySelector<HTMLElement>('[data-bucket="audit"]');
        expect(auditBtn).toBeTruthy();
        expect(auditBtn!.classList.contains('dw-bucket-btn--active'), 'inspect switch landed on audit').toBe(true);
        const hierBtn = el.querySelector('.dw-subtab-btn[data-subtab="hierarchy"]');
        expect(hierBtn).toBeTruthy();
        dw.setMode('hidden');
    }, 60_000);
});
