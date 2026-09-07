/**
 * §SCOPE-FILL (L-13098) — THE CONTENT FILLS THE SCOPE, AND THE COPY SAYS WHAT IS ACTUALLY TRUE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUNDER'S SENTENCE, VERBATIM, AND THE THREE INDEPENDENT CEILINGS BETWEEN IT AND THE SCREEN
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *"the scope of the rectangle or circle should be 4x bigger — it is too small — allow to go up to
 * 10.000 — also — no matter whether is circular or rectangular — all the plat — all the scope
 * should have buildings + water + trees + roads + train + terrain + trees + everything! at the
 * moment is still contrain to the original radiours — now it should cover the full scope"*
 *
 * His slab rendered at 2 519 m and 5 035 m while every content layer logged `radial ≤1781 m`. The
 * slab cropped where he set it; the CONTENT did not fill it. THREE ceilings were stacked, and
 * fixing any one alone would have left the other two binding — this repo's
 * `three-invalidation-gates-in-series` scar (L-813), where an upstream gate hid two downstream
 * fixes and the fix that landed measured nothing:
 *
 *   1. THE READ EXTENT. `fetchContextBuildingsNearAndFar` had no scope parameter at all: the far
 *      bbox was `CONTEXT_BBOX_FAR_HALF_DEG`, frozen at MODULE LOAD to the default scope. Rail and
 *      water were worse — they took the 0.008° NEAR default (~891 m) at every scope.
 *   2. THE READ ZOOM. `scopeReadFanOutCap` handed a read INSIDE 1 781 m the 112-tile budget and
 *      every read OUTSIDE it the 64 default — a CLIFF that falls the wrong way.
 *   3. THE RENDER COUNT CAPS, which are nearest-first and therefore re-impose a FIXED radius: at
 *      Barcelona density a flat 8 000 far instances draws to ~1.4 km whether the slab is 1 781 m or
 *      10 000 m.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ THE MEASUREMENT THAT REVERSED THE DESIGN — read this before changing a budget below
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * The product shipped this apology in its own slider copy: *"the bake deletes footprints from dense
 * cores rather than coarsening them, so a wider slab draws FEWER buildings, not more"*. It was
 * decoded from the SHIPPED archive (`buildings.pmtiles?v=L663a`), one z15 tile against its four z16
 * children over identical ground, counted by an own-bounds anchor partition cross-checked against
 * clipped footprint area (these tiles carry NO feature ids, so a centroid dedup double-counts seam
 * pieces — that is its own ledger row):
 *
 *   · Barcelona 15/16581/12238 — **953 footprints at z15, 953 across the four z16 children**,
 *     area ratio 0.9998, height-provenance histogram identical to the last unit.
 *   · Madrid 15/16046/12355 — **1 305 vs 1 305**, area ratio 0.9998.
 *   · It holds two steps further: z14 5 420 vs 5 422; z13 17 154 vs 17 021. The cliff is z12 (0.20).
 *   · Roads, the same way: z15 1 253 vs z16 1 254 strands; centreline 53 818 m vs 53 819 m.
 *   · `--drop-densest-as-needed` fires only above tippecanoe's ~500 KB tile limit, and the largest
 *     z15 buildings tile sampled is 67 104 B — **13 % of it**. The flag was passed; it never fired.
 *
 * **The apology was folklore.** But the CANOPY half of it is true for a completely different
 * reason: `trees` loses a measured 0.400 of its points per zoom step at Barcelona AND Madrid AND
 * z14/z15 — three pairs, one constant — which is tippecanoe's DEFAULT `--drop-rate 2.5` dot-drop,
 * unconditional and nothing to do with density (the z15 trees tile is 2 020 B, 0.4 % of the limit).
 *
 * So the budgets are INVERTED relative to what the code assumed: the area layers get the SMALL one
 * (a coarser read is 73 % fewer requests for identical data) and the point layers get the LARGE one
 * (a coarser read costs 60 % of the trees, everywhere in the box, including beside the site).
 *
 * ⚠ WHAT THESE TESTS CAN AND CANNOT DO. Every number below comes out of the real functions —
 * `farFetchHalfDeg` → `contextFetchBbox` → `tileCountCovering` → `zoomForExtent`, the same four the
 * tile reader itself calls. They CANNOT re-verify the archive measurement above; that is a network
 * fact, and it is recorded in the constants' own doc comments with its method.
 */

