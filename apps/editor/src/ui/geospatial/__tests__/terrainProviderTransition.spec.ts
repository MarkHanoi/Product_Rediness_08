// §TERRAIN-RELOCATION-DETACH (L-12913) — the transition table behind the 3D-Site terrain attach,
// driven by the REAL resolver (`decideBakedTerrainAttach` + the live bbox tables) through the
// founder's 2026-09-05 route. The old wiring had no table: every non-attach verdict `return`ed,
// so a bounded tileset attached at one city stayed attached everywhere after it — and the log
// said "→ flat ground" while it did. These pin the invariant that replaces that:
//   after the verdict is applied, the viewer never holds a bounded provider that does not cover
//   the site, and "flat ground" is only ever said when the ground IS flat.
import { describe, it, expect } from 'vitest';
import { decideBakedTerrainAttach, terrainSlugForLonLat } from '../terrainCoverage';
import {
    resolveTerrainTransition,
    attachOutcomeStillHolds,
    describeTerrainTransition,
    type TerrainProviderState,
} from '../terrainProviderTransition';

const FORMA = { terrainEnabled: true, photorealActive: false, formaMode: true } as const;
const decide = (lat: number, lon: number) => decideBakedTerrainAttach({ ...FORMA, lat, lon });

// The founder's sites (2026-09-05 screenshots) + the east-hemisphere city whose tileset was the
// stale provider (its layer.json z0 `available` is the east root alone — the console's
// `L0(0,0)st3 FAILED / L0(1,0) READY-but-culled`).
const BARCELONA = { lat: 41.39, lon: 2.17 };
const SAO_MARTINHO = { lat: 39.509, lon: -9.134 };
const PORTO = { lat: 41.1447, lon: -8.6456 };
const GERMAN_VILLAGE = { lat: 49.85, lon: 10.2 };
// A site outside EVERY bbox (city and region) → the resolver's own `no-baked-city`.
const CASABLANCA = { lat: 33.57, lon: -7.59 };

const FLAT: TerrainProviderState = { attachedCity: null, reliefAttached: false };
const HOLDING_BARCELONA: TerrainProviderState = { attachedCity: 'barcelona', reliefAttached: true };

