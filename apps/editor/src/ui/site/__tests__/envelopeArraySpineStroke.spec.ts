// §ARRAY-ALONG-PATH — the SPINE half of the one stroke driver (ADR-0386 D6).
//
// ⭐ WHAT THIS SUITE IS FOR, AND WHY IT LIVES BESIDE `siteEnvelopeDrawArming.spec.ts` RATHER THAN
// INSIDE IT. The lane's whole architectural claim is *"the spine reuses the perimeter's stroke; the
// only thing that differs is the finish target"*. That claim is FALSIFIABLE, and these cases are
// what falsify it: every one of them drives the SAME registry, the SAME `BoundaryPathAuthor` and
// the SAME sink the perimeter uses, and asserts on the two places the behaviour is allowed to
// diverge (the minimum vertex count and which slot receives the result). A second stroke machine
// would pass none of these without being wired in separately — which is precisely the outcome
// [[same-rule-two-implementations]] warns about.
//
// ⛔ AND THE BACKWARD-COMPATIBILITY LEG IS NOT DECORATION. `armEnvelopeDraw()` with no argument
// must behave EXACTLY as it did before this lane, because every existing caller passes nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';
import type {
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    EnvelopeDrawSurfaceId,
    SceneXZPoint,
} from '../envelopeDrawSurface';
import {
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    disarmEnvelopeDraw,
    getEnvelopeDrawStatus,
    isEnvelopeDrawIntent,
    envelopeDrawBarModesFor,
    envelopeDrawEscHintFor,
    ENVELOPE_DRAW_BAR_MODES,
    registerEnvelopeDrawSurface,
    resolveEnvelopeDrawIntent,
    setEnvelopeDrawMode,
} from '../siteEnvelopeDrawArming';
import {
    __resetDrawnEnvelopeFootprintForTests,
    getDrawnEnvelopeFootprint,
} from '../drawnEnvelopeFootprintState';
import {
    __resetDrawnArrayPathForTests,
    arrayPathLengthM,
    getDrawnArrayPath,
} from '../envelopeArrayPathState';

/** A fake of the PORT that also records the `closed` flag the settled channel was called with. */
class FakeSurface implements EnvelopeDrawSurface {
    sink: EnvelopeDrawSink | null = null;
    previews: { committed: ArcVertex2D[]; tail: ArcVertex2D[]; closeRing: boolean }[] = [];
    settled: { ring: SceneXZPoint[]; closed: boolean }[] = [];
    constructor(readonly surfaceId: EnvelopeDrawSurfaceId) {}
    groundPointFromPointer(x: number, z: number): SceneXZPoint | null { return { x, z }; }
    drawPreview(committed: readonly ArcVertex2D[], tail: readonly ArcVertex2D[], closeRing: boolean): void {
        this.previews.push({ committed: [...committed], tail: [...tail], closeRing });
    }
    clearPreview(): void { /* recorded by the driver's own specs */ }
    drawSettledRing(ring: readonly SceneXZPoint[], closed = true): void {
        this.settled.push({ ring: ring.map((p) => ({ ...p })), closed });
    }
    clearSettledRing(): void { this.settled.length = 0; }
    arm(sink: EnvelopeDrawSink): boolean { this.sink = sink; return true; }
    disarm(): void { this.sink = null; }
}

let surface: FakeSurface;

beforeEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
    __resetDrawnArrayPathForTests();
    surface = new FakeSurface('site-3d');
    registerEnvelopeDrawSurface(surface);
});
afterEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
    __resetDrawnArrayPathForTests();
});

const click = (x: number, z: number): void => { surface.sink!.onPoint({ x, z }); };
const finish = (): void => { surface.sink!.onFinish(); };

