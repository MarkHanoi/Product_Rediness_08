/**
 * @vitest-environment happy-dom
 *
 * §WALK-POSITION-ON-PLAN — the purple walker, with a heading, on the plan pane.
 *
 * FOUNDER, 2026-09-10:
 *   *"I want a point on plan view about where the user is moving with the camera
 *    — for example in this project I am in ground floor on split view (ONLY IF WE
 *    ARE ON SPLIT VIEW) — I am on the right with my 3D PRYZM view moving in
 *    walking mode — I want to see on the right hand side a point, purple (PRYZM
 *    colour), following along."*
 *
 * ⛔ WHAT THESE ARMS DRIVE. Every case calls `PlanViewCanvas.render(viewDef)` —
 * the method `SplitViewManager._render()` and `PlanViewManager._render()` call on
 * every one of their 30 frames per second — through a RECORDING Canvas2D context,
 * and asserts on what was actually painted. Nothing here calls
 * `_renderWalkPosition` directly. An arm that reached for the private method would
 * stay green if the call site were deleted from `render()`, which is precisely the
 * [[gate-blind-on-the-wrong-axis]] failure: measuring a sibling path and calling
 * it proof.
 *
 * ⭐ SCRAMBLE CONTROL (L-586), run by hand before commit:
 *   • delete `if (isPlanLike) this._renderWalkPosition(ctx)` from the tail of
 *     `render()`      → "paints a purple dot", "heading", "off-level" go RED;
 *   • delete the same call from the no-linework branch
 *                     → "draws before any linework is cached" goes RED;
 *   • make `onLevel` always true
 *                     → "off-level is hollow, not solid" goes RED;
 *   • drop the `isPlanLike` guard
 *                     → "never on a section" goes RED.
 *   Verified: each edit reddens exactly the listed arms and no others.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PlanViewCanvas } from '../PlanViewCanvas';
import { PREVIEW_CSS } from '../../preview/PreviewStyle';
import { publishWalkPose, readWalkPose } from '../../navigation/WalkPoseBeacon';
import type { ViewDefinition } from '../ViewDefinitionTypes';

// ── A recording Canvas2D context ─────────────────────────────────────────────
// Records the ops the marker uses. Everything else is a tolerant no-op so the
// rest of render() runs to completion instead of throwing on the way to the pass
// under test.

interface ArcOp { kind: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; fill: string | null; stroke: string | null; dash: number[]; }

function makeRecordingCtx() {
    const arcs: ArcOp[] = [];
    let pending: Omit<ArcOp, 'fill' | 'stroke'> | null = null;
    let lastMoveTo: { x: number; y: number } | null = null;

    const ctx: Record<string, unknown> = {
        fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
        globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
        imageSmoothingEnabled: true, lineCap: 'butt', lineJoin: 'miter',
        filter: 'none', globalCompositeOperation: 'source-over', miterLimit: 10,
        shadowBlur: 0, shadowColor: '', lineDashOffset: 0,
    };
    let dash: number[] = [];

    const noop = () => { /* tolerated */ };
    Object.assign(ctx, {
        save: noop, restore: noop, setTransform: noop, transform: noop,
        translate: noop, rotate: noop, scale: noop, clip: noop,
        fillRect: noop, strokeRect: noop, clearRect: noop, rect: noop,
        fillText: noop, strokeText: noop, drawImage: noop,
        lineTo: noop, bezierCurveTo: noop, quadraticCurveTo: noop, ellipse: noop,
        closePath: noop, createLinearGradient: () => ({ addColorStop: noop }),
        createPattern: () => null, getLineDash: () => dash,
        measureText: () => ({ width: 10 }),
        setLineDash: (d: number[]) => { dash = Array.isArray(d) ? [...d] : []; },
        moveTo: (x: number, y: number) => { lastMoveTo = { x, y }; },
        beginPath: () => { pending = null; },
        arc: (cx: number, cy: number, r: number, a0: number, a1: number) => {
            pending = { kind: 'arc', cx, cy, r, a0, a1, dash: [...dash] };
        },
        fill: () => {
            if (pending) arcs.push({ ...pending, fill: String(ctx.fillStyle), stroke: null, dash: [...dash] });
        },
        stroke: () => {
            if (pending) arcs.push({ ...pending, fill: null, stroke: String(ctx.strokeStyle), dash: [...dash] });
        },
    });

    return { ctx, arcs, moveTo: () => lastMoveTo };
}