import { describe, it, expect } from 'vitest';
import {
    CTX_SCOPE_MIN_RADIUS_M,
    CTX_SCOPE_MAX_RADIUS_M,
    CTX_SCOPE_READ_MAX_TILES_AREA,
    CTX_SCOPE_READ_MAX_TILES_POINTS,
    CTX_SCOPE_READ_COMPLETE_CEILING_M,
    CTX_FAR_TIER_MAX_INSTANCES,
    CTX_FAR_TIER_MAX_INSTANCES_CEILING,
    CTX_TOTAL_MAX_BUILDINGS,
    CTX_TOTAL_MAX_BUILDINGS_CEILING,
    CTX_TREES_RADIUS_CEILING_M,
    CTX_STREET_LIFE_RADIUS_CEILING_M,
    CTX_NEAR_HALF_DEG,
    CTX_WIDE_HALF_DEG_MULTIPLE,
    CTX_SEA_HALF_DEG_MULTIPLE,
    farFetchHalfDeg,
    groundFetchHalfDeg,
    treesFetchHalfDeg,
    treesRadiusM,
    farTierRadiusM,
    shadowRadiusM,
    nearSolidRadiusM,
    farTierMaxInstances,
    totalMaxBuildings,
    scopeReadFanOutCap,
    DEFAULT_SITE_CONTEXT_SCOPE,
    type SiteContextScope,
} from '../contextExtentBudget';
import { contextFetchBbox } from '../contextBuildings';
import { tileCountCovering, zoomForExtent, tileReadStepsBelowFullZoom, mapWithConcurrency } from '../contextTiles';
import { scopeReadCompleteCeilingM } from '../scopeReadCeiling';

const CITIES = [
    ['Barcelona', 41.3874, 2.1686],
    ['Madrid', 40.4168, -3.7038],
    ['Córdoba', 37.8882, -4.7794],
    ['Lisbon', 38.7223, -9.1393],
    ['Oslo', 59.9139, 10.7522],
    ['Reykjavík', 64.1466, -21.9426],
] as const;

const circle = (radiusM: number): SiteContextScope => ({ shape: 'circle', radiusM });
/** The rectangle the SLIDER makes at track value `r`: the square INSCRIBED in that disc. */
const rect = (r: number): SiteContextScope => ({
    shape: 'rectangle',
    halfWidthM: r / Math.SQRT2,
    halfDepthM: r / Math.SQRT2,
});

/** The zoom a scope-derived read of `radiusM` lands on at this site, for this budget. */
function zoomAt(lat: number, lon: number, radiusM: number, cap: number): number {
    const bbox = contextFetchBbox(lat, lon, farFetchHalfDeg(circle(radiusM)));
    return zoomForExtent(bbox as [number, number, number, number], 16, 8, cap);
}
function tilesAt(lat: number, lon: number, radiusM: number, z = 16): number {
    return tileCountCovering(
        contextFetchBbox(lat, lon, farFetchHalfDeg(circle(radiusM))) as [number, number, number, number],
        z,
    );
}

