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
import { classify, lonLatToTile, manifestClaims, samplePoints } from '../verify-published-region.mjs';

describe('§PUBLISH-FIDELITY classify', () => {
  it('calls it LOST when the staged archive has the tile and the live one does not', () => {
    // The defect the tool is named after: the merge listed the region and did not carry its bytes.
    expect(classify(182, null, true)).toBe('LOST');
    expect(classify(1, null, true)).toBe('LOST');
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

  // ── the THREE-VALUED claim, and both bugs it fixed ────────────────────────
  // The tool shipped accusing its own pipeline. Twice, differently, and both are pinned here.

  it('⛔ a layer NOT YET MERGED for the region is not-published, NEVER lost', () => {
    // BUG 1, measured 2026-09-09: `--layers roads` printed "LOST — staged has 6602 B … The merge
    // listed this region but did not carry its bytes." No roads merge had run. Reporting
    // NOT-YET-DONE as DATA LOSS would send someone hunting a corruption that does not exist.
    expect(classify(6602, null, false)).toBe('not-published');
    expect(classify(null, null, false)).toBe('not-published');
  });

  it('⛔ an UNKNOWN claim is never LOST either — the second bug, and the subtler one', () => {
    // BUG 2: the first fix used a BOOLEAN and fell back to the tileset-wide `regions` list when a
    // layer had no record of its own. That list is rewritten by EVERY merge, so one trees publish
    // put `delaware` in it and `roads` — carried forward untouched since 2026-09-04 and holding no
    // Delaware byte — became "claimed" and went straight back to LOST. Unknown is its own answer.
    expect(classify(6602, null, 'unknown')).toBe('claim-unknown');
    expect(classify(10834, null, 'unknown')).toBe('claim-unknown');
  });

  it('manifestClaims returns TRUE / FALSE / "unknown" and never guesses from the tileset-wide list', () => {
    // Shaped from the real live manifest on 2026-09-09, after the trees publish: the top-level
    // `regions` block contains delaware, `trees` has its own 47-entry record, `parks` has a stale
    // 49-entry record without delaware, and `roads` is carriedForward with NO regions array.
    const m = {
      regions: { delaware: {}, spain: {} },                      // ← the trap: delaware IS here
      layers: {
        trees: { regions: ['delaware', 'spain'] },
        parks: { regions: ['spain'], carriedForward: true },
        roads: { sources: ['spain'], carriedForward: true },     // no `regions` at all
      },
    };
    expect(manifestClaims(m, 'trees', 'delaware')).toBe(true);
    expect(manifestClaims(m, 'parks', 'delaware')).toBe(false);
    // ⛔ NOT true — the top-level list describes a different merge. This is the assertion that
    // stops the tileset-wide fallback from being reintroduced.
    expect(manifestClaims(m, 'roads', 'delaware')).toBe('unknown');
    // a layer that is not live at all cannot claim anything
    expect(manifestClaims(m, 'sea', 'delaware')).toBe(false);
    expect(manifestClaims(null, 'trees', 'delaware')).toBe(false);
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