const W = 800;
const H = 600;

function makeCanvas(levelId: string | null, viewType = 'plan') {
    const rec = makeRecordingCtx();
    const fake = {
        getContext: () => rec.ctx,
        width: 0, height: 0, clientWidth: W, clientHeight: H,
    } as unknown as HTMLCanvasElement;

    const pvc = new PlanViewCanvas(fake, {
        gridVisible: false,
        // The app-layer reader is exercised in the sibling suite; here the pane is
        // handed the beacon directly, which is what a split-view pane's provider
        // resolves to once its gate has passed.
        walkPoseProvider: () => readWalkPose(),
    });
    pvc.setViewType(viewType);
    pvc.setLevelId(levelId);
    return { pvc, arcs: rec.arcs };
}

const viewDef = (id: string): ViewDefinition => ({ id } as unknown as ViewDefinition);

/** Every arc painted in PRYZM purple, by fill or by stroke. */
const purple = (arcs: ArcOp[]) => arcs.filter(a =>
    (a.fill ?? '').toLowerCase() === PREVIEW_CSS.PRIMARY
    || (a.stroke ?? '').toLowerCase() === PREVIEW_CSS.PRIMARY
    || (a.fill ?? '').toLowerCase() === PREVIEW_CSS.PRIMARY_FILL);

/** The dot: a small full circle (the cone is a wedge, so its sweep is < 2π). */
const dots = (arcs: ArcOp[]) => purple(arcs).filter(a => Math.abs(a.a1 - a.a0) >= Math.PI * 2 - 1e-6);
/** The heading cone: a purple wedge. */
const cones = (arcs: ArcOp[]) => purple(arcs).filter(a => Math.abs(a.a1 - a.a0) < Math.PI * 2 - 1e-6);