describe('§SCOPE-FILL — 1. the slider reaches 10 000 m, in BOTH shapes', () => {
    it('the track maximum is a 10 000 m square and a 7 071 m disc — the number he SEES is 10 000', () => {
        // He photographed the RECTANGLE readout. `scopeAtRadius` makes a rectangle the square
        // INSCRIBED in the disc of the track value, so the side is r·√2.
        expect(Math.round(CTX_SCOPE_MAX_RADIUS_M * Math.SQRT2)).toBe(10_000);
        const r = rect(CTX_SCOPE_MAX_RADIUS_M);
        if (r.shape !== 'rectangle') throw new Error('unreachable');
        expect(Math.round(r.halfWidthM * 2)).toBe(10_000);
    });

    it('both shapes reduce to the SAME circumscribing radius, so the knob never jumps', () => {
        for (const v of [CTX_SCOPE_MIN_RADIUS_M, 1781, 5000, CTX_SCOPE_MAX_RADIUS_M]) {
            expect(farTierRadiusM(circle(v))).toBeCloseTo(farTierRadiusM(rect(v)), 6);
            expect(groundFetchHalfDeg(circle(v))).toBeCloseTo(groundFetchHalfDeg(rect(v)), 9);
        }
    });
});

describe('§SCOPE-FILL — 2. the READ follows the slider', () => {
    it('⛔ THE SEAM: the far fetch half-extent is a function of the scope, not a module constant', () => {
        // This is the property whose ABSENCE was the whole defect. `CONTEXT_BBOX_FAR_HALF_DEG` is
        // still exported and still equals the DEFAULT scope's extent — that is correct, it is the
        // default for the six callers that legitimately want the default neighbourhood — but the
        // 3D-Site load now passes `groundFetchHalfDeg(scope)` and this asserts the two differ.
        const wide = groundFetchHalfDeg(circle(CTX_SCOPE_MAX_RADIUS_M));
        const dflt = groundFetchHalfDeg(DEFAULT_SITE_CONTEXT_SCOPE);
        expect(wide).toBeGreaterThan(dflt);
        expect(wide / dflt).toBeCloseTo(CTX_SCOPE_MAX_RADIUS_M / 1781, 2);
    });

    it('the fetch extent is MONOTONE in the slider — a wider slab can never read a narrower box', () => {
        let prev = 0;
        for (let r = CTX_SCOPE_MIN_RADIUS_M; r <= CTX_SCOPE_MAX_RADIUS_M; r += 137) {
            const h = groundFetchHalfDeg(circle(r));
            expect(h).toBeGreaterThanOrEqual(prev);
            prev = h;
        }
    });

    it('⛔ THE CLIFF IS GONE: a wider read is never handed a SMALLER budget than a narrower one', () => {
        // The defect in one assertion. `scopeReadFanOutCap` used to return 112 inside 1 781 m and
        // `undefined` (→ the layer's own 64) outside it, so widening the scope shrank the budget.
        let prev = 0;
        for (let r = CTX_SCOPE_MIN_RADIUS_M; r <= CTX_SCOPE_MAX_RADIUS_M; r += 97) {
            const cap = scopeReadFanOutCap(groundFetchHalfDeg(circle(r)));
            expect(cap, `cap must be granted at ${r} m`).toBeDefined();
            expect(cap!).toBeGreaterThanOrEqual(prev);
            prev = cap!;
        }
    });

    it('the two budgets are the measured INVERSION — points get more than areas', () => {
        expect(CTX_SCOPE_READ_MAX_TILES_POINTS).toBeGreaterThan(CTX_SCOPE_READ_MAX_TILES_AREA);
        expect(scopeReadFanOutCap(0.02, 'points')).toBe(CTX_SCOPE_READ_MAX_TILES_POINTS);
        expect(scopeReadFanOutCap(0.02, 'area')).toBe(CTX_SCOPE_READ_MAX_TILES_AREA);
        expect(scopeReadFanOutCap(0.02)).toBe(CTX_SCOPE_READ_MAX_TILES_AREA); // the safe default
    });

    it('⛔ the 8 km land-use wash and the 11 km sea keep their OWN default — this grant is not for them', () => {
        // Measured, and it reverses the obvious fix: `zoomForExtent` picks the FINEST zoom that
        // fits, so handing these a bigger cap buys a finer zoom nobody looks at (landuse z13/30
        // tiles at cap 64 → z14/100 at cap 144, 3.3× the requests to tint the same ground).
        expect(scopeReadFanOutCap(CTX_NEAR_HALF_DEG * CTX_WIDE_HALF_DEG_MULTIPLE)).toBeUndefined();
        expect(scopeReadFanOutCap(CTX_NEAR_HALF_DEG * CTX_SEA_HALF_DEG_MULTIPLE)).toBeUndefined();
        // …and a nonsense extent is refused rather than granted a budget.
        expect(scopeReadFanOutCap(Number.NaN)).toBeUndefined();
        expect(scopeReadFanOutCap(0)).toBeUndefined();
        expect(scopeReadFanOutCap(-1)).toBeUndefined();
    });

    it('⭐ the AREA budget keeps every reference city at z14 or finer at the slider MAXIMUM', () => {
        // 192 is chosen to be the SMALLEST budget with this property — two full zoom steps above
        // the measured z13→z12 cliff. If someone lowers it, this fails and says which city.
        for (const [name, lat, lon] of CITIES) {
            const z = zoomAt(lat, lon, CTX_SCOPE_MAX_RADIUS_M, CTX_SCOPE_READ_MAX_TILES_AREA);
            expect(z, `${name} at the slider max`).toBeGreaterThanOrEqual(14);
        }
    });

    it('the AREA budget is not larger than it needs to be — a bigger one buys requests, not data', () => {
        // The other half of "smallest with that property": at one step smaller, some city drops
        // below z14. Without this the constant could silently drift upward and nothing would notice
        // that every scope read had started paying 3× the range requests for identical features.
        const smaller = CTX_SCOPE_READ_MAX_TILES_AREA - 48;
        const anyBelow = CITIES.some(([, lat, lon]) => zoomAt(lat, lon, CTX_SCOPE_MAX_RADIUS_M, smaller) < 14);
        expect(anyBelow).toBe(true);
    });
});

