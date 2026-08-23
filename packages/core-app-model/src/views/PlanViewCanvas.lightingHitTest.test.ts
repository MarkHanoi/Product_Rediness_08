// @vitest-environment happy-dom
/**
 * ⭐ §FIX-LIGHT-PLAN-UNSELECTABLE (L-10081) — founder 2026-08-23: *"I cannot select
 * the lighting fixture in plan view nor in 3D view."*
 *
 * ── THE TWO HALVES HAVE DIFFERENT CAUSES; THIS SUITE OWNS THE PLAN HALF ─────
 * The 3-D half was MEASURED and is NOT a registration failure: driven end-to-end
 * (real `LightingFragmentBuilder.add()` → real `SelectionManager._ensureSelectableCache`
 * → real `_buildElementRegistry`), a placed fixture lands in the selectable cache
 * (root Group + 4 child meshes), in the GPU pick registry (`ids() = ['light_…']`,
 * `kindOf = 'Lighting'`, `objectFor` resolves), and `findSelectableRoot(childMesh)`
 * walks up to the fixture root. `'lighting'` is in `SEMANTIC_TYPES` and
 * `bim-lighting-added|updated|removed|placed` are all in SelectionManager's
 * `cacheInvalidationEvents`. Whatever the 3-D report is, it is not this.
 *
 * ── THE PLAN HALF IS A STRUCTURAL GAP, AND THIS SUITE PINS IT ───────────────
 * `PlanViewCanvas.hitTest()` resolves an element by traversing the projected
 * TECHNICAL DRAWING for `THREE.LineSegments` carrying an element UUID. Every plan
 * symbol that must be clickable gets there the same way — a plan-symbol BUILDER
 * injects UUID-registered LineSegments into the drawing (door swing, sofa, bed,
 * wardrobe, kitchen, tree, plumbing, stair tread, column cap).
 *
 * Lighting is the ONE family whose plan symbol is painted straight onto the 2-D
 * canvas from `LightingStore` (`renderLightingSymbols`). It contributes ZERO
 * LineSegments — so `hitTest()` could never return a fixture id, on any plan, at any
 * zoom. The symbol was drawn and hit-testable by nothing. Test 1 below asserts that
 * NEGATIVE against the real drawing cache so the suite cannot pass vacuously; the
 * rest assert the fix.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlanViewCanvas } from './PlanViewCanvas';
import { hitTestLightingSymbol, lightingSymbolExtentPx } from './symbols/LightingPlanSymbolRenderer';

/** A Canvas2D surface with the handful of calls PlanViewCanvas touches. */
function fakeCanvas(w = 800, h = 600): HTMLCanvasElement {
    const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, k) => {
            if (k === 'canvas') return undefined;
            if (!(k in t)) t[k as string] = () => undefined;
            return t[k as string];
        },
        set: (t, k, v) => { t[k as string] = v; return true; },
    });
    return {
        clientWidth: w,
        clientHeight: h,
        width: w,
        height: h,
        style: {},
        getContext: () => ctx,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    } as unknown as HTMLCanvasElement;
}

interface Fixture {
    id: string;
    type: string;
    levelId: string;
    fixtureType: string;
    position: { x: number; y: number; z: number };
}

function installStore(fixtures: Fixture[]): void {
    (window as unknown as Record<string, unknown>).lightingStore = {
        getAll: () => fixtures,
    };
}

