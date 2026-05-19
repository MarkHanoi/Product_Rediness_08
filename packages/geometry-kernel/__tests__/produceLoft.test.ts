// produceLoft — descriptor-shape, invariant, and snapshot tests (S53 D2).

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import {
  produceLoft,
  composeLoftHash,
  type LoftProfilePoint,
  type LoftSection,
} from '../src/producers/loft.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';

const SQUARE: LoftProfilePoint[] = [
  { u: -0.5, v: -0.5 },
  { u:  0.5, v: -0.5 },
  { u:  0.5, v:  0.5 },
  { u: -0.5, v:  0.5 },
];

const SQUARE_BIG: LoftProfilePoint[] = SQUARE.map((p) => ({ u: p.u * 2, v: p.v * 2 }));

const TRIANGLE: LoftProfilePoint[] = [
  { u: 0, v: 0 },
  { u: 1, v: 0 },
  { u: 0, v: 1 },
];

const RIGHT = { x: 1, y: 0, z: 0 };
const UP_AXIS = { x: 0, y: 0, z: 1 };

function section(p: LoftProfilePoint[], y: number, scale = 1): LoftSection {
  const profile = p.map((q) => ({ u: q.u * scale, v: q.v * scale }));
  return {
    profile,
    worldOrigin: { x: 0, y, z: 0 },
    right: RIGHT,
    up: UP_AXIS,
  };
}

describe('produceLoft — invariants', () => {
  it('produces a valid descriptor for two square sections', () => {
    const d = produceLoft([section(SQUARE, 0), section(SQUARE, 1)]);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for three sections (small → big → small)', () => {
    const d = produceLoft([
      section(SQUARE, 0, 0.5),
      section(SQUARE, 1, 1.5),
      section(SQUARE, 2, 0.5),
    ]);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('produces a valid descriptor for triangle sections', () => {
    const d = produceLoft([section(TRIANGLE, 0), section(TRIANGLE, 1)]);
    expect(() => assertValidDescriptor(d)).not.toThrow();
  });

  it('open loft emits two end caps; closed loft skips them', () => {
    const N = SQUARE.length;
    const sections = [section(SQUARE, 0), section(SQUARE, 1), section(SQUARE_BIG, 2)];
    const open = produceLoft(sections);
    const closed = produceLoft(sections, { closed: true });
    // Open: side N*M + cap 2*N. Closed: side N*M only.
    expect(open.position.length / 3).toBe(N * sections.length + 2 * N);
    expect(closed.position.length / 3).toBe(N * sections.length);
  });

  it('emits exactly one material group bound to the requested material', () => {
    const d = produceLoft([section(SQUARE, 0), section(SQUARE, 1)], {
      material: asMaterialKey('loft|wood|oak'),
    });
    expect(d.materialKeys).toEqual(['loft|wood|oak']);
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.materialIndex).toBe(0);
    expect(d.groups[0]!.start).toBe(0);
    expect(d.groups[0]!.count).toBe(d.index.length);
  });

  it('uses the default material key when none supplied', () => {
    const d = produceLoft([section(SQUARE, 0), section(SQUARE, 1)]);
    expect(d.materialKeys).toEqual(['loft|default']);
  });

  it('AABB encloses the lofted solid', () => {
    const d = produceLoft([section(SQUARE, 0), section(SQUARE, 1)]);
    expect(d.bounds.min.x).toBeCloseTo(-0.5, 5);
    expect(d.bounds.max.x).toBeCloseTo( 0.5, 5);
    expect(d.bounds.min.y).toBeCloseTo( 0, 5);
    expect(d.bounds.max.y).toBeCloseTo( 1, 5);
  });

  it('produces a deterministic hash (identical inputs → identical hashes)', () => {
    const sections = [section(SQUARE, 0), section(SQUARE, 1)];
    const a = produceLoft(sections);
    const b = produceLoft(sections);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(composeLoftHash(sections, false, asMaterialKey('loft|default')));
  });

  it('produces different hashes for open vs closed lofts', () => {
    const sections = [section(SQUARE, 0), section(SQUARE, 1), section(SQUARE_BIG, 2)];
    const open = produceLoft(sections).hash;
    const closed = produceLoft(sections, { closed: true }).hash;
    expect(open).not.toBe(closed);
  });

  it('returns a frozen descriptor', () => {
    const d = produceLoft([section(SQUARE, 0), section(SQUARE, 1)]);
    expect(Object.isFrozen(d)).toBe(true);
  });
});

describe('produceLoft — input validation', () => {
  it('rejects fewer than 2 sections', () => {
    expect(() => produceLoft([section(SQUARE, 0)])).toThrow(DescriptorInvariantError);
  });

  it('rejects mismatched profile vertex counts across sections', () => {
    const a = section(SQUARE, 0);
    const b: LoftSection = { ...section(TRIANGLE, 1) };
    expect(() => produceLoft([a, b])).toThrow(DescriptorInvariantError);
  });

  it('rejects profiles with fewer than 3 points', () => {
    const tooSmall: LoftSection = {
      profile: [{ u: 0, v: 0 }, { u: 1, v: 0 }],
      worldOrigin: { x: 0, y: 0, z: 0 },
      right: RIGHT,
      up: UP_AXIS,
    };
    expect(() => produceLoft([tooSmall, tooSmall])).toThrow(DescriptorInvariantError);
  });
});

describe('produceLoft — kernel purity (P1)', () => {
  it('source file imports no THREE, no DOM, and no Node primitives', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '../src/producers/loft.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]three['"]/);
    expect(src).not.toMatch(/import \* as THREE/);
    expect(src).not.toMatch(/from ['"]node:/);
    expect(src).not.toMatch(/document\.|window\.|globalThis\./);
  });
});