describe('§SCOPE-FILL — 3. TREES are the one layer a coarser read really costs', () => {
    it('the tree READ and the tree RING are the same disc — the read can never overshoot the draw', () => {
        for (const [, lat, lon] of CITIES) {
            const ceiling = scopeReadCompleteCeilingM(lat, lon).radiusM;
            for (const r of [CTX_SCOPE_MIN_RADIUS_M, 1781, 3000, CTX_SCOPE_MAX_RADIUS_M]) {
                const ring = treesRadiusM(circle(r), ceiling);
                const read = treesFetchHalfDeg(circle(r), ceiling);
                expect(read).toBeCloseTo(Math.max(CTX_NEAR_HALF_DEG, ring / 111_320), 9);
            }
        }
    });

    it('⛔ MONOTONE: widening the slider can only ever ADD trees, never remove one', () => {
        // The property the clamp exists for. A zoom step thins the canopy in the WHOLE box —
        // including beside the founder's own site — so the tree radius must never be allowed to
        // grow past the extent that still reads at z16. Monotonicity is what makes that safe to
        // present as "trees stop here" instead of "trees got worse".
        for (const [name, lat, lon] of CITIES) {
            const ceiling = scopeReadCompleteCeilingM(lat, lon).radiusM;
            let prev = 0;
            for (let r = CTX_SCOPE_MIN_RADIUS_M; r <= CTX_SCOPE_MAX_RADIUS_M; r += 89) {
                const ring = treesRadiusM(circle(r), ceiling);
                expect(ring, `${name} at ${r} m`).toBeGreaterThanOrEqual(prev);
                prev = ring;
            }
            // …and it really does stop at the measured ceiling, not at the slider max.
            expect(treesRadiusM(circle(CTX_SCOPE_MAX_RADIUS_M), ceiling)).toBeCloseTo(ceiling, 6);
        }
    });

    it('the tree read never steps below z16 at any scope, at any reference city', () => {
        // The clamp's whole purpose, asserted through the real zoom search rather than by argument.
        for (const [name, lat, lon] of CITIES) {
            const ceiling = scopeReadCompleteCeilingM(lat, lon).radiusM;
            for (const r of [1781, 2519, 3562, 5000, CTX_SCOPE_MAX_RADIUS_M]) {
                const halfDeg = treesFetchHalfDeg(circle(r), ceiling);
                const bbox = contextFetchBbox(lat, lon, halfDeg) as [number, number, number, number];
                const z = zoomForExtent(bbox, 16, 8, CTX_SCOPE_READ_MAX_TILES_POINTS);
                expect(z, `${name} trees at scope ${r} m`).toBe(16);
            }
        }
    });

    it('⛔ an UNMEASURED ceiling is an admission, never a zero', () => {
        // §CONTEXT-DATA-HONESTY. `null`/undefined means "no origin has loaded yet" and must fall
        // back to the static ceiling — never to 0, which would render as "no trees here".
        for (const bad of [null, undefined, Number.NaN, 0, -5]) {
            expect(treesRadiusM(circle(3000), bad)).toBe(3000);
        }
    });

    it('street life does NOT follow the slider, and its ceiling is stated, not the slider max', () => {
        // Lamps and people are SYNTHESISED along the road network before they are capped, so their
        // cost is O(road length) and a 7 km slab is ~40× the work to draw the same 2 400 lamps.
        expect(CTX_STREET_LIFE_RADIUS_CEILING_M).toBeLessThan(CTX_SCOPE_MAX_RADIUS_M);
        expect(CTX_STREET_LIFE_RADIUS_CEILING_M).toBeGreaterThan(CTX_SCOPE_READ_COMPLETE_CEILING_M);
        // …and trees, which are NOT synthesised, are no longer pinned to the same number.
        expect(CTX_TREES_RADIUS_CEILING_M).toBe(CTX_SCOPE_MAX_RADIUS_M);
    });
});

