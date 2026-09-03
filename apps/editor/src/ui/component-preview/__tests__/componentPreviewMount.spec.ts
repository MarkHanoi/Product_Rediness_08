/**
 * §COMPONENT-PREVIEW — the MOUNT half: the live widget's honest states, the
 * newest-wins re-entrancy rule, the thumbnail cache discipline, and the
 * source-level wiring of both production mounts.
 *
 * The renderer is MOCKED per the established §OPENING-PREVIEW-HONEST-FAILURE
 * pattern (`ElementPreviewFailureReporting.spec.ts`): what is under test is the
 * CONSUMER of the draw result, not the scheduling or the GPU — happy-dom has no
 * WebGL and a mocked context would be a fake more capable than the real thing.
 * The mock records which subject keys were drawn, which is exactly what the
 * stale-shape assertions need.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PreviewDrawResult } from '../../element-preview/ElementPreviewRenderer';
import type { PreviewSubject } from '../../element-preview/OpeningPreviewSubject';
import { makeWindowFamily, span, P_WIDTH, SOL_BOOL, TYPE_STD } from './windowFixture';
import { isMeshPart, type PreviewMeshPart } from '../../element-preview/OpeningPreviewSubject';

/** The outcome the stubbed renderer reports for the next draws. */
let nextResult: PreviewDrawResult = 'ok';
/** Every subject key handed to the renderer, in draw order. */
const drawnKeys: string[] = [];
let mounts = 0;

vi.mock('../../element-preview/ElementPreviewRenderer', () => ({
    DEFAULT_ORBIT: Object.freeze({ yaw: -0.62, pitch: 0.22, zoom: 1 }),
    PITCH_LIMIT: 1.35,
    acquirePreviewMount: () => { mounts++; },
    releasePreviewMount: () => { mounts--; },
    previewRigDiagnostics: () => ({
        held: false, lost: false, mounts: 0, contextLosses: 0, lastFailure: null,
    }),
    // Synchronous on purpose — the real one coalesces through the frame
    // scheduler; under test the CONSUMER of the result is the subject.
    requestPreviewDraw: (
        s: PreviewSubject,
        _t: HTMLCanvasElement,
        _o: unknown,
        onResult?: (r: PreviewDrawResult) => void,
    ) => {
        drawnKeys.push(s.key);
        onResult?.(nextResult);
    },
}));

const { mountComponentPreview } = await import('../ComponentPreview');
const { getComponentThumbnail, _clearComponentThumbnailCacheForTest } =
    await import('../componentThumbnails');

const WORKSPACE = resolve('apps/editor/src/ui/component-editor-workspace/ComponentDefinitionWorkspace.ts');
const BROWSER = resolve('apps/editor/src/ui/component-browser/ComponentBrowserPanel.ts');

function stateOf(host: HTMLElement): string | null {
    return host.querySelector('[data-component-preview]')
        ?.getAttribute('data-component-preview-state') ?? null;
}

