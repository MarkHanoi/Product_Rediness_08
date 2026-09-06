// §LANDUSE-SEA-RECLIP-IN-PLACE (L-12972, founder Sète 2026-09-06: "really slow rendering the 3d
// view once the parcel has been selected — especially since latest deployment").
//
// THE SUBJECT. `loadContextSea` used to force the ENTIRE land-use layer to reload in order to
// obtain ONE filter — the `keptAreas` test that drops polygons over water. §GROUND-DRAPE-ON-RELIEF
// (L-12924) made that forced pass cost 13 788 pieces plus two terrain round-trips at Sète, and the
// founder's console prints the identical piece count TWICE in one session. The re-clip is now an
// in-place REMOVAL, and these pin the two things that makes it safe:
//   1. it removes EXACTLY what the full re-run would have removed (same centroid rule), and
//   2. the one case a removal cannot serve — a coastline that SHRANK, where grey must come BACK —
//      still takes the full reload.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    landuseAreaClipCentroid,
    seaRingsSignature,
    planLanduseSeaClip,
    decideLanduseReclip,
    type LonLat,
} from '../contextLanduseSeaClip';

/** Sète: the town sits on the strip between the Mediterranean and the Étang de Thau, under Mont
 *  St Clair. A coastal site is the ONLY kind that enters this path — Córdoba is inland, has no sea
 *  rings, and never reaches it, which is exactly why the founder sees this at Sète and not there. */
const MED: LonLat[] = [[3.66, 43.36], [3.74, 43.36], [3.74, 43.395], [3.66, 43.395], [3.66, 43.36]];
const THAU: LonLat[] = [[3.60, 43.41], [3.70, 43.41], [3.70, 43.45], [3.60, 43.45], [3.60, 43.41]];
const inSea = (lon: number, lat: number): boolean => {
    const hit = (r: LonLat[]): boolean =>
        lon >= r[0]![0] && lon <= r[1]![0] && lat >= r[0]![1] && lat <= r[2]![1];
    return hit(MED) || hit(THAU);
};