describe('§SCOPE-FILL — 4. the RENDER caps are a SECOND ceiling and follow the scope too', () => {
    it('⛔ THE `three-invalidation-gates-in-series` GUARD: a flat count cap re-imposes a FIXED radius', () => {
        // At the founder's own Barcelona density (16 633 footprints in his 3 562 m box = 12.7 km²
        // → ~1 310/km²) a flat 8 000 draws to the same ~1.4 km at every scope, so fixing the read
        // alone would have been invisible to him. The cap must grow with the AREA or it silently
        // becomes the radius.
        const DENSITY_PER_KM2 = 1310;
        const radiusDrawnAt = (r: number, cap: number): number => {
            const eligible = DENSITY_PER_KM2 * (Math.PI * (r / 1000) ** 2);
            return eligible <= cap ? r : r * Math.sqrt(cap / eligible);
        };
        const flat = radiusDrawnAt(CTX_SCOPE_MAX_RADIUS_M, CTX_FAR_TIER_MAX_INSTANCES);
        const scoped = radiusDrawnAt(CTX_SCOPE_MAX_RADIUS_M, farTierMaxInstances(CTX_SCOPE_MAX_RADIUS_M));
        expect(scoped).toBeGreaterThan(flat * 1.5);
    });

    it('⭐ the DEFAULT scope is byte-identical — nobody who leaves the slider alone pays for this', () => {
        // The property that makes an unmeasured raise defensible: it is only spent where the user
        // explicitly asked for more, and one drag back undoes it.
        const d = farTierRadiusM(DEFAULT_SITE_CONTEXT_SCOPE);
        expect(farTierMaxInstances(d)).toBe(CTX_FAR_TIER_MAX_INSTANCES);
        expect(totalMaxBuildings(d)).toBe(CTX_TOTAL_MAX_BUILDINGS);
        // …and a SMALLER scope never gets a smaller budget than the default (the ratio floors at 1).
        expect(farTierMaxInstances(CTX_SCOPE_MIN_RADIUS_M)).toBe(CTX_FAR_TIER_MAX_INSTANCES);
    });

    it('both caps are monotone in the scope and clamp at their stated ceilings', () => {
        let pf = 0, pt = 0;
        for (let r = CTX_SCOPE_MIN_RADIUS_M; r <= CTX_SCOPE_MAX_RADIUS_M; r += 61) {
            const f = farTierMaxInstances(r), t = totalMaxBuildings(r);
            expect(f).toBeGreaterThanOrEqual(pf);
            expect(t).toBeGreaterThanOrEqual(pt);
            expect(f).toBeLessThanOrEqual(CTX_FAR_TIER_MAX_INSTANCES_CEILING);
            expect(t).toBeLessThanOrEqual(CTX_TOTAL_MAX_BUILDINGS_CEILING);
            pf = f; pt = t;
        }
        expect(farTierMaxInstances(CTX_SCOPE_MAX_RADIUS_M)).toBe(CTX_FAR_TIER_MAX_INSTANCES_CEILING);
        expect(totalMaxBuildings(CTX_SCOPE_MAX_RADIUS_M)).toBe(CTX_TOTAL_MAX_BUILDINGS_CEILING);
    });

    it('⛔ the whole-scene budget still sits ABOVE the sum of the tiers it governs', () => {
        // The derivation the constant claims: ≤1 600 shadow casters + ~3 840 demoted true-height
        // near entities + the far tier's ceiling. If the far ceiling is raised without raising the
        // total, the total silently becomes the binding cap and the far ceiling becomes a lie in
        // the log line.
        expect(CTX_TOTAL_MAX_BUILDINGS_CEILING).toBeGreaterThanOrEqual(
            CTX_FAR_TIER_MAX_INSTANCES_CEILING + 1600 + 3840,
        );
    });

    it('the EXPENSIVE tiers do NOT follow the slider — extent is bought in the instanced tier only', () => {
        // The shadow ring is Cesium’s own shadow-map `maximumDistance`; past it a caster pays in
        // full and contributes nothing visible. The solid near tier is per-entity true-height
        // geometry. Both may only ever SHRINK with the scope.
        for (const r of [CTX_SCOPE_MIN_RADIUS_M, 1781, CTX_SCOPE_MAX_RADIUS_M]) {
            expect(shadowRadiusM(circle(r))).toBeLessThanOrEqual(600);
            expect(nearSolidRadiusM(circle(r))).toBeLessThanOrEqual(891);
            expect(shadowRadiusM(circle(r))).toBeLessThanOrEqual(r);
            expect(nearSolidRadiusM(circle(r))).toBeLessThanOrEqual(r);
        }
        expect(shadowRadiusM(circle(300))).toBe(300);   // a small scope really does shrink it
    });
});

