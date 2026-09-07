// §TERRAIN-PUBLISHED-ORPHAN + §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170, 2026-09-07, lane
// GULF-TERRAIN-SLUG) — the founder's Gulf sites had real relief on 2026-09-05 and a flat ellipsoid
// on 2026-09-06 with no bake, no deletion from R2 and no error. Only a table edit: §ME-NATIONAL
// added an UNBAKED `gccstates` row and deleted the five PUBLISHED metro rows in the same commit.
//
// WHAT THIS SPEC PINS, and what it deliberately does NOT.
//   • It PINS that Dubai / Abu Dhabi / Riyadh / Jeddah / Doha and the five orphaned US metros each
//     resolve to a candidate list containing a slug that was PROBED HTTP 200 on 2026-09-07.
//   • It PINS the ORDER: the intended winner (`gccstates`, `california`, …) is still tried FIRST, so
//     the day its bake is published nothing has to change and the legacy row simply goes quiet.
//   • It PINS that every legacy row sits inside the tileset's OWN layer.json bounds, so the resolver
//     can never emit a candidate §TERRAIN-TILESET-BOUNDS-CHECK (L-12923) would have to refuse.
//   • It PINS that "the tileset is missing" and "this site has no relief" print DIFFERENT sentences.
//   • ⛔ It does NOT assert live HTTP. The probe is a RECORDED MEASUREMENT with a date, not a network
//     call in a unit test — the numbers below are the sweep in ISSUE-LOG L-13170, and a re-sweep is
//     how they are refreshed. A test that hit R2 would go red on a publish, which is the wrong signal.
import { describe, it, expect } from 'vitest';
import {
    TERRAIN_LEGACY_BBOXES,
    TERRAIN_CITY_BBOXES,
    TERRAIN_REGION_BBOXES,
    terrainSlugCandidates,
    terrainSlugCandidatesDetailed,
    decideBakedTerrainAttach,
    terrainTilesetUrl,
} from '../terrainCoverage';
import { resolveTerrainTransition, describeTerrainTransition } from '../terrainProviderTransition';

/**
 * The R2 probe, 2026-09-07, `GET https://pryzm.fly.dev/api/context-tiles/terrain/<slug>/layer.json`.
 * 704 emittable slugs swept: 617 → HTTP 200, 87 → HTTP 404. Only the rows this spec reasons about are
 * transcribed; the full 87-slug 404 list lives in ISSUE-LOG L-13170 (one place, one reading).
 */
const PROBE_2026_09_07 = {
    published: new Set([
        'dubai', 'abudhabi', 'riyadh', 'jeddah', 'doha',
        'sanfrancisco', 'chicago', 'austin', 'houston', 'boston',
        'newyork', 'barcelona', 'paris', 'spain', 'france', 'portugal',
    ]),
    notPublished: new Set([
        'gccstates', 'turkey', 'israel', 'jordan', 'lebanon',
        'california', 'illinois', 'texas', 'massachusetts', 'ontario', 'mexico',
        'japan', 'southkorea', 'ukraine', 'helsinki', 'stockholm',
    ]),
} as const;

/**
 * The founder's own coordinates, plus the other Gulf/US metros orphaned by the same two commits.
 *
 * `primary` is given ONLY for the five Gulf rows, where the founder's own console proves it
 * (`evaluate lat=25.18451 lon=55.25983 → city=gccstates`). ⛔ It is deliberately NOT given for the US
 * rows: `mostInterior` on coarse rectangles picks a FOREIGN row over three of them (Chicago →
 * `ontario`, Houston/Austin → `mexico` or `texas` depending on which rectangles exist that week —
 * terrainCoverage.ts records this as a measured limitation, not a bug to tune away). Hard-coding a
 * winner there would pin an accident and go red the next time a state rectangle moves. The invariant
 * that MATTERS holds for all ten and is asserted for all ten: a published tileset is reachable, and
 * every candidate ahead of the legacy one comes from the city or region tables.
 */
