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
import type { TerrainAttachDecision } from './terrainCoverage';

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

/** The resolver's verdict, or the attach chain's own "nothing loaded" verdict. */
export type TerrainTransitionInput =
    | TerrainAttachDecision
    | { readonly attach: false; readonly reason: 'tileset-unavailable' };

export type TerrainTransition =
    /** Nothing attached, nothing to attach → the ellipsoid IS the ground. The ONLY case where
     *  "flat ground" may be logged. */
    | { readonly action: 'keep-flat'; readonly reason: TerrainFlatReason }
    /** A tileset that serves this site is already attached — idempotent, no churn. */
    | { readonly action: 'keep-attached'; readonly city: string }
    /** A bounded tileset is attached but does NOT serve this site → revert to the ellipsoid. */
    | { readonly action: 'detach'; readonly reason: TerrainFlatReason; readonly stale: string | null }
    /** Attach `city` (trying `candidates` most-detailed-first); `replaces` names the tileset
     *  currently attached that will be superseded, or `null` when the ground is flat today. */
    | { readonly action: 'attach'; readonly city: string; readonly candidates: readonly string[]; readonly replaces: string | null };

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
        return holdsSomething
            ? { action: 'detach', reason: decision.reason, stale: state.attachedCity }
            : { action: 'keep-flat', reason: decision.reason };
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
 * The console line for a transition. Pure so the honesty rule is testable: the words
 * "flat ground" appear ONLY on `keep-flat` — never while a bounded provider is attached
 * (the old `skip: no-baked-city … → flat ground` line was false in exactly that state).
 */
export function describeTerrainTransition(t: TerrainTransition, lat: number, lon: number): string {
    const where = `lat=${lat.toFixed(5)} lon=${lon.toFixed(5)}`;
    switch (t.action) {
        case 'keep-flat':
            return `[CesiumViewport][terrain] skip: ${t.reason} (${where}) — flat ground: no tileset attached, the ellipsoid is the ground.`;
        case 'keep-attached':
            return `[CesiumViewport][terrain] skip: '${t.city}' already attached and serves ${where}.`;
        case 'detach':
            return `[CesiumViewport][terrain] §TERRAIN-RELOCATION-DETACH (L-12913) ${t.reason} at ${where} while '${t.stale ?? 'an untracked'}' tileset is attached — its layer.json bounds do not cover this site, and a bounded provider renders NO tiles outside them (the white ground). Detaching → flat ellipsoid.`;
        case 'attach':
            return `[CesiumViewport][terrain] evaluate ${where} → city=${t.city}`
                + (t.candidates.length > 1 ? ` (fallbacks: ${t.candidates.slice(1).join(', ')})` : '')
                + (t.replaces ? ` — replaces '${t.replaces}'` : '');
    }
}
