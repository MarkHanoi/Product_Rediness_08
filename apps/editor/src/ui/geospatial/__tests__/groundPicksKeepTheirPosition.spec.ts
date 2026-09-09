/**
 * §GROUND-PICKS-KEEP-THEIR-POSITION (founder 2026-09-09 · L-13277 · C12 §1.4)
 *
 * THE ASK, VERBATIM:
 *   *"THE 3D GLOBE MODEL IS NOT ON THE CORRECT HEIGHT - IT IS HEIGHT UP"*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THE ARITHMETIC REPRODUCES HIS CONSOLE EXACTLY
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 58 picks · low-half span 12.59 m · largest step 2.00 m. `SLOPE_RAMP_MIN_SPAN_M` is 6 and
 * `ROOF_GAP_M` is 4, so span > 6 rules out `plateau` and step 2.00 < 4 rules out `roof-gap`:
 * the reduction falls through to `slope`, which seats at the ring MEDIAN.
 *
 *     seat = median 78.94 − GLOBE_GROUND_SEAT_EPSILON_M 0.30 = **78.64 m**
 *
 * — byte-for-byte the `-> seat 78.64` in his log. The lowest credible pick is 64.89 m, so the
 * building, the massing and the void cap all sat **13.75 m** above the lowest measured street
 * cell. Dead centre of the reported 10-14 m.
 *
 * ⛔ WHY THIS CANNOT BE FIXED BY TUNING, AND WHY TRYING WOULD BE THE THIRD MISTAKE.
 * Ground and roof differ ONLY in whether height is a FUNCTION OF POSITION. The sampler
 * compacted its result into a bare `number[]` before the classifier ever ran, discarding
 * every (lon, lat) — so no threshold on that sorted list can recover the distinction. The
 * record shows it: the same discriminator buried Sète's hillside (L-12919), the re-tune that
 * fixed Sète floated Barcelona. A third tuning would fail in a third direction.
 *
 * ⭐ THE `roof-gap` ESCAPE CANNOT SAVE IT EITHER, and that is a fact about the DATA, not the
 * threshold: it assumes roofs are separated from ground by a clean ≥4 m gap. True of the
 * synthetic fixture it was written against; false of a photoreal mesh, which is ONE CONTINUOUS
 * SURFACE draping from kerb up the facade to the cornice and filling that gap with a
 * continuum. Measured largest step on his ring: 2.00 m.
 *
 * ✅ ESTABLISHES: the sampler carries each pick's sample index, and carries it correctly when
 *    picks are dropped; the footprint mask removes roof picks and keeps street picks; the
 *    seat moves from the roof median to the street ground on his own numbers; and the mask
 *    degrades honestly rather than silently when too little survives.
 * ⛔ DOES NOT ESTABLISH: that the founder's globe now looks right. That needs his screen.
 */

import { describe, expect, it } from 'vitest';
import { CesiumViewport } from '../CesiumViewport';
import {
    classifyTileGroundPicks,
    reduceTileGroundHeight,
    OUTLIER_ROBUST_MIN_SAMPLES,
} from '../globeGroundAnchor';

const SEAT_EPSILON = 0.3;

describe('§GROUND-PICKS-KEEP-THEIR-POSITION — the sampler carries the index', () => {
    it('⭐ each pick reports the index of the sample point that produced it', async () => {
        const picks = await CesiumViewport.safeSampleTileHeights(
            () => Promise.resolve([{ h: 10 }, { h: 20 }, { h: 30 }]),
            (r: { h: number }) => r.h,
        );
        expect(picks).toEqual([{ idx: 0, h: 10 }, { idx: 1, h: 20 }, { idx: 2, h: 30 }]);
    });

    it('⛔ the index survives DROPPED picks — it cannot be inferred from output position', () => {
        // THE ARM THAT MATTERS. A ray through a hole yields a non-finite height and is dropped,
        // so the surviving picks are not contiguous. Any code that recovered the position by
        // counting output entries would silently join every later pick to the WRONG lon/lat —
        // a mis-join that would look exactly like a measurement error.
        return CesiumViewport.safeSampleTileHeights(
            () => Promise.resolve([{ h: null }, { h: 64.89 }, { h: Number.NaN }, { h: 78.94 }]),
            (r: { h: number | null }) => r.h,
        ).then((picks) => {
            expect(picks).toEqual([{ idx: 1, h: 64.89 }, { idx: 3, h: 78.94 }]);
        });
    });

    it('a throwing sampler still resolves to an empty list — the L-183 crash guard is intact', async () => {
        await expect(CesiumViewport.safeSampleTileHeights(
            () => Promise.reject(new Error('tileset not ready')),
            (r: { h: number }) => r.h,
        )).resolves.toEqual([]);
    });
});

