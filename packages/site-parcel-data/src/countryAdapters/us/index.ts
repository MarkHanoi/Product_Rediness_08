// LANE US-EXPAND — THE US COUNTRY ADAPTER (parcel-only), the sibling of ee/ and dk/ for the US.
//
// UNLIKE ee/dk THIS IS PARCEL-ONLY BY DESIGN. The EE/DK adapters assemble the full §J site-intel
// chain (parcel → buildings → plan → rules → vocabulary) because those countries have a national
// plan register with a machine-readable rule taxonomy. The US has NEITHER a national cadastre NOR a
// national zone taxonomy (`jurisdictions/us/USA.md`), and bulk/height are governed by per-municipal
// zoning ordinances that no open point service serves — so the honest US deliverable is GEOMETRY +
// IDENTITY, exactly the SF/Chicago/NYC shape. Zoning/FAR/height are NEVER inferred here (C58 §1.4).
//
// The whole adapter is ONE shared ArcGIS client (`usArcgisParcelClient.ts`) parameterised by four
// per-jurisdiction configs (`usJurisdiction.ts`): MassGIS statewide (US-MA), FDOR statewide (US-FL),
// King County (US-WA-KING), Harris County / HCAD (US-TX-HARRIS). DRY without hiding provenance — each
// jurisdiction's endpoint, CRS, id field and live-probe verdict is a legible DATA row.

export * from './usArcgisParcelClient.js';
export * from './usJurisdiction.js';
// LANE USA-PARCELS (2026-09-06) — SEVEN more STATES (NC · NY · OH · WI · MT · UT · VA) and TWO more
// COUNTIES (LA County CA · Maricopa AZ), all on the SAME shared client, plus `USA_PARCEL_REFUSALS`:
// the states this lane REACHED and could not wire, each carrying its verbatim HTTP answer. A refusal
// that is not enumerated is indistinguishable from a state nobody looked at.
export * from './usStatewideParcels.js';
// LANE USA-PARCELS · WAVE 2 (2026-09-06) — FIVE more whole STATES (NJ · VT · CT · IN · MD), all
// measured CLEAN against their own county/town denominators (21/21 · 256 towns · 169/169 · 92/92 ·
// 24/24). TWO of them — NJ and MD — OVERTURN a `USA_PARCEL_REFUSALS` row written earlier the same
// day whose probe had named the WRONG HOST; the file header carries that correction in full.
export * from './usStatewideParcelsWave2.js';
// LANE USA-DELAWARE-DEMO (2026-09-09) — DELAWARE, the 22nd US row and the Mid-Atlantic hole between
// US-MD, US-NJ and US-VA. Full statewide coverage (3 of 3 counties, 451,344 parcels, and the county
// COUNTY counts sum EXACTLY to the total). Its evidence is about a WAF-blocked county server and a
// test-vs-production hostname, so it keeps its own file; see the header there.
export * from './usDelawareParcels.js';

import { US_EXPAND_PARCEL_CONFIGS } from './usJurisdiction.js';
import { USA_PARCELS_CONFIGS } from './usStatewideParcels.js';
import { USA_PARCELS_WAVE2_CONFIGS } from './usStatewideParcelsWave2.js';
import { USA_PARCELS_DELAWARE_CONFIGS } from './usDelawareParcels.js';
import type { UsArcgisParcelConfig } from './usArcgisParcelClient.js';

/**
 * EVERY US ArcGIS parcel jurisdiction config, across all three waves — the union callers want when
 * asking "how far does a US parcel click reach?".
 *
 * ⚠ THIS CONSTANT WAS A PHANTOM CITATION UNTIL 2026-09-06. `usStatewideParcels.ts` documented it as
 * living "in `index.ts`" and nothing here defined it, so the reference resolved to nothing — the
 * same defect class `check-contract-cited-paths.ts` exists to catch in the contracts, met in source.
 * It is DEFINED now rather than deleted, because the union is genuinely the thing coverage callers
 * need and two files already told readers to look for it here.
 *
 * ⛔ This is the parcel GEOMETRY+IDENTITY ladder only. It is NOT a US zoning or envelope surface:
 * US bulk, FAR and height are municipal ordinance and no row in it emits any of them (C58 §1.4).
 */
export const US_ALL_PARCEL_CONFIGS: readonly UsArcgisParcelConfig[] = [
    ...US_EXPAND_PARCEL_CONFIGS,
    ...USA_PARCELS_CONFIGS,
    ...USA_PARCELS_WAVE2_CONFIGS,
    ...USA_PARCELS_DELAWARE_CONFIGS,
];
