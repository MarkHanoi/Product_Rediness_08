/**
 * §PERF-VIEWPOINT-SNAPSHOT-DEFER (2026-09-02 perf lane, diagnosis fix 5).
 *
 * SUBJECT: initViewpointsPanel() used to register the "Default View" viewpoint
 * AT BOOT — `viewpoints.create()` + an immediately-invoked async
 * `defaultViewpoint.updateCamera()`. The axis-D cold-open profile measured
 * that snapshot at 560 ms inclusive, in the middle of the boot flood — and the
 * camera it captured mid-boot was itself a race (see §CAM-ECEF-HANDBACK L-746:
 * mid-boot captures have recorded positions 4,000 km off).
 *
 * FIX UNDER TEST: the default-viewpoint registration is DEFERRED off the boot
 * critical path. The capture closure is exposed on the panel result
 * (`captureDefaultViewpointSnapshot`) and scheduled by the module for the
 * first idle period (requestIdleCallback, setTimeout fallback); it is
 * idempotent, creates the viewpoint titled "Default View", snapshots the
 * camera once, and refreshes the viewpoints table.
 *
 * RED-FIRST: at the pre-fix code the FIRST test fails — the viewpoint exists
 * synchronously after initViewpointsPanel() returns.
 */
import { describe, it, expect } from 'vitest';
import * as OBC from '@thatopen/components';
import { initViewpointsPanel } from '../initViewpointsPanel';

function makeFakeViewpoints() {
    const created: Array<{
        guid: string; title: string; updateCameraCalls: number;
        updateCamera(): Promise<void>; go(): Promise<void>;
    }> = [];
    return {
        world: null as unknown,
        created,
        list: {
            values: () => created.values(),
            get: (g: string) => created.find(v => v.guid === g),
            delete: (_g: string) => { /* noop */ },
            onItemSet: { add() { /* noop */ } },
            onItemDeleted: { add() { /* noop */ } },
        },
        create() {
            const vp = {
                guid: `vp-${created.length}`,
                title: '',
                updateCameraCalls: 0,
                async updateCamera() { vp.updateCameraCalls++; },
                async go() { /* noop */ },
            };
            created.push(vp);
            return vp;
        },
    };
}

const fakeViews = {
    list: {
        values: () => [].values(),
        get: () => undefined,
        delete() { /* noop */ },
        onItemSet: { add() { /* noop */ } },
        onItemDeleted: { add() { /* noop */ } },
    },
    open: async () => { /* noop */ },
};

function initWithFakes() {
    const fakeVps = makeFakeViewpoints();
    const components = {
        get: (ctor: unknown) => (ctor === OBC.Viewpoints ? fakeVps : fakeViews),
    };
    const result = initViewpointsPanel({ components, world: {} });
    return { fakeVps, result };
}

describe('§PERF-VIEWPOINT-SNAPSHOT-DEFER — no boot-path camera snapshot', () => {
    it('initViewpointsPanel() does NOT register the default viewpoint synchronously', async () => {
        const { fakeVps } = initWithFakes();
        // Pre-fix this fails: create() ran inside initViewpointsPanel and the
        // async IIFE had already called updateCamera by the next microtask.
        expect(fakeVps.created.length, 'no viewpoint created on the boot path').toBe(0);
        await new Promise(r => setTimeout(r, 20));
        expect(fakeVps.created.reduce((n, v) => n + v.updateCameraCalls, 0),
            'no camera snapshot on the boot path').toBe(0);
    });

    it('the deferred capture creates "Default View", snapshots once, and is idempotent', async () => {
        const { fakeVps, result } = initWithFakes();
        const capture = (result as unknown as {
            captureDefaultViewpointSnapshot: () => Promise<void>;
        }).captureDefaultViewpointSnapshot;
        expect(typeof capture, 'capture closure exposed on the panel result').toBe('function');

        await capture();
        expect(fakeVps.created.length).toBe(1);
        expect(fakeVps.created[0].title).toBe('Default View');
        expect(fakeVps.created[0].updateCameraCalls).toBe(1);

        // Idempotent — a second trigger (idle callback + any future manual call)
        // must not register a second default or re-snapshot.
        await capture();
        expect(fakeVps.created.length).toBe(1);
        expect(fakeVps.created[0].updateCameraCalls).toBe(1);
    });
});
