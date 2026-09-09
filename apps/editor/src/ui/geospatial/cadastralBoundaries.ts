// §CADASTRAL-BOUNDARIES-FETCH (C57 §5.5.4, lane CADASTRAL-COVERAGE 2026-09-09) — THE ONE fetch for
// the boundary-lines overlay: scope-bound, cached, and de-duplicated in flight.
//
// ⛔ BOUND TO THE SCOPE, NEVER TO THE CAMERA — AND THAT IS A CORRECTNESS DECISION, NOT A BUDGET ONE.
// -----------------------------------------------------------------------------------------------
// Neither viewport exposes a visible-rectangle API, and one must not be added for this. Panning is
// continuous; a camera-bound fetch would re-ask a foreign government WFS on every frame of a drag,
// which is precisely the shape of [[context-one-read-per-bbox]] (context measured being read 2–3×
// per bbox and then cancelled). The SITE SCOPE is the unit every other context layer is budgeted
// in, it changes only when the user changes it, and it is what the user means by "around my plot".
//
// ⛔ AND BOUNDED BY A MEASURED CEILING, BECAUSE THE SCOPE ALONE WOULD BE CATASTROPHIC. The default
// scope radius is 1781 m (`CTX_SCOPE_READ_COMPLETE_CEILING_M`). Passing that through unbounded to
// PDOK would ask for tens of thousands of Dutch parcels. See `cadastralBoundariesRadiusM`.

import { trace } from '@opentelemetry/api';
import type { ParcelAreaOutcome, ParcelFeature } from '../site/parcel/ParcelProvider.js';
import { defaultParcelProvider } from '../site/parcel/index.js';
import {
    setCadastralBoundariesVerdict,
    getCadastralBoundariesEnabled,
} from '../site/cadastralBoundariesLayer.js';
import {
    scopeOuterRadiusM,
    DEFAULT_SITE_CONTEXT_SCOPE,
    type SiteContextScope,
} from './contextExtentBudget.js';

const _tracer = trace.getTracer('pryzm.site');

/**
 * ⭐ THE CEILING, AND IT IS SET FROM A MEASUREMENT RATHER THAN FROM TASTE.
 *
 * MEASURED 2026-09-09 against PDOK NL `kadastralekaart:Perceel` — the densest of the four wired
 * cadastres, and therefore the one that sizes the ceiling for all of them:
 *   ±0.0005° (~±55 m)  →   35 parcels /  94 KB
 *   ±0.001°  (~±110 m) →   94 parcels / 195 KB
 *   ±0.002°  (~±220 m) →  435 parcels / 804 KB
 * Spain measured 120 parcels / 277 KB and France 96 at the ±220 m box; Denmark 34 at 150 m.
 *
 * 220 m is the last reading where the payload is still sub-megabyte on the worst case AND the
 * parcel count stays inside what Cesium can carry as individual polylines beside the existing
 * ground layers. It is the measurement, not a round number chosen first and justified after.
 *
 * ⚠ RAISING THIS REQUIRES A NEW MEASUREMENT, not an argument. The curve is super-linear in area:
 * doubling the radius roughly quadruples both numbers.
 */
export const CADASTRAL_BOUNDARIES_RADIUS_CEILING_M = 220;

/**
 * The overlay's radius for a scope — `min(scope, ceiling)`, the shape `streetLifeRadiusM` already
 * uses in `contextExtentBudget.ts` ("one number, five derived answers").
 *
 * ⚠ IT LIVES HERE AND NOT IN `contextExtentBudget.ts` FOR ONE REASON, STATED SO IT IS A DECISION
 * AND NOT AN OVERSIGHT: every radius in that module budgets a BAKED R2 CONTEXT TILE READ, and they
 * are tuned against tile fan-out (`scopeReadFanOutCap`, `CTX_SCOPE_READ_MAX_TILES_AREA`). This one
 * budgets a LIVE request to a foreign government register, whose cost curve is unrelated to tiles
 * and whose ceiling is justified by the payload table above. Putting it beside the tile radii would
 * invite it to be re-tuned by tile reasoning. It still imports `scopeOuterRadiusM` so the SCOPE
 * half of the answer has exactly one owner.
 */
export function cadastralBoundariesRadiusM(
    scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE,
): number {
    return Math.min(scopeOuterRadiusM(scope), CADASTRAL_BOUNDARIES_RADIUS_CEILING_M);
}

/** What a surface draws. Empty is a legitimate answer — the VERDICT says whether it is a finding. */
export interface CadastralBoundarySet {
    readonly parcels: ReadonlyArray<ParcelFeature>;
    readonly truncated: boolean;
    /** The centre the set was fetched about, so a surface can tell a stale set from a current one. */
    readonly lat: number;
    readonly lon: number;
    readonly radiusM: number;
}

/**
 * The last successfully-fetched set, or null when the last query did not produce one. Surfaces
 * read this on notify rather than being pushed a payload, exactly like the highlight store: one
 * owner of the DATA as well as of the flag.
 */
let current: CadastralBoundarySet | null = null;

export function getCadastralBoundarySet(): CadastralBoundarySet | null {
    return current;
}

