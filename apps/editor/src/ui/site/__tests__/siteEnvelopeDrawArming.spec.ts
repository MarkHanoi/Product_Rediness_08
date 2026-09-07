// §ENVELOPE-DRAW-ON-THE-SITE-VIEWS — the arming registry, the gesture driver and the hand-off
// store, pinned with a FAKE OF THE PORT and nothing else.
//
// ⭐ WHAT THIS SUITE IS FOR. PLAN-ENVELOPE-DRAW §5 C2: *"arming with zero registered surfaces
// returns a refusal naming the route back; register a fake, arm, feed three points + finish, assert
// the store holds ring + area; disarm clears both. Pure, no DOM."* Plus the two rules that were
// each bought by a founder-reported defect: the FIRST CLICK WINS (L-5106 has no active-view
// accessor, so nobody may ask "which pane"), and the disarm ships with the arm (L-7801).
//
// ⛔ WHAT IT DOES NOT ESTABLISH (R4). The fake implements the PORT — it converts nothing, picks
// nothing. Whether a Cesium `scene.pickPosition` or a MapLibre `e.lngLat` lands in the right frame
// is the adapter's business and is browser-only. A fake built from the port cannot falsify an
// adapter ([[fake-more-capable-than-real]]); it can only pin what sits ABOVE the port.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArcVertex2D } from '@pryzm/geometry-slab/boundary-path';
import type {
    EnvelopeDrawSink,
    EnvelopeDrawSurface,
    EnvelopeDrawSurfaceId,
    SceneXZPoint,
} from '../envelopeDrawSurface';
import {
    ENVELOPE_DRAW_MODES,
    ENVELOPE_DRAW_NO_SURFACE_REASON,
    __resetEnvelopeDrawArmingForTests,
    armEnvelopeDraw,
    disarmEnvelopeDraw,
    getEnvelopeDrawStatus,
    isEnvelopeDrawArmed,
    isEnvelopeDrawMode,
    registerEnvelopeDrawSurface,
    registeredEnvelopeDrawSurfaces,
    resolveEnvelopeDrawMode,
    setEnvelopeDrawMode,
    subscribeEnvelopeDrawStatus,
} from '../siteEnvelopeDrawArming';
import {
    __resetDrawnEnvelopeFootprintForTests,
    clearDrawnEnvelopeFootprint,
    getDrawnEnvelopeFootprint,
    setDrawnEnvelopeFootprint,
    subscribeDrawnEnvelopeFootprint,
} from '../drawnEnvelopeFootprintState';

/** A fake of the PORT. Records what the registry asked of it; converts nothing. */
class FakeSurface implements EnvelopeDrawSurface {
    sink: EnvelopeDrawSink | null = null;
    armCount = 0;
    disarmCount = 0;
    clearCount = 0;
    accept = true;
    previews: { committed: ArcVertex2D[]; tail: ArcVertex2D[]; closeRing: boolean }[] = [];
    /** §ENVELOPE-DRAW-SETTLED-RING — every settled ring this surface was asked to paint. */
    settled: SceneXZPoint[][] = [];
    settledClears = 0;
    /** The ring currently painted, mirroring what a real adapter's entities would show. */
    get settledShowing(): SceneXZPoint[] | null {
        return this.settled.length > 0 ? this.settled[this.settled.length - 1]! : null;
    }
    constructor(readonly surfaceId: EnvelopeDrawSurfaceId) {}
    groundPointFromPointer(clientX: number, clientY: number): SceneXZPoint | null {
        return { x: clientX, z: clientY };
    }
    drawPreview(committed: readonly ArcVertex2D[], tail: readonly ArcVertex2D[], closeRing: boolean): void {
        this.previews.push({ committed: [...committed], tail: [...tail], closeRing });
    }
    clearPreview(): void { this.clearCount++; }
    drawSettledRing(ring: readonly SceneXZPoint[]): void { this.settled.push(ring.map((p) => ({ ...p }))); }
    clearSettledRing(): void { this.settledClears++; this.settled.length = 0; }
    arm(sink: EnvelopeDrawSink): boolean {
        this.armCount++;
        if (!this.accept) return false;
        this.sink = sink;
        return true;
    }
    disarm(): void { this.disarmCount++; this.sink = null; }
    get isArmed(): boolean { return this.sink !== null; }
}

const RECT: SceneXZPoint[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }];

beforeEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
});
afterEach(() => {
    __resetEnvelopeDrawArmingForTests();
    __resetDrawnEnvelopeFootprintForTests();
});

describe('armEnvelopeDraw — arm every attached surface, refuse with the route back when none', () => {
    it('⛔ with ZERO surfaces refuses, names the route back, and arms nothing', () => {
        const r = armEnvelopeDraw();
        expect(r.ok).toBe(false);
        expect(r.surfaces).toBe(0);
        expect(r.reason).toBe(ENVELOPE_DRAW_NO_SURFACE_REASON);
        expect(r.reason).toContain('2D Site Map');
        expect(r.reason).toContain('3D Site');
        expect(r.reason).toContain('not a finding about your parcel');
        expect(isEnvelopeDrawArmed()).toBe(false);
    });

    it('a surface that declines to arm is not counted — and the refusal is the same sentence', () => {
        const s = new FakeSurface('site-3d');
        s.accept = false;
        registerEnvelopeDrawSurface(s);
        const r = armEnvelopeDraw();
        expect(r.ok).toBe(false);
        expect(r.surfaces).toBe(0);
        expect(s.armCount).toBe(1);
        expect(s.isArmed).toBe(false);
    });

    it('arms EVERY registered surface and counts the ones that accepted', () => {
        const a = new FakeSurface('site-3d');
        const b = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(a);
        registerEnvelopeDrawSurface(b);
        const r = armEnvelopeDraw();
        expect(r).toEqual({ ok: true, surfaces: 2 });
        expect(a.isArmed && b.isArmed).toBe(true);
        expect(getEnvelopeDrawStatus().hint).toContain('first corner');
    });
});

describe('the gesture — three points + finish hands ring AND area to the store', () => {
    it('⭐ linear: four corners, Enter/dbl-click → the store holds the ring and its |shoelace| area', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        expect(getDrawnEnvelopeFootprint()).toBeNull();          // not until finish
        s.sink!.onFinish();
        const d = getDrawnEnvelopeFootprint();
        expect(d).not.toBeNull();
        expect(d!.ring).toEqual(RECT);
        expect(d!.areaM2).toBeCloseTo(200, 6);
        expect(d!.surfaceId).toBe('site-3d');
        expect(d!.mode).toBe('linear');
        // ⛔ finished ⇒ disarmed, preview cleared (L-7801: no live handler after the gesture ends)
        expect(s.isArmed).toBe(false);
        expect(s.disarmCount).toBe(1);
        expect(s.clearCount).toBeGreaterThanOrEqual(1);
        expect(isEnvelopeDrawArmed()).toBe(false);
    });

    it('draws a preview on every click and move — committed vertices then the rubber-band tail', () => {
        const s = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onMove({ x: 5, z: 5 });
        const last = s.previews[s.previews.length - 1]!;
        expect(last.committed).toEqual([{ x: 0, z: 0 }]);
        expect(last.tail).toEqual([{ x: 5, z: 5 }]);
        expect(last.closeRing).toBe(false);                      // two points: an open edge
        s.sink!.onPoint({ x: 10, z: 0 });
        s.sink!.onMove({ x: 10, z: 20 });
        expect(s.previews[s.previews.length - 1]!.closeRing).toBe(true); // three ⇒ the closing edge
    });

    it('⛔ refuses to close with fewer than three corners, stays armed, stores nothing', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onPoint({ x: 10, z: 0 });
        s.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        expect(s.isArmed).toBe(true);
        expect(getEnvelopeDrawStatus().refusal).toContain('three corners');
        expect(getEnvelopeDrawStatus().refusal).toContain('2 placed');
    });

    it('Backspace removes the last corner; the next click continues', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onPoint({ x: 99, z: 99 });
        s.sink!.onUndo();
        expect(getEnvelopeDrawStatus().vertices).toBe(1);
        s.sink!.onPoint({ x: 10, z: 0 });
        s.sink!.onPoint({ x: 10, z: 20 });
        s.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()!.ring).toEqual([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }]);
    });

    it('⛔ Esc cancels: every surface disarmed, preview cleared, the store UNTOUCHED', () => {
        setDrawnEnvelopeFootprint({ ring: RECT, areaM2: 200, surfaceId: 'site-3d', mode: 'linear' });
        const s = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onCancel();
        expect(s.isArmed).toBe(false);
        expect(isEnvelopeDrawArmed()).toBe(false);
        expect(getDrawnEnvelopeFootprint()!.ring).toEqual(RECT);   // the earlier drawing survives
    });
});

