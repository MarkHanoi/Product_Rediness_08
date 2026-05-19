// Focused unit tests for each lifted helper (T003 acceptance).

import { describe, expect, it } from 'vitest';
import { computeArcLengths, distanceToT, pathToPolyline } from '../src/producers/_internal/WallPath.js';
import { buildMiterPrism, miterAngleToNormal } from '../src/producers/_internal/buildMiterPrism.js';
import { projectCapVertex } from '../src/producers/_internal/projectCapVertex.js';
import { computeOpeningWorldPos } from '../src/producers/_internal/computeOpeningWorldPos.js';
import { composeMaterialKey } from '../src/producers/_internal/composeMaterialKey.js';
import { composeWallGeometryHash } from '../src/producers/_internal/composeWallGeometryHash.js';
import { clusterOpenings } from '../src/producers/_internal/buildLayeredOpenings.js';
import { computeStations } from '../src/producers/_internal/buildCurvedLayer.js';
import { resolveMiters } from '../src/producers/_internal/resolveMiters.js';
import { concatRaw } from '../src/producers/_internal/rawGeometry.js';
import { serializeDescriptor } from '../src/producers/_internal/serializeDescriptor.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';
import { approxEq } from '../src/math/scalar.js';
import { getFixture } from './__configs__/index.js';

describe('WallPath', () => {
  it('linear path returns 2 points', () => {
    const pts = pathToPolyline({
      kind: 'Line',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 0, z: 0 },
    });
    expect(pts).toHaveLength(2);
  });
  it('arc path returns segments+1 points', () => {
    const pts = pathToPolyline({
      kind: 'Arc',
      start: { x: 0, y: 0, z: 0 },
      control: { x: 5, y: 0, z: 5 },
      end: { x: 10, y: 0, z: 0 },
    }, 16);
    expect(pts).toHaveLength(17);
  });
  it('arc-length monotonic + distanceToT round-trips', () => {
    const pts = pathToPolyline({
      kind: 'Arc',
      start: { x: 0, y: 0, z: 0 },
      control: { x: 5, y: 0, z: 5 },
      end: { x: 10, y: 0, z: 0 },
    }, 16);
    const ls = computeArcLengths(pts);
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThanOrEqual(ls[i - 1]!);
    const total = ls[ls.length - 1]!;
    const tMid = distanceToT(ls, total / 2);
    expect(tMid).toBeGreaterThan(0);
    expect(tMid).toBeLessThan(1);
  });
});

describe('buildMiterPrism', () => {
  it('emits 36 vertices (12 tri × 3) with no NaNs', () => {
    const raw = buildMiterPrism(
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      0.1, 2.5, 0,
      null, null,
    );
    expect(raw.positions).toHaveLength(36 * 3);
    expect(raw.normals).toHaveLength(36 * 3);
    for (const v of raw.positions) expect(Number.isFinite(v)).toBe(true);
  });

  it('miterAngleToNormal returns a unit vector', () => {
    const n = miterAngleToNormal(1, 0, Math.PI / 4);
    expect(approxEq(Math.hypot(n.nx, n.nz), 1)).toBe(true);
  });
});

describe('projectCapVertex', () => {
  it('zero-tangent dot returns the input vertex', () => {
    const [x, z] = projectCapVertex(1, 0, 0, 0, 1, 0, { nx: 0, nz: 1 });
    expect([x, z]).toEqual([1, 0]);
  });
  it('projects onto a plane along tangent', () => {
    const [x, z] = projectCapVertex(1, 1, 0, 0, 1, 0, { nx: 1, nz: 0 });
    expect(approxEq(x, 0)).toBe(true);
    expect(z).toBe(1);
  });
});

describe('computeOpeningWorldPos', () => {
  it('places opening centre at offset along baseline + level Y', () => {
    const out = computeOpeningWorldPos(
      [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
      { offset: 4, height: 2, sillHeight: 0.5 },
      3,
    );
    expect(approxEq(out.worldCenter.x, 4)).toBe(true);
    expect(approxEq(out.worldCenter.y, 3 + 0.5 + 1)).toBe(true);
    expect(out.wallDir).toEqual({ x: 1, y: 0, z: 0 });
  });
});

describe('composeMaterialKey', () => {
  it('is deterministic for identical input', () => {
    const a = composeMaterialKey({ systemTypeId: 'sys1', materialColor: '#FF0000' });
    const b = composeMaterialKey({ systemTypeId: 'sys1', materialColor: '#ff0000' });
    expect(a).toBe(b);
  });
  it('differs for different inputs', () => {
    const a = composeMaterialKey({ materialColor: '#ff0000' });
    const b = composeMaterialKey({ materialColor: '#00ff00' });
    expect(a).not.toBe(b);
  });
});

describe('composeWallGeometryHash', () => {
  it('matches for identical inputs', () => {
    const f = getFixture('straight-single-no-op');
    const a = composeWallGeometryHash(f.wall, f.joinData, f.worldY);
    const b = composeWallGeometryHash(f.wall, f.joinData, f.worldY);
    expect(a).toBe(b);
  });
  it('differs when worldY changes', () => {
    const f = getFixture('straight-single-no-op');
    const a = composeWallGeometryHash(f.wall, f.joinData, 0);
    const b = composeWallGeometryHash(f.wall, f.joinData, 5);
    expect(a).not.toBe(b);
  });
});

describe('clusterOpenings', () => {
  it('groups overlapping openings', () => {
    const op = (offset: number, width: number) => ({
      id: `o${offset}`, type: 'window' as const,
      offset, width, height: 1, sillHeight: 1, elementId: 'e' + offset,
    });
    const clusters = clusterOpenings([op(1, 1), op(1.4, 1), op(5, 1)]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.openings).toHaveLength(2);
  });
});

describe('computeStations', () => {
  it('returns segments+1 stations with unit normals', () => {
    const stations = computeStations(
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 2, y: 0, z: 1 },
      8,
    );
    expect(stations).toHaveLength(9);
    for (const s of stations) {
      expect(approxEq(Math.hypot(s.nx, s.nz), 1)).toBe(true);
    }
  });
});

describe('resolveMiters', () => {
  it('returns null caps when no joins', () => {
    expect(resolveMiters(1, 0, {})).toEqual({ start: null, end: null });
  });
  it('produces unit normals from angle', () => {
    const r = resolveMiters(1, 0, {
      start: { miterAngleRad: Math.PI / 4, neighbourId: 'wall:1' as never },
    });
    expect(r.start).not.toBeNull();
    expect(approxEq(Math.hypot(r.start!.nx, r.start!.nz), 1)).toBe(true);
  });
});

describe('serializeDescriptor', () => {
  it('packs raw → descriptor with sequential index + materials deduped', () => {
    const k = asMaterialKey('m');
    const tri = {
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    };
    const desc = serializeDescriptor(
      concatRaw([
        { geometry: tri, materialKey: k },
        { geometry: tri, materialKey: k },
      ]),
      'h:test',
    );
    expect(desc.materialKeys).toEqual([k]);
    expect(desc.groups).toHaveLength(2);
    expect(desc.index.length).toBe(6);
    expect(desc.position.length).toBe(18);
  });
});