describe('§ARRAY-ALONG-PATH D6 — the intent is an argument, and it defaults to today', () => {
    it('arms a PERIMETER when nothing is passed, exactly as before this lane', () => {
        expect(armEnvelopeDraw().ok).toBe(true);
        expect(resolveEnvelopeDrawIntent()).toBe('perimeter');
        expect(getEnvelopeDrawStatus().intent).toBe('perimeter');
        click(0, 0); click(10, 0); click(10, 10);
        finish();
        expect(getDrawnEnvelopeFootprint()?.ring).toHaveLength(3);
        // ⛔ And the spine slot is untouched — the two sinks never cross.
        expect(getDrawnArrayPath()).toBeNull();
    });

    it('arms a SPINE when asked, and writes the spine slot instead', () => {
        expect(armEnvelopeDraw('array-path').ok).toBe(true);
        expect(getEnvelopeDrawStatus().intent).toBe('array-path');
        click(0, 0); click(30, 0); click(30, 40);
        finish();
        const spine = getDrawnArrayPath();
        expect(spine?.path).toEqual([{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40 }]);
        expect(spine?.lengthM).toBeCloseTo(70, 9);
        expect(spine?.surfaceId).toBe('site-3d');
        // ⛔ And the perimeter roster is untouched.
        expect(getDrawnEnvelopeFootprint()).toBeNull();
    });

    it('finishes a spine at TWO points, where a perimeter would refuse', () => {
        armEnvelopeDraw('array-path');
        click(0, 0); click(50, 0);
        finish();
        expect(getDrawnArrayPath()?.path).toHaveLength(2);
        expect(getDrawnArrayPath()?.lengthM).toBeCloseTo(50, 9);
    });

    it('refuses a one-point spine, and says how many were placed', () => {
        armEnvelopeDraw('array-path');
        click(7, 7);
        finish();
        expect(getDrawnArrayPath()).toBeNull();
        expect(getEnvelopeDrawStatus().refusal).toContain('at least 2 points');
        expect(getEnvelopeDrawStatus().refusal).toContain('1 placed');
    });

    it('⛔ resets the intent on every exit, so the NEXT arm is a perimeter again', () => {
        armEnvelopeDraw('array-path');
        click(0, 0); click(10, 0);
        finish();
        expect(resolveEnvelopeDrawIntent()).toBe('perimeter');
        armEnvelopeDraw();
        click(0, 0); click(10, 0); click(10, 10);
        finish();
        expect(getDrawnEnvelopeFootprint()?.ring).toHaveLength(3);
    });

    it('resets the intent when the gesture is cancelled or disarmed', () => {
        armEnvelopeDraw('array-path');
        click(0, 0);
        surface.sink!.onCancel();
        expect(resolveEnvelopeDrawIntent()).toBe('perimeter');
        expect(getDrawnArrayPath()).toBeNull();

        armEnvelopeDraw('array-path');
        disarmEnvelopeDraw();
        expect(resolveEnvelopeDrawIntent()).toBe('perimeter');
    });

    it('classifies only the two named intents', () => {
        expect(isEnvelopeDrawIntent('perimeter')).toBe(true);
        expect(isEnvelopeDrawIntent('array-path')).toBe(true);
        expect(isEnvelopeDrawIntent('spine')).toBe(false);
        armEnvelopeDraw('nonsense' as unknown as 'perimeter');
        expect(resolveEnvelopeDrawIntent()).toBe('perimeter');
    });
});

describe('§ARRAY-ALONG-PATH D6 — a spine is never drawn as a ring', () => {
    it('never asks a surface to close the PREVIEW, however many points are placed', () => {
        armEnvelopeDraw('array-path');
        click(0, 0); click(10, 0); click(20, 0); click(30, 10);
        expect(surface.previews.length).toBeGreaterThan(0);
        expect(surface.previews.every((p) => p.closeRing === false)).toBe(true);
    });

    it('DOES close the preview for a perimeter — the control leg', () => {
        armEnvelopeDraw();
        click(0, 0); click(10, 0); click(20, 0);
        expect(surface.previews.some((p) => p.closeRing === true)).toBe(true);
    });

    it('paints the finished spine OPEN, and the finished perimeter CLOSED', () => {
        armEnvelopeDraw('array-path');
        click(0, 0); click(40, 0);
        finish();
        expect(surface.settled).toHaveLength(1);
        expect(surface.settled[0]!.closed).toBe(false);
        expect(surface.settled[0]!.ring).toHaveLength(2);

        armEnvelopeDraw();
        click(0, 0); click(10, 0); click(10, 10);
        finish();
        expect(surface.settled).toHaveLength(1);   // the re-arm cleared the spine's
        expect(surface.settled[0]!.closed).toBe(true);
    });

    it('keeps a spine that returns to its own start, where a perimeter would pop the vertex', () => {
        // ⛔ THE RING RULE IS NOT APPLIED TO A SPINE. A loop road drawn back to its origin must
        // keep that last vertex, or the array stops one spacing short of where the user drew.
        armEnvelopeDraw('array-path');
        click(0, 0); click(30, 0); click(30, 30); click(0, 0);
        finish();
        expect(getDrawnArrayPath()?.path).toHaveLength(4);
        // 30 + 30 + hypot(30,30) — the diagonal home leg is part of the run, which is the point.
        expect(getDrawnArrayPath()?.lengthM).toBeCloseTo(60 + Math.hypot(30, 30), 9);
    });
});

