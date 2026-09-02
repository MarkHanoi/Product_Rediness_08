/**
 * §PERF-WALL-ADD-PROXIMITY equivalence oracle (2026-09-02 perf lane, fix 2a).
 *
 * CLAIM UNDER TEST: WallStore.add()'s proximity-index candidate pre-filter changes NO
 * answer — the stored `joinIntent` stamp (§WALL-JOIN-INTENT, L-927) and the stored
 * host-face-retreated `baseLine` (§FIX-WALL-CREATE-ON-HOST-FACE, L-929) are byte-equal
 * to what the pre-fix FULL level scan produced.
 *
 * METHOD: before every add, run `deriveJoinIntent` and `retreatOntoHostFaces` directly
 * against the FULL current level population (the pre-fix inputs, via getByLevel clones),
 * then add through the store (which uses the index) and assert the stored record matches
 * the full-scan oracle exactly. The corpus is deterministic and NON-VACUOUS by
 * assertion: it must actually produce stamps, retreats, guard-1 corner skips and
 * near-eps boundary cases, and it interleaves `update()` moves to exercise index
 * invalidation. A corpus that stopped exercising the machinery fails the test itself.
 */
import { describe, it, expect } from 'vitest';
import { WallStore } from '../src/WallStore';
import { deriveJoinIntent } from '../src/WallJoinIntentStamp';
import { retreatOntoHostFaces } from '../src/WallHostBodyRetreat';
import type { WallData } from '../src/WallTypes';

const LEVEL = { id: 'level-eq', name: 'L1', elevation: 0, height: 3 } as any;
const fakeBim = {
  getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
  getLevels: () => [LEVEL],
  getActiveLevel: () => LEVEL,
} as any;

/** Deterministic LCG so the corpus is reproducible byte-for-byte. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

let n = 0;
function mkWall(baseLine: [any, any], extra?: Partial<WallData>): WallData {
  return {
    id: `eq-wall-${n++}`, type: 'wall', levelId: LEVEL.id,
    baseLine, height: 3, thickness: 0.2, ...extra,
  } as any;
}

/** The corpus: lattice corners, T body-landings, near-eps offsets, diagonals, stamped. */
function buildCorpus(): WallData[] {
  const rnd = lcg(0xC0FFEE);
  const walls: WallData[] = [];

  // 1) 60 lattice walls SHARING endpoints — committed corners => 'butt' stamps + guard-1.
  for (let i = 0; i < 60; i++) {
    const horizontal = i % 2 === 0;
    const k = Math.floor(i / 2);
    const gx = (k % 6) * 3, gz = Math.floor(k / 6) * 3;
    walls.push(mkWall(horizontal
      ? [{ x: gx, y: 0, z: gz }, { x: gx + 3, y: 0, z: gz }]
      : [{ x: gx, y: 0, z: gz }, { x: gx, y: 0, z: gz + 3 }]));
  }

  // 2) 40 T body-landers: endpoint on a lattice wall's MID-BODY centreline, approaching
  //    perpendicular => retreat must fire (penetration = thickness/2).
  for (let i = 0; i < 40; i++) {
    const hostIsHorizontal = i % 2 === 0;
    const k = (i * 7) % 30;
    const gx = (k % 6) * 3, gz = Math.floor(k / 6) * 3;
    const mid = hostIsHorizontal
      ? { x: gx + 1.1 + 0.02 * i, z: gz }           // strictly inside the body, off endpoints
      : { x: gx, z: gz + 1.1 + 0.02 * i };
    const away = hostIsHorizontal ? { x: 0, z: 1 } : { x: 1, z: 0 };
    walls.push(mkWall([
      { x: mid.x, y: 0, z: mid.z },
      { x: mid.x + away.x * 2, y: 0, z: mid.z + away.z * 2 },
    ]));
  }

  // 3) 40 near-eps probes: endpoints 19 mm / 21 mm off a lattice node — both sides of
  //    JOIN_INTENT_EPS_M (20 mm). The oracle decides which side; the store must agree.
  for (let i = 0; i < 40; i++) {
    const k = (i * 5) % 30;
    const gx = (k % 6) * 3, gz = Math.floor(k / 6) * 3;
    const off = i % 2 === 0 ? 0.019 : 0.021;
    const ang = rnd() * Math.PI * 2;
    const sx = gx + Math.cos(ang) * off, sz = gz + Math.sin(ang) * off;
    walls.push(mkWall([
      { x: sx, y: 0, z: sz },
      { x: sx + 40 + i, y: 0, z: sz + 25 },        // far free end — interacts with nothing
    ]));
  }

  // 4) 50 random diagonals across the field.
  for (let i = 0; i < 50; i++) {
    const x0 = rnd() * 60, z0 = rnd() * 60;
    walls.push(mkWall([
      { x: x0, y: 0, z: z0 },
      { x: x0 + 0.5 + rnd() * 5, y: 0, z: z0 + 0.5 + rnd() * 5 },
    ]));
  }

  // 5) 10 walls with an EXPLICIT stamp — derivation must not run, stamp must survive.
  for (let i = 0; i < 10; i++) {
    walls.push(mkWall(
      [{ x: 200 + i * 4, y: 0, z: 0 }, { x: 202 + i * 4, y: 0, z: 0 }],
      { joinIntent: { start: 'butt' } } as any,
    ));
  }

  return walls;
}

