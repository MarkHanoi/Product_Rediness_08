// §TERRAIN-RELOCATION-DETACH (L-12913, 2026-09-05) — the PURE state machine behind
// `CesiumViewport.maybeAttachTerrainProvider`: given what the resolver DECIDED for the new site
// (`decideBakedTerrainAttach`, terrainCoverage.ts) and what the viewer currently HOLDS, what must
// happen to `viewer.terrainProvider`?
//
// THE DEFECT THIS EXISTS FOR. A baked quantized-mesh tileset is BOUNDED: its `layer.json`
// `available` ranges cover one city (or one region) and, at level 0, only the hemisphere that
// city sits in (Barcelona's z0 `available` is `{startX:1,endX:1}` — the east root alone). Outside
// those bounds Cesium has nothing to draw: the root tile for the other hemisphere FAILS (404), the
// covered root is culled behind the horizon, `renderedTerrainTiles=0`, and the page background IS
// the ground — the founder's all-white 3D Site at São Martinho / Porto / a German village. The
// attach function's early returns (`no-baked-city`, no tiles base, every `layer.json` 404) used to
// `return` and LEAVE THE PREVIOUS CITY'S PROVIDER ATTACHED, while logging "→ flat ground" — a
// claim that was false whenever a provider was already attached. UNREACHABLE and EMPTY are
// different facts (C84 EI-6): "no tileset covers this site" must DETACH to the flat ellipsoid,
// never keep a tileset that covers somewhere else.
//
// Kept Cesium-free so the transition table is unit-testable (the same precedent as
// `decideBakedTerrainAttach` / `resolveTerrainClampBase`); the viewport only executes the verdict.
import type { TerrainAttachDecision, TerrainSlugScope } from './terrainCoverage';

/** What the viewport currently HOLDS — read from the live viewer, never assumed. */
export interface TerrainProviderState {
    /** The tileset slug the viewport believes is attached (`null` = none tracked). May be a
     *  REGION slug when a listed city's `layer.json` 404'd and the caller fell through. */
    readonly attachedCity: string | null;
    /** TRUE when the live `viewer.terrainProvider` is a bounded, availability-bearing provider
     *  (i.e. NOT the default `EllipsoidTerrainProvider`) — `groundReliefAttached()` in the viewport. */
    readonly reliefAttached: boolean;
}

/** Why the site keeps / goes to flat ground. Extends the resolver's reasons with the one the
 *  resolver cannot know: the tileset it named does not exist in R2 (every candidate 404'd). */
export type TerrainFlatReason =
    | Extract<TerrainAttachDecision, { attach: false }>['reason']
    | 'tileset-unavailable';

/** The resolver's verdict, or the attach chain's own "nothing loaded" verdict.
 *  §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) — `tried` carries the slugs whose `layer.json` the
 *  chain actually asked for, so the flat-ground line can NAME them. Optional only so a caller that
 *  genuinely has no list (a test) still compiles; the viewport always passes `candidates`. */
export type TerrainTransitionInput =
    | TerrainAttachDecision
    | { readonly attach: false; readonly reason: 'tileset-unavailable'; readonly tried?: readonly string[] };

export type TerrainTransition =
    /** Nothing attached, nothing to attach → the ellipsoid IS the ground. The ONLY case where
     *  "flat ground" may be logged. `tried` is non-empty only for `tileset-unavailable`. */
    | { readonly action: 'keep-flat'; readonly reason: TerrainFlatReason; readonly tried?: readonly string[] }
    /** A tileset that serves this site is already attached — idempotent, no churn. */
    | { readonly action: 'keep-attached'; readonly city: string }
    /** A bounded tileset is attached but does NOT serve this site → revert to the ellipsoid. */
    | { readonly action: 'detach'; readonly reason: TerrainFlatReason; readonly stale: string | null; readonly tried?: readonly string[] }
    /** Attach `city` (trying `candidates` most-detailed-first); `replaces` names the tileset
     *  currently attached that will be superseded, or `null` when the ground is flat today.
     *  `scope` says WHICH TABLE `city` came from (§TERRAIN-SLUG-SCOPE, L-13170) so the console
     *  stops printing a region slug under the word `city=`. */
    | { readonly action: 'attach'; readonly city: string; readonly scope: TerrainSlugScope; readonly candidates: readonly string[]; readonly replaces: string | null };

