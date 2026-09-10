// @vitest-environment happy-dom
//
// §L-11840 — the site-metric ground heatmap (sun hours / temperature / wind / population /
// daylight VSC) must actually render when real baked terrain (relief) is attached, not just
// COMPUTE. The founder reported an Amsterdam parcel where the console confirmed the sun-hours
// field computed (`smooth texture 512×512 ... from 1980/1980 cell(s)`) but nothing was visible
// in the 3D Site view — read (incorrectly, as a symptom description, not a literal mechanism) as
// "the analysis is under the paths".
//
// ROOT CAUSE (see `CesiumViewport.ts` `paintMetricTexture`, ~line 11850, and the sibling
// §CTX-ABS-SEAT comment at ~line 9539): the relief-attached branch used
// `classificationType: Cesium.ClassificationType.TERRAIN` on the heatmap rectangle — the SAME
// `GroundPrimitive` classification machinery `clampToGround` uses, which this codebase already
// measured (Cesium 1.143, §CTX-ABS-SEAT / L-635) to render NOTHING when
// `globe.depthTestAgainstTerrain === false` — which Forma mode holds unconditionally
// (§CTX-DEPTH-CULL-FIX, so context buildings are never culled under relief). Roads, rail, sea and
// context fill were all migrated off ground-classification onto an ABSOLUTE height seated at the
// settled ground plane; `paintMetricTexture`'s relief branch was the one consumer left on the
// broken path (confirmed: `grep -n ClassificationType CesiumViewport.ts` had exactly one hit,
// this call site, before the fix).
//
// THIS TEST exercises the private `paintMetricTexture` directly (mirrors the established pattern
// in `CesiumViewportFrameNoJump.test.ts`: bind the prototype method to a minimal stub `this`, no
// real Cesium viewer constructed) and asserts the rectangle graphics PRYZM hands to
// `viewer.entities.add`:
//   1. NEVER carry `classificationType` (the broken, invisible-on-relief path) — regardless of
//      whether relief is attached.
//   2. ALWAYS carry an explicit numeric `height` (the fixed, §CTX-ABS-SEAT-mirroring absolute seat).
// This is source-and-assertion-level proof that the entity descriptor PRYZM constructs cannot
// reproduce the reported defect; it is NOT a pixel-level Cesium rendering test — no headless
// Cesium/WebGL harness exists in this repo, and fabricating one to claim more than that would be
// dishonest about what is actually verified here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('cesium', () => ({
    Ion: { defaultAccessToken: '' },
    Rectangle: {
        fromDegrees: (west: number, south: number, east: number, north: number) => ({
            west, south, east, north,
        }),
    },
    ImageMaterialProperty: class {
        readonly image: unknown;
        readonly transparent: boolean;
        constructor(opts: { image: unknown; transparent: boolean }) {
            this.image = opts.image;
            this.transparent = opts.transparent;
        }
    },
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

const proto = CesiumViewport.prototype as unknown as {
    paintMetricTexture: (
        tex: { size: number; radiusM: number; rgba: Uint8ClampedArray; sampleCount: number },
        metric: string,
        origin: { lat: number; lon: number },
        base: number,
        up: number,
    ) => void;
};

interface CapturedEntity {
    readonly name: string;
    readonly rectangle: {
        readonly height?: number;
        readonly classificationType?: unknown;
        readonly material: unknown;
    };
}

function makeStub(reliefAttached: boolean): {
    stub: {
        viewer: unknown;
        siteMetricEntities: unknown[];
        groundReliefState: () => { kind: 'flat' } | { kind: 'ready'; city: string };
        paintMetricTexture: typeof proto.paintMetricTexture;
    };
    captured: CapturedEntity[];
} {
    const captured: CapturedEntity[] = [];
    const viewer = {
        entities: {
            add: (desc: CapturedEntity) => { captured.push(desc); return desc; },
        },
        scene: { requestRender: () => {} },
    };
    const stub = {
        viewer,
        siteMetricEntities: [] as unknown[],
        // The method this whole fix is about: while it returned `true` for relief-attached
        // scenes, the OLD code took the broken classification branch. The fix must ignore this
        // for its render-graphics DECISION (it may still consult it for logging).
        groundReliefState: () => (reliefAttached ? { kind: 'ready' as const, city: 'stub' } : { kind: 'flat' as const }),
    } as unknown as { viewer: unknown; siteMetricEntities: unknown[]; groundReliefState: () => { kind: 'flat' } | { kind: 'ready'; city: string }; paintMetricTexture: typeof proto.paintMetricTexture };
    stub.paintMetricTexture = proto.paintMetricTexture.bind(stub);
    return { stub, captured };
}

const TEX = {
    size: 4,
    radiusM: 240,
    rgba: new Uint8ClampedArray(4 * 4 * 4),
    sampleCount: 16,
};
const ORIGIN = { lat: 52.369642, lon: 4.883635 }; // the founder's Amsterdam parcel (ASD03 E 10155)

describe('§L-11840 paintMetricTexture — the ground heatmap seat, relief attached or not', () => {
    let realGetContext: typeof HTMLCanvasElement.prototype.getContext;

    beforeEach(() => {
        // happy-dom does not implement a real 2D canvas context; stub the minimal surface
        // `paintMetricTexture` touches (`createImageData` + `putImageData`) so the method reaches
        // the `viewer.entities.add` call this test is actually about. This is the ONLY canvas
        // shimming in this file — everything downstream of it is real production code.
        realGetContext = HTMLCanvasElement.prototype.getContext;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
            return {
                createImageData: (w: number, h: number) => ({
                    data: new Uint8ClampedArray(w * h * 4),
                    width: w,
                    height: h,
                }),
                putImageData: () => {},
            };
        };
    });
    afterEach(() => {
        HTMLCanvasElement.prototype.getContext = realGetContext;
        vi.restoreAllMocks();
    });

    it('relief ATTACHED (the Amsterdam case) — seats at an absolute height, never classificationType', () => {
        const { stub, captured } = makeStub(true);
        stub.paintMetricTexture(TEX, 'sunHours', ORIGIN, 12.4, 0.16);
        expect(captured).toHaveLength(1);
        const rect = captured[0]!.rectangle;
        expect(rect.classificationType).toBeUndefined();
        expect(rect.height).toBeCloseTo(12.4 + 0.16, 10);
    });

    it('relief NOT attached (keyless/un-baked path) — identical seat, unchanged from before the fix', () => {
        const { stub, captured } = makeStub(false);
        stub.paintMetricTexture(TEX, 'sunHours', ORIGIN, 12.4, 0.16);
        expect(captured).toHaveLength(1);
        const rect = captured[0]!.rectangle;
        expect(rect.classificationType).toBeUndefined();
        expect(rect.height).toBeCloseTo(12.4 + 0.16, 10);
    });

    it('the two paths produce the SAME graphics shape — no relief-conditional branch left to regress', () => {
        const relief = makeStub(true);
        const flat = makeStub(false);
        relief.stub.paintMetricTexture(TEX, 'temperature', ORIGIN, 5, 0.16);
        flat.stub.paintMetricTexture(TEX, 'temperature', ORIGIN, 5, 0.16);
        expect(relief.captured[0]!.rectangle.height).toEqual(flat.captured[0]!.rectangle.height);
        expect(relief.captured[0]!.rectangle.classificationType).toEqual(
            flat.captured[0]!.rectangle.classificationType,
        );
    });
});