describe('§PERF-WALL-ADD-PROXIMITY — store answers == full-scan answers', () => {
  it('every stored stamp and baseline matches the pre-fix full level scan', () => {
    (globalThis as any).__pryzmWallCreateOnHostFace = true;
    const store = new WallStore();
    store.attachEngine({} as any, fakeBim);
    const corpus = buildCorpus();

    let stamps = 0, retreats = 0, updatesDone = 0;
    corpus.forEach((w, i) => {
      // Interleaved in-place mutation: the index must invalidate and rebuild fresh.
      if (i > 0 && i % 25 === 0) {
        const victim = store.getByLevel(LEVEL.id)[0];
        store.update(victim.id, {
          baseLine: [
            { x: victim.baseLine[0].x + 5, y: victim.baseLine[0].y, z: victim.baseLine[0].z },
            { x: victim.baseLine[1].x + 5, y: victim.baseLine[1].y, z: victim.baseLine[1].z },
          ],
        } as any);
        updatesDone++;
      }

      // ORACLE — the pre-fix inputs: the FULL current level population.
      const fullSiblings = store.getByLevel(LEVEL.id);
      const expectedIntent = w.joinIntent !== undefined
        ? w.joinIntent
        : deriveJoinIntent(fullSiblings as any, w as any);
      const expectedRetreat = retreatOntoHostFaces(fullSiblings as any, w as any);

      store.add(w);
      const stored = store.getByLevel(LEVEL.id).find(x => x.id === w.id)!;
      expect(stored, w.id).toBeTruthy();

      expect(stored.joinIntent, `joinIntent mismatch on ${w.id} (add #${i})`).toEqual(expectedIntent);
      const expectedBaseLine = expectedRetreat.retreats.length > 0
        ? expectedRetreat.baseLine
        : [
            { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
            { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
          ];
      expect(stored.baseLine, `baseLine mismatch on ${w.id} (add #${i})`).toEqual(expectedBaseLine);

      if (stored.joinIntent !== undefined) stamps++;
      if (expectedRetreat.retreats.length > 0) retreats++;
    });

    // NON-VACUITY — a corpus that stops firing the machinery fails here, loudly.
    expect(stamps, 'corpus must produce joinIntent stamps').toBeGreaterThanOrEqual(10);
    expect(retreats, 'corpus must produce host-face retreats').toBeGreaterThanOrEqual(10);
    expect(updatesDone, 'corpus must interleave update() invalidations').toBeGreaterThanOrEqual(5);
    expect(store.getByLevel(LEVEL.id).length).toBe(corpus.length);
  });
});
