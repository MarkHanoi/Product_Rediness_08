// ─────────────────────────────────────────────────────────────────────────────
// §CTX-TILE-READ-HONESTY (L-778) — a mostly-failed multi-tile read must not pass as a truthful
// empty neighbourhood.
//
// THE INCIDENT THIS PINS (founder console, 2026-08-10, central Barcelona 41.43562, 2.17929):
//     [gis] §CTX-PMTILES-READER near+far from ONE baked-tile read: 0 near + 0 far (cap 900)
//           of 0 footprint(s).
// — a read reported as SUCCESSFUL served zero footprints, silently degrading the session to
// rate-limited live Overpass (429/504, 117 s of waiting). Probed the SAME DAY against the SAME
// production URL (`/api/context-tiles/buildings.pmtiles?v=L660a`), the tileset held **6,091**
// footprints at that exact coordinate (5,605 measured-lidar), 25/25 tiles present at z16. The data
// was there; the READER's aggregation rule collapsed a mostly-failed read into "nothing is mapped
// here".
//
// WHY: `readContextTileFeatures` declared `unavailable` only when EVERY covering tile failed. A
// tile absent from the archive decodes as an honest `[]` and counts as READ — so ONE absent
// sea/edge tile plus thirty-five failed tiles aggregated to `ok` with 0 features. That is the
// §CONTEXT-DATA-HONESTY defect (failure ≠ empty) at the aggregation level, one level above the
// per-request discrimination the module already got right.
//
// THE RULE, and why it is failure-count-based rather than the metadata-bounds guard that was also
// considered ("tileset bounds cover this bbox AND zoom in range AND 0 features ⇒ degraded"):
// a buildings archive represents "nothing built here" by EMITTING NO TILE, so an all-absent read
// inside the tileset's (country-wide) bounds is exactly what a genuinely rural bbox looks like —
// the bounds guard cannot tell rural truth from loss and would send every truthful rural empty
// back to the third party this subsystem exists to remove. Failed tile reads, by contrast, are an
// unambiguous degradation signal: network/decode failures are never data. So:
//   • any failures + ZERO features            → unavailable (fall back, and say so);
//   • any failures + SOME features            → ok, but the caller must not session-cache it
//     (`tilesFailed` is surfaced for precisely that decision);
//   • no failures                             → ok, cacheable, empty is a real answer.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest';

import { tileReadVerdict } from '../contextTiles';

describe('tileReadVerdict (§CTX-TILE-READ-HONESTY, L-778)', () => {
    it('all tiles failed → unavailable (the pre-existing rule, kept)', () => {
        const v = tileReadVerdict(0, 3, 0);
        expect(v.status).toBe('unavailable');
    });

    it('THE FOUNDER INCIDENT SHAPE: 1 tile read, 35 failed, 0 features → unavailable, never a truthful empty', () => {
        const v = tileReadVerdict(1, 35, 0);
        expect(v.status).toBe('unavailable');
        if (v.status === 'unavailable') {
            // The reason must carry the failure count so the console names the degradation.
            expect(v.reason).toMatch(/35/);
        }
    });

    it('a single failed tile with zero features is still not an empty answer', () => {
        expect(tileReadVerdict(24, 1, 0).status).toBe('unavailable');
    });

    it('clean read with zero features → ok (a genuinely rural/sea bbox is a REAL answer, not a failure)', () => {
        expect(tileReadVerdict(25, 0, 0).status).toBe('ok');
    });

    it('partial failures WITH features → ok (rendering most of the city beats rendering none of it)', () => {
        expect(tileReadVerdict(30, 3, 4200).status).toBe('ok');
    });

    it('no tiles at all, no failures → ok (empty coverage, handled upstream, must not be a failure)', () => {
        expect(tileReadVerdict(0, 0, 0).status).toBe('ok');
    });
});