describe('⭐ the FIRST CLICK WINS — no active-view accessor is asked (L-5106)', () => {
    it('two armed surfaces: a click on one disarms the other in the same call; the owner finishes', () => {
        const a = new FakeSurface('site-3d');
        const b = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(a);
        registerEnvelopeDrawSurface(b);
        armEnvelopeDraw();
        b.sink!.onPoint({ x: 0, z: 0 });
        expect(a.isArmed).toBe(false);
        expect(a.disarmCount).toBe(1);
        expect(b.isArmed).toBe(true);
        expect(getEnvelopeDrawStatus().owner).toBe('site-map-2d');
        // A late event from the loser is IGNORED, never obeyed.
        const stale = a;
        expect(stale.sink).toBeNull();
        b.sink!.onPoint({ x: 10, z: 0 });
        b.sink!.onPoint({ x: 10, z: 20 });
        b.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()!.surfaceId).toBe('site-map-2d');
    });

    it('a sink kept after disarm is dead — a point fed through it changes nothing (L-7801)', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        const sink = s.sink!;
        sink.onPoint({ x: 0, z: 0 });
        expect(disarmEnvelopeDraw()).toBe(1);
        sink.onPoint({ x: 10, z: 0 });
        sink.onPoint({ x: 10, z: 20 });
        sink.onFinish();
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        expect(getEnvelopeDrawStatus().vertices).toBe(0);
    });
});

describe('disarm ships with the arm (plan §7 rule 12)', () => {
    it('disarmEnvelopeDraw() disarms every surface, drops the half-ring, reports the count', () => {
        const a = new FakeSurface('site-3d');
        const b = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(a);
        registerEnvelopeDrawSurface(b);
        armEnvelopeDraw();
        a.sink!.onPoint({ x: 0, z: 0 });               // a owns; b already disarmed by the click
        expect(disarmEnvelopeDraw()).toBe(1);
        expect(a.isArmed || b.isArmed).toBe(false);
        expect(getEnvelopeDrawStatus()).toMatchObject({ armed: false, surfaces: 0, owner: null, vertices: 0, hint: '' });
        expect(disarmEnvelopeDraw()).toBe(0);            // idempotent
    });

    it('unregistering the OWNER mid-gesture disarms everything — nothing can finish on a dead map', () => {
        const a = new FakeSurface('site-3d');
        const unregister = registerEnvelopeDrawSurface(a);
        armEnvelopeDraw();
        a.sink!.onPoint({ x: 0, z: 0 });
        unregister();
        expect(registeredEnvelopeDrawSurfaces()).toBe(0);
        expect(isEnvelopeDrawArmed()).toBe(false);
        expect(armEnvelopeDraw().ok).toBe(false);        // and the next arm refuses honestly
    });

    it('re-arming while armed restarts the gesture rather than stacking a second', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        armEnvelopeDraw();
        expect(s.armCount).toBe(2);
        expect(getEnvelopeDrawStatus().vertices).toBe(0);
        expect(s.isArmed).toBe(true);
    });
});