/**
 * The transition table. Invariant it enforces: after the verdict is applied, the viewer never
 * holds a bounded provider whose coverage does not include the site.
 */
export function resolveTerrainTransition(
    decision: TerrainTransitionInput,
    state: TerrainProviderState,
): TerrainTransition {
    // A tracked city with a flat provider (or the reverse) is an inconsistent record; either way
    // "something is attached" is the safe reading — detaching costs one flat reset.
    const holdsSomething = state.reliefAttached || state.attachedCity !== null;
    if (!decision.attach) {
        // `tried` is present ONLY when there is something to name — an empty array in every other
        // verdict would be a field that says nothing while looking like it does.
        const tried = decision.reason === 'tileset-unavailable' && decision.tried?.length ? { tried: decision.tried } : {};
        return holdsSomething
            ? { action: 'detach', reason: decision.reason, stale: state.attachedCity, ...tried }
            : { action: 'keep-flat', reason: decision.reason, ...tried };
    }
    // Idempotence: the attached tileset serves this site when it is the primary slug OR any
    // fallback candidate (a region attached because the city's layer.json 404'd must not be
    // re-probed on every pan — the memo owns re-probing).
    if (state.reliefAttached && state.attachedCity !== null && decision.candidates.includes(state.attachedCity)) {
        return { action: 'keep-attached', city: state.attachedCity };
    }
    return {
        action: 'attach',
        city: decision.city,
        scope: decision.scope,
        candidates: decision.candidates,
        replaces: state.reliefAttached ? state.attachedCity : null,
    };
}

/**
 * The memoised OUTCOME of one attach chain, keyed by the primary slug it was asked for. The
 * viewport keeps these so repeat pans over the same site do not re-hammer `layer.json`
 * (§TERRAIN-SEAT-RACE, L-635) — but a memo is only a fact about the provider state it produced.
 */
export type TerrainAttachOutcome =
    /** `slug` (primary or fallback) is now the live provider. */
    | { readonly kind: 'attached'; readonly slug: string }
    /** Every candidate's `layer.json` failed (or no tiles base) — the site is flat, honestly. */
    | { readonly kind: 'unavailable' }
    /** Superseded by a newer site / viewer disposed mid-flight. Says NOTHING about the tileset. */
    | { readonly kind: 'dropped' };

/**
 * Is a memoised outcome still a true statement about the live viewer? FALSE means the provider
 * changed since (another city attached, a detach happened, or the chain was dropped) and the
 * caller must run a fresh attach chain instead of trusting the memo. This is what stops the
 * memo from reproducing L-12913 in the other direction: a "portugal → unavailable" memo taken
 * while the ground was flat must not short-circuit a later call made while Barcelona's tileset
 * is attached.
 */
export function attachOutcomeStillHolds(outcome: TerrainAttachOutcome, state: TerrainProviderState): boolean {
    switch (outcome.kind) {
        case 'attached': return state.reliefAttached && state.attachedCity === outcome.slug;
        case 'unavailable': return !state.reliefAttached;
        case 'dropped': return false;
    }
}

/**
 * §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170, 2026-09-07) — "we asked for a tileset that does not
 * exist" and "this site genuinely has no baked relief" MUST NOT PRINT THE SAME SENTENCE.
 *
 * §CONTEXT-DATA-HONESTY: a failure and an empty are different values. Until this section, both
 * reasons rendered the identical `skip: <reason> — flat ground: no tileset attached` line, differing
 * only by one hyphenated word buried mid-sentence. That is what cost the Gulf lane its five minutes
 * of finding and a day of the founder's testing: `gccstates` 404'd for every tile, the console said
 * `relief=off` and `flat ground`, and nothing anywhere said "the tileset we named is not published".
 *
 *   • `no-baked-city`      — ZERO candidates. No table covers this point. FLAT IS THE RIGHT ANSWER
 *                            and the line says so; there is nothing to fix and nothing to publish.
 *   • `tileset-unavailable` — candidates existed and EVERY ONE of them failed to load. The ground is
 *                            flat because a tileset is MISSING, and the line names the slugs asked
 *                            for so the reader can probe them. ⛔ Never soften this into "no relief".
 *
 * The older honesty rule still holds and is still pinned by the spec: the words "flat ground" appear
 * ONLY on `keep-flat` — never while a bounded provider is attached (the old
 * `skip: no-baked-city … → flat ground` line was false in exactly that state).
 */
