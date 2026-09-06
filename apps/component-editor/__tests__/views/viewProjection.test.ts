// viewProjection — the PLAN / ELEVATION basis (lane CE-VIEWS-AND-MEASURE).
//
// The single most valuable assertion here is the FIRST one: that `plan`
// reproduces `sketch/transform.ts`'s convention EXACTLY. That identity is what
// makes this module an extension of the existing sketcher rather than a second
// one — if it ever breaks, every sketch already drawn silently changes meaning.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  SKETCH_VIEW_KINDS,
  cross,
  dot,
  isSketchViewKind,
  projectToView,
  unprojectFromView,
  viewBasis,
  worldDistanceMm,
  type SketchViewKind,
  type WorldVec3,
} from '../../src/views/viewProjection.js';

const EPS = 1e-12;

describe('viewProjection — the three work planes', () => {
  it('enumerates exactly plan / elevation-front / elevation-side', () => {
    expect([...SKETCH_VIEW_KINDS]).toEqual(['plan', 'elevation-front', 'elevation-side']);
  });

  // ── The identity with the legacy sketcher ────────────────────────────────
  //
  // `sketch/transform.ts` treats the sketch as the world XZ plane with +X to
  // screen-right and +Z to screen-DOWN. `plan` must agree, or every existing
  // sketch is reinterpreted the moment this module is wired in.
  it('PLAN reproduces the legacy transform.ts convention exactly', () => {
    // World +X is screen-right ⇒ plane x = +1, plane z = 0.
    expect(projectToView({ x: 1, y: 0, z: 0 }, 'plan')).toEqual({ x: 1, z: 0 });
    // World +Z is screen-DOWN ⇒ plane z = +1.
    expect(projectToView({ x: 0, y: 0, z: 1 }, 'plan')).toEqual({ x: 0, z: 1 });
    // Height is the discarded axis on a horizontal work plane.
    expect(projectToView({ x: 0, y: 999, z: 0 }, 'plan')).toEqual({ x: 0, z: 0 });
    // …and round-trips back onto the floor, not into the air.
    expect(unprojectFromView({ x: 3, z: 7 }, 'plan')).toEqual({ x: 3, y: 0, z: 7 });
  });

  it('marks plan HORIZONTAL and both elevations VERTICAL', () => {
    expect(viewBasis('plan').isVertical).toBe(false);
    expect(viewBasis('elevation-front').isVertical).toBe(true);
    expect(viewBasis('elevation-side').isVertical).toBe(true);
  });

  // ── The property that makes a family 3D ──────────────────────────────────
  //
  // An elevation is only useful if its screen-vertical axis is world Y. This
  // is the assertion that a "vertical" sketch really produces a HEIGHT.
  it('puts world +Y up the screen in BOTH elevations', () => {
    for (const kind of ['elevation-front', 'elevation-side'] as const) {
      // 2400 mm up in the world is 2400 mm UP the screen, i.e. plane z = −2400
      // (plane +z is screen-down, per transform.ts).
      expect(projectToView({ x: 0, y: 2400, z: 0 }, kind)).toEqual({ x: 0, z: -2400 });
      // …and back again, into world Y and nothing else.
      expect(unprojectFromView({ x: 0, z: -2400 }, kind)).toEqual({ x: 0, y: 2400, z: 0 });
    }
  });

  // ⭐ The classic elevation bug: getting `right` backwards mirrors the model.
  it('does not mirror the side elevation (an author at +X has −Z on their right)', () => {
    expect(viewBasis('elevation-side').right).toEqual({ x: 0, y: 0, z: -1 });
    expect(projectToView({ x: 0, y: 0, z: -1000 }, 'elevation-side')).toEqual({ x: 1000, z: 0 });
    // The out-of-plane axis for the side elevation is world X — it is dropped.
    expect(projectToView({ x: 5000, y: 0, z: 0 }, 'elevation-side')).toEqual({ x: 0, z: 0 });
  });

  it('drops the out-of-plane axis for the front elevation (world Z)', () => {
    expect(projectToView({ x: 0, y: 0, z: 5000 }, 'elevation-front')).toEqual({ x: 0, z: 0 });
  });

  // ── Every basis is orthonormal and right-handed ──────────────────────────
  //
  // `worldDistanceMm` only equals the plane-local distance while the basis is
  // orthonormal. Asserting the property (not the literals) means a future
  // skewed or scaled work plane fails HERE rather than silently reporting
  // wrong dimensions on screen.
  it.each([...SKETCH_VIEW_KINDS])('%s has an orthonormal, right-handed basis', (kind) => {
    const b = viewBasis(kind);
    const len = (v: WorldVec3) => Math.hypot(v.x, v.y, v.z);
    expect(len(b.right)).toBeCloseTo(1, 12);
    expect(len(b.up)).toBeCloseTo(1, 12);
    expect(len(b.viewDir)).toBeCloseTo(1, 12);
    expect(Math.abs(dot(b.right, b.up))).toBeLessThan(EPS);
    expect(Math.abs(dot(b.right, b.viewDir))).toBeLessThan(EPS);
    expect(Math.abs(dot(b.up, b.viewDir))).toBeLessThan(EPS);
    // Right-handed: right × up = −viewDir (the author looks INTO the screen).
    const rxu = cross(b.right, b.up);
    expect(rxu.x).toBeCloseTo(-b.viewDir.x, 12);
    expect(rxu.y).toBeCloseTo(-b.viewDir.y, 12);
    expect(rxu.z).toBeCloseTo(-b.viewDir.z, 12);
  });

  it.each([...SKETCH_VIEW_KINDS])('%s: project(unproject(s)) === s', (kind) => {
    for (const s of [{ x: 0, z: 0 }, { x: 1234.5, z: -678.25 }, { x: -1, z: 9999 }]) {
      const back = projectToView(unprojectFromView(s, kind), kind);
      expect(back.x).toBeCloseTo(s.x, 9);
      expect(back.z).toBeCloseTo(s.z, 9);
    }
  });

  // ── worldDistanceMm is a WORLD length, in every view ─────────────────────
  it.each([...SKETCH_VIEW_KINDS])(
    '%s: world distance equals the plane-local distance (orthonormality, measured)',
    (kind) => {
      const a = { x: 100, z: -250 };
      const b = { x: 1300, z: 1250 };
      const planeLocal = Math.hypot(b.x - a.x, b.z - a.z);
      expect(worldDistanceMm(a, b, kind)).toBeCloseTo(planeLocal, 9);
    },
  );

  // ⛔ Refuse, never default. Silently falling back to plan would draw an
  //    elevation as a floor plan — a wrong answer dressed as a working one.
  it('throws on an unknown view kind rather than defaulting to plan', () => {
    expect(() => viewBasis('elevation-back' as SketchViewKind)).toThrow(/unknown view kind/i);
    expect(isSketchViewKind('elevation-back')).toBe(false);
    expect(isSketchViewKind('plan')).toBe(true);
    expect(isSketchViewKind(null)).toBe(false);
  });
});