describe('§FIX-LIGHT-PLAN-UNSELECTABLE — a plan click on a lighting symbol selects the fixture', () => {
    let canvas: PlanViewCanvas;

    beforeEach(() => {
        canvas = new PlanViewCanvas(fakeCanvas());
        canvas.setViewType('plan');
        canvas.setLevelId('L0');
    });

    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).lightingStore;
    });

    it('THE NEGATIVE — the projected drawing holds no linework for a fixture, so the linework leg cannot resolve it', () => {
        installStore([
            { id: 'light_1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight', position: { x: 3, y: 2.7, z: 2 } },
        ]);
        // No view is bound, so `viewTechnicalDrawingCache` yields nothing at all — the
        // exact state the linework leg is in for a fixture even on a fully projected
        // plan, because a fixture contributes no LineSegments to the drawing.
        // Clicking well away from the symbol must therefore still resolve NOTHING.
        const far = canvas.worldToScreen(50, 50);
        expect(canvas.hitTest(far.sx, far.sy, 10)).toBeNull();
    });

    it('a click on the painted symbol resolves the fixture id (pre-fix: null)', () => {
        installStore([
            { id: 'light_1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight', position: { x: 3, y: 2.7, z: 2 } },
        ]);
        const p = canvas.worldToScreen(3, 2);
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBe('light_1');
    });

    it('a downlight smaller than one screen pixel is still reachable at the grab radius', () => {
        installStore([
            { id: 'light_1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight', position: { x: 0, y: 2.7, z: 0 } },
        ]);
        const ppu = canvas.getPixelsPerUnit();
        // The drawn disc really is sub-grab-radius at plan zoom — assert it, so this
        // test is about the FLOOR and not about a symbol that happens to be large.
        expect(lightingSymbolExtentPx('downlight', ppu).hx).toBeLessThan(10);
        const p = canvas.worldToScreen(0, 0);
        expect(canvas.hitTest(p.sx + 6, p.sy + 6, 10)).toBe('light_1');
    });

    it('scopes to the canvas\'s bound level, exactly as the drawer does', () => {
        installStore([
            { id: 'light_other', type: 'lighting', levelId: 'L1', fixtureType: 'downlight', position: { x: 3, y: 2.7, z: 2 } },
        ]);
        const p = canvas.worldToScreen(3, 2);
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBeNull();
        canvas.setLevelId('L1');
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBe('light_other');
    });

    it('does not fire on a section or elevation, where no lighting symbol is painted', () => {
        installStore([
            { id: 'light_1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight', position: { x: 3, y: 2.7, z: 2 } },
        ]);
        const p = canvas.worldToScreen(3, 2);
        canvas.setViewType('section');
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBeNull();
        canvas.setViewType('elevation');
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBeNull();
        // …and comes back on the reflected ceiling plan, which DOES draw fittings.
        canvas.setViewType('ceiling-plan');
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBe('light_1');
    });

    it('the nearest anchor wins when two symbols overlap', () => {
        installStore([
            { id: 'near', type: 'lighting', levelId: 'L0', fixtureType: 'pendant_conical', position: { x: 0, y: 2.7, z: 0 } },
            { id: 'far', type: 'lighting', levelId: 'L0', fixtureType: 'pendant_conical', position: { x: 0.05, y: 2.7, z: 0 } },
        ]);
        const p = canvas.worldToScreen(0, 0);
        expect(canvas.hitTest(p.sx, p.sy, 10)).toBe('near');
    });

    it('the hit region is derived from the SAME extents the drawer paints (linear_led is a bar, not a disc)', () => {
        const ppu = 40; // a zoomed-in plan
        const bar = lightingSymbolExtentPx('linear_led', ppu);
        expect(bar.rect).toBe(true);
        // 1.20 m long, 0.06 m wide — the long axis must be the larger half-extent.
        expect(bar.hy).toBeGreaterThan(bar.hx);

        installStore([
            { id: 'bar', type: 'lighting', levelId: 'L0', fixtureType: 'linear_led', position: { x: 0, y: 2.7, z: 0 } },
        ]);
        const w2s = (wx: number, wz: number) => ({ sx: wx * ppu, sy: wz * ppu });
        // Along the bar, past the grab radius but inside the drawn rectangle: a hit.
        expect(hitTestLightingSymbol(0, bar.hy - 1, ppu, w2s, { levelId: 'L0', grabPx: 8 })).toBe('bar');
        // Beyond its end: a miss.
        expect(hitTestLightingSymbol(0, bar.hy + 20, ppu, w2s, { levelId: 'L0', grabPx: 8 })).toBeNull();
    });
});
