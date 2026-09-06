// produceExtrude.direction — §82.4-DIRECTED-EXTRUDE.
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.4 ("extrusion on ANY work
// plane, not +Y only") · spec §75 (refuse, never substitute) · C73.
//
// ═══════════════════════════════════════════════════════════════════════════
// The bake's own refusal named this file's subject as the fix, verbatim:
// *"Closing it needs a direction/axis on ExtrudeOptions in
//  @pryzm/geometry-kernel — see §4D-SCHEMA-DELTA."*  This suite measures the
// axis that closes it, and — as importantly — measures that the +Y default did
// NOT move: a producer that quietly re-shaped every existing extrusion while
// adding an option would be a far worse defect than the gap it closed.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { produceExtrude, type ProfilePoint } from '../src/producers/extrude.js';
import { DescriptorInvariantError } from '../src/types/assertValidDescriptor.js';

/** A 2 m × 1 m rectangle in XZ, CCW seen from +Y. */
const RECT: readonly ProfilePoint[] = [
  { x: -1, z: -0.5 },
  { x: 1, z: -0.5 },
  { x: 1, z: 0.5 },
  { x: -1, z: 0.5 },
];
const H = 3;

function bounds(d: ReturnType<typeof produceExtrude>): {
  ex: number; ey: number; ez: number;
} {
  return {
    ex: d.bounds.max.x - d.bounds.min.x,
    ey: d.bounds.max.y - d.bounds.min.y,
    ez: d.bounds.max.z - d.bounds.min.z,
  };
}

/** Every vertex, as triples — the only honest place to read a rotation. */
function verts(d: ReturnType<typeof produceExtrude>): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < d.position.length; i += 3) {
    out.push([d.position[i]!, d.position[i + 1]!, d.position[i + 2]!]);
  }
  return out;
}

/** Signed volume of a closed indexed triangle mesh — the divergence-theorem
 *  sum. Invariant under any rigid motion, which is exactly what a rotation
 *  must be, and it cannot be satisfied by a mesh that merely LOOKS moved. */