const ORPHANED_SITES = [
    { name: 'Dubai — Business Bay (the founder, fallback=163)', lon: 55.25983, lat: 25.18451, wants: 'dubai', primary: 'gccstates' },
    { name: 'Abu Dhabi (the founder, fallback=620)', lon: 54.36988, lat: 24.48723, wants: 'abudhabi', primary: 'gccstates' },
    { name: 'Riyadh', lon: 46.72, lat: 24.69, wants: 'riyadh', primary: 'gccstates' },
    { name: 'Jeddah', lon: 39.19, lat: 21.54, wants: 'jeddah', primary: 'gccstates' },
    { name: 'Doha', lon: 51.52, lat: 25.28, wants: 'doha', primary: 'gccstates' },
    { name: 'San Francisco', lon: -122.42, lat: 37.77, wants: 'sanfrancisco', primary: null },
    { name: 'Chicago', lon: -87.63, lat: 41.88, wants: 'chicago', primary: null },
    { name: 'Austin', lon: -97.74, lat: 30.27, wants: 'austin', primary: null },
    { name: 'Houston', lon: -95.37, lat: 29.76, wants: 'houston', primary: null },
    { name: 'Boston', lon: -71.06, lat: 42.36, wants: 'boston', primary: null },
] as const;

describe('§TERRAIN-PUBLISHED-ORPHAN (L-13170) — a published tileset is never unreachable', () => {
    it.each(ORPHANED_SITES)('$name resolves to a candidate that EXISTS on R2', (site) => {
        const candidates = terrainSlugCandidates(site.lon, site.lat);
        expect(candidates).toContain(site.wants);
        // The whole defect in one assertion: before this lane, EVERY candidate for these points was
        // a slug that answers 404, so the site fell to a flat ellipsoid with live relief on the shelf.
        const servable = candidates.filter((c) => PROBE_2026_09_07.published.has(c));
        expect(servable.length).toBeGreaterThan(0);
    });

    it.each(ORPHANED_SITES)('$name still tries its INTENDED winner first — the legacy row is a fallback, not a preference', (site) => {
        const scoped = terrainSlugCandidatesDetailed(site.lon, site.lat);
        const legacyAt = scoped.findIndex((c) => c.slug === site.wants);
        expect(legacyAt).toBeGreaterThan(0);                       // never the primary
        expect(scoped[legacyAt]!.scope).toBe('legacy');
        // Everything ahead of it is a REAL table row, so publishing the intended bake needs no code change.
        for (const ahead of scoped.slice(0, legacyAt)) expect(ahead.scope).not.toBe('legacy');
        // …and the primary is a slug the probe found MISSING, which is exactly why the site went flat.
        expect(PROBE_2026_09_07.published.has(scoped[0]!.slug)).toBe(false);
        if (site.primary !== null) expect(scoped[0]!.slug).toBe(site.primary);
    });

    it('every legacy candidate it emits is inside that tileset’s own layer.json bounds', () => {
        // The bboxes ARE the live `bounds`, so this is a tautology today — pinned so it stays one.
        // A widened legacy bbox would start emitting candidates §TERRAIN-TILESET-BOUNDS-CHECK must
        // refuse, which is the `newyork` failure mode (a 200 that cannot serve the site) recreated.
        for (const row of TERRAIN_LEGACY_BBOXES) {
            const [w, s, e, n] = row.bbox;
            const centre = { lon: (w + e) / 2, lat: (s + n) / 2 };
            expect(terrainSlugCandidates(centre.lon, centre.lat)).toContain(row.slug);
            expect(e).toBeGreaterThan(w);
            expect(n).toBeGreaterThan(s);
        }
    });

    it('a legacy slug is NOT also a city or region slug — one row per tileset, one namespace', () => {
        const cities = new Set(TERRAIN_CITY_BBOXES.map((r) => r.city));
        const regions = new Set(TERRAIN_REGION_BBOXES.map((r) => r.region));
        for (const row of TERRAIN_LEGACY_BBOXES) {
            expect(cities.has(row.slug)).toBe(false);
            expect(regions.has(row.slug)).toBe(false);
        }
    });

    it('a point outside all three tables still gets NOTHING — coverage is never invented', () => {
        // Mid-Atlantic, and the Sahara 500 km south of every Gulf row. Flat IS the right answer here.
        expect(terrainSlugCandidates(-30, 30)).toEqual([]);
        expect(terrainSlugCandidates(20, 10)).toEqual([]);
        expect(decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true,
            boundedTerrainPermitted: true, lon: -30, lat: 30,
        })).toEqual({ attach: false, reason: 'no-baked-city' });
    });
});

