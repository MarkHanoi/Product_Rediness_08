// level-scoped-renderers unit tests (S33 — Contract 44 G1, G2, G3).

import { describe, expect, it } from 'vitest';
import {
  scopeToLevel,
  scopeToActiveLevels,
  scopeToLinkedModel,
  levelOfDoor,
  indexWallsById,
} from '../src/level-scoped-renderers.js';

interface FakeWall { id: string; levelId: string }
interface FakeStruct { id: string; levelId: string }
interface FakeDoor { id: string; wallId: string }

describe('scopeToLevel', () => {
  it('returns walls in the active level only (G1)', () => {
    const walls: FakeWall[] = [
      { id: 'w1', levelId: 'L1' },
      { id: 'w2', levelId: 'L2' },
      { id: 'w3', levelId: 'L1' },
    ];
    const out = scopeToLevel(walls, 'L1', (w) => w.levelId);
    expect(out.map((w) => w.id)).toEqual(['w1', 'w3']);
  });

  it('isolates structural elements from other levels (G2)', () => {
    const struct: FakeStruct[] = [
      { id: 'col-1', levelId: 'L1' },
      { id: 'col-2', levelId: 'L2' },
      { id: 'beam-1', levelId: 'L1' },
    ];
    const out = scopeToLevel(struct, 'L2', (s) => s.levelId);
    expect(out.map((s) => s.id)).toEqual(['col-2']);
  });

  it('returns empty when no element matches', () => {
    expect(scopeToLevel<FakeWall>([], 'L1', (w) => w.levelId)).toEqual([]);
  });
});

describe('scopeToActiveLevels', () => {
  it('includes elements from the active level OR linked levels (G3)', () => {
    const walls: FakeWall[] = [
      { id: 'w-local', levelId: 'L1' },
      { id: 'w-linkA', levelId: 'linkedA:L1' },
      { id: 'w-linkB', levelId: 'linkedB:L0' },
      { id: 'w-other', levelId: 'L2' },
    ];
    const out = scopeToActiveLevels(walls, 'L1', ['linkedA:L1', 'linkedB:L0'], (w) => w.levelId);
    expect(out.map((w) => w.id).sort()).toEqual(['w-linkA', 'w-linkB', 'w-local']);
  });

  it('empty linked-set degrades to scopeToLevel semantics', () => {
    const walls: FakeWall[] = [
      { id: 'w1', levelId: 'L1' },
      { id: 'w2', levelId: 'L2' },
    ];
    const out = scopeToActiveLevels(walls, 'L1', [], (w) => w.levelId);
    expect(out.map((w) => w.id)).toEqual(['w1']);
  });
});

describe('scopeToLinkedModel', () => {
  it('returns elements whose levelId starts with `<prefix>:`', () => {
    const walls: FakeWall[] = [
      { id: 'wA', levelId: 'linkedA:L1' },
      { id: 'wB', levelId: 'linkedB:L0' },
      { id: 'wA2', levelId: 'linkedA:L2' },
      { id: 'wLocal', levelId: 'L1' },
    ];
    const out = scopeToLinkedModel(walls, 'linkedA', (w) => w.levelId);
    expect(out.map((w) => w.id).sort()).toEqual(['wA', 'wA2']);
  });

  it('does NOT match a level id whose prefix is a STRING-prefix without colon', () => {
    // 'linkedA-extra:L1' starts with 'linkedA' as a string but the colon
    // disambiguates — we MUST NOT match it.
    const walls: FakeWall[] = [{ id: 'w1', levelId: 'linkedA-extra:L1' }];
    expect(scopeToLinkedModel(walls, 'linkedA', (w) => w.levelId)).toHaveLength(0);
  });
});

describe('levelOfDoor', () => {
  it('resolves the door to its host wall’s level', () => {
    const walls: FakeWall[] = [
      { id: 'w1', levelId: 'L1' },
      { id: 'w2', levelId: 'L2' },
    ];
    const idx = indexWallsById(walls);
    const d: FakeDoor = { id: 'd1', wallId: 'w2' };
    expect(levelOfDoor(d.wallId, idx)).toBe('L2');
  });

  it('returns undefined when the host wall is unknown (G2 defence-in-depth)', () => {
    const idx = indexWallsById<FakeWall>([]);
    expect(levelOfDoor('w-missing', idx)).toBeUndefined();
  });
});