describe('§COMPONENT-PREVIEW — the live widget\'s honest states', () => {
    let host: HTMLElement;

    beforeEach(() => {
        nextResult = 'ok';
        drawnKeys.length = 0;
        mounts = 0;
        host = document.createElement('div');
        document.body.appendChild(host);
    });
    afterEach(() => { host.remove(); });

    it('mounts EMPTY (a named sentence, not a blank frame) and draws nothing until the first update', () => {
        const h = mountComponentPreview(host);
        expect(stateOf(host)).toBe('empty');
        expect(drawnKeys).toHaveLength(0);
        expect(host.querySelector('[data-component-preview-empty]')?.textContent).toMatch(/No evaluation yet/);
        h.dispose();
    });

    it('⭐ a good definition evaluates → OK state, the evaluated subject is DRAWN, and the caption names what is on screen', async () => {
        const h = mountComponentPreview(host);
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('ok');
        expect(drawnKeys.length).toBeGreaterThan(0);
        const last = h.lastResult();
        expect(last?.ok).toBe(true);
        if (last?.ok) expect(drawnKeys[drawnKeys.length - 1]).toBe(last.subject.key);
        expect(host.textContent).toContain('Window · Standard');
        expect(mounts, 'exactly one claim on the shared rig').toBe(1);
        h.dispose();
        expect(mounts, 'dispose releases the claim').toBe(0);
    });

    it('⭐⭐ a definition that STOPS evaluating shows the evaluator\'s sentences and TEARS THE CANVAS DOWN — never a stale shape wearing new parameters', async () => {
        const h = mountComponentPreview(host);
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('ok');
        expect(host.querySelector('[data-component-preview-stage] canvas')).not.toBeNull();

        await h.update({ family: makeWindowFamily({ glassExpression: 'Width - * 2' }), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('refused');
        // ⛔ THE STALE-SHAPE RULE: the previous geometry is GONE, not merely covered.
        expect(host.querySelector('[data-component-preview-stage] canvas')).toBeNull();
        expect(mounts, 'the refused state holds no claim on the shared rig').toBe(0);
        const refusal = host.querySelector('[data-component-preview-refusal]') as HTMLElement;
        expect(refusal.style.display).not.toBe('none');
        expect(refusal.getAttribute('data-component-preview-refusal-reason')).toBe('resolver-failed');
        expect(refusal.textContent).toContain('expression-parse');

        // And it RECOVERS — the refusal does not latch (the L-9602 lesson).
        await h.update({ family: makeWindowFamily(), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('ok');
        expect(host.querySelector('[data-component-preview-stage] canvas')).not.toBeNull();
        h.dispose();
    });

    it('a PARTIAL bake draws what evaluated and the strip names each refused solid', async () => {
        const h = mountComponentPreview(host);
        await h.update({ family: makeWindowFamily({ withBooleanSolid: true }), typeId: TYPE_STD });
        expect(stateOf(host)).toBe('partial');
        expect(host.querySelector('[data-component-preview-stage] canvas')).not.toBeNull();
        const strip = host.querySelector('[data-component-preview-partial]') as HTMLElement;
        expect(strip.style.display).not.toBe('none');
        expect(strip.textContent).toContain(SOL_BOOL);
        expect(strip.textContent).toContain('unsupported-feature');
        h.dispose();
    });

    it('⭐ NEWEST WINS — two overlapping updates settle to the SECOND one\'s geometry, whatever order the bakes complete in', async () => {
        const h = mountComponentPreview(host);
        const family = makeWindowFamily();
        const pA = h.update({ family, typeId: TYPE_STD, instanceOverrides: { [P_WIDTH]: 1400 } });
        const pB = h.update({ family, typeId: TYPE_STD });
        await Promise.all([pA, pB]);
        const last = h.lastResult();
        expect(last?.ok).toBe(true);
        if (last?.ok) {
            const glass = (last.subject.parts as PreviewMeshPart[]).filter(isMeshPart)[1]!;
            expect(span(glass.position, 0), 'B (Width 1200 → 1.050 m) is the applied state').toBeCloseTo(1.05, 6);
            expect(drawnKeys[drawnKeys.length - 1]).toBe(last.subject.key);
        }
        h.dispose();
    });
});

describe('§COMPONENT-PREVIEW — thumbnail cache discipline', () => {
    beforeEach(() => {
        nextResult = 'ok';
        drawnKeys.length = 0;
        mounts = 0;
        _clearComponentThumbnailCacheForTest();
        // happy-dom's canvas stub may not implement toDataURL — pin a stable one.
        HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,U5';
    });

    it('renders once and serves the second request from cache (keyed schemaHash:typeId)', async () => {
        const family = makeWindowFamily();
        const a = await getComponentThumbnail({ family, typeId: TYPE_STD });
        expect(a.ok).toBe(true);
        const drawsAfterFirst = drawnKeys.length;
        expect(drawsAfterFirst).toBeGreaterThan(0);
        const b = await getComponentThumbnail({ family, typeId: TYPE_STD });
        expect(b).toEqual(a);
        expect(drawnKeys.length, 'no second draw — the cache answered').toBe(drawsAfterFirst);
        expect(mounts, 'no lingering rig claim').toBe(0);
    });

    it('an evaluation refusal is cached (deterministic per content); a DRAW failure is NOT (transient rig state)', async () => {
        // Definition-level refusal → cached.
        const broken = makeWindowFamily({ glassExpression: 'Width - * 2' });
        const r1 = await getComponentThumbnail({ family: broken, typeId: TYPE_STD });
        expect(!r1.ok && r1.reason).toBe('resolver-failed');
        const drawsSoFar = drawnKeys.length;
        const r2 = await getComponentThumbnail({ family: broken, typeId: TYPE_STD });
        expect(r2).toEqual(r1);
        expect(drawnKeys.length).toBe(drawsSoFar);

        // Draw-level failure → reported, NOT cached: the next attempt succeeds.
        const good = makeWindowFamily();
        nextResult = 'no-webgl';
        const f = await getComponentThumbnail({ family: good, typeId: TYPE_STD });
        expect(!f.ok && f.reason).toBe('no-webgl');
        nextResult = 'ok';
        const s = await getComponentThumbnail({ family: good, typeId: TYPE_STD });
        expect(s.ok, 'a driver hiccup must not freeze into "this definition has no preview"').toBe(true);
    });
});

describe('§COMPONENT-PREVIEW — both production mounts are WIRED (source-level, and labelled as such)', () => {
    // These cannot tell you the surfaces WORK — the behavioural halves are the
    // widget arms above and `componentPreviewLiveSurfaces.test.ts` (real
    // catalogue, real workspace, real browser panel). They pin that the wiring
    // EXISTS in the two production files, which is the
    // [[authored-but-unwired-is-the-bottleneck]] guard.
    const wsSrc = readFileSync(WORKSPACE, 'utf8');
    const brSrc = readFileSync(BROWSER, 'utf8');

    it('the U3 workspace mounts the preview into a PERSISTENT host, refreshes it every render, and disposes it on close', () => {
        expect(wsSrc).toContain("from '../component-preview'");
        expect(wsSrc).toContain('mountComponentPreview(previewHost');
        expect(wsSrc).toContain('data-cdw-preview-host');
        expect(wsSrc).toMatch(/refreshPreview\(\);\s*\n\s*\}/);
        expect(wsSrc).toContain('previewHandle?.dispose()');
    });

    it('the U1 browser card carries the thumbnail box and draws through the SHARED rig with a panel-lifetime hold', () => {
        expect(brSrc).toContain("from '../component-preview/index.js'");
        expect(brSrc).toContain('getComponentThumbnail');
        expect(brSrc).toContain('data-component-browser-thumb');
        expect(brSrc).toContain('holdComponentThumbnailRig()');
        expect(brSrc, 'the hold is released on close').toContain('this.rigRelease?.()');
    });
});