describe('§TERRAIN-SLUG-SCOPE (L-13170) — the console stops printing a region under the word "city"', () => {
    it('labels each candidate with the table it came from', () => {
        const dubai = terrainSlugCandidatesDetailed(55.25983, 25.18451);
        expect(dubai).toEqual([
            { slug: 'gccstates', scope: 'region' },
            { slug: 'dubai', scope: 'legacy' },
        ]);
        expect(terrainSlugCandidatesDetailed(2.15, 41.39)[0]).toEqual({ slug: 'barcelona', scope: 'city' });
    });

    it("the founder's line reads slug=… scope=region, not city=gccstates", () => {
        const decision = decideBakedTerrainAttach({
            terrainEnabled: true, photorealActive: false, formaMode: true,
            boundedTerrainPermitted: true, lon: 55.25983, lat: 25.18451,
        });
        expect(decision).toMatchObject({ attach: true, city: 'gccstates', scope: 'region' });
        const line = describeTerrainTransition(
            resolveTerrainTransition(decision, { attachedCity: null, reliefAttached: false }),
            25.18451, 55.25983,
        );
        expect(line).toMatch(/slug=gccstates scope=region/);
        expect(line).not.toMatch(/city=gccstates/);
        expect(line).toMatch(/fallbacks: dubai/);
    });

    it('the URL is one namespace — scope never changes the path', () => {
        // `terrain/<slug>/` for all three scopes. This is the claim that makes "region name sent where
        // a city name was required" the WRONG diagnosis: there is no city-only path to send it to.
        for (const slug of ['barcelona', 'gccstates', 'dubai']) {
            expect(terrainTilesetUrl(slug)).toMatch(new RegExp(`terrain/${slug}\\?v=`));
        }
    });
});

describe('§TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) — a missing tileset never prints as "no relief"', () => {
    const FLAT = { attachedCity: null, reliefAttached: false } as const;
    const HOLDING = { attachedCity: 'barcelona', reliefAttached: true } as const;

    it('names the slugs it asked for, and says a bake+publish is the fix', () => {
        const t = resolveTerrainTransition(
            { attach: false, reason: 'tileset-unavailable', tried: ['gccstates'] }, FLAT,
        );
        const line = describeTerrainTransition(t, 25.18451, 55.25983);
        expect(line).toMatch(/L-13170/);
        expect(line).toMatch(/'gccstates'/);
        expect(line).toMatch(/MISSING TILESET, not a site without relief/);
        expect(line).toMatch(/layer\.json/);
    });

    it('is a DIFFERENT sentence from the honest empty — this is the whole §CONTEXT-DATA-HONESTY point', () => {
        const missing = describeTerrainTransition(
            resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable', tried: ['gccstates'] }, FLAT),
            25.18451, 55.25983,
        );
        const empty = describeTerrainTransition(
            resolveTerrainTransition({ attach: false, reason: 'no-baked-city' }, FLAT),
            30.0, -30.0,
        );
        expect(missing).not.toBe(empty);
        // The empty says flat is CORRECT and nothing needs publishing; the missing says the opposite.
        expect(empty).toMatch(/honest EMPTY/);
        expect(empty).not.toMatch(/MISSING TILESET/);
        expect(missing).not.toMatch(/honest EMPTY/);
        // Both are keep-flat, so both may (and must) still say "flat ground" — the older honesty rule.
        expect(missing).toMatch(/flat ground/);
        expect(empty).toMatch(/flat ground/);
    });

    it('the DETACH leg does not borrow L-12913’s "bounds do not cover this site" — that would be false', () => {
        const line = describeTerrainTransition(
            resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable', tried: ['gccstates'] }, HOLDING),
            25.18451, 55.25983,
        );
        expect(line).toMatch(/L-13170/);
        expect(line).not.toMatch(/L-12913/);
        expect(line).toMatch(/'barcelona'/);
        expect(line).not.toMatch(/flat ground/);       // a bounded provider is still attached at this instant
    });
});