describe('§SCOPE-FILL — 5. the near ring is protected from the extent it now pays for', () => {
    it('the step-down predicate says NO at the default scope and YES at the slider max', () => {
        // The hedge in `fetchContextBuildingsNearAndFar` is gated on this, so it costs nothing at
        // the default scope — the §CTX-PMTILES-READER decision to skip the near read on the tiles
        // path is preserved exactly where it was right.
        for (const [name, lat, lon] of CITIES.slice(0, 4)) {
            const dflt = contextFetchBbox(lat, lon, groundFetchHalfDeg(DEFAULT_SITE_CONTEXT_SCOPE));
            expect(
                tileReadStepsBelowFullZoom('buildings', dflt as [number, number, number, number],
                    scopeReadFanOutCap(groundFetchHalfDeg(DEFAULT_SITE_CONTEXT_SCOPE))),
                `${name} at the default scope must NOT pay for a second read`,
            ).toBe(false);
        }
        for (const [name, lat, lon] of CITIES) {
            const wide = contextFetchBbox(lat, lon, groundFetchHalfDeg(circle(CTX_SCOPE_MAX_RADIUS_M)));
            expect(
                tileReadStepsBelowFullZoom('buildings', wide as [number, number, number, number],
                    scopeReadFanOutCap(groundFetchHalfDeg(circle(CTX_SCOPE_MAX_RADIUS_M)))),
                `${name} at the slider max must hedge the near ring`,
            ).toBe(true);
        }
    });

    it('the near read the hedge issues is always tiny and always at full zoom', () => {
        for (const [name, lat, lon] of CITIES) {
            const near = contextFetchBbox(lat, lon, CTX_NEAR_HALF_DEG) as [number, number, number, number];
            expect(tileCountCovering(near, 16), `${name} near read`).toBeLessThanOrEqual(64);
            expect(tileReadStepsBelowFullZoom('buildings', near, CTX_SCOPE_READ_MAX_TILES_AREA)).toBe(false);
        }
    });
});

