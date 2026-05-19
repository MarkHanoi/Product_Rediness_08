// packages/renderer-three/__tests__/depth-buffer.test.ts
//
// CI gate for C12 §2 — Logarithmic depth buffer (Phase 0 Task 0.2).
//
// CONTRACT (C12 §2):
//   "The Three.js renderer MUST use a logarithmic depth buffer when any loaded
//    model spans more than 500 m in any axis."
//   C12 §2 also permits unconditional activation (preferred).
//
// WHY THIS FILE EXISTS:
//   WebGLRendererAdapter previously did NOT set logarithmicDepthBuffer, causing
//   visible Z-fighting on infrastructure-scale BIM projects (rail, road, campus).
//   This gate ensures the option is always present in the constructor call and
//   cannot silently regress.
//
// TEST ENVIRONMENT:
//   Vitest runs in Node (no real GPU).  THREE.WebGLRenderer is mocked to capture
//   constructor arguments without requiring a live WebGL context.
//   window.devicePixelRatio is stubbed because the adapter reads it at init time.
//
// 3 test cases cover the acceptance criteria stated in the plan document.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Type alias for captured constructor options ────────────────────────────────
interface RendererCtorOptions {
    canvas?:                HTMLCanvasElement;
    antialias?:             boolean;
    alpha?:                 boolean;
    preserveDrawingBuffer?: boolean;
    powerPreference?:       string;
    logarithmicDepthBuffer?: boolean;
    [key: string]: unknown;
}

// ── Capture array reset between tests ─────────────────────────────────────────
const capturedCtorCalls: RendererCtorOptions[] = [];

// ── THREE mock ────────────────────────────────────────────────────────────────
// Intercepts `new THREE.WebGLRenderer(options)` and records the options object.
// All THREE constants used by the adapter post-construction are provided as stubs.
vi.mock('three', () => ({
    WebGLRenderer: vi.fn().mockImplementation((opts: RendererCtorOptions) => {
        capturedCtorCalls.push({ ...opts });
        return {
            setPixelRatio:       vi.fn(),
            shadowMap:           { enabled: false, type: null },
            outputColorSpace:    null,
            toneMapping:         null,
            toneMappingExposure: null,
        };
    }),
    // THREE constants referenced by WebGLRendererAdapter post-construction:
    PCFShadowMap:          'PCFShadowMap',
    SRGBColorSpace:        'SRGBColorSpace',
    ACESFilmicToneMapping: 'ACESFilmicToneMapping',
}));

// ── contextLossHandlers mock ───────────────────────────────────────────────────
// setupContextLossHandlers wires DOM event listeners on the canvas/renderer.
// We stub it so the adapter constructor completes without DOM side-effects.
vi.mock('../src/contextLossHandlers.js', () => ({
    setupContextLossHandlers: vi.fn().mockReturnValue(() => { /* no-op teardown */ }),
}));

// Deferred import — must come AFTER vi.mock() so mocks are in place when the
// module is first evaluated.
const { WebGLRendererAdapter } = await import('../src/adapters/WebGLRendererAdapter.js');

// ── Test suite ────────────────────────────────────────────────────────────────

describe('C12 §2 — Logarithmic depth buffer (Phase 0 Task 0.2)', () => {
    let restoreWindow: () => void;

    beforeEach(() => {
        // Reset the capture array before every test.
        capturedCtorCalls.length = 0;

        // Stub window.devicePixelRatio — the adapter reads it during construction
        // (`setPixelRatio(Math.min(window.devicePixelRatio, dprCap))`).
        // In Node there is no `window`; we provide a minimal shim.
        const previousWindow = (global as Record<string, unknown>).window;
        (global as Record<string, unknown>).window = { devicePixelRatio: 1 };
        restoreWindow = () => {
            (global as Record<string, unknown>).window = previousWindow;
        };
    });

    afterEach(() => {
        restoreWindow();
    });

    it('T01 — WebGLRenderer is constructed with logarithmicDepthBuffer: true', () => {
        // Arrange: minimal canvas stub (no real GPU context needed).
        const canvas = {} as HTMLCanvasElement;

        // Act: construct the adapter (triggers the THREE.WebGLRenderer ctor mock).
        new WebGLRendererAdapter(canvas);

        // Assert: exactly one constructor call, with the required option.
        expect(capturedCtorCalls).toHaveLength(1);
        expect(capturedCtorCalls[0]).toMatchObject({
            logarithmicDepthBuffer: true,
        });
    });

    it('T02 — logarithmicDepthBuffer remains true regardless of caller-supplied options', () => {
        // C12 §2 permits unconditional activation — it must not be overridable by
        // callers passing their own options to WebGLRendererAdapterOptions.
        const canvas = {} as HTMLCanvasElement;

        new WebGLRendererAdapter(canvas, {
            antialias:       false,
            powerPreference: 'low-power',
        });

        expect(capturedCtorCalls[0]).toHaveProperty('logarithmicDepthBuffer', true);
    });

    it('T03 — adapter type discriminant is "webgl2" (correct RendererHandle identity)', () => {
        // Belt-and-suspenders: verify the adapter self-identifies as the WebGL 2 backend.
        const canvas = {} as HTMLCanvasElement;
        const adapter = new WebGLRendererAdapter(canvas);
        expect(adapter.type).toBe('webgl2');
    });
});
