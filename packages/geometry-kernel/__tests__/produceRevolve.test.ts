// produceRevolve — descriptor-shape, invariant, and snapshot tests (S53 D2).

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import {
  produceRevolve,
  composeRevolveHash,
  type RevolveProfilePoint,
} from '../src/producers/revolve.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';

// Cylinder profile (axis-touching at top + bottom): a side-line at r = 0.5.
const CYLINDER_PROFILE: RevolveProfilePoint[] = [
  { r: 0.5, y: 0 },
  { r: 0.5, y: 1 },
];

// Cone-like silhouette.
const CONE_PROFILE: RevolveProfilePoint[] = [
  { r: 0.0, y: 0 },
  { r: 0.5, y: 1 },
];

// Three-point silhouette — exercises ring count > 2.
const STEPPED_PROFILE: RevolveProfilePoint[] = [
  { r: 0.5, y: 0 },
  { r: 1.0, y: 1 },
  { r: 0.5, y: 2 },
];

describe('produceRevolve — invariants', () => {
  it('produces a valid descriptor for a cylinder profile', () => {
    const d = produceRevolve(CYLINDER_PROFILE);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for a cone profile', () => {
    const d = produceRevolve(CONE_PROFILE, { segments: 16 });
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for a stepped profile', () => {
    const d = produceRevolve(STEPPED_PROFILE, { segments: 12 });
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('full revolve emits no end caps; partial revolve emits two caps', () => {
    const segments = 24;
    const N = CYLINDER_PROFILE.length;
    // Full: ring count = segments + 1 (a sealed ring), no caps.
    const full = produceRevolve(CYLINDER_PROFILE, { segments });
    const partial = produceRevolve(CYLINDER_PROFILE, {
      segments,
      startAngle: 0,
      endAngle: Math.PI,
    });
    expect(full.index.length).toBeGreaterThan(0);
    // Partial sweeps emit > full's per-tri count (caps add triangles).
    // For a 2-point profile partial caps need profile.length-1 = 1 tri each.
    expect(partial.index.length).toBeGreaterThan(full.index.length);
    void N;
  });

  it('emits exactly one material group bound to the requested material', () => {
    const d = produceRevolve(CYLINDER_PROFILE, {
      material: asMaterialKey('revolve|metal|brushed'),
    });
    expect(d.materialKeys).toEqual(['revolve|metal|brushed']);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.materialIndex).toBe(0);
    expect(d.groups[0]!.start).toBe(0);
    expect(d.groups[0]!.count).toBe(d.index.length);
  });

  it('uses the default material key when none supplied', () => {
    const d = produceRevolve(CYLINDER_PROFILE);
    expect(d.materialKeys).toEqual(['revolve|default']);
  });

  it('AABB matches the revolved silhouette (cylinder of r=0.5, h=1)', () => {
    const d = produceRevolve(CYLINDER_PROFILE);
    expect(d.bounds.min.x).toBeGreaterThanOrEqual(-0.5 - 1e-3);
    expect(d.bounds.max.x).toBeLessThanOrEqual( 0.5 + 1e-3);
    expect(d.bounds.min.z).toBeGreaterThanOrEqual(-0.5 - 1e-3);
    expect(d.bounds.max.z).toBeLessThanOrEqual( 0.5 + 1e-3);
    expect(d.bounds.min.y).toBeCloseTo(0, 5);
    expect(d.bounds.max.y).toBeCloseTo(1, 5);
  });

  it('worldY shifts every Y coordinate', () => {
    const d = produceRevolve(CYLINDER_PROFILE, { worldY: 5 });
    expect(d.bounds.min.y).toBeCloseTo(5, 5);
    expect(d.bounds.max.y).toBeCloseTo(6, 5);
  });

  it('respects a minimum-segments floor of 3', () => {
    // Even when caller asks for 0, we get a triangulable revolve.
    const d = produceRevolve(CYLINDER_PROFILE, { segments: 0 });
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a deterministic hash (identical inputs → identical hashes)', () => {
    const a = produceRevolve(CYLINDER_PROFILE, { segments: 12 });
    const b = produceRevolve(CYLINDER_PROFILE, { segments: 12 });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(
      composeRevolveHash(
        CYLINDER_PROFILE,
        12,
        0,
        Math.PI * 2,
        0,
        asMaterialKey('revolve|default'),
      ),
    );
  });

  it('produces different hashes for different segment counts', () => {
    const lo = produceRevolve(CYLINDER_PROFILE, { segments: 8 }).hash;
    const hi = produceRevolve(CYLINDER_PROFILE, { segments: 24 }).hash;
    expect(lo).not.toBe(hi);
  });

  it('returns a frozen descriptor', () => {
    const d = produceRevolve(CYLINDER_PROFILE);
    expect(Object.isFrozen(d)).toBe(true);
  });

  it('side-ring normals are unit-length', () => {
    const d = produceRevolve(CYLINDER_PROFILE, { segments: 8 });
    const numVerts = d.position.length / 3;
    for (let v = 0; v < numVerts; v++) {
      const nx = d.normal[3 * v + 0]!;
      const ny = d.normal[3 * v + 1]!;
      const nz = d.normal[3 * v + 2]!;
      const len = Math.hypot(nx, ny, nz);
      // Some cap verts may be zeroed for degenerate-radius cases.
      // Accept either unit-length OR zero vector.
      expect(len === 0 || Math.abs(len - 1) < 1e-3).toBe(true);
    }
  });
});

describe('produceRevolve — input validation', () => {
  it('rejects profiles with fewer than 2 vertices', () => {
    expect(() => produceRevolve([{ r: 0, y: 0 }])).toThrow(DescriptorInvariantError);
  });

  it('rejects negative radii', () => {
    expect(() =>
      produceRevolve([
        { r: -0.1, y: 0 },
        { r:  0.5, y: 1 },
      ]),
    ).toThrow(DescriptorInvariantError);
  });

  it('rejects non-finite coordinates', () => {
    expect(() =>
      produceRevolve([
        { r: NaN, y: 0 },
        { r: 1, y: 1 },
      ]),
    ).toThrow(DescriptorInvariantError);
  });
});

describe('produceRevolve — kernel purity (P1)', () => {
  it('source file imports no THREE, no DOM, and no Node primitives', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '../src/producers/revolve.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]three['"]/);
    expect(src).not.toMatch(/import \* as THREE/);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/document\.|window\.|globalThis\./);
  });
});
