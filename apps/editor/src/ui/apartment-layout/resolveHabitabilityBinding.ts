// §HABITABILITY-MINIMA-ARE-JURISDICTIONAL (L-4411, lane JURIS11, 2026-08-22) —
// THE ONE PLACE GEOGRAPHY BECOMES A HABITABILITY JURISDICTION.
//
// ⭐ THIS FILE MINTS NO RESOLVER. It calls `resolveRegisteredJurisdictionAt(lat, lon)`
// — the SAME §JURISDICTION-SPECIFICITY resolver the zoning/envelope dispatch already
// uses, with its finest-claim-wins rule and its explicit `'ambiguous'` arm that
// REFUSES rather than picking. Minting a second country resolver is the defect this
// repo keeps paying for (ADR-0352 §4, C60 §2), and it is exactly what a
// "quick lat/lon → country" helper here would have been.
//
// WHY THE BINDING IS BUILT HERE AND NOT INSIDE THE LAYOUT ENGINE
// ══════════════════════════════════════════════════════════════════════════════════
// `@pryzm/ai-host`'s habitability module is PURE DATA keyed by plain strings. Importing
// `@pryzm/site-parcel-data` into it would drag 40+ zoning rule packs and OpenTelemetry
// into the layout engine and break the purity `programRules.ts` declares. `apps/editor`
// (L7) already depends on BOTH packages, so the string coupling is resolved here, at
// the composition surface — and it is GATED, not hoped: `habitabilityJurisdictionIds
// .test.ts` asserts every jurisdiction key the habitability registry declares is a real
// registered `jurisdictionId`, so the two vocabularies cannot drift silently.
//
// ⛔ THE REFUSAL ARMS ARE THE POINT. `'none'` (no registration claims this point) and
// `'ambiguous'` (two registrations tie) both produce a binding with a NULL
// jurisdictionId — which resolves to the ONE named PRYZM baseline and SAYS SO. They do
// NOT fall through to a neighbouring country, and they do NOT silently keep the UK
// numbers that started this (L-4210). "PRYZM does not know where this is" is a
// shippable answer; a confident answer under the wrong ordinance is not.

import { resolveRegisteredJurisdictionAt } from '@pryzm/site-parcel-data';
import type { HabitabilityBinding } from '@pryzm/ai-host';

/**
 * ⚠ THE COUNTRY CODE IS TAKEN FROM THE REGISTRATION, NEVER DERIVED FROM THE POINT.
 * A bbox cannot follow a national border (the registry's own §EXTENT-SPILLS-A-BORDER
 * note measures exactly which foreign cities the national boxes swallow), so inferring
 * "this longitude is Spain" here would re-create that error in a second place. When no
 * registration claims the point there is no country, and the binding says so.
 */
export function resolveHabitabilityBinding(
    lat: number | null | undefined,
    lon: number | null | undefined,
): HabitabilityBinding {
    if (
        typeof lat !== 'number' || typeof lon !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lon) ||
        (lat === 0 && lon === 0)   // the unpinned-origin sentinel the editor uses elsewhere
    ) {
        return { jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'not-asked' };
    }
    const claim = resolveRegisteredJurisdictionAt(lat, lon);
    if (claim.kind === 'resolved') {
        return {
            jurisdictionId: claim.jurisdiction.jurisdictionId,
            countryCode: (claim.jurisdiction.countryCode || '').toLowerCase() || null,
            // ⛔ NOT DERIVED. PRYZM has no point→region resolver and this file will not
            // become one. A regional habitability instrument declares the municipal
            // jurisdiction ids it governs as DATA (see ES_CATALUNYA_DECRET_141_2012),
            // so the `jurisdiction` rung of the ladder reaches it without a second
            // geography lookup. `regionKey` stays null until a caller can name one
            // from a real source rather than by guessing.
            regionKey: null,
            resolution: 'resolved',
        };
    }
    // 'none' and 'ambiguous' are DIFFERENT facts and both are carried, because the
    // refusal sentence reads differently for "we cover nothing here" than for "two
    // ordinances tie and PRYZM will not guess which governs you".
    return {
        jurisdictionId: null,
        countryCode: null,
        regionKey: null,
        resolution: claim.kind === 'ambiguous' ? 'ambiguous' : 'none',
    };
}

/**
 * One line for the console, in the shape of the existing `§JURISDICTION-DIAG` log the
 * founder already reads. A binding that resolves to the baseline must be VISIBLE — an
 * invisible fallback is how a foreign minimum survived a year in this product.
 */
export function habitabilityDiagLine(b: HabitabilityBinding): string {
    return (
        `[layout] §HABITABILITY-DIAG resolution=${b.resolution} ` +
        `jurisdiction=${b.jurisdictionId ?? 'NONE'} country=${b.countryCode ?? 'NONE'} ` +
        `(NONE ⇒ the PRYZM baseline applies and is labelled as a default, not a regulation).`
    );
}