function signedVolume(d: ReturnType<typeof produceExtrude>): number {
  let v = 0;
  for (let t = 0; t < d.index.length; t += 3) {
    const ia = d.index[t]! * 3;
    const ib = d.index[t + 1]! * 3;
    const ic = d.index[t + 2]! * 3;
    const ax = d.position[ia]!, ay = d.position[ia + 1]!, az = d.position[ia + 2]!;
    const bx = d.position[ib]!, by = d.position[ib + 1]!, bz = d.position[ib + 2]!;
    const cx = d.position[ic]!, cy = d.position[ic + 1]!, cz = d.position[ic + 2]!;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('§82.4 — produceExtrude sweeps along an arbitrary direction', () => {

  it('the +Y DEFAULT is untouched — same vertices, same bounds, same hash as no option at all', () => {
    const a = produceExtrude(RECT, H);
    const b = produceExtrude(RECT, H, {});
    const c = produceExtrude(RECT, H, { direction: { x: 0, y: 1, z: 0 } });

    expect(b.hash).toBe(a.hash);
    // ⭐ An explicit +Y is the identity, so it must not even change the KEY:
    //    a moved hash would invalidate every cached descriptor in the repo to
    //    announce a feature none of them use.
    expect(c.hash).toBe(a.hash);
    expect([...c.position]).toEqual([...a.position]);
    expect([...c.normal]).toEqual([...a.normal]);
    expect(c.bounds).toEqual(a.bounds);
    expect(bounds(a)).toEqual({ ex: 2, ey: H, ez: 1 });
  });

  it('+X — the profile plane stands up: the 3 m sweep is measured along X, and the profile ordinates land in Y/Z', () => {
    const d = produceExtrude(RECT, H, { direction: { x: 1, y: 0, z: 0 } });
    const b = bounds(d);
    expect(b.ex).toBeCloseTo(H, 6);   // the sweep
    expect(b.ey).toBeCloseTo(2, 6);   // profile x → world −y
    expect(b.ez).toBeCloseTo(1, 6);   // profile z → world z
    // The bottom cap started at world 0 and the top cap is 3 m along +X.
    expect(d.bounds.min.x).toBeCloseTo(0, 6);
    expect(d.bounds.max.x).toBeCloseTo(H, 6);
    // A rotation is rigid: the volume is the same 2 × 1 × 3 box.
    expect(Math.abs(signedVolume(d))).toBeCloseTo(6, 5);
  });

  it('an arbitrary slanted axis keeps the solid RIGID — same volume, same edge lengths, unit normals', () => {
    const dir = { x: 1, y: 1, z: 1 };
    const d = produceExtrude(RECT, H, { direction: dir });
    expect(Math.abs(signedVolume(d))).toBeCloseTo(6, 5);

    // Every vertex is at its original distance from the origin (rotation about O).
    const plain = verts(produceExtrude(RECT, H));
    const rotated = verts(d);
    expect(rotated).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) {
      const p = plain[i]!;
      const r = rotated[i]!;
      expect(Math.hypot(r[0], r[1], r[2])).toBeCloseTo(Math.hypot(p[0], p[1], p[2]), 5);
    }
    // Normals stay unit length (a scale or a shear here would be silent).
    for (let i = 0; i < d.normal.length; i += 3) {
      expect(Math.hypot(d.normal[i]!, d.normal[i + 1]!, d.normal[i + 2]!)).toBeCloseTo(1, 5);
    }
    // The top cap's centre sits `H` along the UNIT direction, not along `dir`.
    const L = Math.sqrt(3);
    const topCentre = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const v = rotated[4 + i]!; // verts [n, 2n) are the top cap, n = 4
      topCentre[0]! += v[0] / 4; topCentre[1]! += v[1] / 4; topCentre[2]! += v[2] / 4;
    }
    expect(topCentre[0]!).toBeCloseTo((H * dir.x) / L, 5);
    expect(topCentre[1]!).toBeCloseTo((H * dir.y) / L, 5);
    expect(topCentre[2]!).toBeCloseTo((H * dir.z) / L, 5);
  });

  it('−Y (antiparallel) is handled explicitly — no NaN from a degenerate axis', () => {
    const d = produceExtrude(RECT, H, { direction: { x: 0, y: -1, z: 0 } });
    for (const v of d.position) expect(Number.isFinite(v)).toBe(true);
    for (const v of d.normal) expect(Number.isFinite(v)).toBe(true);
    expect(d.bounds.min.y).toBeCloseTo(-H, 6);
    expect(d.bounds.max.y).toBeCloseTo(0, 6);
    expect(Math.abs(signedVolume(d))).toBeCloseTo(6, 5);
  });

  it('a NON-UNIT direction is normalised — its LENGTH is not a second height', () => {
    const unit = produceExtrude(RECT, H, { direction: { x: 0, y: 0, z: 1 } });
    const long = produceExtrude(RECT, H, { direction: { x: 0, y: 0, z: 17 } });
    expect(bounds(long).ez).toBeCloseTo(bounds(unit).ez, 6);
    expect(bounds(long).ez).toBeCloseTo(H, 6);
    expect(long.hash).toBe(unit.hash); // the hash records the UNIT axis
  });

  it('⛔ REFUSES a zero-length or non-finite direction rather than substituting +Y (spec §75)', () => {
    expect(() => produceExtrude(RECT, H, { direction: { x: 0, y: 0, z: 0 } }))
      .toThrow(DescriptorInvariantError);
    expect(() => produceExtrude(RECT, H, { direction: { x: 0, y: 0, z: 0 } }))
      .toThrow(/names no sweep axis/);
    expect(() => produceExtrude(RECT, H, { direction: { x: Number.NaN, y: 1, z: 0 } }))
      .toThrow(/non-finite/);
    expect(() => produceExtrude(RECT, H, { direction: { x: 0, y: Infinity, z: 0 } }))
      .toThrow(DescriptorInvariantError);
  });

  it('the hash separates axes — two directions, two keys; and `worldY` still offsets ALONG the sweep', () => {
    const px = produceExtrude(RECT, H, { direction: { x: 1, y: 0, z: 0 } });
    const pz = produceExtrude(RECT, H, { direction: { x: 0, y: 0, z: 1 } });
    expect(px.hash).not.toBe(pz.hash);
    expect(px.hash).toMatch(/\|d=1\.000000,0\.000000,0\.000000$/);

    const lifted = produceExtrude(RECT, H, { direction: { x: 1, y: 0, z: 0 }, worldY: 2 });
    // Along +X the sweep runs 2 → 5, not 0 → 3: `worldY` is "how far up the
    // sweep the solid starts", measured on the axis, then rotated into place.
    expect(lifted.bounds.min.x).toBeCloseTo(2, 6);
    expect(lifted.bounds.max.x).toBeCloseTo(5, 6);
  });
});
