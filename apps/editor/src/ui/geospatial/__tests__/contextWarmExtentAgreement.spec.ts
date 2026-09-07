// §CTX-WARM-READS-THE-RENDER-EXTENT (L-13079, founder Barcelona 2026-09-07) — the warm pass and the
// render pass must ask for THE SAME BOX, or the warm is warming tiles nobody reads and the render is
// paying for tiles nobody warmed.
//
// THE MEASURED DIVERGENCE. `contextLayerWarm.ts`'s header promises "using EXACTLY the bbox extents
// `CesiumViewport` will later ask for". §SITE-SCOPE F-2 then moved the ROADS and PARKS render reads
// onto `groundFetchHalfDeg(scope)` and left the warm on the NEAR default. The founder's console shows
// both halves: warm `parks 214 / 25 tiles`, render `parks 800 green area(s) from 81 baked tile(s) in
// 1173 ms`. These tests pin the two facts the fix depends on — that the two extents had diverged, and
// that warming the wide one SUBSUMES the near one rather than replacing it with a different tile set.
import { describe, it, expect } from 'vitest';
import { contextBboxAround } from '../contextBuildings';
import {
    CTX_NEAR_HALF_DEG, groundFetchHalfDeg, scopeReadFanOutCap,
    farTierRadiusM, METRES_PER_DEG_LAT,
} from '../contextExtentBudget';
import { zoomForExtent, tilesCovering, MAX_TILES_PER_FETCH } from '../contextTiles';

// The founder's own Barcelona open coordinate — the run every number in this file comes from.
const LAT = 41.3825802;
const LON = 2.177073;
const PARKS_PREFERRED_Z = 16;       // `LAYER_ZOOM.parks` / `.roads` in contextTiles.ts

function readZoom(halfDeg: number): number {
    const bbox = contextBboxAround(LAT, LON, halfDeg);
    return zoomForExtent(bbox, PARKS_PREFERRED_Z, 0, scopeReadFanOutCap(halfDeg) ?? MAX_TILES_PER_FETCH);
}
function readTiles(halfDeg: number): Set<string> {
    const bbox = contextBboxAround(LAT, LON, halfDeg);
    const z = readZoom(halfDeg);
    return new Set(tilesCovering(bbox, z).map((t) => `${z}/${t.x}/${t.y}`));
}

describe('§CTX-WARM-READS-THE-RENDER-EXTENT — the divergence the fix closes', () => {
    it('the ground render extent is genuinely WIDER than the near default the warm used', () => {
        // If this ever equalises, the fix has become a no-op and the comment in contextLayerWarm.ts
        // should say so rather than describing a gap that closed.
        expect(groundFetchHalfDeg()).toBeGreaterThan(CTX_NEAR_HALF_DEG);

        // ⛔ THIS LINE USED TO READ `toBeCloseTo(2 * CTX_NEAR_HALF_DEG, 6)` AND IT PINNED A
        // COINCIDENCE, NOT AN INVARIANT — measured 2026-09-07 when it failed at HEAD:
        //   groundFetchHalfDeg()   = 1781 m / 111 320 = 0.015998922026590010  (metres-DERIVED)
        //   2 * CTX_NEAR_HALF_DEG  = 2 * 0.008        = 0.016                 (a degree LITERAL)
        //   difference             = 1.078e-6 deg = **0.12 m**
        // Float noise is ~1e-15; 1.078e-6 is four orders of magnitude larger, so this was never
        // noise. The two sides are INDEPENDENTLY derived — one from the scope's far-tier radius in
        // METRES, one from a doubled degree constant — and they agree to 12 cm only because 1781 m
        // happens to sit next to 1781.12 m. Loosening the tolerance would have widened the
        // coincidence window rather than testing anything, so the claim is replaced by the fact
        // that is actually load-bearing: the ground read IS the scope's far-tier radius, converted
        // once. That is what `groundFetchHalfDeg` promises in its own doc comment, and it is what
        // breaks if someone re-points it at a different radius or a second conversion creeps in.
        expect(groundFetchHalfDeg()).toBeCloseTo(farTierRadiusM() / METRES_PER_DEG_LAT, 12);

        // …and it is still ABOUT double the near default, which is the shape a reader expects from
        // the header. Asserted as a RATIO with a tolerance sized to the 0.12 m gap above (0.1 %),
        // never as an equality between a metres-derived number and a degree literal.
        expect(groundFetchHalfDeg() / CTX_NEAR_HALF_DEG).toBeCloseTo(2, 2);
    });

    it('reproduces the founder’s 25-of-81 tile counts from pure arithmetic', () => {
        // ⭐ These are HIS numbers, not chosen ones: the warm read logged 25 tiles and the render read
        // logged 81. Deriving them from the extent maths is what establishes that the tile-count gap
        // WAS the extent gap, and not a zoom step or a cap refusal.
        expect(readTiles(CTX_NEAR_HALF_DEG).size).toBe(25);
        expect(readTiles(groundFetchHalfDeg()).size).toBe(81);
    });
});

describe('§CTX-WARM-READS-THE-RENDER-EXTENT — warming wide SUBSUMES warming near', () => {
    it('both extents resolve to the SAME zoom, so their tiles are comparable at all', () => {
        // ⛔ THE LOAD-BEARING PRECONDITION. §CTX-TILE-DECODE-CACHE is keyed `version/layer/z/x/y`. If
        // the wider read stepped down a zoom, its tiles would share NO key with the near read's and
        // warming wide would warm nothing the render wants — the fix would be a pure cost.
        expect(readZoom(CTX_NEAR_HALF_DEG)).toBe(PARKS_PREFERRED_Z);
        expect(readZoom(groundFetchHalfDeg())).toBe(PARKS_PREFERRED_Z);
    });

    it('every near tile is inside the wide tile set — a strict superset, nothing swapped', () => {
        const near = readTiles(CTX_NEAR_HALF_DEG);
        const wide = readTiles(groundFetchHalfDeg());
        for (const key of near) expect(wide.has(key)).toBe(true);
        expect(wide.size).toBeGreaterThan(near.size);
    });

    it('the wide read still fits inside its own fan-out cap — it is not buying a refusal', () => {
        // A read over the cap does not coarsen, it REFUSES (`bbox needs N tiles … over the cap`), and
        // a warm that refuses would be silently doing nothing while looking healthy.
        const cap = scopeReadFanOutCap(groundFetchHalfDeg()) ?? MAX_TILES_PER_FETCH;
        expect(readTiles(groundFetchHalfDeg()).size).toBeLessThanOrEqual(cap);
    });
});