describe('§WALK-POSITION-ON-PLAN', () => {
    beforeEach(() => { publishWalkPose(null); });

    it('paints nothing at all when nobody is walking', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        pvc.render(viewDef('v1'));

        expect(purple(arcs)).toHaveLength(0);
    });

    it('⭐ paints a purple dot at the walker, on the level the plan is showing', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });

        pvc.render(viewDef('v1'));

        const d = dots(arcs);
        expect(d.length).toBeGreaterThan(0);

        // Centre of the pane: worldToScreen(0,0) with camTarget at the origin.
        const marker = d[d.length - 1];
        expect(marker.cx).toBeCloseTo(W / 2, 3);
        expect(marker.cy).toBeCloseTo(H / 2, 3);

        // On-level reads SOLID: the dot is FILLED purple, not merely outlined.
        expect(d.some(a => (a.fill ?? '').toLowerCase() === PREVIEW_CSS.PRIMARY)).toBe(true);
    });

    it('⭐ tracks the walker — the dot moves with the pose, in the right direction', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });
        pvc.render(viewDef('v1'));
        const first = dots(arcs).at(-1)!;

        arcs.length = 0;
        // +X in world is right on a plan; +Z is DOWN the canvas.
        publishWalkPose({ x: 6, y: 1.7, z: 3, dirX: 0, dirZ: -1, levelId: 'L0' });
        pvc.render(viewDef('v1'));
        const second = dots(arcs).at(-1)!;

        expect(second.cx).toBeGreaterThan(first.cx);
        expect(second.cy).toBeGreaterThan(first.cy);
    });

    it('⭐ carries a HEADING — a bare dot cannot say which way he faces', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        // Looking along −Z, which on a plan is UP the canvas.
        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });
        pvc.render(viewDef('v1'));

        const c = cones(arcs);
        expect(c.length).toBeGreaterThan(0);

        // Wedge bisector = the screen heading. −Z ⇒ up ⇒ −π/2 in canvas angles.
        const wedge = c[c.length - 1];
        const bisector = (wedge.a0 + wedge.a1) / 2;
        expect(Math.sin(bisector)).toBeLessThan(-0.9);
        expect(wedge.r).toBeGreaterThan(0);
    });

    it('the heading follows the pose — facing +X points the cone right', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 1, dirZ: 0, levelId: 'L0' });
        pvc.render(viewDef('v1'));

        const wedge = cones(arcs).at(-1)!;
        const bisector = (wedge.a0 + wedge.a1) / 2;
        expect(Math.cos(bisector)).toBeGreaterThan(0.9);
    });

    it('⭐ OFF-LEVEL is drawn HOLLOW, never solid — it must not claim he is on this floor', () => {
        const { pvc, arcs } = makeCanvas('L0');            // plan shows Ground
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 0, y: 6.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L1' }); // he is upstairs

        pvc.render(viewDef('v1'));

        const d = dots(arcs);
        expect(d.length).toBeGreaterThan(0);                       // still drawn, not hidden
        expect(d.every(a => a.fill !== PREVIEW_CSS.PRIMARY)).toBe(true);  // but never filled
        expect(d.some(a => (a.stroke ?? '').toLowerCase() === PREVIEW_CSS.PRIMARY)).toBe(true);
        expect(d.some(a => a.dash.length > 0)).toBe(true);         // and dashed
    });

    it('an UNRESOLVED level is treated as off-level, not as the confident case', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: null });

        pvc.render(viewDef('v1'));

        const d = dots(arcs);
        expect(d.length).toBeGreaterThan(0);
        expect(d.every(a => a.fill !== PREVIEW_CSS.PRIMARY)).toBe(true);
    });

    it('draws before any linework is cached — "add walls to see the floor plan" still has a walker', () => {
        // This project has no cached technical drawing, so render() takes the
        // placeholder branch and returns early. The marker must survive it.
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });

        pvc.render(viewDef('view-with-no-drawing'));

        expect(dots(arcs).length).toBeGreaterThan(0);
    });

    it('never draws on a SECTION — an XZ pose projected there would be a confident lie', () => {
        // On a section, worldToScreen maps (x, y), so an (x, z) pose lands somewhere
        // meaningless. Silence is the only honest output.
        const { pvc, arcs } = makeCanvas('L0', 'section');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });

        pvc.render(viewDef('v-section'));

        expect(purple(arcs)).toHaveLength(0);
    });

    it('is retracted the instant walk mode ends — no dot frozen on the plan', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        publishWalkPose({ x: 0, y: 1.7, z: 0, dirX: 0, dirZ: -1, levelId: 'L0' });
        pvc.render(viewDef('v1'));
        expect(dots(arcs).length).toBeGreaterThan(0);

        arcs.length = 0;
        publishWalkPose(null);            // what deactivate() does
        pvc.render(viewDef('v1'));

        expect(purple(arcs)).toHaveLength(0);
    });

    it('is culled when the walker is far outside the framed area', () => {
        const { pvc, arcs } = makeCanvas('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);
        publishWalkPose({ x: 5000, y: 1.7, z: 5000, dirX: 0, dirZ: -1, levelId: 'L0' });

        pvc.render(viewDef('v1'));

        expect(purple(arcs)).toHaveLength(0);
    });

    it('survives a provider that throws — a bad reader must not kill the whole paint', () => {
        const rec = makeRecordingCtx();
        const fake = {
            getContext: () => rec.ctx,
            width: 0, height: 0, clientWidth: W, clientHeight: H,
        } as unknown as HTMLCanvasElement;
        const pvc = new PlanViewCanvas(fake, {
            gridVisible: false,
            walkPoseProvider: () => { throw new Error('provider exploded'); },
        });
        pvc.setViewType('plan');
        pvc.setLevelId('L0');
        pvc.setFrustum(30, { x: 0, y: 0, z: 0 } as never);

        expect(() => pvc.render(viewDef('v1'))).not.toThrow();
    });
});