describe('the six modes — the two slab-family unions, read FRESH per click, never re-arming', () => {
    it('spells exactly the slab family\'s six, in strip order, and the guard narrows only them', () => {
        expect([...ENVELOPE_DRAW_MODES]).toEqual(['linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical']);
        expect(isEnvelopeDrawMode('orthogonal')).toBe(false);   // the PARCEL tool's spelling, not ours (L-1322)
        expect(isEnvelopeDrawMode('rectangle')).toBe(false);
        setEnvelopeDrawMode('orthogonal');
        expect(resolveEnvelopeDrawMode()).toBe('linear');        // ignored, not coerced
    });

    it('⭐ ortho: the founder-ruled perpendicular FOOT, applied on the click after the switch — no re-arm', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        setEnvelopeDrawMode('ortho');                     // switched MID-DRAW
        s.sink!.onPoint({ x: 10, z: 0.4 });               // nearer axis is X ⇒ foot at (10, 0)
        s.sink!.onPoint({ x: 10.3, z: 20 });              // nearer axis is Z ⇒ foot at (10, 20)
        s.sink!.onPoint({ x: 0, z: 20.1 });               // nearer axis is X ⇒ foot at (0, 20) — the foot is on the axis LINE through the last corner, it never snaps to an earlier corner
        s.sink!.onFinish();
        const d = getDrawnEnvelopeFootprint()!;
        expect(d.mode).toBe('ortho');
        expect(d.ring.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.z * 1e6) / 1e6]))
            .toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
        expect(d.areaM2).toBeCloseTo(200, 6);
        expect(s.armCount).toBe(1);                       // ⛔ the mode switch did NOT re-arm
    });

    it('⭐ rectangular: two clicks close the loop — no finish call, 4 corners, |area| from the kernel', () => {
        setEnvelopeDrawMode('rectangular');
        const s = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        expect(getEnvelopeDrawStatus().hint).toContain('first corner');
        s.sink!.onPoint({ x: 10, z: 20 });
        expect(getEnvelopeDrawStatus().hint).toContain('opposite corner');
        s.sink!.onPoint({ x: 0, z: 0 });
        const d = getDrawnEnvelopeFootprint()!;
        expect(d.mode).toBe('rectangular');
        expect(d.ring).toHaveLength(4);
        expect(d.areaM2).toBeCloseTo(200, 6);
        expect(s.isArmed).toBe(false);
    });

    it('⛔ a degenerate loop is REFUSED with the generator\'s own sentence; still armed; nothing stored', () => {
        setEnvelopeDrawMode('circular');
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onPoint({ x: 0.01, z: 0.01 });
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        expect(getEnvelopeDrawStatus().refusal).toContain('radius');
        expect(s.isArmed).toBe(true);
        s.sink!.onPoint({ x: 5, z: 0 });                  // a real rim point finishes it
        expect(getDrawnEnvelopeFootprint()!.ring.length).toBeGreaterThanOrEqual(3);
        expect(getDrawnEnvelopeFootprint()!.areaM2).toBeCloseTo(Math.PI * 25, 0);
    });

    it('curved: midpoint then end tessellates an arc run; closing is BLOCKED while the midpoint is pending', () => {
        setEnvelopeDrawMode('curved');
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onPoint({ x: 5, z: 3 });                  // arc midpoint
        expect(getEnvelopeDrawStatus().hint).toContain('arc END');
        s.sink!.onFinish();
        expect(getEnvelopeDrawStatus().refusal).toContain('half-drawn');
        s.sink!.onPoint({ x: 10, z: 0 });                 // arc end ⇒ tessellated run appended
        expect(getEnvelopeDrawStatus().vertices).toBeGreaterThan(3);
        s.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()!.mode).toBe('curved');
    });

    it('switching to a LOOP mode mid-path drops a pending arc midpoint but keeps the placed corners', () => {
        setEnvelopeDrawMode('curved');
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        s.sink!.onPoint({ x: 5, z: 3 });                  // pending midpoint
        setEnvelopeDrawMode('linear');
        expect(getEnvelopeDrawStatus().vertices).toBe(1);
        expect(getEnvelopeDrawStatus().hint).not.toContain('arc END');
    });
});

