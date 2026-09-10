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
import { classify, exitCodeFor, layerVerdict, lonLatToTile, manifestClaims, samplePoints } from '../verify-published-region.mjs';

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

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ §ABSENCE-IS-A-FINDING (L-13271, lane DELAWARE-DETAIL 2026-09-10) — the per-LAYER roll-up.
//
// ⛔ THE DEFECT THESE ARMS PIN, and it was in this tool's own verdict block, not in `classify`.
// The "did this run establish anything?" guard read `if (informative.length === 0)` over EVERY ROW
// OF THE WHOLE RUN. One informative row anywhere skipped the guard, and every other layer's rows —
// `not-published` among them, i.e. STAGED BYTES EXIST AND THE LIVE ARCHIVE HAS NONE — fell through
// to `✔ CARRIED … 0 lost` and exit 0. Measured on the run that found it:
//     35 samples · 1 carried (buildings) · 14 not-published · 6 claim-unknown  →  RC=0
// while roads, water, landuse and parks were absent from the live map entirely.
//
// ⭐ THE AXIS IS THE LESSON (memory `gate-blind-on-the-wrong-axis`). Nothing here was arithmetically
// wrong: `classify` was right, every row was right, and "did the merge LOSE anything?" was answered
// correctly — a layer that was never published loses nothing. The error is that a PER-RUN aggregate
// answered a PER-LAYER question, letting one layer's evidence discharge another layer's burden.
// A count can be right while the population is wrong.
//
// ⛔ AND IT IS THE L-581 / L-616 COLLAPSE COMMITTED BY THE INSTRUMENT: `agree-empty` (genuinely no
// tile in either archive) and `not-published` (baked, staged, and NOT on the map) are different
// facts, exactly one of which is fine, and they shared an exit code.
// ─────────────────────────────────────────────────────────────────────────────
describe('§ABSENCE-IS-A-FINDING — the verdict is per LAYER, and an emptiness is not a pass', () => {
    const row = (verdict: string, staged: number | null = null) => ({ verdict, staged });

    it('⛔ THE REGRESSION ARM — a layer with staged bytes and nothing live is NOT-PUBLISHED, not a pass', () => {
        // The exact shape of the four Delaware layers: every sample has bytes staged, none live.
        const v = layerVerdict([row('not-published', 185), row('not-published', 732), row('not-published', 1918)]);
        expect(v.state).toBe('NOT-PUBLISHED');
        expect(v.absent).toBe(3);
        expect(v.informative).toBe(0);
        expect(v.stagedBytes).toBe(185 + 732 + 1918);
        expect(exitCodeFor([v.state])).toBe(4);
        expect(exitCodeFor([v.state])).not.toBe(0);
    });

    it('`claim-unknown` is the SAME finding — the manifest cannot answer, but the bytes still are not there', () => {
        // roads/water/landuse carried no per-layer `regions` record at all, so every absence came
        // back `claim-unknown`. That is a statement about the MANIFEST, not about the archive: the
        // staged tile exists and the live one does not either way.
        const v = layerVerdict([row('claim-unknown', 880), row('claim-unknown', 10834)]);
        expect(v.state).toBe('NOT-PUBLISHED');
        expect(exitCodeFor([v.state])).toBe(4);
    });

    it('⭐ THE AXIS ARM — one CARRIED layer does not discharge another layer\'s absence', () => {
        // This is the whole bug, reproduced as a run: buildings carried, four layers absent.
        const states = [
            layerVerdict([row('carried', 430), row('agree-empty'), row('agree-empty')]).state,
            layerVerdict([row('not-published', 880)]).state,
            layerVerdict([row('claim-unknown', 329)]).state,
            layerVerdict([row('claim-unknown', 481)]).state,
            layerVerdict([row('not-published', 165)]).state,
        ];
        expect(states[0]).toBe('CARRIED');
        expect(states.filter((s) => s === 'NOT-PUBLISHED')).toHaveLength(4);
        // ⛔ The old code exited 0 on exactly this input.
        expect(exitCodeFor(states)).toBe(4);
    });

    it('a HALF-published layer is PARTIAL, and PARTIAL outranks its own good half', () => {
        // A layer must never be reported by the samples that happened to work.
        const v = layerVerdict([row('carried', 182), row('not-published', 732)]);
        expect(v.state).toBe('PARTIAL');
        expect(v.informative).toBe(1);
        expect(v.absent).toBe(1);
        expect(exitCodeFor([v.state])).toBe(4);
    });

    it('⛔ `agree-empty` and `not-published` do NOT share a value — the L-581/L-616 rule', () => {
        // Genuinely empty in both archives: nothing was baked here, so nothing can be missing.
        const empty = layerVerdict([row('agree-empty'), row('agree-empty')]);
        // Baked and not shipped.
        const absent = layerVerdict([row('not-published', 185)]);
        expect(empty.state).toBe('NO-VERDICT');
        expect(absent.state).toBe('NOT-PUBLISHED');
        expect(empty.state).not.toBe(absent.state);
        expect(exitCodeFor([empty.state])).toBe(2);   // nothing established
        expect(exitCodeFor([absent.state])).toBe(4);  // established that it is NOT there
        expect(exitCodeFor([empty.state])).not.toBe(exitCodeFor([absent.state]));
    });

    it('LOST still outranks everything — corruption is not downgraded to an absence', () => {
        const v = layerVerdict([row('LOST', 182), row('not-published', 96)]);
        expect(v.state).toBe('LOST');
        expect(exitCodeFor(['LOST', 'NOT-PUBLISHED', 'CARRIED'])).toBe(1);
    });

    it('a genuinely carried layer still passes, and the informative count is on the verdict', () => {
        // rail at Newark DE and trees at Wilmington/Dover, measured 2026-09-10.
        const v = layerVerdict([row('carried', 1066), row('agree-empty'), row('agree-empty')]);
        expect(v.state).toBe('CARRIED');
        expect(v.informative).toBe(1);
        expect(v.samples).toBe(3);
        expect(exitCodeFor([v.state])).toBe(0);
    });

    it('exit 0 requires EVERY layer to have carried — not merely one of them', () => {
        expect(exitCodeFor(['CARRIED'])).toBe(0);
        expect(exitCodeFor(['CARRIED', 'CARRIED'])).toBe(0);
        expect(exitCodeFor(['CARRIED', 'NO-VERDICT'])).toBe(2);
        expect(exitCodeFor(['CARRIED', 'UNREACHABLE'])).toBe(2);
        expect(exitCodeFor(['CARRIED', 'NOT-PUBLISHED'])).toBe(4);
        expect(exitCodeFor(['CARRIED', 'PARTIAL'])).toBe(4);
        expect(exitCodeFor(['CARRIED', 'NOT-PUBLISHED', 'LOST'])).toBe(1);
    });

    // ⭐ SCRAMBLE CONTROL (L-586). The arms above must reject the OLD behaviour, not merely describe
    // the new one. `oldVerdict` is the retired per-run aggregate, transcribed exactly: informative
    // counted across the WHOLE RUN, and `not-published` reachable only when informative hit zero.
    it('SCRAMBLE CONTROL — the retired per-RUN aggregate returns 0 on the very input that motivated this', () => {
        const oldVerdict = (allRows: Array<{ verdict: string }>): number => {
            const lost = allRows.filter((r) => r.verdict === 'LOST');
            const informative = allRows.filter(
                (r) => r.verdict === 'carried' || r.verdict === 're-encoded' || r.verdict === 'LOST');
            if (lost.length > 0) return 1;
            if (informative.length === 0) return 2;
            return 0;                                    // ⛔ the pass that hid four missing layers
        };
        // The measured run: 1 carried, 14 not-published, 6 claim-unknown, 14 agree-empty.
        const measured = [
            { verdict: 'carried' },
            ...Array.from({ length: 14 }, () => ({ verdict: 'not-published' })),
            ...Array.from({ length: 6 }, () => ({ verdict: 'claim-unknown' })),
            ...Array.from({ length: 14 }, () => ({ verdict: 'agree-empty' })),
        ];
        expect(measured).toHaveLength(35);
        // The control: the old shape PASSES this, which is why the founder was told it was live.
        expect(oldVerdict(measured)).toBe(0);
        // The new shape, given the same rows grouped by layer, REFUSES.
        const grouped = [
            layerVerdict([{ verdict: 'carried', staged: 430 }]).state,
            layerVerdict([{ verdict: 'not-published', staged: 880 }]).state,
            layerVerdict([{ verdict: 'claim-unknown', staged: 329 }]).state,
        ];
        expect(exitCodeFor(grouped)).toBe(4);
        expect(exitCodeFor(grouped)).not.toBe(oldVerdict(measured));
    });

    it('SCRAMBLE CONTROL — the roll-up is not vacuously strict either', () => {
        // A rule that refused everything would also "catch" the bug and would be useless. An
        // all-carried run must still be 0, and a genuinely empty sample must still be 2, not 4.
        expect(exitCodeFor([layerVerdict([{ verdict: 'carried', staged: 1 }]).state])).toBe(0);
        expect(exitCodeFor([layerVerdict([{ verdict: 'agree-empty', staged: null }]).state])).toBe(2);
        expect(exitCodeFor([layerVerdict([{ verdict: 're-encoded', staged: 182 }]).state])).toBe(0);
    });
});
