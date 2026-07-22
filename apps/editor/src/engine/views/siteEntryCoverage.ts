// §FEAT-SITE-ENTRY-GLOBE (L-593, C60 §2) — the ONE bridge between the shipping
// rule-pack registry and the site-entry globe's coverage layer.
//
// THIS FILE IS DELIBERATELY TRIVIAL, AND THAT IS THE POINT.
// -----------------------------------------------------------------------------------
// The failure mode C60 §2 exists to prevent is a hand-maintained coverage polygon that
// LOOKS right and drifts from what the engine can actually do — invisibly, because
// nothing compares the two. So there is exactly one adapter, it contains no data, no
// coordinates, no city names and no conditionals, and every field it forwards is read
// live from `listJurisdictionCoverage()`:
//
//   • the extent IS `BARCELONA_BBOX`, the constant `siteDispatch.ts` routes on;
//   • `contains` IS `isInBarcelona`, the predicate `siteDispatch.ts` calls;
//   • `packZoneCodes` IS `packsByZone.keys()`, read at call time.
//
// ⇒ It is not possible for the globe to light a place the dispatcher would refuse to
// route into, or to stay dark where it would. Registering Madrid lights Madrid with no
// edit here. **If you find yourself adding a literal to this file, you are re-creating
// the drift.**
//
// PURITY: a projection + a `map`. No DOM, no Cesium, no I/O beyond the module import.
// P8 span-exempt on the same basis as the pure decision modules it feeds.

import { listJurisdictionCoverage } from '@pryzm/site-parcel-data';
import type { CoverageEntry } from './siteEntryModel';

/**
 * Every jurisdiction PRYZM can currently answer in, in the shape the pure entry model
 * consumes. **The only legal production source of `CoverageEntry[]`** (C60 §2).
 *
 * Returns `[]` when nothing is registered — an entirely dark honest globe, which is the
 * correct rendering of "we cannot answer anywhere", not a fault to paper over.
 */
export function siteEntryCoverageEntries(): readonly CoverageEntry[] {
    return listJurisdictionCoverage().map(
        (c): CoverageEntry => ({
            jurisdictionId: c.jurisdictionId,
            displayName: c.displayName,
            countryCode: c.countryCode,
            countryName: c.countryName,
            extent: c.extent,
            contains: c.contains,
            answerSummary: c.answerSummary,
            packZoneCodes: c.packZoneCodes,
        }),
    );
}