describe('landuseAreaClipCentroid — the SAME centroid the keptAreas filter computes', () => {
    it('is the plain vertex mean over EVERY stored vertex, closing duplicate included', () => {
        // A closed square whose first vertex repeats. The plain mean is pulled toward that repeat;
        // an area-weighted or duplicate-dropping centroid would NOT be, and would then disagree
        // with the filter on the polygons nearest the coast — the only ones that matter.
        const ring: LonLat[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
        const c = landuseAreaClipCentroid(ring)!;
        expect(c[0]).toBeCloseTo(20 / 5, 12);
        expect(c[1]).toBeCloseTo(20 / 5, 12);
    });

    it('reproduces the filter that `loadContextLanduse` actually runs, read from its source', () => {
        // ⭐ THE ANTI-DRIFT ARM. The in-place clip is only correct while it agrees with the filter
        // the full re-run would apply. So the filter is READ OUT of CesiumViewport.ts and executed
        // here: if someone changes the centroid rule in one place, this fails.
        const src = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');
        const start = src.indexOf('const keptAreas = collection.areas.filter(');
        expect(start).toBeGreaterThan(0);
        const body = src.slice(start, src.indexOf('});', start));
        // The three lines that compute the centroid, verbatim in the shipped source.
        expect(body).toContain('let cx = 0, cy = 0;');
        expect(body).toContain('for (const p of area.ring) { cx += p[0]; cy += p[1]; }');
        expect(body).toContain('cx /= area.ring.length; cy /= area.ring.length;');
        expect(body).toContain('this.isLonLatInSea(cx, cy)');
        // And it is guarded on >= 3 vertices, which is why this module returns null below that.
        expect(body).toContain('area.ring.length >= 3');

        // Execute the filter's own arithmetic on a Sète-shaped ring and compare.
        const ring: LonLat[] = [[3.691, 43.401], [3.698, 43.399], [3.702, 43.406], [3.693, 43.408], [3.691, 43.401]];
        let cx = 0, cy = 0;
        for (const p of ring) { cx += p[0]; cy += p[1]; }
        cx /= ring.length; cy /= ring.length;
        const c = landuseAreaClipCentroid(ring)!;
        expect(c[0]).toBe(cx);
        expect(c[1]).toBe(cy);
    });

    it('returns null — never a guessed point — for a degenerate or non-finite ring', () => {
        expect(landuseAreaClipCentroid([[0, 0], [1, 1]])).toBeNull();     // the filter's >= 3 guard
        expect(landuseAreaClipCentroid([])).toBeNull();
        expect(landuseAreaClipCentroid([[0, 0], [1, NaN], [2, 2]])).toBeNull();
    });
});

describe('planLanduseSeaClip — removes what the forced reload removed, and nothing else', () => {
    it('drops every piece of an area over water and keeps every piece of an area on land', () => {
        const onLand = landuseAreaClipCentroid([[3.690, 43.400], [3.700, 43.400], [3.700, 43.405], [3.690, 43.400]])!;
        const inMed = landuseAreaClipCentroid([[3.700, 43.370], [3.710, 43.370], [3.710, 43.380], [3.700, 43.370]])!;
        expect(inSea(onLand[0], onLand[1])).toBe(false);
        expect(inSea(inMed[0], inMed[1])).toBe(true);
        // 12 pieces of the land area, 8 of the sea area — the L-12924 split shape.
        const centroids = [
            ...Array.from({ length: 12 }, () => onLand),
            ...Array.from({ length: 8 }, () => inMed),
        ];
        const plan = planLanduseSeaClip({ centroids, inSea });
        expect(plan.removeIdx).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
        expect(plan.areasRemoved).toBe(1);
        expect(plan.unkeyed).toBe(0);
    });

    it('tests each DISTINCT area ONCE — 13 788 pieces of 1 342 areas cost 1 342 point-in-polygon walks', () => {
        // The perf argument, asserted rather than asserted-in-prose: `inSea` walks every sea ring,
        // and Sète's live-coastline supplement is not small.
        let calls = 0;
        const counting = (lon: number, lat: number): boolean => { calls++; return inSea(lon, lat); };
        const areas = Array.from({ length: 1342 }, (_, i) => [3.66 + (i % 40) * 0.0005, 43.40 + Math.floor(i / 40) * 0.0005] as LonLat);
        const centroids: LonLat[] = [];
        for (const a of areas) for (let k = 0; k < 10; k++) centroids.push(a);
        const plan = planLanduseSeaClip({ centroids, inSea: counting });
        expect(centroids.length).toBe(13420);
        expect(calls).toBe(1342);
        expect(plan.areasTested).toBe(1342);
    });

    it('KEEPS a piece whose area centroid was never recorded — unknown is not "over the sea"', () => {
        // §CONTEXT-DATA-HONESTY / C84 EI-6. The founder's OTHER standing complaint is that things
        // go MISSING; a clip that deletes what it cannot locate trades one of his bugs for the other.
        const plan = planLanduseSeaClip({ centroids: [null, undefined, [NaN, 1]], inSea: () => true });
        expect(plan.removeIdx).toEqual([]);
        expect(plan.unkeyed).toBe(3);
    });

    it('a throwing sea test keeps the piece rather than deleting it', () => {
        const plan = planLanduseSeaClip({
            centroids: [[3.69, 43.40]],
            inSea: () => { throw new Error('ring is malformed'); },
        });
        expect(plan.removeIdx).toEqual([]);
    });
});

describe('seaRingsSignature — a change detector, and it must detect the founder’s two rings', () => {
    it('is stable for the same coastline and different for a different one', () => {
        expect(seaRingsSignature([MED, THAU])).toBe(seaRingsSignature([MED, THAU]));
        expect(seaRingsSignature([MED, THAU])).not.toBe(seaRingsSignature([MED]));
        expect(seaRingsSignature([])).toBe('sea:0');
        // A ring whose vertices moved is a different coastline.
        const moved: LonLat[] = MED.map(([x, y]) => [x + 0.01, y] as LonLat);
        expect(seaRingsSignature([moved])).not.toBe(seaRingsSignature([MED]));
    });
});

describe('decideLanduseReclip — the expensive answer is reachable only by the case that needs it', () => {
    const base = { drawnPieces: 13788, clippedAgainstSignature: 'sea:0', currentSignature: 'sea:2|…', areasRemovedInPlace: 0 };

    it('SKIPS entirely when the drape was already clipped against exactly this coastline', () => {
        // THE Sète win: `loadContextSea` runs from BOTH the framing funnel and `loadContextWater`,
        // so this branch is what stops the second and third sea load re-splitting 13 788 pieces.
        expect(decideLanduseReclip({ ...base, clippedAgainstSignature: 'sea:2|…' })).toBe('skip-unchanged');
    });

    it('clips IN PLACE when the coastline arrived after the drape and nothing has been removed yet', () => {
        expect(decideLanduseReclip(base)).toBe('clip-in-place');
    });

    it('falls back to the FULL reload when a coastline changes after an in-place removal', () => {
        // ⛔ Do not optimise this away. A removal cannot RESTORE grey, so a receding coastline
        // would permanently eat the land-use behind it — the MISSING complaint bought with the
        // SLOW one.
        expect(decideLanduseReclip({ ...base, areasRemovedInPlace: 4 })).toBe('full-reload');
    });

    it('reports nothing-drawn before any land-use pass has placed a piece', () => {
        expect(decideLanduseReclip({ ...base, drawnPieces: 0 })).toBe('nothing-drawn');
        expect(decideLanduseReclip({ ...base, drawnPieces: 0, clippedAgainstSignature: null })).toBe('nothing-drawn');
    });
});

describe('CesiumViewport wiring — the forced reload is GONE and the in-place clip is REACHED', () => {
    const src = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');
    /** CODE only. The doc comments deliberately QUOTE the line this lane removed so the next
     *  reader knows what was there, and a raw-source scan would match the quotation and pass —
     *  or, worse, fail on a correct tree. Strip `//` and ` *` lines before asserting on code. */
    const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');

    it('no longer forces a whole land-use reload from the sea path', () => {
        // The exact line this lane removed (§FORMA-CTX-LANDUSE-SEA-CLIP, L-642, 2026-07-29) called
        // `loadContextLanduse` with force=true guarded on a non-empty ring list.
        expect(code).not.toMatch(/if\s*\(this\.contextSeaRingsLonLat\.length\s*>\s*0\)\s*void\s+this\.loadContextLanduse\(/);
    });

    it('reaches the in-place clip from BOTH the sea pass and the land-use pass', () => {
        // Either ordering must end clipped: whichever of the two finishes last does the work.
        expect(src).toContain('this.reclipContextLanduseAgainstSea(lat, lon, { mayStartLayer: true });');
        expect(src).toContain('this.reclipContextLanduseAgainstSea(lat, lon, { mayStartLayer: false });');
    });

    it('records the coastline seen by the FILTER, not the one present when the pass ends', () => {
        // The mid-pass race: the sea and the land-use both fetch Overpass and neither waits for the
        // other. Recording the later signature would mark the drape clipped against a coastline it
        // never met and the grey would bleed past the coast for good.
        expect(src).toContain('const seaSignatureAtFilter = seaRingsSignature(this.contextSeaRingsLonLat);');
        expect(src).toContain('this.contextLanduseSeaSignature = seaSignatureAtFilter;');
        const filterAt = src.indexOf('const keptAreas = collection.areas.filter(');
        const captureAt = src.indexOf('const seaSignatureAtFilter =');
        expect(captureAt).toBeGreaterThan(0);
        expect(captureAt).toBeLessThan(filterAt);
    });

    it('clearing the layer clears what it was clipped against', () => {
        const start = src.indexOf('public clearContextLanduse(): void {');
        expect(start).toBeGreaterThan(0);
        const body = src.slice(start, src.indexOf('\n  }', start));
        expect(body).toContain('this.contextLanduseSeaSignature = null;');
        expect(body).toContain('this.contextLanduseSeaClipRemoved = 0;');
    });

    it('cannot re-enter itself when a pass legitimately places ZERO pieces', () => {
        // Every area clipped off the sea → an empty list → `nothing-drawn` → a kick → the same
        // pass again, for ever. The land-use tail passes `mayStartLayer:false` and this guard is
        // what consumes it.
        const start = src.indexOf('private reclipContextLanduseAgainstSea(');
        expect(start).toBeGreaterThan(0);
        const body = src.slice(start, src.indexOf('\n  }', start));
        expect(body).toContain('if (!opts.mayStartLayer) return;');
    });
});
