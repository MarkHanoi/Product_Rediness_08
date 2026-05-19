// produceWall — openings (7 tests per spec line 678).

import { describe, expect, it } from 'vitest';
import { produceWall } from '../src/producers/wall.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { getFixture } from './__configs__/index.js';
import type { Wall } from '@pryzm/protocol';

describe('produceWall — openings', () => {
  it('1 door hole', () => {
    const f = getFixture('open-1door');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.position.length).toBeGreaterThan(0);
  });

  it('1 window hole', () => {
    const f = getFixture('open-1window');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
  });

  it('2 doors → more vertices than 1 door', () => {
    const a = produceWall(getFixture('open-1door').wall, {}, 0);
    const b = produceWall(getFixture('open-2doors').wall, {}, 0);
    expect(b.position.length).toBeGreaterThan(a.position.length);
  });

  it('door+window combined', () => {
    const f = getFixture('open-door-window');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
    expect(desc.index.length).toBeGreaterThan(0);
  });

  it('opening near wall start (edge case)', () => {
    const f = getFixture('open-edge-start');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
  });

  it('opening near wall end (edge case)', () => {
    const f = getFixture('open-edge-end');
    const desc = produceWall(f.wall, f.joinData, 0);
    assertValidDescriptor(desc);
  });

  it('overlapping openings cluster but still produce valid geometry', () => {
    const base = getFixture('open-1door').wall;
    const o = base.openings[0]!;
    const overlapping: Wall = {
      ...base,
      openings: [
        o,
        { ...o, id: 'o2', offset: o.offset + 0.3, elementId: 'door:OL2' },
      ],
      childrenIds: [o.elementId, 'door:OL2'],
    };
    const desc = produceWall(overlapping, {}, 0);
    assertValidDescriptor(desc);
  });
});