describe('§TERRAIN-RELOCATION-DETACH — resolveTerrainTransition', () => {
    it('sanity: the resolver routes the founder sites the way HEAD does today', () => {
        expect(terrainSlugForLonLat(BARCELONA.lon, BARCELONA.lat)).toBe('barcelona');
        // FINDING (2026-09-05, lane GLOBE-WHITE): the REGION table is first-match and the `spain` row
        // `[-9.55, 35.90, 4.60, 43.90]` contains all of Portugal, so every Portuguese site resolves to
        // `spain` and the `portugal` row is unreachable. Both tilesets are unpublished today (R2 404),
        // so the founder-visible outcome is identical; pinned here so the shadowing is a measured fact,
        // not a surprise, when the region bakes land. Not this lane's fix — logged in L-12913.
        expect(terrainSlugForLonLat(PORTO.lon, PORTO.lat)).toBe('spain');
        expect(terrainSlugForLonLat(SAO_MARTINHO.lon, SAO_MARTINHO.lat)).toBe('spain');
        expect(terrainSlugForLonLat(GERMAN_VILLAGE.lon, GERMAN_VILLAGE.lat)).toBe('germany');
        expect(terrainSlugForLonLat(CASABLANCA.lon, CASABLANCA.lat)).toBeNull();
    });

    it('THE L-12913 REPRODUCTION: no-baked-city while a bounded tileset is attached → DETACH, not keep', () => {
        // Production (ee5d00a2, no region table) read Porto as `no-baked-city`; this is that verdict
        // against the state the founder's console proved (`relief=ON provider=… normals=true`).
        const t = resolveTerrainTransition({ attach: false, reason: 'no-baked-city' }, HOLDING_BARCELONA);
        expect(t).toEqual({ action: 'detach', reason: 'no-baked-city', stale: 'barcelona' });
    });

    it('no-baked-city on a FLAT viewer → keep-flat (the un-baked-country no-regression path)', () => {
        const t = resolveTerrainTransition(decide(CASABLANCA.lat, CASABLANCA.lon), FLAT);
        expect(t).toEqual({ action: 'keep-flat', reason: 'no-baked-city' });
    });

    it('the attach chain finding NO tileset (every layer.json 404) while another city is attached → DETACH', () => {
        // HEAD routes Porto to `portugal`, whose layer.json is NOT published (R2 404, measured
        // 2026-09-05). The catch path must not leave Barcelona's provider under Porto.
        const t = resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable' }, HOLDING_BARCELONA);
        expect(t).toEqual({ action: 'detach', reason: 'tileset-unavailable', stale: 'barcelona' });
        // …and on a flat viewer the same finding is simply flat, honestly.
        expect(resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable' }, FLAT))
            .toEqual({ action: 'keep-flat', reason: 'tileset-unavailable' });
    });

    it('toggle-off / photoreal while attached → detach; on a flat viewer → keep-flat', () => {
        expect(resolveTerrainTransition({ attach: false, reason: 'toggle-off' }, HOLDING_BARCELONA).action).toBe('detach');
        expect(resolveTerrainTransition({ attach: false, reason: 'photoreal' }, HOLDING_BARCELONA).action).toBe('detach');
        expect(resolveTerrainTransition({ attach: false, reason: 'toggle-off' }, FLAT).action).toBe('keep-flat');
    });

    it('relocating to a DIFFERENT covered site → attach, naming the tileset it replaces', () => {
        const t = resolveTerrainTransition(decide(PORTO.lat, PORTO.lon), HOLDING_BARCELONA);
        const slug = terrainSlugForLonLat(PORTO.lon, PORTO.lat)!;         // 'spain' today (see the sanity test)
        expect(t).toEqual({ action: 'attach', city: slug, candidates: [slug], replaces: 'barcelona' });
    });

    it('first attach on a flat viewer names no replacement', () => {
        const t = resolveTerrainTransition(decide(BARCELONA.lat, BARCELONA.lon), FLAT);
        expect(t).toMatchObject({ action: 'attach', city: 'barcelona', replaces: null });
    });

    it('same city again → keep-attached (idempotent on every context load / pan)', () => {
        const t = resolveTerrainTransition(decide(BARCELONA.lat, BARCELONA.lon), HOLDING_BARCELONA);
        expect(t).toEqual({ action: 'keep-attached', city: 'barcelona' });
    });

    it('a REGION attached as the fallback for a listed city still serves that city → keep-attached', () => {
        // paris is a city row inside the france region; if paris 404s and france attaches, a later
        // pan over Paris must not re-probe paris every time.
        const paris = decide(48.86, 2.35);
        expect(paris.attach && paris.candidates).toEqual(['paris', 'france']);
        const t = resolveTerrainTransition(paris, { attachedCity: 'france', reliefAttached: true });
        expect(t).toEqual({ action: 'keep-attached', city: 'france' });
    });

    it('a tracked city with a FLAT provider is an inconsistent record → treated as "holding something"', () => {
        const t = resolveTerrainTransition({ attach: false, reason: 'no-baked-city' }, { attachedCity: 'barcelona', reliefAttached: false });
        expect(t.action).toBe('detach');
        // …and a covered site re-attaches rather than trusting the stale record.
        const a = resolveTerrainTransition(decide(BARCELONA.lat, BARCELONA.lon), { attachedCity: 'barcelona', reliefAttached: false });
        expect(a).toMatchObject({ action: 'attach', city: 'barcelona', replaces: null });
    });

    it("the founder's route, Barcelona → São Martinho → Porto → German village: never a stale provider", () => {
        // Walk the table with a tiny reducer mirroring the viewport (attach succeeds only for
        // tilesets that exist in R2 today; the region rows do not — measured 2026-09-05).
        const published = new Set(['barcelona', 'badalona', 'paris']);
        let state: TerrainProviderState = FLAT;
        const apply = (site: { lat: number; lon: number }): TerrainProviderState => {
            const t = resolveTerrainTransition(decide(site.lat, site.lon), state);
            if (t.action === 'detach') return FLAT;
            if (t.action !== 'attach') return state;
            const hit = t.candidates.find((c) => published.has(c));
            if (hit) return { attachedCity: hit, reliefAttached: true };
            const after = resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable' }, state);
            return after.action === 'detach' ? FLAT : state;
        };
        state = apply(BARCELONA);
        expect(state).toEqual({ attachedCity: 'barcelona', reliefAttached: true });
        for (const site of [SAO_MARTINHO, PORTO, GERMAN_VILLAGE, CASABLANCA]) {
            state = apply(site);
            // The invariant: whatever is attached covers THIS site, or nothing is attached.
            const slug = terrainSlugForLonLat(site.lon, site.lat);
            if (state.reliefAttached) expect(state.attachedCity).toBe(slug);
            else expect(state).toEqual(FLAT);
        }
        // Coming back re-attaches (no "already attached" memory survives the detach).
        expect(resolveTerrainTransition(decide(BARCELONA.lat, BARCELONA.lon), state).action).toBe('attach');
    });
});

describe('§TERRAIN-RELOCATION-DETACH — attachOutcomeStillHolds (the memo is a fact about a provider state)', () => {
    it('an "attached" memo holds only while that slug is still the live provider', () => {
        expect(attachOutcomeStillHolds({ kind: 'attached', slug: 'barcelona' }, HOLDING_BARCELONA)).toBe(true);
        expect(attachOutcomeStillHolds({ kind: 'attached', slug: 'barcelona' }, FLAT)).toBe(false);
        expect(attachOutcomeStillHolds({ kind: 'attached', slug: 'barcelona' }, { attachedCity: 'paris', reliefAttached: true })).toBe(false);
    });

    it('an "unavailable" memo holds only while the ground is flat — the reverse-direction L-12913', () => {
        // "portugal → unavailable" memoised at session start (flat). Then Barcelona attached. A
        // later Porto call must NOT be short-circuited by that memo, or Barcelona stays under Porto.
        expect(attachOutcomeStillHolds({ kind: 'unavailable' }, FLAT)).toBe(true);
        expect(attachOutcomeStillHolds({ kind: 'unavailable' }, HOLDING_BARCELONA)).toBe(false);
    });

    it('a "dropped" memo never holds — it was never a verdict about the tileset', () => {
        expect(attachOutcomeStillHolds({ kind: 'dropped' }, FLAT)).toBe(false);
        expect(attachOutcomeStillHolds({ kind: 'dropped' }, HOLDING_BARCELONA)).toBe(false);
    });
});

describe('§TERRAIN-RELOCATION-DETACH — describeTerrainTransition (the log cannot claim flat ground while relief is ON)', () => {
    const cases = [
        resolveTerrainTransition({ attach: false, reason: 'no-baked-city' }, HOLDING_BARCELONA),
        resolveTerrainTransition({ attach: false, reason: 'tileset-unavailable' }, HOLDING_BARCELONA),
        resolveTerrainTransition(decide(BARCELONA.lat, BARCELONA.lon), HOLDING_BARCELONA),
        resolveTerrainTransition(decide(PORTO.lat, PORTO.lon), HOLDING_BARCELONA),
    ];
    it('says "flat ground" ONLY on keep-flat', () => {
        for (const t of cases) {
            expect(t.action).not.toBe('keep-flat');
            expect(describeTerrainTransition(t, PORTO.lat, PORTO.lon)).not.toMatch(/flat ground/);
        }
        const flat = resolveTerrainTransition({ attach: false, reason: 'no-baked-city' }, FLAT);
        expect(describeTerrainTransition(flat, CASABLANCA.lat, CASABLANCA.lon)).toMatch(/flat ground/);
    });
    it('a detach names the stale tileset, the L-number and the mechanism', () => {
        const line = describeTerrainTransition(cases[0]!, PORTO.lat, PORTO.lon);
        expect(line).toMatch(/L-12913/);
        expect(line).toMatch(/'barcelona'/);
        expect(line).toMatch(/Detaching/);
    });
});
