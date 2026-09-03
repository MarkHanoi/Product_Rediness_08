/**
 * §U8-MULTI-VIEW — the family-editor viewport arrangement: FOUR cameras, ONE
 * bake, ONE shared rig.
 *
 * The renderer is MOCKED, per the established §OPENING-PREVIEW-HONEST-FAILURE
 * pattern (happy-dom has no WebGL and a mocked GL context would be a fake more
 * capable than the real thing). The mock records every (subject, canvas, orbit)
 * triple, which is exactly what "four views of one subject through one rig"
 * needs in order to be an assertion rather than a hope.
 *
 * ⛔ WHAT THIS FILE CANNOT TELL YOU: that a plan LOOKS orthographic. It pins
 *    that each viewport asks the shared rig for its own camera and that the
 *    plan's is an orthographic top view; the camera arithmetic itself is
 *    pinned, unmocked, in `element-preview/__tests__/previewCameraPose.spec.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OrbitState, PreviewDrawResult } from '../../element-preview/ElementPreviewRenderer';
import type { PreviewSubject } from '../../element-preview/OpeningPreviewSubject';
import { makeWindowFamily, TYPE_STD } from './windowFixture';

interface DrawRecord {
    readonly key: string;
    readonly canvas: HTMLCanvasElement;
    readonly orbit: OrbitState;
}
let nextResult: PreviewDrawResult = 'ok';
const draws: DrawRecord[] = [];
/** Claims on the SHARED rig — one per mounted viewport, never one per context. */
let mounts = 0;

vi.mock('../../element-preview/ElementPreviewRenderer', () => ({
    DEFAULT_ORBIT: Object.freeze({ yaw: -0.62, pitch: 0.22, zoom: 1 }),
    PITCH_LIMIT: 1.35,
    acquirePreviewMount: () => { mounts++; },
    releasePreviewMount: () => { mounts--; },
    previewRigDiagnostics: () => ({
        held: false, lost: false, mounts: 0, contextLosses: 0, lastFailure: null,
    }),
    requestPreviewDraw: (
        s: PreviewSubject,
        t: HTMLCanvasElement,
        o: OrbitState,
        onResult?: (r: PreviewDrawResult) => void,
    ) => {
        draws.push({ key: s.key, canvas: t, orbit: { ...o } });
        onResult?.(nextResult);
    },
}));

const {
    mountComponentPreview,
    COMPONENT_FAMILY_EDITOR_VIEWS,
    COMPONENT_VIEW_PLAN,
} = await import('../ComponentPreview');

const WORKSPACE = resolve('apps/editor/src/ui/component-editor-workspace/ComponentDefinitionWorkspace.ts');

function stateOf(host: HTMLElement): string | null {
    return host.querySelector('[data-component-preview]')
        ?.getAttribute('data-component-preview-state') ?? null;
}