describe('the hand-off store — ring and area together, session-only', () => {
    it('notifies subscribers on set and clear, and refuses a degenerate ring', () => {
        let beats = 0;
        const unsub = subscribeDrawnEnvelopeFootprint(() => { beats++; });
        setDrawnEnvelopeFootprint({ ring: RECT, areaM2: 200, surfaceId: 'site-3d', mode: 'linear' });
        expect(beats).toBe(1);
        setDrawnEnvelopeFootprint({ ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }], areaM2: 0, surfaceId: 'site-3d', mode: 'linear' });
        expect(getDrawnEnvelopeFootprint()!.ring).toEqual(RECT); // unchanged
        expect(beats).toBe(1);
        clearDrawnEnvelopeFootprint();
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        expect(beats).toBe(2);
        unsub();
        setDrawnEnvelopeFootprint({ ring: RECT, areaM2: 200, surfaceId: 'site-3d', mode: 'linear' });
        expect(beats).toBe(2);
    });

    it('the status channel beats on arm, click and disarm — the Draw button paints from it', () => {
        let beats = 0;
        subscribeEnvelopeDrawStatus(() => { beats++; });
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        s.sink!.onPoint({ x: 0, z: 0 });
        disarmEnvelopeDraw();
        expect(beats).toBe(3);
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §ENVELOPE-DRAW-SETTLED-RING (L-13148) — THE PERIMETER SURVIVES ENTER
// ════════════════════════════════════════════════════════════════════════════════════════════
// The founder: *"when i click enter - it desappar from hte screen - it should continue"*.
//
// ⛔ THESE CASES PIN THE LIFECYCLE, NOT THE PICTURE. Whether a Cesium polyline or a MapLibre fill
// actually appears is browser-only and a fake cannot falsify it ([[fake-more-capable-than-real]]).
// What IS testable above the port is the thing that was wrong: WHEN the settled ring is asked for
// and WHEN it is taken away.
describe('§ENVELOPE-DRAW-SETTLED-RING — the finished perimeter stays on screen', () => {
    it('⭐ Enter paints the CLOSED ring on the owning surface, and the disarm does not remove it', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        s.sink!.onFinish();

        // The gesture is over — the surface was disarmed and its in-progress preview cleared …
        expect(isEnvelopeDrawArmed()).toBe(false);
        expect(s.disarmCount).toBeGreaterThan(0);
        expect(s.clearCount).toBeGreaterThan(0);
        // … and the FINISHED ring is on screen, which is the whole point.
        expect(s.settledShowing).toEqual(RECT);
        // It is the SAME ring the panel was handed — one producer, not a second copy.
        expect(s.settledShowing).toEqual(getDrawnEnvelopeFootprint()!.ring);
    });

    it('⛔ DISCARDING the drawing takes the ring off screen — through the slot, not the caller', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        s.sink!.onFinish();
        expect(s.settledShowing).not.toBeNull();

        clearDrawnEnvelopeFootprint();                    // what the panel's discard button calls
        expect(s.settledShowing).toBeNull();
        expect(s.settledClears).toBeGreaterThan(0);
    });

    it('⛔ a NEW draw drops the previous outline, so two rings are never on the globe at once', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        s.sink!.onFinish();
        expect(s.settledShowing).not.toBeNull();

        armEnvelopeDraw();                                 // he presses Draw again
        expect(s.settledShowing).toBeNull();
    });

    it('⚠ ESC after a finished drawing keeps it — cancelling a REDRAW must not destroy the drawing', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        s.sink!.onFinish();
        const stored = getDrawnEnvelopeFootprint();

        armEnvelopeDraw();                                 // re-arm: the old outline goes (case above)
        s.sink!.onPoint({ x: 99, z: 99 });                 // one corner, then Esc
        s.sink!.onCancel();
        // The STORED drawing is untouched — the pre-existing rule this feature must not break.
        expect(getDrawnEnvelopeFootprint()).toBe(stored);
    });

    it('⛔ a REFUSED (degenerate) finish paints nothing — the store write is what may refuse', () => {
        const s = new FakeSurface('site-3d');
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        // Three clicks on the same spot: `collapseCoincident` eats the ring and `finish` refuses.
        for (let i = 0; i < 3; i++) s.sink!.onPoint({ x: 5, z: 5 });
        s.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()).toBeNull();
        expect(s.settledShowing).toBeNull();
        expect(getEnvelopeDrawStatus().refusal).toContain('same spot');
    });

    it('⚠ a surface that does not implement the port method still stores the ring', () => {
        // Optional means optional: no picture, no throw, and the panel still has the perimeter.
        const s = new FakeSurface('site-map-2d');
        (s as { drawSettledRing?: unknown }).drawSettledRing = undefined;
        registerEnvelopeDrawSurface(s);
        armEnvelopeDraw();
        for (const p of RECT) s.sink!.onPoint(p);
        s.sink!.onFinish();
        expect(getDrawnEnvelopeFootprint()!.ring).toEqual(RECT);
        expect(s.settledShowing).toBeNull();
    });

    it('⛔ the ring is painted on the surface that OWNED the gesture, not on the other pane', () => {
        const a = new FakeSurface('site-3d');
        const b = new FakeSurface('site-map-2d');
        registerEnvelopeDrawSurface(a);
        registerEnvelopeDrawSurface(b);
        armEnvelopeDraw();
        for (const p of RECT) a.sink!.onPoint(p);          // the first click wins on `a`
        a.sink!.onFinish();
        expect(a.settledShowing).toEqual(RECT);
        expect(b.settledShowing).toBeNull();
    });
});
