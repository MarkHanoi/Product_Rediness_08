/**
 * @vitest-environment happy-dom
 *
 * §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — PROVE THE TAG REACHES THE CANVAS.
 *
 * "Verify at the outcome, not at the seam." A tag executor that creates perfect
 * AnnotationElements proves nothing if the renderer draws them in the wrong place —
 * and that is EXACTLY what was happening: every tag renderer projected its model
 * point as `w2s(pt.x, pt.z)` — the PLAN mapping, hardcoded — while `_renderLinearDim`
 * projected through `_ptH`/`_ptV`. In a plan the two agree by coincidence (H = x,
 * V = z). In an ELEVATION they do not: a tag anchored at a door's real world position
 * was drawn using its DEPTH as the vertical axis instead of its HEIGHT.
 *
 * So this suite asserts what the CANVAS is asked to draw, not what the executor built.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { annotationStore } from '../../annotations/AnnotationStore.js';
import { makeAnnotationElement } from '../../annotations/AnnotationTypes.js';
import { makePointRef } from '../../annotations/AnnotationReference.js';
import { PlanViewAnnotationRenderer } from '../PlanViewAnnotationRenderer';

/** A Canvas2D stub that records every call, so we can assert on the drawing itself. */
function fakeCtx() {
    const calls: { fn: string; args: unknown[] }[] = [];
    const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); };
    const ctx = {
        calls,
        save: rec('save'), restore: rec('restore'),
        beginPath: rec('beginPath'), closePath: rec('closePath'),
        moveTo: rec('moveTo'), lineTo: rec('lineTo'), arc: rec('arc'),
        fill: rec('fill'), stroke: rec('stroke'), fillText: rec('fillText'),
        strokeRect: rec('strokeRect'), rect: rec('rect'), setLineDash: rec('setLineDash'),
        measureText: (t: string) => ({ width: t.length * 6 }),
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: '', textBaseline: '', globalAlpha: 1,
    };
    return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const VIEW = 'view_elev_front';

/** A door tag on a FRONT elevation: the door is at world (4.5, y, 0); H = x, V = y. */
function addDoorTag(): void {
    annotationStore.add(makeAnnotationElement(
        'annotation_doortag_1',
        'door-tag',
        VIEW,
        [makePointRef({ x: 4.5, y: 1.05, z: 0 } as never)],
        {
            modelPoints: [
                { x: 4.5, y: 1.05, z: 0 },   // anchor — mid-height of the door
                { x: 4.5, y: 2.80, z: 0 },   // tag point — ABOVE the head, in world Y
            ],
            offset: 0,
        },
        { elementId: 'door_1', cachedLabel: 'D1', showLeader: true },
    ));
}

function addWallTag(): void {
    annotationStore.add(makeAnnotationElement(
        'annotation_walltag_1',
        'wall-tag',
        VIEW,
        [makePointRef({ x: 5, y: 1.5, z: 0 } as never)],
        {
            modelPoints: [
                { x: 5, y: 1.5, z: 0 },
                { x: 5, y: 2.1, z: 0 },
            ],
            offset: 0,
        },
        { elementId: 'wall_1', cachedLabel: 'WallA', showLeader: true },
    ));
}

describe('PlanViewAnnotationRenderer — tags project through the ACTIVE VIEW plane', () => {
    beforeEach(() => { annotationStore.clear(); });

    it('ELEVATION: a door tag is drawn at (H = x, V = world Y) — never at (x, z)', () => {
        addDoorTag();
        const renderer = new PlanViewAnnotationRenderer();
        const w2s = vi.fn((h: number, v: number) => ({ sx: h * 10, sy: 500 - v * 10 }));
        const ctx = fakeCtx();

        renderer.render(ctx, VIEW, w2s, { viewType: 'elevation', sectionHAxis: 'x', hSign: 1 });

        const pairs = w2s.mock.calls.map(([h, v]) => `${h},${v}`);
        // The anchor and the tag point, in the view's own (H, V) frame.
        expect(pairs).toContain('4.5,1.05');
        expect(pairs).toContain('4.5,2.8');
        // The PLAN mapping (V = z = 0) must NEVER be used in an elevation.
        expect(pairs).not.toContain('4.5,0');
    });

    it('ELEVATION: hSign is applied — a mirrored elevation does not mirror its tags', () => {
        addDoorTag();
        const renderer = new PlanViewAnnotationRenderer();
        const w2s = vi.fn((h: number, v: number) => ({ sx: h * 10, sy: 500 - v * 10 }));

        renderer.render(fakeCtx(), VIEW, w2s, { viewType: 'elevation', sectionHAxis: 'x', hSign: -1 });

        const pairs = w2s.mock.calls.map(([h, v]) => `${h},${v}`);
        expect(pairs).toContain('-4.5,1.05');
    });

    it('PLAN: the same tag still projects as (x, z) — the fix changes nothing in plan', () => {
        annotationStore.add(makeAnnotationElement(
            'annotation_doortag_2',
            'door-tag',
            VIEW,
            [makePointRef({ x: 4.5, y: 0, z: 0 } as never)],
            { modelPoints: [{ x: 4.5, y: 0, z: 0 }, { x: 4.5, y: 0, z: 1.2 }], offset: 0 },
            { elementId: 'door_1', cachedLabel: 'D1', showLeader: true },
        ));
        const renderer = new PlanViewAnnotationRenderer();
        const w2s = vi.fn((h: number, v: number) => ({ sx: h * 10, sy: v * 10 }));

        renderer.render(fakeCtx(), VIEW, w2s, { viewType: 'plan' });

        const pairs = w2s.mock.calls.map(([h, v]) => `${h},${v}`);
        expect(pairs).toContain('4.5,0');
        expect(pairs).toContain('4.5,1.2');
    });

    it('a WALL TAG is DRAWN — as a diamond with a leader — and not silently dropped', () => {
        addWallTag();
        const renderer = new PlanViewAnnotationRenderer();
        const w2s = (h: number, v: number) => ({ sx: h * 10, sy: 500 - v * 10 });
        const ctx = fakeCtx();

        renderer.render(ctx, VIEW, w2s, { viewType: 'elevation', sectionHAxis: 'x', hSign: 1 });

        // The mark is printed…
        const texts = ctx.calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);
        expect(texts).toContain('WallA');
        // …inside a CLOSED four-sided path (the diamond), not a circle.
        expect(ctx.calls.some((c) => c.fn === 'closePath')).toBe(true);
        expect(ctx.calls.filter((c) => c.fn === 'lineTo').length).toBeGreaterThanOrEqual(3);
    });
});
