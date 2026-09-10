/**
 * @vitest-environment happy-dom
 *
 * §PLAN-CAN-FRAME-WHAT-IT-CAN-PAN-TO (L-13305) — THE PLAN VIEW MUST BE ABLE TO SHOW THE PLOT.
 *
 * FOUNDER, 2026-09-10, on a 3,314,327 m² (331 ha) Delaware parcel:
 *   *"on plan view i don't even see the perimeter of the plot — is it because it is too big?
 *    please even so I shall be able to see it."*
 *
 * ⭐ THE ANSWER TO HIS QUESTION WAS LITERALLY YES, AND THE RING WAS NEVER THE BUG.
 * `PlanViewCanvas._renderSiteContext` paints `site.parcelRing` on every frame, in both render
 * paths, on both panes, BEFORE the `if (!drawing)` early-return — so "no walls yet" was never the
 * explanation either. What was wrong is that the camera could not be widened far enough to contain
 * it: `setFrustum` clamped the frustum half-height to **200 m**, and both wheel handlers clamped to
 * their own hand-copied `200` before pushing through it.
 *
 * THE ARITHMETIC THAT MAKES THIS A DEFECT AND NOT A PREFERENCE (1200 × 700 px pane, aspect 1.71):
 *
 *   | state                          | frustumH | visible world      |
 *   |--------------------------------|----------|--------------------|
 *   | on activate                    |     30 m | ~103 m × 60 m      |
 *   | after `fitToDrawing` (its cap) |     80 m | ~274 m × 160 m     |
 *   | FULLY ZOOMED OUT (old ceiling) |    200 m | ~686 m × 400 m     |
 *   | needed for his plot            | ≥ 1040 m | 1 820 m square     |
 *
 * The plot is 3–9× wider than the widest frame the canvas could produce. No amount of scrolling
 * reached it. [[unsatisfiable-gate-decomposition-is-the-fix]] — the first question to ask of a
 * control that never works is whether it CAN ever work.
 *
 * ⛔ WHAT THESE CASES BIND, AND WHY EACH ONE IS HERE. They assert against `setFrustum` and
 * `fitToSite` — the two functions this lane changed — never against `_renderSiteContext`, which
 * was already correct. A suite that measured the ring's drawing would have stayed green through
 * the entire defect, which is exactly the [[gate-blind-on-the-wrong-axis]] mistake.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    PlanViewCanvas,
    PLAN_CAMTARGET_MAX_ABS_M,
    MAXIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    type PlanSiteContext,
} from '../PlanViewCanvas';
import type * as THREE from '@pryzm/renderer-three/three';

/** The founder's parcel, to the metre: 3,314,327 m² ⇒ a 1 820.5 m square. */
const FOUNDER_PARCEL_AREA_M2 = 3_314_327;
const FOUNDER_PARCEL_SIDE_M = Math.sqrt(FOUNDER_PARCEL_AREA_M2);   // 1 820.53…

/** A NORMAL city plot, so every widening below is checked for collateral damage. */
const CITY_PLOT_SIDE_M = 24;

const v = (x: number, y: number, z: number) => ({ x, y, z }) as unknown as THREE.Vector3;

function squareRing(sideM: number, cx = 0, cz = 0): ReadonlyArray<{ x: number; z: number }> {
    const h = sideM / 2;
    return [
        { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h },
        { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h },
    ];
}

function makeCanvas(site: PlanSiteContext | null): PlanViewCanvas {
    const fake = {
        getContext: () => ({}),
        width: 0, height: 0, clientWidth: 1200, clientHeight: 700,
    } as unknown as HTMLCanvasElement;
    return new PlanViewCanvas(fake, { siteContextProvider: () => site });
}

const siteWith = (ring: ReadonlyArray<{ x: number; z: number }> | null): PlanSiteContext =>
    ({ parcelRing: ring, envelopeRing: null });

