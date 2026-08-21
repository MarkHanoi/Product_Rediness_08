// §SHEET-INACTIVE-VIEW-NEVER-PROJECTS (L-1841)
//
// The founder: an East Elevation placed on a sheet showed "Generating
// projection…" over a progress bar frozen at 40%, forever.
//
// The request machinery already existed and was already wired. Two things were
// wrong, and this suite pins both:
//
//  1. WHEN — `orchestrate()` had ONE call site, `SheetEditorPanel.open()`, over
//     the viewports present at that instant. A view added to an ALREADY-OPEN
//     sheet was never asked for. The fix moves the request to the point of
//     consumption (`requestFor`, called while rendering each viewport), so the
//     tests below exercise `requestFor` directly and assert it is cheap enough
//     to sit on that hot path — i.e. de-duplicated per (viewId, generation).
//
//  2. SILENCE — `requestBackgroundProjection` returned void with five
//     non-success branches, four of them silent early returns, so "in flight"
//     and "will never run" were indistinguishable and both rendered the frozen
//     bar. It now returns a ProjectionOutcome, and the orchestrator maps every
//     one of them onto a distinct SheetProjectionStatus. [context-data-honesty]

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stores are stubbed: this suite is about the orchestrator's own logic ──
const viewTypes    = new Map<string, string>();
const cached       = new Set<string>();
const generations  = new Map<string, number>();

vi.mock('@pryzm/core-app-model', () => ({
    viewDefinitionStore: {
        get: (id: string) =>
            viewTypes.has(id) ? { id, viewType: viewTypes.get(id) } : undefined,
    },
    viewTechnicalDrawingCache: {
        has: (id: string) => cached.has(id),
        currentGeneration: (id: string) => generations.get(id) ?? 1,
    },
}));

const { sheetProjectionOrchestrator } = await import(
    '../src/ui/SheetEditor/SheetProjectionOrchestrator'
);

/** Install a viewController whose projection request resolves to `outcome`. */
function installController(outcome: string | null, opts: { missing?: boolean } = {}) {
    const spy = vi.fn(async () => outcome);
    (globalThis as any).window = opts.missing
        ? {}
        : { viewController: { requestBackgroundProjection: spy } };
    return spy;
}

beforeEach(() => {
    viewTypes.clear();
    cached.clear();
    generations.clear();
    sheetProjectionOrchestrator.invalidate();
    vi.restoreAllMocks();
});