describe('§ARRAY-ALONG-PATH D6 — the closed modes are refused BY NAME, never coerced', () => {
    for (const mode of ['rectangular', 'circular', 'elliptical'] as const) {
        it(`refuses ${mode} on a spine and names the three that work`, () => {
            setEnvelopeDrawMode(mode);
            armEnvelopeDraw('array-path');
            click(0, 0);
            expect(getDrawnArrayPath()).toBeNull();
            const why = getEnvelopeDrawStatus().refusal ?? '';
            expect(why).toContain('CLOSED shape');
            expect(why).toContain('Linear, Orthogonal or Curved');
            // ⛔ AND THE MODE IS UNCHANGED — a silent switch to 'linear' is the defect this avoids.
            expect(getEnvelopeDrawStatus().mode).toBe(mode);
        });
    }

    it('still serves the closed modes for a PERIMETER — the control leg', () => {
        setEnvelopeDrawMode('rectangular');
        armEnvelopeDraw();
        click(0, 0);
        click(20, 30);
        expect(getDrawnEnvelopeFootprint()?.ring.length).toBeGreaterThanOrEqual(4);
    });
});

describe('§ARRAY-ALONG-PATH D6 — the strip follows the stroke', () => {
    it('greys the three CLOSED shapes for a spine, present and with a reason', () => {
        const bar = envelopeDrawBarModesFor('array-path');
        const closed = bar.filter((m) => ['rectangular', 'circular', 'elliptical'].includes(m.id));
        expect(closed, 'all three are still RENDERED — omitting them would read as a smaller tool')
            .toHaveLength(3);
        for (const m of closed) {
            expect(m.unavailable, `${m.id} must say WHY it cannot be used here`).toBeTruthy();
            expect(m.unavailable).toContain('Linear, Orthogonal or Curved');
        }
        // …and the three PATH modes stay live, which is the founder's "all the wall modes".
        for (const id of ['linear', 'ortho', 'curved']) {
            expect(bar.find((m) => m.id === id)?.unavailable,
                `${id} must remain selectable on a spine`).toBeUndefined();
        }
    });

    it('leaves the PERIMETER strip exactly as it was — the control leg', () => {
        expect(envelopeDrawBarModesFor('perimeter')).toBe(ENVELOPE_DRAW_BAR_MODES);
    });

    it('⛔ derives the spine strip from the perimeter one, so a new pill cannot go missing', () => {
        expect(envelopeDrawBarModesFor('array-path').map((m) => m.id))
            .toEqual(ENVELOPE_DRAW_BAR_MODES.map((m) => m.id));
    });

    it('says how each stroke finishes — they do not finish the same way', () => {
        expect(envelopeDrawEscHintFor('perimeter')).toContain('closes');
        expect(envelopeDrawEscHintFor('array-path')).toContain('finishes the line');
    });
});

describe('§ARRAY-ALONG-PATH D6 — ⭐ SCRAMBLE CONTROL (L-586)', () => {
    it('stores the clicks it was actually given, not a shape of its own', () => {
        armEnvelopeDraw('array-path');
        click(0, 0); click(12, 0); click(12, 9);
        finish();
        const a = getDrawnArrayPath()!;

        __resetDrawnArrayPathForTests();
        armEnvelopeDraw('array-path');
        click(0, 0); click(3, 0); click(3, 4);
        finish();
        const b = getDrawnArrayPath()!;

        expect(a.path).not.toEqual(b.path);
        expect(a.lengthM).toBeCloseTo(21, 9);
        expect(b.lengthM).toBeCloseTo(7, 9);
        // …and the length the slot stored is the one the SHARED producer computes for that path.
        expect(a.lengthM).toBeCloseTo(arrayPathLengthM(a.path), 9);
        expect(b.lengthM).toBeCloseTo(arrayPathLengthM(b.path), 9);
    });

    it('collapses a double-delivered final click without shortening the run', () => {
        // Both renderers deliver the closing click as a corner FIRST and the finish SECOND.
        armEnvelopeDraw('array-path');
        click(0, 0); click(25, 0); click(25, 0);
        finish();
        expect(getDrawnArrayPath()?.path).toHaveLength(2);
        expect(getDrawnArrayPath()?.lengthM).toBeCloseTo(25, 9);
    });
});