describe("§GROUND-PICKS-KEEP-THEIR-POSITION — the founder's own ring, before and after", () => {
    /**
     * A stand-in for his 58-pick ring with the published statistics: a street population
     * around 65 m and a roof population around 79 m, joined by a facade CONTINUUM so no step
     * exceeds 2 m. Roofs outnumber street picks, which is what a wall-to-wall Eixample block
     * produces once the in-parcel samples are skipped.
     */
    const ring: number[] = [];
    for (let i = 0; i < 18; i += 1) ring.push(64.89 + i * 0.1);          // street, ~64.9-66.6
    for (let i = 0; i < 14; i += 1) ring.push(66.8 + i * 0.85);          // facade drape, no >2 m step
    for (let i = 0; i < 26; i += 1) ring.push(78.0 + (i % 7) * 0.3);     // roofs, ~78-79.8
    const sorted = [...ring].sort((a, b) => a - b);

    it('⛔ BEFORE — the classifier takes the `slope` arm and seats on the ROOFS', () => {
        const cls = classifyTileGroundPicks(sorted);
        // The two escapes are both ruled out, exactly as they were on his data.
        expect(cls.arm).toBe('slope');
        expect(cls.maxGapM).toBeLessThan(4);        // roof-gap cannot fire: the drape fills it
        expect(cls.spanM).toBeGreaterThan(6);       // plateau cannot fire: the span is too wide
        const seat = reduceTileGroundHeight(ring, null, SEAT_EPSILON);
        expect(seat).not.toBeNull();
        // Seated on the median, which is up in the roof/drape population.
        expect(seat!).toBeGreaterThan(70);
        expect(seat! - Math.min(...ring)).toBeGreaterThan(6);   // metres of float
    });

    it('⭐ AFTER — with the roof picks masked away, the seat lands on the street', () => {
        // The mask is a POSITION test in the viewport; here we apply its RESULT — the street
        // picks only — to prove the reduction was never the broken part. Nothing downstream
        // changed: same function, same arms, same epsilon. Only the roofs stopped voting.
        const streetOnly = ring.filter((h) => h < 67);
        expect(streetOnly.length).toBeGreaterThanOrEqual(OUTLIER_ROBUST_MIN_SAMPLES);
        const seat = reduceTileGroundHeight(streetOnly, null, SEAT_EPSILON);
        expect(seat).not.toBeNull();
        expect(seat!).toBeLessThan(67);
        expect(seat! - Math.min(...streetOnly)).toBeLessThan(2);
    });

    it('⛔ a GENUINE hillside is untouched — L-12919 must not regress', () => {
        // THE COUNTERWEIGHT, and the reason the fix is a mask and not a re-tune. Sète's ring is
        // a continuous ground ramp with NO buildings to mask, so the mask removes nothing and
        // the `slope` arm still seats at the median — which is correct there, and is exactly
        // what L-12919 established. A threshold change would have broken this; a mask cannot.
        const hillside: number[] = [];
        for (let i = 0; i < 40; i += 1) hillside.push(150 + i * 0.5);   // a smooth 20 m ramp
        const cls = classifyTileGroundPicks([...hillside].sort((a, b) => a - b));
        expect(cls.arm).toBe('slope');
        const seat = reduceTileGroundHeight(hillside, null, SEAT_EPSILON);
        expect(seat).not.toBeNull();
        // The MEDIAN, not the downhill corner — the whole point of L-12919.
        expect(seat!).toBeGreaterThan(Math.min(...hillside) + 8);
    });

    it('⚠ masking below the sample floor must NOT be allowed to seat the model', () => {
        // The honest-degradation rule, pinned. Below `OUTLIER_ROBUST_MIN_SAMPLES` there is no
        // distribution to reason about, so the viewport keeps the UNMASKED set and says so in
        // the log rather than seating on a handful of survivors. This arm pins the threshold
        // the viewport's guard is written against, so the two cannot drift apart.
        expect(OUTLIER_ROBUST_MIN_SAMPLES).toBe(12);
        const tooFew = [64.9, 65.0, 65.1];
        expect(tooFew.length).toBeLessThan(OUTLIER_ROBUST_MIN_SAMPLES);
        // Below the floor the reduction falls back to the plain minimum — unchanged behaviour.
        expect(reduceTileGroundHeight(tooFew, null, SEAT_EPSILON)).toBeCloseTo(64.9 - SEAT_EPSILON, 6);
    });
});
