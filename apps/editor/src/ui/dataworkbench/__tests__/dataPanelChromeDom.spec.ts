/**
 * §DW-ONE-HEADER-BAND (L-3700) — the header, ASSEMBLED.
 *
 * The sibling `dataPanelChrome.spec.ts` reads shipped source as text. This one
 * BUILDS the real `DataWorkbench` under happy-dom and asserts the DOM it
 * produces, which is the only way to establish two things text cannot:
 *
 *   1. the header has exactly TWO children after a bucket switch — the switch
 *      is what used to run `_bucketHeaderEl.innerHTML = …` and destroy any
 *      sibling, so "the actions slot survives a rebuild" is a RUNTIME claim;
 *   2. the heatmap control is present, shows in AUDIT and hides elsewhere.
 *
 * ⛔ STILL NOT A BROWSER. happy-dom performs no layout and paints nothing, so
 * band HEIGHTS, contrast, and whether the <option> popup is legible on the
 * purple gradient are NOT established here or anywhere in this lane.
 *
 * Why `runtime.events` is faked before the import: `DataWorkbench._bindEvents`
 * subscribes through the deferral bridge, and several panels read
 * `window.runtime` at construction. Same preamble as
 * `L847-shipped-data-surface.spec.ts` — see that file for why this import graph
 * is expensive.
 *
 * ⚠ COST, MEASURED 2026-08-22: **138.76 s solo** (`transform 108.02s`). That is
 * the `@pryzm/core-app-model` root-barrel debt L847's spec bisected and named,
 * not this file's four assertions — they run in milliseconds once the graph is
 * loaded. Stated here so nobody "optimises" it by deleting the DOM arms; the
 * text arms in `dataPanelChrome.spec.ts` (1.6 s) are the cheap half and they
 * cannot make the survives-a-rebuild claim.
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
            handlers.get(event)?.forEach((h) => h(payload));
        },
    };
}

let el: HTMLElement;

beforeAll(async () => {
    (window as unknown as { runtime: unknown }).runtime = { events: makeEventsBus() };
    const { DataWorkbench } = (await import('../DataWorkbench')) as unknown as {
        DataWorkbench: new (runtime: null) => { setMode(m: string): void };
    };
    // §PERF-DW-LAZY-BUILD (2026-09-02): DOM is built on first open, not in the
    // constructor — open the panel before asserting on its chrome.
    new DataWorkbench(null).setMode('panel');
    el = document.getElementById('dw-workbench') as HTMLElement;
}, 300_000);

describe('§DW-ONE-HEADER-BAND — the assembled header', () => {
    it('the content header holds ONE band plus the navigation row', () => {
        const header = el.querySelector<HTMLElement>('.dw-content-header--lifecycle')!;
        expect(header).toBeTruthy();
        // Was three: bucket header, sub-tab bar, heatmap bar.
        const bands = [...header.children].map((c) => c.className.split(' ')[0]);
        expect(bands).toEqual(['dw-bucket-header', 'dw-subtab-bar']);
    });

    it('the actions slot SURVIVES a bucket switch', () => {
        const actions = () => el.querySelector('.dw-bucket-header-actions');
        expect(actions()).toBeTruthy();
        // This is the assertion text cannot make. Every bucket switch used to
        // rewrite the whole header's innerHTML; a sibling appended to it was
        // destroyed on the first click, which is why the heatmap controls could
        // only ever be a band.
        for (const b of ['audit', 'data-schedules', 'mediciones', 'strategize']) {
            el.querySelector<HTMLButtonElement>(`[data-bucket="${b}"]`)!.click();
            expect(actions(), `actions slot lost on switch to ${b}`).toBeTruthy();
            expect(el.querySelector('.dw-bucket-header-title')!.textContent!.length).toBeGreaterThan(0);
        }
    });

    it('⭐ the actions slot is never EMPTY, in any bucket', () => {
        // §DW-HEADER-BAND-HAS-A-JOB (L-4020..L-4023). The founder: on STRATEGIZE
        // the purple band 'runs the full panel width and is almost entirely
        // empty'. He was right — '.dw-bucket-header-actions' WAS the heatmap
        // wrapper and carried 'display: none' outside AUDIT, so six of seven
        // buckets reserved a right-hand half that nothing could occupy.
        // This is the arm that says the band has a job in every bucket.
        for (const b of ['audit', 'data-schedules', 'mediciones', 'strategize', 'validate']) {
            el.querySelector<HTMLButtonElement>(`[data-bucket="${b}"]`)!.click();
            const slot = el.querySelector<HTMLElement>('.dw-bucket-header-actions')!;
            expect(slot, `actions slot missing in ${b}`).toBeTruthy();
            const visible = [...slot.children].filter(
                (c) => (c as HTMLElement).style.display !== 'none',
            );
            expect(visible.length, `actions slot is empty in ${b}`).toBeGreaterThan(0);
            expect(slot.querySelector('#dw-refresh-btn'), `no refresh action in ${b}`).toBeTruthy();
        }
    });

    it('the heatmap control offers all five modes and is AUDIT-only', () => {
        el.querySelector<HTMLButtonElement>('[data-bucket="audit"]')!.click();
        // §DW-HEADER-BAND-HAS-A-JOB — the heatmap control is now an inner GROUP
        // inside the always-present slot, not the slot itself.
        const wrap = el.querySelector<HTMLElement>('.dw-header-ctl-group')!;
        expect(wrap.style.display).toBe('flex');

        const select = el.querySelector<HTMLSelectElement>('.dw-header-select')!;
        expect(select).toBeTruthy();
        // Capability preserved, not merely "a control exists".
        expect([...select.options].map((o) => o.value)).toEqual([
            'off', 'sync-state', 'occupancy', 'compliance', 'area-delta',
        ]);
        // Named, not colour-only (SC 1.4.1) — the old pills encoded the active
        // mode as a fill and nothing else.
        expect([...select.options].every((o) => o.textContent!.trim().length > 0)).toBe(true);
        expect(select.getAttribute('aria-label')).toBe('Heatmap overlay mode');

        el.querySelector<HTMLButtonElement>('[data-bucket="validate"]')!.click();
        expect(wrap.style.display).toBe('none');
    });

    it('the band that had no stylesheet rule is not in the DOM', () => {
        expect(el.querySelector('.dw-heatmap-bar')).toBeNull();
        expect(el.querySelector('.dw-viz-btn')).toBeNull();
    });
}, 120_000);
