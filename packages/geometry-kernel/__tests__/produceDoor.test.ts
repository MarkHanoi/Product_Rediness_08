// produceDoor — descriptor-shape & invariant tests (S11-T1).

import { describe, expect, it } from 'vitest';
import {
  produceDoor,
  composeDoorGeometryHash,
  assertValidDescriptor,
  type DoorWorldPlacement,
} from '../src/index.js';
import { Door, createId } from '@pryzm/schemas';

function mkDoor(o: Partial<import('@pryzm/schemas').Door> = {}) {
  return Door.parse({
    id: createId('door'),
    wallId: createId('wall'),
    openingId: 'op_1',
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    offset: 0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...o,
  });
}

const STD_PLACEMENT: DoorWorldPlacement = Object.freeze({
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
});

describe('produceDoor — descriptor invariants', () => {
  it('produces a descriptor that passes assertValidDescriptor', () => {
    const door = mkDoor();
    const desc = produceDoor(door, STD_PLACEMENT);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
  });

  it('emits 2 material slots (frame + leaf) and 2 groups', () => {
    const door = mkDoor();
    const desc = produceDoor(door, STD_PLACEMENT);
    expect(desc.materialKeys).toHaveLength(2);
    expect(desc.materialKeys[0]).toMatch(/^door\|.*\|frame$/);
    expect(desc.materialKeys[1]).toMatch(/^door\|.*\|leaf$/);
    expect(desc.groups).toHaveLength(2);
    expect(desc.groups[0]!.materialIndex).toBe(0);
    expect(desc.groups[1]!.materialIndex).toBe(1);
  });

  it('embeds frame & leaf colors in material keys', () => {
    const door = mkDoor({ frameColor: '#112233', leafColor: '#aabbcc' });
    const desc = produceDoor(door, STD_PLACEMENT);
    expect(desc.materialKeys[0]).toContain('#112233');
    expect(desc.materialKeys[1]).toContain('#aabbcc');
  });

  it('produces a deterministic hash (same inputs → same hash)', () => {
    const door = mkDoor();
    const a = produceDoor(door, STD_PLACEMENT).hash;
    const b = produceDoor(door, STD_PLACEMENT).hash;
    const c = composeDoorGeometryHash(door, STD_PLACEMENT);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('hash differs when width changes', () => {
    const a = produceDoor(mkDoor({ width: 0.9 }), STD_PLACEMENT).hash;
    const b = produceDoor(mkDoor({ width: 1.0 }), STD_PLACEMENT).hash;
    expect(a).not.toBe(b);
  });

  it('hash differs when placement origin changes', () => {
    const door = mkDoor();
    const a = produceDoor(door, STD_PLACEMENT).hash;
    const b = produceDoor(door, {
      ...STD_PLACEMENT,
      origin: { x: 1, y: 0, z: 0 },
    }).hash;
    expect(a).not.toBe(b);
  });

  it('bounds enclose every position', () => {
    const door = mkDoor();
    const desc = produceDoor(door, STD_PLACEMENT);
    for (let i = 0; i < desc.position.length; i += 3) {
      const x = desc.position[i]!,
        y = desc.position[i + 1]!,
        z = desc.position[i + 2]!;
      expect(x).toBeGreaterThanOrEqual(desc.bounds.min.x - 1e-6);
      expect(x).toBeLessThanOrEqual(desc.bounds.max.x + 1e-6);
      expect(y).toBeGreaterThanOrEqual(desc.bounds.min.y - 1e-6);
      expect(y).toBeLessThanOrEqual(desc.bounds.max.y + 1e-6);
      expect(z).toBeGreaterThanOrEqual(desc.bounds.min.z - 1e-6);
      expect(z).toBeLessThanOrEqual(desc.bounds.max.z + 1e-6);
    }
  });

  it('honours sillHeight by lifting world Y', () => {
    const door = mkDoor({ sillHeight: 0.5 });
    const desc = produceDoor(door, STD_PLACEMENT);
    expect(desc.bounds.min.y).toBeCloseTo(0.5, 5);
  });
});