/** Test-only reset for the fetched set + its caches. */
export function __resetCadastralBoundaryFetchForTests(): void {
    current = null;
    _cache.clear();
    _inFlight.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache + in-flight de-duplication — the `contextBuildings.ts` shape
// ─────────────────────────────────────────────────────────────────────────────
//
// ⛔ THE IN-FLIGHT MAP IS NOT AN OPTIMISATION, IT IS THE FIX FOR A SHIPPED DEFECT. Two surfaces
// subscribe to one flag; both will react in the same tick when it flips, and both will ask for the
// same box. Without this, that is two hits on a shared public register per toggle — the exact
// "context read 2–3× per bbox and cancelled" defect, reproduced at a new site.

interface CacheRow {
    readonly at: number;
    readonly outcome: ParcelAreaOutcome;
}

const _cache = new Map<string, CacheRow>();
const _inFlight = new Map<string, Promise<ParcelAreaOutcome>>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;

/**
 * The cache key. Rounded to ~11 m in each axis and to the metre in radius, so a scope nudge or a
 * float wobble in the parcel centroid does not mint a new government request.
 */
function keyFor(lat: number, lon: number, radiusM: number): string {
    return `${lat.toFixed(4)},${lon.toFixed(4)},${Math.round(radiusM)}`;
}

/**
 * ⭐ THE ONE FETCH. Asks `defaultParcelProvider` — the routing REGISTRY, so the right national
 * cadastre answers and an unwired country says `unsupported` rather than drawing nothing.
 *
 * Writes the verdict into the ONE OWNER as it goes (`loading` → the outcome), so both chips
 * describe the same query with the same sentence. Never throws.
 *
 * ⛔ AN `unsupported` OR `unreachable` ANSWER CLEARS THE DRAWN SET. Leaving the previous country's
 * boundaries on screen under a "this cadastre publishes no boundary query" sentence would be worse
 * than either — the user would be looking at real lines from the wrong place.
 */
export async function refreshCadastralBoundaries(
    lat: number,
    lon: number,
    scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE,
): Promise<ParcelAreaOutcome> {
    const span = _tracer.startSpan('pryzm.site.refreshCadastralBoundaries');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            const outcome: ParcelAreaOutcome = {
                status: 'unreachable',
                reason: 'PRYZM has no plot location to look up parcel boundaries around yet.',
            };
            setCadastralBoundariesVerdict({ kind: 'unreachable', reason: outcome.reason });
            return outcome;
        }
        const radiusM = cadastralBoundariesRadiusM(scope);
        const key = keyFor(lat, lon, radiusM);
        span.setAttribute('pryzm.cadastralBoundaries.radiusM', radiusM);

        const hit = _cache.get(key);
        if (hit && Date.now() - hit.at <= CACHE_TTL_MS) {
            span.setAttribute('pryzm.cadastralBoundaries.cache', 'hit');
            applyOutcome(hit.outcome, lat, lon, radiusM);
            return hit.outcome;
        }
        if (hit) _cache.delete(key);

        const pending = _inFlight.get(key);
        if (pending) {
            span.setAttribute('pryzm.cadastralBoundaries.cache', 'joined-in-flight');
            return pending;
        }

        setCadastralBoundariesVerdict({ kind: 'loading' });
        const run = (async (): Promise<ParcelAreaOutcome> => {
            let outcome: ParcelAreaOutcome;
            try {
                outcome = await defaultParcelProvider.fetchParcelsInArea(lon, lat, radiusM);
            } catch (err) {
                // The interface says never throws; a provider that does anyway must not be read as
                // an empty area.
                outcome = {
                    status: 'unreachable',
                    reason: `The parcel boundary lookup failed: ${String(err)}`,
                };
            }
            // ⛔ AN OUTAGE IS NEVER CACHED. It is a statement about this moment, not about the land
            // (§UPSTREAM-UNREACHABLE-IS-NOT-A-MISS). `unsupported` IS cached: it is durable.
            if (outcome.status !== 'unreachable') {
                if (_cache.size >= CACHE_MAX) {
                    const oldest = _cache.keys().next();
                    if (!oldest.done) _cache.delete(oldest.value);
                }
                _cache.set(key, { at: Date.now(), outcome });
            }
            applyOutcome(outcome, lat, lon, radiusM);
            return outcome;
        })().finally(() => {
            _inFlight.delete(key);
        });
        _inFlight.set(key, run);
        return run;
    } finally {
        span.end();
    }
}

/** Push an outcome into the one owner + the drawn set. */
function applyOutcome(
    outcome: ParcelAreaOutcome,
    lat: number,
    lon: number,
    radiusM: number,
): void {
    if (outcome.status === 'ok') {
        current = { parcels: outcome.parcels, truncated: outcome.truncated, lat, lon, radiusM };
        // The attribution is the register the parcels themselves name (C57 §1.9) — read off the
        // data rather than guessed from the click, so a border fallback cannot mislabel it.
        const sourceLabel = outcome.parcels.length > 0 ? (outcome.parcels[0]!.source ?? null) : null;
        setCadastralBoundariesVerdict({
            kind: 'ok',
            count: outcome.parcels.length,
            truncated: outcome.truncated,
            sourceLabel,
        });
        console.log(
            `[gis] cadastral-boundaries: ${outcome.parcels.length} parcel(s) within ${radiusM} m `
            + `of ${lat.toFixed(5)},${lon.toFixed(5)}${outcome.truncated ? ' (TRUNCATED)' : ''}.`,
        );
        return;
    }
    current = null;
    setCadastralBoundariesVerdict(
        outcome.status === 'unsupported'
            ? { kind: 'unsupported', reason: outcome.reason }
            : { kind: 'unreachable', reason: outcome.reason },
    );
    console.warn(`[gis] cadastral-boundaries: ${outcome.status} — ${outcome.reason}`);
}

/**
 * The convenience a surface calls when the plot or the scope changed: refresh only if the overlay
 * is actually ON. ⛔ The flag is read from the ONE OWNER, never from a surface-local copy — a
 * surface that cached its own boolean is the defect `cadastralBoundariesLayer.ts` exists to prevent.
 */
export async function refreshCadastralBoundariesIfEnabled(
    lat: number,
    lon: number,
    scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE,
): Promise<void> {
    if (!getCadastralBoundariesEnabled()) return;
    await refreshCadastralBoundaries(lat, lon, scope);
}
