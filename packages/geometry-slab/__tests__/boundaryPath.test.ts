import { describe, it, expect } from 'vitest';
import {
  BoundaryPathAuthor,
  BOUNDARY_DRAW_MODES,
  isBoundaryDrawMode,
  orthoConstrain,
  resolveBoundaryVertex,
  type ArcVertex2D,
} from '../src/boundaryPath';
import { BOUNDARY_ARC_SEGMENTS } from '../src/boundaryArc';

/**
 * §FEAT-SLAB-DRAW-MODES (founder, 2026-08-06) — "During SLAB creation, FLOOR
 * FINISH creation and CEILING creation I want the SAME OPTIONS as during WALL
 * creation — ORTHO, LINEAR, CURVE etc."
 *
 * These specs pin the shared path-authoring model to the WALL tool's semantics so
 * the four tools can never drift apart again. The ortho case is the one that had
 * ALREADY drifted: the floor and ceiling handlers each carried a private
 * dominant-axis PROJECTION, which is not what `WallPlanToolHandler._snapOrtho`
 * commits.
 */
describe('boundaryPath — the shared linear/ortho/curved model', () => {
  const S: ArcVertex2D = { x: 0, z: 0 };

  describe('the three modes are exactly the wall tool\'s three', () => {
    it('exposes linear, ortho and curved, spelled as WallPickerMode spells them', () => {
      expect([...BOUNDARY_DRAW_MODES]).toEqual(['linear', 'ortho', 'curved']);
    });

    it('isBoundaryDrawMode narrows only those three', () => {
      expect(isBoundaryDrawMode('linear')).toBe(true);
      expect(isBoundaryDrawMode('ortho')).toBe(true);
      expect(isBoundaryDrawMode('curved')).toBe(true);
      // A tool's own extra modes are NOT boundary modes.
      for (const other of ['rectangle', 'auto', '2point', 'region', 'hollow', 'pickWalls', '', undefined, null, 7]) {
        expect(isBoundaryDrawMode(other)).toBe(false);
      }
    });
  });

  // ⛔⛔ THE VERDICT OF THIS BLOCK WAS REVERSED BY FOUNDER RULING ON 2026-08-24
  // (§RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT). It used to assert the ROTATE rule —
  // "PRESERVES the radial distance" — and that a projection would be WRONG.
  //
  // He was shown a measured table in which one ortho gesture committed TWO lengths
  // (identical 0.000° angles, up to 1464 mm apart on a 5 m drag) and ruled for
  // PROJECTION: the endpoint is the cursor's perpendicular FOOT on the axis, so
  // sideways motion does not change the length. His reasoning was his own earlier
  // ruling turned back on itself — ORTHO IS A MODE, NOT AN AID: under rotation a wall
  // could GROW out of a cursor motion with ZERO component along its own axis (axial
  // frozen at 4.000 m, perpendicular swept to 3.9 m: 4000 → 5587 mm), which is the mode
  // reinterpreting a magnitude the user never made along that axis.
  // ⚠ NOT the "5 m drag at 80°" example an earlier draft used — that one is WRONG: at
  // 80° the nearer cardinal is the OTHER axis, so the rules differ by only 76 mm there.
  //
  // ⭐ THE 2026-08-06 DIRECTIVE THAT CREATED THIS FILE STILL HOLDS. It said these
  // tools must AGREE with the wall tool. They still do — and now the 3-D wall tool,
  // which that pass missed and which had projected all along, agrees too. Only WHICH
  // rule they agree on changed.
  describe('orthoConstrain — the perpendicular foot (founder ruling, 2026-08-24)', () => {
    it('PROJECTS onto the nearer axis — the perpendicular component is dropped', () => {
      // A drag to (3, 4): |raw| = 5, angle ~53°, nearer the +Z axis.
      // ROTATE gave 5 m (the radial distance). PROJECT gives 4 m (the z-component).
      // That 1 m is the divergence this ruling closed, on this exact fixture.
      const raw = { x: 3, z: 4 };
      const v = orthoConstrain(S, raw);
      expect(v.x).toBeCloseTo(0, 12);
      expect(v.z).toBeCloseTo(4, 12);
      expect(Math.hypot(v.x - S.x, v.z - S.z)).toBeCloseTo(4, 12);
    });

    it('sideways cursor motion does NOT change the length (the property the ruling bought)', () => {
      // Axial component frozen; only the perpendicular offset moves. Under ROTATE
      // this grew 4000 → 5587 mm. Under PROJECT it cannot move at all.
      for (const perp of [0, 0.5, 1, 2, 3, 3.9]) {
        const v = orthoConstrain(S, { x: 4, z: perp });
        expect(Math.hypot(v.x - S.x, v.z - S.z), `perp ${perp}`).toBeCloseTo(4, 12);
      }
    });

    it('snaps to whichever of the four cardinals is nearest', () => {
      expect(orthoConstrain(S, { x: 10, z: 1 }).x).toBeGreaterThan(0);   // +X
      expect(orthoConstrain(S, { x: -10, z: 1 }).x).toBeLessThan(0);     // −X
      expect(orthoConstrain(S, { x: 1, z: -10 }).z).toBeLessThan(0);     // −Z
    });

    it('is exactly orthogonal for every input (the §STRICT-ORTHO guarantee)', () => {
      // ⚠ THE ORTHOGONALITY HALF IS UNTOUCHED BY THE RULING — that is the guarantee
      // this case is named for and it held under both rules. The LENGTH assertion
      // below changed: it read `toBeCloseTo(r)` (the radial distance survives) and
      // now asserts the projected magnitude, which is |r·cos| onto the nearer axis.
      for (let deg = 0; deg < 360; deg += 7) {
        const r = 3.7;
        const raw = { x: Math.cos(deg * Math.PI / 180) * r, z: Math.sin(deg * Math.PI / 180) * r };
        const v = orthoConstrain(S, raw);
        // One component is (numerically) zero — the definition of axis-aligned.
        expect(Math.min(Math.abs(v.x), Math.abs(v.z))).toBeLessThan(1e-9);
        // The surviving component is whichever of the two was larger.
        const expected = Math.max(Math.abs(raw.x), Math.abs(raw.z));
        expect(Math.hypot(v.x, v.z)).toBeCloseTo(expected, 9);
        // …and it is never LONGER than the drag — a projection cannot invent reach.
        expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(r + 1e-9);
      }
    });

    it('a zero-length drag is a no-op, never NaN', () => {
      const v = orthoConstrain(S, { x: 0, z: 0 });
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(0, 12);
    });
  });

  describe('resolveBoundaryVertex', () => {
    it('linear commits the raw point', () => {
      expect(resolveBoundaryVertex('linear', S, { x: 3, z: 4 })).toEqual({ x: 3, z: 4 });
    });
    it('ortho constrains against the previous vertex', () => {
      expect(resolveBoundaryVertex('ortho', S, { x: 3, z: 4 })).toEqual(orthoConstrain(S, { x: 3, z: 4 }));
    });
    it('the FIRST vertex is never constrained (there is nothing to be ortho to)', () => {
      expect(resolveBoundaryVertex('ortho', null, { x: 3, z: 4 })).toEqual({ x: 3, z: 4 });
    });
  });

  describe('BoundaryPathAuthor — LINEAR', () => {
    it('appends one vertex per click, verbatim', () => {
      const a = new BoundaryPathAuthor();
      expect(a.click('linear', { x: 0, z: 0 })).toBe('vertex');
      a.click('linear', { x: 4, z: 1 });
      a.click('linear', { x: 4, z: 5 });
      expect(a.points).toEqual([{ x: 0, z: 0 }, { x: 4, z: 1 }, { x: 4, z: 5 }]);
      expect(a.canClose()).toBe(true);
    });
  });

  describe('BoundaryPathAuthor — ORTHO', () => {
    it('every committed segment is axis-aligned', () => {
      const a = new BoundaryPathAuthor();
      a.click('ortho', { x: 0, z: 0 });
      a.click('ortho', { x: 5, z: 0.4 });   // nearly +X
      a.click('ortho', { x: 5.3, z: 4 });   // nearly +Z
      const p = a.points;
      for (let i = 1; i < p.length; i++) {
        const dx = Math.abs(p[i]!.x - p[i - 1]!.x);
        const dz = Math.abs(p[i]!.z - p[i - 1]!.z);
        expect(Math.min(dx, dz)).toBeLessThan(1e-9);
      }
    });

    it('the preview tail shows the point that will ACTUALLY be committed', () => {
      const a = new BoundaryPathAuthor();
      a.click('ortho', { x: 0, z: 0 });
      const cursor = { x: 3, z: 4 };
      const tail = a.previewTail('ortho', cursor);
      expect(tail).toHaveLength(1);
      expect(tail[0]).toEqual(orthoConstrain({ x: 0, z: 0 }, cursor));
      // …and clicking there commits exactly that — the ghost cannot lie.
      a.click('ortho', cursor);
      expect(a.points[1]).toEqual(tail[0]);
    });
  });

  describe('BoundaryPathAuthor — CURVED', () => {
    it('runs the wall tool\'s 3-click gesture and appends a tessellated arc', () => {
      const a = new BoundaryPathAuthor();
      expect(a.click('curved', { x: 0, z: 0 })).toBe('vertex');       // start vertex
      expect(a.click('curved', { x: 2, z: 1 })).toBe('arc-midpoint'); // the bulge
      expect(a.pendingArcMidpoint).toEqual({ x: 2, z: 1 });
      expect(a.click('curved', { x: 4, z: 0 })).toBe('arc-segment');  // the arc end
      expect(a.pendingArcMidpoint).toBeNull();
      // start + BOUNDARY_ARC_SEGMENTS sampled vertices (start not duplicated).
      expect(a.pointCount).toBe(1 + BOUNDARY_ARC_SEGMENTS);
      const last = a.points[a.pointCount - 1]!;
      expect(last.x).toBeCloseTo(4, 12);
      expect(last.z).toBeCloseTo(0, 12);
    });

    it('the arc PASSES THROUGH the clicked midpoint (not near it)', () => {
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 2, z: 1 });
      a.click('curved', { x: 4, z: 0 });
      // t = 0.5 sample — index 1 (start) + 8 - 1.
      const mid = a.points[1 + BOUNDARY_ARC_SEGMENTS / 2 - 1]!;
      expect(mid.x).toBeCloseTo(2, 12);
      expect(mid.z).toBeCloseTo(1, 12);
    });

    it('a PENDING midpoint blocks closing — a dbl-click cannot eat the arc END click', () => {
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 4, z: 0 });
      a.click('curved', { x: 4, z: 4 });
      expect(a.canClose()).toBe(true);
      a.click('curved', { x: 2, z: 6 });          // arc midpoint pending
      expect(a.canClose()).toBe(false);
    });

    it('Backspace re-picks the midpoint FIRST, then pops vertices', () => {
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 2, z: 1 });          // midpoint pending
      expect(a.undo()).toBe(true);
      expect(a.pendingArcMidpoint).toBeNull();
      expect(a.pointCount).toBe(1);               // the vertex SURVIVED
      expect(a.undo()).toBe(true);
      expect(a.pointCount).toBe(0);
      expect(a.undo()).toBe(false);               // nothing left, no throw
    });

    it('previewTail is the whole tessellated arc while a midpoint is pending', () => {
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 2, z: 1 });
      expect(a.previewTail('curved', { x: 4, z: 0 })).toHaveLength(BOUNDARY_ARC_SEGMENTS);
      // No cursor ⇒ nothing to trail.
      expect(a.previewTail('curved', null)).toHaveLength(0);
    });

    it('the very first click is a plain vertex — an arc needs something to start from', () => {
      const a = new BoundaryPathAuthor();
      expect(a.click('curved', { x: 1, z: 1 })).toBe('vertex');
      expect(a.pendingArcMidpoint).toBeNull();
    });
  });

  describe('BoundaryPathAuthor — housekeeping', () => {
    it('isDrawing tracks the stroke (drives hasActiveStroke)', () => {
      const a = new BoundaryPathAuthor();
      expect(a.isDrawing).toBe(false);
      a.click('linear', { x: 0, z: 0 });
      expect(a.isDrawing).toBe(true);
      a.reset();
      expect(a.isDrawing).toBe(false);
      expect(a.pointCount).toBe(0);
    });

    it('`points` is a COPY — a caller cannot mutate the author\'s boundary', () => {
      const a = new BoundaryPathAuthor();
      a.click('linear', { x: 1, z: 2 });
      const snapshot = a.points;
      snapshot[0]!.x = 999;
      expect(a.points[0]!.x).toBe(1);
    });

    it('fewer than 3 vertices cannot close', () => {
      const a = new BoundaryPathAuthor();
      a.click('linear', { x: 0, z: 0 });
      a.click('linear', { x: 1, z: 0 });
      expect(a.canClose()).toBe(false);
    });
  });

  /**
   * REQUIREMENT B, measured. The founder's screenshot shows a floor finish cutting
   * a straight CHORD across a curved room, leaving an uncovered wedge. A curved
   * boundary drawn through this model must follow the ARC, so the enclosed area
   * must match the true quadratic-Bézier area — not the chord polygon's.
   */
  describe('a curved boundary follows the arc, measured — not eyeballed', () => {
    /** Shoelace area of a closed XZ polygon. */
    const area = (poly: ArcVertex2D[]): number => {
      let s = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        s += poly[j]!.x * poly[i]!.z - poly[i]!.x * poly[j]!.z;
      }
      return Math.abs(s) / 2;
    };

    it('matches the exact area under a quadratic Bézier to within the 16-chord error', () => {
      // A "room" 4 m wide whose north wall bulges 1 m. The EXACT area between the
      // chord z=0 and the Bézier S=(0,0) M=(2,1) E=(4,0) is Archimedes' parabolic
      // segment: 2/3 of the triangle S,C,E with C=(2,2) ⟹ 2/3 · 4 = 8/3 m².
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 2, z: 1 });   // arc midpoint (the bulge)
      a.click('curved', { x: 4, z: 0 });   // arc end
      const bulgeArea = area(a.points);    // closed back to (0,0) by the shoelace
      const exact = (2 / 3) * 4 * 1;
      const relErr = Math.abs(bulgeArea - exact) / exact;
      // An inscribed n-chord polygon UNDER-estimates by exactly 1/n² for a
      // parabola — 1/256 ≈ 0.39 % at BOUNDARY_ARC_SEGMENTS = 16. Asserting the
      // KNOWN error (not a loose bound) is what proves we sample the true curve
      // rather than approximate it: a chord boundary would be 100 % out.
      expect(relErr).toBeLessThan(0.005);
      expect(relErr).toBeCloseTo(1 / (BOUNDARY_ARC_SEGMENTS * BOUNDARY_ARC_SEGMENTS), 5);
      expect(bulgeArea).toBeLessThan(exact); // inscribed ⇒ never overstates
    });

    it('recovers the wedge a straight CHORD boundary drops', () => {
      // The founder's defect, quantified. Same 4 × 3 room, north wall bulging 1 m.
      // Modes are mixed per click exactly as a user mixes them: the curved north
      // edge, then three straight ones.
      const curved = new BoundaryPathAuthor();
      curved.click('curved', { x: 0, z: 0 });
      curved.click('curved', { x: 2, z: 1 });   // arc midpoint
      curved.click('curved', { x: 4, z: 0 });   // arc end
      curved.click('linear', { x: 4, z: -3 });
      curved.click('linear', { x: 0, z: -3 });

      const chord = new BoundaryPathAuthor();
      chord.click('linear', { x: 0, z: 0 });
      chord.click('linear', { x: 4, z: 0 });   // the straight chord across the arc
      chord.click('linear', { x: 4, z: -3 });
      chord.click('linear', { x: 0, z: -3 });

      expect(area(chord.points)).toBeCloseTo(12, 10);  // the plain 4×3 rectangle
      const wedge = area(curved.points) - area(chord.points);
      // 8/3 m² of slab that the chord finish leaves BARE — 22 % of the room.
      expect(wedge).toBeGreaterThan(2.6);
      expect(wedge).toBeLessThan(2.67);
      expect(wedge / area(chord.points)).toBeGreaterThan(0.2);
    });

    it('max deviation from the true Bézier is ~0 (we sample it, we do not approximate it)', () => {
      const a = new BoundaryPathAuthor();
      a.click('curved', { x: 0, z: 0 });
      a.click('curved', { x: 2, z: 1 });
      a.click('curved', { x: 4, z: 0 });
      // C = 2·M − 0.5·(S+E) = (2, 2)
      const C = { x: 2, z: 2 };
      let maxDev = 0;
      for (let i = 1; i <= BOUNDARY_ARC_SEGMENTS; i++) {
        const t = i / BOUNDARY_ARC_SEGMENTS;
        const w0 = (1 - t) * (1 - t), w1 = 2 * (1 - t) * t, w2 = t * t;
        const ex = w1 * C.x + w2 * 4;
        const ez = w0 * 0 + w1 * C.z + w2 * 0;
        const got = a.points[i]!;                       // index 0 is the start vertex
        maxDev = Math.max(maxDev, Math.hypot(got.x - ex, got.z - ez));
      }
      expect(maxDev).toBeLessThan(1e-12);
    });
  });
});