describe('§SHEET-INACTIVE-VIEW-NEVER-PROJECTS — a sheet can ask (L-1841)', () => {
    it('requests a projection for an elevation that has never been activated', async () => {
        viewTypes.set('v-elev', 'elevation');
        const spy = installController('projected');

        expect(sheetProjectionOrchestrator.requestFor('v-elev')).toBe('in-flight');
        expect(spy).toHaveBeenCalledWith('v-elev');
    });

    it('sections and details are projectable too', () => {
        viewTypes.set('v-sec', 'section');
        viewTypes.set('v-det', 'detail');
        installController('projected');

        expect(sheetProjectionOrchestrator.requestFor('v-sec')).toBe('in-flight');
        expect(sheetProjectionOrchestrator.requestFor('v-det')).toBe('in-flight');
    });

    it('a cached drawing short-circuits to ready and never hits the projector', () => {
        viewTypes.set('v-elev', 'elevation');
        cached.add('v-elev');
        const spy = installController('projected');

        expect(sheetProjectionOrchestrator.requestFor('v-elev')).toBe('ready');
        expect(spy).not.toHaveBeenCalled();
    });

    it('plan and 3D view types are never projected here', () => {
        viewTypes.set('v-plan', 'plan');
        viewTypes.set('v-3d',   '3d');
        viewTypes.set('v-walk', 'walkthrough');
        const spy = installController('projected');

        expect(sheetProjectionOrchestrator.requestFor('v-plan')).toBe('not-projectable');
        expect(sheetProjectionOrchestrator.requestFor('v-3d')).toBe('not-projectable');
        expect(sheetProjectionOrchestrator.requestFor('v-walk')).toBe('not-projectable');
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('§SHEET-INACTIVE-VIEW-NEVER-PROJECTS — de-duplication (L-1841)', () => {
    it('REGRESSION: repeated calls at one generation project exactly ONCE', () => {
        // `_refreshCanvas` runs on every drag, select and nudge. If this were not
        // de-duplicated the fix would trade a frozen bar for a projector storm.
        viewTypes.set('v-elev', 'elevation');
        const spy = installController('projected');

        for (let i = 0; i < 25; i++) sheetProjectionOrchestrator.requestFor('v-elev');

        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a bumped cache generation lets exactly one NEW request through', () => {
        viewTypes.set('v-elev', 'elevation');
        const spy = installController('projected');

        generations.set('v-elev', 1);
        sheetProjectionOrchestrator.requestFor('v-elev');
        sheetProjectionOrchestrator.requestFor('v-elev');
        expect(spy).toHaveBeenCalledTimes(1);

        generations.set('v-elev', 2);                 // something invalidated the view
        sheetProjectionOrchestrator.requestFor('v-elev');
        sheetProjectionOrchestrator.requestFor('v-elev');
        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('orchestrate() de-duplicates viewports sharing one view', () => {
        viewTypes.set('v-elev', 'elevation');
        const spy = installController('projected');

        sheetProjectionOrchestrator.orchestrate([
            { id: 'vp1', viewId: 'v-elev' },
            { id: 'vp2', viewId: 'v-elev' },
            { id: 'vp3', viewId: 'v-elev' },
        ] as never);

        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('§SHEET-INACTIVE-VIEW-NEVER-PROJECTS — outcomes are DISTINCT (L-1841)', () => {
    // The heart of the defect: these all used to render as the same frozen bar.
    const cases: Array<[string, string]> = [
        ['projected',    'ready'],
        ['cached',       'ready'],
        ['no-geometry',  'no-geometry'],
        ['no-projector', 'unavailable'],
        ['no-view',      'unavailable'],
        ['failed',       'failed'],
    ];

    for (const [outcome, expected] of cases) {
        it(`outcome '${outcome}' settles as '${expected}'`, async () => {
            viewTypes.set('v-elev', 'elevation');
            installController(outcome);

            const seen: string[] = [];
            const off = sheetProjectionOrchestrator.onStatusChanged((_id, s) => { seen.push(s); });

            expect(sheetProjectionOrchestrator.requestFor('v-elev')).toBe('in-flight');
            await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

            expect(seen).toContain(expected);
            expect(sheetProjectionOrchestrator.statusOf('v-elev')).toBe(expected);
            off();
        });
    }

    it('REGRESSION: a terminal-negative outcome is NOT reported as in-flight', async () => {
        // This is the exact lie: the placeholder shows a progress bar only for
        // 'in-flight', so 'no-geometry' leaking through as in-flight would
        // reinstate the founder's frozen 40% bar.
        viewTypes.set('v-elev', 'elevation');
        installController('no-geometry');

        sheetProjectionOrchestrator.requestFor('v-elev');
        await vi.waitFor(() =>
            expect(sheetProjectionOrchestrator.statusOf('v-elev')).not.toBe('in-flight'));

        expect(sheetProjectionOrchestrator.statusOf('v-elev')).toBe('no-geometry');
    });

    it('a terminal outcome is remembered, so the projector is not re-hit', async () => {
        viewTypes.set('v-elev', 'elevation');
        const spy = installController('no-geometry');

        sheetProjectionOrchestrator.requestFor('v-elev');
        await vi.waitFor(() =>
            expect(sheetProjectionOrchestrator.statusOf('v-elev')).toBe('no-geometry'));

        for (let i = 0; i < 10; i++) sheetProjectionOrchestrator.requestFor('v-elev');
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a missing viewController reports unavailable, never in-flight', () => {
        viewTypes.set('v-elev', 'elevation');
        installController(null, { missing: true });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(sheetProjectionOrchestrator.requestFor('v-elev')).toBe('unavailable');
    });

    it('a rejecting request settles as failed rather than stranding in-flight', async () => {
        viewTypes.set('v-elev', 'elevation');
        (globalThis as any).window = {
            viewController: { requestBackgroundProjection: () => Promise.reject(new Error('boom')) },
        };
        vi.spyOn(console, 'error').mockImplementation(() => {});

        sheetProjectionOrchestrator.requestFor('v-elev');
        await vi.waitFor(() =>
            expect(sheetProjectionOrchestrator.statusOf('v-elev')).toBe('failed'));
    });
});