function describeMissingTilesets(tried: readonly string[] | undefined): string {
    const named = tried && tried.length
        ? `We asked for terrain called ${tried.map((s) => `'${s}'`).join(', ')} and NONE of them loaded`
        : 'We asked for a terrain tileset and it did not load';
    return `${named} — a MISSING TILESET, not a site without relief. Probe it:`
        + ` GET <tiles base>/terrain/${tried && tried.length ? tried[0] : '<slug>'}/layer.json.`
        + ` If it 404s the slug is declared in the client's coverage tables but was never baked or published;`
        + ` the fix is a bake + publish of that slug, NOT a client-side substitute.`;
}

export function describeTerrainTransition(t: TerrainTransition, lat: number, lon: number): string {
    const where = `lat=${lat.toFixed(5)} lon=${lon.toFixed(5)}`;
    switch (t.action) {
        case 'keep-flat':
            // §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) — the two reasons say DIFFERENT things.
            if (t.reason === 'tileset-unavailable') {
                return `[CesiumViewport][terrain] §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) ${where}`
                    + ` — flat ground, but NOT because this site has no relief. ${describeMissingTilesets(t.tried)}`;
            }
            if (t.reason === 'no-baked-city') {
                return `[CesiumViewport][terrain] skip: no-baked-city (${where}) — flat ground: NO baked terrain tileset`
                    + ` covers this point in any coverage table, so the ellipsoid IS the correct ground here.`
                    + ` This is an honest EMPTY, not a failure — nothing is missing and nothing needs publishing.`;
            }
            return `[CesiumViewport][terrain] skip: ${t.reason} (${where}) — flat ground: no tileset attached, the ellipsoid is the ground.`;
        case 'keep-attached':
            return `[CesiumViewport][terrain] skip: '${t.city}' already attached and serves ${where}.`;
        case 'detach':
            // §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) — the world-framing detach has a DIFFERENT
            // reason and must not borrow L-12913's sentence. The tileset's bounds DO cover the site;
            // it is the CAMERA that left. Saying "bounds do not cover this site" here would be a
            // false statement in a log, which is the class of defect §TERRAIN-RELOCATION-DETACH was
            // itself created to remove (C84 EI-6).
            if (t.reason === 'world-framing') {
                return `[CesiumViewport][terrain] §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) the camera is framed on the WHOLE EARTH while '${t.stale ?? 'an untracked'}' city tileset is attached. Its bounds cover the site perfectly well — but a bounded quantized-mesh provider declares availability ONLY inside them, so at world range Cesium draws one or two level-0 roots and nothing else (the beige shard). Detaching → flat ellipsoid + global imagery; the city tileset re-attaches when the camera returns to the site.`;
            }
            // §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) — same split on the DETACH leg. The L-12913
            // sentence blames the stale tileset's BOUNDS, which is a false statement when the real
            // fact is that every candidate for the NEW site 404'd. Detaching is right either way;
            // saying the wrong reason is what makes the next reader spend a day on the wrong file.
            if (t.reason === 'tileset-unavailable') {
                return `[CesiumViewport][terrain] §TERRAIN-SLUG-RESOLVES-TO-NOTHING (L-13170) ${where}`
                    + ` — detaching '${t.stale ?? 'an untracked'}' tileset (it covers somewhere else) → flat ellipsoid.`
                    + ` ${describeMissingTilesets(t.tried)}`;
            }
            return `[CesiumViewport][terrain] §TERRAIN-RELOCATION-DETACH (L-12913) ${t.reason} at ${where} while '${t.stale ?? 'an untracked'}' tileset is attached — its layer.json bounds do not cover this site, and a bounded provider renders NO tiles outside them (the white ground). Detaching → flat ellipsoid.`;
        case 'attach':
            // §TERRAIN-SLUG-SCOPE (L-13170) — `slug=… scope=…`, never `city=<a region>`. The founder's
            // trace read `→ city=gccstates`; `gccstates` is a REGION, and printing it under the word
            // "city" is what made a missing-tileset defect look like a namespace error. It was not.
            return `[CesiumViewport][terrain] evaluate ${where} → slug=${t.city} scope=${t.scope}`
                + (t.candidates.length > 1 ? ` (fallbacks: ${t.candidates.slice(1).join(', ')})` : '')
                + (t.replaces ? ` — replaces '${t.replaces}'` : '');
    }
}