describe('§U8-MULTI-VIEW — four viewports, one bake, one rig', () => {
    let host: HTMLElement;

    beforeEach(() => {
        nextResult = 'ok';
        draws.length = 0;
        mounts = 0;
        host = document.createElement('div');
        document.body.appendChild(host);
    });
    afterEach(() => { host.remove(); });

    it('⭐⭐ mounts 3-D + Plan + Front + Side, each with its OWN canvas and camera, from ONE evaluation', async () => {
        const h = mountComponentPreview(host, { views: COMPONENT_FAMILY_EDITOR_VIEWS });
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('ok');

        for (const id of ['3d', 'plan', 'front', 'side']) {
            expect(host.querySelector(`[data-component-preview-view="${id}"]`), id).not.toBeNull();
            expect(host.querySelector(`[data-component-preview-view-label="${id}"]`)?.textContent).toBeTruthy();
        }
        // FOUR distinct target canvases…
        const canvases = new Set(draws.map((d) => d.canvas));
        expect(canvases.size).toBe(4);
        // …drawing ONE subject. Four evaluations could disagree with each other;
        // one bake cannot.
        expect(new Set(draws.map((d) => d.key)).size).toBe(1);
        const last = h.lastResult();
        expect(last?.ok).toBe(true);
        if (last?.ok) expect(draws[0]!.key).toBe(last.subject.key);

        // ⭐ FOUR CLAIMS ON THE ONE SHARED RIG — not four contexts. The rig is a
        // module singleton and the only way to hold it is this counter.
        expect(mounts).toBe(4);
        h.dispose();
        expect(mounts, 'every claim released').toBe(0);
    });

    it('⭐ the PLAN viewport asks for an ORTHOGRAPHIC TOP camera; the 3-D one does not', async () => {
        const h = mountComponentPreview(host, { views: COMPONENT_FAMILY_EDITOR_VIEWS });
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });

        const projections = draws.map((d) => d.orbit.projection ?? 'perspective');
        expect(projections[0], 'the 3-D view stays perspective').toBe('perspective');
        expect(projections.filter((p) => p === 'orthographic')).toHaveLength(3);

        const plan = draws[1]!;
        expect(plan.orbit.projection).toBe('orthographic');
        expect(plan.orbit.pitch).toBeCloseTo(Math.PI / 2, 12);
        expect(plan.orbit.yaw).toBeCloseTo(0, 12);
        expect(COMPONENT_VIEW_PLAN.interactive, 'an elevation you can orbit is not an elevation').toBe(false);

        // The fixed views take no tab stop and carry no "drag to rotate" promise.
        const planCanvas = host.querySelector('[data-component-preview-view="plan"] canvas') as HTMLCanvasElement;
        expect(planCanvas.tabIndex).toBe(-1);
        const isoCanvas = host.querySelector('[data-component-preview-view="3d"] canvas') as HTMLCanvasElement;
        expect(isoCanvas.tabIndex).toBe(0);
        h.dispose();
    });

    it('⭐ a refusal tears down EVERY viewport — a stale elevation is as much a lie as a stale 3-D', async () => {
        const h = mountComponentPreview(host, { views: COMPONENT_FAMILY_EDITOR_VIEWS });
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(host.querySelectorAll('[data-component-preview-stage] canvas')).toHaveLength(4);

        await h.update({ family: makeWindowFamily({ glassExpression: 'Width - * 2' }), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('refused');
        expect(host.querySelectorAll('[data-component-preview-stage] canvas')).toHaveLength(0);
        expect(mounts, 'the refused state holds no claim on the shared rig').toBe(0);

        // …and it recovers, in all four.
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('ok');
        expect(host.querySelectorAll('[data-component-preview-stage] canvas')).toHaveLength(4);
        h.dispose();
    });

    it('⛔ the DEFAULT is still ONE view — every existing caller is unchanged', async () => {
        const h = mountComponentPreview(host);
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(host.querySelectorAll('[data-component-preview-stage] canvas')).toHaveLength(1);
        expect(mounts).toBe(1);
        // No view label chrome on a single-view mount.
        expect(host.querySelector('[data-component-preview-view-label]')).toBeNull();
        expect(draws[0]!.orbit.projection ?? 'perspective').toBe('perspective');
        h.dispose();
    });
});

describe('§U8-MULTI-VIEW — the workspace mounts the four-view arrangement (source-level)', () => {
    const wsSrc = readFileSync(WORKSPACE, 'utf8');

    it('passes the family-editor presets into the SAME mount U5 wired, not a second rig', () => {
        expect(wsSrc).toContain('mountComponentPreview(previewHost');
        expect(wsSrc).toContain('views: COMPONENT_FAMILY_EDITOR_VIEWS');
        // ⛔ No second renderer, no rAF, no context of its own (P3/P2).
        expect(wsSrc).not.toMatch(/new\s+WebGLRenderer|requestAnimationFrame\(/);
    });
});
