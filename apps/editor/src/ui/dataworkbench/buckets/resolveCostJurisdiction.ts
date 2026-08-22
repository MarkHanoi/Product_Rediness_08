// §REGIONAL-COST-ESTIMATE (L-4832, lane MEDI14, 2026-08-22) — THE ONE PLACE
// GEOGRAPHY BECOMES A COST JURISDICTION.
//
// ⭐ THIS FILE MINTS NO RESOLVER, AND THAT IS THE ENTIRE POINT OF ITS EXISTENCE.
// It calls `resolveRegisteredJurisdictionAt(lat, lon)` — the SAME
// §JURISDICTION-SPECIFICITY resolver the zoning/envelope dispatch and the
// habitability binding already use, with its finest-claim-wins rule and its
// explicit `'ambiguous'` arm that REFUSES rather than picking. A "quick lat/lon →
// country" helper here would have been a SECOND country resolver, which is the
// defect this repo keeps paying for (ADR-0352 §4, C60 §2).
//
// It is deliberately a near-copy of `apps/editor/src/ui/apartment-layout/
// resolveHabitabilityBinding.ts`. That is CO-LIVING, not duplication (C84 §3.5):
// the two answer different questions of the same resolver and neither imports the
// other's vocabulary. If a third appears, THAT is the moment to extract one
// shared `resolveJurisdictionBinding()` — not before, because two callers is not
// yet a pattern and a premature shared type would couple the layout engine's
// purity rules to the cost model's.
//
// WHY THE BINDING IS BUILT HERE AND NOT INSIDE `RegionalRates.ts`
// ══════════════════════════════════════════════════════════════════════════════
// `@pryzm/core-app-model` (L2) is a read model. Importing `@pryzm/site-parcel-data`
// into it would drag 40+ zoning rule packs and OpenTelemetry into the quantity
// engine. `apps/editor` (L7) already depends on both, so the string coupling is
// resolved here, at the composition surface.
//
// ⛔ THE REFUSAL ARMS ARE LOAD-BEARING. `'none'` (nothing claims this point) and
// `'ambiguous'` (two registrations tie) are DIFFERENT FACTS and both are carried,
// because the sentence the panel prints reads differently for each. Neither falls
// through to a neighbouring region: a rate from the wrong market is a wrong
// number, not an approximate one, and it is discovered at tender by the person
// who lost money on it.

import { resolveRegisteredJurisdictionAt } from '@pryzm/site-parcel-data';
import type { CostJurisdictionBinding } from '@pryzm/core-app-model';
import { getCurrentSiteOrigin } from '../../site/siteDispatch';

/**
 * ⚠ THE COUNTRY CODE IS TAKEN FROM THE REGISTRATION, NEVER DERIVED FROM THE
 * POINT. A bbox cannot follow a national border, so inferring "this longitude is
 * Spain" here would re-create in a second place an error the registry already
 * documents. When no registration claims the point there is no country, and the
 * binding says so.
 */
export function resolveCostJurisdictionAt(
    lat: number | null | undefined,
    lon: number | null | undefined,
): CostJurisdictionBinding {
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
            // ⛔ NOT DERIVED. PRYZM has no point→region resolver and this file will
            // not become one. A regional price base declares the municipal
            // jurisdiction ids it covers as DATA, so the `jurisdiction` rung
            // reaches it without a second geography lookup.
            regionKey: null,
            resolution: 'resolved',
        };
    }
    return {
        jurisdictionId: null,
        countryCode: null,
        regionKey: null,
        resolution: claim.kind === 'ambiguous' ? 'ambiguous' : 'none',
    };
}

/**
 * The binding for THE CURRENT PROJECT, from the same pinned LTP-ENU origin the
 * site latitude and the habitability binding read.
 *
 * ⛔ WRAPPED IN try/catch AND FALLING BACK TO `'not-asked'`. The 5D panel must
 * render even when the site subsystem is not loaded — and "PRYZM does not know
 * where this is" is a shippable answer, whereas a panel that throws is not. The
 * fallback is the REFUSING arm, never a default country.
 */
export function currentCostJurisdiction(): CostJurisdictionBinding {
    try {
        const origin = getCurrentSiteOrigin();
        return resolveCostJurisdictionAt(origin?.lat, origin?.lon);
    } catch {
        return { jurisdictionId: null, countryCode: null, regionKey: null, resolution: 'not-asked' };
    }
}

/** One line for the console, in the shape of the §JURISDICTION-DIAG log the
 *  founder already reads. An invisible refusal is how a wrong default survives. */
export function costJurisdictionDiagLine(b: CostJurisdictionBinding): string {
    return (
        `[Mediciones/5D] §COST-JURISDICTION-DIAG resolution=${b.resolution} ` +
        `jurisdiction=${b.jurisdictionId ?? 'NONE'} country=${b.countryCode ?? 'NONE'} ` +
        '(PRYZM ships NO rate book for any jurisdiction today — see RegionalRates.ts.)'
    );
}
