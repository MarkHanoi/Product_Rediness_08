/**
 * §SECTION-3D-CAPABILITY (L-1760..L-1762) — the 3-D section availability verdict.
 *
 * These cases pin the two facts the audit MEASURED against three@0.183.2, so a
 * future refactor cannot silently re-open the no-op:
 *
 *   • A genuine THREE.WebGLRenderer (the 'webgl-only' backend, i.e. Phase 5
 *     aborted, or the 'webgl-classic' live swap) exposes `localClippingEnabled`
 *     and `clippingPlanes` and DOES honour a global clip set.
 *   • A WebGPURenderer — which `createRenderer()` returns for BOTH the 'webgpu'
 *     and 'webgl-fallback' backends while TYPING it as THREE.WebGLRenderer —
 *     has neither property. `three/src/renderers/common/Renderer.js` carries no
 *     clipping API and never reads `material.clippingPlanes`.
 *
 * ⚠ The renderer stand-ins below are deliberately MINIMAL and are asserted only
 * on the property SHAPE that three itself keys on. They are not stand-ins for a
 * GPU: no test in this file claims a cut is visible on screen
 * ([[fake-more-capable-than-real]] — a fake built from the header cannot
 * falsify the header). What they establish is the VERDICT, which is what the
 * button renders from.
 */

import { describe, it, expect } from 'vitest';
import {
    resolveSectionClipCapability,
    type SectionClipProbe,
} from '../src/engine/inspect/SectionClipCapabilityResolver.js';

/** Shape-accurate stand-in for a genuine THREE.WebGLRenderer. */
const webglRenderer = () => ({ localClippingEnabled: false, clippingPlanes: [] as unknown[] });

/**
 * Shape-accurate stand-in for a WebGPURenderer: three r183's common Renderer
 * base declares NEITHER clipping property. Both real Phase-5 backends land here.
 */
const webgpuRenderer = () => ({ isWebGPURenderer: true, render: () => {} });

describe('§SECTION-3D-CAPABILITY — resolveSectionClipCapability', () => {
    it('is AVAILABLE via global clip planes on a genuine WebGLRenderer', () => {
        const cap = resolveSectionClipCapability({
            liveRenderer: webglRenderer(),
            backend: 'webgl-only',
        });
        expect(cap.available).toBe(true);
        expect(cap.mechanism).toBe('renderer-global-planes');
    });

    it('is UNAVAILABLE on a WebGPURenderer — the object has no clipping API', () => {
        const cap = resolveSectionClipCapability({
            liveRenderer: webgpuRenderer(),
            backend: 'webgpu',
        });
        expect(cap.available).toBe(false);
        expect(cap.mechanism).toBe('none');
    });

    it("treats 'webgl-fallback' as UNAVAILABLE — the NAME says WebGL, the OBJECT is WebGPU", () => {
        // This is the case a backend-name test gets wrong, and the reason the
        // resolver probes the object instead of comparing strings.
        const cap = resolveSectionClipCapability({
            liveRenderer: webgpuRenderer(),
            backend: 'webgl-fallback',
        });
        expect(cap.available).toBe(false);
    });

    it('reports NOT-READY distinctly from NOT-SUPPORTED when no renderer exists yet', () => {
        const notReady = resolveSectionClipCapability({ liveRenderer: null, backend: null });
        const notSupported = resolveSectionClipCapability({
            liveRenderer: webgpuRenderer(),
            backend: 'webgpu',
        });
        expect(notReady.available).toBe(false);
        expect(notSupported.available).toBe(false);
        // C84 EI-1b — two different failures must not render as the same value.
        expect(notReady.reason).not.toBe(notSupported.reason);
        expect(notReady.reason).toMatch(/starting up/i);
    });

    it('names the remedy the founder can actually act on (the GPU control)', () => {
        const cap = resolveSectionClipCapability({
            liveRenderer: webgpuRenderer(),
            backend: 'webgpu',
        });
        expect(cap.reason).toMatch(/WebGL/);
        expect(cap.reason).toMatch(/GPU/);
    });

    it('surfaces the ACTIVE BACKEND NAME in the reason, from the app authority', () => {
        const cap = resolveSectionClipCapability({
            liveRenderer: webgpuRenderer(),
            backend: 'webgl-fallback',
        });
        expect(cap.reason).toContain('webgl-fallback');
    });

    it('carries a reason IFF unavailable (C06 §13.5 — no tombstone, no silent dead button)', () => {
        const probes: SectionClipProbe[] = [
            { liveRenderer: webglRenderer(), backend: 'webgl-only' },
            { liveRenderer: webgpuRenderer(), backend: 'webgpu' },
            { liveRenderer: null, backend: null },
            { liveRenderer: undefined, backend: undefined },
        ];
        for (const p of probes) {
            const cap = resolveSectionClipCapability(p);
            expect(cap.reason === null).toBe(cap.available);
            if (!cap.available) expect(cap.mechanism).toBe('none');
        }
    });

    it('fails CLOSED when the probe throws — never offers a live button it cannot back', () => {
        const hostile = {
            get localClippingEnabled(): boolean {
                throw new Error('renderer exploded');
            },
        };
        const cap = resolveSectionClipCapability({ liveRenderer: hostile, backend: 'webgpu' });
        expect(cap.available).toBe(false);
        expect(cap.reason).toBeTruthy();
    });
});