describe('§PLAN-CAN-FRAME-WHAT-IT-CAN-PAN-TO — ARM A: the ceiling can contain the land', () => {
    it('⭐ the frustum ceiling is the SAME bound as the pan sanity limit — one number, not two', () => {
        // ⛔ A view that may PAN to ±20 km but may only FRAME 200 m is two bounds disagreeing
        // about one question. Tying them is what makes "it can frame what it can reach" true by
        // construction rather than by a number someone chose and someone else has to maintain.
        expect(MAXIMUM_PLAN_VIEW_CANVAS_FRUSTUM).toBe(PLAN_CAMTARGET_MAX_ABS_M);
    });

    it('⭐ setFrustum ACCEPTS the half-height the founder\'s parcel needs — the old ceiling did not', () => {
        const c = makeCanvas(null);
        // What a 1 820 m square actually requires, with the fit margin the canvas uses.
        const needed = (FOUNDER_PARCEL_SIDE_M * 1.14) / 2;   // ≈ 1 037.7 m
        expect(needed, 'the premise: his plot needs more than the old 200 m ceiling').toBeGreaterThan(200);

        c.setFrustum(needed, v(0, 0, 0));
        expect(
            c.getFrustumH(),
            'the plan camera still cannot be widened to contain a 331 ha parcel',
        ).toBeCloseTo(needed, 3);
    });

    it('⭐ …and the 3.5 km long axis he actually has, not just the square-equivalent', () => {
        const c = makeCanvas(null);
        const needed = (3500 * 1.14) / 2;   // 1 995 m
        c.setFrustum(needed, v(0, 0, 0));
        expect(c.getFrustumH()).toBeCloseTo(needed, 3);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔⛔ SCRAMBLE CONTROL (L-586) — "REMOVE THE CLAMP" MUST NOT PASS
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // The cheapest wrong fix is to delete the `Math.min` outright. Every case above would stay
    // green. These two fail on it, because an UNBOUNDED frustum is how a coordinate-space leak
    // stops looking like a fault and starts looking like a very wide view.
    it('⛔ SCRAMBLE: the ceiling is still a CEILING — an absurd half-height is clamped, not honoured', () => {
        const c = makeCanvas(null);
        c.setFrustum(5_000_000, v(0, 0, 0));
        expect(c.getFrustumH(), 'the clamp was removed rather than raised').toBe(
            MAXIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
        );
        c.setFrustum(Number.POSITIVE_INFINITY, v(0, 0, 0));
        expect(c.getFrustumH()).toBe(MAXIMUM_PLAN_VIEW_CANVAS_FRUSTUM);
    });

    it('⛔ SCRAMBLE: the FLOOR is untouched — this lane widened one end only', () => {
        const c = makeCanvas(null);
        c.setFrustum(0.001, v(0, 0, 0));
        expect(c.getFrustumH()).toBe(2);
    });
});

describe('§PLAN-CAN-FRAME-WHAT-IT-CAN-PAN-TO — ARM B: fitToSite frames the parcel', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

    it('⭐ frames the founder\'s 331 ha parcel — the whole ring fits in the frame it chooses', () => {
        const c = makeCanvas(siteWith(squareRing(FOUNDER_PARCEL_SIDE_M)));
        expect(c.fitToSite(1200, 700)).toBe(true);

        const fH = c.getFrustumH();
        const fW = fH * (1200 / 700);
        // ⭐ THE ASSERTION THAT MATTERS IS CONTAINMENT, NOT A MAGIC NUMBER. A hard-coded expected
        // half-height would pass just as happily with the padding dropped or the aspect inverted.
        expect(fH * 2, 'the ring is taller than the frame').toBeGreaterThanOrEqual(FOUNDER_PARCEL_SIDE_M);
        expect(fW * 2, 'the ring is wider than the frame').toBeGreaterThanOrEqual(FOUNDER_PARCEL_SIDE_M);
        // …and not absurdly loose: the tighter axis is the one that decided the fit.
        expect(Math.min(fH * 2, fW * 2)).toBeLessThan(FOUNDER_PARCEL_SIDE_M * 1.35);
    });

    it('⭐ centres on the parcel, not on the world origin — an off-origin plot is framed too', () => {
        const c = makeCanvas(siteWith(squareRing(FOUNDER_PARCEL_SIDE_M, 4000, -2500)));
        expect(c.fitToSite(1200, 700)).toBe(true);
        expect(c.getCamTarget().x).toBeCloseTo(4000, 3);
        expect(c.getCamTarget().z).toBeCloseTo(-2500, 3);
    });

    it('⛔ a NORMAL city plot is framed tightly — the widening costs small sites nothing', () => {
        // ⛔ THE COLLATERAL-DAMAGE ARM. Raising a ceiling must not make ordinary plots open zoomed
        // out to a kilometre of empty ground. The fit is computed from the RING, so a 24 m plot
        // gets a 24 m frame; the ceiling never enters the arithmetic.
        const c = makeCanvas(siteWith(squareRing(CITY_PLOT_SIDE_M)));
        expect(c.fitToSite(1200, 700)).toBe(true);
        expect(c.getFrustumH(), 'a 24 m plot was framed at site scale').toBeLessThan(30);
        expect(c.getFrustumH()).toBeGreaterThanOrEqual(CITY_PLOT_SIDE_M / 2);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔⛔ SCRAMBLE CONTROLS — the refusals, each a different way to move a camera wrongly
    // ══════════════════════════════════════════════════════════════════════════════════════════
    it('⛔ SCRAMBLE: no ring ⇒ refuses and leaves the camera EXACTLY where it was', () => {
        const c = makeCanvas(siteWith(null));
        c.setFrustum(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM, v(7, 0, -9));
        expect(c.fitToSite(1200, 700)).toBe(false);
        expect(c.getFrustumH()).toBe(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM);
        expect(c.getCamTarget().x).toBe(7);
        expect(c.getCamTarget().z).toBe(-9);
    });

    it('⛔ SCRAMBLE: a degenerate 2-point ring is not a parcel — refused, camera unmoved', () => {
        const c = makeCanvas(siteWith([{ x: 0, z: 0 }, { x: 10, z: 10 }]));
        c.setFrustum(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM, v(0, 0, 0));
        expect(c.fitToSite(1200, 700)).toBe(false);
        expect(c.getFrustumH()).toBe(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM);
    });

    it('⛔ SCRAMBLE: NaN in the ring never reaches the camera', () => {
        const c = makeCanvas(siteWith([
            { x: NaN, z: NaN }, { x: NaN, z: NaN }, { x: NaN, z: NaN },
        ]));
        c.setFrustum(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM, v(0, 0, 0));
        expect(c.fitToSite(1200, 700)).toBe(false);
        expect(Number.isFinite(c.getCamTarget().x)).toBe(true);
        expect(Number.isFinite(c.getFrustumH())).toBe(true);
    });

    it('⛔ SCRAMBLE: a ring outside the ±20 km plausible-site bound refuses the WHOLE fit', () => {
        // ⛔ NOT A HALF-APPLIED FRAME. `setFrustum` REFUSES an implausible target rather than
        // clamping it (L-481), so widening the frustum and then failing to move the target would
        // leave the user zoomed out over the wrong ground with no indication. The fit is atomic.
        const far = PLAN_CAMTARGET_MAX_ABS_M + 5_000;
        const c = makeCanvas(siteWith(squareRing(100, far, far)));
        c.setFrustum(DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM, v(0, 0, 0));
        expect(c.fitToSite(1200, 700)).toBe(false);
        expect(c.getFrustumH(), 'the frustum widened for a fit that never landed').toBe(
            DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
        );
        expect(c.getCamTarget().x).toBe(0);
        expect(warnSpy, 'a refusal the user cannot see is the same as a silent failure')
            .toHaveBeenCalled();
    });
});
