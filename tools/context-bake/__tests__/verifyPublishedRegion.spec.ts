// ─────────────────────────────────────────────────────────────────────────────
// §PUBLISH-FIDELITY — the classifier that decides whether a merge carried a region's bytes.
//
// This is the whole decision of verify-published-region.mjs, and the reason it exists is that
// neither existing gate can see the failure it names: merge-tiles.mjs's no-loss gate compares
// region NAME SETS, and context-merge-publish.yml's assertion checks archive SIZE and MAGIC. An
// archive that is 25 GB of everyone else, listing `delaware` in its manifest and containing no
// Delaware tile, passes both.
//
// TWO RULES ARE BOUND, and the second is the one that keeps the tool honest:
//   1. staged has a tile, live does not  ->  LOST. That is the defect, and it must be loud.
//   2. a tile that could not be READ is `unreachable` and must NEVER be classified LOST. A flaky
//      CDN reported as a lost region is the L-581/L-616 failure-vs-emptiness collapse, and it would
//      send someone re-running a 3-hour merge to fix a network blip.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain-Node ESM tool, no d.ts.
import { classify, lonLatToTile, samplePoints } from '../verify-published-region.mjs';

describe('§PUBLISH-FIDELITY classify', () => {
  it('calls it LOST when the staged archive has the tile and the live one does not', () => {
    // The defect the tool is named after: the merge listed the region and did not carry its bytes.
    expect(classify(182, null)).toBe('LOST');
    expect(classify(1, null)).toBe('LOST');
  });

  it('calls it carried only when both hold a tile of the SAME length', () => {
    // Measured 2026-09-09: Wilmington's trees tile is 182 B staged and 182 B live.
    expect(classify(182, 182)).toBe('carried');
    expect(classify(76, 76)).toBe('carried');
  });

  it('distinguishes a RE-ENCODED tile from a carried one instead of calling both fine', () => {
    // tile-join re-merges border tiles shared with a neighbouring region, so a differing length is
    // expected at a frontier and suspicious inland. Collapsing it into `carried` would hide that.
    expect(classify(182, 200)).toBe('re-encoded');
    expect(classify(200, 182)).toBe('re-encoded');
  });

  it('agrees on an empty tile rather than reporting a loss', () => {
    // Rural Sussex maps no individual trees; both archives are honestly empty there.
    expect(classify(null, null)).toBe('agree-empty');
  });

  it('⛔ NEVER reports an unreachable read as LOST — the load-bearing arm', () => {
    // Either side unreachable, in either order, with any counterpart. If any of these returned
    // 'LOST', a CDN blip would be reported as a merge that dropped a region.
    expect(classify('unreachable', null)).toBe('unreachable');
    expect(classify(null, 'unreachable')).toBe('unreachable');
    expect(classify('unreachable', 182)).toBe('unreachable');
    expect(classify(182, 'unreachable')).toBe('unreachable');
    expect(classify('unreachable', 'unreachable')).toBe('unreachable');
  });

  it('marks a tile only the live archive has as live-only, not as carried', () => {
    // Another region's tile at these coordinates. It says nothing about THIS region's publish.
    expect(classify(null, 3878)).toBe('live-only');
  });
});

describe('§PUBLISH-FIDELITY sampling', () => {
  it('samples the bbox INTERIOR, never its corners', () => {
    // A corner of a national bbox is usually sea or another country, and an all-empty sample proves
    // nothing — which the tool treats as "no verdict", so bad sampling would make it useless.
    const bbox = [-75.79, 38.45, -74.98, 39.85];
    const pts = samplePoints(bbox);
    expect(pts).toHaveLength(5);
    for (const [lon, lat] of pts) {
      expect(lon).toBeGreaterThan(bbox[0]);
      expect(lon).toBeLessThan(bbox[2]);
      expect(lat).toBeGreaterThan(bbox[1]);
      expect(lat).toBeLessThan(bbox[3]);
    }
    // and one of them is the centre
    expect(pts[0][0]).toBeCloseTo((bbox[0] + bbox[2]) / 2, 6);
    expect(pts[0][1]).toBeCloseTo((bbox[1] + bbox[3]) / 2, 6);
  });

  it('converts lon/lat to the Web-Mercator tile the client reads', () => {
    // Pinned against tiles this lane actually fetched from R2 on 2026-09-09.
    expect(lonLatToTile(-75.5466, 39.7459, 16)).toEqual([19015, 24870]); // Wilmington
    expect(lonLatToTile(-75.5244, 39.1582, 16)).toEqual([19019, 25009]); // Dover
    expect(lonLatToTile(-75.089744, 38.781987, 16)).toEqual([19098, 25097]); // the demo site
    expect(lonLatToTile(2.1686, 41.3874, 16)).toEqual([33162, 24477]); // Barcelona control
  });
});