describe('§SCOPE-FILL — 6. a bigger fan-out must not become a request storm', () => {
    it('mapWithConcurrency preserves INPUT ORDER — a completion-order result mis-attributes failures', () => {
        // `readContextTilesOnce` indexes its result array against `tiles`, so an out-of-order
        // result would report tile A's failure against tile B. Deliberately resolve in reverse.
        const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        return mapWithConcurrency(items, 3, async (n) => {
            await new Promise((r) => setTimeout(r, (10 - n) * 2));
            return n * 10;
        }).then((out) => {
            expect(out).toEqual(items.map((n) => n * 10));
        });
    });

    it('it never runs more than `limit` at once, and handles the degenerate inputs', async () => {
        let live = 0, peak = 0;
        await mapWithConcurrency([...Array(50).keys()], 7, async (n) => {
            live++; peak = Math.max(peak, live);
            await new Promise((r) => setTimeout(r, 1));
            live--;
            return n;
        });
        expect(peak).toBeLessThanOrEqual(7);
        expect(peak).toBeGreaterThan(1);                       // it really is concurrent
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
        expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);   // width floors at 1
    });
});

describe('§SCOPE-FILL — 7. the arithmetic this lane is built on, re-run rather than transcribed', () => {
    it('reproduces the per-city z16 tile counts the budgets were chosen against', () => {
        // ⛔ These are the ONLY hard-coded numbers in this suite, and they are here so that a change
        // to `contextBboxAround`, the 0.001° lattice snap or `farFetchHalfDeg` fails LOUDLY instead
        // of quietly re-pricing every budget above. Re-run, never re-transcribe.
        const EXPECT: Record<string, Record<number, number>> = {
            Barcelona: { 1781: 81, 2519: 156, 3562: 289, 5000: 529, 7071: 1056 },
            Madrid: { 1781: 81, 2519: 144, 3562: 272, 5000: 529, 7071: 1024 },
            'Córdoba': { 1781: 64, 2519: 144, 3562: 256, 5000: 484, 7071: 900 },
            Lisbon: { 1781: 81, 2519: 132, 3562: 272, 5000: 506, 7071: 961 },
            Oslo: { 1781: 169, 2519: 324, 3562: 600, 5000: 1156, 7071: 2256 },
            'Reykjavík': { 1781: 225, 2519: 420, 3562: 784, 5000: 1521, 7071: 2970 },
        };
        for (const [name, lat, lon] of CITIES) {
            for (const [rStr, want] of Object.entries(EXPECT[name]!)) {
                expect(tilesAt(lat, lon, Number(rStr)), `${name} @ ${rStr} m`).toBe(want);
            }
        }
    });

    it('⛔ the NORTH costs ~2× the tiles for the identical scope — 1/cos φ lands on the tile count', () => {
        // Why every ceiling in this subsystem is measured per site and never transcribed.
        const bcn = tilesAt(41.3874, 2.1686, 1781);
        expect(tilesAt(59.9139, 10.7522, 1781) / bcn).toBeGreaterThan(1.9);
        expect(tilesAt(64.1466, -21.9426, 1781) / bcn).toBeGreaterThan(2.7);
    });
});
